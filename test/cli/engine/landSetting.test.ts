import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Held, readLegs as legsOf, readLooserKeys, readSetting as settingOver, Refused, type LandSetting } from "../../../src/cli/engine/landSetting.ts";
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

/** TEST CHANGE, justified: `run land` reads the legs, then the setups once it has the list; these cases judge what the two make together. */
async function readSetting(
  place: Parameters<typeof legsOf>[0] & { setups: readonly string[] },
  repoPath: string,
  defaultBranch: string,
  gitLine: Parameters<typeof legsOf>[3],
  call: Parameters<typeof legsOf>[4],
  guard: Parameters<typeof legsOf>[5],
): Promise<LandSetting> {
  return settingOver(await legsOf(place, repoPath, defaultBranch, gitLine, call, guard), place, repoPath, defaultBranch, call);
}

/** TEST CHANGE, justified: the read now names the top beside the verb's folder; these cases start at the top, so the two are one folder. */
function atTop(root: string): { top: string; cwd: string; prefix: string; setups: readonly string[] } {
  return { top: root, cwd: root, prefix: "", setups: [] };
}

const NO_TOP = "main holds no .stamity/manifest.json at the repository's top, so nothing a run cannot write binds this land: a person places one there first";
const DEFAULT_LEG = "the default branch's manifest";
const HEAD_LEG = "the manifest committed at `HEAD`";
const DISK_LEG = "the manifest on disk";
const GUARD_LEG = "the baked guard";

/** GitHub's answer holding `text`, or the bare status where a number is given. */
function answer(text: string | number): { status: number; json: unknown } {
  return typeof text === "number" ? { status: text, json: null } : { status: 200, json: { content: Buffer.from(text).toString("base64") } };
}

/** A GitHub whose every read stays open past a turn of the event loop, recording what was asked and the most reads open together. */
function slowGitHub(reply: (path: string) => { status: number; json: unknown }): { call: Seams["call"]; asked: string[]; peak: () => number } {
  const asked: string[] = [];
  let open = 0;
  let peak = 0;
  const call = async (path: string): Promise<{ status: number; json: unknown }> => {
    asked.push(path);
    open += 1;
    peak = Math.max(peak, open);
    await new Promise((resolve) => setImmediate(resolve));
    open -= 1;
    return reply(path);
  };
  return { call, asked, peak: () => peak };
}

const TOP_READ = "repos/o/r/contents/.stamity/manifest.json?ref=main";
/** More setups than are read together, as a fixture-heavy repository holds. */
const MANY_SETUPS = Array.from({ length: 12 }, (_, index) => `fixtures/${index}/`);

/** The setting with `remote`, `head` and `disk` as the three manifests and `guards` as the guard's legs. */
async function readLegs(remote: string, head: string, disk: string, guards: readonly AutonomyLeg[]): Promise<LandSetting> {
  const { gitLine, call } = seams(remote, head);
  return readSetting(atTop(await workTree(disk)), "repos/o/r", "main", gitLine, call, () => Promise.resolve(guards));
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

    await expect(readSetting(atTop(await workTree(null)), "repos/o/r", "main", gitLine, call, () => Promise.resolve(guards))).rejects.toThrowError(/^no setup found/);
  });

  it("refuses where the default branch holds no manifest at the top, however many legs the run's own files give", async () => {
    const { gitLine, call } = seams(404, manifest());
    const refused = readSetting(atTop(await workTree(manifest())), "repos/o/r", "main", gitLine, call, () => Promise.resolve([]));

    await expect(refused).rejects.toBeInstanceOf(Refused);
    await expect(refused).rejects.toThrowError(NO_TOP);
  });

  it("keeps reading a default branch's manifest that does not parse as the strictest, which asks a person", async () => {
    const landed = await readLegs("{not json", manifest(), manifest(), []);

    expect(landed.mode).toBe("ask");
  });
});

