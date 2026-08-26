import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AGENT_POLICY_ROSTER,
  GRANTABLE_TOOL_CATEGORIES,
  RUNTIME_AGENT_IDS,
  type AgentPolicyRow,
  type GrantableToolCategory,
} from "../../src/roster/agentPolicies.ts";
import {
  checkToolAccess,
  getAgentToolPolicy,
  onAllowlistDenial,
  validateToolPolicies,
  type AgentToolPolicy,
  type AllowlistDenialEvent,
} from "../../src/tools/allowlist.ts";
import {
  FUNCTIONAL_TOOL_CATEGORIES,
  isReservedToolCategory,
  isToolCategory,
  type ToolCategoryMap,
} from "../../src/tools/categories.ts";
import { CONTENT_PREFIX } from "../../src/types/markers.ts";

/**
 * The roster is data, so these are data assertions: the grants, the ids, and
 * the shape contract with the engine that consumes them.
 *
 * The expected grants are pinned here as literals rather than read out of
 * `content/agents/*.md`. Those files land in the same change set as this
 * module, so a suite that read them would be asserting two moving things
 * against each other; the roster-to-corpus parity check belongs to the
 * wave-3 corpus census, which sees the finished corpus. What this suite owns
 * is that the roster says what it was designed to say, and that the engine can
 * consume it unchanged.
 */

/** The shipped agent count: seven roles plus the three trigger-conditional specialists. */
const SHIPPED_AGENT_COUNT = 10;

/**
 * Grant table, mirroring each agent file's `capabilities:` frontmatter.
 *
 * The three specialist rows joined the seven roles when the specialist tier
 * landed; each is read-only, which is the grant that keeps a specialist from
 * answering its own finding in the following round.
 */
const EXPECTED_GRANTS: Readonly<Record<string, readonly GrantableToolCategory[]>> = {
  "stamity-researcher": ["read", "network"],
  "stamity-implementer": ["read", "edit", "execute"],
  "stamity-reviewer": ["read"],
  "stamity-fixer": ["read", "edit", "execute"],
  "stamity-test-runner": ["read", "execute"],
  "stamity-spec-author": ["read", "edit"],
  "stamity-creator": ["read", "edit"],
  "stamity-security": ["read"],
  "stamity-design-quality": ["read"],
  "stamity-performance": ["read"],
};

/** The specialist tier, by runtime id — read-only by contract, asserted as a set below. */
const SPECIALIST_IDS: readonly string[] = [
  "stamity-security",
  "stamity-design-quality",
  "stamity-performance",
];

/**
 * One client-native tool name per category — enough to rule on a grant without
 * pulling in a whole client dialect. The dialect-wide parity between this
 * roster and the emitted guard is `test/corpus/hookWiring.test.ts`'s subject.
 */
const REPRESENTATIVE_TOOLS: Readonly<Record<GrantableToolCategory, string>> = {
  read: "Read",
  edit: "Write",
  execute: "Bash",
  network: "WebFetch",
  spawn: "Agent",
  planning: "TodoWrite",
};

const TOOL_CATEGORIES: ToolCategoryMap = Object.fromEntries(
  GRANTABLE_TOOL_CATEGORIES.map((category) => [REPRESENTATIVE_TOOLS[category], category]),
);

const MODULE_SOURCE = readFileSync(
  new URL("../../src/roster/agentPolicies.ts", import.meta.url),
  "utf8",
);

/** The header block: everything before the first export, which is where the design notes live. */
const MODULE_HEADER = MODULE_SOURCE.slice(0, MODULE_SOURCE.indexOf("export "));

/** Words worth comparing between two rationales — short connective tokens carry no signal. */
function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length >= 5),
  );
}

/** Jaccard overlap of two word sets: 1 is the same sentence, 0 shares no vocabulary. */
function overlap(a: Set<string>, b: Set<string>): number {
  const shared = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : shared / union;
}

