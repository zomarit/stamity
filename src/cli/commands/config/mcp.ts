import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CliFailure } from "../../kit/output.ts";
import type { CliContext, CommandResult } from "../../kit/program.ts";
import type { McpServerMeta, PackSuppliedServer } from "../../../mcp/catalog.ts";
import { discoverInstalledPacks, packMcpServers } from "../../../pack/projection.ts";
import type { SetupManifest } from "../../../types/manifest.ts";

/**
 * The MCP touchpoint of `stamity config` — `config mcp list | add <id> | remove
 * <id>`. There is no standalone `mcp` command: server management is
 * configuration, so it folds in here.
 *
 * Engine access rule for this file: everything goes through `ctx.engine`, the
 * typed composition root. No MCP behaviour is re-implemented — the catalog
 * decides which ids exist, `ensureEnvMcp` owns the credential file, and
 * `writeManifest` owns validation, atomicity, and the write lock. The one
 * direct engine import is `../../../pack/projection.ts`, which the composition
 * registry does not yet carry a field for; it is imported like the pure
 * helpers `config.ts` reaches for, and moving it onto `ctx.engine.pack` is a
 * registry edit that belongs to whoever owns that file.
 *
 * **Which ids exist is a two-part answer.** The curated catalog is one half;
 * an installed pack's `mcp_servers/` supply is the other, resolved here from
 * the ledger exactly as emission resolves it. Installing a pack makes its
 * server ids RESOLVABLE — selecting one is still this command's act, and an
 * operator who just installed a pack must not be told their own server does
 * not exist.
 *
 * Division of labour with the parent module: `config.ts` imports this file, so
 * the two helpers both halves need — {@link requireSetupManifest} and
 * {@link NEXT_SYNC_LINE} — live HERE. The reverse edge (child importing parent)
 * would be an import cycle.
 *
 * Credential posture: `.env.mcp` is the operator's file. `add` extends it with
 * placeholder names and never rewrites a filled-in value; `remove` does not
 * touch it at all — a credential is user data, and deselecting a server is not
 * a reason to throw it away. Values are never printed: what reaches the
 * terminal is a name plus a set/missing verdict, or a masked rendering from the
 * engine's own reporter.
 *
 * **Execution disclosure.** An MCP server is not a document — it is an argv the
 * editor spawns, with the operator's privileges. `add` is the act that selects
 * it and `sync` is the act that writes it into the client config, so `add` and
 * `list` are the two surfaces where the operator can still change their mind.
 * Both used to print an id, a description, a supplier and credential rows:
 * prose about what the server IS, and nothing about what it RUNS. For a curated
 * row that prose is a reviewed claim; for a pack-supplied row the description
 * and the blast-radius note are written by the pack author, so on exactly the
 * rows where prose is least load-bearing it was the only thing shown. Both
 * surfaces now render the launcher — see {@link renderLauncher} — in the
 * DEFAULT view, because an argv reachable only behind a flag is not disclosed
 * to the operator who is deciding.
 */

/**
 * The continuous-onboarding closer for every config mutation. `config` edits
 * state; `sync` applies it — so a successful write always names the next verb.
 */
export const NEXT_SYNC_LINE = "next: run stamity sync to apply";

/** Dry-run closer: nothing was written, so the next step is the real run first. */
export const NEXT_DRY_RUN_LINE =
  "next: re-run without --dry-run to apply, then run stamity sync";

/**
 * The repo's manifest, or a failure telling the operator to initialise. Every
 * config path needs an initialised repo: `config` reads and edits the manifest,
 * and there is nothing to read or edit before `init` has written one.
 */
export async function requireSetupManifest(
  ctx: CliContext,
  rootDir: string,
): Promise<SetupManifest> {
  const manifest = await ctx.engine.manifest.manifest.readManifest(rootDir);
  if (manifest !== null) return manifest;
  throw new CliFailure({
    code: "CONFIG_ERROR",
    message: `no stamity setup found in ${rootDir}`,
    why: `${ctx.engine.manifest.manifest.manifestPath(rootDir)} does not exist`,
    next: "run stamity init to create one",
  });
}

