import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { LEDGER_GATED_KINDS, bashClass, heredocs, ledgerWrite, roleFunction, scanSubagent, walkTranscriptFile, walkTranscriptLines } from "../../scripts/replay/transcript.mjs";
import { mainLine, subagentFile, writeCapture } from "./synth.ts";

/**
 * The replay's attribution walk: every payload that enters an orchestrator's main context, sorted
 * into a class with its character count, plus the request, delivery, dispatch, shell and
 * compaction rows the per-run measurement reads. The walk is a port of the package's measurement
 * method, so these cases pin its counting rules against lines the synthetic builders write in the
 * client's own shapes — real lines, real files, no stand-in for the walk.
 */

interface Row {
  [key: string]: unknown;
}
interface Walk {
  events: Row[];
  requests: Row[];
  deliveries: Row[];
  dispatches: Row[];
  bash: Row[];
  compactions: Row[];
  skipped: {
    lines: number;
    requests: number;
    segments: number;
    attachmentNoRendered: Record<string, number>;
    entryTypes: Record<string, number>;
    apiErrorStubs: number;
    apiErrorChars: number;
    sidechain: number;
    images: number;
  };
}

const walk = (lines: string[]): Walk => walkTranscriptLines(lines) as Walk;
const eventsOf = (w: Walk, cls: string): Row[] => w.events.filter((event) => event["cls"] === cls);

const temps: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "stamity-replay-walk-"));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A reviewer's return: two findings, a verdict line and one astral character (two UTF-16 units). */
const REVIEW_RESULT = [
  "**Verdict:** request-changes",
  "| Critical | src/store/query.ts:12 | sort value concatenated into SQL |",
  "| Warning | src/store/paging.ts:4 | page 1 skips the first 10 rows |",
  "Minor: naming. \u{1F50E}",
].join("\n");

/** One reviewer pass: dispatch, launch ack, delivered notification. */
function reviewerPass(): { lines: string[]; notification: string } {
  const notification = mainLine.taskNotification({ taskId: "a1", toolUseId: "tu-rev", result: REVIEW_RESULT, subagentTokens: 4200 });
  return {
    notification,
    lines: [
      mainLine.userText("/st-work docs/plans/p.md"),
      mainLine.agentToolUse(
        {
          id: "tu-rev",
          subagentType: "stamity-reviewer",
          description: "u1-p1 review",
          prompt: "Review u1-p1; append findings to .stamity/runs/r/ledger.jsonl",
          background: true,
        },
        { messageId: "msg-o1" },
      ),
      mainLine.toolResult("tu-rev", "Async agent launched successfully. agentId: a1"),
      notification,
    ],
  };
}

describe("walkTranscriptLines — deliveries", () => {
  it("counts a delivered notification's characters as returns.report and records the delivery", () => {
    const { lines, notification } = reviewerPass();
    const w = walk(lines);
    const content = JSON.parse(notification).message.content as string;

    const reports = eventsOf(w, "returns.report");
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ dir: "in", sub: "agent:user", chars: content.length, taskId: "a1", seg: 0 });
    // Characters are UTF-16 code units: the astral character counts two.
    expect(content.length).toBe([...content].length + 1);
    expect(eventsOf(w, "returns.launchAck")).toHaveLength(1);

    expect(w.deliveries).toHaveLength(1);
    expect(w.deliveries[0]).toMatchObject({
      channel: "user",
      taskId: "a1",
      toolUseId: "tu-rev",
      trigger: "Agent",
      triggerDesc: "u1-p1 review",
      status: "completed",
      chars: content.length,
      resultChars: REVIEW_RESULT.length,
      subagentTokens: 4200,
      findingWords: 2,
      minorWords: 1,
      verdict: "request-changes",
    });
  });

  it("skips and tallies a queued notification without rendered text, and counts one with it", () => {
    const queued = { taskId: "a2", toolUseId: "tu-x", result: "done", via: "queued" as const };
    const w = walk([
      mainLine.taskNotification({ ...queued, rendered: false }),
      mainLine.attachment({ type: "skill_listing", rendered: null }),
      mainLine.taskNotification(queued),
    ]);
    expect(w.skipped.attachmentNoRendered).toEqual({ queued_command: 1, skill_listing: 1 });
    expect(w.deliveries).toHaveLength(1);
    expect(w.deliveries[0]).toMatchObject({ channel: "att", taskId: "a2", resultChars: 4, trigger: null });
    expect(eventsOf(w, "returns.report")).toHaveLength(1);
    // The client's system-reminder wrapper around the block is injected text, not the return.
    expect(eventsOf(w, "injected.reminders")[0]).toMatchObject({ sub: "notification-wrapper" });
    expect(eventsOf(w, "injected.reminders")[0]!["chars"]).toBeGreaterThan(0);
  });

  it("classes a non-completed agent notification as returns.failure", () => {
    const w = walk([mainLine.taskNotification({ taskId: "a3", toolUseId: "tu-y", result: "", status: "failed" })]);
    expect(eventsOf(w, "returns.failure")).toHaveLength(1);
    expect(eventsOf(w, "returns.report")).toHaveLength(0);
  });
});

