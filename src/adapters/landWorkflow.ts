import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveAutonomy } from "../config/autonomy.ts";
import { parseYamlStrict } from "../config/parse.ts";
import type { CliCallContext } from "../emit/substitution.ts";
import { pinnedCliPrefix } from "../shared/cliCall.ts";
import type { SetupManifest } from "../types/manifest.ts";

/**
 * The land job's workflow (REQ-FLOW-157): a GitHub job that finishes a run's land where its session cannot, emitted only
 * while `autonomy.landJob` is on. Off, this module adds no row and no warning, so default output does not move.
 *
 * The job adds no trust. It runs `stamity run land --job`, which re-proves the evidence the run's own land reads, from the
 * default branch's workflow and a CLI pinned by version. The head is data: the install comes before the checkout, so no head
 * file exists yet, and nothing from the head runs. `GITHUB_TOKEN` is its only credential, and the checkout keeps none of it.
 *
 * It sits below the plan composer, which places the row, so it cannot import `./copilot.ts`: the install line repeats
 * `pinnedCliInstall`'s two words, and a test holds the two equal.
 */

/** Where the workflow lands. A test holds it equal to `../manifest/ownedPaths.ts` and `../detect/repoAnalyzer.ts`, which cannot import it. */
export const LAND_WORKFLOW_PATH = ".github/workflows/stamity-land.yml";

/** The artifact id the ledger's rows carry. */
export const LAND_WORKFLOW_ARTIFACT_ID = "land-workflow";

/** The folder Actions reads workflows from. */
const WORKFLOWS_DIR = ".github/workflows";

/** Past this many bytes a workflow's `name:` is not read. */
const WORKFLOW_READ_MAX_BYTES = 1024 * 1024;

/**
 * The two actions, pinned by commit: this workflow holds write rights, so neither may move under it. `setup-node` before the
 * checkout means its node version is a literal, never a file the head could choose.
 */
const SETUP_NODE = "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0";
const CHECKOUT = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1";

/** The pinned global install, as `./copilot.ts`'s `pinnedCliInstall` builds it; `null` for a package with no npm channel. */
function installLine(cli: CliCallContext): string | null {
  if (cli.npmChannel === false) return null;
  return ["npm", "install", "--global", ...pinnedCliPrefix(cli.packageName, cli.version, cli).split(" ").slice(2)].join(" ");
}

/**
 * The workflow's text, or `null` for a package with no npm channel, which leaves the job nothing to install by version.
 * `workflows` are quoted as JSON, which YAML reads as a double-quoted scalar; `reviewLogin` passed the login check, so it holds
 * no quote. The pull request number reaches the shell through the environment only: `inputs.pr` is never spliced into a line.
 */
export function buildLandWorkflow(workflows: readonly string[], reviewLogin: string | undefined, cli: CliCallContext): string | null {
  const install = installLine(cli);
  if (install === null) return null;
  return [
    "name: Stamity land",
    "",
    "# Finishes a run's land where its session cannot: it merges a run's own pull request on the",
    "# evidence `stamity run land` reads, or leaves it open. Written only while `autonomy.landJob` is on.",
    "# The head is data: the CLI installs by version before any head file exists, and no head code runs.",
    "# GITHUB_TOKEN starts no push run after this merge, so a deploy on push does not run for it.",
    "# Generated — edits are overwritten on the next sync.",
    "",
    "on:",
    "  workflow_run:",
    `    workflows: [${workflows.map((name) => JSON.stringify(name)).join(", ")}]`,
    "    types: [completed]",
    ...(reviewLogin === undefined ? [] : ["  issue_comment:", "    types: [created, edited]"]),
    "  workflow_dispatch:",
    "    inputs:",
    "      pr:",
    "        description: The pull request to land",
    "        required: true",
    "        type: number",
    "",
    "permissions:",
    "  contents: write",
    "  pull-requests: write",
    "  checks: read",
    "",
    "concurrency:",
    "  group: stamity-land",
    "  cancel-in-progress: false",
    "",
    "jobs:",
    "  land:",
    "    if: >-",
    "      github.event_name == 'workflow_dispatch'",
    "      || (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.pull_requests[0].number)",
    ...(reviewLogin === undefined ? [] : [`      || (github.event_name == 'issue_comment' && github.event.issue.pull_request && github.event.comment.user.login == '${reviewLogin}')`]),
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 15",
    "    env:",
    "      PR_NUMBER: ${{ github.event.workflow_run.pull_requests[0].number || github.event.issue.number || inputs.pr }}",
    "    steps:",
    `      - uses: ${SETUP_NODE}`,
    "        with:",
    '          node-version: "lts/*"',
    `      - run: ${install}`,
    `      - uses: ${CHECKOUT}`,
    "        with:",
    "          ref: refs/pull/${{ env.PR_NUMBER }}/head",
    "          fetch-depth: 0",
    "          persist-credentials: false",
    '      - run: stamity run land --job --pr "$PR_NUMBER" --ready --json',
    "        env:",
    "          GH_TOKEN: ${{ github.token }}",
    "",
  ].join("\n");
}

/**
 * The names GitHub would start a workflow under, from each workflow file but this one: its `name:`, else its path, which is
 * what Actions shows for a file with none. A link, a file over the cap or one that does not parse names nothing.
 */
async function workflowNames(rootDir: string): Promise<Set<string>> {
  const dir = join(rootDir, ...WORKFLOWS_DIR.split("/"));
  let files: string[];
  try {
    files = (await readdir(dir)).filter((file) => /\.ya?ml$/.test(file) && `${WORKFLOWS_DIR}/${file}` !== LAND_WORKFLOW_PATH);
    // reason: not silent — a folder that does not read names nothing, so every watched name is reported missing.
  } catch {
    return new Set();
  }
  const names = await Promise.all(
    files.map(async (file) => {
      const path = join(dir, file);
      try {
        const stat = await lstat(path);
        if (!stat.isFile() || stat.size > WORKFLOW_READ_MAX_BYTES) return null;
        const name = (parseYamlStrict(await readFile(path, "utf8"), file) as Record<string, unknown> | null)?.["name"];
        return typeof name === "string" && name !== "" ? name : `${WORKFLOWS_DIR}/${file}`;
        // reason: not silent — a file that does not read names nothing, so a name only it held is reported missing.
      } catch {
        return null;
      }
    }),
  );
  return new Set(names.filter((name) => name !== null));
}

/** What the plan adds for the land job: the workflow's text, `null` while none is written, and what a sync should say. */
export interface LandWorkflowPlan {
  readonly content: string | null;
  readonly warnings: readonly string[];
}

/**
 * The row and the warnings for `manifest`. A renamed workflow stops the job with no sign, since GitHub starts nothing for a
 * name no workflow carries, so each such name is a warning.
 */
export async function planLandWorkflow(rootDir: string, manifest: SetupManifest, cli: CliCallContext): Promise<LandWorkflowPlan> {
  const { landJob, reviewTool } = resolveAutonomy(manifest);
  if (landJob === undefined) return { content: null, warnings: [] };
  const content = buildLandWorkflow(landJob.workflows, reviewTool?.login, cli);
  if (content === null) return { content, warnings: ["autonomy.landJob is on, but this package has no npm channel, so no land workflow is written: the job installs the CLI by version"] };
  const names = await workflowNames(rootDir);
  const missing = landJob.workflows.filter((name) => !names.has(name));
  return {
    content,
    warnings: missing.map((name) => `autonomy.landJob.workflows names ${JSON.stringify(name)}, which no file in ${WORKFLOWS_DIR} carries, so the land job never starts on it`),
  };
}
