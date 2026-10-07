import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
// Type-only namespace imports so the `importOriginal<...>()` type arguments below
// name a regular type import rather than an inline `import()` annotation
// (typescript/consistent-type-imports). Both are erased at compile time, so
// neither adds a runtime import that could race the `vi.mock` hoisting.
import type * as CryptoModule from "node:crypto";
import type * as FsPromisesModule from "node:fs/promises";
import type * as LockfileModule from "proper-lockfile";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  atomicWriteFile,
  resetCrossProcessLocking,
  resolveNonClobberingBakPath,
  sweepOrphanTmpFiles,
} from "../../src/merge/atomicWrite.ts";
import {
  hasManagedBlock,
  insertManagedBlock,
  wrapInManagedBlock,
} from "../../src/merge/managedBlocks.ts";
import { OWNED_PATHS } from "../../src/manifest/ownedPaths.ts";
import { sweepReclaimCandidates } from "../../src/merge/reclaim.ts";
import { predictDenyRefusal, safeWriteFile } from "../../src/merge/safeWrite.ts";
import type { ReclaimCandidate } from "../../src/manifest/ledger.ts";
import { EngineError } from "../../src/types/errors.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Fault-injection lane for the `src/merge/` core: the recovery branches whose
 * trigger is a filesystem, lock, or entropy outcome a caller cannot stage on a
 * real disk deterministically (an `unlink` that loses a race, a `readFile` that
 * fails with a permission errno after `lstat` already succeeded, a `.bak` name
 * that collides, a lock release that fails after the bytes landed), plus the
 * pure-input edges the behavioural suites had no reason to reach.
 *
 * Existing suites are untouched; nothing here weakens or replaces an assertion
 * they already make. Each `describe` names the single branch it closes so a
 * later reader can tell why the case exists at all.
 *
 * `node:fs/promises`, `node:crypto`, and `proper-lockfile` are WRAPPED, not
 * replaced: with an empty fault queue every call is the real implementation, so
 * the temp-directory harness and the un-faulted half of each test still run
 * against a real disk and a real advisory lock.
 */

/** One armed outcome for the next matching call of `fn`. Consumed on match. */
interface Fault {
  fn: string;
  /** Substring the first (path) argument must contain; omitted matches any. */
  match?: string;
  /**
   * Matching calls to let through to the real implementation before this fault
   * fires. The TOCTOU re-checks read the SAME path twice — pin then verify —
   * so targeting the second read is the only way to state "the tree moved in
   * between" without also breaking the first read the gate depends on.
   */
  skip?: number;
  reject?: unknown;
  /** Present (even holding `undefined`) means resolve with this value instead. */
  resolve?: unknown;
  /**
   * Keeps the fault armed for every later matching call instead of spending it
   * on the first.
   *
   * A one-shot fault states "the call lost a race once", and a caller that
   * retries simply outlives it: the queue is empty by the second attempt, the
   * real implementation runs, and the operation the test says was refused
   * quietly lands. Persisting states the other condition — another process
   * holds the name for longer than the caller's whole retry budget, so the
   * refusal is still there on the last attempt. Cleared with the queue in
   * `afterEach`, so a persistent fault cannot outlive its test.
   */
  persists?: boolean;
  /** Matching calls this fault has answered. The interceptor keeps it so a test
   *  can assert a persistent fault outlasted an entire retry schedule. */
  fired?: number;
}

