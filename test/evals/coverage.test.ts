// The eval-coverage gate: every model-executed artifact is measured or exempted.
//
// `SET-v5.md` states the obligation the AI-evals rule imposes — every behaviour the
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
  isCorpusSource,
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

  it("accounts for every artifact even when no exemption remains", () => {
    // SET-v5 fulfils all seven next-version triggers. Requiring a nonempty
    // exemption list would force retaining a false exemption; coverage itself
    // remains load-bearing through exact artifact accounting and the tests below.
    expect(artifacts.length).toBeGreaterThan(0);
    expect(new Set([...sourced, ...exempted]).size).toBe(artifacts.length);
  });
});

// TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d2-eval-cases): this block
// listed the two `st-setup` cases that sourced `scripts/plugins/setupCommand.mjs`, the module that
// rendered the plugin root's generated `st-setup` body. The plugin route is deleted, both cases left
// the set with it, and `parseSource` no longer admits any `.mjs` source. So the list of cases
// governed outside `content/` is pinned empty; "refuses a .mjs source outside scripts/plugins/" now
// refuses every non-markdown source, that directory included; and "names files that exist and are
// no artifact of the coverage surface", which needed a non-empty list to mean anything, went with
// the list. The list stays computed, so a case sourced at a markdown path outside `content/` still
// shows here as a red test rather than as a quiet way out of the artifact accounting.
describe("eval coverage — no case is governed outside content/", () => {
  const outside = cases
    .map((file) => ({ id: file.basename, path: parseSource(file.frontmatter.get("source") ?? "")?.path }))
    .filter((entry) => entry.path !== undefined && !isCorpusSource(entry.path));

  it("governs no case outside content/", () => {
    expect(
      outside.map((entry) => `${entry.id} → ${entry.path ?? ""}`),
      "the list of cases governed outside `content/**` is empty since 2026-10-14; a case sourced elsewhere leaves the artifact accounting and is not admitted",
    ).toEqual([]);
  });

  it("parses a markdown source and refuses every other shape", () => {
    expect(parseSource("content/commands/st-plan.md:91-100,169-171")).toEqual({
      path: "content/commands/st-plan.md",
      ranges: [
        [91, 100],
        [169, 171],
      ],
    });
    for (const refused of [
      "scripts/plugins/setupCommand.mjs:1-5",
      "scripts/plugins/setupCommand.mjs:104-143",
      "scripts/eval/instrument.mjs:1-5",
      "src/plugins/capabilityFile.ts:1-5",
      "setupCommand.mjs:1-5",
    ]) {
      expect(parseSource(refused), `${refused} must not parse as a source`).toBeNull();
    }
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
