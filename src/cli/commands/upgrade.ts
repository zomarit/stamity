import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import semver from "semver";
import { readManifest } from "../../manifest/manifest.ts";
import { isSemverShaped, pinnedCliCall } from "../../shared/cliCall.ts";
import { EngineError } from "../../types/errors.ts";
import { assertNotLoosened } from "../engine/autonomyGate.ts";
import { hasNpmChannel, npmRegistry, packageName } from "../kit/packageName.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { moveVerb, pinSpecOf } from "../notice/updateNotice.ts";
import { checkPackCatalog } from "./check.ts";
import { dirtyTreeWarning, freshModelLists, syncClosingLines } from "./sync.ts";
import { applySync, planSync, type SyncApplyReport, type SyncPlan } from "./sync/engine.ts";
import { renderSyncReport, syncJsonPayload } from "./sync/report.ts";

/**
 * `stamity upgrade --to <version>` — move a setup to the running release in
 * one step (REQ-FLOW-034): this release's own sync, in-process, then the root
 * `package.json` pin moved to this release.
 *
 * `--to` must name the release running the command. A different target is
 * never run from here — no spawn, no npx, no PATH walk: the refusal prints the
 * pinned call that runs that release's own `upgrade` (decision E3), or its
 * `sync` when it predates the verb (`FIRST_UPGRADE_RELEASE`,
 * `../notice/updateNotice.ts`).
 *
 * Every refusal is an `EngineError` (`VALIDATION_ERROR` unless named), exit 1,
 * with nothing written, and runs in this order: the target's shape; the target
 * against the running release; a setup to move; a downgrade or a major move
 * without its flag; a pin that cannot be edited in place; a planned client set
 * that differs from the manifest's without `--allow-client-change`. The loosen
 * gate (REQ-FLOW-138) runs inside `applySync`, before any write and on a dry
 * run too, as it does for `sync`. A sync that refused a path exits 1 with the
 * pin unmoved.
 *
 * Learnings, handoffs, overrides and run records are never touched: the sync
 * engine does not write them and this module writes only `package.json`.
 *
 * Erasable TypeScript only: `scripts/generate-docs.mjs` loads `src/cli` under
 * Node's type stripping.
 */

/** What {@link runUpgrade} is asked to do. */
export interface UpgradeInput {
  rootDir: string;
  /** `--to`: the release to move to. */
  to: string;
  /** The release running this command. */
  runningVersion: string;
  /** This installation's package name, the one the printed calls name. */
  packageName: string;
  /** The registry a fork's scope names (`npmRegistry()`), else `null`. */
  registry: string | null;
  /** `hasNpmChannel()`: whether a registry serves the package. */
  npmChannel: boolean;
  allowDowngrade: boolean;
  allowMajor: boolean;
  allowClientChange: boolean;
  /** `--loosen`: the person's word for a looser autonomy setting (REQ-FLOW-138). */
  loosen: boolean;
  dryRun: boolean;
  now: Date;
}

/** The seams {@link runUpgrade} runs through; the real ones are named beside each. */
export interface UpgradeDeps {
  /** `./sync/engine.ts::planSync`. */
  planSync: typeof planSync;
  /** `./sync/engine.ts::applySync`. */
  applySync: typeof applySync;
  /** `./check.ts::checkPackCatalog`. */
  packCatalog: typeof checkPackCatalog;
  /** The file's text, or `null` when it does not exist. */
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, text: string): Promise<void>;
  /**
   * Handed the plan and the sync report once the sync ran, so the command
   * prints the sync's own report as `sync` does. The one call of `applySync`
   * stays in {@link runUpgrade}, with its gate beside it (the write-loop
   * census, `test/cli/engine/autonomyGate.test.ts`).
   */
  onSync?(plan: SyncPlan, report: SyncApplyReport): void;
}

/** The `package.json` dependency section a pin moves in. */
type PinField = "devDependencies" | "dependencies";

/** What an upgrade did, or would do on a dry run. */
export interface UpgradeReport {
  /** The release the manifest records as its writer (`generatedBy`). */
  from: string;
  to: string;
  /** Nothing changed and the pin already reads `to`. */
  noop: boolean;
  dryRun: boolean;
  /** Paths the sync created or updated (would, on a dry run). */
  changed: string[];
  /** Paths the reclaim sweep deleted or rewrote (would, on a dry run). */
  reclaimed: string[];
  /** Paths the sync's collision gate refused. */
  refused: string[];
  /** The pin as it stands after the run (as it would, on a dry run); `null` when no section pins the package. */
  pin: { field: PinField; from: string; to: string } | null;
  /** Why a pin was left as it is, when one was. */
  pinNote: string | null;
  notices: string[];
}

const PACKAGE_JSON = "package.json";

