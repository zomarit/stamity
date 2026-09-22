import { spawn, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  clients: Record<string, { legs: Leg[]; cleanup?: string[] }>;
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

      // The two numbers are DERIVED, not typed: the declaration comes from the root's own capability
      // file and the tree count is that number less the one file this case removed. A literal 10 here
      // would be a pin that drifts the next time the corpus gains a touchpoint, and the case would
      // then fail for a reason that has nothing to do with the behaviour it guards.
      const declared = (
        JSON.parse(readFileSync(join(dist, "claude", "stamity-plugin.json"), "utf8")) as {
          classes: Record<string, { count?: number }>;
        }
      ).classes["command"]?.count;
      expect(declared, "the claude root declares no command count").toBeGreaterThan(1);

      const { run, report } = smokeWithJson(["--dist", broken, "--client", "claude"]);
      expect(run.status).toBe(1);
      const structure = legOf(report, "claude", "structure");
      expect(structure.status).toBe("FAIL");
      expect(structure.reason).toContain(`declares command ${String(declared)}`);
      expect(structure.reason).toContain(`commands/ holds ${String((declared ?? 0) - 1)} file(s)`);
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

/**
 * The stop path, driven with a SIGNAL rather than described in a comment.
 *
 * The cleanup and the skip both hang off one claim: that a `SIGTERM` handler can run at all in a
 * process whose work is a chain of blocking spawns. It could not, until `call` began yielding once
 * per client call — so this case sends the signal for real, mid-run, and reads what came out: the
 * run says it is stopping, the legs it had not reached are recorded as stopped rather than measured,
 * and the process dies of the signal it was sent.
 *
 * The client is a FIXTURE binary, not a vendor CLI: a POSIX shell script that sleeps and exits 0, so
 * the run has a call in flight to be interrupted and no credential, model or network is involved.
 * Windows is skipped because no POSIX signal reaches a child there — the same posture
 * `test/qa/hookRuns.test.ts` takes for its own signal case.
 */
describe.skipIf(process.platform === "win32")("a stop requested mid-run", () => {
  /**
   * A `claude` stand-in: slow enough to be interrupted, silent enough to prove nothing else. It
   * touches `marker` the moment it is invoked, which is the readiness signal the case waits for
   * before sending `SIGTERM` — see the comment at the send site for why that ordering is sound.
   */
  function sleepingBinary(seconds: number, marker: string): string {
    const dir = tempDir("fake-client");
    const bin = join(dir, "fake-claude");
    writeFileSync(bin, `#!/bin/sh
touch "${marker}"
sleep ${String(seconds)}
exit 0
`);
    chmodSync(bin, 0o755);
    return bin;
  }

  it(
    "runs the handler between calls, records the legs it never reached, and dies of the signal",
    async () => {
      const stoppedDir = tempDir("stopped");
      const jsonPath = join(stoppedDir, "legs.json");
      const invoked = join(stoppedDir, "invoked");
      const child = spawn(
        process.execPath,
        [SMOKE, "--dist", dist, "--client", "claude", "--invoke", "--bin-claude", sleepingBinary(3, invoked), "--json", jsonPath],
        { cwd: REPO_ROOT, env: disarmed(), stdio: ["ignore", "pipe", "pipe"] },
      );
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });

      // Mid-spawn, deterministically: the signal is sent once the fake client has been invoked for
      // the first time, which is the `--version` probe (`probeVersion`, called from `main` before any
      // leg's `call`). The smoke registers its `SIGTERM`/`SIGINT` handlers in `main` before that probe
      // with no await between them, so a marker written by the binary proves the handlers are in
      // place — a fixed sleep did not, and under a loaded machine the signal landed on a child that
      // had not registered yet and died by default disposition without writing the report. The
      // signal is queued while the 3 s probe blocks, and the handler runs at the first `call`'s
      // yield — after the install leg's spawn — which is the whole case: a handler that only ran
      // after `main` returned would prove nothing.
      const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((settle) => {
        child.on("close", (code, signal) => settle({ code, signal }));
      });
      // The marker appears within milliseconds of the spawn on an idle machine; 20 s is a bound on a
      // loaded worker, a third of the case's budget, not a measurement of anything.
      const deadline = Date.now() + 20_000;
      while (!existsSync(invoked) && Date.now() < deadline) {
        // oxlint-disable-next-line no-await-in-loop -- a poll, by construction.
        await new Promise((resume) => setTimeout(resume, 50));
      }
      if (!existsSync(invoked)) {
        child.kill("SIGKILL");
        throw new Error(`the fake claude binary was never invoked within 20 s; stderr so far: ${stderr}`);
      }
      child.kill("SIGTERM");
      const { code, signal } = await ended;

      expect(stderr).toContain("stopping on SIGTERM");
      // Dead of the signal it was sent, not of a tidy exit code that hides it.
      expect(signal ?? `exit ${String(code)}`).toBe("SIGTERM");

      const report = JSON.parse(readFileSync(jsonPath, "utf8")) as Report;
      const legs = report.clients["claude"]?.legs ?? [];
      // The structure leg spawns nothing and is still measured; the legs after the interrupted call
      // are recorded as stopped rather than as a client that failed.
      expect(legs.find((entry) => entry.leg === "structure")?.status).toBe("PASS");
      const stoppedLegs = legs.filter((entry) => entry.reason.includes("stopped by SIGTERM"));
      expect(stoppedLegs.length, JSON.stringify(legs.map((entry) => [entry.leg, entry.status, entry.reason]))).toBeGreaterThan(0);
      for (const entry of stoppedLegs) expect(entry.status).toBe("SKIPPED");
    },
    60_000,
  );
});

