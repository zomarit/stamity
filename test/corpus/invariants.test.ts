import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALWAYS_ON_BUDGET_LINES,
  ALWAYS_ON_SHARED_BYTES_WITH_CODEX,
  ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX,
  CHARTER_MAX_LINES,
  CHARTER_RELATIVE_PATH,
  composeAlwaysOnLoad,
  readCharterTemplate,
  type AlwaysOnPlan,
} from "../../src/content/charter.ts";
import { frontmatterField } from "../../src/content/frontmatter.ts";
import { cursorCompanionFrontmatter } from "../../src/content/mdcCompanions.ts";
import { isContextTag } from "../../src/content/tags.ts";
import { REGENERATE_COMMAND } from "../../src/emit/capabilityMatrix.ts";
import { REPO_SUBSTITUTION_TOKENS } from "../../src/emit/substitution.ts";
import { DEFAULT_MAX_REVIEW_ITERATIONS } from "../../src/roster/reviewCaps.ts";
import { TOOLS } from "../../src/types/core.ts";
import { useTempDir } from "../support/tempDir.ts";
import {
  CORPUS_ROOT,
  assertDenyClean,
  assertLineCap,
  corpusFileOf,
  filenameSlug,
  requireLoadClass,
  requireObsoleteWhen,
  walkAllMarkdown,
  type CorpusFile,
} from "./harness.ts";

/**
 * The corpus-wide invariant suite: every authoring invariant from the content
 * design, asserted over {@link walkAllMarkdown} — charter and
 * skill reference files included. Each numbered invariant is one describe
 * block whose corpus case expects zero violations and whose fixture case
 * proves the same checker can fail, so a green run certifies detection as
 * well as compliance. Fixtures are in-memory ({@link corpusFileOf}) or seeded
 * OS temp directories — never files under `content/`, which would enter the
 * census.
 *
 * LINE COUNTING, stated once for the whole suite: body caps count physical
 * lines of the body (everything after the frontmatter fence) with the final
 * newline discounted — `"a\n"` is one line — matching the harness's
 * `assertLineCap` accounting. The charter is the one exception: its cap binds
 * TOTAL file lines, frontmatter included, because the cap models what a
 * session loads; that accounting lives in the engine's `readCharterTemplate`
 * and is consumed here, not restated.
 *
 * Constants policy: engine-owned numbers are imported (charter cap, review
 * cap, substitution tokens, deny patterns, context-tag facet); the SoT
 * authoring caps that exist only in the content design are named once in
 * {@link SOT_CAPS}; the reserved-name list is read from
 * `scripts/leak-gate.mjs` at run time — never forked, and never
 * spelled in this source.
 */

/** The SoT authoring caps. The only literals this suite restates. */
const SOT_CAPS = {
  /** Total physical file lines — cross-checked against the engine's CHARTER_MAX_LINES. */
  charterTotalLines: 150,
  ruleBody: 120,
  skillBody: 500,
  commandBody: 500,
  agentBody: 350,
  verifyReferenceMin: 40,
  verifyReferenceMax: 100,
  descriptionChars: 1024,
} as const;

/** The two sanctioned rule activation modes; `always` is banned in rules. */
const RULE_SCOPE_POLICY: readonly string[] = ["agent-requested", "conditional"];

/** Hosts content may link: spec/standard bodies only. Anything else is a minted product URL. */
const URL_ALLOWLIST: readonly string[] = ["rfc-editor.org", "owasp.org", "w3.org"];

/** The verify skill's axis-reference directory — the 40..100 band binds these files. */
const VERIFY_REFERENCES_PREFIX = "skills/st-verify/references/";

const WORK_RELATIVE_PATH = "commands/st-work.md";

/** The sentence shape the work body states its review-loop cap in. */
const WORK_CAP_STATEMENT = /Iteration cap: (\d+) rounds by default/;

/**
 * The bodies that carry the fixer escalation ladder. Both restate the same
 * stages, so both are read by invariant 16 rather than one being trusted to
 * stand for the other.
 */
const LADDER_BODIES: readonly string[] = [WORK_RELATIVE_PATH, "agents/stamity-fixer.md"];

/** Any round number a body names, singly or as a range (`rounds 1–3`, `round 4`). */
const ROUND_NUMBERS = /\bround(?:s)?\s+(\d+)(?:\s*[–-]\s*(\d+))?/gi;

const REPO_ROOT = resolve(CORPUS_ROOT, "..");
const GATE_SCRIPT = join(REPO_ROOT, "scripts", "leak-gate.mjs");
const ROSTER_DIR = join(REPO_ROOT, "src", "roster");
const PACKS_ROOT = join(REPO_ROOT, "packs");

/**
 * The Model-Independence Contract, as ONE list (invariant 17).
 *
 * Before this constant the contract lived in eight per-suite regexes over 12 of
 * 41 shipped artifacts, no two of them the same: three named the four client
 * ids, three did not, one covered an o-series shape nothing else did, and the
 * packs tree carried no vendor check at all. So the corpus could ship a vendor
 * name green on one axis that would have failed the build on its sibling. One
 * list, one walk, every shipped markdown file — including `packs/`.
 *
 * Deletion state of those eight copies, stated rather than implied, because a
 * comment claiming a finished migration while copies still enforce is the same
 * class of defect the consolidation exists to remove. Three are gone — all of
 * `test/corpus/agents/` (`spine`, `quality`, `specialists`), held deleted by the
 * re-add guard below. Five still enforce, each a subset of this list over a
 * subset of files, so each can only be stricter than this contract and never
 * looser: `test/corpus/commands/plan.test.ts`, `.../spec.test.ts`,
 * `.../work.test.ts` (inline), `test/corpus/skills/verifyCore.test.ts`, and
 * `test/content/charter.test.ts`. Two adjacent checks are deliberately NOT
 * counted as copies: `test/roster/modelLadder.test.ts` runs over roster rows
 * rather than shipped markdown, and `test/corpus/rules/protocol.test.ts` also
 * bans eval-product names (`promptfoo`, `deepeval`, `ragas`, `braintrust`,
 * `langchain`) this list does not track — deleting that one WOULD narrow, so it
 * stays until those tokens land here.
 *
 * Two families, deliberately in one list because the rule that governs them is
 * the same rule read at two strengths:
 *
 * - **Vendor and model ids** (`anthropic`, `gpt`, `sonnet`, …) are illegitimate
 *   everywhere in shipped content. A capability shift may obsolete an artifact;
 *   it must never strand its wording on a vendor's name, and a body that names
 *   a model is stale the day that model is renamed.
 * - **Client ids** (`claude`, `cursor`, `copilot`, `codex`) are legitimate in an
 *   ADAPTER-FACING sentence and illegitimate in a MODEL-FACING instruction. The
 *   test: is the name part of a contract the ENGINE reads or writes — a field's
 *   legal values, a path an adapter emits — or is it telling the agent what to
 *   do? The first is schema and cannot be written without the name. The second
 *   makes a portable artifact client-specific, which is what the contract bans.
 *   Every allowance is declared in {@link VENDOR_TOKEN_ALLOWANCES} with which
 *   of the two it is.
 */
export const VENDOR_TOKENS: readonly string[] = [
  // Vendors.
  "anthropic",
  "openai",
  "chatgpt",
  "deepseek",
  "mistral",
  "qwen",
  // Model families and ids.
  "claude",
  "opus",
  "sonnet",
  "haiku",
  "gpt",
  "gemini",
  "llama",
  "grok",
  "o1-preview",
  "o1-mini",
  "o3-mini",
  "o4-mini",
  // Client ids — see the adapter-facing / model-facing split above.
  "cursor",
  "copilot",
  "codex",
];

/** One declared, reasoned exception to invariant 17. */
interface VendorTokenAllowance {
  /** Corpus-relative path (`content/` and `packs/` roots both address this way). */
  relPath: string;
  /** Tokens allowed in that file, lowercase. */
  tokens: readonly string[];
  /** Which allowance class, and why — an unreasoned row is a hole. */
  why: string;
}

/**
 * The complete allowance. Two rows, and each names its class: without an
 * explicit allowance the invariant fires on correct files, which is how a
 * corpus-wide vendor check gets weakened into a per-suite one.
 */
const VENDOR_TOKEN_ALLOWANCES: readonly VendorTokenAllowance[] = [
  {
    relPath: "skills/st-handoff/SKILL.md",
    tokens: ["claude", "cursor", "copilot", "codex"],
    why: "adapter-facing: the row enumerates the legal values of the handoff record's `fromTool`/`toTool` fields, which the engine writes and reads. The field cannot be documented without its values, and no sentence there instructs the model.",
  },
  {
    relPath: "skills/st-verify/references/scalability.md",
    tokens: ["cursor"],
    why: "homograph: a pagination cursor in the `scale-unbounded-read` check, not the client. The token family is matched on the word, so the English word needs the same declaration a real client mention would.",
  },
];

