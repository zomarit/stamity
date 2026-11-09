/**
 * n-switch-guard (REQ-FLOW-166): while nobody is watching, every ask the person-only guard would put to the person
 * becomes a refusal held for the morning, and Copilot's portable runner turns a hook's ask into a denial.
 *
 * Run as a client runs them: the emitted guard and runner as real child processes in a scratch repository, the payload
 * on stdin, the switch as the child's real environment or a real marker file. No double stands in for anything. The
 * switch is a strict tightening, so every case compares a call with the switch on against the same call with it off:
 * an ask moves to a refusal, and every other answer stays byte for byte what it was.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPortableHookRunner, PORTABLE_RUNNER_FILE } from "../../src/hooks/portableRunner.ts";
import { GITHUB_MCP_ROWS } from "../../src/hooks/personOnly.ts";
import {
  AWAY_HELD_FILE,
  AWAY_MARKER_FILE,
  NOBODY_WATCHING_VARIABLE,
  PERSON_ONLY_GUARD_FILE,
  planCoreHookScripts,
} from "../../src/hooks/scripts.ts";
import { type Tool, TOOLS } from "../../src/types/core.ts";
import { CHILD_TIMEOUT_MS } from "../support/childTimeout.ts";
import { useTempDir } from "../support/tempDir.ts";

const getRepo = useTempDir("nobody-watching");

/** The package and version the core scripts' CLI hints pin; a literal, so a renamed fork renders the same bytes. */
const CLI_PIN = { packageName: "@zomarit/stamity", version: "1.0.0-golden" };
const POLICY = "../../agent-tool-policies.json";
/** A permission bit is the real failure in the unwritable case; Windows and root ignore it, so it runs where it holds. */
const NO_MODE_BITS = process.platform === "win32" || process.getuid?.() === 0;
/** A symbolic link needs a privilege Windows does not give every account, so the link cases run where it holds. */
const NO_LINKS = process.platform === "win32";

const ON = { [NOBODY_WATCHING_VARIABLE]: "1" };
// TEST CHANGE, justified (review/18, sign-off S25): outside an unattended run the held refusal names the held list
// and `stamity away status`, not the run's `morning.md`, which an attended run may not have; and it claims the list
// only when the line was written.
const HELD_TAIL = " and is on the held list (`stamity away status`).";
const NOT_HELD_TAIL = "; the held list could not be written, so name it in your reply.";
const CANNOT_ASK = "This client cannot ask the person for a click, so the guard refuses it: give the person the exact command.";
/** Copilot's recorded main session (w4-copilot-ask): the record its session start keeps under the common git directory. */
const MAIN = "8177e220-4c1d-4b52-9b7e-1f0a6d3c2e11";

/**
 * Ask-class acts the default setting does not run unasked, each one the guard asks about attended on `feat/x`. Each
 * carries words past its rule's own example, since an act's text quotes that example (`npm publish`).
 */
const ASK_ACTS = [
  "git push origin HEAD:main",
  "gh pr merge 3 --squash",
  "gh release create v2",
  "npm publish --access public",
  "gh secret set TOKEN",
  "gh api -X PUT repos/o/r/branches/main/protection",
] as const;

/** Calls the switch leaves alone: allowed, run unasked by the default setting, or refused in every mode. */
const UNMOVED = [
  "git push -u origin feat/x",
  "npm test",
  "gh pr view 3",
  "git tag v2",
  "gh pr ready 3",
  "git push --force origin feat/x",
  "gh release delete v1",
  "npm unpublish",
] as const;

/** The guard for one client where emission writes it, in a repository on `feat/x`; returns its path. */
async function placeGuard(tool: Tool, files: Record<string, string> = {}): Promise<string> {
  const guard = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, personOnlyGuard: true }).find((script) => script.fileName === PERSON_ONLY_GUARD_FILE);
  if (guard === undefined) throw new Error("the plan carried no person-only guard");
  await getRepo().seedFiles({
    ".git/HEAD": "ref: refs/heads/feat/x\n",
    [`.stamity/generated/hooks/${tool}/${guard.fileName}`]: guard.content,
    ...files,
  });
  return getRepo().path(".stamity", "generated", "hooks", tool, guard.fileName);
}

