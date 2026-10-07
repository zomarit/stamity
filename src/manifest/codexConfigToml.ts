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
 * the whole file unedited. `[features]` also has to be a rendering some release
 * wrote ({@link RELEASED_FEATURES}), since it yields to an owner's own and a
 * record or a hash can be forged over one. Any other table of an engine name is the owner's, as
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
 * rendering in the file's own line ending. An owner's comment between two of
 * the engine's tables stays above the table it sat above.
 *
 * Leaving. A table of the engine's the rendering no longer carries (a server
 * deselected, the client removed, `clean`) leaves silently when its normalised
 * text equals the engine's current rendering of that name (the `render`
 * callback, the re-render proof the MCP lane uses), and otherwise only behind a
 * verified `.bak` naming the table (S11). A legacy server table refreshed while
 * its text differs from the rendering takes the same `.bak`, unless the ledger
 * proves the file unedited: its data lines prove it, its comments may be the owner's.
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
 * `--force`, because nothing in such a file is the engine's to replace. So is an
 * owner key that defines, without a header, a table the engine writes a header
 * for (`features.x = 1`, `features = { … }`, `github = { … }` in an owner's
 * `[mcp_servers]`), naming the key: the header would be a second definition.
 * So is an owner's `[[mcp_servers]]` array of tables while the engine writes a
 * server table under it, naming the header's line: the engine's table would
 * land inside the array's last element. So is a selection whose record would name more tables than the manifest
 * reader takes for one file ({@link planCodexConfigToml}).
 */

import { createHash } from "node:crypto";
import { displayPath, hasLedgerDrift, toLedgerKey } from "../merge/safeWrite.ts";
import type { CoOwnedReduction } from "../types/content.ts";
import { EngineError } from "../types/errors.ts";
import type { CoOwnership } from "../types/manifest.ts";
import type { CoOwnedOwnership, CoOwnedPlan } from "./coOwnedJson.ts";
import { MAX_CO_OWNED_POINTERS, memberPointer, type MemberSegments } from "./jsonMembers.ts";
import { normaliseSegment, segmentTomlTables, tomlTableName, type TomlKeyLine, type TomlSegment } from "./tomlTables.ts";

/** The engine's normalised rendering of a table name (`[mcp_servers.github]` → its text), or `null` when it renders none. */
export type CodexTableRendering = (name: string) => string | null;

/** A line of a kept `[features]` table that turns Codex's hooks off. */
const HOOKS_OFF = /^\s*hooks\s*=\s*false\s*(#.*)?$/u;
const BLANK = /^[ \t]*$/u;
const COMMENT = /^[ \t]*#/u;

/** The byte-order mark, built from its code point so no raw one sits in this source. */
const BOM = String.fromCharCode(0xfeff);

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/**
 * Every `[features]` a release wrote, as the sha256 of its normalised text
 * (`./tomlTables.ts::normaliseSegment`, the whole leading block included): the
 * one proof that a `[features]` table is the engine's (S16). An owner's own
 * `[features]` wins, so a record or a whole-file hash that claims one proves
 * nothing — either can be written over an owner's table, and a release's
 * rendering cannot. A release that changes the rendering adds its own here;
 * the planner suite's own-file case fails until it does.
 */
const RELEASED_FEATURES: ReadonlySet<string> = new Set([
  // 1.8.0, the first release to write [features], through 1.9.1: `git show v1.8.0:src/adapters/codex.ts` (composeConfigToml).
  "6adada2216f2855dfa7263b598557ab6966db0452044ab5ba579ab9e85dbcd3a",
  // 1.10.0 through 1.11.0: `git show v1.10.0:src/adapters/codex.ts` (composeConfigToml).
  "bb965a03f76b9bdc1b996133668fd8835021863cbf6c648b89fa1ac2b037e9aa",
  // The current rendering, from per-table ownership on: ../adapters/codex.ts (composeConfigTomlText).
  "b77caf7d42b9db5aacf02953b06d5028e3ddf04ef6bf7b38b877ce9d9419593c",
]);

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
  /** The owner's comment lines the recut took off the top of the table of an engine name that follows. */
  fragment: boolean;
}

/**
 * The document as items. A table of an engine name is split at the last blank
 * line of its leading block when `recut`: what lies above it is an owner's.
 * A byte-order mark an editor put ahead of such a table is the owner's too.
 */
