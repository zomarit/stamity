import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildPreToolUseGuardScript,
  unionToolCategoryMap,
} from "../../src/hooks/scripts.ts";
import { AGENT_POLICY_ROSTER } from "../../src/roster/agentPolicies.ts";
import {
  buildAgentToolPoliciesJson,
  checkToolAccess,
  type AgentToolPolicy,
} from "../../src/tools/allowlist.ts";
import {
  ALL_TOOL_CATEGORIES,
  FUNCTIONAL_TOOL_CATEGORIES,
  RESERVED_TOOL_CATEGORIES,
  type ToolCategory,
} from "../../src/tools/categories.ts";
import {
  ADAPTER_ALLOWLIST_COVERAGE,
  PLATFORM_TOOL_MARKER,
  buildAllowlistCoverageTable,
  buildAskUserPlatformTable,
  getAskUserToolEntry,
  substituteCanonicalPlatformMarker,
  toClaudeToolsFrontmatter,
  toCodexToolsFrontmatter,
  toCopilotToolsFrontmatter,
  toCursorReadonlyFrontmatter,
} from "../../src/tools/translator.ts";
import { TOOLS, type Tool } from "../../src/types/core.ts";
import { EngineError } from "../../src/types/errors.ts";

/**
 * Every client's grant transform, keyed by the tool it renders for. The
 * `Record<Tool, …>` type is half the drift guard — a new tool without a
 * transform fails to typecheck here; the row-count assertions below are the
 * other half, catching a transform that exists but is never wired.
 */
const TRANSFORMS: Record<Tool, (categories: readonly ToolCategory[]) => string | boolean | null> = {
  claude: toClaudeToolsFrontmatter,
  cursor: toCursorReadonlyFrontmatter,
  copilot: toCopilotToolsFrontmatter,
  codex: toCodexToolsFrontmatter,
};

/** A grant holding every category a policy can actually hold. */
const FULL_GRANT: readonly ToolCategory[] = [...FUNCTIONAL_TOOL_CATEGORIES];

/** Everything except the two categories Cursor's boolean treats as mutating. */
const READ_ONLY_GRANT: readonly ToolCategory[] = ["read", "network", "spawn", "planning"];

function expectEngineError(run: () => unknown, code: EngineError["code"]): EngineError {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(EngineError);
  const error = thrown as EngineError;
  expect(error.code).toBe(code);
  return error;
}

/** A category that passed a type boundary without being one — the runtime case. */
const UNKNOWN_CATEGORY = ["telepathy"] as unknown as readonly ToolCategory[];

describe("client coverage", () => {
  it("declares one transform and one coverage row per target tool", () => {
    expect(Object.keys(TRANSFORMS).toSorted()).toEqual([...TOOLS].toSorted());
    expect(ADAPTER_ALLOWLIST_COVERAGE).toHaveLength(TOOLS.length);
    expect(ADAPTER_ALLOWLIST_COVERAGE.map((row) => row.tool)).toEqual([...TOOLS]);
  });

  it("renders a grant for every tool without throwing", () => {
    for (const tool of TOOLS) {
      expect(() => TRANSFORMS[tool](FULL_GRANT)).not.toThrow();
    }
    // Adjusted for the category resolution: `Skill` (procedure ingestion)
    // joined `read` and `Task` (the accepted alias of `Agent`) joined `spawn`
    // in CLAUDE_TOOL_NAMES, so the full-grant rendering gained both names.
    expect(toClaudeToolsFrontmatter(FULL_GRANT)).toBe(
      "Read, Grep, Glob, Skill, Edit, Write, NotebookEdit, Bash, PowerShell, WebFetch, WebSearch, Agent, Task, TodoWrite",
    );
    expect(toCopilotToolsFrontmatter(FULL_GRANT)).toBe(
      '["read", "search", "edit", "execute", "web", "agent", "todo"]',
    );
    expect(toCursorReadonlyFrontmatter(FULL_GRANT)).toBe(false);
  });

  it("emits the codex column in the claude dialect, flagged provisional", () => {
    // Locks the placeholder decision: when the adapter phase maps codex onto
    // its own primitive, this expectation and the `provisional` flag move
    // together — neither is allowed to drift alone.
    expect(toCodexToolsFrontmatter(FULL_GRANT)).toBe(toClaudeToolsFrontmatter(FULL_GRANT));
    const codex = ADAPTER_ALLOWLIST_COVERAGE.find((row) => row.tool === "codex");
    expect(codex?.provisional).toBe(true);
    for (const row of ADAPTER_ALLOWLIST_COVERAGE.filter((r) => r.tool !== "codex")) {
      expect(row.provisional).toBeUndefined();
    }
  });

  it("renders the coverage matrix as a markdown table from the data", () => {
    const table = buildAllowlistCoverageTable();
    const lines = table.split("\n");

    expect(lines).toHaveLength(TOOLS.length + 2);
    expect(lines[0]).toBe("| Client | Mechanism | Strength |");
    for (const row of ADAPTER_ALLOWLIST_COVERAGE) {
      // A pipe inside a cell would split the column silently, so the data is
      // asserted table-safe rather than escaped at render time.
      expect(row.mechanism).not.toContain("|");
      expect(table).toContain(`| \`${row.tool}\` | ${row.mechanism} |`);
    }
    expect(table).toContain("soft (provisional) |");
    expect(table).toContain("| hard |");
  });
});

