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

  // review/19: the land verb reads committed manifests no schema check passed.
  const STRICTEST = { mode: "ask", runs: [], deploying: [...DEPLOYING_ACTS] };
  for (const [label, block] of [
    ["a mode spelled Ask", { mode: "Ask" }],
    ["a mode spelled ASK", { mode: "ASK" }],
    ["a string of acts", { deployingActs: "pr-merge" }],
    ["an unknown act", { deployingActs: ["pr-merge", "force-push"] }],
    ["a string of branches", { deployingBranches: "production" }],
    ["an unknown member", { mode: "autonomous", deployingBranch: ["production"] }],
    ["a block that is not an object", "ask"],
  ] as const) {
    it(`fails closed on ${label}: mode ask with every act named, never the default`, () => {
      expect(readAutonomy({ autonomy: block })).toEqual({ ...STRICTEST, deployingBranches: [] });
    });
  }

  it("keeps the branch names it can read when it fails closed", () => {
    expect(readAutonomy({ autonomy: { mode: "Ask", deployingBranches: ["production", 7, "release/*"] } })).toEqual({
      ...STRICTEST,
      deployingBranches: ["production", "release/*"],
    });
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

  // review/18: GitHub's `releases/**` filter shape crosses `/`, and the list admits it.
  it("lets a `**` match across path segments", () => {
    expect(matchesDeployingBranch("release/1.17/hotfix", ["release/**"])).toBe(true);
    expect(matchesDeployingBranch("release/1.17", ["release/**"])).toBe(true);
    expect(matchesDeployingBranch("releases/1.17", ["release/**"])).toBe(false);
    expect(matchesDeployingBranch("feature/a/b", ["**"])).toBe(true);
    expect(matchesDeployingBranch("feature/a/b", ["feature/*/b"])).toBe(true);
    expect(matchesDeployingBranch("feature/a/c/b", ["feature/*/b"])).toBe(false);
  });

  // Round 2 (the held-back Minor of a3-security-r2): no backtracking regular expression.
  it("answers a pattern of many wildcards against a long near-miss name within a fixed time", () => {
    const pattern = `${"*a".repeat(13)}*b`;
    const nearMiss = `${"a".repeat(30)}c`;
    const started = performance.now();
    const verdict = matchesDeployingBranch(nearMiss, [pattern, `release/${"**x".repeat(60)}`]);
    const elapsed = performance.now() - started;

    expect(verdict).toBe(false);
    // The regex form this replaced takes seconds on these inputs; the table takes well under one.
    expect(elapsed).toBeLessThan(250);
  });

  it("keeps the wildcard rules inside a segment and across one", () => {
    expect(matchesDeployingBranch("release/v1.17", ["release/v*"])).toBe(true);
    expect(matchesDeployingBranch("release/x1.17", ["release/v*"])).toBe(false);
    expect(matchesDeployingBranch("a/x/y/b", ["a**b"])).toBe(true);
    expect(matchesDeployingBranch("a/x/y/b", ["a***b", "nothing"])).toBe(true);
    expect(matchesDeployingBranch("ab", ["a*b"])).toBe(true);
    expect(matchesDeployingBranch("a/b", ["a*b"])).toBe(false);
    expect(matchesDeployingBranch("", ["*"])).toBe(true);
    expect(matchesDeployingBranch("main", [""])).toBe(false);
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

/**
 * The four factory keys (plan 023 file 1, unit settings; REQ-FLOW-137, REQ-FLOW-138): each resolves, parses back from a
 * marker, compares and combines, and is absent when off, so a default setting's bytes do not move.
 */
describe("the factory keys", () => {
  const AUTO_SHIP = { maxFiles: 10, maxLines: 200, classes: ["records", "docs", "tests"] };
  const REVIEW_TOOL = {
    login: "chatgpt-codex-connector[bot]",
    request: "@codex review",
    clean: "state-comment",
    stateMarker: "codex-review-state:v1",
    stateSection: "code_review",
    waitMinutes: 40,
    rounds: 2,
  } as const;
  const LAND_JOB = { workflows: ["CI"] };
  const ALL_ON: AutonomyConfig = { adminRuleProof: true, autoShip: AUTO_SHIP, reviewTool: REVIEW_TOOL, landJob: LAND_JOB };

  describe("resolveAutonomy", () => {
    it("carries each key on, in the fixed order, and leaves each absent when off", () => {
      expect(Object.keys(resolved(ALL_ON))).toEqual([
        "mode",
        "runs",
        "deployingBranches",
        "deploying",
        "adminRuleProof",
        "autoShip",
        "reviewTool",
        "landJob",
      ]);
      expect(resolved(ALL_ON)).toMatchObject(ALL_ON);
      expect(Object.keys(resolved({ adminRuleProof: false }))).toEqual(["mode", "runs", "deployingBranches", "deploying"]);
    });

    const unreadable: readonly [string, unknown][] = [
      ["a rounds of 4", { reviewTool: { ...REVIEW_TOOL, rounds: 4 } }],
      ["a wait of 0", { reviewTool: { ...REVIEW_TOOL, waitMinutes: 0 } }],
      ["a clean word outside the set", { reviewTool: { ...REVIEW_TOOL, clean: "silence" } }],
      ["a request on two lines", { reviewTool: { ...REVIEW_TOOL, request: "@codex\nreview" } }],
      ["a login of another shape", { reviewTool: { ...REVIEW_TOOL, login: "not a login" } }],
      ["a maxFiles of 0", { autoShip: { ...AUTO_SHIP, maxFiles: 0 } }],
      ["a maxLines of 1.5", { autoShip: { ...AUTO_SHIP, maxLines: 1.5 } }],
      ["an unknown member inside a key", { landJob: { workflows: ["CI"], extra: true } }],
      ["workflows that are not a list", { landJob: { workflows: "CI" } }],
      ["adminRuleProof as a word", { adminRuleProof: "on" }],
    ];
    for (const [label, block] of unreadable) {
      it(`fails closed on ${label}: mode ask, every act named, nothing loosening kept`, () => {
        expect(resolveAutonomy({ autonomy: block })).toEqual(resolved({ mode: "ask", deployingActs: [...DEPLOYING_ACTS] }));
      });
    }

    it("keeps a review tool it can read out of a block it cannot, since dropping it would loosen", () => {
      const setting = resolveAutonomy({ autonomy: { mode: "Ask", reviewTool: REVIEW_TOOL, autoShip: AUTO_SHIP } });
      expect(setting).toEqual(resolved({ mode: "ask", deployingActs: [...DEPLOYING_ACTS], reviewTool: REVIEW_TOOL }));
    });
  });

  describe("the marker line", () => {
    const each: readonly [string, AutonomyConfig][] = [
      ["adminRuleProof", { adminRuleProof: true }],
      ["autoShip", { autoShip: AUTO_SHIP }],
      ["autoShip with paths", { autoShip: { ...AUTO_SHIP, paths: ["site-notes/**"] } }],
      ["reviewTool", { reviewTool: REVIEW_TOOL }],
      ["landJob", { landJob: LAND_JOB }],
      ["all four", ALL_ON],
    ];
    for (const [label, block] of each) {
      it(`parses ${label} back byte for byte`, () => {
        const line = autonomyMarkerLine(resolved(block));
        const back = parseAutonomyMarker(`${line}\n`);
        expect(back).toEqual(resolved(block));
        expect(autonomyMarkerLine(back as ResolvedAutonomy)).toBe(line);
      });
    }

    it("writes nothing new for a setting with every key off", () => {
      expect(autonomyMarkerLine(resolved())).toBe(
        '// stamity-autonomy {"mode":"autonomous","runs":["pr-ready","tag"],"deployingBranches":[],"deploying":[]}',
      );
    });

    it("reads a marker from before the keys as every key off", () => {
      const older = '// stamity-autonomy {"mode":"autonomous","runs":["pr-ready","tag"],"deployingBranches":[],"deploying":[]}\n';
      expect(parseAutonomyMarker(older)).toEqual(resolved());
    });

    const strictest = resolved({ mode: "ask", deployingActs: [...DEPLOYING_ACTS] });
    const head = '"mode":"autonomous","runs":["pr-ready","tag"],"deployingBranches":[],"deploying":[]';

    it("reads keys out of order as unreadable", () => {
      const swapped = `{${head},"landJob":{"workflows":["CI"]},"adminRuleProof":true}`;
      const inner = `{${head},"autoShip":{"maxLines":200,"maxFiles":10,"classes":["docs"]}}`;
      expect(parseAutonomyMarker(`// stamity-autonomy ${swapped}\n`)).toEqual(strictest);
      expect(parseAutonomyMarker(`// stamity-autonomy ${inner}\n`)).toEqual(strictest);
    });

    it("reads a key spelled off, or a value the schema refuses, as unreadable", () => {
      expect(parseAutonomyMarker(`// stamity-autonomy {${head},"adminRuleProof":false}\n`)).toEqual(strictest);
      expect(parseAutonomyMarker(`// stamity-autonomy {${head},"landJob":null}\n`)).toEqual(strictest);
      expect(parseAutonomyMarker(`// stamity-autonomy {${head},"autoShip":{"maxFiles":0,"maxLines":1,"classes":[]}}\n`)).toEqual(strictest);
    });
  });

  describe("loosens", () => {
    const wider = (change: object): AutonomyConfig => ({ autoShip: { ...AUTO_SHIP, ...change } });
    const tool = (change: object): AutonomyConfig => ({ reviewTool: { ...REVIEW_TOOL, ...change } });
    const pairs: readonly [string, AutonomyConfig, AutonomyConfig][] = [
      ["turning adminRuleProof on", { adminRuleProof: true }, {}],
      ["turning autoShip on", { autoShip: AUTO_SHIP }, {}],
      ["turning landJob on", { landJob: LAND_JOB }, {}],
      ["raising autoShip's maxFiles", wider({ maxFiles: 11 }), { autoShip: AUTO_SHIP }],
      ["raising autoShip's maxLines", wider({ maxLines: 201 }), { autoShip: AUTO_SHIP }],
      ["adding an autoShip class", wider({ classes: [...AUTO_SHIP.classes, "product"] }), { autoShip: AUTO_SHIP }],
      ["dropping autoShip's paths", wider({}), wider({ paths: ["site-notes/**"] })],
      ["adding an autoShip path", wider({ paths: ["site-notes/**", "site-code/**"] }), wider({ paths: ["site-notes/**"] })],
      ["dropping the review tool", {}, { reviewTool: REVIEW_TOOL }],
      ["shortening the review wait", tool({ waitMinutes: 10 }), { reviewTool: REVIEW_TOOL }],
      ["lowering the review rounds", tool({ rounds: 1 }), { reviewTool: REVIEW_TOOL }],
    ];
    for (const [label, looser, stricter] of pairs) {
      it(`reads ${label} as looser, and the reverse as not`, () => {
        expect(loosens(resolved(looser), resolved(stricter))).toBe(true);
        expect(loosens(resolved(stricter), resolved(looser))).toBe(false);
      });
    }

    it("reads another tool, or a weaker proof of clean, as looser", () => {
      expect(loosens(resolved(tool({ login: "another-reviewer[bot]" })), resolved({ reviewTool: REVIEW_TOOL }))).toBe(true);
      expect(loosens(resolved(tool({ clean: "reaction" })), resolved({ reviewTool: REVIEW_TOOL }))).toBe(true);
    });

    it("reads moving the job onto other workflows as looser, and the same keys as not", () => {
      expect(loosens(resolved({ landJob: { workflows: ["Deploy"] } }), resolved({ landJob: LAND_JOB }))).toBe(true);
      expect(loosens(resolved(ALL_ON), resolved(ALL_ON))).toBe(false);
    });
  });

  describe("strictestAutonomy", () => {
    it("keeps adminRuleProof, autoShip and landJob only when every leg holds them equal", () => {
      const on = resolved({ adminRuleProof: true, autoShip: AUTO_SHIP, landJob: LAND_JOB });
      expect(strictestAutonomy(on, on)).toEqual(on);
      expect(strictestAutonomy(on, resolved())).toEqual(resolved());
      expect(strictestAutonomy(resolved(), on)).toEqual(resolved());
      expect(strictestAutonomy(on, resolved({ adminRuleProof: true, autoShip: { ...AUTO_SHIP, maxFiles: 9 }, landJob: LAND_JOB }))).toEqual(
        resolved({ adminRuleProof: true, landJob: LAND_JOB }),
      );
    });

    it("keeps the review tool if any leg names it, with the highest rounds and the longest wait", () => {
      const one = resolved({ reviewTool: { ...REVIEW_TOOL, rounds: 1, waitMinutes: 60 } });
      const three = resolved({ reviewTool: { ...REVIEW_TOOL, rounds: 3, waitMinutes: 20 } });
      expect(strictestAutonomy(resolved(), one).reviewTool).toEqual({ ...REVIEW_TOOL, rounds: 1, waitMinutes: 60 });
      expect(strictestAutonomy(one, resolved(), three).reviewTool).toEqual({ ...REVIEW_TOOL, rounds: 3, waitMinutes: 60 });
    });

    it("is looser than a candidate when one of its legs is, the review tool included", () => {
      const legs = [resolved({ reviewTool: REVIEW_TOOL }), resolved({ reviewTool: { ...REVIEW_TOOL, rounds: 3 } })];
      const baseline = strictestAutonomy(legs[0]!, legs[1]!);
      const candidates = [resolved(), resolved({ reviewTool: REVIEW_TOOL }), resolved({ reviewTool: { ...REVIEW_TOOL, rounds: 3 } })];
      for (const candidate of candidates) {
        expect(loosens(candidate, baseline)).toBe(legs.some((leg) => loosens(candidate, leg)));
      }
      expect(candidates.map((candidate) => loosens(candidate, baseline))).toEqual([true, true, false]);
    });
  });

  describe("the manifest schema", () => {
    it("admits the four keys, at each range's ends", () => {
      expect(collectManifestErrors(manifestWith(ALL_ON))).toEqual([]);
      expect(collectManifestErrors(manifestWith({ autoShip: { ...AUTO_SHIP, paths: ["site-notes/**"] } }))).toEqual([]);
      expect(collectManifestErrors(manifestWith({ reviewTool: { ...REVIEW_TOOL, rounds: 1, waitMinutes: 120 } }))).toEqual([]);
      expect(collectManifestErrors(manifestWith({ reviewTool: { ...REVIEW_TOOL, rounds: 3, waitMinutes: 1 } }))).toEqual([]);
    });

    const refused: readonly [string, unknown, string][] = [
      ["adminRuleProof that is not a boolean", { adminRuleProof: "on" }, "`autonomy.adminRuleProof` must be a boolean"],
      ["a rounds of 4", { reviewTool: { ...REVIEW_TOOL, rounds: 4 } }, "`autonomy.reviewTool.rounds` must be a whole number from 1 to 3"],
      ["a rounds of 0", { reviewTool: { ...REVIEW_TOOL, rounds: 0 } }, "`autonomy.reviewTool.rounds`"],
      ["a wait past 120", { reviewTool: { ...REVIEW_TOOL, waitMinutes: 121 } }, "`autonomy.reviewTool.waitMinutes` must be a whole number from 1 to 120"],
      ["a clean word outside the set", { reviewTool: { ...REVIEW_TOOL, clean: "silence" } }, "`autonomy.reviewTool.clean` must be one of state-comment | review-state | reaction"],
      ["a request past 200 characters", { reviewTool: { ...REVIEW_TOOL, request: "r".repeat(201) } }, "`autonomy.reviewTool.request` must be one line of at most 200 characters"],
      ["a request on two lines", { reviewTool: { ...REVIEW_TOOL, request: "a\nb" } }, "`autonomy.reviewTool.request`"],
      ["a request holding a line separator", { reviewTool: { ...REVIEW_TOOL, request: `a${String.fromCharCode(0x2028)}b` } }, "`autonomy.reviewTool.request`"],
      ["a login of another shape", { reviewTool: { ...REVIEW_TOOL, login: "-bad" } }, "`autonomy.reviewTool.login` must be a GitHub login"],
      ["a state marker on two lines", { reviewTool: { ...REVIEW_TOOL, stateMarker: "a\nb" } }, "`autonomy.reviewTool.stateMarker`"],
      ["an unknown tool member", { reviewTool: { ...REVIEW_TOOL, extra: 1 } }, "unknown field `autonomy.reviewTool.extra`"],
      ["a maxFiles of 0", { autoShip: { ...AUTO_SHIP, maxFiles: 0 } }, "`autonomy.autoShip.maxFiles` must be a positive whole number"],
      ["a maxLines of 1.5", { autoShip: { ...AUTO_SHIP, maxLines: 1.5 } }, "`autonomy.autoShip.maxLines` must be a positive whole number"],
      ["a class outside the set", { autoShip: { ...AUTO_SHIP, classes: ["trivial"] } }, "`autonomy.autoShip.classes` names unknown class \"trivial\""],
      ["paths that hold a line break", { autoShip: { ...AUTO_SHIP, paths: ["a\nb"] } }, "`autonomy.autoShip.paths`"],
      ["workflows that are not a list", { landJob: { workflows: "CI" } }, "`autonomy.landJob.workflows`"],
      ["a key that is not an object", { landJob: ["CI"] }, "`autonomy.landJob` must be an object"],
    ];
    for (const [label, block, fragment] of refused) {
      it(`refuses ${label}`, () => {
        const errors = collectManifestErrors(manifestWith(block));
        expect(errors.some((error) => error.includes(fragment)), errors.join("\n")).toBe(true);
      });
    }
  });
});