describe("readSetting — started below the top", () => {
  const PREFIX = "apps/web/";
  const PROJECT_READ = "repos/o/r/contents/apps/web/.stamity/manifest.json?ref=main";
  const NAMED = manifest({ deployingBranches: ["main"] });

  interface Below {
    /** What the default branch holds by read path; an absent path answers 404. */
    remote?: Record<string, string>;
    /** What `HEAD` holds by tree path. */
    head?: Record<string, string>;
    topDisk?: string | null;
    projectDisk?: string | null;
    guards?: Record<string, readonly AutonomyLeg[]>;
  }

  /** The folders, each seam answering as `below` says, and what each seam was asked. */
  async function reading(below: Below): Promise<{ result: Promise<LandSetting>; shown: string[]; guarded: string[]; called: string[]; top: string; cwd: string }> {
    const top = await workTree(below.topDisk ?? null);
    const cwd = join(top, "apps", "web");
    await mkdir(join(cwd, ".stamity"), { recursive: true });
    if (below.projectDisk !== undefined && below.projectDisk !== null) await writeFile(join(cwd, ".stamity", "manifest.json"), below.projectDisk);
    const shown: string[] = [];
    const guarded: string[] = [];
    const called: string[] = [];
    const gitLine = (args: readonly string[]): Promise<string | null> => {
      const rev = args[1] ?? "";
      shown.push(rev);
      return Promise.resolve(below.head?.[rev.replace(/^HEAD:/, "")] ?? null);
    };
    const call = (path: string): Promise<{ status: number; json: unknown }> => {
      called.push(path);
      const text = below.remote?.[path];
      return Promise.resolve(text === undefined ? { status: 404, json: null } : { status: 200, json: { content: Buffer.from(text).toString("base64") } });
    };
    const guard = (rootDir: string): Promise<readonly AutonomyLeg[]> => {
      guarded.push(rootDir);
      return Promise.resolve(below.guards?.[rootDir === top ? "top" : "project"] ?? []);
    };
    return { result: readSetting({ top, cwd, prefix: PREFIX, setups: [] }, "repos/o/r", "main", gitLine, call, guard), shown, guarded, called, top, cwd };
  }

  it("reads each of the top's legs and the project's, by the tree's path and the folder's", async () => {
    const seen = await reading({ remote: { [TOP_READ]: manifest() }, projectDisk: manifest() });

    await seen.result;

    expect(seen.called).toEqual([TOP_READ, PROJECT_READ]);
    expect(seen.shown).toEqual(["HEAD:.stamity/manifest.json", "HEAD:apps/web/.stamity/manifest.json"]);
    expect(seen.guarded).toEqual([seen.top, seen.cwd]);
  });

  it.each<[string, Below]>([
    ["the default branch's", { remote: { [TOP_READ]: NAMED }, projectDisk: manifest() }],
    ["`HEAD`'s", { remote: { [TOP_READ]: manifest() }, head: { ".stamity/manifest.json": NAMED }, projectDisk: manifest() }],
    ["the work tree's", { remote: { [TOP_READ]: manifest() }, topDisk: NAMED, projectDisk: manifest() }],
    ["the guard's", { remote: { [TOP_READ]: manifest() }, projectDisk: manifest(), guards: { top: [{ source: GUARD_LEG, setting: setting({ deployingBranches: ["main"] }) }] } }],
  ])("binds a project to the top's %s setting", async (_leg, below) => {
    expect((await (await reading(below)).result).deployingBranches).toEqual(["main"]);
  });

  it("keeps a key a project tightens, the top's setting standing beside it", async () => {
    const seen = await reading({ remote: { [TOP_READ]: manifest(), [PROJECT_READ]: NAMED } });

    expect((await seen.result).deployingBranches).toEqual(["main"]);
  });

  it("drops a key only the project turns on, as the strictest drops any leg's", async () => {
    const on = manifest({ autoShip: AUTO_SHIP });
    const seen = await reading({ remote: { [TOP_READ]: manifest(), [PROJECT_READ]: on }, head: { "apps/web/.stamity/manifest.json": on }, projectDisk: on });

    expect((await seen.result).autoShip).toBeUndefined();
  });

  it("names each leg with its place where the top and the project disagree on the review tool", async () => {
    const named = manifest({ reviewTool: REVIEW_TOOL });
    const guards = { project: [{ source: GUARD_LEG, setting: setting({ reviewTool: REVIEW_TOOL }) }] };

    const { reviewToolConflict } = await (await reading({ remote: { [TOP_READ]: manifest(), [PROJECT_READ]: named }, guards })).result;

    expect(reviewToolConflict).toEqual([DEFAULT_LEG, `${DEFAULT_LEG} of ${PREFIX}`, `${GUARD_LEG} of ${PREFIX}`]);
  });

  it("refuses a project the default branch holds where the top holds no setup", async () => {
    await expect((await reading({ remote: { [PROJECT_READ]: NAMED } })).result).rejects.toThrowError(NO_TOP);
  });

  it("refuses where neither the top nor the project is on the default branch, however many legs the run's own files give", async () => {
    const seen = await reading({ head: { ".stamity/manifest.json": manifest(), "apps/web/.stamity/manifest.json": manifest() }, topDisk: manifest(), projectDisk: manifest() });

    await expect(seen.result).rejects.toBeInstanceOf(Refused);
    await expect(seen.result).rejects.toThrowError(NO_TOP);
  });

  it("reads a project new on its branch beside a top the default branch holds", async () => {
    const seen = await reading({ remote: { [TOP_READ]: manifest() }, head: { "apps/web/.stamity/manifest.json": NAMED }, projectDisk: NAMED });

    expect((await seen.result).deployingBranches).toEqual(["main"]);
  });

  it("refuses as no setup found where no leg holds a manifest, at the top or below it", async () => {
    await expect((await reading({})).result).rejects.toThrowError(/^no setup found/);
  });
});

