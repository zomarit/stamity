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
  UNATTENDED_ASK_GATE_FAULT_NOTE,
  UNATTENDED_ASK_GATE_FILE,
  UNATTENDED_ASK_GATE_REASON,
  UNATTENDED_ASK_GATE_RECORD_SOURCE,
  UNATTENDED_ASK_GATE_VARIABLE_SOURCE,
} from "../../src/hooks/scripts.ts";
import { RUN_ENDED_MARKER_FILE } from "../../src/mcp/env.ts";
import { CANARY_MAX_AGE_MS } from "../../src/runs/preflight.ts";
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

/** The refusal's stderr when a record decided: the rule, then the record it read. */
function byRecord(runId: string): string {
  return `${UNATTENDED_ASK_GATE_REASON}${UNATTENDED_ASK_GATE_RECORD_SOURCE.replace("<record>", `.stamity/runs/${runId}/record.md`)}\n`;
}

/** The refusal's stderr when the variable decided. */
const BY_VARIABLE = `${UNATTENDED_ASK_GATE_REASON}${UNATTENDED_ASK_GATE_VARIABLE_SOURCE}\n`;

/** The fail-open note for one read that failed. */
function faultNote(read: string, cause: string): string {
  return `${UNATTENDED_ASK_GATE_FAULT_NOTE.replace("<read>", read).replace("<cause>", cause)}\n`;
}

/** The gate's stderr on a refusal (exit 2), or null when it allows a question in silence (exit 0). */
function refusal(gate: string, env?: Record<string, string>, input = payload()): string | null {
  const outcome = run(gate, input, env);
  expect(outcome.stdout).toBe("");
  if (outcome.status === 0) {
    expect(outcome.stderr).toBe("");
    return null;
  }
  expect(outcome.status).toBe(2);
  expect(outcome.stderr.startsWith(UNATTENDED_ASK_GATE_REASON)).toBe(true);
  return outcome.stderr;
}

/** Whether the gate denies a question: exit 2 with the rule and its source on stderr, or exit 0 in silence. */
function denies(gate: string, env?: Record<string, string>, input = payload()): boolean {
  return refusal(gate, env, input) !== null;
}

/** A run record's head, as `/st-work` and `/st-debug` open one; an unattended run's head carries its branch. */
function record(status: string, mode?: "attended" | "unattended", branch?: string): string {
  const modeLine = mode === undefined ? "" : `Mode: ${mode}\n`;
  const branchLine = branch === undefined ? "" : `Branch: ${branch}\n`;
  return `# Run\n\nStatus: ${status}\nPlan: docs/plans/x.md\n${modeLine}${branchLine}Invocation: /st-work x\n`;
}

/**
 * The run-ended marker `run end --final-round` writes at the run's final exit, naming `runId` (pr/17), its `at`
 * `ageMs` before now (pr/36: the gate honours it only within the pre-flight canary's window).
 */
// TEST CHANGE, justified (pr/36, signed off 12:41Z): the marker carries `at` now, and one without it exempts nothing.
function ended(runId: string, ageMs = 0): Record<string, string> {
  return { [RUN_ENDED_MARKER_FILE]: `${JSON.stringify({ run: runId, at: new Date(Date.now() - ageMs).toISOString() })}\n` };
}

/** `.git/HEAD` on a branch, as a checkout writes it. */
function onBranch(branch: string): Record<string, string> {
  return { ".git/HEAD": `ref: refs/heads/${branch}\n` };
}

const ON = { STAMITY_UNATTENDED: "1" };

