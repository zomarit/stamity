import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, posix, relative as pathRelative, resolve, sep } from "node:path";
import { parseJsonStrict } from "../config/parse.ts";
import {
  buildContentIndex,
  assertSafePath,
  type CatalogItem,
  type PackContentRoot,
} from "../content/catalog.ts";
import type { PackAgentDeclaration } from "../emit/hooksInfra.ts";
import {
  SKILLS_PROJECTION_DIR,
  toSpecFrontmatter,
  type ProjectedFile,
} from "../emit/skillsProjection.ts";
import { readHookDefinitions, type ReadHooksResult } from "../hooks/userHooks.ts";
import { assertNoCuratedCollision, type PackSuppliedServer } from "../mcp/catalog.ts";
import { grantableFootprint } from "../roster/agentGrants.ts";
import { CONTENT_CLASSES } from "../types/content.ts";
import { EngineError } from "../types/errors.ts";
import { PACK_OWNER_PREFIX, isPackOwner, type SetupManifest } from "../types/manifest.ts";
import { CONTENT_PREFIX } from "../types/markers.ts";
import {
  PACK_CONTENT_CLASSES,
  PACK_SOURCE_KINDS,
  validatePackMcpServer,
  type PackContentClass,
  type PackMcpServerDefinition,
} from "./manifest.ts";
import {
  evaluatePackSource,
  loadOrgPolicy,
  ORG_POLICY_REL_PATH,
  type EvaluatedSourceKind,
} from "./orgPolicy.ts";
import { packDirRelPath, RECEIPT_FILE } from "./receipt.ts";

/**
 * Installed-pack projection: the read half of the live-emission invariant.
 * Install lands bytes under `.stamity/packs/<pack>/` and records
 * them in the ownership ledger (`./install.ts`); THIS module is what makes
 * those bytes live — it turns the ledger's `pack:<id>` rows back into content
 * roots the emission walk consumes, so an installed pack's agents, skills,
 * rules and commands project through the SAME core surfaces as corpus content
 * and an inert install is structurally impossible.
 *
 * Three consumption seams, one per delivery lane — together they cover EVERY
 * class a pack may ship (`./manifest.ts` → `PACK_CONTENT_CLASSES`), so every
 * pack class has a consuming path and an inert install is structurally
 * impossible rather than merely discouraged. A class with no seam here is
 * refused at ingress instead of installed (`./manifest.ts` →
 * `UNCONSUMED_CONTENT_DIRS`, which today holds only the retired `prompts`
 * class):
 *
 * - {@link resolveInstalledPackContent} / {@link packContentRoots} — the four
 *   canonical classes, handed to the catalog walk (`../content/catalog.ts`)
 *   and to the emission composer (`../emit/planner.ts`). Pack skills are
 *   projected into `.agents/skills/` here ({@link ResolvedPackContent}): bodies
 *   and support files byte-verbatim, `SKILL.md` HEADS through the core lane's
 *   spec-frontmatter projector ({@link projectOnePackSkill}).
 * - {@link packHookDefinitions} — `hooks/*.json` files handed to the
 *   user-hook lane reader (`../hooks/userHooks.ts`), which applies its own
 *   strict ingress (exec-form argv, no network fetch, repo-contained paths),
 *   and from there to `../emit/hooksInfra.ts` → every selected client's hook
 *   config.
 * - {@link packMcpServers} — `mcp_servers/*.json` files handed to the MCP
 *   substrate as {@link PackSuppliedServer} rows, which `../mcp/catalog.ts` →
 *   `resolveServerMeta` resolves beside the curated table for per-client
 *   emission (`../mcp/emit.ts`) and credential provisioning (`../mcp/env.ts`).
 *   Installing a pack makes its servers SELECTABLE, not selected: selection
 *   stays the operator's separate act (`config mcp add`), so nothing here
 *   widens what a repo runs.
 *
 * Two contracts shape everything here:
 *
 * - **Install-once.** Pack bytes under `.stamity/packs/` are written by
 *   install and removed by uninstall; nothing in this module writes, and no
 *   emission surface ever targets a path under the packs directory. What IS
 *   regenerated every sync are the projections — adapter-owned copies sourced
 *   from pack content — so a removed pack's projections reclaim on the next
 *   sync while its source directory is the uninstall sweep's business alone.
 * - **Projection reads bytes.** Content is read from disk as it is now, not
 *   as the ledger hashed it at install time: an operator-edited pack file
 *   still projects, and surfacing the drift is the check command's concern,
 *   not a reason to hold emission hostage to a stale hash.
 */

