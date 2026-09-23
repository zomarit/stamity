import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { createReplayFixture } from "../../scripts/replay/fixture.mjs";

/**
 * The replay's seeded service: `evals/replay/v1/patches/base.patch` (the service `replay-orders`
 * at S0) and, from the seed-patch unit on, the six pass patches and `seeds.json` that plant the
 * defects in it.
 *
 * The default suite is git only. The `STAMITY_REPLAY_SUITE=1` half builds a real fixture and runs
 * the service's own lint, typecheck and test gates in it — a child `npm` per gate, tens of seconds
 * in all, which is why it is opt-in.
 *
 * Every git call here runs with an empty global config and no system config, so the operator's own
 * settings (a whitespace fixer, a global hooks path) cannot decide whether a patch applies.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const V1 = join(REPO_ROOT, "evals", "replay", "v1");
const BASE_PATCH = join(V1, "patches", "base.patch");
const REPLAY_SUITE = process.env["STAMITY_REPLAY_SUITE"] === "1";

/** The files the base service carries, as the plan's r3 cell names them. */
const BASE_FILES = [
  ".gitignore",
  ".oxlintrc.json",
  "README.md",
  "config/service.json",
  "docs/api.md",
  "package.json",
  "src/auth/guard.ts",
  "src/config/load.ts",
  "src/events/audit.ts",
  "src/events/emitter.ts",
  "src/http/app.ts",
  "src/http/router.ts",
  "src/http/routes.ts",
  "src/orders/format.ts",
  "src/orders/handlers.ts",
  "src/reports/window.ts",
  "src/server.ts",
  "src/store/db.ts",
  "src/store/query.ts",
  "test/audit.test.ts",
  "test/config.test.ts",
  "test/handlers.test.ts",
  "test/helpers.ts",
  "test/query.test.ts",
  "test/window.test.ts",
  "tsconfig.json",
];

let root: string;
let cleanGlobal: string;

/**
 * The inherited variables that point git at another repository, index or object store, or inject
 * config ahead of the `-c` flags — the set `scripts/replay/fixture.mjs` strips. A run from a git
 * hook carries several, and any one of them would aim these calls at the caller's checkout.
 */
const REDIRECTING_GIT_ENV = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_TEMPLATE_DIR",
  "GIT_ATTR_SOURCE",
]);

function gitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (REDIRECTING_GIT_ENV.has(key) || /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(key)) delete env[key];
  }
  return { ...env, GIT_CONFIG_GLOBAL: cleanGlobal, GIT_CONFIG_NOSYSTEM: "1" };
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "init.defaultBranch=main", "-c", "core.autocrlf=false", ...args], {
    cwd,
    encoding: "utf8",
    env: gitEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** A fresh, empty repository under the suite's temp root. */
function emptyRepo(name: string): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "--quiet", "--template="]);
  return dir;
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "stamity-replay-seeds-"));
  cleanGlobal = join(root, "empty.gitconfig");
  writeFileSync(cleanGlobal, "", "utf8");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

describe("base.patch", () => {
  it("applies with git apply --check to an empty repository, creating only new files", () => {
    expect(existsSync(BASE_PATCH), BASE_PATCH).toBe(true);
    const dir = emptyRepo("check");
    // `--check` exits non-zero (and execFileSync throws) on any hunk that does not apply.
    git(dir, ["apply", "--check", BASE_PATCH]);
    const patch = readFileSync(BASE_PATCH, "utf8");
    const headers = [...patch.matchAll(/^diff --git a\/(\S+) b\/\1$/gm)].map((match) => match[1]);
    expect(headers.toSorted()).toEqual(BASE_FILES);
    // One `new file mode` line per file: the patch creates the service, it edits nothing.
    expect(patch.match(/^new file mode 100644$/gm)).toHaveLength(BASE_FILES.length);
  });

  it("pins the service's dev dependencies to the versions this checkout has installed", () => {
    const dir = emptyRepo("pins");
    git(dir, ["apply", "--whitespace=nowarn", BASE_PATCH]);
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      type: string;
      scripts: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies: Record<string, string>;
      engines: Record<string, string>;
    };
    expect(manifest.type).toBe("module");
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.scripts).toMatchObject({ test: "vitest run", typecheck: "tsc --noEmit", lint: "oxlint" });
    expect(manifest.engines).toEqual({ node: ">=22.13" });
    // The fixture links this checkout's node_modules in tests, so the service must compile and run
    // against exactly these versions; an unpinned range would let the two drift apart unseen.
    const installed = Object.fromEntries(
      Object.keys(manifest.devDependencies).map((name) => [
        name,
        (JSON.parse(readFileSync(join(REPO_ROOT, "node_modules", name, "package.json"), "utf8")) as { version: string }).version,
      ]),
    );
    expect(Object.keys(manifest.devDependencies).toSorted()).toEqual(["@types/node", "oxlint", "typescript", "vitest"]);
    expect(manifest.devDependencies).toEqual(installed);
    // The documented defaults and the config file agree at S0 (the config-default seed moves one).
    expect(JSON.parse(readFileSync(join(dir, "config", "service.json"), "utf8"))).toEqual({
      pageSizeDefault: 20,
      maxPageSize: 100,
      retentionDays: 30,
    });
  });
});

describe.skipIf(!REPLAY_SUITE)("base — the service's own gates (set STAMITY_REPLAY_SUITE=1 to run)", () => {
  it(
    "builds a fixture from the base alone with lint, typecheck and test all green",
    () => {
      // A v1 directory holding the real base patch and a plan template with no units: this case
      // proves the base, so the pass patches and the plan the seed unit adds stay out of it.
      const v1Dir = join(root, "v1-base-only");
      mkdirSync(join(v1Dir, "patches"), { recursive: true });
      mkdirSync(join(v1Dir, "plan"), { recursive: true });
      copyFileSync(BASE_PATCH, join(v1Dir, "patches", "base.patch"));
      writeFileSync(
        join(v1Dir, "plan", "001-replay.md"),
        ["---", "id: replay", "stamp: {{STAMP}}", "---", "", "# Replay", "", "## Units", ""].join("\n"),
        "utf8",
      );
      const result = createReplayFixture({
        out: root,
        v1Dir,
        units: [],
        setup: false,
        depsLink: join(REPO_ROOT, "node_modules"),
        runGates: true,
      }) as { gates: Record<"lint" | "typecheck" | "test", { exitCode: number | null; output: string }> };
      const { lint, typecheck, test } = result.gates;
      expect(lint.exitCode, lint.output).toBe(0);
      // Not "Found 0 warnings": oxlint prints no summary at all when it detects an agent
      // (`AI_AGENT`), so the summary is environment-dependent. A diagnostic line in either format
      // names its severity as a singular word, which a clean run never prints.
      expect(lint.output).not.toMatch(/\b(?:warning|error)\b/i);
      expect(typecheck.exitCode, typecheck.output).toBe(0);
      expect(test.exitCode, test.output).toBe(0);
      // Five test files ran and every test passed: a runner that found nothing exits 1, but a
      // count is what separates "the service's tests ran" from "some test file ran".
      expect(test.output).toMatch(/Test Files\s+5 passed \(5\)/);
      // Read from vitest's summary lines only: the service's own tests log to stderr, and a
      // logged word must not decide the verdict.
      expect(test.output).toMatch(/Tests\s+\d+ passed \(\d+\)/);
      expect(test.output).not.toMatch(/^\s*(?:Test Files|Tests)\s[^\n]*\b(?:failed|skipped)\b/m);
    },
    180_000,
  );
});
