import { mkdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildInitDecisions, fullCoreSelection } from "../../../src/cli/commands/init/plan.ts";
import type { HistoryFacts } from "../../../src/cli/engine/gitStatus.ts";
import type { CatalogItem, ContentIndex } from "../../../src/content/catalog.ts";
import { suggestStackPacks } from "../../../src/detect/stackSupport.ts";
import type { ContentClass } from "../../../src/types/content.ts";
import type { Tool } from "../../../src/types/core.ts";
import { EngineError } from "../../../src/types/errors.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * Planning is detection plus derivation, so these tests run on real seeded
 * directories (the analyzer reads the filesystem directly) with the maturity
 * seed injected through the `deps.history` seam. None of the seeded roots is a
 * git repository, which is itself an exercised contract: every git probe must
 * read absence as an answer, never as a failure.
 */
const getRepo = useTempDir("init-plan");

let caseCounter = 0;

/** A fresh repo root per call, so fixtures never leak between assertions. */
async function seedRepo(files: Record<string, string> = {}): Promise<string> {
  const repo = getRepo();
  caseCounter += 1;
  const name = `repo-${caseCounter}`;
  const root = repo.path(name);
  await mkdir(root, { recursive: true });
  await repo.seedFiles(
    Object.fromEntries(
      Object.entries(files).map(([path, content]) => [`${name}/${path}`, content]),
    ),
  );
  return root;
}

/** A minimal catalog item; only `type` and `id` matter to selection. */
function item(type: ContentClass, id: string): CatalogItem {
  return {
    type,
    id,
    filePath: `/corpus/${type}/${id}.md`,
    relativePath: `${type}s/${id}.md`,
    description: "",
    tags: [],
    body: "",
    frontmatter: {},
  };
}

function indexOf(items: CatalogItem[]): ContentIndex {
  return { items, byKey: new Map(), collisions: [] };
}

/** History-facts literal, at module scope per the function-scoping lint. */
const history = (commitCount: number, contributorCount: number): HistoryFacts => ({
  commitCount,
  contributorCount,
});

describe("buildInitDecisions — tools", () => {
  it("reads detected traces into tools, sorted per TOOLS order", async () => {
    // Seeded cursor-first: TOOLS order (claude before cursor) must win over
    // detection order.
    const root = await seedRepo({
      ".cursor/rules/house.mdc": "---\n---\n",
      ".claude/settings.json": "{}",
    });
    const decisions = await buildInitDecisions(root, {}, { history: null });

    expect(decisions.tools).toEqual(["claude", "cursor"]);
    expect(decisions.toolsSource).toBe("detected");
    expect(decisions.detectedTools).toEqual(["claude", "cursor"]);
    expect(decisions.greenfield).toBe(false);
  });

  it("lets a tools flag win over detected traces, keeping the detected list intact", async () => {
    const root = await seedRepo({
      ".cursor/rules/house.mdc": "---\n---\n",
      ".claude/settings.json": "{}",
    });
    const decisions = await buildInitDecisions(root, { tools: ["codex"] }, { history: null });

    expect(decisions.tools).toEqual(["codex"]);
    expect(decisions.toolsSource).toBe("flag");
    expect(decisions.detectedTools).toEqual(["claude", "cursor"]);
  });

  it("defaults an empty repo to claude", async () => {
    const root = await seedRepo();
    const decisions = await buildInitDecisions(root, {}, { history: null });

    expect(decisions.tools).toEqual(["claude"]);
    expect(decisions.toolsSource).toBe("default");
    expect(decisions.detectedTools).toEqual([]);
    expect(decisions.greenfield).toBe(true);
  });

  it("normalises a flag's order and duplicates to one canonical spelling", async () => {
    const root = await seedRepo();
    const decisions = await buildInitDecisions(
      root,
      { tools: ["cursor", "claude", "cursor"] },
      { history: null },
    );

    expect(decisions.tools).toEqual(["claude", "cursor"]);
    expect(decisions.toolsSource).toBe("flag");
  });

  it("refuses a flag naming an unknown tool, listing the valid set", async () => {
    const root = await seedRepo();
    const failure = await buildInitDecisions(
      root,
      // A CLI flag value is a runtime string; the cast models exactly how one
      // reaches this boundary.
      { tools: ["claude", "emacs" as Tool] },
      { history: null },
    ).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(EngineError);
    expect((failure as EngineError).code).toBe("VALIDATION_ERROR");
    expect((failure as EngineError).message).toContain('"emacs"');
    expect((failure as EngineError).message).toContain("claude, cursor, copilot, codex");
  });

  it("detects a .codex trace as the codex tool", async () => {
    const root = await seedRepo({ ".codex/config.toml": "" });
    const decisions = await buildInitDecisions(root, {}, { history: null });

    expect(decisions.detectedTools).toEqual(["codex"]);
    expect(decisions.tools).toEqual(["codex"]);
    expect(decisions.toolsSource).toBe("detected");
  });
});

