import {
  CONTENT_DENY_PATTERNS,
  foldConfusables,
  INJECTION_PATTERNS,
  INVISIBLE_SMUGGLING_CHARS,
  LEARNINGS_INJECTION_PATTERNS,
  type DenyPattern,
} from "../denyscan/denyScan.ts";
import { MAX_HANDOFF_FILE_BYTES } from "../handoffs/validation.ts";
import {
  HEAD_BYTES,
  MAX_LEARNING_FILE_BYTES,
  MAX_LEARNING_SUMMARY_LENGTH,
  REVIEW_WARNING_DAYS,
} from "../learnings/validation.ts";
import { READ_ONLY_GIT_SUBCOMMANDS } from "../roster/agentPolicies.ts";
import {
  HARD_MAX_REVIEW_ITERATIONS,
  MIN_MAX_REVIEW_ITERATIONS,
} from "../roster/reviewCaps.ts";
import { AGENT_TOOL_POLICIES_FILE, AGENT_TOOL_POLICIES_SCHEMA } from "../tools/allowlist.ts";
import { FUNCTIONAL_TOOL_CATEGORIES, type ToolCategory } from "../tools/categories.ts";
import {
  CLAUDE_READ_ONLY_GIT_TOOL,
  CLAUDE_REPORT_WRITE_TOOL,
  toClaudeToolsFrontmatter,
  toCodexToolsFrontmatter,
  toCopilotToolsFrontmatter,
} from "../tools/translator.ts";
import type { Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import { CONTENT_PREFIX, GENERATED_SCRIPT_LINT_DIRECTIVE, HOOKS_ACTIVE_ENV, STATE_DIR } from "../types/markers.ts";
import { CONTEXT_ONCE_DIR, PREFLIGHT_CANARY_FILE, RUN_ENDED_MARKER_FILE, RUN_ENDED_MAX_AGE_MS } from "../mcp/env.ts";
import { buildCardBranchSource, buildResumeCardSource, RESUME_CARD_HOST_NAMES } from "../runs/cardSource.ts";
import {
  DEBUG_RUN_SEGMENT,
  GIT_METADATA_MAX_BYTES,
  IN_PROGRESS_PATTERN,
  RECORD_BRANCH_PATTERN,
  RECORD_CHECKPOINT_PATTERN,
  RECORD_FILE,
  RECORD_HEAD_LINES,
  RECORD_HEAD_READ_BYTES,
  RECORD_MODE_PATTERN,
  RECORD_STATUS_PATTERN,
  REPORT_READ_MAX_BYTES,
  RUN_ID_PATTERN,
  RUNS_SEGMENTS,
  UNPRINTABLE_CHARS,
  USAGE_REVIEW_PATTERN,
} from "../runs/layout.ts";
import { cliCallHint, pinnedCliCall } from "../shared/cliCall.ts";
import {
  CLIENT_CLOUD_FACTS,
  CLIENT_HOOK_GUARANTEES,
  type CanonicalHookEvent,
  type HookFailMode,
} from "./model.ts";
import { GITHUB_MCP_ROWS, personOnlyVerdict, unattendedPushVerdict } from "./personOnly.ts";

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
 * ladder as prose. {@link buildUnattendedAskGate} is placed the same way: it
 * refuses Claude Code's question tool while a run is unattended.
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
 * review horizon and a handoff, and its payload's `source`, to append the
 * resume card after a compaction or on a resume; the guard and the notice read the pending
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

/**
 * Cursor's context-once hook (REQ-FLOW-115). NON-portable carrier: Cursor's
 * `postToolUse`, one client only, placed and wired by the Cursor adapter, which
 * names it ({@link buildContextOnceScript}).
 */
export const CONTEXT_ONCE_FILE = "stamity-context-once.mjs";

/** Tool-call authorization gate. Portable carrier: `pre_tool_use`. */
const GUARD_FILE = "stamity-pre-tool-use-guard.mjs";

/** Configuration-change notice. Portable carrier: `session_start` — see {@link planCoreHookScripts}. */
const TAMPER_NOTICE_FILE = "stamity-config-tamper-notice.mjs";

/**
 * The unattended ask gate (REQ-FLOW-090). NON-portable carrier: Claude Code's
 * `PreToolUse` on `AskUserQuestion`, one client only. Exported because, like
 * {@link REVIEW_GATE_FILE}, no plan function returns it: the wiring adapter names it.
 */
export const UNATTENDED_ASK_GATE_FILE = "stamity-unattended-ask-gate.mjs";

/**
 * The Cursor continue hook (REQ-FLOW-109). NON-portable carrier: Cursor's `stop`,
 * one client only, placed and wired by the Cursor adapter, which names it.
 */
export const CURSOR_CONTINUE_FILE = "stamity-cursor-continue.mjs";

/**
 * Work-scoped review gate. NON-portable carriers, one client only — the
 * adapter that wires them reads them off `CLIENT_EXTENSION_EVENTS`. Exported
 * because no plan function returns this script: the wiring adapter names it.
 */
export const REVIEW_GATE_FILE = "stamity-review-gate.mjs";

/**
 * Claude Code's cloud readiness hook (REQ-FLOW-110). NON-portable carrier: Claude
 * Code's `SessionStart` on `startup|resume`, one client only, placed and wired by
 * the Claude adapter, which names it ({@link buildCloudReadinessScript}).
 */
export const CLOUD_READINESS_FILE = "stamity-cloud-readiness.mjs";

/**
 * The person-only shell guard (REQ-FLOW-102, REQ-FLOW-120). Portable carrier:
 * `pre_tool_use` on each client's shell tools, Cursor's `beforeShellExecution`.
 * Rendered only when {@link planCoreHookScripts} is asked for it; emission wires it.
 */
export const PERSON_ONLY_GUARD_FILE = "stamity-person-only-guard.mjs";

/**
 * Byte and line ceilings on each emitted core script, keyed by file name
 * (REQ-CTX-016). A client parses the whole script on every session start or
 * every tool call, so growth here is paid per call; the ceiling turns that
 * growth into a reviewed edit of this table rather than drift nobody saw.
 *
 * `test/hooks/scriptBudget.test.ts` renders every script for every client in
 * both the generated layout and a plugin root, and holds the render with more
 * bytes to its row. The two layouts differ in lines as well as bytes: measured
 * at e995fe02, the generated layout has 917 lines of session start against 896,
 * 891 of review gate against 870, and 475 of the claude guard against 266; the
 * tamper notice has 67 in both. So today the render with more bytes is also the
 * one with more lines. Lines count `\n` only, so CRLF and LF count alike.
 * A row moves with the reason it moved, stated beside it; raising a ceiling
 * because a script grew into it is how the ceiling stops meaning anything.
 *
 * The guard row is the plan's fixed ceiling; the session start's was one until
 * 2026-10-18, when it moved once by the rule below (its row says why). The
 * review gate, the session start, the tamper notice, the ask gate, the Cursor
 * continue hook, Cursor's context-once hook, the cloud readiness hook and the person-only guard are their measured size times 1.25, bytes rounded up to a
 * multiple of 1,024 and lines to a multiple of 10.
 */
export const HOOK_SCRIPT_BUDGETS: Readonly<Record<string, { readonly bytes: number; readonly lines: number }>> = {
  // Fixed ceiling. Measured 2026-09-26 at 8c08660e: 19,125 bytes / 475 lines
  // (the identity-bearing claude guard, generated layout). Measured 2026-09-30
  // with the read-only git branch: 20,711 bytes / 511 lines; the ceiling holds.
  [GUARD_FILE]: { bytes: 24_576, lines: 600 },
  // Fixed ceiling. Measured 2026-09-26 at 8c08660e: 40,914 bytes / 917 lines
  // (generated layout; a plugin root renders 40,195 / 896). Measured 2026-09-30
  // around the learning index change (date order, review-due mark, index
  // bytes): 45,395 / 1,009 before, 46,716 / 1,038 after; the ceiling holds.
  // Measured 2026-10-14 on a1a55379 around the cloud and CI session line
  // (REQ-FLOW-085): 47,118 / 1,044 before, 48,780 / 1,068 after; the ceiling holds.
  // Raised 2026-10-18 by plan 021 file 2's v1-branch-card (base 20abe813): the
  // startup card for the run on this branch and the HEAD reader it shares with
  // the ask gate (REQ-CTX-013) took the render from 48,983 / 1,071 to 50,647 /
  // 1,114, past the fixed ceiling. Moved once, for this unit and the session
  // chain after it (v2's review-gate line, v6's Cursor line, v8's inlined
  // detector), by the review gate's rule: × 1.25 = 63,308.75 / 1,392.5,
  // rounded up to 63,488 / 1,400. Measured 2026-10-18 on base 45fc20f9 with
  // v2-review-gate-rebuild's cloud line and banner sentence: 50,760 / 1,116; the
  // ceiling holds.
  [SESSION_START_FILE]: { bytes: 63_488, lines: 1_400 },
  // Measured 2026-10-18 on plan 021 file 2's v6-cursor-cloud lane (base 9c11e4ab): 31,172 bytes / 621 lines
  // (cursor, generated layout; a plugin root renders 30,453 / 600). It carries the session start's index and screen
  // without the resume card, and runs on every postToolUse. × 1.25 = 38,965 / 776.25, rounded up as the review
  // gate's is to 39,936 / 780.
  [CONTEXT_ONCE_FILE]: { bytes: 39_936, lines: 780 },
  // Measured 2026-09-24 and again 2026-09-26 at 8c08660e: 40,740 bytes / 891
  // lines (claude, generated layout, the default cap of 4; the cap of 10 adds
  // 2 bytes; a plugin root renders 40,021 / 870). × 1.25 = 50,925 / 1,113.75,
  // rounded up to 51,200 / 1,120. Measured 2026-10-18 on base 45fc20f9 around
  // plan 021 file 2's v2-review-gate-rebuild (a missing counter rebuilt from the
  // run record on this branch, REQ-FLOW-106), at the cap of 10: 40,763 / 892
  // before, 47,838 / 1,040 after, 48,748 / 1,061 with the held read faults;
  // the ceiling holds. Measured 2026-10-18 on base 7cebcfad after the unit's
  // fix round 1 (an untrusted counter rebuilt, the newest record only, the
  // rebuild fault named on a reviewer's stop): 50,328 / 1,082; the ceiling holds.
  // Measured 2026-10-18 on base a01c4dde after the unit's fix round 2 (review/66:
  // a file written from a rebuild is marked, and a session with no entry in a
  // marked file rebuilds): 51,152 / 1,089; the ceiling holds, 48 bytes inside it.
  [REVIEW_GATE_FILE]: { bytes: 51_200, lines: 1_120 },
  // Measured 2026-10-18 on plan 021 file 2's v5-claude-readiness lane (base 4f13752d): 11,361 bytes / 255 lines
  // (claude, generated layout, the suite's pin; a plugin root renders 10,633 / 234, and a fork's scope registry adds
  // 43 bytes). × 1.25 = 14,201.25 / 318.75, rounded up as the review gate's is to 14,336 / 320.
  [CLOUD_READINESS_FILE]: { bytes: 14_336, lines: 320 },
  // Measured 2026-10-16 on the u14b lane (base 2a1c5226): 5,711 bytes / 150
  // lines (claude, generated layout; a plugin root renders 4,983 / 129). Its
  // measured size × 1.25, rounded as the review gate's is: 7,138.75 / 187.5,
  // rounded up to 7,168 / 190. Moved 2026-10-16 by u14b's first fix round
  // (base 37c8d6cc): the gate reads the record's `Branch:` and `.git/HEAD` for
  // the final round (review/100), names what it read in a refusal (review/104)
  // and writes one note on a fail-open (review/105): 8,501 bytes / 201 lines
  // (a plugin root renders 7,773 / 180). × 1.25 = 10,626.25 / 251.25, rounded
  // up to 10,752 / 260.
  [UNATTENDED_ASK_GATE_FILE]: { bytes: 10_752, lines: 260 },
  // Measured 2026-10-18 on plan 021 file 2's v4-cursor-continue lane (base 3519efee), with the stop payload's
  // status read (build/31): 9,043 bytes / 209 lines (cursor, generated layout; a plugin root renders 8,315 / 188).
  // × 1.25 = 11,303.75 / 261.25, rounded up as the review gate's is to 12,288 / 270. Moved 2026-10-18 by the
  // lane's first fix round (base 3a3b91da): no follow-up while the newest capacity stop has at most its own
  // checkpoint line after it (review/70): 9,500 bytes / 221 lines (a plugin root renders 8,772 / 200).
  // × 1.25 = 11,875 / 276.25, rounded up to 12,288 / 280.
  [CURSOR_CONTINUE_FILE]: { bytes: 12_288, lines: 280 },
  // Measured 2026-09-24 and again 2026-09-26 at 8c08660e: 2,383 bytes / 67
  // lines, the same in both layouts. × 1.25 = 2,978.75 / 83.75, rounded up to
  // 3,072 / 90.
  [TAMPER_NOTICE_FILE]: { bytes: 3_072, lines: 90 },
  // Measured 2026-10-15 on the u14 lane (base 6cd93d17): 39,671 bytes / 1,245
  // lines (cursor, generated layout, as the suite's transform renders u6's two
  // verdicts; the bundle's copy is smaller). × 1.25 = 49,588.75 / 1,556.25,
  // rounded up to 50,176 / 1,560. Measured 2026-10-15 on base 00ff4f60, the same
  // way: 54,060 / 1,722, past the row, because u6's round 2 (2fc0824b) grew the
  // two verdicts the script embeds as source (thirteen rows, transfer and branch
  // rename among them); then 60,501 / 1,863 (cursor's bytes, claude's and codex's
  // lines) with u14's round 2, which reads the branch where the call runs
  // (review/94). × 1.25 = 75,626.25 / 2,328.75, rounded up to 75,776 / 2,330.
  // Measured 2026-10-16 on base 4daeb214, the same way: 72,763 / 2,130, u6's
  // round 3 (ded883c6) having grown the embedded verdicts after the row was set;
  // then 81,086 / 2,226 with the whole-branch guard round 1, which reads
  // PowerShell's command strings in both verdicts and the place reader
  // (build/89), gh's own field conversions (review/127), two GraphQL ref forms
  // (review/128, build/75), a percent-encoded path (build/76), a place in a
  // program word holding a line (review/153), and refuses an unattended git
  // alias or non-builtin subcommand (the 01:50Z sign-off). × 1.25 =
  // 101,357.5 / 2,782.5, rounded up to 101,376 / 2,790. Re-sized 2026-10-16
  // (review/219) from a fresh measurement on the whole-branch guard round's
  // tree (base 48e1520b), the same way: 99,579 bytes (cursor, generated) /
  // 2,568 lines (claude and codex, generated), 98% of the old row, because the
  // later guard rounds grew the embedded verdicts past the 81,086 the row was
  // set from (the review read 91,741 in the goldens at f8b7f57a) and this round adds a
  // review approval, a close deleting a branch, git's program-valued variables,
  // the remote writes, Cursor's payload with no command and the tags read only
  // for a push. × 1.25 = 124,473.75 / 3,210, rounded up to 124,928 / 3,210.
  // Re-sized 2026-10-18 from a fresh measurement on base 47dc9982, the same way:
  // 125,100 bytes (cursor, generated) / 3,063 lines (claude and codex,
  // generated), past the row, because PR #112's round 4 grew the embedded
  // verdicts: git symbolic-ref's tag and default-branch writes, curl's requests
  // after --next read one by one, a call whose method or targets the line hides
  // refused (HTTP_TARGET_HIDDEN), the GraphQL repository-settings, protection,
  // ruleset and custom-property mutations, and the custom-property REST writes.
  // × 1.25 = 156,375 / 3,828.75, rounded up to 156,672 / 3,830.
  // Re-sized 2026-10-18 on the v0b lane (base 4f13752d), the same way: 156,994
  // bytes (cursor, generated) / 3,626 lines (claude, generated), past the row,
  // because plan 021 file 2's guard units grew the script: v0a2's ask emission
  // and MCP branch, then v0b's stand-alone rule for the run verbs, the
  // substitution kept as a word, gh's options before its subcommand, wget's
  // `-X`, PowerShell's typographic quotes and SSH_ASKPASS. × 1.25 = 196,242.5 /
  // 4,532.5, rounded up to 196,608 / 4,540.
  [PERSON_ONLY_GUARD_FILE]: { bytes: 196_608, lines: 4_540 },
};

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
 * Where the review gate's round counter lives — defined at the bottom of the
 * tree (`../types/markers.ts`, which says why it sits outside the generated
 * tree) because the gitignore lane and the worktree lane name it too and may
 * not import this module. Re-exported under the same name for the adapters
 * that wire the gate.
 */
export { REVIEW_GATE_STATE_FILE } from "../types/markers.ts";

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
export const SESSION_START_SCREEN: readonly DenyPattern[] = [
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
 * body is and is not guaranteed to do. Line 2, under the shebang, is the
 * file-level lint directive (REQ-FLOW-001), so the user's own lint gate passes
 * over a script they did not write.
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
    GENERATED_SCRIPT_LINT_DIRECTIVE,
    ...summary.map((line) => (line === "" ? "//" : `// ${line}`)),
    "//",
    "// Generated file — regenerate it rather than editing; local edits are overwritten.",
    "// Trust posture: exec form, repo-committed, no dynamic evaluation, no network reach.",
    ...posture.map((line) => `// ${line}`),
  ].join("\n");
}

/**
 * Where an emitted script SITS, decided when it is rendered and never at run
 * time.
 *
 * `generated` is this repository's own layout —
 * `<root>/.stamity/generated/hooks/<tool>/<script>` — where the script's own
 * location identifies the repository. `container` is a vendor plugin root, where
 * every script is a sibling in one `hooks/` directory and the repository the
 * session opened is not derivable from the script's path at all.
 *
 * Emission is the only place that knows which, so it is the only place that
 * decides — the same ruling {@link policiesPathFor} in `../emit/hooksInfra.ts`
 * already makes for the guard's policy document, and for the same reason: a body
 * that probed its surroundings at run time would let whatever tree it happens to
 * sit in answer the question.
 */
export type HookScriptLayout = "generated" | "container";

/**
 * The three parent segments a `generated` script's directory sits under, innermost
 * last. Load-bearing as a SHAPE check, not as decoration: a plugin root built at
 * `<repo>/dist/plugins/claude/hooks` is also four levels under this checkout, and
 * without the check it would claim the checkout as its repository root.
 *
 * A literal twin of `HOOKS_GENERATED_DIR` (`../emit/hooksInfra.ts`), and not
 * derived from it, because it cannot be: that module IMPORTS this one, and
 * `test/architecture/boundaries.test.ts` puts it at wave 5 against this file's
 * wave 4, so the edge is both a cycle and backwards. The two are bound instead by
 * a case in `test/hooks/scripts.test.ts` that reads the constant and the EMITTED
 * line and fails the moment they disagree — which is the guarantee the derivation
 * would have bought.
 */
const GENERATED_ANCHOR_SEGMENTS = [".stamity", "generated", "hooks"] as const;

/**
 * The repo-root resolver every script that reads the state directory shares, in
 * the two forms the two layouts take.
 *
 * In the `generated` layout the FIRST answer is the script's own location. The
 * body walks four levels up from the script's own directory and accepts the result only
 * when the three segments above its own directory read
 * `.stamity/generated/hooks` — which is exactly the layout emission wrote, and
 * nothing else. This is what makes a hook run from a sub-directory read and write
 * under the repository the setup belongs to: with the command anchored on the
 * client's project-directory variable the script is FOUND from anywhere, and
 * without this it would still resolve its state against `process.cwd()`, so a
 * session sitting in `<root>/packages/web` loaded no learnings from
 * `<root>/.stamity/` and the review gate created `<root>/packages/web/.stamity/`
 * to keep its counter in.
 *
 * `STAMITY_REPO_ROOT` stays exactly what it was, one rank lower: how a client
 * that runs a hook from a subdirectory names the repository. It is also an INPUT,
 * so it is bounded like one: the value is honoured only when it resolves to the
 * working directory or an ANCESTOR of it, and only when that directory actually
 * holds this repo's state directory. Anything else is not naming the repo the
 * client opened — it is pointing the script at an unrelated tree, and for the
 * review gate that means every future run reads and REPLACES a file over there. A
 * value failing either condition is ignored and the working directory stands; the
 * script degrades to less context, never to writing somewhere nobody chose.
 *
 * The `container` form is byte-identical to what both bodies carried before this
 * anchor existed, and deliberately: a script in a vendor plugin root sits beside
 * its siblings under a marketplace clone or a client cache, four levels above
 * which is nobody's repository, so there is nothing there to derive and the two
 * answers that remain are the bounded environment variable and the cwd.
 *
 * Emitted as text rather than as a call because these bodies are standalone
 * modules with no import of their own to reach for.
 */
