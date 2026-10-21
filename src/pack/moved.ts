/**
 * The skills that left the core corpus for a pack (REQ-PACK-008), and the
 * frozen bytes the last core release rendered for each of them.
 *
 * A setup an earlier release synced still holds those copies, under ledger
 * rows a client owns. Once the running corpus no longer renders the skill, the
 * reclaim sweep meets those rows as candidates, and a file under an engine
 * name in a content folder is deleted only when its bytes hash to a rendering
 * the engine produces at the path (`../manifest/ownedPaths.ts::needsRenderingProof`).
 * The running engine renders nothing there any more, so this table supplies
 * that rendering: the SHA-256 of each file of the skill folder as the core
 * rendered it, read with `git show v1.16.0:.claude/skills/st-<id>/<file> |
 * shasum -a 256`, byte-identical at v1.9.0 through v1.16.0 and the same at
 * both {@link MOVED_SKILL_FOLDERS} (the 1.14.0 release tree under
 * `test/fixtures/release-1-14-0-tree/` holds both copies).
 *
 * The proof is the bytes, never the row: a ledger row naming a moved id only
 * selects these digests, at exactly `<folder>/st-<id>/<file>` for one of the
 * two folders and one of the files listed, and a file whose bytes are not that
 * rendering is kept (`../merge/reclaim.ts`, gate 4). A forged row at any other
 * path gains no proof from this table.
 *
 * Zero imports, so any reader may take it (`test/architecture`, wave 1).
 */

/** One skill that moved out of the core corpus into a pack. */
export interface MovedCoreSkill {
  /** The skill's artifact id, as its ledger rows record it (no `st-` prefix). */
  readonly id: string;
  /** The pack that ships it now. */
  readonly pack: string;
  /** The release whose core corpus first left it out. */
  readonly since: string;
  /** File inside the skill folder → the SHA-256 (hex) of its frozen core rendering. */
  readonly renderings: Readonly<Record<string, string>>;
}

/**
 * The client skill folders a moved skill's core copies were written under:
 * the vendor-neutral projection and Claude Code's native copy
 * (`../emit/skillsProjection.ts`, `SKILLS_PROJECTION_DIR` and
 * `NATIVE_SKILL_DIRS`). These two only: the frozen digests were read there.
 */
export const MOVED_SKILL_FOLDERS: readonly string[] = Object.freeze([".agents/skills", ".claude/skills"]);

/** The skills that left the core, each with its frozen renderings. */
export const MOVED_CORE_SKILLS: readonly MovedCoreSkill[] = Object.freeze([
  Object.freeze({
    id: "design-system-detect",
    pack: "frontend",
    since: "1.17.0",
    renderings: Object.freeze({
      "SKILL.md": "797494d53ab3a5cfb0f866ed14c7cf4002a8fb4a943004f425b57ae845e3a000",
      "agents/openai.yaml": "91065c090283437485a15f7575527d1b64972caf0432026f5ede3b7621a24573",
    }),
  }),
  Object.freeze({
    id: "browser-evidence",
    pack: "frontend",
    since: "1.17.0",
    renderings: Object.freeze({
      "SKILL.md": "a4a40651590d8e03ae621c8a5ee7f71e904aeb87e54cff23ae1b2a4d26fd21c7",
      "agents/openai.yaml": "b448baafcaa2f1b0d6c396b1ba98d733fd4424c546b545797ade81ab87efe760",
    }),
  }),
]);

/** The moved skill with artifact id `id`, or `undefined` when it never moved. */
export function movedCoreSkill(id: string): MovedCoreSkill | undefined {
  return MOVED_CORE_SKILLS.find((skill) => skill.id === id);
}

/**
 * The frozen digest a moved skill's core copy had at `path`, or `undefined`
 * when `path` is not exactly `<folder>/st-<id>/<file>` for one of
 * {@link MOVED_SKILL_FOLDERS} and one of the skill's files.
 */
export function movedRenderingAt(skill: MovedCoreSkill, path: string): string | undefined {
  for (const folder of MOVED_SKILL_FOLDERS) {
    const prefix = `${folder}/st-${skill.id}/`;
    if (!path.startsWith(prefix)) continue;
    const file = path.slice(prefix.length);
    return Object.hasOwn(skill.renderings, file) ? skill.renderings[file] : undefined;
  }
  return undefined;
}
