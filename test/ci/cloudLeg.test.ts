import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — import-safe native ESM CI helper with no type declarations, outside the product package.
import { dockerArgs, IMAGE, innerScript, legCommands, parseArgs, PROFILE_VARIABLE, PROFILES, runLeg, SOURCE_MOUNT } from "../../scripts/ci/cloud-leg.mjs";

/**
 * The cloud container leg's script, `scripts/ci/cloud-leg.mjs` (REQ-PROVE-037, REQ-PROVE-039). It runs repository
 * code in a container, so what it hands Docker is the boundary: the image by digest, the built tree read-only, no
 * Docker socket, no host environment, and the network cut in the offline run. The profiles' effect inside the
 * container is test/cloud/profiles.test.ts's; this file reads the commands, and drives the leg with a recorded
 * runner, since Docker is neither on the `check` legs nor needed to read what the leg would start.
 */

interface Profile {
  readonly id: string;
  readonly env: Readonly<Record<string, string>>;
  readonly home: string;
  readonly workdir: string | null;
  readonly unset: readonly string[];
  readonly socket: boolean;
  readonly network: string;
}

interface Command {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
}

const LEG_PROFILES = PROFILES as readonly Profile[];
const SCRIPT = fileURLToPath(new URL("../../scripts/ci/cloud-leg.mjs", import.meta.url));
const SOURCE = "/build/stamity";

