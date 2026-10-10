import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDisposition } from "../../src/runs/disposition.ts";
import {
  ALWAYS_SHOW_TAGS,
  INBOX_PATH,
  locationPaths,
  matchInbox,
  parseInbox,
  SCHEDULE_RULE_HEADING,
  type InboxRow,
} from "../../src/runs/inboxStore.ts";

/**
 * The deferral inbox's reader (q1a-inbox-store, REQ-FLOW-068, REQ-FLOW-075;
 * q9b-inbox-schedule-grammar, REQ-FLOW-076): the row grammar, the schedule
 * rule's section, and the query `stamity ledger inbox` answers.
 *
 * Pure functions over strings, so the cases feed them hand-built rows; no
 * fixture copies a real inbox row. The one read of this repository's own inbox
 * holds the committed file to the parser, as the records gate does.
 */

/** Repo root, resolved from this file rather than from the process cwd. */
const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

/**
 * Tracked paths the cases name, built at run time: written as literals they would make this file a
 * declared reader of those files (`test/ci/testInputsGuard.test.ts`), and nothing here opens them.
 */
const README = ["README", "md"].join(".");
const GETTING_STARTED = ["docs", "getting-started.md"].join("/");
const PLUGINS_DOC = ["docs", "plugins.md"].join("/");

/** A parsed row with the fields a case does not care about filled in. */
function row(line: number, location: string, extra: Partial<InboxRow> = {}): InboxRow {
  return {
    line,
    severity: "Minor",
    location,
    description: `finding ${line}`,
    source: "/st-work",
    ref: null,
    tag: null,
    by: null,
    when: null,
    files: [],
    deferredOn: null,
    rationale: null,
    belowRule: false,
    ...extra,
  };
}

/** The schedule fields of a row that carries none: what every row written before the rule parses to. */
const UNSCHEDULED = { by: null, when: null, files: [], deferredOn: null, rationale: null, belowRule: false } as const;

/** `<line>:<matchedBy>` for every matched row, in order: the whole answer in one comparable value. */
function answer(rows: readonly InboxRow[], query: Parameters<typeof matchInbox>[1]): string[] {
  return matchInbox(rows, query).matched.map((match) => `${match.row.line}:${match.matchedBy}`);
}

