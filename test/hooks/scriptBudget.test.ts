
/**
 * The package and version the core scripts' CLI hints pin (sw26-engine-cli-call-form,
 * REQ-FLOW-002). Passed as a literal, not read from this checkout, so the bytes
 * under test are the same in a renamed fork.
 */
const CLI_PIN = { packageName: "@zomarit/stamity", version: "1.0.0-golden" };
/**
 * Byte and line ceilings on the emitted core hook scripts (REQ-CTX-016).
 *
 * Every core script is rendered for every client in both placements a sync can
 * write — the repository's generated layout and a plugin root — and the larger
 * of the two is held to {@link HOOK_SCRIPT_BUDGETS}. A hook script is parsed on
 * every session start or every tool call, so growth there is paid per call;
 * the ceiling makes that growth a reviewed edit to the table instead of drift.
 */
import { describe, expect, it } from "vitest";
import { CLIENT_EXTENSION_EVENTS, CLIENT_HOOK_GUARANTEES } from "../../src/hooks/model.ts";
import {
  buildReviewGateScript,
  buildUnattendedAskGate,
  HOOK_SCRIPT_BUDGETS,
  type HookScriptLayout,
  PERSON_ONLY_GUARD_FILE,
  planCoreHookScripts,
  REVIEW_GATE_FILE,
  REVIEW_GATE_STATE_FILE,
  UNATTENDED_ASK_GATE_FILE,
} from "../../src/hooks/scripts.ts";
import { HARD_MAX_REVIEW_ITERATIONS } from "../../src/roster/reviewCaps.ts";
import { AGENT_TOOL_POLICIES_FILE } from "../../src/tools/allowlist.ts";
import { type Tool, TOOLS } from "../../src/types/core.ts";

/** One rendered script, measured. */
interface Rendered {
  tool: Tool;
  fileName: string;
  content: string;
}

/**
 * The policy path each placement hands `planCoreHookScripts`, the same two
 * shapes `policiesPathFor` in `src/emit/hooksInfra.ts` produces: a climb in the
 * repository layout, a sibling name inside a plugin root.
 */
const POLICY_PATH_BY_LAYOUT: Readonly<Record<HookScriptLayout, string>> = {
  generated: `../../${AGENT_TOOL_POLICIES_FILE}`,
  container: AGENT_TOOL_POLICIES_FILE,
};

const LAYOUTS = Object.keys(POLICY_PATH_BY_LAYOUT) as HookScriptLayout[];

/**
 * The clients whose adapter places the review gate. `planCoreHookScripts` does
 * not return that script — the Claude adapter builds and wires it off its
 * non-ConfigChange rows of `CLIENT_EXTENSION_EVENTS` (`src/adapters/claude.ts`,
 * `REVIEW_GATE_EVENTS`) — so the set is derived from the same rows. A client
 * outside it has no review gate, and is skipped rather than failed.
 */
const REVIEW_GATE_TOOLS: ReadonlySet<Tool> = new Set(
  CLIENT_EXTENSION_EVENTS.filter((row) => row.event !== "ConfigChange").map((row) => row.tool),
);

/**
 * The clients whose adapter places the unattended ask gate: Claude Code alone,
 * the one client with a question tool a PreToolUse hook can refuse
 * (REQ-FLOW-090). Like the review gate, `planCoreHookScripts` does not return it.
 */
const ASK_GATE_TOOLS: ReadonlySet<Tool> = new Set<Tool>(["claude"]);

/** Lines as the budget counts them: `\n` only, so CRLF and LF count alike. */
function lineCount(content: string): number {
  return content.split("\n").length - 1;
}

/**
 * Every core script for one client, in one layout. The review gate is rendered
 * the way the Claude adapter renders it, at the largest cap a manifest can set
 * (the cap is the only number in the body that varies with configuration).
 */
