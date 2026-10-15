import { resolve } from "node:path";
import { parseFrontmatter } from "../content/frontmatter.ts";
import type { GitRunner } from "../workspace/git.ts";
import { type FreshnessResult, freshness } from "./freshness.ts";
import { checkCoverage, parsePlanUnits } from "./planCoverage.ts";
import { PREREQUISITE_OPEN, parseRunContract } from "./runContract.ts";

/**
 * A plan's readiness for an unattended start (REQ-FLOW-091, REQ-FLOW-096,
 * REQ-FLOW-098): the engine behind `stamity plan check`.
 *
 * Each plan is read for what would make a run with nobody watching stop or
 * guess: a `[NEEDS CLARIFICATION]` marker anywhere (fenced or not), an Open
 * questions body other than `None.`, a `- **Critical**` risk, a failed
 * mechanical lint (L2 to L4 through the structural coverage check, L3 over
 * each unit's `edgeCases`), a head missing a required key, a `reads` path
 * moved since the stamp, a stamp that resolves to no commit HEAD descends
 * from, an open Prerequisites row, and — for a chain — a file whose head
 * `depends_on` does not name the file before it. A run contract, when given,
 * is parsed strictly and its problems refuse every plan it governs; a contract
 * whose `plan` or `item` names none of the plans checked refuses them all.
 *
 * Every blocker is collected in one pass, so the person fixing a refused plan
 * needs one round. L1 (testable criteria) is a judgment, never checked here:
 * it reads `not-checked` and is never a blocker. Size findings (plan-lint L5)
 * and a provisional definition are advisories. Readiness fails closed: a
 * coverage code this module does not know is a blocker, a freshness the git
 * runner could not measure is `freshness-error` with its reason, and an empty
 * plan list is not ready.
 *
 * Read-only: the one write-free side effect is git reads through the caller's
 * runner and the dependency look of the coverage check, both against `cwd`.
 * Erasable syntax only, as the rest of `src/runs`.
 */

/** A document by path and text: a plan, a spec or a run contract. */
export interface PlanCheckDoc {
  path: string;
  text: string;
}

export interface PlanCheckDeps {
  /** The project spec, `docs/specs/*.md`, for the requirement definitions. */
  specs: readonly PlanCheckDoc[];
  git: GitRunner;
  /** The repository root: freshness, dependency paths and chain paths resolve against it. */
  cwd: string;
  /** A plan chain: each file's head `depends_on` names the previous; `since` is the run's `Base:`. */
  chain?: { since: string };
  contract?: PlanCheckDoc;
}

/** Every code a blocker carries. */
export const PLAN_BLOCKER_CODES = [
  "needs-clarification",
  "open-questions",
  "critical-risk",
  "lint-L2",
  "lint-L3",
  "lint-L4",
  "lint-structure",
  "head-key-missing",
  "stale",
  "stamp-unresolved",
  "freshness-error",
  "chain-order",
  "prerequisite-open",
  "contract",
  "contract-mismatch",
] as const;

export type PlanBlockerCode = (typeof PLAN_BLOCKER_CODES)[number];

export interface PlanBlocker {
  code: PlanBlockerCode;
  /** The plan line, 1-based, where the blocker sits in the plan's own text. */
  line?: number;
  message: string;
}

export interface PlanAdvisory {
  /** The coverage check's own code (`provisional-definition`, `unit-size`, …). */
  code: string;
  message: string;
}

export interface PlanHead {
  id: string;
  intent: string;
  stamp: { sha: string; date: string | null } | null;
  reads: string[];
  dependsOn: string[];
}

export interface PlanLint {
  L1: "not-checked";
  L2: "pass" | "fail";
  L3: "pass" | "fail";
  L4: "pass" | "fail";
  /** The plan-size advisories counted. */
  L5: number;
}

export interface PlanReport {
  path: string;
  ready: boolean;
  head: PlanHead;
  blockers: PlanBlocker[];
  advisories: PlanAdvisory[];
  /** The guard's verdict, or null where no stamp could be read to measure from. */
  freshness: FreshnessResult | null;
  lint: PlanLint;
}

export interface PlanCheckResult {
  ready: boolean;
  plans: PlanReport[];
  contract?: { ok: boolean; problems: string[] };
}

/** Where each structural coverage code lands: a blocker class, or an advisory. */
export type CoverageClass = "lint-L2" | "lint-L4" | "lint-structure" | "advisory";

