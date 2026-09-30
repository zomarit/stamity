import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — import-safe native ESM CI helper with no type declarations, like records-only.
import { decide, parseArgs, runTests, TIMEOUT, vitestArgs } from "../../scripts/ci/test-run.mjs";
import { lazyCleanup } from "../support/lazyCleanup.ts";

/**
 * The CI test step, `scripts/ci/test-run.mjs`: one re-run for a failure made of timeouts alone.
 *
 * The property that matters is one direction of one mistake: a re-run must never hide a real
 * failure. So every case that is not "timeouts and nothing else" is asserted to be red with the
 * suite run exactly once, a timeout on the re-run is asserted red, and a green re-run is asserted
 * to say "flaky" out loud. The pure half is driven with scripted vitest outcomes; the CLI half runs
 * the real script, the real vitest and the real reporter against a scratch project, because what
 * the reporter can see — a `describe` block's `afterAll` — is not visible to the pure half.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = join(REPO_ROOT, "scripts", "ci", "test-run.mjs");

interface Failure {
  readonly file: string;
  readonly messages: readonly string[];
}
interface Report {
  readonly reason: "passed" | "failed" | "interrupted";
  readonly unhandled: readonly string[];
  readonly failures: readonly Failure[];
}
interface Outcome {
  readonly exitCode: number;
  readonly report: Report | null;
}
interface Decision {
  readonly action: "pass" | "rerun" | "fail";
  readonly files: readonly string[];
  readonly reason: string;
}
interface Io {
  readonly env: Readonly<Record<string, string | undefined>>;
  vitest(args: readonly string[]): Outcome;
  out(text: string): void;
  err(text: string): void;
  summary(text: string): void;
}

const decideTyped = decide as (outcome: Outcome) => Decision;
const runTyped = runTests as (argv: readonly string[], io: Io) => number;
const argsTyped = parseArgs as (argv: readonly string[]) => { coverage: boolean; shard?: string; error?: string };
const vitestArgsTyped = vitestArgs as (
  run: { coverage: boolean; shard?: string | undefined; files?: readonly string[] },
  env: Readonly<Record<string, string | undefined>>,
) => string[];

const HOOK = "Hook timed out in 20000ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with \"hookTimeout\".";
const TEST = "Test timed out in 20000ms.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with \"testTimeout\".";
const ASSERTION = "expected 29 to be 30 // Object.is equality";

const failed = (...failures: Failure[]): Outcome => ({
  exitCode: 1,
  report: { reason: "failed", unhandled: [], failures },
});
const GREEN: Outcome = { exitCode: 0, report: { reason: "passed", unhandled: [], failures: [] } };

describe("decide — which failures earn one re-run", () => {
  it("passes a run vitest passed, without reading the report", () => {
    expect(decideTyped(GREEN).action).toBe("pass");
  });

  it("re-runs a run whose only failure is a hook timeout, naming the file", () => {
    const decision = decideTyped(failed({ file: "test/upstream/lane.test.ts", messages: [HOOK] }));
    expect(decision.action).toBe("rerun");
    expect(decision.files).toEqual(["test/upstream/lane.test.ts"]);
  });

  it("re-runs timeouts across two files, a hook and a test, and names both", () => {
    const decision = decideTyped(
      failed(
        { file: "test/ci/apmDownstream.test.ts", messages: [HOOK] },
        { file: "test/upstream/workflowRecovery.test.ts", messages: [TEST, HOOK] },
      ),
    );
    expect(decision).toEqual({
      action: "rerun",
      files: ["test/ci/apmDownstream.test.ts", "test/upstream/workflowRecovery.test.ts"],
      reason: expect.stringContaining("timeout"),
    });
  });

  it("refuses a re-run when an assertion failed, even beside a timeout", () => {
    const alone = decideTyped(failed({ file: "test/hooks/scripts.test.ts", messages: [ASSERTION] }));
    expect(alone.action).toBe("fail");
    const beside = decideTyped(
      failed(
        { file: "test/upstream/lane.test.ts", messages: [HOOK] },
        { file: "test/hooks/scripts.test.ts", messages: [ASSERTION] },
      ),
    );
    expect(beside).toEqual({ action: "fail", files: [], reason: expect.stringContaining("expected 29 to be 30") });
    // One file carrying a timeout AND an assertion is the same answer.
    expect(decideTyped(failed({ file: "a.test.ts", messages: [TEST, ASSERTION] })).action).toBe("fail");
  });

  it("refuses a re-run for every failure it cannot prove is a timeout", () => {
    const cases: readonly [string, Outcome][] = [
      ["no report at all", { exitCode: 1, report: null }],
      ["a killed vitest", { exitCode: 137, report: null }],
      ["an interrupted run", { exitCode: 1, report: { reason: "interrupted", unhandled: [], failures: [{ file: "a.test.ts", messages: [HOOK] }] } }],
      ["an unhandled error", { exitCode: 1, report: { reason: "failed", unhandled: [HOOK], failures: [{ file: "a.test.ts", messages: [HOOK] }] } }],
      // A coverage floor or a run-level error exits 1 with every file green.
      ["a red exit with no failed file", { exitCode: 1, report: { reason: "passed", unhandled: [], failures: [] } }],
      ["a failed file with no message", failed({ file: "a.test.ts", messages: [] })],
      ["a message that only mentions a timeout", failed({ file: "a.test.ts", messages: ["the Test timeout was 20s"] })],
    ];
    for (const [label, outcome] of cases) {
      const decision = decideTyped(outcome);
      expect(decision.action, label).toBe("fail");
      expect(decision.reason, label).not.toBe("");
    }
  });

  it("matches vitest's two timeout messages and nothing wider", () => {
    expect(TIMEOUT.test(HOOK)).toBe(true);
    expect(TIMEOUT.test(TEST)).toBe(true);
    expect(TIMEOUT.test(ASSERTION)).toBe(false);
    expect(TIMEOUT.test("Error: spawnSync git ETIMEDOUT")).toBe(false);
  });
});

describe("the arguments", () => {
  it("reads --coverage and --shard, and treats an empty shard as unsharded", () => {
    expect(argsTyped([])).toEqual({ coverage: false });
    expect(argsTyped(["--coverage"])).toEqual({ coverage: true });
    expect(argsTyped(["--shard=2/2"])).toEqual({ coverage: false, shard: "2/2" });
    expect(argsTyped(["--shard="])).toEqual({ coverage: false });
  });

  it("refuses an argument it does not know and a malformed shard", () => {
    for (const argv of [["--bail"], ["--shard=3/2"], ["--shard=0/2"], ["--shard=1"], ["--shard=a/b"], ["x"]]) {
      expect(argsTyped(argv).error, argv.join(" ")).toBeTypeOf("string");
    }
  });

  it("hands vitest this file as a reporter, and the github-actions one only on a runner", () => {
    const local = vitestArgsTyped({ coverage: true, shard: "1/2" }, {});
    expect(local.slice(0, 3)).toEqual(["run", "--coverage", "--shard=1/2"]);
    expect(local).toContain("--reporter=default");
    expect(local.filter((arg) => arg.startsWith("--reporter=") && arg.endsWith("scripts/ci/test-run.mjs"))).toHaveLength(1);
    expect(local).not.toContain("--reporter=github-actions");
    // Naming a reporter replaces vitest's defaults, which add github-actions on a runner.
    expect(vitestArgsTyped({ coverage: false }, { GITHUB_ACTIONS: "true" })).toContain("--reporter=github-actions");
    expect(vitestArgsTyped({ coverage: false, files: ["test/a.test.ts"] }, {}).slice(0, 2)).toEqual(["run", "test/a.test.ts"]);
  });
});

/**
 * Scripted vitest outcomes. Justified stub: the property under test is the orchestration — how
 * many runs, with which arguments, and what is printed — and a real suite cannot be made to time
 * out on the first run and pass on the second on demand. The CLI block below proves the same
 * path once end to end against a real vitest.
 */
