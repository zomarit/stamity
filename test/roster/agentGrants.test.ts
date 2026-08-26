import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  grantableFootprint,
  NEVER_DERIVABLE_CATEGORIES,
  parseCapabilities,
  resolveAgentGrant,
  type ResolvedAgentGrant,
} from "../../src/roster/agentGrants.ts";
import {
  AGENT_POLICY_ROSTER,
  GRANTABLE_TOOL_CATEGORIES,
  type AgentPolicyRow,
  type GrantableToolCategory,
} from "../../src/roster/agentPolicies.ts";
import {
  FUNCTIONAL_TOOL_CATEGORIES,
  RESERVED_TOOL_CATEGORIES,
} from "../../src/tools/categories.ts";

/**
 * Grant resolution is pure data reasoning, so these are data assertions over
 * the live roster.
 *
 * Nothing here pins a row count or an id list. `AGENT_POLICY_ROSTER` grows in
 * the same wave as this module, and a suite that enumerated its ids would go
 * red on a roster edit that changed nothing about resolution. The roster IS the
 * fixture: every core-grant expectation is derived from the value at test time,
 * which is also what makes the roster-branch case a proof that the four
 * adapters can swap their own lookup for this resolver without moving a byte of
 * emitted core agent output.
 */

/** Ids no roster carries — the pack-agent lane, named so no case borrows a core id by accident. */
const PACK_AGENT_ID = "stamity-releaser";
const OTHER_PACK_AGENT_ID = "stamity-migrator";

const MODULE_SOURCE = readFileSync(
  new URL("../../src/roster/agentGrants.ts", import.meta.url),
  "utf8",
);

/** The full ceiling: every derivable category, for cases where the footprint is not the subject. */
const WIDE_FOOTPRINT: readonly GrantableToolCategory[] = GRANTABLE_TOOL_CATEGORIES.filter(
  (category) => !NEVER_DERIVABLE_CATEGORIES.has(category),
);

/** One diagnostics array as a single searchable string. */
function reasoning(grant: ResolvedAgentGrant): string {
  return grant.diagnostics.join("\n");
}

/** The lookup the four adapters do inline today, which this resolver replaces. */
function legacyGrantFor(agentId: string): readonly GrantableToolCategory[] {
  return AGENT_POLICY_ROSTER.find((row) => row.agentId === agentId)?.allow ?? [];
}

/** A pack agent resolved under `WIDE_FOOTPRINT` unless the case narrows it. */
function resolvePackAgent(
  capabilities: unknown,
  declaredTools: readonly GrantableToolCategory[] = WIDE_FOOTPRINT,
): ResolvedAgentGrant {
  return resolveAgentGrant({
    runtimeId: PACK_AGENT_ID,
    frontmatter: { id: "releaser", capabilities },
    declaredTools,
  });
}

