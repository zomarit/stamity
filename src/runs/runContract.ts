import { LineCounter, isAlias, isMap, isNode, isScalar, isSeq, parseDocument, visit } from "yaml";
import type { Pair } from "yaml";
import { isPlainObject, parseYamlStrict, unknownFields } from "../config/parse.ts";

/**
 * The run contract (REQ-FLOW-098): a committed YAML file that states, by
 * reference, what one unattended run is for. It is the groundwork a future
 * trigger reads; no trigger is built.
 *
 * ```yaml
 * run-contract: 1
 * plan: docs/plans/<file>.md      # a plan path, a board item, or both
 * item: "#412"
 * base: 02e040eb                  # the commit the run starts from
 * acceptance: |                   # kept verbatim
 *   ...
 * scope: { in: [...], out: [...] }
 * prerequisites:                  # each done, or owned by a named owner
 *   - { name: ..., state: done }
 *   - { name: ..., state: owned, owner: "@ops" }
 * budget: { stop-by: "2026-10-16T06:00:00Z", max-units: 12 }
 * answerer: "@maintainer"         # who answers the morning list
 * preview: stop                   # fixed; absent reads as stop
 * move: off                       # fixed; absent reads as off
 * ```
 *
 * Keys are spelled as the version key is, in kebab case (`stop-by`,
 * `max-units`); the parsed shape is camel case. Parsing is strict: an unknown
 * key at any level is refused, `run-contract` other than 1 is refused naming
 * version 1, and a prerequisite neither `done` nor `owned` by a named owner is
 * refused under the plan check's blocker code `prerequisite-open`. Every
 * defect is collected in one pass, so the person fixing a refused file needs
 * one round. A problem names a key this engine knows and where it stands (a
 * list index, the line of an unknown key, or the line and column of a YAML
 * syntax error), never text the file holds: not a version, not a
 * prerequisite's name or state, not the text of a YAML error, and not an
 * unknown key, which a problem counts and places by line instead of quoting.
 *
 * Pure: text in, verdict out; a path in the file is never resolved or opened.
 * Erasable syntax only, as the rest of `src/runs`.
 */

/** The one contract version this engine reads. */
export const RUN_CONTRACT_VERSION = 1;

/** The plan check's blocker code for a prerequisite neither done nor owned. */
export const PREREQUISITE_OPEN = "prerequisite-open";

export interface RunContractPrerequisite {
  name: string;
  state: "done" | "owned";
  owner?: string;
}

export interface RunContract {
  version: 1;
  plan?: string;
  item?: string;
  base: string;
  acceptance: string;
  scope: { in: string[]; out: string[] };
  prerequisites: RunContractPrerequisite[];
  budget: { stopBy?: string; maxUnits?: number };
  answerer: string;
  preview: "stop";
  move: "off";
}

export type RunContractResult =
  | { ok: true; contract: RunContract }
  | { ok: false; problems: string[] };

const ROOT_KEYS = [
  "run-contract",
  "plan",
  "item",
  "base",
  "acceptance",
  "scope",
  "prerequisites",
  "budget",
  "answerer",
  "preview",
  "move",
] as const;
const SCOPE_KEYS = ["in", "out"] as const;
const BUDGET_KEYS = ["stop-by", "max-units"] as const;
const PREREQUISITE_KEYS = ["name", "state", "owner"] as const;

/** A full or abbreviated object name; sha-256 repositories included. */
const OBJECT_NAME = /^[0-9a-f]{7,64}$/i;

/** A day, or a day and a time that carries its offset: a time with none names no instant. */
const STOP_BY = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

/**
 * Parse a run contract's text. `source` (a path or a logical name) prefixes
 * every problem.
 */
