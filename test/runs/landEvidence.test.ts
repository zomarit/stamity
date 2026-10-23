import { describe, expect, it } from "vitest";
import { PERSON_ONLY_PATHS } from "../../src/change/personOnlyPaths.ts";
import { resolveAutonomy } from "../../src/config/autonomy.ts";
import {
  askPathsOf,
  checkEvidence,
  decideLand,
  evidenceLine,
  LAND_ASK_PATHS,
  LANDS_ON_EVIDENCE,
  ledgerEvidence,
  parseBranch,
  parseBranchRules,
  parseCheckRuns,
  parseFiles,
  parsePr,
  parseThreadsPage,
  pollWhilePending,
  unresolvedThreads,
  withEvidence,
  type CheckEvidence,
  type LandInput,
  type LandPr,
} from "../../src/runs/landEvidence.ts";

/**
 * a6-land-verb (REQ-FLOW-132, REQ-FLOW-133): the evidence `stamity run land` merges on and the decision it reaches,
 * as pure functions over what the verb read. The verb's own suite (test/cli/commands/runLand.test.ts) runs them over
 * a real git and a recorded GitHub.
 */

const SHA = "a".repeat(40);
const MARKER = "<!-- stamity:run 2026-10-23_overnight -->";

const PR: LandPr = {
  number: 7,
  url: "https://github.com/o/r/pull/7",
  nodeId: "PR_kw1",
  state: "open",
  merged: false,
  draft: false,
  headRef: "stamity/2026-10-23_overnight",
  headSha: SHA,
  headRepo: "o/r",
  baseRef: "main",
  body: `The morning list.\n\n${MARKER}`,
  mergeableState: "clean",
  changedFiles: 2,
  author: "runner",
};

const GREEN: CheckEvidence = { green: ["test"], pending: [], failing: [], missing: [] };

function input(over: Partial<LandInput> = {}, pr: Partial<LandPr> = {}): LandInput {
  return {
    pr: { ...PR, ...pr },
    own: { repo: "o/r", runBranch: "stamity/2026-10-23_overnight", head: SHA, originTip: SHA, marker: MARKER, defaultBranch: "main", viewer: "runner" },
    ready: false,
    setting: resolveAutonomy({}),
    files: { paths: ["src/a.ts", "notes/plan.txt"], complete: true },
    prefix: "",
    hookPaths: [".stamity/hooks", ".stamity/manifest.json", ".stamity/packs"],
    checks: GREEN,
    threads: 0,
    ledger: { open: [] },
    ...over,
  };
}

describe("LAND_ASK_PATHS (decision D2)", () => {
  it("is the person-only set less the charter, rule and agent files, each of those named in the held set", () => {
    for (const glob of LANDS_ON_EVIDENCE) expect(PERSON_ONLY_PATHS, glob).toContain(glob);
    for (const glob of LANDS_ON_EVIDENCE) expect(LAND_ASK_PATHS, glob).not.toContain(glob);
    for (const glob of PERSON_ONLY_PATHS.filter((entry) => !LANDS_ON_EVIDENCE.includes(entry))) expect(LAND_ASK_PATHS, glob).toContain(glob);
  });

  it("matches every class that defines the evidence, a held patch and a path below the project root", () => {
    const asked = [
      ".github/workflows/ci.yml",
      ".github/actions/setup/run.sh",
      "tools/build/action.yaml",
      "action.yml",
      ".claude/hooks/stamity/guard.mjs",
      ".stamity/generated/hooks/x.mjs",
      ".cursor/hooks.json",
      ".stamity/manifest.json",
      ".mcp.json",
      ".devcontainer/devcontainer.json",
      "CODEOWNERS",
      ".github/CODEOWNERS",
      "docs/CODEOWNERS",
      ".stamity/change-classes.json",
      ".stamity/runs/2026-10-23_overnight/held/person-only.patch",
    ];
    expect(askPathsOf([...asked, "src/a.ts"])).toEqual([...asked].toSorted());
    expect(askPathsOf(["app/.stamity/manifest.json", "app/src/a.ts"], "app/")).toEqual(["app/.stamity/manifest.json"]);
  });

  it("matches a declared hook script and a path under a hook folder, without case, beside the globs (build/2)", () => {
    expect(askPathsOf(["Tools/Guard.mjs", "tools/other.mjs", "hooks-extra/x.json", "src/a.ts"], "", ["tools/guard.mjs", "hooks-extra"])).toEqual(["Tools/Guard.mjs", "hooks-extra/x.json"]);
    expect(askPathsOf(["tools/guard.mjs"])).toEqual([]);
  });

  it("lets the charter, a rule file and an agent definition land on the evidence", () => {
    expect(askPathsOf(["lib/AGENTS.md", "pkg/CLAUDE.md", ".claude/rules/x.md", ".cursorrules", ".claude/agents/reviewer.md", ".github/prompts/p.md"])).toEqual([]);
  });
});

