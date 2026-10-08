import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { ReclaimCandidate } from "../manifest/ledger.ts";
import {
  bytesShowEngineOutput,
  carriesEngineMintedPrefix,
  hasEngineMintedName,
  needsRenderingProof,
  ownedFolderOf,
  ownedPathKind,
  provenByRendering,
  type OwnedPathKind,
} from "../manifest/ownedPaths.ts";
import type { CoOwnedReducer } from "../types/content.ts";
import { EngineError } from "../types/errors.ts";
import { ENGINE_CONTENT_PREFIXES, HOOKS_GENERATED_DIR, STATE_DIR } from "../types/markers.ts";
import {
  atomicWriteFile,
  isSharedRegularFile,
  readDirectoryIdentity,
  sameDirectoryIdentity,
  type DirectoryIdentity,
} from "./atomicWrite.ts";
import { hasOwnerTextOutsideBlock, splitAtManagedBlock } from "./managedBlocks.ts";
import { backupBeforeOverwrite } from "./safeWrite.ts";

/**
 * Reclaim sweep — the write half of the ownership model. `computeReclaimCandidates`
 * (`../manifest/ledger.ts`) decides WHICH recorded paths no current emission
 * produces; this module decides what may actually be done to each one on disk.
 *
 * Deletion is the exception, not the rule. A path is unlinked only when the sweep
 * can prove the engine owns the whole file — the engine minted its name, a managed
 * block spans every non-whitespace byte in it, or its bytes still hash to what the
 * ledger recorded writing there. Everything else downgrades: a file carrying user
 * bytes outside the block keeps them and loses only the block, and a co-owned file
 * with no block to strip is left untouched.
 *
 * Five gates, in order. The two cheap checks run before the sweep touches disk,
 * so a tampered ledger row is refused without a syscall:
 *
 * 1. **Containment (shape and bound).** The recorded path is repo-relative
 *    POSIX with no `..` segment, no NUL byte, no drive letter — the grammar the
 *    ledger asserts at persistence time — and every row naming it lies inside
 *    the owned-path bound (`../manifest/ownedPaths.ts`, REQ-PLUGIN-045): a
 *    platform file, a charter, a state folder or a pack's own folder for an
 *    `infra` row, a content folder for an agent, skill, rule or command row.
 *    Both are re-checked here although manifest validation refuses such a row
 *    first, because a ledger row is an authorisation to delete and some callers
 *    build candidates themselves (`clean --pack`): hand-editing the manifest
 *    must not become a delete primitive aimed anywhere in the repository.
 * 2. **Ownership marker.** Any ONE of three proofs clears this gate, and each
 *    is PROVISIONAL here — gate 4 decides with the bytes. (a) The path's own
 *    name is engine-minted (`../manifest/ownedPaths.ts::hasEngineMintedName`:
 *    the basename carries one of {@link ENGINE_CONTENT_PREFIXES}, optionally
 *    behind a two-digit ordering prefix, or the file sits inside an
 *    engine-minted SKILL directory `…/skills/<prefix><name>/…`). A prefixed
 *    ancestor of any other kind keeps the sweep reading too, and nothing more:
 *    a directory a user named after the engine says nothing about the files
 *    under it. (b) The row recorded a `contentHash` and the path is somewhere a
 *    hash alone is admissible ({@link isHashProvable}): a state or pack folder,
 *    or a platform file or charter on the trusted allowlist. (c) The caller
 *    listed the exact path in `trustedExactPaths`, the allowlist for infra files
 *    the engine writes under names it did not mint (MCP config, hook config).
 *    A whole-file delete then needs the bytes: a matching recorded hash where
 *    (b) holds — plus, at an `AGENTS.md` in any folder, `AGENTS.override.md`,
 *    `CLAUDE.md` and the Copilot setup workflow, bytes that show the engine
 *    wrote them (`../manifest/ownedPaths.ts::bytesShowEngineOutput`,
 *    REQ-PLUGIN-046) — the engine's name AND a matching recorded hash AND bytes
 *    that hash to a rendering the running engine produces at the path in a
 *    content folder (`ReclaimOptions.renderings`,
 *    `../manifest/ownedPaths.ts::needsRenderingProof`), or a managed block that
 *    spans the file. A row with no recorded
 *    hash proves nothing: no release ever wrote one, so it is a hand edit.
 * 3. **Containment (physical).** The parent directory's realpath still resolves
 *    under the root's realpath — and under the realpath of the bound folder the
 *    row's path lies in, when it lies in one, with no link on the chain of
 *    `.stamity/` and its state and pack folders — the candidate itself is a regular
 *    file, and every segment below that bound folder — the file and any folder
 *    between — is listed under exactly the recorded spelling (a
 *    case-insensitive volume answers other spellings too). A
 *    symlinked directory anywhere on the path, a symlink in place of the recorded
 *    file, or a directory where a file was recorded all end the sweep for that
 *    path — the sweep never follows a link out of the repo and never removes a
 *    tree. Everything after this gate addresses the RESOLVED parent, and the
 *    gate's findings are pinned by (dev, ino) and re-proved in the same tick as
 *    the unlink (`verifyPinStillHolds`): a check that decided about one object
 *    and a syscall that acts on another is the difference between a safety gate
 *    and a decoration.
 * 4. **User-content veto.** Bytes outside the managed block that the engine did
 *    not write veto the unlink unconditionally. The block is removed and every
 *    other byte is preserved verbatim — unless the candidate is a HARD link, in
 *    which case the strip is refused instead. Preserving bytes means rewriting
 *    them through temp+rename, which lands a fresh inode at the recorded path:
 *    on a shared name that converts the repo's name for the bytes into an
 *    independent copy of them, which is the primitive the merge lanes already
 *    refuse (`./atomicWrite.ts::isSharedRegularFile`, and the policy behind it in
 *    `./safeWrite.ts`). The delete
 *    lane needs no equivalent — `unlink` drops this name and leaves the other
 *    one holding the bytes. A recorded-hash match settles ownership
 *    ahead of this check rather than through it: bytes identical to what the
 *    engine wrote leave nothing for a user to have authored. A MISMATCH runs
 *    the other way and vetoes every delete branch, including the ones a name
 *    alone would clear — the row says what the engine wrote there, the bytes
 *    say something else wrote it since, and no filename outranks that. The
 *    veto is not gated on where the file sits: {@link isHashProvable} decides
 *    whether a match may stand in for an ownership marker, which is a question
 *    about location, while a mismatch is a fact about the bytes. That is what lets content the engine writes verbatim under a name it
 *    did not mint — a pack's own files, and the block-less whole-file infra it
 *    emits at platform-mandated paths (`AGENTS.md`, the plugin container) —
 *    be uninstalled by dropping its ledger rows and sweeping, and only while it
 *    is untouched. That shortcut holds only where the recorded hash covers a
 *    document the engine wrote END TO END, and `coOwnedPaths` names the paths
 *    where it does not. The three client MCP documents and
 *    `.claude/settings.json` (co-owned by top-level key: the client's install
 *    record and the operator's keys beside the engine's,
 *    `../manifest/claudeSettings.ts`) are written by MERGING
 *    the engine's entries into whatever the operator already has, so both
 *    writers record the hash of the MERGED bytes (`cli/commands/sync/engine.ts`,
 *    `cli/commands/init/apply.ts`) — emission ∪ the operator's own. A match
 *    there proves only that nobody has edited the file since the engine last
 *    wrote it, which is a weaker claim than sole authorship; reading it as the
 *    stronger one unlinked a `.mcp.json` carrying a hand-added server outright,
 *    with no backup and no entry saying so. So a co-owned path never reaches the
 *    whole-file branch: its reducer takes out the entries the engine can prove
 *    it wrote, everything else is preserved verbatim, and the unlink is reached
 *    only when the reduction finds nothing of the operator's left. A reducer
 *    proves per top-level entry, so a row of the operator's INSIDE an entry
 *    the engine owns is invisible to it; the bytes no longer hashing to the
 *    recorded value is the one sign of such a row, and on this lane it earns a
 *    verified `.bak` before the rewrite or the unlink rather than a veto.
 * 5. **Consent.** Without `consent: true` the sweep still runs gates 1-4 and
 *    reports the action each candidate WOULD receive, but performs no write.
 *
 * Never-silent: every candidate path produces exactly one entry, including the
 * paths nothing happened to. `skipped-unsafe-path` is the single refusal bucket —
 * shape defects, symlink escapes, wrong file types, and I/O failures that left
 * ownership unproven or an action unattempted all land there, with `detail`
 * naming which. No per-candidate failure throws: a report that loses its first
 * forty rows to the forty-first file's EACCES is worse than one that names it.
 */

