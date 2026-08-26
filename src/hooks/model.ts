import type { Tool } from "../types/core.ts";

/**
 * The portable hook vocabulary — the single source every adapter, doc page,
 * and user-hook reader derives from.
 *
 * Two facts shape it. First, only six lifecycle intents exist on every target
 * client, so those six are the canonical set an artifact may declare; richer
 * per-client events are extensions that cannot be promised across the matrix
 * and never enter this list — the ones a consumer outside the declaring adapter
 * reads are carried by {@link CLIENT_EXTENSION_EVENTS}, which is scoped to
 * exactly that and says so. Second, the interchange schema is one client's
 * shape — PascalCase event names, exit-0/2 semantics, structured stdout —
 * because the others either copy it verbatim or reach it by a mechanical
 * rename, so emission needs no second schema.
 *
 * Guarantee strength is data here, not prose in a doc page: what a generated
 * setup actually enforces per client and what its documentation claims render
 * from {@link CLIENT_HOOK_GUARANTEES}, so the two cannot drift apart.
 */

/**
 * The six-intent core: the only lifecycle set enforceable on every client.
 * Canonical ids are snake_case; the wire names live in
 * {@link CLAUDE_EVENT_NAMES}.
 */
export const CANONICAL_HOOK_EVENTS = [
  "session_start",
  "pre_tool_use",
  "post_tool_use",
  "user_prompt_submit",
  "stop",
  "session_end",
] as const;

export type CanonicalHookEvent = (typeof CANONICAL_HOOK_EVENTS)[number];

/**
 * Canonical id -> interchange event name. The mapping is snake_case to
 * PascalCase and bijective, so a config read back off disk maps home without
 * ambiguity.
 *
 * Spelled out rather than computed from the id: these strings are a wire
 * contract with the target clients, and a string-manipulation helper would let
 * a future canonical rename silently change what gets emitted.
 */
export const CLAUDE_EVENT_NAMES: Record<CanonicalHookEvent, string> = {
  session_start: "SessionStart",
  pre_tool_use: "PreToolUse",
  post_tool_use: "PostToolUse",
  user_prompt_submit: "UserPromptSubmit",
  stop: "Stop",
  session_end: "SessionEnd",
};

const CANONICAL_HOOK_EVENT_SET: ReadonlySet<string> = new Set(CANONICAL_HOOK_EVENTS);

/** Narrow an arbitrary string to a canonical event. Wire names do not pass. */
export function isCanonicalHookEvent(v: string): v is CanonicalHookEvent {
  return CANONICAL_HOOK_EVENT_SET.has(v);
}

/**
 * How strongly a client honours a hook that rejects the pending action.
 *
 * - `fail-closed`        — a rejecting hook blocks the action.
 * - `opt-in-fail-closed` — advisory unless the hook declares it wants to block.
 * - `fail-open`          — the action proceeds regardless; the hook observes.
 */
export type HookFailMode = "fail-closed" | "fail-open" | "opt-in-fail-closed";

/** One client's honest blocking strength. Rendered into docs and adapters. */
export interface ClientHookGuarantee {
  tool: Tool;
  failMode: HookFailMode;
  /** Exit status that blocks the pending action; `null` when blocking is impossible. */
  blockingExitCode: number | null;
  /** What an operator gets, and does not get, from a hook on this client. */
  notes: string;
}

/**
 * Exactly one row per target tool, ordered strongest guarantee first so a
 * rendered table reads as a ladder.
 *
 * A portable gate documents per-client strength; it never claims uniform
 * enforcement. That honesty is the point of the table: a hook written once is
 * a gate on two of these clients, an opt-in gate on a third, and telemetry on
 * the fourth.
 */
export const CLIENT_HOOK_GUARANTEES: readonly ClientHookGuarantee[] = [
  {
    tool: "claude",
    failMode: "fail-closed",
    blockingExitCode: 2,
    notes:
      "Exit 2 blocks the pending action and returns stderr to the agent; exit 0 with structured stdout feeds the session instead.",
  },
  {
    tool: "codex",
    failMode: "fail-closed",
    blockingExitCode: 2,
    notes:
      "Adopts the interchange shape verbatim, exit-2 blocking included; emission is a config-dialect transform, not a semantic one.",
  },
  {
    tool: "cursor",
    failMode: "opt-in-fail-closed",
    blockingExitCode: 2,
    notes:
      "Advisory by default — a rejecting hook is logged and the action proceeds. Blocking requires opting the hook into fail-closed where it is declared.",
  },
  {
    tool: "copilot",
    failMode: "fail-open",
    blockingExitCode: null,
    notes:
      "Never blocks: a hook that rejects, errors, or times out is reported and the action proceeds, so treat a hook here as telemetry and put the gate in a permission rule.",
  },
];

