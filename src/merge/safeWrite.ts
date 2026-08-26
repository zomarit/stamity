import { constants as FS } from "node:fs";
import type { Stats } from "node:fs";
// `open` is aliased: `readPrefixFrontmatterField` already binds that name to its
// frontmatter-fence cursor, and the local reads better than the import would.
import { lstat, mkdir, open as openFile, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  INJECTION_PATTERNS,
  INVISIBLE_SMUGGLING_CHARS,
  NO_HONEST_SHAPE_INJECTION_ROWS,
  byIndexThenId,
  foldConfusables,
  joinMaskedWords,
  scanForDeniedPatterns,
} from "../denyscan/denyScan.ts";
import type { DenyHit } from "../denyscan/denyScan.ts";
import type { MergeResult } from "../types/content.ts";
import { EngineError } from "../types/errors.ts";
import { MANAGED_BLOCK_VARIANTS, getMarkersForPath } from "../types/markers.ts";
import {
  acquireWriteLock,
  assertWriteTargetContained,
  atomicWriteFileUnlocked,
  isSharedRegularFile,
  resolveNonClobberingBakPath,
  verifyBackup,
} from "./atomicWrite.ts";
import type { AtomicWriteOptions } from "./atomicWrite.ts";
import { mapFsErrno } from "./fsErrors.ts";
import {
  extractCustomContent,
  hasManagedBlock,
  insertManagedBlock,
  isHealableManagedPrefix,
  isManagedBlockStale,
  splitAtManagedBlock,
  wouldChangeMarkerVariant,
} from "./managedBlocks.ts";

/**
 * Merge decision engine over the atomic substrate in `./atomicWrite.ts`. This
 * module decides WHAT bytes a managed write should produce; the substrate
 * decides how they land on disk.
 *
 * Four dispositions, one vocabulary — `created` | `updated` | `unchanged` |
 * `skipped` — produced by {@link safeWriteFile} at write time and predicted
 * byte-for-byte by {@link predictMergeAction} for dry-run surfaces, so a
 * preview never disagrees with the run it previews.
 *
 * Invariants the branches below uphold:
 *
 * - **User content is never destroyed silently.** Every byte outside the
 *   managed block survives a merge verbatim, and each path that must overwrite
 *   user bytes (marker corruption repair, `force` on an unmanaged file) takes a
 *   size+SHA-256-verified `.bak` first and names it in the returned warning.
 * - **Only-when-stale.** A block whose stamped version is semver-equal
 *   to `options.version` and whose body is otherwise identical is reported
 *   `unchanged` and not rewritten — no mtime bump, no diff churn.
 * - **User-side content is untrusted, and must be the file's own.** Content the
 *   merge would PRESERVE next to engine-authored output passes
 *   {@link refusePreservedContent} first: bytes reached through a symlinked OR
 *   hard-linked `filePath` are refused before the merge can write them back into
 *   the tree as a regular file — the hard link's second name is invisible to
 *   `isSymbolicLink()`, so it is read off `nlink` instead
 *   ({@link isSharedRegularFile}). What survives that is deny-scanned on
 *   NORMALISED copies, plus one raw pass for the rows normalisation would
 *   launder (see {@link blockingDenyHits}). A block-severity hit refuses the
 *   whole write with `INTEGRITY_ERROR` and leaves the file untouched. The
 *   managed body itself is engine-authored and is not a scan target.
 * - **One critical section per write.** The path's lock is held across the full
 *   read-merge-write, so the decision is never computed from a pre-lock read.
 * - **The bytes land where the path says.** The path is normalised at entry and
 *   containment-checked before the first `mkdir`, so neither a symlinked
 *   directory component nor a `..` the kernel resolves differently than
 *   `path.resolve` can redirect generated output into another tree. The `.bak`
 *   sibling this module DERIVES is held to the same rule
 *   ({@link backupBeforeOverwrite}). `boundaryDir` states the tree exactly when
 *   the caller knows it; omitting it narrows the rule, never disables it
 *   (`atomicWrite.ts::assertWriteTargetContained`).
 */

/** The disposition vocabulary shared by the writer and its predictors. */
export type MergeAction = MergeResult["action"];

/** Options accepted by {@link safeWriteFile} and mirrored by {@link predictMergeAction}. */
export interface SafeWriteFileOptions {
  /**
   * Engine-authored body to merge into the file's managed block. Its presence
   * selects the managed-merge lane; without it the write is whole-file.
   */
  managedContent?: string;
  /** Prepend a fresh managed block above a marker-less existing file instead of skipping it. */
  appendIfNoBlock?: boolean;
  /** Overwrite an existing file whose name is not engine-managed. */
  force?: boolean;
  /**
   * Take a verified `.bak` before a `force` overwrite of unmanaged content.
   * Default true. Set false only for engine-owned, machine-local, regenerable
   * state, where the copy is litter rather than protection.
   */
  backup?: boolean;
  /**
   * Return `unchanged` instead of rewriting when the computed bytes already
   * match what is on disk. Default true — this is what makes a redundant sync
   * a no-op rather than an mtime bump.
   */
  skipIfUnchanged?: boolean;
  /** Engine version stamped into the BEGIN marker; drives the only-when-stale compare. */
  version?: string;
  /**
   * Paths the ownership ledger records as engine-written, built with
   * {@link ledgerPathSet} — the authority {@link isManagedPath} consults first.
   * Pass it whenever a manifest is loaded.
   *
   * Without it, the only ownership proof left is a managed block in the file's
   * own bytes, which every generated artifact named by its platform rather than
   * by the engine lacks: `AGENTS.md` carries one, `.claude/settings.json`,
   * `.cursor/hooks.json`, the plugin container and the other whole-file JSON
   * outputs do not. Those then classify as unproven on the second write and
   * refuse to update without `force` — i.e. the engine cannot maintain its own
   * output. That is the safe half of the trade (a refusal, not a silent
   * overwrite), but it is a degraded mode, not a supported one.
   */
  ledgerPaths?: ReadonlySet<string>;
  /**
   * Absolute directory every byte of this write must land inside — the repo
   * root, for a caller that emits into one. Pass it whenever the caller knows
   * its root: it is the exact containment answer, and it supersedes the
   * structural default below.
   *
   * Omitting it does NOT switch containment off. Without a boundary the
   * substrate still refuses any write whose path is re-aimed by a symlinked
   * directory component pointing out of the directory that holds it, so an
   * emission path cannot silently opt out of the guarantee the module
   * advertises. See `atomicWrite.ts::assertWriteTargetContained`.
   */
  boundaryDir?: string;
}