const faults = vi.hoisted(() => ({ queue: [] as Fault[] }));
const entropy = vi.hoisted(() => ({ hex: [] as string[] }));
const releaseFault = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromisesModule>();
  const intercepted = [
    "access",
    "lstat",
    "mkdir",
    "open",
    "readFile",
    "readdir",
    "realpath",
    "rename",
    "stat",
    "unlink",
  ] as const;
  const patched: Record<string, unknown> = { ...actual };
  for (const name of intercepted) {
    const original = Reflect.get(actual, name) as (...args: unknown[]) => Promise<unknown>;
    patched[name] = (...args: unknown[]): Promise<unknown> => {
      const target = typeof args[0] === "string" ? args[0] : "";
      const index = faults.queue.findIndex(
        (fault) => fault.fn === name && (fault.match === undefined || target.includes(fault.match)),
      );
      if (index === -1) return original(...args);
      const fault = faults.queue[index]!;
      if (fault.skip !== undefined && fault.skip > 0) {
        fault.skip -= 1;
        return original(...args);
      }
      fault.fired = (fault.fired ?? 0) + 1;
      if (fault.persists !== true) faults.queue.splice(index, 1);
      return "resolve" in fault ? Promise.resolve(fault.resolve) : Promise.reject(fault.reject);
    };
  }
  return patched;
});

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof CryptoModule>();
  return {
    ...actual,
    randomBytes: (size: number): Buffer => {
      const next = entropy.hex.shift();
      return next === undefined ? actual.randomBytes(size) : Buffer.from(next, "hex");
    },
  };
});

vi.mock("proper-lockfile", async (importOriginal) => {
  const actual = await importOriginal<typeof LockfileModule>();
  return {
    ...actual,
    // The real lock is taken and released; only the release's RESULT is faulted,
    // which is the shape the "never mask the write result" branch reacts to.
    lock: async (path: string, options?: unknown) => {
      const release = await actual.lock(path, options as never);
      return async (): Promise<void> => {
        await release();
        if (releaseFault.value !== null) {
          const thrown = releaseFault.value;
          releaseFault.value = null;
          throw thrown;
        }
      };
    },
  };
});

const tempDir = useTempDir("stamity-merge-gaps");

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`simulated ${code}`), { code });
}

/** Arms one fault; returns nothing so call sites read as setup, not as a value. */
function arm(fault: Fault): void {
  faults.queue.push(fault);
}

beforeEach(() => {
  faults.queue.length = 0;
  entropy.hex.length = 0;
  releaseFault.value = null;
  resetCrossProcessLocking();
});

afterEach(() => {
  faults.queue.length = 0;
  entropy.hex.length = 0;
  releaseFault.value = null;
  vi.restoreAllMocks();
});

/**
 * A ledger row the sweep may act on, shaped like the rows `reclaim` receives.
 *
 * TEST CHANGE, justified: REQ-PLUGIN-045 — the sweep refuses at gate 1 a row
 * outside the owned-path bound, which reads the row's type, so the helper
 * types a row the way a release records it at that path: `rule` under a
 * content folder, `infra` elsewhere (a state folder here).
 */
function candidate(path: string, contentHash?: string): ReclaimCandidate {
  return {
    entry: {
      path,
      adapter: "cursor",
      artifactId: `artifact:${path}`,
      artifactType: OWNED_PATHS.contentRoots.some((root) => path.startsWith(root)) ? "rule" : "infra",
      ...(contentHash === undefined ? {} : { contentHash }),
    },
    reason: "deselected",
  };
}

/**
 * TEST CHANGE, justified: REQ-PLUGIN-045 — the reclaim cases below used a
 * root-level `stamity-rule.md`, a path no release writes, which gate 1 now
 * refuses before any gate these cases target; the file sits in a rule folder
 * the engine writes. The faults still match on the basename.
 */
const RULE = ".cursor/rules/stamity-rule.md";
/** The block-less fixture body, and the hash its row records: an engine-named
 *  block-less file is deleted only beside a matching hash, so the cases that
 *  need the sweep to reach its delete step record it (REQ-PLUGIN-045). */
const CONTENT = "content\n";
const CONTENT_HASH = createHash("sha256").update(CONTENT).digest("hex");

// ── src/merge/atomicWrite.ts ───────────────────────────────────────────────

describe("atomicWrite: fileExists rethrows a non-ENOENT failure", () => {
  it("propagates the access() rejection instead of reporting the name as free", async () => {
    // A NUL byte fails node's own path validation (ERR_INVALID_ARG_VALUE), which
    // is neither ENOENT nor a code the "does it exist" probe may swallow.
    const path = `${tempDir().dir}/notes\0.md`;

    await expect(resolveNonClobberingBakPath(path)).rejects.toThrow();
  });
});