// Candidates are swept sequentially on purpose: two of them can share a parent
// directory, and the empty-parent prune that follows a delete must observe the
// previous unlink. Running them concurrently would race a prune against a
// sibling's unlink and make the report order non-deterministic.
/* oxlint-disable no-await-in-loop */

// ── Public shape ───────────────────────────────────────────────────────────

/** What the sweep did to one candidate path. */
export interface ReclaimActionEntry {
  /** Repo-relative POSIX path, as recorded in the ledger (a `./` prefix trimmed). */
  path: string;
  /**
   * The precedence-winning reason among the ledger rows that named this path:
   * `adapter-removed` outranks `path-renamed` outranks `deselected`. When
   * several rows name it, `detail` lists them all.
   */
  candidateReason: ReclaimCandidate["reason"];
  /** The disposition. `dry-run` means gates 1-4 ran and nothing was written. */
  action:
    | "deleted"
    | "managed-block-stripped"
    | "co-owned-reduced"
    | "skipped-user-content"
    | "skipped-unsafe-path"
    | "skipped-missing"
    | "dry-run";
  /** Why, in one or two sentences — for `dry-run`, the action consent unlocks. */
  detail: string;
  /**
   * On a `dry-run` entry: the action consent would take. Absent on every other
   * entry, whose `action` already says what happened.
   */
  wouldBe?: "deleted" | "managed-block-stripped" | "co-owned-reduced";
  /**
   * On every entry that deleted or rewrote its file, or would: what proved the
   * engine's claim — a recorded hash that matches the bytes, a managed block,
   * or the co-owned document's reducer. Absent on a refusal.
   */
  proof?: ReclaimProof;
  /**
   * On a co-owned document's `skipped-user-content`: the reducer refused it —
   * it could not read the document or reduce it to its shape — so the engine's
   * claim to it stands (`CoOwnedReduction`'s `untouched.refused`, review/97).
   * Absent when the reducer read it and found none of the engine's entries:
   * that document is the owner's.
   */
  refused?: true;
  /**
   * On a `skipped-user-content`: the file needed the rendering proof and the
   * rendering could not be built ({@link ReclaimOptions.renderingsUnbuilt}), so
   * its bytes were never judged and the engine's claim to it stands — the
   * caller keeps its ledger row and the next sync tries the proof again
   * (review/61). Absent when the bytes were judged against a built rendering.
   */
  unproven?: true;
}

/** What proved the engine's claim to a file the sweep removes or rewrites. */
export type ReclaimProof = "hash" | "block" | "co-owned";

/*
 * The sweep cannot decide a co-owned file itself: "which bytes here are mine" is
 * a question about the document's own format, and for an MCP config the answer
 * is a servers map compared entry by entry against a fresh rendering
 * (`../mcp/emit.ts::engineOwnedServerIds`). So a `CoOwnedReducer` decides what
 * is left and this module decides what to do about it — which keeps the sweep
 * free of any one class's grammar and keeps the reducer clear of the safety
 * gates. The pair is declared in `../types/content.ts` because both sides import
 * it and neither may import the other.
 */

/**
 * Which candidate paths are hook scripts, and whether a hooks document's text
 * runs one — the grammar of the hooks documents, which this module leaves to
 * its caller as it leaves a co-owned document's to its reducer.
 */
export interface HookScriptReader {
  isHookScript(path: string): boolean;
  runs(text: string, path: string): boolean;
}

/** The reader when none is handed in: the generated hooks folder, named in the text. */
const DEFAULT_HOOK_SCRIPTS: HookScriptReader = {
  isHookScript: (path) => path.startsWith(`${HOOKS_GENERATED_DIR}/`),
  runs: (text, path) => text.includes(path),
};

/** Inputs to {@link sweepReclaimCandidates}. */
export interface ReclaimOptions {
  /** Repo root every candidate path resolves against; must exist. */
  rootDir: string;
  /** Destructive mode. `false` inspects and reports without writing. */
  consent: boolean;
  /**
   * Repo-relative POSIX paths exempt from the ownership-marker gate — infra files
   * the engine writes under names it did not mint. Exemption is from gate 2 only.
   */
  trustedExactPaths?: ReadonlySet<string>;
  /**
   * Repo-relative POSIX paths whose recorded hash covers a CO-OWNED document,
   * keyed to the reducer that separates the engine's content from the
   * operator's. A path listed here never takes the whole-file delete branch on a
   * hash match — see gate 4 above — and is unlinked only when its reducer
   * answers `engine-only`.
   *
   * Optional in the type, owed in practice: every caller that can sweep a client
   * MCP document owes this map, exactly as it owes `trustedExactPaths`
   * (`../mcp/emit.ts::mcpReclaimReducers` builds it). Omitting it does not fail
   * to compile and does not fail any unit test of this module — it silently
   * returns those paths to the whole-file delete branch, where a hash match over
   * MERGED bytes reads as sole authorship and unlinks a document holding a
   * hand-added server. That is how the regression arrived the first time, so the
   * omission is covered behaviourally instead of structurally:
   * `test/merge/reclaimMcpPreserve.test.ts` drives `applySync` and `clean` and
   * fails if either stops supplying it.
   */
  coOwnedPaths?: ReadonlyMap<string, CoOwnedReducer>;
  /**
   * The co-owned documents that wire hook commands — the only ones whose being
   * left in place holds an engine hook script back (S17). Each co-owned lane
   * declares it (`../cli/engine/emissionWrite.ts::CoOwnedDocumentLane.wiresHooks`,
   * collected by `coOwnedHookDocuments`); none when absent.
   */
  hookDocuments?: ReadonlySet<string>;
  /**
   * How a kept hooks document is read for the scripts it runs (S17). Default:
   * a candidate under the generated hooks folder is a hook script, and a
   * document runs it when its text names it. The engine's reader
   * (`../manifest/hookDocuments.ts::hookScriptReader`, handed in by
   * `../cli/engine/emissionWrite.ts`) also reads the Cursor guards, an
   * installed pack's scripts, and the scripts a portable runner's encoded row
   * names.
   */
  hookScripts?: HookScriptReader;
  /**
   * For a sweep that previews a write it runs ahead of (`check`'s drift gate,
   * `sync --dry-run`): the text each hooks document will hold once that write
   * lands, keyed by repo-relative path. A document listed here is read as this
   * text rather than as the bytes on disk, so a script the write stops naming
   * previews as the delete the live sweep — which runs after the write — makes
   * (review/68). A document the write leaves alone (refused, linked, not
   * planned) is not listed and is read from disk, as the live sweep reads it.
   * None for a live sweep, which reads what was written.
   */
  hookDocumentsAfterWrite?: ReadonlyMap<string, string>;
  /**
   * Repo-relative POSIX path → the SHA-256 of each rendering the running engine
   * produces there (`../cli/engine/emissionWrite.ts::engineRenderingsFor`). At a
   * path `../manifest/ownedPaths.ts::needsRenderingProof` names, a whole-file
   * delete needs the bytes to hash into this set (or a managed block spanning
   * the file): a recorded hash a hand edit of the manifest can forge no longer
   * proves it there. A path with no entry has no rendering, so the file is kept;
   * none at all when absent.
   */
  renderings?: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * Why {@link renderings} could not be built (the first line of the error that
   * stopped the plan), when it could not. A file that needs the rendering proof
   * is then kept unjudged — marked {@link ReclaimActionEntry.unproven}, its
   * detail naming this reason — rather than kept as bytes no rendering is.
   */
  renderingsUnbuilt?: string;
  /** Sweep timestamp recorded in mutating entries' `detail`; defaults to now. */
  now?: Date;
}

