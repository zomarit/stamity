import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — import-safe native ESM CI helper with no type declarations, outside the product package.
import { PROFILE_VARIABLE, PROFILES } from "../../scripts/ci/cloud-leg.mjs";
import { makeCliFixture, type CliFixture } from "../support/cliHarness.ts";
import { emittedHooks, hookEnv, IDENTITY, runHook, sessionStarts, type HookCommand } from "../support/cloudRemote.ts";
import { ensureDistBuilt } from "../support/distBuild.ts";

/**
 * REQ-PROVE-039: the container leg's cloud profiles, each asserted through the session start's printed cloud line.
 * `scripts/ci/cloud-leg.mjs` runs `test/cloud/` in `node:24-bookworm` once per profile — Claude Code's cloud (an empty
 * `HOME`, `CLAUDE_CODE_REMOTE=true`), Cursor's (a socket stub and its variable), Copilot's (`HOME=/root`, `/workspace`
 * as the working folder, `GITHUB_TOKEN` unset) — and once more with no network, naming the profile in
 * `STAMITY_CLOUD_PROFILE`.
 *
 * Two halves. Every run, on every platform, starts each client's session start under each profile's variables and
 * reads the cloud line it prints. Inside the leg, the run's own environment is the profile: its shape is checked
 * (the folders, the socket, the network), and the session start, handed that environment whole, names the cloud.
 * Off the leg those cases skip, saying why.
 */

interface Profile {
  readonly id: string;
  readonly env: Readonly<Record<string, string>>;
  readonly home: string;
  readonly workdir: string | null;
  readonly unset: readonly string[];
  readonly socket: boolean;
  readonly network: "default" | "none";
}

const LEG_PROFILES = PROFILES as readonly Profile[];

/** What the session start names for each profile's marker. */
const SESSION_NAME: Readonly<Record<string, string>> = {
  claude: "a Claude Code cloud session",
  cursor: "a self-hosted Cursor worker",
  copilot: "a Copilot cloud agent session",
  offline: "a Claude Code cloud session",
};

/** The profile this run is under, inside the leg; `undefined` everywhere else. */
const ACTIVE_ID = process.env[PROFILE_VARIABLE as string];
const ACTIVE = LEG_PROFILES.find((profile) => profile.id === ACTIVE_ID);
const OFF_LEG = `runs only in the container leg, where node scripts/ci/cloud-leg.mjs sets ${PROFILE_VARIABLE as string} per profile`;

/** The client folders a cloud machine's `HOME` holds none of: no account, no config. */
const CLIENT_FOLDERS = [".claude", ".cursor", ".copilot", ".codex", ".config/gh"] as const;

/**
 * The bound a hook with no declared timeout is held to here: the shortest a row declares (30 s, the session-start
 * rows), this test's own figure rather than a client's default.
 */
const UNDECLARED_TIMEOUT_SECONDS = 30;

/**
 * The bound of a case that starts many hooks. Run one after another, the 32 starts of the first case took 11-14 s in
 * single runs of the leg's container, and passed the suite's default of 20 s with three of those containers on one
 * host (2026-10-18); they now run a profile at a time in parallel, under this bound of their own.
 */
const HOOK_CASE_TIMEOUT_MS = 120_000;

const execFileAsync = promisify(execFile);

let fixture: CliFixture;
let root: string;
let starts: HookCommand[];
let hooks: HookCommand[];
const scratch = mkdtempSync(join(tmpdir(), "cloud-profiles-"));

/** A fresh empty folder, as a cloud machine's `HOME`. */
function emptyHome(): string {
  return mkdtempSync(join(scratch, "home-"));
}

/** The variables one profile gives a session start off the leg: its marker, its `HOME`, its unset names. */
function profileVars(profile: Profile): Record<string, string | undefined> {
  const home = profile.home === "empty" ? emptyHome() : profile.home;
  const vars: Record<string, string | undefined> = { ...profile.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: root, STAMITY_NO_CLIENT_PROBE: "1" };
  for (const name of profile.unset) vars[name] = undefined;
  return vars;
}

