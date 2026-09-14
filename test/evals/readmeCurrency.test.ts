// The README-currency gate: the page's "current rubric" marker is derived from the
// machine-read profile document, not typed beside it.
//
// `evals/model-profiles-v1.json` is what the runner resolves at dispatch, so it decides
// which rubric the default profile actually grades with. The README says the same thing in
// prose, one row of its path table carrying the marker — and a prose row is a literal that
// nothing recomputes, which is how the decision that moved the default rubric left the page
// naming `rubric-v4.md` as the default while the profile had moved on. This gate reads the
// JSON, resolves `defaultProfile` → `rubric`, and holds exactly one rubric row to the marker.
//
// It also pins the route of record into the path table: `stamity-claude-cli-v1` produced
// runs 15–24, and a reader who cannot find it on this page has to reconstruct it from a
// run directory.
import { describe, expect, it } from "vitest";
import { README_FILE, readRepoFile } from "./support.ts";

const PROFILES_FILE = "evals/model-profiles-v1.json";
const ROUTE_OF_RECORD = "stamity-claude-cli-v1";
const CURRENT_RUBRIC_MARKER = /current rubric/i;

interface ProfileDocument {
  readonly defaultProfile: string;
  readonly profiles: Readonly<Record<string, { readonly rubric: string }>>;
}

const document = JSON.parse(readRepoFile(PROFILES_FILE)) as ProfileDocument;

/** `evals/rubric-v7.md` → `rubric-v7.md`: the README names files, the JSON names paths. */
const defaultRubricFile = (): string => {
  const profile = document.profiles[document.defaultProfile];
  expect(
    profile,
    `${PROFILES_FILE}: \`defaultProfile\` is \`${document.defaultProfile}\`, which is not in \`profiles\``,
  ).toBeDefined();
  const rubric = profile?.rubric ?? "";
  expect(rubric, `${PROFILES_FILE}: profile \`${document.defaultProfile}\` declares no rubric`).not.toBe(
    "",
  );
  return rubric.split("/").at(-1) ?? "";
};

interface TableRow {
  readonly paths: string;
  readonly description: string;
}

/** The path table: the rows of the first `| Path | What it is |` table on the page. */
const pathTable = (): TableRow[] => {
  const lines = readRepoFile(README_FILE).split("\n");
  const header = lines.findIndex((line) => line.startsWith("| Path |"));
  expect(header, `${README_FILE}: no \`| Path | What it is |\` table`).toBeGreaterThan(-1);
  const rows: TableRow[] = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith("|")) break;
    const cells = line.slice(1, line.endsWith("|") ? -1 : undefined).split(" | ");
    rows.push({ paths: (cells[0] ?? "").trim(), description: cells.slice(1).join(" | ").trim() });
  }
  return rows;
};

const rubricRows = (rows: readonly TableRow[]): TableRow[] =>
  rows.filter((row) => /\brubric-v\d+\.md\b/.test(row.paths));

describe("evals README currency — the current rubric is the one the profile selects", () => {
  it("marks the default profile's rubric row as the current rubric", () => {
    const wanted = defaultRubricFile();
    const rows = rubricRows(pathTable()).filter((row) => row.paths.includes(wanted));
    expect(
      rows.length,
      `${README_FILE}: the path table has ${rows.length} rows naming \`${wanted}\`; it must have exactly one`,
    ).toBe(1);
    expect(
      CURRENT_RUBRIC_MARKER.test(rows[0]?.description ?? ""),
      `${README_FILE}: the \`${wanted}\` row does not call it the current rubric, but ${PROFILES_FILE} selects it for the \`${document.defaultProfile}\` profile`,
    ).toBe(true);
  });

  it("marks no other rubric row as current", () => {
    const wanted = defaultRubricFile();
    const strays = rubricRows(pathTable())
      .filter((row) => !row.paths.includes(wanted))
      .filter((row) => CURRENT_RUBRIC_MARKER.test(row.description))
      .map((row) => row.paths);
    expect(
      strays,
      `${README_FILE}: a rubric row other than \`${wanted}\` claims to be the current rubric`,
    ).toEqual([]);
  });

  it("names the route of record in the path table", () => {
    const rows = pathTable().filter((row) =>
      `${row.paths} ${row.description}`.includes(ROUTE_OF_RECORD),
    );
    expect(
      rows.length,
      `${README_FILE}: the path table never names \`${ROUTE_OF_RECORD}\`, the route runs 15–24 were produced through`,
    ).toBeGreaterThan(0);
  });
});
