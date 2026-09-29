import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { parseThresholds } from "../../scripts/replay/score.mjs";

/**
 * REPLAY-v3 as committed (plan 012, unit v3-protocol). The protocol keeps REPLAY-v2's floor: the
 * one `replay-thresholds` block, the four invocation messages and the section numbers are v2's,
 * byte for byte, and REPLAY-v1 and REPLAY-v2 stay frozen beside it. §8's invalid-run sentence
 * names every forbidden term, `patches-seeded` included.
 */

const REPO = resolve(import.meta.dirname, "../..");
// Read inside each case, not at module load: a missing file then fails these cases by name
// instead of every case in this file.
const read = (name: string): string => readFileSync(join(REPO, "evals/replay", name), "utf8");
const v3 = (): string => read("REPLAY-v3.md");
const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** The sha256 of each frozen protocol, as REPLAY-v2's and REPLAY-v1's committed results record them. */
const FROZEN: [string, string][] = [
  ["REPLAY-v1.md", "fdee42b110b189de40318960a85baa20b43a25e933313eb42d1f0aba61fdaa11"],
  ["REPLAY-v2.md", "3040f58a86817266ed57c10cceb62d8358acfed2a43a6932b4c243a42e046973"],
];

/** The raw text of a protocol's `replay-thresholds` fences, every one of them. */
const thresholdBlocks = (t: string): string[] => [...t.matchAll(/^```replay-thresholds\n([\s\S]*?)\n```$/gm)].map((m) => m[1]!);

/** A protocol's §6 from its first message to the next section: the four fenced messages with their counts and digests. */
const messages = (t: string): string => t.slice(t.indexOf("**Start message**"), t.indexOf("## §7 "));

/** The four messages as v2 prints them: label, bytes, and the sha256 v2 records for them. */
const MESSAGES: [string, string, string][] = [
  [
    "Start message",
    "/st-work docs/plans/001-replay.md --effort deep\n\nUnattended run: no operator will answer. At every question, execute its declared default (plan gate: execute now). At the QA checkpoint, emit the what-to-verify summary and record the human sign-off as not performed. Do not open a pull request.",
    "b693f87303116d90879d32b9b15decf56ef18f0a5dd125873070e2fb06edf663",
  ],
  ["Resume message", "Continue the /st-work run from where it stopped.", "5c8e00fbc08eae1925524b31103de39e13f7bcbbf5e1a24db4e155f7e1dcd4dc"],
  ["Nudge", "This run is unattended; no reply will come. Apply the declared default and continue the /st-work run.", "cf500a657233bca8721439ad93189fc242573d8e6a995955aeada846c89c20a1"],
  ["Capacity resume", "The usage limit has reset. Continue the /st-work run from where it stopped.", "578284f96aa5a14323dcc0fdd907939e626f582fb7b737701df269b491f8db99"],
];

const fold = (s: string): string => s.replace(/\s+/g, " ");

/** A protocol's numbered section headings, in order. */
const headings = (t: string): string[] => [...t.matchAll(/^## (§\d+ .*)$/gm)].map((m) => m[1]!);

describe("REPLAY-v3 as committed (plan 012 v3-protocol)", () => {
  it("(a) its one replay-thresholds block is REPLAY-v2's byte for byte, and deep-equals REPLAY-v1's and REPLAY-v2's", () => {
    const text = v3();
    const blocks = thresholdBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks).toEqual(thresholdBlocks(read("REPLAY-v2.md")));
    const parsed = parseThresholds(text) as Record<string, unknown>;
    expect(parsed).toEqual(parseThresholds(read("REPLAY-v2.md")));
    expect(parsed).toEqual(parseThresholds(read("REPLAY-v1.md")));
  });

  it.each(FROZEN)("(b) %s is frozen: its bytes hash to the recorded sha256", (name, digest) => {
    expect(sha256(readFileSync(join(REPO, "evals/replay", name)))).toBe(digest);
  });

  it("(c) §8's invalid-run sentence names every forbidden term, patches-seeded included", () => {
    const text = v3();
    const section8 = fold(text.slice(text.indexOf("## §8 Metrics"), text.indexOf("## §9 Matcher")));
    const sentence = section8.match(/\*\*Invalid run\.\*\*(.*?)(?= - \*\*|$)/)?.[1] ?? "";
    expect(sentence, "§8 has no **Invalid run.** bullet").toContain("in any tool input");
    for (const term of ["seeds.json", "__oracle__", "reference-fixes", "patches-seeded"]) {
      expect(sentence, `§8's invalid-run sentence omits ${term}`).toContain(`\`${term}\``);
    }
  });

  it("(d) §6 is REPLAY-v2's byte for byte, and each message hashes to v2's recorded value", () => {
    const text = v3();
    const section = messages(text);
    expect(section).toBe(messages(read("REPLAY-v2.md")));
    for (const [label, bytes, digest] of MESSAGES) {
      const at = section.indexOf(`**${label}**`);
      expect(at, `§6 has no **${label}** paragraph`).toBeGreaterThan(-1);
      const fenced = section.slice(at, section.indexOf("```\n", section.indexOf("```text\n", at) + 8) + 4);
      expect(fenced).toContain(`\`\`\`text\n${bytes}\n\`\`\``);
      expect(sha256(Buffer.from(bytes, "utf8"))).toBe(digest);
      expect(fenced).toMatch(new RegExp(`${Buffer.byteLength(bytes, "utf8")} bytes\\.\\s+sha256\\s+\`${digest}\``));
    }
  });

  it("keeps REPLAY-v2's section headings, so a rule is found in the same place", () => {
    expect(headings(v3())).toEqual(headings(read("REPLAY-v2.md")));
  });

  it("cites functions, never line numbers, for the replay's scripts the other units move", () => {
    expect(v3()).not.toMatch(/\b(?:fixture|measure|findings|transcript|score|compare|protocols|oracle|summary|replay|markers|marker-hook)\.m?[jt]s:\d/);
  });
});
