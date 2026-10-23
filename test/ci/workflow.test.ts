import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
// @ts-expect-error — the probe is a plain .mjs script with no type declarations, and stays that
// way: it re-execs itself under a type-stripping flag, so it cannot be TypeScript itself.
import { osvQueryBatch } from "../../scripts/advisory-check.mjs";
// @ts-expect-error — import-safe native ESM CI helper with no type declarations, outside the product package.
import { decide as classifyChange } from "../../scripts/ci/records-only.mjs";
// @ts-expect-error — import-safe native ESM CI helper with no type declarations, outside the product package.
import { IMAGE as CLOUD_LEG_IMAGE } from "../../scripts/ci/cloud-leg.mjs";
import { CURATED_MCP_SERVERS, pinnedPackageSpec } from "../../src/mcp/catalog.ts";
import { evaluateWorkflowExpression, type ExpressionContext } from "./workflowExpression.ts";
import { ensureDistBuilt } from "../support/distBuild.ts";
import { carriedProcessEnv, NO_GIT_CONFIG } from "../support/repoFixtures.ts";

/**
 * Drift guard on every workflow in `.github/workflows/` and the update policy that feeds them.
 *
 * `.github/` is where the properties that make this repository trustworthy are written down, and
 * it is the one place where a "harmless" edit makes CI GREENER rather than redder. Dropping a
 * self-consistency gate, widening a publish condition, un-pinning an action, or handing a job the
 * OIDC token it should not have all pass every other check in the tree. So the workflows are read
 * here as DATA — parsed the way GitHub parses them, from YAML bytes — and the properties that make
 * them gates are pinned:
 *
 *   ci.yml        the four-leg matrix (windows in two shards) and the per-leg step split, step order (Build before Test,
 *                 so dist/ exists for everything after it), the generate-and-diff triple, the
 *                 aggregator's needs and its result assertion, the concurrency grouping, and the
 *                 lane map that promises to name every lane this repository does not run.
 *   docs-site.yml the build/deploy split: the build job holds nothing elevated, the deploy job
 *                 holds `pages: write` and the OIDC token behind a condition that no push, no
 *                 pull request and no unarmed dispatch can satisfy. That condition is EVALUATED
 *                 against every trigger shape, not string-matched, for the reason release.yml's
 *                 is (see ./workflowExpression.ts).
 *   nightly.yml   the demoted legs, and that nothing here is merge-blocking.
 *   pr-checks.yml the three pull-request-only gates — DCO, title shape, dual size budget — and
 *                 the aggregator that gives them one name a branch rule can bind.
 *   release.yml   the two-job split: the gates job holds no id-token, the publish job holds it
 *                 behind an environment, the publish condition denies everything but a tag push
 *                 and an explicit real-run dispatch, and the release proofs run on BOTH of those.
 *                 The conditions are evaluated rather than string-matched (see
 *                 ./workflowExpression.ts), and the proof script is EXECUTED against a scratch
 *                 repository rather than read for substrings.
 *   every file    every `uses:` pinned to a 40-hex SHA and commented with the precise version;
 *                 every job carrying an explicit least-privilege `permissions` and a timeout; no
 *                 `npm publish` outside the one job whose condition denies a dry run; no npm
 *                 credential at step, job or workflow scope; no internal process vocabulary.
 *
 * THE FILE SET IS READ FROM THE DIRECTORY, not from a list written here. The shared properties in
 * the last group used to run over three hard-coded names while their own wording claimed the whole
 * repository, so a fourth workflow file carrying `id-token: write` and a `run: npm publish` passed
 * every assertion in this suite. Listing the directory is what makes "every workflow" true, and it
 * is what puts a new file under the shared gates on the commit that adds it.
 *
 * The two suites at the bottom go one step further and exercise the probe the `supply-chain` lane
 * runs, because the property that matters there (a failed lookup never reports CLEAN) is not
 * visible in the workflow file at all: it lives in what the script does when the network says no.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const WORKFLOW_DIR = join(REPO_ROOT, ".github", "workflows");

interface WorkflowStep {
  readonly name?: string;
  readonly id?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly if?: string;
  readonly with?: Readonly<Record<string, unknown>>;
  readonly env?: Readonly<Record<string, string>>;
  readonly shell?: string;
  readonly "continue-on-error"?: boolean;
}

/**
 * A matrix row of the `check` job. Every field is optional because the legs differ in which flags
 * they carry, and each suite asserts the whole row it expects rather than trusting the type.
 * TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): the `apm-install`
 * matrix left with the APM route, so its `apm`, `role` and `expect_failure` fields went with it.
 */
interface MatrixInclude {
  readonly os?: string;
  readonly node?: string;
  readonly label?: string;
  readonly coverage?: boolean;
  readonly toolchain?: boolean;
  readonly tarball_smoke?: boolean;
  readonly shard?: string;
}

interface WorkflowJob {
  readonly name?: string;
  readonly "runs-on"?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly "timeout-minutes"?: number;
  readonly if?: string;
  readonly needs?: readonly string[] | string;
  readonly environment?: string | { readonly name?: string; readonly url?: string };
  readonly permissions?: Readonly<Record<string, string>>;
  readonly outputs?: Readonly<Record<string, string>>;
  readonly strategy?: {
    readonly "fail-fast"?: boolean;
    readonly matrix?: { readonly include?: readonly MatrixInclude[] };
  };
  readonly steps: readonly WorkflowStep[];
}

interface Workflow {
  readonly name?: string;
  readonly on?: unknown;
  readonly env?: Readonly<Record<string, string>>;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly concurrency?: { readonly group?: string; readonly "cancel-in-progress"?: boolean };
  readonly jobs: Record<string, WorkflowJob>;
}

interface LoadedWorkflow {
  readonly file: string;
  readonly source: string;
  readonly workflow: Workflow;
}

function load(file: string): LoadedWorkflow {
  const source = readFileSync(join(WORKFLOW_DIR, file), "utf8");
  return { file, source, workflow: parse(source) as Workflow };
}

/** Every workflow file on disk, in a stable order. The set is discovered, never declared. */
const WORKFLOW_FILES: readonly string[] = readdirSync(WORKFLOW_DIR)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .toSorted();

const ALL_WORKFLOWS: readonly LoadedWorkflow[] = WORKFLOW_FILES.map(load);

/** The named handle for one file, resolved out of the discovered set. */
function workflowNamed(file: string): LoadedWorkflow {
  const found = ALL_WORKFLOWS.find((loaded) => loaded.file === file);
  expect(found, `${file} must exist in ${WORKFLOW_DIR}`).toBeDefined();
  return found as LoadedWorkflow;
}

const ci = workflowNamed("ci.yml");
const docsSite = workflowNamed("docs-site.yml");
const nightly = workflowNamed("nightly.yml");
const prChecks = workflowNamed("pr-checks.yml");
const release = workflowNamed("release.yml");

/** The triggers a workflow declares. YAML 1.2 keeps `on` a string key; 1.1 folded it to `true`. */
function triggersOf(workflow: Workflow): readonly string[] {
  const record = workflow as unknown as Record<string, unknown>;
  const on = record["on"] ?? record["true"];
  if (on === null || typeof on !== "object") return [];
  return Object.keys(on as Record<string, unknown>);
}

function jobOf(loaded: LoadedWorkflow, id: string): WorkflowJob {
  const job = loaded.workflow.jobs[id];
  expect(job, `${loaded.file} must declare a job "${id}"`).toBeDefined();
  return job as WorkflowJob;
}

function stepsOf(loaded: LoadedWorkflow, jobId: string): readonly WorkflowStep[] {
  return jobOf(loaded, jobId).steps;
}

/**
 * Index of the step with EXACTLY this name; -1 when absent.
 *
 * Exact rather than prefixed: two steps in the `check` job now share the prefix "Test", and a
 * prefix match would silently pick whichever came first and assert against the wrong step.
 */
function indexOf(steps: readonly WorkflowStep[], name: string): number {
  return steps.findIndex((step) => step.name === name);
}

function stepOf(steps: readonly WorkflowStep[], name: string): WorkflowStep {
  const step = steps[indexOf(steps, name)];
  expect(step, `step "${name}" must exist`).toBeDefined();
  return step as WorkflowStep;
}

function runOf(steps: readonly WorkflowStep[], name: string): string {
  const run = stepOf(steps, name).run;
  expect(run, `step "${name}" must have a run command`).toBeTypeOf("string");
  return run ?? "";
}

/** The `if:` condition on a step, or `""` when it runs unconditionally. */
function conditionOf(steps: readonly WorkflowStep[], name: string): string {
  return stepOf(steps, name).if ?? "";
}

/**
 * ADDED (run 2026-10-13_records-branch, unit r5b-ci-folds, review/26 signed off as S28): a site
 * build in ci.yml also does the two things docs-site.yml's build does after `npm run build`. It
 * copies `llms.txt` into the output, and it uploads the output, failing when the output is empty.
 * So a website pull request keeps both checks before the merge, and a reviewer has the built
 * bytes to download. Same commands and the same pin as docs-site.yml, under the build step's own
 * condition, right after it. Returns the artifact name the job uploads under.
 */
function expectSiteHandback(steps: readonly WorkflowStep[]): string {
  const site = stepsOf(docsSite, "build");
  const names = ["Build the site", "Serve llms.txt at the site root", "Upload the built site"];
  const at = indexOf(steps, "Build the site");
  expect(at, "the job builds the site").toBeGreaterThanOrEqual(0);
  expect(steps.slice(at, at + names.length).map((step) => step.name)).toEqual(names);
  const condition = conditionOf(steps, "Build the site");
  for (const name of names) expect(conditionOf(steps, name), name).toBe(condition);
  const serve = stepOf(steps, "Serve llms.txt at the site root") as WorkflowStep & {
    readonly "working-directory"?: string;
  };
  expect(serve.run).toBe(runOf(site, "Serve llms.txt at the site root"));
  expect(serve.run).not.toContain("${{");
  expect(serve["working-directory"], "the copy runs from the repository root").toBeUndefined();
  const upload = stepOf(steps, "Upload the built site");
  const source = stepOf(site, "Upload the built site");
  expect(upload.run).toBeUndefined();
  expect(upload.uses).toBe(source.uses);
  expect(upload.uses).toMatch(/^actions\/upload-artifact@[0-9a-f]{40}$/);
  const name = String(upload.with?.["name"] ?? "");
  expect(name, "the artifact is named").not.toBe("");
  expect(upload.with).toEqual({ ...source.with, name });
  expect(upload.with).toMatchObject({ path: "website/build", "if-no-files-found": "error", "retention-days": 7 });
  // No two uploads in one ci.yml run share a name: upload-artifact refuses a second artifact
  // under a name the run already holds.
  const uploads = Object.values(ci.workflow.jobs)
    .flatMap((job) => job.steps)
    .filter((step) => (step.uses ?? "").startsWith("actions/upload-artifact@"))
    .map((step) => String(step.with?.["name"] ?? ""));
  expect(new Set(uploads).size, uploads.join(", ")).toBe(uploads.length);
  return name;
}

/** The egress allowlist a job's harden-runner step declares, or `""` when it declares none. */
function allowlistOf(steps: readonly WorkflowStep[]): string {
  return String(
    steps.find((step) => (step.uses ?? "").startsWith("step-security/harden-runner@"))?.with?.[
      "allowed-endpoints"
    ] ?? "",
  );
}

/** Every job in every workflow, as `[file, jobId, job]` rows. */
const ALL_JOBS: readonly (readonly [string, string, WorkflowJob])[] = ALL_WORKFLOWS.flatMap(
  (loaded) =>
    Object.entries(loaded.workflow.jobs).map(
      ([id, job]) => [loaded.file, id, job] as readonly [string, string, WorkflowJob],
    ),
);

const ALL_STEPS: readonly (readonly [string, string, WorkflowStep])[] = ALL_JOBS.flatMap(
  ([file, id, job]) =>
    (job.steps ?? []).map(
      (step) => [file, id, step] as readonly [string, string, WorkflowStep],
    ),
);

/**
 * The jobs whose run steps hold an `npm publish` line, as `file:job`, split in two: `rehearsing`
 * when every such line in the job carries `--dry-run`, `publishing` otherwise. Read per line, so a
 * job with one rehearsal line and one real publish counts as publishing.
 */
function classifyNpmPublishJobs(steps: readonly (readonly [string, string, WorkflowStep])[]): {
  readonly publishing: readonly string[];
  readonly rehearsing: readonly string[];
} {
  const lines = new Map<string, string[]>();
  for (const [file, job, step] of steps) {
    for (const line of (step.run ?? "").split("\n")) {
      if (!/\bnpm publish\b/.test(line)) continue;
      const key = `${file}:${job}`;
      lines.set(key, [...(lines.get(key) ?? []), line]);
    }
  }
  const keys = [...lines.keys()].toSorted();
  const rehearses = (key: string): boolean => (lines.get(key) ?? []).every((line) => /\s--dry-run\b/.test(line));
  return { publishing: keys.filter((key) => !rehearses(key)), rehearsing: keys.filter(rehearses) };
}

// ── ci.yml ───────────────────────────────────────────────────────────────────

/**
 * The canonical repository, which ci.yml's `records` job is guarded to and its aggregator reads
 * through `$REPO`. Committed workflow text a fork's rename leaves alone (ADDED by run 2026-10-13_records-branch, unit r5-ci-records-job (2026-10-14)).
 */
const CANONICAL_REPOSITORY = "zomarit/stamity";

