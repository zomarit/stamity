import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pLimit from "p-limit";
import {
  withoutControlCharacters,
  type InvocableNameClash,
  type InvocableNameOwner,
} from "../../content/catalog.ts";
import { lookupCatalogEntry, resolveBundledPackRoot, type CatalogEntry } from "../../pack/curated.ts";
import type { PackInstallPlan, PackWriteSetEntry } from "../../pack/install.ts";
import type { OrgPolicyDecision } from "../../pack/orgPolicy.ts";
import type { CatalogPin, TrustTier } from "../../pack/trust.ts";
import { MANIFEST_FILE, type SetupManifest } from "../../types/manifest.ts";
import { STATE_DIR } from "../../types/markers.ts";
import { CliFailure, renderFailureHuman, type FailureDoc } from "../kit/output.ts";
import { packageCommand } from "../kit/packageName.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";

/**
 * `stamity add <pack-spec>` — the pack installer, a thin surface over the
 * engine's trust-gate chain.
 *
 * Every decision this command makes is the engine's: `planPackInstall` runs the
 * ordered gate chain (manifest -> trust tier -> org policy -> signing ->
 * lifecycle-script ban -> integrity map -> body scan -> MCP server definitions
 * -> hook definitions -> footprint -> declared tools -> rule activation ->
 * permissions -> agent capabilities) and derives the write set plus its
 * collisions;
 * `applyPackInstall` materializes that plan, writes the install receipt, and
 * hands back the ownership rows. This file adds exactly two things the engine
 * has no opinion about: how the plan reads on a terminal, and which operator
 * escape hatches are spelled as flags.
 *
 * **What the chain does not cover, said out loud.** Both execution-bearing
 * classes now clear the same bar at install ingress: `mcp_servers/*.json` at the
 * `mcpServers` gate and `hooks/*.json` at the `hooks` gate
 * (`../../pack/install.ts` -> `checkHookDefinitions`, which calls the emission
 * lane's own `readHookDefinitions` through the fails-closed launcher allow-list
 * `../../shared/launcherAllowlist.ts`). What neither gate covers is a class file
 * it does not parse — the `hooks` class also admits `.yaml`/`.yml`, which the
 * reader skips and the gate then reports `n/a` rather than `pass`. The
 * `runs on this machine` block below is what keeps such a file visible: it reads
 * the WRITE SET, not the gate rows, so a definition no gate parsed still prints
 * as a row an operator must open. One string in this file therefore may not be
 * quantified over the pack: the command `summary`, which the docs generator
 * copies verbatim into `docs/cli-reference.md` and which said "after every trust
 * gate passes" while a `.yaml` hook went unread.
 *
 * **The install composite.** Before anything lands, the operator reads: the
 * gate table, the resolved trust tier with its basis, a per-file "will install"
 * inventory (path, size, token estimate, grouped by class), one context-cost
 * line, the pack's declared scope (tools, tool footprint, touched paths),
 * EVERY COMMAND LINE the pack would wire into something that runs it, a blunt
 * caution when nothing attests the content's publisher, and — under `--preview`
 * — every file body in full. The preview needs no pager: the footprint gate
 * already capped total content at the pack's byte bound.
 *
 * The command lines are in the DEFAULT view rather than behind `--preview`, and
 * that placement is the point. Path, size and token count describe prose; a
 * `hooks/*.json` entry becomes a command in the client's own settings file that
 * runs on every matching tool call, and an `mcp_servers/*.json` entry becomes a
 * launcher the editor spawns at start-up. Those two classes are the difference
 * between installing text and installing execution, and an operator cannot
 * weigh what they are not shown.
 *
 * **Catalog resolution.** A bare name is looked up in the curated catalog
 * first; a hit resolves to the bundled pack root (or the entry's npm package)
 * and carries the entry's pin into the plan, so a first-party pack installs at
 * its catalog-granted tier with no waiver. Pinned-or-refuse holds at add AND
 * at re-install (the update path re-runs every gate): content that does not
 * hash to the pin refuses. A path-shaped spec (`./ops`) never consults the
 * catalog — an explicit path always means the directory — and a name the
 * catalog does not know falls through to the existing local-path/npm
 * resolution untouched. The org trust policy stays the first gate after the
 * manifest read regardless of how the spec resolved.
 *
 * **No prompts.** A gate either passes or refuses; there is nothing here a
 * yes/no question could resolve. The one waiver — installing a pack with no
 * trust basis at all (tier `pinned-unsigned`) — is `--allow-untrusted`, so the
 * decision is visible in the command line and therefore in a CI log, rather
 * than buried in an interactive answer nobody can audit later.
 *
 * **No `--force`.** Collisions are never overridable. A pack that would write
 * over a path it does not own is refused outright: `add` installs supply, and
 * supply that silently replaces the operator's own files is the failure mode
 * the ownership ledger exists to prevent. The next step is to clear the paths,
 * never to overrule the check.
 *
 * **No network.** The spec is a catalog id resolving to content shipped with
 * this package, a local directory (`./packs/ops`), or the name of a package
 * the operator already installed under `node_modules/`. Nothing fetches.
 *
 * Installed content is written once, not regenerated — but written is not
 * reachable, so the closing next-step opens with `sync`, which is what projects
 * the pack into a client's own directories. The second step names the pack's
 * own directory and `stamity check`: its `pack-integrity` row re-hashes every
 * installed byte against the hashes recorded at install, so an edited or
 * deleted pack file is a finding. `validate` is deliberately not named — its
 * scanned set is the overrides, user hooks, learnings, `.env.mcp` and the
 * workspace file, and installed pack bodies are not in it.
 */

