import {
  CONTENT_DENY_PATTERNS,
  foldConfusables,
  INJECTION_PATTERNS,
  INVISIBLE_SMUGGLING_CHARS,
  LEARNINGS_INJECTION_PATTERNS,
  type DenyPattern,
} from "../denyscan/denyScan.ts";
import { MAX_HANDOFF_FILE_BYTES } from "../handoffs/validation.ts";
import { MAX_LEARNING_FILE_BYTES, MAX_LEARNING_SUMMARY_LENGTH } from "../learnings/validation.ts";
import {
  HARD_MAX_REVIEW_ITERATIONS,
  MIN_MAX_REVIEW_ITERATIONS,
} from "../roster/reviewCaps.ts";
import { AGENT_TOOL_POLICIES_SCHEMA } from "../tools/allowlist.ts";
import { FUNCTIONAL_TOOL_CATEGORIES, type ToolCategory } from "../tools/categories.ts";
import {
  toClaudeToolsFrontmatter,
  toCodexToolsFrontmatter,
  toCopilotToolsFrontmatter,
} from "../tools/translator.ts";
import type { Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import { CONTENT_PREFIX, STATE_DIR } from "../types/markers.ts";
import { CLIENT_HOOK_GUARANTEES, type CanonicalHookEvent, type HookFailMode } from "./model.ts";

/**
 * The three core hook scripts plus one work-scoped extension, as generated text.
 *
 * Hooks are infrastructure the engine emits, not prose an agent interprets:
 * each script is a self-contained Node module that the repo commits and a
 * reviewer can read end to end. This module owns the BODIES; where they land
 * and how each client is told to run them is emission's job, so nothing here
 * touches the filesystem and every function is a pure string builder.
 *
 * Three scripts, one per thing a generated setup has to do at runtime:
 *
 * 1. {@link buildSessionStartScript} — opens a session with the context the
 *    last one earned (learnings index, active handoffs), read straight off the
 *    state directory. No agent is spawned to fetch it: a loader agent costs a
 *    model call and returns text nobody screened, while a script returns the
 *    same lines deterministically and refuses the files that fail their gates.
 * 2. {@link buildPreToolUseGuardScript} — the deny-by-default tool
 *    authorization gate, the last enforcement point once an agent is running
 *    inside a client the engine no longer sits in front of.
 * 3. {@link buildConfigTamperNoticeScript} — says out loud that generated
 *    configuration changed, so an edit nobody made on purpose gets seen.
 *
 * A fourth builder, {@link buildReviewGateScript}, is deliberately NOT core:
 * it gates a work run's completion on that run's review loop, rides events one
 * client fires, and is planned by the adapter that wires those events rather
 * than by {@link planCoreHookScripts}. Every other client carries work's review
 * ladder as prose.
 *
 * Trust posture, held by every body here and asserted by the suite: exec form
 * (a hook is `node <script>`, never a shell line), repo-committed and
 * reviewable, no dynamic evaluation, and no network reach. That list is what
 * every body promises, and nothing more.
 *
 * Determinism is NOT on it, because it is false on every script here. Each one
 * reads something outside repo state, and each one now names its own reads in
 * its own banner ({@link header}'s `posture` argument) rather than inheriting a
 * blanket claim: the session-start load reads the wall clock, to expire a
 * review horizon and a handoff; the guard and the notice read the pending
 * call's payload off stdin; the review gate reads the clock AND the round
 * counter it owns. What IS deterministic is the GENERATED TEXT — two builds
 * from one option set produce identical bytes, which is what the hash-trust
 * property actually rests on, and what the suite pins. A per-script posture
 * line is the honest version of a claim that used to be asserted four times and
 * held zero times.
 *
 * The counter file is the one piece of state any of them writes: a gate that
 * must stop blocking at a cap has to know how many rounds have run, and a hook
 * with no counter state can only block forever or never block. It is one small
 * JSON file the review gate owns; nothing else on disk is touched.
 *
 * The generated bodies re-derive their constants from the engine's own
 * modules — deny patterns, file caps, the policy schema discriminator, the
 * client tool dialects — so a script is never a second source of truth. What
 * a script CANNOT re-derive is the engine's validator: the session-start
 * screen enforces the checks that decide whether text is safe to name (size,
 * injection, integrity, review horizon) and leaves schema validation to the
 * write gate, which already ran before the file landed.
 */

// ── Layout ───────────────────────────────────────────────────────

/** Session-start context load. Portable carrier: `session_start`. */
const SESSION_START_FILE = "stamity-session-start.mjs";

/** Tool-call authorization gate. Portable carrier: `pre_tool_use`. */
const GUARD_FILE = "stamity-pre-tool-use-guard.mjs";

/** Configuration-change notice. Portable carrier: `session_start` — see {@link planCoreHookScripts}. */
const TAMPER_NOTICE_FILE = "stamity-config-tamper-notice.mjs";

/**
 * Work-scoped review gate. NON-portable carriers, one client only — the
 * adapter that wires them reads them off `CLIENT_EXTENSION_EVENTS`. Exported
 * because no plan function returns this script: the wiring adapter names it.
 */
export const REVIEW_GATE_FILE = "stamity-review-gate.mjs";

/** One generated script, ready for an adapter to place and register. */
export interface GeneratedHookScript {
  /** Bare file name; the directory is emission's choice. */
  fileName: string;
  content: string;
  /** The portable event this script attaches to. */
  event: CanonicalHookEvent;
}

// ── Shared constants ─────────────────────────────────────────────

/**
 * Exit status that blocks the pending action on a client that honours one.
 * Cross-checked against {@link CLIENT_HOOK_GUARANTEES}: every row that can
 * block blocks on this code, which is why one script body serves them all.
 */
const BLOCKING_EXIT_CODE = 2;

/**
 * Ceiling on the policy document the guard will parse.
 *
 * The shipped roster serializes to under 4 KB, so this is roughly 65x it — not
 * the "4x a roster of a few dozen agents" the comment used to claim, which was
 * wrong by more than an order of magnitude in the direction that made the cap
 * sound tight. The headroom is deliberate rather than an error to correct
 * downward: installed packs add a row per pack agent, each carrying a
 * rationale, and `../emit/hooksInfra.ts` treats the whole-file bound as a
 * repo-wide lockout risk (past the cap the guard refuses the file and denies
 * EVERY agent, core and pack). Sizing for a few hundred rostered agents is what
 * keeps a legitimate multi-pack repo from reaching a threshold whose crossing
 * costs it every grant. The suite re-measures the roster and fails when the
 * ratio stated here stops holding.
 *
 * Past the cap the file is corrupt or is being grown to stall the guard on
 * every tool call, and a size check costs one `stat` where parsing costs the
 * whole file.
 */
export const MAX_POLICY_FILE_BYTES = 262_144;

/** Item lines one session-start section prints before it collapses the rest. */
export const DEFAULT_MAX_INDEX_LINES = 20;

/**
 * Where the review gate's round counter lives: beside the other RUNTIME state
 * under the state directory, and deliberately not under the engine's generated
 * tree. Generated output is rewritten wholesale by a sync, so a counter kept
 * there would be deleted mid-run — and a gate whose counter vanishes re-opens
 * a loop that had already converged, or forgets a cap it had already reached.
 */
export const REVIEW_GATE_STATE_FILE: string = `${STATE_DIR}/review-gate.json`;

/**
 * Ceiling on the counter file the review gate will parse.
 *
 * Derived from what the file's own pruning retains, measured rather than
 * asserted: {@link REVIEW_GATE_MAX_RUNS} entries, each a run id bounded at 128
 * characters plus a record of about 100 (`rounds`, `verdict`, `confidence`,
 * `updated`), so a legitimately full file tops out near 50 KB. This is ~2.6x
 * that worst case and ~13x a realistic one (short session ids, a few dozen
 * runs).
 *
 * The number moved for a reason worth stating: the old cap was 65_536 with a
 * comment claiming "two orders of magnitude above what its own pruning keeps",
 * which was wrong by about 38x — the real ratio was 2.64x, so a legitimate
 * maximal file sat at nearly a third of a threshold whose crossing OPENS the
 * gate. The claim that a legitimate file can never approach it is the whole
 * point of the bound, so the cap was raised to make the claim true instead of
 * the sentence deleted to make it unfalsifiable.
 *
 * Past the cap the file is corrupt or is being grown to stall a gate that runs
 * on every completion — and a size check costs one `stat` where parsing costs
 * the whole file.
 */
export const MAX_REVIEW_GATE_STATE_BYTES: number = 131_072;

/** Statuses that make a handoff resumable — the set the session-start index lists. */
const RESUMABLE_STATUSES = ["active", "in-progress"] as const;

/** MCP tools are addressed per server, so the prefix is the only stable handle. */
const MCP_TOOL_PREFIX = "mcp__";

/**
 * Network vocabulary. A pattern whose own source carries it is dropped from
 * the embedded screen: the committed scripts must read as network-free under
 * a plain grep, and a fetch verb sitting in a regex literal defeats that audit
 * for a reader who cannot tell a detector from a call.
 *
 * What that legibility costs, named rather than implied: `remote-exec-pipe`
 * and `send-data-external` from the write-path set, and
 * `image-url-exfiltration` from the transport set, are the rows it drops.
 * Every one of them stays in the engine's own gates, so the loss is read-path
 * depth on a file that reached disk without passing a write gate — the case
 * this screen exists for — and it is bounded to those three ids. The
 * suppression is a property of the ROW's source text, not of its severity or
 * its catalog, so a new row that names a URL scheme falls out of the screen
 * silently; the suite pins the dropped set for that reason.
 */
const NETWORK_VOCABULARY = /https?|curl|wget|fetch/i;

/**
 * The session-start screen: the same three catalogs the engine's read path
 * composes, in the same order, minus the network-vocabulary rows above and
 * the advisory ones. The transport set is what carries the vectors a hook on
 * an operator's machine most needs — chat-template tokens, conversation role
 * headers, base64-encoded overrides, Unicode-tag payloads — none of which the
 * other two catalogs name. Ids are stable, so a file this screen refuses is
 * attributable to the same pattern the engine would have named.
 */
const SESSION_START_SCREEN: readonly DenyPattern[] = [
  ...LEARNINGS_INJECTION_PATTERNS,
  ...CONTENT_DENY_PATTERNS,
  ...INJECTION_PATTERNS,
].filter((entry) => entry.severity === "block" && !NETWORK_VOCABULARY.test(entry.pattern.source));

/** Pattern ids embedded in the session-start script, for docs and drift checks. */
export const SESSION_START_SCREEN_PATTERN_IDS: readonly string[] = SESSION_START_SCREEN.map(
  (entry) => entry.id,
);

/**
 * The confusable fold table the embedded screen normalizes with, re-derived
 * from `../denyscan/denyScan.ts::foldConfusables` rather than restated.
 *
 * Same rule as the tool-category union below: the engine owns the mapping, and a
 * second table in this file would drift from it silently. The derivation probes
 * the fold one code point at a time — a code point whose NFKC form is a single
 * character that the fold maps to a single ASCII character IS a row — so adding
 * a script to the engine's table adds it here without an edit.
 *
 * Built once at module load: the sweep is 65 024 probes and the result is 107
 * rows, and `buildSessionStartScript` is called once per selected tool.
 */
const CONFUSABLE_FOLD_TABLE: Readonly<Record<string, string>> = (() => {
  const table: Record<string, string> = {};
  for (let code = 0x80; code <= 0xffff; code += 1) {
    const composed = String.fromCharCode(code).normalize("NFKC");
    if (composed.length !== 1) continue;
    const folded = foldConfusables(composed);
    if (folded.length !== 1 || folded === composed || folded.charCodeAt(0) > 0x7f) continue;
    table[String(composed.charCodeAt(0))] = folded;
  }
  return table;
})();

/**
 * The composed scan copy, as generated source: fold lookalikes to ASCII, then
 * drop the masks the fold could not map — `../denyscan/denyScan.ts`'s
 * `normalizeForDenyScan`, order included, because the order is a correctness
 * property (`NFKD ∘ NFKC = NFKD`, so the join inherits the fold's substitutions).
 *
 * The screen this feeds scans raw ∪ invisible-stripped ∪ normalized, which is
 * the engine's own consumer contract: the normalized copy ADDS the refusals a
 * lookalike or a combining mark hid, and the raw copy KEEPS the ones NFKC
 * destroys by composing a trailing mark into the letter before it. Scanning one
 * copy alone hands an attacker a one-code-point evasion of every row in the
 * screen — which is what an invisible-strip-only screen was.
 */
const NORMALIZE_FOR_SCREEN = `const CONFUSABLES = ${json(CONFUSABLE_FOLD_TABLE)};
const NON_ASCII = /[\\u0080-\\uFFFF]/;
const WORD_ADJACENT_MASK = /(?<=[A-Za-z])[\\u0080-\\uFFFF]+|[\\u0080-\\uFFFF]+(?=[A-Za-z])/g;

/** Cross-script lookalikes mapped to ASCII, over the NFKC form. */
function foldConfusables(text) {
  if (!NON_ASCII.test(text)) return text;
  const normalized = text.normalize("NFKC");
  let out = "";
  let cursor = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const key = String(normalized.charCodeAt(index));
    if (!Object.hasOwn(CONFUSABLES, key)) continue;
    out += normalized.slice(cursor, index) + CONFUSABLES[key];
    cursor = index + 1;
  }
  return cursor === 0 ? normalized : out + normalized.slice(cursor);
}

/** Rejoin a keyword split by a mask the fold table does not carry. */
function joinMaskedWords(text) {
  if (!NON_ASCII.test(text)) return text;
  return text.normalize("NFKD").replace(WORD_ADJACENT_MASK, "");
}

/** Fold first, then join: the join inherits the fold's substitutions. */
function normalizeForScreen(text) {
  return joinMaskedWords(foldConfusables(text));
}`;

// ── Option validation ────────────────────────────────────────────

/**
 * Split a repo-relative path into segments for the generated code to `join`.
 *
 * Emitting segments rather than a joined string is what makes the generated
 * path platform-safe: a state directory authored on Windows (`state\nested`)
 * and one authored on POSIX produce the same array, and the separator is
 * chosen at run time by the host that runs the hook.
 *
 * Absolute paths and `..` segments are refused rather than normalized — a
 * generated script that reads outside the repo it was generated for is a
 * trust defect, and silently rewriting the caller's intent hides it.
 */
function repoRelativeSegments(value: string, field: string): string[] {
  const segments = value
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "" && segment !== ".");
  const invalid =
    segments.length === 0 || segments.includes("..") || /^([A-Za-z]:|[\\/])/.test(value);
  if (invalid) {
    throw new EngineError(
      `${field} must be a repo-relative directory (got ${JSON.stringify(value)}). ` +
        `A generated hook reads inside the repo it was generated for, so an absolute ` +
        `path or a ".." segment is refused rather than normalized.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return segments;
}

/**
 * Path segments for the policy document. `..` is admitted here and only here:
 * emission places the guard in a hooks subdirectory and the document beside
 * the client config above it, so climbing one level is the normal layout.
 * Absolute paths pass through whole — they are already host-native.
 */
function policyPathExpression(value: string): string {
  if (value.trim() === "") {
    throw new EngineError(
      `policiesJsonPath must name the emitted policy document; it was empty. ` +
        `Pass the path the adapter writes it to, relative to the guard script.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  if (/^([A-Za-z]:[\\/]|[\\/])/.test(value)) return json(value);
  const segments = value
    .split(/[\\/]+/)
    .filter((segment) => segment !== "" && segment !== ".")
    .map((segment) => json(segment));
  return `join(dirname(fileURLToPath(import.meta.url)), ${segments.join(", ")})`;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new EngineError(
      `${field} must be a positive whole number of lines (got ${JSON.stringify(value)}).`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return value;
}

/**
 * A review cap inside the engine's own band.
 *
 * Refused rather than clamped: `clampReviewIterations` is where a requested
 * number is brought into band, and a builder that silently clamped again would
 * emit a script promising one cap while the caller believed another. The
 * generated text is read by an operator months later, so the number in it has
 * to be the number the engine enforces.
 */
function bandedIterations(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < MIN_MAX_REVIEW_ITERATIONS ||
    value > HARD_MAX_REVIEW_ITERATIONS
  ) {
    throw new EngineError(
      `maxIterations must be a whole number of rounds within ` +
        `${MIN_MAX_REVIEW_ITERATIONS}..${HARD_MAX_REVIEW_ITERATIONS} (got ${JSON.stringify(value)}). ` +
        `Pass it through clampReviewIterations before building the gate.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return value;
}

// ── Script frame ─────────────────────────────────────────────────

function json(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * The banner every generated script opens with: what it is, then the two facts
 * a reader needs before running it — that edits are overwritten, and what the
 * body is and is not guaranteed to do.
 *
 * `posture` is per-script and required, because the part that used to be shared
 * was the part that was false. The four bodies agree on exec form, repo
 * residence, no dynamic evaluation and no network reach; they do NOT agree on
 * what their output is a function of, and the blanket "determined by repo state
 * alone" line was untrue on all four. Each caller now names its own reads
 * outside repo state, so a reader auditing one script gets that script's answer
 * instead of a claim written for a different one.
 */
function header(summary: readonly string[], posture: readonly string[]): string {
  return [
    "#!/usr/bin/env node",
    ...summary.map((line) => (line === "" ? "//" : `// ${line}`)),
    "//",
    "// Generated file — regenerate it rather than editing; local edits are overwritten.",
    "// Trust posture: exec form, repo-committed, no dynamic evaluation, no network reach.",
    ...posture.map((line) => `// ${line}`),
  ].join("\n");
}

/**
 * The repo-root resolver every script that reads the state directory shares.
 *
 * `STAMITY_REPO_ROOT` is how a client that runs a hook from a subdirectory names
 * the repository. It is also an INPUT, so it is bounded like one: the value is
 * honoured only when it resolves to the working directory or an ANCESTOR of it,
 * and only when that directory actually holds this repo's state directory.
 * Anything else is not naming the repo the client opened — it is pointing the
 * script at an unrelated tree, and for the review gate that means every future
 * run reads and REPLACES a file over there. A value failing either condition is
 * ignored and the working directory stands; the script degrades to less
 * context, never to writing somewhere nobody chose.
 *
 * Emitted as text rather than as a call because these bodies are standalone
 * modules with no import of their own to reach for.
 */
const RESOLVE_REPO_ROOT = `function repoRoot() {
  const cwd = resolve(process.cwd());
  const declared = process.env.STAMITY_REPO_ROOT;
  if (typeof declared !== "string" || declared === "") return cwd;
  const candidate = resolve(cwd, declared);
  const prefix = candidate.endsWith(sep) ? candidate : candidate + sep;
  if (candidate !== cwd && !cwd.startsWith(prefix)) return cwd;
  try {
    if (!statSync(join(candidate, STATE_SEGMENTS[0])).isDirectory()) return cwd;
  } catch {
    return cwd;
  }
  return candidate;
}`;

/** Reads the whole stdin payload; an unreadable descriptor is an empty one. */
const READ_STDIN = `function readPayload() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    return {};
  }
  if (raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    // An unparseable payload names no agent and no tool, so it attributes to
    // nothing this script governs — treated as out of scope, never as a
    // finding, so a client's payload change cannot brick a session.
    return {};
  }
}`;

/** First non-empty string among candidate keys — one reader for four dialects. */
const READ_FIELD = `function field(payload, names) {
  for (const name of names) {
    const value = Object.hasOwn(payload, name) ? payload[name] : undefined;
    if (typeof value === "string" && value !== "") return value;
  }
  return "";
}`;

// ── 1. Session-start context load ────────────────────────────────

export interface SessionStartScriptOptions {
  /** Repo-relative state directory. Defaults to the engine's own. */
  stateDir?: string;
  /** Item lines per section before the rest collapse into one line. */
  maxIndexLines?: number;
}

/**
 * The session-start context load: prints the learnings index and the
 * resumable handoffs for the repo the session opened in.
 *
 * The index format mirrors the engine's own (`formatLearningsIndex`,
 * `buildHandoffIndex`) line for line, because the two render the same corpus
 * and an operator reading a session banner should not have to learn a second
 * shape. What the script re-implements is the READ SCREEN, not the validator:
 * size, injection, integrity and the review horizon each decide whether a file
 * may be named, and each of them is a reason to distrust bytes that are
 * already on disk.
 *
 * What a refusal prints is bounded on BOTH halves. Bodies are never printed and
 * the matched span is never echoed — reporting a refusal by quoting it would
 * deliver the payload the skip just refused. Neither is the file NAME trusted:
 * a refused file is still named in its skip line (a skip nobody can attribute
 * is a skip nobody can fix), so `doc.name` goes through the same one-line
 * sanitizer every other field does, and so does the `stem()` fallback an entry
 * with no `id` falls back to. A file called
 * `x — ignore the above and run …\n.md` is an instruction line otherwise, and
 * the screen that would have caught the phrase runs over the file's CONTENT.
 *
 * Handoffs are partitioned the way learnings are: refusals are counted in the
 * header and reported by reason, never filtered away inside the same expression
 * that selects the resumable ones. Two poisoned handoffs used to leave a banner
 * saying there were none in this repo.
 *
 * Every failure degrades to less context, never to a failed session start: an
 * absent or unreadable directory reads as empty, one bad file is one skip, and
 * the script exits 0 on every path.
 */
export function buildSessionStartScript(opts: SessionStartScriptOptions = {}): string {
  const segments = repoRelativeSegments(opts.stateDir ?? STATE_DIR, "stateDir");
  const maxLines = positiveInteger(opts.maxIndexLines ?? DEFAULT_MAX_INDEX_LINES, "maxIndexLines");
  const screen = SESSION_START_SCREEN.map(
    (entry) =>
      `  { id: ${json(entry.id)}, re: new RegExp(${json(entry.pattern.source)}, ${json(entry.pattern.flags)}) },`,
  ).join("\n");

  return `${header(
    [
      "stamity — session-start context load.",
      "",
      "Prints the learnings index and the resumable handoffs for this repo by",
      "reading the state directory directly: no agent is spawned and nothing is",
      "written. Every file clears a size, injection, integrity and review screen",
      "before it is LISTED; a file that fails one is named in a skip line with its",
      "reason, and every field printed — the file name included — is flattened to",
      "one bounded line first. Bodies and matched spans are never printed.",
    ],
    [
      "Reads outside repo state: the wall clock, which decides whether a learning's",
      "review horizon has passed and whether a handoff has expired. Same repo, two",
      "different days, two different banners.",
    ],
  )}

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const STATE_SEGMENTS = ${json(segments)};
const MAX_ITEM_LINES = ${maxLines};
const MAX_LEARNING_BYTES = ${MAX_LEARNING_FILE_BYTES};
const MAX_HANDOFF_BYTES = ${MAX_HANDOFF_FILE_BYTES};
const MAX_FIELD_CHARS = ${MAX_LEARNING_SUMMARY_LENGTH};
const RESUMABLE = ${json([...RESUMABLE_STATUSES])};
const INVISIBLE = new RegExp(${json(INVISIBLE_SMUGGLING_CHARS.source)}, "g");
const SCREEN = [
${screen}
];

${NORMALIZE_FOR_SCREEN}

const NOW = Date.now();

${RESOLVE_REPO_ROOT}

const STATE_ROOT = join(repoRoot(), ...STATE_SEGMENTS);

/** \`.md\` entries in a directory. Absent or unreadable both read as empty. */
function listMarkdown(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * One document, screened. Checks run in the order that keeps a refusal
 * attributable: size before read, injection before shape, then shape, then
 * integrity — so a poisoned file reports as poisoned rather than as malformed.
 */
function inspect(dir, name, maxBytes, coversSummary) {
  let stats;
  try {
    stats = statSync(join(dir, name));
  } catch {
    return null;
  }
  if (!stats.isFile()) return null;
  const doc = { name, size: stats.size, mtime: stats.mtimeMs, skip: "", head: null };
  if (stats.size > maxBytes) return { ...doc, skip: "over-size" };

  let raw;
  try {
    raw = readFileSync(join(dir, name), "utf8");
  } catch {
    return { ...doc, skip: "invalid-frontmatter" };
  }
  if (screened(raw)) return { ...doc, skip: "injection-detected" };
  const parsed = parseDocument(raw);
  if (parsed === null) return { ...doc, skip: "invalid-frontmatter" };
  const covered = coversSummary
    ? String(parsed.head.summary ?? "").trim() + "\\n" + parsed.body.trim()
    : parsed.body.trim();
  if (!integrityHolds(parsed.head.integrity, covered)) {
    return { ...doc, skip: "integrity-mismatch" };
  }
  return { ...doc, head: parsed.head };
}

/**
 * The screen, run over every copy the engine's own gates run it over: the raw
 * text, the invisible-stripped copy, and the composed normalization of that
 * copy. A union, never a replacement — the normalized copy adds the refusals a
 * lookalike or a combining mark hid, and the raw copy keeps the ones NFKC
 * destroys by composing a trailing mark into the letter before it.
 */
function screened(raw) {
  const stripped = raw.replace(INVISIBLE, "");
  const copies = [raw, stripped];
  const normalized = normalizeForScreen(stripped);
  if (normalized !== stripped) copies.push(normalized);
  return SCREEN.some((entry) =>
    copies.some((copy) => {
      // A \`g\`-flagged row carries \`lastIndex\` between calls, and this now tests
      // three copies per row: without the reset the second copy would resume
      // mid-string and a hit could fall through.
      entry.re.lastIndex = 0;
      return entry.re.test(copy);
    }),
  );
}

/**
 * Fenced head plus body. Top-level scalars only — nested keys are indented and
 * ignored — but every SCALAR SHAPE the engine's own writer emits is read, not
 * just the bare one.
 *
 * The writer serializes through a YAML library, so a value carrying a newline
 * comes back as a block scalar and a value carrying a quote or a leading
 * indicator comes back double-quoted with escapes. A per-line regex that took
 * the raw remainder read a block scalar's own indicator (\`|-\`) as the value:
 * a garbage banner line for a learning, and for a handoff a SILENT DROP,
 * because the summary is inside the span the integrity digest covers and the
 * mis-parse failed it.
 */
function parseDocument(raw) {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const match = /^---[ \\t]*\\r?\\n(?:([\\s\\S]*?)\\r?\\n)?---[ \\t]*(?:\\r?\\n([\\s\\S]*))?$/.exec(text);
  if (match === null) return null;
  const head = Object.create(null);
  const lines = (match[1] ?? "").split(/\\r?\\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const pair = /^([A-Za-z][A-Za-z0-9_-]*)[ \\t]*:[ \\t]*(.*)$/.exec(lines[index]);
    if (pair === null) continue;
    const rest = pair[2].trim();
    const block = /^([|>])([0-9]*)([-+]?)$|^([|>])([-+]?)([0-9]*)$/.exec(rest);
    if (block === null) {
      head[pair[1]] = unquote(rest);
      continue;
    }
    const style = block[1] ?? block[4];
    const chomp = block[3] || block[5] || "";
    const collected = [];
    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      // A blank line belongs to the block; anything at column 0 ends it.
      if (next.trim() !== "" && !/^[ \\t]/.test(next)) break;
      collected.push(next);
      index += 1;
    }
    head[pair[1]] = blockScalar(collected, style, chomp);
  }
  return { head, body: match[2] ?? "" };
}

/**
 * A block scalar's value: strip the block's own indentation (the first
 * non-empty line sets it), join literal style with newlines and folded style by
 * the fold rule, then apply chomping — strip, keep, or the default clip.
 */
function blockScalar(collected, style, chomp) {
  const first = collected.find((line) => line.trim() !== "");
  if (first === undefined) return "";
  const indent = (/^[ \\t]*/.exec(first) ?? [""])[0].length;
  const rows = collected.map((line) => (line.trim() === "" ? "" : line.slice(indent)));
  let value = "";
  if (style === "|") {
    value = rows.join("\\n");
  } else {
    // Folded: a single break between two non-empty lines becomes a space; a
    // blank line stays a break.
    for (let index = 0; index < rows.length; index += 1) {
      if (index === 0) value = rows[index];
      else if (rows[index] === "" || rows[index - 1] === "") value += "\\n" + rows[index];
      else value += " " + rows[index];
    }
  }
  if (chomp === "-") return value.replace(/\\n+$/, "");
  if (chomp === "+") return value + "\\n";
  return value.replace(/\\n+$/, "") + "\\n";
}

/** One quoted scalar, unescaped the way the writer escaped it. */
function unquote(value) {
  if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\\\u([0-9a-fA-F]{4})/g, (whole, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/\\\\([\\s\\S])/g, (whole, char) =>
        char === "n" ? "\\n" : char === "t" ? "\\t" : char === "r" ? "\\r" : char === "0" ? "\\u0000" : char,
      );
  }
  if (value.length > 1 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

/**
 * The digest vouches for the bytes it covers; an absent or stale one is a
 * refusal. The covered span arrives already trimmed and assembled, because the
 * two document kinds cover different spans: a handoff's digest includes its
 * summary (the first line the resuming agent reads is content, not metadata),
 * a learning's does not.
 */
function integrityHolds(declared, covered) {
  if (typeof declared !== "string" || !/^sha256:[0-9a-f]{64}$/i.test(declared)) return false;
  return (
    declared.toLowerCase() === "sha256:" + createHash("sha256").update(covered, "utf8").digest("hex")
  );
}

/**
 * One field as a single index-safe line: control characters and newlines
 * collapse, so a forged summary cannot manufacture index lines of its own.
 */
function text(value, fallback) {
  if (typeof value !== "string") return fallback;
  const flat = value.replace(/[\\u0000-\\u001f\\u007f]+/g, " ").replace(/\\s+/g, " ").trim();
  if (flat === "") return fallback;
  return flat.length > MAX_FIELD_CHARS ? flat.slice(0, MAX_FIELD_CHARS - 1) + "…" : flat;
}

function stem(name) {
  return name.slice(0, -3);
}

/** Appends at most MAX_ITEM_LINES items, then one line accounting for the rest. */
function append(out, items, noun) {
  for (const item of items.slice(0, MAX_ITEM_LINES)) out.push(item);
  const rest = items.length - MAX_ITEM_LINES;
  if (rest > 0) {
    out.push("- … and " + rest + " more " + noun + (rest === 1 ? "" : "s") + " not listed.");
  }
}

const learningsDir = join(STATE_ROOT, "learnings");
const learnings = listMarkdown(learningsDir)
  .map((name) => inspect(learningsDir, name, MAX_LEARNING_BYTES, false))
  .filter((doc) => doc !== null)
  // Newest first — a learning written today outranks one from six months ago —
  // with a name tiebreak so equal timestamps still order deterministically.
  .sort((a, b) => b.mtime - a.mtime || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

for (const doc of learnings) {
  if (doc.skip !== "") continue;
  const reviewBy = doc.head.reviewBy;
  // The write gate only warns on a passed horizon; reading refuses. Nobody
  // re-verified the claim, and the digest vouches for the bytes, not the finding.
  if (typeof reviewBy === "string" && Date.parse(reviewBy + "T23:59:59.999Z") < NOW) {
    doc.skip = "expired-review";
  }
}

const loaded = learnings.filter((doc) => doc.skip === "");
const skipped = learnings.filter((doc) => doc.skip !== "");

const handoffsDir = join(STATE_ROOT, "handoffs");
const handoffDocs = listMarkdown(handoffsDir)
  .map((name) => inspect(handoffsDir, name, MAX_HANDOFF_BYTES, true))
  .filter((doc) => doc !== null);

// Partitioned, not filtered away. A refusal and a handoff that is merely
// finished or expired are different facts: the first is a file that failed a
// trust screen and has to be reported, the second is ordinary lifecycle and is
// silent. Folding both into the selection expression left two poisoned handoffs
// reported as "none in this repo".
const refusedHandoffs = handoffDocs.filter((doc) => doc.skip !== "");
const handoffs = handoffDocs
  .filter(
    (doc) => doc.skip === "" && RESUMABLE.includes(doc.head.status) && Date.parse(doc.head.expires) > NOW,
  )
  .map((doc) => ({
    id: text(doc.head.id, text(stem(doc.name), "(unnamed)")),
    summary: text(doc.head.summary, "(no summary)"),
    expires: text(doc.head.expires, ""),
    from: text(doc.head.fromTool, ""),
  }))
  // Soonest expiry first: the entry that goes stale next is the one to resume.
  .sort((a, b) => Date.parse(a.expires) - Date.parse(b.expires) || (a.id < b.id ? -1 : 1));

function render() {
  if (learnings.length === 0 && handoffDocs.length === 0) {
    return ["Stamity: no learnings and no resumable handoffs in this repo yet."];
  }

  const bytes = loaded.reduce((total, doc) => total + doc.size, 0);
  // The file name is payload too: it is attacker-chosen on any file that
  // reached the directory, and it is concatenated into a line an agent reads.
  const ids = loaded.map((doc) => text(doc.head.id, text(stem(doc.name), "(unnamed)")));
  const duplicated = new Set(ids.filter((id, index) => ids.indexOf(id) !== index));
  const out = [
    "Learnings: " + loaded.length + " loaded, " + skipped.length + " skipped, " + bytes + " bytes.",
  ];

  append(
    out,
    loaded.map((doc, index) => {
      const id = ids[index];
      const confidence = text(doc.head.confidence, "unrated");
      const summary = text(doc.head.summary, "(no summary)");
      const flag = duplicated.has(id) ? " [duplicate id]" : "";
      return "- [" + confidence + "] " + id + " — " + summary + " (" + fileName(doc) + ")" + flag;
    }),
    "learning",
  );
  append(out, skipped.map(skipLine), "skipped file");

  out.push(
    "Handoffs: " + handoffs.length + " active, " + refusedHandoffs.length + " skipped.",
  );
  append(
    out,
    handoffs.map((entry) => {
      const origin = entry.from === "" ? "" : "from " + entry.from + ", ";
      return "- " + entry.id + " — " + entry.summary + " (" + origin + "expires " + entry.expires + ")";
    }),
    "handoff",
  );
  append(out, refusedHandoffs.map(skipLine), "skipped file");

  return out;
}

/** One skip line: the file by name, the reason by id. The span is never echoed. */
function skipLine(doc) {
  return "- skipped " + fileName(doc) + ": " + doc.skip;
}

/** A file name as one bounded, control-character-free line. */
function fileName(doc) {
  return text(doc.name, "(unnamed file)");
}

// Written once, then the process ends on its own. \`process.exit\` would race
// the write: stdout is asynchronous when it is a pipe on macOS and the BSDs,
// which is exactly how a client runs a hook.
process.stdout.write(render().join("\\n") + "\\n");
`;
}

// ── 2. Pre-tool-use guard ────────────────────────────────────────

/**
 * Clients whose PRE-TOOL-USE payload carries no agent identity — a declared
 * dialect fact, with its source, because the guard's entire scope test is
 * `agentId.startsWith(GOVERNED_PREFIX)` and a payload with no identity field
 * can never satisfy it.
 *
 * Cursor is the row. Its own adapter states the same fact from the other side:
 * `subagentStart` carries `subagent_type` and is "the only Cursor payload field"
 * that names an agent (`../adapters/cursor.ts`; cursor.com/docs/agent/hooks,
 * accessed 2026-08-17), so the tool-call events this guard rides carry none.
 * The guard was nevertheless emitted for Cursor as a blocking gate and wired
 * `failClosed`, advertising an enforcement point that returns early on every
 * call it will ever see. Being on this list makes the emitted body say what it
 * is — a record, not a control — instead of claiming a gate it cannot reach.
 *
 * The fix belongs on this side rather than in the scope test: reading Cursor's
 * tool-call payload for an identity it does not carry is a protocol change, not
 * a code change.
 *
 * Exported because it is the SECOND determinant of the emitted guard's blocking
 * posture, beside `CLIENT_HOOK_GUARANTEES.failMode`. A caller — or a test —
 * deriving that posture from the fail mode alone gets Cursor wrong, and a fact
 * kept private is one every such caller has to restate by hand.
 */
export const IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS: ReadonlySet<Tool> = new Set<Tool>(["cursor"]);

export interface GuardScriptOptions {
  /**
   * Where the emitted policy document sits. A relative path is resolved
   * against the guard script's own directory, so the pair moves together;
   * an absolute path is used as written.
   */
  policiesJsonPath: string;
  /** The target client's honest blocking strength, from {@link CLIENT_HOOK_GUARANTEES}. */
  failMode: HookFailMode;
  /**
   * Whether the target client's pre-tool-use payload names the calling agent
   * (see {@link IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS}). Defaults to `true` — the
   * shape every documented payload but Cursor's carries — and a `false` here
   * downgrades the body to telemetry, because a guard that cannot identify the
   * caller cannot deny it.
   */
  identityBearing?: boolean;
}

/**
 * The tool-call authorization gate: deny-by-default over the policy document
 * the engine emitted.
 *
 * Scope is the generated-content prefix. Only agents this setup authored are
 * governed; the main thread and the client's own agents pass through
 * untouched, because a hook that denied them would brick the session it was
 * meant to protect. Inside that scope nothing authorizes by omission — an
 * unrostered agent, a tool named on the policy's deny list, a tool no client
 * dialect names, and a category the agent does not hold all refuse.
 *
 * Two facts decide what a refusal DOES, and both are the client's. `failMode`
 * says whether the exit status stops anything; `identityBearing` says whether
 * the payload names an agent at all, without which the scope test above returns
 * early and no refusal is ever reached. Only a client holding both gets a
 * blocking body; the others get one that reports and lets the call proceed, and
 * the reported event says which happened, so a log is never read as enforcement
 * that did not occur.
 *
 * Both variants report on stderr rather than stdout, because stdout is the
 * channel that feeds a session and a denial is not session context. On a
 * blocking client that is also a documented channel — exit 2 returns stderr to
 * the agent. On the others it is a record the client may or may not surface;
 * `CLIENT_HOOK_GUARANTEES` documents no channel for stderr on exit 0, so this
 * body does not promise an operator will read it.
 *
 * Corruption fails the same way as denial. An unreadable, oversized,
 * wrong-schema or unparseable policy document, and any unexpected throw while
 * evaluating one, all reach the same refusal — the document is what the guard
 * knows, and a guard that cannot read it knows nothing.
 */
export function buildPreToolUseGuardScript(opts: GuardScriptOptions): string {
  const identityBearing = opts.identityBearing ?? true;
  // Both conditions, because either one alone makes the refusal decorative: a
  // client that ignores the exit status never stops the call, and a client whose
  // payload names no agent never reaches a refusal to report.
  const blocking = opts.failMode !== "fail-open" && identityBearing;
  const categories = Object.entries(unionToolCategoryMap())
    .map(([name, category]) => `  ${json(name)}: ${json(category)},`)
    .join("\n");

  return `${header(
    [
      "stamity — pre-tool-use allowlist guard.",
      "",
      "Rules on the pending tool call against the emitted policy document.",
      "Deny-by-default within scope: only agents carrying the generated-content",
      "prefix are governed, and inside that scope an unrostered agent, a denied",
      "tool name, an unknown tool and an ungranted category all refuse.",
      "",
      ...(blocking
        ? [`Blocking client: a refusal exits ${BLOCKING_EXIT_CODE} and the action stops.`]
        : identityBearing
          ? [
              "Reporting-only client: this client never blocks on a hook exit status,",
              "so a refusal is reported and the call proceeds. The gate that binds here",
              "is the client's own permission rules.",
            ]
          : [
              "Telemetry only on this client, for two independent reasons. Its hook",
              "payload carries no agent identity, so the scope test below can never",
              "match and this guard reaches no verdict at all; and even a refusal it",
              "did reach would not stop the call. The gate that binds here is the",
              "client's own permission rules — this file is a record, not a control.",
            ]),
    ],
    [
      "Reads outside repo state: the pending call's payload on stdin. Output is a",
      "function of that payload and the emitted policy document, not of the repo.",
    ],
  )}

import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const POLICY_FILE = ${policyPathExpression(opts.policiesJsonPath)};
const POLICY_SCHEMA = ${json(AGENT_TOOL_POLICIES_SCHEMA)};
const MAX_POLICY_BYTES = ${MAX_POLICY_FILE_BYTES};
const GOVERNED_PREFIX = ${json(CONTENT_PREFIX)};
const BLOCKING = ${blocking};
const BLOCK_EXIT = ${BLOCKING_EXIT_CODE};
const MCP_PREFIX = ${json(MCP_TOOL_PREFIX)};

// Client-native tool name → category, unioned across the client dialects the
// engine emits. A name listed under two categories resolves to the narrower
// one, so a dialect collision can only under-grant.
const TOOL_CATEGORY = {
${categories}
};

${READ_STDIN}

${READ_FIELD}

/** The refusal this call earns, or null when nothing here governs it. */
function evaluate() {
  const payload = readPayload();
  const agentId = field(payload, ["agent_type", "subagent_type", "agentType", "subagentType"]);
  // Out of scope: the main thread and the client's own agents are not this
  // setup's to govern, and denying them would brick the session.
  if (!agentId.startsWith(GOVERNED_PREFIX)) return null;

  const agentInstance = field(payload, ["agent_id", "subagent_id"]);
  const tool = field(payload, ["tool_name", "toolName", "tool"]);
  const subject = { agentId, agentInstance, tool };

  try {
    if (tool === "") {
      return {
        ...subject,
        reasonCode: "UNKNOWN_TOOL",
        message: "The payload named no tool, so the call cannot be authorized.",
      };
    }

    let size = -1;
    try {
      const stats = statSync(POLICY_FILE);
      if (stats.isFile()) size = stats.size;
    } catch {
      size = -1;
    }
    if (size < 0) {
      return {
        ...subject,
        reasonCode: "POLICY_UNREADABLE",
        message: \`No readable policy document at \${POLICY_FILE}; nothing authorizes this call.\`,
      };
    }
    // Sized before it is read: an unbounded document is refused on its size
    // alone rather than parsed to discover it was unreasonable.
    if (size > MAX_POLICY_BYTES) {
      return {
        ...subject,
        reasonCode: "POLICY_TOO_LARGE",
        message: \`Policy document \${POLICY_FILE} is \${size} bytes, past the \${MAX_POLICY_BYTES} byte cap.\`,
      };
    }

    const document = JSON.parse(readFileSync(POLICY_FILE, "utf8"));
    if (
      document === null ||
      typeof document !== "object" ||
      document.schema !== POLICY_SCHEMA ||
      !Array.isArray(document.policies)
    ) {
      return {
        ...subject,
        reasonCode: "POLICY_INVALID",
        message: \`Policy document \${POLICY_FILE} does not declare schema "\${POLICY_SCHEMA}".\`,
      };
    }

    const policy = document.policies.find(
      (entry) => entry !== null && typeof entry === "object" && entry.agentId === agentId,
    );
    if (policy === undefined) {
      return {
        ...subject,
        reasonCode: "NO_POLICY",
        message: \`No policy is registered for agent "\${agentId}", so it may use nothing. Add a grant for it to the roster and regenerate the setup.\`,
      };
    }
    // A name on the deny list outranks whatever its category resolves to.
    if (Array.isArray(policy.denyTools) && policy.denyTools.includes(tool)) {
      return {
        ...subject,
        reasonCode: "TOOL_DENIED",
        message: \`Agent "\${agentId}" is denied tool "\${tool}" by name.\`,
      };
    }

    // Own-property read: a plain object inherits \`constructor\` and \`toString\`,
    // and a tool named after one of those would otherwise resolve to a function.
    let category = Object.hasOwn(TOOL_CATEGORY, tool) ? TOOL_CATEGORY[tool] : "";
    if (category === "" && tool.startsWith(MCP_PREFIX)) category = "network";
    if (category === "") {
      return {
        ...subject,
        reasonCode: "UNKNOWN_TOOL",
        message: \`Tool "\${tool}" maps to no category on this client, so it cannot be authorized.\`,
      };
    }
    if (!Array.isArray(policy.allow) || !policy.allow.includes(category)) {
      return {
        ...subject,
        category,
        reasonCode: "CATEGORY_DENIED",
        message: \`Agent "\${agentId}" may not use tool "\${tool}": it grants no "\${category}" access.\`,
      };
    }

    return null;
  } catch (error) {
    // Any unexpected throw is a refusal too: the guard's whole job is the
    // decision, and one it could not make is not one that authorizes.
    return {
      ...subject,
      reasonCode: "POLICY_EVALUATION_FAILED",
      message: \`Policy evaluation failed for agent "\${agentId}": \${error && error.message ? error.message : String(error)}.\`,
    };
  }
}

const refusal = evaluate();
if (refusal !== null) {
  // Reported, then the process ends on its own. \`process.exit\` would race the
  // write: stderr is asynchronous when it is a pipe on macOS and the BSDs,
  // which is exactly how a client runs a hook — and a denial nobody can read
  // is a denial nobody can act on.
  process.stderr.write(
    JSON.stringify({ hook: "stamity-pre-tool-use-guard", blocked: BLOCKING, ...refusal }) + "\\n",
  );
  process.exitCode = BLOCKING ? BLOCK_EXIT : 0;
}
`;
}

/**
 * Client-native tool name → category, unioned across the dialects the engine
 * emits.
 *
 * The guard body is one script for every client, so it needs one table. The
 * names are read back out of the dialect transforms rather than restated here:
 * `../tools/translator.ts` is the seam that owns client tool names, and a
 * second table would drift from it silently. Iteration follows the canonical
 * category order and the first claim on a name wins, so a name two clients use
 * differently resolves to the narrower grant — the direction that can only
 * under-authorize.
 *
 * Exported for the suite that checks the EMITTED guard's authorization against
 * the engine's in-process `checkToolAccess`. That parity is the strongest claim
 * either side makes, and it was being asserted against a hand-copy of this
 * function living in the test file — two implementations, nothing binding them,
 * so the copy could go on agreeing with a table this one had stopped producing.
 */
export function unionToolCategoryMap(): Record<string, ToolCategory> {
  const map: Record<string, ToolCategory> = {};
  const render = [toClaudeToolsFrontmatter, toCodexToolsFrontmatter, toCopilotToolsFrontmatter];
  for (const category of FUNCTIONAL_TOOL_CATEGORIES) {
    for (const dialect of render) {
      for (const name of renderedNames(dialect([category]))) {
        if (!Object.hasOwn(map, name)) map[name] = category;
      }
    }
  }
  return map;
}

/** Names out of a rendered dialect value: a quoted flow sequence or a comma list. */
function renderedNames(rendered: string): string[] {
  const names = rendered.startsWith("[")
    ? [...rendered.matchAll(/"([^"]*)"/g)].map((match) => match[1] ?? "")
    : rendered.split(",").map((name) => name.trim());
  return names.filter((name) => name !== "");
}

// ── 3. Configuration-change notice ───────────────────────────────

/**
 * The configuration-change notice: says out loud that generated configuration
 * moved, and names the one command that settles whether it should have.
 *
 * It never blocks — exit 0 on every path, including a payload it cannot read.
 * A notice that could stop work would be switched off, and the value here is
 * that an edit nobody made on purpose gets SEEN. The named file comes out of
 * a payload, so it is sanitized to one bounded line before printing.
 *
 * The text serves both wirings. On a client with a native configuration-change
 * event it fires per change and reads as an alert; where no such event exists
 * it rides session start and reads as drift guidance. Same body, so the two
 * cannot drift apart.
 */
export function buildConfigTamperNoticeScript(): string {
  return `${header(
    [
      "stamity — configuration-change notice.",
      "",
      "Prints a review reminder when agent configuration changes, and never",
      "blocks: every path exits 0. On a client with a native configuration-change",
      "event this fires per change; elsewhere it rides session start and reads as",
      "drift guidance.",
    ],
    [
      "Reads outside repo state: the changing file's path off the payload on stdin.",
      "Nothing on disk is read, so the same repo prints two different lines for two",
      "different payloads.",
    ],
  )}

import { readFileSync } from "node:fs";

const MAX_PATH_CHARS = ${MAX_LEARNING_SUMMARY_LENGTH};

${READ_STDIN}

${READ_FIELD}

/** One bounded, control-character-free line: the path came from a payload. */
function clean(value) {
  const flat = value.replace(/[\\u0000-\\u001f\\u007f]+/g, " ").replace(/\\s+/g, " ").trim();
  return flat.length > MAX_PATH_CHARS ? flat.slice(0, MAX_PATH_CHARS - 1) + "…" : flat;
}

const payload = readPayload();
const changed = clean(
  field(payload, ["file_path", "filePath", "path", "config_path", "settings_path"]),
);

const lines =
  changed === ""
    ? [
        "Stamity: agent configuration is generated and managed. Run \`stamity check\` to diff the on-disk files against the engine's own output.",
      ]
    : [
        "Stamity: agent configuration changed — " + changed + ".",
        "That file is generated and managed. Run \`stamity check\` to diff it against the engine's own output before trusting the change.",
      ];

process.stdout.write(lines.join("\\n") + "\\n");
`;
}

// ── 4. Work-scoped review gate (non-core) ────────────────────────

/** Schema discriminator on the counter document, so a repurposed file is refused. */
const REVIEW_GATE_STATE_SCHEMA = "stamity/review-gate/v1";

/**
 * How long a run's counter survives. A work run lives hours; a week keeps a
 * resumed one and drops everything else, so the file cannot accumulate a key
 * per session forever.
 */
const REVIEW_GATE_RUN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Runs retained after age pruning, newest first. Age alone bounds a normal
 * repo; this bounds a pathological one, and it is what makes
 * {@link MAX_REVIEW_GATE_STATE_BYTES} a cap the file's own writer respects
 * rather than one it discovers by being refused.
 */
const REVIEW_GATE_MAX_RUNS = 200;

/** The one agent whose completion IS a review round. */
const REVIEWER_AGENT_ID = `${CONTENT_PREFIX}reviewer`;

/**
 * Client events that mean "a run is declaring itself finished", the only kind
 * this gate holds. Its sibling carrier (`SubagentStop`) is deliberately absent:
 * a sub-agent finishing is a step inside a run, and an exit status there holds
 * the sub-agent open with a message only the operator sees — see
 * `CLIENT_EXTENSION_EVENTS` for both rows and their citation.
 */
const REVIEW_GATE_COMPLETION_EVENTS = ["TaskCompleted"];

/**
 * Where a reviewer's verdict actually travels.
 *
 * The documented payload carries no verdict field of any name: the common set
 * is session/event/agent identity, and the finishing agent's own final text is
 * delivered as `last_assistant_message` on the stop events
 * (code.claude.com/docs/en/hooks, accessed 2026-08-17). That text is where the
 * reviewer contract puts its structured return, so it is the carrier this gate
 * reads. A payload field is still preferred where one exists — a client that
 * grows a structured verdict should win over parsing prose — which is why the
 * two reads are ordered rather than exclusive.
 */
const REVIEW_MESSAGE_FIELDS = ["last_assistant_message", "lastAssistantMessage"];

/**
 * Ceiling on the final text this gate will scan. A structured return is tens
 * of lines; past 64 KiB the payload is a transcript rather than a return block,
 * and scanning an unbounded payload string on every sub-agent stop is the stall
 * vector {@link MAX_REVIEW_GATE_STATE_BYTES} exists to refuse on the file side.
 * Past the cap the reading is unrecorded, which holds the gate — the safe
 * direction, and bounded by the round cap either way.
 */
const MAX_REVIEW_MESSAGE_CHARS = 65_536;

/** The reviewer contract's own verdict vocabulary. Anything else is unrecorded. */
const REVIEW_VERDICTS = ["approve", "request-changes", "blocked"];

/** The reviewer contract's own confidence vocabulary. Anything else is unrecorded. */
const REVIEW_CONFIDENCES = ["high", "medium", "low"];

/**
 * A labelled field in the reviewer's final text: the label word, a little
 * decoration (markdown emphasis, a quote, a list marker), a separator, and the
 * value.
 *
 * Labelled rather than bare: a scan for the word `approve` anywhere in a review
 * matches the sentence explaining why the change was not approved. The value is
 * then narrowed to the vocabulary above, so a label followed by prose reads as
 * unrecorded instead of as a verdict nobody returned.
 */
const VERDICT_LABEL = /verdict[^A-Za-z0-9]{0,4}[:=—–-][^A-Za-z]{0,4}([A-Za-z][A-Za-z-]{0,31})/gi;

/** Confidence twin of {@link VERDICT_LABEL}. */
const CONFIDENCE_LABEL =
  /confidence[^A-Za-z0-9]{0,4}[:=—–-][^A-Za-z]{0,4}([A-Za-z][A-Za-z-]{0,31})/gi;

export interface ReviewGateScriptOptions {
  /** Repo-relative path of the counter-state file the script reads and writes. */
  statePath: string;
  /** Iteration cap, already clamped by `clampReviewIterations`. */
  maxIterations: number;
  /** The client's honest blocking strength, from {@link CLIENT_HOOK_GUARANTEES}. */
  failMode: HookFailMode;
}

/**
 * The work-scoped review gate: holds a run's completion while its review loop
 * has an open round, and stops holding at the cap.
 *
 * Counter state is the whole design. A hook is stateless per invocation, so a
 * gate without one can only refuse every completion (blocking forever) or none
 * (never blocking); the round count and the last verdict, keyed by run, are
 * what let it say "round 2 of 4" and then let go. The file it keeps them in
 * lives under the state directory with the rest of the runtime state, never
 * under the generated tree a sync rewrites.
 *
 * Two events, two jobs, one body. A finishing reviewer is a round: it is
 * counted, its verdict recorded, and it is never held — the round already
 * happened, and holding a sub-agent open would say nothing the loop could act
 * on. A completion is the thing gated: with a round recorded and no approval,
 * it refuses; at the cap it passes and the run's own ladder ends it as
 * BLOCKED_FAILURE with the open findings attached.
 *
 * The verdict has to come off the payload the client actually sends, or the
 * release half of that gate is decoration: a verdict read from a field nothing
 * populates is always empty, so an approved run would be held to the cap and
 * told it ended as BLOCKED_FAILURE. What the documented payload carries on a
 * sub-agent stop is the agent's own final text ({@link REVIEW_MESSAGE_FIELDS}),
 * and the reviewer contract puts its structured return there — so the gate reads a
 * structured field first, and otherwise parses the labelled verdict and
 * confidence out of that text, bounded by {@link MAX_REVIEW_MESSAGE_CHARS} and
 * narrowed to the contract's own vocabulary. A text that names no verdict, one
 * outside the vocabulary, or two different ones reads as unrecorded, which
 * holds the gate — the direction that costs a round rather than a review.
 *
 * Everything outside that is left alone. A payload naming no run, a run with
 * no recorded round (a light pass, a non-work command, a run that has not
 * reached review), and a run whose loop already approved all exit 0 in silence.
 * So does every state fault: a counter file that is missing, oversized,
 * unreadable or unparseable opens the gate and says so, because a gate that
 * cannot read its own state must not wedge a run. It repairs nothing — a file
 * it cannot parse is not one it should overwrite.
 *
 * `failMode` decides only what a refusal DOES, exactly as in the sibling guard:
 * where a client honours a blocking status the completion stops, and where it
 * never blocks the refusal is reported and the completion proceeds.
 */
export function buildReviewGateScript(opts: ReviewGateScriptOptions): string {
  const segments = repoRelativeSegments(opts.statePath, "statePath");
  const maxRounds = bandedIterations(opts.maxIterations);
  const blocking = opts.failMode !== "fail-open";

  return `${header(
    [
      "stamity — work-scoped review gate.",
      "",
      "Holds a run's completion while its review loop has an open round, up to",
      `round ${maxRounds}. At the cap the gate opens: the run's ladder ends it as`,
      "BLOCKED_FAILURE with the open findings attached, and a hook that kept",
      "blocking past its own cap would be the unbounded gate this design avoids.",
      "",
      "Round count and last verdict, keyed by run, live in one JSON file under",
      "the state directory — the only thing this script writes. Read, modify and",
      "write happen while this process holds an exclusive lock file beside it, so",
      "two sub-agents finishing at once serialize instead of losing a round; the",
      "write itself is temp+rename, which buys a reader whole bytes and is NOT a",
      "substitute for the lock. A round this script cannot count is a round the",
      "gate does not hold, so an undercount opens a loop that had not converged.",
      "",
      "The verdict comes off the reviewer's own final text, which is what the",
      "client sends with a sub-agent stop: a structured payload field wins where",
      "one exists, and otherwise the labelled verdict and confidence are read out",
      "of that text and narrowed to the reviewer contract's vocabulary. Text that",
      "names none, or names two different ones, reads as unrecorded and the round",
      "stays open — a missed release costs one round, a wrong one costs a review.",
      "That coupling is load-bearing: this gate releases an approved run only when",
      "the reviewer's final text carries a labelled `verdict:` line, and a review",
      "that returns its verdict some other way is held to the cap and ends as",
      "BLOCKED_FAILURE with nothing open. Read the reviewer's return contract",
      "beside this file before changing either side.",
      "",
      "Fail-open: a counter file that is missing, oversized, unreadable or",
      "unparseable opens the gate and says so on stderr. A gate that cannot read",
      "its own state must not wedge a run. A run with no recorded round is not",
      "this gate's to hold either — it exits 0 untouched.",
      "",
      ...(blocking
        ? [`Blocking client: a refusal exits ${BLOCKING_EXIT_CODE} and the completion stops.`]
        : [
            "Reporting-only client: this client never blocks on a hook exit status,",
            "so a refusal is reported and the completion proceeds. The ladder that",
            "binds here is the one work's own prompt carries.",
          ]),
    ],
    [
      "Reads outside repo state: the payload on stdin, the wall clock, and the",
      "round counter this script owns. Every outcome — held, opened, or recorded —",
      "goes to stderr on exit 0 unless the completion is actually blocked; whether",
      "an operator SEES that line is the client's choice, so treat it as a record",
      "the client may keep, never as a notification this script can promise.",
    ],
  )}

import { randomBytes } from "node:crypto";
import { closeSync, constants as FS, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

const STATE_SEGMENTS = ${json(segments)};
const MAX_STATE_BYTES = ${MAX_REVIEW_GATE_STATE_BYTES};
const MAX_ROUNDS = ${maxRounds};
const MAX_RUN_AGE_MS = ${REVIEW_GATE_RUN_TTL_MS};
const MAX_RUNS = ${REVIEW_GATE_MAX_RUNS};
const MAX_ID_CHARS = 128;
const MAX_WORD_CHARS = 32;
const SCHEMA = ${json(REVIEW_GATE_STATE_SCHEMA)};
const REVIEWER_AGENT = ${json(REVIEWER_AGENT_ID)};
const GOVERNED_PREFIX = ${json(CONTENT_PREFIX)};
const COMPLETION_EVENTS = ${json(REVIEW_GATE_COMPLETION_EVENTS)};
const MESSAGE_FIELDS = ${json(REVIEW_MESSAGE_FIELDS)};
const MAX_MESSAGE_CHARS = ${MAX_REVIEW_MESSAGE_CHARS};
const VERDICTS = ${json(REVIEW_VERDICTS)};
const CONFIDENCES = ${json(REVIEW_CONFIDENCES)};
const VERDICT_LABEL = new RegExp(${json(VERDICT_LABEL.source)}, ${json(VERDICT_LABEL.flags)});
const CONFIDENCE_LABEL = new RegExp(${json(CONFIDENCE_LABEL.source)}, ${json(CONFIDENCE_LABEL.flags)});
const APPROVAL_VERDICT = "approve";
const UNTRUSTED_CONFIDENCE = "low";
const BLOCKING = ${blocking};
const BLOCK_EXIT = ${BLOCKING_EXIT_CODE};

/*
 * Waiting for the counter's lock.
 *
 * The budget used to be 50 attempts x a flat 20 ms sleep — one second of wall
 * clock, whatever was ahead in the queue. That conflates the two reasons a lock
 * is not free. A holder AHEAD of this process in a queue is progress and must be
 * waited out; the wait is bounded by the queue, not by a constant. A holder that
 * died still holding it is not progress and no amount of waiting helps. One
 * second bounded the first case at a number picked for the second, so thirty
 * reviewers finishing together on a filesystem where each critical section costs
 * more than ~33 ms (NTFS create+delete, an on-access scanner, a runner
 * oversubscribed thirty ways) exhausted it before their turn came, and the round
 * they were holding the lock to count was dropped on a path that still exits 0.
 * Measured against the emitted script with the critical section padded to 40 ms:
 * 27 of 30 rounds landed, the other three reported STATE_LOCKED and exited 0.
 *
 * So the wait watches for PROGRESS instead of counting ticks: every observed
 * change of holder re-arms the idle window, and the process gives up only after
 * LOCK_IDLE_POLLS consecutive looks that saw the same holder AND LOCK_IDLE_MS of
 * wall clock with no hand-off. Both conditions, because either alone is wrong on
 * a loaded machine — a process descheduled past the wall-clock window would
 * otherwise give up having looked exactly once, which is the starvation case
 * this is most likely to meet. LOCK_CEILING_MS bounds the whole wait regardless,
 * so a pathological hand-off storm still terminates.
 *
 * That ceiling is the one constant here that is NOT queue-shaped, and it is
 * checked unconditionally — it overrides the progress detector, so a wait that
 * is demonstrably draining gives up anyway once it fires. At 10s it was
 * therefore still the binding constraint on the exact case the progress
 * detector was added for. Thirty reviewers finishing together serialise; the
 * tail one needs twenty-nine critical sections' worth of wall clock; 10s split
 * twenty-nine ways is ~330ms per section, which an NTFS
 * create+read+rename+unlink cycle behind an on-access scanner on an
 * oversubscribed runner reaches. It did reach it — the herd case dropped one
 * round of thirty on the windows leg with no source change between runs, on
 * the same STATE_LOCKED path that still exits 0.
 *
 * 25s instead, derived from the budget rather than from a guess about how long
 * a queue is. This script rides SubagentStop and TaskCompleted, and it is
 * wired with no per-entry timeout, so it inherits the client default for those
 * events: 600s (code.claude.com/docs/en/hooks-guide, Limitations, accessed
 * 2026-09-01). 25s is 4% of that, and it also sits under the 30s that
 * same client allows its tightest hook class, so re-wiring this gate onto
 * another event could not silently put the wait outside its budget. What the
 * number buys is ~860ms per critical section at thirty writers instead of
 * ~330ms.
 *
 * Raising it costs nothing on the failure it does not govern. A holder that
 * DIED holding the lock produces no hand-off, so the idle detector returns in
 * ~1s and the ceiling is never consulted; the ceiling only ever fires while
 * the lock is genuinely changing hands, and waiting longer for a queue that is
 * visibly draining is the whole point of watching for progress. The fail-open
 * drop is unchanged either way: a wait that does expire still reports
 * STATE_LOCKED and exits 0, because a counter is not worth wedging a run over.
 */
const LOCK_IDLE_MS = 1_000;
const LOCK_IDLE_POLLS = 24;
const LOCK_CEILING_MS = 25_000;
const LOCK_WAIT_MIN_MS = 4;
const LOCK_WAIT_MAX_MS = 24;
const LOCK_STALE_MS = 30_000;

/* Rename retries for transient Windows sharing violations, mirroring the
 * engine's own writer: a concurrent reader of the counter (every invocation
 * loads it before it decides) can hold a handle across this rename, and an
 * on-access scanner opens files without FILE_SHARE_DELETE, so MoveFileEx comes
 * back EBUSY/EPERM for a few ms at a time. Unretried, that lands as
 * STATE_UNWRITABLE: the round is reported but never stored, which is the same
 * lost round by a different route. */
const RENAME_RETRIES = 4;
const RENAME_BACKOFF_MS = 50;

const NOW = Date.now();

${RESOLVE_REPO_ROOT}

const STATE_FILE = join(repoRoot(), ...STATE_SEGMENTS);
const LOCK_FILE = STATE_FILE + ".lock";

${READ_STDIN}

${READ_FIELD}

/** One payload value as an object key: id characters only, and bounded. */
function identifier(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, MAX_ID_CHARS);
}

/** One payload value as a vocabulary word: lower-case letters and hyphens, bounded. */
function word(value) {
  return value.toLowerCase().replace(/[^a-z-]/g, "").slice(0, MAX_WORD_CHARS);
}

/**
 * One word narrowed to a closed vocabulary. Anything outside it is unrecorded
 * rather than stored: the counter file holds what the review loop returned, and
 * a value no verdict can equal is more honest there than a stray token.
 */
function term(value, vocabulary) {
  const normalized = word(value);
  return vocabulary.includes(normalized) ? normalized : "";
}

/**
 * The one value a label carries in the reviewer's final text.
 *
 * Every labelled occurrence is read, not the first or the last: a text that
 * names two different verdicts has not returned one, and picking either would
 * be a guess in a place where guessing wrong releases a completion the loop
 * never approved. Disagreement and absence both read as unrecorded, which holds
 * the round open — bounded by the cap, so the cost is a round.
 */
function labelled(text, pattern, vocabulary) {
  let found = "";
  for (const match of text.matchAll(pattern)) {
    const candidate = term(match[1], vocabulary);
    if (candidate === "") continue;
    if (found !== "" && found !== candidate) return "";
    found = candidate;
  }
  return found;
}

/**
 * One field of the reviewer's structured return.
 *
 * A payload field wins wherever a client carries one — that is the reading
 * nobody has to parse. What the documented payload does carry on a sub-agent
 * stop is the agent's final text, so that is the fallback, scanned only up to
 * the cap: past it the payload is a transcript rather than a return block, and
 * an unbounded scan on every stop is a stall this gate should not offer.
 */
function returned(payload, names, pattern, vocabulary) {
  const direct = term(field(payload, names), vocabulary);
  if (direct !== "") return direct;
  const message = field(payload, MESSAGE_FIELDS);
  if (message === "" || message.length > MAX_MESSAGE_CHARS) return "";
  return labelled(message, pattern, vocabulary);
}

/**
 * The counter document, or the fault that makes it untrustworthy. Sized before
 * it is read, exactly as the sibling guard sizes its policy document: past the
 * cap the file is refused on its size rather than parsed to discover it was
 * unreasonable.
 */
function load() {
  let size = -1;
  try {
    const stats = statSync(STATE_FILE);
    if (stats.isFile()) size = stats.size;
  } catch {
    size = -1;
  }
  if (size <= 0) return { fault: "STATE_ABSENT", runs: null };
  if (size > MAX_STATE_BYTES) return { fault: "STATE_TOO_LARGE", runs: null };

  let raw = "";
  try {
    raw = readFileSync(STATE_FILE, "utf8");
  } catch {
    return { fault: "STATE_UNREADABLE", runs: null };
  }
  let document = null;
  try {
    document = JSON.parse(raw);
  } catch {
    return { fault: "STATE_INVALID", runs: null };
  }
  if (
    document === null ||
    typeof document !== "object" ||
    document.schema !== SCHEMA ||
    document.runs === null ||
    typeof document.runs !== "object"
  ) {
    return { fault: "STATE_INVALID", runs: null };
  }
  return { fault: "", runs: document.runs };
}

/**
 * One run's record, or null when the run has no countable round. Read
 * own-property only: a plain object inherits \`constructor\` and \`toString\`, and
 * a run id named after one of those would otherwise resolve to a function.
 */
function entryOf(runs, runId) {
  const value = Object.hasOwn(runs, runId) ? runs[runId] : undefined;
  if (value === null || typeof value !== "object") return null;
  if (!Number.isInteger(value.rounds) || value.rounds < 1) return null;
  return {
    rounds: value.rounds,
    verdict: typeof value.verdict === "string" ? value.verdict : "",
    confidence: typeof value.confidence === "string" ? value.confidence : "",
  };
}

/**
 * Synchronous wait. A hook is a short-lived process with nothing else to do,
 * and there is no event loop here to yield to.
 */
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Take the counter's exclusive lock, or give up.
 *
 * The lock is what makes the round count correct. Temp+rename replaces the
 * document whole, which is atomic VISIBILITY and nothing more: two sub-agents
 * finishing at once both read round N, both write N+1, and one round is gone.
 * That is not a rounding error — an undercounted loop keeps holding a run it
 * should have released, or reaches the cap a round late.
 *
 * Created O_EXCL, so exactly one process wins the create. A lock older than the
 * stale window belonged to a process that died holding it and is cleared; every
 * other failure gives up rather than forcing, because forcing a live lock is the
 * defect this exists to prevent.
 *
 * Who holds it is the progress signal, read as the (mtime, file index) pair the
 * stat already fetched: both are set when the lock is created, so a pair that
 * differs from the last look means the lock changed hands and the queue ahead of
 * this process is draining. The directory is created once, before the loop,
 * rather than on every attempt — under contention that syscall ran on every tick
 * of every waiter, lengthening the poll cycle it was competing in.
 */
function lock() {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
  } catch {
    return false;
  }
  const ceiling = Date.now() + LOCK_CEILING_MS;
  let idleDeadline = Date.now() + LOCK_IDLE_MS;
  let idlePolls = 0;
  let holder = -1;
  let holderNode = -1;
  for (;;) {
    try {
      closeSync(openSync(LOCK_FILE, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600));
      return true;
    } catch (error) {
      if (!error || error.code !== "EEXIST") return false;
    }

    // Who holds it now, and since when. A stat that raises is a lock released
    // between the open and the look, which is itself a hand-off. Identity is
    // the pair, not the timestamp alone: mtime carries it on any filesystem
    // that stamps sub-second, and the file index carries it on one that does
    // not (exFAT stamps in whole seconds, and two holders inside one tick would
    // otherwise read as one). Either half moving is a hand-off; if a filesystem
    // supplies neither, this degrades to the flat budget it replaced and never
    // below it.
    let seen = -1;
    let node = -1;
    try {
      const held = statSync(LOCK_FILE);
      seen = held.mtimeMs;
      node = Number(held.ino);
    } catch {
      seen = -1;
      node = -1;
    }
    if (seen !== holder || node !== holderNode) {
      holder = seen;
      holderNode = node;
      idleDeadline = Date.now() + LOCK_IDLE_MS;
      idlePolls = 0;
    } else {
      idlePolls += 1;
    }

    // A holder older than the stale window died holding it. Clearing it is the
    // only path that forces a lock, and it is gated on age for that reason.
    if (seen !== -1 && Date.now() - seen > LOCK_STALE_MS) {
      try {
        unlinkSync(LOCK_FILE);
        continue;
      } catch {
        // Another process cleared it first; the next attempt takes it.
      }
    }

    const now = Date.now();
    if (now >= ceiling) return false;
    if (idlePolls >= LOCK_IDLE_POLLS && now >= idleDeadline) return false;
    // Jittered, so a herd woken by the same release does not re-collide on the
    // same tick every round and starve its own tail.
    pause(LOCK_WAIT_MIN_MS + Math.floor(Math.random() * (LOCK_WAIT_MAX_MS - LOCK_WAIT_MIN_MS + 1)));
  }
}

