import { describe, expect, it } from "vitest";
import { typeIdKey, type ContentIndex } from "../../src/content/catalog.ts";
import {
  CHARTER_MAX_LINES,
  CHARTER_RELATIVE_PATH,
  readCharterTemplate,
} from "../../src/content/charter.ts";
import { planCoreHookScripts } from "../../src/hooks/scripts.ts";
import { AGENT_POLICY_ROSTER, RUNTIME_AGENT_IDS } from "../../src/roster/agentPolicies.ts";
import { AGENT_TOOL_POLICIES_FILE } from "../../src/tools/allowlist.ts";
import { TOOLS } from "../../src/types/core.ts";
import { CONTENT_PREFIX } from "../../src/types/markers.ts";
import { useTempDir } from "../support/tempDir.ts";
import { CORPUS_ROOT, loadCorpusIndex, walkAllMarkdown } from "./harness.ts";

/**
 * The final census: the shipped corpus holds EXACTLY the rosters below —
 * 1 charter, 9 commands, 10 agents, 8 skills, 12 rules, 3 core hook scripts —
 * and nothing the engine cannot address. This is framework CI for canonical
 * content (`stamity validate` deliberately checks user content only, so the
 * corpus is validated here, where it is authored).
 *
 * Roster equality is asserted through {@link expectExactRoster}, which throws
 * naming every added and every missing id — an artifact that appears or
 * disappears fails the build with its id in the message, not with a bare
 * count mismatch. The census lists are the SoT rosters restated once, here;
 * everything else (ids, keys, collisions, grants) is read from the engine.
 */

/** The nine touchpoints, by bare id; the catalog indexes them as `cmd-<id>`. */
const COMMAND_CENSUS: readonly string[] = [
  "spec",
  "plan",
  "work",
  "board",
  "ask",
  "debug",
  "quick",
  "rework",
  "pr-resolve",
];

/**
 * The ten agents, by bare id; roster rows carry the runtime `stamity-` prefix.
 * Seven roles plus the three trigger-conditional specialists — the census grew
 * from seven when the specialist tier landed, so the count below and the
 * length assertions move together on purpose.
 */
const AGENT_CENSUS: readonly string[] = [
  "researcher",
  "implementer",
  "reviewer",
  "fixer",
  "test-runner",
  "spec-author",
  "creator",
  "security",
  "design-quality",
  "performance",
];

/** The eight skills. */
const SKILL_CENSUS: readonly string[] = [
  "onboard",
  "handoff",
  "qa",
  "verify",
  "browser-evidence",
  "design-system-detect",
  "dep-audit",
  "learn",
];

/** The twelve rules. */
const RULE_CENSUS: readonly string[] = [
  "question-protocol",
  "injection-screening",
  "learnings-schema",
  "ai-evals",
  "security-patterns",
  "secrets",
  "api-versioning",
  "migrations",
  "contract-census",
  "ui-states",
  "testing",
  "resilience",
];

/** The three core hook scripts every generated setup carries. */
const HOOK_SCRIPT_CENSUS: readonly string[] = [
  "stamity-session-start.mjs",
  "stamity-pre-tool-use-guard.mjs",
  "stamity-config-tamper-notice.mjs",
];

/** One catalog walk and one corpus walk, shared by every case. */
const index: Promise<ContentIndex> = loadCorpusIndex();
const corpus = walkAllMarkdown();

const tempDir = useTempDir("corpus-census");

/** Ids of one class, in walk order — duplicates included, so collisions still surface. */
async function idsOf(type: "agent" | "skill" | "rule" | "command"): Promise<string[]> {
  return (await index).items.filter((item) => item.type === type).map((item) => item.id);
}

/** Set difference in both directions, each side sorted for stable messages. */
function rosterDiff(
  actual: readonly string[],
  expected: readonly string[],
): { added: string[]; missing: string[] } {
  const have = new Set(actual);
  const want = new Set(expected);
  return {
    added: [...have].filter((id) => !want.has(id)).toSorted(),
    missing: [...want].filter((id) => !have.has(id)).toSorted(),
  };
}

/**
 * Assert set equality between a shipped roster and its census, throwing with
 * every drifted id named — the failure a maintainer reads when an artifact is
 * added without a census row, or dropped without a removal decision.
 */
function expectExactRoster(
  label: string,
  actual: readonly string[],
  expected: readonly string[],
): void {
  const { added, missing } = rosterDiff(actual, expected);
  if (added.length === 0 && missing.length === 0) return;
  const report = [
    added.length > 0 ? `added: ${added.join(", ")}` : null,
    missing.length > 0 ? `missing: ${missing.join(", ")}` : null,
  ]
    .filter((part) => part !== null)
    .join("; ");
  throw new Error(`${label} census drifted — ${report}`);
}

const lines = (...rows: string[]): string => rows.join("\n");

/** Minimal catalog-valid artifact for the fixture corpora. */
function fixtureDoc(id: string, type: string): string {
  return lines(
    "---",
    `id: ${id}`,
    `type: ${type}`,
    `description: Fixture ${type} for the census edge cases.`,
    "tags: [review]",
    "load: on-demand",
    "obsolete_when: the census suite retires.",
    "---",
    "Body.",
    "",
  );
}

