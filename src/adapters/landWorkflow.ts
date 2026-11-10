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

/** The job's name, so its check run's: the brake reads the default branch's tip, where GitHub may put this run, and leaves it out. */
export const LAND_JOB_NAME = "stamity-land";

/** The artifact id the ledger's rows carry. */
export const LAND_WORKFLOW_ARTIFACT_ID = "land-workflow";

/** The folder Actions reads workflows from. */
const WORKFLOWS_DIR = ".github/workflows";

/** The job's limit before any wait on a review tool: the land verb's own budget, the install and the checkout. */
const JOB_MINUTES = 15;

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
 * `workflows` are quoted as JSON, which YAML reads as a double-quoted scalar; the tool's login passed the login check, so it
 * holds no quote. The pull request number reaches the shell through the environment only: `inputs.pr` is never spliced into a
 * line. The queue sits on the job, not the workflow, so an event its `if:` skips takes no place from a real start, and is per
 * pull request, so one pull request's events never cancel another's. A silent tool sends no event to wake the job, so the job
 * waits the tool out itself, and the limit leaves room for that wait.
 */
export function buildLandWorkflow(workflows: readonly string[], review: { login: string; waitMinutes: number } | undefined, cli: CliCallContext): string | null {
  const install = installLine(cli);
  if (install === null) return null;
  return [
    "name: Stamity land",
    "",
    "# Finishes a run's land where its session cannot: it merges a run's own pull request on the",
    "# evidence `stamity run land` reads, or leaves it open. Written only while `autonomy.landJob` is on.",
    "# The head is data: the CLI installs by version before any head file exists, and no head code runs.",
    "# Under the emitted GITHUB_TOKEN this merge starts no Actions push workflow; that is all it stops.",
    "# issues: write closes the run's issue after the job's merge; GitHub does not apply the Closes line to this token's merge.",
    "# Generated — edits are overwritten on the next sync.",
    "",
    "on:",
    "  workflow_run:",
    `    workflows: [${workflows.map((name) => JSON.stringify(name)).join(", ")}]`,
    "    types: [completed]",
    ...(review === undefined ? [] : ["  issue_comment:", "    types: [created, edited]"]),
    "  workflow_dispatch:",
    "    inputs:",
    "      pr:",
    "        description: The pull request to land",
    "        required: true",
    "        type: number",
    "",
    "permissions:",
    "  contents: read",
    "",
    "jobs:",
    "  land:",
    `    name: ${LAND_JOB_NAME}`,
    "    permissions:",
    "      contents: write",
    "      pull-requests: write",
    "      checks: read",
    "      issues: write",
    "    if: >-",
    "      github.event_name == 'workflow_dispatch'",
    "      || (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.pull_requests[0].number)",
    ...(review === undefined ? [] : [`      || (github.event_name == 'issue_comment' && github.event.issue.pull_request && github.event.comment.user.login == '${review.login}')`]),
    "    concurrency:",
    "      group: stamity-land-${{ github.event.workflow_run.pull_requests[0].number || github.event.issue.number || inputs.pr || github.event.workflow_run.head_branch }}",
    "      cancel-in-progress: false",
    "    runs-on: ubuntu-latest",
    `    timeout-minutes: ${JOB_MINUTES + (review?.waitMinutes ?? 0)}`,
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

/** One line for each of `watched` no workflow file carries, the words `sync` and `check` both print. */
export async function unwatchedWorkflows(rootDir: string, watched: readonly string[]): Promise<string[]> {
  const names = await workflowNames(rootDir);
  return watched.filter((name) => !names.has(name)).map((name) => `autonomy.landJob.workflows names ${JSON.stringify(name)}, which no file in ${WORKFLOWS_DIR} carries, so the land job never starts on it`);
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
  const content = buildLandWorkflow(landJob.workflows, reviewTool, cli);
  if (content === null) return { content, warnings: ["autonomy.landJob is on, but this package has no npm channel, so no land workflow is written: the job installs the CLI by version"] };
  return { content, warnings: await unwatchedWorkflows(rootDir, landJob.workflows) };
}
