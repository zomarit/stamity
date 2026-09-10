// The case-index gate: every roster row is derived, not typed.
//
// `SET-v5.md`'s case index opens by saying "Every row below is derived from the case
// files rather than maintained by hand", and until this suite existed nothing derived
// it. The coverage gate reads only the source→artifact mapping and the locator gate
// only the quoted blocks, so a row's `B / A` counts, its pinned claim and its source
// range could all drift away from the case file while the set stayed green — which is
// exactly what happened to `work-proof-block-fields` when its eighth binding criterion
// landed. This gate recomputes each cell from the files.
import { describe, expect, it } from "vitest";
import { type CaseFile, SET_FILE, caseFiles, readRepoFile } from "./support.ts";

/** One parsed row of the case index: the five cells, plus its 1-indexed line. */
interface RosterRow {
  readonly id: string;
  readonly line: number;
  /** The `class · metric` cell, tags included. */
  readonly classMetric: string;
  readonly binding: number;
  readonly advisory: number;
  readonly claim: string;
  readonly source: string;
}

/**
 * The rows of the `## Case index` section only. Other tables in the file carry
 * two-cell rows or non-case first cells, and neither shape parses here.
 */
const rosterRows = (): RosterRow[] => {
  const lines = readRepoFile(SET_FILE).split("\n");
  const start = lines.findIndex((line) => line.trim() === "## Case index");
  expect(start, `${SET_FILE}: no \`## Case index\` heading`).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const relativeEnd = rest.findIndex((line) => line.startsWith("## "));
  const section = relativeEnd === -1 ? rest : rest.slice(0, relativeEnd);
  const rows: RosterRow[] = [];
  section.forEach((line, index) => {
    if (!line.startsWith("| `") || !line.endsWith(" |")) return;
    const cells = line.slice(1, -1).split(" | ");
    if (cells.length !== 5) return;
    const id = /^`([a-z0-9-]+)`$/.exec((cells[0] ?? "").trim())?.[1];
    if (id === undefined) return;
    const counts = /^(\d+) \/ (\d+)$/.exec((cells[2] ?? "").trim());
    if (!counts) return;
    rows.push({
      id,
      line: start + 2 + index,
      classMetric: (cells[1] ?? "").trim(),
      binding: Number(counts[1]),
      advisory: Number(counts[2]),
      claim: (cells[3] ?? "").trim(),
      source: (cells[4] ?? "").trim().replace(/^`|`$/g, ""),
    });
  });
  return rows;
};

/** Numbered criteria under one `### <name> criteria` heading, counted as the set counts them. */
const criteriaCount = (file: CaseFile, name: "Binding" | "Advisory"): number => {
  let inSection = false;
  let count = 0;
  for (const line of file.bodyLines) {
    if (line.startsWith("### ")) {
      inSection = line.startsWith(`### ${name} criteria`);
      continue;
    }
    if (inSection && /^\d+\. /.test(line)) count += 1;
  }
  return count;
};

const cases = caseFiles();
const rows = rosterRows();
const byId = new Map(rows.map((row) => [row.id, row]));

describe("SET-v5 case index — the derivation is not vacuous", () => {
  it("parses one row per case file, and no others", () => {
    expect(rows.length, `${SET_FILE}: the case-index parser matched no rows`).toBe(cases.length);
    expect(byId.size, `${SET_FILE}: duplicate case ids in the case index`).toBe(rows.length);
    expect(
      cases.filter((file) => !byId.has(file.basename)).map((file) => file.path),
      `${SET_FILE}: case files with no row in the case index`,
    ).toEqual([]);
    const caseIds = new Set(cases.map((file) => file.basename));
    expect(
      rows.filter((row) => !caseIds.has(row.id)).map((row) => `${row.id} (line ${row.line})`),
      `${SET_FILE}: case-index rows naming no case file`,
    ).toEqual([]);
  });

  it("counts at least one binding criterion in every case file", () => {
    expect(
      cases.filter((file) => criteriaCount(file, "Binding") === 0).map((file) => file.path),
      "cases whose `### Binding criteria` section counted zero numbered lines",
    ).toEqual([]);
  });
});

for (const file of cases) {
  const row = byId.get(file.basename);
  if (!row) continue;
  describe(`SET-v5 case-index row ${file.basename}`, () => {
    it("states the B / A counts the case file carries", () => {
      const derived = `${criteriaCount(file, "Binding")} / ${criteriaCount(file, "Advisory")}`;
      expect(
        `${row.binding} / ${row.advisory}`,
        `${SET_FILE}:${row.line}: B / A cell does not match ${file.path}`,
      ).toBe(derived);
    });

    it("pins the claim the case file declares, verbatim", () => {
      expect(
        row.claim,
        `${SET_FILE}:${row.line}: claim cell does not match the \`claim:\` in ${file.path}`,
      ).toBe(file.frontmatter.get("claim") ?? "");
    });

    it("names the source locator the case file declares", () => {
      expect(
        row.source,
        `${SET_FILE}:${row.line}: source cell does not match the \`source:\` in ${file.path}`,
      ).toBe(file.frontmatter.get("source") ?? "");
    });

    it("labels the class, the metric and the floor tag from the frontmatter", () => {
      const prefix = `${file.frontmatter.get("class")} · ${file.frontmatter.get("metric")}`;
      expect(
        row.classMetric.startsWith(prefix),
        `${SET_FILE}:${row.line}: class · metric cell ${JSON.stringify(row.classMetric)} does not open with ${JSON.stringify(prefix)}`,
      ).toBe(true);
      expect(
        row.classMetric.includes("*(floor)*"),
        `${SET_FILE}:${row.line}: floor tag disagrees with \`floor:\` in ${file.path}`,
      ).toBe(file.frontmatter.get("floor") === "true");
    });
  });
}
