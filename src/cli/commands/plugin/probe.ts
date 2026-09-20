/**
 * What an installed plugin looks like from this repository: which runtime its
 * locator resolves, and what content it carries that the repository also holds
 * (REQ-PLUGIN-016, REQ-PLUGIN-019).
 *
 * Two readers, one implementation. `../check.ts` turns these answers into the
 * `plugin-runtime` and `plugin-duplicates` doctor rows, with the severity split
 * REQ-PLUGIN-019 prescribes; `./status.ts` reports the same facts as data under
 * `stamity plugin status`. Both were written from the same requirement, and a
 * second implementation of either probe would let `check` and `status` disagree
 * about a repository neither of them changed — the one failure mode a
 * diagnostic pair cannot afford.
 *
 * This module DESCRIBES and never judges. There is no `warn`, no `fail` and no
 * exit code here: the probe says what it found and names what it could not do,
 * and the two callers apply their own severity — `check` because it is a CI
 * gate, `status` because it is a report that always exits 0. Moving a severity
 * decision into this file would make one of those two callers wrong.
 *
 * WHY IT IS IN THE CLI LAYER, at wave 14. Everything it reads is engine — the
 * content catalog, the hook-tree constant, the manifest vocabulary — and the
 * only reason it cannot sit in `src/plugins/` beside the capability reader is
 * `../../kit/packageName.ts`: the remedies it composes have to name the package
 * a reader can actually invoke, which is a CLI-layer fact (a fork renames it).
 * Wave 14 rather than 15 is what lets `../check.ts` — a wave-15 command under
 * another unit — import it at all.
 */
import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { parse as parseYaml } from "yaml";
import { buildContentIndex, emittedIdFor } from "../../../content/catalog.ts";
import { HOOKS_GENERATED_DIR } from "../../../emit/hooksInfra.ts";
import { PLUGIN_ROOT_VARIABLES } from "../../../plugins/capabilityFile.ts";
import { findPackageRoot } from "../../../shared/paths.ts";
import { TOOLS, type Tool } from "../../../types/core.ts";
import {
  PLUGIN_OWNED_CLASSES,
  type PluginOwnedClass,
  type SetupManifest,
} from "../../../types/manifest.ts";
import { STATE_DIR } from "../../../types/markers.ts";
import { packageCommand, packageName, repositorySlug } from "../../kit/packageName.ts";
import { sanitizeLabel } from "../../kit/prompts.ts";

// ── The runtime a plugin root resolves ─────────────────────────────────────

/**
 * Wall-time ceiling on the locator spawn, and the DEFAULT for
 * {@link probePluginRuntime}'s `timeoutMs`. A doctor row that can hang is a
 * `check` that can hang, and `check` is the CI gate — so the probe gives up and
 * reports the timeout rather than holding a pipeline open on a runtime
 * resolution. The override exists so a case can prove the ceiling holds without
 * spending it; no production caller passes one.
 */
const PLUGIN_LOCATOR_TIMEOUT_MS = 5_000;

/** The locator every plugin root ships, relative to that root. */
const PLUGIN_LOCATOR_PATH = "runtime/locate.mjs";

/** The first root variable this environment names, or `undefined` for none. */
export function pluginRootVariable(
  env: Readonly<Record<string, string | undefined>>,
): (typeof PLUGIN_ROOT_VARIABLES)[number] | undefined {
  return PLUGIN_ROOT_VARIABLES.find((name) => (env[name] ?? "").trim() !== "");
}

/** The locator inside `root`, composed with the platform's own separator. */
function pluginLocatorPath(root: string): string {
  return join(root, ...PLUGIN_LOCATOR_PATH.split("/"));
}

/** The locator's `--print` document (`scripts/plugins/locate.mjs`). */
interface LocatorReport {
  runtime: {
    kind: "companion" | "bundled" | "none";
    path: string | null;
    version: string | null;
    refusal: string | null;
  };
  node: { version: string; floor: string | null; ok: boolean };
}