describe("what a job holds on, and what stays its failure (REQ-FLOW-157)", () => {
  const TOP = "repos/o/r/contents/.stamity/manifest.json?ref=main";
  const PROJECT = "repos/o/r/contents/apps/web/.stamity/manifest.json?ref=main";
  const API = "repos/o/r/contents/apps/api/.stamity/manifest.json?ref=main";
  const ok = { status: 200, json: { content: Buffer.from(manifest()).toString("base64") } };
  /** GitHub answering 502 at `failing`, and holding a manifest everywhere else. */
  const failingAt = (failing: string): Seams["call"] => (path) => Promise.resolve(path === failing ? { status: 502, json: null } : ok);
  const gitLine: Seams["gitLine"] = (args) => Promise.resolve(args[0] === "show" ? manifest() : null);
  const noGuard = (): Promise<AutonomyLeg[]> => Promise.resolve([]);

  async function below(call: Seams["call"]): Promise<unknown> {
    const top = await workTree(manifest());
    return legsOf({ top, cwd: join(top, "apps", "web"), prefix: "apps/web/" }, "repos/o/r", "main", gitLine, call, noGuard);
  }

  it("holds on a top with no manifest, wherever the verb started", async () => {
    const root = await workTree(manifest());

    await expect(legsOf({ top: root, cwd: root, prefix: "" }, "repos/o/r", "main", gitLine, (path) => Promise.resolve(path === TOP ? { status: 404, json: null } : ok), noGuard)).rejects.toBeInstanceOf(Held);
    await expect(below((path) => Promise.resolve(path === TOP ? { status: 404, json: null } : ok))).rejects.toBeInstanceOf(Held);
  });

  it("holds on a failed read of the top from below it, which the verb's own folder never asked for", async () => {
    await expect(below(failingAt(TOP))).rejects.toBeInstanceOf(Held);
  });

  it("keeps a failed read of the verb's own folder a plain refusal, at the top and below it", async () => {
    const root = await workTree(manifest());
    const atTheTop = legsOf({ top: root, cwd: root, prefix: "" }, "repos/o/r", "main", gitLine, failingAt(TOP), noGuard);

    await expect(atTheTop).rejects.toBeInstanceOf(Refused);
    await expect(atTheTop).rejects.not.toBeInstanceOf(Held);
    await expect(below(failingAt(PROJECT))).rejects.not.toBeInstanceOf(Held);
  });

  it("holds on a failed read of a setup elsewhere", async () => {
    const legs = await legsOf(atTop(await workTree(manifest())), "repos/o/r", "main", gitLine, failingAt(API), noGuard);

    await expect(settingOver(legs, { prefix: "", setups: ["", "apps/api/"] }, "repos/o/r", "main", failingAt(API))).rejects.toBeInstanceOf(Held);
  });

  it("holds on a failed read of the keys a head loosens", async () => {
    await expect(readLooserKeys(["apps/api/"], "repos/o/r", "main", gitLine, failingAt(API))).rejects.toBeInstanceOf(Held);
    await expect(readLooserKeys(["apps/api/"], "repos/o/r", "main", gitLine, failingAt(TOP))).rejects.toBeInstanceOf(Held);
  });

  it("lets a failure that is no refusal through as it is", async () => {
    const broken = new Error("not a refusal");

    await expect(readLooserKeys(["apps/api/"], "repos/o/r", "main", () => Promise.reject(broken), failingAt("none"))).rejects.toBe(broken);
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
    // TEST CHANGE, justified: a default branch with no manifest at the top now refuses, so the leg left out here is `HEAD`'s.
    const named = manifest({ reviewTool: REVIEW_TOOL });
    const { gitLine, call } = seams(named, null);
    const root = await workTree(named);

    expect((await readSetting(atTop(root), "repos/o/r", "main", gitLine, call, () => Promise.resolve([]))).reviewToolConflict).toEqual([]);
  });
});

