import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
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

type Behaviour = "honours" | "ignores" | "silent";

interface FakeRun {
  cwd: string;
  binary: string;
  args: readonly string[];
  env: Record<string, string | undefined>;
  answer: string | undefined;
}

/** The payload each client hands its pre-shell hook, carrying the marked command. */
function payloadFor(client: string): string {
  const command = hookRuns.ASK_COMMAND as string;
  if (client === "claude") return JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
  if (client === "cursor") return JSON.stringify({ hook_event_name: "beforeShellExecution", command, cwd: "." });
  return JSON.stringify({ toolName: "bash", toolArgs: JSON.stringify({ command }) });
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
 */
function fakeClient(client: string, behaviour: Behaviour, runs: FakeRun[]) {
  return (binary: string, args: readonly string[], options: { cwd: string; env: Record<string, string | undefined> }) => {
    const run: FakeRun = { cwd: options.cwd, binary, args, env: options.env, answer: undefined };
    runs.push(run);
    if (behaviour === "silent") return { status: 0, signal: null, stdout: "", stderr: "" };
    const config = readFileSync(join(options.cwd, hookRuns.ASK_CONFIG_PATHS[client] as string), "utf8");
    expect(config, "the client's config names the hook the module wrote").toContain(hookRuns.ASK_HOOK_FILE);
    const hook = spawnSync(process.execPath, [join(options.cwd, hookRuns.ASK_HOOK_FILE as string)], {
      cwd: options.cwd,
      input: payloadFor(client),
      encoding: "utf8",
    });
    expect(hook.status, hook.stderr).toBe(0);
    run.answer = decisionOf(client, hook.stdout);
    if (behaviour === "ignores" || run.answer !== "ask") {
      writeFileSync(join(options.cwd, hookRuns.ASK_MARKER as string), "");
    }
    return { status: 0, signal: null, stdout: "done\n", stderr: "" };
  };
}

const present = () => ({ present: true, version: "fake 1.0.0" });

function measureWith(behaviour: Behaviour, runs: FakeRun[], baseDir = scratch()) {
  return ({ client }: { client: string }) =>
    hookRuns.measureAsk({ client, baseDir, spawn: fakeClient(client, behaviour, runs), probe: present });
}

function mainWith(argv: readonly string[], deps: Record<string, unknown>): { code: number; lines: string[] } {
  const lines: string[] = [];
  const code = hookRuns.main(argv, { print: (line: string) => lines.push(line), ...deps }) as number;
  return { code, lines };
}

describe("verdictForAsk — what one client run says about the ask", () => {
  it("reads a created marker as ran, an answered ask with no marker as held, and neither as not-run", () => {
    const asked = [{ marked: true }];
    expect(hookRuns.verdictForAsk({ client: "claude", markerCreated: true, observations: asked }).status).toBe("ran");
    expect(hookRuns.verdictForAsk({ client: "claude", markerCreated: false, observations: asked }).status).toBe("held");
    // No ask was answered and nothing ran: nothing about the ask was measured, which is never `held`.
    expect(hookRuns.verdictForAsk({ client: "claude", markerCreated: false, observations: [{ marked: false }] }).status).toBe("not-run");
    expect(hookRuns.verdictForAsk({ client: "claude", markerCreated: false, observations: [] }).status).toBe("not-run");
    // A marker with no ask answered is still `ran`, and its reason says the hook was not consulted.
    const unasked = hookRuns.verdictForAsk({ client: "copilot", markerCreated: true, observations: [] });
    expect(unasked.status).toBe("ran");
    expect(unasked.reason).toContain("never asked");
  });
});

describe("hook-runs --ask — each client's answer, measured in a throwaway folder", () => {
  it("reports ran and exits non-zero when Claude Code or Copilot ran the marked command after the ask", () => {
    for (const client of ["claude", "copilot"]) {
      const runs: FakeRun[] = [];
      const { code, lines } = mainWith(["--ask", "--clients", client], { measureAsk: measureWith("ignores", runs) });
      expect(code, client).toBe(1);
      expect(runs, client).toHaveLength(1);
      // The hook really answered ask, in this client's own dialect, before the fake ran the command.
      expect(runs[0]?.answer, client).toBe("ask");
      expect(lines.join("\n"), client).toMatch(new RegExp(`^hook-runs --ask: ${client} \\(\\S+\\) ran — `, "m"));
    }
  });

  it("reports ran and exits 0 for Cursor, which refuses rather than asks", () => {
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
    for (const run of runs) {
      expect(run.args, run.binary).toContain(hookRuns.ASK_PROMPT);
      expect(run.args, run.binary).not.toContain("--bare");
      expect(relative(REPO_ROOT, run.cwd).startsWith(".."), run.cwd).toBe(true);
      // The answer is read off the marker the command creates, so the folder starts without it.
      expect(existsSync(join(run.cwd, hookRuns.ASK_HOOK_FILE as string))).toBe(true);
    }
  });

  it("refuses a throwaway folder inside this checkout", () => {
    expect(() =>
      hookRuns.measureAsk({ client: "claude", baseDir: REPO_ROOT, spawn: fakeClient("claude", "honours", []), probe: present }),
    ).toThrow(/inside this repository/);
  });

  it("reports not-run when the hook was never consulted, and --require-observation makes that red for an ask-class client", () => {
    const runs: FakeRun[] = [];
    const quiet = mainWith(["--ask", "--clients", "claude"], { measureAsk: measureWith("silent", runs) });
    expect(quiet.lines[0]).toContain("claude (bypassPermissions) not-run");
    expect(quiet.code).toBe(0);
    expect(mainWith(["--ask", "--clients", "claude", "--require-observation"], { measureAsk: measureWith("silent", []) }).code).toBe(1);
    // Cursor is not ask-class: its unmeasured row is reported, never red.
    expect(mainWith(["--ask", "--clients", "cursor", "--require-observation"], { measureAsk: measureWith("silent", []) }).code).toBe(0);
  });

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
    expect(absent).toMatchObject({ status: "not-run", reason: "claude: not on PATH (ENOENT)" });
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
