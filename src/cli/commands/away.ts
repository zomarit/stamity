import { closeSync, fstatSync, lstatSync, openSync, readSync, type Stats } from "node:fs";
import { lstat, realpath, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Command } from "commander";
import { NOBODY_WATCHING_VARIABLE } from "../../hooks/scripts.ts";
import { AWAY_HELD_FILE, AWAY_MARKER_FILE } from "../../mcp/env.ts";
import { heldUnreadLine, parseHeldList, type HeldLine } from "../../runs/overview.ts";
import { MANIFEST_FILE } from "../../types/manifest.ts";
import { STATE_DIR } from "../../types/markers.ts";
import { readCapped } from "../engine/landSetting.ts";
import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";
import { runGit } from "../../worktree/git.ts";

/**
 * `stamity away` — the "nobody watching" switch's marker (REQ-FLOW-166).
 *
 *   away on       write `.stamity/away.json`: every ask the person-only guard would put to you is refused and held
 *   away off      remove it; asks come back, and each still waits for a person
 *   away status   whether the switch is on, from the variable, the marker or both, and the acts held while it was on
 *
 * The guard reads the switch from `STAMITY_NOBODY_WATCHING` (set at launch, so this verb cannot unset it) or from the
 * marker at its own project root: the folder above the hooks folder it was emitted into (`derivedRoot` in the emitted
 * guard), which is the folder `stamity init` set up, the one holding `.stamity/manifest.json`. That folder can sit below
 * git's top. So all three subcommands act on the nearest setup at or above the folder the verb runs in, walking up no
 * further than git's top (build/53, review/105). `on` and `off` refuse where the walk finds none, since no guard reads a
 * marker there; `status` reads the switch off the variable alone and says no setup was found. A `.stamity` that is a
 * link to a folder counts: the guard reads `<root>/.stamity/away.json` through it, so the marker written through it is
 * the one the guard reads (M-2).
 * The marker counts as present by `lstat`, a link among it, as the guard reads it: a link only tightens. `off` removes
 * a file or a link, never a link's target, and refuses anything else at that name, which the guard still reads as on.
 *
 * Both directions are safe by design: `on` only turns asks into refusals, and `off` only turns them back into asks.
 * The held list is the guard's to write; this verb reads it, counted and printed, each field cleaned for the terminal.
 */

const SUBCOMMANDS = ["on", "off", "status"] as const;

/**
 * The most of the held list read, from its end: the guard only appends, so past it the newest entries are kept and the
 * count of older lines left unread is said (review/91). A cut last line is skipped as no entry.
 */
const HELD_READ_MAX_BYTES = 1_048_576;

/** The chunk the older lines are counted in, so a list of any size is counted in bounded memory. */
const COUNT_CHUNK_BYTES = 65_536;

/** The most of the marker read for its `since`: it is one short line. */
const MARKER_READ_MAX_BYTES = 4096;

/** Where the switch is on from: the launch variable, the marker, both, or neither. */
type Source = "env" | "marker" | "both" | "none";

/** The held list as read: its entries, each field cleaned, and how many older lines past the read cap were not read. */
export interface HeldRead {
  readonly entries: HeldLine[];
  readonly olderUnread: number;
}

/** The count of newline bytes in `[0, end)` of `fd`, read in bounded chunks. */
function newlinesBefore(fd: number, end: number): number {
  const chunk = Buffer.alloc(Math.min(COUNT_CHUNK_BYTES, Math.max(end, 1)));
  let count = 0;
  for (let at = 0; at < end; ) {
    const read = readSync(fd, chunk, 0, Math.min(chunk.length, end - at), at);
    if (read === 0) break;
    for (let index = 0; index < read; index++) if (chunk[index] === 0x0a) count++;
    at += read;
  }
  return count;
}

/**
 * The last `maxBytes` of the regular file at `path`, from the first whole line in them, and how many lines before that
 * were left out; `null` where nothing readable is there or the name is a link, as `readCapped` reads.
 */