function scripted(...outcomes: Outcome[]) {
  const calls: string[][] = [];
  const out: string[] = [];
  const err: string[] = [];
  const summary: string[] = [];
  const io: Io = {
    env: {},
    vitest(args) {
      calls.push([...args]);
      const next = outcomes.shift();
      if (next === undefined) throw new Error(`vitest was run ${calls.length} times; the script allowed fewer`);
      return next;
    },
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    summary: (text) => summary.push(text),
  };
  return { io, calls, out, err, summary };
}

describe("runTests — the one re-run and what it says", () => {
  it("re-runs only the timed-out file on a shard leg and reports it flaky when it passes", () => {
    const run = scripted(failed({ file: "test/upstream/lane.test.ts", messages: [HOOK] }), GREEN);
    expect(runTyped(["--shard=1/2"], run.io)).toBe(0);
    expect(run.calls).toHaveLength(2);
    expect(run.calls[0]).toContain("--shard=1/2");
    // The re-run is the failed file alone: no shard, no coverage.
    expect(run.calls[1]?.slice(0, 2)).toEqual(["run", "test/upstream/lane.test.ts"]);
    expect(run.calls[1]?.some((arg) => arg.startsWith("--shard"))).toBe(false);
    expect(run.out.join("")).toBe(
      "::warning title=flaky test::test/upstream/lane.test.ts: timed out once, passed on re-run\n",
    );
    expect(run.summary.join("")).toContain("test/upstream/lane.test.ts");
    expect(run.summary.join("")).toContain("timed out once, passed on re-run");
  });

  it("re-runs the whole suite with coverage on a coverage leg, so the floors are measured whole", () => {
    const run = scripted(
      failed(
        { file: "test/ci/apmDownstream.test.ts", messages: [HOOK] },
        { file: "test/upstream/workflowRecovery.test.ts", messages: [HOOK] },
      ),
      GREEN,
    );
    expect(runTyped(["--coverage"], run.io)).toBe(0);
    expect(run.calls).toHaveLength(2);
    expect(run.calls[1]).toEqual(run.calls[0]);
    expect(run.calls[1]).toContain("--coverage");
    // Two files timed out, so two annotations — one per file, never one for the run.
    expect(run.out).toHaveLength(2);
    expect(run.summary.join("").match(/timed out once, passed on re-run/g)).toHaveLength(2);
  });

  it("is red when the re-run times out again, and says nothing about flakiness", () => {
    const hook = failed({ file: "test/upstream/lane.test.ts", messages: [HOOK] });
    const run = scripted(hook, hook);
    expect(runTyped(["--shard=2/2"], run.io)).toBe(1);
    expect(run.calls).toHaveLength(2);
    expect(run.out).toEqual([]);
    expect(run.summary).toEqual([]);
    expect(run.err.join("")).toContain("re-run failed");
  });

  it("is red on an assertion failure and never runs the suite twice", () => {
    const run = scripted(failed({ file: "test/hooks/scripts.test.ts", messages: [ASSERTION] }));
    expect(runTyped(["--coverage"], run.io)).toBe(1);
    expect(run.calls).toHaveLength(1);
    expect(run.out).toEqual([]);
    expect(run.err.join("")).toContain("no re-run");
  });

  it("is green on a green run, with one run and nothing printed", () => {
    const run = scripted(GREEN);
    expect(runTyped([], run.io)).toBe(0);
    expect(run.calls).toHaveLength(1);
    expect([...run.out, ...run.summary]).toEqual([]);
  });

  it("exits 2 on an argument it does not know, before running anything", () => {
    const run = scripted();
    expect(runTyped(["--shard=1/0"], run.io)).toBe(2);
    expect(run.calls).toEqual([]);
  });
});

