import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { evaluateWorkflowExpression, type ExpressionContext } from "./workflowExpression.ts";

/**
 * Drift guard on `.github/workflows/upstream-update.yml` — the opt-in lane that carries an
 * upstream release into a fork.
 *
 * The gates EVERY workflow in the directory meets — SHA-pinned actions with a full three-part
 * version comment, explicit least privilege at workflow and job scope, no npm credential, no
 * `npm publish`, no internal work-item identifiers — are asserted once over the discovered set in
 * test/ci/workflow.test.ts, and this file does not repeat them. What lives here is what is true
 * of THIS file and would be true of nothing else:
 *
 *   the trust split      `prepare` runs the fork's own code — its merge, its regeneration, its
 *                        gates — with `contents: read`, `persist-credentials: false` and no
 *                        secret in the job at all. `publish` holds the three write grants and
 *                        runs only git and `gh`. A future edit that hands `prepare` a token, or
 *                        that lets `publish` execute the fork's code, is the one change that
 *                        turns this lane into a supply-chain path, and it is checked as a
 *                        PROPERTY of the parsed job rather than as a substring of the file.
 *
 *   the opt-in           The canonical repository carries no `.stamity/upstream.json`, so the
 *                        probe must end GREEN here with a notice that sends a reader to
 *                        `docs/enterprise-forks.md`. A workflow that failed in its own
 *                        repository would be a workflow nobody keeps.
 *
 *   never force          `stamity-upstream/<tag>` can carry a human's conflict resolution. The
 *                        absence of a force flag on every `git push` in the file is the whole
 *                        guarantee that the lane cannot delete it.
 *
 *   the publish gate     Evaluated, not read for substrings: a scheduled run publishes (inputs
 *                        are empty on a schedule), a dispatch that ticked `dry_run` does not, and
 *                        the `format()` spelling holds even if the input's declared type changes
 *                        under it. `expect(condition).toContain(...)` would pass on a condition
 *                        that had lost the property.
 *
 *   the two hard limits  A repository token may not push `.github/workflows/` changes, and a
 *                        pull request it opens starts its CI only after a human approves the
 *                        run. Both are handled rather than hoped about, and the handling is
 *                        pinned here so it survives an edit that "simplifies" the push step.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "upstream-update.yml");

interface WorkflowStep {
  readonly name?: string;
  readonly id?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly if?: string;
  readonly with?: Readonly<Record<string, unknown>>;
  readonly env?: Readonly<Record<string, string>>;
}

interface WorkflowJob {
  readonly name?: string;
  readonly "runs-on"?: string;
  readonly if?: string;
  readonly needs?: readonly string[] | string;
  readonly env?: Readonly<Record<string, string>>;
  readonly "timeout-minutes"?: number;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly outputs?: Readonly<Record<string, string>>;
  readonly steps: readonly WorkflowStep[];
}

interface Workflow {
  readonly name?: string;
  readonly on?: unknown;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly concurrency?: { readonly group?: string; readonly "cancel-in-progress"?: boolean };
  readonly jobs: Record<string, WorkflowJob>;
}

const SOURCE = readFileSync(WORKFLOW_PATH, "utf8");
const WORKFLOW = parse(SOURCE) as Workflow;

function jobOf(id: string): WorkflowJob {
  const job = WORKFLOW.jobs[id];
  expect(job, `upstream-update.yml must declare a job "${id}"`).toBeDefined();
  return job as WorkflowJob;
}

function stepOf(jobId: string, name: string): WorkflowStep {
  const step = jobOf(jobId).steps.find((candidate) => candidate.name === name);
  expect(step, `job "${jobId}" must declare a step named "${name}"`).toBeDefined();
  return step as WorkflowStep;
}

function runOf(jobId: string, name: string): string {
  const run = stepOf(jobId, name).run;
  expect(run, `step "${name}" must be a run step`).toBeTypeOf("string");
  return run ?? "";
}

/** Every `run:` body in a job, joined — the shell this job would execute, comments excluded. */
function shellOf(jobId: string): string {
  return jobOf(jobId)
    .steps.map((step) => step.run ?? "")
    .join("\n");
}

