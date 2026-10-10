import { describe, expect, it } from "vitest";
import {
  dayTrigger,
  FILLER_WORDS,
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
 * never opens, so none of them needs to exist, and none names a tracked file:
 * the test-input guard reads a tracked path literal as a read this file declares.
 */

/** What a day in the trigger's slot is refused with (review/89): it names `by` as the place for a day. */
const WHEN_DAY = "`when` names a day and no event; a day goes under `by <YYYY-MM-DD>`";

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

describe("FILLER_WORDS", () => {
  it("pins the words that add no event to a vague one", () => {
    expect([...FILLER_WORDS]).toEqual([
      "a",
      "an",
      "the",
      "on",
      "in",
      "at",
      "for",
      "to",
      "of",
      "or",
      "and",
      "maybe",
      "perhaps",
      "probably",
      "some",
      "point",
      "time",
      "day",
      "much",
      "bit",
      "not",
      "yet",
      "until",
      "till",
      "then",
      "now",
      "just",
    ]);
  });

  it("holds no word the product's own triggers use, and no vague word", () => {
    // `when touched` and `when next attended close` are the triggers the inbox
    // and the handoff write; a filler word among them would refuse those.
    const fillers: readonly string[] = FILLER_WORDS;
    for (const word of ["touched", "next", "attended", "close", "release"]) expect(fillers).not.toContain(word);
    for (const vague of VAGUE_TRIGGERS) for (const word of vague.split(" ")) expect(fillers).not.toContain(word);
    for (const word of fillers) expect(word).toMatch(/^[a-z]+$/u);
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

// review/89: a day in the trigger's slot names no event, and only `by` is read as a day, so a
// value scheduled on one would never come back.
// review/99: the rule is the simple one, with no word list. No `YYYY-MM-DD`-shaped day stands
// in a trigger at all, alone or among other words.
describe("dayTrigger", () => {
  it.each([
    "2026-11-15",
    "  2026-11-15  ",
    "`2026-11-15`.",
    "(2026-11-15)",
    "2026-02-30",
    "on 2026-11-15",
    "until the 2026-11-15, maybe",
    "later, 2026-11-15",
    "2026-11-15 or 2026-11-20",
    // review/99: the day beside a word outside both lists, and the day with a time.
    "by 2026-11-15",
    "before 2026-11-15",
    "2026-11-15 09:00",
    "2026-11-15T09:00Z",
    // TEST CHANGE, justified (2026-10-10, review/99): these three stood below as no day, under
    // review/89's first rule, "a word outside both lists beside the date leaves a trigger". That
    // rule let `by 2026-11-15` through, which never comes back on its day either. The rule is now
    // that no day stands in a trigger; the event is named without it, or the day goes under `by`.
    // The third is a run id, which opens with a day and is read as one.
    "the 2026-11-15 release ships",
    "the first close after 2026-11-15",
    "2026-11-15_next-tier closes",
  ])("reads %j as holding a day", (trigger) => {
    expect(dayTrigger(trigger)).toBe(true);
  });

  it.each(["touched", "the 1.14.0 release", "plan 020 starts", "later", "", "—"])(
    "reads %j as holding no day: no `YYYY-MM-DD` run stands in it",
    (trigger) => {
      expect(dayTrigger(trigger)).toBe(false);
    },
  );
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

  // review/15: a trigger whose every word is a vague or a filler word, one of
  // them vague, names no event either, however it is padded or quoted.
  it.each([
    ["later on", "later"],
    ["maybe later", "later"],
    ["`later`", "later"],
    ["Later — maybe", "later"],
    ["not until LATER, probably", "later"],
    ["at some point, eventually", "eventually"],
    ["tbd/later", "tbd"],
    ["some day or someday", "someday"],
    ["in the hygiene-batch", "hygiene batch"],
  ])("names %j, only vague and filler words, as the vague word %j", (trigger, word) => {
    expect(vagueTrigger(trigger)).toBe(word);
  });

  it.each(["next attended close", "later, when the release ships", "the hygiene of the batch", "—", "?!"])(
    "returns null for %j: a word outside both lists, or no word at all",
    (trigger) => {
      expect(vagueTrigger(trigger)).toBeNull();
    },
  );

  // TEST CHANGE, justified (2026-10-10, review/44): `maybe` and `not yet` were
  // pinned above as null, under review/15's "at least one of them vague"
  // clause. That clause is withdrawn: a trigger whose every word is a filler
  // word names no event either, so a row scheduled on one would never come
  // back. It is named by its filler words, each once and as the list spells
  // them, never by the caller's spelling.
  it.each([
    ["maybe", "maybe"],
    ["not yet", "not yet"],
    ["at some point", "at some point"],
    ["Not yet.", "not yet"],
    ["`Just` — NOW", "just now"],
    ["a, A; a", "a"],
    ["until then, or not until then", "until then or not"],
  ])("names %j, filler words alone, by those words: %j", (trigger, words) => {
    expect(vagueTrigger(trigger)).toBe(words);
  });

  it.each(["touched", "next attended close", "at the next release", "not until plan 020 starts"])(
    "still returns null for %j, whose filler words sit beside a word that names an event",
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
    expect(parseDisposition("scheduled plan docs/plans/990-example.md#b1-board-contract · by 2026-11-01")).toEqual({
      ok: true,
      value: {
        kind: "scheduled",
        place: { kind: "plan", path: "docs/plans/990-example.md", anchor: "b1-board-contract" },
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
    // review/15: a trigger of vague and filler words only.
    ["a vague trigger with a filler word after it", "scheduled board #42 · when later on", "vague trigger `later`"],
    ["a vague trigger with a filler word before it", "scheduled board #42 · when: maybe later", "vague trigger `later`"],
    ["a vague trigger in backticks", "scheduled board #42 · when `later`", "vague trigger `later`"],
    ["a vague trigger among several filler words", "scheduled board #42 · when not until some point, eventually", "vague trigger `eventually`"],
    ["a board place whose item is vague and filler words", "scheduled board the later · by 2026-11-01", "the place is none of"],
    // review/16: a `fixed` ref and a `cut` reason of vague and filler words only.
    ["`fixed` with a vague word for a ref", "fixed later", "`fixed` names only the vague word `later`"],
    ["`fixed:` with a vague word for a ref", "fixed: tbd", "`fixed` names only the vague word `tbd`"],
    ["`fixed` with a vague word in backticks", "fixed `later`", "`fixed` names only the vague word `later`"],
    ["`fixed` in the hygiene batch, no run named", "fixed in the hygiene batch", "`fixed` names only the vague word `hygiene batch`"],
    ["`cut` with a vague word for a reason", "cut someday", "`cut` names only the vague word `someday`"],
    ["`cut:` with a vague word for a reason", "cut: tbd", "`cut` names only the vague word `tbd`"],
    ["`cut` with vague and filler words for a reason", "cut: maybe later, or not", "`cut` names only the vague word `later`"],
    // review/44: filler words alone, in each of the three free-text slots.
    ["a trigger of filler words alone", "scheduled board #42 · when at some point", "vague trigger `at some point`"],
    ["a one-word filler trigger after a colon", "scheduled board #42 · when: maybe", "vague trigger `maybe`"],
    ["`fixed` with filler words for a ref", "fixed just now", "`fixed` names only filler words (`just now`)"],
    ["`fixed:` with one filler word for a ref", "fixed: Now.", "`fixed` names only filler words (`now`)"],
    ["`cut` with filler words for a reason", "cut not yet", "`cut` names only filler words (`not yet`)"],
    ["`cut:` with filler words for a reason", "cut: not now", "`cut` names only filler words (`not now`)"],
    // review/17: the zero-word rows, a slot holding no letter and no digit.
    ["a dash-only trigger", "scheduled board #42 · when —", "`when` names no trigger"],
    ["a hyphen-only trigger after a colon", "scheduled board #42 · when: -", "`when` names no trigger"],
    ["a punctuation-only trigger", "scheduled board #42 · when ?!...", "`when` names no trigger"],
    ["a symbol-only trigger", "scheduled board #42 · when ~ + = ` $", "`when` names no trigger"],
    ["a dash-only board item", "scheduled board — · by 2026-11-01", "the place is none of"],
    // review/89: a day in the trigger's slot, alone or beside filler and vague words only.
    ["a day for a trigger", "scheduled board #42 · when 2026-11-15", WHEN_DAY],
    ["a day for a trigger after a colon", "scheduled board #42 · when: 2026-11-15", WHEN_DAY],
    ["a day that is no real one for a trigger", "scheduled board #42 · when 2026-02-30", WHEN_DAY],
    ["a day in backticks for a trigger", "scheduled board #42 · when `2026-11-15`.", WHEN_DAY],
    ["a day beside filler words for a trigger", "scheduled board #42 · when on the 2026-11-15", WHEN_DAY],
    ["a day beside a vague word for a trigger", "scheduled board #42 · when later, 2026-11-15", WHEN_DAY],
    // review/99: no day stands in the trigger's slot at all, whatever stands beside it.
    ["a day after `by` for a trigger", "scheduled board #42 · when by 2026-11-15", WHEN_DAY],
    ["a day after `before` for a trigger", "scheduled board #42 · when: before 2026-11-15", WHEN_DAY],
    ["a day with a time for a trigger", "scheduled board #42 · when 2026-11-15 09:00", WHEN_DAY],
    // TEST CHANGE, justified (2026-10-10, review/99): these two stood among the accepted values
    // below, as "a date among words that name an event is a trigger still". No day stands in the
    // trigger's slot now, so they moved here.
    ["an event named with its day for a trigger", "scheduled board #42 · when the 2026-11-15 release ships", WHEN_DAY],
    ["an event after a day for a trigger", "scheduled board #42 · when the first close after 2026-11-15", WHEN_DAY],
    ["a symbol-only board item", "scheduled board # · when touched", "the place is none of"],
    ["a lone dot as a handoff place", "scheduled handoff . · by 2026-11-01", "the place is none of"],
    ["a lone slash as a handoff place", "scheduled handoff / · by 2026-11-01", "the place is none of"],
    ["dots and slashes as a handoff place", "scheduled handoff ../.. · by 2026-11-01", "the place is none of"],
    ["a dash-only ref", "fixed —", "`fixed` names no ref"],
    ["a punctuation-only ref", "fixed: ...", "`fixed` names no ref"],
    ["a hyphen-only reason", "cut -", "`cut` names no reason"],
    ["a punctuation-only reason", "cut: ?!", "`cut` names no reason"],
    // review/47: a board item is held to the rule the trigger is, filler words alone included.
    ["a board place whose item is one filler word", "scheduled board now · by 2026-11-01", "the place is none of"],
    ["a board place whose item is filler words alone", "scheduled board at some point · when touched", "the place is none of"],
    ["a board place whose filler item is re-cased and quoted", "scheduled board `Not Yet.` · by 2026-11-01", "the place is none of"],
    // review/51: in `cut accepted risk: <reason>` the reason is held to the rule alone.
    ["an accepted risk whose reason is a vague word", "cut accepted risk: tbd", "`cut accepted risk:` names only the vague word `tbd`"],
    ["an accepted risk whose reason is vague and filler words", "cut: accepted risk: maybe later", "`cut accepted risk:` names only the vague word `later`"],
    ["an accepted risk whose reason is filler words alone", "cut accepted risk: not yet", "`cut accepted risk:` names only filler words (`not yet`)"],
    ["an accepted risk with no reason", "cut accepted risk:", "`cut accepted risk:` names no reason"],
    ["an accepted risk whose reason holds no letter or digit", "cut accepted risk: —", "`cut accepted risk:` names no reason"],
    ["an accepted risk re-cased, a dash where the colon stands", "cut Accepted Risk — TBD", "`cut accepted risk:` names only the vague word `tbd`"],
    ["an accepted risk with no colon before a vague word", "cut accepted risk someday", "`cut accepted risk:` names only the vague word `someday`"],
  ])("refuses %s, naming its problem", (_label, text, fragment) => {
    const result = parseDisposition(text);
    expect(result.ok).toBe(false);
    expect(problemOf(text)).toContain(fragment);
    // One line, so the refusal reads as the one `error:` line it lands in.
    expect(problemOf(text)).not.toMatch(/[\r\n]/u);
  });

  it.each([
    "fixed in r2",
    "fixed by /st-quick",
    "fixed later in r2",
    "fixed in the hygiene batch of 2026-10-08",
    "fixed 7",
    "cut: out of scope",
    "cut accepted risk: no exploit path",
    "cut: later is fine, the flag is off",
    // TEST CHANGE, justified (2026-10-10, review/44): `cut: not now` stood here
    // as accepted, "filler words alone name no vague word". The rule now
    // refuses a slot whose every word is vague or filler, so that value moved
    // to the refusals above; these hold a filler word beside a real one.
    "cut: not in scope",
    "fixed just now in r2",
    "fixed in 2026-10-10_x",
    "scheduled board #42 · when touched",
    "scheduled board #42 · when next attended close",
    "scheduled board #42 · when later today's release ships",
    "scheduled board 7 · when: the next client release",
    "scheduled handoff notes.md · by 2026-11-01",
    // review/47: a board item with a digit, or a filler word beside a real one.
    "scheduled board #42 · by 2026-11-01",
    "scheduled board 7 · by 2026-11-01",
    "scheduled board PROJ-7 · by 2026-11-01",
    "scheduled board the release card · by 2026-11-01",
    "scheduled board Now and Next, card 3 · when touched",
    // review/51: an accepted risk whose reason names a word outside both lists.
    "cut accepted risk: later is fine, the flag is off",
    "cut accepted risk: one caller, behind a flag",
    "cut: accepted risk: not in scope for now",
    "cut accepted risks are low",
  ])("still accepts %j, which names a word outside both lists", (text) => {
    expect(parseDisposition(text).ok, problemOf(text)).toBe(true);
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

  it("names the list word, never the caller's spelling of it, when a ref or a reason is vague", () => {
    for (const text of ["fixed LATER, Maybe", "cut: Perhaps  SOMEDAY"]) {
      const problem = problemOf(text);
      expect(problem).toMatch(/names only the vague word `(later|someday)`/u);
      for (const written of ["LATER", "Maybe", "Perhaps", "SOMEDAY"]) expect(problem).not.toContain(written);
    }
  });

  it("keeps an accepted risk's reason as written, marker included, and never quotes it in a problem", () => {
    // review/51: the value's shape does not move; only what is refused does.
    expect(parseDisposition("cut accepted risk: one caller, behind a flag")).toEqual({
      ok: true,
      value: { kind: "cut", reason: "accepted risk: one caller, behind a flag" },
    });
    const problem = problemOf(`cut Accepted RISK: ${"Not YET, ".repeat(40)}`);
    expect(problem).toContain("`cut accepted risk:` names only filler words (`not yet`)");
    expect(problem).not.toMatch(/Accepted|RISK|Not|YET/u);
  });

  it("names filler words as the list spells them, each once, never the caller's spelling or count", () => {
    // review/44: the filler words a refusal names come from the closed list,
    // so a padded or re-cased value cannot grow or shape the problem line.
    const padded = `cut: ${"Not YET, ".repeat(40)}`;
    expect(problemOf(padded)).toContain("`cut` names only filler words (`not yet`)");
    expect(problemOf(padded)).not.toMatch(/Not|YET/u);
    expect(problemOf("fixed: Maybe… MAYBE")).toContain("`fixed` names only filler words (`maybe`)");
    expect(problemOf(`scheduled board #1 · when ${"Some Day ".repeat(40)}`)).toContain("vague trigger `some day`");
  });
});
