import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import * as hookRuns from "../../scripts/qa/hook-runs.mjs";

/**
 * REQ-PROVE-040, REQ-FLOW-113 and REQ-FLOW-104 (plan 021 file 2, unit v13-client-legs): the command
 * line of `scripts/qa/hook-runs.mjs`. Its hook mode is what the nightly `hook-fire` job runs, and
 * `--require-observation` turns a run whose hook recorded nothing red. Its `--ask` mode repeats, per
 * installed client, the measurement of how a client answers a hook's `ask` in its permissive mode.
 *
 * No case drives a real client (inline mock reason: a client run needs the person's account and the
 * machine lock, and costs a model turn). The hook mode's client runs are injected as finished rows;
 * the `--ask` mode's client is a fake `spawn` that does what a client does with the throwaway folder
 * the module really builds: it runs the hook script the module wrote with the payload that client
 * sends, reads the answer in that client's dialect, and then honours the ask, ignores it, or never
 * consults the hook. The folder, the hook, its configuration and the verdict are all real.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "stamity-qa-hookruns-cli-"));
  temps.push(dir);
  return dir;
}

/**
 * `elsewhere` is the model a `-p` run denies the marked shell call, which then makes the marker with
 * a file tool; `unseen` makes the marker with no hook consulted at all.
 */
type Behaviour = "honours" | "ignores" | "silent" | "elsewhere" | "unseen";

interface FakeRun {
  cwd: string;
  binary: string;
  args: readonly string[];
  env: Record<string, string | undefined>;
  answer: string | undefined;
}

/** The main session's id and a helper's, as Copilot CLI 1.0.98 sent them (reports/w4-measure-r1.md, P1). */
const MAIN_SESSION = "8177e220-main";
const HELPER_SESSION = "05f04540-helper";

/** A Copilot CLI tool-call payload, its keys as measured on 1.0.98 for the main agent. */
function copilotCall(toolName: string, toolArgs: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ sessionId: MAIN_SESSION, timestamp: 1, cwd: ".", toolName, toolArgs: JSON.stringify(toolArgs), ...extra });
}

/** The payload each client hands its pre-shell hook, carrying the marked command. */
function payloadFor(client: string): string {
  const command = hookRuns.ASK_COMMAND as string;
  if (client === "claude") return JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
  if (client === "cursor") return JSON.stringify({ hook_event_name: "beforeShellExecution", command, cwd: "." });
  return copilotCall("bash", { command });
}

/** A file-tool call writing the marker, in each client's payload; Cursor's pre-shell hook sees no file tool. */
function writePayloadFor(client: string): string | undefined {
  const file = hookRuns.ASK_MARKER as string;
  if (client === "claude") return JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: file, content: "" } });
  if (client === "copilot") return copilotCall("create", { path: file });
  return undefined;
}

/** One hook call a fake Copilot makes before the marked one: the event the hook is wired for and its payload. */
type CopilotStep = readonly [event: "sessionStart" | "preToolUse", payload: string];

/**
 * What Copilot CLI 1.0.98 hands its hooks before the marked call when the prompt has one step go to a helper
 * (reports/w4-measure-r1.md, F1 to F3): one `sessionStart` for the main session, the main agent's `task` call, and
 * the helper's shell call carrying `agentId`, `agentType` and `parentAgentId` under its own session id.
 */
const MEASURED_COPILOT: readonly CopilotStep[] = [
  ["sessionStart", JSON.stringify({ sessionId: MAIN_SESSION, timestamp: 1, cwd: ".", source: "new", initialPrompt: hookRuns.ASK_COPILOT_PROMPT })],
  ["preToolUse", copilotCall("task", { agent_type: "task", prompt: "echo qa-helper" })],
  [
    "preToolUse",
    copilotCall("bash", { command: "echo qa-helper" }, { sessionId: HELPER_SESSION, agentId: HELPER_SESSION, agentType: "task", parentAgentId: MAIN_SESSION }),
  ],
];

