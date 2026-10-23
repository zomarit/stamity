import { describe, expect, it } from "vitest";
import {
  AUTONOMOUS_ACTS,
  autonomyMarkerLine,
  loosens,
  matchesDeployingBranch,
  parseAutonomyMarker,
  readAutonomy,
  resolveAutonomy,
  strictestAutonomy,
  type ResolvedAutonomy,
} from "../../src/config/autonomy.ts";
import { collectManifestErrors, createManifest } from "../../src/manifest/manifest.ts";
import { DEPLOYING_ACTS, type AutonomyConfig, type SetupManifest } from "../../src/types/manifest.ts";

/**
 * The autonomy setting's pure half (plan 022 file 1, unit a3-autonomy-config;
 * REQ-FLOW-137, REQ-FLOW-138's comparison): how a manifest's `autonomy` block
 * resolves, when one setting is looser than another, the guard copy's marker
 * line, the deploying-branch pattern, and what the manifest schema admits.
 *
 * Plain values in, plain values out: no file system, no git, no mock.
 */

function resolved(autonomy?: AutonomyConfig): ResolvedAutonomy {
  return resolveAutonomy(autonomy === undefined ? {} : { autonomy });
}

function manifestWith(autonomy: unknown): SetupManifest {
  const manifest = createManifest({
    tools: ["claude"],
    selection: { items: { agent: [], skill: [], rule: [], command: [] } },
    generatorVersion: "0.0.0",
    now: new Date("2026-01-01T00:00:00.000Z"),
  });
  return { ...manifest, autonomy } as SetupManifest;
}

describe("resolveAutonomy", () => {
  it("resolves an absent block to the autonomous default with nothing named", () => {
    expect(resolveAutonomy({})).toEqual({
      mode: "autonomous",
      runs: ["pr-ready", "tag"],
      deployingBranches: [],
      deploying: [],
    });
  });

  it("runs nothing in mode ask, and keeps the named acts and branches", () => {
    expect(resolved({ mode: "ask", deployingActs: ["workflow-dispatch"], deployingBranches: ["main"] })).toEqual({
      mode: "ask",
      runs: [],
      deployingBranches: ["main"],
      deploying: ["workflow-dispatch"],
    });
  });

  it("takes a named act out of what runs, in canonical order, without repeats", () => {
    expect(resolved({ deployingActs: ["push-default", "pr-ready", "pr-ready"] })).toEqual({
      mode: "autonomous",
      runs: ["tag"],
      deployingBranches: [],
      deploying: ["pr-ready", "push-default"],
    });
  });

  it("keeps the first spelling of a branch named twice in different case", () => {
    expect(resolved({ deployingBranches: ["Production", "production", "release/*"] }).deployingBranches).toEqual([
      "Production",
      "release/*",
    ]);
  });

  it("is the one reader the land verb imports", () => {
    expect(readAutonomy).toBe(resolveAutonomy);
    expect(AUTONOMOUS_ACTS).toEqual(["pr-ready", "tag"]);
  });
});

describe("loosens", () => {
  const cases: readonly [string, AutonomyConfig | undefined, AutonomyConfig | undefined, boolean][] = [
    ["ask to autonomous", { mode: "autonomous" }, { mode: "ask" }, true],
    ["autonomous to ask", { mode: "ask" }, { mode: "autonomous" }, false],
    ["an act that starts to run", undefined, { deployingActs: ["tag"] }, true],
    ["an act that stops running", { deployingActs: ["tag"] }, undefined, false],
    ["workflow-dispatch no longer named", undefined, { deployingActs: ["workflow-dispatch"] }, true],
    ["a branch no longer named", { deployingBranches: ["main"] }, { deployingBranches: ["main", "production"] }, true],
    ["a branch newly named", { deployingBranches: ["main", "production"] }, { deployingBranches: ["main"] }, false],
    ["a pattern narrowed to one of its names", { deployingBranches: ["release/1.17"] }, { deployingBranches: ["release/*"] }, true],
    ["the same branch in another case and under refs/heads/", { deployingBranches: ["refs/heads/MAIN"] }, { deployingBranches: ["main"] }, false],
    ["the same setting", { mode: "ask", deployingActs: ["pr-merge"] }, { mode: "ask", deployingActs: ["pr-merge"] }, false],
  ];

  for (const [label, next, baseline, expected] of cases) {
    it(`reads ${label} as ${expected ? "looser" : "not looser"}`, () => {
      expect(loosens(resolved(next), resolved(baseline))).toBe(expected);
    });
  }
});

