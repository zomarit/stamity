import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — the smoke is a plain .mjs script with no type declarations, and stays that
// way on purpose: it has to run beside an extracted package, on a machine with no TypeScript
// toolchain anywhere near it, exactly as `scripts/leak-gate.mjs` does. One line, because the
// directive covers the line that follows it and a wrapped import puts the specifier out of reach.
import { PRIMITIVE_CLASSES, readExpectedPrimitives, verifyDeployment } from "../../scripts/apm-install-smoke.mjs";
import {
  buildContentIndex,
  COMMAND_ID_PREFIX,
  type CatalogItem,
} from "../../src/content/catalog.ts";
import { type ContentClass } from "../../src/types/content.ts";
import { contentPrefixFor } from "../../src/types/markers.ts";

/**
 * The gate on the APM ROUTE — distinct from `apmPackage.test.ts`, which gates the package's
 * BYTES.
 *
 * Those two are not the same question, and for three weeks this repository could answer only the
 * second one. The projection was byte-perfect and installed nothing: APM's type-detection cascade
 * ranked the root `plugin.json` ahead of `apm.yml` + `.apm/`, so `apm install` typed this tree as
 * an Agent Plugin, exited 0, and deployed zero primitives (microsoft/apm#2735; fixed by PR #2776,
 * shipped in apm 0.29.1). A byte-diff over the generated surface is green through all of that,
 * because every byte it compares is correct.
 *
 * So the property under test here is DEPLOYMENT, and the subject is `scripts/apm-install-smoke.mjs`
 * — specifically its two pure halves, which is what lets this file run in the ordinary suite with
 * no apm binary, no network and no install:
 *
 *   readExpectedPrimitives   what the source package promises: every id under `.apm/`, each with
 *                            one content witness. Checked against the CORPUS, so a projection that
 *                            silently dropped a primitive cannot also drop its expectation.
 *   verifyDeployment         what a finished consumer actually holds. Exercised over synthetic
 *                            trees, including a faithful reproduction of the 0.29.0 outcome:
 *                            a lockfile typing the package `agent_plugin` with nothing deployed.
 *
 * The third group runs the real script against a real client and is opt-in through
 * `STAMITY_APM_BIN`, because apm-cli is a Python package this repository does not depend on. CI
 * supplies it in a venv on three legs — 0.29.1 (the minimum tested client), 0.30.0 (current), and
 * 0.29.0 with `--expect-failure`, which is the standing proof that this check can still see the
 * failure it was written for.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT_PATH = join(REPO_ROOT, "scripts/apm-install-smoke.mjs");

interface Expectation {
  readonly id: string;
  readonly witness: string;
}
type Expectations = Record<string, readonly Expectation[]>;
interface Verdict {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly counts: Record<string, Record<string, number>>;
  readonly lockfile: { readonly present: boolean; readonly rows: readonly unknown[] };
}

const verify = verifyDeployment as (
  consumerDir: string,
  expectations: Expectations,
  targets: readonly string[],
) => Verdict;
const readExpected = readExpectedPrimitives as (sourceDir: string) => Expectations;
const CLASSES = PRIMITIVE_CLASSES as readonly string[];

/** One line summarising every problem, for a `toContain` that does not care about ordering. */
const joined = (verdict: Verdict): string => verdict.problems.join("\n");