describe("cursor readonly verdict", () => {
  it("reports readonly for a non-mutating grant and drops it when edit is added", () => {
    expect(toCursorReadonlyFrontmatter(READ_ONLY_GRANT)).toBe(true);
    expect(toCursorReadonlyFrontmatter([...READ_ONLY_GRANT, "edit"])).toBe(false);
    expect(toCursorReadonlyFrontmatter([...READ_ONLY_GRANT, "execute"])).toBe(false);
  });

  it("declines a verdict on a reserved-only grant instead of manufacturing one", () => {
    expect(toCursorReadonlyFrontmatter([...RESERVED_TOOL_CATEGORIES])).toBeNull();
    expect(toCursorReadonlyFrontmatter(["git"])).toBeNull();
    // A reserved category beside a real one is stripped, not fatal.
    expect(toCursorReadonlyFrontmatter(["git", "read"])).toBe(true);
    expect(toCursorReadonlyFrontmatter(["board", "edit"])).toBe(false);
  });
});

describe("grant normalization", () => {
  it("renders from the granted set, not the order it arrived in", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray([...ALL_TOOL_CATEGORIES], { minLength: 1 }), (grant) => {
        const canonical = ALL_TOOL_CATEGORIES.filter((category) => grant.includes(category));
        for (const tool of TOOLS) {
          expect(TRANSFORMS[tool](grant)).toEqual(TRANSFORMS[tool](canonical));
        }
      }),
    );
  });

  it("collapses duplicates", () => {
    expect(toClaudeToolsFrontmatter(["edit", "read", "read", "edit"])).toBe(
      toClaudeToolsFrontmatter(["read", "edit"]),
    );
    expect(toCopilotToolsFrontmatter(["read", "read"])).toBe(toCopilotToolsFrontmatter(["read"]));
  });

  it("strips reserved categories, which no policy can grant", () => {
    expect(toClaudeToolsFrontmatter(["read", "git", "board"])).toBe(
      toClaudeToolsFrontmatter(["read"]),
    );
    expect(toClaudeToolsFrontmatter([...RESERVED_TOOL_CATEGORIES])).toBe("");
    expect(toCopilotToolsFrontmatter(["git"])).toBe("[]");
  });

  it("never widens a grant: each category contributes only its own names", () => {
    for (const category of FUNCTIONAL_TOOL_CATEGORIES) {
      const claude = toClaudeToolsFrontmatter([category]);
      const full = toClaudeToolsFrontmatter(FULL_GRANT).split(", ");
      for (const name of claude.split(", ").filter((n) => n !== "")) {
        expect(full).toContain(name);
      }
      expect(claude.split(", ").length).toBeLessThan(full.length);
    }
    expect(toClaudeToolsFrontmatter(["read"])).not.toContain("Write");
    expect(toCopilotToolsFrontmatter(["read"])).not.toContain("edit");
  });
});