describe("ci.yml — the merge-blocking gate", () => {
  const jobs = ci.workflow.jobs;
  const check = stepsOf(ci, "check");

  // TEST CHANGE, justified (2026-10-08, run 2026-10-08_maintainer-tooling, unit a1-proven-push):
  // the title's count moves from eight to nine because `prove-pr` joins; every lane the old title
  // named is still pinned below.
  // TEST CHANGE, justified (2026-10-14, run 2026-10-13_records-branch, unit r5-ci-records-job): the title's count
  // moves from nine to ten because the canonical `records` job joins after `lanes`; the `lanes` job
  // keeps its place, and every other lane is still pinned below.
  // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): the count moves
  // from ten to eight because `apm-install` and `plugin-route` leave with the APM and plugin routes,
  // which 1.15.0 deletes; `check` is the one heavy gate left, and every other lane is still pinned.
  // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit e11-ci-container-leg): the
  // count moves from eight to nine because `cloud-container` joins after `check`, whose side of the
  // split it runs on; every other lane is still pinned, in its place.
  it("keeps the nine lanes: the classifier, the proven-push reader, the check matrix, the cloud container leg, the lanes job, the records job, two advisory probes, and one stable aggregator", () => {
    // CHANGED by plan 008 file 3, unit V1w: `plugin-route` joins the merge-blocking set, so this
    // list and the aggregator's `needs` below both move. It sits beside `apm-install` because the
    // two answer the same KIND of question — what a real consumer's tooling does with a published
    // surface — and the ordering here mirrors the lane map's.
    // TEST CHANGE, justified (plan 013 file 3, unit sw06-records-only-ci-lane): two lanes join.
    // `changes` classifies the push or pull request first, and `records` runs in place of the
    // three heavy lanes when every changed path is a record. The title's count moves with them.
    // TEST CHANGE, justified (2026-10-08, unit a1-proven-push): `prove-pr` joins after `changes`.
    // On a push to `main` it reads whether a pull request already proved the pushed tree, and the
    // heavy lanes and the records lane skip when it did; on every other trigger it is skipped.
    // TEST CHANGE, justified (2026-10-08, run 2026-10-08_maintainer-tooling, unit a2-ci-lanes): the
    // `records` job is renamed `lanes`, because it now runs the records, specs, learnings and
    // website lanes; the count and every other lane are unchanged.
    expect(Object.keys(jobs)).toEqual([
      "changes",
      "prove-pr",
      "check",
      "cloud-container",
      "lanes",
      "records",
      "supply-chain",
      "dependency-review",
      "all-ci-checks",
    ]);
    for (const [file, id, job] of ALL_JOBS) {
      expect(job["timeout-minutes"], `${file}:${id}`).toBeTypeOf("number");
    }
  });

  it("runs on every trigger its lane map reasons about, and none it does not", () => {
    // The header describes a pull-request lane and a weekly schedule. A rationale that argues
    // from a trigger the workflow does not have describes a lane that cannot be reached, and the
    // reader cannot tell the claim is vacuous — which is exactly what happened when this file
    // reasoned about pull requests while carrying no `pull_request:` key.
    expect(triggersOf(ci.workflow).toSorted()).toEqual([
      "pull_request",
      "push",
      "schedule",
      "workflow_dispatch",
    ]);
    expect(jobOf(ci, "dependency-review").if).toBe("github.event_name == 'pull_request'");
  });

  it("pins the four legs and the per-leg flags that drive the step split", () => {
    const strategy = jobs["check"]?.strategy;
    expect(strategy?.["fail-fast"]).toBe(false);
    // TEST CHANGE, justified (plan 013 file 3, unit sw12-flake-unit): the one windows leg runs
    // the suite in two shards. It was the slowest leg in the matrix and ran the whole suite on its
    // own; two half-suites halve the wall time a load timeout has to land in, and the aggregator
    // still needs every leg of `check` (asserted below), so both shards are merge-blocking.
    expect(strategy?.matrix?.include).toEqual([
      {
        os: "ubuntu-latest",
        node: "22.22.2",
        label: "floor",
        coverage: true,
        tarball_smoke: true,
      },
      { os: "ubuntu-latest", node: "24", label: "lts", coverage: true, toolchain: true },
      { os: "windows-latest", node: "24", label: "windows-1", shard: "1/2" },
      { os: "windows-latest", node: "24", label: "windows-2", shard: "2/2" },
    ]);
    // The job name has to carry the leg, or three rows report under one name.
    expect(jobs["check"]?.name).toContain("matrix.label");
    expect(jobs["check"]?.name).toContain("matrix.node");
  });

  it("fixes windows line endings BEFORE checkout, or the byte-diffing gates report a false red", () => {
    // The root .gitattributes pins the checkout to LF on any Git that honours attributes; this
    // step is the layer under it, covering the runner's global config, where Git's default
    // core.autocrlf on Windows rewrites LF to CRLF as it writes the working tree. `check` diffs
    // regenerated output against committed bytes; a line-ending rewrite would surface as a
    // content drift. src/merge/safeWrite.ts and src/merge/reclaim.ts fold CRLF at read time for
    // clones made before the attribute existed.
    const guard = indexOf(check, "Pin line endings before checkout");
    expect(guard).toBe(0);
    expect(guard).toBeLessThan(indexOf(check, "Checkout"));
    expect(conditionOf(check, "Pin line endings before checkout")).toBe("runner.os == 'Windows'");
    expect(runOf(check, "Pin line endings before checkout")).toContain("core.autocrlf false");
  });

  it("carries the .gitattributes that pins the checkout itself to LF", () => {
    // The pre-checkout step above only reaches the runner's global config. Anyone cloning this
    // repository by hand gets LF from the attribute or not at all, and the byte-diffing gates
    // are the same ones either way.
    const attributes = join(REPO_ROOT, ".gitattributes");
    expect(existsSync(attributes), ".gitattributes must exist at the repository root").toBe(true);
    expect(readFileSync(attributes, "utf8")).toMatch(/^\*\s+text=auto\s+eol=lf$/m);
  });

  it("keeps the toolchain steps on one leg and the runtime gates on one leg per OS and Node pair", () => {
    // None of these four answers a question that depends on the OS or the Node version, so a
    // second copy of them buys no coverage. The older reason — tsdown declares ^22.18.0 and
    // eslint ^22.13.0, both above the 22.12.0 floor this matrix used to run — retired with the
    // move to 22.22.2, which satisfies both.
    for (const step of ["Typecheck", "Lint", "Self-consistency (generate-and-diff)", "Unused code and dependencies"]) {
      expect(conditionOf(check, step), step).toBe("matrix.toolchain");
    }
    // Runtime verification stays on every leg — that is what the floor and windows legs are for.
    for (const step of ["Install", "Build"]) {
      expect(conditionOf(check, step), step).toBe("");
    }
    // TEST CHANGE, justified (plan 013 file 3, unit sw12-flake-unit): the dogfood check and the
    // leak gate answer about the checkout and the binary, not about which half of the suite a
    // shard ran, so the second windows shard skips them and the first keeps the windows proof.
    // Evaluated per leg rather than string-matched: exactly one leg skips them.
    for (const step of ["Dogfood check", "Leak gate"]) {
      expect(conditionOf(check, step), step).toBe("matrix.shard != '2/2'");
      const legs = jobs["check"]?.strategy?.matrix?.include ?? [];
      const running = legs.filter((leg) => evaluateWorkflowExpression(conditionOf(check, step), { matrix: leg }));
      expect(running.map((leg) => leg.label), step).toEqual(["floor", "lts", "windows-1"]);
    }
    expect(conditionOf(check, "Tarball smoke (publish shape)")).toBe("matrix.tarball_smoke");
  });

  it("makes repository hygiene mandatory on the PR toolchain leg with its base available", () => {
    const step = stepOf(check, "Repository hygiene");
    expect(step.run).toBe('node scripts/repo-hygiene.mjs --base "$HYGIENE_BASE_REF"');
    expect(step.env?.HYGIENE_BASE_REF).toBe("${{ github.event.pull_request.base.sha }}");
    expect(step["continue-on-error"]).toBeUndefined();
    const depth = String(stepOf(check, "Checkout").with?.["fetch-depth"])
      .replace(/^\$\{\{/, "").replace(/\}\}$/, "");
    for (const event_name of ["pull_request", "push", "schedule", "workflow_dispatch"]) {
      for (const leg of jobs["check"]?.strategy?.matrix?.include ?? []) {
        const context = { github: { event_name }, matrix: leg };
        const required = event_name === "pull_request" && leg.toolchain === true;
        expect(evaluateWorkflowExpression(step.if ?? "false", context)).toBe(required);
        expect(evaluateWorkflowExpression(`(${depth}) == '0'`, context)).toBe(required);
      }
    }
    expect(jobOf(ci, "all-ci-checks").needs).toContain("check");
  });

  // ADDED by run 2026-10-08_maintainer-tooling, unit a2-ci-lanes (review/32, signed off: S3 as
  // written). `all-ci-checks` never passes a website change whose site does not build, mixed
  // changes included: a change touching the site AND a path in no lane takes the full side, so
  // the full side builds the site too — on the LTS leg alone, with docs-site.yml's own steps, last.
  it("builds the docs site on the LTS leg when the change touches the site, mixed changes included", () => {
    const site = docsSite.workflow.jobs["build"]?.steps ?? [];
    const legs = jobs["check"]?.strategy?.matrix?.include ?? [];
    const names = ["Set up Node for the site", "Install the site", "Build the site"] as const;
    const condition = "matrix.toolchain && needs.changes.outputs.site_build != 'false'";
    for (const name of names) expect(conditionOf(check, name), name).toBe(condition);
    const siteNode = stepOf(check, "Set up Node for the site");
    expect(siteNode.uses).toBe(stepOf(site, "Set up Node").uses);
    expect(siteNode.with).toEqual(stepOf(site, "Set up Node").with);
    for (const [name, from] of [["Install the site", "Install"], ["Build the site", "Build"]] as const) {
      const step = stepOf(check, name) as WorkflowStep & { readonly "working-directory"?: string };
      expect(step.run, name).toBe(runOf(site, from));
      expect(step["working-directory"], name).toBe("website");
    }
    expect(runOf(check, "Install the site")).toBe("npm ci --ignore-scripts");
    // TEST CHANGE, justified (run 2026-10-13_records-branch, unit r5b-ci-folds, review/26 signed
    // off as S28): the llms.txt copy and the upload follow the build, as in docs-site.yml, so the
    // leg's last steps are five, not three; the build steps keep their place before them.
    const handback = ["Serve llms.txt at the site root", "Upload the built site"] as const;
    expect(expectSiteHandback(check)).toBe("docs-site-check");
    // Last, after every gate the leg runs, so no gate reads the site's install or build output.
    expect(check.slice(-(names.length + handback.length)).map((step) => step.name)).toEqual([...names, ...handback]);
    // Evaluated per leg: the LTS leg builds the site on `true`, and on an absent answer (the full
    // side fails closed); `false` builds nothing, and no other leg ever builds it.
    for (const site_build of ["true", "false", ""]) {
      for (const leg of legs) {
        const context = { matrix: leg, needs: { changes: { result: "success", outputs: { full: "true", site_build } } } };
        const builds = evaluateWorkflowExpression(condition, context) === true;
        expect(builds, `${leg.label ?? "?"}/${site_build}`).toBe(leg.label === "lts" && site_build !== "false");
      }
    }
    // The mixed change end to end: the classifier answers full with the site build, so `check`
    // runs (and the lanes job does not), and its LTS leg builds the site inside the required result.
    const mixed = {
      github: { event_name: "pull_request" },
      needs: {
        changes: { result: "success", outputs: { full: "true", site_build: "true" } },
        "prove-pr": { result: "skipped", outputs: {} },
      },
    };
    expect(evaluateWorkflowExpression(jobOf(ci, "check").if ?? "false", mixed)).toBe(true);
    expect(evaluateWorkflowExpression(jobOf(ci, "lanes").if ?? "false", mixed)).toBe(false);
    const lts = legs.find((leg) => leg.label === "lts");
    expect(evaluateWorkflowExpression(condition, { ...mixed, matrix: lts })).toBe(true);
    expect(jobOf(ci, "all-ci-checks").needs).toContain("check");
  });

  it("runs the coverage floors on the legs that can meet them, and the suite on all of them", () => {
    // vitest.config.ts holds the merge and emit core at 100% and those floors BLOCK. The windows
    // leg skips the mode- and symlink-dependent cases by platform guard, so a coverage run there
    // would report a shortfall that belongs to the platform. The floors are untouched: they still
    // gate, on both ubuntu legs, and windows runs the same suite without the instrument.
    // TEST CHANGE, justified (plan 013 file 3, unit sw12-flake-unit): both steps run the suite
    // through scripts/ci/test-run.mjs, which re-runs a timeout-only failure once — the whole
    // suite again on a coverage leg, so the floors are measured on a complete run — and annotates
    // a green re-run as flaky. What each step runs is unchanged: coverage on the ubuntu legs, the
    // plain suite (now one shard of it) on windows. test/ci/testRun.test.ts proves the re-run.
    expect(runOf(check, "Test with coverage floors")).toBe("node scripts/ci/test-run.mjs --coverage");
    expect(conditionOf(check, "Test with coverage floors")).toBe("matrix.coverage");
    expect(runOf(check, "Test")).toBe('node scripts/ci/test-run.mjs --shard="$TEST_SHARD"');
    expect(conditionOf(check, "Test")).toBe("${{ !matrix.coverage }}");
    // The shard arrives as data through `env:`, and bash reads it on every runner (the windows
    // default shell, pwsh, would read `$TEST_SHARD` as an unset PowerShell variable).
    expect(stepOf(check, "Test").env?.["TEST_SHARD"]).toBe("${{ matrix.shard }}");
    expect(stepOf(check, "Test").shell).toBe("bash");
    // Mutually exclusive, so exactly one Test step runs per leg.
    const legs = jobs["check"]?.strategy?.matrix?.include ?? [];
    for (const leg of legs) {
      expect(
        evaluateWorkflowExpression("matrix.coverage", { matrix: leg }) !==
          evaluateWorkflowExpression("${{ !matrix.coverage }}", { matrix: leg }),
        leg.label,
      ).toBe(true);
    }
  });

  it("splits every leg without coverage into shards that cover the suite exactly once", () => {
    const legs = jobs["check"]?.strategy?.matrix?.include ?? [];
    const sharded = legs.filter((leg) => leg.coverage !== true);
    // A leg without coverage runs the Test step; with no shard it would run the whole suite, and
    // a shard missing from the set would leave part of the suite unrun on that OS.
    expect(sharded.length).toBeGreaterThan(1);
    const total = new Set(sharded.map((leg) => leg.shard?.split("/")[1]));
    expect(total.size).toBe(1);
    const count = Number([...total][0]);
    expect(count).toBe(sharded.length);
    expect(sharded.map((leg) => leg.shard).toSorted()).toEqual(
      Array.from({ length: count }, (_, index) => `${index + 1}/${count}`),
    );
    expect(new Set(sharded.map((leg) => leg.os)).size).toBe(1);
    // The coverage legs are never sharded: a floor can only be met by a whole run.
    for (const leg of legs.filter((row) => row.coverage === true)) expect(leg.shard, leg.label).toBeUndefined();
    // Every shard is a leg of `check`, and the aggregator requires `check` to succeed as a whole.
    expect(jobOf(ci, "all-ci-checks").needs).toContain("check");
    expect(stepsOf(ci, "all-ci-checks").map((step) => step.run ?? "").join("\n"))
      .toContain('test "${{ needs.check.result }}" = "success"');
  });

  it("runs Build before either Test step, so the dist journey sees the fresh CI build", () => {
    const build = indexOf(check, "Build");
    expect(build).toBeGreaterThanOrEqual(0);
    expect(build).toBeLessThan(indexOf(check, "Test with coverage floors"));
    expect(build).toBeLessThan(indexOf(check, "Test"));
    // dist/cli.js only exists after Build.
    expect(indexOf(check, "Dogfood check")).toBeGreaterThan(build);
    expect(indexOf(check, "Self-consistency (generate-and-diff)")).toBeGreaterThan(build);
  });

  it("regenerates and byte-diffs every generated artifact class", () => {
    const run = runOf(check, "Self-consistency (generate-and-diff)");
    expect(run).toContain("node scripts/generate-capability-matrix.mjs");
    expect(run).toContain("node scripts/generate-docs.mjs");
    // Pack manifests run in --check mode in CI: verify-only, writes nothing.
    expect(run).toContain("node scripts/generate-pack-manifests.mjs --check");
    // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): the plugin
    // manifests and the APM package are no longer generated, because 1.15.0 deletes both routes, so
    // their two `--check` lines leave the step. The assertion turns around: a generator that no
    // longer exists must not be called, or the step fails on a missing script.
    expect(run).not.toContain("generate-plugin-manifests");
    expect(run).not.toContain("generate-apm-package");
    expect(run).toContain("git diff --exit-code");
    // `git diff --exit-code` ignores untracked files by design (gitignored coverage/ and dist/
    // output must not trip the gate); porcelain would not.
    expect(run).not.toContain("git status --porcelain");
  });

  it("re-proves the committed dogfood configs with the binary CI just built", () => {
    expect(runOf(check, "Dogfood check")).toBe("node dist/cli.js check");
  });

  it("gates the published shape on the oldest Node the package claims to support", () => {
    // Every other step resolves the corpus through the source checkout, which a user never has;
    // only a packed-and-installed run sees dist/content. It runs on the floor leg because what it
    // proves is a RUNTIME claim.
    expect(runOf(check, "Tarball smoke (publish shape)")).toBe("node scripts/tarball-smoke.mjs");
    const floor = jobs["check"]?.strategy?.matrix?.include?.find((leg) => leg.tarball_smoke);
    expect(floor?.node).toBe("22.22.2");
  });

  it("proves the install runs under the ignore-scripts floor", () => {
    // `npm ci` executes every dependency's lifecycle scripts by default, on the runner, before
    // any gate has looked at a byte. `.npmrc` is what stops it, and npm reads the project config
    // from the working directory — so the file has to exist at the repository root.
    expect(runOf(check, "Install")).toBe("npm ci");
    const npmrc = readFileSync(join(REPO_ROOT, ".npmrc"), "utf8");
    expect(npmrc).toMatch(/^ignore-scripts\s*=\s*true$/m);
  });

  it("runs the pin-currency probe, since an exact pin can never notice an advisory", () => {
    // The exact pins in the MCP catalog guarantee the bytes never change, which is precisely why
    // something has to go and ask whether those bytes are still a good idea.
    const supplyChain = stepsOf(ci, "supply-chain");
    expect(runOf(supplyChain, "Advisory and pin-currency check")).toBe(
      "node scripts/advisory-check.mjs",
    );
  });

  it("does not cancel a scheduled run with a push, or the reverse", () => {
    // One group across every trigger meant the Monday schedule and a push to `main` cancelled
    // each other, leaving a commit carrying a CANCELLED check rather than a passing one.
    expect(ci.workflow.concurrency?.group).toContain("github.event_name");
    expect(ci.workflow.concurrency?.group).toContain("github.ref");
    expect(ci.workflow.concurrency?.["cancel-in-progress"]).toBe(true);
  });

  it("exposes one stable context name to require, whatever the matrix does", () => {
    const aggregator = jobOf(ci, "all-ci-checks");

    expect(aggregator.name).toBe("all-ci-checks");
    // `dependency-review` is advisory AND pull-request-only: requiring it would make every push
    // wait on a job that never reports.
    // TEST CHANGE, justified (plan 013 file 3, unit sw06-records-only-ci-lane): `changes` and
    // `records` join `needs`, because the aggregator now asserts which side of the records-only
    // split ran, and it can only read the result of a job it needs.
    // TEST CHANGE, justified (2026-10-08, unit a1-proven-push): `prove-pr` joins `needs`, because
    // the aggregator now asserts a third legal shape (a proven push, every heavy lane and the
    // records lane skipped) and must read `prove-pr`'s result and its `proven` output to do so.
    // TEST CHANGE, justified (2026-10-08, run 2026-10-08_maintainer-tooling, unit a2-ci-lanes): `records` is
    // renamed `lanes`, and the split is read off `changes`' `full` answer instead of
    // `records_only`; both sides are still asserted, each naming what ran and what skipped.
    // TEST CHANGE, justified (2026-10-14, run 2026-10-13_records-branch, unit r5-ci-records-job): `records` joins
    // `needs`, because the aggregator asserts its result outside the three shapes.
    // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): `apm-install`
    // and `plugin-route` leave `needs` and the report, because 1.15.0 deletes the APM and plugin
    // routes and both jobs with them. The branch ruleset requires `all-ci-checks` and
    // `all-pr-checks` only, so no required context named the deleted jobs. Their assertions turn
    // around below: the report must not read a job that no longer exists.
    // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit e11-ci-container-leg):
    // `cloud-container` joins `needs` after `check`, because the aggregator requires it on a full
    // run and asserts it skipped on the other two shapes, and it can only read a job it needs.
    expect(aggregator.needs).toEqual([
      "changes",
      "prove-pr",
      "check",
      "cloud-container",
      "lanes",
      "records",
      "supply-chain",
    ]);
    // `if: always()` is what makes it run after a FAILED dependency; without it the aggregator is
    // skipped, and a skipped required check reads as green.
    expect(aggregator.if).toBe("always()");
    const report = aggregator.steps.map((step) => step.run ?? "").join("\n");
    // It must assert on the result rather than merely echo it: `needs` alone cannot express
    // "cancelled is not success".
    expect(report).toContain('test "${{ needs.check.result }}" = "success"');
    // ADDED (2026-10-14, run 2026-10-14_cli-native, unit e11-ci-container-leg): the cloud
    // container leg is asserted both ways, as `check` is: run and green on a full run, skipped
    // otherwise. The executed suite below proves which shape each line sits in.
    expect(report).toContain('test "${{ needs.cloud-container.result }}" = "success"');
    expect(report).toContain('test "${{ needs.cloud-container.result }}" = "skipped"');
    for (const retired of ["apm-install", "plugin-route"]) {
      expect(report, `the report still reads the deleted ${retired} job`).not.toContain(`needs.${retired}`);
    }
    // The advisory lane is reported, never required — it exists not to block.
    expect(report).toContain("needs.supply-chain.result");
    // ADDED by plan 013 file 3, unit sw06-records-only-ci-lane: both branches of the split are
    // asserted, each naming the side that must have run AND the side that must have skipped.
    expect(report).toContain('test "${{ needs.changes.result }}" = "success"');
    expect(report).toContain('if [ "${{ needs.changes.outputs.full }}" = "false" ]; then');
    expect(report).toContain('test "${{ needs.lanes.result }}" = "success"');
    // TEST CHANGE, justified (unit d3-ci-qa, as above): `check` is the one heavy lane left.
    for (const heavy of ["check"]) {
      expect(report).toContain(`test "\${{ needs.${heavy}.result }}" = "skipped"`);
    }
    expect(report).toContain('test "${{ needs.lanes.result }}" = "skipped"');
    expect(report, "the aggregator still reads the retired answer").not.toContain("records_only");
    // ADDED by run 2026-10-13_records-branch, unit r5-ci-records-job (2026-10-14): the records job is
    // asserted on every shape, by the repository it ran in, which arrives through `env:`.
    expect(report).toContain(`if [ "$REPO" = "${CANONICAL_REPOSITORY}" ]; then`);
    expect(report).toContain('test "${{ needs.records.result }}" = "success"');
    expect(report).toContain('test "${{ needs.records.result }}" = "skipped"');
    expect(report).not.toContain("github.repository");
    expect(stepOf(aggregator.steps, "Report").env).toEqual({ REPO: "${{ github.repository }}" });
  });

  // ADDED (2026-10-14, run 2026-10-14_cli-native, unit e11-ci-container-leg; REQ-PROVE-037). A
  // cloud agent's machine is a Linux container with no user folders; this job starts one per cloud
  // profile (scripts/ci/cloud-leg.mjs, since unit v12-container-leg), each running the suite that
  // drives every emitted hook command from below the root, with `node` present and absent
  // (test/cloud/containerLeg.test.ts). It runs repository code, so what is pinned is what
  // it trusts: an image fixed by digest, a read-only token that the checkout does not keep, and no
  // secret or client account anywhere in the job.
  describe("the cloud container job", () => {
    const job = () => jobOf(ci, "cloud-container");
    const steps = () => stepsOf(ci, "cloud-container");

    it("runs on the full side beside `check`, under the same condition and needs", () => {
      expect(job().name).toBe("cloud-container (a Linux container with no user folders)");
      expect(job().if).toBe(jobOf(ci, "check").if);
      expect(job().needs).toEqual(jobOf(ci, "check").needs);
      expect(job()["runs-on"]).toBe("ubuntu-latest");
      expect(job()["timeout-minutes"]).toBeLessThanOrEqual(30);
    });

    // TEST CHANGE, justified (plan 021 file 2, unit v12-container-leg; REQ-PROVE-037 modified): the job held the image
    // in `container:` and ran the suite inside it; a job inside `container:` cannot start `docker run --network none`,
    // so the job now runs on the runner and `scripts/ci/cloud-leg.mjs` starts the image, pinned by digest there, once
    // per cloud profile and once with no network. The pin's property moves with it: a digest, the full image, no
    // `container:` key left to carry a second one.
    it("holds no container: key and runs the image the leg script pins by digest, the full image that ships git", () => {
      expect(Object.keys(job())).not.toContain("container");
      // A tag alone is a moving target: the image that runs is whatever the tag names that day.
      // The slim image ships no git, which `init` and the fixture's commit need.
      expect(CLOUD_LEG_IMAGE).toMatch(/^node:24-bookworm@sha256:[0-9a-f]{64}$/);
      // No step names an image of its own beside the script's, and none reaches the Docker socket.
      expect(JSON.stringify(job())).not.toMatch(/node:24|docker\.sock|services/);
    });

    it("holds a read-only token that its checkout does not keep, and no secret", () => {
      expect(job().permissions).toEqual({ contents: "read" });
      const checkout = stepOf(steps(), "Checkout");
      expect(checkout.uses).toBe(stepOf(stepsOf(ci, "check"), "Checkout").uses);
      expect(checkout.with).toEqual({ "persist-credentials": false });
      const text = JSON.stringify(job());
      expect(text, "the job reads a secret").not.toContain("secrets.");
      expect(text, "the job names a client credential").not.toMatch(/API_KEY|GITHUB_TOKEN|COPILOT|ANTHROPIC|CURSOR|CODEX/);
      expect(job().env).toBeUndefined();
    });

    // TEST CHANGE, justified (unit v12-container-leg, as above): the install, the build and the suite moved into the
    // leg script, which builds on the host and runs the suite in each container with a fresh HOME and no client probe
    // (test/ci/cloudLeg.test.ts pins those); the job sets up Node 24, the image's own major, so the tree the host builds
    // is the one each container runs, then runs the script as its one step.
    it("checks out, sets up Node 24, then runs the leg script as its one step", () => {
      expect(steps().map((step) => step.name)).toEqual(["Checkout", "Set up Node", "Cloud leg"]);
      const node = stepOf(steps(), "Set up Node");
      expect(node.uses).toBe(stepOf(stepsOf(ci, "check"), "Set up Node ${{ matrix.node }}").uses);
      expect(node.with).toEqual({ "node-version": "24", cache: "npm" });
      expect(runOf(steps(), "Cloud leg")).toBe("node scripts/ci/cloud-leg.mjs");
      expect(stepOf(steps(), "Cloud leg").env).toBeUndefined();
    });

    // ADDED (unit v12-container-leg; REQ-PROVE-037): the release checklist's per-release digest line re-reads the
    // digest the leg runs, so it names the pin's new home rather than the job's retired `container:` key.
    it("is the job whose digest the release checklist re-reads, at the leg script's pin", () => {
      const checklist = readFileSync(join(REPO_ROOT, ".github", "release-controls-checklist.md"), "utf8");
      const line = checklist.split("\n").find((text) => text.includes("re-read the digest of the `cloud-container` job's image"));
      expect(line).toBeDefined();
      expect(line).toContain("`IMAGE` in `scripts/ci/cloud-leg.mjs`");
      expect(line).not.toContain("`.github/workflows/ci.yml`");
      expect(line).toContain("Runs when: every release, a patch included");
    });

    it("is required by the aggregator", () => {
      expect(jobOf(ci, "all-ci-checks").needs).toContain("cloud-container");
    });
  });

  // REMOVED (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): the `plugin-route` lane's
  // describe block, five cases pinning that job's wiring. The job left with the plugin route, which
  // 1.15.0 deletes; "names no plugin or APM route" below asserts it does not come back.

  // ADDED by plan 013 file 3, unit sw06-records-only-ci-lane. A push or pull request whose every
  // changed path is a record takes a short lane in place of the three heavy ones. The risk is one
  // direction only — a code change classified records-only — so what is pinned here is the wiring
  // that makes the split exclusive and fail-closed; the classifier's own answers are proven in
  // test/ci/recordsOnly.test.ts against real diffs.
  // TEST CHANGE, justified (2026-10-08, run 2026-10-08_maintainer-tooling, unit a2-ci-lanes): the
  // short lane widens from records to four lanes (records, specs, learnings, website) and its job
  // is renamed `lanes`. The split is read off `changes`' `full` answer, and the job runs the
  // suites the classifier names for the lanes the change fell in, plus, conditionally, the CLI
  // build and dogfood check (learnings) and the site build (website). Each case below keeps its
  // property and names the new job and output.
  describe("the lanes job", () => {
    // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): `apm-install`
    // and `plugin-route` left with the routes 1.15.0 deletes, so `check` is the one heavy lane the
    // split divides from `lanes`; every case below keeps its property over that one.
    const HEAVY = ["check"] as const;
    const ANSWERS = ["true", "false", ""] as const;
    const EVENTS = ["pull_request", "push", "schedule", "workflow_dispatch"] as const;
    // TEST CHANGE, justified (2026-10-14, run 2026-10-13_records-branch, unit r5-ci-records-job): `records_only`
    // leaves with the records lane, so five outputs are passed through.
    const OUTPUTS = ["full", "lanes", "suites", "site_build", "cli_check"] as const;

    it("classifies first, on every trigger, with read-only rights and the full history", () => {
      const changes = jobOf(ci, "changes");
      expect(changes["runs-on"]).toBe("ubuntu-latest");
      expect(changes["timeout-minutes"]).toBe(5);
      expect(changes.permissions).toEqual({ contents: "read" });
      // No condition and no dependency: the answer must exist on every trigger, or every lane
      // waiting on it would skip and the aggregator would have nothing to assert against.
      expect(changes.if).toBeUndefined();
      expect(changes.needs).toBeUndefined();
      // The five answers the classifier prints, each passed through under its own name.
      expect(changes.outputs).toEqual(
        Object.fromEntries(OUTPUTS.map((key) => [key, `\${{ steps.classify.outputs.${key} }}`])),
      );
      const steps = stepsOf(ci, "changes");
      // The base can be many commits back, so the checkout carries the whole history.
      expect(stepOf(steps, "Checkout").with).toEqual({ "persist-credentials": false, "fetch-depth": 0 });
      const classify = stepOf(steps, "Classify the change");
      expect(classify.id).toBe("classify");
      expect(classify.run).toBe('node scripts/ci/records-only.mjs --base "$BASE_SHA"');
      // The base arrives as data, never interpolated into the script body.
      const base = classify.env?.["BASE_SHA"] ?? "";
      expect(base).toBe("${{ github.event.pull_request.base.sha || github.event.before }}");
      const expression = base.replace(/^\$\{\{/, "").replace(/\}\}$/, "");
      const pr = { github: { event: { pull_request: { base: { sha: "b".repeat(40) } }, before: "" } } };
      const push = { github: { event: { before: "c".repeat(40) } } };
      // The evaluator answers truthiness, so the value is read through a comparison.
      expect(evaluateWorkflowExpression(`(${expression}) == '${"b".repeat(40)}'`, pr)).toBe(true);
      expect(evaluateWorkflowExpression(`(${expression}) == '${"c".repeat(40)}'`, push)).toBe(true);
      // Schedule and dispatch carry neither, and the detector reads an empty base as full CI.
      expect(evaluateWorkflowExpression(`!(${expression})`, { github: { event: {} } })).toBe(true);
    });

    it("runs exactly one side of the split for every answer the classifier can give", () => {
      // TEST CHANGE, justified (2026-10-08, unit a1-proven-push): the four jobs need `prove-pr`
      // beside `changes`, and their conditions read its result and its `proven` output. The
      // property is unchanged where no push is proven — only the literal `true` takes the short
      // lane — and the context now carries `changes` green and `prove-pr` in the shape each event
      // gives it (`success` with `proven=false` on a push, `skipped` otherwise). The proven side
      // and the failed-classifier side are pinned in "the proven-push skip" below.
      // TEST CHANGE, justified (2026-10-08, run 2026-10-08_maintainer-tooling, unit a2-ci-lanes): the
      // short lane is the `lanes` job and it reads `full`, so the literal that takes it is `false`
      // of `full` where it was `true` of `records_only`; the `prove-pr` context above is unchanged.
      const lanes = jobOf(ci, "lanes");
      expect(lanes.needs).toEqual(["changes", "prove-pr"]);
      for (const heavy of HEAVY) {
        expect(jobOf(ci, heavy).needs, heavy).toEqual(["changes", "prove-pr"]);
      }
      for (const event_name of EVENTS) {
        const prove = event_name === "push" ? { result: "success", outputs: { proven: "false" } } : { result: "skipped", outputs: {} };
        for (const answer of ANSWERS) {
          const context = {
            github: { event_name },
            needs: { changes: { result: "success", outputs: { full: answer } }, "prove-pr": prove },
          };
          const short = evaluateWorkflowExpression(lanes.if ?? "true", context) === true;
          // Only the literal `false` takes the lanes job; `true` and an absent answer are full CI.
          expect(short, `${event_name}/${answer}`).toBe(answer === "false");
          for (const heavy of HEAVY) {
            const full = evaluateWorkflowExpression(jobOf(ci, heavy).if ?? "true", context) === true;
            expect(full, `${heavy} ${event_name}/${answer}`).toBe(!short);
          }
        }
      }
    });

    it("runs the suites the classifier names, and builds only after them, only where a lane asks", () => {
      const lanes = jobOf(ci, "lanes");
      expect(lanes["runs-on"]).toBe("ubuntu-latest");
      expect(lanes.permissions).toEqual({ contents: "read" });
      const steps = stepsOf(ci, "lanes");
      expect(stepOf(steps, "Set up Node").with?.["node-version"]).toBe("24");
      expect(runOf(steps, "Install")).toBe("npm ci");
      // One source for the lists: the step runs what `changes` printed, as data through `env:`,
      // and the job spells no suite of its own.
      const suites = stepOf(steps, "Lane suites");
      expect(suites.run).toBe("npx vitest run $SUITES");
      expect(suites.env).toEqual({ SUITES: "${{ needs.changes.outputs.suites }}" });
      const body = steps.map((step) => `${step.run ?? ""}\n${JSON.stringify(step.env ?? {})}`).join("\n");
      expect(body).not.toMatch(/test\/[\w/.-]+/);
      // The same generate-and-diff and the same leak gate as `check`, byte for byte, so the short
      // lane cannot drift into a weaker copy of either.
      expect(runOf(steps, "Self-consistency (generate-and-diff)")).toBe(
        runOf(check, "Self-consistency (generate-and-diff)"),
      );
      expect(runOf(steps, "Leak gate")).toBe(runOf(check, "Leak gate"));
      // The CLI build and the dogfood check run for the learnings lane alone, and AFTER the
      // suites, so no suite on this job can silently start depending on dist/.
      const cliCheck = "needs.changes.outputs.cli_check == 'true'";
      expect(stepOf(steps, "Build")).toMatchObject({ if: cliCheck, run: runOf(check, "Build") });
      expect(stepOf(steps, "Dogfood check")).toMatchObject({ if: cliCheck, run: runOf(check, "Dogfood check") });
      expect(indexOf(steps, "Build")).toBeGreaterThan(indexOf(steps, "Lane suites"));
      expect(indexOf(steps, "Dogfood check")).toBeGreaterThan(indexOf(steps, "Build"));
      // The site build for the website lane alone: the steps docs-site.yml builds with, in the
      // site's own folder, with its own lockfile and with scripts off.
      const siteBuild = "needs.changes.outputs.site_build == 'true'";
      const site = docsSite.workflow.jobs["build"]?.steps ?? [];
      const siteNode = stepOf(steps, "Set up Node for the site");
      expect(siteNode.if).toBe(siteBuild);
      expect(siteNode.uses).toBe(stepOf(site, "Set up Node").uses);
      expect(siteNode.with).toEqual(stepOf(site, "Set up Node").with);
      expect(siteNode.with?.["cache-dependency-path"]).toBe("website/package-lock.json");
      for (const [name, from] of [["Install the site", "Install"], ["Build the site", "Build"]] as const) {
        const step = stepOf(steps, name) as WorkflowStep & { readonly "working-directory"?: string };
        const source = stepOf(site, from) as WorkflowStep & { readonly "working-directory"?: string };
        expect(step.if, name).toBe(siteBuild);
        expect(step.run, name).toBe(source.run);
        expect(step["working-directory"], name).toBe("website");
        expect(source["working-directory"], from).toBe("website");
      }
      expect(runOf(steps, "Install the site")).toBe("npm ci --ignore-scripts");
      // ADDED (run 2026-10-13_records-branch, unit r5b-ci-folds, review/26 signed off as S28): the
      // llms.txt copy and the upload follow the build, as in docs-site.yml.
      expect(expectSiteHandback(steps)).toBe("docs-site-lanes");
      // ADDED (2026-10-08, run 2026-10-08_maintainer-tooling, unit a2-ci-lanes, review/37 signed
      // off as a gap): the website lane also runs the root typecheck, because a website file feeds
      // it (test/ci/tableHeaderScope.test.ts imports website/src/rehype/tableHeaderScope.mjs) and a
      // proven push skips `main`'s matrix. On the lanes side `site_build` is exactly the website lane
      // (test/ci/recordsOnly.test.ts pins `siteBuild` to the website lane on every lanes answer).
      expect(stepOf(steps, "Typecheck")).toMatchObject({ if: siteBuild, run: runOf(check, "Typecheck") });
      // The whole step list, in order, so a gate dropped from the short lane fails here by name.
      // TEST CHANGE, justified (run 2026-10-13_records-branch, unit r5b-ci-folds, review/26 signed
      // off as S28): the list gains the llms.txt copy and the upload after the site build.
      expect(steps.map((step) => step.name)).toEqual([
        "Checkout",
        "Set up Node",
        "Install",
        "Repository hygiene",
        "Lane suites",
        "Self-consistency (generate-and-diff)",
        "Leak gate",
        "Typecheck",
        "Build",
        "Dogfood check",
        "Set up Node for the site",
        "Install the site",
        "Build the site",
        "Serve llms.txt at the site root",
        "Upload the built site",
      ]);
      // Every unconditional step stays build-free: only the four guarded steps above build.
      for (const step of steps) {
        if (step.if === cliCheck || step.if === siteBuild) continue;
        expect(step.run ?? "", step.name).not.toContain("npm run build");
      }
    });

    it("keeps the pull-request hygiene scan on the short lane too", () => {
      const steps = stepsOf(ci, "lanes");
      const hygiene = stepOf(steps, "Repository hygiene");
      const full = stepOf(check, "Repository hygiene");
      expect(hygiene.run).toBe(full.run);
      expect(hygiene.env).toEqual(full.env);
      expect(hygiene["continue-on-error"]).toBeUndefined();
      const depth = String(stepOf(steps, "Checkout").with?.["fetch-depth"])
        .replace(/^\$\{\{/, "").replace(/\}\}$/, "");
      for (const event_name of EVENTS) {
        const context = { github: { event_name } };
        const required = event_name === "pull_request";
        expect(evaluateWorkflowExpression(hygiene.if ?? "false", context), event_name).toBe(required);
        expect(evaluateWorkflowExpression(`(${depth}) == '0'`, context), event_name).toBe(required);
      }
    });
  });

  // ADDED by run 2026-10-13_records-branch, unit r5-ci-records-job (2026-10-14; REQ-PROVE-025). The
  // records live on the `records` branch, so no side of the lane split can check them: the `records`
  // job restores them from `origin/records` and runs the records suite, the leak gate over that
  // branch and the measurements drift check, on every trigger, a proven push included, since its
  // input is not part of the tree a pull request's run proved. It runs in the canonical repository
  // alone (a fork has no records branch), and the aggregator asserts it there.
  describe("the records job", () => {
    // Looked up inside each case, so a missing job fails each case by name rather than the file at collection.
    const records = () => ({ job: jobOf(ci, "records"), steps: stepsOf(ci, "records") });
    const RECORDS_GUARD = `github.repository == '${CANONICAL_REPOSITORY}'`;

    it("runs in the canonical repository alone, on every trigger, needing nothing, with read-only rights", () => {
      const { job } = records();
      expect(job.name).toBe("records (restored from the records branch)");
      expect(job.if).toBe(RECORDS_GUARD);
      // No `needs`: a failed classifier or a proven push must not skip it, since neither says
      // anything about the records branch.
      expect(job.needs).toBeUndefined();
      expect(job["runs-on"]).toBe("ubuntu-latest");
      expect(job["timeout-minutes"]).toBe(15);
      expect(job.permissions).toEqual({ contents: "read" });
      for (const event_name of ["pull_request", "push", "schedule", "workflow_dispatch"]) {
        for (const [repository, runs] of [
          [CANONICAL_REPOSITORY, true],
          ["example/stamity-fork", false],
          ["", false],
        ] as const) {
          const context = { github: { event_name, repository } };
          expect(evaluateWorkflowExpression(job.if ?? "true", context), `${event_name} ${repository}`).toBe(runs);
        }
      }
    });

    it("guards, restores, runs the records suite, gates the branch, then checks the page, in that order", () => {
      const { steps } = records();
      expect(steps.map((step) => step.name)).toEqual([
        "Checkout",
        "Set up Node",
        "Install",
        "No record tracked on this commit",
        "Restore the records",
        "Records suite",
        "Leak gate over the records branch",
        "Measurements page drift",
      ]);
      // The full history fetches `origin/records`, the tags and `main`'s history the shipped-spec
      // case reads; no credential stays in the checkout.
      const checkout = stepOf(steps, "Checkout");
      expect(checkout.uses).toBe(stepOf(check, "Checkout").uses);
      expect(checkout.with).toEqual({ "persist-credentials": false, "fetch-depth": 0 });
      const node = stepOf(steps, "Set up Node");
      expect(node.uses).toBe(stepOf(check, "Set up Node ${{ matrix.node }}").uses);
      expect(node.with).toEqual({ "node-version": "24", cache: "npm" });
      expect(runOf(steps, "Install")).toBe("npm ci");
      expect(runOf(steps, "No record tracked on this commit")).toBe("node scripts/records.mjs guard");
      // No fetch: the checkout already holds `origin/records`.
      // TEST CHANGE, justified (run 2026-10-13_records-branch, ledger pr/5): the ref is now spelled in full, because the
      // full-history checkout fetches every tag and a tag named `origin/records` would win the short name's lookup.
      expect(runOf(steps, "Restore the records")).toBe("node scripts/records.mjs restore --ref refs/remotes/origin/records --no-fetch --force");
      expect(runOf(steps, "Records suite")).toBe("npm run test:records");
      expect(runOf(steps, "Measurements page drift")).toBe(
        "node scripts/generate-docs.mjs --page measurements && git diff --exit-code docs/measurements.md",
      );
      for (const step of steps) {
        expect(step["continue-on-error"], step.name).toBeUndefined();
        expect(step.if, step.name).toBeUndefined();
      }
    });

    // The checkout's own leak gate lists files with `--exclude-standard`, so a restored record that
    // `main`'s `.gitignore` or a nested one matches (a run's reports, a raw eval payload, a `.env`)
    // would never be read. The gate runs over a detached worktree of the branch instead, where every
    // record is tracked, as `records.mjs commit` gates the commit it publishes.
    it("runs the leak gate over a worktree of the records branch, not over main's checkout", () => {
      const { steps } = records();
      const gate = runOf(steps, "Leak gate over the records branch");
      // TEST CHANGE, justified (run 2026-10-13_records-branch, ledger pr/5): the worktree's ref is spelled in full, so
      // a fetched tag named `origin/records` cannot stand in for the branch the gate reads.
      expect(gate.trim().split("\n")).toEqual([
        'git worktree add --detach "$RUNNER_TEMP/records-tree" refs/remotes/origin/records',
        'node scripts/leak-gate.mjs --root "$RUNNER_TEMP/records-tree"',
      ]);
      expect(gate).not.toContain("npm run gate");
      expect(indexOf(steps, "Leak gate over the records branch")).toBeGreaterThan(indexOf(steps, "Restore the records"));
    });

    it("holds no secret and no token in any step", () => {
      const { steps } = records();
      for (const step of steps) {
        expect(JSON.stringify(step), step.name).not.toMatch(/secrets\.|GITHUB_TOKEN|GH_TOKEN/);
      }
    });
  });

  // ADDED by run 2026-10-08_maintainer-tooling, unit a1-proven-push. A push to `main` whose tree a
  // pull request already proved skips the test matrix. The risk is one direction only — a push
  // read as proven when it was not — so what is pinned here is that the reader runs on a push to
  // `main` alone, holds read grants only, takes the sha as data, and that the four lanes it gates
  // skip exactly when it said `true` and the classifier is green. What counts as evidence (ci.yml's
  // own pull-request run, with no second producer on the head) is proven in test/ci/prProven.test.ts.
  describe("the proven-push skip", () => {
    // TEST CHANGE, justified (2026-10-08, run 2026-10-08_maintainer-tooling, unit a2-ci-lanes): the
    // `records` lane is the `lanes` job now, and the side each lane takes is read off `full`.
    // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): the proven
    // push now gates two lanes, `check` and `lanes`; `apm-install` and `plugin-route` left with the
    // routes 1.15.0 deletes. A proven push still asserts both `skipped`.
    // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit e11-ci-container-leg):
    // `cloud-container` joins the gated lanes; it carries `check`'s condition, so it runs on the
    // full side, and the rule below evaluates it there over every combination.
    const GATED = ["check", "cloud-container", "lanes"] as const;
    const EVENTS = ["pull_request", "push", "schedule", "workflow_dispatch"] as const;

    it("reads the pull request's run only on a push to main, with read grants and the sha as data", () => {
      const job = jobOf(ci, "prove-pr");
      expect(job["runs-on"]).toBe("ubuntu-latest");
      expect(job["timeout-minutes"]).toBe(5);
      // The four reads the script makes: the commits (contents), the pull requests that hold the
      // pushed commit (pull-requests), ci.yml's runs on each head and their jobs (actions) and the
      // check runs on each head (checks). Nothing writes.
      // TEST CHANGE, justified (2026-10-08, run 2026-10-08_maintainer-tooling, fix round 1,
      // review/9): `actions: read` joins, because the evidence is now ci.yml's own run, read
      // through the Actions API; the pin stays an exact equality, so no grant can widen unseen.
      expect(job.permissions).toEqual({ actions: "read", contents: "read", checks: "read", "pull-requests": "read" });
      // It needs nothing, so it runs beside `changes` rather than after it.
      expect(job.needs).toBeUndefined();
      expect(job.outputs).toEqual({ proven: "${{ steps.prove.outputs.proven }}" });
      for (const event_name of EVENTS) {
        for (const ref of ["refs/heads/main", "refs/heads/feature", "refs/pull/7/merge", "refs/tags/v1.0.0"]) {
          const runs = evaluateWorkflowExpression(job.if ?? "true", { github: { event_name, ref } });
          expect(runs, `${event_name} ${ref}`).toBe(event_name === "push" && ref === "refs/heads/main");
        }
      }
      const steps = stepsOf(ci, "prove-pr");
      expect(steps.map((step) => step.name)).toEqual(["Checkout", "Set up Node", "Read the pull request's run"]);
      expect(stepOf(steps, "Checkout").with).toEqual({ "persist-credentials": false, "fetch-depth": 1 });
      // No cache and no install: the reader is plain ESM over Node built-ins and `gh`.
      expect(stepOf(steps, "Set up Node").with).toEqual({ "node-version": "24" });
      const prove = stepOf(steps, "Read the pull request's run");
      expect(prove.id).toBe("prove");
      expect(prove.run).toBe('node scripts/ci/pr-proven.mjs --sha "$PUSHED_SHA"');
      // The sha and the token arrive through `env:`, never interpolated into the script body.
      expect(prove.env).toEqual({ GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}", PUSHED_SHA: "${{ github.sha }}" });
      expect(prove.run).not.toContain("${{");
      expect(prove["continue-on-error"]).toBeUndefined();
    });

    // TEST CHANGE, justified (unit d3-ci-qa, as `GATED` above): "four lanes" becomes "two lanes".
    // TEST CHANGE, justified (unit e11-ci-container-leg, as `GATED` above): "two" becomes "three".
    it("skips the three gated lanes exactly when a push is proven, and only with the classifier green", () => {
      // Every combination, including the ones no real run produces, against a rule written here
      // independently of the file: a lane runs only when `changes` succeeded, `prove-pr` succeeded
      // or was skipped, `proven` is not `true`, and the records answer picks this lane's side.
      for (const event_name of EVENTS) {
        for (const changes of ["success", "failure", "cancelled"]) {
          for (const prove of ["success", "skipped", "failure", "cancelled"]) {
            for (const proven of ["true", "false", ""]) {
              for (const full of ["true", "false"]) {
                const context = {
                  github: { event_name },
                  needs: {
                    changes: { result: changes, outputs: { full } },
                    "prove-pr": { result: prove, outputs: { proven } },
                  },
                };
                const open =
                  changes === "success" && (prove === "success" || prove === "skipped") && proven !== "true";
                for (const lane of GATED) {
                  const side = lane === "lanes" ? full === "false" : full !== "false";
                  const label = `${lane} ${event_name} changes=${changes} prove-pr=${prove} proven=${proven} full=${full}`;
                  expect(evaluateWorkflowExpression(jobOf(ci, lane).if ?? "true", context), label).toBe(open && side);
                }
              }
            }
          }
        }
      }
    });

    it("calls a status function in each gated condition, or a skipped `prove-pr` would skip them all", () => {
      // GitHub skips a job whose need was skipped unless its `if` calls a status function, and
      // `prove-pr` is skipped on every event but a push to `main`. `!cancelled()` is that call, and
      // `needs.changes.result == 'success'` puts back the guard the implicit `success()` gave.
      for (const lane of GATED) {
        const condition = jobOf(ci, lane).if ?? "";
        expect(condition, lane).toMatch(/^!cancelled\(\) && needs\.changes\.result == 'success' && /);
        expect(condition, lane).toContain(
          "(needs.prove-pr.result == 'success' || needs.prove-pr.result == 'skipped') && needs.prove-pr.outputs.proven != 'true'",
        );
      }
      // The aggregator reads both halves of the proven answer.
      const report = stepsOf(ci, "all-ci-checks").map((step) => step.run ?? "").join("\n");
      expect(report).toContain("needs.prove-pr.result");
      expect(report).toContain("needs.prove-pr.outputs.proven");
    });
  });

  it("keeps the dependency review advisory, and says which of its two failures happened", () => {
    const steps = stepsOf(ci, "dependency-review");
    const review = stepOf(steps, "Dependency review");
    expect(review.uses).toContain("actions/dependency-review-action@");
    expect(review.with?.["fail-on-severity"]).toBe("high");
    // The Dependency Review API is unavailable on a private repository without Advanced Security,
    // and a 403 there is a fact about the plan rather than about the diff. Blocking on it would
    // teach the reader to wave the lane through.
    expect(review["continue-on-error"]).toBe(true);
    // `continue-on-error` flips the CONCLUSION to success and leaves the OUTCOME real, so the
    // follow-up cannot fire on a genuine pass.
    expect(conditionOf(steps, "Report review outcome")).toBe("steps.review.outcome == 'failure'");
  });

  it("names every lane it runs and every lane it does not, in one map", () => {
    // The contract this header sets for itself: a lane is named here or it does not exist, and a
    // lane that is NOT run is named too. An unnamed gap reads exactly like a decision.
    const laneMap = ci.source.slice(0, ci.source.indexOf("\nname: CI"));

    expect(laneMap).toContain("LANE MAP");
    for (const heading of ["MERGE-BLOCKING", "ADVISORY", "NOT RUN"]) {
      expect(laneMap, `lane map must have a ${heading} section`).toContain(heading);
    }
    for (const lane of [
      "supply-chain",
      "dependency-review",
      "tarball-smoke",
      "leak-gate",
      "all-ci-checks",
      // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): `apm-install`
      // and `plugin-route` left this list with the routes 1.15.0 deletes; the map must not name a
      // lane that no longer runs, which the loop after this one asserts.
      // The pull-request gates live in a sibling file; a lane map that did not name them would
      // read as if this workflow were the whole merge gate.
      "pr-checks",
      // ADDED by plan 013 file 3, unit sw06-records-only-ci-lane: the classifier and the short
      // lane, backticked because both words also occur as plain prose in the map.
      "`changes`",
      // TEST CHANGE, justified (2026-10-08, run 2026-10-08_maintainer-tooling, unit a2-ci-lanes): the
      // short lane is the `lanes` job, and the map names each lane it runs.
      "`lanes`",
      // ADDED (2026-10-14, run 2026-10-14_cli-native, unit e11-ci-container-leg): the cloud
      // container leg, merge-blocking on the full side.
      "`cloud-container`",
      // TEST CHANGE, justified (2026-10-14, run 2026-10-13_records-branch, unit r5-ci-records-job): `records` names
      // the canonical records job now, not a lane; the restore it runs is named beside it.
      "`records`",
      "scripts/records.mjs",
      "`specs`",
      "`learnings`",
      "`website`",
      "scripts/ci/records-only.mjs",
      // ADDED by unit a1-proven-push (2026-10-08): the proven-push reader and its script.
      "`prove-pr`",
      "scripts/ci/pr-proven.mjs",
    ]) {
      expect(laneMap, `lane map must name the running lane ${lane}`).toContain(lane);
    }
    for (const retired of ["apm-install", "plugin-route"]) {
      expect(laneMap, `lane map still names the deleted lane ${retired}`).not.toContain(retired);
    }
    for (const gap of [
      "Secret scanning across HISTORY",
      "push protection",
      "Lockfile linting",
      "Code scanning",
      "Scorecard",
      "eval harness",
    ]) {
      expect(laneMap, `lane map must name the gap: ${gap}`).toContain(gap);
    }
    // The eval harness is named WITH its dependents, because three shipped things read as
    // calibrated against an instrument that does not exist.
    expect(laneMap).toContain("obsolete_when");
    expect(laneMap).toContain("size defaults");
    expect(laneMap).toContain("headline quality metric");
  });
});

// ── ci.yml: the aggregator, executed ─────────────────────────────────────────

/**
 * ADDED by plan 013 file 3, unit sw06-records-only-ci-lane. The static pins above say the report
 * NAMES both branches of the records-only split; these say the body, run the way the runner runs
 * it (`bash -e`), passes on exactly the two legal shapes and fails on every mixed one. The runner
 * substitutes each `${{ needs.* }}` before bash sees the script, so the renderer does the same and
 * throws on any expression it does not model rather than leaving it for bash to misread.
 */
const AGGREGATOR_EXECUTABLE =
  process.platform !== "win32" && spawnSync("bash", ["--version"]).status === 0;

describe.skipIf(!AGGREGATOR_EXECUTABLE)("ci.yml — the aggregator's lane split, executed", () => {
  const BODY = stepsOf(ci, "all-ci-checks").map((step) => step.run ?? "").join("\n");

  // TEST CHANGE, justified (2026-10-08, unit a1-proven-push): `Results` gains `prove-pr`, and the
  // renderer substitutes its `proven` output beside `changes`' `records_only`, because the
  // aggregator now reads both to tell its third legal shape (a proven push) from the other two.
  // The two existing shapes model a pull request (`prove-pr` skipped, no `proven`), which is what
  // they modelled before; every assertion on them is kept.
  // TEST CHANGE, justified (2026-10-08, run 2026-10-08_maintainer-tooling, unit a2-ci-lanes): the
  // `records` job is renamed `lanes`, and the aggregator reads `changes`' `full` answer where it
  // read `records_only`, so the renderer substitutes `full` and every call passes the `full`
  // answer that the old `records_only` answer meant (`true` became `false`, `false` became `true`,
  // the absent answer stays absent). Every case and every assertion is kept, one for one.
  // TEST CHANGE, justified (2026-10-14, run 2026-10-13_records-branch, unit r5-ci-records-job): `Results` gains
  // `records`, and the body runs with `REPO` in its environment, as the step's `env:` gives it. Every
  // shape below models the canonical repository with `records` green, so each case and assertion
  // written before it is kept one for one; the records job's own cases follow at the end.
  // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): `Results` loses
  // `apm-install` and `plugin-route`, which left with the routes 1.15.0 deletes, and the loops over
  // the heavy lanes run over `check` alone. Every shape and every assertion on `check`, `lanes`,
  // `prove-pr`, `changes` and `records` is kept one for one.
  // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit e11-ci-container-leg):
  // `Results` gains `cloud-container`, which runs beside `check` on the full side: `success` in
  // the full shape, `skipped` in the lanes and proven shapes and in the failed classifier's. Every
  // shape and every assertion written before it is kept one for one; its own cases follow at the end.
  type Results = Readonly<
    Record<"changes" | "prove-pr" | "check" | "cloud-container" | "lanes" | "records" | "supply-chain", string>
  >;

  function render(results: Results, full: string, proven: string): string {
    const rendered = BODY.replace(
      /\$\{\{\s*needs\.([\w-]+)\.(result|outputs\.full|outputs\.proven)\s*\}\}/g,
      (_match, job: string, field: string) => {
        if (field === "outputs.full" && job === "changes") return full;
        if (field === "outputs.proven" && job === "prove-pr") return proven;
        if (field !== "result") throw new Error(`the report reads needs.${job}.${field}, which the test does not model`);
        const value = (results as Record<string, string | undefined>)[job];
        if (value === undefined) throw new Error(`the report reads needs.${job}, which the test does not model`);
        return value;
      },
    );
    expect(rendered, "an unmodelled expression is left in the body").not.toContain("${{");
    return rendered;
  }

  const execute = (results: Results, full: string, proven = "", repo: string = CANONICAL_REPOSITORY) =>
    spawnSync("bash", ["-e", "-c", render(results, full, proven)], {
      encoding: "utf8",
      env: { ...process.env, REPO: repo },
    }).status;

  const FULL: Results = {
    changes: "success",
    "prove-pr": "skipped",
    check: "success",
    "cloud-container": "success",
    lanes: "skipped",
    records: "success",
    "supply-chain": "failure",
  };
  const SHORT: Results = {
    changes: "success",
    "prove-pr": "skipped",
    check: "skipped",
    "cloud-container": "skipped",
    lanes: "success",
    records: "success",
    "supply-chain": "failure",
  };
  /** A push to `main` whose tree a pull request proved: every gated lane skipped. */
  const PROVEN: Results = {
    changes: "success",
    "prove-pr": "success",
    check: "skipped",
    "cloud-container": "skipped",
    lanes: "skipped",
    records: "success",
    "supply-chain": "failure",
  };
  // TEST CHANGE, justified (unit e11-ci-container-leg, as `Results` above): the cloud container
  // leg is gated as `check` is, so a proven push must find it skipped too.
  const GATED = ["check", "cloud-container", "lanes"] as const;

  it("passes a proven push with every gated lane skipped, with the advisory lane red", () => {
    expect(execute(PROVEN, "true", "true")).toBe(0);
    // A lane-only push that was also proven: the lanes job skipped too, as its `if` says.
    expect(execute(PROVEN, "false", "true")).toBe(0);
  });

  it("passes the full and lanes shapes on a push that was not proven", () => {
    expect(execute({ ...FULL, "prove-pr": "success" }, "true", "false")).toBe(0);
    expect(execute({ ...SHORT, "prove-pr": "success" }, "false", "false")).toBe(0);
  });

  it("fails a proven push unless every gated lane skipped and the reader succeeded", () => {
    for (const lane of GATED) {
      expect(execute({ ...PROVEN, [lane]: "success" }, "true", "true"), lane).not.toBe(0);
      expect(execute({ ...PROVEN, [lane]: "failure" }, "true", "true"), lane).not.toBe(0);
    }
    // The full lanes' green cannot stand in when the answer was `proven=true`, nor the reverse.
    expect(execute({ ...FULL, "prove-pr": "success" }, "true", "true")).not.toBe(0);
    expect(execute({ ...SHORT, "prove-pr": "success" }, "false", "true")).not.toBe(0);
    for (const prove of ["failure", "cancelled", "skipped"]) {
      expect(execute({ ...PROVEN, "prove-pr": prove }, "true", "true"), prove).not.toBe(0);
    }
    expect(execute({ ...PROVEN, changes: "failure" }, "true", "true")).not.toBe(0);
  });

  it("fails a proven answer on a pull-request-shaped result set", () => {
    // `prove-pr` is skipped on a pull request, so a `true` beside it is a mis-wired output.
    expect(execute({ ...PROVEN, "prove-pr": "skipped" }, "true", "true")).not.toBe(0);
    expect(execute(FULL, "true", "true")).not.toBe(0);
    expect(execute(SHORT, "false", "true")).not.toBe(0);
  });

  it("fails when the proven-push reader itself did not succeed, whatever the other lanes say", () => {
    for (const prove of ["failure", "cancelled"]) {
      expect(execute({ ...FULL, "prove-pr": prove }, "true", ""), prove).not.toBe(0);
      expect(execute({ ...SHORT, "prove-pr": prove }, "false", ""), prove).not.toBe(0);
      expect(execute({ ...PROVEN, "prove-pr": prove }, "true", ""), prove).not.toBe(0);
    }
  });

  it("passes the two legal shapes, with the advisory lane red in both", () => {
    expect(execute(FULL, "true")).toBe(0);
    expect(execute(SHORT, "false")).toBe(0);
    // An absent answer is full CI, as the heavy jobs' `!= 'false'` reads it.
    expect(execute(FULL, "")).toBe(0);
  });

  it("fails a lanes answer unless the lanes job passed and the heavy lane skipped", () => {
    expect(execute({ ...SHORT, lanes: "failure" }, "false")).not.toBe(0);
    expect(execute({ ...SHORT, lanes: "cancelled" }, "false")).not.toBe(0);
    // ledger review/96: a lanes job that never ran is no pass either.
    expect(execute({ ...SHORT, lanes: "skipped" }, "false")).not.toBe(0);
    for (const heavy of ["check"] as const) {
      expect(execute({ ...SHORT, [heavy]: "success" }, "false"), heavy).not.toBe(0);
      expect(execute({ ...SHORT, [heavy]: "failure" }, "false"), heavy).not.toBe(0);
    }
    // The full lanes' green cannot stand in for the lanes job's when the answer was `false`.
    expect(execute(FULL, "false")).not.toBe(0);
  });

  it("fails a full answer unless the heavy lane passed and the lanes job skipped", () => {
    for (const heavy of ["check"] as const) {
      expect(execute({ ...FULL, [heavy]: "failure" }, "true"), heavy).not.toBe(0);
      expect(execute({ ...FULL, [heavy]: "skipped" }, "true"), heavy).not.toBe(0);
      // ledger review/96: a cancelled heavy leg is red, as the `= success` test reads it.
      expect(execute({ ...FULL, [heavy]: "cancelled" }, "true"), heavy).not.toBe(0);
    }
    expect(execute({ ...FULL, lanes: "success" }, "true")).not.toBe(0);
    // The lanes job's green cannot stand in for the full lanes when the answer was not `false`.
    expect(execute(SHORT, "true")).not.toBe(0);
    expect(execute(SHORT, "")).not.toBe(0);
  });

  it("fails when the classifier itself did not succeed, whatever the other lanes say", () => {
    // TEST CHANGE, justified (2026-10-08, unit a1-proven-push): the fixture gains `prove-pr`, which
    // `Results` now requires; `skipped` is what it reads on the pull request this shape models.
    const skippedAll: Results = {
      changes: "failure",
      "prove-pr": "skipped",
      check: "skipped",
      "cloud-container": "skipped",
      lanes: "skipped",
      records: "success",
      "supply-chain": "success",
    };
    expect(execute(skippedAll, "")).not.toBe(0);
    expect(execute({ ...FULL, changes: "cancelled" }, "true")).not.toBe(0);
    expect(execute({ ...SHORT, changes: "failure" }, "false")).not.toBe(0);
  });

  // ADDED by run 2026-10-13_records-branch, unit r5-ci-records-job (2026-10-14): the records job is
  // asserted outside the three shapes, by the repository the run is in.
  const SHAPES = [
    ["full", FULL, "true", ""],
    ["lanes", SHORT, "false", ""],
    ["proven", PROVEN, "true", "true"],
  ] as const;

  it("fails every shape in the canonical repository unless the records job passed", () => {
    for (const [label, shape, full, proven] of SHAPES) {
      expect(execute(shape, full, proven), label).toBe(0);
      for (const records of ["failure", "cancelled", "skipped"]) {
        expect(execute({ ...shape, records }, full, proven), `${label} records=${records}`).not.toBe(0);
      }
    }
  });

  it("passes every shape elsewhere only with the records job skipped", () => {
    for (const repo of ["example/stamity-fork", ""]) {
      for (const [label, shape, full, proven] of SHAPES) {
        expect(execute({ ...shape, records: "skipped" }, full, proven, repo), `${label} ${repo}`).toBe(0);
        for (const records of ["success", "failure", "cancelled"]) {
          expect(execute({ ...shape, records }, full, proven, repo), `${label} ${repo} records=${records}`).not.toBe(0);
        }
      }
    }
  });

  // ADDED (2026-10-14, run 2026-10-14_cli-native, unit e11-ci-container-leg): the cloud container
  // leg is required on a full run and must read `skipped` on the other two shapes, so a green
  // aggregator never stands on a full run whose container leg did not pass, and a leg that ran
  // where its condition says it cannot is a mis-wired condition, red.
  it("fails a full run unless the cloud container leg passed", () => {
    for (const result of ["failure", "cancelled", "skipped"]) {
      expect(execute({ ...FULL, "cloud-container": result }, "true"), result).not.toBe(0);
      expect(execute({ ...FULL, "cloud-container": result }, ""), `absent answer ${result}`).not.toBe(0);
      expect(execute({ ...FULL, "prove-pr": "success", "cloud-container": result }, "true", "false"), `push ${result}`).not.toBe(0);
    }
    // The container leg's green cannot stand in for the matrix's, nor the reverse.
    expect(execute({ ...FULL, check: "skipped" }, "true")).not.toBe(0);
    expect(execute({ ...FULL, check: "failure" }, "true")).not.toBe(0);
  });

  it("fails a lanes answer or a proven push unless the cloud container leg skipped", () => {
    for (const result of ["success", "failure", "cancelled"]) {
      expect(execute({ ...SHORT, "cloud-container": result }, "false"), `lanes ${result}`).not.toBe(0);
      expect(execute({ ...PROVEN, "cloud-container": result }, "true", "true"), `proven ${result}`).not.toBe(0);
      expect(execute({ ...PROVEN, "cloud-container": result }, "false", "true"), `proven lanes ${result}`).not.toBe(0);
    }
  });
});

// ── nightly.yml ──────────────────────────────────────────────────────────────

describe("nightly.yml — demoted lanes, none of them merge-blocking", () => {
  // TEST CHANGE, justified (plan 021 file 2, unit v13-client-legs; REQ-PROVE-040): two jobs join
  // after the three demoted legs, the client legs' `hook-fire` and the on-demand
  // `release-prep-unattended`, both off without a secret; still no aggregator, as below.
  it("carries the three demoted legs, the two client-leg jobs, and no aggregator to require", () => {
    expect(Object.keys(nightly.workflow.jobs)).toEqual([
      "macos-smoke",
      "node-next",
      "headless-lane",
      "hook-fire",
      "release-prep-unattended",
    ]);
    // The absence is the point: an aggregator here would be a name a branch rule could bind, and
    // a nightly failure would then block a merge it has nothing to say about.
    expect(Object.keys(nightly.workflow.jobs)).not.toContain("all-ci-checks");
    for (const job of Object.values(nightly.workflow.jobs)) {
      expect(job.needs).toBeUndefined();
    }
    expect(nightly.source).toContain("Nothing in this file is merge-blocking");
  });

  it("runs daily and on demand", () => {
    expect(triggersOf(nightly.workflow).toSorted()).toEqual(["schedule", "workflow_dispatch"]);
    const on = (nightly.workflow as unknown as Record<string, { schedule?: { cron: string }[] }>)[
      "on"
    ];
    expect(on?.schedule?.[0]?.cron).toBe("0 4 * * *");
  });

  it("keeps the runtime gates on the macos leg and the plain suite on the next Node line", () => {
    const macos = stepsOf(nightly, "macos-smoke");
    expect(jobOf(nightly, "macos-smoke")["runs-on"]).toBe("macos-latest");
    for (const step of ["Install", "Build", "Test", "Dogfood check", "Leak gate"]) {
      expect(indexOf(macos, step), step).toBeGreaterThanOrEqual(0);
    }
    expect(runOf(macos, "Dogfood check")).toBe("node dist/cli.js check");

    const next = stepsOf(nightly, "node-next");
    expect(stepOf(next, "Set up Node").with?.["node-version"]).toBe("26");
    expect(runOf(next, "Test")).toBe("npm test");
  });

  it("drives the scratch-repo dogfood for all four clients", () => {
    const steps = stepsOf(nightly, "headless-lane");
    const dogfood = runOf(steps, "Scratch-repo dogfood (all four clients)");

    expect(dogfood).toContain("npm pack");
    expect(dogfood).toContain("init -y --tools claude,cursor,copilot,codex");
    expect(dogfood).toContain('"$CLI" check');
    // One marker per client: a client that emitted nothing is what this lane exists to catch, and
    // `check` alone cannot catch it — it verifies what the manifest SAYS was emitted, so a client
    // missing from both is self-consistent.
    for (const marker of [
      "AGENTS.md",
      "CLAUDE.md",
      ".claude/settings.json",
      ".cursor/rules",
      ".cursor/hooks.json",
      ".github/instructions",
      ".github/agents",
      ".codex/config.toml",
      ".codex/agents",
    ]) {
      expect(dogfood, `residue assertion must cover ${marker}`).toContain(marker);
    }
  });

  // REMOVED (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): seven cases on the headless
  // lane's second half, the plugin route's invocation legs (the credential check, the per-client
  // drive steps, the credential isolation between vendors, the verdict, the kept documents, the
  // summary and the PATH addressing). That half drove the plugin distribution, which 1.15.0 deletes,
  // so the steps and the four client secrets left with it. The case below holds what remains.
  // ADDED (unit d3-ci-qa): the lane is the scratch-repo dogfood alone, and holds no credential.
  it("runs the scratch-repo dogfood as the whole headless lane, holding no credential", () => {
    const job = jobOf(nightly, "headless-lane");
    expect(job.steps.map((step) => step.name)).toEqual([
      "Checkout",
      "Set up Node",
      "Install",
      "Build",
      "Scratch-repo dogfood (all four clients)",
    ]);
    expect(job.permissions).toEqual({ contents: "read" });
    // The dogfood is what the lane is for; a step that drives a client needs an account, and the
    // nightly holds none now.
    expect(JSON.stringify(job), "the headless lane reads a secret").not.toContain("secrets.");
    // TEST CHANGE, justified (plan 021 file 2, unit v13-client-legs; REQ-PROVE-040): the file-wide
    // "no secret" moved, since the client legs read one secret per arm and drive step. The headless
    // lane above still holds none. TEST CHANGE, justified (review/46, run 2026-10-18_cloud-runs-2):
    // the per-job loop that stood here read no workflow-level `env:` or `defaults`; the client-leg
    // suite below now reads the parsed workflow with only those two jobs' steps left out, in any spelling.
  });
});

/**
 * ADDED by plan 014 file 1, unit f3-nightly-canonical-guard — a private import that enables
 * Actions must not run the nightly on a schedule. GitHub has no workflow-level `if`, so each job
 * carries the guard. Unlike the publication guards above it has no privacy clause: GitHub lists
 * the `schedule` webhook payload as "Not applicable", so a privacy read could stop the
 * canonical nightly itself. The rows with no visibility prove the guard does not depend on it.
 */
describe("nightly.yml — the canonical repository guard", () => {
  const NIGHTLY_GUARD = "github.repository == 'zomarit/stamity'";

  for (const jobId of Object.keys(nightly.workflow.jobs)) {
    it(`${jobId} runs only in the canonical repository, on a schedule or on demand`, () => {
      const condition = jobOf(nightly, jobId).if ?? "";
      expect(condition, "each nightly job carries exactly the guard").toBe(NIGHTLY_GUARD);
      for (const event_name of ["schedule", "workflow_dispatch"]) {
        for (const [repository, privateValue, allowed] of [
          ["zomarit/stamity", false, true],
          ["zomarit/stamity", null, true],
          ["acme/stamity-private", true, false],
          ["acme/stamity-private", false, false],
        ] as const) {
          expect(
            evaluateWorkflowExpression(condition, repositoryContext({ github: { event_name } }, repository, privateValue)),
            `${event_name} in ${repository} private=${String(privateValue)}`,
          ).toBe(allowed);
        }
        expect(
          evaluateWorkflowExpression(condition, { github: { event_name } }),
          `${event_name} with no repository in the context`,
        ).toBe(false);
      }
    });
  }
});


// REMOVED (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): "the plugin-route arming steps,
// executed", four cases that ran the nightly's credential check, ci.yml's binary export and the
// nightly's drive verdict under bash. All three steps left with the plugin route, which 1.15.0
// deletes.

/**
 * ADDED by plan 021 file 2, unit v13-client-legs (REQ-PROVE-040, REQ-FLOW-113): the client legs,
 * built and off. Each client's secret reaches two steps, its arm and its drive; the arm writes a
 * boolean and nothing else; with no secret every install and drive step is skipped and the job is
 * green; and nothing merge-blocking reads either job. The arm steps are EXECUTED under `sh`, the
 * way the DCO job is below, with only the secret's variable and the output channel substituted.
 */
const CLIENT_LEGS = [
  { client: "claude", secret: "ANTHROPIC_API_KEY" },
  { client: "cursor", secret: "CURSOR_API_KEY" },
  { client: "copilot", secret: "COPILOT_GITHUB_TOKEN" },
] as const;

const CLIENT_LEG_JOBS = ["hook-fire", "release-prep-unattended"] as const;

/**
 * Every reference to the secrets context in `text`, in any spelling: `secrets.NAME`, `secrets['NAME']`,
 * `toJSON(secrets)` and the bare context. GitHub reads a context name in any letter case.
 * TEST CHANGE, justified (review/47, run 2026-10-18_cloud-runs-2): the dotted `secrets.NAME` was the
 * only spelling read, so a step handed `toJSON(secrets)` or a bracketed name counted as holding none.
 */
function secretRefsIn(text: string): string[] {
  return [...text.matchAll(/\bsecrets\b/gi)].map((match) => text.slice(Math.max(0, (match.index ?? 0) - 8), (match.index ?? 0) + 24));
}

/**
 * Every secrets-context reference in a parsed workflow where GitHub reads one, each with its path:
 * - in every key, since a reusable workflow call's `secrets: inherit` passes the whole context through a key;
 * - in every `if`, an expression with or without its `${{ }}`;
 * - in every other string that holds a `${{`, read whole, so a `#` line inside a `run:` block, which
 *   GitHub still expands, is read with the rest of the block.
 * A string with neither is text GitHub never evaluates, such as hook-fire's display name, which says
 * "off without secrets".
 */
function secretRefsWhereRead(node: unknown, path = ""): string[] {
  if (node === null || typeof node !== "object") return [];
  const refs: string[] = [];
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const at = `${path}.${key}`;
    for (const ref of secretRefsIn(key)) refs.push(`${at} (key): ${ref}`);
    if (typeof value !== "string") refs.push(...secretRefsWhereRead(value, at));
    else if (key === "if" || value.includes("${{")) for (const ref of secretRefsIn(value)) refs.push(`${at}: ${ref}`);
  }
  return refs;
}

