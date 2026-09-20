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

/**
 * A matrix row from either matrix job. `check` legs carry os/node/label; `apm-install` legs carry
 * apm/role, so every field is optional — one interface over two matrices, with each suite
 * asserting the whole row it expects rather than trusting the type to have narrowed it.
 */
interface MatrixInclude {
  readonly os?: string;
  readonly node?: string;
  readonly label?: string;
  readonly coverage?: boolean;
  readonly toolchain?: boolean;
  readonly tarball_smoke?: boolean;
  readonly apm?: string;
  readonly role?: string;
  readonly expect_failure?: boolean;
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

// ── ci.yml ───────────────────────────────────────────────────────────────────

describe("ci.yml — the merge-blocking gate", () => {
  const jobs = ci.workflow.jobs;
  const check = stepsOf(ci, "check");

  it("keeps the five lanes: two matrix gates, two advisory probes, and one stable aggregator", () => {
    expect(Object.keys(jobs)).toEqual([
      "check",
      "apm-install",
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
        node: "22.22.2",
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

  it("keeps the toolchain steps on one leg and the runtime gates on all three", () => {
    // None of these four answers a question that depends on the OS or the Node version, so a
    // second copy of them buys no coverage. The older reason — tsdown declares ^22.18.0 and
    // eslint ^22.13.0, both above the 22.12.0 floor this matrix used to run — retired with the
    // move to 22.22.2, which satisfies both.
    for (const step of ["Typecheck", "Lint", "Self-consistency (generate-and-diff)", "Unused code and dependencies"]) {
      expect(conditionOf(check, step), step).toBe("matrix.toolchain");
    }
    // Runtime verification stays on every leg — that is what the floor and windows legs are for.
    for (const step of ["Install", "Build", "Dogfood check", "Leak gate"]) {
      expect(conditionOf(check, step), step).toBe("");
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
    // The four plugin/marketplace surfaces, same posture: a drifted manifest
    // fails with the regeneration command rather than being rewritten by CI.
    expect(run).toContain("node scripts/generate-plugin-manifests.mjs --check");
    // The fifth published surface — `apm.yml` and the `.apm/` primitive tree —
    // rides the same step and the same verify-only posture. It is the one whose
    // FILE SET follows the corpus, so a retired artifact has to fail here
    // rather than linger as a primitive nothing regenerates.
    expect(run).toContain("node scripts/generate-apm-package.mjs --check");
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
    // wait on a job that never reports. `apm-install` runs on every trigger this workflow
    // declares, so requiring it costs no push a wait on a job that will not report.
    expect(aggregator.needs).toEqual(["check", "supply-chain", "apm-install"]);
    // `if: always()` is what makes it run after a FAILED dependency; without it the aggregator is
    // skipped, and a skipped required check reads as green.
    expect(aggregator.if).toBe("always()");
    const report = aggregator.steps.map((step) => step.run ?? "").join("\n");
    // It must assert on the result rather than merely echo it: `needs` alone cannot express
    // "cancelled is not success".
    expect(report).toContain('test "${{ needs.check.result }}" = "success"');
    // The APM route is merge-blocking on the same terms: a deployment that stopped happening is
    // not something to read in a log afterwards.
    expect(report).toContain('test "${{ needs.apm-install.result }}" = "success"');
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
      // The APM route lane, whose whole claim is that it reads a deployed tree rather than an
      // exit code. A map that did not name it would leave the reader thinking the generated
      // package's byte-diff is the only thing guarding that surface.
      "apm-install",
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
    expect(jobOf(ci, "all-ci-checks").needs).toEqual(["check", "supply-chain", "apm-install"]);
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
    { label: "canonical APM", job: jobOf(release, "apm-route"), context: TAG_PUSH },
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
  const apmRoute = jobOf(release, "apm-route");
  const publish = jobOf(release, "publish");
  const gatesSteps = stepsOf(release, "gates");
  const apmRouteSteps = stepsOf(release, "apm-route");
  const publishSteps = stepsOf(release, "publish");

  it("splits gates from publish, and adds a rehearsal job that cannot ship", () => {
    expect(Object.keys(release.workflow.jobs)).toEqual([
      "gates",
      "apm-route",
      "publish",
      "dry-run-summary",
    ]);
    // `apm-route` runs a third-party interpreter — pip's unpinned closure, then apm itself — so it
    // is a job of its own rather than a step in the job that packs the shipping tarball: it holds
    // no credential and has no path to the artifact. `publish` needs BOTH, which is what makes it
    // a gate rather than a report.
    expect(publish.needs).toEqual(["gates", "apm-route"]);
    expect(apmRoute.needs, "the route smoke needs nothing from the build").toBeUndefined();
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

    // Same for the route smoke, which runs an interpreter and a pip closure neither this
    // repository nor its lockfile pins, and carries a timeout of its own.
    expect(apmRoute.permissions).toEqual({ contents: "read" });
    expect(apmRoute["timeout-minutes"]).toBeTypeOf("number");
    expect(apmRoute["runs-on"]).toBe("ubuntu-latest");

    // TEST CHANGE, justified: the publish job's grant set moved when it began attesting the
    // plugin archives. `attestations: write` persists the attestation and `artifact-metadata:
    // write` creates its storage record — the two the attestation action's own README requires
    // beside `id-token`. The property this case pins is unchanged and is asserted above: no job
    // that runs third-party code holds any of them. The exact set, and the reason each member is
    // there, is pinned in "attests the archives with a pinned action …" below.
    expect(publish.permissions).toEqual({
      contents: "write",
      "id-token": "write",
      attestations: "write",
      "artifact-metadata": "write",
    });
    // The single approval point: environment protection rules are the platform-side control the
    // in-file ancestry probe cannot be.
    expect(publish.environment).toBe("npm-publish");
  });

  it("blocks egress on every job, from the first step, with an explicit allowlist", () => {
    for (const [label, steps] of [
      ["gates", gatesSteps],
      ["apm-route", apmRouteSteps],
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
      if (label !== "apm-route") {
        for (let account = 0; account < 20; account += 1) {
          expect(allowlistOf(steps), label).toContain(`productionresultssa${account}.blob.core.windows.net:443`);
        }
      }
    }

    // First step, before anything downloads or executes — in both jobs that run third-party code.
    // `publish` is the documented exception: its dispatch backstop opens no socket and reads no
    // file, and stopping a run that should not have started comes before installing a monitor.
    expect(gatesSteps[0]?.name).toBe("Harden runner");
    expect(apmRouteSteps[0]?.name).toBe("Harden runner");

    // The gates job holds no token, so the OIDC and Sigstore hosts must not be reachable from it.
    const gatesAllow = allowlistOf(gatesSteps);
    expect(gatesAllow).toContain("registry.npmjs.org:443");
    expect(gatesAllow).not.toContain("token.actions.githubusercontent.com");
    expect(gatesAllow).not.toContain("sigstore.dev");
    // And the three the APM route smoke needs are NOT reachable from the job that packs the
    // tarball: that smoke runs a third-party interpreter, so it lives in `apm-route` and its
    // hosts live with it. A host that drifted back here would be an interpreter's index opened
    // up in the job that builds the shipping artifact.
    expect(gatesAllow).not.toContain("pypi.org");
    expect(gatesAllow).not.toContain("files.pythonhosted.org");
    expect(gatesAllow).not.toContain("raw.githubusercontent.com");

    // harden-runner fails CLOSED, so a host dropped from this list is a release that stops at the
    // step rather than a release that leaks.
    const apmAllow = allowlistOf(apmRouteSteps);
    expect(apmAllow).toContain("pypi.org:443");
    expect(apmAllow).toContain("files.pythonhosted.org:443");
    expect(apmAllow).toContain("raw.githubusercontent.com:443");
    // It installs nothing from npm and mints nothing, so neither the registry nor the token hosts
    // belong here either.
    expect(apmAllow).not.toContain("registry.npmjs.org");
    expect(apmAllow).not.toContain("token.actions.githubusercontent.com");
    expect(apmAllow).not.toContain("sigstore.dev");

    const publishAllow = allowlistOf(publishSteps);
    expect(publishAllow).toContain("registry.npmjs.org:443");
    expect(publishAllow).toContain("token.actions.githubusercontent.com:443");
    expect(publishAllow).toContain("fulcio.sigstore.dev:443");
    expect(publishAllow).toContain("uploads.github.com:443");

    // M5: the setup-python fallback host is listed by exactly one job in the whole directory, and
    // it is the one that runs setup-python.
    const rawHosts = ALL_JOBS.filter(([, , job]) =>
      (job.steps ?? []).some((step) =>
        String(step.with?.["allowed-endpoints"] ?? "").includes("raw.githubusercontent.com"),
      ),
    ).map(([file, id]) => `${file}:${id}`);
    expect(rawHosts).toEqual(["release.yml:apm-route"]);
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
    // packs the shipping tarball is exactly the adjacency `apm-route` exists to remove.
    const gatesShell = gatesSteps.map((step) => step.run ?? "").join("\n");
    expect(gatesShell).not.toContain("apm-install-smoke");
    expect(gatesShell).not.toMatch(/\bpython\b|\bpip\b/);
    expect(indexOf(gatesSteps, "Set up Python"), "setup-python belongs to apm-route").toBe(-1);
  });

  it("proves the published ROUTE in a job with no credential and no path to the artifact", () => {
    // The published SHAPE is proven by the gates job's tarball smoke; this proves the published
    // ROUTE, at the canonical remote and the exact shipping commit. A package whose bytes are
    // right and whose resolver cannot reach it is the failure that put this job here.
    //
    // The remote, at this commit — not the working tree. An install from the checkout would prove
    // the local files deploy and say nothing about whether the resolver can reach them.
    const smoke = runOf(apmRouteSteps, "APM route smoke (canonical ref)");
    expect(smoke).toContain("node scripts/apm-install-smoke.mjs");
    expect(smoke).toContain('--source "zomarit/stamity#${SHA}"');
    expect(smoke).toContain("--targets claude,copilot,cursor,codex");
    // The sha reaches the shell through `env:`, like every other value in this file.
    expect(stepOf(apmRouteSteps, "APM route smoke (canonical ref)").env?.["SHA"]).toBe(
      "${{ github.sha }}",
    );

    // The interpreter is pinned the way the Node line is — a runner-image refresh must not move
    // it — and to the same pin ci.yml's apm matrix already carries.
    expect(stepOf(apmRouteSteps, "Set up Python").uses).toBe(
      stepOf(stepsOf(ci, "apm-install"), "Set up Python").uses,
    );
    expect(stepOf(apmRouteSteps, "Set up Python").with?.["python-version"]).toBe("3.13");
    expect(stepOf(apmRouteSteps, "Set up Node").uses).toBe(stepOf(gatesSteps, "Set up Node").uses);
    expect(stepOf(apmRouteSteps, "Set up Node").with?.["node-version"]).toBe(
      stepOf(gatesSteps, "Set up Node").with?.["node-version"],
    );

    // No path to the packed artifact: a shallow, credential-free checkout of the scripts, no
    // build, no npm install, and nothing uploaded or downloaded between this job and any other.
    const checkout = stepOf(apmRouteSteps, "Checkout");
    expect(checkout.with?.["persist-credentials"]).toBe(false);
    expect(checkout.with?.["fetch-depth"]).toBe(1);
    for (const step of apmRouteSteps) {
      expect((step.uses ?? "").includes("upload-artifact"), step.name).toBe(false);
      expect((step.uses ?? "").includes("download-artifact"), step.name).toBe(false);
    }
    const routeShell = apmRouteSteps.map((step) => step.run ?? "").join("\n");
    expect(routeShell).not.toMatch(/npm (ci|install|run build|pack)/);
    expect(routeShell).not.toContain("dist/");
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


  // ── the plugin distribution: built in `gates`, published from `publish` ─────
  //
  // The fifth and sixth published surfaces ride the same release as the tarball: four plugin
  // roots on an orphan branch, and their archives on the GitHub release. Everything below is one
  // property in two halves — the job that runs third-party code BUILDS the tree and states its
  // digest on the outputs channel, and the job that holds the credential PUBLISHES a tree whose
  // digest it re-derived from that channel.

  it("builds the plugin runtime and the distribution from the packed tarball, after the smoke", () => {
    const pack = indexOf(gatesSteps, "Pack tarball");
    const runtime = indexOf(gatesSteps, "Build plugin runtime");
    const distribution = indexOf(gatesSteps, "Build plugin distribution");

    // Both build steps read the tarball the pack step produced — the PUBLISHED shape, never the
    // working tree — so neither can precede it, and both come after the smoke that proves that
    // tarball installs at all.
    expect(indexOf(gatesSteps, "Tarball smoke (publish shape)")).toBeLessThan(pack);
    expect(pack).toBeLessThan(runtime);
    expect(runtime).toBeLessThan(distribution);

    expect(runOf(gatesSteps, "Build plugin runtime")).toContain(
      'node scripts/build-plugin-runtime.mjs --tarball "$TARBALL" --out dist/plugin-runtime',
    );
    // The tarball name reaches the shell through `env:`, like every other value in this file.
    expect(stepOf(gatesSteps, "Build plugin runtime").env?.["TARBALL"]).toBe(
      "${{ steps.pack.outputs.tarball }}",
    );

    const build = runOf(gatesSteps, "Build plugin distribution");
    expect(build).toContain("node scripts/build-plugin-distribution.mjs");
    expect(build).toContain("--out dist/plugins");
    expect(build).toContain("--runtime dist/plugin-runtime");
    // Provenance is an INPUT to that builder, never a clock read: the archives' entry timestamps
    // and every manifest here are stamped from these two values, which is what makes two builds
    // of one commit produce the same bytes — the property the digest check below rests on.
    expect(build).toContain('--source-commit "$GITHUB_SHA"');
    expect(build).toContain('--source-commit-date "$(git show -s --format=%cI "$GITHUB_SHA")"');

    // Both trees land under `dist/`, which is gitignored, rather than beside the checkout. An
    // untracked `plugin-runtime/` in the workspace would enter `git ls-files --others` — which is
    // the leak gate's own scan — and every tree-cleanliness check after it.
    for (const step of ["Build plugin runtime", "Build plugin distribution"] as const) {
      expect(runOf(gatesSteps, step), step).toMatch(/--out dist\//);
      expect(runOf(gatesSteps, step), step).not.toMatch(/--out (?!dist\/)/);
    }
    expect(release.source).toContain("git ls-files --others");
  });

  it("uploads the distribution whole — dot directories and all — with its digest on the outputs channel", () => {
    const upload = stepOf(gatesSteps, "Upload plugin distribution");
    expect(upload.uses).toBe(stepOf(gatesSteps, "Upload release artifacts").uses);
    expect(upload.with?.["name"]).toBe("release-plugins");
    expect(upload.with?.["path"]).toBe("dist/plugins");
    expect(upload.with?.["if-no-files-found"]).toBe("error");
    // The same seven days, and for the same reason: this artifact also has to outlive the
    // `npm-publish` environment's human approval, not just the run that produced it.
    expect(upload.with?.["retention-days"]).toBe(7);
    // EVERY catalog in this distribution lives in a DOT directory — `.claude-plugin/`,
    // `.cursor-plugin/`, `.agents/plugins/`, `.github/plugin/` — and so does the APM primitive
    // tree (`.apm/`). actions/upload-artifact drops hidden files unless told otherwise, so
    // without this the branch would be pushed with every catalog missing and every gate green.
    expect(upload.with?.["include-hidden-files"]).toBe(true);
    expect(indexOf(gatesSteps, "Build plugin distribution")).toBeLessThan(
      indexOf(gatesSteps, "Upload plugin distribution"),
    );

    // The digest travels on the job-output channel, exactly as the tarball's does: a digest read
    // from inside the artifact it verifies attests itself.
    expect(stepOf(gatesSteps, "Build plugin distribution").id).toBe("plugins");
    for (const output of [
      "plugins_manifest_sha256",
      "plugins_branch",
      "plugins_tag",
      "plugins_archives",
    ]) {
      expect(gates.outputs?.[output], `the gates job must publish ${output}`).toBe(
        `\${{ steps.plugins.outputs.${output} }}`,
      );
    }

    // Branch, tag and archive names are READ OUT of the manifest the builder just wrote rather
    // than spelled a second time here: `scripts/distribution-identity.mjs` owns those values, and
    // a workflow that names `plugin-dist` itself is a second source of truth for them.
    expect(runOf(gatesSteps, "Build plugin distribution")).toContain("dist/plugins/release.json");
    const shell = [...gatesSteps, ...publishSteps]
      .map((step) => step.run ?? "")
      .join("\n")
      // The builder's own file name carries the branch name as a substring; what must not appear
      // is the VALUE, spelled by this workflow instead of read from the manifest.
      .replaceAll("build-plugin-distribution.mjs", "<the builder>");
    expect(shell, "the branch name belongs to the identity, not to this file").not.toContain(
      "plugin-dist",
    );
    expect(shell, "and so does the tag pattern").not.toContain("plugins/v");
  });

  it("verifies the distribution against the gates output before anything is pushed", () => {
    const download = stepOf(publishSteps, "Download plugin distribution");
    expect(download.uses).toBe(stepOf(publishSteps, "Download release artifacts").uses);
    expect(download.with?.["name"]).toBe("release-plugins");
    expect(download.with?.["path"]).toBe("plugins");

    const verify = runOf(publishSteps, "Verify plugin distribution digest");
    expect(stepOf(publishSteps, "Verify plugin distribution digest").env?.["EXPECTED_SHA"]).toBe(
      "${{ needs.gates.outputs.plugins_manifest_sha256 }}",
    );
    // An empty expected value fails closed here too: a missing output cannot read as a match.
    expect(verify).toContain('[ -z "$EXPECTED_SHA" ]');
    expect(verify).toContain("Refusing to publish");
    // The manifest is the anchor the output covers, and every archive is then checked against the
    // digests IT carries — so the whole tree hangs off a channel the artifact never travelled on.
    expect(verify).toContain("packages");
    // TEST CHANGE, justified: these two step-order assertions moved from "before the push" to
    // "before the npm publish". The behaviour that moved is the ordering in the job, and the
    // reason is what each half costs on failure — fetching and verifying can only REFUSE (a
    // missing artifact, a digest that does not match), and refusing after npm had published
    // would strand a registry version no re-run of this job can finish, since `npm publish`
    // rejects the version it already shipped. The half that runs after the publish is the
    // re-runnable one: the orphan commit is a pure function of the tree, so a second run
    // rebuilds the same sha and moves no ref (proven in the executed suite below). The
    // publish-side ordering of attest, push and stamp is unchanged and still pinned.
    expect(indexOf(publishSteps, "Download plugin distribution")).toBeLessThan(
      indexOf(publishSteps, "Verify plugin distribution digest"),
    );
    expect(indexOf(publishSteps, "Verify plugin distribution digest")).toBeLessThan(
      indexOf(publishSteps, "Publish to npm with provenance"),
    );
  });

  it("attests the archives with a pinned action and exactly the grants that action documents", () => {
    const attest = stepOf(publishSteps, "Attest plugin archives");
    expect(attest.uses).toMatch(/^actions\/attest-build-provenance@[0-9a-f]{40}$/);
    // The pin policy in full, for the one action this unit adds: a full sha AND the exact version
    // it resolves to, so a bump across a major cannot inherit a comment that still reads true.
    expect(release.source).toContain(`uses: ${String(attest.uses)} # v4.2.2`);
    expect(attest.with?.["subject-path"]).toBe("plugins/*.zip");

    // `id-token` mints the Sigstore signing certificate, `attestations` persists the attestation,
    // and `artifact-metadata` creates the artifact storage record — the three the action's own
    // README requires. `contents: write` was already here for `gh release create` and now also
    // pushes the distribution branch and its tag.
    expect(publish.permissions).toEqual({
      contents: "write",
      "id-token": "write",
      attestations: "write",
      "artifact-metadata": "write",
    });
    expect(indexOf(publishSteps, "Verify plugin distribution digest")).toBeLessThan(
      indexOf(publishSteps, "Attest plugin archives"),
    );
    expect(indexOf(publishSteps, "Attest plugin archives")).toBeLessThan(
      indexOf(publishSteps, "Push plugin distribution"),
    );
  });

  it("pushes one orphan commit and a tag no re-run can move", () => {
    const step = stepOf(publishSteps, "Push plugin distribution");
    const push = runOf(publishSteps, "Push plugin distribution");
    expect(step.env?.["GH_TOKEN"]).toBe("${{ secrets.GITHUB_TOKEN }}");
    expect(step.env?.["BRANCH"]).toBe("${{ needs.gates.outputs.plugins_branch }}");
    expect(step.env?.["TAG"]).toBe("${{ needs.gates.outputs.plugins_tag }}");
    expect(step.env?.["VERSION"]).toBe("${{ needs.gates.outputs.version }}");

    expect(push).toContain("git init");
    expect(push).toContain('git checkout -q --orphan "$BRANCH"');
    expect(push).toContain("github-actions[bot]");
    expect(push).toContain('git commit -q -m "plugins: v$VERSION from $GITHUB_SHA"');
    // The branch head is REPLACED on every release by design — the tree is published whole, and a
    // merge of two releases' catalogs would describe neither. Every prior release stays reachable
    // through its own tag, which is why the TAG is the ref that fails closed rather than moving.
    expect(push).toContain("git push --force");
    expect(push).toContain("git ls-remote");
    expect(push).toContain("Refusing to move a published distribution tag");
    // After the npm publish: that is the release's irreversible step, and everything downstream
    // of it is ordered against it rather than racing it.
    expect(indexOf(publishSteps, "Publish to npm with provenance")).toBeLessThan(
      indexOf(publishSteps, "Push plugin distribution"),
    );
  });

  it("stamps the distribution commit into the release asset, never into the branch's own copy", () => {
    const STAMP_STEP = "Stamp the release manifest with the distribution commit";
    // The commit a tree lands on is the one fact the builder cannot know while it is building
    // that tree, so `release.json` carries `distribution.commit: null` until it is pushed. The
    // branch keeps that copy; the release ASSET is the stamped one, and the stamp runs after the
    // push for the plain reason that the sha does not exist before it.
    expect(indexOf(publishSteps, "Push plugin distribution")).toBeLessThan(
      indexOf(publishSteps, STAMP_STEP),
    );
    expect(indexOf(publishSteps, STAMP_STEP)).toBeLessThan(
      indexOf(publishSteps, "Create GitHub release"),
    );
    expect(runOf(publishSteps, "Push plugin distribution")).toContain(
      'echo "PLUGINS_COMMIT=$DIST_COMMIT" >> "$GITHUB_ENV"',
    );
    expect(runOf(publishSteps, STAMP_STEP)).toContain("PLUGINS_COMMIT");
  });

  it("attaches the archives, their checksums and the manifest to the release", () => {
    const create = runOf(publishSteps, "Create GitHub release");
    for (const asset of ["plugins/*.zip", "plugins/*.sha256", "plugins/release.json"]) {
      expect(create, `the release must carry ${asset}`).toContain(asset);
    }
    // Named as missing rather than skipped: a release that silently carried three of the four
    // archives would be indistinguishable from a complete one on the release page.
    expect(create).toContain("refusing to create a release that does not carry it");
  });

  it("documents the endpoints the attestation and the push reach, and what a rehearsal cannot prove", () => {
    const page = readFileSync(join(REPO_ROOT, ".github", "release-egress.md"), "utf8");
    const flowed = page.replaceAll(/\s+/g, " ");
    const publishAllow = allowlistOf(publishSteps);

    // The attestation talks to the GitHub attestations API and to Sigstore's public-good
    // instance. Every one of those hosts was already allowed for npm's own provenance, so this
    // unit adds no destination — but the page has to say that the attestation NEEDS them, or a
    // later edit that drops npm provenance would take the attestation's hosts with it.
    for (const host of [
      "api.github.com",
      "fulcio.sigstore.dev",
      "rekor.sigstore.dev",
      "tuf-repo-cdn.sigstore.dev",
    ]) {
      expect(publishAllow, `the publish job must reach ${host}`).toContain(`${host}:443`);
      expect(page, `release-egress.md must name ${host}`).toContain(host);
    }
    // `github.com` carries the distribution branch and tag push, on the allowance
    // `gh release create` already had. harden-runner stays fail-closed on every job.
    expect(publishAllow).toContain("github.com:443");
    expect(
      stepsOf(release, "publish").find((step) =>
        (step.uses ?? "").startsWith("step-security/harden-runner@"),
      )?.with?.["egress-policy"],
    ).toBe("block");
    expect(page).toContain("plugin-dist");
    // The honesty boundary this page exists for: a rehearsal cannot reach the publish job, so the
    // observed-endpoint evidence for the attestation and the push lands only at the first real
    // release. The page says that rather than implying these rows were observed.
    expect(flowed, "release-egress.md must scope the rehearsal's evidence").toContain(
      "rehearsal never reaches the publish job",
    );
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
      // under-reports what a real run does. The field list grew; nothing was removed from it.
      const report = summary.steps.map((step) => step.run ?? "").join("\n");
      for (const field of [
        "PACKAGE_NAME",
        "VERSION",
        "TARBALL",
        "TARBALL_SHA256",
        "SBOM_PRESENT",
        "PLUGINS_BRANCH",
        "PLUGINS_TAG",
        "PLUGINS_ARCHIVES",
      ]) {
        expect(report, `the summary must report ${field}`).toContain(field);
      }
      // The three new ones travel on the gates job's outputs, like every other value here.
      for (const [name, output] of [
        ["PLUGINS_BRANCH", "plugins_branch"],
        ["PLUGINS_TAG", "plugins_tag"],
        ["PLUGINS_ARCHIVES", "plugins_archives"],
      ] as const) {
        expect(summary.steps[0]?.env?.[name], `${name} must come from the gates job`).toBe(
          `\${{ needs.gates.outputs.${output} }}`,
        );
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

// ── docs-site.yml ────────────────────────────────────────────────────────────

/** A `workflow_dispatch` context for this workflow: main, and whatever the form supplied. */
// ── release.yml: the distribution push and the manifest stamp, executed ──────

/**
 * The two shell steps that publish the plugin distribution, RUN — the push against a scratch BARE
 * REMOTE, the stamp against a fixture manifest.
 *
 * Why running them rather than reading them. Both carry a property no substring match reaches.
 * The push must be IDEMPOTENT: a second run of the same release has to leave the branch and the
 * tag exactly where the first one left them, and a tag already naming another commit has to stop
 * the step rather than move a published pin. That is control flow plus git's own behaviour, and
 * the only way to know it holds is to run it twice and then run it against a poisoned remote. The
 * stamp must change exactly one field of a document a consumer reads as authoritative, and must
 * refuse a manifest that already carries a commit — which is what keeps the branch's copy (`null`)
 * and the release asset's copy (the sha) from ever being the same file by accident.
 *
 * The remote is reached through git's own `url.<base>.insteadOf` rewrite in a scratch global
 * config, so the step's script runs VERBATIM — the https remote it builds from `$GH_TOKEN` and
 * `$REPOSITORY` included — and git resolves it to a bare repository on disk. `GIT_CONFIG_SYSTEM`
 * and `HOME` are redirected with it, so a maintainer's own git config (signing, templates,
 * `init.defaultBranch`) cannot reach these runs.
 *
 * Not run on Windows, for the reason the two suites above are not: these are bash scripts GitHub
 * runs on ubuntu.
 */
/** git, reading one value back out of a scratch repository. The sibling of `git` above. */
function gitOut(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

describe.skipIf(WINDOWS)("release.yml — the distribution push and the stamp, executed", () => {
  const root = mkdtempSync(join(tmpdir(), "stamity-plugin-dist-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const publishStepsHere = stepsOf(release, "publish");
  const PUSH = runOf(publishStepsHere, "Push plugin distribution");
  const STAMP = runOf(
    publishStepsHere,
    "Stamp the release manifest with the distribution commit",
  );

  const VERSION = "1.9.0";
  const BRANCH = "plugin-dist";
  const TAG = `plugins/v${VERSION}`;
  const SOURCE_SHA = "4e07408562bedb8b60ce05c1decfe3ad16b72230";
  const TOKEN = "scratch-token";
  const REPOSITORY = "zomarit/stamity";
  const REMOTE_URL = `https://x-access-token:${TOKEN}@github.com/${REPOSITORY}.git`;

  /** The one document both steps read, in the shape `scripts/plugins/releaseManifest.mjs` writes. */
  const MANIFEST = {
    schemaVersion: 1,
    version: VERSION,
    sourceCommit: SOURCE_SHA,
    // A FIXED timestamp, and the reason the commit sha below is reproducible: the step stamps
    // both git dates from this field, so one release builds one commit however often it runs.
    sourceCommitDate: "2026-09-20T09:15:00+02:00",
    distribution: { branch: BRANCH, tag: TAG, commit: null },
    packages: [{ client: "claude", path: "claude", archive: `stamity-plugin-claude-${VERSION}.zip` }],
  };

  interface Scenario {
    readonly dir: string;
    readonly bare: string;
    readonly env: Readonly<Record<string, string>>;
  }

  /**
   * A stage directory holding `plugins/`, and a bare remote the step's https URL resolves to.
   * `overrides` replace the step's inputs — what a rewritten manifest would have handed the
   * gates job's outputs — without touching the staged tree.
   */
  function scenario(name: string, overrides: Readonly<Record<string, string>> = {}): Scenario {
    const dir = join(root, name);
    const bare = join(dir, "remote.git");
    const configPath = join(dir, "gitconfig");
    // A dot directory in the fixture on purpose: the step force-adds, so a `.gitignore` shipped
    // by some dependency inside the bundled runtime cannot silently drop files from the commit.
    mkdirSync(join(dir, "plugins", ".claude-plugin"), { recursive: true });
    writeFileSync(join(dir, "plugins", "release.json"), `${JSON.stringify(MANIFEST, null, 2)}\n`);
    writeFileSync(join(dir, "plugins", `stamity-plugin-claude-${VERSION}.zip`), "archive bytes\n");
    writeFileSync(join(dir, "plugins", ".claude-plugin", "marketplace.json"), '{"name":"stamity"}\n');
    git(dir, "init", "--bare", "-q", bare);
    writeFileSync(configPath, `[url "${bare}"]\n\tinsteadOf = ${REMOTE_URL}\n`);
    return {
      dir,
      bare,
      env: {
        PATH: `${dirname(process.execPath)}${delimiter}${process.env["PATH"] ?? ""}`,
        HOME: dir,
        GIT_CONFIG_GLOBAL: configPath,
        GIT_CONFIG_SYSTEM: "/dev/null",
        GIT_TERMINAL_PROMPT: "0",
        GITHUB_SHA: SOURCE_SHA,
        GH_TOKEN: TOKEN,
        REPOSITORY,
        VERSION,
        BRANCH,
        TAG,
        ...overrides,
      },
    };
  }

  interface StepRun {
    readonly status: number | null;
    readonly out: string;
    readonly stepEnv: string;
  }

  /** One run of the push step, from its own copy of the staged tree. */
  function push(setup: Scenario, attempt: string): StepRun {
    const workdir = join(setup.dir, attempt);
    mkdirSync(join(workdir, "plugins", ".claude-plugin"), { recursive: true });
    for (const relative of [
      "release.json",
      `stamity-plugin-claude-${VERSION}.zip`,
      ".claude-plugin/marketplace.json",
    ]) {
      writeFileSync(
        join(workdir, "plugins", relative),
        readFileSync(join(setup.dir, "plugins", relative)),
      );
    }
    const envPath = join(workdir, "github-env");
    writeFileSync(envPath, "");
    const result = spawnSync("bash", ["-c", PUSH], {
      cwd: workdir,
      encoding: "utf8",
      env: { ...process.env, ...setup.env, GITHUB_ENV: envPath },
    });
    return {
      status: result.status,
      out: `${result.stdout}${result.stderr}`,
      stepEnv: readFileSync(envPath, "utf8"),
    };
  }

  const refOf = (bare: string, ref: string): string =>
    gitOut(bare, "for-each-ref", "--format=%(objectname)", ref);

  it("creates the branch and the tag from one orphan commit, hidden files included", () => {
    const setup = scenario("first-push");
    const run = push(setup, "attempt-1");

    expect(run.status, run.out).toBe(0);
    const head = refOf(setup.bare, `refs/heads/${BRANCH}`);
    expect(head, "the branch must exist on the remote").toMatch(/^[0-9a-f]{40}$/);
    // A lightweight tag on the same commit: `git ls-remote` answers the commit itself, which is
    // what makes the idempotence comparison in the step a comparison of commits.
    expect(refOf(setup.bare, `refs/tags/${TAG}`)).toBe(head);
    // ORPHAN: one commit, no parent. A release's tree is published whole, so the branch carries
    // no history to merge into and every prior release is reachable through its own tag.
    expect(gitOut(setup.bare, "rev-list", "--count", head)).toBe("1");
    expect(gitOut(setup.bare, "log", "-1", "--format=%an <%ae>", head)).toContain(
      "github-actions[bot]",
    );
    expect(gitOut(setup.bare, "log", "-1", "--format=%s", head)).toBe(
      `plugins: v${VERSION} from ${SOURCE_SHA}`,
    );
    const tree = gitOut(setup.bare, "ls-tree", "-r", "--name-only", head).split("\n");
    expect(tree).toContain("release.json");
    // The catalogs all live in dot directories; a commit that dropped them would still look
    // complete from the release page.
    expect(tree).toContain(".claude-plugin/marketplace.json");
    // The commit the next step stamps into the release asset, handed on through the step env.
    expect(run.stepEnv.trim()).toBe(`PLUGINS_COMMIT=${head}`);
  });

  it("moves neither ref on a second identical run", () => {
    const setup = scenario("idempotent-push");
    const first = push(setup, "attempt-1");
    expect(first.status, first.out).toBe(0);
    const head = refOf(setup.bare, `refs/heads/${BRANCH}`);

    const second = push(setup, "attempt-2");

    expect(second.status, second.out).toBe(0);
    // Reproducible because both git dates are stamped from the manifest's source commit date
    // rather than read from the clock: the same tree and message produce the same sha.
    expect(refOf(setup.bare, `refs/heads/${BRANCH}`)).toBe(head);
    expect(refOf(setup.bare, `refs/tags/${TAG}`)).toBe(head);
    expect(second.out).toContain("already points at");
  });

  it("fails closed, and pushes nothing at all, when the tag already names another commit", () => {
    const setup = scenario("poisoned-tag");
    // A tag from some other build sitting on the release's tag name. Moving it would repoint a
    // pin consumers already fetch, so the step must stop before it pushes anything.
    const other = join(setup.dir, "other");
    mkdirSync(other, { recursive: true });
    git(other, "init", "-q", "-b", "main");
    git(other, "config", "user.email", "ci@example.invalid");
    git(other, "config", "user.name", "CI");
    git(other, "commit", "-q", "--allow-empty", "-m", "another build");
    git(other, "push", "-q", setup.bare, `HEAD:refs/tags/${TAG}`);
    const poisoned = refOf(setup.bare, `refs/tags/${TAG}`);

    const run = push(setup, "attempt-1");

    expect(run.status).toBe(1);
    expect(run.out).toContain("Refusing to move a published distribution tag");
    expect(refOf(setup.bare, `refs/tags/${TAG}`), "the published tag must not move").toBe(poisoned);
    expect(refOf(setup.bare, `refs/heads/${BRANCH}`), "and nothing else may be pushed").toBe("");
  });

  it("refuses a tag outside the distribution namespace before it pushes anything", () => {
    // SEC5-W1: the tag name reaches this job as a gates output read from a manifest written
    // after third-party build code ran in that job's checkout. The shape — `<namespace>/v` and
    // the version the gates job emitted — is what this job can check without spelling the name.
    const setup = scenario("foreign-tag", { TAG: `v${VERSION}` });

    const run = push(setup, "attempt-1");

    expect(run.status).toBe(1);
    expect(run.out).toContain("Refusing to publish under a tag");
    expect(refOf(setup.bare, `refs/tags/v${VERSION}`), "nothing may be pushed").toBe("");
    expect(refOf(setup.bare, `refs/heads/${BRANCH}`), "nothing may be pushed").toBe("");
  });

  it("refuses to force-push over a branch whose head has a parent, leaving it untouched", () => {
    // SEC5-W1: the branch name is the same kind of output. A rewritten manifest naming a source
    // branch would have this job — the one holding the credential — replace that branch's head
    // with an orphan. A distribution head has no parent; a source head does, and that is the
    // check. The remote here holds `main`'s shape under the distribution branch's name.
    const setup = scenario("branch-with-history");
    const other = join(setup.dir, "other");
    mkdirSync(other, { recursive: true });
    git(other, "init", "-q", "-b", "main");
    git(other, "config", "user.email", "ci@example.invalid");
    git(other, "config", "user.name", "CI");
    git(other, "commit", "-q", "--allow-empty", "-m", "first");
    git(other, "commit", "-q", "--allow-empty", "-m", "second");
    git(other, "push", "-q", setup.bare, `HEAD:refs/heads/${BRANCH}`);
    const before = refOf(setup.bare, `refs/heads/${BRANCH}`);

    const run = push(setup, "attempt-1");

    expect(run.status).toBe(1);
    expect(run.out).toContain(`${BRANCH}'s head ${before} has a parent`);
    expect(refOf(setup.bare, `refs/heads/${BRANCH}`), "the branch must not move").toBe(before);
    expect(refOf(setup.bare, `refs/tags/${TAG}`), "and nothing else may be pushed").toBe("");
  });

  /** One run of the stamp step over a staged manifest, with the commit the push handed on. */
  function stamp(name: string, commit: string, manifest: unknown = MANIFEST): StepRun {
    const dir = join(root, name);
    mkdirSync(join(dir, "plugins"), { recursive: true });
    writeFileSync(join(dir, "plugins", "release.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const result = spawnSync("bash", ["-c", STAMP], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dirname(process.execPath)}${delimiter}${process.env["PATH"] ?? ""}`,
        PLUGINS_COMMIT: commit,
      },
    });
    return {
      status: result.status,
      out: `${result.stdout}${result.stderr}`,
      stepEnv: readFileSync(join(dir, "plugins", "release.json"), "utf8"),
    };
  }

  const DISTRIBUTION_COMMIT = "9f2c1b5d4e6a7f80b1c2d3e4f5a6b7c8d9e0f1a2";

  it("writes the commit into the asset's manifest and changes nothing else about the document", () => {
    const run = stamp("stamp-ok", DISTRIBUTION_COMMIT);

    expect(run.status, run.out).toBe(0);
    const stamped = JSON.parse(run.stepEnv) as { distribution: { commit: string } };
    expect(stamped.distribution.commit).toBe(DISTRIBUTION_COMMIT);
    // The same two-space document with a trailing newline the builder writes, and the same field
    // order: a consumer diffing the asset against the branch's copy must see one line change.
    expect(run.stepEnv).toBe(
      `${JSON.stringify({ ...MANIFEST, distribution: { ...MANIFEST.distribution, commit: DISTRIBUTION_COMMIT } }, null, 2)}\n`,
    );
  });

  it("refuses a manifest that already carries a distribution commit", () => {
    // The branch's own copy is the one with `null`, and it is pushed BEFORE this step runs. A
    // stamp that ran twice — or ran on a tree that was somehow already stamped — would mean the
    // branch and the asset disagree about which commit the tree landed on.
    const run = stamp("stamp-twice", DISTRIBUTION_COMMIT, {
      ...MANIFEST,
      distribution: { ...MANIFEST.distribution, commit: DISTRIBUTION_COMMIT },
    });

    expect(run.status).toBe(1);
    expect(run.out).toContain("already carries");
  });

  it("refuses a distribution commit that is not a commit sha", () => {
    const run = stamp("stamp-bad-commit", "HEAD");

    expect(run.status).toBe(1);
    expect(run.out).toContain("40-character");
  });
});

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
    const publishing = ALL_STEPS.filter(([, , step]) => /\bnpm publish\b/.test(step.run ?? ""));
    expect(publishing.map(([file, job]) => `${file}:${job}`)).toEqual(["release.yml:publish"]);
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
    // lane and is absent by design, which that lane says out loud. STAMITY_UPSTREAM_TOKEN is
    // read by the upstream lane's `publish` job alone, is absent here by design (this repository
    // is not a fork), and exists so a FORK can push a release that touches workflow files and
    // let the pull request's own CI start without the approval prompt — both limits of the
    // per-run token, which `upstream-update.yml`'s header states. Its holder is the one job
    // `test/ci/upstreamWorkflow.test.ts` pins.
    const referenced = new Set(
      ALL_WORKFLOWS.flatMap(({ source }) =>
        [...source.matchAll(/secrets\.([A-Z_][A-Z0-9_]*)/g)].map((match) => match[1] ?? ""),
      ),
    );
    expect([...referenced].toSorted()).toEqual([
      "ANTHROPIC_API_KEY",
      "GITHUB_TOKEN",
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
    const writers = ALL_JOBS.filter(([, , job]) =>
      Object.values(job.permissions ?? {}).includes("write"),
    ).map(([file, id]) => `${file}:${id}`);
    expect(writers).toEqual([
      "docs-site.yml:deploy",
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
      "scripts/apm-install-smoke.mjs",
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
