import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { evaluateWorkflowExpression, type ExpressionContext } from "./workflowExpression.ts";

/**
 * Drift guard on `.github/workflows/fork-release.yml` — a fork's own release path.
 *
 * The gates every workflow in the directory meets (pins, least privilege, the closed secret and
 * writer lists, referenced scripts, no internal identifiers) are asserted once over the
 * discovered set in test/ci/workflow.test.ts, and not repeated here. What lives here is what is
 * true of THIS file:
 *
 *   inert until armed   The probe ends green with `armed=false` in the canonical repository and in
 *                       any copy whose STAMITY_FORK_RELEASE does not name itself, and refuses a
 *                       registry URL it cannot use without ever printing it. The script is RUN.
 *   the conditions      Evaluated over every trigger shape and both arming states, not read for
 *                       substrings (see ./workflowExpression.ts).
 *   the trust split     `probe` and `gates` hold no secret; `publish` checks nothing out, and the
 *                       per-run token reaches a registry only when that registry IS GitHub
 *                       Packages — a lookalike host never gets it.
 *   the proofs          The tag, ancestry and identity proofs, RUN against scratch repositories.
 *   the publish steps   The npm step and the release step, RUN with `npm` and `gh` stubbed; the
 *                       distribution push, RUN against a scratch bare remote. The steps copied
 *                       from release.yml are held byte-equal to it, so a fix there reaches here.
 *
 * The bash cases do not run on Windows: GitHub runs these steps on ubuntu, and a Git-for-Windows
 * bash is a different interpreter from the one under test. The suite's other bash cases skip for
 * the same reason.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const WORKFLOW_DIR = join(REPO_ROOT, ".github", "workflows");
const WINDOWS = process.platform === "win32";

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
  readonly if?: string;
  readonly needs?: readonly string[] | string;
  readonly environment?: string;
  readonly "timeout-minutes"?: number;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly outputs?: Readonly<Record<string, string>>;
  readonly steps: readonly WorkflowStep[];
}

interface Workflow {
  readonly permissions?: Readonly<Record<string, string>>;
  readonly concurrency?: { readonly group?: string; readonly "cancel-in-progress"?: boolean };
  readonly jobs: Record<string, WorkflowJob>;
}

const SOURCE = readFileSync(join(WORKFLOW_DIR, "fork-release.yml"), "utf8");
const WORKFLOW = parse(SOURCE) as Workflow;
const RELEASE_SOURCE = readFileSync(join(WORKFLOW_DIR, "release.yml"), "utf8");
const RELEASE = parse(RELEASE_SOURCE) as Workflow;

/**
 * The canonical identity this workflow refuses. Literals on purpose: they are the values the
 * committed workflow text guards against, which a fork's rename does not touch, so they are
 * pinned by count in test/ci/forkIdentity.test.ts rather than derived from this checkout.
 */
const CANONICAL_REPOSITORY = "zomarit/stamity";
const CANONICAL_PACKAGE = "@zomarit/stamity";

/** A fork, spelled with mixed case where GitHub allows it. */
const FORK_REPOSITORY = "Acme-Corp/stamity-internal";
const FORK_OWNER = "Acme-Corp";
const FORK_PACKAGE = "@acme-corp/stamity";
const FORK_VERSION = "1.10.0-acme.1";
const GITHUB_PACKAGES = "https://npm.pkg.github.com";

function jobOf(workflow: Workflow, id: string): WorkflowJob {
  const job = workflow.jobs[id];
  expect(job, `a job "${id}" must exist`).toBeDefined();
  return job as WorkflowJob;
}

function stepOf(workflow: Workflow, jobId: string, name: string): WorkflowStep {
  const step = jobOf(workflow, jobId).steps.find((candidate) => candidate.name === name);
  expect(step, `job "${jobId}" must declare a step named "${name}"`).toBeDefined();
  return step as WorkflowStep;
}

function runOf(workflow: Workflow, jobId: string, name: string): string {
  const run = stepOf(workflow, jobId, name).run;
  expect(run, `step "${name}" must be a run step`).toBeTypeOf("string");
  return run ?? "";
}

/** The `secrets.NAME` identifiers a job's parsed configuration reads; comments are not reads. */
function secretsReadBy(jobId: string): readonly string[] {
  return [
    ...new Set(
      [...stringify(jobOf(WORKFLOW, jobId)).matchAll(/secrets\.([A-Z_][A-Z0-9_]*)/g)].map(
        (match) => match[1] ?? "",
      ),
    ),
  ].toSorted();
}

/** PATH for a child bash: the running node first, so `node` resolves on every machine. */
function childPath(...front: string[]): string {
  return [...front, dirname(process.execPath), process.env["PATH"] ?? ""].join(delimiter);
}

/** git, with the two signing settings a maintainer's global config might otherwise impose. */
function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function gitOut(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

/** A `KEY=value` file as GitHub writes `$GITHUB_OUTPUT`, read back into a record. */
function outputsOf(path: string): Record<string, string> {
  const outputs: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) outputs[line.slice(0, at)] = line.slice(at + 1);
  }
  return outputs;
}

/** One run of a step that writes `$GITHUB_OUTPUT`. */
interface OutputRun {
  readonly status: number | null;
  readonly out: string;
  readonly outputs: Record<string, string>;
}