/**
 * The secrets references in a parsed workflow outside the client-leg jobs' steps, which the per-step
 * case reads one by one. Everything else is read: the workflow's own keys in any order (an `env:` or
 * `defaults:` after the jobs block included), every other job, and the client-leg jobs' keys besides
 * `steps` (`container:`, `services:`, `env:`).
 */
function secretRefsOutsideClientLegSteps(workflow: Workflow): string[] {
  const jobs = Object.fromEntries(
    Object.entries(workflow.jobs).map(([id, job]): [string, unknown] => {
      if (!(CLIENT_LEG_JOBS as readonly string[]).includes(id)) return [id, job];
      const { steps: _steps, ...rest } = job;
      return [id, rest];
    }),
  );
  return secretRefsWhereRead({ ...workflow, jobs });
}

/**
 * ADDED (review/46 round 2, run 2026-10-18_cloud-runs-2): one secret planted in each place a line
 * cut of the file's text missed. Each plant is applied to a copy of the text in memory; the
 * committed workflow is never written. `under` is the path where the reference must be found.
 */
const PLANTED_SECRETS: readonly { readonly place: string; readonly under: string; readonly plant: (source: string) => string }[] = [
  {
    place: "a workflow env: after the jobs block",
    under: ".env.",
    plant: (source) => `${source.trimEnd()}\nenv:\n  LEAK: \${{ secrets.ANTHROPIC_API_KEY }}\n`,
  },
  {
    place: "a workflow defaults: after the jobs block",
    under: ".defaults.",
    plant: (source) => `${source.trimEnd()}\ndefaults:\n  run: { working-directory: '\${{ secrets.ANTHROPIC_API_KEY }}' }\n`,
  },
  {
    place: "a # line inside another job's run: block",
    under: ".jobs.macos-smoke.steps.",
    plant: (source) =>
      source.replace(/^ {8}run: npm run gate\n/m, () => "        run: |\n          # ${{ secrets.ANTHROPIC_API_KEY }}\n          npm run gate\n"),
  },
  {
    place: "hook-fire's services:",
    under: ".jobs.hook-fire.services.",
    plant: (source) =>
      source.replace(/^ {2}hook-fire:\n/m, (line) => `${line}    services:\n      cache:\n        image: redis:7\n        env:\n          LEAK: \${{ secrets.CURSOR_API_KEY }}\n`),
  },
  {
    place: "release prep's container:",
    under: ".jobs.release-prep-unattended.container.",
    plant: (source) =>
      source.replace(
        /^ {2}release-prep-unattended:\n/m,
        (line) => `${line}    container:\n      image: node:24\n      credentials:\n        username: x\n        password: \${{ secrets.ANTHROPIC_API_KEY }}\n`,
      ),
  },
];

/** A `${{ … }}` template rendered as GitHub renders it: a context path's value, else the expression's boolean. */
function renderTemplate(template: string, context: ExpressionContext): string {
  return template.replace(/\$\{\{(.*?)\}\}/g, (_whole, expression: string) => {
    const path = expression.trim();
    if (/^[A-Za-z_][\w-]*(?:\.[\w-]+)*$/.test(path) && !["true", "false", "null"].includes(path)) {
      let cursor: unknown = context;
      for (const segment of path.split(".")) cursor = (cursor as Record<string, unknown> | undefined)?.[segment];
      return cursor === undefined || cursor === null ? "" : String(cursor);
    }
    return String(evaluateWorkflowExpression(expression, context));
  });
}

function armed(client: string, value: string): ExpressionContext {
  return { steps: { [`arm-${client}`]: { outputs: { armed: value } } } };
}

