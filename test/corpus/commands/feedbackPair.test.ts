import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { frontmatterField } from "../../../src/content/frontmatter.ts";
import { REPO_SUBSTITUTION_TOKENS } from "../../../src/emit/substitution.ts";
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
} from "../harness.ts";

/**
 * The feedback pair — `/stamity-rework` and `/stamity-pr-resolve` — checked as
 * shipped artifacts: frontmatter contract, the class rules a command carries
 * (one load class, a non-empty `spawns` roster), and the behavioral clauses
 * whose absence would silently change what the command does in a user's repo.
 *
 * Body assertions are deliberately clause-level rather than prose-level: each
 * one names a decision the design owes the user (a bounded poll, a deferral
 * that still defers, a thread this command must not close), and matches the
 * shape of that decision rather than a sentence. Rewording a paragraph keeps
 * the suite green; dropping the guard does not.
 */

/** Body-line cap for the feedback pair (the SoT's per-command budget for these two). */
const BODY_LINE_CAP = 400;

/** Leftover-scan categories the rework triage enumerates — the full set, not a sample. */
const LEFTOVER_CATEGORY_COUNT = 13;

/** Hygiene guards on the pr-resolve reply path — egress only; the ingress screen is guard 0. */
const HYGIENE_GUARD_COUNT = 5;

/**
 * The five injection-screening classes, owned by the `injection-screening` rule.
 * A body cites these ids; the patterns behind them live in the engine's deny-scan
 * catalog, so a shipped body can never drift from the scanner that enforces them.
 */
const SCREENING_CLASSES: readonly string[] = [
  "instruction-override",
  "tool-preamble",
  "exfil-signal",
  "invisible-smuggling",
  "marker-forgery",
];

/** Any wired verification-gate token; naming one means a gate runs in that flow. */
const GATE_TOKEN = /\$\{STAMITY:VERIFY_GATE_[A-Z]+\}/;

/** The three flows whose gate runs moved into a `test-runner` spawn. */
const GATE_RUNNING_COMMANDS: readonly string[] = [
  "commands/stamity-pr-resolve.md",
  "commands/stamity-spec.md",
  "commands/stamity-debug.md",
];

/** Terminal states a pr-resolve triage row may route to. */
const TRIAGE_ROUTES: readonly string[] = [
  "FIX",
  "DECLINE",
  "DEFER",
  "SCREENED",
  "NEEDS_CLARIFICATION",
  "YOUR CALL",
];

/** The agent roster a command's `spawns` may name (bare ids, per the catalog's slug rules). */
const AGENT_CENSUS: readonly string[] = [
  "researcher",
  "implementer",
  "reviewer",
  "fixer",
  "test-runner",
  "spec-author",
  "creator",
];

/** Every command a body may reference as `/stamity-<id>`. */
const COMMAND_CENSUS: readonly string[] = [
  "spec",
  "plan",
  "work",
  "board",
  "ask",
  "debug",
  "quick",
  "rework",
  "pr-resolve",
];

const REWORK = "commands/stamity-rework.md";
const PR_RESOLVE = "commands/stamity-pr-resolve.md";

/**
 * Declared spawn roster per artifact — the command discriminator made explicit.
 *
 * TEST CHANGE, justified: pr-resolve's roster widened from `[researcher, fixer]`.
 * `reviewer` because the fixer's own contract forbids it closing the loop it
 * participates in, and this command replies publicly that the fix landed;
 * `test-runner` because the reply is written from a gate result, and the gate had
 * been graded on a bare exit code in the orchestrator's own context. Nothing is
 * relaxed — the set is still asserted exactly, and every id is census-checked.
 */
const EXPECTED_SPAWNS: Record<string, string[]> = {
  [REWORK]: ["researcher", "spec-author"],
  [PR_RESOLVE]: ["researcher", "reviewer", "fixer", "test-runner"],
};

const files = new Map<string, CorpusFile>();

beforeAll(async () => {
  const loaded = await Promise.all(
    [REWORK, PR_RESOLVE].map(async (relPath) => {
      const raw = await readFile(join(CORPUS_ROOT, relPath), "utf8");
      return corpusFileOf(relPath, raw);
    }),
  );
  for (const file of loaded) files.set(file.relPath, file);
});

function artifact(relPath: string): CorpusFile {
  const file = files.get(relPath);
  if (file === undefined) throw new Error(`${relPath} was not loaded`);
  return file;
}

/**
 * The slice of a body under one heading: everything after the heading line up
 * to the next heading of the same or a higher level, so a `##` section keeps
 * its `###` subsections and stops at the next `##`.
 */
