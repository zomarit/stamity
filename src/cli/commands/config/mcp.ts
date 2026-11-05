import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CliFailure } from "../../kit/output.ts";
import type { CliContext, CommandResult } from "../../kit/program.ts";
import { sanitizeLabel } from "../../kit/prompts.ts";
import type { McpServerMeta, PackSuppliedServer } from "../../../mcp/catalog.ts";
import { keepSavedModelLists } from "../../engine/clientModels.ts";
import { coOwnedDocumentLanes, coOwnedOwnershipOf, readIfExists, sha256 } from "../../engine/emissionWrite.ts";
import { OWN_SERVER_SOURCE, provableOwnServers, withOwnServers } from "../../../mcp/ownServers.ts";
import { discoverInstalledPacks, packMcpServers } from "../../../pack/projection.ts";
import { EngineError } from "../../../types/errors.ts";
import type { CoOwnership, LedgerEntry, McpOwnServer, SetupManifest } from "../../../types/manifest.ts";

/**
 * The MCP touchpoint of `stamity config` — `config mcp list | add <id> | remove
 * <id> | own <file> | own --remove <id>`. There is no standalone `mcp` command:
 * server management is configuration, so it folds in here.
 *
 * Engine access rule for this file: everything goes through `ctx.engine`, the
 * typed composition root. No MCP behaviour is re-implemented — the catalog
 * decides which ids exist, `ensureEnvMcp` owns the credential file, and
 * `writeManifest` owns validation, atomicity, and the write lock. The direct
 * engine imports are `../../../pack/projection.ts`,
 * `../../engine/clientModels.ts` (the model list cache, as `config.ts` imports
 * it), `../../engine/emissionWrite.ts` and `../../../mcp/ownServers.ts`, which
 * the composition registry does not carry a field for; they are imported like
 * the pure helpers `config.ts` reaches for, and moving them onto `ctx.engine` is
 * a registry edit that belongs to whoever owns that file.
 *
 * **Which ids exist is a three-part answer.** The curated catalog is one part;
 * an installed pack's `mcp_servers/` supply is another, resolved here from the
 * ledger exactly as emission resolves it; the manifest's `mcp.ownServers` rows
 * are the third, joined at the same seam (`../../../mcp/ownServers.ts`).
 * Installing a pack or adding a row makes an id RESOLVABLE — selecting one is
 * still this command's act, and an operator who just installed a pack must not
 * be told their own server does not exist.
 *
 * Division of labour with the parent module: `config.ts` imports this file, so
 * the helpers both halves need — {@link requireSetupManifest},
 * {@link writeSetupManifest} and {@link NEXT_SYNC_LINE} — live HERE. The
 * reverse edge (child importing parent) would be an import cycle.
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

/**
 * Persist `manifest` through `writeManifest`, moving the model lists a 1.15.0
 * manifest on disk still saves to the cache first and naming each warning on
 * stderr, as `sync` does (REQ-LADDER-009): the write leaves `models.listed`
 * out, and a list it drops before reaching the cache is gone. The one write
 * path of `config set`, `config detect` and `config mcp add | remove`.
 */
export async function writeSetupManifest(ctx: CliContext, rootDir: string, manifest: SetupManifest): Promise<void> {
  for (const warning of await keepSavedModelLists(rootDir)) ctx.io.err(`warning: ${warning}\n`);
  await ctx.engine.manifest.manifest.writeManifest(rootDir, manifest);
}

/** Selected server ids, in selection order. Absent `mcp` reads as none selected. */
function selectedServers(manifest: SetupManifest): string[] {
  return [...(manifest.mcp?.servers ?? [])];
}

/** Every curated catalog id, in catalog order — half the answer to "which ids exist". */
function catalogIds(ctx: CliContext): string[] {
  return Object.keys(ctx.engine.mcp.catalog.CURATED_MCP_SERVERS);
}

/** Every MCP server the installed packs supply, sorted by id, with no own row among them. */
async function packRows(rootDir: string, manifest: SetupManifest): Promise<PackSuppliedServer[]> {
  return packMcpServers(await discoverInstalledPacks(rootDir, manifest), rootDir);
}

/**
 * {@link packRows} for the verb that clears a setup: a pack whose folder was
 * deleted by hand must not stop it, as it does not stop `clean`
 * (`../clean.ts::installedPackMcpSupply`). A pack read as empty proves nothing, so
 * an entry it supplied is judged the person's and kept, never deleted unproven.
 */
