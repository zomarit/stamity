import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — import-safe native ESM contributor instrument, outside the product package.
import { calibrationMatches, parseCase, parseGrade, parseRubric } from "../../scripts/eval/instrument.mjs";
import { readRepoFile as read, REPO_ROOT } from "./support.ts";

interface Fixture {
  id: string;
  scenario: { id: string; brief: string; expected: string };
  transcript: string;
  verdict: string;
  binding: string[];
  advisory: string[];
}
interface Rubric { core: string; fixtures: Fixture[] }

const historical = readdirSync(join(REPO_ROOT, "evals/cases-v4"), { recursive: true, encoding: "utf8" })
  .filter(path => path.endsWith(".md")).map(path => parseCase(read(`evals/cases-v4/${path}`), path));
const legacyText = read("evals/rubric-v5.md");
const currentText = read("evals/rubric-v6.md");
const parse = (text: string): Rubric => parseRubric(text, historical) as Rubric;
const labels = (rubric: Rubric) => rubric.fixtures.map(({ id, verdict, binding, advisory }) => ({ id, verdict, binding, advisory }));
const procedure = (text: string) => text.slice(text.indexOf("\n## Verdict vocabulary\n"));
const bars = (text: string) => text.slice(text.indexOf("Preserve the 447 binding"), text.indexOf("\n## Evidence and release"));
const keyPattern = /^```calibration-labels-v1\n([\s\S]*?)\n```$/m;
const changeKey = (change: (key: string) => string) => currentText.replace(keyPattern, (_block, key: string) =>
  `\`\`\`calibration-labels-v1\n${change(key)}\n\`\`\``);
const firstKey = currentText.match(keyPattern)![0];
const beforeCore = (text: string) => currentText.replace("\n## Verdict vocabulary\n", `\n${text}\n\n## Verdict vocabulary\n`);
const fixtureAt = (id: number) => currentText.indexOf(`### Fixture C${id} —`);