describe("strictestAutonomy", () => {
  it("takes mode ask from any leg and the union of the named acts and branches", () => {
    const strict = strictestAutonomy(
      resolved({ deployingActs: ["tag"], deployingBranches: ["main"] }),
      resolved({ mode: "ask", deployingActs: ["pr-merge"] }),
      resolved({ deployingBranches: ["MAIN", "release/*"] }),
    );

    expect(strict).toEqual({
      mode: "ask",
      runs: [],
      deployingBranches: ["main", "release/*"],
      deploying: ["tag", "pr-merge"],
    });
  });

  it("intersects what runs when every leg is autonomous", () => {
    expect(strictestAutonomy(resolved({ deployingActs: ["tag"] }), resolved({ deployingActs: ["pr-ready"] })).runs).toEqual(
      [],
    );
    expect(strictestAutonomy(resolved(), resolved({ deployingActs: ["pr-ready"] })).runs).toEqual(["tag"]);
  });

  it("is looser than a candidate exactly when one of its legs is", () => {
    const legs = [resolved({ deployingBranches: ["main"] }), resolved({ deployingActs: ["workflow-dispatch"] })];
    const baseline = strictestAutonomy(legs[0]!, legs[1]!);
    const candidates = [
      resolved(),
      resolved({ deployingBranches: ["main"] }),
      resolved({ deployingBranches: ["main"], deployingActs: ["workflow-dispatch"] }),
      resolved({ mode: "ask", deployingBranches: ["main"], deployingActs: ["workflow-dispatch"] }),
    ];
    for (const candidate of candidates) {
      expect(loosens(candidate, baseline)).toBe(legs.some((leg) => loosens(candidate, leg)));
    }
    expect(candidates.map((candidate) => loosens(candidate, baseline))).toEqual([true, true, false, false]);
  });
});

describe("the guard copy's marker line", () => {
  it("round-trips a resolved setting through the line a guard copy carries", () => {
    const setting = resolved({ deployingActs: ["pr-ready", "workflow-dispatch"], deployingBranches: ["production"] });
    const line = autonomyMarkerLine(setting);

    expect(line.startsWith("// stamity-autonomy {")).toBe(true);
    expect(parseAutonomyMarker(`#!/usr/bin/env node\n// generated\n${line}\nconst x = 1;\n`)).toEqual(setting);
  });

  it("reads a copy with no marker as absent", () => {
    expect(parseAutonomyMarker("#!/usr/bin/env node\n// stamity 1.16.0 generated\n")).toBeNull();
  });

  it("reads an unreadable or inconsistent marker as the strictest setting it can state", () => {
    const strictest = resolved({ mode: "ask", deployingActs: [...DEPLOYING_ACTS] });
    const tampered = JSON.stringify({ ...resolved({ mode: "ask" }), runs: ["pr-ready", "tag"] });

    expect(parseAutonomyMarker("// stamity-autonomy {not json\n")).toEqual(strictest);
    expect(parseAutonomyMarker("// stamity-autonomy {\"mode\":\"lax\"}\n")).toEqual(strictest);
    expect(parseAutonomyMarker(`// stamity-autonomy ${tampered}\n`)).toEqual(strictest);
  });

  it("takes the strictest of two marker lines in one copy", () => {
    const text = `${autonomyMarkerLine(resolved())}\n${autonomyMarkerLine(resolved({ mode: "ask" }))}\n`;
    expect(parseAutonomyMarker(text)?.mode).toBe("ask");
  });
});