async function packRowsOrNone(rootDir: string, manifest: SetupManifest): Promise<PackSuppliedServer[]> {
  try {
    return await packRows(rootDir, manifest);
  } catch {
    // reason: not silent — a kept entry still prints as launching, and a Codex
    // table only a lost pack could render stops the verb by name.
    return [];
  }
}

/**
 * The other parts of "which ids exist": every server the installed packs supply
 * and every own row. Read through the same seam emission uses, so this command
 * and the emitted config agree on exactly which ids resolve, and a row past the
 * bar refuses here by name as it does in `sync`. A repo with no packs and no own
 * row touches no extra files and gets an empty list.
 */
async function installedPackServers(
  rootDir: string,
  manifest: SetupManifest,
): Promise<PackSuppliedServer[]> {
  return withOwnServers(await packRows(rootDir, manifest), manifest);
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

/** The ids in `servers` that came from `mcp.ownServers`, or from anywhere else when `own` is false. */
function idsOf(servers: readonly PackSuppliedServer[], own: boolean): string[] {
  return servers.filter((server) => (server.sourcePackId === OWN_SERVER_SOURCE) === own).map((server) => server.id);
}

/**
 * The installed-pack part of "which ids exist", rendered once so the prose
 * surfaces that state it — the empty-state list and the two refusals — cannot
 * drift apart. `null` means there is nothing to disclose; what an absent part
 * reads as is the caller's call, because a refusal has to say something
 * ("no installed pack supplies a server") where the list says nothing at all.
 */
function packSupplyLine(packServers: readonly PackSuppliedServer[]): string | null {
  const ids = idsOf(packServers, false);
  return ids.length === 0 ? null : `installed packs: ${ids.join(", ")}`;
}

/** {@link packSupplyLine} for the own rows; a repo with none says nothing about them. */
function ownSupplyLine(packServers: readonly PackSuppliedServer[]): string | null {
  const ids = idsOf(packServers, true);
  return ids.length === 0 ? null : `own servers: ${ids.join(", ")}`;
}

/**
 * What a refusal of an unknown id says past the curated list, in the shape
 * `config mcp add` and `config set mcp.servers` both print: an operator shown
 * only the curated ids reads the refusal as "my server does not exist".
 */
export function supplyClause(packServers: readonly PackSuppliedServer[]): string {
  const own = ownSupplyLine(packServers);
  return (
    `; ${packSupplyLine(packServers) ?? "no installed pack supplies a server"}` +
    (own === null ? "" : `; ${own}`)
  );
}

/** One list row's display name: where the id came from, said once. */
function labelFor(
  ctx: CliContext,
  row: { id: string; curated: boolean; own: boolean; pack: string | null },
): string {
  if (row.curated) return row.id;
  if (row.own) return `${row.id} ${ctx.palette.dim("(own server)")}`;
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
  if (packId === OWN_SERVER_SOURCE) {
    return (
      "this repository's own row in mcp.ownServers — its description and blast-radius note are " +
      "not a review; the command line above is what runs"
    );
  }
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
    const source = supplier?.sourcePackId ?? null;
    const own = source === OWN_SERVER_SOURCE;
    return {
      id,
      description: meta?.description ?? null,
      // Curated means the reviewed table, never "resolves somehow": a curated
      // id always wins resolution, so the two are disjoint by construction.
      curated: meta !== undefined && supplier === undefined,
      own,
      // The reserved source is the engine's word and names no pack.
      pack: own ? null : source,
      source,
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
    for (const supply of [packSupplyLine(packServers), ownSupplyLine(packServers)]) {
      if (supply !== null) ctx.io.out(`  ${ctx.palette.dim(supply)}\n`);
    }
    ctx.io.out("next: run stamity config mcp add <id> to select one\n");
  } else {
    ctx.io.out(`mcp servers (${rows.length} selected)\n`);
    for (const row of rows) {
      const label = labelFor(ctx, row);
      ctx.io.out(`  ${ctx.palette.bold(label)}  ${ctx.palette.dim(row.description ?? "")}\n`);
      // Before the credential rows, because the argv is the question the
      // credentials are downstream of: a variable is worth filling in only for
      // a launcher the operator meant to keep.
      renderLauncher(ctx, "    ", row.meta, row.source);
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
        own: row.own,
        pack: row.pack,
        launcher: row.launcher,
        env: row.env,
      })),
      catalog: catalogIds(ctx),
      packCatalog: idsOf(packServers, false),
      ownCatalog: idsOf(packServers, true),
    },
  };
}