describe("atomicWrite: a rejection carrying neither an errno nor an Error shape", () => {
  it("still names the failure in the sweep diagnostic", async () => {
    const dir = tempDir().dir;
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    arm({ fn: "readdir", match: dir, reject: "the volume detached" });

    await expect(sweepOrphanTmpFiles(dir)).resolves.toEqual([]);

    expect(logged).toHaveBeenCalledWith(expect.stringContaining("the volume detached"));
  });
});

describe("atomicWrite: resolveNonClobberingBakPath redraws a colliding suffix", () => {
  it("skips a suffixed backup that already exists and returns the next free name", async () => {
    await tempDir().seedFiles({
      "notes.md": "original\n",
      "notes.md.bak": "first recovery\n",
      "notes.md.bak.aaaaaaaa": "second recovery\n",
    });
    entropy.hex.push("aaaaaaaa", "bbbbbbbb");
    const target = tempDir().path("notes.md");

    await expect(resolveNonClobberingBakPath(target)).resolves.toBe(`${target}.bak.bbbbbbbb`);
  });
});

describe("atomicWrite: the parent identity re-read failing outright before the rename", () => {
  it("refuses the write rather than renaming into a directory it can no longer identify", async () => {
    // The pin reads the parent once and the pre-rename check reads it again.
    // Faulting only the SECOND read is the "it is gone now" case, distinct from
    // the swap case (a read that succeeds with a different identity), which the
    // TOCTOU lane already covers.
    await mkdir(tempDir().path("pinned"), { recursive: true });
    arm({ fn: "stat", match: "pinned", skip: 1, reject: errno("ENOENT") });

    await expect(
      atomicWriteFile(tempDir().path("pinned", "landed.md"), "payload"),
    ).rejects.toMatchObject({ code: "FS_ERROR" });
  });
});

describe("atomicWrite: a parent directory the platform will not open for read", () => {
  it("pins it by path instead, so the write still lands", async () => {
    // Windows and some network mounts refuse to open a directory at all, as
    // does a directory that is writable but not readable. The descriptor pin is
    // an upgrade over the path read, not a new precondition: falling back keeps
    // a write that used to succeed succeeding. ENOENT is the one code that
    // still propagates, and the create-the-parent-and-retry path proves it.
    const dir = tempDir().path("unopenable");
    await mkdir(dir, { recursive: true });
    arm({ fn: "open", match: "unopenable", reject: errno("EACCES") });

    await atomicWriteFile(`${dir}/landed.md`, "payload");

    expect(await readFile(`${dir}/landed.md`, "utf8")).toBe("payload");
  });
});

// ── src/merge/managedBlocks.ts ─────────────────────────────────────────────

describe("managedBlocks: a BEGIN-like line with no separator before its stamp", () => {
  it("reads as prose, not as a marker", () => {
    const content = ["<!-- STAMITY:BEGINv1.0.0 -->", "body", "<!-- STAMITY:END -->", ""].join("\n");

    expect(hasManagedBlock(content, "AGENTS.md")).toBe(false);
    // The separated form over the same bytes IS a marker, so the separator is
    // the only difference the predicate reacted to.
    expect(hasManagedBlock(content.replace("BEGINv1.0.0", "BEGIN v1.0.0"), "AGENTS.md")).toBe(true);
  });
});

describe("managedBlocks: marker errors raised without a file path", () => {
  it("omits the location clause rather than naming an undefined file", () => {
    let message = "";
    try {
      insertManagedBlock("no markers here\n", "generated");
    } catch (err) {
      expect(err).toBeInstanceOf(EngineError);
      message = (err as Error).message;
    }

    expect(message).toContain("Managed block markers not found.");
    expect(message).not.toContain("undefined");
  });
});

// ── src/merge/reclaim.ts ───────────────────────────────────────────────────