/** Whether the client's configuration sends a file-tool call to the hook: Claude Code by its matcher, Copilot always. */
function hooksFileTool(client: string, config: string): boolean {
  if (client === "copilot") return true;
  if (client !== "claude") return false;
  const parsed = JSON.parse(config) as { hooks: { PreToolUse: { matcher?: string }[] } };
  const matcher = parsed.hooks.PreToolUse[0]?.matcher ?? "";
  return matcher === "" || matcher === "*" || new RegExp(`^(?:${matcher})$`).test("Write");
}

/** The decision a hook's stdout carries, read the way that client reads it. */
function decisionOf(client: string, stdout: string): string | undefined {
  const line = stdout.trim();
  if (line === "") return undefined;
  const answer = JSON.parse(line) as Record<string, unknown>;
  if (client === "claude") return (answer["hookSpecificOutput"] as Record<string, unknown>)["permissionDecision"] as string;
  if (client === "cursor") return answer["permission"] as string;
  return answer["permissionDecision"] as string;
}

/**
 * A fake client (inline mock reason above): with `honours` it holds the command when the hook asks,
 * with `ignores` it runs it whatever the hook said, and `silent` never consults the hook and runs nothing.
 * `elsewhere` holds the asked shell call, then writes the marker with a file tool: through the hook,
 * holding an ask, where the configuration hooks that tool, else unseen. `unseen` writes the marker
 * and never consults the hook. A fake Copilot first hands its hooks `copilotSteps` (n3-copilot-remeasure:
 * by default the measured session start, main call and helper call), each through the entry wired for its event.
 */
function fakeClient(client: string, behaviour: Behaviour, runs: FakeRun[], copilotSteps: readonly CopilotStep[] = MEASURED_COPILOT) {
  return (binary: string, args: readonly string[], options: { cwd: string; env: Record<string, string | undefined> }) => {
    const run: FakeRun = { cwd: options.cwd, binary, args, env: options.env, answer: undefined };
    runs.push(run);
    if (behaviour === "silent") return { status: 0, signal: null, stdout: "", stderr: "" };
    const marker = join(options.cwd, hookRuns.ASK_MARKER as string);
    if (behaviour === "unseen") {
      writeFileSync(marker, "");
      return { status: 0, signal: null, stdout: "done\n", stderr: "" };
    }
    const config = readFileSync(join(options.cwd, hookRuns.ASK_CONFIG_PATHS[client] as string), "utf8");
    expect(config, "the client's config names the hook the module wrote").toContain(hookRuns.ASK_HOOK_FILE);
    // Copilot's entries name the event after the hook's path, as the module wires them; the others pass none.
    const consult = (input: string, event?: string): string | undefined => {
      if (client === "copilot") {
        const entries = (JSON.parse(config) as { hooks: Record<string, { bash: string }[]> }).hooks[event ?? "preToolUse"];
        expect(entries?.[0]?.bash, `Copilot's ${event ?? "preToolUse"} entry`).toMatch(new RegExp(` ${event ?? "preToolUse"}$`));
      }
      const argv = [join(options.cwd, hookRuns.ASK_HOOK_FILE as string), ...(client === "copilot" ? [event ?? "preToolUse"] : [])];
      const hook = spawnSync(process.execPath, argv, { cwd: options.cwd, input, encoding: "utf8" });
      expect(hook.status, hook.stderr).toBe(0);
      return decisionOf(client, hook.stdout);
    };
    if (client === "copilot") {
      for (const [event, payload] of copilotSteps) {
        // A session start or an unmarked call is never asked about.
        expect(consult(payload, event), event).toBeUndefined();
      }
    }
    run.answer = consult(payloadFor(client));
    if (behaviour === "elsewhere") {
      const write = writePayloadFor(client);
      const held = write !== undefined && hooksFileTool(client, config) && consult(write) === "ask";
      if (!held) writeFileSync(marker, "");
    } else if (behaviour === "ignores" || run.answer !== "ask") {
      writeFileSync(marker, "");
    }
    return { status: 0, signal: null, stdout: "done\n", stderr: "" };
  };
}

const present = () => ({ present: true, version: "fake 1.0.0" });