function resolveRepoRoot(layout: HookScriptLayout): string {
  const derived =
    layout === "container"
      ? ""
      : `
  const derived = derivedRoot();
  if (derived !== "") return derived;`;
  const helper =
    layout === "container"
      ? ""
      : `/**
 * The repository root this script was emitted into, or "" when the script is not
 * sitting where emission puts one. Shape-checked rather than assumed: four levels
 * up from any directory is some directory, and only the emitted layout's own
 * parent segments make it a repository root.
 */
function derivedRoot() {
  let dir = dirname(HERE);
  for (const segment of ANCHOR_SEGMENTS) {
    if (basename(dir) !== segment) return "";
    dir = dirname(dir);
  }
  return dir;
}

`;
  return `${
    layout === "container"
      ? ""
      : `const HERE = dirname(fileURLToPath(import.meta.url));
const ANCHOR_SEGMENTS = ${json(GENERATED_ANCHOR_SEGMENTS.toReversed())};

`
  }${helper}function repoRoot() {
  const cwd = resolve(process.cwd());${derived}
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
}

/**
 * The `node:path` names a body needs on top of its own, plus the whole
 * `node:url` line, for one layout. Returned rather than spelled twice, so a body
 * rendered for a container keeps byte-for-byte what it carried before the anchor.
 */
function repoRootImports(layout: HookScriptLayout): {
  path: readonly string[];
  url: string;
} {
  return layout === "container"
    ? { path: [], url: "" }
    : { path: ["basename", "dirname"], url: 'import { fileURLToPath } from "node:url";\n' };
}

/** One `import { … } from "<module>";` line, names de-duplicated and sorted. */
function namedImport(names: readonly string[], module: string): string {
  return `import { ${[...new Set(names)].toSorted().join(", ")} } from "${module}";`;
}

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
  /**
   * Where this copy will sit ({@link HookScriptLayout}). Defaults to
   * `generated`, the layout this repository emits; `planCoreHookScripts` passes
   * the one emission chose.
   */
  layout?: HookScriptLayout;
}

/** The lines a client's cloud session prints: its `sessionStart` rows in {@link CLIENT_CLOUD_FACTS}, in order. */
function cloudSessionLines(tool: Tool): string[] {
  return CLIENT_CLOUD_FACTS.flatMap((row) => (row.tool === tool && row.sessionStart !== undefined ? [row.sessionStart] : []));
}

/**
 * The cloud and CI sessions the session start names (REQ-FLOW-085), in priority
 * order, each with what it does not enforce there. A marker counts when it is set
 * to a value other than "", "false" and "0" (and to `equals` where given); its
 * value is never printed, so a marker cannot carry text into the session. Cursor's
 * marker names a Cursor agent machine (managed or self-hosted): Cursor sets it on
 * both, and a managed VM runs no session-start hook, so the managed reading comes
 * from the context-once script ({@link buildContextOnceScript}).
 * A client's lines are read from {@link CLIENT_CLOUD_FACTS}, where each carries
 * its vendor page and access date; the CI line is this engine's own behaviour.
 */
const CLOUD_SESSIONS: readonly {
  name: string;
  vars: readonly string[];
  equals?: string;
  lines: readonly string[];
}[] = [
  {
    name: "a Claude Code cloud session",
    vars: ["CLAUDE_CODE_REMOTE"],
    equals: "true",
    lines: cloudSessionLines("claude"),
  },
  {
    name: "a Copilot cloud agent session",
    vars: ["COPILOT_AGENT_PROMPT"],
    lines: cloudSessionLines("copilot"),
  },
  {
    name: "a Cursor agent machine (managed or self-hosted)",
    vars: ["CURSOR_AGENT_SOCKET"],
    lines: cloudSessionLines("cursor"),
  },
  { name: "a CI run", vars: ["CI", "GITHUB_ACTIONS"], lines: ["No person answers; declared defaults apply."] },
];

/**
 * The session index's source, shared by the session start and Cursor's
 * context-once script ({@link buildContextOnceScript}), so both read through one
 * screen. `head` declares the constants, the screen, the clock and the repository
 * root, and does no read beyond the root's; `index` lists and screens the
 * learnings and handoffs at its own top level, then declares `render()` and
 * `sessionLines(env)`. Each body imports what the two use.
 */
function sessionIndexSource(opts: SessionStartScriptOptions): { head: string; index: string } {
  const segments = repoRelativeSegments(opts.stateDir ?? STATE_DIR, "stateDir");
  const maxLines = positiveInteger(opts.maxIndexLines ?? DEFAULT_MAX_INDEX_LINES, "maxIndexLines");
  const layout = opts.layout ?? "generated";
  const screen = SESSION_START_SCREEN.map(
    (entry) =>
      `  { id: ${json(entry.id)}, re: new RegExp(${json(entry.pattern.source)}, ${json(entry.pattern.flags)}) },`,
  ).join("\n");
  return {
    head: `const STATE_SEGMENTS = ${json(segments)};
const MAX_ITEM_LINES = ${maxLines};
const MAX_LEARNING_BYTES = ${MAX_LEARNING_FILE_BYTES};
const MAX_HANDOFF_BYTES = ${MAX_HANDOFF_FILE_BYTES};
const MAX_FIELD_CHARS = ${MAX_LEARNING_SUMMARY_LENGTH};
const REVIEW_WARNING_DAYS = ${REVIEW_WARNING_DAYS};
const ORDERING_HEAD_BYTES = ${HEAD_BYTES};
const RESUMABLE = ${json([...RESUMABLE_STATUSES])};
const SESSIONS = [
${CLOUD_SESSIONS.map((session) => `  ${json(session)},`).join("\n")}
];
const INVISIBLE = new RegExp(${json(INVISIBLE_SMUGGLING_CHARS.source)}, "g");
const SCREEN = [
${screen}
];

${NORMALIZE_FOR_SCREEN}

const NOW = Date.now();

${resolveRepoRoot(layout)}

const STATE_ROOT = join(repoRoot(), ...STATE_SEGMENTS);`,
    index: `/** \`.md\` entries in a directory. Absent or unreadable both read as empty. */
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
  const doc = { name, size: stats.size, day: dayOf(stats.mtimeMs), skip: "", head: null };
  if (stats.size > maxBytes) return { ...doc, skip: "over-size" };

  let bytes;
  try {
    bytes = readFileSync(join(dir, name));
  } catch {
    return { ...doc, skip: "invalid-frontmatter" };
  }
  const raw = bytes.toString("utf8");
  // Keyed before any screen, as the engine keys a file before it examines it, and
  // from the same head bytes the engine's \`orderingDay\` reads.
  doc.day = declaredDay(bytes.subarray(0, ORDERING_HEAD_BYTES).toString("utf8")) || doc.day;
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

/** A timestamp as a UTC calendar day. */
function dayOf(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The \`date\` inside the opening fence of a file's head bytes, matched by line
 * the way the engine's \`orderingDay\` matches it, or "" when there is none.
 */
function declaredDay(raw) {
  if (!raw.startsWith("---")) return "";
  const end = raw.indexOf("\\n---", 3);
  const found = /^[ \\t]*date[ \\t]*:[ \\t]*["']?(\\d{4}-\\d{2}-\\d{2})/m.exec(end === -1 ? raw : raw.slice(0, end));
  return found === null ? "" : found[1];
}

/**
 * The screen, run over every copy the engine's own gates run it over: the raw
 * text, the invisible-stripped copy, and the composed normalization of that
 * copy. A union, never a replacement — the normalized copy adds the refusals a
 * lookalike or a combining mark hid, and the raw copy keeps the ones NFKC
 * destroys by composing a trailing mark into the letter before it.
 *
 * Returns the first matching pattern id in SCREEN order, or "" when none
 * matches: a refusal that names its pattern is one somebody can attribute.
 */
function screenHit(raw) {
  const stripped = raw.replace(INVISIBLE, "");
  const copies = [raw, stripped];
  const normalized = normalizeForScreen(stripped);
  if (normalized !== stripped) copies.push(normalized);
  const hit = SCREEN.find((entry) =>
    copies.some((copy) => {
      // A \`g\`-flagged row carries \`lastIndex\` between calls, and this now tests
      // three copies per row: without the reset the second copy would resume
      // mid-string and a hit could fall through.
      entry.re.lastIndex = 0;
      return entry.re.test(copy);
    }),
  );
  return hit === undefined ? "" : hit.id;
}

/** Whether any screen pattern matches. */
function screened(raw) {
  return screenHit(raw) !== "";
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
  // Newest declared date first — a learning written today outranks one from six
  // months ago, and a date survives a clone where an mtime does not — with a
  // name tiebreak so one day's learnings still order deterministically.
  .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

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
    return ["stamity: no learnings and no resumable handoffs in this repo yet."];
  }

  const bytes = loaded.reduce((total, doc) => total + doc.size, 0);
  // The file name is payload too: it is attacker-chosen on any file that
  // reached the directory, and it is concatenated into a line an agent reads.
  const ids = loaded.map((doc) => text(doc.head.id, text(stem(doc.name), "(unnamed)")));
  const duplicated = new Set(ids.filter((id, index) => ids.indexOf(id) !== index));
  const section = [];
  append(
    section,
    loaded.map((doc, index) => {
      const id = ids[index];
      const confidence = text(doc.head.confidence, "unrated");
      const summary = text(doc.head.summary, "(no summary)");
      const flag = duplicated.has(id) ? " [duplicate id]" : "";
      // Inside the warning window: re-verify before the read screen skips it.
      const due =
        Date.parse(doc.head.reviewBy + "T00:00:00Z") <= NOW + REVIEW_WARNING_DAYS * 86400000
          ? " [review due " + text(doc.head.reviewBy, "") + "]"
          : "";
      return "- [" + confidence + "] " + id + " — " + summary + " (" + fileName(doc) + ")" + flag + due;
    }),
    "learning",
  );
  append(section, skipped.map(skipLine), "skipped file");
  // Two figures: the bytes of the lines printed below, which is what this banner
  // costs, and the loaded files' bytes on disk.
  const out = [
    "Learnings: " + loaded.length + " loaded, " + skipped.length + " skipped, " +
      Buffer.byteLength(section.join("\\n"), "utf8") + " bytes in this index (" + bytes + " bytes on disk).",
    ...section,
  ];

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

/** The first cloud or CI session by priority, its lines, then the others by name. */
function sessionLines(env) {
  const [first, ...rest] = SESSIONS.filter((session) =>
    session.vars.some((name) => {
      const value = env[name];
      return typeof value === "string" && !["", "false", "0"].includes(value) && (session.equals ?? value) === value;
    }),
  );
  if (first === undefined) return [];
  const out = ["Session: " + first.name + ".", ...first.lines.map((line) => "- " + line)];
  if (rest.length > 0) out.push("Also detected: " + rest.map((session) => session.name).join(", ") + ".");
  return out;
}`,
  };
}

/**
 * The session-start context load: prints the learnings index and the
 * resumable handoffs for the repo the session opened in — and, on a start
 * whose payload says `source: "compact"` or `source: "resume"`, the resume
 * card of the run in progress, or of the newest closed run dated within the
 * last two days (`../runs/cardSource.ts`), screened whole by the same screen;
 * on `source: "startup"`, only the card of the run in progress on this branch.
 *
 * The index format mirrors the engine's own (`formatLearningsIndex`,
 * `buildHandoffIndex`) line for line, because the two render the same corpus
 * and an operator reading a session banner should not have to learn a second
 * shape. Past MAX_ITEM_LINES the banner prints fewer lines than the engine's
 * full index, and each header's byte figure counts its own printed lines.
 * What the script re-implements is the READ SCREEN, not the validator:
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
  const source = sessionIndexSource(opts);
  const extra = repoRootImports(opts.layout ?? "generated");

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
      "",
      "After a compaction or a resume (a start whose stdin payload says source",
      '"compact" or "resume") it appends the resume card of the run in progress, or',
      'of a closed run dated within the last two days; on a fresh start ("startup")',
      "only the card of the run in progress on the branch HEAD names. Counts and",
      "pointers, never finding text.",
      "In a cloud or CI session it names the session and what is not enforced there.",
    ],
    [
      "Reads outside repo state: the wall clock, which decides whether a learning's",
      "review horizon has passed, whether a handoff has expired and whether a closed",
      "run is recent enough for the card, and the source field of the stdin payload,",
      "which decides whether the resume card is appended and which one. Same repo,",
      "two different days or two different starts, two different banners. The",
      "cloud and CI markers in the environment, by presence only.",
    ],
  )}

import { createHash } from "node:crypto";
${namedImport(["readFileSync", "readdirSync", "statSync", ...RESUME_CARD_HOST_NAMES.fs], "node:fs")}
${namedImport(["join", "resolve", "sep", ...extra.path, ...RESUME_CARD_HOST_NAMES.path], "node:path")}
import { isatty } from "node:tty";
${extra.url}
${source.head}

${source.index}

${READ_STDIN}

${READ_FIELD}

${buildResumeCardSource()}

// Which start this is. A person running the script at a terminal sends no
// payload, so a TTY is never read — reading it would wait for input nobody is
// going to type. The check asks fd 0 directly: touching process.stdin would
// open it as a non-blocking stream, and the read below would then fail with
// EAGAIN whenever the client had not finished writing yet. A start after a
// compaction or on a resume appends the card; a fresh start appends it only for
// the run in progress on the branch HEAD names, which a new machine continues
// (REQ-CTX-013); a client that sends no source (or none of the three) gets the
// banner it always got.
const SOURCE = isatty(0) ? "" : field(readPayload(), ["source"]);

// Written once, then the process ends on its own. \`process.exit\` would race
// the write: stdout is asynchronous when it is a pipe on macOS and the BSDs,
// which is exactly how a client runs a hook.
const lines = render();
// Before the card, so the card stays everything after the last blank line.
const session = sessionLines(process.env);
if (session.length > 0) lines.push("", ...session);
if (SOURCE === "compact" || SOURCE === "resume" || SOURCE === "startup") {
  const card = resumeCardLines(repoRoot(), STATE_ROOT, NOW, SOURCE === "startup");
  if (card !== null) lines.push("", ...card);
}
process.stdout.write(lines.join("\\n") + "\\n");
`;
}

/**
 * The folder under the state directory where the context-once script keeps one
 * empty marker per conversation, named by the SHA-256 of its `conversation_id`
 * (REQ-FLOW-115): `CONTEXT_ONCE_DIR`'s last segment, so the script and the ignore
 * rule name one folder. Machine-local: setup ignores it (`../mcp/env.ts`) and a
 * worktree never receives it (`../worktree/policy.ts`).
 */
export const CONTEXT_ONCE_SEGMENT: string = CONTEXT_ONCE_DIR.slice(STATE_DIR.length + 1);

/** The line the context-once script adds where Cursor's `agent/runtime` metadata reads `managed`. */
export const CONTEXT_ONCE_MANAGED_LINE = "Session: a Cursor cloud agent.";

/**
 * The metadata key the context-once script reads, as Cursor's metadata page
 * (cursor.com/docs/cloud-agent/metadata, read 2026-10-18) names the request:
 * `GET /v1/meta-data[/<path>]`, HTTP over the Unix socket at
 * `CURSOR_AGENT_SOCKET`, the value as plain text, a missing key a 404.
 * `agent/runtime` reads `managed` on a Cursor-managed VM; a self-hosted worker
 * does not serve the metadata API.
 */
export const CONTEXT_ONCE_RUNTIME_PATH = "/v1/meta-data/agent/runtime";

/** Options for {@link buildContextOnceScript}. */
export interface ContextOnceScriptOptions extends SessionStartScriptOptions {
  /** Milliseconds one socket read may take before it counts as failed. Defaults to 1,000. */
  socketTimeoutMs?: number;
}

/**
 * Cursor's context-once script (REQ-FLOW-115): on the first `postToolUse` of a
 * conversation it prints the session index, the session start's own lines read
 * through the same screen ({@link sessionIndexSource}), as Cursor's
 * `additional_context`. A Cursor cloud agent runs no `sessionStart` hook, and
 * `postToolUse` is the one event there that injects context (cursor.com/docs/hooks,
 * read 2026-10-15), so without it a cloud agent starts with no index at all.
 *
 * Like {@link buildCursorContinueScript} it is NOT core: the Cursor adapter
 * places and wires it, through the walk-up starter and never the portable runner
 * (whose output the script writes in Cursor's own spelling), and never
 * `failClosed`. It answers nothing unless `CURSOR_AGENT_SOCKET` is set (not "",
 * "false", "0"), so a local session's tool calls stay write-free; a self-hosted
 * worker, whose `sessionStart` also runs, sees the index twice, which is accepted.
 *
 * Once per conversation: the marker is `<state>/context-once/<sha256 of the id>`,
 * so a `conversation_id` is never a path. A payload with no string id prints
 * nothing and writes nothing. A marker already there prints nothing; one this
 * call cannot write (the folder unwritable, or a link) still prints, so a
 * read-only checkout loses the "once", never the index. Before printing it reads
 * the `agent/runtime` metadata once over the socket ({@link CONTEXT_ONCE_RUNTIME_PATH}),
 * retrying once after a failed connection, a timeout or a status the page says
 * to retry; `managed` adds {@link CONTEXT_ONCE_MANAGED_LINE} after the session
 * lines, and anything else, a missing key included, adds nothing. Every path
 * exits 0.
 */
export function buildContextOnceScript(opts: ContextOnceScriptOptions = {}): string {
  const source = sessionIndexSource(opts);
  const layout = opts.layout ?? "generated";
  const extra = repoRootImports(layout);
  const timeoutMs = positiveInteger(opts.socketTimeoutMs ?? 1_000, "socketTimeoutMs");
  return `${header(
    [
      "stamity — context-once hook (Cursor).",
      "",
      "On a Cursor agent machine (CURSOR_AGENT_SOCKET set), the first postToolUse",
      "of a conversation prints the session start's index, read through the same",
      "screen, as additional_context, and writes an empty marker named by the hash",
      "of the conversation id so later calls print nothing. Where the agent/runtime",
      "metadata reads managed it adds that the session is a Cursor cloud agent.",
      "Anything else prints nothing. Never blocks; every path exits 0.",
    ],
    [
      "Reads outside repo state: the payload's conversation_id on stdin, the",
      "CURSOR_AGENT_SOCKET and STAMITY_REPO_ROOT variables and the other cloud",
      "markers by presence, the wall clock as the session start reads it, and one",
      "agent/runtime read over the local agent socket (one retry), never the network.",
      "Writes one empty marker under the state directory's context-once folder.",
    ],
  )}

import { createHash } from "node:crypto";
${namedImport(["lstatSync", "mkdirSync", "readFileSync", "readdirSync", "statSync", "writeFileSync"], "node:fs")}
import { get } from "node:http";
${namedImport(["dirname", "join", "resolve", "sep", ...extra.path], "node:path")}
import { isatty } from "node:tty";
${extra.url}
${source.head}

const MARKER_SEGMENT = ${json(CONTEXT_ONCE_SEGMENT)};
const RUNTIME_PATH = ${json(CONTEXT_ONCE_RUNTIME_PATH)};
const MANAGED_LINE = ${json(CONTEXT_ONCE_MANAGED_LINE)};
const SOCKET_TIMEOUT_MS = ${timeoutMs};
const RETRY_DELAY_MS = 250;
// The statuses the metadata page says to retry; a 403 or a 404 is final.
const RETRY_STATUSES = [429, 500, 502, 503, 504];

${READ_STDIN}

${READ_FIELD}

/** The session start's index: its learnings and handoffs, screened, then the session lines. */
function sessionIndex() {
${source.index}

const lines = render();
const session = sessionLines(process.env);
if (session.length > 0) lines.push("", ...session);
return lines;
}

/** One GET of the runtime key over the socket: its status and at most 256 characters of body, or null when unread. */
function runtimeOnce(socket) {
  return new Promise((done) => {
    const request = get({ socketPath: socket, path: RUNTIME_PATH, timeout: SOCKET_TIMEOUT_MS }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        if (body.length < 256) body += chunk;
      });
      response.on("end", () => done({ status: response.statusCode ?? 0, body: body.slice(0, 256) }));
      response.on("error", () => done(null));
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", () => done(null));
  });
}

/** Whether the agent/runtime metadata reads managed: one read, and one retry after a failed one. */
async function managedRuntime(socket) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await new Promise((wait) => setTimeout(wait, RETRY_DELAY_MS));
    const answer = await runtimeOnce(socket);
    if (answer !== null && !RETRY_STATUSES.includes(answer.status)) {
      return answer.status === 200 && answer.body.trim() === "managed";
    }
  }
  return false;
}

/** "claimed" when this call wrote the marker, "seen" when another wrote it first, "unwritable" otherwise. */
function claim(path) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    // A folder planted as a link would carry the write elsewhere: the marker goes into a real folder only.
    if (!lstatSync(dirname(path)).isDirectory()) return "unwritable";
  } catch {
    // A file where the folder goes answers EEXIST here too, and it is no marker.
    return "unwritable";
  }
  try {
    writeFileSync(path, "", { flag: "wx" });
    return "claimed";
  } catch (error) {
    return error && error.code === "EEXIST" ? "seen" : "unwritable";
  }
}

/** The context this call adds, or null when it adds none. */
async function contextOnce() {
  // A Cursor agent machine only: a local session's tool calls stay write-free.
  const socket = process.env.CURSOR_AGENT_SOCKET ?? "";
  if (["", "false", "0"].includes(socket)) return null;
  // A person at a terminal sends no payload, so a TTY is never read.
  const id = isatty(0) ? "" : field(readPayload(), ["conversation_id"]);
  if (id === "") return null;
  // Hashed, never joined as given: an id of "../x" names a file inside the folder like any other.
  const marker = join(STATE_ROOT, MARKER_SEGMENT, createHash("sha256").update(id, "utf8").digest("hex"));
  try {
    lstatSync(marker);
    return null;
  } catch {
    // No marker yet: this is the conversation's first call.
  }
  const lines = sessionIndex();
  if (await managedRuntime(socket)) lines.push(MANAGED_LINE);
  if (claim(marker) === "seen") return null;
  return lines.join("\\n");
}

let context = null;
try {
  context = await contextOnce();
} catch {
  // Never a gate: a fault adds no context, and the tool call goes on.
  context = null;
}
if (context !== null) process.stdout.write(JSON.stringify({ additional_context: context }) + "\\n");
`;
}

// ── 2. Pre-tool-use guard ────────────────────────────────────────

/**
 * Clients whose PRE-TOOL-USE payload carries no agent identity — a declared
 * dialect fact, with its source, because the guard's entire scope test is
 * `agentId.startsWith(GOVERNED_PREFIX)` and a payload with no identity field
 * can never satisfy it.
 *
 * Cursor, Codex and Copilot document identity-free tool-call payloads (checked
 * 2026-09-10). Agent identity belongs to separate subagent lifecycle events.
 * Cursor’s adapter states the same fact from the other side:
 * `subagentStart` carries `subagent_type` and is "the only Cursor payload field"
 * that names an agent (`../adapters/cursor.ts`; cursor.com/docs/hooks,
 * accessed 2026-09-17), so the tool-call events this guard rides carry none.
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
export const IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS: ReadonlySet<Tool> = new Set<Tool>(["cursor", "codex", "copilot"]);

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
   * (see {@link IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS}). The API defaults to
   * `true` for identity-bearing callers. Core planning explicitly passes
   * `false` for Cursor, Codex and Copilot, whose documented payloads cannot
   * identify the calling role; their guard therefore remains telemetry.
   */
  identityBearing?: boolean;
  /**
   * Where this copy will sit ({@link HookScriptLayout}). Defaults to the layout
   * `policiesJsonPath` implies, the same derivation `planCoreHookScripts`
   * passes. Only an identity-bearing guard in the `generated` layout renders the
   * path-scoped report `Write`, because only there does the script's own
   * location name the repository root a `writePaths` pattern is relative to; a
   * container guard, and a guard that cannot name its caller, keep refusing that
   * `Write` through the category.
   */
  layout?: HookScriptLayout;
}

/** Longest `file_path` the path-scoped `Write` reads, in UTF-16 code units. */
const MAX_WRITE_FILE_PATH_CHARS = 1024;