/** Repo-relative manifest path, for the un-initialised refusal. */
const MANIFEST_REL_PATH = `${STATE_DIR}/${MANIFEST_FILE}`;

/** Written paths listed individually before the summary takes over. */
const MAX_LISTED_FILES = 10;

/** Concurrent body reads for `--preview`, bounded like the engine's own reads. */
const PREVIEW_READ_CONCURRENCY = 8;

/** JSON payload shape, shared by the refusal and success documents. */
interface AddPayload {
  packId: string;
  planned: {
    files: string[];
    checks: Record<string, "pass" | "n/a">;
    collisions: string[];
    /**
     * One line per invocable name this pack would share with an artifact of
     * another class (`PackInstallPlan.nameClashes`), in the refusal's own
     * words; empty when the pack's names are free.
     */
    nameClashes: string[];
    /**
     * Files the installed copy of this pack holds that this version would
     * leave behind (`PackInstallPlan.leftBehind`); empty on a first install
     * and on a re-add that replaces every file.
     */
    leftBehind: string[];
  };
  trustTier: TrustTier;
  tierBasis: string;
  policy: OrgPolicyDecision;
  totalTokens: number;
  installed: boolean;
  written: string[];
  /** Repo-relative receipt path once installed; `null` until then. */
  receiptPath: string | null;
  /**
   * Every command line the pack would wire, in write-set order. Present in the
   * default payload, not only under `--preview`: a CI job reading this document
   * is the same operator, and the execution surface is the part it has to gate
   * on.
   */
  executes: ExecutableLine[];
  /** `--preview` only: full file bodies keyed by target path. */
  preview?: Record<string, string>;
}

// ── Catalog resolution ─────────────────────────────────────────

/** How the operator's spec resolved before the engine sees it. */
interface ResolvedSpec {
  /** The spec handed to the engine: catalog hits translate, all else passes through. */
  planSpec: string;
  catalogPin?: CatalogPin;
  catalogEntry?: CatalogEntry;
}

/**
 * A spec that names a place on disk. Mirrors the engine's own path detection
 * (`resolvePackSource`) so the two surfaces split path-vs-name identically —
 * which is what makes the precedence documentable: `./ops` is always the
 * directory, even when a catalog entry `ops` exists.
 */
function isPathSpec(spec: string): boolean {
  return (
    spec.startsWith(".") ||
    spec.startsWith("/") ||
    spec.startsWith("~") ||
    spec.includes("\\") ||
    /^[A-Za-z]:/.test(spec)
  );
}

/**
 * Resolution order: explicit path -> curated catalog -> untouched fallback
 * (the engine's local-path/npm resolution). A catalog hit becomes the bundled
 * root (an absolute path the engine resolves like any other directory) or the
 * entry's npm package name, plus the pin that grants the entry's tier.
 */
function resolveSpecThroughCatalog(spec: string): ResolvedSpec {
  if (isPathSpec(spec)) return { planSpec: spec };
  const entry = lookupCatalogEntry(spec);
  if (entry === undefined) return { planSpec: spec };
  const planSpec =
    entry.source.kind === "bundled" ? resolveBundledPackRoot(entry.id) : entry.source.package;
  return { planSpec, catalogPin: entry.pin, catalogEntry: entry };
}

// ── Rendering ──────────────────────────────────────────────────

const BYTE_UNITS = ["B", "KiB", "MiB"] as const;

/** Locale-independent size, so two machines render one pack identically. */
function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const suffix = BYTE_UNITS[unit] ?? "B";
  return unit === 0 ? `${value} ${suffix}` : `${value.toFixed(1)} ${suffix}`;
}

interface PlanFacts {
  targetDir: string;
  footprintBytes: number;
  footprintCap: number;
  /** Tools the pack declares that the project does not target. */
  untargetedTools: string[];
}

/**
 * The plan's header: what was checked, how much lands, where, and on what
 * trust basis. Printed before any refusal so the reasons below it have context
 * — in `--json` mode the funnel suppresses stdout and the payload carries the
 * same facts.
 */