describe("reclaim: a recorded path carrying a NUL byte", () => {
  it("refuses to resolve it against the repo root", async () => {
    const report = await sweepReclaimCandidates([candidate("stamity-rules/bad\0name.md")], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.entries[0]?.action).toBe("skipped-unsafe-path");
    expect(report.entries[0]?.detail).toContain("contains a NUL byte");
  });
});

describe("reclaim: the generated frontmatter stub above a block", () => {
  it("treats leading blank lines plus one complete fence as engine-authored", async () => {
    const block = wrapInManagedBlock("generated body", RULE);
    await tempDir().seedFiles({
      [RULE]: `\n\n---\ndescription: generated stub\n---\n\n${block}`,
    });

    const report = await sweepReclaimCandidates([candidate(RULE)], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.entries[0]?.action).toBe("deleted");
  });

  it("vetoes deletion when that fence is never closed", async () => {
    const block = wrapInManagedBlock("generated body", RULE);
    await tempDir().seedFiles({ [RULE]: `---\ndescription: unterminated\n${block}` });

    const report = await sweepReclaimCandidates([candidate(RULE)], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.entries[0]?.action).toBe("managed-block-stripped");
  });
});

describe("reclaim: a second row contributing the content hash for one path", () => {
  it("admits the hash the co-owner recorded", async () => {
    const body = "state file\n";
    // TEST CHANGE, justified: REQ-PLUGIN-045 — the state file moved from the
    // `.stamity/` root, where a hash no longer proves anything, into a state
    // folder the engine writes.
    await tempDir().seedFiles({ ".stamity/generated/state.json": body });
    const hash = createHash("sha256").update(Buffer.from(body)).digest("hex");

    const report = await sweepReclaimCandidates(
      // The first row records no hash, so only the second row's hash can prove
      // authorship — it has to survive the merge into the shared path group.
      [candidate(".stamity/generated/state.json"), candidate(".stamity/generated/state.json", hash)],
      { rootDir: tempDir().dir, consent: true },
    );

    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]?.action).toBe("deleted");
  });
});

describe("reclaim: the repo root rejecting with a non-Error value", () => {
  it("still raises an actionable VALIDATION_ERROR naming what came back", async () => {
    const root = tempDir().dir;
    arm({ fn: "realpath", match: root, reject: "root vanished" });

    await expect(
      sweepReclaimCandidates([candidate(RULE)], { rootDir: root, consent: true }),
    ).rejects.toThrow("root vanished");
  });
});

describe("reclaim: the parent directory failing to resolve for a reason other than absence", () => {
  it("skips the path as unsafe instead of reporting it as already gone", async () => {
    await tempDir().seedFiles({ ".cursor/rules/gapdir/stamity-rule.md": CONTENT });
    // The root resolves normally (its realpath call carries no `gapdir`), so
    // only the parent lookup is faulted — the ENOENT arm is a separate case
    // and stays covered by the "already gone" behaviour.
    arm({ fn: "realpath", match: "gapdir", reject: errno("EACCES") });

    const report = await sweepReclaimCandidates([candidate(".cursor/rules/gapdir/stamity-rule.md")], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.entries[0]?.action).toBe("skipped-unsafe-path");
    expect(report.entries[0]?.detail).toContain("parent directory could not be resolved");
    expect(report.entries[0]?.detail).toContain("simulated EACCES");
  });
});

