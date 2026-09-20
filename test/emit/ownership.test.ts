import { describe, expect, it } from "vitest";
import {
  isPluginOwned,
  pluginOwnedSummary,
  sharedProjectionOwners,
  withoutPluginOwnedRows,
} from "../../src/emit/ownership.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import type { AdapterOutput } from "../../src/types/content.ts";
import type { Tool } from "../../src/types/core.ts";
import type { PluginConfig, SetupManifest } from "../../src/types/manifest.ts";

/**
 * The one predicate four adapters and the core composer read. Pure-function
 * lane: every input is a hand-built manifest, because the whole risk this
 * module carries is a class skipped on one client and not another, and that is
 * a statement about the answer rather than about any filesystem.
 */

const FIXED_NOW = new Date("2026-09-20T00:00:00.000Z");

function manifestOf(tools: Tool[], plugin?: PluginConfig): SetupManifest {
  const base = createManifest({
    tools,
    selection: { items: { agent: [], skill: [], rule: [], command: [] } },
    generatorVersion: "0.0.0-test",
    now: FIXED_NOW,
  });
  return plugin === undefined ? base : { ...base, plugin };
}

/** The four classes file 1's claude root declares `carried`. */
const CLAUDE_CARRIED = ["agent", "skill", "command", "hooks"] as const;

function row(artifactId: string, artifactType: AdapterOutput["owner"]["artifactType"]): AdapterOutput {
  return {
    path: `${artifactId}.md`,
    content: "body\n",
    owner: { adapter: "claude", artifactId, artifactType },
  };
}

describe("isPluginOwned", () => {
  it("owns nothing at all when the manifest carries no plugin field", () => {
    const manifest = manifestOf(["claude", "codex"]);

    for (const cls of ["agent", "skill", "command", "rule", "hooks"] as const) {
      expect(isPluginOwned(manifest, "claude", cls), `claude ${cls}`).toBe(false);
      expect(isPluginOwned(manifest, "codex", cls), `codex ${cls}`).toBe(false);
    }
  });

  it("owns exactly the recorded classes of the recorded client under plugin-backed", () => {
    const manifest = manifestOf(["claude", "codex"], {
      mode: "plugin-backed",
      clients: { claude: { version: "1.9.0", classes: [...CLAUDE_CARRIED] } },
    });

    expect(isPluginOwned(manifest, "claude", "agent")).toBe(true);
    expect(isPluginOwned(manifest, "claude", "skill")).toBe(true);
    expect(isPluginOwned(manifest, "claude", "command")).toBe(true);
    expect(isPluginOwned(manifest, "claude", "hooks")).toBe(true);
    // Rules stay repository-owned on this root: they are glob-scoped files the
    // repository's own paths anchor, and the record does not list them.
    expect(isPluginOwned(manifest, "claude", "rule")).toBe(false);
    // A co-selected client with no record of its own owns nothing.
    expect(isPluginOwned(manifest, "codex", "agent")).toBe(false);
  });

  it("owns nothing while the mode still says generated, record or no record", () => {
    // The coexistence state: a repository noting the root it knows about before
    // it migrates. Reading that as ownership would stop emission for a plugin
    // nobody installed yet.
    const manifest = manifestOf(["claude"], {
      mode: "generated",
      clients: { claude: { version: "1.9.0", classes: [...CLAUDE_CARRIED] } },
    });

    for (const cls of CLAUDE_CARRIED) {
      expect(isPluginOwned(manifest, "claude", cls), cls).toBe(false);
    }
  });
});

describe("an absent manifest", () => {
  it("owns nothing, keeps every reader and summarises nothing", () => {
    // Reachable, not defensive: `stamity plugin status` answers on a repository
    // that was never initialised, and `check`'s rows read a manifest that may
    // have failed to parse. The tolerant answer is "no plugin owns anything",
    // never a throw — a boundary that cannot be read is a boundary that has not
    // moved.
    for (const manifest of [null, undefined]) {
      expect(isPluginOwned(manifest, "claude", "agent"), String(manifest)).toBe(false);
      expect(sharedProjectionOwners(manifest, ["cursor", "codex"]), String(manifest)).toEqual([
        "cursor",
        "codex",
      ]);
      expect(pluginOwnedSummary(manifest), String(manifest)).toEqual([]);
      expect(
        withoutPluginOwnedRows(manifest, "claude", [row("alpha", "agent")], new Set()),
        String(manifest),
      ).toEqual([row("alpha", "agent")]);
    }
  });
});