describe("ledgerEvidence", () => {
  const row = (id: string, severity: string, state: string): string =>
    JSON.stringify({ id, phase: "review", source: "r", severity, evidence: "e", state, rationale: "" });

  it("names the open Critical and Warning rows, and passes fixed, deferred and Minor ones", () => {
    const text = [row("r/1", "Warning", "open"), row("r/2", "Critical", "fixed"), row("r/3", "Minor", "open"), row("r/4", "Critical", "open"), row("r/5", "Warning", "deferred")].join("\n");
    expect(ledgerEvidence(`${text}\n`)).toEqual({ open: ["r/1", "r/4"] });
    expect(ledgerEvidence("")).toEqual({ open: [] });
  });

  it("refuses a line that is no row, an unknown severity and an unknown state", () => {
    expect(ledgerEvidence(`${row("r/1", "Minor", "fixed")}\nnot json\n`)).toEqual({ refused: "the ledger's line 2 does not read as a row" });
    expect(ledgerEvidence(row("r/1", "warning", "open"))).toMatchObject({ refused: expect.stringContaining("severity") });
    expect(ledgerEvidence(row("r/1", "Warning", "closed"))).toMatchObject({ refused: expect.stringContaining("state") });
  });
});

describe("checkEvidence", () => {
  const run = (id: number, name: string, status: string, conclusion: string | null, appId: number | null = 15368) => ({ id, name, status, conclusion, appId });

  it("reads each required check's latest run: green, pending, failing, and missing where only a status could carry it", () => {
    const runs = [run(1, "test", "completed", "failure"), run(2, "test", "completed", "success"), run(3, "lint", "in_progress", null), run(4, "e2e", "completed", "cancelled")];
    expect(checkEvidence([{ context: "test", appId: null }, { context: "lint", appId: null }, { context: "e2e", appId: null }, { context: "ci/status", appId: null }], runs)).toEqual({
      green: ["test"],
      pending: ["lint"],
      failing: ["e2e"],
      missing: ["ci/status"],
    });
  });

  it("matches the app a rule names, so a same-named run of another app does not count", () => {
    expect(checkEvidence([{ context: "test", appId: 15368 }], [run(9, "test", "completed", "success", 999)]).missing).toEqual(["test"]);
  });

  it("falls back to every check run's name with no required set, and refuses a commit with none", () => {
    expect(checkEvidence(null, [run(1, "a", "completed", "success"), run(2, "b", "completed", "failure")])).toEqual({ green: ["a"], pending: [], failing: ["b"], missing: [] });
    expect(checkEvidence([], [])).toEqual({ green: [], pending: [], failing: [], missing: ["any check run"] });
  });
});

