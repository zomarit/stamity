import { chmod, mkdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  detectPredecessorState,
  hasPredecessorMarker,
  PREDECESSOR_MARKED_FILE_CANDIDATES,
  type PredecessorState,
} from "../../src/migration/detect.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Real temp directories rather than the virtual-fs lane: detection is a set of
 * filesystem questions — is this a directory or a file, can it be read, what is
 * directly inside it — and a volume that answers them by construction would only
 * be testing the fixture.
 *
 * This file and its sibling are the only tests allowed to spell the predecessor
 * project name; `scripts/leak-gate.mjs` allowlists `test/migration/` for
 * exactly that reason, and the fixtures below are why the allowlist exists.
 */
const getRepo = useTempDir("migration-detect");

/** A representative generation-3 predecessor manifest. */
const MANIFEST = JSON.stringify(
  {
    version: "3.0.0",
    tools: ["claude", "cursor"],
    maturity: "team",
    content: { preset: "standard", projectType: "brownfield", teamSize: "team" },
    mcp: { servers: ["filesystem", "github"] },
    learnings: { maxCount: 200 },
  },
  null,
  2,
);

const HTML_BLOCK = [
  "# Project",
  "",
  "User prose.",
  "",
  "<!-- HATCH3R:BEGIN -->",
  "generated guidance",
  "<!-- HATCH3R:END -->",
  "",
].join("\n");

/** Detection must return a state for these fixtures; unwrap it with the file named. */
function expectState(state: PredecessorState | null): PredecessorState {
  expect(state).not.toBeNull();
  if (state === null) throw new Error("unreachable: asserted above");
  return state;
}

