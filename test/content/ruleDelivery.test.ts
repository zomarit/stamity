import { describe, expect, it } from "vitest";
import {
  NO_DEMOTED_RULES,
  RULE_SKILL_DIR_PREFIX,
  declaredRuleGlobs,
  demotedRuleIds,
  ruleAnchor,
  ruleDeliveryInputOf,
  type RuleDeliveryInput,
} from "../../src/content/ruleDelivery.ts";
import { buildContentIndex, type CatalogItem } from "../../src/content/catalog.ts";
import { TOOLS } from "../../src/types/core.ts";

/**
 * The delivery decision, per client, as a pure function of four rule facts.
 *
 * Every branch is covered here rather than through an adapter, because the
 * adapters read this answer and cannot disagree with it: what an emission
 * proves is that the answer is applied, and what this file proves is that the
 * answer is right. The fixture set is deliberately non-degenerate — four rules
 * with four different fact combinations, so a predicate that ignored one field
 * would still have to produce a different set to pass.
 */

/** A rule with no globs and no floor standing: the shape both claude and codex demote. */
const GLOBLESS: RuleDeliveryInput = {
  id: "question-protocol",
  globScoped: false,
  critical: false,
  floorTagged: false,
  anchored: false,
};

/** Glob-scoped and floor-tagged: claude keeps it (globs), codex keeps it (floor). */
const FLOOR_GLOBBED: RuleDeliveryInput = {
  id: "secrets",
  globScoped: true,
  critical: true,
  floorTagged: true,
  anchored: false,
};

/** Glob-scoped, no floor standing, unanchorable: claude keeps it, codex demotes it. */
const PLAIN_GLOBBED: RuleDeliveryInput = {
  id: "testing",
  globScoped: true,
  critical: false,
  floorTagged: false,
  anchored: false,
};

/** Glob-scoped and anchored to a nested AGENTS.md: codex keeps it there. */
const ANCHORED: RuleDeliveryInput = {
  id: "migrations",
  globScoped: true,
  critical: false,
  floorTagged: false,
  anchored: true,
};

const RULES = [GLOBLESS, FLOOR_GLOBBED, PLAIN_GLOBBED, ANCHORED] as const;

const idsOf = (set: ReadonlySet<string>): string[] => [...set].toSorted();

describe("demotedRuleIds", () => {
  it("demotes nothing on any client under always-on", () => {
    for (const tool of TOOLS) {
      expect(idsOf(demotedRuleIds(tool, RULES, "always-on")), tool).toEqual([]);
    }
  });

  it("demotes nothing on cursor, which attaches every rule shape natively", () => {
    expect(idsOf(demotedRuleIds("cursor", RULES, "on-demand"))).toEqual([]);
  });

  it("demotes exactly the glob-less rules on claude and copilot", () => {
    expect(idsOf(demotedRuleIds("claude", RULES, "on-demand"))).toEqual(["question-protocol"]);
    expect(idsOf(demotedRuleIds("copilot", RULES, "on-demand"))).toEqual(["question-protocol"]);
  });

  it("demotes every non-floor, unanchored rule on codex, whatever its globs", () => {
    expect(idsOf(demotedRuleIds("codex", RULES, "on-demand"))).toEqual([
      "question-protocol",
      "testing",
    ]);
  });

  it("keeps a floor-tagged rule on codex even when it is not critical", () => {
    const floorOnly: RuleDeliveryInput = { ...PLAIN_GLOBBED, floorTagged: true };
    expect(idsOf(demotedRuleIds("codex", [floorOnly], "on-demand"))).toEqual([]);
  });

  it("keeps a critical rule on codex even when it carries no floor tag", () => {
    const criticalOnly: RuleDeliveryInput = { ...PLAIN_GLOBBED, critical: true };
    expect(idsOf(demotedRuleIds("codex", [criticalOnly], "on-demand"))).toEqual([]);
  });

  it("answers an empty rule set with an empty demotion set", () => {
    expect(idsOf(demotedRuleIds("codex", [], "on-demand"))).toEqual([]);
  });

  it("keeps a floor-tagged glob-less rule always-on on claude and copilot too", () => {
    // S-1: the floor guard used to exist on the codex branch only, so a
    // floor-tagged rule with no globs was demoted off the launch-context
    // surface on claude and copilot even though codex kept it.
    const floorlessGlobless: RuleDeliveryInput = { ...GLOBLESS, floorTagged: true };
    expect(idsOf(demotedRuleIds("claude", [floorlessGlobless], "on-demand"))).toEqual([]);
    expect(idsOf(demotedRuleIds("copilot", [floorlessGlobless], "on-demand"))).toEqual([]);
  });

  it("keeps a critical glob-less rule always-on on claude and copilot too", () => {
    const criticalGlobless: RuleDeliveryInput = { ...GLOBLESS, critical: true };
    expect(idsOf(demotedRuleIds("claude", [criticalGlobless], "on-demand"))).toEqual([]);
    expect(idsOf(demotedRuleIds("copilot", [criticalGlobless], "on-demand"))).toEqual([]);
  });
});

