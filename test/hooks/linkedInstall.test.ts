/**
 * d-npm-ci-guard (REQ-FLOW-178): an install verb run where the working folder's `node_modules` is a symbolic link
 * is refused in every mode, naming the link's target and the fix, since the install would write through the link into
 * another checkout's install (a lane's `npm ci` once emptied the main checkout's `node_modules`).
 *
 * Run as a client runs it: the emitted guard as a real child process in a scratch repository, the payload on stdin,
 * the link a real link on disk. No double stands in for anything. Every refusal has an allow one fact away (the same
 * line with a real folder, a missing one, or a verb that installs nothing), so a guard that refused every call, or
 * none, fails.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, realpathSync, symlinkSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AWAY_HELD_FILE, NOBODY_WATCHING_VARIABLE, PERSON_ONLY_GUARD_FILE, planCoreHookScripts } from "../../src/hooks/scripts.ts";
import { type Tool, TOOLS } from "../../src/types/core.ts";
import { CHILD_TIMEOUT_MS } from "../support/childTimeout.ts";
import { useTempDir } from "../support/tempDir.ts";

const getRepo = useTempDir("linked-install");

/** The package and version the core scripts' CLI hints pin; a literal, so a renamed fork renders the same bytes. */
const CLI_PIN = { packageName: "@zomarit/stamity", version: "1.0.0-golden" };
const POLICY = "../../agent-tool-policies.json";
/** A dangling junction and a mode bit are not what Windows or root honour, so those two cases run where they hold. */
const NO_DANGLING = process.platform === "win32";
const NO_MODE_BITS = process.platform === "win32" || process.getuid?.() === 0;

/** The refusal the cell names, for a link resolving to `target`. */
function refusal(target: string): string {
  return `This install would write through node_modules here, which is a link to ${target}, another checkout's install. Run it in that checkout, or remove the link (the link only) and install here.`;
}

/** The guard for one client where emission writes it, in a repository on `feat/x`; returns its path. */
async function placeGuard(tool: Tool, files: Record<string, string> = {}): Promise<string> {
  const guard = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, personOnlyGuard: true }).find((script) => script.fileName === PERSON_ONLY_GUARD_FILE);
  if (guard === undefined) throw new Error("the plan carried no person-only guard");
  await getRepo().seedFiles({
    ".git/HEAD": "ref: refs/heads/feat/x\n",
    [`.stamity/generated/hooks/${tool}/${guard.fileName}`]: guard.content,
    // The other checkout whose install a link points at, with one package in it.
    "main/node_modules/left-pad/package.json": "{}\n",
    ...files,
  });
  return getRepo().path(".stamity", "generated", "hooks", tool, guard.fileName);
}

/**
 * Links `folder/node_modules` to the other checkout's install, and returns that install's real path. A junction on
 * Windows, which needs no privilege; the type is ignored elsewhere.
 */
function linkInstall(folder: string, target = getRepo().path("main", "node_modules")): string {
  mkdirSync(folder, { recursive: true });
  symlinkSync(target, `${folder}/node_modules`, "junction");
  return existsSync(target) ? realpathSync(target) : target;
}

/** A shell call as each client hands it to the guard. */
function payload(tool: Tool, command: string): string {
  if (tool === "cursor") return JSON.stringify({ hook_event_name: "beforeShellExecution", command, cwd: "." });
  const extra = tool === "copilot" ? { toolName: "bash" } : { hook_event_name: "PreToolUse" };
  return JSON.stringify({ ...extra, tool_name: "Bash", tool_input: { command } });
}