/**
 * The rendered half of the path-scoped report `Write`: the constants and helpers
 * the identity-bearing guard of the `generated` layout carries, and no other
 * body. Text, because the guard is a standalone module with nothing to import.
 *
 * The decision is fail-closed at every step, each refusal naming its step:
 *
 * 1. **The root is the script's own.** {@link GENERATED_ANCHOR_SEGMENTS} is
 *    walked up from the script exactly as `derivedRoot` does for the other
 *    bodies — a copy, not a call, because `resolveRepoRoot` also consults an
 *    environment variable and the cwd, and neither may name the tree a write
 *    lands in. No shape, no root, no write (`no-root`).
 * 2. **The spelling is checked before it is resolved.** An absolute path of at
 *    most {@link MAX_WRITE_FILE_PATH_CHARS} characters, no NUL, and no `.` or
 *    `..` segment: a checked path and a written path that differ lexically are
 *    two paths, so `runs/x/../x/reports/…` is refused even though it resolves
 *    inside the pattern. On win32 a UNC or device prefix and an alternate data
 *    stream (`:` past the drive) are refused as well (`device-path`), and so is
 *    any segment naming a reserved device — `CON`, `PRN`, `AUX`, `NUL`,
 *    `CONIN$`, `CONOUT$`, `COM` and `LPT` with a digit or a superscript digit —
 *    in any case, with any extension and trailing dots or spaces
 *    (`device-name`): such a name opens the device, never a file, and the lstat
 *    walk below cannot be trusted to refuse it.
 * 3. **The anchor is found top down.** Among the requested path's ancestors,
 *    the FIRST whose real path is the root's real path anchors the rest, which
 *    absorbs a `/var` -> `/private/var` link above the root; bottom up, a link
 *    inside the root that points at the root would anchor and hide itself.
 * 4. **Nothing below the anchor is a link.** Each existing entry is `lstat`ed:
 *    a symbolic link (or a win32 junction) anywhere refuses, an intermediate
 *    that is not a directory refuses, and an existing leaf must be a regular
 *    file with one link. The walk stops at the first missing entry, because a
 *    run's first report arrives before its `reports/` folder does.
 * 5. **The pattern matches per segment.** Equal segment counts, case-sensitive.
 *    Earlier segments match `*` by prefix, ordered `indexOf` and suffix; the
 *    final segment's LAST `*` — the round number before `.md` — matches one or
 *    more ASCII digits only. That is what keeps `*-reviewer-r*.md` from
 *    admitting `x-reviewer-report-security-r1.md`, whatever role tokens a pass
 *    slug holds. No `RegExp` is ever built from document data. The limit: the
 *    round takes the LONGEST trailing digit run, so a pattern whose piece just
 *    before that last `*` ends in a digit (`*-v2*.md`) matches nothing — no
 *    shipped pattern has one.
 *
 * The patterns are filtered first by a literal twin of `isWritePathPattern`
 * (`../roster/agentPolicies.ts`), which this module may not import from the
 * rendered text; `test/hooks/scripts.test.ts` binds the two case by case.
 *
 * A write swapped under the check (a directory replaced by a link between this
 * run and the client's write) needs an agent that can already write anywhere,
 * so the race is not an escalation.
 *
 * The same block carries {@link readOnlyGitHelpers}, rendered just before the
 * `printable` helper both branches' refusals share, so the path-scoped block
 * runs from `WRITE_TOOL` to that helper as one piece.
 */
function pathScopedWriteHelpers(): string {
  return `const WRITE_TOOL = ${json(CLAUDE_REPORT_WRITE_TOOL)};
const HERE = dirname(fileURLToPath(import.meta.url));
const ANCHOR_SEGMENTS = ${json(GENERATED_ANCHOR_SEGMENTS.toReversed())};
const MAX_PATH_CHARS = ${MAX_WRITE_FILE_PATH_CHARS};
const MAX_PATTERN_CHARS = 200;
const MAX_PATTERN_SEGMENTS = 16;
const PATTERN_SEGMENT = /^[A-Za-z0-9._*-]+$/;

/** One own property of an object, or undefined: an inherited name never answers. */
function own(value, key) {
  return value !== null && typeof value === "object" && Object.hasOwn(value, key) ? value[key] : undefined;
}

/**
 * The repository root this guard was emitted into, or "" when it is not sitting
 * where emission puts one. From the script's own location only: no environment
 * variable and no working directory decides where a report may land.
 */
function guardRoot() {
  let dir = dirname(HERE);
  for (const segment of ANCHOR_SEGMENTS) {
    if (basename(dir) !== segment) return "";
    dir = dirname(dir);
  }
  return dir;
}

/** A literal twin of the roster's write-path grammar: a pattern it rejects scopes nothing. */
function isWritePathPattern(value) {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_PATTERN_CHARS) return false;
  if (value.includes("**")) return false;
  const segments = value.split("/");
  if (segments.length > MAX_PATTERN_SEGMENTS) return false;
  return segments.every((segment) => segment !== "." && segment !== ".." && PATTERN_SEGMENT.test(segment));
}

/** One segment against its \`*\`-split pieces: prefix, ordered indexOf, suffix. */
function piecesMatch(text, pieces) {
  if (pieces.length === 1) return text === pieces[0];
  const head = pieces[0];
  const tail = pieces[pieces.length - 1];
  if (text.length < head.length + tail.length) return false;
  if (!text.startsWith(head) || !text.endsWith(tail)) return false;
  const end = text.length - tail.length;
  let cursor = head.length;
  for (let index = 1; index < pieces.length - 1; index += 1) {
    const at = text.indexOf(pieces[index], cursor);
    if (at < 0 || at + pieces[index].length > end) return false;
    cursor = at + pieces[index].length;
  }
  return true;
}

/**
 * The final segment: its last \`*\` — the round number just before the suffix —
 * takes one or more ASCII digits and nothing else; its other \`*\`s keep the
 * plain rule. A segment with no \`*\` matches exactly.
 */
function finalSegmentMatches(text, segment) {
  const star = segment.lastIndexOf("*");
  if (star < 0) return text === segment;
  const suffix = segment.slice(star + 1);
  if (text.length < suffix.length || !text.endsWith(suffix)) return false;
  const rest = text.slice(0, text.length - suffix.length);
  let cut = rest.length;
  while (cut > 0 && rest.charCodeAt(cut - 1) >= 48 && rest.charCodeAt(cut - 1) <= 57) cut -= 1;
  if (cut === rest.length) return false;
  return piecesMatch(rest.slice(0, cut), segment.slice(0, star).split("*"));
}

/** A repository-relative POSIX path against one pattern, segment for segment. */
function patternMatches(path, pattern) {
  const pathSegments = path.split("/");
  const patternSegments = pattern.split("/");
  if (pathSegments.length !== patternSegments.length) return false;
  const last = patternSegments.length - 1;
  for (let index = 0; index < last; index += 1) {
    if (!piecesMatch(pathSegments[index], patternSegments[index].split("*"))) return false;
  }
  return finalSegmentMatches(pathSegments[last], patternSegments[last]);
}

/** The win32 reserved device names, upper case: each opens a device wherever it sits in a path. */
const RESERVED_DEVICE_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$",
  ...["COM", "LPT"].flatMap((port) => Array.from("0123456789\\u00b9\\u00b2\\u00b3", (digit) => port + digit)),
]);

/**
 * True when one path segment names a win32 reserved device: the text before its
 * first \`.\`, trailing spaces dropped, compared case-insensitively — so
 * \`con\`, \`CON.md\`, \`CON.-reviewer-r1.md\` and \`CON . .\` all name the console.
 */
function isReservedDeviceSegment(segment) {
  const dot = segment.indexOf(".");
  const stem = (dot < 0 ? segment : segment.slice(0, dot)).trimEnd();
  return RESERVED_DEVICE_NAMES.has(stem.toUpperCase());
}

/**
 * "" when this Write may land, or the one reason it may not. Reads file-system
 * metadata of the requested path's ancestors (realpath, lstat), never content.
 */
function writePathCheck(payload, patterns) {
  const root = guardRoot();
  if (root === "") return "no-root";
  const input = own(payload, "tool_input");
  if (input === null || typeof input !== "object") return "no-file-path";
  const raw = own(input, "file_path");
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PATH_CHARS || raw.includes("\\0")) {
    return "no-file-path";
  }
  if (!isAbsolute(raw)) return "not-absolute";
  const segments = raw.split(/[\\\\/]+/);
  if (segments.some((segment) => segment === "." || segment === "..")) return "dot-segment";
  if (process.platform === "win32") {
    if (/^[\\\\/]{2}/.test(raw)) return "device-path";
    if (segments.slice(1).some((segment) => segment.includes(":"))) return "device-path";
    if (segments.some(isReservedDeviceSegment)) return "device-name";
  }

  const target = resolve(raw);
  const rootReal = realpathSync.native(root);
  const chain = [];
  for (let current = target; ; ) {
    chain.unshift(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  let anchor = -1;
  for (let index = 0; index < chain.length && anchor < 0; index += 1) {
    let real;
    try {
      real = realpathSync.native(chain[index]);
    } catch (error) {
      // An ancestor that does not resolve anchors nothing; the walk goes on to
      // the next deeper one, and if none anchors the path is outside-root.
      // Anything that is not a file-system answer is a real fault.
      if (error && typeof error.code === "string") continue;
      throw error;
    }
    if (relative(rootReal, real) === "") anchor = index;
  }
  if (anchor < 0) return "outside-root";

  const tail = chain.slice(anchor + 1).map((entry) => basename(entry));
  let current = rootReal;
  for (let index = 0; index < tail.length; index += 1) {
    current = join(current, tail[index]);
    let entry;
    try {
      entry = lstatSync(current);
    } catch (error) {
      // Missing: nothing from here down exists yet, so nothing below is a link.
      if (error && error.code === "ENOENT") break;
      throw error;
    }
    if (entry.isSymbolicLink()) return "symlink";
    const leaf = index === tail.length - 1;
    if (!leaf && !entry.isDirectory()) return "not-a-directory";
    if (leaf && !entry.isFile()) return "not-a-regular-file";
    if (leaf && entry.nlink > 1) return "hard-linked";
  }

  const path = tail.join("/");
  return patterns.some((pattern) => patternMatches(path, pattern)) ? "" : "no-pattern-match";
}

${readOnlyGitHelpers()}

/**
 * The engine's shared unprintable class, embedded by source and flags: C0, DEL,
 * C1, the zero-width marks, the line and paragraph separators, the bidi
 * controls and the byte-order mark.
 */
const GUARD_UNPRINTABLE = new RegExp(${json(UNPRINTABLE_CHARS.source)}, ${json(UNPRINTABLE_CHARS.flags)});

/** Drops every character of that class, so a refusal prints as one inert line. */
function printable(text) {
  return String(text).replace(GUARD_UNPRINTABLE, "");
}`;
}

/**
 * The branch {@link pathScopedWriteHelpers} serves, rendered inside `evaluate()`
 * just before the category refusal: after the deny list and the category
 * lookup, so a tool named on `denyTools` and an unknown tool refuse as before.
 * It keys on the TOOL name, never on the category — `Edit` and `NotebookEdit`
 * share `edit` with `Write` and are never path-scoped — and only on a row that
 * withholds `edit`, since a row holding it is admitted by the category anyway.
 * A row whose patterns are all invalid falls through to the category refusal.
 */
const PATH_SCOPED_WRITE_BRANCH = `    // A verdict role's one write: its own report, through the single-file Write
    // only, on a regular file under this repository matching its write paths.
    if (
      tool === WRITE_TOOL &&
      category === "edit" &&
      Array.isArray(policy.allow) &&
      !policy.allow.includes("edit") &&
      Array.isArray(policy.writePaths)
    ) {
      const patterns = policy.writePaths.filter(isWritePathPattern);
      if (patterns.length > 0) {
        const check = writePathCheck(payload, patterns);
        if (check === "") return null;
        const root = guardRoot();
        return {
          ...subject,
          category,
          reasonCode: "WRITE_PATH_DENIED",
          writeCheck: check,
          message: printable(
            \`Agent "\${agentId}" may write only its report — a regular file matching \${patterns.join(" or ")} under \${root === "" ? "the repository root" : root} — and this Write was refused (\${check}). Return the full report inline instead.\`,
          ),
        };
      }
    }
`;

/** Longest shell command the read-only git check reads, in UTF-16 code units. */
const MAX_GIT_COMMAND_CHARS = 1024;

/**
 * The whole alphabet of a command the read-only git check admits: no quote, no
 * `;`, `|`, `&`, `$`, backtick, redirect, glob, brace or newline, so no shell
 * syntax can ride along with the git call. Space is the only separator.
 */
const GIT_COMMAND_CHARS = /^[A-Za-z0-9 ._/:@^~=+,-]+$/;

/**
 * Option prefixes refused anywhere after the subcommand: `--output` writes a
 * file, `--ext-diff` and `--textconv` run a configured program,
 * `--show-signature` runs the configured gpg program, `--help` makes git run
 * `git help <sub>` and so `man` or the configured help browser, `--no-index`
 * is refused with them, while an implicit no-index diff of two paths (`git diff
 * a b` outside a work tree's tracked set) is admitted: the read category already
 * reads anywhere, so it grants nothing new. Git 2.52 refuses an abbreviated
 * spelling of each of them on these five subcommands (`--show-sig`, `--ext`,
 * `--textc`, `--outp`, `--hel`: "unrecognized argument" or "unknown option"),
 * so a prefix match covers every spelling git accepts. The `--help` prefix
 * also refuses `--help-all`, which only prints usage: failing closed.
 */
const GIT_DENIED_OPTION_PREFIXES = [
  "--output",
  "--ext-diff",
  "--textconv",
  "--show-signature",
  "--help",
  "--no-index",
] as const;

/**
 * The rendered half of read-only git (REQ-CTX-017), rendered inside
 * {@link pathScopedWriteHelpers} and so carried by the same body: the
 * identity-bearing guard of the `generated` layout. A command is read-only git when it (a) is at most
 * {@link MAX_GIT_COMMAND_CHARS} characters, (b) uses only
 * {@link GIT_COMMAND_CHARS}, (c) splits on single spaces into `git`, then one of
 * {@link READ_ONLY_GIT_SUBCOMMANDS} — so a top-level `-c`, `-p`, `--paginate`
 * or `--exec-path` before the subcommand is refused — and (d) has no later
 * token starting with one of {@link GIT_DENIED_OPTION_PREFIXES}.
 *
 * The residual, which a command-line check cannot see: a diff driver, a
 * textconv filter, `log.showSignature` (which runs the configured gpg program
 * without `--show-signature` on the command line)
 * or any other program that the repository's or the user's git config runs by
 * default. Those come from local configuration, not from the command an agent
 * typed, and a local config that runs a program on `git log` already runs it
 * for every person in that checkout.
 */
function readOnlyGitHelpers(): string {
  return `const GIT_TOOL = ${json(CLAUDE_READ_ONLY_GIT_TOOL)};
const GIT_SUBCOMMANDS = ${json(READ_ONLY_GIT_SUBCOMMANDS)};
const GIT_DENIED_OPTIONS = ${json(GIT_DENIED_OPTION_PREFIXES)};
const GIT_CHARS = new RegExp(${json(GIT_COMMAND_CHARS.source)});

/** Whether a shell command is read-only git: one listed subcommand, no writing option, no shell syntax. */
function readOnlyGit(command) {
  if (typeof command !== "string" || command.length > ${MAX_GIT_COMMAND_CHARS} || !GIT_CHARS.test(command)) return false;
  const tokens = command.split(" ");
  return (
    tokens[0] === "git" &&
    GIT_SUBCOMMANDS.includes(tokens[1]) &&
    !tokens.slice(2).some((token) => GIT_DENIED_OPTIONS.some((prefix) => token.startsWith(prefix)))
  );
}`;
}

/**
 * The branch {@link readOnlyGitHelpers} serves, rendered just before the
 * category refusal and after {@link PATH_SCOPED_WRITE_BRANCH}. It keys on the
 * TOOL name — `PowerShell` shares `execute` with `Bash` and is never admitted —
 * and only on a row that withholds `execute` and carries `readOnlyGit: true`.
 * Every other command such a row sends refuses as `GIT_COMMAND_DENIED`, so a
 * verdict role's `ls` reads that code rather than `CATEGORY_DENIED`.
 */
const READ_ONLY_GIT_BRANCH = `    // Read-only git for a role without execute: Bash, one listed subcommand, no
    // writing option. A program a local git config runs by default is outside
    // what this check sees.
    if (
      tool === GIT_TOOL &&
      category === "execute" &&
      Array.isArray(policy.allow) &&
      !policy.allow.includes("execute") &&
      policy.readOnlyGit === true
    ) {
      if (readOnlyGit(own(own(payload, "tool_input"), "command"))) return null;
      return {
        ...subject,
        category,
        reasonCode: "GIT_COMMAND_DENIED",
        message: printable(
          \`Agent "\${agentId}" may run only read-only git in a shell — git \${GIT_SUBCOMMANDS.join(", ")} right after "git" (no option before the subcommand, not even --no-pager), with no \${GIT_DENIED_OPTIONS.join(", ")} and no shell syntax — and this command was refused. Read the change another way, or return the dependency to the parent.\`,
        ),
      };
    }
`;

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
 *
 * One exception narrows a refusal rather than widening a grant: a row that
 * withholds `edit` but carries `writePaths` may use the single-file `Write` on a
 * regular file under the repository root that matches one of them — and nothing
 * else. It is rendered only into the identity-bearing guard of the `generated`
 * layout, see {@link pathScopedWriteHelpers}; every other body stays
 * byte-identical to the guard before the field existed. A second exception
 * rides the same body: a row that withholds `execute` but carries
 * `readOnlyGit: true` may use `Bash` for a read-only git command, and any other
 * command it sends refuses as `GIT_COMMAND_DENIED` ({@link readOnlyGitHelpers}).
 */
export function buildPreToolUseGuardScript(opts: GuardScriptOptions): string {
  const identityBearing = opts.identityBearing ?? true;
  // Both conditions, because either one alone makes the refusal decorative: a
  // client that ignores the exit status never stops the call, and a client whose
  // payload names no agent never reaches a refusal to report.
  const blocking = opts.failMode !== "fail-open" && identityBearing;
  // Both conditions again: a guard that cannot name its caller has no row to
  // read `writePaths` from, and a container guard names no repository root the
  // patterns could be relative to.
  const pathScoped = identityBearing && (opts.layout ?? layoutFor(opts.policiesJsonPath)) === "generated";
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
              "Telemetry only on this client: its hook payload carries no calling-agent",
              "identity, so the role scope test cannot match a documented tool call.",
              "Native permissions and the agent definition remain the role boundary;",
              "this script does not enforce a role grant on identity-free payloads.",
            ]),
    ],
    [
      "Reads outside repo state: the pending call's payload on stdin. Output is a",
      "function of that payload and ONE policy document — the one emitted beside",
      "this script in a container, or the repository's own at the climb, chosen",
      "when this script was rendered — and of nothing else. No environment",
      "variable and no second candidate.",
      ...(pathScoped
        ? [
            "For a path-scoped Write it also reads file-system metadata (realpath, lstat)",
            "of the requested path's ancestors under the repository root this script's own",
            "location names — never file content, never an environment variable.",
          ]
        : []),
    ],
  )}

${namedImport(["lstatSync", "readFileSync", "statSync", ...(pathScoped ? ["realpathSync"] : [])], "node:fs")}
${namedImport(["dirname", "join", ...(pathScoped ? ["basename", "isAbsolute", "relative", "resolve"] : [])], "node:path")}
import { fileURLToPath } from "node:url";

const POLICY_FILE = ${policyPathExpression(opts.policiesJsonPath)};
const POLICY_SCHEMA = ${json(AGENT_TOOL_POLICIES_SCHEMA)};
const MAX_POLICY_BYTES = ${MAX_POLICY_FILE_BYTES};
const GOVERNED_PREFIX = ${json(CONTENT_PREFIX)};
const BLOCKING = ${blocking};
const BLOCK_EXIT = ${BLOCKING_EXIT_CODE};
const MCP_PREFIX = ${json(MCP_TOOL_PREFIX)};${pathScoped ? `\n${pathScopedWriteHelpers()}` : ""}

/**
 * The policy document THIS run reads — fixed when this script was RENDERED.
 *
 * There is exactly ONE candidate, \`POLICY_FILE\`: the copy emitted beside this
 * script in a vendor plugin container, or the repository's own at the climb
 * above this script. Emission chose which, so run time chooses nothing. No
 * environment variable and no second path enter the resolution, which is what
 * stops an \`${AGENT_TOOL_POLICIES_FILE}\` that some workspace writer drops near
 * an installed guard from re-judging the next call from a policy set nobody
 * emitted.
 *
 * An ORDERED PAIR of candidates is what this replaced, and the order itself was
 * the defect. Inside a container the guard sits at \`<root>/hooks/<name>\` and the
 * repository climb resolved to the PARENT of the plugin root — a marketplace
 * clone, a client's plugin cache, a \`--plugin-dir\` project directory — so a file
 * in a user-writable directory outranked the container's own emitted copy. One
 * candidate per mode has no such rank to lose.
 *
 * The single path is probed with \`lstatSync\`, not \`existsSync\`: a SYMBOLIC LINK
 * named \`${AGENT_TOOL_POLICIES_FILE}\` is content that some other path owns, and
 * following it would let a link swap the governing document while the directory
 * entry a reviewer reads never moves. A linked document is REFUSED as
 * \`POLICY_INVALID\` in BOTH modes — the repository's own document is a ledgered
 * regular file, so a link standing where it should be is as much a swap as one
 * in a container — which is the posture \`src/hooks/userHooks.ts\` already takes
 * for a linked hook script. A real-file document that is missing, oversized or
 * unparseable is refused by the checks below for the same reason: answering a
 * call from a policy set nobody selected is the one outcome worse than a
 * refusal.
 *
 * NO environment variable enters this. Reading one
 * (\`CLAUDE_PLUGIN_ROOT\`/\`CURSOR_PLUGIN_ROOT\`/\`PLUGIN_ROOT\`) let a value
 * belonging to some unrelated tool redirect a repository-mode guard at a
 * document nobody in this repository wrote, and it contradicted the header
 * above: the output is a function of the payload and the emitted document, and
 * an ambient variable is neither. The runner takes the same posture — see
 * \`src/hooks/portableRunner.ts\`, where an unexpanded root variable resolves the
 * script to its own sibling.
 */
