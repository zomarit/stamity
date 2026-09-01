import { chmod, lstat, mkdir, readFile, readlink, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/worktree/receipt.ts";
import {
  materializeEntries,
  materializeEntry,
  receiptEntryFor,
  type MaterializeOptions,
  type MaterializeRequest,
} from "../../src/worktree/materialize.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * REQ-WORKTREE-005 (EEXIST-distinguishable idempotency, mode preservation, the
 * forced `0600` on a secret) and REQ-WORKTREE-016 (the win32 posture).
 *
 * Real temp directories throughout: the properties under test are syscall
 * properties — `COPYFILE_EXCL` refusing an existing name, `lstat` seeing a
 * link, a mode surviving a copy — and none of them is modelled by an in-memory
 * volume.
 *
 * Two seams are injected, each because the real one cannot be made to answer
 * here: `platform`, because there is no Windows runner, and `symlinkImpl`,
 * because a POSIX `symlink(2)` on a writable directory cannot be made to raise
 * `EPERM` or `ENOSPC` on demand. Both branches are otherwise unreachable in
 * this suite, which is what the spec's own residual note says about them.
 */

/**
 * POSIX mode assertion gate. Node cannot set or read 0o600/0o700/0o755 on
 * Windows (a writable file always reads back 0o666) and `chmod` does not
 * restrict a directory there, so a case that asserts an exact mode tests a
 * mechanism the platform does not have. `skipIf(WINDOWS)` keeps these running —
 * and gating — on darwin and Linux while standing them down on Windows, where
 * the farm's protection is ACL inheritance under a user-scoped location, not a
 * chmod bit (see docs/specs/worktree-lane.md § Windows).
 */
const WINDOWS = process.platform === "win32";
/**
 * A case that depends on a directory mode ENFORCING a denial: false under root
 * (which bypasses the bit) and under Windows (`process.getuid` is undefined and
 * chmod does not restrict), true only where a non-root POSIX runner can observe
 * the refusal.
 */
const CAN_TEST_PERMISSIONS = typeof process.getuid === "function" && process.getuid() !== 0;

const getRoot = useTempDir("worktree-materialize");

interface Fixture {
  readonly sourceRoot: string;
  readonly worktreeRoot: string;
}

async function fixture(): Promise<Fixture> {
  const root = getRoot().dir;
  const sourceRoot = join(root, "repo");
  const worktreeRoot = join(root, "farm", "feat");
  await mkdir(sourceRoot, { recursive: true });
  await mkdir(worktreeRoot, { recursive: true });
  return { sourceRoot, worktreeRoot };
}

async function seedSource(fix: Fixture, relPath: string, body: string, mode?: number): Promise<string> {
  const absolute = join(fix.sourceRoot, relPath);
  await mkdir(join(absolute, "..").toString(), { recursive: true });
  await writeFile(absolute, body, "utf8");
  if (mode !== undefined) await chmod(absolute, mode);
  return absolute;
}

function request(overrides: Partial<MaterializeRequest> = {}): MaterializeRequest {
  return { relPath: ".env.mcp", strategy: "copy", secret: false, ...overrides };
}

function options(fix: Fixture, overrides: Partial<MaterializeOptions> = {}): MaterializeOptions {
  return { sourceRoot: fix.sourceRoot, worktreeRoot: fix.worktreeRoot, ...overrides };
}

/** A two-level source tree, for the directory-expansion cases. */
async function seedTree(fix: Fixture): Promise<void> {
  await mkdir(join(fix.sourceRoot, "state", "cache"), { recursive: true });
  await writeFile(join(fix.sourceRoot, "state", "a.json"), '{"a":1}', "utf8");
  await writeFile(join(fix.sourceRoot, "state", "cache", "b.json"), '{"b":2}', "utf8");
}

const SECRET_BODY = "MCP_GITHUB_TOKEN=ghp_example\nMCP_LINEAR_KEY=lin_example\n";

