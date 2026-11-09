import type { Stats } from "node:fs";
import { lstat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import { NOBODY_WATCHING_VARIABLE } from "../../hooks/scripts.ts";
import { AWAY_HELD_FILE, AWAY_MARKER_FILE } from "../../mcp/env.ts";
import { parseHeldList, type HeldLine } from "../../runs/overview.ts";
import { STATE_DIR } from "../../types/markers.ts";
import { readCapped } from "../engine/landSetting.ts";
import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";

/**
 * `stamity away` — the "nobody watching" switch's marker (REQ-FLOW-166).
 *
 *   away on       write `.stamity/away.json`: every ask the person-only guard would put to you is refused and held
 *   away off      remove it; asks come back, and each still waits for a person
 *   away status   whether the switch is on, from the variable, the marker or both, and the acts held while it was on
 *
 * The guard reads the switch from `STAMITY_NOBODY_WATCHING` (set at launch, so this verb cannot unset it) or from the
 * marker at its own project root; this verb writes the marker under the folder it runs in, as `run overview` and
 * `skill add` read it, and `on` refuses where that folder holds no `.stamity/`, since a marker there turns nothing on.
 * The marker counts as present by `lstat`, a link among it, as the guard reads it: a link only tightens. `off` removes
 * a file or a link, never a link's target, and refuses anything else at that name, which the guard still reads as on.
 *
 * Both directions are safe by design: `on` only turns asks into refusals, and `off` only turns them back into asks.
 * The held list is the guard's to write; this verb reads it, counted and printed, each line cleaned for the terminal.
 */

const SUBCOMMANDS = ["on", "off", "status"] as const;

/** The most of the held list read: past it, the lines read are shown and a cut last line is skipped as no entry. */
const HELD_READ_MAX_BYTES = 1_048_576;

/** The most of the marker read for its `since`: it is one short line. */
const MARKER_READ_MAX_BYTES = 4096;

/** Where the switch is on from: the launch variable, the marker, both, or neither. */
type Source = "env" | "marker" | "both" | "none";

/** The held list under `root`; a missing, unreadable or damaged list holds no entry it cannot read, and never fails. */
export function readHeldList(root: string): HeldLine[] {
  const read = readCapped(join(root, ...AWAY_HELD_FILE.split("/")), HELD_READ_MAX_BYTES);
  return read === null ? [] : parseHeldList(read.text);
}

/** The marker's own entry, without following a link; `null` when nothing is at its name. */
async function markerStats(root: string): Promise<Stats | null> {
  try {
    return await lstat(join(root, ...AWAY_MARKER_FILE.split("/")));
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw new CliFailure({
      code: "FS_ERROR",
      message: `away could not look for ${AWAY_MARKER_FILE}`,
      why: cause instanceof Error ? sanitizeLabel(cause.message) : String(cause),
      next: "the guard refuses every ask while it cannot look either; fix what the reason names, then re-run",
    });
  }
}

/** The marker's `since`, where it is a regular file holding one; a link is not followed and gives none. */
function markerSince(root: string): string | null {
  const read = readCapped(join(root, ...AWAY_MARKER_FILE.split("/")), MARKER_READ_MAX_BYTES);
  if (read === null) return null;
  try {
    const value: unknown = JSON.parse(read.text);
    const since = value !== null && typeof value === "object" ? (value as Record<string, unknown>)["since"] : undefined;
    return typeof since === "string" ? sanitizeLabel(since) : null;
  } catch {
    return null;
  }
}

function sourceOf(env: boolean, marker: boolean): Source {
  if (env && marker) return "both";
  if (env) return "env";
  return marker ? "marker" : "none";
}

/** The launch variable, read as the guard reads it: on unless unset, empty, `0` or `false`. */
function envOn(ctx: CliContext): boolean {
  return ctx.engine.runs.resumeCard.readsUnattended(null, ctx.app.runtime.env[NOBODY_WATCHING_VARIABLE]);
}

const ENV_HOLDS = `${NOBODY_WATCHING_VARIABLE} is set, so the switch stays on until it is unset where the session was launched.`;

async function runOn(ctx: CliContext, root: string): Promise<CommandResult> {
  const state = await lstat(join(root, STATE_DIR)).catch(() => null);
  if (state === null || !state.isDirectory()) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `away on found no ${STATE_DIR}/ folder in ${sanitizeLabel(root)}`,
      why: `the guard reads the marker at the project root's ${AWAY_MARKER_FILE}, so a marker anywhere else turns nothing on`,
      next: "run it from the project root, the folder where stamity init ran",
    });
  }
  const env = envOn(ctx);
  if ((await markerStats(root)) !== null) {
    const since = markerSince(root);
    ctx.io.out(`away: on (already on${since === null ? "" : ` since ${since}`}; the marker is kept as it is)\n`);
    return { exitCode: 0, json: { subcommand: "on", written: false, away: true, source: sourceOf(env, true), since } };
  }
  if (ctx.dryRun) {
    ctx.io.out(`Would write ${AWAY_MARKER_FILE}: every ask the guard would put to you would be refused and held.\n`);
    return { exitCode: 0, json: { subcommand: "on", dryRun: true, written: false, away: env, source: sourceOf(env, false), since: null } };
  }
  const since = ctx.app.runtime.clock.now().toISOString();
  try {
    // `wx`: created only where nothing is at the name, so a link placed meanwhile is never written through.
    await writeFile(join(root, ...AWAY_MARKER_FILE.split("/")), `${JSON.stringify({ since, by: "stamity away" })}\n`, { flag: "wx" });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "EEXIST") return runOn(ctx, root);
    throw new CliFailure({
      code: "FS_ERROR",
      message: `away on could not write ${AWAY_MARKER_FILE}`,
      why: cause instanceof Error ? sanitizeLabel(cause.message) : String(cause),
      next: `fix what the reason names, or launch the session with ${NOBODY_WATCHING_VARIABLE}=1`,
    });
  }
  ctx.io.out(
    `away: on (since ${since})\nEvery ask the guard would put to you is now refused and held; \`stamity away status\` lists them, and \`stamity away off\` turns asks back on.\n`,
  );
  return { exitCode: 0, json: { subcommand: "on", written: true, away: true, source: sourceOf(env, true), since } };
}

