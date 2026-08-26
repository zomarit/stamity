import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assertLedgerContainment,
  computeReclaimCandidates,
  diffLedgers,
  ledgerUnionPaths,
  ownersOfPath,
  replaceAdapterEntries,
  toLedgerEntries,
  type EmittedArtifact,
} from "../../src/manifest/ledger.ts";
import { CONTENT_CLASSES } from "../../src/types/content.ts";
import { TOOLS, type Tool } from "../../src/types/core.ts";
import { EngineError } from "../../src/types/errors.ts";
import type { LedgerEntry } from "../../src/types/manifest.ts";

/**
 * Pure data logic — no filesystem, no clock: every case runs on values alone,
 * which is itself part of the contract under test (a row whose file is gone
 * from disk must still diff and reclaim; disk state is the sweep's concern).
 *
 * The adapter fixtures are typed `EmittedArtifact` rather than `LedgerEntry`
 * because a ledger row's owner is now `Tool | pack:<id>` while an emission's is
 * a `Tool` — the narrower type is what these rows actually are, and it stays
 * assignable everywhere a `LedgerEntry` is wanted. Pack-owned rows are declared
 * as `LedgerEntry` at the cases that use them.
 */

const CLAUDE_AGENT: EmittedArtifact = {
  path: ".claude/agents/reviewer.md",
  adapter: "claude",
  artifactId: "reviewer",
  artifactType: "agent",
  contentHash: "hash-1",
  stampedVersion: "1.0.0",
};
const CLAUDE_MCP: EmittedArtifact = {
  path: ".mcp.json",
  adapter: "claude",
  artifactId: "mcp-config",
  artifactType: "infra",
};
const CURSOR_RULE: EmittedArtifact = {
  path: ".cursor/rules/30-security.mdc",
  adapter: "cursor",
  artifactId: "security",
  artifactType: "rule",
};
// One shared path, two owners — legal by design (shared AGENTS.md).
const CODEX_SHARED: EmittedArtifact = {
  path: "AGENTS.md",
  adapter: "codex",
  artifactId: "agents-root",
  artifactType: "infra",
};
const COPILOT_SHARED: EmittedArtifact = {
  path: "AGENTS.md",
  adapter: "copilot",
  artifactId: "agents-root",
  artifactType: "infra",
};
// Installed pack content: owned by the pack, not by any adapter.
const PACK_ROW: LedgerEntry = {
  path: ".stamity/packs/acme__ops/agents/reviewer.md",
  adapter: "pack:@acme/ops",
  artifactId: "@acme/ops/agents/reviewer.md",
  artifactType: "infra",
  contentHash: "hash-pack",
};

function multiAdapterLedger(): LedgerEntry[] {
  return structuredClone([CLAUDE_AGENT, CLAUDE_MCP, CURSOR_RULE, CODEX_SHARED, COPILOT_SHARED]);
}

const rowKey = (entry: LedgerEntry): string => `${entry.adapter}\u0000${entry.path}`;
const byKey = (rows: readonly LedgerEntry[]): Map<string, LedgerEntry> =>
  new Map(rows.map((row) => [rowKey(row), row]));
const rowFor = (path: string): LedgerEntry => ({
  path,
  adapter: "claude",
  artifactId: "x",
  artifactType: "agent",
});

describe("toLedgerEntries", () => {
  it("maps emissions to ledger rows field-for-field, sharing no reference", () => {
    const emitted: EmittedArtifact[] = [structuredClone(CLAUDE_AGENT), structuredClone(CURSOR_RULE)];

    const rows = toLedgerEntries(emitted);

    expect(rows).toEqual([CLAUDE_AGENT, CURSOR_RULE]);
    rows[0]!.path = "mutated.md";
    expect(emitted[0]!.path).toBe(CLAUDE_AGENT.path);
  });

  it("leaves absent optionals absent instead of writing undefined-valued keys", () => {
    // exactOptionalPropertyTypes bans `contentHash: undefined` at typed call
    // sites; the cast simulates the untyped caller that could still smuggle one
    // in, which is exactly what the row constructor guards against.
    const smuggled = {
      path: "b.md",
      adapter: "claude",
      artifactId: "b",
      artifactType: "skill",
      contentHash: undefined,
    } as unknown as EmittedArtifact;

    const rows = toLedgerEntries([
      { path: "a.md", adapter: "claude", artifactId: "a", artifactType: "agent" },
      smuggled,
    ]);

    expect(Object.keys(rows[0]!)).toEqual(["path", "adapter", "artifactId", "artifactType"]);
    expect(Object.keys(rows[1]!)).toEqual(["path", "adapter", "artifactId", "artifactType"]);
  });

  it("drops fields beyond the ledger shape from a richer emission record", () => {
    const emission = {
      ...CLAUDE_MCP,
      bytesWritten: 512,
    } as EmittedArtifact;

    expect(toLedgerEntries([emission])).toEqual([CLAUDE_MCP]);
  });

  it("returns empty for an empty emission run", () => {
    expect(toLedgerEntries([])).toEqual([]);
  });
});