describe("buildInitDecisions — maturity seed", () => {
  it("seeds team/team from a multi-contributor history", async () => {
    const root = await seedRepo();
    const decisions = await buildInitDecisions(root, {}, { history: history(40, 3) });

    expect(decisions.maturityTier).toBe("team");
    expect(decisions.maturitySource).toBe("git-history");
  });

  it("seeds solo/solo from a single-contributor history", async () => {
    const root = await seedRepo();
    const decisions = await buildInitDecisions(root, {}, { history: history(120, 1) });

    expect(decisions.maturityTier).toBe("solo");
    expect(decisions.maturitySource).toBe("git-history");
  });

  it("lets an explicit override beat the history seed, whichever direction it points", async () => {
    // One dial, so there is no partial-override case to resolve: the companion
    // `teamSize` lever is gone (a type, a flag, a config key and a documented
    // behaviour with zero consumers), and with it the per-field precedence this
    // suite used to have to disambiguate.
    const root = await seedRepo();
    const resolved = await Promise.all(
      (["enterprise", "solo"] as const).map((tier) =>
        buildInitDecisions(root, { maturityTier: tier }, { history: history(40, 3) }),
      ),
    );
    expect(resolved.map((decisions) => decisions.maturityTier)).toEqual(["enterprise", "solo"]);
    for (const decisions of resolved) expect(decisions.maturitySource).toBe("flag");
  });

  it("falls back to the solo defaults when history is unavailable", async () => {
    const root = await seedRepo();
    const decisions = await buildInitDecisions(root, {}, { history: null });

    expect(decisions.maturityTier).toBe("solo");
    expect(decisions.maturitySource).toBe("default");
  });
});

describe("buildInitDecisions — platform and edge repos", () => {
  it("plans a non-git directory with no platform and default maturity", async () => {
    const root = await seedRepo({ "tsconfig.json": "{}" });
    // deps omitted entirely: the live git default path runs against a
    // directory that is not a repository, and must read absence as an answer.
    const decisions = await buildInitDecisions(root, {});

    expect(decisions.platform).toBeUndefined();
    expect(decisions.maturitySource).toBe("default");
    expect(decisions.maturityTier).toBe("solo");
  });

  it("lets a platform flag stand without any git evidence", async () => {
    const root = await seedRepo();
    const decisions = await buildInitDecisions(root, { platform: "gitlab" }, { history: null });

    expect(decisions.platform).toBe("gitlab");
  });

  it("plans a fresh empty directory as greenfield with an all-empty detected summary", async () => {
    const root = await seedRepo();
    const decisions = await buildInitDecisions(root, {}, { history: null });

    expect(decisions.greenfield).toBe(true);
    expect(decisions.monorepoPackages).toEqual([]);
    expect(decisions.detected).toEqual({
      languages: [],
      linters: [],
      testFrameworks: [],
      ciProviders: [],
    });
    expect(decisions.repoInfo.rootDir).toBe(root);
  });

  it("carries the live monorepo layout into the decisions", async () => {
    const root = await seedRepo({
      "package.json": '{ "name": "root", "workspaces": ["packages/*"] }\n',
      "packages/a/package.json": '{ "name": "@acme/a" }\n',
    });
    const decisions = await buildInitDecisions(root, {}, { history: null });

    expect(decisions.monorepoPackages).toEqual([{ name: "@acme/a", path: "packages/a" }]);
  });

  it("carries the full analysis so the panel's stack suggestions have an input", async () => {
    const root = await seedRepo({
      "package.json": `${JSON.stringify({ dependencies: { next: "15.0.0" } })}\n`,
      "index.ts": "export const x = 1;\n",
    });
    const decisions = await buildInitDecisions(root, {}, { history: null });

    // `detected` is the manifest-persisted SUBSET and carries no frameworks,
    // so the suggestion pass reads `repoInfo`. Narrowing the plan to the subset
    // would silently reduce every framework row to nothing.
    expect(decisions.repoInfo.frameworks).toContain("next");
    expect(decisions.detected).not.toHaveProperty("frameworks");

    const suggestions = suggestStackPacks(decisions.repoInfo);
    expect(suggestions.map((row) => row.name)).toContain("next");
    // Frameworks lead: the panel caps the list, so order decides what survives.
    expect(suggestions[0]?.kind).toBe("framework");
  });
});