/*
 * The sequential loop below is deliberate: pack discovery walks packs in
 * sorted id order so the first defective pack is the one reported, whatever
 * the filesystem's timing.
 */
/* oxlint-disable no-await-in-loop */

// ── Discovery ──────────────────────────────────────────────────

/** How an installed pack's receipt records where it came from, when it can be read. */
interface RecordedProvenance {
  readonly declaredTools: readonly string[];
  readonly sourceKind: EvaluatedSourceKind;
}

/** One pack the ledger records as installed, resolved to its on-disk root. */
export interface InstalledPack {
  /** Pack id, as the `pack:<id>` ledger owner spells it. */
  id: string;
  /** Absolute root of the pack's installed content (`<repo>/.stamity/packs/<dir>`). */
  root: string;
  /**
   * Content classes the pack's ledger rows cover, in
   * {@link PACK_CONTENT_CLASSES} declaration order. Derived from the rows —
   * the install-time record — not from a fresh directory listing, so a class
   * present here is one the install actually landed.
   */
  classesPresent: string[];
  /**
   * The tool footprint the pack disclosed at install, narrowed to the
   * categories a grant can name — the ceiling every grant this pack's agents
   * resolve to is bounded by.
   *
   * Read from the install receipt (`./receipt.ts`), which is where it is
   * persisted: `pack.json` is not part of the install write set, so the
   * receipt is the only record of what the operator accepted. Empty for a pack
   * that disclosed nothing, for a receipt written before the field existed,
   * and for any receipt that cannot be read — deny-by-default in all three,
   * because a footprint that fails open is not a ceiling.
   */
  declaredTools: readonly string[];
}

/** The four classes the catalog walk consumes; `hooks` has its own seam below. */
const CANONICAL_PACK_CLASSES: ReadonlySet<PackContentClass> = new Set([
  "agents",
  "skills",
  "rules",
  "commands",
]);

/**
 * Every installed pack the manifest's ledger records, sorted by pack id —
 * minus the ones the org trust policy denies.
 *
 * The policy filter is here, at the ONE discovery choke point every consumer
 * goes through (emission, `check`, `config mcp`, `clean`), because it was
 * consumed from `planPackInstall` and nowhere else: a repo that installed a
 * pack and then adopted a policy denying it kept projecting that pack's
 * agents, rules, hooks and MCP definitions on every `sync` while `add`
 * correctly refused new installs and `check` reported all green. A
 * denied pack now contributes nothing to any of them.
 *
 * It degrades rather than fails, which the deny-at-install path does not. A
 * denied pack's files stay on disk and its ledger rows stay in the manifest,
 * so `clean --pack <id>` still uninstalls it and re-allowing the source
 * restores it with no re-install — a repo that adopts a strict policy gets a
 * setup without those packs, never an unrecoverable `sync`. The pack ids that
 * were dropped are returned alongside ({@link discoverInstalledPacksWithPolicy})
 * so a surface can name them rather than leaving the operator to wonder where
 * their pack's content went.
 *
 * A malformed policy still throws `CONFIG_ERROR` from the loader: fail-closed
 * is the artifact's whole point, and a policy nobody can read is not a policy
 * that allows everything.
 *
 * The ledger is the source of truth for WHAT is installed; the filesystem is
 * probed only to confirm the pack's root directory still exists, and only for
 * packs whose rows claim class content under the install layout
 * (`artifactId: "<pack id>/<class>/…"` — what `./install.ts` writes). Rows
 * present with the directory gone is a repo someone pruned by hand — refused
 * as a named `CONFIG_ERROR` pointing at `clean --pack`, because planning
 * around the gap would silently emit a setup missing content the ledger says
 * the repo has, and the reclaim sweep (not this reader) owns dropping the
 * rows. A pack whose rows claim no class content (a receipt-only install, or
 * rows authored outside the install layout) has nothing for the projection to
 * read and is carried with `classesPresent: []` — its files are the drift
 * check's surface, not a reason to refuse planning.
 *
 * Reads nothing when the ledger carries no pack rows, so a no-packs plan does
 * not touch the filesystem here at all.
 */
export async function discoverInstalledPacks(
  rootDir: string,
  manifest: SetupManifest,
): Promise<InstalledPack[]> {
  return (await discoverInstalledPacksWithPolicy(rootDir, manifest)).packs;
}

/** The discovery result plus the pack ids the org policy removed from it. */
export interface InstalledPackDiscovery {
  /** Installed packs the policy admits, sorted by pack id. */
  packs: InstalledPack[];
  /**
   * Ids the policy denied, sorted, each with the rule that decided. Empty for
   * a repo with no policy — which is every repo that never wrote one.
   */
  denied: { id: string; matchedRule?: string }[];
}