/** A harmless call for every hook: a start, and a read-only shell command in each client's own shape. */
function harmlessPayload(row: HookCommand, cwd: string): Record<string, unknown> {
  const base = { hook_event_name: row.event, session_id: "cloud-profiles", cwd, source: "startup" };
  if (row.client === "copilot") return { ...base, toolName: "bash", toolArgs: JSON.stringify({ command: "git status" }) };
  if (row.client === "cursor") return { ...base, command: "git status", tool_name: "Shell", tool_input: { command: "git status" } };
  return { ...base, tool_name: "Bash", tool_input: { command: "git status" } };
}

/** Whether a TCP connection to a public address opens within `ms`; `false` on any error or the timeout. */
function reachesNetwork(ms: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = connect({ host: "1.1.1.1", port: 443 });
    const done = (open: boolean): void => {
      clearTimeout(timer);
      socket.destroy();
      resolvePromise(open);
    };
    const timer = setTimeout(() => done(false), ms);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

beforeAll(async () => {
  await ensureDistBuilt();
  fixture = await makeCliFixture({ git: true, entry: "dist" });
  root = fixture.repoDir;
  const init = await fixture.run(["init", "--tools", "claude,cursor,copilot,codex", "-y"]);
  expect(init.code, init.stderr).toBe(0);
  const gitEnv = hookEnv({ HOME: fixture.home.home, GIT_CONFIG_NOSYSTEM: "1", ...IDENTITY });
  await execFileAsync("git", ["add", "-A"], { cwd: root, env: gitEnv, windowsHide: true });
  await execFileAsync("git", ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "stamity init"], { cwd: root, env: gitEnv, windowsHide: true });
  mkdirSync(join(root, "sub"), { recursive: true });
  starts = sessionStarts(root);
  hooks = emittedHooks(root);
}, 300_000);

afterAll(async () => {
  await fixture?.cleanup();
  rmSync(scratch, { recursive: true, force: true });
});

