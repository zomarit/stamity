import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { PASS_IDS, applyPatch, createReplayFixture } from "../../scripts/replay/fixture.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { ORACLE_SCHEMA, applyOraclePatch, runOracles } from "../../scripts/replay/oracle.mjs";

/**
 * The replay's hidden oracles (`scripts/replay/oracle.mjs`): the oracle patch, the reference fixes,
 * and the runner that says for each seed whether its defect is still in a tree.
 *
 * The default suite is git only, plus a stand-in vitest CLI for the runner's report reading. The
 * `STAMITY_REPLAY_SUITE=1` half runs the real oracles in a real fixture: every one red on the pure
 * seeded tree, every one green once the reference fixes are applied — each oracle seen red, then
 * green — and the service's own gates green over the fixed tree with the oracles in it.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const V1 = join(REPO_ROOT, "evals", "replay", "v1");
const ORACLES_PATCH = join(V1, "oracle", "oracles.patch");
const FIXES_PATCH = join(V1, "oracle", "reference-fixes.patch");
const VITEST_ENTRY = join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs");
const REPLAY_SUITE = process.env["STAMITY_REPLAY_SUITE"] === "1";
const PASSES = PASS_IDS as readonly string[];

type Oracle = { kind: "vitest"; file: string } | { kind: "static"; file: string; mustMatch: string[]; mustNotMatch: string[] };

interface Seed {
  id: string;
  class: string;
  file: string;
  oracle: Oracle;
}

interface Result {
  seed: string;
  kind: string;
  status: "pass" | "fail" | "error";
  detail: string;
}

interface Run {
  schema: string;
  run: { status: "ok" | "no-report" | "killed" | "failed-to-start"; detail: string };
  results: Result[];
}

const SEEDS = (JSON.parse(readFileSync(join(V1, "seeds.json"), "utf8")) as { seeds: Seed[] }).seeds;
const BEHAVIOUR = SEEDS.filter((seed) => seed.oracle.kind === "vitest");
const STATIC = SEEDS.filter((seed) => seed.oracle.kind === "static");

let root: string;
let cleanGlobal: string;

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "stamity-replay-oracle-")));
  cleanGlobal = join(root, "empty.gitconfig");
  writeFileSync(cleanGlobal, "", "utf8");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

/** `git apply --check`, under an empty global config and no system config, so no operator setting decides it. */
function applyCheck(dir: string, patch: string): void {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: cleanGlobal, GIT_CONFIG_NOSYSTEM: "1" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT"]) {
    delete env[key];
  }
  // Exits non-zero (and execFileSync throws with git's output) on any hunk that does not apply.
  execFileSync("git", ["-c", "core.autocrlf=false", "apply", "--check", "--whitespace=nowarn", patch], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
}

/** A fresh fixture at S0: the base service, the pass patches under vendor/contrib, the plan. */
function baseTree(depsLink?: string): string {
  const built = createReplayFixture({ out: root, units: PASS_IDS, setup: false, install: false, ...(depsLink ? { depsLink } : {}) }) as { dir: string };
  return built.dir;
}

/** A fresh fixture with every pass applied in chain order: the pure seeded tree. */
function seededTree(depsLink?: string): string {
  const dir = baseTree(depsLink);
  for (const id of PASSES) applyPatch(dir, join(dir, "vendor", "contrib", `${id}.patch`), { threeWay: true });
  return dir;
}

const statuses = (run: Run) => Object.fromEntries(run.results.map((result) => [result.seed, result.status]));

/** The `diff --git` paths of a patch, and how many of them it creates. */
function patchFiles(path: string): { files: string[]; created: number } {
  const text = readFileSync(path, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/\1$/gm)].map((match) => match[1] as string);
  return { files, created: (text.match(/^new file mode 100644$/gm) ?? []).length };
}