/**
 * The job's EFFECTIVE configuration, re-serialised from the parse.
 *
 * Deliberately not a slice of the source file. The secret assertions below ask what a job can
 * READ, and a prose comment naming a secret is not a read — slicing the bytes would fail on the
 * comment that explains the token and pass on an interpolation hidden in a `with:` a comment
 * happened to sit above.
 */
function configOf(jobId: string): string {
  return stringify(jobOf(jobId));
}

/** The `secrets.NAME` identifiers a job's configuration actually interpolates. */
function secretsReadBy(jobId: string): readonly string[] {
  return [
    ...new Set(
      [...configOf(jobId).matchAll(/secrets\.([A-Z_][A-Z0-9_]*)/g)].map((match) => match[1] ?? ""),
    ),
  ].toSorted();
}

/**
 * A run shape for the publish job's condition: the trigger, its inputs, and the two upstream
 * jobs' results. Empty `inputs` is the SCHEDULE case, which is the one the `format()` spelling
 * exists for.
 */
function runShape(overrides: {
  readonly event?: string;
  readonly inputs?: Record<string, unknown>;
  readonly enabled?: string;
  readonly prepare?: string;
}): ExpressionContext {
  return {
    github: { event_name: overrides.event ?? "schedule" },
    inputs: overrides.inputs ?? {},
    needs: {
      probe: { outputs: { enabled: overrides.enabled ?? "true" } },
      prepare: { result: overrides.prepare ?? "success" },
    },
  };
}

/** A step shape for the pull-request step's condition: the outcome, and whether the push landed. */
function pushShape(outcome: string, ready: string, hasBundle = "true"): ExpressionContext {
  return {
    needs: { prepare: { outputs: { outcome, has_bundle: hasBundle } } },
    steps: { push: { outputs: { ready } } },
  };
}

/** The trigger keys, allowing for YAML 1.1's fold of the `on` key to `true`. */
function triggers(): Record<string, unknown> {
  const record = WORKFLOW as unknown as Record<string, unknown>;
  const on = record["on"] ?? record["true"];
  expect(on, "upstream-update.yml must declare triggers").toBeTypeOf("object");
  return on as Record<string, unknown>;
}

describe("upstream-update.yml — the shape of the lane", () => {
  it("runs three jobs in the order the trust split requires", () => {
    // Order is the property, not just membership: the probe decides whether the lane is enabled
    // at all, `prepare` runs the fork's code without a credential, and `publish` acts on what
    // `prepare` produced. A `publish` that did not need `prepare` would be a publish that ran on
    // an unverified tree.
    expect(Object.keys(WORKFLOW.jobs)).toEqual(["probe", "prepare", "publish"]);
    expect(jobOf("prepare").needs).toBe("probe");
    expect(jobOf("publish").needs).toEqual(["probe", "prepare"]);
    // Every job carries a timeout, and the one that runs the fork's whole gate ladder gets the
    // largest budget of the three.
    for (const id of ["probe", "prepare", "publish"]) {
      expect(jobOf(id)["timeout-minutes"], `${id} must bound its own run time`).toBeTypeOf("number");
    }
    expect(jobOf("prepare")["timeout-minutes"]).toBeGreaterThan(
      jobOf("probe")["timeout-minutes"] ?? 0,
    );
  });

  it("declares the dispatch inputs and a daily schedule, and nothing else", () => {
    const on = triggers();
    expect(Object.keys(on).toSorted()).toEqual(["schedule", "workflow_dispatch"]);

    const dispatch = on["workflow_dispatch"] as { inputs?: Record<string, Record<string, unknown>> };
    const inputs = dispatch.inputs ?? {};
    expect(Object.keys(inputs).toSorted()).toEqual(["dry_run", "release"]);
    expect(inputs["release"]?.["type"]).toBe("string");
    expect(inputs["release"]?.["required"]).toBe(false);
    // Default false, so the scheduled run — where inputs are empty — and the default dispatch
    // agree about what happens.
    expect(inputs["dry_run"]?.["type"]).toBe("boolean");
    expect(inputs["dry_run"]?.["default"]).toBe(false);

    const schedule = on["schedule"] as readonly { cron: string }[];
    expect(schedule).toHaveLength(1);
    // One fixed daily minute, and NOT the top of the hour: releases are tags rather than a
    // stream, so a day of latency costs nothing, and GitHub sheds load from the `0 * * * *`
    // cohort it queues together.
    const cron = schedule[0]?.cron ?? "";
    expect(cron).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
    expect(cron.startsWith("0 ")).toBe(false);
  });

  it("serialises the whole lane and never cancels a run in flight", () => {
    // A fixed group rather than one keyed on the ref or the event: a scheduled run and a dispatch
    // that overlap prepare the same tag twice, race on the same update worktree, and can open two
    // pull requests for one release. `cancel-in-progress: false` because a killed `integrate`
    // leaves a half-finished merge the next run has to reconcile.
    expect(WORKFLOW.concurrency?.group).toBe("upstream-update");
    expect(WORKFLOW.concurrency?.["cancel-in-progress"]).toBe(false);
  });
});

