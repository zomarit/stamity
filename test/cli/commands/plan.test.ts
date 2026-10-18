import { execFileSync } from "node:child_process";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { planCommand } from "../../../src/cli/commands/plan.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { NO_GIT_CONFIG, seedGitRepo } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * u17-plan-verb (REQ-FLOW-091): `stamity plan check`, through the in-process funnel, so each
 * case also covers the 0/1/2 exit contract and the one JSON document. The readiness verdict is
 * u13's `checkPlans`, run here over real repositories with the real git binary: the verb owns
 * where the plans, the specs and the contract come from, and nothing is stubbed.
 */

const tempDir = useTempDir("plan-verb");

const PLAN_PATH = "docs/plans/001-demo.md";
const NEXT_PATH = "docs/plans/002-demo.md";
const SPEC_PATH = "docs/specs/demo.md";
const CONTRACT_PATH = "runs/contract.yaml";

const SPEC_TEXT =
  "# Demo\n\n## Requirements\n\n### REQ-DEMO-001 — Reject expired values\nGiven an expired value, Then it is refused.\n\n### REQ-DEMO-002 — Keep retry state\nGiven a retry, Then its state survives.\n";

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

/** Append to `path` and commit it alone; returns the new HEAD. */
async function touchAndCommit(cwd: string, path: string, line: string): Promise<string> {
  await writeFile(join(cwd, path), `${line}\n`, { encoding: "utf8", flag: "a" });
  writeGit(cwd, ["add", "--", path]);
  writeGit(cwd, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", `touch ${path}`]);
  return writeGit(cwd, ["rev-parse", "HEAD"]).trim();
}

/**
 * A repository, in a folder of the test's temp directory, holding the two paths the plans read and
 * the spec unless `specs` is false; the temp directory's other folders lie outside it.
 */
async function seeded(skip: () => void, opts: { specs?: boolean; folder?: string } = {}): Promise<{ cwd: string; stamp: string }> {
  const handle = tempDir();
  const cwd = handle.path(opts.folder ?? "repo");
  await put(cwd, "docs/a.md", "a\n");
  await put(cwd, "src/b.ts", "export const b = 1;\n");
  try {
    await seedGitRepo(cwd);
  } catch (error) {
    if (error instanceof Error && error.name === "GitUnavailableError") skip();
    throw error;
  }
  if (opts.specs !== false) await put(cwd, SPEC_PATH, SPEC_TEXT);
  return { cwd, stamp: writeGit(cwd, ["rev-parse", "HEAD"]).trim() };
}

async function put(root: string, path: string, text: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text, "utf8");
}

const unit = (id: string, requirements: string, dependsOn: string): string =>
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
    "| `edgeCases` | an expired value → refused |",
    `| \`depends_on\` | ${dependsOn} |`,
    "| `verify` | `npx vitest run test/b.test.ts` |",
    "",
  ].join("\n");

const DELTA = [
  "## Spec delta",
  "",
  "### REQ-DEMO-001 — Reject expired values (ADDED)",
  "Given an expired value, Then it is refused.",
  "",
  "### REQ-DEMO-002 — Keep retry state (ADDED)",
  "Given a retry, Then its state survives.",
  "",
].join("\n");

/**
 * The same delta as MODIFIED entries: a bare `### REQ-` heading defines its id provisionally where no
 * spec does, a `### MODIFIED REQ-` one never does, so these ids resolve only through the spec.
 */
const MODIFIED_DELTA = DELTA.replaceAll("### REQ-", "### MODIFIED REQ-").replaceAll(" (ADDED)", "");

