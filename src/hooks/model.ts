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
 * shape — PascalCase event names, exit-0/2 semantics, structured stdout.
 * Adapters translate those inputs and decisions into each native contract,
 * including differing failure behavior and unsupported output fields, while
 * preserving this shared authoring schema.
 *
 * Guarantee strength is data here, not prose in a doc page: what a generated
 * setup actually enforces per client and what its documentation claims render
 * from {@link CLIENT_HOOK_GUARANTEES}, so the two cannot drift apart.
 */

/**
 * The six-intent core: lifecycle events present on every client. Blocking and
 * context injection remain event- and client-specific.
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
 * - `opt-in-fail-closed` — explicit denial blocks; opting in also denies hook errors/timeouts.
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
 * enforcement. Each row's notes qualify event support, timeout handling and
 * the absence of calling-agent identity in tool-call payloads.
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
      "Exit-2 denies supported tool calls after native /hooks trust. PreToolUse carries no agent identity, so the core role guard is telemetry; hosted tools and specialized paths may bypass hooks.",
  },
  {
    tool: "copilot",
    failMode: "fail-closed",
    blockingExitCode: 2,
    notes:
      "preToolUse exit 2, errors and JSON deny block. Timeouts always fail-open; other events are advisory unless documented. The identity-free core role guard is telemetry. sessionStart output reaches the session: it is injected as additionalContext (docs.github.com hooks reference, 2026-09-17).",
  },
  {
    tool: "cursor",
    failMode: "opt-in-fail-closed",
    blockingExitCode: 2,
    notes:
      "Exit 2 denies the action. failClosed opts supported events into denial on hook errors and timeouts; the identity-free core role guard remains telemetry.",
  },
];

/**
 * How a vendor page stands behind one cloud fact.
 *
 * - `documented`     — the cited page states it, read on the access date.
 * - `not documented` — the cited page, read on the access date, says nothing on
 *   it; the fact states the assumption this engine makes in its absence.
 * - `unverified`     — part of the fact rests on no page read on the access
 *   date (an earlier reading, or a question a review raised); the fact names
 *   which part.
 */
export type CloudFactStatus = "documented" | "not documented" | "unverified";

/** One dated fact about a client's vendor-hosted (cloud) session. */
export interface ClientCloudFact {
  readonly tool: Tool;
  /** A short label, unique within the client's rows. */
  readonly subject: string;
  readonly fact: string;
  readonly status: CloudFactStatus;
  /** The page the fact was read from, and when. */
  readonly citation: { url: string; accessDate: string };
  /**
   * The one-line summary the capability matrix's glance table shows for this
   * client. Exactly one row per client carries it.
   */
  readonly glance?: string;
  /**
   * The line the session-start hook prints for this fact in that client's cloud
   * session, when it prints one (REQ-FLOW-085). `test/emit/capabilityMatrix.test.ts`
   * holds the emitted script's lines equal to these, in this order, and holds
   * every row carrying one to `documented`: the session start never tells an
   * agent a guard is off, or how a hook loads, beyond what the cited page says
   * of the session it prints in.
   */
  readonly sessionStart?: string;
}

/**
 * What each client's vendor cloud runs of a repository's hooks, and what it
 * does not enforce there: the one table every other place that states a cloud
 * fact reads or cites. The capability matrix renders it as its cloud column and
 * section; `docs/customization.md` and `docs/troubleshooting.md` cite that
 * section; the session-start hook's cloud lines are held equal to the
 * `sessionStart` fields by test. Copilot's cloud model pick stays a dialect cap
 * of its adapter (`cloud-model`), which this table does not restate.
 *
 * Each row carries the page it was read from and the date. A page that says
 * nothing on a point is a `not documented` row stating the assumption made in
 * its absence, never a guess presented as the vendor's word.
 */
