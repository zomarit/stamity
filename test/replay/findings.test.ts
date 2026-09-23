import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { extractFreeText, ledgerFindings, matchItems, parseClosures, parseDigest, parseFindingsBlock, unreadFreeText, verdictOf } from "../../scripts/replay/findings.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { walkTranscriptLines } from "../../scripts/replay/transcript.mjs";
import { mainLine, writeCapture } from "./synth.ts";

/**
 * The replay's findings reader and its deterministic matcher (REPLAY-v1 §9). Findings reach the
 * measurement in two shapes — a 1.9.1 reviewer's free-text return, and the changed shape's report
 * (a `stamity-findings` block), digest and ledger rows — and the matcher scores each against the
 * seeded items by file, a line range widened by the tolerance, and one accepted term. Every input
 * here is a real line or file the synthetic builders write (a delivered task notification walked
 * by the transcript walk, a capture's run-state files read back from disk), never a stand-in.
 *
 * Synthetic report-local ids stay single-digit: an id of the `C-` class with two or more digits is
 * a private-ledger spelling the leak gate refuses.
 */

interface Finding {
  source: string;
  role: string | null;
  file: string | null;
  line: number | null;
  lineEnd: number | null;
  severity: string | null;
  text: string;
  localId: string | null;
  ledgerId: string | null;
  reportPath: string | null;
  decisionNeeded?: true;
  security?: true;
}
interface Match {
  matched: Record<string, number[]>;
  adjudication: { id: string; findingIdx: number }[];
}
interface Item {
  id: string;
  file: string;
  span: [number, number];
  terms: string[];
}

/** Three seeds and a decoy, in the shape of `seeds.json` (the fields the matcher reads). */
const ITEMS: Item[] = [
  { id: "sec-sql-sort", file: "src/store/query.ts", span: [11, 11], terms: ["inject", "concatenat", "interpolat", "parameteri", "allowlist"] },
  { id: "cor-page-offset", file: "src/store/paging.ts", span: [4, 4], terms: ["off-by-one", "off by one", "1-based", "first page", "skips"] },
  { id: "sec-missing-guard", file: "src/http/routes.ts", span: [9, 9], terms: ["auth", "guard", "requireauth", "unauthenticated", "401"] },
  { id: "dec-allowlist-order", file: "src/orders/export.ts", span: [6, 6], terms: ["inject", "concatenat", "interpolat", "sql"] },
];

const match = (findings: Finding[], spans: Record<string, unknown> = {}, opts: Record<string, unknown> = {}): Match =>
  matchItems(findings, ITEMS, spans, { tolerance: 3, ...opts }) as Match;

/** A reviewer return delivered as a task notification, read back through the transcript walk. */
function delivered(result: string): string {
  const w = walkTranscriptLines([
    mainLine.agentToolUse({ id: "tu-r", subagentType: "stamity-reviewer", description: "u1-p1 review", prompt: "Review u1-p1" }),
    mainLine.toolResult("tu-r", "Async agent launched successfully. agentId: a1"),
    mainLine.taskNotification({ taskId: "a1", toolUseId: "tu-r", result }),
  ]) as { deliveries: { result: string }[] };
  expect(w.deliveries).toHaveLength(1);
  return w.deliveries[0]!.result;
}

const temps: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "stamity-replay-findings-"));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const RUN = "2026-09-23_replay-synth";
const REVIEWER = { source: "return", role: "reviewer" };