describe("walkTranscriptLines — SendMessage results by content (build/165)", () => {
  const sendResult = (text: string): string | undefined => {
    const w = walk([mainLine.sendMessage({ id: "tu-s", to: "a1", message: "Re-review W-1." }), mainLine.toolResult("tu-s", text)]);
    return w.events.find((event) => event["toolUseId"] === "tu-s" && event["dir"] === "in")?.["cls"] as string | undefined;
  };

  it("classes a short digest, a BLOCKED_* status and a verdict word as a report, whatever the length", () => {
    expect(sendResult("status: DONE\nverdict: approve\nreport: .stamity/runs/r/reports/u1-p1-reviewer-r2.md\nfindings: none")).toBe("returns.report");
    expect(sendResult("status: BLOCKED_DEPENDENCY\nThe lockfile is missing.")).toBe("returns.report");
    expect(sendResult("**Verdict:** approve\n\nNo findings.")).toBe("returns.report");
  });

  it("classes an acknowledgement as an ack, however long it is", () => {
    expect(sendResult('{"success":true,"message":"Message queued for delivery to a1"}')).toBe("returns.sendAck");
    expect(sendResult(`Message queued for delivery to a1. ${"x".repeat(2000)}`)).toBe("returns.sendAck");
  });
});

describe("walkTranscriptLines — compaction, requests, exclusions", () => {
  it("starts seg 1 at a compact_boundary and records its trigger and preTokens", () => {
    const w = walk([
      mainLine.userText("before"),
      mainLine.assistantText("ok", { messageId: "m1" }),
      mainLine.compactBoundary({ trigger: "manual", preTokens: 412_000, postTokens: 28_000 }),
      mainLine.userText("after"),
    ]);
    expect(w.compactions).toEqual([
      expect.objectContaining({ line: 3, seg: 1, trigger: "manual", preTokens: 412_000, postTokens: 28_000, lastTurn: 1 }),
    ]);
    const operator = eventsOf(w, "operator");
    expect(operator.map((event) => event["seg"])).toEqual([0, 1]);
    expect(w.skipped.segments).toBe(2);
  });

  it("deduplicates requests by message.id and keeps the largest usage", () => {
    const w = walk([
      mainLine.assistantText("a", { messageId: "m1", usage: { input: 10, cacheRead: 100, output: 1 } }),
      mainLine.bashToolUse({ id: "tu-b", command: "ls" }, { messageId: "m1", usage: { input: 10, cacheRead: 100, output: 40, thinking: 7 } }),
      mainLine.assistantText("b", { messageId: "m2", usage: { input: 5, output: 2 } }),
    ]);
    expect(w.requests).toHaveLength(2);
    expect(w.requests[0]).toMatchObject({ idx: 1, id: "m1", input: 10, cr: 100, out: 40, think: 7 });
    expect(w.skipped.requests).toBe(2);
    // The second line of m1 belongs to turn 1, not a new turn.
    expect(w.events.filter((event) => event["dir"] === "out").map((event) => event["turn"])).toEqual([1, 1, 2]);
  });

  it("keeps an isApiErrorMessage stub out of every class, and skips sidechain rows", () => {
    const w = walk([
      mainLine.assistantText("API Error: overloaded", { messageId: "m-err", apiError: true }),
      mainLine.userText("sidechain chatter", { sidechain: true }),
      mainLine.assistantText("real", { messageId: "m1" }),
    ]);
    expect(w.skipped.apiErrorStubs).toBe(1);
    expect(w.skipped.apiErrorChars).toBe("API Error: overloaded".length);
    expect(w.skipped.sidechain).toBe(1);
    expect(w.requests.map((request) => request["id"])).toEqual(["m1"]);
    const counted = w.events.filter((event) => event["cls"] !== "excluded.apiError");
    expect(counted).toEqual([expect.objectContaining({ cls: "out.prose", chars: 4, turn: 1 })]);
  });

  it("counts an unparseable line under PARSE_ERROR and walks on", () => {
    const w = walk([mainLine.userText("one"), '{"type":"user", broken', "", mainLine.userText("three")]);
    expect(w.skipped.entryTypes).toEqual({ PARSE_ERROR: 1 });
    expect(eventsOf(w, "operator").map((event) => event["line"])).toEqual([1, 4]);
    expect(w.skipped.lines).toBe(4);
  });
});