/** A shell call as each client hands it to the guard; `fields` adds identity fields (a sub-agent's, a session's). */
function payload(tool: Tool, command: string, fields: Record<string, unknown> = {}): string {
  if (tool === "cursor") return JSON.stringify({ hook_event_name: "beforeShellExecution", command, cwd: ".", ...fields });
  const extra = tool === "copilot" ? { toolName: "bash" } : { hook_event_name: "PreToolUse" };
  return JSON.stringify({ ...extra, tool_name: "Bash", tool_input: { command }, ...fields });
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

/** One run's whole answer: its exit, stdout and stderr. */
interface Answer {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(script: string, input: string, env: Record<string, string> = {}, nodeArgs: readonly string[] = []): Answer {
  const result = spawnSync(process.execPath, [...nodeArgs, script], { input, encoding: "utf8", env: hookEnv(env), timeout: CHILD_TIMEOUT_MS });
  return { status: result.status, stdout: String(result.stdout), stderr: String(result.stderr) };
}

/**
 * Node arguments that make every `lstatSync` of the away marker fail with EIO, preloaded before the script runs.
 * A substitute, at the fs boundary the scripts already have: no real file layout faults the marker's look-up alone,
 * since the guard reads `.stamity/runs` beside it first and a fault on the shared folder refuses there.
 */
function markerFault(): string[] {
  const preload = getRepo().path("marker-fault.mjs");
  writeFileSync(
    preload,
    [
      'import fs from "node:fs";',
      'import { syncBuiltinESMExports } from "node:module";',
      "const real = fs.lstatSync;",
      "fs.lstatSync = function (path, ...rest) {",
      `  if (String(path).endsWith(${JSON.stringify(AWAY_MARKER_FILE.split("/").at(-1))})) throw Object.assign(new Error("EIO: i/o error, lstat"), { code: "EIO", path: String(path) });`,
      "  return real.call(this, path, ...rest);",
      "};",
      "syncBuiltinESMExports();",
      "",
    ].join("\n"),
  );
  return ["--import", pathToFileURL(preload).href];
}

/** What a client's answer says: allowed, asked, or refused with its reason. */
type Said = { kind: "allow" } | { kind: "ask"; reason: string } | { kind: "refuse"; reason: string };

function said(tool: Tool, answer: Answer): Said {
  const stdout = answer.stdout.trim();
  if (tool === "claude" && stdout !== "") {
    expect(answer.status).toBe(0);
    const out = JSON.parse(stdout) as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } };
    expect(out.hookSpecificOutput.permissionDecision).toBe("ask");
    return { kind: "ask", reason: out.hookSpecificOutput.permissionDecisionReason };
  }
  if (tool === "claude" || tool === "codex") {
    if (answer.status === 0) return { kind: "allow" };
    expect(answer.status).toBe(2);
    return { kind: "refuse", reason: answer.stderr.replace(/^stamity person-only guard: /, "").trimEnd() };
  }
  expect(answer.status).toBe(0);
  if (stdout === "") return { kind: "allow" };
  const out = JSON.parse(stdout) as Record<string, string>;
  const verdict = tool === "cursor" ? out.permission : out.permissionDecision;
  if (verdict === "allow") return { kind: "allow" };
  const reason = (tool === "cursor" ? out.user_message : out.permissionDecisionReason) ?? "";
  return verdict === "ask" ? { kind: "ask", reason } : { kind: "refuse", reason };
}

/** The act and rule an attended ask names, read off Claude Code's ask sentence. */
function askedAct(reason: string): { act: string; rule: string } {
  const hit = /^(.*) is a person-only act \(`([^`]+)`\): approve it to let the agent run it once \(REQ-FLOW-102\)\.$/s.exec(reason);
  if (hit === null) throw new Error(`not an ask sentence: ${reason}`);
  return { act: hit[1] ?? "", rule: hit[2] ?? "" };
}

/** The refusal the switch gives an act outside an unattended run: it waits for a person, on the held list or not. */
function heldReason(act: string, rule: string, held = true): string {
  return `${act} is a person-only act (\`${rule}\`) and nobody is watching: it waits for a person${held ? HELD_TAIL : NOT_HELD_TAIL}`;
}

