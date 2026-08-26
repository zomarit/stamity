import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CONTENT_CLASSES,
  type AdapterOutput,
  type CanonicalFile,
  type ContentClass,
  type ContentSelection,
  type MergeResult,
  type RulePrecedence,
} from "../../src/types/content.ts";
import type {
  DetectedSummary,
  Framework,
  PackageEntry,
  RepoInfo,
} from "../../src/types/detect.ts";
import {
  MANIFEST_FILE,
  MANIFEST_VERSION,
  type HooksConfig,
  type LearningsConfig,
  type LedgerEntry,
  type ManifestMigration,
  type McpConfig,
  type SetupManifest,
  type ToolOptions,
} from "../../src/types/manifest.ts";
import * as core from "../../src/types/core.ts";
import {
  EFFORT_LEVELS,
  MODEL_CLASSES,
  VALID_EFFORT_LEVELS,
  VALID_MODEL_CLASSES,
  type EffortLevel,
  type ModelClass,
  type Tool,
} from "../../src/types/core.ts";
import { STATE_DIR } from "../../src/types/markers.ts";

describe("model ladder enums", () => {
  it("lists the four classes strongest to cheapest, with the type in lockstep", () => {
    expect(MODEL_CLASSES).toEqual(["frontier", "advanced", "standard", "economy"]);
    expectTypeOf<ModelClass>().toEqualTypeOf<"frontier" | "advanced" | "standard" | "economy">();
  });

  it("lists the three shared effort levels, with the type in lockstep", () => {
    expect(EFFORT_LEVELS).toEqual(["low", "medium", "high"]);
    expectTypeOf<EffortLevel>().toEqualTypeOf<"low" | "medium" | "high">();
  });

  it("keeps each VALID_* set in parity with its tuple, with no duplicate member", () => {
    for (const [tuple, valid] of [
      [MODEL_CLASSES, VALID_MODEL_CLASSES],
      [EFFORT_LEVELS, VALID_EFFORT_LEVELS],
    ] as const) {
      expect(valid.size).toBe(tuple.length);
      expect([...valid]).toEqual([...tuple]);
      for (const member of tuple) expect(valid.has(member)).toBe(true);
    }
    expect(VALID_MODEL_CLASSES.has("frontier")).toBe(true);
    expect(VALID_MODEL_CLASSES.has("Frontier")).toBe(false);
    expect(VALID_EFFORT_LEVELS.has("xhigh")).toBe(false);
  });

  it("ships no default for either family", () => {
    // A role's class comes from its own artifact frontmatter and its effort
    // from the ladder row, so a global default here would be a sizing decision
    // taken for an artifact that never declared one. The neighbouring families
    // that DO have a meaningful default keep theirs, which is what makes the
    // absence a decision rather than an omission.
    const exported = Object.keys(core);
    expect(exported).not.toContain("DEFAULT_MODEL_CLASS");
    expect(exported).not.toContain("DEFAULT_EFFORT_LEVEL");
    expect(exported).toContain("DEFAULT_MATURITY_TIER");
    // The confidence-floor trio was removed, not merely left without a default:
    // the review-loop gate is enforced at a fixed threshold in the emitted
    // review-gate hook, so a settable floor would have declared a value that
    // shipped enforcement ignores. Asserted here as an ABSENCE so re-adding the
    // enum fails this case rather than silently restoring a contradicting dial.
    expect(exported.filter((name) => name.includes("CONFIDENCE"))).toEqual([]);
  });
});

describe("content classes", () => {
  it("lists exactly the 4 classes, in stable order", () => {
    expect(CONTENT_CLASSES).toEqual(["agent", "skill", "rule", "command"]);
    expectTypeOf<ContentClass>().toEqualTypeOf<"agent" | "skill" | "rule" | "command">();
  });

  it("keeps dead classes dead: no hook, check, github-agent, or prompt member", () => {
    const classes: readonly string[] = CONTENT_CLASSES;
    expect(classes).not.toContain("hook");
    expect(classes).not.toContain("check");
    expect(classes).not.toContain("github-agent");
    expect(classes).not.toContain("prompt");
  });
});

