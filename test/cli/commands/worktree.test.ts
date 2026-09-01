import { chmod, lstat, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { partialCleanupErrorDocument, worktreeCommand } from "../../../src/cli/commands/worktree.ts";
import type { CleanupWorktreeReport, WorktreeCleanupResult } from "../../../src/worktree/cleanup.ts";
import { runGit } from "../../../src/worktree/git.ts";
import { WORKTREE_FARM_DIR_NAME, WORKTREE_POLICY_FILE } from "../../../src/worktree/policy.ts";
import { runInProcess, type InProcessResult } from "../../support/inProcess.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * WT-U2: the `stamity worktree` verb, over REAL git repositories.
 *
 * No git runner is stubbed anywhere in this file, and that is the argument the
 * suite makes rather than a preference about style. Every claim the verb makes
 * is a claim about what git did — a worktree really registered, a branch really
 * left behind, a receipt really written where `rev-parse --git-dir` resolves to,
 * a `git status --porcelain` really empty in the new checkout. A stubbed runner
 * would assert this file's beliefs about git instead, which is the failure mode
 * the lane's own spec names in its risk register.
 *
 * Two seams are injected, both because the live source cannot answer here: the
 * process cwd, since a test worker cannot chdir without corrupting every other
 * suite sharing it, and the terminal facts, since a vitest worker has no TTY and
 * the consent matrix is a function of exactly that. Both arrive through
 * `runInProcess`, the in-process CLI runner the other command suites use.
 *
 * Fixtures are deliberately non-degenerate: the repository carries a committed
 * tree AND ignored machine-local state AND an untracked-but-unignored file, and
 * the inventory cases run with two worktrees plus a stash, because a repository
 * holding one of anything cannot tell the columns apart.
 *
 * `describe.skipIf(!gitAvailable)` skips — and REPORTS as skipped — every block
 * when git is unavailable, the same posture `test/worktree/engine.test.ts` takes.
 */

// Detected at collection time so `describe.skipIf` REPORTS these blocks as
// skipped when git is absent, instead of hiding them behind an early return.
const gitAvailable = (await runGit({ args: ["--version"], cwd: process.cwd() })).status === 0;

const getTemp = useTempDir("worktree-verb");

const IDENTITY = [
  "-c",
  "user.name=Fixture",
  "-c",
  "user.email=fixture@example.invalid",
  "-c",
  "commit.gpgsign=false",
];

const SECRET_BODY = "MCP_TOKEN=example-token\nMCP_KEY=example-key\n";

/** Runs git in a fixture and throws with git's own stderr when it fails. */
async function mustGit(cwd: string, ...args: string[]): Promise<string> {
  const outcome = await runGit({ args, cwd });
  if (outcome.status !== 0) {
    throw new Error(`git ${args.join(" ")} in ${cwd} failed (${outcome.status}): ${outcome.stderr}`);
  }
  return outcome.stdout;
}

interface Fixture {
  readonly root: string;
  readonly farm: string;
}

/**
 * A repository with one commit, a `.gitignore` covering the machine-local
 * paths, a committed `.stamity/manifest.json` so the presence probe has
 * something to find, an IGNORED `.env.mcp` at 0600, an ignored `node_modules`,
 * and an untracked-and-unignored `.stamity/review-gate.json` — the file the
 * policy's admissibility rule exists to refuse.
 */
async function seedRepo(base: string, name = "repo"): Promise<Fixture> {
  const root = join(base, name);
  await mkdir(join(root, ".stamity"), { recursive: true });
  await mustGit(root, "-c", "init.defaultBranch=main", "init", "--quiet");
  await writeFile(join(root, ".gitignore"), ".env.mcp\nnode_modules/\nblocked/\n", "utf8");
  await writeFile(join(root, "README.md"), "# fixture\n", "utf8");
  await writeFile(join(root, ".stamity", "manifest.json"), '{"version":1}\n', "utf8");
  await mustGit(root, "add", "-A");
  await mustGit(root, ...IDENTITY, "commit", "--quiet", "-m", "fixture");

  await writeFile(join(root, ".env.mcp"), SECRET_BODY, "utf8");
  await chmod(join(root, ".env.mcp"), 0o600);
  await mkdir(join(root, "node_modules", "left-pad"), { recursive: true });
  await writeFile(join(root, "node_modules", "left-pad", "index.js"), "module.exports=1\n", "utf8");
  await writeFile(join(root, ".stamity", "review-gate.json"), "{}\n", "utf8");

  return { root, farm: join(dirname(root), WORKTREE_FARM_DIR_NAME, basename(root)) };
}

async function runWorktree(
  cwd: string,
  args: readonly string[],
  opts: { tty?: { stdin?: boolean; stdout?: boolean }; stdinLines?: readonly string[] } = {},
): Promise<InProcessResult> {
  return runInProcess([worktreeCommand], ["worktree", ...args], {
    cwd,
    // NO_COLOR pins the one difference that is a terminal fact rather than a
    // dispatch fact, so a TTY run and a piped run are comparable byte for byte.
    env: { NO_COLOR: "1" },
    ...(opts.tty === undefined ? {} : { tty: opts.tty }),
    ...(opts.stdinLines === undefined ? {} : { stdinLines: opts.stdinLines }),
  });
}

/** Parses the whole stream: a second concatenated document would throw here. */
function singleDoc(result: InProcessResult): Record<string, unknown> {
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

// ── REQ-WORKTREE-001: dispatch ─────────────────────────────────────────────

describe.skipIf(!gitAvailable)("worktree dispatch", () => {
  it("produces the identical inventory bare and as `list`, on a TTY and on a pipe", async () => {
    const { root } = await seedRepo(getTemp().dir);

    const bare = await runWorktree(root, [], { tty: { stdin: true, stdout: true } });
    const listed = await runWorktree(root, ["list"]);

    expect(bare.code).toBe(0);
    expect(listed.code).toBe(0);
    // Byte-identical: bare `worktree` is the read on every stream, and neither
    // arm may print a prompt — a picker here would have nothing to pick.
    expect(bare.stdout).toBe(listed.stdout);
    expect(bare.stdout).toContain(root);
  });

  it("names all three subcommands in --help, and exits 0", async () => {
    const { root } = await seedRepo(getTemp().dir);

    const result = await runWorktree(root, ["--help"]);

    expect(result.code).toBe(0);
    // The positional's description is copied verbatim into the generated CLI
    // reference, so this is the same string a reader meets on both surfaces.
    expect(result.stdout).toContain("list | setup | cleanup");
    for (const flag of ["--use-existing", "--no-track", "--copy-secrets", "--all", "--files-only"]) {
      expect(result.stdout, `worktree --help omits ${flag}`).toContain(flag);
    }
  });

  it("refuses an unknown subcommand with USAGE naming the three", async () => {
    const { root } = await seedRepo(getTemp().dir);

    const result = await runWorktree(root, ["bogus"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("unknown worktree subcommand");
    expect(result.stderr).toContain("list, setup, cleanup");
  });

  it("refuses outside a git repository, naming the directory", async () => {
    const temp = getTemp();

    const result = await runWorktree(temp.dir, ["list"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("is not inside a git repository");
  });
});

// ── REQ-WORKTREE-014, 015: the inventory ───────────────────────────────────

describe.skipIf(!gitAvailable)("worktree list", () => {
  it("prints one row per worktree with its columns, and the stash line exactly once", async () => {
    const { root, farm } = await seedRepo(getTemp().dir);
    await runWorktree(root, ["setup", "feat", "-y"]);
    await runWorktree(root, ["setup", "other", "-y"]);
    // Two stash entries, so the count is not the one number a bug would also
    // produce; the repo-global claim is what the line is for.
    await writeFile(join(root, "README.md"), "# one\n", "utf8");
    await mustGit(root, ...IDENTITY, "stash", "push", "-m", "one");
    await writeFile(join(root, "README.md"), "# two\n", "utf8");
    await mustGit(root, ...IDENTITY, "stash", "push", "-m", "two");
    // A handoff record in one worktree only: the column has to distinguish.
    await mkdir(join(farm, "feat", ".stamity", "handoffs"), { recursive: true });
    await writeFile(join(farm, "feat", ".stamity", "handoffs", "a.md"), "x\n", "utf8");
    await writeFile(join(farm, "feat", ".stamity", "handoffs", ".gitkeep"), "", "utf8");

    const human = await runWorktree(root, ["list"]);
    const doc = singleDoc(await runWorktree(root, ["list", "--json"]));

    expect(human.code).toBe(0);
    expect(human.stdout).toContain("2 stash entries");
    expect(human.stdout.match(/stash entr/gu)).toHaveLength(1);
    expect(human.stdout).toContain("managed: yes (1 entry)");
    expect(human.stdout).toContain("managed: no");

    expect(doc["stash"]).toEqual({ entries: 2 });
    const rows = doc["worktrees"] as Record<string, unknown>[];
    expect(rows).toHaveLength(3);
    // Native separator: the row path is a real filesystem location (backslash on
    // Windows), so the suffix must be join-composed, not a forward-slash literal.
    const feat = rows.find((row) => String(row["path"]).endsWith(join(WORKTREE_FARM_DIR_NAME, "repo", "feat")));
    expect(feat).toMatchObject({ managed: true, branch: "feat", setup: "present", handoffs: 1 });
    // `.gitkeep` is the scaffold's placeholder, not a record.
    expect(feat?.["handoffs"]).toBe(1);
    const main = rows.find((row) => row["path"] === root);
    expect(main).toMatchObject({ managed: false, current: true, handoffs: 0 });
    expect(main?.["dirty"]).toMatchObject({ modified: 0 });
  });

  it("exits 0 and says so when the clone has no stash", async () => {
    const { root } = await seedRepo(getTemp().dir);

    const result = await runWorktree(root, ["list", "--json"]);

    expect(result.code).toBe(0);
    expect(singleDoc(result)["stash"]).toEqual({ entries: 0 });
    expect(result.stdout).not.toContain("stash entr");
  });
});

// ── REQ-WORKTREE-002, 004, 005, 006, 013: setup ────────────────────────────

describe.skipIf(!gitAvailable)("worktree setup", () => {
  it("needs a name", async () => {
    const { root } = await seedRepo(getTemp().dir);

    const result = await runWorktree(root, ["setup"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("worktree setup needs a name");
  });

  it("creates the tree outside the repo, writes the receipt in its git dir, and leaves both trees clean", async () => {
    const { root, farm } = await seedRepo(getTemp().dir);
    const before = await mustGit(root, "status", "--porcelain");

    const result = await runWorktree(root, ["setup", "feat/api", "--copy-secrets", "-y", "--json"]);

    expect(result.code).toBe(0);
    const doc = singleDoc(result);
    expect(doc).toMatchObject({ ok: true, status: "complete", branchPlan: "create", setup: "present" });
    const worktree = doc["worktree"] as { path: string; branch: string };
    // A `/` in the name is preserved as nesting, and the farm sits beside the
    // repository rather than inside it.
    expect(worktree.path).toBe(join(farm, "feat", "api"));
    expect(worktree.path.startsWith(`${root}/`)).toBe(false);
    expect(worktree.branch).toBe("feat/api");

    // The receipt is where `rev-parse --git-dir` says, not where this test
    // guessed: the placement depends on git's behaviour, so it is asserted.
    const gitDir = (await mustGit(worktree.path, "rev-parse", "--git-dir")).trim();
    const receipt = JSON.parse(
      await readFile(join(gitDir, "stamity", "worktree-receipt.json"), "utf8"),
    ) as { version: number; entries: { path: string }[] };
    expect(receipt.version).toBe(1);
    expect(receipt.entries.map((entry) => entry.path)).toEqual([".env.mcp"]);

    // The credential travelled, at 0600, and nothing the checkout supplies was
    // rewritten — no sync ran in the new worktree.
    expect(await readFile(join(worktree.path, ".env.mcp"), "utf8")).toBe(SECRET_BODY);
    if (process.platform !== "win32") {
      expect((await stat(join(worktree.path, ".env.mcp"))).mode & 0o777).toBe(0o600);
    }
    expect(await exists(join(worktree.path, "node_modules"))).toBe(false);
    expect(await mustGit(worktree.path, "status", "--porcelain")).toBe("");
    expect(await mustGit(root, "status", "--porcelain")).toBe(before);
  });

  it("withholds a secret entry non-interactively: exit 0, the row says skipped, a notice names the flag", async () => {
    const { root, farm } = await seedRepo(getTemp().dir);

    const result = await runWorktree(root, ["setup", "feat", "--json"]);

    expect(result.code).toBe(0);
    const doc = singleDoc(result);
    // A declined secret is a fact about the request, not a fault: grading it
    // `partial` would train a reader to ignore the field.
    expect(doc["status"]).toBe("complete");
    expect(doc["entries"]).toEqual([
      expect.objectContaining({ path: ".env.mcp", outcome: "skipped" }),
    ]);
    expect((doc["notices"] as string[]).join(" ")).toContain("--copy-secrets");
    expect(await exists(join(farm, "feat", ".env.mcp"))).toBe(false);
    // The tree itself was still created: the skip is not a refusal.
    expect(await exists(join(farm, "feat", "README.md"))).toBe(true);
  });

  it("asks about the secret on a terminal and copies it when the answer is yes", async () => {
    const { root, farm } = await seedRepo(getTemp().dir);

    const result = await runWorktree(root, ["setup", "feat"], {
      tty: { stdin: true },
      stdinLines: ["y"],
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("holds secret material");
    expect(await readFile(join(farm, "feat", ".env.mcp"), "utf8")).toBe(SECRET_BODY);
  });
});

// ── REQ-WORKTREE-008: the consent matrix ───────────────────────────────────

describe.skipIf(!gitAvailable)("worktree setup consent", () => {
  it("refuses to attach to an existing local branch without consent, naming the complete rerun line", async () => {
    const { root, farm } = await seedRepo(getTemp().dir);
    await mustGit(root, "branch", "feat");

    const result = await runWorktree(root, ["setup", "feat", "--json"]);

    expect(result.code).toBe(1);
    const doc = singleDoc(result);
    expect(doc["ok"]).toBe(false);
    // Refused before any write, so the document carries an error and NO
    // worktree key — the two halves REQ-WORKTREE-011 keeps apart.
    expect(doc["worktree"]).toBeUndefined();
    const error = doc["error"] as { code: string; next: string };
    expect(error.code).toBe("VALIDATION_ERROR");
    // The complete rerun line, name argument included — not a bare flag.
    expect(error.next).toContain("stamity worktree setup feat --json --use-existing");
    expect(await exists(join(farm, "feat"))).toBe(false);
  });

  it("attaches under --use-existing and refuses under --no-use-existing with a rename hint", async () => {
    const { root } = await seedRepo(getTemp().dir);
    await mustGit(root, "branch", "feat");

    const attached = await runWorktree(root, ["setup", "feat", "--use-existing", "-y", "--json"]);
    const refused = await runWorktree(root, ["setup", "other", "--no-use-existing", "-y", "--json"]);
    await mustGit(root, "branch", "third");
    const declined = await runWorktree(root, ["setup", "third", "--no-use-existing", "-y", "--json"]);

    expect(attached.code).toBe(0);
    expect(singleDoc(attached)["branchPlan"]).toBe("attach");
    // `--no-use-existing` on a name with no branch behind it is inert: the gate
    // is never reached, so the run creates the branch as usual.
    expect(refused.code).toBe(0);
    expect(singleDoc(refused)["branchPlan"]).toBe("create");
    expect(declined.code).toBe(1);
    expect((singleDoc(declined)["error"] as { next: string }).next).toContain("Pick a name");
  });

  it("returns exit 1 with the payload intact when the tree was created and an entry failed", async () => {
    const { root, farm } = await seedRepo(getTemp().dir);
    // A committed regular FILE named `blocked`, and a policy row naming a path
    // under it. The new worktree checks the file out, so creating the entry's
    // parent directory there fails at the syscall — a materialization failure
    // AFTER `git worktree add` succeeded, which is the only route to `partial`.
    // The row is admissible on the way in: `blocked/thing` is ignored and is not
    // tracked, which is what the plan checks.
    await writeFile(join(root, "blocked"), "not a directory\n", "utf8");
    await writeFile(
      join(root, WORKTREE_POLICY_FILE),
      `${JSON.stringify({ version: 1, entries: [{ path: "blocked/thing", strategy: "copy" }] })}\n`,
      "utf8",
    );
    await writeFile(join(root, "blocked-thing-source"), "bytes\n", "utf8");
    await mustGit(root, "add", "-A");
    await mustGit(root, ...IDENTITY, "commit", "--quiet", "-m", "a file where a directory is wanted");

    const result = await runWorktree(root, ["setup", "feat", "-y", "--json"]);

    expect(result.code).toBe(1);
    const doc = singleDoc(result);
    expect(doc["ok"]).toBe(false);
    expect(doc["status"]).toBe("partial");
    // The whole point of returning rather than throwing: the payload survives,
    // so the operator learns a worktree exists and where it is.
    expect((doc["worktree"] as { path: string }).path).toBe(join(farm, "feat"));
    expect(doc["entries"]).toEqual([
      expect.objectContaining({ path: "blocked/thing", outcome: "failed" }),
    ]);
    const error = doc["error"] as { code: string; message: string; next: string };
    expect(error.code).toBe("FS_ERROR");
    expect(error.next).toContain("stamity worktree cleanup feat");
    expect(await exists(join(farm, "feat", "README.md"))).toBe(true);
  });
});

// ── REQ-WORKTREE-012: one document, and a dry run that predicts ────────────

describe.skipIf(!gitAvailable)("worktree setup --dry-run", () => {
  it("prints the plan, writes nothing, and its entry table equals the real run's", async () => {
    const { root, farm } = await seedRepo(getTemp().dir);
    const registrationsBefore = await mustGit(root, "worktree", "list", "--porcelain");

    const preview = await runWorktree(root, ["setup", "feat", "--copy-secrets", "--dry-run", "--json"]);

    expect(preview.code).toBe(0);
    const plan = singleDoc(preview);
    expect(plan["dryRun"]).toBe(true);
    expect(plan["worktree"]).toBe(join(farm, "feat"));
    expect((plan["branchPlan"] as { remoteConsulted: boolean }).remoteConsulted).toBe(false);
    // Nothing was created — not the directory, not a lock file, not a registration.
    expect(await exists(join(farm, "feat"))).toBe(false);
    expect(await mustGit(root, "worktree", "list", "--porcelain")).toBe(registrationsBefore);

    const real = await runWorktree(root, ["setup", "feat", "--copy-secrets", "-y", "--json"]);
    expect(real.code).toBe(0);

    const planned = (plan["entries"] as { path: string; strategy: string }[]).map((entry) => [
      entry.path,
      entry.strategy,
    ]);
    const placed = (singleDoc(real)["entries"] as { path: string; strategy: string }[]).map(
      (entry) => [entry.path, entry.strategy],
    );
    // Row for row, strategy for strategy, in the same order — the parity a
    // preview that can disagree with its run would not have.
    expect(planned).toEqual(placed);
  });

  it("shows the gate and the answer this invocation gives it, without asking", async () => {
    const { root } = await seedRepo(getTemp().dir);
    await mustGit(root, "branch", "feat");

    // A terminal, and no flag: the real run would ask. The preview must not.
    const result = await runWorktree(root, ["setup", "feat", "--dry-run"], {
      tty: { stdin: true },
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("gate attach: unanswered → refuse");
    expect(result.stdout).toContain("would ASK each unanswered gate");
    expect(result.stdout).not.toContain("[Y/n]");
  });
});

// ── REQ-WORKTREE-007: cleanup ──────────────────────────────────────────────

describe.skipIf(!gitAvailable)("worktree cleanup", () => {
  it("inverts the receipt, removes the checkout, keeps the branch, and names the branch command", async () => {
    const { root, farm } = await seedRepo(getTemp().dir);
    await runWorktree(root, ["setup", "feat", "--copy-secrets", "-y"]);
    expect(await exists(join(farm, "feat", ".env.mcp"))).toBe(true);

    const result = await runWorktree(root, ["cleanup", "feat", "--json"]);

    expect(result.code).toBe(0);
    const doc = singleDoc(result);
    expect((doc["worktrees"] as Record<string, unknown>[])[0]).toMatchObject({
      removed: true,
      branchCommand: "git branch -d feat",
    });
    expect(await exists(join(farm, "feat"))).toBe(false);
    // Invariant 4: a branch is never deleted by this lane.
    expect(await mustGit(root, "branch", "--list", "feat")).toContain("feat");
  });

  it("keeps a diverged copy under --files-only and reports it", async () => {
    const { root, farm } = await seedRepo(getTemp().dir);
    await runWorktree(root, ["setup", "feat", "--copy-secrets", "-y"]);
    await writeFile(join(farm, "feat", ".env.mcp"), "MCP_TOKEN=edited-by-hand\n", "utf8");

    const result = await runWorktree(root, ["cleanup", "feat", "--files-only", "--json"]);

    expect(result.code).toBe(0);
    const report = (singleDoc(result)["worktrees"] as { files: { outcome: string; reason: string }[] }[])[0];
    expect(report?.files[0]).toMatchObject({ outcome: "kept", reason: "diverged" });
    // The bytes the operator typed survive: the digest gate is what keeps
    // inversion from becoming destruction.
    expect(await readFile(join(farm, "feat", ".env.mcp"), "utf8")).toBe("MCP_TOKEN=edited-by-hand\n");
    expect(await exists(join(farm, "feat"))).toBe(true);
  });

  it("is a USAGE failure with neither a name nor --all, naming both spellings", async () => {
    const { root } = await seedRepo(getTemp().dir);

    const result = await runWorktree(root, ["cleanup"]);
    const machine = await runWorktree(root, ["cleanup", "--json"]);

    expect(result.code).toBe(1);
    // The engine classifies as far as its vocabulary reaches; the verb re-raises
    // it as USAGE, and both spellings are named. The CODE is asserted through
    // `--json` because the human rendering prints what/why/next and never the
    // code — a re-raise that kept `VALIDATION_ERROR` would read identically
    // there, which is the difference this second arm exists to see.
    expect(result.stderr).toContain("cleanup needs a name");
    expect(result.stderr).toContain("stamity worktree cleanup <name>");
    expect(result.stderr).toContain("stamity worktree cleanup --all");
    expect(machine.code).toBe(1);
    expect((singleDoc(machine)["error"] as { code: string }).code).toBe("USAGE");
  });

  it("refuses --all without consent and sweeps every managed tree with it", async () => {
    const { root, farm } = await seedRepo(getTemp().dir);
    await runWorktree(root, ["setup", "one", "-y"]);
    await runWorktree(root, ["setup", "two", "-y"]);

    const refused = await runWorktree(root, ["cleanup", "--all", "--json"]);
    expect(refused.code).toBe(1);
    expect((singleDoc(refused)["error"] as { next: string }).next).toContain("--all");
    expect(await exists(join(farm, "one"))).toBe(true);

    const swept = await runWorktree(root, ["cleanup", "--all", "-y", "--json"]);
    expect(swept.code).toBe(0);
    expect(singleDoc(swept)["worktrees"]).toHaveLength(2);
    expect(await exists(join(farm, "one"))).toBe(false);
    expect(await exists(join(farm, "two"))).toBe(false);
  });

  it("refuses when the process is standing inside a candidate, naming it", async () => {
    const { root, farm } = await seedRepo(getTemp().dir);
    await runWorktree(root, ["setup", "feat", "-y"]);

    // Run FROM inside the worktree: the lane still resolves the main root
    // through the shared common dir, so the candidate is found and refused
    // rather than silently missed.
    const result = await runWorktree(join(farm, "feat"), ["cleanup", "feat", "--json"]);

    expect(result.code).toBe(1);
    const error = singleDoc(result)["error"] as { code: string; message: string; next: string };
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain(join(farm, "feat"));
    expect(error.next).toContain(root);
    expect(await exists(join(farm, "feat"))).toBe(true);
  });

  it("refuses a name no managed worktree carries rather than reporting nothing done", async () => {
    const { root } = await seedRepo(getTemp().dir);

    const result = await runWorktree(root, ["cleanup", "never-made", "--json"]);

    expect(result.code).toBe(1);
    expect((singleDoc(result)["error"] as { message: string }).message).toContain("never-made");
  });

  it("leaves a worktree registered outside the farm alone under --all", async () => {
    const temp = getTemp();
    const { root, farm } = await seedRepo(temp.dir);
    await runWorktree(root, ["setup", "managed", "-y"]);
    const outside = join(temp.dir, "hand-made");
    await mustGit(root, "worktree", "add", "--quiet", "-b", "hand", outside);

    const result = await runWorktree(root, ["cleanup", "--all", "-y", "--json"]);

    expect(result.code).toBe(0);
    const rows = singleDoc(result)["worktrees"] as { path: string; skipped: string | null }[];
    const other = rows.find((row) => row.path === outside);
    expect(other?.skipped).toContain("outside the farm");
    expect(await exists(outside)).toBe(true);
    expect(await exists(join(farm, "managed"))).toBe(false);
  });
});

// [secfix A5] The dirty rows are already in hand when the --all preamble is
// built (they gate `needsConsent`); naming only a count discarded them.
describe.skipIf(!gitAvailable)("worktree cleanup --all preamble names the dirty trees [secfix A5]", () => {
  it("names the dirty tree's path in the --all consent preamble, not just a count", async () => {
    const { root, farm } = await seedRepo(getTemp().dir);
    await runWorktree(root, ["setup", "feat", "-y"]);
    await writeFile(join(farm, "feat", "dirty.txt"), "x\n", "utf8");

    const result = await runWorktree(root, ["cleanup", "--all"], {
      tty: { stdin: true },
      stdinLines: ["y"],
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(join(farm, "feat"));
  });
});

/**
 * [secfix NEW-2] `partialCleanupErrorDocument` — a pure classifier, tested
 * directly against hand-built results the way `classifyFetchFailure` and
 * `classifyReceiptEntry` already are elsewhere in this codebase, rather than
 * through a git-backed integration case: forcing a real, portable,
 * non-"contains modified" `git worktree remove` failure through the CLI's
 * un-injectable `resolveLane` (it hardcodes the real `runGit`) is not
 * achievable on demand the way the engine-level suite's injected runner
 * makes it for `runWorktreeCleanup` directly.
 */
function fileReport(overrides: Partial<CleanupWorktreeReport> = {}): CleanupWorktreeReport {
  return {
    path: "/farm/feat",
    branch: "feat",
    classification: "managed",
    files: [],
    droppedRows: [],
    removed: false,
    branchCommand: null,
    skipped: null,
    treeFailure: null,
    ...overrides,
  };
}
function partialResult(worktrees: readonly CleanupWorktreeReport[]): WorktreeCleanupResult {
  return { status: "partial", worktrees, pruned: 0, notices: [], stash: { entries: 0 } };
}

const RERUN = "stamity worktree cleanup --all -y";

describe("partial cleanup error document names what actually failed, message and next in agreement [secfix NEW-2]", () => {
  it("names receipt rows in both message and next when only a FILE-level removal failed", () => {
    const document = partialCleanupErrorDocument(
      partialResult([
        fileReport({
          files: [{ path: ".env.mcp", outcome: "failed", reason: "failed", detail: "EACCES" }],
        }),
      ]),
      RERUN,
    );
    expect(document.message).toContain("receipt rows");
    expect(document.message).not.toContain("worktrees could not be fully removed");
    // `files[]` is real here, so "remove the remaining files by hand" points
    // at rows that actually exist above.
    expect(document.next).toContain("remove the remaining files by hand");
    // The tree-only wording ("no remaining receipt-row files") would be
    // false in this case — there ARE some, named in `files[]`.
    expect(document.next).not.toContain("no remaining receipt-row files");
  });

  it("names the worktree in both message and next when only a TREE-level removal failed, never pointing at files[] rows that do not exist", () => {
    const document = partialCleanupErrorDocument(
      partialResult([fileReport({ treeFailure: "removing the worktree at /farm/feat failed (git exited 1)." })]),
      RERUN,
    );
    expect(document.message).toContain("worktrees could not be fully removed");
    expect(document.message).not.toContain("receipt rows");
    // `files[]` is `[]` for a tree-level failure — "remove the remaining
    // files by hand — the rows above name each one" would point at rows
    // that do not exist, which is the residual this fix closes.
    expect(document.next).not.toContain("remove the remaining files by hand");
    expect(document.next).toContain("git worktree remove");
  });

  it("names both in message and next when a tree-level AND a file-level failure land in the same run", () => {
    const document = partialCleanupErrorDocument(
      partialResult([
        fileReport({ path: "/farm/a", treeFailure: "removing the worktree at /farm/a failed." }),
        fileReport({
          path: "/farm/b",
          files: [{ path: ".env.mcp", outcome: "failed", reason: "failed", detail: "EACCES" }],
        }),
      ]),
      RERUN,
    );
    expect(document.message).toContain("receipt rows");
    expect(document.message).toContain("worktrees could not be fully removed");
    expect(document.next).toContain("git worktree remove");
    expect(document.next).toContain("removing by hand");
  });
});

// ── REQ-WORKTREE-012: exactly one JSON document per run ────────────────────

describe.skipIf(!gitAvailable)("worktree --json", () => {
  it("emits exactly one parseable document on stdout for list, setup and cleanup", async () => {
    const { root } = await seedRepo(getTemp().dir);

    const list = await runWorktree(root, ["list", "--json"]);
    const setup = await runWorktree(root, ["setup", "feat", "-y", "--json"]);
    const cleanup = await runWorktree(root, ["cleanup", "feat", "-y", "--json"]);

    for (const [label, result] of [
      ["list", list],
      ["setup", setup],
      ["cleanup", cleanup],
    ] as const) {
      expect(result.code, label).toBe(0);
      // JSON.parse over the WHOLE stream: a second document, or a prompt line
      // ahead of it, would throw here rather than pass unnoticed.
      const doc = singleDoc(result);
      expect(doc["ok"], label).toBe(true);
      expect(doc["command"], label).toBe("worktree");
      expect(result.stdout.trimEnd().split("\n"), label).toHaveLength(1);
    }
  });

  it("never prompts under --json, even with a TTY stdin and a gate to ask about", async () => {
    const { root } = await seedRepo(getTemp().dir);
    await mustGit(root, "branch", "feat");

    const result = await runWorktree(root, ["setup", "feat", "--json"], {
      tty: { stdin: true, stdout: true },
    });

    // --json makes a run non-interactive and carries NO consent: the gate is
    // closed, so the run refuses instead of proceeding on an assumed yes.
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("[Y/n]");
    expect((singleDoc(result)["error"] as { next: string }).next).toContain("--use-existing");
  });
});

// ── REQ-WORKTREE-017: a repo that never runs the verb is byte-identical ────

describe.skipIf(!gitAvailable)("worktree side effects", () => {
  it("writes nothing anywhere when only `list` runs", async () => {
    const { root } = await seedRepo(getTemp().dir);
    const before = (await readdir(root)).toSorted();
    const stateBefore = (await readdir(join(root, ".stamity"))).toSorted();

    const result = await runWorktree(root, ["list"]);

    expect(result.code).toBe(0);
    expect((await readdir(root)).toSorted()).toEqual(before);
    expect((await readdir(join(root, ".stamity"))).toSorted()).toEqual(stateBefore);
    // No policy file is ever scaffolded: the built-in defaults are the answer
    // when it is absent, and a generated file equal to them would drift.
    expect(await exists(join(root, WORKTREE_POLICY_FILE))).toBe(false);
  });
});

// One secret answer applies to every secret row, so the prompt must name every
// one of them — an operator cannot consent informedly to a set it was not shown.
describe.skipIf(!gitAvailable)("worktree setup secret consent names all rows [secfix W3]", () => {
  it("names every secret row in the consent prompt, not just the first [secfix]", async () => {
    const { root } = await seedRepo(getTemp().dir);
    // Two secret rows: `.env.mcp` (secret by identity) and a declared one.
    await writeFile(
      join(root, ".gitignore"),
      ".env.mcp\nnode_modules/\nblocked/\ncreds.local\n",
      "utf8",
    );
    await writeFile(join(root, "creds.local"), "TOKEN=x\n", "utf8");
    await writeFile(
      join(root, WORKTREE_POLICY_FILE),
      JSON.stringify({
        version: 1,
        entries: [
          { path: ".env.mcp", strategy: "copy" },
          { path: "creds.local", strategy: "copy", secret: true },
        ],
      }),
      "utf8",
    );

    const result = await runWorktree(root, ["setup", "feat"], {
      tty: { stdin: true },
      stdinLines: ["y"],
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(".env.mcp");
    expect(result.stdout).toContain("creds.local");
  });
});