describe("resolveAgentGrant — the roster branch", () => {
  it("answers every rostered id from its own row, whatever the roster carries at test time", () => {
    // Non-degenerate: an empty roster would satisfy the loop vacuously.
    expect(AGENT_POLICY_ROSTER.length).toBeGreaterThan(0);

    for (const row of AGENT_POLICY_ROSTER) {
      const grant = resolveAgentGrant({ runtimeId: row.agentId, frontmatter: {} });

      expect(grant.source, row.agentId).toBe("roster");
      expect(grant.allow, row.agentId).toEqual(row.allow);
      // A core agent resolving cleanly says nothing: diagnostics are for drops
      // and overrides, so noise here would train every consumer to ignore them.
      expect(grant.diagnostics, row.agentId).toEqual([]);
      expect(grant.runtimeId, row.agentId).toBe(row.agentId);
    }
  });

  it("stays silent on the corpus path, where an agent file mirrors its own row", () => {
    // How emission actually calls it: the catalog item carries the agent
    // file's frontmatter, and a corpus file's `capabilities:` equals its row.
    for (const row of AGENT_POLICY_ROSTER) {
      const grant = resolveAgentGrant({
        runtimeId: row.agentId,
        frontmatter: { capabilities: [...row.allow].toReversed() },
        declaredTools: WIDE_FOOTPRINT,
      });

      expect(grant.allow, row.agentId).toEqual(row.allow);
      // Order is not drift: the row and the file say the same thing.
      expect(grant.diagnostics, row.agentId).toEqual([]);
    }
  });

  it("returns what the adapters' own roster lookup returns, for rostered and unknown ids alike", () => {
    // The swap the four adapters make: `grantFor` is
    // `roster.find(...)?.allow ?? []`. Same answer for every id it can be asked
    // about, so replacing it changes no emitted core agent file.
    for (const agentId of [...AGENT_POLICY_ROSTER.map((row) => row.agentId), "stamity-newcomer"]) {
      expect(resolveAgentGrant({ runtimeId: agentId, frontmatter: {} }).allow, agentId).toEqual(
        legacyGrantFor(agentId),
      );
    }
  });

  it("ignores pack frontmatter under a core id, and records that it did", () => {
    const core = AGENT_POLICY_ROSTER[0];
    expect(core).toBeDefined();
    const row = core as AgentPolicyRow;

    const grant = resolveAgentGrant({
      runtimeId: row.agentId,
      // The widening attempt: a pack ships a file under a core agent's id
      // claiming every category the taxonomy has.
      frontmatter: { capabilities: [...GRANTABLE_TOOL_CATEGORIES] },
      declaredTools: WIDE_FOOTPRINT,
    });

    expect(grant.source).toBe("roster");
    expect(grant.allow).toEqual(row.allow);
    expect(reasoning(grant)).toContain(row.agentId);
    expect(reasoning(grant)).toMatch(/ignored/i);
    expect(reasoning(grant)).toMatch(/capabilities/);
    // Both sides are named, so the note is readable without the two files open.
    expect(reasoning(grant)).toContain(row.allow.join(", "));
  });

  it("reports a `spawn` claim under a core id — the one the comparison used to miss", () => {
    // The sharpest shape of the override attempt: a pack ships a file under a
    // core agent's id whose capabilities equal the row EXCEPT for `spawn`, the
    // single category no frontmatter can ever be granted. The comparison used
    // to run on the post-strip derivation, where the claim had already been
    // removed — so the file compared EQUAL to the row and the one assertion
    // worth reporting was the one that produced silence.
    const core = AGENT_POLICY_ROSTER.find((row) => !row.allow.includes("spawn"));
    expect(core, "every roster row grants spawn, so this case proves nothing").toBeDefined();
    const row = core as AgentPolicyRow;

    const grant = resolveAgentGrant({
      runtimeId: row.agentId,
      frontmatter: { capabilities: [...row.allow, "spawn"] },
      declaredTools: WIDE_FOOTPRINT,
    });

    // The row still answers — the note is a report, not a grant.
    expect(grant.source).toBe("roster");
    expect(grant.allow).toEqual(row.allow);
    expect(grant.allow).not.toContain("spawn");

    // And the claim is named, twice over: what the file asked for, and why
    // asking for it can never work.
    expect(reasoning(grant)).toContain("spawn");
    expect(reasoning(grant)).toMatch(/never derivable/);
    expect(reasoning(grant)).toMatch(/ignored/i);
    // Every line stays subject-prefixed, so a consumer printing them (the
    // emitted policy document's warning lane) names the agent each time.
    for (const diagnostic of grant.diagnostics) {
      expect(diagnostic.startsWith(`${row.agentId}: `), diagnostic).toBe(true);
    }
  });

  it("reports a corpus file that has drifted from its row, without following it", () => {
    const core = AGENT_POLICY_ROSTER.find((row) => !row.allow.includes("network"));
    expect(core).toBeDefined();
    const row = core as AgentPolicyRow;

    const grant = resolveAgentGrant({
      runtimeId: row.agentId,
      frontmatter: { capabilities: [...row.allow, "network"] },
    });

    // The roster answers; the drift is surfaced rather than silently obeyed.
    expect(grant.allow).toEqual(row.allow);
    expect(reasoning(grant)).toContain("network");
  });

  it("rules against an injected roster, so a caller can resolve a projected agent set", () => {
    const roster: readonly AgentPolicyRow[] = [
      { agentId: PACK_AGENT_ID, allow: ["read"], rationale: "Injected for this case only." },
    ];

    const grant = resolveAgentGrant({
      runtimeId: PACK_AGENT_ID,
      frontmatter: { capabilities: ["read", "edit", "execute"] },
      roster,
      declaredTools: WIDE_FOOTPRINT,
    });

    expect(grant.source).toBe("roster");
    expect(grant.allow).toEqual(["read"]);
  });
});