/**
 * {@link discoverInstalledPacks} with the denied set kept rather than dropped,
 * for the surfaces that report why a pack stopped contributing.
 */
export async function discoverInstalledPacksWithPolicy(
  rootDir: string,
  manifest: SetupManifest,
): Promise<InstalledPackDiscovery> {
  const rowsByPack = new Map<string, string[]>();
  for (const entry of manifest.ledger) {
    if (!isPackOwner(entry.adapter)) continue;
    const id = entry.adapter.slice(PACK_OWNER_PREFIX.length);
    rowsByPack.set(id, [...(rowsByPack.get(id) ?? []), entry.artifactId]);
  }
  // Read once for the whole discovery: a malformed policy fail-closes here
  // exactly as it does at install, and a repo with none pays one ENOENT.
  const policy = rowsByPack.size === 0 ? null : await loadOrgPolicy(rootDir);

  const packs: InstalledPack[] = [];
  const denied: { id: string; matchedRule?: string }[] = [];
  for (const id of [...rowsByPack.keys()].toSorted()) {
    // Validates the id shape too: a malformed hand-edited owner is refused
    // before it can be joined into a path.
    const relDir = packDirRelPath(id);
    const root = join(rootDir, ...relDir.split("/"));
    const classesPresent = classesOf(id, rowsByPack.get(id) ?? []);
    // The receipt carries both the footprint that bounds this pack's agent
    // grants and the source kind the policy judges it by. One read answers
    // both; a pack that ships no agents and faces no policy costs none.
    const provenance =
      policy !== null || classesPresent.includes("agents")
        ? await readRecordedProvenance(root)
        : { declaredTools: [], sourceKind: "unknown" as const };

    const decision = evaluatePackSource(policy, id, provenance.sourceKind);
    if (decision.decision === "deny") {
      denied.push({
        id,
        ...(decision.matchedRule === undefined ? {} : { matchedRule: decision.matchedRule }),
      });
      continue;
    }

    if (classesPresent.length > 0 && !(await isDirectory(root))) {
      throw new EngineError(
        `The ledger records installed pack "${id}", but its content directory ${relDir}/ is ` +
          `missing from the repo — the files were removed outside the engine. Run ` +
          `\`clean --pack ${id}\` to drop the pack's ledger rows, then re-install the pack if ` +
          `you still want it.`,
        { code: "CONFIG_ERROR" },
      );
    }
    packs.push({ id, root, classesPresent, declaredTools: provenance.declaredTools });
  }
  return { packs, denied };
}

/** One operator-readable line per pack the policy removed from the projection. */
export function describeDeniedPacks(
  denied: readonly { id: string; matchedRule?: string }[],
): string[] {
  return denied.map((pack) => {
    const rule =
      pack.matchedRule === undefined ? "" : ` (matched rule: ${JSON.stringify(pack.matchedRule)})`;
    return (
      `Installed pack "${pack.id}" is denied by the org trust policy${rule}, so none of its ` +
      `content was projected into this setup. Its files are still on disk — run ` +
      `\`clean --pack ${pack.id}\` to uninstall it, or change ${ORG_POLICY_REL_PATH}.`
    );
  });
}

/**
 * What the receipt at `packRoot` records about this install: the tool footprint
 * (narrowed to grantable categories) and the source kind it came from.
 *
 * Every failure resolves to the deny-shaped answer rather than throwing: a
 * receipt an operator deleted, truncated, or hand-edited into something
 * unparsable must not take the whole plan down. For the footprint that is `[]`
 * — no readable disclosure means no ceiling at all, which denies rather than
 * grants. It is re-narrowed on the way in for the same reason: the bytes on
 * disk are as trustworthy as the file's owner, and a hand-added category the
 * taxonomy does not grant licenses nothing here.
 *
 * For the source kind it is `"unknown"`, which is deliberately NOT the deny
 * direction. Kind rules match no unknown, so a `deny: ["npm-package"]` policy
 * does not silently start denying packs whose provenance nobody can read;
 * name, scope and `"*"` rules still match, so a policy that means "nothing"
 * still means nothing.
 */
