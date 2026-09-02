import { describe, expect, it } from "vitest";
import { frontmatterField } from "../../../src/content/frontmatter.ts";
import { planMdcCompanions } from "../../../src/content/mdcCompanions.ts";
import { CONTENT_DENY_PATTERNS, scanForDeniedPatterns } from "../../../src/denyscan/denyScan.ts";
import {
  assertDenyClean,
  assertLineCap,
  filenameSlug,
  loadCorpusIndex,
  requireLoadClass,
  requireObsoleteWhen,
  walkAllMarkdown,
  type CorpusFile,
} from "../harness.ts";

/**
 * The four protocol rules — question-protocol, injection-screening,
 * learnings-schema, ai-evals — as a contract over their shipped bodies.
 *
 * What this suite binds beyond the corpus-wide frontmatter contract:
 *
 *   - **Activation shape.** A rule is conditional (globs) or agent-requested
 *     (description-driven); `scope: always` does not exist in this corpus, and
 *     the charter is the only always-on artifact. Both directions are asserted,
 *     and the same four rules are run through the companion planner so an
 *     authoring shape that the Cursor projection would only warn about fails
 *     here instead.
 *   - **Self-survival of the screening rule.** A rule about injection patterns
 *     is the one body most likely to trip the write-path deny scan. It names
 *     classes and cites the engine catalog by path; the assertion is that the
 *     body carries zero block-severity hits while still naming enough classes
 *     to be useful.
 *   - **Named degradations.** The behaviours that are easy to drop in an edit
 *     and expensive to lose at runtime: the unattended-run default, the
 *     do-not-echo posture, the vendor-neutral eval floor.
 *   - **Curation posture where no gate decides.** The learnings rule quotes no
 *     cap, enum, or field tier any more — the write gate reports each one
 *     inline — so what is bound here is the residual it does carry: what earns
 *     a file, and what a refusal at the cap is answered with.
 *
 * Prose assertions run against a whitespace-flattened view ({@link flow}) so a
 * reflowed paragraph is not a failure; structural assertions (headings, caps,
 * tables) run against the raw body.
 */

/** Body cap for every rule: the authoring anatomy's ceiling. */
const RULE_BODY_CAP = 120;

/** The two sanctioned rule activation modes. `always` is banned corpus-wide. */
const RULE_SCOPES: readonly string[] = ["agent-requested", "conditional"];

interface ProtocolRule {
  /** Bare frontmatter id, which is also the filename slug. */
  id: string;
  relPath: string;
  tags: string[];
  scope: "agent-requested" | "conditional";
  /** Declared exactly when the scope is conditional. */
  globs?: string[];
}

const RULES: readonly ProtocolRule[] = [
  {
    id: "question-protocol",
    relPath: "rules/stamity-question-protocol.md",
    tags: ["orchestration"],
    scope: "agent-requested",
  },
  {
    id: "injection-screening",
    relPath: "rules/stamity-injection-screening.md",
    tags: ["maintenance", "floor:security"],
    scope: "conditional",
    globs: [".stamity/**"],
  },
  {
    id: "learnings-schema",
    relPath: "rules/stamity-learnings-schema.md",
    tags: ["maintenance"],
    scope: "conditional",
    globs: [".stamity/learnings/**"],
  },
  {
    id: "ai-evals",
    relPath: "rules/stamity-ai-evals.md",
    tags: ["ai"],
    scope: "agent-requested",
  },
];

/** One walk for the whole suite; the corpus does not change under it. */
const corpus = walkAllMarkdown();

async function load(relPath: string): Promise<CorpusFile> {
  const file = (await corpus).find((candidate) => candidate.relPath === relPath);
  if (file === undefined) {
    throw new Error(`${relPath}: not present under the corpus root`);
  }
  return file;
}

/** Every whitespace run collapsed, so a wrapped sentence still reads as one. */
function flatten(text: string): string {
  return text.replace(/\s+/g, " ");
}