/** One entry per candidate path, plus tallies of the actions actually taken. */
export interface ReclaimReport {
  entries: ReclaimActionEntry[];
  /**
   * The hook documents this sweep left in place that still run an engine hook
   * script, with the `scripts` it therefore kept (S17), each marked
   * `unreadable` when the sweep could not read it to prove it does not; absent
   * when there are none. `clean` keeps the state directory whole when one of
   * those scripts lives in it.
   */
  wiringKept?: { path: string; scripts: string[]; unreadable?: true }[];
  /**
   * The `consent` the sweep ran under — `false` means nothing was written,
   * whatever the entries look like.
   *
   * Carried on the report because it cannot be recovered from the entries. A
   * no-consent run reports a REFUSED candidate as its own `skipped-*` action
   * (gates 1-4 run either way), so "every entry is `dry-run`" is false the
   * moment one candidate fails a gate — which is the common case, not the edge
   * one. {@link formatReclaimReport} inferred the mode that way and headlined
   * those runs as an applied sweep, dropping the re-run-with-consent
   * instruction from exactly the reports that needed it.
   */
  consent: boolean;
  deletedCount: number;
  /**
   * Entries the sweep rewrote in place rather than unlinking, in either of the
   * two shapes that produces: `managed-block-stripped` and `co-owned-reduced`.
   * One tally because callers report one thing with it — the engine's content
   * left, the file did not.
   */
  strippedCount: number;
  /**
   * Entries in the three `skipped-*` actions. NOT zero under a dry run: gates
   * 1-4 run without consent too, and a candidate they refuse is reported as the
   * refusal rather than downgraded to `dry-run` — only a plan that WOULD have
   * written becomes `dry-run`. The two mutation tallies are the ones a dry run
   * pins at zero.
   */
  skippedCount: number;
}

// ── Path grammar ───────────────────────────────────────────────────────────

/** Windows absolute forms a POSIX check misses: `C:/x`, `C:x`, `\\server\share`. */
const WINDOWS_ABSOLUTE_PATTERN = /^(?:[A-Za-z]:|\\\\)/;

/** Reason precedence — lower rank wins when several rows name one path. */
const REASON_RANK: Record<ReclaimCandidate["reason"], number> = {
  "adapter-removed": 0,
  "path-renamed": 1,
  deselected: 2,
};

/** Why `path` cannot address a file inside the repo, or `null` when it can. */
function shapeDefect(path: string): string | null {
  if (path === "") return "is empty";
  if (path.includes("\u0000")) return "contains a NUL byte";
  if (path.startsWith("/") || path.startsWith("\\")) return "is an absolute path";
  if (WINDOWS_ABSOLUTE_PATTERN.test(path)) return "is an absolute path";
  if (path.includes("\\")) return "uses a backslash separator (ledger paths are POSIX)";
  if (path.split("/").includes("..")) return "climbs out of the repo with a `..` segment";
  return null;
}

/** Ledger paths are POSIX; a leading `./` is noise, so two spellings of one file
 *  group and match the trusted allowlist as one. */
function ledgerKey(path: string): string {
  return path.startsWith("./") ? path.slice(2) : path;
}

/** The engine's minted prefixes as an operator-readable list, for a refusal that
 *  names what it looked for rather than one arbitrary half of it. */
const ENGINE_PREFIX_LIST = ENGINE_CONTENT_PREFIXES.map((prefix) => `\`${prefix}\``).join(" or ");

/**
 * True when a recorded content hash may stand as proof of authorship for the
 * group's path: every row naming it lies in a state folder or a pack's own
 * folder, or names a platform file or a charter that the caller's trusted
 * allowlist carries.
 *
 * What the hash actually proves is the reason these are admissible — and the
 * reason it is not the whole answer. Every producer records `sha256` of the
 * bytes it WROTE (`sync/engine.ts`, `init/apply.ts`, `pack/install.ts`). For a
 * whole-file writer those bytes are the generated document, so a file that
 * still equals the hash is engine output end to end. For the three client MCP
 * documents they are not: that lane MERGES, so the recorded hash covers
 * emission ∪ the operator's own entries, and equality proves only that nobody
 * has edited the file since. Those paths are declared `coOwnedPaths` by their
 * callers and divert to a class-specific reducer before this proof is
 * consulted — the diversion IS the safety property, because hash equality read
 * as sole authorship unlinked a `.mcp.json` carrying a hand-added server.
 *
 * The bound is what keeps a hash from proving more than the place it sits. It
 * used to be admitted anywhere under `.stamity/`, so a hand-added row hashing
 * an operator's learning or override deleted it; it is now admitted only in
 * the two state folders the engine writes and in a pack's own folder. A content
 * folder is not here at all: there the engine's name has to stand beside the
 * hash (gate 4), because owners keep their own files in those folders too.
 *
 * The allowlist was previously exempt from the NAME gate yet had no way to prove
 * sole ownership at gate 4 unless a managed block spanned the file. That left the
 * engine's block-less whole-file infra — `AGENTS.md`, the plugin container —
 * permanently unreclaimable: `clean` reported success
 * while leaving them behind. Admitting the hash closes that gap without widening
 * anything else, because gate 4 still requires an exact match.
 */
function isHashProvable(group: CandidateGroup, trusted: ReadonlySet<string>): boolean {
  if (group.recordedHashes.size === 0) return false;
  return [...group.kinds].every(
    (kind) =>
      kind === "state" ||
      kind === "pack" ||
      ((kind === "exact" || kind === "charter") && trusted.has(group.path)),
  );
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * True when `bytes` are still the bytes the ledger recorded writing at this
 * path — the raw compare first, then the same compare with every `\r\n` folded
 * to `\n`.
 *
 * The raw compare is the real one: the hash covers exactly what is on disk, so
 * a match is a match without interpretation. The fold exists because a MISS is
 * not on its own evidence of an edit. Every producer records the SHA-256 of the
 * LF string it emitted (`../cli/engine/emissionWrite.ts::sha256`, over content
 * this engine composes with `\n`), so the ledger only ever holds an LF hash —
 * while a checkout under `core.autocrlf=true`, the Git for Windows installer
 * default, hands the reader back the same committed file as CRLF. A line-ending
 * translation the operator never typed must not read as their edit: without the
 * retry, `hashVetoed` fires on a stale engine output that nobody touched and
 * the sweep skips it, so `clean` reports success and leaves the file behind —
 * permanently, because every later sweep reads the same CRLF bytes.
 *
 * The fold narrows nothing else. Bytes that disagree with the record in any
 * other way miss both comparisons and keep the veto, which is why the retry is
 * safe in a lane where a wrong "yes" unlinks a file: it admits exactly one
 * transformation, and one this engine can prove it never authored.
 *
 * `../merge/safeWrite.ts::hasLedgerDrift` makes the same retry for the same
 * reason on the write half — the two hash reads of the ledger agree on what a
 * CRLF checkout means.
 */
function matchesRecordedHash(recorded: ReadonlySet<string>, bytes: Buffer, content: string): boolean {
  if (recorded.has(sha256(bytes))) return true;
  const folded = content.replaceAll("\r\n", "\n");
  return folded !== content && recorded.has(sha256(folded));
}

/**
 * True when the bytes are a rendering the running engine produces at the path
 * — the raw compare, then the CRLF fold, for the reason
 * {@link matchesRecordedHash} gives: every rendering is hashed over the LF text
 * the engine composes, and a `core.autocrlf` checkout of it is still its bytes.
 */
function matchesRendering(renderings: ReadonlySet<string> | undefined, bytes: Buffer, content: string): boolean {
  if (provenByRendering(sha256(bytes), renderings)) return true;
  const folded = content.replaceAll("\r\n", "\n");
  return folded !== content && provenByRendering(sha256(folded), renderings);
}

/** True when `candidate` is `root` or sits underneath it. */
function isWithin(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
}

// ── Candidate grouping ─────────────────────────────────────────────────────

/** The rows naming one path, collapsed into the single filesystem action they
 *  authorise between them. */
interface CandidateGroup {
  path: string;
  reason: ReclaimCandidate["reason"];
  /** `reason (adapter)` labels in ledger order, deduplicated. */
  owners: string[];
  /**
   * The distinct `contentHash` values the rows recorded for this path. Matching
   * any one of them proves the engine wrote the bytes on disk: co-owners record
   * what each of them last wrote, so agreement with any owner is agreement.
   */
  recordedHashes: Set<string>;
  /**
   * Where each row naming this path falls in the owned-path bound — `null` for
   * a row outside it, which refuses the whole path at gate 1.
   */
  kinds: Set<OwnedPathKind | null>;
}

/**
 * Collapse candidates to one group per path, preserving first-appearance order.
 * A path several adapters emitted yields several rows — and one action.
 */
function groupByPath(candidates: readonly ReclaimCandidate[]): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();
  for (const candidate of candidates) {
    const path = ledgerKey(candidate.entry.path);
    const label = `${candidate.reason} (${candidate.entry.adapter})`;
    const hash = candidate.entry.contentHash;
    const kind = ownedPathKind({ ...candidate.entry, path });
    const existing = groups.get(path);
    if (existing === undefined) {
      groups.set(path, {
        path,
        reason: candidate.reason,
        owners: [label],
        recordedHashes: new Set(hash === undefined ? [] : [hash]),
        kinds: new Set([kind]),
      });
      continue;
    }
    if (!existing.owners.includes(label)) existing.owners.push(label);
    if (hash !== undefined) existing.recordedHashes.add(hash);
    existing.kinds.add(kind);
    if (REASON_RANK[candidate.reason] < REASON_RANK[existing.reason]) {
      existing.reason = candidate.reason;
    }
  }
  return [...groups.values()];
}

