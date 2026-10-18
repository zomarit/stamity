/**
 * v5-claude-readiness (REQ-FLOW-110, REQ-CTX-016): Claude Code's cloud readiness
 * hook, run as a real child process in a scratch repository the way the client
 * runs a `SessionStart` hook — a fresh process, the script at the path the Claude
 * adapter writes it, the session's variables under the test's control.
 *
 * Every acting case has a quiet case one fact away (the cloud marker, the
 * environment file, `package.json`, `node_modules`, the lockfile), so a hook that
 * always acted, or never did, fails.
 *
 * `npm` and `npx` are stubs on `PATH`. Stubbed because the real ones fetch from
 * the npm registry, which a unit test cannot reach or must not depend on, and
 * because the order of the hook's steps is only visible from inside the install:
 * the `npm` stub copies the environment file as it reads when `npm ci` starts. The
 * stubs are `sh` scripts, so the cases that run them skip on Windows, where the
 * hook never acts: `CLAUDE_CODE_REMOTE` is `true` only in Claude Code's Linux
 * cloud machine.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import semver from "semver";
import { describe, expect, it } from "vitest";
import {
  buildCloudReadinessScript,
  CLOUD_READINESS_FILE,
  CLOUD_READINESS_TIMEOUT_MS,
  type HookScriptLayout,
} from "../../src/hooks/scripts.ts";
import { HOOK_SESSION_START_TIMEOUT_MS } from "../../src/hooks/model.ts";
import { HOOKS_ACTIVE_ENV } from "../../src/types/markers.ts";
import { useTempDir } from "../support/tempDir.ts";

const getRepo = useTempDir("cloud-readiness");

/** The CLI pin the hook resolves; a literal, so the bytes under test are the same in a renamed fork. */
const CLI = { packageName: "@zomarit/stamity", version: "1.0.0-golden" };

/** The line the hook writes to the environment file, in the form the client's documentation gives. */
const MARKER = `export ${HOOKS_ACTIVE_ENV}=1`;

/** Claude Code's cloud marker as the session VM sets it. */
const CLOUD = { CLAUDE_CODE_REMOTE: "true" };

const POSIX = process.platform !== "win32";

/** The killed-hook case waits out the client's imitated 8 s limit, then reads the file; the default 20 s is close. */
const KILLED_CASE_TIMEOUT_MS = 40_000;

/** The stubs' shared body: one log line per call, the env file as it reads now, then an optional wait and exit. */
const STUB = (name: string): string =>
  [
    "#!/bin/sh",
    `printf '%s\\n' "${name} $*" >> "$STUB_LOG"`,
    `if [ "${name}" = npm ]; then`,
    '  if [ -f "$CLAUDE_ENV_FILE" ]; then cat "$CLAUDE_ENV_FILE" > "$STUB_PROBE"; else : > "$STUB_PROBE"; fi',
    '  if [ -n "$STUB_NPM_SLEEP" ]; then exec sleep "$STUB_NPM_SLEEP"; fi',
    '  exit "${STUB_NPM_EXIT:-0}"',
    "fi",
    'exit "${STUB_NPX_EXIT:-0}"',
    "",
  ].join("\n");

interface Scene {
  hook: string;
  envFile: string;
  log: string;
  probe: string;
  env: Record<string, string>;
}

/**
 * A repository with the hook placed where the adapter writes it, `files` seeded,
 * the two stubs on `PATH` and an environment file holding one earlier line.
 */
async function scene(
  files: Record<string, string> = {},
  opts: { layout?: HookScriptLayout; installTimeoutMs?: number } = {},
): Promise<Scene> {
  const layout = opts.layout ?? "generated";
  await getRepo().seedFiles({
    [`.stamity/generated/hooks/claude/${CLOUD_READINESS_FILE}`]: buildCloudReadinessScript({
      cli: CLI,
      layout,
      ...(opts.installTimeoutMs === undefined ? {} : { installTimeoutMs: opts.installTimeoutMs }),
    }),
    ...files,
  });
  const bin = getRepo().path("stub-bin");
  mkdirSync(bin, { recursive: true });
  for (const name of ["npm", "npx"]) {
    writeFileSync(`${bin}/${name}`, STUB(name));
    chmodSync(`${bin}/${name}`, 0o755);
  }
  const envFile = getRepo().path("session.env");
  writeFileSync(envFile, "export EARLIER=1\n");
  const log = getRepo().path("stub.log");
  const probe = getRepo().path("stub.probe");
  return {
    hook: getRepo().path(".stamity", "generated", "hooks", "claude", CLOUD_READINESS_FILE),
    envFile,
    log,
    probe,
    env: { PATH: `${bin}:/usr/bin:/bin`, CLAUDE_ENV_FILE: envFile, STUB_LOG: log, STUB_PROBE: probe },
  };
}