/**
 * Select a server the repo can actually resolve — curated, supplied by an
 * installed pack, or an own row: record it, disclose the argv the selection resolves to, make
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
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `unknown MCP server ${JSON.stringify(id)}`,
      why:
        "a server is selectable when the curated catalog pins it, an installed pack supplies it, " +
        "or a row in mcp.ownServers holds it",
      // Every part, always: an operator who just installed a pack and is shown
      // only the curated list reads it as "my server does not exist". The rest
      // comes from the shared renderer, so this text and the empty-state list
      // state the same fact the same way by construction.
      next: `curated: ${catalogIds(ctx).join(", ")}${supplyClause(packServers)}`,
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
  // The ignore lines the grown selection needs (`.env.mcp`'s once a server
  // needs a credential), each appended line recorded on the ledger so `clean`
  // takes back exactly those (REQ-FLOW-016).
  const envLane = ctx.engine.mcp.env;
  await envLane.ensureEnvMcp(rootDir, servers, packServers);
  const gitignore = await envLane.reconcileGitignore(rootDir, {
    required: envLane.requiredGitignoreEntries({
      tools: manifest.tools,
      envVarsRequired: envLane.collectRequiredEnvVars(servers, packServers).length > 0,
      present: await envLane.presentGitignoreTargets(rootDir),
    }),
    previous: envLane.gitignoreRecordOf(manifest.ledger),
  });
  await writeSetupManifest(ctx, rootDir, {
    ...manifest,
    mcp: { ...manifest.mcp, servers },
    ledger: envLane.withGitignoreRows(manifest.ledger, manifest.tools, gitignore),
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

  await writeSetupManifest(ctx, rootDir, {
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

/**
 * The one row `file` holds, or a refusal. Unvalidated: {@link runMcpOwnAdd} puts
 * it through the seam with the rows it joins. A parse failure says only that it
 * failed, since the parser's own message quotes bytes of a file that may hold
 * the credential the row must not.
 */
async function readOwnRow(rootDir: string, file: string): Promise<McpOwnServer> {
  const refuse = (message: string, why: string): CliFailure =>
    new CliFailure({
      code: "VALIDATION_ERROR",
      message,
      why,
      next: "point stamity config mcp own at a JSON file holding one server row, the shape of a pack's mcp_servers/ file",
    });
  let raw: string;
  try {
    raw = await readFile(resolve(rootDir, file), "utf8");
  } catch (cause) {
    throw refuse(`cannot read ${file}`, (cause as NodeJS.ErrnoException).code ?? "the read failed");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw refuse(`${file} is not valid JSON`, "a row that does not parse cannot be checked, so nothing was written");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw refuse(`${file} does not hold one server row`, "the file must hold a single JSON object");
  }
  return parsed as McpOwnServer;
}

/** Every string under `value`, however deep, with the 40-character form a type refusal cuts a string to. */
function stringsUnder(value: unknown): string[] {
  if (typeof value === "string") return [value, `${value.slice(0, 40)}…`];
  return typeof value === "object" && value !== null ? Object.values(value).flatMap(stringsUnder) : [];
}

/**
 * `message` with no quoted field value of `rows` left in it. The seam names each
 * argument by its place, and the validator also quotes a `command`, a `docsUrl`,
 * a variable `name` or a `transport` it refuses. Those are where a pasted shell
 * line, or a link with its password in it, lands, and this text reaches logs and
 * transcripts. The field stays named beside the gap, and `id` stays because it
 * is how the person finds the row.
 */
function withoutRowValues(message: string, rows: readonly McpOwnServer[]): string {
  const fields = rows.flatMap((row) => Object.entries(row).filter(([key]) => key !== "id" && key !== "args"));
  return stringsUnder(fields.map(([, value]) => value as unknown)).reduce(
    (text, value) => text.replaceAll(JSON.stringify(value), "<value withheld>"),
    message,
  );
}

/**
 * Add the row in `file` to `mcp.ownServers` (REQ-FLOW-160). Every row goes
 * through the seam with the rows it joins, so the verb adds no trust of its own:
 * the pin, secret and text checks, and the refusal of an id a pack or another
 * row holds, are the ones `sync` runs. It selects nothing: as with a pack, a row
 * makes an id resolvable and `config mcp add` is the act that selects it. The
 * launcher prints here too, because this is where a person first says yes to it.
 */
