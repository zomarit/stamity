import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { formatLogEntry, parseFailureLog } from "../../src/resilience/failureLog.ts";
import {
  AGENT_TOOL_POLICIES_FILE,
  AGENT_TOOL_POLICIES_SCHEMA,
  ALLOWLIST_FAILURE_PHASE,
  buildAgentToolPoliciesJson,
  checkToolAccess,
  deriveUserAgentPolicy,
  getAgentToolPolicy,
  onAllowlistDenial,
  toFailureLogEntry,
  validateToolPolicies,
  type AgentToolPolicy,
  type AllowlistDenialEvent,
  type AllowlistDenialReason,
} from "../../src/tools/allowlist.ts";
import {
  ALL_TOOL_CATEGORIES,
  buildToolCategoryMap,
  FUNCTIONAL_TOOL_CATEGORIES,
  isReservedToolCategory,
  isToolCategory,
  RESERVED_TOOL_CATEGORIES,
} from "../../src/tools/categories.ts";

/**
 * Stand-in roster. The engine ships none — the real agent set is content — so
 * every check runs against a fixture that models the row shapes a filled
 * roster uses: read-only, mutating, delegating, and one carrying a name-level
 * deny inside a granted category.
 */
const ROSTER: readonly AgentToolPolicy[] = [
  {
    agentId: "stamity-reviewer",
    allow: ["read"],
    rationale: "Review reads the change; it never writes one.",
  },
  {
    agentId: "stamity-implementer",
    allow: ["read", "edit", "execute"],
    denyTools: ["WebFetch"],
    rationale: "Implementation edits files and runs the suite that proves the edit.",
  },
  {
    agentId: "stamity-orchestrator",
    allow: ["read", "spawn", "planning"],
    rationale: "Orchestration delegates and plans; it does not edit or execute.",
  },
];

/**
 * Rows an installed pack contributes, as `src/emit/hooksInfra.ts` composes them
 * beside the shipped set: same shape, same enforcement, plus the provenance
 * that says which install put them there. Ids and grants mirror the bundled ops
 * pack so the composition asserted here is the one that actually ships.
 */
const PACK_ROWS: readonly AgentToolPolicy[] = [
  {
    agentId: "stamity-devops",
    allow: ["read", "edit", "execute"],
    rationale: "Supplied by installed pack \"ops\".",
    source: { kind: "pack", packId: "ops" },
  },
  {
    agentId: "stamity-incident-responder",
    allow: ["read", "edit", "execute"],
    rationale: "Supplied by installed pack \"ops\".",
    source: { kind: "pack", packId: "ops" },
  },
];

/** The emitted document as a reader parses it — structural, never imported. */
interface PolicyDocument {
  schema: string;
  categories: string[];
  policies: Array<{
    agentId: string;
    allow: string[];
    denyTools?: string[];
    rationale: string;
    source?: { kind: string; packId?: string };
  }>;
}

/** Client-native tool names, authored per capability and inverted for lookup. */
const TOOL_MAP = buildToolCategoryMap({
  read: ["Read", "Grep", "Glob"],
  edit: ["Edit", "Write"],
  execute: ["Bash"],
  network: ["WebFetch", "WebSearch"],
  spawn: ["Task"],
  planning: ["TodoWrite"],
  git: ["GitCommit"],
});

/** Listener registration is process-wide; every subscription is released after its test. */
const release: Array<() => void> = [];

function listen(listener: (event: AllowlistDenialEvent) => void): void {
  release.push(onAllowlistDenial(listener));
}

/** Collect denial events for the duration of one test. */
function recordDenials(): AllowlistDenialEvent[] {
  const events: AllowlistDenialEvent[] = [];
  listen((event) => events.push(event));
  return events;
}

afterEach(() => {
  while (release.length > 0) release.pop()?.();
});