describe("upstream-update.yml — the trust split", () => {
  it("gives each job exactly the privileges its work needs", () => {
    expect(WORKFLOW.permissions).toEqual({ contents: "read" });
    expect(jobOf("probe").permissions).toEqual({ contents: "read" });
    expect(jobOf("prepare").permissions).toEqual({ contents: "read" });
    // Exactly three writes, and no fourth: `contents` pushes the update branch, `pull-requests`
    // and `issues` are the two shapes a result takes. `id-token` is absent because this job mints
    // nothing — and its absence is checked as an exact object rather than as a missing key, so a
    // grant added later fails here rather than passing on a key nobody enumerated.
    expect(jobOf("publish").permissions).toEqual({
      contents: "write",
      "pull-requests": "write",
      issues: "write",
    });
  });

  it("keeps every credential out of the job that runs the fork's code", () => {
    const prepare = jobOf("prepare");
    // No write grant of any kind, and no OIDC token, on the job that executes an arbitrary
    // downstream repository's build.
    expect(Object.values(prepare.permissions ?? {})).toEqual(["read"]);
    expect(Object.keys(prepare.permissions ?? {})).not.toContain("id-token");
    // And no secret at all — not the optional fork token, not the repository token. This is the
    // assertion that makes running the fork's gates here safe.
    expect(secretsReadBy("prepare")).toEqual([]);
    expect(configOf("prepare")).not.toContain("github.token");
    // The checkout is the boundary: without this, the auth header the action writes into
    // `.git/config` is a push credential sitting in a directory the fork's own build can read.
    expect(stepOf("prepare", "Checkout the integration branch").with).toMatchObject({
      "persist-credentials": false,
      "fetch-depth": 0,
    });
  });

  it("reads exactly one secret, in the publish job, and it is optional", () => {
    // The whole repository's secret surface for this lane. A fork that configures nothing runs on
    // the per-run repository token; a fork that configures this one gets workflow-file pushes and
    // an unprompted pull-request CI. Any other name appearing here is a decision that has to land
    // with a line in this list.
    expect(secretsReadBy("publish")).toEqual(["STAMITY_UPSTREAM_TOKEN"]);
    expect(secretsReadBy("probe")).toEqual([]);
    // The fallback is what makes it optional: an unset secret is the empty string, which `||`
    // treats as falsy.
    expect(configOf("publish")).toContain("secrets.STAMITY_UPSTREAM_TOKEN || github.token");
    // The publish job keeps the credential on purpose — it exists to push — and says so.
    expect(stepOf("publish", "Checkout the integration branch").with).toMatchObject({
      "persist-credentials": true,
      "fetch-depth": 0,
    });
  });

  it("hands the update branch across the boundary as an inert bundle, not as a checkout", () => {
    // The artifact is the whole hand-off: `publish` never re-runs the merge and never executes
    // anything out of the fork's tree. A bundle also fails closed on the receiving side — a fetch
    // whose prerequisite commits are missing is refused rather than invented.
    expect(runOf("prepare", "Bundle the update branch")).toContain("git bundle create");
    expect(stepOf("prepare", "Upload the prepared update").with).toMatchObject({
      name: "upstream-update",
      "if-no-files-found": "error",
    });
    expect(stepOf("publish", "Download the prepared update").with).toMatchObject({
      name: "upstream-update",
    });
    const publishShell = shellOf("publish");
    expect(publishShell).toContain("git bundle verify");
    // The publish job must never EXECUTE the fork's code. `node scripts/upstream.mjs` DOES appear
    // in this job — inside `echo` lines, as the commands an issue tells a person to run on their
    // own machine — so the property is checked over command positions rather than over the bytes.
    const commands = publishShell
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => !line.startsWith("echo") && !line.startsWith("printf"));
    expect(commands.length).toBeGreaterThan(20);
    for (const line of commands) {
      expect(line, `publish must not execute: ${line}`).not.toMatch(
        /(?:^|[;&|(]\s*)(?:node|npm|npx|pnpm|yarn)\s/,
      );
    }
  });
});