describe("resolveAgentGrant — the frontmatter branch", () => {
  it("grants a pack agent exactly what it declares, when the pack declared as much", () => {
    const grant = resolvePackAgent(["read", "edit", "execute"], ["read", "edit", "execute"]);

    expect(grant.source).toBe("frontmatter");
    expect(grant.allow).toEqual(["read", "edit", "execute"]);
    expect(grant.diagnostics).toEqual([]);
    expect(grant.runtimeId).toBe(PACK_AGENT_ID);
  });

  it("intersects with the pack's footprint, naming every category it dropped", () => {
    const grant = resolvePackAgent(["read", "edit", "execute"], ["read"]);

    expect(grant.source).toBe("frontmatter");
    expect(grant.allow).toEqual(["read"]);
    expect(reasoning(grant)).toContain('"edit"');
    expect(reasoning(grant)).toContain('"execute"');
    expect(reasoning(grant)).toContain("read");
    expect(reasoning(grant)).toContain(PACK_AGENT_ID);
  });

  it("keeps an empty grant expressible when the footprint covers nothing it asked for", () => {
    const grant = resolvePackAgent(["edit"], ["read"]);

    // Empty, not absent: consumers render `[]` as an explicit empty grant, and
    // an omitted key is the widest grant a Claude sub-agent can carry.
    expect(grant.allow).toEqual([]);
    expect(Array.isArray(grant.allow)).toBe(true);
    expect(grant.source).toBe("frontmatter");
  });

  it("grants nothing under an empty declared footprint, and says the pack declared none", () => {
    const grant = resolvePackAgent(["read"], []);

    expect(grant.allow).toEqual([]);
    expect(reasoning(grant)).toMatch(/declares none/i);
  });

  it("never exceeds the footprint, over every single-category ceiling the taxonomy allows", () => {
    for (const ceiling of WIDE_FOOTPRINT) {
      const grant = resolvePackAgent([...WIDE_FOOTPRINT], [ceiling]);

      expect(grant.allow, ceiling).toEqual([ceiling]);
    }
  });

  it("treats a missing footprint as a caller defect, not as an unlimited one", () => {
    // Resolved directly: the helper's default ceiling would hide the case.
    const grant = resolveAgentGrant({
      runtimeId: PACK_AGENT_ID,
      frontmatter: { capabilities: ["read", "edit"] },
    });

    // `declaredTools: undefined` means "no pack". A pack agent arriving that
    // way has lost its ceiling somewhere upstream, and trusting the frontmatter
    // here would grant precisely what the ceiling exists to bound.
    expect(grant.allow).toEqual([]);
    expect(grant.source).toBe("none");
    expect(reasoning(grant)).toMatch(/footprint/i);
    expect(reasoning(grant)).toMatch(/caller defect/i);
  });
});

