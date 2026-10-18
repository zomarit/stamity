import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The structural spec/plan coverage check, in the engine.
 *
 * A port of `checkCoverage` in `content/skills/st-verify/scripts/spec-plan-coverage.mjs`, the
 * skill's standalone copy a client runs with plain `node`: the same signature, the same result,
 * the same codes and messages in the same order. `stamity plan check` reads this twin; the skill
 * keeps its own, and `test/runs/planCoverageParity.test.ts` holds the two to one answer over every
 * fixture of the skill's test. A change to either is made in both.
 *
 * Read-only and structural: it checks that every in-scope requirement is defined and covered by a
 * unit, that each unit names its requirements and dependencies, and the plan-size advisories
 * (plan-lint L5). It never certifies meaning, so `semanticReview` is always `required`. The one
 * file-system read is the dependency look, through `options.exists` (default `existsSync`).
 *
 * {@link parsePlanUnits} reads each unit the same way and returns every field it carries, so a
 * caller reading `edgeCases` or `verify` reads them as this check reads `requirements`.
 *
 * Erasable syntax only, since `scripts/generate-docs.mjs` loads the CLI, and with it this module,
 * by Node's type stripping.
 */

export interface CoverageDoc {
  readonly path: string;
  readonly text: string;
}

export interface CoverageOptions {
  /** Spec inputs that do not exist; each is read as no spec and reported once. */
  readonly missingSpecInputs?: readonly string[];
  /** The dependency look; `existsSync` when absent. */
  readonly exists?: (path: string) => boolean;
  /** What a path-shaped dependency resolves against; `process.cwd()` when absent. */
  readonly cwd?: string;
}

export interface CoverageFinding {
  code: string;
  path: string;
  line: number;
  message: string;
}

export interface CoverageResult {
  status: "pass" | "fail";
  semanticReview: string;
  scope: string[];
  units: string[];
  findings: CoverageFinding[];
}

export interface PlanUnit {
  /** The `id` field where one is written, else the heading's first word. */
  id: string;
  /** The unit heading's line, 1-based. */
  line: number;
  /** The requirement IDs, ranges and shorthand expanded; empty when none parse. */
  requirements: string[];
  /** Each dependency named, notes and qualifiers stripped; empty for `none`. */
  dependsOn: string[];
  edgeCases: string;
  verify: string;
  /** Every field the unit writes, keyed as written, values cleaned of code and bold marks. */
  fields: Record<string, string>;
}

interface Row {
  /** The line with fenced text blanked. */
  text: string;
  /** The line as written. */
  raw: string;
  /** A fence marker line. */
  marker: boolean;
  line: number;
}

interface FieldValue {
  text: string;
  line: number;
}

interface UnitDraft {
  id: string;
  line: number;
  fields: Map<string, FieldValue>;
  rows: Row[];
}

/** The unit reader's running state across the rows of a Units section. */
interface UnitReader {
  units: UnitDraft[];
  unit: UnitDraft | undefined;
  field: string | undefined;
  span: Row[] | undefined;
}

const clean = (text: string): string => text.replaceAll("`", "").replaceAll("**", "").trim();

/**
 * Each line with fenced text blanked in `text`; `raw` keeps the line as written and `marker` flags a
 * fence marker line, so the plan-size codes can measure what the structural reading ignores.
 */
function linesOf(content: string): Row[] {
  let fence = "";
  return content.split(/\r?\n/).map((raw, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(raw)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = "";
      return { text: "", raw, marker: true, line: index + 1 };
    }
    return { text: fence ? "" : raw, raw, marker: false, line: index + 1 };
  });
}

/** Every `REQ-`-shaped token, valid or not; the class stops at `]`, `:` and `(` so a link or a definition reads as its ID. */
const TOKEN_SCAN = /REQ-[^\s,;|.)\]:(]+/g;
const AREA = "[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z][A-Za-z0-9]*)*";
const VALID_TOKEN = new RegExp(`^REQ-${AREA}-\\d{3,}(?:[–-](?:REQ-${AREA}-)?\\d{3,})?$`);
/** One ID, or the `, -002` shorthand, which needs a comma or the line start in front of it. */
const ID_SCAN = new RegExp(`REQ-(${AREA})-(\\d{3,})|(?:^|(?<=,\\s))-(\\d{3,})`, "gm");
/**
 * {@link ID_SCAN} plus the bare `, 002` shorthand, read in a unit's requirements only: a number after `, `, ending where
 * a token ends or a range opens. {@link references} keeps it only where that comma directly follows an ID it read, so a
 * number in a sentence (`the rest, 300 cases`) is never taken for an ID, and Spec delta prose reads as before.
 */
