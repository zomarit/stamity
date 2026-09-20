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
import { join } from "node:path";
import semver from "semver";
import { parse as parseYaml } from "yaml";
import { buildContentIndex, emittedIdFor } from "../../../content/catalog.ts";
import { HOOKS_GENERATED_DIR } from "../../../emit/hooksInfra.ts";
import { TOOLS, type Tool } from "../../../types/core.ts";
import {
  PLUGIN_OWNED_CLASSES,
  type PluginOwnedClass,
  type SetupManifest,
} from "../../../types/manifest.ts";
import { STATE_DIR } from "../../../types/markers.ts";
import { packageCommand, packageName, repositorySlug } from "../../kit/packageName.ts";

// ── The runtime a plugin root resolves ─────────────────────────────────────

/**
 * The environment variables a client sets to the root of an installed plugin,
 * in the order they are probed.
 *
 * The same four, in the same order, that `resolvePluginRoot` reads
 * (`../../../plugins/capabilityFile.ts`). A generic `PLUGIN_ROOT` sits third
 * because two of the four clients set a named variable of their own and the
 * generic one is the fallback an operator exports by hand.
 */
export const PLUGIN_ROOT_VARIABLES = [
  "CLAUDE_PLUGIN_ROOT",
  "CURSOR_PLUGIN_ROOT",
  "PLUGIN_ROOT",
  "COPILOT_PLUGIN_ROOT",
] as const;

/**
 * Wall-time ceiling on the locator spawn. A doctor row that can hang is a
 * `check` that can hang, and `check` is the CI gate — so the probe gives up and
 * reports the timeout rather than holding a pipeline open on a runtime
 * resolution.
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
function runPluginLocator(locator: string): Promise<LocatorRun> {
  return new Promise((settle) => {
    execFile(
      process.execPath,
      [locator, "--print"],
      { timeout: PLUGIN_LOCATOR_TIMEOUT_MS, windowsHide: true, encoding: "utf8" },
      (error, stdout) => {
        if (error === null) {
          settle({ status: 0, stdout, timedOut: false, failure: null });
          return;
        }
        const failed = error as NodeJS.ErrnoException & { killed?: boolean };
        settle({
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
  });
}

/** The locator's document, or `null` when stdout was not one. */
function parseLocatorReport(stdout: string): LocatorReport | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { runtime, node } = parsed as Record<string, unknown>;
    if (typeof runtime !== "object" || runtime === null) return null;
    if (typeof node !== "object" || node === null) return null;
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
 * Ask one installed root's locator which runtime a plugin invocation would run.
 *
 * Total by construction: every way the spawn can end — a refusal, a missing
 * locator, stdout that is not the document, a process still running at the
 * ceiling — comes back as an outcome with a sentence, never as a throw. A
 * broken plugin install is a fact about the operator's environment, and a probe
 * that threw on it would take its caller down with it.
 */
