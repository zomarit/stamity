import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * `scripts/plugin-route-smoke.mjs`: the per-client route proof (REQ-PLUGIN-020).
 *
 * WHAT THIS SUITE OWNS, AND WHAT IT DELIBERATELY DOES NOT. The smoke's four legs cost four
 * different things. `structure` reads a built tree and needs no binary, no credential and no
 * network, so it is asserted unconditionally and is the leg a pull request blocks on. `install` and
 * `discovery` need a client binary, so each client's cases sit behind
 * `describe.skipIf(process.env["STAMITY_<CLIENT>_BIN"] === undefined)` — a suite that went red on a
 * machine without a vendor CLI would be testing the machine. `invocation` needs a model call and a
 * login: it belongs to the QA harness lane (`scripts/qa/plugin-runs.mjs`) and the nightly workflow,
 * and is never driven from here.
 *
 * ONE BUILD, SHARED, WITH A STUB RUNTIME. The suite spawns `scripts/build-plugin-distribution.mjs`
 * once in `beforeAll` — the tree's properties are what is under test, so the builder runs as a child
 * process the way a release runs it. `--runtime` is a stub carrying the three files the build
 * requires (the pattern and the justification are `test/ci/pluginDistribution.test.ts`'s): every leg
 * asserted here reads or copies bytes, and none of them executes the runtime, so building the real
 * one from a packed tarball would add two minutes per run to re-prove a contract that already has an
 * owner in `test/ci/pluginRuntime.test.ts`. The `invocation` leg is the one that needs a real
 * runtime, and it is not this suite's.
 *
 * Wall-time budgets, derived rather than guessed. `/usr/bin/time` on this repository's corpus,
 * 2026-09-20: `node scripts/build-plugin-distribution.mjs --out <tmp> --runtime <stub>` takes 2.0s
 * (four roots, the APM projection and four archives, warm), and a four-client credential-free smoke
 * run takes 8.5s of which the copilot and codex installs are ~7s of real client work. The budgets
 * below leave roughly 10x headroom for a loaded CI worker, including the Windows leg that cannot be
 * measured from here.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SMOKE = join(REPO_ROOT, "scripts", "plugin-route-smoke.mjs");
const CLIENTS = ["claude", "cursor", "copilot", "codex"] as const;

const FULL_BUILD_MS = 120_000;
/** One armed client's install and discovery legs, at the smoke's own per-call ceiling. */
const ARMED_MS = 300_000;

const FIXED_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const FIXED_COMMIT_DATE = "2026-09-20T00:00:00Z";
const VERSION = "1.9.0";

const work = mkdtempSync(join(tmpdir(), "stamity-plugin-route-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function tempDir(prefix: string): string {
  return mkdtempSync(join(work, `${prefix}-`));
}

/** Justified stub — see the suite header; the real runtime is `pluginRuntime.test.ts`'s to prove. */
function stubRuntime(): string {
  const dir = tempDir("runtime");
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "@zomarit/stamity", version: "1.8.0", engines: { node: ">=22.22.2" } }, null, 2)}\n`,
  );
  mkdirSync(join(dir, "dist"));
  writeFileSync(join(dir, "dist", "cli.js"), "#!/usr/bin/env node\nconsole.log('stub runtime');\n");
  writeFileSync(
    join(dir, "RUNTIME.json"),
    `${JSON.stringify(
      {
        package: "@zomarit/stamity",
        version: "1.8.0",
        nodeFloor: ">=22.22.2",
        tarballSha256: "a".repeat(64),
        dependencies: [],
      },
      null,
      2,
    )}\n`,
  );
  return dir;
}

let dist: string;

beforeAll(() => {
  dist = join(tempDir("distribution"), "dist");
  const result = spawnSync(
    process.execPath,
    [
      join(REPO_ROOT, "scripts", "build-plugin-distribution.mjs"),
      "--out", dist,
      "--runtime", stubRuntime(),
      "--version", VERSION,
      "--source-commit", FIXED_COMMIT,
      "--source-commit-date", FIXED_COMMIT_DATE,
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      // A PRIVATE temp root for the builder's own scratch trees. The corpus staging step creates
      // `<tmpdir>/stamity-plugin-corpus-*`, and `test/ci/pluginModules.test.ts` asserts that a
      // refused staging leaves no NEW directory of that name under `tmpdir()` — a scan of a shared
      // resource, which any concurrent build in the same run can satisfy or break by accident.
      // Redirecting `TMPDIR` keeps this suite's build out of that scan instead of adding a fifth
      // racer to it.
      env: { ...process.env, TMPDIR: tempDir("builder-tmp") },
    },
  );
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
}, FULL_BUILD_MS);

/**
 * The environment a disarmed run gets: this process's own, minus the four arming variables.
 *
 * Deleting them rather than passing an allowlist keeps `PATH` and the rest of the ambient
 * environment intact — what is under test is the smoke's behaviour when a client is not ARMED, which
 * is a different fact from a machine that has no clients on it.
 */
function disarmed(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const client of CLIENTS) delete env[`STAMITY_${client.toUpperCase()}_BIN`];
  return env;
}

interface Leg {
  leg: string;
  status: "PASS" | "FAIL" | "SKIPPED";
  reason: string;
  command: string | null;
  exitCode: number | null;
  binaryVersion: string | null;
  transcriptSha256: string | null;
}

interface Report {
  dist: string;
  sha256s: Record<string, string>;
  clients: Record<string, { legs: Leg[] }>;
}

function smoke(args: string[], env: NodeJS.ProcessEnv = disarmed()): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [SMOKE, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env,
    timeout: ARMED_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** One run, with its `--json` document read back. */
function smokeWithJson(args: string[], env: NodeJS.ProcessEnv = disarmed()): { run: SpawnSyncReturns<string>; report: Report } {
  const jsonPath = join(tempDir("json"), "legs.json");
  const run = smoke([...args, "--json", jsonPath], env);
  return { run, report: JSON.parse(readFileSync(jsonPath, "utf8")) as Report };
}

function legOf(report: Report, client: string, name: string): Leg {
  const found = report.clients[client]?.legs.find((leg) => leg.leg === name);
  expect(found, `${client} has no ${name} leg`).toBeDefined();
  return found as Leg;
}

// ── the credential-free leg, which is the one CI blocks on ────────────────────

describe("the structure leg over a real distribution", () => {
  it(
    "passes for all four roots and exits 0 with every binary-bound leg SKIPPED",
    () => {
      const { run, report } = smokeWithJson(["--dist", dist, "--client", CLIENTS.join(",")]);
      expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);

      for (const client of CLIENTS) {
        const structure = legOf(report, client, "structure");
        expect(structure.status, `${client}: ${structure.reason}`).toBe("PASS");
        // Non-degenerate: the reason names the counts it compared and the vendor document it
        // applied, so a leg that checked nothing could not produce this line.
        expect(structure.reason, client).toContain("stamity-plugin.json valid at version 1.9.0");
        expect(structure.reason, client).toContain("counts match");
        expect(structure.reason, client).toContain("satisfies");
        for (const name of ["install", "discovery", "invocation"]) {
          const leg = legOf(report, client, name);
          expect(leg.status, `${client} ${name}: ${leg.reason}`).toBe("SKIPPED");
          expect(leg.reason).toBe(`STAMITY_${client.toUpperCase()}_BIN unset`);
        }
        // One result line per leg, in the fixed order, on stdout.
        expect(run.stdout).toContain(`plugin-route: ${client} structure PASS (`);
      }
      expect(run.stdout).toContain("plugin-route: PASS - 4 passed, 0 failed, 12 skipped across 4 client(s)");
    },
    ARMED_MS,
  );

  it(
    "counts the tree rather than trusting the declaration: a removed command is a FAIL naming both numbers",
    () => {
      // The negative control the whole leg rests on. Without it, every assertion above would pass
      // against a structure leg that read the capability file and never looked at the tree.
      const broken = join(tempDir("broken"), "dist");
      cpSync(dist, broken, { recursive: true });
      rmSync(join(broken, "claude", "commands", "st-work.md"));

      const { run, report } = smokeWithJson(["--dist", broken, "--client", "claude"]);
      expect(run.status).toBe(1);
      const structure = legOf(report, "claude", "structure");
      expect(structure.status).toBe("FAIL");
      expect(structure.reason).toContain("declares command 10");
      expect(structure.reason).toContain("commands/ holds 9 file(s)");
      // A root the smoke refused is never handed to a client, and the three legs say so rather
      // than reading as "not armed".
      expect(legOf(report, "claude", "install").reason).toContain("the structure leg failed");
    },
    ARMED_MS,
  );

  it("refuses a capability file its own reader refuses", () => {
    const broken = join(tempDir("invalid-capability"), "dist");
    cpSync(dist, broken, { recursive: true });
    const path = join(broken, "codex", "stamity-plugin.json");
    const capability = JSON.parse(readFileSync(path, "utf8")) as { classes: Record<string, unknown> };
    capability.classes["skill"] = { status: "carried" };
    writeFileSync(path, `${JSON.stringify(capability, null, 2)}\n`);

    const { run, report } = smokeWithJson(["--dist", broken, "--client", "codex"]);
    expect(run.status).toBe(1);
    expect(legOf(report, "codex", "structure").reason).toContain("classes.skill.count");
  });

  it("refuses a container manifest the vendor's own document refuses", () => {
    const broken = join(tempDir("invalid-manifest"), "dist");
    cpSync(dist, broken, { recursive: true });
    const path = join(broken, "copilot", "plugin.json");
    const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    // The Agent Plugins 1.0.0 schema is CLOSED, so a key it does not name is a defect.
    manifest["logo"] = "assets/logo.svg";
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);

    const { run, report } = smokeWithJson(["--dist", broken, "--client", "copilot"]);
    expect(run.status).toBe(1);
    const structure = legOf(report, "copilot", "structure");
    expect(structure.reason).toContain("agent-plugins-1.0.0.schema.json");
    expect(structure.reason).toContain("logo");
  });
});

describe("the smoke's own arguments", () => {
  it("exits 2 with the usage banner when --dist is absent", () => {
    const run = smoke(["--client", "claude"]);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("--dist is required");
    expect(run.stderr).toContain("Usage: node scripts/plugin-route-smoke.mjs");
  });

  it("exits 2 for a --dist that is a directory but not a distribution root", () => {
    const run = smoke(["--dist", tempDir("not-a-distribution"), "--client", "claude"]);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("carries no release.json");
  });

  it("exits 2 for an unknown client and for an unknown argument", () => {
    expect(smoke(["--dist", dist, "--client", "windsurf"]).status).toBe(2);
    expect(smoke(["--dist", dist, "--nope", "x"]).status).toBe(2);
  });
});

describe("the --json document, which is what the harness and the workflow read", () => {
  it("carries the dist, the row-hash inputs under logical labels, and every leg's fields", () => {
    const { report } = smokeWithJson(["--dist", dist, "--client", "claude,codex"]);

    expect(Object.keys(report.clients).toSorted()).toEqual(["claude", "codex"]);
    expect(report.clients["claude"]?.legs.map((leg) => leg.leg)).toEqual([
      "structure",
      "install",
      "discovery",
      "invocation",
    ]);
    for (const leg of report.clients["claude"]?.legs ?? []) {
      expect(Object.keys(leg).toSorted()).toEqual([
        "binaryVersion",
        "command",
        "exitCode",
        "leg",
        "reason",
        "status",
        "transcriptSha256",
      ]);
    }
    // The labels are LOGICAL: an absolute path here would land in a committed evidence file
    // through `scripts/qa/plugin-runs.mjs` (the S-4 finding `scripts/qa/run.mjs` records).
    const labels = Object.keys(report.sha256s).toSorted();
    expect(labels).toContain("scripts/plugin-route-smoke.mjs");
    expect(labels).toContain("dist/claude/stamity-plugin.json");
    expect(labels).toContain("dist/claude/hooks/hooks.json");
    expect(labels).toContain("dist/codex/stamity-plugin.json");
    for (const label of labels) {
      expect(label, label).not.toMatch(/^[/\\]|^[A-Za-z]:[/\\]/);
      expect(report.sha256s[label], label).toMatch(/^[0-9a-f]{64}$/);
    }
    // And they are the bytes they claim to be, re-derivable with `shasum -a 256`.
    const capability = readFileSync(join(dist, "claude", "stamity-plugin.json"));
    expect(report.sha256s["dist/claude/stamity-plugin.json"]).toBe(
      createHash("sha256").update(capability).digest("hex"),
    );
  });
});

// ── the armed legs, one describe per client ───────────────────────────────────

describe.skipIf(process.env["STAMITY_CLAUDE_BIN"] === undefined)("the claude install leg on STAMITY_CLAUDE_BIN", () => {
  it(
    "is accepted by `claude plugin validate --strict`",
    () => {
      const { report } = smokeWithJson(["--dist", dist, "--client", "claude"], process.env);
      const install = legOf(report, "claude", "install");
      expect(install.status, install.reason).toBe("PASS");
      expect(install.command).toContain("claude plugin validate --strict");
      expect(install.exitCode).toBe(0);
      expect(install.binaryVersion).toMatch(/\d+\.\d+\.\d+/);
      // No listing exists without a model call, so discovery waits for the harness lane.
      expect(legOf(report, "claude", "discovery").status).toBe("SKIPPED");
      expect(legOf(report, "claude", "invocation").reason).toBe("needs --invoke");
    },
    ARMED_MS,
  );
});

describe.skipIf(process.env["STAMITY_COPILOT_BIN"] === undefined)("the copilot install leg on STAMITY_COPILOT_BIN", () => {
  it(
    "installs through the marketplace into a scratch COPILOT_HOME and proves what landed",
    () => {
      const { report } = smokeWithJson(["--dist", dist, "--client", "copilot"], process.env);
      const install = legOf(report, "copilot", "install");
      expect(install.status, install.reason).toBe("PASS");
      expect(install.reason).toContain("plugin install stamity@stamity in a scratch COPILOT_HOME");
      // Either shape is a pass, and the reason says WHICH: a copied install is compared file by
      // file, and a local-path marketplace is loaded live with nothing to compare (measured
      // 2026-09-20 on GitHub Copilot CLI 1.0.85).
      expect(install.reason).toMatch(/byte-identical|source "live"/);
      expect(install.reason).toContain("1.9.0");
    },
    ARMED_MS,
  );
});

describe.skipIf(process.env["STAMITY_CODEX_BIN"] === undefined)("the codex install leg on STAMITY_CODEX_BIN", () => {
  it(
    "installs through the marketplace into a scratch CODEX_HOME and caches the root byte for byte",
    () => {
      const { report } = smokeWithJson(["--dist", dist, "--client", "codex"], process.env);
      const install = legOf(report, "codex", "install");
      expect(install.status, install.reason).toBe("PASS");
      expect(install.reason).toContain("plugin list --json names stamity");
      expect(install.reason).toContain("byte-identical");
      expect(install.command).toContain("codex plugin list --json");
      // `plugin list --json` names the plugin, not its skills, so discovery needs a model call.
      expect(legOf(report, "codex", "discovery").status).toBe("SKIPPED");
      expect(legOf(report, "codex", "discovery").reason).toContain("codex exec");
    },
    ARMED_MS,
  );
});

describe.skipIf(process.env["STAMITY_CURSOR_BIN"] === undefined)("the cursor legs on STAMITY_CURSOR_BIN", () => {
  it(
    "records install and discovery as one model call this suite never makes",
    () => {
      // Cursor documents no CLI install command at all (cursor.com/docs/reference/plugins,
      // 2026-09-20), so `--plugin-dir` IS the install route for the headless client — and it reaches
      // the model. A suite that drove it would spend a credential per run; the harness lane does.
      const { report } = smokeWithJson(["--dist", dist, "--client", "cursor"], process.env);
      for (const name of ["install", "discovery", "invocation"]) {
        const leg = legOf(report, "cursor", name);
        expect(leg.status, `${name}: ${leg.reason}`).toBe("SKIPPED");
        expect(leg.reason).toBe("a Cursor run is a model call; pass --invoke");
      }
    },
    ARMED_MS,
  );
});