describe("content shapes", () => {
  it("keys ContentSelection.items by exactly the 4 content classes", () => {
    expectTypeOf<keyof ContentSelection["items"]>().toEqualTypeOf<ContentClass>();
    expectTypeOf<ContentSelection["items"][ContentClass]>().toEqualTypeOf<string[]>();
    const selection: ContentSelection = {
      items: { agent: ["implementer"], skill: [], rule: ["security"], command: [] },
    };
    expect(Object.keys(selection.items).toSorted()).toEqual(["agent", "command", "rule", "skill"]);
  });

  it("pins the CanonicalFile shape; precedence is the optional rule bucket", () => {
    expectTypeOf<CanonicalFile["type"]>().toEqualTypeOf<ContentClass>();
    expectTypeOf<RulePrecedence>().toEqualTypeOf<"critical" | "high" | "normal" | "low">();
    const rule: CanonicalFile = {
      path: "/content/rules/stamity-security.md",
      relativePath: "rules/stamity-security.md",
      type: "rule",
      id: "security",
      frontmatter: { description: "security floors" },
      body: "# Security\n",
      tags: ["security"],
      precedence: "critical",
    };
    // No precedence: valid for non-rule classes.
    const agent: CanonicalFile = {
      path: "/content/agents/stamity-implementer.md",
      relativePath: "agents/stamity-implementer.md",
      type: "agent",
      id: "implementer",
      frontmatter: {},
      body: "",
      tags: ["implementation"],
    };
    expect(rule.precedence).toBe("critical");
    expect(agent.precedence).toBeUndefined();
  });

  it("gives AdapterOutput.owner the ledger attribution triple, owned by a tool", () => {
    // A ledger row's owner widened to `Tool | pack:<id>` when packs became a
    // ledger owner in their own right; an adapter emission can only ever be the
    // `Tool` half. So the triple is asserted field-wise instead of by whole-type
    // equality: every emission still converts to a row (`toExtend`), the two
    // non-owner fields are exactly the ledger's, and an adapter provably cannot
    // emit a pack-owned row.
    expectTypeOf<AdapterOutput["owner"]>().toExtend<
      Pick<LedgerEntry, "adapter" | "artifactId" | "artifactType">
    >();
    expectTypeOf<AdapterOutput["owner"]["adapter"]>().toEqualTypeOf<Tool>();
    expectTypeOf<AdapterOutput["owner"]["artifactId"]>().toEqualTypeOf<LedgerEntry["artifactId"]>();
    expectTypeOf<AdapterOutput["owner"]["artifactType"]>().toEqualTypeOf<
      LedgerEntry["artifactType"]
    >();
    const output: AdapterOutput = {
      path: ".claude/agents/stamity-implementer.md",
      content: "<!-- STAMITY:BEGIN -->\n...\n<!-- STAMITY:END -->",
      owner: { adapter: "claude", artifactId: "implementer", artifactType: "agent" },
    };
    expect(output.owner.artifactType).toBe("agent");
  });

  it("pins the MergeResult action union", () => {
    expectTypeOf<MergeResult["action"]>().toEqualTypeOf<
      "created" | "updated" | "skipped" | "unchanged"
    >();
    const result: MergeResult = { path: "AGENTS.md", action: "unchanged" };
    expect(result.warning).toBeUndefined();
  });
});

describe("manifest constants", () => {
  it("pins the state-file location to .stamity/manifest.json", () => {
    expect(MANIFEST_FILE).toBe("manifest.json");
    expect(`${STATE_DIR}/${MANIFEST_FILE}`).toBe(".stamity/manifest.json");
  });

  it("pins schema generation 1", () => {
    expect(MANIFEST_VERSION).toBe("1.0.0");
  });
});

