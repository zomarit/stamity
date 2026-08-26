import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { draftLearning, learnCommand } from "../../../src/cli/commands/learn.ts";
import { composeFrontmatter } from "../../../src/content/frontmatter.ts";
import { loadValidatedLearnings } from "../../../src/learnings/store.ts";
import {
  DEFAULT_LEARNING_FILE_COUNT,
  MAX_LEARNING_FILE_BYTES,
} from "../../../src/learnings/validation.ts";
import { MANIFEST_VERSION, type SetupManifest } from "../../../src/types/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir, type TempDirHandle } from "../../support/tempDir.ts";

/**
 * Real-filesystem lane. Capture's contract is what lands under
 * `.stamity/learnings/` and whether the session-start loader will read it back,
 * neither of which is expressible on a virtual volume the command never sees:
 * it resolves its root from `ctx.app.runtime.cwd` and calls the real store.
 *
 * Everything runs through the in-process funnel (`runInProcess`) rather than by
 * calling `learnCommand.run` directly, so each assertion also covers the seams
 * the UX contract lives in — exit 0/1/2, the single JSON document, `--dry-run`
 * plumbing, `hidden` on the help surface, and stdin arriving as the injected
 * prompt stream.
 *
 * The snapshot walk reads a directory before its children, so the ordering is a
 * real dependency rather than an un-parallelized loop.
 */
/* oxlint-disable no-await-in-loop */

const tempDir = useTempDir("stamity-learn");

const TITLE = "cache warmup order";
const FILE_NAME = "cache-warmup-order.md";
const SUMMARY = "Warm the cache after the registry is populated.";
const LEARNINGS_DIR = `${STATE_DIR}/learnings`;

/** A body carrying both sections the engine requires, and nothing a screen fires on. */
const BODY = [
  "## Why",
  "",
  "Warm-up ran before the registry was populated, so every entry missed.",
  "",
  "## How to apply",
  "",
  "Populate the registry in the module initialiser, then warm.",
  "",
].join("\n");

/** Both required sections plus `padding` filler bytes — length is linear in `padding`. */
function fillerBody(padding: number): string {
  return `## Why\n\n${"a".repeat(padding)}\n\n## How to apply\n\nrun it\n`;
}

/**
 * Document size for a body, computed the way the command composes it. The date
 * is a fixed 10-character calendar date and every real run stamps one too, so
 * this is byte-exact against a live capture.
 */
function documentBytes(body: string): number {
  const draft = draftLearning({
    title: TITLE,
    summary: SUMMARY,
    confidence: "medium",
    date: "2026-01-01",
    body,
  });
  return Buffer.byteLength(composeFrontmatter(draft.frontmatter, draft.body), "utf8");
}

/** Filler that lands the composed document exactly on the per-file byte cap. */
const CAP_PADDING = MAX_LEARNING_FILE_BYTES - documentBytes(fillerBody(0));

/**
 * A body composing to exactly the cap: inside the content gate, over it once
 * the store adds the `integrity:` line — which is the only note that separates
 * a dry run running one gate from one running all five.
 */
const AT_CAP_BODY = fillerBody(CAP_PADDING);

/**
 * A zero-width space inside a word. The screen normalizes it away before
 * scoring, so the note is valid rather than refused, and the store's
 * sanitize-then-stamp pass is what removes it — the one route to a
 * `sanitized: true` verdict.
 */
/** Written as an escape, not a literal glyph, so the byte is visible in a diff. */
const ZWSP = "\u200B";
const SMUGGLED_BODY = [
  "## Why",
  "",
  `Warm-up ran be${ZWSP}fore the registry was populated.`,
  "",
  "## How to apply",
  "",
  "Populate the registry first.",
  "",
].join("\n");

function manifestFixture(): SetupManifest {
  return {
    version: MANIFEST_VERSION,
    generatedBy: "0.0.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tools: ["claude"],
    selection: { items: { agent: [], skill: [], rule: [], command: [] } },
    ledger: [],
  };
}

/**
 * An initialised repo with a well-formed manifest and NO learnings directory —
 * the store creating its own parent is part of what the happy path proves.
 */
async function seedRepo(temp: TempDirHandle, extra: Record<string, string> = {}): Promise<string> {
  await temp.seedFiles({
    "repo/README.md": "# fixture\n",
    [`repo/${STATE_DIR}/manifest.json`]: `${JSON.stringify(manifestFixture(), null, 2)}\n`,
    ...extra,
  });
  return temp.path("repo");
}

