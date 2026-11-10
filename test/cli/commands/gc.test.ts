import { lstat, mkdir, readFile, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { formatBytes, gcCommand } from "../../../src/cli/commands/gc.ts";
import { archiveHandoff, writeHandoff } from "../../../src/handoffs/store.ts";
import { REQUIRED_BODY_SECTIONS } from "../../../src/handoffs/validation.ts";
import { applyGc, planGc, type GcOptions, type HandoffSweep } from "../../../src/runs/gc.ts";
import { runGit } from "../../../src/worktree/git.ts";
import { WORKTREE_FARM_DIR_NAME } from "../../../src/worktree/policy.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * d-gc (REQ-FLOW-177): `stamity gc` reports what local runs left and frees only what `--apply` names, over REAL git
 * repositories in temp folders outside this checkout.
 *
 * No git runner is stubbed: every bound gc keeps — tracked, merged, gone on origin, dirty — is git's answer, and a
 * stub would assert this file's belief about git instead. The one substitute is the handoff preview in the engine
 * cases, injected at the seam the engine already has (`HandoffSweep`): a fake lets a case hold a tracked handoff
 * without writing the file format of the store. The verb cases run the real store (a linked archive, a stale
 * handoff).
 *
 * Fixtures are non-degenerate: two closed runs of different ages, an open run, old and new reports beside a tracked
 * one, a link inside a run and a run whose `reports/` is a link (and no record), three `stamity/*` branches (merged,
 * unmerged, checked out), two tracking refs (one origin dropped), and three worktrees (dirty in the farm, gone in the
 * farm, outside it).
 */

const gitAvailable = (await runGit({ args: ["--version"], cwd: process.cwd() })).status === 0;

const getTemp = useTempDir("gc-verb");

const IDENTITY = ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false"];

const NOW = new Date("2026-11-09T12:00:00Z");
const DAY = 86_400_000;

async function mustGit(cwd: string, ...args: string[]): Promise<string> {
  const outcome = await runGit({ args, cwd });
  if (outcome.status !== 0) {
    throw new Error(`git ${args.join(" ")} in ${cwd} failed (${String(outcome.status)}): ${outcome.stderr}`);
  }
  return outcome.stdout;
}

/** TEST CHANGE, justified (u-ci1): a native path as git prints it, with `/` between its parts on every platform. */
const gitPath = (path: string): string => path.split(sep).join("/");

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function writeAged(path: string, body: string, at: Date): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, "utf8");
  await utimes(path, at, at);
}

/** Record heads as a run writes them: closed at its end, in progress until then. */
const OLD_RECORD = "# Run 2026-09-01_old\n\nStatus: closed 2026-09-02\n";
const NEW_RECORD = "# Run 2026-11-08_new\n\nStatus: closed 2026-11-08 — merged\n";
const OPEN_RECORD = "# Run 2026-09-03_open\n\nStatus: in progress\n";

interface Fixture {
  readonly root: string;
  readonly farm: string;
  readonly outsideDir: string;
  readonly oldRun: string;
  readonly newRun: string;
  readonly openRun: string;
  readonly linkedRun: string;
}

/**
 * A clone of a bare origin with run folders, branches, tracking refs and worktrees, every one placed so gc has a
 * reason to free it or a reason to keep it.
 */