function plant(root: string, relPath: string, content: string): void {
  const file = join(root, ...relPath.split("/"));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

// ── synthetic fixtures ───────────────────────────────────────────────────────

/**
 * Two ids per class, which is the smallest set that can tell "this class deployed" from "this id
 * deployed" — a one-id class makes the per-id and per-class failures indistinguishable.
 */
const FIXTURE: Expectations = {
  agent: [
    { id: "stamity-reviewer", witness: "# reviewer" },
    { id: "stamity-fixer", witness: "# fixer" },
  ],
  prompt: [
    { id: "st-work", witness: "# /st-work" },
    { id: "st-ask", witness: "# /st-ask" },
  ],
  instruction: [
    { id: "stamity-testing", witness: "# Testing" },
    { id: "stamity-secrets", witness: "# Secrets" },
  ],
  skill: [
    { id: "st-qa", witness: "# QA walk-through" },
    { id: "st-learn", witness: "# Learning capture" },
  ],
};

const ALL_TARGETS = ["claude", "copilot", "cursor", "codex"] as const;

/** Where each class lands per target — the same table the script owns, restated as the fixture. */
const LAYOUT: Record<string, Partial<Record<string, (id: string) => string>>> = {
  claude: {
    agent: (id) => `.claude/agents/${id}.md`,
    prompt: (id) => `.claude/commands/${id}.md`,
    instruction: (id) => `.claude/rules/${id}.md`,
    skill: (id) => `.claude/skills/${id}/SKILL.md`,
  },
  copilot: {
    agent: (id) => `.github/agents/${id}.agent.md`,
    prompt: (id) => `.github/prompts/${id}.prompt.md`,
    instruction: (id) => `.github/instructions/${id}.instructions.md`,
    skill: (id) => `.agents/skills/${id}/SKILL.md`,
  },
  cursor: {
    agent: (id) => `.cursor/agents/${id}.md`,
    prompt: (id) => `.cursor/commands/${id}.md`,
    instruction: (id) => `.cursor/rules/${id}.mdc`,
    skill: (id) => `.agents/skills/${id}/SKILL.md`,
  },
  codex: {
    agent: (id) => `.codex/agents/${id}.toml`,
    skill: (id) => `.agents/skills/${id}/SKILL.md`,
  },
};

const APM_PACKAGE_LOCK = [
  "lockfile_version: '1'",
  "apm_version: 0.30.0",
  "dependencies:",
  "- repo_url: zomarit/stamity",
  "  name: stamity",
  "  package_type: apm_package",
  "  deployed_files:",
  "  - .claude/agents/stamity-reviewer.md",
  "  - .claude/agents/stamity-fixer.md",
  "deployments: []",
  "",
].join("\n");

/**
 * The 0.29.0 lockfile, transcribed from a run of that client against this repository on
 * 2026-09-09: the package typed as an Agent Plugin, no `deployed_files` key at all, and an empty
 * deployments list. Nothing was deployed and the process exited 0.
 */
const AGENT_PLUGIN_LOCK = [
  "lockfile_version: '1'",
  "apm_version: 0.29.0",
  "dependencies:",
  "- repo_url: _local/source",
  "  name: stamity",
  "  version: 1.3.0",
  "  package_type: agent_plugin",
  "  source: local",
  "  declared_license: MIT",
  "deployments: []",
  "",
].join("\n");

const workspaces: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "stamity-apm-install-"));
  workspaces.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

/** A consumer that a fixed client would have produced: everything deployed, everything correct. */
function completeConsumer(): string {
  const consumer = scratch();
  writeFileSync(join(consumer, "apm.lock.yaml"), APM_PACKAGE_LOCK);
  for (const target of ALL_TARGETS) {
    for (const contentClass of CLASSES) {
      const pathFor = LAYOUT[target]?.[contentClass];
      if (pathFor === undefined) continue;
      for (const { id, witness } of FIXTURE[contentClass] ?? []) {
        const body =
          target === "codex"
            ? `name = "${id}"\ndescription = "d"\ndeveloper_instructions = "${witness}\\n\\nbody"\n`
            : `---\nname: ${id}\n---\n\n${witness}\n\nbody\n`;
        plant(consumer, pathFor(id), body);
      }
    }
  }
  return consumer;
}