/** Every path under `dir` as `relative/posix/path` -> content, directories included. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const seen: Record<string, string> = {};
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      const key = relative(dir, abs).split(sep).join("/");
      if (entry.isDirectory()) {
        seen[`${key}/`] = "";
        await walk(abs);
      } else {
        seen[key] = await readFile(abs, "utf8");
      }
    }
  };
  await walk(dir);
  return seen;
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function parseSingleDoc(stdout: string): Record<string, unknown> {
  const lines = stdout.split("\n").filter((line) => line !== "");
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] ?? "") as Record<string, unknown>;
}

/** Hostile defaults: no TTY anywhere, empty env, stdin closed unless seeded. */
function runLearn(
  root: string,
  argv: readonly string[],
  opts?: { stdinLines?: readonly string[]; tty?: { stdout?: boolean; stdin?: boolean } },
): ReturnType<typeof runInProcess> {
  return runInProcess([learnCommand], ["learn", ...argv], {
    cwd: root,
    ...(opts?.stdinLines !== undefined ? { stdinLines: opts.stdinLines } : {}),
    ...(opts?.tty !== undefined ? { tty: opts.tty } : {}),
  });
}

/** `learn capture` with the standard title/summary and the body on stdin. */
function capture(
  root: string,
  argv: readonly string[] = [],
  stdin: string | null = BODY,
): ReturnType<typeof runInProcess> {
  return runLearn(
    root,
    ["capture", "--title", TITLE, "--summary", SUMMARY, ...argv],
    stdin === null ? {} : { stdinLines: [stdin] },
  );
}

describe("draftLearning", () => {
  it("derives the file name and id from the title, and keeps the title verbatim", () => {
    const draft = draftLearning({
      title: "  Cache   Warmup Order  ",
      summary: SUMMARY,
      confidence: "high",
      date: "2026-01-01",
      body: BODY,
    });

    expect(draft.fileName).toBe(FILE_NAME);
    expect(draft.frontmatter["id"]).toBe("cache-warmup-order");
    expect(draft.frontmatter["title"]).toBe("Cache   Warmup Order");
    expect(draft.frontmatter["date"]).toBe("2026-01-01");
    expect(draft.frontmatter["confidence"]).toBe("high");
  });

  it("passes a path-hostile title through unchanged instead of laundering it", () => {
    // The security property of the minimal transform: stripping the separators
    // would turn "../../etc/passwd" into the valid name "etcpasswd" and convert
    // a refused traversal into a successful write.
    expect(draftLearning({ ...base(), title: "../../etc/passwd" }).fileName).toBe(
      "../../etc/passwd.md",
    );
  });

  it("never synthesizes a body heading from the title", () => {
    // A "# Why caches miss" heading built from the title would satisfy the
    // engine's required-section check for a body that explains nothing.
    const draft = draftLearning({ ...base(), title: "why caches miss", body: "just the finding" });
    expect(draft.body).toBe("\njust the finding\n");
  });

  it("leaves an empty body empty rather than inventing a placeholder", () => {
    expect(draftLearning({ ...base(), body: "   \n\n  " }).body).toBe("");
  });

  function base(): Parameters<typeof draftLearning>[0] {
    return { title: TITLE, summary: SUMMARY, confidence: "medium", date: "2026-01-01", body: BODY };
  }
});

