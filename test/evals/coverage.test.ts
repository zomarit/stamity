// The eval-coverage gate: every model-executed artifact is measured or exempted.
//
// `SET-v5.md` states the obligation the AI-evals rule imposes — every behaviour the
// corpus claims maps to at least one case — and v2 had nothing enforcing it. This is
// the enforcement. It derives both sides from the files rather than from a list kept
// here, because a hand-maintained roster is a literal that drifts silently green.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — the manual harness is import-safe native ESM, outside the product package.
import { isSurfaceSource as runnerAdmits, parseCase, recallLabel } from "../../scripts/eval/instrument.mjs";
import {
  CASES_DIR,
  EXEMPTIONS_FILE,
  REPO_ROOT,
  caseFiles,
  contentArtifacts,
  exemptedArtifacts,
  isSurfaceSource,
  parseSource,
  sourcedArtifacts,
  type CaseFile,
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
    // The packs widen the surface (REQ-PACK-013): a pack enumeration that stopped matching would
    // drop every pack artifact out of the accounting at once, so at least one has to be found.
    expect(artifacts.filter((p) => p.startsWith("packs/")).length).toBeGreaterThan(0);
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
//
// TEST CHANGE, justified (2026-10-21, run 2026-10-20_packs-rebuilt, unit u10-eval-surface): the
// surface takes in `packs/` beside `content/` (REQ-PACK-013), so a case may source a pack file and
// this list is now the cases governed outside both roots. It stays computed and pinned empty; only
// the roots it is measured against moved.
describe("eval coverage — no case is governed outside content/ and packs/", () => {
  const outside = cases
    .map((file) => ({ id: file.basename, path: parseSource(file.frontmatter.get("source") ?? "")?.path }))
    .filter((entry) => entry.path !== undefined && !isSurfaceSource(entry.path));

  it("governs no case outside content/ and packs/", () => {
    expect(
      outside.map((entry) => `${entry.id} → ${entry.path ?? ""}`),
      "the list of cases governed outside `content/**` and `packs/**` is empty; a case sourced elsewhere leaves the artifact accounting and is not admitted",
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

/**
 * The pack half of the surface, read off a made-up tree: no case under `evals/` and no pack under
 * `packs/` may be invented to prove it, so the tree lives in a temp directory. It holds one pack of
 * every class (a fork's agent and rule among them), a skill folder with no SKILL.md, a stray file,
 * and one folder that carries pack-shaped files but no `pack.json`.
 */
describe("eval coverage — a pack is part of the surface", () => {
  const root = mkdtempSync(join(tmpdir(), "stamity-eval-surface-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const put = (relPath: string, text = "# fixture\n"): void => {
    const abs = join(root, ...relPath.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  };
  for (const dir of ["charter", "commands", "agents", "rules"]) put(`content/${dir}/core-${dir}.md`);
  put("content/skills/st-core/SKILL.md");
  put("packs/demo/pack.json", "{}\n");
  put("packs/demo/commands/st-demo.md");
  put("packs/demo/agents/stamity-demo.md");
  put("packs/demo/rules/stamity-demo.md");
  put("packs/demo/skills/st-demo/SKILL.md", ["---", "name: st-demo", "description: Demo.", "---", "", "Demo body.", ""].join("\n"));
  put("packs/demo/skills/st-empty/references/notes.md");
  put("packs/demo/skills/loose.md");
  put("packs/loose/commands/st-loose.md");
  put("packs/loose/skills/st-loose/SKILL.md");
  put("packs/README.md");
  const surface = contentArtifacts(root);

  it("enumerates every class of a pack holding a pack.json, a fork's agent and rule included", () => {
    expect(surface.filter((path) => path.startsWith("packs/"))).toEqual([
      "packs/demo/agents/stamity-demo.md",
      "packs/demo/commands/st-demo.md",
      "packs/demo/rules/stamity-demo.md",
      "packs/demo/skills/st-demo/SKILL.md",
    ]);
    expect(surface.filter((path) => path.startsWith("content/"))).toHaveLength(5);
  });

  it("admits a case sourced at a pack skill, counts it, and labels its recall by the skill's folder", () => {
    const source = "packs/demo/skills/st-demo/SKILL.md:6-6";
    const raw = [
      "---", "id: probe-demo-select", "class: probe", 'claim: "A demo request selects st-demo."',
      `source: ${source}`, "metric: classification", "---", "", "## Brief", "", "Pick a skill.", "",
      "## Expected", "", "### Binding criteria — these decide the verdict", "", "1. The response selects st-demo.", "",
      "### Advisory criteria — recorded, never scored into the verdict", "", "1. The response names no other skill.", "",
    ].join("\n");
    const parsed = parseSource(source);
    expect(parsed?.path).toBe("packs/demo/skills/st-demo/SKILL.md");
    expect(isSurfaceSource(parsed?.path ?? "")).toBe(true);
    const made: CaseFile = {
      path: "made-up/probe-demo-select.md",
      basename: "probe-demo-select",
      group: "probes",
      frontmatter: new Map([["source", source]]),
      bodyLines: [],
      raw,
    };
    const counted = [...sourcedArtifacts([made])];
    expect(counted).toEqual(["packs/demo/skills/st-demo/SKILL.md"]);
    expect(surface).toContain(counted[0]);
    // The runner reads the same case: its `case-source` admission and the probe's recall label.
    const scenario = parseCase(raw, made.path);
    expect(scenario.source).toBe("packs/demo/skills/st-demo/SKILL.md");
    expect(runnerAdmits(scenario.source)).toBe(true);
    expect(recallLabel(scenario.source)).toBe("st-demo");
  });

  it("holds the runner's admission to the gate's two surface roots", () => {
    // Built at run time (review/14): written as a literal, a path u18 creates would make this file a
    // declared reader of that spec, which no test-input map entry lists for it.
    const outsideBoth = ["docs", "specs", "packs.md"].join("/");
    for (const [path, admitted] of [
      ["content/commands/st-work.md", true],
      ["packs/demo/skills/st-demo/SKILL.md", true],
      ["packs/demo/rules/stamity-demo.md", true],
      ["packsx/demo/commands/st-demo.md", false],
      ["evals/SET-v7.md", false],
      [outsideBoth, false],
      ["scripts/eval/instrument.mjs", false],
    ] as const) {
      expect(isSurfaceSource(path), `the gate on ${path}`).toBe(admitted);
      expect(runnerAdmits(path), `the runner on ${path}`).toBe(admitted);
    }
    expect(runnerAdmits(undefined)).toBe(false);
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