describe("parseInbox", () => {
  it("parses this repository's inbox with no problem, one row per bullet", () => {
    expect(INBOX_PATH).toBe(".stamity/inbox.md");
    const text = readFileSync(resolve(REPO_ROOT, ".stamity/inbox.md"), "utf8");
    const bullets = text.split("\n").filter((line) => line.startsWith("- ")).length;

    const parsed = parseInbox(text);

    expect(bullets).toBeGreaterThan(0);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toHaveLength(bullets);
    // The schedule rule's heading (D28) is there once, so a close has a section to append under,
    // and every row below it is read as one the rule binds.
    const lines = text.split("\n");
    const heading = lines.indexOf(SCHEDULE_RULE_HEADING);
    expect(lines.filter((line) => line === SCHEDULE_RULE_HEADING)).toHaveLength(1);
    for (const parsedRow of parsed.rows) expect(parsedRow.belowRule).toBe(parsedRow.line > heading + 1);
  });

  it("reads every field of a full row, and the line it sits on", () => {
    const text = [
      "# Deferral inbox",
      "",
      "- Critical · src/a.ts:9 · the consequence · split · source: rework main · Ref: r.jsonl#a/1 · critical-deferred",
      "- Minor · — · d · source: rework main · Ref: .stamity/runs/x/record.md",
    ].join("\n");

    const parsed = parseInbox(text);

    expect(parsed.problems).toEqual([]);
    // TEST CHANGE, justified (2026-10-10, q9b-inbox-schedule-grammar): a parsed row gained the
    // schedule rule's six fields (`by`, `when`, `files`, `deferredOn`, `rationale`, `belowRule`),
    // so this whole-row pin names them. The seven fields it pinned before read as they did: a
    // row carrying no schedule field parses to the empty values.
    expect(parsed.rows).toEqual([
      {
        line: 3,
        severity: "Critical",
        location: "src/a.ts:9",
        description: "the consequence · split",
        source: "rework main",
        ref: "r.jsonl#a/1",
        tag: "critical-deferred",
        ...UNSCHEDULED,
      },
      {
        line: 4,
        severity: "Minor",
        location: "—",
        description: "d",
        source: "rework main",
        ref: ".stamity/runs/x/record.md",
        tag: null,
        ...UNSCHEDULED,
      },
    ]);
  });

  it.each([
    ["- Trivial · — · d · source: /st-work", "severity `Trivial` is outside Critical, Warning, Minor, Info"],
    ["- Minor · — · d", "no `source: <writer>` field"],
    ["- Minor · source: /st-work", "`source:` arrives before severity, location and description are all present"],
    ["- Minor ·  · d · source: /st-work", "the location field is a `file:line` or `—`, never empty"],
    ["- Minor · — ·   · source: /st-work", "the description field is empty"],
    ["- Minor · — · d · source: ", "`source:` names no writer"],
    ["- Minor · — · d · source: /st-work · Ref: ", "`Ref: ` is neither `<path>` nor `<path>#<anchor>`"],
    ["- Minor · — · d · source: /st-work · Ref: r.jsonl#", "`Ref: r.jsonl#` is neither `<path>` nor `<path>#<anchor>`"],
    [
      "- Minor · — · d · source: /st-work · Ref: .stamity/runs/x/ledger.jsonl",
      "`Ref: .stamity/runs/x/ledger.jsonl` names a ledger, which is addressable only as `<path>#<row id>`",
    ],
    ["- Minor · — · d · source: /st-work · two words", "trailing field(s) beyond one optional tag word — two words"],
    ["- Minor · — · d · source: /st-work · a#1 · b", "trailing field(s) beyond one optional tag word — a#1 · b"],
  ])("refuses %j with the gate's message and no path prefix", (bullet, message) => {
    const parsed = parseInbox(`intro\n${bullet}`);
    expect(parsed.rows).toEqual([]);
    expect(parsed.problems).toEqual([{ line: 2, message }]);
  });

  // qa/6: a `Ref:` straight after `source:` is in its place however much space stands before it;
  // the fields after it are read trimmed, and so is this one. It was refused as out of place.
  it("reads a Ref: with more than one space before it as the field in its place", () => {
    const parsed = parseInbox(
      [
        "- Minor · — · d · source: x ·  Ref: r.jsonl#a/1 · by: 2026-11-01",
        "- Minor · — · d · source: x ·   Ref: .stamity/runs/x/ledger.jsonl",
      ].join("\n"),
    );

    expect(parsed.rows).toMatchObject([{ line: 1, ref: "r.jsonl#a/1", by: "2026-11-01" }]);
    // Its value is still held to the `Ref:` grammar, and named as written.
    expect(parsed.problems).toEqual([
      {
        line: 2,
        message: "`Ref: .stamity/runs/x/ledger.jsonl` names a ledger, which is addressable only as `<path>#<row id>`",
      },
    ]);
  });

  // review/98: `source:` is found however much space stands before it, as `Ref:` is (qa/6). It
  // was refused as a row with no `source:` field, and a writer was sent looking for one.
  it("reads a source: with more than one space before it as the row's source field", () => {
    const parsed = parseInbox(
      ["- Minor · src/a.ts:1 · d ·  source: /st-work · Ref: r.jsonl#a/1", "- Minor · src/a.ts:1 · d ·   source: "].join("\n"),
    );

    expect(parsed.rows).toMatchObject([{ line: 1, description: "d", source: "/st-work", ref: "r.jsonl#a/1" }]);
    // The field is found, so what it lacks is named.
    expect(parsed.problems).toEqual([{ line: 2, message: "`source:` names no writer" }]);
  });

  it("ignores prose, headings, blanks and indented bullets, and keeps parsing past a bad bullet", () => {
    const text = "# Deferral inbox\n\nRows: 3.\n  - indented\n- Minor · — · d\n- Warning · a.ts:1 · d · source: x";
    const parsed = parseInbox(text);
    expect(parsed.problems.map((problem) => problem.line)).toEqual([5]);
    expect(parsed.rows.map((parsedRow) => parsedRow.line)).toEqual([6]);
  });
});