const scratch = mkdtempSync(join(tmpdir(), "stamity-fork-release-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let scratchCount = 0;
function scratchDir(label: string): string {
  scratchCount += 1;
  const dir = join(scratch, `${String(scratchCount)}-${label}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** The action reference on a `uses:` line, comment included; undefined for any other line. */
function usesLine(line: string): string | undefined {
  return /^\s*(?:-\s+)?uses:\s+(.+)$/.exec(line)?.[1]?.trim();
}

// ── the shape ────────────────────────────────────────────────────────────────

describe("fork-release.yml — the shape", () => {
  it("runs a probe, then gates, then publish or the rehearsal report", () => {
    expect(Object.keys(WORKFLOW.jobs)).toEqual(["probe", "gates", "publish", "dry-run-summary"]);
    expect(jobOf(WORKFLOW, "probe").needs).toBeUndefined();
    expect(jobOf(WORKFLOW, "gates").needs).toBe("probe");
    expect(jobOf(WORKFLOW, "publish").needs).toEqual(["probe", "gates"]);
    expect(jobOf(WORKFLOW, "dry-run-summary").needs).toEqual(["probe", "gates"]);
    expect(jobOf(WORKFLOW, "probe").outputs?.["armed"]).toBe("${{ steps.arm.outputs.armed }}");
  });

  it("triggers on a v* tag and on a dispatch whose dry_run defaults to true, in release.yml's shape", () => {
    const on = (WORKFLOW as unknown as Record<string, unknown>)["on"];
    const releaseOn = (RELEASE as unknown as Record<string, unknown>)["on"];
    expect(on).toEqual({
      push: { tags: ["v*"] },
      workflow_dispatch: {
        inputs: {
          dry_run: {
            description: "Run every gate and build every artifact without publishing",
            type: "boolean",
            default: true,
          },
        },
      },
    });
    expect((releaseOn as { push: unknown }).push).toEqual((on as { push: unknown }).push);
  });

  it("reads only, at workflow scope, and never cancels a release in flight", () => {
    expect(WORKFLOW.permissions).toEqual({ contents: "read" });
    expect(WORKFLOW.concurrency).toEqual({
      group: "fork-release-${{ github.ref }}",
      "cancel-in-progress": false,
    });
  });

  it("states the trust split, the arming, the canonical-only release.yml and every decision in its header", () => {
    const header = SOURCE.slice(0, SOURCE.indexOf("\nname:"));
    for (const phrase of [
      "INERT UNTIL ARMED",
      "STAMITY_FORK_RELEASE",
      "STAMITY_RELEASE_REGISTRY",
      "STAMITY_RELEASE_BRANCH",
      "RELEASES THROUGH release.yml",
      "THE TRUST SPLIT",
      "hold no secret",
      "checks out nothing",
      "no npm",
      "no attestations",
      "2026-09-24",
      "NO CHANGELOG SECTION IS REQUIRED",
      "NO EGRESS ALLOWLIST",
      "upstream-update.yml",
    ]) {
      expect(header, phrase).toContain(phrase);
    }
  });

  it("pins every action to the SHA and version comment release.yml pins", () => {
    const releasePins = new Set(
      RELEASE_SOURCE.split("\n").map(usesLine).filter((pin) => pin !== undefined),
    );
    const pins = SOURCE.split("\n").map(usesLine).filter((pin) => pin !== undefined);
    // Checkout, setup-node twice, upload twice, download twice.
    expect(pins.length).toBe(7);
    for (const pin of pins) expect(releasePins.has(pin), pin).toBe(true);
    for (const [job, name] of [
      ["gates", "Set up Node"],
      ["publish", "Set up Node"],
    ] as const) {
      expect(stepOf(WORKFLOW, job, name).with?.["node-version"]).toBe(
        stepOf(RELEASE, "gates", "Set up Node").with?.["node-version"],
      );
    }
  });
});

// ── the conditions, evaluated ────────────────────────────────────────────────

/** A `workflow_dispatch` context: a ref, and whatever the form supplied for `dry_run`. */
const dispatch = (ref: string, inputs: Readonly<Record<string, unknown>>): ExpressionContext => ({
  github: { event_name: "workflow_dispatch", ref },
  inputs,
});

/**
 * The trigger shapes of `test/ci/workflow.test.ts` (TRIGGER_SHAPES), copied because a test file
 * exports nothing: a tag push, a branch push, a schedule, and the seven dispatch rows, the three
 * fail-open ones among them. `publishes` is release.yml's answer for the same shape; this file's
 * publish condition must give it too, once armed.
 */
const TRIGGER_SHAPES: readonly {
  readonly label: string;
  readonly context: ExpressionContext;
  readonly publishes: boolean;
}[] = [
  { label: "a v* tag push", context: { github: { event_name: "push", ref: "refs/tags/v1.2.3" } }, publishes: true },
  { label: "a push to a branch", context: { github: { event_name: "push", ref: "refs/heads/main" } }, publishes: false },
  { label: "a schedule", context: { github: { event_name: "schedule", ref: "refs/heads/main" } }, publishes: false },
  { label: "the default dispatch (dry_run true)", context: dispatch("refs/heads/main", { dry_run: true }), publishes: false },
  { label: "a dispatch with dry_run false, from main", context: dispatch("refs/heads/main", { dry_run: false }), publishes: true },
  { label: "a dispatch with dry_run false, from a v* tag", context: dispatch("refs/tags/v1.2.3", { dry_run: false }), publishes: true },
  { label: "a dispatch with dry_run false, from a feature branch", context: dispatch("refs/heads/feature/x", { dry_run: false }), publishes: true },
  { label: "a dispatch whose dry_run input went missing", context: dispatch("refs/heads/main", {}), publishes: false },
  { label: "a dispatch whose dry_run input is empty", context: dispatch("refs/heads/main", { dry_run: "" }), publishes: false },
  { label: "a dispatch with no inputs context at all", context: { github: { event_name: "workflow_dispatch", ref: "refs/heads/main" } }, publishes: false },
];

/** A shape with the probe's answer attached; `undefined` is a probe that never wrote one. */
function withArmed(context: ExpressionContext, armed: string | undefined): ExpressionContext {
  return { ...context, needs: { probe: { outputs: armed === undefined ? {} : { armed } } } };
}

describe("fork-release.yml — the conditions, evaluated", () => {
  it("resolves the vars context, which every arming decision reads", () => {
    // The evaluator's context is a generic record; this proves `vars.*` is looked up rather
    // than silently read as absent, before any case below leans on it.
    const expression = "vars.STAMITY_FORK_RELEASE == 'acme/x'";
    expect(evaluateWorkflowExpression(expression, { vars: { STAMITY_FORK_RELEASE: "acme/x" } })).toBe(true);
    expect(evaluateWorkflowExpression(expression, { vars: { STAMITY_FORK_RELEASE: "acme/y" } })).toBe(false);
    expect(evaluateWorkflowExpression(expression, {})).toBe(false);
  });

  it("runs gates only when armed, publishes only an armed tag push or real dispatch, and reports every other armed run", () => {
    const gates = jobOf(WORKFLOW, "gates").if ?? "";
    const publish = jobOf(WORKFLOW, "publish").if ?? "";
    const summary = jobOf(WORKFLOW, "dry-run-summary").if ?? "";
    let armedPublishes = 0;
    for (const shape of TRIGGER_SHAPES) {
      for (const armed of ["true", "false", undefined]) {
        const context = withArmed(shape.context, armed);
        const label = `${shape.label}, armed=${String(armed)}`;
        const isArmed = armed === "true";
        expect(evaluateWorkflowExpression(gates, context), label).toBe(isArmed);
        expect(evaluateWorkflowExpression(publish, context), label).toBe(isArmed && shape.publishes);
        expect(evaluateWorkflowExpression(summary, context), label).toBe(isArmed && !shape.publishes);
        if (isArmed && shape.publishes) armedPublishes += 1;
      }
    }
    // Non-degenerate: both arms of the publish condition fire somewhere.
    expect(armedPublishes).toBe(4);
  });

  it("holds the fail-open dispatch shapes closed, as release.yml's spelling does", () => {
    const publish = jobOf(WORKFLOW, "publish").if ?? "";
    expect(publish).toContain("format('{0}', inputs.dry_run) == 'false'");
    const loose = publish.replace("format('{0}', inputs.dry_run) == 'false'", "inputs.dry_run == false");
    for (const label of [
      "a dispatch whose dry_run input went missing",
      "a dispatch whose dry_run input is empty",
      "a dispatch with no inputs context at all",
    ]) {
      const shape = TRIGGER_SHAPES.find((row) => row.label === label);
      const context = withArmed((shape as { context: ExpressionContext }).context, "true");
      expect(evaluateWorkflowExpression(loose, context), `${label}, loose`).toBe(true);
      expect(evaluateWorkflowExpression(publish, context), `${label}, shipped`).toBe(false);
    }
  });
});

// ── the trust split ──────────────────────────────────────────────────────────

describe("fork-release.yml — the trust split", () => {
  it("gives probe and gates read access and no secret at all", () => {
    for (const id of ["probe", "gates"]) {
      expect(jobOf(WORKFLOW, id).permissions, id).toEqual({ contents: "read" });
      expect(secretsReadBy(id), id).toEqual([]);
    }
    expect(jobOf(WORKFLOW, "dry-run-summary").permissions).toEqual({});
    expect(secretsReadBy("dry-run-summary")).toEqual([]);
    const checkout = stepOf(WORKFLOW, "gates", "Checkout");
    expect(checkout.with?.["persist-credentials"]).toBe(false);
    expect(checkout.with?.["fetch-depth"]).toBe(0);
  });

  it("holds the write grants and both secrets in publish alone, behind an environment, with no OIDC", () => {
    const publish = jobOf(WORKFLOW, "publish");
    expect(publish.permissions).toEqual({ contents: "write", packages: "write" });
    expect(publish.environment).toBe("fork-release");
    for (const job of Object.values(WORKFLOW.jobs)) {
      expect(Object.keys(job.permissions ?? {})).not.toContain("id-token");
    }
    expect(secretsReadBy("publish")).toEqual(["GITHUB_TOKEN", "STAMITY_REGISTRY_TOKEN"]);
  });

  it("checks nothing out in publish, and verifies both digests, the tarball's identity and the checksum files before the registry publish", () => {
    const steps = jobOf(WORKFLOW, "publish").steps;
    expect(steps.some((step) => (step.uses ?? "").startsWith("actions/checkout@"))).toBe(false);
    const names = steps.map((step) => step.name);
    expect(names).toEqual([
      "Refuse an unarmed destination",
      "Download release artifacts",
      "Download plugin distribution",
      "Verify tarball digest",
      "Verify plugin distribution digest",
      "Verify the tarball's identity",
      "Verify plugin checksum files",
      "Set up Node",
      "Publish to the registry",
      "Push plugin distribution",
      "Create GitHub release",
    ]);
    const setupNode = stepOf(WORKFLOW, "publish", "Set up Node");
    expect(setupNode.with?.["registry-url"]).toBe("${{ needs.probe.outputs.registry }}");
  });

  it("reads the registry variable once, in probe, and hands every later reader the validated value", () => {
    expect(SOURCE.match(/vars\.STAMITY_RELEASE_REGISTRY/g)).toHaveLength(1);
    expect(stepOf(WORKFLOW, "probe", "Read the release destination").env?.["REGISTRY"]).toBe(
      "${{ vars.STAMITY_RELEASE_REGISTRY }}",
    );
    expect(jobOf(WORKFLOW, "probe").outputs?.["registry"]).toBe("${{ steps.arm.outputs.registry }}");
    const fromProbe = "${{ needs.probe.outputs.registry }}";
    expect(stepOf(WORKFLOW, "gates", "Prove the fork release").env?.["REGISTRY"]).toBe(fromProbe);
    expect(stepOf(WORKFLOW, "publish", "Verify the tarball's identity").env?.["EXPECTED_REGISTRY"]).toBe(fromProbe);
    expect(stepOf(WORKFLOW, "publish", "Publish to the registry").env?.["REGISTRY"]).toBe(fromProbe);
  });

  it("hands the per-run token only to GitHub Packages itself, never to a lookalike host", () => {
    const token = stepOf(WORKFLOW, "publish", "Publish to the registry").env?.["NODE_AUTH_TOKEN"] ?? "";
    const body = token.trim().replace(/^\$\{\{/, "").replace(/\}\}$/, "");
    // The evaluator answers a condition, so the credential is resolved by asking which candidate
    // the expression's value equals: the per-run token, the company secret, or nothing at all.
    const CANDIDATES = { "per-run": "GITHUB_TOKEN", company: "STAMITY_REGISTRY_TOKEN", "": "none" } as const;
    const chosen = (registry: string, secrets: Readonly<Record<string, string>>): string => {
      const context = { needs: { probe: { outputs: { registry } } }, secrets };
      const hits = Object.entries(CANDIDATES).filter(([value]) =>
        evaluateWorkflowExpression(`(${body}) == '${value}'`, context),
      );
      expect(hits, registry).toHaveLength(1);
      return hits[0]?.[1] ?? "";
    };
    const both = { GITHUB_TOKEN: "per-run", STAMITY_REGISTRY_TOKEN: "company" };
    const perRunOnly = { GITHUB_TOKEN: "per-run" };
    // GitHub Packages, with or without its trailing slash, gets the per-run token — even when
    // the company secret is also set.
    for (const registry of [GITHUB_PACKAGES, `${GITHUB_PACKAGES}/`, `${GITHUB_PACKAGES}/acme-corp`]) {
      expect(chosen(registry, both), registry).toBe("GITHUB_TOKEN");
      expect(chosen(registry, perRunOnly), registry).toBe("GITHUB_TOKEN");
    }
    // Any other registry gets the company secret, and with none set the credential is empty,
    // which is what makes the npm step stop with its remedy rather than send the per-run token away.
    for (const registry of [
      "https://npm.pkg.github.com.example",
      "https://npm.pkg.github.com-proxy.example/",
      "https://registry.example/api/npm/acme/",
    ]) {
      expect(chosen(registry, both), registry).toBe("STAMITY_REGISTRY_TOKEN");
      expect(chosen(registry, perRunOnly), registry).toBe("none");
    }
  });
});

// ── steps copied from release.yml, held equal to it ──────────────────────────

describe("fork-release.yml — what it copies from release.yml stays equal to it", () => {
  it("runs the canonical ladder, step for step, with the same commands", () => {
    const names = jobOf(WORKFLOW, "gates").steps.map((step) => step.name);
    const ladder = [
      "Install",
      "Verify lockfile is in sync",
      "Build",
      "Test",
      "Leak gate",
      "Dogfood check",
      "Tarball smoke (publish shape)",
      "Pack tarball",
      "Build plugin runtime",
      "Build plugin distribution",
    ];
    expect(names.filter((name) => ladder.includes(name ?? ""))).toEqual(ladder);
    for (const name of ladder) {
      const fork = stepOf(WORKFLOW, "gates", name);
      const canonical = stepOf(RELEASE, "gates", name);
      expect(fork.run, name).toBe(canonical.run);
      expect(fork.env, name).toEqual(canonical.env);
    }
    const checks = runOf(WORKFLOW, "gates", "Generated manifests are current");
    expect(checks).toContain("node scripts/generate-apm-package.mjs --check");
    expect(checks).toContain("node scripts/generate-plugin-manifests.mjs --check");
    // The proofs come before anything is installed, built or packed.
    expect(names.indexOf("Prove the fork release")).toBeLessThan(names.indexOf("Install"));
  });

  it("uploads both artifacts for seven days, hidden files included in the distribution", () => {
    const tarball = stepOf(WORKFLOW, "gates", "Upload release tarball");
    const plugins = stepOf(WORKFLOW, "gates", "Upload plugin distribution");
    expect(tarball.with).toMatchObject({ name: "fork-release-dist", path: "*.tgz", "retention-days": 7 });
    expect(plugins.with).toMatchObject({
      name: "fork-release-plugins",
      path: "dist/plugins",
      "include-hidden-files": true,
      "retention-days": 7,
    });
    expect(stepOf(WORKFLOW, "publish", "Download release artifacts").with?.["name"]).toBe("fork-release-dist");
    expect(stepOf(WORKFLOW, "publish", "Download plugin distribution").with).toEqual({
      name: "fork-release-plugins",
      path: "plugins",
    });
  });

  it("verifies digests and pushes the distribution with release.yml's own steps, byte for byte", () => {
    for (const name of [
      "Verify tarball digest",
      "Verify plugin distribution digest",
      "Push plugin distribution",
    ]) {
      const fork = stepOf(WORKFLOW, "publish", name);
      const canonical = stepOf(RELEASE, "publish", name);
      expect(fork.run, name).toBe(canonical.run);
      expect(fork.env, name).toEqual(canonical.env);
    }
  });
});

// ── the probe, executed ──────────────────────────────────────────────────────

describe.skipIf(WINDOWS)("fork-release.yml — the probe, executed", () => {
  const PROBE = runOf(WORKFLOW, "probe", "Read the release destination");

  /** One run of the probe. An absent key is an unset variable, which Actions passes as empty. */
  function probe(vars: { readonly ARM?: string; readonly REGISTRY?: string; readonly BRANCH?: string; readonly REPO?: string }): OutputRun {
    const dir = scratchDir("probe");
    const outputPath = join(dir, "output");
    writeFileSync(outputPath, "");
    const result = spawnSync("bash", ["-c", PROBE], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: childPath(),
        GITHUB_OUTPUT: outputPath,
        ARM: vars.ARM ?? "",
        REGISTRY: vars.REGISTRY ?? "",
        BRANCH: vars.BRANCH ?? "",
        REPO: vars.REPO ?? FORK_REPOSITORY,
      },
    });
    return { status: result.status, out: `${result.stdout}${result.stderr}`, outputs: outputsOf(outputPath) };
  }

  it("ends green and unarmed, naming both variables, when nothing is set", () => {
    const run = probe({});
    expect(run.status, run.out).toBe(0);
    expect(run.outputs["armed"]).toBe("false");
    expect(run.out).toContain("::notice");
    expect(run.out).toContain("STAMITY_FORK_RELEASE");
    expect(run.out).toContain("STAMITY_RELEASE_REGISTRY");
  });

  it("stays unarmed when STAMITY_FORK_RELEASE names another repository, as an organization value would", () => {
    const run = probe({ ARM: "acme-corp/another-repo", REGISTRY: GITHUB_PACKAGES });
    expect(run.status, run.out).toBe(0);
    expect(run.outputs["armed"]).toBe("false");
  });

  it("stays unarmed in the canonical repository, whatever the variables say", () => {
    const run = probe({ ARM: CANONICAL_REPOSITORY, REGISTRY: GITHUB_PACKAGES, REPO: CANONICAL_REPOSITORY });
    expect(run.status, run.out).toBe(0);
    expect(run.outputs["armed"]).toBe("false");
    expect(run.out).toContain("release.yml");
  });

  it("arms a fork whose variable names itself, case-insensitively, on main by default", () => {
    const run = probe({ ARM: FORK_REPOSITORY.toLowerCase(), REGISTRY: GITHUB_PACKAGES });
    expect(run.status, run.out).toBe(0);
    expect(run.outputs).toEqual({ armed: "true", branch: "main", registry: GITHUB_PACKAGES });
    const custom = "https://registry.example:8443/api/npm/acme/";
    const onBranch = probe({ ARM: FORK_REPOSITORY, REGISTRY: custom, BRANCH: "release/1.x" });
    expect(onBranch.status, onBranch.out).toBe(0);
    expect(onBranch.outputs).toEqual({ armed: "true", branch: "release/1.x", registry: custom });
  });

  it("fails an armed fork whose registry is not a clean https URL, and never prints the value", () => {
    for (const registry of [
      "http://registry.example",
      "https://user:secret-pass@registry.example",
      "https://registry.example/npm?token=secret-query",
      "https://registry.example/npm#secret-fragment",
      "https://",
      "",
    ]) {
      const run = probe({ ARM: FORK_REPOSITORY, REGISTRY: registry });
      expect(run.status, registry).toBe(1);
      expect(run.out, registry).toContain("::error");
      expect(run.out, registry).toContain("STAMITY_RELEASE_REGISTRY");
      expect(run.outputs["armed"], registry).toBeUndefined();
      expect(run.outputs["registry"], registry).toBeUndefined();
      for (const fragment of ["registry.example", "secret-pass", "secret-query", "secret-fragment"]) {
        expect(run.out, registry).not.toContain(fragment);
      }
    }
  });

  it("fails an armed fork whose release branch is not a valid branch name", () => {
    for (const branch of ["bad..name", "-main", "trailing/", "has space"]) {
      const run = probe({ ARM: FORK_REPOSITORY, REGISTRY: GITHUB_PACKAGES, BRANCH: branch });
      expect(run.status, branch).toBe(1);
      expect(run.out, branch).toContain("STAMITY_RELEASE_BRANCH");
    }
  });
});

/** A refused proof: exit 1, the named reason, the remedy, and no outputs for the next steps. */
function expectRefused(run: OutputRun, reason: string): void {
  expect(run.status, run.out).toBe(1);
  expect(run.out).toContain(reason);
  expect(run.out).toContain("node scripts/fork-identity.mjs --repository <url> --registry <url>");
  expect(run.outputs).toEqual({});
}

// ── the proofs, executed ─────────────────────────────────────────────────────

describe.skipIf(WINDOWS)("fork-release.yml — the proofs, executed", () => {
  const PROVE = runOf(WORKFLOW, "gates", "Prove the fork release");

  interface Manifest {
    readonly name: string;
    readonly version: string;
    readonly private?: boolean;
    readonly publishConfig?: { readonly registry: string };
  }

  const CONSISTENT: Manifest = {
    name: FORK_PACKAGE,
    version: FORK_VERSION,
    publishConfig: { registry: GITHUB_PACKAGES },
  };

  interface ProofRepo {
    readonly dir: string;
    /** The commit `v<version>` names, reachable from origin/main. */
    readonly tagged: string;
    /** A commit on a side branch that never reached origin/main. */
    readonly unmerged: string;
  }

  /** A checkout shaped like the depth-0 one: main, its remote-tracking ref, and a side commit. */
  function proofRepo(manifest: Manifest): ProofRepo {
    const dir = scratchDir("proof");
    git(dir, "init", "-q", "-b", "main");
    git(dir, "config", "user.email", "ci@example.invalid");
    git(dir, "config", "user.name", "CI");
    writeFileSync(join(dir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    git(dir, "add", "package.json");
    git(dir, "commit", "-q", "-m", "root");
    git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
    const tagged = gitOut(dir, "rev-parse", "HEAD");
    git(dir, "checkout", "-q", "-b", "side");
    git(dir, "commit", "-q", "--allow-empty", "-m", "never merged");
    const unmerged = gitOut(dir, "rev-parse", "HEAD");
    git(dir, "checkout", "-q", "main");
    return { dir, tagged, unmerged };
  }

  function prove(
    repo: ProofRepo,
    overrides: Readonly<Record<string, string>> = {},
  ): OutputRun {
    const outputPath = join(repo.dir, ".step-output");
    writeFileSync(outputPath, "");
    const result = spawnSync("bash", ["-c", PROVE], {
      cwd: repo.dir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: childPath(),
        GITHUB_OUTPUT: outputPath,
        GITHUB_EVENT_NAME: "push",
        GITHUB_REF: `refs/tags/v${FORK_VERSION}`,
        GITHUB_SHA: repo.tagged,
        GITHUB_REPOSITORY_OWNER: FORK_OWNER,
        REGISTRY: GITHUB_PACKAGES,
        BRANCH: "main",
        DRY_RUN_INPUT: "",
        ...overrides,
      },
    });
    return { status: result.status, out: `${result.stdout}${result.stderr}`, outputs: outputsOf(outputPath) };
  }

  it("passes a consistent fork: its tag, a suffixed version, on main, published to GitHub Packages", () => {
    const run = prove(proofRepo(CONSISTENT));
    expect(run.status, run.out).toBe(0);
    expect(run.outputs).toEqual({ version: FORK_VERSION, package_name: FORK_PACKAGE });
  });

  it("normalises trailing slashes between publishConfig.registry and the variable", () => {
    const run = prove(proofRepo({ ...CONSISTENT, publishConfig: { registry: `${GITHUB_PACKAGES}/` } }));
    expect(run.status, run.out).toBe(0);
  });

  it("checks the scope against the owner only on GitHub Packages", () => {
    const registry = "https://registry.example/api/npm/acme/";
    const run = prove(proofRepo({ ...CONSISTENT, name: "@other/stamity", publishConfig: { registry } }), {
      REGISTRY: registry.slice(0, -1),
    });
    expect(run.status, run.out).toBe(0);
  });

  it("refuses the canonical package name, which is what an imported canonical tag carries", () => {
    expectRefused(prove(proofRepo({ ...CONSISTENT, name: CANONICAL_PACKAGE })), "still names the canonical package");
  });

  it("refuses a private package", () => {
    expectRefused(prove(proofRepo({ ...CONSISTENT, private: true })), "private: true");
  });

  it("refuses a publishConfig.registry that is not the armed registry, or is absent", () => {
    expectRefused(
      prove(proofRepo({ ...CONSISTENT, publishConfig: { registry: "https://registry.example" } })),
      "does not equal the STAMITY_RELEASE_REGISTRY variable",
    );
    const { publishConfig: _dropped, ...withoutRegistry } = CONSISTENT;
    expectRefused(prove(proofRepo(withoutRegistry)), "does not equal the STAMITY_RELEASE_REGISTRY variable");
  });

  it("refuses an unscoped name, or another owner's scope, on GitHub Packages", () => {
    expectRefused(prove(proofRepo({ ...CONSISTENT, name: "stamity" })), "GitHub Packages publishes only @acme-corp/");
    expectRefused(prove(proofRepo({ ...CONSISTENT, name: "@other/stamity" })), "GitHub Packages publishes only @acme-corp/");
  });

  it("refuses a tag whose commit never reached the release branch", () => {
    const repo = proofRepo(CONSISTENT);
    expectRefused(prove(repo, { GITHUB_SHA: repo.unmerged }), "is not reachable from origin/main");
  });

  it("refuses a tag that names another version than package.json", () => {
    expectRefused(prove(proofRepo(CONSISTENT), { GITHUB_REF: "refs/tags/v1.10.0" }), "comes from the tag v1.10.0-acme.1");
  });

  it("refuses a release branch the checkout did not fetch", () => {
    expectRefused(prove(proofRepo(CONSISTENT), { BRANCH: "release" }), "refs/remotes/origin/release is not present");
  });

  it("holds a real-publish dispatch from a branch to the ref proofs", () => {
    const run = prove(proofRepo(CONSISTENT), {
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF: "refs/heads/main",
      DRY_RUN_INPUT: "FALSE",
    });
    expectRefused(run, "This run is on refs/heads/main");
  });

  it("rehearses from a branch, skipping only the ref proofs and saying so", () => {
    const rehearse = { GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/feature/x", DRY_RUN_INPUT: "true" };
    const run = prove(proofRepo(CONSISTENT), rehearse);
    expect(run.status, run.out).toBe(0);
    expect(run.out).toContain("SKIPPED");
    // The identity proofs are not skipped: a rehearsal of the canonical name still fails.
    expectRefused(prove(proofRepo({ ...CONSISTENT, name: CANONICAL_PACKAGE }), rehearse), "still names the canonical package");
  });
});

// ── the publish job's own steps, executed ────────────────────────────────────

describe.skipIf(WINDOWS)("fork-release.yml — the publish backstop, executed", () => {
  const BACKSTOP = runOf(WORKFLOW, "publish", "Refuse an unarmed destination");

  function backstop(env: Readonly<Record<string, string>>): { status: number | null; out: string } {
    const result = spawnSync("bash", ["-c", BACKSTOP], {
      encoding: "utf8",
      env: { ...process.env, ARM: FORK_REPOSITORY, REPO: FORK_REPOSITORY, GITHUB_EVENT_NAME: "push", DRY_RUN_INPUT: "", ...env },
    });
    return { status: result.status, out: `${result.stdout}${result.stderr}` };
  }

  it("passes an armed tag push and an armed real dispatch", () => {
    expect(backstop({}).status).toBe(0);
    expect(backstop({ GITHUB_EVENT_NAME: "workflow_dispatch", DRY_RUN_INPUT: "false" }).status).toBe(0);
  });

  it("refuses the canonical repository, an unarmed one, and every dispatch that did not confirm a real run", () => {
    expect(backstop({ ARM: CANONICAL_REPOSITORY, REPO: CANONICAL_REPOSITORY }).out).toContain("release.yml");
    for (const env of [
      { ARM: CANONICAL_REPOSITORY, REPO: CANONICAL_REPOSITORY },
      { ARM: "" },
      { ARM: "acme-corp/another-repo" },
      { GITHUB_EVENT_NAME: "workflow_dispatch", DRY_RUN_INPUT: "true" },
      { GITHUB_EVENT_NAME: "workflow_dispatch", DRY_RUN_INPUT: "" },
    ]) {
      const run = backstop(env);
      expect(run.status, JSON.stringify(env)).toBe(1);
      expect(run.out).toContain("Failing closed");
    }
  });
});

/**
 * A stub on PATH that records every argv it receives, one line per call. Stubbed because the
 * real `npm` and `gh` talk to a registry and to the GitHub API, which a suite may not reach;
 * the steps' control flow around them is what is under test.
 */
function stubCommand(dir: string, name: string, body: string): void {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$STUB_LOG"\n${body}\n`);
  chmodSync(path, 0o755);
}

function logOf(path: string): readonly string[] {
  return existsSync(path) ? readFileSync(path, "utf8").split("\n").filter((line) => line !== "") : [];
}

describe.skipIf(WINDOWS)("fork-release.yml — the tarball's identity, executed against a packed tarball", () => {
  const IDENTITY = runOf(WORKFLOW, "publish", "Verify the tarball's identity");
  const TARBALL = `acme-corp-stamity-${FORK_VERSION}.tgz`;
  const PACKED = { name: FORK_PACKAGE, version: FORK_VERSION, publishConfig: { registry: GITHUB_PACKAGES } };

  /** A tarball in npm pack's layout, its manifest at package/package.json, checked by the step. */
  function identity(
    packed: Readonly<Record<string, unknown>> | null,
    env: Readonly<Record<string, string>> = {},
  ): { status: number | null; out: string } {
    const dir = scratchDir("identity");
    mkdirSync(join(dir, "package"));
    if (packed === null) writeFileSync(join(dir, "package", "README.md"), "no manifest\n");
    else writeFileSync(join(dir, "package", "package.json"), `${JSON.stringify(packed, null, 2)}\n`);
    execFileSync("tar", ["-czf", TARBALL, "package"], { cwd: dir, stdio: "pipe" });
    const result = spawnSync("bash", ["-c", IDENTITY], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: childPath(),
        TARBALL,
        EXPECTED_NAME: FORK_PACKAGE,
        EXPECTED_VERSION: FORK_VERSION,
        EXPECTED_REGISTRY: GITHUB_PACKAGES,
        ...env,
      },
    });
    return { status: result.status, out: `${result.stdout}${result.stderr}` };
  }

  it("passes a tarball that declares the proved name, version and registry, trailing slashes aside", () => {
    expect(identity(PACKED).status).toBe(0);
    const slashed = identity({ ...PACKED, publishConfig: { registry: `${GITHUB_PACKAGES}/` } });
    expect(slashed.status, slashed.out).toBe(0);
  });

  it("refuses a tarball whose own package.json names another package", () => {
    const run = identity({ ...PACKED, name: CANONICAL_PACKAGE });
    expect(run.status).toBe(1);
    expect(run.out).toContain("declares name");
    expect(run.out).toContain("Refusing to publish");
  });

  it("refuses a tarball whose own package.json declares another version", () => {
    const run = identity({ ...PACKED, version: "1.10.0" });
    expect(run.status).toBe(1);
    expect(run.out).toContain("declares version");
  });

  it("refuses a tarball whose publishConfig.registry is another registry, or absent", () => {
    const other = identity({ ...PACKED, publishConfig: { registry: "https://registry.example/" } });
    expect(other.status).toBe(1);
    expect(other.out).toContain("declares publishConfig.registry");
    const { publishConfig: _dropped, ...withoutRegistry } = PACKED;
    expect(identity(withoutRegistry).status).toBe(1);
  });

  it("refuses when a proved value is missing, and when the tarball carries no manifest", () => {
    expect(identity(PACKED, { EXPECTED_NAME: "" }).status).toBe(1);
    const bare = identity(null);
    expect(bare.status).toBe(1);
    expect(bare.out).toContain("carries no readable package/package.json");
  });
});