describe("upstream-update.yml — the probe, and the repository that never opted in", () => {
  it("ends green with a notice that names the guide, in the canonical repository's own case", () => {
    const run = runOf("probe", "Read the lane configuration");
    expect(run).toContain(
      "::notice title=Upstream update skipped::Upstream update skipped: this checkout carries no .stamity/upstream.json — a fork enables the lane by adding one; see docs/enterprise-forks.md",
    );
    // A notice and `exit 0`, not a failure and not a silently skipped workflow: the absent case
    // is this repository's own, and it has to be legible on the run rather than invisible.
    expect(run).toMatch(/enabled=false[\s\S]*::notice title=Upstream update skipped[\s\S]*exit 0/);
    // A config that exists but cannot be read is the OTHER case, and it is loud: a green skip
    // there would look identical to never having opted in.
    expect(run).toContain("::error title=Upstream configuration unreadable");
  });

  it("publishes the integration branch and the enabled flag as job outputs", () => {
    expect(jobOf("probe").outputs).toEqual({
      enabled: "${{ steps.config.outputs.enabled }}",
      branch: "${{ steps.config.outputs.branch }}",
    });
    // Defaulted to `main` in the shell rather than assumed by the jobs downstream.
    expect(runOf("probe", "Read the lane configuration")).toContain('config.branch ?? "main"');
    // Both later jobs check out the branch the probe resolved, rather than the ref the run
    // started on — a scheduled run starts on the default branch, which need not be it.
    for (const jobId of ["prepare", "publish"]) {
      expect(stepOf(jobId, "Checkout the integration branch").with).toMatchObject({
        ref: "${{ needs.probe.outputs.branch }}",
      });
    }
    expect(jobOf("prepare").if).toBe("needs.probe.outputs.enabled == 'true'");
  });
});

describe("upstream-update.yml — the lane call", () => {
  it("invokes the script the whole file is a layer over, and captures its exit code", () => {
    const run = runOf("prepare", "Integrate the upstream release");
    expect(run).toContain("node scripts/upstream.mjs");
    expect(run).toContain("ARGS=(integrate --json)");
    expect(run).toContain("--release");
    // The dispatch input reaches the shell through `env:`, never as a `${{ }}` substitution into
    // the script body — the same discipline release.yml applies to VERSION, and for the same
    // reason: an input is text somebody else wrote.
    expect(stepOf("prepare", "Integrate the upstream release").env).toMatchObject({
      RELEASE_INPUT: "${{ inputs.release }}",
    });
    expect(run).not.toContain("${{ inputs.release }}");
    // Every outcome this lane names arrives as an exit code beside a full report, so the code is
    // captured rather than allowed to abort the step.
    expect(run).toContain("set +e");
    expect(run).toContain("exit_code=$EXIT_CODE");
  });

  it("treats an exit-1 outcome as data and an exit-2 error as a red run", () => {
    // The asymmetry is the design: `conflict`, `validation-failed` and the ancestry states are
    // RESULTS the publish job acts on, while exit 2 means the lane could not run at all. A job
    // that failed on exit 1 would never reach the step that opens the pull request.
    const run = runOf("prepare", "Fail on an operational error");
    expect(run).toContain('if [ "${EXIT_CODE:-2}" -ge 2 ]; then');
    expect(run).toContain("exit 1");
    // Last step in the job, so the artifact and the summary exist before it can go red.
    const steps = jobOf("prepare").steps;
    expect(steps[steps.length - 1]?.name).toBe("Fail on an operational error");
  });

  it("runs on the declared engines floor, which is the Node a fork is likeliest to be pinned to", () => {
    expect(stepOf("prepare", "Set up Node").with).toMatchObject({ "node-version": "22.22.2" });
    // No Actions cache in a job whose output is the evidence a pull request is reviewed on: a
    // cache is writable from any branch.
    expect(stepOf("prepare", "Set up Node").with?.["cache"]).toBeUndefined();
  });
});