function section(body: string, headingPrefix: string): string {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.startsWith(headingPrefix));
  if (start === -1) throw new Error(`no heading starting with ${JSON.stringify(headingPrefix)}`);
  const level = headingLevel(lines[start] ?? "");

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => headingLevel(line) > 0 && headingLevel(line) <= level);
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** Markdown heading level, or 0 when the line is not a heading. */
function headingLevel(line: string): number {
  const match = /^(#{1,6}) /.exec(line);
  return match?.[1]?.length ?? 0;
}

/**
 * A section as one whitespace-collapsed string, for clause matching. Phrase
 * assertions must survive re-wrapping — a sentence that moves across a line
 * break is the same clause — so every prose match runs against this view and
 * only the structural counters below read the line-anchored text.
 */
function clause(body: string, headingPrefix: string): string {
  return section(body, headingPrefix).replace(/\s+/g, " ").trim();
}

/** Leading integers of the numbered rows in a markdown table, in document order. */
function tableRowNumbers(text: string): number[] {
  return [...text.matchAll(/^\|\s*(\d+)\s*\|/gm)].map((match) => Number(match[1]));
}

/** Leading integers of an ordered list's items, in document order. */
function orderedListNumbers(text: string): number[] {
  return [...text.matchAll(/^(\d+)\.\s/gm)].map((match) => Number(match[1]));
}

/**
 * Body rows of the first markdown table in `text`, as trimmed cells. The header
 * and its `|---|` separator are dropped, so a row's cells line up with the
 * columns the table declares.
 */
function tableRows(text: string): string[][] {
  const rows = text
    .split("\n")
    .filter((line) => line.trimStart().startsWith("|"))
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim()),
    );
  const separator = rows.findIndex((cells) => cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
  return separator === -1 ? [] : rows.slice(separator + 1);
}

/** The terminal state a route cell leads with (`FIX through …` → `FIX`). */
function routeToken(cell: string): string {
  return /^(YOUR CALL|[A-Z_]+)/.exec(cell)?.[1] ?? "";
}

