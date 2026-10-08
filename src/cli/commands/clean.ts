import { createHash } from "node:crypto";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { readManifest, writeManifest } from "../../manifest/manifest.ts";
import {
  filterMcpJsonOnDisk,
  filterMcpServers,
  type FilterMcpResult,
} from "../../manifest/mcpFilter.ts";
import type { PackSuppliedServer } from "../../mcp/catalog.ts";
import { MERGED_MCP_JSON_PATHS, engineOwnedServerIds } from "../../mcp/emit.ts";
import { formatReclaimReport, sweepReclaimCandidates } from "../../merge/reclaim.ts";
import { applyCommandPrefix, slugOf } from "../../content/catalog.ts";
import { planPackRemoval } from "../../pack/install.ts";
import { packDirRelPath } from "../../pack/receipt.ts";
import { discoverInstalledPacks, packMcpServers } from "../../pack/projection.ts";
import { trustedInfraPaths, type ReclaimCandidate } from "../../manifest/ledger.ts";
import { needsRenderingProof } from "../../manifest/ownedPaths.ts";
import {
  PACK_OWNER_PREFIX,
  isPackOwner,
  packOwner,
  type LedgerEntry,
  type SetupManifest,
} from "../../types/manifest.ts";
import { CONTENT_CLASSES, type ContentClass } from "../../types/content.ts";
import { TOOLS, type Tool } from "../../types/core.ts";
import { STATE_DIR } from "../../types/markers.ts";
import {
  coOwnedReclaimReducers,
  coOwnedReclaimRenderings,
  engineRenderingsFor,
  hookScriptRetention,
  type EmissionPlanFor,
  type RenderingProof,
} from "../engine/emissionWrite.ts";
import { getEmissionPlanner } from "../engine/emission.ts";
import { CliFailure } from "../kit/output.ts";
import { hasNpmChannel, packageCommand, packageName, registryOption } from "../kit/packageName.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { confirm, promptGate } from "../kit/prompts.ts";

/**
 * `stamity clean` — the uninstall verb, in two scopes.
 *
 * Default scope: every owner stops emitting everything. Three properties define
 * it, and each one is a deliberate inversion of a default the rest of the CLI
 * holds:
 *
 * 1. **Uninstall-all, packs included.** The removal set is built straight from
 *    the ledger rather than through `computeReclaimCandidates`, which excludes
 *    `pack:<id>` rows on purpose (a sync must never reclaim installed pack
 *    content). Clean's remit is exactly the uninstall those rows are waiting
 *    for, so `planPackRemoval` per pack id would be equivalent — one direct
 *    construction keeps a single code path instead of two that must agree.
 * 2. **Destructive default-deny.** Everywhere else this CLI prefers detection
 *    over asking and treats a non-interactive run as "proceed with defaults".
 *    Here a non-TTY run without `-y` REFUSES: the default answer to "delete
 *    the user's files" is no, and a pipeline that means it says `-y`.
 * 3. **The reinit offer is printed, never prompted.** The prompt budget belongs
 *    to `init` (≤2 prompts, TTY-gated); clean ends with a next-step line, so a
 *    user who wants a fresh setup types the command themselves.
 *
 * `--pack <id>` narrows the remit to one installed pack. Candidates come from
 * the engine's `planPackRemoval` — exact owner equality on `pack:<id>`, so
 * `@acme/ops` can never match `@acme/ops-extra`, and the pack's engine-written
 * receipt row is included like any other of its rows. The sweep runs under the
 * same gates and the same trusted-infra exemption as the full clean; afterwards
 * exactly this pack's rows are dropped and the SHRUNK ledger is written back.
 * The state directory stays — every other owner is still live — and the sweep's
 * own parent prune removes the pack's now-empty directories. A file the gates
 * kept (operator-edited bytes, a refused unlink) still loses its row: keeping a
 * row whose hash no longer matches would only arm a later clean against bytes
 * the engine cannot prove it wrote, so the file becomes user-owned salvage and
 * the output says so. While the pack is still installed, the sweep also takes
 * the copies `sync` projected from it into the clients' folders, each deleted
 * only as bytes the running engine renders there from the pack
 * ({@link findPackCopies}); afterwards no rendering could prove them. A copy
 * the proof could not judge, because the pack could not be planned, keeps its
 * row (review/61). The closing next-step is the pinned `sync`, which
 * regenerates the clients' files without the pack; the reinit offer stays
 * full-clean-only.
 *
 * Order of operations: sweep first, state directory last. The plan is read into
 * memory before either, so the ordering costs nothing — but removing the state
 * dir last means a crash mid-sweep leaves the ledger on disk and a re-run
 * finishes the job. What the sweep will not do is documented in
 * `../../merge/reclaim.ts`: user bytes outside a managed block survive (the
 * block is stripped instead), unsafe paths are refused, missing files are
 * reported rather than fatal. `.gitignore` entries are left alone — the file is
 * the user's, and stale ignore lines are inert.
 *
 * One exception keeps the state directory (S17): a hooks document the sweep
 * leaves in place — an owner's entries kept in it, or a file it cannot read —
 * that still runs a hook script under `.stamity/` holds that script back, and
 * deleting the directory would take it anyway. The run says so, names the
 * document, and `--json` lists the held scripts as `stateDirKept`.
 */

/** Fresh row copy, so a candidate never aliases the manifest the caller holds. */
function cloneEntry(entry: LedgerEntry): LedgerEntry {
  return { ...entry };
}

/**
 * Every ledger row as a reclaim candidate — adapter rows AND `pack:<id>` rows.
 *
 * The reason is uniformly `"adapter-removed"`: it is the strongest of the three
 * (it outranks `path-renamed` and `deselected` when several rows name one path)
 * and it is the literal truth here — after this run no owner emits anything.
 */