const notOnPath = (binary: string) => ({ present: false, reason: `${binary}: not on PATH (ENOENT)` });

function measureWith(
  behaviour: Behaviour,
  runs: FakeRun[],
  baseDir = scratch(),
  probe: (binary: string) => unknown = present,
  copilotSteps: readonly CopilotStep[] = MEASURED_COPILOT,
) {
  return ({ client }: { client: string }) =>
    hookRuns.measureAsk({ client, baseDir, spawn: fakeClient(client, behaviour, runs, copilotSteps), probe });
}

function mainWith(argv: readonly string[], deps: Record<string, unknown>): { code: number; lines: string[] } {
  const lines: string[] = [];
  const code = hookRuns.main(argv, { print: (line: string) => lines.push(line), ...deps }) as number;
  return { code, lines };
}

describe("verdictForAsk — what one client run says about the ask", () => {
  // TEST CHANGE, justified (review/41, run 2026-10-18_cloud-runs-2): the hook's log now records whether a
  // call was a shell call, and `ran` needs an ask on a marked shell call. The observations below gain
  // `shell: true`, and a marker with no such line, which this case read as `ran`, reads `not-run`: a
  // marker no shell ask preceded came by a route the hook did not see.
  it("reads a marker after a shell ask as ran, a shell ask with no marker as held, and anything else as not-run", () => {
    const asked = [{ marked: true, shell: true }];
    expect(hookRuns.verdictForAsk({ client: "claude", markerCreated: true, observations: asked }).status).toBe("ran");
    expect(hookRuns.verdictForAsk({ client: "claude", markerCreated: false, observations: asked }).status).toBe("held");
    // No ask was answered and nothing ran: nothing about the ask was measured, which is never `held`.
    expect(hookRuns.verdictForAsk({ client: "claude", markerCreated: false, observations: [{ marked: false, shell: true }] }).status).toBe("not-run");
    expect(hookRuns.verdictForAsk({ client: "claude", markerCreated: false, observations: [] }).status).toBe("not-run");
    // A marker with no shell ask in the log: the hook never saw the call that made it.
    for (const observations of [[], [{ marked: true, shell: false }], [{ marked: true }], [{ marked: false, shell: true }]]) {
      const unasked = hookRuns.verdictForAsk({ client: "copilot", markerCreated: true, observations });
      expect(unasked.status, JSON.stringify(observations)).toBe("not-run");
      expect(unasked.reason).toContain("did not see");
    }
  });
});