/** A plan every check passes; `modified: true` leaves the ids to the spec alone. */
function cleanPlan(stamp: string, head: { id?: string; extra?: string; modified?: boolean } = {}): string {
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
    head.modified === true ? MODIFIED_DELTA : DELTA,
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

const contract = (version: string, stamp: string): string =>
  `run-contract: ${version}\nplan: ${PLAN_PATH}\nbase: ${stamp.slice(0, 12)}\nacceptance: every unit green\nscope: { in: [src] }\nanswerer: "@maintainer"\n`;

/** The 1-based line of the first line of `text` that contains `needle`. */
function lineOf(text: string, needle: string): number {
  const index = text.split("\n").findIndex((line) => line.includes(needle));
  if (index === -1) throw new Error(`fixture has no line containing ${needle}`);
  return index + 1;
}

async function plan(cwd: string, argv: readonly string[]) {
  return runInProcess([planCommand], ["plan", ...argv], { cwd });
}

/** The one JSON document of a `--json` run. */
async function planJson(cwd: string, argv: readonly string[]) {
  const run = await plan(cwd, [...argv, "--json"]);
  return { code: run.code, doc: JSON.parse(run.stdout) as Record<string, unknown> & PlanDoc };
}

interface PlanDoc {
  ok: boolean;
  ready: boolean;
  plans: { path: string; ready: boolean; blockers: { code: string; line?: number; message: string }[]; advisories: { code: string; message: string }[]; freshness: { stale: { path: string; reason: string }[]; exempt: string[] } | null; lint: Record<string, unknown> }[];
  contract?: { ok: boolean; problems: string[] };
  blockers?: { code: string; path: string; message: string }[];
}

const codes = (report: PlanDoc["plans"][number] | undefined): string[] => (report?.blockers ?? []).map((blocker) => blocker.code);

describe("stamity plan check", () => {
  it("reads a ready plan: exit 0, u13's result as the JSON, L1 not-checked", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    await put(cwd, PLAN_PATH, cleanPlan(stamp));

    const { code, doc } = await planJson(cwd, ["check", PLAN_PATH]);
    expect(code).toBe(0);
    expect(doc).toMatchObject({ ok: true, command: "plan", ready: true });
    expect(doc.plans).toHaveLength(1);
    expect(doc.plans[0]).toMatchObject({ path: PLAN_PATH, ready: true, blockers: [], advisories: [] });
    expect(doc.plans[0]?.lint).toEqual({ L1: "not-checked", L2: "pass", L3: "pass", L4: "pass", L5: 0 });

    const human = await plan(cwd, ["check", PLAN_PATH]);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain(`${PLAN_PATH}: ready`);
  });

  it("refuses a clarification marker: exit 1 naming the blocker and its line", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const text = cleanPlan(stamp).replace("Values expire; retries keep state.", "Values expire after [NEEDS CLARIFICATION: how long?].");
    await put(cwd, PLAN_PATH, text);
    const line = lineOf(text, "how long");

    const { code, doc } = await planJson(cwd, ["check", PLAN_PATH]);
    expect(code).toBe(1);
    expect(doc.ok).toBe(false);
    expect(doc.ready).toBe(false);
    expect(doc.plans[0]?.blockers).toEqual([expect.objectContaining({ code: "needs-clarification", line })]);

    const human = await plan(cwd, ["check", PLAN_PATH]);
    expect(human.code).toBe(1);
    expect(human.stdout).toContain(`${PLAN_PATH}: not ready`);
    expect(human.stdout).toContain(`needs-clarification ${PLAN_PATH}:${line}`);
  });

  it("checks a chain with --chain --since: the second file names the first, or chain-order refuses it", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    await put(cwd, PLAN_PATH, cleanPlan(stamp));
    await put(cwd, NEXT_PATH, cleanPlan(stamp, { id: "demo-02", extra: `depends_on: [${PLAN_PATH}]` }));

    const accepted = await planJson(cwd, ["check", PLAN_PATH, NEXT_PATH, "--chain", "--since", stamp]);
    expect(accepted.code).toBe(0);
    expect(accepted.doc.plans.map((report) => report.path)).toEqual([PLAN_PATH, NEXT_PATH]);

    // The same two files in the other order: the first named is now the predecessor, and the
    // second's head names no predecessor, so the chain refuses it.
    const reversed = await planJson(cwd, ["check", NEXT_PATH, PLAN_PATH, "--chain", "--since", stamp]);
    expect(reversed.code).toBe(1);
    expect(codes(reversed.doc.plans[1])).toEqual(["chain-order"]);

    // Without --chain the reversed pair is two independent plans, each ready.
    expect((await plan(cwd, ["check", NEXT_PATH, PLAN_PATH])).code).toBe(0);
  });

  it("passes --since through as the chain's base: a move after it is exempt, one between the stamp and it stays stale", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const between = await touchAndCommit(cwd, "docs/a.md", "moved between the stamp and the base");
    const base = await touchAndCommit(cwd, "history.md", "the run's base");
    await touchAndCommit(cwd, "src/b.ts", "export const fromTheChain = 3;");
    await put(cwd, PLAN_PATH, cleanPlan(stamp));
    await put(cwd, NEXT_PATH, cleanPlan(stamp, { id: "demo-02", extra: `depends_on: [${PLAN_PATH}]` }));
    const chain = ["check", PLAN_PATH, NEXT_PATH, "--chain", "--since"];

    // The run's base: src/b.ts moved only after it, so it is exempt; docs/a.md moved before it, so it is stale.
    const atBase = await planJson(cwd, [...chain, base]);
    expect(atBase.code).toBe(1);
    for (const report of atBase.doc.plans) {
      expect(report.freshness).toMatchObject({ stale: [{ path: "docs/a.md", reason: "moved" }], exempt: ["src/b.ts"] });
      expect(codes(report)).toEqual(["stale"]);
    }

    // The stamp as the base: no commit lies between the stamp and itself, so both moves are exempt.
    const atStamp = await planJson(cwd, [...chain, stamp]);
    expect(atStamp.code).toBe(0);
    for (const report of atStamp.doc.plans) {
      expect(report.freshness).toMatchObject({ stale: [], exempt: ["docs/a.md", "src/b.ts"] });
    }
    expect(between).not.toBe(base);
  });

  // review/60 (signed off, run 2026-10-18_cloud-runs-2): a run continued from its branch re-runs the ready check
  // over one plan, and its own checkpoint commits move the paths that plan reads; `--since` its record's `Base:`
  // exempts them for a single plan as for a chain, so the continuation is not refused `stale` by its own work.
  it("takes --since for a single plan without --chain: a move after the base is exempt, one before it stays stale", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    await touchAndCommit(cwd, "docs/a.md", "moved between the stamp and the base");
    const base = await touchAndCommit(cwd, "history.md", "the run's base");
    await touchAndCommit(cwd, "src/b.ts", "export const fromTheRun = 3;");
    await put(cwd, PLAN_PATH, cleanPlan(stamp));

    const atBase = await planJson(cwd, ["check", PLAN_PATH, "--since", base]);
    expect(atBase.code).toBe(1);
    expect(atBase.doc.plans[0]?.freshness).toMatchObject({ stale: [{ path: "docs/a.md", reason: "moved" }], exempt: ["src/b.ts"] });
    expect(codes(atBase.doc.plans[0])).toEqual(["stale"]);

    // Every move after the stamp: the run's own commits alone, so the plan is ready again.
    const atStamp = await planJson(cwd, ["check", PLAN_PATH, "--since", stamp]);
    expect(atStamp.code).toBe(0);
    expect(atStamp.doc.plans[0]?.freshness).toMatchObject({ stale: [], exempt: ["docs/a.md", "src/b.ts"] });

    // Without --since both moves count, as before.
    const bare = await planJson(cwd, ["check", PLAN_PATH]);
    expect(bare.code).toBe(1);
    expect(codes(bare.doc.plans[0])).toEqual(["stale", "stale"]);
  });

  it("refuses a version-2 run contract: exit 1 with the contract's problem on every plan", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    await put(cwd, PLAN_PATH, cleanPlan(stamp));
    await put(cwd, CONTRACT_PATH, contract("2", stamp));

    const { code, doc } = await planJson(cwd, ["check", PLAN_PATH, "--contract", CONTRACT_PATH]);
    expect(code).toBe(1);
    expect(doc.contract?.ok).toBe(false);
    expect(doc.contract?.problems).toEqual([expect.stringContaining("reads version 1")]);
    expect(codes(doc.plans[0])).toEqual(["contract"]);

    // The same contract at version 1 governs this plan and passes.
    await put(cwd, CONTRACT_PATH, contract("1", stamp));
    const valid = await planJson(cwd, ["check", PLAN_PATH, "--contract", CONTRACT_PATH]);
    expect(valid.code).toBe(0);
    expect(valid.doc.contract).toEqual({ ok: true, problems: [] });
  });

  it("refuses a plan path outside the repository, naming it, and reads none of it", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    await put(cwd, PLAN_PATH, cleanPlan(stamp));
    const foreign = tempDir().path("outside", "elsewhere.md");
    await put(dirname(foreign), "elsewhere.md", cleanPlan(stamp).replace("Values expire", "[NEEDS CLARIFICATION] outside"));

    const { code, doc } = await planJson(cwd, ["check", PLAN_PATH, foreign]);
    expect(code).toBe(1);
    expect(doc.ready).toBe(false);
    // Nothing is checked when a named plan cannot be read: a partial chain would misread its order.
    expect(doc.plans).toEqual([]);
    expect(doc.blockers).toEqual([{ code: "no-plan", path: foreign, message: expect.stringContaining("outside the repository") }]);

    const human = await plan(cwd, ["check", foreign]);
    expect(human.code).toBe(1);
    expect(human.stderr).toContain(foreign);
    expect(human.stderr).toContain("outside the repository");
  });

  // A symlink needs a privilege Windows does not grant by default.
  it.skipIf(process.platform === "win32")("refuses a link inside the repository to a plan outside it: containment reads the real path", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    const foreign = tempDir().path("outside", "elsewhere.md");
    await put(dirname(foreign), "elsewhere.md", cleanPlan(stamp));
    await put(cwd, PLAN_PATH, cleanPlan(stamp));
    await symlink(foreign, join(cwd, "docs/plans/linked.md"));
    // A link to a plan inside the repository is read, under the link's own name.
    await symlink(join(cwd, PLAN_PATH), join(cwd, "docs/plans/alias.md"));

    const refused = await planJson(cwd, ["check", "docs/plans/linked.md"]);
    expect(refused.code).toBe(1);
    expect(refused.doc.blockers).toEqual([{ code: "no-plan", path: "docs/plans/linked.md", message: expect.stringContaining("outside the repository") }]);

    const alias = await planJson(cwd, ["check", "docs/plans/alias.md"]);
    expect(alias.code).toBe(0);
    expect(alias.doc.plans[0]?.path).toBe("docs/plans/alias.md");
  });

  it("refuses a missing plan and a missing contract as exit 1 naming each", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    await put(cwd, PLAN_PATH, cleanPlan(stamp));

    const missing = await planJson(cwd, ["check", "docs/plans/404.md"]);
    expect(missing.code).toBe(1);
    expect(missing.doc.blockers).toEqual([{ code: "no-plan", path: "docs/plans/404.md", message: expect.stringContaining("does not exist") }]);

    const noContract = await planJson(cwd, ["check", PLAN_PATH, "--contract", "runs/none.yaml"]);
    expect(noContract.code).toBe(1);
    expect(noContract.doc.blockers).toEqual([{ code: "contract", path: "runs/none.yaml", message: expect.stringContaining("does not exist") }]);
  });

  it("reads a plan named from a subdirectory by its repository path", async (ctx) => {
    const { cwd, stamp } = await seeded(() => ctx.skip());
    await put(cwd, PLAN_PATH, cleanPlan(stamp));

    const { code, doc } = await planJson(join(cwd, "docs"), ["check", "plans/001-demo.md"]);
    expect(code).toBe(0);
    expect(doc.plans[0]?.path).toBe(PLAN_PATH);
  });

  it("reads the specs from docs/specs, and with no docs/specs handles L4 as the coverage script does", async (ctx) => {
    // The plan's delta modifies ids it does not define, so they resolve only through the spec.
    const withSpecs = await seeded(() => ctx.skip());
    await put(withSpecs.cwd, PLAN_PATH, cleanPlan(withSpecs.stamp, { modified: true }));
    const ready = await planJson(withSpecs.cwd, ["check", PLAN_PATH]);
    expect(ready.code).toBe(0);
    expect(ready.doc.plans[0]?.lint).toMatchObject({ L4: "pass" });

    const noSpecs = await seeded(() => ctx.skip(), { specs: false, folder: "bare" });
    await put(noSpecs.cwd, PLAN_PATH, cleanPlan(noSpecs.stamp, { modified: true }));
    const refused = await planJson(noSpecs.cwd, ["check", PLAN_PATH]);
    expect(refused.code).toBe(1);
    expect(refused.doc.plans[0]?.lint).toMatchObject({ L4: "fail" });
    expect(new Set(codes(refused.doc.plans[0]))).toEqual(new Set(["lint-L4"]));
    // The script reads an absent spec directory as no spec and says so, as an advisory.
    expect(refused.doc.plans[0]?.advisories).toEqual([expect.objectContaining({ code: "missing-spec-input" })]);

    // A plan whose delta adds the ids defines them provisionally: ready with no spec, both advisories said.
    await put(noSpecs.cwd, PLAN_PATH, cleanPlan(noSpecs.stamp));
    const own = await planJson(noSpecs.cwd, ["check", PLAN_PATH]);
    expect(own.code).toBe(0);
    expect(own.doc.plans[0]?.advisories.map((advisory) => advisory.code)).toEqual([
      "missing-spec-input",
      "provisional-definition",
      "provisional-definition",
    ]);
  });

  it.each([
    ["--chain without --since", ["check", PLAN_PATH, "--chain"]],
    // TEST CHANGE, justified (review/60, signed off): `--since` alone now serves one plan, so the usage error is
    // `--since` over several plans without `--chain`, which would read them as a chain they were not declared as.
    ["--since over several plans without --chain", ["check", PLAN_PATH, NEXT_PATH, "--since", "0123456789abcdef"]],
    ["--since that is no commit id", ["check", PLAN_PATH, "--chain", "--since", "HEAD~1"]],
    ["no plan", ["check"]],
    ["an unknown subcommand", ["lint", PLAN_PATH]],
  ])("exits 2 on a usage error: %s", async (_label, argv) => {
    const handle = tempDir();
    const run = await plan(handle.dir, argv);
    expect(run.code).toBe(2);
    expect(run.stdout).toBe("");
  });

  it("is hidden, non-mutating, and its help names the subcommand and every flag", async () => {
    expect(planCommand).toMatchObject({ name: "plan", hidden: true, mutating: false });
    const run = await runInProcess([planCommand], ["plan", "--help"]);
    expect(run.code).toBe(0);
    for (const word of ["check", "<plan...>", "--chain", "--since <sha>", "--contract <path>", "--json"]) {
      expect(run.stdout).toContain(word);
    }
    expect(run.stdout).not.toContain("--dry-run");
  });
});
