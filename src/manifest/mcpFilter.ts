/**
 * On-disk MCP configuration: filter what the engine owns, keep what the user
 * added.
 *
 * A client's MCP file is shared ground. The engine writes the servers the
 * manifest selects; the operator hand-adds their own beside them, and edits
 * top-level fields the client understands. Every function here holds one
 * invariant: **an entry the ownership ledger does not claim is never removed
 * and never overwritten.** Deselecting a server removes the entry the engine
 * put there and nothing else.
 *
 * Ownership is decided by the ledger, not by name matching. A hand-added
 * server called `github` is the user's until it appears in `managedIds`, so a
 * catalog id collision preserves their definition instead of replacing it —
 * name-based ownership would silently overwrite a config the operator tuned.
 *
 * That is also why nothing here consults a server table, and why nothing here
 * takes pack supply as an argument. This module knows two sets — `managedIds`
 * and `selectedIds` — and an entry is dropped only when it is in the first and
 * absent from the second. A pack-supplied id is therefore treated exactly as a
 * curated one: refreshed while selected, removed on deselection, never dropped
 * as "unknown", because unknown is not a category the filter has. What decides
 * it is the caller's `managedIds`, which `../mcp/emit.ts::engineOwnedServerIds`
 * computes over curated AND pack-supplied ids — the one place that judgement
 * belongs, since it is made by re-rendering the entry rather than by consulting
 * a name list.
 *
 * Two servers-map spellings are in the field: Claude and Cursor use
 * `mcpServers`, VS Code uses `servers`. Both are read — as a UNION, so a
 * document carrying both has every entry judged, not just the first map's — and
 * every surviving entry is written back under the key it came from, so filtering
 * a file never migrates it to the other client's spelling and never moves an
 * entry between the two.
 *
 * A file that does not parse is never written. There is no safe merge into a
 * document we cannot read, and clobbering it would destroy the hand-edit that
 * broke it — the parse failure is returned so the caller can surface it.
 *
 * Every writer here PRESERVES the document's own bytes and republishes them, so
 * every writer here first refuses a target whose bytes are not that file's alone
 * ({@link refuseLinkedMcpTarget}). That check is this module's, not its callers':
 * it is the one place all of them pass through.
 */

import { lstat, readFile } from "node:fs/promises";
import { isPlainObject } from "../config/parse.ts";
import { atomicWriteFile, isSharedRegularFile } from "../merge/atomicWrite.ts";
import { mapFsErrno } from "../merge/fsErrors.ts";
import type { CoOwnedReduction, MergeResult } from "../types/content.ts";
import { EngineError } from "../types/errors.ts";

// ── Parsing ──────────────────────────────────────────────────────

/**
 * A validated MCP document, or the reason it could not be read. Never throws
 * and never widens: a top-level array, string, or `null` is a failure, not a
 * `Record` cast — spreading a string into a rewritten document enumerates its
 * characters into numeric keys, which is file corruption dressed as a merge.
 */
export type McpJsonParseResult =
  | {
      ok: true;
      /** The full top-level object; sibling fields are preserved verbatim. */
      doc: Record<string, unknown>;
      /**
       * Every servers entry the document holds, UNIONED across both spellings.
       * Empty when it has neither. On a name present under both, the earlier
       * spelling in {@link SERVER_KEYS} wins, matching which one a rewrite
       * treats as primary.
       */
      servers: Record<string, unknown>;
      /**
       * Which spellings actually contributed, in {@link SERVER_KEYS} order.
       * Empty when the document carries no servers map at all.
       *
       * This is what keeps a rewrite honest about a document holding both: every
       * lane that DISCARDS reads the union, so every lane that WRITES has to put
       * each surviving entry back under the key it came from. Without the list,
       * a filter would rebuild one map, leave the other in place untouched, and
       * either duplicate entries across the two or silently drop the ones it
       * never rebuilt.
       */
      maps: readonly string[];
    }
  | { ok: false; error: string };

/** Servers-map spellings, in precedence order when a document carries both. */
const SERVER_KEYS = ["mcpServers", "servers"] as const;
const SERVER_KEY_SET: ReadonlySet<string> = new Set<string>(SERVER_KEYS);

/**
 * VS Code's credential-prompt key. The one top-level field that is DERIVED from
 * the servers map rather than authored beside it — see {@link mergeInputs}.
 */
const INPUTS_KEY = "inputs";

/** A `${input:<id>}` reference, as `../mcp/emit.ts` renders it for `vscode-json`. */
const INPUT_REFERENCE = /\$\{input:([^}]+)\}/g;

