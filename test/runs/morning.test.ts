import { describe, expect, it } from "vitest";
import {
  blastRadiusSection,
  MORNING_FENCE,
  OUTBOUND_LINE_PAST_CAP,
  parseAnswers,
  parseMorning,
  prBodyFrom,
  screenOutbound,
  withBlastRadius,
  type MorningQuestion,
} from "../../src/runs/morning.ts";
import type { PrereqRow } from "../../src/runs/prerequisites.ts";
import { runMarker } from "../../src/runs/pullRequest.ts";
import { SCAN_LINE_MAX_CHARS } from "../../src/change/scan.ts";

/**
 * u5-morning (REQ-FLOW-094, REQ-FLOW-095, REQ-FLOW-103): the morning list's
 * shape, the pull request body made from it, the answers a person gives to it,
 * and the screen every outbound text passes before it leaves.
 *
 * Pure lane: every input is a string and every result a value, so no
 * filesystem, git or network is involved. The one token-shaped sample is
 * built at run time from fragments, so no line of this file carries one and
 * the repository's own secret scan stays clean.
 */

const RUN = "2026-10-16_overnight-x";

const question = (id: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    id,
    kind: "decision",
    question: `Keep the default for ${id}?`,
    options: ["keep it", "change it"],
    default: 1,
    source: "record.md Default applied",
    ...extra,
  });

interface Shape {
  title?: string;
  refused?: string | null;
  sections?: Partial<Record<string, string>>;
  questions?: readonly string[];
  order?: readonly string[];
}

const DEFAULT_SECTIONS: Record<string, string> = {
  "For you to check": "- Q1: open the settings page and save once",
  Decisions: "- the spec delta stays unmerged",
  Prerequisites: "- env · SERVICE_URL · src/a.ts:3 · set by person · blocks run · verified no",
  "Person's calls held": "- none of the held paths changed",
  "Not done:": "- draft PR opened; nothing else open",
  "How to answer": "Answer in one comment: `Q1→2, Q2→1`.",
};

const ORDER = ["For you to check", "Decisions", "Prerequisites", "Person's calls held", "Not done:", "How to answer"];

/** A morning list in the shape, with `shape` over the defaults. */
function morning(shape: Shape = {}): string {
  const lines = [shape.title ?? `# Morning list — ${RUN}`, ""];
  const sections = { ...DEFAULT_SECTIONS, ...shape.sections };
  if (shape.refused !== undefined && shape.refused !== null) lines.push("## Refused", "", shape.refused, "");
  for (const name of shape.order ?? ORDER) {
    lines.push(`## ${name}`, "", sections[name] ?? "", "");
    if (name === "How to answer") {
      lines.push("```" + MORNING_FENCE, ...(shape.questions ?? [question("Q1", { kind: "qa" }), question("Q2")]), "```", "");
    }
  }
  return lines.join("\n");
}