export async function runMcpOwnAdd(
  ctx: CliContext,
  rootDir: string,
  file: string,
): Promise<CommandResult> {
  const manifest = await requireSetupManifest(ctx, rootDir);
  const row = await readOwnRow(rootDir, file);
  const mcp = {
    ...manifest.mcp,
    servers: selectedServers(manifest),
    ownServers: [...(manifest.mcp?.ownServers ?? []), row],
  };
  const packs = await packRows(rootDir, manifest);

  let supply: PackSuppliedServer[];
  try {
    supply = withOwnServers(packs, { mcp });
  } catch (cause) {
    if (!(cause instanceof EngineError)) throw cause;
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `the row in ${file} was not added, and nothing was written`,
      why: withoutRowValues(cause.message, mcp.ownServers),
      next: "fix what the refusal names and run the command again",
    });
  }

  const meta = ctx.engine.mcp.catalog.resolveServerMeta(row.id, supply);
  const launcher = launcherPayload(meta);
  if (ctx.dryRun) {
    ctx.io.out(`would add ${ctx.palette.bold(row.id)} to mcp.ownServers\n`);
    renderLauncher(ctx, "  ", meta, OWN_SERVER_SOURCE);
    ctx.io.out(`next: re-run without --dry-run, then run stamity config mcp add ${row.id} to select it\n`);
    return { exitCode: 0, json: { id: row.id, added: false, dryRun: true, launcher } };
  }

  await writeSetupManifest(ctx, rootDir, { ...manifest, mcp });
  ctx.io.out(`added ${ctx.palette.bold(row.id)} to mcp.ownServers\n`);
  renderLauncher(ctx, "  ", meta, OWN_SERVER_SOURCE);
  ctx.io.out(`next: run stamity config mcp add ${row.id} to select it\n`);
  return { exitCode: 0, json: { id: row.id, added: true, launcher } };
}

/** What taking one id out of one client document did, or under `--dry-run` would do. */
interface EntryOutcome {
  path: string;
  /** `kept`: the entry stays and is the person's. `refused`: the document could not be changed. */
  result: "removed" | "kept" | "refused";
  /** What a write left there, for the ledger row. */
  written?: { content: string; record?: CoOwnership };
  /** Why a document refused, or what its lane warned of. */
  note?: string;
}

/** No selection survives the removal: the id being taken out is not kept anywhere. */
const NOTHING_KEPT: ReadonlySet<string> = new Set<string>();

/**
 * Take `id` out of one merged JSON document, while `supply` can still render it.
 * The rule is the pack uninstall's (`../clean.ts::removePackMcpEntries`): an
 * entry leaves only when its bytes are the engine's rendering, and the file
 * stays. A person's tuned entry is theirs from that moment, and comes back as
 * `kept` rather than leaving silently.
 */
async function takeOutOfJsonDocument(
  ctx: CliContext,
  rootDir: string,
  path: string,
  id: string,
  supply: readonly PackSuppliedServer[],
  apply: boolean,
): Promise<EntryOutcome | null> {
  const { filterMcpJsonOnDisk, filterMcpServers, predictMcpMergeRefusal } = ctx.engine.manifest.mcpFilter;
  const absPath = join(rootDir, ...path.split("/"));
  try {
    const raw = await readIfExists(absPath);
    if (raw === null) return null;
    const refusal = apply ? null : await predictMcpMergeRefusal(absPath);
    if (refusal !== null) return { path, result: "refused", note: refusal };
    const owned = new Set([...ctx.engine.mcp.emit.engineOwnedServerIds(path, [], raw, supply)].filter((held) => held === id));
    const result = apply ? await filterMcpJsonOnDisk(absPath, owned, NOTHING_KEPT) : filterMcpServers(raw, owned, NOTHING_KEPT);
    if (result === null) return null;
    if (result.unparseable !== undefined) {
      return {
        path,
        result: "refused",
        note: `${path} is not valid JSON, so which of its entries this repo wrote cannot be read. It was left as it is.`,
      };
    }
    if (result.removed.includes(id)) {
      return { path, result: "removed", ...(apply ? { written: { content: result.content } } : {}) };
    }
    return result.preservedUserServers.includes(id) ? { path, result: "kept" } : null;
  } catch (cause) {
    return { path, result: "refused", note: `${path} could not be rewritten: ${cause instanceof Error ? cause.message : String(cause)}` };
  }
}