/**
 * Every finding code of `content/skills/st-verify/scripts/spec-plan-coverage.mjs`
 * (and its engine twin), classed. `test/runs/planCheck.test.ts` reads the
 * `.mjs` and fails when a code is missing here.
 */
export const COVERAGE_CODE_CLASS: Readonly<Record<string, CoverageClass>> = {
  // L2 — dependencies resolve.
  "missing-dependencies": "lint-L2",
  "duplicate-dependency": "lint-L2",
  "dangling-dependency": "lint-L2",
  "dependency-cycle": "lint-L2",
  // L4 — requirement ids cited, defined and covered.
  "missing-requirements": "lint-L4",
  "duplicate-reference": "lint-L4",
  "dangling-requirement": "lint-L4",
  "invalid-reference": "lint-L4",
  "missing-coverage": "lint-L4",
  "duplicate-requirement": "lint-L4",
  "missing-retirement": "lint-L4",
  "partial-scope": "lint-L4",
  "missing-spec-delta": "lint-L4",
  // The plan's shape.
  "missing-units": "lint-structure",
  "duplicate-unit": "lint-structure",
  "duplicate-field": "lint-structure",
  // Advisories: how the plan was read, and plan size (L5).
  "provisional-definition": "advisory",
  "missing-spec-input": "advisory",
  "unit-size": "advisory",
  "unit-oversize": "advisory",
  "unit-prewritten": "advisory",
  "delta-verbose": "advisory",
};

/** The plan-lint L5 codes, counted into `lint.L5`. */
const SIZE_CODES = new Set(["unit-size", "unit-oversize", "unit-prewritten", "delta-verbose"]);

const REQUIRED_HEAD_KEYS = ["id", "intent", "stamp", "reads"] as const;

/** `<sha> <date>`: the sha is what the guard measures from; the date is kept when written. */
const STAMP = /^([0-9a-f]{7,64})(?:\s+(\S+).*)?$/i;