/** The pin edit step (5) prepares: the report row and the text to write, `null` when nothing is written. */
interface PreparedPin {
  pin: UpgradeReport["pin"];
  pinNote: string | null;
  text: string | null;
  notices: string[];
}

function refusal(message: string, next: string): EngineError {
  return new EngineError(`${message} Nothing was written.`, { code: "VALIDATION_ERROR", next });
}

/** The pinned call of this installation at `version`, as every printed call spells it. */
function callFor(input: UpgradeInput, version: string, verb: string): string {
  return pinnedCliCall(input.packageName, version, verb, {
    npmChannel: input.npmChannel,
    ...(input.registry === null ? {} : { registry: input.registry }),
  });
}

/** Step 2: the call that runs `to`'s own move, for a target that is not the running release. */
function otherReleaseCall(input: UpgradeInput): string {
  const verb = moveVerb(input.to);
  if (!input.npmChannel) {
    return `install ${input.to} into this project, then \`npx --no ${input.packageName} ${verb}\``;
  }
  return `\`${callFor(input, input.to, verb)}\``;
}

/**
 * Step 5: the pin move, prepared in memory. An exact, `^` or `~` spec moves to
 * `to` with its operator kept; any other spec stays, with a `pinNote`. The text
 * edit replaces the one quoted value after the section's key and the package's
 * key, then re-parses the result, which must equal the original but for that
 * value (the in-place technique of `scripts/fork-identity.mjs::retargetPreset`),
 * so the file's own formatting survives and a key spelled any other way (a JSON
 * escape, say) is refused rather than guessed at.
 */