describe("worktree materialization — copy (REQ-WORKTREE-005)", () => {
  it("copies the bytes and reports the digest of what it wrote", async () => {
    const fix = await fixture();
    await seedSource(fix, ".env.mcp", SECRET_BODY);

    const result = await materializeEntry(request(), options(fix));

    expect(result.outcome).toBe("materialized");
    expect(result.strategy).toBe("copy");
    expect(result.sha256).toBe(sha256Hex(SECRET_BODY));
    expect(await readFile(join(fix.worktreeRoot, ".env.mcp"), "utf8")).toBe(SECRET_BODY);
  });

  it("creates the parent directories an entry needs", async () => {
    const fix = await fixture();
    await seedSource(fix, "state/creds/token.json", '{"token":"abc"}');

    const result = await materializeEntry(
      request({ relPath: "state/creds/token.json" }),
      options(fix),
    );

    expect(result.outcome).toBe("materialized");
    expect(await readFile(join(fix.worktreeRoot, "state/creds/token.json"), "utf8")).toBe(
      '{"token":"abc"}',
    );
  });

  /**
   * The EEXIST half of the requirement: an existing destination is a legitimate
   * re-run outcome, and the DIFFERENT bytes are what distinguish the skip from
   * a clobber. A check-then-write cannot tell "this run already did it" from
   * "another process is doing it right now"; the flag can.
   */
  it("skips an existing destination without touching its bytes", async () => {
    const fix = await fixture();
    await seedSource(fix, ".env.mcp", SECRET_BODY);
    await writeFile(join(fix.worktreeRoot, ".env.mcp"), "MCP_GITHUB_TOKEN=different\n", "utf8");

    const result = await materializeEntry(request(), options(fix));

    expect(result.outcome).toBe("skipped");
    expect(result.reason).toContain("already present");
    expect(await readFile(join(fix.worktreeRoot, ".env.mcp"), "utf8")).toBe(
      "MCP_GITHUB_TOKEN=different\n",
    );
  });

  it("is idempotent: a second run over its own output skips rather than fails", async () => {
    const fix = await fixture();
    await seedSource(fix, ".env.mcp", SECRET_BODY);

    const first = await materializeEntry(request(), options(fix));
    const second = await materializeEntry(request(), options(fix));

    expect(first.outcome).toBe("materialized");
    expect(second.outcome).toBe("skipped");
    expect(second.sha256).toBe(first.sha256);
  });

  it("reports an absent source as absent, and writes nothing", async () => {
    const fix = await fixture();

    const result = await materializeEntry(request(), options(fix));

    expect(result.outcome).toBe("absent");
    await expect(stat(join(fix.worktreeRoot, ".env.mcp"))).rejects.toThrow();
  });

  // win32-gated: POSIX mode assertion — see WINDOWS.
  it.skipIf(WINDOWS)("carries the source's permission bits onto the copy", async () => {
    const fix = await fixture();
    await seedSource(fix, "run.sh", "#!/bin/sh\necho hi\n", 0o755);

    const result = await materializeEntry(request({ relPath: "run.sh" }), options(fix));

    expect(result.outcome).toBe("materialized");
    expect((await stat(join(fix.worktreeRoot, "run.sh"))).mode & 0o777).toBe(0o755);
    expect(result.mode).toBe("0755");
  });

  // win32-gated: POSIX mode assertion — see WINDOWS.
  it.skipIf(WINDOWS)("forces a secret entry to 0600 whatever the source's mode was", async () => {
    const fix = await fixture();
    await seedSource(fix, ".env.mcp", SECRET_BODY, 0o644);

    const result = await materializeEntry(request({ secret: true }), options(fix));

    expect((await stat(join(fix.worktreeRoot, ".env.mcp"))).mode & 0o777).toBe(0o600);
    expect(result.mode).toBe("0600");
    expect(result.secretModeApplied).toBe(true);
  });

  // win32-gated: POSIX mode assertion — see WINDOWS.
  it.skipIf(WINDOWS)("hardens a secret entry that was already present, so a re-run cannot leave it loose", async () => {
    const fix = await fixture();
    await seedSource(fix, ".env.mcp", SECRET_BODY, 0o644);
    const destination = join(fix.worktreeRoot, ".env.mcp");
    await writeFile(destination, SECRET_BODY, "utf8");
    await chmod(destination, 0o644);

    const result = await materializeEntry(request({ secret: true }), options(fix));

    expect(result.outcome).toBe("skipped");
    expect((await stat(destination)).mode & 0o777).toBe(0o600);
  });

  it("leaves no partial file when the write fails, and carries the errno", async () => {
    const fix = await fixture();
    await seedSource(fix, "state/token.json", '{"token":"abc"}');
    // A regular file standing where the entry's parent directory must be: the
    // mkdir fails with a real errno on every platform, and no root/umask
    // assumption is needed to produce it.
    await writeFile(join(fix.worktreeRoot, "state"), "not a directory", "utf8");

    const result = await materializeEntry(request({ relPath: "state/token.json" }), options(fix));

    expect(result.outcome).toBe("failed");
    expect(result.errno).toBeDefined();
    expect(result.reason).toBeDefined();
  });

  // Skipped where a directory mode does not enforce a denial: under root (which
  // bypasses the bit) and under Windows (chmod does not restrict a directory, so
  // the write would succeed and the outcome would be `materialized`). The case
  // above covers the same failed-write contract without that dependency.
  it.skipIf(!CAN_TEST_PERMISSIONS)(
    "reports a read-only destination directory as failed with no file left behind",
    async () => {
      const fix = await fixture();
      await seedSource(fix, ".env.mcp", SECRET_BODY);
      await chmod(fix.worktreeRoot, 0o500);

      const result = await materializeEntry(request(), options(fix));
      await chmod(fix.worktreeRoot, 0o700);

      expect(result.outcome).toBe("failed");
      expect(result.errno).toBe("EACCES");
      await expect(stat(join(fix.worktreeRoot, ".env.mcp"))).rejects.toThrow();
    },
  );

  it("fails the entry rather than writing outside the worktree root", async () => {
    const fix = await fixture();
    await seedSource(fix, ".env.mcp", SECRET_BODY);

    const result = await materializeEntry(request({ relPath: "../escaped.env" }), options(fix));

    expect(result.outcome).toBe("failed");
    expect(result.reason).toBeDefined();
    await expect(stat(join(fix.worktreeRoot, "..", "escaped.env"))).rejects.toThrow();
  });
});