describe("learn capture — the happy path", () => {
  it("writes a learning the session-start loader reads back with its digest verified", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await capture(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(FILE_NAME);
    expect(await readIfPresent(join(root, LEARNINGS_DIR, FILE_NAME))).not.toBeNull();

    const loaded = await loadValidatedLearnings({ rootDir: root });
    expect(loaded.skips).toEqual([]);
    expect(loaded.learnings).toHaveLength(1);
    expect(loaded.learnings[0]?.fileName).toBe(FILE_NAME);
    // `integrityOk` is the literal true the loader only constructs after the
    // stamped digest matched the body it read off disk.
    expect(loaded.learnings[0]?.integrityOk).toBe(true);
    expect(loaded.learnings[0]?.frontmatter["confidence"]).toBe("medium");
  });

  it("takes the body from --body-file when the flag is present, ignoring stdin", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp, { "repo/staged.md": BODY });

    const result = await capture(root, ["--body-file", "staged.md"], "## Why\n\nfrom stdin\n");

    expect(result.code).toBe(0);
    const written = await readFile(join(root, LEARNINGS_DIR, FILE_NAME), "utf8");
    expect(written).toContain("Populate the registry in the module initialiser");
    expect(written).not.toContain("from stdin");
  });

  it("accepts an absolute --body-file path as well as one relative to the cwd", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp, { "repo/staged.md": BODY });

    const result = await capture(root, ["--body-file", join(root, "staged.md")], null);

    expect(result.code).toBe(0);
    expect(await readFile(join(root, LEARNINGS_DIR, FILE_NAME), "utf8")).toContain(
      "Populate the registry in the module initialiser",
    );
  });

  it("records the confidence the flag asked for", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await capture(root, ["--confidence", "high"]);

    expect(result.code).toBe(0);
    expect(await readFile(join(root, LEARNINGS_DIR, FILE_NAME), "utf8")).toContain(
      "confidence: high",
    );
  });

  it("stamps medium when the flag is absent", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    await capture(root);

    expect(await readFile(join(root, LEARNINGS_DIR, FILE_NAME), "utf8")).toContain(
      "confidence: medium",
    );
  });

  it("refuses a second capture under the same slug — learnings are append-only", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    expect((await capture(root)).code).toBe(0);
    const second = await capture(root);

    expect(second.code).toBe(1);
    expect(second.stderr).toContain("already exists");
    expect(second.stderr).toContain("append-only");
  });
});

describe("learn capture — the .stamity gate", () => {
  it("refuses a repo with no state directory and names init as the next step", async () => {
    const temp = tempDir();
    await temp.seedFiles({ "repo/README.md": "# fixture\n" });
    const root = temp.path("repo");
    const before = await snapshot(root);

    const result = await capture(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("not initialised");
    expect(result.stderr).toContain("npx @zomarit/stamity init");
    // The point of the gate: a stray capture mints nothing, not even the
    // learnings directory the store would otherwise create on its way in.
    expect(await snapshot(root)).toEqual(before);
  });

  it("captures anyway when the manifest is corrupt — only directory existence gates", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp, {
      [`repo/${STATE_DIR}/manifest.json`]: "{ not json at all",
    });

    const result = await capture(root);

    // An agent may well be capturing the learning that explains the corruption.
    expect(result.code).toBe(0);
    expect(await readIfPresent(join(root, LEARNINGS_DIR, FILE_NAME))).not.toBeNull();
  });
});

describe("learn capture — engine verdicts pass through", () => {
  it("exits 1 with the required-sections message when the body has neither heading", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await capture(root, [], "Warm the cache after the registry is populated.");

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('missing the "Why" and "How to apply" sections');
    expect(await readIfPresent(join(root, LEARNINGS_DIR, FILE_NAME))).toBeNull();
  });

  it("exits 1 with the file-name rule when the title carries path separators", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    const before = await snapshot(root);

    const result = await runLearn(
      root,
      ["capture", "--title", "../../etc/passwd", "--summary", SUMMARY],
      { stdinLines: [BODY] },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("must be a bare file name");
    // The name gate short-circuits before any filesystem call, so the traversal
    // never reaches a path join.
    expect(await snapshot(root)).toEqual(before);
  });

  it("treats a closed stdin as an empty body and surfaces the engine's refusal", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await capture(root, [], null);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("the body is empty");
  });

  it("treats an empty --body-file the same way", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp, { "repo/staged.md": "" });

    const result = await capture(root, ["--body-file", "staged.md"], null);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("the body is empty");
  });

  it("names the file it could not read when --body-file points nowhere", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await capture(root, ["--body-file", "missing.md"], null);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("missing.md");
    expect(result.stderr).toContain("pipe the body on stdin");
  });
});

