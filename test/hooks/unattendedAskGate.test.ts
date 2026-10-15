/**
 * u14b-ask-gate (REQ-FLOW-090, REQ-FLOW-095): the unattended ask gate on Claude
 * Code, run as a real child process in a scratch repository the way the client
 * runs a PreToolUse hook — fresh process, the payload on stdin, the script at
 * the path the Claude adapter writes it.
 *
 * No double stands in for anything: the run records are real files in a temp
 * directory and the variable is the child's real environment. Every deny case
 * has an allow case one fact away (a record's status, its mode, the variable),
 * so a gate that denied every question, or none, fails.
 */
import { spawnSync } from "node:child_process";
import { chmodSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildUnattendedAskGate,
  type HookScriptLayout,
  planCoreHookScripts,
  UNATTENDED_ASK_GATE_FILE,
  UNATTENDED_ASK_GATE_REASON,
} from "../../src/hooks/scripts.ts";
import { TOOLS } from "../../src/types/core.ts";
import { useTempDir } from "../support/tempDir.ts";

const getRepo = useTempDir("unattended-ask-gate");

/** The gate at `.stamity/generated/hooks/claude/`, with the records it reads; returns its path. */
async function placeGate(files: Record<string, string> = {}, layout: HookScriptLayout = "generated"): Promise<string> {
  await getRepo().seedFiles({
    [`.stamity/generated/hooks/claude/${UNATTENDED_ASK_GATE_FILE}`]: buildUnattendedAskGate({ layout }),
    ...files,
  });
  return getRepo().path(".stamity", "generated", "hooks", "claude", UNATTENDED_ASK_GATE_FILE);
}

/** Claude Code's PreToolUse payload for one tool call. */
function payload(toolName = "AskUserQuestion"): string {
  return JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: { questions: [{ question: "Which plan?", options: [{ label: "A" }, { label: "B" }] }] },
  });
}

