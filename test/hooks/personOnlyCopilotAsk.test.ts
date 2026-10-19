/**
 * w4-copilot-ask (REQ-FLOW-123, REQ-FLOW-102): Copilot CLI asks the person for a person-only act its own agent runs.
 *
 * Measured on Copilot CLI 1.0.98 (2026-10-19): a main-thread `preToolUse` payload carries `sessionId`, `timestamp`,
 * `cwd`, `toolName` and `toolArgs` and nothing else; every helper's carries `agentId`, `agentType` and `parentAgentId`,
 * its `sessionId` its own; `sessionStart` fires for the main thread alone. So the guard asks only for a payload with no
 * helper field whose session id Copilot's session start recorded, in `stamity/copilot-main-sessions` under the
 * repository's common git directory, and refuses every other ask, handing the person the command.
 *
 * Run as a client runs them: the emitted session start and guard as real child processes in a scratch repository, the
 * payload on stdin, the scripts where emission writes them. No double stands in for anything: the git metadata, the
 * record and the run records are real files. Every ask has a refusal one fact away (the record, the id, a field).
 */
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { personOnlyVerdict } from "../../src/hooks/personOnly.ts";
import { PERSON_ONLY_GUARD_FILE, planCoreHookScripts } from "../../src/hooks/scripts.ts";
import { type Tool, TOOLS } from "../../src/types/core.ts";
import { useTempDir } from "../support/tempDir.ts";

const getRepo = useTempDir("copilot-ask");

/** The package and version the core scripts' CLI hints pin; a literal, so a renamed fork renders the same bytes. */
const CLI_PIN = { packageName: "@zomarit/stamity", version: "1.0.0-golden" };
const POLICY = "../../agent-tool-policies.json";
const SESSION_START = "stamity-session-start.mjs";
const WINDOWS = process.platform === "win32";
/** A process running as root reads a file whatever its mode, so an unreadable record cannot be made there. */
const ROOT_USER = typeof process.getuid === "function" && process.getuid() === 0;

/** The record's place under the common git directory, and its bounds, as the unit's interface names them. */
const RECORD = ["stamity", "copilot-main-sessions"] as const;
const RECORD_MAX_LINES = 200;
const RECORD_MAX_BYTES = 64 * 1024;
/** The lock beside the record, and its stated bounds: the session start waits 2 s, and breaks a lock older than 10 s. */
const LOCK = ["stamity", "copilot-main-sessions.lock"] as const;
const LOCK_WAIT_MS = 2_000;
const LOCK_STALE_MS = 10_000;

/** The reworded sentence Copilot adds to an ask the guard does not give it (w4, REQ-FLOW-123). */
const NO_CALLER =
  "Copilot CLI could not show that this call comes from the person's own agent (a helper agent's call, or a session its session start did not record), so the guard refuses it: give the person the exact command.";
const CANNOT_ASK = "This client cannot ask the person for a click, so the guard refuses it: give the person the exact command.";

const MERGE = "gh pr merge 1";
const merge = personOnlyVerdict(MERGE, { defaultBranches: [], currentBranch: "feat/x", tags: [] });
if (!merge.deny || !merge.ask) throw new Error("the merge is no ask-class person-only act");
/** The ask sentence the guard prints for the merge, the act as the verdict's own text. */
const ASKED = `${merge.act} is a person-only act (\`${merge.rule}\`): approve it to let the agent run it once (REQ-FLOW-102).`;

/** The main session id the cases record, Copilot's UUID shape. */
const MAIN = "8177e220-4c1d-4b52-9b7e-1f0a6d3c2e11";

/** Every script of one client's core set, the guard included, written where emission writes them under `root`. */
async function place(tool: Tool, root = ""): Promise<{ guard: string; start: string }> {
  const scripts = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, personOnlyGuard: true });
  const files: Record<string, string> = {};
  for (const script of scripts) files[join(root, ".stamity", "generated", "hooks", tool, script.fileName)] = script.content;
  if (root === "") files[".git/HEAD"] = "ref: refs/heads/feat/x\n";
  await getRepo().seedFiles(files);
  const at = (name: string): string => getRepo().path(root, ".stamity", "generated", "hooks", tool, name);
  return { guard: at(PERSON_ONLY_GUARD_FILE), start: at(SESSION_START) };
}