describe("census — shipped corpus", () => {
  it("commands: byKey holds exactly the nine touchpoints under cmd- ids", async () => {
    const ids = await idsOf("command");
    const { byKey } = await index;
    const expected = COMMAND_CENSUS.map((id) => `cmd-${id}`);

    expect(ids).toHaveLength(9);
    expectExactRoster("command", ids, expected);
    for (const key of expected) {
      expect(byKey.has(typeIdKey("command", key)), key).toBe(true);
    }
  });

  it("agents: exactly the ten roles", async () => {
    const ids = await idsOf("agent");

    expect(ids).toHaveLength(10);
    expectExactRoster("agent", ids, AGENT_CENSUS);
  });

  it("skills: exactly the eight procedures", async () => {
    const ids = await idsOf("skill");

    expect(ids).toHaveLength(8);
    expectExactRoster("skill", ids, SKILL_CENSUS);
  });

  it("rules: exactly the twelve floors", async () => {
    const ids = await idsOf("rule");

    expect(ids).toHaveLength(12);
    expectExactRoster("rule", ids, RULE_CENSUS);
  });

  it("charter: present via readCharterTemplate, alone in its directory, inside the budget", async () => {
    const charter = await readCharterTemplate(CORPUS_ROOT);

    expect(charter.relativePath).toBe(CHARTER_RELATIVE_PATH);
    expect(charter.frontmatter["id"]).toBe("charter");
    expect(charter.frontmatter["type"]).toBe("charter");
    expect(charter.lineCount).toBeLessThanOrEqual(CHARTER_MAX_LINES);

    // Exactly one file under charter/ — a second one would read as shipped
    // while being invisible to both the catalog walk and the charter loader.
    const charterFiles = (await corpus)
      .filter((file) => file.relPath.startsWith("charter/"))
      .map((file) => file.relPath);
    expect(charterFiles).toEqual([CHARTER_RELATIVE_PATH]);

    // The charter is not a catalog class; the index must never absorb it.
    const indexed = (await index).items.filter((item) => item.relativePath.startsWith("charter/"));
    expect(indexed).toEqual([]);
  });

  it("reports zero collisions across the shipped corpus", async () => {
    expect((await index).collisions).toEqual([]);
  });

  it("plans exactly the three core hook scripts, for every client", () => {
    for (const tool of TOOLS) {
      const plan = planCoreHookScripts(`../${AGENT_TOOL_POLICIES_FILE}`, tool);
      const names = plan.map((script) => script.fileName);

      expect(plan, tool).toHaveLength(3);
      expectExactRoster(`hook-script (${tool})`, names, HOOK_SCRIPT_CENSUS);
      expect(new Set(names).size, tool).toBe(3);
    }
  });
});

describe("census — tool-policy roster parity", () => {
  it("rosters exactly the shipped agents, under their runtime-prefixed ids", () => {
    expectExactRoster(
      "agent tool-policy roster",
      [...RUNTIME_AGENT_IDS],
      AGENT_CENSUS.map((id) => `${CONTENT_PREFIX}${id}`),
    );
  });

  it("mirrors every agent's capabilities frontmatter exactly — the pair a new agent must edit", async () => {
    const { byKey } = await index;
    for (const id of AGENT_CENSUS) {
      const item = byKey.get(typeIdKey("agent", id));
      expect(item, id).toBeDefined();

      const declared = item?.frontmatter["capabilities"];
      const capabilities =
        Array.isArray(declared) && declared.every((entry) => typeof entry === "string")
          ? (declared as string[])
          : null;
      expect(capabilities, `${id}: \`capabilities\` must be an array of category strings`).not.toBeNull();

      const row = AGENT_POLICY_ROSTER.find((entry) => entry.agentId === `${CONTENT_PREFIX}${id}`);
      expect(row, `${id}: no roster row — the guard would answer NO_POLICY (silent lockout)`).toBeDefined();
      expect([...(capabilities ?? [])].toSorted(), id).toEqual([...(row?.allow ?? [])].toSorted());
    }
  });
});

describe("census — identity edge cases (fixture corpora)", () => {
  it("a shared id across classes is two artifacts, not a collision", async () => {
    const t = tempDir();
    await t.seedFiles({
      "commands/stamity-plan.md": fixtureDoc("plan", "command"),
      "skills/stamity-plan/SKILL.md": fixtureDoc("plan", "skill"),
    });

    const fixture = await loadCorpusIndex(t.dir);

    expect(fixture.collisions).toEqual([]);
    expect(fixture.byKey.has(typeIdKey("command", "cmd-plan"))).toBe(true);
    expect(fixture.byKey.has(typeIdKey("skill", "plan"))).toBe(true);
  });

  it("a duplicated id within a class is reported, first claimant reachable", async () => {
    const t = tempDir();
    await t.seedFiles({
      "agents/stamity-echo.md": fixtureDoc("echo", "agent"),
      "agents/stamity-twin.md": fixtureDoc("echo", "agent"),
    });

    const fixture = await loadCorpusIndex(t.dir);

    expect(fixture.collisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "duplicate-id",
          key: typeIdKey("agent", "echo"),
          paths: ["agents/stamity-echo.md", "agents/stamity-twin.md"],
        }),
      ]),
    );
    expect(fixture.byKey.get(typeIdKey("agent", "echo"))?.relativePath).toBe(
      "agents/stamity-echo.md",
    );
  });

  it("roster drift fails naming the added and the missing id", () => {
    expect(() =>
      expectExactRoster("agent", ["researcher", "ghost"], ["researcher", "reviewer"]),
    ).toThrow(/agent census drifted — added: ghost; missing: reviewer/);

    // The exact census passes regardless of declaration order.
    expect(() =>
      expectExactRoster("agent", [...AGENT_CENSUS].toSorted(), AGENT_CENSUS),
    ).not.toThrow();
  });
});