const CLARIFICATION = /\[NEEDS CLARIFICATION\b/i;
const CRITICAL_RISK = /^\s*[-*]\s+\*\*Critical\*\*/;
const OPEN_QUESTIONS_NONE = /^none\.?$/i;
/** `none` as a whole edge-case field: admissible only with a reason after it. */
const BARE_NONE = /^none[.!]?$/i;
/** A `set by` cell that names nobody. */
const NO_OWNER = /^(?:|-+|—|–|none|n\/a|tbd|unknown|nobody|\?+)$/i;
const VERIFIED_YES = /^(?:verified\s*:?\s*)?yes\b/i;

/**
 * Check each plan's readiness for an unattended start. With `chain`, the
 * plans are the chain's files in order.
 */
export async function checkPlans(
  plans: readonly PlanCheckDoc[],
  deps: PlanCheckDeps,
): Promise<PlanCheckResult> {
  const contract = deps.contract === undefined ? undefined : readContract(deps.contract);
  const reports: PlanReport[] = [];
  for (const [index, plan] of plans.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- one git runner per repository; the plans are read in chain order
    const report = await checkOne(plan, deps);
    if (deps.chain !== undefined && index > 0) {
      const previous = plans[index - 1];
      if (previous !== undefined) checkChainLink(plan, report, previous, deps.cwd);
    }
    reports.push(report);
  }
  if (contract !== undefined) {
    const blockers = [...contract.blockers, ...contractMismatch(contract, reports, deps.cwd)];
    for (const report of reports) report.blockers.push(...structuredClone(blockers));
  }
  for (const report of reports) report.ready = report.blockers.length === 0;
  const ready =
    reports.length > 0 && reports.every((report) => report.ready) && (contract?.result.ok ?? true);
  return {
    ready,
    plans: reports,
    ...(contract === undefined ? {} : { contract: contract.result }),
  };
}

async function checkOne(plan: PlanCheckDoc, deps: PlanCheckDeps): Promise<PlanReport> {
  const blockers: PlanBlocker[] = [];
  const advisories: PlanAdvisory[] = [];
  const lines = plan.text.split(/\r?\n/);

  const head = readHead(plan, lines, blockers);
  checkClarification(lines, blockers);
  checkSections(lines, blockers);

  const coverage = checkCoverage(plan, deps.specs, { cwd: deps.cwd });
  for (const finding of coverage.findings) {
    const where = finding.path === plan.path ? undefined : `${finding.path}:${finding.line}: `;
    const message = `${finding.code}: ${where ?? ""}${finding.message}`;
    const kind = COVERAGE_CODE_CLASS[finding.code] ?? "lint-structure";
    if (kind === "advisory") {
      advisories.push({ code: finding.code, message: where === undefined ? `line ${finding.line}: ${message}` : message });
    } else {
      blockers.push({ code: kind, ...(where === undefined ? { line: finding.line } : {}), message });
    }
  }
  for (const unit of parsePlanUnits(plan.text)) {
    const edge = unit.edgeCases.trim();
    if (edge === "") {
      blockers.push({ code: "lint-L3", line: unit.line, message: `${unit.id} lists no edge case; name at least one with its expected behavior.` });
    } else if (BARE_NONE.test(edge)) {
      blockers.push({ code: "lint-L3", line: unit.line, message: `${unit.id}'s edge cases read \`none\` with no reason; \`none\` needs a one-line reason.` });
    }
  }

  const measured = await measureFreshness(plan, head, lines, deps, blockers);
  const failed = (code: PlanBlockerCode): "pass" | "fail" =>
    blockers.some((blocker) => blocker.code === code) ? "fail" : "pass";
  return {
    path: plan.path,
    ready: blockers.length === 0,
    head,
    blockers,
    advisories,
    freshness: measured,
    lint: {
      L1: "not-checked",
      L2: failed("lint-L2"),
      L3: failed("lint-L3"),
      L4: failed("lint-L4"),
      L5: coverage.findings.filter((finding) => SIZE_CODES.has(finding.code)).length,
    },
  };
}

/** The head through `parseFrontmatter`; each required key absent or malformed is one blocker. */
function readHead(plan: PlanCheckDoc, lines: readonly string[], blockers: PlanBlocker[]): PlanHead {
  const head: PlanHead = { id: "", intent: "", stamp: null, reads: [], dependsOn: [] };
  let map: Record<string, unknown>;
  try {
    const parsed = parseFrontmatter(plan.text, plan.path);
    if (!parsed.hadFrontmatter) {
      blockers.push({ code: "head-key-missing", line: 1, message: `The plan has no \`---\` head; it needs ${REQUIRED_HEAD_KEYS.join(", ")}.` });
      return head;
    }
    map = parsed.frontmatter;
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    blockers.push({ code: "head-key-missing", line: 1, message: `The plan's head does not parse, so none of ${REQUIRED_HEAD_KEYS.join(", ")} can be read: ${reason}` });
    return head;
  }
  const value = (key: string): unknown => (Object.hasOwn(map, key) ? map[key] : undefined);
  const missing = (key: string, why: string): void => {
    blockers.push({ code: "head-key-missing", line: headLine(lines, key) ?? 1, message: `The head's \`${key}\` ${why}.` });
  };

  for (const key of ["id", "intent"] as const) {
    const text = value(key);
    if (typeof text === "string" && text.trim() !== "") head[key] = text.trim();
    else missing(key, text === undefined ? "is missing" : "must be a non-empty string");
  }

  const stamp = value("stamp");
  if (stamp === undefined) missing("stamp", "is missing");
  else {
    const match = typeof stamp === "string" ? STAMP.exec(stamp.trim()) : null;
    if (match?.[1] === undefined) {
      blockers.push({
        code: "stamp-unresolved",
        line: headLine(lines, "stamp") ?? 1,
        message: "The head's `stamp` does not read as `<commit sha> <UTC date>`, so freshness cannot be measured.",
      });
    } else head.stamp = { sha: match[1], date: match[2] ?? null };
  }

  const reads = value("reads");
  if (reads === undefined) missing("reads", "is missing");
  else if (Array.isArray(reads) && reads.every((entry) => typeof entry === "string" && entry.trim() !== "")) {
    head.reads = reads.map((entry: string) => entry.trim());
  } else missing("reads", "must be a list of paths");

  head.dependsOn = stringList(value("depends_on"));
  return head;
}

/** A head list that may be written as one string; non-string entries are dropped. */
function stringList(value: unknown): string[] {
  if (typeof value === "string") return value.trim() === "" ? [] : [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "").map((entry) => entry.trim());
}

/** The 1-based line of `key:` inside the head, or undefined. */
function headLine(lines: readonly string[], key: string): number | undefined {
  const pattern = new RegExp(`^${key}\\s*:`);
  for (let index = 1; index < lines.length; index += 1) {
    const line = (lines[index] ?? "").replace(/^﻿/, "");
    if (/^---[ \t]*$/.test(line)) return undefined;
    if (pattern.test(line)) return index + 1;
  }
  return undefined;
}

function checkClarification(lines: readonly string[], blockers: PlanBlocker[]): void {
  lines.forEach((line, index) => {
    if (CLARIFICATION.test(line)) {
      blockers.push({ code: "needs-clarification", line: index + 1, message: "A `[NEEDS CLARIFICATION]` marker is unresolved; resolve it in the plan before an unattended start." });
    }
  });
}

/** A `## ` heading's section name, numbering dropped and lower-cased, as the coverage check reads it. */
function sectionName(line: string): string | undefined {
  const heading = /^## (.+?)\s*$/.exec(line);
  return heading?.[1]?.replace(/^\d+[.)]\s+/, "").toLowerCase();
}

