// The fixture-count gate: one number, derived from the rubric's own headings.
//
// The calibration fixture count is quoted in three places — the set's run-artifact
// contract, the evals README, and (in v2's wording) the runner skill. Each of those is a
// literal that nothing recomputes, and this repository has already paid for that shape
// once: `rubric-v2.md` shipped with a fifth fixture while sentences around it still said
// four. The rubric's `### Fixture C` headings are the source of truth; every other page
// either derives the number or does not state one.
import { describe, expect, it } from "vitest";
import { README_FILE, RUBRIC_FILE, RUNNER_SKILL_FILE, SET_FILE, readRepoFile } from "./support.ts";

const NUMBER_WORDS = new Map<string, number>([
  ["zero", 0],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
]);

const NUMBER = `(?:${[...NUMBER_WORDS.keys()].join("|")}|\\d+)`;

/** "five fixtures", "4 calibration fixtures" — a count sitting in front of the noun. */
const COUNT_BEFORE_NOUN = new RegExp(`\\b(${NUMBER})\\b(?:[ \\t]+[^\\s]+){0,2}[ \\t]+fixtures?\\b`, "gi");
/** "…under a `### Fixture` heading — five today" — the derived form the set uses. */
const COUNT_AS_TODAY = new RegExp(`—[ \\t]*(${NUMBER})[ \\t]+today\\b`, "gi");

const toNumber = (token: string): number =>
  NUMBER_WORDS.get(token.toLowerCase()) ?? Number.parseInt(token, 10);

/** Every fixture count a page states, in either form, as numbers. */
const statedCounts = (text: string): number[] => {
  const found: number[] = [];
  for (const pattern of [COUNT_BEFORE_NOUN, COUNT_AS_TODAY]) {
    for (const match of text.matchAll(pattern)) found.push(toNumber(match[1] ?? ""));
  }
  return found;
};

const rubric = readRepoFile(RUBRIC_FILE);
const declared = rubric.split("\n").filter((line) => line.startsWith("### Fixture C")).length;

/** Run-artifact item 9 — from its own numbered line to the start of item 10. */
const runArtifactItemNine = (): string => {
  const lines = readRepoFile(SET_FILE).split("\n");
  const start = lines.findIndex((line) => line.startsWith("9. **Judge calibration result**"));
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("10. "));
  return [lines[start] ?? "", ...(end === -1 ? rest : rest.slice(0, end))].join("\n");
};

/** The runner skill's calibration step — its own heading to the next one. */
const calibrationStep = (): string => {
  const lines = readRepoFile(RUNNER_SKILL_FILE).split("\n");
  const start = lines.findIndex((line) => line.startsWith("## 2. Calibration gate"));
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return [lines[start] ?? "", ...(end === -1 ? rest : rest.slice(0, end))].join("\n");
};

describe("calibration fixture count — derived from the rubric", () => {
  it("finds the fixtures the rubric declares", () => {
    expect(declared, `${RUBRIC_FILE} declares no \`### Fixture C\` headings`).toBeGreaterThan(0);
  });

  it("is stated by the set's run-artifact item 9, and stated once", () => {
    const item = runArtifactItemNine();
    expect(item, `${SET_FILE}: run-artifact item 9 not found`).not.toBe("");
    const counts = statedCounts(item);
    expect(
      counts.length,
      `${SET_FILE}: run-artifact item 9 states no fixture count; it must name the number the rubric declares`,
    ).toBeGreaterThan(0);
    expect(
      counts,
      `${SET_FILE}: run-artifact item 9 states a fixture count that is not ${declared}`,
    ).toEqual(counts.map(() => declared));
  });

  it("is stated by the evals README, and stated once", () => {
    const counts = statedCounts(readRepoFile(README_FILE));
    expect(
      counts.length,
      `${README_FILE}: states no fixture count; it must name the number the rubric declares`,
    ).toBeGreaterThan(0);
    expect(counts, `${README_FILE}: states a fixture count that is not ${declared}`).toEqual(
      counts.map(() => declared),
    );
  });

  it("is not contradicted anywhere else in the set document or the README", () => {
    for (const page of [SET_FILE, README_FILE]) {
      const wrong = statedCounts(readRepoFile(page)).filter((count) => count !== declared);
      expect(wrong, `${page}: states a fixture count other than ${declared}`).toEqual([]);
    }
  });
});

describe("calibration fixture count — the runner skill", () => {
  it("points its calibration step at the rubric's fixtures", () => {
    const step = calibrationStep();
    expect(step, `${RUNNER_SKILL_FILE}: no \`## 2. Calibration gate\` section`).not.toBe("");
    expect(
      /fixture/i.test(step),
      `${RUNNER_SKILL_FILE}: the calibration step never mentions the rubric's fixtures`,
    ).toBe(true);
  });

  it("states no literal count, or the same one", () => {
    // The skill is the page most likely to be read without the rubric open, so the
    // preferred wording carries no number at all — "every fixture the rubric declares".
    // A number is admitted only when it agrees with the rubric.
    const wrong = statedCounts(readRepoFile(RUNNER_SKILL_FILE)).filter((c) => c !== declared);
    expect(
      wrong,
      `${RUNNER_SKILL_FILE}: states a fixture count other than ${declared}; prefer "every fixture the rubric declares"`,
    ).toEqual([]);
  });
});
