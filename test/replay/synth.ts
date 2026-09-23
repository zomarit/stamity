import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Builders of synthetic Claude Code transcripts and replay capture directories.
 *
 * Shared by the replay instrument's suites (the transcript walk here; the findings matcher, the
 * per-run measurement and the scorer read it too). Every builder returns the exact JSONL line a
 * 2.1.28x client writes for that entry — the fields the walk reads, in the shapes read from real
 * session transcripts — so a suite drives the instrument with lines, never with a mock of it.
 *
 * Ids and timestamps are deterministic unless a caller passes its own: a `messageId` is
 * `msg_synth_<n>` from a module counter, and every timestamp defaults to one fixed instant.
 */

const DEFAULT_TS = "2026-09-23T10:00:00.000Z";
const DEFAULT_MODEL = "claude-opus-5-5";

let sequence = 0;
const nextId = (prefix: string): string => `${prefix}_synth_${++sequence}`;

export interface LineOptions {
  timestamp?: string;
  uuid?: string;
  sidechain?: boolean;
}

interface Usage {
  input?: number;
  cacheCreation?: number;
  cacheRead?: number;
  output?: number;
  thinking?: number;
}

export interface AssistantOptions extends LineOptions {
  /** The API message id; lines sharing one id are one request. */
  messageId?: string;
  model?: string;
  usage?: Usage;
  stopReason?: string | null;
  /** A synthetic API-error stub (`isApiErrorMessage`), which the walk excludes from every class. */
  apiError?: boolean;
}

type Json = Record<string, unknown>;

function envelope(type: string, opts: LineOptions | undefined, body: Json): string {
  return JSON.stringify({
    parentUuid: null,
    isSidechain: opts?.sidechain ?? false,
    type,
    uuid: opts?.uuid ?? nextId("uuid"),
    timestamp: opts?.timestamp ?? DEFAULT_TS,
    ...body,
  });
}

function usageOf(u: Usage | undefined): Json {
  return {
    input_tokens: u?.input ?? 1,
    cache_creation_input_tokens: u?.cacheCreation ?? 0,
    cache_read_input_tokens: u?.cacheRead ?? 0,
    output_tokens: u?.output ?? 1,
    output_tokens_details: { thinking_tokens: u?.thinking ?? 0 },
  };
}

function assistant(content: Json[], opts: AssistantOptions | undefined): string {
  const body: Json = {
    message: {
      id: opts?.messageId ?? nextId("msg"),
      type: "message",
      role: "assistant",
      model: opts?.model ?? DEFAULT_MODEL,
      content,
      stop_reason: opts?.stopReason === undefined ? "tool_use" : opts.stopReason,
      usage: usageOf(opts?.usage),
    },
  };
  if (opts?.apiError) {
    body["isApiErrorMessage"] = true;
    body["error"] = "rate_limit";
  }
  return envelope("assistant", opts, body);
}

function toolUse(name: string, id: string, input: Json, opts: AssistantOptions | undefined): string {
  return assistant([{ type: "tool_use", id, name, input }], opts);
}

export interface NotificationSpec {
  taskId: string;
  toolUseId: string;
  result: string;
  status?: string;
  /** Defaults to `Agent "<taskId>" finished`, the client's agent summary shape. */
  summary?: string;
  subagentTokens?: number;
  toolUses?: number;
  durationMs?: number;
  /** `user` (the default): a user entry whose content is the notification alone. `queued`: a queued-command attachment. */
  via?: "user" | "queued";
  /** Queued only: `false` writes the attachment without `rendered`, so it never reaches the model. */
  rendered?: boolean;
}

/** The `<task-notification>` block, in the tag order the client writes. */
function notificationText(n: NotificationSpec): string {
  return [
    "<task-notification>",
    `<task-id>${n.taskId}</task-id>`,
    `<tool-use-id>${n.toolUseId}</tool-use-id>`,
    `<status>${n.status ?? "completed"}</status>`,
    `<summary>${n.summary ?? `Agent "${n.taskId}" finished`}</summary>`,
    `<result>${n.result}</result>`,
    `<usage><subagent_tokens>${n.subagentTokens ?? 1000}</subagent_tokens><tool_uses>${n.toolUses ?? 3}</tool_uses><duration_ms>${n.durationMs ?? 5000}</duration_ms></usage>`,
    "</task-notification>",
  ].join("\n");
}

/** The system-reminder the client wraps a queued notification in. */
const QUEUED_WRAPPER = "<system-reminder>\n[SYSTEM NOTIFICATION - NOT USER INPUT]\n\n";