/**
 * Take `id`'s table out of `.codex/config.toml`, on the lane `sync` writes it
 * with, so a table the owner edited stays theirs and one that differs from the
 * rendering leaves behind a `.bak`.
 *
 * That lane takes the document's whole rendering, and writes every table of the
 * engine's that rendering leaves out as gone. The rendering is put together here
 * from the engine's own per-table renderings (`codexConfigTableRendering`, the
 * proof the lane itself reads) rather than by planning the whole setup: those
 * names are every table the lane accepts, and a plan would refuse over a row or
 * a pack with nothing to do with this removal. A selected id that renders nothing
 * would read as gone, so that refuses instead of taking its table with it.
 *
 * The rendering names only the tables the document already holds, since the lane
 * writes each one it does not find: a server selected and not yet synced is
 * `sync`'s to write, and a person can still change their mind about it.
 */
async function takeOutOfCodexConfig(
  ctx: CliContext,
  rootDir: string,
  manifest: SetupManifest,
  id: string,
  servers: readonly string[],
  supply: readonly PackSuppliedServer[],
  apply: boolean,
): Promise<EntryOutcome | null> {
  const { CODEX_CONFIG_FILE: path, codexConfigTableRendering } = ctx.engine.adapters.codex;
  const { segmentTomlTables, tomlTableName } = ctx.engine.manifest.tomlTables;
  const absPath = join(rootDir, ...path.split("/"));
  const serverTable = (server: string): string => tomlTableName(["mcp_servers", server]);
  const holdsTable = (text: string, server: string = id): boolean => {
    const cut = segmentTomlTables(text);
    return cut.ok && cut.segments.some((segment) => segment.key !== null && tomlTableName(segment.key) === serverTable(server));
  };
  try {
    const raw = await readIfExists(absPath);
    // A text the segmenter cannot read goes on to the lane, which names the line.
    if (raw === null || (segmentTomlTables(raw).ok && !holdsTable(raw))) return null;
    const ownership = coOwnedOwnershipOf(manifest.ledger, path, {
      boundaryDir: rootDir,
      ledgerHashes: ctx.engine.merge.safeWrite.ledgerHashIndex(rootDir, manifest.ledger),
    });
    // The lane is built from `manifest`, whose selection still names the id, so
    // a legacy row can prove the table too. No row at the path: not the engine's.
    const lane = coOwnedDocumentLanes(manifest, supply).get(path);
    if (lane === undefined || !ownership.owned) return { path, result: "kept" };

    const render = codexConfigTableRendering(supply);
    const written = segmentTomlTables(raw).ok ? servers.filter((server) => holdsTable(raw, server)) : servers;
    const names = ["features", ...(written.length === 0 ? ["mcp_servers"] : written.map(serverTable))];
    const unrendered = names.filter((name) => render(name) === null);
    if (unrendered.length > 0) {
      return {
        path,
        result: "refused",
        note: `${path} was left as it is: nothing renders ${unrendered.join(", ")}, so writing it now would take those tables out too.`,
      };
    }
    const emitted = `${names.map(render).join("\n\n")}\n`;

    if (!apply) {
      const prediction = await lane.predict(absPath, emitted, ownership);
      if (prediction.collision !== null) return { path, result: "refused", note: prediction.collision.detail };
      return { path, result: holdsTable(prediction.after ?? "") ? "kept" : "removed" };
    }
    const { writtenContent, writtenRecord, ...merge } = await lane.materialize(absPath, emitted, ownership);
    if (merge.action === "skipped" || writtenContent === null) {
      return { path, result: "refused", note: merge.warning ?? `${path} was left as it is.` };
    }
    return {
      path,
      result: holdsTable(writtenContent) ? "kept" : "removed",
      written: { content: writtenContent, ...(writtenRecord === null ? {} : { record: writtenRecord }) },
      ...(merge.warning === undefined ? {} : { note: merge.warning }),
    };
  } catch (cause) {
    return { path, result: "refused", note: `${path} could not be rewritten: ${cause instanceof Error ? cause.message : String(cause)}` };
  }
}