describe("walkTranscriptLines — dispatches and shell", () => {
  it("records Agent and SendMessage dispatches with their characters and target tags", () => {
    const w = walk([
      ...reviewerPass().lines,
      mainLine.sendMessage({ id: "tu-s", to: "a1", message: "Re-check W-1 in reports/brief-u1.md", summary: "re-check" }),
    ]);
    expect(w.dispatches).toEqual([
      expect.objectContaining({ kind: "agent", role: "stamity-reviewer", desc: "u1-p1 review", bg: true, tags: ["ledger"] }),
      expect.objectContaining({ kind: "send", to: "a1", desc: "re-check", promptChars: "Re-check W-1 in reports/brief-u1.md".length, tags: ["brief"] }),
    ]);
    expect(eventsOf(w, "out.agentPrompt")).toHaveLength(1);
    expect(eventsOf(w, "out.sendMessage")).toHaveLength(1);
  });

  it("classes a Bash result by its command's head verbs and a Read result as file.read", () => {
    const w = walk([
      mainLine.bashToolUse({ id: "tu-r", command: "sed -n 1,40p src/a.ts | head -5" }),
      mainLine.toolResult("tu-r", "x".repeat(40)),
      mainLine.bashToolUse({ id: "tu-g", command: "npm test && grep -n foo src" }),
      mainLine.toolResult("tu-g", "ok"),
      mainLine.readToolUse({ id: "tu-read", filePath: ".stamity/runs/r/reports/u1-p1-reviewer-r1.md" }),
      mainLine.toolResult("tu-read", "report body"),
    ]);
    expect(w.bash.filter((row) => row["kind"] === "command").map((row) => row["cls"])).toEqual(["read", "mixed"]);
    expect(w.bash.filter((row) => row["kind"] === "result")).toEqual([
      expect.objectContaining({ toolUseId: "tu-r", chars: 40, cls: "file.read" }),
      expect.objectContaining({ toolUseId: "tu-g", chars: 2, cls: "shell.other" }),
    ]);
    expect(eventsOf(w, "file.read").map((event) => event["sub"])).toEqual(["bash-read", "Read"]);
  });
});

