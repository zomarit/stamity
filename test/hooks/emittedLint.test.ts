/**
 * Every script setup emits into a user's repository passes that repository's
 * own lint gate (REQ-FLOW-001).
 *
 * The generated scripts are byte-governed product output, written for Node and
 * never shaped to a user's lint configuration — so each one opens with a
 * file-level disable directive, right after the shebang where it has one. This
 * suite lints the REAL emitted tree of an all-four-client golden repository
 * under the stock recommended flat config with no Node globals (the config a
 * user most plausibly has and the one most hostile to a Node script), and
 * proves the header is what makes it pass by linting the same text without it.
 */
import js from "@eslint/js";
import { ESLint } from "eslint";
import globals from "globals";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TOOLS } from "../../src/types/core.ts";
import { GENERATED_SCRIPT_LINT_DIRECTIVE } from "../../src/types/markers.ts";
import { emittedPaths, makeGoldenRepo, readEmittedTree, type GoldenRepo } from "../emit/goldenFixture.ts";

/** Same derivation as the golden suites' fixture budget (`test/emit/crossClientGoldens.test.ts`). */
const GOLDEN_FIXTURE_TIMEOUT_MS = 120_000;

/** Linting ~20 scripts twice over is well inside this; the default 20s is sized for a CLI spawn. */
const LINT_TIMEOUT_MS = 60_000;

const SHEBANG = "#!/usr/bin/env node";
const SCRIPT_EXTENSION = /\.(?:mjs|cjs|js)$/;
const SKILL_SCRIPT_SUFFIX = "/st-verify/scripts/spec-plan-coverage.mjs";
const UNUSED_DIRECTIVE = /^Unused eslint-disable directive/;

/**
 * The stock recommended set, no Node globals, no ignore rule for the emitted
 * paths — the fixture REQ-FLOW-001 names. `overrideConfigFile: true` keeps any
 * config file on the machine out of the run.
 */
function stockLinter(cwd: string): ESLint {
  return new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [
      {
        ...js.configs.recommended,
        files: ["**/*.{js,mjs,cjs}"],
        languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: {} },
      },
    ],
  });
}

/**
 * The same set with Node's built-in globals declared: the user config where no
 * recommended rule may fire, so the blanket directive can read as unused. ESLint
 * 10's default `reportUnusedDisableDirectives` is `warn`, which a
 * `--max-warnings 0` project turns into a failure (this plan's Risks row).
 */
function nodeGlobalsLinter(cwd: string): ESLint {
  return new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [
      {
        ...js.configs.recommended,
        files: ["**/*.{js,mjs,cjs}"],
        languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: globals.nodeBuiltin },
      },
    ],
  });
}

/**
 * One lint result per script, in the order given. The runs are independent, so
 * they go out together rather than one await at a time.
 */
async function lintEach(
  linter: ESLint,
  rootDir: string,
  entries: readonly (readonly [path: string, text: string])[],
): Promise<(readonly [string, ESLint.LintResult])[]> {
  const results = await Promise.all(
    entries.map(([path, text]) => linter.lintText(text, { filePath: `${rootDir}/${path}` })),
  );
  return entries.map(([path], index) => {
    const result = results[index]?.[0];
    if (result === undefined) throw new Error(`ESLint returned no result for ${path}`);
    return [path, result] as const;
  });
}

/** The emitted text with the directive line taken out, and nothing else. */
function withoutDirective(content: string): string {
  return content
    .split("\n")
    .filter((line) => line !== GENERATED_SCRIPT_LINT_DIRECTIVE)
    .join("\n");
}