function policyDocumentPath() {
  let entry;
  try {
    entry = lstatSync(POLICY_FILE);
  } catch {
    // Absent is not decided here: the size probe below reports
    // POLICY_UNREADABLE and names the one path this script was rendered for.
    return { path: POLICY_FILE, linked: false };
  }
  return { path: POLICY_FILE, linked: entry.isSymbolicLink() };
}

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
  const { path: policyFile, linked: policyLinked } = policyDocumentPath();

  try {
    if (tool === "") {
      return {
        ...subject,
        reasonCode: "UNKNOWN_TOOL",
        message: "The payload named no tool, so the call cannot be authorized.",
      };
    }
    // A linked document is not the emitted one: refused before it is read, so
    // no link decides what this call may do.
    if (policyLinked) {
      return {
        ...subject,
        reasonCode: "POLICY_INVALID",
        message: \`Policy document \${policyFile} is a symbolic link, not the emitted file; nothing here authorizes this call.\`,
      };
    }

    let size = -1;
    try {
      const stats = statSync(policyFile);
      if (stats.isFile()) size = stats.size;
    } catch {
      size = -1;
    }
    if (size < 0) {
      return {
        ...subject,
        reasonCode: "POLICY_UNREADABLE",
        message: \`No readable policy document at \${policyFile}; nothing authorizes this call.\`,
      };
    }
    // Sized before it is read: an unbounded document is refused on its size
    // alone rather than parsed to discover it was unreasonable.
    if (size > MAX_POLICY_BYTES) {
      return {
        ...subject,
        reasonCode: "POLICY_TOO_LARGE",
        message: \`Policy document \${policyFile} is \${size} bytes, past the \${MAX_POLICY_BYTES} byte cap.\`,
      };
    }

    const document = JSON.parse(readFileSync(policyFile, "utf8"));
    if (
      document === null ||
      typeof document !== "object" ||
      document.schema !== POLICY_SCHEMA ||
      !Array.isArray(document.policies)
    ) {
      return {
        ...subject,
        reasonCode: "POLICY_INVALID",
        message: \`Policy document \${policyFile} does not declare schema "\${POLICY_SCHEMA}".\`,
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
${pathScoped ? PATH_SCOPED_WRITE_BRANCH + READ_ONLY_GIT_BRANCH : ""}    if (!Array.isArray(policy.allow) || !policy.allow.includes(category)) {
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
 *
 * `checkCall` is how the notice names the check verb — the planner hands it
 * {@link cliCallHint}'s sentence, so the reader gets the installed form and
 * the pinned `npx -y <package>@<version> check` fallback together, and never a
 * bare `stamity check` the documented `npx` setup cannot run. It is embedded as
 * a JSON string literal, so no character in it reaches the script as syntax.
 */
export function buildConfigTamperNoticeScript(opts: { checkCall: string }): string {
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

/** How the check verb is named: the installed form and the pinned fallback. */
const CHECK_CALL = ${JSON.stringify(opts.checkCall)};

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
        "stamity: agent configuration is generated and managed. To diff the on-disk files against the engine's own output, run " + CHECK_CALL + ".",
      ]
    : [
        "stamity: agent configuration changed — " + changed + ".",
        "That file is generated and managed. Before trusting the change, diff it against the engine's own output: run " + CHECK_CALL + ".",
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
  /**
   * Where this copy will sit ({@link HookScriptLayout}). Defaults to
   * `generated`; the wiring adapter passes `container` when it is placing the
   * gate inside a vendor plugin root, which is the one case where the script's
   * own location names no repository.
   */
  layout?: HookScriptLayout;
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
 *
 * A MISSING counter is not a fault to open on (REQ-FLOW-106), and neither is
 * one that is oversized, unreadable or unparseable: the counter is keyed by the
 * client's session, not by the run, a reclaimed cloud machine takes it along,
 * and deleting or corrupting it would otherwise reopen the gate. The run's
 * committed record survives: the newest in-progress record whose `Branch:`
 * names the branch `.git/HEAD` names (the card's shared reader, and the run
 * `gate preflight` counts; a linked or debug run folder is passed over) gives
 * the round count, its `usage: review r<N>` lines
 * ({@link USAGE_REVIEW_PATTERN}) up to the cap, with the last verdict
 * unrecorded. A completion then holds, below the cap and at it, and the next
 * reviewer's round is counted from it, replacing a counter it could not trust.
 * A file written from a rebuild that found rounds or faulted carries a
 * document-level `rebuilt: true`, kept by every later write (review/66): the
 * write held only the writer's session, so a session with no entry in a marked
 * file rebuilds as if the counter were missing, where an unmarked file's
 * missing entry still means no review loop to gate on.
 * With no such record or line the gate opens, naming the counter's state, and
 * a faulted file is left as it is, because a gate that cannot read its own
 * state must not wedge a run. A reviewer's stop whose rebuild faults with no
 * counter at all records round 1 and says the earlier count was lost, so a
 * lasting fault never stalls the loop. Records it cannot read (past
 * {@link GUARD_RUN_FOLDERS_MAX} folders, a matching record past
 * {@link REPORT_READ_MAX_BYTES}, a read fault) hold the completion under a
 * reason code naming the fault, as the guard refuses past the folder bound:
 * otherwise deleting the counter and then the records' readability reopens it.
 *
 * `failMode` decides only what a refusal DOES, exactly as in the sibling guard:
 * where a client honours a blocking status the completion stops, and where it
 * never blocks the refusal is reported and the completion proceeds.
 */
export function buildReviewGateScript(opts: ReviewGateScriptOptions): string {
  const segments = repoRelativeSegments(opts.statePath, "statePath");
  const maxRounds = bandedIterations(opts.maxIterations);
  const blocking = opts.failMode !== "fail-open";
  const layout = opts.layout ?? "generated";
  const extra = repoRootImports(layout);
  const regex = (pattern: RegExp): string => `new RegExp(${json(pattern.source)}, ${json(pattern.flags)})`;

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
      "A missing counter is rebuilt, not opened. It is keyed by the client's",
      "session, not by the run, and a reclaimed machine takes it along; the run's",
      "committed record stays. The newest in-progress record whose Branch: names",
      "the branch .git/HEAD names, the run gate preflight counts, gives the round",
      "count, its usage: review lines, with the last verdict unrecorded, so a",
      "completion holds, at the cap too, until a review records one. A counter",
      "that is oversized, unreadable or unparseable is read as lost the same way,",
      "and a review replaces it once the record gives its rounds back. A file",
      "written from a rebuild is marked: a session with no entry in it rebuilds",
      "too. With no such record or line the gate opens; run records it cannot",
      "read (past the folder or size bound, or a read fault) hold it.",
      "",
      "Fail-open: with no rounds in the record, a counter file it cannot trust",
      "opens the gate, says so on stderr and is not overwritten. A gate that cannot",
      "read its own state must not wedge a run. A run with no recorded round is not",
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
import { closeSync, constants as FS, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, unlinkSync, utimesSync, writeSync } from "node:fs";
${namedImport(["dirname", "isAbsolute", "join", "resolve", "sep", ...extra.path], "node:path")}
${extra.url}
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
const RUNS_SEGMENTS = ${json(RUNS_SEGMENTS)};
const RECORD_FILE = ${json(RECORD_FILE)};
const RUN_ID = ${regex(RUN_ID_PATTERN)};
const DEBUG_SEGMENT = ${json(DEBUG_RUN_SEGMENT)};
const STATUS = ${regex(RECORD_STATUS_PATTERN)};
const BRANCH = ${regex(RECORD_BRANCH_PATTERN)};
const IN_PROGRESS = ${regex(IN_PROGRESS_PATTERN)};
const USAGE_REVIEW = ${regex(USAGE_REVIEW_PATTERN)};
const HEAD_LINES = ${RECORD_HEAD_LINES};
const HEAD_READ_BYTES = ${RECORD_HEAD_READ_BYTES};
const RECORD_MAX_BYTES = ${REPORT_READ_MAX_BYTES};
const RUN_FOLDERS_MAX = ${GUARD_RUN_FOLDERS_MAX};
const KEYED = "The counter is keyed by the client's session, not by the run.";

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
 * 2026-09-01). What the number buys is ~860ms per critical section at thirty
 * writers instead of ~330ms.
 *
 * Read the margin as the ceiling PLUS the retry budgets, not as the ceiling.
 * The ceiling bounds the wait for the lock and nothing after it, and the
 * reviewer's path spends four more budgets inside one invocation: the ceiling
 * itself plus a final jittered pause (25,024 ms), the counter read under the
 * lock (a stat and a read, 300 ms each), the publish rename (win32 6,950 ms of
 * base delay at up to a quarter of jitter = 8,687.5 ms; 750 ms on POSIX) and
 * the unlock (300 ms). That totals ~34.6s on win32 and ~26.7s on POSIX against
 * the 600s the wired events allow — 5.8% of it, with no breach anywhere on the
 * shipped surface. What it does rule out is the earlier claim here that the
 * wait also fits the 30s the same client allows its tightest hook class:
 * re-wiring this gate onto that class now needs LOCK_CEILING_MS lowered first,
 * because the compound worst case has overtaken that budget even though the
 * ceiling alone still sits inside it.
 *
 * That same list is a constraint on the WAITERS and not only on the client's
 * budget, which is what it used to be read as. The four in-section budgets
 * (the stat, the read, the rename and the unlink) are wall clock a LIVE holder
 * spends without handing the lock to anybody, and the idle detector reads "no
 * hand-off" as "the holder died". So the invariant the two halves have to keep
 * is: the idle window is never shorter than the critical section these budgets
 * sanction. Held, it says nothing about a live holder and everything about a
 * dead one; broken, a holder inside its own retry budget is read as dead by
 * every waiter queued behind it and each of them drops its round on a path
 * that exits 0 — 1 stored round of 30, measured both with a holder five
 * attempts into the win32 rename schedule and with a holder whose counter read
 * was merely 1.3s slow. LOCK_IDLE_MS is therefore derived from those budgets
 * below rather than set here, and the heartbeat in beat() carries the part of
 * the section a sum of pauses cannot see.
 *
 * Raising the ceiling costs nothing on the failure it does not govern. A
 * holder that DIED holding the lock produces no hand-off and no heartbeat, so
 * the idle detector returns after its own window — LOCK_IDLE_MS, not the
 * ceiling — and the ceiling is never consulted; the ceiling only ever fires
 * while the lock is genuinely changing hands, and waiting longer for a queue
 * that is visibly draining is the whole point of watching for progress. The
 * fail-open drop is unchanged either way: a wait that does expire still
 * reports STATE_LOCKED and exits 0, because a counter is not worth wedging a
 * run over.
 */
const LOCK_IDLE_POLLS = 24;
const LOCK_CEILING_MS = 25_000;
const LOCK_WAIT_MIN_MS = 4;
const LOCK_WAIT_MAX_MS = 24;
const LOCK_STALE_MS = 30_000;

/*
 * Errnos this script waits out rather than reads as an answer.
 *
 * Every one of them means the same thing on Windows: somebody else is holding
 * the name for a moment. ERROR_ACCESS_DENIED and ERROR_SHARING_VIOLATION reach
 * node as EPERM and EBUSY, EACCES is the third code that family of access
 * refusals arrives under, and a name being unlinked stays delete-pending until
 * the last handle on it closes. An on-access scanner opens every freshly
 * written file on a CI runner without FILE_SHARE_DELETE, and this script
 * creates, reads, renames and unlinks three names in the same directory.
 *
 * None of the three is an answer about whether the lock is free or whether the
 * counter is readable, and every site that read one as an answer dropped a
 * round while exiting 0. On POSIX none of them can come from contention at all:
 * open(O_CREAT|O_EXCL) answers EEXIST, rename(2) is defined on the inode and
 * never loses to a reader, and unlink is atomic. So the same set applies on
 * both platforms, and what it costs on POSIX is the wait budget on a durable
 * fault the gate already fails open on.
 */
const SHARING_FAULTS = ["EACCES", "EBUSY", "EPERM"];
const IS_WINDOWS = process.platform === "win32";

/*
 * Rename retries for a destination held across the publish, carried from the
 * engine's own writer rather than re-derived: see RENAME_RETRY_DELAYS_MS in
 * src/merge/atomicWrite.ts, where the concurrent-reader case took ~790 ms on
 * the runs it passed and spent the whole 750 ms four-retry budget on the runs
 * it failed. This script shipped that pre-fix budget; it now carries the same
 * schedule the engine settled on — 6950 ms of base delay on win32, flattened at
 * 800 ms so a quarter of jitter keeps the ceiling near 8.7 s, and the original
 * 750 ms on POSIX where a longer budget buys a slower failure rather than a
 * landed write. Unretried, a held destination lands as STATE_UNWRITABLE: the
 * round is reported but never stored, which is the same lost round the lock
 * exists to prevent, reached by the other door.
 *
 * 2026-09-15: the four extra 800 ms steps arrived with the engine's, for the
 * same evidence — CI run 34771471163 spent the 4,687 ms ceiling in full and
 * still lost the rename. Carried rather than re-decided: the schedule is one
 * decision with two sites, and test/hooks/scripts.test.ts pins this branch's
 * length against the engine's own compiled RENAME_RETRY_COUNT so the pair
 * cannot drift.
 */
const RENAME_WAITS_MS = IS_WINDOWS ? [50, 100, 200, 400, 600, 800, 800, 800, 800, 800, 800, 800] : [50, 100, 200, 400];
const RENAME_JITTER = IS_WINDOWS ? 0.25 : 0;

/* Retries for a read or an unlink that lost to the same family of holds. Both
 * are short operations on a name this process is racing its own peers for, so
 * the budget is 20+40+80+160 = 300 ms rather than the rename's: past that the
 * hold is not the millisecond-scale one this waits out. */
const RETRY_ATTEMPTS = 4;
const RETRY_BACKOFF_MS = 20;

/*
 * The idle window, derived from the budgets above rather than chosen beside
 * them. It is the wall clock a waiter watches an unchanging lock for before it
 * reads the holder as dead, and the invariant it has to keep is the one the
 * ceiling comment states: never shorter than the critical section these
 * budgets sanction.
 *
 * The section is four budgets long — the counter's stat and its read
 * (RETRY_BUDGET_MS each), the publish rename (RENAME_WAITS_MS with its jitter)
 * and the unlink that releases (RETRY_BUDGET_MS again) — which is 1,650 ms on
 * POSIX and 9,588 ms on win32 as these constants stand. Derived, so widening a
 * retry schedule cannot leave the window behind it the way a typed 1,000 did:
 * that constant was correct against a 750 ms rename budget and wrong the
 * moment the win32 schedule reached 4,687 ms, and nothing in the tree went red
 * to say so. The 2026-09-15 widening to 8,687.5 ms moved this window with it
 * for free, which is the property that paragraph was bought for.
 *
 * The sum is of PAUSES, and a holder spends syscall time on top of them, so on
 * its own this would be a lower bound wearing a ceiling's clothes. beat() is
 * what closes that gap: it re-stamps the lock before every one of these pauses,
 * so a holder actually spending its retries re-arms each waiter's window
 * instead of consuming it, and the derived number only has to cover a holder
 * that is slow inside a single call — the case with no errno and no retry,
 * where no heartbeat can fire.
 *
 * What it costs is the dead-holder verdict: a lock whose holder died is now
 * given up on after this window rather than after a flat second. The round is
 * dropped fail-open either way, and LOCK_STALE_MS is still the only path that
 * CLEARS a lock, so nothing here forces one.
 */
const RETRY_BUDGET_MS = RETRY_BACKOFF_MS * (2 ** RETRY_ATTEMPTS - 1);
const RENAME_BUDGET_MS =
  RENAME_WAITS_MS.reduce((total, wait) => total + wait, 0) * (1 + RENAME_JITTER);
const LOCK_IDLE_MS = Math.ceil(3 * RETRY_BUDGET_MS + RENAME_BUDGET_MS);

/** Whether an errno is one of the momentary holds above, rather than an answer. */
function sharing(error) {
  return error !== null && error !== undefined && SHARING_FAULTS.includes(error.code);
}

const NOW = Date.now();

${resolveRepoRoot(layout)}

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
  // Absence and a fault are different answers, and the stat is where they used
  // to be collapsed: every errno mapped to "no file", which the caller reads as
  // "no runs yet". Under the lock that publishes a one-round document over every
  // round counted so far — the silent reset the fault guard below exists to
  // prevent, reached through the one door it did not cover. So only ENOENT, and
  // a name that is not a regular file, is absence; a momentary hold is waited
  // out on the same 20/40/80/160 ms schedule the read uses, and any other errno
  // is STATE_UNREADABLE, which drops the round rather than resetting it.
  let size = -1;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const stats = statSync(STATE_FILE);
      size = stats.isFile() ? stats.size : 0;
      break;
    } catch (error) {
      if (error !== null && error !== undefined && error.code === "ENOENT") break;
      if (!sharing(error) || attempt >= RETRY_ATTEMPTS) return { fault: "STATE_UNREADABLE", runs: null };
      beat();
      pause(RETRY_BACKOFF_MS * 2 ** attempt);
    }
  }
  if (size <= 0) return { fault: "STATE_ABSENT", runs: null };
  if (size > MAX_STATE_BYTES) return { fault: "STATE_TOO_LARGE", runs: null };

  // Retried on a momentary hold and on nothing else. The publish is
  // temp+rename, so a reader is never handed partial bytes: a parse that fails
  // or a size past the cap is what the file SAYS, and waiting cannot change it.
  // A read that loses to a hold has been told nothing yet, and reading that as
  // STATE_UNREADABLE drops the round this invocation came to count.
  let raw = "";
  for (let attempt = 0; ; attempt += 1) {
    try {
      raw = readFileSync(STATE_FILE, "utf8");
      break;
    } catch (error) {
      if (!sharing(error) || attempt >= RETRY_ATTEMPTS) return { fault: "STATE_UNREADABLE", runs: null };
      beat();
      pause(RETRY_BACKOFF_MS * 2 ** attempt);
    }
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
  return { fault: "", runs: document.runs, rebuilt: document.rebuilt === true };
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

${buildCardBranchSource()}

/** A record's first \`bytes\` as lines, with its size; null when absent or not a regular file. */
function recordText(path, bytes) {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return null;
    throw error;
  }
  if (!stats.isFile()) return null;
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(Math.min(bytes, stats.size));
    const text = buffer.toString("utf8", 0, readSync(fd, buffer, 0, buffer.length, 0));
    return { size: stats.size, lines: text.replace(/^\\uFEFF/, "").split(/\\r?\\n/) };
  } finally {
    closeSync(fd);
  }
}

/**
 * The rounds a lost counter held, rebuilt from the run's committed record: the
 * newest in-progress record whose Branch: names this branch, the run gate
 * preflight counts, and its usage: review lines, never past the cap. A linked
 * run folder and a debug round's are passed over, as the card's pick passes them.
 * Null when there is none; throws on a read failing past absence, naming the
 * repo-relative path it was reading.
 */
function rebuilt(root) {
  let where = ".git/HEAD";
  try {
    const branch = cardCurrentBranch(root);
    if (branch === null) return null;
    where = RUNS_SEGMENTS.join("/");
    const runsDir = join(root, ...RUNS_SEGMENTS);
    let names = [];
    try {
      if (lstatSync(runsDir).isDirectory()) {
        names = readdirSync(runsDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && RUN_ID.test(entry.name) && !entry.name.includes(DEBUG_SEGMENT))
          .map((entry) => entry.name);
      }
    } catch (error) {
      if (!error || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) throw error;
    }
    if (names.length > RUN_FOLDERS_MAX) throw Object.assign(new Error("run folders"), { code: "RUN_FOLDERS_OVER_" + RUN_FOLDERS_MAX });
    // Newest first by code-unit order, and the first match is the run: an older record is never read.
    for (const name of names.sort().reverse()) {
      // Under the lock this walk is part of the critical section, so each record re-arms the waiters' idle window.
      beat();
      where = [...RUNS_SEGMENTS, name, RECORD_FILE].join("/");
      const path = join(runsDir, name, RECORD_FILE);
      const head = recordText(path, HEAD_READ_BYTES);
      if (head === null) continue;
      let status = null;
      let named = null;
      for (const line of head.lines.slice(0, HEAD_LINES)) {
        status ??= STATUS.exec(line)?.[1] ?? null;
        named ??= BRANCH.exec(line)?.[1] ?? null;
      }
      if (status === null || !IN_PROGRESS.test(status) || named !== branch) continue;
      if (head.size > RECORD_MAX_BYTES) throw Object.assign(new Error("record"), { code: "RECORD_TOO_LARGE" });
      const whole = head.size <= HEAD_READ_BYTES ? head : recordText(path, RECORD_MAX_BYTES);
      const rounds = whole === null ? 0 : whole.lines.filter((line) => USAGE_REVIEW.test(line)).length;
      return rounds === 0 ? null : { rounds: Math.min(rounds, MAX_ROUNDS), verdict: "", confidence: "", record: where };
    }
    return null;
  } catch (error) {
    throw Object.assign(new Error("run records"), { code: String((error && error.code) || "a fault"), where });
  }
}

/**
 * The entry a lost counter is rebuilt to; or null with the reason the gate
 * opens; or, when the records cannot be read, the fault that holds it: deleting
 * the counter and then making the records unreadable must not reopen the gate.
 */
function rebuild() {
  try {
    const entry = rebuilt(repoRoot());
    return { entry, fault: "", why: entry === null ? "no in-progress run record on this branch has a usage: review line" : "" };
  } catch (error) {
    const code = error.code;
    const fault = code === "RECORD_TOO_LARGE" || code.startsWith("RUN_FOLDERS_OVER_") ? code : "RECORDS_UNREADABLE";
    return { entry: null, fault, why: "the run records could not be read (" + code + " at " + error.where + ")" };
  }
}

/**
 * Synchronous wait. A hook is a short-lived process with nothing else to do,
 * and there is no event loop here to yield to.
 */
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/*
 * Whether THIS process is inside the critical section. The heartbeat below
 * must never re-stamp a lock another process holds: an unlocked reader waiting
 * out its own hold would otherwise vouch for a holder that has already died.
 */
let holding = false;

/**
 * Say the holder is still alive, on the one channel the waiters read.
 *
 * A waiter's progress signal is the lock file's (mtime, ino) pair, and nothing
 * a holder does to the COUNTER moves it — so a holder waiting out a held name
 * was indistinguishable from a holder that died, and the waiters queued behind
 * it dropped their rounds while it was still working. Touching the lock before
 * each retry pause moves the pair, so a holder spending its retry budget
 * re-arms every waiter's idle window instead of consuming it.
 *
 * Best-effort in both directions, and silent when it fails: a filesystem that
 * stamps in whole seconds (exFAT, the same one the file index covers for) may
 * not move the pair at all, and the touch can lose to the same family of holds
 * it is reporting through. Either way the wait falls back to the derived
 * LOCK_IDLE_MS, which is the whole critical section — never below it.
 */
function beat() {
  if (!holding) return;
  try {
    const stamp = new Date();
    utimesSync(LOCK_FILE, stamp, stamp);
  } catch {
    // The lock is gone, or the touch lost to a hold. The derived window still
    // bounds the wait, so there is nothing to report and nothing to retry.
  }
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
      holding = true;
      return true;
    } catch (error) {
      // EEXIST is the answer "somebody holds it", and a sharing fault is no
      // answer at all — the name was momentarily unopenable, most often because
      // the previous holder's unlink left it delete-pending. Both go round the
      // loop; every other errno is this filesystem's own refusal and gives up.
      //
      // Windows-only here, unlike the counter's own sites. This is the one
      // place the whole idle window sits behind the tolerance, and the set
      // above says why POSIX cannot need it: open(O_CREAT|O_EXCL) answers
      // EEXIST for contention there, so EACCES/EBUSY/EPERM on this call is a
      // durable refusal — an unwritable state directory — and polling it out
      // cost 1.05s per hook event on darwin against 60ms for an answer that
      // never changes. The counter's sites keep the cross-platform set: their
      // POSIX cost is 300ms, and it is spent only on the same durable fault.
      const momentary = IS_WINDOWS && sharing(error);
      if (!error || (error.code !== "EEXIST" && !momentary)) return false;
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

/**
 * Release the lock, retrying the holds that are not a refusal.
 *
 * A swallowed unlink is not one round: it strands the name for the stale window
 * (LOCK_STALE_MS), and no waiter already in the herd can clear it, because
 * LOCK_STALE_MS is longer than LOCK_CEILING_MS and every waiter's ceiling is
 * armed from its own start. So the sweep only ever rescues a LATER invocation,
 * and one dropped unlink costs every remaining round in this run rather than
 * this one. Anything else — the file already gone to a stale sweep in another
 * process — is the same outcome as a release and returns.
 */
function unlock() {
  for (let attempt = 0; ; attempt += 1) {
    try {
      unlinkSync(LOCK_FILE);
      break;
    } catch (error) {
      if (!sharing(error) || attempt >= RETRY_ATTEMPTS) break;
      beat();
      pause(RETRY_BACKOFF_MS * 2 ** attempt);
    }
  }
  // Released, or given up on: either way this process is no longer the holder
  // and must stop vouching for whoever takes the name next.
  holding = false;
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
function save(runs, rebuilt) {
  const kept = Object.entries(runs)
    .filter((pair) => pair[1] !== null && typeof pair[1] === "object" && NOW - pair[1].updated < MAX_RUN_AGE_MS)
    .sort((a, b) => b[1].updated - a[1].updated || (a[0] < b[0] ? -1 : 1))
    .slice(0, MAX_RUNS);
  const temp = STATE_FILE + ".tmp-" + randomBytes(8).toString("hex");
  let handle = -1;
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    handle = openSync(temp, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600);
    writeSync(handle, JSON.stringify({ schema: SCHEMA, rebuilt: rebuilt || undefined, runs: Object.fromEntries(kept) }));
    closeSync(handle);
    handle = -1;
    // The rename is retried on the errnos Windows raises when something else
    // holds a handle to the destination for a moment — a concurrent reader, or
    // an on-access scanner that opened it without FILE_SHARE_DELETE. The
    // schedule runs out when RENAME_WAITS_MS does, so the budget is the array
    // and there is no second count to drift from it. Every other failure is
    // raised on the first try and reported by the catch below, because a write
    // that cannot land is not worth holding a run for.
    for (let attempt = 0; ; attempt += 1) {
      try {
        renameSync(temp, STATE_FILE);
        break;
      } catch (error) {
        const wait = RENAME_WAITS_MS[attempt];
        if (!sharing(error) || wait === undefined) throw error;
        beat();
        pause(wait + Math.floor(Math.random() * wait * RENAME_JITTER));
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
  let previous = null;
  let note = "";
  try {
    const current = load();
    const untrusted = current.fault !== "" && current.fault !== "STATE_ABSENT";
    const own = current.fault === "" ? entryOf(current.runs, runId) : null;
    // A missing or untrusted counter, or no entry in one marked rebuilt, seeds this round from the run's record.
    const found = current.fault === "" && (own !== null || !current.rebuilt) ? null : rebuild();
    // A fault under the lock is not "no runs". Treating it as one makes
    // \`rounds\` 1 and publishes a one-round document over a file this script was
    // told not to repair — every round counted so far, gone, on a path that
    // exits 0. So unless the record gave the rounds back, the round is dropped
    // and the fault is named. The return sits inside the try, so the finally
    // below still releases the lock.
    //
    // The wording is the unlocked path's, deliberately: this branch is the only
    // report a reviewer ever sees, since the round is counted before the
    // unlocked read that used to carry it. "Cannot be trusted" rather than
    // "could not be read" because STATE_INVALID parsed a file it did read, and
    // the delete sentence is what the operator needs — one remedy for one
    // fault, whichever path names it.
    if (untrusted && found.entry === null) {
      return {
        blocked: false,
        runId,
        maxRounds: MAX_ROUNDS,
        reasonCode: current.fault,
        message:
          "The review-gate counter at " + STATE_FILE + " cannot be trusted" +
          (found.fault === ""
            ? ", so this round was not counted and the gate is open. Deleting the file restarts the counter; it is not overwritten from here."
            : " and " + found.why + ", so this round was not counted and completion stays held. " +
              "Make the records readable, or delete the file, which the next review round then writes anew."),
      };
    }
    // Null prototype for the same reason the completion path uses one: a run id
    // of "__proto__" would otherwise reach the inherited setter and vanish.
    const runs = Object.assign(Object.create(null), current.runs === null ? {} : current.runs);
    previous = found === null ? own : found.entry;
    // A rebuilt count at the cap lost the last round's verdict, not a round: this review re-records it.
    const again = previous !== null && previous.record !== undefined && previous.rounds >= MAX_ROUNDS;
    rounds = previous === null ? 1 : again ? previous.rounds : previous.rounds + 1;
    runs[runId] = { rounds, verdict, confidence, updated: NOW };
    // Written from a rebuild that found rounds or faulted, the file lacks its peers' entries: marked, for good.
    stored = save(runs, current.rebuilt || (found !== null && (found.entry !== null || found.fault !== "")));
    if (previous !== null && previous.record !== undefined) note = " Earlier rounds were rebuilt from " + previous.record + ".";
    if (untrusted) note += " The counter it could not trust (" + current.fault + ") was replaced.";
    // A lasting read fault must not stop the loop: round 1 is counted, and the loss is said rather than hidden.
    if (found !== null && found.fault !== "") {
      note = " " + (current.fault === "" ? "This session had no entry in a marked counter" : "No counter was found") +
        " and " + found.why + ", so the rounds counted before the counter was lost are not in this count, which restarts at round 1.";
    }
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
      ? standing(rounds, verdict) + " recorded for this run." + note
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

  // A finishing reviewer IS a review round: count it, record what it returned,
  // and let it go — the round has already happened. Answered BEFORE the read
  // below, because \`record()\` re-reads the counter under the lock and never
  // looks at this one: on the reviewer's path the unlocked read decided
  // nothing and could only lose the round, since a read that momentarily lost
  // to another writer's publish returned here instead of reaching the lock.
  // The fault it used to shield \`record()\` from is handled under the lock now.
  if (agentId === REVIEWER_AGENT) return record();

  const state = load();
  if (!isCompletion()) return null;

  // Copied onto a null prototype before anything is read out of it: run ids come
  // from a payload, and a run named after a prototype member would otherwise
  // resolve to an inherited value instead of this run's record.
  const runs = Object.assign(Object.create(null), state.runs === null ? {} : state.runs);
  const own = entryOf(runs, runId);
  // A missing or untrusted counter, or no entry in one a peer wrote from a rebuild (marked), is rebuilt from this
  // branch's run record rather than opened: deleting, corrupting or losing the file must not release the run.
  const stray = state.fault === "" && own === null && state.rebuilt;
  const absent = state.fault === "STATE_ABSENT";
  const lost = absent
    ? "No review-gate counter at " + STATE_FILE
    : "The review-gate counter at " + STATE_FILE +
      (stray ? " is marked rebuilt and has no entry for this session" : " cannot be trusted (" + state.fault + ")");
  const found = state.fault === "" && !stray ? null : rebuild();
  if (found !== null && found.fault !== "") {
    return {
      blocked: BLOCKING,
      runId,
      maxRounds: MAX_ROUNDS,
      reasonCode: found.fault,
      message:
        lost + " and " + found.why + ", so the rounds cannot be rebuilt and completion is held. " + KEYED +
        (absent || stray
          ? " Make the records readable, or record a review round, which writes the counter."
          : " Make the records readable, or delete the file, which the next review round then writes anew."),
    };
  }
  if (found !== null && found.entry === null) {
    if (stray) return null; // No entry, no rounds: nothing to gate, as unmarked.
    return {
      blocked: false,
      runId,
      reasonCode: state.fault,
      message:
        lost + " and " + found.why + ", so the gate is open. " + KEYED +
        (absent
          ? " The file is created when this session records its first review round."
          : " Deleting the file restarts the counter; it is not overwritten from here."),
    };
  }

  const entry = found !== null ? found.entry : own;
  // Work-scoped: a run with no recorded round has no review loop to gate on.
  if (entry === null) return null;
  if (entry.record !== undefined) {
    // The last verdict went with the counter, so the round is open even at the cap:
    // the cap's end-of-run text would end a run whose last review may have approved.
    const atCap = entry.rounds >= MAX_ROUNDS;
    return {
      blocked: BLOCKING,
      runId,
      round: entry.rounds,
      maxRounds: MAX_ROUNDS,
      verdict: "",
      reasonCode: atCap ? "ROUNDS_REBUILT_AT_CAP" : "REVIEW_ROUND_OPEN",
      message:
        lost + ", so " + standing(entry.rounds, "") + " was rebuilt from " +
        entry.record + ". " + KEYED + " The last verdict went with the counter, so completion is held: " +
        (atCap
          ? "one fresh review re-records it, and that verdict decides."
          : "the next review is round " + (entry.rounds + 1) + ", and completion opens on an approval or at round " + MAX_ROUNDS + "."),
    };
  }
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

// ── 4b. Cloud readiness (non-core, Claude Code only) ─────────────

/**
 * The readiness entry's own budget (REQ-CTX-016), apart from the 30 s
 * `HOOK_SESSION_START_TIMEOUT_MS` the session-start rows keep: an `npm ci` on a
 * fresh cloud machine takes minutes, and a 30 s budget would end most of them
 * half done. Under Claude Code's 600 s default, so a hung registry still holds a
 * session's start for a bounded wait; the client fails open on it, and the
 * hook's first act, the variable, is already written by then.
 */
export const CLOUD_READINESS_TIMEOUT_MS = 300_000;

/** The hook's own limit on `npm ci`, inside {@link CLOUD_READINESS_TIMEOUT_MS}, so the hook says how it ended. */
const CLOUD_READINESS_INSTALL_MS = 240_000;

/** The hook's own limit on resolving the pinned CLI, inside {@link CLOUD_READINESS_TIMEOUT_MS} beside the install. */
const CLOUD_READINESS_CLI_MS = 45_000;

/** Options for {@link buildCloudReadinessScript}. */
export interface CloudReadinessScriptOptions {
  /** The pinned CLI the hook resolves once: the emission context's package, version, channel and scope registry. */
  cli: { packageName: string; version: string; npmChannel?: boolean; registry?: string };
  /** Where this copy will sit ({@link HookScriptLayout}); defaults to `generated`. */
  layout?: HookScriptLayout;
  /** The hook's limit on `npm ci`, in milliseconds; the default fits the entry's budget. */
  installTimeoutMs?: number;
  /** The hook's limit on resolving the pinned CLI, in milliseconds; the default fits the entry's budget. */
  cliTimeoutMs?: number;
}

function stepLimit(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new EngineError(`${field} must be a positive whole number of milliseconds (got ${JSON.stringify(value)}).`, {
      code: "VALIDATION_ERROR",
    });
  }
  return value;
}

/**
 * Claude Code's cloud readiness hook (REQ-FLOW-110, REQ-FLOW-112): makes a cloud
 * machine ready for a run at the session's start, and tells the pre-flight the
 * repository's hooks loaded.
 *
 * Like {@link buildUnattendedAskGate} it is NOT core: the Claude adapter places
 * it and wires it on `SessionStart` with the matcher `startup|resume`, under its
 * own {@link CLOUD_READINESS_TIMEOUT_MS}. It does nothing at all unless
 * `CLAUDE_CODE_REMOTE` is exactly `true`, the marker Claude Code's cloud machine
 * sets and a local session never does, so a local start reads and writes nothing.
 *
 * In the cloud, in this order, each step on its own so a fault in one leaves the
 * rest: it appends `export STAMITY_HOOKS_ACTIVE=1` to `$CLAUDE_ENV_FILE`, which
 * the client sources before each shell command of the session — first, so the
 * hooks count as loaded whatever the install does next, and once across a
 * startup and a resume; it checks `node` against `package.json`'s `engines.node`
 * (the common range shapes; another is named as unread, never guessed); it runs
 * `npm ci` when `node_modules` is missing and a `package-lock.json` or
 * `npm-shrinkwrap.json` is there, under {@link CLOUD_READINESS_INSTALL_MS}; and it
 * resolves the pinned CLI once through its `help` verb, under
 * {@link CLOUD_READINESS_CLI_MS}. With no `package.json` it installs nothing and
 * says so. One line per step goes to stdout, which the client adds to the
 * session's context: fixed text, versions and exit codes only, never the
 * output of `npm` or a value read from the repository. It always exits 0.
 *
 * `npm ci` runs the lockfile's install scripts, in the cloud machine only: a
 * named residual (`SECURITY.md`).
 */
export function buildCloudReadinessScript(opts: CloudReadinessScriptOptions): string {
  const layout = opts.layout ?? "generated";
  const extra = repoRootImports(layout);
  const install = stepLimit(opts.installTimeoutMs ?? CLOUD_READINESS_INSTALL_MS, "installTimeoutMs");
  const cli = stepLimit(opts.cliTimeoutMs ?? CLOUD_READINESS_CLI_MS, "cliTimeoutMs");
  const call = pinnedCliCall(opts.cli.packageName, opts.cli.version, "help", opts.cli).split(" ");
  // Its own banner, not `header()`: that one's posture line says "no network reach", which this script breaks.
  const banner = [
    "#!/usr/bin/env node",
    GENERATED_SCRIPT_LINT_DIRECTIVE,
    "// stamity — cloud readiness (Claude Code).",
    "//",
    "// Does nothing unless CLAUDE_CODE_REMOTE is exactly true. In Claude Code's",
    "// cloud machine it appends STAMITY_HOOKS_ACTIVE=1 to $CLAUDE_ENV_FILE first,",
    "// so the unattended pre-flight reads the hooks as loaded, then checks node",
    "// against package.json's engines.node, runs npm ci where node_modules is",
    "// missing and a lockfile is there, and resolves the pinned CLI once. One line",
    "// per step goes to stdout; it always exits 0.",
    "//",
    "// Generated file — regenerate it rather than editing; local edits are overwritten.",
    "// Trust posture: exec form, repo-committed, no dynamic evaluation, nothing run through a shell.",
    "// Network: in Claude Code's cloud alone it starts npm ci, which runs the lockfile's install scripts,",
    "// and npx; both reach the npm registry.",
    "// Reads outside repo state: CLAUDE_CODE_REMOTE, CLAUDE_ENV_FILE, STAMITY_REPO_ROOT and node's version.",
    "// Writes the environment file and, through npm ci, node_modules.",
  ].join("\n");

  return `${banner}

import { spawnSync } from "node:child_process";
${namedImport(["appendFileSync", "existsSync", "readFileSync", "statSync"], "node:fs")}
${namedImport(["join", "resolve", "sep", ...extra.path], "node:path")}
${extra.url}
const STATE_SEGMENTS = ${json([RUNS_SEGMENTS[0]])};
const MARKER = ${json(`export ${HOOKS_ACTIVE_ENV}=1`)};
const LOCKFILES = ["npm-shrinkwrap.json", "package-lock.json"];
const MAX_FILE_BYTES = 1048576;
const INSTALL_TIMEOUT_MS = ${install};
const CLI_TIMEOUT_MS = ${cli};
const CLI_CALL = ${json(call)};
const PREFIX = "stamity cloud readiness: ";

${resolveRepoRoot(layout)}
${String.raw`
const lines = [];

/** One line for the session's context; control characters cannot reach it. */
function say(text) {
  lines.push(PREFIX + text.replace(/[\u0000-\u001f\u007f]/g, "?"));
}

/** An error's code, or its name: never its message, which can carry a path or a value. */
function cause(error) {
  const named = error && typeof error.code === "string" ? error.code : (error && error.name) || "a fault";
  return /^[A-Za-z0-9_]{1,40}$/.test(named) ? named : "a fault";
}

/** First: the variable the pre-flight reads, written once, so the hooks count as loaded whatever comes next. */
function markHooksActive() {
  const file = process.env.CLAUDE_ENV_FILE;
  if (typeof file !== "string" || file === "") {
    say("CLAUDE_ENV_FILE is not set, so STAMITY_HOOKS_ACTIVE was not written and an unattended pre-flight refuses here.");
    return;
  }
  let lead = "";
  try {
    const stats = statSync(file);
    if (stats.isFile() && stats.size > 0 && stats.size <= MAX_FILE_BYTES) {
      const text = readFileSync(file, "utf8");
      if (text.split(/\r?\n/).includes(MARKER)) {
        say("STAMITY_HOOKS_ACTIVE=1 is already in the environment file.");
        return;
      }
      lead = text.endsWith("\n") ? "" : "\n";
    } else if (stats.size > 0) {
      lead = "\n";
    }
  } catch {
    // A file not there yet is created below; a read fault is met again by the write, which names it.
  }
  try {
    appendFileSync(file, lead + MARKER + "\n");
  } catch (error) {
    say("the environment file could not be written (" + cause(error) + "), so an unattended pre-flight refuses here.");
    return;
  }
  say("wrote STAMITY_HOOKS_ACTIVE=1 to the environment file, for this session's shell commands.");
}

/** package.json's object, or null when there is none; a file it cannot read, or that holds no object, throws. */
function readManifest(root) {
  const path = join(root, "package.json");
  let stats;
  try {
    stats = statSync(path);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
  if (!stats.isFile() || stats.size > MAX_FILE_BYTES) throw Object.assign(new Error("package.json"), { code: "NOT_A_SMALL_FILE" });
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw Object.assign(new Error("package.json"), { code: "NOT_AN_OBJECT" });
  return parsed;
}

/** A version's three numbers, or null. */
function triple(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(text);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compare(a, b) {
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  return 0;
}

/** One comparator as the bounds it allows (a null bound is open), or null for a shape this hook does not read. */
function bounds(word) {
  const match = /^(>=|<=|>|<|=|\^|~)?v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?$/.exec(word);
  if (match === null) return null;
  const op = match[1] ?? "";
  const parts = [match[2], match[3], match[4]];
  let given = 0;
  while (given < 3 && parts[given] !== undefined && /^\d+$/.test(parts[given])) given += 1;
  if (parts.slice(given).some((part) => part !== undefined && /^\d+$/.test(part))) return null;
  const n = parts.map((part, index) => (index < given ? Number(part) : 0));
  const bump = (at) => n.map((value, index) => (index < at ? value : index === at ? value + 1 : 0));
  if (given === 0) return op === "<" || op === ">" ? null : { low: null, high: null };
  if (op === "" || op === "=") return given === 3 ? { low: n, lowIn: true, high: n, highIn: true } : { low: n, lowIn: true, high: bump(given - 1) };
  if (op === ">=") return { low: n, lowIn: true, high: null };
  if (op === ">") return given === 3 ? { low: n, lowIn: false, high: null } : { low: bump(given - 1), lowIn: true, high: null };
  if (op === "<") return { low: null, high: n };
  if (op === "<=") return given === 3 ? { low: null, high: n, highIn: true } : { low: null, high: bump(given - 1) };
  if (op === "~") return { low: n, lowIn: true, high: bump(given >= 2 ? 1 : 0) };
  // A caret holds the left-most number given that is not 0.
  const held = n.findIndex((value, index) => index < given && value !== 0);
  return { low: n, lowIn: true, high: bump(held === -1 ? given - 1 : held) };
}

/** Whether a version meets an npm range of the common shapes; null when any part is not one of them. */
function meets(version, range) {
  const have = triple(version);
  if (have === null) return null;
  let met = false;
  for (const set of range.split("||")) {
    const words = set.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, "$1").split(/\s+/).filter((word) => word !== "");
    let all = true;
    for (const word of words) {
      const allowed = bounds(word);
      if (allowed === null) return null;
      if (allowed.low !== null && compare(have, allowed.low) < (allowed.lowIn ? 0 : 1)) all = false;
      if (allowed.high !== null && compare(have, allowed.high) > (allowed.highIn ? 0 : -1)) all = false;
    }
    if (all) met = true;
  }
  return met;
}

function checkNode(manifest) {
  const node = process.versions.node;
  const range = manifest.engines && typeof manifest.engines === "object" ? manifest.engines.node : undefined;
  if (typeof range !== "string" || range.trim() === "") {
    say("package.json declares no engines.node, so node " + node + " is not checked.");
    return;
  }
  const met = meets(node, range);
  if (met === null) say("engines.node is not a range this hook reads, so node " + node + " is not checked.");
  else if (met) say("node " + node + " meets engines.node.");
  else say("node " + node + " is outside engines.node; the run needs a node it names.");
}

/** How a child ended, in fixed words and its code. */
function ended(result) {
  if (result.error && result.error.code === "ETIMEDOUT") return "timeout";
  if (result.error) return "could not start (" + cause(result.error) + ")";
  if (result.status === 0) return "ok";
  return result.status === null ? "signal " + cause({ code: result.signal }) : "exit " + result.status;
}

function installDependencies(root) {
  if (existsSync(join(root, "node_modules"))) {
    say("node_modules is there, so npm ci does not run.");
    return;
  }
  const lock = LOCKFILES.find((name) => existsSync(join(root, name)));
  if (lock === undefined) {
    say("node_modules is missing and no package-lock.json or npm-shrinkwrap.json is there, so npm ci does not run.");
    return;
  }
  // No shell, and no output kept: npm's text never reaches the session.
  const how = ended(spawnSync("npm", ["ci"], { cwd: root, stdio: "ignore", timeout: INSTALL_TIMEOUT_MS, windowsHide: true }));
  if (how === "ok") say("npm ci finished from " + lock + ".");
  else if (how === "timeout") say("npm ci stopped at its limit of " + INSTALL_TIMEOUT_MS / 1000 + " s; node_modules may be partial, so run npm ci again.");
  else say("npm ci failed (" + how + "); it needs the npm registry, so run npm ci again once it is reachable.");
}

function resolveCli(root) {
  const how = ended(spawnSync(CLI_CALL[0], CLI_CALL.slice(1), { cwd: root, stdio: "ignore", timeout: CLI_TIMEOUT_MS, windowsHide: true }));
  const named = CLI_CALL.slice(0, -1).join(" ");
  if (how === "ok") say("the pinned CLI resolved (" + named + ").");
  else say("the pinned CLI did not resolve (" + (how === "timeout" ? "past " + CLI_TIMEOUT_MS / 1000 + " s" : how) + "); " + named + " needs the npm registry or an installed copy.");
}

/** One step; a fault names the step and its code, and the next step still runs. */
function step(name, run) {
  try {
    run();
  } catch (error) {
    say(name + " stopped (" + cause(error) + ").");
  }
}

if (process.env.CLAUDE_CODE_REMOTE === "true") {
  step("writing the environment file", markHooksActive);
  step("the readiness steps", () => {
    const root = repoRoot();
    let manifest = null;
    try {
      manifest = readManifest(root);
    } catch (error) {
      say("package.json could not be read (" + cause(error) + "), so node is not checked and nothing is installed.");
      manifest = undefined;
    }
    if (manifest === null) say("no package.json, so nothing is installed and node is not checked.");
    if (manifest) {
      step("the node check", () => checkNode(manifest));
      step("the install", () => installDependencies(root));
    }
    step("resolving the pinned CLI", () => resolveCli(root));
  });
  process.stdout.write(lines.join("\n") + "\n");
}
`}`;
}

// ── 5. Person-only shell guard ───────────────────────────────────

/**
 * The most run folders the guard and the ask gate read: each one's record head is read, none skipped for its name's
 * place in the sort (pr/54), and past this many the read faults, which the guard refuses on and the ask gate lets
 * the question through on.
 */
const GUARD_RUN_FOLDERS_MAX = 2_000;

/**
 * Ceilings on the tag names the guard collects and the `packed-refs` file it reads; past either the read faults
 * (`TAG_NAMES_OVER_<max>`, `PACKED_REFS_OVER_<max>`, pr/95), which the guard refuses on, as past the run-folder one.
 */
const GUARD_TAG_NAMES_MAX = 10_000;
const GUARD_PACKED_REFS_MAX_BYTES = 8_388_608;

/** Places a shell call's git can run in that the guard reads; past this one more counts as unreadable. */
const GUARD_PLACES_MAX = 32;

/**
 * What the guard adds to an ask on a client that cannot hold one (REQ-FLOW-123): Cursor ran a command despite a
 * `beforeShellExecution` ask under `--force` (measured 2026-10-18), and Codex parses an ask and lets the call through.
 */
const GUARD_CANNOT_ASK =
  "This client cannot ask the person for a click, so the guard refuses it: give the person the exact command.";

/**
 * What the guard adds to an ask on Copilot CLI (REQ-FLOW-123, review/89): it holds an ask, but its tool-call payload
 * names no calling agent ({@link IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS}), so a custom agent's act would reach the person's
 * approve prompt as the main thread's would.
 */
const GUARD_NO_CALLER =
  "Copilot CLI names no calling agent in its tool-call payload, so the guard cannot keep the ask for the person alone and refuses it: give the person the exact command.";

/**
 * How a client hears the guard's decision (`decision`: null to allow, else `{ ask, reason }`), rendered for that
 * client alone (REQ-FLOW-123): Claude Code asks with its `hookSpecificOutput` ask on stdout and exit 0, and refuses on
 * exit 2 with the reason on stderr; Copilot reads `permissionDecision` `deny` on stdout, through the runner or not;
 * Codex (through the portable runner) refuses on exit 2 with the reason on stderr; Cursor's `beforeShellExecution` reads
 * `permission`, and its `failClosed` counts silence as a failure, so it is told to allow out loud. Copilot, Cursor and
 * Codex refuse an ask, the reason saying why ({@link GUARD_NO_CALLER}, {@link GUARD_CANNOT_ASK}).
 */
function guardDecisionOutput(tool: Tool): string {
  const why = tool === "copilot" ? GUARD_NO_CALLER : GUARD_CANNOT_ASK;
  const told = String.raw`const told = decision === null ? null : decision.ask ? decision.reason + " " + ${json(why)} : decision.reason;`;
  if (tool === "cursor") {
    return String.raw`${told}
process.stdout.write(JSON.stringify(told === null ? { permission: "allow" } : { permission: "deny", user_message: told, agent_message: told }) + "\n");`;
  }
  if (tool === "copilot") {
    return String.raw`${told}
if (told !== null) process.stdout.write(JSON.stringify({ permissionDecision: "deny", permissionDecisionReason: told }) + "\n");`;
  }
  if (tool === "claude") {
    return String.raw`if (decision !== null && decision.ask) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: decision.reason } }) + "\n");
} else if (decision !== null) {
  process.stderr.write("stamity person-only guard: " + decision.reason + "\n");
  process.exitCode = ${BLOCKING_EXIT_CODE};
}`;
  }
  return String.raw`${told}