describe("nightly.yml — the client legs, built and off without secrets", () => {
  it("arms, installs and drives each client in that order, the install and the drive gated on that client's arm", () => {
    const steps = jobOf(nightly, "hook-fire").steps;
    const at = (id: string) => steps.findIndex((step) => step.id === id || step.name === id);
    for (const { client } of CLIENT_LEGS) {
      const arm = at(`arm-${client}`);
      const install = at(`Install (${client})`);
      const drive = at(`Drive (${client})`);
      expect(arm, client).toBeGreaterThan(at("Build"));
      expect(install, client).toBeGreaterThan(arm);
      expect(drive, client).toBeGreaterThan(install);
      for (const gated of [steps[install], steps[drive]]) {
        const condition = gated?.if ?? "";
        expect(condition, `${client}: ${gated?.name}`).toBe(`steps.arm-${client}.outputs.armed == 'true'`);
        expect(evaluateWorkflowExpression(condition, armed(client, "true"))).toBe(true);
        expect(evaluateWorkflowExpression(condition, armed(client, "false"))).toBe(false);
        // A skipped or missing arm writes nothing, and nothing is not armed.
        expect(evaluateWorkflowExpression(condition, { steps: {} })).toBe(false);
      }
    }
  });

  it("holds one secret per step: an arm and a drive hold their own client's, every other step none", () => {
    for (const jobId of CLIENT_LEG_JOBS) {
      const job = jobOf(nightly, jobId);
      expect(job.env, jobId).toBeUndefined();
      expect(job.permissions, jobId).toEqual({ contents: "read" });
      let holders = 0;
      for (const step of job.steps) {
        const held = secretRefsIn(JSON.stringify(step));
        const leg = /^(?:Arm|Drive) \((\w+)\)$/.exec(step.name ?? "")?.[1];
        if (leg === undefined) {
          expect(held, `${jobId}: ${step.name}`).toEqual([]);
          continue;
        }
        holders += 1;
        const secret = CLIENT_LEGS.find((entry) => entry.client === leg)?.secret;
        // The secret enters through `env:` alone, as the one `secrets.<NAME>`, never a `run:` line or an input.
        expect(held, `${jobId}: ${step.name}`).toHaveLength(1);
        expect(step.env?.[secret ?? ""], `${jobId}: ${step.name}`).toBe(`\${{ secrets.${secret} }}`);
      }
      expect(holders, jobId).toBe(jobId === "hook-fire" ? 6 : 2);
    }
  });

  // ADDED (review/46, run 2026-10-18_cloud-runs-2): a secret at the workflow's own `env:` or `defaults`
  // would reach every step of every nightly job, the vendor installers included.
  // TEST CHANGE, justified (review/46 round 2, run 2026-10-18_cloud-runs-2): the case read lines cut out
  // of the file's text, and the cut missed three places:
  // - a workflow `env:` or `defaults:` written after the jobs block;
  // - a `#` line inside a `run:` block, which GitHub still expands;
  // - the client-leg jobs' own `container:` and `services:`.
  // It now reads the parsed workflow, leaving out only the two client-leg jobs' steps.
  it("reads no secret anywhere in the parsed workflow outside the two client-leg jobs' steps", () => {
    expect(secretRefsOutsideClientLegSteps(nightly.workflow)).toEqual([]);
  });

  // ADDED (review/46 round 2, run 2026-10-18_cloud-runs-2): the case above fails on a secret planted
  // in each place the line cut missed, and finds it where it was planted.
  it("finds a secret planted in each place a line cut of the file's text missed", () => {
    for (const { place, under, plant } of PLANTED_SECRETS) {
      const planted = plant(nightly.source);
      expect(planted, `${place}: the plant landed`).not.toBe(nightly.source);
      const refs = secretRefsOutsideClientLegSteps(parse(planted) as Workflow);
      expect(refs.map((ref) => ref.startsWith(under)), `${place}: ${refs.join(" | ")}`).toEqual([true]);
    }
  });

  // ADDED (review/44, run 2026-10-18_cloud-runs-2): GitHub cancels a whole run, every job in it, when a
  // later run takes its group, so release prep needs a group of its own that nothing cancels.
  it("runs a release-prep dispatch in a group of its own that no later run cancels", () => {
    const concurrency = nightly.workflow.concurrency as { group?: string; "cancel-in-progress"?: unknown } | undefined;
    const github = (event_name: string) => ({ workflow: "Nightly", event_name, ref: "refs/heads/main" });
    const runs = {
      schedule: { github: github("schedule"), inputs: {} },
      dispatch: { github: github("workflow_dispatch"), inputs: { release_prep: false } },
      releasePrep: { github: github("workflow_dispatch"), inputs: { release_prep: true } },
    };
    const group = (context: ExpressionContext) => renderTemplate(concurrency?.group ?? "", context);
    const cancels = (context: ExpressionContext) => {
      const value = concurrency?.["cancel-in-progress"];
      return typeof value === "boolean" ? value : evaluateWorkflowExpression(String(value), context);
    };
    expect(group(runs.releasePrep)).not.toBe(group(runs.dispatch));
    expect(group(runs.releasePrep)).not.toBe(group(runs.schedule));
    expect(cancels(runs.releasePrep)).toBe(false);
    // Every other run keeps its group per event and ref, and a newer one still cancels it.
    expect(group(runs.dispatch)).toContain("workflow_dispatch-refs/heads/main");
    expect(group(runs.schedule)).toContain("schedule-refs/heads/main");
    expect(cancels(runs.dispatch)).toBe(true);
    expect(cancels(runs.schedule)).toBe(true);
  });

  it("drives hook-runs.mjs in the image the cloud leg pins, requiring an observation, with no --bare", () => {
    const steps = jobOf(nightly, "hook-fire").steps;
    expect(runOf(steps, "Pinned image")).toContain("import('./scripts/ci/cloud-leg.mjs')");
    for (const { client, secret } of CLIENT_LEGS) {
      const drive = runOf(steps, `Drive (${client})`);
      expect(drive).toContain(`node scripts/qa/hook-runs.mjs --clients ${client} --require-observation`);
      expect(drive).toContain('"$IMAGE"');
      // The secret passes by name from the step's environment, the checkout and the client read-only.
      expect(drive).toContain(`-e ${secret} `);
      expect(drive).toContain('-v "$GITHUB_WORKSPACE:/src:ro"');
      expect(drive).toContain(`-v "$RUNNER_TEMP/${client}:/opt/client:ro"`);
      expect(runOf(steps, `Install (${client})`)).toContain(`-v "$RUNNER_TEMP/${client}:/opt/client" "$IMAGE"`);
    }
    expect(JSON.stringify(jobOf(nightly, "hook-fire"))).not.toMatch(/docker\.sock|--privileged|container:/);
  });

  it("runs release prep only on a dispatch that sets release_prep, against a bare remote, with no prompts and no --bare", () => {
    const on = (nightly.workflow as unknown as Record<string, Record<string, { inputs?: Record<string, Record<string, unknown>> }>>)["on"];
    expect(on?.["workflow_dispatch"]?.inputs?.["release_prep"]).toMatchObject({ type: "boolean", default: false });
    const steps = jobOf(nightly, "release-prep-unattended").steps;
    expect(steps[0]?.id).toBe("arm-claude");
    expect(steps[0]?.env?.["RELEASE_PREP"]).toBe("${{ inputs.release_prep }}");
    for (const step of steps.slice(1)) {
      expect(step.if, step.name).toBe("steps.arm-claude.outputs.armed == 'true'");
    }
    // TEST CHANGE, justified (review/40, run 2026-10-18_cloud-runs-2): the bare remote is built in the
    // "Scratch repository" step, which holds no secret, so the case below can run it.
    const scratch = runOf(steps, "Scratch repository");
    expect(scratch).toContain('git init -q --bare "$REMOTE"');
    expect(scratch).toContain('"$REMOTE/hooks/pre-receive"');
    const drive = runOf(steps, "Drive (claude)");
    expect(drive).toMatch(/claude -p "\/st-work --unattended [^"]+" \\\n\s+--permission-prompts none /);
  });

  it("keeps --bare off every claude command line in the file", () => {
    const lines = nightly.source.split("\n").filter((line) => /\bclaude -p\b/.test(line));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).not.toContain("--bare");
  });

  it("feeds no aggregator", () => {
    for (const jobId of CLIENT_LEG_JOBS) {
      expect(jobOf(nightly, jobId).needs, jobId).toBeUndefined();
      expect(jobOf(ci, "all-ci-checks").needs, jobId).not.toContain(jobId);
    }
  });

  describe.skipIf(process.platform === "win32" || spawnSync("sh", ["-c", "exit 0"]).status !== 0)("the arm steps, executed under sh", () => {
    const root = mkdtempSync(join(tmpdir(), "stamity-client-legs-"));
    afterAll(() => rmSync(root, { recursive: true, force: true }));

    /** One arm body under `sh -e`, with an empty environment but the output channel and `env`. */
    function arm(body: string, env: Readonly<Record<string, string>>): { status: number | null; stdout: string; written: string } {
      const dir = mkdtempSync(join(root, "arm-"));
      const output = join(dir, "output");
      writeFileSync(output, "");
      const result = spawnSync("sh", ["-e", "-c", body], { cwd: dir, encoding: "utf8", env: { GITHUB_OUTPUT: output, ...env } });
      return { status: result.status, stdout: result.stdout, written: readFileSync(output, "utf8") };
    }

    const ARMS = [
      ...CLIENT_LEGS.map(({ client, secret }) => ({ job: "hook-fire", client, secret, gate: {} })),
      { job: "release-prep-unattended", client: "claude", secret: "ANTHROPIC_API_KEY", gate: { RELEASE_PREP: "true" } },
    ];

    for (const { job, client, secret, gate } of ARMS) {
      const body = runOf(stepsOf(nightly, job), `Arm (${client})`);

      it(`${job} ${client}: no secret → armed=false, exit 0`, () => {
        const result = arm(body, gate);
        expect(result.status).toBe(0);
        expect(result.written).toBe("armed=false\n");
        expect(result.stdout).toContain("::notice title=");
      });

      it(`${job} ${client}: the secret set → armed=true, the value written nowhere`, () => {
        const result = arm(body, { ...gate, [secret]: "sk-not-a-key" });
        expect(result.status).toBe(0);
        expect(result.written).toBe("armed=true\n");
        expect(result.stdout + result.written).not.toContain("sk-not-a-key");
      });
    }

    it("release prep stays off with the secret set and no release_prep dispatch", () => {
      const body = runOf(stepsOf(nightly, "release-prep-unattended"), "Arm (claude)");
      expect(arm(body, { ANTHROPIC_API_KEY: "sk-not-a-key" }).written).toBe("armed=false\n");
      expect(arm(body, { ANTHROPIC_API_KEY: "sk-not-a-key", RELEASE_PREP: "false" }).written).toBe("armed=false\n");
    });
  });
});

/**
 * ADDED (review/40, run 2026-10-18_cloud-runs-2): release prep's scratch repository, EXECUTED. Its step
 * runs under `sh` as written, with the runner's two folders substituted, and the engine then decides in
 * it: the unattended pre-flight passes every check, and the run verbs push the run's branch to the bare
 * remote and open the draft through the `gh` stub. The drive step's outcome checks then run with its
 * `claude -p` call left out (inline mock reason: a client run needs an account and costs a model turn):
 * green on that branch, red on a refused record and on a morning list opening `## Refused`. The canary
 * the shell guard writes on the run's first shell call is written here by hand.
 */
describe.skipIf(process.platform === "win32" || spawnSync("sh", ["-c", "exit 0"]).status !== 0)(
  "nightly.yml — release prep's scratch repository, executed",
  () => {
    const root = mkdtempSync(join(tmpdir(), "stamity-release-prep-"));
    afterAll(() => rmSync(root, { recursive: true, force: true }));
    const temp = join(root, "temp");
    const work = join(temp, "release-prep");
    const repo = join(work, "repo");
    const RUN = "2026-10-18_release-prep";
    const BRANCH = `stamity/${RUN}`;
    const runDir = [".stamity", "runs", RUN].join("/");
    const env: Record<string, string> = {
      ...carriedProcessEnv(),
      HOME: join(root, "home"),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: NO_GIT_CONFIG,
      npm_config_update_notifier: "false",
      RUNNER_TEMP: temp,
      GITHUB_WORKSPACE: REPO_ROOT,
    };
    /** The drive's PATH: the `git` shim and the `gh` stub first. */
    const shimmed = { ...env, PATH: `${join(work, "bin")}${delimiter}${env["PATH"] ?? ""}` };
    const steps = stepsOf(nightly, "release-prep-unattended");

    function sh(body: string): { status: number | null; out: string } {
      const result = spawnSync("sh", ["-e", "-c", body], { cwd: root, env, encoding: "utf8", timeout: 120_000 });
      return { status: result.status, out: `${result.stdout}${result.stderr}` };
    }

    /** `npx --no stamity <args> --json` in the scratch repository, unattended; its parsed JSON. */
    function stamity(args: readonly string[]): Record<string, unknown> {
      const result = spawnSync("npx", ["--no", "stamity", ...args, "--json"], {
        cwd: repo,
        env: { ...shimmed, STAMITY_UNATTENDED: "1" },
        encoding: "utf8",
        timeout: 120_000,
      });
      expect(result.stdout, `stamity ${args.join(" ")}: ${result.stderr}`).toMatch(/^\{/);
      return JSON.parse(result.stdout) as Record<string, unknown>;
    }

    function gitIn(args: readonly string[]): string {
      return execFileSync("git", [...args], { cwd: repo, env: shimmed, encoding: "utf8" }).trim();
    }

    function put(path: string, text: string): void {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), text);
    }

    it("builds a repository whose unattended pre-flight passes every check", async () => {
      await ensureDistBuilt();
      const built = sh(runOf(steps, "Scratch repository"));
      expect(built.status, built.out).toBe(0);
      expect(gitIn(["remote", "get-url", "origin"]), "origin reads as GitHub").toBe("https://github.com/o/r.git");
      put(".stamity/preflight-canary.json", JSON.stringify({ at: new Date().toISOString() }));
      const verdict = stamity(["gate", "preflight", "--unattended"]) as { ok: boolean; checks: { id: string; state: string; evidence: string }[] };
      expect(verdict.checks.filter((check) => check.state !== "pass"), JSON.stringify(verdict.checks)).toEqual([]);
      expect(verdict.ok).toBe(true);
      expect(verdict.checks.find((check) => check.id === "direct-push")?.evidence).toContain("cannot bypass it for a direct push");
    }, 180_000);

    it("pushes the run through the verbs, and the drive's checks pass only on a run that did not refuse", () => {
      const started = stamity(["run", "start", "--run", RUN]);
      expect(started).toMatchObject({ ok: true, branch: BRANCH });
      put("src/greet.mjs", "export function greet(name) {\n  return `Hello, ${name || \"there\"}!`\n}\n");
      const record = (status: string) =>
        `# Run ${RUN}\n\nStatus: ${status}\nMode: unattended\nBranch: ${BRANCH}\nBase: ${String(started["base"])}\n`;
      put(`${runDir}/record.md`, record("in progress"));
      const checkpoint = stamity(["run", "checkpoint", "--run", RUN, "--paths", "src/greet.mjs", `${runDir}/record.md`, "--pr", "--title", "Cloud check: a greeting"]);
      expect(checkpoint).toMatchObject({ pushed: true, pr: { number: 1, how: "created" } });
      const sections = ["For you to check", "Decisions", "Prerequisites", "Person's calls held", "Not done:", "How to answer"];
      const morning = (refused: boolean) =>
        [`# Morning list — ${RUN}`, "", ...(refused ? ["## Refused", "", "- direct-push: unknown", ""] : []), ...sections.flatMap((name) => [`## ${name}`, "", "none", ""])].join("\n");
      put(`${runDir}/morning.md`, morning(false));
      put(`${runDir}/record.md`, record("closed 2026-10-18 (done)"));
      const ended = stamity(["run", "end", "--run", RUN, "--title", "Cloud check: a greeting", "--paths", `${runDir}/record.md`, `${runDir}/morning.md`]);
      expect(ended).toMatchObject({ ok: true, pushed: true, notDone: [] });

      const drive = runOf(steps, "Drive (claude)");
      const outcome = drive.replace(/claude -p [^\n]*\\\n[^\n]*\n/, ":\n");
      expect(outcome, "the claude -p call is left out").not.toBe(drive);
      const green = sh(outcome);
      expect(green.status, green.out).toBe(0);
      expect(green.out).toContain(`${BRANCH} on the remote (Status: closed 2026-10-18 (done))`);

      // A raw commit and push stand in for the refusals a run would push through `run end`.
      const pushAs = (message: string) => {
        gitIn(["commit", "-qam", message]);
        gitIn(["push", "-q", "origin", BRANCH]);
      };
      put(`${runDir}/record.md`, record("closed 2026-10-18 (refused: direct-push unknown)"));
      pushAs("a refused record");
      const refusedRecord = sh(outcome);
      expect(refusedRecord.status).toBe(1);
      expect(refusedRecord.out).toContain("the run refused");
      put(`${runDir}/record.md`, record("closed 2026-10-18 (done)"));
      put(`${runDir}/morning.md`, morning(true));
      pushAs("a refused morning list");
      const refusedMorning = sh(outcome);
      expect(refusedMorning.status).toBe(1);
      expect(refusedMorning.out).toContain("opens ## Refused");
    }, 180_000);
  },
);

// ── pr-checks.yml ────────────────────────────────────────────────────────────

describe("pr-checks.yml — the gates only a pull request can be asked", () => {
  const jobs = prChecks.workflow.jobs;
  const TITLE_STEP = "Title matches the conventional-commit subject shape";
  const BUDGET_STEP = "Size budget (logic and corpus halves)";

  /**
   * The pattern the workflow applies, character for character.
   *
   * `grep -E` and JavaScript agree on every construct in it — escaped parens, `?`, `!`, `|`,
   * `.+` — so the table below evaluates the SAME pattern the runner does rather than a
   * paraphrase of it.
   */
  const TITLE_PATTERN =
    "^(feat|fix|refactor|test|docs|chore|ci|perf|build|style)(\\([a-z0-9-]+\\))?!?: .+";

  it("runs on pull requests only, and on the event a title edit produces", () => {
    expect(triggersOf(prChecks.workflow)).toEqual(["pull_request"]);
    const on = (prChecks.workflow as unknown as Record<string, Record<string, unknown>>)["on"];
    const pullRequest = on?.["pull_request"] as {
      branches?: string[];
      types?: string[];
    };
    expect(pullRequest.branches).toEqual(["main"]);
    // Editing a title fires `edited` and nothing else. Without it a corrected title never
    // re-runs, and a required context stays red on a pull request that is now fine.
    expect(pullRequest.types).toContain("edited");
    expect(pullRequest.types).toContain("synchronize");
  });

  it("carries the three gates and one stable context for a branch rule to bind", () => {
    expect(Object.keys(jobs)).toEqual(["dco", "pr-title", "size-budget", "all-pr-checks"]);

    const aggregator = jobOf(prChecks, "all-pr-checks");
    expect(aggregator.name).toBe("all-pr-checks");
    // Same reason as ci.yml's: without `always()` the aggregator is skipped after a failed
    // dependency, and a skipped required check reads as green.
    expect(aggregator.if).toBe("always()");
    expect(aggregator.needs).toEqual(["dco", "pr-title", "size-budget"]);
    expect(aggregator.permissions).toEqual({});

    const report = aggregator.steps.map((step) => step.run ?? "").join("\n");
    for (const job of ["dco", "pr-title", "size-budget"]) {
      // Asserted, not echoed: `needs` alone cannot express "cancelled is not success".
      expect(report, job).toContain('test "${{ needs.' + job + '.result }}" = "success"');
    }
  });

  it("stays out of ci.yml's aggregator, because the two do not run on the same events", () => {
    // Requiring a pull-request-only job through `all-ci-checks` would make every push to `main`
    // wait on a job that never reports. Two contexts, each required where it runs.
    // TEST CHANGE, justified (plan 013 file 3, unit sw06-records-only-ci-lane): `changes` and
    // `records` join the aggregator's `needs`; both run on every event (`records` reports
    // `skipped` when it does not apply), and neither is a pr-checks job.
    // TEST CHANGE, justified (2026-10-08, unit a1-proven-push): `prove-pr` joins the aggregator's
    // `needs`. It reports `skipped` on every event but a push to `main`, and it is a ci.yml job,
    // not a pr-checks one, so this test's property is unchanged.
    // TEST CHANGE, justified (2026-10-08, run 2026-10-08_maintainer-tooling, unit a2-ci-lanes): `records`
    // is renamed `lanes`; it is still a ci.yml job that reports on every event.
    // TEST CHANGE, justified (2026-10-14, run 2026-10-13_records-branch, unit r5-ci-records-job): the canonical
    // `records` job joins; it is a ci.yml job that reports on every event (skipped outside the
    // canonical repository), not a pr-checks one.
    // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): `apm-install`
    // and `plugin-route` leave with the routes 1.15.0 deletes; no pr-checks job joins.
    // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit e11-ci-container-leg):
    // `cloud-container` joins; it is a ci.yml job that reports on every event (skipped off the full
    // side), not a pr-checks one, so this test's property is unchanged.
    expect(jobOf(ci, "all-ci-checks").needs).toEqual([
      "changes",
      "prove-pr",
      "check",
      "cloud-container",
      "lanes",
      "records",
      "supply-chain",
    ]);
    expect(triggersOf(ci.workflow)).toContain("push");
    expect(triggersOf(prChecks.workflow)).not.toContain("push");
  });

  it("walks the pull request's own commits for a sign-off, and fails closed on an empty answer", () => {
    const steps = stepsOf(prChecks, "dco");
    const run = runOf(steps, "Every commit carries a Signed-off-by trailer");

    expect(jobOf(prChecks, "dco").permissions).toEqual({
      contents: "read",
      "pull-requests": "read",
    });
    // CHANGED by the fork-lane audit's inherited-checks warning on the commit ceiling (plan 008,
    // unit A1b). Three assertions were retired here and the behaviour each one pinned moved with
    // it, so they are named rather than quietly dropped:
    //
    //   `/pulls/$PR_NUMBER/commits`  the pull-request commits endpoint answers at most 250
    //                                commits, and that ceiling belongs to the LISTING — no flag
    //                                lifts it. An update pull request carrying two upstream
    //                                releases is already past it, so the gate could not be
    //                                passed on one at all. The set now comes from the three-dot
    //                                comparison, which is the same set by merge-base semantics.
    //   `--paginate`                 a comparison page is a `commits` array inside one JSON
    //                                object rather than the whole body, so the walk is explicit:
    //                                `page=N` until the listed count reaches `total_commits`.
    //   `[ "$TOTAL" -ge 250 ]`       the ceiling itself, replaced by a RECONCILIATION — a
    //                                listing is complete only when it equals `total_commits`,
    //                                which fails closed on a short answer at any length rather
    //                                than at one number.
    expect(run).toContain("compare/$BASE_SHA...$HEAD_SHA");
    expect(run).toContain("per_page=100&page=$PAGE");
    expect(run).toContain("total_commits");
    expect(run).toContain('[ "$LISTED" -ne "$TOTAL_COMMITS" ]');
    expect(run, "the retired commit ceiling must not come back").not.toContain("250");
    // The two shas the comparison is taken between arrive as data, never interpolated into the
    // script body, and both come off the event rather than off a ref a force-push can move.
    const dco = stepOf(steps, "Every commit carries a Signed-off-by trailer");
    expect(dco.env?.["BASE_SHA"]).toBe("${{ github.event.pull_request.base.sha }}");
    expect(dco.env?.["HEAD_SHA"]).toBe("${{ github.event.pull_request.head.sha }}");
    expect(run).toContain("Signed-off-by: ");
    // A lookup that returned nothing and a fully signed-off branch are the same shape here.
    expect(run).toContain('[ "$LISTED" -eq 0 ]');
    // The one exemption, and the two properties that stop it being a hole. The lane
    // configuration is read at the BASE sha, so a pull request cannot add the file that would
    // exempt it; and only an UNSIGNED commit is ever looked up, which is what bounds the calls.
    expect(run).toContain("contents/.stamity/upstream.json?ref=$BASE_SHA");
    // CHANGED by W-A1b-1. The exemption asked `repos/$UPSTREAM_REPO/commits/$SHA` and took a
    // 200 as proof the commit was the upstream's. That endpoint serves any commit in the
    // upstream's whole FORK NETWORK, so a 200 measured visibility, not membership. The
    // question is now ancestry against the upstream's default branch, resolved once.
    expect(run).toContain("repos/$UPSTREAM_REPO/compare/$SHA...$DEFAULT_BRANCH");
    expect(run).toContain("ahead | identical)");
    expect(run, "the retired existence test must not come back").not.toContain(
      "$UPSTREAM_REPO/commits/",
    );
    expect(run, "only a github.com upstream may exempt anything").toContain("https://github.com/");
    // The failure names the commits, or the contributor has to go and find them.
    expect(run).toContain("::error title=Missing DCO sign-off::");
    expect(run).toContain("$STILL_UNSIGNED");
    expect(run).toContain("git rebase --signoff origin/main");
    // No checkout: this job runs nothing out of the diff it is judging. The grants say so and
    // the header says so, but the property is what the shell can REACH, so the four tools that
    // would run something out of the diff are refused in COMMAND position as well. Command
    // position and not substring, deliberately: the failure summary quotes
    // `git rebase --signoff origin/main` for the contributor to run, and quoting a command is
    // not invoking one.
    expect(steps.some((step) => (step.uses ?? "").startsWith("actions/checkout@"))).toBe(false);
    for (const tool of ["node", "npm", "npx", "git"]) {
      expect(run, `the DCO job must not invoke ${tool}`).not.toMatch(
        new RegExp(String.raw`(^|[;&|(])\s*${tool}\s`, "m"),
      );
    }
  });

  it("matches the title against a pattern this suite evaluates rather than paraphrases", () => {
    const step = stepOf(stepsOf(prChecks, "pr-title"), TITLE_STEP);
    const run = step.run ?? "";

    expect(run).toContain(`PATTERN='${TITLE_PATTERN}'`);
    expect(jobOf(prChecks, "pr-title").permissions).toEqual({});
    // The title is the one value on a pull request an outsider writes freely. Through `env:`, it
    // is data; interpolated into the body, it would be substituted before bash parses the script.
    expect(step.env?.["TITLE"]).toBe("${{ github.event.pull_request.title }}");
    expect(run, "the title must not be interpolated into the script body").not.toContain(
      "github.event",
    );

    const pattern = new RegExp(TITLE_PATTERN);
    const table: readonly (readonly [string, boolean])[] = [
      ["feat: add a thing", true],
      ["fix(cli): correct the exit code", true],
      ["feat(pack)!: drop the legacy field", true],
      ["perf!: cut a walk", true],
      ["build(deps): bump tsdown", true],
      ["chore(deps-dev): bump vitest", true],
      ["refactor(a-b-1): rename", true],
      ["docs: x", true],
      // The eleven types are a closed set, and the shape is exact.
      ["wip: still going", false],
      ["Feat: capitalised type", false],
      ["feat(CLI): upper-case scope", false],
      ["feat:no space after the colon", false],
      ["feat: ", false],
      ["feat", false],
      ["add a thing", false],
    ];
    for (const [title, accepted] of table) {
      expect(pattern.test(title), title).toBe(accepted);
    }
  });

  it("builds, then measures both halves against the build config's own numbers, blocking", () => {
    const steps = stepsOf(prChecks, "size-budget");

    expect(jobOf(prChecks, "size-budget").permissions).toEqual({ contents: "read" });
    expect(runOf(steps, "Install")).toBe("npm ci");
    expect(runOf(steps, "Build")).toBe("npm run build");
    expect(runOf(steps, BUDGET_STEP)).toBe("node scripts/size-budget.mjs");
    expect(indexOf(steps, "Build")).toBeLessThan(indexOf(steps, BUDGET_STEP));
    // Blocking: no `continue-on-error`, no condition that could skip it into a green.
    expect(stepOf(steps, BUDGET_STEP)["continue-on-error"]).toBeUndefined();
    expect(conditionOf(steps, BUDGET_STEP)).toBe("");

    // ONE place declares the budget. A second set of numbers here could disagree with the ones
    // the build enforces, and the check and the build would then be measuring different things.
    const script = readFileSync(join(REPO_ROOT, "scripts", "size-budget.mjs"), "utf-8");
    expect(script).toContain("from '../tsdown.config.mjs'");
    expect(script).toContain("checkSizeBudgets");
    expect(script, "the gate must not redeclare a budget constant").not.toMatch(
      /\d\s*\*\s*1024\s*\*\s*1024/,
    );
    // Exit 2 is "the gate could not run" — an absent or empty build must never read as a pass.
    expect(script).toContain("process.exit(2)");
  });

  it("is documented as the second required context, where a contributor looks for it", () => {
    const governance = readFileSync(join(REPO_ROOT, "GOVERNANCE.md"), "utf-8");
    const contributing = readFileSync(join(REPO_ROOT, "CONTRIBUTING.md"), "utf-8");

    for (const [name, text] of [
      ["GOVERNANCE.md", governance],
      ["CONTRIBUTING.md", contributing],
    ] as const) {
      expect(text, `${name} does not name the pull-request context`).toContain("all-pr-checks");
      expect(text, `${name} does not name the workflow behind it`).toContain("pr-checks.yml");
      expect(text, `${name} dropped the every-event context`).toContain("all-ci-checks");
      // ADDED by plan 013 file 3, unit sw06-records-only-ci-lane: a contributor whose push ran
      // the short lane finds it described, with the script that decided.
      expect(text, `${name} does not describe the records-only lane`).toContain(
        "scripts/ci/records-only.mjs",
      );
      // ADDED by run 2026-10-13_records-branch, unit r5-ci-records-job (2026-10-14): the canonical records
      // job, merge-blocking here, is described with the script it restores the records through.
      expect(text, `${name} does not describe the records job`).toContain("scripts/records.mjs");
      expect(text, `${name} does not describe the records suite`).toContain("npm run test:records");
    }

    // CONTRIBUTING used to claim the DCO and the title were "checked in CI" while no job checked
    // either. The claim is true now, and the page has to name the lane that makes it true.
    expect(contributing).toContain("checked by the `pr-checks` workflow");
    expect(contributing, "the unattributed CI claim must not come back").not.toContain(
      "Both are checked in CI",
    );
  });
});

// ── pr-checks.yml: the DCO job, executed ─────────────────────────────────────

/**
 * The static pins above say the shell NAMES a comparison; these say it walks one.
 *
 * The job is a bash script the runner hands to a real `gh`, and the two properties that matter
 * are not visible in any substring of it: that a pull request past the old 250-commit ceiling is
 * listed WHOLE, and that an unsigned commit is exempt only when the configured upstream actually
 * has it. Both live in the control flow, so the shipping shell is executed here against a fake
 * `gh` first on PATH that answers one canned response per endpoint — the pattern
 * `test/upstream/workflowLandingPolicy.test.ts` uses on the landing-policy step, and for the same
 * reason. Only the GitHub responses are substituted; bash, jq, awk and grep are the real ones.
 *
 * The fake is a POSIX shell script rather than a node one because the exemption path makes one
 * call per unsigned commit, and the 303-commit case makes three hundred of them: a node start per
 * call would be most of this file's runtime.
 *
 * Not run on Windows: a Git-for-Windows bash is a different interpreter than the one the runner
 * uses, and these fixtures are POSIX paths and modes.
 */
const DCO_EXECUTABLE =
  process.platform !== "win32" &&
  spawnSync("bash", ["--version"]).status === 0 &&
  spawnSync("jq", ["--version"]).status === 0;

/** One response file per endpoint, keyed exactly the way the fake `gh` keys its lookup. */
const keyOf = (endpoint: string): string => endpoint.replaceAll(/[^A-Za-z0-9]/g, "_");