async function readRecordedProvenance(packRoot: string): Promise<RecordedProvenance> {
  const empty: RecordedProvenance = { declaredTools: [], sourceKind: "unknown" };
  let raw: string;
  try {
    raw = await readFile(join(packRoot, RECEIPT_FILE), "utf8");
  } catch {
    return empty;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (typeof parsed !== "object" || parsed === null) return empty;

  const permissions = (parsed as { permissions?: unknown }).permissions;
  const declaredRaw =
    typeof permissions === "object" && permissions !== null
      ? (permissions as { toolFootprint?: unknown }).toolFootprint
      : undefined;
  const declaredTools = Array.isArray(declaredRaw)
    ? grantableFootprint(declaredRaw.filter((entry): entry is string => typeof entry === "string"))
    : [];

  const source = (parsed as { source?: unknown }).source;
  const kind =
    typeof source === "object" && source !== null
      ? (source as { kind?: unknown }).kind
      : undefined;
  const sourceKind: EvaluatedSourceKind =
    typeof kind === "string" && (PACK_SOURCE_KINDS as readonly string[]).includes(kind)
      ? (kind as EvaluatedSourceKind)
      : "unknown";

  return { declaredTools, sourceKind };
}

/**
 * Catalog roots for the packs that ship at least one canonical content class
 * — the walk input the emission composer threads to residue planners. Order
 * follows the (already sorted) pack list, so projection order is a function
 * of what is installed.
 *
 * Each root carries its pack's declared footprint, so every item the walk
 * finds under it is stamped with the ceiling its grants are bounded by
 * (`../content/catalog.ts` → `CatalogItem.provenance`). That stamp is what
 * lets the four adapters and the policy-document planner render a pack agent's
 * grant from ONE resolution rather than four re-derivations of the same
 * disclosure.
 */
export function packContentRoots(packs: readonly InstalledPack[]): PackContentRoot[] {
  return packs
    .filter((pack) =>
      pack.classesPresent.some((cls) => CANONICAL_PACK_CLASSES.has(cls as PackContentClass)),
    )
    .map((pack) => ({ pack: pack.id, root: pack.root, declaredTools: pack.declaredTools }));
}

/** Classes covered by one pack's ledger rows, in class declaration order. */
function classesOf(packId: string, artifactIds: readonly string[]): string[] {
  const present = new Set<string>();
  const prefix = `${packId}/`;
  for (const artifactId of artifactIds) {
    // Rows are `<pack id>/<pack-relative path>`; pack-root metadata (the
    // receipt) has no class segment and is not a content class.
    if (!artifactId.startsWith(prefix)) continue;
    const relPath = artifactId.slice(prefix.length);
    const slash = relPath.indexOf("/");
    if (slash === -1) continue;
    present.add(relPath.slice(0, slash));
  }
  return PACK_CONTENT_CLASSES.filter((cls) => present.has(cls));
}

/** True when a directory exists at `path`; absence in any form is `false`. */
async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw new EngineError(`Cannot stat ${path}: ${describeError(cause)}.`, {
      code: "FS_ERROR",
      cause,
    });
  }
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// ── Canonical-class resolution for emission ────────────────────

/** Everything the emission composer needs from the installed pack set. */
export interface ResolvedPackContent {
  /** Installed packs, sorted by id; empty for a repo with no packs. */
  packs: InstalledPack[];
  /** Walk roots for the packs shipping canonical classes. */
  packRoots: PackContentRoot[];
  /**
   * Every pack artifact of the four canonical classes, from the merged
   * corpus+packs walk — so the corpus collide-refusal has already run by the
   * time these items exist. Each carries `provenance: { pack }`.
   */
  items: CatalogItem[];
  /**
   * Verbatim `.agents/skills/` rows for every pack skill (its whole
   * directory, `references/` subtrees included), sorted by path.
   */
  skillRows: ProjectedFile[];
  /**
   * Every pack-supplied agent as the policy-document planner takes it
   * (`../emit/hooksInfra.ts` → `PackAgentDeclaration`), in `items` order.
   *
   * This is the agent-class half of the live-emission invariant.
   * Without these rows the emitted `agent-tool-policies.json` carries the
   * shipped roster alone, so the generated pre-tool-use guard answers
   * `NO_POLICY` for every agent an install added and refuses its every tool
   * call — a pack that installed cleanly and does nothing.
   */
  agents: PackAgentDeclaration[];
  /**
   * Every MCP server the installed packs supply, sorted by id — the rows the
   * emission and credential seams resolve beside the curated catalog. Empty
   * for a repo whose packs ship no `mcp_servers/` class.
   *
   * SELECTABLE, not selected: a row here only means the id now resolves. What
   * a repo actually emits is still `manifest.mcp.servers`, which only the
   * operator writes.
   */
  mcpServers: PackSuppliedServer[];
  /**
   * One line per installed pack the org trust policy removed from this
   * resolution — empty for the repos that have no policy, which is most of
   * them.
   *
   * Carried on the result rather than logged inside the walk so the surface
   * that renders it decides how: a denied pack is a legitimate state (the
   * policy is working), and a plan that silently contributed nothing was the
   * defect. See {@link discoverInstalledPacksWithPolicy}.
   *
   * Optional on the type so the field stays ADDITIVE — a content set assembled
   * by hand resolved no policy, so it warns about none — and always populated
   * by {@link resolveInstalledPackContent}. Read it as `policyWarnings ?? []`.
   */
  policyWarnings?: string[];
}