/** A stand-in digest per archive name, and the `sha256sum -c` line the builder writes for it. */
function digestOf(archive: string): string {
  return createHash("sha256").update(archive).digest("hex");
}
function lineOf(archive: string): string {
  return `${digestOf(archive)}  ${archive}\n`;
}

describe.skipIf(WINDOWS)("fork-release.yml — the plugin checksum files, executed", () => {
  const CHECKSUMS = runOf(WORKFLOW, "publish", "Verify plugin checksum files");
  const ARCHIVES = [`stamity-plugin-claude-${FORK_VERSION}.zip`, `stamity-plugin-codex-${FORK_VERSION}.zip`];

  /** A downloaded distribution: release.json naming both archives, and the given checksum files. */
  function checksums(files: Readonly<Record<string, string>>): { status: number | null; out: string } {
    const dir = scratchDir("checksums");
    mkdirSync(join(dir, "plugins"));
    const packages = ARCHIVES.map((archive) => ({ archive, sha256: digestOf(archive) }));
    writeFileSync(join(dir, "plugins", "release.json"), `${JSON.stringify({ packages })}\n`);
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, "plugins", name), body);
    const result = spawnSync("bash", ["-c", CHECKSUMS], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, PATH: childPath() },
    });
    return { status: result.status, out: `${result.stdout}${result.stderr}` };
  }

  const MATCHING = Object.fromEntries(ARCHIVES.map((archive) => [`${archive}.sha256`, lineOf(archive)]));

  it("passes checksum files that state exactly the manifest's digests", () => {
    const run = checksums(MATCHING);
    expect(run.status, run.out).toBe(0);
  });

  it("refuses a checksum file whose digest is not the manifest's", () => {
    const [first = ""] = ARCHIVES;
    const run = checksums({ ...MATCHING, [`${first}.sha256`]: `${"0".repeat(64)}  ${first}\n` });
    expect(run.status).toBe(1);
    expect(run.out).toContain(`plugins/${first}.sha256 does not state the digest`);
  });

  it("refuses a checksum file the manifest does not name, and a missing one", () => {
    const stray = checksums({ ...MATCHING, "extra.zip.sha256": lineOf("extra.zip") });
    expect(stray.status).toBe(1);
    expect(stray.out).toContain("plugins/extra.zip.sha256 is not named by the verified manifest");
    const [first = "", second = ""] = ARCHIVES;
    const missing = checksums({ [`${first}.sha256`]: lineOf(first) });
    expect(missing.status).toBe(1);
    expect(missing.out).toContain(`plugins/${second}.sha256 is missing`);
  });
});