describe("SetupManifest", () => {
  const minimal: SetupManifest = {
    version: MANIFEST_VERSION,
    generatedBy: "0.0.0",
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    tools: ["claude", "codex"],
    selection: { items: { agent: [], skill: [], rule: [], command: [] } },
    ledger: [],
  };

  it("types the ledger as LedgerEntry[] and selection as ContentSelection", () => {
    expectTypeOf<SetupManifest["ledger"]>().toEqualTypeOf<LedgerEntry[]>();
    expectTypeOf<SetupManifest["selection"]>().toEqualTypeOf<ContentSelection>();
    expect(minimal.ledger).toEqual([]);
  });

  it("requires only the regeneration core; every dial is optional", () => {
    // The `minimal` literal above compiling IS the assertion for the required set.
    expect(minimal.platform).toBeUndefined();
    const full: SetupManifest = {
      ...minimal,
      platform: "github",
      maturityTier: "scaleup",
      communicationStyle: "technical",
      mcp: { servers: ["github"], protocolVersion: "2025-06-18" },
      learnings: { maxCount: 100 },
      hooks: { userHooksDir: ".stamity/hooks" },
      toolOptions: { claude: { statusline: true } },
      detected: {
        languages: ["typescript"],
        linters: ["oxlint"],
        testFrameworks: ["vitest"],
        ciProviders: ["github-actions"],
      },
    };
    expect(full.mcp?.servers).toEqual(["github"]);
  });

  it("carries no legacy surface: ledger replaced managedFiles; config sprawl is gone", () => {
    expectTypeOf<SetupManifest>().toHaveProperty("ledger");
    expectTypeOf<SetupManifest>().not.toHaveProperty("managedFiles");
    expectTypeOf<SetupManifest>().not.toHaveProperty("managedFilesByAdapter");
    expectTypeOf<SetupManifest>().not.toHaveProperty("cliTools");
    expectTypeOf<SetupManifest>().not.toHaveProperty("worktree");
    expectTypeOf<SetupManifest>().not.toHaveProperty("costTracking");
    expectTypeOf<SetupManifest>().not.toHaveProperty("board");
  });

  it("pins the small config bags", () => {
    expectTypeOf<McpConfig>().toEqualTypeOf<{ servers: string[]; protocolVersion?: string }>();
    expectTypeOf<LearningsConfig>().toEqualTypeOf<{ maxCount?: number }>();
    expectTypeOf<HooksConfig>().toEqualTypeOf<{ userHooksDir?: string }>();
  });

  it("keeps toolOptions an open per-tool bag: any keys in, unknown out, tools all optional", () => {
    expectTypeOf<NonNullable<SetupManifest["toolOptions"]>>().toEqualTypeOf<
      Partial<Record<Tool, ToolOptions>>
    >();
    // Reads come back unknown — the engine cannot consume a key without narrowing.
    expectTypeOf<ToolOptions[string]>().toEqualTypeOf<unknown>();
    const bag: ToolOptions = { statusline: true, nested: { deep: ["x"] }, count: 3 };
    // A subset of tools is valid; adapters own their bag's meaning.
    const perTool: NonNullable<SetupManifest["toolOptions"]> = {
      claude: bag,
      codex: { sandbox: "workspace-write" },
    };
    expect(Object.keys(perTool)).toEqual(["claude", "codex"]);
  });
});

describe("ownership ledger", () => {
  it("admits 'infra' rows for non-content emissions so the reclaim sweep owns them", () => {
    expectTypeOf<LedgerEntry["artifactType"]>().toEqualTypeOf<ContentClass | "infra">();
    const infraRows: LedgerEntry[] = [
      {
        path: ".claude/hooks/pretooluse-allowlist.mjs",
        adapter: "claude",
        artifactId: "hook-allowlist",
        artifactType: "infra",
      },
      { path: ".mcp.json", adapter: "claude", artifactId: "mcp-config", artifactType: "infra" },
      { path: ".env.mcp.example", adapter: "cursor", artifactId: "mcp-env", artifactType: "infra" },
    ];
    expect(infraRows.every((row) => row.artifactType === "infra")).toBe(true);
  });

  it("makes the drift fields optional: a row is valid without hash or stamp", () => {
    const bare: LedgerEntry = {
      path: ".cursor/rules/10-stamity-security.mdc",
      adapter: "cursor",
      artifactId: "security",
      artifactType: "rule",
    };
    const stamped: LedgerEntry = { ...bare, contentHash: "abc123", stampedVersion: "1.0.0" };
    expect(bare.contentHash).toBeUndefined();
    expect(stamped.stampedVersion).toBe("1.0.0");
  });
});