describe("hook-runs --ask — each client's answer, measured in a throwaway folder", () => {
  // TEST CHANGE, justified (review/89, REQ-FLOW-123): this case read Claude Code and Copilot as ask-class, each red
  // on `ran`; review/89 left Claude Code alone here. TEST CHANGE, justified (w4-copilot-ask, REQ-FLOW-123): the guard
  // asks on Copilot again, for the main agent's call, so Copilot is ask-class once more and its `ran` is red.
  it("reports ran and exits non-zero when Claude Code or Copilot ran the marked command after the ask", () => {
    for (const client of ["claude", "copilot"] as const) {
      const runs: FakeRun[] = [];
      const { code, lines } = mainWith(["--ask", "--clients", client], { measureAsk: measureWith("ignores", runs) });
      expect(code, client).toBe(1);
      expect(runs, client).toHaveLength(1);
      // The hook really answered ask, in this client's own dialect, before the fake ran the command.
      expect(runs[0]?.answer, client).toBe("ask");
      expect(lines.join("\n"), client).toMatch(new RegExp(`^hook-runs --ask: ${client} \\(\\S+\\) ran — `, "m"));
    }
  });

  // TEST CHANGE, justified (review/89, REQ-FLOW-123): Copilot joined Cursor here. TEST CHANGE, justified
  // (w4-copilot-ask, REQ-FLOW-123): Copilot left again, since the guard asks there, so Cursor is the one client whose
  // `ran` is reported and exits 0.
  it("reports ran and exits 0 for Cursor, where the guard refuses rather than asks", () => {
    const runs: FakeRun[] = [];
    const { code, lines } = mainWith(["--ask", "--clients", "cursor"], { measureAsk: measureWith("ignores", runs) });
    expect(runs[0]?.answer).toBe("ask");
    expect(lines[0]).toContain("cursor (--force) ran");
    expect(code).toBe(0);
  });

  it("reports held and exits 0 when every client holds the ask", () => {
    const runs: FakeRun[] = [];
    const { code, lines } = mainWith(["--ask", "--clients", "claude,cursor,copilot"], { measureAsk: measureWith("honours", runs) });
    expect(code).toBe(0);
    expect(runs.map((run) => run.answer)).toEqual(["ask", "ask", "ask"]);
    expect(lines.map((line) => line.split(" — ")[0])).toEqual([
      "hook-runs --ask: claude (bypassPermissions) held",
      "hook-runs --ask: cursor (--force) held",
      "hook-runs --ask: copilot (allow-all) held",
    ]);
  });

  it("drives each client in its permissive mode, in a folder outside this checkout", () => {
    const runs: FakeRun[] = [];
    mainWith(["--ask", "--clients", "claude,cursor,copilot"], { measureAsk: measureWith("honours", runs) });
    const [claude, cursor, copilot] = runs;
    expect(claude?.args).toEqual(expect.arrayContaining(["-p", "--permission-mode", "bypassPermissions"]));
    expect(cursor?.binary).toBe("agent");
    expect(cursor?.args).toEqual(expect.arrayContaining(["--trust", "-p", "--force"]));
    expect(copilot?.args).toEqual(expect.arrayContaining(["-p", "--allow-all-tools"]));
    expect(copilot?.env["COPILOT_ALLOW_ALL"]).toBe("true");
    // TEST CHANGE, justified (n3-copilot-remeasure, REQ-PROVE-042): Copilot's prompt now hands one trivial step to a
    // helper before the ask, so the re-measure can see a helper's call; the asked command's sentence is unchanged
    // and ends Copilot's prompt, which is what this case now holds for it.
    expect(copilot?.args).toContain(hookRuns.ASK_COPILOT_PROMPT);
    expect(hookRuns.ASK_COPILOT_PROMPT).toMatch(new RegExp(`${hookRuns.ASK_PROMPT}$`));
    expect(hookRuns.ASK_COPILOT_PROMPT.split(hookRuns.ASK_MARKER as string), "the helper's step names no marker").toHaveLength(2);
    for (const run of runs) {
      expect(run.args, run.binary).toContain(run === copilot ? hookRuns.ASK_COPILOT_PROMPT : hookRuns.ASK_PROMPT);
      expect(run.args, run.binary).not.toContain("--bare");
      // Outside this checkout, by the script's own rule: across drives (Windows) `relative()` answers an absolute path.
      const rel = relative(REPO_ROOT, run.cwd);
      expect(rel.startsWith("..") || isAbsolute(rel), run.cwd).toBe(true);
      // The answer is read off the marker the command creates, so the folder starts without it.
      expect(existsSync(join(run.cwd, hookRuns.ASK_HOOK_FILE as string))).toBe(true);
    }
  });

  // ADDED (review/41): a `-p` run denies Claude Code's marked shell call, and a model that then writes
  // the marker with its Write tool must meet the hook there too, or the row reads a false `ran`.
  it("holds the ask when the model, denied the marked shell call, writes the marker with a file tool", () => {
    for (const client of ["claude", "copilot"]) {
      const runs: FakeRun[] = [];
      const { code, lines } = mainWith(["--ask", "--clients", client], { measureAsk: measureWith("elsewhere", runs) });
      expect(runs[0]?.answer, client).toBe("ask");
      expect(lines[0], client).toMatch(new RegExp(`^hook-runs --ask: ${client} \\(\\S+\\) held — `));
      expect(code, client).toBe(0);
    }
  });

  // ADDED (review/41): a marker the hook never saw being made says nothing about the ask.
  it("reports not-run, never ran, for a marker no shell ask preceded", () => {
    const { code, lines } = mainWith(["--ask", "--clients", "claude"], { measureAsk: measureWith("unseen", []) });
    expect(lines[0]).toContain("claude (bypassPermissions) not-run");
    expect(lines[0]).toContain("did not see");
    // An installed ask-class client that measured nothing is red by default (review/42).
    expect(code).toBe(1);
  });

  it("refuses a throwaway folder inside this checkout", () => {
    expect(() =>
      hookRuns.measureAsk({ client: "claude", baseDir: REPO_ROOT, spawn: fakeClient("claude", "honours", []), probe: present }),
    ).toThrow(/inside this repository/);
  });

  // TEST CHANGE, justified (review/42, run 2026-10-18_cloud-runs-2): an installed ask-class client whose
  // hook was never consulted measured nothing, and the release line reads the exit code, so the row is
  // red by default; this case expected exit 0 without --require-observation.
  it("reports not-run when the hook was never consulted, red for an installed ask-class client with or without --require-observation", () => {
    const runs: FakeRun[] = [];
    const quiet = mainWith(["--ask", "--clients", "claude"], { measureAsk: measureWith("silent", runs) });
    expect(quiet.lines[0]).toContain("claude (bypassPermissions) not-run");
    expect(quiet.code).toBe(1);
    expect(mainWith(["--ask", "--clients", "claude", "--require-observation"], { measureAsk: measureWith("silent", []) }).code).toBe(1);
    // Cursor is not ask-class: an unmeasured row is reported, never red. TEST CHANGE, justified (review/89,
    // REQ-FLOW-123): Copilot's silent row was red as ask-class, then was not. TEST CHANGE, justified (w4-copilot-ask,
    // REQ-FLOW-123): the guard asks on Copilot again, so its silent row is red again, with or without the flag.
    expect(mainWith(["--ask", "--clients", "cursor", "--require-observation"], { measureAsk: measureWith("silent", []) }).code).toBe(0);
    expect(mainWith(["--ask", "--clients", "copilot"], { measureAsk: measureWith("silent", []) }).code).toBe(1);
    expect(mainWith(["--ask", "--clients", "copilot", "--require-observation"], { measureAsk: measureWith("silent", []) }).code).toBe(1);
  });

  // ADDED (review/42): an absent binary is its own status, red only where every ask-class client must be installed.
  it("reports an absent client as not-installed, red only under --require-observation", () => {
    const runs: FakeRun[] = [];
    const plain = mainWith(["--ask", "--clients", "claude,copilot"], { measureAsk: measureWith("ignores", runs, scratch(), notOnPath) });
    expect(plain.lines.map((line) => line.split(" — ")[0])).toEqual([
      "hook-runs --ask: claude (bypassPermissions) not-installed",
      "hook-runs --ask: copilot (allow-all) not-installed",
    ]);
    expect(plain.code).toBe(0);
    const required = mainWith(["--ask", "--clients", "claude", "--require-observation"], { measureAsk: measureWith("ignores", runs, scratch(), notOnPath) });
    expect(required.code).toBe(1);
    // ADDED (w4-copilot-ask): Copilot, ask-class again, must be installed under the flag too.
    const copilot = mainWith(["--ask", "--clients", "copilot", "--require-observation"], { measureAsk: measureWith("ignores", runs, scratch(), notOnPath) });
    expect(copilot.code).toBe(1);
    expect(runs).toHaveLength(0);
  });

  // TEST CHANGE, justified (review/42): an absent binary reads `not-installed`, not `not-run`; Codex keeps `not-run`.
  it("spawns nothing for Codex or for a client that is not installed", () => {
    const runs: FakeRun[] = [];
    const codex = hookRuns.measureAsk({ client: "codex", baseDir: scratch(), spawn: fakeClient("codex", "ignores", runs), probe: present });
    expect(codex.status).toBe("not-run");
    expect(codex.reason).toMatch(/ask/);
    const absent = hookRuns.measureAsk({
      client: "claude",
      baseDir: scratch(),
      spawn: fakeClient("claude", "ignores", runs),
      probe: () => ({ present: false, reason: "claude: not on PATH (ENOENT)" }),
    });
    expect(absent).toMatchObject({ status: "not-installed", reason: "claude: not on PATH (ENOENT)" });
    expect(runs).toHaveLength(0);
  });

  it("writes every row to --out", () => {
    const out = join(scratch(), "evidence", "ask.json");
    const { code } = mainWith(["--ask", "--clients", "claude,copilot", "--out", out], { measureAsk: measureWith("honours", []) });
    expect(code).toBe(0);
    const written = JSON.parse(readFileSync(out, "utf8")) as { mode: string; rows: { client: string; status: string }[] };
    expect(written.mode).toBe("ask");
    expect(written.rows.map((row) => `${row.client} ${row.status}`)).toEqual(["claude held", "copilot held"]);
  });
});