/** The held list's lines, parsed; none when the file is absent. */
function heldLines(): Record<string, unknown>[] {
  const path = getRepo().path(...AWAY_HELD_FILE.split("/"));
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  expect(text.endsWith("\n")).toBe(true);
  return text
    .slice(0, -1)
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Checks one held line against the act, rule and client, and, for a shell call, that it carries no command text. */
function expectHeld(line: Record<string, unknown> | undefined, act: string, rule: string, client: Tool, command?: string): void {
  expect(line).toBeDefined();
  expect(Object.keys(line ?? {})).toEqual(["at", "rule", "act", "client"]);
  expect(line).toMatchObject({ rule, act, client });
  expect(new Date(String(line?.at)).toISOString()).toBe(line?.at);
  if (command !== undefined) expect(JSON.stringify(line)).not.toContain(command);
}

/** Copilot's main-thread call with a session id its session start recorded, so the guard would ask (w4-copilot-ask). */
function copilotMain(command: string): string {
  return JSON.stringify({ sessionId: MAIN, toolName: "bash", session_id: MAIN, tool_name: "Bash", tool_input: { command }, hook_event_name: "PreToolUse" });
}

describe("the guard while nobody is watching (REQ-FLOW-166)", () => {
  it("refuses every act Claude Code would ask about, names it, and holds one line per call without the command", async () => {
    const guard = await placeGuard("claude");
    for (const [index, command] of ASK_ACTS.entries()) {
      // Non-degenerate: the same call with the switch off is an ask.
      const before = said("claude", run(guard, payload("claude", command)));
      expect(before.kind, command).toBe("ask");
      const { act, rule } = askedAct(before.kind === "ask" ? before.reason : "");
      expect(heldLines(), command).toHaveLength(index);
      const after = said("claude", run(guard, payload("claude", command), ON));
      expect(after, command).toEqual({ kind: "refuse", reason: heldReason(act, rule) });
      // review/18 (S25): an attended session may hold no run's summary list, so the refusal does not send the agent to one.
      expect(after.kind === "refuse" ? after.reason : "", command).not.toContain("morning.md");
      const lines = heldLines();
      expect(lines, command).toHaveLength(index + 1);
      expectHeld(lines[index], act, rule, "claude", command);
    }
  });

  it.each(["codex", "cursor"] as const)("%s: refuses an act it would ask about with the morning list, not the cannot-ask sentence", async (tool) => {
    const guard = await placeGuard(tool);
    const command = "gh pr merge 3 --squash";
    const before = said(tool, run(guard, payload(tool, command)));
    expect(before).toEqual({ kind: "refuse", reason: expect.stringContaining(CANNOT_ASK) as unknown as string });
    const after = said(tool, run(guard, payload(tool, command), ON));
    expect(after.kind).toBe("refuse");
    // TEST CHANGE, justified (review/18, sign-off S25): the held refusal names the held list, not the morning list.
    expect(after.kind === "refuse" ? after.reason : "").toMatch(/ and nobody is watching: it waits for a person and is on the held list \(`stamity away status`\)\.$/);
    expect(after.kind === "refuse" ? after.reason : "").not.toContain(CANNOT_ASK);
    const lines = heldLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ rule: "pr-merge", client: tool });
  });

  it("copilot: refuses its main agent's recorded ask, and leaves the unrecorded call's refusal as it was", async () => {
    const guard = await placeGuard("copilot");
    const command = "gh pr merge 3 --squash";
    // No record: already refused without the switch, and the switch moves nothing and holds nothing.
    const unrecorded = run(guard, copilotMain(command));
    expect(said("copilot", unrecorded).kind).toBe("refuse");
    expect(run(guard, copilotMain(command), ON)).toEqual(unrecorded);
    expect(heldLines()).toEqual([]);
    // Recorded: the main agent's call asks without the switch, and is refused and held with it.
    mkdirSync(getRepo().path(".git", "stamity"), { recursive: true });
    writeFileSync(getRepo().path(".git", "stamity", "copilot-main-sessions"), `${MAIN}\n`);
    const before = said("copilot", run(guard, copilotMain(command)));
    expect(before.kind).toBe("ask");
    const { act, rule } = askedAct(before.kind === "ask" ? before.reason : "");
    expect(said("copilot", run(guard, copilotMain(command), ON))).toEqual({ kind: "refuse", reason: heldReason(act, rule) });
    expect(heldLines()).toHaveLength(1);
    expectHeld(heldLines()[0], act, rule, "copilot", command);
  });

  it("refuses a GitHub MCP tool it would ask about, and holds it under the tool's row", async () => {
    const guard = await placeGuard("claude");
    const row = GITHUB_MCP_ROWS.find((entry) => entry.ask);
    if (row === undefined) throw new Error("no ask-class MCP row");
    const call = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: row.row, tool_input: {} });
    expect(said("claude", run(guard, call)).kind).toBe("ask");
    const act = "A call to the GitHub MCP server";
    expect(said("claude", run(guard, call, ON))).toEqual({ kind: "refuse", reason: heldReason(act, row.row) });
    expect(heldLines()).toHaveLength(1);
    expectHeld(heldLines()[0], act, row.row, "claude");
  });

  it("reads the away marker as the switch: a file, an empty one, or a link to nothing", async () => {
    const command = "npm publish";
    const marker = (): string => getRepo().path(...AWAY_MARKER_FILE.split("/"));
    const guard = await placeGuard("claude", { [AWAY_MARKER_FILE]: `${JSON.stringify({ since: "2026-11-09T22:00:00.000Z", by: "stamity away" })}\n` });
    expect(said("claude", run(guard, payload("claude", command))).kind).toBe("refuse");
    writeFileSync(marker(), "");
    expect(said("claude", run(guard, payload("claude", command))).kind).toBe("refuse");
    expect(heldLines()).toHaveLength(2);
    rmSync(marker());
    if (!NO_LINKS) {
      symlinkSync(getRepo().path("nowhere.json"), marker());
      expect(said("claude", run(guard, payload("claude", command))).kind).toBe("refuse");
      expect(heldLines()).toHaveLength(3);
      rmSync(marker());
    }
    // One fact away: no marker → the ask comes back.
    expect(said("claude", run(guard, payload("claude", command))).kind).toBe("ask");
  });

  it("refuses, naming the fault, when the away marker cannot be looked for, and holds nothing", async () => {
    const guard = await placeGuard("claude");
    const command = "npm publish";
    // Non-degenerate: switch off and no marker, the same call asks.
    expect(said("claude", run(guard, payload("claude", command))).kind).toBe("ask");
    // review/17: a fault other than a missing marker fails closed; a catch reading it as absent would ask here.
    expect(said("claude", run(guard, payload("claude", command), {}, markerFault()))).toEqual({
      kind: "refuse",
      reason: expect.stringMatching(/^The person-only guard could not decide this shell call \(EIO on .*away\.json\), so it is refused \(REQ-FLOW-102\)\.$/) as unknown as string,
    });
    expect(heldLines()).toEqual([]);
  });

  it("reads the variable as readsUnattended does: empty, 0 and false are off, anything else is on", async () => {
    const guard = await placeGuard("claude");
    const command = "npm publish";
    for (const off of ["", "0", "false", " FALSE "]) {
      expect(said("claude", run(guard, payload("claude", command), { [NOBODY_WATCHING_VARIABLE]: off })).kind, JSON.stringify(off)).toBe("ask");
    }
    expect(heldLines()).toEqual([]);
    for (const on of ["1", "true", "yes"]) {
      expect(said("claude", run(guard, payload("claude", command), { [NOBODY_WATCHING_VARIABLE]: on })).kind, on).toBe("refuse");
    }
    expect(heldLines()).toHaveLength(3);
  });
});