describe("detectPredecessorState", () => {
  it("reports every asset of a repo the predecessor set up", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      ".hatch3r/hatch.json": MANIFEST,
      ".hatch3r/learnings/2026-01-15-cache-warmup.md": "---\nid: x\n---\nnote\n",
      ".hatch3r/learnings/2026-02-02-retry-budget.md": "---\nid: y\n---\nnote\n",
      ".hatch3r/learnings/scratch.txt": "not a learning",
      ".hatch3r/overrides/rules/security.md": "override body",
      ".env.mcp": "GITHUB_TOKEN=\n",
      "CLAUDE.md": HTML_BLOCK,
    });

    const state = expectState(await detectPredecessorState(repo.dir));

    expect(state.stateDirPath).toBe(repo.path(".hatch3r"));
    expect(state.manifestPath).toBe(repo.path(".hatch3r", "hatch.json"));
    expect(state.manifestRaw).toMatchObject({ tools: ["claude", "cursor"], maturity: "team" });
    expect(state.learningsDir).toBe(repo.path(".hatch3r", "learnings"));
    // Two `.md` files; the `.txt` beside them is not a learning.
    expect(state.learningsCount).toBe(2);
    expect(state.overridesDir).toBe(repo.path(".hatch3r", "overrides"));
    expect(state.envMcpPath).toBe(repo.path(".env.mcp"));
    expect(state.markedFiles).toEqual(["CLAUDE.md"]);
  });

  it("detects a marker-only repo, with no state directory", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      "AGENTS.md": HTML_BLOCK,
      ".github/copilot-instructions.md": "# Copilot\n\n# HATCH3R:BEGIN\nrules\n# HATCH3R:END\n",
      ".cursor/rules/10-security.mdc": "// HATCH3R:BEGIN\n// rule\n// HATCH3R:END\n",
      ".cursor/rules/legacy.md": "<!-- HATCH3R:BEGIN v2.8.6 -->\nold\n<!-- HATCH3R:END -->\n",
      ".cursor/rules/handwritten.mdc": "no markers here\n",
    });

    const state = expectState(await detectPredecessorState(repo.dir));

    expect(state.stateDirPath).toBeNull();
    expect(state.manifestPath).toBeNull();
    expect(state.manifestRaw).toBeNull();
    expect(state.learningsDir).toBeNull();
    expect(state.learningsCount).toBe(0);
    expect(state.overridesDir).toBeNull();
    expect(state.markedFiles).toEqual(
      [
        "AGENTS.md",
        ".github/copilot-instructions.md",
        ".cursor/rules/10-security.mdc",
        ".cursor/rules/legacy.md",
      ].toSorted(),
    );
  });

  it("returns null for a repo the predecessor never touched", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      "README.md": "# Fresh\n",
      "package.json": '{ "name": "fresh" }\n',
      "CLAUDE.md": "# Notes\n\nHand-written, no managed block.\n",
    });

    expect(await detectPredecessorState(repo.dir)).toBeNull();
  });

  it("returns null when only a credential file looks familiar", async () => {
    // `.env.mcp` alone is not evidence: the file name is not exclusive to the
    // predecessor, and offering a migration on it would be a false positive.
    const repo = getRepo();
    await repo.seedFiles({ ".env.mcp": "SOME_TOKEN=\n" });

    expect(await detectPredecessorState(repo.dir)).toBeNull();
  });

  it("matches a version-stamped BEGIN marker", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      "CLAUDE.md": "intro\n<!-- HATCH3R:BEGIN v2.8.6 -->\nbody\n<!-- HATCH3R:END -->\n",
    });

    const state = expectState(await detectPredecessorState(repo.dir));
    expect(state.markedFiles).toEqual(["CLAUDE.md"]);
  });

  it("ignores marker tokens quoted mid-line", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      "CLAUDE.md": "The old setup wrote HATCH3R:BEGIN / HATCH3R:END pairs into this file.\n",
    });

    expect(await detectPredecessorState(repo.dir)).toBeNull();
  });

  it("scans only the candidate files", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      "CLAUDE.md": HTML_BLOCK,
      "README.md": HTML_BLOCK,
      "docs/guide.md": HTML_BLOCK,
      // One level deeper than the candidate glob reaches.
      ".cursor/rules/nested/deep.mdc": HTML_BLOCK,
    });

    const state = expectState(await detectPredecessorState(repo.dir));
    expect(state.markedFiles).toEqual(["CLAUDE.md"]);
  });

  it("returns a state for an empty predecessor state directory", async () => {
    const repo = getRepo();
    await mkdir(repo.path(".hatch3r"), { recursive: true });

    const state = expectState(await detectPredecessorState(repo.dir));

    expect(state.stateDirPath).toBe(repo.path(".hatch3r"));
    expect(state.manifestPath).toBeNull();
    expect(state.manifestRaw).toBeNull();
    expect(state.learningsDir).toBeNull();
    expect(state.learningsCount).toBe(0);
    expect(state.overridesDir).toBeNull();
    expect(state.envMcpPath).toBeNull();
    expect(state.markedFiles).toEqual([]);
  });

  it("reads a manifest that is a directory as absent, and still returns state", async () => {
    const repo = getRepo();
    await mkdir(repo.path(".hatch3r", "hatch.json"), { recursive: true });

    const state = expectState(await detectPredecessorState(repo.dir));

    expect(state.stateDirPath).toBe(repo.path(".hatch3r"));
    expect(state.manifestPath).toBeNull();
    expect(state.manifestRaw).toBeNull();
  });

  it("reads malformed manifest JSON as unparsed, not as absent", async () => {
    const repo = getRepo();
    await repo.seedFiles({ ".hatch3r/hatch.json": '{ "tools": ["claude", ' });

    const state = expectState(await detectPredecessorState(repo.dir));

    expect(state.manifestPath).toBe(repo.path(".hatch3r", "hatch.json"));
    expect(state.manifestRaw).toBeNull();
  });

  it("reads a JSON array manifest as unparsed", async () => {
    const repo = getRepo();
    await repo.seedFiles({ ".hatch3r/hatch.json": '["claude"]' });

    const state = expectState(await detectPredecessorState(repo.dir));
    expect(state.manifestRaw).toBeNull();
  });

  // chmod is advisory for root and unsupported on Windows, so the EACCES branch
  // is only observable where the mode bits actually deny the read.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "reports an unreadable manifest as present but unparsed",
    async () => {
      const repo = getRepo();
      await repo.seedFiles({ ".hatch3r/hatch.json": MANIFEST });
      await chmod(repo.path(".hatch3r", "hatch.json"), 0o000);

      const state = expectState(await detectPredecessorState(repo.dir));

      expect(state.manifestPath).toBe(repo.path(".hatch3r", "hatch.json"));
      expect(state.manifestRaw).toBeNull();

      // Restore the mode so the fixture cleanup is not fighting permissions.
      await chmod(repo.path(".hatch3r", "hatch.json"), 0o600);
    },
  );

  // ── Monorepo scopes ──────────────────────────────────────────
  //
  // The predecessor fans its output into every workspace package, so a scan that
  // resolved one root and looked for `<root>/.hatch3r` answered "nothing to
  // migrate" for a repository carrying it in a dozen places — no migration
  // moment, and a panel that reported success.

  it("reports a workspace package holding its own predecessor state directory", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      "package.json": JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
      "packages/web/package.json": JSON.stringify({ name: "web" }),
      "packages/api/package.json": JSON.stringify({ name: "api" }),
      "packages/web/.hatch3r/hatch.json": MANIFEST,
    });

    // The root itself is clean, which is exactly the case that used to be silent.
    const state = expectState(await detectPredecessorState(repo.dir));

    expect(state.stateDirPath).toBeNull();
    expect(state.packagesWithState).toEqual(["packages/web"]);
  });

  it("collects marked files from every package, prefixed with the package path", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      "package.json": JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
      "packages/web/package.json": JSON.stringify({ name: "web" }),
      "packages/api/package.json": JSON.stringify({ name: "api" }),
      "CLAUDE.md": HTML_BLOCK,
      "packages/web/CLAUDE.md": HTML_BLOCK,
      "packages/web/.cursor/rules/10-security.mdc": "// HATCH3R:BEGIN\n// rule\n// HATCH3R:END\n",
      // Clean package, and a non-candidate file that must not be picked up.
      "packages/api/README.md": "<!-- HATCH3R:BEGIN -->\nnot a candidate file\n<!-- HATCH3R:END -->\n",
    });

    const state = expectState(await detectPredecessorState(repo.dir));

    // Repo-relative posix, which is the shape `carry.ts` re-joins against the root.
    expect(state.markedFiles).toEqual([
      "CLAUDE.md",
      "packages/web/.cursor/rules/10-security.mdc",
      "packages/web/CLAUDE.md",
    ]);
  });

  it("returns a state for a monorepo whose only evidence is inside a package", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      "package.json": JSON.stringify({ name: "root", workspaces: ["apps/*"] }),
      "apps/shop/package.json": JSON.stringify({ name: "shop" }),
      "apps/shop/AGENTS.md": HTML_BLOCK,
    });

    const state = expectState(await detectPredecessorState(repo.dir));

    expect(state.markedFiles).toEqual(["apps/shop/AGENTS.md"]);
    expect(state.packagesWithState).toEqual([]);
  });

  it("still returns null for a monorepo no package of which was ever set up", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      "package.json": JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
      "packages/web/package.json": JSON.stringify({ name: "web" }),
      "packages/web/CLAUDE.md": "# Notes\n\nHand-written, no managed block.\n",
    });

    expect(await detectPredecessorState(repo.dir)).toBeNull();
  });

  it("degrades to the root-only scan when the workspace declaration cannot be read", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      "pnpm-workspace.yaml": "packages:\n  - [unclosed\n",
      "package.json": "{ not json",
      "CLAUDE.md": HTML_BLOCK,
    });

    // A malformed workspace file is no packages, not a failed detection: the
    // migrant still gets everything the root scan found.
    const state = expectState(await detectPredecessorState(repo.dir));

    expect(state.markedFiles).toEqual(["CLAUDE.md"]);
    expect(state.packagesWithState).toEqual([]);
  });

  it("reports no packages for a single-package repo", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      "package.json": JSON.stringify({ name: "solo" }),
      "CLAUDE.md": HTML_BLOCK,
    });

    expect(expectState(await detectPredecessorState(repo.dir)).packagesWithState).toEqual([]);
  });

  it("does not create anything to answer its questions", async () => {
    const repo = getRepo();
    await repo.seedFiles({ "README.md": "# Fresh\n" });

    await detectPredecessorState(repo.dir);

    // The absent state directory stays absent: a read-only pass must not
    // materialize the layout it was looking for.
    await expect(detectPredecessorState(repo.dir)).resolves.toBeNull();
  });
});