// build/26 and build/34: the fields the per-run measurement reads, so it needs no second read of
// the transcript. Every one is additive to the research walk's row shapes.
describe("walkTranscriptLines — the measurement's additive fields", () => {
  it("carries a delivery's result text, and null when the block has none", () => {
    const w = walk([...reviewerPass().lines, mainLine.userText("<task-notification>\n<task-id>a4</task-id>\n<status>completed</status>\n<summary>Agent \"a4\" finished</summary>\n</task-notification>")]);
    expect(w.deliveries.map((delivery) => delivery["result"])).toEqual([REVIEW_RESULT, null]);
  });

  it("carries filePath on Read, Write and Edit events, and a ledger classification on Write and Edit events", () => {
    const rowText = '{"id":"r/build/2"}\n';
    const w = walk([
      mainLine.readToolUse({ id: "tu-read", filePath: ".stamity/runs/r/reports/u1-p1-reviewer-r1.md" }),
      mainLine.writeToolUse({ id: "tu-w", filePath: ".stamity/runs/r/ledger.jsonl", content: rowText }),
      mainLine.editToolUse({ id: "tu-e", filePath: "lanes/brief-u1.md", oldString: "a", newString: "b" }),
    ]);
    const out = w.events.filter((event) => event["dir"] === "out");
    expect(out).toEqual([
      expect.objectContaining({ tool: "Read", toolUseId: "tu-read", filePath: ".stamity/runs/r/reports/u1-p1-reviewer-r1.md" }),
      expect.objectContaining({ tool: "Write", toolUseId: "tu-w", filePath: ".stamity/runs/r/ledger.jsonl", ledger: { kind: "writeEdit", chars: rowText.length } }),
      expect.objectContaining({ tool: "Edit", toolUseId: "tu-e", filePath: "lanes/brief-u1.md", ledger: null }),
    ]);
    // A Read is not a write: it carries no ledger field at all.
    expect(out[0]).not.toHaveProperty("ledger");
  });

  it("carries the command text and its ledger classification on Bash command rows", () => {
    const verb = "npx @zomarit/stamity ledger append --run r --phase build --source reviewer --report .stamity/runs/r/reports/u1-p1-reviewer-r1.md";
    const w = walk([mainLine.bashToolUse({ id: "tu-v", command: verb }), mainLine.bashToolUse({ id: "tu-n", command: "npm run lint" })]);
    expect(w.bash.filter((row) => row["kind"] === "command")).toEqual([
      expect.objectContaining({ toolUseId: "tu-v", command: verb, ledger: { kind: "verb", chars: verb.length } }),
      expect.objectContaining({ toolUseId: "tu-n", command: "npm run lint", ledger: null }),
    ]);
  });

  it("records every tool input that names a forbidden path, once per path, and none without the option", () => {
    const lines = [
      mainLine.readToolUse({ id: "tu-1", filePath: "/fixture/evals/replay/v1/seeds.json" }),
      mainLine.bashToolUse({ id: "tu-2", command: "ls /fixture/__oracle__ && cat /fixture/evals/replay/v1/seeds.json" }),
      mainLine.agentToolUse({ id: "tu-3", subagentType: "stamity-reviewer", description: "u1-p1 review", prompt: "Review src/a.ts" }),
      mainLine.readToolUse({ id: "tu-4", filePath: "/fixture/__oracle__/u1.test.ts" }, { sidechain: true }),
    ];
    const w = walkTranscriptLines(lines, { forbid: ["seeds.json", "__oracle__"] }) as Walk & { forbidHits: Row[] };
    expect(w.forbidHits).toEqual([
      { line: 1, seg: 0, turn: 1, toolUseId: "tu-1", tool: "Read", forbid: "seeds.json" },
      { line: 2, seg: 0, turn: 2, toolUseId: "tu-2", tool: "Bash", forbid: "seeds.json" },
      { line: 2, seg: 0, turn: 2, toolUseId: "tu-2", tool: "Bash", forbid: "__oracle__" },
    ]);
    expect((walkTranscriptLines(lines) as Walk & { forbidHits: Row[] }).forbidHits).toEqual([]);
  });
});