describe.skipIf(!DCO_EXECUTABLE)("pr-checks.yml — the DCO job, executed", () => {
  const root = mkdtempSync(join(tmpdir(), "stamity-dco-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const DCO = runOf(stepsOf(prChecks, "dco"), "Every commit carries a Signed-off-by trailer");
  const BASE = "b".repeat(40);
  const HEAD = "h".repeat(40);
  const SIGN_OFF = "Signed-off-by: A Maintainer <maintainer@example.invalid>";
  const FORK = "example/fork";
  const UPSTREAM_CONFIG = JSON.stringify({
    version: 1,
    upstream: "https://github.com/example/upstream",
  });

  interface Commit {
    readonly sha: string;
    readonly commit: { readonly message: string };
  }

  const commitOf = (sha: string, signed: boolean): Commit => ({
    sha,
    commit: { message: signed ? `work on ${sha}\n\n${SIGN_OFF}\n` : `work on ${sha}\n` },
  });

  /** `count` commits with distinct 40-hex shas built off `prefix`. */
  function commits(prefix: string, count: number, signed: boolean): Commit[] {
    return Array.from({ length: count }, (_, index) =>
      commitOf(`${prefix}${String(index).padStart(40 - prefix.length, "0")}`, signed),
    );
  }

  interface Case {
    /** Every commit the comparison lists, in order. Served 100 to a page. */
    readonly commits: readonly Commit[];
    /** What the comparison reports as `total_commits`; the listed length by default. */
    readonly totalCommits?: number;
    /**
     * `total_commits` for one specific page, overriding `totalCommits` there — the branch
     * MOVING under the walk, which the job reconciles page against page rather than only
     * against the rows in hand. Keyed by 1-based page number.
     */
    readonly pageTotals?: Readonly<Record<number, number>>;
    /**
     * A page the fake serves no file for at all, so `gh` exits nonzero mid-walk. A walk that
     * swallowed it would judge a pull request on the pages that happened to answer.
     */
    readonly missingPage?: number;
    /** The lane configuration on the BASE branch, or absent when the repository has none. */
    readonly config?: string;
    /**
     * Shas the configured upstream both HAS (a 200 on `commits/`) and holds REACHABLE from its
     * default branch (an `ahead` comparison). The two are written together because for a real
     * upstream commit they always travel together; `upstreamCompare` splits them apart.
     */
    readonly upstreamHas?: readonly string[];
    /**
     * An explicit comparison status per sha, overriding the `ahead` that `upstreamHas` writes.
     * This is how a sha that EXISTS on the upstream endpoint — because someone pushed it to a
     * fork in the same network — is served with the `diverged` its ancestry really answers.
     */
    readonly upstreamCompare?: Readonly<Record<string, string>>;
    /** The upstream's default branch, or `null` when that read itself fails. */
    readonly upstreamDefaultBranch?: string | null;
  }

  interface Run {
    readonly status: number | null;
    readonly out: string;
    readonly summary: string;
    readonly calls: readonly string[];
  }

  let ordinal = 0;

  function invoke(testCase: Case): Run {
    const dir = join(root, String(ordinal++));
    const bin = join(dir, "bin");
    const responses = join(dir, "responses");
    mkdirSync(bin, { recursive: true });
    mkdirSync(responses, { recursive: true });

    const total = testCase.totalCommits ?? testCase.commits.length;
    // One page past the last, carrying an empty `commits` array, because that is what the real
    // endpoint answers past the end — and it is the only way a listing SHORTER than the total
    // reaches the reconciliation instead of dying on an unanswered page.
    const pages = Math.max(1, Math.ceil(testCase.commits.length / 100)) + 1;
    for (let page = 1; page <= pages; page += 1) {
      if (page === testCase.missingPage) continue;
      const endpoint = `repos/${FORK}/compare/${BASE}...${HEAD}?per_page=100&page=${String(page)}`;
      writeFileSync(
        join(responses, keyOf(endpoint)),
        JSON.stringify({
          total_commits: testCase.pageTotals?.[page] ?? total,
          commits: testCase.commits.slice((page - 1) * 100, page * 100),
        }),
      );
    }
    if (testCase.config !== undefined) {
      writeFileSync(
        join(responses, keyOf(`repos/${FORK}/contents/.stamity/upstream.json?ref=${BASE}`)),
        testCase.config,
      );
    }
    const branch = testCase.upstreamDefaultBranch === undefined ? "main" : testCase.upstreamDefaultBranch;
    if (branch !== null) {
      writeFileSync(
        join(responses, keyOf("repos/example/upstream")),
        JSON.stringify({ default_branch: branch }),
      );
    }
    // Existence and ancestry are written as the two SEPARATE facts they are. A 200 on
    // `commits/` says only that some repository in the upstream's fork network carries the
    // sha; the comparison against the default branch is what says the upstream itself reached
    // it. `upstreamCompare` is how a case serves one without the other.
    const statuses: Record<string, string> = {};
    for (const sha of testCase.upstreamHas ?? []) {
      writeFileSync(join(responses, keyOf(`repos/example/upstream/commits/${sha}`)), "{}");
      statuses[sha] = "ahead";
    }
    for (const [sha, status] of Object.entries(testCase.upstreamCompare ?? {})) {
      writeFileSync(join(responses, keyOf(`repos/example/upstream/commits/${sha}`)), "{}");
      statuses[sha] = status;
    }
    for (const [sha, status] of Object.entries(statuses)) {
      if (status === "") continue;
      writeFileSync(
        join(responses, keyOf(`repos/example/upstream/compare/${sha}...${branch ?? "main"}`)),
        JSON.stringify({ status }),
      );
    }

    // A response the fake has no file for is an HTTP error with the API's own shape on stderr:
    // that is how a commit absent from the upstream, and a repository with no lane config,
    // both reach the shell. The diagnostic is private, and the assertions below check it never
    // reaches the job's output.
    const gh = join(bin, "gh");
    writeFileSync(
      gh,
      `#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS"
ENDPOINT=''
FILTER=''
TAKE_FILTER=''
for ARG in "$@"; do
  if [ -n "$TAKE_FILTER" ]; then FILTER="$ARG"; TAKE_FILTER=''; continue; fi
  case "$ARG" in
    repos/*) ENDPOINT="$ARG" ;;
    --jq) TAKE_FILTER=1 ;;
  esac
done
if [ "$1" != api ] || [ -z "$ENDPOINT" ]; then
  echo "the fake gh was asked for something that is not an api read: $*" >&2
  exit 9
fi
FILE="$RESPONSES/$(printf '%s' "$ENDPOINT" | tr -c 'A-Za-z0-9' '_')"
if [ ! -f "$FILE" ]; then
  case "$ENDPOINT" in
    "$WALK_PREFIX"*) echo "gh: Not Found (HTTP 404) — walk diagnostic" >&2 ;;
    *) echo "gh: Not Found (HTTP 404) — private diagnostic" >&2 ;;
  esac
  exit 1
fi
if [ -n "$FILTER" ]; then
  jq -r "$FILTER" < "$FILE"
else
  cat "$FILE"
fi
`,
    );
    chmodSync(gh, 0o755);

    const summaryPath = join(dir, "summary.md");
    const callsPath = join(dir, "calls");
    writeFileSync(summaryPath, "");
    writeFileSync(callsPath, "");
    const result = spawnSync("bash", ["-c", DCO], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        LC_ALL: "C",
        PATH: `${bin}${delimiter}${process.env["PATH"] ?? ""}`,
        GH_TOKEN: "not-a-token",
        GITHUB_REPOSITORY: FORK,
        PR_NUMBER: "42",
        BASE_SHA: BASE,
        HEAD_SHA: HEAD,
        GITHUB_STEP_SUMMARY: summaryPath,
        RESPONSES: responses,
        CALLS: callsPath,
        // The comparison WALK is the job's own read and its failure is reported in the job's
        // own words, so gh's message there is not a leak. Every other endpoint — the lane
        // configuration and the ancestry lookups — is read with stderr suppressed, and the
        // assertion below is what holds that suppression in place.
        WALK_PREFIX: `repos/${FORK}/compare/`,
      },
    });
    const out = `${result.stdout}${result.stderr}`;
    const summary = readFileSync(summaryPath, "utf8");
    expect(
      out + summary,
      "a gh diagnostic from a suppressed lookup must not reach the job's output",
    ).not.toContain("private diagnostic");
    return {
      status: result.status,
      out,
      summary,
      calls: readFileSync(callsPath, "utf8").split("\n").filter((line) => line !== ""),
    };
  }

  /**
   * The update pull request the finding is about: three hundred upstream commits the fork did
   * not write, plus the three it did.
   *
   * Twelve of the three hundred carry no trailer, placed so that at least one lands on each of
   * the four pages, including the first and the last row of the listing. Twelve rather than
   * three hundred because that is the real shape — every upstream commit across v1.3.0..v1.8.0
   * carries one, so the exemption is a safety net rather than the normal path — and because one
   * `gh` call per unsigned commit is what the exemption costs, here and on the runner.
   */
  const UNSIGNED_AT = new Set([0, 1, 99, 100, 150, 199, 200, 250, 260, 297, 298, 299]);
  const updateCommits = (): Commit[] => [
    ...Array.from({ length: 300 }, (_, index) =>
      commitOf(`u${String(index).padStart(39, "0")}`, !UNSIGNED_AT.has(index)),
    ),
    ...commits("f", 3, true),
  ];

  it("lists a 303-commit update pull request whole and exempts its upstream commits", () => {
    // The finding this unit closes, in one fixture: this pull request is past the old ceiling,
    // and under it the job could not be passed at all — nor split to get under it, because the
    // commits are one merge.
    const all = updateCommits();
    const unsigned = all.filter((entry) => !entry.commit.message.includes("Signed-off-by"));
    const run = invoke({
      commits: all,
      config: UPSTREAM_CONFIG,
      upstreamHas: unsigned.map((entry) => entry.sha),
    });

    expect(run.status, run.out).toBe(0);
    expect(run.out).toContain("Listed 303 of 303");
    expect(run.out).toContain("291 signed off");
    expect(run.out).toContain("12 exempt");
    expect(run.out).toContain("0 unsigned");
    // Four pages, and the fourth is the one the old ceiling could never have reached.
    expect(run.calls.filter((call) => call.includes(`${FORK}/compare/`))).toHaveLength(4);
    expect(run.calls.some((call) => call.includes("page=4"))).toBe(true);
    // Bounded, and bounded on the right side: a signed commit is never looked up.
    const lookups = run.calls.filter((call) => call.includes("example/upstream/compare/"));
    expect(lookups).toHaveLength(unsigned.length);
    expect(lookups.some((call) => call.includes("/compare/f"))).toBe(false);
    // The default branch is resolved ONCE for the whole run, not per sha.
    expect(run.calls.filter((call) => /\brepos\/example\/upstream\s*$/.test(call.trim()) || call.includes("repos/example/upstream --jq"))).toHaveLength(1);
  });

  it("refuses a sha the upstream endpoint answers 200 for but its default branch never reached", () => {
    // W-A1b-1, the finding this case exists for. GitHub serves a commit pushed to ANY
    // repository in a fork network through the PARENT's commit endpoint, so a 200 on
    // `repos/<upstream>/commits/<sha>` measures fork-network visibility, not upstream
    // membership: on a public upstream, anyone may push an unsigned commit to a personal fork
    // and that endpoint will answer 200 for it. Under the existence rule a contributor to this
    // private downstream could waive the DCO on their own commit that way. The rule is
    // ANCESTRY — the sha must be reachable from the upstream's default branch — so a sha the
    // endpoint has but the comparison calls `diverged` stays unsigned and fails the job.
    const all = updateCommits();
    const unsigned = all.filter((entry) => !entry.commit.message.includes("Signed-off-by"));
    const planted = unsigned[3]?.sha ?? "";
    const run = invoke({
      commits: all,
      config: UPSTREAM_CONFIG,
      upstreamHas: unsigned.filter((entry) => entry.sha !== planted).map((entry) => entry.sha),
      upstreamCompare: { [planted]: "diverged" },
    });

    expect(run.status).toBe(1);
    expect(run.out).toContain(planted);
    expect(run.summary).toContain(planted);
    expect(run.out).toContain("11 exempt");
    expect(run.out).toContain("1 unsigned");
    // Exactly the planted sha, so the other eleven prove the ancestry rule still exempts a
    // genuine upstream commit rather than the job having gone blanket-strict.
    const named = unsigned.filter((entry) => run.summary.includes(entry.sha));
    expect(named.map((entry) => entry.sha)).toEqual([planted]);
    // It WAS asked about — this is a rejection on the answer, not a lookup that never happened.
    expect(run.calls.some((call) => call.includes(`compare/${planted}...main`))).toBe(true);
  });

  it("exempts a sha the upstream's default branch is sitting exactly on", () => {
    // `identical` is the head commit of the default branch itself: reachable, and the boundary
    // case an `ahead`-only rule would refuse. `behind` is the other side of it — a sha the
    // default branch is an ancestor OF, which is a commit the upstream has not taken.
    const tip = commits("t", 1, false)[0]?.sha ?? "";
    const future = commits("z", 1, false)[0]?.sha ?? "";

    const identical = invoke({
      commits: [...commits("s", 2, true), commitOf(tip, false)],
      config: UPSTREAM_CONFIG,
      upstreamCompare: { [tip]: "identical" },
    });
    expect(identical.status, identical.out).toBe(0);
    expect(identical.out).toContain("1 exempt");

    const behind = invoke({
      commits: [...commits("s", 2, true), commitOf(future, false)],
      config: UPSTREAM_CONFIG,
      upstreamCompare: { [future]: "behind" },
    });
    expect(behind.status).toBe(1);
    expect(behind.out).toContain(future);
    expect(behind.out).toContain("0 exempt");
  });

  it("exempts nothing when the upstream's default branch cannot be read", () => {
    // The ancestry question needs a head to ask it against. If that read fails there is no
    // question to ask, so nothing is exempt and the message says which of the four cases it
    // is rather than blaming a configuration that is present and well-formed.
    const unsigned = commits("c", 1, false)[0]?.sha ?? "";
    const run = invoke({
      commits: [...commits("s", 2, true), ...commits("c", 1, false)],
      config: UPSTREAM_CONFIG,
      upstreamDefaultBranch: null,
    });

    expect(run.status).toBe(1);
    expect(run.out).toContain(unsigned);
    expect(run.out).toContain("default branch could not be read");
    expect(run.out).toContain("every commit listed was checked");
    // Not one ancestry lookup was attempted against an unresolved branch.
    expect(run.calls.some((call) => call.includes("upstream/compare/"))).toBe(false);
  });

  it("fails naming the one upstream commit the configured upstream does not have", () => {
    const all = updateCommits();
    const unsigned = all.filter((entry) => !entry.commit.message.includes("Signed-off-by"));
    const missing = unsigned[5]?.sha ?? "";
    const run = invoke({
      commits: all,
      config: UPSTREAM_CONFIG,
      upstreamHas: unsigned.filter((entry) => entry.sha !== missing).map((entry) => entry.sha),
    });

    expect(run.status).toBe(1);
    expect(run.out).toContain(missing);
    expect(run.out).toContain("::error title=Missing DCO sign-off::");
    expect(run.summary).toContain(missing);
    expect(run.out).toContain("11 exempt");
    expect(run.out).toContain("1 unsigned");
    // The other eleven were exempt, so the failure names exactly the commit that earned it.
    const named = unsigned.filter((entry) => run.summary.includes(entry.sha));
    expect(named.map((entry) => entry.sha)).toEqual([missing]);
  });

  it("exempts nothing in a repository that configures no upstream lane", () => {
    // The canonical repository: no `.stamity/upstream.json` anywhere, so the exemption path is
    // dead and every commit has to carry the trailer. This is today's behaviour, kept.
    const unsigned = commits("c", 1, false)[0]?.sha ?? "";
    const run = invoke({ commits: [...commits("s", 4, true), ...commits("c", 1, false)] });

    expect(run.status).toBe(1);
    expect(run.out).toContain(unsigned);
    expect(run.out).toContain("No upstream lane configuration");
    expect(run.calls.some((call) => call.includes("example/upstream"))).toBe(false);
  });

  it("fails closed when the listing is shorter than the total the comparison reports", () => {
    const run = invoke({ commits: commits("s", 40, true), totalCommits: 41 });

    expect(run.status).toBe(1);
    expect(run.out).toContain("::error title=DCO check is incomplete::");
    expect(run.out).toContain("total_commits=41");
    expect(run.out).toContain("40");
    expect(run.out).not.toContain("carry a Signed-off-by trailer.");
  });

  it("fails closed when total_commits moves between two pages of the walk", () => {
    // M-A1b-1. The branch can be force-pushed WHILE the walk is running, and then the pages in
    // hand describe two different states spliced together — a commit present in the first
    // state and absent from the second is checked, one the other way round is never seen. The
    // job reconciles each page's total against the first page's, so the splice is caught
    // rather than reconciled away by a rows-versus-total count that happens to add up.
    const run = invoke({
      commits: commits("s", 150, true),
      totalCommits: 150,
      pageTotals: { 2: 151 },
    });

    expect(run.status).toBe(1);
    expect(run.out).toContain("::error title=DCO check could not run::");
    expect(run.out).toContain("total_commits moved from 150 to 151");
    expect(run.out).not.toContain("carry a Signed-off-by trailer.");
  });

  it("fails closed when a page mid-walk cannot be read", () => {
    // M-A1b-1. The first page answers and the second does not. A walk that broke out of the
    // loop on the error would hold 100 signed rows and call the pull request clean; the
    // unreadable page has to be the failure itself.
    const run = invoke({
      commits: [...commits("s", 100, true), ...commits("c", 50, false)],
      missingPage: 2,
    });

    expect(run.status).toBe(1);
    expect(run.out).toContain("::error title=DCO check could not run::");
    expect(run.out).toContain("Page 2 of the comparison");
    expect(run.out).toContain("never answered is not a pass");
  });

  it("fails closed when the comparison lists nothing at all", () => {
    const run = invoke({ commits: [], totalCommits: 0 });

    expect(run.status).toBe(1);
    expect(run.out).toContain("::error title=DCO check could not run::");
  });

  it("exempts nothing when the configured upstream is not on github.com", () => {
    // A GHES or GitLab upstream: the lookup this exemption rests on is a github.com API read,
    // so there is nothing to ask and no commit is exempt. The message says that rather than
    // leaving a fork to guess why its upstream commits were not waved through. The URL itself
    // is never echoed: a clone URL can carry credentials.
    const unsigned = commits("c", 1, false)[0]?.sha ?? "";
    const run = invoke({
      commits: [...commits("s", 2, true), ...commits("c", 1, false)],
      config: JSON.stringify({ version: 1, upstream: "https://git.example.invalid/team/fork" }),
    });

    expect(run.status).toBe(1);
    expect(run.out).toContain(unsigned);
    expect(run.out).toContain("not a github.com repository");
    expect(run.out).toContain("every commit listed was checked");
    expect(run.out).not.toContain("git.example.invalid");
    expect(run.calls.some((call) => call.includes("example/upstream"))).toBe(false);
  });

  it("passes a fully signed-off branch without reading the lane configuration at all", () => {
    const run = invoke({ commits: commits("s", 7, true) });

    expect(run.status, run.out).toBe(0);
    expect(run.out).toContain("7 signed off");
    expect(run.calls.some((call) => call.includes("contents/"))).toBe(false);
  });
});

// ── release.yml ──────────────────────────────────────────────────────────────

/** A `workflow_dispatch` context: a ref, and whatever the form supplied for `dry_run`. */
const dispatch = (ref: string, inputs: Readonly<Record<string, unknown>>): ExpressionContext => ({
  github: { event_name: "workflow_dispatch", ref },
  inputs,
});

const TAG_PUSH: ExpressionContext = {
  github: { event_name: "push", ref: "refs/tags/v1.2.3" },
};
const DISPATCH_DRY = dispatch("refs/heads/main", { dry_run: true });
const DISPATCH_REAL = dispatch("refs/heads/main", { dry_run: false });

/** Platform context, not package metadata, decides the public distribution destination. */
function repositoryContext(
  context: ExpressionContext,
  repository = "zomarit/stamity",
  privateValue: unknown = false,
): ExpressionContext {
  const github = context["github"] as Record<string, unknown> | undefined;
  const event = github?.["event"] as Record<string, unknown> | undefined;
  return {
    ...context,
    github: { ...github, repository, event: { ...event, repository: { private: privateValue } } },
  };
}

describe("canonical distribution destinations", () => {
  const jobs = [
    { label: "release gates", job: jobOf(release, "gates"), context: TAG_PUSH },
    // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): the
    // `apm-route` job left with the APM route, which 1.15.0 deletes, so its row goes.
    { label: "npm publication", job: jobOf(release, "publish"), context: TAG_PUSH },
    {
      label: "docs deployment",
      job: jobOf(docsSite, "deploy"),
      context: { github: { event_name: "workflow_dispatch" }, inputs: { deploy: true } },
    },
  ];

  for (const { label, job, context } of jobs) {
    it(`${label} runs only for an explicitly public canonical repository`, () => {
      const condition = job.if ?? "";
      expect(condition, "the destination must be checked before the job receives grants").not.toBe("");
      for (const [repository, privateValue, allowed] of [
        ["zomarit/stamity", false, true],
        ["acme/stamity", false, false],
        ["acme/stamity", true, false],
        ["zomarit/stamity", true, false],
        ["zomarit/stamity", null, false],
        ["zomarit/stamity", "", false],
      ] as const) {
        expect(
          evaluateWorkflowExpression(condition, repositoryContext(context, repository, privateValue)),
          `${repository} private=${String(privateValue)}`,
        ).toBe(allowed);
      }
      expect(evaluateWorkflowExpression(condition, context), "absent privacy is not public").toBe(false);
      const github = context["github"] as Record<string, unknown>;
      expect(
        evaluateWorkflowExpression(condition, { ...context, github: { ...github, repository: "zomarit/stamity" } }),
        "canonical identity with missing visibility must remain excluded",
      ).toBe(false);
    });
  }

  it.skipIf(process.platform === "win32")("the publication backstop refuses a private or different destination before networking", () => {
    // The actual Ubuntu step is plain bash and opens no socket, so execute it directly.
    const steps = stepsOf(release, "publish");
    const step = stepOf(steps, "Refuse a noncanonical publication destination");
    expect(step.env).toEqual({
      RELEASE_REPOSITORY: "${{ github.repository }}",
      RELEASE_REPOSITORY_PRIVATE: "${{ github.event.repository.private }}",
    });
    expect(indexOf(steps, step.name ?? "")).toBeLessThan(indexOf(steps, "Harden runner"));
    for (const [repository, privacy, status] of [
      ["zomarit/stamity", "false", 0],
      ["zomarit/stamity", "true", 1],
      ["zomarit/stamity", "", 1],
      ["acme/stamity", "false", 1],
      ["acme/stamity", "true", 1],
    ] as const) {
      const result = spawnSync("bash", ["-c", step.run ?? ""], {
        encoding: "utf8",
        env: { ...process.env, RELEASE_REPOSITORY: repository, RELEASE_REPOSITORY_PRIVATE: privacy },
      });
      expect(result.status, `${repository} private=${privacy}`).toBe(status);
      if (status !== 0) expect(result.stdout).toContain("separate private downstream release path");
    }
  });
});

/**
 * Every shape a run of this workflow can arrive in, and whether the publish job may start on it.
 *
 * The three interesting rows are the last three dispatch ones. `inputs.dry_run == false` — the
 * spelling this file used to carry — is TRUE for all of them, because GitHub casts operands of
 * differing types to numbers and null, '' and false all cast to 0. An input that went missing
 * would have published. The shipped condition compares strings through `format()`, so they fail
 * closed; the test below proves both halves of that rather than trusting the spelling.
 *
 * `a dispatch with dry_run false, from a feature branch` publishes HERE and still cannot ship:
 * the ref proofs live in the `gates` job this one needs, and they fail before the pack step. That
 * split is deliberate — the condition answers "was a real run requested", the gates job answers
 * "is this commit releasable" — and the executed-proof suite below is what holds up the second
 * half.
 */
const TRIGGER_SHAPES: readonly {
  readonly label: string;
  readonly context: ExpressionContext;
  readonly publishes: boolean;
}[] = [
  { label: "a v* tag push", context: TAG_PUSH, publishes: true },
  {
    label: "a push to a branch",
    context: { github: { event_name: "push", ref: "refs/heads/main" } },
    publishes: false,
  },
  {
    label: "a schedule",
    context: { github: { event_name: "schedule", ref: "refs/heads/main" } },
    publishes: false,
  },
  { label: "the default dispatch (dry_run true)", context: DISPATCH_DRY, publishes: false },
  { label: "a dispatch with dry_run false, from main", context: DISPATCH_REAL, publishes: true },
  {
    label: "a dispatch with dry_run false, from a v* tag",
    context: dispatch("refs/tags/v1.2.3", { dry_run: false }),
    publishes: true,
  },
  {
    label: "a dispatch with dry_run false, from a feature branch",
    context: dispatch("refs/heads/feature/x", { dry_run: false }),
    publishes: true,
  },
  {
    label: "a dispatch whose dry_run input went missing",
    context: dispatch("refs/heads/main", {}),
    publishes: false,
  },
  {
    label: "a dispatch whose dry_run input is empty",
    context: dispatch("refs/heads/main", { dry_run: "" }),
    publishes: false,
  },
  {
    label: "a dispatch with no inputs context at all",
    context: { github: { event_name: "workflow_dispatch", ref: "refs/heads/main" } },
    publishes: false,
  },
];

/** The dispatch rows, which are the ones `publish` and `dry-run-summary` split between them. */
const DISPATCH_SHAPES = TRIGGER_SHAPES.filter(
  (shape) =>
    (shape.context["github"] as { event_name?: string } | undefined)?.event_name ===
    "workflow_dispatch",
);