export const CLIENT_CLOUD_FACTS: readonly ClientCloudFact[] = [
  {
    tool: "claude",
    subject: "Project hooks",
    fact:
      "Claude Code on the web runs the hooks in the clone's `.claude/settings.json` in a session " +
      "with one repository. A session with several repositories loads no repository's hooks, and " +
      "user-level `~/.claude/settings.json` hooks stay on the operator's machine.",
    status: "documented",
    citation: { url: "https://code.claude.com/docs/en/cloud-environments", accessDate: "2026-10-15" },
    glance: "repository hooks run in a one-repository session; none with several repositories",
  },
  {
    tool: "claude",
    subject: "Session marker",
    fact: "`CLAUDE_CODE_REMOTE` is `true` in the session VM and never `true` locally.",
    status: "documented",
    citation: { url: "https://code.claude.com/docs/en/cloud-environments", accessDate: "2026-10-15" },
  },
  {
    tool: "claude",
    subject: "GitHub access",
    fact:
      "The GitHub proxy refuses GraphQL with a 403, so `gh pr`, `gh issue` and Projects v2 fail; " +
      "`gh api` over REST works.",
    status: "documented",
    citation: { url: "https://code.claude.com/docs/en/cloud-environments", accessDate: "2026-10-15" },
    sessionStart: "GraphQL, gh pr, gh issue and Projects are unavailable here; use gh api.",
  },
  {
    tool: "claude",
    subject: "Session state",
    fact:
      "A reclaimed VM is rebuilt fresh when the session reopens, so state the hooks wrote there, " +
      "the review gate's round counter included, does not carry over.",
    status: "documented",
    citation: { url: "https://code.claude.com/docs/en/cloud-environments", accessDate: "2026-10-15" },
    sessionStart: "The review-gate counter resets with the VM.",
  },
  {
    tool: "copilot",
    subject: "Project hooks",
    fact:
      "The cloud agent loads hooks from `.github/hooks/*.json` in the cloned repository, the only " +
      "hook configuration its sandbox holds by default, and honours only `bash` (or `command`) " +
      "entries. `sessionStart` fires once per job.",
    status: "documented",
    citation: { url: "https://docs.github.com/en/copilot/reference/hooks-reference", accessDate: "2026-10-15" },
    glance: "repository hooks run, loaded from the clone, only when on the default branch",
  },
  {
    tool: "copilot",
    subject: "Session marker",
    fact: "`COPILOT_AGENT_PROMPT` holds the prompt the cloud agent's job was invoked with.",
    status: "documented",
    citation: { url: "https://docs.github.com/en/copilot/reference/hooks-reference", accessDate: "2026-10-15" },
  },
  {
    tool: "copilot",
    subject: "Hook timeouts",
    fact: "A timed-out hook fails open on every event, `preToolUse` included.",
    status: "documented",
    citation: { url: "https://docs.github.com/en/copilot/reference/hooks-reference", accessDate: "2026-10-15" },
    sessionStart: "A preToolUse hook that times out fails open.",
  },
  {
    tool: "copilot",
    subject: "Ask decisions",
    fact: "A `preToolUse` decision of `ask` is treated as `deny`: no user is there to answer.",
    status: "documented",
    citation: { url: "https://docs.github.com/en/copilot/reference/hooks-reference", accessDate: "2026-10-15" },
    sessionStart: "An ask answer is read as deny.",
  },
  {
    tool: "copilot",
    subject: "Default branch",
    fact:
      "The cloud agent uses a hooks file only when it is present on the repository's default branch.",
    status: "documented",
    citation: {
      url: "https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/use-hooks",
      accessDate: "2026-10-15",
    },
    sessionStart: "Hooks run only when the hooks file is on the default branch; this clone's copy is the one loaded.",
  },
  {
    tool: "copilot",
    subject: "Tool arguments",
    fact:
      "`toolArgs` is typed `unknown`, and the page names no argument of `edit`, `create` or `view`. " +
      "The hook runner turns a `filePath` argument into `file_path`; if these tools name it `path` " +
      "(a question raised in review on 2026-10-14), an authored hook reading `file_path` finds none, " +
      "in the CLI and the cloud agent alike.",
    status: "unverified",
    citation: { url: "https://docs.github.com/en/copilot/reference/hooks-reference", accessDate: "2026-10-15" },
  },
  {
    tool: "cursor",
    subject: "Project hooks",
    fact:
      "Cursor's cloud agents run the command hooks in the repository's `.cursor/hooks.json`, except " +
      "`sessionStart`, `sessionEnd` and the MCP hooks; user-level hooks are not available there.",
    status: "documented",
    citation: { url: "https://cursor.com/docs/hooks", accessDate: "2026-10-15" },
    glance: "repository hooks run, without `sessionStart`, `sessionEnd` or the MCP hooks",
  },
  {
    tool: "cursor",
    subject: "Self-hosted workers",
    fact:
      "Pool and My Machines workers run the same command-based project hooks, and `sessionStart` and " +
      "`sessionEnd` fire when a session claims and releases the worker.",
    status: "documented",
    citation: { url: "https://cursor.com/docs/hooks", accessDate: "2026-10-15" },
  },
  {
    tool: "cursor",
    subject: "Session marker",
    fact:
      "`CURSOR_AGENT_SOCKET` marks a self-hosted worker's session, as the research behind " +
      "`docs/plans/020-cli-native-02.md` found on 2026-10-14; the self-hosted page names no such variable.",
    status: "unverified",
    citation: { url: "https://cursor.com/docs/cloud-agent/self-hosted", accessDate: "2026-10-15" },
  },
  {
    tool: "cursor",
    subject: "MCP hooks",
    fact:
      "`beforeMCPExecution` does not run in Cursor-hosted cloud agents. Whether it runs on a " +
      "self-hosted worker the page does not say, so the session start there claims nothing about it.",
    status: "unverified",
    citation: { url: "https://cursor.com/docs/hooks", accessDate: "2026-10-15" },
  },
  {
    tool: "cursor",
    subject: "Read-only turns",
    fact:
      "No hook runs during a cloud agent's early read-only turns, `subagentStart` included. The page " +
      "says so of cloud agents and not separately of self-hosted workers, so the session start there " +
      "claims nothing about it.",
    status: "unverified",
    citation: { url: "https://cursor.com/docs/hooks", accessDate: "2026-10-15" },
  },
  {
    tool: "codex",
    subject: "Project hooks",
    fact:
      "The Codex Cloud page documents no project hooks, so assume none run there: the task's " +
      "sandbox is the enforcement.",
    status: "not documented",
    citation: { url: "https://learn.chatgpt.com/docs/cloud", accessDate: "2026-10-15" },
    glance: "no project hooks documented; assume none run",
  },
  {
    tool: "codex",
    subject: "Cloud orchestration",
    fact:
      "The hooks page says command hooks and hooks from local configuration are not supported under " +
      "cloud orchestration (its Work Cloud section), and names no Codex Cloud behaviour.",
    status: "documented",
    citation: { url: "https://learn.chatgpt.com/docs/hooks", accessDate: "2026-10-15" },
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
 * Within that scope the shared work-review gate is currently wired only for
 * Claude. Other clients publish additional lifecycle events, including
 * Copilot's subagentStop; event availability alone does not establish the
 * verdict payload and decision behavior this review gate requires. Those
 * adapters retain the prompt-carried review ladder until that integration is
 * implemented and verified. This table does not claim those events are absent.
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

/**
 * The budget every core session-start row declares: the resume card and the
 * config-tamper notice, on all four clients, in a repository and in a plugin root.
 *
 * Thirty seconds is Copilot's documented default (docs.github.com/en/copilot/
 * reference/hooks-reference, accessed 2026-09-24), declared here so the other
 * clients stop inheriting their own: Claude Code's default is 600 s
 * (code.claude.com/docs/en/hooks-guide, Limitations, accessed 2026-09-01) and
 * Codex's is 600 s for most hooks (learn.chatgpt.com/docs/hooks, accessed
 * 2026-09-26), long enough for a hung disk read to hold a session's start for
 * ten minutes. Claude also wires the tamper notice on ConfigChange, from the
 * same row, so that entry carries the same budget.
 * Every client fails open on a timeout, so the budget bounds a wait and never
 * blocks a session.
 *
 * The pre-tool-use guard and the review gate declare NO timeout, on purpose. A
 * timed-out Claude Code PreToolUse hook does not block the call
 * (code.claude.com/docs/en/hooks, accessed 2026-09-24), so a budget on the guard
 * is a way to open it. The review gate's win32 worst case is about 34.6 s (the
 * `LOCK_CEILING_MS` derivation in `./scripts.ts`), over this budget, and a gate
 * that times out lets the completion through.
 */
export const HOOK_SESSION_START_TIMEOUT_MS = 30_000;
