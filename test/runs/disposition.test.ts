import { describe, expect, it } from "vitest";
import {
  isIsoDate,
  parseDisposition,
  SCHEDULE_RULE_FROM,
  vagueTrigger,
  VAGUE_TRIGGERS,
} from "../../src/runs/disposition.ts";

/**
 * The `retired` grammar (q9a-disposition, REQ-FLOW-076, REQ-FLOW-024): from the
 * cutover a retirement states how the deferral left — `fixed <ref>`,
 * `cut <reason>`, or `scheduled <place> · by <YYYY-MM-DD> | when <trigger>`.
 *
 * Pure functions over strings, so every case feeds them hand-built text; no
 * value here is copied from a committed ledger. Plan paths are text the grammar
 * never opens, so none of them needs to exist.
 */

/** The problem text of a refused value, or a marker that makes an accepted one fail the case. */
function problemOf(text: string): string {
  const result = parseDisposition(text);
  return result.ok ? "<accepted>" : result.problem;
}

describe("SCHEDULE_RULE_FROM and VAGUE_TRIGGERS", () => {
  it("cuts over on 2026-10-10 and lists the five vague triggers", () => {
    expect(SCHEDULE_RULE_FROM).toBe("2026-10-10");
    expect([...VAGUE_TRIGGERS]).toEqual(["later", "someday", "eventually", "tbd", "hygiene batch"]);
  });
});

describe("isIsoDate", () => {
  it.each(["2026-10-10", "2026-02-28", "2028-02-29", "2000-02-29", "2026-12-31", "2026-01-01"])(
    "accepts %s, a real calendar day",
    (text) => {
      expect(isIsoDate(text)).toBe(true);
    },
  );

  it.each([
    ["the 30th of February", "2026-02-30"],
    ["the 29th of February in a common year", "2026-02-29"],
    ["the 29th of February in a century year not divisible by 400", "1900-02-29"],
    ["a thirteenth month", "2026-13-01"],
    ["month zero", "2026-00-10"],
    ["day zero", "2026-10-00"],
    ["the 31st of a 30-day month", "2026-11-31"],
    ["a single-digit month", "2026-1-10"],
    ["a date with a trailing word", "2026-10-10 noon"],
    ["a date with surrounding space", " 2026-10-10"],
    ["an empty string", ""],
    ["a slash-spelled date", "2026/10/10"],
  ])("refuses %s", (_label, text) => {
    expect(isIsoDate(text)).toBe(false);
  });
});

describe("vagueTrigger", () => {
  it.each([
    ["later", "later"],
    ["  Later.  ", "later"],
    ["SOMEDAY!", "someday"],
    ["eventually...", "eventually"],
    ["TBD", "tbd"],
    ["(tbd)", "tbd"],
    ["hygiene batch", "hygiene batch"],
    ["the next hygiene batch", "hygiene batch"],
    ["the next Hygiene  Batch, maybe", "hygiene batch"],
  ])("names %j as the vague word %j", (trigger, word) => {
    expect(vagueTrigger(trigger)).toBe(word);
  });

  it.each(["touched", "the next client release", "later today's release ships", "plan 020 starts", ""])(
    "returns null for %j, which names no list word on its own",
    (trigger) => {
      expect(vagueTrigger(trigger)).toBeNull();
    },
  );
});