describe("buildInitDecisions — existing config paths", () => {
  it("counts a bare AGENTS.md as a config path that maps to no tool id", async () => {
    const root = await seedRepo({ "AGENTS.md": "# Agents\n" });
    const decisions = await buildInitDecisions(root, {}, { history: null });

    expect(decisions.existingConfigPaths).toEqual(["AGENTS.md"]);
    expect(decisions.detectedTools).toEqual([]);
    expect(decisions.toolsSource).toBe("default");
    // An agents file is an existing setup: the repo is brownfield.
    expect(decisions.greenfield).toBe(false);
  });

  it("adds each detected tool's own instruction file when it exists", async () => {
    const root = await seedRepo({
      "CLAUDE.md": "# Instructions\n",
      ".claude/settings.json": "{}",
      ".github/copilot-instructions.md": "# Instructions\n",
    });
    const decisions = await buildInitDecisions(root, {}, { history: null });

    expect(decisions.existingConfigPaths).toEqual([
      "CLAUDE.md",
      ".github/copilot-instructions.md",
    ]);
  });

  it("does not report an instruction file for a trace-only tool", async () => {
    // A .claude directory is a claude trace, but there is no CLAUDE.md to
    // import — the import prompt must have nothing to offer.
    const root = await seedRepo({ ".claude/settings.json": "{}" });
    const decisions = await buildInitDecisions(root, {}, { history: null });

    expect(decisions.detectedTools).toEqual(["claude"]);
    expect(decisions.existingConfigPaths).toEqual([]);
  });
});

describe("fullCoreSelection", () => {
  it("selects all-empty arrays from an empty index", () => {
    expect(fullCoreSelection(indexOf([]))).toEqual({
      items: { agent: [], skill: [], rule: [], command: [] },
    });
  });

  it("selects every catalog id per class, in walk order, listing duplicates once", () => {
    const selection = fullCoreSelection(
      indexOf([
        item("agent", "reviewer"),
        item("agent", "implementer"),
        // A duplicate-id claimant: listed once, not twice.
        item("agent", "reviewer"),
        item("skill", "plan"),
        item("rule", "security"),
        item("command", "cmd-plan"),
      ]),
    );

    expect(selection).toEqual({
      items: {
        agent: ["reviewer", "implementer"],
        skill: ["plan"],
        rule: ["security"],
        command: ["cmd-plan"],
      },
    });
  });

  it("keeps a shared id independent per class", () => {
    const selection = fullCoreSelection(indexOf([item("skill", "plan"), item("rule", "plan")]));

    expect(selection.items.skill).toEqual(["plan"]);
    expect(selection.items.rule).toEqual(["plan"]);
  });
});