/** The first problem `parseInbox` names for one bullet standing below the rule's heading, or "". */
function ruled(bullet: string): string {
  const parsed = parseInbox([SCHEDULE_RULE_HEADING, "", `- ${bullet}`].join("\n"));
  expect(parsed.rows.length + parsed.problems.length).toBe(1);
  expect(parsed.problems.every((problem) => problem.line === 3)).toBe(true);
  return parsed.problems[0]?.message ?? "";
}

/** What a day under `when:` is refused with (review/89): it names `by:` as the place for a day. */
const WHEN_DAY = "`when:` names a day and no event; a day goes under `by: <YYYY-MM-DD>`";

describe("parseInbox — the schedule fields (q9b)", () => {
  it("parses /st-rework's critical-deferred row as written, with its trigger, tag, date and rationale", () => {
    // The template of `/st-rework`'s protocol text with D11's field and the placeholders filled.
    const bullet =
      "- Critical · src/a.ts:9 · c · source: rework main · when: touched · critical-deferred · 2026-10-10 · rationale: we ship, the flag is off";

    const parsed = parseInbox(bullet);

    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        line: 1,
        severity: "Critical",
        location: "src/a.ts:9",
        description: "c",
        source: "rework main",
        ref: null,
        tag: "critical-deferred",
        by: null,
        when: "touched",
        files: [],
        deferredOn: "2026-10-10",
        rationale: "we ship, the flag is off",
        belowRule: false,
      },
    ]);
  });

  it("reads the fields after source: and Ref: by prefix, in any order, and a description holding the separator", () => {
    const parsed = parseInbox(
      [
        "- Minor · — · one · two · three · source: /st-work · Ref: r.jsonl#a/1 · 2026-10-10 · decision-waiting · files: src/b.ts, `docs/c.md:4`, Makefile · by: 2026-11-01",
        "- Minor · src/a.ts:1 · d · source: x · rationale: first · when: later · owner: nobody · by: never",
      ].join("\n"),
    );

    expect(parsed.problems).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({
      description: "one · two · three",
      ref: "r.jsonl#a/1",
      tag: "decision-waiting",
      by: "2026-11-01",
      when: null,
      files: ["src/b.ts", "docs/c.md", "Makefile"],
      deferredOn: "2026-10-10",
      rationale: null,
    });
    // `rationale:` is last and takes the rest of the line, separators and field-shaped words included.
    expect(parsed.rows[1]).toMatchObject({
      by: null,
      when: null,
      tag: null,
      rationale: "first · when: later · owner: nobody · by: never",
    });
  });

  it.each([
    ["by: 2026-11-01 · by: 2026-12-01", "`by:` appears twice"],
    ["when: touched · when: the next release", "`when:` appears twice"],
    ["files: src/a.ts · files: src/b.ts", "`files:` appears twice"],
    ["2026-10-10 · 2026-10-11", "a second deferral date `2026-10-11`; the bare date appears once"],
    ["by: 2026-11-01 · when: touched", "`by:` and `when:` both appear; a row carries one of them"],
    ["when: touched · by: 2026-11-01", "`by:` and `when:` both appear; a row carries one of them"],
    ["owner: x", "unknown field `owner:`"],
    ["by: 2026-02-30", "`by:` names no real calendar day as YYYY-MM-DD"],
    ["by: soon", "`by:` names no real calendar day as YYYY-MM-DD"],
    ["by:", "`by:` names no real calendar day as YYYY-MM-DD"],
    ["2026-02-30", "the deferral date `2026-02-30` is no real calendar day"],
    ["when:", "`when:` names no trigger"],
    ["files: src/a.ts, , src/b.ts", "`files:` names an empty path"],
    ["files:", "`files:` names an empty path"],
    // review/32: an entry is one path, so prose in the slot is refused where it was cut to its first word.
    [
      "files: that rule and its copies",
      "`files:` entry starting `that` holds a space; an entry is one path, parted from the next by a comma",
    ],
    [
      "files: src/b.ts, `src/c.ts and src/d.ts`",
      "`files:` entry starting `src/c.ts` holds a space; an entry is one path, parted from the next by a comma",
    ],
    ["rationale:", "`rationale:` gives no reason"],
    ["by: 2026-11-01 · Ref: r.jsonl#a/1", "`Ref:` comes straight after `source:`, before any other field"],
    ["Ref: r.jsonl#a/1 · Ref: r.jsonl#a/2", "`Ref:` appears twice"],
    // review/34: a `Ref:` in its place with no value is told its value is missing, not to move.
    ["Ref:", "`Ref:` names no path"],
    ["by: 2026-11-01 · Ref:", "`Ref:` comes straight after `source:`, before any other field"],
    ["source: y", "`source:` appears twice"],
    // The two shapes whose message stays as it was: a bare field holding a space, and a second tag word.
    ["by: 2026-11-01 · two words", "trailing field(s) beyond one optional tag word — by: 2026-11-01 · two words"],
    ["tag-one · when: touched · tag-two", "trailing field(s) beyond one optional tag word — tag-one · when: touched · tag-two"],
    ["when:touched", "trailing field(s) beyond one optional tag word — when:touched"],
  ])("refuses the trailing fields %j", (fields, message) => {
    const parsed = parseInbox(`intro\n- Minor · src/a.ts:1 · d · source: /st-work · ${fields}`);
    expect(parsed.rows).toEqual([]);
    expect(parsed.problems).toEqual([{ line: 2, message }]);
  });

  it("holds every row below the rule's heading to a date or a trigger, to the end of the file", () => {
    const text = [
      "# Deferral inbox",
      "",
      "- Minor · src/a.ts:1 · an older row · source: x",
      "",
      SCHEDULE_RULE_HEADING,
      "",
      "Rows appended from 2026-10-10 on carry a date or a trigger.",
      "- Minor · src/a.ts:2 · dated · source: x · by: 2026-11-01",
      "- Minor · src/a.ts:3 · neither · source: x",
      "",
      "## A later heading",
      "",
      "- Minor · src/a.ts:4 · still inside the rule's section · source: x · some-tag",
      "- Minor · src/a.ts:5 · triggered · source: x · when: the next edit of src/a.ts",
    ].join("\n");

    const parsed = parseInbox(text);

    const neither = "a row under `## Rows under the schedule rule` carries `by: <YYYY-MM-DD>` or `when: <trigger>`; this one carries neither";
    expect(parsed.problems).toEqual([
      { line: 9, message: neither },
      { line: 13, message: neither },
    ]);
    expect(parsed.rows.map((parsedRow) => [parsedRow.line, parsedRow.belowRule])).toEqual([
      [3, false],
      [8, true],
      [14, true],
    ]);
  });

  it("reads the heading only as the whole line it is", () => {
    const text = [`${SCHEDULE_RULE_HEADING} (draft)`, `  ${SCHEDULE_RULE_HEADING}`, "- Minor · — · d · source: x"].join("\n");
    expect(parseInbox(text)).toMatchObject({ problems: [], rows: [{ line: 3, belowRule: false }] });
    // A carriage return before the line break is the line's ending, not part of the heading.
    expect(parseInbox(`${SCHEDULE_RULE_HEADING}\r\n- Minor · — · d · source: x`).problems).toHaveLength(1);
  });

  it.each([
    ["src/a.ts:1", "when: later", "`when:` names the vague trigger `later`, which no event brings back"],
    ["src/a.ts:1", "when: later on", "`when:` names the vague trigger `later`, which no event brings back"],
    ["src/a.ts:1", "when: Maybe someday.", "`when:` names the vague trigger `someday`, which no event brings back"],
    ["src/a.ts:1", "when: the next hygiene batch", "`when:` names the vague trigger `hygiene batch`, which no event brings back"],
    // review/24, plan/43: the shared rule answers null for a trigger with no word, so the inbox asks for one itself.
    ["src/a.ts:1", "when: —", "`when:` names no trigger"],
    ["src/a.ts:1", "when: ...", "`when:` names no trigger"],
    ["—", "when: touched", "`when: touched` needs a path, in the location or in `files:`"],
    ["the ledger grammar", "when: Touched.", "`when: touched` needs a path, in the location or in `files:`"],
    [
      "—",
      "when: touched · files: that rule and its copies",
      "`files:` entry starting `that` holds a space; an entry is one path, parted from the next by a comma",
    ],
    // review/89: a day under `when:` names no event, and `--due` reads `by:` alone, so the row
    // would never come back on its day. It is refused whether or not the day is a real one, in
    // backticks, and with only filler or vague words beside it; the message names `by:`.
    ["src/a.ts:1", "when: 2026-11-15", WHEN_DAY],
    ["src/a.ts:1", "when: 2026-02-30", WHEN_DAY],
    ["src/a.ts:1", "when: `2026-11-15`.", WHEN_DAY],
    ["src/a.ts:1", "when: on 2026-11-15", WHEN_DAY],
    ["—", "when: until the 2026-11-15, maybe", WHEN_DAY],
    ["—", "when: later, 2026-11-15", WHEN_DAY],
    ["—", "when: 2026-11-15 or 2026-11-20", WHEN_DAY],
  ])("refuses a row at %j carrying %j", (location, field, message) => {
    expect(ruled(`Minor · ${location} · d · source: x · ${field}`)).toBe(message);
  });

  it.each([
    ["src/a.ts:1", "when: touched"],
    ["—", "when: touched · files: src/b.ts"],
    ["—", "files: src/b.ts · when: touched"],
    ["—", "when: the next edit of src/a.ts"],
    ["—", "when: the next hygiene pass after the release"],
    ["—", "by: 2026-11-01"],
    // review/89: a date among words that name an event is a trigger still.
    ["—", "when: the 2026-11-15 release ships"],
    ["—", "when: the first close after 2026-11-15"],
  ])("accepts a row at %j carrying %j below the heading", (location, field) => {
    expect(ruled(`Minor · ${location} · d · source: x · ${field}`)).toBe("");
  });

  it("holds a trigger to the same rule wherever the row stands, above the heading too", () => {
    const parsed = parseInbox("- Minor · src/a.ts:1 · d · source: x · when: tbd");
    expect(parsed.rows).toEqual([]);
    expect(parsed.problems).toEqual([{ line: 1, message: "`when:` names the vague trigger `tbd`, which no event brings back" }]);
  });

  it.each([
    "later",
    "later on",
    "maybe someday",
    "TBD",
    "eventually, perhaps",
    "the hygiene batch",
    "—",
    "",
    "touched",
    "the next edit of src/a.ts",
    "the next release",
    "later than the 1.14.0 release",
    "on the day",
    "next attended close",
    // review/89: a day, alone or beside filler words, and a date beside an event.
    "2026-11-15",
    "on 2026-11-15",
    "the 2026-11-15 release ships",
  ])("gives the trigger %j the verdict the `retired` grammar gives it after `scheduled <place> · when`", (trigger) => {
    const retired = parseDisposition(`scheduled board #42 · when ${trigger}`);
    const inbox = parseInbox(`- Minor · src/a.ts:1 · d · source: x · when: ${trigger}`);
    expect(inbox.problems.length === 0, `${trigger}: ${inbox.problems[0]?.message ?? "accepted"}`).toBe(retired.ok);
  });
});

