import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readLooserKeys, readSetting, Refused } from "../../../src/cli/engine/landSetting.ts";
import { resolveAutonomy, type ResolvedAutonomy } from "../../../src/config/autonomy.ts";
import type { AutonomyConfig } from "../../../src/types/manifest.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * What `run land` reads (REQ-FLOW-132, REQ-FLOW-138; review/15): the strictest of the default branch, `HEAD`, the work
 * tree and the baked guard, and the keys a head's setting loosens against the default branch's. GitHub and git are the
 * two seams the verb hands in, so each case states what they answer; the work tree is a real file.
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

/** The setting with `text` as the manifest on all three legs and `guard` as the fourth. */
async function read(text: string, guard: ResolvedAutonomy | null): Promise<ResolvedAutonomy> {
  const { gitLine, call } = seams(text, text);
  return readSetting(await workTree(text), "", "repos/o/r", "main", gitLine, call, () => Promise.resolve(guard));
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

  it("keeps the default branch's tool where the guard names another", async () => {
    const other = setting({ reviewTool: { ...REVIEW_TOOL, login: "another-reviewer[bot]" } });

    expect((await read(manifest({ reviewTool: REVIEW_TOOL }), other)).reviewTool).toEqual(REVIEW_TOOL);
  });

  it("takes the guard's mode, acts and branches", async () => {
    const baked = setting({ mode: "ask", deployingActs: ["tag"], deployingBranches: ["release/*"] });

    expect(await read(manifest(), baked)).toEqual(baked);
  });

  it("reads the three manifests alone where there is no guard leg", async () => {
    expect(await read(manifest({ autoShip: AUTO_SHIP }), null)).toEqual(setting({ autoShip: AUTO_SHIP }));
  });

  it("refuses as no setup found with no manifest anywhere, whatever a guard says", async () => {
    const { gitLine, call } = seams(404, null);

    await expect(readSetting(await workTree(null), "", "repos/o/r", "main", gitLine, call, () => Promise.resolve(setting()))).rejects.toThrowError(/^no setup found/);
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