describe("bashClass and heredocs — the verbatim port", () => {
  it.each([
    ["cat a.ts | grep x", "read"],
    ["grep -rn foo src && ls test", "search"],
    ["sed -n 1p a && find . -name b", "rs"],
    ["cat > out.md <<'EOF'\nbody\nEOF", "write"],
    ["sed -i s/a/b/ f", "other"],
    ["git show HEAD:a.ts", "read"],
    ["cd x && npm run lint && cat log", "mixed"],
    ["FOO=1 node script.mjs", "other"],
  ])("%s → %s", (command, cls) => {
    expect(bashClass(command).cls).toBe(cls);
  });

  it("returns each heredoc's tool, target and body characters", () => {
    const command = "cat >> .stamity/runs/r/ledger.jsonl <<'EOF'\n{\"a\":1}\nEOF\npython3 - <<PY\nprint(1)\nPY";
    expect(heredocs(command)).toEqual([
      { tool: "cat", target: ".stamity/runs/r/ledger.jsonl", chars: 7 },
      { tool: "", target: "", chars: 8 },
    ]);
  });
});

const bash = (command: string) => ({ type: "tool_use", name: "Bash", id: "t", input: { command } });

describe("ledgerWrite — both shapes", () => {
  it("detects the baseline's heredoc append with its body characters", () => {
    const body = '{"id":"r/build/1","phase":"build","severity":"Warning","state":"open"}';
    expect(ledgerWrite(bash(`cat >> .stamity/runs/r/ledger.jsonl <<EOF\n${body}\nEOF`))).toEqual({ kind: "heredoc", chars: body.length });
  });

  it("detects the changed shape's ledger verb with the command's characters", () => {
    const command = "npx @zomarit/stamity ledger append --run r --phase build --source reviewer --report .stamity/runs/r/reports/u1-p1-reviewer-r1.md";
    expect(ledgerWrite(bash(command))).toEqual({ kind: "verb", chars: command.length });
    for (const spelling of ["stamity ledger status --run r", "cd x && st ledger close --run r --id r/build/1 --state fixed --rationale ok", "npx --yes stamity ledger append --run r --phase build --source fixer --stdin <<EOF\n{}\nEOF"]) {
      expect(ledgerWrite(bash(spelling))).toEqual({ kind: "verb", chars: spelling.length });
    }
  });

  it("detects an echo redirect, a python body and a Write/Edit on the ledger", () => {
    const echo = `echo '{"id":"r/prove/2"}' >> .stamity/runs/r/ledger.jsonl`;
    expect(ledgerWrite(bash(echo))).toEqual({ kind: "echo", chars: echo.length });
    const python = "import json\nrows=[{'phase':'build','id':'r/build/4'}]\nopen('.stamity/runs/r/ledger.jsonl','a').write(json.dumps(rows[0]))";
    expect(ledgerWrite(bash(`python3 - <<'PY'\n${python}\nPY`))).toEqual({ kind: "heredoc", chars: python.length });
    const content = '{"id":"r/build/3"}\n';
    expect(ledgerWrite({ type: "tool_use", name: "Write", id: "w", input: { file_path: "/x/.stamity/runs/r/ledger.jsonl", content } })).toEqual({ kind: "writeEdit", chars: content.length });
    expect(
      ledgerWrite({ type: "tool_use", name: "MultiEdit", id: "m", input: { file_path: "ledger.jsonl", edits: [{ old_string: "a", new_string: "open" }, { old_string: "b", new_string: "fixed" }] } }),
    ).toEqual({ kind: "writeEdit", chars: 9 });
  });

  // build/33: the loop-characters gate counts exactly the ledger kinds REPLAY-v1 §8 names; any
  // other ledger-touching write comes back under its own kind, reported beside the gated figure.
  it("gates exactly the kinds REPLAY-v1 §8 names", () => {
    expect([...LEDGER_GATED_KINDS].toSorted()).toEqual(["echo", "heredoc", "verb", "writeEdit"]);
  });

  it("returns an unredirected heredoc that opens ledger.jsonl from code, with no phase rows, as its own kind", () => {
    const python = "import json\nrows=[json.loads(l) for l in open('.stamity/runs/r/ledger.jsonl')]\nopen('.stamity/runs/r/ledger.jsonl','w').write('')";
    const result = ledgerWrite(bash(`python3 - <<'PY'\n${python}\nPY`));
    expect(result).toEqual({ kind: "codeHeredoc", chars: python.length });
    expect(LEDGER_GATED_KINDS.has(result.kind)).toBe(false);
    const node = "const fs=require('fs');fs.appendFileSync('.stamity/runs/r/ledger.jsonl','x')";
    expect(ledgerWrite(bash(`node <<'JS'\n${node}\nJS`))).toEqual({ kind: "codeHeredoc", chars: node.length });
  });

  // build/35: a Write/Edit and a heredoc use one basename rule, so a helper script such as
  // ledger-round4.cjs is detected by both routes; it is not `ledger.jsonl`, so it is not gated.
  it("detects a ledger helper script by the same basename rule for a heredoc and a Write/Edit", () => {
    const body = "fs.appendFileSync('ledger.jsonl', rows)";
    const heredoc = ledgerWrite(bash(`cat > scratchpad/ledger-round4.cjs <<'EOF'\n${body}\nEOF`));
    const write = ledgerWrite({ type: "tool_use", name: "Write", id: "w", input: { file_path: "/s/scratchpad/ledger-round4.cjs", content: body } });
    const edit = ledgerWrite({ type: "tool_use", name: "Edit", id: "e", input: { file_path: "scratchpad/ledger-round4.cjs", old_string: "a", new_string: body } });
    expect(heredoc).toEqual({ kind: "helperHeredoc", chars: body.length });
    expect(write).toEqual({ kind: "helperWriteEdit", chars: body.length });
    expect(edit).toEqual({ kind: "helperWriteEdit", chars: body.length });
    for (const result of [heredoc, write, edit]) expect(LEDGER_GATED_KINDS.has(result.kind)).toBe(false);
    // The same file named ledger.jsonl stays gated by both routes.
    expect(ledgerWrite(bash(`tee -a runs/r/ledger.jsonl <<'EOF'\n${body}\nEOF`))).toEqual({ kind: "heredoc", chars: body.length });
  });

  // build/67: a read or search that names the ledger and "phase" is not a write; a redirect into
  // the ledger is, whatever the head verb; a script body typing a phase row beside it still is.
  it("counts the heredoc-free rule as a write only for a redirect or a non-read script", () => {
    // One case per member of the read/search set, each pinned to its class so the member is reached.
    for (const [read, cls] of [
      [`grep '"phase"' .stamity/runs/r/ledger.jsonl`, "search"],
      [`cat .stamity/runs/r/ledger.jsonl | grep '"phase":"build"'`, "read"],
      [`cat .stamity/runs/r/ledger.jsonl && grep '"phase"' .stamity/runs/r/ledger.jsonl`, "rs"],
      [`jq -c 'select(."phase")' .stamity/runs/r/ledger.jsonl && git status`, "mixed"],
    ] as const) {
      expect(bashClass(read).cls, read).toBe(cls);
      expect(ledgerWrite(bash(read)), read).toBeNull();
    }
    const echo = `echo '{"id":"r/build/5","phase":"build"}' >> .stamity/runs/r/ledger.jsonl`;
    expect(ledgerWrite(bash(echo))).toEqual({ kind: "echo", chars: echo.length });
    const grepAppend = `grep '"state":"open"' old.jsonl >> .stamity/runs/r/ledger.jsonl`;
    expect(ledgerWrite(bash(grepAppend))).toEqual({ kind: "echo", chars: grepAppend.length });
    const script = `python3 -c 'import json; open(".stamity/runs/r/ledger.jsonl","a").write(json.dumps({"phase":"build"}))'`;
    expect(ledgerWrite(bash(script))).toEqual({ kind: "echo", chars: script.length });
  });

  it("returns null for everything else", () => {
    expect(ledgerWrite(bash("cat .stamity/runs/r/ledger.jsonl"))).toBeNull();
    expect(ledgerWrite(bash("cat > lanes/brief-u1.md <<EOF\nappend your rows to ledger.jsonl with open(\nEOF"))).toBeNull();
    expect(ledgerWrite(bash("npm run ledger"))).toBeNull();
    expect(ledgerWrite({ type: "tool_use", name: "Read", id: "r", input: { file_path: ".stamity/runs/r/ledger.jsonl" } })).toBeNull();
    expect(ledgerWrite({ type: "tool_use", name: "Write", id: "w", input: { file_path: "record.md", content: "ledger.jsonl" } })).toBeNull();
  });
});

