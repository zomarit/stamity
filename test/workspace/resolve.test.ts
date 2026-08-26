import { describe, expect, it } from "vitest";
import type { ContentClass, ContentSelection } from "../../src/types/content.ts";
import { EngineError } from "../../src/types/errors.ts";
import { normalizeRepoPathKey } from "../../src/workspace/manifest.ts";
import {
  WORKSPACE_MANIFEST_VERSION,
  type WorkspaceManifest,
} from "../../src/workspace/model.ts";
import { buildSelectionFromIds, resolveRepoConfig } from "../../src/workspace/resolve.ts";

/**
 * No filesystem lane at all: resolution is a pure function of the manifest, and
 * the tests that matter — layer order, lock enforcement, reference isolation —
 * are all expressible as data. The one member that does not exist on disk
 * resolves here exactly like the ones that do; noticing the missing directory
 * belongs to the cascade.
 */

/** A selection literal, written independently of the builder under test. */
const sel = (items: Partial<Record<ContentClass, string[]>>): ContentSelection => ({
  items: { agent: [], skill: [], rule: [], command: [], ...items },
});

function makeManifest(overrides: Partial<WorkspaceManifest> = {}): WorkspaceManifest {
  return {
    version: WORKSPACE_MANIFEST_VERSION,
    defaults: { tools: ["claude"], selection: sel({ rule: ["security"] }) },
    repos: [{ path: "apps/web" }],
    ...overrides,
  };
}

/** The single-error assertion: the throw is typed, classified, and returned for message checks. */
function validationError(run: () => unknown): EngineError {
  let caught: unknown = null;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(EngineError);
  const error = caught as EngineError;
  expect(error.code).toBe("VALIDATION_ERROR");
  return error;
}

