import { stat } from "node:fs/promises";
import type { Command } from "commander";
import { pluginOwnedSummary, type PluginOwnedClasses } from "../../emit/ownership.ts";
import { manifestPath } from "../../manifest/manifest.ts";
import {
  carriedClasses,
  readCapabilityFile,
  resolvePluginRoot,
} from "../../plugins/capabilityFile.ts";
import { TOOLS, VALID_TOOLS, type Tool } from "../../types/core.ts";
import { EngineError } from "../../types/errors.ts";
import { CliFailure } from "../kit/output.ts";
import { packageCommand } from "../kit/packageName.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import type { InitApplyReport } from "./init/apply.ts";
import { PLUGIN_ROOT_VARIABLES } from "./plugin/probe.ts";
import { applyPluginSetup, type PluginSetupRoot } from "./plugin/setup.ts";
import { buildPluginStatus, type PluginStatusReport } from "./plugin/status.ts";

/**
 * `stamity plugin` — the door onto an installed stamity plugin.
 *
 *   plugin          status, on every stream
 *   plugin status   what the plugin is, what this repository recorded, and what
 *                   is still unconfigured
 *   plugin setup    write the repository-owned files, and only those
 *
 * Three properties carry the surface.
 *
 * **A report is not a gate.** `status` exits 0 whatever it found, including on
 * a repository with no manifest and no plugin anywhere near it. `check` is this
 * repository's gate and already carries the two plugin rows with the severity
 * REQ-PLUGIN-019 prescribes; the two read ONE probe (`./plugin/probe.ts`) so
 * they cannot disagree about the facts, and only one of them has a verdict.
 *
 * **Setup is init, with one field set.** Everything the plugin route does not
 * answer differently — the state scaffold, the merge engine, the ledger, the
 * dry-run contract, the already-initialised refusal — is init's answer,
 * reached through `./plugin/setup.ts` (unit C6). What this file adds is the
 * operator's half: which roots, for which clients, and the sentence a refusal
 * turns into.
 *
 * **The refusal is BEFORE the plan, not after it.** A repository that already
 * carries a generated setup is refused on the manifest's presence, ahead of any
 * detection walk or plan, so "writes nothing" is a property of the control flow
 * rather than of a writer that was asked nicely. `applyInit` would refuse the
 * same case on its own — that refusal stays as the engine's floor — but its
 * message speaks about init, and the operator here needs the two-step route out
 * (`clean -y`, then `plugin setup`) that REQ-PLUGIN-015 names.
 *
 * ONE FILE plus a `./plugin/` directory, and the split is not stylistic: the
 * setup engine (C6) and the probe and report modules sit under `./plugin/`
 * because `./check.ts` imports the probe and could not import a sibling verb.
 * The layering gate's rows in `test/architecture/boundaries.test.ts` state the
 * waves that make each of those edges legal.
 */

/**
 * The closed subcommand set, in the order the refusal names them. `status` is
 * also the bare-invocation default, which is why it leads.
 */
const SUBCOMMANDS = ["status", "setup"] as const;

/** Column width for the status table's label column. */
const LABEL_WIDTH = Math.max(
  "compatibility".length,
  ...TOOLS.map((tool) => tool.length),
);

/** Indent for a row's continuation lines, so a wrapped detail stays in column. */
const CONTINUATION = `  ${" ".repeat(LABEL_WIDTH)}  `;

/** The clean-then-setup route REQ-PLUGIN-015 names, with the clients it would act on. */
function cleanThenSetup(clients: readonly Tool[]): string {
  const csv = clients.length === 0 ? "<csv>" : clients.join(",");
  return (
    `a generated setup exists; run ${packageCommand("clean -y")}, then ` +
    `${packageCommand(`plugin setup --client ${csv}`)}`
  );
}

/** Is there a manifest here? The one question the setup refusal turns on. */
async function hasManifest(rootDir: string): Promise<boolean> {
  try {
    return (await stat(manifestPath(rootDir))).isFile();
  } catch {
    return false;
  }
}

/** `--client claude,cursor` as tools, refusing the first name that is not one. */
function parseClients(raw: unknown): Tool[] {
  if (typeof raw !== "string") return [];
  const names = raw
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  for (const name of names) {
    if (!VALID_TOOLS.has(name)) {
      throw new EngineError(
        `--client names ${JSON.stringify(name)}, which is not a client this engine sets up. ` +
          `Use one or more of: ${TOOLS.join(", ")}.`,
        { code: "CONFIG_ERROR" },
      );
    }
  }
  // TOOLS order, not argument order, so two spellings of one selection plan
  // identically — the same rule `planPluginSetup` applies to the roots.
  return TOOLS.filter((tool) => names.includes(tool));
}