async function seed(base: string, now: Date): Promise<Fixture> {
  const origin = join(base, "origin.git");
  const root = join(base, "repo");
  const farm = join(base, WORKTREE_FARM_DIR_NAME, basename(root));
  const outsideDir = join(base, "elsewhere");
  await mkdir(root, { recursive: true });
  await mustGit(base, "init", "--bare", "--quiet", origin);
  await mustGit(root, "-c", "init.defaultBranch=main", "init", "--quiet");
  await mustGit(root, "remote", "add", "origin", origin);
  await writeFile(join(root, ".gitignore"), ".stamity/runs/\n", "utf8");
  // Not named after a tracked file of this repository: the test-input guard reads such a quoted name as a read of it.
  await writeFile(join(root, "fixture-readme.txt"), "# fixture\n", "utf8");

  const oldRun = join(root, ".stamity", "runs", "2026-09-01_old");
  const newRun = join(root, ".stamity", "runs", "2026-11-08_new");
  const openRun = join(root, ".stamity", "runs", "2026-09-03_open");
  const linkedRun = join(root, ".stamity", "runs", "2026-09-02_linked");
  const old = new Date(now.getTime() - 60 * DAY);
  const fresh = new Date(now.getTime() - 1 * DAY);
  // A tracked report, force-added past the ignore rule: old enough to be eligible, and never removed.
  await writeAged(join(oldRun, "reports", "tracked-r1.md"), "tracked report\n", old);
  await mustGit(root, "add", ".gitignore", "fixture-readme.txt");
  await mustGit(root, "add", "-f", join(".stamity", "runs", "2026-09-01_old", "reports", "tracked-r1.md"));
  await mustGit(root, ...IDENTITY, "commit", "--quiet", "-m", "base");
  await utimes(join(oldRun, "reports", "tracked-r1.md"), old, old);

  await writeAged(join(oldRun, "reports", "old-r1.md"), "x".repeat(4000), old);
  await writeAged(join(oldRun, "record.md"), OLD_RECORD, old);
  await writeAged(join(oldRun, "notes", "scratch.txt"), "scratch\n", old);
  await writeAged(join(newRun, "record.md"), NEW_RECORD, fresh);
  await writeAged(join(newRun, "reports", "new-r1.md"), "y".repeat(500), fresh);
  await writeAged(join(newRun, "reports", "aged-r1.md"), "z".repeat(700), old);
  // An open run past both ages: its record, ledger and old report are never freed.
  await writeAged(join(openRun, "record.md"), OPEN_RECORD, old);
  await writeAged(join(openRun, "ledger.jsonl"), "{}\n", old);
  await writeAged(join(openRun, "reports", "open-r1.md"), "o".repeat(300), old);

  // Links: one inside a run, and one run whose whole reports folder is a link to a folder outside the root.
  await writeAged(join(outsideDir, "precious.md"), "outside the root\n", old);
  await symlink(join(outsideDir, "precious.md"), join(oldRun, "reports", "link-r1.md"));
  await mkdir(linkedRun, { recursive: true });
  await symlink(outsideDir, join(linkedRun, "reports"));

  // Branches: merged (an ancestor of HEAD), open (a commit HEAD lacks), checked out in a farm worktree.
  await mustGit(root, "branch", "stamity/2026-09-01_old");
  await mustGit(root, "branch", "stamity/out");
  await mustGit(root, "checkout", "--quiet", "-b", "stamity/open");
  await writeFile(join(root, "open.txt"), "unmerged\n", "utf8");
  await mustGit(root, "add", "open.txt");
  await mustGit(root, ...IDENTITY, "commit", "--quiet", "-m", "open work");
  await mustGit(root, "checkout", "--quiet", "main");

  // Tracking refs: both pushed; origin then drops one.
  await mustGit(root, "push", "--quiet", "origin", "stamity/2026-09-01_old", "stamity/out");
  await mustGit(root, "fetch", "--quiet", "origin");
  // Deleted on origin's side, so the clone's tracking ref outlives it (a push --delete would drop both).
  await mustGit(base, `--git-dir=${origin}`, "branch", "-D", "stamity/out");

  // Worktrees: dirty in the farm (on stamity/out), gone in the farm, and one outside it.
  await mkdir(farm, { recursive: true });
  await mustGit(root, "worktree", "add", "--quiet", join(farm, "dirty"), "stamity/out");
  await writeFile(join(farm, "dirty", "fixture-readme.txt"), "edited\n", "utf8");
  await mustGit(root, "worktree", "add", "--quiet", "--detach", join(farm, "gone"));
  await rm(join(farm, "gone"), { recursive: true, force: true });
  await mustGit(root, "worktree", "add", "--quiet", "--detach", join(base, "outside-lane"));

  return { root, farm, outsideDir, oldRun, newRun, openRun, linkedRun };
}