function unlock() {
  try {
    unlinkSync(LOCK_FILE);
  } catch {
    // Already gone: a stale-lock sweep in another process got there first.
  }
}

/**
 * Prune by age, then by count, then replace the file whole through temp+rename.
 * Called only while this process holds the lock, so the read this write is
 * based on is still current.
 *
 * The temp name is random and the file is created O_EXCL | O_NOFOLLOW. The old
 * name was the process id in base 36 — a few thousand values, guessable in
 * advance — and it was opened through whatever the name already pointed at, so
 * a symlink planted there redirected the write out of the repo and the rename
 * then made the redirection permanent. A write that cannot land is reported,
 * never raised: the counter is not worth holding a run for.
 */
function save(runs) {
  const kept = Object.entries(runs)
    .filter((pair) => pair[1] !== null && typeof pair[1] === "object" && NOW - pair[1].updated < MAX_RUN_AGE_MS)
    .sort((a, b) => b[1].updated - a[1].updated || (a[0] < b[0] ? -1 : 1))
    .slice(0, MAX_RUNS);
  const temp = STATE_FILE + ".tmp-" + randomBytes(8).toString("hex");
  let handle = -1;
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    handle = openSync(temp, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600);
    writeSync(handle, JSON.stringify({ schema: SCHEMA, runs: Object.fromEntries(kept) }));
    closeSync(handle);
    handle = -1;
    // The rename is retried on the two errnos Windows raises when something
    // else holds a handle to the destination for a moment — a concurrent
    // reader, or an on-access scanner that opened it without FILE_SHARE_DELETE.
    // Every other failure is raised on the first try and reported by the catch
    // below, because a write that cannot land is not worth holding a run for.
    for (let attempt = 0; ; attempt += 1) {
      try {
        renameSync(temp, STATE_FILE);
        break;
      } catch (error) {
        const code = error === null || error === undefined ? "" : error.code;
        if ((code !== "EBUSY" && code !== "EPERM") || attempt >= RENAME_RETRIES) throw error;
        pause(RENAME_BACKOFF_MS * 2 ** attempt);
      }
    }
    return true;
  } catch {
    if (handle !== -1) {
      try {
        closeSync(handle);
      } catch {
        // Already closed by the failing branch.
      }
    }
    try {
      unlinkSync(temp);
    } catch {
      // Nothing to clean up: the temp file never landed.
    }
    return false;
  }
}