/** One walk, shared by every corpus case. */
const corpus: Promise<CorpusFile[]> = walkAllMarkdown();

const tempDir = useTempDir("corpus-invariants");

// ── Corpus layout ────────────────────────────────────────────────

type CorpusClass = "charter" | "command" | "agent" | "rule" | "skill" | "reference" | "other";

/** The closed layout: which class a corpus path belongs to, or `other` for a stray. */
function classOf(relPath: string): CorpusClass {
  if (relPath === CHARTER_RELATIVE_PATH) return "charter";
  const segments = relPath.split("/");
  if (segments[0] === "commands" && segments.length === 2) return "command";
  if (segments[0] === "agents" && segments.length === 2) return "agent";
  if (segments[0] === "rules" && segments.length === 2) return "rule";
  if (segments[0] === "skills" && segments.length === 3 && segments[2] === "SKILL.md") {
    return "skill";
  }
  if (segments[0] === "skills" && segments.length === 4 && segments[2] === "references") {
    return "reference";
  }
  return "other";
}

/**
 * Frontmatter-declaring files — the artifacts the per-class invariants bind.
 *
 * The filter is safe for the per-class invariants only because invariant 2
 * closes it: a walked `.md` with no frontmatter block is itself a violation
 * there, so on a green corpus this filter drops nothing. Without that gate the
 * filter would be an exemption — the engine's catalog walk skips a
 * frontmatterless file as "not an artifact" (`src/content/catalog.ts`), which
 * is the right posture for user content but would let a corpus file ship
 * unbound by every invariant that starts from this helper.
 */
function artifacts(files: readonly CorpusFile[]): CorpusFile[] {
  return files.filter((file) => file.parsed.hadFrontmatter);
}

/** Declared id, falling back to the filename slug (the contract suite pins their agreement). */
function declaredId(file: CorpusFile): string {
  const id = frontmatterField(file.parsed, "id");
  return typeof id === "string" && id.trim() !== "" ? id : filenameSlug(file.relPath);
}