describe("upstream-update.yml — the push can never destroy work", () => {
  it("carries no force flag on any git push, anywhere in the file", () => {
    // `stamity-upstream/<tag>` may already carry a human's conflict resolution or a review
    // fixup. The absence of a force flag IS the guarantee that the lane cannot delete it, so it
    // is asserted over the file's bytes rather than over one step.
    const pushLines = SOURCE.split("\n").filter((line) => /\bgit push\b/.test(line));
    // Regex-rot guard: a filter that matched nothing would satisfy the loop vacuously.
    expect(pushLines.length).toBeGreaterThan(0);
    for (const line of pushLines) {
      expect(line, `forced push: ${line.trim()}`).not.toMatch(
        /(?:^|\s)(?:-f|--force|--force-with-lease|--force-if-includes)(?:$|[\s=])/,
      );
      // A leading `+` on a refspec is the other spelling of the same thing.
      expect(line, `forced refspec: ${line.trim()}`).not.toMatch(/["']\+refs\//);
    }
    expect(SOURCE).not.toMatch(/git\s+push[^\n]*--force/);
  });

  it("pushes only when the remote does not already have the branch", () => {
    const run = runOf("publish", "Restore and push the update branch");
    // The existence check comes BEFORE the push, and the branch-already-there arm exits without
    // touching it — which is also what makes a second run of the same release idempotent.
    const guard = run.indexOf("git ls-remote --heads origin");
    const push = run.indexOf("git push origin");
    expect(guard).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(guard);
    expect(run).toContain("Update branch already on the remote");
  });

  it("refuses a workflow-touching push before attempting it, rather than failing halfway", () => {
    // The platform limit this handles: the per-run repository token may not create or update
    // anything under `.github/workflows/`, and upstream releases of this product routinely do.
    // The diff runs against the FETCHED bundle and before the push, so a release that cannot be
    // pushed leaves nothing half-applied.
    const run = runOf("publish", "Restore and push the update branch");
    expect(run).toContain(
      'git diff --name-only "$INTEGRATION_BRANCH..$UPDATE_BRANCH" -- .github/workflows',
    );
    expect(run.indexOf("git diff --name-only")).toBeGreaterThan(run.indexOf("git fetch"));
    expect(run.indexOf("git diff --name-only")).toBeLessThan(run.indexOf("git push origin"));
    expect(run).toContain("blocked=workflow-permission");
    // The elevated token is what lifts the block, and it is read from an env var in the shell —
    // the nightly.yml arming pattern — so the absent case produces a notice rather than a step
    // that silently did not run.
    expect(runOf("publish", "Detect the push credential")).toContain(
      'if [ -z "${STAMITY_UPSTREAM_TOKEN:-}" ]; then',
    );
    expect(stepOf("publish", "Detect the push credential").env).toEqual({
      STAMITY_UPSTREAM_TOKEN: "${{ secrets.STAMITY_UPSTREAM_TOKEN }}",
    });
  });
});

describe("upstream-update.yml — what each outcome produces", () => {
  it("opens one pull request per release, keyed on the head branch", () => {
    const run = runOf("publish", "Open or update the pull request");
    // Found by HEAD BRANCH rather than by title: a reviewer can edit a title, and the head
    // branch is the identity the lane owns. One per release, created once, updated after.
    expect(run).toContain(
      'gh pr list --head "$UPDATE_BRANCH" --base "$INTEGRATION_BRANCH" --state open',
    );
    expect(run).toContain('gh pr create --head "$UPDATE_BRANCH" --base "$INTEGRATION_BRANCH"');
    expect(run).toContain('gh pr edit "$NUMBER"');
    expect(run).toContain('TITLE="Upstream release ${TAG:-unknown}"');
    // A `gh pr create` failure names the repository setting that most often causes it instead of
    // dying with the CLI's own message. Never an empty catch.
    expect(run).toContain("Allow GitHub Actions to create and approve pull requests");
    expect(run).toContain("::error title=Could not open the pull request");
    // The label is best-effort by design and says so when it does not land.
    expect(run).toContain("::notice title=Label not applied");
  });

  it("opens the conflict issue under the exact title the lane looks for", () => {
    const run = runOf("publish", "Open or update the conflict issue");
    expect(run).toContain('TITLE="Upstream ${TAG:-unknown} needs conflict resolution"');
    // Searched, then filtered by EXACT title: GitHub's `in:title` search is fuzzy, and a
    // near-miss must not update somebody else's issue or open a second one.
    expect(run).toContain('gh issue list --search "$TITLE in:title" --state open');
    expect(run).toContain("map(select(.title == $title))");
    expect(run).toContain("gh issue create --title");
    expect(run).toContain('gh issue edit "$NUMBER"');
    // The local commands, because a conflict is resolved on somebody's machine and not here.
    expect(run).toContain("node scripts/upstream.mjs integrate --release");
    expect(run).toContain("node scripts/upstream.mjs continue");
    expect(jobOf("publish").steps.find((step) => step.id === "issue")?.if).toBe(
      "needs.prepare.outputs.outcome == 'conflict'",
    );
  });

  it("opens the workflow-permission issue under its own exact title", () => {
    const run = runOf("publish", "Open or update the workflow-permission issue");
    expect(run).toContain(
      'TITLE="Upstream ${TAG:-unknown} needs a push with workflow permission"',
    );
    expect(run).toContain("map(select(.title == $title))");
    // It has to name the artifact a person downloads and the two commands that land the branch
    // from a checkout whose credential does carry workflow scope.
    expect(run).toContain("upstream-update");
    expect(run).toContain("git fetch /path/to/update.bundle");
    expect(run).toContain("git push origin");
    expect(run).toContain("STAMITY_UPSTREAM_TOKEN");
  });

  it("maps every outcome the lane can report to a colour, and fails closed on a new one", () => {
    const run = runOf("publish", "Record the outcome and set the run's verdict");
    // Every outcome in the script's contract appears in the case statement. An outcome that grew
    // in the script and never reached this file must go red, not green — which is what the
    // wildcard arm is for.
    for (const outcome of [
      "up-to-date",
      "update-available",
      "integrated",
      "validation-failed",
      "conflict",
      "conflict-pending",
      "update-branch-stale",
      "regenerate-failed",
      "ancestry-missing",
      "ancestry-lost",
    ]) {
      expect(run, `the verdict must handle ${outcome}`).toContain(outcome);
    }
    expect(run).toContain("::error title=Unrecognised outcome");
    // `validation-failed` is red on purpose: the gates ran in `prepare`, so this run's colour is
    // the only place their verdict shows up as a check on the pull request.
    expect(run).toMatch(/validation-failed\)[\s\S]{0,700}?exit 1/);
    expect(run).toMatch(/up-to-date\)[\s\S]{0,400}?exit 0/);
    // Runs last and always, so the summary survives a step that went red above it.
    const steps = jobOf("publish").steps;
    expect(steps[steps.length - 1]?.name).toBe("Record the outcome and set the run's verdict");
    expect(steps[steps.length - 1]?.if).toBe("always()");
  });
});