function renderPlanHeader(ctx: CliContext, plan: PackInstallPlan, facts: PlanFacts): void {
  const { io, palette } = ctx;
  const gates = Object.entries(plan.checks);
  // Widened past the longest label of BOTH blocks so the gate table and the
  // summary rows below it share one column.
  const width = Math.max("footprint".length, ...gates.map(([gate]) => gate.length));

  io.out(
    `\n${palette.bold(`pack ${plan.manifest.name}@${plan.manifest.version}`)} ` +
      `${palette.dim(`(${plan.source.kind})`)}\n\n`,
  );
  for (const [gate, outcome] of gates) {
    const mark = outcome === "pass" ? palette.green("pass") : palette.yellow("n/a");
    io.out(`  ${gate.padEnd(width)}  ${mark}\n`);
  }

  const tierMark =
    plan.trustTier === "pinned-unsigned"
      ? palette.yellow(plan.trustTier)
      : palette.green(plan.trustTier);
  io.out(`\n  ${"files".padEnd(width)}  ${plan.writeSet.length}\n`);
  io.out(
    `  ${"footprint".padEnd(width)}  ${formatBytes(facts.footprintBytes)} ` +
      `of ${formatBytes(facts.footprintCap)} allowed\n`,
  );
  io.out(`  ${"target".padEnd(width)}  ${facts.targetDir}\n`);
  io.out(`  ${"trust".padEnd(width)}  ${tierMark} — ${plan.tierBasis}\n`);

  if (facts.untargetedTools.length > 0) {
    io.out(
      `  ${palette.dim(
        `note: the pack also targets ${facts.untargetedTools.join(", ")}, which this project does not`,
      )}\n`,
    );
  }
}

/**
 * "Will install" inventory: one row per planned file — pack-relative path,
 * size, token estimate — grouped under its content class. Column widths are
 * measured over the whole set, so a long path widens every row instead of
 * breaking alignment.
 */
function renderInventory(ctx: CliContext, plan: PackInstallPlan): void {
  const { io, palette } = ctx;
  io.out(`\n  ${palette.bold("will install")}\n`);
  if (plan.writeSet.length === 0) {
    io.out(`    ${palette.dim("no content files — only the install receipt is written")}\n`);
    return;
  }

  const groups = new Map<string, PackWriteSetEntry[]>();
  for (const entry of plan.writeSet) {
    const group = groups.get(entry.contentClass);
    if (group === undefined) groups.set(entry.contentClass, [entry]);
    else group.push(entry);
  }

  const pathWidth = Math.max(...plan.writeSet.map((entry) => entry.relPath.length));
  for (const [contentClass, entries] of groups) {
    io.out(`    ${palette.dim(contentClass)}\n`);
    for (const entry of entries) {
      const size = formatBytes(entry.sizeBytes).padStart(9);
      const tokens = plan.tokensByPath[entry.targetPath] ?? 0;
      io.out(`      ${entry.relPath.padEnd(pathWidth)}  ${size}  ~${tokens} tok\n`);
    }
  }
  io.out(
    `\n  context cost  ~${plan.totalTokens} tokens across ${plan.writeSet.length} file(s)\n`,
  );
}

/**
 * The pack's declared scope, verbatim: target tools, tool footprint, touched
 * paths. An absent declaration reads "declares none" rather than vanishing —
 * a pack that declares nothing is a fact the operator should see stated.
 */
function renderScope(ctx: CliContext, plan: PackInstallPlan): void {
  const { io, palette } = ctx;
  const permissions = plan.manifest.permissions;
  const row = (label: string, values: readonly string[] | undefined): void => {
    const rendered =
      values === undefined || values.length === 0
        ? palette.dim("declares none")
        : values.join(", ");
    io.out(`    ${label.padEnd(14)}  ${rendered}\n`);
  };
  io.out(`\n  ${palette.bold("scope")}\n`);
  row("declared tools", plan.manifest.declaredTools);
  row("tool footprint", permissions?.toolFootprint);
  row("touched paths", permissions?.touchedPaths);
}

/**
 * Every command line this pack would wire into something that runs it.
 *
 * Two content classes carry one: a hook definition becomes an entry in the
 * client's own settings file and runs on every matching tool call, and an MCP
 * server definition becomes a launcher the editor spawns at start-up. Both are
 * argv the operator's machine executes with the operator's privileges, and
 * neither was visible anywhere in the default view — the inventory above shows
 * a path, a size and a token count, which describe every class identically.
 *
 * A file that will not parse is REPORTED, never skipped: the whole purpose of
 * this block is that nothing executable installs unseen, so "this one could not
 * be read" is the most important row it can print.
 *
 * No note qualifies the rows any more. It used to say the table above had no
 * hooks row, which was true of the chain until `hooks` joined `mcpServers` at
 * install ingress (`../../pack/install.ts` -> `checkHookDefinitions`); a note
 * documents a gap, so it may not outlive one — leaving it would have printed a
 * false statement about the very table beside it.
 */
function renderExecutables(ctx: CliContext, lines: readonly ExecutableLine[]): void {
  const { io, palette } = ctx;
  io.out(`\n  ${palette.bold("runs on this machine")}\n`);
  if (lines.length === 0) {
    io.out(`    ${palette.dim("no hook or MCP server definitions — this pack wires no commands")}\n`);
    return;
  }
  const labelWidth = Math.max(...lines.map((line) => line.label.length));
  for (const line of lines) {
    io.out(`    ${palette.yellow(line.label.padEnd(labelWidth))}  ${line.command}\n`);
    io.out(`      ${palette.dim(line.relPath)}\n`);
  }
}

/**
 * The blunt unverified-content caution, printed for tier `pinned-unsigned`
 * only: the waiver does not verify anything, so the operator is told exactly
 * what is missing and pointed at the flag that shows the full bodies.
 *
 * The wording names EXECUTION, not authorship. "Nothing attests who published
 * these bodies" is true and was the whole caution, and it framed the decision
 * as a provenance question — accept an unknown author — when what the waiver
 * actually accepts is that this pack's own files may name commands the client
 * will run. An operator weighing "unattributed prose" against "arbitrary local
 * command on every tool call" is weighing the wrong risk.
 */
