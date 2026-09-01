import { describe, expect, it } from "vitest";
import { frontmatterField } from "../../../src/content/frontmatter.ts";
import { cursorCompanionFrontmatter } from "../../../src/content/mdcCompanions.ts";
import { VERIFY_GATE_ALL_TOKEN } from "../../../src/emit/substitution.ts";
import { MODEL_LADDER } from "../../../src/roster/modelLadder.ts";
import {
  DEFAULT_MAX_REVIEW_ITERATIONS,
  HARD_MAX_REVIEW_ITERATIONS,
  MIN_MAX_REVIEW_ITERATIONS,
} from "../../../src/roster/reviewCaps.ts";
import { SPECIALIST_TRIGGER_TABLE } from "../../../src/roster/triggers.ts";
import { CONTENT_PREFIX } from "../../../src/types/markers.ts";
import {
  assertDenyClean,
  assertLineCap,
  requireLoadClass,
  requireObsoleteWhen,
  walkAllMarkdown,
  type CorpusFile,
} from "../harness.ts";

/**
 * Corpus invariants for `/st-work`, the core workflow command. The suite
 * binds the shipped artifact to its design contract: the frontmatter head and
 * spawn roster, the phase skeleton, the engine-lockstepped review-loop cap,
 * the dispatch-contract clauses, the verbatim testing-philosophy anchors, and
 * the token-only rule for verification commands. Everything asserts against
 * the real file on disk, so drift between artifact and contract fails here.
 *
 * Two matching modes, chosen per assertion: raw-byte matching where the
 * contract is byte-level (the testing-philosophy anchors, substitution
 * tokens, table rows, heading lines) and whitespace-collapsed matching for
 * prose phrases, so re-wrapping a paragraph is not a false failure.
 */

const REL_PATH = "commands/st-work.md";

/**
 * The work-pipeline slice of the agent roster — the only roles `spawns:` may name.
 *
 * Six spine roles plus the three trigger-conditional specialists the Prove phase
 * pulls in. Ids are BARE, the census form invariant 3 resolves against; the
 * prefixed form is the runtime guard's namespace and belongs nowhere in
 * frontmatter.
 */
const SPAWNABLE_ROLES = [
  "researcher",
  "implementer",
  "reviewer",
  "fixer",
  "test-runner",
  "spec-author",
  "security",
  "design-quality",
  "performance",
] as const;

/** The three specialists, read from the roster rather than restated. */
const SPECIALIST_IDS: readonly string[] = SPECIALIST_TRIGGER_TABLE.map((row) =>
  row.specialist.startsWith(CONTENT_PREFIX)
    ? row.specialist.slice(CONTENT_PREFIX.length)
    : row.specialist,
);

/** Body cap for this command, in body lines (frontmatter head excluded). */
const BODY_LINE_CAP = 500;

/** The section skeleton, in reading order; extra subheadings may appear between rows. */
const SKELETON = [
  "# /st-work",
  "## Phase 0 — Frame",
  "## Phase 1 — Understand",
  "## Phase 2 — Plan",
  "## Phase 3 — Build",
  "## Phase 4 — Prove",
  "### Gates",
  "### Review loop",
  "### Specialist pass",
  "### QA checkpoint",
  "### Proof block",
  "### Side effects",
  "## Dispatch contract",
  "## Dials",
  "## Testing philosophy",
  "## Return contract",
] as const;

/** The plan artifact: owner of the intake contract this command cites. */
const PLAN_PATH = "commands/st-plan.md";

/** The board command: owner of the deferral-inbox census this command cites. */
const BOARD_PATH = "commands/st-board.md";

/** The census rule the Phase 2 → Phase 3 step runs. */
const CENSUS_RULE_PATH = "rules/stamity-contract-census.md";

/** One corpus walk shared by every case; a missing artifact fails each with the same message. */
const corpus: Promise<CorpusFile[]> = walkAllMarkdown();

function corpusFile(relPath: string): Promise<CorpusFile> {
  return corpus.then((files) => {
    const file = files.find((candidate) => candidate.relPath === relPath);
    if (file === undefined) throw new Error(`${relPath} is missing from the corpus walk`);
    return file;
  });
}

const workFile: Promise<CorpusFile> = corpusFile(REL_PATH);

async function body(): Promise<string> {
  return (await workFile).parsed.body;
}