/** Collect a throwing check as a violation message instead of aborting the pass. */
function collect(problems: string[], check: () => void): void {
  try {
    check();
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
}

/** Body lines with the final newline discounted — parity with `assertLineCap`'s accounting. */
function bodyLines(file: CorpusFile): number {
  const trimmed = file.parsed.body.replace(/\r?\n$/, "");
  return trimmed === "" ? 0 : trimmed.split(/\r?\n/).length;
}

/**
 * Whole-file lines, `wc -l` style — the accounting `CHARTER_MAX_LINES` uses.
 * The composite always-on measurement counts charter and rules the same way,
 * because a client loads both files whole, frontmatter included.
 */
function fileLines(file: CorpusFile): number {
  const trimmed = file.raw.replace(/\r?\n$/, "");
  return trimmed === "" ? 0 : trimmed.split(/\r?\n/).length;
}

/** Prose outside ``` fences: even-indexed segments of a fence split; an unterminated fence drops its tail. */
function stripFencedBlocks(body: string): string {
  return body
    .split("```")
    .filter((_, index) => index % 2 === 0)
    .join(" ");
}

/** Invariant 7: why an entry name is a platform projection, or null when it is corpus-legal. */
function projectionOffense(name: string): string | null {
  if (name.endsWith(".mdc")) return "a generated Cursor rule companion";
  if (name.endsWith(".agent.md")) return "a generated per-agent projection";
  if (name.startsWith(".cursor")) return "a Cursor client directory or file";
  if (name.startsWith(".claude")) return "a Claude client directory or file";
  if (name === "AGENTS.md") return "the generated charter projection";
  return null;
}

/** Invariant 8: quoted-string literals inside one extracted array body of the gate source. */
function quoted(arrayBody: string): string[] {
  return [...arrayBody.matchAll(/'([^']*)'/g)].map((match) => match[1] ?? "");
}

/** Invariant 8: mirror of the gate's exact-or-directory-prefix allow matcher; globs would need an upgrade here. */
function allowMatches(allowEntry: string, repoRelPath: string): boolean {
  if (allowEntry.includes("*")) {
    throw new Error(
      `leak-gate allowlist entry ${JSON.stringify(allowEntry)} uses a glob — ` +
        `extend this suite's matcher to mirror the gate's`,
    );
  }
  if (allowEntry.endsWith("/")) {
    return repoRelPath === allowEntry.slice(0, -1) || repoRelPath.startsWith(allowEntry);
  }
  return repoRelPath === allowEntry;
}

// ── Fixture builders ─────────────────────────────────────────────

const lines = (...rows: string[]): string => rows.join("\n");

/** Minimal valid frontmatter head; fixtures inject exactly one defect each. */
function head(id: string, type: string): string[] {
  return [
    `id: ${id}`,
    `type: ${type}`,
    `description: Fixture ${type} for the invariant negative cases.`,
    "tags: [review]",
    "load: on-demand",
    "obsolete_when: the invariant suite retires.",
  ];
}

function doc(fields: readonly string[], body: string): string {
  return lines("---", ...fields, "---", body, "");
}

function filler(count: number): string {
  return Array.from({ length: count }, (_, index) => `filler line ${String(index)}`).join("\n");
}

// ═════════════════════════════════════════════════════════════════

describe("invariant 1 — obsolete_when is a non-empty deletion trigger everywhere", () => {
  function violations(files: readonly CorpusFile[]): string[] {
    const problems: string[] = [];
    for (const file of artifacts(files)) collect(problems, () => requireObsoleteWhen(file));
    return problems;
  }

  it("holds across the corpus", async () => {
    expect(violations(await corpus)).toEqual([]);
  });

  it("fixture: a missing obsolete_when is flagged", () => {
    const fields = head("ghost", "rule").filter((row) => !row.startsWith("obsolete_when"));
    const file = corpusFileOf("rules/stamity-ghost.md", doc(fields, "Body."));

    expect(violations([file])).toEqual([
      expect.stringMatching(/rules\/stamity-ghost\.md: `obsolete_when` must be a non-empty/),
    ]);
  });
});

describe("invariant 2 — every walked file is a declared artifact; load always only on the charter, reference only under references/", () => {
  function violations(files: readonly CorpusFile[]): string[] {
    const problems: string[] = [];
    // Walked files, not `artifacts(files)`: the declaration check IS the
    // precondition every other per-artifact invariant leans on, so it must see
    // the files that declare nothing.
    for (const file of files) {
      if (!file.parsed.hadFrontmatter) {
        problems.push(
          `${file.relPath}: no frontmatter block — every corpus file is a declared artifact; ` +
            `the catalog walk skips a frontmatterless file as "not an artifact", so it would ` +
            `ship unbound by every invariant in this suite`,
        );
        continue;
      }
      const cls = classOf(file.relPath);
      if (cls === "other") {
        problems.push(
          `${file.relPath}: frontmatter-declaring file outside the corpus layout — artifacts ` +
            `live in agents/, commands/, rules/, skills/*/SKILL.md, skills/*/references/, or ` +
            CHARTER_RELATIVE_PATH,
        );
        continue;
      }
      collect(problems, () =>
        requireLoadClass(file, cls === "charter" ? ["always"] : ["on-demand", "reference"]),
      );
      if (frontmatterField(file.parsed, "load") === "reference" && cls !== "reference") {
        problems.push(
          `${file.relPath}: \`load: reference\` is reserved for skill reference files under ` +
            `skills/*/references/`,
        );
      }
    }
    return problems;
  }

  it("holds across the corpus", async () => {
    expect(violations(await corpus)).toEqual([]);
  });

  it("fixture: a frontmatterless file anywhere under the corpus is flagged by path", () => {
    // The probe class this invariant exists to catch: markdown that lands in a
    // corpus class directory (or beside it) declaring nothing at all. Both are
    // invisible to the catalog walk, so nothing downstream would name them.
    const inClass = corpusFileOf(
      "agents/stamity-orphan.md",
      lines("# Orphan", "", filler(600), ""),
    );
    const stray = corpusFileOf("README.md", "# Corpus notes\n");

    expect(violations([inClass, stray])).toEqual([
      expect.stringMatching(/^agents\/stamity-orphan\.md: no frontmatter block/),
      expect.stringMatching(/^README\.md: no frontmatter block/),
    ]);
  });

  it("fixture: load always outside the charter is flagged", () => {
    const fields = head("greedy", "rule").map((row) =>
      row === "load: on-demand" ? "load: always" : row,
    );
    const file = corpusFileOf("rules/stamity-greedy.md", doc(fields, "Body."));

    expect(violations([file])).toEqual([
      expect.stringMatching(/rules\/stamity-greedy\.md: `load` is "always" — allowed here:/),
    ]);
  });

  it("fixture: load reference outside a references directory is flagged", () => {
    const fields = head("stray", "command").map((row) =>
      row === "load: on-demand" ? "load: reference" : row,
    );
    const file = corpusFileOf("commands/stamity-stray.md", doc(fields, "Body."));

    expect(violations([file])).toEqual([
      expect.stringMatching(/commands\/stamity-stray\.md: `load: reference` is reserved/),
    ]);
  });

  it("fixture: a charter that is not always-on, and an artifact outside the layout, are flagged", () => {
    const charterFields = [
      "id: charter",
      "type: charter",
      "description: Fixture charter for the load-placement case.",
      "tags: [orchestration]",
      "load: on-demand",
      "obsolete_when: the invariant suite retires.",
    ];
    const results = violations([
      corpusFileOf(CHARTER_RELATIVE_PATH, doc(charterFields, "Body.")),
      corpusFileOf("notes/stamity-scratch.md", doc(head("scratch", "rule"), "Body.")),
    ]);

    expect(results).toEqual([
      expect.stringMatching(/charter\/stamity-charter\.md: `load` is "on-demand"/),
      expect.stringMatching(/notes\/stamity-scratch\.md: frontmatter-declaring file outside/),
    ]);
  });
});

describe("invariant 3 — every command spawns at least one census agent", () => {
  function violations(files: readonly CorpusFile[]): string[] {
    const problems: string[] = [];
    const agentIds = new Set(
      artifacts(files)
        .filter((file) => classOf(file.relPath) === "agent")
        .map(declaredId),
    );
    for (const file of artifacts(files)) {
      if (classOf(file.relPath) !== "command") continue;
      const spawns = frontmatterField(file.parsed, "spawns");
      if (!Array.isArray(spawns) || spawns.length === 0) {
        problems.push(
          `${file.relPath}: \`spawns\` must be a non-empty array — a command orchestrates ` +
            `at least one sub-agent; anything else is a skill`,
        );
        continue;
      }
      for (const entry of spawns) {
        if (typeof entry !== "string" || !agentIds.has(entry)) {
          problems.push(
            `${file.relPath}: \`spawns\` names ${JSON.stringify(entry)} — not in the agent census`,
          );
        }
      }
    }
    return problems;
  }

  it("holds across the corpus", async () => {
    expect(violations(await corpus)).toEqual([]);
  });

  it("fixture: a spawn-less command, an empty list, and an unknown agent are flagged", () => {
    const agent = corpusFileOf("agents/stamity-worker.md", doc(head("worker", "agent"), "Role."));
    const missing = corpusFileOf("commands/stamity-a.md", doc(head("a", "command"), "Flow."));
    const empty = corpusFileOf(
      "commands/stamity-b.md",
      doc([...head("b", "command"), "spawns: []"], "Flow."),
    );
    const unknown = corpusFileOf(
      "commands/stamity-c.md",
      doc([...head("c", "command"), "spawns: [worker, phantom]"], "Flow."),
    );

    expect(violations([agent, missing, empty, unknown])).toEqual([
      expect.stringMatching(/commands\/stamity-a\.md: `spawns` must be a non-empty array/),
      expect.stringMatching(/commands\/stamity-b\.md: `spawns` must be a non-empty array/),
      expect.stringMatching(/commands\/stamity-c\.md: `spawns` names "phantom"/),
    ]);
  });
});

describe("invariant 4 — the charter fits its cap, and the composite always-on slice fits its own", () => {
  /**
   * `charterTotalLines` binds ONE FILE. It was read for years as the whole
   * always-on budget, which it never was: a client with no way to attach a
   * rule conditionally loads that rule every session, so the slice a session
   * really pays is charter PLUS those rules. On the shipped corpus that is 240
   * lines for two of the four clients and 1082 for the one that folds the whole
   * rule set into its single always-on document — against a template cap of
   * 150. The composite cases below measure THAT, computed from the emitted rule
   * set rather than from a hand-kept list, so a rule added or re-scoped moves
   * the number without anything here being edited.
   */
  const alwaysOnPlan = async (): Promise<AlwaysOnPlan> => {
    const charter = await readCharterTemplate(CORPUS_ROOT);
    const rules = artifacts(await corpus)
      .filter((file) => classOf(file.relPath) === "rule")
      .map((file) => {
        const globs = frontmatterField(file.parsed, "globs");
        return {
          id: declaredId(file),
          lineCount: fileLines(file),
          globScoped: Array.isArray(globs) && globs.length > 0,
        };
      });
    return { charterLines: charter.lineCount, rules };
  };

  it("the engine's cap is the SoT cap", () => {
    expect(CHARTER_MAX_LINES).toBe(SOT_CAPS.charterTotalLines);
  });

  it("the shipped charter loads inside the budget (total file lines)", async () => {
    const charter = await readCharterTemplate(CORPUS_ROOT);

    expect(charter.lineCount).toBeLessThanOrEqual(CHARTER_MAX_LINES);
  });

  it("fixture: an over-budget charter is refused by the loader", async () => {
    const t = tempDir();
    await t.seedFiles({
      [CHARTER_RELATIVE_PATH]: `${filler(CHARTER_MAX_LINES + 1)}\n`,
    });

    await expect(readCharterTemplate(t.dir)).rejects.toThrow(/always-on budget/);
  });

  it("every client's composite always-on slice fits its ceiling", async () => {
    const plan = await alwaysOnPlan();

    for (const tool of TOOLS) {
      const measured = composeAlwaysOnLoad(tool, plan);
      expect(
        measured,
        `${tool} loads ${measured} always-on lines against a ceiling of ` +
          `${ALWAYS_ON_BUDGET_LINES[tool]}. The ceiling is a ratchet pinned at the measured ` +
          `load, so it may only come down: cut the slice, or move content to a rule this ` +
          `client can attach conditionally.`,
      ).toBeLessThanOrEqual(ALWAYS_ON_BUDGET_LINES[tool]);
    }
  });

  it("the composite is bigger than the charter wherever the client cannot defer a rule", async () => {
    const plan = await alwaysOnPlan();

    // The point of the whole invariant: on three of four clients the charter is
    // NOT the always-on slice, so a green charter cap says nothing about them.
    expect(composeAlwaysOnLoad("cursor", plan)).toBe(plan.charterLines);
    for (const tool of ["claude", "copilot", "codex"] as const) {
      expect(composeAlwaysOnLoad(tool, plan)).toBeGreaterThan(CHARTER_MAX_LINES);
    }
    // Codex carries the glob-scoped rules too, so it is strictly the largest.
    expect(composeAlwaysOnLoad("codex", plan)).toBeGreaterThan(composeAlwaysOnLoad("claude", plan));
  });

  it("fixture: a rule that no client can defer pushes the composite over its ceiling", () => {
    const overBudget: AlwaysOnPlan = {
      charterLines: ALWAYS_ON_BUDGET_LINES.claude,
      rules: [{ id: "greedy", lineCount: 1, globScoped: false }],
    };

    // Non-degenerate on both axes: cursor defers the same rule and stays inside
    // its ceiling, so the failure is the per-client rule firing, not arithmetic.
    expect(composeAlwaysOnLoad("claude", overBudget)).toBeGreaterThan(ALWAYS_ON_BUDGET_LINES.claude);
    expect(composeAlwaysOnLoad("cursor", overBudget)).toBe(ALWAYS_ON_BUDGET_LINES.claude);

    const globScoped: AlwaysOnPlan = {
      charterLines: 10,
      rules: [{ id: "scoped", lineCount: 40, globScoped: true }],
    };
    expect(composeAlwaysOnLoad("claude", globScoped)).toBe(10);
    expect(composeAlwaysOnLoad("codex", globScoped)).toBe(50);
  });

  it("pins the codex cross-client byte cost against the committed golden", () => {
    // Selecting codex rewrites the SHARED root AGENTS.md, so every co-selected
    // client inherits the rules appendix — a 6.4x file for a repo that added
    // codex beside claude (29_303 / 4_614, the two constants asserted below).
    // Those constants are a TRIPWIRE as well as a published figure: this suite
    // holds them to the golden, so when the golden is refreshed and the number
    // moves, the constants move with it or this fails. The case below holds the
    // other half — that the page a reader consults actually carries them.
    const snapshot = readFileSync(
      join(REPO_ROOT, "test", "emit", "__snapshots__", "crossClientGoldens.test.ts.snap"),
      "utf8",
    );
    const recorded = new Set(
      [...snapshot.matchAll(/^ {2}"AGENTS\.md": "[0-9a-f]{64} (\d+) bytes",$/gm)].map((match) =>
        Number(match[1]),
      ),
    );

    expect(
      [...recorded].toSorted((a, b) => a - b),
      "the shared root AGENTS.md byte figures in the cross-client golden no longer match the " +
        "disclosure constants in src/content/charter.ts. Update the two constants there to the " +
        "measured figures, then regenerate docs/capability-matrix.md — the page publishes both " +
        "numbers under `## Always-on cost by client`, so the constants alone are no longer the " +
        "whole of the edit (see the doc comment on ALWAYS_ON_SHARED_BYTES_WITH_CODEX).",
    ).toEqual([ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX, ALWAYS_ON_SHARED_BYTES_WITH_CODEX]);
    expect(ALWAYS_ON_SHARED_BYTES_WITH_CODEX).toBeGreaterThan(ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX);
  });

  it("the capability matrix publishes both shared-bytes figures, as the charter states", () => {
    // FLIPPED 2026-09-02. This case used to assert the opposite — that the page
    // carried NEITHER figure — because the charter's doc comment recorded the
    // disclosure half of the cost as open: the constants existed as a tripwire
    // and nothing published them where a reader choosing a client would look.
    // `src/emit/capabilityMatrix.ts` now renders both under a named section, so
    // the old assertion would have failed on the delivery it was waiting for.
    // The claim moved, so its gate moved with it: what is asserted here is
    // still "the page and the charter's doc comment agree", in the direction
    // that is now true.
    const page = readFileSync(join(REPO_ROOT, "docs", "capability-matrix.md"), "utf8");

    // Non-degenerate: a substring check over a missing or renamed file would
    // fail loudly, but pin the codex section too so a half-rendered page is
    // caught by the same case.
    expect(page).toContain("### `codex`");
    expect(
      page,
      "the always-on section heading named by the doc comment on " +
        "ALWAYS_ON_SHARED_BYTES_WITH_CODEX in src/content/charter.ts is gone from " +
        "docs/capability-matrix.md. Either restore it in src/emit/capabilityMatrix.ts and " +
        "regenerate the page, or correct that comment — it states the disclosure is delivered.",
    ).toContain("## Always-on cost by client");

    // Separators stripped so `28,956` / `28_956` reads the same as the bare
    // form; digit boundaries so a longer number carrying these digits is not a
    // false positive.
    const digits = page.replace(/(?<=\d)[,_](?=\d)/g, "");
    for (const figure of [ALWAYS_ON_SHARED_BYTES_WITH_CODEX, ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX]) {
      expect(
        new RegExp(String.raw`(?<!\d)${figure}(?!\d)`).test(digits),
        `docs/capability-matrix.md does not carry ${figure}. The page is the disclosure half ` +
          "of this cost, so a refreshed constant that never reached it leaves a reader choosing " +
          `a client on a stale number: run \`${REGENERATE_COMMAND}\`.`,
      ).toBe(true);
    }
  });
});

describe("invariant 5 — per-class body line caps, and the verify reference band", () => {
  const BODY_CAPS: Partial<Record<CorpusClass, number>> = {
    rule: SOT_CAPS.ruleBody,
    skill: SOT_CAPS.skillBody,
    command: SOT_CAPS.commandBody,
    agent: SOT_CAPS.agentBody,
  };

  function violations(files: readonly CorpusFile[]): string[] {
    const problems: string[] = [];
    for (const file of artifacts(files)) {
      const cls = classOf(file.relPath);
      const cap = BODY_CAPS[cls];
      if (cap !== undefined) collect(problems, () => assertLineCap(file, cap));
      if (cls === "reference" && file.relPath.startsWith(VERIFY_REFERENCES_PREFIX)) {
        collect(problems, () => assertLineCap(file, SOT_CAPS.verifyReferenceMax));
        const measured = bodyLines(file);
        if (measured < SOT_CAPS.verifyReferenceMin) {
          problems.push(
            `${file.relPath}: body is ${measured} lines, under the ` +
              `${SOT_CAPS.verifyReferenceMin}-line floor for verify axis references`,
          );
        }
      }
    }
    return problems;
  }

  it("holds across the corpus", async () => {
    expect(violations(await corpus)).toEqual([]);
  });

  it("fixture: over-cap rule, agent, and command bodies are flagged with their counts", () => {
    const over = (relPath: string, id: string, type: string, cap: number): CorpusFile =>
      corpusFileOf(relPath, doc(head(id, type), filler(cap + 1)));

    const results = violations([
      over("rules/stamity-long.md", "long", "rule", SOT_CAPS.ruleBody),
      over("agents/stamity-long.md", "long", "agent", SOT_CAPS.agentBody),
      over("commands/stamity-long.md", "long", "command", SOT_CAPS.commandBody),
    ]);

    expect(results).toEqual([
      expect.stringContaining(
        `rules/stamity-long.md: body is ${SOT_CAPS.ruleBody + 1} lines, over the cap of ${SOT_CAPS.ruleBody}`,
      ),
      expect.stringContaining(
        `agents/stamity-long.md: body is ${SOT_CAPS.agentBody + 1} lines, over the cap of ${SOT_CAPS.agentBody}`,
      ),
      expect.stringContaining(
        `commands/stamity-long.md: body is ${SOT_CAPS.commandBody + 1} lines, over the cap of ${SOT_CAPS.commandBody}`,
      ),
    ]);
  });

  it("fixture: a verify reference outside the 40..100 band is flagged at both edges", () => {
    const at = (id: string, count: number): CorpusFile =>
      corpusFileOf(
        `${VERIFY_REFERENCES_PREFIX}${id}.md`,
        doc(
          head(id, "skill").map((row) => (row === "load: on-demand" ? "load: reference" : row)),
          filler(count),
        ),
      );

    const results = violations([
      at("thin", SOT_CAPS.verifyReferenceMin - 1),
      at("fat", SOT_CAPS.verifyReferenceMax + 1),
      at("fit", SOT_CAPS.verifyReferenceMin),
    ]);

    expect(results).toEqual([
      expect.stringContaining(
        `thin.md: body is ${SOT_CAPS.verifyReferenceMin - 1} lines, under the ${SOT_CAPS.verifyReferenceMin}-line floor`,
      ),
      expect.stringContaining(
        `fat.md: body is ${SOT_CAPS.verifyReferenceMax + 1} lines, over the cap of ${SOT_CAPS.verifyReferenceMax}`,
      ),
    ]);
  });
});

describe("invariant 6 — rules are glob-scoped or agent-requested, never always", () => {
  function violations(files: readonly CorpusFile[]): string[] {
    const problems: string[] = [];
    for (const file of artifacts(files)) {
      if (classOf(file.relPath) !== "rule") continue;
      const scope = frontmatterField(file.parsed, "scope");
      const globs = frontmatterField(file.parsed, "globs");

      if (scope === "always") {
        problems.push(
          `${file.relPath}: \`scope: always\` is banned in rules — the charter owns the ` +
            `always-on slice; declare conditional (with globs) or agent-requested`,
        );
      } else if (typeof scope !== "string" || !RULE_SCOPE_POLICY.includes(scope)) {
        problems.push(
          `${file.relPath}: \`scope\` must be declared as one of: ${RULE_SCOPE_POLICY.join(", ")}`,
        );
      } else if (scope === "conditional") {
        const isGlobList =
          Array.isArray(globs) &&
          globs.length > 0 &&
          globs.every((glob) => typeof glob === "string" && glob.trim() !== "");
        if (!isGlobList) {
          problems.push(
            `${file.relPath}: \`scope: conditional\` requires a non-empty \`globs\` array of ` +
              `glob strings`,
          );
        }
      } else if (globs !== undefined) {
        problems.push(
          `${file.relPath}: \`scope: agent-requested\` must not declare \`globs\` — glob ` +
            `activation is \`scope: conditional\``,
        );
      }

      // Engine cross-check: the Cursor projection must build clean — no
      // contradiction error and no deprecated-shape warning.
      const warnings: string[] = [];
      collect(problems, () =>
        cursorCompanionFrontmatter(file.parsed.frontmatter, { source: file.relPath, warnings }),
      );
      problems.push(...warnings);
    }
    return problems;
  }

  it("holds across the corpus", async () => {
    expect(violations(await corpus)).toEqual([]);
  });

  it("fixture: scope always is refused by the policy AND by the engine projection", () => {
    // TEST CHANGE, justified: this case used to read "banned even though the
    // engine accepts it" and expect ONE problem — the corpus policy's. The
    // engine's `.mdc` projection has stopped accepting it (it used to answer
    // `alwaysApply: true`, the one shape the doctrine abolishes), so the same
    // fixture now reports twice. Two independent refusals of the same shape is
    // the behaviour that moved; nothing was relaxed.
    const file = corpusFileOf(
      "rules/stamity-clingy.md",
      doc([...head("clingy", "rule"), "scope: always"], "Body."),
    );

    const results = violations([file]);
    expect(results).toHaveLength(2);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/rules\/stamity-clingy\.md: `scope: always` is banned in rules/),
        expect.stringMatching(/declares `scope: always`, which this client would emit/),
      ]),
    );
  });

  it("fixture: a glob-less conditional is flagged by policy and by the engine's deprecation warning", () => {
    const file = corpusFileOf(
      "rules/stamity-vague.md",
      doc([...head("vague", "rule"), "scope: conditional"], "Body."),
    );

    const results = violations([file]);
    expect(results).toHaveLength(2);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/stamity-vague\.md: `scope: conditional` requires a non-empty/),
        expect.stringMatching(/stamity-vague\.md: `scope: conditional` without `globs`/),
      ]),
    );
  });

  it("fixture: agent-requested with globs is a contradiction — policy flag plus engine refusal", () => {
    const file = corpusFileOf(
      "rules/stamity-torn.md",
      doc([...head("torn", "rule"), "scope: agent-requested", 'globs: ["src/**"]'], "Body."),
    );

    const results = violations([file]);
    expect(results).toHaveLength(2);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/stamity-torn\.md: `scope: agent-requested` must not declare/),
        // Engine half: the projection now refuses the contradiction in the
        // shipped emission's exact words, so the sentence moved with it.
        expect.stringMatching(/declares `scope: agent-requested` and `globs`, which name two/),
      ]),
    );
  });

  it("fixture: a missing scope is flagged — a rule must pick its activation mode", () => {
    const file = corpusFileOf("rules/stamity-mute.md", doc(head("mute", "rule"), "Body."));

    expect(violations([file])).toEqual([
      expect.stringMatching(/rules\/stamity-mute\.md: `scope` must be declared/),
    ]);
  });
});