describe("extractFreeText — the baseline's free-text returns", () => {
  it("matches a baseline table row to its seed by file, line within tolerance and a term", () => {
    const text = delivered(
      [
        "**Verdict:** request-changes",
        "",
        "| Severity | Locator | Finding |",
        "|---|---|---|",
        "| Critical | src/store/query.ts:12 | sort value concatenated into SQL |",
        "| Warning | src/store/paging.ts:4 | page 1 skips the first 10 rows |",
      ].join("\n"),
    );
    const findings = extractFreeText(text, REVIEWER) as Finding[];

    expect(findings).toHaveLength(2);
    expect(findings[0]).toEqual({
      source: "return",
      role: "reviewer",
      file: "src/store/query.ts",
      line: 12,
      lineEnd: 12,
      severity: "Critical",
      text: "| Critical | src/store/query.ts:12 | sort value concatenated into SQL |",
      localId: null,
      ledgerId: null,
      reportPath: null,
    });
    expect(findings[1]).toMatchObject({ file: "src/store/paging.ts", line: 4, severity: "Warning" });

    const result = match(findings);
    expect(result.matched["sec-sql-sort"]).toEqual([0]);
    expect(result.matched["cor-page-offset"]).toEqual([1]);
    expect(result.matched["sec-missing-guard"]).toEqual([]);
    expect(result.adjudication).toEqual([]);
  });

  it("sends a location match without an accepted term to adjudication, never to a match", () => {
    const findings = extractFreeText("| Critical | src/store/query.ts:12 | style nit |", REVIEWER) as Finding[];
    expect(findings).toHaveLength(1);
    const result = match(findings);
    expect(result.matched["sec-sql-sort"]).toEqual([]);
    expect(result.adjudication).toEqual([{ id: "sec-sql-sort", findingIdx: 0 }]);
  });

  it("holds the ±3 tolerance at its edge: line 14 matches span [11,11], lines 15 and 16 miss", () => {
    const at = (line: number): Finding[] =>
      extractFreeText(`| Critical | src/store/query.ts:${line} | sort value concatenated into SQL |`, REVIEWER) as Finding[];
    expect(match(at(14)).matched["sec-sql-sort"]).toEqual([0]);
    expect(match(at(8)).matched["sec-sql-sort"]).toEqual([0]);
    for (const line of [15, 16, 7]) {
      const result = match(at(line));
      expect(result.matched["sec-sql-sort"]).toEqual([]);
      expect(result.adjudication).toEqual([]);
    }
    // A range locator intersects when any part of it reaches the widened span.
    const range = extractFreeText("- Critical src/store/query.ts:15-30 — sort concatenated", REVIEWER) as Finding[];
    expect(range[0]).toMatchObject({ line: 15, lineEnd: 30 });
    expect(match(range).matched["sec-sql-sort"]).toEqual([]);
    const reaching = extractFreeText("- Critical src/store/query.ts:2–8 — sort concatenated", REVIEWER) as Finding[];
    expect(reaching[0]).toMatchObject({ line: 2, lineEnd: 8 });
    expect(match(reaching).matched["sec-sql-sort"]).toEqual([0]);
  });

  it("makes absolute fixture and worktree paths relative before reading a locator", () => {
    const text = [
      "- **Critical** /work/fixture/src/store/query.ts:12 — sort concatenated into SQL",
      "- **Warning** /work/fixture/.claude/worktrees/lane-1/src/http/routes.ts#L9 — the cancel route has no auth guard",
    ].join("\n");
    const roots = ["/work/fixture", "/work/fixture/.claude/worktrees/lane-1/"];
    const findings = extractFreeText(text, { ...REVIEWER, roots }) as Finding[];
    expect(findings.map((f) => [f.file, f.line, f.severity])).toEqual([
      ["src/store/query.ts", 12, "Critical"],
      ["src/http/routes.ts", 9, "Warning"],
    ]);
    // Without the roots, an absolute path is not a locator at all.
    expect(extractFreeText(text, REVIEWER)).toEqual([]);
  });

  it("takes a list item with its indented continuation as one block", () => {
    const text = [
      "Review of u1-p1.",
      "",
      "1. Warning: src/store/paging.ts:4",
      "   page 1 skips the first 10 rows because pages are 1-based.",
      "2. A note on src/store/query.ts:40 with no severity word.",
    ].join("\n");
    const findings = extractFreeText(text, REVIEWER) as Finding[];
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: "src/store/paging.ts", line: 4, severity: "Warning" });
    expect(findings[0]!.text).toContain("1-based");
    expect(match(findings).matched["cor-page-offset"]).toEqual([0]);
  });

  it("reads a heading's severity for the unclassified lines below it, up to the next heading", () => {
    const text = [
      "## Critical",
      "",
      "- src/http/routes.ts:9 — the cancel route skips requireAuth",
      "",
      "## Notes",
      "",
      "- src/store/query.ts:40 reads well.",
    ].join("\n");
    const findings = extractFreeText(text, REVIEWER) as Finding[];
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: "src/http/routes.ts", line: 9, severity: "Critical" });
    expect(match(findings).matched["sec-missing-guard"]).toEqual([0]);
  });

  it("never promotes a Minor row to the severity of a sibling row under the same heading", () => {
    const text = [
      "## Findings: 1 Critical, 2 Minor",
      "| Critical | src/store/query.ts:12 | sort value concatenated into SQL |",
      "| Minor | src/orders/export.ts:6 | naming of the sql column map |",
      "- Minor: src/store/paging.ts:4 naming, not a Critical",
    ].join("\n");
    const findings = extractFreeText(text, REVIEWER) as Finding[];
    // The heading holds `Critical`, yet the Minor row classifies itself and stays out. The last item
    // holds `Critical`, so it is a block of the finding kind, but its first severity word is Minor.
    expect(findings.map((f) => [f.file, f.severity])).toEqual([
      ["src/store/query.ts", "Critical"],
      ["src/store/paging.ts", "Minor"],
    ]);
    expect(match(findings, {}, { severities: ["Critical", "Warning"] }).matched["dec-allowlist-order"]).toEqual([]);
  });

  it("emits one finding per distinct locator of a block and none for a directory without a line", () => {
    const text = [
      "Warning: the sort reaches SQL through src/store/query.ts:12 and src/orders/export.ts:6, and again at src/store/query.ts:12.",
      "",
      "Critical: src/store/ has no index on created_at.",
    ].join("\n");
    const findings = extractFreeText(text, REVIEWER) as Finding[];
    expect(findings.map((f) => `${f.file}:${f.line}`)).toEqual(["src/store/query.ts:12", "src/orders/export.ts:6"]);
    // One block, two locators: the decoy's `sql` term is in the text, the seed's terms are not.
    const result = match(findings);
    expect(result.matched["dec-allowlist-order"]).toEqual([1]);
    expect(result.adjudication).toEqual([{ id: "sec-sql-sort", findingIdx: 0 }]);
  });

  it("leaves a stamity-findings or stamity-closures fence to the structured readers", () => {
    const text = [
      "```stamity-findings",
      '{"id":"C-1","severity":"Critical","locator":"src/store/query.ts:12","summary":"sort concatenated"}',
      "```",
      "```stamity-closures",
      '{"ledger_id":"r/review/1","status":"fixed","rationale":"Critical src/store/query.ts:12 parameterized"}',
      "```",
    ].join("\n");
    expect(extractFreeText(text, REVIEWER)).toEqual([]);
  });

  it("folds a labelled-field finding split over sibling paragraphs into one block", () => {
    const text = ["Severity: Warning", "", "Locator: src/store/paging.ts:4", "", "Page 1 skips the first 10 rows."].join("\n");
    const findings = extractFreeText(text, REVIEWER) as Finding[];
    expect(findings.map((f) => [f.file, f.line, f.severity])).toEqual([["src/store/paging.ts", 4, "Warning"]]);
    expect(match(findings).matched["cor-page-offset"]).toEqual([0]);
    expect(unreadFreeText(text, REVIEWER)).toEqual([]);
  });

  it("folds a labelled-field finding split over loose list items, with or without a heading", () => {
    const items = ["- Severity: Critical", "", "- Locator: src/store/query.ts:12", "", "- Summary: sort value concatenated into SQL"];
    for (const text of [items.join("\n"), ["## u1-p1 review", "", ...items].join("\n")]) {
      const findings = extractFreeText(text, REVIEWER) as Finding[];
      expect(findings.map((f) => [f.file, f.line, f.severity])).toEqual([["src/store/query.ts", 12, "Critical"]]);
      expect(match(findings).matched["sec-sql-sort"]).toEqual([0]);
    }
  });

  it("reads a severity word in any case and in the plural, normalized to title case", () => {
    const lower = extractFreeText("- warning: src/store/paging.ts:4 — page 1 skips the first 10 rows", REVIEWER) as Finding[];
    expect(lower.map((f) => f.severity)).toEqual(["Warning"]);
    const upper = extractFreeText("| WARNING | src/store/paging.ts:4 | page 1 skips |", REVIEWER) as Finding[];
    expect(upper.map((f) => f.severity)).toEqual(["Warning"]);
    const critical = extractFreeText("CRITICAL src/store/query.ts:12 sort concatenated", REVIEWER) as Finding[];
    expect(critical.map((f) => f.severity)).toEqual(["Critical"]);
    const plural = extractFreeText(["## Warnings", "", "- src/store/paging.ts:4 — page 1 skips the first 10 rows"].join("\n"), REVIEWER) as Finding[];
    expect(plural.map((f) => [f.file, f.severity])).toEqual([["src/store/paging.ts", "Warning"]]);
    // A lowercase Minor classifies its own row: the plural heading does not promote it to Critical,
    // and a block of Minor alone is no finding and no unread block.
    const minor = ["## Criticals", "- minor: src/a.ts:3 naming"].join("\n");
    expect(extractFreeText(minor, REVIEWER)).toEqual([]);
    expect(unreadFreeText(minor, REVIEWER)).toEqual([]);
  });

  it("names each skipped free-text block and its reason in unreadFreeText", () => {
    const text = [
      "Warning: the paging in src/store/paging.ts line 4 skips the first page.",
      "",
      "## Notes",
      "",
      "- src/store/query.ts:40 reads well.",
      "",
      "## Critical",
      "",
      "- src/http/routes.ts:9 — the cancel route skips requireAuth",
    ].join("\n");
    expect(unreadFreeText(text, REVIEWER)).toEqual([
      { block: "Warning: the paging in src/store/paging.ts line 4 skips the first page.", reason: "severity-without-locator" },
      { block: "## Notes\n- src/store/query.ts:40 reads well.", reason: "locator-without-severity" },
    ]);
    // The read section is a finding, never an unread block.
    expect((extractFreeText(text, REVIEWER) as Finding[]).map((f) => f.file)).toEqual(["src/http/routes.ts"]);
    // Absolute roots are stripped before a block is judged.
    expect(unreadFreeText("- Critical /work/fixture/src/a.ts:3 — x", { ...REVIEWER, roots: ["/work/fixture"] })).toEqual([]);
  });
});