describe("matchesDeployingBranch", () => {
  it("lets a `*` match inside one path segment only", () => {
    expect(matchesDeployingBranch("release/1.17", ["release/*"])).toBe(true);
    expect(matchesDeployingBranch("release/1.17/hotfix", ["release/*"])).toBe(false);
  });

  it("matches an exact name only to itself", () => {
    expect(matchesDeployingBranch("production", ["production"])).toBe(true);
    expect(matchesDeployingBranch("production-eu", ["production"])).toBe(false);
    expect(matchesDeployingBranch("pre.production", ["pre?production", "pre+production"])).toBe(false);
    expect(matchesDeployingBranch("main", [])).toBe(false);
  });

  it("ignores case and a refs/heads/ prefix on either side", () => {
    expect(matchesDeployingBranch("refs/heads/Production", ["production"])).toBe(true);
    expect(matchesDeployingBranch("main", ["refs/heads/MAIN"])).toBe(true);
  });
});

describe("the manifest schema's autonomy block", () => {
  it("admits a full block and an absent one", () => {
    expect(collectManifestErrors(manifestWith(undefined))).toEqual([]);
    expect(
      collectManifestErrors(
        manifestWith({ mode: "ask", deployingBranches: ["main", "release/*"], deployingActs: [...DEPLOYING_ACTS] }),
      ),
    ).toEqual([]);
  });

  const refused: readonly [string, unknown, string][] = [
    ["a block that is not an object", ["ask"], "`autonomy` must be an object"],
    ["a mode outside the set", { mode: "lax" }, "`autonomy.mode` must be one of autonomous | ask"],
    [
      "an act outside the set",
      { deployingActs: ["force-push"] },
      "`autonomy.deployingActs` names unknown act \"force-push\" (known: pr-ready, tag, workflow-dispatch, pr-merge, push-default)",
    ],
    ["acts that are not a list", { deployingActs: "tag" }, "`autonomy.deployingActs` must be an array"],
    ["branches that are not a list", { deployingBranches: "main" }, "`autonomy.deployingBranches` must be an array"],
    ["an empty branch", { deployingBranches: [""] }, "`autonomy.deployingBranches[0]` \"\" is empty"],
    ["a branch with a space", { deployingBranches: ["main branch"] }, "`autonomy.deployingBranches[0]`"],
    ["a branch with `..`", { deployingBranches: ["a..b"] }, "`autonomy.deployingBranches[0]`"],
    ["a branch ending in .lock", { deployingBranches: ["main.lock"] }, "`autonomy.deployingBranches[0]`"],
    ["a branch starting with `-`", { deployingBranches: ["-f"] }, "`autonomy.deployingBranches[0]`"],
    ["a branch with an empty segment", { deployingBranches: ["release//x"] }, "`autonomy.deployingBranches[0]`"],
    ["a branch with a dot segment", { deployingBranches: ["release/.x"] }, "`autonomy.deployingBranches[0]`"],
    ["a branch that is not a string", { deployingBranches: [7] }, "`autonomy.deployingBranches[0]` must be a string"],
    ["a branch past 255 characters", { deployingBranches: ["b".repeat(256)] }, "longer than 255 characters"],
    [
      "more than 32 branches",
      { deployingBranches: Array.from({ length: 33 }, (_, index) => `b${index}`) },
      "`autonomy.deployingBranches` names more than 32 branches",
    ],
    ["an unknown field", { deployingBranch: ["main"] }, "unknown field `autonomy.deployingBranch`"],
  ];

  for (const [label, block, fragment] of refused) {
    it(`refuses ${label}`, () => {
      const errors = collectManifestErrors(manifestWith(block));
      expect(errors.some((error) => error.includes(fragment)), errors.join("\n")).toBe(true);
    });
  }

  it("admits a branch of exactly 255 characters and exactly 32 branches", () => {
    expect(collectManifestErrors(manifestWith({ deployingBranches: ["b".repeat(255)] }))).toEqual([]);
    expect(
      collectManifestErrors(manifestWith({ deployingBranches: Array.from({ length: 32 }, (_, index) => `b${index}`) })),
    ).toEqual([]);
  });
});
