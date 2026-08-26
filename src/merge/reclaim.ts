import { createHash } from "node:crypto";
import { lstat, readFile, realpath, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { ReclaimCandidate } from "../manifest/ledger.ts";
import type { CoOwnedReducer } from "../types/content.ts";
import { EngineError } from "../types/errors.ts";
import { CONTENT_PREFIX, STATE_DIR } from "../types/markers.ts";
import {
  atomicWriteFile,
  isSharedRegularFile,
  readDirectoryIdentity,
  sameDirectoryIdentity,
  type DirectoryIdentity,
} from "./atomicWrite.ts";
import { splitAtManagedBlock } from "./managedBlocks.ts";

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
 * Five gates, in order. The two cheap shape checks run before the sweep touches
 * disk, so a tampered ledger row is refused without a syscall:
 *
 * 1. **Containment (shape).** The recorded path is repo-relative POSIX with no
 *    `..` segment, no NUL byte, no drive letter. This is the same grammar the
 *    ledger asserts at persistence time, re-checked here because a ledger row is
 *    an authorisation to delete — hand-editing the manifest must not become a
 *    delete primitive aimed anywhere on the machine.
 * 2. **Ownership marker.** Any ONE of three proofs clears this gate. (a) The
 *    basename carries {@link CONTENT_PREFIX} (optionally behind a two-digit
 *    ordering prefix), or the file sits inside an engine-minted SKILL directory
 *    (`…/skills/<prefix><name>/…`) — the one layout whose contents are not
 *    individually prefixed, so its marker lives on the container. No other
 *    ancestor counts on its own: a directory a user named after the engine says
 *    nothing about the files under it, so a prefixed ancestor is PROVISIONAL —
 *    it keeps the sweep reading, and gate 4 then requires the bytes to close the
 *    claim (a block spanning the file, or a matching hash). (b) The row recorded a
 *    `contentHash` and the path is somewhere that hash is admissible — inside
 *    {@link STATE_DIR}, or on the trusted allowlist; the hash is checked against
 *    the bytes at gate 4, so this proof is only provisional here. (c) The caller
 *    listed the exact path in `trustedExactPaths`, the allowlist for infra files
 *    the engine writes under names it did not mint (MCP config, hook config).
 *    Proof (a) and a verified (b) earn whole-file deletion; (c) never does on its
 *    own, and must still prove sole ownership at gate 4 — via (b) or via a block
 *    that spans the file.
 * 3. **Containment (physical).** The parent directory's realpath still resolves
 *    under the root's realpath, and the candidate itself is a regular file. A
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
 *    emits at platform-mandated paths (`AGENTS.md`, `.claude/settings.json`) —
 *    be uninstalled by dropping its ledger rows and sweeping, and only while it
 *    is untouched. That shortcut holds only where the recorded hash covers a
 *    document the engine wrote END TO END, and `coOwnedPaths` names the paths
 *    where it does not. The three client MCP documents are written by MERGING
 *    the engine's entries into whatever the operator already has, so both
 *    writers record the hash of the MERGED bytes (`cli/commands/sync/engine.ts`,
 *    `cli/commands/init/apply.ts`) — emission ∪ the operator's own. A match
 *    there proves only that nobody has edited the file since the engine last
 *    wrote it, which is a weaker claim than sole authorship; reading it as the
 *    stronger one unlinked a `.mcp.json` carrying a hand-added server outright,
 *    with no backup and no entry saying so. So a co-owned path never reaches the
 *    whole-file branch: its reducer takes out the entries the engine can prove
 *    it wrote, everything else is preserved verbatim, and the unlink is reached
 *    only when the reduction finds nothing of the operator's left.
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
}

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
  /** Sweep timestamp recorded in mutating entries' `detail`; defaults to now. */
  now?: Date;
}