describe("parseFindingsBlock — the C2 block of a report", () => {
  it("yields a report's valid rows and one error naming the malformed line", () => {
    const reportName = "u1-p1-reviewer-r1.md";
    const report = [
      "# u1-p1 review",
      "",
      "```stamity-findings",
      '{"id":"C-1","severity":"Critical","locator":"src/store/query.ts:12","summary":"sort value concatenated into SQL","security":true}',
      '{"id":"W-1","severity":"Warning","locator":"src/store/paging.ts:4-5","summary":"page 1 skips the first 10 rows","decision_needed":true}',
      '{"id":"W-2","severity":"Critical","locator":"src/http/routes.ts:9","summary":"letter and severity disagree"}',
      '{"id":"M-1","severity":"Minor","locator":"npm run lint","summary":"a lint warning in the new file"}',
      "```",
      "",
      "Prose after the block.",
    ].join("\n");
    const layout = writeCapture(scratch(), {
      transcript: [],
      state: { end: { runId: RUN, reports: { [reportName]: report } } },
    });
    const text = readFileSync(join(layout.state, "end", "runs", RUN, "reports", reportName), "utf8");
    const reportPath = `.stamity/runs/${RUN}/reports/${reportName}`;

    const { findings, errors } = parseFindingsBlock(text, { role: "reviewer", reportPath }) as { findings: Finding[]; errors: { line: number; text: string; reason: string }[] };

    expect(findings).toHaveLength(3);
    expect(findings[0]).toEqual({
      source: "report",
      role: "reviewer",
      file: "src/store/query.ts",
      line: 12,
      lineEnd: 12,
      severity: "Critical",
      text: "sort value concatenated into SQL",
      localId: "C-1",
      ledgerId: null,
      reportPath,
      security: true,
    });
    expect(findings[1]).toMatchObject({ localId: "W-1", file: "src/store/paging.ts", line: 4, lineEnd: 5, decisionNeeded: true });
    // A gate-command locator is a valid row with no file to match.
    expect(findings[2]).toMatchObject({ localId: "M-1", severity: "Minor", file: null, line: null, text: "a lint warning in the new file" });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 6 });
    expect(errors[0]!.text).toContain('"W-2"');
    expect(errors[0]!.reason).toMatch(/letter/);

    const result = match(findings);
    expect(result.matched["sec-sql-sort"]).toEqual([0]);
    expect(result.matched["cor-page-offset"]).toEqual([1]);
  });

  it("refuses unparseable JSON, a missing field and an over-long summary, line by line", () => {
    const long = "x".repeat(301);
    const text = [
      "```stamity-findings",
      "not json",
      '{"id":"W-1","severity":"Warning","summary":"no locator"}',
      `{"id":"W-2","severity":"Warning","locator":"src/a.ts:1","summary":"${long}"}`,
      '{"id":"W-3","severity":"Warning","locator":"src/a.ts:1","summary":"kept","extra":"tolerated"}',
      "",
      "```",
    ].join("\n");
    const { findings, errors } = parseFindingsBlock(text) as { findings: Finding[]; errors: { line: number }[] };
    expect(findings.map((f) => f.localId)).toEqual(["W-3"]);
    expect(findings[0]!.source).toBe("report");
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
  });

  it("refuses a path:line:col locator as an error, never as the file `path:line`", () => {
    const text = ["```stamity-findings", '{"id":"W-1","severity":"Warning","locator":"src/store/paging.ts:4:7","summary":"page 1 skips"}', "```"].join("\n");
    const { findings, errors } = parseFindingsBlock(text) as { findings: Finding[]; errors: { line: number; reason: string }[] };
    expect(findings).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 2 });
    expect(errors[0]!.reason).toMatch(/column/);
  });

  it("reads an empty block as no findings and no errors, and ignores other fences", () => {
    const text = ["```json", '{"id":"C-1"}', "```", "```stamity-findings", "```"].join("\n");
    expect(parseFindingsBlock(text)).toEqual({ findings: [], errors: [] });
  });
});

