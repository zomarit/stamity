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
 * `.stamity/overrides/skills/<dir>/SKILL.md` — or the package's own
 * `fork/skills/<dir>/SKILL.md`, one layer below it — wins the id it claims and
 * ITS directory — `SKILL.md` and every support file under it — is what projects,
 * under the REPLACED skill's directory name and spec `name` when it took a
 * shipped id ({@link projectSkills} states the rule).
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
  replacedClaimantOf,
  typeIdKey,
  type CatalogFs,
  type CatalogItem,
  type ContentOrigin,
  type ContentRoots,
} from "../content/catalog.ts";
import { composeFrontmatter, parseFrontmatter } from "../content/frontmatter.ts";
import { RULE_SKILL_DIR_PREFIX, NO_DEMOTED_RULES } from "../content/ruleDelivery.ts";
import { buildSelectionAllowlist, classifySelection } from "../content/selection.ts";
import { verificationGatesFor } from "../detect/verificationGates.ts";
import { PLATFORM_TOOL_MARKER, buildAskUserPlatformTable } from "../tools/translator.ts";
import type { ContentClass } from "../types/content.ts";
import { TOOLS, type Tool } from "../types/core.ts";
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
   * row, `"fork"` for the package's fork layer, `"corpus"` for the bundled
   * tree, `"pack"` for an installed pack. Unset for a non-content (`"infra"`)
   * row and for a producer that has not been taught to stamp it; a reader that
   * needs the distinction treats `undefined` as "not an override" rather than
   * as an error.
   */
  origin?: ContentOrigin;
}

/**
 * A row THIS projection produced: a {@link ProjectedFile} that also names the
 * artifact it was rendered from. Present on every row of a skill — its
 * `SKILL.md` and each support file alike — because a refusal about the skill
 * has to name the file its author wrote, and the emitted path no longer says:
 * a replacement projects under the REPLACED skill's directory rather than its
 * own ({@link projectSkills}), so the source directory cannot be read back off
 * `path`. The composer's row wrapping drops it (only path, content and the
 * artifact identity reach an emission plan), so it never lands in a ledger.
 */
export interface ProjectedSkillFile extends ProjectedFile {
  /**
   * POSIX path of the source skill's `SKILL.md` relative to the layer root
   * that supplied it — `skills/<authored dir>/SKILL.md`, the catalog item's own
   * `relativePath` — the same for the skill's support-file rows.
   */
  artifactPath: string;
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
   * what lets a caller name the repo's own override tree as well — and the
   * package's fork layer — so a `.stamity/overrides/skills/<dir>/SKILL.md` or a
   * `fork/skills/<dir>/SKILL.md` reaches emission the way a user or fork agent,
   * rule or command already does. Defaults to the package-bundled corpus, with
   * the bundled fork root beside it.
   *
   * `packRoots` IS now supplied by this projection's caller (`./planner.ts` →
   * `buildCoreEmissionPlan`) — but only into the LOOKUP, not into what this
   * function admits into its own return. `buildContentIndex` discovers an
   * overlay under every class the override tree holds, not only `skill`, and
   * refuses one whose base it cannot find in `byKey`; without pack roots in
   * that lookup, an overlay addressed at ANY pack-supplied artifact (a rule,
   * an agent, a command — not only a skill) was an orphan by this index's
   * lights alone, throwing here and blocking every plan. Installed packs still
   * keep their own resolution and rendering lane for what actually PROJECTS —
   * `resolveInstalledPackContent` produces pack skill rows and
   * `mergeSkillProjections` folds them in under a directory-collision check —
   * so indexing pack roots here only for lookup purposes and then admitting
   * them into this function's return too would project every pack skill twice
   * and trip that check against rows this projection itself laid down. The
   * caller (`buildCoreEmissionPlan`) is what keeps the two separated: it
   * filters this function's own output back down to non-pack rows
   * (`row.origin !== "pack"`) before handing it to `mergeSkillProjections`, so
   * a pack-origin row that survives admission here (first claimant of its own
   * key, unrelated to any override) never reaches emission from this lane.
   *
   * The override-vs-pack collision `mergeSkillProjections` also has to close
   * stays real regardless: an override in the corpus-plus-override-plus-pack
   * index above can still claim a catalog id or a directory a pack skill
   * supplies from a DIFFERENT layer's resolution (a shadow, not a lookup
   * miss), and `mergeSkillProjections` is where the two sides finally meet
   * for emission, so it is where that refusal has to live — see its own
   * comment.
   */
  contentRoot?: string | ContentRoots;
  /** Filesystem override for corpus reads; defaults to `node:fs/promises`. */
  fs?: CatalogFs;
  /**
   * The selected RULES, for the delivery option: a rule demoted on at least one
   * selected client is projected here as a skill instead of being carried as
   * that client's always-on rule text (`../content/ruleDelivery.ts`).
   *
   * Passed in rather than read off this module's own index, because the answer
   * to "which rules are demoted" is per client and the caller
   * (`./planner.ts` → `buildCoreEmissionPlan`) is the one holding the manifest's
   * tool selection. Omitted — every direct caller that is not the core plan —
   * no rule is projected, which is also exactly what `always-on` produces.
   */
  ruleItems?: readonly CatalogItem[];
  /**
   * Demoted rule ids PER TOOL, as {@link demotedRuleIds} answered for each
   * selected client. The union decides which rules get a row at all; the
   * per-tool sets are what the row's own `metadata.stamity.tools` names, so a
   * reader of one emitted file can see which clients are actually reaching the
   * rule through it. Defaults to no demotions anywhere.
   */
  demotedRules?: Readonly<Record<Tool, ReadonlySet<string>>>;
}