/** Captures the denial events one call emits, then detaches. */
function denialsDuring(run: () => void): AllowlistDenialEvent[] {
  const events: AllowlistDenialEvent[] = [];
  const off = onAllowlistDenial((event) => events.push(event));
  try {
    run();
  } finally {
    off();
  }
  return events;
}

describe("AGENT_POLICY_ROSTER", () => {
  it("carries exactly one row per shipped agent, each in the runtime id form", () => {
    const ids = AGENT_POLICY_ROSTER.map((row) => row.agentId);

    // The count is pinned as a literal, not derived from the table below: the
    // shipped agent set is fixed at ten, and a row added without a corpus file
    // is as much a defect as a corpus file added without a row.
    expect(AGENT_POLICY_ROSTER).toHaveLength(SHIPPED_AGENT_COUNT);
    expect(ids).toEqual(Object.keys(EXPECTED_GRANTS));
    expect(new Set(ids).size).toBe(ids.length);
    // The guard governs the prefixed namespace only: an unprefixed id would be
    // waved through as "not ours to police" rather than checked.
    for (const id of ids) expect(id.startsWith(CONTENT_PREFIX), id).toBe(true);
  });

  it("grants each agent exactly the capabilities its corpus file declares", () => {
    const granted = Object.fromEntries(AGENT_POLICY_ROSTER.map((row) => [row.agentId, row.allow]));

    expect(granted).toEqual(EXPECTED_GRANTS);
  });

  it("grants only real, non-reserved categories, and never an empty set", () => {
    for (const row of AGENT_POLICY_ROSTER) {
      expect(row.allow.length, row.agentId).toBeGreaterThan(0);
      expect(new Set(row.allow).size, row.agentId).toBe(row.allow.length);
      for (const category of row.allow) {
        expect(isToolCategory(category), `${row.agentId}/${category}`).toBe(true);
        // A reserved category grants nothing, so a row holding one would
        // overstate the agent's privilege to whoever audits it.
        expect(isReservedToolCategory(category), `${row.agentId}/${category}`).toBe(false);
      }
    }
  });

  it("passes the engine's own roster validator with nothing to report", () => {
    expect(validateToolPolicies(AGENT_POLICY_ROSTER)).toEqual([]);
  });

  it("stays assignable to the engine policy type it mirrors structurally", () => {
    // The binding the module header promises: this line is the compile-time
    // half (a row shape drifting from `AgentToolPolicy` fails typecheck here,
    // where the kernel boundary forbids importing the type at the source), and
    // the vocabulary comparison below is the runtime half.
    const asEnginePolicies: readonly AgentToolPolicy[] = AGENT_POLICY_ROSTER;

    expect(asEnginePolicies).toBe(AGENT_POLICY_ROSTER);
    expect(GRANTABLE_TOOL_CATEGORIES).toEqual(FUNCTIONAL_TOOL_CATEGORIES);
  });

  it("withholds spawn from every row, and records in the header why", () => {
    for (const row of AGENT_POLICY_ROSTER) {
      expect(row.allow, row.agentId).not.toContain("spawn");
    }
    // Documented, not merely absent: the next agent that genuinely delegates
    // has to read a reason before adding the category, rather than copying a
    // neighbouring row's grant.
    expect(MODULE_HEADER).toContain("spawn");
    expect(MODULE_HEADER).toMatch(/delegat/i);
  });

  it("grants the three specialists read and nothing else", () => {
    // The specialist tier's whole independence argument: a specialist that
    // could edit would answer its own finding in the next round, and one that
    // could execute or fetch would be a reviewer with a side channel. Asserted
    // per-row rather than via the grant table above so the guarantee reads as
    // its own statement instead of three entries in a literal.
    for (const id of SPECIALIST_IDS) {
      const row = AGENT_POLICY_ROSTER.find((entry) => entry.agentId === id);

      expect(row, id).toBeDefined();
      expect(row?.allow, id).toEqual(["read"]);
      for (const withheld of ["edit", "execute", "network", "spawn", "planning"]) {
        expect(row?.allow as readonly string[], `${id} must not hold ${withheld}`).not.toContain(
          withheld,
        );
      }
    }
  });

  it("ships no denyTools row, so no grant is qualified by a name list", () => {
    for (const row of AGENT_POLICY_ROSTER) {
      expect(row.denyTools, row.agentId).toBeUndefined();
    }
  });

  it("gives every grant a rationale of its own, not one boilerplate sentence", () => {
    const rationales = AGENT_POLICY_ROSTER.map((row) => row.rationale);

    expect(new Set(rationales).size).toBe(rationales.length);
    for (const row of AGENT_POLICY_ROSTER) {
      expect(row.rationale.trim(), row.agentId).not.toBe("");
      // Long enough to name the privilege and the reason for it; an operator
      // auditing the roster reads this line and nothing else.
      expect(row.rationale.length, row.agentId).toBeGreaterThan(80);
      expect(row.rationale.trimEnd().endsWith("."), row.agentId).toBe(true);
    }

    // Distinct strings are cheap to fake by swapping a role name into one
    // template. Vocabulary overlap is what catches that: two rows built from
    // the same sentence share nearly every content word.
    const words = AGENT_POLICY_ROSTER.map((row) => ({
      id: row.agentId,
      set: contentWords(row.rationale),
    }));
    for (let i = 0; i < words.length; i += 1) {
      for (let j = i + 1; j < words.length; j += 1) {
        const left = words[i];
        const right = words[j];
        if (left === undefined || right === undefined) continue;
        expect(overlap(left.set, right.set), `${left.id} vs ${right.id}`).toBeLessThan(0.4);
      }
    }
  });

  it("carries none of the reserved names the repo leak gate bans", () => {
    // Assembled from fragments for the same reason the gate assembles them:
    // a literal here would be a hit on this file. The roster is engine-side
    // TypeScript, so `scripts/leak-gate.mjs` scans it like any other.
    const reserved = [
      ["tess", "ity"],
      ["apris", "ity"],
      ["h4t", "cher"],
      ["hat", "ch3r"],
    ].map((parts) => parts.join(""));

    for (const token of reserved) {
      expect(MODULE_SOURCE.toLowerCase(), token).not.toContain(token);
    }
  });
});