function readTail(path: string, maxBytes: number): { text: string; olderLines: number } | null {
  try {
    if (!lstatSync(path).isFile()) return null;
    const fd = openSync(path, "r");
    try {
      const stats = fstatSync(fd);
      if (!stats.isFile()) return null;
      // One byte before the window too, to tell whether the window starts on a line's first byte.
      const from = stats.size > maxBytes ? stats.size - maxBytes - 1 : 0;
      const buffer = Buffer.alloc(stats.size - from);
      let filled = 0;
      while (filled < buffer.length) {
        const read = readSync(fd, buffer, filled, buffer.length - filled, from + filled);
        if (read === 0) break;
        filled += read;
      }
      if (from === 0) return { text: buffer.toString("utf8", 0, filled), olderLines: 0 };
      // Everything up to the first line end in the read bytes is the cut line (or the end of the line before the window).
      const newline = buffer.subarray(0, filled).indexOf(0x0a);
      const skip = newline === -1 ? filled : newline + 1;
      const cutLast = newline === -1 && filled > 0 ? 1 : 0;
      return { text: buffer.toString("utf8", skip, filled), olderLines: newlinesBefore(fd, from + skip) + cutLast };
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

/** One held entry, each field cleaned, so an escaped newline or a terminal sequence in it cannot forge a line (review/90). */
const cleaned = ({ rule, act, at }: HeldLine): HeldLine => ({ rule: sanitizeLabel(rule), act: sanitizeLabel(act), at: sanitizeLabel(at) });

/**
 * The held list under `root`, the newest kept past the read cap; a missing, unreadable or damaged list holds no entry
 * it cannot read, and never fails. Every sink prints these fields, so they are cleaned here, before a line is built.
 */
export function readHeldList(root: string): HeldRead {
  const read = readTail(join(root, ...AWAY_HELD_FILE.split("/")), HELD_READ_MAX_BYTES);
  return read === null ? { entries: [], olderUnread: 0 } : { entries: parseHeldList(read.text).map(cleaned), olderUnread: read.olderLines };
}

/** Where the verb looked for a setup: the nearest folder holding one, or `null`, and the first and last folders read. */
interface SetupPlace {
  readonly root: string | null;
  readonly from: string;
  readonly last: string;
}

/** Git's top level for `cwd` as a real path (a linked worktree's own top inside one), or `null` where git names none. */
async function gitTop(cwd: string): Promise<string | null> {
  const outcome = await runGit({ args: ["rev-parse", "--show-toplevel"], cwd });
  const top = outcome.stdout.replace(/\r?\n$/, "");
  if (outcome.status !== 0 || outcome.keptFromGit === true || top === "") return null;
  return realpath(top).catch(() => resolve(top));
}

/** Whether `dir` holds a setup's manifest; `stat` follows a `.stamity` that is a link to a folder, as the guard does (M-2). */
async function holdsSetup(dir: string): Promise<boolean> {
  return stat(join(dir, STATE_DIR, MANIFEST_FILE)).then(
    (entry) => entry.isFile(),
    () => false,
  );
}

/**
 * The setup the guard reads the marker under (build/53, review/105): the nearest folder, from the one the verb runs in
 * up, that holds `.stamity/manifest.json`, the folder `stamity init` set up and emitted the guard into. The walk stops
 * at git's top, so a lane inside another checkout never reaches that checkout's setup; where git names no top, it
 * stops at the filesystem root. Real paths are walked, as git names its top and as Node resolves the guard's own path.
 */
async function findSetup(cwd: string): Promise<SetupPlace> {
  const from = await realpath(cwd).catch(() => resolve(cwd));
  const top = await gitTop(from);
  let dir = from;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- nearest first: the first folder holding a setup wins, and the walk stops there
    if (await holdsSetup(dir)) return { root: dir, from, last: dir };
    const up = dirname(dir);
    if (dir === top || up === dir) return { root: null, from, last: dir };
    dir = up;
  }
}

/** Where the walk read, for a line naming that no setup was found. */
function lookedIn({ from, last }: SetupPlace): string {
  return `${sanitizeLabel(from)}${last === from ? "" : ` or a folder above it, up to ${sanitizeLabel(last)}`}`;
}

const GUARD_READS = `the guard reads the marker at its project root's ${AWAY_MARKER_FILE}, the folder stamity init set up, so a marker anywhere else turns nothing on`;

/** `on` or `off` where the walk found no setup: no guard reads a marker here, so nothing is written or removed. */
function noSetup(subcommand: "on" | "off", place: SetupPlace): CliFailure {
  return new CliFailure({
    code: "VALIDATION_ERROR",
    message: `away ${subcommand} found no ${STATE_DIR}/${MANIFEST_FILE} in ${lookedIn(place)}, so no project root the guard reads`,
    why: GUARD_READS,
    next:
      subcommand === "on"
        ? "run stamity away on in the folder stamity init set up, or in a folder below it; where nothing is set up yet, run stamity init first, in the folder your agent sessions open in"
        : "run stamity away off in the folder stamity init set up, or in a folder below it",
  });
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

/** `root` is a setup's folder ({@link findSetup}), so its `.stamity` is a folder or a link to one (M-2). */
async function runOn(ctx: CliContext, root: string): Promise<CommandResult> {
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

/** With no setup found, the variable alone says on or off, and a line says no marker is read here. */
async function runStatus(ctx: CliContext, place: SetupPlace): Promise<CommandResult> {
  const { root } = place;
  const env = envOn(ctx);
  const marker = root !== null && (await markerStats(root)) !== null;
  const since = root !== null && marker ? markerSince(root) : null;
  const { entries: held, olderUnread } = root === null ? { entries: [], olderUnread: 0 } : readHeldList(root);
  const source = sourceOf(env, marker);
  const lines = [
    `away: ${source === "none" ? "off" : "on"}`,
    `source: ${source}`,
    ...(root === null
      ? [`setup: none found in ${lookedIn(place)}, so no marker is read here; run stamity away status in the folder stamity init set up, or in a folder below it`]
      : []),
    ...(since === null ? [] : [`since: ${since}`]),
    `held: ${String(held.length)}`,
    ...(olderUnread > 0 ? [heldUnreadLine(olderUnread)] : []),
    ...held.map(({ act, rule, at }) => `- ${act} (${rule}, ${at})`),
  ];
  ctx.io.out(`${lines.join("\n")}\n`);
  return {
    exitCode: 0,
    json: { subcommand: "status", away: source !== "none", source, since, held: held.length, heldOlderUnread: olderUnread, heldList: held },
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
    const place = await findSetup(ctx.app.runtime.cwd);
    const [subcommand] = args;
    if (subcommand !== "on" && subcommand !== "off") return runStatus(ctx, place);
    if (place.root === null) throw noSetup(subcommand, place);
    return subcommand === "on" ? runOn(ctx, place.root) : runOff(ctx, place.root);
  },
};