describe("learn capture — the per-file byte cap", () => {
  /**
   * Slack for the `integrity:` line the store adds before it re-validates: a
   * hex sha256 under a field name runs about 83 bytes, and 200 keeps this
   * fixture clear of the ceiling without depending on the exact digest
   * rendering. Subtracting it from the cap padding still leaves a ~64 KB body,
   * so the pass-side fixture is nowhere near degenerate.
   */
  const STAMP_HEADROOM = 200;
  const atCap = AT_CAP_BODY;
  // One more filler byte, not one more trailing byte: the composer trims, so
  // appending past the final newline would move the size by two.
  const overCap = fillerBody(CAP_PADDING + 1);

  it("sizes the fixtures exactly on and one byte past the cap", () => {
    expect(documentBytes(atCap)).toBe(MAX_LEARNING_FILE_BYTES);
    expect(documentBytes(overCap)).toBe(MAX_LEARNING_FILE_BYTES + 1);
  });

  it("passes the CONTENT gate at exactly the cap, and the dry run still refuses it", async () => {
    // TEST CHANGE, justified: this used to assert `--dry-run` exits 0 at exactly
    // the cap, which was true only because the dry run ran one of the four write
    // gates. It now runs the same set the real capture runs, so it reaches the
    // stamped-form gate and refuses for the reason the real capture refuses —
    // see the sibling test below, which asserted that divergence as a known gap.
    // The behavior under test is unchanged; what moved is which path reports it.
    const temp = tempDir();
    const root = await seedRepo(temp, { "repo/staged.md": atCap });

    // The pre-stamp document is inside the cap: the content gate passes it.
    expect(documentBytes(atCap)).toBe(MAX_LEARNING_FILE_BYTES);

    const result = await capture(root, ["--body-file", "staged.md", "--dry-run"], null);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Stamped form");
    expect(result.stderr).toContain(`over the ${MAX_LEARNING_FILE_BYTES} byte per-file cap`);
  });

  it("passes every gate one byte under the stamped ceiling", async () => {
    // The non-degenerate other side: a note that clears all five gates, so the
    // test above proves a refusal rather than a dry run that refuses everything.
    const temp = tempDir();
    const root = await seedRepo(temp, {
      "repo/staged.md": fillerBody(CAP_PADDING - STAMP_HEADROOM),
    });

    const result = await capture(root, ["--body-file", "staged.md", "--dry-run"], null);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("passes every write gate");
  });

  it("fails one byte over with the engine's size message, and writes nothing", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp, { "repo/staged.md": overCap });

    const result = await capture(root, ["--body-file", "staged.md"], null);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`over the ${MAX_LEARNING_FILE_BYTES} byte per-file cap`);
    expect(await readIfPresent(join(root, LEARNINGS_DIR, FILE_NAME))).toBeNull();
  });

  it("still refuses a real capture at exactly the cap: the digest costs headroom", async () => {
    // Documented, not asserted-as-desirable. `persistLearning` validates the
    // pre-stamp document, then re-validates after adding the ~83-byte
    // `integrity:` line, so a document sitting on the cap overflows the second
    // check. The refusal is labelled "Stamped form —", which is the honest
    // message; a caller near the ceiling splits the note. BD-candidate: the
    // usable body budget is the cap minus the stamp, and nothing states that.
    const temp = tempDir();
    const root = await seedRepo(temp, { "repo/staged.md": atCap });

    const result = await capture(root, ["--body-file", "staged.md"], null);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Stamped form");
    expect(result.stderr).toContain(`over the ${MAX_LEARNING_FILE_BYTES} byte per-file cap`);
  });

  it("refuses a stdin body past the engine's input ceiling before buffering it whole", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await capture(root, [], "x".repeat(250_001));

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("input ceiling");
  });
});

describe("learn capture — neutralization", () => {
  // Fixture hoisted to module scope: the dry-run parity suite drives the same
  // smuggled body through the sanitize-and-stamp pass without writing it.
  const SMUGGLED = SMUGGLED_BODY;

  it("strips the invisible characters and stamps the digest over what actually landed", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await capture(root, [], SMUGGLED);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("neutralized");

    const written = await readFile(join(root, LEARNINGS_DIR, FILE_NAME), "utf8");
    expect(written).not.toContain(ZWSP);
    expect(written).toContain("before the registry was populated");
    // The order the store documents, proven from the outside: the digest covers
    // the neutralized body, so the loader verifies the file instead of skipping
    // it `integrity-mismatch` for bytes that changed after they were stamped.
    const loaded = await loadValidatedLearnings({ rootDir: root });
    expect(loaded.skips).toEqual([]);
    expect(loaded.learnings).toHaveLength(1);
  });

  it("flags the neutralization in the JSON document", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await capture(root, ["--json"], SMUGGLED);

    expect(result.code).toBe(0);
    expect(parseSingleDoc(result.stdout)["sanitized"]).toBe(true);
  });
});

describe("learn capture — the directory count cap", () => {
  it("refuses with the engine's cap message once the store is full", async () => {
    // The brief anticipated a best-effort skip here (ok:true with a `skipped`
    // detail). The store has no skip channel: a full directory is a refusal
    // carrying `errors`, exactly like a malformed note. This test locks the
    // engine's actual semantics — see the BD-candidate note in the handoff.
    const temp = tempDir();
    const full: Record<string, string> = {};
    for (let index = 0; index < DEFAULT_LEARNING_FILE_COUNT; index += 1) {
      full[`repo/${LEARNINGS_DIR}/note-${index}.md`] = "placeholder\n";
    }
    const root = await seedRepo(temp, full);

    const result = await capture(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`at the ${DEFAULT_LEARNING_FILE_COUNT} file cap`);
    expect(await readIfPresent(join(root, LEARNINGS_DIR, FILE_NAME))).toBeNull();
  });
});