export function planCleanCandidates(manifest: SetupManifest): ReclaimCandidate[] {
  return manifest.ledger.map((entry) => ({ entry: cloneEntry(entry), reason: "adapter-removed" }));
}

/**
 * The running engine's renderings at the candidates' paths, for the sweep's
 * rendering proof (REQ-PLUGIN-046): the clients this setup wrote for, planned
 * the way `sync` plans
 * (`./sync/engine.ts`'s `renderingPlanner`, which the layering keeps this verb
 * from importing), with this engine's version and package identity. Read before
 * the sweep, while the packs and overrides they are rendered from are on disk.
 */
function cleanRenderings(
  rootDir: string,
  manifest: SetupManifest,
  candidates: readonly ReclaimCandidate[],
  engineVersion: string,
): Promise<RenderingProof> {
  return engineRenderingsFor(
    rootDir,
    manifest,
    candidates.map((candidate) => candidate.entry.path),
    cleanPlanner(rootDir, engineVersion),
  );
}

/** What one planner run showed: every path it renders, or `null` when it could not be built. */
interface PlanSeen {
  paths: Set<string> | null;
}

/**
 * The planner call the rendering proof injects, built as `sync` builds its
 * own. With `seen`, the run also records every path it rendered, so
 * `clean --pack` can tell which paths the pack's presence adds
 * ({@link findPackCopies}); why a plan could not be built is the proof's own
 * `renderingsUnbuilt`.
 */
function cleanPlanner(rootDir: string, engineVersion: string, seen?: PlanSeen): EmissionPlanFor {
  return async (setupClients, facts) => {
    const outputs = await getEmissionPlanner().plan({
      rootDir,
      manifest: setupClients,
      engineVersion,
      packageName: packageName(),
      npmChannel: hasNpmChannel(),
      ...registryOption({}),
      facts,
    });
    if (seen !== undefined) seen.paths = new Set(outputs.map((output) => output.path));
    return outputs;
  };
}

/** The pack folders whose files project into the clients, by the content class each holds. */
const PACK_CLASS_DIRS: Readonly<Record<string, ContentClass>> = {
  agents: "agent",
  skills: "skill",
  rules: "rule",
  commands: "command",
};

/**
 * The artifact a pack-relative path names, as `<class>:<slug>` — a skill by
 * its folder, any other class by its `.md` file's stem, the engine prefix
 * taken off as the catalog takes it (`../../content/catalog.ts::slugOf`) — or
 * `null` for a file that is no artifact (the receipt, hooks, MCP servers).
 */
function packArtifactOf(relPath: string): string | null {
  const segments = relPath.split("/");
  const type = PACK_CLASS_DIRS[segments[0] ?? ""];
  const name = segments[1];
  if (type === undefined || name === undefined) return null;
  if (type === "skill") return segments.length >= 3 ? `${type}:${slugOf(name)}` : null;
  return segments.length === 2 && name.endsWith(".md") ? `${type}:${slugOf(name.slice(0, -".md".length))}` : null;
}

/**
 * Every artifact pack `packId` ships, read from the pack itself and never from
 * a plan, so it holds when the pack cannot be planned: the artifacts its own
 * ledger rows name (`artifactId` is `<pack id>/<pack-relative path>`), and
 * those its folder holds now. The rows keep an artifact whose file was moved
 * out of the folder (`check`'s pack-integrity remedy, review/71).
 */
async function packArtifacts(rootDir: string, manifest: SetupManifest, packId: string): Promise<Set<string>> {
  const owner = packOwner(packId);
  const rels = manifest.ledger
    .filter((row) => row.adapter === owner)
    .map((row) => row.artifactId.slice(row.artifactId.indexOf("/") + 1));
  const dir = join(rootDir, ...packDirRelPath(packId).split("/"));
  for (const classDir of Object.keys(PACK_CLASS_DIRS)) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- four fixed folders, read in order
      const entries = await readdir(join(dir, classDir), { withFileTypes: true });
      for (const entry of entries) {
        rels.push(entry.isDirectory() ? `${classDir}/${entry.name}/SKILL.md` : `${classDir}/${entry.name}`);
      }
    } catch {
      // reason: a class folder the pack does not ship, or a pack folder that
      // is gone, adds no artifact; the ledger rows above still name its own.
    }
  }
  return new Set(rels.map(packArtifactOf).filter((key): key is string => key !== null));
}

/**
 * True when client row `row` is one of `artifacts` by both its record and its
 * path: its class and catalog id name the artifact, and the name its path
 * projects under — the folder after `skills/`, else the file name up to its
 * first dot — slugs to that id. A forged row can name a pack artifact, but at
 * any other path than the one that artifact projects to it is not taken
 * (review/68).
 */
function isPackArtifactRow(row: LedgerEntry, artifacts: ReadonlySet<string>): boolean {
  if (!(CONTENT_CLASSES as readonly string[]).includes(row.artifactType)) return false;
  const type = row.artifactType as ContentClass;
  const slug = slugOf(projectedNameOf(row.path));
  return applyCommandPrefix(slug, type) === row.artifactId && artifacts.has(`${type}:${slug}`);
}

/** The artifact name a client path projects under: the folder after `skills/`, else the file name up to its first dot. */
function projectedNameOf(path: string): string {
  const segments = path.split("/");
  const skillsAt = segments.indexOf("skills");
  const name = skillsAt >= 0 && skillsAt < segments.length - 1 ? segments[skillsAt + 1] : segments.at(-1);
  return (name ?? "").split(".")[0] ?? "";
}