/**
 * One event a single client fires and the portable vocabulary deliberately
 * does not carry.
 *
 * `portable` is the literal `false`, not a boolean: the type itself refuses a
 * row that claims portability, so widening the enforceable set stays a decision
 * taken in {@link CANONICAL_HOOK_EVENTS} rather than one that arrives through
 * an extension row.
 */
export interface ClientExtensionEvent {
  readonly tool: Tool;
  /** The client's own wire name, e.g. `SubagentStop`. */
  readonly event: string;
  readonly portable: false;
  /** What the clients that cannot fire it get instead. */
  readonly note: string;
  /** Where the trigger and the exit-status effect were read. */
  readonly citation: { url: string; accessDate: string };
}

/**
 * The non-portable events an adapter wires OFF THIS TABLE, one row each.
 *
 * The table exists for the same reason {@link CLIENT_HOOK_GUARANTEES} does:
 * what a client actually enforces is data, not a sentence in a doc page. Each
 * row's `note` names what the OTHER clients get, and the answer is always the
 * prose twin — a ladder an agent follows — never a gate an adapter claims and
 * cannot fire.
 *
 * SCOPE, stated because the obvious wider reading is false. This is not every
 * non-portable event the engine wires. An adapter may declare client-specific
 * events of its own next to the scripts that are their only consumer, and one
 * does: `CURSOR_GUARD_EVENTS` in `src/adapters/cursor.ts` wires `subagentStart`
 * and `beforeMCPExecution`, both `failClosed: true`, and neither appears here.
 * A row lands in this table when something outside the declaring adapter has to
 * read it — the claude review gate derives its event pair from these rows — so
 * the table's job is shared vocabulary, not a census.
 *
 * Within that scope one tool holds every row today, which is a fact about the
 * clients rather than an incompleteness: no other target client publishes a
 * configuration-change, task-completion or subagent-stop event, so a row for
 * one would be a promise nothing keeps. It is not a claim that the other
 * clients fire no extension events at all — see the cursor pointer above.
 */
export const CLIENT_EXTENSION_EVENTS: readonly ClientExtensionEvent[] = [
  {
    tool: "claude",
    event: "ConfigChange",
    portable: false,
    note: "Fires the configuration-change notice per change. Every other client runs the same script on session start instead, where it reads as drift guidance rather than as an alert.",
    citation: { url: "https://code.claude.com/docs/en/hooks", accessDate: "2026-08-17" },
  },
  {
    tool: "claude",
    event: "TaskCompleted",
    portable: false,
    note: "Carries the work-scoped review gate's blocking decision: exit 2 prevents the task from being marked completed, and the client shows the message to the operator rather than to the model. Elsewhere work's review ladder is prose the agent follows, and no adapter claims a gate it cannot fire.",
    citation: { url: "https://code.claude.com/docs/en/hooks", accessDate: "2026-08-17" },
  },
  {
    tool: "claude",
    event: "SubagentStop",
    portable: false,
    note: "Carries the review gate's round counter — a finishing sub-agent is what the counter counts, and the payload's `last_assistant_message` is where a finishing reviewer's verdict travels, since no documented field carries one. It never blocks: exit 2 here would hold the sub-agent open with a message only the operator sees, which is neither this gate's decision nor a signal the loop could act on. Elsewhere the round accounting stays prompt-carried.",
    citation: { url: "https://code.claude.com/docs/en/hooks", accessDate: "2026-08-17" },
  },
];

/**
 * One hook in the portable form every producer and consumer speaks: user-hook
 * files parse into it, adapters emit from it.
 *
 * `matcher` narrows which invocation the hook attaches to and is meaningful
 * only on events that carry a subject (the tool-use pair); its per-event
 * semantics belong to emission, not to this schema. `timeoutMs` is a request —
 * a client that cannot honour it proceeds without one, which is exactly the
 * kind of gap {@link CLIENT_HOOK_GUARANTEES} keeps visible.
 */
export interface HookInterchange {
  event: CanonicalHookEvent;
  matcher?: string;
  /** Exec form: argv, never a shell line. A shell string is rejected at ingress. */
  command: readonly string[];
  timeoutMs?: number;
}