describe("release.yml — the only publishing path", () => {
  const gates = jobOf(release, "gates");
  const publish = jobOf(release, "publish");
  const gatesSteps = stepsOf(release, "gates");
  const publishSteps = stepsOf(release, "publish");

  it("splits gates from publish, and adds a rehearsal job that cannot ship", () => {
    // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): the
    // `apm-route` job left with the APM route, which 1.15.0 deletes, so the job list loses it and
    // `publish` needs `gates` alone. The split this case pins is unchanged: the job that runs
    // third-party code holds no credential, and the one that holds it needs the gates.
    expect(Object.keys(release.workflow.jobs)).toEqual([
      "gates",
      "publish",
      "dry-run-summary",
    ]);
    expect(publish.needs).toEqual(["gates"]);
    expect(jobOf(release, "dry-run-summary").needs).toBe("gates");
  });

  it("triggers on a v* tag and on a dispatch whose dry_run defaults to true", () => {
    expect(triggersOf(release.workflow).toSorted()).toEqual(["push", "workflow_dispatch"]);
    const on = release.workflow as unknown as Record<string, Record<string, unknown>>;
    expect((on["on"]?.["push"] as { tags?: string[] })?.tags).toEqual(["v*"]);
    const input = (
      on["on"]?.["workflow_dispatch"] as {
        inputs?: { dry_run?: { type?: string; default?: boolean } };
      }
    )?.inputs?.dry_run;
    // Default true is the safety property: a maintainer who dispatches without reading the form
    // gets a rehearsal, not a release.
    expect(input?.type).toBe("boolean");
    expect(input?.default).toBe(true);
  });

  it("keeps the OIDC token off every job that runs third-party code", () => {
    // The gates job builds, tests, lints and packs on the shipping commit. If it also held
    // id-token: write, a compromised devDependency could mint a trusted-publishing credential.
    expect(release.workflow.permissions).toEqual({ contents: "read" });
    expect(gates.permissions).toEqual({ contents: "read" });
    expect(Object.keys(gates.permissions ?? {})).not.toContain("id-token");

    // TEST CHANGE, justified: the publish job's grant set moved when it began attesting the
    // plugin archives, and it moves back now that it stops. TEST CHANGE, justified (2026-10-14, run
    // 2026-10-14_cli-native, unit d3-ci-qa): 1.15.0 deletes the plugin route, so no archive is
    // attested and `attestations: write` and `artifact-metadata: write`, which served only that
    // attestation, leave. `contents: write` stays for `gh release create`, and `id-token: write`
    // stays for npm's provenance over trusted publishing. The property this case pins is unchanged
    // and is asserted above: no job that runs third-party code holds any write grant.
    expect(publish.permissions).toEqual({
      contents: "write",
      "id-token": "write",
    });
    // The single approval point: environment protection rules are the platform-side control the
    // in-file ancestry probe cannot be.
    expect(publish.environment).toBe("npm-publish");
  });

  it("blocks egress on every job, from the first step, with an explicit allowlist", () => {
    // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): the
    // `apm-route` job left with the APM route, so two jobs are walked here; every assertion on
    // `gates` and `publish` is kept, and the twenty result accounts now hold on both of them.
    for (const [label, steps] of [
      ["gates", gatesSteps],
      ["publish", publishSteps],
    ] as const) {
      const harden = steps.find((step) => (step.uses ?? "").startsWith("step-security/harden-runner@"));
      expect(harden, `${label} must harden the runner`).toBeDefined();
      expect(harden?.with?.["egress-policy"], label).toBe("block");
      expect(harden?.with?.["disable-sudo"], label).toBe(true);
      expect(allowlistOf(steps), label).toContain("api.github.com:443");
      // Account roster replaces the old arbitrary-Azure wildcard. Every
      // currently documented result account is admitted, not one run's host.
      expect(allowlistOf(steps), label).not.toContain("*.blob.core.windows.net");
      for (let account = 0; account < 20; account += 1) {
        expect(allowlistOf(steps), label).toContain(`productionresultssa${account}.blob.core.windows.net:443`);
      }
    }

    // First step, before anything downloads or executes, in the job that runs third-party code.
    // `publish` is the documented exception: its dispatch backstop opens no socket and reads no
    // file, and stopping a run that should not have started comes before installing a monitor.
    expect(gatesSteps[0]?.name).toBe("Harden runner");

    // The gates job holds no token, so the OIDC and Sigstore hosts must not be reachable from it.
    const gatesAllow = allowlistOf(gatesSteps);
    expect(gatesAllow).toContain("registry.npmjs.org:443");
    expect(gatesAllow).not.toContain("token.actions.githubusercontent.com");
    expect(gatesAllow).not.toContain("sigstore.dev");
    // And no Python index is reachable from the job that packs the tarball: an interpreter's index
    // opened up in the job that builds the shipping artifact is the adjacency this split exists to
    // prevent.
    expect(gatesAllow).not.toContain("pypi.org");
    expect(gatesAllow).not.toContain("files.pythonhosted.org");
    expect(gatesAllow).not.toContain("raw.githubusercontent.com");

    // harden-runner fails CLOSED, so a host dropped from this list is a release that stops at the
    // step rather than a release that leaks.
    const publishAllow = allowlistOf(publishSteps);
    expect(publishAllow).toContain("registry.npmjs.org:443");
    expect(publishAllow).toContain("token.actions.githubusercontent.com:443");
    expect(publishAllow).toContain("fulcio.sigstore.dev:443");
    expect(publishAllow).toContain("uploads.github.com:443");

    // M5: the setup-python fallback host is listed only by a job that runs setup-python. TEST
    // CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): the one such job,
    // `release.yml:apm-route`, left with the APM route, so no job lists the host and none runs
    // setup-python; a host that came back would be an allowance nothing needs.
    const rawHosts = ALL_JOBS.filter(([, , job]) =>
      (job.steps ?? []).some((step) =>
        String(step.with?.["allowed-endpoints"] ?? "").includes("raw.githubusercontent.com"),
      ),
    ).map(([file, id]) => `${file}:${id}`);
    expect(rawHosts).toEqual([]);
    const pythonJobs = ALL_JOBS.filter(([, , job]) =>
      (job.steps ?? []).some((step) => (step.uses ?? "").startsWith("actions/setup-python@")),
    ).map(([file, id]) => `${file}:${id}`);
    expect(pythonJobs).toEqual([]);
  });

  it("runs the release proofs on every run that can publish, not only on a tag push", () => {
    expect(stepOf(gatesSteps, "Checkout").with?.["fetch-depth"]).toBe(0);
    const resolve = runOf(gatesSteps, "Resolve version");

    // The gate that decides whether the proofs run has to admit exactly what the publish
    // condition admits — a tag push, and a dispatch that set dry_run to false. The earlier
    // spelling keyed on the EVENT alone (`if [ "$GITHUB_EVENT_NAME" = "push" ]`), which left the
    // sanctioned real-publish dispatch arm with no ref proof at all.
    expect(resolve).toContain('[ "$GITHUB_EVENT_NAME" = "workflow_dispatch" ]');
    expect(resolve).toContain('[ "$DRY_RUN" = "false" ]');
    expect(resolve).toContain("REQUIRE_PROOFS");
    // The dispatch input reaches the shell through `env:`, never through an interpolation in the
    // body, and it is case-folded because GitHub's `==` is case-insensitive and `[ = ]` is not.
    expect(stepOf(gatesSteps, "Resolve version").env?.["DRY_RUN_INPUT"]).toBe(
      "${{ inputs.dry_run }}",
    );
    expect(resolve).toContain("tr '[:upper:]' '[:lower:]'");

    // Proof 1: a run that can publish comes from a v* tag.
    expect(resolve).toContain("refs/tags/v*)");
    // Proof 2: reachability from origin/main, resolved from the ref the depth-0 checkout already
    // fetched. A fresh `git fetch` here would have no credential — `persist-credentials: false`
    // strips the auth header — so the proof must not be made to depend on one.
    expect(resolve).toContain("git merge-base --is-ancestor");
    expect(resolve).toContain("refs/remotes/origin/main");
    expect(
      resolve.split("\n").filter((line) => line.trim().startsWith("git fetch")),
      "no un-credentialed fetch may run after checkout",
    ).toEqual([]);
    // Proof 3: the tag names the version package.json declares.
    expect(resolve).toContain('"$TAG_VERSION" != "$PKG_VERSION"');

    // A rehearsal skips all three and says which, rather than going quiet about it.
    expect(resolve).toContain("::notice title=Release rehearsal::");
    expect(resolve).toContain("proofs skipped");
    expect(release.source).toContain("the guard lives inside the artifact it guards");

    // Every proof runs before the pack step, which is the first irreversible-adjacent thing here.
    expect(indexOf(gatesSteps, "Resolve version")).toBeLessThan(
      indexOf(gatesSteps, "Pack tarball"),
    );
  });

  it("runs the whole ladder on the shipping commit, in order, before the pack boundary", () => {
    const pack = indexOf(gatesSteps, "Pack tarball");
    const ladder = [
      "Install",
      "Build",
      "Test",
      "Leak gate",
      "Dogfood check",
      "Tarball smoke (publish shape)",
    ];
    let previous = -1;
    for (const step of ladder) {
      const at = indexOf(gatesSteps, step);
      expect(at, `${step} must run in the gates job`).toBeGreaterThanOrEqual(0);
      expect(at, `${step} must precede the pack`).toBeLessThan(pack);
      expect(at, `${step} must follow the step before it in the ladder`).toBeGreaterThan(previous);
      previous = at;
    }
    expect(runOf(gatesSteps, "Leak gate")).toBe("npm run gate");
    expect(runOf(gatesSteps, "Tarball smoke (publish shape)")).toBe("node scripts/tarball-smoke.mjs");

    // The interpreter stays out of this job. `python`, `pip` and a venv in the job that builds and
    // packs the shipping tarball is an adjacency the release does not need.
    const gatesShell = gatesSteps.map((step) => step.run ?? "").join("\n");
    expect(gatesShell).not.toContain("apm-install-smoke");
    expect(gatesShell).not.toMatch(/\bpython\b|\bpip\b/);
    expect(indexOf(gatesSteps, "Set up Python"), "no release job runs setup-python").toBe(-1);
  });

  // ADDED by run 2026-10-13_records-branch, unit r5-ci-records-job (2026-10-14; REQ-PROVE-025): the
  // release gates restore the records from the `origin/records` ref the depth-0 checkout already
  // fetched, and run the records suite beside `npm test`. No fetch: after checkout there is no
  // credential to fetch with, and the resolve step's proof rests on the same refs.
  it("restores the records after the install and runs the records suite after the tests, with no fetch", () => {
    expect(stepOf(gatesSteps, "Checkout").with?.["fetch-depth"]).toBe(0);
    const restore = stepOf(gatesSteps, "Restore the records");
    // TEST CHANGE, justified (run 2026-10-13_records-branch, ledger pr/4, the maintainer's decision "Log the sha
    // now, pin at 1.15.0"): the step was one command; it now also prints the records commit it restored, so the
    // run's log names the evidence a release was gated on. The restore command itself is unchanged.
    // TEST CHANGE, justified (run 2026-10-13_records-branch, ledger pr/5): both commands spell the ref in full, since
    // the depth-0 checkout fetches every tag and a tag named `origin/records` would shadow the short name; the log
    // line keeps the short name.
    // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit r1-release-machinery; REQ-PROVE-023, inbox
    // close/1): a v* tag run no longer restores the branch as it stands when the run starts; it restores the commit
    // the tag's `records:` line pins, read in the shell and refused unless it is 40 lower-case hexadecimal characters.
    // A rehearsal on a branch has no tag and keeps the branch restore. Both keep `--no-fetch --force`; the step's
    // control flow is executed against scratch tags in "release.yml — the records pin, executed" below.
    const run = restore.run ?? "";
    expect(run).toContain("git tag -l --format='%(contents)' \"$TAG\"");
    expect(run).toContain("^[0-9a-f]{40}$");
    expect(run).toContain('node scripts/records.mjs restore --ref "$RECORDS_SHA" --no-fetch --force');
    expect(run).toContain("node scripts/records.mjs restore --ref refs/remotes/origin/records --no-fetch --force");
    expect(run).toContain("refs/tags/v*)");
    expect(
      run.split("\n").filter((line) => line.includes("scripts/records.mjs restore")).every((line) => line.includes("--no-fetch --force")),
      "every restore keeps --no-fetch --force",
    ).toBe(true);
    expect(run, "the step reads no short `origin/records` ref").not.toMatch(/(?<![/\w])origin\/records/);
    expect(restore.run, "a `${{ }}` value inside a run: is a template injection").not.toContain("${{");
    expect(runOf(gatesSteps, "Records suite")).toBe("npm run test:records");
    expect(indexOf(gatesSteps, "Restore the records")).toBe(indexOf(gatesSteps, "Install") + 1);
    expect(indexOf(gatesSteps, "Records suite")).toBe(indexOf(gatesSteps, "Test") + 1);
    expect(indexOf(gatesSteps, "Records suite")).toBeLessThan(indexOf(gatesSteps, "Pack tarball"));
    for (const name of ["Restore the records", "Records suite"]) {
      const step = stepOf(gatesSteps, name);
      expect(step.if, name).toBeUndefined();
      expect(step["continue-on-error"], name).toBeUndefined();
      expect(step.env, name).toBeUndefined();
    }
    expect(
      gatesSteps.flatMap((step) => (step.run ?? "").split("\n")).filter((line) => /^\s*git fetch\b/.test(line)),
      "the gates job fetches nothing after its checkout",
    ).toEqual([]);
  });

  // REMOVED (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): "proves the published ROUTE in
  // a job with no credential and no path to the artifact", the `apm-route` job's case. The job left
  // with the APM route, which 1.15.0 deletes.

  it("hands the publish job a digest on a channel the artifact does not carry", () => {
    // A digest read from the same artifact it verifies is circular: the artifact attests itself.
    expect(gates.outputs?.["tarball_sha256"]).toBe("${{ steps.pack.outputs.tarball_sha256 }}");
    const verify = runOf(publishSteps, "Verify tarball digest");
    expect(stepOf(publishSteps, "Verify tarball digest").env?.["EXPECTED_SHA"]).toBe(
      "${{ needs.gates.outputs.tarball_sha256 }}",
    );
    // An empty expected value must fail closed: a missing output cannot read as a match.
    expect(verify).toContain('[ -z "$EXPECTED_SHA" ]');
    expect(verify).toContain("Refusing to publish");
    expect(indexOf(publishSteps, "Verify tarball digest")).toBeLessThan(
      indexOf(publishSteps, "Publish to npm with provenance"),
    );
  });

  it("keeps the release artifact alive across a human approval, not just across the run", () => {
    // `publish` sits behind the `npm-publish` environment's required-reviewer gate, so this
    // artifact has to outlive a HUMAN approval rather than the run that produced it. At
    // `retention-days: 1` it did not: a v1.0.0 publish failed on 2026-08-30 when the approval
    // landed after the artifact had expired and `Download release artifacts` had nothing to
    // fetch. Seven days covers a reviewer who approves the next working day, or over a weekend.
    // Pinned as a number, because a value that drifts back down fails the release LATE — in the
    // publish job, after the gates are green and the tag is already pushed.
    const upload = stepOf(gatesSteps, "Upload release artifacts");
    expect(upload.with?.["name"]).toBe("release-dist");
    expect(upload.with?.["retention-days"]).toBe(7);
    // The consumer the retention exists for, named here so a rename on either side cannot
    // orphan the download while both steps still read as present.
    expect(stepOf(publishSteps, "Download release artifacts").with?.["name"]).toBe("release-dist");
  });

  it("generates the SBOM best-effort and records which way it went", () => {
    const sbom = runOf(gatesSteps, "Generate SBOM (CycloneDX)");
    expect(sbom).toContain("npm sbom --sbom-format cyclonedx --package-lock-only");
    // A missing SBOM is visible on the run and in the release body; it never quietly reads green.
    expect(sbom).toContain("sbom_present=false");
    expect(sbom).toContain("::warning title=SBOM not generated::");
    expect(gates.outputs?.["sbom_present"]).toBe("${{ steps.sbom.outputs.sbom_present }}");
  });

  it("publishes over OIDC with no stored credential, and asserts the npm floor", () => {
    const upgrade = runOf(publishSteps, "Upgrade npm for trusted publishing");
    expect(upgrade).toMatch(/npm install -g npm@\d+\.\d+\.\d+ # pinned exact/);
    // Upgrading is not the same as clearing the floor; assert the version the upgrade produced.
    expect(upgrade).toContain("11.5.1");
    const step = stepOf(publishSteps, "Publish to npm with provenance");
    expect(step.run).toBe('npm publish "./$TARBALL" --provenance --access public');
    // No token env anywhere in the publish job: authentication is the OIDC token this job mints.
    for (const publishStep of publishSteps) {
      expect(Object.keys(publishStep.env ?? {}), publishStep.name).not.toContain("NODE_AUTH_TOKEN");
      expect(Object.keys(publishStep.env ?? {}), publishStep.name).not.toContain("NPM_TOKEN");
    }
    // The trusted-publisher entry on npmjs.com is the piece no file in this repository can
    // create, so the file has to say where it lives or the first release fails on an
    // authentication error nobody can place.
    expect(release.source.toLowerCase()).toContain("one-time maintainer setup");
  });

  it("attaches the tarball and the SBOM to a GitHub release, on the commit that was gated", () => {
    const create = runOf(publishSteps, "Create GitHub release");
    expect(create).toContain("gh release create");
    expect(create).toContain("--notes-file release-notes.md");
    expect(create).toContain("sbom.cdx.json");
    // Without these two, `gh release create` CREATES a missing tag on the default branch's head
    // — so the release could name a commit that is not the one the tarball was built from.
    // Both publish arms now require a tag that already exists, so aborting is the right answer.
    expect(create).toContain("--verify-tag");
    expect(create).toContain('--target "$GITHUB_SHA"');
    expect(indexOf(publishSteps, "Create GitHub release")).toBeGreaterThan(
      indexOf(publishSteps, "Publish to npm with provenance"),
    );
  });


  // REMOVED (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): nine cases on the plugin
  // distribution the release built in `gates` and published from `publish` (the runtime and
  // distribution builds, the upload, the digest verification, the archive attestation, the orphan
  // branch push, the manifest stamp, the release assets and the egress page's rows for them). The
  // distribution left with the plugin route, which 1.15.0 deletes; the `plugin-dist` branch and its
  // `plugins/v*` tags stay as frozen history and no workflow writes them again. The two cases below
  // hold what the deletion must not open.

  // ADDED (unit d3-ci-qa; the unit's threat: a removed step leaves a job that publishes without the
  // digest check). Every step of the publish job that ships or attaches a byte runs after the
  // tarball's digest is verified against the gates job's output, and the job needs the gates job.
  it("publishes nothing before the tarball's digest is verified against the gates output", () => {
    expect(publish.needs).toEqual(["gates"]);
    const verify = indexOf(publishSteps, "Verify tarball digest");
    expect(verify).toBeGreaterThan(indexOf(publishSteps, "Download release artifacts"));
    const shipping = publishSteps
      .map((step, at) => ({ step, at }))
      .filter(({ step }) => /\bnpm publish\b|\bgh release\b|\bgit push\b/.test(step.run ?? "") || (step.uses ?? "").startsWith("actions/attest-"));
    expect(shipping.map(({ step }) => step.name)).toEqual(["Publish to npm with provenance", "Create GitHub release"]);
    for (const { step, at } of shipping) {
      expect(at, `${step.name ?? "?"} must follow the digest check`).toBeGreaterThan(verify);
    }
    // The only artifact the job downloads is the one whose digest it verifies.
    const downloads = publishSteps.filter((step) => (step.uses ?? "").startsWith("actions/download-artifact@"));
    expect(downloads.map((step) => step.with?.["name"])).toEqual(["release-dist"]);
  });

  // ADDED (unit d3-ci-qa): the Sigstore hosts stay, because npm's provenance needs them, and the
  // egress page says so now that it no longer has the plugin attestation to name.
  it("keeps the provenance hosts on the publish job, and the egress page names no deleted route", () => {
    const page = readFileSync(join(REPO_ROOT, ".github", "release-egress.md"), "utf8");
    const publishAllow = allowlistOf(publishSteps);
    for (const host of [
      "token.actions.githubusercontent.com",
      "fulcio.sigstore.dev",
      "rekor.sigstore.dev",
      "tuf-repo-cdn.sigstore.dev",
    ]) {
      expect(publishAllow, `the publish job must reach ${host}`).toContain(`${host}:443`);
      expect(page, `release-egress.md must name ${host}`).toContain(host);
    }
    expect(page).toContain("npm publish");
    expect(page, "release-egress.md still lists the deleted apm-route job").not.toContain("apm-route");
    expect(page, "release-egress.md still lists a plugin step").not.toMatch(/plugin (archives|distribution)/i);
    expect(
      publishSteps.find((step) => (step.uses ?? "").startsWith("step-security/harden-runner@"))?.with?.["egress-policy"],
    ).toBe("block");
  });

  // ADDED (plan 022, unit a11-release-workflows, REQ-PROVE-045): GitHub moves `ubuntu-latest` from
  // 24.04 to 26.04 between 2026-10-19 and 2026-11-19, and the blocked-egress allowlists were
  // measured on 24.04. An image that moves under a release turns the blocked egress red at the
  // worst moment, so the release and signing-rehearsal jobs pin the measured image, and the egress
  // page and each file's header say so. A move comes after the allowlist is measured again.
  it("pins every release and signing-rehearsal job to the image the egress allowlists were measured on", () => {
    const page = readFileSync(join(REPO_ROOT, ".github", "release-egress.md"), "utf8");
    expect(page).toContain("ubuntu-24.04");
    for (const file of ["release.yml", "pack-signing-rehearsal.yml"]) {
      const loaded = workflowNamed(file);
      const jobs = Object.entries(loaded.workflow.jobs);
      expect(jobs.length, file).toBeGreaterThanOrEqual(3);
      for (const [id, job] of jobs) expect(job["runs-on"], `${file}:${id}`).toBe("ubuntu-24.04");
      const header = loaded.source.slice(0, loaded.source.indexOf("\nname:"));
      expect(header, file).toContain("ubuntu-24.04");
      expect(header, file).toContain("26.04");
    }
  });

  describe("a dry run cannot publish", () => {
    /** The condition this file must carry, character for character. */
    const PUBLISH_CONDITION =
      // The downstream contract adds a platform destination guard; trigger semantics stay
      // unchanged for canonical contexts, which the existing table now supplies explicitly.
      "github.repository == 'zomarit/stamity' && format('{0}', github.event.repository.private) == 'false' && " +
      "((github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')) || " +
      "(github.event_name == 'workflow_dispatch' && format('{0}', inputs.dry_run) == 'false'))";

    const condition = (publish.if ?? "").replace(/\s+/g, " ").trim();

    it("pins the publish condition exactly, string compare and all", () => {
      expect(condition, "the publish job must be conditional").not.toBe("");
      expect(condition).toBe(PUBLISH_CONDITION);
    });

    it("admits a tag push and an explicit dry_run=false, and nothing else", () => {
      for (const shape of TRIGGER_SHAPES) {
        expect(evaluateWorkflowExpression(condition, repositoryContext(shape.context)), shape.label).toBe(
          shape.publishes,
        );
      }
      // Regex-rot guard on the table itself: it has to contain both answers, or a condition that
      // returned a constant would satisfy every row.
      expect(TRIGGER_SHAPES.some((shape) => shape.publishes)).toBe(true);
      expect(TRIGGER_SHAPES.some((shape) => !shape.publishes)).toBe(true);
    });

    it("fails closed exactly where the number cast would have failed open", () => {
      // The falsifiable half: the loose spelling PUBLISHES on all three of these, so a revert to
      // it fails here rather than passing quietly. GitHub casts across types, and null, '' and
      // false all reach 0 — which makes an input that went missing indistinguishable from one a
      // human set to false.
      const loose =
        "(github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')) || " +
        "(github.event_name == 'workflow_dispatch' && inputs.dry_run == false)";
      const failOpen = [
        "a dispatch whose dry_run input went missing",
        "a dispatch whose dry_run input is empty",
        "a dispatch with no inputs context at all",
      ];
      for (const label of failOpen) {
        const shape = TRIGGER_SHAPES.find((row) => row.label === label);
        expect(shape, label).toBeDefined();
        const context = (shape as { context: ExpressionContext }).context;
        expect(evaluateWorkflowExpression(loose, context), `${label}, loose spelling`).toBe(true);
        expect(evaluateWorkflowExpression(condition, context), `${label}, shipped`).toBe(false);
      }
    });

    it("re-asserts the same fact inside the job, so one widened condition is not enough", () => {
      const refuse = stepOf(publishSteps, "Refuse a dispatch that is not a confirmed real run");
      expect(publishSteps[0]).toBe(refuse);
      expect(refuse.run).toContain("exit 1");
      // It refuses every dispatch that did not confirm a real run — including the two fail-open
      // shapes — and never fires on a tag push, where there is no input to confirm.
      for (const shape of DISPATCH_SHAPES) {
        expect(evaluateWorkflowExpression(refuse.if ?? "", shape.context), shape.label).toBe(
          !shape.publishes,
        );
      }
      expect(evaluateWorkflowExpression(refuse.if ?? "", TAG_PUSH)).toBe(false);
    });

    it("reports the rehearsal instead, and on exactly the dispatches that do not publish", () => {
      const summary = jobOf(release, "dry-run-summary");
      const summaryCondition = summary.if ?? "";

      // The two conditions are complements over dispatches: exactly one of the two jobs runs,
      // whatever the input is. The gap the earlier `inputs.dry_run == true` left was a dispatch
      // that published nothing AND reported nothing.
      for (const shape of DISPATCH_SHAPES) {
        const publishes = evaluateWorkflowExpression(condition, repositoryContext(shape.context));
        const reports = evaluateWorkflowExpression(summaryCondition, shape.context);
        expect(publishes !== reports, `${shape.label}: exactly one of publish/report`).toBe(true);
        expect(reports, shape.label).toBe(!shape.publishes);
      }
      expect(evaluateWorkflowExpression(summaryCondition, TAG_PUSH)).toBe(false);

      // A rehearsal is only useful if it names what a real run would have shipped.
      //
      // TEST CHANGE, justified: the release now also publishes a plugin distribution — an orphan
      // branch, a tag and four archives — so the rehearsal has three more facts to name or it
      // under-reports what a real run does. TEST CHANGE, justified (2026-10-14, run
      // 2026-10-14_cli-native, unit d3-ci-qa): 1.15.0 deletes the plugin route, so the release no
      // longer publishes that distribution and the three facts leave; a rehearsal that named them
      // would report a branch and archives a real run does not ship. The five npm facts stay.
      const report = summary.steps.map((step) => step.run ?? "").join("\n");
      for (const field of [
        "PACKAGE_NAME",
        "VERSION",
        "TARBALL",
        "TARBALL_SHA256",
        "SBOM_PRESENT",
      ]) {
        expect(report, `the summary must report ${field}`).toContain(field);
        expect(summary.steps[0]?.env?.[field], `${field} must come from the gates job`).toMatch(/^\$\{\{ needs\.gates\.outputs\.\w+ \}\}$/);
      }
      expect(report, "the summary still reports the deleted distribution").not.toMatch(/PLUGINS_|plugin/i);
      expect(Object.keys(gates.outputs ?? {}).filter((key) => key.startsWith("plugins_"))).toEqual([]);
      expect(summary.permissions).toEqual({});
    });
  });
});


// ── release.yml: the proofs, executed ────────────────────────────────────────

/**
 * The `Resolve version` step, RUN, against scratch repositories shaped like the one the release
 * checkout produces.
 *
 * Why running it rather than reading it. Every other assertion about this step is a substring
 * match, and a substring match cannot tell a proof that guards the publish arms from a proof that
 * sits in a branch none of them reach — which is exactly the defect this pass closed: the ancestry
 * and tag-version checks were real, correct, and behind `if [ "$GITHUB_EVENT_NAME" = "push" ]`
 * while a dispatch was a sanctioned publish arm. The failure was in the CONTROL FLOW, and the
 * control flow is what executing it tests.
 *
 * Not run on Windows: the step is a bash script that GitHub runs on ubuntu, and a Git-for-Windows
 * bash is a different interpreter than the one under test.
 */
const WINDOWS = process.platform === "win32";

/** git, with the two signing settings a maintainer's global config might otherwise impose. */
function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

describe.skipIf(WINDOWS)("release.yml — the release proofs, executed", () => {
  const root = mkdtempSync(join(tmpdir(), "stamity-release-proof-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const RESOLVE = runOf(stepsOf(release, "gates"), "Resolve version");

  /**
   * A repository the proof can be run against: a `main` history at version 1.0.0, the
   * remote-tracking ref a `fetch-depth: 0` checkout creates, a matching tag, a tag naming another
   * version, and a tag on a commit that never reached `main`.
   */
  function buildRepo(dir: string, options: { readonly originMain: boolean }): string {
    mkdirSync(dir, { recursive: true });
    git(dir, "init", "-q", "-b", "main");
    git(dir, "config", "user.email", "ci@example.invalid");
    git(dir, "config", "user.name", "CI");
    writeFileSync(
      join(dir, "package.json"),
      `${JSON.stringify({ name: "pkg", version: "1.0.0" }, null, 2)}\n`,
    );
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "root");
    if (options.originMain) git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
    git(dir, "tag", "v1.0.0");
    git(dir, "tag", "v0.0.1");
    git(dir, "checkout", "-q", "-b", "side");
    git(dir, "commit", "-q", "--allow-empty", "-m", "never merged");
    git(dir, "tag", "v2.0.0");
    git(dir, "checkout", "-q", "main");
    return dir;
  }

  const repos = new Map<string, string>();

  /** Built on first use, so nothing runs at collection time on a platform that skips this. */
  function repo(originMain: boolean): string {
    const key = originMain ? "with-origin-main" : "without-origin-main";
    const existing = repos.get(key);
    if (existing !== undefined) return existing;
    const dir = buildRepo(join(root, key), { originMain });
    repos.set(key, dir);
    return dir;
  }

  interface ResolveRun {
    readonly status: number | null;
    readonly out: string;
    readonly stepOutput: string;
  }

  function resolve(
    eventName: string,
    ref: string,
    dryRunInput: string,
    options: { readonly originMain?: boolean } = {},
  ): ResolveRun {
    const cwd = repo(options.originMain ?? true);
    const outputPath = join(cwd, "step-output");
    writeFileSync(outputPath, "");
    const result = spawnSync("bash", ["-c", RESOLVE], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        // The step calls `node` by name; the runner has it on PATH and so must this child.
        PATH: `${dirname(process.execPath)}${delimiter}${process.env["PATH"] ?? ""}`,
        GITHUB_EVENT_NAME: eventName,
        GITHUB_REF: ref,
        GITHUB_OUTPUT: outputPath,
        DRY_RUN_INPUT: dryRunInput,
      },
    });
    return {
      status: result.status,
      out: `${result.stdout}${result.stderr}`,
      stepOutput: readFileSync(outputPath, "utf8"),
    };
  }

  it("passes a tag push whose tag matches the declared version and is an ancestor of main", () => {
    const run = resolve("push", "refs/tags/v1.0.0", "");

    expect(run.status, run.out).toBe(0);
    expect(run.out).toContain("Tag ancestry verified");
    expect(run.stepOutput).toContain("version=1.0.0");
    expect(run.stepOutput).toContain("package_name=pkg");
  });

  it("fails a tag push whose tag names a version package.json does not declare", () => {
    const run = resolve("push", "refs/tags/v0.0.1", "");

    expect(run.status).toBe(1);
    expect(run.out).toContain("does not match package.json version");
  });

  it("holds a real-publish DISPATCH to the same proofs: a branch has no tag to prove", () => {
    // The defect this suite exists for. The publish condition admits this run; the gates job is
    // what stops it, before the pack step, with a message that says what to do instead.
    const run = resolve("workflow_dispatch", "refs/heads/main", "false");

    expect(run.status).toBe(1);
    expect(run.out).toContain("must come from a v* tag");
    expect(run.stepOutput).toBe("");
  });

  it("passes a real-publish dispatch made from the matching tag", () => {
    const run = resolve("workflow_dispatch", "refs/tags/v1.0.0", "false");

    expect(run.status, run.out).toBe(0);
    expect(run.out).toContain("Tag ancestry verified");
    expect(run.stepOutput).toContain("version=1.0.0");
  });

  it("fails a real-publish dispatch from a tag on a commit that never reached main", () => {
    const run = resolve("workflow_dispatch", "refs/tags/v2.0.0", "false");

    expect(run.status).toBe(1);
    expect(run.out).toContain("not an ancestor of origin/main");
  });

  it("case-folds the input, so the shell gate admits what the publish condition admits", () => {
    // GitHub's `==` is case-insensitive on strings, so `format('{0}', inputs.dry_run) == 'false'`
    // is TRUE for 'FALSE'. Without the fold, the shell would read 'FALSE' as "not false", skip
    // every proof, and hand an unproven commit to a job that publishes it.
    const run = resolve("workflow_dispatch", "refs/heads/main", "FALSE");

    expect(run.status).toBe(1);
    expect(run.out).toContain("must come from a v* tag");
  });

  it("rehearses from any ref, and prints the three proofs it skipped and why", () => {
    const run = resolve("workflow_dispatch", "refs/heads/feature/x", "true");

    expect(run.status, run.out).toBe(0);
    expect(run.stepOutput).toContain("version=1.0.0");
    expect(run.out).toContain("proofs skipped");
    expect(run.out).toContain("v* tag");
    expect(run.out).toContain("v1.0.0");
    expect(run.out).toContain("ancestor of origin/main");
    // Nothing about the rehearsal reads as a proof that passed.
    expect(run.out).not.toContain("Tag ancestry verified");
  });

  it("refuses to release when the ancestry ref the checkout should have fetched is missing", () => {
    // A missing ref means the checkout configuration changed under the step. Skipping the
    // ancestry proof in that case would be the quiet failure this branch exists to refuse.
    const run = resolve("push", "refs/tags/v1.0.0", "", { originMain: false });

    expect(run.status).toBe(1);
    expect(run.out).toContain("refs/remotes/origin/main is not present");
  });
});

// ── release.yml: the records pin, executed ───────────────────────────────────

/**
 * ADDED (2026-10-14, run 2026-10-14_cli-native, unit r1-release-machinery; REQ-PROVE-023, inbox close/1, pr/9, pr/10).
 * The `Restore the records` step, RUN, against scratch repositories holding annotated and lightweight
 * tags. A v* tag run restores exactly the records commit its tag's `records:` line pins, read in the
 * shell; a line that is absent, doubled, or anything but 40 lower-case hexadecimal characters stops
 * the step before any command runs, shell text in it included. A rehearsal on a branch restores the
 * records branch by its full ref. Not run on Windows, for the reason the suite above gives.
 */
