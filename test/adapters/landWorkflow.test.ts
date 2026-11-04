import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { pinnedCliInstall } from "../../src/adapters/copilot.ts";
import { buildLandWorkflow, LAND_WORKFLOW_ARTIFACT_ID, LAND_WORKFLOW_PATH, planLandWorkflow } from "../../src/adapters/landWorkflow.ts";
import { COMMANDS } from "../../src/cli.ts";
import { parseYamlStrict } from "../../src/config/parse.ts";
import { detectCIProviders } from "../../src/detect/repoAnalyzer.ts";
import { readManifest, writeManifest } from "../../src/manifest/manifest.ts";
import { bytesShowEngineOutput, needsByteProof, OWNED_PATHS, renderingProofClass } from "../../src/manifest/ownedPaths.ts";
import type { SetupManifest } from "../../src/types/manifest.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * land-job (REQ-FLOW-157): the land job's workflow, read back as the YAML GitHub reads, and its row through a real `init`,
 * `sync` and `clean`. Nothing here starts a job: that a run of this file merges is the scratch repository's to prove.
 */

const CLI = { packageName: "@zomarit/stamity", version: "1.18.0" };
const LOGIN = "chatgpt-codex-connector[bot]";

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Workflow {
  on: Record<string, { workflows?: string[]; types?: string[]; inputs?: unknown } | null>;
  permissions: Record<string, string>;
  concurrency: Record<string, unknown>;
  jobs: { land: { if: string; env: Record<string, string>; steps: Step[] } };
}

function workflowOf(names: readonly string[] = ["CI"], review?: string): { text: string; yaml: Workflow } {
  const text = buildLandWorkflow(names, review, CLI);
  if (text === null) throw new Error("no workflow was built");
  return { text, yaml: parseYamlStrict(text, LAND_WORKFLOW_PATH) as Workflow };
}

describe("the land job's workflow (REQ-FLOW-157)", () => {
  it("runs its steps in the stated order, the CLI by version before any head file exists", () => {
    const { steps } = workflowOf().yaml.jobs.land;
    expect(steps.map((step) => step.uses?.replace(/@.*/, "") ?? step.run?.split(" ")[0])).toEqual(["actions/setup-node", "npm", "actions/checkout", "stamity"]);
    const [setup, install, checkout, land] = steps as [Step, Step, Step, Step];
    expect(install.run).toBe("npm install --global @zomarit/stamity@1.18.0");
    expect(install.run).toBe(pinnedCliInstall(CLI));
    for (const action of [setup, checkout]) expect(action.uses).toMatch(/@[0-9a-f]{40}$/);
    expect(setup.with).toEqual({ "node-version": "lts/*" });
    expect(checkout.with).toEqual({ ref: "refs/pull/${{ env.PR_NUMBER }}/head", "fetch-depth": 0, "persist-credentials": false });
    expect(land).toEqual({ run: 'stamity run land --job --pr "$PR_NUMBER" --ready --json', env: { GH_TOKEN: "${{ github.token }}" } });
  });

  it("names no head code: no install from the head, no head registry, no local bin, and no event text in a shell line", () => {
    const { text, yaml } = workflowOf(["CI"], LOGIN);
    for (const banned of ["npm ci", ".npmrc", "npx --no", "npm test", "node-version-file", "cache:"]) expect(text).not.toContain(banned);
    for (const step of yaml.jobs.land.steps) expect(step.run ?? "").not.toContain("${{");
  });

  it("holds the stated triggers, rights and queue, and nothing of the review tool without one", () => {
    const { yaml } = workflowOf(["CI", "Build"]);
    expect(Object.keys(yaml.on)).toEqual(["workflow_run", "workflow_dispatch"]);
    expect(yaml.on["workflow_run"]).toEqual({ workflows: ["CI", "Build"], types: ["completed"] });
    expect(yaml.permissions).toEqual({ contents: "write", "pull-requests": "write", checks: "read" });
    expect(yaml.concurrency).toEqual({ group: "stamity-land", "cancel-in-progress": false });
    expect(yaml.jobs.land.if).not.toContain("issue_comment");
  });

  it("wakes on the review tool's comment, and only that login's, where one is named", () => {
    const { yaml } = workflowOf(["CI"], LOGIN);
    expect(yaml.on["issue_comment"]).toEqual({ types: ["created", "edited"] });
    expect(yaml.jobs.land.if).toContain(`github.event.comment.user.login == '${LOGIN}'`);
  });

  it("keeps a workflow name a single YAML value, whatever it holds", () => {
    const named = 'CI: "main" #1';
    expect(workflowOf([named]).yaml.on["workflow_run"]?.workflows).toEqual([named]);
  });

  it("writes nothing for a package with no npm channel", () => {
    expect(buildLandWorkflow(["CI"], undefined, { ...CLI, npmChannel: false })).toBeNull();
  });

  it("carries the bytes the overwrite and the delete read as the engine's, and an owner's file at the name does not", () => {
    expect(bytesShowEngineOutput(LAND_WORKFLOW_PATH, workflowOf().text)).toBe(true);
    expect(bytesShowEngineOutput(LAND_WORKFLOW_PATH, "name: Stamity land\non: push\n")).toBe(false);
    expect(needsByteProof(LAND_WORKFLOW_PATH)).toBe(true);
    expect(OWNED_PATHS.exact).toContain(LAND_WORKFLOW_PATH);
    // Off, no plan renders it, so a rendering proof would keep the very file turning it off must remove.
    expect(renderingProofClass(LAND_WORKFLOW_PATH)).toBeNull();
  });
});