describe("roleFunction", () => {
  it.each([
    ["stamity-implementer", "build"],
    ["implementer", "build"],
    ["stamity-fixer", "fix"],
    ["stamity-reviewer", "verdict"],
    ["stamity-security", "verdict"],
    ["stamity-performance", "verdict"],
    ["stamity-design-quality", "verdict"],
    ["stamity-test-runner", "gate"],
    ["stamity-researcher", "other"],
    ["general-purpose", "other"],
    [null, "other"],
  ])("%s → %s", (subagentType, fn) => {
    expect(roleFunction(subagentType)).toBe(fn);
  });
});

describe("scanSubagent", () => {
  it("deduplicates assistant lines sharing a message.id and sums processed tokens", async () => {
    const agent = subagentFile({
      agentId: "a1",
      agentType: "stamity-reviewer",
      requestedModel: "fable",
      description: "u1-p1 review",
      toolUseId: "tu-rev",
      prompt: "Review u1-p1",
      requests: [
        { id: "r1", usage: { input: 100, cacheCreation: 2000, cacheRead: 0, output: 50, thinking: 20 }, lines: 2 },
        { id: "r2", model: "claude-fable-5-1", usage: { input: 10, cacheCreation: 30, cacheRead: 2000, output: 70 } },
      ],
    });
    const layout = writeCapture(scratch(), { transcript: [], subagents: [agent] });
    const scan = await scanSubagent(join(layout.subagentsDir, "agent-a1.jsonl"), join(layout.subagentsDir, "agent-a1.meta.json"));
    expect(agent.lines).toHaveLength(4);
    expect(scan).toEqual({
      agentType: "stamity-reviewer",
      requestedModel: "fable",
      models: { "claude-opus-5-5": 1, "claude-fable-5-1": 1 },
      nReq: 2,
      processed: 100 + 2000 + 50 + (10 + 30 + 2000 + 70),
      inputSide: 2100 + 2040,
      outTok: 120,
      think: 20,
      firstPrompt: "Review u1-p1",
      toolUseId: "tu-rev",
      description: "u1-p1 review",
      forbidHits: [],
      parseErrors: 0,
    });
  });

  it("reads a missing meta file as unknown role, model, dispatch id and description", async () => {
    const dir = scratch();
    const path = join(dir, "agent-b.jsonl");
    writeFileSync(path, `${subagentFile({ agentId: "b", agentType: "x", prompt: "p", requests: [] }).lines.join("\n")}\nnot json\n`);
    expect(await scanSubagent(path, join(dir, "agent-b.meta.json"))).toMatchObject({
      agentType: null,
      requestedModel: null,
      toolUseId: null,
      description: null,
      nReq: 0,
      parseErrors: 1,
      processed: 0,
      firstPrompt: "p",
    });
  });

  it("records a sub-agent's tool inputs that name a forbidden path", async () => {
    const agent = subagentFile({ agentId: "c", agentType: "stamity-reviewer", prompt: "Review u1-p1", requests: [] });
    agent.lines.push(mainLine.readToolUse({ id: "tu-c1", filePath: "/fixture/evals/replay/v1/seeds.json" }, { sidechain: true }));
    agent.lines.push(mainLine.bashToolUse({ id: "tu-c2", command: "grep -rn sort src" }, { sidechain: true }));
    const layout = writeCapture(scratch(), { transcript: [], subagents: [agent] });
    const [jsonl, meta] = [join(layout.subagentsDir, "agent-c.jsonl"), join(layout.subagentsDir, "agent-c.meta.json")];
    expect((await scanSubagent(jsonl, meta, { forbid: ["seeds.json"] })).forbidHits).toEqual([{ line: 2, toolUseId: "tu-c1", tool: "Read", forbid: "seeds.json" }]);
    expect((await scanSubagent(jsonl, meta)).forbidHits).toEqual([]);
  });
});