// ── Planning ───────────────────────────────────────────────────────────────

/**
 * What gate 3 observed, carried to the mutation step so it can prove the file
 * it is about to unlink is the file the gates cleared.
 *
 * The gates decide against a path; the syscall acts on a path; and a path is a
 * lookup that another writer can re-aim in between by swapping a directory on
 * it for a symlink. Identity is what closes the gap: (dev, ino) names the
 * OBJECT, so re-reading it at mutation time answers "is this still the thing I
 * checked?" — a question the path alone cannot answer.
 */
interface TargetPin {
  /** The symlink-resolved parent directory the gates cleared. */
  parentReal: string;
  /** (dev, ino) of that directory when it was cleared. */
  parentIdentity: DirectoryIdentity;
  /** (dev, ino) of the candidate file itself when it was inspected. */
  fileIdentity: DirectoryIdentity;
}

/** The action gates 1-4 selected, with everything the mutation step needs. */
type ReclaimPlan =
  | { kind: "delete"; target: string; pin: TargetPin; detail: string; proof: ReclaimProof; backup?: string }
  | {
      /** Rewrite in place, preserving `keep`. Both rewrite dispositions land
       *  here; `action` is which of the two the report names. */
      kind: "strip";
      action: "managed-block-stripped" | "co-owned-reduced";
      target: string;
      pin: TargetPin;
      keep: string;
      detail: string;
      proof: ReclaimProof;
      /**
       * The file's current bytes, when the mutation owes a verified `.bak` of
       * them first: a co-owned document whose bytes no longer hash to what the
       * ledger recorded. Its reducer proves ownership per top-level entry and
       * cannot see a row of the operator's inside an entry the engine owns, so
       * the drift is the only evidence such a row exists — and the write lanes'
       * rule applies: touched behind a backup, never silently.
       */
      backup?: string;
    }
  | {
      kind: "skip";
      action: "skipped-user-content" | "skipped-unsafe-path" | "skipped-missing";
      detail: string;
      /** A co-owned document's reducer refused it ({@link ReclaimActionEntry.refused}). */
      refused?: true;
      /** The rendering proof could not be built ({@link ReclaimActionEntry.unproven}). */
      unproven?: true;
    };

interface SweepContext {
  /** Symlink-resolved repo root. */
  root: string;
  /** Symlink-resolved state directory; the parent prune stops here. */
  stateDir: string;
  trusted: ReadonlySet<string>;
  coOwned: ReadonlyMap<string, CoOwnedReducer>;
  /** {@link ReclaimOptions.renderings}; empty when none were handed in. */
  renderings: ReadonlyMap<string, ReadonlySet<string>>;
  /** {@link ReclaimOptions.renderingsUnbuilt}. */
  renderingsUnbuilt: string | undefined;
}

/**
 * The hard-link refusal for a co-owned document — the same primitive gate 4
 * refuses on the managed-block strip lane, in this lane's vocabulary.
 *
 * Keeping the operator's entries means republishing them through temp+rename,
 * which lands a fresh inode at this name: the repo's name for the bytes stops
 * being the outside twin and becomes an independent copy of it. On a client MCP
 * document that copy carries whatever credential references the operator put
 * there, inside the tree, where the next commit picks it up.
 */
const CO_OWNED_SHARED_NAME_REFUSAL =
  "The path is a hard link, so the entries this document holds carry a second name this tree " +
  "cannot see and which may sit outside it. Removing the engine's own entries means rewriting " +
  "what is left, which would publish it as an independent copy rather than editing the file " +
  "both names share, so nothing was touched. Replace it with a regular file — copy the contents " +
  "to a new file and move that over this name — or edit it by hand.";

function errnoCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | null | undefined)?.code;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function skip(action: Extract<ReclaimPlan, { kind: "skip" }>["action"], detail: string): ReclaimPlan {
  return { kind: "skip", action, detail };
}

