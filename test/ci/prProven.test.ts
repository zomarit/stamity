import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — import-safe native ESM CI helper, outside the product package.
import { decide, GATE_WORKFLOW } from "../../scripts/ci/pr-proven.mjs";

/**
 * The proven-push detector, `scripts/ci/pr-proven.mjs`.
 *
 * A push to `main` whose tree a pull request already proved skips `ci.yml`'s whole test matrix,
 * so the one direction that matters is a push read as proven when it was not. Every case here
 * that is not the one legal shape is asserted to read not proven. The legal shape is a push to
 * `main`, a 40-hex tree, and a pull-request head with that same tree whose newest `ci.yml`
 * pull-request run had exactly one `all-ci-checks` job in its latest attempt, concluded `success`,
 * with no `all-ci-checks` check run on that head from any other check suite.
 *
 * The trust boundary is `ci.yml`'s own run, not the app that reports it. Every job of every
 * workflow reports as the `github-actions` app, so a second workflow (a fork's pull request can
 * add one) can put a passing `all-ci-checks` check run beside a failing gate. Such a run sits in
 * another check suite, and a second producer reads not proven.
 *
 * TEST CHANGE, justified (2026-10-08, run 2026-10-08_maintainer-tooling, fix round 1, review/9
 * and review/15): `decide` reads `heads` instead of one row per check run, because the evidence
 * is now `ci.yml`'s run and the check suites on the head rather than any check run's app; the
 * app-slug cases are kept as second-producer cases. The CLI fake no longer needs `jq`, because the
 * script parses every answer itself (review/17), and it gains pages and a hang.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = join(REPO_ROOT, "scripts", "ci", "pr-proven.mjs");

const PUSHED = "a".repeat(40);
const TREE = "c".repeat(40);
const OTHER_TREE = "d".repeat(40);
const HEAD = "e".repeat(40);
const MAIN = "refs/heads/main";
const GATE_SUITE = 11;
const DECOY_SUITE = 99;

interface Head {
  readonly headTree: string;
  readonly gateSuite: number | null;
  readonly gateJobs: readonly (string | null)[];
  readonly checkSuites: readonly (number | null)[];
}
interface Decision {
  readonly proven: boolean;
  readonly reason: string;
}
const decideTyped = decide as (input: {
  event: string | undefined;
  ref: string | undefined;
  tree: string | undefined;
  heads: readonly Head[];
}) => Decision;

/** A head whose `ci.yml` run's one `all-ci-checks` job concluded `conclusion`, in its own suite. */
const gated = (conclusion: string | null, headTree = TREE, extraSuites: readonly (number | null)[] = []): Head => ({
  headTree,
  gateSuite: GATE_SUITE,
  gateJobs: [conclusion],
  checkSuites: [GATE_SUITE, ...extraSuites],
});

const push = (heads: readonly Head[], tree: string | undefined = TREE) => decideTyped({ event: "push", ref: MAIN, tree, heads });