describe("reclaim: inspection and read failures after the parent resolves", () => {
  beforeEach(async () => {
    await tempDir().seedFiles({ [RULE]: CONTENT });
  });

  it("skips a path whose lstat fails for a reason other than absence", async () => {
    arm({ fn: "lstat", match: "stamity-rule.md", reject: errno("EACCES") });

    const report = await sweepReclaimCandidates([candidate(RULE)], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.entries[0]?.action).toBe("skipped-unsafe-path");
    expect(report.entries[0]?.detail).toContain("could not be inspected");
  });

  it("skips a path that is neither file, directory, nor symlink", async () => {
    arm({
      fn: "lstat",
      match: "stamity-rule.md",
      resolve: { isDirectory: () => false, isSymbolicLink: () => false, isFile: () => false },
    });

    const report = await sweepReclaimCandidates([candidate(RULE)], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.entries[0]?.detail).toContain("not a regular file");
  });

  // A case-insensitive volume answers the row's spelling with a file spelled
  // otherwise. The listing is injected so the refusal is held on a
  // case-sensitive volume too; `reclaim.test.ts` runs the real one where the
  // temp volume folds case.
  it("refuses a path its folder lists only under another spelling", async () => {
    arm({ fn: "readdir", match: "rules", resolve: ["Stamity-Rule.md"] });

    const report = await sweepReclaimCandidates([candidate(RULE, CONTENT_HASH)], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.entries[0]?.action).toBe("skipped-unsafe-path");
    expect(report.entries[0]?.detail).toContain("spelled exactly `stamity-rule.md`");
    expect(await readFile(tempDir().path(RULE), "utf-8")).toBe(CONTENT);
  });

  it("reports a file removed between the inspection and the read as missing", async () => {
    arm({ fn: "readFile", match: "stamity-rule.md", reject: errno("ENOENT") });

    const report = await sweepReclaimCandidates([candidate(RULE)], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.entries[0]?.action).toBe("skipped-missing");
    expect(report.entries[0]?.detail).toContain("between the inspection and the read");
  });

  it("leaves ownership unproven when the read fails for any other reason", async () => {
    arm({ fn: "readFile", match: "stamity-rule.md", reject: errno("EACCES") });

    const report = await sweepReclaimCandidates([candidate(RULE)], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.entries[0]?.action).toBe("skipped-unsafe-path");
    expect(report.entries[0]?.detail).toContain("ownership stayed unproven");
  });
});

/**
 * Gate 3's second half — the re-check that runs after the gates cleared a path
 * and before the unlink acts on it. Every case here faults the SECOND lstat of
 * the target: the first is the inspection that pins the file's identity, so
 * skipping it is what puts the fault precisely in the gap the re-check exists
 * to close. Refusing here is the point — the alternative is unlinking whatever
 * object the path names by the time the syscall runs.
 */
describe("reclaim: the target changing between the gates and the unlink", () => {
  beforeEach(async () => {
    await tempDir().seedFiles({ [RULE]: CONTENT });
  });

  it("refuses when the path stopped being a regular file", async () => {
    arm({
      fn: "lstat",
      match: "stamity-rule.md",
      skip: 1,
      resolve: { isFile: () => false, isSymbolicLink: () => false, dev: 1, ino: 1 },
    });

    const report = await sweepReclaimCandidates([candidate(RULE, CONTENT_HASH)], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.deletedCount).toBe(0);
    expect(report.entries[0]?.action).toBe("skipped-unsafe-path");
    expect(report.entries[0]?.detail).toContain("changed under the sweep");
  });

  it("refuses when the parent directory is the same path but no longer the same object", async () => {
    // The realpath arm catches a parent swapped for a SYMLINK, because the
    // resolved path changes. A directory replaced by another directory at the
    // same path resolves identically and only the identity pin can see it, so
    // the parent's second identity read is what has to disagree.
    arm({ fn: "stat", match: tempDir().dir, skip: 1, resolve: { dev: 4242, ino: 4242 } });

    const report = await sweepReclaimCandidates([candidate(RULE, CONTENT_HASH)], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.deletedCount).toBe(0);
    expect(report.entries[0]?.action).toBe("skipped-unsafe-path");
    expect(report.entries[0]?.detail).toContain("changed under the sweep");
  });

  it("refuses when the name now resolves to a different inode", async () => {
    arm({
      fn: "lstat",
      match: "stamity-rule.md",
      skip: 1,
      // Same name, still a regular file — only the identity moved, which is the
      // substitution a path-only check cannot see.
      resolve: { isFile: () => true, isSymbolicLink: () => false, dev: 4242, ino: 4242 },
    });

    const report = await sweepReclaimCandidates([candidate(RULE, CONTENT_HASH)], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.deletedCount).toBe(0);
    expect(report.entries[0]?.action).toBe("skipped-unsafe-path");
    expect(report.entries[0]?.detail).toContain("changed under the sweep");
  });

  it("lets the mutation report a file that vanished during the re-check", async () => {
    arm({ fn: "lstat", match: "stamity-rule.md", skip: 1, reject: errno("ENOENT") });

    const report = await sweepReclaimCandidates([candidate(RULE, CONTENT_HASH)], {
      rootDir: tempDir().dir,
      consent: true,
    });

    // ENOENT is not a refusal: the re-check hands the path to the unlink, which
    // is the step that gets to say whether it was still there.
    expect(report.entries[0]?.action).toBe("deleted");
  });

  it("refuses when the re-check itself fails for any other reason", async () => {
    arm({ fn: "lstat", match: "stamity-rule.md", skip: 1, reject: errno("EACCES") });

    const report = await sweepReclaimCandidates([candidate(RULE, CONTENT_HASH)], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.deletedCount).toBe(0);
    expect(report.entries[0]?.action).toBe("skipped-unsafe-path");
    expect(report.entries[0]?.detail).toContain("could not be re-checked");
    expect(report.entries[0]?.detail).toContain("simulated EACCES");
  });
});