/**
 * Resolve the installed pack set into emission inputs: discover packs from
 * the ledger, run the merged corpus+packs walk (which refuses any id clash
 * with existing content), and project pack skills into the shared
 * `.agents/skills/` tree.
 *
 * Pack skill BODIES are projected VERBATIM — no token substitution: the prose
 * the operator previewed and installed is the prose that emits. Emission-time
 * substitution is a corpus affordance (the corpus is authored against this
 * engine's token grammar); pack content is third-party supply whose bodies
 * passed the deny scan as written, and rewriting them post-gate would emit
 * text nobody scanned. The `SKILL.md` HEAD is the one exception, and it is a
 * conformance requirement rather than an affordance — see
 * {@link projectOnePackSkill}.
 *
 * MCP server definitions resolve in the same pass ({@link packMcpServers}) and
 * arrive on `mcpServers`. They are a SEPARATE lane from the catalog walk — no
 * corpus half, no id merge — so the two run concurrently rather than in
 * sequence, and a pack shipping only `mcp_servers/` still resolves even though
 * it contributes no walk root.
 *
 * `corpusRoot` pins the corpus half of the merged walk; production callers
 * leave it absent and get the bundled corpus.
 */
export async function resolveInstalledPackContent(
  rootDir: string,
  manifest: SetupManifest,
  corpusRoot?: string,
): Promise<ResolvedPackContent> {
  const { packs, denied } = await discoverInstalledPacksWithPolicy(rootDir, manifest);
  const packRoots = packContentRoots(packs);
  const policyWarnings = describeDeniedPacks(denied);
  // Surfaced here rather than swallowed: a repo that adopted a policy after
  // installing gets a setup missing that pack's content, and silence about it
  // is the state this filter exists to end. `console.warn` writes to stderr, so a
  // `--format json` invocation's single stdout document is untouched.
  for (const warning of policyWarnings) console.warn(warning);

  // The two reads are independent — the catalog walk covers the four canonical
  // classes, `mcp_servers/` is its own lane — so they run together rather than
  // one behind the other.
  const [mcpServers, canonical] = await Promise.all([
    packMcpServers(packs, rootDir),
    packRoots.length === 0 ? undefined : resolveCanonicalClasses(packRoots, corpusRoot),
  ]);
  if (canonical === undefined) {
    return {
      packs,
      packRoots,
      items: [],
      skillRows: [],
      agents: [],
      mcpServers,
      policyWarnings,
    };
  }
  return { packs, packRoots, ...canonical, mcpServers, policyWarnings };
}

/** The merged corpus+packs walk and the projections it feeds. */
async function resolveCanonicalClasses(
  packRoots: readonly PackContentRoot[],
  corpusRoot: string | undefined,
): Promise<{ items: CatalogItem[]; skillRows: ProjectedFile[]; agents: PackAgentDeclaration[] }> {
  const merged = await buildContentIndex(corpusRoot, { packRoots: [...packRoots] });
  const items = merged.items.filter((item) => item.provenance !== undefined);
  const skillRows = await projectPackSkills(items.filter((item) => item.type === "skill"));
  return { items, skillRows, agents: packAgentDeclarations(items) };
}

/**
 * The pack agents among `items`, as grant declarations.
 *
 * Nothing is read here: the walk already carries each item's frontmatter and
 * its pack's declared footprint (stamped by {@link packContentRoots}), which
 * are precisely the three inputs `../roster/agentGrants.ts` rules on. Deriving
 * the runtime id from the CATALOG id rather than from a fresh filename read
 * matches what the four adapters emit under, so the policy document and the
 * emitted agent files key on the same string — the property that makes the
 * guard's lookup find the row the emission wrote.
 */
function packAgentDeclarations(items: readonly CatalogItem[]): PackAgentDeclaration[] {
  return items
    .filter((item) => item.type === "agent" && item.provenance !== undefined)
    .map((item) => ({
      runtimeId: runtimeAgentId(item.id),
      packId: item.provenance!.pack,
      frontmatter: item.frontmatter,
      declaredTools: grantableFootprint(item.provenance!.declaredTools),
    }));
}

