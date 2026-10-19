/**
 * The person-only paths (REQ-FLOW-102): what an unattended run never pushes.
 *
 * CI definitions (GitHub Actions' workflows and actions, and the pipeline files
 * of GitLab, CircleCI, Azure Pipelines, Jenkins, Buildkite, Travis and
 * Bitbucket), hook and guard configuration (the emitted hooks, the manifest,
 * the clients' settings, the editor's workspace and tasks files), the class file, CODEOWNERS, the charter files with
 * Codex's override, each client's rule and instruction files, the agent,
 * command, skill and MCP-server definitions the four clients read, and the
 * cloud agents' environment files decide what every later run is
 * allowed to do, so a change to one of them is the person's to push. In an unattended run `stamity run checkpoint` and `run end` (u18b) move
 * such a change into an inert patch under the run folder, restore those paths
 * in the index only and list it; an attended push holds nothing.
 *
 * Every glob matches without case and over the Windows reading of a path, the
 * classifier's own matcher (`./classify.ts`, {@link matchGlob}): a
 * case-insensitive checkout opens `claude.md` as `CLAUDE.md`, and holding one
 * path too many is the safe direction here, since a held path is listed for the
 * person rather than lost.
 *
 * Pure: no filesystem, no git; one internal import, the classifier.
 */
import { matchGlob } from "./classify.ts";

/** The person-only globs, `**` spanning segments and matching none (`**\/AGENTS.md` holds the root's too). */
export const PERSON_ONLY_PATHS: readonly string[] = [
  ".github/workflows/**",
  ".github/actions/**",
  "**/action.yml",
  "**/action.yaml",
  // The other common CI providers' pipeline definitions, held beside GitHub Actions'.
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
  // Copilot's workspace settings carry instruction text, move the instruction and agent file reads and set terminal
  // auto-approval, as the other clients' held settings do (review/106). Every folder's copy, since a multi-root
  // workspace reads each listed folder's own (review/186).
  "**/.vscode/settings.json",
  // The same settings block in a multi-root workspace file, and the editor's tasks file, whose task can run on
  // folder open (build/77), every folder's (review/186).
  "**/*.code-workspace",
  "**/.vscode/tasks.json",
  ".stamity/generated/**",
  // The installed packs' bytes, their hook declarations among them, which a later sync wires into the clients' settings
  // (review/175). The scripts those declarations and the repository's own name are held by the run verbs from `Base:`.
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
  // MCP-server configuration: an approved server starts a process in every later session. The editor's copy is held
  // in every folder, since a multi-root workspace reads each listed folder's own, as it does the settings and tasks
  // files above.
  ".mcp.json",
  ".cursor/mcp.json",
  "**/.vscode/mcp.json",
  // Agent, command and skill definitions are the instructions later runs follow: every tree the four clients read
  // (Stamity's emitted content roots, `src/manifest/ownedPaths.ts`, and the trees the clients read beside them),
  // and Cursor's and Claude Code's hook scripts beside their held hook settings.
  ".claude/agents/**",
  ".claude/commands/**",
  ".claude/skills/**",
  ".agents/skills/**",
  ".cursor/agents/**",
  ".cursor/commands/**",
  ".cursor/skills/**",
  ".cursor/hooks/**",
  // The scripts Claude Code's hooks run (the engine's copies under `.claude/hooks/stamity/`, and a person's own),
  // held beside its held settings as Cursor's are beside its `hooks.json` (review/166).
  ".claude/hooks/**",
  ".codex/agents/**",
  ".codex/skills/**",
  ".github/agents/**",
  ".github/prompts/**",
  ".github/skills/**",
  ".github/chatmodes/**",
  // The cloud agents' environment files: the setup commands a later cloud run executes (build/50), the dev
  // container's at both of its locations.
  ".cursor/environment.json",
  ".devcontainer.json",
  ".devcontainer/**",
];

/** The paths of `paths` a person-only glob matches, in input order. */
export function heldPaths(paths: readonly string[]): string[] {
  return paths.filter((path) => PERSON_ONLY_PATHS.some((glob) => matchGlob(path, glob, { foldCase: true })));
}