describe("the ask gate's five cases (REQ-FLOW-090)", () => {
  it("denies a question while the newest in-progress record reads Mode: unattended, and allows it once the run closes", async () => {
    const gate = await placeGate({ ".stamity/runs/2026-10-16_night/record.md": record("in progress", "unattended") });
    expect(refusal(gate)).toBe(byRecord("2026-10-16_night"));
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
    expect(refusal(gate, ON)).toBe(BY_VARIABLE);
    // One fact away: the variable unset, or set to a value that reads as off.
    expect(denies(gate)).toBe(false);
    for (const off of ["", "0", "false", " FALSE "]) expect(denies(gate, { STAMITY_UNATTENDED: off }), JSON.stringify(off)).toBe(false);
    for (const on of ["true", "yes", "unattended"]) expect(denies(gate, { STAMITY_UNATTENDED: on }), on).toBe(true);
  });

  // TEST CHANGE, justified: pr/17 (signed off 11:33Z) ties the final round to the run-ended marker `run end` writes too.
  it("allows Claude Code's final round: the variable set, the newest record a closed unattended run", async () => {
    const gate = await placeGate({
      ".stamity/runs/2026-10-15_older/record.md": record("done", "attended"),
      ".stamity/runs/2026-10-16_night/record.md": record("handed off", "unattended", "stamity/night"),
      ...ended("2026-10-16_night"),
      ...onBranch("stamity/night"),
    });
    expect(denies(gate, ON)).toBe(false);
    // One fact away: the checkout on another branch than the record's → the variable governs again (review/100).
    await getRepo().seedFiles(onBranch("main"));
    expect(refusal(gate, ON)).toBe(BY_VARIABLE);
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
  it("reads no order among records: any in-progress unattended record denies, on an earlier day or a later one", async () => {
    const gate = await placeGate({
      ".stamity/runs/2026-10-15_night/record.md": record("in progress", "unattended"),
      ".stamity/runs/2026-10-16_walk/record.md": record("in progress", "attended"),
    });
    expect(refusal(gate, ON)).toBe(byRecord("2026-10-15_night"));
    expect(refusal(gate)).toBe(byRecord("2026-10-15_night"));
    // One fact away: the unattended run closed → the attended walk in progress allows, the variable set or not.
    await getRepo().seedFiles({ ".stamity/runs/2026-10-15_night/record.md": record("done", "unattended") });
    expect(denies(gate, ON)).toBe(false);
    expect(denies(gate)).toBe(false);
  });

  // review/101: a run id carries only the UTC date, so two runs of one day rank by slug; the verdict must not.
  for (const [label, unattendedId, otherId] of [
    ["the unattended run's slug sorting first", "2026-10-16_a-night", "2026-10-16_walk"],
    ["the unattended run's slug sorting last", "2026-10-16_night", "2026-10-16_api-fix"],
  ] as const) {
    it(`denies beside a same-day attended or no-Mode record in progress, ${label}`, async () => {
      const gate = await placeGate({
        [`.stamity/runs/${unattendedId}/record.md`]: record("in progress", "unattended"),
        [`.stamity/runs/${otherId}/record.md`]: record("in progress", "attended"),
      });
      expect(refusal(gate)).toBe(byRecord(unattendedId));
      expect(refusal(gate, ON)).toBe(byRecord(unattendedId));
      await getRepo().seedFiles({ [`.stamity/runs/${otherId}/record.md`]: record("in progress") });
      expect(refusal(gate)).toBe(byRecord(unattendedId));
      // One fact away: the unattended run closed → the same-day attended record decides, whichever slug sorts first.
      await getRepo().seedFiles({
        [`.stamity/runs/${unattendedId}/record.md`]: record("done", "unattended"),
        [`.stamity/runs/${otherId}/record.md`]: record("in progress", "attended"),
      });
      expect(denies(gate, ON)).toBe(false);
    });
  }

  // TEST CHANGE, justified: pr/17 (signed off 11:33Z) needs the run-ended marker for the final round, so it is seeded
  // here and each refusal below is still the branch's, as review/100 pins it.
  it("holds the final round only on the closed unattended record's own branch (review/100)", async () => {
    // A record carried into a later clone: committed on its run's branch, merged, read from main.
    const gate = await placeGate({
      ".stamity/runs/2026-10-16_night/record.md": record("handed off", "unattended", "stamity/night"),
      ...ended("2026-10-16_night"),
      ...onBranch("main"),
    });
    expect(refusal(gate, ON)).toBe(BY_VARIABLE);
    // Same-day: a later run's branch, the closed record still the newest by name.
    await getRepo().seedFiles(onBranch("stamity/next"));
    expect(refusal(gate, ON)).toBe(BY_VARIABLE);
    // A detached HEAD names no branch, and no .git at all names none either.
    await getRepo().seedFiles({ ".git/HEAD": "0123456789abcdef0123456789abcdef01234567\n" });
    expect(refusal(gate, ON)).toBe(BY_VARIABLE);
    // One fact away: the checkout back on the run's own branch → the final round may ask.
    await getRepo().seedFiles(onBranch("stamity/night"));
    expect(denies(gate, ON)).toBe(false);
    // A record with no Branch: line exempts nothing.
    await getRepo().seedFiles({ ".stamity/runs/2026-10-16_night/record.md": record("handed off", "unattended") });
    expect(refusal(gate, ON)).toBe(BY_VARIABLE);
  });

  // TEST CHANGE, justified: pr/17 needs the run-ended marker for the final round this case reads the branch for.
  it("follows a linked worktree's gitdir: pointer to the HEAD it reads", async () => {
    const gate = await placeGate({
      ".stamity/runs/2026-10-16_night/record.md": record("handed off", "unattended", "stamity/night"),
      ...ended("2026-10-16_night"),
      ".git": "gitdir: common/.git/worktrees/night\n",
      "common/.git/worktrees/night/HEAD": "ref: refs/heads/stamity/night\n",
    });
    expect(denies(gate, ON)).toBe(false);
    // One fact away: the worktree's own HEAD on another branch.
    await getRepo().seedFiles({ "common/.git/worktrees/night/HEAD": "ref: refs/heads/main\n" });
    expect(refusal(gate, ON)).toBe(BY_VARIABLE);
  });

  // pr/17: a later session on a closed run's branch (a chain's next file, an unattended /st-pr-resolve on its head)
  // asks nothing before its own record opens, since only the closed run's own run end leaves the marker behind.
  it("refuses on a closed unattended record's branch with no run-ended marker naming that run (pr/17)", async () => {
    const gate = await placeGate({
      ".stamity/runs/2026-10-16_night/record.md": record("handed off", "unattended", "stamity/night"),
      ...onBranch("stamity/night"),
    });
    expect(refusal(gate, ON)).toBe(BY_VARIABLE);
    // A marker naming another run, or no run id, or one that is no JSON, exempts nothing either.
    await getRepo().seedFiles(ended("2026-10-15_other"));
    expect(refusal(gate, ON)).toBe(BY_VARIABLE);
    await getRepo().seedFiles(ended("../night"));
    expect(refusal(gate, ON)).toBe(BY_VARIABLE);
    await getRepo().seedFiles({ [RUN_ENDED_MARKER_FILE]: "{not json\n" });
    expect(refusal(gate, ON)).toBe(BY_VARIABLE);
    // One fact away: the marker names the closed run → its final round may ask.
    await getRepo().seedFiles(ended("2026-10-16_night"));
    expect(denies(gate, ON)).toBe(false);
  });

  // pr/36: on a persistent checkout the marker outlives the final round, so a later session on the closed run's branch
  // finds it before its own run start; the gate honours it only within the pre-flight canary's window after `at`.
  it("refuses on a closed unattended record's branch once its run-ended marker is past the canary's window (pr/36)", async () => {
    expect(CANARY_MAX_AGE_MS).toBe(120_000);
    const gate = await placeGate({
      ".stamity/runs/2026-10-16_night/record.md": record("handed off", "unattended", "stamity/night"),
      ...ended("2026-10-16_night", CANARY_MAX_AGE_MS + 60_000),
      ...onBranch("stamity/night"),
    });
    expect(refusal(gate, ON)).toBe(BY_VARIABLE);
    // A marker with no at, an unreadable one, or one dated after now exempts nothing either.
    await getRepo().seedFiles({ [RUN_ENDED_MARKER_FILE]: `${JSON.stringify({ run: "2026-10-16_night" })}\n` });
    expect(refusal(gate, ON)).toBe(BY_VARIABLE);
    await getRepo().seedFiles({ [RUN_ENDED_MARKER_FILE]: `${JSON.stringify({ run: "2026-10-16_night", at: "yesterday" })}\n` });
    expect(refusal(gate, ON)).toBe(BY_VARIABLE);
    await getRepo().seedFiles(ended("2026-10-16_night", -60_000));
    expect(refusal(gate, ON)).toBe(BY_VARIABLE);
    // One fact away: the marker inside the window → the final round may ask.
    await getRepo().seedFiles(ended("2026-10-16_night", CANARY_MAX_AGE_MS - 30_000));
    expect(denies(gate, ON)).toBe(false);
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

  it("fails open on a payload it cannot read: asking is the safe failure, and a payload that is no JSON says so", async () => {
    const gate = await placeGate({ ".stamity/runs/2026-10-16_night/record.md": record("in progress", "unattended") });
    for (const input of ["", "null", "[]"]) expect(denies(gate, ON, input), JSON.stringify(input)).toBe(false);
    expect(run(gate, "{not json", ON)).toEqual({ status: 0, stdout: "", stderr: faultNote("the hook payload", "not JSON") });
  });

  // A permission bit is the real failure here; Windows and root ignore it, so the case runs where it holds.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "fails open when the records folder or a record cannot be read, naming the read that failed",
    async () => {
      const gate = await placeGate({ ".stamity/runs/2026-10-16_night/record.md": record("in progress", "unattended") });
      expect(denies(gate, ON)).toBe(true);
      const recordPath = getRepo().path(".stamity", "runs", "2026-10-16_night", "record.md");
      chmodSync(recordPath, 0o000);
      try {
        expect(run(gate, payload(), ON)).toEqual({ status: 0, stdout: "", stderr: faultNote(recordPath, "EACCES") });
      } finally {
        chmodSync(recordPath, 0o644);
      }
      const runsDir = getRepo().path(".stamity", "runs");
      chmodSync(runsDir, 0o000);
      try {
        expect(run(gate, payload(), ON)).toEqual({ status: 0, stdout: "", stderr: faultNote(runsDir, "EACCES") });
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