describe("reclaim: the mutation step losing to another process", () => {
  it("reports an unlink that raced to ENOENT as already missing", async () => {
    await tempDir().seedFiles({ [RULE]: CONTENT });
    arm({ fn: "unlink", match: "stamity-rule.md", reject: errno("ENOENT") });

    const report = await sweepReclaimCandidates([candidate(RULE, CONTENT_HASH)], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.entries[0]?.action).toBe("skipped-missing");
    expect(report.entries[0]?.detail).toContain("Removed by another process");
  });

  it("reports an unlink that failed with the file still on disk", async () => {
    await tempDir().seedFiles({ [RULE]: CONTENT });
    arm({ fn: "unlink", match: "stamity-rule.md", reject: errno("EPERM") });

    const report = await sweepReclaimCandidates([candidate(RULE, CONTENT_HASH)], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.entries[0]?.action).toBe("skipped-unsafe-path");
    expect(report.entries[0]?.detail).toContain("still on disk");
  });

  it("leaves the file unchanged when the block strip cannot be written", async () => {
    const block = wrapInManagedBlock("generated body", RULE);
    const original = `user prose above\n\n${block}`;
    await tempDir().seedFiles({ [RULE]: original });
    // Losing to another process means losing for as long as that process holds
    // the name, not for one attempt. The strip goes through the atomic writer,
    // whose publish rename retries a whole platform-sized schedule of transient
    // refusals (EBUSY/EPERM everywhere, EACCES additionally on win32, where the
    // same access family is how a handle without `FILE_SHARE_DELETE` reports
    // itself). A refusal armed once is therefore outlived by the retry loop on
    // that platform and the strip lands on a later attempt — which is the state
    // this case is here to say is wrong. `persists` holds the refusal up for
    // every attempt the schedule allows, so the condition the scenario names is
    // the condition the writer actually meets.
    const refusal: Fault = {
      fn: "rename",
      match: "stamity-rule.md",
      reject: errno("EACCES"),
      persists: true,
    };
    arm(refusal);

    const report = await sweepReclaimCandidates([candidate(RULE)], {
      rootDir: tempDir().dir,
      consent: true,
    });

    expect(report.entries[0]?.action).toBe("skipped-unsafe-path");
    expect(report.entries[0]?.detail).toContain("could not be stripped");
    // The title's claim, read off the disk rather than inferred from the
    // verdict: a strip that landed anyway would rewrite these bytes.
    expect(await readFile(tempDir().path(RULE), "utf8")).toBe(original);
  });

  it("stays refused for the whole win32 rename budget, which is the wider one", async () => {
    // The retry set and the schedule are platform-split and resolved at module
    // load, so a POSIX host running the case above exercises only the four-retry
    // half — the eight-retry win32 half, the one that let the strip land on CI,
    // is unreachable from here without re-importing the sweep under a stubbed
    // `process.platform`. Same fixture, widest budget.
    const block = wrapInManagedBlock("generated body", RULE);
    const original = `user prose above\n\n${block}`;
    await tempDir().seedFiles({ [RULE]: original });
    const refusal: Fault = {
      fn: "rename",
      match: "stamity-rule.md",
      reject: errno("EACCES"),
      persists: true,
    };
    arm(refusal);

    const realPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      vi.resetModules();
      const { sweepReclaimCandidates: sweepOnWin32 } = await import("../../src/merge/reclaim.ts");
      const { RENAME_RETRY_COUNT } = await import("../../src/merge/atomicWrite.ts");

      const report = await sweepOnWin32([candidate(RULE)], {
        rootDir: tempDir().dir,
        consent: true,
      });

      expect(report.entries[0]?.action).toBe("skipped-unsafe-path");
      expect(report.entries[0]?.detail).toContain("could not be stripped");
      // Read off the compiled constant rather than a copy of it: the hold
      // outlasted the budget, instead of the budget outlasting the fixture.
      expect(refusal.fired).toBe(RENAME_RETRY_COUNT + 1);
      expect(await readFile(tempDir().path(RULE), "utf8")).toBe(original);
    } finally {
      Object.defineProperty(process, "platform", { value: realPlatform, configurable: true });
      vi.resetModules();
    }
  });
});