describe("planLandWorkflow", () => {
  const temp = useTempDir("land-workflow");
  const manifestOf = (autonomy: unknown): SetupManifest => ({ autonomy }) as SetupManifest;
  const ON = { mode: "autonomous", deployingBranches: [], deployingActs: [], landJob: { workflows: ["CI", "Build"] } };

  async function repoWith(files: Record<string, string>): Promise<string> {
    const root = temp().path(`repo-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(root, { recursive: true });
    await Promise.all(
      Object.entries(files).map(async ([path, text]) => {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), text);
      }),
    );
    return root;
  }

  it("adds no row and no warning while the setting is off", async () => {
    await expect(planLandWorkflow(await repoWith({}), manifestOf(undefined), CLI)).resolves.toEqual({ content: null, warnings: [] });
  });

  it("names each watched workflow no file carries, and counts neither its own file nor a name left out of the list", async () => {
    const root = await repoWith({
      ".github/workflows/ci.yml": "name: CI\non: push\n",
      ".github/workflows/deploy.yaml": "name: Deploy\non: push\n",
      [LAND_WORKFLOW_PATH]: "name: Build\n",
    });

    const plan = await planLandWorkflow(root, manifestOf(ON), CLI);

    expect(plan.content).toContain('workflows: ["CI", "Build"]');
    expect(plan.warnings).toEqual(['autonomy.landJob.workflows names "Build", which no file in .github/workflows carries, so the land job never starts on it']);
  });

  it("reads a workflow with no name by its path, as GitHub shows it", async () => {
    const root = await repoWith({ ".github/workflows/ci.yml": "on: push\n", ".github/workflows/build.yml": "name: Build\n" });
    const setting = { ...ON, landJob: { workflows: [".github/workflows/ci.yml", "Build"] } };
    await expect(planLandWorkflow(root, manifestOf(setting), CLI)).resolves.toMatchObject({ warnings: [] });
  });

  it("says why nothing is written for a package with no npm channel", async () => {
    const plan = await planLandWorkflow(await repoWith({}), manifestOf(ON), { ...CLI, npmChannel: false });
    expect(plan).toEqual({ content: null, warnings: [expect.stringContaining("no npm channel")] });
  });

  it("is not read as the repository's own CI", async () => {
    await expect(detectCIProviders(await repoWith({ [LAND_WORKFLOW_PATH]: "name: Stamity land\n" }))).resolves.toEqual([]);
  });
});

describe("the land job's row through init, sync and clean", () => {
  const temp = useTempDir("land-row");

  async function initialised(): Promise<string> {
    const root = temp().path(`repo-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(root, { recursive: true });
    const init = await runInProcess(COMMANDS, ["init", "-y", "--tools", "claude,cursor"], { cwd: root });
    expect(init.code, init.stderr).toBe(0);
    return root;
  }

  async function setLandJob(root: string, on: boolean): Promise<void> {
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("no manifest");
    const { landJob: _dropped, ...rest } = (manifest.autonomy ?? {}) as Record<string, unknown>;
    await writeManifest(root, { ...manifest, autonomy: { ...rest, ...(on ? { landJob: { workflows: ["CI"] } } : {}) } } as SetupManifest);
  }

  async function syncs(root: string): Promise<{ stdout: string }> {
    const sync = await runInProcess(COMMANDS, ["sync", "-y", "--loosen"], { cwd: root });
    expect(sync.code, sync.stderr).toBe(0);
    return sync;
  }

  const rows = async (root: string): Promise<string[]> => ((await readManifest(root))?.ledger ?? []).filter((row) => row.path === LAND_WORKFLOW_PATH).map((row) => `${row.adapter}:${row.artifactId}`);

  it("emits nothing with the setting off", async () => {
    const root = await initialised();
    await syncs(root);
    expect(existsSync(join(root, LAND_WORKFLOW_PATH))).toBe(false);
    expect(await rows(root)).toEqual([]);
  });

  it("writes the file with the setting on, one row per client, the pinned version, and warns of a name no workflow carries", async () => {
    const root = await initialised();
    await setLandJob(root, true);

    const sync = await syncs(root);

    expect(await readFile(join(root, LAND_WORKFLOW_PATH), "utf8")).toMatch(/npm install --global \S+@\d+\.\d+\.\d+/);
    expect(await rows(root)).toEqual([`claude:${LAND_WORKFLOW_ARTIFACT_ID}`, `cursor:${LAND_WORKFLOW_ARTIFACT_ID}`]);
    expect(sync.stdout).toContain('autonomy.landJob.workflows names "CI"');
  });

  it("takes the unedited file back with clean once the setting is off, with no sync between", async () => {
    const root = await initialised();
    await setLandJob(root, true);
    await syncs(root);
    await setLandJob(root, false);

    const clean = await runInProcess(COMMANDS, ["clean", "-y"], { cwd: root });

    expect(clean.code, clean.stderr).toBe(0);
    expect(existsSync(join(root, LAND_WORKFLOW_PATH))).toBe(false);
  });

  it("takes it back with a sync too, so turning the setting off stops the job, and leaves an edited copy", async () => {
    const root = await initialised();
    await setLandJob(root, true);
    await syncs(root);
    await setLandJob(root, false);
    await syncs(root);
    expect(existsSync(join(root, LAND_WORKFLOW_PATH))).toBe(false);

    await setLandJob(root, true);
    await syncs(root);
    await writeFile(join(root, LAND_WORKFLOW_PATH), `${await readFile(join(root, LAND_WORKFLOW_PATH), "utf8")}# mine\n`);
    await setLandJob(root, false);
    await syncs(root);
    expect(await readFile(join(root, LAND_WORKFLOW_PATH), "utf8")).toContain("# mine");
  });
});