describe("parseMorning", () => {
  it("reads the sections in order and the questions block, the block kept out of its section", () => {
    const parsed = parseMorning(morning());

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.keys(parsed.sections)).toEqual(ORDER);
    expect(parsed.sections["Decisions"]).toBe("- the spec delta stays unmerged");
    expect(parsed.sections["How to answer"]).toBe("Answer in one comment: `Q1→2, Q2→1`.");
    expect(parsed.runId).toBe(RUN);
    expect(parsed.questions.map((q) => [q.id, q.kind, q.default])).toEqual([
      ["Q1", "qa", 1],
      ["Q2", "decision", 1],
    ]);
  });

  it("names a missing required section", () => {
    const order = ORDER.filter((name) => name !== "Decisions");
    const parsed = parseMorning(morning({ order }));

    expect(parsed).toEqual({ ok: false, problems: ["missing section `## Decisions`"] });
  });

  it("parses `## Refused` first when present, and refuses it anywhere else", () => {
    const parsed = parseMorning(morning({ refused: "- pre-flight: the hooks canary is absent" }));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.keys(parsed.sections)[0]).toBe("Refused");
    expect(parsed.sections["Refused"]).toBe("- pre-flight: the hooks canary is absent");

    const late = morning().replace("## Not done:", "## Refused\n\n- late\n\n## Not done:");
    const refused = parseMorning(late);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.problems).toContain("`## Refused` is not the first section");
  });

  it("refuses an unknown section, a repeated one and sections out of order", () => {
    const unknown = parseMorning(morning().replace("## Decisions", "## Thoughts"));
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.problems).toEqual(['line 7: unknown section "Thoughts"', "missing section `## Decisions`"]);

    const repeated = parseMorning(morning().replace("## Prerequisites", "## Decisions"));
    expect(repeated.ok).toBe(false);
    if (repeated.ok) return;
    expect(repeated.problems).toContain("line 11: section `## Decisions` appears twice");

    const swapped = [...ORDER];
    [swapped[0], swapped[1]] = [ORDER[1] ?? "", ORDER[0] ?? ""];
    const outOfOrder = parseMorning(morning({ order: swapped }));
    expect(outOfOrder.ok).toBe(false);
    if (outOfOrder.ok) return;
    expect(outOfOrder.problems).toEqual([`sections out of order: expected ${ORDER.map((n) => `\`## ${n}\``).join(", ")}`]);
  });

  it("refuses a title that names no run id", () => {
    const parsed = parseMorning(morning({ title: "# Morning list — Overnight" }));

    expect(parsed).toEqual({ ok: false, problems: ["line 1: the title is not `# Morning list — <run-id>`"] });
  });

  it("refuses a missing, unclosed or misplaced questions block", () => {
    const missing = morning().replace(/```stamity-morning[\s\S]*?```\n/, "");
    expect(parseMorning(missing)).toEqual({ ok: false, problems: ["no `stamity-morning` block under `## How to answer`"] });

    const unclosed = morning().replace(/\n```\n$/, "\n");
    const parsedUnclosed = parseMorning(unclosed);
    expect(parsedUnclosed.ok).toBe(false);
    if (parsedUnclosed.ok) return;
    expect(parsedUnclosed.problems.some((p) => p.includes("is never closed"))).toBe(true);

    const misplaced = morning().replace("## Decisions\n", "## Decisions\n\n```stamity-morning\n```\n");
    const parsedMisplaced = parseMorning(misplaced);
    expect(parsedMisplaced.ok).toBe(false);
    if (parsedMisplaced.ok) return;
    expect(parsedMisplaced.problems.some((p) => p.includes("outside `## How to answer`"))).toBe(true);
  });

  it("names every bad question line: unknown key, bad kind, a default past its options, a repeated id, too many QA rows", () => {
    const parsed = parseMorning(
      morning({
        questions: [
          question("Q1", { extra: true }),
          question("Q2", { kind: "wish" }),
          question("Q3", { default: 3 }),
          question("Q3"),
          question("Q4", { kind: "qa" }),
          question("Q5", { kind: "qa" }),
          question("Q6", { kind: "qa" }),
          question("Q7", { kind: "qa" }),
          "not json",
        ],
      }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems).toEqual([
      'line 28: unknown key "extra"',
      'line 29: kind "wish" is not qa, decision, prerequisite or held',
      "line 30: default 3 is not an option number from 1 to 2",
      "line 31: id Q3 appears twice",
      "line 36: not a JSON object",
      "4 qa questions; the list carries at most 3",
    ]);
  });

  it("parses a list whose every section is empty, each reading `none`, with an empty block", () => {
    const empty = Object.fromEntries(ORDER.map((name) => [name, ""]));
    const parsed = parseMorning(morning({ sections: empty, questions: [] }));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.values(parsed.sections)).toEqual(ORDER.map(() => "none"));
    expect(parsed.questions).toEqual([]);
  });

  it("reads a list written with CRLF line endings as the LF one", () => {
    const lf = parseMorning(morning());
    const crlf = parseMorning(morning().replace(/\n/g, "\r\n"));

    expect(crlf).toEqual(lf);
  });
});

