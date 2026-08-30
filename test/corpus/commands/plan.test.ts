import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { typeIdKey } from "../../../src/content/catalog.ts";
import { frontmatterField } from "../../../src/content/frontmatter.ts";
import { scanAntiSlop } from "../../../src/denyscan/denyScan.ts";
import {
  CORPUS_ROOT,
  assertDenyClean,
  assertLineCap,
  corpusFileOf,
  filenameSlug,
  loadCorpusIndex,
  requireLoadClass,
  requireObsoleteWhen,
  type CorpusFile,
} from "../harness.ts";

/**
 * `/st-plan` — the intent-routing planner, one command absorbing the
 * predecessor's seven plan-family commands. The suite binds what the design
 * fixes rather than how the prose reads: the command-class frontmatter contract
 * (through the shared harness, so a contract change lands in one place), the
 * declared spawn set that makes this a command rather than a skill, the six
 * intent sections, the three plan-lint checks, and the four design edge cases —
 * work boundary, report-not-fix, business-lens degradation, and the oversized
 * plan split.
 *
 * Section-scoped assertions throughout: a claim asserted against the whole body
 * passes when the sentence sits under the wrong heading, which is exactly the
 * regression an absorbed-seven-commands artifact invites. {@link sectionOf}
 * throws on an absent heading so a renamed section fails loudly instead of
 * silently emptying its own assertions.
 */

/** The artifact under test, addressed by its corpus-relative path. */
const RELATIVE_PATH = "commands/st-plan.md";

/** Command body cap (plan-family units share the 500-line command ceiling). */
const BODY_MAX_LINES = 500;

/** The six intents, as their exact `## ` headings, in routing order. */
const INTENT_HEADINGS = [
  "## Feature",
  "## Bug",
  "## Refactor",
  "## Migration",
  "## Test",
  "## Roadmap",
] as const;

/** The three deterministic plan-lint checks, named verbatim in the gate table. */
const PLAN_LINT_CHECKS = [
  "Testable acceptance criteria",
  "Dependencies resolve",
  "Edge cases non-empty",
] as const;

/** Per-unit fields a context-free implementer needs; the fresh-context criteria rest on them. */
const UNIT_FIELDS = [
  "`id`",
  "`files`",
  "`interfaces`",
  "`testCriteria`",
  "`edgeCases`",
  "`depends_on`",
  "`verify`",
] as const;

/** Mechanical second-person proxy — the register failure that actually occurs in descriptions. */
const SECOND_PERSON = /\b(?:you|your|yours|yourself)\b/i;

/** Model-Independence Contract: shipped content names no vendors or models. */
const VENDOR_OR_MODEL_NAMES =
  /\b(?:claude|cursor|copilot|codex|anthropic|openai|gemini|gpt|llama|mistral)\b/i;

/** Content artifacts mint no product URLs or domains. */
const URL_OR_DOMAIN = /https?:\/\/|www\./i;

/**
 * A prose phrase as a wrap-tolerant matcher: every space matches any run of
 * whitespace, so an assertion binds the sentence rather than the column the
 * artifact happens to wrap at. Literal phrases only — no regex metacharacters.
 */
function phrase(literal: string): RegExp {
  return new RegExp(literal.trim().replace(/\s+/g, "\\s+"), "i");
}

