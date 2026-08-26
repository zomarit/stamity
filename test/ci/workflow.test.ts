import { execFileSync, spawnSync } from "node:child_process";
import {
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
import { CURATED_MCP_SERVERS, pinnedPackageSpec } from "../../src/mcp/catalog.ts";
import { evaluateWorkflowExpression, type ExpressionContext } from "./workflowExpression.ts";

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
 *   ci.yml        the three-leg matrix and the per-leg step split, step order (Build before Test,
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
  readonly "continue-on-error"?: boolean;
}

interface MatrixInclude {
  readonly os: string;
  readonly node: string;
  readonly label: string;
  readonly coverage?: boolean;
  readonly toolchain?: boolean;
  readonly tarball_smoke?: boolean;
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

// ── ci.yml ───────────────────────────────────────────────────────────────────

describe("ci.yml — the merge-blocking gate", () => {
  const jobs = ci.workflow.jobs;
  const check = stepsOf(ci, "check");

  it("keeps the four lanes: the matrix gate, two advisory probes, and one stable aggregator", () => {
    expect(Object.keys(jobs)).toEqual([
      "check",
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

  it("pins the three legs and the per-leg flags that drive the step split", () => {
    const strategy = jobs["check"]?.strategy;
    expect(strategy?.["fail-fast"]).toBe(false);
    expect(strategy?.matrix?.include).toEqual([
      {
        os: "ubuntu-latest",
        node: "22.12.0",
        label: "floor",
        coverage: true,
        tarball_smoke: true,
      },
      { os: "ubuntu-latest", node: "24", label: "lts", coverage: true, toolchain: true },
      { os: "windows-latest", node: "24", label: "windows" },
    ]);
    // The job name has to carry the leg, or three rows report under one name.
    expect(jobs["check"]?.name).toContain("matrix.label");
    expect(jobs["check"]?.name).toContain("matrix.node");
  });

  it("fixes windows line endings BEFORE checkout, or the byte-diffing gates report a false red", () => {
    // Git's default core.autocrlf on Windows rewrites LF to CRLF as it writes the working tree,
    // and this repository has no .gitattributes to override it. `check` diffs regenerated output
    // against committed bytes; a line-ending rewrite would surface as a content drift.
    const guard = indexOf(check, "Pin line endings before checkout");
    expect(guard).toBe(0);
    expect(guard).toBeLessThan(indexOf(check, "Checkout"));
    expect(conditionOf(check, "Pin line endings before checkout")).toBe("runner.os == 'Windows'");
    expect(runOf(check, "Pin line endings before checkout")).toContain("core.autocrlf false");
  });

  it("keeps the vendor-unsupported toolchain steps on one leg and the runtime gates on all three", () => {
    // tsdown declares ^22.18.0 and eslint ^22.13.0, both above the declared engines floor, and
    // none of these four answers a question that depends on the OS or the Node version.
    for (const step of ["Typecheck", "Lint", "Self-consistency (generate-and-diff)", "Unused code and dependencies"]) {
      expect(conditionOf(check, step), step).toBe("matrix.toolchain");
    }
    // Runtime verification stays on every leg — that is what the floor and windows legs are for.
    for (const step of ["Install", "Build", "Dogfood check", "Leak gate"]) {
      expect(conditionOf(check, step), step).toBe("");
    }
    expect(conditionOf(check, "Tarball smoke (publish shape)")).toBe("matrix.tarball_smoke");
  });

  it("runs the coverage floors on the legs that can meet them, and the suite on all of them", () => {
    // vitest.config.ts holds the merge and emit core at 100% and those floors BLOCK. The windows
    // leg skips the mode- and symlink-dependent cases by platform guard, so a coverage run there
    // would report a shortfall that belongs to the platform. The floors are untouched: they still
    // gate, on both ubuntu legs, and windows runs the same suite without the instrument.
    expect(runOf(check, "Test with coverage floors")).toBe("npm test -- --coverage");
    expect(conditionOf(check, "Test with coverage floors")).toBe("matrix.coverage");
    expect(runOf(check, "Test")).toBe("npm test");
    expect(conditionOf(check, "Test")).toBe("${{ !matrix.coverage }}");
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
    expect(floor?.node).toBe("22.12.0");
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
    expect(aggregator.needs).toEqual(["check", "supply-chain"]);
    // `if: always()` is what makes it run after a FAILED dependency; without it the aggregator is
    // skipped, and a skipped required check reads as green.
    expect(aggregator.if).toBe("always()");
    const report = aggregator.steps.map((step) => step.run ?? "").join("\n");
    // It must assert on the result rather than merely echo it: `needs` alone cannot express
    // "cancelled is not success".
    expect(report).toContain('test "${{ needs.check.result }}" = "success"');
    // The advisory lane is reported, never required — it exists not to block.
    expect(report).toContain("needs.supply-chain.result");
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
      // The pull-request gates live in a sibling file; a lane map that did not name them would
      // read as if this workflow were the whole merge gate.
      "pr-checks",
    ]) {
      expect(laneMap, `lane map must name the running lane ${lane}`).toContain(lane);
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

// ── nightly.yml ──────────────────────────────────────────────────────────────

describe("nightly.yml — demoted lanes, none of them merge-blocking", () => {
  it("carries the three demoted legs and no aggregator to require", () => {
    expect(Object.keys(nightly.workflow.jobs)).toEqual([
      "macos-smoke",
      "node-next",
      "headless-lane",
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

  it("arms the headless drive behind a credential check that exits 0 and says so", () => {
    const steps = stepsOf(nightly, "headless-lane");
    const creds = stepOf(steps, "Headless drive credentials");

    expect(creds.id).toBe("creds");
    // Read into an env var rather than compared inside an `if:`, so the absent case produces a
    // notice a reader can find instead of a silently skipped step.
    expect(Object.keys(creds.env ?? {})).toContain("ANTHROPIC_API_KEY");
    expect(creds.run).toContain("enabled=false");
    expect(creds.run).toContain("::notice title=Headless drive skipped::");
    expect(creds.run).toContain("exit 0");

    // The drive step exists, is guarded, and comes after the gate that arms it.
    expect(conditionOf(steps, "Headless target-tool drive")).toBe(
      "steps.creds.outputs.enabled == 'true'",
    );
    expect(indexOf(steps, "Headless target-tool drive")).toBeGreaterThan(
      indexOf(steps, "Headless drive credentials"),
    );
    // Armed, not enabled: with no harness behind it, the step reports rather than pretending to
    // measure. Evaluated both ways so the guard is proven to be the switch, not decoration.
    const condition = conditionOf(steps, "Headless target-tool drive");
    expect(
      evaluateWorkflowExpression(condition, { steps: { creds: { outputs: { enabled: "false" } } } }),
    ).toBe(false);
    expect(
      evaluateWorkflowExpression(condition, { steps: { creds: { outputs: { enabled: "true" } } } }),
    ).toBe(true);
  });
});


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
    expect(jobOf(ci, "all-ci-checks").needs).toEqual(["check", "supply-chain"]);
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
    // The API's own commit list, not a `base..head` range a rebased base branch can break.
    expect(run).toContain("/pulls/$PR_NUMBER/commits");
    // A long branch must not be judged on its first page.
    expect(run).toContain("--paginate");
    expect(run).toContain("Signed-off-by: ");
    // A lookup that returned nothing and a fully signed-off branch are the same shape here.
    expect(run).toContain('[ "$TOTAL" -eq 0 ]');
    // So is a truncated one: the endpoint caps at 250, and the part that fitted is not an answer.
    expect(run).toContain('[ "$TOTAL" -ge 250 ]');
    // The failure names the commits, or the contributor has to go and find them.
    expect(run).toContain("::error title=Missing DCO sign-off::");
    expect(run).toContain("$UNSIGNED");
    expect(run).toContain("git rebase --signoff origin/main");
    // No checkout: this job runs nothing out of the diff it is judging.
    expect(steps.some((step) => (step.uses ?? "").startsWith("actions/checkout@"))).toBe(false);
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
    }

    // CONTRIBUTING used to claim the DCO and the title were "checked in CI" while no job checked
    // either. The claim is true now, and the page has to name the lane that makes it true.
    expect(contributing).toContain("checked by the `pr-checks` workflow");
    expect(contributing, "the unattributed CI claim must not come back").not.toContain(
      "Both are checked in CI",
    );
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
    expect(Object.keys(release.workflow.jobs)).toEqual(["gates", "publish", "dry-run-summary"]);
    expect(publish.needs).toBe("gates");
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

    expect(publish.permissions).toEqual({ contents: "write", "id-token": "write" });
    // The single approval point: environment protection rules are the platform-side control the
    // in-file ancestry probe cannot be.
    expect(publish.environment).toBe("npm-publish");
  });

  it("blocks egress on both jobs, from the first step, with an explicit allowlist", () => {
    for (const [label, steps] of [
      ["gates", gatesSteps],
      ["publish", publishSteps],
    ] as const) {
      const harden = steps.find((step) => (step.uses ?? "").startsWith("step-security/harden-runner@"));
      expect(harden, `${label} must harden the runner`).toBeDefined();
      expect(harden?.with?.["egress-policy"], label).toBe("block");
      expect(harden?.with?.["disable-sudo"], label).toBe(true);
      const allowed = String(harden?.with?.["allowed-endpoints"] ?? "");
      expect(allowed, label).toContain("registry.npmjs.org:443");
      expect(allowed, label).toContain("api.github.com:443");
    }
    // The gates job holds no token, so the OIDC and Sigstore hosts must not be reachable from it.
    const gatesAllow = String(
      gatesSteps.find((step) => (step.uses ?? "").startsWith("step-security/harden-runner@"))?.with?.[
        "allowed-endpoints"
      ] ?? "",
    );
    expect(gatesAllow).not.toContain("token.actions.githubusercontent.com");
    expect(gatesAllow).not.toContain("sigstore.dev");

    const publishAllow = String(
      publishSteps.find((step) => (step.uses ?? "").startsWith("step-security/harden-runner@"))
        ?.with?.["allowed-endpoints"] ?? "",
    );
    expect(publishAllow).toContain("token.actions.githubusercontent.com:443");
    expect(publishAllow).toContain("fulcio.sigstore.dev:443");
    expect(publishAllow).toContain("uploads.github.com:443");

    // First step, before anything downloads or executes.
    expect(gatesSteps[0]?.name).toBe("Harden runner");
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

  it("runs the whole ladder on the shipping commit, before the pack boundary", () => {
    const pack = indexOf(gatesSteps, "Pack tarball");
    for (const step of [
      "Install",
      "Build",
      "Test",
      "Leak gate",
      "Dogfood check",
      "Tarball smoke (publish shape)",
    ]) {
      const at = indexOf(gatesSteps, step);
      expect(at, `${step} must run in the gates job`).toBeGreaterThanOrEqual(0);
      expect(at, `${step} must precede the pack`).toBeLessThan(pack);
    }
    expect(runOf(gatesSteps, "Leak gate")).toBe("npm run gate");
    expect(runOf(gatesSteps, "Tarball smoke (publish shape)")).toBe("node scripts/tarball-smoke.mjs");
  });

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

  describe("a dry run cannot publish", () => {
    /** The condition this file must carry, character for character. */
    const PUBLISH_CONDITION =
      "(github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')) || " +
      "(github.event_name == 'workflow_dispatch' && format('{0}', inputs.dry_run) == 'false')";

    const condition = (publish.if ?? "").replace(/\s+/g, " ").trim();

    it("pins the publish condition exactly, string compare and all", () => {
      expect(condition, "the publish job must be conditional").not.toBe("");
      expect(condition).toBe(PUBLISH_CONDITION);
    });

    it("admits a tag push and an explicit dry_run=false, and nothing else", () => {
      for (const shape of TRIGGER_SHAPES) {
        expect(evaluateWorkflowExpression(condition, shape.context), shape.label).toBe(
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
        const publishes = evaluateWorkflowExpression(condition, shape.context);
        const reports = evaluateWorkflowExpression(summaryCondition, shape.context);
        expect(publishes !== reports, `${shape.label}: exactly one of publish/report`).toBe(true);
        expect(reports, shape.label).toBe(!shape.publishes);
      }
      expect(evaluateWorkflowExpression(summaryCondition, TAG_PUSH)).toBe(false);

      // A rehearsal is only useful if it names what a real run would have shipped.
      const report = summary.steps.map((step) => step.run ?? "").join("\n");
      for (const field of ["PACKAGE_NAME", "VERSION", "TARBALL", "TARBALL_SHA256", "SBOM_PRESENT"]) {
        expect(report, `the summary must report ${field}`).toContain(field);
      }
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
    for (const trigger of ["pull_request", "push"]) {
      expect(on[trigger]?.paths, `${trigger} must be path-filtered`).toEqual(
        expect.arrayContaining(["website/**", "docs/**", "README.md"]),
      );
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
    // Pages is not enabled and the domain is not claimed. A deploy path whose preconditions live
    // only in someone's memory is a deploy path that gets tried and fails, or worse, succeeds at
    // a URL nobody meant to publish.
    expect(docsSite.source).toContain("ARMING CONDITION");
    expect(docsSite.source).toContain("stamity.dev");
    expect(docsSite.source.toLowerCase()).toContain("not enabled");
  });

  describe("nothing but an armed dispatch can deploy", () => {
    /** The condition this file must carry, character for character. */
    const DEPLOY_CONDITION =
      "github.event_name == 'workflow_dispatch' && format('{0}', inputs.deploy) == 'true'";

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
    ];

    it("pins the deploy condition exactly, string compare and all", () => {
      expect(condition, "the deploy job must be conditional").not.toBe("");
      expect(condition).toBe(DEPLOY_CONDITION);
    });

    it("admits an explicit deploy=true dispatch, and nothing else", () => {
      for (const shape of SHAPES) {
        expect(evaluateWorkflowExpression(condition, shape.context), shape.label).toBe(
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
    const publishing = ALL_STEPS.filter(([, , step]) => /\bnpm publish\b/.test(step.run ?? ""));
    expect(publishing.map(([file, job]) => `${file}:${job}`)).toEqual(["release.yml:publish"]);
  });

  it("hands the OIDC grant to exactly the two jobs that exchange it for a deployment", () => {
    // A CLOSED list, which is the property — not a count. Two jobs hold `id-token: write`:
    // `release.yml:publish` exchanges it for npm's provenance attestation, and
    // `docs-site.yml:deploy` exchanges it for a GitHub Pages deployment token. Both are gated by
    // a `format()`-compared condition that fails closed, and the docs-site one is evaluated
    // against every trigger shape below, so admitting it here does not widen what can reach it.
    // A third holder is a decision that lands with a line in this list and a fence to match.
    const holders = ALL_JOBS.filter(([, , job]) =>
      Object.keys(job.permissions ?? {}).includes("id-token"),
    ).map(([file, id]) => `${file}:${id}`);
    expect(holders).toEqual(["docs-site.yml:deploy", "release.yml:publish"]);
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
    for (const [where, env] of scopes) {
      for (const key of Object.keys(env ?? {})) {
        expect(FORBIDDEN.has(key), `${where} declares ${key}`).toBe(false);
      }
    }
    // And the bytes, because a credential can also arrive as a `with:` input or a `run:` line.
    for (const { file, source } of ALL_WORKFLOWS) {
      expect(source, file).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN|secrets\.NPM/);
    }
  });

  it("reads only the secrets this repository knowingly holds", () => {
    // A closed list, so adding a secret is a decision recorded here rather than a line nobody
    // reviews. GITHUB_TOKEN is the per-run token; ANTHROPIC_API_KEY arms the nightly headless
    // lane and is absent by design, which that lane says out loud.
    const referenced = new Set(
      ALL_WORKFLOWS.flatMap(({ source }) =>
        [...source.matchAll(/secrets\.([A-Z_][A-Z0-9_]*)/g)].map((match) => match[1] ?? ""),
      ),
    );
    expect([...referenced].toSorted()).toEqual(["ANTHROPIC_API_KEY", "GITHUB_TOKEN"]);
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
    // Two jobs in the repository may write, each behind its own fail-closed condition: the one
    // that creates the release, and the one that publishes the docs site. Neither is reachable
    // from a push, a pull request or an unarmed dispatch, and the conditions that make that true
    // are evaluated — not read for substrings — in their own suites above.
    const writers = ALL_JOBS.filter(([, , job]) =>
      Object.values(job.permissions ?? {}).includes("write"),
    ).map(([file, id]) => `${file}:${id}`);
    expect(writers).toEqual(["docs-site.yml:deploy", "release.yml:publish"]);
    // And neither of them can start on its own: a write grant behind a condition that is missing
    // is a write grant on every trigger the workflow declares.
    for (const holder of writers) {
      const [file, id] = holder.split(":");
      const job = ALL_JOBS.find(([f, i]) => f === file && i === id)?.[2];
      expect(job?.if ?? "", `${holder} must be conditional`).not.toBe("");
    }
  });

  it("references only scripts/*.mjs files that exist on disk", () => {
    const referenced = ALL_STEPS.flatMap(([, , step]) =>
      Array.from(
        (step.run ?? "").matchAll(/node (scripts\/[\w-]+\.mjs)/g),
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
    ]) {
      expect(referenced).toContain(script);
    }
    for (const script of referenced) {
      expect(existsSync(join(REPO_ROOT, script)), `${script} must exist`).toBe(true);
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

describe("dependabot.yml — the update policy behind the pins", () => {
  const source = readFileSync(join(REPO_ROOT, ".github", "dependabot.yml"), "utf8");
  const config = parse(source) as {
    version: number;
    updates: readonly {
      "package-ecosystem": string;
      directory: string;
      schedule: { interval: string };
      groups?: Record<string, { "dependency-type": string }>;
    }[];
  };

  it("covers both ecosystems weekly, and every npm manifest in the tree", () => {
    expect(config.version).toBe(2);
    expect(
      config.updates.map((entry) => `${entry["package-ecosystem"]} ${entry.directory}`),
    ).toEqual(["npm /", "npm /website", "github-actions /"]);
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
