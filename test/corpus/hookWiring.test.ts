import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { GENERATED_DIR } from "../../src/emit/hooksInfra.ts";
import { CLIENT_EXTENSION_EVENTS, CLIENT_HOOK_GUARANTEES } from "../../src/hooks/model.ts";
import {
  buildReviewGateScript,
  IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS,
  MAX_POLICY_FILE_BYTES,
  planCoreHookScripts,
  REVIEW_GATE_FILE,
  REVIEW_GATE_STATE_FILE,
  type GeneratedHookScript,
} from "../../src/hooks/scripts.ts";
import { AGENT_POLICY_ROSTER, RUNTIME_AGENT_IDS } from "../../src/roster/agentPolicies.ts";
import {
  DEFAULT_MAX_REVIEW_ITERATIONS,
  HARD_MAX_REVIEW_ITERATIONS,
  MIN_MAX_REVIEW_ITERATIONS,
} from "../../src/roster/reviewCaps.ts";
import {
  AGENT_TOOL_POLICIES_FILE,
  AGENT_TOOL_POLICIES_SCHEMA,
  buildAgentToolPoliciesJson,
  checkToolAccess,
} from "../../src/tools/allowlist.ts";
import {
  ALL_TOOL_CATEGORIES,
  buildToolCategoryMap,
  FUNCTIONAL_TOOL_CATEGORIES,
  type CategoryToolNames,
  type ToolCategoryMap,
} from "../../src/tools/categories.ts";
import { toClaudeToolsFrontmatter } from "../../src/tools/translator.ts";
import { TOOLS, type Tool } from "../../src/types/core.ts";
import { useTempDir } from "../support/tempDir.ts";
import { walkAllMarkdown } from "./harness.ts";

/**
 * Wiring parity: the hook facts the content design states, asserted against
 * what the engine actually emits for the shipped roster.
 *
 * The three scripts, the portable-event carriers and the per-client guarantee
 * ladder are engine code with its own suite; this one binds the corpus-side
 * claims to them — three core scripts and no fourth, a guard whose blocking
 * strength is the client's real one rather than a uniform promise, and a
 * policy document that carries every rostered grant to the one enforcement
 * point that survives outside the engine.
 *
 * The guard runs as a real child process on a real document, because that is
 * the only way to learn what a client would learn: parse it, feed it a call,
 * read the exit status.
 */

const getRepo = useTempDir("hook-wiring");

/** Emission layout: scripts in a directory, the policy document one level above them. */
const SCRIPT_DIR = "hooks";
const POLICY_PATH_FROM_SCRIPT = `../${AGENT_TOOL_POLICIES_FILE}`;

/** The portable carriers the three core scripts attach to, in plan order. */
const CORE_EVENTS = ["session_start", "pre_tool_use", "session_start"] as const;

/**
 * Client-native tool name to category for the dialect the guard's own table is
 * built from, so an expectation here is stated in the names a client sends
 * rather than in a category the test picked.
 */
const CLIENT_TOOL_CATEGORIES: ToolCategoryMap = buildToolCategoryMap(
  Object.fromEntries(
    FUNCTIONAL_TOOL_CATEGORIES.map((category) => [
      category,
      toClaudeToolsFrontmatter([category])
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== ""),
    ]),
  ) as CategoryToolNames,
);

interface GuardCase {
  readonly agentId: string;
  readonly tool: string;
  readonly allowed: boolean;
  /** Refusal code the guard reports; absent on an authorized call. */
  readonly reasonCode?: string;
}

/**
 * One authorized and one refused call across the grant shapes the roster
 * actually holds, plus the two scope edges: an agent the corpus added without
 * a roster row, and a caller outside the generated-content namespace.
 */
