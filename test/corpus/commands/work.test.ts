import { describe, expect, it } from "vitest";
import { frontmatterField } from "../../../src/content/frontmatter.ts";
import { cursorCompanionFrontmatter } from "../../../src/content/mdcCompanions.ts";
import { CLI_TOKEN, VERIFY_GATE_ALL_TOKEN } from "../../../src/emit/substitution.ts";
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

// Fixture data kept out of the test-input census: built at run time, as a literal it names this repository's own inbox.
const INBOX = [".stamity", "inbox.md"].join("/");

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

/**
 * The section skeleton, in reading order; extra subheadings may appear between rows.
 *
 * TEST CHANGE, justified (2026-09-23): the order moved on purpose. `## Dispatch
 * contract` and `## Return contract` now follow Phase 3 and precede Phase 4, and
 * `## Dials` and `## Testing philosophy` close the body, so the two contracts a
 * resumed run needs sit inside the client's post-compaction re-attachment of the
 * command body (REQ-CTX-014). The move removes no text; the same headings are
 * pinned, only their order changed.
 */
const SKELETON = [
  "# /st-work",
  "## Phase 0 — Frame",
  "## Phase 1 — Understand",
  "## Phase 2 — Plan",
  "## Phase 3 — Build",
  "## Dispatch contract",
  "## Return contract",
  "## Phase 4 — Prove",
  "### Gates",
  "### Review loop",
  "### Specialist pass",
  "### QA checkpoint",
  "### Proof block",
  "### Side effects",
  "## Dials",
  "## Testing philosophy",
] as const;

/**
 * The characters a resumed run can rely on after a compaction, counted from the
 * file's first byte with the frontmatter included.
 *
 * Claude Code re-attaches only the first 5,000 tokens of an invoked command body
 * after it compacts a conversation. Measured on this command (the phrase
 * "whole-branch multi-lens rev" was the last text re-attached), the cut sits at
 * about 19,890 body characters (a file offset between 20,250 and 20,500), about
 * 4.0 characters per token; 18,000 file characters keeps margin under it. What
 * a resumed run needs — the Dispatch contract, the Return contract and the
 * whole Review loop, caps included — must end before this offset.
 *
 * The offsets are measured on this corpus source, not on the emitted
 * `.claude/commands/st-work.md` the client re-attaches. The source is the
 * conservative proxy: its frontmatter head (about 480 characters) is larger than
 * the emitted head (about 160, the description alone), so every section sits
 * later here than in the emitted copy. One caveat bounds that margin: the
 * `### Gates` substitution tokens precede the Review loop and expand to the
 * consumer's gate commands, so a gate command set about 320 characters longer
 * than its tokens would move the emitted Review loop past where it sits here.
 */
const REATTACH_BUDGET_CHARS = 18_000;

/** The plan artifact: owner of the intake contract this command cites. */
const PLAN_PATH = "commands/st-plan.md";

/** The board command: owner of the deferral-inbox census this command cites. */
const BOARD_PATH = "commands/st-board.md";

/** The qa skill: owner of the QA row states the checkpoint's pointer names. */
const QA_SKILL_PATH = "skills/st-qa/SKILL.md";

/** The dependency audit skill: owner of what "the audit flags something" means in the Specialist pass. */
const DEP_AUDIT_SKILL_PATH = "skills/st-dep-audit/SKILL.md";

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

/**
 * The character offset in `text` where one section ends: the newline that
 * closes its last line, directly before the next heading of the same or a
 * higher level (or the end of the text). The heading must stand on its own
 * line after a newline.
 */