/** The environment a script runs under: the test's own, less the variables the scripts read. */
function hookEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.STAMITY_UNATTENDED;
  delete env.STAMITY_REPO_ROOT;
  return env;
}

/** Runs one script as a client does, the payload on stdin, the variables it reads under the test's control. */
function run(script: string, input: unknown): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [script], { input: JSON.stringify(input), encoding: "utf8", env: hookEnv() });
}

/** The same run without waiting for it: its exit code and the moment it closed, once it has. */
function runLater(script: string, input: unknown): Promise<{ status: number | null; closedAt: number }> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [script], { env: hookEnv(), stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", rejectRun);
    child.on("close", (status) => resolveRun({ status, closedAt: Date.now() }));
    child.stdin.end(JSON.stringify(input));
  });
}

/**
 * Copilot's main-thread `preToolUse` payload as the portable runner hands it on: Copilot's camelCase keys, plus the
 * interchange's `session_id`, `tool_name`, `tool_input` and `hook_event_name` (src/hooks/portableRunner.ts).
 */
function copilotCall(command: string, fields: Record<string, unknown> = {}, id: string = MAIN): Record<string, unknown> {
  return {
    sessionId: id,
    timestamp: 1_760_861_454_000,
    cwd: getRepo().dir,
    toolName: "bash",
    toolArgs: JSON.stringify({ command, description: "x" }),
    session_id: id,
    tool_name: "Bash",
    tool_input: { command, description: "x" },
    hook_event_name: "PreToolUse",
    ...fields,
  };
}

/** Copilot's `sessionStart` payload through the runner. */
function copilotStart(id: string): Record<string, unknown> {
  return { sessionId: id, timestamp: 1, cwd: getRepo().dir, source: "new", initialPrompt: "hi", session_id: id, hook_event_name: "SessionStart" };
}

/** The record's path under the scratch repository's own `.git`. */
const recordPath = (gitDir = ".git"): string => getRepo().path(gitDir, ...RECORD);
/** The lock's path beside it. */
const lockPath = (): string => getRepo().path(".git", ...LOCK);

/** The lock as another session start holds it: its own token inside. */
function holdLock(token = "4242.1\n"): void {
  mkdirSync(getRepo().path(".git", LOCK[0]), { recursive: true });
  writeFileSync(lockPath(), token, { flag: "wx", mode: 0o600 });
}

/** The record, its lines written as the session start writes them. */
function writeRecord(lines: readonly string[], gitDir = ".git"): void {
  mkdirSync(getRepo().path(gitDir, RECORD[0]), { recursive: true });
  writeFileSync(recordPath(gitDir), lines.map((line) => `${line}\n`).join(""));
}

/** Copilot's stdout, byte for byte. */
const asks = (reason: string): string => `${JSON.stringify({ permissionDecision: "ask", permissionDecisionReason: reason })}\n`;
const denies = (reason: string): string => `${JSON.stringify({ permissionDecision: "deny", permissionDecisionReason: reason })}\n`;

/** Copilot's answer to one call: its exit, its stderr and its stdout. */
function copilotAnswer(guard: string, input: unknown): string {
  const result = run(guard, input);
  expect(result.status).toBe(0);
  expect(String(result.stderr)).toBe("");
  return String(result.stdout);
}

