import { chmod, lstat, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  acquireWriteLock,
  disableCrossProcessLocking,
  resetCrossProcessLocking,
} from "../../src/merge/atomicWrite.ts";
import { EngineError, type ErrorCode } from "../../src/types/errors.ts";
import {
  addWorktree,
  checkWorktreeNameShape,
  classifyFetchFailure,
  fetchBranch,
  classifyRepoPaths,
  assertWorktreeName,
  listWorktrees,
  parseWorktreeList,
  readStashCount,
  runGit,
  shortBranchName,
  worktreePathFor,
  type GitInvocation,
  type GitOutcome,
  type WorktreeGitRunner,
} from "../../src/worktree/git.ts";
import {
  planWorktreeSetup,
  probeSetupPresence,
  resolveBranchPlan,
  runWorktreeSetup,
  worktreeLockPath,
  type WorktreeSetupConsent,
  type WorktreeSetupOptions,
} from "../../src/worktree/setup.ts";
import {
  readWorktreeInventory,
  runWorktreeCleanup,
  type WorktreeCleanupOptions,
} from "../../src/worktree/cleanup.ts";
import { WORKTREE_FARM_DIR_NAME, builtInWorktreePolicy, resolveFarmDir } from "../../src/worktree/policy.ts";
import { sha256Hex, worktreeReceiptPath } from "../../src/worktree/receipt.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * WT-U1b: the worktree lane's git orchestration — the branch plan, the
 * name-scoped lock, and the setup/cleanup flows.
 *
 * **Real git throughout, and that is the point.** Every property this unit
 * claims is a property of what git actually does: `--porcelain -z` records,
 * `check-ignore --stdin` exit statuses, `worktree add` refusing a branch already
 * checked out, `rev-parse --git-dir` resolving to the PER-WORKTREE admin
 * directory, `worktree remove` refusing a dirty tree. A stubbed runner would
 * assert this suite's beliefs about git rather than git's behaviour, and the
 * spec's own risk register names exactly that: the receipt's placement depends
 * on a git behaviour, not on this project's code, so it is pinned by an
 * assertion rather than trusted.
 *
 * The git runner is never replaced. Two seams ARE injected, each because the
 * live source cannot answer here: `cwd`, because a test process cannot chdir
 * into a fixture without corrupting every other suite sharing the worker, and
 * the receipt's clock, because a timestamp read from the wall makes the
 * document non-reproducible. Everything else — including the transport failure
 * (a `file://` remote pointed at a directory that is not a repository) and the
 * prunable registration (a real worktree directory deleted out from under a
 * real registration) — is produced by real git.
 *
 * `describe.skipIf(!gitAvailable)` skips — and REPORTS as skipped — the
 * git-dependent blocks when git is unavailable, the same posture
 * `test/support/repoFixtures.ts` takes.
 */

// Detected at collection time (top-level await) rather than in `beforeAll`, so
// `describe.skipIf` below can REPORT the git-dependent blocks as skipped when
// git is absent instead of silently passing an early `return`.
const gitAvailable = (await runGit({ args: ["--version"], cwd: process.cwd() })).status === 0;

/**
 * POSIX mode assertion gate. Node cannot set or read 0o600/0o700/0o755 on
 * Windows (a writable file reads back 0o666) and `chmod` does not restrict a
 * directory there, so an exact-mode assertion tests a mechanism the platform
 * lacks. Where a case is ENTIRELY a mode check it is `it.skipIf(WINDOWS)`; where
 * one mode assertion sits among platform-independent ones (a checkout path, a
 * dirty count), only that line is guarded with `if (!WINDOWS)`, so the rest
 * still runs — and gates — on Windows. The farm's Windows protection is ACL
 * inheritance under a user-scoped location, not a chmod bit (see
 * docs/specs/worktree-lane.md § Windows).
 */
const WINDOWS = process.platform === "win32";

const getRoot = useTempDir("worktree-engine");

/** Runs git in a fixture and throws with git's own stderr when it fails. */
async function mustGit(cwd: string, ...args: string[]): Promise<string> {
  const outcome = await runGit({ args, cwd });
  if (outcome.status !== 0) {
    throw new Error(`git ${args.join(" ")} in ${cwd} failed (${outcome.status}): ${outcome.stderr}`);
  }
  return outcome.stdout;
}

interface Fixture {
  /** The repository root. */
  readonly root: string;
  /** The farm the built-in policy resolves to for this root. */
  readonly farm: string;
}

const IDENTITY = [
  "-c",
  "user.name=Fixture",
  "-c",
  "user.email=fixture@example.invalid",
  "-c",
  "commit.gpgsign=false",
];

const IGNORE_FILE = ".env.mcp\nnode_modules/\n";
const SECRET_BODY = "MCP_TOKEN=example-token\nMCP_KEY=example-key\n";

/**
 * A repository with one commit, a `.gitignore` covering the two default policy
 * rows, a committed `.stamity/manifest.json` (so the presence probe has
 * something to find), an IGNORED `.env.mcp`, and an ignored `node_modules`.
 *
 * Non-degenerate on purpose: the admissibility pass, the entry table and the
 * receipt all have to distinguish tracked from ignored from untracked, and a
 * repository holding one file cannot tell them apart.
 */
async function seedRepo(base: string, name = "repo"): Promise<Fixture> {
  const root = join(base, name);
  await mkdir(join(root, ".stamity"), { recursive: true });
  await mustGit(root, "-c", "init.defaultBranch=main", "init", "--quiet");
  await writeFile(join(root, ".gitignore"), IGNORE_FILE, "utf8");
  await writeFile(join(root, "README.md"), "# fixture\n", "utf8");
  await writeFile(join(root, ".stamity", "manifest.json"), '{"version":1}\n', "utf8");
  await mustGit(root, "add", "-A");
  await mustGit(root, ...IDENTITY, "commit", "--quiet", "-m", "fixture");

  // Machine-local state, present but never committed: exactly what the lane exists to carry.
  await writeFile(join(root, ".env.mcp"), SECRET_BODY, "utf8");
  await chmod(join(root, ".env.mcp"), 0o600);
  await mkdir(join(root, "node_modules", "left-pad"), { recursive: true });
  await writeFile(join(root, "node_modules", "left-pad", "index.js"), "module.exports=1\n", "utf8");

  return { root, farm: join(dirname(root), WORKTREE_FARM_DIR_NAME, basename(root)) };
}

/** A bare repository serving as `origin` over `file://`, with `branch` pushed to it. */
async function seedOrigin(fix: Fixture, base: string, branch: string): Promise<string> {
  const remote = join(base, "origin.git");
  await mkdir(remote, { recursive: true });
  await mustGit(remote, "-c", "init.defaultBranch=main", "init", "--bare", "--quiet");
  await mustGit(fix.root, "remote", "add", "origin", `file://${remote}`);
  await mustGit(fix.root, ...IDENTITY, "branch", branch);
  await mustGit(fix.root, "push", "--quiet", "origin", branch);
  // Delete the local branch, so the only place the name lives is the remote —
  // otherwise the plan would resolve `attach` and never reach the track path.
  await mustGit(fix.root, "branch", "-D", branch);
  await mustGit(fix.root, "update-ref", "-d", `refs/remotes/origin/${branch}`);
  return remote;
}