describe("blockerFor — which transcripts mean 'nothing was measured'", () => {
  /**
   * The scope of this classifier is the whole point, and it is easy to get wrong in the generous
   * direction. An invocation leg that finds no manifest reports `SKIPPED` when the CLIENT refused to
   * run what it was asked to run, and `FAIL` otherwise — so a pattern matching a bare
   * `permission denied` would turn the setup command's OWN `EACCES` into a skip, and a skip is what
   * nobody reads again.
   */
  it("reads a client's approval refusal and a usage limit as blockers, in that order", async () => {
    // @ts-expect-error — native ESM contributor tool, outside the product package.
    const { blockerFor } = await import("../../scripts/plugin-route-smoke.mjs");

    expect(blockerFor("Permission denied and could not request permission from user")?.label).toBe(
      "the client refused to run what it was asked to run",
    );
    expect(blockerFor("ERROR: You've hit your usage limit. Visit …")?.label).toBe("the client never reached its model");
    // A model never reached also prints the words a refusal prints; the first pattern wins so the
    // reason names the cause rather than the symptom.
    expect(blockerFor("usage limit reached; could not request permission")?.match).toBe("usage limit");
  });

  it("reads a setup step's own EACCES as no blocker at all, so the leg stays a FAILURE", async () => {
    // @ts-expect-error — native ESM contributor tool, outside the product package.
    const { blockerFor } = await import("../../scripts/plugin-route-smoke.mjs");

    expect(blockerFor("Error: EACCES: permission denied, open '/x/.stamity/manifest.json'")).toBeNull();
    expect(blockerFor("EPERM: operation not permitted, mkdir")).toBeNull();
    expect(blockerFor("plugin setup wrote 12 files")).toBeNull();
  });
});

/**
 * A hand-built call, the shape `call()` returns, for the helpers exported to be driven without a
 * client: only the fields the helper under test reads are meaningful.
 */
function madeCall(overrides: Partial<Record<"status" | "transcript" | "redacted" | "tail" | "exit", unknown>> = {}) {
  const transcript = String(overrides.transcript ?? "");
  return {
    name: "x",
    command: "copilot x",
    status: 0,
    signal: null,
    exit: "exit 0",
    transcript,
    redacted: transcript,
    firstLine: transcript.split("\n")[0] ?? "",
    tail: transcript.slice(-400),
    transcriptSha256: "0".repeat(64),
    durationMs: 1,
    spawnFailure: null,
    ...overrides,
  };
}