describe("worktree materialization — symlink (REQ-WORKTREE-005, REQ-WORKTREE-016)", () => {
  it("links the destination at the source and reports no digest", async () => {
    const fix = await fixture();
    const source = await seedSource(fix, ".venv-config", "layout=src\n");

    const result = await materializeEntry(request({ relPath: ".venv-config", strategy: "symlink" }), options(fix));

    expect(result.outcome).toBe("materialized");
    expect(result.strategy).toBe("symlink");
    expect(result.sha256).toBeUndefined();
    const destination = join(fix.worktreeRoot, ".venv-config");
    expect((await lstat(destination)).isSymbolicLink()).toBe(true);
    expect(await readlink(destination)).toBe(source);
  });

  it("skips an existing destination rather than replacing it", async () => {
    const fix = await fixture();
    await seedSource(fix, ".venv-config", "layout=src\n");
    await writeFile(join(fix.worktreeRoot, ".venv-config"), "hand written\n", "utf8");

    const result = await materializeEntry(
      request({ relPath: ".venv-config", strategy: "symlink" }),
      options(fix),
    );

    expect(result.outcome).toBe("skipped");
    expect(result.reason).toContain("already present");
    expect((await lstat(join(fix.worktreeRoot, ".venv-config"))).isSymbolicLink()).toBe(false);
  });

  /**
   * The Windows posture, over an injected errno. A POSIX `symlink(2)` into a
   * writable directory cannot be made to raise `EPERM` on this runner, and
   * there is no Windows job — so the branch is reached the only way it can be.
   */
  it("falls back to a copy when the link is refused with EPERM, and says so", async () => {
    const fix = await fixture();
    await seedSource(fix, ".venv-config", "layout=src\n", 0o644);

    const result = await materializeEntry(
      request({ relPath: ".venv-config", strategy: "symlink" }),
      options(fix, { symlinkImpl: () => Promise.reject(errnoError("EPERM")) }),
    );

    expect(result.outcome).toBe("materialized");
    expect(result.requested).toBe("symlink");
    expect(result.strategy).toBe("copy");
    expect(result.fallbackFrom).toBe("symlink");
    expect(result.sha256).toBe(sha256Hex("layout=src\n"));
    expect((await lstat(join(fix.worktreeRoot, ".venv-config"))).isSymbolicLink()).toBe(false);
    // REQ-WORKTREE-016: the receipt records what was PERFORMED.
    expect(receiptEntryFor(result)?.strategy).toBe("copy");
  });

  it("falls back on EACCES too", async () => {
    const fix = await fixture();
    await seedSource(fix, ".venv-config", "layout=src\n");

    const result = await materializeEntry(
      request({ relPath: ".venv-config", strategy: "symlink" }),
      options(fix, { symlinkImpl: () => Promise.reject(errnoError("EACCES")) }),
    );

    expect(result.outcome).toBe("materialized");
    expect(result.fallbackFrom).toBe("symlink");
  });

  it("does not fall back on any other errno", async () => {
    const fix = await fixture();
    await seedSource(fix, ".venv-config", "layout=src\n");

    const result = await materializeEntry(
      request({ relPath: ".venv-config", strategy: "symlink" }),
      options(fix, { symlinkImpl: () => Promise.reject(errnoError("ENOSPC")) }),
    );

    expect(result.outcome).toBe("failed");
    expect(result.errno).toBe("ENOSPC");
    expect(result.fallbackFrom).toBeUndefined();
    await expect(stat(join(fix.worktreeRoot, ".venv-config"))).rejects.toThrow();
  });

  /**
   * A directory link that cannot be made is NOT quietly deep-copied: the one
   * directory this lane would ever link is a dependency tree, and copying it
   * behind the operator's back is a gigabyte of surprise where a named failure
   * is one line.
   */
  it("fails rather than deep-copying a directory whose link was refused", async () => {
    const fix = await fixture();
    await mkdir(join(fix.sourceRoot, "vendor"), { recursive: true });
    await writeFile(join(fix.sourceRoot, "vendor", "pkg.json"), "{}", "utf8");

    const result = await materializeEntry(
      request({ relPath: "vendor", strategy: "symlink" }),
      options(fix, { symlinkImpl: () => Promise.reject(errnoError("EPERM")) }),
    );

    expect(result.outcome).toBe("failed");
    expect(result.reason).toContain("directory");
    await expect(stat(join(fix.worktreeRoot, "vendor"))).rejects.toThrow();
  });
});