const BARE_ID_SCAN = new RegExp(`${ID_SCAN.source}|(?<=,\\s)(\\d{3,})(?![^\\s,;|.)\\]:(–-])`, "gm");
/** Every shorthand-shaped word, valid or not: a `-` and a digit where {@link ID_SCAN} reads shorthand. */
const SHORTHAND_SCAN = /(?:^|(?<=,\s))-\d[^\s,;|.)\]:(]*/gm;
const VALID_SHORTHAND = new RegExp(`^-\\d{3,}(?:[–-](?:REQ-${AREA}-)?\\d{3,})?$`);
/** A range closing the ID just matched; an em dash is deliberately absent (a parenthetical, not a range). */
const RANGE_SUFFIX = new RegExp(`^(?:[–-](?:REQ-(${AREA})-)?(\\d{3,})|\\s*(?:…|\\.{3}|to|through|[-–])\\s*REQ-(${AREA})-(\\d{3,}))`);
/** An ellipsis that opens a range nothing closes. */
const OPEN_RANGE = /^\s*(?:…|\.{3})/;
const pad = (value: number): string => String(value).padStart(3, "0");

/**
 * Expand explicit IDs, the `REQ-AREA-001, -002–004` shorthand, and a prose range between two IDs of
 * the same area; with `bare`, a unit's requirements, also `REQ-AREA-001, 002`. `report` receives non-fatal
 * findings (`partial-scope`); a reference the checker cannot read at all throws, and the caller turns that
 * into `invalid-reference`.
 */
function references(text: string, report: (code: string, message: string) => void = () => {}, bare = false): string[] {
  for (const [token] of text.matchAll(TOKEN_SCAN)) {
    if (!VALID_TOKEN.test(token)) throw new Error(`Malformed requirement reference: ${token}`);
  }
  for (const [token] of text.matchAll(SHORTHAND_SCAN)) {
    if (!VALID_SHORTHAND.test(token)) throw new Error(`Malformed requirement reference: ${token}`);
  }
  const ids: string[] = [];
  let prefix: string | undefined;
  // Where the last ID read ends, its range included: a bare number is shorthand only right after its `, `.
  let end = -1;
  const scan = new RegExp((bare ? BARE_ID_SCAN : ID_SCAN).source, ID_SCAN.flags);
  let match: RegExpExecArray | null;
  while ((match = scan.exec(text)) !== null) {
    if (match[4] !== undefined && match.index - 2 !== end) continue;
    if (match[1]) prefix = match[1];
    if (!prefix) throw new Error(`Requirement shorthand has no area: ${match[0]}`);
    const from = Number(match[2] ?? match[3] ?? match[4]);
    const rest = text.slice(match.index + match[0].length);
    const range = RANGE_SUFFIX.exec(rest);
    const closingArea = range?.[1] ?? range?.[3];
    if (closingArea && closingArea !== prefix) {
      throw new Error(`Requirement range spans two areas: ${match[0]}${range?.[0] ?? ""}`);
    }
    const to = range ? Number(range[2] ?? range[4]) : from;
    if (to < from || to - from > 1000) throw new Error(`Invalid requirement range: ${match[0]}${range?.[0] ?? ""}`);
    if (!range && OPEN_RANGE.test(rest)) {
      report("partial-scope", `The range opening at REQ-${prefix}-${pad(from)} names no closing ID, so only that ID is in scope; spell both endpoints.`);
    }
    for (let value = from; value <= to; value += 1) ids.push(`REQ-${prefix}-${pad(value)}`);
    end = match.index + match[0].length + (range?.[0].length ?? 0);
    // Past the closing ID: a range's endpoint is already expanded and must not be counted twice.
    if (range) scan.lastIndex = end;
  }
  return ids;
}

