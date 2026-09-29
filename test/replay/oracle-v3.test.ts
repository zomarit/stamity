import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { PASS_IDS, applyPatch, createReplayFixture, dataDirOf, fixtureOptionsOf } from "../../scripts/replay/fixture.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { applyOraclePatch, runOracles } from "../../scripts/replay/oracle.mjs";

/**
 * REPLAY-v3's hidden oracles over its two chains (plan 012, v3-fixture). A file of its own, so
 * `oracle.test.ts` and `oracle-v2.test.ts` stay v1's and v2's alone.
 *
 * The trees are built the way a v3 run meets them: the fixture's S0 under the v3 options, then every
 * pass applied with `git apply --3way` from `vendor/contrib/`, holding the clean patch (the clean
 * end) or, swapped in first, the seeded one (the seeded end).
 *
 * The default half is git only: the oracle and reference-fix patches against the seeded end, and
 * the static oracles, which spawn no vitest. The `STAMITY_REPLAY_SUITE=1` half runs the twelve
 * oracles: every one red on the seeded end, every one green after the reference fixes, and each red
 * on the clean end only when its own seed alone is injected; then criterion 35's two checks on the
 * clean end. `cor-invoice-eacces`'s oracle needs a file the process cannot read, which neither
 * Windows nor root can make, so there it is left out of every run and its own case is skipped.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const V3 = dataDirOf("v3") as string;
const ORACLES_PATCH = join(V3, "oracle", "oracles.patch");
const FIXES_PATCH = join(V3, "oracle", "reference-fixes.patch");
const VITEST_ENTRY = join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs");
const REPLAY_SUITE = process.env["STAMITY_REPLAY_SUITE"] === "1";
const PASSES = PASS_IDS as readonly string[];

/** Windows and root read a mode-000 file, so the unreadable invoice `cor-invoice-eacces` asks about cannot be made there. */
const EACCES_UNENFORCEABLE = process.platform === "win32" || process.getuid?.() === 0;
const EACCES_REASON = "skipped on Windows and as root: neither can make a file the process cannot read";

type Oracle = { kind: "vitest"; file: string } | { kind: "static"; file: string; mustMatch: string[]; mustNotMatch: string[] };

interface Seed {
  id: string;
  class: string;
  file: string;
  oracle: Oracle;
  injection: { file: string; find: string; replace: string };
}

interface Run {
  run: { status: string; detail: string };
  results: { seed: string; status: "pass" | "fail" | "error"; detail: string }[];
}

const SEEDS = (JSON.parse(readFileSync(join(V3, "seeds.json"), "utf8")) as { seeds: Seed[] }).seeds;
const BEHAVIOUR = SEEDS.filter((seed) => seed.oracle.kind === "vitest");
const STATIC = SEEDS.filter((seed) => seed.oracle.kind === "static");
/** The seeds whose oracles this platform can run. */
const RUNNABLE = EACCES_UNENFORCEABLE ? SEEDS.filter((seed) => seed.id !== "cor-invoice-eacces") : SEEDS;

let root: string;
let cleanGlobal: string;

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "stamity-replay-oracle-v3-")));
  cleanGlobal = join(root, "empty.gitconfig");
  writeFileSync(cleanGlobal, "", "utf8");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: cleanGlobal, GIT_CONFIG_NOSYSTEM: "1" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT"]) delete env[key];
  return env;
}

/** `git apply --check`, under an empty global config and no system config, so no operator setting decides it. */
function applyCheck(dir: string, patch: string): void {
  // Exits non-zero (and execFileSync throws with git's output) on any hunk that does not apply.
  execFileSync("git", ["-c", "core.autocrlf=false", "apply", "--check", "--whitespace=nowarn", patch], { cwd: dir, env: gitEnv(), stdio: ["ignore", "pipe", "pipe"] });
}

/** A fresh v3 fixture with every pass applied from `vendor/contrib/`, swapped to its seeded bytes first when `seeded`. */
function chainTree(seeded: boolean, depsLink?: string): string {
  const built = createReplayFixture({ out: root, v1Dir: V3, units: PASS_IDS, setup: false, install: false, ...fixtureOptionsOf("v3"), ...(depsLink ? { depsLink } : {}) }) as { dir: string };
  for (const id of PASSES) {
    const patch = join(built.dir, "vendor", "contrib", `${id}.patch`);
    if (seeded) writeFileSync(patch, readFileSync(join(V3, "patches-seeded", `${id}.patch`)));
    applyPatch(built.dir, patch, { threeWay: true });
  }
  return built.dir;
}