function renderCaution(ctx: CliContext): void {
  const { io, palette } = ctx;
  io.out(
    `\n  ${palette.yellow("caution: unverified content — nothing attests who published these bodies,")}\n` +
      `  ${palette.yellow("and a pack's hook and MCP server definitions are commands your client RUNS:")}\n` +
      `  ${palette.yellow("a hook lands in your client's settings and runs on every matching tool call,")}\n` +
      `  ${palette.yellow("an MCP server is a launcher your editor spawns at start-up. Both run as you.")}\n` +
      `  ${palette.yellow("read the command lines above, and the full bodies with --preview, before installing.")}\n`,
  );
}

/**
 * Full-content preview: every planned file body between per-file headers.
 * Bounded by the footprint cap the gate already enforced, so no pager
 * machinery — the whole preview is at most the pack's byte bound.
 */
function renderPreview(
  ctx: CliContext,
  plan: PackInstallPlan,
  bodies: ReadonlyMap<string, string>,
): void {
  const { io, palette } = ctx;
  io.out(`\n  ${palette.bold("preview")}\n`);
  if (plan.writeSet.length === 0) {
    io.out(`    ${palette.dim("no content files to preview")}\n`);
    return;
  }
  for (const entry of plan.writeSet) {
    io.out(`\n${palette.dim(`──── ${entry.relPath} ────`)}\n`);
    const body = bodies.get(entry.targetPath) ?? "";
    io.out(body === "" || body.endsWith("\n") ? body : `${body}\n`);
  }
}

/** Content classes whose files declare a command something will execute. */
const EXECUTABLE_CLASSES: ReadonlySet<string> = new Set(["hooks", "mcp_servers"]);

/** Longest command line rendered before it is elided; `--preview` shows the file whole. */
const MAX_COMMAND_CHARS = 160;

/** One command line a pack would wire, with the file that declares it. */
interface ExecutableLine {
  /** What triggers it — a hook event, or an MCP server id. */
  label: string;
  /** The argv as one line, elided past {@link MAX_COMMAND_CHARS}. */
  command: string;
  /** Pack-relative file that declares it. */
  relPath: string;
}

/** One argv as a display line: control characters flattened, length bounded. */
function commandLine(parts: readonly unknown[]): string {
  const flat = parts
    .filter((part) => typeof part === "string")
    .join(" ")
    // The argv comes out of a third-party file and is about to be printed: a
    // control character in it could rewrite the line an operator is reading.
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (flat === "") return "(declares no command)";
  return flat.length > MAX_COMMAND_CHARS ? `${flat.slice(0, MAX_COMMAND_CHARS - 1)}…` : flat;
}

/**
 * The command lines one executable-class file declares.
 *
 * Read structurally rather than through the engine's ingress: those gates run at
 * emission and at server resolution, and this is a PREVIEW — it has to render
 * what the file says even when the file is malformed, because a definition the
 * operator cannot see is the failure this block exists to close.
 */
function declaredCommands(relPath: string, contentClass: string, document: unknown): ExecutableLine[] {
  if (document === null || typeof document !== "object") {
    return [{ label: "unreadable", command: "not a JSON object — read the file", relPath }];
  }
  if (contentClass === "hooks") {
    const declared = (document as { hooks?: unknown }).hooks;
    if (!Array.isArray(declared)) {
      return [{ label: "unreadable", command: "declares no `hooks` array — read the file", relPath }];
    }
    return declared.map((entry) => {
      const row = (entry ?? {}) as { event?: unknown; command?: unknown };
      const argv = Array.isArray(row.command) ? row.command : [row.command];
      return {
        label: typeof row.event === "string" ? row.event : "(no event)",
        command: commandLine(argv),
        relPath,
      };
    });
  }
  const server = document as { id?: unknown; command?: unknown; args?: unknown };
  return [
    {
      label: typeof server.id === "string" ? server.id : "(no id)",
      command: commandLine([server.command, ...(Array.isArray(server.args) ? server.args : [])]),
      relPath,
    },
  ];
}

/**
 * Every command line in the write set, in write-set order. Bounded reads, and a
 * file that cannot be read at all becomes a row rather than an omission.
 */
async function readExecutableCommands(plan: PackInstallPlan): Promise<ExecutableLine[]> {
  const entries = plan.writeSet.filter((entry) => EXECUTABLE_CLASSES.has(entry.contentClass));
  if (entries.length === 0) return [];
  const groups = await pLimit(PREVIEW_READ_CONCURRENCY).map(entries, async (entry) => {
    const absPath = join(plan.source.packRoot, ...entry.relPath.split("/"));
    try {
      return declaredCommands(entry.relPath, entry.contentClass, JSON.parse(await readFile(absPath, "utf8")));
    } catch {
      return [{ label: "unreadable", command: "could not be parsed — read the file", relPath: entry.relPath }];
    }
  });
  return groups.flat();
}