describe("learn capture --dry-run — the same gates as a real capture", () => {
  /** The `errors` array of a refusal document, whichever path produced it. */
  async function refusalErrors(
    root: string,
    argv: readonly string[] = [],
    stdin: string | null = BODY,
  ): Promise<string[]> {
    const result = await capture(root, ["--json", ...argv], stdin);
    expect(result.code).toBe(1);
    return parseSingleDoc(result.stdout)["errors"] as string[];
  }

  it("refuses a taken slug with the store's own append-only message, byte for byte", async () => {
    // The parity assertion the mirrored sentence in dryRunCapture rests on: the
    // dry run re-states the store's refusals rather than importing them, so a
    // reworded store message has to fail here instead of drifting.
    const temp = tempDir();
    const root = await seedRepo(temp);
    expect((await capture(root)).code).toBe(0);
    const after = await snapshot(root);

    const dry = await refusalErrors(root, ["--dry-run"]);
    const real = await refusalErrors(root);

    expect(dry).toEqual(real);
    expect(dry[0]).toContain("append-only");
    // Pre-fix this exited 0: the dry run cleared a note the real capture then
    // refused, and its caller is a machine that acts on the verdict.
    expect(await snapshot(root)).toEqual(after);
  });

  it("refuses at the directory count cap with the store's own message, byte for byte", async () => {
    const temp = tempDir();
    const full: Record<string, string> = {};
    for (let index = 0; index < DEFAULT_LEARNING_FILE_COUNT; index += 1) {
      full[`repo/${LEARNINGS_DIR}/note-${index}.md`] = "placeholder\n";
    }
    const root = await seedRepo(temp, full);
    const before = await snapshot(root);

    const dry = await refusalErrors(root, ["--dry-run"]);
    const real = await refusalErrors(root);

    expect(dry).toEqual(real);
    expect(dry[0]).toContain(`at the ${DEFAULT_LEARNING_FILE_COUNT} file cap`);
    expect(await snapshot(root)).toEqual(before);
  });

  it("runs the sanitize-and-stamp pass, not just the content gate, on a note that needs it", async () => {
    // The sanitizer gate's PASS side, which is the only side reachable through
    // this command: its refusal branch fires when a block-severity span survives
    // neutralization, and the shipped pattern set converges (denyScan.ts's own
    // note on `unresolved`). A body carrying an invisible character exercises
    // strip -> parse -> stamp -> re-validate all the same, and a dry run that
    // stopped at the content gate would report the same verdict for a body that
    // never went through any of it.
    const temp = tempDir();
    const root = await seedRepo(temp);
    const before = await snapshot(root);

    const result = await capture(root, ["--json", "--dry-run"], SMUGGLED_BODY);

    expect(result.code).toBe(0);
    expect(parseSingleDoc(result.stdout)["gatesRun"]).toContain("stamped-form");
    expect(await snapshot(root)).toEqual(before);
  });

  it("refuses a note that only overflows once stamped, with the same message", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp, { "repo/staged.md": AT_CAP_BODY });
    const before = await snapshot(root);

    const dry = await refusalErrors(root, ["--dry-run", "--body-file", "staged.md"], null);
    const real = await refusalErrors(root, ["--body-file", "staged.md"], null);

    expect(dry).toEqual(real);
    expect(dry[0]).toContain("Stamped form");
    expect(await snapshot(root)).toEqual(before);
  });

  it("names the gates it ran on the success document, and every one of them", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await capture(root, ["--json", "--dry-run"]);

    expect(result.code).toBe(0);
    expect(parseSingleDoc(result.stdout)["gatesRun"]).toEqual([
      "content",
      "append-only",
      "count-cap",
      "sanitizer",
      "stamped-form",
    ]);
  });

  it("names the gates it ran on a refusal, ending with the one that refused", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    expect((await capture(root)).code).toBe(0);

    const contentRefusal = await capture(root, ["--json", "--dry-run"], "no sections here");
    expect(parseSingleDoc(contentRefusal.stdout)["gatesRun"]).toEqual(["content"]);

    // Same repo, valid body, taken slug: one gate further in.
    const slugRefusal = await capture(root, ["--json", "--dry-run"]);
    expect(parseSingleDoc(slugRefusal.stdout)["gatesRun"]).toEqual(["content", "append-only"]);
  });

  it("mints no learnings directory while running the directory gates", async () => {
    // The gates are pure validators plus one listing; the listing must not be
    // the thing that creates the directory it is listing.
    const temp = tempDir();
    const root = await seedRepo(temp);
    const before = await snapshot(root);

    expect((await capture(root, ["--dry-run"])).code).toBe(0);

    expect(await snapshot(root)).toEqual(before);
    expect(before[`${LEARNINGS_DIR}/`]).toBeUndefined();
  });
});