/** One seed's injection over the tree at `dir` (`find` → `replace`, once); returns the file's text before it. */
function inject(dir: string, seed: Seed): string {
  const path = join(dir, ...seed.injection.file.split("/"));
  const text = readFileSync(path, "utf8");
  expect(text.split(seed.injection.find).length - 1, `${seed.id}: injection.find occurrences`).toBe(1);
  writeFileSync(path, text.replace(seed.injection.find, () => seed.injection.replace), "utf8");
  return text;
}

const statuses = (run: Run) => Object.fromEntries(run.results.map((result) => [result.seed, result.status]));
const every = (seeds: readonly Seed[], status: string) => Object.fromEntries(seeds.map((seed) => [seed.id, status]));

/** The `diff --git` paths of a patch, and how many of them it creates. */
function patchFiles(path: string): { files: string[]; created: number } {
  const text = readFileSync(path, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/\1$/gm)].map((match) => match[1] as string);
  return { files, created: (text.match(/^new file mode 100644$/gm) ?? []).length };
}

describe("the v3 oracle patches", () => {
  let seededEnd: string;

  beforeAll(() => {
    seededEnd = chainTree(true);
  }, 60_000);

  it("both apply to the seeded end with git apply --check", () => {
    applyCheck(seededEnd, ORACLES_PATCH);
    applyCheck(seededEnd, FIXES_PATCH);
  });

  it("carry one oracle file per behaviour seed beside the harness and the run's own config, all new, and nothing else", () => {
    expect(BEHAVIOUR).toHaveLength(8);
    const { files, created } = patchFiles(ORACLES_PATCH);
    expect(files.toSorted()).toEqual(["test/__oracle__/harness.ts", "test/__oracle__/vitest.config.ts", ...BEHAVIOUR.map((seed) => seed.oracle.file)].toSorted());
    expect(created).toBe(files.length);
    for (const seed of BEHAVIOUR) expect(seed.oracle.file, seed.id).toBe(`test/__oracle__/${seed.id}.test.ts`);
  });

  it("fix every seed's file with an edit and add no file, so the fixes carry no oracle", () => {
    const { files, created } = patchFiles(FIXES_PATCH);
    expect(created).toBe(0);
    expect(files.toSorted()).toEqual([...new Set(SEEDS.map((seed) => seed.file))].toSorted());
  });

  it("compile every static pattern, and the static oracles read fail on the seeded end, pass on the clean end and after the fixes", () => {
    expect(STATIC.map((seed) => seed.id)).toEqual(["tw-sort-fallback-vacuous", "tw-count-loose", "tw-event-at-truthy", "con-export-doc-header"]);
    for (const seed of STATIC) {
      if (seed.oracle.kind !== "static") continue;
      expect(seed.oracle.mustMatch.length + seed.oracle.mustNotMatch.length, seed.id).toBeGreaterThan(0);
      for (const source of [...seed.oracle.mustMatch, ...seed.oracle.mustNotMatch]) expect(() => new RegExp(source), source).not.toThrow();
    }
    // Static seeds only: the runner spawns no vitest, so this half needs no dependencies.
    expect(statuses(runOracles(seededEnd, { seeds: STATIC }) as Run)).toEqual(every(STATIC, "fail"));
    expect(statuses(runOracles(chainTree(false), { seeds: STATIC }) as Run)).toEqual(every(STATIC, "pass"));
    const fixed = chainTree(true);
    applyPatch(fixed, FIXES_PATCH);
    expect(statuses(runOracles(fixed, { seeds: STATIC }) as Run)).toEqual(every(STATIC, "pass"));
  }, 60_000);
});