describe("the container leg's cloud profiles (REQ-PROVE-039)", () => {
  it("runs Claude Code's, Cursor's and Copilot's clouds and an offline run, each with a cloud line to assert", () => {
    expect(LEG_PROFILES.map((profile) => profile.id)).toEqual(["claude", "cursor", "copilot", "offline"]);
    expect(LEG_PROFILES.filter((profile) => profile.network === "none").map((profile) => profile.id)).toEqual(["offline"]);
    for (const profile of LEG_PROFILES) expect(SESSION_NAME[profile.id], profile.id).toBeDefined();
    // Every client's start is read; Claude Code's POSIX command is left to the POSIX legs on Windows.
    expect(new Set(starts.map((row) => row.client)).size).toBe(process.platform === "win32" ? 3 : 4);
  });

  it(
    "names each profile's cloud at the start on every client, from the root and below it",
    async () => {
      for (const profile of LEG_PROFILES) {
        const runs = starts.flatMap((row) =>
          ["", "sub"].map(async (folder) => {
            const cwd = join(root, folder);
            return { row, folder, result: await runHook(row.command, cwd, hookEnv(profileVars(profile)), harmlessPayload(row, cwd)) };
          }),
        );
        // oxlint-disable-next-line no-await-in-loop -- one profile's starts at a time keeps the machine's load bounded
        for (const { row, folder, result } of await Promise.all(runs)) {
          const label = `${profile.id} ${row.client} from ${folder || "the root"}`;
          expect(result.code, `${label}: ${result.stderr}`).toBe(0);
          expect(result.stdout, label).toContain(`Session: ${SESSION_NAME[profile.id] ?? "?"}.`);
          expect(result.stdout, label).not.toContain("Also detected");
        }
      }
    },
    HOOK_CASE_TIMEOUT_MS,
  );

  it(
    "names the cloud first and the CI run as also detected when CI=true is set beside the marker",
    async () => {
      for (const profile of LEG_PROFILES) {
        const runs = starts.map(async (row) => ({
          row,
          result: await runHook(row.command, root, hookEnv({ ...profileVars(profile), CI: "true" }), harmlessPayload(row, root)),
        }));
        // oxlint-disable-next-line no-await-in-loop -- one profile's starts at a time keeps the machine's load bounded
        for (const { row, result } of await Promise.all(runs)) {
          const label = `${profile.id} ${row.client} with CI=true`;
          expect(result.code, `${label}: ${result.stderr}`).toBe(0);
          expect(result.stdout, label).toContain(`Session: ${SESSION_NAME[profile.id] ?? "?"}.`);
          expect(result.stdout, label).toContain("Also detected: a CI run.");
        }
      }
    },
    HOOK_CASE_TIMEOUT_MS,
  );

  it("names no cloud with no marker, so each line above comes from its profile", async () => {
    const runs = starts.map(async (row) => {
      const home = emptyHome();
      return { row, result: await runHook(row.command, root, hookEnv({ HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: root }), harmlessPayload(row, root)) };
    });
    for (const { row, result } of await Promise.all(runs)) {
      expect(result.code, `${row.client}: ${result.stderr}`).toBe(0);
      expect(result.stdout, row.client).not.toContain("Session:");
    }
  });

  it(`exits 0 from every emitted hook within its declared timeout under this run's environment, offline in the leg's no-network run`, { timeout: HOOK_CASE_TIMEOUT_MS }, async () => {
    expect(hooks.length).toBeGreaterThan(starts.length);
    const vars = ACTIVE === undefined ? { HOME: emptyHome() } : { ...process.env };
    const runs = hooks.map(async (row) => {
      const bound = (row.timeoutSeconds ?? UNDECLARED_TIMEOUT_SECONDS) * 1000;
      return { row, bound, result: await runHook(row.command, root, hookEnv({ ...vars, CLAUDE_PROJECT_DIR: root }), harmlessPayload(row, root), bound) };
    });
    for (const { row, bound, result } of await Promise.all(runs)) {
      const label = `${row.client} ${row.event} ${row.script} (profile ${ACTIVE?.id ?? "none"})`;
      expect(result.code, `${label}: ${result.stderr}`).toBe(0);
      expect(result.ms, label).toBeLessThan(bound);
    }
  });

  describe("inside the leg: this run's own environment is the profile", () => {
    it.skipIf(ACTIVE === undefined)(`is a profile the leg names (${OFF_LEG})`, () => {
      expect(LEG_PROFILES.map((profile) => profile.id)).toContain(ACTIVE_ID);
    });

    it.skipIf(ACTIVE === undefined)(`has the profile's HOME, working folder, marker and unset variables (${OFF_LEG})`, () => {
      const profile = ACTIVE as Profile;
      const home = process.env["HOME"] ?? "";
      // An empty profile's HOME is the folder `mktemp -d` made before the suite started.
      if (profile.home === "empty") expect(home.startsWith("/tmp/"), home).toBe(true);
      else expect(home).toBe(profile.home);
      for (const folder of CLIENT_FOLDERS) expect(existsSync(join(home, folder)), `${home}/${folder}`).toBe(false);
      if (profile.workdir !== null) expect(process.cwd().startsWith(profile.workdir), process.cwd()).toBe(true);
      for (const [key, value] of Object.entries(profile.env)) expect(process.env[key], key).toBe(value);
      for (const name of profile.unset) expect(process.env[name], name).toBeUndefined();
      // The built tree is mounted read-only, and the run works on a copy.
      expect(existsSync("/src/dist/cli.js")).toBe(true);
      expect(process.cwd().startsWith("/src")).toBe(false);
      if (profile.socket) expect(statSync(profile.env["CURSOR_AGENT_SOCKET"] ?? "").isSocket()).toBe(true);
      expect(existsSync("/var/run/docker.sock")).toBe(false);
    });

    it.skipIf(ACTIVE?.network !== "none")(
      "reaches no network in the no-network run (skipped in every other run: only that run is cut off)",
      async () => {
        expect(await reachesNetwork(5000)).toBe(false);
      },
    );

    it.skipIf(ACTIVE === undefined)(`names the profile's cloud at the start on every client, handed this environment whole (${OFF_LEG})`, async () => {
      const profile = ACTIVE as Profile;
      const runs = starts.map(async (row) => ({
        row,
        result: await runHook(row.command, root, hookEnv({ ...process.env, CLAUDE_PROJECT_DIR: root }), harmlessPayload(row, root)),
      }));
      for (const { row, result } of await Promise.all(runs)) {
        expect(result.code, `${row.client}: ${result.stderr}`).toBe(0);
        expect(result.stdout, row.client).toContain(`Session: ${SESSION_NAME[profile.id] ?? "?"}.`);
      }
    });
  });
});