/** The child's environment: the test's own, less every variable the guard reads, plus the case's. */
function hookEnv(env: Record<string, string>): NodeJS.ProcessEnv {
  const base = { ...process.env };
  for (const name of ["STAMITY_UNATTENDED", "STAMITY_REPO_ROOT", NOBODY_WATCHING_VARIABLE, "GH_REPO", "GH_HOST", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS", "XDG_CONFIG_HOME"]) {
    delete base[name];
  }
  base.GIT_CONFIG_GLOBAL = "/dev/null";
  base.GIT_CONFIG_NOSYSTEM = "1";
  return { ...base, ...env };
}

/** What a client's answer says: allowed, asked, or refused with its reason. */
type Said = { kind: "allow" } | { kind: "ask"; reason: string } | { kind: "refuse"; reason: string };

/** Runs the guard on one call and reads the client's answer. */
function decide(tool: Tool, guard: string, command: string, env: Record<string, string> = {}): Said {
  const answer = spawnSync(process.execPath, [guard], { input: payload(tool, command), encoding: "utf8", env: hookEnv(env), timeout: CHILD_TIMEOUT_MS });
  const stdout = String(answer.stdout).trim();
  if (tool === "claude" && stdout !== "") {
    expect(answer.status, command).toBe(0);
    const out = JSON.parse(stdout) as { hookSpecificOutput: { permissionDecisionReason: string } };
    return { kind: "ask", reason: out.hookSpecificOutput.permissionDecisionReason };
  }
  if (tool === "claude" || tool === "codex") {
    if (answer.status === 0) return { kind: "allow" };
    expect(answer.status, command).toBe(2);
    return { kind: "refuse", reason: String(answer.stderr).replace(/^stamity person-only guard: /, "").trimEnd() };
  }
  expect(answer.status, command).toBe(0);
  if (stdout === "") return { kind: "allow" };
  const out = JSON.parse(stdout) as Record<string, string>;
  const verdict = tool === "cursor" ? out.permission : out.permissionDecision;
  if (verdict === "allow") return { kind: "allow" };
  const reason = (tool === "cursor" ? out.user_message : out.permissionDecisionReason) ?? "";
  return verdict === "ask" ? { kind: "ask", reason } : { kind: "refuse", reason };
}

/** Install lines, one per verb the cell names (and npm's own spellings of them), each refused through a link. */
const INSTALLS = [
  "npm ci",
  "npm install",
  "npm i left-pad",
  "npm add left-pad",
  "npm update",
  "npm uninstall left-pad",
  "npm clean-install",
  "npm --loglevel silly ci",
  "pnpm install",
  "pnpm i",
  "pnpm add left-pad",
  "yarn",
  "yarn --frozen-lockfile",
  "yarn install",
  "yarn add left-pad",
  "bun install",
  "bun add left-pad",
  "bun i",
  // Behind a wrapper (its valued option skipped, its command-line option read), an assignment, a shell's line, a
  // quoted program word, a later segment and a substitution.
  "env CI=1 npm ci",
  "sudo -u root npm ci",
  "env -S 'npm ci'",
  "npx -c 'npm ci'",
  "CI=1 npm ci",
  "bash -c 'npm ci'",
  "'npm ci'",
  "npm test && npm ci",
  "echo $(npm ci)",
] as const;

/** Lines that install nothing here, each allowed through the same link. */
const NOT_INSTALLS = [
  "npm test",
  "npm run build",
  "npm ls",
  "pnpm test",
  "yarn test",
  "bun run build",
  "npx vitest run",
  "echo npm ci",
  "git commit -m 'npm ci'",
  "npm i -g left-pad",
  "npm install --global left-pad",
  "pnpm add -g left-pad",
] as const;

describe("an install through a linked node_modules (REQ-FLOW-178)", () => {
  it.each(TOOLS)("%s: refuses npm ci where node_modules is a link, naming its target; allows it in a real folder", async (tool) => {
    const guard = await placeGuard(tool);
    // Non-degenerate: no node_modules at all, the same line runs.
    expect(decide(tool, guard, "npm ci")).toEqual({ kind: "allow" });
    mkdirSync(getRepo().path("node_modules"));
    // A real folder: the same line runs.
    expect(decide(tool, guard, "npm ci")).toEqual({ kind: "allow" });
  });

  it.each(TOOLS)("%s: refuses npm ci through the link, naming the link's real target and the fix", async (tool) => {
    const guard = await placeGuard(tool);
    const target = linkInstall(getRepo().path());
    expect(decide(tool, guard, "npm ci")).toEqual({ kind: "refuse", reason: refusal(target) });
    // A line that installs nothing still runs.
    expect(decide(tool, guard, "npm test")).toEqual({ kind: "allow" });
    // The target is untouched by the guard's reading.
    expect(readFileSync(getRepo().path("main", "node_modules", "left-pad", "package.json"), "utf8")).toBe("{}\n");
  });

  it("refuses every install verb through the link and allows every line that installs nothing", async () => {
    const guard = await placeGuard("claude");
    const target = linkInstall(getRepo().path());
    for (const command of INSTALLS) expect(decide("claude", guard, command), command).toEqual({ kind: "refuse", reason: refusal(target) });
    for (const command of NOT_INSTALLS) expect(decide("claude", guard, command), command).toEqual({ kind: "allow" });
  });

  it("allows every install verb where node_modules is a real folder", async () => {
    const guard = await placeGuard("claude", { "node_modules/.keep": "" });
    for (const command of INSTALLS) expect(decide("claude", guard, command), command).toEqual({ kind: "allow" });
  });

  it("resolves the place through cd and --prefix, and leaves another place's install alone", async () => {
    const guard = await placeGuard("claude", { "node_modules/.keep": "" });
    const target = linkInstall(getRepo().path("lane"));
    for (const command of ["cd lane && npm ci", "(cd lane; pnpm install)", "npm --prefix lane ci", "npm --prefix=lane install", "npm ci --prefix lane", "pnpm -C lane install", "yarn --cwd lane"]) {
      expect(decide("claude", guard, command), command).toEqual({ kind: "refuse", reason: refusal(target) });
    }
    // Non-degenerate: the root's own install, a lane line that installs nothing, and a prefix naming a real folder.
    for (const command of ["npm ci", "cd lane && npm test", "npm --prefix lane test", "npm --prefix main ci"]) {
      expect(decide("claude", guard, command), command).toEqual({ kind: "allow" });
    }
  });

  it("refuses the same way while nobody is watching and while a run is unattended, holding nothing", async () => {
    const guard = await placeGuard("claude", { "node_modules/.keep": "" });
    const modes = [{ [NOBODY_WATCHING_VARIABLE]: "1" }, { STAMITY_UNATTENDED: "1" }];
    // Non-degenerate: in a real folder each mode allows the line.
    for (const env of modes) expect(decide("claude", guard, "cd lane && npm ci", env)).toEqual({ kind: "allow" });
    const target = linkInstall(getRepo().path("lane"));
    for (const env of modes) expect(decide("claude", guard, "cd lane && npm ci", env)).toEqual({ kind: "refuse", reason: refusal(target) });
    // A refusal, never an ask: the held list is not written.
    expect(existsSync(getRepo().path(...AWAY_HELD_FILE.split("/")))).toBe(false);
  });

  it.skipIf(NO_DANGLING)("refuses through a dangling link, naming where it points", async () => {
    const guard = await placeGuard("claude");
    const gone = getRepo().path("gone", "node_modules");
    linkInstall(getRepo().path(), gone);
    expect(decide("claude", guard, "npm install")).toEqual({ kind: "refuse", reason: refusal(gone) });
    expect(decide("claude", guard, "npm test")).toEqual({ kind: "allow" });
  });

  it.skipIf(NO_MODE_BITS)("never throws into the fail-closed path: a folder it cannot look in is read as no link", async () => {
    const guard = await placeGuard("claude");
    mkdirSync(getRepo().path("locked"));
    // The same line in a readable folder with no node_modules runs; the locked one must answer the same, not refuse
    // with the fail-closed sentence.
    expect(decide("claude", guard, "cd locked && npm ci")).toEqual({ kind: "allow" });
    chmodSync(getRepo().path("locked"), 0o000);
    try {
      expect(decide("claude", guard, "cd locked && npm ci")).toEqual({ kind: "allow" });
    } finally {
      chmodSync(getRepo().path("locked"), 0o755);
    }
  });
});
