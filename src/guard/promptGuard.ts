import { createHmac, randomBytes } from "node:crypto";
import {
  CONTENT_DENY_PATTERNS,
  INJECTION_PATTERNS,
  INVISIBLE_SMUGGLING_CHARS,
  sanitizeContent,
  scanForDeniedPatterns,
  scanNormalized,
  type DenyHit,
  type DenyPattern,
} from "../denyscan/denyScan.ts";
import { getRunId } from "../shared/runId.ts";
import { EngineError } from "../types/errors.ts";
import { truncateAt } from "./outputBounds.ts";

/**
 * Prompt guard: the trust boundary for content crossing into or out of agent
 * context. Three controls, in the order a caller applies them:
 *
 * 1. {@link guardInput} — size cap, invisible-character normalization, deny
 *    scan, redaction.
 * 2. {@link wrapWithBoundary} / {@link extractBoundedContent} — frame the
 *    guarded content in markers that content cannot forge from the inside.
 * 3. {@link validateAgentOutput} — read-only verdict on what came back.
 *
 * This module owns the ORCHESTRATION of guarding. Every pattern, the
 * invisible-character class, and the sanitizer come from `denyscan`, which is
 * the single source of truth; a pattern table here would be a defect.
 */

/** Cap on content entering agent context in one payload. */
export const MAX_PHASE_INPUT_LENGTH = 500_000;

/** Cap on a single agent response. */
export const MAX_AGENT_OUTPUT_LENGTH = 1_000_000;

/**
 * Cap on one piece of user-authored content entering agent context.
 *
 * Two lanes read it today, and each one bounds a different surface with it:
 * `stamity learn capture` bounds the note it takes on stdin
 * (`../cli/commands/learn.ts`), and `stamity validate` bounds an overlay's body
 * patch (`../cli/commands/validate.ts`) — the `.customize.md` half, which is
 * appended to a shipped artifact's body and re-enters context on every run.
 * A body past this ceiling is truncated where it is read, so the patch on disk
 * stops being the patch the client gets; the check names the file rather than
 * letting the difference go unreported.
 */
export const MAX_USER_CONTENT_LENGTH = 250_000;

/** patternId reported when the length cap truncated the input. */
const LENGTH_CAP_ID = "input-length-cap";

/** Reported by the raw scan only — normalization removes the characters it names. */
const INVISIBLE_CHARS_ID = "invisible-chars";

/**
 * Untrusted input is scanned against both sets: the write-path vocabulary
 * carries the instruction-override phrasing ("ignore all previous
 * instructions") and the injection set carries the markup and encoding
 * vectors. The predecessor scanned only the injection half — an artifact of
 * the two tables living in different files, not a decision.
 */
const GUARD_PATTERNS: readonly DenyPattern[] = [...CONTENT_DENY_PATTERNS, ...INJECTION_PATTERNS];

/** Only observable before normalization strips the characters. */
const RAW_ONLY_PATTERNS: readonly DenyPattern[] = GUARD_PATTERNS.filter(
  (entry) => entry.id === INVISIBLE_CHARS_ID,
);

/**
 * Everything else runs after normalization, so a split keyword cannot hide —
 * and through {@link scanNormalized}, so a SPELLED or MASKED one cannot either.
 */
const NORMALIZED_PATTERNS: readonly DenyPattern[] = GUARD_PATTERNS.filter(
  (entry) => entry.id !== INVISIBLE_CHARS_ID,
);

const PATTERN_DESCRIPTIONS: ReadonlyMap<string, string> = new Map(
  GUARD_PATTERNS.map((entry) => [entry.id, entry.description]),
);

// ── Boundary markers ─────────────────────────────────────────────

/** A start/end pair framing one guarded payload. Opaque to the caller. */
export interface BoundaryMarkers {
  readonly open: string;
  readonly close: string;
}

const MARKER_TOKEN = "STAMITY_BOUNDARY";
const MARKER_SOURCE = `<!-- ${MARKER_TOKEN}:([A-Za-z0-9._-]{1,64}):(BEGIN|END):([0-9a-f]{16}):([0-9a-f]{16}) -->`;

/** Non-global: `exec` on it holds no `lastIndex` state between calls. */
const MARKER_EXACT = new RegExp(`^${MARKER_SOURCE}$`);

const LABEL_UNSAFE = /[^A-Za-z0-9._-]+/g;
const LABEL_EDGE_DASHES = /^-+|-+$/g;
const MAX_LABEL_LENGTH = 64;

/**
 * Process-private HMAC key, minted from crypto randomness on first use so
 * importing this module has no side effect.
 *
 * The run id is salted into the message rather than used as the key: it also
 * suffixes temp paths, so anything that can list the repo can read it, and a
 * readable key is not a key. Keeping it in the message still binds a marker to
 * its run — markers minted before a run id change stop verifying.
 */