/** A stand-in for the preview of the store; see the header for why the engine cases inject it. */
function fakeSweep(
  targets: { archive?: { id: string; path: string }[]; remove?: { id: string; path: string }[] } = {},
): HandoffSweep & { archived: string[] } {
  const sweep = {
    archived: [] as string[],
    async preview() {
      return { archive: targets.archive ?? [], remove: targets.remove ?? [] };
    },
    async archive(_rootDir: string, id: string) {
      sweep.archived.push(id);
    },
  };
  return sweep;
}

function optionsFor(fixture: Fixture, patch: Partial<GcOptions> = {}): GcOptions {
  return {
    repoRoot: fixture.root,
    farmDir: fixture.farm,
    now: NOW,
    reportsOlderThanDays: 30,
    runsOlderThanDays: null,
    branches: false,
    handoffs: fakeSweep(),
    ...patch,
  };
}

describe.skipIf(!gitAvailable)("gc engine — the preview writes nothing and reports sizes", () => {
  it("reports runs, reports, branches, stale tracking refs and worktrees, and removes nothing", async () => {
    const fixture = await seed(getTemp().dir, NOW);
    const before = await mustGit(fixture.root, "for-each-ref", "--format=%(refname)");
    const plan = await planGc(optionsFor(fixture));
    const report = plan.report;

    expect(report.dryRun).toBe(true);
    const old = report.runs.find((row) => row.run === "2026-09-01_old");
    expect(old?.tracked).toBe(true);
    expect(old?.ageDays).toBe(69);
    expect(old?.reportsBytes).toBe("tracked report\n".length + 4000);
    expect(old?.bytes).toBe("tracked report\n".length + 4000 + OLD_RECORD.length + "scratch\n".length);
    expect(report.runs.find((row) => row.run === "2026-11-08_new")?.tracked).toBe(false);
    // TEST CHANGE, justified (review/33, sign-off S33): the fixture gained an open run, so the counts below take its
    // one old report (counted, never eligible) and each row says whether its record reads closed.
    const open = Object.fromEntries(report.runs.map((row) => [row.run, row.open]));
    expect(open).toEqual({
      "2026-09-01_old": false,
      "2026-09-02_linked": true,
      "2026-09-03_open": true,
      "2026-11-08_new": false,
    });
    // Five regular report files are counted; the link and the linked folder are not walked; the old report of the
    // open run is counted but not eligible.
    expect(report.reports).toEqual({
      files: 5,
      bytes: "tracked report\n".length + 4000 + 500 + 700 + 300,
      eligible: 2,
    });
    expect(report.freed.paths).toEqual([
      ".stamity/runs/2026-09-01_old/reports/old-r1.md",
      ".stamity/runs/2026-11-08_new/reports/aged-r1.md",
      join(fixture.farm, "gone"),
      "refs/remotes/origin/stamity/out",
    ]);
    expect(report.freed.bytes).toBe(4700);
    expect(report.staleTracking).toEqual(["refs/remotes/origin/stamity/out"]);
    expect(report.branches).toEqual([
      { name: "stamity/2026-09-01_old", merged: true, eligible: false },
      { name: "stamity/open", merged: false, eligible: false },
      { name: "stamity/out", merged: true, eligible: false },
    ]);
    const classes = Object.fromEntries(report.worktrees.map((row) => [basename(row.path), row.class]));
    expect(classes).toEqual({ dirty: "dirty", gone: "prunable", "outside-lane": "outside" });
    expect(report.kept).toEqual(
      expect.arrayContaining([
        { path: ".stamity/runs/2026-09-01_old/reports/link-r1.md", reason: "a link, not followed" },
        { path: ".stamity/runs/2026-09-02_linked/reports", reason: "a link, not followed" },
        { path: ".stamity/runs/2026-09-01_old/reports/tracked-r1.md", reason: "tracked by git" },
        { path: join(fixture.farm, "dirty"), reason: "uncommitted changes; gc never removes a tree" },
        {
          path: ".stamity/runs/2026-09-03_open",
          reason: "open: its record does not read a closed status, so the whole run stays",
        },
      ]),
    );

    // Nothing moved: every file, ref and registration is where the fixture put it.
    expect(await exists(join(fixture.oldRun, "reports", "old-r1.md"))).toBe(true);
    expect(await exists(join(fixture.newRun, "reports", "aged-r1.md"))).toBe(true);
    expect(await mustGit(fixture.root, "for-each-ref", "--format=%(refname)")).toBe(before);
    // TEST CHANGE, justified (u-ci1): git prints a worktree path with `/` on every platform (`C:/Users/...` on Windows),
    // so the path is compared in git's spelling; on POSIX it is the same string as before.
    expect(await mustGit(fixture.root, "worktree", "list", "--porcelain")).toContain(gitPath(join(fixture.farm, "gone")));
  });

  it("reads an absent .stamity/runs as no runs, not as a failure", async () => {
    const base = getTemp().dir;
    const root = join(base, "bare-repo");
    await mkdir(root, { recursive: true });
    await mustGit(root, "-c", "init.defaultBranch=main", "init", "--quiet");
    await writeFile(join(root, "a.txt"), "a\n", "utf8");
    await mustGit(root, "add", "a.txt");
    await mustGit(root, ...IDENTITY, "commit", "--quiet", "-m", "a");
    const plan = await planGc({
      repoRoot: root,
      farmDir: join(base, WORKTREE_FARM_DIR_NAME, "bare-repo"),
      now: NOW,
      reportsOlderThanDays: 30,
      runsOlderThanDays: null,
      branches: false,
      handoffs: fakeSweep(),
    });
    expect(plan.report.runs).toEqual([]);
    expect(plan.report.reports).toEqual({ files: 0, bytes: 0, eligible: 0 });
    expect(plan.report.freed).toEqual({ bytes: 0, paths: [] });
  });
});