interface Outcome {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the gate as Claude Code does, with the one variable it reads under the test's control. */
function run(gate: string, input: string, env: Record<string, string> = {}, cwd?: string): Outcome {
  const base = { ...process.env };
  delete base.STAMITY_UNATTENDED;
  delete base.STAMITY_REPO_ROOT;
  const result = spawnSync(process.execPath, [gate], { input, encoding: "utf8", env: { ...base, ...env }, cwd });
  return { status: result.status, stdout: String(result.stdout), stderr: String(result.stderr) };
}

/** Whether the gate denies a question: exit 2 with the rule on stderr, or exit 0 in silence. */
function denies(gate: string, env?: Record<string, string>, input = payload()): boolean {
  const outcome = run(gate, input, env);
  expect(outcome.stdout).toBe("");
  if (outcome.status === 0) {
    expect(outcome.stderr).toBe("");
    return false;
  }
  expect(outcome.status).toBe(2);
  expect(outcome.stderr).toBe(`${UNATTENDED_ASK_GATE_REASON}\n`);
  return true;
}

/** A run record's head, as `/st-work` and `/st-debug` open one. */
function record(status: string, mode?: "attended" | "unattended"): string {
  return `# Run\n\nStatus: ${status}\nPlan: docs/plans/x.md\n${mode === undefined ? "" : `Mode: ${mode}\n`}Invocation: /st-work x\n`;
}

const ON = { STAMITY_UNATTENDED: "1" };

describe("the ask gate's five cases (REQ-FLOW-090)", () => {
  it("denies a question while the newest in-progress record reads Mode: unattended, and allows it once the run closes", async () => {
    const gate = await placeGate({ ".stamity/runs/2026-10-16_night/record.md": record("in progress", "unattended") });
    expect(denies(gate)).toBe(true);
    // One fact away: the same run closed (handed off) and no variable → the question goes through.
    await getRepo().seedFiles({ ".stamity/runs/2026-10-16_night/record.md": record("done", "unattended") });
    expect(denies(gate)).toBe(false);
  });

  it("allows a question while the newest in-progress record reads Mode: attended", async () => {
    const gate = await placeGate({ ".stamity/runs/2026-10-16_walk/record.md": record("in progress", "attended") });
    expect(denies(gate)).toBe(false);
  });

  it("denies a question when the variable is set and no run is in progress", async () => {
    const gate = await placeGate();
    expect(denies(gate, ON)).toBe(true);
    // One fact away: the variable unset, or set to a value that reads as off.
    expect(denies(gate)).toBe(false);
    for (const off of ["", "0", "false", " FALSE "]) expect(denies(gate, { STAMITY_UNATTENDED: off }), JSON.stringify(off)).toBe(false);
    for (const on of ["true", "yes", "unattended"]) expect(denies(gate, { STAMITY_UNATTENDED: on }), on).toBe(true);
  });

  it("allows Claude Code's final round: the variable set, the newest record a closed unattended run", async () => {
    const gate = await placeGate({
      ".stamity/runs/2026-10-15_older/record.md": record("done", "attended"),
      ".stamity/runs/2026-10-16_night/record.md": record("handed off", "unattended"),
    });
    expect(denies(gate, ON)).toBe(false);
    // One fact away: the newest closed record an attended run → the variable governs again.
    await getRepo().seedFiles({ ".stamity/runs/2026-10-17_later/record.md": record("done", "attended") });
    expect(denies(gate, ON)).toBe(true);
  });

  it("allows a morning walk: the variable set, the newest in-progress record reading Mode: attended", async () => {
    const gate = await placeGate({
      ".stamity/runs/2026-10-16_night/record.md": record("done", "unattended"),
      ".stamity/runs/2026-10-17_walk/record.md": record("in progress", "attended"),
    });
    expect(denies(gate, ON)).toBe(false);
  });
});

describe("which record the gate reads", () => {
  it("reads the newest in-progress record by run id, so an attended walk opened after an unattended run may ask", async () => {
    const gate = await placeGate({
      ".stamity/runs/2026-10-15_night/record.md": record("in progress", "unattended"),
      ".stamity/runs/2026-10-16_walk/record.md": record("in progress", "attended"),
    });
    expect(denies(gate, ON)).toBe(false);
    // The order reversed: the unattended run is the newer one in progress.
    await getRepo().seedFiles({ ".stamity/runs/2026-10-17_night/record.md": record("in progress", "unattended") });
    expect(denies(gate)).toBe(true);
  });

  it("reads a debug round's record too", async () => {
    const gate = await placeGate({ ".stamity/runs/2026-10-16_debug-flake/record.md": record("in progress", "unattended") });
    expect(denies(gate)).toBe(true);
  });

  it("reads a record with no Mode: line as attended, and lets the variable govern it", async () => {
    const gate = await placeGate({ ".stamity/runs/2026-10-16_old/record.md": record("in progress") });
    expect(denies(gate)).toBe(false);
    expect(denies(gate, ON)).toBe(true);
  });

  it("skips a run folder with no record and a folder whose name is not a run id", async () => {
    const gate = await placeGate({
      ".stamity/runs/2026-10-16_night/record.md": record("in progress", "unattended"),
      ".stamity/runs/2026-10-17_empty/notes.md": "no record here\n",
      ".stamity/runs/zzzz/record.md": record("in progress", "attended"),
    });
    expect(denies(gate)).toBe(true);
  });

  it("resolves the repository from the working directory in a plugin root's layout", async () => {
    await getRepo().seedFiles({ ".stamity/runs/2026-10-16_night/record.md": record("in progress", "unattended") });
    await getRepo().seedFiles({ "plugin/hooks/gate.mjs": buildUnattendedAskGate({ layout: "container" }) });
    const gate = getRepo().path("plugin", "hooks", "gate.mjs");
    expect(run(gate, payload(), {}, getRepo().dir).status).toBe(2);
    expect(run(gate, payload(), {}, getRepo().path("plugin")).status).toBe(0);
  });
});

describe("what the gate leaves alone", () => {
  it("allows every other tool at once, even while an unattended run is in progress", async () => {
    const gate = await placeGate({ ".stamity/runs/2026-10-16_night/record.md": record("in progress", "unattended") });
    for (const tool of ["Bash", "Read", "Task", "askuserquestion"]) expect(denies(gate, ON, payload(tool)), tool).toBe(false);
  });

  it("fails open on a payload it cannot read: asking is the safe failure", async () => {
    const gate = await placeGate({ ".stamity/runs/2026-10-16_night/record.md": record("in progress", "unattended") });
    for (const input of ["{not json", "", "null", "[]"]) expect(denies(gate, ON, input), JSON.stringify(input)).toBe(false);
  });

  // A permission bit is the real failure here; Windows and root ignore it, so the case runs where it holds.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "fails open when the records folder or a record cannot be read",
    async () => {
      const gate = await placeGate({ ".stamity/runs/2026-10-16_night/record.md": record("in progress", "unattended") });
      expect(denies(gate, ON)).toBe(true);
      const recordPath = getRepo().path(".stamity", "runs", "2026-10-16_night", "record.md");
      chmodSync(recordPath, 0o000);
      try {
        expect(denies(gate, ON)).toBe(false);
      } finally {
        chmodSync(recordPath, 0o644);
      }
      const runsDir = getRepo().path(".stamity", "runs");
      chmodSync(runsDir, 0o000);
      try {
        expect(denies(gate, ON)).toBe(false);
      } finally {
        chmodSync(runsDir, 0o755);
      }
    },
  );
});

describe("the gate's place", () => {
  it("is no core script: no plan carries it, so the wiring stays the adapter's (u20)", () => {
    for (const tool of TOOLS) {
      for (const personOnlyGuard of [false, true]) {
        const names = planCoreHookScripts("../../agent-tool-policies.json", tool, {
          packageName: "@zomarit/stamity",
          version: "1.0.0-golden",
          personOnlyGuard,
        }).map((script) => script.fileName);
        expect(names, tool).not.toContain(UNATTENDED_ASK_GATE_FILE);
      }
    }
  });

  it("renders the same bytes twice, carries the rule's text, and reaches for no network, shell or evaluation", () => {
    for (const layout of ["generated", "container"] as const) {
      const content = buildUnattendedAskGate({ layout });
      expect(buildUnattendedAskGate({ layout })).toBe(content);
      expect(content).toMatch(/^#!\/usr\/bin\/env node\n\/\* eslint-disable \*\/\n/);
      expect(content).toContain(JSON.stringify(UNATTENDED_ASK_GATE_REASON));
      for (const token of ["http://", "https://", "fetch(", "child_process", "new Function", "writeFileSync"]) {
        expect(content, token).not.toContain(token);
      }
      expect(content).not.toMatch(/\beval\s*\(/);
    }
    expect(buildUnattendedAskGate()).toBe(buildUnattendedAskGate({ layout: "generated" }));
    expect(UNATTENDED_ASK_GATE_REASON).toBe(
      "This run is unattended: take the declared default and record `Default applied: <question> → option <N> (unattended)`; " +
        "with no declared default, stop at BLOCKED_AMBIGUITY.",
    );
  });
});