/**
 * The substrate options a merge write carries. Built rather than spread so an
 * absent boundary passes NO property at all — `exactOptionalPropertyTypes`
 * distinguishes "unset" from "explicitly undefined", and the substrate reads
 * the difference as two different containment policies.
 */
function atomicOptions(boundaryDir: string | undefined): AtomicWriteOptions | undefined {
  return boundaryDir === undefined ? undefined : { boundaryDir };
}

function errnoCode(err: unknown): string | undefined {
  const code = (err as NodeJS.ErrnoException | null | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** File content, or `null` when the file does not exist. Other errnos propagate.
 *  Follows a symlink like every other read — {@link entryStat} is what tells the
 *  callers whether the bytes they just read are the file's own. */
async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch (err) {
    if (errnoCode(err) !== "ENOENT") throw err;
    return null;
  }
}

/**
 * The path's OWN directory entry — `lstat`, so a symbolic link is reported as
 * the link rather than as whatever it points at. Every decision in this module
 * that turns on "is this file really this file" reads it: a link is a name for
 * bytes the tree does not own, and both the merge and the backup have to say so
 * before those bytes move.
 */
async function entryStat(filePath: string): Promise<Stats> {
  try {
    return await lstat(filePath);
  } catch (err) {
    throw mapFsErrno(err, filePath) ?? err;
  }
}

/**
 * THE SHARED-NAME POLICY. The predicate itself is
 * {@link isSharedRegularFile} — a fact read off a directory entry, kept in the
 * substrate (`./atomicWrite.ts`) so every layer that needs it can reach it
 * without reaching into this module's merge decisions. What lives here is what
 * the fact MEANS for a write: which lanes refuse, which harms the refusal
 * prevents, and why refusing beats warning. Read this before adding a caller.
 *
 * Left unguarded, a planted `AGENTS.md` hard-linked to `~/.ssh/id_ed25519`
 * reaches the merge as an ordinary file and comes back out with the block
 * prepended above the key. What the merge does NOT do is publish the key: git
 * cannot tell a hard link from a regular file, so `git add -A` stages the
 * planted name whether or not a sync ever runs. Repo-path publication is the
 * plant's own achievement, and a guard sold as preventing it would be claiming
 * a protection it cannot deliver.
 *
 * The three incremental harms are the engine's own, and they are what this
 * guard is for. **The split:** temp+rename publishes a fresh inode, so the merge
 * silently converts this tree's name for the bytes into an INDEPENDENT copy of
 * them — the operator who linked the two files still believes editing one edits
 * both, and the repo now holds a snapshot of a key that no longer tracks the
 * original. (Mode was listed here until the substrate started carrying an
 * existing file's bits onto its replacement — `./atomicWrite.ts::existingFileMode`
 * — which retires the `0600` key landing `0644` on this lane and on every
 * ordinary single-named file with it. The split is what remains, and no mode
 * bit addresses it.) **A second name:**
 * the `.bak` lane copies the same bytes to a derived sibling that no
 * `.gitignore` entry written for the planted path covers and no reviewer
 * grepping for that path sees. **Console:** the deny scan runs on what it read
 * and its refusal quotes snippets, printing key material into terminal
 * scrollback and CI logs one step short of disk — which is why
 * {@link refusePreservedContent} refuses ahead of the scan rather than after it.
 *
 * POSTURE — refuse the write. The alternative considered was
 * warn-and-continue: emit the shared-name warning and merge anyway, which costs
 * nothing on the false-positive tail (hard-link-based caches, `cp -l` checkouts,
 * some package stores) but leaves the exfil open by default and silent. Refusing
 * is the conservative half and is what ships, because the tail is narrow on the
 * paths this engine writes — charter, agent and rule documents, not a package
 * store — and it costs a user one copy-and-move, not their data. The guard fires
 * only on the lanes that PRESERVE or COPY the file's own bytes; the lanes that
 * REPLACE them keep writing, exactly as they do over a terminal symlink, since
 * temp+rename publishes a new inode and leaves the other name intact. Revisit
 * with a measured false-positive rate, not a hunch.
 *
 * The preserve-and-republish shape is not confined to this module, and each site
 * that has it reads `nlink` through the ONE substrate predicate rather than
 * growing its own spelling of `nlink > 1` and drifting from this rationale. The
 * consumers by name: this module's merge and backup guards, the reclaim sweep's
 * strip lane (`./reclaim.ts`), the MCP ownership merge
 * (`../manifest/mcpFilter.ts::refuseLinkedMcpTarget`), which keeps an existing
 * document's non-server top-level fields verbatim beside the emitted
 * `mcpServers` block and republishes the pair, and the sync plan's whole-file
 * row (`../cli/commands/sync/engine.ts`), which previews the refusal the backup
 * will raise.
 *
 * That is the consumer list, not a proof that no unguarded site is left — a
 * count of sites is a claim this policy cannot make about callers it does not
 * see, and the last time one was made an unguarded site was already live behind
 * it. What replaces the count is placement: each consumer guards the function
 * every writer of its class passes through, not the entry points someone
 * enumerated. `mcpFilter.ts` is the worked example — `sync` had its own check
 * and `init` did not, and moving the guard into the shared writer closed the
 * caller that was missed along with the callers not yet written.
 */

// ── Deny refusal ───────────────────────────────────────────────────────────

/**
 * Block-severity findings in `userContent`. Four scans, unioned, because each
 * one alone is evadable:
 *
 * - **Invisible-stripped.** `ig<ZWSP>nore all previous instructions` is one word
 *   to a reader and two fragments to a regex, and the default deny set carries
 *   no invisible-character detector — that row lives in `INJECTION_PATTERNS`. A
 *   raw scan here let every default-ignorable and format code point through with
 *   no error AND no warning. Same stripped-copy read the pack, handoff,
 *   learnings and user-content gates already do.
 * - **Confusable-folded, on top of the stripped copy.** NFKC plus the
 *   cross-script table reduce fullwidth, mathematical-alphanumeric and
 *   Cyrillic-lookalike spellings to the ASCII they impersonate.
 * - **Word-joined, on top of the folded copy.** The masking character that is
 *   neither invisible nor in the fold table — a combining mark, a script letter
 *   the table does not carry — is dropped where it touches a word, so
 *   `ig<U+0307>nore all findings` is scored as `ignore all findings`. Without it
 *   a mask evades every row the two proximity detectors do not anchor on, which
 *   is most of the set: those anchor on six override words within 20 characters,
 *   and they are advisory rows this gate does not refuse on anyway.
 * - **Raw, for the rows normalisation must not reach.**
 *   {@link NO_HONEST_SHAPE_INJECTION_ROWS} is scored on the untouched text,
 *   because the strip class deliberately KEEPS the Unicode tag block so
 *   `unicode-tag-smuggling` can refuse it. Scanning only the normalised copies
 *   with the default set inherited both halves of that pairing as a hole: the
 *   splitter was never removed, so `ig<U+E0041>nore all previous instructions`
 *   never rejoined for the default set, and the row that refuses the splitter
 *   was never consulted — one invisible code point neutralised every phrase in
 *   the set, on bytes the user-content and pack gates already refuse. The rest
 *   of `INJECTION_PATTERNS` stays out: those rows have honest authoring shapes
 *   (a documented `{{token}}`, a quoted `System:` line) and refusing a sync over
 *   one would cost this gate its credibility.
 *
 * The stripped/folded union is the fold's documented consumer contract, not
 * belt-and-braces: NFKC composes a trailing combining mark into the letter
 * before it, so `...instructions<U+0301>` is a hit on the stripped copy and
 * clean on the folded one. Scanning folded ALONE would hand back a
 * one-code-point evasion of every keyword.
 *
 * Indexes belong to the copy each hit was found on and no longer index the file
 * — which is why one hit per (pattern, offset) is kept: an ASCII payload matches
 * identically on both copies and would otherwise read as two separate findings.
 * The union is re-sorted with the scanner's own comparator, since three sorted
 * scans concatenated are not one sorted list.
 *
 * Warn-severity hits are diagnostics for other gates and never refuse a write.
 * Neither the default set nor the kept raw rows carry one, so the severity cut
 * is a filter over the union rather than a per-hit branch on a case those sets
 * cannot produce.
 */
function blockingDenyHits(userContent: string): DenyHit[] {
  const stripped = userContent.replace(INVISIBLE_SMUGGLING_CHARS, "");
  const folded = foldConfusables(stripped);
  const joined = joinMaskedWords(folded);
  const scanned = [
    ...scanForDeniedPatterns(stripped),
    ...(folded === stripped ? [] : scanForDeniedPatterns(folded)),
    ...(joined === folded ? [] : scanForDeniedPatterns(joined)),
    ...scanForDeniedPatterns(userContent, INJECTION_PATTERNS).filter((hit) =>
      NO_HONEST_SHAPE_INJECTION_ROWS.has(hit.patternId),
    ),
  ];
  const seen = new Set<string>();
  const hits: DenyHit[] = [];
  for (const hit of scanned.filter((candidate) => candidate.severity === "block")) {
    // Written as an escape, not a literal, so the byte is visible in a diff.
    // A raw NUL here made this module read as binary to `file(1)`, which is
    // enough for `grep` to skip it silently — the write gate and the merge
    // decision engine dropping out of a source-wide search with no error.
    const key = `${hit.patternId}\u0000${hit.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(hit);
  }
  return hits.toSorted(byIndexThenId);
}

/**
 * Refusal message for block-severity hits, or `null` when the slice is clean.
 * Single-sourced so {@link predictDenyRefusal} previews the exact string
 * {@link safeWriteFile} throws.
 */
function denyRefusalMessage(filePath: string, userContent: string): string | null {
  const hits = blockingDenyHits(userContent);
  if (hits.length === 0) return null;
  const findings = hits
    .map((hit) => `${hit.patternId} at offset ${hit.index} (${JSON.stringify(hit.snippet)})`)
    .join("; ");
  return (
    `Refusing to write ${filePath}: ${hits.length} prompt-injection pattern(s) found in the ` +
    `content outside the managed block, which this write would preserve next to ` +
    `engine-authored output: ${findings}. Remove or rewrite the flagged text, then re-run. ` +
    `Do not move it inside the STAMITY:BEGIN/END markers — the managed block is regenerated on ` +
    `every sync, which deletes whatever is placed inside it.`
  );
}

function refuseMergeIntoLink(filePath: string): EngineError {
  return new EngineError(
    `Refusing to merge into ${filePath}: it is a symbolic link, so the content this merge would ` +
      `keep beside the generated block is not this file's — it is whatever the link points at, ` +
      `including a file outside this tree that was never yours to publish. Merging would write ` +
      `those bytes into the tree as a regular file, where the next commit picks them up. Nothing ` +
      `was written. Replace the link with a regular file, or delete it and re-run to regenerate ` +
      `the file.`,
    { code: "FS_ERROR" },
  );
}

/**
 * Hard-link twin of {@link refuseMergeIntoLink} — same lane, same register, the
 * shape `isSymbolicLink()` cannot see. See {@link isSharedRegularFile}.
 *
 * States the rewrite harm and NOT the `.bak` one, which belongs to
 * {@link refuseBackupOfSharedFile}: every path that throws this error refuses
 * ahead of any backup — {@link mergeManagedContent} gates on
 * {@link refusePreservedContent} at both of its preserve points before it can
 * reach {@link backupBeforeOverwrite}, and {@link repairTruncatedBlock} does the
 * same — so this lane never produces a `.bak` for the message to name. Keeping
 * the two texts distinct is what lets an operator read which gate fired.
 */
function refuseMergeIntoSharedFile(filePath: string): EngineError {
  return new EngineError(
    `Refusing to merge into ${filePath}: it is a hard link — this file shares its contents with ` +
      `another name, which this tree cannot see and which may sit outside it, so the content this ` +
      `merge would keep beside the generated block is not this file's alone. Git reads a hard ` +
      `link as an ordinary file, so these bytes are already committable under this name; what ` +
      `merging adds is a rewrite of them as a fresh independent file, so this name stops being ` +
      `the same file as the other one and starts being a copy of it. Nothing was written. ` +
      `Replace it with a regular file before syncing — copy the contents to a new file and move ` +
      `that over this name — or delete it and re-run to regenerate the file.`,
    { code: "FS_ERROR" },
  );
}

/**
 * Gate on bytes the merge is about to PRESERVE beside engine-authored output.
 * Every branch that keeps user content passes through here, and there are two
 * conditions on those bytes, checked in this order:
 *
 * 1. **They are this file's own.** A `filePath` that is a symlink names bytes
 *    the tree does not own, and every merge lane preserves what it read: a
 *    planted `AGENTS.md -> ~/.ssh/id_ed25519` gets the block prepended above the
 *    key and the pair written back as a REGULAR file at the repo path, so a
 *    later `git add -A` publishes the key — one flagless `sync`, no backup
 *    involved. This is the read direction {@link backupBeforeOverwrite} refuses
 *    for the `.bak`, stated on the half that takes no backup to inherit it from.
 *    The whole-file lanes need no equivalent: the one that backs up refuses
 *    there, and the rest replace the link with generated bytes and preserve
 *    nothing — the substrate's terminal-symlink contract, deliberately kept.
 *    A HARD link is the same attack with no symlink bit to test for, refused on
 *    the same footing ({@link isSharedRegularFile}, same posture).
 * 2. **They carry no block-severity injection pattern** ({@link denyRefusalMessage}).
 *
 * The order is load-bearing in both directions. A refusal message quotes
 * snippets of what it scanned, so deny-scanning link-read bytes would print the
 * target's contents to the console — the same leak one step short of disk. And a
 * link whose target happens to be clean must still refuse.
 */
async function refusePreservedContent(filePath: string, userContent: string): Promise<void> {
  // One `lstat`, both shapes: a link is one name for bytes the tree does not
  // own, a hard link is a second name for them, and the ordering rationale below
  // (refuse before the deny scan quotes what it read) applies to each.
  const entry = await entryStat(filePath);
  if (entry.isSymbolicLink()) throw refuseMergeIntoLink(filePath);
  if (isSharedRegularFile(entry)) throw refuseMergeIntoSharedFile(filePath);
  const message = denyRefusalMessage(filePath, userContent);
  if (message !== null) throw new EngineError(message, { code: "INTEGRITY_ERROR" });
}

/**
 * A refusal {@link refusePreservedContent} would raise, and WHICH of its two
 * conditions raised it. The class is what a planning surface needs to state a
 * remedy: `deny-scan` has flagged text and a fix for it, `shared-name` has
 * neither — and neither class is cleared by `force`, for different reasons: on
 * this lane {@link refusePreservedContent} throws before a forced write can
 * reach a backup at all, while the whole-file spelling of the same plant is
 * refused one step later, inside {@link backupBeforeOverwrite}. A caller that
 * prints only the message keeps using {@link predictDenyRefusal}.
 */
export interface PreservedContentRefusal {
  kind: "shared-name" | "deny-scan";
  /** The exact message the merge would throw — single-sourced from the writer. */
  message: string;
}

/**
 * Preview the refusal a merge into `filePath` would raise before it could
 * write, or `null` when there is none (a missing file included).
 *
 * The user-side slice is everything outside the managed block; a file with no
 * block is user content end to end. Companion to {@link predictMergeAction},
 * which reports the disposition axis and is deliberately refusal-blind: a
 * dry-run surface renders a non-null result here as a refusal row instead of
 * the predicted action. Conservative on a truncated block, whose unterminated
 * body has no boundary to exclude it from the user-side slice.
 *
 * `null` for a symlinked path, and that is the accurate answer rather than a
 * gap: the merge refuses such a file on the read direction BEFORE its deny scan
 * runs ({@link refusePreservedContent}), so there is no deny refusal to preview
 * — and scanning bytes read through the link would quote a file outside the tree
 * into the plan output a caller prints.
 *
 * A HARD-linked path returns the merge's own refusal instead of `null`, and the
 * asymmetry is deliberate. Both refuse before the deny scan, so neither may run
 * it; the difference is what the reader can act on. A symlink is visible in one
 * `ls -l`, so a plan row saying nothing still leaves an operator able to see
 * why the apply failed. A hard link looks like an ordinary file in every listing
 * short of `ls -li`, so a silent plan row followed by a failing apply is the
 * unreadable outcome — and the refusal text carries no bytes from the file, only
 * the path and the remedy, so returning it leaks nothing the deny message would.
 */
export async function predictPreservedContentRefusal(
  filePath: string,
): Promise<PreservedContentRefusal | null> {
  const existing = await readIfExists(filePath);
  if (existing === null) return null;
  const entry = await entryStat(filePath);
  if (entry.isSymbolicLink()) return null;
  if (isSharedRegularFile(entry)) {
    return { kind: "shared-name", message: refuseMergeIntoSharedFile(filePath).message };
  }
  const message = denyRefusalMessage(filePath, extractCustomContent(existing, filePath));
  return message === null ? null : { kind: "deny-scan", message };
}

/**
 * {@link predictPreservedContentRefusal}'s message alone, for the surfaces that
 * print a refusal rather than branch on it. Kept as the narrow shape it always
 * had — the classified form is additive, not a replacement.
 */
export async function predictDenyRefusal(filePath: string): Promise<string | null> {
  return (await predictPreservedContentRefusal(filePath))?.message ?? null;
}

// ── Merge shaping ──────────────────────────────────────────────────────────

/**
 * Managed block above the existing body, separated by one blank line. An empty
 * (or whitespace-only) existing file yields the block alone — no blank-line
 * artifact — and output always carries a POSIX final newline so this branch and
 * a later {@link insertManagedBlock} merge agree byte-for-byte.
 */
function prependManagedBlock(incoming: string, existingContent: string): string {
  const tail = existingContent.trimStart();
  const joined = tail === "" ? incoming.trim() : [incoming.trim(), "", tail].join("\n");
  return joined.endsWith("\n") ? joined : `${joined}\n`;
}

/**
 * Rewrite the detected block's BEGIN line to the bare (unstamped) marker, so
 * two renderings that differ only in their version stamp compare equal. Callers
 * gate on the on-disk variant already matching the path's variant.
 */
function stripBlockVersionStamp(content: string, filePath?: string): string {
  const split = splitAtManagedBlock(content, filePath);
  if (split === null) return content;
  const nlIdx = split.block.indexOf("\n");
  if (nlIdx === -1) return content;
  const bare = getMarkersForPath(filePath).start;
  return `${split.before}${bare}${split.block.slice(nlIdx)}${split.after}`;
}

/**
 * Only-when-stale contract: true when the merge would produce no
 * meaningful change. Byte equality is the fast path; beyond it, a block whose
 * stamp is semver-equal to `version` (`1.0.0` vs `v1.0.0+build.5`) and whose
 * bytes match modulo that stamp counts as current and is left alone. Without a
 * `version` the caller is not participating in stamping, so byte equality is
 * the whole test.
 */
function isMergeUnchanged(
  existingContent: string,
  merged: string,
  filePath?: string,
  version?: string,
): boolean {
  if (merged === existingContent) return true;
  if (version === undefined) return false;
  if (isManagedBlockStale(existingContent, version, filePath)) return false;
  if (wouldChangeMarkerVariant(existingContent, filePath)) return false;
  return (
    stripBlockVersionStamp(merged, filePath) === stripBlockVersionStamp(existingContent, filePath)
  );
}

/**
 * Close a truncated block (BEGIN present, END lost to an interrupted write or a
 * deleted marker line) by appending the END marker of whichever variant makes
 * the pair detectable AND mergeable, so the repair reuses the block detector
 * rather than re-deriving marker positions. `null` when no variant produces
 * such a candidate — the caller's signal to rebuild the file instead.
 *
 * Detectable is not sufficient, and the gap between the two was a hard failure.
 * `insertManagedBlock` refuses a duplicated marker line, so appending an END to
 * content that already carries one of the same variant OUTSIDE the block — a
 * stray END left ahead of the BEGIN — produced a candidate that detected fine
 * and then threw one call later, past the dry run that had already predicted
 * `updated`. Worse, the message it threw told the author to delete extra
 * end-markers so exactly one remains: the file on disk had exactly one, and the
 * second was minted by this repair. Asking the merge itself whether the
 * candidate is mergeable is what keeps that judgement single-sourced — a
 * re-derived END count here would have to reproduce the merge's variant
 * selection and its code-fence shield to agree with it.
 */
function terminateHealablePrefix(existingContent: string, filePath?: string): string | null {
  const base = existingContent.endsWith("\n") ? existingContent : `${existingContent}\n`;
  for (const variant of MANAGED_BLOCK_VARIANTS) {
    const candidate = `${base}${variant.end}\n`;
    if (!hasManagedBlock(candidate, filePath)) continue;
    try {
      // Probe with an empty body: the merge validates marker structure before
      // it touches content, so the body is irrelevant to the answer and the
      // result is discarded.
      insertManagedBlock(candidate, "", filePath);
    } catch {
      continue;
    }
    return candidate;
  }
  return null;
}

// ── Prediction ─────────────────────────────────────────────────────────────

/**
 * The action {@link safeWriteFile} would return for these inputs — pure: no
 * disk I/O, no throwing, no side effect. `existingContent` is `null` for an
 * absent file.
 *
 * Mirrors the writer branch for branch. Two deliberate flattenings, both of
 * which the live path reaches by rewriting: a truncated block predicts
 * `updated` (the writer repairs it, or — when no END can close it without
 * duplicating one already in the file — rebuilds it from a verified backup,
 * which is the same disposition), and a structurally corrupted block predicts
 * `updated` (the writer rebuilds it from a verified backup). The deny scan is
 * not run — a refusal is not an action; {@link predictDenyRefusal} owns that
 * axis.
 */
export function predictMergeAction(
  existingContent: string | null,
  incoming: string,
  options: SafeWriteFileOptions = {},
  filePath?: string,
): MergeAction {
  const skipIfUnchanged = options.skipIfUnchanged ?? true;
  if (existingContent === null) return "created";

  if (options.managedContent !== undefined) {
    if (!hasManagedBlock(existingContent, filePath)) {
      if (isHealableManagedPrefix(existingContent)) return "updated";
      if (options.appendIfNoBlock !== true) return "skipped";
      const prepended = prependManagedBlock(incoming, existingContent);
      return skipIfUnchanged && prepended === existingContent ? "unchanged" : "updated";
    }
    let merged: string;
    try {
      merged = insertManagedBlock(
        existingContent,
        options.managedContent,
        filePath,
        options.version,
      );
    } catch {
      return "updated";
    }
    return skipIfUnchanged && isMergeUnchanged(existingContent, merged, filePath, options.version)
      ? "unchanged"
      : "updated";
  }

  if (skipIfUnchanged && incoming === existingContent) return "unchanged";
  return isManagedPath(filePath ?? "", options.ledgerPaths, existingContent) ||
    options.force === true
    ? "updated"
    : "skipped";
}

// ── Managed-path predicate ─────────────────────────────────────────────────

/** Ledger keys are repo-relative POSIX paths; normalize before membership tests. */
function toLedgerKey(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

/**
 * A path as the operator's own surfaces spell it: repo-relative when the caller
 * declared its root, absolute when it did not.
 *
 * Every CLI panel and report in this repository prints repo-relative paths, and
 * the merge engine's messages printed absolute ones into the middle of them —
 * so one line of a panel carried the operator's machine layout while the lines
 * around it did not. `boundaryDir` is that root wherever a caller emits into a
 * tree, so no new parameter is needed to answer the question.
 */
function displayPath(filePath: string, boundaryDir: string | undefined): string {
  if (boundaryDir === undefined) return filePath;
  const rel = relative(boundaryDir, filePath);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return filePath;
  return rel.split(sep).join("/");
}

/**
 * True when the engine can PROVE it owns `filePath`, which is what licenses a
 * whole-file overwrite without `force` — and without a backup. Two proofs, and
 * a filename is not one of them:
 *
 * 1. **Ledger membership.** `ledgerPaths` records what the engine wrote. It is
 *    the authority; pass it whenever a manifest is loaded.
 * 2. **A marker in the bytes.** `existingContent` carrying a STAMITY:BEGIN/END
 *    pair is engine output by construction — nothing else writes those markers
 *    — so a repo whose manifest was deleted can still be maintained.
 *
 * The generated corpus's filename prefix (`stamity-`, `types/markers.ts`) used
 * to stand in as a third proof on the basename, and it proved the wrong
 * direction: it says the engine WOULD have chosen this name, not that it DID
 * write this file. On a repo with no ledger — a fresh
 * clone, a deleted manifest, a first run over a tree someone else set up — a
 * user's own `stamity-notes.md` matched it, and the whole-file lane then
 * replaced the file with generated bytes: no `.bak` (ownership skips the backup
 * on purpose, since engine output is regenerable), no warning, and a dry run
 * that predicted `updated` rather than naming what it was about to destroy.
 * Defending the false-positive direction costs the engine nothing it cannot
 * recover: an unproven path is `skipped` with a warning naming `force` and the
 * `.bak` that `force` takes, so the operator decides.
 *
 * `existingContent` is optional because the predicate is also asked about paths
 * with no file behind them yet; absent or `null`, only the ledger can prove
 * ownership.
 */
export function isManagedPath(
  filePath: string,
  ledgerPaths?: ReadonlySet<string>,
  existingContent?: string | null,
): boolean {
  if (ledgerPaths?.has(toLedgerKey(filePath)) === true) return true;
  return (
    existingContent !== undefined &&
    existingContent !== null &&
    hasManagedBlock(existingContent, filePath)
  );
}

/**
 * Build the {@link SafeWriteFileOptions.ledgerPaths} set from a manifest's
 * repo-relative ledger paths, keyed the way {@link isManagedPath} looks a path
 * up. Writers address files by absolute path, so the join happens here rather
 * than at each call site — the lookup key and the set are normalized by the one
 * function, which is what keeps the membership test from silently never hitting.
 */
export function ledgerPathSet(rootDir: string, paths: readonly string[]): ReadonlySet<string> {
  return new Set(paths.map((path) => toLedgerKey(join(rootDir, ...path.split("/")))));
}

// ── Frontmatter prefix reader ──────────────────────────────────────────────

/**
 * Read one scalar field out of the YAML frontmatter block at the head of
 * `content` — typically the out-of-block prefix ahead of a BEGIN marker, where
 * slash-command pickers read `description`. Returns the trimmed value, or
 * `null` when there is no complete `---` fence pair or the field is absent or
 * value-less. A CRLF checkout's trailing `\r` is stripped before matching.
 */
export function readPrefixFrontmatterField(content: string, field: string): string | null {
  const lines = content.split("\n");
  let open = 0;
  while (open < lines.length && (lines[open] ?? "").trim() === "") open++;
  if ((lines[open] ?? "").trim() !== "---") return null;
  let close = open + 1;
  while (close < lines.length && (lines[close] ?? "").trim() !== "---") close++;
  if (close >= lines.length) return null;
  const fieldRe = new RegExp(`^${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(.+)$`);
  for (let i = open + 1; i < close; i++) {
    const value = fieldRe.exec((lines[i] ?? "").replace(/\r$/, ""))?.[1]?.trim();
    if (value !== undefined && value !== "") return value;
  }
  return null;
}

// ── Write ──────────────────────────────────────────────────────────────────

/**
 * Flags for the backup destination, the same pair `atomicWrite.ts` opens its
 * temp file with. `O_EXCL` refuses a name that is already a directory entry;
 * `O_NOFOLLOW` refuses a SYMLINK at that name — the form that would deposit the
 * file's bytes wherever the link points instead of beside the file.
 */
const BAK_FLAGS = FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW;

function refuseBackupOfLink(filePath: string): EngineError {
  return new EngineError(
    `Refusing to back up ${filePath}: it is a symbolic link, so the backup would copy whatever ` +
      `the link points at into this directory rather than the file's own contents — including a ` +
      `file outside this tree that was never yours to publish. Nothing was written. Replace the ` +
      `link with a regular file, or delete it and re-run to regenerate the file.`,
    { code: "FS_ERROR" },
  );
}

/** Hard-link twin of {@link refuseBackupOfLink} — same lane, same register, the
 *  shape `isSymbolicLink()` cannot see. See {@link isSharedRegularFile}. */
function refuseBackupOfSharedFile(filePath: string): EngineError {
  return new EngineError(
    `Refusing to back up ${filePath}: it is a hard link — this file shares its contents with ` +
      `another name, which this tree cannot see and which may sit outside it, so the backup ` +
      `would copy bytes that are not this file's alone into this directory, where the next ` +
      `commit picks them up. Nothing was written. Replace it with a regular file before ` +
      `syncing — copy the contents to a new file and move that over this name — or delete it ` +
      `and re-run to regenerate the file.`,
    { code: "FS_ERROR" },
  );
}

/**
 * The two errnos {@link BAK_FLAGS} adds on top of an ordinary create, neither of
 * which is in `mapFsErrno`'s write-side table: EEXIST (an entry appeared at the
 * name after {@link resolveNonClobberingBakPath} resolved it as free) and ELOOP
 * (a symlink did, refused by `O_NOFOLLOW`). One operator story between them, and
 * neither may escape as a raw errno — the caller is one step from destroying the
 * original. Every other unmapped errno still rethrows unchanged.
 */
const BAK_COLLISION_ERRNOS = new Set(["EEXIST", "ELOOP"]);

/** `code` is the caller's already-resolved errno, which {@link BAK_COLLISION_ERRNOS}
 *  has narrowed to one of the two by the time this runs. */
function refuseBackupDestination(
  filePath: string,
  bakPath: string,
  code: string,
  err: unknown,
): EngineError {
  return new EngineError(
    `Cannot back up ${filePath}: the backup destination ${bakPath} could not be created ` +
      `(${code}) — another entry now stands at that name, or a symbolic link does. Nothing was ` +
      `overwritten. Remove or rename ${bakPath} and re-run.`,
    { code: "FS_ERROR", cause: err },
  );
}

/**
 * Preserve `filePath`'s current bytes in a non-clobbering `.bak` and verify the
 * copy (size + SHA-256 against the in-memory original) before the caller
 * destroys the original. Returns the backup path for the caller's warning.
 *
 * Both directions are constrained, because a `.bak` is a path this module
 * DERIVES from `filePath` rather than one the caller handed over and the
 * containment check at the write target therefore never covered:
 *
 * - **Read.** A `filePath` that is itself a symlink names bytes the tree does
 *   not own. Backing it up would pull the link's target — `~/.ssh/id_ed25519`
 *   behind a planted `AGENTS.md` — into a `.bak` INSIDE the working tree, where
 *   the next `git add -A` publishes it. Refused before anything is written, and
 *   so is the hard-linked spelling of the same plant, whose tell is `nlink`
 *   rather than the entry type ({@link isSharedRegularFile}, same posture).
 * - **Write.** The destination is containment-checked like any other write
 *   target, then created `O_EXCL | O_NOFOLLOW`, so a link planted at the backup
 *   name cannot redirect the bytes out of the tree. The bytes come from the
 *   in-memory `existingContent` the caller read under the lock, never from a
 *   re-read of `filePath` — a copy would be a second, unchecked follow of both
 *   ends. The source's permission bits are carried over explicitly, which
 *   `copyFile` did for free: a backup of a `0600` file landing at the default
 *   `0644` would publish it to every other account on the host.
 */
async function backupBeforeOverwrite(
  filePath: string,
  existingContent: string,
  operation: string,
  boundaryDir?: string,
): Promise<string> {
  const source = await entryStat(filePath);
  if (source.isSymbolicLink()) throw refuseBackupOfLink(filePath);
  // Same `lstat`, no second syscall: a hard link is the read direction again,
  // with the tell in `nlink` rather than in the entry type.
  if (isSharedRegularFile(source)) throw refuseBackupOfSharedFile(filePath);
  const bakPath = await resolveNonClobberingBakPath(filePath);
  await assertWriteTargetContained(bakPath, boundaryDir);
  try {
    const handle = await openFile(bakPath, BAK_FLAGS, source.mode & 0o777);
    try {
      // utf-8 to match the encoding `readIfExists` read with: `verifyBackup`
      // compares the file's size against `Buffer.byteLength(existingContent)`.
      await handle.writeFile(existingContent, "utf-8");
    } finally {
      await handle.close();
    }
  } catch (err) {
    const code = errnoCode(err) ?? "";
    if (BAK_COLLISION_ERRNOS.has(code)) throw refuseBackupDestination(filePath, bakPath, code, err);
    throw mapFsErrno(err, bakPath) ?? err;
  }
  await verifyBackup(filePath, bakPath, existingContent, operation);
  return bakPath;
}

/**
 * Write or merge `filePath`, preserving every user-authored byte outside the
 * managed block. See the module header for the four dispositions and the
 * invariants this upholds.
 *
 * The path's write lock is taken at entry and held across the read, the merge
 * decision, and the write, so concurrent callers serialize whole read-merge-write
 * cycles instead of racing a decision computed from a pre-lock read. Writes go
 * through {@link atomicWriteFileUnlocked} because the lock is already held.
 * Opting out of locking (`STAMITY_LOCK=0`) makes concurrent runs against one
 * target unsupported, exactly as it does for the substrate.
 */
export async function safeWriteFile(
  filePath: string,
  content: string,
  options: SafeWriteFileOptions = {},
): Promise<MergeResult> {
  // Normalise before anything derives from the path. `resolve` collapses `..`
  // lexically while the kernel applies it AFTER following a link, so a
  // `link/../real/f.md` spelling is checked as one directory and written into
  // another — and this function's own `mkdir` would build that other directory
  // even though the substrate below now lands inside. Idempotent on the
  // absolute, `join`-built paths every shipped caller passes.
  filePath = resolve(filePath);

  // Containment first: the mkdir below and the lockfile the acquire creates
  // both build directories on this path, so an unchecked path would have the
  // engine materialising a tree through a planted link before the merge
  // decision is even computed.
  await assertWriteTargetContained(filePath, options.boundaryDir);

  // Ahead of the lock and the write, so a parent-directory failure surfaces as
  // the same actionable FS_ERROR the writer itself would produce.
  try {
    await mkdir(dirname(filePath), { recursive: true });
  } catch (err) {
    throw mapFsErrno(err, filePath) ?? err;
  }

  const release = await acquireWriteLock(filePath, options.boundaryDir);
  try {
    return await safeWriteFileLocked(filePath, content, options);
  } finally {
    try {
      await release();
    } catch (releaseErr) {
      // Never mask the write result with a release failure; surface it.
      console.error(
        `Failed to release the write lock on ${filePath}: ${describeError(releaseErr)}`,
      );
    }
  }
}

/** Body of {@link safeWriteFile}, run with the path's write lock held. */
async function safeWriteFileLocked(
  filePath: string,
  content: string,
  options: SafeWriteFileOptions,
): Promise<MergeResult> {
  const skipIfUnchanged = options.skipIfUnchanged ?? true;
  const writeOpts = atomicOptions(options.boundaryDir);
  const existingContent = await readIfExists(filePath);

  if (existingContent === null) {
    await atomicWriteFileUnlocked(filePath, content, writeOpts);
    return { path: filePath, action: "created" };
  }

  if (options.managedContent !== undefined) {
    return await mergeManagedContent(
      filePath,
      content,
      existingContent,
      options,
      options.managedContent,
      skipIfUnchanged,
    );
  }

  if (skipIfUnchanged && content === existingContent) {
    return { path: filePath, action: "unchanged" };
  }

  const managed = isManagedPath(filePath, options.ledgerPaths, existingContent);
  if (!managed && options.force !== true) {
    return {
      path: filePath,
      action: "skipped",
      warning:
        `Skipped ${filePath}: it already exists with different content and the engine cannot ` +
        `prove it wrote it — the file is in no ownership ledger and carries no STAMITY:BEGIN/END ` +
        `markers, so a matching filename is not enough to claim it. It was left untouched. ` +
        `Re-run with force to overwrite it (the existing file is backed up first), or delete it ` +
        `and re-run.`,
    };
  }

  // A managed file is regenerable from the corpus, so it keeps the no-backup
  // fast path; forcing over unmanaged content destroys the only copy of it,
  // which is what the verified `.bak` protects.
  if (managed || options.backup === false) {
    await atomicWriteFileUnlocked(filePath, content, writeOpts);
    return { path: filePath, action: "updated" };
  }
  const bakPath = await backupBeforeOverwrite(
    filePath,
    existingContent,
    "force overwrite",
    options.boundaryDir,
  );
  await atomicWriteFileUnlocked(filePath, content, writeOpts);
  return {
    path: filePath,
    action: "updated",
    warning:
      `Force-overwrote ${filePath}: it carries no STAMITY:BEGIN/END markers, so the whole file ` +
      `was replaced with generated output. Your previous file is at ${bakPath}.`,
  };
}

/** The managed-merge lane: repair, splice, or merge, then apply only-when-stale. */
async function mergeManagedContent(
  filePath: string,
  content: string,
  existingContent: string,
  options: SafeWriteFileOptions,
  managedContent: string,
  skipIfUnchanged: boolean,
): Promise<MergeResult> {
  const writeOpts = atomicOptions(options.boundaryDir);
  if (!hasManagedBlock(existingContent, filePath)) {
    if (isHealableManagedPrefix(existingContent)) {
      return await repairTruncatedBlock(
        filePath,
        content,
        existingContent,
        managedContent,
        options.version,
        writeOpts,
      );
    }
    if (options.appendIfNoBlock !== true) {
      return {
        path: filePath,
        action: "skipped",
        warning:
          `Skipped ${filePath}: its STAMITY:BEGIN/END markers are missing, so there is nowhere to ` +
          `merge generated content without guessing which bytes are yours. Restore the markers ` +
          `around the generated section, or move your content elsewhere and re-run.`,
      };
    }
    // First sync over a pre-existing file: the entire body is user-authored and
    // is about to be preserved below the new block, so it is the gate's target.
    await refusePreservedContent(filePath, existingContent);
    const prepended = prependManagedBlock(content, existingContent);
    if (skipIfUnchanged && prepended === existingContent) {
      return { path: filePath, action: "unchanged" };
    }
    await atomicWriteFileUnlocked(filePath, prepended, writeOpts);
    // Two different events reached this one sentence. A path the ledger already
    // records is a REPAIR: the engine wrote it, the markers are gone, and
    // something removed them — worth a warning. A path the ledger has never
    // seen is a first ADOPTION: the operator's own hand-written AGENTS.md, met
    // for the first time, markers added around new generated content with every
    // existing byte preserved below. Reporting the second as "Restored the
    // managed block … were absent" was wrong three ways at once: nothing had
    // been restored, it was yellow `warning:` on the happy path, and it landed
    // four lines under a success line saying the file "was kept — merged".
    const previouslyOwned = options.ledgerPaths?.has(toLedgerKey(filePath)) === true;
    if (!previouslyOwned) {
      return {
        path: filePath,
        action: "updated",
        notice:
          `adopted ${displayPath(filePath, options.boundaryDir)}: it is now a co-owned file — ` +
          `generated content sits inside STAMITY:BEGIN/END markers at the top and every byte you ` +
          `had is preserved below them. Edit freely outside the markers; the block is rewritten ` +
          `on each sync.`,
      };
    }
    return {
      path: filePath,
      action: "updated",
      warning:
        `Restored the managed block in ${displayPath(filePath, options.boundaryDir)}: this file ` +
        `is engine-owned and its STAMITY:BEGIN/END markers were absent, so generated content was ` +
        `prepended and your existing content preserved below it. To detach this file from the ` +
        `engine, remove it from the manifest instead of deleting the markers.`,
    };
  }

  // Only the slice outside the markers is user-controlled; the block body is
  // engine-authored output from this same run and is trusted by construction.
  // Guards the rebuild lane below it too: that one discards the slice, but backs
  // it up into the tree first.
  await refusePreservedContent(filePath, extractCustomContent(existingContent, filePath));

  const variantChanged = wouldChangeMarkerVariant(existingContent, filePath);
  let merged: string;
  try {
    merged = insertManagedBlock(existingContent, managedContent, filePath, options.version);
  } catch (mergeErr) {
    // Structurally corrupted markers (duplicated or misordered): nothing can be
    // merged into them, so the file is rebuilt from generated output — behind a
    // verified backup, because that discards any out-of-block user content.
    const bakPath = await backupBeforeOverwrite(
      filePath,
      existingContent,
      "block repair",
      options.boundaryDir,
    );
    await atomicWriteFileUnlocked(filePath, content, writeOpts);
    return {
      path: filePath,
      action: "updated",
      warning:
        `Rebuilt ${filePath}: its STAMITY:BEGIN/END markers were structurally corrupted ` +
        `(${describeError(mergeErr)}), so the file was regenerated from the corpus. Your previous ` +
        `file, including anything outside the markers, is at ${bakPath}.`,
    };
  }

  if (skipIfUnchanged && isMergeUnchanged(existingContent, merged, filePath, options.version)) {
    return { path: filePath, action: "unchanged" };
  }
  await atomicWriteFileUnlocked(filePath, merged, writeOpts);
  if (!variantChanged) return { path: filePath, action: "updated" };
  return {
    path: filePath,
    action: "updated",
    warning:
      `Rewrote the marker syntax in ${filePath}: its STAMITY:BEGIN/END markers used a comment ` +
      `style this file type cannot parse and were replaced with the matching one. Your content ` +
      `outside the block is unchanged.`,
  };
}

/**
 * Repair a block that opens but never closes. The bytes ahead of the BEGIN
 * marker are user content and survive verbatim; everything from the marker on
 * is an unterminated managed region with no recoverable boundary, so it is
 * replaced with a freshly wrapped block. The pre-repair file is preserved in a
 * verified `.bak` named in the warning, which is the only recovery path for
 * anything that sat below the truncation point.
 *
 * A prefix that cannot be terminated into a mergeable block falls through to
 * the same backup-and-rebuild the structurally-corrupted lane takes, rather
 * than throwing. Throwing broke the module's dry-run/apply parity outright: the
 * predictor reports `updated` for every healable prefix — the writer has a
 * repair for it — and an apply that hard-failed on a subset of them made the
 * preview a claim the run did not honour. Both outcomes now write, both back up
 * first, and both report `updated`, which is what the predictor already says.
 */
async function repairTruncatedBlock(
  filePath: string,
  content: string,
  existingContent: string,
  managedContent: string,
  version: string | undefined,
  writeOpts: AtomicWriteOptions | undefined,
): Promise<MergeResult> {
  const terminated = terminateHealablePrefix(existingContent, filePath);
  if (terminated === null) {
    // No block boundary exists, so nothing excludes any byte from the user-side
    // slice — the whole file is the gate's target, matching what
    // `predictPreservedContentRefusal` previews for a truncated block.
    await refusePreservedContent(filePath, extractCustomContent(existingContent, filePath));
    const bakPath = await backupBeforeOverwrite(
      filePath,
      existingContent,
      "block repair",
      writeOpts?.boundaryDir,
    );
    await atomicWriteFileUnlocked(filePath, content, writeOpts);
    return {
      path: filePath,
      action: "updated",
      warning:
        `Rebuilt ${filePath}: it opens a STAMITY:BEGIN marker that no END marker can close ` +
        `without duplicating one the file already carries, so the file was regenerated from the ` +
        `corpus instead of repaired. Your previous file, including anything outside the markers, ` +
        `is at ${bakPath}.`,
    };
  }
  // The bytes above the BEGIN marker survive the repair verbatim, so this lane
  // preserves too. Its backup refuses a link as well, but only after the deny
  // scan has already read — and quoted — whatever the link points at.
  await refusePreservedContent(filePath, extractCustomContent(terminated, filePath));
  const merged = insertManagedBlock(terminated, managedContent, filePath, version);
  // `writeOpts` is this lane's only carrier of the caller's boundary —
  // `atomicOptions` built it from `options.boundaryDir` and is its one producer.
  const bakPath = await backupBeforeOverwrite(
    filePath,
    existingContent,
    "block repair",
    writeOpts?.boundaryDir,
  );
  await atomicWriteFileUnlocked(filePath, merged, writeOpts);
  return {
    path: filePath,
    action: "updated",
    warning:
      `Repaired the managed block in ${filePath}: its STAMITY:BEGIN marker had no closing ` +
      `STAMITY:END, so the block was rewritten and terminated. Content above the marker was kept; ` +
      `your previous file is at ${bakPath}.`,
  };
}