describe.skipIf(!gitAvailable)("gc engine — apply frees the default set and keeps every bound", () => {
  it("frees the old reports, the gone registration and the stale tracking ref, and nothing else", async () => {
    const fixture = await seed(getTemp().dir, NOW);
    const options = optionsFor(fixture);
    const report = await applyGc(await planGc(options), options);

    expect(report.dryRun).toBe(false);
    expect(report.failed).toEqual([]);
    expect(report.freed.bytes).toBe(4700);
    expect(await exists(join(fixture.oldRun, "reports", "old-r1.md"))).toBe(false);
    expect(await exists(join(fixture.newRun, "reports", "aged-r1.md"))).toBe(false);
    // The new report, the tracked report, the run's other files and the link all stay.
    expect(await exists(join(fixture.newRun, "reports", "new-r1.md"))).toBe(true);
    expect(await readFile(join(fixture.oldRun, "reports", "tracked-r1.md"), "utf8")).toBe("tracked report\n");
    expect(await exists(join(fixture.oldRun, "record.md"))).toBe(true);
    // The report of the open run is past the age and untracked, and stays: the run is not over.
    expect(await exists(join(fixture.openRun, "reports", "open-r1.md"))).toBe(true);
    expect((await lstat(join(fixture.oldRun, "reports", "link-r1.md"))).isSymbolicLink()).toBe(true);
    // Through the linked reports folder nothing was touched.
    expect(await readFile(join(fixture.outsideDir, "precious.md"), "utf8")).toBe("outside the root\n");
    // The dirty tree stands with its edit; the gone registration is pruned; the outside lane stays registered.
    expect(await readFile(join(fixture.farm, "dirty", "fixture-readme.txt"), "utf8")).toBe("edited\n");
    const list = await mustGit(fixture.root, "worktree", "list", "--porcelain");
    // TEST CHANGE, justified (u-ci1): in git's spelling, so on Windows the absence is read against a path git could print.
    expect(list).not.toContain(gitPath(join(fixture.farm, "gone")));
    expect(list).toContain("outside-lane");
    // The stale tracking ref is gone, the live one stays, origin's branch stays, and no local branch moved.
    const refs = await mustGit(fixture.root, "for-each-ref", "--format=%(refname)");
    expect(refs).not.toContain("refs/remotes/origin/stamity/out");
    expect(refs).toContain("refs/remotes/origin/stamity/2026-09-01_old");
    expect(refs).toContain("refs/heads/stamity/2026-09-01_old");
    const originDir = join(dirname(fixture.root), "origin.git");
    const originRefs = await mustGit(dirname(fixture.root), `--git-dir=${originDir}`, "for-each-ref", "--format=%(refname)");
    expect(originRefs).toContain("refs/heads/stamity/2026-09-01_old");
  });

  it("with --branches deletes only the merged branch no worktree holds, with -d", async () => {
    const fixture = await seed(getTemp().dir, NOW);
    const options = optionsFor(fixture, { branches: true });
    const plan = await planGc(options);
    expect(plan.report.branches.filter((row) => row.eligible).map((row) => row.name)).toEqual([
      "stamity/2026-09-01_old",
    ]);
    expect(plan.report.kept).toContainEqual({ path: "refs/heads/stamity/out", reason: "checked out in a worktree" });
    const report = await applyGc(plan, options);
    expect(report.failed).toEqual([]);
    const heads = await mustGit(fixture.root, "for-each-ref", "--format=%(refname)", "refs/heads/");
    expect(heads).not.toContain("refs/heads/stamity/2026-09-01_old\n");
    expect(heads).toContain("refs/heads/stamity/open");
    expect(heads).toContain("refs/heads/stamity/out");
  });

  it("with --runs-older-than frees an old run's untracked files and keeps its tracked one", async () => {
    const fixture = await seed(getTemp().dir, NOW);
    const options = optionsFor(fixture, { runsOlderThanDays: 30 });
    const report = await applyGc(await planGc(options), options);
    expect(report.failed).toEqual([]);
    expect(await exists(join(fixture.oldRun, "record.md"))).toBe(false);
    expect(await exists(join(fixture.oldRun, "notes"))).toBe(false);
    expect(await readFile(join(fixture.oldRun, "reports", "tracked-r1.md"), "utf8")).toBe("tracked report\n");
    expect(await readFile(join(fixture.outsideDir, "precious.md"), "utf8")).toBe("outside the root\n");
    // The run inside the age keeps everything but its aged report.
    expect(await exists(join(fixture.newRun, "reports", "new-r1.md"))).toBe(true);
    // The open run is past the age and keeps its whole folder: record, ledger and report.
    expect(await readFile(join(fixture.openRun, "record.md"), "utf8")).toBe(OPEN_RECORD);
    expect(await exists(join(fixture.openRun, "ledger.jsonl"))).toBe(true);
    expect(await exists(join(fixture.openRun, "reports", "open-r1.md"))).toBe(true);
  });

  it("keeps a run whose record is unreadable as a closed status, as an open one", async () => {
    const fixture = await seed(getTemp().dir, NOW);
    // A record that is a link to a closed record outside the root is not the word of the run itself: kept.
    const outsideRecord = join(fixture.outsideDir, "closed-record.md");
    await writeAged(outsideRecord, OLD_RECORD, NOW);
    await rm(join(fixture.oldRun, "record.md"));
    await symlink(outsideRecord, join(fixture.oldRun, "record.md"));
    const options = optionsFor(fixture, { runsOlderThanDays: 30 });
    const report = await applyGc(await planGc(options), options);
    expect(report.runs.find((row) => row.run === "2026-09-01_old")?.open).toBe(true);
    expect(await exists(join(fixture.oldRun, "reports", "old-r1.md"))).toBe(true);
    expect(await exists(join(fixture.oldRun, "notes", "scratch.txt"))).toBe(true);
  });

  it("keeps a report whose folder is swapped for a link between the preview and the sweep", async () => {
    const fixture = await seed(getTemp().dir, NOW);
    const options = optionsFor(fixture);
    const plan = await planGc(options);
    // The planned folder moves outside the root, and a link to it takes its place: same names, outside target.
    const moved = join(fixture.outsideDir, "moved-reports");
    await rename(join(fixture.oldRun, "reports"), moved);
    await symlink(moved, join(fixture.oldRun, "reports"));
    const report = await applyGc(plan, options);
    expect(report.kept).toContainEqual({
      path: ".stamity/runs/2026-09-01_old/reports/old-r1.md",
      reason: "its folder now resolves elsewhere through a link",
    });
    expect(await exists(join(moved, "old-r1.md"))).toBe(true);
  });

  it("reports a git refusal to list branches or refs as kept, not as an empty list", async () => {
    const fixture = await seed(getTemp().dir, NOW);
    // The real runner for every call but `for-each-ref`, which answers as a refusing git would: the one way to make a
    // healthy repository refuse that read on demand.
    const refusing: GcOptions["run"] = async (call) =>
      call.args[0] === "for-each-ref"
        ? { status: 128, stdout: "", stderr: "fatal: refused" }
        : await runGit(call);
    const plan = await planGc(optionsFor(fixture, { run: refusing }));
    expect(plan.report.branches).toEqual([]);
    expect(plan.report.kept).toEqual(
      expect.arrayContaining([
        { path: "refs/heads/stamity/", reason: "git would not list these branches, so none is known" },
        { path: "refs/remotes/origin/stamity/", reason: "git would not list these refs, so none is known stale" },
      ]),
    );
  });

  it("keeps a file swapped for a link between the preview and the sweep", async () => {
    const fixture = await seed(getTemp().dir, NOW);
    const options = optionsFor(fixture);
    const plan = await planGc(options);
    const target = join(fixture.oldRun, "reports", "old-r1.md");
    await rm(target);
    await symlink(join(fixture.outsideDir, "precious.md"), target);
    const report = await applyGc(plan, options);
    expect(report.kept).toContainEqual({
      path: ".stamity/runs/2026-09-01_old/reports/old-r1.md",
      reason: "no longer a regular file",
    });
    expect(await readFile(join(fixture.outsideDir, "precious.md"), "utf8")).toBe("outside the root\n");
  });

  it("runs the handoff sweep when its files are untracked and skips it whole when one is tracked", async () => {
    const fixture = await seed(getTemp().dir, NOW);
    const archived = join(fixture.root, ".stamity", "handoffs", "archive", "h-1.md");
    await writeAged(archived, "handoff body\n", NOW);
    const live = join(fixture.root, ".stamity", "handoffs", "h-2.md");
    await writeAged(live, "live handoff\n", NOW);
    // TEST CHANGE, justified (review/32, review/37): the apply now acts on the previewed list — gc removes each
    // archived handoff itself and asks the store to archive each expired one by id — so the fake records the
    // archive calls instead of running a sweep of its own, and gc itself does the removal below.
    const free = fakeSweep({ archive: [{ id: "h-2", path: live }], remove: [{ id: "h-1", path: archived }] });
    const options = optionsFor(fixture, { handoffs: free });
    const plan = await planGc(options);
    expect(plan.report.handoffs).toEqual({ archived: ["h-2"], eligible: ["h-1"] });
    const report = await applyGc(plan, options);
    expect(free.archived).toEqual(["h-2"]);
    expect(report.freed.paths).toContain(".stamity/handoffs/archive/h-1.md");
    expect(await exists(archived)).toBe(false);

    await writeAged(archived, "handoff body\n", NOW);
    await mustGit(fixture.root, "add", "-f", ".stamity/handoffs/archive/h-1.md");
    const held = fakeSweep({ archive: [{ id: "h-2", path: live }], remove: [{ id: "h-1", path: archived }] });
    const heldOptions = optionsFor(fixture, { handoffs: held });
    const heldReport = await applyGc(await planGc(heldOptions), heldOptions);
    expect(held.archived).toEqual([]);
    expect(heldReport.kept).toContainEqual({
      path: ".stamity/handoffs/archive/h-1.md",
      reason: "tracked by git, so the handoff sweep did not run",
    });
    expect(await exists(archived)).toBe(true);
  });
});