describe("RUNTIME_AGENT_IDS", () => {
  it("mirrors the roster ids in roster order, each resolving back to its row", () => {
    expect(RUNTIME_AGENT_IDS).toEqual(AGENT_POLICY_ROSTER.map((row) => row.agentId));

    for (const id of RUNTIME_AGENT_IDS) {
      const policy: AgentPolicyRow | undefined = AGENT_POLICY_ROSTER.find(
        (row) => row.agentId === id,
      );
      expect(policy, id).toBeDefined();
      expect(getAgentToolPolicy(AGENT_POLICY_ROSTER, id), id).toBe(policy);
    }
  });
});

describe("the roster under the engine's access check", () => {
  it("denies everything to an agent the corpus added without a roster row", () => {
    // The silent-lockout case: the agent file ships, the row is forgotten, and
    // every call it makes refuses with no roster line to point at. The wave-3
    // corpus parity check is what turns this into a build failure instead.
    let verdict = { allowed: true, reason: "" };
    const events = denialsDuring(() => {
      verdict = checkToolAccess(AGENT_POLICY_ROSTER, "stamity-newcomer", "Read", TOOL_CATEGORIES);
    });

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("stamity-newcomer");
    expect(events.map((event) => event.reason)).toEqual(["unknown-agent"]);
  });

  it("rules every category for every rostered agent by its own grant", () => {
    for (const row of AGENT_POLICY_ROSTER) {
      for (const category of GRANTABLE_TOOL_CATEGORIES) {
        const tool = REPRESENTATIVE_TOOLS[category];
        const result = checkToolAccess(AGENT_POLICY_ROSTER, row.agentId, tool, TOOL_CATEGORIES);

        expect(result.allowed, `${row.agentId} -> ${tool}`).toBe(row.allow.includes(category));
        expect(result.category, `${row.agentId} -> ${tool}`).toBe(category);
      }
    }
  });

  it("refuses the delegation tool to all ten, since no row holds spawn", () => {
    for (const row of AGENT_POLICY_ROSTER) {
      const events = denialsDuring(() => {
        checkToolAccess(AGENT_POLICY_ROSTER, row.agentId, REPRESENTATIVE_TOOLS.spawn, TOOL_CATEGORIES);
      });

      expect(events.map((event) => event.reason), row.agentId).toEqual(["category-denied"]);
    }
  });
});