/** `ledger` with each row a write reached claiming what is on disk now, and no new claim on a row that made none. */
function withWrittenRows(ledger: readonly LedgerEntry[], outcomes: readonly EntryOutcome[]): LedgerEntry[] {
  return ledger.map((row) => {
    const written = outcomes.find((outcome) => outcome.path === row.path)?.written;
    if (written === undefined) return row;
    return {
      ...row,
      ...(row.contentHash === undefined ? {} : { contentHash: sha256(written.content) }),
      ...(written.record === undefined ? {} : { coOwned: structuredClone(written.record) }),
    };
  });
}

/**
 * The copies of `id` no client document holds, said on stderr so `--json` keeps
 * them, and the paths still listing it. The Copilot env file is whole and the
 * engine's, so `sync` rewrites it and this verb leaves it to that. A copy pasted
 * from it into repository settings is out of every verb's reach and goes on
 * starting in Copilot's cloud agent, with its secrets. So that line prints on
 * every removal: only the person knows whether they ever pasted one.
 */
async function warnOfCopiesLeft(ctx: CliContext, rootDir: string, id: string): Promise<string[]> {
  const { planMcpEmissions } = ctx.engine.mcp.emit;
  const path = planMcpEmissions([], ["copilot"]).find((emission) => emission.dialect === "copilot-env")?.path;
  // `upperSnake` in `../../../mcp/emit.ts` spells the entry; a pinned test reads a real one.
  const entry = `COPILOT_MCP_${id.replaceAll(/[^A-Za-z0-9]+/g, "_").toUpperCase()}=`;
  const raw = path === undefined ? null : await readIfExists(join(rootDir, ...path.split("/")));
  const listed = raw !== null && raw.split("\n").some((line) => line.startsWith(entry));
  const warning = ctx.palette.yellow("warning:");
  if (listed) ctx.io.err(`${warning} ${path} lists ${id} until the next stamity sync.\n`);
  ctx.io.err(
    `${warning} a copy of ${id} pasted into a repository's Settings → Copilot → MCP servers goes on launching in ` +
      `Copilot's cloud agent. No stamity command reaches it, so that copy is yours to delete.\n`,
  );
  return listed && path !== undefined ? [path] : [];
}

/**
 * Remove an own row and leave nothing launching from it (REQ-FLOW-160).
 *
 * The order is the point. The ownership proof re-renders an entry from its row
 * (`../../../mcp/emit.ts::engineOwnedServerIds`), so a row deleted in the same
 * edit as its deselection leaves the entry nothing can prove, and the server goes
 * on launching with the credentials in `.env.mcp`. So the id leaves the selection
 * first, then the entries leave while the row still proves them, then the row
 * goes. A crash anywhere leaves a row that a re-run can still prove with.
 *
 * Writing the entries here rather than leaving them for `sync` is what makes the
 * row safe to delete at all, and it mirrors `clean --pack`, which takes a pack's
 * entries out at the last moment its files can prove them.
 *
 * Supply is read with {@link provableOwnServers}, not the strict seam: this is
 * the way out of a row past the bar, as `clean` is, and such a row proves
 * nothing, so its entries come back `kept`. A document that cannot be changed
 * stops the verb before the row goes, so the row can still prove it on a re-run.
 * `.env.mcp` is left alone: the value in it is the operator's.
 *
 * An id the curated catalog or a pack also holds is that supplier's, since the
 * bar refuses a row that claims one. Only the row goes: the selection and the
 * entries stay, and a selected id's entries are `sync`'s to refresh.
 */