if (told !== null) {
  process.stderr.write("stamity person-only guard: " + told + "\n");
  process.exitCode = ${BLOCKING_EXIT_CODE};
}`;
}

/**
 * The person-only shell guard (REQ-FLOW-102, REQ-FLOW-120, REQ-FLOW-123,
 * REQ-FLOW-124): attended, it asks the person for one click on a person-only
 * act that can be undone on Claude Code, and refuses it on Copilot, whose
 * payload names no calling agent (review/89), and where the client cannot ask
 * (Cursor, Codex); it refuses every
 * deletion, force push and act that cannot be undone on every client; and
 * while a run is unattended it refuses every person-only act and any push
 * that steps around the run verbs.
 *
 * The verdict is collected over every place the call's git runs in and both
 * readings of a PowerShell call: one refuse-class act refuses the call, and
 * the call asks only when every act found is ask-class and the mode reads
 * attended; a sub-agent's call, or one in Claude Code's `auto` permission mode,
 * is refused instead (review/72, review/75). The mode is read for every ask, so
 * a fault reading it refuses. A
 * GitHub MCP tool of {@link GITHUB_MCP_ROWS} is classed by its row the same
 * way, with no shell reading.
 *
 * The two verdicts are `./personOnly.ts`'s own functions, carried as their
 * source text the way {@link NORMALIZE_FOR_SCREEN} carries the fold, so a row
 * added there reaches this script on the next sync without an edit here.
 *
 * The branch context comes off the git metadata with `node:fs`, read where the
 * call runs: the payload's working directory, each `cd`, `pushd`, `env -C` or
 * PowerShell location target and each `git -C`, `--git-dir`, `GIT_DIR=` or
 * `$env:GIT_DIR` value, read only where the shell runs a command (a quoted word
 * elsewhere is data), the nearest `.git` above each (a linked worktree's
 * `gitdir:` pointer followed). Each place gives `HEAD` from
 * its git dir, the default branch from `refs/remotes/origin/HEAD` and the local
 * tags from `refs/tags/` and `packed-refs` in its common dir (read only when a
 * push refspec asks for them), and the verdict runs once per place. Where
 * `HEAD` cannot be read (a reftable repository's placeholder among it), an implied destination
 * counts as the default branch; `main` and `master` always count. The mode comes
 * off the run records, read only for a person-only act that can be undone and
 * a call the unattended rule would refuse:
 * unattended when any run folder, debug rounds included, holds an
 * in-progress record reading `Mode:
 * unattended`, or when `STAMITY_UNATTENDED` is set (not "", "false", "0") and
 * none reads `Mode: attended`; the refusal names which. Every run folder's head
 * is read (pr/54); more than {@link GUARD_RUN_FOLDERS_MAX} of them is a fault,
 * so that call is refused.
 *
 * A command naming `gate preflight` that the guard allows writes
 * `{ "at": <ISO> }` to {@link PREFLIGHT_CANARY_FILE}, the pre-flight's proof
 * that hooks loaded. A call that is neither a shell call nor a GitHub MCP row's
 * tool is allowed at once; a shell call the guard cannot read (a payload naming
 * no tool, Cursor's, with no command string among them), or a fault while
 * deciding one, is refused, never asked.
 */
export function buildPersonOnlyGuardScript(opts: { tool: Tool; layout: HookScriptLayout }): string {
  const extra = repoRootImports(opts.layout);
  const regex = (pattern: RegExp): string => `new RegExp(${json(pattern.source)}, ${json(pattern.flags)})`;
  return `${header(
    [
      "stamity — person-only shell guard.",
      "",
      "Reads every shell call and GitHub MCP write for the person-only acts. Attended,",
      "one that can be undone (a push of a tag or of the default branch, a tag, a",
      "merge, a release, a publish, a secret or protection write) asks the person for",
      "one click on Claude Code's main thread and is refused elsewhere; a deletion, a",
      "force push or an act that cannot be undone is refused on every client. While a",
      "run is unattended every person-only act is refused, and any push that steps",
      "around `stamity run checkpoint` and `stamity run end`. `curl` and `wget` appear",
      "below only as command words it reads; it runs none.",
    ],
    [
      "Reads outside repo state: the pending call's payload on stdin and the",
      "STAMITY_UNATTENDED and STAMITY_REPO_ROOT variables. Reads the git metadata and",
      "the run records' heads; writes only the pre-flight canary.",
    ],
  )}

