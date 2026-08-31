/**
 * Core `.agents/skills/` projection — the ONE emission of selected skills into
 * the vendor-neutral skills directory (the standards-first core).
 *
 * Skills are RENDERED once, tool-neutral, into that vendor-neutral tree, and
 * most clients read them from there: Codex/Amp/Goose/Zed read `.agents/skills/`
 * natively, and Cursor and Copilot read it directly (each adapter's
 * `readsAgentsSkillsDir` dialect fact). Claude Code reads neither AGENTS.md nor
 * that tree, so it additionally receives a NATIVE copy at its own project-level
 * skills location ({@link NATIVE_SKILL_DIRS}), re-targeted from these same
 * rendered bytes by the claude adapter's residue planner
 * ({@link retargetProjection}) — one read, one render, many targets. The two
 * trees duplicate BYTES on purpose; they do not duplicate authorship, because
 * they serve different readers and a second render is how copies drift. Because
 * the render is shared, nothing here branches on a target tool:
 *
 * - **`SKILL.md` frontmatter** is TRANSFORMED to the Agent Skills spec shape
 *   ({@link toSpecFrontmatter}). Canonical content carries the engine's own
 *   vocabulary (`id`, `type`, `tags`, `load`, `obsolete_when`); the spec
 *   permits exactly six top-level keys, and a strict validator rejects the
 *   whole file on any other — "Unexpected key(s) in SKILL.md frontmatter …
 *   Allowed properties are: allowed-tools, compatibility, description,
 *   license, metadata, name" (code.claude.com/docs/en/skills § "Using skill
 *   frontmatter outside Claude Code", accessed 2026-08-16). Emitting the
 *   authoring vocabulary verbatim therefore did not "stay spec-conformant as
 *   authored"; it produced files that fail packaging on the very paths the
 *   portability promise is about. The engine keys are not dropped — they move
 *   into `metadata`, the spec's own escape hatch for exactly this.
 * - **`SKILL.md` bodies** get emission-time token substitution (repo detection
 *   facts + verification-gate commands, from the manifest) so a skill that
 *   says "run the tests" names this repository's real command.
 * - **The platform ask-user marker** ({@link PLATFORM_TOOL_MARKER}) is a
 *   per-tool token in canonical content; a once-emitted file cannot take one
 *   tool's rendering, so it resolves to the neutral all-clients table
 *   ({@link buildAskUserPlatformTable}) — the tool-neutral rendering of a
 *   per-tool marker, by design.
 * - **Everything else in a skill directory** (its `references/` subtree, any
 *   nested support files) is projected byte-verbatim, recursively: references
 *   are spec-conformant progressive-disclosure material as authored, and a
 *   transform applied there would change files the skill's own dispatch table
 *   promises are stable.
 *
 * Selection replays the manifest's persisted record through the same
 * allowlist the rest of emission uses ({@link buildSelectionAllowlist} +
 * {@link classifySelection}), so a floor-tagged skill survives a hand-edited
 * manifest and a deselected one is dropped here and reclaimed by the ledger.
 *
 * Selection is not the only layer that decides a body. The index this module
 * builds takes the same roots the rest of emission walks
 * ({@link ProjectSkillsOptions.contentRoot}), so a repo's own
 * `.stamity/overrides/skills/<dir>/SKILL.md` wins the id it claims and ITS
 * directory — `SKILL.md` and every support file under it — is what projects.
 *
 * Pure planning: rows out, no filesystem writes. Reading the bundled corpus and
 * the repo's override tree (through the catalog's injectable filesystem seam) is
 * the only I/O.
 *
 * The context parameter is a structural subset of the CLI layer's
 * `EmissionContext` — this module reads `manifest` + `engineVersion` only, and
 * declaring the subset here keeps the engine free of CLI imports (the
 * import-graph gate's "engine never imports the CLI" edge) while every
 * `EmissionContext` remains assignable as-is.
 */

