/**
 * The report behind `stamity plugin status` — what an installed plugin is, and
 * what this repository has recorded about it (REQ-PLUGIN-013, REQ-PLUGIN-016,
 * REQ-PLUGIN-017, REQ-PLUGIN-019).
 *
 * A READ, in the strongest sense the requirement can carry: nothing below
 * writes a byte, spawns anything but the plugin's own locator, or mutates a
 * ledger row. REQ-PLUGIN-019 gates on exactly that — the sha-256 of every
 * generated file and every file under the plugin root survives a `status` run —
 * so a future edit that "just refreshes" the manifest here breaks a stated
 * requirement rather than a preference.
 *
 * WHY IT IS IN THE CLI LAYER, and not in `src/plugins/` where the plan placed
 * it. The report's `duplicates` section is `check`'s own three-source scan, and
 * that scan composes a remedy naming the package a reader can invoke
 * (`../../kit/packageName.ts`) — a CLI-layer fact. `./probe.ts` is therefore a
 * CLI-layer module, and a report that reads it cannot sit under the engine
 * without the `no-cli` boundary refusing it. This is the same wall unit C6 hit
 * with the setup engine, for the same reason, and it is recorded in the plan
 * map beside that row.
 *
 * It DESCRIBES, it does not gate. `status` exits 0 whatever the rows say, which
 * is deliberate and not an oversight: `check` is this repository's gate, it
 * carries the same two plugin rows with the severity REQ-PLUGIN-019 prescribes,
 * and a second command disagreeing with it about severity is how a CI step
 * starts getting ignored. The two share one probe so they cannot disagree about
 * the facts either.
 */
import { stat } from "node:fs/promises";
import type { EngineRegistry } from "../../../index.ts";
import { verificationCommandsFor } from "../../../detect/verificationGates.ts";
import { readGates, readInstallMode, manifestPath } from "../../../manifest/manifest.ts";
import {
  PLUGIN_ROOT_VARIABLES,
  readCapabilityFile,
  resolvePluginRoot,
  type PluginCapabilityFile,
} from "../../../plugins/capabilityFile.ts";
import { TOOLS, type Tool } from "../../../types/core.ts";
import type { GatesConfig, InstallMode, PluginClientRecord, PluginOwnedClass, SetupManifest } from "../../../types/manifest.ts";
import { packageCommand } from "../../kit/packageName.ts";
import { collectPluginDuplicates, majorOf, probePluginRuntime } from "./probe.ts";

/** What the locator resolved, or why nothing was resolved. */
interface PluginStatusRuntime {
  kind: "companion" | "bundled" | "none";
  path: string | null;
  version: string | null;
  /** The refusal, the timeout, or the absent-root sentence; `null` when resolved. */
  message: string | null;
}

/** One client's row: what the manifest records, and what the root says. */
interface PluginStatusClient {
  tool: Tool;
  /** The manifest's record for this client, or `null` when it records none. */
  recorded: PluginClientRecord | null;
  /** True when the resolved root declares itself this client's. */
  rootFound: boolean;
  /** The resolved root's own version, when it is this client's root. */
  rootVersion: string | null;
  /** The client-version floor that root states, or `unknown`. */
  clientFloor: string;
  /** True when `manifest.tools` selects this client for emission. */
  selected: boolean;
}

/** A fact detection could not determine, with the command that settles it. */
interface PluginStatusUnconfigured {
  fact: string;
  command: string;
}

/** The whole report — the `--json` document, and what the table renders from. */
export interface PluginStatusReport {
  installMode: InstallMode;
  runtime: PluginStatusRuntime;
  node: { version: string; floor: string | null; ok: boolean };
  clients: PluginStatusClient[];
  compatibility: {
    state: "compatible" | "mismatch" | "not-applicable";
    pluginVersion: string | null;
    manifestVersion: string | null;
  };
  /** `check`'s list: the count, and the paths it names (see `DuplicateFinding.paths`). */
  duplicates: { tool: Tool; class: PluginOwnedClass; files: number; paths: string[] }[];
  /** True when a duplicate was found: content reaching one client twice. */
  coexistence: boolean;
  setup: { needed: boolean; unconfigured: PluginStatusUnconfigured[] };
}