describe("locationPaths", () => {
  it.each([
    ["nightly.yml:219-221,241-246,280", ["nightly.yml"]],
    ["src/cli/commands/gate.ts GitReadError", ["src/cli/commands/gate.ts"]],
    [`${README}:1, ${GETTING_STARTED}:5`, [README, GETTING_STARTED]],
    ["`src/runs/layout.ts:29`", ["src/runs/layout.ts"]],
    ["—", []],
    ["the ledger grammar", []],
  ])("names the paths of %j", (location, paths) => {
    expect(locationPaths(location)).toEqual(paths);
  });
});

describe("matchInbox", () => {
  it("matches a row by its path and leaves a row at another path out", () => {
    const rows = [row(1, "src/cli/commands/config.ts:829-849"), row(2, PLUGINS_DOC)];
    const result = matchInbox(rows, { paths: ["src/cli/commands/config.ts"] });
    expect(result.matched.map((match) => `${match.row.line}:${match.matchedBy}`)).toEqual(["1:path"]);
    expect(result.unmatched).toBe(1);
  });

  it("matches any entry of a multi-path location", () => {
    const rows = [row(1, `${README}:1, ${GETTING_STARTED}:5`), row(2, "docs/other.md:1")];
    expect(answer(rows, { paths: [GETTING_STARTED] })).toEqual(["1:path"]);
  });

  it("matches an entry with no folder by the query path's basename", () => {
    const rows = [row(1, "gate.ts GitReadError"), row(2, "notgate.ts:1")];
    expect(answer(rows, { paths: ["src/cli/commands/gate.ts"] })).toEqual(["1:path"]);
  });

  it("treats a query path as a folder, with or without its trailing slash, and an entry as one too", () => {
    const rows = [row(1, "src/runs/inboxStore.ts:1"), row(2, "src/runsx/a.ts:1"), row(3, "src/cli/:1")];
    expect(answer(rows, { paths: ["src/runs/"] })).toEqual(["1:path"]);
    expect(answer(rows, { paths: ["src/runs"] })).toEqual(["1:path"]);
    expect(answer(rows, { paths: ["src/cli/commands/ledger.ts"] })).toEqual(["3:path"]);
  });

  it("normalises Windows separators and a leading ./ on the query side", () => {
    const rows = [row(1, "src/runs/inboxStore.ts:1"), row(2, PLUGINS_DOC)];
    expect(answer(rows, { paths: [String.raw`.\src\runs\inboxStore.ts`] })).toEqual(["1:path"]);
    expect(answer(rows, { paths: [`./${PLUGINS_DOC}`] })).toEqual(["2:path"]);
  });

  it("matches a row by its Ref path, before the anchor", () => {
    const rows = [
      row(1, "—", { ref: ".stamity/runs/r/ledger.jsonl#r/build/1" }),
      row(2, "—", { ref: ".stamity/runs/s/ledger.jsonl#s/build/1" }),
    ];
    expect(answer(rows, { paths: [".stamity/runs/r/ledger.jsonl"] })).toEqual(["1:ref"]);
  });

  it("matches a row by the plan path, in its Ref or its location", () => {
    const rows = [
      row(1, "—", { ref: "docs/plans/019-a.md#unit" }),
      row(2, "docs/plans/019-a.md:4"),
      row(3, "docs/plans/018-b.md:4"),
    ];
    expect(answer(rows, { paths: [], plan: "docs/plans/019-a.md" })).toEqual(["1:plan", "2:plan"]);
  });

  it("matches a prose row by a whole area word, case-folded, and never a row pinned to a path", () => {
    const rows = [
      row(1, "—", { description: "the Ledger close note" }),
      row(2, "—", { description: "the ledgers close note" }),
      row(3, "src/a.ts:1", { description: "the ledger close note" }),
      row(4, "the ledger grammar", { description: "prose" }),
    ];
    expect(answer(rows, { paths: ["src/b.ts"], area: ["ledger"] })).toEqual(["1:area", "4:area"]);
    expect(answer(rows, { paths: [], area: ["LEDGERS"] })).toEqual(["2:area"]);
  });

  it.each(ALWAYS_SHOW_TAGS)("matches a row tagged %s on every query", (tag) => {
    const rows = [row(1, "docs/x.md:1", { tag }), row(2, "docs/y.md:1", { tag: "other" })];
    expect(answer(rows, { paths: ["src/a.ts"] })).toEqual(["1:always"]);
    expect(answer(rows, { paths: [], area: ["nothing"] })).toEqual(["1:always"]);
    expect(answer(rows, { paths: [], plan: "docs/plans/none.md" })).toEqual(["1:always"]);
  });

  it("prefers the path answer over always for a tagged row it also names", () => {
    const rows = [row(1, "src/a.ts:1", { tag: "critical-deferred" })];
    expect(answer(rows, { paths: ["src/a.ts"] })).toEqual(["1:path"]);
  });

  it("matches every row as all when the query names no filter", () => {
    const rows = [row(1, "src/a.ts:1"), row(2, "—"), row(3, "docs/x.md", { tag: "critical-deferred" })];
    const result = matchInbox(rows, { paths: [] });
    expect(result.matched.map((match) => `${match.row.line}:${match.matchedBy}`)).toEqual(["1:all", "2:all", "3:all"]);
    expect(result.unmatched).toBe(0);
  });

  it("matches a row by a files: entry as it does by a location entry", () => {
    const rows = [
      row(1, "—", { files: ["src/b.ts", "docs/guide"] }),
      row(2, "—", { files: ["src/c.ts"] }),
      row(3, "src/a.ts:1", { files: ["gate.ts"] }),
    ];
    expect(answer(rows, { paths: ["src/b.ts"] })).toEqual(["1:path"]);
    expect(answer(rows, { paths: ["docs/guide/page.md"] })).toEqual(["1:path"]);
    expect(answer(rows, { paths: ["src/cli/commands/gate.ts"] })).toEqual(["3:path"]);
    expect(answer(rows, { paths: [], plan: "src/c.ts" })).toEqual(["2:plan"]);
  });

  it("still reaches a row at a dash by an area word when it names files", () => {
    const rows = [row(1, "—", { description: "the ledger note", files: ["src/b.ts"] })];
    expect(answer(rows, { paths: ["src/z.ts"], area: ["ledger"] })).toEqual(["1:area"]);
  });

  it("matches a row whose by: is on or before the due day, and counts the waiting triggers", () => {
    const rows = [
      row(1, "—", { by: "2026-11-30" }),
      row(2, "—", { by: "2026-12-01" }),
      row(3, "—", { by: "2026-12-02" }),
      row(4, "—", { when: "the next release" }),
      row(5, "src/a.ts:1", { when: "touched" }),
      row(6, "—"),
      row(7, "docs/x.md:1", { by: "2026-01-01", tag: "decision-waiting" }),
    ];

    const due = matchInbox(rows, { paths: [], due: "2026-12-01" });
    expect(due.matched.map((match) => `${match.row.line}:${match.matchedBy}`)).toEqual(["1:due", "2:due", "7:due"]);
    expect(due.unmatched).toBe(4);
    expect(due.triggers).toBe(2);

    // A touched trigger is matched by its path, so it no longer waits.
    const touched = matchInbox(rows, { paths: ["src/a.ts"], due: "2026-11-30" });
    expect(touched.matched.map((match) => `${match.row.line}:${match.matchedBy}`)).toEqual(["1:due", "5:path", "7:due"]);
    expect(touched.triggers).toBe(1);

    // With no due day a date matches nothing, and the tagged row falls back to always.
    const noDue = matchInbox(rows, { paths: ["src/z.ts"] });
    expect(noDue.matched.map((match) => `${match.row.line}:${match.matchedBy}`)).toEqual(["7:always"]);
    expect(noDue.triggers).toBe(2);
  });

  it("counts no waiting trigger when the query names no filter, since every row matched", () => {
    const rows = [row(1, "—", { when: "the next release" }), row(2, "—", { by: "2026-12-02" })];
    const result = matchInbox(rows, { paths: [] });
    expect(result.matched.map((match) => match.matchedBy)).toEqual(["all", "all"]);
    expect(result.triggers).toBe(0);
  });

  it("leaves a dash location with no tag out of a filtered query", () => {
    const rows = [row(1, "—"), row(2, "src/a.ts:1")];
    const result = matchInbox(rows, { paths: ["src/a.ts"] });
    expect(result.matched.map((match) => match.row.line)).toEqual([2]);
    expect(result.unmatched).toBe(1);
  });
});