describe("readSetting — a setup elsewhere binds what it names", () => {
  const OTHER_READ = "repos/o/r/contents/apps/api/.stamity/manifest.json?ref=main";
  const ELSEWHERE = `${DEFAULT_LEG} of apps/api/`;

  /** The setting read at the top, the default branch holding `top` there and `other` (a status alone when a number) at `apps/api/`, and what GitHub was asked. */
  async function elsewhere(top: string, other: string | number, setups: readonly string[] = ["", "apps/api/"]): Promise<{ landed: LandSetting; called: string[] }> {
    const called: string[] = [];
    const call = (path: string): Promise<{ status: number; json: unknown }> => {
      called.push(path);
      return Promise.resolve(answer(path === TOP_READ ? top : other));
    };
    const root = await workTree(null);
    return { landed: await readSetting({ top: root, cwd: root, prefix: "", setups }, "repos/o/r", "main", () => Promise.resolve(null), call, () => Promise.resolve([])), called };
  }

  it("binds a deploying branch, an act and mode `ask` a project names, the top naming none", async () => {
    const { landed } = await elsewhere(manifest(), manifest({ mode: "ask", deployingActs: ["tag"], deployingBranches: ["main"] }));

    expect(landed).toMatchObject({ mode: "ask", deploying: ["tag"], deployingBranches: ["main"] });
  });

  it("leaves the top's keys standing where a project names nothing of them", async () => {
    const top = manifest({ adminRuleProof: true, autoShip: AUTO_SHIP, reviewTool: REVIEW_TOOL, landJob: { workflows: ["CI"] } });

    const { landed } = await elsewhere(top, manifest());

    expect(landed).toMatchObject({ adminRuleProof: true, autoShip: AUTO_SHIP, reviewTool: REVIEW_TOOL, landJob: { workflows: ["CI"] }, reviewToolConflict: [] });
  });

  it("drops an auto-ship the project names otherwise, as the strictest drops any leg's", async () => {
    const { landed } = await elsewhere(manifest({ autoShip: AUTO_SHIP }), manifest({ autoShip: { ...AUTO_SHIP, maxFiles: 1 } }));

    expect(landed.autoShip).toBeUndefined();
  });

  it("names the legs where a project names a review tool the top does not", async () => {
    const { landed } = await elsewhere(manifest(), manifest({ reviewTool: REVIEW_TOOL }));

    expect(landed.reviewToolConflict).toEqual([DEFAULT_LEG, ELSEWHERE]);
  });

  it("reads a manifest there that does not parse as the strictest, which asks a person", async () => {
    expect((await elsewhere(manifest(), "{not json")).landed.mode).toBe("ask");
  });

  it("reads each setup once, the top's and the verb's own not again", async () => {
    expect((await elsewhere(manifest(), manifest(), ["", "apps/api/", "apps/api/"])).called).toEqual([TOP_READ, OTHER_READ]);
  });

  it("reads no leg where the default branch holds no manifest there, a setup only the head holds", async () => {
    expect((await elsewhere(manifest(), 404)).landed.deployingBranches).toEqual([]);
  });

  it("refuses a read that answers neither 200 nor 404", async () => {
    await expect(elsewhere(manifest(), 502)).rejects.toThrowError("the default branch's manifest read answered HTTP 502");
  });

  /** The setting read at the top through `github`, with {@link MANY_SETUPS} listed. */
  async function readMany(github: ReturnType<typeof slowGitHub>): Promise<LandSetting> {
    const root = await workTree(null);
    return readSetting({ top: root, cwd: root, prefix: "", setups: MANY_SETUPS }, "repos/o/r", "main", () => Promise.resolve(null), github.call, () => Promise.resolve([]));
  }

  it("reads many setups four at a time, every one of them", async () => {
    const github = slowGitHub(() => answer(manifest()));

    await readMany(github);

    expect(github.peak()).toBe(4);
    expect(github.asked).toHaveLength(MANY_SETUPS.length + 1);
  });

  it("starts no read past a refusal, so GitHub is not asked for every setup left", async () => {
    const github = slowGitHub((path) => answer(path === TOP_READ ? manifest() : 403));

    await expect(readMany(github)).rejects.toThrowError("the default branch's manifest read answered HTTP 403");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(github.asked.length).toBeLessThan(MANY_SETUPS.length);
  });
});