/** `## Spec delta`, matched by prefix so a suffixed heading still names the section. */
const isSpecDelta = (section: string): boolean => section.startsWith("spec delta");
/** `## Units`, `## 3. Units — engine`: a word match, so `## Unitsafety` is not a units section. */
const isUnits = (section: string): boolean => /^units\b/.test(section);
/** A `## ` heading's section name, numbering dropped and lower-cased; `undefined` for any other line. */
function sectionOf(row: Row): string | undefined {
  const heading = /^## (.+?)\s*$/.exec(row.text);
  return heading?.[1] === undefined ? undefined : heading[1].replace(/^\d+[.)]\s+/, "").toLowerCase();
}
/** One line split before each ADDED / MODIFIED / REMOVED, so each keyword classifies its own clause. */
const deltaSegments = (text: string): string[] => text.split(/(?=\b(?:ADDED|MODIFIED|REMOVED)\b)/).filter((part) => part.trim());
/** Findings that record how the plan was read without condemning it; the last four are plan-lint L5, plan size. */
const ADVISORY_CODES = new Set(["provisional-definition", "missing-spec-input", "unit-size", "unit-oversize", "unit-prewritten", "delta-verbose"]);
/** The fields the coverage check reads; only these report a repeat. */
const COVERAGE_FIELDS = new Set(["id", "requirements", "depends_on"]);
/** The first fence marker, or the first line of a run of five or more `>` lines, among a unit's lines. */
function prewrittenAt(rows: readonly Row[]): number | undefined {
  let run = 0;
  for (const [index, row] of rows.entries()) {
    if (row.marker) return row.line;
    run = /^\s*>/.test(row.raw) ? run + 1 : 0;
    if (run === 5) return rows[index - 4]?.line;
  }
  return undefined;
}

/**
 * A unit's `depends_on` text as the references it names. Commas separate references; a semicolon
 * starts an explanatory note. Parenthesized explanations and the two legacy unmarked qualifiers
 * remain readable. Never select only U-number matches and discard adjacent tokens.
 */
function dependencyCandidates(text: string): string[] {
  const declaration = text.split(";")[0]?.replace(/\([^)]*\)/g, "") ?? "";
  return declaration.split(/,|\s+and\s+/).map((part) => part
    .replace(/\s+(?:contract delta|ownership of changed case inputs)\.?$/, "")
    .replace(/\s+[—–]\s+.*$/, "").replace(/\.$/, "").trim()).filter(Boolean);
}

/**
 * One row of a Units section into the reader. A unit starts only at an unindented `### ` outside a
 * fence: an indented `` `### Item` `` line inside a unit's prose is text, not a unit. A trailing
 * colon belongs to the heading's prose, not to the unit's ID: `### U1: guard`. Every field is kept;
 * `repeated` is told when one of {@link COVERAGE_FIELDS} is written twice in one unit.
 */
function readUnitRow(state: UnitReader, row: Row, repeated: (unit: UnitDraft, key: string, line: number) => void): void {
  const unitLine = row.text.startsWith("### ");
  if (unitLine) state.span = undefined;
  const unitHeading = unitLine ? /^###\s+(\S+?):?(?:\s|$)/.exec(clean(row.text)) : null;
  if (unitHeading?.[1] !== undefined) {
    const unit: UnitDraft = { id: unitHeading[1], line: row.line, fields: new Map(), rows: [row] };
    state.unit = unit;
    state.span = unit.rows;
    state.units.push(unit);
    state.field = undefined;
    return;
  }
  state.span?.push(row);
  const unit = state.unit;
  if (!unit) return;
  const bullet = /^[-*]\s+(?:\*\*|`)?([A-Za-z_]+)(?:\*\*|`)?\s*:\s*(.*)$/.exec(row.text);
  const table = /^\|\s*([^|]+)\|\s*(.*?)\s*\|\s*$/.exec(row.text);
  const key = bullet?.[1] ?? (table?.[1] === undefined ? undefined : clean(table[1]));
  const value = bullet?.[2] ?? table?.[2] ?? "";
  const current = state.field === undefined ? undefined : unit.fields.get(state.field);
  if (key) {
    if (COVERAGE_FIELDS.has(key) && unit.fields.has(key)) repeated(unit, key, row.line);
    state.field = key;
    unit.fields.set(key, { text: clean(value), line: row.line });
  } else if (/^\s+\S/.test(row.text) && current) {
    current.text += ` ${clean(row.text)}`;
  } else if (bullet || table) state.field = undefined;
}