/**
 * The roots this run acts on: one per selected client, read from the resolved
 * plugin root.
 *
 * `--client` defaults to the root's OWN client, which is the invocation a
 * client's own st-setup command produces (it exports its root variable and
 * nothing else). An explicit `--client` naming a different client is refused by
 * `planPluginSetup` against the root's declared `client` — the refusal belongs
 * there because it is a statement about the root, not about the flag.
 */
async function resolveRoots(
  opts: Record<string, unknown>,
  env: Readonly<Record<string, string | undefined>>,
): Promise<PluginSetupRoot[]> {
  const flag = opts["pluginRoot"];
  const root = resolvePluginRoot({
    ...(typeof flag === "string" ? { flag } : {}),
    env,
  });
  if (root === null) {
    throw new EngineError(
      `No installed plugin root: pass --plugin-root, or set ${PLUGIN_ROOT_VARIABLES.join(", ")}.`,
      { code: "CONFIG_ERROR" },
    );
  }
  const file = await readCapabilityFile(root);
  const clients = parseClients(opts["client"]);
  const selected = clients.length === 0 ? [file.client] : clients;
  return selected.map((tool) => ({ tool, root, file }));
}

/** One `wrote` line: what the run did, or what a preview says it would do. */
function wroteLine(report: InitApplyReport): string {
  const counted = new Map<string, number>();
  for (const result of report.wrote) {
    counted.set(result.action, (counted.get(result.action) ?? 0) + 1);
  }
  const breakdown = [...counted.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([action, count]) => `${count} ${action}`)
    .join(", ");
  const verb = report.dryRun ? "would write" : "wrote";
  return `${verb} ${report.wrote.length} file(s)${breakdown === "" ? "" : `: ${breakdown}`}`;
}

/**
 * What the plugin delivers instead of emission, per client.
 *
 * Read from the MANIFEST the run wrote, because that is the record every later
 * `sync`, `check` and `clean` will read — a panel derived from the inputs could
 * agree with what was asked for and disagree with what was recorded. A preview
 * has no manifest to read, so it reports the roots it WOULD record, through the
 * same `carriedClasses` the engine records and in the same `TOOLS` order
 * `pluginOwnedSummary` returns.
 */
async function ownedSummary(
  ctx: CliContext,
  rootDir: string,
  roots: readonly PluginSetupRoot[],
  dryRun: boolean,
): Promise<PluginOwnedClasses[]> {
  if (!dryRun) {
    const manifest = await ctx.engine.manifest.manifest.readManifest(rootDir);
    if (manifest !== null) return pluginOwnedSummary(manifest);
  }
  return TOOLS.flatMap((tool) => {
    const entry = roots.find((row) => row.tool === tool);
    if (entry === undefined) return [];
    const classes = carriedClasses(entry.file);
    return classes.length === 0 ? [] : [{ tool, classes }];
  });
}

/** The status table: one label per row, the client rows in `TOOLS` order. */
function renderStatus(ctx: CliContext, report: PluginStatusReport): void {
  const { palette } = ctx;
  const row = (label: string, detail: string): void => {
    ctx.io.out(`  ${palette.bold(label.padEnd(LABEL_WIDTH))}  ${detail}\n`);
  };

  ctx.io.out(`${palette.bold("plugin")} (${report.installMode})\n`);
  row(
    "runtime",
    report.runtime.message === null
      ? `${report.runtime.kind} ${report.runtime.version ?? "unknown"} at ${report.runtime.path ?? "unknown"}`
      : `${report.runtime.kind} — ${report.runtime.message}`,
  );
  row(
    "node",
    `${report.node.version} (floor ${report.node.floor ?? "unstated"})` +
      (report.node.ok ? "" : " — below the floor"),
  );
  for (const client of report.clients) {
    const parts = [
      client.recorded === null
        ? "no plugin recorded"
        : `records plugin ${client.recorded.version}: ${client.recorded.classes.join(", ")}`,
      client.rootFound
        ? `root ${client.rootVersion ?? "unknown"} (client floor ${client.clientFloor})`
        : "no root for this client",
      client.selected ? "selected" : "not selected",
    ];
    row(client.tool, parts.join("; "));
  }
  row("compatibility", compatibilityLine(report));
  row(
    "duplicates",
    report.duplicates.length === 0
      ? "none"
      : report.duplicates
          .map((entry) => `${entry.tool}: ${entry.class} (${entry.files} file(s))`)
          .join(`\n${CONTINUATION}`),
  );
  row("setup", setupLines(report).join(`\n${CONTINUATION}`));
}

/** The compatibility row, naming BOTH versions whenever it has both. */
function compatibilityLine(report: PluginStatusReport): string {
  const { state, pluginVersion, manifestVersion } = report.compatibility;
  if (state === "not-applicable") {
    return pluginVersion === null
      ? "not applicable — no plugin root to compare"
      : "not applicable — this repository records no generated version";
  }
  return (
    `${state} — plugin ${pluginVersion ?? "unknown"}, state written by ` +
    `${manifestVersion ?? "unknown"}`
  );
}