/** The spellings `doc` actually carries, in {@link SERVER_KEYS} order. */
function serversKeysOf(doc: Record<string, unknown>): string[] {
  return SERVER_KEYS.filter((key) => isPlainObject(doc[key]));
}

/** The spelling a rewrite treats as primary: the first `doc` carries, else `mcpServers`. */
function serversKeyOf(doc: Record<string, unknown>): string {
  return serversKeysOf(doc)[0] ?? SERVER_KEYS[0];
}

/** The entries under `key`, or an empty map when `doc` does not carry that spelling. */
function serversUnder(doc: Record<string, unknown>, key: string): Record<string, unknown> {
  const map = doc[key];
  return isPlainObject(map) ? { ...map } : {};
}

/**
 * Parse and shape-validate an MCP document. Never throws.
 *
 * `servers` is the UNION across every recognised spelling, and `maps` names the
 * spellings that contributed. Reading only the first spelling was a silent
 * data-loss bug rather than a narrowness: `holdsOnlyEngineContent` and the frame
 * merge already treated BOTH keys as engine territory when discarding, so a
 * document carrying `mcpServers` and `servers` together had the second map's
 * entries invisible to every ownership judgement and then stripped by every
 * rewrite. Every sync deleted operator-authored servers, the reclaim sweep read
 * a file that still held them as engine-only and unlinked it, and
 * `clean --pack` reported a removal count computed over half the document.
 * Returning all maps here is the one place that closes all three; three point
 * fixes at the call sites would have left the fourth caller to find it again.
 */
export function parseMcpJsonDocument(raw: string): McpJsonParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
    // reason: not silent — the failure is returned as `{ ok: false, error }`
    // and every caller in this module surfaces or propagates it.
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: `top-level value is ${describeValue(parsed)}, expected a JSON object` };
  }

  const maps = serversKeysOf(parsed);
  // Later spellings first, so the earlier one overwrites on a shared name and
  // wins — the same precedence a rewrite uses when it picks the primary key.
  const servers: Record<string, unknown> = {};
  for (const key of maps.toReversed()) Object.assign(servers, serversUnder(parsed, key));
  return { ok: true, doc: parsed, servers, maps };
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

// ── Link guard ───────────────────────────────────────────────────────────

/**
 * The refusal for a HARD-linked MCP target. One builder feeds both the throw and
 * {@link predictMcpMergeRefusal}, so the plan row and the run it previews cannot
 * say different things; callers reach it through the predictor rather than
 * directly, which is why it is module-private.
 *
 * The remedy differs from the whole-file lane's on the one point that matters:
 * `--force` is useless here, and not because of the backup. This lane takes no
 * `.bak`, so there is no second refusal behind it — the guard is the only thing
 * between the plant and the write.
 */
function sharedNameMcpRefusal(filePath: string): EngineError {
  return new EngineError(
    `An existing file occupies ${filePath} and it is a hard link — its contents carry a second ` +
      `name this tree cannot see, which may sit outside it. This document is merged rather than ` +
      `overwritten, so every top-level field already in it is kept verbatim beside the generated ` +
      `mcpServers block and republished through temp+rename: on a shared name that lands a fresh ` +
      `inode holding bytes that were never this file's alone, so a credentials document stops ` +
      `being the same file as its other name and becomes an independent copy of it inside the ` +
      `repo, which the next commit picks up. Nothing was written, and --force does not help: ` +
      `this lane takes no .bak, so there is nothing for force to unlock. Replace it with a ` +
      `regular file — copy the contents to a new file and move that over this name — or delete ` +
      `it and re-run to regenerate it.`,
    { code: "FS_ERROR" },
  );
}

/**
 * Symlink twin of {@link sharedNameMcpRefusal}. Same lane, same harm, one
 * asymmetry: the hard link keeps its second name and gains a copy, while the
 * link is REPLACED by the merge — temp+rename publishes a regular file over it,
 * so the operator loses the link as well as the target's fields to the tree.
 *
 * `.mcp.json` is the shape that makes this lane distinct from every other
 * symlink case in the engine. The lanes that merely REPLACE a link keep writing
 * (nothing of the target survives into the tree); this one PARSES the target,
 * likes it, and keeps its top-level fields field by field — a gcloud credentials
 * file is valid JSON, so `client_secret` and `refresh_token` are carried into
 * the repo as preserved siblings of the emitted `mcpServers` block.
 */
function linkedMcpRefusal(filePath: string): EngineError {
  return new EngineError(
    `Refusing to merge into ${filePath}: it is a symbolic link, so the top-level fields this ` +
      `merge would keep beside the generated mcpServers block are not this file's — they are ` +
      `whatever the link points at, including a credentials file outside this tree that was ` +
      `never yours to publish. This document is merged rather than overwritten, and the merge ` +
      `writes through temp+rename: the link would be replaced by a regular file inside the repo ` +
      `holding those fields, where the next commit picks them up. Nothing was written. Replace ` +
      `the link with a regular file, or delete it and re-run to regenerate it.`,
    { code: "FS_ERROR" },
  );
}