export const mainLine = {
  userText(text: string, opts?: LineOptions): string {
    return envelope("user", opts, { message: { role: "user", content: text } });
  },

  taskNotification(n: NotificationSpec, opts?: LineOptions): string {
    const text = notificationText(n);
    if ((n.via ?? "user") === "user") {
      return envelope("user", opts, { origin: { kind: "task-notification" }, message: { role: "user", content: text } });
    }
    const body: Json = { attachment: { type: "queued_command", commandMode: "task-notification", prompt: text } };
    if (n.rendered !== false) body["rendered"] = [{ content: `${QUEUED_WRAPPER}${text}\n</system-reminder>` }];
    return envelope("attachment", opts, body);
  },

  toolResult(toolUseId: string, content: string | Json[], opts?: LineOptions & { isError?: boolean }): string {
    const block: Json = { type: "tool_result", tool_use_id: toolUseId, content };
    if (opts?.isError) block["is_error"] = true;
    return envelope("user", opts, { message: { role: "user", content: [block] } });
  },

  assistantText(text: string, opts?: AssistantOptions): string {
    return assistant([{ type: "text", text }], { stopReason: "end_turn", ...opts });
  },

  agentToolUse(
    spec: { id: string; subagentType: string; description: string; prompt: string; model?: string; background?: boolean },
    opts?: AssistantOptions,
  ): string {
    const input: Json = { description: spec.description, prompt: spec.prompt, subagent_type: spec.subagentType };
    if (spec.model !== undefined) input["model"] = spec.model;
    if (spec.background !== undefined) input["run_in_background"] = spec.background;
    return toolUse("Agent", spec.id, input, opts);
  },

  sendMessage(spec: { id: string; to: string; message: string; summary?: string }, opts?: AssistantOptions): string {
    return toolUse("SendMessage", spec.id, { to: spec.to, message: spec.message, summary: spec.summary ?? "" }, opts);
  },

  bashToolUse(spec: { id: string; command: string; description?: string; background?: boolean }, opts?: AssistantOptions): string {
    const input: Json = { command: spec.command, description: spec.description ?? "" };
    if (spec.background !== undefined) input["run_in_background"] = spec.background;
    return toolUse("Bash", spec.id, input, opts);
  },

  readToolUse(spec: { id: string; filePath: string }, opts?: AssistantOptions): string {
    return toolUse("Read", spec.id, { file_path: spec.filePath }, opts);
  },

  compactBoundary(
    spec: { trigger: "manual" | "auto"; preTokens: number; postTokens?: number; durationMs?: number },
    opts?: LineOptions,
  ): string {
    return envelope("system", opts, {
      subtype: "compact_boundary",
      content: "Conversation compacted",
      level: "info",
      compactMetadata: {
        trigger: spec.trigger,
        preTokens: spec.preTokens,
        postTokens: spec.postTokens ?? 30_000,
        durationMs: spec.durationMs ?? 60_000,
      },
    });
  },

  /** A generic attachment; `rendered: null` writes it without `rendered` (never sent to the model). */
  attachment(spec: { type: string; rendered: string | null }, opts?: LineOptions): string {
    const body: Json = { attachment: { type: spec.type } };
    if (spec.rendered !== null) body["rendered"] = [{ content: spec.rendered }];
    return envelope("attachment", opts, body);
  },
};

interface SubagentRequest {
  id: string;
  model?: string;
  usage: Usage;
  text?: string;
  /** Lines the client writes for this one request; every line carries the same `message.id`. */
  lines?: number;
}

export interface SubagentSpec {
  agentId: string;
  agentType: string;
  prompt: string;
  requestedModel?: string;
  description?: string;
  toolUseId?: string;
  requests: SubagentRequest[];
}

export interface SubagentFile {
  agentId: string;
  lines: string[];
  meta: Json;
}

/**
 * One sub-agent transcript plus its `.meta.json`. A request written over several lines repeats
 * its `message.id`; the earlier lines carry a partial output count, the last the final usage, the
 * way a streamed response lands in the file.
 */
export function subagentFile(spec: SubagentSpec): SubagentFile {
  const sidechain = { sidechain: true };
  const lines = [mainLine.userText(spec.prompt, sidechain)];
  for (const request of spec.requests) {
    const count = request.lines ?? 1;
    for (let index = 0; index < count; index++) {
      const last = index === count - 1;
      const usage = last ? request.usage : { ...request.usage, output: 1, thinking: 0 };
      const text = request.text ?? `step ${request.id}`;
      lines.push(
        mainLine.assistantText(last ? text : text.slice(0, 1), {
          ...sidechain,
          messageId: request.id,
          model: request.model ?? DEFAULT_MODEL,
          usage,
          stopReason: last ? "end_turn" : null,
        }),
      );
    }
  }
  const meta: Json = { agentType: spec.agentType, description: spec.description ?? "" };
  if (spec.requestedModel !== undefined) meta["model"] = spec.requestedModel;
  if (spec.toolUseId !== undefined) meta["toolUseId"] = spec.toolUseId;
  return { agentId: spec.agentId, lines, meta };
}