let cachedGuardKey: Buffer | null = null;

function guardKey(): Buffer {
  cachedGuardKey ??= randomBytes(32);
  return cachedGuardKey;
}

function markerTag(label: string, nonce: string): string {
  return createHmac("sha256", guardKey())
    .update(`${getRunId()}:${label}:${nonce}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Restrict a caller label to the marker grammar. Normalization (rather than
 * rejection) keeps human labels like `"phase 2 review"` usable while making it
 * impossible to inject marker syntax through the label.
 */
function normalizeLabel(label: string): string {
  const normalized = label
    .slice(0, MAX_LABEL_LENGTH)
    .replace(LABEL_UNSAFE, "-")
    .replace(LABEL_EDGE_DASHES, "");
  if (normalized === "") {
    throw new EngineError(
      `boundary label ${JSON.stringify(label)} has no characters usable in a marker; pass a label containing letters, digits, '.', '_' or '-'`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return normalized;
}

interface ParsedMarker {
  label: string;
  kind: string;
  nonce: string;
  tag: string;
}

function parseMarker(marker: string): ParsedMarker | null {
  const match = MARKER_EXACT.exec(marker);
  if (match === null) return null;
  const [, label, kind, nonce, tag] = match;
  if (label === undefined || kind === undefined || nonce === undefined || tag === undefined) {
    return null;
  }
  return { label, kind, nonce, tag };
}

/**
 * A marker pair is authentic when both halves parse, agree on label and nonce,
 * carry the BEGIN/END kinds in that order, and carry a tag this process would
 * mint for that label and nonce. Content that copies the marker grammar fails
 * the last check — it cannot compute the tag without the process-private key.
 */
function markersAreAuthentic(markers: BoundaryMarkers): boolean {
  const open = parseMarker(markers.open);
  const close = parseMarker(markers.close);
  if (open === null || close === null) return false;
  if (open.kind !== "BEGIN" || close.kind !== "END") return false;
  if (open.label !== close.label || open.nonce !== close.nonce || open.tag !== close.tag) {
    return false;
  }
  return open.tag === markerTag(open.label, open.nonce);
}

/**
 * Mint a fresh marker pair for `label`. Every call mints a new nonce, so two
 * payloads framed under the same label never share markers and a marker
 * observed in one payload cannot re-frame the next.
 */
export function generateBoundaryMarkers(label: string): BoundaryMarkers {
  const safeLabel = normalizeLabel(label);
  const nonce = randomBytes(8).toString("hex");
  const tag = markerTag(safeLabel, nonce);
  return {
    open: `<!-- ${MARKER_TOKEN}:${safeLabel}:BEGIN:${nonce}:${tag} -->`,
    close: `<!-- ${MARKER_TOKEN}:${safeLabel}:END:${nonce}:${tag} -->`,
  };
}

/** Frame `content` in a fresh marker pair. One newline separates each marker from the body. */
export function wrapWithBoundary(
  content: string,
  label: string,
): { wrapped: string; markers: BoundaryMarkers } {
  const markers = generateBoundaryMarkers(label);
  return { wrapped: `${markers.open}\n${content}\n${markers.close}`, markers };
}

/**
 * Exact inverse of {@link wrapWithBoundary}: the body comes back byte for
 * byte, including leading and trailing whitespace, because only the two
 * newlines the wrapper added are removed.
 *
 * Returns null — never a best guess — when the framing cannot be trusted:
 * markers that do not parse, disagree, or fail the tag check; either marker
 * missing; a close marker before the open one; or either marker appearing more
 * than once, which is how content tries to re-frame a payload around itself.
 */
export function extractBoundedContent(wrapped: string, markers: BoundaryMarkers): string | null {
  if (!markersAreAuthentic(markers)) return null;

  const openIndex = wrapped.indexOf(markers.open);
  if (openIndex === -1) return null;
  if (wrapped.indexOf(markers.open, openIndex + 1) !== -1) return null;

  const bodyStart = openIndex + markers.open.length;
  const closeIndex = wrapped.indexOf(markers.close, bodyStart);
  if (closeIndex === -1) return null;
  if (wrapped.indexOf(markers.close, closeIndex + 1) !== -1) return null;

  let body = wrapped.slice(bodyStart, closeIndex);
  if (body.startsWith("\n")) body = body.slice(1);
  if (body.endsWith("\n")) body = body.slice(0, -1);
  return body;
}

// ── Input guard ──────────────────────────────────────────────────

export interface GuardResult {
  /** False when the cap tripped or any block-severity pattern matched. */
  ok: boolean;
  /** Normalized and redacted content. Populated even when `ok` is false. */
  content: string;
  /** Every hit, attributable by patternId and locatable by index. */
  violations: DenyHit[];
}

/**
 * Guard untrusted content on its way into agent context: cap the size,
 * normalize away invisible characters, scan, then redact.
 *
 * Order is the control. Invisible characters are scanned for on the raw text
 * (they are gone after normalization) and everything else on the normalized
 * text, so `ig<ZWSP>nore all previous instructions` is reported under both the
 * smuggling id and the override id instead of slipping past a raw-only scan.
 *
 * The deny scan is {@link scanNormalized}, the raw ∪ folded-and-joined union, so
 * the two character evasions stripping cannot answer — a keyword spelled in
 * lookalike letters, a keyword masked by a combining mark — are refused here as
 * well. This is the gate every phase input crosses, so it screened strictly less
 * than the pack-ingress gate did while carrying strictly more traffic.
 *
 * `ok` is false on any block-severity hit and on a cap trip; warn-severity
 * hits (invisible characters, homoglyph adjacency) are reported without
 * failing the payload. `content` is always the cleaned text, so a caller that
 * chooses to proceed on a warn never handles raw payload.
 *
 * Redaction covers what the raw copy matches, not what the normalized copy adds:
 * NFKC changes offsets and lengths, so a hit found only on that copy marks no
 * span in this text to remove. A lookalike-spelled override therefore comes back
 * REPORTED and `ok: false`, with its bytes still in `content` — which is the
 * verdict a caller acts on. Proceeding past `ok: false` is not a supported use.
 */
export function guardInput(content: string, opts?: { maxLength?: number }): GuardResult {
  const maxLength = opts?.maxLength ?? MAX_PHASE_INPUT_LENGTH;
  const violations: DenyHit[] = [];

  const capped = truncateAt(content, maxLength);
  if (capped.length !== content.length) {
    violations.push({
      patternId: LENGTH_CAP_ID,
      index: capped.length,
      // A length overflow has no matched span, so the snippet carries the
      // sizes a reader needs instead of payload text — the one block-severity
      // hit whose reportable form is prose, because there is no span to redact.
      snippet: `${content.length} characters over the ${maxLength} cap`,
      matchLength: 0,
      severity: "block",
    });
  }

  violations.push(...scanForDeniedPatterns(capped, RAW_ONLY_PATTERNS));
  const stripped = capped.replace(INVISIBLE_SMUGGLING_CHARS, "");
  violations.push(...scanNormalized(stripped, NORMALIZED_PATTERNS));

  const { sanitized } = sanitizeContent(stripped, GUARD_PATTERNS);
  return {
    ok: !violations.some((hit) => hit.severity === "block"),
    content: sanitized,
    violations,
  };
}

// ── Output validation ────────────────────────────────────────────

export interface OutputValidationResult {
  ok: boolean;
  /** One line per problem, ordered cap → injection → markers. */
  errors: string[];
}

/**
 * Judge an agent response without modifying it, so the caller decides between
 * retry, discard, and escalate.
 *
 * Marker handling fails closed in both directions: every marker in
 * `requiredMarkers` must be present, and any marker-shaped token that is not
 * one of them is a forgery report — including a marker this process really did
 * mint but the caller did not declare for this exchange.
 *
 * Injection hits are reported once per pattern with the first index and an
 * occurrence count, so a large hostile payload yields a readable list rather
 * than thousands of lines. Warn-severity hits are not errors; use
 * {@link guardInput} when the full typed hit list is needed.
 */
export function validateAgentOutput(
  output: string,
  opts?: { maxLength?: number; requiredMarkers?: string[] },
): OutputValidationResult {
  const maxLength = opts?.maxLength ?? MAX_AGENT_OUTPUT_LENGTH;
  const required = opts?.requiredMarkers ?? [];
  const errors: string[] = [];

  if (output.length > maxLength) {
    errors.push(`output is ${output.length} characters, over the ${maxLength} cap`);
  }

  const blocked = new Map<string, { index: number; count: number }>();
  for (const hit of scanForDeniedPatterns(output, GUARD_PATTERNS)) {
    if (hit.severity !== "block") continue;
    const seen = blocked.get(hit.patternId);
    if (seen === undefined) blocked.set(hit.patternId, { index: hit.index, count: 1 });
    else seen.count += 1;
  }
  for (const [patternId, { index, count }] of blocked) {
    const occurrences = count > 1 ? ` (${count} occurrences)` : "";
    errors.push(
      `injection pattern ${patternId} at index ${index}${occurrences}: ${PATTERN_DESCRIPTIONS.get(patternId) ?? "denied pattern"}`,
    );
  }

  const allowed = new Set(required);
  for (const marker of required) {
    if (!output.includes(marker)) errors.push(`required boundary marker is missing: ${marker}`);
  }
  for (const match of output.matchAll(new RegExp(MARKER_SOURCE, "g"))) {
    if (!allowed.has(match[0])) errors.push(`output carries an undeclared boundary marker: ${match[0]}`);
  }

  return { ok: errors.length === 0, errors };
}