/**
 * Refuse before reading when `filePath`'s bytes are not that file's alone.
 *
 * Order is the point. Every writer in this module preserves what it reads, and
 * both failure surfaces quote it: `planUserMcpJson` reports a parse failure by
 * quoting the parser's message, which carries a fragment of the document, so a
 * `.mcp.json` linked to a binary key file would print part of that key to the
 * console — the same leak one step short of disk that `merge/safeWrite.ts`
 * orders its own checks to avoid. Refusing ahead of {@link readTextOrNull} means
 * no linked byte is ever read, let alone written or printed.
 *
 * A missing file is not a linked one: ENOENT falls through so `created` and the
 * `null` return of {@link filterMcpJsonOnDisk} still work. Any other errno
 * propagates — a target that cannot be `lstat`ed is not a target this module may
 * assume is safe to rewrite.
 */
async function refuseLinkedMcpTarget(filePath: string): Promise<void> {
  let entry;
  try {
    entry = await lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw readFailure(error, filePath);
  }
  if (entry.isSymbolicLink()) throw linkedMcpRefusal(filePath);
  if (isSharedRegularFile(entry)) throw sharedNameMcpRefusal(filePath);
}

/**
 * Read-direction errno → actionable message, for the two syscalls that stand
 * between a caller and this module's merge.
 *
 * Every other failure surface here produces an `EngineError` naming the file and
 * the operator's next step; a bare `ENOTDIR` from `lstat` escaped as a raw Node
 * error whose message names a syscall, so the one failure an operator is most
 * likely to cause by hand was the one they got the least help with. The shared
 * table in `../merge/fsErrors.ts` is write-flavoured ("writing <path>"), so the
 * errnos a READ actually hits get their own sentence and everything else falls
 * through to that table — the same split `./manifest.ts` uses, not a second
 * mechanism beside it.
 */
const READ_ERRNO_MESSAGE: Record<string, (path: string) => string> = {
  EACCES: (p) =>
    `Permission denied reading ${p}. The MCP document is merged rather than overwritten, so it has to be read before anything can be written. Check the file's permissions and confirm the current user can read it, then re-run.`,
  EISDIR: (p) =>
    `Cannot read the MCP document at ${p}: that path is a directory, not a file. Remove or rename it, then re-run to regenerate the document.`,
  ENOTDIR: (p) =>
    `Cannot reach the MCP document at ${p}: a parent path component is a file, not a directory. Remove or rename that file, then re-run.`,
};

/**
 * Classify a read-side filesystem failure. Never swallows: an errno with no
 * sentence of its own still comes back as the mapped write-side `EngineError`
 * when the shared table knows it, and as the original error when neither does —
 * an unrecognised failure surfaces unchanged rather than being relabelled.
 */
function readFailure(cause: unknown, path: string): unknown {
  const code = (cause as NodeJS.ErrnoException | null)?.code;
  const messageFor = typeof code === "string" ? READ_ERRNO_MESSAGE[code] : undefined;
  if (messageFor !== undefined) {
    return new EngineError(messageFor(path), { code: "FS_ERROR", cause });
  }
  return mapFsErrno(cause, path) ?? cause;
}

/**
 * The refusal a merge into `filePath` would raise, for a planning surface that
 * renders it as a collision row instead of letting the apply be the first news
 * of it. `null` when the merge would proceed.
 *
 * A symlink returns `null`, and that is the accurate answer rather than a gap —
 * the same asymmetry `merge/safeWrite.ts::predictPreservedContentRefusal`
 * documents. A symlink is visible in one `ls -l`, so a plan row that says
 * nothing still leaves an operator able to see why the apply refused; a hard
 * link looks like an ordinary file in every listing short of `ls -li`, so a
 * silent plan row followed by a failing apply is the unreadable outcome. Neither
 * message carries a byte of the file — only the path and the remedy.
 */
export async function predictMcpMergeRefusal(filePath: string): Promise<string | null> {
  try {
    return isSharedRegularFile(await lstat(filePath)) ? sharedNameMcpRefusal(filePath).message : null;
  } catch {
    // A path that vanished, or was never there, is not a linked one — the apply
    // lane reports whatever it then finds rather than failing a read-only plan.
    return null;
  }
}

// ── Filtering ────────────────────────────────────────────────────