interface RunStateSpec {
  runId: string;
  record?: string;
  ledger?: Json[];
  reports?: Record<string, string>;
}

export interface CaptureSpec {
  /** Merged over `{ end: { reason: "complete" } }` into `run.json`. */
  run?: Json;
  session?: string;
  transcript: string[];
  subagents?: SubagentFile[];
  stdin?: string[];
  stdout?: string[];
  stderr?: string;
  markers?: Json[];
  /** pass → worktree basename → repo-relative POSIX path → file content. */
  snapshots?: Record<string, Record<string, Record<string, string>>>;
  /** `compaction-<n>-pre` or `end` → the fixture's run folder at that moment. */
  state?: Record<string, RunStateSpec>;
  finalDiff?: string;
  oracle?: Json;
}

export interface CaptureLayout {
  runDir: string;
  runJson: string;
  captures: string;
  transcript: string;
  subagentsDir: string;
  markers: string;
  snapshots: string;
  state: string;
  finalDiff: string;
  oracle: string;
}

const jsonl = (lines: string[]): string => (lines.length ? `${lines.join("\n")}\n` : "");

function put(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/**
 * The whole run-directory layout of the replay's contract census: `run.json` beside `captures/`,
 * and under `captures/` the driver's stdin/stdout/stderr, the marker log, the main transcript and
 * its sub-agent files, the per-pass snapshots, the fixture run-state copies, the final tree diff and
 * the oracle results. Every file is written even when empty, so a reader can rely on its presence.
 */
export function writeCapture(dir: string, spec: CaptureSpec): CaptureLayout {
  const session = spec.session ?? "synth-session";
  const captures = join(dir, "captures");
  const layout: CaptureLayout = {
    runDir: dir,
    runJson: join(dir, "run.json"),
    captures,
    transcript: join(captures, "transcript", `${session}.jsonl`),
    subagentsDir: join(captures, "transcript", session, "subagents"),
    markers: join(captures, "markers.jsonl"),
    snapshots: join(captures, "snapshots"),
    state: join(captures, "state"),
    finalDiff: join(captures, "final", "tree.diff"),
    oracle: join(captures, "oracle.json"),
  };
  put(layout.runJson, `${JSON.stringify({ end: { reason: "complete" }, ...spec.run }, null, 2)}\n`);
  put(join(captures, "stdin.jsonl"), jsonl(spec.stdin ?? []));
  put(join(captures, "stdout.jsonl"), jsonl(spec.stdout ?? []));
  put(join(captures, "stderr.txt"), spec.stderr ?? "");
  put(layout.markers, jsonl((spec.markers ?? []).map((marker) => JSON.stringify(marker))));
  put(layout.transcript, jsonl(spec.transcript));
  mkdirSync(layout.subagentsDir, { recursive: true });
  for (const agent of spec.subagents ?? []) {
    put(join(layout.subagentsDir, `agent-${agent.agentId}.jsonl`), jsonl(agent.lines));
    put(join(layout.subagentsDir, `agent-${agent.agentId}.meta.json`), JSON.stringify(agent.meta));
  }
  mkdirSync(layout.snapshots, { recursive: true });
  for (const [pass, worktrees] of Object.entries(spec.snapshots ?? {})) {
    for (const [worktree, files] of Object.entries(worktrees)) {
      for (const [relPath, content] of Object.entries(files)) put(join(layout.snapshots, pass, worktree, relPath), content);
    }
  }
  mkdirSync(layout.state, { recursive: true });
  for (const [name, runState] of Object.entries(spec.state ?? {})) {
    const runFolder = join(layout.state, name, "runs", runState.runId);
    put(join(runFolder, "record.md"), runState.record ?? "");
    put(join(runFolder, "ledger.jsonl"), jsonl((runState.ledger ?? []).map((row) => JSON.stringify(row))));
    mkdirSync(join(runFolder, "reports"), { recursive: true });
    for (const [file, content] of Object.entries(runState.reports ?? {})) put(join(runFolder, "reports", file), content);
  }
  put(layout.finalDiff, spec.finalDiff ?? "");
  put(layout.oracle, `${JSON.stringify(spec.oracle ?? { schema: "stamity/replay-oracle/v1", results: [] }, null, 2)}\n`);
  return layout;
}