/** One unfenced line with its `## ` section; a heading row names the section it opens. */
interface SectionRow {
  section: string;
  text: string;
  line: number;
  heading: boolean;
}

/** Each unfenced line with its `## ` section; fence markers and fenced lines are skipped. */
function sectionRows(lines: readonly string[]): SectionRow[] {
  const rows: SectionRow[] = [];
  let fence = "";
  let section = "";
  lines.forEach((text, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(text)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = "";
      return;
    }
    if (fence) return;
    const heading = sectionName(text);
    if (heading !== undefined) section = heading;
    rows.push({ section, text, line: index + 1, heading: heading !== undefined });
  });
  return rows;
}

/** Open questions, Risks and Prerequisites, each read from its own section. */
function checkSections(lines: readonly string[], blockers: PlanBlocker[]): void {
  const rows = sectionRows(lines);
  const questions = rows.find((row) => row.heading && row.section.startsWith("open questions"));
  if (questions !== undefined) {
    const body = rows.filter((row) => !row.heading && row.section.startsWith("open questions") && row.text.trim() !== "");
    const text = body.map((row) => row.text.trim()).join(" ");
    if (!OPEN_QUESTIONS_NONE.test(text)) {
      blockers.push({
        code: "open-questions",
        line: body[0]?.line ?? questions.line,
        message: body.length === 0
          ? "The Open questions section is empty; it reads `None.` once every question is answered."
          : "Open questions are carried; an unattended run cannot answer them. Resolve each, then write `None.`.",
      });
    }
  }
  for (const row of rows) {
    if (row.heading) continue;
    if (row.section.startsWith("risks") && CRITICAL_RISK.test(row.text)) {
      blockers.push({ code: "critical-risk", line: row.line, message: "A Critical risk blocks handoff; mitigate it to Warning or resolve it before an unattended start." });
    }
    if (row.section.startsWith("prerequisites")) checkPrerequisiteRow(row.text, row.line, blockers);
  }
}

/**
 * One Prerequisites row, `kind · name · read where · set by · blocks … · verified yes|no`,
 * written as a list item or a table row. Prose lines and a table's header and delimiter rows
 * are no rows.
 */
function checkPrerequisiteRow(text: string, line: number, blockers: PlanBlocker[]): void {
  const trimmed = text.trim();
  let cells: string[];
  if (trimmed.startsWith("|")) {
    if (/^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(trimmed)) return;
    cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cleanCell);
    if (cells[0]?.toLowerCase() === "kind") return;
  } else if (/^[-*]\s+/.test(trimmed) || trimmed.includes("·")) {
    cells = trimmed.replace(/^[-*]\s+/, "").split("·").map(cleanCell);
  } else return;
  const [, name = "", , setBy = "", , verified = ""] = cells;
  if (cells.length < 6 || name === "") {
    blockers.push({ code: "prerequisite-open", line, message: "A Prerequisites row needs six parts: kind · name · read where · set by · blocks · verified." });
    return;
  }
  if (name.includes("=")) {
    blockers.push({ code: "prerequisite-open", line, message: `Prerequisite ${JSON.stringify(name.split("=")[0]?.trim() ?? "")} carries a value in its name; a row names the need, never its value.` });
    return;
  }
  if (!VERIFIED_YES.test(verified) && NO_OWNER.test(setBy)) {
    blockers.push({ code: "prerequisite-open", line, message: `Prerequisite ${JSON.stringify(name)} is neither verified nor owned; name who sets it, or verify it.` });
  }
}