describe("decide — the pure rule", () => {
  it("trusts exactly one producer, ci.yml's own run", () => {
    expect(GATE_WORKFLOW).toBe(".github/workflows/ci.yml");
  });

  it("reads proven for a push to main whose tree ci.yml's pull-request run passed", () => {
    const decision = push([gated("success")]);
    expect(decision.proven).toBe(true);
    expect(decision.reason).toContain(TREE);
  });

  it("finds the passing head among others, and only on the pushed tree", () => {
    expect(push([gated("failure", OTHER_TREE), gated("success", OTHER_TREE), gated("success")]).proven).toBe(true);
  });

  it("reads not proven for every gate conclusion but success, and for no head at all", () => {
    for (const conclusion of ["failure", "cancelled", "stale", "neutral", "skipped", "timed_out", "action_required", null]) {
      expect(push([gated(conclusion)]).proven, String(conclusion)).toBe(false);
    }
    expect(push([]).proven).toBe(false);
  });

  it("reads not proven when the passing run sits on another tree", () => {
    // A rebase merge of a branch that was behind writes commits whose tree no pull-request run
    // tested: no head matches, and the full matrix runs.
    expect(push([gated("success", OTHER_TREE)]).proven).toBe(false);
  });

  it("reads not proven when the head has no ci.yml pull-request run, whatever check runs it carries", () => {
    const decision = push([{ headTree: TREE, gateSuite: null, gateJobs: [], checkSuites: [DECOY_SUITE] }]);
    expect(decision.proven).toBe(false);
  });

  it("reads not proven when the latest attempt holds no all-ci-checks job, or more than one", () => {
    for (const gateJobs of [[], ["success", "success"], ["success", "failure"]]) {
      const decision = push([{ headTree: TREE, gateSuite: GATE_SUITE, gateJobs, checkSuites: [GATE_SUITE] }]);
      expect(decision.proven, JSON.stringify(gateJobs)).toBe(false);
    }
  });

  // The security cases (review/9): a passing decoy from another check suite proves nothing.
  it("does not let a passing decoy from another check suite stand in for a failing ci.yml run", () => {
    const decision = push([gated("failure", TREE, [DECOY_SUITE])]);
    expect(decision.proven).toBe(false);
    expect(decision.reason).toContain(String(DECOY_SUITE));
  });

  it("reads a second producer as not proven even beside a passing ci.yml run, and names it", () => {
    const decision = push([gated("success", TREE, [DECOY_SUITE])]);
    expect(decision.proven).toBe(false);
    expect(decision.reason).toContain("second producer");
    expect(decision.reason).toContain(String(DECOY_SUITE));
    // A check run with no suite id is never the gate's either.
    expect(push([gated("success", TREE, [null])]).proven).toBe(false);
  });

  it("does not let a passing head outvote a second producer on another head with the same tree", () => {
    expect(push([gated("success"), gated("success", TREE, [DECOY_SUITE])]).proven).toBe(false);
  });

  it("never reads proven on any event but a push, or on a ref other than main", () => {
    const heads = [gated("success")];
    for (const event of ["pull_request", "schedule", "workflow_dispatch", "merge_group", "", undefined]) {
      expect(decideTyped({ event, ref: MAIN, tree: TREE, heads }).proven, String(event)).toBe(false);
    }
    for (const ref of ["refs/heads/feature", "refs/heads/main-old", "refs/tags/v1.0.0", "main", "", undefined]) {
      expect(decideTyped({ event: "push", ref, tree: TREE, heads }).proven, String(ref)).toBe(false);
    }
  });

  it("never reads proven on a tree that is not a 40-hex object id", () => {
    for (const tree of [undefined, "", "c".repeat(39), "c".repeat(41), "C".repeat(40), "g".repeat(40), `${"c".repeat(40)}\n`]) {
      expect(push([gated("success", tree ?? "")], tree).proven, String(tree)).toBe(false);
    }
  });
});

// ── the CLI, against a fake `gh` ─────────────────────────────────────────────

const scratches: string[] = [];
afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The file the fake answers an endpoint from, keyed the way the fake's shell keys it. */
const keyOf = (endpoint: string) => endpoint.replace(/[^A-Za-z0-9]/g, "_");

const REPOSITORY = "example/repo";
const RUN_ID = 501;
const page = (endpoint: string, number = 1) => `${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100&page=${number}`;
const BASE = {
  pushedCommit: `repos/${REPOSITORY}/git/commits/${PUSHED}`,
  pulls: `repos/${REPOSITORY}/commits/${PUSHED}/pulls`,
  headCommit: `repos/${REPOSITORY}/git/commits/${HEAD}`,
  runs: `repos/${REPOSITORY}/actions/workflows/ci.yml/runs?head_sha=${HEAD}&event=pull_request`,
  jobs: `repos/${REPOSITORY}/actions/runs/${RUN_ID}/jobs?filter=latest`,
  checkRuns: `repos/${REPOSITORY}/commits/${HEAD}/check-runs?check_name=all-ci-checks&filter=all`,
} as const;
const ENDPOINTS = {
  pushedCommit: BASE.pushedCommit,
  pulls: page(BASE.pulls),
  headCommit: BASE.headCommit,
  runs: page(BASE.runs),
  jobs: page(BASE.jobs),
  checkRuns: page(BASE.checkRuns),
} as const;