/** Outcome of filtering one document. */
export interface FilterMcpResult {
  /** The rewritten document. Echoes the input verbatim when {@link unparseable} is set. */
  content: string;
  /** Managed entries dropped because the selection no longer includes them. */
  removed: string[];
  /** Entries the ledger does not claim, carried through untouched. */
  preservedUserServers: string[];
  /** Parse failure message. Present only when the input could not be read. */
  unparseable?: string;
}

/**
 * Drop the managed servers `selectedIds` no longer includes, keep everything
 * else. Entry order, entry contents, and every top-level sibling field survive
 * unchanged; only the managed deselections leave.
 *
 * Unparseable input returns the original bytes as `content` with `unparseable`
 * set, so a caller that writes the result unconditionally still cannot destroy
 * the file it could not read.
 */
export function filterMcpServers(
  raw: string,
  managedIds: ReadonlySet<string>,
  selectedIds: ReadonlySet<string>,
): FilterMcpResult {
  const parsed = parseMcpJsonDocument(raw);
  if (!parsed.ok) {
    return { content: raw, removed: [], preservedUserServers: [], unparseable: parsed.error };
  }

  const kept: Record<string, unknown> = {};
  const dropped: Record<string, unknown> = {};
  const removed: string[] = [];
  const preservedUserServers: string[] = [];

  for (const [name, entry] of Object.entries(parsed.servers)) {
    if (!managedIds.has(name)) {
      kept[name] = entry;
      preservedUserServers.push(name);
    } else if (selectedIds.has(name)) {
      kept[name] = entry;
    } else {
      dropped[name] = entry;
      removed.push(name);
    }
  }

  // Each surviving entry goes back under the key it CAME from. A document
  // carrying both spellings would otherwise have every survivor rebuilt into the
  // primary map while the other map was republished untouched — duplicating the
  // entries in one direction and resurrecting the deselected ones in the other.
  return {
    content: jsonDocument(
      withFilteredServers(pruneOrphanedInputs(parsed.doc, kept, dropped), parsed.maps, kept),
    ),
    removed,
    preservedUserServers,
  };
}

/**
 * `doc` with the `inputs` rows that ONLY the removed servers referenced taken
 * out, and every other row left where it is.
 *
 * The merge lane rebuilds this field from the servers map it just produced
 * ({@link mergeInputs}), which it can do because it has an emitted array to
 * rebuild from. The filter has none — nothing is being emitted on this lane — so
 * it prunes instead, and the test is deliberately narrow: a row goes only when
 * no surviving server references it AND a removed one did. A row nothing
 * referenced before the filter ran was already unreferenced, which makes it the
 * operator's business rather than this function's, and a row a hand-added server
 * still references stays because that server still needs the prompt.
 *
 * Dialect-agnostic by construction, which is what makes it right in all three
 * documents: only `vscode-json` renders `${input:…}`, so in `.mcp.json` and
 * `.cursor/mcp.json` no removed entry references anything, `orphaned` is empty,
 * and an `inputs` array the operator authored there is returned untouched.
 */
function pruneOrphanedInputs(
  doc: Record<string, unknown>,
  kept: Record<string, unknown>,
  dropped: Record<string, unknown>,
): Record<string, unknown> {
  const inputs = doc[INPUTS_KEY];
  if (!Array.isArray(inputs) || Object.keys(dropped).length === 0) return doc;

  const orphaned = referencedInputIds(dropped);
  for (const id of referencedInputIds(kept)) orphaned.delete(id);
  if (orphaned.size === 0) return doc;

  const pruned = inputs.filter((row) => {
    const id = inputIdOf(row);
    // A row whose id cannot be read cannot be proved orphaned, so it stays —
    // the direction every unowned entry in this module takes.
    return id === null || !orphaned.has(id);
  });
  return { ...doc, [INPUTS_KEY]: pruned };
}

/**
 * Filter the document at `filePath` in place, writing only when a deselection
 * actually has to be applied. `content` always reflects what the file holds
 * after the call.
 *
 * Returns `null` when there is nothing to filter (the file does not exist).
 * An unparseable file is left exactly as it is and comes back with
 * `unparseable` set — never a rewrite, never a silent no-op.
 */