describe("copilotInstallLeg — the live entry passes on enabled, not on version alone", () => {
  // prove/210. `plugin list --json` on 1.0.87 (measured 2026-09-22 in a scratch COPILOT_HOME) prints
  // `{name, marketplace, version, enabled, source, installedFrom}` per plugin. The leg used to pass a
  // live entry on version equality; an entry the client lists and will not load proves nothing, and a
  // disabled one cannot be produced from a real install on demand — so the listing is composed here.
  const context = { redact: (text: string) => text, pluginVersion: "1.9.0", version: "fake 0.0.1", rootDigest: {} };
  const names = { marketplace: "stamity", plugin: "stamity", spec: "stamity@stamity" };
  const listing = (entry: Record<string, unknown>) =>
    madeCall({ transcript: JSON.stringify([{ name: "stamity", marketplace: "stamity", version: "1.9.0", source: "live", ...entry }]) });

  it("fails a disabled entry at the right version, and names the entry as disabled", async () => {
    // @ts-expect-error — native ESM contributor tool, outside the product package.
    const { copilotInstallLeg } = await import("../../scripts/plugin-route-smoke.mjs");
    const leg = copilotInstallLeg(context, {
      names,
      copilotHome: tempDir("copilot-home"),
      installed: madeCall({ transcript: "loaded live" }),
      listed: listing({ enabled: false }),
    }) as Leg;
    expect(leg.status).toBe("FAIL");
    expect(leg.reason).toContain("DISABLED (enabled: false)");
    expect(leg.reason).toContain("will not load it");
    // An entry with no `enabled` field at all is not an enabled one either.
    const absent = copilotInstallLeg(context, {
      names,
      copilotHome: tempDir("copilot-home"),
      installed: madeCall({ transcript: "loaded live" }),
      listed: listing({}),
    }) as Leg;
    expect(absent.status).toBe("FAIL");
    expect(absent.reason).toContain("DISABLED (enabled: null)");
  });

  it("passes an enabled live entry, and the reason says enabled", async () => {
    // @ts-expect-error — native ESM contributor tool, outside the product package.
    const { copilotInstallLeg } = await import("../../scripts/plugin-route-smoke.mjs");
    const leg = copilotInstallLeg(context, {
      names,
      copilotHome: tempDir("copilot-home"),
      installed: madeCall({ transcript: "loaded live" }),
      listed: listing({ enabled: true }),
    }) as Leg;
    expect(leg.status, leg.reason).toBe("PASS");
    expect(leg.reason).toContain('the entry is enabled at version 1.9.0 with source "live"');
  });
});

describe("discoveryFromTranscript — a listing that never reached its model is SKIPPED, not FAIL", () => {
  // prove/211. The invocation leg consulted the blocker list and read a usage limit as SKIPPED; the
  // discovery leg read the same transcript, found no marker in it, and called the root's discovery a
  // FAIL — on a zero exit, because a client can print its usage limit and exit 0.
  const context = {
    client: "copilot",
    version: "fake 0.0.1",
    markers: [{ class: "command", id: "st-work", form: "/st-work" }],
  };

  it("reads a zero-exit usage limit as the invocation leg does: SKIPPED with the blocker's reason", async () => {
    // @ts-expect-error — native ESM contributor tool, outside the product package.
    const { discoveryFromTranscript } = await import("../../scripts/plugin-route-smoke.mjs");
    const leg = discoveryFromTranscript(
      context,
      madeCall({ status: 0, transcript: "ERROR: You've hit your usage limit. Visit …" }),
      "a listing run",
    ) as Leg;
    expect(leg.status).toBe("SKIPPED");
    expect(leg.reason).toContain("the client never reached its model (usage limit)");
    expect(leg.reason).toContain("nothing about this root was listed");
  });

  it("still fails a zero-exit listing that reached the model and named no marker", async () => {
    // The control: without a blocker in it, an answer with no id in it is the root's discovery
    // failing, which is the leg's whole subject.
    // @ts-expect-error — native ESM contributor tool, outside the product package.
    const { discoveryFromTranscript } = await import("../../scripts/plugin-route-smoke.mjs");
    const leg = discoveryFromTranscript(
      context,
      madeCall({ status: 0, transcript: "This plugin provides nothing I can see." }),
      "a listing run",
    ) as Leg;
    expect(leg.status).toBe("FAIL");
    expect(leg.reason).toContain("st-work never appeared");
  });
});

describe("removalOutcome — the evidence says removed only when the removal exited 0", () => {
  // prove/221, the pure half: the sentence a leg reason carries after the `finally` ran.
  it("names a failed removal's command and exit, and says the home may still carry the plugin", async () => {
    // @ts-expect-error — native ESM contributor tool, outside the product package.
    const { removalOutcome } = await import("../../scripts/plugin-route-smoke.mjs");
    const failed = removalOutcome([
      { line: "copilot plugin uninstall stamity exit 1", ok: false },
      { line: "copilot plugin marketplace remove stamity exit 0", ok: true },
    ]) as { ok: boolean; summary: string; lines: string[] };
    expect(failed.ok).toBe(false);
    expect(failed.summary).toContain("NOT removed afterwards — copilot plugin uninstall stamity exit 1");
    expect(failed.summary).toContain("may still carry it");
    expect(failed.lines).toHaveLength(2);

    const clean = removalOutcome([{ line: "copilot plugin uninstall stamity exit 0", ok: true }]) as { ok: boolean; summary: string };
    expect(clean.ok).toBe(true);
    expect(clean.summary).toBe("removed afterwards (copilot plugin uninstall stamity exit 0)");
    expect((removalOutcome([]) as { summary: string }).summary).toBe("nothing to remove");
  });
});