${namedImport(["closeSync", "lstatSync", "mkdirSync", "openSync", "readFileSync", "readSync", "readdirSync", "statSync", "writeFileSync"], "node:fs")}
${namedImport(["dirname", "isAbsolute", "join", "resolve", "sep", ...extra.path], "node:path")}
${extra.url}
const STATE_SEGMENTS = ${json([RUNS_SEGMENTS[0]])};
const RUNS_SEGMENTS = ${json(RUNS_SEGMENTS)};
const RECORD_FILE = ${json(RECORD_FILE)};
const RUN_ID = ${regex(RUN_ID_PATTERN)};
const STATUS = ${regex(RECORD_STATUS_PATTERN)};
const MODE = ${regex(RECORD_MODE_PATTERN)};
const IN_PROGRESS = ${regex(IN_PROGRESS_PATTERN)};
const HEAD_LINES = ${RECORD_HEAD_LINES};
const HEAD_READ_BYTES = ${RECORD_HEAD_READ_BYTES};
const RUN_FOLDERS_MAX = ${GUARD_RUN_FOLDERS_MAX};
const GIT_MAX_BYTES = ${GIT_METADATA_MAX_BYTES};
const TAG_NAMES_MAX = ${GUARD_TAG_NAMES_MAX};
const PACKED_REFS_MAX_BYTES = ${GUARD_PACKED_REFS_MAX_BYTES};
const PLACES_MAX = ${GUARD_PLACES_MAX};
const CANARY_SEGMENTS = ${json(PREFLIGHT_CANARY_FILE.split("/"))};
const SHELL_TOOLS = new Set(["Bash", "PowerShell", "Shell", "bash", "powershell", "shell"]);
// The GitHub MCP server's person-only tools and whether each is ask-class (personOnly.ts, GITHUB_MCP_ROWS).
const MCP_ROWS = new Map(${json(GITHUB_MCP_ROWS.map((entry) => [entry.row, entry.ask]))});

${resolveRepoRoot(opts.layout)}

// The person-only verdict and the unattended push rule, as their own source
// (src/hooks/personOnly.ts in the engine that wrote this file). An engine loaded
// through a name-keeping transformer (tsx) wraps their inner functions in
// __name(fn, "name"), a helper it defines outside them: a no-op one stands in.
const __name = (target) => target;
const personOnlyVerdict = ${personOnlyVerdict.toString()};