export async function filterMcpJsonOnDisk(
  filePath: string,
  managedIds: ReadonlySet<string>,
  selectedIds: ReadonlySet<string>,
): Promise<FilterMcpResult | null> {
  // Filtering keeps every entry but the deselections and republishes the rest,
  // so it has the same preserve-and-republish shape the merge below does and
  // takes the same refusal. Its caller is the pack-uninstall apply path
  // (`../cli/commands/clean.ts::removePackMcpEntries`), which takes the
  // uninstalled pack's selected servers out of the three merged client documents
  // at the last moment the engine can still prove it wrote them.
  //
  // Not the reclaim lane's entry point, and not a gap waiting to be closed by
  // making it one. The obvious-looking wiring — have the sweep call this to
  // strip a co-owned MCP document — writes DURING the sweep's read-only planning
  // pass, which is the one thing that pass may not do: `../merge/reclaim.ts`
  // pins the target's (dev, ino) at plan time and re-proves it in the same tick
  // as the syscall (`verifyPinStillHolds`), so a write from inside planning
  // lands outside the pin and gives up the guarantee the pin exists for. The
  // sweep therefore asks {@link reduceMcpDocumentToUserContent} — pure, returns
  // what should be left — and performs the write itself. Keep any new caller of
  // this function on a lane that owns its own writes.
  await refuseLinkedMcpTarget(filePath);
  const raw = await readTextOrNull(filePath);
  if (raw === null) return null;

  const result = filterMcpServers(raw, managedIds, selectedIds);
  // Nothing removed means nothing to apply. Writing the canonical rendering
  // anyway would reformat a file the operator indents their own way, so the
  // original bytes stay on disk and are what the caller is handed back.
  if (result.removed.length === 0) return { ...result, content: raw };

  await atomicWriteFile(filePath, result.content);
  return result;
}

// ── Reclaim ──────────────────────────────────────────────────────

/** No selection survives on the reclaim lane; see {@link reduceMcpDocumentToUserContent}. */
const NOTHING_SELECTED: ReadonlySet<string> = new Set<string>();

/**
 * What should be left of `raw` once every entry the engine can prove it wrote is
 * taken out of it — the reclaim sweep's class-specific view of a client MCP
 * document (`../merge/reclaim.ts` gate 4).
 *
 * The sweep reaches this only for a path no emission produces any more: the
 * adapter was dropped, or the last selected server was. So there is no selection
 * left to keep anything for, and `managedIds` — computed by re-rendering each
 * entry (`../mcp/emit.ts::engineOwnedServerIds`) — is exactly the set this repo
 * can prove it authored. Everything else in the file is the operator's.
 *
 * Pure, and it writes nothing. The sweep owns every read and every write on that
 * lane: it re-proves the target's (dev, ino) in the same tick as the syscall, and
 * a reducer that wrote during the read-only planning pass would slip that pin.
 *
 * `engine-only` — the answer that licenses an unlink — requires BOTH halves of
 * "nothing of theirs is left": an emptied servers map is not enough, because an
 * operator who set `$schema` or an `inputs` array beside it authored bytes an
 * unlink would take with them.
 */
export function reduceMcpDocumentToUserContent(
  raw: string,
  managedIds: ReadonlySet<string>,
): CoOwnedReduction {
  const filtered = filterMcpServers(raw, managedIds, NOTHING_SELECTED);
  if (filtered.unparseable !== undefined) {
    return {
      kind: "untouched",
      detail:
        `This MCP document is not valid JSON (${filtered.unparseable}), so which of its entries ` +
        `the engine wrote cannot be read. Nothing was removed and nothing was deleted — fix or ` +
        `delete the file by hand.`,
    };
  }
  if (filtered.removed.length === 0) {
    return {
      kind: "untouched",
      detail:
        "Co-owned MCP document holding no entry this repo can prove it wrote — every entry is " +
        "either one the ledger never claimed or one whose bytes no longer match what the engine " +
        "renders for that id — so the file is left exactly as it is.",
    };
  }

  const removed = filtered.removed.join(", ");
  if (holdsOnlyEngineContent(filtered.content)) {
    return {
      kind: "engine-only",
      detail:
        `Co-owned MCP document that proved to be engine-only: removing ${removed} left no server ` +
        `entry and no top-level field the operator authored, so nothing in it is theirs to keep.`,
    };
  }
  return {
    kind: "reduced",
    content: filtered.content,
    detail:
      `Co-owned MCP document: the ${filtered.removed.length} entry(ies) the engine can prove it ` +
      `wrote (${removed}) were removed, and the ${filtered.preservedUserServers.length} entry(ies) ` +
      `the ledger does not claim plus every top-level field are preserved verbatim, so the file ` +
      `stays.`,
  };
}

/**
 * True when the FILTERED document has nothing of the operator's left: no server
 * entry, and no top-level field beyond the servers map itself and an `inputs`
 * array the prune emptied.
 *
 * `inputs` is the one derived field here — its rows exist to serve server
 * entries — so an empty one is residue of the removal rather than something
 * authored. Every other field is the operator's by the rule the merge lane
 * holds, and one of them keeps the file alive.
 */