describe("tool-category taxonomy", () => {
  it("is the functional set plus the reserved set, with no overlap", () => {
    expect(ALL_TOOL_CATEGORIES).toEqual([...FUNCTIONAL_TOOL_CATEGORIES, ...RESERVED_TOOL_CATEGORIES]);
    expect(new Set(ALL_TOOL_CATEGORIES).size).toBe(ALL_TOOL_CATEGORIES.length);
    for (const category of FUNCTIONAL_TOOL_CATEGORIES) {
      expect(isReservedToolCategory(category)).toBe(false);
    }
    for (const category of RESERVED_TOOL_CATEGORIES) {
      expect(isToolCategory(category)).toBe(true);
      expect(isReservedToolCategory(category)).toBe(true);
    }
  });

  it("rejects non-categories, including non-string values from parsed data", () => {
    for (const value of ["", "READ", "reads", " read", 7, null, undefined, {}]) {
      expect(isToolCategory(value)).toBe(false);
    }
  });

  it("inverts a category table independently of its key order, narrower category winning a clash", () => {
    const canonical = buildToolCategoryMap({ read: ["Read"], edit: ["Edit"], git: ["GitCommit"] });
    const reordered = buildToolCategoryMap({ git: ["GitCommit"], edit: ["Edit"], read: ["Read"] });
    expect(JSON.stringify(canonical)).toBe(JSON.stringify(reordered));

    // "Bash" listed twice: `execute` precedes the reserved `git`, so the
    // narrower functional grant wins whichever order the table was authored in.
    expect(buildToolCategoryMap({ execute: ["Bash"], git: ["Bash"] })["Bash"]).toBe("execute");
    expect(buildToolCategoryMap({ git: ["Bash"], execute: ["Bash"] })["Bash"]).toBe("execute");
    expect(buildToolCategoryMap({})).toEqual({});
  });
});

describe("policy lookup", () => {
  it("matches an agent id exactly and case-sensitively", () => {
    expect(getAgentToolPolicy(ROSTER, "stamity-reviewer")?.allow).toEqual(["read"]);
    expect(getAgentToolPolicy(ROSTER, "Stamity-Reviewer")).toBeUndefined();
    expect(getAgentToolPolicy(ROSTER, "stamity-reviewer ")).toBeUndefined();
  });

  it("keeps a cased-up id from inheriting the grant of the row it resembles", () => {
    const events = recordDenials();
    const result = checkToolAccess(ROSTER, "Stamity-Reviewer", "Read", TOOL_MAP);

    expect(result.allowed).toBe(false);
    expect(result.category).toBeNull();
    expect(events).toEqual([{ agentId: "Stamity-Reviewer", tool: "Read", reason: "unknown-agent" }]);
  });

  it("serves the first of two rows sharing an id", () => {
    const duplicated: AgentToolPolicy[] = [
      { agentId: "stamity-reviewer", allow: ["read"], rationale: "first" },
      { agentId: "stamity-reviewer", allow: ["read", "edit"], rationale: "second" },
    ];
    expect(getAgentToolPolicy(duplicated, "stamity-reviewer")?.rationale).toBe("first");
  });
});

