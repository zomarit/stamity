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
    ".codex/agents/reviewer.toml",
    ".codex/skills/x/SKILL.md",
    ".github/agents/reviewer.agent.md",
    ".github/prompts/st-work.prompt.md",
    ".github/skills/x/SKILL.md",
    ".github/chatmodes/x.chatmode.md",
    // Copilot's workspace settings: instruction text, the instruction and agent file locations, terminal
    // auto-approval (review/106).
    ".vscode/settings.json",
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
    ".stamity/runs/2026-10-16_x/record.md",
    ".stamity/inbox.md",
    "src/.cursorrules",
    // Root-only names, and look-alikes of the CI and MCP files.
    "pkg/.mcp.json",
    "docs/.gitlab-ci.yml",
    ".gitlab/issue_templates/bug.md",
    "docs/azure-pipelines.md",
    "Jenkinsfile.md",
    // The held settings and environment files' look-alikes and nested copies.
    ".vscode/settings.json.example",
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
      ".vscode/settings.json",
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
      ".mcp.json",
      ".cursor/mcp.json",
      ".vscode/mcp.json",
      ".claude/agents/**",
      ".claude/commands/**",
      ".claude/skills/**",
      ".agents/skills/**",
      ".cursor/agents/**",
      ".cursor/commands/**",
      ".cursor/skills/**",
      ".cursor/hooks/**",
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