describe("parseDigest — the C4 digest of both shapes", () => {
  it("reads a reviewer's digest, its verdict, confidence and every finding entry", () => {
    const digest = [
      "status: DONE",
      "verdict: request-changes",
      "confidence: high — direct",
      "report: .stamity/runs/2026-09-23_replay-synth/reports/u1-p1-reviewer-r1.md",
      "findings: C-1 src/store/query.ts:12 — sort value concatenated into SQL; W-1 src/store/paging.ts:4 — page 1 skips the first 10 rows",
      "  W-2 npm run test — the new suite never ran",
      "  2 Minor: M-1 src/a.ts:3, M-2 src/b.ts:5-6",
      "security: C-1 src/store/query.ts:12 — sort value concatenated into SQL",
      "contract delta: none",
      "",
      "Prose that mentions W-3 src/c.ts:1 — never a finding.",
    ].join("\n");
    const parsed = parseDigest(delivered(digest), { role: "reviewer" }) as Record<string, unknown> & { findings: Finding[] };
    expect(parsed).toMatchObject({
      status: "DONE",
      verdict: "request-changes",
      confidence: "high — direct",
      mode: null,
      posted: null,
      report: ".stamity/runs/2026-09-23_replay-synth/reports/u1-p1-reviewer-r1.md",
      security: "C-1 src/store/query.ts:12 — sort value concatenated into SQL",
    });
    expect(parsed.findings.map((f) => [f.localId, f.severity, f.file, f.line, f.lineEnd, f.text])).toEqual([
      ["C-1", "Critical", "src/store/query.ts", 12, 12, "sort value concatenated into SQL"],
      ["W-1", "Warning", "src/store/paging.ts", 4, 4, "page 1 skips the first 10 rows"],
      ["W-2", "Warning", null, null, null, "the new suite never ran"],
      ["M-1", "Minor", "src/a.ts", 3, 3, ""],
      ["M-2", "Minor", "src/b.ts", 5, 6, ""],
    ]);
    expect(parsed.findings[1]).toMatchObject({ source: "digest", role: "reviewer", reportPath: ".stamity/runs/2026-09-23_replay-synth/reports/u1-p1-reviewer-r1.md" });
    const result = match(parsed.findings);
    expect(result.matched["sec-sql-sort"]).toEqual([0]);
    expect(result.matched["cor-page-offset"]).toEqual([1]);
  });

  it("reads a lens digest's mode and posted count, with no verdict or confidence", () => {
    const digest = [
      "**status:** DONE",
      "**mode:** posted, 1 posted",
      "**report:** `.stamity/runs/2026-09-23_replay-synth/reports/u2-p1-security-r1.md`",
      "**findings:** W-1 src/http/routes.ts:9 — the cancel route has no guard",
      "**security:** W-1 src/http/routes.ts:9 — the cancel route has no guard",
      "**contract delta:** none",
    ].join("\n");
    const parsed = parseDigest(digest, { role: "security" }) as Record<string, unknown> & { findings: Finding[] };
    expect(parsed).toMatchObject({ status: "DONE", verdict: null, confidence: null, mode: "posted", posted: 1 });
    expect(parsed["report"]).toBe(".stamity/runs/2026-09-23_replay-synth/reports/u2-p1-security-r1.md");
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatchObject({ localId: "W-1", file: "src/http/routes.ts", line: 9, role: "security" });
    expect(match(parsed.findings).matched["sec-missing-guard"]).toEqual([0]);
  });

  it("ends a label's value at a blank line and keeps the first occurrence of a label", () => {
    const parsed = parseDigest(
      [
        "status: DONE",
        "findings: W-1 src/store/paging.ts:4 — page 1 skips the first 10 rows",
        "",
        "- W-2 src/b.ts:4 — a list line in the prose, after the digest",
        "findings: none, as a later prose line says",
      ].join("\n"),
    ) as { findings: Finding[] };
    expect(parsed.findings.map((f) => f.localId)).toEqual(["W-1"]);
  });

  it("reads `findings: none` as no findings and an absent label as null", () => {
    const parsed = parseDigest("status: DONE\nfindings: none\n") as Record<string, unknown>;
    expect(parsed).toMatchObject({ status: "DONE", verdict: null, report: null, security: null, findings: [], errors: [] });
    expect(parseDigest("status: DONE\n")).toMatchObject({ findings: [], errors: [] });
  });

  it("reads bold and colon-suffixed entry ids", () => {
    const parsed = parseDigest(
      [
        "status: DONE",
        "findings: **C-1** src/store/query.ts:12 — sort value concatenated into SQL; W-1: src/store/paging.ts:4 — page 1 skips the first 10 rows",
        "  **W-2:** src/http/routes.ts:9 — the cancel route has no guard",
      ].join("\n"),
    ) as { findings: Finding[]; errors: unknown[] };
    expect(parsed.findings.map((f) => [f.localId, f.severity, f.file, f.line, f.text])).toEqual([
      ["C-1", "Critical", "src/store/query.ts", 12, "sort value concatenated into SQL"],
      ["W-1", "Warning", "src/store/paging.ts", 4, "page 1 skips the first 10 rows"],
      ["W-2", "Warning", "src/http/routes.ts", 9, "the cancel route has no guard"],
    ]);
    expect(parsed.errors).toEqual([]);
  });

  it("reports an error when a findings value other than none yields no entry", () => {
    const parsed = parseDigest("status: DONE\nfindings: two Warnings, see the report\n") as { findings: Finding[]; errors: { text: string; reason: string }[] };
    expect(parsed.findings).toEqual([]);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]!.text).toBe("two Warnings, see the report");
  });

  it("refuses a path:line:col entry locator as an error", () => {
    const parsed = parseDigest("findings: W-1 src/store/paging.ts:4:7 — page 1 skips\n") as { findings: Finding[]; errors: { text: string; reason: string }[] };
    expect(parsed.findings).toEqual([]);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]!.reason).toMatch(/column/);
  });
});

