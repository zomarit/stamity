import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — import-safe native ESM CI helper, outside the product package.
import { decide, TRUSTED_CHECK_APP } from "../../scripts/ci/pr-proven.mjs";

/**
 * The proven-push detector, `scripts/ci/pr-proven.mjs`.
 *
 * A push to `main` whose tree a pull request already proved skips `ci.yml`'s whole test matrix,
 * so the one direction that matters is a push read as proven when it was not. Every case here
 * that is not the one legal shape — a push to `main`, a 40-hex tree, and a pull-request head with
 * that same tree whose `all-ci-checks` check run the GitHub Actions app created and concluded
 * `success` — is asserted to read not proven. The trust boundary is the app: any integration
 * holding `checks: write` can create a check run under the name `all-ci-checks`, and the
 * check-runs read does not filter by producer, so a run from any other app, or from none, is
 * never evidence. The CLI half runs against a fake `gh`, because the property that matters there
 * — that any failed or malformed read answers not proven and exit 0 — is in what the script does
 * with the API's answers, not in the pure rule.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = join(REPO_ROOT, "scripts", "ci", "pr-proven.mjs");

const PUSHED = "a".repeat(40);
const TREE = "c".repeat(40);
const OTHER_TREE = "d".repeat(40);
const HEAD = "e".repeat(40);
const MAIN = "refs/heads/main";

interface Row {
  readonly headTree: string;
  readonly checkConclusion: string | null;
  readonly checkApp: string | null;
}
interface Decision {
  readonly proven: boolean;
  readonly reason: string;
}
const decideTyped = decide as (input: {
  event: string | undefined;
  ref: string | undefined;
  tree: string | undefined;
  prRuns: readonly Row[];
}) => Decision;

const trusted = (conclusion: string | null, headTree = TREE): Row => ({
  headTree,
  checkConclusion: conclusion,
  checkApp: "github-actions",
});

describe("decide — the pure rule", () => {
  it("trusts exactly one producer, the GitHub Actions app", () => {
    expect(TRUSTED_CHECK_APP).toBe("github-actions");
  });

  it("reads proven for a push to main whose tree a github-actions run passed", () => {
    const decision = decideTyped({ event: "push", ref: MAIN, tree: TREE, prRuns: [trusted("success")] });
    expect(decision.proven).toBe(true);
    expect(decision.reason).toContain(TREE);
  });

  it("finds the passing row among others, and only on the pushed tree", () => {
    const decision = decideTyped({
      event: "push",
      ref: MAIN,
      tree: TREE,
      prRuns: [trusted("failure", OTHER_TREE), trusted("success", OTHER_TREE), trusted("success")],
    });
    expect(decision.proven).toBe(true);
  });

  it("reads not proven for every conclusion but success, and for no row at all", () => {
    for (const conclusion of ["failure", "cancelled", "stale", "neutral", "skipped", "timed_out", "action_required", null]) {
      const decision = decideTyped({ event: "push", ref: MAIN, tree: TREE, prRuns: [trusted(conclusion)] });
      expect(decision.proven, String(conclusion)).toBe(false);
    }
    expect(decideTyped({ event: "push", ref: MAIN, tree: TREE, prRuns: [] }).proven).toBe(false);
  });

  it("reads not proven when the passing run sits on another tree", () => {
    // A rebase merge of a branch that was behind writes commits whose tree no pull-request run
    // tested: no row matches, and the full matrix runs.
    const decision = decideTyped({ event: "push", ref: MAIN, tree: TREE, prRuns: [trusted("success", OTHER_TREE)] });
    expect(decision.proven).toBe(false);
  });

  it("never takes a run another app created as evidence, and names that app", () => {
    const foreign = decideTyped({
      event: "push",
      ref: MAIN,
      tree: TREE,
      prRuns: [{ headTree: TREE, checkConclusion: "success", checkApp: "some-other-app" }],
    });
    expect(foreign.proven).toBe(false);
    expect(foreign.reason).toContain("some-other-app");
  });

  it("never takes a run with no app as evidence", () => {
    const decision = decideTyped({
      event: "push",
      ref: MAIN,
      tree: TREE,
      prRuns: [{ headTree: TREE, checkConclusion: "success", checkApp: null }],
    });
    expect(decision.proven).toBe(false);
  });

  it("does not let a foreign success stand in for a github-actions failure on the same tree", () => {
    const decision = decideTyped({
      event: "push",
      ref: MAIN,
      tree: TREE,
      prRuns: [{ headTree: TREE, checkConclusion: "success", checkApp: "evil-bot" }, trusted("failure")],
    });
    expect(decision.proven).toBe(false);
  });

  it("never reads proven on any event but a push, or on a ref other than main", () => {
    const rows = [trusted("success")];
    for (const event of ["pull_request", "schedule", "workflow_dispatch", "merge_group", "", undefined]) {
      expect(decideTyped({ event, ref: MAIN, tree: TREE, prRuns: rows }).proven, String(event)).toBe(false);
    }
    for (const ref of ["refs/heads/feature", "refs/heads/main-old", "refs/tags/v1.0.0", "main", "", undefined]) {
      expect(decideTyped({ event: "push", ref, tree: TREE, prRuns: rows }).proven, String(ref)).toBe(false);
    }
  });

  it("never reads proven on a tree that is not a 40-hex object id", () => {
    for (const tree of [undefined, "", "c".repeat(39), "c".repeat(41), "C".repeat(40), "g".repeat(40), `${"c".repeat(40)}\n`]) {
      const rows = [trusted("success", tree ?? "")];
      expect(decideTyped({ event: "push", ref: MAIN, tree, prRuns: rows }).proven, String(tree)).toBe(false);
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
const ENDPOINTS = {
  pushedCommit: `repos/${REPOSITORY}/git/commits/${PUSHED}`,
  pulls: `repos/${REPOSITORY}/commits/${PUSHED}/pulls`,
  headCommit: `repos/${REPOSITORY}/git/commits/${HEAD}`,
  checkRuns: `repos/${REPOSITORY}/commits/${HEAD}/check-runs?check_name=all-ci-checks`,
} as const;

/**
 * A scratch directory holding a fake `gh` on PATH and one response file per endpoint, shaped the
 * way the real API answers (the `--jq` filter is applied to it by the real `jq`, so the script's
 * filters are exercised rather than assumed). The real `gh` is unusable here: it needs a network,
 * a token and a repository whose check runs the test does not control. An endpoint with no
 * response file answers the way `gh` answers a 404: stderr and exit 1.
 */