describe("prBodyFrom", () => {
  const inferred: PrereqRow[] = [
    { kind: "env", name: "SERVICE_URL", where: "src/a.ts:3", setBy: "person", blocks: "run", verified: false, inferred: true },
    { kind: "env", name: "QUEUE_NAME", where: "src/b.ts:9", setBy: "person", blocks: "run", verified: false, inferred: true },
  ];

  it("renders the sections and the questions, the inferred rows not already named, then the run's marker last", () => {
    const body = prBodyFrom(morning(), RUN, { inferred });
    const lines = body.split("\n");

    expect(lines[0]).toBe(`# Morning list — ${RUN}`);
    expect(lines.at(-1)).toBe(runMarker(RUN));
    expect(runMarker(RUN)).toBe(`<!-- stamity:run ${RUN} -->`);
    expect(body).toContain("- the spec delta stays unmerged");
    expect(body).toContain("- env · QUEUE_NAME · src/b.ts:9 · set by person · blocks run · verified no · inferred");
    // SERVICE_URL is already named in the section, so it is not added twice.
    expect(body.match(/SERVICE_URL/g)).toHaveLength(1);
    expect(body).toContain("- **Q2** (decision) Keep the default for Q2? — 1. keep it (default) · 2. change it");
    expect(body).not.toContain(MORNING_FENCE);
  });

  it("prints `none` under every empty section, and replaces a `none` Prerequisites with the inferred rows", () => {
    const empty = Object.fromEntries(ORDER.map((name) => [name, ""]));
    const text = morning({ sections: empty, questions: [] });

    const bare = prBodyFrom(text, RUN);
    for (const name of ORDER) expect(bare).toContain(`## ${name}\n\nnone\n`);

    const withRows = prBodyFrom(text, RUN, { inferred });
    expect(withRows).toContain("## Prerequisites\n\n- env · SERVICE_URL · src/a.ts:3 · set by person");
    expect(withRows).not.toContain("## Prerequisites\n\nnone");
  });

  it("drops control and bidi characters from the body", () => {
    const text = morning({ sections: { Decisions: "- keep‮ it\u0007" } });

    expect(prBodyFrom(text, RUN)).toContain("- keep it\n");
  });

  it("cuts a body over the cap to the head, `Not done:` and the first rows, names morning.md, and keeps the marker last", () => {
    const rows = Array.from({ length: 4_000 }, (_, at) => `- decision row ${at} ${"x".repeat(40)}`).join("\n");
    const text = morning({
      refused: "- pre-flight: the hooks canary is absent",
      sections: { Decisions: rows, "Not done:": "- the draft PR could not be opened" },
    });
    const body = prBodyFrom(text, RUN, { maxChars: 20_000 });

    expect(body.length).toBeLessThanOrEqual(20_000);
    expect(body.split("\n").at(-1)).toBe(runMarker(RUN));
    expect(body).toContain("- pre-flight: the hooks canary is absent");
    expect(body).toContain("- the draft PR could not be opened");
    expect(body).toContain("- decision row 0 ");
    expect(body).not.toContain("- decision row 3999 ");
    // Every other section keeps its first rows: the cut takes one row of each a round.
    expect(body).toContain("- env · SERVICE_URL · src/a.ts:3");
    expect(body).toContain("- **Q2** (decision)");
    expect(body).toContain(`.stamity/runs/${RUN}/morning.md`);
    for (const name of ["Refused", ...ORDER]) expect(body).toContain(`## ${name}\n`);
  });

  it("cuts at the default 60,000-character cap", () => {
    const rows = Array.from({ length: 2_000 }, (_, at) => `- row ${at} ${"y".repeat(40)}`).join("\n");
    const body = prBodyFrom(morning({ sections: { Decisions: rows } }), RUN);

    expect(body.length).toBeGreaterThan(50_000);
    expect(body.length).toBeLessThanOrEqual(60_000);
    expect(body.split("\n").at(-1)).toBe(runMarker(RUN));
  });

  it("cuts a single line longer than the whole cap and still ends on the marker", () => {
    const body = prBodyFrom(morning({ sections: { "Not done:": "z".repeat(50_000) } }), RUN, { maxChars: 5_000 });

    expect(body.length).toBeLessThanOrEqual(5_000);
    expect(body).toContain("zzz…");
    expect(body.split("\n").at(-1)).toBe(runMarker(RUN));
  });

  it("turns a list that does not parse, or names another run, into a `Not done:` body naming the problems", () => {
    const broken = prBodyFrom(morning({ order: ORDER.slice(1) }), RUN);
    expect(broken).toContain("## Not done:");
    expect(broken).toContain("does not parse");
    expect(broken).toContain("missing section `## For you to check`");
    expect(broken.split("\n").at(-1)).toBe(runMarker(RUN));

    const other = prBodyFrom(morning({ title: "# Morning list — 2026-10-15_other" }), RUN);
    expect(other).toContain("the title names run 2026-10-15_other, not " + RUN);
    expect(other.split("\n").at(-1)).toBe(runMarker(RUN));
  });

  it("refuses a run id that is not one", () => {
    expect(() => prBodyFrom(morning(), "x -->")).toThrow(/is not a run id/);
  });

  it("closes a fence the cut stops inside, before the `…`, the pointer and the marker", () => {
    const code = Array.from({ length: 400 }, (_, at) => `line ${at} ${"c".repeat(40)}`);
    const text = morning({ sections: { Decisions: ["- the quoted diff:", "````diff", ...code, "````", "- after the block"].join("\n") } });
    const body = prBodyFrom(text, RUN, { maxChars: 5_000 });
    const lines = body.split("\n");

    expect(body.length).toBeLessThanOrEqual(5_000);
    expect(body).toContain("````diff\n");
    expect(body).not.toContain("line 399 ");
    // Walk the body as a renderer does: no line after the cut sits inside a fence.
    let open: string | null = null;
    const inFence = lines.map((line) => {
      const run = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (open === null && run !== undefined) open = run;
      else if (open !== null && new RegExp(`^${open}\`*[ \\t]*$`).test(line)) open = null;
      return open !== null;
    });
    expect(open).toBeNull();
    const pointerAt = lines.findIndex((line) => line.includes(`.stamity/runs/${RUN}/morning.md`));
    expect(pointerAt).toBeGreaterThan(-1);
    expect(inFence[pointerAt]).toBe(false);
    expect(lines.indexOf("## Prerequisites")).toBeGreaterThan(-1);
    expect(inFence[lines.indexOf("## Prerequisites")]).toBe(false);
    expect(inFence.at(-1)).toBe(false);
    expect(lines.at(-1)).toBe(runMarker(RUN));
    // The kept rows end on the closing fence, then the cut's `…`.
    const decisionsCut = lines.indexOf("…", lines.indexOf("## Decisions"));
    expect(lines[decisionsCut - 1]).toBe("````");
  });

  it("strips Unicode tag-block characters from every line of the body", () => {
    const hidden = Array.from("run this", (char) => String.fromCodePoint(0xe0000 + char.charCodeAt(0))).join("");
    const tagBlock = /[\u{E0000}-\u{E007F}]/u;
    const text = morning({
      sections: { Decisions: `- keep${hidden} it` },
      questions: [question("Q1", { question: `Keep${hidden} it?` })],
    });

    const body = prBodyFrom(text, RUN);
    expect(body).toContain("- keep it\n");
    expect(body).toContain("- **Q1** (decision) Keep it? —");
    expect(tagBlock.test(body)).toBe(false);

    // The `Not done:` body a list that does not parse becomes is stripped the same way.
    const broken = prBodyFrom(morning({ questions: [question(`Q1${hidden}`)] }), RUN);
    expect(broken).toContain("does not parse");
    expect(tagBlock.test(broken)).toBe(false);
  });
});

