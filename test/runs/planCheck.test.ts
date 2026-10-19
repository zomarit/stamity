import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { planCommand } from "../../src/cli/commands/plan.ts";
import { gitCheckRunner } from "../../src/cli/engine/gitStatus.ts";
import {
  COVERAGE_CODE_CLASS,
  PLAN_BLOCKER_CODES,
  type PlanCheckDoc,
  type PlanCheckResult,
  checkPlans,
} from "../../src/runs/planCheck.ts";
import type { GitRunner } from "../../src/workspace/git.ts";
import { runInProcess } from "../support/inProcess.ts";
import { NO_GIT_CONFIG, seedGitRepo } from "../support/repoFixtures.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The ready check for an unattended start, over real repositories: every case seeds history with
 * the real git binary and reads it through the CLI's hardened runner, so the freshness verdicts are
 * git's own. No stand-ins: the coverage check, the head parser and the contract parser are the
 * engine's own, read over each fixture's text.
 */

const tempDir = useTempDir("plan-check");

/** The production runner `stamity plan check` passes. */
const git: GitRunner = gitCheckRunner();

const PLAN_PATH = "docs/plans/001-demo.md";
const NEXT_PATH = "docs/plans/002-demo.md";

/** Symbolic links need a privilege Windows runners do not grant by default; CI's Windows legs run the rest. */
const WINDOWS = process.platform === "win32";

const SPECS: PlanCheckDoc[] = [
  {
    path: "docs/specs/demo.md",
    text: "# Demo\n\n## Requirements\n\n### REQ-DEMO-001 — Reject expired values\nGiven an expired value, Then it is refused.\n\n### REQ-DEMO-002 — Keep retry state\nGiven a retry, Then its state survives.\n",
  },
];

/** Sync git for writing history only, the host's global and system config cut off. */
function writeGit(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: NO_GIT_CONFIG,
      GIT_AUTHOR_NAME: "Fixture One",
      GIT_AUTHOR_EMAIL: "one@fixture.invalid",
      GIT_COMMITTER_NAME: "Fixture One",
      GIT_COMMITTER_EMAIL: "one@fixture.invalid",
    },
  });
}

const headSha = (cwd: string): string => writeGit(cwd, ["rev-parse", "HEAD"]).trim();