describe("the oracle patches", () => {
  let seeded: string;

  beforeAll(() => {
    seeded = seededTree();
  });

  it("both apply to the pure seeded tree with git apply --check", () => {
    applyCheck(seeded, ORACLES_PATCH);
    applyCheck(seeded, FIXES_PATCH);
  });

  it("carry one oracle file per behaviour seed beside the harness and the run's own config, all new, and nothing else", () => {
    expect(BEHAVIOUR).toHaveLength(9);
    const { files, created } = patchFiles(ORACLES_PATCH);
    expect(files.toSorted()).toEqual(["test/__oracle__/harness.ts", "test/__oracle__/vitest.config.ts", ...BEHAVIOUR.map((seed) => seed.oracle.file)].toSorted());
    expect(created).toBe(files.length);
    for (const seed of BEHAVIOUR) expect(seed.oracle.file, seed.id).toBe(`test/__oracle__/${seed.id}.test.ts`);
  });

  it("fix every seed's file with an edit and add no file, so the fixes carry no oracle", () => {
    const { files, created } = patchFiles(FIXES_PATCH);
    expect(created).toBe(0);
    for (const seed of SEEDS) expect(files, seed.id).toContain(seed.file);
    expect(files.filter((file) => file.includes("__oracle__"))).toEqual([]);
  });

  it("compile every static pattern, and the static oracles read fail on the seeded tree, pass on the base and after the fixes", () => {
    expect(STATIC.map((seed) => seed.class)).toEqual(["test-weakening", "test-weakening", "test-weakening"]);
    for (const seed of STATIC) {
      if (seed.oracle.kind !== "static") continue;
      for (const source of [...seed.oracle.mustMatch, ...seed.oracle.mustNotMatch]) expect(() => new RegExp(source), source).not.toThrow();
    }
    // Static seeds only: the runner spawns no vitest, so this half needs no dependencies.
    const onSeeded = runOracles(seeded, { seeds: STATIC }) as Run;
    expect(onSeeded.schema).toBe(ORACLE_SCHEMA);
    expect(onSeeded.run).toEqual({ status: "ok", detail: "no behaviour oracle to run; vitest not started" });
    expect(statuses(onSeeded)).toEqual(Object.fromEntries(STATIC.map((seed) => [seed.id, "fail"])));
    expect(statuses(runOracles(baseTree(), { seeds: STATIC }) as Run)).toEqual(Object.fromEntries(STATIC.map((seed) => [seed.id, "pass"])));
    const fixed = seededTree();
    applyPatch(fixed, FIXES_PATCH);
    expect(statuses(runOracles(fixed, { seeds: STATIC }) as Run)).toEqual(Object.fromEntries(STATIC.map((seed) => [seed.id, "pass"])));
  });
});

// ---------------------------------------------------------------------------------------------
// How the runner reads a vitest report. The vitest CLI here is a stand-in script: the real one
// needs a service tree with its dependencies and seconds per spawn, and what is under test is the
// classification of the report it writes — the real run is proven in the STAMITY_REPLAY_SUITE half.

/**
 * Write a stand-in vitest CLI that records its argv and whether it saw a `VITEST*` variable, then
 * writes `report` to `--outputFile` (or, for `null`, writes nothing and exits 3 after printing a line;
 * for `"hang"`, never exits; for any other string, writes that text as it is).
 */
function fakeVitest(name: string, report: unknown): { entry: string; seen: string } {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  const entry = join(dir, "vitest.mjs");
  const seen = join(dir, "seen.json");
  const body =
    report === "hang"
      ? "setInterval(() => {}, 1000)\n"
      : report === null
        ? "process.stdout.write('boom: the runner crashed\\n')\nprocess.exit(3)\n"
        : `writeFileSync(argv[argv.indexOf('--outputFile') + 1], ${JSON.stringify(typeof report === "string" ? report : JSON.stringify(report))})\nprocess.exit(1)\n`;
  writeFileSync(
    entry,
    [
      "import { writeFileSync } from 'node:fs'",
      "const argv = process.argv.slice(2)",
      `writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ argv, cwd: process.cwd(), vitestEnv: Object.keys(process.env).filter((key) => key.startsWith('VITEST')) }))`,
      body,
    ].join("\n"),
    "utf8",
  );
  return { entry, seen };
}