describe("checkToolAccess", () => {
  it("denies every agent and tool against an empty roster", () => {
    const events = recordDenials();

    fc.assert(
      fc.property(fc.string(), fc.string(), (agentId, tool) => {
        const result = checkToolAccess([], agentId, tool, TOOL_MAP);
        return result.allowed === false && result.category === null && result.reason.includes(agentId);
      }),
      { numRuns: 200 },
    );

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.reason === "unknown-agent")).toBe(true);
  });

  it("authorizes a tool the agent's granted category covers", () => {
    const events = recordDenials();
    const result = checkToolAccess(ROSTER, "stamity-implementer", "Write", TOOL_MAP);

    expect(result).toEqual({
      allowed: true,
      category: "edit",
      reason: 'Agent "stamity-implementer" may use tool "Write" through its "edit" grant.',
    });
    expect(events).toEqual([]);
  });

  it("denies a category the agent does not hold, naming what it does hold", () => {
    const events = recordDenials();
    const result = checkToolAccess(ROSTER, "stamity-reviewer", "Write", TOOL_MAP);

    expect(result.allowed).toBe(false);
    expect(result.category).toBe("edit");
    expect(result.reason).toContain("Granted: read");
    expect(events).toEqual([{ agentId: "stamity-reviewer", tool: "Write", reason: "category-denied" }]);
  });

  it("denies a tool the client map does not name, with no category resolved", () => {
    const events = recordDenials();
    const result = checkToolAccess(ROSTER, "stamity-implementer", "NotebookEdit", TOOL_MAP);

    expect(result.allowed).toBe(false);
    expect(result.category).toBeNull();
    expect(result.reason).toContain("maps to no category");
    expect(events).toEqual([
      { agentId: "stamity-implementer", tool: "NotebookEdit", reason: "tool-denied" },
    ]);
  });

  it("denies a name on denyTools even when the roster grants its category", () => {
    const grantsNetwork: readonly AgentToolPolicy[] = [
      {
        agentId: "stamity-researcher",
        allow: ["read", "network"],
        denyTools: ["WebFetch"],
        rationale: "Research reads and searches; direct fetches are denied by name.",
      },
    ];
    const events = recordDenials();

    expect(checkToolAccess(grantsNetwork, "stamity-researcher", "WebSearch", TOOL_MAP).allowed).toBe(true);

    const denied = checkToolAccess(grantsNetwork, "stamity-researcher", "WebFetch", TOOL_MAP);
    expect(denied.allowed).toBe(false);
    expect(denied.category).toBe("network");
    expect(denied.reason).toContain("denyTools");
    expect(events).toEqual([{ agentId: "stamity-researcher", tool: "WebFetch", reason: "tool-denied" }]);
  });

  it("denies a reserved category no matter what the roster claims to grant", () => {
    const claimsGit: readonly AgentToolPolicy[] = [
      { agentId: "stamity-releaser", allow: ["read", "git"], rationale: "Roster bug under test." },
    ];
    const events = recordDenials();
    const result = checkToolAccess(claimsGit, "stamity-releaser", "GitCommit", TOOL_MAP);

    expect(result.allowed).toBe(false);
    expect(result.category).toBe("git");
    expect(result.reason).toContain("reserved category");
    expect(events).toEqual([{ agentId: "stamity-releaser", tool: "GitCommit", reason: "reserved-category" }]);
  });

  it("does not resolve a tool named after an inherited prototype member", () => {
    // A plain object literal answers `constructor` and `toString` from its
    // prototype; without an own-property check those names would resolve to a
    // function and travel on as if they were a category.
    const literalMap = { Read: "read" } as const;
    for (const tool of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      const result = checkToolAccess(ROSTER, "stamity-implementer", tool, literalMap);
      expect(result.allowed).toBe(false);
      expect(result.category).toBeNull();
    }
  });

  it("reaches every denial code, and each one only from its own cause", () => {
    // Keyed by the union, so a new denial code added to AllowlistDenialReason
    // fails typecheck here until it has a call that provokes it — a code no
    // input can produce is dead, and one nothing pins can silently change.
    const provoke: Record<AllowlistDenialReason, () => void> = {
      "unknown-agent": () => checkToolAccess(ROSTER, "nobody", "Read", TOOL_MAP),
      "category-denied": () => checkToolAccess(ROSTER, "stamity-reviewer", "Write", TOOL_MAP),
      "tool-denied": () => checkToolAccess(ROSTER, "stamity-implementer", "WebFetch", TOOL_MAP),
      "reserved-category": () => checkToolAccess(ROSTER, "stamity-orchestrator", "GitCommit", TOOL_MAP),
    };

    for (const [reason, call] of Object.entries(provoke)) {
      const events = recordDenials();
      call();
      expect(events.map((event) => event.reason)).toEqual([reason]);
      release.pop()?.();
    }
  });
});