describe("sharedProjectionOwners", () => {
  it("returns every reader unchanged when no plugin owns skills", () => {
    const manifest = manifestOf(["claude", "cursor", "copilot", "codex"]);

    expect(sharedProjectionOwners(manifest, ["cursor", "copilot", "codex"])).toEqual([
      "cursor",
      "copilot",
      "codex",
    ]);
  });

  it("drops only the readers whose plugin owns skill", () => {
    const manifest = manifestOf(["cursor", "copilot", "codex"], {
      mode: "plugin-backed",
      clients: {
        cursor: { version: "1.9.0", classes: ["skill"] },
        copilot: { version: "1.9.0", classes: ["agent"] },
      },
    });

    // copilot's record owns `agent`, not `skill`, so it still co-owns the tree —
    // the drop is per class, never per client.
    expect(sharedProjectionOwners(manifest, ["cursor", "copilot", "codex"])).toEqual([
      "copilot",
      "codex",
    ]);
  });

  it("empties when every reader's plugin owns skill", () => {
    const manifest = manifestOf(["cursor", "copilot", "codex"], {
      mode: "plugin-backed",
      clients: {
        cursor: { version: "1.9.0", classes: ["skill"] },
        copilot: { version: "1.9.0", classes: ["skill"] },
        codex: { version: "1.9.0", classes: ["skill"] },
      },
    });

    expect(sharedProjectionOwners(manifest, ["cursor", "copilot", "codex"])).toEqual([]);
  });
});

describe("pluginOwnedSummary", () => {
  it("is empty under generated mode and for a repository with no plugin field", () => {
    expect(pluginOwnedSummary(manifestOf(["claude"]))).toEqual([]);
    expect(
      pluginOwnedSummary(
        manifestOf(["claude"], {
          mode: "generated",
          clients: { claude: { version: "1.9.0", classes: ["agent"] } },
        }),
      ),
    ).toEqual([]);
  });

  it("lists the selected clients in TOOLS order with their classes in declaration order", () => {
    const manifest = manifestOf(["codex", "claude"], {
      mode: "plugin-backed",
      clients: {
        // Deliberately out of declaration order in the record, so the sort is
        // proven rather than inherited from the literal.
        claude: { version: "1.9.0", classes: ["command", "hooks", "agent", "skill"] },
        codex: { version: "1.9.0", classes: ["skill"] },
      },
    });

    expect(pluginOwnedSummary(manifest)).toEqual([
      { tool: "claude", classes: ["agent", "skill", "command", "hooks"] },
      { tool: "codex", classes: ["skill"] },
    ]);
  });

  it("ignores a client recorded in the plugin but absent from the selection", () => {
    // The edge the emission boundary owns: a root recorded for a client this
    // repository does not target changes nothing about what is emitted, so the
    // summary emission reads must not claim it either.
    const manifest = manifestOf(["claude"], {
      mode: "plugin-backed",
      clients: {
        claude: { version: "1.9.0", classes: ["agent"] },
        cursor: { version: "1.9.0", classes: ["agent", "skill"] },
      },
    });

    expect(pluginOwnedSummary(manifest)).toEqual([{ tool: "claude", classes: ["agent"] }]);
  });
});

describe("withoutPluginOwnedRows", () => {
  const HOOK_IDS = new Set(["claude-review-gate"]);

  it("keeps every row when nothing is plugin-owned", () => {
    const rows = [row("alpha", "agent"), row("beta", "rule"), row("claude-review-gate", "infra")];

    expect(withoutPluginOwnedRows(manifestOf(["claude"]), "claude", rows, HOOK_IDS)).toEqual(rows);
  });

  it("drops the owned content classes and the named hook infra rows, and nothing else", () => {
    const manifest = manifestOf(["claude"], {
      mode: "plugin-backed",
      clients: { claude: { version: "1.9.0", classes: [...CLAUDE_CARRIED] } },
    });
    const rows = [
      row("alpha", "agent"),
      row("beta", "rule"),
      row("gamma", "command"),
      row("delta", "skill"),
      row("claude-review-gate", "infra"),
      // An infra row that is not hook wiring: the bridge file stays, because a
      // plugin carrying hooks does not carry the client's memory import.
      row("claude-md", "infra"),
    ];

    expect(
      withoutPluginOwnedRows(manifest, "claude", rows, HOOK_IDS).map((entry) => entry.owner.artifactId),
    ).toEqual(["beta", "claude-md"]);
  });

  it("keeps a hook infra row whose class the plugin does not own", () => {
    const manifest = manifestOf(["claude"], {
      mode: "plugin-backed",
      clients: { claude: { version: "1.9.0", classes: ["agent"] } },
    });
    const rows = [row("alpha", "agent"), row("claude-review-gate", "infra")];

    expect(
      withoutPluginOwnedRows(manifest, "claude", rows, HOOK_IDS).map((entry) => entry.owner.artifactId),
    ).toEqual(["claude-review-gate"]);
  });
});