/**
 * Project every selected skill into `.agents/skills/<dir>/…`.
 *
 * `<dir>` is the catalog directory name as authored (`st-verify`, prefix
 * included) — the projection preserves the source's own naming so a skill's
 * internal relative links and its dispatch-table paths survive unchanged — with
 * one rule on top for the two customizing layers. A fork or user skill that
 * REPLACES a bundled skill (it took a corpus or pack skill's id; the catalog
 * recorded the shadow) projects under the REPLACED skill's directory, and its
 * spec `name` is synthesized from that directory too. Those layers spell their
 * ids bare (`fork/skills/verify/SKILL.md` is the only admissible spelling under
 * `fork/`), while every corpus reference — the commands, rules and agents that
 * invoke a skill by name — says `st-verify`, the directory the bundled skill
 * projected under: a replacement that landed at `.agents/skills/verify/` with
 * `name: verify` would leave every one of those references pointing at a skill
 * that no longer ships and the bundled name pointing at nothing. Agents, rules
 * and commands restore the prefix at emission for the same reason
 * (`../content/catalog.ts` → `emittedIdFor`); skills carry the bundled
 * directory instead because a fixture corpus may spell one bare. A customizing
 * skill that is an ADDITION replaced nothing and keeps its authored directory.
 * The skill's OWN files — `SKILL.md` and every support file under it — are
 * what project either way; only the directory they land in follows the rule.
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
): Promise<ProjectedSkillFile[]> {
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
      // The directory rule above: the replaced skill's directory when this
      // item took a shipped id, its own otherwise.
      projectOneSkill(fs, item, skillDirOf(replacedClaimantOf(index, item) ?? item), (raw, skillDir) =>
        renderSkillBody(raw, skillDir, item.relativePath, detection, gates),
      ),
    ),
  );

  const demoted = options.demotedRules ?? NO_DEMOTED_RULES;
  // Every tool without a {@link NATIVE_SKILL_DIRS} entry reads this SAME
  // shared `.agents/skills/` file off disk — the frontmatter's own
  // `metadata.stamity.tools` list is bookkeeping the projection writes, not a
  // gate any of those readers checks before loading it. A rule authored
  // `tools:` restricted (only some clients should ever see its body) is
  // therefore never safe to place here unless every shared-tree reader is one
  // of the tools it names: placing it anyway is how a `tools:`-scoped rule's
  // body reaches a client it never named (W3). Skipping the shared row is the
  // smaller cost — the rule still reaches its named clients through whatever
  // native or always-on door they already have, and Claude (the one client
  // with a private, re-targeted copy) is unaffected either way, since its own
  // copy is filtered by {@link demoted} independently in `nativeSkillRows`.
  const sharedTreeReaders = TOOLS.filter((tool) => NATIVE_SKILL_DIRS[tool] === undefined);
  const ruleRows = (options.ruleItems ?? []).flatMap((item) => {
    const tools = TOOLS.filter((tool) => demoted[tool].has(item.id));
    if (tools.length === 0) return [];
    if (item.tools !== undefined && !sharedTreeReaders.every((tool) => item.tools!.includes(tool))) {
      return [];
    }
    return [projectRuleAsSkill(item, tools, detection, gates)];
  });

  return [...perSkill.flat(), ...ruleRows].toSorted((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}

/**
 * One demoted rule as a skill row: `.agents/skills/stamity-<id>/SKILL.md`.
 *
 * The rule does not become a skill — it stays a rule, with its own catalog id,
 * its own ledger identity (`artifactType: "rule"`, so deselecting the rule
 * reclaims this path) and its authored body unchanged. What changes is the DOOR
 * it arrives through: a description-triggered skill file the client loads when
 * the description matches, instead of instruction text every session pays for.
 * The frontmatter is therefore the skills spec's shape with the engine's own
 * vocabulary under `metadata.stamity` — the same six-key ceiling every other
 * file in this tree is held to, since the strict validator that rejects an
 * unexpected top-level key does not care which class the content came from.
 *
 * `tools` names the clients that demoted it, which is the one fact a reader of
 * the emitted file cannot derive: the same rule can be delivered here for codex
 * and as a `.cursor/rules/` file for cursor in one run, and a file that did not
 * say so would read as "no client attaches this natively".
 */