/**
 * prove/221, the wiring half: the copilot `--invoke` legs driven end to end against a FAKE client,
 * so the reason composed inside the `try` is proven to carry the outcome the `finally` produced.
 *
 * The fake is a POSIX shell script that answers every subcommand the leg issues — version probe,
 * marketplace add, install, `plugin list --json`, `skill list`, `plugin --help`, the two `-p` runs
 * (a listing that names the markers, a setup run that writes the manifest) and the two removals —
 * keyed on `COPILOT_HOME` so the scratch install and the "real home" legs keep separate state. The
 * uninstall's exit code is the one input, through a `STAMITY_`-prefixed variable because that prefix
 * is what the smoke's allowlisted environment passes through. No vendor binary, credential or
 * network is involved; Windows is skipped for the reason the stop case above states.
 */
describe.skipIf(process.platform === "win32")("the copilot invoke legs against a fake client, with the removal's outcome", () => {
  function fakeCopilot(): string {
    const dir = tempDir("fake-copilot");
    const bin = join(dir, "fake-copilot");
    writeFileSync(
      bin,
      `#!/bin/sh
STATE="\${COPILOT_HOME:-$STAMITY_FAKE_COPILOT_STATE/real}"
mkdir -p "$STATE"
case "$1" in
  --version) echo "fake copilot 0.0.1"; exit 0 ;;
  plugin)
    case "$2" in
      marketplace)
        case "$3" in
          add) touch "$STATE/added"; echo "loaded live from $4"; exit 0 ;;
          list) [ -e "$STATE/added" ] && echo "stamity"; exit 0 ;;
          remove) rm -f "$STATE/added"; exit 0 ;;
        esac ;;
      install) touch "$STATE/installed"; echo "It is loaded live"; exit 0 ;;
      uninstall) exit "\${STAMITY_FAKE_COPILOT_UNINSTALL_EXIT:-0}" ;;
      list)
        if [ -e "$STATE/installed" ]; then
          echo '[{"name":"stamity","marketplace":"stamity","version":"1.9.0","enabled":true,"source":"live","installedFrom":"x"}]'
        else
          echo '[]'
        fi
        exit 0 ;;
      --help) echo "uninstall marketplace"; exit 0 ;;
    esac ;;
  skill) echo "st-work"; exit 0 ;;
  -p)
    case "$2" in
      List*) printf '/st-work\\n/agent stamity-reviewer\\n'; exit 0 ;;
      *) mkdir -p .stamity; printf '{"plugin":{"mode":"plugin-backed","clients":{"copilot":{}}}}\\n' > .stamity/manifest.json; echo "ran st-setup"; exit 0 ;;
    esac ;;
esac
echo "fake copilot: unexpected $*" >&2
exit 1
`,
    );
    chmodSync(bin, 0o755);
    return bin;
  }

  function invokeCopilot(uninstallExit: string): { run: SpawnSyncReturns<string>; report: Report } {
    const env: NodeJS.ProcessEnv = { ...disarmed(), STAMITY_FAKE_COPILOT_STATE: tempDir("fake-state"), STAMITY_FAKE_COPILOT_UNINSTALL_EXIT: uninstallExit };
    // The "real home" legs inherit the smoke's whole environment; a developer's own COPILOT_HOME
    // would send the fake's state there.
    delete env["COPILOT_HOME"];
    return smokeWithJson(["--dist", dist, "--client", "copilot", "--invoke", "--bin-copilot", fakeCopilot(), "--scratch", tempDir("scratch")], env);
  }

  it(
    "carries a failed removal into the invocation reason and the JSON, and never says removed",
    () => {
      const { run, report } = invokeCopilot("1");
      expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
      const invocation = legOf(report, "copilot", "invocation");
      // The setup landed, so the leg is a PASS about the root — and it says the home is not clean.
      expect(invocation.status, invocation.reason).toBe("PASS");
      expect(invocation.reason).toContain("NOT removed afterwards — copilot plugin uninstall stamity exit 1");
      expect(invocation.reason).not.toContain("the plugin removed afterwards");
      expect(legOf(report, "copilot", "discovery").reason).toContain("NOT removed afterwards");
      expect(report.clients["copilot"]?.cleanup).toEqual([
        "copilot plugin uninstall stamity exit 1",
        "copilot plugin marketplace remove stamity exit 0",
      ]);
      expect(run.stderr).toContain("plugin-route: copilot cleanup - NOT removed afterwards");
    },
    ARMED_MS,
  );

  it(
    "says removed afterwards, with both removal lines, only once both exited 0",
    () => {
      const { report } = invokeCopilot("0");
      const invocation = legOf(report, "copilot", "invocation");
      expect(invocation.status, invocation.reason).toBe("PASS");
      expect(invocation.reason).toContain(
        "removed afterwards (copilot plugin uninstall stamity exit 0; copilot plugin marketplace remove stamity exit 0)",
      );
      expect(report.clients["copilot"]?.cleanup).toHaveLength(2);
      // A client that ran no real-home guard carries no cleanup field at all.
      const { report: disarmedReport } = smokeWithJson(["--dist", dist, "--client", "claude"]);
      expect(disarmedReport.clients["claude"]?.cleanup).toBeUndefined();
    },
    ARMED_MS,
  );
});