describe("prospective calibration keys", () => {
  it("corrects only C3 B1 while preserving all fixture inputs, criteria and legacy labels", () => {
    const legacy = parse(legacyText), current = parse(currentText);
    expect(current.fixtures).toHaveLength(5);
    const expected = labels(legacy);
    expect(expected[2]?.binding).toEqual(["pass", "pass", "pass", "fail", "fail"]);
    expected[2]!.binding = ["fail", "pass", "pass", "fail", "fail"];
    expect(labels(current)).toEqual(expected);
    expect(parse(read("evals/rubric-v4.md")).fixtures).toEqual(legacy.fixtures);
    for (const [index, fixture] of current.fixtures.entries()) {
      expect(fixture.scenario).toEqual(legacy.fixtures[index]?.scenario);
      expect(fixture.transcript).toBe(legacy.fixtures[index]?.transcript);
    }
    expect(procedure(current.core)).toBe(procedure(legacy.core));
  });

  it("keeps the valid historical disagreement terminal under its original key", () => {
    const legacy = parse(legacyText).fixtures[2]!, current = parse(currentText).fixtures[2]!;
    const output = read("evals/runs/2026-09-11-run-13/calls/r13_call_00003_a1.output.txt");
    const grade = parseGrade(output, legacy.scenario, legacy.transcript);
    expect(calibrationMatches(legacy, grade)).toBe(false);
    // This is a deterministic reader check, never admission or reuse of the old calibration.
    expect(calibrationMatches(current, grade)).toBe(true);
    expect(read("evals/runs/2026-09-11-run-13/summary.json")).toContain('"calibration-C3-mismatch"');
  });

  it("withholds every explicit label and correction note from all judge inputs", () => {
    const rubric = parse(currentText);
    for (const fixture of rubric.fixtures) {
      const input = [rubric.core, fixture.scenario.brief, fixture.scenario.expected, fixture.transcript].join("\n\n");
      expect(input).not.toMatch(/calibration-labels|Expected verdict:|### Fixture|Prospective correction|Run 13/);
    }
  });

  it.each([
    ["missing key block", () => currentText.replace(keyPattern, "")],
    ["malformed key marker", () => currentText.replace("```calibration-labels-v1", "```calibration-labels-v2")],
    ["duplicate key block", () => currentText.replace(keyPattern, "$&\n\n$&")],
    ["missing binding row", () => changeKey(key => key.replace("B1 pass\n", ""))],
    ["missing advisory row", () => changeKey(key => key.replace("A1 pass\n", ""))],
    ["duplicate binding row", () => changeKey(key => key.replace("B1 pass", "B1 pass\nB1 pass"))],
    ["duplicate advisory row", () => changeKey(key => key.replace("A1 pass", "A1 pass\nA1 pass"))],
    ["duplicate verdict row", () => changeKey(key => key.replace("verdict PASS", "verdict PASS\nverdict PASS"))],
    ["extra binding row", () => changeKey(key => key.replace("A1 pass", "B6 pass\nA1 pass"))],
    ["extra advisory row", () => changeKey(key => key.replace("verdict PASS", "A3 pass\nverdict PASS"))],
    ["unknown row", () => changeKey(key => `${key}\nallow pass`)],
    ["zero criterion index", () => changeKey(key => key.replace("B1 pass", "B0 pass"))],
    ["leading zero criterion index", () => changeKey(key => key.replace("B1 pass", "B01 pass"))],
    ["unsupported criterion label", () => changeKey(key => key.replace("B1 pass", "B1 partial"))],
    ["missing case verdict", () => changeKey(key => key.replace("verdict PASS\n", ""))],
    ["contradictory case verdict", () => changeKey(key => key.replace("verdict PASS", "verdict FAIL"))],
    ["contradictory binding label", () => changeKey(key => key.replace("B1 pass", "B1 fail"))],
    ["contradictory advisory numerator", () => changeKey(key => key.replace("advisory 2/2", "advisory 1/2"))],
    ["contradictory advisory denominator", () => changeKey(key => key.replace("advisory 2/2", "advisory 2/3"))],
    ["absent advisory summary", () => changeKey(key => key.replace("\nadvisory 2/2", ""))],
    ["false none-declared advisory", () => changeKey(key => key.replace("advisory 2/2", "advisory none declared"))],
    ["contradictory prose verdict", () => currentText.replace("**Expected verdict: PASS (binding 5/5)", "**Expected verdict: FAIL (binding 5/5)")],
    ["contradictory prose advisory", () => currentText.replace("Expected advisory: 2/2", "Expected advisory: 1/2")],
    ["contradictory prose criterion", () => currentText.replace("B1 fails because naming", "B1 passes because naming")],
    ["manufactured zero-advisory ratio", () => currentText.replace("advisory none declared\n```", "advisory 0/0\n```")],
    ["key with legacy version downgrade", () => currentText.replace("# Judge rubric v6\n", "# Judge rubric v5\n")],
    // v7 is a supported version from SET-v6 on, so the unknown-version case moved to v8.
    ["unknown rubric version", () => currentText.replace("# Judge rubric v6\n", "# Judge rubric v8\n")],
    ["malformed rubric version", () => currentText.replace("# Judge rubric v6\n", "# Judge rubric v6 draft\n")],
  ])("blocks %s before calibration instead of inferring a favorable key", (_name, mutate) => {
    expect(() => parse(mutate())).toThrow();
  });

  it("keeps profile roles, effort, default, set and unselected instruments unchanged", () => {
    const legacy = JSON.parse(read("evals/model-profiles-v1.json"));
    const current = JSON.parse(read("evals/model-profiles-v2.json"));
    // v1 moved to SET-v6 and rubric v7 for both Codex profiles; v2 is the retained
    // prospective document and keeps the rubric and set it was written against.
    expect(current).toEqual({ ...legacy, set: "evals/SET-v5.md", profiles: { ...legacy.profiles,
      "codex-astra": { ...legacy.profiles["codex-astra"], rubric: "evals/rubric-v6.md" },
      "codex-astra-judge": { ...legacy.profiles["codex-astra-judge"], rubric: "evals/rubric-v5.md" } } });
  });

  it.each([
    ["extra key before calibration", () => beforeCore(firstKey)],
    ["key moved into judge core", () => beforeCore(firstKey).replace(`${firstKey}\n\n**Expected verdict:`, "**Expected verdict:")],
    ["unknown key format in judge core", () => beforeCore(firstKey.replace("calibration-labels-v1", "calibration-labels-v9"))],
    ["indented key marker in judge core", () => beforeCore(firstKey.replace("```calibration-labels-v1", "  ```calibration-labels-v1"))],
    ["alternate fence key in judge core", () => beforeCore(firstKey.replaceAll("```", "~~~"))],
    ["stray key before first fixture", () => currentText.replace("### Fixture C1 —", `${firstKey}\n\n### Fixture C1 —`)],
    ["missing last fixture", () => currentText.slice(0, fixtureAt(5))],
    ["substituted fixture ID", () => currentText.replace("### Fixture C5 —", "### Fixture C9 —")],
    ["extra fixture ID", () => `${currentText}\n### Fixture C9 — extra\n`],
    ["unrecognized fixture heading", () => `${currentText}\n### Fixture unknown\n`],
    ["out-of-order fixtures", () => currentText.slice(0, fixtureAt(1)) +
      currentText.slice(fixtureAt(2), fixtureAt(3)) + currentText.slice(fixtureAt(1), fixtureAt(2)) + currentText.slice(fixtureAt(3))],
    ["fixture moved before calibration", () => beforeCore(currentText.slice(fixtureAt(1), fixtureAt(2)))
      .replace(currentText.slice(fixtureAt(1), fixtureAt(2)) + "### Fixture C2 —", "### Fixture C2 —")],
  ])("rejects %s while admitting the complete withheld C1–C5 roster", (_name, mutate) => {
    expect(parse(currentText).fixtures.map(fixture => fixture.id)).toEqual(["C1", "C2", "C3", "C4", "C5"]);
    expect(() => parse(mutate())).toThrow();
  });

  it("retains the ambient baseline, empty wrapper, model controls and scoring bars", () => {
    const protocol = read("evals/session-native-v2.md");
    expect(protocol).toContain("`stamity-session-native-v1`");
    expect(protocol).toContain("fixed additional wrapper is **empty**");
    expect(protocol).toContain("not claim those messages were removed, ignored, or harmless");
    expect(protocol).toContain('`fork_turns: "none"`');
    expect(protocol).toContain('`gpt-6-astra` with `reasoning_effort: "high"`');
    expect(protocol).toContain('`gpt-5.6-sol` with `reasoning_effort: "high"`');
    expect(bars(protocol)).toBe(bars(read("evals/session-native-v1.md")));
    expect(protocol).toContain("mechanically compare the complete proposed tool-call");
    expect(protocol).toContain("neither is independent native plaintext");
  });
});