function projectRuleAsSkill(
  item: CatalogItem,
  tools: readonly Tool[],
  detection: ReturnType<typeof detectionContextFromManifest>,
  gates: VerificationGateSet,
): ProjectedSkillFile {
  const skillDir = `${RULE_SKILL_DIR_PREFIX}${item.id}`;
  assertSafePath(posix.join(skillDir, SKILL_FILE), `rule "${item.id}" projection`);
  const head: Record<string, unknown> = {
    name: skillDir.toLowerCase().replaceAll(SPEC_NAME_PATTERN, "-").slice(0, 64),
    description: item.description,
    metadata: {
      stamity: {
        id: item.id,
        type: item.type,
        tags: item.tags,
        load: item.frontmatter["load"],
        obsolete_when: item.frontmatter["obsolete_when"],
        delivery: "on-demand",
        tools: [...tools],
      },
    },
  };
  return {
    path: posix.join(SKILLS_PROJECTION_DIR, skillDir, SKILL_FILE),
    content: composeFrontmatter(head, substituteBody(item.body, detection, gates)),
    artifactId: item.id,
    artifactType: item.type,
    artifactPath: item.relativePath,
    origin: item.origin ?? "corpus",
  };
}

/** `skills/<dir>/SKILL.md` → `<dir>`; the catalog validated the whole path. */
function skillDirOf(item: Pick<CatalogItem, "relativePath">): string {
  return posix.basename(posix.dirname(item.relativePath));
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
 * when it wraps them as its own single-owner residue. Generic over the row
 * type because the spread carries every field through — a
 * {@link ProjectedSkillFile} in is a `ProjectedSkillFile` out.
 */
export function retargetProjection<Row extends ProjectedFile>(
  rows: readonly Row[],
  dir: string,
): Row[] {
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
 * The rows ONE client's native skills directory should receive — content skills
 * plus only the rule-skills that client itself demoted — already re-targeted
 * onto {@link NATIVE_SKILL_DIRS}. An empty list for a client that reads the
 * vendor-neutral tree directly and needs no copy.
 *
 * The filter exists because the projection's rule-skill rows are the UNION over
 * selected tools and cannot be anything else: {@link SKILLS_PROJECTION_DIR} is
 * one directory read by cursor, copilot and codex alike, so a rule demoted by
 * any of them has to be in it. A native directory has exactly one reader, so
 * the same union there is a different thing — a rule this client still receives
 * as its own rule file, copied a second time as a skill. On a four-client
 * selection that was seven rules delivered twice to claude: `.claude/rules/
 * stamity-testing.md` beside `.claude/skills/stamity-testing/SKILL.md`, both
 * carrying the same body, neither of them wrong on its own.
 *
 * What it costs the client nothing to lose: codex is the client that demoted
 * those rules, and codex reads {@link SKILLS_PROJECTION_DIR}. The row is still
 * emitted, still delivered, still ledgered — it is only the second copy under a
 * root no demoting client reads that goes.
 *
 * A CONTENT skill is never filtered: it is selected content with no delivery
 * question attached, and its support files ride with it. The test is
 * `artifactType`, which the projection sets from the catalog item, so a rule
 * delivered as a skill is still a rule here — the same fact the emitted file
 * states under `metadata.stamity.tools`.
 */
export function nativeSkillRows<Row extends ProjectedFile>(
  rows: readonly Row[],
  tool: Tool,
  demotedRules: Readonly<Record<Tool, ReadonlySet<string>>> = NO_DEMOTED_RULES,
): Row[] {
  const dir = NATIVE_SKILL_DIRS[tool];
  if (dir === undefined || dir === "") return [];
  const demoted = demotedRules[tool];
  return retargetProjection(
    rows.filter((row) => row.artifactType !== "rule" || demoted.has(row.artifactId)),
    dir,
  );
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
  return substituteBody(toSpecFrontmatter(raw, skillDir, source), detection, gates);
}

/**
 * Emission-time substitution over one document — shared by the skill lane and
 * the demoted-rule lane, so a rule delivered as a skill says what this
 * repository's gate commands actually are exactly as a skill does.
 */
function substituteBody(
  raw: string,
  detection: ReturnType<typeof detectionContextFromManifest>,
  gates: VerificationGateSet,
): string {
  const substituted = substituteVerificationGateTokens(substituteRepoTokens(raw, detection), gates);
  if (!substituted.includes(PLATFORM_TOOL_MARKER)) return substituted;
  return substituted.split(PLATFORM_TOOL_MARKER).join(buildAskUserPlatformTable());
}

/**
 * All rows for one skill: its full source directory, recursively, projected
 * into `skillDir` — the directory {@link projectSkills}'s rule chose, which is
 * the item's own for every skill that replaced nothing.
 */
async function projectOneSkill(
  fs: CatalogFs,
  item: CatalogItem,
  skillDir: string,
  renderSkill: (raw: string, skillDir: string) => string,
): Promise<ProjectedSkillFile[]> {
  const sourceDir = dirname(item.filePath);
  const files = await walkRegularFiles(fs, sourceDir, "");

  return Promise.all(
    files.map(async (relative) => {
      // Walk output is composed from readdir entry names, but the guard is
      // cheap and turns any hostile name (separator, traversal) into a named
      // refusal instead of a write outside the target tree.
      assertSafePath(posix.join(skillDir, relative), `skill "${item.id}" projection`);
      // `SKILL.md` renders from the ITEM, not from disk: a patched skill keeps
      // the base's `filePath` (spec REQ-003, the catalog's merge-identity
      // rule), so `item.body`/`item.frontmatter` already carry the merged
      // document while a disk read at `sourceDir` would silently re-fetch the
      // unpatched corpus bytes. Support files have no overlay half — overlays
      // patch `SKILL.md` only — so they stay a verbatim disk read from
      // `sourceDir`, which is filePath-agnostic: a full-override skill's
      // `filePath` IS the override directory, so this is still the right root
      // for its siblings too.
      const content =
        relative === SKILL_FILE
          ? renderSkill(composeFrontmatter(item.frontmatter, item.body), skillDir)
          : await fs.readFile(join(sourceDir, ...relative.split("/")), "utf8");
      return {
        path: posix.join(SKILLS_PROJECTION_DIR, skillDir, relative),
        content,
        artifactId: item.id,
        artifactType: item.type,
        artifactPath: item.relativePath,
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