describe("parseClosures — the C9 block of a re-review", () => {
  it("reads each closure, tolerates extra keys and refuses a bad status by line", () => {
    const text = [
      "Re-review of u1-p1.",
      "```stamity-closures",
      `{"ledger_id":"${RUN}/review/1","status":"fixed","rationale":"parameterized","checked_at":"src/store/query.ts:12"}`,
      `{"ledger_id":"${RUN}/review/2","status":"rejection-upheld"}`,
      `{"ledger_id":"${RUN}/review/3","status":"closed"}`,
      "```",
    ].join("\n");
    const { closures, errors } = parseClosures(text) as { closures: unknown[]; errors: { line: number; reason: string }[] };
    expect(closures).toEqual([
      { ledgerId: `${RUN}/review/1`, status: "fixed", rationale: "parameterized" },
      { ledgerId: `${RUN}/review/2`, status: "rejection-upheld", rationale: null },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 5 });
    expect(errors[0]!.reason).toMatch(/status/);
  });
});

describe("ledgerFindings — the C3 rows", () => {
  it("takes the locator up to ` — `, carries report and decision_needed, and matches a seed", () => {
    const rows = [
      {
        id: `${RUN}/review/1`,
        phase: "review",
        source: "reviewer",
        severity: "Warning",
        evidence: "src/http/routes.ts:9 — cancel route has no guard",
        state: "open",
        rationale: "",
        report: `.stamity/runs/${RUN}/reports/u2-p1-reviewer-r1.md`,
        decision_needed: true,
      },
      { id: `${RUN}/review/2`, phase: "review", source: "security", severity: "Critical", evidence: "the cancel handler at src/http/routes.ts:10 is unauthenticated", state: "open", rationale: "" },
      { id: `${RUN}/review/3`, phase: "review", source: "reviewer", severity: "Warning", evidence: "the migration plan is missing", state: "deferred", rationale: "later" },
    ];
    const layout = writeCapture(scratch(), { transcript: [], state: { end: { runId: RUN, ledger: rows } } });
    const read = readFileSync(join(layout.state, "end", "runs", RUN, "ledger.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    const findings = ledgerFindings(read) as Finding[];
    expect(findings).toHaveLength(3);
    expect(findings[0]).toEqual({
      source: "ledger",
      role: "reviewer",
      file: "src/http/routes.ts",
      line: 9,
      lineEnd: 9,
      severity: "Warning",
      text: "cancel route has no guard",
      localId: null,
      ledgerId: `${RUN}/review/1`,
      reportPath: `.stamity/runs/${RUN}/reports/u2-p1-reviewer-r1.md`,
      decisionNeeded: true,
    });
    // No ` — ` separator: the locator is read from the evidence text instead.
    expect(findings[1]).toMatchObject({ role: "security", file: "src/http/routes.ts", line: 10, text: "the cancel handler at src/http/routes.ts:10 is unauthenticated", reportPath: null });
    expect(findings[1]).not.toHaveProperty("decisionNeeded");
    // No locator at all: the row stays visible, with nothing to match.
    expect(findings[2]).toMatchObject({ file: null, line: null, ledgerId: `${RUN}/review/3` });

    expect(match(findings).matched["sec-missing-guard"]).toEqual([0, 1]);
  });
});

describe("ledgerFindings — severity spelling", () => {
  it("title-cases the severity a row carries", () => {
    const rows = [
      { id: `${RUN}/build/1`, source: "implementer", severity: "warning", evidence: "src/store/paging.ts:4 — page 1 skips", state: "open", rationale: "" },
      { id: `${RUN}/build/2`, source: "implementer", severity: "CRITICAL", evidence: "src/store/query.ts:12 — sort concatenated", state: "open", rationale: "" },
    ];
    const findings = ledgerFindings(rows) as Finding[];
    expect(findings.map((f) => f.severity)).toEqual(["Warning", "Critical"]);
    expect(match(findings, {}, { severities: ["Critical", "Warning"] }).matched["cor-page-offset"]).toEqual([0]);
  });
});

describe("verdictOf", () => {
  it("reads the verdict in both shapes and nothing where none is given", () => {
    expect(verdictOf("Summary.\n**Verdict:** request-changes\n")).toBe("request-changes");
    expect(verdictOf("status: DONE\nverdict: approve\nconfidence: high — direct")).toBe("approve");
    expect(verdictOf("VERDICT — Approve")).toBeNull();
    expect(verdictOf("status: BLOCKED_AMBIGUITY")).toBeNull();
  });
});

describe("matchItems", () => {
  it("lets one finding match several items and reads a relocated span from spansByFile", () => {
    const items: Item[] = [
      { id: "a", file: "src/x.ts", span: [10, 12], terms: ["guard"] },
      { id: "b", file: "src/x.ts", span: [20, 20], terms: ["auth"] },
    ];
    const finding: Finding = {
      source: "return", role: "reviewer", file: "src/x.ts", line: 14, lineEnd: 17, severity: "Warning",
      text: "No Guard and no AUTH", localId: null, ledgerId: null, reportPath: null,
    };
    const both = matchItems([finding], items, {}, { tolerance: 3 }) as Match;
    expect(both.matched).toEqual({ a: [0], b: [0] });

    // The reviewed tree moved item `a` to line 40 (an object keyed by id) and gave `b` two copies.
    const moved = matchItems([finding], items, { "src/x.ts": { a: [40, 40], b: [[50, 50], [18, 18]] } }, { tolerance: 3 }) as Match;
    expect(moved.matched).toEqual({ a: [], b: [0] });
    // The array-of-rows form reads the same.
    const rows = matchItems([finding], items, { "src/x.ts": [{ id: "a", span: [40, 40] }] }, { tolerance: 3 }) as Match;
    expect(rows.matched).toEqual({ a: [], b: [0] });
  });

  it("skips a finding with no file or line and, when asked, one outside the severities", () => {
    const base = { source: "report", role: "reviewer", text: "sort concatenated", localId: null, ledgerId: null, reportPath: null };
    const findings: Finding[] = [
      { ...base, file: null, line: null, lineEnd: null, severity: "Critical" },
      { ...base, file: "src/store/query.ts", line: 11, lineEnd: 11, severity: "Minor" },
      { ...base, file: "src/store/query.ts", line: 11, lineEnd: 11, severity: "Critical" },
    ];
    expect(match(findings).matched["sec-sql-sort"]).toEqual([1, 2]);
    expect(match(findings, {}, { severities: ["Critical", "Warning"] }).matched["sec-sql-sort"]).toEqual([2]);
  });
});