describe("learn capture --dry-run", () => {
  it("reports the verdict and its advisories without touching the tree", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    const before = await snapshot(root);

    const result = await capture(root, ["--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("passes every write gate");
    // The advisories a real capture drops: the store returns a write verdict,
    // so this is the only surface that reports what is thin about the note.
    expect(result.stdout).toContain("reviewBy");
    expect(result.stdout).toContain("validatedAgainst");
    expect(await snapshot(root)).toEqual(before);
  });

  it("reports a refusal without writing, same as a live run", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    const before = await snapshot(root);

    const result = await capture(root, ["--dry-run"], "no sections here");

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('missing the "Why" and "How to apply" sections');
    expect(await snapshot(root)).toEqual(before);
  });

  it("refuses in an uninitialised repo too, so a dry run never disagrees with the real one", async () => {
    const temp = tempDir();
    await temp.seedFiles({ "repo/README.md": "# fixture\n" });

    const result = await capture(temp.path("repo"), ["--dry-run"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("npx @zomarit/stamity init");
  });
});

describe("learn capture --json", () => {
  it("carries the written path and file name in one success document", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await capture(root, ["--json"]);

    expect(result.code).toBe(0);
    expect(parseSingleDoc(result.stdout)).toEqual({
      ok: true,
      command: "learn",
      version: expect.any(String),
      path: join(root, LEARNINGS_DIR, FILE_NAME),
      fileName: FILE_NAME,
      sanitized: false,
    });
    // JSON mode owns stdout: the human confirmation never leaks into it.
    expect(result.stdout).not.toContain("Captured");
  });

  it("carries the engine's validation messages verbatim in the failure document", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await capture(root, ["--json"], "no sections here");

    expect(result.code).toBe(1);
    const doc = parseSingleDoc(result.stdout);
    expect(doc["ok"]).toBe(false);
    expect(doc["command"]).toBe("learn");
    expect(doc["fileName"]).toBe(FILE_NAME);
    expect((doc["error"] as { code: string }).code).toBe("VALIDATION_ERROR");
    const errors = doc["errors"] as string[];
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('missing the "Why" and "How to apply" sections');
    // Nothing is rendered twice: JSON mode writes the document, not the human form.
    expect(result.stderr).toBe("");
  });

  it("reports the dry-run verdict with its warnings", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await capture(root, ["--json", "--dry-run"]);

    const doc = parseSingleDoc(result.stdout);
    expect(doc["ok"]).toBe(true);
    expect(doc["dryRun"]).toBe(true);
    expect(doc["fileName"]).toBe(FILE_NAME);
    expect((doc["warnings"] as string[]).join(" ")).toContain("reviewBy");
  });
});

describe("learn — the command surface", () => {
  it("stays off the top-level help listing", async () => {
    const result = await runInProcess([learnCommand], ["--help"], { cwd: process.cwd() });

    expect(result.code).toBe(0);
    expect(result.stdout).not.toMatch(/^\s*learn\b/m);
  });

  it("is hidden, not absent: its own help prints every flag", async () => {
    const result = await runLearn(process.cwd(), ["--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("--title");
    expect(result.stdout).toContain("--summary");
    expect(result.stdout).toContain("--confidence");
    expect(result.stdout).toContain("--body-file");
  });

  it("exits 2 when a required option is missing", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await runLearn(root, ["capture", "--summary", SUMMARY]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--title");
    expect(result.stderr).toContain("--help for usage");
  });

  it("exits 2 on a bare invocation with no verb", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    expect((await runLearn(root, [])).code).toBe(2);
  });

  it("exits 2 on an unknown verb, naming the one that exists", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await runLearn(root, ["recall", "--title", TITLE, "--summary", SUMMARY]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("capture");
  });

  it("exits 2 on an out-of-range confidence, listing the levels", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await capture(root, ["--confidence", "certain"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("low, medium, high");
  });
});