/** Selected server ids, in selection order. Absent `mcp` reads as none selected. */
function selectedServers(manifest: SetupManifest): string[] {
  return [...(manifest.mcp?.servers ?? [])];
}

/** Every curated catalog id, in catalog order — half the answer to "which ids exist". */
function catalogIds(ctx: CliContext): string[] {
  return Object.keys(ctx.engine.mcp.catalog.CURATED_MCP_SERVERS);
}

/**
 * The other half: every MCP server the installed packs supply, sorted by id.
 * Read from the ledger through the same seam emission uses, so this command
 * and the emitted config agree on exactly which ids resolve. A repo with no
 * installed packs touches no extra files and gets an empty list.
 */
async function installedPackServers(
  rootDir: string,
  manifest: SetupManifest,
): Promise<PackSuppliedServer[]> {
  return packMcpServers(await discoverInstalledPacks(rootDir, manifest), rootDir);
}

/** Server list for display; an empty selection reads as a word, not a blank. */
function renderServers(servers: readonly string[]): string {
  return servers.length === 0 ? "none" : servers.join(", ");
}

/** Parsed `.env.mcp`, or an empty map when the repo has no credential file yet. */
async function readEnvValues(
  ctx: CliContext,
  rootDir: string,
): Promise<Record<string, string>> {
  try {
    const raw = await readFile(join(rootDir, ctx.engine.mcp.env.ENV_MCP_FILE), "utf8");
    return ctx.engine.mcp.env.parseEnvFile(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

interface EnvRow {
  name: string;
  set: boolean;
}

/**
 * Set/missing verdict for exactly the variables `serverIds` require, read off
 * the values already in `.env.mcp`. Routed through the engine's reporter so the
 * masking rules stay in one place; only `name` and `set` are carried out of it.
 */
function envRowsFor(
  ctx: CliContext,
  serverIds: readonly string[],
  values: Record<string, string>,
  packServers: readonly PackSuppliedServer[] = [],
): EnvRow[] {
  const required = ctx.engine.mcp.env.collectRequiredEnvVars(serverIds, packServers);
  const subset: Record<string, string> = {};
  for (const envVar of required) subset[envVar.name] = values[envVar.name] ?? "";
  return ctx.engine.mcp.env.reportEnvValues(subset).map((report) => ({
    name: report.name,
    set: report.set,
  }));
}

/**
 * A literal credential already sitting in `.env.mcp` is reported, never blocked
 * — that file is exactly where a literal belongs, and the ignore rule is
 * re-asserted on every add. The warning goes to stderr so it survives `--json`.
 */
function warnOnStoredSecrets(ctx: CliContext, values: Record<string, string>): void {
  const result = ctx.engine.mcp.secretScan.detectSecrets(values);
  if (result.clean) return;
  ctx.io.err(
    `${ctx.palette.yellow("warning:")} .env.mcp holds live credential values — ` +
      `it is gitignored; never commit it or inline a value into a client config.\n` +
      `${ctx.engine.mcp.secretScan.formatSecretFindings(result)}\n`,
  );
}

/**
 * The installed-pack half of "which ids exist", rendered once so the two prose
 * surfaces that state it — the empty-state list and the `add` refusal — cannot
 * drift apart. `null` means there is nothing to disclose; what an absent half
 * reads as is the caller's call, because the refusal has to say something
 * ("no installed pack supplies a server") where the list says nothing at all.
 */
function packSupplyLine(packServers: readonly PackSuppliedServer[]): string | null {
  const ids = packServers.map((server) => server.id);
  return ids.length === 0 ? null : `installed packs: ${ids.join(", ")}`;
}

/** One list row's display name: where the id came from, said once. */
function labelFor(
  ctx: CliContext,
  row: { id: string; curated: boolean; pack: string | null },
): string {
  if (row.curated) return row.id;
  if (row.pack !== null) return `${row.id} ${ctx.palette.dim(`(pack ${row.pack})`)}`;
  return `${row.id} ${ctx.palette.yellow("(not in catalog)")}`;
}

/** Longest launcher line rendered before it is elided; `--json` carries it whole. */
const MAX_LAUNCHER_CHARS = 160;

/** Heading over the launcher block, identical on both surfaces that print it. */
const RUNS_HEADING = "runs on this machine:";

/**
 * What an id with no resolution has to say. Silence would read as "nothing
 * runs", and the true statement is narrower: this repo cannot say what runs,
 * because nothing supplies a definition for the id the manifest holds.
 */
const UNRESOLVED_LAUNCHER =
  "no command line — no curated row and no installed pack supplies this id";

/** Where the whole argv is, printed only when the display line was cut short. */
const FULL_ARGV_LINE = "line elided — run with --json for the argv in full";

/** One launcher argv rendered for a terminal, with whether anything was cut. */
interface LauncherLine {
  text: string;
  elided: boolean;
}

/**
 * One launcher argv as a display line: control characters flattened, length
 * bounded.
 *
 * Both rules are about the terminal, not about the data. A pack-supplied `args`
 * entry is third-party text — ingress checks `command` against a bare-launcher
 * pattern and refuses shells (`../../../pack/manifest.ts` → `readServerCommand`)
 * but takes `args` as any string array (`readServerArgs`) — and it is about to
 * be printed on the one line whose whole job is to be read accurately. A
 * carriage return or an escape sequence in it could erase or repaint the line
 * the operator is reading, so the class is flattened to spaces before it is
 * shown rather than trusted to be inert.
 *
 * Placeholders pass through as themselves. A variable reference in a pinned row
 * is the literal token `${env:NAME}` (`../../../mcp/catalog.ts` → the `github`
 * row), so rendering the argv renders the placeholder; no `.env.mcp` value is
 * read into this line, which keeps the module header's "values are never
 * printed" rule true on the new surface as well.
 *
 * The `--json` payload carries `command` and `args` verbatim and unelided
 * instead: `JSON.stringify` escapes control characters, so a machine consumer
 * needs no flattening and must not be handed a truncated argv.
 *
 * KNOWN RESIDUAL — stated twice in this tree. `../add.ts` → `commandLine`
 * renders the same argv for the pack-install preview under the same two rules;
 * it is the other half of the same finding, landed first. Neither file may
 * import the other: they are separate CLI units in the SAME boundary wave, and
 * the layering rule admits only same-unit or earlier-wave edges
 * (`test/architecture/boundaries.test.ts` → "A file may import only same-unit
 * or earlier-wave files"). The close is one helper under `../../kit/` that both
 * call — a third file, plus the edit that repoints `add.ts` at it. Until that
 * lands, a change to the flattening rule here has a twin THERE.
 */
function launcherLine(command: string, args: readonly string[]): LauncherLine {
  const flat = [command, ...args]
    .join(" ")
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (flat === "") return { text: "(declares no command)", elided: false };
  if (flat.length <= MAX_LAUNCHER_CHARS) return { text: flat, elided: false };
  return { text: `${flat.slice(0, MAX_LAUNCHER_CHARS - 1)}…`, elided: true };
}

/**
 * What the argv does when the client starts, per transport.
 *
 * Both transports SPAWN it locally: `http` reaches its remote endpoint through
 * a locally launched bridge (`../../../mcp/catalog.ts` → `McpServerMeta.transport`).
 * Saying only "remote" would let an operator read `http` as "runs elsewhere",
 * which is the one wrong conclusion this line exists to prevent.
 */
function transportNote(transport: McpServerMeta["transport"]): string {
  return transport === "stdio"
    ? "stdio — your editor spawns this argv as a child process, with your privileges"
    : "http — your editor spawns this argv locally as a bridge to a remote endpoint, with your privileges";
}

/**
 * Who wrote the row, said on the rows where it changes how the prose should be
 * read. A curated row was reviewed and pinned in this repository; a pack row
 * was written by the pack author and carries its own `description` and
 * `blastRadius`. The argv above it is the fact either way.
 */
function packAuthoredNote(packId: string): string {
  return (
    `supplied by pack ${packId} — its description and blast-radius note are the pack author's ` +
    `words, not a review; the command line above is what runs`
  );
}

/**
 * The launcher a selected id resolves to, on the surface that selects it.
 *
 * `indent` is the caller's, because the two surfaces nest differently: `add`
 * prints one outcome, `list` prints a block per row. `packId` is non-null only
 * when the resolution came from pack supply — a pack may add a server and never
 * redefine a curated one, and a colliding pack id is refused at projection
 * (`../../../pack/projection.ts` → `packMcpServers` calls
 * `assertNoCuratedCollision`), so a supplier found for a curated id cannot be
 * what resolved.
 */
function renderLauncher(
  ctx: CliContext,
  indent: string,
  meta: McpServerMeta | undefined,
  packId: string | null,
): void {
  const { io, palette } = ctx;
  io.out(`${indent}${palette.bold(RUNS_HEADING)}\n`);
  if (meta === undefined) {
    io.out(`${indent}  ${palette.yellow(UNRESOLVED_LAUNCHER)}\n`);
    return;
  }
  const line = launcherLine(meta.command, meta.args);
  io.out(`${indent}  ${palette.yellow(line.text)}\n`);
  io.out(`${indent}  ${palette.dim(transportNote(meta.transport))}\n`);
  if (packId !== null) io.out(`${indent}  ${palette.dim(packAuthoredNote(packId))}\n`);
  if (line.elided) io.out(`${indent}  ${palette.dim(FULL_ARGV_LINE)}\n`);
}

/** The launcher as the `--json` payload carries it: verbatim, unelided, or null. */
function launcherPayload(
  meta: McpServerMeta | undefined,
): { command: string; args: readonly string[]; transport: McpServerMeta["transport"] } | null {
  if (meta === undefined) return null;
  return { command: meta.command, args: meta.args, transport: meta.transport };
}

/** The selected servers, what each one does and runs, and which variables are still blank. */
export async function runMcpList(ctx: CliContext, rootDir: string): Promise<CommandResult> {
  const manifest = await requireSetupManifest(ctx, rootDir);
  const servers = selectedServers(manifest);
  const values = await readEnvValues(ctx, rootDir);
  const packServers = await installedPackServers(rootDir, manifest);

  const rows = servers.map((id) => {
    const meta = ctx.engine.mcp.catalog.resolveServerMeta(id, packServers);
    const supplier = packServers.find((server) => server.id === id);
    return {
      id,
      description: meta?.description ?? null,
      // Curated means the reviewed table, never "resolves somehow": a curated
      // id always wins resolution, so the two are disjoint by construction.
      curated: meta !== undefined && supplier === undefined,
      pack: supplier?.sourcePackId ?? null,
      // Carried on the row rather than re-resolved at render time: the human
      // block and the payload then describe one resolution, and cannot drift
      // into disagreeing about what a selected id launches.
      meta,
      launcher: launcherPayload(meta),
      env: envRowsFor(ctx, [id], values, packServers),
    };
  });

  if (rows.length === 0) {
    ctx.io.out("mcp servers: none selected\n");
    ctx.io.out(`  ${ctx.palette.dim(`curated: ${catalogIds(ctx).join(", ")}`)}\n`);
    // Both halves, always — the same rule the `add` refusal follows, in the
    // one place that used to break it. An operator who just installed a pack
    // and is shown the curated list alone reads it as "my server does not
    // exist". A repo with no pack gains no line: `packServers` is already in
    // hand from the rows above, so disclosing costs no extra read either way.
    const supply = packSupplyLine(packServers);
    if (supply !== null) ctx.io.out(`  ${ctx.palette.dim(supply)}\n`);
    ctx.io.out("next: run stamity config mcp add <id> to select one\n");
  } else {
    ctx.io.out(`mcp servers (${rows.length} selected)\n`);
    for (const row of rows) {
      const label = labelFor(ctx, row);
      ctx.io.out(`  ${ctx.palette.bold(label)}  ${ctx.palette.dim(row.description ?? "")}\n`);
      // Before the credential rows, because the argv is the question the
      // credentials are downstream of: a variable is worth filling in only for
      // a launcher the operator meant to keep.
      renderLauncher(ctx, "    ", row.meta, row.pack);
      for (const envVar of row.env) {
        const verdict = envVar.set ? ctx.palette.green("set") : ctx.palette.yellow("missing");
        ctx.io.out(`    ${envVar.name}  ${verdict}\n`);
      }
    }
  }

  return {
    exitCode: 0,
    json: {
      // Named field by field rather than spread: `meta` is the whole resolved
      // catalog row and exists on `rows` for rendering only. `launcher` is the
      // payload's answer to what a selection runs — verbatim and unelided,
      // which is the half the bounded terminal line cannot carry.
      servers: rows.map((row) => ({
        id: row.id,
        description: row.description,
        curated: row.curated,
        pack: row.pack,
        launcher: row.launcher,
        env: row.env,
      })),
      catalog: catalogIds(ctx),
      packCatalog: packServers.map((server) => server.id),
    },
  };
}

/**
 * Select a server the repo can actually resolve — curated, or supplied by an
 * installed pack: record it, disclose the argv the selection resolves to, make
 * sure the credential file carries its variables and stays gitignored, then say
 * what the operator still has to fill in. Idempotent — an id already selected
 * is reported and nothing is written.
 *
 * The launcher block prints on the two branches that SELECT — the applied one
 * and `--dry-run` — and not on the already-selected branch, which performs no
 * selection and writes nothing. The rule is that the disclosure travels with
 * the act: a re-run that changes nothing makes no new claim, and an operator
 * auditing a standing selection reads it from `config mcp list`, which prints
 * the same block per row.
 */
export async function runMcpAdd(
  ctx: CliContext,
  rootDir: string,
  id: string,
): Promise<CommandResult> {
  const manifest = await requireSetupManifest(ctx, rootDir);
  const packServers = await installedPackServers(rootDir, manifest);

  const { unknown } = ctx.engine.mcp.catalog.validateServerIds([id], packServers);
  if (unknown.length > 0) {
    const supply = packSupplyLine(packServers);
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `unknown MCP server ${JSON.stringify(id)}`,
      why:
        "a server is selectable when the curated catalog pins it or an installed pack supplies it",
      // Both halves, always: an operator who just installed a pack and is shown
      // only the curated list reads it as "my server does not exist". The pack
      // half comes from the shared renderer, so this text and the empty-state
      // list state the same fact the same way by construction.
      next:
        `curated: ${catalogIds(ctx).join(", ")}` +
        (supply === null ? "; no installed pack supplies a server" : `; ${supply}`),
    });
  }

  const current = selectedServers(manifest);
  if (current.includes(id)) {
    ctx.io.out(`${id} is already selected — nothing to add.\n`);
    return { exitCode: 0, json: { id, added: false, servers: current } };
  }

  // Resolved once for both branches. The id passed `validateServerIds` above,
  // so this cannot be `undefined` in practice; it is typed as if it could
  // because `resolveServerMeta` says so, and {@link renderLauncher} answers the
  // absent case honestly rather than asserting the resolution twice.
  const meta = ctx.engine.mcp.catalog.resolveServerMeta(id, packServers);
  const packId = packServers.find((server) => server.id === id)?.sourcePackId ?? null;
  const launcher = launcherPayload(meta);

  const servers = [...current, id];
  if (ctx.dryRun) {
    ctx.io.out(`would add ${ctx.palette.bold(id)} to mcp.servers\n`);
    ctx.io.out(`  ${renderServers(current)} ${ctx.palette.cyan("->")} ${renderServers(servers)}\n`);
    // Disclosed on the preview branch too, and identically. A dry run is where
    // an operator goes to find out what a selection would do, so it is the last
    // branch that may be the quieter one.
    renderLauncher(ctx, "  ", meta, packId);
    ctx.io.out(`${NEXT_DRY_RUN_LINE}\n`);
    return { exitCode: 0, json: { id, added: false, dryRun: true, servers, launcher } };
  }

  // Credential file first, manifest last: a failure between the two leaves
  // spare placeholder names in an ignored file, not a selection whose
  // credentials were never provisioned.
  await ctx.engine.mcp.env.ensureEnvMcp(rootDir, servers, packServers);
  await ctx.engine.mcp.env.ensureGitignoreEntry(rootDir);
  await ctx.engine.manifest.manifest.writeManifest(rootDir, {
    ...manifest,
    mcp: { ...manifest.mcp, servers },
  });

  const values = await readEnvValues(ctx, rootDir);
  const env = envRowsFor(ctx, [id], values, packServers);

  ctx.io.out(`added ${ctx.palette.bold(id)} to mcp.servers\n`);
  ctx.io.out(`  ${renderServers(current)} ${ctx.palette.cyan("->")} ${renderServers(servers)}\n`);
  // After the write, before the credentials: the manifest edit is not the act
  // that runs anything — `stamity sync` writes the client config, and the
  // closing line names it — so the operator still has a gate, and reads what
  // they just selected before deciding whether to provision it or remove it.
  renderLauncher(ctx, "  ", meta, packId);
  if (env.length > 0) {
    ctx.io.out(`credentials (${ctx.engine.mcp.env.ENV_MCP_FILE}):\n`);
    for (const envVar of env) {
      const verdict = envVar.set
        ? ctx.palette.green("set")
        : ctx.palette.yellow("missing — fill it in");
      ctx.io.out(`  ${envVar.name}  ${verdict}\n`);
    }
    ctx.io.out("load them into your environment before starting the tool:\n");
    ctx.io.out(`  ${ctx.engine.mcp.env.getSourceEnvMcpCommand()}\n`);
  }
  warnOnStoredSecrets(ctx, values);
  ctx.io.out(`${NEXT_SYNC_LINE}\n`);

  return {
    exitCode: 0,
    json: { id, added: true, servers, env, launcher, envFile: ctx.engine.mcp.env.ENV_MCP_FILE },
  };
}

/**
 * Deselect a server. Membership is judged against the persisted list, not the
 * catalog, so an id that has since left the catalog can still be removed.
 * `.env.mcp` is left byte-for-byte alone: the value in it is the operator's.
 */
export async function runMcpRemove(
  ctx: CliContext,
  rootDir: string,
  id: string,
): Promise<CommandResult> {
  const manifest = await requireSetupManifest(ctx, rootDir);
  const current = selectedServers(manifest);

  if (!current.includes(id)) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `${JSON.stringify(id)} is not a selected MCP server`,
      why: `selected: ${renderServers(current)}`,
      next:
        current.length === 0
          ? "run stamity config mcp add <id> to select one"
          : "run stamity config mcp list to see the current selection",
    });
  }

  const servers = current.filter((server) => server !== id);
  if (ctx.dryRun) {
    ctx.io.out(`would remove ${ctx.palette.bold(id)} from mcp.servers\n`);
    ctx.io.out(`  ${renderServers(current)} ${ctx.palette.cyan("->")} ${renderServers(servers)}\n`);
    ctx.io.out(`${NEXT_DRY_RUN_LINE}\n`);
    return { exitCode: 0, json: { id, removed: false, dryRun: true, servers } };
  }

  await ctx.engine.manifest.manifest.writeManifest(rootDir, {
    ...manifest,
    mcp: { ...manifest.mcp, servers },
  });

  ctx.io.out(`removed ${ctx.palette.bold(id)} from mcp.servers\n`);
  ctx.io.out(`  ${renderServers(current)} ${ctx.palette.cyan("->")} ${renderServers(servers)}\n`);
  ctx.io.out(
    `  ${ctx.palette.dim(`${ctx.engine.mcp.env.ENV_MCP_FILE} left untouched — the values in it are yours`)}\n`,
  );
  ctx.io.out(`${NEXT_SYNC_LINE}\n`);

  return { exitCode: 0, json: { id, removed: true, servers } };
}