/** The client copies `clean --pack` sweeps beside the pack's own files. */
interface PackCopies {
  /** The ledger rows of the copies, as they stand in the manifest. */
  rows: ReadonlySet<LedgerEntry>;
  /** The copies as sweep candidates. */
  candidates: ReclaimCandidate[];
  /** The proof, planned with the pack installed, at the pack's paths and its copies'. */
  proof: RenderingProof;
  /** Why the plan with the pack installed could not be built, or `null` when it was. */
  unplanned: string | null;
  /** Why the plan without the pack could not be built, so no copy was looked for, or `null`. */
  unexamined: string | null;
}

/**
 * The copies `sync` projected from pack `packId` into the clients' folders
 * (REQ-PLUGIN-046, unit d1a2): the emission is planned twice, once as the
 * manifest stands and once with this pack's `pack:<id>` rows removed, both for
 * the clients the setup wrote for and both under the proof's policy opt-out
 * (`engineRenderingsFor`), so a pack the org policy denies is still rendered.
 * A client's row whose path the first plan renders and the second does not is
 * a copy. A path both render is not one, even where the bytes differ (a shared
 * policy document): the next `sync` rewrites it.
 *
 * A client row of one of the pack's own artifacts ({@link packArtifacts},
 * {@link isPackArtifactRow}) at a path the second plan does not render is a
 * copy too, rendered or not: an artifact whose file was moved out of the pack
 * folder is still the pack's by its row (review/71).
 *
 * Only a path that needs the rendering proof can be a copy: elsewhere no
 * rendering proves a delete, and the row is left for `sync` as before.
 *
 * When the first plan cannot be built (a pack whose own command and skill
 * share a name, which the planner refuses), the copies are only the rows of
 * the pack's own artifacts, read from the pack and not from a plan, so a
 * retired engine file, a removed override or a forged row elsewhere is left
 * alone (review/68, review/70). No rendering proves any of them: the sweep
 * keeps each unjudged, with its row, and names it (review/61). It never falls
 * back to the recorded hash, which a forged row could match. When the second
 * plan cannot be built, no copy can be told from a shared path, none is
 * taken, and the run says so.
 */
async function findPackCopies(
  rootDir: string,
  manifest: SetupManifest,
  packId: string,
  packRows: readonly ReclaimCandidate[],
  engineVersion: string,
): Promise<PackCopies> {
  const owner = packOwner(packId);
  const clientRows = manifest.ledger.filter(
    (row) => (TOOLS as readonly string[]).includes(row.adapter) && needsRenderingProof(row.path),
  );
  const installed: PlanSeen = { paths: null };
  const proof = await engineRenderingsFor(
    rootDir,
    manifest,
    [...packRows.map((candidate) => candidate.entry.path), ...clientRows.map((row) => row.path)],
    cleanPlanner(rootDir, engineVersion, installed),
  );
  const none = { rows: new Set<LedgerEntry>(), candidates: [], proof, unplanned: null, unexamined: null };
  if (clientRows.length === 0) return none;
  const removed: PlanSeen = { paths: null };
  const withoutProof = await engineRenderingsFor(
    rootDir,
    { ...manifest, ledger: manifest.ledger.filter((row) => row.adapter !== owner) },
    clientRows.map((row) => row.path),
    cleanPlanner(rootDir, engineVersion, removed),
  );
  const withoutPack = removed.paths;
  if (withoutPack === null) return { ...none, unexamined: withoutProof.renderingsUnbuilt ?? "the plan could not be built" };
  const withPack = installed.paths;
  const artifacts = await packArtifacts(rootDir, manifest, packId);
  const rows = new Set(
    clientRows.filter(
      (row) =>
        !withoutPack.has(row.path) && (withPack?.has(row.path) === true || isPackArtifactRow(row, artifacts)),
    ),
  );
  return {
    rows,
    // "deselected": the client is still a target, and no plan without the pack produces the artifact.
    candidates: [...rows].map((row) => ({ entry: cloneEntry(row), reason: "deselected" })),
    proof,
    unplanned: withPack === null ? (proof.renderingsUnbuilt ?? "the plan could not be built") : null,
    unexamined: null,
  };
}

/** Distinct installed pack ids the ledger records, for the unknown-id refusal. */
function installedPackIds(manifest: SetupManifest): string[] {
  const ids = new Set<string>();
  for (const entry of manifest.ledger) {
    if (isPackOwner(entry.adapter)) ids.add(entry.adapter.slice(PACK_OWNER_PREFIX.length));
  }
  return [...ids].toSorted();
}

/** True when `dir` exists (as anything). Absence is a fact here, never an error. */
async function exists(dir: string): Promise<boolean> {
  try {
    await stat(dir);
    return true;
  } catch {
    return false;
  }
}

const REINIT_OFFER = `start fresh: ${packageCommand("init")}`;

/**
 * How each client uninstalls the plugin — the vendor's own command, printed
 * because this verb cannot run it.
 *
 * `clean` removes ledger rows and the files they name. A plugin root is the
 * CLIENT's installation, outside the repository and outside anything this
 * engine has an ownership claim over, so the honest close on a plugin-backed
 * repository is to say what is left and who removes it. Nothing here executes.
 *
 * The marketplace is a placeholder rather than a value: the manifest records
 * the plugin's VERSION and the classes it carries, never the catalog it was
 * installed from, and inventing a name would send an operator at a marketplace
 * they may not have added.
 *
 * Commands as the vendors document them: `codex plugin remove` is read from
 * `codex --help` on 0.154.0 (2026-09-20). Cursor documents no CLI form, so its
 * line names the view that does the job.
 *
 * The plugin ID is DERIVED, never the literal `stamity`: it is the running
 * package's name with its npm scope removed, the same derivation the catalogs
 * make (`scripts/plugins/catalogs.mjs`), so the four lines name the id a
 * renamed downstream's own marketplace actually carries. A hardcoded canonical
 * id would send that operator at a plugin their client has never heard of.
 */