const ciRun = (id: number, suite: number, createdAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  path: ".github/workflows/ci.yml",
  event: "pull_request",
  head_sha: HEAD,
  created_at: createdAt,
  check_suite_id: suite,
  ...extra,
});
const checkRun = (suite: number | null, conclusion: string | null, app = "github-actions") => ({
  name: "all-ci-checks",
  head_sha: HEAD,
  conclusion,
  app: { slug: app },
  check_suite: suite === null ? null : { id: suite },
});

interface Fake {
  readonly dir: string;
  readonly responses: string;
  readonly bin: string;
  readonly answer: (endpoint: string, body: unknown) => void;
}

/**
 * A scratch directory holding a fake `gh` on PATH and one response file per endpoint, shaped the
 * way the real API answers; the script parses every answer itself, so no `jq` is involved. The
 * real `gh` is unusable here: it needs a network, a token and a repository whose runs the test
 * does not control. An endpoint with no response file answers the way `gh` answers a 404: stderr
 * and exit 1. An endpoint with a `.hang` marker beside its file never answers.
 */
function fakeGh(conclusion: string | null = "success"): Fake {
  const dir = mkdtempSync(join(tmpdir(), "stamity-pr-proven-"));
  scratches.push(dir);
  const responses = join(dir, "responses");
  const bin = join(dir, "bin");
  mkdirSync(responses);
  mkdirSync(bin);
  const answer = (endpoint: string, body: unknown) =>
    writeFileSync(join(responses, keyOf(endpoint)), typeof body === "string" ? body : JSON.stringify(body));
  answer(ENDPOINTS.pushedCommit, { sha: PUSHED, tree: { sha: TREE } });
  answer(ENDPOINTS.pulls, [{ number: 7, state: "closed", head: { sha: HEAD, ref: "lane" } }]);
  answer(ENDPOINTS.headCommit, { sha: HEAD, tree: { sha: TREE } });
  answer(ENDPOINTS.runs, { total_count: 1, workflow_runs: [ciRun(RUN_ID, GATE_SUITE, "2026-10-08T10:00:00Z")] });
  answer(ENDPOINTS.jobs, {
    total_count: 3,
    jobs: [
      { name: "check (ubuntu-latest, 24)", conclusion: "success" },
      // The advisory lane can be red beside a green gate; only `all-ci-checks` is read.
      { name: "supply-chain", conclusion: "failure" },
      { name: "all-ci-checks", conclusion },
    ],
  });
  answer(ENDPOINTS.checkRuns, { total_count: 1, check_runs: [checkRun(GATE_SUITE, conclusion)] });
  const gh = join(bin, "gh");
  writeFileSync(
    gh,
    `#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS"
if [ "$1" != api ] || [ "$#" -ne 2 ]; then
  echo "the fake gh was asked for something that is not one api read: $*" >&2
  exit 9
fi
FILE="$RESPONSES/$(printf '%s' "$2" | tr -c 'A-Za-z0-9' '_')"
if [ -f "$FILE.hang" ]; then exec sleep 30; fi
if [ ! -f "$FILE" ]; then
  echo "gh: Not Found (HTTP 404)" >&2
  exit 1
fi
cat "$FILE"
`,
  );
  chmodSync(gh, 0o755);
  writeFileSync(join(dir, "calls"), "");
  return { dir, responses, bin, answer };
}

function run(fake: Fake | undefined, args: readonly string[], env: Record<string, string> = {}) {
  const inherited = { ...process.env };
  for (const key of ["GITHUB_OUTPUT", "GITHUB_EVENT_NAME", "GITHUB_REF", "GITHUB_REPOSITORY", "GH_TOKEN", "PR_PROVEN_READ_TIMEOUT_MS"]) {
    delete inherited[key];
  }
  const base: Record<string, string> = {
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: MAIN,
    GITHUB_REPOSITORY: REPOSITORY,
    GH_TOKEN: "not-a-token",
  };
  if (fake !== undefined) {
    base["PATH"] = `${fake.bin}${delimiter}${process.env["PATH"] ?? ""}`;
    base["RESPONSES"] = fake.responses;
    base["CALLS"] = join(fake.dir, "calls");
  }
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...inherited, ...base, ...env },
    windowsHide: true,
    timeout: 15_000,
  });
}