function renderAll(tool: Tool, layout: HookScriptLayout): Rendered[] {
  // The person-only shell guard is rendered on request (emission asks for it), so it is asked for here.
  const core = planCoreHookScripts(POLICY_PATH_BY_LAYOUT[layout], tool, { ...CLI_PIN, personOnlyGuard: true }).map((script) => ({
    tool,
    fileName: script.fileName,
    content: script.content,
  }));
  const askGate: Rendered[] = ASK_GATE_TOOLS.has(tool)
    ? [{ tool, fileName: UNATTENDED_ASK_GATE_FILE, content: buildUnattendedAskGate({ layout }) }]
    : [];
  if (!REVIEW_GATE_TOOLS.has(tool)) return [...core, ...askGate];
  const failMode =
    CLIENT_HOOK_GUARANTEES.find((guarantee) => guarantee.tool === tool)?.failMode ?? "fail-closed";
  return [
    ...core,
    {
      tool,
      fileName: REVIEW_GATE_FILE,
      content: buildReviewGateScript({
        statePath: REVIEW_GATE_STATE_FILE,
        maxIterations: HARD_MAX_REVIEW_ITERATIONS,
        failMode,
        layout,
      }),
    },
    ...askGate,
  ];
}

/** For each client × script, the larger of the two layouts' renders. */
function largestRenders(render: (tool: Tool, layout: HookScriptLayout) => Rendered[]): Rendered[] {
  const largest = new Map<string, Rendered>();
  for (const tool of TOOLS) {
    for (const layout of LAYOUTS) {
      for (const script of render(tool, layout)) {
        const key = `${script.tool}/${script.fileName}`;
        const held = largest.get(key);
        if (held === undefined || Buffer.byteLength(script.content) > Buffer.byteLength(held.content)) {
          largest.set(key, script);
        }
      }
    }
  }
  return [...largest.values()];
}

/**
 * The violation for one render, or `undefined` when it is inside both ceilings.
 * The wording follows `scripts/size-budget.mjs`: what was measured, against
 * what, and the two honest ways out.
 */
function budgetViolation(script: Rendered): string | undefined {
  const budget = HOOK_SCRIPT_BUDGETS[script.fileName];
  if (budget === undefined) {
    return `${script.tool}/${script.fileName}: no budget declared. Add one to HOOK_SCRIPT_BUDGETS in src/hooks/scripts.ts`;
  }
  const bytes = Buffer.byteLength(script.content);
  const lines = lineCount(script.content);
  if (bytes <= budget.bytes && lines <= budget.lines) return undefined;
  return (
    `${script.tool}/${script.fileName}: ${bytes} bytes of ${budget.bytes} (${lines} of ${budget.lines} lines). ` +
    `Reduce the script, or move the budget in src/hooks/scripts.ts with the reason it moved`
  );
}