/** Inputs a caller owns: the root override, the environment, the interpreter. */
export interface PluginStatusOptions {
  /** `--plugin-root`, when one was passed. */
  pluginRoot?: string;
  env: Readonly<Record<string, string | undefined>>;
  /** The running interpreter's version, injected so the report is testable. */
  nodeVersion: string;
}

/** The three detected facts the charter renders, with the fact name it prints. */
const DETECTED_FACTS: readonly { fact: string; read: (detected: NonNullable<SetupManifest["detected"]>) => readonly string[] }[] = [
  { fact: "linter", read: (detected) => detected.linters },
  { fact: "test framework", read: (detected) => detected.testFrameworks },
  { fact: "CI provider", read: (detected) => detected.ciProviders },
];

/** The four gate keys, in the order the charter's own table lists them. */
const GATE_KEYS: readonly (keyof GatesConfig)[] = ["test", "lint", "typecheck", "all"];

/** Is there a manifest file here at all? */
async function manifestExists(rootDir: string): Promise<boolean> {
  try {
    return (await stat(manifestPath(rootDir))).isFile();
  } catch {
    return false;
  }
}

/**
 * The manifest, or `null` when there is none — and `null` again when one exists
 * and cannot be read.
 *
 * A report that threw on a corrupt manifest would deny an operator the one
 * command that could tell them what their repository looks like, at the moment
 * they most need it. `check`'s `manifest` row is where a corrupt file is
 * REPORTED as a defect; this surface degrades to "nothing recorded" instead.
 */
async function readManifestOrNull(
  rootDir: string,
  engine: EngineRegistry,
): Promise<SetupManifest | null> {
  try {
    return await engine.manifest.manifest.readManifest(rootDir);
  } catch {
    return null;
  }
}

/**
 * Facts this repository states as `unknown` and the exact command that fixes
 * each (REQ-PLUGIN-017).
 *
 * Two kinds, two commands, and the difference is not cosmetic: a DETECTED fact
 * (linter, test framework, CI provider) has no configuration key — re-running
 * detection is the only way to change it — while a verification gate has one
 * per gate. Naming `config detect` for a gate, or a `config set` key that does
 * not exist for a detected fact, would hand an operator a command that cannot
 * do what the row says it does.
 *
 * A PINNED gate is never listed, whatever detection found: the operator already
 * answered that question.
 */
function unconfiguredFacts(manifest: SetupManifest | null): PluginStatusUnconfigured[] {
  if (manifest === null) return [];
  const rows: PluginStatusUnconfigured[] = [];
  const detected = manifest.detected;
  if (detected !== undefined) {
    for (const { fact, read } of DETECTED_FACTS) {
      if (read(detected).length === 0) {
        rows.push({ fact, command: packageCommand("config detect") });
      }
    }
  }
  const pinned = readGates(manifest);
  const resolved = verificationCommandsFor(detected);
  for (const gate of GATE_KEYS) {
    if (pinned[gate] !== undefined) continue;
    if (resolved[gate] === undefined) {
      rows.push({
        fact: `gates.${gate}`,
        command: packageCommand(`config set gates.${gate} "<command>"`),
      });
    }
  }
  return rows;
}

/** The capability file of the resolved root, or `null` when there is none to read. */
async function readRoot(root: string | null): Promise<PluginCapabilityFile | null> {
  if (root === null) return null;
  try {
    return await readCapabilityFile(root);
  } catch {
    // An unreadable root is REPORTED, not thrown: `runtime.message` already
    // carries the locator's own answer about the same root, and `plugin setup`
    // is the surface that refuses on it with the reader's full defect list.
    return null;
  }
}