export function parseRunContract(text: string, source: string): RunContractResult {
  let parsed: unknown;
  try {
    parsed = parseYamlStrict(text, source);
  } catch (cause) {
    return { ok: false, problems: [`${source}: ${unparsed(cause)}`] };
  }
  if (!isPlainObject(parsed)) return { ok: false, problems: [`${source}: ${NOT_A_MAP}`] };
  const root = parsed;

  const problems: string[] = [];
  const say = (message: string): void => {
    problems.push(`${source}: ${message}`);
  };

  const locate = keyLocator(text);
  checkUnknown(root, ROOT_KEYS, "the contract", [], locate, say);
  checkVersion(own(root, "run-contract"), say);

  const plan = optionalText(own(root, "plan"), "plan", say);
  if (plan !== undefined && !isRepositoryRelative(plan)) {
    say("`plan` must be a repository-relative path with no `..` segment.");
  }
  const item = optionalText(own(root, "item"), "item", say);
  if (own(root, "plan") === undefined && own(root, "item") === undefined) {
    say("a contract names a plan path (`plan`) or a board item (`item`); it names neither.");
  }

  const base = readBase(own(root, "base"), say);
  const acceptance = requiredText(own(root, "acceptance"), "acceptance", say);
  const scope = readScope(own(root, "scope"), locate, say);
  const prerequisites = readPrerequisites(own(root, "prerequisites"), locate, say);
  const budget = readBudget(own(root, "budget"), locate, say);
  const answerer = requiredText(own(root, "answerer"), "answerer", say);
  checkFixed(own(root, "preview"), "preview", "stop", say);
  checkFixed(own(root, "move"), "move", "off", say);

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    contract: {
      version: RUN_CONTRACT_VERSION,
      ...(plan === undefined ? {} : { plan }),
      ...(item === undefined ? {} : { item }),
      base,
      acceptance,
      scope,
      prerequisites,
      budget,
      answerer,
      preview: "stop",
      move: "off",
    },
  };
}

type Say = (message: string) => void;

const NOT_A_MAP = "expected a map at the document root.";

/**
 * Why the text did not parse, in words that hold none of it. `parseYamlStrict`
 * throws with the YAML library's error as `cause` on a syntax failure, whose
 * message can quote the file (an alias's name), and with no cause when the root
 * is not a map, whose message shows the root's value (`src/config/parse.ts`).
 */
function unparsed(cause: unknown): string {
  const syntax = cause instanceof Error ? cause.cause : undefined;
  if (!(syntax instanceof Error)) return NOT_A_MAP;
  const at = (syntax as { linePos?: readonly { line: number; col: number }[] }).linePos?.[0];
  const where = at === undefined ? "" : ` at line ${at.line}, column ${at.col}`;
  return `the file is not valid YAML${where}; fix the syntax and re-run.`;
}

/** Own keys only: a prototype member never reads as a supplied value. */
function own(obj: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(obj, key) ? obj[key] : undefined;
}

/**
 * Unknown keys by count and line, never by their text: a key the file holds can be any quoted
 * text of any length, and a problem reaches the plan check's output. The allowed keys are named,
 * since this engine wrote those words.
 */
function checkUnknown(
  obj: Record<string, unknown>,
  known: readonly string[],
  where: string,
  at: MapPath,
  locate: Locate,
  say: Say,
): void {
  const count = unknownFields(obj, known).length;
  if (count === 0) return;
  const lines = locate(at, known);
  const place = lines.length === 0 ? "" : `, at line${lines.length === 1 ? "" : "s"} ${lines.join(", ")}`;
  say(
    `${count} unknown field${count === 1 ? "" : "s"} in ${where}${place}. ` +
      `Allowed: ${known.map((key) => JSON.stringify(key)).join(", ")}.`,
  );
}

/** Where a map sits in the contract: the keys and list indexes that lead to it from the root. */
type MapPath = readonly (string | number)[];

/** The lines of the keys outside `known` in the map at a path, ascending. */
type Locate = (at: MapPath, known: readonly string[]) => number[];

type Deref = (node: unknown) => unknown;

/**
 * Places unknown keys by line. The text is parsed again, on the first call only and for
 * positions alone: the parsed object has already decided that a key is unknown, and no key's
 * text is read back out. A key merged in through `<<` is placed where it is written. A map this
 * cannot find yields no line, and the problem keeps its count.
 */