/** One locator spawn's outcome, total: a failure to spawn is an answer. */
interface LocatorRun {
  /** Exit status, or `null` when the process never produced one. */
  status: number | null;
  stdout: string;
  timedOut: boolean;
  failure: string | null;
}

/**
 * How a probe ended: the locator answered, it refused (exit 2), it produced
 * something that is not its document, or it was still running at the ceiling.
 */
type PluginRuntimeOutcome = "resolved" | "refused" | "unreadable" | "timeout";

/** What one plugin root's locator says about the runtime behind it. */
export interface PluginRuntimeProbe {
  /** The locator path that was spawned, named by every message below. */
  locator: string;
  outcome: PluginRuntimeOutcome;
  /** `none` on every outcome but `resolved`, which is what the locator reports. */
  kind: "companion" | "bundled" | "none";
  path: string | null;
  version: string | null;
  /** The interpreter facts the locator compared, when it produced its document. */
  node: { version: string; floor: string | null; ok: boolean } | null;
  /**
   * Why this is not a resolved runtime — the locator's own refusal, the timeout
   * note, or the exit it made instead. `null` exactly when `outcome` is
   * `resolved`.
   */
  message: string | null;
}

/**
 * Spawn `<locator> --print` and collect its verdict.
 *
 * `process.execPath` with `shell: false` (execFile's default), never a bare
 * `node` off PATH: the interpreter that resolves the runtime has to be THIS
 * one, and a shell would give the root path's own characters a meaning on
 * Windows that they do not have here.
 */
function runPluginLocator(locator: string, timeoutMs: number): Promise<LocatorRun> {
  return new Promise((settle) => {
    let done = false;
    /** First answer wins: the spawn's own callback, or the ceiling below it. */
    const finish = (run: LocatorRun): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      settle(run);
    };

    const child = execFile(
      process.execPath,
      [locator, "--print"],
      {
        timeout: timeoutMs,
        // SIGKILL, not the default SIGTERM: a locator that installs a SIGTERM
        // handler would otherwise decide for itself whether the ceiling applies.
        killSignal: "SIGKILL",
        windowsHide: true,
        encoding: "utf8",
      },
      (error, stdout) => {
        if (error === null) {
          finish({ status: 0, stdout, timedOut: false, failure: null });
          return;
        }
        const failed = error as NodeJS.ErrnoException & { killed?: boolean };
        finish({
          // `code` is the exit status on a non-zero exit and an errno string
          // (`ENOENT`) when the spawn itself failed; only the first is a status.
          status: typeof failed.code === "number" ? failed.code : null,
          stdout,
          // The kill the timeout performs, distinguished from a process that
          // chose its own exit: `killed` alone is what the option sets.
          timedOut: failed.killed === true,
          failure: error.message,
        });
      },
    );

    // The ceiling this promise actually keeps. `execFile`'s own `timeout`
    // signals the child and then waits for `close`, and `close` waits for every
    // writer on the child's stdout — including a DETACHED grandchild that
    // inherited it. A locator leaving one behind held this promise open with no
    // bound at all, which is a `check` that hangs and therefore a CI job that
    // hangs. This timer settles the probe independently of the pipe; the kill
    // beside it is best-effort cleanup, not what makes the ceiling hold.
    //
    // Settling is not releasing (SEC4-M1). A settled promise still leaves this
    // process holding the read ends of the child's stdout and stderr, and a
    // grandchild holding a write end keeps those handles — and so the event
    // loop, and so `check` — alive until it exits. Destroying the two streams
    // is what lets the process go. `execFile`'s timeout happens to do the same
    // before it signals, but that is an undocumented line in its `kill()`, not
    // a contract, and the ceiling does not get to depend on it.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      child.stdout?.destroy();
      child.stderr?.destroy();
      finish({
        status: null,
        stdout: "",
        timedOut: true,
        failure: "the locator was still running at the ceiling and was killed",
      });
    }, timeoutMs);
    // The timer must never be the reason a process stays alive: a settled probe
    // has already cleared it, and an unsettled one is not worth holding an
    // event loop open for.
    timer.unref();
  });
}