/** Run gates 1-4 for one candidate path. Reads only; never mutates. */
async function planFor(group: CandidateGroup, ctx: SweepContext): Promise<ReclaimPlan> {
  const path = group.path;
  const defect = shapeDefect(path);
  if (defect !== null) {
    return skip(
      "skipped-unsafe-path",
      `The recorded path ${defect}, so the sweep will not resolve it against the repo root.`,
    );
  }
  // The second fence of the owned-path bound (gate 1): a row outside it never
  // reaches the disk, whoever built the candidate.
  if (group.kinds.has(null)) {
    return skip(
      "skipped-unsafe-path",
      "The recorded path lies outside the paths the engine writes for the row's owner and artifact type, so no ledger row can authorise acting on it.",
    );
  }

  // Provisional: the engine's own name, which gate 4 still needs a matching
  // recorded hash beside before it unlinks anything.
  const engineNamed = hasEngineMintedName(path);
  // Provisional, exactly like `hashProvable` below: enough to keep the sweep
  // reading, never enough to unlink. A prefixed directory that is not a skill
  // container is a name the USER may have chosen, and it says nothing about the
  // file inside it, so the bytes have to close the claim at gate 4 — a managed
  // block spanning the file, or a matching recorded hash.
  const prefixedAncestor = path.split("/").slice(0, -1).some(carriesEngineMintedPrefix);
  // Provisional: the recorded hash still has to match the bytes below.
  const hashProvable = isHashProvable(group, ctx.trusted);
  if (!engineNamed && !prefixedAncestor && !hashProvable && !ctx.trusted.has(path)) {
    return skip(
      "skipped-unsafe-path",
      `\`${basename(path)}\` carries no ${ENGINE_PREFIX_LIST} ownership marker on itself or on an engine-minted skill directory above it, records no content hash admissible for its location, and is not on the trusted allowlist, so the engine cannot claim to have written it.`,
    );
  }

  const recordedTarget = resolve(ctx.root, path);
  // The bound is lexical: a committed directory link inside the folder the row
  // claims would carry the file's real parent out of it, and a hash admissible
  // in `.stamity/generated/` would then delete in `.stamity/learnings/`. So the
  // resolved parent has to stay inside the resolved folder, which still lets a
  // content root that is itself an in-repo alias (`.cursor/rules -> shared/rules`)
  // reclaim through the alias.
  const folder = ownedFolderOf(path);
  // The engine's own folders — `.stamity/`, a state folder, a pack's folder —
  // are never links, and a hash alone proves a delete there, so a link anywhere
  // on that chain would aim the proof at whatever it points to. Each segment is
  // read with `lstat`; a content root keeps its in-repo alias, which the check
  // above already holds the parent inside.
  const engineChain =
    folder !== null && folder.startsWith(`${STATE_DIR}/`) ? folder.slice(0, -1).split("/") : [];
  let parentReal: string;
  let parentIdentity: DirectoryIdentity;
  let folderReal: string | null = null;
  let linkedSegment: string | null = null;
  try {
    parentReal = await realpath(dirname(recordedTarget));
    parentIdentity = await readDirectoryIdentity(parentReal);
    if (folder !== null) folderReal = await realpath(resolve(ctx.root, folder));
    for (let depth = 1; depth <= engineChain.length && linkedSegment === null; depth++) {
      const segment = engineChain.slice(0, depth).join("/");
      if ((await lstat(resolve(ctx.root, segment))).isSymbolicLink()) linkedSegment = segment;
    }
  } catch (err) {
    if (errnoCode(err) === "ENOENT") {
      return skip("skipped-missing", "The parent directory is already gone.");
    }
    return skip(
      "skipped-unsafe-path",
      `The parent directory could not be resolved: ${describeError(err)}.`,
    );
  }
  if (!isWithin(parentReal, ctx.root)) {
    return skip(
      "skipped-unsafe-path",
      `The parent directory resolves to ${parentReal}, outside the repo root — a symlinked directory on the path.`,
    );
  }
  if (linkedSegment !== null) {
    return skip(
      "skipped-unsafe-path",
      `\`${linkedSegment}\` is a symbolic link. The engine's own state and pack folders are never links, so a row under one cannot name a file the engine wrote.`,
    );
  }
  if (folderReal !== null && !isWithin(parentReal, folderReal)) {
    return skip(
      "skipped-unsafe-path",
      `The parent directory resolves to ${parentReal}, outside ${folderReal}, the folder the row's path lies in — a symlinked directory inside that folder, so this is not a file the row can name.`,
    );
  }
  // Every syscall from here on addresses the RESOLVED parent rather than the
  // recorded spelling, so a symlinked directory that was on the path is behind
  // us: the remaining exposure is a swap of the resolved directory itself,
  // which the identity pin catches at mutation time.
  // `lastIndexOf` + 1 is total: a path with no separator yields index 0 and the
  // whole string, so there is no "no final segment" case to defend against.
  const name = path.slice(path.lastIndexOf("/") + 1);
  const target = join(parentReal, name);
  // The segments the row spells below its bound folder — a skill's container
  // and its files, or a rule's own name — or the file's name alone at a path
  // the bound names by itself. Each is read off its own folder's listing.
  const below = folder === null ? [name] : path.slice(folder.length).split("/");
  const listingRoot = folderReal ?? parentReal;

  let stats;
  let misspelt: string | null = null;
  try {
    stats = await lstat(target);
    for (const [depth, entry] of below.entries()) {
      if (!(await readdir(join(listingRoot, ...below.slice(0, depth)))).includes(entry)) {
        misspelt = entry;
        break;
      }
    }
  } catch (err) {
    if (errnoCode(err) === "ENOENT") return skip("skipped-missing", "Already absent from disk.");
    return skip("skipped-unsafe-path", `The file could not be inspected: ${describeError(err)}.`);
  }
  if (stats.isDirectory()) {
    return skip(
      "skipped-unsafe-path",
      "A directory occupies the recorded path; the sweep unlinks files only and never removes a tree.",
    );
  }
  if (stats.isSymbolicLink()) {
    return skip(
      "skipped-unsafe-path",
      "The path is a symbolic link; the engine emits regular files, so this is not the file that was recorded.",
    );
  }
  if (!stats.isFile()) {
    return skip("skipped-unsafe-path", "The path is not a regular file.");
  }
  // A case-insensitive volume (APFS and NTFS by default) answers the row's
  // spelling with an entry spelled otherwise, so a hashed row `stamity-notes.md`
  // would reach an owner's `Stamity-Notes.md`, and `skills/st-foo/SKILL.md` an
  // owner's `skills/St-Foo/SKILL.md` — the engine's name sits on the container
  // there. Each folder's own listing is the spelling on disk, and the row has to
  // name every segment below its bound folder exactly.
  if (misspelt !== null) {
    return skip(
      "skipped-unsafe-path",
      `No entry in its folder is spelled exactly \`${misspelt}\`: the file system matched the recorded name to an entry spelled otherwise (a case-insensitive volume), so this is not the file the row records.`,
    );
  }
  const pin: TargetPin = {
    parentReal,
    parentIdentity,
    fileIdentity: { dev: stats.dev, ino: stats.ino },
  };

  // Read as bytes so the recorded-hash compare sees exactly what is on disk;
  // the text view below is a decode of the same read, never a second one.
  let bytes: Buffer;
  try {
    bytes = await readFile(target);
  } catch (err) {
    if (errnoCode(err) === "ENOENT") {
      return skip("skipped-missing", "Removed between the inspection and the read.");
    }
    return skip(
      "skipped-unsafe-path",
      `The file could not be read, so its ownership stayed unproven: ${describeError(err)}.`,
    );
  }

  const content = bytes.toString("utf-8");

  // Co-owned documents settle here, AHEAD of the hash proof, because for them a
  // match is not the proof it is everywhere else: their recorded hash covers the
  // merged bytes, so it says "unedited since", not "mine alone" (gate 4). The
  // reducer is handed the decoded bytes and answers what should be left of them.
  const reduce = ctx.coOwned.get(path);
  if (reduce !== undefined) {
    const reduction = reduce(content);
    if (reduction.kind === "untouched") {
      return { kind: "skip", action: "skipped-user-content", detail: reduction.detail, ...(reduction.refused ? { refused: true as const } : {}) };
    }
    // Drifted: the removal takes a verified backup first, as every write lane
    // does. Not a veto on this lane — the reducer already separated what the
    // engine can prove it wrote — but the sign that something it removes may
    // be the operator's. A reducer that proved every unit it removed
    // (`proven`, REQ-FLOW-036) needs no whole-file hash: a key another tool
    // added costs no `.bak`. One that removed a unit outside its bound
    // (`mustBackUp`) takes the backup whatever the hash says. Otherwise the
    // bytes hashing to what the ledger recorded is the proof.
    //
    // A row with no hash proves nothing here either (REQ-PLUGIN-045): every
    // release records one, so a hashless row is not the engine's record of
    // writing these bytes, and neither is the entry record it carries. It
    // reads as drift — the write lane's reading of an empty hash set — so a
    // hand-added row cannot strip or delete an owner's document without the
    // `.bak`, whatever the reducer proves.
    const hashless = group.recordedHashes.size === 0;
    const drifted =
      hashless ||
      reduction.mustBackUp === true ||
      (reduction.proven !== true && !matchesRecordedHash(group.recordedHashes, bytes, content));
    const driftDetail = !drifted
      ? ""
      : hashless
        ? " The row records no content hash, so the bytes cannot be proved the engine's and the entries it removes may be yours; the previous file is backed up first."
        : " The bytes no longer hash to what the ledger recorded writing here, so the engine's entries may carry rows of yours, or one lies outside what it can prove by path; the previous file is backed up first.";
    if (reduction.kind === "engine-only") {
      return {
        kind: "delete",
        target,
        pin,
        detail: reduction.detail + driftDetail,
        proof: "co-owned",
        ...(drifted ? { backup: content } : {}),
      };
    }
    // Same rewrite primitive as the strip lane below, so the same hard-link
    // refusal applies for the same reason — and off the same `lstat`.
    if (isSharedRegularFile(stats)) return skip("skipped-unsafe-path", CO_OWNED_SHARED_NAME_REFUSAL);
    return {
      kind: "strip",
      action: "co-owned-reduced",
      target,
      pin,
      keep: reduction.content,
      detail: reduction.detail + driftDetail,
      proof: "co-owned",
      ...(drifted ? { backup: content } : {}),
    };
  }

  /**
   * A recorded hash that no longer matches the bytes is proof the file CHANGED
   * since the engine wrote it, and it vetoes every delete branch below —
   * including the ones a name alone would have cleared.
   *
   * The veto is not conditional on {@link isHashProvable}. That predicate asks
   * whether a MATCH may stand in for an ownership marker, which is a question
   * about where the file sits; a MISMATCH is a fact about the bytes and is
   * admissible anywhere the hash was recorded at all. Reading the two as one
   * question is what let an engine-named file the user had rewritten reach the
   * unlink: the name cleared gate 2, the hash was ignored because the path was
   * not somewhere a hash could PROVE ownership, and the file went with no
   * backup — under a detail line asserting nothing in it was user-authored.
   *
   * Co-owned documents are settled above and never reach this, deliberately:
   * their recorded hash covers merged bytes, so a mismatch there is the normal
   * state of an operator-edited file rather than evidence about authorship, and
   * their reducer is the class-specific answer.
   */
  const hashMismatchDetail =
    "The bytes no longer hash to what the ledger recorded writing here, so the file has been edited since and is left in place with its changes.";
  const hashMatched =
    group.recordedHashes.size > 0 && matchesRecordedHash(group.recordedHashes, bytes, content);
  const hashVetoed = group.recordedHashes.size > 0 && !hashMatched;

  // At an instruction file or the Copilot setup workflow the match is not
  // enough on its own (REQ-PLUGIN-046): an owner's file sits at the very name
  // the engine writes, and a hand-added row can record the hash of the owner's
  // bytes as easily as of the engine's. There the bytes must also show the
  // engine wrote them; when they do not, the file falls through to the block
  // split below — a block spanning it still proves it, a block beside owner
  // text is stripped, and a block-less file is kept.
  const bytesProveEngine = bytesShowEngineOutput(path, content);
  // Settled before the managed-block split on purpose: bytes identical to what
  // the engine recorded writing leave nothing a user could have authored, so
  // there is no veto for the split to find and no block worth stripping out of
  // a file that is engine output end to end.
  if (hashProvable && hashMatched && bytesProveEngine) {
    // At Cursor's two 1.11.0 guard names the match is not enough either (row
    // 585, REQ-FLOW-038): an owner may keep a script of their own there, and a
    // hand-added row can hash it. The bytes have to be the guard 1.11.0
    // rendered for this setup (`../cli/engine/emissionWrite.ts::engineRenderingsFor`).
    const renderingProof = needsRenderingProof(path);
    if (renderingProof && !matchesRendering(ctx.renderings.get(path), bytes, content)) {
      // Unproven is not disproven (review/61), as for a content folder below.
      if (ctx.renderingsUnbuilt !== undefined) {
        return {
          kind: "skip",
          action: "skipped-user-content",
          detail: `A file at a name Cursor's guards carried up to 1.11.0 is deleted only when its bytes are the guard 1.11.0 rendered for this setup, and the renderings could not be built (${ctx.renderingsUnbuilt}) — the file is kept with its ledger row, and the next sync tries the proof again.`,
          unproven: true,
        };
      }
      return skip(
        "skipped-user-content",
        "The bytes still hash to what the ledger records, but a file at a name Cursor's guards carried up to 1.11.0 is deleted only when its bytes are the guard 1.11.0 rendered for this setup, and these are not (an owner's own script, a guard edited by hand, or one an earlier release wrote) — the file is kept; delete it by hand if it is yours to remove.",
      );
    }
    return {
      kind: "delete",
      target,
      pin,
      detail: renderingProof
        ? "Whole-file engine output: the bytes still hash to what the ledger recorded writing here and are the guard 1.11.0 rendered at this name for this setup, so nothing in the file is user-authored."
        : "Whole-file engine output: the bytes still hash to what the ledger recorded writing here, so nothing in the file is user-authored.",
      proof: "hash",
    };
  }

  const split = splitAtManagedBlock(content, target);
  if (split === null) {
    if (hashVetoed) return skip("skipped-user-content", hashMismatchDetail);
    // Only reachable when the byte proof above failed: the hash matched where a
    // hash is admissible, so nothing else stood between the file and the unlink.
    if (hashProvable && hashMatched) {
      return skip(
        "skipped-user-content",
        "The bytes still hash to what the ledger records, but an instruction file is deleted whole only when its own bytes show the engine wrote it, and these do not — the file is kept; delete it by hand if it is yours to remove.",
      );
    }
    if (engineNamed) {
      // The name alone used to earn the delete, which made a hashless row a
      // delete primitive for any owner file a hand edit gave an engine-looking
      // name. Every release records a hash on every row, so a row without one
      // is not the engine's record of writing here, and the bytes cannot be
      // proved the engine's: the name and a matching hash, together.
      if (!hashMatched) {
        return skip(
          "skipped-unsafe-path",
          "The row records no content hash, so the bytes cannot be proved the engine's; every stamity release records one — remove the row, or delete the file by hand if it is yours to remove.",
        );
      }
      // In a content folder the name and the hash are not enough either (row
      // 560): an owner keeps files under engine-style names there, and a
      // hand-added row records the hash of the owner's bytes as easily as the
      // engine records its own. The bytes have to be a rendering the running
      // engine produces at this path; a copy no rendering proves — an owner's
      // file, or an earlier release's rendering this engine no longer produces —
      // is kept and named.
      const renderingProof = needsRenderingProof(path);
      if (renderingProof && !matchesRendering(ctx.renderings.get(path), bytes, content)) {
        // Unproven is not disproven (review/61): with no rendering built, the
        // bytes were never judged, so the claim stands for the next sync.
        if (ctx.renderingsUnbuilt !== undefined) {
          return {
            kind: "skip",
            action: "skipped-user-content",
            detail: `A file under an engine name in a content folder is deleted only when its bytes are a rendering this engine produces at that path, and that rendering could not be built (${ctx.renderingsUnbuilt}) — the file is kept with its ledger row, and the next sync tries the proof again.`,
            unproven: true,
          };
        }
        return skip(
          "skipped-user-content",
          "The bytes still hash to what the ledger records, but a file under an engine name in a content folder is deleted only when its bytes are a rendering this engine produces at that path, and these are not (an owner's file, or a copy an earlier release rendered) — the file is kept; delete it by hand if it is yours to remove.",
        );
      }
      return {
        kind: "delete",
        target,
        pin,
        detail: renderingProof
          ? "Whole-file engine output: the name is engine-minted, the bytes still hash to what the ledger recorded writing here and are a rendering this engine produces at that path, and there is no managed block whose surroundings could be user-authored."
          : "Whole-file engine output: the name is engine-minted, the bytes still hash to what the ledger recorded writing here, and there is no managed block whose surroundings could be user-authored.",
        proof: "hash",
      };
    }
    return skip(
      "skipped-user-content",
      prefixedAncestor
        ? `\`${basename(path)}\` sits under a directory carrying an engine prefix (${ENGINE_PREFIX_LIST}), but its own name does not and it holds no managed block, so what the engine can claim to have minted is the directory, not this file.`
        : "Trusted shared file with no managed block to strip. The engine never deletes a co-owned file wholesale, so its engine-written entries are left to the class-specific filter.",
    );
  }

  if (!hasOwnerTextOutsideBlock(content, target)) {
    // A block spanning the file normally proves the file is engine output, but
    // a recorded hash that disagrees with the bytes outranks it: something
    // rewrote the block body, and regenerating it is the sync's job, not the
    // sweep's — the sweep would just delete the edit.
    if (hashVetoed) return skip("skipped-user-content", hashMismatchDetail);
    return {
      kind: "delete",
      target,
      pin,
      detail: "The managed block spans the whole file — there are no user bytes outside it.",
      proof: "block",
    };
  }
  // The strip PRESERVES the file's own user bytes and republishes them, which
  // is the one primitive the merge lanes refuse on a shared name: temp+rename
  // lands a fresh inode at the recorded path, so the repo name stops being the
  // outside twin and becomes an independent copy of it, with the block gone from
  // the repo's reading only. Same `lstat`, no second syscall — the tell is
  // `nlink`, and gate 3 above already read it.
  if (isSharedRegularFile(stats)) {
    return skip(
      "skipped-unsafe-path",
      "The path is a hard link, so the bytes outside its managed block carry a second name this tree cannot see and which may sit outside it. Stripping the block would rewrite them as an independent copy rather than removing the block from the file both names share, so nothing was touched. Replace it with a regular file — copy the contents to a new file and move that over this name — or remove the file by hand.",
    );
  }
  const keep = split.before + split.after;
  return {
    kind: "strip",
    action: "managed-block-stripped",
    target,
    pin,
    keep,
    detail: `User content outside the managed block vetoes deletion, so only the block is removed and the remaining ${keep.length} byte(s) are preserved verbatim.`,
    proof: "block",
  };
}