function holdsOnlyEngineContent(content: string): boolean {
  const parsed = parseMcpJsonDocument(content);
  if (!parsed.ok || Object.keys(parsed.servers).length > 0) return false;
  return Object.entries(parsed.doc).every(
    ([field, value]) =>
      SERVER_KEY_SET.has(field) ||
      (field === INPUTS_KEY && Array.isArray(value) && value.length === 0),
  );
}

// ── Materialization ──────────────────────────────────────────────

/**
 * Write `emitted` to `filePath`, merged over whatever is already there.
 *
 * The merge is one-directional by ownership: managed entries come from
 * `emitted` (fresh definitions, current pins), managed entries missing from it
 * are deselections and leave, and every entry outside `managedIds` survives
 * with its position and contents intact. Top-level sibling fields the user set
 * win over the emitted document's; fields only the emitted document has (a
 * pinned protocol revision) are added. The single exception is VS Code's
 * `inputs`, which is derived from the servers map rather than authored beside
 * it and is rebuilt from the merge's own result ({@link mergeInputs}).
 *
 * A collision — an unmanaged entry whose name the emitted document also uses —
 * resolves in the user's favour and reports itself through `warning`. Taking
 * the emitted definition would destroy a config the ledger never claimed.
 *
 * The MCP file is ledger-owned as a whole file, so no managed-block merge
 * applies and this writes through the atomic substrate directly — which is why
 * the link guard is HERE and not at the callers. `sync` and `init` both reach
 * this function, and only `sync` had a check of its own: an `init --migrate
 * full` over a predecessor carrying `mcp.servers` walked a `.mcp.json` planted
 * as a hard link straight through to the write, published its `client_secret`
 * and `refresh_token` into the tree as a fresh independent inode at 0644, and
 * exited 0 without naming the file. Guarding the chokepoint closes the caller
 * that was missed and every caller that has not been written yet.
 */
export async function materializeUserMcpJson(
  filePath: string,
  emitted: string,
  managedIds: ReadonlySet<string>,
): Promise<McpMergeResult> {
  await refuseLinkedMcpTarget(filePath);
  const existingRaw = await readTextOrNull(filePath);
  const plan = planUserMcpJson(filePath, emitted, managedIds, existingRaw);
  if (plan.content !== null) await atomicWriteFile(filePath, plan.content);
  return {
    ...plan.result,
    // `plan.content` is what needed WRITING. On `unchanged` nothing did, and the
    // bytes already there ARE the merged document; on `skipped` the file was
    // left unreadable and untouched, so there is no engine-authored document.
    writtenContent: plan.content ?? (plan.result.action === "skipped" ? null : existingRaw),
  };
}

/**
 * A merge outcome plus the bytes the file holds afterwards.
 *
 * The bytes are the MERGED document, which is not the emitted one: this lane
 * preserves unmanaged entries and the operator's sibling fields, so the file on
 * disk is emission ∪ their content. A caller that records `sha256` of what it
 * handed in records a hash of bytes that were never written, and the reclaim
 * sweep — whose only authorship proof for these paths is that hash
 * (`../merge/reclaim.ts` gate 2b/4) — then reads the engine's own document as
 * "edited since" and can never reclaim it. Handing the written bytes back is
 * what lets both writers record what they actually wrote.
 *
 * `null` only for `skipped`, where the file could not be parsed and was left
 * alone; callers skip the ledger row for that action already.
 */
export interface McpMergeResult extends MergeResult {
  writtenContent: string | null;
}

/**
 * What {@link materializeUserMcpJson} WOULD do, computed from the bytes alone.
 *
 * Split out so the plan lane can predict this path without writing: a sync
 * plan that reported "update" for every MCP document on every run would make
 * the drift gate permanently dirty, and one that reported a collision would
 * advertise a refusal the merge never performs. `content` is `null` when
 * nothing needs writing.
 */