export async function runMcpOwnRemove(
  ctx: CliContext,
  rootDir: string,
  id: string,
): Promise<CommandResult> {
  const manifest = await requireSetupManifest(ctx, rootDir);
  const rows = manifest.mcp?.ownServers ?? [];
  if (!rows.some((row) => row.id === id)) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `no row in mcp.ownServers holds ${JSON.stringify(id)}`,
      why:
        rows.length === 0
          ? "this repository has no own server"
          : `own servers: ${rows.map((row) => sanitizeLabel(String(row.id))).join(", ")}`,
      next: "run stamity config mcp remove <id> to deselect a curated or pack server",
    });
  }

  const packs = await packRowsOrNone(rootDir, manifest);
  const supply = provableOwnServers(packs, manifest);
  const foreign = catalogIds(ctx).includes(id) || packs.some((server) => server.id === id);
  const servers = selectedServers(manifest).filter((server) => foreign || server !== id);
  const where = foreign ? "mcp.ownServers" : "mcp.servers and mcp.ownServers";
  const foreignLine = `  the curated catalog or an installed pack also holds ${id}, so its selection and its entries stay as they are\n`;
  const takeOut = async (apply: boolean): Promise<EntryOutcome[]> => {
    if (foreign) return [];
    const outcomes = await Promise.all([
      ...[...ctx.engine.mcp.emit.MERGED_MCP_JSON_PATHS].map((path) => takeOutOfJsonDocument(ctx, rootDir, path, id, supply, apply)),
      takeOutOfCodexConfig(ctx, rootDir, manifest, id, servers, supply, apply),
    ]);
    return outcomes.filter((outcome) => outcome !== null);
  };
  const pathsWhere = (outcomes: readonly EntryOutcome[], result: EntryOutcome["result"]): string[] =>
    outcomes.filter((outcome) => outcome.result === result).map((outcome) => outcome.path);

  if (ctx.dryRun) {
    const outcomes = await takeOut(false);
    ctx.io.out(`would remove ${ctx.palette.bold(id)} from ${where}\n`);
    if (foreign) ctx.io.out(foreignLine);
    const removed = pathsWhere(outcomes, "removed");
    if (removed.length > 0) ctx.io.out(`  would take its entry out of ${removed.join(", ")}\n`);
    const kept = pathsWhere(outcomes, "kept");
    if (kept.length > 0) ctx.io.out(`  would keep your own entry in ${kept.join(", ")}, which goes on launching\n`);
    const stops = outcomes
      .filter((outcome) => outcome.result === "refused")
      .map((outcome) => ({ path: outcome.path, note: outcome.note ?? outcome.path }));
    for (const stop of stops) ctx.io.out(`  would stop here: ${stop.note}\n`);
    const untilSync = foreign ? [] : await warnOfCopiesLeft(ctx, rootDir, id);
    ctx.io.out("next: re-run without --dry-run to apply\n");
    return { exitCode: 0, json: { id, removed: false, dryRun: true, servers, documents: removed, kept, stops, untilSync } };
  }

  const mcp = { ...manifest.mcp, servers };
  await writeSetupManifest(ctx, rootDir, { ...manifest, mcp });
  const outcomes = await takeOut(true);
  const ledger = withWrittenRows(manifest.ledger, outcomes);
  for (const outcome of outcomes) {
    if (outcome.result !== "refused" && outcome.note !== undefined) ctx.io.err(`warning: ${outcome.note}\n`);
  }

  const refusals = outcomes.filter((outcome) => outcome.result === "refused");
  if (refusals.length > 0) {
    await writeSetupManifest(ctx, rootDir, { ...manifest, mcp, ledger });
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `${id} is out of the selection, but its row stays: not every client document could be changed`,
      why: refusals.map((outcome) => outcome.note ?? outcome.path).join("\n"),
      next: `fix those documents, then run stamity config mcp own --remove ${id} again; the row is what proves its entries`,
    });
  }

  await writeSetupManifest(ctx, rootDir, {
    ...manifest,
    mcp: { ...mcp, ownServers: rows.filter((row) => row.id !== id) },
    ledger,
  });

  const removed = pathsWhere(outcomes, "removed");
  const kept = pathsWhere(outcomes, "kept");
  ctx.io.out(`removed ${ctx.palette.bold(id)} from ${where}\n`);
  if (foreign) ctx.io.out(foreignLine);
  if (removed.length > 0) ctx.io.out(`  took its entry out of ${removed.join(", ")}\n`);
  if (kept.length > 0) {
    // On stderr, so it survives `--json`: the one thing this verb exists to
    // prevent is a person reading "removed" over a server that still starts.
    ctx.io.err(
      `${ctx.palette.yellow("warning:")} ${id} still launches from ${kept.join(", ")}: this repo cannot prove it ` +
        `wrote those entries, so they are yours. Remove them by hand if you meant to.\n`,
    );
  }
  const untilSync = foreign ? [] : await warnOfCopiesLeft(ctx, rootDir, id);
  ctx.io.out(
    `  ${ctx.palette.dim(`${ctx.engine.mcp.env.ENV_MCP_FILE} left untouched — the values in it are yours`)}\n`,
  );
  ctx.io.out(`${NEXT_SYNC_LINE}\n`);

  return { exitCode: 0, json: { id, removed: true, servers, documents: removed, kept, untilSync } };
}