/** Corpus frontmatter ids are bare; the runtime namespace carries the prefix. */
function runtimeAgentId(id: string): string {
  return id.startsWith(CONTENT_PREFIX) ? id : `${CONTENT_PREFIX}${id}`;
}

/**
 * A manifest whose selection also admits the given pack artifacts — the
 * "installed = selected" rule. Only classes the selection already tracks as
 * arrays gain ids: a class ABSENT from the record is unfiltered and admits
 * pack items without help, and inventing the key would silently restrict it.
 * Returns a fresh manifest object; the input is never mutated.
 */
export function selectionWithInstalledPacks(
  manifest: SetupManifest,
  packItems: readonly CatalogItem[],
): SetupManifest {
  const items = { ...manifest.selection.items };
  for (const type of CONTENT_CLASSES) {
    const current = items[type];
    if (!Array.isArray(current)) continue;
    const missing = packItems
      .filter((item) => item.type === type && !current.includes(item.id))
      .map((item) => item.id);
    if (missing.length > 0) items[type] = [...current, ...missing];
  }
  return { ...manifest, selection: { ...manifest.selection, items } };
}

/** The readable file inside a skill directory (`../content/catalog.ts` → `SKILL_FILE`). */
const SKILL_FILE = "SKILL.md";

/** Rows for every pack skill directory, sorted by path. */
async function projectPackSkills(items: readonly CatalogItem[]): Promise<ProjectedFile[]> {
  const perSkill = await Promise.all(items.map((item) => projectOnePackSkill(item)));
  return perSkill.flat().toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * One pack skill's whole directory shape — `SKILL.md` plus any support
 * subtree — as `.agents/skills/<dir>/…` rows. The directory name is preserved
 * as authored so the skill's internal relative links survive, matching the
 * corpus projection's contract.
 *
 * `SKILL.md` takes the core lane's spec-frontmatter projector
 * (`../emit/skillsProjection.ts` → {@link toSpecFrontmatter}); everything else
 * in the directory is byte-verbatim. A pack skill lands in the SAME
 * `.agents/skills/` tree as a corpus skill and is re-targeted into
 * `.claude/skills/` from those same bytes, so it meets the same strict
 * validator — the spec permits six top-level keys and rejects the whole file
 * on any other. Pack `SKILL.md` files are authored in the engine's own
 * vocabulary (`id`, `type`, `tags`), which is precisely the shape that
 * validator refuses, so projecting the head verbatim shipped installed packs
 * that fail packaging on the paths portability is about.
 *
 * This is a shape transform, not a content one: the projector reshapes only
 * keys the pack itself authored (hoisting the non-spec ones under `metadata`,
 * losing none) and synthesizes `name` from the skill's directory, which the
 * catalog and the ingress path already constrained. No text the deny scan did
 * not read is introduced, which is why the head can be reshaped after the gate
 * while the body still cannot. Semantics stay the core lane's — this lane
 * borrows the existing transform and defines nothing of its own.
 */
async function projectOnePackSkill(item: CatalogItem): Promise<ProjectedFile[]> {
  const skillDir = posix.basename(posix.dirname(item.relativePath));
  const sourceDir = dirname(item.filePath);
  const files = await walkRegularFiles(sourceDir, "");

  return Promise.all(
    files.map(async (relative) => {
      assertSafePath(posix.join(skillDir, relative), `pack skill "${item.id}" projection`);
      const raw = await readFile(join(sourceDir, ...relative.split("/")), "utf8");
      const content =
        relative === SKILL_FILE ? toSpecFrontmatter(raw, skillDir, item.relativePath) : raw;
      return {
        path: posix.join(SKILLS_PROJECTION_DIR, skillDir, relative),
        content,
        artifactId: item.id,
        artifactType: "skill" as const,
      };
    }),
  );
}

/**
 * Every regular file under `dir` as POSIX-relative paths, depth-first with
 * codepoint-ordered siblings. Symlinks and other non-regular entries are
 * skipped — nothing outside the installed pack can be pulled in via a link.
 */
async function walkRegularFiles(dir: string, prefix: string): Promise<string[]> {
  const entries = (await readdir(dir, { withFileTypes: true })).toSorted((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  const nested = await Promise.all(
    entries.map((entry) => {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) return walkRegularFiles(join(dir, entry.name), relative);
      return Promise.resolve(entry.isFile() ? [relative] : []);
    }),
  );
  return nested.flat();
}

// ── Hook consumption ───────────────────────────────────────────

/**
 * Every hook definition the installed packs ship, read through the user-hook
 * lane's own strict ingress — the same reader, the same refusal vocabulary,
 * the same "defective entries land in `errors` while healthy ones load"
 * posture. `rootDir` anchors script-existence probes and the repo-relative
 * `sourceFile` provenance, exactly as it does for user hooks.
 *
 * The lane reads `.json` definitions; that is the wired format. Results
 * concatenate in pack order (packs arrive sorted), hooks before errors per
 * pack, so two runs over one repo report identically.
 *
 * The production caller is the emission composer (`../emit/planner.ts` →
 * `buildCoreEmissionPlan`), which passes the result to `planHooksInfra` as
 * `packHooks`: that call is what makes an installed pack's `hooks/` class
 * live rather than inert, so it is load-bearing for the invariant, not a
 * convenience reader.
 */
export async function packHookDefinitions(
  packs: readonly InstalledPack[],
  rootDir: string,
): Promise<ReadHooksResult> {
  const results = await Promise.all(
    packs
      .filter((pack) => pack.classesPresent.includes("hooks"))
      .map((pack) => readHookDefinitions(join(pack.root, "hooks"), rootDir)),
  );
  return {
    hooks: results.flatMap((result) => result.hooks),
    errors: results.flatMap((result) => result.errors),
  };
}

// ── MCP consumption ────────────────────────────────────────────

/**
 * Every MCP server definition the installed packs ship, validated through the
 * same gate the install now runs at ingress ({@link validatePackMcpServer}:
 * exact pin against an exact package name, no shell and no inline-code
 * launcher, no literal credential, a blast-radius statement) and tagged with
 * the pack it came from. The install-side call is `./manifest.ts` →
 * `checkMcpServerDefinitions`, wired into `planPackInstall` as the
 * `mcpServers` gate; before it existed this validator ran here ALONE, so a
 * defective definition installed green and broke every later `sync` and
 * `check` instead of being refused at the door.
 *
 * This is the third seam, and the one that makes `mcp_servers` a live class:
 * the rows returned here are what `../mcp/catalog.ts` → `resolveServerMeta`
 * resolves beside the curated table, so a selected pack id renders in all five
 * client dialects (`../mcp/emit.ts`) and its credentials reach `.env.mcp`
 * (`../mcp/env.ts`). Without it an installed definition would be bytes nothing
 * reads.
 *
 * Trust posture is UNCHANGED by this seam and is not re-litigated in it. A
 * pack's servers rode the same gates its content did — per-file SHA integrity,
 * the trust ladder, org policy allow/deny, the deny scan over every string
 * including `description` and `blastRadius` — at install time. Nothing here
 * re-scans that text, and nothing here selects a server: installing a pack
 * makes its ids RESOLVABLE, and `config mcp add` remains the selection act.
 *
 * Two collisions are refused rather than resolved, because either silent
 * winner would repoint a name at a launcher the operator never chose:
 *
 * - **Cross-pack.** Two installed packs claiming one id — refused naming both
 *   packs. Neither is more authoritative than the other, and pack order is an
 *   install-time accident. Two definitions in ONE pack are a different defect
 *   with a different remedy, refused at ingress by `./manifest.ts` →
 *   `assertUniquePackServerIds` and reported here in its own words rather than
 *   as a phantom second pack ({@link assertNoCrossPackServerIds}).
 * - **Curated.** A pack id the catalog already curates — refused through
 *   {@link assertNoCuratedCollision}, naming the curated row. Ingress refuses
 *   this too (`./manifest.ts` → `readServerId` rejects a curated id per
 *   definition), so reaching it here means the installed bytes were edited
 *   after the install; per this module's "projection reads bytes" contract
 *   that edit IS what projects, so the gate has to stand at the read as well.
 *
 * Reads bytes as they are on disk now, like every other seam here: an
 * operator-edited definition projects as edited, and the drift against the
 * install-time hash is the check command's surface, not a reason to emit a
 * stale row. `rootDir` anchors the repo-relative path defect messages quote,
 * exactly as it does for hook definitions.
 */
export async function packMcpServers(
  packs: readonly InstalledPack[],
  rootDir: string,
): Promise<PackSuppliedServer[]> {
  const repoRoot = resolve(rootDir);
  const perPack = await Promise.all(
    packs
      .filter((pack) => pack.classesPresent.includes("mcp_servers"))
      .map((pack) => readPackServerDir(pack, repoRoot)),
  );

  const servers = perPack.flat().toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  assertNoCrossPackServerIds(servers);
  assertNoCuratedCollision(servers);
  return servers;
}

/**
 * One pack's `mcp_servers/` directory, in file-name order. A directory the
 * ledger claims but the filesystem no longer has contributes nothing rather
 * than throwing: the server then fails to resolve at emission, which is where
 * the failure is legible ("unknown MCP server id" naming `config mcp remove`)
 * instead of here, where it would only say a directory is missing.
 */
async function readPackServerDir(
  pack: InstalledPack,
  repoRoot: string,
): Promise<PackSuppliedServer[]> {
  const dir = join(pack.root, "mcp_servers");
  let listing;
  try {
    listing = await readdir(dir, { withFileTypes: true });
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw new EngineError(`Cannot read ${dir}: ${describeError(cause)}.`, {
      code: "FS_ERROR",
      cause,
    });
  }
  const entries = listing.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return Promise.all(
    entries
      // Symlinks and nested directories are refused at ingress, so anything
      // that is not a plain `.json` file here is not a definition to read.
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const absolute = join(dir, entry.name);
        const relPath = pathRelative(repoRoot, absolute).split(sep).join("/");
        const raw = await readFile(absolute, "utf8");
        return toSuppliedServer(validatePackMcpServer(parseJsonStrict(raw, relPath), relPath), pack.id);
      }),
  );
}