/**
 * n3-copilot-remeasure (REQ-FLOW-123, REQ-PROVE-042; ledger rows review/151 and review/165): Copilot's row also
 * reads the three facts the guard's ask rests on from the hook's own log. The hook the module wrote is run with
 * each payload, so the log, its key names and session ids, and the verdict are all real.
 */
describe("hook-runs --ask — the facts Copilot CLI's ask rests on", () => {
  const facts = (line: string | undefined) => (line ?? "").match(/fact \d \S+/g);

  it("reads the three facts held on the measured shape, and exits 0 with and without --require-observation", () => {
    for (const argv of [["--ask", "--clients", "copilot"], ["--ask", "--clients", "copilot", "--require-observation"]]) {
      const { code, lines } = mainWith(argv, { measureAsk: measureWith("honours", []) });
      expect(lines[0]).toMatch(/^hook-runs --ask: copilot \(allow-all\) held — /);
      expect(facts(lines[0])).toEqual(["fact 1 held", "fact 2 held", "fact 3 held"]);
      expect(code, argv.join(" ")).toBe(0);
    }
  });

  it("turns red on a main call carrying a helper field, the fact named, with or without the flag", () => {
    const steps: CopilotStep[] = [MEASURED_COPILOT[0]!, ["preToolUse", copilotCall("task", {}, { agentId: MAIN_SESSION })], MEASURED_COPILOT[2]!];
    for (const argv of [["--ask", "--clients", "copilot"], ["--ask", "--clients", "copilot", "--require-observation"]]) {
      const { code, lines } = mainWith(argv, { measureAsk: measureWith("honours", [], scratch(), present, steps) });
      expect(facts(lines[0])).toContain("fact 1 changed");
      expect(lines[0]).toContain("agentId");
      expect(code, argv.join(" ")).toBe(1);
    }
  });

  it("turns red on a helper's call under the main session's id", () => {
    const steps: CopilotStep[] = [
      MEASURED_COPILOT[0]!,
      ["preToolUse", copilotCall("bash", { command: "echo qa-helper" }, { agentId: HELPER_SESSION, agentType: "task", parentAgentId: MAIN_SESSION })],
    ];
    const { code, lines } = mainWith(["--ask", "--clients", "copilot"], { measureAsk: measureWith("honours", [], scratch(), present, steps) });
    expect(facts(lines[0])).toContain("fact 2 changed");
    expect(code).toBe(1);
  });

  it("reads no helper's call as fact 2 not-observed, red only under --require-observation", () => {
    const steps = MEASURED_COPILOT.slice(0, 2);
    const plain = mainWith(["--ask", "--clients", "copilot"], { measureAsk: measureWith("honours", [], scratch(), present, steps) });
    expect(facts(plain.lines[0])).toEqual(["fact 1 held", "fact 2 not-observed", "fact 3 held"]);
    expect(plain.code).toBe(0);
    const required = mainWith(["--ask", "--clients", "copilot", "--require-observation"], { measureAsk: measureWith("honours", [], scratch(), present, steps) });
    expect(required.code).toBe(1);
  });

  it("logs key names and session ids alone, and never prints a payload value, on the line or in --out", () => {
    const secret = "qa-secret-value-31";
    const steps: CopilotStep[] = [
      ["sessionStart", JSON.stringify({ sessionId: MAIN_SESSION, source: "new", initialPrompt: secret })],
      ["preToolUse", copilotCall("task", { prompt: secret })],
      MEASURED_COPILOT[2]!,
    ];
    const runs: FakeRun[] = [];
    const out = join(scratch(), "ask.json");
    const { lines } = mainWith(["--ask", "--clients", "copilot", "--out", out], { measureAsk: measureWith("honours", runs, scratch(), present, steps) });
    const log = readFileSync(join(runs[0]!.cwd, "qa-ask-observations.jsonl"), "utf8");
    expect(log).toContain('"agentId"');
    expect(log).toContain(HELPER_SESSION);
    expect(log).not.toContain(secret);
    expect(log, "a tool's arguments are a value, not a key").not.toContain("echo qa-helper");
    const written = readFileSync(out, "utf8");
    expect(written).toContain('"facts"');
    for (const text of [lines.join("\n"), written]) {
      expect(text).not.toContain(secret);
      expect(text, "no session id is printed").not.toContain(MAIN_SESSION);
    }
  });

  it("reads no facts for Claude Code, whose row is unchanged", () => {
    const { lines } = mainWith(["--ask", "--clients", "claude"], { measureAsk: measureWith("honours", []) });
    expect(lines[0]).not.toMatch(/fact \d/);
  });
});