const unattendedPushVerdict = ${unattendedPushVerdict.toString()};
${String.raw`
/** A git metadata file's text, trimmed: a regular file of at most GIT_MAX_BYTES, never through a link. */
function gitText(path) {
  try {
    const stats = lstatSync(path);
    return stats.isFile() && stats.size <= GIT_MAX_BYTES ? readFileSync(path, "utf8").trim() : null;
  } catch {
    return null;
  }
}

/** The git dir HEAD lives in and the common dir the refs live in, from a git dir or a gitdir: file; null when neither. */
function gitDirsOf(path) {
  let gitDir = path;
  try {
    if (!lstatSync(path).isDirectory()) {
      const pointer = /^gitdir:[ \t]*(.+)$/.exec((gitText(path) ?? "").split(/\r?\n/)[0]);
      if (pointer === null) return null;
      const target = pointer[1].trim();
      gitDir = isAbsolute(target) ? target : resolve(dirname(path), target);
    }
  } catch {
    return null;
  }
  const common = gitText(join(gitDir, "commondir"));
  return { gitDir, commonDir: common === null ? gitDir : resolve(gitDir, common) };
}

/** The git dirs of the repository a directory sits in, the nearest .git upward; null when none can be placed. */
function gitDirsFrom(start) {
  try {
    if (!statSync(start).isDirectory()) return null;
  } catch {
    return null;
  }
  for (let dir = start; ; dir = dirname(dir)) {
    try {
      lstatSync(join(dir, ".git"));
      return gitDirsOf(join(dir, ".git"));
    } catch (error) {
      if (!error || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) return null;
    }
    if (dirname(dir) === dir) return null;
  }
}

`}${
  // Where a shell call's git runs (review/94, review/116, review/117). Beside the payload's working directory, a
  // place is a directory a command moves to (cd, pushd, chdir, env -C, and PowerShell's Set-Location, sl and
  // Push-Location), a git -C or --git-dir value, or a GIT_DIR or $env:GIT_DIR assignment. One counts only where
  // the shell runs a command: a line's start, after an operator (; & | ( ) { }, a backtick or a newline), a
  // keyword, an assignment or one of u6's wrappers with its options, and in the lines a command runs: sh -c's,
  // eval's, env -S's, a runner's -c, a $(...) or backtick in double quotes or in an unquoted heredoc's body, a
  // heredoc's body where a shell on the line reads it, PowerShell's command string as u6 reads it (build/89), cmd /c
  // or /k's rest, a git rebase exec line and git bisect run's command (review/193, linesOf), and a
  // program word holding a blank, which u6 also reads as a line (review/153; a PowerShell here-string, @'...'@, is
  // a literal). Any other word, a commit message's among them, is data and adds no place. A redirection's target
  // and a comment are no words. A path is read against each directory the line can be in by then; null is a place
  // that cannot be read, such as a move with no target, a git -C or --git-dir with no word for its value (a brace
  // placeholder, review/154), or one past PLACES_MAX.
  //
  // A PowerShell line is split as u6's verdict splits it, the way it finds the push, so a quote PowerShell reads
  // otherwise can only hide a place where it hides the push too, or turn a path unreadable (a refusal). The
  // location commands count in any letter case, on every shell tool (Cursor's payload names no shell, and a POSIX
  // shell has no such command, so one read there only adds a place); a target is the -Path or -LiteralPath value
  // (a unique prefix) or the first word that is no option, and cd.. moves to the parent. Forms not read sit in the
  // named respelling residual: a braced variable name, Set-Item env:, cmd's cd /d, sudo -D.
  //
  // The wrapper, runner, shell and PowerShell tables are u6's (personOnly.ts, inside both verdicts), copied: per
  // wrapper, the short letters and the long options taking a value, and the options whose value is a command line.
  // test/hooks/personOnlyGuard.test.ts holds the copies equal (build/90). A program word is read as u6 reads it,
  // a trailing @<version> cut (npx npm@10, corepack pnpm@9), so a versioned manager's runner reads its place.
  String.raw`function programName(word) {
  return (word.split(/[\\/]/).pop() ?? "").toLowerCase().replace(/^([^@]+)@[\s\S]*$/, "$1").replace(/\.(exe|cmd|bat)$/, "");
}

function commandFlag(word) {
  const match = /^(?:--?|\/)([a-z]+)(?::([\s\S]*))?$/i.exec(word);
  const name = (match?.[1] ?? "").toLowerCase();
  return name !== "" && ("commandwithargs".startsWith(name) || name === "cwa") ? (match?.[2] ?? "") : null;
}

function present(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** A line's words (a null where a command can follow), the lines they run, and its heredocs' bodies. */
function shellWords(command) {
  const words = [];
  const nested = [];
  const docs = [];
  const pending = [];
  let word = null;
  let drop = false;
  const end = () => {
    if (word !== null && !drop) words.push(word);
    else if (word !== null) drop = false;
    word = null;
  };
  const opens = (text, j) => (text[j] === "$" && text[j + 1] === "(") || text[j] === "\`";
  const sub = (text, j) => {
    let close = text[j] === "\`" ? text.indexOf("\`", j + 1) : j + 1;
    for (let level = 0; text[j] === "$" && close < text.length; close += 1) {
      if (text[close] === "(") level += 1;
      else if (text[close] === ")" && --level === 0) break;
    }
    if (close === -1) close = text.length;
    nested.push(text.slice(j + (text[j] === "$" ? 2 : 1), close));
    return close;
  };
  const bodies = (k) => {
    let at = k + 1;
    for (const doc of pending.splice(0)) {
      let body = "";
      while (at < command.length) {
        let stop = command.indexOf("\n", at);
        if (stop === -1) stop = command.length;
        const line = command.slice(at, stop).replace(/\r$/, "");
        at = stop + 1;
        if ((doc.strip ? line.replace(/^\t+/, "") : line) === doc.delimiter) break;
        body += line + "\n";
      }
      docs.push(body);
      for (let j = 0; doc.expand && j < body.length; j += 1) {
        if (body[j] === "\\") j += 1;
        else if (opens(body, j)) j = sub(body, j);
      }
    }
    return at - 1;
  };
  for (let k = 0; k < command.length; k += 1) {
    const c = command[k];
    if (c === "'") {
      const close = command.indexOf("'", k + 1);
      word = (word ?? "") + command.slice(k + 1, close === -1 ? command.length : close);
      k = close === -1 ? command.length : close;
    } else if (c === '"') {
      word ??= "";
      for (k += 1; k < command.length && command[k] !== '"'; k += 1) {
        if (opens(command, k)) {
          const close = sub(command, k);
          word += command.slice(k, close + 1);
          k = close;
          continue;
        }
        if (command[k] === "\\" && '$\`"\\\n'.includes(command[k + 1] ?? "")) k += 1;
        word += command[k] ?? "";
      }
    } else if (c === "\\" && process.platform !== "win32") {
      // A backslash escapes the next character, except on Windows, where it separates a path's parts.
      if (command[k + 1] !== "\n") word = (word ?? "") + (command[k + 1] ?? "");
      k += 1;
    } else if (c === "#" && word === null) {
      while (k + 1 < command.length && command[k + 1] !== "\n") k += 1;
    } else if (c === "<" || c === ">") {
      if (word !== null && /^\d+$/.test(word)) word = null;
      else end();
      if (command.startsWith("<<", k) && command[k + 2] !== "<") {
        let j = k + 2 + (command[k + 2] === "-" ? 1 : 0);
        while (command[j] === " " || command[j] === "\t") j += 1;
        const delimiter = /^[^\s;&|()<>]*/.exec(command.slice(j))[0];
        pending.push({ delimiter: delimiter.replace(/['"\\]/g, ""), strip: command[k + 2] === "-", expand: !/['"\\]/.test(delimiter) });
        k = j + delimiter.length - 1;
      } else {
        while (/[<>&|]/.test(command[k + 1] ?? "")) k += 1;
        drop = true;
      }
    } else if (/[\s;&|(){}\`]/.test(c)) {
      end();
      if (c === "\n" || c === "\r" || !/\s/.test(c)) {
        drop = false;
        words.push(null);
      }
      if (c === "\n" && pending.length > 0) k = bodies(k);
    } else word = (word ?? "") + c;
  }
  end();
  const home = process.env.HOME ?? process.env.USERPROFILE;
  return { words: words.map((w) => (w !== null && home && /^~(?=[\\/]|$)/.test(w) ? home + w.slice(1) : w)), nested, docs };
}

const RUNNER = ["pw", "--package --workspace --filter", "-c --call --shell-mode"];
const WRAPPERS = new Map([
  ["env", ["uCP", "--unset --chdir", "-S --split-string"]],
  ["sudo", ["ugpCrtUDRT", "--user --group --prompt --close-from --role --type --other-user --chdir --chroot --command-timeout --host"]],
  ["doas", ["uC"]],
  ["exec", ["a"]],
  ["nice", ["n", "--adjustment"]],
  ["timeout", ["sk", "--signal --kill-after"]],
  ["stdbuf", ["ioe", "--input --output --error"]],
  ["time", ["fo", "--format --output"]],
  ["xargs", ["ILnPsdEa", "--max-args --max-procs --max-chars --delimiter --arg-file --process-slot-var"]],
  ["command", []],
  ["builtin", []],
  ["nohup", []],
  ["npx", RUNNER],
  ["bunx", RUNNER],
  ["pnpx", RUNNER],
  ["corepack", []],
]);
const RUNNERS = new Set(["npm exec", "npm x", "pnpm dlx", "pnpm exec", "yarn dlx", "yarn exec", "bun x", "bun exec"]);
const MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const MANAGER_VALUED = new Set(["-w", "--workspace", "--filter", "-F", "--prefix", "-C", "--dir", "--cwd", "--registry", "--userconfig"]);
const KEYWORDS = new Set(["!", "if", "then", "else", "elif", "fi", "do", "done", "while", "until"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const POWERSHELLS = new Set(["pwsh", "powershell", "invoke-expression", "iex"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Where a shell call's git runs: its working directory and each place a command on the line moves it to. */
function placesOf(command, cwd) {
  const places = [{ work: cwd }];
  const bases = [cwd];
  const full = () => places.length > PLACES_MAX || bases.length > PLACES_MAX;
  const has = (list, option) => list.split(" ").includes(option);
  const move = (path) => {
    if (typeof path !== "string" || path === "-" || path === "+") places.push(null);
    else for (const dir of bases.map((base) => resolve(base, path))) {
      places.push({ work: dir });
      if (!bases.includes(dir)) bases.push(dir);
    }
  };
  const gitDir = (path) => {
    if (typeof path !== "string") places.push(null);
    else for (const base of bases) places.push({ git: resolve(base, path) });
  };
  const scan = (line, depth) => {
    const { words, nested, docs } = shellWords(line);
    const inner = (text) => {
      if (depth < 4 && typeof text === "string") scan(text, depth + 1);
    };
    const rest = (j) => {
      const tail = [];
      while (typeof words[j] === "string") tail.push(words[j++]);
      return tail;
    };
    let shell = false;
    for (let k = 0, at = true; k < words.length && !full(); k += 1) {
      const word = words[k];
      if (word === null) at = true;
      if (word === null || !at) continue;
      if (ASSIGNMENT.test(word) || KEYWORDS.has(word)) {
        if (word.startsWith("GIT_DIR=")) gitDir(word.slice(8));
        continue;
      }
      at = false;
      if (/\s/.test(word) && !/^@\s/.test(word)) inner(rest(k).join(" "));
      const name = programName(word);
      const assigned = /^\$env:git_dir(=.*)?$/i.exec(word);
      // A package manager's options before a runner's subcommand (npm -w x exec), skipped as u6 skips them.
      let sub = k + 1;
      while (MANAGERS.has(name) && typeof words[sub] === "string") {
        const option = words[sub];
        const next = typeof words[sub + 1] === "string" ? words[sub + 1] : "-";
        if (MANAGER_VALUED.has(option) || (name === "yarn" && option === "workspace")) sub += 2;
        else if (/^--[^=]+$/.test(option) && !next.startsWith("-") && !RUNNERS.has(name + " " + next)) sub += 2;
        else if (option.startsWith("-") && option !== "--") sub += 1;
        else break;
      }
      if (assigned !== null) {
        const value = assigned[1] ?? (/^=/.test(words[k + 1] ?? "") ? words[(k += 1)] : undefined);
        if (value !== undefined) gitDir(value === "=" ? words[(k += 1)] : value.slice(1));
      } else if (WRAPPERS.has(name) || RUNNERS.has(name + " " + words[sub])) {
        const [short = "", long = "", lines = ""] = WRAPPERS.get(name) ?? RUNNER;
        if (!WRAPPERS.has(name)) k = sub;
        at = true;
        while (typeof words[k + 1] === "string" && (ASSIGNMENT.test(words[k + 1]) || /^(-|\d)/.test(words[k + 1]))) {
          const option = words[(k += 1)];
          if (ASSIGNMENT.test(option)) {
            if (option.startsWith("GIT_DIR=")) gitDir(option.slice(8));
            continue;
          }
          if (option === "--") break;
          let flag = null;
          let value;
          if (option.startsWith("--")) {
            const key = option.split("=")[0];
            if (has(long, key) || has(lines, key)) {
              flag = key;
              value = option.includes("=") ? option.slice(key.length + 1) : words[(k += 1)];
            }
          } else if (option.startsWith("-")) {
            for (let c = 1; c < option.length && flag === null; c += 1) {
              if (!short.includes(option[c]) && !has(lines, "-" + option[c])) continue;
              flag = "-" + option[c];
              value = c === option.length - 1 ? words[(k += 1)] : option.slice(c + 1);
            }
          }
          if (name === "env" && (flag === "-C" || flag === "--chdir")) move(value);
          else if (flag !== null && has(lines, flag)) {
            inner([value, ...rest(k + 1)].join(" "));
            at = false;
            break;
          }
        }
      } else if (["cd", "pushd", "chdir", "sl", "set-location", "push-location"].includes(name)) {
        let path;
        for (let j = k + 1; path === undefined && typeof words[j] === "string"; j += 1) {
          const option = /^--?(\w*)(?::(.*))?$/.exec(words[j]);
          if (option === null) path = words[j];
          else if (/^(?:path?|l\w*|pspath)$/i.test(option[1])) path = option[2] || words[j + 1] || null;
          else if (/^s/i.test(option[1]) && option[2] === undefined) j += 1;
        }
        move(path);
      } else if (name === "cd..") {
        move("..");
      } else if (name === "git") {
        let from = [...bases];
        for (let j = k + 1; typeof words[j] === "string"; j += 1) {
          const option = words[j];
          const value = option === "-C" || option === "--git-dir" ? words[(j += 1)] : option.slice(10);
          if (typeof value !== "string") {
            places.push(null);
            break;
          }
          if (option === "-C") {
            from = from.map((base) => resolve(base, value));
            for (const dir of from) places.push({ work: dir });
          } else if (option === "--git-dir" || option.startsWith("--git-dir=")) {
            for (const base of from) places.push({ git: resolve(base, value) });
          } else if (["-c", "--work-tree", "--namespace", "--config-env", "--super-prefix"].includes(option)) j += 1;
          else if (!option.startsWith("-")) break;
        }
      } else if (["export", "declare", "typeset", "local", "readonly"].includes(name)) {
        for (const option of rest(k + 1)) if (option.startsWith("GIT_DIR=")) gitDir(option.slice(8));
      }
      if (SHELLS.has(name) || POWERSHELLS.has(name)) shell = true;
      for (const text of linesOf(name, rest(k + 1))) inner(text);
    }
    for (const text of nested) inner(text);
    if (shell) for (const text of docs) inner(text);
  };
  scan(command, 0);
  if (full()) places.push(null);
  return places;
}

/**
 * The lines a command runs, as the push verdicts read them: sh -c's script, eval's words, PowerShell's command
 * string, cmd /c or /k's rest, each git rebase exec line (git's abbreviations and clusters too) and git bisect run's
 * command, so every line the verdicts read for a push is read here for a place. An entry past the line's end is no text.
 */
function linesOf(name, tail) {
  if (/^git-./.test(name)) return linesOf("git", [name.slice(4), ...tail]);
  if (SHELLS.has(name)) {
    const flag = tail.findIndex((option) => /^-[A-Za-z]*c[A-Za-z]*$/.test(option));
    return flag === -1 ? [] : [tail[flag + 1]];
  }
  if (name === "eval") return [tail.join(" ")];
  if (POWERSHELLS.has(name)) {
    const flag = tail.findIndex((option) => commandFlag(option) !== null);
    const first = flag !== -1 ? -1 : tail.findIndex((option) => !/^-|^\/\w*$/.test(option));
    const line = flag !== -1 ? [[commandFlag(tail[flag]), ...tail.slice(flag + 1)].join(" ")] : first !== -1 ? [tail.slice(first).join(" ")] : [];
    return [...line, ...(first === -1 ? [] : tail.slice(first + 1).filter((option) => /\s/.test(option)))];
  }
  if (name === "cmd") {
    const at = tail.findIndex((option) => /^\/[ck]/i.test(option));
    return at === -1 ? [] : [[tail[at].slice(2), ...tail.slice(at + 1)].join(" ")];
  }
  if (name !== "git") return [];
  let k = 0;
  while (k < tail.length && tail[k].startsWith("-")) k += ["-c", "-C", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix"].includes(tail[k]) ? 2 : 1;
  const sub = (tail[k] ?? "").toLowerCase();
  const args = tail.slice(k + 1);
  if (sub === "bisect" && args[0] === "run") return [args.slice(1).map((word) => "'" + word.replaceAll("'", "'\\''") + "'").join(" ")];
  const lines = [];
  for (let j = 0; sub === "rebase" && j < args.length && args[j] !== "--"; j += 1) {
    const arg = args[j];
    const long = /^--ex(?:ec?)?(=[\s\S]*)?$/.exec(arg);
    if (long !== null) lines.push(long[1] === undefined ? args[(j += 1)] : long[1].slice(1));
    else if (/^-[^-]/.test(arg)) {
      for (let c = 1; c < arg.length; c += 1) {
        if (arg[c] === "x") lines.push(c === arg.length - 1 ? args[(j += 1)] : arg.slice(c + 1));
        if (arg[c] === "x" || "sXCS".includes(arg[c])) {
          if (arg[c] !== "x" && arg[c] !== "S" && c === arg.length - 1) j += 1;
          break;
        }
      }
    }
  }
  return lines;
}

/**
 * The branch context of each place a shell call's git runs in, one per git dir. Where HEAD names no branch or commit
 * (reftable's placeholder too), an implied destination counts as the default branch, so a refspec-less push is refused.
 */
function contextsOf(command, cwd) {
  const contexts = new Map();
  for (const place of placesOf(command, cwd)) {
    const dirs = place === null ? null : place.git !== undefined ? gitDirsOf(place.git) : gitDirsFrom(place.work);
    const key = dirs === null ? "" : dirs.gitDir;
    if (contexts.has(key)) continue;
    const reftable = dirs !== null && (present(join(dirs.gitDir, "reftable")) || present(join(dirs.commonDir, "reftable")));
    const head = dirs === null || reftable ? null : gitText(join(dirs.gitDir, "HEAD"));
    const branch = /^ref: refs\/heads\/(.+)$/.exec(head ?? "")?.[1] ?? ".invalid";
    const detached = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i.test(head ?? "");
    const origin = dirs === null ? null : gitText(join(dirs.commonDir, "refs", "remotes", "origin", "HEAD"));
    const defaultBranches = origin !== null && origin.startsWith("ref: refs/remotes/origin/") ? [origin.slice(25)] : [];
    let tags = null;
    contexts.set(key, {
      currentBranch: branch !== ".invalid" ? branch : detached ? null : (defaultBranches[0] ?? "main"),
      defaultBranches,
      // Read the first time the verdict asks, which only a push refspec does: no other call reads a tag.
      get tags() {
        tags ??= dirs === null ? [] : localTags(dirs.commonDir);
        return tags;
      },
    });
  }
  return [...contexts.values()];
}
`}${String.raw`
/**
 * The local tag names, loose and packed. Two ceilings fault with a coded error the guard refuses on, a further
 * tag past TAG_NAMES_MAX and a packed-refs file past PACKED_REFS_MAX_BYTES, so neither cut reads as every tag
 * there is; the throws sit outside the reads' catches. A packed-refs file or a loose tag entry that is not a
 * regular file (a link, a FIFO) is read as absent, so the list can still miss a tag that way.
 */
function localTags(commonDir) {
  // A name both loose and packed counts once.
  const tags = new Set();
  const add = (name, path) => {
    if (tags.has(name)) return;
    if (tags.size >= TAG_NAMES_MAX) throw Object.assign(new Error("tag names"), { code: "TAG_NAMES_OVER_" + TAG_NAMES_MAX, path });
    tags.add(name);
  };
  const walk = (dir, prefix) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) walk(join(dir, entry.name), prefix + entry.name + "/");
      else if (entry.isFile()) add(prefix + entry.name, dir);
    }
  };
  walk(join(commonDir, "refs", "tags"), "");
  const packed = join(commonDir, "packed-refs");
  let text = "";
  let size = 0;
  try {
    const stats = lstatSync(packed);
    if (stats.isFile()) size = stats.size;
    if (stats.isFile() && size <= PACKED_REFS_MAX_BYTES) text = readFileSync(packed, "utf8");
  } catch {
    // No packed refs: the loose tags are all there are.
  }
  if (size > PACKED_REFS_MAX_BYTES) {
    throw Object.assign(new Error("packed refs"), { code: "PACKED_REFS_OVER_" + PACKED_REFS_MAX_BYTES, path: packed });
  }
  for (const line of text.split(/\r?\n/)) {
    const hit = /^[0-9a-f]{40,64} refs\/tags\/(.+)$/i.exec(line);
    if (hit !== null) add(hit[1], packed);
  }
  return [...tags];
}

/** A record's status and mode from its first HEAD_LINES lines; null when absent or not a regular file. */
function recordHead(path) {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
  if (!stats.isFile()) return null;
  const fd = openSync(path, "r");
  let text = "";
  try {
    const buffer = Buffer.alloc(Math.min(HEAD_READ_BYTES, stats.size));
    text = buffer.toString("utf8", 0, readSync(fd, buffer, 0, buffer.length, 0));
  } finally {
    closeSync(fd);
  }
  let status = null;
  let mode = null;
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/).slice(0, HEAD_LINES)) {
    status ??= STATUS.exec(line)?.[1] ?? null;
    mode ??= MODE.exec(line)?.[1].toLowerCase() ?? null;
  }
  return { inProgress: status !== null && IN_PROGRESS.test(status), mode };
}

/**
 * What makes the session unattended, as a refusal names it: the in-progress records reading Mode: unattended,
 * or the variable when it is set and no in-progress record reads attended; null when nothing does.
 */
function unattendedBy(root) {
  const modes = { attended: false, unattended: false };
  const runs = [];
  const runsDir = join(root, ...RUNS_SEGMENTS);
  let entries = [];
  try {
    if (lstatSync(runsDir).isDirectory()) entries = readdirSync(runsDir, { withFileTypes: true });
  } catch (error) {
    if (!error || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) throw error;
  }
  // Every run folder's head, so no pile of folders named after an open record's pushes it out of the read.
  const names = entries
    .filter((entry) => entry.isDirectory() && RUN_ID.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  if (names.length > RUN_FOLDERS_MAX) {
    throw Object.assign(new Error("run folders"), { code: "RUN_FOLDERS_OVER_" + RUN_FOLDERS_MAX, path: runsDir });
  }
  for (const name of names) {
    const head = recordHead(join(runsDir, name, RECORD_FILE));
    if (head !== null && head.inProgress && head.mode !== null) modes[head.mode] = true;
    if (head !== null && head.inProgress && head.mode === "unattended") runs.push([...RUNS_SEGMENTS, name, RECORD_FILE].join("/"));
  }
  if (runs.length > 0) {
    const named = runs.slice(0, 3).join(", ") + (runs.length > 3 ? " and " + (runs.length - 3) + " more" : "");
    return "This session is unattended because " + named + " read" + (runs.length === 1 ? "s" : "") + " \`Status: in progress\` and \`Mode: unattended\`.";
  }
  const flag = (process.env.STAMITY_UNATTENDED ?? "").trim().toLowerCase();
  if (["", "false", "0"].includes(flag) || modes.attended) return null;
  return "This session is unattended because STAMITY_UNATTENDED is set and no in-progress run record reads \`Mode: attended\`.";
}

/** The shell command a payload carries; null when the call is not a shell call. */
function shellCommand(payload) {
  // Cursor's beforeShellExecution names the command at the top level and no tool: every such payload is a shell call,
  // so one with no command string is one this guard cannot read, never one that is not a shell call.
  if (payload.tool_name === undefined || payload.hook_event_name === "beforeShellExecution") {
    if (typeof payload.command === "string") return payload.command;
    throw Object.assign(new Error("no command"), { code: "NO_COMMAND" });
  }
  if (!SHELL_TOOLS.has(payload.tool_name)) return null;
  const input = payload.tool_input;
  const command = input !== null && typeof input === "object" ? input.command : undefined;
  if (typeof command === "string") return command;
  if (Array.isArray(command) && command.every((word) => typeof word === "string")) {
    return command.map((word) => "'" + word.replaceAll("'", "'\\''") + "'").join(" ");
  }
  throw Object.assign(new Error("no command"), { code: "NO_COMMAND" });
}

/** The pre-flight's canary; a link at its path is not followed, and a failed write leaves the pre-flight to refuse. */
function writeCanary(root) {
  const path = join(root, ...CANARY_SEGMENTS);
  try {
    try {
      if (!lstatSync(path).isFile()) return;
    } catch {
      // Absent: written below.
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ at: new Date().toISOString() }) + "\n");
  } catch {
    // Not written: the pre-flight then finds no fresh canary and refuses.
  }
}

/** The sentences a person-only act earns (REQ-FLOW-102, REQ-FLOW-124), the act printed as the verdict's own text. */
function askSentence(act, rule) {
  return act + " is a person-only act (\`" + rule + "\`): approve it to let the agent run it once (REQ-FLOW-102).";
}
function refuseSentence(act, rule) {
  return act + " deletes, force-pushes or cannot be undone (\`" + rule + "\`): it stays the person's to run, even with approval (REQ-FLOW-124). Give the person the exact command.";
}
function unattendedSentence(act, rule) {
  return act + " is a person-only act (\`" + rule + "\`) and this run is unattended: list it on the morning list, whose walk runs it after one click.";
}

/**
 * An attended ask-class act's decision: the person is asked, except where a sub-agent runs it (any agent identity the
 * core guard reads, review/72), since the act is the person's, or in Claude Code's \`auto\` permission mode, where a
 * classifier may settle the prompt (review/75); both are refused.
 */
function attendedAsk(payload, act, rule) {
  const told = act + " is a person-only act (\`" + rule + "\`) and ";
  const end = " (REQ-FLOW-102). Give the person the exact command.";
  const names = ["agent_type", "subagent_type", "agentType", "subagentType", "agent_id", "subagent_id"];
  if (names.some((name) => Object.hasOwn(payload, name) && typeof payload[name] === "string" && payload[name] !== "")) {
    return { ask: false, reason: told + "a sub-agent runs it: the act is the person's, so only the main thread may ask for it" + end };
  }
  if (payload.permission_mode === "auto") {
    return { ask: false, reason: told + "this session runs in the \`auto\` permission mode, where a classifier may settle the prompt: it stays the person's to run" + end };
  }
  return { ask: true, reason: askSentence(act, rule) };
}

/**
 * A GitHub MCP row's tool, classed by its row: the refused one refuses, and an ask-class one asks only while the mode
 * reads attended, since a settings ask row would otherwise wait for nobody in an unattended run (REQ-FLOW-120).
 */
function mcpDecision(tool, ask, root, payload) {
  const act = "A call to the GitHub MCP server";
  if (!ask) return { ask: false, reason: refuseSentence(act, tool) };
  const why = unattendedBy(root);
  return why === null ? attendedAsk(payload, act, tool) : { ask: false, reason: unattendedSentence(act, tool) + " " + why };
}

/** The decision this call earns: null to allow it, else whether the client asks the person and the reason. */
function decide() {
  const raw = readFileSync(0, "utf8");
  const payload = raw.trim() === "" ? {} : JSON.parse(raw);
  if (payload === null || typeof payload !== "object") throw new Error("payload");
  if (typeof payload.tool_name === "string" && MCP_ROWS.has(payload.tool_name)) {
    return mcpDecision(payload.tool_name, MCP_ROWS.get(payload.tool_name), repoRoot(), payload);
  }
  const command = shellCommand(payload);
  if (command === null) return null;
  const root = repoRoot();
  // Where the call runs: the payload's working directory (relative to the root), else the root.
  const cwd = typeof payload.cwd === "string" && payload.cwd !== "" ? resolve(root, payload.cwd) : root;
  // The PowerShell tool's text is PowerShell's command string, so the verdicts read it as one too, its backslash a
  // plain character and its backtick the escape, beside the text as it stands. The unattended verdict reads it with its
  // PowerShell flag, not through a synthetic pwsh -Command line, which the run verb's stand-alone rule would refuse.
  const pwsh = /^powershell$/i.test(payload.tool_name ?? "");
  const texts = pwsh ? [command, "pwsh -Command '" + command.replaceAll("'", "'\\''") + "'"] : [command];
  // Every place and every reading (REQ-FLOW-124): one refuse-class act refuses the call, so a deletion never rides an
  // approval another reading or place would ask for.
  const found = [];
  for (const ctx of contextsOf(command, cwd)) {
    for (const text of texts) {
      const always = personOnlyVerdict(text, ctx);
      if (always.deny) found.push(always);
    }
  }
  const refused = found.find((verdict) => !verdict.ask);
  if (refused !== undefined) return { ask: false, reason: refuseSentence(refused.act, refused.rule) };
  // The mode is read for every ask and for a call the unattended rule would refuse, so an unreadable record refuses
  // those and no other call.
  const run = () => {
    const verdict = unattendedPushVerdict(command, pwsh);
    return verdict.deny ? verdict : undefined;
  };
  if (found.length > 0) {
    const why = unattendedBy(root);
    if (why === null) return attendedAsk(payload, found[0].act, found[0].rule);
    // Unattended, a push keeps the push rule's own reason; any other act goes on the morning list.
    const push = run();
    return { ask: false, reason: (push !== undefined ? push.reason : unattendedSentence(found[0].act, found[0].rule)) + " " + why };
  }
  const push = run();
  if (push !== undefined) {
    const why = unattendedBy(root);
    if (why !== null) return { ask: false, reason: push.reason + " " + why };
  }
  if (/(?:^|[^\w-])gate\s+preflight(?![\w-])/.test(command)) writeCanary(root);
  return null;
}

let decision = null;
try {
  decision = decide();
} catch (error) {
  // Fail closed: a shell call this guard could not read is not one it allows, nor one it asks the person about.
  const what = error instanceof SyntaxError ? "an unreadable payload" : error && error.code ? error.code + (typeof error.path === "string" ? " on " + error.path : "") : "an internal fault";
  decision = { ask: false, reason: "The person-only guard could not decide this shell call (" + what + "), so it is refused (REQ-FLOW-102)." };
}
`}${guardDecisionOutput(opts.tool)}
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
 *
 * `opts` is the package the notice's check hint pins and the version it pins
 * it to — the emission context's package name and engine version, so a
 * renamed fork's notice names the fork, plus its `npmChannel` (absent: `-y`;
 * `false`: `--no`) and its scope's `registry` (absent: none named). Throws
 * `VALIDATION_ERROR` when either cannot be pinned (`../shared/cliCall.ts`).
 */
export function planCoreHookScripts(
  policiesJsonPath: string,
  tool: Tool,
  opts: { packageName: string; version: string; npmChannel?: boolean; registry?: string; personOnlyGuard?: boolean },
): GeneratedHookScript[] {
  const failMode =
    CLIENT_HOOK_GUARANTEES.find((guarantee) => guarantee.tool === tool)?.failMode ?? "fail-closed";
  // Asked for by emission once it wires the guard on the client's shell tools;
  // until then the core set stays the three scripts every caller expects.
  const guard: GeneratedHookScript[] =
    opts.personOnlyGuard === true
      ? [
          {
            fileName: PERSON_ONLY_GUARD_FILE,
            content: buildPersonOnlyGuardScript({ tool, layout: layoutFor(policiesJsonPath) }),
            event: "pre_tool_use",
          },
        ]
      : [];
  return [
    {
      fileName: SESSION_START_FILE,
      content: buildSessionStartScript({ layout: layoutFor(policiesJsonPath) }),
      event: "session_start",
    },
    {
      fileName: GUARD_FILE,
      content: buildPreToolUseGuardScript({
        policiesJsonPath,
        failMode,
        identityBearing: !IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS.has(tool),
        layout: layoutFor(policiesJsonPath),
      }),
      event: "pre_tool_use",
    },
    {
      fileName: TAMPER_NOTICE_FILE,
      content: buildConfigTamperNoticeScript({
        checkCall: cliCallHint(opts.packageName, opts.version, "check", opts),
      }),
      event: "session_start",
    },
    ...guard,
  ];
}