describe.skipIf(WINDOWS)("release.yml — the records pin, executed", () => {
  const root = mkdtempSync(join(tmpdir(), "stamity-release-records-pin-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const RESTORE = runOf(stepsOf(release, "gates"), "Restore the records");
  const CALLS = "restore-calls.jsonl";
  const PWNED = "pwned";

  interface PinRepo {
    readonly dir: string;
    /** The records commit a cut recorded. */
    readonly pinned: string;
    /** The records branch's tip when the run starts: a later publish moved it past the pinned commit. */
    readonly tip: string;
  }

  let built: PinRepo | undefined;

  /**
   * A checkout shaped like the release's: `main`, and the records branch's history under
   * `refs/remotes/origin/records`, its tip one publish past the commit the cut pinned. `scripts/records.mjs`
   * here is a stand-in that writes the arguments it was handed and nothing else. Stubbed because the
   * subject is the shell around it, what it reads from the tag, what it refuses and the argv it passes;
   * the real `restore --ref <sha> --no-fetch --force`, a pinned commit holding a non-record path refused
   * included, runs in test/ci/recordsScript.test.ts against a records-branch world this repository cannot cheaply build here.
   */
  function pinRepo(): PinRepo {
    if (built !== undefined) return built;
    const dir = join(root, "checkout");
    mkdirSync(join(dir, "scripts"), { recursive: true });
    git(dir, "init", "-q", "-b", "main");
    git(dir, "config", "user.email", "ci@example.invalid");
    git(dir, "config", "user.name", "CI");
    writeFileSync(
      join(dir, "scripts", "records.mjs"),
      "import { appendFileSync } from 'node:fs'\nappendFileSync('restore-calls.jsonl', `${JSON.stringify(process.argv.slice(2))}\\n`)\n",
    );
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "root");
    git(dir, "checkout", "-q", "--orphan", "records");
    git(dir, "commit", "-q", "--allow-empty", "-m", "records at the cut");
    const pinned = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    git(dir, "commit", "-q", "--allow-empty", "-m", "records published after the cut");
    const tip = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    git(dir, "update-ref", "refs/remotes/origin/records", tip);
    git(dir, "checkout", "-q", "main");
    git(dir, "branch", "-q", "-D", "records");
    // A tag named `origin/records` on main's commit: a step that spelled the short name would read it.
    git(dir, "tag", "origin/records", "main");
    built = { dir, pinned, tip };
    return built;
  }

  /** An annotated tag carrying `message`, or a lightweight one on a commit whose message it is. */
  function tag(name: string, message: string, options: { readonly lightweight?: boolean } = {}): void {
    const { dir } = pinRepo();
    if (options.lightweight === true) {
      git(dir, "commit", "-q", "--allow-empty", "-m", message);
      git(dir, "tag", name);
      git(dir, "reset", "-q", "--hard", "HEAD~1");
    } else {
      git(dir, "tag", "-a", name, "-m", message);
    }
  }

  interface RestoreRun {
    readonly status: number | null;
    readonly out: string;
    readonly calls: readonly (readonly string[])[];
    readonly pwned: boolean;
  }

  function restore(ref: string): RestoreRun {
    const { dir } = pinRepo();
    rmSync(join(dir, CALLS), { force: true });
    rmSync(join(dir, PWNED), { force: true });
    const result = spawnSync("bash", ["-c", RESTORE], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        // The step calls `node` by name; the runner has it on PATH and so must this child.
        PATH: `${dirname(process.execPath)}${delimiter}${process.env["PATH"] ?? ""}`,
        GITHUB_REF: ref,
      },
    });
    const calls = existsSync(join(dir, CALLS))
      ? readFileSync(join(dir, CALLS), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as string[])
      : [];
    return { status: result.status, out: `${result.stdout}${result.stderr}`, calls, pwned: existsSync(join(dir, PWNED)) };
  }

  it("restores exactly the commit the tag pins, not the branch tip the run finds, keeping --no-fetch --force", () => {
    const { pinned, tip } = pinRepo();
    expect(pinned).not.toBe(tip);
    tag("v1.0.0", `1.0.0\n\nrecords: ${pinned}`);
    const run = restore("refs/tags/v1.0.0");

    expect(run.status, run.out).toBe(0);
    expect(run.calls).toEqual([["restore", "--ref", pinned, "--no-fetch", "--force"]]);
    expect(run.out).toContain(`Restored the records commit ${pinned}`);
    expect(run.out).not.toContain(tip);
  });

  it("refuses a tag whose message carries no records: line, before restoring anything", () => {
    tag("v1.0.1", "1.0.1");
    const run = restore("refs/tags/v1.0.1");

    expect(run.status).toBe(1);
    expect(run.out).toContain("records:");
    expect(run.calls).toEqual([]);
  });

  it("refuses a tag carrying two records: lines rather than choosing one", () => {
    const { pinned, tip } = pinRepo();
    tag("v1.0.2", `1.0.2\n\nrecords: ${pinned}\nrecords: ${tip}`);
    const run = restore("refs/tags/v1.0.2");

    expect(run.status).toBe(1);
    expect(run.calls).toEqual([]);
  });

  it("refuses a lightweight tag, whose contents are its commit's message, even one naming a well-formed commit", () => {
    const { pinned } = pinRepo();
    tag("v1.0.3", `1.0.3\n\nrecords: ${pinned}`, { lightweight: true });
    const run = restore("refs/tags/v1.0.3");

    expect(run.status).toBe(1);
    expect(run.out).toContain("not an annotated tag");
    expect(run.calls).toEqual([]);
  });

  it.each([
    ["upper-case hexadecimal", (sha: string) => sha.toUpperCase()],
    ["39 characters", (sha: string) => sha.slice(1)],
    ["41 characters", (sha: string) => `${sha}0`],
    ["no space after the colon", (sha: string) => `:${sha}`],
    ["a command substitution", () => `$(touch ${PWNED})`],
    ["a well-formed commit followed by a command", (sha: string) => `${sha}; touch ${PWNED}`],
    ["a well-formed commit with a backtick command after it", (sha: string) => `${sha}\`touch ${PWNED}\``],
  ])("refuses a records: value that is %s, running nothing it carries", (label, value) => {
    const { pinned } = pinRepo();
    const name = `v2.0.${label.length}-${label.replace(/[^a-z0-9]+/gi, "-")}`;
    const raw = value(pinned);
    tag(name, `2.0.0\n\n${raw.startsWith(":") ? `records${raw}` : `records: ${raw}`}`);
    const run = restore(`refs/tags/${name}`);

    expect(run.status, run.out).toBe(1);
    expect(run.out).toContain("40 lower-case hexadecimal characters");
    expect(run.calls).toEqual([]);
    expect(run.pwned, "shell text in the tag message ran").toBe(false);
    // The refused value is never printed back, so a line in it cannot reach the runner as a workflow command.
    expect(run.out).not.toContain(raw);
  });

  it("restores the records branch by its full ref on a rehearsal from a branch, which has no tag to pin it", () => {
    const { tip } = pinRepo();
    const run = restore("refs/heads/feature/x");

    expect(run.status, run.out).toBe(0);
    expect(run.calls).toEqual([["restore", "--ref", "refs/remotes/origin/records", "--no-fetch", "--force"]]);
    // The `origin/records` tag on main's commit stands in for nothing: the commit printed is the branch's.
    expect(run.out).toContain(`Restored the records commit ${tip}`);
  });
});

// ── release-controls-checklist.md: the cut writes the pin ────────────────────

/**
 * ADDED (2026-10-14, run 2026-10-14_cli-native, unit r1-release-machinery; REQ-PROVE-023, inbox pr/9, pr/10). The
 * release restores what the tag's `records:` line names, so the checklist's cut writes that line, and every git
 * command the checklist prints names the records branch by its full ref, since a tag named `origin/records` wins
 * the short name's lookup.
 */
describe("release-controls-checklist.md — the cut pins the records", () => {
  const checklist = readFileSync(join(REPO_ROOT, ".github", "release-controls-checklist.md"), "utf8");

  it("writes the records commit into the annotated tag as records: <sha>, read from the full ref", () => {
    expect(checklist).toContain("git rev-parse --verify 'refs/remotes/origin/records^{commit}'");
    expect(checklist).toMatch(/git tag -a vX\.Y\.Z -m "X\.Y\.Z" -m "records: \$records_sha"/);
    expect(checklist).toContain("Restore the records");
  });

  it("spells no short origin/records ref in a command", () => {
    const commands = [
      ...[...checklist.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] ?? ""),
      ...[...checklist.matchAll(/```sh\n([\s\S]*?)```/g)].flatMap((match) => (match[1] ?? "").split("\n")),
    ].filter((text) => /\bgit\b/.test(text));
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.filter((text) => /(?<![/\w])origin\/records/.test(text))).toEqual([]);
  });

  // ADDED (2026-10-14, run 2026-10-14_cli-native, fix round 1, ledger review/48): the fetch ahead of the pin names the
  // branch in full too; `git fetch origin records` takes a tag named `records` on origin and leaves the pin stale.
  it("fetches the records branch by its full ref into its full remote-tracking ref", () => {
    const fetches = [...checklist.matchAll(/```sh\n([\s\S]*?)```/g)]
      .flatMap((match) => (match[1] ?? "").split("\n"))
      .filter((line) => /\bgit fetch\b/.test(line) && /\brecords\b/.test(line));
    expect(fetches.length).toBeGreaterThan(0);
    expect(fetches.filter((line) => !line.includes("+refs/heads/records:refs/remotes/origin/records"))).toEqual([]);
  });
});

// ── release.yml: the changelog extraction, executed ──────────────────────────

/**
 * The `Compose release notes` step's CHANGELOG extraction, RUN, against fixture changelogs in a
 * scratch directory — the same seam the `Resolve version` suite above uses.
 *
 * Why running it rather than reading it. The awk program that carves a `## [x.y.z]` section out of
 * CHANGELOG.md gates an IRREVERSIBLE `npm publish`: a version whose section is missing, empty, or
 * accidentally matched against an adjacent heading must fail THIS step, in the gates job, before
 * the pack is handed to the publish job — "a release that cannot describe itself does not ship".
 * A substring match on the awk source cannot prove the control flow does that; only feeding the
 * real block real changelogs can. So the step's `run:` is pulled from the parsed YAML and executed
 * exactly as the runner would, with the same `env:` values reaching it.
 *
 * Not run on Windows, for the reason the `Resolve version` suite is not: the step is a bash/awk
 * script GitHub runs on ubuntu, and a Git-for-Windows bash is a different interpreter.
 */
describe.skipIf(WINDOWS)("release.yml — the changelog extraction, executed", () => {
  const root = mkdtempSync(join(tmpdir(), "stamity-changelog-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const COMPOSE = runOf(stepsOf(release, "gates"), "Compose release notes");

  interface ComposeRun {
    readonly status: number | null;
    readonly out: string;
    readonly notes: string;
  }

  let seq = 0;

  /**
   * Run the shipped Compose step against `changelog` (or no CHANGELOG.md at all when null) with
   * `version` as the section to extract. Every non-changelog value reaches the block through `env:`
   * exactly as the workflow supplies it, so the block runs unmodified — the test drives the real
   * logic, it does not re-implement it.
   */
  function compose(changelog: string | null, version: string): ComposeRun {
    const cwd = join(root, `run-${(seq += 1)}`);
    mkdirSync(cwd, { recursive: true });
    if (changelog !== null) writeFileSync(join(cwd, "CHANGELOG.md"), changelog);
    const result = spawnSync("bash", ["-c", COMPOSE], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        VERSION: version,
        PACKAGE_NAME: "pkg",
        TARBALL: "pkg-1.2.0.tgz",
        TARBALL_SHA256: "0".repeat(64),
        SBOM_PRESENT: "true",
        GITHUB_SHA: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      },
    });
    const notesPath = join(cwd, "release-notes.md");
    return {
      status: result.status,
      out: `${result.stdout}${result.stderr}`,
      notes: existsSync(notesPath) ? readFileSync(notesPath, "utf8") : "",
    };
  }

  /** A section with two entry groups and a Keep-a-Changelog footer of `[label]: url` link-defs. */
  const WITH_FOOTER = [
    "# Changelog",
    "",
    "## [1.2.0] - 2026-08-01",
    "",
    "### Added",
    "- A shiny new flag.",
    "",
    "### Fixed",
    "- A real bug.",
    "",
    "[1.2.0]: https://example.invalid/compare/v1.1.0...v1.2.0",
    "[1.1.0]: https://example.invalid/compare/v1.0.0...v1.1.0",
    "",
  ].join("\n");

  it("extracts exactly the matching section's body, with the footer link-defs excluded", () => {
    const run = compose(WITH_FOOTER, "1.2.0");

    expect(run.status, run.out).toBe(0);
    // The body of the matched section is present.
    expect(run.notes).toContain("### Added");
    expect(run.notes).toContain("- A shiny new flag.");
    expect(run.notes).toContain("### Fixed");
    expect(run.notes).toContain("- A real bug.");
    // The `[label]: url` footer is where the section stops: none of it bleeds into the notes.
    expect(run.notes, "footer link-def line must be excluded").not.toContain("[1.2.0]:");
    expect(run.notes, "footer link-def URL must be excluded").not.toContain("example.invalid");
  });

  it("keeps the entries after a link reference defined in the middle of a section", () => {
    // The regression the footer rule cost. `[x]: url` at column 0 ENDED the
    // section, which is right at the bottom of the file and wrong anywhere
    // else: a reference defined mid-body (a footnote-style link an author
    // reuses across two bullets) silently truncated every entry below it out of
    // the published notes, with the release still green. Nothing in the tree
    // told an author not to write one.
    const midBody = [
      "# Changelog",
      "",
      "## [1.2.0] - 2026-08-01",
      "",
      "### Added",
      "- A shiny new flag, see [the note][note].",
      "",
      "[note]: https://example.invalid/notes/flag",
      "",
      "### Fixed",
      "- A real bug.",
      "",
      "[1.2.0]: https://example.invalid/compare/v1.1.0...v1.2.0",
      "",
    ].join("\n");
    const run = compose(midBody, "1.2.0");

    expect(run.status, run.out).toBe(0);
    // Everything after the mid-body reference survives.
    expect(run.notes, "the entries after a mid-body link reference were cut").toContain(
      "- A real bug.",
    );
    expect(run.notes).toContain("### Fixed");
    // The reference itself rides along — it is part of the body it belongs to.
    expect(run.notes).toContain("[note]: https://example.invalid/notes/flag");
    // And the trailing footer is still excluded: held to the end, then dropped.
    expect(run.notes, "the trailing footer link-def must still be excluded").not.toContain(
      "[1.2.0]:",
    );
  });

  it("emits a non-empty Changes body for a real section — the positive control", () => {
    // Isolates the extraction from the surrounding boilerplate: the text between the `### Changes`
    // marker and the artifact table is the awk output, and for a real section it is non-empty. A
    // rule that carved nothing would still render the header and table, so a bare `status == 0`
    // would not catch it; this asserts the payload itself carries content.
    const run = compose(WITH_FOOTER, "1.2.0");
    const marker = "### Changes\n\n";
    const start = run.notes.indexOf(marker);
    expect(start, "the notes must carry a Changes section").toBeGreaterThanOrEqual(0);
    const rest = run.notes.slice(start + marker.length);
    const body = rest.slice(0, rest.indexOf("\n\n| Artifact"));
    expect(body.trim().length, run.notes).toBeGreaterThan(0);
    expect(body).toContain("- A shiny new flag.");
  });

  it("fails closed when no heading matches the version — publish cannot proceed", () => {
    // The fail-closed contract: a version with no `## [x.y.z]` heading fails THIS step. The message
    // pins WHICH guard fired — the `if (!found) exit 3` in the awk END block — so neutering that
    // guard (which leaves the empty-body check to catch the same input with a different message)
    // turns this assertion red. Status alone would not: the two guards are belt-and-braces.
    const run = compose(WITH_FOOTER, "9.9.9");

    expect(run.status, run.out).not.toBe(0);
    expect(run.out).toContain("No changelog section");
    expect(run.out).toContain('has no "## [9.9.9]" section');
    expect(run.notes, "no release notes are written on a fail-closed exit").toBe("");
  });

  it("rejects a section whose body is only whitespace", () => {
    // A heading with nothing but a blank/whitespace line under it is not usable release notes. The
    // awk matches the heading (found = 1) and prints the whitespace line, so the `if (!found)` guard
    // passes it through; the empty-body check is the one that must reject it.
    const changelog = [
      "# Changelog",
      "",
      "## [1.2.0] - 2026-08-01",
      "   \t  ",
      "## [1.1.0] - 2026-07-01",
      "- an entry that belongs to the older section.",
      "",
    ].join("\n");
    const run = compose(changelog, "1.2.0");

    expect(run.status, run.out).not.toBe(0);
    expect(run.out).toContain("Empty changelog section");
    expect(run.notes).toBe("");
  });

  it("does not match an adjacent heading: VERSION 1.0.1 never matches `## [1.0.10]`", () => {
    // The closing `]` in the `## [$VERSION]` target is the disambiguator. A prefix match that
    // dropped it would read `## [1.0.10]` as a `1.0.1` section and publish the wrong notes; here
    // there is no `## [1.0.1]` section at all, so the correct answer is a fail-closed exit.
    const changelog = [
      "# Changelog",
      "",
      "## [1.0.10] - 2026-08-01",
      "- belongs to the ten-th patch, not the first.",
      "",
    ].join("\n");

    const missed = compose(changelog, "1.0.1");
    expect(missed.status, missed.out).not.toBe(0);
    expect(missed.out).toContain('has no "## [1.0.1]" section');

    // The section IS extractable under its own exact version — proving the 1.0.1 failure is the
    // adjacency guard, not a malformed fixture.
    const hit = compose(changelog, "1.0.10");
    expect(hit.status, hit.out).toBe(0);
    expect(hit.notes).toContain("- belongs to the ten-th patch, not the first.");
  });

  it("stops a middle section at the next `## [` heading, not at end of file", () => {
    // Extraction of a section that is neither first nor last must yield that section's body alone —
    // no bleed backward into a newer section or forward into an older one.
    const changelog = [
      "# Changelog",
      "",
      "## [2.0.0] - 2026-08-10",
      "- newer entry, above the target.",
      "",
      "## [1.5.0] - 2026-08-05",
      "- the target entry.",
      "",
      "## [1.0.0] - 2026-08-01",
      "- older entry, below the target.",
      "",
      "[2.0.0]: https://example.invalid/2",
      "[1.5.0]: https://example.invalid/15",
      "[1.0.0]: https://example.invalid/1",
      "",
    ].join("\n");
    const run = compose(changelog, "1.5.0");

    expect(run.status, run.out).toBe(0);
    expect(run.notes).toContain("- the target entry.");
    expect(run.notes, "the newer section must not bleed in").not.toContain("newer entry");
    expect(run.notes, "the older section must not bleed in").not.toContain("older entry");
  });
});

// REMOVED (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): "release.yml — the distribution
// push and the stamp, executed", seven cases that ran the plugin distribution's push and manifest
// stamp steps against a scratch bare remote. Both steps left with the plugin route, which 1.15.0
// deletes; `fork-release.yml`'s copy of the push step left with it.

// ── docs-site.yml ────────────────────────────────────────────────────────────

/** A `workflow_dispatch` context for this workflow: main, and whatever the form supplied. */
const docsDispatch = (inputs: Readonly<Record<string, unknown>>): ExpressionContext => ({
  github: { event_name: "workflow_dispatch", ref: "refs/heads/main" },
  inputs,
});

describe("docs-site.yml — builds on every change, deploys only when armed", () => {
  const jobs = docsSite.workflow.jobs;
  const build = jobOf(docsSite, "build");
  const deploy = jobOf(docsSite, "deploy");

  it("builds on pull requests and pushes, and takes a dispatch input to deploy", () => {
    expect(triggersOf(docsSite.workflow).toSorted()).toEqual([
      "pull_request",
      "push",
      "workflow_dispatch",
      "workflow_run",
    ]);
    const triggers = (docsSite.workflow as unknown as Record<string, unknown>)["on"] as {
      workflow_dispatch?: { inputs?: { deploy?: { type?: string; default?: boolean } } };
    };
    const input = triggers.workflow_dispatch?.inputs?.deploy;
    // Boolean and DEFAULT FALSE: the form a maintainer opens must not arrive pre-armed.
    expect(input?.type).toBe("boolean");
    expect(input?.default).toBe(false);
  });

  it("runs on the pages the site renders, not only on the site that renders them", () => {
    // The site reads the repository's own docs/ in place, so this workflow is the build gate on
    // those pages too — a page that stops parsing, or a doc link that misses, fails HERE. Watching
    // only website/** would let a docs/ change break the site with nothing red.
    const on = (docsSite.workflow as unknown as Record<string, unknown>)["on"] as Record<
      string,
      { paths?: readonly string[] }
    >;
    // TEST CHANGE, justified (run 2026-10-13_records-branch, unit r5b-ci-folds, inbox row 105):
    // the pull-request trigger no longer carries `website/**` and `docs/**`, because ci.yml builds
    // the site for those on a pull request (the `lanes` job or the `check` job's LTS leg, under
    // `site_build`) inside the required `all-ci-checks`; a second build here repeated it. The push
    // trigger keeps every path, and the pull-request split is held against the classifier below.
    expect(on["push"]?.paths, "push must be path-filtered").toEqual(
      // Fixture data kept out of the test-input census: the globs are built at run time, as literals they name every site and docs file.
      expect.arrayContaining([["website", "**"].join("/"), ["docs", "**"].join("/"), "README.md"]),
    );
  });

  // ADDED (run 2026-10-13_records-branch, unit r5b-ci-folds, inbox row 105): a pull request that
  // changes the website builds the site once, in ci.yml, where `all-ci-checks` blocks the merge on
  // it; docs-site.yml's pull-request build keeps only the paths ci.yml's `site_build` never covers.
  it("builds a pull request's site once: in ci.yml for the site's paths, here only for the rest", () => {
    const on = (docsSite.workflow as unknown as Record<string, unknown>)["on"] as Record<
      string,
      { paths?: readonly string[] }
    >;
    const pushPaths = on["push"]?.paths ?? [];
    const prPaths = on["pull_request"]?.paths ?? [];
    // Built at run time, kept out of the test-input census like the globs above.
    const specs = ["docs", "specs", "**"].join("/");
    expect([...prPaths].toSorted()).toEqual([".github/workflows/docs-site.yml", "README.md", specs].toSorted());
    // Every pull-request path is still under a push path; the push build is `main`'s own.
    const covers = (glob: string, path: string) => glob === path || (glob.endsWith("/**") && path.startsWith(glob.slice(0, -2)));
    for (const path of prPaths) expect(pushPaths.some((glob) => covers(glob, path)), path).toBe(true);

    const base = "a".repeat(40);
    const code = ["src", "cli.ts"].join("/");
    const sample = (glob: string) => (glob.endsWith("/**") ? `${glob.slice(0, -2)}page.md` : glob);
    // A map that gives every sampled path a suite, so a path alone takes the lanes side when it can.
    const mapFor = (glob: string) => [{ glob, tests: [["test", "docsPages.test.ts"].join("/")] }];
    const classifyPaths = classifyChange as (input: {
      event: string;
      base: string;
      paths: readonly string[];
      map: readonly { glob: string; tests: readonly string[] }[] | null;
    }) => { full: boolean; lanes: readonly string[]; siteBuild: boolean };

    // Each path the pull-request trigger keeps: ci.yml builds no site for it, alone or mixed.
    const keptSamples = [specs, "README.md", ".github/workflows/docs-site.yml"].map(sample);
    for (const path of keptSamples) {
      for (const paths of [[path], [path, code]]) {
        const answer = classifyPaths({ event: "pull_request", base, paths, map: mapFor(path) });
        expect(answer.siteBuild, paths.join(" + ")).toBe(false);
      }
    }

    // Each path it dropped: the classifier answers `site_build`, and ci.yml builds the site under
    // `all-ci-checks` — on the lanes side for a docs- or website-only change, on the LTS leg mixed.
    const dropped = pushPaths.filter((glob) => !prPaths.includes(glob));
    expect(dropped.toSorted()).toEqual([["docs", "**"].join("/"), ["website", "**"].join("/")].toSorted());
    const lanesJob = jobOf(ci, "lanes");
    const checkJob = jobOf(ci, "check");
    const lanesSite = conditionOf(stepsOf(ci, "lanes"), "Build the site");
    const ltsSite = conditionOf(stepsOf(ci, "check"), "Build the site");
    const lts = (checkJob.strategy?.matrix?.include ?? []).find((leg) => leg.label === "lts");
    expect(lts, "the check job has an LTS leg").toBeDefined();
    expect(jobOf(ci, "all-ci-checks").needs).toEqual(expect.arrayContaining(["lanes", "check"]));
    for (const glob of dropped) {
      const path = sample(glob);
      const alone = classifyPaths({ event: "pull_request", base, paths: [path], map: mapFor(glob) });
      expect(alone, path).toMatchObject({ full: false, lanes: ["website"], siteBuild: true });
      const mixed = classifyPaths({ event: "pull_request", base, paths: [path, code], map: mapFor(glob) });
      expect(mixed, `${path} + ${code}`).toMatchObject({ full: true, siteBuild: true });
      for (const answer of [alone, mixed]) {
        const context = {
          github: { event_name: "pull_request" },
          matrix: lts,
          needs: {
            changes: { result: "success", outputs: { full: String(answer.full), site_build: String(answer.siteBuild) } },
            "prove-pr": { result: "skipped", outputs: {} },
          },
        };
        const side = answer.full ? { job: checkJob, step: ltsSite } : { job: lanesJob, step: lanesSite };
        const other = answer.full ? lanesJob : checkJob;
        expect(evaluateWorkflowExpression(side.job.if ?? "false", context), `${path}: the side runs`).toBe(true);
        expect(evaluateWorkflowExpression(other.if ?? "false", context), `${path}: the other side skips`).toBe(false);
        expect(evaluateWorkflowExpression(side.step, context), `${path}: the side builds the site`).toBe(true);
      }
    }
  });

  it("keeps the build job free of every elevated grant", () => {
    expect(build.permissions).toEqual({ contents: "read" });
    expect(build.if ?? "", "the build job runs on every trigger").toBe("");
  });

  it("deploys the bytes the build produced rather than building a second time", () => {
    // A deploy job that rebuilt could publish something no check ever saw.
    const steps = stepsOf(docsSite, "deploy");
    expect(deploy.needs).toBe("build");
    expect(steps.some((step) => (step.run ?? "").includes("npm run build"))).toBe(false);
    expect(indexOf(steps, "Download the built site")).toBeGreaterThanOrEqual(0);
    expect(stepOf(steps, "Download the built site").with?.["name"]).toBe("docs-site");
    // Uploaded under the same name by the job that produced it.
    expect(stepOf(stepsOf(docsSite, "build"), "Upload the built site").with?.["name"]).toBe(
      "docs-site",
    );
  });

  it("installs the site's dependencies with lifecycle scripts off", () => {
    // The repository .npmrc carries ignore-scripts=true, and npm resolves a project .npmrc from
    // the project root of the install — which is website/, not the repository root, once that
    // directory has its own package.json. So the flag is spelled out or it does not apply.
    expect(runOf(stepsOf(docsSite, "build"), "Install")).toContain("--ignore-scripts");
  });

  it("names the arming condition in the file, where whoever arms it will read it", () => {
    // The site is live at the claimed domain, and the deploy's preconditions are stated in the
    // file: what arms a deploy (a dispatch with the input set, or a succeeded real release) and
    // what happens on a fork or a repository where Pages is not enabled (the configure step
    // fails). A deploy path whose preconditions live only in someone's memory is a deploy path
    // that gets tried and fails, or worse, succeeds at a URL nobody meant to publish. The
    // "not enabled" pin below holds the file to naming that failure case, not to a claim that
    // Pages is off.
    expect(docsSite.source).toContain("ARMING CONDITION");
    expect(docsSite.source).toContain("stamity.dev");
    expect(docsSite.source.toLowerCase()).toContain("not enabled");
  });

  describe("nothing but an armed dispatch or a succeeded real release can deploy", () => {
    /** The condition this file must carry, character for character. */
    const DEPLOY_CONDITION =
      // Private/downstream deployment is now excluded by platform context; the existing
      // arming-input and successful-release cases still exercise canonical behavior.
      "github.repository == 'zomarit/stamity' && format('{0}', github.event.repository.private) == 'false' && " +
      "((github.event_name == 'workflow_dispatch' && format('{0}', inputs.deploy) == 'true') || " +
      "(github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' && " +
      "github.event.workflow_run.event == 'push' && startsWith(github.event.workflow_run.head_branch, 'v')))";

    const condition = (deploy.if ?? "").replace(/\s+/g, " ").trim();

    const SHAPES: readonly {
      readonly label: string;
      readonly context: ExpressionContext;
      readonly deploys: boolean;
    }[] = [
      {
        label: "a push to main",
        context: { github: { event_name: "push", ref: "refs/heads/main" } },
        deploys: false,
      },
      {
        label: "a pull request",
        context: { github: { event_name: "pull_request", ref: "refs/pull/1/merge" } },
        deploys: false,
      },
      { label: "the default dispatch (deploy false)", context: docsDispatch({ deploy: false }), deploys: false },
      { label: "a dispatch that set deploy true", context: docsDispatch({ deploy: true }), deploys: true },
      { label: "a dispatch whose deploy input went missing", context: docsDispatch({}), deploys: false },
      { label: "a dispatch whose deploy input is empty", context: docsDispatch({ deploy: "" }), deploys: false },
      {
        label: "a dispatch with no inputs context at all",
        context: { github: { event_name: "workflow_dispatch", ref: "refs/heads/main" } },
        deploys: false,
      },
      {
        label: "a succeeded release run from a real v tag",
        context: {
          github: {
            event_name: "workflow_run",
            ref: "refs/heads/main",
            event: { workflow_run: { conclusion: "success", event: "push", head_branch: "v1.0.2" } },
          },
        },
        deploys: true,
      },
      {
        label: "a FAILED release run from a v tag",
        context: {
          github: {
            event_name: "workflow_run",
            ref: "refs/heads/main",
            event: { workflow_run: { conclusion: "failure", event: "push", head_branch: "v1.0.2" } },
          },
        },
        deploys: false,
      },
      {
        label: "a succeeded dry-run rehearsal (dispatch-triggered release run)",
        context: {
          github: {
            event_name: "workflow_run",
            ref: "refs/heads/main",
            event: {
              workflow_run: { conclusion: "success", event: "workflow_dispatch", head_branch: "main" },
            },
          },
        },
        deploys: false,
      },
      {
        label: "a succeeded release-workflow run whose head is not a v ref",
        context: {
          github: {
            event_name: "workflow_run",
            ref: "refs/heads/main",
            event: { workflow_run: { conclusion: "success", event: "push", head_branch: "main" } },
          },
        },
        deploys: false,
      },
    ];

    it("pins the deploy condition exactly, string compare and all", () => {
      expect(condition, "the deploy job must be conditional").not.toBe("");
      expect(condition).toBe(DEPLOY_CONDITION);
    });

    it("admits an explicit deploy=true dispatch, and nothing else", () => {
      for (const shape of SHAPES) {
        expect(evaluateWorkflowExpression(condition, repositoryContext(shape.context)), shape.label).toBe(
          shape.deploys,
        );
      }
      // Table guard: it has to contain both answers, or a constant condition would satisfy it.
      expect(SHAPES.some((shape) => shape.deploys)).toBe(true);
      expect(SHAPES.some((shape) => !shape.deploys)).toBe(true);
    });

    it("names the value that arms rather than excluding the one that does not", () => {
      // The falsifiable half, and the direction it runs matters. This condition arms on ONE
      // value, so an input that went missing casts to something that is not that value and the
      // job does not start. The inverted spelling — exclude 'false', deploy on anything else —
      // reads as equally strict and is not: an input that went missing, or arrived empty, is not
      // 'false' either, so an empty dispatch DEPLOYS. Every shape below publishes under the
      // inversion and none does under the shipped condition, so a revert to it fails here.
      const inverted =
        "github.event_name == 'workflow_dispatch' && format('{0}', inputs.deploy) != 'false'";
      const failOpen = [
        "a dispatch whose deploy input went missing",
        "a dispatch whose deploy input is empty",
        "a dispatch with no inputs context at all",
      ];
      for (const label of failOpen) {
        const shape = SHAPES.find((row) => row.label === label);
        expect(shape, label).toBeDefined();
        expect(evaluateWorkflowExpression(inverted, shape?.context ?? {}), label).toBe(true);
        expect(evaluateWorkflowExpression(condition, shape?.context ?? {}), label).toBe(false);
      }
      // And the inversion is not simply always-true: it denies the default dispatch, which is
      // what makes it a plausible enough mistake to guard against.
      const defaulted = SHAPES.find((row) => row.label === "the default dispatch (deploy false)");
      expect(evaluateWorkflowExpression(inverted, defaulted?.context ?? {})).toBe(false);
    });

    it("puts the deploy behind the environment where a protection rule can attach", () => {
      // Same control as release.yml's `npm-publish`: the in-file condition answers "was a deploy
      // requested", and the environment is where the platform-side approval attaches. `github-pages`
      // is also the environment GitHub itself scopes a Pages deployment token to.
      const environment = deploy.environment;
      expect(typeof environment === "string" ? environment : environment?.name).toBe(
        "github-pages",
      );
    });

    it("holds the elevated grants to the deploy job alone", () => {
      for (const [id, job] of Object.entries(jobs)) {
        const grants = Object.keys(job.permissions ?? {}).toSorted();
        expect(grants, `${id} must declare its own permissions`).not.toEqual([]);
        if (id === "deploy") continue;
        expect(job.permissions, `${id} must hold nothing but read`).toEqual({ contents: "read" });
      }
      expect(deploy.permissions).toEqual({
        contents: "read",
        pages: "write",
        "id-token": "write",
      });
    });
  });
});