describe.skipIf(!gitAvailable)("stamity gc — the verb", () => {
  async function runGc(cwd: string, args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    return await runInProcess([gcCommand], ["gc", ...args], { cwd, env: { NO_COLOR: "1" } });
  }

  /** One handoff through the real store, expired long ago and archived: past the 90-day retention at any real now. */
  async function staleArchivedHandoff(root: string): Promise<string> {
    const { id } = await writeHandoff({
      rootDir: root,
      slug: "gc fixture",
      body: REQUIRED_BODY_SECTIONS.map((heading) => `## ${heading}\n\nRecorded for the fixture.\n`).join("\n"),
      summary: "A handoff the fixture wrote long ago and archived.",
      now: new Date("2025-01-01T00:00:00Z"),
    });
    await archiveHandoff(root, id);
    return join(root, ".stamity", "handoffs", "archive", `${id}.md`);
  }

  it("removes an archived handoff past retention through the real store with --apply", async () => {
    const fixture = await seed(getTemp().dir, new Date());
    const archived = await staleArchivedHandoff(fixture.root);
    const preview = await runGc(fixture.root, ["--json"]);
    expect(preview.code).toBe(0);
    const eligible = (JSON.parse(preview.stdout) as { handoffs: { eligible: string[] } }).handoffs.eligible;
    expect(eligible).toEqual([basename(archived, ".md")]);
    const applied = await runGc(fixture.root, ["--apply"]);
    expect(applied.code).toBe(0);
    expect(await exists(archived)).toBe(false);
  });

  it("follows no linked handoff archive: a stale handoff outside the root stays with --apply", async () => {
    const fixture = await seed(getTemp().dir, new Date());
    const archived = await staleArchivedHandoff(fixture.root);
    // The archive moves outside the root, and a link to it takes its place.
    const outsideArchive = join(fixture.outsideDir, "handoff-archive");
    await rename(dirname(archived), outsideArchive);
    await symlink(outsideArchive, dirname(archived));
    const result = await runGc(fixture.root, ["--apply", "--json"]);
    expect(result.code).toBe(0);
    const doc = JSON.parse(result.stdout) as { kept: { path: string; reason: string }[] };
    expect(doc.kept).toContainEqual({
      path: ".stamity/handoffs/archive",
      reason: "a link, not followed: the handoff sweep did not run",
    });
    expect(await exists(join(outsideArchive, basename(archived)))).toBe(true);
  });

  it("marks an open run in the preview and lists every path --apply would remove", async () => {
    const fixture = await seed(getTemp().dir, new Date());
    const result = await runGc(fixture.root, []);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/2026-09-03_open .*open: kept whole/u);
    expect(result.stdout).toContain("  .stamity/runs/2026-09-01_old/reports/old-r1.md\n");
    expect(result.stdout).toContain("  .stamity/runs/2026-11-08_new/reports/aged-r1.md\n");
    expect(result.stdout).not.toContain("open-r1.md");
  });

  it("previews by default: one JSON document with the cell's keys, and no file removed", async () => {
    const fixture = await seed(getTemp().dir, new Date());
    const result = await runGc(fixture.root, ["--json"]);
    expect(result.code).toBe(0);
    const doc = JSON.parse(result.stdout) as Record<string, unknown>;
    for (const key of ["dryRun", "runs", "reports", "branches", "staleTracking", "worktrees", "handoffs", "freed"]) {
      expect(doc, `missing ${key}`).toHaveProperty(key);
    }
    expect(doc["dryRun"]).toBe(true);
    expect((doc["freed"] as { bytes: number }).bytes).toBe(4700);
    expect(await exists(join(fixture.oldRun, "reports", "old-r1.md"))).toBe(true);
  });

  it("frees an old report and keeps a new one with --apply, from inside a lane too", async () => {
    const fixture = await seed(getTemp().dir, new Date());
    const result = await runGc(join(fixture.farm, "dirty"), ["--apply"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("stamity gc: applied.");
    expect(result.stdout).toContain("Freed 4.6 KiB");
    expect(await exists(join(fixture.oldRun, "reports", "old-r1.md"))).toBe(false);
    expect(await exists(join(fixture.newRun, "reports", "new-r1.md"))).toBe(true);
  });

  it("holds --apply to a preview under --dry-run", async () => {
    const fixture = await seed(getTemp().dir, new Date());
    const result = await runGc(fixture.root, ["--apply", "--dry-run"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Nothing was removed");
    expect(await exists(join(fixture.oldRun, "reports", "old-r1.md"))).toBe(true);
  });

  it("refuses a day count that is not a whole number", async () => {
    const fixture = await seed(getTemp().dir, new Date());
    const result = await runGc(fixture.root, ["--apply", "--reports-older-than", "3.5"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--reports-older-than takes a whole number of days");
    expect(await exists(join(fixture.oldRun, "reports", "old-r1.md"))).toBe(true);
  });

  it("formats sizes in binary units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(4700)).toBe("4.6 KiB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MiB");
  });
});