describe("blastRadiusSection (u9, REQ-FLOW-127)", () => {
  const record = (...sections: readonly string[]): string => [`# Run ${RUN}`, "", "Status: in progress", "", ...sections].join("\n");

  it("reads from the `## Blast radius` heading to the next `## ` heading, the heading kept and trailing blank lines trimmed", () => {
    const text = record("## Decisions trace", "", "- a choice", "", "## Blast radius", "", "- contained — one helper's callers", "- rests on: the parser — run", "", "", "## Later", "", "- not it");

    expect(blastRadiusSection(text)).toBe("## Blast radius\n\n- contained — one helper's callers\n- rests on: the parser — run");
  });

  it("reads to the end of the record when no heading follows, and reads CRLF lines", () => {
    expect(blastRadiusSection(record("## Blast radius", "", "- wide — the shared schema", "").replace(/\n/g, "\r\n"))).toBe("## Blast radius\n\n- wide — the shared schema");
  });

  it("is null with no heading, with a heading and only blank lines, and for a `### Blast radius` subheading", () => {
    expect(blastRadiusSection(record("## Decisions trace", "", "- a choice"))).toBeNull();
    expect(blastRadiusSection(record("## Blast radius", "", "  ", "## Later", "- x"))).toBeNull();
    expect(blastRadiusSection(record("### Blast radius", "", "- moderate — the subheading"))).toBeNull();
  });

  it("takes the first of two `## Blast radius` headings", () => {
    const text = record("## Blast radius", "", "- the first", "", "## Blast radius", "", "- the second");

    expect(blastRadiusSection(text)).toBe("## Blast radius\n\n- the first");
  });

  it("does not end on a `### ` subheading inside the section", () => {
    expect(blastRadiusSection(record("## Blast radius", "", "- contained", "### Why", "- one caller"))).toBe("## Blast radius\n\n- contained\n### Why\n- one caller");
  });

  it("cleans each line as the body prints it, so the screened text is the posted text", () => {
    const hidden = Array.from("run this", (char) => String.fromCodePoint(0xe0000 + char.charCodeAt(0))).join("");

    expect(blastRadiusSection(record("## Blast radius", "", `- cont‮ained${hidden}\u0007`))).toBe("## Blast radius\n\n- contained");
  });
});