/** Every heading line of a body, in document order. */
function headings(body: string): string[] {
  return [...body.matchAll(/^#{1,6} .+$/gm)].map((match) => match[0]);
}

/** The `spawns` roster a corpus file declares, as bare ids. */
function spawnsOf(file: CorpusFile): string[] {
  const spawns = frontmatterField(file.parsed, "spawns");
  return Array.isArray(spawns) ? spawns.map(String) : [];
}

const countingUp = (n: number, index: number): boolean => n === index + 1;

describe("feedback pair — frontmatter contract", () => {
  it.each([REWORK, PR_RESOLVE])("%s declares the identity head with a bare id", (relPath) => {
    const file = artifact(relPath);

    expect(frontmatterField(file.parsed, "id")).toBe(filenameSlug(relPath));
    expect(frontmatterField(file.parsed, "type")).toBe("command");
    expect(frontmatterField(file.parsed, "tools")).toBeUndefined();
  });

  it.each([REWORK, PR_RESOLVE])("%s describes itself in the third person", (relPath) => {
    const description = frontmatterField(artifact(relPath).parsed, "description");

    expect(typeof description).toBe("string");
    expect(description as string).not.toMatch(/\b(?:you|your|yours|yourself)\b/i);
    expect((description as string).length).toBeGreaterThan(0);
    expect((description as string).length).toBeLessThanOrEqual(1024);
  });

  it.each([REWORK, PR_RESOLVE])("%s carries a capability tag first", (relPath) => {
    const tags = frontmatterField(artifact(relPath).parsed, "tags");

    expect(Array.isArray(tags)).toBe(true);
    expect(tags as string[]).not.toHaveLength(0);
    // Context tags are compatibility statements, never the primary classification.
    expect((tags as string[])[0]).not.toMatch(/^ctx:/);
  });

  it.each([REWORK, PR_RESOLVE])("%s loads on demand and declares its deletion trigger", (relPath) => {
    const file = artifact(relPath);

    // `always` is the charter's alone; a command is invoked, never resident.
    expect(() => requireLoadClass(file, ["on-demand"])).not.toThrow();
    expect(() => requireObsoleteWhen(file)).not.toThrow();
  });

  it.each([REWORK, PR_RESOLVE])("%s spawns a named, existing sub-agent roster", (relPath) => {
    const spawns = frontmatterField(artifact(relPath).parsed, "spawns");

    // The command discriminator: a command orchestrates at least one sub-agent,
    // and every id it names has to be an agent that ships.
    expect(spawns).toEqual(EXPECTED_SPAWNS[relPath]);
    expect(spawns as string[]).not.toHaveLength(0);
    for (const id of spawns as string[]) expect(AGENT_CENSUS).toContain(id);
  });
});

describe("feedback pair — corpus invariants", () => {
  it.each([REWORK, PR_RESOLVE])("%s body stays within the line cap", (relPath) => {
    expect(() => assertLineCap(artifact(relPath), BODY_LINE_CAP)).not.toThrow();
  });

  it.each([REWORK, PR_RESOLVE])("%s body is deny-scan clean", (relPath) => {
    expect(() => assertDenyClean(artifact(relPath))).not.toThrow();
  });

  it.each([REWORK, PR_RESOLVE])("%s references only commands that exist", (relPath) => {
    const mentions = [...artifact(relPath).parsed.body.matchAll(/\/stamity-([a-z][a-z-]*)/g)].map(
      (match) => match[1] ?? "",
    );

    expect(mentions).not.toHaveLength(0);
    for (const id of new Set(mentions)) expect(COMMAND_CENSUS).toContain(id);
  });

  it.each([REWORK, PR_RESOLVE])("%s uses only wired substitution tokens", (relPath) => {
    const tokens = artifact(relPath).parsed.body.match(/\$\{STAMITY:[A-Z_]+\}/g) ?? [];

    expect(tokens).not.toHaveLength(0);
    for (const token of new Set(tokens)) expect(REPO_SUBSTITUTION_TOKENS).toContain(token);
  });

  it.each([REWORK, PR_RESOLVE])("%s mints no product URL", (relPath) => {
    // Shipped content links no host: a minted domain outlives the artifact and
    // strands every consumer when it moves.
    expect(artifact(relPath).parsed.body).not.toMatch(/https?:\/\//);
  });
});

describe("rework — baseline and interview", () => {
  it("reads the source proof block as a read-only claims record", () => {
    const baseline = clause(artifact(REWORK).parsed.body, "## 1. Baseline");

    expect(baseline).toMatch(/read-only/i);
    expect(baseline).toMatch(/appends its own proof block/i);
  });

  it("degrades to diff plus reconstructed criteria when no proof block exists", () => {
    const baseline = clause(artifact(REWORK).parsed.body, "## 1. Baseline");

    // Edge case: pre-setup delivery. The degraded path is explicit, marked, and
    // never renamed into a claims record it is not.
    expect(baseline).toMatch(/no proof record/);
    expect(baseline).toMatch(/git diff/);
    expect(baseline).toMatch(/acceptance criteria reconstructed/i);
    expect(baseline).toMatch(/confidence: low/i);
  });

  it("names no branch sync — no touchpoint owns a pre-flight that could run one", () => {
    const body = artifact(REWORK).parsed.body;

    // The intake reads the branch; it never moves it. A "base-branch sync (work
    // pre-flight)" cross-reference would point at a capability no command in the
    // corpus defines, so a run would either skip a step it was told to expect or
    // improvise a history rewrite the forward-fix doctrine forbids.
    expect(body).not.toMatch(/pre-?flight/i);
    expect(body).not.toMatch(/base[- ]branch/i);
    expect(body).not.toMatch(/\brebase\b/i);
    expect(clause(body, "## 1. Baseline")).toContain("git diff <base>...HEAD");
    expect(body).toMatch(/never reverts, resets, or rewrites history/);
  });

  it("infers severity from user language behind a declared default", () => {
    const interview = clause(artifact(REWORK).parsed.body, "## 2. Interview");

    expect(interview).toMatch(/blocker/i);
    expect(interview).toMatch(/cosmetic/i);
    expect(interview).toMatch(/declared default: warning/i);
  });

  it("extracts concretes from emotional-only feedback without interrogating", () => {
    const interview = clause(artifact(REWORK).parsed.body, "## 2. Interview");

    // Edge case: "this is all wrong". Numbered replay of the changed surfaces,
    // a bounded number of rounds, and no demand that the user rate anything.
    expect(interview).toMatch(/emotional-only feedback/i);
    expect(interview).toMatch(/do not press for a rating/i);
    expect(interview).toMatch(/numbered options/i);
    expect(interview).toMatch(/two rounds at most/i);
  });
});

describe("rework — leftover scan and routing", () => {
  it(`enumerates exactly ${LEFTOVER_CATEGORY_COUNT} leftover categories, numbered in order`, () => {
    const scan = section(artifact(REWORK).parsed.body, "## 3. Leftover scan");
    const numbers = tableRowNumbers(scan);

    expect(numbers).toHaveLength(LEFTOVER_CATEGORY_COUNT);
    expect(numbers.every(countingUp)).toBe(true);
  });

  it("routes findings REVISE or DEFER, with deferrals landing in the inbox", () => {
    const routing = clause(artifact(REWORK).parsed.body, "## 4. Routing");

    expect(routing).toMatch(/\bREVISE\b/);
    expect(routing).toMatch(/\bDEFER\b/);
    expect(routing).toContain(".stamity/inbox.md");
    // The inbox is read, not just written: both readers are named where the rows land.
    expect(routing).toMatch(/\/stamity-board/);
    expect(routing).toMatch(/\/stamity-work/);
  });

  it("routes every (severity, scope) pair — the table is total over its own scan", () => {
    const body = artifact(REWORK).parsed.body;
    const rows = tableRows(section(body, "## 4. Routing"));
    const severities = ["Critical", "Warning", "Minor"];
    const catchAll = /^(?:any|anything else)$/i;

    expect(rows.length).toBeGreaterThanOrEqual(severities.length);
    for (const [severity, scope, route] of rows) {
      expect(severities, `unknown severity in a routing row: ${severity}`).toContain(severity);
      expect(scope).not.toBe("");
      expect(["REVISE", "DEFER"], `row "${severity} / ${scope}" has no terminal route`).toContain(
        route,
      );
    }
    // Totality on the severity axis: the leftover scan grades all 13 categories into
    // these three severities and six of them default to Warning, so a severity whose
    // scopes are all specific drops every finding that matches none of them — it
    // becomes neither a plan unit nor an inbox row, which is a silent loss.
    for (const severity of severities) {
      const rescue = rows.find(
        ([rowSeverity, scope]) => rowSeverity === severity && catchAll.test(scope ?? ""),
      );
      expect(rescue, `severity ${severity} has no catch-all scope`).toBeDefined();
      expect(["REVISE", "DEFER"]).toContain(rescue?.[2]);
    }
    // A catch-all is only safe with a stated precedence: first match wins, so the
    // specific rows above keep their findings.
    const routing = clause(body, "## 4. Routing");
    expect(routing).toMatch(/first match wins/i);
    expect(routing).toMatch(/so they shadow\s*nothing/i);
  });

  it("keeps the whole-project lint and typecheck scan off the branch author's back", () => {
    const scan = clause(artifact(REWORK).parsed.body, "## 3. Leftover scan");

    // Category 6 claimed the gates ran "over changed files"; both resolve to
    // whole-project commands with no file-scope seam, so without a carve-out every
    // latent error in the repository is triaged against this diff.
    expect(scan).not.toMatch(/over changed files/i);
    expect(scan).toMatch(/no changed-file selector/i);
    expect(scan).toMatch(/predates the branch is reported as pre-existing and left alone/i);
  });

  it("defers a Critical finding through the Critical Deferral Protocol", () => {
    const body = artifact(REWORK).parsed.body;
    const protocol = clause(body, "### Critical Deferral Protocol");

    // Edge case: the user insists on deferring a Critical. It defers — the
    // protocol adds a record, and says so, rather than blocking the user.
    expect(body).toContain("Critical Deferral Protocol");
    expect(protocol).toMatch(/is deferred/i);
    expect(protocol).toMatch(/risk warning/i);
    expect(protocol).toMatch(/written rationale/i);
    expect(protocol).toContain("critical-deferred");
    expect(protocol).toMatch(/not a veto/i);
    expect(
      orderedListNumbers(section(body, "### Critical Deferral Protocol")).every(countingUp),
    ).toBe(true);
  });
});

describe("rework — validation and handoff", () => {
  it("keeps validation read-only and lets a finding be rejected with reasoning", () => {
    const validation = clause(artifact(REWORK).parsed.body, "## 5. Validation pass");

    expect(validation).toMatch(/read-only|write nothing/i);
    expect(validation).toMatch(/rejection is a legitimate outcome/i);
    expect(validation).toMatch(/performative agreement[^.]*banned/i);
    expect(validation).toMatch(/confidence/i);
  });

  it("lints the plan against the gate that already exists, and hands execution over", () => {
    const handoff = clause(artifact(REWORK).parsed.body, "## 6. Plan handoff");

    expect(handoff).toMatch(/plan-lint/i);
    expect(handoff).toMatch(/acceptance criterion/i);
    expect(handoff).toMatch(/execute now \(default\)/i);
    expect(handoff).toMatch(/\/stamity-work/);
    // The gate is plan's, cited rather than redefined: the same name carried four
    // unlabelled checks here, one of them changed, and no labelled result at close.
    expect(handoff).toMatch(/`L1`[^.]*`L2`[^.]*`L3`/);
    expect(handoff).toMatch(/run here unchanged rather than restated with different content/i);
    expect(handoff).toMatch(/L1 pass\|fail · L2 pass\|fail · L3 pass\|fail · R1 pass\|fail/);
  });

  it("gives the low-confidence marking a consumer instead of a note", () => {
    const body = artifact(REWORK).parsed.body;
    const validation = clause(body, "## 5. Validation pass");
    const handoff = clause(body, "## 6. Plan handoff");

    // "Marked for human review" had no reader anywhere, while the very next section
    // defaulted to execute-now — so a low-confidence unit was silently promoted by
    // the default it was supposed to stop.
    expect(validation).toContain("[NEEDS CLARIFICATION]");
    expect(validation).toMatch(/blocks handoff to `\/stamity-work`/);
    expect(validation).toMatch(/marking nothing reads is a note, not a gate/i);
    expect(handoff).toMatch(/has no execute-now default/i);
    expect(handoff).toMatch(/handoff stays blocked until\s*the last marker clears/i);
  });

  it("keeps the read-only validation phase read-only across every spawn in it", () => {
    const validation = clause(artifact(REWORK).parsed.body, "## 5. Validation pass");

    // `spec-author`'s declared capability is read plus edit and each of its modes
    // writes files, so an unconstrained spawn could land a `docs/specs/` write
    // inside a phase this command declares read-only.
    expect(validation).toMatch(/draft-only, as it is in\s*`\/stamity-plan`/);
    expect(validation).toMatch(/opens no file under\s*`docs\/specs\/`/);
    expect(validation).toMatch(/Truth changes at the merge gate/i);
  });

  it("guards every persistence path from one top-level section", () => {
    const body = artifact(REWORK).parsed.body;
    const guard = clause(body, "## Persistence guard");

    // The guard used to live inside `## Meta-feedback`, scoped to that section's
    // destinations, while phase 4 wrote inbox rows and phase 6 wrote the plan from
    // the same user-derived text. Hoisting it is the fix; these assert the hoist.
    expect(body).toMatch(/^## Persistence guard$/m);
    expect(guard).toMatch(/secret scan/i);
    expect(guard).toMatch(/injection screen/i);
    expect(guard).toMatch(/declarative rephrase/i);
    expect(orderedListNumbers(section(body, "## Persistence guard")).every(countingUp)).toBe(true);
    for (const id of SCREENING_CLASSES) {
      expect(guard, `screening class ${id} is not named`).toContain(`\`${id}\``);
    }
    expect(guard).toMatch(/stamity-injection-screening/);
    expect(guard).toMatch(/matched span is not echoed back/i);
  });

  it("is cited by all three write paths, and restated by none of them", () => {
    const body = artifact(REWORK).parsed.body;
    const meta = clause(body, "## Meta-feedback");

    expect(clause(body, "## 4. Routing")).toMatch(/persistence guard/i);
    expect(clause(body, "## 6. Plan handoff")).toMatch(/persistence guard/i);
    expect(meta).toMatch(/persistence guard/i);
    // UPDATED (was three phrase checks against a `Sanitization guard` block inside
    // this section): the block moved to the top level, so the section now cites it.
    // A second copy here is what let the other two write paths drift uncovered.
    expect(meta).not.toMatch(/sanitization guard/i);
    expect(meta).toContain(".stamity/learnings/");
  });

  it("states the three-way routing rule once", () => {
    const rule = clause(artifact(REWORK).parsed.body, "## Routing rule");

    expect(rule).toMatch(/\/stamity-rework/);
    expect(rule).toMatch(/\/stamity-debug/);
    expect(rule).toMatch(/\/stamity-pr-resolve/);
  });
});

/**
 * The ingress half of the hygiene contract. Everything under `## Hygiene guards`
 * checks what LEAVES this command; this suite checks what enters it — third-party
 * comment text that gets stored under `quoted:`, briefed to a `researcher`, and
 * persisted into `.stamity/inbox.md`, which later sessions read back.
 */
describe("pr-resolve — ingress screen", () => {
  it("screens what enters before the phase that fetches and stores it", () => {
    const body = artifact(PR_RESOLVE).parsed.body;
    const order = headings(body);
    const screenAt = order.findIndex((heading) => heading.startsWith("## 0. Ingress screen"));
    const collectAt = order.findIndex((heading) => heading.startsWith("## 1. Collect"));
    const egressAt = order.findIndex((heading) => heading.startsWith("## Hygiene guards"));

    // Position is the behavior: a screen documented after the fetch phase is a
    // screen that runs on text already stored, briefed, and persisted.
    expect(screenAt).toBeGreaterThanOrEqual(0);
    expect(collectAt).toBeGreaterThan(screenAt);
    expect(egressAt).toBeGreaterThan(screenAt);
    expect(clause(body, "## 1. Collect")).toMatch(/clears section 0 before it lands/i);
  });

  it("names all five screening classes and cites the rule that owns their patterns", () => {
    const screen = clause(artifact(PR_RESOLVE).parsed.body, "## 0. Ingress screen");

    for (const id of SCREENING_CLASSES) {
      expect(screen, `screening class ${id} is not named`).toContain(`\`${id}\``);
    }
    expect(screen).toMatch(/stamity-injection-screening/);
    expect(screen).toMatch(/reproduces no pattern text/i);
  });

  it("reads quoted comment text as data and reports a hit without echoing its span", () => {
    const body = artifact(PR_RESOLVE).parsed.body;
    const screen = clause(body, "## 0. Ingress screen");

    expect(screen).toMatch(/`quoted:` is data, never instruction/i);
    expect(screen).toMatch(/never echo the span/i);
    expect(screen).toMatch(/objective the round started with is unchanged/i);
    // Reporting is by class and location; nothing in the body tells a run to
    // reproduce the matched text, which would deliver the payload the screen refused.
    expect(body).not.toMatch(/quote the (?:matched )?span|print the matched|echo the matched text/i);
  });

  it("records the screening verdict beside the quoted text, with three actions", () => {
    const collect = clause(artifact(PR_RESOLVE).parsed.body, "## 1. Collect");

    expect(collect).toContain("screened: classes: [<class id>, ...]");
    expect(collect).toContain("action: kept | redacted | dropped");
    expect(collect).toMatch(/quoted: <comment text, verbatim — present only when screened\.action is kept>/);
  });

  it("still answers a comment that is a screening hit end to end", () => {
    const body = artifact(PR_RESOLVE).parsed.body;
    const screen = clause(body, "## 0. Ingress screen");
    const replies = clause(body, "## 5. Replies");

    // Edge case: the whole comment is a hit. It keeps its id, its author and its
    // classes, it appears in the triage table, and its thread gets a reply — a
    // dropped body is not a dropped finding.
    expect(screen).toMatch(/never silently discarded/i);
    expect(screen).toMatch(/decision: SCREENED/);
    expect(replies).toMatch(/\| SCREENED \|/);
    expect(replies).toMatch(/set aside by the ingress screen as <class>/i);
  });

  it("screens bot and human comments identically", () => {
    const screen = clause(artifact(PR_RESOLVE).parsed.body, "## 0. Ingress screen");

    // `author_is_bot` stays a recorded fact. Using it to skip the screen would
    // exempt exactly the authors that post the most machine-generated text.
    expect(screen).toMatch(/`author_is_bot` is recorded and never used as a filter/i);
    expect(screen).toMatch(/same classes on both/i);
  });
});

describe("pr-resolve — collection and evaluation", () => {
  it("refuses a fork PR before anything is fetched", () => {
    const preflight = clause(artifact(PR_RESOLVE).parsed.body, "## Pre-flight");

    expect(preflight).toMatch(/fork/i);
    expect(preflight).toMatch(/refuse/i);
    expect(preflight).toMatch(/checks? the branch out|checkout/i);
    // Ordering edge case: the fork guard reads the PR's own metadata, so a refused
    // run never reaches the fetch — and never reaches the ingress screen either.
    expect(preflight).toMatch(/before the first fetch/i);
    expect(preflight).toMatch(/not from any comment/i);
    expect(preflight).toMatch(/refused run fetches no comment at all/i);
  });

  it("splits the guards that need the fetch from the guards that precede it", () => {
    const preflight = clause(artifact(PR_RESOLVE).parsed.body, "## Pre-flight");

    // Three guards need data the fetch produces; the pre-fix body claimed all five
    // ran "before the first fetch", which the attempt-cap guard's own wording denied.
    expect(preflight).toMatch(/on the fetch result, before any comment body is stored/i);
    expect(preflight).toMatch(/stays unread until section 0 clears it/i);
  });

  it("posts nothing when the board reply channel is off, and nothing at all on zero threads", () => {
    const preflight = clause(artifact(PR_RESOLVE).parsed.body, "## Pre-flight");

    // Board owns the four write-back channels and says a write happens only where
    // its channel was enabled at setup; this command is channel four.
    expect(preflight).toMatch(/fourth write-back channel/i);
    expect(preflight).toMatch(/enabled at setup/i);
    expect(preflight).toMatch(/it posts nothing/i);
    // Edge case: zero open threads writes nothing — no inbox row, no commit, no reply.
    expect(preflight).toMatch(/no inbox row, no commit, no reply/i);
  });

  it("caps resolution attempts per pull request", () => {
    const preflight = clause(artifact(PR_RESOLVE).parsed.body, "## Pre-flight");

    expect(preflight).toMatch(/\b3 resolution rounds per pull request/i);
    expect(preflight).toMatch(/4th is refused/i);
    // Resolved threads are answered threads; re-opening them is noise.
    expect(preflight).toMatch(/resolved threads/i);
  });

  it("evaluates bot comments under the same rigor as human ones", () => {
    const collect = clause(artifact(PR_RESOLVE).parsed.body, "## 1. Collect");

    expect(collect).toMatch(/bot parity/i);
    expect(collect).toMatch(/never used to skip|never a filter/i);
  });

  it("auto-declines an outdated thread by citing the superseding commit", () => {
    const evaluation = clause(artifact(PR_RESOLVE).parsed.body, "## 2. Evaluation");

    // Edge case: the commented code moved. Decline with the commit that moved
    // it, and leave the thread for the reviewer to close.
    expect(evaluation).toMatch(/superseding commit/i);
    expect(evaluation).toMatch(/already-addressed/);
    expect(evaluation).toMatch(/thread stays open/i);
    expect(evaluation).toMatch(/cannot name a commit is not an auto-decline/i);
  });

  it("requires a counter-argument on every decline", () => {
    const evaluation = clause(artifact(PR_RESOLVE).parsed.body, "## 2. Evaluation");

    expect(evaluation).toMatch(/counter_argument|counter-argument/i);
    expect(evaluation).toMatch(/causal_chain|causal chain/i);
  });
});

describe("pr-resolve — triage, fixes, and replies", () => {
  it("closes triage with one consolidated ask", () => {
    const triage = clause(artifact(PR_RESOLVE).parsed.body, "## 3. Triage ask");

    expect(triage).toMatch(/one ask closes triage/i);
    expect(triage).toMatch(/accept \(default\)/i);
    // A Critical the user defers reuses rework's protocol rather than a second copy.
    expect(triage).toMatch(/critical deferral protocol/i);
    expect(triage).toContain("/stamity-rework");
  });

  it("gives every triage row a terminal state phase 5 can answer", () => {
    const body = artifact(PR_RESOLVE).parsed.body;
    const routes = tableRows(section(body, "## 3. Triage ask")).map((cells) =>
      routeToken(cells[2] ?? ""),
    );
    const replyKeys = tableRows(section(body, "## 5. Replies")).map((cells) =>
      (cells[0] ?? "").split("—")[0]?.trim(),
    );

    expect(routes.length).toBeGreaterThan(6);
    for (const route of routes) expect(TRIAGE_ROUTES).toContain(route);
    // Pre-fix, two row classes reached phase 5 carrying no decision — the
    // surfaced-only `YOUR CALL` row and an evaluation that came back
    // NEEDS_CLARIFICATION — and the decision-keyed reply table had nothing for
    // either, so the finding left the run with no reply and no record.
    for (const route of new Set(routes)) {
      const key = route === "YOUR CALL" ? "DEFER" : route;
      expect(replyKeys, `route ${route} has no reply template`).toContain(key);
    }
  });

  it("closes the triage table over both axes, with a stated precedence", () => {
    const body = artifact(PR_RESOLVE).parsed.body;
    const rows = tableRows(section(body, "## 3. Triage ask"));
    const triage = clause(body, "## 3. Triage ask");

    // Totality: a catch-all row, and a first-match-wins rule so it cannot shadow
    // the specific rows above it.
    expect(rows.some((cells) => /anything else/i.test(cells[1] ?? ""))).toBe(true);
    expect(triage).toMatch(/first match wins/i);
    expect(triage).toMatch(/shadows nothing above it/i);
    expect(triage).toMatch(/carrying no decision is a finding that disappeared/i);
    // `YOUR CALL` stays surfaced-only and still terminates, on its declared default.
    expect(triage).toMatch(/never auto-routed; on `accept` it takes its declared default, DEFER/i);
  });

  it("routes non-mechanical fixes through the work pipeline behind runner-verified gates", () => {
    const fix = clause(artifact(PR_RESOLVE).parsed.body, "## 4. Fix");

    expect(fix).toMatch(/\/stamity-work/);
    expect(fix).toContain("${STAMITY:VERIFY_GATE_ALL}");
    expect(fix).toMatch(/attempted-and-blocked|blocked/i);
    // The gate result is evidence, not an exit code, and it is produced outside
    // this command's own context.
    expect(fix).toMatch(/`test-runner` spawn, never in this command's own context/i);
    expect(fix).toMatch(/bare exit code is not a gate result/i);
    // The fixer does not certify its own fix; a public "landed" reply needs the
    // reviewer's verdict, which is why `reviewer` is in the spawn set at all.
    expect(fix).toMatch(/does not close the loop it participates in/i);
    expect(fix).toMatch(/not the fixer's own report/i);
    // The fixer's scope rule ledgers Minor findings, so Minor never enters its lane.
    expect(fix).toMatch(/`Critical` or `Warning` finding whose fix is one file/i);
    expect(clause(artifact(PR_RESOLVE).parsed.body, "## 3. Triage ask")).toMatch(
      /FIX through `\/stamity-work` — the `fixer`'s scope rule ledgers `Minor`/,
    );
  });

  it("signs every reply with a round ordinal and a confidence stamp", () => {
    const body = artifact(PR_RESOLVE).parsed.body;
    const replies = clause(body, "## 5. Replies");
    const preflight = clause(body, "## Pre-flight");

    // UPDATED (was `/stamity-pr-resolve \(confidence/`): the signature gained the
    // round ordinal. The attempt cap counted signature LINES, and replies post one
    // per thread, so a round answering three findings read as three attempts and a
    // second round was refused as a fourth. The cap now counts distinct ordinals.
    expect(replies).toMatch(/— stamity-pr-resolve \(round: <n>, confidence: high \| medium \| low\)/);
    expect(replies).toMatch(/counting reply lines instead would read a round answering three findings as three attempts/i);
    expect(preflight).toMatch(/distinct round ordinals/i);
    expect(preflight).toMatch(/carrying no ordinal is a legacy reply and counts as round 1/i);
    expect(replies).toMatch(/NEEDS_CLARIFICATION/);
    // UPDATED (was a bare containment check): the state path is asserted here as
    // text that SURVIVES egress, against hygiene guard 4's new scope below.
    expect(replies).toContain(".stamity/inbox.md");
  });

  it(`carries all ${HYGIENE_GUARD_COUNT} egress guards, and guard 4 spares repo-relative state paths`, () => {
    const body = artifact(PR_RESOLVE).parsed.body;
    const guards = clause(body, "## Hygiene guards");
    const numbers = orderedListNumbers(section(body, "## Hygiene guards"));

    expect(numbers).toHaveLength(HYGIENE_GUARD_COUNT);
    expect(numbers.every(countingUp)).toBe(true);
    expect(guards).toMatch(/no thread closure/i);
    expect(guards).toMatch(/no review verdicts/i);
    expect(guards).toMatch(/no labels/i);
    expect(guards).toMatch(/size cap/i);
    // UPDATED (was `/path stripping/i`): guard 4 rewrote every `.stamity/…` path out
    // of every reply body while two of the seven reply templates above post
    // `.stamity/inbox.md` verbatim and the DEFER template is nothing but that path —
    // the guard erased its own replies. Scope is now absolute paths and
    // machine-local layout, with repo-relative state paths permitted by name.
    expect(guards).toMatch(/machine-local path stripping/i);
    expect(guards).toMatch(/repo-relative state paths are permitted/i);
    expect(guards).toContain(".stamity/inbox.md");
    // The five are egress guards; the ingress screen is guard 0 and sits outside them.
    expect(guards).toMatch(/five egress guards/i);
    expect(guards).toMatch(/ingress screen in section 0 is guard 0/i);
  });

  it("bounds the re-poll and gates it on fresh consent", () => {
    const poll = clause(artifact(PR_RESOLVE).parsed.body, "## Re-poll");

    // Edge case: a poll must not become a watcher. Bounded attempts, a fresh
    // consent per round, and the attempt cap applied to retained comments.
    expect(poll).toMatch(/at most 5 attempts/i);
    expect(poll).toMatch(/60 seconds/i);
    expect(poll).toMatch(/no standing watcher/i);
    expect(poll).toMatch(/consent/i);
    expect(poll).toMatch(/attempt cap/i);
  });

  it("names the PR-thread reply as the fourth write-back channel", () => {
    const close = clause(artifact(PR_RESOLVE).parsed.body, "## Close");

    expect(close).toMatch(/fourth write-back channel/i);
    expect(close).toContain(".stamity/inbox.md");
    expect(close).toMatch(/proof block/i);
  });
});

/**
 * Corpus-wide sweep on the maturity tier, hosted in this suite because it is the
 * corpus-spanning file this unit owns. The posture it locks: the tier is a
 * calibration fact a body may read (stage, emphasis, thresholds) and never an
 * admission gate — no body says tiers are banned, and none makes the tier decide
 * which artifacts a repo receives. Both halves matter: a ban claim would
 * contradict the charter row the engine seeds at install, and an admission gate
 * would resurrect the team/solo content lever that was removed.
 */
const TIER_BAN_CLAIMS: readonly RegExp[] = [
  /\b(?:maturity )?tiers?\b[^.]{0,40}\b(?:are|is)\s+banned\b/i,
  /\bbans?\b[^.]{0,40}\bmaturity tiers?\b/i,
  /\bno maturity tiers?\b/i,
  /\bmaturity tiers?\b[^.]{0,40}\b(?:forbidden|prohibited|not permitted)\b/i,
];

const TIER_ADMISSION_GATES: readonly RegExp[] = [
  /\bmaturity tier\b[^.]{0,60}\b(?:selects|admits|gates|filters|determines which)\b/i,
  /\b(?:content|artifacts?|rules?|skills?|agents?|commands?)\b[^.]{0,60}\b(?:selected|admitted|gated|filtered)\b[^.]{0,30}\bby (?:the )?maturity tier\b/i,
];

/** Pattern sources that fire on one body, whitespace-flattened so wrapping is not semantics. */
function tierClaimHits(text: string): string[] {
  const flattened = text.replace(/\s+/g, " ");
  return [...TIER_BAN_CLAIMS, ...TIER_ADMISSION_GATES]
    .filter((pattern) => pattern.test(flattened))
    .map((pattern) => pattern.source);
}

describe("corpus sweep — the maturity tier is a calibration fact, not a gate", () => {
  it("flags a ban claim and an admission gate, and clears the shipped charter row", () => {
    // The sweep below passes on the corpus, so the matcher is exercised here
    // against text that must fail it — otherwise a broken pattern reads as clean.
    expect(tierClaimHits("maturity tiers are banned anywhere in the product")).not.toHaveLength(0);
    expect(tierClaimHits("no maturity tier ships in any repo")).not.toHaveLength(0);
    expect(tierClaimHits("the maturity tier selects which skills install")).not.toHaveLength(0);
    expect(
      tierClaimHits("rules are filtered by the maturity tier before emission"),
    ).not.toHaveLength(0);
    expect(
      tierClaimHits("Maturity tier: solo — seeded from git history at init; change via config."),
    ).toHaveLength(0);
  });

  it("carries no ban claim and no admission gate in any shipped body", async () => {
    const corpus = await walkAllMarkdown();
    const offenders = corpus
      .map((file) => ({ path: file.relPath, hits: tierClaimHits(file.parsed.body) }))
      .filter((entry) => entry.hits.length > 0);

    expect(corpus.length).toBeGreaterThan(30);
    expect(offenders.map((entry) => `${entry.path}: ${entry.hits.join(", ")}`)).toEqual([]);
  });

  it("keeps the tier itself — the charter states it, and a body may calibrate on it", async () => {
    const corpus = await walkAllMarkdown();
    const charter = corpus.find((file) => file.relPath === "charter/stamity-charter.md");
    const readers = corpus.filter((file) => /maturity tier/i.test(file.parsed.body));

    // Removing the fact would make the sweep above vacuously green, so its
    // presence is asserted with it: the charter declares the tier, and at least
    // one other body reads it for emphasis rather than for admission.
    expect(charter?.parsed.body).toMatch(/Maturity tier: \$\{STAMITY:MATURITY_TIER\}/);
    expect(readers.length).toBeGreaterThan(1);
  });
});

/**
 * The missing invariant behind the gate findings: a body that names a verification
 * gate token runs a gate, and a gate run in the orchestrator's own context has no
 * structured result and no isolation. Hosted here because this suite already owns
 * the corpus-spanning sweeps, and because two of the three flows it covers are the
 * feedback pair's neighbours.
 */
describe("corpus sweep — a body that names a gate token declares the runner that runs it", () => {
  it("holds on the three flows that grade on a gate, and names the one exception", async () => {
    const commands = (await walkAllMarkdown()).filter((file) =>
      file.relPath.startsWith("commands/"),
    );
    expect(commands.length).toBeGreaterThan(5);
    for (const relPath of GATE_RUNNING_COMMANDS) {
      const file = commands.find((candidate) => candidate.relPath === relPath);
      expect(file, `${relPath} was not walked`).toBeDefined();
      // Each of the three names a gate token and, pre-fix, declared no runner:
      // pr-resolve graded on a bare exit code and then replied publicly, spec's
      // check mandated the test gate with read-only spawns, and debug ran it
      // inline. The token and the roster are asserted together so neither half
      // can be dropped to make this pass.
      expect(GATE_TOKEN.test(file?.parsed.body ?? "")).toBe(true);
      expect(spawnsOf(file as CorpusFile), `${relPath} runs a gate with no runner`).toContain(
        "test-runner",
      );
    }

    // Edge case on the debug side: its hard gate 3 bans a private fix pipeline, so
    // the added role has to be report-only or the roster contradicts the gate.
    const debug = commands.find((file) => file.relPath === "commands/stamity-debug.md");
    expect(debug?.parsed.body.replace(/\s+/g, " ")).toMatch(
      /runner reports and nothing else — it applies no edit and proposes no patch, so adding it opens no second fix path/i,
    );

    const unrunnered = commands
      .filter((file) => GATE_TOKEN.test(file.parsed.body))
      .filter((file) => !spawnsOf(file).includes("test-runner"))
      .map((file) => file.relPath);

    // One documented exception, asserted rather than ignored: rework names the lint
    // and typecheck tokens inside its leftover-scan table, where they identify which
    // gates the scan reads. Routing that read through a runner was graded honesty-only
    // (the claim that they ran over changed files was the finding), so the gap is
    // pinned here and a NEW body that names a gate token without a runner fails.
    expect(unrunnered).toEqual([REWORK]);
  });
});
