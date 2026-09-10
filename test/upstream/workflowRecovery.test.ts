import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { branchHead, commitAll, createFork, createUpstream, git, gitAvailable, makeScratch, runLane, type UpstreamFixture } from "./fixtures.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const workflow = parse(readFileSync(join(ROOT, ".github/workflows/upstream-update.yml"), "utf8")) as {
  jobs: { publish: { steps: { name: string; run?: string }[] } };
};
function shell(name: string): string {
  const run = workflow.jobs.publish.steps.find((step) => step.name === name)?.run;
  if (run === undefined) throw new Error(`Missing workflow step ${name}`);
  return run;
}

// These are the actual Ubuntu workflow shell steps. Git and jq remain real; GitHub is the only
// substitute because unit tests cannot create authorized platform PRs or inject API failures.
// Windows does not execute this workflow (runs-on: ubuntu-latest), and lacks its POSIX shell.
const SHELL_AVAILABLE = process.platform !== "win32" && gitAvailable()
  && spawnSync("bash", ["--version"]).status === 0 && spawnSync("jq", ["--version"]).status === 0;
describe.skipIf(!SHELL_AVAILABLE)("upstream publish recovery — executable GitHub boundary", () => {
  const scratch = makeScratch("upstream-recovery");
  let upstream: UpstreamFixture;
  let ordinal = 0;
  beforeAll(() => { upstream = createUpstream(scratch.dir); });
  afterAll(() => { scratch.cleanup(); });

  function fixture() {
    const dir = join(scratch.dir, `case-${ordinal++}`);
    mkdirSync(dir);
    const fork = createFork(upstream, dir);
    const integrated = runLane(fork, ["integrate", "--release", "v1.1.0"]);
    expect(integrated.doc.outcome).toBe("integrated");
    const sha = integrated.doc.mergeCommit!;
    const remote = join(dir, "origin.git");
    git(fork, ["init", "--bare", "--quiet", remote]);
    git(fork, ["remote", "set-url", "origin", remote]);
    git(fork, ["push", "--quiet", "origin", "main", "stamity-upstream/v1.1.0"]);
    const artifact = join(dir, "artifact");
    const bin = join(dir, "bin");
    mkdirSync(artifact);
    mkdirSync(bin);
    writeFileSync(join(artifact, "body.md"), `Fresh prepared report at ${sha}\n`);
    writeFileSync(join(artifact, "landing-policy.md"), "> Fixture landing policy warning\n");
    writeFileSync(join(dir, "pulls.json"), "[]");
    const gh = join(bin, "gh");
    writeFileSync(gh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS, JSON.stringify(args) + '\\n');
if (args[0] === 'api' || (args[0] === 'pr' && args[1] === 'list')) {
  if (process.env.API_FAILURE === 'true') { process.stderr.write('Resource not accessible by token'); process.exit(1); }
  const rows = JSON.parse(fs.readFileSync(process.env.PULLS, 'utf8'));
  process.stdout.write(JSON.stringify(args.includes('--slurp') ? [rows] : rows));
} else if (args[0] === 'pr' && args[1] === 'create') {
  if (process.env.CREATE_FAILURE === 'true') { process.stderr.write('PR creation denied'); process.exit(1); }
  const body = args[args.indexOf('--body-file') + 1];
  fs.copyFileSync(body, process.env.CREATED_BODY);
  process.stdout.write('https://github.com/example/downstream/pull/7\\n');
} else if (args[0] === 'label') { process.stdout.write('[]'); }
else { process.stderr.write('Unexpected GitHub mutation: ' + args.join(' ')); process.exit(9); }
`);
    chmodSync(gh, 0o755);
    const env = {
      ...fork.env, PATH: `${bin}${delimiter}${fork.env["PATH"] ?? process.env["PATH"]}`,
      GH_REPO: "example/downstream", TAG: "v1.1.0", UPDATE_BRANCH: "stamity-upstream/v1.1.0",
      INTEGRATION_BRANCH: "main", MERGE_COMMIT: sha, OUTCOME: "integrated", PUSHED: "false",
      ARTIFACT_DIR: artifact, RUN_URL: "https://github.com/example/downstream/actions/runs/10",
      GITHUB_OUTPUT: join(dir, "output"), GITHUB_STEP_SUMMARY: join(dir, "summary"),
      CALLS: join(dir, "calls"), PULLS: join(dir, "pulls.json"), CREATED_BODY: join(dir, "created-body"),
    };
    const invoke = (name = "Open or update the pull request", extra: Record<string, string> = {}) => {
      writeFileSync(env.CALLS, "");
      writeFileSync(env.GITHUB_OUTPUT, "");
      writeFileSync(env.GITHUB_STEP_SUMMARY, "");
      const result = spawnSync("bash", ["-c", shell(name)], { cwd: fork.dir, env: { ...env, ...extra }, encoding: "utf8" });
      const calls = readFileSync(env.CALLS, "utf8").split("\n").filter(Boolean).map((row) => JSON.parse(row) as string[]);
      return { ...result, calls, output: readFileSync(env.GITHUB_OUTPUT, "utf8"), summary: readFileSync(env.GITHUB_STEP_SUMMARY, "utf8") };
    };
    const pr = (state = "open", base = "main") => ({ number: 7, url: "https://github.com/example/downstream/pull/7", html_url: "https://github.com/example/downstream/pull/7", state, base: { ref: base }, head: { ref: env.UPDATE_BRANCH, sha, repo: { full_name: env.GH_REPO } }, title: "Human title", body: "Human evidence", labels: [{ name: "human-label" }] });
    return { fork, sha, dir, artifact, env, invoke, pr, worktree: integrated.doc.worktree! };
  }

  it("recovers a missing PR after a creation failure without changing either remote branch", () => {
    const f = fixture();
    const first = f.invoke(undefined, { PUSHED: "true", CREATE_FAILURE: "true" });
    expect(first.status, first.stderr).toBe(1);
    expect(first.stdout).toContain("Could not open the pull request");
    const retry = f.invoke();
    expect(retry.status, retry.stderr).toBe(0);
    expect(retry.output).toContain("action=recovered");
    expect(retry.calls.filter((args) => args[0] === "pr")).toEqual([
      expect.arrayContaining(["create", "--head", f.env.UPDATE_BRANCH]),
    ]);
    expect(readFileSync(f.env.CREATED_BODY, "utf8")).toContain(f.sha);
    expect(git(f.fork, ["ls-remote", "--heads", "origin", "main"]).stdout).toContain(f.fork.head);
    expect(git(f.fork, ["ls-remote", "--heads", "origin", f.env.UPDATE_BRANCH]).stdout).toContain(f.sha);
    writeFileSync(f.env.PULLS, JSON.stringify([f.pr()]));
    const repeat = f.invoke();
    expect(repeat.status, repeat.stderr).toBe(0);
    expect(repeat.output).toContain("action=reported");
    expect(repeat.calls.every((args) => args[0] === "api")).toBe(true);
  });

  it("reports an open PR with human metadata and never edits it even on the fresh-push path", () => {
    const f = fixture();
    writeFileSync(f.env.PULLS, JSON.stringify([f.pr()]));
    for (const pushed of ["false", "true"]) {
      const result = f.invoke(undefined, { PUSHED: pushed });
      expect(result.status, result.stderr).toBe(0);
      expect(result.output).toContain("action=reported");
      expect(result.calls.every((args) => args[0] === "api")).toBe(true);
    }
  });

  it("identifies the retained remote SHA when an equivalent new preparation has different timestamps", () => {
    const f = fixture();
    const worktree = runLane(f.fork, ["integrate", "--release", "v1.1.0"]).doc.worktree!;
    const recordPath = join(worktree, ".stamity/upstream/integrations/v1.1.0.json");
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as { createdAt: string; regenerate: { durationMs: number }[] };
    record.createdAt = "2026-01-02T00:00:00.000Z";
    for (const command of record.regenerate) command.durationMs += 50;
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    git(f.fork, ["add", recordPath], { cwd: worktree });
    git(f.fork, ["commit", "--amend", "--no-edit", "--quiet"], { cwd: worktree });
    const prepared = branchHead(f.fork, f.env.UPDATE_BRANCH)!;
    expect(prepared).not.toBe(f.sha);
    const result = f.invoke(undefined, { MERGE_COMMIT: prepared });
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toContain("action=recovered");
    const body = readFileSync(f.env.CREATED_BODY, "utf8");
    expect(body).toContain(f.sha);
    expect(body).not.toContain(prepared);
    expect(JSON.parse(readFileSync(join(f.artifact, "publish-result.json"), "utf8"))).toMatchObject({ action: "recovered", commit: f.sha });
  });

  it("does not reopen or replace a deliberately closed PR", () => {
    const f = fixture();
    writeFileSync(f.env.PULLS, JSON.stringify([f.pr("closed")]));
    const result = f.invoke();
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toContain("action=closed");
    expect(result.calls.every((args) => args[0] === "api")).toBe(true);
  });

  it("refuses ambiguous PR ownership and a PR aimed at another base", () => {
    const f = fixture();
    for (const rows of [[f.pr(), { ...f.pr("closed"), number: 8 }], [f.pr("open", "other")]]) {
      writeFileSync(f.env.PULLS, JSON.stringify(rows));
      const result = f.invoke();
      expect(result.status, result.stderr).toBe(1);
      expect(result.stdout).toContain("ownership");
      expect(result.calls.every((args) => args[0] === "api")).toBe(true);
    }
  });

  it("keeps a human followup commit and refuses to claim its report", () => {
    const f = fixture();
    const worktree = runLane(f.fork, ["integrate", "--release", "v1.1.0"]).doc.worktree!;
    writeFileSync(join(worktree, "human.txt"), "Human fixup\n");
    const human = commitAll({ ...f.fork, dir: worktree }, "Human followup");
    git(f.fork, ["push", "--quiet", "origin", f.env.UPDATE_BRANCH]);
    const result = f.invoke();
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain("ownership");
    expect(result.calls.every((args) => args[0] === "api")).toBe(true);
    expect(git(f.fork, ["ls-remote", "--heads", "origin", f.env.UPDATE_BRANCH]).stdout).toContain(human);
    expect(branchHead(f.fork, "main")).toBe(f.fork.head);
  });

  it("fails closed when the platform cannot enumerate previous PRs", () => {
    const f = fixture();
    const result = f.invoke(undefined, { PUSHED: "true", API_FAILURE: "true" });
    expect(result.status).not.toBe(0);
    expect(result.calls.some((args) => args[0] === "pr" && args[1] === "create")).toBe(false);
    expect(existsSync(f.env.CREATED_BODY)).toBe(false);
  });

  it("requires manual review when the integration target moved after the retained branch was prepared", () => {
    const f = fixture();
    writeFileSync(join(f.fork.dir, "target-fix.txt"), "New target work\n");
    commitAll(f.fork, "Target advanced");
    const result = f.invoke();
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain("current target");
    expect(result.calls.every((args) => args[0] === "api")).toBe(true);
  });

  it.each(["human-tree", "invalid-record", "workflow-files"])("refuses %s even when the remote head retains the expected merge parents", (kind) => {
    const f = fixture();
    if (kind === "invalid-record") {
      writeFileSync(join(f.worktree, ".stamity/upstream/integrations/v1.1.0.json"), "{}\n");
    } else if (kind === "workflow-files") {
      mkdirSync(join(f.worktree, ".github/workflows"), { recursive: true });
      writeFileSync(join(f.worktree, ".github/workflows/new.yml"), "name: reviewed separately\n");
    } else {
      writeFileSync(join(f.worktree, "human.txt"), "An amended merge also carries human work\n");
    }
    git(f.fork, ["add", "."], { cwd: f.worktree });
    git(f.fork, ["commit", "--amend", "--no-edit", "--quiet"], { cwd: f.worktree });
    const changed = branchHead(f.fork, f.env.UPDATE_BRANCH)!;
    // Controlled failure injection into this temporary bare remote: transfer the object, then
    // change its fixture ref. No platform repository or operator checkout is involved.
    git(f.fork, ["push", "--quiet", "origin", `${changed}:refs/heads/fixture-transfer`]);
    git(f.fork, ["--git-dir", join(f.dir, "origin.git"), "update-ref", `refs/heads/${f.env.UPDATE_BRANCH}`, changed]);
    const result = f.invoke(undefined, kind === "workflow-files" ? { MERGE_COMMIT: changed } : {});
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain("ownership");
    expect(result.calls.every((args) => args[0] === "api")).toBe(true);
    expect(git(f.fork, ["ls-remote", "--heads", "origin", f.env.UPDATE_BRANCH]).stdout).toContain(changed);
    expect(branchHead(f.fork, "main")).toBe(f.fork.head);
  });

  it("rejects a mismatched bundle SHA before any push", () => {
    const f = fixture();
    git(f.fork, ["worktree", "remove", f.worktree]);
    git(f.fork, ["bundle", "create", join(f.artifact, "update.bundle"), `main..${f.env.UPDATE_BRANCH}`]);
    const result = f.invoke("Restore and push the update branch", { MERGE_COMMIT: f.fork.head });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain("Bundle identity rejected");
    expect(git(f.fork, ["ls-remote", "--heads", "origin", f.env.UPDATE_BRANCH]).stdout).toContain(f.sha);
  });

  it("a remote lookup failure stops before treating the update branch as absent", () => {
    const f = fixture();
    git(f.fork, ["worktree", "remove", f.worktree]);
    git(f.fork, ["bundle", "create", join(f.artifact, "update.bundle"), `main..${f.env.UPDATE_BRANCH}`]);
    git(f.fork, ["remote", "set-url", "origin", join(f.dir, "unavailable.git")]);
    const trace = join(f.dir, "git-trace");
    const result = f.invoke("Restore and push the update branch", { GIT_TRACE: trace });
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("Pushed");
    expect(result.output).not.toContain("pushed=true");
    expect(result.output).not.toContain("ready=true");
    expect(readFileSync(trace, "utf8")).not.toContain("git push origin");
  });
});