const profile = (id: string): Profile => {
  const found = LEG_PROFILES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no profile ${id}`);
  return found;
};
const argsOf = (id: string): string[] => dockerArgs(profile(id), SOURCE) as string[];

/** The value after `flag` at each place it appears. */
function valuesOf(args: readonly string[], flag: string): string[] {
  return args.flatMap((arg, index) => (arg === flag ? [args[index + 1] ?? ""] : []));
}

describe("the cloud leg's commands", () => {
  it("pins the full node:24-bookworm image by digest", () => {
    expect(IMAGE).toMatch(/^node:24-bookworm@sha256:[0-9a-f]{64}$/);
  });

  it("runs Claude Code's, Cursor's and Copilot's profiles, then the offline run, the only one with no network", () => {
    expect(LEG_PROFILES.map((entry) => entry.id)).toEqual(["claude", "cursor", "copilot", "offline"]);
    for (const entry of LEG_PROFILES) {
      expect(valuesOf(argsOf(entry.id), "--network"), entry.id).toEqual(entry.id === "offline" ? ["none"] : []);
    }
  });

  it("gives each profile its marker and HOME shape, and Copilot's /workspace with GITHUB_TOKEN unset", () => {
    expect(profile("claude")).toMatchObject({ env: { CLAUDE_CODE_REMOTE: "true" }, home: "empty", workdir: null });
    expect(profile("cursor")).toMatchObject({ env: { CURSOR_AGENT_SOCKET: "/tmp/cursor-agent.sock" }, home: "empty", socket: true });
    expect(profile("copilot")).toMatchObject({ home: "/root", workdir: "/workspace", unset: ["GITHUB_TOKEN"] });
    expect(Object.keys(profile("copilot").env)).toEqual(["COPILOT_AGENT_PROMPT"]);
    expect(profile("offline")).toMatchObject({ env: { CLAUDE_CODE_REMOTE: "true" }, home: "empty", network: "none" });
    expect(valuesOf(argsOf("copilot"), "--workdir")).toEqual(["/workspace"]);
    expect(innerScript(profile("copilot"))).toContain("\nHOME=/root\n");
    expect(innerScript(profile("copilot"))).toContain("\nunset GITHUB_TOKEN\n");
    expect(innerScript(profile("claude"))).toContain('\nHOME="$(mktemp -d)"\n');
    expect(innerScript(profile("cursor"))).toContain('while [ ! -S "$CURSOR_AGENT_SOCKET" ]');
    expect(innerScript(profile("claude"))).not.toContain("CURSOR_AGENT_SOCKET");
  });

  it("passes only the profile's variables, the profile's name and the no-probe pair, never the host's environment", () => {
    for (const entry of LEG_PROFILES) {
      const args = argsOf(entry.id);
      const env = valuesOf(args, "--env");
      expect(env, entry.id).toEqual([
        `${PROFILE_VARIABLE as string}=${entry.id}`,
        "STAMITY_NO_CLIENT_PROBE=1",
        "STAMITY_NO_UPDATE_CHECK=1",
        ...Object.entries(entry.env).map(([key, value]) => `${key}=${value}`),
      ]);
      // A bare `--env NAME` or `-e` copies the host's value in; `--env-file` brings a file of them.
      expect(env.every((pair) => pair.includes("=")), entry.id).toBe(true);
      expect(args.some((arg) => arg === "-e" || arg.startsWith("--env-file")), entry.id).toBe(false);
      expect(JSON.stringify(args), entry.id).not.toMatch(/secrets\.|ANTHROPIC|API_KEY|GH_TOKEN/);
    }
  });

  it("mounts the built tree read-only as its only mount, with no Docker socket and no privilege", () => {
    for (const entry of LEG_PROFILES) {
      const args = argsOf(entry.id);
      expect(valuesOf(args, "--mount"), entry.id).toEqual([`type=bind,source=${SOURCE},target=${SOURCE_MOUNT as string},readonly`]);
      expect(args.some((arg) => arg === "-v" || arg.startsWith("--volume")), entry.id).toBe(false);
      expect(JSON.stringify(args), entry.id).not.toContain("docker.sock");
      expect(args.some((arg) => arg === "--privileged" || arg.startsWith("--cap-add")), entry.id).toBe(false);
      expect(valuesOf(args, "--security-opt"), entry.id).toEqual(["no-new-privileges"]);
      expect(args.slice(0, 3), entry.id).toEqual(["run", "--rm", "--init"]);
      // The image, then `-c` and the script for the `/bin/sh` entrypoint.
      expect(args.slice(-3, -1), entry.id).toEqual([IMAGE, "-c"]);
      expect(valuesOf(args, "--entrypoint"), entry.id).toEqual(["/bin/sh"]);
    }
  });

  it("copies the mounted tree to a writable folder, links node_modules, and runs the cloud suite with no install", () => {
    for (const entry of LEG_PROFILES) {
      const script = innerScript(entry);
      const lines = script.split("\n");
      expect(lines[0], entry.id).toBe("set -eu");
      expect(script, entry.id).toContain(`tar -C ${SOURCE_MOUNT as string} --exclude=./node_modules -cf - . | tar -C "$WORK" -xf -`);
      expect(script, entry.id).toContain('ln -s "$entry" "$WORK/node_modules/"');
      expect(lines.at(-1), entry.id).toBe("exec node node_modules/vitest/vitest.mjs run test/cloud");
      // No install and no registry: the offline run has neither.
      expect(script, entry.id).not.toMatch(/\bnpm\b|\bnpx\b/);
      expect(lines.indexOf('cd "$WORK"'), entry.id).toBeGreaterThan(-1);
    }
  });

  it("builds on the host, pulls the image, then runs every profile, in that order", () => {
    const commands = legCommands(SOURCE) as Command[];
    expect(commands.map((entry) => `${entry.command} ${entry.args.slice(0, 2).join(" ")}`)).toEqual([
      "npm ci",
      "npm run build",
      `docker pull --quiet`,
      "docker run --rm",
      "docker run --rm",
      "docker run --rm",
      "docker run --rm",
    ]);
    expect(commands[2]?.args).toEqual(["pull", "--quiet", IMAGE]);
    expect(commands.slice(3).map((entry) => entry.label)).toEqual(LEG_PROFILES.map((entry) => `profile ${entry.id}`));
  });
});

describe("the cloud leg's run", () => {
  /** A recorded runner: Docker is absent on the `check` legs, and the order and the failure handling are the subject here. */
  function recorded(fail: (command: string, args: readonly string[]) => number = () => 0) {
    const calls: string[] = [];
    const out: string[] = [];
    const err: string[] = [];
    const io = {
      source: SOURCE,
      exec: (command: string, args: readonly string[], cwd: string) => {
        calls.push(`${cwd}: ${command} ${args[0] ?? ""}${command === "docker" && args[0] === "run" ? ` ${valuesOf(args, "--env")[0] ?? ""}` : ""}`);
        return fail(command, args);
      },
      out: (text: string) => out.push(text),
      err: (text: string) => err.push(text),
    };
    return { io, calls, out, err };
  }

  it("runs the build and every profile from the source folder, exit 0 when all pass", () => {
    const { io, calls, out } = recorded();
    expect(runLeg([], io)).toBe(0);
    expect(calls).toEqual([
      `${SOURCE}: npm ci`,
      `${SOURCE}: npm run`,
      `${SOURCE}: docker pull`,
      ...LEG_PROFILES.map((entry) => `${SOURCE}: docker run ${PROFILE_VARIABLE as string}=${entry.id}`),
    ]);
    expect(out.join("")).toContain("cloud-leg: every profile passed");
  });

  it("runs every profile when one fails, then exits 1 naming it", () => {
    const { io, calls, out, err } = recorded((command, args) => (command === "docker" && valuesOf(args, "--env")[0]?.endsWith("=cursor") === true ? 1 : 0));
    expect(runLeg([], io)).toBe(1);
    expect(calls.filter((call) => call.includes("docker run"))).toHaveLength(LEG_PROFILES.length);
    expect(err.join("")).toContain("cloud-leg: profile cursor failed (exit 1)");
    expect(out.join("")).toContain("cloud-leg: failed: profile cursor");
  });

  it("stops at a failed build, starting no container", () => {
    const { io, calls } = recorded((command, args) => (command === "npm" && args[0] === "run" ? 2 : 0));
    expect(runLeg([], io)).toBe(1);
    expect(calls).toEqual([`${SOURCE}: npm ci`, `${SOURCE}: npm run`]);
  });

  it("runs one profile after the build with --profile, and refuses an unknown one or argument with exit 2", () => {
    const { io, calls } = recorded();
    expect(runLeg(["--profile", "copilot"], io)).toBe(0);
    expect(calls.filter((call) => call.includes("docker run"))).toEqual([`${SOURCE}: docker run ${PROFILE_VARIABLE as string}=copilot`]);
    for (const argv of [["--profile", "codex"], ["--profile"], ["--offline"]]) {
      const refused = recorded();
      expect(runLeg(argv, refused.io), argv.join(" ")).toBe(2);
      expect(refused.calls, argv.join(" ")).toEqual([]);
      expect(refused.err.join(""), argv.join(" ")).toContain("usage: node scripts/ci/cloud-leg.mjs");
    }
    expect(parseArgs(["--dry-run", "--profile", "offline"])).toEqual({ dryRun: true, profile: "offline" });
  });

  it("prints every command and starts none under --dry-run, with no docker or npm on PATH", () => {
    // Only the folder holding this node on PATH: a command the dry run started would fail to start.
    const result = spawnSync(process.execPath, [SCRIPT, "--dry-run"], {
      encoding: "utf8",
      env: { PATH: dirname(process.execPath), ...(process.platform === "win32" ? { SystemRoot: process.env["SystemRoot"] ?? "" } : {}) },
      windowsHide: true,
    });
    expect(result.status, result.stderr).toBe(0);
    const repo = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "");
    expect(result.stdout).toContain("# install\nnpm ci\n# build\nnpm run build\n");
    expect(result.stdout).toContain(`docker pull --quiet ${IMAGE as string}`);
    for (const entry of LEG_PROFILES) {
      expect(result.stdout).toContain(`# profile ${entry.id}\ndocker run --rm --init`);
      expect(result.stdout).toContain(`--env ${PROFILE_VARIABLE as string}=${entry.id} `);
    }
    expect(result.stdout).toContain(`type=bind,source=${repo},target=/src,readonly`);
    expect(result.stdout.match(/^docker run /gm)).toHaveLength(LEG_PROFILES.length);
    expect(result.stdout.trimEnd().endsWith("Dry run: nothing was run.")).toBe(true);
  });
});
