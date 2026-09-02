// The eval-coverage gate: every model-executed artifact is measured or exempted.
//
// `SET-v3.md` states the obligation the AI-evals rule imposes — every behaviour the
// corpus claims maps to at least one case — and v2 had nothing enforcing it. This is
// the enforcement. It derives both sides from the files rather than from a list kept
// here, because a hand-maintained roster is a literal that drifts silently green.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CASES_DIR,
  EXEMPTIONS_FILE,
  REPO_ROOT,
  caseFiles,
  contentArtifacts,
  exemptedArtifacts,
  parseSource,
  sourcedArtifacts,
} from "./support.ts";

const artifacts = contentArtifacts();
const cases = caseFiles();
const sourced = sourcedArtifacts(cases);
const exempted = exemptedArtifacts();

describe("eval coverage — the derivation is not vacuous", () => {
  it("finds artifacts across all five globs", () => {
    // A glob that stops matching would silently exempt a whole class, so each of the
    // five prefixes has to be represented before any assertion below means anything.
    expect(artifacts.filter((p) => p.startsWith("content/charter/")).length).toBeGreaterThan(0);
    expect(artifacts.filter((p) => p.startsWith("content/commands/")).length).toBeGreaterThan(0);
    expect(artifacts.filter((p) => p.startsWith("content/agents/")).length).toBeGreaterThan(0);
    expect(artifacts.filter((p) => p.startsWith("content/skills/")).length).toBeGreaterThan(0);
    expect(artifacts.filter((p) => p.startsWith("content/rules/")).length).toBeGreaterThan(0);
    expect(artifacts.length).toBeGreaterThanOrEqual(30);
  });

  it("reads a source locator out of every case file", () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
    const unparsed = cases
      .filter((file) => parseSource(file.frontmatter.get("source") ?? "") === null)
      .map((file) => file.path);
    expect(unparsed, `cases under ${CASES_DIR} with an unparsable source:`).toEqual([]);
    expect(sourced.size).toBeGreaterThan(0);
  });

  it("reads at least one heading out of the exemption file", () => {
    // Zero headings would pass every "artifact is covered or exempt" assertion for
    // the covered artifacts and fail loudly for the rest; this guard is here so a
    // parser change that stops matching headings cannot read as "nothing exempt".
    expect(exempted.length, `${EXEMPTIONS_FILE} declares no exemption rows`).toBeGreaterThan(0);
  });
});

describe("eval coverage — every artifact is measured or exempted", () => {
  const uncovered = artifacts.filter((p) => !sourced.has(p) && !exempted.includes(p));

  it("names no artifact that is neither sourced by a case nor exempted", () => {
    expect(
      uncovered,
      `these content artifacts are named by no case \`source:\` under ${CASES_DIR} and carry no row in ${EXEMPTIONS_FILE}; add a case or a written exemption`,
    ).toEqual([]);
  });

  for (const artifact of artifacts) {
    it(`covers ${artifact}`, () => {
      const covered = sourced.has(artifact);
      const exempt = exempted.includes(artifact);
      expect(
        covered || exempt,
        `${artifact} has no case and no exemption row in ${EXEMPTIONS_FILE}`,
      ).toBe(true);
    });
  }
});

describe("eval coverage — no exemption outlives its gap", () => {
  it("lists every exempt path exactly once", () => {
    const seen = new Set<string>();
    const duplicated = exempted.filter((p) => (seen.has(p) ? true : (seen.add(p), false)));
    expect(duplicated, `${EXEMPTIONS_FILE} repeats these paths`).toEqual([]);
  });

  for (const path of exempted) {
    it(`exempts ${path}, which exists and no case covers`, () => {
      expect(
        existsSync(join(REPO_ROOT, ...path.split("/"))),
        `${EXEMPTIONS_FILE} exempts ${path}, which does not exist`,
      ).toBe(true);
      expect(
        artifacts.includes(path),
        `${EXEMPTIONS_FILE} exempts ${path}, which is not one of this surface's artifacts`,
      ).toBe(true);
      const owners = cases
        .filter((file) => parseSource(file.frontmatter.get("source") ?? "")?.path === path)
        .map((file) => file.basename);
      expect(
        owners,
        `${EXEMPTIONS_FILE} still exempts ${path}, but these cases now source it — delete the row in the change that landed them`,
      ).toEqual([]);
    });
  }
});