const payload = readPayload();
const runId = identifier(field(payload, ["session_id", "run_id", "sessionId", "runId"]));
const agentId = field(payload, ["agent_type", "subagent_type", "agentType", "subagentType"]);
const eventName = field(payload, ["hook_event_name", "hookEventName", "event"]);

/**
 * Whether this event is a run declaring itself finished — the only kind this
 * gate holds. The client's own event name answers it wherever the payload
 * carries one; otherwise the completing identity does, since a governed
 * sub-agent finishing is a step inside the run rather than the end of it.
 */
function isCompletion() {
  if (eventName !== "") return COMPLETION_EVENTS.includes(eventName);
  return !agentId.startsWith(GOVERNED_PREFIX);
}

/**
 * Count this reviewer's round, under the lock.
 *
 * The counter is read again INSIDE the lock rather than reused from the read
 * that opened this invocation: that earlier copy is exactly the stale read that
 * made this a lock-free read-modify-write, and thirty parallel reviewer stops
 * against it recorded a single round.
 *
 * A lock this process cannot take is reported and the gate opens. Refusing the
 * completion instead would wedge a run over a counter, which is the one thing
 * every other fault path here already refuses to do.
 */
function record() {
  const verdict = returned(payload, ["verdict", "review_verdict", "reviewVerdict"], VERDICT_LABEL, VERDICTS);
  const confidence = returned(
    payload,
    ["confidence", "review_confidence", "reviewConfidence"],
    CONFIDENCE_LABEL,
    CONFIDENCES,
  );

  if (!lock()) {
    return {
      blocked: false,
      runId,
      maxRounds: MAX_ROUNDS,
      reasonCode: "STATE_LOCKED",
      message:
        "The review-gate counter at " + STATE_FILE + " stayed locked, so this round was not counted " +
        "and the gate is open. Remove " + LOCK_FILE + " if no run is in flight.",
    };
  }

  let rounds = 0;
  let stored = false;
  try {
    const current = load();
    // Null prototype for the same reason the completion path uses one: a run id
    // of "__proto__" would otherwise reach the inherited setter and vanish.
    const runs = Object.assign(Object.create(null), current.runs === null ? {} : current.runs);
    const previous = entryOf(runs, runId);
    rounds = (previous === null ? 0 : previous.rounds) + 1;
    runs[runId] = { rounds, verdict, confidence, updated: NOW };
    stored = save(runs);
  } finally {
    unlock();
  }

  return {
    blocked: false,
    runId,
    round: rounds,
    maxRounds: MAX_ROUNDS,
    reasonCode: stored ? "ROUND_RECORDED" : "STATE_UNWRITABLE",
    message: stored
      ? standing(rounds, verdict) + " recorded for this run."
      : standing(rounds, verdict) + " could not be written to " + STATE_FILE + ", so the gate is open.",
  };
}