function fakeGh(app = "github-actions", conclusion = "success"): { dir: string; responses: string; bin: string } {
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
  answer(ENDPOINTS.checkRuns, {
    total_count: 1,
    check_runs: [{ name: "all-ci-checks", head_sha: HEAD, conclusion, app: { slug: app } }],
  });
  const gh = join(bin, "gh");
  writeFileSync(
    gh,
    `#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS"
ENDPOINT=''
FILTER=''
TAKE_FILTER=''
for ARG in "$@"; do
  if [ -n "$TAKE_FILTER" ]; then FILTER="$ARG"; TAKE_FILTER=''; continue; fi
  case "$ARG" in
    repos/*) ENDPOINT="$ARG" ;;
    --jq) TAKE_FILTER=1 ;;
  esac
done
if [ "$1" != api ] || [ -z "$ENDPOINT" ]; then
  echo "the fake gh was asked for something that is not an api read: $*" >&2
  exit 9
fi
FILE="$RESPONSES/$(printf '%s' "$ENDPOINT" | tr -c 'A-Za-z0-9' '_')"
if [ ! -f "$FILE" ]; then
  echo "gh: Not Found (HTTP 404)" >&2
  exit 1
fi
if [ -n "$FILTER" ]; then
  jq -r "$FILTER" < "$FILE"
else
  cat "$FILE"
fi
`,
  );
  chmodSync(gh, 0o755);
  writeFileSync(join(dir, "calls"), "");
  return { dir, responses, bin };
}

function run(
  fake: { dir: string; responses: string; bin: string } | undefined,
  args: readonly string[],
  env: Record<string, string> = {},
) {
  const inherited = { ...process.env };
  for (const key of ["GITHUB_OUTPUT", "GITHUB_EVENT_NAME", "GITHUB_REF", "GITHUB_REPOSITORY", "GH_TOKEN"]) {
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
  });
}

const callsOf = (fake: { dir: string }) =>
  readFileSync(join(fake.dir, "calls"), "utf8").split("\n").filter((line) => line !== "");

// The fake is a POSIX shell script, which Windows cannot run as `gh`; the pure rule above and the
// argument check below run everywhere, and CI's ubuntu legs run these.
const FAKE_RUNNABLE = process.platform !== "win32" && spawnSync("jq", ["--version"]).status === 0;

describe.skipIf(!FAKE_RUNNABLE)("pr-proven.mjs — the CLI over a fake gh", () => {
  it("prints proven=true when the pull-request head's tree and its github-actions run match", () => {
    const fake = fakeGh();
    const output = join(fake.dir, "output");
    writeFileSync(output, "earlier=1\n");
    const result = run(fake, ["--sha", PUSHED], { GITHUB_OUTPUT: output });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("proven=true\n");
    expect(readFileSync(output, "utf8")).toBe("earlier=1\nproven=true\n");
    // The four reads, each an `api` call with an argv, and the check-run read keyed by name.
    expect(callsOf(fake)).toEqual([
      `api ${ENDPOINTS.pushedCommit} --jq .tree.sha`,
      `api ${ENDPOINTS.pulls}`,
      `api ${ENDPOINTS.headCommit} --jq .tree.sha`,
      `api ${ENDPOINTS.checkRuns} --jq [.check_runs[] | {conclusion, app: .app.slug}]`,
    ]);
  });

  it("prints proven=false for a successful all-ci-checks run another app created", () => {
    const fake = fakeGh("evil-bot");
    const result = run(fake, ["--sha", PUSHED]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("proven=false\n");
    expect(result.stderr).toContain("evil-bot");
  });

  it("prints proven=false when the github-actions run did not succeed", () => {
    const fake = fakeGh("github-actions", "failure");
    const result = run(fake, ["--sha", PUSHED]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("proven=false\n");
  });

  it("prints proven=false when the pull-request head carries another tree", () => {
    const fake = fakeGh();
    writeFileSync(join(fake.responses, keyOf(ENDPOINTS.headCommit)), JSON.stringify({ tree: { sha: OTHER_TREE } }));
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

  it("prints proven=false on an answer that is not JSON or lacks a field it reads", () => {
    const broken: readonly (readonly [string, string])[] = [
      [ENDPOINTS.pulls, "<html>rate limited</html>"],
      [ENDPOINTS.pulls, JSON.stringify({ message: "API rate limit exceeded" })],
      [ENDPOINTS.pulls, JSON.stringify([{ number: 7 }])],
      [ENDPOINTS.pulls, JSON.stringify([{ number: 7, head: { sha: "../../../evil" } }])],
      [ENDPOINTS.pushedCommit, JSON.stringify({ sha: PUSHED })],
      [ENDPOINTS.headCommit, JSON.stringify({ tree: { sha: "not-a-tree" } })],
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