/**
 * A validated definition as the resolution seam's row. Two fields are added
 * rather than read: `firstParty` is fixed `false` (a pack cannot claim to be
 * the vendor of the service it fronts), and `sourcePackId` records which
 * supply chain a preview or a refusal should name.
 *
 * `requiresEnv` is re-shaped, not copied: a pack states a variable's
 * `description`, which becomes the curated row's `comment`, and supplies no
 * issuing URL — that link exists on a curated row because a maintainer checked
 * it, and an unreviewed one has no place in the credential file. The empty
 * string is the shape `../mcp/env.ts` already renders as "no link".
 */
function toSuppliedServer(
  definition: PackMcpServerDefinition,
  sourcePackId: string,
): PackSuppliedServer {
  const { requiresEnv, ...rest } = definition;
  return {
    ...rest,
    ...(requiresEnv === undefined
      ? {}
      : {
          requiresEnv: requiresEnv.map((requirement) => ({
            name: requirement.name,
            comment: requirement.description,
            url: "",
          })),
        }),
    firstParty: false,
    sourcePackId,
  };
}

/**
 * Refuse one id claimed twice across the installed set.
 *
 * Two shapes reach this, and they used to get one message. Within a single
 * pack the ingress gate refuses the pack outright (`./manifest.ts` →
 * `assertUniquePackServerIds`, called by `checkMcpServerDefinitions`), so a
 * same-pack duplicate here means the installed bytes were edited afterwards —
 * and telling that operator to "uninstall one of the packs" named one pack
 * twice and offered a remedy that removes the definition they still want.
 * Each shape now says what actually happened and what to do.
 */