/** Append to `path` and commit it alone; returns the new HEAD. */
async function touchAndCommit(cwd: string, path: string, line: string): Promise<string> {
  const target = join(cwd, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${line}\n`, { encoding: "utf8", flag: "a" });
  writeGit(cwd, ["add", "--", path]);
  writeGit(cwd, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", `touch ${path}`]);
  return headSha(cwd);
}

/** A repository holding the two paths the plans read; returns its root and the stamp. */
async function seeded(skip: () => void): Promise<{ cwd: string; stamp: string }> {
  const handle = tempDir();
  await handle.seedFiles({ "docs/a.md": "a\n", "src/b.ts": "export const b = 1;\n" });
  try {
    await seedGitRepo(handle.dir);
  } catch (error) {
    if (error instanceof Error && error.name === "GitUnavailableError") skip();
    throw error;
  }
  return { cwd: handle.dir, stamp: headSha(handle.dir) };
}

const unit = (id: string, requirements: string, dependsOn: string, edgeCases = "an expired value → refused"): string =>
  [
    `### ${id} — a unit`,
    "",
    "| Field | Content |",
    "|---|---|",
    `| \`id\` | ${id} |`,
    `| \`requirements\` | ${requirements} |`,
    "| `files` | `src/b.ts` |",
    "| `interfaces` | `check(value): boolean` |",
    "| `testCriteria` | an expired value → false |",
    `| \`edgeCases\` | ${edgeCases} |`,
    `| \`depends_on\` | ${dependsOn} |`,
    "| `verify` | `npx vitest run test/b.test.ts` |",
    "",
  ].join("\n");

/** A plan every check passes. */
function cleanPlan(stamp: string, head: { id?: string; extra?: string } = {}): string {
  return [
    "---",
    `id: ${head.id ?? "demo-01"}`,
    "intent: feature",
    `stamp: ${stamp} 2026-10-15`,
    "reads: [docs/a.md, src/b.ts]",
    ...(head.extra === undefined ? [] : [head.extra]),
    "---",
    "",
    "# Demo",
    "",
    "## Context",
    "",
    "Values expire; retries keep state.",
    "",
    "## Spec delta",
    "",
    "### REQ-DEMO-001 — Reject expired values (ADDED)",
    "Given an expired value, Then it is refused.",
    "",
    "### REQ-DEMO-002 — Keep retry state (ADDED)",
    "Given a retry, Then its state survives.",
    "",
    "## Units",
    "",
    unit("u1-guard", "REQ-DEMO-001", "none"),
    unit("u2-retry", "REQ-DEMO-002", "u1-guard"),
    "## Risks",
    "",
    "- **Warning** — a retry storm. Mitigation: a cap.",
    "",
    "## Open questions",
    "",
    "None.",
    "",
  ].join("\n");
}

/** The 1-based line of the first line of `text` that contains `needle`. */
function lineOf(text: string, needle: string): number {
  const index = text.split("\n").findIndex((line) => line.includes(needle));
  if (index === -1) throw new Error(`fixture has no line containing ${needle}`);
  return index + 1;
}

async function check(cwd: string, text: string, extra: Partial<Parameters<typeof checkPlans>[1]> = {}): Promise<PlanCheckResult> {
  return checkPlans([{ path: PLAN_PATH, text }], { specs: SPECS, git, cwd, ...extra });
}

/** The single plan's blockers carrying `code`, as `{ code, line }`. */
function blockersOf(result: PlanCheckResult, code: string): { code: string; line?: number }[] {
  return (result.plans[0]?.blockers ?? [])
    .filter((blocker) => blocker.code === code)
    .map((blocker) => (blocker.line === undefined ? { code: blocker.code } : { code: blocker.code, line: blocker.line }));
}

describe("checkPlans", () => {
  it("reads a clean plan ready, its head parsed and every lint passing, L1 not-checked", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const result = await check(cwd, cleanPlan(stamp));

    expect(result.ready).toBe(true);
    const [report] = result.plans;
    expect(report?.blockers).toEqual([]);
    expect(report?.advisories).toEqual([]);
    expect(report?.ready).toBe(true);
    expect(report?.head).toEqual({
      id: "demo-01",
      intent: "feature",
      stamp: { sha: stamp, date: "2026-10-15" },
      reads: ["docs/a.md", "src/b.ts"],
      dependsOn: [],
    });
    expect(report?.lint).toEqual({ L1: "not-checked", L2: "pass", L3: "pass", L4: "pass", L5: 0 });
    expect(report?.freshness).toEqual({ verdict: "fresh", stale: [], exempt: [], unresolved: false });
    expect(result.contract).toBeUndefined();
  });

  it("refuses an empty plan list: nothing checked is never ready", async (ctx) => {
    const { cwd } = await seeded(() => ctx.skip());
    expect(await checkPlans([], { specs: SPECS, git, cwd })).toEqual({ ready: false, plans: [] });
  });

  it("refuses a [NEEDS CLARIFICATION] marker, fenced or not, at each line", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const text = cleanPlan(stamp).replace(
      "Values expire; retries keep state.",
      "Values expire after [NEEDS CLARIFICATION: how long?].\n\n```text\n[NEEDS CLARIFICATION] the retry cap\n```",
    );
    const result = await check(cwd, text);

    expect(result.ready).toBe(false);
    expect(blockersOf(result, "needs-clarification")).toEqual([
      { code: "needs-clarification", line: lineOf(text, "how long") },
      { code: "needs-clarification", line: lineOf(text, "the retry cap") },
    ]);
  });

  it("refuses an Open questions body other than None., an empty one, and a plan with no such section", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const carried = cleanPlan(stamp).replace("None.\n", "- Which store keeps the retry state?\n");
    const empty = cleanPlan(stamp).replace("None.\n", "");
    const renamed = cleanPlan(stamp).replace("## Open questions\n\nNone.\n", "## Questions\n\n- Which store keeps the retry state?\n");

    const first = await check(cwd, carried);
    expect(first.ready).toBe(false);
    expect(blockersOf(first, "open-questions")).toEqual([{ code: "open-questions", line: lineOf(carried, "Which store") }]);

    const second = await check(cwd, empty);
    expect(blockersOf(second, "open-questions")).toEqual([{ code: "open-questions", line: lineOf(empty, "## Open questions") }]);

    // Absent is not `None.`: a renamed or missing section refuses, with no line to point at.
    const third = await check(cwd, renamed);
    expect(third.ready).toBe(false);
    expect(third.plans[0]?.blockers.map((blocker) => ({ code: blocker.code, line: blocker.line }))).toEqual([
      { code: "open-questions", line: undefined },
    ]);
  });

  it("refuses a Critical risk in any spelling, and reads a Critical line outside Risks as prose", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const text = cleanPlan(stamp)
      .replace("- **Warning** — a retry storm.", "- **Critical** — retries can double-charge.\n- **Warning** — a retry storm.")
      .replace("Values expire; retries keep state.", "- **Critical** is a severity this plan's Risks use.");
    const result = await check(cwd, text);

    expect(result.ready).toBe(false);
    expect(blockersOf(result, "critical-risk")).toEqual([{ code: "critical-risk", line: lineOf(text, "double-charge") }]);

    // Bold or plain, with or without a colon, a bullet or a table row: each refuses at its line.
    for (const entry of [
      "- **Critical:** retries can double-charge.",
      "- Critical — retries can double-charge.",
      "* critical: retries can double-charge.",
      "1. `Critical` retries can double-charge.",
      "| retries can double-charge | **Critical** | none yet |",
    ]) {
      const spelled = cleanPlan(stamp).replace("- **Warning** — a retry storm.", `${entry}\n- **Warning** — a retry storm.`);
      // oxlint-disable-next-line no-await-in-loop -- five fixtures over one repository, read in turn
      const refused = await check(cwd, spelled);
      expect({ entry, blockers: blockersOf(refused, "critical-risk") }).toEqual({
        entry,
        blockers: [{ code: "critical-risk", line: lineOf(spelled, "double-charge") }],
      });
    }

    // Non-degenerate: a Warning table row and prose naming the severity stay ready.
    const calm = cleanPlan(stamp).replace(
      "- **Warning** — a retry storm.",
      "No risk here is Critical.\n\n| Risk | Severity |\n|---|---|\n| a retry storm | Warning |",
    );
    expect((await check(cwd, calm)).ready).toBe(true);
  });

  it("refuses lint-L2 on a dangling dependency and on a cycle, L2 failing", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const dangling = cleanPlan(stamp).replace("| `depends_on` | u1-guard |", "| `depends_on` | u9-gone |");
    const cycle = cleanPlan(stamp).replace("| `depends_on` | none |", "| `depends_on` | u2-retry |");

    const first = await check(cwd, dangling);
    expect(first.ready).toBe(false);
    expect(blockersOf(first, "lint-L2")).toEqual([{ code: "lint-L2", line: lineOf(dangling, "u9-gone") }]);
    expect(first.plans[0]?.blockers[0]?.message).toMatch(/^dangling-dependency: /);
    expect(first.plans[0]?.lint.L2).toBe("fail");

    const second = await check(cwd, cycle);
    expect(second.plans[0]?.blockers.map((blocker) => blocker.message)).toContainEqual(expect.stringMatching(/^dependency-cycle: /));
    expect(blockersOf(second, "lint-L2").length).toBeGreaterThan(0);
  });

  it("refuses lint-L3 on an empty edge-case field and on a bare none, and passes none with a reason", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const base = cleanPlan(stamp);
    const empty = base.replace(unit("u2-retry", "REQ-DEMO-002", "u1-guard"), unit("u2-retry", "REQ-DEMO-002", "u1-guard", ""));
    const bare = base.replace(unit("u2-retry", "REQ-DEMO-002", "u1-guard"), unit("u2-retry", "REQ-DEMO-002", "u1-guard", "none"));
    const reasoned = base.replace(unit("u2-retry", "REQ-DEMO-002", "u1-guard"), unit("u2-retry", "REQ-DEMO-002", "u1-guard", "none — a constant, it reads no input"));

    for (const text of [empty, bare]) {
      // oxlint-disable-next-line no-await-in-loop -- two fixtures over one repository, read in turn
      const result = await check(cwd, text);
      expect(result.ready).toBe(false);
      expect(blockersOf(result, "lint-L3")).toEqual([{ code: "lint-L3", line: lineOf(text, "### u2-retry") }]);
      expect(result.plans[0]?.lint.L3).toBe("fail");
    }
    expect((await check(cwd, reasoned)).ready).toBe(true);
  });

  it("refuses lint-L4 on a dangling requirement, L4 failing", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const text = cleanPlan(stamp).replace("| `requirements` | REQ-DEMO-002 |", "| `requirements` | REQ-DEMO-002, REQ-DEMO-999 |");
    const result = await check(cwd, text);

    expect(result.ready).toBe(false);
    expect(blockersOf(result, "lint-L4")).toEqual([{ code: "lint-L4", line: lineOf(text, "REQ-DEMO-999") }]);
    expect(result.plans[0]?.lint).toMatchObject({ L2: "pass", L4: "fail" });
  });

  it("refuses lint-structure on a plan with no units and on a unit defined twice", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const base = cleanPlan(stamp);
    const noUnits = base.replace("## Units", "## Work");
    const twice = base.replace("## Risks", `${unit("u1-guard", "REQ-DEMO-001", "none")}## Risks`);

    const first = await check(cwd, noUnits);
    expect(first.ready).toBe(false);
    expect(blockersOf(first, "lint-structure")).toEqual([{ code: "lint-structure", line: 1 }]);

    const second = await check(cwd, twice);
    const lines = twice.split("\n").flatMap((line, index) => (line.startsWith("### u1-guard") ? [index + 1] : []));
    expect(blockersOf(second, "lint-structure")).toEqual([{ code: "lint-structure", line: lines[1] }]);
  });

  it("refuses a head missing a required key, and passes absent optional keys", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const noIntent = cleanPlan(stamp).replace("intent: feature\n", "");
    const badReads = cleanPlan(stamp).replace("reads: [docs/a.md, src/b.ts]", "reads: docs/a.md");
    const noHead = cleanPlan(stamp).replace(/^---\n[\s\S]*?\n---\n/, "");

    const first = await check(cwd, noIntent);
    expect(first.ready).toBe(false);
    expect(blockersOf(first, "head-key-missing")).toEqual([{ code: "head-key-missing", line: 1 }]);
    expect(first.plans[0]?.blockers[0]?.message).toContain("`intent`");

    const second = await check(cwd, badReads);
    expect(blockersOf(second, "head-key-missing")).toEqual([{ code: "head-key-missing", line: lineOf(badReads, "reads:") }]);

    const third = await check(cwd, noHead);
    expect(blockersOf(third, "head-key-missing")).toEqual([{ code: "head-key-missing", line: 1 }]);
    expect(third.plans[0]?.freshness).toBeNull();
  });

  it("refuses an empty reads list at the reads line, and keeps the list message for a non-list", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const empty = cleanPlan(stamp).replace("reads: [docs/a.md, src/b.ts]", "reads: []");
    const scalar = cleanPlan(stamp).replace("reads: [docs/a.md, src/b.ts]", "reads: docs/a.md");

    const first = await check(cwd, empty);
    expect(first.ready).toBe(false);
    expect(blockersOf(first, "head-key-missing")).toEqual([{ code: "head-key-missing", line: lineOf(empty, "reads:") }]);
    expect(first.plans[0]?.blockers[0]?.message).toBe("The head's `reads` must list at least one path.");

    const second = await check(cwd, scalar);
    expect(second.plans[0]?.blockers[0]?.message).toBe("The head's `reads` must be a list of paths.");
  });

  it.skipIf(WINDOWS)("refuses a linked reads path at the reads line, naming the link, though only its target moved", async (ctx) => {
    const { cwd } = await seeded(() => ctx.skip());
    await symlink("a.md", join(cwd, "docs/link.md"));
    writeGit(cwd, ["add", "--", "docs/link.md"]);
    writeGit(cwd, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "link docs/link.md"]);
    const stamp = headSha(cwd);
    await touchAndCommit(cwd, "docs/a.md", "the target moved");
    const text = cleanPlan(stamp).replace("reads: [docs/a.md, src/b.ts]", "reads: [docs/link.md, src/b.ts]");
    const result = await check(cwd, text);

    expect(result.ready).toBe(false);
    expect(blockersOf(result, "stale")).toEqual([{ code: "stale", line: lineOf(text, "reads:") }]);
    expect(result.plans[0]?.blockers[0]?.message).toBe(
      "`docs/link.md` is a symbolic link, or under one; name the file it points to in reads and re-stamp the plan.",
    );
    expect(result.plans[0]?.freshness).toMatchObject({ verdict: "stale", stale: [{ path: "docs/link.md", reason: "link" }] });
  });

  it("refuses a reads path not in git's plain form at the reads line, naming the spelling", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const text = cleanPlan(stamp).replace("reads: [docs/a.md, src/b.ts]", "reads: [docs/a.md/, src/b.ts]");
    const result = await check(cwd, text);

    expect(result.ready).toBe(false);
    expect(blockersOf(result, "stale")).toEqual([{ code: "stale", line: lineOf(text, "reads:") }]);
    expect(result.plans[0]?.blockers[0]?.message).toBe(
      "`docs/a.md/` is not a plain repository path; write it as git lists it and re-stamp the plan.",
    );
    expect(result.plans[0]?.freshness).toMatchObject({ verdict: "stale", stale: [{ path: "docs/a.md/", reason: "spelling" }] });
  });

  it("refuses a reads path git does not track at HEAD at the reads line, naming it", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    await writeFile(join(cwd, "docs/new.md"), "never committed\n", "utf8");
    const text = cleanPlan(stamp).replace("reads: [docs/a.md, src/b.ts]", "reads: [docs/new.md, src/b.ts]");
    const result = await check(cwd, text);

    expect(result.ready).toBe(false);
    expect(blockersOf(result, "stale")).toEqual([{ code: "stale", line: lineOf(text, "reads:") }]);
    expect(result.plans[0]?.blockers[0]?.message).toBe(
      "`docs/new.md` is not tracked by git at HEAD, so its history cannot be measured; commit it or drop it from reads, and re-stamp the plan.",
    );
    expect(result.plans[0]?.freshness).toMatchObject({ verdict: "stale", stale: [{ path: "docs/new.md", reason: "untracked" }] });
  });

  it("refuses a reads path moved since the stamp, at the reads line", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    await touchAndCommit(cwd, "src/b.ts", "export const later = 2;");
    const text = cleanPlan(stamp);
    const result = await check(cwd, text);

    expect(result.ready).toBe(false);
    expect(blockersOf(result, "stale")).toEqual([{ code: "stale", line: lineOf(text, "reads:") }]);
    expect(result.plans[0]?.blockers[0]?.message).toContain("src/b.ts moved since the stamp");
    expect(result.plans[0]?.freshness).toMatchObject({ verdict: "stale", stale: [{ path: "src/b.ts", reason: "moved" }] });
  });

  it("refuses a stamp that names no commit, and one that is no sha at all", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const unknown = cleanPlan(stamp).replace(stamp, "0123456789abcdef0123456789abcdef01234567");
    const prose = cleanPlan(stamp).replace(`${stamp} 2026-10-15`, "yesterday");

    const first = await check(cwd, unknown);
    expect(first.ready).toBe(false);
    expect(blockersOf(first, "stamp-unresolved")).toEqual([{ code: "stamp-unresolved", line: lineOf(unknown, "stamp:") }]);
    expect(first.plans[0]?.freshness?.unresolved).toBe(true);

    const second = await check(cwd, prose);
    expect(blockersOf(second, "stamp-unresolved")).toEqual([{ code: "stamp-unresolved", line: lineOf(prose, "stamp:") }]);
    expect(second.plans[0]?.head.stamp).toBeNull();
    expect(second.plans[0]?.freshness).toBeNull();
  });

  it("refuses a freshness git failed to measure as freshness-error naming the reason, never stamp-unresolved", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    await touchAndCommit(cwd, "src/b.ts", "after the stamp");
    // A shallow clone whose history stops after the stamp: git cannot tell whether the stamp is there.
    const shallow = join(cwd, "shallow");
    writeGit(cwd, ["clone", "--quiet", "--depth", "1", `file://${cwd}`, shallow]);
    const text = cleanPlan(stamp);

    const result = await check(shallow, text);
    expect(result.ready).toBe(false);
    expect(blockersOf(result, "freshness-error")).toEqual([{ code: "freshness-error", line: lineOf(text, "stamp:") }]);
    expect(blockersOf(result, "stamp-unresolved")).toEqual([]);
    expect(result.plans[0]?.blockers.find((blocker) => blocker.code === "freshness-error")?.message).toMatch(/shallow clone/);
    expect(result.plans[0]?.freshness).toMatchObject({ verdict: "stale", unresolved: false, error: expect.stringMatching(/shallow clone/) });
    // Non-degenerate: the full repository measures the same stamp, and only the moved path refuses.
    const full = await check(cwd, text);
    expect(full.plans[0]?.blockers.map((blocker) => blocker.code)).toEqual(["stale"]);
  });

  it("refuses a freshness that throws as freshness-error at the stamp line, never stale or ready", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    // A runner that answers nothing: the guard's own read of its output throws, past its GitFailure catch.
    const broken = ((): string => undefined as unknown as string) as GitRunner;
    const text = cleanPlan(stamp);

    const result = await check(cwd, text, { git: broken });
    expect(result.ready).toBe(false);
    expect(result.plans[0]?.blockers.map((blocker) => ({ code: blocker.code, line: blocker.line }))).toEqual([
      { code: "freshness-error", line: lineOf(text, "stamp:") },
    ]);
    expect(result.plans[0]?.blockers[0]?.message).toMatch(/freshness could not be measured: /);
    expect(result.plans[0]?.freshness).toBeNull();
    // Non-degenerate: the real runner reads the same plan ready.
    expect((await check(cwd, text)).ready).toBe(true);
  });

  it("with a chain, refuses a file whose head depends_on names an unknown predecessor", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const first = { path: PLAN_PATH, text: cleanPlan(stamp) };
    const wrong = { path: NEXT_PATH, text: cleanPlan(stamp, { id: "demo-02", extra: "depends_on: [docs/plans/000-other.md]" }) };
    const right = { path: NEXT_PATH, text: cleanPlan(stamp, { id: "demo-02", extra: `depends_on: [${PLAN_PATH}]` }) };

    const refused = await checkPlans([first, wrong], { specs: SPECS, git, cwd, chain: { since: stamp } });
    expect(refused.ready).toBe(false);
    expect(refused.plans[0]?.ready).toBe(true);
    expect(refused.plans[1]?.blockers.map((blocker) => ({ code: blocker.code, line: blocker.line }))).toEqual([
      { code: "chain-order", line: lineOf(wrong.text, "depends_on:") },
    ]);

    const accepted = await checkPlans([first, right], { specs: SPECS, git, cwd, chain: { since: stamp } });
    expect(accepted.ready).toBe(true);
    expect(accepted.plans[1]?.head.dependsOn).toEqual([PLAN_PATH]);

    // Without `chain` the same pair is two independent plans: no order is checked.
    expect((await checkPlans([first, wrong], { specs: SPECS, git, cwd })).ready).toBe(true);
  });

  it("with a chain, exempts a path moved only after the run's base, and keeps one moved before it stale", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const between = await touchAndCommit(cwd, "docs/a.md", "moved before the base");
    const base = await touchAndCommit(cwd, "history.md", "the run's base");
    await touchAndCommit(cwd, "src/b.ts", "export const fromTheChain = 3;");
    const text = cleanPlan(stamp);

    const chained = await check(cwd, text, { chain: { since: base } });
    expect(blockersOf(chained, "stale")).toEqual([{ code: "stale", line: lineOf(text, "reads:") }]);
    expect(chained.plans[0]?.freshness).toMatchObject({ exempt: ["src/b.ts"], stale: [{ path: "docs/a.md", reason: "moved" }] });

    const unchained = await check(cwd, text);
    expect(unchained.plans[0]?.freshness?.stale.map((entry) => entry.path)).toEqual(["docs/a.md", "src/b.ts"]);
    expect(between).not.toBe(base);
  });

  it("refuses a Prerequisites row neither verified nor owned, or naming a value; passes owned and verified rows", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const section = (rows: string[]): string => cleanPlan(stamp) + ["", "## Prerequisites", "", "Each need, never its value.", "", ...rows, ""].join("\n");
    const passing = section([
      "- secret · DEPLOY_TOKEN · CI deploy job · @ops · blocks deploy · verified no",
      "- setting · retry cap · config.yaml · — · blocks run · verified yes",
    ]);
    const open = section(["- secret · API_KEY · the client · none · blocks run · verified no"]);
    const valued = section(["- secret · API_KEY=sk-live-123 · the client · @ops · blocks run · verified yes"]);
    const table = cleanPlan(stamp) + [
      "", "## Prerequisites", "",
      "| kind | name | read where | set by | blocks | verified |",
      "|---|---|---|---|---|---|",
      "| secret | SIGNING_KEY | release job | | deploy | no |", "",
    ].join("\n");

    expect((await check(cwd, passing)).ready).toBe(true);
    for (const [text, needle] of [[open, "API_KEY"], [valued, "API_KEY="], [table, "SIGNING_KEY"]] as const) {
      // oxlint-disable-next-line no-await-in-loop -- three fixtures over one repository, read in turn
      const result = await check(cwd, text);
      expect(result.ready).toBe(false);
      expect(blockersOf(result, "prerequisite-open")).toEqual([{ code: "prerequisite-open", line: lineOf(text, needle) }]);
    }
    const leaked = await check(cwd, valued);
    expect(JSON.stringify(leaked)).not.toContain("sk-live-123");
  });

  it("parses a contract strictly: its problems refuse every plan, a prerequisite neither done nor owned as prerequisite-open", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const contract = (body: string): PlanCheckDoc => ({
      path: "runs/contract.yaml",
      text: `run-contract: ${body}\nplan: ${PLAN_PATH}\nbase: ${stamp.slice(0, 12)}\nacceptance: every unit green\nscope: { in: [src] }\nanswerer: "@maintainer"\n`,
    });
    const withPrerequisite = (state: string): PlanCheckDoc => ({
      path: "runs/contract.yaml",
      text: `${contract("1").text}prerequisites:\n  - { name: deploy token, state: ${state} }\nbudget: { stop-by: "2026-10-16T06:00:00Z", max-units: 4 }\n`,
    });
    const plans = [
      { path: PLAN_PATH, text: cleanPlan(stamp) },
      { path: NEXT_PATH, text: cleanPlan(stamp, { id: "demo-02" }) },
    ];

    const valid = await checkPlans(plans, { specs: SPECS, git, cwd, contract: withPrerequisite("done") });
    expect(valid.ready).toBe(true);
    expect(valid.contract).toEqual({ ok: true, problems: [] });

    const versioned = await checkPlans(plans, { specs: SPECS, git, cwd, contract: contract("2") });
    expect(versioned.ready).toBe(false);
    expect(versioned.contract?.ok).toBe(false);
    expect(versioned.contract?.problems).toEqual([expect.stringContaining("reads version 1")]);
    for (const report of versioned.plans) {
      expect(report.ready).toBe(false);
      expect(report.blockers.map((blocker) => blocker.code)).toEqual(["contract"]);
    }

    const open = await checkPlans(plans, { specs: SPECS, git, cwd, contract: withPrerequisite("pending") });
    expect(open.ready).toBe(false);
    expect(open.plans[0]?.blockers.map((blocker) => blocker.code)).toEqual(["prerequisite-open"]);
  });

  it("refuses a contract whose plan names none of the plans checked as contract-mismatch, whatever item says", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const contract = (reference: string): PlanCheckDoc => ({
      path: "runs/contract.yaml",
      text: `run-contract: 1\n${reference}\nbase: ${stamp.slice(0, 12)}\nacceptance: every unit green\nscope: { in: [src] }\nanswerer: "@maintainer"\n`,
    });
    const plans = [
      { path: PLAN_PATH, text: cleanPlan(stamp) },
      { path: NEXT_PATH, text: cleanPlan(stamp, { id: "demo-02" }) },
    ];

    for (const reference of ["plan: docs/plans/009-elsewhere.md", 'plan: docs/plans/009-elsewhere.md\nitem: "#412"', "plan: docs/plans/009-elsewhere.md\nitem: demo-01"]) {
      // oxlint-disable-next-line no-await-in-loop -- three contracts over one repository, read in turn
      const refused = await checkPlans(plans, { specs: SPECS, git, cwd, contract: contract(reference) });
      expect(refused.ready).toBe(false);
      expect(refused.contract).toEqual({ ok: true, problems: [] });
      for (const report of refused.plans) {
        expect(report.ready).toBe(false);
        expect(report.blockers.map((blocker) => ({ code: blocker.code, line: blocker.line }))).toEqual([{ code: "contract-mismatch", line: undefined }]);
      }
      // The message names the keys, never the values the contract holds.
      expect(JSON.stringify(refused.plans)).not.toMatch(/009-elsewhere|#412/);
    }

    // A `plan` naming one checked plan — by path, however it is spelled, or by head id — governs them;
    // an item-only contract gets no mismatch, since a board item names no plan.
    for (const reference of [`plan: ${NEXT_PATH}`, `plan: ./${PLAN_PATH}`, "plan: demo-02", 'item: "#412"', "item: demo-02"]) {
      // oxlint-disable-next-line no-await-in-loop -- five contracts over one repository, read in turn
      expect((await checkPlans(plans, { specs: SPECS, git, cwd, contract: contract(reference) })).ready).toBe(true);
    }
  });

  it("reads provisional definitions and plan size as advisories: ready, L5 counted", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const filler = Array.from({ length: 62 }, (_, n) => `Note ${n}.`).join("\n");
    const text = cleanPlan(stamp).replace("## Risks", `${filler}\n\n## Risks`);
    const result = await checkPlans([{ path: PLAN_PATH, text }], { specs: [], git, cwd });

    expect(result.ready).toBe(true);
    const codes = result.plans[0]?.advisories.map((advisory) => advisory.code);
    expect(codes).toEqual(["provisional-definition", "provisional-definition", "unit-size"]);
    expect(result.plans[0]?.lint.L5).toBe(1);
  });

  it("classes every finding code of the skill's coverage script as one blocker or advisory", () => {
    const script = readFileSync(resolve("content/skills/st-verify/scripts/spec-plan-coverage.mjs"), "utf8");
    const codes = new Set([...script.matchAll(/\b(?:add|report)\("([a-z-]+)"/g)].map((match) => match[1]));
    expect(codes.size).toBeGreaterThan(20);

    const blockerCodes: readonly string[] = PLAN_BLOCKER_CODES;
    for (const code of codes) {
      const kind = code === undefined ? undefined : COVERAGE_CODE_CLASS[code];
      expect({ code, mapped: kind !== undefined }).toEqual({ code, mapped: true });
      if (kind !== undefined && kind !== "advisory") expect(blockerCodes).toContain(kind);
    }
    // No row for a code the script no longer raises.
    expect(Object.keys(COVERAGE_CODE_CLASS).toSorted()).toEqual([...codes].toSorted());
  });
});