describe("demotedRuleIds — corpus-wide floor guarantee", () => {
  it("never demotes a floor-tagged rule off always-on, on any client that has a demotion mode", async () => {
    // Mirrors test/adapters/codex.test.ts's "delivers every floor-tagged
    // rule" walk, for claude and copilot: a floor-tagged glob-less rule must
    // never leave always-on delivery on ANY client, not only on codex.
    const index = await buildContentIndex();
    const inputs = index.items
      .filter((item) => item.type === "rule")
      .map((item) => ruleDeliveryInputOf(item));
    const floorTagged = inputs.filter((rule) => rule.floorTagged).map((rule) => rule.id);
    expect(floorTagged.length, "the corpus declares at least one floor-tagged rule").toBeGreaterThan(
      0,
    );

    for (const tool of ["claude", "copilot"] as const) {
      const demoted = demotedRuleIds(tool, inputs, "on-demand");
      for (const id of floorTagged) {
        expect(demoted.has(id), `${tool} must never demote floor-tagged rule ${id}`).toBe(false);
      }
    }
  });
});

describe("NO_DEMOTED_RULES", () => {
  it("carries an empty set for every tool", () => {
    for (const tool of TOOLS) expect(idsOf(NO_DEMOTED_RULES[tool]), tool).toEqual([]);
  });
});

describe("RULE_SKILL_DIR_PREFIX", () => {
  it("is the rule prefix the corpus already spells, not the `st-` command surface", () => {
    expect(RULE_SKILL_DIR_PREFIX).toBe("stamity-");
  });
});

// ── Rule facts read off a catalog item ───────────────────────────

function ruleItem(
  frontmatter: Record<string, unknown>,
  rest: Partial<CatalogItem> = {},
): CatalogItem {
  return {
    type: "rule",
    id: String(frontmatter.id ?? "fixture"),
    filePath: "/corpus/rules/stamity-fixture.md",
    relativePath: "rules/stamity-fixture.md",
    description: "fixture rule",
    tags: [],
    body: "# Fixture\n",
    frontmatter,
    ...rest,
  };
}

describe("declaredRuleGlobs", () => {
  it("reads an array of globs", () => {
    expect(declaredRuleGlobs(ruleItem({ globs: ["src/**/*.ts", " docs/**  "] }))).toEqual([
      "src/**/*.ts",
      "docs/**",
    ]);
  });

  it("reads the legacy comma string and drops empty entries", () => {
    expect(declaredRuleGlobs(ruleItem({ globs: "src/**, ,docs/**" }))).toEqual([
      "src/**",
      "docs/**",
    ]);
  });

  it("answers empty for an undeclared or non-string globs value", () => {
    expect(declaredRuleGlobs(ruleItem({}))).toEqual([]);
    expect(declaredRuleGlobs(ruleItem({ globs: [7, "src/**"] }))).toEqual(["src/**"]);
    expect(declaredRuleGlobs(ruleItem({ globs: 7 }))).toEqual([]);
  });
});

describe("ruleAnchor", () => {
  it("answers the deepest shared literal directory of every glob", () => {
    expect(ruleAnchor(["packages/api/src/**/*.ts", "packages/api/test/**"])).toBe("packages/api");
  });

  it("answers null when one glob cannot be anchored", () => {
    expect(ruleAnchor(["packages/api/**", "**/*.md"])).toBeNull();
    expect(ruleAnchor([])).toBeNull();
  });

  it("refuses the engine's own state directory and anything outside the repo", () => {
    expect(ruleAnchor([".stamity/learnings/**"])).toBeNull();
    expect(ruleAnchor(["/etc/**/*.conf"])).toBeNull();
    expect(ruleAnchor(["../sibling/src/**"])).toBeNull();
  });
});

describe("ruleDeliveryInputOf", () => {
  it("derives the four facts from one catalog item", () => {
    const item = ruleItem(
      { id: "migrations", globs: ["db/migrations/**/*.sql"] },
      { id: "migrations", tags: ["data"] },
    );
    expect(ruleDeliveryInputOf(item)).toEqual({
      id: "migrations",
      globScoped: true,
      critical: false,
      floorTagged: false,
      anchored: true,
    });
  });

  it("reads critical from precedence and the floor standing from the tags", () => {
    const item = ruleItem(
      { id: "secrets" },
      { id: "secrets", tags: ["floor:security"], precedence: "critical" },
    );
    expect(ruleDeliveryInputOf(item)).toEqual({
      id: "secrets",
      globScoped: false,
      critical: true,
      floorTagged: true,
      anchored: false,
    });
  });
});