/** The whole body, flattened. */
function flow(file: CorpusFile): string {
  return flatten(file.parsed.body);
}

/** The text of a top-level `## <heading>` section, up to the next top-level heading. */
function section(file: CorpusFile, heading: string): string {
  const marker = `\n## ${heading}\n`;
  const start = file.parsed.body.indexOf(marker);
  expect(start, `${file.relPath}: no "## ${heading}" section`).toBeGreaterThanOrEqual(0);
  const rest = file.parsed.body.slice(start + marker.length);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("protocol rules — frontmatter contract", () => {
  it.each(RULES)("$id carries the rule identity head", async (rule) => {
    const file = await load(rule.relPath);

    expect(frontmatterField(file.parsed, "id")).toBe(rule.id);
    expect(filenameSlug(file.relPath)).toBe(rule.id);
    expect(frontmatterField(file.parsed, "type")).toBe("rule");
    expect(frontmatterField(file.parsed, "tags")).toEqual(rule.tags);

    const description = frontmatterField(file.parsed, "description");
    expect(typeof description).toBe("string");
    expect(String(description).length).toBeGreaterThan(0);
    expect(String(description).length).toBeLessThanOrEqual(1024);
    // Third person: a description addressing the reader is second person by construction.
    expect(String(description)).not.toMatch(/\b(?:you|your|yours|yourself)\b/i);

    // Rules load on context match. Only the charter may declare `always`.
    requireLoadClass(file, ["on-demand"]);
    requireObsoleteWhen(file);
  });

  it.each(RULES)("$id declares a sanctioned activation shape", async (rule) => {
    const file = await load(rule.relPath);
    const scope = frontmatterField(file.parsed, "scope");
    const globs = frontmatterField(file.parsed, "globs");

    expect(RULE_SCOPES).toContain(scope);
    expect(scope).toBe(rule.scope);
    // `scope: always` is banned in rules — always-on content is the charter's.
    expect(scope).not.toBe("always");

    if (rule.scope === "conditional") {
      // Authored as a YAML string array, not a bare CSV: the engine's glob
      // reader accepts both, and only one of them survives review intact.
      expect(globs).toEqual(rule.globs);
      expect(Array.isArray(globs) && globs.length > 0).toBe(true);
    } else {
      // An agent-requested rule declaring globs is a hard contradiction in the
      // companion transform, so the absence is asserted, not assumed.
      expect(globs).toBeUndefined();
    }
  });

  it("projects to Cursor companions with no warnings and the expected shapes", async () => {
    const index = await loadCorpusIndex();
    // Scoped to this unit's four rules: a sibling unit's rule defect belongs to
    // that unit's suite, not to this one.
    const owned = index.items.filter(
      (item) => item.type === "rule" && RULES.some((rule) => rule.id === item.id),
    );
    expect(owned.map((item) => item.id).toSorted()).toEqual(
      RULES.map((rule) => rule.id).toSorted(),
    );

    const warnings: string[] = [];
    const companions = planMdcCompanions(owned, { warnings });

    expect(warnings).toEqual([]);
    expect(companions).toHaveLength(RULES.length);

    for (const rule of RULES) {
      const companion = companions.find((planned) =>
        planned.outputPath.endsWith(`stamity-${rule.id}.mdc`),
      );
      expect(companion, `${rule.relPath}: no planned companion`).toBeDefined();
      const content = companion?.content ?? "";
      expect(content).toContain("alwaysApply: false");
      expect(content).not.toContain("alwaysApply: true");
      if (rule.scope === "conditional") {
        const rendered = (rule.globs ?? []).map((glob) => `"${glob}"`).join(", ");
        expect(content).toContain(`globs: [${rendered}]`);
      } else {
        expect(content).not.toContain("globs:");
      }
    }
  });
});

describe("protocol rules — body budget and write-path hygiene", () => {
  it.each(RULES)("$id stays inside the rule body cap and scans clean", async (rule) => {
    const file = await load(rule.relPath);

    assertLineCap(file, RULE_BODY_CAP);
    assertDenyClean(file);
  });

  it.each(RULES)("$id opens with a title and carries Floor and Gates", async (rule) => {
    const file = await load(rule.relPath);

    expect(file.parsed.body.trimStart()).toMatch(/^# \S/);
    expect(section(file, "Floor").trim().length).toBeGreaterThan(0);
    expect(section(file, "Gates").trim().length).toBeGreaterThan(0);
  });

  it.each(RULES)("$id mints no URL", async (rule) => {
    const file = await load(rule.relPath);

    // Content links no product domain; these four cite no external standard by
    // URL at all, so the absence is exact rather than allowlisted.
    expect(file.parsed.body).not.toMatch(/https?:\/\//);
  });
});

describe("question-protocol — the five triggers and the ask shape", () => {
  it("enumerates five triggers as a numbered list", async () => {
    const floor = section(await load("rules/stamity-question-protocol.md"), "Floor");
    const numbered = [...floor.matchAll(/^(\d+)\. \*\*(.+?)\*\*/gm)];

    // Items 1-5 are the trigger set; later numbered items carry the ask shape,
    // the sub-agent contract, and the unattended-run degradation.
    const triggers = numbered.slice(0, 5).map((match) => match[2]);
    expect(triggers).toEqual([
      "Ambiguous scope",
      "Multiple valid interpretations",
      "Irreversible action",
      "Missing acceptance criteria",
      "Unattested product decision",
    ]);
    expect(numbered.length).toBeGreaterThanOrEqual(5);
  });

  it("fixes the ask shape: one question, 2-4 options, a declared default", async () => {
    // TEST CHANGE, justified: the ask-shape row demanded the LITERAL
    // `Default if no response:` line, and no asking flow in the corpus emits
    // it — measured across plan, rework, pr-resolve and three pack flows — so
    // the gate was unmeetable as written and a headless run had no default at
    // all. The requirement is now semantic: a declared default binds, its
    // wording does not. The literal survives as this rule's own spelling, which
    // is what the two assertions below keep pinned.
    const file = await load("rules/stamity-question-protocol.md");
    const text = flow(file);

    expect(text).toMatch(/one question per turn/i);
    expect(text).toMatch(/two to four numbered options/i);
    expect(text).toMatch(/one-line trade-off/i);
    expect(text).toContain("Default if no response: <N>");
    expect(text).toMatch(/lowest-blast-radius reversible/i);

    // The binding requirement is the declaration, not the string.
    expect(text).toMatch(/every\s+question declares which option runs if no answer arrives/i);
    expect(text).toMatch(/what\s+binds is the declaration, not its spelling/i);
    expect(text).toMatch(/says the same thing in its own\s+words has still declared a default/i);

    // And the gate matches the floor: no literal is demanded of the caller.
    const gates = flatten(section(file, "Gates"));
    expect(gates).toMatch(/one declared\s+default, in whatever words the asking flow uses/i);
    expect(gates).toMatch(/leaving the unanswered case unstated/i);
    expect(gates).not.toMatch(/exactly one\s+`Default if no response:` line/i);
  });

  it("routes sub-agent ambiguity to BLOCKED_AMBIGUITY instead of an operator prompt", async () => {
    const text = flow(await load("rules/stamity-question-protocol.md"));

    expect(text).toContain("BLOCKED_AMBIGUITY");
    expect(text).toMatch(/sub-agents do not ask/i);
    expect(text).toMatch(/no operator channel/i);
    expect(text).toMatch(/the orchestrator owns the live question/i);
  });

  it("states the unattended-run degradation: declared default runs and is logged", async () => {
    const text = flow(await load("rules/stamity-question-protocol.md"));

    // Edge case: a scheduled or headless run with nobody to answer. The default
    // executes and the run says so; only a question with no default line stops.
    expect(text).toMatch(/scheduled, headless, or unattended run/i);
    expect(text).toMatch(/the declared default executes/i);
    expect(text).toContain("Default applied:");
    // Wording follows the ask-shape row: what stops a run is the
    // absence of a DECLARED default, not the absence of one literal line.
    expect(text).toMatch(/without a declared default stops at `BLOCKED_AMBIGUITY`/i);
    expect(text).toMatch(/silent pick is the single disallowed outcome/i);
  });

  it("blocks writes while a trigger is unresolved and refuses manufactured questions", async () => {
    const file = await load("rules/stamity-question-protocol.md");

    expect(flow(file)).toMatch(/no file is mutated while a trigger is live and unresolved/i);
    // The opposite failure: asking for the sake of asking.
    expect(flow(file)).toMatch(/resolves nothing/i);
    expect(flatten(section(file, "Gates"))).toMatch(/audit trail/i);
  });
});

describe("injection-screening — survives its own subject", () => {
  it("names at least four screening classes as ids", async () => {
    const file = await load("rules/stamity-injection-screening.md");
    const classes = [...file.parsed.body.matchAll(/^\| `([a-z][a-z-]+)` \|/gm)].map(
      (match) => match[1] ?? "",
    );

    expect(classes.length).toBeGreaterThanOrEqual(4);
    expect(classes).toContain("instruction-override");
    expect(classes).toContain("tool-preamble");
    expect(classes).toContain("invisible-smuggling");
    expect(classes.some((id) => id.startsWith("exfil"))).toBe(true);
  });

  it("carries zero block-severity deny hits — the classic self-trip", async () => {
    const file = await load("rules/stamity-injection-screening.md");

    // Asserted twice on purpose: the harness helper is the corpus-wide gate,
    // and the explicit scan names any offending pattern id in the failure.
    assertDenyClean(file);
    const hits = scanForDeniedPatterns(file.parsed.body, CONTENT_DENY_PATTERNS).filter(
      (hit) => hit.severity === "block",
    );
    expect(hits.map((hit) => hit.patternId)).toEqual([]);
  });

  it("cites the engine catalog by path instead of restating patterns", async () => {
    const text = flow(await load("rules/stamity-injection-screening.md"));

    expect(text).toContain("src/denyscan/denyScan.ts");
    // Qualified so the path does not read as this repository's own tree.
    expect(text).toMatch(/not in this repository/i);
    expect(text).toMatch(/never reproduces their pattern text/i);
  });

  it("splits the write gate from the read screen and states why both exist", async () => {
    const text = flow(await load("rules/stamity-injection-screening.md"));

    expect(text).toMatch(/the write gate refuses a block-severity hit before the bytes land/i);
    expect(text).toMatch(/session-start script re-screens/i);
    expect(text).toMatch(/paths the write gate never saw/i);
    expect(text).toMatch(/less context rather than with poisoned context/i);
  });

  it("treats state text as data and refuses to echo a matched span", async () => {
    const file = await load("rules/stamity-injection-screening.md");
    const text = flow(file);

    expect(text).toMatch(/user-tier data/i);
    expect(text).toMatch(/they do not issue one/i);
    expect(text).toMatch(/report the hit; do not echo it/i);
    expect(text).toMatch(/delivers the payload that the skip just refused/i);
    // Evading the screen by rewording is named as the failure, not a workaround.
    expect(text).toMatch(/rewording to pass is the defect/i);
    expect(flatten(section(file, "Gates"))).toMatch(/no matched span appears in the output/i);
  });
});

describe("learnings-schema — states the contract, never the shapes", () => {
  // TEST CHANGE, justified: four cases retired here in one edit. They pinned the
  // schema half of this rule — the frontmatter field table and its tiers, the broken-
  // digest recovery route, the caps and enums quoted against the engine constants, and
  // the integrity/expired-`reviewBy` posture. The rule was folded to its curation
  // residual because `src/learnings/validation.ts` now reports every schema
  // requirement inline at the write gate: `stamity learn capture` names the
  // requirement a draft failed and the rewrite it wants, and `stamity validate`
  // reports each one by file and reason. Prose restating that could only go stale
  // against the gate that decides it, so the rule stopped carrying it and the cases
  // lost their subject.
  //
  // The engine-parity intent of the numbers case — a cap change under `src/learnings/`
  // failing a test rather than leaving stale prose behind — is retired with it, not
  // relocated: the rule quotes no number any more, so there is no prose left to go
  // stale and nothing for a parity assertion to compare. The engine's own suites cover
  // the constants. The two cases below are untouched; each still has its premise.

  it("triggers consolidation on something a run can observe", async () => {
    // The gate instructed consolidation "at 80% of the file cap". The
    // engine has no such threshold — the cap is enforced at the ceiling
    // (`persistLearning` refuses at `caps.maxCount`) — and neither capture nor
    // the session banner emits a count against it, so the number was
    // unobservable to the agent told to act on it.
    const file = await load("rules/stamity-learnings-schema.md");
    const gates = flatten(section(file, "Gates"));

    expect(gates).toMatch(/the cap refusal on capture/i);
    expect(gates).toMatch(/over-cap lines `stamity validate` prints/i);
    expect(gates).toMatch(/nothing reports a percentage/i);
    expect(file.raw).not.toContain("80%");
    expect(file.raw).not.toMatch(/\b80 percent\b/i);
  });

  it("keeps a curation posture at the cap and promotes on verified outcomes", async () => {
    const file = await load("rules/stamity-learnings-schema.md");
    const text = flow(file);

    expect(text).toMatch(/curation signal, not a repair target/i);
    expect(text).toMatch(/retiring or merging notes, not raising the ceiling/i);
    expect(text).toMatch(/verified learning outranks a plausible hypothesis/i);
    expect(text).toMatch(/being consulted often is popularity, not evidence/i);
    expect(flatten(section(file, "Gates"))).toMatch(/cited by id/i);
  });
});

describe("ai-evals — measurement floor, vendor-neutral", () => {
  it("requires golden and adversarial cases before ship", async () => {
    const text = flow(await load("rules/stamity-ai-evals.md"));

    expect(text).toMatch(/the eval set exists before the feature ships/i);
    expect(text).toMatch(/\*golden\* cases/i);
    expect(text).toMatch(/\*adversarial\* cases/i);
    expect(text).toMatch(/content it reads but did not author/i);
  });

  it("gates prompt and model changes, offline before online, results as artifacts", async () => {
    const file = await load("rules/stamity-ai-evals.md");
    const text = flow(file);

    expect(text).toMatch(/changing any one of them re-runs the set/i);
    expect(text).toMatch(/offline before online/i);
    expect(text).toMatch(/never stands in for the set/i);
    expect(text).toMatch(/results are artifacts, not chat/i);
    expect(text).toMatch(/thresholds are declared before the run/i);
    expect(flatten(section(file, "Gates"))).toMatch(/fails the change the way a red test does/i);
  });

  it("names no model, vendor, or eval product", async () => {
    const body = (await load("rules/stamity-ai-evals.md")).parsed.body;

    // The model-independence contract: capability shifts may obsolete an
    // artifact, but they must never strand its wording on a vendor's name.
    const named =
      /\b(?:openai|anthropic|claude|gpt|gemini|llama|mistral|cohere|copilot|cursor|codex|promptfoo|deepeval|ragas|braintrust|langchain)\b/i;
    expect(body).not.toMatch(named);
  });

  it("carries no applicability caveat — agent-requested scope is the filter", async () => {
    const file = await load("rules/stamity-ai-evals.md");

    // Edge case: a repo with no AI surface. The rule simply never attaches, so
    // the body states its floor without hedging about whether it applies.
    expect(frontmatterField(file.parsed, "scope")).toBe("agent-requested");
    expect(flow(file)).not.toMatch(
      /if (?:this|your|the) (?:project|repo|repository) (?:has no|does not|contains no)/i,
    );
    expect(flow(file)).not.toMatch(/skip this rule|does not apply|ignore this section/i);
  });
});