describe("replaceAdapterEntries", () => {
  it("removes only the named adapter's rows and leaves every other adapter untouched", () => {
    const replacement: LedgerEntry = {
      path: ".claude/agents/implementer.md",
      adapter: "claude",
      artifactId: "implementer",
      artifactType: "agent",
    };

    const result = replaceAdapterEntries(multiAdapterLedger(), "claude", [replacement]);

    expect(result.filter((row) => row.adapter === "claude")).toEqual([replacement]);
    expect(result).toContainEqual(CURSOR_RULE);
    expect(result).toContainEqual(CODEX_SHARED);
    expect(result).toContainEqual(COPILOT_SHARED);
    expect(result).toHaveLength(4);
  });

  it("stable-sorts the result by path, shared-path rows keeping their relative order", () => {
    const result = replaceAdapterEntries(multiAdapterLedger(), "claude", [
      structuredClone(CLAUDE_MCP),
      structuredClone(CLAUDE_AGENT),
    ]);

    expect(result.map((row) => row.path)).toEqual([
      ".claude/agents/reviewer.md",
      ".cursor/rules/30-security.mdc",
      ".mcp.json",
      "AGENTS.md",
      "AGENTS.md",
    ]);
    // Stability on the tie: codex preceded copilot in the input and still does.
    expect(result.filter((row) => row.path === "AGENTS.md").map((row) => row.adapter)).toEqual([
      "codex",
      "copilot",
    ]);
  });

  it("orders paths case-sensitively by code unit (uppercase before lowercase)", () => {
    const upper: LedgerEntry = { path: "AGENTS.md", adapter: "codex", artifactId: "up", artifactType: "infra" };
    const lower: LedgerEntry = { path: "agents.md", adapter: "codex", artifactId: "low", artifactType: "infra" };

    const result = replaceAdapterEntries([], "codex", [lower, upper]);

    expect(result.map((row) => row.path)).toEqual(["AGENTS.md", "agents.md"]);
  });

  it("deselects an entire adapter when replacing with no entries", () => {
    const result = replaceAdapterEntries(multiAdapterLedger(), "claude", []);

    expect(result.some((row) => row.adapter === "claude")).toBe(false);
    expect(result).toHaveLength(3);
  });

  it("leaves pack rows in place while rebuilding every adapter in turn", () => {
    // No tool id can equal a `pack:` owner, so a full regeneration of all four
    // adapters must not be able to drop installed pack content.
    let result: LedgerEntry[] = [PACK_ROW, ...multiAdapterLedger()];
    for (const tool of TOOLS) result = replaceAdapterEntries(result, tool, []);

    expect(result).toEqual([PACK_ROW]);
  });

  it("appends an adapter the ledger did not yet know", () => {
    const result = replaceAdapterEntries([CURSOR_RULE], "codex", [CODEX_SHARED]);

    expect(byKey(result)).toEqual(byKey([CURSOR_RULE, CODEX_SHARED]));
  });

  it("mutates neither input and shares no reference with either", () => {
    const ledger = multiAdapterLedger();
    const entries = [structuredClone(CLAUDE_AGENT)];
    const ledgerBefore = structuredClone(ledger);

    const result = replaceAdapterEntries(ledger, "claude", entries);
    result.find((row) => row.artifactId === "reviewer")!.path = "mutated.md";

    expect(ledger).toEqual(ledgerBefore);
    expect(entries[0]!.path).toBe(CLAUDE_AGENT.path);
  });
});

describe("ledgerUnionPaths", () => {
  it("unions paths across adapters, a shared path appearing once", () => {
    expect(ledgerUnionPaths(multiAdapterLedger())).toEqual(
      new Set([".claude/agents/reviewer.md", ".mcp.json", ".cursor/rules/30-security.mdc", "AGENTS.md"]),
    );
  });

  it("returns an empty set for an empty ledger", () => {
    expect(ledgerUnionPaths([])).toEqual(new Set());
  });
});