describe("walkTranscriptFile and writeCapture", () => {
  it("gives the same walk from the file as from the array, over a full capture layout", async () => {
    const lines = [
      ...reviewerPass().lines,
      mainLine.bashToolUse({ id: "tu-l", command: "cat >> .stamity/runs/r/ledger.jsonl <<EOF\n{}\nEOF" }),
      mainLine.toolResult("tu-l", ""),
      mainLine.compactBoundary({ trigger: "auto", preTokens: 900_000 }),
      mainLine.taskNotification({ taskId: "a9", toolUseId: "tu-q", result: "late", via: "queued" }),
      "{broken",
    ];
    const layout = writeCapture(scratch(), {
      run: { shape: "baseline" },
      transcript: lines,
      markers: [{ v: 1, event: "PreCompact" }],
      snapshots: { "u1-p1": { main: { "src/store/query.ts": "export {}\n" } } },
      state: { "compaction-1-pre": { runId: "2026-09-23_replay", ledger: [{ id: "x/build/1" }], reports: { "u1-p1-reviewer-r1.md": "# r\n" } } },
    });
    const fromFile = (await walkTranscriptFile(layout.transcript)) as Walk;
    expect(fromFile).toEqual(walk(lines));
    const forbid = { forbid: ["ledger.jsonl"] };
    const forbidden = (await walkTranscriptFile(layout.transcript, forbid)) as Walk & { forbidHits: Row[] };
    expect(forbidden.forbidHits.map((hit) => hit["toolUseId"])).toEqual(["tu-rev", "tu-l"]);
    expect(forbidden).toEqual(walkTranscriptLines(lines, forbid));
    expect(fromFile.skipped).toMatchObject({ lines: lines.length, segments: 2, entryTypes: { PARSE_ERROR: 1 } });
    expect(fromFile.compactions).toHaveLength(1);
    expect(fromFile.deliveries.map((delivery) => delivery["seg"])).toEqual([0, 1]);

    expect(JSON.parse(readFileSync(layout.runJson, "utf8"))).toEqual({ end: { reason: "complete" }, shape: "baseline" });
    expect(readFileSync(join(layout.snapshots, "u1-p1", "main", "src", "store", "query.ts"), "utf8")).toBe("export {}\n");
    const pre = join(layout.state, "compaction-1-pre", "runs", "2026-09-23_replay");
    expect(readFileSync(join(pre, "ledger.jsonl"), "utf8")).toBe('{"id":"x/build/1"}\n');
    expect(existsSync(join(pre, "reports", "u1-p1-reviewer-r1.md"))).toBe(true);
    for (const file of ["stdin.jsonl", "stdout.jsonl", "stderr.txt", "markers.jsonl", "oracle.json", join("final", "tree.diff")]) {
      expect(existsSync(join(layout.captures, file)), file).toBe(true);
    }
  });

  it("rejects a missing transcript file", async () => {
    await expect(walkTranscriptFile(join(scratch(), "absent.jsonl"))).rejects.toThrow(/ENOENT/);
  });
});
