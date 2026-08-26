import semver from "semver";
import { EngineError } from "../types/errors.ts";
import {
  MANAGED_BLOCK_VARIANTS,
  getMarkersForPath,
  parseMarkerVersion,
  stampMarkerVersion,
  type ManagedBlockMarkers,
} from "../types/markers.ts";

/**
 * Managed blocks delimit the slice of an output file the engine owns; every
 * byte outside the markers is user-authored and preserved verbatim on merge.
 *
 * Detection rules, shared by every read-side helper:
 *
 * - **Line-anchored:** a marker counts only when a whole line, after trimming
 *   surrounding whitespace, IS the marker — bare, or (BEGIN only) carrying a
 *   single version-stamp token. Prose or config values that merely quote a
 *   marker token mid-line are inert.
 * - **Path-preferred variants:** when a path is supplied, the variant
 *   {@link getMarkersForPath} would emit for it is tried first, then the rest
 *   in declared order — so a legacy wrong-variant file still detects (and gets
 *   auto-repaired on the next merge), while a body that quotes the other
 *   variant's tokens cannot shadow the real block.
 * - **Fence-aware on markdown hosts:** whole-line marker tokens quoted inside
 *   terminated ``` / ~~~ code fences are excluded. A malformed (unterminated)
 *   fence structure voids the shield entirely — every pairing derived from it
 *   would be unreliable — restoring plain line-anchored detection so real
 *   markers are always found.
 * - **Complete pairs only:** a variant matches when its BEGIN line precedes its
 *   END line. Mixed variants or a BEGIN without an END read as "no block";
 *   {@link isHealableManagedPrefix} classifies the latter for the repair path.
 *
 * Version staleness (only-when-stale contract): emission stamps the current
 * engine version into the BEGIN marker; {@link isManagedBlockStale} reports
 * `false` only when the stamped version equals the current one under semver —
 * bare markers, malformed stamps, and undetectable blocks all fail toward
 * refresh.
 */

/** A fenced-code character range `[start, end)` within the scanned content. */
interface FencedRange {
  start: number;
  end: number;
}

/**
 * Compute the character ranges of terminated fenced code regions (backtick or
 * tilde) in a markdown document. CommonMark-lite: an opener is a trimmed line
 * starting with >=3 fence characters (info string allowed); the region closes
 * at the next line of the same character, at least as long, with nothing else
 * on it; fences do not nest. Ranges cover opener through closer inclusive.
 * Returns `undefined` when a fence never closes — the malformed structure
 * makes every derived pairing unreliable, so callers fall back to plain
 * line-anchored detection.
 */