function preparePin(input: UpgradeInput, text: string | null): PreparedPin {
  if (text === null) return { pin: null, pinNote: null, text: null, notices: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw refusal(`${PACKAGE_JSON} is not valid JSON, so upgrade cannot move its pin.`, `fix ${PACKAGE_JSON}, then re-run`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw refusal(`${PACKAGE_JSON} is not a JSON object, so upgrade cannot move its pin.`, `fix ${PACKAGE_JSON}, then re-run`);
  }
  const manifest = parsed as Record<string, unknown>;
  const notices =
    manifest["workspaces"] === undefined
      ? []
      : [`this repository declares workspaces: upgrade moves the root ${PACKAGE_JSON} pin only, and each workspace's own ${PACKAGE_JSON} keeps its pin.`];
  const field = (["devDependencies", "dependencies"] as const).find((name) => {
    const section = manifest[name];
    return typeof section === "object" && section !== null && Object.hasOwn(section, input.packageName);
  });
  if (field === undefined) return { pin: null, pinNote: null, text: null, notices };
  const section = manifest[field] as Record<string, unknown>;
  const spec = section[input.packageName];
  const pin = pinSpecOf(spec);
  if (pin === null || typeof spec !== "string") {
    return {
      pin: null,
      pinNote:
        `${PACKAGE_JSON} pins ${input.packageName} as ${JSON.stringify(spec)} under ${field}, which names no one ` +
        `version, so upgrade leaves it as it is; the setup now runs ${input.to}.`,
      text: null,
      notices,
    };
  }
  const next = `${pin.operator}${input.to}`;
  const row = { field, from: spec, to: next };
  if (next === spec) return { pin: row, pinNote: null, text: null, notices };
  const edited = replaceInPlace(text, field, input.packageName, spec, next);
  const expected = structuredClone(manifest);
  (expected[field] as Record<string, unknown>)[input.packageName] = next;
  if (edited === null || !sameJson(edited, expected)) {
    throw refusal(
      `upgrade could not move the ${input.packageName} pin under ${field} in ${PACKAGE_JSON} in place.`,
      `set it to ${JSON.stringify(next)} by hand, or write the key without escapes, then re-run`,
    );
  }
  return { pin: row, pinNote: null, text: edited, notices };
}

/** `text` with the quoted `spec` after `"<field>"` and `"<name>":` replaced by `next`, or `null` when it is not there. */
function replaceInPlace(text: string, field: string, name: string, spec: string, next: string): string | null {
  const sectionAt = text.indexOf(JSON.stringify(field));
  if (sectionAt === -1) return null;
  const key = JSON.stringify(name);
  const keyAt = text.indexOf(key, sectionAt);
  if (keyAt === -1) return null;
  const afterKey = keyAt + key.length;
  const colon = /^\s*:\s*/.exec(text.slice(afterKey));
  if (colon === null) return null;
  const valueAt = afterKey + colon[0].length;
  const quoted = JSON.stringify(spec);
  if (!text.startsWith(quoted, valueAt)) return null;
  return `${text.slice(0, valueAt)}${JSON.stringify(next)}${text.slice(valueAt + quoted.length)}`;
}

function sameJson(text: string, expected: unknown): boolean {
  try {
    return JSON.stringify(JSON.parse(text)) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

/** The paths a sync created or updated, or would on a dry run. */
function changedPaths(plan: SyncPlan, report: SyncApplyReport): string[] {
  if (report.dryRun) {
    return plan.entries.filter((entry) => entry.action === "create" || entry.action === "update").map((entry) => entry.path);
  }
  return report.wrote.filter((row) => row.action === "created" || row.action === "updated").map((row) => row.path);
}

/** The paths the reclaim sweep deleted or rewrote, or would on a dry run. */
function reclaimedPaths(report: SyncApplyReport): string[] {
  const acted = new Set(["deleted", "managed-block-stripped", "co-owned-reduced"]);
  return (report.reclaimed?.entries ?? [])
    .filter((entry) => acted.has(entry.action) || (entry.action === "dry-run" && entry.wouldBe !== undefined))
    .map((entry) => entry.path);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((item) => right.has(item));
}

/** The notice for a setup with Codex, whose hooks embed the pinned version (decision E5, `cut/13`). */
const CODEX_HOOKS_NOTICE =
  "Codex records trust against `.codex/hooks.json`'s hash; review each stamity hook in `/hooks`.";

/** Move the setup at `input.rootDir` to the running release. See the module header for the order. */
export async function runUpgrade(input: UpgradeInput, deps: UpgradeDeps): Promise<UpgradeReport> {
  const { rootDir, to, runningVersion } = input;
  // (1) The target's shape.
  if (!isSemverShaped(to)) {
    throw refusal(`--to ${JSON.stringify(to)} is not a version.`, `pass the release to move to, such as --to ${runningVersion}`);
  }
  // (2) Only the running release moves a setup in-process.
  if (to !== runningVersion) {
    const call = otherReleaseCall(input);
    throw refusal(`This CLI is ${runningVersion}, and only release ${to} moves a setup to ${to}: run ${call}.`, `run ${call}`);
  }
  // (3) A setup to move.
  const manifest = await readManifest(rootDir);
  if (manifest === null) {
    throw refusal("This repository has no setup to upgrade.", `run \`${callFor(input, runningVersion, "init")}\``);
  }
  const from = manifest.generatedBy;
  // (4) A downgrade or a major move needs its flag.
  if (!input.allowDowngrade && semver.lt(to, from)) {
    throw refusal(
      `This setup was written by ${from}, newer than ${to}.`,
      `pass --allow-downgrade to move it back to ${to}, or run \`${callFor(input, from, moveVerb(from))}\` to stay on ${from}`,
    );
  }
  if (!input.allowMajor && semver.major(to) !== semver.major(from)) {
    throw refusal(`This setup was written by ${from}, and ${to} is another major release.`, `read the release notes, then pass --allow-major`);
  }
  // (5) The pin, prepared in memory.
  const pkgPath = join(rootDir, PACKAGE_JSON);
  const prepared = preparePin(input, await deps.readFile(pkgPath));
  // (6) The plan, whose client set must be the manifest's.
  const plan = await deps.planSync(rootDir, runningVersion, {});
  if (!input.allowClientChange && !sameSet(plan.manifest.tools, manifest.tools)) {
    throw refusal(
      `This release would set up the clients ${plan.manifest.tools.join(", ")} where the manifest lists ${manifest.tools.join(", ")}.`,
      "pass --allow-client-change to move with that client set",
    );
  }
  // (7) This release's sync, with the loosen gate `sync` runs: `loosen` is the
  // command's own `--loosen` flag, read in `upgradeCommand.run` below.
  const notices: string[] = [...prepared.notices];
  const { loosen } = input;
  const report = await deps.applySync(rootDir, plan, {
    engineVersion: runningVersion,
    force: false,
    dryRun: input.dryRun,
    now: input.now,
    guardGate: (next, copies) =>
      assertNotLoosened(rootDir, next, {
        loosen,
        copies,
        remedy: callFor(input, runningVersion, `upgrade --to ${to} --loosen`),
        notice: (line) => notices.push(line),
      }),
  });
  deps.onSync?.(plan, report);
  const changed = changedPaths(plan, report);
  const reclaimed = reclaimedPaths(report);
  const base = { from, to, dryRun: input.dryRun, changed, reclaimed, refused: report.refused };
  if (report.refused.length > 0) {
    const unmoved = prepared.pin === null ? null : { ...prepared.pin, to: prepared.pin.from };
    const held = prepared.pin !== null && prepared.pin.from !== prepared.pin.to;
    const note = held ? `the pin was not moved: sync refused ${report.refused.length} path(s).` : null;
    return { ...base, noop: false, pin: unmoved, pinNote: prepared.pinNote ?? note, notices };
  }
  // (8) The pin.
  if (!input.dryRun && prepared.text !== null) await deps.writeFile(pkgPath, prepared.text);
  // (9) What the operator still has to do.
  const catalog = await deps.packCatalog(rootDir, report.manifest ?? plan.manifest);
  if (catalog.status === "warn") notices.push(catalog.detail);
  if (plan.manifest.tools.includes("codex") && changed.length > 0) notices.push(CODEX_HOOKS_NOTICE);
  const pinMoves = prepared.pin !== null && prepared.pin.from !== prepared.pin.to;
  const noop = changed.length === 0 && reclaimed.length === 0 && !pinMoves;
  return { ...base, noop, pin: prepared.pin, pinNote: prepared.pinNote, notices };
}

/** The file's text, or `null` when it does not exist. */
async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** The human lines after the sync report: the pin, its note, the notices. */
function upgradeLines(report: UpgradeReport): string[] {
  const lines: string[] = [];
  if (report.pin !== null) {
    const verb = report.pin.from === report.pin.to ? "reads" : report.dryRun ? "would move" : "moved";
    const value = report.pin.from === report.pin.to ? report.pin.to : `${report.pin.from} -> ${report.pin.to}`;
    lines.push(`pin: ${PACKAGE_JSON} ${report.pin.field} ${verb} ${value}`);
  }
  if (report.pinNote !== null) lines.push(`note: ${report.pinNote}`);
  for (const notice of report.notices) lines.push(`note: ${notice}`);
  if (report.noop) lines.push(`already on ${report.to}: nothing to change`);
  return lines;
}

export const upgradeCommand: CommandModule = {
  name: "upgrade",
  summary: "move this setup to the running release: run its sync and move the package.json pin",
  mutating: true,

  configure(cmd: Command): void {
    cmd.requiredOption("--to <version>", "the release to move to, which must be the release running this command");
    cmd.option("--allow-downgrade", "move to a release older than the one that wrote the setup");
    cmd.option("--allow-major", "move to another major release");
    cmd.option("--allow-client-change", "move even when this release would set up another client set");
    cmd.option("--loosen", "write a guard copy looser than the autonomy setting on disk, at HEAD or in the manifest it replaces (the person's act)");
  },

  async run(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
    const rootDir = ctx.app.runtime.cwd;
    // The loosen gate (REQ-FLOW-138): `--loosen` is the person's word, which the guard asks for.
    const loosen = opts["loosen"] === true;
    // The command keeps the plan and the sync report the engine ran, so the
    // sync's own report and closing lines print as `sync` prints them.
    let ran: { plan: SyncPlan; report: SyncApplyReport } | null = null;
    ctx.spinner.start(ctx.dryRun ? "previewing upgrade…" : "upgrading…");
    const listedOverlay = await freshModelLists(ctx, rootDir);
    const report = await runUpgrade(
      {
        rootDir,
        to: String(opts["to"]),
        runningVersion: ctx.app.version,
        packageName: packageName(),
        registry: npmRegistry(),
        npmChannel: hasNpmChannel(),
        allowDowngrade: opts["allowDowngrade"] === true,
        allowMajor: opts["allowMajor"] === true,
        allowClientChange: opts["allowClientChange"] === true,
        loosen,
        dryRun: ctx.dryRun,
        now: ctx.app.runtime.clock.now(),
      },
      {
        planSync: async (root, version, planOpts) => {
          const plan = await planSync(root, version, { ...planOpts, listedOverlay });
          const warning = dirtyTreeWarning(plan.dirty);
          if (warning !== null) ctx.io.err(`${warning}\n`);
          return plan;
        },
        applySync,
        packCatalog: checkPackCatalog,
        readFile: readIfPresent,
        writeFile: (path, text) => ctx.engine.merge.atomicWrite.atomicWriteFile(path, text, { boundaryDir: rootDir }),
        onSync: (plan, applied) => {
          ran = { plan, report: applied };
        },
      },
    );
    ctx.spinner.stop();
    // Set inside the callback above, which TypeScript's narrowing does not follow.
    const sync = ran as { plan: SyncPlan; report: SyncApplyReport } | null;
    if (sync === null) throw new Error("upgrade returned without running its sync");
    if (sync.report.modelListCacheWarning !== undefined) ctx.io.err(`warning: ${sync.report.modelListCacheWarning}\n`);
    ctx.io.out(`${renderSyncReport(sync.plan, sync.report, ctx.palette)}\n`);
    for (const line of syncClosingLines(sync.plan, sync.report)) ctx.io.out(`${line}\n`);
    for (const line of upgradeLines(report)) ctx.io.out(`${line}\n`);
    return {
      exitCode: report.refused.length > 0 ? 1 : 0,
      json: { ...report, sync: syncJsonPayload(sync.plan, sync.report) },
    };
  },
};