/** The three words `runtime.kind` may be; anything else is not this document. */
const LOCATOR_RUNTIME_KINDS: ReadonlySet<string> = new Set(["companion", "bundled", "none"]);

/** A value that is a string or explicitly `null` — the locator's optional fields. */
function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/**
 * The locator's document, or `null` when stdout was not one.
 *
 * Every SCALAR is checked, not just the two container objects. The root being
 * probed is somebody else's install — an older plugin, a hand-edited root, a
 * newer generator — so "it parsed as JSON and has two object keys" is not
 * evidence that `kind` is one of three words or that `node.ok` is a boolean. A
 * cast over an unchecked document put a `kind` no reader of this engine
 * recognises straight into a doctor row; an unreadable answer is the honest
 * one, and its caller already warns rather than failing on it.
 */
function parseLocatorReport(stdout: string): LocatorReport | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { runtime, node } = parsed as Record<string, unknown>;
    if (typeof runtime !== "object" || runtime === null) return null;
    if (typeof node !== "object" || node === null) return null;
    const { kind, path, version, refusal } = runtime as Record<string, unknown>;
    if (typeof kind !== "string" || !LOCATOR_RUNTIME_KINDS.has(kind)) return null;
    if (!isStringOrNull(path) || !isStringOrNull(version) || !isStringOrNull(refusal)) return null;
    const { version: nodeVersion, floor, ok } = node as Record<string, unknown>;
    if (typeof ok !== "boolean") return null;
    // `node.version` is required to be a string where `floor` may be null: the
    // locator always resolved SOME interpreter to report on, and the declared
    // {@link LocatorReport} types it non-nullable — a document without it is
    // one this engine cannot render a node row from.
    if (typeof nodeVersion !== "string" || !isStringOrNull(floor)) return null;
    return parsed as LocatorReport;
  } catch {
    return null;
  }
}

/** Major version of a semver-ish string, or `null` when it is not one. */
export function majorOf(version: string | null | undefined): number | null {
  if (typeof version !== "string") return null;
  const parsed = semver.valid(version) ?? semver.coerce(version)?.version ?? null;
  return parsed === null ? null : semver.major(parsed);
}

/**
 * `engines.node` from the package that ships this build, or `null` when it
 * cannot be read as a range. Read rather than duplicated as a constant: the
 * floor is declared in package.json, and a second copy here could disagree with
 * the one npm actually enforces at install time.
 *
 * It lives HERE, in the shared probe, rather than privately in `../check.ts`
 * where it was written, because both readers of that floor need it: `check`'s
 * `node-version` row compares the running interpreter against it, and
 * `./status.ts` has no other way to state a floor when no plugin root's locator
 * produced one. A second copy in the report would be a second answer to the one
 * question the two commands must agree about.
 */
export async function requiredNodeRange(): Promise<string | null> {
  try {
    const root = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
    const parsed = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      engines?: { node?: unknown };
    };
    const range = parsed.engines?.node;
    return typeof range === "string" && semver.validRange(range) !== null ? range : null;
  } catch {
    return null;
  }
}

/**
 * The node facts to report when NO plugin root's locator produced any — the
 * running interpreter against this engine's own declared floor.
 *
 * Why a floor at all here. The locator states the floor the installed plugin
 * was built against; with no root to ask, the report used to carry `floor:
 * null`, which the table renders as `unstated` — and "unstated" was wrong twice
 * over, because this build declares a floor in its own package.json and
 * `check`'s `node-version` row already reads exactly that value. A row that says
 * `unstated` while the answer sits in the shipped manifest sends an operator
 * looking for a fact they already have.
 *
 * `ok` is therefore computed rather than assumed true: stating a floor and then
 * reporting `ok` against a version below it would be a worse row than the one
 * this replaces. `includePrerelease` for the same reason `../check.ts`'s own
 * comparison carries it — a nightly of a satisfying major is
 * not below the floor. A floor that could not be read stays `null` with `ok:
 * true`: a floor nobody stated cannot be missed.
 */