describe("emitted scripts pass the project's own lint gate (REQ-FLOW-001)", () => {
  let repo: GoldenRepo;
  let tree: Record<string, string>;
  let scripts: string[];

  beforeAll(async () => {
    repo = await makeGoldenRepo({ tools: TOOLS });
    tree = await readEmittedTree(repo.rootDir);
    scripts = emittedPaths(tree).filter((path) => SCRIPT_EXTENSION.test(path));
  }, GOLDEN_FIXTURE_TIMEOUT_MS);

  // Guarded: a failed setup hook reports itself, not a `cleanup` of undefined.
  afterAll(async () => {
    await repo?.cleanup();
  }, GOLDEN_FIXTURE_TIMEOUT_MS);

  it("the checked set is derived from the tree and reaches every emitter", () => {
    // Every client's hook tree, Cursor's guards and both skill-script copies are
    // present, so a builder that stopped emitting would shrink a group to zero
    // rather than slip past a typed total.
    for (const tool of TOOLS) {
      const hookScripts = scripts.filter((path) => path.startsWith(`.stamity/generated/hooks/${tool}/`));
      expect(hookScripts.length, tool).toBeGreaterThanOrEqual(4);
    }
    expect(scripts.filter((path) => path.startsWith(".cursor/hooks/")).length).toBeGreaterThanOrEqual(2);
    expect(scripts.filter((path) => path.endsWith(SKILL_SCRIPT_SUFFIX)).length).toBe(2);
  });

  it("puts the directive on line 2 after a shebang, on line 1 otherwise", () => {
    for (const path of scripts) {
      const lines = tree[path]!.split("\n");
      if (lines[0] === SHEBANG) {
        expect(lines[1], path).toBe(GENERATED_SCRIPT_LINT_DIRECTIVE);
      } else {
        expect(lines[0], path).toBe(GENERATED_SCRIPT_LINT_DIRECTIVE);
      }
      // Once only: a second copy would mean a builder stacked the header.
      expect(lines.filter((line) => line === GENERATED_SCRIPT_LINT_DIRECTIVE), path).toHaveLength(1);
    }
    // Every hook-tree and guard script opens with the shebang; only the skill script has none.
    for (const path of scripts.filter((p) => !p.endsWith(SKILL_SCRIPT_SUFFIX))) {
      expect(tree[path]!.startsWith(`${SHEBANG}\n${GENERATED_SCRIPT_LINT_DIRECTIVE}\n`), path).toBe(true);
    }
  });

  it(
    "lints every emitted script clean under the stock config with no Node globals",
    async () => {
      const linted = await lintEach(
        stockLinter(repo.rootDir),
        repo.rootDir,
        scripts.map((path) => [path, tree[path]!] as const),
      );
      for (const [path, result] of linted) {
        const messages = result.messages.map((m) => `${m.line}:${m.ruleId ?? "fatal"} ${m.message}`).join("; ");
        expect(result.errorCount, `${path}: ${messages}`).toBe(0);
        expect(result.fatalErrorCount, `${path}: ${messages}`).toBe(0);
      }
    },
    LINT_TIMEOUT_MS,
  );

  it(
    "fails the same config once the directive is removed, so the header does the work",
    async () => {
      const linted = await lintEach(
        stockLinter(repo.rootDir),
        repo.rootDir,
        scripts.map((path) => [path, withoutDirective(tree[path]!)] as const),
      );
      const failing = linted.filter(([, result]) => result.errorCount > 0).map(([path]) => path);
      // A hook script is the one that must fail: it reaches for `process` and
      // Node's timers, which the stock config does not declare.
      expect(failing.some((path) => path.startsWith(".stamity/generated/hooks/"))).toBe(true);
    },
    LINT_TIMEOUT_MS,
  );

  it(
    "records the unused-directive warnings a Node-globals config draws",
    async () => {
      const linted = await lintEach(
        nodeGlobalsLinter(repo.rootDir),
        repo.rootDir,
        scripts.map((path) => [path, tree[path]!] as const),
      );
      const unused: string[] = [];
      for (const [path, result] of linted) {
        // No error on any script, and the only warning a script can carry is the
        // one unused-directive report for its own header.
        expect(result.errorCount, path).toBe(0);
        const warnings = result.messages.filter((m) => m.severity === 1);
        expect(warnings.length, path).toBeLessThanOrEqual(1);
        for (const warning of warnings) {
          expect(warning.message, path).toMatch(UNUSED_DIRECTIVE);
          unused.push(path);
        }
      }
      // The residual of REQ-FLOW-001's edge case (1), measured rather than
      // assumed: every script whose body trips no recommended rule once Node's
      // globals are declared draws exactly one warning at ESLint 10's default
      // `reportUnusedDisableDirectives: "warn"`. A `--max-warnings 0` project
      // fails on each. Measured 2026-09-30 on the four-client golden tree: the
      // two skill-script copies and the three portable runners (codex, copilot,
      // cursor); every core hook script and both Cursor guards still trip a
      // recommended rule under Node globals, so their directive is used. The
      // figure moves when a script starts or stops tripping a rule.
      expect(unused.length, unused.join(", ")).toBe(MEASURED_UNUSED_DIRECTIVE_WARNINGS);
    },
    LINT_TIMEOUT_MS,
  );
});

/** Measured on the all-four-client golden tree (plan 013 Risks row: the lint header's unused-directive warning). */
const MEASURED_UNUSED_DIRECTIVE_WARNINGS = 5;