/**
 * The layout this plan is being rendered for, read off the ONE input emission
 * already keys that decision on.
 *
 * `policiesPathFor` (`../emit/hooksInfra.ts`) hands a CLIMB (`../../<document>`)
 * in the repository layout, because the guard sits two levels under the
 * generated directory that holds the document, and a bare sibling NAME in a
 * vendor container, where the document ships beside the guard. So the argument
 * this function already receives carries the mode, and one decision is made in
 * one place instead of two that can disagree.
 *
 * A first-class parameter threaded from `planHooksInfra` would say it more
 * directly; that module is outside this change's file set, and the derivation is
 * exact for both of its call shapes.
 */
function layoutFor(policiesJsonPath: string): HookScriptLayout {
  return policiesJsonPath.startsWith("../") ? "generated" : "container";
}

// ── 6. Unattended ask gate (non-core, Claude Code only) ──────────

/**
 * What the ask gate tells the agent it refused (REQ-FLOW-090): the rule, the
 * record line the default leaves, and the stop when there is no default.
 */
export const UNATTENDED_ASK_GATE_REASON =
  "This run is unattended: take the declared default and record `Default applied: <question> → option <N> (unattended)`; " +
  "with no declared default, stop at BLOCKED_AMBIGUITY.";

/**
 * What a refusal adds after {@link UNATTENDED_ASK_GATE_REASON}, naming what it
 * read: the record's repo-relative path stands in for `<record>`.
 */
export const UNATTENDED_ASK_GATE_RECORD_SOURCE = " (<record> is in progress and reads `Mode: unattended`.)";

/** The same, when the variable decided. */
export const UNATTENDED_ASK_GATE_VARIABLE_SOURCE =
  " (STAMITY_UNATTENDED is set, and no in-progress record reads `Mode: attended`.)";

/**
 * The one stderr line a fail-open allow writes: `<read>` names what could not
 * be read, `<cause>` the error code (or `not JSON`, or the fault's own name).
 */
export const UNATTENDED_ASK_GATE_FAULT_NOTE =
  "stamity unattended ask gate: <read> could not be read (<cause>), so the question goes through.";

/** The one tool the gate governs: Claude Code's question tool. */
const ASK_TOOL_NAME = "AskUserQuestion";

/**
 * The run-record head reader the ask gate and the Cursor continue hook share, as script text: `recordHead(path)`
 * reads one record's status, mode and branch from its head, and `recordHeads(root)` every run folder's, each with
 * its run id and repo-relative path. The host declares the constants it reads (RUNS_SEGMENTS, RECORD_FILE, RUN_ID,
 * STATUS, MODE, BRANCH, IN_PROGRESS, HEAD_LINES, HEAD_READ_BYTES, RUN_FOLDERS_MAX) and imports the `node:fs` and
 * `node:path` names it calls.
 */
const RECORD_HEADS_SOURCE = String.raw`
/** A record's status, mode and branch from its first HEAD_LINES lines; null when absent or not a regular file. */
function recordHead(path) {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
  if (!stats.isFile()) return null;
  const fd = openSync(path, "r");
  let text = "";
  try {
    const buffer = Buffer.alloc(Math.min(HEAD_READ_BYTES, stats.size));
    text = buffer.toString("utf8", 0, readSync(fd, buffer, 0, buffer.length, 0));
  } finally {
    closeSync(fd);
  }
  let status = null;
  let mode = null;
  let branch = null;
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/).slice(0, HEAD_LINES)) {
    status ??= STATUS.exec(line)?.[1] ?? null;
    mode ??= MODE.exec(line)?.[1].toLowerCase() ?? null;
    branch ??= BRANCH.exec(line)?.[1] ?? null;
  }
  return { inProgress: status !== null && IN_PROGRESS.test(status), mode, branch };
}

/** The heads of every run folder's record, each with its repo-relative path; no records folder holds none, more than RUN_FOLDERS_MAX throws. */
function recordHeads(root) {
  const runsDir = join(root, ...RUNS_SEGMENTS);
  let entries = [];
  try {
    if (lstatSync(runsDir).isDirectory()) entries = readdirSync(runsDir, { withFileTypes: true });
  } catch (error) {
    if (!error || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) throw error;
  }
  // Every run folder's head, so no pile of folders named after an open record's pushes it out of the read.
  const names = entries
    .filter((entry) => entry.isDirectory() && RUN_ID.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  if (names.length > RUN_FOLDERS_MAX) {
    throw Object.assign(new Error("run folders"), { code: "RUN_FOLDERS_OVER_" + RUN_FOLDERS_MAX, path: runsDir });
  }
  const heads = [];
  for (const name of names) {
    const head = recordHead(join(runsDir, name, RECORD_FILE));
    if (head !== null) heads.push({ ...head, run: name, path: [...RUNS_SEGMENTS, name, RECORD_FILE].join("/") });
  }
  return heads;
}`;

/**
 * The unattended ask gate (REQ-FLOW-090, REQ-FLOW-095): refuses Claude Code's
 * question tool while nobody is there to answer, so an unattended run takes its
 * declared defaults instead of waiting forever.
 *
 * Like {@link buildReviewGateScript} it is NOT core: it rides one client's
 * `PreToolUse` on `AskUserQuestion`, and the Claude adapter places and wires it.
 * Until that adapter asks for it, nothing renders it.
 *
 * The mode comes off the run records the way {@link buildPersonOnlyGuardScript}
 * reads them — every run folder, debug rounds included, each record's head
 * only, more than {@link GUARD_RUN_FOLDERS_MAX} of them a fault (pr/54) — and, like the guard, it reads no
 * order among them: a run id carries only the UTC date, so two runs of one day
 * would rank by slug (review/101). Any in-progress record reading `Mode:
 * unattended` refuses. Otherwise an in-progress record reading `Mode: attended`
 * allows, whatever the variable says. Otherwise `STAMITY_UNATTENDED` decides:
 * set (not "", "false", "0") it refuses — except when no run is in progress and
 * a closed record reading `Mode: unattended` names the current branch (read off
 * `.git/HEAD` as the guard reads it) on its `Branch:` line, and the run-ended
 * marker {@link RUN_ENDED_MARKER_FILE} that `run end --final-round` writes and
 * `run start` deletes names that record's run, its `at` at most
 * {@link RUN_ENDED_MAX_AGE_MS} old (15 minutes, a person-paced round of several
 * question calls) and not after now, which is Claude Code's final question round
 * after that run handed off (pr/17, pr/36, pr/41). A closed record carried into a later clone on another branch
 * exempts nothing (review/100), nor one on this branch with no fresh marker naming
 * it: a later session on that branch before its own record opens, past the window
 * (pr/17, pr/36). A refusal names the record or the variable it read (review/104).
 *
 * Fail-open by design: a question is the safe failure, so a payload it cannot
 * read, a records folder, record or git file it cannot read, or any fault while
 * deciding lets the question through, with one stderr line naming the read
 * that failed (review/105). Every other tool passes at once.
 */
export function buildUnattendedAskGate(opts: { layout?: HookScriptLayout } = {}): string {
  const layout = opts.layout ?? "generated";
  const extra = repoRootImports(layout);
  const regex = (pattern: RegExp): string => `new RegExp(${json(pattern.source)}, ${json(pattern.flags)})`;
  return `${header(
    [
      "stamity — unattended ask gate (Claude Code).",
      "",
      `Refuses ${ASK_TOOL_NAME} while a run is unattended, so the run takes its`,
      "declared default and records it instead of waiting on nobody. A question",
      "is the safe failure: anything this script cannot read lets the question through.",
      `Blocking client: a refusal exits ${BLOCKING_EXIT_CODE} with the rule on stderr.`,
    ],
    [
      "Reads outside repo state: the pending call's payload on stdin and the",
      "STAMITY_UNATTENDED and STAMITY_REPO_ROOT variables. Reads the run records'",
      "heads and the run-ended marker; writes nothing.",
    ],
  )}

${namedImport(["closeSync", "lstatSync", "openSync", "readFileSync", "readSync", "readdirSync", "statSync"], "node:fs")}
${namedImport(["isAbsolute", "join", "resolve", "sep", ...extra.path], "node:path")}
${extra.url}
const STATE_SEGMENTS = ${json([RUNS_SEGMENTS[0]])};
const RUNS_SEGMENTS = ${json(RUNS_SEGMENTS)};
const RECORD_FILE = ${json(RECORD_FILE)};
const RUN_ID = ${regex(RUN_ID_PATTERN)};
const STATUS = ${regex(RECORD_STATUS_PATTERN)};
const MODE = ${regex(RECORD_MODE_PATTERN)};
const BRANCH = ${regex(RECORD_BRANCH_PATTERN)};
const IN_PROGRESS = ${regex(IN_PROGRESS_PATTERN)};
const HEAD_LINES = ${RECORD_HEAD_LINES};
const HEAD_READ_BYTES = ${RECORD_HEAD_READ_BYTES};
const RUN_FOLDERS_MAX = ${GUARD_RUN_FOLDERS_MAX};
const GIT_MAX_BYTES = ${GIT_METADATA_MAX_BYTES};
const MARKER_SEGMENTS = ${json(RUN_ENDED_MARKER_FILE.split("/"))};
const MARKER_MAX_AGE_MS = ${RUN_ENDED_MAX_AGE_MS};
const ASK_TOOL = ${json(ASK_TOOL_NAME)};
const REASON = ${json(UNATTENDED_ASK_GATE_REASON)};
const RECORD_SOURCE = ${json(UNATTENDED_ASK_GATE_RECORD_SOURCE)};
const VARIABLE_SOURCE = ${json(UNATTENDED_ASK_GATE_VARIABLE_SOURCE)};
const FAULT_NOTE = ${json(UNATTENDED_ASK_GATE_FAULT_NOTE)};
const BLOCK_EXIT = ${BLOCKING_EXIT_CODE};

${resolveRepoRoot(layout)}
${RECORD_HEADS_SOURCE}
${String.raw`
/** A git metadata file's text, trimmed; null when absent, a link, not a file or past GIT_MAX_BYTES. */
function gitText(path) {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return null;
    throw error;
  }
  return stats.isFile() && stats.size <= GIT_MAX_BYTES ? readFileSync(path, "utf8").trim() : null;
}

`}${buildCardBranchSource()}
${String.raw`
/** The run id a fresh run-ended marker names; null when absent, a link, not a file, past GIT_MAX_BYTES, naming no run id, or its at unreadable, after now or past MARKER_MAX_AGE_MS. */
function endedRun(root) {
  const text = gitText(join(root, ...MARKER_SEGMENTS));
  if (text === null) return null;
  let marker = null;
  try {
    marker = JSON.parse(text);
  } catch {
    return null;
  }
  const run = marker?.run;
  const age = Date.now() - (typeof marker?.at === "string" ? Date.parse(marker.at) : Number.NaN);
  if (!(age >= 0 && age <= MARKER_MAX_AGE_MS)) return null;
  return typeof run === "string" && RUN_ID.test(run) ? run : null;
}

/** What says nobody is there to answer, as the refusal names it; null when a question may be put. */
function unattendedSource(root) {
  const heads = recordHeads(root);
  const running = heads.filter((head) => head.inProgress);
  // No order among records: a run id carries only the date, so two runs of one day would rank by slug.
  const unattendedRun = running.find((head) => head.mode === "unattended");
  if (unattendedRun !== undefined) return RECORD_SOURCE.replace("<record>", () => unattendedRun.path);
  if (running.some((head) => head.mode === "attended")) return null;
  const flag = (process.env.STAMITY_UNATTENDED ?? "").trim().toLowerCase();
  if (["", "false", "0"].includes(flag)) return null;
  // Claude Code's final round: no run in progress, and this branch's unattended run closed its record before asking,
  // its last run end's marker fresh: a later session on the branch, before its own record opens, has none in date.
  const closed = running.length === 0 ? heads.filter((head) => head.mode === "unattended" && head.branch !== null) : [];
  if (closed.length > 0) {
    const ended = endedRun(root);
    const branch = ended === null ? null : cardCurrentBranch(root);
    if (branch !== null && closed.some((head) => head.branch === branch && head.run === ended)) return null;
  }
  return VARIABLE_SOURCE;
}

/** The source of the refusal this call earns, or null when the call goes through. */
function decide() {
  const raw = readFileSync(0, "utf8");
  const payload = raw.trim() === "" ? null : JSON.parse(raw);
  if (payload === null || typeof payload !== "object" || payload.tool_name !== ASK_TOOL) return null;
  return unattendedSource(repoRoot());
}

let refusal = null;
try {
  refusal = decide();
} catch (error) {
  // Fail open: a question this gate could not decide is one it lets through, and one line says which read failed.
  const syntax = error instanceof SyntaxError;
  const read = syntax ? "the hook payload" : error && typeof error.path === "string" ? error.path : "an input";
  const cause = syntax ? "not JSON" : error && error.code ? String(error.code) : (error && error.name) || "a fault";
  const note = FAULT_NOTE.replace("<read>", () => read).replace("<cause>", () => cause);
  process.stderr.write(note.replace(/[\u0000-\u001f\u007f]/g, "?") + "\n");
  refusal = null;
}
if (refusal !== null) {
  process.stderr.write(REASON + refusal + "\n");
  process.exitCode = BLOCK_EXIT;
}
`}`;
}

/**
 * What the Cursor continue hook answers on `stop` (REQ-FLOW-109): `<m>` is the
 * count of units the record's last checkpoint line leaves, digits only, and
 * `<path>` the record's repo-relative path, built from its run folder's name.
 */
export const CURSOR_CONTINUE_FOLLOW_UP = "Continue the run: <m> units remain; the record is <path>.";

/** The one stderr line a read this hook could not finish writes: `<read>` names it, `<cause>` its error code. */
export const CURSOR_CONTINUE_FAULT_NOTE = "stamity cursor continue: <read> could not be read (<cause>), so the run is not continued.";

/**
 * A capacity stop's record line, `- <UTC> capacity: <role> <stop class> → BLOCKED_DEPENDENCY`, as `/st-work`'s
 * capacity rung (`content/commands/st-work.md`, Dispatch) and the cloud reference's pacing
 * (`content/skills/st-unattended/references/cloud.md`) write it at a limit. A line that resumed or waited is not one.
 */
export const CURSOR_CONTINUE_CAPACITY_STOP_PATTERN = /^\s*- +\S+ +capacity: .*(?:\u2192|->) *BLOCKED_DEPENDENCY\b/;

/**
 * The Cursor continue hook (REQ-FLOW-109): on Cursor's `stop`, keeps an
 * unattended run going on a Cursor agent machine by answering a
 * `followup_message`, which Cursor submits as the agent's next prompt.
 *
 * Like {@link buildUnattendedAskGate} it is NOT core: the Cursor adapter places
 * and wires it, on `stop` alone, under a fixed `loop_limit` that caps how many
 * follow-ups one conversation takes. It answers nothing unless
 * `CURSOR_AGENT_SOCKET` is set (not "", "false", "0"), the marker of a Cursor
 * agent machine, so a local session on a branch carrying such a record is never
 * steered. Then it reads every run record's head the way the ask gate does
 * ({@link RECORD_HEADS_SOURCE}), with no order among them; a record in
 * progress reading `Mode: unattended`, whose `Branch:` names the branch
 * `.git/HEAD` names, and whose last checkpoint line
 * ({@link RECORD_CHECKPOINT_PATTERN}, the whole record read when it is at most
 * {@link REPORT_READ_MAX_BYTES}) leaves a count of digits above 0 earns
 * {@link CURSOR_CONTINUE_FOLLOW_UP}, unless the newest capacity stop's line
 * ({@link CURSOR_CONTINUE_CAPACITY_STOP_PATTERN}) has at most one checkpoint
 * line after it, the stop's own (review/70): that run returned
 * BLOCKED_DEPENDENCY to wait for its limit's reset, and continuing it would
 * re-hit the limit; a second checkpoint line after it is a later session's. The message carries that count and a path
 * built from the folder's name, never text read from the record. The stop
 * payload's `status` must read `completed`, or be absent (a build that sends
 * none): an `aborted` or `error` stop, a person's or a failure's, ends there.
 *
 * Never a gate: a stop decides nothing, so anything else answers nothing, and a
 * read it cannot finish (a payload that is no JSON among them) answers nothing
 * with one stderr line naming that read. It always exits 0.
 */
export function buildCursorContinueScript(opts: { layout?: HookScriptLayout } = {}): string {
  const layout = opts.layout ?? "generated";
  const extra = repoRootImports(layout);
  const regex = (pattern: RegExp): string => `new RegExp(${json(pattern.source)}, ${json(pattern.flags)})`;
  return `${header(
    [
      "stamity — continue hook (Cursor).",
      "",
      "On stop, keeps an unattended run going on a Cursor agent machine: while a",
      "run in progress on this branch reads `Mode: unattended` and its last",
      "checkpoint line leaves units, it answers a followup_message naming the count",
      "and the record. Anything else, or a read it cannot finish, answers nothing.",
      "A stop whose status is aborted or error ends there. Never blocks; the hooks",
      "file caps the follow-ups at the row's loop_limit.",
    ],
    [
      "Reads outside repo state: the stop payload's status on stdin and the",
      "CURSOR_AGENT_SOCKET and STAMITY_REPO_ROOT variables. Reads the run records",
      "and .git/HEAD; writes nothing.",
    ],
  )}

${namedImport(["closeSync", "lstatSync", "openSync", "readFileSync", "readSync", "readdirSync", "statSync"], "node:fs")}
${namedImport(["isAbsolute", "join", "resolve", "sep", ...extra.path], "node:path")}
${extra.url}
const STATE_SEGMENTS = ${json([RUNS_SEGMENTS[0]])};
const RUNS_SEGMENTS = ${json(RUNS_SEGMENTS)};
const RECORD_FILE = ${json(RECORD_FILE)};
const RUN_ID = ${regex(RUN_ID_PATTERN)};
const STATUS = ${regex(RECORD_STATUS_PATTERN)};
const MODE = ${regex(RECORD_MODE_PATTERN)};
const BRANCH = ${regex(RECORD_BRANCH_PATTERN)};
const IN_PROGRESS = ${regex(IN_PROGRESS_PATTERN)};
const CHECKPOINT = ${regex(RECORD_CHECKPOINT_PATTERN)};
const CAPACITY_STOP = ${regex(CURSOR_CONTINUE_CAPACITY_STOP_PATTERN)};
const HEAD_LINES = ${RECORD_HEAD_LINES};
const HEAD_READ_BYTES = ${RECORD_HEAD_READ_BYTES};
const RECORD_MAX_BYTES = ${REPORT_READ_MAX_BYTES};
const RUN_FOLDERS_MAX = ${GUARD_RUN_FOLDERS_MAX};
const FOLLOW_UP = ${json(CURSOR_CONTINUE_FOLLOW_UP)};
const FAULT_NOTE = ${json(CURSOR_CONTINUE_FAULT_NOTE)};

${resolveRepoRoot(layout)}
${RECORD_HEADS_SOURCE}

${buildCardBranchSource()}
${String.raw`
/**
 * The units a record's last checkpoint line leaves, above 0; null when none is left, its count is not digits, no line
 * is there, or the newest capacity stop has at most one checkpoint line after it (its own: the run waits for a reset).
 */
function unitsLeft(path) {
  const stats = lstatSync(path);
  if (!stats.isFile()) return null;
  if (stats.size > RECORD_MAX_BYTES) throw Object.assign(new Error("record"), { code: "RECORD_TOO_LARGE", path });
  const fd = openSync(path, "r");
  let text = "";
  try {
    const buffer = Buffer.alloc(stats.size);
    text = buffer.toString("utf8", 0, readSync(fd, buffer, 0, buffer.length, 0));
  } finally {
    closeSync(fd);
  }
  let left = null;
  let sinceStop = null;
  for (const line of text.split(/\r?\n/)) {
    if (CAPACITY_STOP.test(line)) sinceStop = 0;
    const count = CHECKPOINT.exec(line)?.[1];
    if (count === undefined) continue;
    left = count;
    if (sinceStop !== null) sinceStop += 1;
  }
  if (sinceStop !== null && sinceStop <= 1) return null;
  return left !== null && /^[0-9]{1,9}$/.test(left) && Number(left) > 0 ? Number(left) : null;
}

/** The follow-up this stop earns, or null when the agent stops. */
function followUp() {
  // A Cursor agent machine only: a local session on a branch carrying such a record is never steered.
  if (["", "false", "0"].includes(process.env.CURSOR_AGENT_SOCKET ?? "")) return null;
  // A completed stop only, or one whose payload names no status: an aborted or failed one is not continued.
  const raw = readFileSync(0, "utf8");
  const status = raw.trim() === "" ? undefined : JSON.parse(raw)?.status;
  if (status !== undefined && status !== "completed") return null;
  const root = repoRoot();
  const branch = cardCurrentBranch(root);
  if (branch === null) return null;
  // No order among records: a run id carries only the date, so two runs of one day would rank by slug.
  for (const head of recordHeads(root)) {
    if (!head.inProgress || head.mode !== "unattended" || head.branch !== branch) continue;
    const left = unitsLeft(join(root, ...RUNS_SEGMENTS, head.run, RECORD_FILE));
    // Digits and the folder-built path only: no text read from the record reaches the agent's next prompt.
    if (left !== null) return FOLLOW_UP.replace("<m>", () => String(left)).replace("<path>", () => head.path);
  }
  return null;
}

let message = null;
try {
  message = followUp();
} catch (error) {
  // Never a gate: a read this hook could not finish stops the run here, and one line says which read failed.
  const syntax = error instanceof SyntaxError;
  const read = syntax ? "the hook payload" : error && typeof error.path === "string" ? error.path : "an input";
  const cause = syntax ? "not JSON" : error && error.code ? String(error.code) : (error && error.name) || "a fault";
  const note = FAULT_NOTE.replace("<read>", () => read).replace("<cause>", () => cause);
  process.stderr.write(note.replace(/[\u0000-\u001f\u007f]/g, "?") + "\n");
}
if (message !== null) process.stdout.write(JSON.stringify({ followup_message: message }) + "\n");
`}`;
}
