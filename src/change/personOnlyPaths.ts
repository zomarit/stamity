/**
 * The person-only paths (REQ-FLOW-102): what an unattended run never pushes.
 *
 * CI workflows and actions, hook and guard configuration (the emitted hooks,
 * the manifest), the class file, CODEOWNERS, the charter files with Codex's
 * override, and each client's rule and instruction files decide what every
 * later run is allowed to do, so a change to one of them is the person's to
 * push. In an unattended run `stamity run checkpoint` and `run end` (u18b) move
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
];

/** The paths of `paths` a person-only glob matches, in input order. */
export function heldPaths(paths: readonly string[]): string[] {
  return paths.filter((path) => PERSON_ONLY_PATHS.some((glob) => matchGlob(path, glob, { foldCase: true })));
}