/** The body of one `## `-level section, heading line included. Throws when the heading moved. */
function sectionOf(body: string, heading: string): string {
  const sections = body.split(/^(?=## )/m);
  const found = sections.find((section) => section.startsWith(`${heading}\n`));
  if (found === undefined) throw new Error(`section "${heading}" not found in ${RELATIVE_PATH}`);
  return found;
}

let plan: CorpusFile;

beforeAll(async () => {
  plan = corpusFileOf(RELATIVE_PATH, await readFile(join(CORPUS_ROOT, RELATIVE_PATH), "utf8"));
});

describe("/st-plan — frontmatter contract", () => {
  it("declares a bare id agreeing with its filename, the command type, and a planning primary tag", () => {
    expect(frontmatterField(plan.parsed, "id")).toBe("plan");
    expect(frontmatterField(plan.parsed, "id")).toBe(filenameSlug(RELATIVE_PATH));
    expect(frontmatterField(plan.parsed, "type")).toBe("command");
    expect(frontmatterField(plan.parsed, "tags")).toEqual(["planning"]);
  });

  it("carries a third-person description naming the persisted output and its consumer", () => {
    const description = frontmatterField(plan.parsed, "description");

    expect(description).toBeTypeOf("string");
    expect(description as string).toMatch(phrase("persisted"));
    expect(description as string).toMatch(/work/i);
    expect(SECOND_PERSON.test(description as string)).toBe(false);
  });

  it("loads on demand and declares a falsifiable deletion trigger", () => {
    // Only the charter may be `load: always`; a command is invocation-scoped.
    expect(() => requireLoadClass(plan, ["on-demand"])).not.toThrow();
    expect(() => requireObsoleteWhen(plan)).not.toThrow();
    expect(frontmatterField(plan.parsed, "obsolete_when")).toMatch(/plan/i);
  });

  it("declares spawns: [researcher, spec-author] and uses both roles in the body", () => {
    // The command discriminator: a command orchestrates >=1 sub-agent, and the
    // declared set is the one the body actually dispatches.
    expect(frontmatterField(plan.parsed, "spawns")).toEqual(["researcher", "spec-author"]);

    const routing = sectionOf(plan.parsed.body, "## Intent routing");
    expect(routing).toContain("`researcher`");
    expect(routing).toContain("`spec-author`");
  });

  it("indexes in the catalog under the command-prefixed key, collision-free", async () => {
    const index = await loadCorpusIndex();
    const item = index.byKey.get(typeIdKey("command", "cmd-plan"));

    expect(item?.relativePath).toBe(RELATIVE_PATH);
    expect(index.collisions.filter((c) => c.paths.includes(RELATIVE_PATH))).toEqual([]);
  });
});

describe("/st-plan — corpus invariants", () => {
  it("stays within the command body cap", () => {
    expect(() => assertLineCap(plan, BODY_MAX_LINES)).not.toThrow();
  });

  it("carries no block-severity denied pattern and no anti-slop filler", () => {
    expect(() => assertDenyClean(plan)).not.toThrow();
    expect(scanAntiSlop(plan.parsed.body)).toEqual([]);
  });

  it("names no vendor, model, URL, or minted domain", () => {
    expect(VENDOR_OR_MODEL_NAMES.test(plan.parsed.body)).toBe(false);
    expect(URL_OR_DOMAIN.test(plan.parsed.body)).toBe(false);
  });

  it("fails loudly when a section heading moves, so the assertions below cannot go vacuous", () => {
    expect(() => sectionOf(plan.parsed.body, "## No Such Section")).toThrow(/not found/);
  });
});

describe("/st-plan — boundary against work", () => {
  it("separates the persisted artifact from work's in-flow, session-scoped Plan phase", () => {
    const boundary = sectionOf(plan.parsed.body, "## Boundary vs work");

    expect(boundary).toMatch(phrase("in-flow"));
    expect(boundary).toMatch(phrase("session-scoped"));
    expect(boundary).toMatch(phrase("persisted"));
    expect(boundary).toContain("docs/plans/");
    expect(boundary).toContain("/st-work");
  });

  it("states the freshness guard work applies when it consumes a persisted plan", () => {
    const boundary = sectionOf(plan.parsed.body, "## Boundary vs work");

    expect(boundary).toMatch(phrase("freshness guard"));
    expect(boundary).toContain("stamp:");
    expect(boundary).toContain("reads:");
    expect(boundary).toContain("STALE");
    // Staleness re-runs research rather than executing against moved code.
    expect(boundary).toMatch(phrase("re-run research"));
  });

  it("owns the intake contract outright, and reads exactly two head keys", () => {
    const boundary = sectionOf(plan.parsed.body, "## Boundary vs work");

    // Two artifacts each claimed the contract and disagreed on inputs.
    // One owner, and the input set is closed here so the citing side cannot
    // widen it — the invented pair is named as excluded, not merely absent.
    expect(boundary).toMatch(phrase("This command owns the contract"));
    expect(boundary).toMatch(phrase("adds no inputs of its own"));
    expect(boundary).toMatch(phrase("two head keys, nothing else"));
    expect(boundary).toMatch(phrase("No spec version, no per-file fingerprint, no content"));
  });

  it("makes STALE a guard verdict, never a fifth terminal state", () => {
    const boundary = sectionOf(plan.parsed.body, "## Boundary vs work");
    const returns = sectionOf(plan.parsed.body, "## Return contract");

    // The second half: the shipped STALE had no home in any return enum.
    // It stays as a verdict and the enum stays closed — asserted on both sides.
    expect(boundary).toMatch(phrase("guard verdict recorded in the run report"));
    expect(boundary).toMatch(phrase("never a terminal state"));
    expect(returns).not.toContain("STALE");
  });

  it("survives a deleted reads: path and an absent optional head key", () => {
    const boundary = sectionOf(plan.parsed.body, "## Boundary vs work");

    // Edge cases the guard has to answer in prose because nothing executes it:
    // a `reads:` path that no longer exists is a failed guard rather than an
    // error, and a plan predating an optional key is fresh rather than stale.
    expect(boundary).toMatch(phrase("no longer exists is a failed guard for that path"));
    expect(boundary).toMatch(phrase("not an error that ends the run"));
    expect(boundary).toMatch(phrase("absent optional head key satisfies the guard"));
    expect(boundary).toMatch(phrase("fresh, not stale"));
  });

  it("keeps execution user-gated — the run ends at the artifact", () => {
    const boundary = sectionOf(plan.parsed.body, "## Boundary vs work");
    const returns = sectionOf(plan.parsed.body, "## Return contract");

    expect(boundary).toMatch(phrase("the run ends at the artifact"));
    expect(returns).toMatch(phrase("not automatic"));
    expect(returns).toContain("/st-work docs/plans/<file>");
  });
});

describe("/st-plan — intent routing", () => {
  it("carries all six intent sections exactly once, in routing order", () => {
    const body = plan.parsed.body;

    const positions = INTENT_HEADINGS.map((heading) => {
      const occurrences = [...body.matchAll(new RegExp(`^${heading}$`, "gm"))];
      expect(occurrences).toHaveLength(1);
      return occurrences[0]?.index ?? -1;
    });

    expect(positions).toEqual(positions.toSorted((a, b) => a - b));
  });

  it("routes by scored signals with an explicit --intent override", () => {
    const routing = sectionOf(plan.parsed.body, "## Intent routing");

    expect(routing).toContain("--intent=feature|bug|refactor|migration|test|roadmap");
    expect(routing).toMatch(phrase("one strong signal, or two weak"));
    expect(routing).toContain("intent chosen:");
  });

  it("resolves an ambiguous bug-vs-refactor request with one ASK and a declared default", () => {
    // Edge case 1: the declared-default ask, never two half-plans.
    const routing = sectionOf(plan.parsed.body, "## Intent routing");

    expect(routing).toMatch(phrase("ambiguous intent"));
    expect(routing).toMatch(/signals match bug .* and refactor/i);
    expect(routing).toMatch(phrase("default if unanswered"));
    expect(routing).toMatch(phrase("half-plans is a defect"));
    expect(routing).toMatch(phrase("one artifact, one intent"));
  });

  it("fans out one researcher per independent question and merges through a single writer", () => {
    const routing = sectionOf(plan.parsed.body, "## Intent routing");

    expect(routing).toMatch(/in parallel/i);
    expect(routing).toMatch(phrase("dependency edge is the only reason to sequence"));
    expect(routing).toMatch(phrase("one writer merges"));
  });

  it("names the writer, and names it again over the lint pass", () => {
    const routing = sectionOf(plan.parsed.body, "## Intent routing");
    const gate = sectionOf(plan.parsed.body, "## Plan-lint gate");

    // "one writer" with no name left a reader choosing between a
    // protocol violation and an undeclared spawn write. Both write sites — the
    // merge and the lint pass over the draft — carry the same named writer.
    expect(routing).toMatch(phrase("this command's own orchestrating run"));
    expect(routing).toMatch(phrase("never a sub-agent"));
    expect(routing).toMatch(phrase("return findings and write nothing"));
    expect(gate).toMatch(phrase("run by the same writer that drafted it"));
  });
});

describe("/st-plan — intent sections", () => {
  it("feature: probes dimensions, aligns to conventions, and points model work at the evals rule", () => {
    const feature = sectionOf(plan.parsed.body, "## Feature");

    expect(feature).toMatch(phrase("dimension probing"));
    expect(feature).toMatch(phrase("one batched ASK"));
    expect(feature).toMatch(phrase("convention alignment"));
    expect(feature).toContain("path:line");
    expect(feature).toContain("`ai-evals`");
  });

  it("bug: reports without fixing, and routes remediation to debug or work", () => {
    // Edge case 2: report-not-fix is the contract.
    const bug = sectionOf(plan.parsed.body, "## Bug");

    expect(bug).toMatch(phrase("report, do not fix"));
    expect(bug).toMatch(phrase("changes no product file"));
    expect(bug).toContain("/st-debug");
    expect(bug).toContain("/st-work");
  });

  it("bug: ranks hypotheses with disconfirming observations and names an introduction window", () => {
    const bug = sectionOf(plan.parsed.body, "## Bug");

    expect(bug).toMatch(phrase("ranked hypotheses"));
    expect(bug).toMatch(phrase("disconfirming observation"));
    expect(bug).toMatch(phrase("introduction window"));
    expect(bug).toContain("<sha>..<sha>");
    expect(bug).toMatch(phrase("failing test"));
  });

  it("refactor: pins behavioral invariants, scaffolds Phase 0 tests, keeps every phase green", () => {
    const refactor = sectionOf(plan.parsed.body, "## Refactor");

    expect(refactor).toMatch(phrase("behavioral invariants"));
    expect(refactor).toMatch(phrase("phase 0 test scaffolding"));
    expect(refactor).toContain("`uncovered`");
    expect(refactor).toMatch(phrase("becomes unit 0"));
    expect(refactor).toMatch(phrase("every phase green"));
  });

  it("migration: decides incremental vs direct, carries a 0-3 rollback skeleton and change classes", () => {
    const migration = sectionOf(plan.parsed.body, "## Migration");

    expect(migration).toMatch(phrase("incremental or direct"));
    expect(migration).toContain("approach: incremental | direct because");
    for (const phase of ["0 Preparation", "1 Non-breaking", "2 Consumers", "3 Cleanup"]) {
      expect(migration).toContain(phase);
    }
    expect(migration).toMatch(/rollback/i);
    for (const severity of ["`Blocking`", "`Behavioral`", "`Cosmetic`"]) {
      expect(migration).toContain(severity);
    }
    for (const codemod of ["`Mechanical`", "`Assisted`", "`Manual`"]) {
      expect(migration).toContain(codemod);
    }
  });

  it("test: carries the strategy matrix, P0-P3 outlines, and a CI-gates table", () => {
    const test = sectionOf(plan.parsed.body, "## Test");

    expect(test).toMatch(phrase("strategy matrix"));
    for (const priority of ["**P0**", "**P1**", "**P2**", "**P3**"]) {
      expect(test).toContain(priority);
    }
    expect(test).toMatch(phrase("CI gates"));
    expect(test).toMatch(phrase("what stays uncovered"));
  });

  it("roadmap: runs a dual lens with stage-adaptive prioritization", () => {
    const roadmap = sectionOf(plan.parsed.body, "## Roadmap");

    expect(roadmap).toMatch(phrase("dual lens"));
    expect(roadmap).toMatch(phrase("business milestones"));
    expect(roadmap).toMatch(phrase("technical milestones"));
    expect(roadmap).toMatch(phrase("stage-adaptive prioritization"));
  });

  it("roadmap: hands the persisted artifact to /st-board fill as a referenced-file source", () => {
    const roadmap = sectionOf(plan.parsed.body, "## Roadmap");

    expect(roadmap).toContain("/st-board fill");
    expect(roadmap).toMatch(phrase("referenced-file source"));
    // Board owns status; the repo-side file owns content — and plan writes neither board item.
    expect(roadmap).toMatch(phrase("the board owns status"));
    expect(roadmap).toMatch(/writes\s+no board item/i);
  });

  it("roadmap: asks four stage dimensions, and team size is not one of them", () => {
    const roadmap = sectionOf(plan.parsed.body, "## Roadmap");

    // The engine deleted the team-size lever by name and documents the
    // ban in src/types/core.ts, while this ASK put it back as a direct prompt.
    // Asserted over the WHOLE body so it cannot reappear under another heading.
    expect(plan.parsed.body).not.toMatch(/team[\s-]size/i);
    expect(roadmap).toContain("(stage, user scale, compliance surface, deployment maturity)");
  });

  it("roadmap: leaves the maturity-tier source byte-unchanged beside the trimmed ASK", () => {
    const roadmap = sectionOf(plan.parsed.body, "## Roadmap");

    // The maturity tier is a different knob and is genuinely read by the
    // engine; the finding's fix trims the ASK and touches nothing else, so the
    // sentence that routes to the charter is pinned byte-for-byte here.
    expect(roadmap).toContain("Stage comes from the charter's maturity tier when set,");
  });

  it("roadmap: degrades to a marked tech lens when business context is absent", () => {
    // Edge case 3: no invented market, revenue, or competitor claims.
    const roadmap = sectionOf(plan.parsed.body, "## Roadmap");

    expect(roadmap).toContain("Business lens unavailable:");
    expect(roadmap).toMatch(phrase("technical lane alone"));
    expect(roadmap).toMatch(phrase("are not inferred"));
  });
});

describe("/st-plan — plan-lint gate", () => {
  it("names the three checks verbatim as one deterministic pass on every intent", () => {
    const gate = sectionOf(plan.parsed.body, "## Plan-lint gate");

    for (const check of PLAN_LINT_CHECKS) {
      expect(gate).toContain(check);
    }
    expect(gate).toMatch(phrase("deterministic single pass"));
    expect(gate).toMatch(phrase("every intent"));
    for (const row of ["| L1 |", "| L2 |", "| L3 |"]) {
      expect(gate).toContain(row);
    }
  });

  it("runs inline — no plan-review sub-agent loop", () => {
    const gate = sectionOf(plan.parsed.body, "## Plan-lint gate");

    expect(gate).toMatch(phrase("inline"));
    expect(gate).toMatch(phrase("plan-review sub-agent loop"));
    expect(gate).toMatch(phrase("no measured quality gain"));
    expect(gate).toMatch(phrase("none runs"));
  });

  it("blocks the write on failure and escalates a repeatedly failing check", () => {
    const gate = sectionOf(plan.parsed.body, "## Plan-lint gate");

    expect(gate).toMatch(phrase("blocks the write"));
    expect(gate).toContain("BLOCKED_AMBIGUITY");
  });
});

describe("/st-plan — plan artifact shape", () => {
  it("fixes the path, the freshness stamp, and the reads set in the artifact head", () => {
    const shape = sectionOf(plan.parsed.body, "## Plan artifact shape");

    expect(shape).toContain("docs/plans/<NNN>-<slug>.md");
    expect(shape).toContain("stamp: <head-commit-sha> <UTC date>");
    expect(shape).toContain("reads: [<path>, ...]");
    expect(shape).toContain("intent: feature | bug | refactor | migration | test | roadmap");
  });

  it("carries a spec-delta section that work merges at Prove, and a blocking clarification marker", () => {
    const shape = sectionOf(plan.parsed.body, "## Plan artifact shape");

    expect(shape).toMatch(phrase("spec delta"));
    expect(shape).toContain("`ADDED`");
    expect(shape).toContain("`MODIFIED`");
    expect(shape).toContain("`REMOVED`");
    expect(shape).toContain("docs/specs/");
    expect(shape).toMatch(/Prove/);
    expect(shape).toContain("[NEEDS CLARIFICATION]");
  });

  it("gives every unit the fields a context-free implementer needs", () => {
    const shape = sectionOf(plan.parsed.body, "## Plan artifact shape");

    for (const field of UNIT_FIELDS) {
      expect(shape).toContain(field);
    }
    expect(shape).toMatch(phrase("fresh-context criteria"));
    expect(shape).toMatch(phrase("no session history"));
    expect(shape).toMatch(phrase("without opening another document"));
  });

  it("declares head-level depends_on, the key two sections already required", () => {
    const shape = sectionOf(plan.parsed.body, "## Plan artifact shape");
    const routing = sectionOf(plan.parsed.body, "## Intent routing");

    // `depends_on` was required at head level in two places and defined
    // only per unit, so both references pointed at a key the schema did not
    // publish. The head now carries it, and the two scopes are told apart.
    expect(shape).toContain("depends_on: [<plan path>, ...]");
    expect(shape).toMatch(phrase("names whole plan artifacts"));
    expect(shape).toMatch(phrase("the per-unit `depends_on` below names unit ids"));
    // Both consuming sites still exist, so the key is not decorative.
    expect(routing).toMatch(phrase("`depends_on` name the first artifact"));
    expect(shape).toMatch(phrase("names the preceding one in its head `depends_on`"));
  });

  it("splits the head into required and optional keys, so an absent key is not a defect", () => {
    const shape = sectionOf(plan.parsed.body, "## Plan artifact shape");

    expect(shape).toMatch(phrase("`id`, `intent`, `stamp` and `reads` are required"));
    expect(shape).toMatch(phrase("`approach` and `depends_on` are optional"));
    expect(shape).toMatch(phrase("freshness guard treats it as satisfied rather than"));
  });

  it("splits an oversized plan into sequenced, self-complete files", () => {
    // Edge case 4: sequenced plan files, each standing alone — no stub that
    // points at a sibling for its interfaces.
    const shape = sectionOf(plan.parsed.body, "## Plan artifact shape");

    expect(shape).toMatch(phrase("oversized plan"));
    expect(shape).toContain("<NNN>-<slug>-01.md");
    expect(shape).toMatch(phrase("self-complete"));
    expect(shape).toMatch(phrase("own context, units, spec-delta slice, and stamp"));
    expect(shape).toMatch(phrase("every file stands alone"));
  });
});

describe("/st-plan — side effects", () => {
  it("declares the two side effects the learn skill already promises on this side", async () => {
    const effects = sectionOf(plan.parsed.body, "## Side effects");
    const learn = await readFile(join(CORPUS_ROOT, "skills/st-learn/SKILL.md"), "utf8");

    // The learn skill tells the operator that work AND plan capture
    // their own learnings, while this command had no Side effects section and
    // wrote none. The cross-file half is what keeps the pair honest — the claim
    // over there has to have a producer here.
    expect(learn).toMatch(phrase("Work and plan runs capture their own learnings"));
    expect(effects).toMatch(phrase("Learnings capture"));
    expect(effects).toContain(".stamity/learnings/");
    expect(effects).toMatch(phrase("writes none and says so"));
    expect(effects).toMatch(phrase("Deferral-inbox append"));
    expect(effects).toContain(".stamity/inbox.md");
  });

  it("keeps both side effects reportable, and neither one a product write", () => {
    const effects = sectionOf(plan.parsed.body, "## Side effects");
    const returns = sectionOf(plan.parsed.body, "## Return contract");

    expect(effects).toMatch(phrase("No product file moves here"));
    // Each side effect owes the return block a row, or it is unobservable.
    expect(returns).toMatch(phrase("Learnings written, with their paths"));
    expect(returns).toContain(".stamity/inbox.md");
  });
});

describe("/st-plan — return contract", () => {
  it("closes on one of the four terminal states with severity-graded risks", () => {
    const returns = sectionOf(plan.parsed.body, "## Return contract");
    const shape = sectionOf(plan.parsed.body, "## Plan artifact shape");

    for (const state of ["`DONE`", "`BLOCKED_AMBIGUITY`", "`BLOCKED_DEPENDENCY`", "`BLOCKED_FAILURE`"]) {
      expect(returns).toContain(state);
    }
    for (const severity of ["`Critical`", "`Warning`", "`Minor`"]) {
      expect(shape).toContain(severity);
    }
  });

  it("reports the intent, the artifact, the per-check lint result, and the fan-out", () => {
    const returns = sectionOf(plan.parsed.body, "## Return contract");

    expect(returns).toContain("intent chosen:");
    expect(returns).toMatch(phrase("artifact path"));
    expect(returns).toContain("L1 pass|fail");
    expect(returns).toContain("sub_agents_spawned:");
    expect(returns).toContain("task_structure: parallelizable | sequential | mixed");
  });

  it("routes out-of-scope follow-ups to the deferral inbox", () => {
    const returns = sectionOf(plan.parsed.body, "## Return contract");

    expect(returns).toContain(".stamity/inbox.md");
    expect(returns).toContain("/st-board fill --source docs/plans/<file>");
  });

  it("derives the next step from this run's own state rather than a fixed menu", () => {
    const returns = sectionOf(plan.parsed.body, "## Return contract");

    // No closing contract carried a state-derived next step, so the
    // forward pointer into the following touchpoints dangled. The three
    // branches are the derivation — a menu would satisfy neither the finding
    // nor a reader holding an artifact with open questions.
    expect(returns).toMatch(phrase("derived from this run's own state rather than a"));
    expect(returns).toMatch(phrase("open questions still carried make resolving them"));
    expect(returns).toMatch(phrase("One action, named, with the state that chose it"));
  });

  it("passes /st-board no flag that board does not define", async () => {
    const returns = sectionOf(plan.parsed.body, "## Return contract");
    const boardBody = await readFile(join(CORPUS_ROOT, "commands/st-board.md"), "utf8");

    // `--source` had exactly one occurrence in the whole corpus — this
    // invocation — while board documented intake as prose with no flag grammar.
    // Every flag handed to another touchpoint has to be defined by that
    // touchpoint, or the instruction is unrunnable.
    const flags = [...returns.matchAll(/\/st-board[^\n`]*?(--[a-z][a-z-]*)/g)].map(
      (match) => match[1] ?? "",
    );
    expect(flags).toContain("--source");
    for (const flag of flags) {
      expect(boardBody, `board defines no ${flag}`).toContain(`\`${flag} `);
    }
  });
});