describe("the suite's own environment (build/5)", () => {
  it("runs every test file with the switch off, so a shell that has it on still tests the asks", () => {
    // vitest.config.ts sets it to "" in every worker; a child spawned with this env inherits it off.
    expect(process.env[NOBODY_WATCHING_VARIABLE]).toBe("");
  });
});

describe("what the switch leaves alone (a strict tightening)", () => {
  it.each(TOOLS)("%s: every allow, every act run unasked and every refusal answers byte for byte as before", async (tool) => {
    const guard = await placeGuard(tool);
    const before = UNMOVED.map((command) => run(guard, payload(tool, command)));
    // Non-degenerate: the list holds an allow and a refusal on every client.
    expect(before.map((answer) => said(tool, answer).kind)).toEqual(expect.arrayContaining(["allow", "refuse"]));
    expect(before.map((answer) => said(tool, answer).kind)).not.toContain("ask");
    expect(UNMOVED.map((command) => run(guard, payload(tool, command), ON))).toEqual(before);
    // The marker too, for the same calls.
    await getRepo().seedFiles({ [AWAY_MARKER_FILE]: "{}\n" });
    expect(UNMOVED.map((command) => run(guard, payload(tool, command)))).toEqual(before);
    expect(heldLines()).toEqual([]);
  });

  it("leaves a sub-agent's refused ask and the auto mode's refused ask as they were, holding nothing", async () => {
    const guard = await placeGuard("claude");
    const command = "gh pr merge 3 --squash";
    for (const fields of [{ agent_id: "a1", agent_type: "general-purpose" }, { permission_mode: "auto" }]) {
      const before = run(guard, payload("claude", command, fields));
      expect(said("claude", before).kind, JSON.stringify(fields)).toBe("refuse");
      expect(run(guard, payload("claude", command, fields), ON), JSON.stringify(fields)).toEqual(before);
    }
    expect(heldLines()).toEqual([]);
  });

  it("leaves an unattended run's refusal as it was, holding nothing", async () => {
    const guard = await placeGuard("claude", {
      ".stamity/runs/2026-11-09_night/record.md": "# Run\n\nStatus: in progress\nMode: unattended\n",
    });
    for (const command of ["gh pr merge 3 --squash", "git push origin HEAD:main"]) {
      const before = run(guard, payload("claude", command));
      expect(said("claude", before).kind, command).toBe("refuse");
      expect(run(guard, payload("claude", command), ON), command).toEqual(before);
    }
    expect(heldLines()).toEqual([]);
  });
});