/** A package.json, a lockfile and no node_modules: the state that runs `npm ci`. */
const INSTALLABLE = {
  "package.json": JSON.stringify({ name: "scratch", version: "1.0.0" }),
  "package-lock.json": JSON.stringify({ name: "scratch", lockfileVersion: 3, packages: {} }),
};

interface Outcome {
  status: number | null;
  stdout: string;
  stderr: string;
  signal: NodeJS.Signals | null;
}

/** Runs the hook as the client does, its working directory the repository, with `env` over a cleared base. */
function run(hook: string, env: Record<string, string>, timeout?: number): Outcome {
  const base: NodeJS.ProcessEnv = { ...process.env };
  for (const name of ["CLAUDE_CODE_REMOTE", "CLAUDE_ENV_FILE", HOOKS_ACTIVE_ENV, "STAMITY_REPO_ROOT"]) delete base[name];
  const result = spawnSync(process.execPath, [hook], {
    cwd: getRepo().dir,
    input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup" }),
    encoding: "utf8",
    env: { ...base, ...env },
    ...(timeout === undefined ? {} : { timeout }),
  });
  return { status: result.status, stdout: String(result.stdout), stderr: String(result.stderr), signal: result.signal };
}

function readOr(path: string, fallback: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : fallback;
}

describe.skipIf(!POSIX)("the readiness hook acts only in Claude Code's cloud (REQ-FLOW-110)", () => {
  it("does nothing on a local startup, and acts once the cloud marker reads `true`", async () => {
    const s = await scene(INSTALLABLE);
    for (const local of [{}, { CLAUDE_CODE_REMOTE: "1" }, { CLAUDE_CODE_REMOTE: "false" }, { CLAUDE_CODE_REMOTE: "" }]) {
      const outcome = run(s.hook, { ...s.env, ...local });
      expect(outcome.status, JSON.stringify(local)).toBe(0);
      expect(outcome.stdout, JSON.stringify(local)).toBe("");
      expect(readFileSync(s.envFile, "utf8")).toBe("export EARLIER=1\n");
      expect(existsSync(s.log), JSON.stringify(local)).toBe(false);
    }
    // One fact away: the marker reading `true` writes the line and runs both steps.
    const cloud = run(s.hook, { ...s.env, ...CLOUD });
    expect(cloud.status).toBe(0);
    expect(readFileSync(s.envFile, "utf8")).toBe(`export EARLIER=1\n${MARKER}\n`);
    expect(readOr(s.log, "")).toBe(`npm ci\nnpx -y ${CLI.packageName}@${CLI.version} help\n`);
  });
});