import { readFile, readdir } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import {
  assertSafePath,
  buildContentIndex,
  typeIdKey,
  type CatalogFs,
  type CatalogItem,
  type ContentOrigin,
  type ContentRoots,
} from "../content/catalog.ts";
import { composeFrontmatter, parseFrontmatter } from "../content/frontmatter.ts";
import { buildSelectionAllowlist, classifySelection } from "../content/selection.ts";
import { verificationGatesFor } from "../detect/verificationGates.ts";
import { PLATFORM_TOOL_MARKER, buildAskUserPlatformTable } from "../tools/translator.ts";
import type { ContentClass } from "../types/content.ts";
import type { Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import type { SetupManifest } from "../types/manifest.ts";
import {
  detectionContextFromManifest,
  substituteRepoTokens,
  substituteVerificationGateTokens,
  type VerificationGateSet,
} from "./substitution.ts";

/** Repo-relative root of the vendor-neutral skills projection. */
export const SKILLS_PROJECTION_DIR = ".agents/skills";

/**
 * Clients that need a NATIVE copy of the projection because they read neither
 * AGENTS.md nor the vendor-neutral tree — the per-client half of "one read, one
 * render, many targets", read as DATA by the adapters and by the capability
 * matrix so the location is stated once.
 *
 * `claude` is the only such client: `.claude/skills/<skill-name>/SKILL.md` is
 * Claude Code's project-level skills location, scoped to "this project only"
 * (code.claude.com/docs/en/skills § "Where skills live", accessed 2026-08-17).
 *
 * Absence from this table is the assertion, not an omission. `cursor`,
 * `copilot` and `codex` each declare `readsAgentsSkillsDir: true` in their
 * dialect facts, so {@link SKILLS_PROJECTION_DIR} already reaches them; a
 * second copy would be always-available context duplicated for no reader, plus
 * a second tree to keep in sync.
 */
export const NATIVE_SKILL_DIRS: Readonly<Partial<Record<Tool, string>>> = {
  claude: ".claude/skills",
};

const defaultFs: CatalogFs = { readdir, readFile };

/** The transformable file inside a skill directory; everything else is verbatim. */
const SKILL_FILE = "SKILL.md";

/**
 * One planned core emission: a repo-relative file plus the ledger attribution
 * the composer wraps into `AdapterOutput.owner` per target tool. Core rows are
 * tool-neutral, so the attribution here carries artifact identity only.
 */
export interface ProjectedFile {
  /** Repo-relative POSIX target path. */
  path: string;
  /** Full file content to write. */
  content: string;
  /** Id of the source artifact, or a stable infra emission id. */
  artifactId: string;
  /** Content class of the source, or `"infra"` for non-content emissions. */
  artifactType: ContentClass | "infra";
  /**
   * Which layer supplied the source artifact — `"user"` for an override-tree
   * row, `"corpus"` for the bundled tree, `"pack"` for an installed pack.
   * Unset for a non-content (`"infra"`) row and for a producer that has not
   * been taught to stamp it; a reader that needs the distinction treats
   * `undefined` as "not an override" rather than as an error.
   */
  origin?: ContentOrigin;
}

/**
 * The slice of the emission context this projection reads. Structurally
 * satisfied by the CLI layer's `EmissionContext` (see the module note on the
 * import-graph boundary).
 */
export interface SkillsEmissionContext {
  /** The manifest driving selection and token substitution. */
  manifest: SetupManifest;
  /** Engine version, for generator stamps inside emitted content. */
  engineVersion: string;
}

/** Test seams; production callers pass nothing and read the bundled corpus. */
export interface ProjectSkillsOptions {
  /**
   * Which roots the projection indexes. A bare string is the corpus root and
   * stays the shorthand every fixture uses; the {@link ContentRoots} spelling is
   * what lets a caller name the repo's own override tree as well, so a
   * `.stamity/overrides/skills/<dir>/SKILL.md` reaches emission the way a user
   * agent, rule or command already does. Defaults to the package-bundled corpus.
   *
   * `packRoots` is deliberately NOT supplied by this projection's caller
   * (`./planner.ts` → `buildCoreEmissionPlan`), even though the spec has the
   * slot. Installed packs keep their own resolution lane —
   * `resolveInstalledPackContent` produces pack skill rows and
   * `mergeSkillProjections` folds them in under a directory-collision check —
   * so indexing them here as well would project every pack skill twice and
   * trip that check against rows this projection itself laid down.
   *
   * The exclusion opens a converse case `mergeSkillProjections` also has to
   * close: an override in the corpus-plus-override index above can claim a
   * catalog id or a directory a pack skill supplies, because this index never
   * sees the pack half to refuse it. `mergeSkillProjections` is where the two
   * sides finally meet, so it is where that refusal has to live — see its own
   * comment.
   */
  contentRoot?: string | ContentRoots;
  /** Filesystem override for corpus reads; defaults to `node:fs/promises`. */
  fs?: CatalogFs;
}

/**
 * Project every selected skill into `.agents/skills/<dir>/…`.
 *
 * `<dir>` is the catalog directory name as authored (`st-verify`, prefix
 * included) — the projection preserves the source's own naming so a skill's
 * internal relative links and its dispatch-table paths survive unchanged. For
 * an override that is the OVERRIDE's directory name: an author who files their
 * replacement under a different directory than the skill whose id it takes gets
 * it projected under theirs, because the alternative is emitting a directory
 * whose contents came from somewhere else.
 *
 * Rows are returned sorted by path (codepoint order), one row per regular
 * file; within a skill that places `SKILL.md` before its `references/`
 * subtree. Only the reachable claimant of a duplicated id is projected — the
 * catalog reports the collision, `byKey` resolution decides it, and emitting
 * both claimants would race two different sources for one target tree.
 *
 * Symlinks and other non-regular entries are skipped, mirroring the catalog
 * walk's posture: nothing outside the corpus can be pulled in through a link.
 */
export async function projectSkills(
  ctx: SkillsEmissionContext,
  options: ProjectSkillsOptions = {},
): Promise<ProjectedFile[]> {
  const fs = options.fs ?? defaultFs;
  const index = await buildContentIndex(options.contentRoot, { fs });

  const allowlist = buildSelectionAllowlist(ctx.manifest.selection);
  const admitted = index.items.filter(
    (item) =>
      item.type === "skill" &&
      // First claimant of a contested id wins, matching catalog reachability.
      index.byKey.get(typeIdKey(item.type, item.id)) === item &&
      classifySelection(item, allowlist) !== "drop",
  );

  const detection = detectionContextFromManifest(ctx.manifest);
  const gates = verificationGatesFor(ctx.manifest.detected);

  const perSkill = await Promise.all(
    admitted.map((item) =>
      projectOneSkill(fs, item, (raw, skillDir) =>
        renderSkillBody(raw, skillDir, item.relativePath, detection, gates),
      ),
    ),
  );

  return perSkill.flat().toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Re-target rows already projected under {@link SKILLS_PROJECTION_DIR} onto
 * another repo-relative root — what an adapter calls with its client's native
 * skills directory ({@link NATIVE_SKILL_DIRS}).
 *
 * Pure and render-free: `content`, `artifactId` and `artifactType` are carried
 * verbatim and only the leading projection segment changes, so the native copy
 * is byte-identical to the vendor-neutral one it came from. Re-reading the
 * corpus and rendering a second time would let the two trees disagree under a
 * manifest change, and the composer's content-equality dedup then refuses the
 * path rather than picking a winner — one render is what keeps both trees
 * writable.
 *
 * `dir` takes the path discipline the projection itself ran under: an absolute
 * path, a `..` segment or a backslash is refused, so a caller cannot aim the
 * copy out of the repo. A row that is not under the projection root is refused
 * too — there is no rule here for re-targeting a path this module did not lay
 * down.
 *
 * Rows come back path-sorted (codepoint order), the order every projection
 * boundary returns. Attribution stops at artifact identity: these are
 * {@link ProjectedFile} rows, and the ledger owner is the adapter's to assign
 * when it wraps them as its own single-owner residue.
 */
export function retargetProjection(rows: readonly ProjectedFile[], dir: string): ProjectedFile[] {
  assertSafePath(dir, "native skills projection root");
  const prefix = `${SKILLS_PROJECTION_DIR}/`;

  return rows
    .map((row) => {
      if (!row.path.startsWith(prefix)) {
        throw new EngineError(
          `Cannot re-target ${JSON.stringify(row.path)}: it is not under ${prefix}. ` +
            `retargetProjection maps rows produced by the ${SKILLS_PROJECTION_DIR} projection.`,
          { code: "VALIDATION_ERROR" },
        );
      }
      return { ...row, path: posix.join(dir, row.path.slice(prefix.length)) };
    })
    .toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The six top-level keys the Agent Skills spec permits, in the order a reader
 * expects them (code.claude.com/docs/en/skills § "Frontmatter reference" and
 * § "Using skill frontmatter outside Claude Code", accessed 2026-08-16).
 * `name` and `description` are the two this projection ever produces from
 * canonical content; the other four pass through when an author declares them.
 */
const SPEC_FRONTMATTER_KEYS = [
  "name",
  "description",
  "license",
  "compatibility",
  "allowed-tools",
  "metadata",
] as const;

/** Spec `name` grammar: lowercase alphanumerics and hyphens, at most 64 chars. */
const SPEC_NAME_PATTERN = /[^a-z0-9-]+/g;

/**
 * Rewrite an authored head into the spec's six-key intersection.
 *
 * Two moves, and the second is what keeps the transform lossless:
 *
 * 1. `name` is synthesized from the skill's DIRECTORY, which is also the name
 *    the client derives a command from — so the declared name and the invoked
 *    name cannot disagree.
 * 2. Every key outside the six is hoisted into `metadata`, the spec's own
 *    free-form map for tooling-owned data. Nothing the corpus authored is lost;
 *    it simply stops occupying a top-level slot the validator has an opinion
 *    about. An author-declared `metadata` map is merged under, so their keys
 *    win over the hoisted ones.
 *
 * A document with no frontmatter is returned untouched: inventing a head for a
 * file that declares none would be an authoring decision, not a projection.
 *
 * Exported because the INSTALLED-PACK skill lane projects into the same
 * `.agents/skills/` tree and lands under the same strict validator
 * (`../pack/projection.ts` → `projectOnePackSkill`). That lane reuses this
 * transform rather than carrying its own: a second implementation is how the
 * two trees would come to disagree about the spec's six keys. It is the ONLY
 * render step the pack lane borrows — pack bodies stay byte-verbatim there.
 */
export function toSpecFrontmatter(raw: string, skillDir: string, source: string): string {
  const parsed = parseFrontmatter(raw, source);
  if (!parsed.hadFrontmatter) return raw;

  const authored = parsed.frontmatter;
  const head: Record<string, unknown> = {
    name: skillDir.toLowerCase().replaceAll(SPEC_NAME_PATTERN, "-").slice(0, 64),
  };
  for (const key of SPEC_FRONTMATTER_KEYS) {
    if (key !== "name" && key !== "metadata" && authored[key] !== undefined) {
      head[key] = authored[key];
    }
  }

  const authoredMetadata = authored["metadata"];
  const hoisted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(authored)) {
    if ((SPEC_FRONTMATTER_KEYS as readonly string[]).includes(key)) continue;
    hoisted[key] = value;
  }
  const metadata = {
    ...hoisted,
    ...(typeof authoredMetadata === "object" && authoredMetadata !== null && !Array.isArray(authoredMetadata)
      ? (authoredMetadata as Record<string, unknown>)
      : {}),
  };
  if (Object.keys(metadata).length > 0) head["metadata"] = metadata;

  return composeFrontmatter(head, parsed.body);
}

/**
 * Resolve one `SKILL.md` document for emission: the head becomes the spec's
 * six-key shape ({@link toSpecFrontmatter}), then the body takes emission-time
 * substitution. The token grammar is anchored (`${STAMITY:UPPER_SNAKE}`), so
 * prose that merely mentions the prefix passes through unchanged, and
 * replacement values are never rescanned.
 *
 * The platform marker resolves last, by split/join: the neutral table is
 * static prose, and joining inserts it verbatim (no `$`-pattern expansion).
 */
function renderSkillBody(
  raw: string,
  skillDir: string,
  source: string,
  detection: ReturnType<typeof detectionContextFromManifest>,
  gates: VerificationGateSet,
): string {
  const shaped = toSpecFrontmatter(raw, skillDir, source);
  const substituted = substituteVerificationGateTokens(
    substituteRepoTokens(shaped, detection),
    gates,
  );
  if (!substituted.includes(PLATFORM_TOOL_MARKER)) return substituted;
  return substituted.split(PLATFORM_TOOL_MARKER).join(buildAskUserPlatformTable());
}

/** All rows for one skill: its full source directory, recursively. */
async function projectOneSkill(
  fs: CatalogFs,
  item: CatalogItem,
  renderSkill: (raw: string, skillDir: string) => string,
): Promise<ProjectedFile[]> {
  // `skills/<dir>/SKILL.md` → `<dir>`; the catalog validated the whole path.
  const skillDir = posix.basename(posix.dirname(item.relativePath));
  const sourceDir = dirname(item.filePath);
  const files = await walkRegularFiles(fs, sourceDir, "");

  return Promise.all(
    files.map(async (relative) => {
      // Walk output is composed from readdir entry names, but the guard is
      // cheap and turns any hostile name (separator, traversal) into a named
      // refusal instead of a write outside the target tree.
      assertSafePath(posix.join(skillDir, relative), `skill "${item.id}" projection`);
      const raw = await fs.readFile(join(sourceDir, ...relative.split("/")), "utf8");
      const content = relative === SKILL_FILE ? renderSkill(raw, skillDir) : raw;
      return {
        path: posix.join(SKILLS_PROJECTION_DIR, skillDir, relative),
        content,
        artifactId: item.id,
        artifactType: item.type,
        origin: item.origin ?? "corpus",
      };
    }),
  );
}

/**
 * Every regular file under `dir`, as POSIX paths relative to it, depth-first
 * with codepoint-ordered siblings so the walk is identical on every platform.
 * Directories recurse; anything else that is not a regular file is skipped.
 */
async function walkRegularFiles(fs: CatalogFs, dir: string, prefix: string): Promise<string[]> {
  const entries = (await fs.readdir(dir, { withFileTypes: true })).toSorted((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  const nested = await Promise.all(
    entries.map((entry) => {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) return walkRegularFiles(fs, join(dir, entry.name), relative);
      return Promise.resolve(entry.isFile() ? [relative] : []);
    }),
  );
  return nested.flat();
}