describe("resolveAgentGrant — malformed and hostile capability fields", () => {
  it.each([
    ["absent", undefined, /declares no `capabilities:`/],
    ["a string", "read", /must be an array/],
    ["an object", { read: true }, /must be an array/],
    ["a number", 7, /must be an array/],
    ["null", null, /must be an array/],
    ["an empty list", [], /empty `capabilities:` list/],
    ["all unknown strings", ["filesystem", "sudo"], /not a grantable tool category/],
    ["non-string entries", [1, true, null], /not a grantable tool category/],
    ["delegation only", ["spawn"], /never derivable/],
  ])("resolves %s to nothing, with a diagnostic and no throw", (_label, capabilities, expected) => {
    const frontmatter = capabilities === undefined ? {} : { capabilities };
    let grant: ResolvedAgentGrant | undefined;

    expect(() => {
      grant = resolveAgentGrant({
        runtimeId: PACK_AGENT_ID,
        frontmatter,
        declaredTools: WIDE_FOOTPRINT,
      });
    }).not.toThrow();

    expect(grant?.allow).toEqual([]);
    expect(grant?.source).toBe("none");
    expect(reasoning(grant as ResolvedAgentGrant)).toMatch(expected);
  });

  it("keeps the valid part of a mixed list and drops the rest, naming each drop", () => {
    const grant = resolvePackAgent(["read", "spawn", "filesystem", "edit"]);

    expect(grant.allow).toEqual(["read", "edit"]);
    expect(grant.source).toBe("frontmatter");
    expect(reasoning(grant)).toContain('"filesystem"');
    expect(reasoning(grant)).toContain('"spawn"');
  });

  it("drops delegation however it is asked for, in every shape a pack can spell it", () => {
    const shapes: readonly unknown[][] = [
      ["spawn"],
      ["read", "spawn"],
      ["spawn", "spawn"],
      [...GRANTABLE_TOOL_CATEGORIES],
    ];

    for (const capabilities of shapes) {
      expect(parseCapabilities({ capabilities }), JSON.stringify(capabilities)).not.toContain(
        "spawn",
      );
      expect(
        resolvePackAgent(capabilities, [...GRANTABLE_TOOL_CATEGORIES]).allow,
        JSON.stringify(capabilities),
      ).not.toContain("spawn");
    }
  });

  it("drops a reserved category through the unknown path, so the taxonomy cannot open a hole", () => {
    // Reserved ids are absent from the grantable union by construction. This
    // asserts it from the outside: a pack spelling one is refused by the same
    // path that refuses a typo, whatever the taxonomy grows next.
    expect(RESERVED_TOOL_CATEGORIES.length).toBeGreaterThan(0);

    for (const reserved of RESERVED_TOOL_CATEGORIES) {
      const grant = resolvePackAgent(["read", reserved], [...WIDE_FOOTPRINT, reserved] as never);

      expect(grant.allow, reserved).toEqual(["read"]);
      expect(reasoning(grant), reserved).toContain(JSON.stringify(reserved));
    }
  });

  it.each([["Read"], ["READ"], [" read "], ["read "], ["\tread"]])(
    "refuses %j — capability ids match exactly, so a typo never becomes a grant",
    (capability) => {
      const grant = resolvePackAgent([capability]);

      expect(grant.allow).toEqual([]);
      expect(reasoning(grant)).toContain(JSON.stringify(capability));
    },
  );

  it("hints at the intended id when only whitespace separates the two", () => {
    const grant = resolvePackAgent([" read "]);

    // Trimming is help in a message, never a match: the hint names the id the
    // author meant without granting it.
    expect(grant.allow).toEqual([]);
    expect(reasoning(grant)).toContain('did you mean "read"');
  });

  it("bounds what a malformed field quotes back into a diagnostic", () => {
    const grant = resolvePackAgent({ payload: "x".repeat(500) });

    expect(grant.allow).toEqual([]);
    for (const diagnostic of grant.diagnostics) expect(diagnostic.length).toBeLessThan(200);
  });
});

describe("parseCapabilities", () => {
  it("returns every derivable category the taxonomy has, so a new one needs no edit here", () => {
    expect(WIDE_FOOTPRINT.length).toBeGreaterThan(0);
    expect(parseCapabilities({ capabilities: [...WIDE_FOOTPRINT] })).toEqual([...WIDE_FOOTPRINT]);
  });

  it("normalises order and duplicates, so two spellings of one grant emit identically", () => {
    const scrambled = parseCapabilities({
      capabilities: ["execute", "read", "edit", "read", "execute"],
    });
    const ordered = parseCapabilities({ capabilities: ["read", "edit", "execute"] });

    expect(scrambled).toEqual(ordered);
    expect(scrambled).toEqual(["read", "edit", "execute"]);
    // Canonical order is the taxonomy's own declaration order, not sorted or
    // as-authored: the emitted grant string is byte-identical either way.
    expect(scrambled).toEqual(GRANTABLE_TOOL_CATEGORIES.filter((c) => scrambled.includes(c)));
  });

  it("agrees with the resolver's frontmatter branch on the same field", () => {
    const capabilities = ["execute", "spawn", "read", "nonsense"];

    expect(resolvePackAgent(capabilities).allow).toEqual(parseCapabilities({ capabilities }));
  });

  it("returns [] for every unreadable field shape", () => {
    expect(parseCapabilities({})).toEqual([]);
    expect(parseCapabilities({ capabilities: "read" })).toEqual([]);
    expect(parseCapabilities({ capabilities: null })).toEqual([]);
    expect(parseCapabilities({ capabilities: [] })).toEqual([]);
  });

  it("reads nothing but its own field off the frontmatter map", () => {
    // `tools:`, `model_class:` and the rest are other consumers' fields; a
    // resolver that fell back to one of them would grant on a key no reviewer
    // reads as a grant.
    expect(
      parseCapabilities({ tools: ["read", "edit"], model_class: "advanced", id: "releaser" }),
    ).toEqual([]);
  });
});