describe.skipIf(WINDOWS)("fork-release.yml — the registry publish, executed with npm stubbed", () => {
  const PUBLISH = runOf(WORKFLOW, "publish", "Publish to the registry");
  const TARBALL = `acme-corp-stamity-${FORK_VERSION}.tgz`;
  const TARBALL_BYTES = "the packed tarball's bytes\n";
  const INTEGRITY = `sha512-${createHash("sha512").update(TARBALL_BYTES).digest("base64")}`;

  function publish(env: Readonly<Record<string, string>>): { status: number | null; out: string; calls: readonly string[] } {
    const dir = scratchDir("npm");
    const bin = join(dir, "bin");
    mkdirSync(bin);
    stubCommand(bin, "npm", 'if [ "$1" = "view" ]; then printf \'%s\' "${NPM_VIEW:-}"; fi');
    writeFileSync(join(dir, TARBALL), TARBALL_BYTES);
    const log = join(dir, "calls");
    const result = spawnSync("bash", ["-c", PUBLISH], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: childPath(bin),
        STUB_LOG: log,
        NODE_AUTH_TOKEN: "company-token",
        REGISTRY: GITHUB_PACKAGES,
        PACKAGE_NAME: FORK_PACKAGE,
        VERSION: FORK_VERSION,
        TARBALL,
        NPM_VIEW: "",
        ...env,
      },
    });
    return { status: result.status, out: `${result.stdout}${result.stderr}`, calls: logOf(log) };
  }

  const VIEW = `view ${FORK_PACKAGE}@${FORK_VERSION} dist.integrity --registry ${GITHUB_PACKAGES}`;

  it("publishes once, to the armed registry, when the version is not there yet", () => {
    const run = publish({});
    expect(run.status, run.out).toBe(0);
    expect(run.calls).toEqual([VIEW, `publish ./${TARBALL} --registry ${GITHUB_PACKAGES}`]);
  });

  it("skips the publish when the version is already there with this tarball's integrity", () => {
    const run = publish({ NPM_VIEW: INTEGRITY });
    expect(run.status, run.out).toBe(0);
    expect(run.out).toContain("already published");
    expect(run.calls).toEqual([VIEW]);
  });

  it("refuses when another tarball already holds the version", () => {
    const run = publish({ NPM_VIEW: "sha512-another-tarball" });
    expect(run.status).toBe(1);
    expect(run.out).toContain("already published from another tarball");
    expect(run.calls).toEqual([VIEW]);
  });

  it("stops before any npm call, with the remedy, when there is no credential", () => {
    const run = publish({ NODE_AUTH_TOKEN: "", REGISTRY: "https://registry.example/api/npm/acme/" });
    expect(run.status).toBe(1);
    expect(run.out).toContain("set the STAMITY_REGISTRY_TOKEN secret, or publish to GitHub Packages");
    expect(run.calls).toEqual([]);
  });

  it("publishes with neither provenance nor an access flag", () => {
    expect(PUBLISH).not.toContain("--provenance");
    expect(PUBLISH).not.toContain("--access");
  });
});