/** The planned bodies for `--preview`, keyed by target path. Bounded reads. */
async function readPlannedBodies(plan: PackInstallPlan): Promise<Map<string, string>> {
  const pairs = await pLimit(PREVIEW_READ_CONCURRENCY).map(plan.writeSet, async (entry) => {
    const absPath = join(plan.source.packRoot, ...entry.relPath.split("/"));
    return [entry.targetPath, await readFile(absPath, "utf8")] as const;
  });
  return new Map(pairs);
}

/** The engine's refusal strings, verbatim, under a heading. */
function renderReasons(ctx: CliContext, reasons: readonly string[], heading = "collisions"): void {
  ctx.io.out(`\n  ${ctx.palette.red(heading)}\n`);
  for (const reason of reasons) ctx.io.out(`    ${reason}\n`);
}

/**
 * A refusal the command describes itself: the human what/why/next goes to
 * stderr, and the returned exit-1 result becomes the single `ok: false`
 * document in JSON mode (the funnel does not stack an envelope on top).
 */
function refuse(ctx: CliContext, payload: AddPayload, doc: FailureDoc): CommandResult {
  if (!ctx.json) ctx.io.err(`${renderFailureHuman(doc, ctx.palette)}\n`);
  return { exitCode: 1, json: { ...payload, error: doc } };
}

/**
 * One kind of refusal a plan can carry: what is in the way (counted), why it
 * blocks the install, and the step that clears it. A plan carrying several
 * kinds is refused once, with every part ({@link planRefusal}), so following
 * the error's `next` clears all of them rather than only the first.
 */
interface RefusalPart {
  message: string;
  why: string;
  next: string;
}

/**
 * Collision part. `add` has no override, so the next step is about clearing
 * the paths, and which steps clear them depends on whether the pack being
 * added is still installed (`installed`, read from its `pack:<id>` rows):
 *
 * - installed: the stale copy is replaced in {@link replaceSteps}' steps —
 *   `clean --pack` removes the client copies an earlier `sync` projected, which
 *   are what the `add` would otherwise find owned, and drops the rows of any it
 *   keeps;
 * - not installed (a `clean --pack` already ran): `clean --pack` would refuse,
 *   since the ledger holds no row of the pack, and the claims left are client
 *   copies a `clean --pack` of an earlier release left for `sync` — so `sync`,
 *   then `add`, then `sync`.
 *
 * Either way a file no ledger row owns (a stray, or an edited pack file
 * `clean --pack` kept as salvage) is never removed by a verb: it is the
 * operator's to move out of the way or delete (review/57).
 */
function collisionPart(
  packId: string,
  spec: string,
  installed: boolean,
  reasons: readonly string[],
): RefusalPart {
  const claims = installed
    ? `pack "${packId}" is installed: to replace it, ${replaceSteps(packId, spec)}`
    : `pack "${packId}" is not installed: for a path or id a client copy still claims (left by an ` +
      `earlier sync), run \`${packageCommand("sync")}\` to remove those copies, then ` +
      `\`${packageCommand(`add ${spec}`)}\`, then \`${packageCommand("sync")}\``;
  return {
    message: `${reasons.length} path(s) it would write are not free`,
    why: "a pack never overwrites a file it does not own, and add has no --force",
    next:
      `resolve the collisions, then re-run — ${claims}; for a file no ledger row owns ` +
      `("a file already exists there"), move it out of the way or delete it, then re-run`,
  };
}

/**
 * Name-clash part: a command and a skill (or a rule delivered as one) that
 * would install under one name. Here every path is free and the NAME is taken,
 * so the remedy depends on who the other owner is — the per-owner table the
 * `sync` refusal keeps (`../../emit/planner.ts` → `remedyOf`), seen from the
 * incoming pack's side ({@link nameClashRemedyOf}).
 */
function nameClashPart(
  packId: string,
  spec: string,
  clashes: readonly InvocableNameClash[],
): RefusalPart {
  const remedies = [
    `rename the listed artifact(s) in the incoming pack's source (pack "${packId}"), then re-run`,
    ...new Set(
      clashes.flatMap((clash) =>
        clash.owners.flatMap((owner) => nameClashRemedyOf(packId, spec, owner, clash.name)),
      ),
    ),
  ];
  // The fixed text has to fit every clash it carries: a skill against a rule
  // delivered as a skill involves no command, so nothing is hidden on Claude.
  const hidesCommand = clashes.some((clash) =>
    clash.owners.some((owner) => owner.kind === "command"),
  );
  return {
    message: `${clashes.length} name(s) it would emit are taken`,
    why: hidesCommand
      ? "a command and a skill of one name install into one folder — on Cursor and Codex they " +
        "overwrite each other's files, and on Claude the skill hides the command"
      : "artifacts of one name share one skill folder wherever they are delivered as skills, " +
        "and there they overwrite each other's files",
    next: remedies.join("; "),
  };
}

/**
 * The remedy one owner of a clashing name adds, beside renaming in the
 * incoming pack's source, which applies to every clash. The incoming pack's
 * own owners add nothing more. An override is the operator's own file, so it
 * can move. The core and the fork layer ship with this package, so nothing in
 * this repository can move them, and the clash is the incoming pack's to fix.
 * Another installed pack is never advised away: a newcomer could clash with an
 * established name on purpose to provoke exactly that advice, so its removal
 * is offered only as a deliberate replacement, saying who then takes the name,
 * in the four steps that replacement takes ({@link replaceSteps}). Every name,
 * id and path is printed without control characters, as the clash lines are.
 */