describe("denial listeners", () => {
  it("fires once per denial with the exact event, and stops on unsubscribe", () => {
    const events: AllowlistDenialEvent[] = [];
    const unsubscribe = onAllowlistDenial((event) => events.push(event));

    checkToolAccess(ROSTER, "stamity-reviewer", "Bash", TOOL_MAP);
    expect(events).toEqual([{ agentId: "stamity-reviewer", tool: "Bash", reason: "category-denied" }]);

    unsubscribe();
    checkToolAccess(ROSTER, "stamity-reviewer", "Bash", TOOL_MAP);
    checkToolAccess(ROSTER, "nobody", "Read", TOOL_MAP);
    expect(events).toHaveLength(1);
  });

  it("does not fire on an authorized call", () => {
    const events = recordDenials();
    expect(checkToolAccess(ROSTER, "stamity-orchestrator", "Task", TOOL_MAP).allowed).toBe(true);
    expect(events).toEqual([]);
  });

  it("keeps a stale unsubscribe from detaching a listener that re-subscribed", () => {
    const events: AllowlistDenialEvent[] = [];
    const listener = (event: AllowlistDenialEvent): void => void events.push(event);

    const stale = onAllowlistDenial(listener);
    stale();
    release.push(onAllowlistDenial(listener));
    stale();

    checkToolAccess(ROSTER, "nobody", "Read", TOOL_MAP);
    expect(events).toHaveLength(1);
  });

  it("isolates a throwing listener from the verdict and from the listeners behind it", () => {
    const reached: string[] = [];
    listen(() => {
      throw new Error("sink is down");
    });
    listen(() => reached.push("second"));

    const result = checkToolAccess(ROSTER, "stamity-reviewer", "Bash", TOOL_MAP);

    expect(result.allowed).toBe(false);
    expect(result.category).toBe("execute");
    expect(reached).toEqual(["second"]);
  });
});