describe.skipIf(WINDOWS)("fork-release.yml — the GitHub release, executed with gh stubbed", () => {
  const RELEASE_STEP = runOf(WORKFLOW, "publish", "Create GitHub release");
  const TARBALL = `acme-corp-stamity-${FORK_VERSION}.tgz`;
  const ARCHIVE = `stamity-plugin-claude-${FORK_VERSION}.zip`;
  const SOURCE_SHA = "4e07408562bedb8b60ce05c1decfe3ad16b72230";
  const ALL_ASSETS = [TARBALL, `${TARBALL}.sha256`, ARCHIVE, `${ARCHIVE}.sha256`, "release.json"];

  function release(
    present: readonly string[] | null,
    options: { readonly withoutManifest?: boolean } = {},
  ): { status: number | null; out: string; calls: readonly string[]; dir: string } {
    const dir = scratchDir("gh");
    const bin = join(dir, "bin");
    mkdirSync(bin);
    // `release view` answers from a file of asset names, or fails as a missing release does.
    stubCommand(
      bin,
      "gh",
      'if [ "$1" = "release" ] && [ "$2" = "view" ]; then\n  if [ -f "$GH_PRESENT" ]; then cat "$GH_PRESENT"; exit 0; fi\n  echo "release not found" >&2; exit 1\nfi',
    );
    mkdirSync(join(dir, "plugins"));
    writeFileSync(join(dir, TARBALL), "tarball\n");
    writeFileSync(join(dir, "plugins", ARCHIVE), "archive\n");
    writeFileSync(join(dir, "plugins", `${ARCHIVE}.sha256`), `digest  ${ARCHIVE}\n`);
    if (options.withoutManifest !== true) writeFileSync(join(dir, "plugins", "release.json"), "{}\n");
    const presentPath = join(dir, "present");
    if (present !== null) writeFileSync(presentPath, `${present.join("\n")}\n`);
    const log = join(dir, "calls");
    const result = spawnSync("bash", ["-c", RELEASE_STEP], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: childPath(bin),
        STUB_LOG: log,
        GH_PRESENT: presentPath,
        TARBALL,
        VERSION: FORK_VERSION,
        GITHUB_SHA: SOURCE_SHA,
      },
    });
    return { status: result.status, out: `${result.stdout}${result.stderr}`, calls: logOf(log), dir };
  }

  it("creates the release on the existing tag with the tarball, every archive, every checksum and release.json", () => {
    const run = release(null);
    expect(run.status, run.out).toBe(0);
    const create = run.calls.find((call) => call.startsWith("release create "));
    expect(create, run.calls.join("\n")).toBeDefined();
    const argv = create ?? "";
    expect(argv.startsWith(`release create v${FORK_VERSION} ${TARBALL} ${TARBALL}.sha256 plugins/${ARCHIVE} plugins/${ARCHIVE}.sha256 plugins/release.json `)).toBe(true);
    expect(argv).toContain(`--target ${SOURCE_SHA}`);
    expect(argv).toContain("--verify-tag");
    expect(argv).toContain("no provenance and no attestation");
    // The tarball's checksum is written in the `sha256sum -c` form the archives' use.
    const digest = createHash("sha256").update("tarball\n").digest("hex");
    expect(readFileSync(join(run.dir, `${TARBALL}.sha256`), "utf8")).toBe(`${digest}  ${TARBALL}\n`);
  });

  it("does nothing on a re-run that finds every asset on the release", () => {
    const run = release(ALL_ASSETS);
    expect(run.status, run.out).toBe(0);
    expect(run.out).toContain("already carries every asset");
    expect(run.calls).toEqual([`release view v${FORK_VERSION} --json assets --jq .assets[].name`]);
  });

  it("uploads only what a partial earlier run left missing, and replaces nothing", () => {
    const run = release(ALL_ASSETS.filter((name) => name !== "release.json"));
    expect(run.status, run.out).toBe(0);
    expect(run.calls.at(-1)).toBe(`release upload v${FORK_VERSION} plugins/release.json`);
    expect(run.calls.some((call) => call.includes("--clobber"))).toBe(false);
  });

  it("refuses to create a release that would not carry release.json", () => {
    const run = release(null, { withoutManifest: true });
    expect(run.status).toBe(1);
    expect(run.out).toContain("missing plugins/release.json");
    expect(run.calls).toEqual([]);
  });
});