// ── Mutation ───────────────────────────────────────────────────────────────

/**
 * What {@link verifyPinStillHolds} concluded.
 *
 * `missing` is its own verdict rather than folded into `holds`, and the split
 * is what stops the strip lane from RE-CREATING a file. The two mutations read
 * a not-found differently: an unlink can be handed the path and report what it
 * finds, but the strip goes through the atomic writer, whose whole-file write
 * has create semantics — so "vanished" answered as "the pin still holds" wrote
 * the operator's deleted file back to disk and reported it as
 * `managed-block-stripped`.
 */
type PinVerdict =
  | { kind: "holds" }
  | { kind: "missing" }
  | { kind: "refused"; detail: string };

/**
 * Re-prove, in the same tick as the syscall that follows it, that the plan's
 * target is still the object the gates cleared.
 *
 * This is the second half of gate 3, and the half that makes the first half
 * mean anything. Gate 3 runs at plan time; the unlink runs later; and in
 * between, a concurrent writer can replace the parent directory with a symlink
 * so the same path names a file in another tree. Three re-reads close it:
 *
 * - the parent's realpath still resolves to the directory that was cleared and
 *   still sits inside the root (a component swapped for a link fails here);
 * - the parent still has the (dev, ino) it had when it was cleared (the
 *   directory itself swapped for a link fails here);
 * - the target is still a regular, non-symlink file with the same (dev, ino)
 *   the inspection read (the FILE swapped fails here).
 *
 * The window is not zero — no portable Node API deletes relative to a directory
 * fd — but it is now bounded by these three syscalls rather than by everything
 * the sweep does between planning and acting, and every re-aimed path lands in
 * `skipped-unsafe-path` instead of deleting a stranger's file.
 *
 * ENOENT anywhere in the three reads is `missing`, not `holds` and not a
 * refusal: the file is gone, which is neither a safety failure nor a licence to
 * write. The delete lane treats it as "hand the path to the unlink and let that
 * report"; the strip lane must not, because its write would create the file.
 */