describe("worktree materialization — a directory row covers its subtree (REQ-WORKTREE-003)", () => {
  it("expands a copied directory into one row per file, each with its own digest", async () => {
    const fix = await fixture();
    await seedTree(fix);

    const results = await materializeEntries([request({ relPath: "state" })], options(fix));

    expect(results.map((entry) => [entry.relPath, entry.outcome])).toEqual([
      ["state/a.json", "materialized"],
      ["state/cache/b.json", "materialized"],
    ]);
    expect(results.map((entry) => entry.sha256)).toEqual([sha256Hex('{"a":1}'), sha256Hex('{"b":2}')]);
    expect(await readFile(join(fix.worktreeRoot, "state/cache/b.json"), "utf8")).toBe('{"b":2}');
  });

  it("honours a skip carve-out inside the directory", async () => {
    const fix = await fixture();
    await seedTree(fix);

    const results = await materializeEntries(
      [request({ relPath: "state" })],
      options(fix, { isSkipped: (relPath) => relPath.startsWith("state/cache") }),
    );

    expect(results.map((entry) => entry.relPath)).toEqual(["state/a.json"]);
    await expect(stat(join(fix.worktreeRoot, "state/cache/b.json"))).rejects.toThrow();
  });

  it("reports a directory whose every path is carved out as skipped, and writes nothing", async () => {
    const fix = await fixture();
    await seedTree(fix);

    const results = await materializeEntries(
      [request({ relPath: "state" })],
      options(fix, { isSkipped: () => true }),
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.outcome).toBe("skipped");
    await expect(stat(join(fix.worktreeRoot, "state"))).rejects.toThrow();
  });
});

describe("worktree materialization — the win32 mode residual (REQ-WORKTREE-016)", () => {
  it("copies a secret without a chmod on win32, and reports the mode as the platform's", async () => {
    const fix = await fixture();
    await seedSource(fix, ".env.mcp", SECRET_BODY, 0o644);

    const result = await materializeEntry(
      request({ secret: true }),
      options(fix, { platform: "win32" }),
    );

    expect(result.outcome).toBe("materialized");
    expect(result.secretModeApplied).toBe(false);
    expect(result.mode).toBeUndefined();
    // The copy still happens; only the hardening is skipped.
    expect(await readFile(join(fix.worktreeRoot, ".env.mcp"), "utf8")).toBe(SECRET_BODY);
    expect((await stat(join(fix.worktreeRoot, ".env.mcp"))).mode & 0o777).not.toBe(0o600);
  });
});