// ── src/merge/safeWrite.ts ─────────────────────────────────────────────────

describe("safeWrite: readIfExists rethrows what is not an absent file", () => {
  it("propagates a directory read verbatim", async () => {
    await mkdir(tempDir().path("adir"), { recursive: true });

    await expect(predictDenyRefusal(tempDir().path("adir"))).rejects.toThrow();
  });

  it("propagates a rejection that carries no errno at all", async () => {
    arm({ fn: "readFile", match: "stamity-rule.md", reject: "not an errno" });

    await expect(predictDenyRefusal(tempDir().path("stamity-rule.md"))).rejects.toBe("not an errno");
  });
});

describe("safeWrite: the entry stat behind every 'are these bytes this file's own' decision", () => {
  // `predictDenyRefusal` is the shortest caller: one `readFile`, then the one
  // `lstat` under test. Driving this through the writer instead would put the
  // containment probe's own stats in front of the fault.
  it("maps a known errno when the path's own entry cannot be read", async () => {
    await tempDir().seedFiles({ "stamity-rule.md": "user prose\n" });
    arm({ fn: "lstat", match: "stamity-rule.md", reject: errno("EACCES") });

    await expect(predictDenyRefusal(tempDir().path("stamity-rule.md"))).rejects.toThrow(
      /Permission denied writing/,
    );
  });

  it("rethrows an unmapped errno from that stat unchanged", async () => {
    await tempDir().seedFiles({ "stamity-rule.md": "user prose\n" });
    arm({ fn: "lstat", match: "stamity-rule.md", reject: errno("ENOTDIR") });

    await expect(predictDenyRefusal(tempDir().path("stamity-rule.md"))).rejects.toThrow(
      "simulated ENOTDIR",
    );
  });
});

describe("safeWrite: a lock release that fails after the write landed", () => {
  it("surfaces the release failure without masking the merge result", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    releaseFault.value = "release refused";

    await expect(safeWriteFile(tempDir().path("stamity-rule.md"), "generated\n")).resolves.toEqual({
      path: tempDir().path("stamity-rule.md"),
      action: "created",
    });

    expect(logged).toHaveBeenCalledWith(expect.stringContaining("release refused"));
  });
});