describe("resolveRepoConfig", () => {
  it("hands a member with no groups and no overrides the workspace defaults", () => {
    const resolved = resolveRepoConfig(makeManifest(), "apps/web");

    expect(resolved).toEqual({
      repoPath: "apps/web",
      tools: ["claude"],
      selection: sel({ rule: ["security"] }),
      lockedApplied: [],
    });
  });

  it("layers defaults, then the group addition, then the member's own removal", () => {
    const groups = [{ name: "frontend", addItems: { rule: ["a11y"] } }];
    const withGroup = makeManifest({ groups, repos: [{ path: "apps/web", groups: ["frontend"] }] });

    expect(resolveRepoConfig(withGroup, "apps/web").selection).toEqual(
      sel({ rule: ["security", "a11y"] }),
    );

    const withOverride = makeManifest({
      groups,
      repos: [
        { path: "apps/web", groups: ["frontend"], overrides: { removeItems: { rule: ["a11y"] } } },
      ],
    });

    expect(resolveRepoConfig(withOverride, "apps/web").selection).toEqual(
      sel({ rule: ["security"] }),
    );
  });

  it("merges group deltas in manifest declaration order", () => {
    const adds = { name: "adds", addItems: { rule: ["a11y"] } };
    const drops = { name: "drops", removeItems: { rule: ["a11y"] } };
    const repos = [{ path: "apps/web", groups: ["adds", "drops"] }];

    expect(
      resolveRepoConfig(makeManifest({ groups: [adds, drops], repos }), "apps/web").selection,
    ).toEqual(sel({ rule: ["security"] }));

    expect(
      resolveRepoConfig(makeManifest({ groups: [drops, adds], repos }), "apps/web").selection,
    ).toEqual(sel({ rule: ["security", "a11y"] }));
  });

  it("ignores the order a member happens to list its groups in", () => {
    const groups = [
      { name: "adds", addItems: { rule: ["a11y"] } },
      { name: "drops", removeItems: { rule: ["a11y"] } },
    ];
    const listedBackwards = makeManifest({
      groups,
      repos: [{ path: "apps/web", groups: ["drops", "adds"] }],
    });

    expect(resolveRepoConfig(listedBackwards, "apps/web").selection).toEqual(
      sel({ rule: ["security"] }),
    );
  });

  it("lets the last layer that declares a tool list replace it", () => {
    const groups = [{ name: "editors", toolOverrides: ["cursor" as const] }];
    const fromGroup = makeManifest({ groups, repos: [{ path: "apps/web", groups: ["editors"] }] });

    expect(resolveRepoConfig(fromGroup, "apps/web").tools).toEqual(["cursor"]);

    const fromOverride = makeManifest({
      groups,
      repos: [{ path: "apps/web", groups: ["editors"], overrides: { tools: ["copilot"] } }],
    });

    expect(resolveRepoConfig(fromOverride, "apps/web").tools).toEqual(["copilot"]);
  });

  it("keeps a locked id the member tried to remove, and reports the lock", () => {
    const manifest = makeManifest({
      lockedContent: ["security"],
      repos: [{ path: "apps/web", overrides: { removeItems: { rule: ["security"] } } }],
    });

    const resolved = resolveRepoConfig(manifest, "apps/web");

    expect(resolved.selection).toEqual(sel({ rule: ["security"] }));
    expect(resolved.lockedApplied).toEqual(["security"]);
  });

  it("keeps a locked id a group tried to remove", () => {
    const manifest = makeManifest({
      lockedContent: ["security"],
      groups: [{ name: "lean", removeItems: { rule: ["security"] } }],
      repos: [{ path: "apps/web", groups: ["lean"] }],
    });

    const resolved = resolveRepoConfig(manifest, "apps/web");

    expect(resolved.selection).toEqual(sel({ rule: ["security"] }));
    expect(resolved.lockedApplied).toEqual(["security"]);
  });

  it("reports nothing for a lock that defended nothing", () => {
    const manifest = makeManifest({
      lockedContent: ["never-selected"],
      repos: [{ path: "apps/web", overrides: { removeItems: { rule: ["never-selected"] } } }],
    });

    const resolved = resolveRepoConfig(manifest, "apps/web");

    expect(resolved.selection).toEqual(sel({ rule: ["security"] }));
    expect(resolved.lockedApplied).toEqual([]);
  });

  it("lets a layer's own addition win over its own removal", () => {
    const manifest = makeManifest({
      repos: [
        {
          path: "apps/web",
          overrides: { removeItems: { rule: ["security"] }, addItems: { rule: ["security"] } },
        },
      ],
    });

    expect(resolveRepoConfig(manifest, "apps/web").selection).toEqual(sel({ rule: ["security"] }));
  });

  it("deduplicates ids contributed by several layers, keeping first appearance", () => {
    const manifest = makeManifest({
      defaults: { tools: ["claude"], selection: sel({ rule: ["security", "testing"] }) },
      groups: [{ name: "extra", addItems: { rule: ["testing", "a11y"] } }],
      repos: [
        {
          path: "apps/web",
          groups: ["extra"],
          overrides: { addItems: { rule: ["security", "docs"] } },
        },
      ],
    });

    expect(resolveRepoConfig(manifest, "apps/web").selection.items.rule).toEqual([
      "security",
      "testing",
      "a11y",
      "docs",
    ]);
  });

  it("resolves a member that is registered but absent from disk", () => {
    const manifest = makeManifest({ repos: [{ path: "moved/away" }] });

    expect(resolveRepoConfig(manifest, "moved/away").repoPath).toBe("moved/away");
  });

  it("matches a member path written with another separator or a leading dot-slash", () => {
    const manifest = makeManifest();

    for (const spelling of ["./apps/web", "apps/web/", "apps\\web", "apps//web"]) {
      expect(resolveRepoConfig(manifest, spelling).repoPath).toBe("apps/web");
    }
  });

  /**
   * Drift guard for a cross-module contract, not a second test of normalization.
   * The manifest layer's duplicate-path gate is only sound while its key agrees
   * with the matching this module does — two independent implementations that
   * must agree, which the manifest module's own header calls out. This pins the
   * agreement so a change to either one fails here instead of quietly reopening
   * the hole (a manifest holding two entries the gate passed but resolution
   * cannot tell apart).
   */
  it("matches paths the same way the manifest layer keys them", () => {
    const spellings = [
      "apps/web",
      "./apps/web",
      "apps/web/",
      "apps\\web",
      "apps//web",
      "./apps/./web//",
      "Apps/Web",
      "apps/../web",
    ];

    for (const spelling of spellings) {
      const manifest = makeManifest({ repos: [{ path: spelling }] });
      const key = normalizeRepoPathKey(spelling);

      // Every spelling that keys alike resolves alike, in both directions.
      for (const other of spellings) {
        const matches = normalizeRepoPathKey(other) === key;
        const resolved = () => resolveRepoConfig(manifest, other);
        if (matches) expect(resolved().repoPath).toBe(spelling);
        else expect(resolved).toThrow(EngineError);
      }
    }
  });

  it("takes the first declaration when two entries normalize alike", () => {
    // The read layer rejects this manifest; resolution still needs one answer
    // rather than a coin flip when handed a hand-built one.
    const manifest = makeManifest({
      repos: [
        { path: "apps/web", overrides: { tools: ["claude"] } },
        { path: "./apps/web/", overrides: { tools: ["cursor"] } },
      ],
    });

    expect(resolveRepoConfig(manifest, "apps/web").tools).toEqual(["claude"]);
  });

  it("rejects an unregistered repository, naming what is registered", () => {
    const error = validationError(() => resolveRepoConfig(makeManifest(), "apps/api"));

    expect(error.message).toContain("apps/api");
    expect(error.message).toContain("Registered: apps/web");
  });

  it("rejects a reference to an undefined group, naming it", () => {
    const manifest = makeManifest({
      groups: [{ name: "frontend", addItems: { rule: ["a11y"] } }],
      repos: [{ path: "apps/web", groups: ["frotnend"] }],
    });

    const error = validationError(() => resolveRepoConfig(manifest, "apps/web"));

    expect(error.message).toContain(`"frotnend"`);
    expect(error.message).toContain("Defined groups: frontend");
  });

  it("carries the calibration dials the defaults declare", () => {
    const manifest = makeManifest({
      defaults: {
        tools: ["claude"],
        maturityTier: "team",
        mcp: { servers: ["github"], protocolVersion: "2025-06-18" },
      },
    });

    const resolved = resolveRepoConfig(manifest, "apps/web");

    expect(resolved.maturityTier).toBe("team");
    expect(resolved.mcp).toEqual({ servers: ["github"], protocolVersion: "2025-06-18" });
  });

  it("leaves absent optionals absent rather than present-and-undefined", () => {
    const resolved = resolveRepoConfig(makeManifest(), "apps/web");

    expect(Object.hasOwn(resolved, "maturityTier")).toBe(false);
    expect(Object.hasOwn(resolved, "mcp")).toBe(false);
  });

  it("propagates an empty selection when the defaults declare none", () => {
    const manifest = makeManifest({
      defaults: { tools: ["claude"] },
      groups: [{ name: "base", addItems: { agent: ["reviewer"] } }],
      repos: [{ path: "apps/web", groups: ["base"] }],
    });

    expect(resolveRepoConfig(manifest, "apps/web").selection).toEqual(sel({ agent: ["reviewer"] }));
  });

  it("shares no array with the manifest it resolved from", () => {
    const manifest = makeManifest({
      defaults: {
        tools: ["claude"],
        selection: sel({ rule: ["security"] }),
        mcp: { servers: ["github"] },
      },
    });

    const first = resolveRepoConfig(manifest, "apps/web");
    first.tools.push("codex");
    first.selection.items.rule.push("injected");
    first.mcp?.servers.push("injected");

    expect(resolveRepoConfig(manifest, "apps/web")).toEqual({
      repoPath: "apps/web",
      tools: ["claude"],
      selection: sel({ rule: ["security"] }),
      mcp: { servers: ["github"] },
      lockedApplied: [],
    });
  });
});

describe("buildSelectionFromIds", () => {
  it("fills every content class, including the ones with no ids", () => {
    expect(buildSelectionFromIds({ rule: ["security"] })).toEqual(sel({ rule: ["security"] }));
    expect(buildSelectionFromIds({})).toEqual(sel({}));
  });

  it("deduplicates while keeping first appearance", () => {
    const selection = buildSelectionFromIds({ agent: ["b", "a", "b", "a"] });

    expect(selection.items.agent).toEqual(["b", "a"]);
  });

  it("copies its input so the selection cannot be mutated through it", () => {
    const ids = { skill: ["review"] };
    const selection = buildSelectionFromIds(ids);
    ids.skill.push("injected");

    expect(selection.items.skill).toEqual(["review"]);
  });
});