describe("ManifestMigration", () => {
  it("is a pure raw-record transform keyed by fromVersion", () => {
    expectTypeOf<ManifestMigration["migrate"]>().parameters.toEqualTypeOf<
      [Record<string, unknown>]
    >();
    expectTypeOf<ManifestMigration["migrate"]>().returns.toEqualTypeOf<Record<string, unknown>>();
    const step: ManifestMigration = {
      fromVersion: "1.0.0",
      migrate: (raw) => ({ ...raw, version: "2.0.0" }),
    };
    expect(step.migrate({ version: "1.0.0", ledger: [] })).toEqual({
      version: "2.0.0",
      ledger: [],
    });
  });
});

describe("detect shapes", () => {
  it("ports the Framework union exactly", () => {
    expectTypeOf<Framework>().toEqualTypeOf<
      | "next"
      | "angular"
      | "vue"
      | "svelte"
      | "sveltekit"
      | "remix"
      | "astro"
      | "nuxt"
      | "react"
      | "express"
      | "fastify"
      | "hono"
      | "nestjs"
      | "django"
      | "flask"
      | "rails"
      | "spring"
      | "laravel"
      | "tanstack-start"
      | "solid-start"
      | "qwik"
      | "fastapi"
      | "phoenix"
      | "axum"
      | "actix"
    >();
  });

  /*
   * TEST CHANGE, justified: a maintainer ruling deleted `src/detect/conventionConflict.ts`
   * — the only producer of a `ConventionConflict` — and this pass completes that
   * ruling's "+ namespace re-exports" clause by deleting the orphaned
   * `ConventionConflict` / `ConventionDimension` declarations from
   * `src/types/detect.ts` and their re-export from `src/index.ts`. The
   * `it("pins ConventionConflict to dimension/detected/note")` case that sat here
   * went with the types it described. Nothing that still ships lost coverage: the
   * case only round-tripped a literal through a type alias, so it passed
   * identically before and after the producer was deleted — it was the reason the
   * orphan read as wired to `knip`, whose `project` glob includes `test/**`.
   *
   * Its replacement is the reachability gate in `describe("public detection
   * surface")` at the foot of this file, which asserts the property the deleted
   * case did not: every type the public entry re-exports from `./types/detect.ts`
   * has a consumer in `src/`. That gate fails against the pre-fix tree.
   *
   * `RepoInfo.linters` / `testFrameworks` / `ciProviders` are KEPT and still
   * covered below — `src/emit/substitution.ts:154-156` reads all three.
   */

  it("keeps RepoInfo tool reports as plain strings and packageManager optional", () => {
    expectTypeOf<RepoInfo["existingTools"]>().toEqualTypeOf<string[]>();
    expectTypeOf<RepoInfo["monorepoPackages"]>().toEqualTypeOf<PackageEntry[]>();
    const withoutPm: RepoInfo = {
      rootDir: "/repo",
      languages: ["typescript"],
      frameworks: ["next", "hono"],
      linters: ["oxlint"],
      testFrameworks: ["vitest"],
      ciProviders: [],
      monorepoPackages: [{ name: "web", path: "apps/web" }],
      hasDockerfile: false,
      hasDataArtifacts: false,
      hasExistingAgents: true,
      existingTools: ["claude", "windsurf"],
    };
    const withPm: RepoInfo = { ...withoutPm, packageManager: "pnpm" };
    expect(withoutPm.packageManager).toBeUndefined();
    expect(withPm.packageManager).toBe("pnpm");
  });

  it("persists only the substitution subset in DetectedSummary — no frameworks, no monorepo", () => {
    // `packageManager` and `packageScripts` are in the subset because emitted
    // gates are stated as detection-derived FACTS: without them every generated
    // gate read `npm run test`, wrong in a pnpm or bun repo and wrong again in a
    // repo that declares no such script.
    expectTypeOf<keyof DetectedSummary>().toEqualTypeOf<
      | "languages"
      | "linters"
      | "testFrameworks"
      | "ciProviders"
      | "packageManager"
      | "packageScripts"
    >();
    expectTypeOf<DetectedSummary["languages"]>().toEqualTypeOf<string[]>();
    expectTypeOf<DetectedSummary["packageManager"]>().toEqualTypeOf<string | undefined>();
  });
});