describe("stamity plan check over a working directory git spells otherwise", () => {
  /**
   * prove/1: git answers its top level in the file system's own spelling, so the working directory
   * and each input must be resolved the same way. A folder named in another letter case (or, on
   * Windows, through an 8.3 short name such as `RUNNER~1`) is the same folder; the check reads it
   * as the repository, never as "outside the repository". The flipped spelling exists only on a
   * case-insensitive disk, so a case-sensitive one skips.
   */
  it("reads a plan when the working directory names the repository folder in flipped case", async (ctx) => {
    const handle = tempDir();
    const folder = "Plan-Check-Repo";
    const flipped = join(handle.dir, "pLAN-cHECK-rEPO");
    await handle.seedFiles({ [`${folder}/docs/a.md`]: "a\n", [`${folder}/src/b.ts`]: "export const b = 1;\n" });
    if (!existsSync(flipped)) ctx.skip();
    const cwd = join(handle.dir, folder);
    try {
      await seedGitRepo(cwd);
    } catch (error) {
      if (error instanceof Error && error.name === "GitUnavailableError") ctx.skip();
      throw error;
    }
    const stamp = headSha(cwd);
    await handle.seedFiles({ [`${folder}/${PLAN_PATH}`]: cleanPlan(stamp), [`${folder}/${SPECS[0]!.path}`]: SPECS[0]!.text });

    const run = await runInProcess([planCommand], ["plan", "check", PLAN_PATH, "--json"], { cwd: flipped });
    expect(run.code, `${run.stdout}\n${run.stderr}`).toBe(0);
    const doc = JSON.parse(run.stdout) as { ready: boolean; plans: { path: string }[] };
    expect(doc.ready).toBe(true);
    expect(doc.plans.map((report) => report.path)).toEqual([PLAN_PATH]);
  });
});