const cleanCell = (cell: string): string => cell.replaceAll("`", "").replaceAll("**", "").trim();

async function measureFreshness(
  plan: PlanCheckDoc,
  head: PlanHead,
  lines: readonly string[],
  deps: PlanCheckDeps,
  blockers: PlanBlocker[],
): Promise<FreshnessResult | null> {
  if (head.stamp === null) return null;
  const stampLine = headLine(lines, "stamp") ?? 1;
  const readsLine = headLine(lines, "reads") ?? 1;
  let result: FreshnessResult;
  try {
    result = await freshness(
      deps.git,
      deps.cwd,
      head.stamp.sha,
      head.reads,
      deps.chain === undefined ? undefined : { exemptSince: deps.chain.since },
    );
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    blockers.push({ code: "freshness-error", line: stampLine, message: `${plan.path}: freshness could not be measured: ${reason}` });
    return null;
  }
  if (result.error !== undefined) {
    blockers.push({ code: "freshness-error", line: stampLine, message: `Freshness could not be measured from the stamp ${head.stamp.sha}: ${result.error}. Nothing was measured, so the plan is not ready.` });
  }
  if (result.unresolved) {
    blockers.push({ code: "stamp-unresolved", line: stampLine, message: `The stamp ${head.stamp.sha} names no commit HEAD descends from; re-stamp the plan after re-reading what it reads.` });
  }
  for (const stale of result.stale) {
    const why = stale.reason === "missing" ? "is not on disk" : "moved since the stamp";
    blockers.push({ code: "stale", line: readsLine, message: `${stale.path} ${why}; re-read it and re-stamp the plan.` });
  }
  return result;
}

/** With a chain, a file after the first names the file before it in its head `depends_on`. */
function checkChainLink(plan: PlanCheckDoc, report: PlanReport, previous: PlanCheckDoc, cwd: string): void {
  const want = resolve(cwd, previous.path);
  if (report.head.dependsOn.some((entry) => resolve(cwd, entry) === want)) return;
  const line = headLine(plan.text.split(/\r?\n/), "depends_on") ?? 1;
  const named = report.head.dependsOn.length === 0 ? "names no predecessor" : `names ${report.head.dependsOn.join(", ")}`;
  report.blockers.push({ code: "chain-order", line, message: `In the chain, ${plan.path} follows ${previous.path}, but its head \`depends_on\` ${named}.` });
}

interface ReadContract {
  path: string;
  result: { ok: boolean; problems: string[] };
  blockers: PlanBlocker[];
  /** The contract's `plan` and `item`, trimmed; empty when it did not parse. */
  references: string[];
}

/** The contract parsed once; its problems become blockers on every plan it governs. */
function readContract(doc: PlanCheckDoc): ReadContract {
  const parsed = parseRunContract(doc.text, doc.path);
  const problems = parsed.ok ? [] : parsed.problems;
  const blockers = problems.map((problem): PlanBlocker => ({
    code: problem.includes(`: ${PREREQUISITE_OPEN}:`) ? "prerequisite-open" : "contract",
    message: problem,
  }));
  const references = parsed.ok
    ? [parsed.contract.plan, parsed.contract.item].flatMap((value) => (value === undefined || value.trim() === "" ? [] : [value.trim()]))
    : [];
  return { path: doc.path, result: { ok: parsed.ok, problems }, blockers, references };
}

/**
 * A parsed contract whose `plan` and `item` name none of the plans checked — by path, resolved
 * against `cwd`, or by head `id` — governs another run: one `contract-mismatch` blocker. The
 * message names the keys, never the values the contract holds.
 */
function contractMismatch(contract: ReadContract, reports: readonly PlanReport[], cwd: string): PlanBlocker[] {
  if (!contract.result.ok || reports.length === 0) return [];
  const names = (reference: string, report: PlanReport): boolean =>
    resolve(cwd, reference) === resolve(cwd, report.path) || (report.head.id !== "" && reference === report.head.id);
  if (contract.references.some((reference) => reports.some((report) => names(reference, report)))) return [];
  return [{
    code: "contract-mismatch",
    message: `The run contract ${contract.path} names none of the plans checked in its \`plan\` or \`item\`; it governs another run, so it cannot vouch for these plans.`,
  }];
}
