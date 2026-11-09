import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readTranscriptUsage, transcriptUsageFromText } from "../../src/runs/transcriptUsage.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * x-run-metrics (REQ-FLOW-183): the transcript reader takes token counts from a Claude Code JSONL and nothing else.
 * Nothing is mocked: the pure reader takes text, and the file reader a real file in a scratch directory.
 */

/** A message's text, which must never come back out of the reader in any field. */
const SECRET = "the person's private words, never to be printed";

interface UsageFields {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_creation?: unknown;
  speed?: unknown;
}

/** One assistant line as Claude Code writes it, the message's text included. */
const line = (id: string | undefined, model: string, usage: UsageFields): string =>
  JSON.stringify({
    type: "assistant",
    timestamp: "2026-11-09T14:16:27.970Z",
    message: { ...(id === undefined ? {} : { id }), model, role: "assistant", content: [{ type: "text", text: SECRET }], usage },
  });

const usage = (input: number, output: number, read: number, write: number, ttl: "5m" | "1h" = "1h"): UsageFields => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
  cache_creation: { ephemeral_5m_input_tokens: ttl === "5m" ? write : 0, ephemeral_1h_input_tokens: ttl === "1h" ? write : 0 },
});

describe("transcriptUsageFromText", () => {
  it("takes each message's largest counts once, however many lines repeat it", () => {
    // Claude Code writes a streamed message several times, its counts growing; summing the lines would count it twice.
    const text = [
      line("msg_a", "claude-opus-5-5", usage(2, 10, 100, 1000)),
      line("msg_a", "claude-opus-5-5", usage(2, 477, 100, 1000)),
      line("msg_b", "claude-opus-5-5", usage(5, 30, 200, 0)),
      JSON.stringify({ type: "user", message: { role: "user", content: SECRET } }),
    ].join("\n");

    const result = transcriptUsageFromText(text);

    expect(result.messages).toBe(2);
    expect(result.split).toEqual({ input: 7, output: 507, cacheRead: 300, cacheWrite5m: 0, cacheWrite1h: 1000 });
    expect(result.models).toEqual([{ model: "claude-opus-5-5", messages: 2, split: result.split }]);
  });

  it("keeps each model's counts apart, and splits cache writes by their duration", () => {
    const text = [
      line("msg_a", "claude-opus-5-5", usage(1, 2, 3, 40, "5m")),
      line("msg_b", "claude-fable-5-1", usage(10, 20, 30, 400, "1h")),
    ].join("\n");

    const result = transcriptUsageFromText(text);

    expect(result.models).toEqual([
      { model: "claude-fable-5-1", messages: 1, split: { input: 10, output: 20, cacheRead: 30, cacheWrite5m: 0, cacheWrite1h: 400 } },
      { model: "claude-opus-5-5", messages: 1, split: { input: 1, output: 2, cacheRead: 3, cacheWrite5m: 40, cacheWrite1h: 0 } },
    ]);
  });

  it("counts a cache write with no duration split as the 5-minute default", () => {
    const text = line("msg_a", "claude-opus-5-5", { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 50 });

    expect(transcriptUsageFromText(text).split).toEqual({ input: 1, output: 1, cacheRead: 0, cacheWrite5m: 50, cacheWrite1h: 0 });
  });

  it("counts a line with no message id as a message of its own", () => {
    const text = [line(undefined, "claude-opus-5-5", usage(1, 1, 0, 0)), line(undefined, "claude-opus-5-5", usage(1, 1, 0, 0))].join("\n");

    expect(transcriptUsageFromText(text)).toMatchObject({ messages: 2, split: { input: 2, output: 2 } });
  });

  it("counts lines that do not parse, and reads no count that is not a whole number", () => {
    const text = ["{not json", line("msg_a", "claude-opus-5-5", { input_tokens: -4, output_tokens: "9", cache_read_input_tokens: 1.5 }), ""].join("\n");

    const result = transcriptUsageFromText(text);

    expect(result.unreadableLines).toBe(1);
    expect(result.split).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 });
  });

  it("names a model id it will not print as unrecognised, and counts a message at another speed", () => {
    const text = [
      line("msg_a", `${SECRET}\u001b[31m`, usage(1, 1, 0, 0)),
      line("msg_b", "claude-opus-5-5", { ...usage(1, 1, 0, 0), speed: "fast" }),
    ].join("\n");

    const result = transcriptUsageFromText(text);

    expect(result.models.map((entry) => entry.model)).toEqual(["claude-opus-5-5", "unrecognised"]);
    expect(result.otherSpeed).toBe(1);
  });

  it("never returns a message's text", () => {
    const text = [line("msg_a", "claude-opus-5-5", usage(2, 477, 100, 1000)), line("msg_b", SECRET, usage(1, 1, 1, 1))].join("\n");

    expect(JSON.stringify(transcriptUsageFromText(text))).not.toContain("private words");
  });
});

describe("readTranscriptUsage", () => {
  const getRoot = useTempDir("transcript-usage");

  it("reads a transcript file's counts", () => {
    const path = join(getRoot().dir, "session.jsonl");
    writeFileSync(path, `${line("msg_a", "claude-opus-5-5", usage(3, 4, 5, 6))}\n`);

    expect(readTranscriptUsage(path)).toEqual({ ok: true, usage: transcriptUsageFromText(line("msg_a", "claude-opus-5-5", usage(3, 4, 5, 6))) });
  });

  it("names a missing file and a folder as not read, without a throw", () => {
    const folder = join(getRoot().dir, "folder.jsonl");
    mkdirSync(folder);

    expect(readTranscriptUsage(join(getRoot().dir, "absent.jsonl"))).toEqual({ ok: false, reason: "the transcript could not be read" });
    expect(readTranscriptUsage(folder)).toEqual({ ok: false, reason: "the transcript is not a file" });
  });
});
