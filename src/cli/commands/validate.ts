import { readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
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
 * The user-content section reports one thing that is not a defect at all:
 * SHADOWING. An override takes a bundled artifact's id on purpose, and the
 * command's job is to name the shipped artifact behind it, because the operator
 * who did it by accident — a floor rule renamed into the tree, a copied file
 * that kept its id — has no other surface that would tell them. It names which
 * of the two bodies emits rather than assuming the override's does: the skills
 * class is indexed from the override tree but not yet projected out of it (the
 * SKILLS gap in `../engine/emission.ts`), and calling that a replacement would
 * leave its author believing an override is live when it is not — the same harm
 * as the accident, printed by the surface that exists to prevent it. Reading
 * the bundled corpus to answer is not a widening of scope: the subject is still
 * the user's file, and nothing bundled is judged.
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

/** One bundled identity a user artifact took over. Information, never a finding. */
export interface ValidateShadow {
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
   * Whether taking the id also took over EMISSION — true for the classes in
   * `OVERRIDE_EMITTING_CLASSES` (`../engine/emission.ts`), false for `skill`,
   * whose per-client projection still reads the corpus half only.
   *
   * A machine-readable field rather than wording alone, so a CI consumer can
   * act on the difference the human line describes.
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
      () => collectUserContent(rootDir, engine),
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
 * Two things are reported that the per-artifact gate cannot see, because both
 * are facts about the TREE rather than about a file:
 *
 * - **Skipped entries.** A symlink in the override tree is passed over by every
 *   walk that reads it, so the artifact an author believes is live is not. It
 *   is a warning, not an error: nothing is broken, but the author's expectation
 *   is wrong and only this command can say so.
 * - **Shadows.** Which bundled artifact each override replaced, read from the
 *   merged catalog. Informational — see the module header.
 */
async function collectUserContent(
  rootDir: string,
  engine: EngineRegistry,
): Promise<SectionReport> {
  const { userContent } = engine.content;
  // Two disjoint walks of one small tree, plus the per-artifact judgements.
  const [artifacts, skipped] = await Promise.all([
    userContent.discoverUserContent(rootDir),
    userContent.discoverSkippedUserEntries(rootDir),
  ]);
  const judged = await Promise.all(
    artifacts.map(async (artifact) => ({
      artifact,
      check: await userContent.checkUserArtifact(artifact),
    })),
  );

  const findings = [
    ...judged.flatMap(({ artifact, check }) =>
      [...check.errors, ...check.warnings].map((violation) => ({
        source: "user-content" as const,
        path: repoPath(rootDir, artifact.filePath),
        severity: violation.severity,
        message: violation.detail,
      })),
    ),
    ...skipped.map((entry) =>
      finding("user-content", repoPath(rootDir, entry.filePath), "warning", entry.reason),
    ),
  ];

  // Skipped entries count as inspected: the command looked at them, and a
  // section reporting a warning while claiming to have read nothing reads as a
  // finding about thin air.
  const inspected = artifacts.length + skipped.length;
  const shadowing = artifacts.length === 0 ? EMPTY_SHADOWS : await collectShadows(rootDir, engine);
  return {
    ...section("user-content", findings, inspected, plural(inspected, "artifact")),
    ...(shadowing.note === undefined ? {} : { note: shadowing.note }),
    shadows: shadowing.shadows,
  };
}

/** The no-override answer, allocated once: nothing walked, nothing replaced. */
const EMPTY_SHADOWS: ShadowScan = { shadows: [] };

interface ShadowScan {
  readonly shadows: readonly ValidateShadow[];
  /** Why the scan could not answer. Printed as a note — never as a finding. */
  readonly note?: string;
}

/**
 * Which bundled identities the override tree took over, from the merged
 * catalog's own shadow surface.
 *
 * The walk is run only when the tree holds at least one artifact, so the
 * ordinary repo — no overrides — never pays for reading the bundled corpus.
 *
 * A walk that throws degrades to a note rather than a finding. The catalog
 * refuses a malformed artifact with a `VALIDATION_ERROR` naming the file, and
 * that same file has already been reported here by the per-artifact gate in
 * better terms; turning the walk's failure into a second finding would
 * double-report the defect, and letting it escape would replace the section's
 * real findings with one message about an index.
 */
async function collectShadows(rootDir: string, engine: EngineRegistry): Promise<ShadowScan> {
  const { catalog, userContent } = engine.content;
  try {
    const index = await catalog.buildContentIndex({
      overrideRoot: userContent.userContentRoot(rootDir),
    });
    return {
      shadows: (index.shadows ?? []).map((shadow) => ({
        type: shadow.type,
        id: shadow.id,
        path: repoPath(rootDir, shadow.winner.filePath),
        replaced: shadow.shadowed.map((item) => item.relativePath),
        emits: OVERRIDE_EMITTING_CLASSES.includes(shadow.type),
      })),
    };
  } catch (cause) {
    return {
      shadows: [],
      note:
        `could not report what these overrides replace until the tree indexes: ` +
        `${messageOf(cause)}`,
    };
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
 * The shadowing block: one line per identity an override took over, naming what
 * it replaced — or, for a class the override layer does not reach at emission,
 * naming what it did NOT replace. Nothing is printed for a repo with no
 * overrides, or with overrides that collide with nothing — an empty section
 * header would read as a defect class the repo has, rather than as one it does
 * not.
 *
 * The header sentence says "takes a bundled id" rather than "replaces bundled
 * content" because that is the part every row has in common; whether the take
 * reached emission is the per-row half, and stating it once for the block was
 * how this surface came to assert the opposite of the mechanism for skills.
 */
function renderShadows(ctx: CliContext, shadows: readonly ValidateShadow[]): void {
  if (shadows.length === 0) return;
  const { palette } = ctx;

  ctx.io.out(
    `${palette.bold("shadowing")} — ${plural(shadows.length, "override")} ` +
      `${shadows.length === 1 ? "takes" : "take"} a bundled id\n\n`,
  );
  for (const shadow of shadows) {
    const outcome = shadow.emits
      ? `replaces ${shadow.replaced.join(", ")}`
      : `takes the id of ${shadow.replaced.join(", ")} — not emitted, ` +
        `the bundled ${shadow.type} body is still what ships`;
    ctx.io.out(
      `  ${shadow.type} ${palette.bold(shadow.id)}  ${palette.dim(shadow.path)}  ${outcome}\n`,
    );
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