export async function engineNodeFacts(
  nodeVersion: string,
): Promise<{ version: string; floor: string | null; ok: boolean }> {
  const floor = await requiredNodeRange();
  if (floor === null) return { version: nodeVersion, floor: null, ok: true };
  const parsed = semver.valid(nodeVersion) ?? semver.coerce(nodeVersion)?.version ?? null;
  return {
    version: nodeVersion,
    floor,
    // An unparseable version is not evidence of being below the floor; the
    // doctor row is where that case is reported, and it warns rather than fails.
    ok: parsed === null || semver.satisfies(parsed, floor, { includePrerelease: true }),
  };
}

/**
 * Ask one installed root's locator which runtime a plugin invocation would run.
 *
 * Total by construction: every way the spawn can end — a refusal, a missing
 * locator, stdout that is not the document, a process still running at the
 * ceiling — comes back as an outcome with a sentence, never as a throw. A
 * broken plugin install is a fact about the operator's environment, and a probe
 * that threw on it would take its caller down with it.
 */
export async function probePluginRuntime(
  root: string,
  options: { timeoutMs?: number } = {},
): Promise<PluginRuntimeProbe> {
  const locator = pluginLocatorPath(root);
  const timeoutMs = options.timeoutMs ?? PLUGIN_LOCATOR_TIMEOUT_MS;
  const run = await runPluginLocator(locator, timeoutMs);
  const base = { locator, kind: "none", path: null, version: null, node: null } as const;

  if (run.timedOut) {
    return {
      ...base,
      outcome: "timeout",
      message:
        `${locator} did not answer within ${timeoutMs / 1000}s and was stopped, ` +
        `so no runtime was resolved: ${run.failure ?? "no message"}`,
    };
  }

  const report = parseLocatorReport(run.stdout);
  if (run.status === 2) {
    return {
      ...base,
      outcome: "refused",
      node: report?.node ?? null,
      // The root's OWN string, quoted into a row `check` prints raw: a hostile
      // root could paint a false doctor row in a CI log with an escape byte
      // (SEC5-M1, CWE-150). Quoted still — the terminal-steering bytes go.
      message: sanitizeLabel(
        report?.runtime.refusal ?? run.failure ?? "the locator refused without a message",
      ),
    };
  }
  if (run.status !== 0 || report === null) {
    return {
      ...base,
      outcome: "unreadable",
      message:
        `${locator} reported no runtime (exit ${run.status ?? "none"}): ` +
        `${run.failure ?? "stdout was not the locator's --print document"}`,
    };
  }

  const { kind, path, version } = report.runtime;
  return { locator, outcome: "resolved", kind, path, version, node: report.node, message: null };
}

// ── Content a plugin carries that the repository also holds ────────────────

/** One duplicated class, with the source that put it there. */
export interface DuplicateFinding {
  tool: Tool;
  cls: PluginOwnedClass;
  source: "ledger" | "apm" | "unmanaged";
  /** `paths.length`, kept for the callers that counted before the paths were carried. */
  files: number;
  /**
   * What REQ-PLUGIN-019 names "its path": the ledger rows' repository-relative
   * paths, the unowned native files' repository-relative paths, or — for an
   * `apm` finding, which has no file — the dependency spelling that matched.
   * Sorted, so the order is the paths' own and never a directory's read order.
   */
  paths: string[];
  remedy: string;
}

/** How many of a finding's paths a human row names before folding the rest into a count. */
export const DUPLICATE_PATHS_SHOWN = 3;

/**
 * The paths of one finding as a human row prints them: the first
 * {@link DUPLICATE_PATHS_SHOWN} in order, then `+N more` for the rest. A class
 * with many files would otherwise turn one doctor row into a directory listing.
 */