function nameClashRemedyOf(
  packId: string,
  spec: string,
  owner: InvocableNameOwner,
  name: string,
): string[] {
  const shown = withoutControlCharacters(name);
  switch (owner.layer) {
    case "pack": {
      if (owner.packId === undefined || owner.packId === packId) return [];
      const other = withoutControlCharacters(owner.packId);
      return [
        `pack "${other}" is installed and keeps ${shown}: remove it only to replace it with ` +
          `pack "${packId}" on purpose, which then takes the name — ${replaceSteps(other, spec)}`,
      ];
    }
    case "user": {
      const path = withoutControlCharacters(owner.path);
      return [`or rename or remove your override at ${path}`];
    }
    case "fork":
      return [
        `the fork-layer file at ${withoutControlCharacters(owner.path)} ships with this ` +
          `package and cannot move here: report the clash to the maintainers of pack "${packId}"`,
      ];
    default:
      return [
        `the core ${owner.kind === "rule-skill" ? "rule" : owner.kind} "${shown}" ships with ` +
          `this package and cannot move here: report the clash to the maintainers of pack ` +
          `"${packId}"`,
      ];
  }
}

/**
 * The steps that replace an installed pack: `clean --pack` removes the pack's
 * own files and the copies an earlier `sync` projected into the clients, but a
 * copy only as bytes the engine renders from the installed pack. A copy it
 * cannot prove (one its owner edited, or every copy of a pack the planner
 * refuses) is kept, named and disowned, and left on disk it collides with the
 * copy the re-added pack's `sync` writes, so it is deleted by hand first. Then
 * `sync`, `add`, and `sync` to project what it installed.
 */
function replaceSteps(removed: string, spec: string): string {
  return (
    `run \`${packageCommand(`clean --pack ${removed}`)}\`, then delete by hand any client ` +
    `copy it keeps and names, then \`${packageCommand("sync")}\`, then ` +
    `\`${packageCommand(`add ${spec}`)}\`, then \`${packageCommand("sync")}\``
  );
}

/**
 * Left-behind part: a re-add whose version dropped files the installed copy
 * holds. The apply deletes nothing and replaces the pack's ledger rows, so
 * those files would stay with no row — still read by `sync`, out of `clean
 * --pack`'s reach — which is why the remedy runs `clean --pack` FIRST, while
 * the rows still name them, and then {@link replaceSteps}' `sync` before the
 * `add`.
 */
function leftBehindPart(packId: string, spec: string, paths: readonly string[]): RefusalPart {
  return {
    message: `${paths.length} file(s) of the installed copy would be left behind`,
    why:
      "add writes the new version over the installed one and deletes nothing, so a file this " +
      "version dropped would stay on disk with no ledger row — sync would still read it, and " +
      "clean --pack could no longer remove it",
    next: replaceSteps(packId, spec),
  };
}

/** One error document over every part, in the order the parts are listed. */
function planRefusal(packId: string, parts: readonly RefusalPart[]): FailureDoc {
  const each = (pick: (part: RefusalPart) => string): string => parts.map(pick).join("; ");
  return {
    code: "VALIDATION_ERROR",
    message: `pack "${packId}" was not installed: ${each((part) => part.message)}`,
    why: each((part) => part.why),
    next: each((part) => part.next),
  };
}

/** Collision refusal on its own: the apply's re-check, which can name only paths. */
function collisionRefusal(
  packId: string,
  spec: string,
  installed: boolean,
  reasons: readonly string[],
): FailureDoc {
  return planRefusal(packId, [collisionPart(packId, spec, installed, reasons)]);
}

// ── Command ────────────────────────────────────────────────────