/** One entry per candidate path, plus tallies of the actions actually taken. */
export interface ReclaimReport {
  entries: ReclaimActionEntry[];
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

/** A two-digit ordering prefix ahead of the content prefix, e.g. `30-stamity-…`. */
const ORDERING_PREFIX_PATTERN = /^\d{2}-/;

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

/** True when a basename is one the engine mints, with or without an ordering prefix. */
function carriesEnginePrefix(name: string): boolean {
  const bare = ORDERING_PREFIX_PATTERN.test(name) ? name.slice(3) : name;
  return bare.startsWith(CONTENT_PREFIX);
}

/** The one directory segment under which the emitters mint prefixed CONTAINERS
 *  rather than prefixed files — `.agents/skills/`, `.claude/skills/`,
 *  `.cursor/skills/` (`src/adapters/*.ts`, `src/pack/projection.ts`). */
const SKILL_CONTAINER_SEGMENT = "skills";

/**
 * True when the path's OWN name proves engine authorship: its basename carries
 * the content prefix, with or without an ordering prefix.
 *
 * Anchored to the basename, and the anchor is the whole point. The predicate
 * used to accept the prefix on ANY segment, so `stamity-tools/user.md` — a
 * directory a user named after the engine, holding a file the engine never
 * wrote — cleared the ownership gate and reached the whole-file delete branch
 * on the strength of a name that says nothing about the file underneath it. A
 * directory name is a statement about the directory; only the basename is a
 * statement about this file.
 *
 * The one layout where the marker legitimately sits on a directory is answered
 * by {@link isEngineMintedSkillPath}, narrowly, rather than by widening this
 * predicate back out to every ancestor.
 */
function isEngineNamedPath(path: string): boolean {
  return carriesEnginePrefix(basename(path));
}

/**
 * True when the path sits inside a skill directory the engine minted —
 * `…/skills/<prefix><name>/…` — the one shape whose ownership marker is on a
 * container rather than on the file.
 *
 * A projected skill is a single artifact spread over a DIRECTORY the engine
 * mints (`.agents/skills/stamity-verify/`): `SKILL.md` beside it, `references/*.md`
 * one level deeper, none of them individually prefixed. Reading the marker off
 * the file alone makes depth decide reclaimability, which is why an uninstall
 * once deleted a skill's `SKILL.md` and left its own reference files orphaned.
 *
 * The prefixed segment must be the immediate child of a
 * {@link SKILL_CONTAINER_SEGMENT}, which is what separates this from the
 * any-ancestor rule it replaces: `stamity-tools/user.md` carries a prefixed
 * ancestor with no `skills` segment above it, so it stays unproven and is
 * refused at gate 2.
 */
function isEngineMintedSkillPath(path: string): boolean {
  const segments = path.split("/");
  // `slice(0, -1)` drops the file itself: a container has to sit ABOVE it, and
  // the slice preserves original indices, so `segments[index - 1]` is still the
  // segment before this one (`undefined`, hence `false`, at index 0).
  return segments
    .slice(0, -1)
    .some(
      (segment, index) =>
        segments[index - 1] === SKILL_CONTAINER_SEGMENT && carriesEnginePrefix(segment),
    );
}

/**
 * True when the path sits inside the engine's own state directory — one of the
 * two places a recorded content hash is admitted as proof of authorship (see
 * {@link isHashProvable}).
 */
function isStateDirPath(path: string): boolean {
  return path.startsWith(`${STATE_DIR}/`);
}

/**
 * True when a recorded content hash may stand as proof of authorship for `path`:
 * inside the engine's own state directory, or on the caller's trusted allowlist.
 *
 * What the hash actually proves is the reason both are admissible — and the
 * reason it is not the whole answer. Every producer records `sha256` of the bytes
 * it WROTE (`sync/engine.ts`, `init/apply.ts`, `pack/install.ts`). For a
 * whole-file writer those bytes are the generated document, so a file that still
 * equals the hash is engine output end to end wherever it sits. For the three
 * client MCP documents they are not: that lane MERGES, so the recorded hash
 * covers emission ∪ the operator's own entries, and equality proves only that
 * nobody has edited the file since. Those paths are declared `coOwnedPaths` by
 * their callers and divert to a class-specific reducer before this proof is
 * consulted — the diversion IS the safety property, because hash equality read
 * as sole authorship unlinked a `.mcp.json` carrying a hand-added server.
 *
 * The allowlist was previously exempt from the NAME gate yet had no way to prove
 * sole ownership at gate 4 unless a managed block spanned the file. That left the
 * engine's block-less whole-file infra — `AGENTS.md`, `.claude/settings.json`,
 * the plugin container — permanently unreclaimable: `clean` reported success
 * while leaving them behind. Admitting the hash closes that gap without widening
 * anything else, because gate 4 still requires an exact match.
 */
function isHashProvable(path: string, hashes: ReadonlySet<string>, trusted: ReadonlySet<string>): boolean {
  if (hashes.size === 0) return false;
  return isStateDirPath(path) || trusted.has(path);
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** True when `candidate` is `root` or sits underneath it. */
function isWithin(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
}

/**
 * True when the slice ahead of a managed block is engine-authored rather than
 * user prose: whitespace only, or exactly one complete YAML frontmatter fence
 * (the generated stub emitted above the block so slash-command pickers can read
 * a description) surrounded by whitespace. Anything else — prose, a second
 * fence, an unterminated fence — is the user's and vetoes deletion.
 */
function isEngineAuthoredPrefix(before: string): boolean {
  if (before.trim() === "") return true;
  const lines = before.split("\n").map((line) => line.replace(/\r$/, "").trim());
  let index = 0;
  while (index < lines.length && lines[index] === "") index++;
  if (lines[index] !== "---") return false;
  index++;
  while (index < lines.length && lines[index] !== "---") index++;
  if (index >= lines.length) return false;
  return lines.slice(index + 1).every((line) => line === "");
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
    const existing = groups.get(path);
    if (existing === undefined) {
      groups.set(path, {
        path,
        reason: candidate.reason,
        owners: [label],
        recordedHashes: new Set(hash === undefined ? [] : [hash]),
      });
      continue;
    }
    if (!existing.owners.includes(label)) existing.owners.push(label);
    if (hash !== undefined) existing.recordedHashes.add(hash);
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
  | { kind: "delete"; target: string; pin: TargetPin; detail: string }
  | {
      /** Rewrite in place, preserving `keep`. Both rewrite dispositions land
       *  here; `action` is which of the two the report names. */
      kind: "strip";
      action: "managed-block-stripped" | "co-owned-reduced";
      target: string;
      pin: TargetPin;
      keep: string;
      detail: string;
    }
  | {
      kind: "skip";
      action: "skipped-user-content" | "skipped-unsafe-path" | "skipped-missing";
      detail: string;
    };

interface SweepContext {
  /** Symlink-resolved repo root. */
  root: string;
  /** Symlink-resolved state directory; the parent prune stops here. */
  stateDir: string;
  trusted: ReadonlySet<string>;
  coOwned: ReadonlyMap<string, CoOwnedReducer>;
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

  // Earns a whole-file delete on the strength of the name alone.
  const engineNamed = isEngineNamedPath(path) || isEngineMintedSkillPath(path);
  // Provisional, exactly like `hashProvable` below: enough to keep the sweep
  // reading, never enough to unlink. A prefixed directory that is not a skill
  // container is a name the USER may have chosen, and it says nothing about the
  // file inside it, so the bytes have to close the claim at gate 4 — a managed
  // block spanning the file, or a matching recorded hash.
  const prefixedAncestor = path.split("/").slice(0, -1).some(carriesEnginePrefix);
  // Provisional: the recorded hash still has to match the bytes below.
  const hashProvable = isHashProvable(path, group.recordedHashes, ctx.trusted);
  if (!engineNamed && !prefixedAncestor && !hashProvable && !ctx.trusted.has(path)) {
    return skip(
      "skipped-unsafe-path",
      `\`${basename(path)}\` carries no \`${CONTENT_PREFIX}\` ownership marker on itself or on an engine-minted skill directory above it, records no content hash admissible for its location, and is not on the trusted allowlist, so the engine cannot claim to have written it.`,
    );
  }

  const recordedTarget = resolve(ctx.root, path);
  let parentReal: string;
  let parentIdentity: DirectoryIdentity;
  try {
    parentReal = await realpath(dirname(recordedTarget));
    parentIdentity = await readDirectoryIdentity(parentReal);
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
  // Every syscall from here on addresses the RESOLVED parent rather than the
  // recorded spelling, so a symlinked directory that was on the path is behind
  // us: the remaining exposure is a swap of the resolved directory itself,
  // which the identity pin catches at mutation time.
  // `lastIndexOf` + 1 is total: a path with no separator yields index 0 and the
  // whole string, so there is no "no final segment" case to defend against.
  const target = join(parentReal, path.slice(path.lastIndexOf("/") + 1));

  let stats;
  try {
    stats = await lstat(target);
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
    if (reduction.kind === "untouched") return skip("skipped-user-content", reduction.detail);
    if (reduction.kind === "engine-only") {
      return { kind: "delete", target, pin, detail: reduction.detail };
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
      detail: reduction.detail,
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
  const hashMatched = group.recordedHashes.size > 0 && group.recordedHashes.has(sha256(bytes));
  const hashVetoed = group.recordedHashes.size > 0 && !hashMatched;

  // Settled before the managed-block split on purpose: bytes identical to what
  // the engine recorded writing leave nothing a user could have authored, so
  // there is no veto for the split to find and no block worth stripping out of
  // a file that is engine output end to end.
  if (hashProvable && hashMatched) {
    return {
      kind: "delete",
      target,
      pin,
      detail:
        "Whole-file engine output: the bytes still hash to what the ledger recorded writing here, so nothing in the file is user-authored.",
    };
  }

  const split = splitAtManagedBlock(content, target);
  if (split === null) {
    if (hashVetoed) return skip("skipped-user-content", hashMismatchDetail);
    if (engineNamed) {
      return {
        kind: "delete",
        target,
        pin,
        detail:
          "Whole-file engine output: the name is engine-minted and there is no managed block whose surroundings could be user-authored.",
      };
    }
    return skip(
      "skipped-user-content",
      prefixedAncestor
        ? `\`${basename(path)}\` sits under a directory carrying the \`${CONTENT_PREFIX}\` prefix, but its own name does not and it holds no managed block, so what the engine can claim to have minted is the directory, not this file.`
        : "Trusted shared file with no managed block to strip. The engine never deletes a co-owned file wholesale, so its engine-written entries are left to the class-specific filter.",
    );
  }

  const userBytesOutside =
    !isEngineAuthoredPrefix(split.before) || split.after.trim() !== "";
  if (!userBytesOutside) {
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
  };
  const stamp = (opts.now ?? new Date()).toISOString();

  for (const group of groups) {
    const plan = await planFor(group, ctx);
    const provenance =
      group.owners.length > 1 ? ` Recorded by ${group.owners.join(" and ")}.` : "";
    const base = { path: group.path, candidateReason: group.reason };

    if (plan.kind === "skip") {
      entries.push({ ...base, action: plan.action, detail: plan.detail + provenance });
      continue;
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
      });
      continue;
    }
    const verdict = await verifyPinStillHolds(plan.target, plan.pin, ctx);
    if (verdict.kind === "refused") {
      entries.push({ ...base, action: "skipped-unsafe-path", detail: verdict.detail + provenance });
      continue;
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
      continue;
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
        continue;
      }
      await pruneEmptyParents(plan.target, ctx);
      entries.push({
        ...base,
        action: "deleted",
        detail: `${plan.detail} Deleted at ${stamp}.${provenance}`,
      });
      continue;
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
      continue;
    }
    entries.push({
      ...base,
      action: plan.action,
      detail: `${plan.detail} ${plan.action === "co-owned-reduced" ? "Reduced" : "Stripped"} at ${stamp}.${provenance}`,
    });
  }

  return {
    entries,
    consent: opts.consent,
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
