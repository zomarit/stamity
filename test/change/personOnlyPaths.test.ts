import { describe, expect, it } from "vitest";
import { heldPaths, PERSON_ONLY_PATHS } from "../../src/change/personOnlyPaths.ts";

/**
 * u6-person-only-tables (REQ-FLOW-102): the paths an unattended run never
 * pushes — CI, hook and guard configuration, the class file, CODEOWNERS, the
 * charter, each client's rule and instruction files, and the agent, command,
 * skill and MCP-server definitions.
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
    // An installed pack's hook declaration and any byte beside it (review/175), in any letter case.
    ".stamity/packs/acme__guard/hooks/pre.json",
    ".stamity/packs/acme__guard/rules/r.md",
    ".Stamity/Packs/x/hooks/pre.json",
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
    // The other CI providers' pipeline definitions (review/75).
    ".gitlab-ci.yml",
    ".circleci/config.yml",
    "azure-pipelines.yml",
    "azure-pipelines.yaml",
    ".azure-pipelines/build.yml",
    "Jenkinsfile",
    "ci/Jenkinsfile",
    ".buildkite/pipeline.yml",
    "buildkite.yml",
    "buildkite.yaml",
    "buildkite.json",
    ".travis.yml",
    "bitbucket-pipelines.yml",
    // MCP-server configuration and the agent, command and skill trees (review/70).
    ".mcp.json",
    ".cursor/mcp.json",
    ".vscode/mcp.json",
    ".claude/agents/reviewer.md",
    ".claude/commands/st-work.md",
    ".claude/skills/stamity-testing/SKILL.md",
    ".agents/skills/st-verify/SKILL.md",
    ".agents/skills/st-work/agents/openai.yaml",
    ".cursor/agents/stamity-reviewer.md",
    ".cursor/commands/deploy.md",
    ".cursor/skills/st-work/SKILL.md",
    ".cursor/hooks/stamity-subagent-guard.mjs",
    // The scripts Claude Code's hooks run, beside its held settings (review/166): the engine's copies and a
    // person's own, in any letter case.
    ".claude/hooks/stamity/stamity-pre-tool-use-guard.mjs",
    ".claude/hooks/stamity/agent-tool-policy.json",
    ".claude/hooks/own.sh",
    ".Claude/Hooks/Own.sh",
    ".claude\\hooks\\stamity\\stamity-session-start.mjs",
    ".codex/agents/reviewer.toml",
    ".codex/skills/x/SKILL.md",
    ".github/agents/reviewer.agent.md",
    ".github/prompts/st-work.prompt.md",
    ".github/skills/x/SKILL.md",
    ".github/chatmodes/x.chatmode.md",
    // Copilot's workspace settings: instruction text, the instruction and agent file locations, terminal
    // auto-approval (review/106).
    ".vscode/settings.json",
    // The same settings block in a multi-root workspace file, wherever it sits, and the tasks file's folder-open task
    // (build/77).
    "stamity.code-workspace",
    "tools/dev.code-workspace",
    ".vscode/tasks.json",
    // Every folder's editor tasks and settings files, which a multi-root workspace reads from each listed folder
    // (review/186).
    "packages/api/.vscode/tasks.json",
    "packages/api/.vscode/settings.json",
    "a/b/.VSCode/Tasks.json",
    "packages\\web\\.vscode\\settings.json",
    // Every folder's editor MCP-server file, which a multi-root workspace reads from each listed folder as well.
    "packages/api/.vscode/mcp.json",
    "a/b/.VSCode/MCP.json",
    "packages\\web\\.vscode\\mcp.json",
    // The cloud agents' environment files: setup commands a later cloud run executes (build/50).
    ".cursor/environment.json",
    ".devcontainer.json",
    ".devcontainer/devcontainer.json",
    ".devcontainer/python/devcontainer.json",
    ".devcontainer/Dockerfile",
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
    ".claude/agent-notes.md",
    // A look-alike of Claude Code's hook folder, and a file named like it beside the settings (review/166).
    ".claude/hooksx/a",
    ".claude/hooks.json",
    ".stamity/runs/2026-10-16_x/record.md",
    ".stamity/inbox.md",
    // A look-alike of the packs folder (review/175).
    ".stamity/packsx/a.json",
    ".stamity/packs.json",
    "src/.cursorrules",
    // Root-only names, and look-alikes of the CI and MCP files.
    "pkg/.mcp.json",
    "docs/.gitlab-ci.yml",
    ".gitlab/issue_templates/bug.md",
    "docs/azure-pipelines.md",
    "Jenkinsfile.md",
    // The held settings and environment files' look-alikes and nested copies.
    ".vscode/settings.json.example",
    ".vscode/tasks.json.bak",
    ".vscode/launch.json",
    "packages/api/.vscode/launch.json",
    "packages/api/.vscode/tasks.json.bak",
    "packages/api/vscode/settings.json",
    "packages/api/.vscode/nested/tasks.json",
    "packages/api/.vscode/mcp.json.bak",
    "packages/api/vscode/mcp.json",
    "packages/api/.vscode/nested/mcp.json",
    "docs/code-workspace.md",
    "stamity.code-workspace.md",
    "pkg/.cursor/environment.json",
    "docs/.devcontainer.json",
    "docs/devcontainer.md",
    "README.md",
  ])("does not hold %s", (path) => {
    expect(heldPaths([path, "CODEOWNERS"])).toEqual(["CODEOWNERS"]);
  });

  it("returns an empty list for no input", () => {
    expect(heldPaths([])).toEqual([]);
  });

  describe("a project below the git top (build/99)", () => {
    // The project's folder as `git rev-parse --show-prefix` prints it; the paths are written from the git top.
    const PREFIX = "apps/web/";

    it.each([
      // The project's own client settings, hook scripts and generated tree, as written from the project root.
      "apps/web/.claude/settings.json",
      "apps/web/.claude/hooks/x.mjs",
      "apps/web/.stamity/generated/y",
      "apps/web/.cursor/hooks.json",
      "apps/web/.mcp.json",
      // The top-level patterns still hold at the top.
      ".github/workflows/ci.yml",
      ".claude/settings.json",
      // The prefix matches as the globs do: in another letter case, and over the Windows reading of a path.
      "Apps/WEB/.claude/settings.json",
      "apps\\web\\.claude\\hooks\\x.mjs",
    ])("holds %s", (path) => {
      expect(heldPaths(["apps/web/src/a.ts", path], PREFIX)).toEqual([path]);
    });

    it.each([
      // Outside the project and outside every pattern as written from the top.
      "docs/notes.md",
      "apps/api/.claude/settings.json",
      // A folder named like the prefix's start, and one the prefix only begins.
      "apps/webx/.claude/settings.json",
      "apps/.claude/settings.json",
      // Inside the project and outside every pattern.
      "apps/web/src/a.ts",
      "apps/web/.claude/hooksx/a",
    ])("does not hold %s", (path) => {
      expect(heldPaths([path, "CODEOWNERS"], PREFIX)).toEqual(["CODEOWNERS"]);
    });

    it("matches a prefix spelled in the other Unicode normalization form, as the Base: walk reads names", () => {
      const composed = "caf\u00e9/";
      const decomposed = "cafe\u0301/.claude/settings.json";
      expect(heldPaths([decomposed, "src/a.ts"], composed)).toEqual([decomposed]);
    });

    it("answers as without a prefix for a project at the git top", () => {
      const paths = ["src/a.ts", ".claude/settings.json", "apps/web/.claude/settings.json", ".github/workflows/ci.yml", "a/CLAUDE.md"];
      expect(heldPaths(paths, "")).toEqual(heldPaths(paths));
      expect(heldPaths(paths)).toEqual([".claude/settings.json", ".github/workflows/ci.yml", "a/CLAUDE.md"]);
    });
  });

  describe("every setup root in the repository (REQ-FLOW-102)", () => {
    const paths = ["apps/web/.claude/settings.json", "apps/api/.cursor/hooks.json", "apps/cli/.claude/settings.json", "apps/web/src/a.ts", ".github/workflows/ci.yml"];

    it("holds a path under any of two prefixes, and none under a folder neither names", () => {
      expect(heldPaths(paths, ["apps/web/", "apps/api/"])).toEqual(["apps/web/.claude/settings.json", "apps/api/.cursor/hooks.json", ".github/workflows/ci.yml"]);
    });

    it("answers for a list of one prefix as for that prefix written alone, and for an empty list as for none", () => {
      expect(heldPaths(paths, ["apps/web/"])).toEqual(heldPaths(paths, "apps/web/"));
      expect(heldPaths(paths, "apps/web/")).toEqual(["apps/web/.claude/settings.json", ".github/workflows/ci.yml"]);
      expect(heldPaths(paths, [])).toEqual(heldPaths(paths));
    });
  });

  it("names every glob the plan's table lists", () => {
    expect(PERSON_ONLY_PATHS).toEqual([
      ".github/workflows/**",
      ".github/actions/**",
      "**/action.yml",
      "**/action.yaml",
      ".gitlab-ci.yml",
      ".circleci/**",
      "azure-pipelines.yml",
      "azure-pipelines.yaml",
      ".azure-pipelines/**",
      "**/Jenkinsfile",
      ".buildkite/**",
      "buildkite.yml",
      "buildkite.yaml",
      "buildkite.json",
      ".travis.yml",
      "bitbucket-pipelines.yml",
      ".claude/settings*.json",
      ".cursor/hooks.json",
      ".github/hooks/**",
      ".codex/hooks.json",
      ".codex/config.toml",
      "**/.vscode/settings.json",
      "**/*.code-workspace",
      "**/.vscode/tasks.json",
      ".stamity/generated/**",
      // review/175: the installed packs' bytes joined the list beside the generated tree, so the pinned list gains the glob.
      ".stamity/packs/**",
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
      ".mcp.json",
      ".cursor/mcp.json",
      "**/.vscode/mcp.json",
      ".claude/agents/**",
      ".claude/commands/**",
      ".claude/skills/**",
      ".agents/skills/**",
      ".cursor/agents/**",
      ".cursor/commands/**",
      ".cursor/skills/**",
      ".cursor/hooks/**",
      // review/166: Claude Code's hook scripts joined the list beside Cursor's, so the pinned list gains the glob.
      ".claude/hooks/**",
      ".codex/agents/**",
      ".codex/skills/**",
      ".github/agents/**",
      ".github/prompts/**",
      ".github/skills/**",
      ".github/chatmodes/**",
      ".cursor/environment.json",
      ".devcontainer.json",
      ".devcontainer/**",
    ]);
  });
});