export const addCommand: CommandModule = {
  name: "add",
  // Names what the command does instead of quantifying over gates it does not
  // run: the chain is 13 named rows, printed in full, and the hooks class is
  // not among them (module header). This string ships — the docs generator
  // copies it into `docs/cli-reference.md` twice — so a completeness claim here
  // is a published one.
  summary: "install a content pack: run the gate chain, show every command it would wire, then write",
  mutating: true,
  args: [
    {
      name: "pack-spec",
      description:
        "catalog id (ops), pack directory (./packs/ops), or an installed package name (@acme/ops)",
      required: true,
    },
  ],

  configure(cmd) {
    cmd.option(
      "--allow-untrusted",
      "install a pack with no trust basis at all — its hook and MCP definitions become " +
        "commands your client runs as you (for packs you authored)",
    );
    cmd.option(
      "--preview",
      "print every planned file's full body (bounded by the pack's footprint cap)",
    );
  },

  async run(ctx, opts, args): Promise<CommandResult> {
    const rootDir = ctx.app.runtime.cwd;
    const spec = args[0] ?? "";
    const allowUntrusted = opts["allowUntrusted"] === true;
    const preview = opts["preview"] === true;
    const packEngine = ctx.engine.pack;
    const manifestStore = ctx.engine.manifest.manifest;

    // Ownership first. A pack's files are recorded in the ledger, so installing
    // without a manifest would leave content on disk that nothing owns and no
    // uninstall could ever reclaim.
    const projectManifest: SetupManifest | null = await manifestStore.readManifest(rootDir);
    if (projectManifest === null) {
      throw new CliFailure({
        code: "VALIDATION_ERROR",
        message: `this repo is not initialised — there is no ${MANIFEST_REL_PATH} to record pack ownership in`,
        why: "installed pack files are tracked as ledger rows, which only exist once the repo has a manifest",
        next: `run: ${packageCommand("init")}`,
      });
    }

    const resolved = resolveSpecThroughCatalog(spec);
    const pinGrantsTrust =
      resolved.catalogPin !== undefined &&
      (resolved.catalogPin.tier === "scanned" || resolved.catalogPin.tier === "curator-verified");

    // Read the pack's own manifest before planning so a pack with no trust
    // basis is refused in the CLI's vocabulary — naming the flag that waives
    // it. Skipped when a catalog pin grants a trusted tier: the pin is the
    // trust basis, and the engine verifies it pinned-or-refuse inside
    // planPackInstall. The engine's signing gate stays authoritative either way.
    if (!pinGrantsTrust) {
      const source = await packEngine.manifest.resolvePackSource(rootDir, resolved.planSpec);
      const packManifest = await packEngine.manifest.readPackManifest(source.packRoot);
      if (packManifest.signing === undefined && !allowUntrusted) {
        throw new CliFailure({
          code: "INTEGRITY_ERROR",
          message: `pack "${packManifest.name}" has no trust basis — no catalog pin, no signing declaration — and such packs are refused by default`,
          // Names what the waiver actually accepts. Authorship was the whole
          // reason given, and it understated the decision: a pack's hook and MCP
          // definitions are argv, not prose, and installing one arms them.
          why:
            "pack bodies land directly in agent context, and its hook and MCP server definitions " +
            "become commands your client runs as you — a hook on every matching tool call, an MCP " +
            "launcher at editor start-up — so nothing attests who wrote the code you would be running",
          next: "install from the curated catalog or a signed build, or — for a pack you authored yourself — re-run with --allow-untrusted, reading the `runs on this machine` block before you accept",
        });
      }
    }

    ctx.spinner.start(`checking pack ${resolved.catalogEntry?.id ?? spec}`);
    let plan: PackInstallPlan;
    try {
      plan = await packEngine.install.planPackInstall(rootDir, resolved.planSpec, {
        allowUntrusted,
        ...(resolved.catalogPin === undefined ? {} : { catalogPin: resolved.catalogPin }),
      });
    } finally {
      ctx.spinner.stop();
    }

    // Sizes come from the write set the footprint gate measured, so the
    // reported number is the one that was checked, not a second opinion.
    const declaredCap = plan.manifest.maxFootprintBytes;
    const facts: PlanFacts = {
      targetDir: packEngine.install.packLedgerRelPath(plan.manifest.name),
      footprintBytes: plan.writeSet.reduce((sum, entry) => sum + entry.sizeBytes, 0),
      footprintCap:
        declaredCap === undefined
          ? packEngine.manifest.DEFAULT_MAX_FOOTPRINT_BYTES
          : Math.min(declaredCap, packEngine.manifest.DEFAULT_MAX_FOOTPRINT_BYTES),
      untargetedTools: (plan.manifest.declaredTools ?? []).filter(
        (tool) => !projectManifest.tools.includes(tool),
      ),
    };

    // Read unconditionally: the executable-class rows are default output, not a
    // `--preview` extra, and the set is bounded by the footprint gate above.
    const [bodies, executables] = await Promise.all([
      preview ? readPlannedBodies(plan) : Promise.resolve(null),
      readExecutableCommands(plan),
    ]);

    const nameClashes = plan.nameClashes ?? [];
    const leftBehind = plan.leftBehind ?? [];
    const nameClashLines = nameClashes.map((clash) =>
      ctx.engine.content.catalog.describeInvocableNameClash(clash),
    );

    const payload: AddPayload = {
      packId: plan.manifest.name,
      planned: {
        files: plan.writeSet.map((entry) => entry.targetPath),
        checks: plan.checks,
        collisions: plan.collisions,
        nameClashes: nameClashLines,
        leftBehind,
      },
      trustTier: plan.trustTier,
      tierBasis: plan.tierBasis,
      policy: plan.policy,
      totalTokens: plan.totalTokens,
      installed: false,
      written: [],
      receiptPath: null,
      executes: executables,
      ...(bodies === null ? {} : { preview: Object.fromEntries(bodies) }),
    };

    renderPlanHeader(ctx, plan, facts);
    if (resolved.catalogEntry !== undefined && resolved.catalogEntry.notAudited) {
      // The catalog's own words, verbatim: the entry was format-verified, not
      // reviewed, and the entry text is the disclosure of record.
      ctx.io.out(`  ${ctx.palette.yellow(resolved.catalogEntry.disclaimer)}\n`);
    }
    renderInventory(ctx, plan);
    renderScope(ctx, plan);
    renderExecutables(ctx, executables);
    if (plan.trustTier === "pinned-unsigned") renderCaution(ctx);
    if (bodies !== null) renderPreview(ctx, plan, bodies);

    // Paths first, then names, then the installed copy's leftovers: every
    // kind the plan carries is listed and carried by the one error document,
    // so one re-run is not spent discovering the next refusal.
    // Whether the pack being added is installed decides which steps clear a
    // collision: `clean --pack` refuses a pack the ledger holds no row of.
    const installed =
      packEngine.install.planPackRemoval(projectManifest, plan.manifest.name).length > 0;
    const parts: RefusalPart[] = [];
    if (plan.collisions.length > 0) {
      renderReasons(ctx, plan.collisions);
      parts.push(collisionPart(plan.manifest.name, spec, installed, plan.collisions));
    }
    if (nameClashes.length > 0) {
      renderReasons(ctx, nameClashLines, "name clashes");
      parts.push(nameClashPart(plan.manifest.name, spec, nameClashes));
    }
    if (leftBehind.length > 0) {
      // Pack-supplied path segments: printed as the clash lines are.
      renderReasons(ctx, leftBehind.map(withoutControlCharacters), "left behind by this version");
      parts.push(leftBehindPart(plan.manifest.name, spec, leftBehind));
    }
    if (parts.length > 0) return refuse(ctx, payload, planRefusal(plan.manifest.name, parts));

    if (ctx.dryRun) {
      ctx.io.out(`\n  ${ctx.palette.dim("nothing written (--dry-run)")}\n`);
      ctx.io.out(`\n  next: re-run without --dry-run to install, then stamity sync to project it\n`);
      return { exitCode: 0, json: { ...payload, dryRun: true } };
    }

    ctx.io.out("\n");
    ctx.spinner.start(`installing ${plan.writeSet.length} file(s)`);
    let applied: Awaited<ReturnType<typeof packEngine.install.applyPackInstall>>;
    try {
      applied = await packEngine.install.applyPackInstall(rootDir, plan, projectManifest, {
        now: ctx.app.runtime.clock.now(),
      });
    } finally {
      ctx.spinner.stop();
    }

    // The apply re-checks ownership against the manifest object it was handed,
    // which can name a claim the on-disk plan did not see.
    if (!applied.result.installed) {
      renderReasons(ctx, applied.result.errors);
      return refuse(
        ctx,
        { ...payload, planned: { ...payload.planned, collisions: applied.result.errors } },
        collisionRefusal(plan.manifest.name, spec, installed, applied.result.errors),
      );
    }

    // Rows and files land together: the engine folded this pack's ownership
    // rows into the returned manifest (replacing any previous install's), and
    // persisting it is what makes the written files reclaimable later.
    await manifestStore.writeManifest(rootDir, applied.manifest, {
      now: ctx.app.runtime.clock.now(),
    });

    const written = applied.result.written;
    const receiptPath = applied.result.receiptPath;
    ctx.io.out(
      `\n${ctx.palette.green(`installed ${written.length} file(s)`)} into ${facts.targetDir}\n`,
    );
    for (const path of written.slice(0, MAX_LISTED_FILES)) {
      ctx.io.out(`  ${ctx.palette.green("+")} ${path}\n`);
    }
    if (written.length > MAX_LISTED_FILES) {
      ctx.io.out(`  ${ctx.palette.dim(`... and ${written.length - MAX_LISTED_FILES} more`)}\n`);
    }
    if (receiptPath !== null) {
      ctx.io.out(
        `\n  receipt: ${receiptPath} ` +
          `(${plan.trustTier}, ${plan.writeSet.length} content file(s))\n`,
      );
    }
    // `sync` is step ONE, and this is the fix rather than a re-ordering. The
    // installed bytes under `.stamity/packs/` are not what any client reads: the
    // pack's commands, agents and rules reach a tool only when sync projects
    // them into that tool's own directories. Without it the pack is installed
    // and inert. The dim line below said "sync never rewrites it", which is true
    // of the installed copy and read by every operator as "sync has nothing to
    // do here".
    //
    // Step TWO names `check`, not `validate`. `validate` never opens an
    // installed pack body — its scanned set is fixed at the overrides, user
    // hooks, learnings, `.env.mcp` and the workspace file — so it reported
    // all-clear on a pack whose files had been rewritten since install, which is
    // the one thing an operator reviewing that directory wants told. `check`'s
    // `pack-integrity` row re-hashes every installed byte against the hashes the
    // receipt recorded, so an edit or a deletion is a finding with a remedy.
    const nextSteps = [
      "stamity sync — projects this pack into your tool directories; until it runs, nothing in the pack is reachable from a client",
      `review ${facts.targetDir}, then run stamity check — its pack-integrity row re-hashes every installed byte and reports any edit or deletion`,
    ];
    ctx.io.out("\n  next:\n");
    for (const [index, step] of nextSteps.entries()) {
      ctx.io.out(`    ${index + 1}. ${step}\n`);
    }
    ctx.io.out(
      `  ${ctx.palette.dim(
        "pack content is installed, not generated — sync projects it into your tool " +
          "directories and never rewrites the installed copy",
      )}\n`,
    );

    return {
      exitCode: 0,
      json: { ...payload, installed: true, written, receiptPath, next: nextSteps },
    };
  },
};