describe("upstream-update.yml — the landing policy", () => {
  it("reads the target branch's effective rules and warns without blocking", () => {
    const run = runOf("publish", "Check the target branch's landing policy");
    // The endpoint that answers for rulesets AND classic protection, on the branch the pull
    // request targets.
    expect(run).toContain('gh api "repos/${GH_REPO}/rules/branches/${INTEGRATION_BRANCH}"');
    // The two conditions that destroy the ancestry the lane's "integrated" claim rests on.
    expect(run).toContain('select(.type=="required_linear_history")');
    expect(run).toContain('select(.type=="pull_request")');
    expect(run).toContain("allowed_merge_methods");
    expect(run).toContain('index("merge") | not');
    // Both landings lose it — squash and rebase alike — and the warning says so rather than
    // naming one and leaving the other to be discovered.
    expect(run).toContain("Squash and rebase both lose it");
    expect(run).toContain("ancestry-lost");
  });

  it("tolerates the endpoint being unavailable, and says so rather than staying silent", () => {
    // The rules endpoint answers 403 or 404 on some plans and for some tokens. "No warning" and
    // "could not check" must not look the same to whoever reads the pull request, so the failure
    // arm writes its own note into the body and marks the check as not performed.
    const run = runOf("publish", "Check the target branch's landing policy");
    expect(run).toContain("::notice title=Landing policy unchecked");
    expect(run).toContain("checked=false");
    expect(run).toContain("Could not read branch rules for");
    // The pull request still opens. The decision belongs to the fork.
    expect(run).not.toContain("exit 1");
  });
});