/**
 * The CLI end to end: the real script, the real vitest and the real reporter, in a scratch project
 * that borrows this checkout's dependency tree. Each case is two or three vitest cold starts
 * (measured about 1.5s each on darwin), so the budget is explicit and wide for a loaded runner.
 */
const CLI_MS = 120_000;

describe("the CLI against a real vitest", () => {
  let work: string;

  beforeAll(() => {
    work = realpathSync(mkdtempSync(join(tmpdir(), "stamity-test-run-")));
  });
  afterAll(() => lazyCleanup(work));

  function project(name: string, files: Record<string, string>): string {
    const root = join(work, name);
    mkdirSync(root);
    // Never installed: the fixture's test files resolve `vitest` through this checkout's tree.
    symlinkSync(join(REPO_ROOT, "node_modules"), join(root, "node_modules"), "junction");
    writeFileSync(
      join(root, "vitest.config.mjs"),
      'import { defineConfig } from "vitest/config";\n' +
        'export default defineConfig({ test: { include: ["*.test.mjs"], hookTimeout: 500, testTimeout: 500 } });\n',
    );
    for (const [file, text] of Object.entries(files)) writeFileSync(join(root, file), text);
    return root;
  }

  function cli(root: string, args: readonly string[]) {
    const summary = join(root, "step-summary.md");
    // The runner's own annotation and summary channels are replaced, so this fixture's deliberate
    // failures never reach the real job's annotations or summary.
    const env: NodeJS.ProcessEnv = { ...process.env, GITHUB_STEP_SUMMARY: summary };
    delete env["GITHUB_ACTIONS"];
    const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, env, encoding: "utf8" });
    return { ...result, summary: existsSync(summary) ? readFileSync(summary, "utf8") : "" };
  }

  it(
    "re-runs a describe-level afterAll that timed out once, and reports it flaky",
    () => {
      // The first load finds no marker, writes one, and holds its afterAll past the 500ms budget;
      // the second load finds the marker and returns at once. Exactly the lane.test.ts shape: an
      // afterAll inside a describe, which vitest's built-in json report does not carry.
      const root = project("flaky", {
        "flaky.test.mjs": `import { existsSync, writeFileSync, appendFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
const marker = new URL("./first-run-done", import.meta.url);
appendFileSync(new URL("./loads", import.meta.url), "load\\n");
const first = !existsSync(marker);
writeFileSync(marker, "");
describe("a suite with a slow cleanup", () => {
  afterAll(() => new Promise((done) => setTimeout(done, first ? 3000 : 0)));
  it("asserts", () => { expect(1 + 1).toBe(2); });
});
`,
      });
      const result = cli(root, []);
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(readFileSync(join(root, "loads"), "utf8")).toBe("load\nload\n");
      expect(result.stdout).toContain("::warning title=flaky test::flaky.test.mjs: timed out once, passed on re-run");
      expect(result.summary).toContain("flaky.test.mjs");
    },
    CLI_MS,
  );

  it(
    "runs an assertion failure once and exits 1",
    () => {
      const root = project("red", {
        "red.test.mjs": `import { appendFileSync } from "node:fs";
import { it, expect } from "vitest";
appendFileSync(new URL("./loads", import.meta.url), "load\\n");
it("fails", () => { expect(29).toBe(30); });
`,
      });
      const result = cli(root, []);
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
      expect(readFileSync(join(root, "loads"), "utf8")).toBe("load\n");
      expect(result.stdout).not.toContain("flaky test");
      expect(result.stderr).toContain("no re-run");
      expect(result.summary).toBe("");
    },
    CLI_MS,
  );
});