describe("invariant 7 — no hand-authored platform projections under content/", () => {
  async function violations(root: string): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(root, { recursive: true, withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === "ENOENT" || code === "ENOTDIR") return [];
      throw error;
    }
    return entries
      .flatMap((entry) => {
        const offense = projectionOffense(entry.name);
        if (offense === null) return [];
        const relPath = relative(root, join(entry.parentPath, entry.name)).split(sep).join("/");
        return [
          `${relPath}: ${offense} — platform formats are generated at emission, never ` +
            `hand-authored in the corpus`,
        ];
      })
      .toSorted();
  }

  it("holds across the corpus", async () => {
    expect(await violations(CORPUS_ROOT)).toEqual([]);
  });

  it("fixture: .mdc twins, AGENTS.md, and client directories are all flagged", async () => {
    const t = tempDir();
    await t.seedFiles({
      "rules/stamity-real.md": doc(head("real", "rule"), "Body."),
      "rules/stamity-real.mdc": "---\ndescription: twin\n---\nBody.\n",
      "AGENTS.md": "# projected charter\n",
      ".cursor/rules/stamity-real.mdc": "projection\n",
      "agents/stamity-real.agent.md": "projection\n",
    });

    const results = await violations(t.dir);

    // Sorted by full message; `/` precedes `:` in codepoint order.
    expect(results).toEqual([
      expect.stringMatching(/^\.cursor\/rules\/stamity-real\.mdc: a generated Cursor rule companion/),
      expect.stringMatching(/^\.cursor: a Cursor client directory/),
      expect.stringMatching(/^AGENTS\.md: the generated charter projection/),
      expect.stringMatching(/^agents\/stamity-real\.agent\.md: a generated per-agent projection/),
      expect.stringMatching(/^rules\/stamity-real\.mdc: a generated Cursor rule companion/),
    ]);
  });
});

