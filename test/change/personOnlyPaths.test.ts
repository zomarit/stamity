import { describe, expect, it } from "vitest";
import { heldPaths, PERSON_ONLY_PATHS } from "../../src/change/personOnlyPaths.ts";

/**
 * u6-person-only-tables (REQ-FLOW-102): the paths an unattended run never
 * pushes — CI, hook and guard configuration, the class file, CODEOWNERS, the
 * charter and each client's rule and instruction files.
 *
 * Pure module over a list of paths, so no double stands in for anything. Every
 * case passes held and unheld paths together and asserts the exact survivors,
 * so a filter that kept everything (or nothing) fails.
 */

describe("heldPaths", () => {
  it("keeps the person-only paths and drops the rest, in input order", () => {
    const held = [
      ".github/workflows/ci.yml",
      "CODEOWNERS",
      "pkg/AGENTS.md",
      ".claude/settings.json",
      ".claude/rules/x.md",
      ".stamity/generated/agent-tool-policies.json",
      ".stamity/manifest.json",
      "AGENTS.override.md",
    ];
    const paths = ["src/a.ts", ...held.slice(0, 4), "docs/guide.md", ...held.slice(4), "test/a.test.ts"];
    expect(heldPaths(paths)).toEqual(held);
  });

  it.each([
    ".github/workflows/release.yaml",
    ".github/actions/setup/action.yml",
    "tools/check/action.yaml",
    "action.yml",
    ".claude/settings.local.json",
    ".cursor/hooks.json",
    ".github/hooks/stamity.json",
    ".codex/hooks.json",
    ".codex/config.toml",
    ".stamity/hooks/user.mjs",
    ".stamity/change-classes.json",
    ".github/CODEOWNERS",
    "docs/CODEOWNERS",
    "AGENTS.md",
    "CLAUDE.md",
    "a/b/CLAUDE.md",
    "a/AGENTS.override.md",
    ".cursor/rules/stamity.mdc",
    // Cursor's legacy rules file, read from the root.
    ".cursorrules",
    ".github/copilot-instructions.md",
    ".github/instructions/review.instructions.md",
    // A case-insensitive checkout opens these as the canonical names.
    ".GitHub/Workflows/ci.yml",
    "claude.md",
    // A Windows-shaped path names the same file.
    ".github\\workflows\\ci.yml",
  ])("holds %s", (path) => {
    expect(heldPaths(["src/a.ts", path])).toEqual([path]);
  });

  it.each([
    "src/hooks/personOnly.ts",
    "docs/specs/everyday-flows.md",
    "src/CODEOWNERS",
    "AGENTS.md.bak",
    "docs/AGENTS.mdx",
    ".github/dependabot.yml",
    ".github/workflow.md",
    ".claude/agents/reviewer.md",
    ".stamity/runs/2026-10-16_x/record.md",
    ".stamity/inbox.md",
    "src/.cursorrules",
    "README.md",
  ])("does not hold %s", (path) => {
    expect(heldPaths([path, "CODEOWNERS"])).toEqual(["CODEOWNERS"]);
  });

  it("returns an empty list for no input", () => {
    expect(heldPaths([])).toEqual([]);
  });

  it("names every glob the plan's table lists", () => {
    expect(PERSON_ONLY_PATHS).toEqual([
      ".github/workflows/**",
      ".github/actions/**",
      "**/action.yml",
      "**/action.yaml",
      ".claude/settings*.json",
      ".cursor/hooks.json",
      ".github/hooks/**",
      ".codex/hooks.json",
      ".codex/config.toml",
      ".stamity/generated/**",
      ".stamity/hooks/**",
      ".stamity/manifest.json",
      ".stamity/change-classes.json",
      "CODEOWNERS",
      ".github/CODEOWNERS",
      "docs/CODEOWNERS",
      "**/AGENTS.md",
      "**/AGENTS.override.md",
      "**/CLAUDE.md",
      ".claude/rules/**",
      ".cursor/rules/**",
      ".cursorrules",
      ".github/copilot-instructions.md",
      ".github/instructions/**",
    ]);
  });
});