describe("parseDisposition", () => {
  it("accepts `fixed <ref>`, the ref kept as written", () => {
    expect(parseDisposition("fixed in 2026-10-10_x")).toEqual({
      ok: true,
      value: { kind: "fixed", ref: "in 2026-10-10_x" },
    });
    expect(parseDisposition("fixed by /st-quick")).toEqual({
      ok: true,
      value: { kind: "fixed", ref: "by /st-quick" },
    });
  });

  it("accepts `cut <reason>`, with or without the colon (D12)", () => {
    expect(parseDisposition("cut: out of scope")).toEqual({
      ok: true,
      value: { kind: "cut", reason: "out of scope" },
    });
    expect(parseDisposition("cut accepted risk: no exploit path")).toEqual({
      ok: true,
      value: { kind: "cut", reason: "accepted risk: no exploit path" },
    });
    expect(parseDisposition("fixed: in r2")).toEqual({ ok: true, value: { kind: "fixed", ref: "in r2" } });
  });

  it("accepts a scheduled plan unit with a date", () => {
    expect(parseDisposition("scheduled plan docs/plans/015-board-writes.md#b1-board-contract · by 2026-11-01")).toEqual({
      ok: true,
      value: {
        kind: "scheduled",
        place: { kind: "plan", path: "docs/plans/015-board-writes.md", anchor: "b1-board-contract" },
        due: { by: "2026-11-01" },
      },
    });
  });

  it("accepts a scheduled board item with a trigger", () => {
    expect(parseDisposition("scheduled board #42 · when touched")).toEqual({
      ok: true,
      value: { kind: "scheduled", place: { kind: "board", item: "#42" }, due: { when: "touched" } },
    });
  });

  it("accepts the colon spellings, a handoff place and a plan's follow-ups section", () => {
    expect(parseDisposition("scheduled: handoff .stamity/handoffs/2026-10-10_x.md · when: the next session opens")).toEqual({
      ok: true,
      value: {
        kind: "scheduled",
        place: { kind: "handoff", path: ".stamity/handoffs/2026-10-10_x.md" },
        due: { when: "the next session opens" },
      },
    });
    expect(parseDisposition("scheduled plan docs/plans/020-next.md#follow-ups · by: 2026-12-01")).toEqual({
      ok: true,
      value: {
        kind: "scheduled",
        place: { kind: "plan", path: "docs/plans/020-next.md", anchor: "follow-ups" },
        due: { by: "2026-12-01" },
      },
    });
  });

  it("splits a scheduled value at its last separator, so a board item may carry one", () => {
    expect(parseDisposition("scheduled board PROJ-7 · the release card · when the release branch is cut")).toEqual({
      ok: true,
      value: {
        kind: "scheduled",
        place: { kind: "board", item: "PROJ-7 · the release card" },
        due: { when: "the release branch is cut" },
      },
    });
  });

  it.each([
    ["`scheduled later`, no place and no date or trigger", "scheduled later", "names no ` · by <YYYY-MM-DD>` or ` · when <trigger>`"],
    ["a vague trigger on a real place", "scheduled plan docs/plans/020-next.md#u1 · when later", "vague trigger `later`"],
    ["a vague trigger on a place that is no plan path", "scheduled plan x.md#u1 · when later", "vague trigger `later`"],
    ["a date that is not a day", "scheduled board #42 · by 2026-02-30", "`by` names no real calendar day"],
    ["an unknown keyword", "moved somewhere", "opens with none of `fixed`, `cut` or `scheduled`"],
    ["`fixed` with no rest", "fixed", "`fixed` names no ref"],
    ["`fixed:` with no rest", "fixed:", "`fixed` names no ref"],
    ["`cut` with no rest", "cut  ", "`cut` names no reason"],
    ["a keyword glued to its rest", "cut:out of scope", "opens with none of `fixed`, `cut` or `scheduled`"],
    ["a keyword in another case", "Fixed in r2", "opens with none of `fixed`, `cut` or `scheduled`"],
    ["an empty value", "   ", "the disposition is empty"],
    ["`scheduled` with no rest", "scheduled", "`scheduled` names no place"],
    ["an empty trigger", "scheduled board #42 · when", "`when` names no trigger"],
    ["an empty trigger after a colon", "scheduled board #42 · when:   ", "`when` names no trigger"],
    ["a vague trigger padded with punctuation", "scheduled board #42 · when: Someday.", "vague trigger `someday`"],
    ["a hygiene-batch trigger", "scheduled board #42 · when the next hygiene batch runs", "vague trigger `hygiene batch`"],
    ["a due part that is neither by nor when", "scheduled board #42 · soon", "is neither `by <YYYY-MM-DD>` nor `when <trigger>`"],
    ["a date with a trailing word", "scheduled board #42 · by 2026-11-01 or so", "`by` names no real calendar day"],
    ["no place before the separator", "scheduled · by 2026-11-01", "names no place"],
    ["an unknown place kind", "scheduled lane L2 · by 2026-11-01", "the place is none of"],
    ["a plan place outside docs/plans", "scheduled plan notes/x.md#u1 · by 2026-11-01", "the place is none of"],
    ["a plan place with no anchor", "scheduled plan docs/plans/020-next.md · by 2026-11-01", "the place is none of"],
    ["a plan place in a nested folder", "scheduled plan docs/plans/a/b.md#u1 · by 2026-11-01", "the place is none of"],
    ["a handoff place that is no path", "scheduled handoff later · by 2026-11-01", "the place is none of"],
    ["a board place whose item is a vague word", "scheduled board tbd · by 2026-11-01", "the place is none of"],
    ["a board place with no item", "scheduled board · by 2026-11-01", "the place is none of"],
  ])("refuses %s, naming its problem", (_label, text, fragment) => {
    const result = parseDisposition(text);
    expect(result.ok).toBe(false);
    expect(problemOf(text)).toContain(fragment);
    // One line, so the refusal reads as the one `error:` line it lands in.
    expect(problemOf(text)).not.toMatch(/[\r\n]/u);
  });

  it("names both problems when the place and the due part are wrong together", () => {
    const problem = problemOf("scheduled plan x.md#u1 · when later");
    expect(problem).toContain("the place is none of");
    expect(problem).toContain("vague trigger `later`");
  });

  it("never quotes the caller's own words in a problem", () => {
    // The refusal lands in a terminal and a JSON document; only the grammar's
    // own words and the list word appear there, never the value itself.
    const words = ["zz-unique-place", "zz-unique-trigger", "zz-unique-keyword"];
    for (const text of [
      `zz-unique-keyword ${words[0]}`,
      `scheduled lane ${words[0]} · by 2026-13-01`,
      `scheduled board #1 · ${words[1]}`,
    ]) {
      const problem = problemOf(text);
      for (const word of words) expect(problem).not.toContain(word);
    }
  });
});
