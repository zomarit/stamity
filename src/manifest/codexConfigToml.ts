/**
 * `.codex/config.toml`, owned TABLE BY TABLE (REQ-FLOW-037, S16) on the
 * co-owned core's write path (`./coOwnedJson.ts`: `predictCoOwnedMerge`,
 * `materializeCoOwned` take {@link planCodexConfigToml} as their plan).
 *
 * The engine's tables are `[features]`, the bare `[mcp_servers]` and each
 * `[mcp_servers.<id>]`. A table of one of those names is the engine's when the
 * ledger record holds its name (`coOwned.members["/features"]`,
 * `["/mcp_servers"]`, `["/mcp_servers/<id>"]`) with the sha256 of its current
 * normalised text (`./tomlTables.ts::normaliseSegment`); under a legacy row (a
 * ≤1.11.0 ledger, whose rows carry no record) when its data lines — neither
 * comment nor blank — equal those of the engine's rendering of it (an
 * `<id>` the manifest selects, for a server table), or when the ledger proves
 * the whole file unedited. Any other table of an engine name is the owner's, as
 * the MCP JSON lane keeps a hand-tuned server (`./mcpFilter.ts`): an owner's
 * own table of that name, or an engine table the owner edited. It is kept, the
 * engine writes no second header, and the run warns — for `[features]` only
 * when the kept table sets `hooks = false`, since Codex runs hooks unless it
 * does. Every other table, and the root (every top-level key), is the owner's:
 * kept byte for byte and in order. No key-level ownership inside a table.
 *
 * Placement. The engine's tables form one block at the position of its first
 * table, else after the owner's last line: a missing final line break is added
 * first (recorded as `terminatorAdded`), then one blank line. A block that
 * leaves the end of the file takes that blank line and that line break with it,
 * so `init` then `clean` gives the owner's bytes back. A block whose tables and
 * texts are unchanged keeps its bytes; otherwise it is rewritten from the
 * rendering in the file's own line ending.
 *
 * Leaving. A table of the engine's the rendering no longer carries (a server
 * deselected, the client removed, `clean`) leaves silently when its normalised
 * text equals the engine's current rendering of that name (the `render`
 * callback, the re-render proof the MCP lane uses), and otherwise only behind a
 * verified `.bak` naming the table (S11).
 *
 * The leading block. The engine renders every table's comments directly above
 * its header. So in a recorded document an engine table's leading block counts
 * only from the last blank line in it: comment lines above that blank line are
 * an owner's comment that met the engine's block (a file that ended in a
 * comment before `init`), kept in place as the owner's. Under a legacy row the
 * whole leading block is the engine's, as 1.11.0 wrote the whole file.
 *
 * A text the segmenter cannot read is a `co-owned-shape` collision naming the
 * line, and `untouched` to the reclaim sweep (S12): nothing here offers
 * `--force`, because nothing in such a file is the engine's to replace.
 */

import { createHash } from "node:crypto";
import { displayPath, hasLedgerDrift, toLedgerKey } from "../merge/safeWrite.ts";
import type { CoOwnedReduction } from "../types/content.ts";
import { EngineError } from "../types/errors.ts";
import type { CoOwnership } from "../types/manifest.ts";
import type { CoOwnedOwnership, CoOwnedPlan } from "./coOwnedJson.ts";
import { memberPointer, type MemberSegments } from "./jsonMembers.ts";
import { normaliseSegment, segmentTomlTables, tomlTableName, type TomlSegment } from "./tomlTables.ts";

/** The engine's normalised rendering of a table name (`[mcp_servers.github]` → its text), or `null` when it renders none. */
export type CodexTableRendering = (name: string) => string | null;