export function planUserMcpJson(
  filePath: string,
  emitted: string,
  managedIds: ReadonlySet<string>,
  existingRaw: string | null,
): { result: MergeResult; content: string | null } {
  const emittedDoc = parseMcpJsonDocument(emitted);
  if (!emittedDoc.ok) {
    // The emitter produced this string; a failure here is an engine bug, not
    // an operator one, so it fails loudly instead of degrading to a skip.
    throw new EngineError(
      `Refusing to write ${filePath}: the emitted MCP document is not valid JSON ` +
        `(${emittedDoc.error}).`,
      { code: "ADAPTER_ERROR" },
    );
  }

  if (existingRaw === null) {
    return { result: { path: filePath, action: "created" }, content: emitted };
  }

  const existing = parseMcpJsonDocument(existingRaw);
  if (!existing.ok) {
    return {
      result: {
        path: filePath,
        action: "skipped",
        warning:
          `${filePath} is not valid JSON (${existing.error}) — left untouched, so the MCP ` +
          `server selection was not applied. Fix or delete it, then re-run.`,
      },
      content: null,
    };
  }

  const { servers, collisions } = mergeServers(existing.servers, emittedDoc.servers, managedIds);
  // Whichever spellings the target already carries, it keeps — all of them, each
  // holding the entries that were under it. A document with no servers map at
  // all takes the emitted document's spelling, which is the only spelling in
  // play. Rebuilding a two-map document into one would move the operator's
  // entries between the two keys their client reads, which is a rewrite they
  // never asked for even when nothing is lost.
  const maps = existing.maps.length > 0 ? existing.maps : [serversKeyOf(emittedDoc.doc)];

  // The user's frame wins field by field; the emitted frame contributes the
  // fields they do not have. Every servers-map spelling is stripped first, then
  // re-added below, so no key is carried through twice.
  const frame = Object.fromEntries(
    Object.entries({ ...emittedDoc.doc, ...existing.doc }).filter(
      ([field]) => !SERVER_KEY_SET.has(field),
    ),
  );

  // `inputs` is the exception to that rule, rebuilt from the servers map the
  // merge just produced. Assigning at the existing key keeps its position, so
  // the document still reads as an edit of itself.
  const inputs = mergeInputs(existing.doc[INPUTS_KEY], emittedDoc.doc[INPUTS_KEY], servers);
  if (inputs !== undefined) frame[INPUTS_KEY] = inputs;

  const content = jsonDocument(withMergedServers(frame, existing.doc, maps, servers));
  const warning =
    collisions.length > 0
      ? `${filePath}: kept your own definition of ${collisions.join(", ")} — ` +
        `the generated definition was not applied because the ownership ledger does not ` +
        `claim ${collisions.length === 1 ? "that entry" : "those entries"}.`
      : undefined;

  if (content === existingRaw) {
    return {
      result: { path: filePath, action: "unchanged", ...(warning === undefined ? {} : { warning }) },
      content: null,
    };
  }
  return {
    result: { path: filePath, action: "updated", ...(warning === undefined ? {} : { warning }) },
    content,
  };
}

/**
 * Existing entries first, in their original order: unmanaged ones verbatim,
 * managed ones refreshed from `emitted`, managed ones absent from `emitted`
 * dropped. Emitted entries the document does not have are appended.
 */
function mergeServers(
  existing: Record<string, unknown>,
  emitted: Record<string, unknown>,
  managedIds: ReadonlySet<string>,
): { servers: Record<string, unknown>; collisions: string[] } {
  const servers: Record<string, unknown> = {};
  const collisions: string[] = [];

  for (const [name, entry] of Object.entries(existing)) {
    if (!managedIds.has(name)) {
      servers[name] = entry;
      if (Object.hasOwn(emitted, name)) collisions.push(name);
    } else if (Object.hasOwn(emitted, name)) {
      servers[name] = emitted[name];
    }
  }

  for (const [name, entry] of Object.entries(emitted)) {
    if (!Object.hasOwn(servers, name)) servers[name] = entry;
  }

  return { servers, collisions };
}

/**
 * VS Code's `inputs`, rebuilt from the POST-MERGE servers map.
 *
 * Every other top-level field is the operator's to keep, and `inputs` is not:
 * each row is a credential prompt DERIVED from a server's `${input:<id>}`
 * reference (`../mcp/emit.ts::emitVsCodeServersJson` builds the array from the
 * selected servers' `requiresEnv`). Under the user-frame-wins rule the ENGINE'S
 * OWN previous rows outlived the servers they belonged to — the frame merge
 * cannot tell its last emission from an operator edit — so deselecting a server
 * dropped its entry from `servers` and left its prompt row behind permanently.
 *
 * So the REFERENCE decides, not a guess at authorship. A row survives when the
 * merged servers map still names its id; the emitted definition refreshes it
 * when the emission supplies one, and a row belonging to a hand-added server the
 * engine never wrote survives because that server still references it. Existing
 * order is kept and emitted additions are appended, matching {@link mergeServers}.
 *
 * `undefined` — leave the frame alone — whenever the emitted document has no
 * `inputs` array. The field is emitted for the VS Code dialect only, so in
 * `.mcp.json` and `.cursor/mcp.json` an `inputs` array is the operator's own
 * (nothing there renders `${input:…}`, so a rebuild would delete all of it) and
 * keeps the user-frame-wins rule.
 */
