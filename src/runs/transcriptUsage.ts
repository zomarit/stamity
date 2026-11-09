import { closeSync, fstatSync, openSync, readFileSync } from "node:fs";

/**
 * The token counts in a Claude Code session transcript, for `stamity run metrics --transcript` (REQ-FLOW-183).
 *
 * **Numbers only.** A transcript holds the whole conversation, so this reader takes from each line only
 * `message.id`, `message.model` and the counts under `message.usage`, and returns only numbers and model ids. A model
 * id is kept only where it reads as one ({@link MODEL_ID}); any other value is `unrecognised`, so no text the
 * transcript holds can come back out through it.
 *
 * **Each message once.** Claude Code writes a streamed message on several lines, its counts growing, so each count is
 * the largest any line of that message id carries, never their sum. A line with no id counts as a message of its own.
 * A cache write with no duration split counts as the 5-minute default.
 *
 * **Never throws.** A file it cannot read, one that is not a file, or one over {@link TRANSCRIPT_READ_MAX_BYTES} is a
 * named reason; a line that does not parse is counted, not fatal.
 */

/** One set of token counts. */
export interface TokenSplit {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite5m: number;
  readonly cacheWrite1h: number;
}

/** One model's messages and counts. */
interface ModelUsage {
  readonly model: string;
  readonly messages: number;
  readonly split: TokenSplit;
}

/** What a transcript says of its token use. */
export interface TranscriptUsage {
  /** Messages that carried usage, each id once. */
  readonly messages: number;
  readonly split: TokenSplit;
  /** By model id, sorted. */
  readonly models: readonly ModelUsage[];
  /** Messages whose `usage.speed` names a speed other than `standard`, which the price table does not cover. */
  readonly otherSpeed: number;
  /** Non-blank lines that are not JSON. */
  readonly unreadableLines: number;
}

export type TranscriptRead = { readonly ok: true; readonly usage: TranscriptUsage } | { readonly ok: false; readonly reason: string };

/** The most of a transcript read; a longer one is named, never read in part. */
const TRANSCRIPT_READ_MAX_BYTES = 256 * 1_048_576;

/** A model id this reader will return; any other value reads as {@link UNRECOGNISED}. */
const MODEL_ID = /^[a-z0-9][a-z0-9.:@/[\]-]{0,99}$/;
const UNRECOGNISED = "unrecognised";

const FIELDS = ["input", "output", "cacheRead", "cacheWrite5m", "cacheWrite1h"] as const;

const ZERO: TokenSplit = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };

interface Message {
  model: string;
  split: TokenSplit;
  otherSpeed: boolean;
}

/** A count as written: a non-negative whole number, else none. */
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** One line's counts, from its `usage` object alone. */
function splitOf(usage: Record<string, unknown>): TokenSplit {
  const ttl = record(usage["cache_creation"]);
  const five = count(ttl?.["ephemeral_5m_input_tokens"]);
  const hour = count(ttl?.["ephemeral_1h_input_tokens"]);
  const split = five !== null || hour !== null;
  return {
    input: count(usage["input_tokens"]) ?? 0,
    output: count(usage["output_tokens"]) ?? 0,
    cacheRead: count(usage["cache_read_input_tokens"]) ?? 0,
    cacheWrite5m: split ? (five ?? 0) : (count(usage["cache_creation_input_tokens"]) ?? 0),
    cacheWrite1h: hour ?? 0,
  };
}

const larger = (a: TokenSplit, b: TokenSplit): TokenSplit =>
  Object.fromEntries(FIELDS.map((field) => [field, Math.max(a[field], b[field])])) as unknown as TokenSplit;

const added = (a: TokenSplit, b: TokenSplit): TokenSplit =>
  Object.fromEntries(FIELDS.map((field) => [field, a[field] + b[field]])) as unknown as TokenSplit;

/** A transcript's text read into its counts. Pure. */
export function transcriptUsageFromText(text: string): TranscriptUsage {
  const messages = new Map<string, Message>();
  let unreadableLines = 0;
  for (const [index, raw] of text.split("\n").entries()) {
    if (raw.trim() === "") continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch (cause) {
      // A line that does not parse is counted; its cause would carry transcript text, so it is dropped.
      void cause;
      unreadableLines += 1;
      continue;
    }
    const message = record(record(value)?.["message"]);
    const usage = record(message?.["usage"]);
    if (message === null || usage === null) continue;
    const id = message["id"];
    const key = typeof id === "string" && id !== "" ? `id:${id}` : `line:${index}`;
    const model = typeof message["model"] === "string" && MODEL_ID.test(message["model"]) ? message["model"] : UNRECOGNISED;
    const speed = usage["speed"];
    const otherSpeed = speed !== undefined && speed !== null && speed !== "standard";
    const seen = messages.get(key);
    const split = splitOf(usage);
    messages.set(key, {
      model: seen === undefined || model !== UNRECOGNISED ? model : seen.model,
      split: seen === undefined ? split : larger(seen.split, split),
      otherSpeed: otherSpeed || (seen?.otherSpeed ?? false),
    });
  }
  const byModel = new Map<string, { messages: number; split: TokenSplit }>();
  for (const message of messages.values()) {
    const held = byModel.get(message.model) ?? { messages: 0, split: ZERO };
    byModel.set(message.model, { messages: held.messages + 1, split: added(held.split, message.split) });
  }
  const all = [...messages.values()];
  return {
    messages: all.length,
    split: all.reduce((sum, message) => added(sum, message.split), ZERO),
    models: [...byModel.entries()].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([model, held]) => ({ model, messages: held.messages, split: held.split })),
    otherSpeed: all.filter((message) => message.otherSpeed).length,
    unreadableLines,
  };
}

/** A transcript file read into its counts, or why it was not read. Never throws. */
export function readTranscriptUsage(path: string): TranscriptRead {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return { ok: false, reason: "the transcript could not be read" };
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) return { ok: false, reason: "the transcript is not a file" };
    if (stat.size > TRANSCRIPT_READ_MAX_BYTES) return { ok: false, reason: `the transcript is over ${TRANSCRIPT_READ_MAX_BYTES} bytes` };
    return { ok: true, usage: transcriptUsageFromText(readFileSync(fd, "utf8")) };
  } catch {
    return { ok: false, reason: "the transcript could not be read" };
  } finally {
    try {
      closeSync(fd);
    } catch {
      // The counts are already read; a close that fails changes none of them.
    }
  }
}