describe.skipIf(!POSIX)("the hooks' variable comes first (REQ-FLOW-110, REQ-FLOW-112)", () => {
  it("appends the line before any install step, and names each step on stdout", async () => {
    const s = await scene(INSTALLABLE);
    const outcome = run(s.hook, { ...s.env, ...CLOUD });

    expect(outcome.status).toBe(0);
    // The npm stub read the environment file as `npm ci` started: the line was already there.
    expect(readFileSync(s.probe, "utf8")).toContain(MARKER);
    const lines = outcome.stdout.trimEnd().split("\n");
    expect(lines.every((line) => line.startsWith("stamity cloud readiness: "))).toBe(true);
    expect(lines[0]).toContain(`wrote ${HOOKS_ACTIVE_ENV}=1`);
    expect(outcome.stdout).toContain("npm ci finished");
    expect(outcome.stdout).toContain("the pinned CLI resolved");
  });

  it("keeps the line when the client stops the hook during a long install", async () => {
    const s = await scene(INSTALLABLE);
    // The client's own timeout, imitated: the hook is killed while `npm ci` waits.
    const outcome = run(s.hook, { ...s.env, ...CLOUD, STUB_NPM_SLEEP: "30" }, 8_000);

    expect(outcome.status).toBeNull();
    expect(outcome.signal).toBe("SIGTERM");
    expect(readFileSync(s.envFile, "utf8")).toBe(`export EARLIER=1\n${MARKER}\n`);
  }, KILLED_CASE_TIMEOUT_MS);

  it("stops an install past its own limit, says so, keeps the line and still resolves the CLI", async () => {
    const s = await scene(INSTALLABLE, { installTimeoutMs: 500 });
    const outcome = run(s.hook, { ...s.env, ...CLOUD, STUB_NPM_SLEEP: "20" });

    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain("npm ci stopped at its limit");
    expect(outcome.stdout).toContain("node_modules may be partial");
    expect(readFileSync(s.envFile, "utf8")).toBe(`export EARLIER=1\n${MARKER}\n`);
    expect(readOr(s.log, "")).toBe(`npm ci\nnpx -y ${CLI.packageName}@${CLI.version} help\n`);
  });

  it("with no environment file says the pre-flight refuses here, exits 0 and still installs", async () => {
    const s = await scene(INSTALLABLE);
    const env: Record<string, string> = { ...s.env, ...CLOUD };
    delete env["CLAUDE_ENV_FILE"];
    const outcome = run(s.hook, env);

    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain(`CLAUDE_ENV_FILE is not set, so ${HOOKS_ACTIVE_ENV} was not written`);
    expect(readFileSync(s.envFile, "utf8")).toBe("export EARLIER=1\n");
    expect(readOr(s.log, "")).toContain("npm ci");
  });

  it("with an environment file it cannot write says so and exits 0", async () => {
    const s = await scene(INSTALLABLE);
    const outcome = run(s.hook, { ...s.env, ...CLOUD, CLAUDE_ENV_FILE: getRepo().path("no-such-dir", "session.env") });

    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain("the environment file could not be written (ENOENT)");
    expect(readOr(s.log, "")).toContain("npm ci");
  });

  it("writes the line once across a startup and a resume, and ends an unterminated file first", async () => {
    const s = await scene(INSTALLABLE);
    writeFileSync(s.envFile, "export EARLIER=1");
    run(s.hook, { ...s.env, ...CLOUD });
    const resumed = run(s.hook, { ...s.env, ...CLOUD });

    expect(readFileSync(s.envFile, "utf8")).toBe(`export EARLIER=1\n${MARKER}\n`);
    expect(resumed.stdout).toContain("already in the environment file");
  });

  it("reads the repository from its own location in the generated layout, and from the cwd in a plugin root", async () => {
    const s = await scene(INSTALLABLE, { layout: "container" });
    const outcome = run(s.hook, { ...s.env, ...CLOUD });
    expect(outcome.status).toBe(0);
    expect(readOr(s.log, "")).toContain("npm ci");
  });
});

describe.skipIf(!POSIX)("the install (REQ-FLOW-110)", () => {
  it("skips the install with no package.json and says so, and still resolves the CLI", async () => {
    const s = await scene({});
    const outcome = run(s.hook, { ...s.env, ...CLOUD });

    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain("no package.json, so nothing is installed");
    expect(readOr(s.log, "")).toBe(`npx -y ${CLI.packageName}@${CLI.version} help\n`);
    expect(readFileSync(s.envFile, "utf8")).toContain(MARKER);
  });

  it("runs no npm ci where node_modules is there, or no lockfile is", async () => {
    const present = await scene({ ...INSTALLABLE, "node_modules/.keep": "" });
    const kept = run(present.hook, { ...present.env, ...CLOUD });
    expect(kept.stdout).toContain("node_modules is there, so npm ci does not run");
    expect(readOr(present.log, "")).not.toContain("npm ci");
  });

  it("runs no npm ci without a package-lock.json or npm-shrinkwrap.json", async () => {
    const s = await scene({ "package.json": INSTALLABLE["package.json"], "yarn.lock": "" });
    const outcome = run(s.hook, { ...s.env, ...CLOUD });
    expect(outcome.stdout).toContain("no package-lock.json or npm-shrinkwrap.json");
    expect(readOr(s.log, "")).not.toContain("npm ci");
  });

  it("runs npm ci from an npm-shrinkwrap.json too", async () => {
    const s = await scene({ "package.json": INSTALLABLE["package.json"], "npm-shrinkwrap.json": "{}" });
    run(s.hook, { ...s.env, ...CLOUD });
    expect(readOr(s.log, "")).toContain("npm ci");
  });

  it("reports a failed install and a CLI that did not resolve, naming the exit codes, and exits 0", async () => {
    const s = await scene(INSTALLABLE);
    const outcome = run(s.hook, { ...s.env, ...CLOUD, STUB_NPM_EXIT: "1", STUB_NPX_EXIT: "7" });

    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain("npm ci failed (exit 1)");
    expect(outcome.stdout).toContain("needs the npm registry");
    expect(outcome.stdout).toContain("the pinned CLI did not resolve (exit 7)");
  });

  it("reports a package.json that is not JSON, installs nothing, and exits 0", async () => {
    const s = await scene({ ...INSTALLABLE, "package.json": "{ not json" });
    const outcome = run(s.hook, { ...s.env, ...CLOUD });

    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain("package.json could not be read (SyntaxError)");
    expect(readOr(s.log, "")).not.toContain("npm ci");
    expect(readFileSync(s.envFile, "utf8")).toContain(MARKER);
  });
});