function computeFencedLineRanges(content: string): FencedRange[] | undefined {
  const ranges: FencedRange[] = [];
  let open: { char: string; len: number; rangeStart: number } | null = null;

  let lineStart = 0;
  while (lineStart <= content.length) {
    const nlIdx = content.indexOf("\n", lineStart);
    const lineEnd = nlIdx === -1 ? content.length : nlIdx;
    const trimmed = content.slice(lineStart, lineEnd).trim();

    if (open === null) {
      const fence = /^(`{3,}|~{3,})/.exec(trimmed)?.[1];
      if (fence !== undefined) {
        open = { char: fence.charAt(0), len: fence.length, rangeStart: lineStart };
      }
    } else if (new RegExp(`^${open.char}{${open.len},}$`).test(trimmed)) {
      ranges.push({ start: open.rangeStart, end: lineEnd });
      open = null;
    }

    if (nlIdx === -1) break;
    lineStart = nlIdx + 1;
  }

  return open === null ? ranges : undefined;
}

/** True when character index {@link idx} falls inside any of {@link ranges}. */
function insideFencedRange(ranges: readonly FencedRange[], idx: number): boolean {
  return ranges.some((r) => idx >= r.start && idx < r.end);
}

/**
 * True when {@link filePath} names a markdown-family file — the only host
 * syntax where code fences delimit literal regions. An omitted path keeps the
 * markdown assumption, matching {@link getMarkersForPath}'s HTML default.
 */
function isMarkdownHost(filePath?: string): boolean {
  if (filePath === undefined) return true;
  return /\.(md|mdc|markdown)$/i.test(filePath);
}

/**
 * True when a trimmed line is this variant's BEGIN marker — bare, or stamped
 * with exactly one whitespace-separated version token (the shape
 * {@link stampMarkerVersion} writes). Anything looser is prose, not a marker.
 */
function isStartMarkerLine(trimmed: string, variant: ManagedBlockMarkers): boolean {
  if (trimmed === variant.start) return true;
  if (variant.start.endsWith("-->")) {
    if (!trimmed.endsWith("-->")) return false;
    const head = variant.start.slice(0, -"-->".length).trimEnd();
    if (!trimmed.startsWith(head)) return false;
    const tail = trimmed.slice(head.length, -"-->".length);
    if (!/^[ \t]/.test(tail)) return false;
    const stamp = tail.trim();
    return stamp !== "" && !/\s/.test(stamp);
  }
  if (!trimmed.startsWith(variant.start)) return false;
  return /^[ \t]+\S+$/.test(trimmed.slice(variant.start.length));
}

/** A line matched by {@link findAnchoredLine}. */
interface AnchoredLine {
  /** Index of the line's first non-whitespace character (the marker token). */
  tokenIdx: number;
  /** Index of the `\n` terminating the line, or `content.length` on the last line. */
  lineEnd: number;
  /** The line, whitespace-trimmed. */
  trimmed: string;
}

/**
 * Find the first line at-or-after {@link fromIdx} whose trimmed form satisfies
 * {@link matches}, skipping lines inside {@link fenced} ranges. The walk backs
 * up to the start of the line containing `fromIdx`, then skips tokens strictly
 * before it — so an END search that starts mid-BEGIN-line can never re-match
 * the BEGIN line itself.
 */
function findAnchoredLine(
  content: string,
  matches: (trimmedLine: string) => boolean,
  fromIdx = 0,
  fenced?: readonly FencedRange[],
): AnchoredLine | null {
  let lineStart = content.lastIndexOf("\n", fromIdx > 0 ? fromIdx - 1 : 0) + 1;
  while (lineStart <= content.length) {
    const nlIdx = content.indexOf("\n", lineStart);
    const lineEnd = nlIdx === -1 ? content.length : nlIdx;
    if (!(fenced !== undefined && insideFencedRange(fenced, lineStart))) {
      const line = content.slice(lineStart, lineEnd);
      const trimmed = line.trim();
      if (matches(trimmed)) {
        const tokenIdx = lineStart + (line.length - line.trimStart().length);
        if (tokenIdx >= fromIdx) return { tokenIdx, lineEnd, trimmed };
      }
    }
    if (nlIdx === -1) break;
    lineStart = nlIdx + 1;
  }
  return null;
}

/** Count lines whose trimmed form satisfies {@link matches}, outside {@link fenced} ranges. */
function countAnchoredLines(
  content: string,
  matches: (trimmedLine: string) => boolean,
  fenced?: readonly FencedRange[],
): number {
  let count = 0;
  let lineStart = 0;
  while (lineStart <= content.length) {
    const nlIdx = content.indexOf("\n", lineStart);
    const lineEnd = nlIdx === -1 ? content.length : nlIdx;
    if (!(fenced !== undefined && insideFencedRange(fenced, lineStart))) {
      if (matches(content.slice(lineStart, lineEnd).trim())) count++;
    }
    if (nlIdx === -1) break;
    lineStart = nlIdx + 1;
  }
  return count;
}

/** A detected managed block: variant plus the character indices of its boundaries. */
interface DetectedBlock {
  variant: ManagedBlockMarkers;
  /** Index of the BEGIN marker token's first character. */
  startIdx: number;
  /** Index of the `\n` terminating the BEGIN line (block body starts past it). */
  startLineEnd: number;
  /** Index of the END marker token's first character. */
  endIdx: number;
  /** Index just past the END marker token. */
  endTokenEnd: number;
  /** The trimmed BEGIN line, for version-stamp parsing. */
  startLine: string;
}

/** Fence ranges for the host {@link filePath} implies, or `undefined` when the shield is off. */
function fencedRangesFor(content: string, filePath?: string): readonly FencedRange[] | undefined {
  return isMarkdownHost(filePath) ? computeFencedLineRanges(content) : undefined;
}

/**
 * Scan {@link content} for the first complete marker pair under the detection
 * rules in the module header. Returns `null` when no variant has a
 * line-anchored BEGIN line (bare or stamped) followed by its own END line.
 */
function detectBlock(content: string, filePath?: string): DetectedBlock | null {
  const preferred = filePath === undefined ? undefined : getMarkersForPath(filePath);
  const ordered =
    preferred === undefined
      ? MANAGED_BLOCK_VARIANTS
      : [preferred, ...MANAGED_BLOCK_VARIANTS.filter((v) => v.start !== preferred.start)];
  const fenced = fencedRangesFor(content, filePath);

  for (const variant of ordered) {
    const start = findAnchoredLine(content, (l) => isStartMarkerLine(l, variant), 0, fenced);
    if (start === null) continue;
    const end = findAnchoredLine(content, (l) => l === variant.end, start.lineEnd, fenced);
    if (end === null) continue;
    // Structural invariant: a reversed pair must never reach the substring
    // extractors (substring swaps its bounds instead of throwing). The END
    // search starting past the BEGIN line makes this unreachable today.
    if (start.tokenIdx >= end.tokenIdx) continue;
    return {
      variant,
      startIdx: start.tokenIdx,
      startLineEnd: start.lineEnd,
      endIdx: end.tokenIdx,
      endTokenEnd: end.tokenIdx + variant.end.length,
      startLine: start.trimmed,
    };
  }
  return null;
}

function locationSuffix(filePath?: string): string {
  return filePath === undefined ? "" : ` in ${filePath}`;
}

/**
 * Replace the content inside an existing managed block, choosing output
 * markers by {@link filePath} — a file carrying the wrong variant for its
 * extension is auto-repaired to the correct syntax on this merge (see
 * {@link wouldChangeMarkerVariant} for surfacing that rewrite). When
 * {@link version} is given, the BEGIN marker is stamped with it.
 *
 * Bytes before and after the block are preserved raw, with one documented
 * normalization: a POSIX final newline is appended when missing, so editors
 * and format-on-save hooks that add one do not cause rewrite churn. The
 * managed content is trimmed symmetrically with {@link extractManagedBlock},
 * making a second identical merge byte-stable.
 *
 * Throws `VALIDATION_ERROR` when no block is detected or when the detected
 * variant's BEGIN or END marker line appears more than once (corruption — the
 * caller decides whether to route to a repair path).
 */
export function insertManagedBlock(
  existingContent: string,
  managedContent: string,
  filePath?: string,
  version?: string,
): string {
  const detected = detectBlock(existingContent, filePath);
  if (detected === null) {
    throw new EngineError(
      `Managed block markers not found${locationSuffix(filePath)}. Expected a STAMITY:BEGIN/STAMITY:END pair on their own lines; restore both markers or regenerate the file, then retry.`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const fenced = fencedRangesFor(existingContent, filePath);
  const startCount = countAnchoredLines(
    existingContent,
    (l) => isStartMarkerLine(l, detected.variant),
    fenced,
  );
  if (startCount > 1) {
    throw new EngineError(
      `Corrupted managed block${locationSuffix(filePath)}: ${startCount} STAMITY:BEGIN markers found. Delete the extra start-marker lines so exactly one remains, then retry.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  const endCount = countAnchoredLines(existingContent, (l) => l === detected.variant.end, fenced);
  if (endCount > 1) {
    throw new EngineError(
      `Corrupted managed block${locationSuffix(filePath)}: ${endCount} STAMITY:END markers found. Delete the extra end-marker lines so exactly one remains, then retry.`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const output = getMarkersForPath(filePath);
  const begin = version === undefined ? output.start : stampMarkerVersion(output.start, version);
  const block = `${begin}\n${managedContent.trim()}\n${output.end}`;
  const before = existingContent.substring(0, detected.startIdx);
  const after = existingContent.substring(detected.endTokenEnd);
  const result = `${before}${block}${after}`;
  return result.endsWith("\n") ? result : `${result}\n`;
}

/**
 * The trimmed text between the BEGIN line and the END marker (any variant),
 * or `null` when no block is detected.
 */
export function extractManagedBlock(content: string, filePath?: string): string | null {
  const detected = detectBlock(content, filePath);
  if (detected === null) return null;
  return content.substring(detected.startLineEnd, detected.endIdx).trim();
}

/**
 * Three-way split at the block boundaries: `before` is every byte before the
 * BEGIN marker token, `block` spans BEGIN token through END token inclusive,
 * `after` is every byte past the END token. `before + block + after`
 * reassembles the input byte-exactly. `null` when no block is detected.
 */
export function splitAtManagedBlock(
  content: string,
  filePath?: string,
): { before: string; block: string; after: string } | null {
  const detected = detectBlock(content, filePath);
  if (detected === null) return null;
  return {
    before: content.substring(0, detected.startIdx),
    block: content.substring(detected.startIdx, detected.endTokenEnd),
    after: content.substring(detected.endTokenEnd),
  };
}

/**
 * Two-way split after the block: `prefix` runs through the END marker token
 * inclusive; `rest` is the preserved user suffix the merge path never
 * rewrites. `prefix + rest` reassembles the input byte-exactly. `null` when no
 * block is detected — including the truncated BEGIN-without-END shape, which
 * {@link isHealableManagedPrefix} classifies instead.
 */
export function splitAfterManagedBlock(
  content: string,
  filePath?: string,
): { prefix: string; rest: string } | null {
  const detected = detectBlock(content, filePath);
  if (detected === null) return null;
  return {
    prefix: content.substring(0, detected.endTokenEnd),
    rest: content.substring(detected.endTokenEnd),
  };
}

/**
 * True when {@link prefix} opens a managed block it never closes: some
 * variant has a line-anchored BEGIN (bare or stamped) with no matching END
 * after it — the truncated-write corruption a repair path may heal by
 * re-terminating the block. A complete pair, an END-only remnant, or content
 * with no markers at all is not healable. No path is taken, so the
 * markdown-default fence shield applies, consistent with the other
 * no-path reads.
 */
export function isHealableManagedPrefix(prefix: string): boolean {
  const fenced = computeFencedLineRanges(prefix);
  for (const variant of MANAGED_BLOCK_VARIANTS) {
    const start = findAnchoredLine(prefix, (l) => isStartMarkerLine(l, variant), 0, fenced);
    if (start === null) continue;
    if (findAnchoredLine(prefix, (l) => l === variant.end, start.lineEnd, fenced) === null) {
      return true;
    }
  }
  return false;
}

/**
 * User-authored content outside the block: the trimmed before-slice and
 * after-slice joined with a blank line. Content without a detectable block is
 * returned unchanged — it is all user content.
 */
export function extractCustomContent(content: string, filePath?: string): string {
  const detected = detectBlock(content, filePath);
  if (detected === null) return content;
  const before = content.substring(0, detected.startIdx).trim();
  const after = content.substring(detected.endTokenEnd).trim();
  return [before, after].filter((part) => part !== "").join("\n\n");
}

/**
 * Wrap {@link content} in a fresh managed block, choosing the marker variant
 * by {@link filePath} (HTML default) and stamping {@link version} into the
 * BEGIN marker when given. Content is trimmed (symmetry with
 * {@link extractManagedBlock}); output carries a POSIX final newline.
 */
export function wrapInManagedBlock(content: string, filePath?: string, version?: string): string {
  const markers = getMarkersForPath(filePath);
  const begin = version === undefined ? markers.start : stampMarkerVersion(markers.start, version);
  return `${begin}\n${content.trim()}\n${markers.end}\n`;
}

/** True when {@link content} contains a complete line-anchored marker pair of any variant. */
export function hasManagedBlock(content: string, filePath?: string): boolean {
  return detectBlock(content, filePath) !== null;
}

/**
 * True when a merge via {@link insertManagedBlock} would rewrite the on-disk
 * marker variant to the one {@link getMarkersForPath} selects for
 * {@link filePath} — the wrong-variant auto-repair. Callers surface a one-line
 * warning so the rewrite is attributable in diffs. `false` when no block is
 * detected or the variant already matches; a version-stamp difference alone is
 * not a variant change.
 */
export function wouldChangeMarkerVariant(existingContent: string, filePath?: string): boolean {
  const detected = detectBlock(existingContent, filePath);
  if (detected === null) return false;
  const output = getMarkersForPath(filePath);
  return detected.variant.start !== output.start || detected.variant.end !== output.end;
}

/**
 * The version stamped into the detected block's BEGIN marker, or `null` when
 * the block is absent or its marker is bare. The token is returned raw
 * (leading `v` stripped), not semver-validated — {@link isManagedBlockStale}
 * owns that judgement.
 */
export function getStampedVersion(content: string, filePath?: string): string | null {
  const detected = detectBlock(content, filePath);
  if (detected === null) return null;
  return parseMarkerVersion(detected.startLine);
}

/**
 * Only-when-stale contract: an emitted block is rewritten only when this
 * returns `true`. `false` exactly when a block is detected AND its stamped
 * version equals {@link currentVersion} under semver (leading `v` and build
 * metadata are semver-equal). Everything uncertain fails toward refresh:
 * no detectable block, a bare (unstamped) marker, a non-semver stamp, or a
 * non-semver {@link currentVersion} all return `true`.
 */
export function isManagedBlockStale(
  existingContent: string,
  currentVersion: string,
  filePath?: string,
): boolean {
  const stamped = getStampedVersion(existingContent, filePath);
  if (stamped === null) return true;
  if (semver.valid(stamped) === null || semver.valid(currentVersion) === null) return true;
  return !semver.eq(stamped, currentVersion);
}