describe("verifyDeployment — what landed, not what exited 0", () => {
  it("passes a consumer holding every id, at every path, with its source heading", () => {
    const verdict = verify(completeConsumer(), FIXTURE, ALL_TARGETS);
    expect(joined(verdict)).toBe("");
    expect(verdict.ok).toBe(true);
    expect(verdict.counts["claude"]).toEqual({ agent: 2, prompt: 2, instruction: 2, skill: 2 });
    expect(verdict.counts["copilot"]).toEqual({ agent: 2, prompt: 2, instruction: 2, skill: 2 });
    expect(verdict.counts["cursor"]).toEqual({ agent: 2, prompt: 2, instruction: 2, skill: 2 });
  });

  it("fails the 0.29.0 outcome — `agent_plugin` and nothing deployed — naming the classes at zero", () => {
    // The exact shape of the original failure, and the one case that decides whether this gate
    // was worth writing: an install that exits 0, writes a lockfile, and deploys not one
    // primitive. A check reading the status code passes it.
    const consumer = scratch();
    writeFileSync(join(consumer, "apm.lock.yaml"), AGENT_PLUGIN_LOCK);

    const verdict = verify(consumer, FIXTURE, ALL_TARGETS);
    expect(verdict.ok).toBe(false);
    const report = joined(verdict);
    // The cause, typed by name, with the diagnosis rather than a bare mismatch.
    expect(report).toContain("`agent_plugin`, not `apm_package`");
    expect(report).toContain("the plugin surfaces at the repository root outranked apm.yml");
    // A lockfile with no `deployed_files` key reads as an empty list, not as agreement.
    expect(report).toContain("records no `deployed_files`");
    // And the class counts, which is what a maintainer reads first.
    for (const target of ALL_TARGETS) {
      for (const contentClass of CLASSES) {
        if (LAYOUT[target]?.[contentClass] === undefined) continue;
        expect(report, `${target}/${contentClass}`).toContain(
          `${target}/${contentClass}: 0 of 2 deployed`,
        );
      }
    }
  });

  it("names the one id that did not land, rather than the class it belongs to", () => {
    const consumer = completeConsumer();
    rmSync(join(consumer, ".claude", "commands", "st-ask.md"));

    const verdict = verify(consumer, FIXTURE, ALL_TARGETS);
    expect(verdict.ok).toBe(false);
    expect(joined(verdict)).toContain(
      "claude/prompt: `st-ask` is missing — nothing at .claude/commands/st-ask.md",
    );
    // One id short is not the class failing: the surviving id still counts, and no zero-class
    // problem fires. A gate that could not tell those apart would send every partial deployment
    // to the same message.
    expect(verdict.counts["claude"]?.["prompt"]).toBe(1);
    expect(joined(verdict)).not.toContain("claude/prompt: 0 of");
  });

  it("fails a file that exists under the right name but is not that primitive", () => {
    // The failure mode a path check cannot see. An empty scaffold, a truncated write, or a
    // primitive deployed under someone else's id all satisfy "a file is there".
    const consumer = completeConsumer();
    plant(consumer, ".cursor/rules/stamity-testing.mdc", "---\nname: stamity-testing\n---\n\n# Secrets\n");

    const verdict = verify(consumer, FIXTURE, ALL_TARGETS);
    expect(verdict.ok).toBe(false);
    expect(joined(verdict)).toContain(
      "cursor/instruction: `stamity-testing` at .cursor/rules/stamity-testing.mdc does not carry its source heading `# Testing`",
    );
  });

  it("holds a codex agent to its TOML name key, which is the id codex addresses it by", () => {
    const consumer = completeConsumer();
    plant(
      consumer,
      ".codex/agents/stamity-fixer.toml",
      'name = "someone-else"\ndeveloper_instructions = "# fixer\\n\\nbody"\n',
    );

    const verdict = verify(consumer, FIXTURE, ALL_TARGETS);
    expect(verdict.ok).toBe(false);
    expect(joined(verdict)).toContain('declares no `name = "stamity-fixer"` key');
  });

  it("asks codex for agents and skills only, because its APM profile carries nothing else", () => {
    // APM's codex profile has no command class at all, and it folds instructions into AGENTS.md
    // through `apm compile` rather than deploying a per-rule file. A smoke demanding codex
    // commands or codex rules would print a red about a target that never promised them — and the
    // next reader would learn to scroll past this gate.
    const verdict = verify(completeConsumer(), FIXTURE, ["codex"]);
    expect(joined(verdict)).toBe("");
    expect(Object.keys(verdict.counts["codex"] ?? {}).toSorted()).toEqual(["agent", "skill"]);
  });

  it("treats an absent lockfile as an absent install, not as an install with nothing to say", () => {
    const consumer = completeConsumer();
    rmSync(join(consumer, "apm.lock.yaml"));
    const verdict = verify(consumer, FIXTURE, ["claude"]);
    expect(verdict.ok).toBe(false);
    expect(joined(verdict)).toContain("apm.lock.yaml is absent");
  });

  it("refuses an empty expectation set rather than passing every check vacuously", () => {
    // A source whose `.apm/` read produced nothing would otherwise report a clean run against a
    // consumer holding no files at all: every per-id loop is satisfied by having no ids.
    const verdict = verify(completeConsumer(), { ...FIXTURE, agent: [] }, ["claude"]);
    expect(verdict.ok).toBe(false);
    expect(joined(verdict)).toContain("claude/agent: the expectation set is empty");
  });

  it("refuses a target it has no deployment paths for, instead of scoring it zero", () => {
    const verdict = verify(completeConsumer(), FIXTURE, ["kiro"]);
    expect(verdict.ok).toBe(false);
    expect(joined(verdict)).toContain("unknown target `kiro`");
  });
});

// ── the real .apm/ tree ──────────────────────────────────────────────────────