describe("types-leaf import discipline", () => {
  it("domain files import sibling src/types modules only", () => {
    const typesDir = new URL("../../src/types/", import.meta.url);
    for (const file of ["manifest.ts", "content.ts", "detect.ts"]) {
      const source = readFileSync(new URL(file, typesDir), "utf8");
      const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
      for (const specifier of specifiers) {
        expect(specifier, `${file} imports ${specifier}`).toMatch(
          /^\.\/(core|content|detect|markers|errors)\.ts$/,
        );
      }
    }
  });
});

const SRC_DIR = fileURLToPath(new URL("../../src/", import.meta.url));

/** Every `.ts` file under `src/`, keyed by its path relative to `src/`. */
function readSourceTree(): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.name.endsWith(".ts")) {
        const relative = path.relative(SRC_DIR, absolute).split(path.sep).join("/");
        files.set(relative, readFileSync(absolute, "utf8"));
      }
    }
  };
  walk(SRC_DIR);
  return files;
}

/**
 * Symbol-level reachability for the one surface that has already leaked a
 * producer-less type: the detection block of the public entry.
 *
 * A type re-exported from `src/index.ts` with nothing in `src/` to build it
 * advertises a detection result the engine cannot compute — a consumer writes
 * against the shape and never receives one. That is what that ruling left
 * behind: deleting `src/detect/conventionConflict.ts` removed the only producer
 * of `ConventionConflict`, but the type pair lived one file over in the
 * zero-import leaf `src/types/detect.ts` and kept shipping.
 *
 * No configured gate catches this shape. `knip` puts `test/**` in its `project`
 * glob, so a type test naming the symbol counts as a consumer; the architecture
 * suite's unreachable-file check resolves whole files, not symbols. Hence a test.
 */
describe("public detection surface", () => {
  it("re-exports only detection types that src/ still uses", () => {
    const tree = readSourceTree();
    const entry = tree.get("index.ts") ?? "";
    const names = (/export type \{([^}]*)\} from "\.\/types\/detect\.ts";/.exec(entry)?.[1] ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    // Non-vacuity: the block was found, is non-empty, and is the real one.
    expect(names, "src/index.ts re-exports a type block from ./types/detect.ts").toContain(
      "RepoInfo",
    );
    expect(names.length).toBeGreaterThan(1);

    const consumerSources = [...tree]
      .filter(([relative]) => relative !== "index.ts" && relative !== "types/detect.ts")
      .map(([relative, source]) => ({ relative, source }));
    expect(consumerSources.length).toBeGreaterThan(1);

    for (const name of names) {
      const consumers = consumerSources
        .filter(({ source }) => new RegExp(`\\b${name}\\b`).test(source))
        .map(({ relative }) => `src/${relative}`);
      expect(
        consumers,
        `src/index.ts re-exports ${name} from ./types/detect.ts, but no file under src/ names it — ` +
          `either wire a producer or drop the export`,
      ).not.toEqual([]);
    }
  });
});