describe("invariant 8 — the leak gate holds over content/ and src/roster/", () => {
  interface GateRule {
    id: string;
    /** The reserved token, assembled at run time from the gate's own fragments. */
    token: string;
    pattern: RegExp;
    allow: readonly string[];
  }

  /**
   * The gate's rule set, read from its source so this suite can never fork a
   * second list. The parser is deliberately narrow; if the gate's shape
   * changes, the sanity assertions below fail loudly and this parser follows.
   */
  async function loadGateRules(): Promise<GateRule[]> {
    const source = await readFile(GATE_SCRIPT, "utf8");
    const allowlistBody = /const\s+PREDECESSOR_ALLOWLIST\s*=\s*\[([^\]]*)\]/.exec(source)?.[1];
    const allowlist = allowlistBody === undefined ? [] : quoted(allowlistBody);

    const rules: GateRule[] = [];
    const entry = /\{\s*id:\s*'([^']+)',\s*parts:\s*\[([^\]]*)\],\s*allow:\s*(\[\]|[A-Za-z_$][\w$]*)/g;
    for (const match of source.matchAll(entry)) {
      const id = match[1] ?? "";
      const token = quoted(match[2] ?? "").join("");
      const allowRef = match[3] ?? "[]";
      if (allowRef !== "[]" && allowRef !== "PREDECESSOR_ALLOWLIST") {
        throw new Error(`leak-gate rule ${id}: unknown allow reference ${allowRef} — update this parser`);
      }
      if (token === "") throw new Error(`leak-gate rule ${id}: no fragments parsed`);
      rules.push({
        id,
        token,
        // The gate builds its pattern from the same joined fragments (case-insensitive).
        pattern: new RegExp(token, "i"),
        allow: allowRef === "[]" ? [] : allowlist,
      });
    }
    return rules;
  }

  const gateRules: Promise<GateRule[]> = loadGateRules();

  function violations(
    rules: readonly GateRule[],
    texts: readonly { repoRelPath: string; text: string }[],
  ): string[] {
    const problems: string[] = [];
    for (const { repoRelPath, text } of texts) {
      for (const rule of rules) {
        if (rule.allow.some((allowEntry) => allowMatches(allowEntry, repoRelPath))) continue;
        if (rule.pattern.test(repoRelPath) || rule.pattern.test(text)) {
          problems.push(
            `${repoRelPath}: matches reserved-name rule ${rule.id} from scripts/leak-gate.mjs`,
          );
        }
      }
    }
    return problems;
  }

  it("the gate defines at least the five reserved names, each with fragments", async () => {
    const rules = await gateRules;

    expect(rules.length).toBeGreaterThanOrEqual(5);
    expect(rules.some((rule) => rule.allow.length > 0)).toBe(true);
  });

  it("holds across content/ and src/roster/ — names and bodies", async () => {
    const corpusTexts = (await corpus).map((file) => ({
      repoRelPath: `content/${file.relPath}`,
      text: file.raw,
    }));
    const rosterEntries = await readdir(ROSTER_DIR, { recursive: true, withFileTypes: true });
    const rosterTexts = await Promise.all(
      rosterEntries
        .filter((dirent) => dirent.isFile())
        .map(async (dirent) => {
          const absPath = join(dirent.parentPath, dirent.name);
          return {
            repoRelPath: `src/roster/${relative(ROSTER_DIR, absPath).split(sep).join("/")}`,
            text: await readFile(absPath, "utf8"),
          };
        }),
    );

    expect(violations(await gateRules, [...corpusTexts, ...rosterTexts])).toEqual([]);
  });

  it("fixture: an assembled reserved token is caught, and the allowlist path is honored", async () => {
    const rules = await gateRules;
    const candidate = rules[0];
    const predecessor = rules.find((rule) => rule.allow.length > 0);
    expect(candidate).toBeDefined();
    expect(predecessor).toBeDefined();
    if (candidate === undefined || predecessor === undefined) return;

    const flagged = violations(rules, [
      { repoRelPath: "content/agents/stamity-x.md", text: `mentions ${candidate.token} once` },
    ]);
    expect(flagged).toEqual([
      `content/agents/stamity-x.md: matches reserved-name rule ${candidate.id} from scripts/leak-gate.mjs`,
    ]);

    // The same predecessor token is legal exactly where the gate allows it.
    const allowedPath = `${predecessor.allow[0] ?? ""}detect.ts`;
    expect(
      violations([predecessor], [{ repoRelPath: allowedPath, text: predecessor.token }]),
    ).toEqual([]);
    expect(
      violations([predecessor], [{ repoRelPath: "content/agents/stamity-x.md", text: predecessor.token }]),
    ).toHaveLength(1);
  });

  it("fixture: the real gate script fails a seeded violation in a scratch repo", async () => {
    const rules = await gateRules;
    const candidate = rules[0];
    expect(candidate).toBeDefined();
    if (candidate === undefined) return;

    const t = tempDir();
    const gateSource = await readFile(GATE_SCRIPT, "utf8");
    await t.seedFiles({
      "scripts/leak-gate.mjs": gateSource,
      "docs/note.md": "a clean file\n",
    });
    const gate = t.path("scripts", "leak-gate.mjs");

    const clean = spawnSync(process.execPath, [gate], { encoding: "utf8" });
    expect(clean.status, clean.stderr).toBe(0);

    await t.seedFiles({ "docs/note.md": `mentions ${candidate.token} once\n` });
    const dirty = spawnSync(process.execPath, [gate], { encoding: "utf8" });

    expect(dirty.status).toBe(1);
    expect(dirty.stderr).toContain(`[${candidate.id}]`);
    expect(dirty.stderr).toContain("docs/note.md");
  });
});