/** One row per client, in `TOOLS` order, whatever the repository records. */
function clientRows(
  manifest: SetupManifest | null,
  file: PluginCapabilityFile | null,
): PluginStatusClient[] {
  const recorded = manifest?.plugin?.clients ?? {};
  const selected = new Set(manifest?.tools ?? []);
  return TOOLS.map((tool) => {
    const rootFound = file?.client === tool;
    return {
      tool,
      recorded: recorded[tool] ?? null,
      rootFound,
      rootVersion: rootFound ? file.version : null,
      clientFloor: rootFound ? file.clientFloor.version : "unknown",
      selected: selected.has(tool),
    };
  });
}

/**
 * Does the installed plugin match the state this repository already carries
 * (REQ-PLUGIN-013)?
 *
 * MAJOR against major, on the semver promise: a minor or patch of the same
 * major reads and writes the same state, and a different major is the case
 * where a sync would rewrite files under rules the recorded setup was not
 * written to. `not-applicable` when either side is missing — no root to compare,
 * or no manifest to compare it against — because "compatible" is a claim and
 * absence is not evidence for it.
 */
function compatibilityOf(
  file: PluginCapabilityFile | null,
  manifest: SetupManifest | null,
): PluginStatusReport["compatibility"] {
  const pluginVersion = file?.version ?? null;
  const manifestVersion = manifest?.generatedBy ?? null;
  const pluginMajor = majorOf(pluginVersion);
  const stateMajor = majorOf(manifestVersion);
  if (pluginMajor === null || stateMajor === null) {
    return { state: "not-applicable", pluginVersion, manifestVersion };
  }
  return {
    state: pluginMajor === stateMajor ? "compatible" : "mismatch",
    pluginVersion,
    manifestVersion,
  };
}

/**
 * Everything `stamity plugin status` reports, gathered from the repository, the
 * resolved plugin root and that root's locator.
 *
 * Total: every absent input — no manifest, no root, no locator, a root that
 * cannot be parsed — resolves to a row that says so. The command exits 0 on all
 * of them, so a throw here would be a report that refused to report.
 */
export async function buildPluginStatus(
  rootDir: string,
  engine: EngineRegistry,
  opts: PluginStatusOptions,
): Promise<PluginStatusReport> {
  const root = resolvePluginRoot({
    ...(opts.pluginRoot === undefined ? {} : { flag: opts.pluginRoot }),
    env: opts.env,
  });
  const [manifest, present, file] = await Promise.all([
    readManifestOrNull(rootDir, engine),
    manifestExists(rootDir),
    readRoot(root),
  ]);
  const probe = root === null ? null : await probePluginRuntime(root);
  const findings = await collectPluginDuplicates(rootDir, manifest);

  const runtime: PluginStatusRuntime =
    probe === null
      ? {
          kind: "none",
          path: null,
          version: null,
          message: `no plugin root: pass --plugin-root, or set ${PLUGIN_ROOT_VARIABLES.join(", ")}`,
        }
      : { kind: probe.kind, path: probe.path, version: probe.version, message: probe.message };

  return {
    installMode: readInstallMode(manifest),
    runtime,
    // The locator's own node facts when it produced them, else this process's
    // version with no floor to judge it: a floor nobody stated cannot be
    // missed, which is the rule the locator itself applies.
    node: probe?.node ?? { version: opts.nodeVersion, floor: null, ok: true },
    clients: clientRows(manifest, file),
    compatibility: compatibilityOf(file, manifest),
    duplicates: findings.map((finding) => ({
      tool: finding.tool,
      class: finding.cls,
      files: finding.files,
      paths: finding.paths,
    })),
    coexistence: findings.length > 0,
    setup: { needed: !present, unconfigured: unconfiguredFacts(manifest) },
  };
}