describe("hook-runs — the hook-fire mode", () => {
  /** Finished rows, as `runHookClients` returns them (inline mock reason above: no live client). */
  function rows(...entries: { client: string; status: string; observations: unknown[] }[]) {
    return () => entries.map(({ client, status, observations }) => ({ client, status, observations, reason: `${client} row` }));
  }

  it("exits non-zero under --require-observation when claude -p left an empty observation log", () => {
    const empty = rows({ client: "claude", status: "not-run", observations: [] });
    expect(mainWith(["--clients", "claude", "--require-observation"], { runHookClients: empty }).code).toBe(1);
    // The same row without the flag is a reported not-run, not a red run: the flag is what makes it red.
    expect(mainWith(["--clients", "claude"], { runHookClients: empty }).code).toBe(0);
    const observed = rows({ client: "claude", status: "passed", observations: [{ decision: "denied" }, { decision: "allowed" }] });
    expect(mainWith(["--clients", "claude", "--require-observation"], { runHookClients: observed }).code).toBe(0);
  });

  it("exits non-zero on a failed row, and does not hold Codex, which has no headless runner, to an observation", () => {
    expect(mainWith(["--clients", "claude"], { runHookClients: rows({ client: "claude", status: "failed", observations: [] }) }).code).toBe(1);
    const codex = rows({ client: "codex", status: "not-run", observations: [] });
    expect(mainWith(["--clients", "codex", "--require-observation"], { runHookClients: codex }).code).toBe(0);
  });

  it("passes the requested clients through, prints one line per row and writes them to --out", () => {
    const out = join(scratch(), "hook-fire.json");
    let asked: unknown;
    const { lines } = mainWith(["--clients", "claude,copilot", "--out", out], {
      runHookClients: (options: { clients: string[] }) => {
        asked = options.clients;
        return rows(
          { client: "claude", status: "passed", observations: [{}, {}] },
          { client: "copilot", status: "not-run", observations: [] },
        )();
      },
    });
    expect(asked).toEqual(["claude", "copilot"]);
    expect(lines).toEqual(["hook-runs: claude passed — claude row", "hook-runs: copilot not-run — copilot row"]);
    expect((JSON.parse(readFileSync(out, "utf8")) as { mode: string }).mode).toBe("hooks");
  });
});

describe("hook-runs — usage", () => {
  it.each([
    [["--bogus"]],
    [["--clients", "claude,vim"]],
    [["--out"]],
    [["--clients"]],
  ])("exits 2 on %j", (argv) => {
    const never = () => {
      throw new Error("no run on a usage error");
    };
    expect(mainWith(argv, { runHookClients: never, measureAsk: never }).code).toBe(2);
  });
});