/** Markdown heading level of a line, or null when the line is not a heading. */
function headingLevel(line: string): number | null {
  const hashes = /^(#{1,6})\s/.exec(line)?.[1];
  return hashes === undefined ? null : hashes.length;
}

/**
 * The text of one section: everything after the heading line up to the next
 * heading of the same or a higher level. Scoped extraction keeps an assertion
 * anchored to the section the contract names — text elsewhere in the body
 * cannot satisfy it.
 */
function section(text: string, heading: string): string {
  const level = headingLevel(heading);
  if (level === null) throw new Error(`not a heading: ${JSON.stringify(heading)}`);
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trimEnd() === heading);
  if (start === -1) throw new Error(`heading not found in body: ${JSON.stringify(heading)}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => {
    const found = headingLevel(line);
    return found !== null && found <= level;
  });
  return rest.slice(0, end === -1 ? rest.length : end).join("\n");
}

/** Whitespace-collapsed view for prose-phrase matching across wrapped lines. */
function collapse(text: string): string {
  return text.replaceAll(/\s+/g, " ");
}

/**
 * The keys the plan artifact's head declares, read out of the first fenced
 * block under `## Plan artifact shape`.
 *
 * Read rather than restated: the owner may add an optional key (head-level
 * `depends_on` did exactly that), and a hard-coded list here would turn the
 * owner's own growth into a failure on the citing side.
 */
function planHeadKeys(planBody: string): string[] {
  const shape = planBody.split(/^(?=## )/m).find((block) => block.startsWith("## Plan artifact shape\n"));
  if (shape === undefined) throw new Error("st-plan.md ships no `## Plan artifact shape`");
  const fence = /```[^\n]*\n([\s\S]*?)```/.exec(shape)?.[1];
  if (fence === undefined) throw new Error("`## Plan artifact shape` ships no head fence");
  return [...fence.matchAll(/^([a-z][a-z0-9_]*):/gm)].map((match) => match[1] ?? "");
}

/**
 * Head-field references inside a section: backticked identifiers spelled the
 * way a frontmatter key is, `` `stamp:` ``.
 *
 * The colon is what makes the match a field reference rather than prose — the
 * body says `` `contract-census` `` for a rule and `` `clean` `` for a verdict,
 * and neither should be read as a plan-head key.
 */
function headFieldRefs(text: string): string[] {
  return [...new Set([...text.matchAll(/`([a-z][a-z0-9_]*):`/g)].map((match) => match[1] ?? ""))]
    .toSorted();
}

/**
 * Census counts restated in a text — `two contracted readers`, `four writers`.
 *
 * A census belongs to one artifact; a count spelled on a citing side is what
 * lets the two drift apart, which is the shape the census defect took on both ends. The
 * noun is a parameter because the body's dispatch contract legitimately says
 * "exactly one writer merges" and "Two writers on one file": a writer-count
 * scan is only meaningful scoped to a census-bearing section, while `reader`
 * appears in this artifact for one reason only and scans whole-body.
 */
function restatedCensusCounts(text: string, noun: "reader" | "writer"): string[] {
  const counts = String.raw`one|two|three|four|five|six|seven|eight|nine|ten|\d+`;
  const pattern = new RegExp(String.raw`\b(?:${counts})\s+(?:[a-z-]+\s+)?${noun}s?\b`, "gi");
  return [...collapse(text).matchAll(pattern)].map((match) => match[0]);
}

/**
 * One row of the `### Intensity` table, whole, by its tier name.
 *
 * Row-scoped rather than section-scoped on purpose: the three tiers describe
 * one mechanism from three sides, so an assertion about light has to fail when
 * light's own cell drifts, not merely when the word appears anywhere in Dials.
 */
function intensityRow(dials: string, tier: string): string {
  const found = dials.split("\n").find((line) => line.startsWith(`| ${tier} `));
  if (found === undefined) throw new Error(`${tier} row missing from the intensity table`);
  return found;
}

/** Every role the ladder places, deduped — the token universe a ladder cell is read for. */
const LADDER_ROLES = [...new Set(MODEL_LADDER.flatMap((row) => [...row.roles]))];

/**
 * The ladder table's `class → cell` map, read out of the shipped section. The
 * class-column half is pinned in `test/roster/modelLadder.test.ts` against the
 * same array; this half needs a reader of the body's prose, which is why it
 * lives here.
 */
function ladderRoleCells(dials: string): Map<string, string> {
  const heading = /^#+ +Model ladder *$/m.exec(dials);
  if (heading === null) throw new Error("the body ships no `Model ladder` section");
  const table = dials.slice(heading.index + heading[0].length).split(/^#/m)[0] ?? "";
  const cells = new Map<string, string>();
  for (const line of table.split("\n")) {
    if (!line.startsWith("|")) continue;
    const [, first = "", second = ""] = line.split("|");
    const modelClass = first.trim().toLowerCase();
    if (modelClass === "" || modelClass === "class" || /^:?-{2,}:?$/.test(modelClass)) continue;
    cells.set(modelClass, second);
  }
  return cells;
}

/**
 * Rows whose cell names a role MODEL_LADDER puts on a different rung.
 *
 * Matching is per role TOKEN inside a cell, never against a whole cell string:
 * the cells are voice-carrying prose ("the reviewer", "the fix rounds that
 * still need judgement"), so a reword stays green while a row that names a role
 * from another rung does not.
 */
function ladderViolations(dials: string): string[] {
  const cells = ladderRoleCells(dials);
  const problems: string[] = [];
  const shipped = [...cells.keys()].join(",");
  const declared = MODEL_LADDER.map((row) => row.modelClass).join(",");
  if (shipped !== declared) {
    problems.push(`class column is [${shipped}]; the ladder is [${declared}]`);
  }
  for (const row of MODEL_LADDER) {
    const cell = cells.get(row.modelClass) ?? "";
    for (const role of LADDER_ROLES) {
      if (!new RegExp(`(?<![\\w-])${role}(?![\\w-])`).test(cell)) continue;
      if (row.roles.includes(role)) continue;
      problems.push(
        `the ${row.modelClass} row names \`${role}\`, which the ladder assigns elsewhere`,
      );
    }
  }
  return problems;
}

describe("/st-work — frontmatter contract", () => {
  it("carries the command identity head", async () => {
    const file = await workFile;
    expect(frontmatterField(file.parsed, "id")).toBe("work");
    expect(frontmatterField(file.parsed, "type")).toBe("command");

    const description = frontmatterField(file.parsed, "description");
    expect(typeof description).toBe("string");
    expect(description).not.toBe("");

    const tags = frontmatterField(file.parsed, "tags");
    if (!Array.isArray(tags)) throw new Error("`tags` must be an array");
    // Capability primary first; the picker groups by tags[0].
    expect(tags[0]).toBe("orchestration");
    expect(tags).toContain("implementation");
  });

  it("declares on-demand load and a deletion trigger", async () => {
    const file = await workFile;
    expect(() => requireLoadClass(file, ["on-demand"])).not.toThrow();
    expect(() => requireObsoleteWhen(file)).not.toThrow();
  });

  it("spawns exactly the work-pipeline roster, non-empty and in-set", async () => {
    const file = await workFile;
    const spawns = frontmatterField(file.parsed, "spawns");
    if (!Array.isArray(spawns)) throw new Error("`spawns` must be an array");
    expect(spawns.length).toBeGreaterThan(0);
    for (const role of spawns) {
      expect(SPAWNABLE_ROLES).toContain(role);
    }
    // The design names all nine; a dropped role is a contract change, not drift.
    expect(spawns.map(String).toSorted()).toEqual([...SPAWNABLE_ROLES].toSorted());
  });

  it("names every specialist the trigger roster holds, in the bare census form", async () => {
    const file = await workFile;
    const spawns = frontmatterField(file.parsed, "spawns");
    if (!Array.isArray(spawns)) throw new Error("`spawns` must be an array");

    // A specialist the roster can trigger into this flow but the command never
    // declares is a spawn the census cannot resolve — the drift the roster/
    // frontmatter split exists to catch.
    for (const specialist of SPECIALIST_IDS) {
      expect(spawns, `roster triggers ${specialist}; \`spawns\` must name it`).toContain(
        specialist,
      );
    }
    for (const role of spawns) {
      expect(String(role).startsWith(CONTENT_PREFIX), `${String(role)} is prefixed`).toBe(false);
    }
  });
});

describe("/st-work — body skeleton", () => {
  it("keeps every skeleton heading present, once, in order", async () => {
    const headings = (await body())
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => headingLevel(line) !== null);
    let from = 0;
    for (const heading of SKELETON) {
      const at = headings.indexOf(heading, from);
      expect(at, `missing or out of order: ${heading}`).toBeGreaterThanOrEqual(0);
      expect(headings.indexOf(heading, at + 1), `duplicate heading: ${heading}`).toBe(-1);
      from = at + 1;
    }
  });

  it("stays within the body line cap and the write-path deny set", async () => {
    const file = await workFile;
    expect(() => assertLineCap(file, BODY_LINE_CAP)).not.toThrow();
    expect(() => assertDenyClean(file)).not.toThrow();
  });
});

describe("/st-work — Frame and Plan", () => {
  it("reads the deferral inbox at Frame and surfaces touched-file overlap", async () => {
    const frame = collapse(section(await body(), "## Phase 0 — Frame"));
    expect(frame).toContain("deferral inbox");
    expect(frame).toContain("overlap");
    // Reader mandate: the read is unconditional, every run.
    expect(frame).toContain("guaranteed on every run");
  });

  it("cites the inbox census owner's section instead of restating a reader count", async () => {
    const frame = collapse(section(await body(), "## Phase 0 — Frame"));
    const boardBody = (await corpusFile(BOARD_PATH)).parsed.body;

    // The census was wrong on BOTH sides. Board now publishes it, so the
    // same ownership move the plan head got applies here: cite the section,
    // spell no number. A citation cannot go stale against its owner; a restated
    // count can, and did — Frame said two readers while the census said three.
    expect(frame).toContain("`## Deferral inbox`");
    expect(frame).toContain("/st-board");
    expect(boardBody).toMatch(/^## Deferral inbox$/m);

    // The cross-file half: the citation only holds while the cited census names
    // this reader. Board dropping `/st-work` from it fails here, not in a
    // reader's head six months later.
    expect(collapse(section(boardBody, "## Deferral inbox"))).toContain("`/st-work`");

    // No count on this side, in any phase — `reader` has one subject in this
    // artifact, so the scan is whole-body; the writer half is Frame-scoped
    // because the dispatch contract's single-writer prose counts writers too.
    expect(restatedCensusCounts(await body(), "reader")).toEqual([]);
    expect(restatedCensusCounts(section(await body(), "## Phase 0 — Frame"), "writer")).toEqual([]);
  });

  it("fixture: a restated census count is flagged", () => {
    // The pre-fix line, minimised. Without this fixture the case above passes
    // on a body that simply stopped mentioning the inbox at all.
    const stale = "the inbox has two contracted readers, and Frame is one of them.";
    expect(restatedCensusCounts(stale, "reader")).toEqual(["two contracted readers"]);
    expect(restatedCensusCounts("Writers, four: rework, pr-resolve, plan, dep-audit", "writer")).toEqual(
      [],
    );
    expect(restatedCensusCounts("the inbox has four declared writers", "writer")).toEqual([
      "four declared writers",
    ]);
  });

  it("re-plans on a stale plan artifact rather than executing it", async () => {
    const plan = collapse(section(await body(), "## Phase 2 — Plan"));
    expect(plan).toContain("freshness guard");
    expect(plan).toContain("re-plan");
    expect(plan).toContain("a stale plan is never executed silently");
  });

  it("keeps its own Plan in-flow and leaves persistence to the plan touchpoint", async () => {
    const plan = collapse(section(await body(), "## Phase 2 — Plan"));
    // Two SoT files disagreed on whether work's Plan persists. The
    // shipped text states the resolution so a reader is not left to the
    // review file for it.
    expect(plan).toContain("plans in-flow");
    expect(plan).toContain("persisted nowhere");
    expect(plan).toContain("belongs to `/st-plan`");
  });

  it("gives plan-artifact discovery a glob and a selection rule", async () => {
    const plan = collapse(section(await body(), "## Phase 2 — Plan"));
    // The phase spoke of a persisted artifact and named no path, so
    // there was nothing to discover it with. Glob, selection rule, and the
    // not-found branch all have to be stated for the hand-off to be runnable.
    expect(plan).toContain("docs/plans/*.md");
    expect(plan).toContain("newest `stamp:`");
    expect(plan).toContain("Nothing found is a normal outcome");
  });

  it("cites the plan owner's head section instead of restating its fields", async () => {
    const plan = collapse(section(await body(), "## Phase 2 — Plan"));
    const planBody = (await corpusFile(PLAN_PATH)).parsed.body;

    // Ownership is a citation, and the cited heading has to exist on the other
    // side — a named section is only a contract while it resolves.
    expect(plan).toContain("`## Plan artifact shape`");
    expect(plan).toContain("owns the intake contract");
    expect(planBody).toMatch(/^## Plan artifact shape$/m);
  });

  it("names no plan-head field the plan artifact does not declare", async () => {
    const planBody = (await corpusFile(PLAN_PATH)).parsed.body;
    const declared = planHeadKeys(planBody);
    const named = headFieldRefs(section(await body(), "## Phase 2 — Plan"));

    // The cross-file assertion the split contract asks for: work reads the plan head, so
    // every field it spells has to be a key the owner actually publishes. A
    // field invented here is a guard input nothing can satisfy.
    expect(declared.length).toBeGreaterThan(0);
    expect(named.length, "the phase must name at least one head key").toBeGreaterThan(0);
    expect(named.filter((field) => !declared.includes(field))).toEqual([]);
  });

  it("fixture: a phase naming a field outside the plan head is flagged", () => {
    // The pre-fix shape, minimised: the guard read a per-file fingerprint the
    // plan head never carried. Without this fixture the case above passes on an
    // artifact that simply stopped naming fields at all.
    const declared = planHeadKeys("## Plan artifact shape\n\n```\nid: <slug>\nstamp: <sha>\n```\n");
    const named = headFieldRefs("Compare the recorded `fingerprints:` against `stamp:`.");

    expect(named).toEqual(["fingerprints", "stamp"]);
    expect(named.filter((field) => !declared.includes(field))).toEqual(["fingerprints"]);
  });

  it("drops the invented freshness inputs the plan head never carried", async () => {
    const text = await body();
    // `spec version` and per-file fingerprints appeared nowhere in the
    // owner's head. Asserted over the WHOLE body, not the phase, so the pair
    // cannot reappear under a different heading.
    expect(text).not.toMatch(/spec\s+version/i);
    expect(text).not.toMatch(/fingerprint/i);
  });

  it("keeps staleness a guard verdict rather than a fifth return status", async () => {
    const plan = collapse(section(await body(), "## Phase 2 — Plan"));
    const contract = collapse(section(await body(), "## Return contract"));

    expect(plan).toContain("Staleness is a guard verdict");
    expect(plan).toContain("not a return status");
    // The enum is closed: a STALE token must not have leaked into it.
    expect(contract).not.toContain("STALE");
  });

  it("bounds reviewable units and gates the plan per intensity", async () => {
    const plan = collapse(section(await body(), "## Phase 2 — Plan"));
    expect(plan).toContain("≤~400 changed lines");
    expect(plan).toContain("≤8 files");
    expect(plan).toContain("ceiling, not a target");
    expect(plan).toContain("light: auto-continue");
    expect(plan).toContain("execute-now");
  });
});

describe("/st-work — contract census", () => {
  it("sits at the Phase 2 → Phase 3 boundary", async () => {
    const headings = (await body())
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => headingLevel(line) !== null);
    const at = (heading: string): number => headings.indexOf(heading);

    // The gate the charter's invariant 6 promises had no step in the
    // flow at all. Position is the contract — a census after Build dispatches
    // is a census of collisions that already happened.
    expect(at("### Contract census"), "the census step is missing").toBeGreaterThan(0);
    expect(at("### Contract census")).toBeGreaterThan(at("## Phase 2 — Plan"));
    expect(at("### Contract census")).toBeLessThan(at("## Phase 3 — Build"));
  });

  it("states an exit criterion, the fallback, and the rule it runs", async () => {
    const census = collapse(section(await body(), "### Contract census"));

    expect(census).toContain("Exit criterion:");
    expect(census).toContain("exactly one unit's row set");
    // Every row closes, in the rule's own three states.
    for (const state of ["`clean`", "`reconciled(N)`", "`N unreconciled`"]) {
      expect(census).toContain(state);
    }
    // A batch that cannot satisfy the criterion serializes; it does not proceed.
    expect(census).toContain("dispatches serially instead");
    // The row grammar lives in the rule, cited rather than copied.
    expect(census).toContain("`contract-census`");
    expect(census).toContain("file lists");
  });

  it("skips on greenfield and on a single-unit batch, and records the skip", async () => {
    const census = collapse(section(await body(), "### Contract census"));

    // Edge case: with no prior consumers there is nothing to collide with, so a
    // greenfield run must not stall on a step that has no work to do.
    expect(census).toContain("Skip condition");
    expect(census).toContain("greenfield repo has no prior consumers");
    expect(census).toContain("batch of one unit has no peer");
    expect(census).toContain("records the skip");
  });

  it("re-scopes the census rule to conditional with brownfield globs", async () => {
    const rule = await corpusFile(CENSUS_RULE_PATH);

    expect(frontmatterField(rule.parsed, "scope")).toBe("conditional");
    const globs = frontmatterField(rule.parsed, "globs");
    if (!Array.isArray(globs)) throw new Error(`${CENSUS_RULE_PATH}: \`globs\` must be an array`);
    expect(globs.length).toBeGreaterThan(0);
    // Brownfield source roots: the rule attaches where existing consumers live.
    expect(globs).toContain("src/**");
    for (const glob of globs) expect(String(glob)).toMatch(/\*\*/);
  });

  it("projects the re-scoped rule to a warning-free Cursor companion", async () => {
    const rule = await corpusFile(CENSUS_RULE_PATH);
    const warnings: string[] = [];
    const head = cursorCompanionFrontmatter(rule.parsed.frontmatter, {
      source: rule.relPath,
      warnings,
    });

    // The transform is what makes `conditional` a real attach shape rather than
    // a frontmatter word: globs carried through, never an always-on demotion.
    expect(warnings).toEqual([]);
    expect(head).toContain("globs:");
    expect(head).toContain("alwaysApply: false");
    expect(head).not.toContain("alwaysApply: true");
  });
});

describe("/st-work — Prove", () => {
  it("requires structured gate results from a dedicated test-runner", async () => {
    const gates = collapse(section(await body(), "### Gates"));
    expect(gates).toContain("test-runner");
    expect(gates).toContain("gate-by-gate");
    expect(gates).toContain("verbatim failing excerpts");
    expect(gates).toContain("Bare pass/fail is not a result");
  });

  it("references verification commands only through substitution tokens", async () => {
    const text = await body();
    const lowered = text.toLowerCase();
    for (const literal of ["npm run", "npm test", "pytest"]) {
      expect(lowered, `hard-coded verification command: ${literal}`).not.toContain(literal);
    }
    expect(text).toContain(VERIFY_GATE_ALL_TOKEN);
  });

  it("states the engine-lockstepped iteration cap and clamp band", async () => {
    const loop = collapse(section(await body(), "### Review loop"));
    // Lockstep: the prose cap quotes the engine default, and the stated
    // operator band matches the engine clamp — drift in either fails here.
    expect(loop).toContain(`${DEFAULT_MAX_REVIEW_ITERATIONS} rounds by default`);
    expect(loop).toContain(`${MIN_MAX_REVIEW_ITERATIONS}..${HARD_MAX_REVIEW_ITERATIONS}`);
  });

  it("escalates the fixer ladder and stops as BLOCKED at the cap", async () => {
    const loop = collapse(section(await body(), "### Review loop"));
    // Ladder stages derived from the engine cap, not restated: the same-fixer
    // run ends one round below the cap, and the cap's own round is the single
    // escalation. A cap change makes both numbers wrong here rather than
    // shipping a promise of a round that never runs.
    expect(loop).toContain(`rounds 1–${DEFAULT_MAX_REVIEW_ITERATIONS - 1} keep the same fixer`);
    expect(loop).toContain(`round ${DEFAULT_MAX_REVIEW_ITERATIONS} spawns a fresh fixer`);
    expect(loop).toContain("fresh fixer on a stronger model class");
    expect(loop).toContain("BLOCKED_FAILURE");
    // Raising the cap is an operator act with a stated cost, not a free stage.
    expect(loop).toContain("raises the cap");
    expect(loop).toContain("adds no new stage");
  });

  it("claims no ladder round past the default cap", async () => {
    const text = await body();
    // The oss/13 ladder presumed a cap of at least five. Any round number above
    // the shipped default, anywhere in the body, is that stale promise back.
    for (const match of text.matchAll(/\bround(?:s)?\s+(\d+)(?:\s*[–-]\s*(\d+))?/gi)) {
      for (const group of [match[1], match[2]]) {
        if (group === undefined) continue;
        expect(
          Number(group),
          `"${match[0]}" names a round past the default cap of ${DEFAULT_MAX_REVIEW_ITERATIONS}`,
        ).toBeLessThanOrEqual(DEFAULT_MAX_REVIEW_ITERATIONS);
      }
    }
  });

  it("frames the mechanical gate as additional and client-dependent", async () => {
    const loop = collapse(section(await body(), "### Review loop"));
    // Guarantee honesty: the hook-expressed gate gets a prose twin that
    // states what holds where, and refuses the uniform-enforcement claim.
    expect(loop).toContain("an additional check on top of this text, not a replacement for it");
    expect(loop).toContain("On clients without those events");
    expect(loop).toContain("prompt-carried only");
    expect(loop).toContain("The enforcement is uneven by construction");
    // The honest twin is the ladder, not the mechanism: no counter file, path,
    // or exit code leaks into shipped prose.
    expect(loop).not.toMatch(/exit\s*(?:code\s*)?2|counter file|\.json\b|SubagentStop/i);
  });

  it("separates the event that holds the cap from the event that only counts", async () => {
    const loop = collapse(section(await body(), "### Review loop"));

    // One sentence credited the sub-agent-completion event with holding
    // the cap. It never blocks — the hold rides task completion — so the two
    // events have to be named apart or the claim is a guarantee nothing keeps.
    expect(loop).toContain("task-completion event is the one that HOLDS");
    expect(loop).toContain("refuse the completion");
    expect(loop).toContain("sub-agent-completion event only COUNTS");
    expect(loop).toContain("never blocks");
    // Coverage is one client of four, stated rather than implied by "where".
    expect(loop).toContain("Exactly one of the four supported clients publishes either event");
  });

  it("runs the specialist pass read-only, with an evidence bar and a kill switch", async () => {
    const pass = collapse(section(await body(), "### Specialist pass"));
    for (const specialist of SPECIALIST_IDS) {
      expect(pass, `specialist pass must name ${specialist}`).toContain(specialist);
    }
    // Pulled in by the roster, described rather than copied: a prose copy of the
    // trigger rows is the drift class the roster/data split exists to prevent.
    expect(pass).toContain("pulled in by a changed path or by the task's topic");
    expect(pass).toContain("the trigger roster is the single source");
    for (const row of SPECIALIST_TRIGGER_TABLE) {
      for (const pattern of row.triggerPaths) {
        expect(pass, `trigger row ${pattern} is copied into prose`).not.toContain(pattern);
      }
    }
    // Read-only posture, evidence bar, severity floor, kill switch, and the one
    // lens whose findings stay advisory without a declared budget.
    expect(pass).toContain("Read-only");
    expect(pass).toContain("returns findings and edits nothing");
    expect(pass).toContain("`path:line`");
    expect(pass).toContain("Only Critical and Warning findings reach the QA");
    expect(pass).toContain("Precision kill switch");
    expect(pass).toContain("false-positive rate");
    expect(pass).toContain("downgrades itself to advisory");
    expect(pass).toContain("blocks only on a breached budget");
  });

  it("runs the security lens at light intensity, so the universal floor holds at every tier", async () => {
    const pass = collapse(section(await body(), "### Specialist pass"));

    // This sentence is where the per-tier mechanism is declared; the Dials rows
    // restate it. It used to read "light runs none", which made the charter's
    // universal floor — security never relaxes, at no tier — false for any
    // light-intensity change landing on an auth, crypto, trust-boundary, or
    // dependency path. A trigger-path match is the narrowest shape that keeps
    // the floor true: light gains no lens it did not need, and loses none the
    // floor requires. Pinned per tier, plus the retired claim asserted absent.
    expect(pass).toContain("Deep runs the full pass");
    expect(pass).toContain("standard and light run the `security` lens on a trigger-path match");
    expect(pass).toContain("light runs no other lens");
    expect(pass).not.toContain("light runs none");
    // The reason travels with the rule, so a later trim reads it as load-bearing.
    expect(pass).toContain("universal floor holds at every tier");
  });

  it("names the persisted home of the proof block and its ledger", async () => {
    const proof = collapse(section(await body(), "### Proof block"));
    // The resumability pillar had no stated location, so the two
    // cross-referencing touchpoints pointed at nothing.
    expect(proof).toContain(".stamity/runs/");
    expect(proof).toContain("/st-rework");
    expect(proof).toContain("/st-pr-resolve");
    expect(proof).toContain("read-only to every later run");
  });

  it("exits the loop before the cap on convergence or divergence", async () => {
    const loop = collapse(section(await body(), "### Review loop"));
    expect(loop).toContain("Escape before the cap");
    expect(loop).toContain("at-confidence approval exits");
    expect(loop).toContain("diverged");
  });

  it("ledgers minor findings and suppresses new nits on re-review", async () => {
    const loop = collapse(section(await body(), "### Review loop"));
    expect(loop).toContain("never loop-triggering");
    expect(loop).toContain("new nits are suppressed");
  });

  it("closes the run with the proof block over a write-ahead ledger", async () => {
    const proof = collapse(section(await body(), "### Proof block"));
    for (const item of [
      "gate results",
      "review verdicts + confidence",
      "decisions trace",
      "artifacts touched",
      "agent identity, tool used, outcome",
    ]) {
      expect(proof).toContain(item);
    }
    expect(proof).toContain("native platform artifacts");
    expect(proof).toContain("self-quoted completion marker is the fallback");
    expect(proof).toContain("write-ahead JSONL");
    expect(proof).toContain("no finding ends the run pending");
  });

  it("defines the findings-ledger row schema instead of naming the file format", async () => {
    const proof = section(await body(), "### Proof block");
    const flat = collapse(proof);

    // Three cross-flow contracts rested on a ledger with no row shape,
    // so nothing downstream could read a row it did not write. Field names are
    // asserted as table cells, not as prose, because the row IS the contract.
    for (const field of [
      "| `id` |",
      "| `phase` |",
      "| `source` |",
      "| `severity` |",
      "| `evidence` |",
      "| `state` |",
      "| `rationale` |",
    ]) {
      expect(proof, `ledger schema is missing ${field}`).toContain(field);
    }
    // The state vocabulary is closed and the run-exit invariant rests on it.
    expect(flat).toContain("`open` · `fixed` · `deferred` · `rejected`");
    expect(flat).toContain("required on `deferred` and `rejected`");
    // Write-ahead means appended open, then rewritten in place under one id.
    expect(flat).toContain("appended `open` before the finding is acted on");
    expect(flat).toContain("the id is what makes the rewrite converge");
  });

  it("closes with a next step derived from the run's own state", async () => {
    const proof = collapse(section(await body(), "### Proof block"));

    // Every closing contract was surveyed and none carried one, so the
    // forward pointer into the next touchpoint dangled. Derivation is the
    // point — a fixed suggestion would satisfy the words and not the finding.
    expect(proof).toContain("recommended next step");
    expect(proof).toContain("derived from this run's own state");
    expect(proof).toContain("never a generic suggestion");
    expect(proof).toContain("acceptance criteria it left uncovered");
  });

  it("emits a pull request at close when a platform is linked, and says so when not", async () => {
    const effects = collapse(section(await body(), "### Side effects"));

    // `pr.linked` was an event field with no producer — no touchpoint
    // opened a PR at close. The guard is the linked platform, and the no-op
    // branch has to be visible or the run reports a link nothing created.
    expect(effects).toContain("Pull-request emission");
    expect(effects).toContain("Where a platform is linked");
    expect(effects).toContain("`pr.linked`");
    expect(effects).toContain("With no linked platform the step is a no-op");
  });

  it("no-ops board progress events when no source is linked", async () => {
    const effects = collapse(section(await body(), "### Side effects"));
    expect(effects).toContain("zero platform knowledge");
    expect(effects).toContain("When no board source is linked, emission is a silent no-op");
    expect(effects).toContain("events publish only when a linked source exists");
  });

  it("confirm-gates the spec delta merge", async () => {
    const effects = collapse(section(await body(), "### Side effects"));
    expect(effects).toContain("auto-proposed, confirm-gated, append/merge-only");
    expect(effects).toContain("spec-author");
  });
});

describe("/st-work — dispatch contract", () => {
  it("carries the three parallel-safety conditions and single-writer synthesis", async () => {
    const dispatch = collapse(section(await body(), "## Dispatch contract"));
    expect(dispatch).toContain("read-only or disjoint writes");
    expect(dispatch).toContain("deterministic aggregation");
    expect(dispatch).toContain("no shared mutable state");
    expect(dispatch).toContain("exactly one writer");
  });

  it("keeps the three-step failure ladder with no silent drops", async () => {
    const dispatch = collapse(section(await body(), "## Dispatch contract"));
    expect(dispatch).toContain("enriched brief");
    expect(dispatch).toContain("stronger model class");
    expect(dispatch).toContain("BLOCKED_FAILURE");
    expect(dispatch).toContain("No silent drops");
  });

  it("declares a native-first isolation primitive with a manual fallback and a named gap", async () => {
    const dispatch = collapse(section(await body(), "## Dispatch contract"));

    // The retired worktree CLI left fan-out resting on file-disjointness
    // alone — no isolation declaration, no fallback, no note that one client
    // provides nothing. All four halves are asserted; a declaration with no
    // absent-case rule is the failure mode that ships a shared tree.
    expect(dispatch).toContain("Build isolation, native-first");
    expect(dispatch).toContain("client's own isolation primitive");
    expect(dispatch).toContain("declared once, before the first Phase 3 dispatch");
    expect(dispatch).toContain("One of the four supported clients publishes no primitive");
    expect(dispatch).toContain("the fallback is manual");
    expect(dispatch).toContain("serializes Phase 3");
    expect(dispatch).toContain("absent reads as serialize");
  });

  it("exempts security-relevant content from context-budget truncation", async () => {
    const dispatch = collapse(section(await body(), "## Dispatch contract"));
    expect(dispatch).toContain("degrade summaries before evidence");
    expect(dispatch).toContain("Security-relevant content");
    expect(dispatch).toContain("exempt from truncation at every budget level, deep included");
  });
});

describe("/st-work — dials", () => {
  it("states what light intensity skips, not only what deep adds", async () => {
    const lightRow = intensityRow(section(await body(), "## Dials"), "light");
    expect(lightRow).toContain("Skips:");
    expect(lightRow).toContain("auto-continues");
    // Named lenses, not a wholesale "specialist passes": the row has to say
    // WHICH lenses light drops, because the one it does not drop is the
    // security lens the charter's universal floor holds at every tier.
    expect(lightRow).toContain("`design-quality` and `performance` specialist lenses");
    // Pruning is bounded: the row also names what light keeps.
    expect(lightRow).toContain("Keeps:");
  });

  it("holds gates, QA checkpoint, and proof block at every tier", async () => {
    const dials = collapse(section(await body(), "## Dials"));
    expect(dials).toContain("intensity prunes roles and fan-out, not floors");
  });

  it("names the four model classes and no vendor ids", async () => {
    const dials = section(await body(), "## Dials");
    for (const cls of ["frontier", "advanced", "standard", "economy"]) {
      expect(dials).toContain(cls);
    }
    // Model-Independence Contract: shipped content names no models or vendors.
    expect(await body()).not.toMatch(/\b(?:claude|gpt|gemini|sonnet|opus|haiku|codex|copilot)\b/i);
  });

  it("keeps the three intensity rows consistent about the specialist pass", async () => {
    const dials = section(await body(), "## Dials");
    // The tier the pass is defined by, the tier that runs a lens on a match,
    // and the tier that runs the security lens and nothing else. Three rows,
    // one mechanism — a row that drifts promises a lens the flow does not
    // spawn, or hides one it does.
    //
    // Light used to skip "specialist passes" wholesale. That voided the
    // charter's universal security floor at one tier, silently, on exactly the
    // surfaces the security specialist exists for. The row is now pinned in
    // both halves: the two lenses it drops by name, and the security lens it
    // keeps on a trigger-path match. The wholesale phrase is asserted absent so
    // a re-broadening reads as a failure rather than a reword.
    expect(intensityRow(dials, "deep")).toContain("the full specialist pass");
    expect(intensityRow(dials, "standard")).toContain("specialist lens on a trigger match");
    expect(intensityRow(dials, "light")).toContain("Skips:");
    expect(intensityRow(dials, "light")).toContain(
      "`design-quality` and `performance` specialist lenses",
    );
    expect(intensityRow(dials, "light")).not.toContain("specialist passes");
    expect(intensityRow(dials, "light")).toContain(
      "`security` specialist lens on a trigger-path match",
    );
  });

  it("places the whole-branch deep review inside Phase 4's own sub-section order", async () => {
    const raw = await body();
    const dials = section(raw, "## Dials");

    // "Prove-final" named a stage this file never defines: Phase 4 ships
    // Gates, Review loop, Specialist pass, QA checkpoint, Proof block and Side
    // effects, and nothing called Prove-final. Two rows pointed at it — the
    // deep intensity row and the ladder's frontier rung — so the one placement
    // justifying the top model class resolved against nothing a reader could
    // find. The anchor is now stated in terms of sub-sections that exist, and
    // the dead term is asserted absent so it cannot come back as a reword.
    expect(raw).not.toContain("Prove-final");

    const anchor = "once the review loop converges and before the QA checkpoint";
    expect(intensityRow(dials, "deep")).toContain(anchor);
    expect(intensityRow(dials, "deep")).toContain("whole-branch multi-lens review");
    const frontierRow = ladderRoleCells(dials).get("frontier") ?? "";
    expect(frontierRow).toContain("whole-branch deep review");
    expect(frontierRow).toContain(anchor);
    // The anchor names real sub-sections, in the order Phase 4 declares them.
    const prove = section(raw, "## Phase 4 — Prove");
    expect(prove.indexOf("### Review loop")).toBeGreaterThanOrEqual(0);
    expect(prove.indexOf("### QA checkpoint")).toBeGreaterThan(prove.indexOf("### Review loop"));
  });

  it("binds the ladder table's role column to MODEL_LADDER", async () => {
    expect(ladderViolations(section(await body(), "## Dials"))).toEqual([]);
  });

  it("fixture: a cell naming a role from another rung is flagged", () => {
    // The defect this case exists to catch — the pre-rework table put the
    // implementer on `standard` while the corpus declared it `advanced`, so a
    // correctly emitted agent read as a mismatch to the agent verifying it.
    const drifted = [
      "### Model ladder",
      "",
      "| Class | Assigned to |",
      "|---|---|",
      ...MODEL_LADDER.map((row) =>
        row.modelClass === "standard"
          ? "| standard | the implementer; the researcher |"
          : `| ${row.modelClass} | the ${row.roles[0] ?? ""} |`,
      ),
    ].join("\n");

    expect(ladderViolations(drifted)).toEqual([
      expect.stringMatching(/the standard row names `implementer`/),
    ]);
  });
});

describe("/st-work — testing philosophy and return contract", () => {
  it("ships the testing-philosophy blockquote with its verbatim anchors", async () => {
    const raw = section(await body(), "## Testing philosophy");
    // Byte-level anchors per the design contract — raw matching, no collapse.
    expect(raw).toContain("No green, no done");
    expect(raw).toContain("gating tests are not edited, deleted, or special-cased");
    const prose = raw.split("\n").filter((line) => line.trim() !== "");
    expect(prose.length).toBeGreaterThan(0);
    for (const line of prose) {
      expect(line.startsWith(">"), "philosophy text stays inside the blockquote").toBe(true);
    }
  });

  it("inlines the shared return contract: status enums and severity scale", async () => {
    const contract = collapse(section(await body(), "## Return contract"));
    for (const status of ["DONE", "BLOCKED_AMBIGUITY", "BLOCKED_DEPENDENCY", "BLOCKED_FAILURE"]) {
      expect(contract).toContain(status);
    }
    expect(contract).toContain("Critical / Warning / Minor");
    // Sub-agents do not ASK; ambiguity surfaces as a BLOCKED return.
    expect(contract).toContain("do not ask the operator");
  });
});