function keyLocator(text: string): Locate {
  let read: { root: unknown; deref: Deref; line: (offset: number) => number } | undefined;
  // Each map's values by key name, built once, so a check per list row walks the root once.
  const named = new Map<unknown, Map<string, unknown>>();
  return (at, known) => {
    read ??= positions(text);
    const { deref, line } = read;
    const valueAt = (map: unknown, name: string): unknown => {
      let values = named.get(map);
      if (values === undefined) {
        values = new Map();
        for (const pair of pairsOf(map, deref)) {
          const key = keyName(pair.key, deref);
          if (key !== undefined && !values.has(key)) values.set(key, pair.value);
        }
        named.set(map, values);
      }
      return deref(values.get(name));
    };
    let node = deref(read.root);
    for (const step of at) {
      node = typeof step === "number" ? deref(isSeq(node) ? node.items[step] : undefined) : valueAt(node, step);
    }
    const allowed = new Set(known);
    const lines = new Set<number>();
    for (const pair of pairsOf(node, deref)) {
      const name = keyName(pair.key, deref);
      if (name !== undefined && allowed.has(name)) continue;
      const start = isNode(pair.key) ? pair.key.range?.[0] : undefined;
      if (start !== undefined) lines.add(line(start));
    }
    return [...lines].toSorted((a, b) => a - b);
  };
}

/** The document's root, its aliases resolved in one pass, and an offset's 1-based line. */
function positions(text: string): { root: unknown; deref: Deref; line: (offset: number) => number } {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { merge: true, logLevel: "error", lineCounter });
  // An alias stands for the last node anchored under its name before it, as the parser reads it.
  const targets = new Map<unknown, unknown>();
  const anchors = new Map<string, unknown>();
  visit(doc, {
    Node: (_key, node) => {
      if (isAlias(node)) targets.set(node, anchors.get(node.source));
      else if (node.anchor !== undefined) anchors.set(node.anchor, node);
    },
  });
  return {
    root: doc.contents,
    deref: (node) => (isAlias(node) ? targets.get(node) : node),
    line: (offset) => lineCounter.linePos(offset).line,
  };
}

/** A `<<` key, which the parser resolves to a symbol: it merges a map in and names no field. */
function isMergeKey(key: unknown): boolean {
  return isScalar(key) && typeof key.value === "symbol";
}

/**
 * A map's own pairs, then each merge source's in order, so the first pair under a name is the
 * one the parsed object holds. A map already entered is skipped, so a merge loop ends.
 */
function pairsOf(node: unknown, deref: Deref, entered = new Set<unknown>()): Pair<unknown, unknown>[] {
  if (!isMap(node) || entered.has(node)) return [];
  entered.add(node);
  const merged = node.items.filter((pair) => isMergeKey(pair.key)).flatMap((pair) => {
    const source = deref(pair.value);
    const sources = isSeq(source) ? source.items.map(deref) : [source];
    return sources.flatMap((each) => pairsOf(each, deref, entered));
  });
  return [...node.items.filter((pair) => !isMergeKey(pair.key)), ...merged];
}

/** The name the parsed object keys a scalar key by; a collection key names no field. */
function keyName(key: unknown, deref: Deref): string | undefined {
  const node = deref(key);
  if (!isScalar(node)) return undefined;
  return node.value === null ? "" : String(node.value);
}

function checkVersion(value: unknown, say: Say): void {
  if (value === RUN_CONTRACT_VERSION) return;
  if (value === undefined) {
    say(`\`run-contract\` is required; this engine reads version ${RUN_CONTRACT_VERSION}.`);
    return;
  }
  say(`\`run-contract\` names a version this engine does not read; it reads version ${RUN_CONTRACT_VERSION}.`);
}

/** A non-empty string, kept as written. */
function requiredText(value: unknown, key: string, say: Say): string {
  if (typeof value === "string" && value.trim() !== "") return value;
  say(`\`${key}\` is required, a non-empty string${quoteHint(value)}.`);
  return "";
}

function optionalText(value: unknown, key: string, say: Say): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && value.trim() !== "") return value;
  say(`\`${key}\` must be a non-empty string${quoteHint(value)}.`);
  return undefined;
}

/** YAML reads `412` and `1234567` as numbers; the fix is quoting them. */
function quoteHint(value: unknown): string {
  return typeof value === "number" ? " (YAML read a number: quote the value)" : "";
}

function isRepositoryRelative(path: string): boolean {
  if (/^(?:[\\/]|[a-z]:)/i.test(path)) return false;
  return !path.split(/[\\/]/).includes("..");
}