async function runOff(ctx: CliContext, root: string): Promise<CommandResult> {
  const env = envOn(ctx);
  const stats = await markerStats(root);
  if (stats !== null && !stats.isFile() && !stats.isSymbolicLink()) {
    throw new CliFailure({
      code: "FS_ERROR",
      message: `away off left ${AWAY_MARKER_FILE}: it is not a file or a link`,
      why: "the guard reads anything at that name as on, and this verb removes only a file or a link",
      next: `remove ${AWAY_MARKER_FILE} by hand, then run stamity away status`,
    });
  }
  let removed = false;
  if (stats === null) {
    ctx.io.out(`${AWAY_MARKER_FILE} was not there.\n`);
  } else if (ctx.dryRun) {
    ctx.io.out(`Would remove ${AWAY_MARKER_FILE}.\n`);
  } else {
    try {
      // A link is removed itself, never followed.
      await unlink(join(root, ...AWAY_MARKER_FILE.split("/")));
      removed = true;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new CliFailure({
          code: "FS_ERROR",
          message: `away off could not remove ${AWAY_MARKER_FILE}`,
          why: cause instanceof Error ? sanitizeLabel(cause.message) : String(cause),
          next: `remove ${AWAY_MARKER_FILE} by hand, then run stamity away status`,
        });
      }
    }
  }
  const markerLeft = stats !== null && !removed;
  const on = env || markerLeft;
  ctx.io.out(`away: ${on ? "on" : "off"}\n${env ? `${ENV_HOLDS}\n` : ""}`);
  return {
    exitCode: 0,
    json: { subcommand: "off", ...(ctx.dryRun ? { dryRun: true } : {}), removed, away: on, source: sourceOf(env, markerLeft) },
  };
}

async function runStatus(ctx: CliContext, root: string): Promise<CommandResult> {
  const env = envOn(ctx);
  const marker = (await markerStats(root)) !== null;
  const since = marker ? markerSince(root) : null;
  const held = readHeldList(root);
  const source = sourceOf(env, marker);
  const lines = [
    `away: ${source === "none" ? "off" : "on"}`,
    `source: ${source}`,
    ...(since === null ? [] : [`since: ${since}`]),
    `held: ${String(held.length)}`,
    ...held.map(({ act, rule, at }) => sanitizeLabel(`- ${act} (${rule}, ${at})`)),
  ];
  ctx.io.out(`${lines.join("\n")}\n`);
  return {
    exitCode: 0,
    json: { subcommand: "status", away: source !== "none", source, since, held: held.length, heldList: held },
  };
}

export const awayCommand: CommandModule = {
  name: "away",
  summary: "turn the nobody-watching switch on or off, or show it and the asks it held for you",
  // `on` writes the marker and `off` removes it, so the shared --dry-run flag registers; `status` is a read.
  mutating: true,
  args: [
    // Copied verbatim into the generated `docs/cli-reference.md`: editing this string is a docs change.
    { name: "subcommand", description: "on | off | status", required: true },
  ],

  configure(cmd: Command): void {
    // A usage error, so exit 2 with stdout empty, before the action runs (as `skill` refuses its own).
    cmd.hook("preAction", (command) => {
      const [subcommand] = command.processedArgs as unknown[];
      if (!(SUBCOMMANDS as readonly unknown[]).includes(subcommand)) {
        command.error(`error: unknown away subcommand ${JSON.stringify(subcommand)}; use one of ${SUBCOMMANDS.join(", ")}`, { exitCode: 2 });
      }
    });
  },

  async run(ctx, _opts, args): Promise<CommandResult> {
    const root = ctx.app.runtime.cwd;
    const [subcommand] = args;
    if (subcommand === "on") return runOn(ctx, root);
    if (subcommand === "off") return runOff(ctx, root);
    return runStatus(ctx, root);
  },
};