describe("worktree materialization — the batch and its receipt rows (REQ-WORKTREE-011)", () => {
  it("returns one result per request, in request order, mixing outcomes", async () => {
    const fix = await fixture();
    await seedSource(fix, ".env.mcp", SECRET_BODY);
    await seedSource(fix, "keep.json", "{}", 0o644);
    await writeFile(join(fix.worktreeRoot, "keep.json"), "{}", "utf8");

    const results = await materializeEntries(
      [
        request({ secret: true }),
        request({ relPath: "keep.json" }),
        request({ relPath: "never-written.json" }),
      ],
      options(fix),
    );

    expect(results.map((entry) => [entry.relPath, entry.outcome])).toEqual([
      [".env.mcp", "materialized"],
      ["keep.json", "skipped"],
      ["never-written.json", "absent"],
    ]);
  });

  /**
   * A skipped-as-present row still lands in the receipt, with the digest of the
   * file that is actually there. The receipt REPLACES its predecessor on a
   * re-run, so omitting the row would drop the only teardown authority over a
   * copy the first run placed — and for the entry this lane copies by default,
   * that is credential material left behind.
   */
  // win32-gated: the receipt row records the forced 0600 mode, a POSIX mode
  // assertion — see WINDOWS. The materialized/skipped/absent outcome rows are
  // covered platform-independently by the outcome case above.
  it.skipIf(WINDOWS)("records materialized and skipped rows, and never absent or failed ones", async () => {
    const fix = await fixture();
    await seedSource(fix, ".env.mcp", SECRET_BODY);
    const existing = "MCP_GITHUB_TOKEN=placed-by-the-first-run\n";
    await seedSource(fix, "keep.json", "{}");
    await writeFile(join(fix.worktreeRoot, "keep.json"), existing, "utf8");

    const [copied, skipped, absent] = await materializeEntries(
      [request({ secret: true }), request({ relPath: "keep.json" }), request({ relPath: "gone.json" })],
      options(fix),
    );

    expect(receiptEntryFor(copied!)).toEqual({
      path: ".env.mcp",
      strategy: "copy",
      mode: "0600",
      sha256: sha256Hex(SECRET_BODY),
    });
    expect(receiptEntryFor(skipped!)?.sha256).toBe(sha256Hex(existing));
    expect(receiptEntryFor(absent!)).toBeNull();
  });

  it("writes no receipt row for a failed entry", async () => {
    const fix = await fixture();
    await seedSource(fix, "state/token.json", "{}");
    await writeFile(join(fix.worktreeRoot, "state"), "not a directory", "utf8");

    const [failed] = await materializeEntries(
      [request({ relPath: "state/token.json" })],
      options(fix),
    );

    expect(failed?.outcome).toBe("failed");
    expect(receiptEntryFor(failed!)).toBeNull();
  });
});

/** An error shaped like a libuv one, for the injected-errno branches above. */
function errnoError(code: string): NodeJS.ErrnoException {
  const error = new Error(`${code}: injected`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

async function present(absPath: string): Promise<boolean> {
  return lstat(absPath).then(
    () => true,
    () => false,
  );
}

// A copy reads its mode via lstat, so a symlink source yields 0777, copyFile
// follows the link, and applyMode stamps 0777 onto bytes nobody chose that mode
// for. The module's own invariant (materialize.ts:23-26) forbids that.
describe("copy never stamps a symlink's 0777 onto the copied bytes [secfix W4]", () => {
  it("skips a symlink child inside a copied directory rather than copying it at 0777 [secfix]", async () => {
    const fix = await fixture();
    await mkdir(join(fix.sourceRoot, "d"), { recursive: true });
    await writeFile(join(fix.sourceRoot, "d", "real.txt"), "bytes\n", "utf8");
    const target = join(fix.sourceRoot, "target.txt");
    await writeFile(target, "secret\n", "utf8");
    await chmod(target, 0o600);
    await symlink(target, join(fix.sourceRoot, "d", "link.txt"));

    const results = await materializeEntries([{ relPath: "d", strategy: "copy", secret: false }], {
      sourceRoot: fix.sourceRoot,
      worktreeRoot: fix.worktreeRoot,
    });

    for (const result of results) {
      if (result.mode !== undefined) expect(result.mode).not.toBe("0777");
    }
    const linkDest = join(fix.worktreeRoot, "d", "link.txt");
    if (await present(linkDest)) {
      expect((await lstat(linkDest)).mode & 0o777).not.toBe(0o777);
    }
    // The real file still travelled.
    expect(await present(join(fix.worktreeRoot, "d", "real.txt"))).toBe(true);
  });

  // win32-gated: asserts the exact 0644 read through the link — a POSIX mode
  // assertion — see WINDOWS. The sibling case above proves the 0777 guard with a
  // platform-independent `.not.toBe(0o777)`.
  it.skipIf(WINDOWS)("reads a directly-named symlink source's mode through the link, not as 0777 [secfix]", async () => {
    const fix = await fixture();
    const target = join(fix.sourceRoot, "target.txt");
    await writeFile(target, "data\n", "utf8");
    await chmod(target, 0o644);
    await symlink(target, join(fix.sourceRoot, "link.txt"));

    const [result] = await materializeEntries([{ relPath: "link.txt", strategy: "copy", secret: false }], {
      sourceRoot: fix.sourceRoot,
      worktreeRoot: fix.worktreeRoot,
    });

    expect(result?.outcome).toBe("materialized");
    expect(result?.mode).toBe("0644");
    expect((await lstat(join(fix.worktreeRoot, "link.txt"))).mode & 0o777).toBe(0o644);
  });
});