/** The emitted id one artifact projects under — the same derivation `apmPackage.test.ts` uses. */
function emittedId(item: { type: ContentClass; id: string }): string {
  const bare =
    item.type === "command" && item.id.startsWith(COMMAND_ID_PREFIX)
      ? item.id.slice(COMMAND_ID_PREFIX.length)
      : item.id;
  const prefix = contentPrefixFor(item);
  return bare.startsWith(prefix) ? bare : `${prefix}${bare}`;
}

/** Content class -> the `.apm/` primitive class it projects into. */
const CLASS_OF: Readonly<Record<ContentClass, string>> = {
  agent: "agent",
  command: "prompt",
  rule: "instruction",
  skill: "skill",
};

const corpus = async (): Promise<CatalogItem[]> => {
  const index = await buildContentIndex();
  return index.items.filter((item) => (item.origin ?? "corpus") === "corpus");
};

describe("readExpectedPrimitives — over this repository's own .apm/ tree", () => {
  it("promises exactly the ids the corpus projects, class for class", async () => {
    // Derived, not typed: the counts move with the corpus, and a hand-written number here would
    // be one more surface pin that drifts silently green. What is pinned is the AGREEMENT —
    // every corpus artifact expected, and nothing expected that the corpus does not hold.
    const expected = readExpected(REPO_ROOT);
    const items = await corpus();
    for (const [contentClass, apmClass] of Object.entries(CLASS_OF)) {
      const fromCorpus = items
        .filter((item) => item.type === contentClass)
        .map((item) => emittedId(item))
        .toSorted();
      expect(fromCorpus.length, `the corpus indexes no ${contentClass}`).toBeGreaterThan(0);
      expect(
        (expected[apmClass] ?? []).map((row) => row.id).toSorted(),
        `.apm/${apmClass} does not match the corpus's ${contentClass} set`,
      ).toEqual(fromCorpus);
    }
  });

  it("carries the four classes the package ships, and a witness for every id", () => {
    const expected = readExpected(REPO_ROOT);
    expect(Object.keys(expected).toSorted()).toEqual(
      ["agent", "instruction", "prompt", "skill"].toSorted(),
    );
    for (const contentClass of CLASSES) {
      for (const row of expected[contentClass] ?? []) {
        // A witness has to be a real heading. An empty one would make every `includes` check pass
        // against any file at all, which is the vacuous form of this gate.
        expect(row.witness, `${contentClass}/${row.id}`).toMatch(/^# \S/);
      }
    }
  });

  it("reads the witness out of the primitive it names, not out of its frontmatter", async () => {
    // Spot-checked against the file itself rather than a literal, so the case survives a rename.
    const expected = readExpected(REPO_ROOT);
    const agent = (expected["agent"] ?? []).find((row) => row.id === "stamity-reviewer");
    expect(agent, ".apm/agents/stamity-reviewer.agent.md must exist").toBeDefined();
    const source = readFileSync(
      join(REPO_ROOT, ".apm", "agents", "stamity-reviewer.agent.md"),
      "utf-8",
    );
    // The frontmatter block precedes the body and holds no `# ` line; the witness comes from
    // after it.
    expect(source.split("\n").indexOf(agent?.witness ?? "")).toBeGreaterThan(
      source.split("\n").lastIndexOf("---"),
    );
  });

  it("refuses a directory that is not an APM package rather than expecting nothing of it", () => {
    expect(() => readExpected(join(REPO_ROOT, "scripts"))).toThrow(/No \.apm\/ tree/);
  });
});

// ── the real client ──────────────────────────────────────────────────────────

/**
 * Opt-in: apm-cli is a Python package and nothing in this repository depends on it, so the suite
 * must stay green on a machine that has never installed it. CI arms this by putting an apm binary
 * on `STAMITY_APM_BIN` — 0.29.1, 0.30.0, and 0.29.0 on the `--expect-failure` leg.
 */
describe.skipIf(process.env["STAMITY_APM_BIN"] === undefined)(
  "the real route, against the client on STAMITY_APM_BIN",
  () => {
    it(
      "installs this checkout into a consumer and deploys every class for every target",
      () => {
        const result = spawnSync(
          process.execPath,
          [SCRIPT_PATH, "--targets", "claude,copilot,cursor,codex"],
          { cwd: REPO_ROOT, encoding: "utf-8", timeout: 900_000 },
        );
        expect(result.status, `${result.stdout ?? ""}\n${result.stderr ?? ""}`).toBe(0);
        expect(result.stdout).toContain("apm-install-smoke: PASS");
      },
      900_000,
    );
  },
);