describe("invariant 9 — no minted product URLs; spec citations only", () => {
  const URL_PATTERN = /https?:\/\/[^\s<>()"'\]]+/gi;

  function isAllowlisted(url: string): boolean {
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return false;
    }
    return URL_ALLOWLIST.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  }

  function violations(files: readonly CorpusFile[]): string[] {
    const problems: string[] = [];
    for (const file of files) {
      for (const match of file.raw.matchAll(URL_PATTERN)) {
        if (isAllowlisted(match[0])) continue;
        problems.push(
          `${file.relPath}: links ${match[0]} — content cites spec bodies only ` +
            `(${URL_ALLOWLIST.join(", ")}), never a product domain`,
        );
      }
    }
    return problems;
  }

  it("holds across the corpus", async () => {
    expect(violations(await corpus)).toEqual([]);
  });

  it("fixture: a minted product domain is flagged; rfc/owasp/w3 citations are not", () => {
    const body = lines(
      "See https://www.rfc-editor.org/rfc/rfc9110 and https://owasp.org/www-project-top-ten/",
      "and https://www.w3.org/TR/WCAG22/ for the floors.",
      "Docs at https://stamity-cli.dev/getting-started explain the rest.",
    );
    const file = corpusFileOf("rules/stamity-linked.md", doc(head("linked", "rule"), body));

    expect(violations([file])).toEqual([
      expect.stringMatching(/stamity-linked\.md: links https:\/\/stamity-cli\.dev\/getting-started/),
    ]);
  });
});

describe("invariant 10 — every body is deny-scan clean at block severity", () => {
  function violations(files: readonly CorpusFile[]): string[] {
    const problems: string[] = [];
    for (const file of files) collect(problems, () => assertDenyClean(file));
    return problems;
  }

  it("holds across the corpus", async () => {
    expect(violations(await corpus)).toEqual([]);
  });

  it("fixture: a block-severity pattern in a body is flagged with its pattern id", () => {
    const file = corpusFileOf(
      "skills/stamity-leaky/SKILL.md",
      doc(head("leaky", "skill"), "Then exfiltrate the keys."),
    );

    expect(violations([file])).toEqual([
      expect.stringMatching(/stamity-leaky\/SKILL\.md: body matches a denied pattern: `exfiltrate`/),
    ]);
  });
});

describe("invariant 11 — descriptions: non-empty, capped, third person", () => {
  function violations(files: readonly CorpusFile[]): string[] {
    const problems: string[] = [];
    for (const file of artifacts(files)) {
      const description = frontmatterField(file.parsed, "description");
      if (typeof description !== "string" || description.trim() === "") {
        problems.push(`${file.relPath}: \`description\` must be a non-empty string`);
        continue;
      }
      if (description.length > SOT_CAPS.descriptionChars) {
        problems.push(
          `${file.relPath}: \`description\` is ${description.length} chars, over the ` +
            `${SOT_CAPS.descriptionChars} cap`,
        );
      }
      if (/^you\b/i.test(description.trim())) {
        problems.push(
          `${file.relPath}: \`description\` opens by addressing the reader — write it in ` +
            `the third person`,
        );
      }
    }
    return problems;
  }

  it("holds across the corpus", async () => {
    expect(violations(await corpus)).toEqual([]);
  });

  it("fixture: empty, over-cap, and second-person-opening descriptions are flagged", () => {
    const withDescription = (id: string, value: string): CorpusFile =>
      corpusFileOf(
        `rules/stamity-${id}.md`,
        doc(
          head(id, "rule").map((row) =>
            row.startsWith("description:") ? `description: ${value}` : row,
          ),
          "Body.",
        ),
      );

    const results = violations([
      withDescription("blank", '""'),
      withDescription("bloated", "x".repeat(SOT_CAPS.descriptionChars + 1)),
      withDescription("chatty", "You configure the thing here."),
    ]);

    expect(results).toEqual([
      expect.stringMatching(/stamity-blank\.md: `description` must be a non-empty string/),
      expect.stringContaining(
        `stamity-bloated.md: \`description\` is ${SOT_CAPS.descriptionChars + 1} chars, over the ${SOT_CAPS.descriptionChars} cap`,
      ),
      expect.stringMatching(/stamity-chatty\.md: `description` opens by addressing the reader/),
    ]);
  });
});

describe("invariant 12 — tags: non-empty, never a ctx: primary", () => {
  function violations(files: readonly CorpusFile[]): string[] {
    const problems: string[] = [];
    for (const file of artifacts(files)) {
      const tags = frontmatterField(file.parsed, "tags");
      const list =
        Array.isArray(tags) && tags.every((tag): tag is string => typeof tag === "string" && tag.trim() !== "")
          ? tags
          : null;
      if (list === null || list.length === 0) {
        problems.push(`${file.relPath}: \`tags\` must be a non-empty array of non-empty strings`);
        continue;
      }
      const primary = list[0] ?? "";
      if (isContextTag(primary)) {
        problems.push(
          `${file.relPath}: first tag ${JSON.stringify(primary)} is a ctx: tag — the primary ` +
            `classification must be a capability, not a compatibility statement`,
        );
      }
    }
    return problems;
  }

  it("holds across the corpus", async () => {
    expect(violations(await corpus)).toEqual([]);
  });

  it("fixture: empty tags and a ctx-first primary are flagged", () => {
    const withTags = (id: string, value: string): CorpusFile =>
      corpusFileOf(
        `rules/stamity-${id}.md`,
        doc(
          head(id, "rule").map((row) => (row === "tags: [review]" ? `tags: ${value}` : row)),
          "Body.",
        ),
      );

    const results = violations([
      withTags("bare", "[]"),
      withTags("shy", "[ctx:team-only, review]"),
    ]);

    expect(results).toEqual([
      expect.stringMatching(/stamity-bare\.md: `tags` must be a non-empty array/),
      expect.stringMatching(/stamity-shy\.md: first tag "ctx:team-only" is a ctx: tag/),
    ]);
  });
});

describe("invariant 13 — cross-references resolve: commands, tokens, mentions", () => {
  /**
   * Both regexes are anchored on the prefixes the engine ACTUALLY emits, and
   * that is the whole load they carry. A guard still looking for
   * `/stamity-<slug>` after the invocable surfaces moved to `st-` would match
   * nothing in the corpus and report zero violations forever — passing not
   * because every reference resolves but because it stopped reading. Widen
   * these the day a prefix is added, or this suite goes quietly blind.
   */
  const COMMAND_MENTION = /\/st-([a-z0-9][a-z0-9-]*)/g;
  const SUBSTITUTION_TOKEN = /\$\{STAMITY:[A-Z_]+\}/g;
  /** Bare artifact mentions under either engine prefix — `stamity-` for agents
   *  and rules, `st-` for commands and skills. The lookbehind keeps the slashed
   *  command spelling and mid-token hits out. */
  const BARE_MENTION = /(?<![/A-Za-z0-9_-])(?:stamity|st)-([a-z0-9][a-z0-9-]*)/g;

  function violations(files: readonly CorpusFile[]): string[] {
    const problems: string[] = [];
    const commandIds = new Set(
      artifacts(files)
        .filter((file) => classOf(file.relPath) === "command")
        .map(declaredId),
    );
    const knownIds = new Set(artifacts(files).map(declaredId));

    for (const file of files) {
      const prose = stripFencedBlocks(file.parsed.body);

      for (const match of prose.matchAll(COMMAND_MENTION)) {
        const slug = match[1] ?? "";
        if (!commandIds.has(slug)) {
          problems.push(`${file.relPath}: /st-${slug} does not resolve to a shipped command`);
        }
      }

      for (const match of file.raw.matchAll(SUBSTITUTION_TOKEN)) {
        if (!REPO_SUBSTITUTION_TOKENS.includes(match[0])) {
          problems.push(
            `${file.relPath}: ${match[0]} is not in REPO_SUBSTITUTION_TOKENS — an unwired ` +
              `token would reach the runtime agent verbatim`,
          );
        }
      }

      if (classOf(file.relPath) === "command" && file.parsed.hadFrontmatter) {
        for (const match of prose.matchAll(BARE_MENTION)) {
          const slug = match[1] ?? "";
          if (!knownIds.has(slug)) {
            problems.push(
              `${file.relPath}: mentions ${match[0]}, which no shipped artifact answers to`,
            );
          }
        }
      }
    }
    return problems;
  }

  it("holds across the corpus", async () => {
    expect(violations(await corpus)).toEqual([]);
  });

  it("fixture: a dangling command mention is flagged in prose but ignored inside a fence", () => {
    const command = corpusFileOf(
      "commands/st-real.md",
      doc([...head("real", "command"), "spawns: [worker]"], "Flow."),
    );
    const dangling = corpusFileOf(
      "agents/stamity-talker.md",
      doc(head("talker", "agent"), "Run /st-ghost when done. /st-real is fine."),
    );
    const fenced = corpusFileOf(
      "agents/stamity-quoter.md",
      doc(
        head("quoter", "agent"),
        lines("```", "/st-ghost — a hypothetical example", "```", "Prose after."),
      ),
    );

    expect(violations([command, dangling, fenced])).toEqual([
      expect.stringMatching(/stamity-talker\.md: \/st-ghost does not resolve/),
    ]);
  });

  it("fixture: an unwired substitution token is flagged", () => {
    const file = corpusFileOf(
      "agents/stamity-tokened.md",
      doc(head("tokened", "agent"), "Run ${STAMITY:NOT_A_REAL_TOKEN} before the gates."),
    );

    expect(violations([file])).toEqual([
      expect.stringMatching(/stamity-tokened\.md: \$\{STAMITY:NOT_A_REAL_TOKEN\} is not in/),
    ]);
  });

  it("fixture: a command body naming an unshipped artifact is flagged", () => {
    const skill = corpusFileOf("skills/st-known/SKILL.md", doc(head("known", "skill"), "Procedure."));
    const command = corpusFileOf(
      "commands/st-caller.md",
      doc(
        [...head("caller", "command"), "spawns: [worker]"],
        "Use the `st-known` skill, then the `st-unknown` skill.",
      ),
    );

    expect(violations([skill, command])).toEqual([
      expect.stringMatching(/st-caller\.md: mentions st-unknown, which no shipped artifact/),
    ]);
  });
});

