import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALWAYS_SHOW_TAGS,
  INBOX_PATH,
  locationPaths,
  matchInbox,
  parseInbox,
  type InboxRow,
} from "../../src/runs/inboxStore.ts";

/**
 * The deferral inbox's reader (q1a-inbox-store, REQ-FLOW-068, REQ-FLOW-075):
 * the row grammar and the query `stamity ledger inbox` answers.
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
    ...extra,
  };
}

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
    expect(parsed.rows).toEqual([
      {
        line: 3,
        severity: "Critical",
        location: "src/a.ts:9",
        description: "the consequence · split",
        source: "rework main",
        ref: "r.jsonl#a/1",
        tag: "critical-deferred",
      },
      { line: 4, severity: "Minor", location: "—", description: "d", source: "rework main", ref: ".stamity/runs/x/record.md", tag: null },
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

  it("ignores prose, headings, blanks and indented bullets, and keeps parsing past a bad bullet", () => {
    const text = "# Deferral inbox\n\nRows: 3.\n  - indented\n- Minor · — · d\n- Warning · a.ts:1 · d · source: x";
    const parsed = parseInbox(text);
    expect(parsed.problems.map((problem) => problem.line)).toEqual([5]);
    expect(parsed.rows.map((parsedRow) => parsedRow.line)).toEqual([6]);
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

  it("leaves a dash location with no tag out of a filtered query", () => {
    const rows = [row(1, "—"), row(2, "src/a.ts:1")];
    const result = matchInbox(rows, { paths: ["src/a.ts"] });
    expect(result.matched.map((match) => match.row.line)).toEqual([2]);
    expect(result.unmatched).toBe(1);
  });
});