describe.skipIf(!POSIX)("node against engines (REQ-FLOW-110)", () => {
  const node = process.versions.node;
  const parsed = semver.parse(node);
  if (parsed === null) throw new Error(`node's own version ${node} does not parse`);
  const { major, minor, patch } = parsed;

  // Each read range is checked against the semver package's answer, so the hook's
  // reading is the registry's, not a second opinion; both answers occur in the table.
  const read: readonly string[] = [
    ">=1.0.0",
    "<1.0.0",
    `>=${major + 1}`,
    `^${major}.0.0`,
    `^${major + 1}.0.0`,
    `~${major}.${minor}`,
    `~${major}.${minor + 1}.0`,
    `${major}.x`,
    `${major}`,
    `>${node}`,
    `>=${node}`,
    `<=${node}`,
    `<${major}.${minor}.${patch}`,
    `=${node}`,
    `>=1 <2 || >=${major}`,
    `>= ${major}.${minor}`,
    "*",
  ];

  it.each(read.map((range) => [range]))("reads %s as semver does", async (range) => {
    const s = await scene({ "package.json": JSON.stringify({ name: "x", engines: { node: range } }), "node_modules/.keep": "" });
    const outcome = run(s.hook, { ...s.env, ...CLOUD });
    const meets = semver.satisfies(node, range);
    expect(outcome.stdout).toContain(meets ? `node ${node} meets engines.node` : `node ${node} is outside engines.node`);
  });

  it.each([["1.2.3 - 2.0.0"], ["latest-q7zk"], [">=22 <"]])(
    "names %s as a range it does not read, and checks nothing",
    async (range) => {
      const s = await scene({ "package.json": JSON.stringify({ name: "x", engines: { node: range } }), "node_modules/.keep": "" });
      const outcome = run(s.hook, { ...s.env, ...CLOUD });
      expect(outcome.stdout).toContain("engines.node is not a range this hook reads");
      // The range itself is repository text and never reaches the session's context.
      expect(outcome.stdout).not.toContain(range);
    },
  );

  it("says so when package.json declares no engines.node", async () => {
    const s = await scene({ "package.json": JSON.stringify({ name: "x" }), "node_modules/.keep": "" });
    const outcome = run(s.hook, { ...s.env, ...CLOUD });
    expect(outcome.stdout).toContain(`declares no engines.node, so node ${node} is not checked`);
  });
});

describe("the script's shape and budget (REQ-CTX-016)", () => {
  it("reads only node builtins, names no URL and evaluates nothing", () => {
    const script = buildCloudReadinessScript({ cli: CLI });
    expect(script).toMatch(/^#!\/usr\/bin\/env node\n/);
    for (const specifier of [...script.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1])) {
      expect(specifier, `${specifier} is not a node builtin`).toMatch(/^node:/);
    }
    for (const token of ["http://", "https://", "curl", "fetch("]) expect(script.toLowerCase()).not.toContain(token);
    expect(script).not.toMatch(/\beval\s*\(|new Function\s*\(|shell:\s*true/);
    // The one network reach it has is stated in its own banner, not hidden under a blanket claim.
    expect(script).toContain("both reach the npm registry");
    expect(script).not.toContain("no network reach");
  });

  it("renders the pinned call a fork names: its channel and its scope's registry", () => {
    const fork = buildCloudReadinessScript({
      cli: { packageName: "@acme/stamity", version: "2.0.0", npmChannel: false },
    });
    expect(fork).toContain('["npx","--no","@acme/stamity@2.0.0","help"]');
  });

  it("keeps its own budget apart from the session start's, with room for both steps inside it", () => {
    expect(CLOUD_READINESS_TIMEOUT_MS).not.toBe(HOOK_SESSION_START_TIMEOUT_MS);
    expect(CLOUD_READINESS_TIMEOUT_MS).toBe(300_000);
    const script = buildCloudReadinessScript({ cli: CLI });
    const install = Number(/const INSTALL_TIMEOUT_MS = (\d+);/.exec(script)?.[1]);
    const cli = Number(/const CLI_TIMEOUT_MS = (\d+);/.exec(script)?.[1]);
    expect(install).toBeGreaterThan(0);
    expect(cli).toBeGreaterThan(0);
    expect(install + cli).toBeLessThan(CLOUD_READINESS_TIMEOUT_MS);
  });

  it("refuses a step limit that is not a positive whole number of milliseconds", () => {
    expect(() => buildCloudReadinessScript({ cli: CLI, installTimeoutMs: 0 })).toThrow(/positive whole number/);
    expect(() => buildCloudReadinessScript({ cli: CLI, cliTimeoutMs: 1.5 })).toThrow(/positive whole number/);
  });
});