describe("the held list's write", () => {
  // TEST CHANGE, justified (review/18, sign-off S25): each unwritten case now pins the sentence that does not claim the
  // held list, where it only pinned a refusal; the refusal itself is unchanged.
  /** The refusal that does not claim the held list, for the act and rule the same call's attended ask names. */
  function notHeld(guard: string, command: string): Said {
    const asked = said("claude", run(guard, payload("claude", command)));
    expect(asked.kind).toBe("ask");
    const { act, rule } = askedAct(asked.kind === "ask" ? asked.reason : "");
    return { kind: "refuse", reason: heldReason(act, rule, false) };
  }

  it.skipIf(NO_LINKS)("follows no link at its path: the target stays as it was, and the call is still refused", async () => {
    const guard = await placeGuard("claude", { "outside.txt": "keep\n" });
    symlinkSync(getRepo().path("outside.txt"), getRepo().path(...AWAY_HELD_FILE.split("/")));
    expect(said("claude", run(guard, payload("claude", "npm publish"), ON))).toEqual(notHeld(guard, "npm publish"));
    expect(readFileSync(getRepo().path("outside.txt"), "utf8")).toBe("keep\n");
  });

  it("still refuses when a folder stands at its path, and does not claim the held list", async () => {
    const guard = await placeGuard("claude");
    mkdirSync(getRepo().path(...AWAY_HELD_FILE.split("/")), { recursive: true });
    expect(said("claude", run(guard, payload("claude", "npm publish"), ON))).toEqual(notHeld(guard, "npm publish"));
  });

  it.skipIf(NO_MODE_BITS)("still refuses when the state folder cannot be written, writes nothing, and does not claim the held list", async () => {
    const guard = await placeGuard("claude");
    const state = getRepo().path(".stamity");
    const expected = notHeld(guard, "npm publish");
    chmodSync(state, 0o555);
    try {
      expect(said("claude", run(guard, payload("claude", "npm publish"), ON))).toEqual(expected);
    } finally {
      chmodSync(state, 0o755);
    }
    expect(heldLines()).toEqual([]);
  });
});