async function verifyPinStillHolds(
  target: string,
  pin: TargetPin,
  ctx: SweepContext,
): Promise<PinVerdict> {
  const changed: PinVerdict = {
    kind: "refused",
    detail:
      "The path changed under the sweep between the safety check and the write, so it is no " +
      "longer provably the file the gates cleared. Nothing was touched; re-run once no other " +
      "process is rewriting this tree.",
  };
  try {
    const parentReal = await realpath(dirname(target));
    if (parentReal !== pin.parentReal || !isWithin(parentReal, ctx.root)) return changed;
    const parentNow = await readDirectoryIdentity(parentReal);
    if (!sameDirectoryIdentity(parentNow, pin.parentIdentity)) return changed;
    const stats = await lstat(target);
    if (!stats.isFile() || stats.isSymbolicLink()) return changed;
    if (!sameDirectoryIdentity({ dev: stats.dev, ino: stats.ino }, pin.fileIdentity)) return changed;
    return { kind: "holds" };
  } catch (err) {
    if (errnoCode(err) === "ENOENT") return { kind: "missing" };
    return {
      kind: "refused",
      detail: `The path could not be re-checked before the write, so nothing was done: ${describeError(err)}.`,
    };
  }
}

/**
 * Remove directories left empty by a delete, walking up from the file. Stops at
 * the repo root, at the state directory (which holds the manifest the sweep was
 * driven from), and at the first `rmdir` that fails — ENOTEMPTY means a sibling
 * still lives there, and every other errno is a reason to stop climbing.
 */
async function pruneEmptyParents(target: string, ctx: SweepContext): Promise<void> {
  let dir = dirname(target);
  while (dir !== ctx.stateDir && isWithin(dir, ctx.root) && dir !== ctx.root) {
    try {
      await rmdir(dir);
    } catch {
      return;
    }
    dir = dirname(dir);
  }
}

/** A document that wires hooks, left in place by this sweep, with its text or `null` when it may not be read. */
interface HookDocumentLeft {
  path: string;
  content: string | null;
}

/**
 * The hook documents (`ReclaimOptions.hookDocuments`) on disk once this
 * sweep's documents have settled — every one that exists, not only this
 * sweep's candidates (review/58): one it refused, left untouched or reduced to
 * the owner's entries (read as the sweep wrote it), and one that was no
 * candidate at all — a client still selected whose write this run refused, a
 * document no ledger row names. Each still runs what it names. A candidate
 * this sweep only previewed (`dry-run`) is left out: consent would delete or
 * reduce it. Each comes with its text, or `null` when it is not a regular file
 * this sweep may read (a link, a hard link, a file under a folder that
 * resolves outside the repository, a file it cannot open): such a document is
 * taken to run every engine hook script, since nothing proves it does not. A
 * co-owned document that wires no hooks (an MCP document) holds nothing back,
 * whatever state it is in.
 */
async function hookDocumentsLeftInPlace(
  entries: readonly ReclaimActionEntry[],
  hookDocuments: ReadonlySet<string>,
  root: string,
  afterWrite: ReadonlyMap<string, string>,
): Promise<HookDocumentLeft[]> {
  const previewed = new Set(entries.filter((entry) => entry.action === "dry-run").map((entry) => entry.path));
  const kept: HookDocumentLeft[] = [];
  for (const path of hookDocuments) {
    if (previewed.has(path)) continue;
    const written = afterWrite.get(path);
    if (written !== undefined) {
      kept.push({ path, content: written });
      continue;
    }
    const target = join(root, ...path.split("/"));
    let content: string | null = null;
    try {
      const stat = await lstat(target);
      if (stat.isFile() && stat.nlink === 1 && isWithin(await realpath(dirname(target)), root)) content = await readFile(target, "utf8");
    } catch (err) {
      if (errnoCode(err) === "ENOENT") continue;
    }
    kept.push({ path, content });
  }
  return kept;
}

/** Why a hook script was kept, naming the document and what clears it. */
function keptScriptDetail(holder: HookDocumentLeft): string {
  const consequence =
    "deleting it could leave that hook pointing at nothing, and a guard wired that way fails closed on every tool call.";
  return holder.content === null
    ? `Kept: ${holder.path}, which this sweep left in place, could not be read (a link, a hard link, or a file it ` +
        `cannot open), so nothing proves it no longer runs this script — ${consequence} Replace ${holder.path} with a ` +
        `regular file this sweep can read (or delete it), then re-run.`
    : `Kept: ${holder.path}, which this sweep left in place, still runs this script — ${consequence.replace("could leave", "would leave")} ` +
        `Remove that wiring from ${holder.path}, then re-run.`;
}

// ── Sweep ──────────────────────────────────────────────────────────────────

/**
 * Act on the ledger's reclaim candidates under the safety gates documented at
 * the top of this module. Returns one entry per candidate PATH — rows sharing a
 * path collapse into a single filesystem action — in first-appearance order.
 *
 * Throws `VALIDATION_ERROR` only when `rootDir` itself cannot be resolved, which
 * is a caller error and happens before any candidate is examined; per-candidate
 * failures are reported, never thrown.
 */