describe("the resolver as a shared verdict", () => {
  it("is pure: same inputs, same answer, and the caller's frontmatter is untouched", () => {
    const frontmatter: Record<string, unknown> = { capabilities: ["read", "spawn", "edit"] };
    const snapshot = structuredClone(frontmatter);

    const first = resolveAgentGrant({
      runtimeId: PACK_AGENT_ID,
      frontmatter,
      declaredTools: WIDE_FOOTPRINT,
    });
    const second = resolveAgentGrant({
      runtimeId: PACK_AGENT_ID,
      frontmatter,
      declaredTools: WIDE_FOOTPRINT,
    });

    expect(second).toEqual(first);
    expect(frontmatter).toEqual(snapshot);
  });

  it("scopes its answer to the id it was asked about", () => {
    const frontmatter = { capabilities: ["read"] };

    expect(
      resolveAgentGrant({ runtimeId: OTHER_PACK_AGENT_ID, frontmatter, declaredTools: ["read"] })
        .runtimeId,
    ).toBe(OTHER_PACK_AGENT_ID);
  });

  it("imports only its sibling roster — no filesystem, no manifest, no engine", () => {
    // The structural half of the purity claim: both enforcement points call
    // this on the same inputs, which only holds while it reads nothing of its
    // own. The kernel boundary also forbids `src/tools` and `src/pack` here, so
    // the category vocabulary is mirrored and bound by test instead.
    const specifiers = [...MODULE_SOURCE.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);

    expect(specifiers).toEqual(["./agentPolicies.ts"]);
    expect(MODULE_SOURCE).not.toMatch(/\bimport\s*\(/);
  });

  it("withholds delegation as data, not as a hard-coded string in one branch", () => {
    expect([...NEVER_DERIVABLE_CATEGORIES]).toEqual(["spawn"]);
    // Every never-derivable id is a real category — a stale entry here would
    // silently withhold nothing.
    for (const category of NEVER_DERIVABLE_CATEGORIES) {
      expect(FUNCTIONAL_TOOL_CATEGORIES, category).toContain(category);
    }
  });

  it("mirrors the engine's functional vocabulary, since the boundary forbids importing it", () => {
    expect([...GRANTABLE_TOOL_CATEGORIES]).toEqual([...FUNCTIONAL_TOOL_CATEGORIES]);
    for (const reserved of RESERVED_TOOL_CATEGORIES) {
      expect(GRANTABLE_TOOL_CATEGORIES as readonly string[], reserved).not.toContain(reserved);
    }
  });
});

describe("grantableFootprint", () => {
  /*
   * The narrowing every footprint-carrying surface shares: the install
   * preview, the receipt that persists the disclosure, the projection that
   * reads it back off disk, and the four adapters that render a grant from it.
   * One function, because a footprint that means two things on two surfaces is
   * a privilege the operator never agreed to on one of them.
   */

  it("keeps only grantable categories, in canonical order, deduplicated", () => {
    expect(grantableFootprint(["execute", "read", "read"])).toEqual(["read", "execute"]);
    expect(grantableFootprint([...GRANTABLE_TOOL_CATEGORIES])).toEqual([
      ...GRANTABLE_TOOL_CATEGORIES,
    ]);
  });

  it("drops a reserved category — declaring one licenses nothing", () => {
    // `toolFootprint` validates against the WHOLE taxonomy at manifest
    // ingress, so a reserved id reaches this function legitimately. Echoing it
    // back would show a preview wider than the grants it can produce.
    for (const reserved of RESERVED_TOOL_CATEGORIES) {
      expect(grantableFootprint([reserved, "read"]), reserved).toEqual(["read"]);
    }
  });

  it("drops an unknown id rather than trusting a hand-edited disclosure", () => {
    // The receipt this reads back from is a plain file in the repo. An
    // operator who adds `"root"` to it must not thereby widen a grant.
    expect(grantableFootprint(["root", "READ", " read ", "read"])).toEqual(["read"]);
  });

  it("answers [] for absent and for empty alike — both are a ceiling of nothing", () => {
    expect(grantableFootprint(undefined)).toEqual([]);
    expect(grantableFootprint([])).toEqual([]);
  });

  it("bounds a real grant: the ceiling wins over what the agent asks for", () => {
    // The property the whole chain exists for, asserted end to end through
    // the resolver rather than on the narrowing alone.
    const grant = resolveAgentGrant({
      runtimeId: "stamity-release",
      frontmatter: { capabilities: ["read", "edit", "network"] },
      declaredTools: grantableFootprint(["read", "git"]),
    });
    expect(grant.allow).toEqual(["read"]);
    expect(grant.source).toBe("frontmatter");
    expect(grant.diagnostics.join(" ")).toContain("outside the pack's declared tool footprint");
  });
});