function sectionEnd(text: string, heading: string): number {
  const at = text.indexOf("\n" + heading + "\n");
  if (at === -1) throw new Error(`heading not found on its own line: ${JSON.stringify(heading)}`);
  return at + 1 + heading.length + 1 + section(text, heading).length;
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

  it("ends what a resumed run needs before the client's re-attachment cut", async () => {
    // From the file's first byte, frontmatter included — not the parsed body.
    const text = (await workFile).raw;
    const returnEnd = sectionEnd(text, "## Return contract");
    expect(sectionEnd(text, "## Dispatch contract")).toBeLessThan(REATTACH_BUDGET_CHARS);
    expect(returnEnd).toBeLessThan(REATTACH_BUDGET_CHARS);

    // The review-loop caps end where the Minor/nit bullet starts.
    const capsEnd = text.indexOf("- Minor/nit findings are ledgered");
    expect(capsEnd).toBeGreaterThan(text.indexOf("- Escape before the cap"));
    expect(capsEnd).toBeLessThan(REATTACH_BUDGET_CHARS);
    // The whole Review loop, not only its caps, ends inside the budget.
    expect(sectionEnd(text, "### Review loop")).toBeGreaterThan(capsEnd);
    expect(sectionEnd(text, "### Review loop")).toBeLessThan(REATTACH_BUDGET_CHARS);

    expect(text.indexOf("\n## Dials\n")).toBeGreaterThan(returnEnd);
    expect(text.indexOf("\n## Testing philosophy\n")).toBeGreaterThan(returnEnd);
  });

  it("fixture: a contract pushed past the re-attachment cut is flagged", () => {
    const contracts = [
      "## Dispatch contract",
      "",
      "Every spawn runs under these contracts.",
      "",
      "## Return contract",
      "",
      "Every sub-agent returns a structured result.",
      "",
      "## Dials",
      "",
    ].join("\n");
    const inside = `# /st-work\n\n${contracts}`;
    const pushed = `# /st-work\n\n${"x".repeat(18_000)}\n\n${contracts}`;

    // Control: the same contracts near the top end inside the budget.
    expect(sectionEnd(inside, "## Dispatch contract")).toBeLessThan(REATTACH_BUDGET_CHARS);
    expect(sectionEnd(pushed, "## Dispatch contract")).toBeGreaterThan(REATTACH_BUDGET_CHARS);
    expect(sectionEnd(pushed, "## Return contract")).toBeGreaterThan(REATTACH_BUDGET_CHARS);
    // The helper lands on the newline directly before the next heading.
    expect(pushed.slice(sectionEnd(pushed, "## Dispatch contract"))).toMatch(/^\n## Return contract\n/);
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

  it("lists an inbox row a persisted plan settles and asks nothing about it (REQ-FLOW-019)", async () => {
    const frame = collapse(section(await body(), "## Phase 0 — Frame"));
    // A row the persisted plan already disposed of is recorded with that disposition, not asked.
    expect(frame).toContain("already settles");
    expect(frame).toContain("not asked about");
    // The unsettled rest ride the plan gate's one question and stay in the inbox by default.
    expect(frame).toContain("ride the plan gate's question");
    expect(frame).toContain("left in the inbox by default");
    // The old per-item ask is gone.
    expect(frame).not.toContain("the operator decides");
    // The floor the trim leaves alone: a materially ambiguous request still asks at step 1.
    expect(frame).toContain("ask ONLY when readings diverge materially");
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
    // Fixture data kept out of the test-input census: the glob is built at run time, as a literal it names every plan.
    expect(plan).toContain(["docs/plans/", "*", ".md"].join(""));
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

  it("takes a fresh persisted plan as the go-ahead at standard and still asks on deep (REQ-FLOW-019)", async () => {
    const plan = collapse(section(await body(), "## Phase 2 — Plan"));
    const gate = plan.slice(plan.indexOf("- **Plan gate.**"));
    expect(gate).toContain("passed the freshness guard is the go-ahead");
    // The skipped ask leaves one record line naming the gate, the default and the plan path.
    expect(gate).toContain("`Default applied: plan gate → option 1, execute now (persisted plan <path>)`");
    // Standard still asks when the plan was made in-flow; deep always asks.
    expect(gate).toContain("an in-flow plan is presented and asked");
    expect(gate).toContain("deep: present the unit list and ask");
    expect(gate).toContain("light: auto-continue");
    // The old joint standard/deep ask is gone, so neither tier reads it by accident.
    expect(gate).not.toContain("standard/deep");
  });

  it("carries the requirement id onto each decomposed unit, matching the plan artifact's field", async () => {
    const plan = collapse(section(await body(), "## Phase 2 — Plan"));

    // `/st-plan` pins a `requirements` field per unit and lints it; this phase
    // decomposes in-flow, so without the same clause an in-flow unit would
    // reach the implementer with no id — and the implementer's spec delta is
    // required to name one. The fallback matches, so a spec-less repository
    // records the absence instead of stalling the build flow.
    expect(plan).toContain("names the spec requirement ids it implements");
    expect(plan).toContain("records that the spec carries none");
    expect(plan).toContain("the join key the plan unit, the implementer's delta and the test name share");
  });

  it("opens the run record head at Frame with the plan and the invocation (REQ-CTX-012)", async () => {
    const frame = collapse(section(await body(), "## Phase 0 — Frame"));
    // TEST CHANGE, justified (2026-10-10, plan 019 file 3, unit f0-make-room; REQ-CTX-014): the
    // four head lines and the `reports/` folder's `.gitignore` moved out of Frame step 5 into the
    // Proof block's record paragraph, below the re-attachment cut, to make room above it. Frame
    // still opens the record and points at that paragraph; a resumed run reads an existing head
    // and never rewrites it. Every phrase below is pinned word for word as before, only its
    // section moved from Frame to `### Proof block`, and the pointer is pinned in Frame.
    const proof = collapse(section(await body(), "### Proof block"));
    expect(frame).toContain("with the head lines and the `reports/` folder the Proof block names");

    // The resume card is built from the record's head after a compaction, so
    // the head has to name what the run executes and how it was invoked, near
    // the top where a reader of the first lines finds it.
    expect(proof).toContain("`Plan: <path>`");
    expect(proof).toContain("`Invocation: <this command line, verbatim>`");
    expect(proof).toContain("among its first 15");
    // Added 2026-10-09 (plan 019 file 2, the p3 fix round, `review/115`): the head records the
    // run's base, which the Gates read for the scan and the class (sign-off: the run's branch point).
    expect(proof).toContain("with four lines among its first 15");
    // TEST CHANGE, justified (2026-10-09, plan 019 file 2, the p3 fix round 2, `review/133`): the
    // line holds the commit id `HEAD` resolves to at Frame, never the word, which `gate` would
    // resolve at Prove time, after the units commit (sign-off: `git rev-parse HEAD`).
    expect(proof).toContain(
      "`Base: <commit>`, the run's branch point (`git rev-parse HEAD` at Frame, never the word `HEAD`)",
    );
    // The reports folder is created beside the record and ignored by git.
    expect(frame).toContain("`reports/` folder");
    expect(proof).toContain("`reports/` folder");
    expect(proof).toContain("whose one line is `*`");
  });

  it("persists an in-flow plan once under the run folder, never under the plan artifacts (REQ-CTX-009)", async () => {
    const plan = collapse(section(await body(), "## Phase 2 — Plan"));

    // Pointer dispatch needs a file to point at; an in-flow plan gets one copy
    // in the run folder, which is not a reviewable `/st-plan` artifact.
    expect(plan).toContain("persisted nowhere under `docs/plans/`");
    expect(plan).toContain("`.stamity/runs/<run-id>/plan.md`");
    expect(plan).toContain("not a reviewable artifact");
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

  it("points at the census rule for the contract kinds, the row grammar and the facade-hold, which the rule carries", async () => {
    const census = collapse(section(await body(), "### Contract census"));
    const rule = collapse((await corpusFile(CENSUS_RULE_PATH)).parsed.body);

    // The step names what it no longer restates; the cited rule has to carry each of them, so the
    // pointer cannot outlive its target (plan 019 file 2, unit p0-make-room).
    expect(census).toContain("which carries the contract kinds, the row grammar and the facade-hold");
    expect(rule).toContain("an exported signature");
    expect(rule).toContain("a configuration key");
    expect(rule).toContain("| Contract | The identifier as spelled at the seam |");
    expect(rule).toContain("**Facade-hold when two units need one contract.**");
    expect(rule).toContain("guessing that the file lists imply independence is not");
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

  it("runs each gate once, reads its exit code from the tool, and never counts unknown as a pass", async () => {
    const raw = section(await body(), "### Gates");
    const gates = collapse(raw);
    // REQ-FLOW-013: one run per gate, as the charter spells it, exit code read from the tool.
    expect(gates).toContain("runs each gate once");
    expect(gates).toContain("reads the exit code from the tool");
    expect(gates).toContain("`unknown`, never a pass");
    expect(gates).toContain("pass/fail/unknown");
    // REQ-FLOW-015: a byte-identical tree may cite; the final tree is always gated.
    expect(gates).toContain("byte-identical tree");
    expect(gates).toContain("the final tree always gets a run of its own");
    expect(gates).toContain("never a lighter pass");
    // The rule is stated in words; no shell exit-status idiom rides along in the body.
    expect(raw).not.toMatch(/PIPESTATUS|\$\?/);
  });

  // Added 2026-10-09 (plan 019 file 2, unit p3c-work-gates; REQ-FLOW-063, REQ-FLOW-066): the Prove
  // pass scans the change against the run's base first, then takes the class's gates. The
  // check-to-gate mapping, the full gates from `product` up and the CI condition live in the
  // test-runner body (`test/corpus/agents/quality.test.ts` pins them); what stays here is the
  // orchestrator's: the scan and its stop, the class step, the no-base rule and `review-once`.
  it("scans against the run's base first, then runs the class's gates", async () => {
    const gates = collapse(section(await body(), "### Gates"));
    const scan = "Each Prove pass first runs `stamity gate scan --base <the run's base>`";
    expect(gates).toContain(scan);
    // A hit always stops, named by place and rule, never by value, and never cleared by a respell
    // (sign-off on `plan/57`).
    // TEST CHANGE, justified (2026-10-09, plan 019 file 2, the p3 fix round, the orchestrator's
    // note on p5e's scan output): this pinned "a hit stops it, naming path, line and rule, never the
    // value"; a hit in a commit's added lines since the base carries that commit, named too.
    expect(gates).toContain(
      "a hit stops it, naming path, line and rule, and the commit when the hit is in the branch's history, never the value",
    );
    expect(gates).toContain("never cleared by rewriting the value and scanning again");
    expect(gates).toContain("a hit on a deliberate fixture is the person's to settle");
    // TEST CHANGE, justified (2026-10-09, plan 019 file 2, the p3 fix round, `review/120`): this
    // pinned "An `unscanned` list puts …", which dropped the paths and read as covering an empty
    // list; the line now matches the common rule and `/st-quick`.
    expect(gates).toContain(
      "A non-empty `unscanned` list puts `secret scan: <n> files unscanned` under `Not done:`, naming the paths.",
    );
    // Added 2026-10-09 (the p3 fix round, `review/115`): the base is the record's `Base:` line.
    expect(gates).toContain("`stamity gate scan --base <the run's base>` (the record's `Base:` line)");
    // The class step: the selected files during the build, the class's gates on the final tree.
    // TEST CHANGE, justified (2026-10-09, the p3 fix round, `review/110`, `review/114`): this
    // pinned the bare "`stamity gate classify` names the class". With no `--base` the CLI reads only
    // the uncommitted paths and no class file, so a run whose units are committed classed as
    // `records`; the call now carries the scan's base, and `--json` as `/st-quick`'s does.
    const classify = "`stamity gate classify --base <the run's base> --json` names the class";
    expect(gates).toContain(classify);
    expect(gates).toContain("its checks run on the selected files in the build, its gates on the final tree");
    expect(gates).toContain("as `test-runner` maps them");
    // No nameable base (`plan/39`, `plan/56`), a CLI that cannot run (`plan/32`), and a scan that
    // read nothing (p3b's rule) all take the full gates with the scan named as not run.
    expect(gates).toContain(
      `With no base, the scan takes \`HEAD\` and the final tree runs \`${VERIFY_GATE_ALL_TOKEN}\` unclassified (\`unclear\`)`,
    );
    expect(gates).toContain("committed work then lists `secret scan: not run` under `Not done:`");
    // Added 2026-10-09 (run 2026-10-08_product-core, the p5 group's fix round 3, `build/94`): a
    // classify that exits 1 names no class, so the final tree takes the same unclassified full gates.
    expect(gates).toContain("unclassified (`unclear`), as after a classify exiting 1;");
    // TEST CHANGE, justified (2026-10-09, the p3 fix round, `review/121`): this pinned "as do a CLI
    // that cannot run and a scan naming a `reason`, …"; an installed copy that predates `gate` now
    // takes the same line.
    expect(gates).toContain(
      "as do a CLI that cannot run or has no `gate` verb and a scan naming a `reason`, both on the full gates",
    );
    // Added 2026-10-09 (the p3 fix round, `review/119`): the maintainer's opening answer 2 puts
    // the CI condition in `/st-work`'s Gates text; it moved here from the test-runner body.
    expect(gates).toContain(
      "The narrower gates rest on one condition: the repository's CI runs the full matrix on every `product` or stronger change and on a schedule.",
    );
    // One review pass for a `review-once` class (`plan/48`).
    expect(gates).toContain(
      "A class naming `review-once` gets one review pass: a Critical or Warning it raises is fixed and closure-reviewed once, and no further round runs",
    );
    // The order is the pass's order: scan, classify, then the runner.
    expect(gates.indexOf(scan)).toBeLessThan(gates.indexOf(classify));
    expect(gates.indexOf(classify)).toBeLessThan(gates.indexOf("The test-runner runs each gate once"));
  });

  // Added 2026-10-09 (plan 019 file 2, unit p3c-work-gates; REQ-FLOW-015, `plan/40`): the gate line
  // names the class the gates followed before the per-gate rows.
  it("names the change's class on the proof block's gate line", async () => {
    const proof = collapse(section(await body(), "### Proof block"));
    // TEST CHANGE, justified (2026-10-09, plan 019 file 2, the p3 fix round, `review/117`,
    // `build/62`): the class rides the "Gate results" label line itself. A class line of its own
    // between the label and the table became the table's lead in `src/cli/docs/measurements.ts`
    // (`labelledTables`), which then excluded the run as "gates in prose only".
    // TEST CHANGE, justified (2026-10-09, the p3 fix round 2, `review/137`): the label line also
    // shows the base, so a hand-edited later `Base:` that narrowed the scan and the class is seen.
    expect(proof).toContain(
      "- gate results — the change's class as `gate classify` named it (`unclear` when none ran) and the run's base commit, on the `Gate results` label line itself, then per gate: command, pass/fail/unknown, failing excerpt if any, or the earlier result a byte-identical tree cites",
    );
  });

  it("records gate results as pass/fail/unknown in the proof block", async () => {
    const proof = collapse(section(await body(), "### Proof block"));
    expect(proof).toContain("per gate: command, pass/fail/unknown");
    expect(proof).toContain("the earlier result a byte-identical tree cites");
    // Added 2026-10-09 (p4a–c review r1 fix round, `review/30`): the review line has a slot for the
    // two records the Review loop requires of it.
    expect(proof).toContain("review verdicts + confidence, per round, naming an approval below the gate");
    expect(proof).toContain("each escalation's effort step or `effort: not settable`");
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

  // TEST CHANGE, justified (2026-10-09, plan 019 file 2, unit p4b-fixer-escalation): the pins read
  // "rounds 1–2 keep the same fixer", "round 3 spawns a fresh fixer" and "fresh fixer on a
  // stronger model class". Escalation now keys on what the run shows — two `re-review not-fixed`
  // notes on a finding's ledger row, a gate red after a fix, or a finding still open at the cap
  // round — and goes to a fresh fixer spawn on the same model at one effort level above
  // (REQ-FLOW-064, REQ-LADDER-003). The stronger-class stage is retired, so its phrase is asserted
  // absent from the whole body; the cap's BLOCKED_FAILURE stop and a raised cap's "no new stage"
  // stay pinned, and the light tier's cap is pinned as prose (the hook cannot see a tier).
  // TEST CHANGE, justified (2026-10-09, plan 019 file 2, p4a–c review r1 fix round, `review/25`,
  // `review/27`, `review/29`): the third trigger read "a finding still open at the cap round",
  // which also reads as "after the cap round's review", where the closure re-review would be a
  // round past the cap; it now reads "entering the cap round". The orchestrator attaches the round
  // history to the escalation spawn (a dispatcher's duty the fixer cannot do for itself), so the
  // clause is pinned here. The light cap's hook caveat is pinned as signed off: a hook that cannot
  // see the tier may hold a light run to the engine cap.
  it("escalates on what the run shows and stops as BLOCKED past the escalation fixer", async () => {
    const text = await body();
    const loop = collapse(section(text, "### Review loop"));
    expect(loop).toContain(`${DEFAULT_MAX_REVIEW_ITERATIONS} rounds by default (2 at light)`);
    // TEST CHANGE, justified (2026-10-10, plan 019 file 3, unit f0-make-room; REQ-CTX-014): the
    // light cap's hook caveat moved out of the Review loop's cap bullet into the client-events
    // paragraph under `### Intensity`, which is about what the hook enforces, to make room above
    // the re-attachment cut. The phrase is pinned word for word, only its section moved.
    const events = collapse(section(text, "### Intensity"));
    expect(events).toContain("a review-gate hook that cannot see the tier may hold a light run to the engine cap");
    // The three triggers, in order.
    const triggers = [
      "a finding whose ledger row carries two `re-review not-fixed` notes",
      "a gate red after a fix",
      "a finding still open entering the cap round",
    ];
    for (const trigger of triggers) expect(loop, trigger).toContain(trigger);
    const positions = triggers.map((trigger) => loop.indexOf(trigger));
    expect(positions).toEqual([...positions].toSorted((a, b) => a - b));
    expect(loop).not.toContain("still open at the cap round");
    expect(loop).toContain("goes to a fresh fixer spawn — never the resumed one — with the round history attached");
    expect(loop).toContain("on the same model at one effort level above the fixer's declared one");
    expect(loop).toContain("the proof block records `effort: not settable`");
    expect(loop).toContain("A finding that fixer leaves open stops the run as BLOCKED_FAILURE");
    expect(loop).toContain("No round past the cap runs");
    // Raising the cap is an operator act, not a free stage.
    expect(loop).toContain("raises the cap");
    expect(loop).toContain("adds no new stage");
    expect(collapse(text)).not.toContain("fresh fixer on a stronger model class");
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

  // TEST CHANGE, justified (2026-10-09, plan 019 file 2, unit p0-make-room): the client-events
  // paragraph moved out of `### Review loop` to the end of `## Dials` → `### Intensity`, below the
  // re-attachment cut, to free room above it (REQ-FLOW-063, REQ-FLOW-064); its first sentence now
  // reads "under the review loop". The contract is unchanged: every phrase is pinned word for word
  // in its new section, and the negative pin now holds over both sections, so it is not weaker.
  it("frames the mechanical gate as additional and client-dependent", async () => {
    const loop = collapse(section(await body(), "### Review loop"));
    const events = collapse(section(await body(), "### Intensity"));
    // Guarantee honesty: the hook-expressed gate gets a prose twin that
    // states what holds where, and refuses the uniform-enforcement claim.
    expect(events).toContain("Two client events sit under the review loop");
    expect(events).toContain("an additional check on top of this text, not a replacement for it");
    expect(events).toContain("On clients without those events");
    expect(events).toContain("prompt-carried only");
    expect(events).toContain("The enforcement is uneven by construction");
    // The honest twin is the ladder, not the mechanism: no counter file, path,
    // or exit code leaks into shipped prose.
    for (const text of [loop, events]) {
      expect(text).not.toMatch(/exit\s*(?:code\s*)?2|counter file|\.json\b|SubagentStop/i);
    }
  });

  it("separates the event that holds the cap from the event that only counts", async () => {
    // TEST CHANGE, justified (2026-10-09, plan 019 file 2, unit p0-make-room): read from
    // `### Intensity`, where the paragraph moved (see the case above); the phrases are unchanged.
    const events = collapse(section(await body(), "### Intensity"));

    // One sentence credited the sub-agent-completion event with holding
    // the cap. It never blocks — the hold rides task completion — so the two
    // events have to be named apart or the claim is a guarantee nothing keeps.
    expect(events).toContain("task-completion event is the one that HOLDS");
    expect(events).toContain("refuse the completion");
    expect(events).toContain("sub-agent-completion event only COUNTS");
    expect(events).toContain("never blocks");
    // Coverage is one client of four, stated rather than implied by "where".
    expect(events).toContain("Exactly one of the four supported clients publishes either event");
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
    // TEST CHANGE, justified (2026-10-09, plan 019 file 2, unit p5c, REQ-FLOW-065): the pin read
    // "standard and light run the `security` lens on a trigger-path match". The lens now also runs
    // at every tier when `gate classify` names the class `security-sensitive` (a changed code line
    // the trigger paths never see places a change there), so the tier sentence names both sources.
    expect(pass).toContain(
      "The `security` lens runs at every tier when `stamity gate classify` names the class " +
        "`security-sensitive`, and on a trigger-path match",
    );
    expect(pass).toContain("standard runs a lens on a trigger-path match");
    expect(pass).toContain("light runs no other lens");
    expect(pass).not.toContain("light runs none");
    // Added 2026-10-09 (plan 019 file 2, the p5 group's fix round 1, `review/162`): with no class to read,
    // the lens fails closed, at every tier, as for `security-sensitive`.
    expect(pass).toContain(
      "With no class from `gate classify` (no `Base:`, no CLI or `gate` verb) or a `reason` naming a failed " +
        "read, the lens runs at every tier as for `security-sensitive`.",
    );
    // The reason travels with the rule, so a later trim reads it as load-bearing.
    expect(pass).toContain("universal floor holds at every tier");
  });

  it("lets topic words add a lens and never remove one (REQ-FLOW-065)", async () => {
    const pass = collapse(section(await body(), "### Specialist pass"));
    expect(pass).toContain("Topic words may add a lens and never remove one");
  });

  it("runs the dependency audit before the security lens only on a proven lockfile-only bump (REQ-FLOW-065)", async () => {
    const pass = collapse(section(await body(), "### Specialist pass"));
    // The shortcut is the class's own check, never the orchestrator's reading of the file list.
    expect(pass).toContain("When the class's checks name `dependency-audit`");
    expect(pass).toContain(
      "the dependency audit runs first, and the lens only if the audit flags something",
    );
    // Every side the shortcut cannot prove keeps the lens, so the path never ends with neither.
    expect(pass).toContain("A bump of a package with an install script");
    expect(pass).toContain("any other lockfile format");
    expect(pass).toContain("a parse failure");
    expect(pass).toContain("an audit that cannot run keeps the lens");
    // Added 2026-10-09 (the p5 group's fix round 1, `review/168`): the audit-first rule takes precedence
    // over the lockfiles' own trigger-path match, which would otherwise call the lens first.
    expect(pass).toContain("the lockfiles' own trigger-path match waits for that flag");
    // Described in words: a lockfile's file name is a trigger pattern, and the roster owns those.
    expect(pass).toContain("dependency lockfiles");
    expect(pass).not.toMatch(/[\w-]+[.-]lock(?:\.[a-z]+)?\b|\block\.(?:json|yaml)\b/i);
  });

  it("has the dependency audit skill define the flag the audit-first path reads (D7)", async () => {
    const skill = (await corpusFile(DEP_AUDIT_SKILL_PATH)).parsed.body;
    const role = collapse(section(skill, "## Before the security lens"));
    expect(role).toContain("`/st-work`");
    expect(role).toContain("`dependency-audit`");
    // "Flags something" is the three outcomes the skill's own steps produce.
    expect(role).toContain("an advisory at any severity");
    expect(role).toContain("a licence flag");
    expect(role).toContain("an update-risk class other than `patch` or `minor`");
    // A run that could not cover the graph is not a clean audit, so the lens still runs.
    expect(role).toContain("A `partial` run, or an audit that cannot run, counts as a flag");
    // Added 2026-10-09 (the p5 group's fix round 1, `review/166`, `review/160`): the flag reads only what
    // the bump changes, in every changed lockfile, so a standing condition elsewhere in the graph does not
    // send every bump to the lens, and a nested lockfile is not left unaudited.
    expect(role).toContain("every changed lockfile the class's `byPath` names, nested ones included");
    expect(role).toContain("counts only the entries the bump adds or changes");
    expect(role).toContain("A standing condition on an entry the bump leaves alone is reported and does not flag");
    // Added 2026-10-09 (the p5 group's fix round 2, `review/178`): the entries are found against the run's
    // base, since units commit as they go and a comparison with `HEAD` would find none.
    expect(role).toContain(
      "An entry is the bump's own when it differs from the run's base, the `Base:` commit `gate classify` read, never from `HEAD`",
    );
    expect(role).toContain("a base the audit cannot read makes the run `partial`");
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
    // TEST CHANGE, justified (2026-10-09, plan 019 file 2, p4a–c review r1 fix round, `review/24`):
    // the pin read "at-confidence approval exits", which told the orchestrator a below-gate approval
    // does not exit, against the Review loop's own rule that it counts and is named (REQ-CTX-018).
    expect(loop).toContain("an approval exits, a below-gate one named");
    expect(loop).not.toContain("at-confidence");
    expect(loop).toContain("diverged");
  });

  it("ledgers minor findings and suppresses new nits on re-review", async () => {
    const loop = collapse(section(await body(), "### Review loop"));
    expect(loop).toContain("never loop-triggering");
    expect(loop).toContain("new nits are suppressed");
  });

  it("keeps a note with no consequence out of the findings it ledgers (REQ-FLOW-072)", async () => {
    const loop = collapse(section(await body(), "### Review loop"));
    // The bullet's opening words stay: the re-attachment pin measures the caps' end at them.
    const bullet = loop.slice(loop.indexOf("- Minor/nit findings are ledgered"));
    expect(bullet.split(" - ")[0]).toContain("A note with no consequence is not a finding.");
  });

  it("closes a re-review's prior findings by ledger id through the closures block (REQ-CTX-008)", async () => {
    const loop = collapse(section(await body(), "### Review loop"));

    // A re-review that re-lists findings in prose leaves the orchestrator to
    // diff two reports by hand; one closure per ledger id lets the ledger verb
    // apply them and makes an unchanged set or an oscillation readable off ids.
    // The block's info string is not pinned here: the reviewer definition writes
    // it and the ledger verb parses it, while this body only routes the report,
    // and a prefixed literal in a command body reads as an artifact mention to
    // invariant 13.
    expect(loop).toContain("one closure per id in its closures block");
    for (const status of [
      "`fixed`",
      "`not-fixed`",
      "`regressed`",
      "`rejection-upheld`",
      "`rejection-overturned`",
    ]) {
      expect(loop, `closure status missing: ${status}`).toContain(status);
    }
    expect(loop).toContain("`stamity ledger close --report`");
    // build/58: only the handed ids close; a closure for any other row is refused, not applied.
    // build/101: the pin moved with the body — C7 refuses the WHOLE close on such a closure, so the old
    // "is a finding, never applied" wording read as a partial apply; the behaviour pinned is unchanged.
    expect(loop).toContain("with the handed ids as `--ids`");
    expect(loop).toContain("a closure naming any other id refuses the whole close");
    expect(loop).not.toContain("never applied");
  });

  it("re-reviews with a fresh reviewer and counts an approval when no gate is declared (REQ-CTX-018)", async () => {
    const loop = collapse(section(await body(), "### Review loop"));

    // A resumed reviewer carries the round it already judged; a fresh spawn reads
    // the fix itself, briefed like any verdict role and never with a fixer's claim.
    expect(loop).toContain("Each re-review is a fresh reviewer spawn, never a resumed one");
    expect(loop).toContain("its brief is the Verdict dispatch's");
    expect(loop).toContain("each finding's locator at HEAD");
    expect(loop).toContain("no fixer claim");

    // The gate is the one the run record declares; the measurements page reads a
    // decimal gate only (a word gate such as `high` falls to its 0.8 default). The
    // hook's refusal of a `low` approval still holds.
    // TEST CHANGE, justified (2026-10-09, plan 019 file 2, unit p4c-confidence-no-round): the
    // pins read "An approval below it re-reviews once on a stronger class before it counts" and
    // "With no gate declared, an approval counts as given and no extra round runs". Self-rated
    // confidence no longer starts a round (REQ-CTX-018, REQ-FLOW-064): an approval below the
    // declared gate counts and the proof block names it below the gate, so the no-gate case is
    // no longer a special case and its sentence went. The stronger-class re-review now runs once,
    // only on the closure re-review after an escalation. The old sentence is asserted absent.
    expect(loop).toContain("the one the run record declares (`Confidence gate: <value>`)");
    expect(loop).toContain("An approval below it counts and the proof block's review line names it below the gate");
    expect(loop).toContain("confidence alone starts no round");
    expect(loop).toContain("The re-review after an escalation runs once on a stronger class");
    expect(loop).not.toContain("An approval below it re-reviews once on a stronger class before it counts");
    expect(loop).not.toContain("before it counts");
    expect(loop).toContain("still refuses an approval the reviewer rated `low`");
    expect(loop).not.toContain("below the declared confidence gate");
  });

  it("closes each QA row walked, auto-proven or accepted-unwalked, and records them (REQ-FLOW-017, REQ-FLOW-018)", async () => {
    const qa = collapse(section(await body(), "### QA checkpoint"));
    // TEST CHANGE, justified (2026-10-09, plan 019 file 2, unit p0-make-room): `/st-work`'s Row
    // states paragraph became one sentence pointing at the qa skill, which already carried every
    // state and rule it restated (its table's Proof column, `## Human sign-off`). The states and rules
    // are now pinned where they live, on the skill; this body pins the pointer and its place.
    expect(qa).toContain("**Row states.**");
    expect(qa).toContain("The qa skill closes each row in its own row states, under its `## Human sign-off` rules");
    const skill = (await corpusFile(QA_SKILL_PATH)).parsed.body;
    expect(skill).toMatch(/^## Human sign-off$/m);
    const signOff = collapse(section(skill, "## Human sign-off"));
    for (const state of ["`walked`", "`auto-proven`", "`accepted-unwalked`", "`Shippable: not signed`"]) {
      expect(collapse(skill), `row state missing: ${state}`).toContain(state);
    }
    // A bare sign-off is an acceptance, never a walk.
    expect(signOff).toContain("records each open row `accepted-unwalked` with its input hash, never `walked`");
    expect(signOff).toContain("not asked again");
    expect(signOff).toContain("with no ask");
    expect(signOff).toContain("An unattended run asks nothing and records `Shippable: not signed`");
    // The H row exception: release-blocking rows never carry on a hash.
    expect(signOff).toContain(
      "never a row whose Risk is now `H`, which is asked at every checkpoint until walked or auto-proven",
    );
    expect(signOff).toContain("an H row accepted unwalked blocks release");
    // The pointer sits after the existing close of the checkpoint, which stays as it was.
    expect(qa.indexOf("**Row states.**")).toBeGreaterThan(
      qa.indexOf("The checkpoint covers what automation cannot."),
    );

    const proof = collapse(section(await body(), "### Proof block"));
    expect(proof).toContain("QA rows —");
    expect(proof).toContain("`accepted-unwalked` with its input hash; then the sign-off, or `not signed`");
    // The QA line follows the review-verdicts line and precedes the decisions trace.
    const qaLine = proof.indexOf("QA rows —");
    expect(qaLine).toBeGreaterThan(proof.indexOf("review verdicts + confidence, per round"));
    expect(qaLine).toBeLessThan(proof.indexOf("decisions trace"));
  });

  it("closes on one question that bundles the person's rows, the spec merge and the commit (REQ-FLOW-019)", async () => {
    const qa = collapse(section(await body(), "### QA checkpoint"));
    expect(qa).toContain("**The close asks once.**");
    expect(qa).toContain("numbered options");
    // The three parts the one question covers.
    expect(qa).toContain("the rows no evidence proved, the spec delta merge and the commit");
    // The declared default is the lowest-blast-radius one: nothing committed, merged or signed.
    expect(qa).toContain("`Default if no response: leave uncommitted`");
    expect(qa).toContain("those rows not signed and the delta unmerged");
    expect(qa).toContain("with none left, there is no ask");
    // It follows the row-states paragraph, whose rows it asks about.
    expect(qa.indexOf("**The close asks once.**")).toBeGreaterThan(qa.indexOf("**Row states.**"));
  });

  it("hands the qa skill the class and lenses gate classify named (REQ-FLOW-069)", async () => {
    const qa = collapse(section(await body(), "### QA checkpoint"));
    // The skill skips the walk by class, so the checkpoint passes what the classify named.
    expect(qa).toContain(
      "Invoke the qa skill by name for the guided pass, handing it the class and lenses `gate classify` named (`unclear` when none ran).",
    );
    // Step 2 keeps its ownership sentence, after the hand-off.
    expect(qa.indexOf("The step belongs to the command already running")).toBeGreaterThan(
      qa.indexOf("handing it the class and lenses"),
    );
  });

  it("names the two optional ledger fields a report-appended row carries (REQ-CTX-006)", async () => {
    const proof = collapse(section(await body(), "### Proof block"));
    expect(proof).toContain("`report`, the repo-relative path of the report it came from");
    expect(proof).toContain("`decision_needed`, present only as `true`");
    // The eighth-field sentence stays true: the two new fields come after it.
    expect(proof.indexOf("`decision_needed`, present only as `true`")).toBeGreaterThan(
      proof.indexOf("an optional eighth field on the row, `retired`"),
    );
  });

  // Added 2026-10-10 (plan 019 file 3, unit q5-usage-lines; REQ-CTX-019, D17): what a phase and a
  // review round cost is one record line in a fixed grammar, a line of its own and never directly
  // above a table, because `src/cli/docs/measurements.ts` takes a table's lead from the nearest
  // non-empty line above it (`test/cli/docs/measurements.test.ts` holds that side).
  //
  // TEST CHANGE, justified (2026-10-10, plan 019 file 3, q5's fix round 1, `review/8` as signed
  // off): the pin read "An ended phase or review round adds `…` to the record, minutes from the
  // orchestrator's clock, after this list and never directly above a table." "After this list"
  // named the proof block's field list, which no record holds while Frame, Build or a review round
  // is ending, so the line had no place to go when it was due. The sentence now has the line
  // appended to the run record as the phase or round ends, the way a capacity line is, and names no
  // place inside the proof block. The text still sits where it sat, below the cut, and takes no
  // character from the re-attached index: the Resume bullet, above the cut, has a resumed run
  // "re-read this command's own file past the part the client re-attached" (pinned below, in the
  // Dispatch contract's tests).
  it("names the usage line a phase or review round appends, below the re-attachment cut (REQ-CTX-019)", async () => {
    const raw = (await workFile).raw;
    const proof = collapse(section(await body(), "### Proof block"));
    const usage =
      "**Usage lines.** As each phase or review round ends, append `- <UTC> usage: <phase | review rN> minutes=<n> tokens=<n | unreported> (<client>)` to the run record, as a capacity line is appended: minutes from the orchestrator's clock, a line of its own, never directly above a table.";
    expect(proof).toContain(usage);
    // The text sits after the field list's last item, before the citation paragraph.
    const at = proof.indexOf(usage);
    expect(at).toBeGreaterThan(proof.indexOf("says so in the same line."));
    expect(at).toBeLessThan(proof.indexOf("Cite native platform artifacts"));
    // The paragraph is that one sentence: nothing beside it names a place inside the proof block,
    // which no record holds while the run is still going.
    const paragraph = proof.slice(at, proof.indexOf("Cite native platform artifacts")).trim();
    expect(paragraph).toBe(usage);
    // Below the cut: the paragraph costs nothing a resumed run re-attaches.
    expect(raw.indexOf("**Usage lines.**")).toBeGreaterThan(raw.indexOf("\n### Specialist pass\n"));
    expect(raw.indexOf("**Usage lines.**")).toBeGreaterThan(REATTACH_BUDGET_CHARS);
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

  it("appends every deferred row to the inbox at exit, in the declared grammar", async () => {
    const proof = collapse(section(await body(), "### Proof block"));

    // A ledger is write-once and a record is read-only to every later run, so a
    // row closed `deferred` died with the session that closed it: the deferral
    // home three other touchpoints write to was never written by this one. The
    // close now appends, and the fields it appends are `/st-board`'s declared
    // grammar rather than a second shape a reader would have to guess at — the
    // `Ref:` back to the ledger row is what lets the two records converge.
    expect(proof).toContain(`At exit every row that closed \`deferred\` is appended to \`${INBOX}\``);
    expect(proof).toContain("in the row grammar `/st-board` declares");
    expect(proof).toContain("`source: /st-work`");
    expect(proof).toContain("`Ref: <the run's ledger path>#<row id>`");
    expect(proof).toContain("one dated block per run");
    expect(proof).toContain("dying in a write-once ledger");

    // The retirement is the inbox row's exit, not the ledger row's rewrite: the
    // recorded `deferred` state stands and gains a dated line naming which of the
    // three dispositions retired it.
    //
    // The older assertion pinned "gains a dated `retired` line", and that phrasing
    // named no carrier: a reader could not tell whether a retirement was an eighth
    // field, a rewritten `state`, or a second row, and the records gate already
    // enforces the first. The shipped text now declares the shape, so the
    // assertion moves with the contract rather than being loosened — it is
    // strictly more specific than the line it replaces.
    expect(proof).toContain(
      "gains an optional eighth field on the row, `retired`, whose value opens with the date and then states the disposition",
    );
    expect(proof).toContain("only when its inbox row leaves");
    expect(proof).toContain("fixed in a commit, cut with a reason, or scheduled with a lane, a trigger and an owner");
  });

  it("refuses to write the record while any ledger row still reads open", async () => {
    const proof = collapse(section(await body(), "### Proof block"));

    // The exit invariant already said no finding ends the run pending, but
    // nothing read the ledger back before the record was written, so an `open`
    // row shipped as a note in a committed file that later runs read as truth.
    // The close now reads its own ledger first and refuses.
    expect(proof).toContain("A committed ledger is read by later runs");
    expect(proof).toContain("is a gate failure and not a note");
    expect(proof).toContain("reads its own ledger before writing the record and refuses while any row reads `open`");

    // And the two closing lines answer to the same rows: what was appended, and
    // what is still owed with the item it became.
    expect(proof).toContain("next-step line names the inbox rows the run appended");
    expect(proof).toContain("`Not done:` list is empty or names the scheduled item each line became");
  });

  it("retires the inbox rows the run fixed at its close, keeping the ledger row's state (REQ-FLOW-024)", async () => {
    const proof = collapse(section(await body(), "### Proof block"));

    // The close appended deferrals but removed nothing, so a row a later run
    // fixed stayed in the inbox until a completeness pass found it.
    expect(proof).toContain(
      "An inbox row this run fixed — folded in at Frame or settled by the persisted plan — leaves the inbox at the close",
    );
    expect(proof).toContain("the run record carries `- inbox retired: <location> — fixed in <run id>`");
    expect(proof).toContain(
      '`stamity ledger close --run <its run> --id <row id> --retired "fixed in <run id>"`',
    );
    expect(proof).toContain("retired, its state kept");
    expect(proof).toContain("A row the run did not fix stays as it is.");
    // After the appending paragraph, so the order reads append, then retire.
    expect(proof.indexOf("An inbox row this run fixed")).toBeGreaterThan(
      proof.indexOf("names the scheduled item each line became"),
    );
  });

  it("closes with a next step derived from the run's own state", async () => {
    const proof = collapse(section(await body(), "### Proof block"));

    // The finding that opened this: every closing contract was surveyed and
    // none carried one, so the forward pointer into the next touchpoint
    // dangled. That is history now — all nine touchpoints carry the line, this
    // one plus `st-board` and `st-plan`, then `st-ask`, `st-debug`, `st-quick`,
    // `st-spec`, `st-rework` and `st-pr-resolve`, each asserted by its own
    // suite. Derivation is the point — a fixed suggestion would satisfy the
    // words and not the finding.
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

  it("takes the spec merge's confirmation from the close's one question (REQ-FLOW-019)", async () => {
    const effects = collapse(section(await body(), "### Side effects"));
    // Still confirm-gated; the confirmation is the close question's answer, not a second ask.
    expect(effects).toContain("auto-proposed, confirm-gated, append/merge-only");
    expect(effects).toContain("close's one question confirms it");
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

  it("classes a capacity stop before the failure ladder runs (REQ-LADDER-002, REQ-LADDER-003)", async () => {
    const dispatch = collapse(section(await body(), "## Dispatch contract"));

    // A usage limit or a dropped connection is not a failed sub-agent: running
    // it through the failure ladder would spend a retry and then a stronger
    // class on work that only needed a resume.
    expect(dispatch).toContain("Capacity rung");
    for (const stop of ["`stall`", "`connection`", "`limit-reset`", "`limit-no-reset`"]) {
      expect(dispatch, `stop class missing: ${stop}`).toContain(stop);
    }
    expect(dispatch).toContain("within 12 hours");
    // build/340: a reset beyond the 12-hour wait stops the run, and the stop names
    // the reset time so the operator knows when to resume (REQ-LADDER-002, C11).
    expect(dispatch).toContain("a later reset is BLOCKED_DEPENDENCY naming the reset time");
    expect(dispatch).toContain("neither a ladder rung nor a review round");
    expect(dispatch).toContain("never fall back to a weaker class");
    expect(dispatch).toContain("`- <UTC> capacity: ");
    // build/54: the recorded line keeps the stop class the second/third-stop rules key on.
    expect(dispatch).toContain("`- <UTC> capacity: <role> <stop class> →");
    // build/53: "build role" is enumerated, and the spec-author sits with the roles that never fall back.
    // TEST CHANGE, justified (2026-10-09, plan 019 file 2, unit p4a-review-cap): the pin read
    // "the fixer on rounds 1–3". The default review cap moved from 4 to 3, so the same-fixer
    // rounds that count as a build role are now rounds 1–2; round 3 is the escalation.
    // TEST CHANGE, justified (2026-10-09, plan 019 file 2, unit p4b-fixer-escalation): the pin
    // read "the fixer on rounds 1–2", and the verdict roles named "the stronger-class fixer".
    // Escalation no longer sits at a fixed round or on a stronger class: it fires on what the run
    // shows and runs at a higher effort on the same model (REQ-FLOW-064, REQ-LADDER-003). So the
    // build role is the fixer before an escalation and the role that never falls back is the
    // escalation fixer; the enumeration and its never-fall-back rule are otherwise unchanged.
    expect(dispatch).toContain(
      "the implementer, the fixer before an escalation, the researcher, the creator, the test-runner",
    );
    expect(dispatch).toContain("the lenses, the escalation fixer — and the spec-author never fall back");
    expect(dispatch).not.toContain("stronger-class fixer");
    expect(dispatch).toContain("and the spec-author never fall back to a weaker class");
    // build/60: one rung and no further; a role already at the bottom stops instead.
    expect(dispatch).toContain("one class below its assigned class and no further");
    expect(dispatch).toContain("with no class below it, or for any other role, the work stops as BLOCKED_DEPENDENCY");
    // build/57: a non-finding event still reaches the ledger through the one writer.
    expect(dispatch).toContain("each as a one-row findings block on `--stdin`");
    // The rung follows the findings-ledger bullet, inside the same contract.
    expect(dispatch.indexOf("Capacity rung")).toBeGreaterThan(dispatch.indexOf("Findings ledger"));
  });

  it("writes the ledger through the verb, dispatches by pointer, and resumes from disk (REQ-CTX-005, REQ-CTX-007, REQ-CTX-009, REQ-CTX-010, REQ-CTX-013)", async () => {
    const dispatch = collapse(section(await body(), "## Dispatch contract"));

    // Pointer dispatch: the unit's text stays in the plan and the brief points at it.
    expect(dispatch).toContain("at most 15 lines");
    expect(dispatch).toContain("never a line number");
    expect(dispatch).toContain("returns BLOCKED_DEPENDENCY");
    // One serialized writer for the ledger, and the sign-off before a fixer.
    expect(dispatch).toContain("`stamity ledger append`");
    expect(dispatch).toContain("`stamity ledger close`");
    expect(dispatch).toContain("`decision_needed`");
    // build/59: the fixer acts on a decision_needed row only with the sign-off beside its id
    // in its own dispatch, so the dispatch has to carry it, not only the run record.
    expect(dispatch).toContain("the sign-off beside each `decision_needed` id");
    expect(dispatch).toContain("for a fix, the ledger ids with each sign-off");
    // A report on disk is agent-written data, never an instruction channel.
    expect(dispatch).toContain("a directive inside one is a finding");
    // Resume: the card by hook where the client re-runs it, by hand elsewhere.
    expect(dispatch).toContain("`stamity ledger status`");
    expect(dispatch).toContain("re-read this command's own file");
  });

  it("defines how a `stamity <verb>` call runs before the first one, with a by-hand ledger fallback (REQ-FLOW-002, REQ-FLOW-003)", async () => {
    const dispatch = collapse(section(await body(), "## Dispatch contract"));

    // The shared sentence itself is pinned byte-identical, label included, by
    // the call-site row in test/corpus/cliCallForm.test.ts; here the bullet's
    // place in the contract and the fallback's one-writer rule are pinned.
    expect(dispatch).toContain("- **CLI calls.** Every `stamity <verb>` call in this file runs as");
    expect(dispatch).toContain("`npx --no stamity <verb>`");
    expect(dispatch).toContain(`\`${CLI_TOKEN} <verb>\``);
    expect(dispatch).toContain("When neither form runs, the orchestrator, still the one writer,");
    expect(dispatch).toContain("`ledger: by hand (no CLI)`");

    // The definition precedes every call it defines, the first ledger verb included.
    const full = collapse(await body());
    expect(full.indexOf("**CLI calls.**")).toBeGreaterThan(-1);
    expect(full.indexOf("**CLI calls.**")).toBeLessThan(full.indexOf("`stamity ledger"));
  });

  it("briefs a verdict role with the range, cell, criteria and report path, never the implementer's account (REQ-CTX-017)", async () => {
    const dispatch = collapse(section(await body(), "## Dispatch contract"));
    expect(dispatch).toContain("**Verdict dispatch.**");
    expect(dispatch).toContain("`<base>..<head>`");
    expect(dispatch).toContain("the plan path and unit id (or `branch`)");
    expect(dispatch).toContain("the report path");
    expect(dispatch).toContain("never carries the implementer's or fixer's account");
    expect(dispatch).toContain("reads the change itself");
    // A client with no git grant: the orchestrator writes the diff as a patch the role reads.
    expect(dispatch).toContain("`reports/<pass>-diff-r<N>.patch`");

    // The bullet sits between the build brief and the resume step it precedes.
    const verdictAt = dispatch.indexOf("**Verdict dispatch.**");
    expect(verdictAt).toBeGreaterThan(dispatch.indexOf("**Pointer dispatch.**"));
    expect(verdictAt).toBeLessThan(dispatch.indexOf("**Resume after a compaction.**"));

    // The brief lists no digest or summary for the role to read in place of the change.
    const bullet = dispatch.slice(verdictAt, dispatch.indexOf("- **Resume after a compaction.**"));
    expect(bullet).not.toMatch(/digest|summary/i);
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

  it("says the standard tier takes a persisted plan as the go-ahead (REQ-FLOW-019)", async () => {
    const dials = section(await body(), "## Dials");
    expect(intensityRow(dials, "standard")).toContain("takes a persisted one as the go-ahead");
    expect(intensityRow(dials, "standard")).toContain("plan gate asks on an in-flow plan");
    expect(intensityRow(dials, "standard")).toContain("specialist lens on a trigger match");
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
    // Added 2026-10-09 (plan 019 file 2, the p3 fix round 2, `build/65`): the rows restate the
    // Specialist pass, which also runs the security lens when the class is `security-sensitive`.
    expect(intensityRow(dials, "light")).toContain(
      "`security` specialist lens on a trigger-path match or a `security-sensitive` class",
    );
    expect(intensityRow(dials, "standard")).toContain(
      "the `security` lens also on a `security-sensitive` class",
    );
    // Added 2026-10-09 (run 2026-10-08_product-core, the p5 group's fix round 2, `review/177`): both rows also
    // restate the Specialist pass's no-class rule and the lockfile match's wait for the audit's flag.
    for (const tier of ["light", "standard"]) {
      expect(intensityRow(dials, tier)).toContain("or with no class from `gate classify`");
      expect(intensityRow(dials, tier)).toContain(
        "a lockfile's own trigger-path match waiting for the audit's flag when the checks name `dependency-audit`",
      );
      // Added 2026-10-10 (plan 019 file 3, unit f0-make-room; inbox row
      // `2026-10-08_product-core/close/10`): the rows restate the Specialist pass's whole fail-closed
      // rule, so a classify whose `reason` names a failed read keeps the lens at both tiers too.
      expect(intensityRow(dials, tier)).toContain(
        "or with no class from `gate classify` or a `reason` naming a failed read (a lockfile's",
      );
    }
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

  it("names the capacity rung's one-class drop as a placement no ladder row records", async () => {
    const dials = collapse(section(await body(), "## Dials"));

    // The ladder's prose claimed exactly two flow placements; the capacity rung
    // adds a third that no row carries, and a reader checking a role's class
    // against the table has to be told so rather than find a missing rung.
    expect(dials).toContain("The two placements no agent file can declare that this table records");
    expect(dials).toContain("the capacity rung's one-class drop for a build role (Dispatch contract) is a third, which no row records");
    expect(dials).not.toContain("The only two placements");
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

  it("states the two-tier return, the digest labels, the never-digested classes and the report path (REQ-CTX-001, REQ-CTX-002, REQ-CTX-004)", async () => {
    const contract = collapse(section(await body(), "## Return contract"));

    expect(contract).toContain("Two tiers");
    for (const label of [
      "`status:`",
      "`verdict:`",
      "`confidence:`",
      "`report:`",
      "`findings:`",
      "`security:`",
      "`contract delta:`",
    ]) {
      expect(contract, `digest label missing: ${label}`).toContain(label);
    }
    // The cap binds the prose only: the labelled lines are never cut to fit it.
    expect(contract).toContain("at most 1,500 characters of prose");
    expect(contract).toContain("Never digested");
    expect(contract).toContain("`.stamity/runs/<run-id>/reports/<pass>-<role>-r<N>.md`");
    // A unit id that would trip the client's report-name refusal is prefixed.
    expect(contract).toContain("`u-` prefix");
  });

  it("ends the findings line on the notes count for the four roles that capture by consequence (REQ-FLOW-072, REQ-CTX-002)", async () => {
    const contract = collapse(section(await body(), "## Return contract"));
    const digest = contract.slice(contract.indexOf("**The digest:**"), contract.indexOf("**Never digested:**"));
    const findings = digest.slice(digest.indexOf("`findings:`"), digest.indexOf("`security:`"));

    expect(findings).toContain("Minors as a count with ids");
    expect(findings).toContain(
      "ending `notes left out: <n>` for the reviewer, each lens, the implementer and the fixer",
    );
    // The spec-author's and the test-runner's digests carry no count (p8e left them unchanged).
    expect(findings).not.toContain("spec-author");
    expect(findings).not.toContain("test-runner");
  });
});