describe("invariant 14 — the engine-reserved tools: key stays absent", () => {
  function violations(files: readonly CorpusFile[]): string[] {
    const problems: string[] = [];
    for (const file of artifacts(files)) {
      if (frontmatterField(file.parsed, "tools") !== undefined) {
        problems.push(
          `${file.relPath}: declares \`tools:\` — the target-tool restriction is reserved; ` +
            `every corpus artifact ships to all clients (agent grants use \`capabilities:\`)`,
        );
      }
    }
    return problems;
  }

  it("holds across the corpus", async () => {
    expect(violations(await corpus)).toEqual([]);
  });

  it("fixture: a tools: restriction is flagged even when its value is engine-valid", () => {
    const file = corpusFileOf(
      "rules/stamity-picky.md",
      doc([...head("picky", "rule"), "tools: [claude]"], "Body."),
    );

    expect(violations([file])).toEqual([
      expect.stringMatching(/rules\/stamity-picky\.md: declares `tools:`/),
    ]);
  });
});

describe("invariant 15 — the work body's stated review cap locksteps the engine", () => {
  function violations(files: readonly CorpusFile[]): string[] {
    const work = files.find((file) => file.relPath === WORK_RELATIVE_PATH);
    if (work === undefined) return [`${WORK_RELATIVE_PATH}: missing from the corpus walk`];
    const match = WORK_CAP_STATEMENT.exec(work.parsed.body);
    if (match === null) {
      return [
        `${WORK_RELATIVE_PATH}: body must state its review-loop cap as ` +
          `"Iteration cap: N rounds by default"`,
      ];
    }
    const stated = Number(match[1]);
    if (stated !== DEFAULT_MAX_REVIEW_ITERATIONS) {
      return [
        `${WORK_RELATIVE_PATH}: states an iteration cap of ${stated}; the engine's ` +
          `DEFAULT_MAX_REVIEW_ITERATIONS is ${DEFAULT_MAX_REVIEW_ITERATIONS} — lockstep the body`,
      ];
    }
    return [];
  }

  it("holds across the corpus", async () => {
    expect(violations(await corpus)).toEqual([]);
  });

  it("fixture: a drifted stated cap and a missing statement are both flagged", () => {
    const drifted = corpusFileOf(
      WORK_RELATIVE_PATH,
      doc(
        [...head("work", "command"), "spawns: [implementer]"],
        `Iteration cap: ${DEFAULT_MAX_REVIEW_ITERATIONS + 1} rounds by default.`,
      ),
    );
    expect(violations([drifted])).toEqual([
      expect.stringMatching(/states an iteration cap of \d+; the engine's/),
    ]);

    const silent = corpusFileOf(
      WORK_RELATIVE_PATH,
      doc([...head("work", "command"), "spawns: [implementer]"], "No cap sentence."),
    );
    expect(violations([silent])).toEqual([
      expect.stringMatching(/body must state its review-loop cap/),
    ]);
  });
});

describe("invariant 16 — the escalation ladder locksteps the engine cap wherever it is stated", () => {
  /**
   * The ladder is prompt-carried on every client (SoT 24), so its stages exist
   * only as text — in two bodies, which the shipped ladder inherited from a SoT
   * written against a cap of at least five. At the shipped default of four the
   * second stage was unreachable, so both bodies promised a round that never
   * runs.
   *
   * The checker derives the stages from {@link DEFAULT_MAX_REVIEW_ITERATIONS}
   * rather than restating them: the same-fixer run ends one round below the
   * cap, the cap's own round carries the single escalation, and no body may
   * name a round beyond it. A cap change fails here instead of shipping a stale
   * promise, and it fails for every body at once — which is the property a
   * two-body contract needs.
   */
  function violations(files: readonly CorpusFile[]): string[] {
    const problems: string[] = [];
    const lastSameFixer = DEFAULT_MAX_REVIEW_ITERATIONS - 1;

    for (const relPath of LADDER_BODIES) {
      const file = files.find((candidate) => candidate.relPath === relPath);
      if (file === undefined) {
        problems.push(`${relPath}: missing from the corpus walk`);
        continue;
      }
      const flat = file.parsed.body.replaceAll(/\s+/g, " ");

      if (!flat.toLowerCase().includes(`rounds 1–${lastSameFixer}`)) {
        problems.push(
          `${relPath}: the same-fixer stage must read "rounds 1–${lastSameFixer}" — ` +
            `one round below the engine's cap of ${DEFAULT_MAX_REVIEW_ITERATIONS}`,
        );
      }
      if (!flat.toLowerCase().includes(`round ${DEFAULT_MAX_REVIEW_ITERATIONS}`)) {
        problems.push(
          `${relPath}: the escalation stage must name round ${DEFAULT_MAX_REVIEW_ITERATIONS}, ` +
            `the last round the default cap reaches`,
        );
      }
      if (!flat.includes("fresh fixer on a stronger model class")) {
        problems.push(`${relPath}: the escalation stage must name the fresh fixer and its class`);
      }
      if (!flat.includes("BLOCKED_FAILURE")) {
        problems.push(`${relPath}: the cap must terminate as BLOCKED_FAILURE`);
      }
      for (const match of flat.matchAll(ROUND_NUMBERS)) {
        for (const group of [match[1], match[2]]) {
          if (group === undefined || Number(group) <= DEFAULT_MAX_REVIEW_ITERATIONS) continue;
          problems.push(
            `${relPath}: "${match[0]}" names a round past the default cap of ` +
              `${DEFAULT_MAX_REVIEW_ITERATIONS} — unreachable without an operator raising it`,
          );
        }
      }
    }
    return problems;
  }

  it("holds across the corpus", async () => {
    expect(violations(await corpus)).toEqual([]);
  });

  it("fixture: the inherited two-stage ladder is flagged in whichever body carries it", () => {
    const stale = LADDER_BODIES.map((relPath) => {
      const isCommand = classOf(relPath) === "command";
      return corpusFileOf(
        relPath,
        doc(
          [
            ...head(filenameSlug(relPath), isCommand ? "command" : "agent"),
            ...(isCommand ? ["spawns: [implementer]"] : []),
          ],
          `Rounds 1–3 keep the same fixer; rounds 4–5 spawn a fresh fixer on a stronger ` +
            `model class; at the cap the run stops as BLOCKED_FAILURE.`,
        ),
      );
    });

    // Round 5 is the stale promise; the "round 4" stage sentence is absent too,
    // so each body reports both defects.
    expect(violations(stale)).toEqual(
      LADDER_BODIES.flatMap((relPath) => [
        expect.stringMatching(new RegExp(`${relPath}: the escalation stage must name round 4`)),
        expect.stringMatching(new RegExp(`${relPath}: "rounds 4–5" names a round past`)),
      ]),
    );
  });
});

describe("invariant 17 — the Model-Independence Contract, over every shipped markdown file", () => {
  /**
   * Match per token, case-insensitive; the token list is the only source.
   *
   * The boundary treats `-` as a SEPARATOR rather than as part of the word, so a
   * token is found when it is a segment of a hyphenated identifier. This is the
   * shape a real model id is written in — `gpt-4`, `claude-opus-4`,
   * `gemini-1.5-pro`, `llama-3`, `copilot-instructions` — and an earlier boundary
   * of `(?<![\w-])…(?![\w-])` matched NONE of them: it excluded a neighbouring
   * hyphen on both sides, so the invariant named "the Model-Independence
   * Contract" missed every model id in its canonical spelling and caught only the
   * bare family word. The per-suite copies this list replaced used `\b`, which
   * did catch `gpt-4`, so keeping the narrow boundary while deleting them would
   * have quietly traded coverage for consolidation. `_` stays inside the word
   * (`claude_code` is still one hit, not a miss) because an underscore joins an
   * identifier where a hyphen joins a model id's parts.
   *
   * Widening cost nothing to declare: it adds zero violations across the shipped
   * corpus, so no allowance row exists to absorb it. The fixtures below pin both
   * halves — hyphenated ids caught, ordinary prose untouched.
   */
  function hitsIn(raw: string): string[] {
    const found = new Set<string>();
    for (const token of VENDOR_TOKENS) {
      const pattern = new RegExp(`(?<![A-Za-z0-9])${token}(?![A-Za-z0-9])`, "i");
      if (pattern.test(raw)) found.add(token);
    }
    return [...found].toSorted();
  }

  function allowedFor(relPath: string): readonly string[] {
    return VENDOR_TOKEN_ALLOWANCES.find((row) => row.relPath === relPath)?.tokens ?? [];
  }

  function violations(files: readonly CorpusFile[]): string[] {
    const problems: string[] = [];
    for (const file of files) {
      const allowed = allowedFor(file.relPath);
      for (const token of hitsIn(file.raw)) {
        if (allowed.includes(token)) continue;
        problems.push(
          `${file.relPath}: names "${token}" — shipped content is model-independent. A vendor ` +
            `or model id strands the wording on a name that will be renamed; a client id makes ` +
            `a portable artifact client-specific unless the sentence is adapter-facing, in ` +
            `which case declare it in VENDOR_TOKEN_ALLOWANCES with which class it is`,
        );
      }
    }
    return problems;
  }

  it("holds across content/", async () => {
    expect(violations(await corpus)).toEqual([]);
  });

  it("holds across packs/ — the tree that carried no vendor check at all", async () => {
    const packs = await walkAllMarkdown(PACKS_ROOT);

    // Non-degenerate: the walk must actually find pack bodies, or a green
    // result means the check ran over nothing.
    expect(packs.length).toBeGreaterThan(0);
    expect(violations(packs)).toEqual([]);
  });

  it("fixture: a seeded vendor id, model id, and client id are each flagged", () => {
    const seeded = (id: string, sentence: string): CorpusFile =>
      corpusFileOf(`agents/stamity-${id}.md`, doc(head(id, "agent"), sentence));

    const results = violations([
      seeded("vendorish", "Escalate to the anthropic endpoint when the run stalls."),
      seeded("modelish", "Round 4 spawns a fresh fixer on opus."),
      seeded("clientish", "Write the plan to the copilot instructions file."),
      seeded("clean", "Round 4 spawns a fresh fixer on a stronger model class."),
    ]);

    expect(results).toEqual([
      expect.stringMatching(/stamity-vendorish\.md: names "anthropic"/),
      expect.stringMatching(/stamity-modelish\.md: names "opus"/),
      expect.stringMatching(/stamity-clientish\.md: names "copilot"/),
    ]);
  });

  it("fixture: an allowance is per file and per token, never a blanket pass", () => {
    const allowance = VENDOR_TOKEN_ALLOWANCES[0];
    expect(allowance).toBeDefined();
    if (allowance === undefined) return;

    const sentence = `Values: \`${allowance.tokens.join("`, `")}\`.`;
    const allowedFile = corpusFileOf(allowance.relPath, doc(head("handoff", "skill"), sentence));
    // The same sentence in any other file is still a violation, and a token the
    // row does not name is a violation even inside it.
    const elsewhere = corpusFileOf("agents/stamity-copycat.md", doc(head("copycat", "agent"), sentence));
    const extraToken = corpusFileOf(
      allowance.relPath,
      doc(head("handoff", "skill"), `${sentence} Prefer sonnet for the summary.`),
    );

    expect(violations([allowedFile])).toEqual([]);
    expect(violations([elsewhere])).toHaveLength(allowance.tokens.length);
    expect(violations([extraToken])).toEqual([
      expect.stringMatching(/st-handoff\/SKILL\.md: names "sonnet"/),
    ]);
  });

  it("gives every allowance a stated class and reason", () => {
    for (const row of VENDOR_TOKEN_ALLOWANCES) {
      expect(row.tokens.length, `${row.relPath}: an allowance with no tokens`).toBeGreaterThan(0);
      expect(
        /adapter-facing|homograph/.test(row.why),
        `${row.relPath}: an allowance must say which class it is — adapter-facing or homograph`,
      ).toBe(true);
      for (const token of row.tokens) {
        expect(VENDOR_TOKENS, `${row.relPath}: allows "${token}", which is not a tracked token`)
          .toContain(token);
      }
    }
  });

  it("covers every token the per-suite regexes it replaces enforced", () => {
    // The union the eight copies checked between them, so consolidating onto
    // one list cannot quietly narrow the contract. `claude` appears in both
    // families and is listed once.
    for (const token of [
      "anthropic",
      "openai",
      "chatgpt",
      "claude",
      "opus",
      "sonnet",
      "haiku",
      "gpt",
      "gemini",
      "llama",
      "mistral",
      "deepseek",
      "qwen",
      "grok",
      "cursor",
      "copilot",
      "codex",
    ]) {
      expect(VENDOR_TOKENS).toContain(token);
    }
    expect(new Set(VENDOR_TOKENS).size, "VENDOR_TOKENS has a duplicate").toBe(VENDOR_TOKENS.length);
  });

  it("covers the SHAPE those regexes enforced, not only their tokens", () => {
    // Token-level coverage is half of "no narrowing". The copies matched with
    // `\b`, which fires on a hyphenated model id, so a boundary that skipped
    // `gpt-4` would have narrowed the contract while every token-list assertion
    // above stayed green. The canonical spellings are pinned as cases.
    for (const id of [
      "gpt-4",
      "claude-opus-4",
      "gemini-1.5-pro",
      "llama-3",
      "copilot-instructions",
    ]) {
      expect(hitsIn(`Escalate to ${id} when the run stalls.`), `${id}: not flagged`)
        .not.toEqual([]);
    }

    // `_` joins an identifier rather than a model id's parts, so it stays inside
    // the word and the family name is still one hit.
    expect(hitsIn("The claude_code path is the default.")).toEqual(["claude"]);

    // The other half of the boundary: a longer word that merely contains a family
    // name is not a hit, or the invariant would fire on ordinary prose.
    for (const word of ["grokking", "sonnets", "llamas"]) {
      expect(hitsIn(`The ${word} pass runs last.`), `${word}: false positive`).toEqual([]);
    }
  });

  it("no suite under test/corpus/agents/ re-implements this check", async () => {
    // The other half of that deletion — "the per-suite regexes are
    // deleted AND no suite re-adds one". This guard replaces the file-local one
    // that lived in `spine.test.ts`: that version carried its own 17-token copy
    // of the list to scan for, which is the same duplication the finding is
    // about, and it covered one file. This one reads `VENDOR_TOKENS` — so the
    // tokens are named once in the repo — and derives its file set from the
    // directory, so a suite added there tomorrow is covered without an edit here.
    const dir = join(REPO_ROOT, "test", "corpus", "agents");
    const suites = (await readdir(dir)).filter((name) => name.endsWith(".test.ts")).toSorted();

    // Non-degenerate: a green result must not be able to mean the walk found
    // nothing to scan.
    expect(
      suites.length,
      `${dir}: no suites found — the guard would be passing over an empty set`,
    ).toBeGreaterThanOrEqual(3);

    const sources = await Promise.all(suites.map((name) => readFile(join(dir, name), "utf8")));
    const readded = suites.flatMap((name, index) =>
      hitsIn(sources[index] ?? "").map((token) => `${name}: names "${token}"`),
    );

    expect(
      readded,
      "a per-suite vendor list is back under test/corpus/agents/. The Model-Independence " +
        "Contract is this invariant — one token list over every shipped markdown file, " +
        "including packs/. Widen VENDOR_TOKENS here; do not mint a second copy in a suite",
    ).toEqual([]);

    // Non-degeneracy on the detector rather than only on the walk: the exact copy
    // deleted from these three suites is caught if it comes back.
    expect(hitsIn(String.raw`/\b(?:gpt|chatgpt|openai|anthropic|claude|opus)\b/i`)).toEqual([
      "anthropic",
      "chatgpt",
      "claude",
      "gpt",
      "openai",
      "opus",
    ]);
  });
});