describe("safeWrite: filesystem failures at the pre-write mkdir and the backup write", () => {
  it("maps a known write errno on the parent-directory mkdir", async () => {
    arm({ fn: "mkdir", match: "nested", reject: errno("EACCES") });

    await expect(
      safeWriteFile(tempDir().path("nested", "stamity-rule.md"), "generated\n"),
    ).rejects.toThrow(/Permission denied writing/);
  });

  it("rethrows an unmapped errno on the parent-directory mkdir unchanged", async () => {
    arm({ fn: "mkdir", match: "nested", reject: errno("ENOTDIR") });

    await expect(
      safeWriteFile(tempDir().path("nested", "stamity-rule.md"), "generated\n"),
    ).rejects.toThrow("simulated ENOTDIR");
  });

  // The faulted syscall moved with the code, not the assertion: the backup now
  // writes through a fresh `O_EXCL | O_NOFOLLOW` fd instead of `copyFile`, so
  // the create is what fails. `.bak` in the match keeps the fault off the atomic
  // writer's `notes.md.tmp.<hex>` open that follows it. The property under test
  // is unchanged — a table errno is mapped, one outside it is rethrown raw.
  it("maps a known write errno on the backup write guarding a force overwrite", async () => {
    await tempDir().seedFiles({ "notes.md": "user prose\n" });
    arm({ fn: "open", match: "notes.md.bak", reject: errno("ENOSPC") });

    await expect(
      safeWriteFile(tempDir().path("notes.md"), "generated\n", { force: true }),
    ).rejects.toThrow(/Not enough disk space/);
  });

  it("rethrows an unmapped errno on that backup write unchanged", async () => {
    await tempDir().seedFiles({ "notes.md": "user prose\n" });
    arm({ fn: "open", match: "notes.md.bak", reject: errno("EXDEV") });

    await expect(
      safeWriteFile(tempDir().path("notes.md"), "generated\n", { force: true }),
    ).rejects.toThrow("simulated EXDEV");
  });

  // The O_EXCL/O_NOFOLLOW pair adds two errnos no disk fixture can stage: both
  // need an entry to appear at the `.bak` name in the window between resolving
  // it as free and creating it. Neither may reach the caller as a raw errno —
  // the next step destroys the original.
  it("names the collision when an entry takes the backup name mid-write", async () => {
    await tempDir().seedFiles({ "notes.md": "user prose\n" });
    arm({ fn: "open", match: "notes.md.bak", reject: errno("EEXIST") });

    const error = await safeWriteFile(tempDir().path("notes.md"), "generated\n", {
      force: true,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe("FS_ERROR");
    expect((error as EngineError).message).toContain("(EEXIST)");
    expect((error as EngineError).message).toContain("Nothing was overwritten");
    // The original is what the refusal promises is intact.
    expect(await readFile(tempDir().path("notes.md"), "utf-8")).toBe("user prose\n");
  });

  it("names the same collision when a symlink takes it (ELOOP under O_NOFOLLOW)", async () => {
    await tempDir().seedFiles({ "notes.md": "user prose\n" });
    arm({ fn: "open", match: "notes.md.bak", reject: errno("ELOOP") });

    await expect(
      safeWriteFile(tempDir().path("notes.md"), "generated\n", { force: true }),
    ).rejects.toThrow(/\(ELOOP\).*symbolic link/s);
  });

  it("rethrows a backup-write rejection carrying no errno at all", async () => {
    await tempDir().seedFiles({ "notes.md": "user prose\n" });
    arm({ fn: "open", match: "notes.md.bak", reject: new Error("no errno on this one") });

    await expect(
      safeWriteFile(tempDir().path("notes.md"), "generated\n", { force: true }),
    ).rejects.toThrow("no errno on this one");
  });
});

describe("safeWrite: repairing a truncated block that ends without a newline", () => {
  it("terminates the prefix before rewriting the block", async () => {
    const path = tempDir().path("stamity-rule.md");
    await writeFile(path, "<!-- STAMITY:BEGIN -->\nstale body", "utf-8");

    const result = await safeWriteFile(path, "ignored\n", { managedContent: "fresh body" });

    expect(result.action).toBe("updated");
    expect(result.warning).toContain("had no closing");
  });
});