describe("upstream-update.yml — the conditions, evaluated", () => {
  const publishCondition = jobOf("publish").if ?? "";

  it("publishes on a schedule, where every input is empty", () => {
    // The case the `format()` spelling exists for. A schedule carries no inputs at all, so a
    // condition that compared `inputs.dry_run` as a value would be comparing null.
    expect(evaluateWorkflowExpression(publishCondition, runShape({ event: "schedule" }))).toBe(true);
  });

  it("does not publish a dispatch that ticked dry_run, in either spelling of true", () => {
    expect(
      evaluateWorkflowExpression(
        publishCondition,
        runShape({ event: "workflow_dispatch", inputs: { dry_run: true, release: "" } }),
      ),
    ).toBe(false);
    // The same input as a STRING, which is what it becomes if the declaration is ever changed
    // from `type: boolean`. `inputs.dry_run != true` would publish here — the number cast makes
    // 'true' NaN, and NaN equals nothing — which is the fail-open shape `format()` closes.
    expect(
      evaluateWorkflowExpression(
        publishCondition,
        runShape({ event: "workflow_dispatch", inputs: { dry_run: "true" } }),
      ),
    ).toBe(false);
  });

  it("publishes a dispatch that left dry_run alone or set it false", () => {
    expect(
      evaluateWorkflowExpression(
        publishCondition,
        runShape({ event: "workflow_dispatch", inputs: { dry_run: false, release: "v1.4.0" } }),
      ),
    ).toBe(true);
    expect(
      evaluateWorkflowExpression(
        publishCondition,
        runShape({ event: "workflow_dispatch", inputs: {} }),
      ),
    ).toBe(true);
  });

  it("publishes nothing when the lane is not enabled or the preparation did not succeed", () => {
    expect(evaluateWorkflowExpression(publishCondition, runShape({ enabled: "false" }))).toBe(false);
    expect(evaluateWorkflowExpression(publishCondition, runShape({ enabled: "" }))).toBe(false);
    for (const result of ["failure", "skipped", "cancelled"]) {
      expect(
        evaluateWorkflowExpression(publishCondition, runShape({ prepare: result })),
        `prepare ${result} must publish nothing`,
      ).toBe(false);
    }
  });

  it("opens no pull request when the branch never reached the remote", () => {
    // The step condition, evaluated for the same reason the job's is: a blocked push leaves the
    // branch local, and `gh pr create` against a head that is not on the remote fails. The
    // property is that the pull-request step does not run at all in that case.
    const prCondition =
      jobOf("publish").steps.find((step) => step.id === "pr")?.if ?? "";
    expect(prCondition).not.toBe("");

    expect(evaluateWorkflowExpression(prCondition, pushShape("integrated", "true"))).toBe(true);
    expect(evaluateWorkflowExpression(prCondition, pushShape("validation-failed", "true"))).toBe(true);
    // Blocked by the workflow-permission limit: the push step set `ready=false`.
    expect(evaluateWorkflowExpression(prCondition, pushShape("integrated", "false"))).toBe(false);
    // The step was skipped entirely, so its outputs are empty.
    expect(evaluateWorkflowExpression(prCondition, pushShape("integrated", ""))).toBe(false);
    // A conflict has no commit, so there is nothing to open a pull request from.
    expect(evaluateWorkflowExpression(prCondition, pushShape("conflict", "true", "false"))).toBe(false);
  });
});