describe("edge cases", () => {
  it("emits the no-tools dialect for an empty grant instead of throwing", () => {
    expect(() => toClaudeToolsFrontmatter([])).not.toThrow();
    expect(toClaudeToolsFrontmatter([])).toBe("");
    expect(toCodexToolsFrontmatter([])).toBe("");
    // `[]` is Copilot's documented "no tools" value; omitting the key enables all.
    expect(toCopilotToolsFrontmatter([])).toBe("[]");
    // Empty is well-formed (grants nothing) — the safe minimum, not a null verdict.
    expect(toCursorReadonlyFrontmatter([])).toBe(true);
  });

  it("refuses an unknown category, naming it and the known set", () => {
    for (const tool of TOOLS) {
      const error = expectEngineError(() => TRANSFORMS[tool](UNKNOWN_CATEGORY), "VALIDATION_ERROR");
      expect(error.message).toContain("telepathy");
      for (const category of ALL_TOOL_CATEGORIES) {
        expect(error.message).toContain(category);
      }
    }
  });

  it("refuses an unknown target tool in the ask-user lookup", () => {
    const bogus = "vscode" as Tool;
    const error = expectEngineError(() => getAskUserToolEntry(bogus), "VALIDATION_ERROR");
    expect(error.message).toContain("vscode");
    expect(error.message).toContain("claude");

    expect(() => substituteCanonicalPlatformMarker(PLATFORM_TOOL_MARKER, bogus)).toThrow(
      EngineError,
    );
  });
});

describe("ask-user platform table", () => {
  it("returns an entry for every tool, with a note in every one", () => {
    for (const tool of TOOLS) {
      const entry = getAskUserToolEntry(tool);
      expect(entry.tool).toBe(tool);
      expect(entry.note.length).toBeGreaterThan(0);
    }
    expect(getAskUserToolEntry("claude").toolName).toBe("AskUserQuestion");
    // Null rather than a guessed name: a wrong tool name fails silently at the
    // moment the agent needed an answer.
    expect(getAskUserToolEntry("cursor").toolName).toBeNull();
    expect(getAskUserToolEntry("copilot").toolName).toBeNull();
    expect(getAskUserToolEntry("codex").toolName).toBeNull();
  });

  it("renders one markdown row per tool", () => {
    const lines = buildAskUserPlatformTable().split("\n");
    expect(lines).toHaveLength(TOOLS.length + 2);
    expect(lines[0]).toBe("| Client | Native question tool | Guidance |");
    for (const tool of TOOLS) {
      expect(lines.some((line) => line.startsWith(`| \`${tool}\` |`))).toBe(true);
    }
    expect(buildAskUserPlatformTable()).toContain("`AskUserQuestion`");
    expect(buildAskUserPlatformTable()).toContain("_none documented_");
  });
});