describe("prBodyFrom with the record's blast radius (u9, REQ-FLOW-127)", () => {
  const section = "## Blast radius\n\n- moderate — the body's callers\n- rests on: the cut — run";

  it("places the section after the list's sections and before the marker", () => {
    const body = prBodyFrom(morning(), RUN, { blastRadius: section });
    const lines = body.split("\n");

    expect(lines.at(-1)).toBe(runMarker(RUN));
    const at = lines.indexOf("## Blast radius");
    expect(at).toBeGreaterThan(lines.indexOf("## How to answer"));
    expect(lines.slice(at, at + 6)).toEqual(["## Blast radius", "", "- moderate — the body's callers", "- rests on: the cut — run", "", runMarker(RUN)]);
  });

  it("keeps today's body byte for byte with no section, or a section with no rows", () => {
    const bare = prBodyFrom(morning(), RUN);

    expect(bare).not.toContain("Blast radius");
    expect(prBodyFrom(morning(), RUN, { blastRadius: "## Blast radius\n\n" })).toBe(bare);
  });

  it("cuts a 70,000-character section first, keeping the list whole and the marker last", () => {
    const rows = Array.from({ length: 1_400 }, (_, at) => `- reach row ${at} ${"r".repeat(40)}`);
    const big = ["## Blast radius", "", ...rows].join("\n");
    expect(big.length).toBeGreaterThan(70_000);

    const body = prBodyFrom(morning(), RUN, { blastRadius: big });

    expect(body.length).toBeLessThanOrEqual(60_000);
    expect(body.length).toBeGreaterThan(55_000);
    expect(body.split("\n").at(-1)).toBe(runMarker(RUN));
    // The list is whole: every section's row and both questions are kept.
    for (const row of Object.values(DEFAULT_SECTIONS)) expect(body).toContain(row);
    expect(body).toContain("- **Q2** (decision)");
    expect(body).toContain("- reach row 0 ");
    expect(body).not.toContain("- reach row 1399 ");
    expect(body).toContain("`record.md`");
  });

  it("gives the list's rows the room before the section's under a cap both overrun", () => {
    const decisions = Array.from({ length: 400 }, (_, at) => `- decision row ${at} ${"x".repeat(40)}`).join("\n");
    const reach = ["## Blast radius", "", ...Array.from({ length: 400 }, (_, at) => `- reach row ${at} ${"r".repeat(80)}`)].join("\n");

    const body = prBodyFrom(morning({ sections: { Decisions: decisions } }), RUN, { blastRadius: reach, maxChars: 5_000 });

    expect(body.length).toBeLessThanOrEqual(5_000);
    expect(body).toContain("- decision row 0 ");
    expect(body).toContain("## Blast radius\n");
    expect(body).not.toContain("- reach row 0 ");
    expect(body.split("\n").at(-1)).toBe(runMarker(RUN));
  });
});