/**
 * prove/260: the Cursor install leg is a model call (`agent --trust --plugin-dir`), and an account
 * limit read as `install FAIL` while the invocation leg beside it read SKIPPED for the same words.
 * A fake `agent` that prints the client's own limit text and exits 1 drives the leg with no
 * credential; Windows is skipped for the reason the stop case states.
 */
describe.skipIf(process.platform === "win32")("the cursor install leg against a fake client that hit its usage limit", () => {
  it(
    "reads the limit as SKIPPED with the blocker's reason, on install and invocation alike",
    () => {
      const dir = tempDir("fake-agent");
      const bin = join(dir, "fake-agent");
      writeFileSync(bin, `#!/bin/sh
case "$1" in
  --version) echo "fake agent 0.0.1"; exit 0 ;;
esac
echo "ActionRequiredError: You've hit your usage limit. Visit …" >&2
exit 1
`);
      chmodSync(bin, 0o755);
      const { run, report } = smokeWithJson(
        ["--dist", dist, "--client", "cursor", "--invoke", "--bin-cursor", bin, "--scratch", tempDir("scratch")],
        disarmed(),
      );
      expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
      const install = legOf(report, "cursor", "install");
      expect(install.status, install.reason).toBe("SKIPPED");
      expect(install.reason).toContain("the client never reached its model (usage limit)");
      expect(legOf(report, "cursor", "invocation").status).toBe("SKIPPED");
    },
    ARMED_MS,
  );
});

describe("the codex invocation leg's sandbox grant", () => {
  // prove/274: `codex exec`'s default sandbox is read-only and the setup writes, so the leg
  // refused with "EPERM: operation not permitted, mkdir '<repo>/.stamity'". `codex exec --help`
  // on 0.154.0 documents `--sandbox <read-only|workspace-write|danger-full-access>`;
  // `workspace-write` is the narrowest grant that lets the working directory be written. The
  // leg is a real-home model call this suite never makes, so the argv is pinned as the module
  // states it and the source is read for the two places it must appear: the exec argv and the
  // reason the evidence carries.
  it("grants workspace-write plus the repository's own .codex/ to the setup session, and says so", async () => {
    // Measured 2026-09-22 on 0.154.0: `workspace-write` lets the model create `.stamity/` and
    // refuses `mkdir .codex` — the client protects the repository's own `.codex/`, where this
    // client's setup lands — and `--add-dir <repo>/.codex` lifts that one directory, existing or
    // not. So the grant is a function of the repository.
    // @ts-expect-error — native ESM contributor tool, outside the product package.
    const { codexSandbox } = await import("../../scripts/plugin-route-smoke.mjs");
    expect(codexSandbox("/scratch/repo")).toEqual(["--sandbox", "workspace-write", "--add-dir", join("/scratch/repo", ".codex")]);
    const source = readFileSync(SMOKE, "utf8");
    const codexLeg = source.slice(source.indexOf("async function codexLegs("), source.indexOf("async function operatorAlreadyHas("));
    expect(codexLeg).toContain("...codexSandbox(realCwd),");
    expect(codexLeg).toContain("because the default read-only sandbox refuses the write");
    expect(codexLeg).toContain("workspace-write alone refuses the repository's own .codex/");
    // Never the widest grant, and never the flag that drops the sandbox altogether — read off the
    // EXECUTED lines (the leg's own comment quotes the help's three modes by name).
    const executed = codexLeg.split("\n").filter((line) => !line.trimStart().startsWith("//")).join("\n");
    expect(executed).not.toContain("danger-full-access");
    expect(executed).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(codexSandbox("/scratch/repo")).not.toContain("danger-full-access");
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

describe("the --json document — written by the nightly drive and kept as its artifact; read by the QA harness's plugins lane and this suite, never by the CI job, which reads the exit code", () => {
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