/**
 * A policy file with TWO materializing rows — the secret one first — so an
 * assertion on the entry table can tell an appended row from an in-place one,
 * and a dropped row from a kept one. The built-in defaults have exactly one
 * materializing row, which cannot distinguish any of those.
 */
async function declareTwoRowPolicy(fix: Fixture): Promise<void> {
  await writeFile(join(fix.root, "extra.local"), "second entry\n", "utf8");
  await writeFile(join(fix.root, ".gitignore"), `${IGNORE_FILE}extra.local\n`, "utf8");
  await mustGit(fix.root, "add", "-A");
  await mustGit(fix.root, ...IDENTITY, "commit", "--quiet", "-m", "ignore extra");
  await mkdir(join(fix.root, ".stamity"), { recursive: true });
  await writeFile(
    join(fix.root, ".stamity", "worktree.json"),
    JSON.stringify({
      version: 1,
      entries: [
        { path: ".env.mcp", strategy: "copy", secret: true },
        { path: "extra.local", strategy: "copy" },
      ],
    }),
    "utf8",
  );
}

const GRANTED: WorktreeSetupConsent = { attach: "granted", track: "granted", secrets: "granted" };
const UNANSWERED: WorktreeSetupConsent = {
  attach: "unanswered",
  track: "unanswered",
  secrets: "unanswered",
};

function setupOptions(
  fix: Fixture,
  name: string,
  overrides: Partial<WorktreeSetupOptions> = {},
): WorktreeSetupOptions {
  return {
    repoRoot: fix.root,
    name,
    engineVersion: "1.0.0-test",
    now: () => new Date("2026-08-31T12:00:00.000Z"),
    consent: GRANTED,
    ...overrides,
  };
}

function cleanupOptions(
  fix: Fixture,
  overrides: Partial<WorktreeCleanupOptions> = {},
): WorktreeCleanupOptions {
  return { repoRoot: fix.root, farmDir: fix.farm, cwd: fix.root, ...overrides };
}

/** Asserts a classified refusal and hands the error back for message checks. */
async function refuses(run: () => Promise<unknown>, code: ErrorCode): Promise<EngineError> {
  let caught: unknown = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  expect(caught, "expected a refusal, none was thrown").toBeInstanceOf(EngineError);
  const error = caught as EngineError;
  expect(error.code).toBe(code);
  return error;
}

async function exists(absPath: string): Promise<boolean> {
  return lstat(absPath).then(
    () => true,
    () => false,
  );
}

// ---------------------------------------------------------------------------
// The pure half of the git seam
// ---------------------------------------------------------------------------

describe("git output parsing (REQ-WORKTREE-007, REQ-WORKTREE-014)", () => {
  it("reads three records of --porcelain -z with branch, detached, locked and prunable", () => {
    const output =
      "worktree /repo\0HEAD abc123\0branch refs/heads/release/2.x\0\0" +
      "worktree /farm/gone\0HEAD def456\0detached\0prunable gitdir file points to non-existent location\0\0" +
      "worktree /farm/held\0HEAD 999aaa\0branch refs/heads/feat\0locked keeping this one\0\0";

    const entries = parseWorktreeList(output);

    expect(entries).toHaveLength(3);
    // Branch names containing a slash survive the short-name reduction.
    expect(entries[0]).toMatchObject({ path: "/repo", branch: "release/2.x", head: "abc123" });
    expect(entries[1]).toMatchObject({
      path: "/farm/gone",
      branch: null,
      detached: true,
      prunable: true,
      prunableReason: "gitdir file points to non-existent location",
    });
    expect(entries[2]).toMatchObject({
      path: "/farm/held",
      branch: "feat",
      locked: true,
      lockReason: "keeping this one",
    });
    // A bare `locked` with no reason is still locked, and carries no reason.
    expect(parseWorktreeList("worktree /x\0HEAD a\0locked\0\0")[0]).toMatchObject({
      locked: true,
      lockReason: null,
    });
  });

  it("returns nothing for empty output rather than a half-built record", () => {
    expect(parseWorktreeList("")).toEqual([]);
  });

  it("normalises the git-reported worktree path to the native form at the listWorktrees seam", async () => {
    // git prints forward-slash paths on every platform, and on a POSIX runner
    // that IS the native form, so the Windows backslash conversion is invisible
    // here. This case instead proves the seam applies `resolve` at all: it feeds
    // a non-normalised, non-canonical path (a `.` segment) that a verbatim
    // passthrough would leave untouched, and asserts the reported path is the
    // resolved one — the same operation that rewrites separators on Windows.
    const gitPath = "/farm/repo/./held";
    // A stub runner: the real git binary is not the unit under test, and driving
    // it would only re-derive the porcelain grammar the parser already owns.
    const runner: WorktreeGitRunner = (invocation) => {
      expect(invocation.args).toEqual(["worktree", "list", "--porcelain", "-z"]);
      return Promise.resolve({ status: 0, stdout: `worktree ${gitPath}\0HEAD abc\0\0`, stderr: "" });
    };

    const [entry] = await listWorktrees(runner, "/farm/repo");
    expect(entry?.path).toBe(join("/farm", "repo", "held"));
    expect(entry?.path).not.toBe(gitPath);
  });

  it("reduces refs/heads/<name> and leaves anything else alone", () => {
    expect(shortBranchName("refs/heads/feat/api")).toBe("feat/api");
    expect(shortBranchName("feat")).toBe("feat");
  });

  it("separates a missing remote ref from a transport failure", () => {
    expect(classifyFetchFailure("fatal: couldn't find remote ref nosuchbranch")).toBe("missing-ref");
    expect(classifyFetchFailure("fatal: Could not read from remote repository.")).toBe("transport");
  });
});

describe("worktree name rules (REQ-WORKTREE-009)", () => {
  it("accepts a nested name and refuses every path-unsafe spelling", () => {
    expect(checkWorktreeNameShape("feat/api")).toBeNull();

    expect(checkWorktreeNameShape("")).toContain("empty");
    expect(checkWorktreeNameShape("../escape")).toContain("..");
    expect(checkWorktreeNameShape("-rf")).toContain("option");
    expect(checkWorktreeNameShape("/abs")).toContain("absolute");
    expect(checkWorktreeNameShape("feat\\api")).toContain("backslash");
    expect(checkWorktreeNameShape("feat/")).toContain("empty path segment");
    // Built from a code point rather than typed, so this source file stays text.
    expect(checkWorktreeNameShape(`feat${String.fromCodePoint(0x0a)}x`)).toContain(
      "control character",
    );
  });

  it("composes <farm>/<name> with a slash preserved as nesting, and refuses an escape", () => {
    expect(worktreePathFor("/farm", "feat/api")).toBe(join("/farm", "feat", "api"));
    expect(() => worktreePathFor("/farm", "../outside")).toThrowError(EngineError);
  });
});

// ---------------------------------------------------------------------------
// The git seam against the real binary
// ---------------------------------------------------------------------------