/** A line of a kept `[features]` table that turns Codex's hooks off. */
const HOOKS_OFF = /^\s*hooks\s*=\s*false\s*(#.*)?$/u;
const BLANK = /^[ \t]*$/u;
const COMMENT = /^[ \t]*#/u;

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** True for a key path the engine renders a table at. */
function isEngineKey(key: readonly string[] | null): key is MemberSegments {
  if (key === null) return false;
  if (key.length === 1) return key[0] === "features" || key[0] === "mcp_servers";
  return key.length === 2 && key[0] === "mcp_servers";
}

/** The segment's lines, each with its own line break. */
function linesOf(text: string): string[] {
  return text.split(/(?<=\n)/u).filter((line) => line !== "");
}

/** The lines that carry data: neither comment nor blank, CRLF folded. */
function dataLines(text: string): string[] {
  return normaliseSegment(text)
    .split("\n")
    .filter((line) => !BLANK.test(line) && !COMMENT.test(line));
}

/** The blank lines that end `text`, verbatim. */
function trailingBlankRun(text: string): string {
  const lines = linesOf(text);
  let at = lines.length;
  while (at > 0 && BLANK.test((lines[at - 1] as string).replace(/\r?\n$/u, ""))) at -= 1;
  return lines.slice(at).join("");
}

/** `\r\n` when the file's first line break is one, else `\n`. */
function eolOf(raw: string): "\n" | "\r\n" {
  const newline = raw.indexOf("\n");
  return newline > 0 && raw[newline - 1] === "\r" ? "\r\n" : "\n";
}

const withEol = (normalised: string, eol: string): string => (eol === "\n" ? normalised : normalised.replaceAll("\n", eol));

const shownTable = (name: string): string => `[${name}]`;

/** One piece of the document: an owner's bytes, or a table of an engine name. */
interface Item {
  text: string;
  /** The table name for a table of an engine name; `null` for everything the engine never owns. */
  name: string | null;
  pointer: string | null;
  normal: string;
  /** Decided by {@link classify}. */
  engine: boolean;
  /** The table's key path; `null` for the owner's bytes outside any table of an engine name. */
  key: readonly string[] | null;
}

/**
 * The document as items. A table of an engine name is split at the last blank
 * line of its leading block when `recut`: what lies above it is an owner's.
 */
function itemsOf(segments: readonly TomlSegment[], recut: boolean): Item[] {
  const items: Item[] = [];
  const owner = (text: string): void => {
    if (text !== "") items.push({ text, name: null, pointer: null, normal: "", engine: false, key: null });
  };
  for (const segment of segments) {
    if (segment.arrayTable || !isEngineKey(segment.key)) {
      // An owner's array of tables keeps an engine NAME from the engine as well:
      // writing the engine's table beside it is a redefinition Codex refuses.
      if (segment.arrayTable && segment.key !== null && isEngineKey(segment.key)) {
        items.push({ text: segment.text, name: tomlTableName(segment.key), pointer: null, normal: "", engine: false, key: segment.key });
      } else {
        owner(segment.text);
      }
      continue;
    }
    let text = segment.text;
    if (recut) {
      const lines = linesOf(text);
      const header = lines.findIndex((line) => !BLANK.test(line.replace(/\r?\n$/u, "")) && !COMMENT.test(line));
      let cut = -1;
      for (let index = 0; index < header; index += 1) {
        if (BLANK.test((lines[index] as string).replace(/\r?\n$/u, ""))) cut = index;
      }
      if (cut !== -1) {
        owner(lines.slice(0, cut + 1).join(""));
        text = lines.slice(cut + 1).join("");
      }
    }
    items.push({
      text,
      name: tomlTableName(segment.key),
      pointer: memberPointer(segment.key),
      normal: normaliseSegment(text),
      engine: false,
      key: segment.key,
    });
  }
  return items;
}

type OwnershipState = "adoption" | "legacy" | "recorded";

interface Judgement {
  state: OwnershipState;
  record: CoOwnership | null;
  selected: readonly string[];
  render: CodexTableRendering;
  /** The ledger proves the whole file is what the engine last wrote (legacy only). */
  unedited: boolean;
}

/** Mark each table of an engine name the engine's or the owner's. */
function classify(items: Item[], judgement: Judgement): void {
  for (const item of items) {
    if (item.name === null || item.pointer === null) continue;
    if (judgement.state === "recorded") {
      item.engine = judgement.record?.members?.[item.pointer] === sha256(item.normal);
      continue;
    }
    if (judgement.state === "legacy") {
      const key = item.key as MemberSegments;
      const selectable = key.length === 1 || judgement.selected.includes(key[1]);
      const rendering = judgement.render(item.name);
      item.engine =
        judgement.unedited ||
        (selectable && rendering !== null && dataLines(rendering).join("\n") === dataLines(item.text).join("\n"));
    }
  }
}

/** The rendering's tables, in order: every one of an engine name, the root empty, each leading block unbroken. */
function renderedTables(filePath: string, emitted: string): Item[] {
  const fail = (why: string): EngineError =>
    new EngineError(`The engine's rendering of ${filePath} ${why}. That is an engine defect: the rendering is cut into tables to own them one by one.`, {
      code: "ADAPTER_ERROR",
    });
  const cut = segmentTomlTables(emitted);
  if (!cut.ok) throw fail(`does not read as TOML at line ${cut.line} (${cut.reason})`);
  const [root, ...tables] = cut.segments;
  if (root?.text !== "") throw fail("carries text above its first table");
  return tables.map((segment) => {
    if (segment.arrayTable || !isEngineKey(segment.key)) throw fail(`carries a table the engine does not own ([${tomlTableName(segment.key as readonly string[])}])`);
    const items = itemsOf([segment], true);
    if (items.length !== 1) throw fail(`carries a blank line inside the comments above [${tomlTableName(segment.key)}]`);
    return items[0] as Item;
  });
}

/**
 * Put the document back together: the owner's items before the engine's block,
 * the block, the owner's items after it. An empty block with nothing after it
 * takes the blank line that separated it from the owner's last line, and the
 * line break the engine added to that line, with it.
 */
function assemble(
  before: readonly Item[],
  block: string,
  after: readonly Item[],
  strip: { terminatorAdded: boolean; eol: string },
): { text: string; terminatorDropped: boolean } {
  let head = before.map((item) => item.text).join("");
  const tail = after.map((item) => item.text).join("");
  if (block !== "" || tail !== "") return { text: head + block + tail, terminatorDropped: false };
  if (head !== "" && trailingBlankRun(head) !== "") {
    const lines = linesOf(head);
    head = lines.slice(0, -1).join("");
  }
  if (strip.terminatorAdded && head.endsWith(strip.eol)) {
    return { text: head.slice(0, -strip.eol.length), terminatorDropped: true };
  }
  return { text: head, terminatorDropped: strip.terminatorAdded };
}

function isUnedited(filePath: string, existingRaw: string, ownership: CoOwnedOwnership): boolean {
  const hashes = ownership.ledgerHashes;
  if (!ownership.owned || hashes === undefined || !hashes.has(toLedgerKey(filePath))) return false;
  return !hasLedgerDrift(filePath, existingRaw, hashes);
}

const readFailure = (shown: string, line: number, reason: string): string =>
  `Skipped ${shown}: line ${line} does not read as TOML this engine can cut into tables (${reason}), so which of its ` +
  `tables are the engine's cannot be told. It was left untouched. Fix that line and re-run sync.`;

function keptWarning(shown: string, name: string): string {
  return `Kept your ${shownTable(name)} in ${shown}; the engine's rendering of it is not written there — remove yours to get it back.`;
}

function hooksOffWarning(shown: string): string {
  return `Codex reads no .codex/hooks.json while features.hooks is off: remove \`hooks = false\` from the [features] table in ${shown}.`;
}

function recordOf(tables: readonly Item[], createdFile: boolean, terminatorAdded: boolean): CoOwnership {
  const members = Object.fromEntries(tables.map((table) => [table.pointer as string, sha256(table.normal)]));
  return {
    ...(tables.length > 0 ? { members } : {}),
    ...(createdFile ? { createdFile: true as const } : {}),
    ...(terminatorAdded ? { terminatorAdded: true as const } : {}),
  };
}

/**
 * What writing `emitted` into `filePath` does to the bytes `existingRaw`, by
 * the table rules above. `render` is the engine's current rendering of any
 * table name, `selected` the manifest's server ids (a legacy row's proof).
 */
export function planCodexConfigToml(
  filePath: string,
  emitted: string,
  existingRaw: string | null,
  ownership: CoOwnedOwnership,
  render: CodexTableRendering,
  selected: readonly string[],
): CoOwnedPlan {
  const rendered = renderedTables(filePath, emitted);
  if (existingRaw === null) {
    return { result: { path: filePath, action: "created" }, content: emitted, backup: null, collision: null, record: recordOf(rendered, true, false) };
  }
  const shown = displayPath(filePath, ownership.boundaryDir);
  const cut = segmentTomlTables(existingRaw);
  if (!cut.ok) {
    const reason = readFailure(shown, cut.line, cut.reason);
    return { result: { path: filePath, action: "skipped", warning: reason }, content: null, backup: null, collision: reason, record: null };
  }
  const state: OwnershipState = !ownership.owned ? "adoption" : ownership.legacy ? "legacy" : "recorded";
  const record = state === "recorded" ? ownership.record : null;
  const items = itemsOf(cut.segments, state !== "legacy");
  classify(items, { state, record, selected, render, unedited: state === "legacy" && isUnedited(filePath, existingRaw, ownership) });

  const renderedNames = new Map(rendered.map((table) => [table.name as string, table]));
  const ownerNames = new Set(items.filter((item) => item.name !== null && !item.engine).map((item) => item.name as string));
  const warnings: string[] = [];
  for (const item of items) {
    if (item.name === null || item.engine || item.pointer === null) continue;
    if (item.name === "features") {
      if (normaliseSegment(item.text).split("\n").some((line) => HOOKS_OFF.test(line))) warnings.push(hooksOffWarning(shown));
      continue;
    }
    const engines = renderedNames.get(item.name);
    if (engines === undefined) continue;
    const changedHands =
      state === "adoption"
        ? dataLines(engines.text).join("\n") !== dataLines(item.text).join("\n")
        : state === "legacy" || record?.members?.[item.pointer] !== undefined;
    if (changedHands) warnings.push(keptWarning(shown, item.name));
  }

  const writes = rendered.filter((table) => !ownerNames.has(table.name as string));
  const held = items.filter((item) => item.engine);
  let backup = false;
  for (const item of held) {
    if (writes.some((table) => table.name === item.name)) continue;
    if (render(item.name as string) === item.normal) continue;
    backup = true;
    warnings.push(
      `Removed ${shownTable(item.name as string)} from ${shown}: it differs from the engine's current rendering of it, so the previous file was backed up first.`,
    );
  }

  const eol = eolOf(existingRaw);
  const first = items.findIndex((item) => item.engine);
  let text: string;
  let terminatorAdded = ownership.record?.terminatorAdded === true && state === "recorded";
  if (first === -1) {
    if (writes.length === 0) {
      text = existingRaw;
    } else {
      let head = existingRaw;
      if (head !== "") {
        if (!head.endsWith("\n")) {
          head += eol;
          terminatorAdded = true;
        }
        head += eol;
      }
      text = head + withEol(writes.map((table) => table.normal).join("\n"), eol);
    }
  } else {
    const before = items.slice(0, first);
    const after = items.slice(first).filter((item) => !item.engine);
    // Kept byte for byte only while the block is one run of the rendering's own tables.
    const unchanged =
      held.length === writes.length &&
      held.every((item, index) => items[first + index] === item && item.name === writes[index]?.name && item.normal === writes[index]?.normal);
    let block: string;
    if (unchanged) {
      block = held.map((item) => item.text).join("");
    } else if (writes.length > 0) {
      // The blank lines that ended the block before stay; one separates it from an owner table it now meets.
      const run = trailingBlankRun((held.at(-1) as Item).text);
      block = withEol(writes.map((table) => table.normal).join("\n"), eol) + (run !== "" || after.length === 0 ? run : eol);
    } else {
      block = "";
    }
    const assembled = assemble(before, block, after, { terminatorAdded, eol });
    text = assembled.text;
    if (assembled.terminatorDropped) terminatorAdded = false;
  }

  const createdFile = state === "legacy" || ownership.record?.createdFile === true;
  const nextRecord = recordOf(writes, createdFile, terminatorAdded && writes.length > 0);
  const warning = warnings.length === 0 ? {} : { warning: warnings.join(" ") };
  if (text === existingRaw) {
    return { result: { path: filePath, action: "unchanged", ...warning }, content: null, backup: null, collision: null, record: nextRecord };
  }
  return {
    result: { path: filePath, action: "updated", ...warning },
    content: text,
    backup: backup ? existingRaw : null,
    collision: null,
    record: nextRecord,
  };
}

/**
 * What should be left of `raw` once the engine's tables are taken out — the
 * reclaim sweep's view of the document (`../merge/reclaim.ts` gate 4), by the
 * same table rules with nothing rendered. `proven` says every removed table was
 * recorded and equals the engine's current rendering of it; `mustBackUp` that a
 * recorded one does not (S11). Pure, and it writes nothing.
 */
export function reduceCodexConfigToml(
  raw: string,
  opts: {
    record: CoOwnership | null;
    legacy: boolean;
    selected: readonly string[];
    render: CodexTableRendering;
    deleteWhenEngineOnly: boolean;
  },
): CoOwnedReduction {
  const cut = segmentTomlTables(raw);
  if (!cut.ok) {
    return {
      kind: "untouched",
      detail:
        `This Codex configuration does not read as TOML at line ${cut.line} (${cut.reason}), so which of its tables the ` +
        `engine wrote cannot be read. Nothing was removed and nothing was deleted — fix or delete the file by hand.`,
    };
  }
  const state: OwnershipState = opts.legacy ? "legacy" : "recorded";
  const items = itemsOf(cut.segments, !opts.legacy);
  classify(items, { state, record: opts.legacy ? null : opts.record, selected: opts.selected, render: opts.render, unedited: false });
  const held = items.filter((item) => item.engine);
  if (held.length === 0) {
    return {
      kind: "untouched",
      detail:
        "Co-owned Codex configuration holding none of the tables this engine wrote — every table and key in it is the " +
        "operator's, so the file is left exactly as it is.",
    };
  }
  let proven = state === "recorded";
  let mustBackUp = false;
  for (const item of held) {
    const inBound = opts.render(item.name as string) === item.normal;
    proven &&= inBound;
    if (!inBound && state === "recorded") mustBackUp = true;
  }
  const first = items.findIndex((item) => item.engine);
  const after = items.slice(first).filter((item) => !item.engine);
  const { text } = assemble(items.slice(0, first), "", after, {
    terminatorAdded: !opts.legacy && opts.record?.terminatorAdded === true,
    eol: eolOf(raw),
  });
  const proof = { proven, ...(mustBackUp ? { mustBackUp: true as const } : {}) };
  const list = `${held.length} ${held.length === 1 ? "table" : "tables"} (${held.map((item) => shownTable(item.name as string)).join(", ")})`;
  if (BLANK.test(text.replaceAll(/\r?\n/gu, "")) && opts.deleteWhenEngineOnly) {
    return {
      kind: "engine-only",
      ...proof,
      detail: `Co-owned Codex configuration that proved to be engine-only: removing the engine's ${list} left nothing of the operator's.`,
    };
  }
  return {
    kind: "reduced",
    content: text,
    ...proof,
    detail: `Co-owned Codex configuration: the engine's ${list} were removed and every other table and top-level key in it is kept, so the file stays.`,
  };
}