describe("validateToolPolicies", () => {
  it("passes a clean roster", () => {
    expect(validateToolPolicies(ROSTER)).toEqual([]);
  });

  it("flags a roster granting the reserved 'git' category", () => {
    const issues = validateToolPolicies([
      { agentId: "stamity-releaser", allow: ["read", "git"], rationale: "Tags releases." },
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('reserved tool category "git"');
  });

  it("flags an agent that allows nothing", () => {
    const issues = validateToolPolicies([
      { agentId: "stamity-idle", allow: [], rationale: "Grant was never filled in." },
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("allows no tool category");
  });

  it("flags duplicate ids, unknown categories, blank ids, and ungrounded grants", () => {
    const broken = [
      { agentId: "stamity-reviewer", allow: ["read"], rationale: "first" },
      { agentId: "stamity-reviewer", allow: ["read"], rationale: "second" },
      { agentId: "stamity-typo", allow: ["reed"], rationale: "Typo denies everything it meant to grant." },
      { agentId: "  ", allow: ["read"], rationale: "No agent named." },
      { agentId: "stamity-unjustified", allow: ["edit"], rationale: "   " },
    ] as unknown as readonly AgentToolPolicy[];

    const issues = validateToolPolicies(broken);

    expect(issues.some((issue) => issue.includes("Duplicate policy"))).toBe(true);
    expect(issues.some((issue) => issue.includes('unknown tool category "reed"'))).toBe(true);
    expect(issues.some((issue) => issue.includes("blank agentId"))).toBe(true);
    expect(issues.some((issue) => issue.includes("no rationale"))).toBe(true);
  });
});

describe("buildAgentToolPoliciesJson", () => {
  it("emits a versioned envelope carrying the full category vocabulary", () => {
    const doc = JSON.parse(buildAgentToolPoliciesJson(ROSTER)) as {
      schema: string;
      categories: string[];
      policies: Array<{ agentId: string; allow: string[]; denyTools?: string[]; rationale: string }>;
    };

    expect(doc.schema).toBe(AGENT_TOOL_POLICIES_SCHEMA);
    expect(doc.categories).toEqual([...ALL_TOOL_CATEGORIES]);
    expect(doc.policies.map((policy) => policy.agentId)).toEqual([
      "stamity-implementer",
      "stamity-orchestrator",
      "stamity-reviewer",
    ]);
    expect(doc.policies[0]?.denyTools).toEqual(["WebFetch"]);
    expect(doc.policies[2]?.denyTools).toBeUndefined();
  });

  it("names the artifact consistently with the schema id stamped inside it", () => {
    // The document's writer and its guard-script reader are generated from
    // separate units; both derive the name from here, and the schema id embeds
    // the same stem, so a half-applied rename fails this rather than producing
    // a guard that reads a file nobody writes.
    expect(AGENT_TOOL_POLICIES_FILE).toBe("agent-tool-policies.json");
    expect(AGENT_TOOL_POLICIES_SCHEMA).toContain(AGENT_TOOL_POLICIES_FILE.replace(/\.json$/, ""));
  });

  it("is byte-stable across roster order permutations", () => {
    const expected = buildAgentToolPoliciesJson(ROSTER);

    fc.assert(
      fc.property(
        fc.shuffledSubarray([...ROSTER], { minLength: ROSTER.length, maxLength: ROSTER.length }),
        (permuted) => buildAgentToolPoliciesJson(permuted) === expected,
      ),
      { numRuns: 200 },
    );
  });

  it("emits categories in canonical order however the grant was written", () => {
    const scrambled = buildAgentToolPoliciesJson([
      { agentId: "stamity-a", allow: ["execute", "read", "edit"], rationale: "r" },
    ]);
    const canonical = buildAgentToolPoliciesJson([
      { agentId: "stamity-a", allow: ["read", "edit", "execute"], rationale: "r" },
    ]);

    expect(scrambled).toBe(canonical);
    expect(JSON.parse(scrambled).policies[0].allow).toEqual(["read", "edit", "execute"]);
  });

  it("emits only what an access check would authorize: reserved and unknown categories dropped", () => {
    const doc = JSON.parse(
      buildAgentToolPoliciesJson([
        { agentId: "stamity-releaser", allow: ["read", "git", "board"], rationale: "r" },
        { agentId: "stamity-typo", allow: ["reed"], rationale: "r" },
      ] as unknown as readonly AgentToolPolicy[]),
    ) as { policies: Array<{ allow: string[] }> };

    expect(doc.policies[0]?.allow).toEqual(["read"]);
    expect(doc.policies[1]?.allow).toEqual([]);
  });

  it("keeps the first of two rows sharing an id, and sorts denied tool names once", () => {
    const doc = JSON.parse(
      buildAgentToolPoliciesJson([
        { agentId: "stamity-a", allow: ["read"], denyTools: ["Zed", "Ape", "Zed"], rationale: "first" },
        { agentId: "stamity-a", allow: ["read", "edit"], rationale: "second" },
      ]),
    ) as { policies: Array<{ rationale: string; denyTools?: string[] }> };

    expect(doc.policies).toHaveLength(1);
    expect(doc.policies[0]?.rationale).toBe("first");
    expect(doc.policies[0]?.denyTools).toEqual(["Ape", "Zed"]);
  });
});

describe("policy provenance", () => {
  it("carries a pack row's source into the document and leaves a core row's bytes untouched", () => {
    // The core half of the set is serialized twice — once alone, once beside a
    // pack row — and the two must agree byte for byte on the shared rows. An
    // install adds rows to the document; it must never move one.
    const coreOnly = buildAgentToolPoliciesJson(ROSTER);
    const withPack = buildAgentToolPoliciesJson([...ROSTER, ...PACK_ROWS]);

    const core = JSON.parse(coreOnly) as PolicyDocument;
    const composed = JSON.parse(withPack) as PolicyDocument;

    expect(composed.schema).toBe(AGENT_TOOL_POLICIES_SCHEMA);
    expect(composed.schema).toBe(core.schema);
    for (const row of core.policies) {
      const emitted = composed.policies.find((candidate) => candidate.agentId === row.agentId);
      expect(JSON.stringify(emitted), row.agentId).toBe(JSON.stringify(row));
      expect(Object.hasOwn(emitted ?? {}, "source"), row.agentId).toBe(false);
    }

    const packRow = composed.policies.find((row) => row.agentId === "stamity-devops");
    expect(packRow?.allow).toEqual(["read", "edit", "execute"]);
    expect(packRow?.source).toEqual({ kind: "pack", packId: "ops" });
  });

  it("sorts pack rows in among the core rows by id and stays byte-stable across two runs", () => {
    const composed = [...ROSTER, ...PACK_ROWS];
    const first = buildAgentToolPoliciesJson(composed);

    // Same inputs, second run: identical bytes. Sorting is by id across the
    // whole set, so a pack row lands in id order rather than appended.
    expect(buildAgentToolPoliciesJson(composed)).toBe(first);
    expect((JSON.parse(first) as PolicyDocument).policies.map((row) => row.agentId)).toEqual([
      "stamity-devops",
      "stamity-implementer",
      "stamity-incident-responder",
      "stamity-orchestrator",
      "stamity-reviewer",
    ]);
    // Input order is not a byte-level input either.
    expect(buildAgentToolPoliciesJson([...PACK_ROWS, ...ROSTER])).toBe(first);
  });

  it("enforces a pack row's grant exactly as it enforces a core row's", () => {
    const composed = [...ROSTER, ...PACK_ROWS];

    // Provenance informs an audit; it never widens or narrows a verdict.
    expect(checkToolAccess(composed, "stamity-devops", "Bash", TOOL_MAP).allowed).toBe(true);
    expect(checkToolAccess(composed, "stamity-devops", "WebFetch", TOOL_MAP).allowed).toBe(false);
    expect(checkToolAccess(composed, "stamity-devops", "Task", TOOL_MAP).allowed).toBe(false);
    // The core rows behind it rule the same way they did without the pack rows.
    expect(checkToolAccess(composed, "stamity-reviewer", "Bash", TOOL_MAP).allowed).toBe(false);
    expect(checkToolAccess(composed, "stamity-reviewer", "Read", TOOL_MAP).allowed).toBe(true);
    expect(validateToolPolicies(composed)).toEqual([]);
  });

  it("drops an origin the schema does not name rather than emitting it as core", () => {
    const doc = JSON.parse(
      buildAgentToolPoliciesJson([
        { agentId: "stamity-a", allow: ["read"], rationale: "r", source: { kind: "vendor" } },
        { agentId: "stamity-b", allow: ["read"], rationale: "r", source: { kind: "pack", packId: "  " } },
        { agentId: "stamity-c", allow: ["read"], rationale: "r", source: { kind: "core" } },
      ] as unknown as readonly AgentToolPolicy[]),
    ) as PolicyDocument;

    // A mislabelled row reading as core would understate where privilege came
    // from, which is the one thing the field exists to answer.
    expect(Object.hasOwn(doc.policies[0] ?? {}, "source")).toBe(false);
    expect(Object.hasOwn(doc.policies[1] ?? {}, "source")).toBe(false);
    expect(doc.policies[2]?.source).toEqual({ kind: "core" });
  });

  it("rebuilds the source field rather than copying whatever the row carried", () => {
    const doc = JSON.parse(
      buildAgentToolPoliciesJson([
        {
          agentId: "stamity-a",
          allow: ["read"],
          rationale: "r",
          source: { kind: "pack", packId: "ops", installedBy: "someone", note: "smuggled" },
        },
      ] as unknown as readonly AgentToolPolicy[]),
    ) as PolicyDocument;

    expect(doc.policies[0]?.source).toEqual({ kind: "pack", packId: "ops" });
  });

  it("reports an unnamed origin and a pack source with no pack id", () => {
    const issues = validateToolPolicies([
      { agentId: "stamity-a", allow: ["read"], rationale: "r", source: { kind: "vendor" } },
      { agentId: "stamity-b", allow: ["read"], rationale: "r", source: { kind: "pack", packId: "" } },
      { agentId: "stamity-c", allow: ["read"], rationale: "r", source: { kind: "pack", packId: "ops" } },
      { agentId: "stamity-d", allow: ["read"], rationale: "r", source: { kind: "core" } },
    ] as unknown as readonly AgentToolPolicy[]);

    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('Agent "stamity-a"');
    expect(issues[0]).toContain("names no origin");
    expect(issues[1]).toContain('Agent "stamity-b"');
    expect(issues[1]).toContain("no pack id");
  });

  it("validates a document with and without the source field against the same schema id", () => {
    // The optional field is additive, so the discriminator does not move: a
    // reader that predates it and one that knows it agree on both documents.
    const withoutSource = JSON.parse(buildAgentToolPoliciesJson(ROSTER)) as PolicyDocument;
    const withSource = JSON.parse(buildAgentToolPoliciesJson(PACK_ROWS)) as PolicyDocument;

    for (const doc of [withoutSource, withSource]) {
      expect(doc.schema).toBe(AGENT_TOOL_POLICIES_SCHEMA);
      expect(doc.categories).toEqual([...ALL_TOOL_CATEGORIES]);
      for (const row of doc.policies) {
        expect(typeof row.agentId).toBe("string");
        expect(typeof row.rationale).toBe("string");
        for (const category of row.allow) expect(isToolCategory(category)).toBe(true);
      }
    }
    expect(withoutSource.policies.every((row) => !Object.hasOwn(row, "source"))).toBe(true);
    expect(withSource.policies.every((row) => Object.hasOwn(row, "source"))).toBe(true);
  });
});

describe("deriveUserAgentPolicy", () => {
  const base: AgentToolPolicy = {
    agentId: "stamity-user-agent",
    allow: ["read"],
    denyTools: ["Bash"],
    rationale: "Base grant.",
  };

  it("adds a functional category and records it in the rationale", () => {
    const derived = deriveUserAgentPolicy(base, ["network"]);

    expect(derived.allow).toEqual(["read", "network"]);
    expect(derived.rationale).toBe("Base grant. User-granted: network.");
    expect(derived.denyTools).toEqual(["Bash"]);
    expect(base.allow).toEqual(["read"]);
  });

  it("strips a reserved category and leaves no trace of the request", () => {
    const derived = deriveUserAgentPolicy(base, ["git", "board"]);

    expect(derived.allow).toEqual(["read"]);
    expect(derived.rationale).toBe("Base grant.");
    expect(checkToolAccess([derived], "stamity-user-agent", "GitCommit", TOOL_MAP).allowed).toBe(false);
    expect(validateToolPolicies([derived])).toEqual([]);
  });

  it("drops unknown categories and duplicates, and keeps the base deny list intact", () => {
    const derived = deriveUserAgentPolicy(base, [
      "read",
      "edit",
      "edit",
      "reed",
    ] as unknown as readonly ["read"]);

    expect(derived.allow).toEqual(["read", "edit"]);
    expect(derived.rationale).toBe("Base grant. User-granted: edit.");
    expect(checkToolAccess([derived], "stamity-user-agent", "Bash", TOOL_MAP).allowed).toBe(false);
  });

  it("returns a policy with no denyTools key when the base carried none", () => {
    const derived = deriveUserAgentPolicy(
      { agentId: "stamity-plain", allow: ["read"], rationale: "r" },
      ["planning"],
    );

    expect(Object.hasOwn(derived, "denyTools")).toBe(false);
    expect(Object.hasOwn(derived, "source")).toBe(false);
  });

  it("carries the base's provenance through a widening", () => {
    // A user addition changes what the agent may do, never where its row came
    // from — dropping the field would relabel a pack grant as core at exactly
    // the moment it got wider.
    const derived = deriveUserAgentPolicy(PACK_ROWS[0]!, ["planning"]);

    expect(derived.allow).toEqual(["read", "edit", "execute", "planning"]);
    expect(derived.source).toEqual({ kind: "pack", packId: "ops" });
  });
});

describe("toFailureLogEntry", () => {
  it("maps a denial onto a log entry that survives a write/read round trip", () => {
    const at = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));
    const event: AllowlistDenialEvent = {
      agentId: "stamity-reviewer",
      tool: "Write",
      reason: "category-denied",
    };

    const entry = toFailureLogEntry(event, at);

    expect(entry).toEqual({
      timestamp: "2026-01-02T03:04:05.000Z",
      phase: ALLOWLIST_FAILURE_PHASE,
      agentId: "stamity-reviewer",
      errorType: "AllowlistDenial",
      message: 'Agent "stamity-reviewer" was denied tool "Write" (category-denied).',
      context: { tool: "Write", reason: "category-denied" },
    });

    expect(parseFailureLog(`${formatLogEntry(entry)}\n`)).toEqual([entry]);
  });

  it("defaults the timestamp to now, so a caller cannot forget to stamp one", () => {
    const before = Date.now();
    const entry = toFailureLogEntry({ agentId: "a", tool: "Read", reason: "unknown-agent" });
    const stamped = Date.parse(entry.timestamp);

    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });
});

const SRC_ROOT = fileURLToPath(new URL("../../src", import.meta.url));
const MODULE_PATH = join(SRC_ROOT, "tools", "allowlist.ts");

/** Every `.ts` file under `src/`, absolute. */
function sourceFiles(dir: string = SRC_ROOT, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(absolute, out);
    else if (entry.name.endsWith(".ts")) out.push(absolute);
  }
  return out;
}

describe("enforcement-point claim", () => {
  /** Files that IMPORT a name from this module — a doc mention is not a call site. */
  function importersOf(name: string): string[] {
    const importers: string[] = [];
    for (const file of sourceFiles()) {
      if (file === MODULE_PATH) continue;
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /^[ \t]*import[ \t]+(?!type[ \t])\{([^}]*)\}[ \t]*from[ \t]*["']([^"']*allowlist\.ts)["']/gm,
      )) {
        const names = (match[1] ?? "").split(",").map((entry) => entry.trim().split(/\s+as\s+/)[0]);
        if (names.includes(name)) importers.push(file);
      }
    }
    return importers;
  }

  /**
   * The header claimed "two enforcement points read one policy set" while the
   * in-process one — `checkToolAccess` — had no production caller at all, so an
   * operator would read a denial as defence-in-depth when the generated guard
   * script was the whole of it. This pins the claim to the call graph in both
   * directions: while nothing imports the check, the header must say ONE point;
   * the moment something does, the header has to be updated or this fails.
   */
  it("states as many enforcement points as the call graph has", () => {
    const header = readFileSync(MODULE_PATH, "utf8").slice(0, 4000);
    const wired = importersOf("checkToolAccess");

    if (wired.length === 0) {
      expect(
        header,
        "src/tools/allowlist.ts claims two enforcement points while nothing imports " +
          "checkToolAccess. Say one, or wire the check at the delegation boundary.",
      ).not.toMatch(/[Tt]wo enforcement points/);
      expect(header).toMatch(/ONE enforcement point|BUILT BUT UNWIRED/);
    } else {
      expect(
        header,
        `checkToolAccess is now imported by ${wired.join(", ")} — the header should say two ` +
          "enforcement points again.",
      ).toMatch(/[Tt]wo enforcement points/);
    }
  });

  it("keeps the serializer wired, which is what makes the single point real", () => {
    // Non-degenerate counterpart: the claim that survives is that the emitted
    // document IS reached, so the importer scan must answer differently for the
    // two functions or it proves nothing about either.
    expect(importersOf("buildAgentToolPoliciesJson").length).toBeGreaterThan(0);
    expect(importersOf("checkToolAccess")).toEqual([]);
  });

  /** The prose shape the correction removes: a second reader of the policy set. */
  const PAIR_CLAIM = /(both|two) enforcement points/i;

  /** Paths under `src/`, POSIX-separated, whose prose still asserts that pair. */
  function pairClaimants(): string[] {
    return sourceFiles()
      .filter((file) => PAIR_CLAIM.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC_ROOT, file).split(sep).join("/"))
      .toSorted();
  }

  /**
   * The correction landed on this module first and left the siblings asserting
   * a pair. Those are frozen here delete-only — the same shape as
   * `REGISTRY_ONLY_MODULES` in test/architecture/boundaries.test.ts: the set
   * shrinks as each header is rewritten against the call graph, and a file that
   * newly claims a second reader fails instead of joining the ledger. Listing
   * it in a test rather than in the module header is what keeps the header from
   * going stale one rewrite at a time.
   */
  const PAIR_CLAIM_LEDGER: readonly string[] = [
    "emit/hooksInfra.ts",
    "pack/install.ts",
    "roster/agentGrants.ts",
  ];

  it("lets no new module claim a second enforcement point", () => {
    // Non-degeneracy: the scan must fire on the exact wording it retired, or
    // the subset assertion below passes by matching nothing at all.
    expect(PAIR_CLAIM.test("Matched exactly by both enforcement points.")).toBe(true);
    for (const known of PAIR_CLAIM_LEDGER) {
      expect(existsSync(join(SRC_ROOT, known)), `${known} is ledgered but absent`).toBe(true);
    }

    const unexpected = pairClaimants().filter((file) => !PAIR_CLAIM_LEDGER.includes(file));

    expect(
      unexpected,
      "asserts a second enforcement point reads the policy set. checkToolAccess has no " +
        "production call site, so there is one. Correct the wording — do not extend the ledger.",
    ).toEqual([]);
  });

  it("has the two modules this correction owns free of the claim", () => {
    // The green signal for the residual: before the rewrite these two
    // carried it at four sites (allowlist.ts's trailer named the siblings;
    // agentPolicies.ts said it in its header, its row docstring and its roster
    // docstring), so this assertion failed on the defect it now pins.
    const claimants = pairClaimants();

    expect(claimants).not.toContain("tools/allowlist.ts");
    expect(claimants).not.toContain("roster/agentPolicies.ts");
  });
});
