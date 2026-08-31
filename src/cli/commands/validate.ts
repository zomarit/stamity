import { readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { ContentIndex, PackContentRoot } from "../../content/catalog.ts";
import type { UserContentOverlay } from "../../content/userContent.ts";
import type { EngineRegistry } from "../../index.ts";
import type { ContentClass } from "../../types/content.ts";
import { EngineError } from "../../types/errors.ts";
import type { SetupManifest } from "../../types/manifest.ts";
import { STATE_DIR } from "../../types/markers.ts";
import { OVERRIDE_EMITTING_CLASSES } from "../engine/emission.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";

/**
 * `stamity validate` — the user-authorable slice, and nothing else.
 *
 * The framework's own content is validated where it is authored, in the
 * framework's CI. What ships to a user is a checker for what the USER can
 * author in their own repo, which is exactly five things:
 *
 * 1. **user content** — the agents, skills, rules and commands under
 *    `<root>/.stamity/overrides/`;
 * 2. **user hooks** — the JSON hook declarations, read from the directory
 *    emission reads: what the manifest configures, else the default one;
 * 3. **learnings** — the curated notes that re-enter agent context later, so
 *    caps, integrity digests and injection screening all bind;
 * 4. **`.env.mcp`** — credential names and shapes, reported as warnings and
 *    only ever masked;
 * 5. **`workspace.json`** — the multi-repo manifest, when one is present.
 *
 * Three properties are deliberate:
 *
 * - **It runs without a manifest.** A user may validate before `init`, or
 *   without ever running it. Sections that need manifest state are skipped with
 *   a printed note rather than failing: absence is an answer, not a defect.
 * - **Every section is isolated.** A section that throws (an unreadable file, a
 *   sealed directory) becomes one error finding naming the path, so one broken
 *   corner never hides the other four sections' results.
 * - **Engine messages pass through verbatim.** Every gate this command drives
 *   already returns field-level, actionable text; re-wording it here would put
 *   a second, staler copy of every rule in the CLI. What the command adds is
 *   grouping, repo-relative paths, and one next-step line.
 *
 * The user-content section reports two things that are not defects at all.
 *
 * SHADOWING. An override takes a bundled artifact's id on purpose, and the
 * command's job is to name the shipped artifact behind it, because the operator
 * who did it by accident — a floor rule renamed into the tree, a copied file
 * that kept its id — has no other surface that would tell them. It names which
 * of the two bodies emits rather than asserting the override's does. All four
 * classes project out of the override tree today, so that answer is uniformly
 * "the override's" — but it is READ from `OVERRIDE_EMITTING_CLASSES`
 * (`../engine/emission.ts`) rather than stated here, because the one class that
 * was ever indexed without being projected (skills) made this surface tell its
 * author an override was live when it was not, which is the same harm as the
 * accident printed by the surface that exists to prevent it. Derivation is what
 * keeps that from recurring silently. Reading the bundled corpus to answer is
 * not a widening of scope: the subject is still the user's file, and nothing
 * bundled is judged.
 *
 * PATCHING. An overlay — `.customize.yaml` over the frontmatter, `.customize.md`
 * appended to the body — states a delta instead of taking the id, so the base
 * keeps flowing from the corpus or the pack that supplies it. That is the third
 * customization outcome and today's two would each describe it wrongly: nothing
 * was replaced, and nothing left the index. A `patched` row names the base, the
 * layer supplying it, and every half applied, and it never moves the exit code.
 * What DOES move the exit code is the merged artifact: the same
 * `checkUserArtifact` gate runs over base-plus-patch, because the text that
 * reaches agent context is neither file on its own — and every walk refusal an
 * overlay can cause becomes a finding here, since an overlay file meets no other
 * gate in this command.
 *
 * Non-mutating: no `--dry-run`, nothing written, nothing created to find out
 * that it is absent. Exit 1 iff a finding is an error; warnings alone exit 0 —
 * and a shadow is neither, so it never moves the exit code.
 */

/** One defect, attributed to the section that found it. */
export interface ValidateFinding {
  source: "user-content" | "user-hooks" | "learnings" | "env-mcp" | "workspace";
  /** Repo-relative POSIX path of the file the finding is about. */
  path: string;
  severity: "error" | "warning";
  message: string;
}

type ValidateSource = ValidateFinding["source"];

/**
 * One customization outcome, discriminated by `outcome`. Information, never a
 * finding — a customized id is this lane working, whichever shape it took.
 *
 * Two shapes, and exactly one of them applies to any `(class, id)`: an artifact
 * is either REPLACED by a full override or PATCHED by an overlay. The engine
 * refuses a tree that claims both, so the discriminator is a fact about the
 * repo rather than a preference of this report.
 */
export type ValidateShadow = ValidateReplaced | ValidatePatched;

/** One bundled identity a user artifact took over. */
interface ValidateReplaced {
  outcome: "replaced";
  /** Class of the contested identity. */
  type: ContentClass;
  /** The catalog id both layers claim. */
  id: string;
  /** Repo-relative POSIX path of the user artifact that holds it now. */
  path: string;
  /**
   * Content-root-relative paths of every shipped artifact the id was taken
   * from. They stop being emitted when `emits` is true; when it is false they
   * are still what emits.
   */
  replaced: string[];
  /**
   * Whether taking the id also took over EMISSION: true for the classes in
   * `OVERRIDE_EMITTING_CLASSES` (`../engine/emission.ts`), which is every
   * content class today — `skill` was the last exception, and its per-client
   * projection now reads the override half too.
   *
   * Uniformly true is not the same as constant, which is why the field stays. It
   * is derived from that list on every run, so a class that ever stops
   * projecting reports `false` here instead of this surface quietly claiming a
   * replacement that never happened — the exact defect the skills gap produced
   * while it was open. A machine-readable field rather than wording alone, so a
   * CI consumer can act on the difference the human line describes.
   */
  emits: boolean;
}

/**
 * One shipped identity an overlay PATCHES — the third outcome, and the one
 * today's two would each have described wrongly: nothing was replaced, and
 * nothing left the index. The patched item IS the item, emitted under the base's
 * identity, which is why the ledger needs no vocabulary for it either.
 */
interface ValidatePatched {
  outcome: "patched";
  /** Class of the patched artifact. */
  type: ContentClass;
  /** The catalog id the overlay is addressed by. */
  id: string;
  /** Content-root-relative path of the BASE — the file that still supplies the body. */
  base: string;
  /** Layer the base came from: `corpus`, or the id of the pack that supplies it. */
  origin: string;
  /** Repo-relative POSIX paths of the halves applied, frontmatter half first. */
  overlays: string[];
  /**
   * Whether the merged body reaches emission, from the same
   * `OVERRIDE_EMITTING_CLASSES` derivation the replaced row uses. A patch rides
   * on the base's own artifact, so it is true wherever the class emits at all —
   * derived rather than asserted, for the reason the sibling field is.
   */
  emits: boolean;
}

/**
 * The learnings subtree of the state directory. The store keeps its own copy of
 * this join private, so the one place a user-facing checker can name the
 * directory is here; an exported `learningsDir(rootDir)` on the store would
 * collapse the two.
 */
const LEARNINGS_DIR = "learnings";

/**
 * Where user hooks live when the manifest does not say.
 *
 * Mirrors `src/emit/hooksInfra.ts::DEFAULT_USER_HOOKS_DIR`, which is private to
 * that module: emission reads `manifest.hooks?.userHooksDir ?? <this>`, so
 * reading an UNSET key here as "no hooks configured" pointed this section at
 * nothing on exactly the layout the docs call the default — a rejected hook in
 * `.stamity/hooks/` was live to emission and invisible to the checker whose job
 * is to surface it. POSIX-spelled, matching the source: it is a repo-relative
 * display path, and `resolve()` reads forward slashes on every platform.
 *
 * Mirrored rather than imported so this command keeps its one-way dependency on
 * the engine's public surface; the parity is asserted in
 * `test/cli/commands/validate.test.ts`, which drives emission and this section
 * over the same unconfigured repo and requires both to read the same directory.
 */
const DEFAULT_USER_HOOKS_DIR = `${STATE_DIR}/hooks`;

/** One section's outcome: what it found, and what it looked at to find it. */
interface SectionReport {
  readonly source: ValidateSource;
  readonly findings: readonly ValidateFinding[];
  /** Units actually read. Zero means the section had nothing to look at. */
  readonly inspected: number;
  /** What was read, for the honest empty verdict. Set only when `inspected > 0`. */
  readonly summary?: string;
  /** Why the section did not run. Printed as a note — never as a finding. */
  readonly note?: string;
  /** Bundled identities this section's artifacts took over. Empty unless any did. */
  readonly shadows?: readonly ValidateShadow[];
}

interface ValidateReport {
  readonly sections: readonly SectionReport[];
  readonly findings: readonly ValidateFinding[];
  readonly errorCount: number;
  readonly warningCount: number;
  /** Units inspected across every section. Zero is the honest empty case. */
  readonly inspected: number;
  /** Every shadowed identity, across sections. Empty for a repo with no overrides. */
  readonly shadows: readonly ValidateShadow[];
}

/**
 * Every finding the user-authorable slice produces, in section order.
 *
 * Exported as the reusable collector: `check` and any future tooling drive the
 * same pass rather than re-deriving which files a user is allowed to author.
 */
export async function collectValidateFindings(
  rootDir: string,
  engine: EngineRegistry,
): Promise<ValidateFinding[]> {
  const report = await collectReport(rootDir, engine);
  return [...report.findings];
}

/**
 * The full pass, sections included — the command's own view, since the printed
 * notes and the "what was checked" summary are not findings.
 *
 * The five sections are independent reads issued together; the fixed
 * destructuring order below is what makes the report deterministic, not
 * whichever read finished first.
 */
async function collectReport(rootDir: string, engine: EngineRegistry): Promise<ValidateReport> {
  const state = await readManifestState(rootDir, engine);
  const hooksDir = configuredUserHooksDir(state.manifest);

  const sections = await Promise.all([
    guarded(
      "user-content",
      rootDir,
      repoPath(rootDir, engine.content.userContent.userContentRoot(rootDir)),
      () => collectUserContent(rootDir, engine, state.manifest),
    ),
    guarded("user-hooks", rootDir, hooksDir, () => collectUserHooks(rootDir, engine, state)),
    guarded("learnings", rootDir, join(STATE_DIR, LEARNINGS_DIR), () =>
      collectLearnings(rootDir, engine, state.manifest),
    ),
    guarded("env-mcp", rootDir, engine.mcp.env.ENV_MCP_FILE, () => collectEnvMcp(rootDir, engine)),
    guarded("workspace", rootDir, engine.workspace.model.WORKSPACE_MANIFEST_FILE, () =>
      collectWorkspace(rootDir, engine),
    ),
  ]);

  const findings = sections.flatMap((current) => [...current.findings]);
  return {
    sections,
    findings,
    errorCount: findings.filter(isError).length,
    warningCount: findings.filter((row) => !isError(row)).length,
    inspected: sections.reduce((total, current) => total + current.inspected, 0),
    shadows: sections.flatMap((current) => current.shadows ?? []),
  };
}

// ── Sections ───────────────────────────────────────────────────────────────

/**
 * The repo's own agents, skills, rules and commands.
 *
 * `checkUserArtifact` is the whole per-artifact judgement — required
 * frontmatter, id/filename agreement, the lifecycle declarations, the deny scan
 * over frontmatter and body, filler phrasing, the class's lean line threshold —
 * and it is the SAME call the save path makes, so this command cannot report a
 * defect the engine would have let land, or miss one it would have refused.
 * Re-running any of its constituent gates here would double-report their
 * findings and re-open exactly the divergence single-sourcing closed.
 *
 * Three things are reported that the per-artifact gate cannot see, because none
 * of them is a fact about the artifact FILE:
 *
 * - **Skipped entries.** A symlink in the override tree is passed over by every
 *   walk that reads it, so the artifact an author believes is live is not. It
 *   is a warning, not an error: nothing is broken, but the author's expectation
 *   is wrong and only this command can say so.
 * - **Skill support files.** A skill override projects WHOLE — `SKILL.md` plus
 *   every regular file beside it, byte-verbatim, into each client's skills tree
 *   on every sync — so a hand-placed `references/*.md` reaches agent context on
 *   the same terms the body does. The save path writes only `SKILL.md`, which
 *   makes those files hand-placed by construction and this command the only gate
 *   that ever reads them; a block-severity hit is an error here for exactly the
 *   reason it is one in the body. The finding names the file and the pattern id
 *   and never the matched span, which the deny scanner redacts at source.
 * - **Customization.** Which bundled artifact each override replaced and which
 *   each overlay patched, read from the merged catalog. Informational — see the
 *   module header.
 * - **Overlays.** A `.customize.yaml`/`.customize.md` pair is not an artifact
 *   and meets no gate above: the artifact walk excludes both halves by name, so
 *   this section is where the MERGED artifact — base frontmatter patched, base
 *   body appended to — goes through `checkUserArtifact` whole, and where the
 *   walk's own refusals (an orphan, an identity key, a fence, an overlay beside
 *   a full override) become findings the author can act on.
 */
async function collectUserContent(
  rootDir: string,
  engine: EngineRegistry,
  manifest: SetupManifest | null,
): Promise<SectionReport> {
  const { userContent } = engine.content;
  // Four disjoint walks of one small tree, plus the per-artifact judgements.
  const [artifacts, skipped, support, overlays] = await Promise.all([
    userContent.discoverUserContent(rootDir),
    userContent.discoverSkippedUserEntries(rootDir),
    userContent.scanUserSkillSupportFiles(rootDir),
    userContent.discoverUserOverlays(rootDir),
  ]);
  const judged = await Promise.all(
    artifacts.map(async (artifact) => ({
      artifact,
      check: await userContent.checkUserArtifact(artifact),
    })),
  );

  // One catalog walk answers both halves of the customization report: what each
  // override replaced, and what each overlay patched. It is run only when the
  // tree holds something customizing, so the ordinary repo never pays for
  // reading the bundled corpus.
  const customization =
    artifacts.length === 0 && overlays.length === 0
      ? EMPTY_SHADOWS
      : await collectCustomization(rootDir, engine, manifest, overlays);

  const findings = [
    ...judged.flatMap(({ artifact, check }) =>
      [...check.errors, ...check.warnings].map((violation) => ({
        source: "user-content" as const,
        path: repoPath(rootDir, artifact.filePath),
        severity: violation.severity,
        message: violation.detail,
      })),
    ),
    ...[...skipped, ...support.skipped].map((entry) =>
      finding("user-content", repoPath(rootDir, entry.filePath), "warning", entry.reason),
    ),
    ...support.findings.map((row) =>
      finding("user-content", repoPath(rootDir, row.filePath), row.severity, row.detail),
    ),
    ...customization.findings,
  ];

  // Skipped entries count as inspected: the command looked at them, and a
  // section reporting a warning while claiming to have read nothing reads as a
  // finding about thin air. Support files are counted under their own noun
  // rather than folded into the artifact total — a skill with four reference
  // files is one artifact, and calling it five would misreport what the
  // override tree holds.
  const artifactUnits = artifacts.length + skipped.length;
  const supportUnits = support.inspected + support.skipped.length;
  // Overlays count under their own noun: a pair is one patch however many halves
  // it has, and calling it an artifact would misreport what the tree holds — the
  // artifact it patches is not in this tree at all.
  const overlayUnits = overlays.length;
  const summary = [
    ...(artifactUnits > 0 ? [plural(artifactUnits, "artifact")] : []),
    ...(overlayUnits > 0 ? [plural(overlayUnits, "overlay")] : []),
    ...(supportUnits > 0 ? [plural(supportUnits, "skill support file")] : []),
  ].join(" and ");
  return {
    ...section("user-content", findings, artifactUnits + overlayUnits + supportUnits, summary),
    ...(customization.note === undefined ? {} : { note: customization.note }),
    shadows: customization.shadows,
  };
}

/** The no-customization answer, allocated once: nothing walked, nothing changed. */
const EMPTY_SHADOWS: CustomizationScan = { shadows: [], findings: [] };

interface CustomizationScan {
  readonly shadows: readonly ValidateShadow[];
  /** Findings the merged artifacts and the overlay refusals produced. */
  readonly findings: readonly ValidateFinding[];
  /** Why the scan could not answer. Printed as a note — never as a finding. */
  readonly note?: string;
}

/**
 * What the repo customizes, from one merged catalog walk: the identities the
 * override tree took over, the identities an overlay patched, and the judgement
 * of every merged artifact.
 *
 * The walk is what makes the overlay half possible without a second
 * implementation of anything. It resolves the base, applies the pair, composes
 * the merged document and runs it back through the item builder — so what comes
 * out of `byKey` at a patched id IS the artifact the next `sync` emits, and this
 * command's job is to read it rather than to re-derive it.
 *
 * Two failure postures, split by whose file the failure is about:
 *
 * - A walk failure naming an OVERLAY file is an error finding against that file.
 *   An overlay meets no other gate in this command — the artifact walk excludes
 *   both halves by name — so degrading it to a note would leave the author with
 *   an exit 0 over a tree that stops the next sync.
 * - Anything else degrades to a note, unchanged. The catalog refuses a malformed
 *   override artifact with a `VALIDATION_ERROR` naming the file, and the
 *   per-artifact gate has already reported that same file in better terms;
 *   turning the walk's failure into a second finding would double-report the
 *   defect, and letting it escape would replace the section's real findings with
 *   one message about an index.
 */
async function collectCustomization(
  rootDir: string,
  engine: EngineRegistry,
  manifest: SetupManifest | null,
  overlays: readonly UserContentOverlay[],
): Promise<CustomizationScan> {
  const { catalog, userContent } = engine.content;
  const packRoots = await installedPackRoots(rootDir, engine, manifest);
  try {
    const index = await catalog.buildContentIndex({
      overrideRoot: userContent.userContentRoot(rootDir),
      packRoots,
    });
    const patched = await Promise.all(
      overlays.map((overlay) => judgePatched(rootDir, engine, index, overlay)),
    );
    return {
      shadows: [
        ...(index.shadows ?? []).map((shadow) => ({
          outcome: "replaced" as const,
          type: shadow.type,
          id: shadow.id,
          path: repoPath(rootDir, shadow.winner.filePath),
          replaced: shadow.shadowed.map((item) => item.relativePath),
          emits: OVERRIDE_EMITTING_CLASSES.includes(shadow.type),
        })),
        ...patched.flatMap((result) => result.rows),
      ],
      findings: patched.flatMap((result) => result.findings),
    };
  } catch (cause) {
    const named = overlayFailure(rootDir, overlays, cause);
    if (named !== undefined) return { shadows: [], findings: [named] };
    return {
      shadows: [],
      findings: [],
      note:
        `could not report what these overrides replace until the tree indexes: ` +
        `${messageOf(cause)}`,
    };
  }
}

/**
 * The walk's refusal as a finding against the overlay file it names, or
 * `undefined` when no overlay is implicated.
 *
 * Attribution is by PATH rather than by parsing the message: every overlay
 * refusal names the absolute path of at least one half — that is the engine's
 * own fail-closed contract, and the merged-artifact refusals carry a composite
 * label naming the base and every half applied. The message then passes through
 * verbatim, so the field it names is the field the author reads.
 */
function overlayFailure(
  rootDir: string,
  overlays: readonly UserContentOverlay[],
  cause: unknown,
): ValidateFinding | undefined {
  const message = messageOf(cause);
  const named = overlays
    .flatMap(halfPaths)
    .find((path) => message.includes(path));
  return named === undefined
    ? undefined
    : finding("user-content", repoPath(rootDir, named), "error", message);
}

/** Absolute paths of one pair's halves, frontmatter half first. */
function halfPaths(overlay: UserContentOverlay): string[] {
  return [overlay.frontmatterPath, overlay.bodyPath].filter(
    (path): path is string => path !== undefined,
  );
}

/**
 * One overlay pair: its report row, and every finding the MERGED artifact earns.
 *
 * The merged item is read out of the index rather than rebuilt — it is what the
 * walk already produced for that id, keeping the base's file, origin and
 * provenance — and it goes through `checkUserArtifact` whole: required
 * frontmatter, the lifecycle declarations, the deny scan over frontmatter and
 * body, filler phrasing, the class's lean line threshold. One gate, the same one
 * the save path runs, so this command cannot report a defect the engine would
 * have let land or miss one it would have refused.
 *
 * Findings are addressed to the half that plausibly carries the text: body-judged
 * kinds to the `.customize.md`, everything else to the `.customize.yaml`, each
 * falling back to the other when the pair has only one half. The pair is two
 * files describing one patch, sitting beside each other under one slug, so the
 * address is a starting point and the message is what names the field.
 */
async function judgePatched(
  rootDir: string,
  engine: EngineRegistry,
  index: ContentIndex,
  overlay: UserContentOverlay,
): Promise<{ rows: ValidatePatched[]; findings: ValidateFinding[] }> {
  const { catalog, userContent } = engine.content;
  const id = catalog.applyCommandPrefix(overlay.slug, overlay.type);
  const item = index.byKey.get(catalog.typeIdKey(overlay.type, id));
  // Unreachable through the walk, which refuses an orphan outright; carried so a
  // future walk that reported one instead of throwing cannot crash this report.
  if (item === undefined) return { rows: [], findings: [] };

  const check = await userContent.checkUserArtifact({
    type: overlay.type,
    id: item.id,
    filePath: item.filePath,
    frontmatter: item.frontmatter,
    body: item.body,
    // The merged artifact sits on its BASE's file, whose name carries the engine
    // prefix its id does not. Its identity is the base's by construction — an
    // overlay may not move `id` or `type` — and a base whose declared id
    // disagrees with its own filename is the walk's finding, in its own terms.
    fileSlug: item.id,
  });

  const findings = [...check.errors, ...check.warnings].map((violation) =>
    finding(
      "user-content",
      repoPath(rootDir, addressOf(overlay, violation.kind)),
      violation.severity,
      violation.detail,
    ),
  );

  return {
    rows: [
      {
        outcome: "patched",
        type: overlay.type,
        id: item.id,
        base: item.relativePath,
        origin: item.provenance?.pack ?? catalog.originOf(item),
        overlays: halfPaths(overlay).map((path) => repoPath(rootDir, path)),
        emits: OVERRIDE_EMITTING_CLASSES.includes(overlay.type),
      },
    ],
    findings: [...findings, ...cappedBody(rootDir, engine, overlay)],
  };
}

/** Violation kinds the body half is the plausible author of. */
const BODY_JUDGED_KINDS: ReadonlySet<string> = new Set([
  "anti-slop",
  "lean-lines",
  "deny-pattern",
]);

/** The half a finding is addressed to; either half stands in for an absent one. */
function addressOf(overlay: UserContentOverlay, kind: string): string {
  const [preferred, fallback] = BODY_JUDGED_KINDS.has(kind)
    ? [overlay.bodyPath, overlay.frontmatterPath]
    : [overlay.frontmatterPath, overlay.bodyPath];
  // One of the two is always present: a pair with neither half is not discovered.
  return preferred ?? (fallback as string);
}

/**
 * The user-content ceiling over the body half, as one finding or none.
 *
 * An overlay body is user-authored text that re-enters agent context on every
 * run, which is exactly what `MAX_USER_CONTENT_LENGTH` bounds
 * (`../../guard/promptGuard.ts`) — a body past it is truncated where it is read
 * rather than emitted whole, so the patch the author sees on disk is not the
 * patch the client gets. Read from the constant rather than restated, so the
 * number moves in one place.
 */
function cappedBody(
  rootDir: string,
  engine: EngineRegistry,
  overlay: UserContentOverlay,
): ValidateFinding[] {
  const cap = engine.guard.promptGuard.MAX_USER_CONTENT_LENGTH;
  if (overlay.bodyPath === undefined || (overlay.bodyLength ?? 0) <= cap) return [];
  return [
    finding(
      "user-content",
      repoPath(rootDir, overlay.bodyPath),
      "error",
      `body patch is ${overlay.bodyLength} characters, over the ${cap}-character ceiling on ` +
        `user-authored content — text past it is truncated where the artifact re-enters agent ` +
        `context, so split the patch or move the material into a skill support file`,
    ),
  ];
}

/**
 * Walk roots for the installed packs, or none.
 *
 * Read because a pack is a layer an overlay can legitimately be addressed at: a
 * pack supplies the id, the overlay patches the item in force, and an index
 * built without those roots would call that patch an orphan and refuse a repo
 * that is correctly configured. It also lets a shadow row name a pack artifact
 * an override replaced, which this section could not answer before.
 *
 * Total: a repo with no manifest has no installed packs by construction, and a
 * pack state this reader refuses (a directory pruned by hand) degrades to no
 * pack roots rather than to a failed section — the sync path is where that
 * refusal belongs, and it names the file there.
 */
async function installedPackRoots(
  rootDir: string,
  engine: EngineRegistry,
  manifest: SetupManifest | null,
): Promise<PackContentRoot[]> {
  if (manifest === null) return [];
  try {
    const packs = await engine.pack.projection.discoverInstalledPacks(rootDir, manifest);
    return engine.pack.projection.packContentRoots(packs);
  } catch {
    return [];
  }
}

/**
 * The repo-relative directory user hooks are read from: what the manifest
 * configures, else the default emission falls back to. A key set to whitespace
 * is treated as unset rather than as a path — `resolve(root, "  ")` would
 * otherwise point the section at the repo root.
 *
 * Total, including for a repo with no manifest: the section reports that case
 * as its own note, and `collectReport` still needs a path to attribute a
 * section-level failure to.
 */
function configuredUserHooksDir(manifest: SetupManifest | null): string {
  const configured = manifest?.hooks?.userHooksDir?.trim();
  return configured === undefined || configured === "" ? DEFAULT_USER_HOOKS_DIR : configured;
}

/**
 * User hook declarations, from the directory emission reads.
 *
 * An UNSET `hooks.userHooksDir` is not "no hooks" — it is the DEFAULT hooks
 * directory ({@link DEFAULT_USER_HOOKS_DIR}), which is what `planHooksInfra`
 * resolves it to and therefore what a user's hooks are wired from. Reading
 * unset as "nothing configured" made this section skip the documented default
 * layout: a malformed or rejected hook in `.stamity/hooks/` was live to emission
 * and reported by nothing, on the one arrangement most repos have.
 *
 * Two manifest states are still not defects: no manifest at all, and no hooks
 * directory on disk. Both are notes rather than findings — the first because a
 * user may validate before `init`, the second because "this repo has no hooks"
 * is the ordinary state and the note says which path was looked for. A manifest
 * that cannot be READ is an error: it is the state this section needs, and
 * skipping it silently would look identical to a repo with no hooks.
 */
async function collectUserHooks(
  rootDir: string,
  engine: EngineRegistry,
  state: ManifestState,
): Promise<SectionReport> {
  const manifestFile = repoPath(rootDir, engine.manifest.manifest.manifestPath(rootDir));
  if (state.failure !== undefined) {
    return section("user-hooks", [finding("user-hooks", manifestFile, "error", state.failure)], 0);
  }
  if (state.manifest === null) {
    return {
      source: "user-hooks",
      findings: [],
      inspected: 0,
      note: `skipped — this repo has no ${manifestFile}, so nothing emits hooks from it yet`,
    };
  }

  const configured = configuredUserHooksDir(state.manifest);
  const hooksDir = resolve(rootDir, configured);
  // The root is passed, not inferred: `userHooksDir` may name any repo-relative
  // directory, and the reader anchors containment, script-existence and the
  // `file` provenance on it — so the reported path is already repo-relative.
  const { hooks, errors } = await engine.hooks.userHooks.readHookDefinitions(hooksDir, rootDir);
  const findings = errors.map((error) => finding("user-hooks", error.file, "error", error.message));
  const inspected = hooks.length + errors.length;
  if (inspected === 0 && !(await isDirectory(hooksDir))) {
    // `readHookDefinitions` answers an absent directory and an empty one the
    // same way, so the "not configured" note is earned by a stat rather than
    // inferred from a zero count — an existing directory holding zero hook
    // files is a repo that HAS the location and no declarations in it.
    return {
      source: "user-hooks",
      findings: [],
      inspected: 0,
      note:
        `skipped — this repo has no ${configured}/ directory` +
        `${configured === DEFAULT_USER_HOOKS_DIR ? " (the default hooks location)" : ""}, ` +
        `so there are no hook declarations to check`,
    };
  }
  return section("user-hooks", findings, inspected, plural(inspected, "hook"));
}

/**
 * The learnings directory: caps, frontmatter, required sections, injection
 * screening and integrity digests, all through the engine's directory pass.
 *
 * Over-cap files are warnings rather than errors — they are valid notes that
 * simply will not load, and the fix is curation, not repair.
 */
async function collectLearnings(
  rootDir: string,
  engine: EngineRegistry,
  manifest: SetupManifest | null,
): Promise<SectionReport> {
  const { validation } = engine.learnings;
  const dir = join(rootDir, STATE_DIR, LEARNINGS_DIR);
  const caps = validation.resolveLearningsCaps(manifest?.learnings?.maxCount);
  const result = await validation.validateLearningsDirectory(dir, caps);

  const findings = [
    ...result.invalid.flatMap((entry) =>
      entry.errors.map((message) =>
        finding("learnings", repoPath(rootDir, join(dir, entry.file)), "error", message),
      ),
    ),
    ...result.overCap.map((file) =>
      finding(
        "learnings",
        repoPath(rootDir, join(dir, file)),
        "warning",
        `past the ${caps.maxCount}-file cap, so it was not validated and will not load — ` +
          `retire an older learning, or raise learnings.maxCount in the manifest`,
      ),
    ),
  ];
  const inspected = result.valid.length + result.invalid.length + result.overCap.length;
  return section("learnings", findings, inspected, plural(inspected, "learning"));
}

/**
 * `.env.mcp`, when the repo has one. Warnings only, by design: the file is
 * gitignored and holding live credentials is its whole job, so a secret-shaped
 * value there is expected rather than a defect. What is worth saying is which
 * name carries which credential shape (a value under a name that does not match
 * it is usually a paste into the wrong line) and which names are still empty.
 *
 * Values never reach the terminal: findings quote the engine's masked rendering.
 */
async function collectEnvMcp(rootDir: string, engine: EngineRegistry): Promise<SectionReport> {
  const file = engine.mcp.env.ENV_MCP_FILE;
  const raw = await readIfPresent(join(rootDir, file));
  if (raw === null) return section("env-mcp", [], 0);

  const values = engine.mcp.env.parseEnvFile(raw);
  const detected = engine.mcp.secretScan.detectSecrets(values);
  const reported = engine.mcp.env.reportEnvValues(values);

  const findings = [
    ...detected.findings.map((secret) =>
      finding(
        "env-mcp",
        file,
        "warning",
        `${secret.varName ?? "(value)"} holds a literal matching \`${secret.patternId}\` ` +
          `(${secret.maskedValue}) — expected in this gitignored file; check it is the ` +
          `credential that name is meant to carry, and never inline it into a client config`,
      ),
    ),
    ...reported
      .filter((value) => !value.set)
      .map((value) =>
        finding(
          "env-mcp",
          file,
          "warning",
          `${value.name} has no value — fill it in, or drop the line if no selected server ` +
            `needs it; a server whose credential is blank fails at start-up`,
        ),
      ),
  ];
  // One unit inspected: the file. Its variables are what is inside it, and a
  // file that parses to none is still a file this command read.
  return section("env-mcp", findings, 1, file);
}

/**
 * `workspace.json`, when the repo has one. Independent of the setup manifest:
 * a workspace root is frequently not itself an initialised repo, so its
 * findings are collected whether or not `.stamity/manifest.json` exists.
 */
async function collectWorkspace(rootDir: string, engine: EngineRegistry): Promise<SectionReport> {
  const file = engine.workspace.model.WORKSPACE_MANIFEST_FILE;
  const raw = await readIfPresent(join(rootDir, file));
  if (raw === null) return section("workspace", [], 0);

  let document: unknown;
  try {
    document = engine.config.parse.parseJsonStrict(raw, file);
  } catch (cause) {
    return section("workspace", [finding("workspace", file, "error", messageOf(cause))], 1, file);
  }

  const findings = engine.workspace.manifest
    .collectWorkspaceManifestErrors(document)
    .map((message) => finding("workspace", file, "error", message));
  return section("workspace", findings, 1, file);
}

// ── Manifest state ─────────────────────────────────────────────────────────

interface ManifestState {
  readonly manifest: SetupManifest | null;
  /** The engine's message when the manifest exists but cannot be read. */
  readonly failure?: string;
}

/**
 * Read the manifest once for every section that needs it. A defective manifest
 * is carried as a message rather than thrown: it disables one section, and the
 * other four still have work to do.
 */
async function readManifestState(
  rootDir: string,
  engine: EngineRegistry,
): Promise<ManifestState> {
  try {
    return { manifest: await engine.manifest.manifest.readManifest(rootDir) };
  } catch (cause) {
    return { manifest: null, failure: messageOf(cause) };
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────

function renderReport(ctx: CliContext, report: ValidateReport): void {
  const { palette } = ctx;

  for (const current of report.sections) {
    if (current.findings.length === 0) continue;
    const errors = current.findings.filter(isError).length;
    const warnings = current.findings.length - errors;
    ctx.io.out(
      `${palette.bold(current.source)} — ${plural(errors, "error")}, ` +
        `${plural(warnings, "warning")}\n`,
    );
    for (const row of current.findings) {
      const label =
        row.severity === "error" ? palette.red("error  ") : palette.yellow("warning");
      ctx.io.out(`  ${label}  ${palette.dim(row.path)}  ${row.message}\n`);
    }
    ctx.io.out("\n");
  }

  renderShadows(ctx, report.shadows);

  for (const current of report.sections) {
    if (current.note !== undefined) {
      ctx.io.out(palette.dim(`note: ${current.source} ${current.note}\n`));
    }
  }

  if (report.findings.length === 0) {
    const checked = report.sections
      .map((current) => current.summary)
      .filter((summary): summary is string => summary !== undefined);
    ctx.io.out(
      checked.length === 0
        ? `${palette.green("nothing user-authored to validate")} — ok\n`
        : `${palette.green("ok")} — checked ${checked.join(", ")}, no findings\n`,
    );
    return;
  }

  const sourceCount = report.sections.filter((current) => current.findings.length > 0).length;
  const verdict =
    `${plural(report.errorCount, "error")}, ${plural(report.warningCount, "warning")} ` +
    `across ${plural(sourceCount, "section")}`;
  ctx.io.out(`${report.errorCount > 0 ? palette.red(verdict) : palette.yellow(verdict)}\n`);
  ctx.io.out("next: fix the findings above, then re-run stamity validate\n");
}

/**
 * The shadowing block: one line per customized identity, in the vocabulary of
 * what was done to it. An override REPLACES, naming what it replaced — or, for a
 * class the override layer does not reach at emission, naming what it did NOT
 * replace. An overlay PATCHES, naming the base still supplying the body, which
 * layer supplies it, and every half applied. Nothing is printed for a repo that
 * customizes nothing — an empty section header would read as a defect class the
 * repo has, rather than as one it does not.
 *
 * The header sentence is composed from the two counts rather than stated once
 * for the block. A patch takes no id and replaces nothing, so a single sentence
 * covering both would be false of one of them — which is exactly how this
 * surface came to assert the opposite of the mechanism for skills.
 */
function renderShadows(ctx: CliContext, shadows: readonly ValidateShadow[]): void {
  if (shadows.length === 0) return;
  const { palette } = ctx;

  const replaced = shadows.filter((row) => row.outcome === "replaced").length;
  const patched = shadows.length - replaced;
  const clauses = [
    ...(replaced > 0
      ? [`${plural(replaced, "override")} ${replaced === 1 ? "takes" : "take"} a bundled id`]
      : []),
    ...(patched > 0
      ? [
          `${plural(patched, "overlay")} ${patched === 1 ? "patches" : "patch"} ` +
            // "one" only where the clause before it already said what: a patched
            // row standing alone has to name the thing it patches.
            `${replaced > 0 ? "one" : "a bundled id"}`,
        ]
      : []),
  ];
  ctx.io.out(`${palette.bold("shadowing")} — ${clauses.join(", ")}\n\n`);

  for (const row of shadows) {
    const [path, outcome] =
      row.outcome === "replaced"
        ? [
            row.path,
            row.emits
              ? `replaces ${row.replaced.join(", ")}`
              : `takes the id of ${row.replaced.join(", ")} — not emitted, ` +
                `the bundled ${row.type} body is still what ships`,
          ]
        : [
            row.overlays.join(", "),
            row.emits
              ? `patches ${row.base} (${row.origin})`
              : `patches ${row.base} (${row.origin}) — not emitted, the bundled ` +
                `${row.type} body is still what ships`,
          ];
    ctx.io.out(`  ${row.type} ${palette.bold(row.id)}  ${palette.dim(path)}  ${outcome}\n`);
  }
  ctx.io.out("\n");
}

// ── Helpers ────────────────────────────────────────────────────────────────

function finding(
  source: ValidateSource,
  path: string,
  severity: ValidateFinding["severity"],
  message: string,
): ValidateFinding {
  return { source, path, severity, message };
}

function section(
  source: ValidateSource,
  findings: readonly ValidateFinding[],
  inspected: number,
  summary?: string,
): SectionReport {
  return {
    source,
    findings,
    inspected,
    ...(inspected > 0 && summary !== undefined ? { summary } : {}),
  };
}

/**
 * Run one section, converting anything it throws into a single error finding
 * for that section. An unreadable artifact names its own path (the errno
 * carries it), so the user is told which file to fix rather than watching the
 * whole command die on it.
 */
async function guarded(
  source: ValidateSource,
  rootDir: string,
  fallbackPath: string,
  run: () => Promise<SectionReport>,
): Promise<SectionReport> {
  try {
    return await run();
  } catch (cause) {
    const errno = cause as NodeJS.ErrnoException | null;
    const at = typeof errno?.path === "string" ? repoPath(rootDir, errno.path) : fallbackPath;
    return section(source, [finding(source, at, "error", failureMessage(cause, errno, at))], 0);
  }
}

/**
 * A thrown section failure as one finding message. A typed engine failure
 * already states its own fix and passes through; a raw errno is re-stated
 * against the repo-relative path, since its own message quotes the absolute one.
 */
function failureMessage(cause: unknown, errno: NodeJS.ErrnoException | null, at: string): string {
  if (cause instanceof EngineError) return cause.message;
  if (typeof errno?.code === "string") {
    const syscall = typeof errno.syscall === "string" ? ` (${errno.syscall})` : "";
    return (
      `cannot read ${at}: ${errno.code}${syscall}. ` +
      `Fix the path's permissions, or remove it, then re-run.`
    );
  }
  return `cannot read ${at}: ${messageOf(cause)}`;
}

/**
 * Whether `path` is a directory that exists. Anything else — absent, a file, a
 * dangling link — is `false`: the caller is deciding between "there is nothing
 * here to check" and "there is", and each of those answers the first way.
 *
 * An unreadable directory never reaches here: the hooks reader throws
 * `FS_ERROR` on any listing failure that is not ENOENT, so `guarded` has
 * already turned it into a finding naming the path.
 */
async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** File text, or `null` when there is no readable file at `path`. */
async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException | null)?.code;
    // Absence in every form. Anything else — a permission failure, an I/O
    // error — is real, and the section guard reports it against this path.
    if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") return null;
    throw cause;
  }
}

/** Repo-relative POSIX form of an absolute path, so output never leaks a machine layout. */
function repoPath(rootDir: string, absolute: string): string {
  const rel = relative(rootDir, absolute);
  if (rel === "") return ".";
  return rel.split(sep).join("/");
}

function isError(candidate: ValidateFinding): boolean {
  return candidate.severity === "error";
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export const validateCommand: CommandModule = {
  name: "validate",
  summary: "check the content, hooks, learnings and credentials this repo authored",
  mutating: false,

  // No spinner: every section is a bounded read of a small tree, and the report
  // itself is the progress indication.
  async run(ctx: CliContext): Promise<CommandResult> {
    const report = await collectReport(ctx.app.runtime.cwd, ctx.engine);
    renderReport(ctx, report);
    return {
      exitCode: report.errorCount > 0 ? 1 : 0,
      json: {
        findings: report.findings,
        errorCount: report.errorCount,
        warningCount: report.warningCount,
        // Always present, empty included: a CI consumer reading `shadows` gets
        // a key whose absence would otherwise be indistinguishable from an
        // older engine that never reported them.
        shadows: report.shadows,
      },
    };
  },
};