function pluginId(): string {
  return packageName().replace(/^@[^/]+\//, "");
}

function pluginUninstallCommands(): Readonly<Record<Tool, string>> {
  const id = pluginId();
  return {
    claude: `claude plugin uninstall ${id}@<your marketplace>`,
    cursor: `uninstall the ${id} plugin from Cursor's Customize view`,
    copilot: `copilot plugin uninstall ${id}`,
    codex: `codex plugin remove ${id}@<your marketplace>`,
  };
}

/**
 * The uninstall lines this run owes, one per client the manifest records a
 * plugin for, in {@link TOOLS} order.
 *
 * Read off `plugin.clients` rather than off `tools`: a client can be recorded
 * and deselected, and the plugin is still installed in it — that is exactly the
 * state where nobody would otherwise be told.
 */
function pluginUninstallLines(manifest: SetupManifest): string[] {
  const recorded = manifest.plugin?.clients ?? {};
  const commands = pluginUninstallCommands();
  return TOOLS.filter((tool) => recorded[tool] !== undefined).map(
    (tool) => `  ${tool}: ${commands[tool]}`,
  );
}

/** The one-per-line next-step block every exit path ends with. */
function nextSteps(ctx: CliContext, steps: readonly string[]): void {
  ctx.io.out("\nnext:\n");
  for (const [index, step] of steps.entries()) {
    ctx.io.out(`  ${index + 1}. ${step}\n`);
  }
}

/** Nothing to clean: a repo with no manifest is already in the target state. */
function nothingToClean(ctx: CliContext): CommandResult {
  ctx.io.out(`Nothing to clean — this repo has no ${STATE_DIR}/ manifest.\n`);
  nextSteps(ctx, [REINIT_OFFER]);
  return {
    exitCode: 0,
    json: { removed: 0, stripped: 0, skipped: 0, stateDirRemoved: false, entries: [] },
  };
}

/**
 * The destructive gate. Only `-y` passes; a TTY asks, defaulting to no; every
 * other run — non-TTY stdin, or `--json`, whose stdout belongs to the response
 * envelope and has nowhere to print a question — refuses instead of assuming
 * the answer. `--json` is a formatting choice and carries no consent: the
 * machine-readable spelling of an irreversible delete must still be told yes.
 * Both scopes share the mechanics; what is at stake is named by the caller's
 * strings.
 */
async function confirmDestruction(
  ctx: CliContext,
  strings: { refusedWhat: string; question: string },
): Promise<void> {
  if (ctx.yes) return;
  const gate = promptGate({
    stdinIsTTY: ctx.terminal.stdinIsTTY,
    yes: ctx.yes,
    json: ctx.json,
    env: ctx.app.runtime.env,
    palette: ctx.palette,
  });
  if (!gate.interactive) {
    throw new CliFailure({
      code: "CLEAN_ERROR",
      message: `clean refused: removing ${strings.refusedWhat} needs confirmation`,
      why: "stdin is not a terminal, so the confirmation prompt cannot be answered — and a destructive command never assumes yes",
      next: "re-run with -y to confirm, or run it from a terminal",
    });
  }
  const proceed = await confirm(gate, ctx.promptIo, {
    question: strings.question,
    defaultYes: false,
  });
  if (!proceed) {
    throw new CliFailure({
      code: "CLEAN_ERROR",
      message: "clean cancelled — nothing was removed",
      why: "the confirmation was declined",
      next: "re-run and answer y, or pass -y to skip the prompt",
    });
  }
}

/** Remove the state directory itself, reporting whether it was there to remove. */
async function removeStateDir(rootDir: string): Promise<boolean> {
  const target = join(rootDir, STATE_DIR);
  const present = await exists(target);
  if (!present) return false;
  try {
    await rm(target, { recursive: true, force: true });
  } catch (cause) {
    throw new CliFailure({
      code: "FS_ERROR",
      message: `generated files were removed, but ${STATE_DIR}/ could not be deleted`,
      why: cause instanceof Error ? cause.message : String(cause),
      next: `close anything holding ${STATE_DIR}/ open, then re-run stamity clean`,
    });
  }
  return true;
}

/**
 * Every MCP server this repo's installed packs still supply — the ownership
 * input BOTH scopes need, resolved once per run because both uses of it must
 * agree.
 *
 * The sweep needs it as reducers for the three merged client MCP documents.
 * `.mcp.json`, `.cursor/mcp.json` and `.vscode/mcp.json` are written by MERGING,
 * so the hash the ledger recorded for them covers emission ∪ the operator's own
 * entries; without a reducer the sweep reads a match as sole authorship and
 * unlinks a document holding a hand-added server (`../../merge/reclaim.ts`
 * gate 4). With one, the engine's entries leave and everything else stays.
 * {@link removePackMcpEntries} needs the same rows to prove which entries a
 * pack being uninstalled put there.
 *
 * A pack whose supply cannot be resolved contributes nothing instead of failing
 * the command. `discoverInstalledPacks` refuses a row whose content directory is
 * gone — correct for every verb that is about to USE the pack, and wrong for the
 * one verb that exists to clear that state: uninstall must still run over a repo
 * whose pack files were deleted by hand. The cost of the fallback is bounded and
 * in the safe direction: a pack-supplied entry the engine can then no longer
 * prove it wrote is judged the operator's and kept, never deleted unproven.
 */
async function installedPackMcpSupply(
  rootDir: string,
  manifest: SetupManifest,
): Promise<PackSuppliedServer[]> {
  try {
    return await packMcpServers(await discoverInstalledPacks(rootDir, manifest), rootDir);
  } catch {
    // reason: not silent — the sweep still runs, still reports one entry per
    // candidate, and a kept entry says in its own detail that the engine could
    // not prove it wrote it.
    return [];
  }
}

/** Bytes at `absPath`, or `null` when it is not there. Absence is a fact here. */
async function readTextOrNull(absPath: string): Promise<string | null> {
  try {
    return await readFile(absPath, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw cause;
  }
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** No selection survives the uninstall: the ids being removed are going away. */
const NOTHING_KEPT: ReadonlySet<string> = new Set<string>();

/** What the uninstall did to one pack's servers in the shared client documents. */
interface McpUninstallReport {
  /** Selected ids this pack supplied — the ids the selection must stop naming. */
  deselected: string[];
  /** Repo-relative path -> the bytes now on disk, for each document rewritten. */
  rewritten: Map<string, string>;
  /** Ids left in a document because their bytes are no longer the engine's. */
  kept: string[];
  /** One line per document the removal could not complete, and why. */
  refusals: string[];
}

/**
 * The SELECTED server ids `packId` supplies — the set the uninstall removes.
 *
 * One definition, two readers: the confirmation prompt names this set before
 * anything is written, and {@link removePackMcpEntries} acts on it. Deriving it
 * twice is how a prompt ends up promising something other than what the run does.
 */
function selectedServersOfPack(
  manifest: SetupManifest,
  packId: string,
  supply: readonly PackSuppliedServer[],
): string[] {
  const supplied = new Set(
    supply.filter((server) => server.sourcePackId === packId).map((server) => server.id),
  );
  return (manifest.mcp?.servers ?? []).filter((id) => supplied.has(id));
}

/**
 * Take the uninstalled pack's SELECTED servers out of the three merged client
 * documents, while the engine can still prove it wrote them.
 *
 * Ordering is the whole point of doing this here. `engineOwnedServerIds` proves
 * authorship by RE-RENDERING an entry (`../../mcp/emit.ts`), so it can only
 * prove an id it can still resolve. The moment this command drops the pack's
 * files and its `pack:<id>` ledger rows, nothing renders the pack's ids: every
 * later lane — `sync`, `check`, even a full `clean` — then correctly-
 * conservatively judges the entry the operator's and keeps it. Uninstall-first
 * therefore used to strand a credentialed third-party launcher permanently, and
 * the remedy `sync` printed (`config mcp remove <id>`) could no longer remove
 * anything. This runs at the last moment the proof exists.
 *
 * Narrow on purpose, in three directions at once:
 *
 * - **Only this pack's ids**, and only the ones the SELECTION names. An id the
 *   manifest never selected was never this engine's to write, whatever a
 *   document happens to hold under that name.
 * - **Only entries whose bytes still match the engine's rendering.** The set is
 *   `engineOwnedServerIds ∩ the pack's selected ids`, so an operator who tuned
 *   the pack's entry owns it from that moment and it survives — reported as
 *   `kept` rather than removed silently.
 * - **Never a delete.** `filterMcpServers` removes entries and prunes the
 *   `inputs` rows only the removed servers referenced; every other entry, every
 *   top-level field, and the file itself stay. Other servers are still selected
 *   here, so these documents are still live emission targets — unlike the
 *   reclaim sweep's lane, which reaches a path only once nothing emits it.
 *
 * No per-document failure aborts the uninstall. A symlinked or hard-linked
 * target is refused by the writer (`../../manifest/mcpFilter.ts`), and an
 * unparseable one is left exactly as it is; both come back as a `refusals` line
 * the caller prints, because a pack whose files are already gone must not be
 * left half-uninstalled by a document the engine may not touch.
 */
async function removePackMcpEntries(
  rootDir: string,
  manifest: SetupManifest,
  packId: string,
  supply: readonly PackSuppliedServer[],
  apply: boolean,
): Promise<McpUninstallReport> {
  const deselected = selectedServersOfPack(manifest, packId, supply);
  const report: McpUninstallReport = { deselected, rewritten: new Map(), kept: [], refusals: [] };
  // A pack supplying no SELECTED server costs the client documents nothing —
  // not a read, not a rewrite. That is the overwhelmingly common uninstall.
  if (deselected.length === 0) return report;

  const wanted = new Set(deselected);
  // Three fixed paths, three different files: disjoint writes, so they run
  // together. `Promise.all` preserves input order, which is what keeps the
  // report deterministic without serialising the I/O.
  const perDoc = await Promise.all(
    [...MERGED_MCP_JSON_PATHS].map(async (path) => {
      const absPath = join(rootDir, ...path.split("/"));
      try {
        // Read for the ownership proof only: `engineOwnedServerIds` returns
        // catalog ids and quotes nothing, which is why this may run ahead of
        // the writer's link refusal — the same posture `sync` takes at its own
        // merge (`./sync/engine.ts`). The write below re-reads behind it.
        const raw = await readTextOrNull(absPath);
        if (raw === null) return null;
        const owned = new Set(
          [...engineOwnedServerIds(path, [], raw, supply)].filter((id) => wanted.has(id)),
        );
        const result: FilterMcpResult | null = apply
          ? await filterMcpJsonOnDisk(absPath, owned, NOTHING_KEPT)
          : filterMcpServers(raw, owned, NOTHING_KEPT);
        return result === null ? null : { path, result };
      } catch (cause) {
        return {
          path,
          refusal:
            `${path} could not be rewritten (${cause instanceof Error ? cause.message : String(cause)}), ` +
            `so it still holds ${deselected.join(", ")}. Remove the entry by hand.`,
        };
      }
    }),
  );

  const kept = new Set<string>();
  for (const outcome of perDoc) {
    if (outcome === null) continue;
    if ("refusal" in outcome) {
      report.refusals.push(outcome.refusal);
      continue;
    }
    const { path, result } = outcome;
    if (result.unparseable !== undefined) {
      report.refusals.push(
        `${path} is not valid JSON (${result.unparseable}), so which of its entries this repo ` +
          `wrote cannot be read — it was left untouched. Remove ${deselected.join(", ")} by hand.`,
      );
      continue;
    }
    for (const id of result.preservedUserServers) if (wanted.has(id)) kept.add(id);
    if (apply && result.removed.length > 0) report.rewritten.set(path, result.content);
  }
  report.kept = [...kept].toSorted();
  return report;
}

/**
 * `entry` with its recorded hash refreshed when this run rewrote the path it
 * names, and untouched otherwise.
 *
 * `contentHash` records what the engine last WROTE at a path, so leaving the
 * pre-removal hash behind would have the ledger assert bytes that are no longer
 * there. Only a row that already carried a hash is updated: this refreshes an
 * existing claim, it never mints a new one on a row that made none.
 */
function rehashRewritten(entry: LedgerEntry, rewritten: ReadonlyMap<string, string>): LedgerEntry {
  const written = rewritten.get(entry.path);
  if (written === undefined || entry.contentHash === undefined) return entry;
  return { ...cloneEntry(entry), contentHash: sha256(written) };
}

/** The MCP clause of the dry-run sentence; empty when the pack supplies none. */
function mcpSentence(mcp: McpUninstallReport): string {
  if (mcp.deselected.length === 0) return "";
  return (
    `, takes its selected MCP server(s) (${mcp.deselected.join(", ")}) out of ` +
    `${[...MERGED_MCP_JSON_PATHS].join(", ")} and out of the selection`
  );
}

// ── Scoped mode: --pack <id> ───────────────────────────────────

/**
 * Uninstall one pack and leave every other owner alone.
 *
 * The full clean deletes the state directory, ledger and all; here the ledger
 * must survive minus exactly this pack's rows, so after the sweep the shrunk
 * manifest is written back in place. Rows are dropped UNCONDITIONALLY — also
 * for files the sweep kept — because a row without matching bytes is not
 * ownership, it is a stale claim; the kept file is the operator's from then on.
 * A dry run drops nothing and prompts for nothing.
 *
 * The pack's projected copies leave with it ({@link findPackCopies}), and so do
 * their rows, a kept copy's included — except a copy the proof could not judge
 * because the pack could not be planned, which keeps its row (review/61).
 *
 * Two things leave the repo besides the pack's own files, and both leave HERE
 * because this is the last moment they can (see {@link removePackMcpEntries}):
 * the pack's selected MCP servers are taken out of the three merged client
 * documents, and their ids are taken out of the selection. Order of operations
 * is documents, then sweep, then manifest — so a failure anywhere leaves a state
 * the next `sync` repairs by re-emitting what is still selected, rather than one
 * where the selection names an id nothing can resolve.
 */
async function runScopedClean(
  ctx: CliContext,
  rootDir: string,
  manifest: SetupManifest,
  packId: string,
): Promise<CommandResult> {
  // planPackRemoval validates the id shape first, so `--pack ../x` is refused
  // as a VALIDATION_ERROR before it is ever matched against the ledger.
  const candidates = planPackRemoval(manifest, packId);
  if (candidates.length === 0) {
    const installed = installedPackIds(manifest);
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `no pack "${packId}" is installed — the ledger has no rows owned by ${packOwner(packId)}`,
      why:
        installed.length > 0
          ? `installed pack(s): ${installed.join(", ")}`
          : "no packs are installed in this repo",
      next:
        installed.length > 0
          ? "re-run with one of the installed pack ids"
          : "install one first: stamity add <pack-spec>",
    });
  }

  // Resolved BEFORE the sweep deletes the pack's files: after that, nothing can
  // render its server ids, and an id that cannot be rendered cannot be proved.
  const packSupply = await installedPackMcpSupply(rootDir, manifest);
  const selectedFromPack = selectedServersOfPack(manifest, packId, packSupply);
  // Planned while the pack is still installed and before anything is written:
  // the pack's own content is what proves its copies (REQ-PLUGIN-046).
  const copies = await findPackCopies(rootDir, manifest, packId, candidates, ctx.app.version);
  const alsoCopies =
    copies.rows.size === 0 ? "" : `, its ${copies.rows.size} client copy(ies)`;

  // --dry-run neither prompts nor refuses: it writes nothing, so the
  // destructive gate has nothing to gate.
  if (!ctx.dryRun) {
    const alsoMcp =
      selectedFromPack.length === 0
        ? ""
        : `, plus its selected MCP server(s) (${selectedFromPack.join(", ")}) in the client config files`;
    await confirmDestruction(ctx, {
      refusedWhat: `pack "${packId}" (${candidates.length} installed file(s)${alsoCopies})`,
      question: `Remove pack "${packId}" — ${candidates.length} installed file(s) under ${STATE_DIR}/${alsoCopies}, plus its ledger rows${alsoMcp}?`,
    });
  }

  const swept = [...candidates, ...copies.candidates];
  ctx.spinner.start(
    ctx.dryRun
      ? `Inspecting ${swept.length} path(s) of pack "${packId}"...`
      : `Removing ${swept.length} path(s) of pack "${packId}"...`,
  );
  // Documents first: while the pack is still installed, a failure here leaves a
  // repo the next `sync` re-emits into, rather than one holding an entry nobody
  // can prove and a selection nobody can resolve.
  const mcp = await removePackMcpEntries(rootDir, manifest, packId, packSupply, !ctx.dryRun);
  const report = await sweepReclaimCandidates(swept, {
    rootDir,
    consent: !ctx.dryRun,
    trustedExactPaths: trustedInfraPaths(manifest.ledger),
    coOwnedPaths: coOwnedReclaimReducers(manifest, packSupply, await coOwnedReclaimRenderings(rootDir, manifest)),
    ...hookScriptRetention(manifest, packSupply),
    // Rendered while the pack is still installed, so the pack's own content
    // still proves itself and its copies (REQ-PLUGIN-046).
    ...copies.proof,
  });
  ctx.spinner.stop();

  // Copies the proof could not judge (the pack could not be planned): unproven
  // is not disproven, so each keeps its row for the next sync (review/61).
  const unproven = new Set(report.entries.filter((entry) => entry.unproven === true).map((entry) => entry.path));
  const droppedCopies = [...copies.rows].filter((row) => !unproven.has(row.path));

  let removedRows = 0;
  if (!ctx.dryRun) {
    const owner = packOwner(packId);
    // A judged copy's row leaves with the pack's rows, kept file or not: no
    // rendering will prove it once the pack is gone, so the kept file is the
    // owner's.
    const dropped = new Set(droppedCopies);
    const ledger = manifest.ledger
      .filter((entry) => entry.adapter !== owner && !dropped.has(entry))
      .map((entry) => rehashRewritten(entry, mcp.rewritten));
    removedRows = manifest.ledger.length - ledger.length;
    // The selection lets go of every id this pack supplied — including one whose
    // on-disk entry was kept because the operator had tuned it. Keeping it
    // selected would fail every later `sync` on an id nothing resolves, which is
    // the failure whose own remedy could not clean up after itself.
    const mcpConfig =
      manifest.mcp === undefined || mcp.deselected.length === 0
        ? manifest.mcp
        : {
            ...manifest.mcp,
            servers: manifest.mcp.servers.filter((id) => !mcp.deselected.includes(id)),
          };
    await writeManifest(
      rootDir,
      { ...manifest, ledger, ...(mcpConfig === undefined ? {} : { mcp: mcpConfig }) },
      { now: ctx.app.runtime.clock.now() },
    );
  }

  const formatted = formatReclaimReport(report);
  if (formatted !== "") ctx.io.out(`${formatted}\n`);

  // Files still on disk after the sweep (edited bytes, a refused unlink) are
  // salvage: their rows are gone, so nothing will ever reclaim them. An
  // unproven copy is not: its row stays.
  const salvaged = report.entries.filter(
    (entry) =>
      (entry.action === "skipped-user-content" || entry.action === "skipped-unsafe-path") && entry.unproven !== true,
  ).length;
  const copyPaths = new Set(copies.candidates.map((candidate) => candidate.entry.path));
  const keptCopies = report.entries
    .filter((entry) => copyPaths.has(entry.path) && entry.action.startsWith("skipped"))
    .map((entry) => entry.path);

  if (ctx.dryRun) {
    const copySentence =
      (droppedCopies.length === 0 ? "" : ` and the rows of its ${droppedCopies.length} client copy(ies)`) +
      (unproven.size === 0 ? "" : `, keeping the rows of the ${unproven.size} copy(ies) it could not judge`);
    ctx.io.out(
      `Dry run: nothing was written and the manifest still records the pack. ` +
        `A real run also drops its ${candidates.length} ledger row(s)${copySentence}` +
        `${mcpSentence(mcp)} and leaves the rest of ${STATE_DIR}/ intact.\n`,
    );
    nextSteps(ctx, [`apply it: ${packageCommand(`clean --pack ${packId}`)}`]);
  } else {
    ctx.io.out(
      `${ctx.palette.green(`Pack "${packId}" removed`)} — ${report.deletedCount} file(s) deleted, ` +
        `${report.skippedCount} skipped, ${removedRows} ledger row(s) dropped.\n`,
    );
    if (mcp.deselected.length > 0) {
      ctx.io.out(
        `MCP: ${mcp.deselected.join(", ")} dropped from the selection` +
          `${mcp.rewritten.size === 0 ? "" : ` and removed from ${[...mcp.rewritten.keys()].join(", ")}`}. ` +
          `Every entry those files hold that this repo did not write is untouched, and .env.mcp is ` +
          `yours — the credentials in it stay.\n`,
      );
    }
    if (mcp.kept.length > 0) {
      ctx.io.out(
        `Kept your own definition of ${mcp.kept.join(", ")} — those entries no longer match what ` +
          `this repo renders for them, so they are yours now. Remove them by hand if you meant to.\n`,
      );
    }
    for (const refusal of mcp.refusals) ctx.io.out(`${refusal}\n`);
    if (salvaged > 0) {
      ctx.io.out(
        `${salvaged} kept file(s) are user-owned now — their ledger rows are dropped, so no clean or sync will touch them again.\n`,
      );
    }
    if (copies.unplanned !== null && copies.rows.size > 0) {
      ctx.io.out(
        `Pack "${packId}" could not be planned as installed (${copies.unplanned}), so none of its ` +
          `${copies.rows.size} client copy(ies) can be proven the engine's: each is kept with its ledger row ` +
          `and named above.\n`,
      );
    }
    if (copies.unexamined !== null) {
      ctx.io.out(
        `The setup could not be planned without pack "${packId}" (${copies.unexamined}), so its client ` +
          `copies were not looked for: their rows stay.\n`,
      );
    }
    nextSteps(ctx, [
      ...(keptCopies.length === 0
        ? []
        : [`delete by hand each client copy kept above, unless it is yours: ${keptCopies.join(", ")}`]),
      `regenerate the clients' files without the pack: ${packageCommand("sync")}`,
    ]);
  }

  return {
    exitCode: 0,
    json: {
      removed: report.deletedCount,
      stripped: report.strippedCount,
      skipped: report.skippedCount,
      stateDirRemoved: false,
      entries: report.entries,
      pack: packId,
      removedRows,
      mcpServersDeselected: mcp.deselected,
      mcpDocumentsRewritten: [...mcp.rewritten.keys()],
      mcpServersKept: mcp.kept,
    },
  };
}

// ── Command ────────────────────────────────────────────────────

export const cleanCommand: CommandModule = {
  name: "clean",
  summary: `remove every generated file and the ${STATE_DIR}/ state directory`,
  mutating: true,

  configure(cmd) {
    cmd.option(
      "--pack <id>",
      "remove one installed pack — its files and ledger rows — and keep everything else",
    );
  },

  async run(ctx, opts): Promise<CommandResult> {
    const rootDir = ctx.app.runtime.cwd;
    const packId = typeof opts["pack"] === "string" ? opts["pack"] : undefined;

    // A corrupt manifest surfaces the engine's own CONFIG_ERROR untouched: its
    // message already names every defect and offers delete-and-reinitialise,
    // which is the better repair path than anything this command could add.
    const manifest = await readManifest(rootDir);
    if (manifest === null) return nothingToClean(ctx);

    if (packId !== undefined) return await runScopedClean(ctx, rootDir, manifest, packId);

    const candidates = planCleanCandidates(manifest);

    // --dry-run neither prompts nor refuses: it writes nothing, so the
    // destructive gate has nothing to gate.
    if (!ctx.dryRun) {
      await confirmDestruction(ctx, {
        refusedWhat: `${candidates.length} generated file(s) and ${STATE_DIR}/`,
        question: `Remove ${candidates.length} generated file(s) and the ${STATE_DIR}/ state directory (learnings, handoffs and installed packs included)?`,
      });
    }

    ctx.spinner.start(
      ctx.dryRun
        ? `Inspecting ${candidates.length} recorded path(s)...`
        : `Removing ${candidates.length} recorded path(s)...`,
    );
    const packSupply = await installedPackMcpSupply(rootDir, manifest);
    const report = await sweepReclaimCandidates(candidates, {
      rootDir,
      consent: !ctx.dryRun,
      trustedExactPaths: trustedInfraPaths(manifest.ledger),
      // No deselection step here, and none is owed: the full clean sweeps the
      // client documents themselves, and it resolves pack supply BEFORE the
      // sweep, so the reducer can still prove a pack-supplied entry. The
      // selection goes with the state directory a few lines below.
      coOwnedPaths: coOwnedReclaimReducers(manifest, packSupply, await coOwnedReclaimRenderings(rootDir, manifest)),
      ...hookScriptRetention(manifest, packSupply),
      ...(await cleanRenderings(rootDir, manifest, candidates, ctx.app.version)),
    });
    ctx.spinner.stop();

    // A hooks document the sweep left in place that still runs a hook script
    // under the state directory keeps the directory whole, since deleting it
    // would take the script with it (S17, `../../merge/reclaim.ts::hookDocumentsLeftInPlace`).
    // A document that runs only scripts elsewhere (Cursor's guards) keeps those
    // alone. Until file 01's `u1-clean-keeps-state` prunes around them, the
    // whole directory stays.
    const underStateDir = (path: string): boolean => path.startsWith(`${STATE_DIR}/`);
    const wiringKept = (report.wiringKept ?? []).filter((doc) => doc.scripts.some(underStateDir));
    const stateDirKept = [...new Set(wiringKept.flatMap((doc) => doc.scripts.filter(underStateDir)))];
    const stateDirRemoved = ctx.dryRun || stateDirKept.length > 0 ? false : await removeStateDir(rootDir);

    const formatted = formatReclaimReport(report);
    if (formatted !== "") ctx.io.out(`${formatted}\n`);
    for (const doc of wiringKept) {
      ctx.io.out(
        doc.unreadable === true
          ? `Kept ${STATE_DIR}/: ${doc.path} could not be read (a link, a hard link, or a file it cannot open), so ` +
              `nothing proves it no longer runs a hook script under it. Replace it with a regular file (or delete it), ` +
              `then re-run stamity clean.\n`
          : `Kept ${STATE_DIR}/: ${doc.path} still runs a hook script under it, so deleting it would leave that hook ` +
              `pointing at nothing. Remove that wiring, then re-run stamity clean.\n`,
      );
    }

    if (ctx.dryRun) {
      ctx.io.out(
        `Dry run: nothing was written and ${STATE_DIR}/ is untouched. ` +
          `A real run also deletes ${STATE_DIR}/ and everything in it.\n`,
      );
      // Printed on the preview too: what a real run would leave behind is part
      // of what the preview is for, and the lines name no destructive step.
      renderPluginUninstall(ctx, manifest);
      nextSteps(ctx, ["apply it: stamity clean"]);
    } else {
      ctx.io.out(
        `${ctx.palette.green("Clean complete")} — ${report.deletedCount} file(s) deleted, ` +
          `${report.strippedCount} rewritten to keep user content, ${report.skippedCount} skipped` +
          `${stateDirRemoved ? `, ${STATE_DIR}/ removed` : ""}.\n`,
      );
      ctx.io.out("Left your .gitignore untouched — stale ignore lines are harmless.\n");
      renderPluginUninstall(ctx, manifest);
      nextSteps(ctx, [REINIT_OFFER]);
    }

    return {
      exitCode: 0,
      json: {
        removed: report.deletedCount,
        stripped: report.strippedCount,
        skipped: report.skippedCount,
        stateDirRemoved,
        // The held-back scripts that kept the state directory, when any did (S17).
        ...(stateDirKept.length > 0 ? { stateDirKept } : {}),
        entries: report.entries,
        // The same lines the human report prints, so a machine caller driving
        // an uninstall reads the steps this verb did not take.
        pluginUninstall: pluginUninstallLines(manifest).map((line) => line.trim()),
      },
    };
  },
};

/** The plugin-uninstall disclosure, printed only when a client records one. */
function renderPluginUninstall(ctx: CliContext, manifest: SetupManifest): void {
  const lines = pluginUninstallLines(manifest);
  if (lines.length === 0) return;
  ctx.io.out(
    `The plugin itself stays installed — it lives in your client, not in this repository, ` +
      `so this command neither removed it nor touched a file inside its root. Uninstall it ` +
      `with your client's own command:\n${lines.join("\n")}\n`,
  );
}