function readBase(value: unknown, say: Say): string {
  if (typeof value === "string" && OBJECT_NAME.test(value)) return value;
  say(`\`base\` is required, a commit sha of 7 to 64 hexadecimal characters${quoteHint(value)}.`);
  return "";
}

function readStringList(value: unknown, key: string, say: Say): string[] | null {
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry !== "")) {
    return value as string[];
  }
  say(`\`${key}\` must be a list of non-empty strings.`);
  return null;
}

function readScope(value: unknown, locate: Locate, say: Say): { in: string[]; out: string[] } {
  if (!isPlainObject(value)) {
    say("`scope` is required, a map with `in` (and optionally `out`).");
    return { in: [], out: [] };
  }
  checkUnknown(value, SCOPE_KEYS, "`scope`", ["scope"], locate, say);
  const inside = readStringList(own(value, "in"), "scope.in", say) ?? [];
  if (Array.isArray(own(value, "in")) && inside.length === 0) {
    say("`scope.in` must name at least one path or area.");
  }
  const outValue = own(value, "out");
  const outside = outValue === undefined ? [] : (readStringList(outValue, "scope.out", say) ?? []);
  return { in: inside, out: outside };
}

function readPrerequisites(value: unknown, locate: Locate, say: Say): RunContractPrerequisite[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    say("`prerequisites` must be a list of maps.");
    return [];
  }
  const rows: RunContractPrerequisite[] = [];
  value.forEach((entry: unknown, index) => {
    const at = `prerequisites[${index}]`;
    if (!isPlainObject(entry)) {
      say(`\`${at}\` must be a map with \`name\` and \`state\`.`);
      return;
    }
    checkUnknown(entry, PREREQUISITE_KEYS, `\`${at}\``, ["prerequisites", index], locate, say);
    const name = own(entry, "name");
    if (typeof name !== "string" || name.trim() === "") {
      say(`\`${at}.name\` is required, a non-empty string.`);
      return;
    }
    const state = own(entry, "state");
    const owner = own(entry, "owner");
    if (owner !== undefined && (typeof owner !== "string" || owner.trim() === "")) {
      say(`\`${at}.owner\` must be a non-empty string.`);
      return;
    }
    if (state === "done") {
      rows.push({ name, state, ...(owner === undefined ? {} : { owner }) });
      return;
    }
    if (state === "owned" && typeof owner === "string") {
      rows.push({ name, state, owner });
      return;
    }
    const why =
      state === "owned"
        ? `is owned but names no \`owner\``
        : `is neither done nor owned (\`${at}.state\` ${state === undefined ? "is absent" : "is neither `done` nor `owned`"})`;
    say(`${PREREQUISITE_OPEN}: ${at} ${why}.`);
  });
  return rows;
}

function readBudget(value: unknown, locate: Locate, say: Say): { stopBy?: string; maxUnits?: number } {
  if (value === undefined) return {};
  if (!isPlainObject(value)) {
    say("`budget` must be a map with `stop-by` and/or `max-units`.");
    return {};
  }
  checkUnknown(value, BUDGET_KEYS, "`budget`", ["budget"], locate, say);
  const budget: { stopBy?: string; maxUnits?: number } = {};
  const stopBy = own(value, "stop-by");
  if (stopBy !== undefined) {
    if (typeof stopBy === "string" && STOP_BY.test(stopBy) && !Number.isNaN(Date.parse(stopBy))) {
      budget.stopBy = stopBy;
    } else {
      say("`budget.stop-by` must be an ISO 8601 day, or a day and time with its offset (`2026-10-16T06:00:00Z`).");
    }
  }
  const maxUnits = own(value, "max-units");
  if (maxUnits !== undefined) {
    if (typeof maxUnits === "number" && Number.isInteger(maxUnits) && maxUnits >= 1) {
      budget.maxUnits = maxUnits;
    } else {
      say("`budget.max-units` must be a positive integer.");
    }
  }
  return budget;
}

/** A field the contract fixes: absent reads as the fixed value, any other value is refused. */
function checkFixed(value: unknown, key: string, fixed: string, say: Say): void {
  if (value === undefined || value === fixed) return;
  say(`\`${key}\` is fixed at ${JSON.stringify(fixed)} in a run contract; remove it or set it so.`);
}
