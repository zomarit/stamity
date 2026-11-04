import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readLooserKeys, readSetting, Refused, type LandSetting } from "../../../src/cli/engine/landSetting.ts";
import { resolveAutonomy, type AutonomyLeg, type ResolvedAutonomy } from "../../../src/config/autonomy.ts";
import type { AutonomyConfig } from "../../../src/types/manifest.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * What `run land` reads (REQ-FLOW-132, REQ-FLOW-138; review/15, review/37): the strictest of the default branch, `HEAD`,
 * the work tree and the baked guard, the legs that disagree on the review tool, and the keys a head's setting loosens
 * against the default branch's. GitHub and git are the two seams the verb hands in, so each case states what they
 * answer; the work tree is a real file.
 */

const tempDir = useTempDir("stamity-land-setting");

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

function setting(autonomy?: AutonomyConfig): ResolvedAutonomy {
  return resolveAutonomy(autonomy === undefined ? {} : { autonomy });
}

function manifest(autonomy?: AutonomyConfig, ledger: readonly unknown[] = []): string {
  return JSON.stringify({ version: 1, ...(autonomy === undefined ? {} : { autonomy }), ledger });
}

interface Seams {
  gitLine: (args: readonly string[]) => Promise<string | null>;
  call: (path: string) => Promise<{ status: number; json: unknown }>;
}

/** The verb's two seams, answering with `remote` (a status alone when it is a number) and `head`. */
function seams(remote: string | number, head: string | null): Seams {
  return {
    gitLine: (args) => Promise.resolve(args[0] === "show" ? head : null),
    call: (path) => {
      expect(path).toBe("repos/o/r/contents/.stamity/manifest.json?ref=main");
      return Promise.resolve(typeof remote === "number" ? { status: remote, json: null } : { status: 200, json: { content: Buffer.from(remote).toString("base64") } });
    },
  };
}

async function workTree(text: string | null): Promise<string> {
  const root = tempDir().path("repo");
  await mkdir(join(root, ".stamity"), { recursive: true });
  if (text !== null) await writeFile(join(root, ".stamity", "manifest.json"), text);
  return root;
}

const DEFAULT_LEG = "the default branch's manifest";
const HEAD_LEG = "the manifest committed at `HEAD`";
const DISK_LEG = "the manifest on disk";
const GUARD_LEG = "the baked guard";

/** The setting with `remote`, `head` and `disk` as the three manifests and `guards` as the guard's legs. */
async function readLegs(remote: string, head: string, disk: string, guards: readonly AutonomyLeg[]): Promise<LandSetting> {
  const { gitLine, call } = seams(remote, head);
  return readSetting(await workTree(disk), "", "repos/o/r", "main", gitLine, call, () => Promise.resolve(guards));
}

/** The setting with `text` as the manifest on all three legs and `guard` as the fourth. */
function read(text: string, guard: ResolvedAutonomy | null): Promise<LandSetting> {
  return readLegs(text, text, text, guard === null ? [] : [{ source: GUARD_LEG, setting: guard }]);
}

describe("readSetting — the baked guard is the fourth leg", () => {
  it("does not bind a key merged to the default branch until a guard is baked with it", async () => {
    const on = manifest({ autoShip: AUTO_SHIP });

    expect((await read(on, setting())).autoShip).toBeUndefined();
    expect((await read(on, setting({ autoShip: AUTO_SHIP }))).autoShip).toEqual(AUTO_SHIP);
  });

  it("keeps a review tool the guard names though every manifest dropped it", async () => {
    expect((await read(manifest(), setting({ reviewTool: REVIEW_TOOL }))).reviewTool).toEqual(REVIEW_TOOL);
  });

  it("takes the guard's lower rounds and wait over a raise merged to the default branch", async () => {
    const raised = manifest({ reviewTool: { ...REVIEW_TOOL, rounds: 3, waitMinutes: 60 } });

    expect((await read(raised, setting({ reviewTool: REVIEW_TOOL }))).reviewTool).toEqual(REVIEW_TOOL);
  });

  it("takes the guard's mode, acts and branches", async () => {
    const baked = setting({ mode: "ask", deployingActs: ["tag"], deployingBranches: ["release/*"] });

    // TEST CHANGE, justified: review/37 — the read now also says which legs disagree on the review tool, here none.
    expect(await read(manifest(), baked)).toEqual({ ...baked, reviewToolConflict: [] });
  });

  it("reads the three manifests alone where there is no guard leg", async () => {
    // TEST CHANGE, justified: review/37 — the read now also says which legs disagree on the review tool, here none.
    expect(await read(manifest({ autoShip: AUTO_SHIP }), null)).toEqual({ ...setting({ autoShip: AUTO_SHIP }), reviewToolConflict: [] });
  });

  it("refuses as no setup found with no manifest anywhere, whatever a guard says", async () => {
    const { gitLine, call } = seams(404, null);
    const guards = [{ source: GUARD_LEG, setting: setting() }];

    await expect(readSetting(await workTree(null), "", "repos/o/r", "main", gitLine, call, () => Promise.resolve(guards))).rejects.toThrowError(/^no setup found/);
  });
});