describe("Copilot's portable runner while nobody is watching (REQ-FLOW-166)", () => {
  /** The runner where emission writes it, running `check.mjs`, whose stdout is `decision`; returns a run of it. */
  async function placeRunner(tool: Tool, decision: string): Promise<(env?: Record<string, string>, nodeArgs?: readonly string[]) => Answer> {
    await getRepo().seedFiles({
      [`.stamity/generated/hooks/${tool}/${PORTABLE_RUNNER_FILE}`]: buildPortableHookRunner(tool),
      "check.mjs": `process.stdout.write(${JSON.stringify(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: "Review first" } }))});\n`,
    });
    const runner = getRepo().path(".stamity", "generated", "hooks", tool, PORTABLE_RUNNER_FILE);
    const row = Buffer.from(JSON.stringify({ event: "pre_tool_use", command: [process.execPath, "check.mjs"] })).toString("base64url");
    return (env = {}, nodeArgs = []) => {
      const result = spawnSync(process.execPath, [...nodeArgs, runner, row], {
        input: JSON.stringify({ toolName: "bash", toolArgs: { command: "pwd" } }),
        encoding: "utf8",
        env: hookEnv(env),
        timeout: CHILD_TIMEOUT_MS,
      });
      return { status: result.status, stdout: String(result.stdout), stderr: String(result.stderr) };
    };
  }

  it("turns a hook's ask into a denial under the variable or the marker, and keeps it an ask with neither", async () => {
    const execute = await placeRunner("copilot", "ask");
    const decision = (answer: Answer): unknown => (JSON.parse(answer.stdout) as Record<string, unknown>).permissionDecision;
    const off = execute();
    expect(off.status).toBe(0);
    expect(decision(off)).toBe("ask");
    expect(decision(execute({ [NOBODY_WATCHING_VARIABLE]: "0" }))).toBe("ask");
    const on = execute(ON);
    expect(on.status).toBe(0);
    expect(JSON.parse(on.stdout)).toEqual({ permissionDecision: "deny", permissionDecisionReason: "Review first" });
    expect(on.stderr).toContain("nobody is watching");
    await getRepo().seedFiles({ [AWAY_MARKER_FILE]: "{}\n" });
    expect(decision(execute())).toBe("deny");
  });

  it("denies a hook's ask when the away marker cannot be looked for", async () => {
    const execute = await placeRunner("copilot", "ask");
    const decision = (answer: Answer): unknown => (JSON.parse(answer.stdout) as Record<string, unknown>).permissionDecision;
    // Non-degenerate: switch off and no marker, the ask stays an ask.
    expect(decision(execute())).toBe("ask");
    // review/17: a look-up fault counts as the marker present; a catch reading it as absent would keep the ask.
    const faulted = execute({}, markerFault());
    expect(faulted.status).toBe(0);
    expect(JSON.parse(faulted.stdout)).toEqual({ permissionDecision: "deny", permissionDecisionReason: "Review first" });
  });

  it.each(["allow", "deny"])("leaves a hook's %s as it was under the switch", async (verdict) => {
    const execute = await placeRunner("copilot", verdict);
    expect(execute(ON)).toEqual(execute());
    expect((JSON.parse(execute(ON).stdout) as Record<string, unknown>).permissionDecision).toBe(verdict);
  });

  it("changes no other client's runner: the switch is Copilot's alone there", () => {
    for (const tool of TOOLS.filter((name) => name !== "copilot")) {
      const content = buildPortableHookRunner(tool);
      expect(content, tool).not.toContain("nobodyWatching");
      expect(content, tool).not.toContain(NOBODY_WATCHING_VARIABLE);
    }
    expect(buildPortableHookRunner("copilot")).toContain(NOBODY_WATCHING_VARIABLE);
    expect(join(...AWAY_MARKER_FILE.split("/"))).toBe(join(".stamity", "away.json"));
  });
});