const vitestSeed = (id: string): Seed => ({ id, class: "correctness", file: `src/${id}.ts`, oracle: { kind: "vitest", file: `test/__oracle__/${id}.test.ts` } });

/** Where the oracle patch puts the run's own vitest config, which the runner passes with `--config`. */
const ORACLE_CONFIG = join("test", "__oracle__", "vitest.config.ts");

describe("runOracles — reading the report", () => {
  let tree: string;

  beforeAll(() => {
    tree = join(root, "tree");
    mkdirSync(join(tree, "test", "__oracle__"), { recursive: true });
    mkdirSync(join(tree, "test", "nested"), { recursive: true });
    writeFileSync(join(tree, ORACLE_CONFIG), "export default {};\n", "utf8");
    writeFileSync(join(tree, "test", "weak.test.ts"), 'it("x", () => { expect(value).toBe(true); });\n', "utf8");
  });

  const at = (id: string) => join(tree, "test", "__oracle__", `${id}.test.ts`);

  it("classifies passed, failed, unloaded, skipped-only, absent and could-not-say oracle files, and runs the CLI as specified", () => {
    const long = `AssertionError: ${"x".repeat(400)} at ${at("long")}`;
    const report = {
      testResults: [
        { name: at("green"), status: "passed", message: "", assertionResults: [{ status: "passed", title: "t", failureMessages: [] }] },
        {
          name: at("red"),
          status: "failed",
          message: "",
          assertionResults: [{ status: "failed", title: "refuses it", failureMessages: [`AssertionError: expected 200 to be 401\n    at ${at("red")}:9:1`] }],
        },
        { name: at("unloaded"), status: "failed", message: "oracle seam: src/reports/window.ts no longer exports isWithin()", assertionResults: [] },
        { name: at("skipped"), status: "passed", message: "", assertionResults: [{ status: "skipped", title: "t", failureMessages: [] }] },
        { name: at("long"), status: "failed", message: "", assertionResults: [{ status: "failed", title: "t", failureMessages: [long] }] },
        {
          name: at("pathy"),
          status: "failed",
          message: "",
          assertionResults: [{ status: "failed", title: "t", failureMessages: [`Error: ENOENT: no such file, open '${join(tree, "secret.txt")}'`] }],
        },
        // A beforeEach throw, as vitest 5.0.1 reports it (measured): the test reads failed, the hook's
        // error comes first, and the afterEach's error on the never-started app follows it.
        {
          name: at("nostart"),
          status: "failed",
          message: "",
          assertionResults: [
            {
              status: "failed",
              title: "t",
              failureMessages: [
                `Error: oracle precondition: the app did not start: listen EADDRINUSE\n    at ${at("nostart")}:10:3`,
                `TypeError: Cannot read properties of undefined (reading 'close')\n    at ${at("nostart")}:14:3`,
              ],
            },
          ],
        },
        // A precondition inside the test body.
        {
          name: at("unmet"),
          status: "failed",
          message: "",
          assertionResults: [{ status: "failed", title: "t", failureMessages: ["Error: oracle precondition: GET /orders answered 404, not 200\n    at x:1:1"] }],
        },
      ],
    };
    const { entry, seen } = fakeVitest("classify", report);
    const seeds = ["green", "red", "unloaded", "skipped", "absent", "long", "pathy", "nostart", "unmet"].map(vitestSeed);
    const decoy = { id: "decoy", file: "src/x.ts" };
    // The parent is a vitest run, so the child would inherit its variables unless the runner drops them.
    expect(Object.keys(process.env).some((key) => key.startsWith("VITEST"))).toBe(true);
    const run = runOracles(tree, { seeds: [...seeds, decoy], vitestEntry: entry }) as Run;
    expect(run.schema).toBe("stamity/replay-oracle/v1");
    expect(run.run).toEqual({ status: "ok", detail: "" });
    expect(run.results.map((result) => result.seed)).toEqual(["green", "red", "unloaded", "skipped", "absent", "long", "pathy", "nostart", "unmet"]);
    expect(statuses(run)).toEqual({
      green: "pass",
      red: "fail",
      unloaded: "error",
      skipped: "error",
      absent: "error",
      long: "fail",
      pathy: "fail",
      nostart: "error",
      unmet: "error",
    });
    const byId = new Map(run.results.map((result) => [result.seed, result]));
    expect(byId.get("red")?.detail).toBe("refuses it: AssertionError: expected 200 to be 401");
    expect(byId.get("unloaded")?.detail).toContain("oracle seam: src/reports/window.ts no longer exports isWithin()");
    expect(byId.get("nostart")?.detail).toBe("t: the oracle could not say: Error: oracle precondition: the app did not start: listen EADDRINUSE");
    expect(byId.get("unmet")?.detail).toBe("t: the oracle could not say: Error: oracle precondition: GET /orders answered 404, not 200");
    const longDetail = byId.get("long")?.detail as string;
    expect([...longDetail]).toHaveLength(300);
    expect(longDetail.endsWith("…")).toBe(true);
    // The tree's own path is labelled, never printed.
    expect(byId.get("pathy")?.detail).toBe(`t: Error: ENOENT: no such file, open '${join("<tree>", "secret.txt")}'`);
    for (const result of run.results) expect(result.detail, result.seed).not.toContain(tree);
    const { argv, cwd, vitestEnv } = JSON.parse(readFileSync(seen, "utf8")) as { argv: string[]; cwd: string; vitestEnv: string[] };
    // The run's own config, so a vitest config in the tree cannot narrow what the run collects.
    expect(argv.slice(0, 8)).toEqual(["run", "test/__oracle__", "--root", tree, "--config", join(tree, ORACLE_CONFIG), "--pool=threads", "--reporter=json"]);
    expect(argv[8]).toBe("--outputFile");
    expect(realpathSync(cwd)).toBe(tree);
    expect(vitestEnv).toEqual([]);
  });

  it("reports every behaviour oracle as an error, and the run's own status, when the run writes no report, times out or cannot start", () => {
    const seeds = [vitestSeed("a"), vitestSeed("b")];
    const crashed = runOracles(tree, { seeds, vitestEntry: fakeVitest("crash", null).entry }) as Run;
    expect(statuses(crashed)).toEqual({ a: "error", b: "error" });
    expect(crashed.run).toEqual({ status: "no-report", detail: "the oracle run exited 3 with no report: boom: the runner crashed" });
    expect(crashed.results[0]?.detail).toBe("the oracle run exited 3 with no report: boom: the runner crashed");
    const garbled = runOracles(tree, { seeds, vitestEntry: fakeVitest("garbled", "not json").entry }) as Run;
    expect(statuses(garbled)).toEqual({ a: "error", b: "error" });
    expect(garbled.run.status).toBe("no-report");
    expect(garbled.run.detail).toMatch(/^the oracle run's report is not JSON: /);
    const started = Date.now();
    const hung = runOracles(tree, { seeds, vitestEntry: fakeVitest("hang", "hang").entry, timeoutMs: 1_000 }) as Run;
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(statuses(hung)).toEqual({ a: "error", b: "error" });
    expect(hung.run.status).toBe("killed");
    expect(hung.results[0]?.detail).toMatch(/^the oracle run was killed by SIGKILL after \d+ ms \(limit 1000 ms\)$/);
    expect(hung.run.detail).toBe(hung.results[0]?.detail);
    const missing = runOracles(tree, { seeds, vitestEntry: join(root, "no-such-vitest.mjs") }) as Run;
    expect(statuses(missing)).toEqual({ a: "error", b: "error" });
    expect(missing.run.status).toBe("failed-to-start");
    // A tree without the oracle patch's config: the runner does not fall back to the tree's own.
    const bare = join(root, "bare");
    mkdirSync(join(bare, "test", "__oracle__"), { recursive: true });
    const { entry, seen } = fakeVitest("unconfigured", { testResults: [] });
    const unconfigured = runOracles(bare, { seeds, vitestEntry: entry }) as Run;
    expect(statuses(unconfigured)).toEqual({ a: "error", b: "error" });
    expect(unconfigured.run).toEqual({ status: "failed-to-start", detail: "no oracle config at test/__oracle__/vitest.config.ts in the tree: apply the oracle patch first" });
    expect(() => readFileSync(seen, "utf8")).toThrow(/ENOENT/);
  });

  it("reads a static oracle as error when its file is missing, its pattern does not compile or its path leaves the tree", () => {
    const statics: Seed[] = [
      { id: "held", class: "test-weakening", file: "test/weak.test.ts", oracle: { kind: "static", file: "test/weak.test.ts", mustMatch: ["toBe\\(true\\)"], mustNotMatch: ["\\.skip\\("] } },
      { id: "broken", class: "test-weakening", file: "test/weak.test.ts", oracle: { kind: "static", file: "test/weak.test.ts", mustMatch: ["toBeDefined"], mustNotMatch: [] } },
      { id: "missing", class: "test-weakening", file: "test/gone.test.ts", oracle: { kind: "static", file: "test/gone.test.ts", mustMatch: ["x"], mustNotMatch: [] } },
      { id: "badre", class: "test-weakening", file: "test/weak.test.ts", oracle: { kind: "static", file: "test/weak.test.ts", mustMatch: ["("], mustNotMatch: [] } },
      { id: "outside", class: "test-weakening", file: "../x.ts", oracle: { kind: "static", file: "../x.ts", mustMatch: ["x"], mustNotMatch: [] } },
    ];
    const run = runOracles(tree, { seeds: statics }) as Run;
    expect(statuses(run)).toEqual({ held: "pass", broken: "fail", missing: "error", badre: "error", outside: "error" });
    expect(run.results.find((result) => result.seed === "broken")?.detail).toBe("test/weak.test.ts: mustMatch /toBeDefined/ found no match");
  });
});

describe.skipIf(!REPLAY_SUITE)("the oracles in a real fixture (set STAMITY_REPLAY_SUITE=1 to run)", () => {
  const deps = join(REPO_ROOT, "node_modules");
  let tree: string;

  beforeAll(() => {
    tree = seededTree(deps);
    applyOraclePatch(tree, ORACLES_PATCH);
  });

  const run = () => runOracles(tree, { seeds: SEEDS, vitestEntry: VITEST_ENTRY }) as Run;

  // The cases share one tree and run in file order: seeded, then fixed, then a seam renamed, then
  // restored with a start-up failure, a precondition unmet and an agent's narrowing config in turn.
  it(
    "reports all twelve oracles fail on the pure seeded tree, none error",
    () => {
      const result = run();
      expect(result.run).toEqual({ status: "ok", detail: "" });
      expect(result.results).toHaveLength(12);
      expect(statuses(result), JSON.stringify(result.results, null, 2)).toEqual(Object.fromEntries(SEEDS.map((seed) => [seed.id, "fail"])));
    },
    180_000,
  );

  it(
    "reports all twelve pass once the reference fixes are applied",
    () => {
      applyPatch(tree, FIXES_PATCH);
      const result = run();
      expect(statuses(result), JSON.stringify(result.results, null, 2)).toEqual(Object.fromEntries(SEEDS.map((seed) => [seed.id, "pass"])));
    },
    180_000,
  );

  it(
    "keeps the service's own lint, typecheck and test green over the fixed tree with the oracles in it",
    () => {
      const npm = (args: string[]) => {
        const result = spawnSync("npm", args, { cwd: tree, encoding: "utf8", shell: process.platform === "win32" });
        return { exitCode: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}` };
      };
      const lint = npm(["run", "lint"]);
      expect(lint.exitCode, lint.output).toBe(0);
      const typecheck = npm(["run", "typecheck"]);
      expect(typecheck.exitCode, typecheck.output).toBe(0);
      const test = npm(["test"]);
      expect(test.exitCode, test.output).toBe(0);
      // The service's six test files and the nine oracles, nothing skipped.
      expect(test.output).toMatch(/Test Files\s+15 passed \(15\)/);
      expect(test.output).not.toMatch(/^\s*(?:Test Files|Tests)\s[^\n]*\b(?:failed|skipped)\b/m);
    },
    300_000,
  );

  it(
    "reports an oracle whose imported function was renamed as an error, never a pass",
    () => {
      const window = join(tree, "src", "reports", "window.ts");
      const text = readFileSync(window, "utf8");
      expect(text.match(/\bisWithin\b/g)?.length).toBeGreaterThan(1);
      writeFileSync(window, text.replaceAll(/\bisWithin\b/g, "isInsideWindow"), "utf8");
      const result = run().results.find((entry) => entry.seed === "cor-date-boundary");
      expect(result?.status).toBe("error");
      expect(result?.detail).toContain("oracle seam: src/reports/window.ts no longer exports isWithin()");
      writeFileSync(window, text, "utf8");
    },
    180_000,
  );

  /** Run the oracles with `path` (tree-relative) edited by `edit`, then put the file back. */
  const runEdited = (path: string, edit: (text: string) => string): Run => {
    const file = join(tree, path);
    const text = readFileSync(file, "utf8");
    const edited = edit(text);
    expect(edited, `the edit changed ${path}`).not.toBe(text);
    writeFileSync(file, edited, "utf8");
    try {
      return run();
    } finally {
      writeFileSync(file, text, "utf8");
    }
  };

  it(
    "reports an app that does not start as an error for every HTTP oracle, never a fail",
    () => {
      // A beforeEach throw, which vitest reports as a failed test: the harness names it a precondition.
      const result = runEdited("test/helpers.ts", (text) =>
        text.replace(/(export async function startApp\([^)]*\): Promise<Started> \{\n)/, '$1  throw new Error("the port is taken");\n'),
      );
      const http = new Set(["sec-sql-sort", "sec-missing-guard", "sec-path-traversal", "cor-page-offset", "cor-swallowed-error", "con-event-key", "con-wire-key"]);
      expect(statuses(result), JSON.stringify(result.results, null, 2)).toEqual(
        Object.fromEntries(SEEDS.map((seed) => [seed.id, http.has(seed.id) ? "error" : "pass"])),
      );
      for (const entry of result.results.filter((item) => http.has(item.seed))) {
        expect(entry.detail, entry.seed).toContain("oracle precondition: the app did not start: the port is taken");
      }
    },
    180_000,
  );

  it(
    "reports an unmet precondition inside a check as an error, never a fail",
    () => {
      // The recorder goes silent, so sec-sql-sort cannot say whether the sort value reaches the SQL.
      const result = runEdited("test/__oracle__/harness.ts", (text) => text.replace("sql.push(String(args[0]));", ""));
      expect(statuses(result), JSON.stringify(result.results, null, 2)).toEqual(
        Object.fromEntries(SEEDS.map((seed) => [seed.id, seed.id === "sec-sql-sort" ? "error" : "pass"])),
      );
      expect(result.results.find((entry) => entry.seed === "sec-sql-sort")?.detail).toContain("oracle precondition:");
    },
    180_000,
  );

  it(
    "collects every oracle through its own config when the tree carries a vitest config that narrows include",
    () => {
      const config = join(tree, "vitest.config.ts");
      writeFileSync(config, 'export default { test: { include: ["test/handlers.test.ts"] } };\n', "utf8");
      try {
        const result = run();
        expect(result.run).toEqual({ status: "ok", detail: "" });
        expect(statuses(result), JSON.stringify(result.results, null, 2)).toEqual(Object.fromEntries(SEEDS.map((seed) => [seed.id, "pass"])));
      } finally {
        rmSync(config, { force: true });
      }
    },
    180_000,
  );
});