describe("unresolvedThreads", () => {
  // TEST CHANGE, justified (review/71, REQ-FLOW-132): a thread now carries every comment's author, not the first
  // alone, so the cases are restated in that shape; each of the old six keeps its verdict, and two new ones follow.
  const bot = { login: "codex", person: false };
  const alice = { login: "alice", person: true };
  const runner = { login: "runner", person: true };
  it("counts open threads and a person's thread the run's login resolved, not an app's it resolved", () => {
    const threads = [
      { isResolved: false, resolvedBy: null, authors: [{ login: "bot", person: false }], complete: true },
      { isResolved: true, resolvedBy: "runner", authors: [alice], complete: true },
      { isResolved: true, resolvedBy: "runner", authors: [bot], complete: true },
      { isResolved: true, resolvedBy: "alice", authors: [alice], complete: true },
      { isResolved: true, resolvedBy: "Runner", authors: [runner], complete: true },
      { isResolved: true, resolvedBy: "runner", authors: [{ login: null, person: true }], complete: true },
    ];
    expect(unresolvedThreads(threads, "runner")).toBe(3);
  });

  it("counts a thread the run resolved that holds a person's reply under an app's or the run's first comment, or did not read whole (review/71)", () => {
    expect(unresolvedThreads([{ isResolved: true, resolvedBy: "runner", authors: [bot, alice], complete: true }], "runner")).toBe(1);
    expect(unresolvedThreads([{ isResolved: true, resolvedBy: "runner", authors: [runner, bot, alice], complete: true }], "runner")).toBe(1);
    expect(unresolvedThreads([{ isResolved: true, resolvedBy: "runner", authors: [bot, runner], complete: false }], "runner")).toBe(1);
    expect(unresolvedThreads([{ isResolved: true, resolvedBy: "runner", authors: [bot, runner], complete: true }], "runner")).toBe(0);
  });
});