describe("hook script budgets (REQ-CTX-016)", () => {
  const renders = largestRenders(renderAll);

  it("renders every budgeted script at least once, and every rendered script has a budget", () => {
    // Guards both directions: a budget row for a script no client emits any more
    // is a ceiling on nothing, and a new script with no row would be unbounded.
    const rendered = new Set(renders.map((script) => script.fileName));
    expect([...rendered].toSorted()).toEqual(Object.keys(HOOK_SCRIPT_BUDGETS).toSorted());
    // Four clients × four core scripts (the person-only guard among them), plus the review gate where it is wired.
    // Moved from × 3 by u14-shell-guard: the guard is a core script with a budget row of its own.
    // Moved by u14b-ask-gate: the ask gate is a fifth script with a budget row, rendered where its adapter places it.
    expect(renders).toHaveLength(TOOLS.length * 4 + REVIEW_GATE_TOOLS.size + ASK_GATE_TOOLS.size);
  });

  it.each(renders.map((script) => [`${script.tool}/${script.fileName}`, script] as const))(
    "%s is within its byte and line ceilings",
    (_name, script) => {
      expect(budgetViolation(script)).toBeUndefined();
    },
  );

  it("fails an oversized render with a message naming the file and both numbers", () => {
    // Test-only wrapper: the real renders plus 30 KiB appended to one guard, as
    // 1,024 lines of 30 bytes, so both ceilings are crossed at once.
    const padding = `// ${"x".repeat(26)}\n`.repeat(1_024);
    expect(Buffer.byteLength(padding)).toBe(30_720);
    const oversized = largestRenders((tool, layout) =>
      renderAll(tool, layout).map((script) =>
        tool === "claude" && script.fileName === "stamity-pre-tool-use-guard.mjs"
          ? { tool: script.tool, fileName: script.fileName, content: script.content + padding }
          : script,
      ),
    );
    const violations = oversized.map(budgetViolation).filter((message) => message !== undefined);
    const guard = renders.find(
      (script) => script.tool === "claude" && script.fileName === "stamity-pre-tool-use-guard.mjs",
    );
    if (guard === undefined) throw new Error("the claude guard was not rendered");
    const bytes = Buffer.byteLength(guard.content) + 30_720;
    const lines = lineCount(guard.content) + 1_024;
    expect(violations).toEqual([
      `claude/stamity-pre-tool-use-guard.mjs: ${bytes} bytes of 24576 (${lines} of 600 lines). ` +
        `Reduce the script, or move the budget in src/hooks/scripts.ts with the reason it moved`,
    ]);
  });

  it("holds the session start, cloud detection included, to its fixed ceiling", () => {
    // REQ-FLOW-085 grew the session start; it had to fit, not move the row. The
    // literal pins the plan's fixed ceiling so a raise is a visible edit here too.
    // TEST CHANGE, justified: raised 2026-10-18 by plan 021 file 2's v1-branch-card, whose startup
    // card and shared HEAD reader took the render to 50,647 / 1,114 bytes and lines, past 49,152 /
    // 1,100; measured × 1.25 and rounded as the review gate's row is, the reason stated in the row.
    expect(HOOK_SCRIPT_BUDGETS["stamity-session-start.mjs"]).toEqual({ bytes: 63_488, lines: 1_400 });
    const sessionStarts = renders.filter((script) => script.fileName === "stamity-session-start.mjs");
    expect(sessionStarts).toHaveLength(TOOLS.length);
    for (const script of sessionStarts) {
      expect(script.content, script.tool).toContain("Session: ");
      expect(budgetViolation(script), script.tool).toBeUndefined();
    }
  });

  it("holds the review gate, the rebuild of a missing counter included, to its row (REQ-FLOW-106)", () => {
    // The rebuild had to fit, not move the row: the literal pins it so a raise is a visible edit here too.
    expect(HOOK_SCRIPT_BUDGETS[REVIEW_GATE_FILE]).toEqual({ bytes: 51_200, lines: 1_120 });
    const gates = renders.filter((script) => script.fileName === REVIEW_GATE_FILE);
    expect(gates.length).toBeGreaterThan(0);
    for (const script of gates) {
      expect(script.content, script.tool).toContain("function rebuilt(root)");
      expect(budgetViolation(script), script.tool).toBeUndefined();
    }
  });

  it("holds the person-only guard to the row re-sized from its last measurement (review/219)", () => {
    // The literal pins the re-sized row, so its next move is a visible edit here too, with its reason in the row.
    expect(HOOK_SCRIPT_BUDGETS[PERSON_ONLY_GUARD_FILE]).toEqual({ bytes: 156_672, lines: 3_830 }); // Re-sized 2026-10-18 from round 4's fresh measurement, the same rule as review/219.
    const guards = renders.filter((script) => script.fileName === PERSON_ONLY_GUARD_FILE);
    expect(guards).toHaveLength(TOOLS.length);
    for (const script of guards) expect(budgetViolation(script), script.tool).toBeUndefined();
  });

  it("counts CRLF and LF line endings alike", () => {
    const [first] = renders;
    if (first === undefined) throw new Error("no script was rendered");
    const crlf = first.content.replaceAll("\n", "\r\n");
    expect(lineCount(crlf)).toBe(lineCount(first.content));
    expect(lineCount(first.content)).toBeGreaterThan(0);
  });

  it("wires the review gate only where an adapter places it, and skips the rest", () => {
    const gated = renders.filter((script) => script.fileName === REVIEW_GATE_FILE).map((script) => script.tool);
    expect(gated).toEqual(TOOLS.filter((tool) => REVIEW_GATE_TOOLS.has(tool)));
    expect(gated.length).toBeGreaterThan(0);
  });

  it("renders the unattended ask gate on Claude Code only, within its ceilings", () => {
    const gated = renders.filter((script) => script.fileName === UNATTENDED_ASK_GATE_FILE);
    expect(gated.map((script) => script.tool)).toEqual(["claude"]);
    for (const script of gated) expect(budgetViolation(script)).toBeUndefined();
  });
});
