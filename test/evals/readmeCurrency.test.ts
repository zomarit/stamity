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
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CASES_DIR, README_FILE, REPO_ROOT, readRepoFile } from "./support.ts";

const PROFILES_FILE = "evals/model-profiles-v1.json";
/** The retired roster `cases-v6/` carried forward, and the directory that carries it. */
const CARRIED_CASES_DIR = "evals/cases-v5";
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

/** Number words the eval pages spell out, so a derived count can be matched in either form. */
const NUMBER_WORDS: Readonly<Record<number, string>> = {
  1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six",
  7: "seven", 8: "eight", 9: "nine", 10: "ten",
};

/**
 * The carried roster's `## Expected` blocks, counted by comparing the two case trees.
 *
 * Derived, because the page had the one shape this file exists to catch: a prose literal
 * nobody recomputes. `cases-v6/` carries every `cases-v5` file, and the set document records
 * that eight of those blocks moved under reviewed dispositions or an amendment — while the
 * README said in three places that every carried block was byte-identical, which is the
 * stronger claim and the false one. Both numbers come off the files here, so the page cannot
 * disagree with the cases again.
 */
const expectedBlock = (dir: string, path: string): string | undefined =>
  readFileSync(join(REPO_ROOT, ...dir.split("/"), ...path.split(/[/\\]/)), "utf8").split(
    "## Expected\n",
  )[1];

const carriedExpectedBlocks = (): { carried: number; identical: number; moved: number } => {
  const files = readdirSync(join(REPO_ROOT, ...CARRIED_CASES_DIR.split("/")), {
    recursive: true,
    encoding: "utf8",
  }).filter((path) => path.endsWith(".md"));
  let identical = 0;
  for (const path of files) {
    if (expectedBlock(CARRIED_CASES_DIR, path) === expectedBlock(CASES_DIR, path)) identical += 1;
  }
  return { carried: files.length, identical, moved: files.length - identical };
};

describe("evals README currency — the carried Expected blocks", () => {
  it("counts the carried roster the same way the case trees do", () => {
    const { carried, identical, moved } = carriedExpectedBlocks();
    expect(carried, `${CARRIED_CASES_DIR} holds no cases to carry`).toBeGreaterThan(0);
    expect(moved, "no carried Expected block moved, so there is nothing for the page to state")
      .toBeGreaterThan(0);
    expect(identical + moved).toBe(carried);
  });

  it("states the moved blocks rather than claiming every one is byte-identical", () => {
    const { carried, identical, moved } = carriedExpectedBlocks();
    const text = readRepoFile(README_FILE);

    // The false stronger claim, in the two spellings the page used for it.
    for (const claim of [
      `${String(carried)} cases with every \`## Expected\` block`,
      "every one of those files with its `## Expected` block byte-identical",
    ]) {
      expect(
        text.includes(claim),
        `${README_FILE}: "${claim}" says every carried block is byte-identical; ${String(moved)} moved`,
      ).toBe(false);
    }

    // The true one, mirroring SET-v7: how many carried, how many held, how many moved.
    expect(
      text,
      `${README_FILE}: never states that ${String(identical)} carried blocks are byte-identical`,
    ).toContain(`${String(identical)} `);
    const sentences = text
      .split("\n\n")
      .filter((block) => block.includes("byte-identical") && block.includes(String(identical)));
    expect(
      sentences.length,
      `${README_FILE}: no passage states ${String(identical)} byte-identical carried blocks`,
    ).toBeGreaterThan(0);
    // The moved count, in either spelling the page may use for it. Both forms are built from
    // the derived number, so neither is a literal this file would have to chase.
    const movedSpelling = new RegExp(`\\b(?:${String(moved)}|${NUMBER_WORDS[moved] ?? ""}) moved\\b`);
    for (const sentence of sentences) {
      expect(
        movedSpelling.test(sentence),
        `${README_FILE}: a passage states the byte-identical count without the ${String(moved)} ` +
          `that moved:\n${sentence}`,
      ).toBe(true);
    }
  });
});

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