describe("the answers' parsers", () => {
  it("reads a threads page, its viewer and its next cursor, and refuses GraphQL errors", () => {
    const page = {
      data: {
        viewer: { login: "runner" },
        repository: {
          pullRequest: {
            author: { login: "runner" },
            reviewThreads: {
              nodes: [{ isResolved: true, resolvedBy: { login: "runner" }, comments: { totalCount: 2, nodes: [{ author: { __typename: "Bot", login: "codex" } }, { author: { __typename: "User", login: "alice" } }] } }],
              pageInfo: { hasNextPage: true, endCursor: "Y3Vyc29y" },
            },
          },
        },
      },
    };
    // TEST CHANGE, justified (review/71): the page carries every comment's author and the comment count, read as `authors` and `complete`.
    // TEST CHANGE, justified (review/94): the page also names the pull request's author, in viewer's spelling.
    expect(parseThreadsPage(page)).toEqual({
      viewer: "runner",
      author: "runner",
      threads: [{ isResolved: true, resolvedBy: "runner", authors: [{ login: "codex", person: false }, { login: "alice", person: true }], complete: true }],
      next: "Y3Vyc29y",
    });
    expect(parseThreadsPage({ errors: [{ message: "x" }] })).toBeNull();
  });

  it("reads check runs, rules, the branch, the files with a rename's old name, and a pull request", () => {
    expect(parseCheckRuns({ total_count: 1, check_runs: [{ id: 3, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] })).toEqual({
      total: 1,
      runs: [{ id: 3, name: "test", status: "completed", conclusion: "success", appId: 15368 }],
    });
    expect(parseBranchRules([{ type: "pull_request" }, { type: "required_status_checks", parameters: { required_status_checks: [{ context: "test", integration_id: 15368 }] } }])).toEqual({
      required: [{ context: "test", appId: 15368 }],
      requiresPr: true,
    });
    expect(parseBranch({ commit: { sha: SHA }, protection: { enabled: true, required_status_checks: { checks: [{ context: "lint", app_id: null }], contexts: ["lint", "ci"] } } })).toEqual({
      tip: SHA,
      required: [{ context: "lint", appId: null }, { context: "ci", appId: null }],
      protectedBranch: true,
    });
    expect(parseFiles([{ filename: "src/new.ts", previous_filename: ".github/workflows/ci.yml" }, { filename: "b" }])).toEqual({ paths: ["src/new.ts", ".github/workflows/ci.yml", "b"], count: 2 });
    expect(parsePr({ number: 7 })).toBeNull();
  });
});

describe("decideLand", () => {
  it("lands the run's own pull request when the evidence holds", () => {
    expect(decideLand(input())).toEqual({ outcome: "land" });
  });

  it("reports a pull request merged at HEAD as already landed", () => {
    expect(decideLand(input({}, { state: "closed", merged: true }))).toEqual({ outcome: "already-landed" });
  });

  it("refuses a pull request another login opened, though branch, head and marker are the run's (review/73)", () => {
    expect(decideLand(input({}, { author: "alice" }))).toEqual({
      outcome: "refused",
      reasons: ["pull request #7 was opened by alice, not by the run's login runner"],
      pending: false,
    });
    expect(decideLand(input({}, { author: "alice", state: "closed", merged: true }))).toMatchObject({ outcome: "refused" });
  });

  it("refuses a pull request that is not the run's own: a fork, another head, no marker, origin elsewhere", () => {
    expect(decideLand(input({}, { headRepo: "fork/r" }))).toMatchObject({ outcome: "refused", reasons: [expect.stringContaining("fork")] });
    expect(decideLand(input({}, { headSha: "b".repeat(40) }))).toMatchObject({ outcome: "refused", reasons: [expect.stringContaining("is not HEAD")] });
    expect(decideLand(input({}, { body: "no marker" }))).toMatchObject({ outcome: "refused", reasons: [expect.stringContaining("marker")] });
    expect(decideLand(input({ own: { ...input().own, originTip: null } }))).toMatchObject({ outcome: "refused", reasons: ["origin has no branch stamity/2026-10-23_overnight"] });
  });

  it("refuses every gap in the evidence, naming each, and marks only pending checks and an uncomputed state as waitable", () => {
    const decision = decideLand(
      input({ checks: { green: [], pending: [], failing: [], missing: ["ci/status"] }, threads: 1, ledger: { open: ["r/1"] } }, { mergeableState: "blocked" }),
    );
    expect(decision).toEqual({
      outcome: "refused",
      reasons: [
        `required check ci/status has no check run on ${SHA} (commit statuses do not count)`,
        "1 review thread is unresolved",
        `the ledger at ${SHA} holds open Critical or Warning rows: r/1`,
        "mergeable_state is blocked: an admin merge past the branch's rules asks",
      ],
      pending: false,
    });
    expect(decideLand(input({ checks: { ...GREEN, pending: ["e2e"] } }, { mergeableState: "unknown" }))).toEqual({
      outcome: "refused",
      reasons: [`required check e2e is still running on ${SHA}`, "mergeable_state is not computed yet, run it again"],
      pending: true,
    });
  });

  it("refuses a draft's merge state as not computed before a ready mark, for the dry run's decision (review/82)", () => {
    expect(decideLand(input({}, { mergeableState: "draft" }))).toMatchObject({
      outcome: "refused",
      reasons: ["mergeable_state reads draft: GitHub computes it after the ready mark, which a dry run does not make"],
    });
  });

  it("refuses a draft without --ready, and with it decides before the ready mark on what needs no ready state", () => {
    expect(decideLand(input({}, { draft: true, mergeableState: "draft" }))).toMatchObject({ outcome: "refused", reasons: ["the pull request is a draft: mark it ready first, or pass --ready", expect.any(String)] });
    expect(decideLand(input({ ready: true, beforeReady: true }, { draft: true, mergeableState: "draft" }))).toEqual({ outcome: "land" });
  });

  it("asks for a diff editing a declared hook script, and where the hook paths could not be read (build/2)", () => {
    expect(decideLand(input({ files: { paths: ["tools/guard.mjs"], complete: true }, hookPaths: ["tools/guard.mjs"] }))).toEqual({
      outcome: "asks",
      reason: "the diff touches paths that define the evidence: tools/guard.mjs",
      act: "pr-merge",
    });
    expect(decideLand(input({ hookPaths: "hold refused: .stamity/hooks/x.json at Base: does not parse" }))).toEqual({
      outcome: "asks",
      reason: "hold refused: .stamity/hooks/x.json at Base: does not parse",
      act: "pr-merge",
    });
  });

  it("asks in mode ask, for the ask set, a renamed workflow, a held patch, a deploying branch and a deploying act", () => {
    expect(decideLand(input({ setting: resolveAutonomy({ autonomy: { mode: "ask" } }) }))).toEqual({ outcome: "asks", reason: "autonomy.mode is ask", act: "pr-merge" });
    expect(decideLand(input({ files: { paths: [".github/workflows/ci.yml"], complete: true } }))).toMatchObject({ outcome: "asks", act: "pr-merge", reason: expect.stringContaining(".github/workflows/ci.yml") });
    expect(decideLand(input({ files: { paths: ["ci-old.yml", ".github/workflows/ci.yml"], complete: true } }))).toMatchObject({ outcome: "asks" });
    expect(decideLand(input({ files: { paths: [".stamity/runs/2026-10-23_overnight/held/person-only.patch"], complete: true } }))).toMatchObject({ outcome: "asks", reason: expect.stringContaining("held patch") });
    expect(decideLand(input({ setting: resolveAutonomy({ autonomy: { deployingBranches: ["ma*"] } }) }))).toMatchObject({ outcome: "asks", reason: "main is named in autonomy.deployingBranches" });
    expect(decideLand(input({ setting: resolveAutonomy({ autonomy: { deployingActs: ["pr-merge"] } }) }))).toMatchObject({ outcome: "asks", reason: "autonomy.deployingActs names pr-merge" });
    expect(decideLand(input({ ready: true, beforeReady: true, setting: resolveAutonomy({ autonomy: { deployingActs: ["pr-ready"] } }) }, { draft: true }))).toMatchObject({ outcome: "asks", act: "pr-ready" });
  });

  it("for a fast-forward, asks where a rule requires a pull request and refuses a head that does not move the tip forward", () => {
    expect(decideLand(input({ forward: { requiresPr: null, compare: "ahead" } }))).toEqual({ outcome: "land" });
    expect(decideLand(input({ forward: { requiresPr: "a rule requires a pull request on main", compare: "ahead" } }))).toEqual({ outcome: "asks", reason: "a rule requires a pull request on main", act: "push-default" });
    expect(decideLand(input({ forward: { requiresPr: null, compare: "diverged" } }))).toMatchObject({ outcome: "refused", reasons: [expect.stringContaining("not a fast-forward")] });
    expect(decideLand(input({ forward: { requiresPr: null, compare: "identical" } }))).toEqual({ outcome: "already-landed" });
  });
});

describe("the evidence line and the poll", () => {
  it("puts one evidence line before the marker, replacing an earlier one, and never says landed", () => {
    const line = evidenceLine("2026-10-23T08:00:00.000Z", SHA, 3, 0, 0);
    const once = withEvidence(PR.body, MARKER, line);
    expect(once).toBe(`The morning list.\n\n${line}\n\n${MARKER}`);
    expect(withEvidence(once, MARKER, evidenceLine("2026-10-23T09:00:00.000Z", SHA, 3, 0, 0))).toBe(`The morning list.\n\nevidence checked at 2026-10-23T09:00:00.000Z for ${SHA}: 3 required check runs green, 0 open threads, 0 open Critical/Warning rows\n\n${MARKER}`);
    expect(once).not.toMatch(/landed/);
  });

  it("re-reads while pending until the deadline, sleeping between reads", async () => {
    let now = 0;
    const slept: number[] = [];
    const clock = { now: () => now, sleep: (ms: number) => { slept.push(ms); now += ms; return Promise.resolve(); } };
    let reads = 0;
    const last = await pollWhilePending(() => Promise.resolve((reads += 1)), (value) => value < 3, 120_000, 30_000, clock);
    expect(last).toBe(3);
    expect(slept).toEqual([30_000, 30_000]);
    reads = 0;
    now = 0;
    expect(await pollWhilePending(() => Promise.resolve((reads += 1)), () => true, 60_000, 30_000, clock)).toBe(3);
  });
});