export function describeDuplicatePaths(paths: readonly string[]): string {
  const shown = paths.slice(0, DUPLICATE_PATHS_SHOWN).join(", ");
  const folded = paths.length - DUPLICATE_PATHS_SHOWN;
  return folded > 0 ? `${shown} +${folded} more` : shown;
}

/**
 * Each client's NATIVE content directories, with the class each one holds.
 *
 * The vendor-neutral `.agents/skills/` tree appears under all three of its
 * readers by design: a leftover skill there is a duplicate for each of them
 * separately, and the finding is per client.
 */
const NATIVE_CONTENT_DIRS: Readonly<Record<Tool, readonly (readonly [string, PluginOwnedClass])[]>> =
  {
    claude: [
      [".claude/agents", "agent"],
      [".claude/commands", "command"],
      [".claude/skills", "skill"],
    ],
    cursor: [
      [".cursor/agents", "agent"],
      [".cursor/rules", "rule"],
      [".agents/skills", "skill"],
    ],
    copilot: [
      [".github/agents", "agent"],
      [".github/prompts", "command"],
      [".agents/skills", "skill"],
    ],
    codex: [
      [".codex/agents", "agent"],
      [".agents/skills", "skill"],
    ],
  };

/**
 * Extensions the four clients spell a content file with, LONGEST FIRST.
 *
 * The order is load-bearing, not tidiness: Copilot writes `<id>.agent.md` and
 * `<id>.prompt.md`, and a list that met `.md` first would strip one suffix and
 * leave `stamity-reviewer.agent`, which matches no id the plugin carries — so
 * every Copilot file was invisible to the unmanaged scan. The two compound
 * forms therefore precede the bare `.md` they end with, and any extension added
 * later belongs above every extension it is a suffix of.
 */
const NATIVE_CONTENT_EXTENSIONS = [
  ".agent.md",
  ".prompt.md",
  ".md",
  ".mdc",
  ".toml",
] as const;

/**
 * The emitted id a native directory entry stands for: a file's basename with
 * its client extension removed, or a directory's own name (a skill and a
 * cursor command are both directories holding a `SKILL.md`).
 */
function nativeEntryId(name: string, isDirectory: boolean): string {
  if (isDirectory) return name;
  const extension = NATIVE_CONTENT_EXTENSIONS.find((suffix) => name.endsWith(suffix));
  return extension === undefined ? name : name.slice(0, -extension.length);
}

/** The emitted ids this engine's catalog would produce, grouped by class. */
type CarriedIdIndex = ReadonlyMap<PluginOwnedClass, ReadonlySet<string>>;

/**
 * Every emitted id this engine's catalog would produce for `classes`, indexed
 * by class — the ids a plugin built from the same corpus carries.
 *
 * ONE corpus walk per `check`, not one per recorded client: the catalog is the
 * same for every client, and a four-client repository was walking it four
 * times. Grouped by class so each client can compose the set for exactly the
 * classes its own record lists, which is what the per-client call used to
 * return.
 *
 * Read through {@link emittedIdFor}, the one answer every surface that names an
 * artifact to a human shares, so a file called `stamity-reviewer.md` is matched
 * by the same spelling rule that would have written it.
 */
async function pluginCarriedIds(classes: ReadonlySet<PluginOwnedClass>): Promise<CarriedIdIndex> {
  const index = await buildContentIndex();
  const byClass = new Map<PluginOwnedClass, Set<string>>();
  for (const item of index.items) {
    if (!classes.has(item.type)) continue;
    const ids = byClass.get(item.type) ?? new Set<string>();
    ids.add(emittedIdFor(item));
    byClass.set(item.type, ids);
  }
  return byClass;
}

/** One client's slice of that index: the ids of the classes its record lists. */
function carriedIdsFor(
  index: CarriedIdIndex,
  classes: ReadonlySet<PluginOwnedClass>,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const cls of classes) {
    for (const id of index.get(cls) ?? []) ids.add(id);
  }
  return ids;
}