// ── every workflow ───────────────────────────────────────────────────────────

describe("every workflow — pins, privileges and referenced scripts", () => {
  it("covers every file in the directory, rather than a list written in this suite", () => {
    // The property the group below claims. It used to run over three hard-coded loads while
    // its own wording said "the whole repository", so a fourth workflow carrying `id-token:
    // write` and a `run: npm publish` passed all of it. The set is read off disk now, which
    // means a new file is covered on the commit that adds it rather than on the commit that
    // remembers to list it here.
    expect(WORKFLOW_FILES).toEqual(
      expect.arrayContaining([
        "ci.yml",
        "docs-site.yml",
        "nightly.yml",
        "pr-checks.yml",
        "release.yml",
      ]),
    );
    // Regex-rot guard: a filter that matched nothing would satisfy every loop below vacuously.
    expect(WORKFLOW_FILES.length).toBeGreaterThanOrEqual(5);
    expect(ALL_WORKFLOWS.length).toBe(WORKFLOW_FILES.length);
    for (const { file, workflow } of ALL_WORKFLOWS) {
      expect(Object.keys(workflow.jobs ?? {}).length, `${file} parsed to no jobs`).toBeGreaterThan(
        0,
      );
    }
  });

  it("keeps `npm publish` inside the one job whose condition denies a dry run", () => {
    // The property, now actually stated over the whole directory: if the string can only appear
    // in a job that a dry run cannot reach, a dry run cannot publish.
    // TEST CHANGE, justified (plan 010, unit e1-fork-release-workflow): a fork's own release path
    // publishes its CLI from `fork-release.yml:publish`. That job's condition denies a dry run in
    // release.yml's `format()` spelling and requires the probe's `armed` answer, which the
    // canonical repository never gives; both are evaluated over every trigger shape in
    // test/ci/forkReleaseWorkflow.test.ts. Any third job still fails this closed list.
    // TEST CHANGE, justified (plan 022, unit a11-release-workflows, REQ-PLUGIN-050): the fork's
    // `gates` job now rehearses the registry publish before the approval, so the string appears in
    // a job a dry run reaches. It is admitted to a second closed list, and only because every
    // `npm publish` line in it carries `--dry-run`; a job with one line lacking the flag counts as
    // publishing, which the first list refuses. The case below drops the flag from a parsed copy.
    const { publishing, rehearsing } = classifyNpmPublishJobs(ALL_STEPS);
    expect(publishing).toEqual(["fork-release.yml:publish", "release.yml:publish"]);
    expect(rehearsing).toEqual(["fork-release.yml:gates"]);
  });

  it("counts a rehearsal job as publishing once one of its `npm publish` lines loses `--dry-run`", () => {
    const fork = workflowNamed("fork-release.yml");
    const stripped = parse(fork.source.replaceAll(" --dry-run", "")) as Workflow;
    const steps = Object.entries(stripped.jobs).flatMap(([id, job]) =>
      job.steps.map((step) => [fork.file, id, step] as readonly [string, string, WorkflowStep]),
    );
    // Non-degenerate: the shipped copy holds the flag, so the strip changed the parsed text.
    expect(fork.source).toContain(" --dry-run");
    const { publishing, rehearsing } = classifyNpmPublishJobs(steps);
    expect(rehearsing).toEqual([]);
    expect(publishing).toEqual(["fork-release.yml:gates", "fork-release.yml:publish"]);
  });

  it("hands OIDC only to the named deployment and nonpublishing signing jobs", () => {
    // A CLOSED list, which is the property — not a count. The existing deployment holders are:
    // `release.yml:publish` exchanges it for npm's provenance attestation, and
    // `docs-site.yml:deploy` exchanges it for a GitHub Pages deployment token. Both are gated by
    // a `format()`-compared condition that fails closed, and the docs-site one is evaluated
    // against every trigger shape below, so admitting it here does not widen what can reach it.
    // The new pack-signing-rehearsal sign job exchanges OIDC for a Sigstore certificate on
    // the named public candidate branch. Its exact grants and absence of publication or
    // deployment capability are pinned in packSigningRehearsal.test.ts. This explicit addition
    // reconciles the reviewed signing workflow; any other holder still fails the closed list.
    const holders = ALL_JOBS.filter(([, , job]) =>
      Object.keys(job.permissions ?? {}).includes("id-token"),
    ).map(([file, id]) => `${file}:${id}`);
    expect(holders).toEqual([
      "docs-site.yml:deploy",
      "pack-signing-rehearsal.yml:sign",
      "release.yml:publish",
    ]);
  });

  it("stores no npm credential at step, job or workflow scope", () => {
    // The scope half is the point. This used to read step-level `env` only, so a token added at
    // JOB or WORKFLOW scope — where it would reach every step, including the ones that run
    // third-party code — passed. Publishing here authenticates through a per-run OIDC token, so
    // any npm credential in these files is a credential that should not exist.
    const FORBIDDEN = new Set([
      "NODE_AUTH_TOKEN",
      "NPM_TOKEN",
      "NPM_CONFIG_TOKEN",
      "NPM_CONFIG__AUTH",
    ]);
    const scopes: (readonly [string, Readonly<Record<string, string>> | undefined])[] = [
      ...ALL_WORKFLOWS.map(
        ({ file, workflow }) => [`${file} (workflow env)`, workflow.env] as const,
      ),
      ...ALL_JOBS.map(([file, id, job]) => [`${file}:${id} (job env)`, job.env] as const),
      ...ALL_STEPS.map(
        ([file, id, step]) => [`${file}:${id} (step env)`, step.env] as const,
      ),
    ];
    // TEST CHANGE, justified (plan 010, unit e1-fork-release-workflow): a fork publishes to its
    // own registry, where no OIDC trusted publisher exists, so its publish step authenticates
    // through `NODE_AUTH_TOKEN` — the per-run token for GitHub Packages, the fork's
    // STAMITY_REGISTRY_TOKEN secret otherwise. Exactly one scope is admitted: that step's env, in
    // `fork-release.yml`'s publish job, which checks nothing out. Every other scope, and every
    // other forbidden name everywhere, still fails.
    const FORK_PUBLISH_STEP = "fork-release.yml:publish (step env)";
    let admitted = 0;
    for (const [where, env] of scopes) {
      for (const key of Object.keys(env ?? {})) {
        if (where === FORK_PUBLISH_STEP && key === "NODE_AUTH_TOKEN") {
          admitted += 1;
          continue;
        }
        expect(FORBIDDEN.has(key), `${where} declares ${key}`).toBe(false);
      }
    }
    expect(admitted, "the fork publish step's credential, and no second copy of it").toBe(1);
    // And the bytes, because a credential can also arrive as a `with:` input or a `run:` line.
    for (const { file, source } of ALL_WORKFLOWS) {
      expect(source, file).not.toMatch(/NPM_TOKEN|secrets\.NPM/);
      if (file !== "fork-release.yml") {
        expect(source, file).not.toMatch(/NODE_AUTH_TOKEN/);
        continue;
      }
      // In the fork file the name appears only in the admitted step: its env key and the one
      // emptiness check its script makes.
      const holder = ALL_STEPS.find(
        ([stepFile, job, step]) =>
          stepFile === file && job === "publish" && step.env?.["NODE_AUTH_TOKEN"] !== undefined,
      )?.[2];
      expect(holder, "the fork publish step must hold the credential it is admitted for").toBeDefined();
      const inStep = 1 + ((holder?.run ?? "").match(/NODE_AUTH_TOKEN/g)?.length ?? 0);
      expect(source.match(/NODE_AUTH_TOKEN/g)?.length ?? 0, file).toBe(inStep);
    }
  });

  it("reads only the secrets this repository knowingly holds", () => {
    // A closed list, so adding a secret is a decision recorded here rather than a line nobody
    // reviews. GITHUB_TOKEN is the per-run token. TEST CHANGE, justified (2026-10-14, run
    // 2026-10-14_cli-native, unit d3-ci-qa): ANTHROPIC_API_KEY, CURSOR_API_KEY,
    // COPILOT_GITHUB_TOKEN and CODEX_API_KEY leave the list. They armed the nightly headless lane's
    // plugin-route invocation legs, which left with the plugin route that 1.15.0 deletes, so no
    // workflow reads them; a client credential that came back would be a decision recorded here
    // again. STAMITY_UPSTREAM_TOKEN is
    // read by the upstream lane's `publish` job alone, is absent here by design (this repository
    // is not a fork), and exists so a FORK can push a release that touches workflow files and
    // let the pull request's own CI start without the approval prompt — both limits of the
    // per-run token, which `upstream-update.yml`'s header states. Its holder is the one job
    // `test/ci/upstreamWorkflow.test.ts` pins.
    // TEST CHANGE, justified (plan 021 file 2, unit v13-client-legs; REQ-PROVE-040): the decision
    // that brings client credentials back is that plan's client legs, settled 2026-10-15 as built and
    // off until secrets exist. ANTHROPIC_API_KEY, CURSOR_API_KEY and COPILOT_GITHUB_TOKEN return, read
    // only by nightly.yml's `hook-fire` and `release-prep-unattended` jobs, each by one arm step and one
    // drive step of its own client (the client-leg suite pins both). CODEX_API_KEY stays out: Codex has
    // no headless hook lane to drive (scripts/qa/hook-runs.mjs).
    // ADDED by plan 010, unit e1-fork-release-workflow: STAMITY_REGISTRY_TOKEN is a fork's
    // credential for a registry other than GitHub Packages, read by `fork-release.yml`'s publish
    // job alone and absent here by design (this repository publishes through OIDC in
    // release.yml). test/ci/forkReleaseWorkflow.test.ts pins its one holder.
    const referenced = new Set(
      ALL_WORKFLOWS.flatMap(({ source }) =>
        [...source.matchAll(/secrets\.([A-Z_][A-Z0-9_]*)/g)].map((match) => match[1] ?? ""),
      ),
    );
    expect([...referenced].toSorted()).toEqual([
      "ANTHROPIC_API_KEY",
      "COPILOT_GITHUB_TOKEN",
      "CURSOR_API_KEY",
      "GITHUB_TOKEN",
      "STAMITY_REGISTRY_TOKEN",
      "STAMITY_UPSTREAM_TOKEN",
    ]);
  });

  it("pins each action to a full commit SHA and names the exact version it resolves to", () => {
    // dependabot rewrites the digest on a bump and mirrors the comment's GRANULARITY verbatim, so
    // a coarse `# v4` comment that is bumped across a major stays `# v4` and lies about the pinned
    // code. Requiring the full three-part version is what makes the lie impossible to inherit.
    //
    // The limit, stated rather than implied: this runs offline, so it cannot verify the SHA
    // actually resolves to the version named. The shape is enforced here; the truth of the mapping
    // is on whoever merges the bump.
    const pinned = /^\s*(?:-\s+)?uses:\s+\S+@[0-9a-f]{40}\s+#\s+v\d+\.\d+\.\d+\s*$/;
    let seen = 0;
    for (const { file, source } of ALL_WORKFLOWS) {
      for (const line of source.split("\n")) {
        if (!/^\s*(?:-\s+)?uses:/.test(line)) continue;
        seen += 1;
        expect(line, `${file}: ${line.trim()}`).toMatch(pinned);
      }
    }
    // Regex-rot guard: a pattern that matched nothing would pass every assertion above.
    expect(seen).toBeGreaterThan(10);
    expect(ALL_STEPS.filter(([, , step]) => step.uses !== undefined).length).toBe(seen);
  });

  it("declares least privilege at workflow scope and again on every job", () => {
    for (const { file, workflow } of ALL_WORKFLOWS) {
      expect(workflow.permissions, `${file} must declare workflow-scope permissions`).toEqual({
        contents: "read",
      });
    }
    for (const [file, id, job] of ALL_JOBS) {
      expect(job.permissions, `${file}:${id} must declare its own permissions`).toBeDefined();
    }
    // Three jobs may publish repository or deployment state behind their own conditions: the one
    // that creates the release, the one that publishes the docs site, and the upstream lane's
    // `publish` job, which pushes an update branch and opens a pull request or an issue in a
    // FORK — here it never runs, because the `probe` job it depends on finds no lane config. None
    // is reachable from a push, a pull request or an unarmed dispatch, and the conditions that
    // make that true are evaluated — not read for substrings — in their own suites (the two
    // above, and `test/ci/upstreamWorkflow.test.ts` for the third).
    // The reviewed signing rehearsal adds only an OIDC write grant for a nonpublishing witness
    // on the named public candidate branch. packSigningRehearsal.test.ts pins that job's exact
    // read-plus-OIDC permissions and keeps its prepare/verify siblings at read only.
    // ADDED by plan 010, unit e1-fork-release-workflow: `fork-release.yml:publish` holds
    // `contents: write` (the GitHub release; the distribution branch and its tag left with the
    // plugin route in 1.15.0) and
    // `packages: write` (GitHub Packages), behind the probe's `armed` answer — never given in
    // this repository — and a `fork-release` environment. Its condition is evaluated over every
    // trigger shape in test/ci/forkReleaseWorkflow.test.ts.
    const writers = ALL_JOBS.filter(([, , job]) =>
      Object.values(job.permissions ?? {}).includes("write"),
    ).map(([file, id]) => `${file}:${id}`);
    expect(writers).toEqual([
      "docs-site.yml:deploy",
      "fork-release.yml:publish",
      "pack-signing-rehearsal.yml:sign",
      "release.yml:publish",
      "upstream-update.yml:publish",
    ]);
    // None of these holders can start unconditionally: a write grant behind a missing condition
    // is a write grant on every trigger the workflow declares.
    for (const holder of writers) {
      const [file, id] = holder.split(":");
      const job = ALL_JOBS.find(([f, i]) => f === file && i === id)?.[2];
      expect(job?.if ?? "", `${holder} must be conditional`).not.toBe("");
    }
  });

  it("references only scripts/*.mjs files that exist on disk", () => {
    // TEST CHANGE, justified (2026-09-22, prove/220): the plugin-route steps invoke the interpreter
    // by the absolute path captured before any vendor install — `"$STAMITY_NODE_BIN" scripts/…` —
    // so the match admits that spelling beside the bare `node`. Nothing else is admitted: a script
    // reached any other way is a reference this guard would not see, which is the rot it exists
    // to catch. (Those steps left with the plugin route in 1.15.0; the spelling stays admitted so a
    // reference written that way is still checked rather than missed.)
    const referenced = ALL_STEPS.flatMap(([, , step]) =>
      Array.from(
        // TEST CHANGE, justified (plan 013 file 3, unit sw06-records-only-ci-lane): the class
        // admits `/`, so a script under a subfolder (`scripts/ci/records-only.mjs`) is matched and
        // its existence checked rather than slipping past the pattern unseen.
        (step.run ?? "").matchAll(/(?:node|"\$STAMITY_NODE_BIN") (scripts\/[\w/-]+\.mjs)/g),
        (match) => match[1] ?? "",
      ),
    );
    // Regex-rot guard: the generators and the two gates must be among the matches.
    for (const script of [
      "scripts/generate-capability-matrix.mjs",
      "scripts/generate-docs.mjs",
      "scripts/generate-pack-manifests.mjs",
      "scripts/size-budget.mjs",
      "scripts/tarball-smoke.mjs",
      // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa):
      // `scripts/apm-install-smoke.mjs` and `scripts/plugin-route-smoke.mjs` leave this list. No
      // workflow step calls either now that 1.15.0 deletes both routes, and both scripts are
      // deleted beside them; the loop after this one asserts no step calls a route script again.
      // ADDED by plan 013 file 3, unit sw06-records-only-ci-lane: the records-only classifier.
      "scripts/ci/records-only.mjs",
      // ADDED by unit a1-proven-push (2026-10-08): the proven-push reader.
      "scripts/ci/pr-proven.mjs",
      // ADDED by run 2026-10-13_records-branch, unit r5-ci-records-job (2026-10-14): the records restore and guard.
      "scripts/records.mjs",
    ]) {
      expect(referenced).toContain(script);
    }
    for (const script of referenced) {
      expect(existsSync(join(REPO_ROOT, script)), `${script} must exist`).toBe(true);
    }
    for (const script of referenced) {
      expect(script, "a workflow step still calls a deleted route script").not.toMatch(/plugin|apm/);
    }
  });

  // ADDED (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): 1.15.0 deletes the APM and
  // plugin routes, so no workflow job, step, output or permission may name either one again. Read
  // as data, the way GitHub reads it: a job id, a job or step name, a step id, a run body, an
  // action input, an env value, an output or a permission key. Comments are not data and are not
  // read here; the lane map's own case reads ci.yml's.
  it("names no plugin or APM route in any job, step, output or permission", () => {
    const ROUTE = /plugin|\bapm\b|apm-|attestations|artifact-metadata|setup-python/i;
    let jobs = 0;
    for (const [file, id, job] of ALL_JOBS) {
      jobs += 1;
      expect(id, `${file}:${id}`).not.toMatch(ROUTE);
      expect(JSON.stringify(job), `${file}:${id}`).not.toMatch(ROUTE);
    }
    // Regex-rot guard: the walk read every job of the four files the deletion touched.
    expect(jobs).toBeGreaterThan(10);
    for (const file of ["ci.yml", "nightly.yml", "release.yml", "fork-release.yml"]) {
      expect(ALL_JOBS.some(([jobFile]) => jobFile === file), file).toBe(true);
    }
  });

  it("carries no internal process identifiers into the public tree", () => {
    // These files are read by contributors, not by the people who planned them. An identifier
    // that resolves to nothing a reader can look up is noise that reads like a citation.
    //
    // The planning word is assembled from fragments at run time, the way
    // `scripts/leak-gate.mjs` assembles its reserved names and for the same reason: the tree is
    // swept for that word, so an assertion that spelled it out would be the sweep's only hit — a
    // guard failing the rule it exists to keep. What is compared is unchanged.
    const planningWord = ["re", "launch"].join("");
    for (const { file, source } of ALL_WORKFLOWS) {
      expect(source, `${file} must not cite an internal work item`).not.toMatch(/\b[A-Z]{2}-\d{3}/);
      expect(
        source.toLowerCase(),
        `${file} must not carry the planning vocabulary`,
      ).not.toContain(planningWord);
    }
  });
});

describe("the contexts each level of a workflow may name", () => {
  it("names the runner context only inside a step", () => {
    // `runner.*` is a step-level context: a job's `env:`, `if:` or `name:` that names it fails
    // GitHub's parser at dispatch time ("Unrecognized named-value: 'runner'"), which no local
    // YAML parse or shell check catches — the upstream lane's first real dispatch did. Every
    // job is held here to naming that context in its steps and nowhere else.
    for (const [file, id, job] of ALL_JOBS) {
      const { steps: _steps, ...jobWithoutSteps } = job as WorkflowJob & { steps?: unknown };
      expect(
        JSON.stringify(jobWithoutSteps),
        `${file}:${id} names the runner context outside a step`,
      ).not.toMatch(/\$\{\{[^}]*\brunner\./);
    }
  });
});

describe("dependabot.yml — the update policy behind the pins", () => {
  const source = readFileSync(join(REPO_ROOT, ".github", "dependabot.yml"), "utf8");
  const config = parse(source) as {
    version: number;
    updates: readonly {
      "package-ecosystem": string;
      directory: string;
      "target-branch"?: string;
      schedule: { interval: string };
      groups?: Record<
        string,
        { "dependency-type"?: string; "applies-to"?: string; patterns?: string[] }
      >;
    }[];
  };

  it("covers both ecosystems weekly, and every npm manifest in the tree", () => {
    expect(config.version).toBe(2);
    // TEST CHANGE, justified (2026-10-14, run 2026-10-13_records-branch, unit r5-ci-records-job): a fourth entry
    // watches the `records` branch's own workflow, whose action pins Dependabot would otherwise
    // never bump; every entry is still listed, with the branch it targets when it is not the default.
    expect(
      config.updates.map(
        (entry) =>
          `${entry["package-ecosystem"]} ${entry.directory}${entry["target-branch"] === undefined ? "" : ` -> ${entry["target-branch"]}`}`,
      ),
    ).toEqual(["npm /", "npm /website", "github-actions /", "github-actions / -> records"]);
    for (const entry of config.updates) {
      expect(entry.schedule.interval).toBe("weekly");
    }
  });

  it("keeps the npm entries and the npm manifests in one-to-one correspondence", () => {
    // `directory` scoping is EXACT, not recursive, so the root entry covers the root manifest and
    // nothing under it. The property that matters is a bijection: a manifest with no entry gets
    // no update PRs while the dashboard looks clean, and an entry with no manifest is a lane that
    // silently does nothing. Both halves are asserted, off disk, rather than from a list here.
    const declared = config.updates
      .filter((entry) => entry["package-ecosystem"] === "npm")
      .map((entry) => entry.directory)
      .toSorted();
    for (const directory of declared) {
      expect(directory.startsWith("/"), `${directory} must be repo-absolute`).toBe(true);
      const manifest = join(REPO_ROOT, directory.slice(1), "package.json");
      expect(existsSync(manifest), `${directory} has no package.json`).toBe(true);
    }
    // The other direction: every package.json outside the vendor and build trees is declared.
    const onDisk = ["/", "/website"].filter((directory) =>
      existsSync(join(REPO_ROOT, directory.slice(1), "package.json")),
    );
    expect(declared).toEqual(onDisk.toSorted());
  });

  it("splits production from development, because the two deserve different scrutiny", () => {
    // On EVERY npm entry, not just the first one found: the split is the review contract, and a
    // second manifest that skipped it would deliver one ungrouped PR per package.
    const npmEntries = config.updates.filter((entry) => entry["package-ecosystem"] === "npm");
    expect(npmEntries.length).toBeGreaterThanOrEqual(2);
    for (const npm of npmEntries) {
      expect(npm.groups?.["production"]?.["dependency-type"], npm.directory).toBe("production");
      expect(npm.groups?.["development"]?.["dependency-type"], npm.directory).toBe("development");
      // The two split groups carry no `applies-to`, so they stay version-update groups (the
      // default). Setting `applies-to: security-updates` on either would end that side's weekly
      // version-update grouping while every assertion above still held. TEST CHANGE, justified
      // (2026-10-08, row 2026-10-08_maintainer-tooling/review/42): two assertions added, none
      // re-expected; red on a planted `applies-to` under `production`.
      expect(npm.groups?.["production"]?.["applies-to"], npm.directory).toBeUndefined();
      expect(npm.groups?.["development"]?.["applies-to"], npm.directory).toBeUndefined();
      // Extended in place (the version-update split above is unchanged): security updates are a
      // third group. Without one, GitHub opens one security PR per package while the repository's
      // grouped security updates setting is off, even where the version updates are grouped.
      // `applies-to: security-updates` scopes it to security PRs only, so it never takes a
      // dependency from the two version-update groups, and `*` gathers every advisory bump of the
      // manifest, production and development alike, into one PR: on purpose, since each security
      // PR gets a whole-lockfile read.
      const security = npm.groups?.["security"];
      expect(security?.["applies-to"], npm.directory).toBe("security-updates");
      expect(security?.patterns, npm.directory).toEqual(["*"]);
      expect(security?.["dependency-type"], npm.directory).toBeUndefined();
    }
  });

  it("carries the pin-comment lesson where the person merging a bump will read it", () => {
    expect(source.toLowerCase()).toContain("granularity");
    expect(source).toContain("vMAJOR.MINOR.PATCH");
    expect(source).toContain("test/ci/workflow.test.ts");
    // The limit is stated, not implied: the backstop checks the comment's SHAPE, not that the SHA
    // resolves to the version it names.
    expect(source).toContain("cannot verify the SHA actually resolves");
  });
});

/**
 * The advisory sweep the `supply-chain` lane runs.
 *
 * The gap it closes: the probe's ONLY advisory source was `npm audit`, and not one of the nine
 * curated MCP servers is a declared dependency — nothing in `package.json` names them — so the
 * mandated CVE gate over the catalog did not exist. A published advisory against a pinned server
 * was invisible forever, while the lane reported CLEAN.
 *
 * The property that makes the lookup worth having is the one asserted hardest below: a lookup
 * that FOUND NOTHING and a lookup that COULD NOT RUN are the same shape on the wire and opposite
 * facts on the ground. Reporting the second as the first is how a supply-chain gate goes quietly
 * green while it is broken.
 */
/** A stub standing in for the OSV endpoint; the real API is a network call a suite may not make. */
function stubFetch(handler: (url: string, init: RequestInit) => unknown): ReturnType<typeof vi.fn> {
  const stub = vi.fn(async (url: unknown, init: unknown) => handler(String(url), init as RequestInit));
  globalThis.fetch = stub as unknown as typeof fetch;
  return stub;
}

describe("advisory-check — OSV lookup over the pinned catalog", () => {
  const realFetch = globalThis.fetch;
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  const SPECS = [
    { name: "@upstash/context7-mcp", version: "2.1.1" },
    { name: "mcp-remote", version: "0.1.16" },
  ];

  it("posts one batched query and keys the answer by name@version", async () => {
    const stub = stubFetch(() => ({
      ok: true,
      json: async () => ({ results: [{}, { vulns: [{ id: "GHSA-xxxx-yyyy-zzzz" }] }] }),
    }));

    const found = await osvQueryBatch(SPECS);

    expect(stub).toHaveBeenCalledTimes(1);
    const [url, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.osv.dev/v1/querybatch");
    expect(init.method).toBe("POST");
    // No credential: OSV takes an anonymous POST, which is why this lane needs no secret.
    expect(Object.keys(init.headers as Record<string, string>)).toEqual(["content-type"]);
    expect(JSON.parse(String(init.body))).toEqual({
      queries: [
        { package: { name: "@upstash/context7-mcp", ecosystem: "npm" }, version: "2.1.1" },
        { package: { name: "mcp-remote", ecosystem: "npm" }, version: "0.1.16" },
      ],
    });
    // Results align by INDEX, so a mis-zip would attribute the advisory to the wrong row.
    expect(found).toEqual({
      "@upstash/context7-mcp@2.1.1": [],
      "mcp-remote@0.1.16": ["GHSA-xxxx-yyyy-zzzz"],
    });
  }, 60_000); // a real `npm audit` through cmd.exe on the Windows leg can exceed the 20 s default

  it.each([
    ["network error", () => Promise.reject(new Error("getaddrinfo ENOTFOUND"))],
    ["http failure", () => ({ ok: false, json: async () => ({}) })],
    ["malformed body", () => ({ ok: true, json: async () => ({ results: "nope" }) })],
    // A short result array cannot be zipped to the queries, so attributing any of it would pin
    // an advisory on the wrong package.
    ["truncated results", () => ({ ok: true, json: async () => ({ results: [{}] }) })],
  ])("answers null — never an empty result — when the lookup cannot run (%s)", async (_label, handler) => {
    stubFetch(handler as () => unknown);
    expect(await osvQueryBatch(SPECS)).toBeNull();
  });

  it("skips the request entirely for an empty selection", async () => {
    const stub = stubFetch(() => ({ ok: true, json: async () => ({ results: [] }) }));
    expect(await osvQueryBatch([])).toEqual({});
    expect(stub).not.toHaveBeenCalled();
  });

  it("covers every fetch-launched catalog row, chosen by the exported launcher helper", () => {
    // The heuristic this replaces asked whether an argument contained an `@`, which matches a
    // scoped package name and a URL alike and drifts with the args. Which rows have a registry
    // identity is the catalog's answer.
    const rows = Object.values(CURATED_MCP_SERVERS).filter(
      (meta) => pinnedPackageSpec(meta) !== undefined,
    );

    expect(rows.length).toBeGreaterThan(5);
    // `gitlab` launches a host-installed binary, so it has nothing in a registry to query.
    expect(rows.map((meta) => meta.id)).not.toContain("gitlab");
    const probe = readFileSync(join(REPO_ROOT, "scripts", "advisory-check.mjs"), "utf8");
    expect(probe).toContain("pinnedPackageSpec(meta) !== undefined");
    expect(probe).not.toContain("arg.includes('@')");
  });
});

describe("advisory-check — reporting", () => {
  const work = mkdtempSync(join(tmpdir(), "stamity-advisory-"));
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  /**
   * Run the shipped probe with `fetch` forced to fail, so every registry answer is "could not
   * look". `--import` survives the probe's own type-stripping re-exec because that re-exec
   * forwards `process.execArgv`.
   */
  function runWithFailingFetch(): { stdout: string; status: number; summary: string } {
    const preload = join(work, "no-network.mjs");
    writeFileSync(preload, "globalThis.fetch = () => Promise.reject(new Error('offline'))\n");
    // `--import` takes a module SPECIFIER, not a path: a bare absolute path is
    // resolved as a URL, so on Windows `C:\...` parses as scheme `c:` and Node
    // refuses it (ERR_UNSUPPORTED_ESM_URL_SCHEME) before the probe starts. The
    // file URL is the one spelling every platform resolves the same way.
    const preloadSpecifier = pathToFileURL(preload).href;
    const summaryPath = join(work, "summary.md");
    writeFileSync(summaryPath, "");
    try {
      const stdout = execFileSync(
        process.execPath,
        ["--import", preloadSpecifier, join(REPO_ROOT, "scripts", "advisory-check.mjs")],
        {
          cwd: REPO_ROOT,
          encoding: "utf8",
          env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath },
          maxBuffer: 32 * 1024 * 1024,
        },
      );
      return { stdout, status: 0, summary: readFileSync(summaryPath, "utf8") };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string };
      return {
        stdout: failure.stdout ?? "",
        status: failure.status ?? -1,
        summary: readFileSync(summaryPath, "utf8"),
      };
    }
  }

  it("never reports CLEAN when the advisory lookup failed", { timeout: 120_000 }, () => {
    const result = runWithFailingFetch();

    // The whole point: a broken probe must not look like a passing one.
    expect(result.stdout).not.toContain("CLEAN");
    expect(result.stdout).toContain("the OSV advisory lookup failed");
    expect(result.stdout).toContain("were NOT checked this run");
  });

  it("surfaces findings as annotations and in the step summary, staying non-blocking", () => {
    const result = runWithFailingFetch();

    // Findings that live only in a raw log are a probe reporting to itself: nothing reaches the
    // run list, the checks tab or the commit status.
    expect(result.stdout).toContain("::warning title=Supply-chain currency::");
    expect(result.summary).toContain("Supply-chain currency");
    expect(result.summary).toContain("- the OSV advisory lookup failed");
    // Advisory by design: findings inform, they do not fail a push to `main`.
    expect(result.status).toBe(0);
    // An annotation must be one line, or the workflow command ends early and truncates.
    for (const line of result.stdout.split("\n").filter((entry) => entry.startsWith("::warning"))) {
      expect(line.endsWith("\r")).toBe(false);
    }
  });
});