/** The setup row: whether one is needed, then every unconfigured fact. */
function setupLines(report: PluginStatusReport): string[] {
  const head = report.setup.needed
    ? `needed — no setup here; run ${packageCommand("plugin setup --client <csv>")}`
    : "not needed — this repository already carries a setup";
  return [
    head,
    ...report.setup.unconfigured.map((entry) => `unconfigured ${entry.fact}: ${entry.command}`),
  ];
}

/** `plugin status` — a read that always exits 0. */
async function runStatus(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
  const pluginRoot = opts["pluginRoot"];
  const report = await buildPluginStatus(ctx.app.runtime.cwd, ctx.engine, {
    ...(typeof pluginRoot === "string" ? { pluginRoot } : {}),
    env: ctx.app.runtime.env,
    nodeVersion: process.versions.node,
  });

  renderStatus(ctx, report);
  return { exitCode: 0, json: { ...report } };
}

/** `plugin setup` — the repository-owned files, and nothing of a carried class. */
async function runSetup(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
  const rootDir = ctx.app.runtime.cwd;
  const roots = await resolveRoots(opts, ctx.app.runtime.env);

  // Ahead of the plan, so a refused run costs no detection walk and cannot
  // half-write: REQ-PLUGIN-015 asks for 0 files written, which is a property of
  // this ordering rather than of the writer.
  if (await hasManifest(rootDir)) {
    throw new EngineError(cleanThenSetup(roots.map((entry) => entry.tool)), {
      code: "VALIDATION_ERROR",
      why: "a plugin-backed setup records ownership on a manifest it creates, and this repository already has one",
      next: `${packageCommand("clean -y")} keeps learnings, handoffs, overrides and user hooks`,
    });
  }

  const report = await applyPluginSetup({
    rootDir,
    roots,
    engineVersion: ctx.app.version,
    dryRun: ctx.dryRun,
    now: ctx.app.runtime.clock.now(),
  });
  const owned = await ownedSummary(ctx, rootDir, roots, ctx.dryRun);

  ctx.io.out(`${ctx.palette.bold("plugin setup")}\n`);
  ctx.io.out(`  ${wroteLine(report)}\n`);
  for (const entry of owned) {
    ctx.io.out(`  ${ctx.palette.dim(`plugin-owned  ${entry.tool}: ${entry.classes.join(", ")}`)}\n`);
  }
  for (const warning of report.warnings) ctx.io.out(`  ${ctx.palette.yellow(warning)}\n`);

  return {
    exitCode: 0,
    json: {
      dryRun: report.dryRun,
      manifestPath: report.manifestPath,
      wrote: report.wrote.map((result) => ({ ...result })),
      warnings: [...report.warnings],
      ledgerCount: report.ledgerCount,
      pluginOwned: owned.map((entry) => ({ tool: entry.tool, classes: [...entry.classes] })),
    },
  };
}

export const pluginCommand: CommandModule = {
  name: "plugin",
  summary: "run this repository on an installed stamity plugin: status, setup",
  // `setup` writes the repository-owned half of a setup, so the shared
  // --dry-run flag registers. It is inert on `status`, which is a read.
  mutating: true,
  args: [
    // The description is copied verbatim into the generated `docs/cli-reference.md`
    // (`../docs/cliReference.ts`, byte-gated by its suite), so editing this
    // string is a docs change: regenerate the page in the same change.
    {
      name: "subcommand",
      description: "status (default), setup",
      required: false,
    },
  ],

  /**
   * Commander registers flags per COMMAND, not per subcommand, so both are
   * visible everywhere: `--plugin-root` is read by both (status probes the root
   * it names), `--client` by `setup` alone. Editing either string is a docs
   * change — the generated reference page copies them verbatim.
   */
  configure(cmd: Command): void {
    cmd.option("--client <csv>", `clients to act on (${TOOLS.join(", ")})`);
    cmd.option(
      "--plugin-root <path>",
      "the installed plugin root; defaults to CLAUDE_PLUGIN_ROOT, CURSOR_PLUGIN_ROOT or PLUGIN_ROOT",
    );
  },

  run: async (ctx, opts, args): Promise<CommandResult> => {
    const [subcommand] = args;

    // Bare `plugin` is status on EVERY stream, terminal included: the two
    // subcommands are a read and a write, and a picker between them would put a
    // prompt in front of the read.
    if (subcommand === undefined) return runStatus(ctx, opts);

    switch (subcommand) {
      case "status":
        return runStatus(ctx, opts);
      case "setup":
        return runSetup(ctx, opts);
      default:
        throw new CliFailure({
          code: "USAGE",
          message: `unknown plugin subcommand ${JSON.stringify(subcommand)}`,
          why: "plugin takes one of two subcommands",
          next: `use one of: ${SUBCOMMANDS.join(", ")}`,
        });
    }
  },
};