describe("Copilot CLI's ask, attended (w4-copilot-ask, REQ-FLOW-123)", () => {
  it("asks for a main-thread call whose session id the record holds, and refuses the same call with no record", async () => {
    const { guard } = await place("copilot");
    // Non-degenerate: the same call, no record yet, is refused with the reworded sentence.
    expect(copilotAnswer(guard, copilotCall(MERGE))).toBe(denies(`${ASKED} ${NO_CALLER}`));
    writeRecord([MAIN]);
    expect(copilotAnswer(guard, copilotCall(MERGE))).toBe(asks(ASKED));
    // The id read from either spelling alone: Copilot's own, or the runner's.
    const { session_id: _runner, ...native } = copilotCall(MERGE);
    expect(copilotAnswer(guard, native)).toBe(asks(ASKED));
    const { sessionId: _native, ...renamed } = copilotCall(MERGE);
    expect(copilotAnswer(guard, renamed)).toBe(asks(ASKED));
    // The two spellings disagreeing is no proof.
    expect(copilotAnswer(guard, copilotCall(MERGE, { session_id: "other" }))).toBe(denies(`${ASKED} ${NO_CALLER}`));
  });

  it("refuses each helper field alone, with the id recorded, saying why", async () => {
    const { guard } = await place("copilot");
    writeRecord([MAIN]);
    expect(copilotAnswer(guard, copilotCall(MERGE))).toBe(asks(ASKED));
    for (const name of ["agentId", "agent_id", "agentType", "agent_type", "parentAgentId", "parent_agent_id", "subagentType", "subagent_type", "subagent_id"]) {
      for (const value of ["05f04540", ""]) {
        const answer = JSON.parse(copilotAnswer(guard, copilotCall(MERGE, { [name]: value }))) as Record<string, string>;
        expect(answer.permissionDecision, `${name}=${JSON.stringify(value)}`).toBe("deny");
        expect(answer.permissionDecisionReason, name).toContain(NO_CALLER);
      }
    }
    // A helper as 1.0.98 sends it: its own session id, recorded or not, and its three fields.
    const helper = { agentId: "05f04540", agentType: "task", parentAgentId: MAIN };
    expect(copilotAnswer(guard, copilotCall(MERGE, helper, "05f04540"))).toContain(NO_CALLER);
    writeRecord([MAIN, "05f04540"]);
    expect(copilotAnswer(guard, copilotCall(MERGE, helper, "05f04540"))).toContain(NO_CALLER);
  });

  it("refuses an id the record does not hold, and a line that is not the id whole", async () => {
    const { guard } = await place("copilot");
    writeRecord(["c948cf37-0000-4000-8000-000000000000"]);
    expect(copilotAnswer(guard, copilotCall(MERGE))).toBe(denies(`${ASKED} ${NO_CALLER}`));
    // A line with extra spaces, a prefix or a longer id: no match.
    for (const line of [` ${MAIN}`, `${MAIN} `, MAIN.slice(0, 8), `${MAIN}0`]) {
      writeRecord([line]);
      expect(copilotAnswer(guard, copilotCall(MERGE)), JSON.stringify(line)).toBe(denies(`${ASKED} ${NO_CALLER}`));
    }
    // A malformed line beside the id spoils the record, which then refuses.
    writeRecord([MAIN, "not an id"]);
    expect(copilotAnswer(guard, copilotCall(MERGE))).toBe(denies(`${ASKED} ${NO_CALLER}`));
    // No session id at all, or an id the record could not hold.
    const { sessionId: _a, session_id: _b, ...anonymous } = copilotCall(MERGE);
    writeRecord([MAIN]);
    expect(copilotAnswer(guard, anonymous)).toBe(denies(`${ASKED} ${NO_CALLER}`));
    expect(copilotAnswer(guard, copilotCall(MERGE, {}, `${MAIN}\n${MAIN}`))).toBe(denies(`${ASKED} ${NO_CALLER}`));
  });

  it("refuses with an oversized record, and asks with the same id under the bound", async () => {
    const { guard } = await place("copilot");
    const filler = Array.from({ length: Math.ceil(RECORD_MAX_BYTES / 37) }, (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
    writeRecord([...filler, MAIN]);
    expect(statSync(recordPath()).size).toBeGreaterThan(RECORD_MAX_BYTES);
    expect(copilotAnswer(guard, copilotCall(MERGE))).toBe(denies(`${ASKED} ${NO_CALLER}`));
    writeRecord([...filler.slice(0, 100), MAIN]);
    expect(copilotAnswer(guard, copilotCall(MERGE))).toBe(asks(ASKED));
  });

  it.skipIf(WINDOWS || ROOT_USER)("refuses with an unreadable record", async () => {
    const { guard } = await place("copilot");
    writeRecord([MAIN]);
    expect(copilotAnswer(guard, copilotCall(MERGE))).toBe(asks(ASKED));
    chmodSync(recordPath(), 0o000);
    try {
      expect(copilotAnswer(guard, copilotCall(MERGE))).toBe(denies(`${ASKED} ${NO_CALLER}`));
    } finally {
      chmodSync(recordPath(), 0o600);
    }
  });

  it.skipIf(WINDOWS)("refuses with a record that is a link, or under a linked folder", async () => {
    const { guard } = await place("copilot");
    await getRepo().seedFiles({ "elsewhere/copilot-main-sessions": `${MAIN}\n` });
    mkdirSync(getRepo().path(".git", RECORD[0]), { recursive: true });
    symlinkSync(getRepo().path("elsewhere", "copilot-main-sessions"), recordPath());
    expect(copilotAnswer(guard, copilotCall(MERGE))).toBe(denies(`${ASKED} ${NO_CALLER}`));
    // The folder itself a link to one holding the id.
    rmSync(getRepo().path(".git", RECORD[0]), { recursive: true });
    symlinkSync(getRepo().path("elsewhere"), getRepo().path(".git", RECORD[0]));
    expect(copilotAnswer(guard, copilotCall(MERGE))).toBe(denies(`${ASKED} ${NO_CALLER}`));
    // Non-degenerate: the same id in a real record asks.
    rmSync(getRepo().path(".git", RECORD[0]));
    writeRecord([MAIN]);
    expect(copilotAnswer(guard, copilotCall(MERGE))).toBe(asks(ASKED));
  });

  it("refuses a deletion and a force push from the recorded main session, as before", async () => {
    const { guard } = await place("copilot");
    writeRecord([MAIN]);
    for (const command of ["git push --force origin main", "git push origin --delete feat/old"]) {
      const verdict = personOnlyVerdict(command, { defaultBranches: [], currentBranch: "feat/x", tags: [] });
      if (!verdict.deny || verdict.ask) throw new Error(`${command} is no refuse-class act`);
      const told = `${verdict.act} deletes, force-pushes or cannot be undone (\`${verdict.rule}\`): it stays the person's to run, even with approval (REQ-FLOW-124). Give the person the exact command.`;
      expect(copilotAnswer(guard, copilotCall(command)), command).toBe(denies(told));
    }
  });

  it("refuses the recorded main session's ask-class act while a run is unattended, unchanged", async () => {
    const { guard } = await place("copilot");
    writeRecord([MAIN]);
    await getRepo().seedFiles({
      ".stamity/runs/2026-10-18_x/record.md": "# Run\n\nStatus: in progress\nPlan: docs/plans/x.md\nMode: unattended\nInvocation: /st-work x\n",
    });
    const why = "This session is unattended because .stamity/runs/2026-10-18_x/record.md reads `Status: in progress` and `Mode: unattended`.";
    const morning = `${merge.act} is a person-only act (\`${merge.rule}\`) and this run is unattended: list it on the morning list, whose walk runs it after one click.`;
    expect(copilotAnswer(guard, copilotCall(MERGE))).toBe(denies(`${morning} ${why}`));
  });

  it("asks for each of two main sessions started one after the other", async () => {
    const { guard, start } = await place("copilot");
    const second = "c948cf37-1111-4111-8111-111111111111";
    expect(run(start, copilotStart(MAIN)).status).toBe(0);
    expect(run(start, copilotStart(second)).status).toBe(0);
    expect(copilotAnswer(guard, copilotCall(MERGE))).toBe(asks(ASKED));
    expect(copilotAnswer(guard, copilotCall(MERGE, {}, second))).toBe(asks(ASKED));
    // A third, never started, is still refused.
    expect(copilotAnswer(guard, copilotCall(MERGE, {}, "9cef4f65-2222-4222-8222-222222222222"))).toBe(denies(`${ASKED} ${NO_CALLER}`));
  });

  it("reads the common git directory's record from a linked worktree", async () => {
    // The main checkout's .git holds the common dir; the lane's .git file points at its own git dir, whose commondir
    // names the common one, as `git worktree add` lays them out.
    await getRepo().seedFiles({
      "main/.git/HEAD": "ref: refs/heads/main\n",
      "main/.git/worktrees/lane/HEAD": "ref: refs/heads/feat/x\n",
      "main/.git/worktrees/lane/commondir": "../..\n",
    });
    await getRepo().seedFiles({ "lane/.git": `gitdir: ${getRepo().path("main", ".git", "worktrees", "lane")}\n` });
    const { guard, start } = await place("copilot", "lane");
    const call = { ...copilotCall(MERGE), cwd: getRepo().path("lane") };
    expect(copilotAnswer(guard, call)).toBe(denies(`${ASKED} ${NO_CALLER}`));
    expect(run(start, { ...copilotStart(MAIN), cwd: getRepo().path("lane") }).status).toBe(0);
    expect(readFileSync(getRepo().path("main", ".git", ...RECORD), "utf8")).toBe(`${MAIN}\n`);
    expect(existsSync(getRepo().path("main", ".git", "worktrees", "lane", RECORD[0]))).toBe(false);
    expect(copilotAnswer(guard, call)).toBe(asks(ASKED));
  });
});

describe("the other clients' answers to an ask (w4-copilot-ask)", () => {
  /** Claude Code's payload for the merge, with the given fields beside it. */
  const claudeCall = (fields: Record<string, unknown> = {}): Record<string, unknown> => ({
    hook_event_name: "PreToolUse",
    session_id: MAIN,
    tool_name: "Bash",
    tool_input: { command: MERGE },
    ...fields,
  });
  const bySubAgent = `${merge.act} is a person-only act (\`${merge.rule}\`) and a sub-agent runs it: the act is the person's, so only the main thread may ask for it (REQ-FLOW-102). Give the person the exact command.`;

  it("keeps Claude Code's ask byte for byte, and reads agentId or parent_tool_call_id alone as a helper's", async () => {
    const { guard } = await place("claude");
    const ask = run(guard, claudeCall());
    expect(ask.status).toBe(0);
    expect(String(ask.stdout)).toBe(
      `${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: ASKED } })}\n`,
    );
    expect(String(ask.stderr)).toBe("");
    for (const fields of [{ agentId: "a1" }, { parent_tool_call_id: "toolu_1" }, { parentAgentId: "p1" }, { parent_agent_id: "p1" }, { agent_id: "a1" }]) {
      const result = run(guard, claudeCall(fields));
      expect(result.status, JSON.stringify(fields)).toBe(2);
      expect(String(result.stdout), JSON.stringify(fields)).toBe("");
      expect(String(result.stderr), JSON.stringify(fields)).toBe(`stamity person-only guard: ${bySubAgent}\n`);
    }
    // A recorded Copilot id changes nothing on Claude Code, and its session start records none.
    writeRecord([MAIN]);
    expect(String(run(guard, claudeCall({ agentId: "a1" })).stderr)).toBe(`stamity person-only guard: ${bySubAgent}\n`);
  });

  it.each(["cursor", "codex"] as const)("keeps %s's refusal with the cannot-ask sentence, a recorded id or not", async (tool) => {
    const { guard } = await place(tool);
    writeRecord([MAIN]);
    const input =
      tool === "cursor"
        ? { hook_event_name: "beforeShellExecution", command: MERGE, cwd: ".", sessionId: MAIN, session_id: MAIN }
        : claudeCall();
    const result = run(guard, input);
    if (tool === "cursor") {
      expect(result.status).toBe(0);
      const told = `${ASKED} ${CANNOT_ASK}`;
      expect(String(result.stdout)).toBe(`${JSON.stringify({ permission: "deny", user_message: told, agent_message: told })}\n`);
    } else {
      expect(result.status).toBe(2);
      expect(String(result.stderr)).toBe(`stamity person-only guard: ${ASKED} ${CANNOT_ASK}\n`);
    }
  });
});

describe("Copilot's session start keeps the record (w4-copilot-ask)", () => {
  it("writes the main session's id owner-only, appends the next, and keeps the last 200 lines", async () => {
    const { start } = await place("copilot");
    expect(existsSync(recordPath())).toBe(false);
    const first = run(start, copilotStart(MAIN));
    expect(first.status).toBe(0);
    expect(String(first.stdout)).toContain("stamity");
    expect(readFileSync(recordPath(), "utf8")).toBe(`${MAIN}\n`);
    if (!WINDOWS) expect(statSync(recordPath()).mode & 0o777).toBe(0o600);
    expect(run(start, copilotStart("second-id")).status).toBe(0);
    expect(readFileSync(recordPath(), "utf8")).toBe(`${MAIN}\nsecond-id\n`);
    // Native camelCase alone, as a run without the runner sends it.
    expect(run(start, { sessionId: "third-id", source: "new" }).status).toBe(0);
    expect(readFileSync(recordPath(), "utf8")).toBe(`${MAIN}\nsecond-id\nthird-id\n`);
    // At the cap the oldest line goes.
    const full = Array.from({ length: RECORD_MAX_LINES }, (_, n) => `id-${n}`);
    writeRecord(full);
    expect(run(start, copilotStart("newest")).status).toBe(0);
    const lines = readFileSync(recordPath(), "utf8").split("\n");
    expect(lines.pop()).toBe("");
    expect(lines).toEqual([...full.slice(1), "newest"]);
  });

  it("writes nothing for a payload with no usable session id, and leaves a linked record alone", async () => {
    const { start } = await place("copilot");
    for (const input of [{ source: "new" }, { sessionId: "", source: "new" }, { sessionId: "a b", source: "new" }, { sessionId: 7 }]) {
      expect(run(start, input).status, JSON.stringify(input)).toBe(0);
      expect(existsSync(recordPath()), JSON.stringify(input)).toBe(false);
    }
    if (WINDOWS) return;
    await getRepo().seedFiles({ "elsewhere/target": "kept\n" });
    mkdirSync(getRepo().path(".git", RECORD[0]), { recursive: true });
    symlinkSync(getRepo().path("elsewhere", "target"), recordPath());
    expect(run(start, copilotStart(MAIN)).status).toBe(0);
    expect(lstatSync(recordPath()).isSymbolicLink()).toBe(true);
    expect(readFileSync(getRepo().path("elsewhere", "target"), "utf8")).toBe("kept\n");
  });

  it.each(TOOLS.filter((tool) => tool !== "copilot"))("%s's session start writes no record", async (tool) => {
    const { start } = await place(tool);
    const result = run(start, { ...copilotStart(MAIN), session_id: MAIN });
    expect(result.status).toBe(0);
    expect(existsSync(getRepo().path(".git", RECORD[0]))).toBe(false);
    // Non-degenerate: Copilot's, in the same repository with the same payload, does write one.
    expect(run((await place("copilot")).start, copilotStart(MAIN)).status).toBe(0);
    expect(readFileSync(recordPath(), "utf8")).toBe(`${MAIN}\n`);
  });
});

describe("Copilot's session start updates the record under a lock (n5-copilot-record-lock, REQ-FLOW-123)", () => {
  it("waits while another session start holds the lock, and records once it is released", async () => {
    const { start } = await place("copilot");
    holdLock();
    const started = Date.now();
    const finished = runLater(start, copilotStart(MAIN));
    // Held well inside the wait: the start has not recorded while the other writer holds the lock.
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    expect(existsSync(recordPath())).toBe(false);
    const released = Date.now();
    rmSync(lockPath());
    const { status, closedAt } = await finished;
    expect(status).toBe(0);
    expect(closedAt).toBeGreaterThanOrEqual(released);
    expect(closedAt - started).toBeLessThan(LOCK_WAIT_MS + 5_000);
    expect(readFileSync(recordPath(), "utf8")).toBe(`${MAIN}\n`);
    // Its own lock is gone after it, and no temp file stays beside the record.
    expect(readdirSync(getRepo().path(".git", RECORD[0]))).toEqual([RECORD[1]]);
  });

  it("leaves the record as it was when the lock stays held past the wait", async () => {
    const { start } = await place("copilot");
    const earlier = "c948cf37-1111-4111-8111-111111111111";
    writeRecord([earlier]);
    holdLock();
    const started = Date.now();
    expect(run(start, copilotStart(MAIN)).status).toBe(0);
    expect(Date.now() - started).toBeGreaterThanOrEqual(LOCK_WAIT_MS);
    expect(readFileSync(recordPath(), "utf8")).toBe(`${earlier}\n`);
    // The other writer's lock is neither broken nor removed: it is younger than the stale age.
    expect(readFileSync(lockPath(), "utf8")).toBe("4242.1\n");
    // Non-degenerate: released, the same start records.
    rmSync(lockPath());
    expect(run(start, copilotStart(MAIN)).status).toBe(0);
    expect(readFileSync(recordPath(), "utf8")).toBe(`${earlier}\n${MAIN}\n`);
  });

  it("breaks a lock older than the stale age, a start that died holding it, and records", async () => {
    const { start } = await place("copilot");
    holdLock();
    const dead = new Date(Date.now() - LOCK_STALE_MS - 60_000);
    utimesSync(lockPath(), dead, dead);
    const started = Date.now();
    expect(run(start, copilotStart(MAIN)).status).toBe(0);
    expect(Date.now() - started).toBeLessThan(LOCK_WAIT_MS);
    expect(readFileSync(recordPath(), "utf8")).toBe(`${MAIN}\n`);
    expect(existsSync(lockPath())).toBe(false);
  });

  it("records both ids when two session starts run at once, every time", async () => {
    const { start } = await place("copilot");
    const ids = ["c948cf37-1111-4111-8111-111111111111", "9cef4f65-2222-4222-8222-222222222222"] as const;
    for (let round = 0; round < 12; round += 1) {
      rmSync(getRepo().path(".git", RECORD[0]), { recursive: true, force: true });
      // oxlint-disable-next-line no-await-in-loop -- each round starts over the record the previous one was read from
      const results = await Promise.all(ids.map((id) => runLater(start, copilotStart(id))));
      expect(results.map((result) => result.status), `round ${round}`).toEqual([0, 0]);
      const lines = readFileSync(recordPath(), "utf8").split("\n").filter((line) => line !== "");
      expect(lines.toSorted(), `round ${round}`).toEqual(ids.toSorted());
      expect(readdirSync(getRepo().path(".git", RECORD[0])), `round ${round}`).toEqual([RECORD[1]]);
    }
  });

  it("records nothing with a folder or a link at the lock's path, and leaves both alone", async () => {
    const { start } = await place("copilot");
    mkdirSync(lockPath(), { recursive: true });
    expect(run(start, copilotStart(MAIN)).status).toBe(0);
    expect(existsSync(recordPath())).toBe(false);
    expect(lstatSync(lockPath()).isDirectory()).toBe(true);
    if (WINDOWS) return;
    rmSync(lockPath(), { recursive: true });
    await getRepo().seedFiles({ "elsewhere/target": "kept\n" });
    symlinkSync(getRepo().path("elsewhere", "target"), lockPath());
    expect(run(start, copilotStart(MAIN)).status).toBe(0);
    expect(existsSync(recordPath())).toBe(false);
    expect(lstatSync(lockPath()).isSymbolicLink()).toBe(true);
    expect(readFileSync(getRepo().path("elsewhere", "target"), "utf8")).toBe("kept\n");
    // A dangling link is no free path either.
    rmSync(getRepo().path("elsewhere", "target"));
    expect(run(start, copilotStart(MAIN)).status).toBe(0);
    expect(existsSync(recordPath())).toBe(false);
    // Non-degenerate: the path cleared, the same start records.
    rmSync(lockPath());
    expect(run(start, copilotStart(MAIN)).status).toBe(0);
    expect(readFileSync(recordPath(), "utf8")).toBe(`${MAIN}\n`);
  });
});