/** Directory entries, or none: an absent native directory is an answer. */
async function readDirEntries(path: string): Promise<Dirent[]> {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** A file's text, or `null` when it is not there. */
async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Files under one client's native directories that carry a plugin id and that
 * no ledger row owns.
 *
 * "No ledger row owns" is the whole distinction between this source and
 * `ledger`: a path this engine wrote is reported with the remedy that removes
 * it through the engine, and a path it did not is reported as the operator's
 * own file, never as something a verb will delete.
 */
async function unmanagedDuplicates(
  rootDir: string,
  tool: Tool,
  classes: ReadonlySet<PluginOwnedClass>,
  ledgerPaths: ReadonlySet<string>,
  carriedIds: ReadonlySet<string>,
): Promise<DuplicateFinding[]> {
  const scans = NATIVE_CONTENT_DIRS[tool]
    .filter(([, cls]) => classes.has(cls))
    .map(async ([dir, cls]): Promise<DuplicateFinding[]> => {
      const entries = await readDirEntries(join(rootDir, ...dir.split("/")));
      const paths: string[] = [];
      for (const entry of entries) {
        const isDirectory = entry.isDirectory();
        if (!carriedIds.has(nativeEntryId(entry.name, isDirectory))) continue;
        const path = `${dir}/${entry.name}`;
        // A directory is owned when ANY row under it is: the ledger records the
        // files a skill projects, never the directory itself.
        const owned = isDirectory
          ? [...ledgerPaths].some((row) => row.startsWith(`${path}/`))
          : ledgerPaths.has(path);
        if (!owned) paths.push(path);
      }
      if (paths.length === 0) return [];
      return [
        {
          tool,
          cls,
          source: "unmanaged",
          files: paths.length,
          paths: paths.toSorted(),
          remedy:
            `not written by this engine; remove the file or keep it as an override under ` +
            `${STATE_DIR}/overrides/`,
        },
      ];
    });
  return (await Promise.all(scans)).flat();
}

/** `identity`, safe to embed in a pattern: `.`, `/` and `@` are the usual characters. */
function escapeForRegExp(identity: string): string {
  return identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * APM dependencies that deploy the same content this plugin carries.
 *
 * An APM install writes agents, skills and commands straight into the client
 * directories with no ledger row and no manifest entry, so neither of the other
 * two sources can see it — the only trace it leaves in the repository is the
 * dependency line that asks for it.
 *
 * A dependency line matches when it carries, as a whole token, either of this installation's two
 * identities: the repository slug (`repositorySlug()`, `<owner>/<repo>`) or the
 * registry name (`packageName()`, `@<scope>/<name>`). Both, because the two are
 * different strings that share no substring, and each is the one a different
 * route writes. The APM route this release publishes installs from the slug —
 * `release.json` carries `apm.installSpec` as `<owner>/<repo>#plugins/
 * v<version>`, which never contains the scoped npm name — while a hand-written
 * manifest that depends on the published package names the registry name.
 * Matching only one of them would leave the other route's duplicate unreported.
 *
 * Both are read from the running package rather than hardcoded, so a downstream
 * that renamed the package and repointed `repository.url` as
 * `docs/enterprise-forks.md` instructs recognises its own dependency.
 *
 * A private mirror published under ANOTHER owner — `acme/stamity-mirror#…` — is
 * NOT matched: it carries neither identity. That is the safe direction, since a
 * false duplicate would send an operator to remove a dependency that deploys
 * nothing; closing it needs the installed marketplace recorded on the client's
 * `PluginClientRecord`, which no manifest field carries yet.
 */
function matchedApmDependencies(apmYaml: string | null): string[] {
  if (apmYaml === null) return [];
  let parsed: unknown;
  try {
    parsed = parseYaml(apmYaml);
  } catch {
    // An unreadable apm.yml is a fact for a different row to raise; this one
    // answers about duplicates and cannot claim any from a file it cannot read.
    return [];
  }
  const declared = (parsed as { dependencies?: unknown } | null)?.dependencies;
  // Two shapes, both real (W-D1). apm's own manifest lists dependencies as a
  // flat array (`dependencies:\n  - <spec>`), and the consumer manifest
  // `docs/enterprise-forks.md` documents nests them under an `apm:` section
  // (`dependencies:\n  apm:\n    - <spec>`), which is the shape
  // `scripts/apm-install-smoke.mjs` writes. Reading the flat array alone
  // answered `[]` for the documented shape, so the source never reported.
  // Anything else is a manifest this row does not understand and claims
  // nothing from.
  const nested = (declared as { apm?: unknown } | null)?.apm;
  const list: unknown[] = Array.isArray(declared)
    ? declared
    : Array.isArray(nested)
      ? nested
      : [];
  // Both identities, filtered to the ones this installation could derive: a
  // manifest that names no github repository answers `null` for the slug, and
  // an empty needle would match every dependency line there is.
  const identities = [repositorySlug(), packageName()].filter(
    (identity): identity is string => identity !== null && identity !== "",
  );
  // Bounded, not a substring (W4-1): `<owner>/<repo>` is contained in
  // `<owner>/<repo>-suffix#plugins/v1.9.0`, and a plain `includes` told every
  // repository depending on a same-owner sibling with a longer name to remove
  // a dependency that deploys nothing. The identity is a whole token: it starts
  // the text or follows whitespace, a quote or a `/` (the URL spelling,
  // `https://github.com/<slug>#ref`, is the same repository), and it ends the
  // text or is followed by the `#` that opens the ref, a `/` (a subpath,
  // `<slug>/<dir>#ref`, is the same repository one directory in), whitespace
  // or a quote. Case-insensitive, because GitHub owner and repository names
  // are (M-1).
  const bounded = identities.map(
    (identity) => new RegExp(`(?:^|[\\s"'/])${escapeForRegExp(identity)}(?:$|[#/\\s"'])`, "i"),
  );
  const matched: string[] = [];
  for (const entry of list) {
    const text =
      typeof entry === "string"
        ? entry
        : typeof entry === "object" && entry !== null
          ? Object.values(entry as Record<string, unknown>)
              .filter((value) => typeof value === "string")
              .join(" ")
          : "";
    // The matched line is quoted into the remedy and carried as the finding's
    // path, and a YAML double-quoted scalar can spell `\e` — so the text is
    // sanitized once, here, before either surface sees it (SEC5-M1, CWE-150).
    if (bounded.some((pattern) => pattern.test(text))) matched.push(sanitizeLabel(text));
  }
  return matched;
}

/**
 * The `apm` findings for one client, from the dependency lines
 * {@link matchedApmDependencies} already found.
 *
 * The parse happens ONCE per `check` rather than once per recorded client:
 * `apm.yml` is a repository-level file and the lines it matches say nothing
 * about which client is being reported.
 */
function apmDuplicates(
  matched: readonly string[],
  tool: Tool,
  classes: ReadonlySet<PluginOwnedClass>,
): DuplicateFinding[] {
  if (matched.length === 0) return [];
  // APM deploys content, never hook wiring or always-on rules, so the classes
  // it can duplicate are the three it actually writes.
  const deployable = (["agent", "skill", "command"] as const).filter((cls) => classes.has(cls));
  const paths = matched.toSorted();
  return deployable.map((cls) => ({
    tool,
    cls,
    source: "apm" as const,
    files: paths.length,
    paths,
    remedy:
      `the APM dependency ${matched.join(", ")} deploys the same classes; remove it from ` +
      `apm.yml and run apm install, or keep the plugin uninstalled`,
  }));
}

/** One recorded client's duplicates, from all three sources. */
async function duplicatesForClient(
  rootDir: string,
  tool: Tool,
  classes: ReadonlySet<PluginOwnedClass>,
  manifest: SetupManifest | null,
  matchedApm: readonly string[],
  ledgerPaths: ReadonlySet<string>,
  carriedIds: CarriedIdIndex,
): Promise<DuplicateFinding[]> {
  const findings: DuplicateFinding[] = [];
  // Source 1 — rows this engine wrote and still owns. A hook row is any row
  // under the generated hooks tree: that directory is what REQ-PLUGIN-016
  // names as the one a plugin-backed setup writes nothing into, and a
  // client's own config document (`.claude/settings.json`) is deliberately
  // not counted, since it carries repository configuration as well.
  const ledgerRows = (manifest?.ledger ?? []).filter((row) => row.adapter === tool);
  const byClass = new Map<PluginOwnedClass, string[]>();
  for (const row of ledgerRows) {
    const cls: PluginOwnedClass | null =
      row.artifactType === "infra"
        ? row.path.startsWith(`${HOOKS_GENERATED_DIR}/${tool}/`)
          ? "hooks"
          : null
        : row.artifactType;
    if (cls === null || !classes.has(cls)) continue;
    byClass.set(cls, [...(byClass.get(cls) ?? []), row.path]);
  }
  for (const cls of PLUGIN_OWNED_CLASSES) {
    const paths = byClass.get(cls)?.toSorted();
    if (paths === undefined) continue;
    findings.push({
      tool,
      cls,
      source: "ledger",
      files: paths.length,
      paths,
      remedy: `${packageCommand("clean -y")} then ${packageCommand(`plugin setup --client ${tool}`)}`,
    });
  }

  findings.push(...apmDuplicates(matchedApm, tool, classes));
  findings.push(
    ...(await unmanagedDuplicates(
      rootDir,
      tool,
      classes,
      ledgerPaths,
      carriedIdsFor(carriedIds, classes),
    )),
  );
  return findings;
}

/**
 * Content a plugin carries that this repository ALSO holds, from all three
 * sources it can come from, for every client the manifest records.
 *
 * No verb deletes any of it. Every remedy is the operator's own step, named per
 * source, because two of the three sources are files this engine has no
 * ownership claim over at all. The SEVERITY of a finding is the caller's:
 * REQ-PLUGIN-019 makes it advisory under `mode: "generated"` and a defect under
 * `plugin-backed`, and only a caller knows whether it is gating.
 */
export async function collectPluginDuplicates(
  rootDir: string,
  manifest: SetupManifest | null,
): Promise<DuplicateFinding[]> {
  const recorded = manifest?.plugin?.clients ?? {};
  const tools = TOOLS.filter((tool) => recorded[tool] !== undefined);
  if (tools.length === 0) return [];

  const ledgerPaths = new Set((manifest?.ledger ?? []).map((row) => row.path));
  // The two repository-level reads happen ONCE, ahead of the fan-out: `apm.yml`
  // is one file whose matched dependency lines are the same for every client,
  // and the content catalog is one corpus walk whose answer is the same for
  // every client. Both used to run per recorded client, so a four-client
  // repository paid for four corpus walks and four YAML parses to produce four
  // slices of one answer.
  const [matchedApm, carriedIds] = await Promise.all([
    readIfPresent(join(rootDir, "apm.yml")).then(matchedApmDependencies),
    pluginCarriedIds(new Set(tools.flatMap((tool) => recorded[tool]?.classes ?? []))),
  ]);
  // Per client, in parallel: each answer reads a disjoint set of directories
  // and the same shared inputs, so the only ordering that matters is the one
  // the flatten below restores.
  const perTool = await Promise.all(
    tools.map(async (tool) => {
      const classes = new Set(recorded[tool]?.classes ?? []);
      if (classes.size === 0) return [];
      return await duplicatesForClient(
        rootDir,
        tool,
        classes,
        manifest,
        matchedApm,
        ledgerPaths,
        carriedIds,
      );
    }),
  );
  return perTool.flat();
}
