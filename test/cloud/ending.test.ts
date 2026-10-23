import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { gitSurfaceRecordPath, readRunGitSurface } from "../../src/cli/commands/gate.ts";
import { runCommand } from "../../src/cli/commands/run.ts";
import type * as GitWriteModule from "../../src/cli/engine/gitWrite.ts";
import { makeCliFixture, type CliFixture } from "../support/cliHarness.ts";
import {
  DEFAULT_BRANCH,
  git,
  gitTry,
  hookEnv,
  makeCloudRemote,
  pushMapping,
  runHook,
  sessionStarts,
  writeGhStub,
  type GhStub,
} from "../support/cloudRemote.ts";
import { surfaceRecord } from "../../src/runs/gitSurface.ts";
import { ensureDistBuilt } from "../support/distBuild.ts";
import { runInProcess } from "../support/inProcess.ts";
import { makeTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * REQ-PROVE-039: a run's ending on a cloud machine. Two clones of one bare remote sit under one parent, as a cloud
 * machine holding two checkouts has them; the remote refuses tags, deletions and pushes to its default branch, as a
 * cloud's git proxy does; and `gh` is a stub on `PATH` (test/support/cloudRemote.ts), so the real `gh api` runner
 * (`src/cli/engine/ghRunner.ts`) starts it, reads its HTTP head and answers the pull request step. `stamity run end`
 * runs end to end through the in-process funnel: git does every write for real, and only the push and the remote read
 * are pointed at the bare remote (the spy below).
 *
 * CI's `cloud-container` job runs this file inside `node:24-bookworm` once per cloud profile
 * (`scripts/ci/cloud-leg.mjs`), the offline run among them; the `check` legs run it on the runner.
 */

const WINDOWS = process.platform === "win32";

// A spy, not a stand-in: every call reaches the real runner, so git does each write. For a push and an `ls-remote`
// alone, origin's GitHub URL is pointed at the bare remote beside the clone through the environment, read once as the
// call starts (runEnd.test.ts's spy): an `insteadOf` in the clone's config would also rewrite `git remote get-url`,
// and the verb would read origin as naming no GitHub repository.
vi.mock("../../src/cli/engine/gitWrite.ts", async (importOriginal) => {
  const real = await importOriginal<typeof GitWriteModule>();
  return {
    ...real,
    gitWrite: (cwd: string, args: readonly string[], opts?: Parameters<typeof real.gitWrite>[2]) => {
      const remote = join(dirname(cwd), "remote.git");
      if ((args[0] !== "push" && args[0] !== "ls-remote") || !existsSync(remote)) return real.gitWrite(cwd, args, opts);
      const mapping = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `url.${remote}.insteadOf`, GIT_CONFIG_VALUE_0: "https://github.com/o/r.git" };
      const previous = Object.fromEntries(Object.keys(mapping).map((key) => [key, process.env[key]]));
      Object.assign(process.env, mapping);
      try {
        return real.gitWrite(cwd, args, opts);
      } finally {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    },
  };
});

/** The three runs: one per clone, and a third whose push the remote refuses. */
const RUN_A = "2026-10-18_cloud-a";
const RUN_B = "2026-10-18_cloud-b";
const RUN_C = "2026-10-18_cloud-c";
const branchOf = (run: string): string => `stamity/${run}`;
const runDir = (run: string): string => `.stamity/runs/${run}`;

/** The pin `stamity run start` writes for origin's repository, `https://github.com/o/r.git`. */
const PIN_TEXT = `${JSON.stringify({ host: "github.com", owner: "o", repo: "r" })}\n`;

let fixture: CliFixture;
let parent: TempDirHandle;
let bare: string;
let cloneA: string;
let cloneB: string;
let gh: GhStub;
let home: string;

/** A morning list in the shape the pull request body is made from (runEnd.test.ts's), with no question held. */
function morningList(run: string): string {
  return [`# Morning list — ${run}`, "", "## For you to check", "", "none", "", "## Decisions", "", "none", "", "## Prerequisites", "", "none", "",
    "## Person's calls held", "", "none", "", "## Not done:", "", "none", "", "## How to answer", "", "Nothing to answer.", ""].join("\n");
}

/** An unattended run's record and morning list on its own branch in `clone`, cut from `main`. */
async function startRun(clone: string, run: string): Promise<void> {
  git(clone, ["switch", "--quiet", "-c", branchOf(run), DEFAULT_BRANCH]);
  const base = git(clone, ["rev-parse", "HEAD"]);
  await mkdir(join(clone, runDir(run)), { recursive: true });
  await writeFile(
    join(clone, runDir(run), "record.md"),
    `# Run ${run}\n\nStatus: in progress\nMode: unattended\nBranch: ${branchOf(run)}\nBase: ${base}\n`,
  );
  await writeFile(join(clone, runDir(run), "morning.md"), morningList(run));
  // TEST CHANGE, justified (REQ-FLOW-131, review/97): an unattended `end` now refuses with no pre-flight record of
  // git's surface, which the run's `gate preflight --unattended` writes on the cloud machine before it starts; the
  // record is taken through the same reads in the process environment {@link runVerb} gives the verb.
  await underRunEnv(async () => {
    const place = await gitSurfaceRecordPath(clone);
    const surface = await readRunGitSurface(clone);
    if ("unreadable" in place || "unreadable" in surface) throw new Error("the clone's git surface could not be read");
    await mkdir(dirname(place.path), { recursive: true });
    await writeFile(place.path, `${JSON.stringify(surfaceRecord(surface, randomBytes(16).toString("hex"), new Date().toISOString()))}\n`);
  });
}

/**
 * `body` with `HOME` at an empty folder and no host git config or identity in the process, put back after.
 * TEST CHANGE, justified (REQ-FLOW-131): {@link runVerb}'s environment, moved here unchanged so the pre-flight record
 * {@link startRun} writes is taken in the same one.
 */
async function underRunEnv<T>(body: () => Promise<T>): Promise<T> {
  const overrides: Record<string, string | undefined> = {
    HOME: home,
    XDG_CONFIG_HOME: home,
    GIT_CONFIG_NOSYSTEM: "1",
    EMAIL: undefined,
    GIT_AUTHOR_NAME: undefined,
    GIT_AUTHOR_EMAIL: undefined,
    GIT_COMMITTER_NAME: undefined,
    GIT_COMMITTER_EMAIL: undefined,
  };
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await body();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/**
 * Runs `stamity run` in `cwd` with `gh`'s stub first on `PATH`, `HOME` at an empty folder and no host git config or
 * identity in the process, so the clone's own config decides (runEnd.test.ts's `run`).
 */
async function runVerb(cwd: string, argv: readonly string[]) {
  return underRunEnv(async () => {
    const env = { PATH: [gh.dir, process.env["PATH"] ?? ""].join(delimiter), HOME: home };
    const result = await runInProcess([runCommand], ["run", ...argv], { cwd, env });
    const doc = argv.includes("--json") && result.stdout !== "" ? (JSON.parse(result.stdout) as Record<string, unknown>) : {};
    return { ...result, doc };
  });
}

beforeAll(async () => {
  if (WINDOWS) return;
  await ensureDistBuilt();
  fixture = await makeCliFixture({ git: true, entry: "dist" });
  const init = await fixture.run(["init", "--tools", "claude,cursor,copilot,codex", "-y"]);
  expect(init.code, init.stderr).toBe(0);
  // Each run's origin pin rides the seed, as `run start` would have committed it before the first checkpoint.
  await Promise.all(
    [RUN_A, RUN_B, RUN_C].map(async (run) => {
      await mkdir(join(fixture.repoDir, runDir(run)), { recursive: true });
      await writeFile(join(fixture.repoDir, runDir(run), "origin.json"), PIN_TEXT);
    }),
  );
  git(fixture.repoDir, ["add", "-A"]);
  git(fixture.repoDir, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "stamity init"]);

  parent = await makeTempDir("cloud-ending");
  ({
    bare,
    clones: [cloneA, cloneB],
  } = makeCloudRemote(parent.path("machine"), fixture.repoDir));
  gh = writeGhStub(parent.path("gh-stub"));
  home = parent.path("home");
  await mkdir(home, { recursive: true });
  await Promise.all([cloneA, cloneB].map((clone) => mkdir(join(clone, "sub"), { recursive: true })));
  await startRun(cloneA, RUN_A);
  await startRun(cloneB, RUN_B);
}, 300_000);

afterAll(async () => {
  await parent?.cleanup();
  await fixture?.cleanup();
});

describe.skipIf(WINDOWS)(
  "a run's ending on a cloud machine (REQ-PROVE-039; skipped on Windows: the remote's pre-receive hook is a POSIX shell script, and the gh runner starts only a program file there, never the stub's launcher)",
  () => {
    // A bound of its own: sixteen hook starts, which a loaded machine stretches past the suite's default.
    it("runs each clone's own hooks: the session start in each, from its root and below it, names that clone's run alone", { timeout: 120_000 }, async () => {
      const cases = [
        [cloneA, RUN_A, RUN_B],
        [cloneB, RUN_B, RUN_A],
      ] as const;
      const runs = cases.flatMap(([clone, own, other]) => {
        const rows = sessionStarts(clone);
        expect(rows.length, clone).toBeGreaterThanOrEqual(3);
        return ["", "sub"].flatMap((folder) =>
          rows.map(async (row) => {
            const cwd = join(clone, folder);
            const env = hookEnv({ HOME: home, CLAUDE_PROJECT_DIR: clone, STAMITY_NO_CLIENT_PROBE: "1" });
            // `resume` prints the run in progress's card (REQ-CTX-013), read from the clone the hook resolved.
            const result = await runHook(row.command, cwd, env, { hook_event_name: row.event, session_id: "cloud-ending", cwd, source: "resume" });
            return { label: `${row.client} in ${clone} from ${folder || "the root"}`, own, other, result };
          }),
        );
      });
      for (const { label, own, other, result } of await Promise.all(runs)) {
        expect(result.code, `${label}: ${result.stderr}`).toBe(0);
        expect(result.stdout, label).toContain(`run ${own}`);
        expect(result.stdout, label).not.toContain(`run ${other}`);
      }
    });

    it("refuses at the remote a pushed tag, a push to the default branch and a deletion, leaving its refs as they were", () => {
      const before = git(bare, ["for-each-ref", "--format=%(refname) %(objectname)"]);
      git(cloneA, ["tag", "v0.0.1-cloud"]);
      const tag = gitTry(cloneA, ["push", "origin", "refs/tags/v0.0.1-cloud"], pushMapping(bare));
      const deletion = gitTry(cloneA, ["push", "origin", `:refs/heads/${DEFAULT_BRANCH}`], pushMapping(bare));
      // The default-branch push carries a new commit, so only the remote's rule can refuse it.
      git(cloneA, ["switch", "--quiet", DEFAULT_BRANCH]);
      git(cloneA, ["commit", "--quiet", "--allow-empty", "-m", "straight to main"]);
      const fastForward = gitTry(cloneA, ["push", "origin", `HEAD:refs/heads/${DEFAULT_BRANCH}`], pushMapping(bare));
      git(cloneA, ["reset", "--quiet", "--hard", "HEAD~1"]);
      git(cloneA, ["switch", "--quiet", branchOf(RUN_A)]);
      git(cloneA, ["tag", "-d", "v0.0.1-cloud"]);

      expect(tag.code).not.toBe(0);
      expect(tag.stderr).toContain("cloud remote: refused: refs/tags/v0.0.1-cloud is a tag");
      expect(fastForward.code).not.toBe(0);
      expect(fastForward.stderr).toContain(`cloud remote: refused: refs/heads/${DEFAULT_BRANCH} is the default branch`);
      expect(deletion.code).not.toBe(0);
      expect(deletion.stderr).toContain(`cloud remote: refused: deleting refs/heads/${DEFAULT_BRANCH}`);
      for (const refused of [tag, fastForward, deletion]) expect(refused.stderr).toContain("pre-receive hook declined");
      expect(git(bare, ["for-each-ref", "--format=%(refname) %(objectname)"])).toBe(before);
    });

    it("opens a [DRAFT] pull request when GitHub refuses the draft with 422, after pushing the run's branch", async () => {
      gh.answerSecondPost(201);
      const from = gh.calls().length;

      const { code, doc, stderr } = await runVerb(cloneA, ["end", "--run", RUN_A, "--title", "Cloud leg", "--json"]);

      expect(code, `${stderr}\n${JSON.stringify(doc)}`).toBe(0);
      expect(doc).toMatchObject({
        subcommand: "end",
        run: RUN_A,
        branch: branchOf(RUN_A),
        pushed: true,
        pr: { number: 9, url: "https://github.com/o/r/pull/9", how: "created-fallback" },
        notDone: [],
      });
      expect(git(bare, ["rev-parse", `refs/heads/${branchOf(RUN_A)}`])).toBe(git(cloneA, ["rev-parse", "HEAD"]));
      const calls = gh.calls().slice(from);
      expect(calls.map((call) => `${call.method} ${call.path.split("?")[0] ?? ""}`)).toEqual([
        "GET repos/o/r",
        "GET repos/o/r/pulls",
        "POST repos/o/r/pulls",
        "POST repos/o/r/pulls",
      ]);
      expect(calls.every((call) => call.host === "github.com")).toBe(true);
      expect(calls[2]?.body).toMatchObject({ title: "Cloud leg", head: branchOf(RUN_A), base: DEFAULT_BRANCH, draft: true });
      expect(calls[3]?.body).toMatchObject({ title: "[DRAFT] Cloud leg", head: branchOf(RUN_A), base: DEFAULT_BRANCH });
      expect(calls[3]?.body).not.toHaveProperty("draft");
    });

    it("prints Not done: draft PR not opened, naming the branch, when both POSTs are refused", async () => {
      gh.answerSecondPost(403);
      const from = gh.calls().length;

      const { code, stdout } = await runVerb(cloneB, ["end", "--run", RUN_B, "--title", "Cloud leg"]);

      expect(code).toBe(1);
      expect(stdout).toContain(`pr: not opened`);
      expect(stdout).toMatch(/^Not done:$/m);
      expect(stdout).toContain(`  - draft PR not opened (${branchOf(RUN_B)}): opening it answered HTTP 403`);
      // The branch still reached the remote: the push runs before the pull request is asked for.
      expect(git(bare, ["rev-parse", `refs/heads/${branchOf(RUN_B)}`])).toBe(git(cloneB, ["rev-parse", "HEAD"]));
      expect(gh.calls().slice(from).filter((call) => call.method === "POST")).toHaveLength(2);
    });

    it("names the remote's refusal in notDone when the branch the run pushes is the remote's default, asking for no pull request", async () => {
      await startRun(cloneA, RUN_C);
      const from = gh.calls().length;
      // The remote's default moved to the run's branch under it, as a person can move it on GitHub mid-run; the stub's
      // REST answer still names `main`, so only the remote's own rule stands between the push and its default branch.
      git(bare, ["symbolic-ref", "HEAD", `refs/heads/${branchOf(RUN_C)}`]);
      try {
        const { code, doc } = await runVerb(cloneA, ["end", "--run", RUN_C, "--title", "Cloud leg", "--json"]);

        expect(code).toBe(1);
        expect(doc).toMatchObject({ run: RUN_C, pushed: false, pr: null });
        const notDone = doc["notDone"] as string[];
        expect(notDone).toHaveLength(1);
        expect(notDone[0]).toMatch(/^push rejected by the remote: .*\[remote rejected\].*pre-receive hook declined/);
        expect(notDone[0]).toContain(branchOf(RUN_C));
        expect(gitTry(bare, ["rev-parse", "--verify", "--quiet", `refs/heads/${branchOf(RUN_C)}`]).code).not.toBe(0);
        expect(gh.calls().slice(from).filter((call) => call.method === "POST")).toEqual([]);
      } finally {
        git(bare, ["symbolic-ref", "HEAD", `refs/heads/${DEFAULT_BRANCH}`]);
      }
    });
  },
);