function itemsOf(segments: readonly TomlSegment[], recut: boolean): Item[] {
  const items: Item[] = [];
  const owner = (text: string, fragment = false): void => {
    if (text !== "") items.push({ text, name: null, pointer: null, normal: "", engine: false, key: null, fragment });
  };
  for (const segment of segments) {
    if (segment.arrayTable || !isEngineKey(segment.key)) {
      // An owner's array of tables keeps an engine NAME from the engine as well:
      // writing the engine's table beside it is a redefinition Codex refuses.
      if (segment.arrayTable && segment.key !== null && isEngineKey(segment.key)) {
        items.push({ text: segment.text, name: tomlTableName(segment.key), pointer: null, normal: "", engine: false, key: segment.key, fragment: false });
      } else {
        owner(segment.text);
      }
      continue;
    }
    let text = segment.text;
    if (text.startsWith(BOM)) {
      owner(BOM);
      text = text.slice(BOM.length);
    }
    if (recut) {
      const lines = linesOf(text);
      const header = lines.findIndex((line) => !BLANK.test(line.replace(/\r?\n$/u, "")) && !COMMENT.test(line));
      let cut = -1;
      for (let index = 0; index < header; index += 1) {
        if (BLANK.test((lines[index] as string).replace(/\r?\n$/u, ""))) cut = index;
      }
      if (cut !== -1) {
        owner(lines.slice(0, cut + 1).join(""), true);
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
      fragment: false,
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
    } else if (judgement.state === "legacy") {
      const key = item.key as MemberSegments;
      const selectable = key.length === 1 || judgement.selected.includes(key[1]);
      const rendering = judgement.render(item.name);
      item.engine =
        judgement.unedited ||
        (selectable && rendering !== null && dataLines(rendering).join("\n") === dataLines(item.text).join("\n"));
    }
    // Whatever the record or the whole-file hash claims, a [features] no release wrote is the owner's.
    if (item.name === "features") item.engine &&= RELEASED_FEATURES.has(sha256(item.normal));
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

const startsWith = (path: readonly string[], prefix: readonly string[]): boolean => prefix.every((segment, index) => path[index] === segment);

/**
 * The first owner key that defines, without a header, a table the engine is
 * about to write a header for: the header would be a second definition, which
 * TOML refuses. A key's path defines the tables it passes through below its own
 * table, and the key itself is a value no header may open or reach under. A
 * header may still add a sub-table beside a dotted key's path. Keys inside the
 * engine's own tables sit below their table's name, which no other engine
 * header shares, so the owner's keys are the ones that can collide.
 */
function redefinition(keys: readonly TomlKeyLine[], writes: readonly Item[]): { at: TomlKeyLine; path: readonly string[]; header: readonly string[] } | null {
  for (const at of keys) {
    const path = [...at.table, ...at.key];
    for (const table of writes) {
      const header = table.key as readonly string[];
      const definesIt = header.length > at.table.length && header.length <= path.length && startsWith(path, header);
      if (definesIt || (path.length < header.length && startsWith(header, path))) return { at, path, header };
    }
  }
  return null;
}

function redefinitionFailure(shown: string, found: { at: TomlKeyLine; path: readonly string[]; header: readonly string[] }): string {
  const own = found.header.length <= found.path.length ? found.header : found.path;
  return (
    `Skipped ${shown}: line ${found.at.line} defines \`${tomlTableName(found.path)}\` without a table header, where the engine ` +
    `writes a [${tomlTableName(found.header)}] table, and TOML refuses a table defined twice. It was left untouched. Define ` +
    `[${tomlTableName(own)}] under a header of your own instead (the engine then keeps your table and writes none of that ` +
    `name), or remove that key, and re-run sync.`
  );
}

/**
 * The first owner `[[array]]` header that a table the engine is about to write
 * sits under (`[[mcp_servers]]` beside `[mcp_servers.github]`), with its line:
 * TOML gives the name one definition, so the engine's header would either land
 * inside the array's last element or be refused. An array of an engine table's
 * own name is the owner's table of that name ({@link itemsOf}), which the
 * engine then writes none of, so only a strict prefix can collide.
 */
function arrayRedefinition(segments: readonly TomlSegment[], writes: readonly Item[]): { line: number; path: readonly string[]; header: readonly string[] } | null {
  let line = 1;
  for (const segment of segments) {
    const array = segment.arrayTable ? (segment.key as readonly string[]) : null;
    const under = array === null ? undefined : writes.find((table) => (table.key as readonly string[]).length > array.length && startsWith(table.key as readonly string[], array));
    if (array !== null && under !== undefined) {
      const lines = linesOf(segment.text).map((text) => text.replace(BOM, "").replace(/\r?\n$/u, ""));
      return { line: line + lines.findIndex((text) => !BLANK.test(text) && !COMMENT.test(text)), path: array, header: under.key as readonly string[] };
    }
    line += segment.text.split("\n").length - 1;
  }
  return null;
}

function arrayRedefinitionFailure(shown: string, found: { line: number; path: readonly string[]; header: readonly string[] }): string {
  const name = tomlTableName(found.path);
  return (
    `Skipped ${shown}: line ${found.line} declares [[${name}]], an array of tables, where the engine writes a ` +
    `[${tomlTableName(found.header)}] table under that name, and TOML gives \`${name}\` one definition: Codex would read ` +
    `the engine's table inside your array, or refuse the file. It was left untouched. Rename your array, or define each ` +
    `of your servers as an [mcp_servers.<id>] table, and re-run sync.`
  );
}

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
 *
 * The writer holds the manifest reader's bound (`./jsonMembers.ts`
 * `MAX_CO_OWNED_POINTERS`), as the JSON planner does: a plan whose record
 * would name more tables than one ledger row takes — `[features]` plus more
 * than 63 selected servers — is a `co-owned-shape` collision and writes
 * nothing, never a manifest the next run refuses. The record names tables
 * only (`members`), so the reader's per-array bound has nothing to hold here.
 */
export function planCodexConfigToml(
  filePath: string,
  emitted: string,
  existingRaw: string | null,
  ownership: CoOwnedOwnership,
  render: CodexTableRendering,
  selected: readonly string[],
): CoOwnedPlan {
  const planned = planUnbounded(filePath, emitted, existingRaw, ownership, render, selected);
  const tables = Object.keys(planned.record?.members ?? {}).length;
  if (tables <= MAX_CO_OWNED_POINTERS) return planned;
  const reason =
    `Skipped ${displayPath(filePath, ownership.boundaryDir)}: it would hold ${tables} of the engine's tables, more than ` +
    `the ${MAX_CO_OWNED_POINTERS} the ledger can record for one file, so the engine could not tell its own tables from ` +
    `yours on the next run. Nothing was written to it. Remove MCP servers you do not use ` +
    `(\`stamity config mcp remove <id>\`) and re-run sync.`;
  return { result: { path: filePath, action: "skipped", warning: reason }, content: null, backup: null, collision: reason, record: null };
}

function planUnbounded(
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
  const unedited = state === "legacy" && isUnedited(filePath, existingRaw, ownership);
  classify(items, { state, record, selected, render, unedited });

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
  const redefined = redefinition(cut.keys, writes);
  if (redefined !== null) {
    const reason = redefinitionFailure(shown, redefined);
    return { result: { path: filePath, action: "skipped", warning: reason }, content: null, backup: null, collision: reason, record: null };
  }
  const arrayRedefined = arrayRedefinition(cut.segments, writes);
  if (arrayRedefined !== null) {
    const reason = arrayRedefinitionFailure(shown, arrayRedefined);
    return { result: { path: filePath, action: "skipped", warning: reason }, content: null, backup: null, collision: reason, record: null };
  }
  const held = items.filter((item) => item.engine);
  let backup = false;
  for (const item of held) {
    const name = item.name as string;
    if (render(name) === item.normal) continue;
    if (writes.some((table) => table.name === name)) {
      // A refresh is silent while the table's proof covers its every byte: its
      // record's hash, or a released [features]. A legacy server table is proved
      // by its data lines alone, so its comments may be the owner's.
      if (state !== "legacy" || unedited || name === "features") continue;
      backup = true;
      warnings.push(`Refreshed ${shownTable(name)} in ${shown}: it differs from the engine's current rendering of it, so the previous file was backed up first.`);
      continue;
    }
    backup = true;
    warnings.push(`Removed ${shownTable(name)} from ${shown}: it differs from the engine's current rendering of it, so the previous file was backed up first.`);
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
    const last = items.findLastIndex((item) => item.engine);
    const written = new Set(writes.map((table) => table.name as string));
    // An owner entry inside the run moves after the block (S14). A comment the
    // recut took off an engine table is no entry: it stays above that table's
    // rendering, or goes ahead of the block when the table leaves — never
    // behind it, where the next run would read it as the engine's last table.
    const ahead: Item[] = [];
    const above = new Map<string, string>();
    const after: Item[] = [];
    let inPlace = true;
    for (const [index, item] of items.entries()) {
      if (index < first || item.engine) continue;
      const below = items[index + 1];
      const anchor = item.fragment && below?.engine === true ? (below.name as string) : null;
      if (anchor === null) {
        after.push(item);
        if (index < last) inPlace = false;
      } else if (written.has(anchor)) {
        above.set(anchor, (above.get(anchor) ?? "") + item.text);
      } else {
        ahead.push(item);
      }
    }
    // Kept byte for byte only while the block is one run of the rendering's own tables.
    const unchanged =
      inPlace && held.length === writes.length && held.every((item, index) => item.name === writes[index]?.name && item.normal === writes[index]?.normal);
    let block: string;
    if (unchanged) {
      block = items.slice(first, last + 1).map((item) => item.text).join("");
    } else if (writes.length > 0) {
      // The blank lines that ended the block before stay; one separates it from an owner table it now meets.
      const run = trailingBlankRun((held.at(-1) as Item).text);
      const tables = writes.map((table) => (above.get(table.name as string) ?? "") + withEol(table.normal, eol));
      block = tables.join(eol) + (run !== "" || after.length === 0 ? run : eol);
    } else {
      block = "";
    }
    const assembled = assemble([...items.slice(0, first), ...ahead], block, after, { terminatorAdded, eol });
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
  if (BLANK.test(text.replaceAll(/\r?\n/gu, "").replace(BOM, "")) && opts.deleteWhenEngineOnly) {
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