export async function probePluginRuntime(root: string): Promise<PluginRuntimeProbe> {
  const locator = pluginLocatorPath(root);
  const run = await runPluginLocator(locator);
  const base = { locator, kind: "none", path: null, version: null, node: null } as const;

  if (run.timedOut) {
    return {
      ...base,
      outcome: "timeout",
      message:
        `${locator} did not answer within ${PLUGIN_LOCATOR_TIMEOUT_MS / 1000}s and was stopped, ` +
        `so no runtime was resolved: ${run.failure ?? "no message"}`,
    };
  }

  const report = parseLocatorReport(run.stdout);
  if (run.status === 2) {
    return {
      ...base,
      outcome: "refused",
      node: report?.node ?? null,
      message: report?.runtime.refusal ?? run.failure ?? "the locator refused without a message",
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
  files: number;
  remedy: string;
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

/**
 * Every emitted id this engine's catalog would produce for `classes` — the ids
 * a plugin built from the same corpus carries.
 *
 * Read through {@link emittedIdFor}, the one answer every surface that names an
 * artifact to a human shares, so a file called `stamity-reviewer.md` is matched
 * by the same spelling rule that would have written it.
 */
async function pluginCarriedIds(
  classes: ReadonlySet<PluginOwnedClass>,
): Promise<ReadonlySet<string>> {
  const index = await buildContentIndex();
  const ids = new Set<string>();
  for (const item of index.items) {
    if (classes.has(item.type)) ids.add(emittedIdFor(item));
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
      let files = 0;
      for (const entry of entries) {
        const isDirectory = entry.isDirectory();
        if (!carriedIds.has(nativeEntryId(entry.name, isDirectory))) continue;
        const path = `${dir}/${entry.name}`;
        // A directory is owned when ANY row under it is: the ledger records the
        // files a skill projects, never the directory itself.
        const owned = isDirectory
          ? [...ledgerPaths].some((row) => row.startsWith(`${path}/`))
          : ledgerPaths.has(path);
        if (!owned) files += 1;
      }
      if (files === 0) return [];
      return [
        {
          tool,
          cls,
          source: "unmanaged",
          files,
          remedy:
            `not written by this engine; remove the file or keep it as an override under ` +
            `${STATE_DIR}/overrides/`,
        },
      ];
    });
  return (await Promise.all(scans)).flat();
}

/**
 * APM dependencies that deploy the same content this plugin carries.
 *
 * An APM install writes agents, skills and commands straight into the client
 * directories with no ledger row and no manifest entry, so neither of the other
 * two sources can see it — the only trace it leaves in the repository is the
 * dependency line that asks for it.
 *
 * A dependency line matches when it CONTAINS either of this installation's two
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
function apmDuplicates(
  apmYaml: string | null,
  tool: Tool,
  classes: ReadonlySet<PluginOwnedClass>,
): DuplicateFinding[] {
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
  if (!Array.isArray(declared)) return [];
  // Both identities, filtered to the ones this installation could derive: a
  // manifest that names no github repository answers `null` for the slug, and
  // an empty needle would match every dependency line there is.
  const identities = [repositorySlug(), packageName()].filter(
    (identity): identity is string => identity !== null && identity !== "",
  );
  const matched: string[] = [];
  for (const entry of declared) {
    const text =
      typeof entry === "string"
        ? entry
        : typeof entry === "object" && entry !== null
          ? Object.values(entry as Record<string, unknown>)
              .filter((value) => typeof value === "string")
              .join(" ")
          : "";
    if (identities.some((identity) => text.includes(identity))) matched.push(text);
  }
  if (matched.length === 0) return [];
  // APM deploys content, never hook wiring or always-on rules, so the classes
  // it can duplicate are the three it actually writes.
  const deployable = (["agent", "skill", "command"] as const).filter((cls) => classes.has(cls));
  return deployable.map((cls) => ({
    tool,
    cls,
    source: "apm" as const,
    files: matched.length,
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
  apmYaml: string | null,
  ledgerPaths: ReadonlySet<string>,
): Promise<DuplicateFinding[]> {
  const findings: DuplicateFinding[] = [];
  // Source 1 — rows this engine wrote and still owns. A hook row is any row
  // under the generated hooks tree: that directory is what REQ-PLUGIN-016
  // names as the one a plugin-backed setup writes nothing into, and a
  // client's own config document (`.claude/settings.json`) is deliberately
  // not counted, since it carries repository configuration as well.
  const ledgerRows = (manifest?.ledger ?? []).filter((row) => row.adapter === tool);
  const byClass = new Map<PluginOwnedClass, number>();
  for (const row of ledgerRows) {
    const cls: PluginOwnedClass | null =
      row.artifactType === "infra"
        ? row.path.startsWith(`${HOOKS_GENERATED_DIR}/${tool}/`)
          ? "hooks"
          : null
        : row.artifactType;
    if (cls === null || !classes.has(cls)) continue;
    byClass.set(cls, (byClass.get(cls) ?? 0) + 1);
  }
  for (const cls of PLUGIN_OWNED_CLASSES) {
    const files = byClass.get(cls);
    if (files === undefined) continue;
    findings.push({
      tool,
      cls,
      source: "ledger",
      files,
      remedy: `${packageCommand("clean -y")} then ${packageCommand(`plugin setup --client ${tool}`)}`,
    });
  }

  findings.push(...apmDuplicates(apmYaml, tool, classes));
  findings.push(
    ...(await unmanagedDuplicates(
      rootDir,
      tool,
      classes,
      ledgerPaths,
      await pluginCarriedIds(classes),
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
  const apmYaml = await readIfPresent(join(rootDir, "apm.yml"));
  // Per client, in parallel: each answer reads a disjoint set of directories
  // and the same two in-memory inputs, so the only ordering that matters is the
  // one the flatten below restores.
  const perTool = await Promise.all(
    tools.map(async (tool) => {
      const classes = new Set(recorded[tool]?.classes ?? []);
      if (classes.size === 0) return [];
      return await duplicatesForClient(rootDir, tool, classes, manifest, apmYaml, ledgerPaths);
    }),
  );
  return perTool.flat();
}
