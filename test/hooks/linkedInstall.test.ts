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
import { dirname } from "node:path";
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

/**
 * The refusal the cell names, for a link resolving to `target`. TEST CHANGE, justified: the sentence now names the
 * fix that works, a cd to that checkout or an absolute --prefix (review/83, sign-off S54); the cell's sentence alone
 * left an agent no spelling the guard let through, and every other word is the cell's.
 */
function refusal(target: string): string {
  const checkout = dirname(target);
  return `This install would write through node_modules here, which is a link to ${target}, another checkout's install. Run it in that checkout (cd ${checkout} first, or give the install an absolute --prefix ${checkout}), or remove the link (the link only) and install here.`;
}

/**
 * The refusal past the folders the check follows (review/106): where the install runs is not known, so it is refused,
 * in a real folder as much as a linked one. 32 is the guard's place cap, GUARD_PLACES_MAX.
 */
const TOO_MANY_FOLDERS =
  "This install comes after more folder changes than the guard follows (32 folders at most), so whether it writes through a linked node_modules cannot be read. Run the install on a line of its own, after a plain cd to its folder.";

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

/** A shell call as each client hands it to the guard, run in `cwd` (relative to the root) when one is given. */
function payload(tool: Tool, command: string, cwd?: string): string {
  if (tool === "cursor") return JSON.stringify({ hook_event_name: "beforeShellExecution", command, cwd: cwd ?? "." });
  const extra = tool === "copilot" ? { toolName: "bash" } : { hook_event_name: "PreToolUse" };
  return JSON.stringify({ ...extra, tool_name: "Bash", tool_input: { command }, ...(cwd === undefined ? {} : { cwd }) });
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
function decide(tool: Tool, guard: string, command: string, env: Record<string, string> = {}, cwd?: string): Said {
  const answer = spawnSync(process.execPath, [guard], { input: payload(tool, command, cwd), encoding: "utf8", env: hookEnv(env), timeout: CHILD_TIMEOUT_MS });
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
  // Sign-off S47: every verb that writes into node_modules, at least one added verb per manager.
  "npm prune",
  "npm audit fix",
  "npm link left-pad",
  "pnpm remove left-pad",
  "pnpm update",
  "pnpm up left-pad",
  "yarn remove left-pad",
  "yarn upgrade",
  "yarn up left-pad",
  "bun remove left-pad",
  "bun rm left-pad",
  "bun update",
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
  "npm audit",
  "pnpm outdated",
  "yarn why left-pad",
  "bun pm ls",
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

  it("reads the line in order: each install against the folder in effect where it runs (review/83, review/80, build/41)", async () => {
    const guard = await placeGuard("claude", { "node_modules/.keep": "" });
    const target = linkInstall(getRepo().path("lane"));
    const main = getRepo().path("main");
    // From the linked lane, the refusal's own fix runs: a cd to the main checkout first, relative or absolute, also
    // behind a command that runs before it in the same chain, and git -C naming the lane moves only git.
    for (const command of [`cd ${main} && npm ci`, "cd ../main && npm ci", "cd ../main; npm ci", `git fetch && cd ${main} && npm ci`, `npm --prefix ${main} ci`]) {
      expect(decide("claude", guard, command, {}, "lane"), command).toEqual({ kind: "allow" });
    }
    for (const command of ["git -C lane status && npm ci", "cd lane && npm test; cd - && npm ci", "(cd lane && npm test) && npm ci", "env -C lane npm test; npm ci"]) {
      expect(decide("claude", guard, command), command).toEqual({ kind: "allow" });
    }
    // Non-degenerate, and nothing loosened: a cd that does not hold where the install runs (a subshell's, a pipe's, a
    // background job's, a condition's, one after ||) leaves the lane's folder in play; eval's cd and env -C move it.
    for (const command of [`(cd ${main} && npm test); npm ci`, `cd ${main} | cat; npm ci`, `cd ${main} & npm ci`, `if true; then cd ${main}; fi; npm ci`, `true || cd ${main}; npm ci`, `false && cd ${main}; npm ci`, `{ cd ${main}; }; npm ci`, `echo $(cd ${main}) && npm ci`, "npm ci", "cd . && npm ci"]) {
      expect(decide("claude", guard, command, {}, "lane"), command).toEqual({ kind: "refuse", reason: refusal(target) });
    }
    for (const command of ["eval 'cd lane'; npm ci", "env -C lane npm ci", "env --chdir=lane npm ci", "cd main; cd ../lane && npm ci"]) {
      expect(decide("claude", guard, command), command).toEqual({ kind: "refuse", reason: refusal(target) });
    }
  });

  it("walks up to the folder holding the package.json, as the managers do (review/78)", async () => {
    const guard = await placeGuard("claude", { "node_modules/.keep": "", "lane/package.json": "{}\n", "lane/src/.keep": "", "lane/tools/package.json": "{}\n" });
    const target = linkInstall(getRepo().path("lane"));
    // A subfolder with no package.json of its own installs at the lane's top, through the link.
    for (const command of ["cd lane/src && npm ci", "npm --prefix lane/src install", "pnpm -C lane/src add left-pad"]) {
      expect(decide("claude", guard, command), command).toEqual({ kind: "refuse", reason: refusal(target) });
    }
    expect(decide("claude", guard, "npm ci", {}, "lane/src")).toEqual({ kind: "refuse", reason: refusal(target) });
    // Non-degenerate: a subfolder holding its own package.json installs there, and the root's real folder is its own.
    for (const command of ["cd lane/tools && npm ci", "cd src && npm ci"]) {
      expect(decide("claude", guard, command), command).toEqual({ kind: "allow" });
    }
  });

  it("checks a workspace member's install at its workspace root too (fixer W-1, sign-off S64)", async () => {
    const guard = await placeGuard("claude", {
      "node_modules/.keep": "",
      // An npm workspace lane, a pnpm workspace lane (its member holding its own real node_modules, as pnpm leaves it),
      // and a workspace whose root install is a real folder.
      "lane/package.json": '{ "workspaces": ["packages/*"] }\n',
      "lane/packages/a/package.json": "{}\n",
      "pnpm/package.json": "{}\n",
      "pnpm/pnpm-workspace.yaml": "packages:\n  - packages/*\n",
      "pnpm/packages/a/package.json": "{}\n",
      "pnpm/packages/a/node_modules/.keep": "",
      "real/package.json": '{ "workspaces": ["packages/*"] }\n',
      "real/node_modules/.keep": "",
      "real/packages/a/package.json": "{}\n",
      "plain/package.json": "{}\n",
      "plain/tools/package.json": "{}\n",
    });
    const target = linkInstall(getRepo().path("lane"));
    linkInstall(getRepo().path("pnpm"));
    linkInstall(getRepo().path("plain"));
    for (const command of ["cd lane/packages/a && npm ci", "cd lane/packages/a && pnpm install", "npm --prefix lane/packages/a install"]) {
      expect(decide("claude", guard, command), command).toEqual({ kind: "refuse", reason: refusal(target) });
    }
    expect(decide("claude", guard, "cd pnpm/packages/a && pnpm install")).toEqual({ kind: "refuse", reason: refusal(target) });
    // Non-degenerate: a workspace whose root install is real runs, and a subfolder of a linked checkout that declares
    // no workspace keeps today's result (its own package.json, its own install).
    for (const command of ["cd real/packages/a && npm ci", "cd plain/tools && npm ci"]) {
      expect(decide("claude", guard, command), command).toEqual({ kind: "allow" });
    }
  });

  it("reads past a wrapper's number and value arguments (review/82)", async () => {
    const guard = await placeGuard("claude");
    const target = linkInstall(getRepo().path());
    for (const command of ["timeout 600 npm ci", "timeout -k 5 600 pnpm install", "timeout 10m yarn", "nice -n 10 npm ci", "timeout 600 env CI=1 npm ci"]) {
      expect(decide("claude", guard, command), command).toEqual({ kind: "refuse", reason: refusal(target) });
    }
    expect(decide("claude", guard, "timeout 600 npm test")).toEqual({ kind: "allow" });
  });

  it("counts a bare yarn only with options alone after it, and lets help and version run (review/79, review/84)", async () => {
    const guard = await placeGuard("claude");
    const target = linkInstall(getRepo().path());
    // Each writes nothing, probed against yarn 1.22.22 and npm 10 in a scratch folder.
    for (const command of ["yarn --version", "yarn -v", "yarn --help", "yarn -h", "yarn --silent test", "yarn -s lint", "yarn add -h", "npm ci --dry-run", "npm install --help", "npm i -h", "npm ci -v"]) {
      expect(decide("claude", guard, command), command).toEqual({ kind: "allow" });
    }
    // Still installs: options alone, a value option's value among them, and yarn 1's --dry-run, which it ignores.
    for (const command of ["yarn --frozen-lockfile", "yarn --network-timeout 100000", "yarn --cache-folder /tmp/c --frozen-lockfile", "yarn --dry-run", "yarn --silent add left-pad"]) {
      expect(decide("claude", guard, command), command).toEqual({ kind: "refuse", reason: refusal(target) });
    }
  });

  it("reads each manager's other spellings: aliases, a runner's line, a quoted name (review/81)", async () => {
    const guard = await placeGuard("claude");
    const target = linkInstall(getRepo().path());
    for (const command of ["npm sit", "npm clean-install-test", "pnpm dislink left-pad", "npm exec -- npm ci", "pnpm exec npm ci", "yarn exec npm ci", "n''pm ci", "n\\pm ci", "\"n\"pm ci"]) {
      expect(decide("claude", guard, command), command).toEqual({ kind: "refuse", reason: refusal(target) });
    }
    expect(decide("claude", guard, "npm exec -- vitest run")).toEqual({ kind: "allow" });
  });

  it("checks a folder hidden in a variable against the folder the line starts from (build/42)", async () => {
    const guard = await placeGuard("claude", { "node_modules/.keep": "" });
    const target = linkInstall(getRepo().path("lane"));
    // Started in the linked lane, an install behind cd "$x" is refused; started in a real folder, it runs: the guard
    // cannot read where $x points, and refusing every such line would refuse ordinary ones.
    expect(decide("claude", guard, 'cd "$MAIN" && npm ci', {}, "lane")).toEqual({ kind: "refuse", reason: refusal(target) });
    expect(decide("claude", guard, 'npm --prefix "$MAIN" ci', {}, "lane")).toEqual({ kind: "refuse", reason: refusal(target) });
    expect(decide("claude", guard, 'cd "$LANE" && npm ci')).toEqual({ kind: "allow" });
  });

  it("bounds the folders a line puts in play, and refuses an install past the bound within the child's time limit (review/106)", async () => {
    const guard = await placeGuard("claude", { "node_modules/.keep": "" });
    const target = linkInstall(getRepo().path("lane"));
    // Each cd after || doubles the folders the install may start from: twenty would be over a million with no bound.
    // The time limit is the child's own (CHILD_TIMEOUT_MS): a guard still walking at it has no status, and decide()
    // fails the case on that, so no clock is read here.
    const steps = (n: number): string => Array.from({ length: n }, (_, i) => ` || cd d${i}`).join("");
    for (const cwd of ["lane", undefined]) {
      expect(decide("claude", guard, `true${steps(20)}; npm ci`, {}, cwd), String(cwd)).toEqual({ kind: "refuse", reason: TOO_MANY_FOLDERS });
    }
    // So is an install naming more folders than the bound itself.
    const prefixes = Array.from({ length: 40 }, (_, i) => ` --prefix p${i}`).join("");
    expect(decide("claude", guard, `npm ci${prefixes}`)).toEqual({ kind: "refuse", reason: TOO_MANY_FOLDERS });
    // Non-degenerate, one fact away: under the bound the same shape reads each folder (refused through the lane's link,
    // allowed in the real root), and past it a line that installs nothing runs.
    expect(decide("claude", guard, `true${steps(4)}; npm ci`, {}, "lane")).toEqual({ kind: "refuse", reason: refusal(target) });
    expect(decide("claude", guard, `true${steps(4)}; npm ci`)).toEqual({ kind: "allow" });
    expect(decide("claude", guard, `true${steps(20)}; npm test`, {}, "lane")).toEqual({ kind: "allow" });
  });

  it("keeps the folder a cd to a missing folder fails to leave (review/107)", async () => {
    const guard = await placeGuard("claude", { "node_modules/.keep": "" });
    const target = linkInstall(getRepo().path("lane"));
    const main = getRepo().path("main");
    const gone = getRepo().path("gone");
    // From the linked lane, a cd to a folder that is not there fails, so an install after ;, a newline or || runs in the
    // lane; so does one after a cd that || skips once the command before it failed.
    for (const command of [`cd ${gone}; npm ci`, `cd ${gone}\nnpm ci`, `cd ${gone} || npm ci`, `cd ${gone} && true; npm ci`, `false && cd ${main} || npm ci`]) {
      expect(decide("claude", guard, command, {}, "lane"), command).toEqual({ kind: "refuse", reason: refusal(target) });
    }
    // Non-degenerate: a cd to a folder that is there holds, and after && a failed cd runs nothing more.
    for (const command of [`cd ${main}; npm ci`, `cd ${main}\nnpm ci`, `cd ${main} || true; npm ci`, `mkdir -p ${gone} && cd ${gone} && npm ci`]) {
      expect(decide("claude", guard, command, {}, "lane"), command).toEqual({ kind: "allow" });
    }
  });

  it("puts the folder a pushd left back in play at popd (review/108)", async () => {
    const guard = await placeGuard("claude", { "node_modules/.keep": "" });
    const target = linkInstall(getRepo().path("lane"));
    const main = getRepo().path("main");
    // From the linked lane, popd (or a bare pushd, which swaps) goes back to the lane, where the install writes.
    for (const command of [`pushd ${main} && npm ci && popd && npm ci`, `Push-Location ${main}; npm ci; Pop-Location; npm ci`, `pushd ${main} && pushd && npm ci`]) {
      expect(decide("claude", guard, command, {}, "lane"), command).toEqual({ kind: "refuse", reason: refusal(target) });
    }
    expect(decide("claude", guard, `pushd lane && pushd ${main} && popd && npm ci`)).toEqual({ kind: "refuse", reason: refusal(target) });
    // Non-degenerate: an install while the pushd holds runs in main.
    for (const command of [`pushd ${main} && npm ci && popd`, `pushd ${main} && npm ci`]) {
      expect(decide("claude", guard, command, {}, "lane"), command).toEqual({ kind: "allow" });
    }
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