function assertNoCrossPackServerIds(servers: readonly PackSuppliedServer[]): void {
  const byId = new Map<string, string[]>();
  for (const server of servers) {
    byId.set(server.id, [...(byId.get(server.id) ?? []), server.sourcePackId]);
  }

  const contested = [...byId].filter(([, packIds]) => packIds.length > 1);
  if (contested.length === 0) return;

  const sameP = contested.filter(([, packIds]) => new Set(packIds).size === 1);
  if (sameP.length > 0) {
    const listed = sameP
      .map(([id, packIds]) => `${JSON.stringify(id)} (${packIds.length}x in pack ${packIds[0]})`)
      .join("; ");
    throw new EngineError(
      `One installed pack defines the same MCP server id more than once: ${listed}. The id is ` +
        `the key the server is emitted under, so one of its own definitions would silently ` +
        `replace the other. Ingress refuses this shape, so these bytes were edited after the ` +
        `install: restore them by re-installing the pack, or delete the duplicate definition ` +
        `file under its \`mcp_servers/\` directory.`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const duplicates = contested.map(
    ([id, packIds]) => `${JSON.stringify(id)} (packs ${packIds.toSorted().join(", ")})`,
  );
  throw new EngineError(
    `Two installed packs supply the same MCP server id: ${duplicates.join("; ")}. The id is the ` +
      `key the server is emitted under, so one pack's definition would silently launch in place ` +
      `of the other's. Uninstall one of the packs (\`clean --pack <id>\`), or ask its author to ` +
      `rename the server.`,
    { code: "VALIDATION_ERROR" },
  );
}