describe("diffLedgers", () => {
  it("keys rows by path+adapter, so one path moving between adapters is a remove plus an add", () => {
    const diff = diffLedgers([CODEX_SHARED], [COPILOT_SHARED]);

    expect(diff.removed).toEqual([CODEX_SHARED]);
    expect(diff.added).toEqual([COPILOT_SHARED]);
    expect(diff.retained).toEqual([]);
  });

  it("carries a retained row as NEXT's row, so a moved content hash survives the diff", () => {
    const prev = [CLAUDE_AGENT];
    const next = [{ ...CLAUDE_AGENT, contentHash: "hash-2", stampedVersion: "1.1.0" }];

    const diff = diffLedgers(prev, next);

    expect(diff.retained).toEqual(next);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("treats path keys as case-sensitive POSIX strings", () => {
    const prev = [CODEX_SHARED];
    const next = [{ ...CODEX_SHARED, path: "agents.md" }];

    const diff = diffLedgers(prev, next);

    expect(diff.retained).toEqual([]);
    expect(diff.removed).toEqual(prev);
    expect(diff.added).toEqual(next);
  });

  it("diffs a row for a file the filesystem no longer has like any other row", () => {
    // No fs access happens anywhere in this module; the path never existed.
    const ghost: LedgerEntry = {
      path: "ghost/never-on-disk.md",
      adapter: "cursor",
      artifactId: "ghost",
      artifactType: "rule",
    };

    expect(diffLedgers([ghost], []).removed).toEqual([ghost]);
  });

  it("returns three empty lists for two empty ledgers", () => {
    expect(diffLedgers([], [])).toEqual({ added: [], removed: [], retained: [] });
  });
});

describe("computeReclaimCandidates", () => {
  const allTools = new Set<Tool>(TOOLS);

  it("classifies a deselected artifact as 'deselected'", () => {
    const emission = new Set([".mcp.json", ".cursor/rules/30-security.mdc", "AGENTS.md"]);

    const candidates = computeReclaimCandidates(multiAdapterLedger(), emission, allTools);

    expect(candidates).toEqual([{ entry: CLAUDE_AGENT, reason: "deselected" }]);
  });

  it("classifies EVERY row of a removed adapter as 'adapter-removed'", () => {
    const active = new Set<Tool>(["cursor", "codex", "copilot"]);
    const emission = new Set([".cursor/rules/30-security.mdc", "AGENTS.md"]);

    const candidates = computeReclaimCandidates(multiAdapterLedger(), emission, active);

    expect(candidates).toEqual([
      { entry: CLAUDE_AGENT, reason: "adapter-removed" },
      { entry: CLAUDE_MCP, reason: "adapter-removed" },
    ]);
  });

  it("classifies a moved artifact as 'path-renamed' when its new row is in the ledger", () => {
    const renamed: LedgerEntry = { ...CLAUDE_AGENT, path: ".claude/agents/renamed.md" };
    const ledger = [CLAUDE_AGENT, renamed];
    const emission = new Set([".claude/agents/renamed.md"]);

    const candidates = computeReclaimCandidates(ledger, emission, allTools);

    expect(candidates).toEqual([{ entry: CLAUDE_AGENT, reason: "path-renamed" }]);
  });

  it("degrades a rename to 'deselected' against a ledger without the new row, never the reverse", () => {
    const emission = new Set([".claude/agents/renamed.md"]);

    const candidates = computeReclaimCandidates([CLAUDE_AGENT], emission, allTools);

    expect(candidates).toEqual([{ entry: CLAUDE_AGENT, reason: "deselected" }]);
  });

  it("lets 'adapter-removed' win over a rename trace for the same row", () => {
    const renamed: LedgerEntry = { ...CLAUDE_AGENT, path: ".claude/agents/renamed.md" };
    const active = new Set<Tool>(["cursor"]);

    const candidates = computeReclaimCandidates(
      [CLAUDE_AGENT, renamed],
      new Set([".claude/agents/renamed.md"]),
      active,
    );

    expect(candidates).toEqual([{ entry: CLAUDE_AGENT, reason: "adapter-removed" }]);
  });

  it("keeps a shared path off the list while ANY owner still emits it", () => {
    // codex dropped as a tool, but copilot still emits AGENTS.md.
    const active = new Set<Tool>(["claude", "cursor", "copilot"]);
    const emission = new Set([
      ".claude/agents/reviewer.md",
      ".mcp.json",
      ".cursor/rules/30-security.mdc",
      "AGENTS.md",
    ]);

    expect(computeReclaimCandidates(multiAdapterLedger(), emission, active)).toEqual([]);
  });

  it("makes BOTH rows of a shared path candidates once both owners are gone", () => {
    const active = new Set<Tool>(["claude", "cursor"]);
    const emission = new Set([
      ".claude/agents/reviewer.md",
      ".mcp.json",
      ".cursor/rules/30-security.mdc",
    ]);

    const candidates = computeReclaimCandidates(multiAdapterLedger(), emission, active);

    expect(candidates).toEqual([
      { entry: CODEX_SHARED, reason: "adapter-removed" },
      { entry: COPILOT_SHARED, reason: "adapter-removed" },
    ]);
  });

  it("reclaims a row for a file the filesystem no longer has; disk state is the sweep's concern", () => {
    const ghost: LedgerEntry = {
      path: "ghost/never-on-disk.md",
      adapter: "claude",
      artifactId: "ghost",
      artifactType: "agent",
    };

    expect(computeReclaimCandidates([ghost], new Set(), allTools)).toEqual([
      { entry: ghost, reason: "deselected" },
    ]);
  });

  it("returns empty for an empty ledger and empty emission, whatever the adapters", () => {
    expect(computeReclaimCandidates([], new Set(), new Set())).toEqual([]);
    expect(computeReclaimCandidates([], new Set(), allTools)).toEqual([]);
  });

  it("never classifies a pack row, whose content no emission set ever contains", () => {
    // Installed pack content is absent from every emission and its owner is
    // absent from every active-adapter set, so both routes into a candidate
    // would fire — and a sync would queue an installed pack for deletion.
    const ledger = [PACK_ROW, ...multiAdapterLedger()];
    const emission = ledgerUnionPaths(multiAdapterLedger());

    expect(computeReclaimCandidates(ledger, emission, allTools)).toEqual([]);
    expect(computeReclaimCandidates(ledger, new Set(), new Set())).not.toContainEqual(
      expect.objectContaining({ entry: PACK_ROW }),
    );
  });

  it("returns fresh entry objects, not views into the ledger", () => {
    const ledger = [structuredClone(CLAUDE_AGENT)];

    const candidates = computeReclaimCandidates(ledger, new Set(), allTools);
    candidates[0]!.entry.path = "mutated.md";

    expect(ledger[0]!.path).toBe(CLAUDE_AGENT.path);
  });
});

describe("assertLedgerContainment", () => {
  const ROOT = "/repo/root";

  it("accepts nested relative paths and an empty ledger", () => {
    expect(() => assertLedgerContainment([], ROOT)).not.toThrow();
    expect(() =>
      assertLedgerContainment(
        [rowFor("AGENTS.md"), rowFor(".claude/agents/reviewer.md"), rowFor("deep/a/b/c.md")],
        ROOT,
      ),
    ).not.toThrow();
  });

  it("rejects an escaping or absolute path in every spelling, as VALIDATION_ERROR", () => {
    for (const path of ["../x", "/abs/file.md", "C:/win/file.md", "\\\\server\\share", "a/../../b.md", "a\\b.md", ""]) {
      let caught: unknown = null;
      try {
        assertLedgerContainment([rowFor(path)], ROOT);
      } catch (error) {
        caught = error;
      }
      expect(caught, `path ${JSON.stringify(path)} must be refused`).toBeInstanceOf(EngineError);
      const error = caught as EngineError;
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.message).toContain(ROOT);
      expect(error.message).toContain("`ledger[0].path`");
    }
  });

  it("names every defective row in one throw", () => {
    let message = "";
    try {
      assertLedgerContainment([rowFor("fine.md"), rowFor("../up.md"), rowFor("/abs.md")], ROOT);
    } catch (error) {
      message = (error as EngineError).message;
    }

    expect(message).toContain("`ledger[1].path`");
    expect(message).toContain("`ledger[2].path`");
    expect(message).not.toContain("`ledger[0].path`");
  });
});

describe("ownersOfPath", () => {
  it("returns every owner of a shared path, in ledger order", () => {
    expect(ownersOfPath(multiAdapterLedger(), "AGENTS.md")).toEqual([CODEX_SHARED, COPILOT_SHARED]);
  });

  it("matches case-sensitively and returns empty for a path the ledger does not govern", () => {
    expect(ownersOfPath(multiAdapterLedger(), "agents.md")).toEqual([]);
    expect(ownersOfPath(multiAdapterLedger(), "missing.md")).toEqual([]);
    expect(ownersOfPath([], "AGENTS.md")).toEqual([]);
  });

  it("returns fresh objects, not views into the ledger", () => {
    const ledger = multiAdapterLedger();

    const owners = ownersOfPath(ledger, "AGENTS.md");
    owners[0]!.path = "mutated.md";

    expect(ledger.filter((entry) => entry.path === "AGENTS.md")).toHaveLength(2);
  });
});

describe("properties", () => {
  // Fixed seed: the suite must be deterministic run-to-run (CI contract).
  const FC_PARAMS = { seed: 20260813, numRuns: 200 } as const;

  // A small path pool forces key collisions between generated ledgers, so the
  // retained branch is exercised as often as added/removed; the case pair
  // keeps the comparison honestly case-sensitive.
  const pathArb = fc.constantFrom(
    "AGENTS.md",
    "agents.md",
    ".claude/agents/reviewer.md",
    ".cursor/rules/30-security.mdc",
    "a/b.md",
    "a/c.md",
  );
  const entryArb: fc.Arbitrary<LedgerEntry> = fc.record(
    {
      path: pathArb,
      adapter: fc.constantFrom(...TOOLS),
      artifactId: fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/),
      artifactType: fc.constantFrom<LedgerEntry["artifactType"]>(...CONTENT_CLASSES, "infra"),
      contentHash: fc.stringMatching(/^[a-f0-9]{6}$/),
      stampedVersion: fc.stringMatching(/^[0-9]\.[0-9]\.[0-9]$/),
    },
    { requiredKeys: ["path", "adapter", "artifactId", "artifactType"] },
  );
  // Real ledgers are key-unique per (adapter, path): replaceAdapterEntries
  // rebuilds an adapter's rows wholesale, so duplicates cannot accrete.
  const ledgerArb = fc.uniqueArray(entryArb, { selector: rowKey, maxLength: 12 });

  it("diffLedgers(a, a) adds and removes nothing and retains every row", () => {
    fc.assert(
      fc.property(ledgerArb, (ledger) => {
        const diff = diffLedgers(ledger, ledger);
        expect(diff.added).toEqual([]);
        expect(diff.removed).toEqual([]);
        expect(diff.retained).toEqual(ledger);
      }),
      FC_PARAMS,
    );
  });

  it("diff then apply reconstructs next, and removed+retained keys cover prev", () => {
    fc.assert(
      fc.property(ledgerArb, ledgerArb, (prev, next) => {
        const diff = diffLedgers(prev, next);
        expect(byKey([...diff.retained, ...diff.added])).toEqual(byKey(next));
        expect(new Set([...diff.removed, ...diff.retained].map(rowKey))).toEqual(
          new Set(prev.map(rowKey)),
        );
      }),
      FC_PARAMS,
    );
  });

  it("replaceAdapterEntries preserves other adapters' rows exactly and sorts by path", () => {
    fc.assert(
      fc.property(ledgerArb, fc.constantFrom(...TOOLS), ledgerArb, (ledger, adapter, incoming) => {
        const entries = incoming.filter((entry) => entry.adapter === adapter);

        const result = replaceAdapterEntries(ledger, adapter, entries);

        expect(byKey(result.filter((row) => row.adapter !== adapter))).toEqual(
          byKey(ledger.filter((row) => row.adapter !== adapter)),
        );
        expect(byKey(result.filter((row) => row.adapter === adapter))).toEqual(byKey(entries));
        for (let i = 1; i < result.length; i += 1) {
          expect(result[i - 1]!.path <= result[i]!.path).toBe(true);
        }
      }),
      FC_PARAMS,
    );
  });

  it("every reclaim candidate is in the ledger union and outside the emission set", () => {
    fc.assert(
      fc.property(
        ledgerArb,
        fc.array(pathArb, { maxLength: 4 }),
        fc.uniqueArray(fc.constantFrom(...TOOLS), { maxLength: TOOLS.length }),
        (ledger, emitted, active) => {
          const emission: ReadonlySet<string> = new Set(emitted);
          const candidates = computeReclaimCandidates(ledger, emission, new Set(active));
          const union = ledgerUnionPaths(ledger);
          for (const candidate of candidates) {
            expect(union.has(candidate.entry.path)).toBe(true);
            expect(emission.has(candidate.entry.path)).toBe(false);
          }
          // Complement: every non-candidate row's path is still emitted.
          const candidateKeys = new Set(candidates.map((candidate) => rowKey(candidate.entry)));
          for (const entry of ledger) {
            if (!candidateKeys.has(rowKey(entry))) expect(emission.has(entry.path)).toBe(true);
          }
        },
      ),
      FC_PARAMS,
    );
  });
});