describe("task/skill category resolution", () => {
  it("maps Task under spawn as the accepted alias of Agent", () => {
    expect(toClaudeToolsFrontmatter(["spawn"])).toBe("Agent, Task");
    // The current name stays first: emission order is table order, and the
    // alias rides behind the name the platform documents as current.
  });

  it("maps Skill under read as side-effect-free procedure ingestion", () => {
    expect(toClaudeToolsFrontmatter(["read"])).toBe("Read, Grep, Glob, Skill");
  });

  it("leaves the copilot and cursor dialects untouched by the claude-table additions", () => {
    expect(toCopilotToolsFrontmatter(["read"])).toBe('["read", "search"]');
    expect(toCopilotToolsFrontmatter(["spawn"])).toBe('["agent"]');
    // Skill is read-class, so a read-only grant keeps its readonly verdict.
    expect(toCursorReadonlyFrontmatter(["read", "spawn"])).toBe(true);
  });

  it("keeps the policy-document round-trip aligned with checkToolAccess", () => {
    // The generated guard authorizes from the policy DOCUMENT plus a
    // name→category map built by src/hooks/scripts.ts::unionToolCategoryMap;
    // the engine authorizes in-process via checkToolAccess over the same
    // roster. The two must reach one verdict for every rostered agent and every
    // mapped name — including the two names this unit added.
    //
    // The map is IMPORTED, not rebuilt. This file used to carry a hand-copy of
    // that function, which made the strongest claim here — parity between the
    // emitted guard's authorization and the engine's — an assertion about two
    // implementations with nothing binding them: the copy could go on agreeing
    // with a table the real one had stopped producing.
    const map = unionToolCategoryMap();
    // The imported map is what the emitted guard actually embeds.
    const embedded = buildPreToolUseGuardScript({
      policiesJsonPath: "../agent-tool-policies.json",
      failMode: "fail-closed",
    });
    for (const [tool, category] of Object.entries(map)) {
      expect(embedded, `${tool} is missing from the emitted guard`).toContain(
        `  ${JSON.stringify(tool)}: ${JSON.stringify(category)},`,
      );
    }
    expect(map["Task"]).toBe("spawn");
    expect(map["Skill"]).toBe("read");

    const roster: readonly AgentToolPolicy[] = AGENT_POLICY_ROSTER;
    const document = JSON.parse(buildAgentToolPoliciesJson(roster)) as {
      policies: { agentId: string; allow: ToolCategory[] }[];
    };
    expect(document.policies).toHaveLength(roster.length);

    for (const policy of document.policies) {
      for (const [tool, category] of Object.entries(map)) {
        const verdict = checkToolAccess(roster, policy.agentId, tool, map);
        expect(verdict.allowed).toBe(policy.allow.includes(category));
      }
      // The additions specifically: Skill follows the read grant every shipped
      // row holds; Task follows spawn, which no shipped row grants.
      expect(checkToolAccess(roster, policy.agentId, "Skill", map).allowed).toBe(
        policy.allow.includes("read"),
      );
      expect(checkToolAccess(roster, policy.agentId, "Task", map).allowed).toBe(false);
    }

    // A spawn-granting row WOULD authorize the alias — the mapping is live,
    // not dead weight in the table.
    const spawner: AgentToolPolicy = {
      agentId: "stamity-orchestrator-fixture",
      allow: ["spawn"],
      rationale: "fixture: proves the Task alias resolves through a spawn grant",
    };
    expect(checkToolAccess([spawner], spawner.agentId, "Task", map).allowed).toBe(true);
    expect(checkToolAccess([spawner], spawner.agentId, "Agent", map).allowed).toBe(true);
    expect(checkToolAccess([spawner], spawner.agentId, "Skill", map).allowed).toBe(false);
  });
});

describe("platform-tool marker substitution", () => {
  it("replaces every occurrence with the target client's note", () => {
    const body = [
      `Before asking: ${PLATFORM_TOOL_MARKER}`,
      "…",
      `At the checkpoint: ${PLATFORM_TOOL_MARKER}`,
      `And again on rework: ${PLATFORM_TOOL_MARKER}`,
    ].join("\n");

    for (const tool of TOOLS) {
      const note = getAskUserToolEntry(tool).note;
      const out = substituteCanonicalPlatformMarker(body, tool);

      expect(out).not.toContain(PLATFORM_TOOL_MARKER);
      expect(out.split(note)).toHaveLength(4);
      expect(out).toBe(body.split(PLATFORM_TOOL_MARKER).join(note));
    }
  });

  it("returns content without the marker unchanged", () => {
    const body = "# Question protocol\n\nAsk once, with numbered options.\n";
    for (const tool of TOOLS) {
      expect(substituteCanonicalPlatformMarker(body, tool)).toBe(body);
    }
  });

  it("inserts notes literally, without expanding replacement patterns", () => {
    // `$&` and `$'` are expanded by String.replaceAll with a string
    // replacement; a note is prose, so the substitution must not rescan it.
    const body = `pre ${PLATFORM_TOOL_MARKER} post`;
    const out = substituteCanonicalPlatformMarker(body, "claude");
    expect(out).toBe(`pre ${getAskUserToolEntry("claude").note} post`);
    expect(out.startsWith("pre ")).toBe(true);
    expect(out.endsWith(" post")).toBe(true);
  });
});