const GUARD_CASES: readonly GuardCase[] = [
  { agentId: "stamity-implementer", tool: "Edit", allowed: true },
  { agentId: "stamity-reviewer", tool: "Edit", allowed: false, reasonCode: "CATEGORY_DENIED" },
  { agentId: "stamity-researcher", tool: "WebFetch", allowed: true },
  { agentId: "stamity-implementer", tool: "WebFetch", allowed: false, reasonCode: "CATEGORY_DENIED" },
  { agentId: "stamity-test-runner", tool: "Bash", allowed: true },
  { agentId: "stamity-spec-author", tool: "Bash", allowed: false, reasonCode: "CATEGORY_DENIED" },
  // No row holds `spawn`, so the delegation tool refuses for every agent.
  { agentId: "stamity-creator", tool: "Agent", allowed: false, reasonCode: "CATEGORY_DENIED" },
  // The silent-lockout edge: a shipped agent with no roster row may use nothing.
  { agentId: "stamity-specialist-security", tool: "Read", allowed: false, reasonCode: "NO_POLICY" },
];

interface EmittedPolicy {
  agentId: string;
  allow: string[];
  denyTools?: string[];
  rationale: string;
}

interface PolicyDocument {
  schema: string;
  categories: string[];
  policies: EmittedPolicy[];
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs a generated script the way a client does: fresh process, piped stdio. */
function run(file: string, input: string): RunResult {
  const result = spawnSync(process.execPath, [file], { input, encoding: "utf8" });
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

function guardOf(plan: readonly GeneratedHookScript[]): GeneratedHookScript {
  const guard = plan.find((script) => script.event === "pre_tool_use");
  if (guard === undefined) throw new Error("the core plan emitted no pre_tool_use script");
  return guard;
}

/** Guard for one client plus the policy document built from the shipped roster. */
async function placeGuardFor(tool: Tool): Promise<string> {
  const guard = guardOf(planCoreHookScripts(POLICY_PATH_FROM_SCRIPT, tool));
  await getRepo().seedFiles({
    [AGENT_TOOL_POLICIES_FILE]: buildAgentToolPoliciesJson(AGENT_POLICY_ROSTER),
    [`${SCRIPT_DIR}/${guard.fileName}`]: guard.content,
  });
  return getRepo().path(SCRIPT_DIR, guard.fileName);
}

function call(agentId: string, tool: string): string {
  return JSON.stringify({ agent_type: agentId, agent_id: `${agentId}-01`, tool_name: tool });
}

/** The refusal event a guard reports on stderr, parsed. */
function refusal(result: RunResult): Record<string, unknown> {
  const line = result.stderr.trim().split("\n").at(-1) ?? "";
  return JSON.parse(line) as Record<string, unknown>;
}

function policyDocument(): PolicyDocument {
  return JSON.parse(buildAgentToolPoliciesJson(AGENT_POLICY_ROSTER)) as PolicyDocument;
}

describe("core hook script set", () => {
  it("plans three scripts for every client, on the portable events they ride", () => {
    for (const tool of TOOLS) {
      const plan = planCoreHookScripts(POLICY_PATH_FROM_SCRIPT, tool);

      expect(plan, tool).toHaveLength(3);
      expect(plan.map((script) => script.event), tool).toEqual([...CORE_EVENTS]);
      // No fourth carrier: the configuration-change notice rides session start
      // because no portable configuration-change event exists to give it.
      const names = plan.map((script) => script.fileName);
      expect(new Set(names).size, tool).toBe(3);
      for (const name of names) expect(name, tool).toMatch(/^stamity-[a-z-]+\.mjs$/);
    }
  });

  it("gives each client's guard that client's real blocking strength, not a uniform promise", () => {
    for (const guarantee of CLIENT_HOOK_GUARANTEES) {
      const guard = guardOf(planCoreHookScripts(POLICY_PATH_FROM_SCRIPT, guarantee.tool)).content;
      // Two determinants, not one. `failMode` says whether the client honours a
      // blocking exit status; payload identity says whether the guard's scope
      // test can ever match, and a guard that cannot name the caller reaches no
      // verdict to enforce. Deriving from the fail mode alone was how Cursor
      // came to advertise a gate that returns early on every call it sees.
      const identityBearing = !IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS.has(guarantee.tool);
      const blocking = guarantee.failMode !== "fail-open" && identityBearing;

      expect(guard, guarantee.tool).toContain(`const BLOCKING = ${String(blocking)};`);
      if (blocking) {
        expect(guard, guarantee.tool).toContain("Blocking client:");
        expect(guard, guarantee.tool).toContain("const BLOCK_EXIT = 2;");
      } else {
        // A log that reads as enforcement which never happened is the failure
        // mode this banner exists to prevent — and the two ways of not enforcing
        // are named apart, because a client that ignores the exit status still
        // reaches a verdict and one whose payload names no agent never does.
        expect(guard, guarantee.tool).toContain(
          identityBearing ? "Reporting-only client:" : "Telemetry only on this client,",
        );
        expect(guard, guarantee.tool).not.toContain("Blocking client:");
      }
    }
  });

  it("keeps the guarantee ladder the hook model publishes", () => {
    const ladder = CLIENT_HOOK_GUARANTEES.map((row) => [row.tool, row.failMode, row.blockingExitCode]);

    expect(ladder).toEqual([
      ["claude", "fail-closed", 2],
      ["codex", "fail-closed", 2],
      ["cursor", "opt-in-fail-closed", 2],
      ["copilot", "fail-open", null],
    ]);
    expect(CLIENT_HOOK_GUARANTEES.map((row) => row.tool).toSorted()).toEqual([...TOOLS].toSorted());
  });

  it("names the clients whose pre-tool-use payload carries no agent identity", () => {
    // The posture above derives from this set, so the set itself is pinned by
    // hand rather than derived: Cursor's tool-call payload carries no identity
    // field (`src/adapters/cursor.ts`; cursor.com/docs/agent/hooks, accessed
    // 2026-08-17) and every other client's does. A row arriving here downgrades
    // that client's guard from a control to a record, which is a protocol
    // finding about that client, never a refactor.
    expect([...IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS]).toEqual(["cursor"]);
  });
});

describe("emitted policy document", () => {
  it("declares the schema the guard checks for, one policy per rostered agent", () => {
    const document = policyDocument();

    expect(document.schema).toBe(AGENT_TOOL_POLICIES_SCHEMA);
    expect(AGENT_TOOL_POLICIES_SCHEMA).toBe("stamity/agent-tool-policies/v1");
    expect(document.categories).toEqual([...ALL_TOOL_CATEGORIES]);
    // Both counts, because they answer different questions: the literal says
    // all ten shipped agents reached the guard, the derived one says the
    // emitter dropped none of whatever the roster currently holds.
    // Re-pinned from 7 to 10 — the shipped roster grew by the three
    // trigger-conditional specialists, the same count `test/corpus/census.test.ts`
    // and `test/roster/agentPolicies.test.ts` already carry. The guard's
    // behavior did not move; only the number of agents reaching it did.
    expect(document.policies).toHaveLength(10);
    expect(document.policies).toHaveLength(AGENT_POLICY_ROSTER.length);
    expect(document.policies.map((policy) => policy.agentId)).toEqual(
      [...RUNTIME_AGENT_IDS].toSorted(),
    );
  });

  it("carries every grant through the sanitizing emitter unchanged", () => {
    const document = policyDocument();

    for (const row of AGENT_POLICY_ROSTER) {
      const emitted = document.policies.find((policy) => policy.agentId === row.agentId);
      expect(emitted, row.agentId).toBeDefined();
      // Categories emit in canonical taxonomy order regardless of how the row
      // was authored, so the document is byte-stable across a re-ordered roster.
      expect(emitted?.allow, row.agentId).toEqual(
        FUNCTIONAL_TOOL_CATEGORIES.filter((category) => row.allow.includes(category)),
      );
      expect(emitted?.rationale, row.agentId).toBe(row.rationale);
      // Nothing was dropped on the way out: a stripped category would leave the
      // guard enforcing a narrower grant than the roster states.
      expect(emitted?.allow.length, row.agentId).toBe(row.allow.length);
      expect(Object.hasOwn(emitted ?? {}, "denyTools"), row.agentId).toBe(false);
    }
  });

  it("fits well under the size the guard refuses to parse", () => {
    const bytes = Buffer.byteLength(buildAgentToolPoliciesJson(AGENT_POLICY_ROSTER), "utf8");

    expect(bytes).toBeLessThan(MAX_POLICY_FILE_BYTES);
  });
});

describe("the guard running on the shipped roster", () => {
  it("rules each call the way the roster says, on a client that honours the status", async () => {
    const guard = await placeGuardFor("claude");

    for (const testCase of GUARD_CASES) {
      const result = run(guard, call(testCase.agentId, testCase.tool));
      const label = `${testCase.agentId} -> ${testCase.tool}`;

      if (testCase.allowed) {
        expect(result, label).toEqual({ code: 0, stdout: "", stderr: "" });
        continue;
      }
      expect(result.code, label).toBe(2);
      expect(refusal(result), label).toMatchObject({
        hook: "stamity-pre-tool-use-guard",
        blocked: true,
        agentId: testCase.agentId,
        tool: testCase.tool,
        reasonCode: testCase.reasonCode,
      });
      // The decision channel is stderr; stdout is what feeds a session.
      expect(result.stdout, label).toBe("");
    }
  });

  it("reaches the same verdict as the in-process check, case for case", () => {
    // Two enforcement points, one roster: a disagreement means an agent is
    // authorized at the delegation boundary and refused at runtime, or worse,
    // the reverse.
    for (const testCase of GUARD_CASES) {
      const verdict = checkToolAccess(
        AGENT_POLICY_ROSTER,
        testCase.agentId,
        testCase.tool,
        CLIENT_TOOL_CATEGORIES,
      );

      expect(verdict.allowed, `${testCase.agentId} -> ${testCase.tool}`).toBe(testCase.allowed);
    }
  });

  it("reports the same refusal on a client that never blocks, and lets the call through", async () => {
    const guard = await placeGuardFor("copilot");

    const result = run(guard, call("stamity-reviewer", "Edit"));

    expect(result.code).toBe(0);
    expect(refusal(result)).toMatchObject({
      blocked: false,
      agentId: "stamity-reviewer",
      reasonCode: "CATEGORY_DENIED",
    });
  });

  it("leaves callers outside the generated namespace alone", async () => {
    const guard = await placeGuardFor("claude");

    // The main thread and the client's own agents are not this setup's to
    // police, and a guard that denied them would brick the session.
    for (const agentId of ["general-purpose", "explore", ""]) {
      const result = run(guard, call(agentId, "Bash"));
      expect(result, agentId).toEqual({ code: 0, stdout: "", stderr: "" });
    }
  });
});

describe("the work-scoped review gate beside the core set", () => {
  const gateScript = buildReviewGateScript({
    statePath: REVIEW_GATE_STATE_FILE,
    maxIterations: DEFAULT_MAX_REVIEW_ITERATIONS,
    failMode: "fail-closed",
  });

  it("rides beside the core plan rather than in it, on every client", () => {
    for (const tool of TOOLS) {
      const names = planCoreHookScripts(POLICY_PATH_FROM_SCRIPT, tool).map((script) => script.fileName);

      // Work-command-scoped adapter residue, not one of the three things every
      // generated setup does at runtime — the census stays at three.
      expect(names, tool).toHaveLength(3);
      expect(names, tool).not.toContain(REVIEW_GATE_FILE);
    }
  });

  it("keeps its counter outside the tree a sync regenerates", () => {
    // Live run state under the generated tree is deleted by the next sync, and
    // a gate that loses its counter mid-loop re-opens a converged run.
    expect(REVIEW_GATE_STATE_FILE.startsWith(`${GENERATED_DIR}/`)).toBe(false);
    expect(REVIEW_GATE_STATE_FILE).not.toContain("/generated/");
    expect(GENERATED_DIR.startsWith(".stamity/")).toBe(true);
    expect(REVIEW_GATE_STATE_FILE.startsWith(".stamity/")).toBe(true);
  });

  it("states the cap the work command's ladder states, and the band the engine clamps to", async () => {
    const work = (await walkAllMarkdown()).find((file) => file.relPath === "commands/st-work.md");

    expect(work, "commands/st-work.md").toBeDefined();
    // Three surfaces, one number: the prose an agent follows, the engine
    // constant, and the generated script an operator reads.
    expect(work?.raw).toMatch(new RegExp(`\\b${DEFAULT_MAX_REVIEW_ITERATIONS} rounds\\b`));
    expect(work?.raw).toMatch(
      new RegExp(`${MIN_MAX_REVIEW_ITERATIONS}\\.\\.${HARD_MAX_REVIEW_ITERATIONS}`),
    );
    expect(gateScript).toContain(`const MAX_ROUNDS = ${DEFAULT_MAX_REVIEW_ITERATIONS};`);
    // The ladder past the cap is prose everywhere, including on the client that
    // fires the gate: the hook opens at the cap and the run ends here.
    expect(work?.raw).toContain("BLOCKED_FAILURE");
    expect(gateScript).toContain("BLOCKED_FAILURE");
  });

  it("claims the gate only where the client fires the events, and the twin elsewhere", () => {
    const firing = new Set(CLIENT_EXTENSION_EVENTS.map((row) => row.tool));

    expect([...firing]).toEqual(["claude"]);
    for (const tool of TOOLS.filter((candidate) => !firing.has(candidate))) {
      // No extension row, so nothing here promises a gate; what these clients
      // get is the ladder work's own prompt carries, and their hook guarantee
      // row still states what a hook CAN do there.
      expect(CLIENT_EXTENSION_EVENTS.some((row) => row.tool === tool), tool).toBe(false);
      expect(CLIENT_HOOK_GUARANTEES.some((row) => row.tool === tool), tool).toBe(true);
    }
  });

  it("reads the verdict off the field the stop event carries, and says so in the table", async () => {
    const subagentStop = CLIENT_EXTENSION_EVENTS.find((row) => row.event === "SubagentStop");
    const reviewer = (await walkAllMarkdown()).find(
      (file) => file.relPath === "agents/stamity-reviewer.md",
    );

    // Three surfaces, one carrier. The client sends the finishing agent's final
    // text and no verdict field of any name, the reviewer contract puts its
    // verdict in that text, and the gate parses it from there. A gate reading a
    // field nothing populates would never release a converged run — it would
    // hold every completion to the cap and then call it BLOCKED_FAILURE.
    expect(gateScript).toContain('"last_assistant_message"');
    expect(subagentStop?.note).toContain("last_assistant_message");
    expect(reviewer?.raw).toMatch(/verdict is one of `approve`, `request-changes`,\s*`blocked`/);
    for (const verdict of ["approve", "request-changes", "blocked"]) {
      expect(gateScript, verdict).toContain(`"${verdict}"`);
    }
  });

  it("carries each client's honest blocking strength, exactly as the guard does", () => {
    for (const guarantee of CLIENT_HOOK_GUARANTEES) {
      const gate = buildReviewGateScript({
        statePath: REVIEW_GATE_STATE_FILE,
        maxIterations: DEFAULT_MAX_REVIEW_ITERATIONS,
        failMode: guarantee.failMode,
      });
      const blocking = guarantee.failMode !== "fail-open";

      expect(gate, guarantee.tool).toContain(`const BLOCKING = ${String(blocking)};`);
      expect(gate, guarantee.tool).toContain(`const BLOCK_EXIT = ${guarantee.blockingExitCode ?? 2};`);
    }
  });
});