describe("hasPredecessorMarker", () => {
  it("matches all three comment syntaxes, bare and stamped", () => {
    expect(hasPredecessorMarker("<!-- HATCH3R:BEGIN -->")).toBe(true);
    expect(hasPredecessorMarker("  <!-- HATCH3R:BEGIN v2.8.6 -->  ")).toBe(true);
    expect(hasPredecessorMarker("# HATCH3R:BEGIN")).toBe(true);
    expect(hasPredecessorMarker("# HATCH3R:END v1.0.0")).toBe(true);
    expect(hasPredecessorMarker("// HATCH3R:BEGIN")).toBe(true);
    expect(hasPredecessorMarker("intro\r\n// HATCH3R:END\r\n")).toBe(true);
  });

  it("rejects prose, partial tokens, and this engine's own markers", () => {
    expect(hasPredecessorMarker("we used to emit HATCH3R:BEGIN here")).toBe(false);
    expect(hasPredecessorMarker("<!-- HATCH3R:BEGINNING -->")).toBe(false);
    expect(hasPredecessorMarker("<!-- HATCH3R:BEGIN v1 extra -->")).toBe(false);
    expect(hasPredecessorMarker("<!-- STAMITY:BEGIN -->")).toBe(false);
    expect(hasPredecessorMarker("")).toBe(false);
  });
});

describe("PREDECESSOR_MARKED_FILE_CANDIDATES", () => {
  it("lists the tool instruction files the predecessor wrote into", () => {
    expect([...PREDECESSOR_MARKED_FILE_CANDIDATES]).toEqual([
      "AGENTS.md",
      "CLAUDE.md",
      "GEMINI.md",
      ".github/copilot-instructions.md",
      ".cursor/rules/*.mdc",
      ".cursor/rules/*.md",
    ]);
  });
});