const SRC_ROOT = fileURLToPath(new URL("../../src", import.meta.url));

/** Every `.ts` file under `src/`, absolute. */
function sourceFiles(dir: string = SRC_ROOT, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(absolute, out);
    else if (entry.name.endsWith(".ts")) out.push(absolute);
  }
  return out;
}

/**
 * This module is data, but its header makes a claim about who READS the data,
 * and that claim is checkable. It used to say two enforcement points read the
 * roster — the emitted policy document plus an in-process check at the
 * delegation boundary — while `checkToolAccess` had no production caller at
 * all. An operator reading a denial as defence-in-depth would have been pricing
 * a second layer that never runs. The wording is now pinned to the call graph
 * in both directions: while nothing imports the check, the header says one
 * reader; the moment something does, this fails until the header says two.
 */
describe("the header's enforcement-point claim", () => {
  /** The prose shape retired here: a second reader of this roster. */
  const PAIR_CLAIM = /(both|two) enforcement points/i;

  /** Modules under `src/` that VALUE-import a name from the allowlist mechanism. */
  function productionImportersOf(name: string): string[] {
    const importers: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /^[ \t]*import[ \t]+(?!type[ \t])\{([^}]*)\}[ \t]*from[ \t]*["']([^"']*tools\/allowlist\.ts)["']/gm,
      )) {
        const names = (match[1] ?? "").split(",").map((entry) => entry.trim().split(/\s+as\s+/)[0]);
        if (names.includes(name)) importers.push(file);
      }
    }
    return importers;
  }

  it("names as many readers as the call graph has", () => {
    const wired = productionImportersOf("checkToolAccess");

    if (wired.length === 0) {
      expect(
        MODULE_HEADER,
        "the header claims a second enforcement point while nothing imports checkToolAccess. " +
          "Say one, or wire the check at the delegation boundary.",
      ).not.toMatch(PAIR_CLAIM);
      expect(MODULE_HEADER).toMatch(/ONE live reader|BUILT BUT UNWIRED/);
    } else {
      expect(
        MODULE_HEADER,
        `checkToolAccess is now imported by ${wired.join(", ")} — the header should describe two ` +
          "enforcement points again.",
      ).toMatch(PAIR_CLAIM);
    }
  });

  it("keeps the retired claim out of the row and roster docstrings too", () => {
    // Non-degeneracy: the pattern fires on the exact sentence it replaced, so a
    // clean scan below is evidence of a rewrite rather than of a dead regex.
    expect(PAIR_CLAIM.test("Matched exactly by both enforcement points.")).toBe(true);

    // The header is only one of the three sites the claim occupied; the other
    // two were `AgentPolicyRow.agentId` and the `AGENT_POLICY_ROSTER` docstring,
    // which a reader hits without scrolling back up. Scan the whole module.
    expect(MODULE_SOURCE).not.toMatch(PAIR_CLAIM);
  });

  it("keeps the one reader it does name real", () => {
    // The surviving half has to be verifiable the same way, or the correction
    // just swaps one unchecked claim for another: the serializer behind the
    // emitted policy document is imported by production, the check is not.
    expect(productionImportersOf("buildAgentToolPoliciesJson").length).toBeGreaterThan(0);
    expect(productionImportersOf("checkToolAccess")).toEqual([]);
  });
});