describe.skipIf(WINDOWS)("fork-release.yml — the distribution push, executed against a scratch remote", () => {
  const PUSH = runOf(WORKFLOW, "publish", "Push plugin distribution");
  const BRANCH = "plugin-dist";
  const TAG = `plugins/v${FORK_VERSION}`;
  const SOURCE_SHA = "4e07408562bedb8b60ce05c1decfe3ad16b72230";
  const TOKEN = "scratch-token";
  const REMOTE_URL = `https://x-access-token:${TOKEN}@github.com/${FORK_REPOSITORY}.git`;
  const MANIFEST = {
    schemaVersion: 1,
    version: FORK_VERSION,
    sourceCommit: SOURCE_SHA,
    // Fixed, so one release builds one commit however often the step runs.
    sourceCommitDate: "2026-09-24T09:15:00+02:00",
    distribution: { branch: BRANCH, tag: TAG, commit: null },
    packages: [{ client: "claude", path: "claude", archive: `stamity-plugin-claude-${FORK_VERSION}.zip` }],
  };

  interface Scenario {
    readonly dir: string;
    readonly bare: string;
    readonly env: Readonly<Record<string, string>>;
  }

  /** A staged `plugins/` tree, and a bare remote the step's https URL is rewritten to. */
  function scenario(): Scenario {
    const dir = scratchDir("push");
    const bare = join(dir, "remote.git");
    const configPath = join(dir, "gitconfig");
    git(dir, "init", "--bare", "-q", bare);
    writeFileSync(configPath, `[url "${bare}"]\n\tinsteadOf = ${REMOTE_URL}\n`);
    return {
      dir,
      bare,
      env: {
        PATH: childPath(),
        HOME: dir,
        GIT_CONFIG_GLOBAL: configPath,
        GIT_CONFIG_SYSTEM: "/dev/null",
        GIT_TERMINAL_PROMPT: "0",
        GITHUB_SHA: SOURCE_SHA,
        GH_TOKEN: TOKEN,
        REPOSITORY: FORK_REPOSITORY,
        VERSION: FORK_VERSION,
        BRANCH,
        TAG,
      },
    };
  }

  function push(setup: Scenario, attempt: string): { status: number | null; out: string } {
    const workdir = join(setup.dir, attempt);
    mkdirSync(join(workdir, "plugins", ".claude-plugin"), { recursive: true });
    writeFileSync(join(workdir, "plugins", "release.json"), `${JSON.stringify(MANIFEST, null, 2)}\n`);
    writeFileSync(join(workdir, "plugins", `stamity-plugin-claude-${FORK_VERSION}.zip`), "archive bytes\n");
    writeFileSync(join(workdir, "plugins", ".claude-plugin", "marketplace.json"), '{"name":"stamity"}\n');
    const envPath = join(workdir, "github-env");
    writeFileSync(envPath, "");
    const result = spawnSync("bash", ["-c", PUSH], {
      cwd: workdir,
      encoding: "utf8",
      env: { ...process.env, ...setup.env, GITHUB_ENV: envPath },
    });
    return { status: result.status, out: `${result.stdout}${result.stderr}` };
  }

  const refOf = (bare: string, ref: string): string =>
    gitOut(bare, "for-each-ref", "--format=%(objectname)", ref);

  it("creates the branch and the tag on the first run, and moves neither on a re-run", () => {
    const setup = scenario();
    const first = push(setup, "attempt-1");
    expect(first.status, first.out).toBe(0);
    const head = refOf(setup.bare, `refs/heads/${BRANCH}`);
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    expect(refOf(setup.bare, `refs/tags/${TAG}`)).toBe(head);
    expect(gitOut(setup.bare, "rev-list", "--count", head)).toBe("1");

    const second = push(setup, "attempt-2");
    expect(second.status, second.out).toBe(0);
    expect(second.out).toContain("already points at");
    expect(refOf(setup.bare, `refs/heads/${BRANCH}`)).toBe(head);
    expect(refOf(setup.bare, `refs/tags/${TAG}`)).toBe(head);
  });

  it("refuses, and pushes nothing, when the tag already points elsewhere", () => {
    const setup = scenario();
    const other = join(setup.dir, "other");
    mkdirSync(other);
    git(other, "init", "-q", "-b", "main");
    git(other, "config", "user.email", "ci@example.invalid");
    git(other, "config", "user.name", "CI");
    git(other, "commit", "-q", "--allow-empty", "-m", "another build");
    git(other, "push", "-q", setup.bare, `HEAD:refs/tags/${TAG}`);
    const poisoned = refOf(setup.bare, `refs/tags/${TAG}`);

    const run = push(setup, "attempt-1");

    expect(run.status).toBe(1);
    expect(run.out).toContain("Refusing to move a published distribution tag");
    expect(refOf(setup.bare, `refs/tags/${TAG}`)).toBe(poisoned);
    expect(refOf(setup.bare, `refs/heads/${BRANCH}`)).toBe("");
  });
});