/** Each plan row through the section tracker, a Units section's rows into the unit reader. */
function readUnits(rows: readonly Row[], repeated: (unit: UnitDraft, key: string, line: number) => void): UnitDraft[] {
  const state: UnitReader = { units: [], unit: undefined, field: undefined, span: undefined };
  let section = "";
  for (const row of rows) {
    const heading = sectionOf(row);
    if (heading !== undefined) {
      section = heading;
      state.unit = undefined;
      state.field = undefined;
      state.span = undefined;
      continue;
    }
    if (isUnits(section)) readUnitRow(state, row, repeated);
  }
  for (const unit of state.units) {
    const explicit = unit.fields.get("id")?.text;
    if (explicit) unit.id = explicit;
  }
  return state.units;
}

/**
 * The structural coverage check: the skill's `checkCoverage`, ported. A spec directory that does not
 * exist yet is read as no spec, never as a crash: the plan's own delta headings and `spec carries
 * no ids` still decide whether each cited ID is defined.
 */
export function checkCoverage(plan: CoverageDoc, specs: readonly CoverageDoc[], options: CoverageOptions = {}): CoverageResult {
  const findings: CoverageFinding[] = [];
  const add = (code: string, path: string, line: number, message: string): void => { findings.push({ code, path, line, message }); };
  for (const path of new Set(options.missingSpecInputs ?? [])) {
    add("missing-spec-input", path, 1, `${path} does not exist; read as no spec — every cited ID must be defined in this plan's delta or the unit must say spec carries no ids.`);
  }
  // `quiet` suppresses a second report of findings the caller has already raised over the same
  // text — the removed branch re-reads the disposition-free half of a line it has already read.
  const refs = (text: string, path: string, line: number, quiet = false, bare = false): string[] => {
    try {
      return references(clean(text), (code, message) => { if (!quiet) add(code, path, line, message); }, bare);
    } catch (error) {
      if (!quiet) add("invalid-reference", path, line, (error as Error).message);
      return [];
    }
  };
  const definitions = new Map<string, string>();
  for (const spec of specs) {
    let inRequirements = false;
    for (const row of linesOf(spec.text)) {
      if (/^## Requirements\s*$/i.test(row.text)) inRequirements = true;
      else if (row.text.startsWith("## ")) inRequirements = false;
      if (!inRequirements || !/^(?:#{3,6}\s+|[-*]\s+\*\*)REQ-/.test(row.text)) continue;
      const id = refs(row.text, spec.path, row.line)[0];
      if (!id) continue;
      const defined = definitions.get(id);
      if (defined !== undefined) add("duplicate-requirement", spec.path, row.line, `${id} is already defined at ${defined}.`);
      else definitions.set(id, `${spec.path}:${row.line}`);
    }
  }
  const scoped = new Set<string>();
  const removed = new Set<string>();
  const provisional = new Map<string, string>();
  const reader: UnitReader = { units: [], unit: undefined, field: undefined, span: undefined };
  const repeated = (unit: UnitDraft, key: string, line: number): void => { add("duplicate-field", plan.path, line, `${unit.id} repeats ${key}.`); };
  // Plan size: a unit's lines run from its heading to the next unfenced, unindented `### ` or `## `;
  // a delta entry's from its `REQ-` heading to the next unfenced heading of any level. An entry
  // heading may carry its disposition first (`### ADDED REQ-…`, MODIFIED, REMOVED): plans write both.
  const entries: { id: string; line: number; lines: number }[] = [];
  let entry: { id: string; line: number; lines: number } | undefined;
  let sawSpecDelta = false;
  let section = "";
  for (const row of linesOf(plan.text)) {
    const heading = sectionOf(row);
    if (heading !== undefined) {
      section = heading;
      reader.unit = undefined; reader.field = undefined; reader.span = undefined; entry = undefined;
      sawSpecDelta ||= isSpecDelta(section);
      continue;
    }
    if (isSpecDelta(section)) {
      if (/^#{1,6}\s/.test(row.text)) {
        entry = /^#{3,6}\s+(?:(?:ADDED|MODIFIED|REMOVED)\s+)?REQ-/.test(row.text)
          ? { id: refs(row.text, plan.path, row.line, true)[0] ?? clean(row.text.replace(/^#+/, "")), line: row.line, lines: 0 }
          : undefined;
        if (entry) entries.push(entry);
      } else if (entry && row.raw.trim()) entry.lines += 1;
      // A `### REQ-` heading in the delta defines the requirement for a plan whose spec is not
      // written yet. It is read as a definition only where no spec supplies one — a spec always
      // wins — and the reading is reported so nobody mistakes the plan for the contract. Only the
      // bare form defines: a `### REMOVED REQ-…` heading is a size entry above, never a definition.
      if (/^#{3,6}\s+REQ-/.test(row.text)) {
        const id = refs(row.text, plan.path, row.line, true)[0];
        const earlier = id === undefined ? undefined : provisional.get(id);
        if (id && earlier !== undefined) add("duplicate-requirement", plan.path, row.line, `${id} is already provisionally defined at ${earlier}.`);
        else if (id && !definitions.has(id)) {
          provisional.set(id, `${plan.path}:${row.line}`);
          definitions.set(id, `${plan.path}:${row.line}`);
          add("provisional-definition", plan.path, row.line, `${id} has no spec definition; this plan's delta heading is read as a provisional one.`);
        }
      }
      for (const segment of deltaSegments(row.text)) {
        const ids = refs(segment, plan.path, row.line);
        if (/\bREMOVED\b/.test(segment)) {
          if (ids.length && !/\b(?:retired|superseded by|disposition:)\b/i.test(segment)) {
            add("missing-retirement", plan.path, row.line, "Removed requirements need a retirement disposition or superseded-by pointer.");
          }
          const retired = refs(segment.split(/—|superseded by|disposition:|retired/i)[0] ?? "", plan.path, row.line, true);
          for (const id of retired) removed.add(id);
        } else for (const id of ids) scoped.add(id);
      }
    }
    if (isUnits(section)) readUnitRow(reader, row, repeated);
  }
  const units = reader.units;
  if (!units.length) add("missing-units", plan.path, 1, "No Units section with ### unit headings was found; normalize the plan's unit headings before checking.");
  if (!sawSpecDelta) add("missing-spec-delta", plan.path, 1, "No `## Spec delta` heading was found; without it nothing is in scope and every requirement passes unchecked.");
  const known = new Set<string>();
  for (const item of units) {
    const explicit = item.fields.get("id")?.text;
    if (explicit) item.id = explicit;
    if (known.has(item.id)) add("duplicate-unit", plan.path, item.line, `Unit ${item.id} is defined twice.`);
    known.add(item.id);
  }
  const covered = new Set<string>();
  const graph = new Map<string, string[]>();
  const exists = options.exists ?? existsSync;
  const cwd = options.cwd ?? process.cwd();
  for (const item of units) {
    const requirement = item.fields.get("requirements");
    const requirementLine = requirement?.line ?? item.line;
    const ids = refs(requirement?.text ?? "", plan.path, requirementLine, false, true);
    if (!ids.length && !/^spec carries no ids\b/i.test(requirement?.text ?? "")) {
      add("missing-requirements", plan.path, item.line, `${item.id} needs requirement IDs or the literal spec carries no ids.`);
    }
    const local = new Set<string>();
    for (const id of ids) {
      if (local.has(id)) add("duplicate-reference", plan.path, requirementLine, `${item.id} cites ${id} twice.`);
      local.add(id); covered.add(id);
      if (!definitions.has(id)) add("dangling-requirement", plan.path, requirementLine, `${item.id} cites undefined ${id}; supply its spec or correct the ID.`);
    }
    const dependencies = item.fields.get("depends_on");
    const text = dependencies?.text ?? "";
    const edges: string[] = [];
    if (!dependencies || !text) add("missing-dependencies", plan.path, item.line, `${item.id} needs depends_on, using none when empty.`);
    else if (!/^none\b/i.test(text)) {
      const seen = new Set<string>();
      for (const dependency of dependencyCandidates(text)) {
        if (seen.has(dependency)) add("duplicate-dependency", plan.path, dependencies.line, `${item.id} repeats dependency ${dependency}.`);
        seen.add(dependency);
        if (known.has(dependency)) edges.push(dependency);
        else if (!/\bowner:\s*\S/i.test(dependency) && !exists(resolve(cwd, dependency))) {
          add("dangling-dependency", plan.path, dependencies.line, `${item.id} depends on unknown ${dependency}; name a unit, existing path, or external prerequisite with owner:.`);
        }
      }
    }
    graph.set(item.id, edges);
  }
  for (const id of scoped) {
    if (!definitions.has(id)) add("dangling-requirement", plan.path, 1, `The spec delta cites undefined ${id}; supply its spec or correct the ID.`);
    if (!covered.has(id) && !removed.has(id)) add("missing-coverage", plan.path, 1, `${id} is in the spec delta but no unit covers it.`);
  }
  for (const id of removed) if (!definitions.has(id)) add("dangling-requirement", plan.path, 1, `Retired ${id} must retain a definition and disposition in its spec.`);
  // A three-colour walk: a unit on the stack is being walked, a done unit is never walked again whatever its walk
  // found. Each unit and each edge is walked once, and a cycle is reported once, as the trail from the unit found on
  // the stack, however many units lead into it.
  const stack: string[] = [];
  const onStack = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): void => {
    if (onStack.has(id)) { add("dependency-cycle", plan.path, 1, `Dependency cycle: ${[...stack.slice(stack.indexOf(id)), id].join(" -> ")}.`); return; }
    if (done.has(id)) return;
    stack.push(id); onStack.add(id);
    for (const target of graph.get(id) ?? []) visit(target);
    stack.pop(); onStack.delete(id); done.add(id);
  };
  for (const id of graph.keys()) visit(id);
  for (const item of units) {
    let size = item.rows.length;
    while (size > 1 && !item.rows[size - 1]?.raw.trim()) size -= 1;
    if (size > 100) add("unit-oversize", plan.path, item.line, `${item.id} spans ${size} lines`);
    else if (size > 60) add("unit-size", plan.path, item.line, `${item.id} spans ${size} lines`);
    const prewritten = prewrittenAt(item.rows.slice(0, size));
    if (prewritten) add("unit-prewritten", plan.path, item.line, `${item.id} carries prewritten text at line ${prewritten}`);
  }
  for (const item of entries) if (item.lines > 6) add("delta-verbose", plan.path, item.line, `${item.id} runs ${item.lines} lines`);
  const failing = findings.some((row) => !ADVISORY_CODES.has(row.code));
  return { status: failing ? "fail" : "pass", semanticReview: "required", scope: [...scoped], units: units.map((item) => item.id), findings };
}

/** A Markdown table's delimiter row, `|---|:--:|`. */
const TABLE_DELIMITER = /^\|(?:\s*:?-+:?\s*\|)+\s*$/;

/**
 * Each unit of a plan, read as {@link checkCoverage} reads it: the same sections, fences, headings
 * and continuation lines, every field kept. A table's header row and its delimiter row are no
 * fields. A requirement reference that does not parse reads as no requirement here; the check is
 * what reports it.
 */
export function parsePlanUnits(text: string): PlanUnit[] {
  const rows = linesOf(text);
  const tableFrame = new Set<number>();
  for (const [index, row] of rows.entries()) {
    if (!TABLE_DELIMITER.test(row.text)) continue;
    tableFrame.add(row.line);
    const header = rows[index - 1];
    if (header?.text.startsWith("|")) tableFrame.add(header.line);
  }
  return readUnits(rows, () => {}).map((unit) => {
    const fields: Record<string, string> = {};
    for (const [key, value] of unit.fields) if (!tableFrame.has(value.line)) fields[key] = value.text;
    let requirements: string[];
    try {
      requirements = references(fields.requirements ?? "", undefined, true);
    } catch {
      // The check reports an unreadable reference as `invalid-reference`; this reader only lists what parses.
      requirements = [];
    }
    const dependsOn = fields.depends_on;
    return {
      id: unit.id,
      line: unit.line,
      requirements,
      dependsOn: dependsOn === undefined || /^none\b/i.test(dependsOn) ? [] : dependencyCandidates(dependsOn),
      edgeCases: fields.edgeCases ?? "",
      verify: fields.verify ?? "",
      fields,
    };
  });
}