function mergeInputs(
  existingInputs: unknown,
  emittedInputs: unknown,
  servers: Record<string, unknown>,
): unknown[] | undefined {
  if (!Array.isArray(emittedInputs)) return undefined;

  const referenced = referencedInputIds(servers);
  const emittedById = new Map<string, unknown>();
  for (const row of emittedInputs) {
    const id = inputIdOf(row);
    if (id !== null) emittedById.set(id, row);
  }

  const merged: unknown[] = [];
  const taken = new Set<string>();
  for (const row of Array.isArray(existingInputs) ? existingInputs : []) {
    const id = inputIdOf(row);
    // A row whose id cannot be read cannot be proved stale, so it is the
    // operator's and stays — the direction every unowned entry here takes.
    if (id === null) {
      merged.push(row);
      continue;
    }
    if (!referenced.has(id) || taken.has(id)) continue;
    taken.add(id);
    merged.push(emittedById.get(id) ?? row);
  }
  for (const [id, row] of emittedById) {
    if (!referenced.has(id) || taken.has(id)) continue;
    taken.add(id);
    merged.push(row);
  }
  return merged;
}

/**
 * Every `${input:<id>}` id `servers` references, at any depth. Serializing the
 * merged map is what makes the scan depth-agnostic: a reference lives in `args`
 * on one row and in `env` on the next, and the dialect is free to add a third
 * place without this having to learn about it. The values came from `JSON.parse`,
 * so they are acyclic by construction.
 */
function referencedInputIds(servers: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  for (const match of JSON.stringify(servers).matchAll(INPUT_REFERENCE)) {
    const id = match[1];
    if (id !== undefined) ids.add(id);
  }
  return ids;
}

/** The `id` of an `inputs` row, or `null` when the row is not a shape we can read. */
function inputIdOf(row: unknown): string | null {
  if (!isPlainObject(row)) return null;
  const id = row["id"];
  return typeof id === "string" ? id : null;
}

// ── Shared ───────────────────────────────────────────────────────

/**
 * `doc` with its servers map replaced. Assigning at an existing key keeps that
 * key's position, so a rewritten document reads as an edit of the original
 * rather than a reordering of it.
 */
function withServers(
  doc: Record<string, unknown>,
  key: string,
  servers: Record<string, unknown>,
): Record<string, unknown> {
  return { ...doc, [key]: servers };
}

/**
 * `frame` with the MERGED servers map redistributed across the spellings the
 * target already used, each entry landing under the key it came from.
 *
 * An entry no existing map held is an emitted addition and goes to the first
 * spelling — the same key a single-map document would have used, so the common
 * case is unchanged and the two-map case stops shuffling the operator's entries
 * between keys their client reads separately. Relative order inside each map
 * follows the merge's own order (existing entries first, additions appended).
 */
function withMergedServers(
  frame: Record<string, unknown>,
  existingDoc: Record<string, unknown>,
  maps: readonly string[],
  merged: Record<string, unknown>,
): Record<string, unknown> {
  const primary = maps[0] as string;
  const owner = new Map<string, string>();
  for (const key of maps) {
    for (const name of Object.keys(serversUnder(existingDoc, key))) {
      if (!owner.has(name)) owner.set(name, key);
    }
  }

  const byKey = new Map<string, Record<string, unknown>>(maps.map((key) => [key, {}]));
  for (const [name, entry] of Object.entries(merged)) {
    (byKey.get(owner.get(name) ?? primary) as Record<string, unknown>)[name] = entry;
  }

  let result = frame;
  for (const key of maps) result = withServers(result, key, byKey.get(key) as Record<string, unknown>);
  return result;
}

/**
 * `doc` with every spelling in `maps` narrowed to the entries of `kept` that
 * came from it, each rebuilt in its own key's position.
 *
 * Spelling is preserved by construction: a key the document did not carry is not
 * in `maps`, so it is never introduced, and a document that had one spelling
 * cannot gain the other on republish. A key it did carry is rebuilt even when
 * everything under it left, because a present-but-empty map is what a client
 * reads as "no servers" and a deleted key is what it reads as "no such file
 * shape".
 */
function withFilteredServers(
  doc: Record<string, unknown>,
  maps: readonly string[],
  kept: Record<string, unknown>,
): Record<string, unknown> {
  let result = doc;
  for (const key of maps) {
    const survivors: Record<string, unknown> = {};
    for (const name of Object.keys(serversUnder(doc, key))) {
      if (Object.hasOwn(kept, name)) survivors[name] = kept[name];
    }
    result = withServers(result, key, survivors);
  }
  return result;
}

/** 2-space JSON with a trailing newline — the shape every MCP client writes. */
function jsonDocument(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readTextOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw readFailure(error, path);
  }
}