describe("readLooserKeys — what the land ask names", () => {
  // TEST CHANGE, justified: the read now takes every changed setup at once, so one is written as a list of one.
  const keys = (remote: string | number, head: string | null): Promise<string[]> => {
    const { gitLine, call } = seams(remote, head);
    return readLooserKeys([""], "repos/o/r", "main", gitLine, call);
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

  it("reads the project's own manifest at its tree path, wherever the verb started", async () => {
    const shown: string[] = [];
    const gitLine = (args: readonly string[]): Promise<string | null> => {
      shown.push(args[1] ?? "");
      return Promise.resolve(manifest({ adminRuleProof: true }));
    };
    // TEST CHANGE, justified: a manifest below the top is judged beside the top's too, so GitHub is asked for that one as well.
    const call = (path: string): Promise<{ status: number; json: unknown }> => {
      if (path === TOP_READ) return Promise.resolve(answer(manifest()));
      expect(path).toBe("repos/o/r/contents/apps/web/.stamity/manifest.json?ref=main");
      return Promise.resolve({ status: 404, json: null });
    };

    expect(await readLooserKeys(["apps/web/"], "repos/o/r", "main", gitLine, call)).toEqual(["autonomy.adminRuleProof"]);
    expect(shown).toEqual(["HEAD:apps/web/.stamity/manifest.json"]);
  });

  it("refuses when GitHub gives no answer it means", async () => {
    await expect(keys(502, manifest())).rejects.toBeInstanceOf(Refused);
    await expect(keys(502, manifest())).rejects.toThrowError("the default branch's manifest read answered HTTP 502");
  });
});

describe("readLooserKeys — a setup elsewhere, as the setting reads it", () => {
  const OTHER = "apps/api/";
  const BRANCH = { deployingBranches: ["main"] };

  /** The keys named where the default branch holds `top` at the top and `other` at {@link OTHER}, and the head holds `head` there. */
  function keys(top: string | number, other: string | number, head: string | null): Promise<string[]> {
    return readLooserKeys([OTHER], "repos/o/r", "main", () => Promise.resolve(head), (path) => Promise.resolve(answer(path === TOP_READ ? top : other)));
  }

  it("names a key the head takes out of that manifest", async () => {
    expect(await keys(manifest(), manifest(BRANCH), manifest())).toEqual(["autonomy.deployingBranches"]);
  });

  it("names what a manifest the head deletes named", async () => {
    expect(await keys(manifest(), manifest({ mode: "ask", ...BRANCH }), null)).toEqual(["autonomy.mode", "autonomy.deployingBranches"]);
  });

  it("names nothing for a deleted manifest whose every key the top names too", async () => {
    expect(await keys(manifest(BRANCH), manifest(BRANCH), null)).toEqual([]);
  });

  it("names nothing for a deleted manifest that named nothing", async () => {
    expect(await keys(manifest({ autoShip: AUTO_SHIP }), manifest(), null)).toEqual([]);
  });

  it("names nothing where the default branch never held that setup and the head does not either", async () => {
    expect(await keys(manifest(BRANCH), 404, null)).toEqual([]);
  });

  it("names an auto-ship a setup held back by naming another, once its key is gone", async () => {
    const top = manifest({ autoShip: AUTO_SHIP });

    expect(await keys(top, manifest({ autoShip: { ...AUTO_SHIP, maxFiles: 20 } }), manifest())).toEqual(["autonomy.autoShip"]);
  });

  it("names a land job a setup held back by naming another, once its key is gone", async () => {
    const top = manifest({ landJob: { workflows: ["CI"] } });

    expect(await keys(top, manifest({ landJob: { workflows: ["Other"] } }), manifest())).toEqual(["autonomy.landJob"]);
  });

  it("names nothing for a head that only moved that manifest's ledger", async () => {
    expect(await keys(manifest(), manifest(BRANCH), manifest(BRANCH, [{ path: "a.md" }]))).toEqual([]);
  });

  it("names each key once, whichever setup it loosens in", async () => {
    const reply = (path: string): { status: number; json: unknown } => answer(path === TOP_READ ? manifest() : manifest(BRANCH));

    expect(await readLooserKeys(["apps/a/", "apps/b/"], "repos/o/r", "main", () => Promise.resolve(manifest()), (path) => Promise.resolve(reply(path)))).toEqual(["autonomy.deployingBranches"]);
  });

  it("reads many changed setups four at a time, and the top's manifest once", async () => {
    const github = slowGitHub(() => answer(manifest()));

    await readLooserKeys(MANY_SETUPS, "repos/o/r", "main", () => Promise.resolve(manifest()), github.call);

    expect(github.peak()).toBe(4);
    expect(github.asked.filter((path) => path === TOP_READ)).toHaveLength(1);
    expect(github.asked).toHaveLength(MANY_SETUPS.length + 1);
  });

  it("refuses a read of the top's manifest that answers neither 200 nor 404", async () => {
    await expect(keys(502, manifest(BRANCH), manifest())).rejects.toThrowError("the default branch's manifest read answered HTTP 502");
  });
});