describe("withBlastRadius (u9, REQ-FLOW-127)", () => {
  const lead = `Run \`${RUN}\`, attended. Its record: \`.stamity/runs/${RUN}/record.md\`.`;

  it("returns the lead unchanged with no section", () => {
    expect(withBlastRadius(lead, RUN, null)).toBe(lead);
  });

  it("puts the lead, the section, then the marker", () => {
    expect(withBlastRadius(lead, RUN, "## Blast radius\n\n- contained — one helper")).toBe(`${lead}\n\n## Blast radius\n\n- contained — one helper\n\n${runMarker(RUN)}`);
  });

  it("cuts a 70,000-character section to fit, closing an open fence, the marker last", () => {
    const rows = Array.from({ length: 1_400 }, (_, at) => `line ${at} ${"c".repeat(40)}`);
    const body = withBlastRadius(lead, RUN, ["## Blast radius", "", "- the reach:", "```text", ...rows, "```"].join("\n"));
    const lines = body.split("\n");

    expect(body.length).toBeLessThanOrEqual(60_000);
    expect(lines[0]).toBe(lead);
    expect(lines.at(-1)).toBe(runMarker(RUN));
    expect(body).not.toContain("line 1399 ");
    const cut = lines.indexOf("…");
    expect(lines[cut - 1]).toBe("```");
    expect(lines.slice(cut + 1).some((line) => line.includes("`record.md`"))).toBe(true);
  });

  it("refuses a run id that is not one", () => {
    expect(() => withBlastRadius(lead, "x -->", "## Blast radius\n\n- x")).toThrow(/is not a run id/);
  });
});

describe("parseAnswers", () => {
  const questions: MorningQuestion[] = [
    { id: "Q1", kind: "qa", question: "a?", options: ["yes", "no"], default: 1, source: "s" },
    { id: "Q3", kind: "decision", question: "b?", options: ["one", "two", "three"], default: 2, source: "s" },
  ];

  it("reads `Q1→2, Q3->1` after a `@copilot answers:` label", () => {
    const { answers, refused } = parseAnswers("@copilot answers: Q1→2, Q3->1", questions);

    expect([...answers]).toEqual([
      ["Q1", 2],
      ["Q3", 1],
    ]);
    expect(refused).toEqual([]);
  });

  it("refuses an unknown id, an option past the question's, a malformed piece and a repeated id", () => {
    const { answers, refused } = parseAnswers("Q7→2, Q1→3, maybe, Q3→1, q3->2", questions);

    expect([...answers]).toEqual([]);
    expect(refused).toEqual([
      { id: "Q7", reason: "no such question" },
      { id: "Q1", reason: "option 3 is not one of 1 to 2" },
      { id: '"maybe"', reason: "not Q<n>→<option>" },
      { id: "Q3", reason: "answered more than once" },
    ]);
  });

  it("drops both answers to one question when one of them is out of range, in either order", () => {
    for (const text of ["Q3→1, Q3→9", "Q3→9, Q3→1"]) {
      const { answers, refused } = parseAnswers(text, questions);

      expect([...answers]).toEqual([]);
      expect(refused.at(-1)).toEqual({ id: "Q3", reason: "answered more than once" });
    }
  });
});

describe("screenOutbound", () => {
  // The token is built from fragments so this file carries none (see the file head).
  const token = ["gh", "p", "_", "Q7RTW2KZ9MXC4HBN8JVL5DPF3GYSA6EUT2RW"].join("");

  it("names the line and rule of a token-shaped line and none of the value", () => {
    const result = screenOutbound(["# Morning list", "", `the key is ${token} for now`].join("\n"), "pr-body");

    expect(result).toEqual({ ok: false, hits: [{ line: 3, rule: "github-token" }] });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(token.slice(0, 4));
    expect(serialized).not.toContain(token.slice(4, 12));
  });

  it("passes a clean text", () => {
    expect(screenOutbound(prBodyFrom(morning(), RUN), "pr-body")).toEqual({ ok: true, hits: [] });
  });

  it("fails closed on a line past the scan's cap", () => {
    const result = screenOutbound(["fine", "a".repeat(SCAN_LINE_MAX_CHARS + 1)].join("\n"), "comment");

    expect(result).toEqual({ ok: false, hits: [{ line: 2, rule: OUTBOUND_LINE_PAST_CAP }] });
  });
});