describe.skipIf(!gitAvailable)("git facts, read from a real repository", () => {
  it("classifies tracked, ignored and untracked paths in one batched pass", async () => {
    const fix = await seedRepo(getRoot().dir);
    await writeFile(join(fix.root, "review-gate.json"), "{}\n", "utf8");

    const classes = await classifyRepoPaths(runGit, fix.root, [
      "README.md",
      ".env.mcp",
      "node_modules",
      "review-gate.json",
    ]);

    expect(classes.get("README.md")).toBe("tracked");
    expect(classes.get(".env.mcp")).toBe("ignored");
    expect(classes.get("node_modules")).toBe("ignored");
    expect(classes.get("review-gate.json")).toBe("untracked");
  });

  it("refuses a name git's own check-ref-format rejects, before any write", async () => {
    const fix = await seedRepo(getRoot().dir);

    const error = await refuses(
      () => assertWorktreeName(runGit, fix.root, "feat..x"),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain("feat..x");
    expect(await exists(fix.farm)).toBe(false);
  });

  it("counts the clone's stash entries, and reports zero for a clone with none", async () => {
    const fix = await seedRepo(getRoot().dir);
    expect(await readStashCount(runGit, fix.root)).toBe(0);

    await writeFile(join(fix.root, "README.md"), "# edited\n", "utf8");
    await mustGit(fix.root, ...IDENTITY, "stash", "push", "--quiet", "-m", "one");
    await writeFile(join(fix.root, "README.md"), "# edited twice\n", "utf8");
    await mustGit(fix.root, ...IDENTITY, "stash", "push", "--quiet", "-m", "two");

    expect(await readStashCount(runGit, fix.root)).toBe(2);
  });

  it("fetches a real remote branch, falls through on a missing ref, and fails NETWORK_ERROR at the transport", async () => {
    const base = getRoot().dir;
    const fix = await seedRepo(base);
    await seedOrigin(fix, base, "remote-only");

    expect(await fetchBranch(runGit, fix.root, "remote-only")).toBe("fetched");
    expect(await fetchBranch(runGit, fix.root, "nosuchbranch")).toBe("missing-ref");

    await mustGit(fix.root, "remote", "set-url", "origin", `file://${join(base, "not-a-repo")}`);
    const error = await refuses(
      () => fetchBranch(runGit, fix.root, "remote-only"),
      "NETWORK_ERROR",
    );
    expect(error.message).toContain("remote-only");
  });
});

// ---------------------------------------------------------------------------
// The branch plan (REQ-WORKTREE-009)
// ---------------------------------------------------------------------------

describe.skipIf(!gitAvailable)("branch plan resolution (REQ-WORKTREE-009)", () => {
  it("resolves create when nothing anywhere carries the name", async () => {
    const fix = await seedRepo(getRoot().dir);

    const plan = await resolveBranchPlan(runGit, fix.root, "brand-new", { fetch: true });

    expect(plan.kind).toBe("create");
    expect(plan.checkedOutAt).toBeNull();
  });

  it("resolves attach for a local branch, and names the worktree already holding it", async () => {
    const fix = await seedRepo(getRoot().dir);
    await mustGit(fix.root, "branch", "held");

    const before = await resolveBranchPlan(runGit, fix.root, "held", { fetch: true });
    expect(before).toMatchObject({ kind: "attach", checkedOutAt: null });

    await runWorktreeSetup(setupOptions(fix, "held"));
    const after = await resolveBranchPlan(runGit, fix.root, "held", { fetch: true });

    expect(after.kind).toBe("attach");
    expect(after.checkedOutAt).toBe(join(fix.farm, "held"));
  });

  it("resolves track after a real fetch, and records that the remote was consulted", async () => {
    const base = getRoot().dir;
    const fix = await seedRepo(base);
    await seedOrigin(fix, base, "remote-only");

    const plan = await resolveBranchPlan(runGit, fix.root, "remote-only", { fetch: true });

    expect(plan.kind).toBe("track");
    expect(plan.remoteConsulted).toBe(true);
  });

  it("consults no remote under fetch:false, and says so in the reason", async () => {
    const base = getRoot().dir;
    const fix = await seedRepo(base);
    await seedOrigin(fix, base, "remote-only");

    const plan = await resolveBranchPlan(runGit, fix.root, "remote-only", { fetch: false });

    // The ref was never fetched, so local information alone knows nothing of it.
    expect(plan.kind).toBe("create");
    expect(plan.remoteConsulted).toBe(false);
    expect(plan.reason).toContain("NOT consulted");
  });
});

// ---------------------------------------------------------------------------
// Setup (REQ-WORKTREE-002, 004, 006, 010, 011, 012, 013)
// ---------------------------------------------------------------------------

describe.skipIf(!gitAvailable)("worktree setup", () => {
  it("creates the checkout, places the secret at 0600, and leaves both trees clean", async () => {
    const fix = await seedRepo(getRoot().dir);
    const before = await mustGit(fix.root, "status", "--porcelain");

    const result = await runWorktreeSetup(setupOptions(fix, "feat"));

    expect(result.status).toBe("complete");
    expect(result.branchPlan).toBe("create");
    expect(result.worktree.path).toBe(join(fix.farm, "feat"));
    expect(result.worktree.branch).toBe("feat");
    expect(result.worktree.head).toMatch(/^[0-9a-f]{40}$/);

    // The checkout supplies the committed content; the lane supplies the rest.
    expect(await readFile(join(fix.farm, "feat", "README.md"), "utf8")).toBe("# fixture\n");
    expect(await readFile(join(fix.farm, "feat", ".env.mcp"), "utf8")).toBe(SECRET_BODY);
    // POSIX mode assertion — guarded so the rest of this case (path, dirtiness)
    // still runs on Windows. See WINDOWS.
    if (!WINDOWS) expect((await stat(join(fix.farm, "feat", ".env.mcp"))).mode & 0o777).toBe(0o600);
    // `node_modules` is a `skip` row: present in the report's decision, absent on disk.
    expect(await exists(join(fix.farm, "feat", "node_modules"))).toBe(false);

    // REQ-WORKTREE-006 / REQ-WORKTREE-013: neither tree is dirtied by the run.
    expect(await mustGit(fix.root, "status", "--porcelain")).toBe(before);
    expect(await mustGit(join(fix.farm, "feat"), "status", "--porcelain")).toBe("");
  });

  it("writes the receipt where git says the worktree's git dir is", async () => {
    const fix = await seedRepo(getRoot().dir);

    const result = await runWorktreeSetup(setupOptions(fix, "feat"));

    // The placement is ASSERTED against git rather than assumed from a path shape.
    const gitDir = (await mustGit(join(fix.farm, "feat"), "rev-parse", "--absolute-git-dir")).trim();
    expect(result.receiptPath).toBe(worktreeReceiptPath(gitDir));

    const receipt = JSON.parse(await readFile(worktreeReceiptPath(gitDir), "utf8")) as {
      version: number;
      worktree: { path: string; branch: string; head: string };
      entries: { path: string; strategy: string; mode?: string; sha256?: string }[];
    };
    expect(receipt.version).toBe(1);
    expect(receipt.worktree).toEqual(result.worktree);
    expect(receipt.entries).toHaveLength(1);
    expect(receipt.entries[0]).toMatchObject({ path: ".env.mcp", strategy: "copy" });
    // The recorded mode is a POSIX mode assertion — guarded. See WINDOWS.
    if (!WINDOWS) expect(receipt.entries[0]?.mode).toBe("0600");
    expect(receipt.entries[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("preserves a slash in the name as nesting under the farm", async () => {
    const fix = await seedRepo(getRoot().dir);

    const result = await runWorktreeSetup(setupOptions(fix, "feat/api"));

    expect(result.worktree.path).toBe(join(fix.farm, "feat", "api"));
    expect(await exists(join(fix.farm, "feat", "api", "README.md"))).toBe(true);
  });

  it("skips a secret entry without consent, stays complete, and names the flag", async () => {
    const fix = await seedRepo(getRoot().dir);

    const result = await runWorktreeSetup(
      setupOptions(fix, "feat", { consent: { ...GRANTED, secrets: "unanswered" } }),
    );

    // A declined secret is a fact about the request, not a fault: exit 0.
    expect(result.status).toBe("complete");
    // The entry is a ROW carrying `skipped`, not an absence from the table.
    expect(result.entries).toEqual([
      {
        path: ".env.mcp",
        requested: "copy",
        strategy: "copy",
        outcome: "skipped",
        reason: expect.stringContaining("--copy-secrets"),
        mode: null,
        errno: null,
        fallbackFrom: null,
      },
    ]);
    expect(await exists(join(fix.farm, "feat", ".env.mcp"))).toBe(false);
    expect(result.notices.join("\n")).toContain("--copy-secrets");
    // ...and the receipt names nothing, because nothing was placed to invert.
    const gitDir = (await mustGit(join(fix.farm, "feat"), "rev-parse", "--absolute-git-dir")).trim();
    const receipt = JSON.parse(await readFile(worktreeReceiptPath(gitDir), "utf8")) as {
      entries: unknown[];
    };
    expect(receipt.entries).toEqual([]);
  });

  it("refuses to attach without consent, names the rerun, and creates nothing", async () => {
    const fix = await seedRepo(getRoot().dir);
    await mustGit(fix.root, "branch", "feat");

    const error = await refuses(
      () => runWorktreeSetup(setupOptions(fix, "feat", { consent: UNANSWERED })),
      "VALIDATION_ERROR",
    );

    expect(error.next).toContain("--use-existing");
    expect(error.next).toContain("stamity worktree setup feat");
    expect(await exists(join(fix.farm, "feat"))).toBe(false);
  });

  it("attaches to the existing branch once consent is given", async () => {
    const fix = await seedRepo(getRoot().dir);
    await mustGit(fix.root, "branch", "feat");

    const result = await runWorktreeSetup(setupOptions(fix, "feat"));

    expect(result.branchPlan).toBe("attach");
    expect(result.worktree.branch).toBe("feat");
  });

  it("suggests a different name when --no-use-existing meets an existing branch", async () => {
    const fix = await seedRepo(getRoot().dir);
    await mustGit(fix.root, "branch", "feat");

    const error = await refuses(
      () => runWorktreeSetup(setupOptions(fix, "feat", { consent: { ...GRANTED, attach: "declined" } })),
      "VALIDATION_ERROR",
    );

    expect(error.next).toContain("Pick a name");
  });

  it("refuses when the branch is already checked out in another worktree, naming its path", async () => {
    const fix = await seedRepo(getRoot().dir);
    await runWorktreeSetup(setupOptions(fix, "feat"));
    // A second farm entry asking for the same BRANCH under a different name.
    await mustGit(fix.root, "worktree", "add", "--detach", join(fix.farm, "spare"), "HEAD");
    await rm(join(fix.farm, "spare"), { recursive: true, force: true });
    await mustGit(fix.root, "worktree", "prune");

    const error = await refuses(
      () => runWorktreeSetup(setupOptions(fix, "feat")),
      "VALIDATION_ERROR",
    );

    // The refusal names the OTHER tree, which is the fact that resolves it.
    expect(error.message).toContain(join(fix.farm, "feat"));
  });

  it("tracks a remote-only branch with consent, and creates off HEAD when track is declined", async () => {
    const base = getRoot().dir;
    const fix = await seedRepo(base);
    await seedOrigin(fix, base, "remote-only");

    const unanswered = await refuses(
      () => runWorktreeSetup(setupOptions(fix, "remote-only", { consent: UNANSWERED })),
      "VALIDATION_ERROR",
    );
    expect(unanswered.next).toContain("--track");

    const declined = await runWorktreeSetup(
      setupOptions(fix, "remote-only", { consent: { ...GRANTED, track: "declined" } }),
    );
    expect(declined.branchPlan).toBe("create");
    // --no-track means a plain local branch: no upstream is configured.
    const upstream = await runGit({
      args: ["rev-parse", "--abbrev-ref", "remote-only@{upstream}"],
      cwd: fix.root,
    });
    expect(upstream.status).not.toBe(0);
  });

  it("tracks origin/<name> when consent is given", async () => {
    const base = getRoot().dir;
    const fix = await seedRepo(base);
    await seedOrigin(fix, base, "remote-only");

    const result = await runWorktreeSetup(setupOptions(fix, "remote-only"));

    expect(result.branchPlan).toBe("track");
    expect(
      (await mustGit(fix.root, "rev-parse", "--abbrev-ref", "remote-only@{upstream}")).trim(),
    ).toBe("origin/remote-only");
  });

  it("reports the setup probe as absent on a branch predating init, and stays complete", async () => {
    const fix = await seedRepo(getRoot().dir);
    // A branch whose tree has no .stamity/manifest.json — the one case the
    // retired auto-sync existed for.
    await mustGit(fix.root, "rm", "--quiet", "-r", "--cached", ".stamity");
    await rm(join(fix.root, ".stamity"), { recursive: true, force: true });
    await mustGit(fix.root, ...IDENTITY, "commit", "--quiet", "-m", "drop setup");

    const result = await runWorktreeSetup(setupOptions(fix, "old"));

    expect(result.status).toBe("complete");
    expect(result.setup).toBe("absent");
    expect(result.notices.join("\n")).toContain("stamity init");
    // Nothing was regenerated: no sync ran, so the checkout is byte-clean.
    expect(await mustGit(join(fix.farm, "old"), "status", "--porcelain")).toBe("");
  });

  it("returns partial, with the tree and the per-entry failure both intact (REQ-WORKTREE-011)", async () => {
    const fix = await seedRepo(getRoot().dir);
    // A dangling link: `lstat` succeeds so the row is admitted, and `copyFile`
    // follows it and fails with ENOENT. The real errno, from the real syscall.
    await writeFile(join(fix.root, ".gitignore"), `${IGNORE_FILE}broken.local\n`, "utf8");
    await mustGit(fix.root, "add", "-A");
    await mustGit(fix.root, ...IDENTITY, "commit", "--quiet", "-m", "ignore broken");
    await symlink(join(fix.root, "no-such-target"), join(fix.root, "broken.local"));
    await mkdir(join(fix.root, ".stamity"), { recursive: true });
    await writeFile(
      join(fix.root, ".stamity", "worktree.json"),
      JSON.stringify({
        version: 1,
        entries: [
          { path: ".env.mcp", strategy: "copy", secret: true },
          { path: "broken.local", strategy: "copy" },
        ],
      }),
      "utf8",
    );

    const result = await runWorktreeSetup(setupOptions(fix, "feat"));

    expect(result.status).toBe("partial");
    // The payload survives: the operator learns a tree EXISTS and where it is.
    expect(result.worktree.path).toBe(join(fix.farm, "feat"));
    expect(await exists(join(fix.farm, "feat", "README.md"))).toBe(true);
    // ...and that one entry landed while the other did not.
    expect(result.entries.map((entry) => [entry.path, entry.outcome])).toEqual([
      [".env.mcp", "materialized"],
      ["broken.local", "failed"],
    ]);
    expect(result.entries[1]?.errno).toBe("ENOENT");
    expect(await exists(join(fix.farm, "feat", "broken.local"))).toBe(false);

    // The error document a returned exit-1 result OWES, naming the recovery.
    // Contract change (frontier W1): the recovery is `cleanup` + a fresh setup,
    // NOT a re-run of `setup` — the tree now exists, so a second `setup` would
    // refuse on the present directory. The receipt landed here (only an entry
    // failed), so plain `cleanup` inverts what did land.
    expect(result.error?.code).toBe("FS_ERROR");
    expect(result.error?.next).toContain("stamity worktree cleanup feat");
    // The receipt still records what DID land, so cleanup can invert it.
    const gitDir = (await mustGit(join(fix.farm, "feat"), "rev-parse", "--absolute-git-dir")).trim();
    const receipt = JSON.parse(await readFile(worktreeReceiptPath(gitDir), "utf8")) as {
      entries: { path: string }[];
    };
    expect(receipt.entries.map((entry) => entry.path)).toEqual([".env.mcp"]);
  });

  it("says so in the report when the lock opt-out is live (REQ-WORKTREE-010)", async () => {
    const fix = await seedRepo(getRoot().dir);

    // The process-level opt-out rather than the env var: setting STAMITY_LOCK
    // would outlive this test for every other case in the worker, and the
    // substrate reads both through one predicate.
    disableCrossProcessLocking();
    try {
      const result = await runWorktreeSetup(setupOptions(fix, "unlocked"));
      expect(result.notices.join("\n")).toContain("UNSUPPORTED");
    } finally {
      resetCrossProcessLocking();
    }

    const locked = await runWorktreeSetup(setupOptions(fix, "locked-again"));
    expect(locked.notices.join("\n")).not.toContain("UNSUPPORTED");
  });

  it("reads the presence probe's three answers", async () => {
    const root = getRoot().dir;
    expect(await probeSetupPresence(join(root, "nothing-here"))).toBe("absent");

    await mkdir(join(root, "broken", ".stamity"), { recursive: true });
    await writeFile(join(root, "broken", ".stamity", "manifest.json"), "{not json", "utf8");
    expect(await probeSetupPresence(join(root, "broken"))).toBe("unreadable");

    await mkdir(join(root, "good", ".stamity"), { recursive: true });
    await writeFile(join(root, "good", ".stamity", "manifest.json"), '{"version":1}', "utf8");
    expect(await probeSetupPresence(join(root, "good"))).toBe("present");
  });
});

describe.skipIf(!gitAvailable)("dry-run parity (REQ-WORKTREE-012)", () => {
  it("predicts the real run's entry table row for row, and writes nothing", async () => {
    const fix = await seedRepo(getRoot().dir);

    const plan = await planWorktreeSetup({ repoRoot: fix.root, name: "feat", fetch: false });

    expect(await exists(fix.farm)).toBe(false);
    const listBefore = await mustGit(fix.root, "worktree", "list");

    const result = await runWorktreeSetup(setupOptions(fix, "feat"));

    expect(plan.entries.map((entry) => [entry.path, entry.strategy])).toEqual([
      [".env.mcp", "copy"],
    ]);
    expect(result.entries.map((entry) => [entry.path, entry.strategy])).toEqual(
      plan.entries.map((entry) => [entry.path, entry.strategy]),
    );
    expect(plan.worktreePath).toBe(result.worktree.path);
    // The preview really did not touch git.
    expect(listBefore.split("\n").filter((line) => line.trim() !== "")).toHaveLength(1);
  });

  it("keeps a withheld secret in its own row and its own position in the table", async () => {
    const fix = await seedRepo(getRoot().dir);
    // Two materializing rows, the secret first, so an appended skip row would
    // reorder the table and a dropped one would shorten it. One row cannot
    // tell either failure from a pass.
    await declareTwoRowPolicy(fix);

    const plan = await planWorktreeSetup({ repoRoot: fix.root, name: "feat", fetch: false });
    const result = await runWorktreeSetup(
      setupOptions(fix, "feat", { consent: { ...GRANTED, secrets: "unanswered" } }),
    );

    expect(plan.entries.map((entry) => entry.path)).toEqual([".env.mcp", "extra.local"]);
    expect(result.entries.map((entry) => [entry.path, entry.outcome])).toEqual([
      [".env.mcp", "skipped"],
      ["extra.local", "materialized"],
    ]);
  });

  it("names the gate a real run would hit and the answer this invocation gives it", async () => {
    const fix = await seedRepo(getRoot().dir);
    await mustGit(fix.root, "branch", "feat");

    const plan = await planWorktreeSetup({
      repoRoot: fix.root,
      name: "feat",
      fetch: false,
      consent: UNANSWERED,
    });

    expect(plan.gates).toEqual([
      { gate: "attach", answer: "unanswered", effect: "refuse" },
      { gate: "secrets", answer: "unanswered", effect: "skip" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// The lock (REQ-WORKTREE-010)
// ---------------------------------------------------------------------------

describe.skipIf(!gitAvailable)("the name lock (REQ-WORKTREE-010)", () => {
  it("places the lock under the shared git common dir, one file per name", async () => {
    const fix = await seedRepo(getRoot().dir);
    const commonDir = (await mustGit(fix.root, "rev-parse", "--absolute-git-dir")).trim();

    expect(worktreeLockPath(commonDir, "feat")).toBe(
      join(commonDir, "stamity", "worktree", "feat"),
    );
    expect(worktreeLockPath(commonDir, "a")).not.toBe(worktreeLockPath(commonDir, "b"));
  });

  it("lets exactly one of two concurrent same-name setups win, with no torn farm state", async () => {
    const fix = await seedRepo(getRoot().dir);

    const settled = await Promise.allSettled([
      runWorktreeSetup(setupOptions(fix, "race")),
      runWorktreeSetup(setupOptions(fix, "race")),
    ]);

    const won = settled.filter((outcome) => outcome.status === "fulfilled");
    const lost = settled.filter((outcome) => outcome.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);

    // The loser refuses cleanly, on the directory the winner really created —
    // and it is THIS LANE's pre-add existence check that caught it, not git's
    // own refusal inside `worktree add`. That distinction is the lock: without
    // it both runners pass a check that ran before either wrote, and the loser
    // is stopped by git one step later with a different next step.
    const reason = (lost[0] as PromiseRejectedResult).reason as EngineError;
    expect(reason).toBeInstanceOf(EngineError);
    expect(reason.code).toBe("VALIDATION_ERROR");
    expect(reason.message).toContain("already exists");
    expect(reason.next).toBe(
      "Run `stamity worktree cleanup race` first, or set up under a different name.",
    );

    // Exactly one tree, and it is whole: the branch, the copy, and the receipt.
    expect(await readdir(fix.farm)).toEqual(["race"]);
    expect(await mustGit(join(fix.farm, "race"), "status", "--porcelain")).toBe("");
    expect(await readFile(join(fix.farm, "race", ".env.mcp"), "utf8")).toBe(SECRET_BODY);
    const gitDir = (await mustGit(join(fix.farm, "race"), "rev-parse", "--absolute-git-dir")).trim();
    expect(await exists(worktreeReceiptPath(gitDir))).toBe(true);
    expect(
      (await mustGit(fix.root, "worktree", "list")).split("\n").filter((line) => line.trim() !== ""),
    ).toHaveLength(2);
  });

  /**
   * The discriminating case for REQ-WORKTREE-010, and the reason the Promise.all
   * test above is not one on its own: two concurrent runners are ALSO stopped by
   * git's own refusal inside `worktree add`, so a suite holding only that case
   * stays green with the lock deleted. Holding the lock out of band cannot be
   * satisfied by anything except taking it.
   *
   * ~5s by construction — the substrate's own queue budget, which is the
   * behaviour under test rather than an arbitrary sleep.
   */
  it("makes a second setup of a HELD name time out, while another name goes straight through", async () => {
    const fix = await seedRepo(getRoot().dir);
    const commonDir = (await mustGit(fix.root, "rev-parse", "--absolute-git-dir")).trim();

    const release = await acquireWriteLock(worktreeLockPath(commonDir, "held"), commonDir);
    try {
      // Name-scoped, so independent work stays independent.
      expect((await runWorktreeSetup(setupOptions(fix, "other"))).status).toBe("complete");

      const error = await refuses(() => runWorktreeSetup(setupOptions(fix, "held")), "LOCK_TIMEOUT");
      expect(error.message).toContain(worktreeLockPath(commonDir, "held"));
      expect(await exists(join(fix.farm, "held"))).toBe(false);
    } finally {
      await release();
    }
  }, 20_000);

  it("runs two DIFFERENT names concurrently, and both succeed", async () => {
    const fix = await seedRepo(getRoot().dir);

    const [one, two] = await Promise.all([
      runWorktreeSetup(setupOptions(fix, "alpha")),
      runWorktreeSetup(setupOptions(fix, "beta")),
    ]);

    expect(one.status).toBe("complete");
    expect(two.status).toBe("complete");
    expect((await readdir(fix.farm)).toSorted()).toEqual(["alpha", "beta"]);
  });
});

// ---------------------------------------------------------------------------
// Cleanup (REQ-WORKTREE-006, REQ-WORKTREE-007)
// ---------------------------------------------------------------------------

describe.skipIf(!gitAvailable)("worktree cleanup", () => {
  it("round-trips: the tree goes, the repo is pristine, and the branch survives", async () => {
    const fix = await seedRepo(getRoot().dir);
    const before = await mustGit(fix.root, "status", "--porcelain");
    await runWorktreeSetup(setupOptions(fix, "feat"));

    const result = await runWorktreeCleanup(cleanupOptions(fix, { names: ["feat"] }));

    expect(result.status).toBe("complete");
    expect(await exists(join(fix.farm, "feat"))).toBe(false);
    expect(await mustGit(fix.root, "status", "--porcelain")).toBe(before);
    expect(
      (await mustGit(fix.root, "worktree", "list")).split("\n").filter((line) => line.trim() !== ""),
    ).toHaveLength(1);

    const report = result.worktrees.find((entry) => entry.branch === "feat");
    expect(report?.removed).toBe(true);
    expect(report?.files).toEqual([
      { path: ".env.mcp", outcome: "removed", reason: "digest-match", detail: null },
    ]);
    // Invariant 4: the branch is NAMED, never deleted.
    expect(report?.branchCommand).toBe("git branch -d feat");
    expect(await mustGit(fix.root, "branch", "--list", "feat")).toContain("feat");
  });

  it("keeps a diverged copy under --files-only and reports why", async () => {
    const fix = await seedRepo(getRoot().dir);
    await runWorktreeSetup(setupOptions(fix, "feat"));
    const copy = join(fix.farm, "feat", ".env.mcp");
    await writeFile(copy, `${SECRET_BODY}MCP_EXTRA=typed-by-hand\n`, "utf8");

    const result = await runWorktreeCleanup(
      cleanupOptions(fix, { names: ["feat"], filesOnly: true }),
    );

    const report = result.worktrees[0];
    expect(report?.files).toEqual([
      {
        path: ".env.mcp",
        outcome: "kept",
        reason: "diverged",
        detail: "the bytes differ from what setup placed, so the copy was left where it is",
      },
    ]);
    // The only copy of bytes the operator typed is still there, and so is the tree.
    expect(await readFile(copy, "utf8")).toContain("typed-by-hand");
    expect(report?.removed).toBe(false);
    expect(await exists(join(fix.farm, "feat"))).toBe(true);
  });

  it("refuses the whole run when the cwd is inside a candidate, and removes nothing", async () => {
    const fix = await seedRepo(getRoot().dir);
    await runWorktreeSetup(setupOptions(fix, "feat"));

    const error = await refuses(
      () =>
        runWorktreeCleanup(
          // Injected rather than a real chdir: a test process cannot change
          // directory without corrupting every other suite in the worker.
          cleanupOptions(fix, { names: ["feat"], cwd: join(fix.farm, "feat", "src") }),
        ),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain(join(fix.farm, "feat"));
    expect(error.next).toContain(fix.root);
    expect(await exists(join(fix.farm, "feat"))).toBe(true);
  });

  it("classifies a worktree whose receipt this build cannot read as a managed-orphan, and leaves it under --files-only", async () => {
    // Contract change (frontier W1): a farm-resident tree with no READABLE
    // receipt — here a future version this build cannot parse — is now the
    // managed-orphan class rather than `other`. It is still left alone when the
    // run is not authorised to remove it (here `--files-only`, which has no
    // receipt to invert), and the unreadable reason is still reported.
    const fix = await seedRepo(getRoot().dir);
    await runWorktreeSetup(setupOptions(fix, "feat"));
    const gitDir = (await mustGit(join(fix.farm, "feat"), "rev-parse", "--absolute-git-dir")).trim();
    const receiptPath = worktreeReceiptPath(gitDir);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as Record<string, unknown>;
    await writeFile(receiptPath, JSON.stringify({ ...receipt, version: 2 }), "utf8");

    const result = await runWorktreeCleanup(cleanupOptions(fix, { names: ["feat"], filesOnly: true }));

    expect(result.status).toBe("complete");
    const report = result.worktrees.find((entry) => entry.path === join(fix.farm, "feat"));
    expect(report?.classification).toBe("managed-orphan");
    expect(report?.removed).toBe(false);
    expect(report?.skipped).toContain("version 2");
    // No receipt this build reads means no per-file authority: the copy stays.
    expect(await exists(join(fix.farm, "feat", ".env.mcp"))).toBe(true);
  });

  it("inverts the well-formed rows and reports the malformed one by index", async () => {
    const fix = await seedRepo(getRoot().dir);
    await declareTwoRowPolicy(fix);

    await runWorktreeSetup(setupOptions(fix, "feat"));
    const gitDir = (await mustGit(join(fix.farm, "feat"), "rev-parse", "--absolute-git-dir")).trim();
    const receiptPath = worktreeReceiptPath(gitDir);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as {
      entries: Record<string, unknown>[];
    };
    // Row 0 loses its `strategy`; row 1 stays well-formed.
    const damaged = [{ path: receipt.entries[0]?.["path"] }, receipt.entries[1]];
    await writeFile(receiptPath, JSON.stringify({ ...receipt, entries: damaged }), "utf8");

    const result = await runWorktreeCleanup(
      cleanupOptions(fix, { names: ["feat"], filesOnly: true }),
    );

    const report = result.worktrees[0];
    expect(report?.droppedRows).toEqual([{ index: 0, reason: expect.stringContaining("strategy") }]);
    // The good row was still inverted, which is what "one bad row costs nothing" means.
    expect(report?.files).toEqual([
      { path: "extra.local", outcome: "removed", reason: "digest-match", detail: null },
    ]);
    expect(await exists(join(fix.farm, "feat", "extra.local"))).toBe(false);
    expect(await exists(join(fix.farm, "feat", ".env.mcp"))).toBe(true);
  });

  it("lists a worktree outside the farm as other, skips it, and leaves it standing", async () => {
    const base = getRoot().dir;
    const fix = await seedRepo(base);
    await runWorktreeSetup(setupOptions(fix, "feat"));
    const outside = join(base, "hand-made");
    await mustGit(fix.root, "worktree", "add", "--quiet", "-b", "hand", outside);

    const result = await runWorktreeCleanup(cleanupOptions(fix, { all: true, force: "granted" }));

    const report = result.worktrees.find((entry) => entry.path === outside);
    expect(report?.classification).toBe("other");
    expect(report?.skipped).toContain("outside the farm");
    expect(await exists(outside)).toBe(true);
    // ...while the managed one really was taken down.
    expect(await exists(join(fix.farm, "feat"))).toBe(false);
  });

  it("refuses --all without consent, and a dirty worktree without --force", async () => {
    const fix = await seedRepo(getRoot().dir);
    await runWorktreeSetup(setupOptions(fix, "feat"));

    const bulk = await refuses(
      () => runWorktreeCleanup(cleanupOptions(fix, { all: true })),
      "VALIDATION_ERROR",
    );
    expect(bulk.next).toContain("--all");
    expect(await exists(join(fix.farm, "feat"))).toBe(true);

    await writeFile(join(fix.farm, "feat", "README.md"), "# edited in the worktree\n", "utf8");
    const dirty = await refuses(
      () => runWorktreeCleanup(cleanupOptions(fix, { names: ["feat"] })),
      "VALIDATION_ERROR",
    );
    expect(dirty.next).toContain("--force");
    expect(await exists(join(fix.farm, "feat"))).toBe(true);
  });

  it("refuses with both spellings when neither a name nor --all is given", async () => {
    const fix = await seedRepo(getRoot().dir);

    const error = await refuses(() => runWorktreeCleanup(cleanupOptions(fix)), "VALIDATION_ERROR");

    expect(error.next).toContain("<name>");
    expect(error.next).toContain("--all");
  });

  it("carries the repo-global stash count once, on the inventory rather than on a row", async () => {
    const fix = await seedRepo(getRoot().dir);
    await runWorktreeSetup(setupOptions(fix, "feat"));
    await writeFile(join(fix.root, "README.md"), "# parked\n", "utf8");
    await mustGit(fix.root, ...IDENTITY, "stash", "push", "--quiet", "-m", "parked");

    const inventory = await readWorktreeInventory({
      repoRoot: fix.root,
      farmDir: resolveFarmDir(builtInWorktreePolicy(), fix.root),
    });

    expect(inventory.stash).toEqual({ entries: 1 });
    // Two registered worktrees, one managed, and neither carries a stash field.
    expect(inventory.worktrees).toHaveLength(2);
    expect(inventory.worktrees.filter((row) => row.classification === "managed")).toHaveLength(1);
    for (const row of inventory.worktrees) {
      expect(Object.keys(row)).not.toContain("stash");
    }

    const result = await runWorktreeCleanup(cleanupOptions(fix, { names: ["feat"] }));
    expect(result.notices.filter((notice) => notice.includes("stash"))).toHaveLength(1);
    expect(result.stash).toEqual({ entries: 1 });
  });

  it("removes a receipt-less farm tree under --force as a whole tree, never by replaying a pattern", async () => {
    // Contract change (frontier W1): a receipt-less farm tree is a
    // managed-orphan and is cleanable under --force. There is still NO pattern
    // replay — with no receipt to scope the removal, `git worktree remove
    // --force` takes the whole tree, and the report says so.
    const fix = await seedRepo(getRoot().dir);
    await runWorktreeSetup(setupOptions(fix, "feat"));
    const gitDir = (await mustGit(join(fix.farm, "feat"), "rev-parse", "--absolute-git-dir")).trim();
    await rm(worktreeReceiptPath(gitDir), { force: true });

    const result = await runWorktreeCleanup(cleanupOptions(fix, { all: true, force: "granted" }));

    const report = result.worktrees.find((entry) => entry.path === join(fix.farm, "feat"));
    expect(report?.classification).toBe("managed-orphan");
    expect(report?.removed).toBe(true);
    expect(await exists(join(fix.farm, "feat"))).toBe(false);
  });

  it("prunes an abandoned registration on every run", async () => {
    const fix = await seedRepo(getRoot().dir);
    await runWorktreeSetup(setupOptions(fix, "keep"));
    await runWorktreeSetup(setupOptions(fix, "gone"));
    // The directory disappears; the registration does not.
    await rm(join(fix.farm, "gone"), { recursive: true, force: true });

    const result = await runWorktreeCleanup(cleanupOptions(fix, { names: ["keep"] }));

    expect(result.pruned).toBe(1);
    expect(
      (await mustGit(fix.root, "worktree", "list")).split("\n").filter((line) => line.trim() !== ""),
    ).toHaveLength(1);
  });
});

// A blanket 60s wall-clock ceiling on every git call SIGTERMs a legitimately
// long `worktree add`, leaving an orphan. The timeout belongs to `fetch` (an
// unreachable host), not to the mutating add/remove.
function capturingRunner(status: number): {
  runner: (invocation: GitInvocation) => Promise<GitOutcome>;
  calls: GitInvocation[];
} {
  const calls: GitInvocation[] = [];
  return {
    calls,
    runner: (invocation) => {
      calls.push(invocation);
      return Promise.resolve({ status, stdout: "", stderr: "" });
    },
  };
}

describe("the git timeout is scoped to fetch, not to worktree mutations [secfix W4]", () => {
  it("applies a numeric timeout to fetch [secfix]", async () => {
    const { runner, calls } = capturingRunner(0);
    await fetchBranch(runner, "/repo", "feat");
    const fetch = calls.find((call) => call.args[0] === "fetch");
    expect(fetch?.timeoutMs).toEqual(expect.any(Number));
  });

  it("applies no timeout to worktree add [secfix]", async () => {
    const { runner, calls } = capturingRunner(0);
    await addWorktree(runner, "/repo", { path: "/repo/wt", branch: "feat", kind: "create" });
    const add = calls.find((call) => call.args[0] === "worktree" && call.args[1] === "add");
    expect(add?.timeoutMs).toBeUndefined();
  });
});

describe.skipIf(!gitAvailable)("worktree security fixes over a real repository [secfix]", () => {
  // win32-gated: the whole case is a POSIX directory-mode assertion — see WINDOWS.
  it.skipIf(WINDOWS)("creates the farm directory at 0700 [secfix W2]", async () => {
    const fix = await seedRepo(getRoot().dir);
    await runWorktreeSetup(setupOptions(fix, "feat"));
    expect((await stat(fix.farm)).mode & 0o777).toBe(0o700);
  });

  it("treats a policy .env.mcp with `secret` omitted as secret: gate, withhold, 0600 [secfix C1]", async () => {
    const fix = await seedRepo(getRoot().dir);
    // The source credential is deliberately LOOSE (0644), so a dest that comes
    // back 0600 proves the force rather than mere mode-copying.
    await chmod(join(fix.root, ".env.mcp"), 0o644);
    await mkdir(join(fix.root, ".stamity"), { recursive: true });
    await writeFile(
      join(fix.root, ".stamity", "worktree.json"),
      JSON.stringify({ version: 1, entries: [{ path: ".env.mcp", strategy: "copy" }] }),
      "utf8",
    );

    // (1) the gate is emitted despite the omitted boolean
    const plan = await planWorktreeSetup({ repoRoot: fix.root, name: "feat", consent: UNANSWERED });
    expect(plan.gates.some((gate) => gate.gate === "secrets")).toBe(true);

    // (2) withheld on no consent — the credential does NOT travel
    const withheld = await runWorktreeSetup(setupOptions(fix, "feat", { consent: UNANSWERED }));
    expect(withheld.entries.find((entry) => entry.path === ".env.mcp")?.outcome).toBe("skipped");
    expect(await exists(join(fix.farm, "feat", ".env.mcp"))).toBe(false);

    // (3) forced to 0600 when granted, even from a 0644 source. The copy still
    // runs on Windows (it proves the credential travels under consent); only the
    // POSIX mode read-back is guarded. See WINDOWS.
    await runWorktreeSetup(setupOptions(fix, "feat2", { consent: GRANTED }));
    if (!WINDOWS) expect((await stat(join(fix.farm, "feat2", ".env.mcp"))).mode & 0o777).toBe(0o600);
  });

  it("a dirty cleanup without --force mutates NOTHING [secfix frontier-W2]", async () => {
    const fix = await seedRepo(getRoot().dir);
    await runWorktreeSetup(setupOptions(fix, "feat"));
    const copy = join(fix.farm, "feat", ".env.mcp");
    expect(await exists(copy)).toBe(true);
    // Untracked, unignored file makes the worktree dirty.
    await writeFile(join(fix.farm, "feat", "dirty.txt"), "x\n", "utf8");

    await refuses(
      () => runWorktreeCleanup(cleanupOptions(fix, { names: ["feat"] })),
      "VALIDATION_ERROR",
    );
    // The receipt's copy row was NOT inverted before the refusal.
    expect(await exists(copy)).toBe(true);
  });

  it("a receipt copy row escaping via .. does not delete outside the worktree [secfix frontier-W3]", async () => {
    const fix = await seedRepo(getRoot().dir);
    await runWorktreeSetup(setupOptions(fix, "feat"));
    const mainCredential = join(fix.root, ".env.mcp");
    expect(await exists(mainCredential)).toBe(true);

    const gitDir = (await mustGit(join(fix.farm, "feat"), "rev-parse", "--absolute-git-dir")).trim();
    const receiptPath = worktreeReceiptPath(gitDir);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as { entries: Record<string, unknown>[] };
    // A row whose path climbs out of the worktree to the MAIN tree's credential,
    // carrying its real digest so the digest gate would answer `remove`.
    const rel = relative(join(fix.farm, "feat"), mainCredential);
    const digest = sha256Hex(await readFile(mainCredential));
    await writeFile(
      receiptPath,
      JSON.stringify({ ...receipt, entries: [{ path: rel, strategy: "copy", sha256: digest }] }),
      "utf8",
    );

    const result = await runWorktreeCleanup(cleanupOptions(fix, { names: ["feat"], filesOnly: true }));

    // The breach is closed: the main tree's credential survives, and the row is
    // reported dropped rather than acted on.
    expect(await exists(mainCredential)).toBe(true);
    const report = result.worktrees.find((entry) => entry.path === join(fix.farm, "feat"));
    expect(report?.droppedRows.length).toBeGreaterThan(0);
  });
});

// A tree inside the managed farm with no readable receipt is a managed-orphan:
// cleanable under --force via `git worktree remove --force` (no receipt scopes
// the removal, so the whole tree goes), refused without it.
describe.skipIf(!gitAvailable)("managed-orphan farm trees (frontier W1) [secfix]", () => {
  it("is cleanable under --force and says the whole tree went for lack of a receipt [secfix]", async () => {
    const fix = await seedRepo(getRoot().dir);
    await runWorktreeSetup(setupOptions(fix, "feat"));
    const gitDir = (await mustGit(join(fix.farm, "feat"), "rev-parse", "--absolute-git-dir")).trim();
    await rm(worktreeReceiptPath(gitDir), { force: true });

    const result = await runWorktreeCleanup(cleanupOptions(fix, { names: ["feat"], force: "granted" }));

    const report = result.worktrees.find((entry) => entry.path === join(fix.farm, "feat"));
    expect(report?.classification).toBe("managed-orphan");
    expect(report?.removed).toBe(true);
    expect(await exists(join(fix.farm, "feat"))).toBe(false);
    expect(result.notices.some((notice) => notice.includes("no readable receipt"))).toBe(true);
  });

  it("is refused without --force, naming the flag, and left standing [secfix]", async () => {
    const fix = await seedRepo(getRoot().dir);
    await runWorktreeSetup(setupOptions(fix, "feat"));
    const gitDir = (await mustGit(join(fix.farm, "feat"), "rev-parse", "--absolute-git-dir")).trim();
    await rm(worktreeReceiptPath(gitDir), { force: true });

    const error = await refuses(
      () => runWorktreeCleanup(cleanupOptions(fix, { names: ["feat"] })),
      "VALIDATION_ERROR",
    );
    expect(error.next).toContain("--force");
    expect(await exists(join(fix.farm, "feat"))).toBe(true);
  });
});