export async function sweepReclaimCandidates(
  candidates: readonly ReclaimCandidate[],
  opts: ReclaimOptions,
): Promise<ReclaimReport> {
  const entries: ReclaimActionEntry[] = [];
  const groups = groupByPath(candidates);
  if (groups.length === 0) {
    return { entries, consent: opts.consent, deletedCount: 0, strippedCount: 0, skippedCount: 0 };
  }

  let root: string;
  try {
    root = await realpath(opts.rootDir);
  } catch (err) {
    throw new EngineError(
      `The reclaim sweep cannot resolve the repo root ${opts.rootDir}: ${describeError(err)}. ` +
        `Pass the path of an existing repository root — every ledger path resolves against it, ` +
        `and a sweep with no root to contain it will not run.`,
      { code: "VALIDATION_ERROR", cause: err },
    );
  }
  const ctx: SweepContext = {
    root,
    stateDir: resolve(root, STATE_DIR),
    trusted: opts.trustedExactPaths ?? new Set<string>(),
    coOwned: opts.coOwnedPaths ?? new Map<string, CoOwnedReducer>(),
    renderings: opts.renderings ?? new Map<string, ReadonlySet<string>>(),
    renderingsUnbuilt: opts.renderingsUnbuilt,
  };
  const stamp = (opts.now ?? new Date()).toISOString();

  const sweepOne = async (group: CandidateGroup): Promise<void> => {
    const plan = await planFor(group, ctx);
    const provenance =
      group.owners.length > 1 ? ` Recorded by ${group.owners.join(" and ")}.` : "";
    const base = { path: group.path, candidateReason: group.reason };

    if (plan.kind === "skip") {
      entries.push({
        ...base,
        action: plan.action,
        detail: plan.detail + provenance,
        ...(plan.refused ? { refused: true as const } : {}),
        ...(plan.unproven ? { unproven: true as const } : {}),
      });
      return;
    }
    if (!opts.consent) {
      const verb =
        plan.kind === "delete"
          ? "delete this path"
          : plan.action === "co-owned-reduced"
            ? "remove the engine's own content from this path and keep the rest"
            : "strip the managed block from this path";
      entries.push({
        ...base,
        action: "dry-run",
        detail: `Consent would ${verb}. ${plan.detail}${provenance}`,
        wouldBe: plan.kind === "delete" ? "deleted" : plan.action,
        proof: plan.proof,
      });
      return;
    }
    const verdict = await verifyPinStillHolds(plan.target, plan.pin, ctx);
    if (verdict.kind === "refused") {
      entries.push({ ...base, action: "skipped-unsafe-path", detail: verdict.detail + provenance });
      return;
    }
    if (verdict.kind === "missing" && plan.kind === "strip") {
      // The delete lane falls through on `missing` so the unlink itself reports
      // what it found. The strip lane cannot: its write CREATES, so proceeding
      // would put the operator's deleted file back and call it a strip.
      entries.push({
        ...base,
        action: "skipped-missing",
        detail:
          `Removed between the safety check and the write, so there was nothing to ` +
          `${plan.action === "co-owned-reduced" ? "reduce" : "strip"}; the file was not ` +
          `re-created.${provenance}`,
      });
      return;
    }
    // The backup a drifted co-owned document owes, taken in the same tick as
    // the mutation it precedes and after the pin was re-proved. A backup that
    // cannot be taken — a hard-linked target, a `.bak` name already held —
    // refuses the mutation: the rule is a backup or nothing.
    let backedUp = "";
    if (plan.backup !== undefined) {
      try {
        const bakPath = await backupBeforeOverwrite(plan.target, plan.backup, "reclaim", ctx.root);
        backedUp = ` Your previous file is at ${bakPath}.`;
      } catch (err) {
        entries.push({
          ...base,
          action: "skipped-unsafe-path",
          detail: `The previous file could not be backed up, so nothing was removed: ${describeError(err)}.${provenance}`,
        });
        return;
      }
    }
    if (plan.kind === "delete") {
      try {
        await unlink(plan.target);
      } catch (err) {
        entries.push(
          errnoCode(err) === "ENOENT"
            ? {
                ...base,
                action: "skipped-missing",
                detail: `Removed by another process before the sweep reached it.${provenance}`,
              }
            : {
                ...base,
                action: "skipped-unsafe-path",
                detail: `The unlink failed and the file is still on disk: ${describeError(err)}.${provenance}`,
              },
        );
        return;
      }
      await pruneEmptyParents(plan.target, ctx);
      entries.push({
        ...base,
        action: "deleted",
        detail: `${plan.detail}${backedUp} Deleted at ${stamp}.${provenance}`,
        proof: plan.proof,
      });
      return;
    }
    try {
      // The boundary is passed even though the parent was just re-resolved: the
      // writer re-checks it against its own pin, so the strip cannot land
      // outside the repo even if the directory is swapped after this line.
      await atomicWriteFile(plan.target, plan.keep, { boundaryDir: ctx.root });
    } catch (err) {
      const failure =
        plan.action === "co-owned-reduced"
          ? "The engine's own content could not be removed"
          : "The managed block could not be stripped";
      entries.push({
        ...base,
        action: "skipped-unsafe-path",
        detail: `${failure} and the file is unchanged: ${describeError(err)}.${provenance}`,
      });
      return;
    }
    entries.push({
      ...base,
      action: plan.action,
      detail: `${plan.detail}${backedUp} ${plan.action === "co-owned-reduced" ? "Reduced" : "Stripped"} at ${stamp}.${provenance}`,
      proof: plan.proof,
    });
  };

  // Co-owned documents and hook documents settle first, so a hook script is
  // judged against the documents this sweep leaves in place (S17): one of them
  // still naming the script would be left pointing at nothing, and a guard
  // wired that way fails closed on every tool call.
  const hookDocuments = opts.hookDocuments ?? new Set<string>();
  const reader = opts.hookScripts ?? DEFAULT_HOOK_SCRIPTS;
  const settlesFirst = (group: CandidateGroup): boolean => ctx.coOwned.has(group.path) || hookDocuments.has(group.path);
  for (const group of groups.filter(settlesFirst)) await sweepOne(group);
  const keptDocuments = await hookDocumentsLeftInPlace(entries, hookDocuments, ctx.root, opts.hookDocumentsAfterWrite ?? new Map());
  const wiringKept = new Map<string, { doc: HookDocumentLeft; scripts: string[] }>();
  for (const group of groups) {
    if (settlesFirst(group)) continue;
    const holder = reader.isHookScript(group.path)
      ? keptDocuments.find((doc) => doc.content === null || reader.runs(doc.content, group.path))
      : undefined;
    if (holder === undefined) {
      await sweepOne(group);
      continue;
    }
    const held = wiringKept.get(holder.path) ?? { doc: holder, scripts: [] };
    held.scripts.push(group.path);
    wiringKept.set(holder.path, held);
    entries.push({ path: group.path, candidateReason: group.reason, action: "skipped-user-content", detail: keptScriptDetail(holder) });
  }
  // The report reads in the candidates' own order, whatever order they settled in.
  const order = new Map(groups.map((group, index) => [group.path, index]));
  entries.sort((a, b) => (order.get(a.path) as number) - (order.get(b.path) as number));

  return {
    entries,
    consent: opts.consent,
    ...(wiringKept.size > 0
      ? {
          // In the order the sweep met them, which follows the candidates.
          wiringKept: [...wiringKept.values()].map(({ doc, scripts }) =>
            doc.content === null ? { path: doc.path, scripts, unreadable: true as const } : { path: doc.path, scripts },
          ),
        }
      : {}),
    deletedCount: entries.filter((entry) => entry.action === "deleted").length,
    strippedCount: entries.filter(
      (entry) => entry.action === "managed-block-stripped" || entry.action === "co-owned-reduced",
    ).length,
    skippedCount: entries.filter((entry) => entry.action.startsWith("skipped-")).length,
  };
}

/**
 * Human-readable summary: a headline plus one line per candidate path. Returns
 * the empty string for an empty report so callers can suppress the diagnostic in
 * the common case where nothing was orphaned.
 *
 * Which headline is read off {@link ReclaimReport.consent} — the flag the sweep
 * actually ran under — and never inferred from the entries. Inferring it as
 * "every entry is `dry-run`" made a single gate refusal (an unproven path, a
 * symlink, an already-absent file: the common case) flip a no-consent run into
 * the applied-sweep headline, which both claimed work that never happened and
 * dropped the one line telling the operator how to make it happen. A dry run
 * carrying refusals now states both counts.
 */
export function formatReclaimReport(report: ReclaimReport): string {
  if (report.entries.length === 0) return "";
  const rows = report.entries.map((entry) => `  ${entry.action}  ${entry.path} — ${entry.detail}`);
  if (report.consent) {
    return [
      `Reclaim sweep: ${report.deletedCount} deleted, ${report.strippedCount} rewritten to keep user content, ${report.skippedCount} skipped.`,
      ...rows,
    ].join("\n");
  }
  const planned = report.entries.filter((entry) => entry.action === "dry-run").length;
  const refused = report.entries.length - planned;
  const refusedClause =
    refused === 0 ? "" : ` ${planned} would be acted on, ${refused} refused by a safety gate.`;
  return [
    `Reclaim dry run: ${report.entries.length} orphaned path(s) inspected, nothing written.${refusedClause} Re-run with consent to apply.`,
    ...rows,
  ].join("\n");
}