describe.skipIf(!REPLAY_SUITE)("the v3 oracles in real fixtures (set STAMITY_REPLAY_SUITE=1 to run)", () => {
  const deps = join(REPO_ROOT, "node_modules");
  let seeded: string;
  let clean: string;

  beforeAll(() => {
    seeded = chainTree(true, deps);
    applyOraclePatch(seeded, ORACLES_PATCH);
    clean = chainTree(false, deps);
    applyOraclePatch(clean, ORACLES_PATCH);
  }, 120_000);

  const run = (dir: string, seeds: readonly Seed[] = RUNNABLE) => runOracles(dir, { seeds, vitestEntry: VITEST_ENTRY }) as Run;

  // The cases run in file order over two shared trees: the seeded end, then its fixes; the clean end.
  it(
    "reports every oracle fails on the seeded end, none errors",
    () => {
      const result = run(seeded);
      expect(result.run).toEqual({ status: "ok", detail: "" });
      expect(result.results).toHaveLength(RUNNABLE.length);
      expect(statuses(result), JSON.stringify(result.results, null, 2)).toEqual(every(RUNNABLE, "fail"));
    },
    180_000,
  );

  it(
    "reports every oracle passes once the reference fixes are applied to the seeded end",
    () => {
      applyPatch(seeded, FIXES_PATCH);
      const result = run(seeded);
      expect(result.run).toEqual({ status: "ok", detail: "" });
      expect(statuses(result), JSON.stringify(result.results, null, 2)).toEqual(every(RUNNABLE, "pass"));
    },
    180_000,
  );

  it(
    "fails each oracle on the clean end only when its own seed alone is injected",
    () => {
      const baseline = run(clean);
      expect(statuses(baseline), JSON.stringify(baseline.results, null, 2)).toEqual(every(RUNNABLE, "pass"));
      for (const seed of RUNNABLE) {
        const path = join(clean, ...seed.injection.file.split("/"));
        const before = inject(clean, seed);
        try {
          const result = run(clean);
          expect(statuses(result), `${seed.id} alone\n${JSON.stringify(result.results, null, 2)}`).toEqual({ ...every(RUNNABLE, "pass"), [seed.id]: "fail" });
        } finally {
          writeFileSync(path, before, "utf8");
        }
      }
    },
    900_000,
  );

  it.skipIf(EACCES_UNENFORCEABLE)(`reads cor-invoice-eacces fail on the seeded end and pass on the clean end (${EACCES_REASON})`, () => {
    const eacces = SEEDS.filter((seed) => seed.id === "cor-invoice-eacces");
    expect(eacces).toHaveLength(1);
    expect(statuses(run(clean, eacces))).toEqual({ "cor-invoice-eacces": "pass" });
    const path = join(clean, "src", "orders", "invoice.ts");
    const before = inject(clean, eacces[0] as Seed);
    try {
      expect(statuses(run(clean, eacces))).toEqual({ "cor-invoice-eacces": "fail" });
    } finally {
      writeFileSync(path, before, "utf8");
    }
  }, 180_000);

  it(
    "on the clean end, lists orders with equal created_at in one order on every call, and serves none of another order's invoice (criterion 35)",
    () => {
      const check = join(clean, "test", "__oracle__", "clean-end.test.ts");
      writeFileSync(
        check,
        [
          'import { writeFileSync } from "node:fs";',
          'import { join } from "node:path";',
          'import { afterEach, beforeEach, expect, it } from "vitest";',
          'import { loadHttp, order, type OracleApp } from "./harness.ts";',
          "",
          "const http = await loadHttp();",
          "let o: OracleApp;",
          "beforeEach(async () => {",
          "  o = await http.start();",
          "});",
          "afterEach(async () => {",
          "  await o.close();",
          "});",
          "",
          'it("lists two orders with equal created_at in the same order on every call", async () => {',
          '  for (const id of [3, 1, 2]) http.insertOrder(o.app.db, order(id, "2026-09-01T00:00:00Z"));',
          "  const ids = async (): Promise<number[]> =>",
          '    ((await (await http.get(o.app, "/orders?sort=created_at")).json()) as { orders: { id: number }[] }).orders.map((row) => row.id);',
          "  const first = await ids();",
          "  // docs/api.md: ties by id, largest first.",
          "  expect(first).toEqual([3, 2, 1]);",
          "  expect(await ids()).toEqual(first);",
          "  expect(await ids()).toEqual(first);",
          "});",
          "",
          'it("serves none of order 2\'s invoice bytes to a request for order 1\'s invoice naming 2.pdf", async () => {',
          '  http.insertOrder(o.app.db, order(1, "2026-09-01T00:00:00Z"));',
          '  http.insertOrder(o.app.db, order(2, "2026-09-02T00:00:00Z"));',
          '  writeFileSync(join(o.app.invoiceDir, "1.pdf"), "%PDF-1.7 the first order", "utf8");',
          '  writeFileSync(join(o.app.invoiceDir, "2.pdf"), "%PDF-1.7 the second order", "utf8");',
          '  const own = await http.get(o.app, "/orders/1/invoice");',
          "  expect(own.status).toBe(200);",
          '  expect(await own.text()).toContain("the first order");',
          '  const other = await http.get(o.app, "/orders/1/invoice?file=2.pdf");',
          "  expect(other.status).not.toBe(200);",
          '  expect(await other.text()).not.toContain("the second order");',
          "});",
          "",
        ].join("\n"),
        "utf8",
      );
      try {
        const result = spawnSync(
          process.execPath,
          [VITEST_ENTRY, "run", "test/__oracle__/clean-end.test.ts", "--root", clean, "--config", join(clean, "test", "__oracle__", "vitest.config.ts"), "--pool=threads"],
          { cwd: clean, encoding: "utf8", env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("VITEST") && key !== "NODE_V8_COVERAGE")), timeout: 120_000 },
        );
        const output = `${result.stdout}${result.stderr}`;
        expect(result.status, output).toBe(0);
        expect(output).toMatch(/Tests\s+2 passed \(2\)/);
      } finally {
        rmSync(check, { force: true });
      }
    },
    180_000,
  );
});