describe("readSetting — no leg's review tool wins (review/37)", () => {
  const OTHER = { ...REVIEW_TOOL, login: "another-reviewer[bot]" };
  const ALL_FOUR = [DEFAULT_LEG, HEAD_LEG, DISK_LEG, GUARD_LEG];

  // TEST CHANGE, justified: review/37 — this case pinned "the default branch's tool stands" over the guard's. The sign-off on that row is that no leg wins, so it now pins the disagreement, named.
  it("names every leg where the guard holds another tool than the three manifests", async () => {
    expect((await read(manifest({ reviewTool: REVIEW_TOOL }), setting({ reviewTool: OTHER }))).reviewToolConflict).toEqual(ALL_FOUR);
  });

  it("names the legs where a drop is merged unbaked and the work tree alone names another tool", async () => {
    const guards = [{ source: GUARD_LEG, setting: setting({ reviewTool: REVIEW_TOOL }) }];

    expect((await readLegs(manifest(), manifest(), manifest({ reviewTool: OTHER }), guards)).reviewToolConflict).toEqual(ALL_FOUR);
  });

  it.each([
    ["login", { login: "another-reviewer[bot]" }],
    ["clean", { clean: "reaction" as const }],
    ["stateMarker", { stateMarker: "another-state:v1" }],
    ["stateSection", { stateSection: "another_section" }],
  ])("names the legs where the work tree's tool differs on %s alone", async (_name, change) => {
    const named = manifest({ reviewTool: REVIEW_TOOL });

    expect((await readLegs(named, named, manifest({ reviewTool: { ...REVIEW_TOOL, ...change } }), [])).reviewToolConflict).toEqual([DEFAULT_LEG, HEAD_LEG, DISK_LEG]);
  });

  it("names the legs where a tool merged to the default branch is not baked yet", async () => {
    expect((await read(manifest({ reviewTool: REVIEW_TOOL }), setting())).reviewToolConflict).toEqual(ALL_FOUR);
  });

  it("names two guard copies that disagree where no manifest names a tool, so a copy edited on disk shows", async () => {
    const head = "the guard copy at `HEAD`";
    const disk = "the guard copy on disk";
    const guards = [
      { source: head, setting: setting({ reviewTool: REVIEW_TOOL }) },
      { source: disk, setting: setting({ reviewTool: OTHER }) },
    ];

    expect((await readLegs(manifest(), manifest(), manifest(), guards)).reviewToolConflict).toEqual([DEFAULT_LEG, HEAD_LEG, DISK_LEG, head, disk]);
  });

  it("names no legs where they differ only in rounds and wait, which still take the lowest", async () => {
    const raised = manifest({ reviewTool: { ...REVIEW_TOOL, rounds: 3, waitMinutes: 60 } });
    const landed = await read(raised, setting({ reviewTool: { ...REVIEW_TOOL, rounds: 1, waitMinutes: 90 } }));

    expect(landed.reviewToolConflict).toEqual([]);
    expect(landed.reviewTool).toEqual({ ...REVIEW_TOOL, rounds: 1, waitMinutes: 60 });
  });

  it("names no legs where every leg names one tool, or none does", async () => {
    expect((await read(manifest({ reviewTool: REVIEW_TOOL }), setting({ reviewTool: REVIEW_TOOL }))).reviewToolConflict).toEqual([]);
    expect((await read(manifest(), setting())).reviewToolConflict).toEqual([]);
  });

  it("leaves out a leg that has no manifest at all, which names nothing either way", async () => {
    const { gitLine, call } = seams(404, null);
    const root = await workTree(manifest({ reviewTool: REVIEW_TOOL }));

    expect((await readSetting(root, "", "repos/o/r", "main", gitLine, call, () => Promise.resolve([]))).reviewToolConflict).toEqual([]);
  });
});

describe("readLooserKeys — what the land ask names", () => {
  const keys = (remote: string | number, head: string | null): Promise<string[]> => {
    const { gitLine, call } = seams(remote, head);
    return readLooserKeys("", "repos/o/r", "main", gitLine, call);
  };

  it("names each key the head loosens against the default branch", async () => {
    expect(await keys(manifest({ mode: "ask", reviewTool: REVIEW_TOOL }), manifest({ autoShip: AUTO_SHIP }))).toEqual([
      "autonomy.mode",
      "autonomy.autoShip",
      "autonomy.reviewTool",
    ]);
  });

  it("names nothing for a head that only moved the ledger, the routine change to the same file", async () => {
    expect(await keys(manifest({ reviewTool: REVIEW_TOOL }), manifest({ reviewTool: REVIEW_TOOL }, [{ path: "a.md" }]))).toEqual([]);
  });

  it("names nothing for a head that tightens", async () => {
    expect(await keys(manifest({ reviewTool: REVIEW_TOOL }), manifest({ mode: "ask", reviewTool: { ...REVIEW_TOOL, rounds: 1 } }))).toEqual([]);
  });

  it("reads a default branch with no manifest as the default setting", async () => {
    expect(await keys(404, manifest({ landJob: { workflows: ["CI"] } }))).toEqual(["autonomy.landJob"]);
  });

  it("names nothing where HEAD holds no manifest: the default branch's setting still stands", async () => {
    expect(await keys(manifest({ reviewTool: REVIEW_TOOL }), null)).toEqual([]);
  });

  it("reads a default branch's manifest that does not parse as the strictest, so the head loosens it", async () => {
    expect(await keys("{not json", manifest())).toEqual(["autonomy.mode", "autonomy.deployingActs"]);
  });

  it("refuses when GitHub gives no answer it means", async () => {
    await expect(keys(502, manifest())).rejects.toBeInstanceOf(Refused);
    await expect(keys(502, manifest())).rejects.toThrowError("the default branch's manifest read answered HTTP 502");
  });
});