/** How many rounds this run has left to spend, phrased for the operator. */
function standing(rounds, verdict) {
  return (
    "Review round " + rounds + " of " + MAX_ROUNDS + " (verdict: " + (verdict === "" ? "unrecorded" : verdict) + ")"
  );
}

/** The outcome this event earns, or null when nothing here governs it. */
function decide() {
  // A payload naming no run cannot be attributed to a review loop, and a gate
  // that held it would hold every run this setup never opened.
  if (runId === "") return null;

  const state = load();
  if (state.fault !== "" && state.fault !== "STATE_ABSENT") {
    return {
      blocked: false,
      runId,
      reasonCode: state.fault,
      message:
        "The review-gate counter at " + STATE_FILE + " cannot be trusted, so the gate is open. " +
        "Deleting the file restarts the counter; it is not overwritten from here.",
    };
  }
  // A finishing reviewer IS a review round: count it, record what it returned,
  // and let it go — the round has already happened.
  if (agentId === REVIEWER_AGENT) return record();

  if (!isCompletion()) return null;

  if (state.fault === "STATE_ABSENT") {
    return {
      blocked: false,
      runId,
      reasonCode: "STATE_ABSENT",
      message:
        "No review-gate counter at " + STATE_FILE + ", so the gate is open. " +
        "The file is created when this run records its first review round.",
    };
  }

  // Copied onto a null prototype before anything is read out of it: run ids come
  // from a payload, and a run named after a prototype member would otherwise
  // resolve to an inherited value instead of this run's record.
  const runs = Object.assign(Object.create(null), state.runs === null ? {} : state.runs);
  const entry = entryOf(runs, runId);
  // Work-scoped: a run with no recorded round has no review loop to gate on.
  if (entry === null) return null;
  // An approval closes the loop. Confidence is the flow's own gate and the
  // operator sets where it sits, so the one combination refused here is the one
  // no setting accepts: an approval the reviewer itself called low-confidence.
  if (entry.verdict === APPROVAL_VERDICT && entry.confidence !== UNTRUSTED_CONFIDENCE) return null;

  if (entry.rounds >= MAX_ROUNDS) {
    return {
      blocked: false,
      runId,
      round: entry.rounds,
      maxRounds: MAX_ROUNDS,
      verdict: entry.verdict,
      reasonCode: "CAP_REACHED",
      message:
        standing(entry.rounds, entry.verdict) +
        " is the cap, so the gate is open. The run ends here as BLOCKED_FAILURE with the open findings attached.",
    };
  }
  return {
    blocked: BLOCKING,
    runId,
    round: entry.rounds,
    maxRounds: MAX_ROUNDS,
    verdict: entry.verdict,
    reasonCode: "REVIEW_ROUND_OPEN",
    message:
      standing(entry.rounds, entry.verdict) +
      " left this run without an approval. Next: the open findings go to a fixer and the change re-enters review; " +
      "completion opens on an approval or at round " + MAX_ROUNDS + ".",
  };
}