const callsOf = (fake: { dir: string }) =>
  readFileSync(join(fake.dir, "calls"), "utf8").split("\n").filter((line) => line !== "");

const filler = (count: number, make: (index: number) => unknown) => Array.from({ length: count }, (_, index) => make(index));

// The fake is a POSIX shell script, which Windows cannot run as `gh`; the pure rule above and the
// argument check below run everywhere, and CI's ubuntu legs run these. Nothing else is required.
const FAKE_RUNNABLE = process.platform !== "win32";

describe.skipIf(!FAKE_RUNNABLE)("pr-proven.mjs — the CLI over a fake gh", () => {
  it("prints proven=true when the head's tree matches and ci.yml's run passed all-ci-checks", () => {
    const fake = fakeGh();
    const output = join(fake.dir, "output");
    writeFileSync(output, "earlier=1\n");
    const result = run(fake, ["--sha", PUSHED], { GITHUB_OUTPUT: output });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("proven=true\n");
    expect(readFileSync(output, "utf8")).toBe("earlier=1\nproven=true\n");
    // Each read one `api` call with an argv: ci.yml's pull-request runs on the head, the latest
    // attempt's jobs, and every `all-ci-checks` check run on the head, each list paged.
    expect(callsOf(fake)).toEqual([
      `api ${ENDPOINTS.pushedCommit}`,
      `api ${ENDPOINTS.pulls}`,
      `api ${ENDPOINTS.headCommit}`,
      `api ${ENDPOINTS.runs}`,
      `api ${ENDPOINTS.jobs}`,
      `api ${ENDPOINTS.checkRuns}`,
    ]);
  });

  it("prints proven=false for a passing decoy job beside a failing ci.yml run", () => {
    // review/9's exploit: a second workflow's job named `all-ci-checks` passes under the same
    // `github-actions` app while ci.yml's own run failed.
    const fake = fakeGh("failure");
    fake.answer(ENDPOINTS.checkRuns, { total_count: 2, check_runs: [checkRun(GATE_SUITE, "failure"), checkRun(DECOY_SUITE, "success")] });
    const result = run(fake, ["--sha", PUSHED]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("proven=false\n");
    expect(result.stderr).toContain(String(DECOY_SUITE));
  });

  it("prints proven=false for a second producer even beside a passing ci.yml run, whatever its app", () => {
    for (const app of ["github-actions", "evil-bot"]) {
      const fake = fakeGh();
      fake.answer(ENDPOINTS.checkRuns, { total_count: 2, check_runs: [checkRun(GATE_SUITE, "success"), checkRun(DECOY_SUITE, "success", app)] });
      const result = run(fake, ["--sha", PUSHED]);
      expect(result.status, `${app}: ${result.stderr}`).toBe(0);
      expect(result.stdout, app).toBe("proven=false\n");
      expect(result.stderr, app).toContain("second producer");
    }
  });

  it("lets the latest attempt of a re-run decide, both ways", () => {
    // A re-run keeps its check suite, so both attempts' check runs sit in the gate's suite; the
    // jobs read with `filter=latest` answers the latest attempt alone.
    const greenAfterRed = fakeGh("success");
    greenAfterRed.answer(ENDPOINTS.checkRuns, { total_count: 2, check_runs: [checkRun(GATE_SUITE, "failure"), checkRun(GATE_SUITE, "success")] });
    expect(run(greenAfterRed, ["--sha", PUSHED]).stdout).toBe("proven=true\n");

    const redAfterGreen = fakeGh("failure");
    redAfterGreen.answer(ENDPOINTS.checkRuns, { total_count: 2, check_runs: [checkRun(GATE_SUITE, "success"), checkRun(GATE_SUITE, "failure")] });
    const result = run(redAfterGreen, ["--sha", PUSHED]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("proven=false\n");
  });

  it("reads the newest ci.yml pull-request run on the head, and only ci.yml's pull-request runs", () => {
    const newerFailed = fakeGh();
    newerFailed.answer(ENDPOINTS.runs, {
      total_count: 2,
      workflow_runs: [ciRun(RUN_ID, GATE_SUITE, "2026-10-08T10:00:00Z"), ciRun(777, 12, "2026-10-08T11:00:00Z")],
    });
    newerFailed.answer(page(`repos/${REPOSITORY}/actions/runs/777/jobs?filter=latest`), { total_count: 1, jobs: [{ name: "all-ci-checks", conclusion: "failure" }] });
    const newer = run(newerFailed, ["--sha", PUSHED]);
    expect(newer.stdout, newer.stderr).toBe("proven=false\n");
    expect(callsOf(newerFailed)).toContain(`api ${page(`repos/${REPOSITORY}/actions/runs/777/jobs?filter=latest`)}`);

    for (const extra of [{ path: ".github/workflows/decoy.yml" }, { event: "push" }, { head_sha: OTHER_TREE }]) {
      const fake = fakeGh();
      fake.answer(ENDPOINTS.runs, { total_count: 1, workflow_runs: [ciRun(RUN_ID, GATE_SUITE, "2026-10-08T10:00:00Z", extra)] });
      const result = run(fake, ["--sha", PUSHED]);
      expect(result.status, `${JSON.stringify(extra)}: ${result.stderr}`).toBe(0);
      expect(result.stdout, JSON.stringify(extra)).toBe("proven=false\n");
    }
  });

  it("pages every list, so a decoy on a later page still reads not proven", () => {
    const fake = fakeGh();
    fake.answer(ENDPOINTS.checkRuns, { total_count: 101, check_runs: filler(100, () => checkRun(GATE_SUITE, "success")) });
    fake.answer(page(BASE.checkRuns, 2), { total_count: 101, check_runs: [checkRun(DECOY_SUITE, "success")] });
    const result = run(fake, ["--sha", PUSHED]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("proven=false\n");
    expect(callsOf(fake)).toContain(`api ${page(BASE.checkRuns, 2)}`);

    // The gate's job on the second page of the jobs list is still found.
    const jobs = fakeGh();
    jobs.answer(ENDPOINTS.jobs, { total_count: 101, jobs: filler(100, (index) => ({ name: `check (${index})`, conclusion: "success" })) });
    jobs.answer(page(BASE.jobs, 2), { total_count: 101, jobs: [{ name: "all-ci-checks", conclusion: "success" }] });
    const found = run(jobs, ["--sha", PUSHED]);
    expect(found.stdout, found.stderr).toBe("proven=true\n");

    // A list that answers fewer rows than its own count says reads not proven.
    const short = fakeGh();
    short.answer(ENDPOINTS.checkRuns, { total_count: 2, check_runs: [checkRun(GATE_SUITE, "success")] });
    expect(run(short, ["--sha", PUSHED]).stdout).toBe("proven=false\n");
  });

  it("prints proven=false when the pull-request head carries another tree", () => {
    const fake = fakeGh();
    fake.answer(ENDPOINTS.headCommit, { tree: { sha: OTHER_TREE } });
    const result = run(fake, ["--sha", PUSHED]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("proven=false\n");
  });

  it("prints proven=false and exits 0 when any one read fails", () => {
    for (const endpoint of Object.values(ENDPOINTS)) {
      const fake = fakeGh();
      unlinkSync(join(fake.responses, keyOf(endpoint)));
      const output = join(fake.dir, "output");
      const result = run(fake, ["--sha", PUSHED], { GITHUB_OUTPUT: output });
      expect(result.status, `${endpoint}: ${result.stderr}`).toBe(0);
      expect(result.stdout, endpoint).toBe("proven=false\n");
      expect(readFileSync(output, "utf8"), endpoint).toBe("proven=false\n");
    }
  });

  it("prints proven=false and exits 0 when a read hangs, well inside the job's timeout (review/15)", () => {
    const fake = fakeGh();
    writeFileSync(join(fake.responses, `${keyOf(ENDPOINTS.runs)}.hang`), "");
    const started = Date.now();
    const result = run(fake, ["--sha", PUSHED], { PR_PROVEN_READ_TIMEOUT_MS: "500" });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("proven=false\n");
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("prints proven=false on an answer that is not JSON or lacks a field it reads", () => {
    const broken: readonly (readonly [string, string])[] = [
      [ENDPOINTS.pulls, "<html>rate limited</html>"],
      [ENDPOINTS.pulls, JSON.stringify({ message: "API rate limit exceeded" })],
      [ENDPOINTS.pulls, JSON.stringify([{ number: 7 }])],
      [ENDPOINTS.pulls, JSON.stringify([{ number: 7, head: { sha: "../../../evil" } }])],
      [ENDPOINTS.pushedCommit, JSON.stringify({ sha: PUSHED })],
      [ENDPOINTS.headCommit, JSON.stringify({ tree: { sha: "not-a-tree" } })],
      [ENDPOINTS.runs, JSON.stringify({ total_count: 1 })],
      [ENDPOINTS.runs, JSON.stringify({ total_count: 1, workflow_runs: [ciRun(RUN_ID, 0, "2026-10-08T10:00:00Z")] })],
      [ENDPOINTS.runs, JSON.stringify({ total_count: 1, workflow_runs: [ciRun(-1, GATE_SUITE, "2026-10-08T10:00:00Z")] })],
      [ENDPOINTS.jobs, JSON.stringify({ total_count: 1, jobs: "none" })],
      [ENDPOINTS.checkRuns, JSON.stringify({ total_count: 1 })],
      [ENDPOINTS.checkRuns, "not json at all"],
    ];
    for (const [endpoint, body] of broken) {
      const fake = fakeGh();
      writeFileSync(join(fake.responses, keyOf(endpoint)), body);
      const result = run(fake, ["--sha", PUSHED]);
      expect(result.status, `${endpoint} ${body}: ${result.stderr}`).toBe(0);
      expect(result.stdout, `${endpoint} ${body}`).toBe("proven=false\n");
    }
  });

  it("asks the API nothing on any event but a push to main, or without a token, sha or repository", () => {
    const shapes: readonly (readonly [readonly string[], Record<string, string>])[] = [
      [["--sha", PUSHED], { GITHUB_EVENT_NAME: "pull_request" }],
      [["--sha", PUSHED], { GITHUB_EVENT_NAME: "schedule" }],
      [["--sha", PUSHED], { GITHUB_EVENT_NAME: "workflow_dispatch" }],
      [["--sha", PUSHED], { GITHUB_REF: "refs/heads/feature" }],
      [["--sha", PUSHED], { GH_TOKEN: "" }],
      [["--sha", PUSHED], { GITHUB_REPOSITORY: "" }],
      [["--sha", PUSHED], { GITHUB_REPOSITORY: "../../evil" }],
      [["--sha", "HEAD"], {}],
      [["--sha", ""], {}],
      [[], {}],
    ];
    for (const [args, env] of shapes) {
      const fake = fakeGh();
      const result = run(fake, args, env);
      const label = `${args.join(" ")} ${JSON.stringify(env)}`;
      expect(result.status, `${label}: ${result.stderr}`).toBe(0);
      expect(result.stdout, label).toBe("proven=false\n");
      expect(callsOf(fake), label).toEqual([]);
    }
  });

  it("accepts the sha in its --sha=<sha> spelling", () => {
    const fake = fakeGh();
    const result = run(fake, [`--sha=${PUSHED}`]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("proven=true\n");
  });
});

describe("pr-proven.mjs — its arguments", () => {
  it("refuses an argument it does not know, rather than guessing", () => {
    const result = run(undefined, ["--bsae", PUSHED]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("answers not proven without asking anything when gh is not on PATH", () => {
    const empty = mkdtempSync(join(tmpdir(), "stamity-pr-proven-nogh-"));
    scratches.push(empty);
    // `PATH` holds only an empty folder, so the `gh` lookup itself fails: the spawn error is a
    // thrown read like any other, and the job must stay green with the full matrix to follow.
    const result = run(undefined, ["--sha", PUSHED], { PATH: empty });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("proven=false\n");
  });
});