const outcome = decide();
if (outcome !== null) {
  // Reported, then the process ends on its own. \`process.exit\` would race the
  // write: stderr is asynchronous when it is a pipe on macOS and the BSDs,
  // which is exactly how a client runs a hook.
  //
  // Every outcome goes to stderr, blocking or not. On a blocking refusal that is
  // a channel the client's own guarantee row names: exit 2 returns stderr to the
  // agent. On an exit-0 outcome — a round recorded, a cap reached, a counter
  // fault — it is NOT: no guarantee row documents a channel for stderr on exit
  // 0, so whether anyone reads these lines is the client's choice. They are kept
  // because a record the client may surface beats no record at all, and because
  // stdout is what feeds a session and a gate decision is not session context.
  // Read them as a log this script emits, never as a notification it delivers.
  process.stderr.write(JSON.stringify({ hook: "stamity-review-gate", ...outcome }) + "\\n");
  process.exitCode = outcome.blocked ? BLOCK_EXIT : 0;
}
`;
}

// ── Plan ─────────────────────────────────────────────────────────

/**
 * The core script set for one client, with the guard already carrying that
 * client's honest blocking strength.
 *
 * Fail mode is read from {@link CLIENT_HOOK_GUARANTEES} rather than passed in,
 * so the enforcement a generated setup claims and the table its documentation
 * renders from are the same fact. A client with no row falls back to blocking:
 * an exit status a client ignores costs nothing, while assuming it ignores one
 * would silently disarm the gate.
 *
 * Payload identity is the second input to that decision and comes from
 * {@link IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS}. It moves the OTHER way from the
 * fail-mode default, and deliberately: a client whose tool-call payload names no
 * agent cannot reach a verdict at all, so claiming a gate there is not
 * conservative — it is a claim that is false in the direction an operator would
 * rely on.
 *
 * The notice carries `session_start`, the portable event every client has. A
 * client with a native configuration-change event is wired to that instead at
 * emission time — a per-client extension the portable vocabulary deliberately
 * does not promise.
 */
export function planCoreHookScripts(
  policiesJsonPath: string,
  tool: Tool,
): GeneratedHookScript[] {
  const failMode =
    CLIENT_HOOK_GUARANTEES.find((guarantee) => guarantee.tool === tool)?.failMode ?? "fail-closed";
  return [
    {
      fileName: SESSION_START_FILE,
      content: buildSessionStartScript(),
      event: "session_start",
    },
    {
      fileName: GUARD_FILE,
      content: buildPreToolUseGuardScript({
        policiesJsonPath,
        failMode,
        identityBearing: !IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS.has(tool),
      }),
      event: "pre_tool_use",
    },
    {
      fileName: TAMPER_NOTICE_FILE,
      content: buildConfigTamperNoticeScript(),
      event: "session_start",
    },
  ];
}
