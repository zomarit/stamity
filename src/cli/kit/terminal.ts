import { styleText } from "node:util";

/**
 * Terminal facts, color resolution, and the spinner — the CLI's only knowledge
 * of "am I talking to a person or a pipe".
 *
 * Color resolution order is ours, not the platform's: the --no-color
 * flag beats a nonempty NO_COLOR env, which beats a nonempty FORCE_COLOR env,
 * which beats stdout TTY detection. `styleText` is therefore always called with
 * stream validation off — the resolved flag is the single authority, never a
 * second stream auto-detect inside node:util.
 */

export interface TerminalFacts {
  stdoutIsTTY: boolean;
  stderrIsTTY: boolean;
  stdinIsTTY: boolean;
}

/** Reads TTY-ness from the given streams, defaulting to the live process streams. */
export function detectTerminalFacts(streams?: {
  stdout?: { isTTY?: boolean };
  stderr?: { isTTY?: boolean };
  stdin?: { isTTY?: boolean };
}): TerminalFacts {
  return {
    stdoutIsTTY: (streams?.stdout ?? process.stdout).isTTY === true,
    stderrIsTTY: (streams?.stderr ?? process.stderr).isTTY === true,
    stdinIsTTY: (streams?.stdin ?? process.stdin).isTTY === true,
  };
}

/**
 * The two literals that spell "off" when they arrive in FORCE_COLOR, checked
 * before the force-on branch.
 *
 * FORCE_COLOR is a two-way switch everywhere else, and reading it as one-way
 * (any nonempty value forces color ON) inverted it: a CI job that exports
 * `FORCE_COLOR=0` to strip escapes from a captured log was handed escapes.
 * Both references agree on these two spellings. Node's own
 * `tty.WriteStream.getColorDepth` returns depth 1 — monochrome — for `0` and
 * for `false`, and depth 4 for the empty string, `1` and `true` (measured on
 * node v22.22.1, the 22.12 floor's line, 2026-08-22); supports-color, which
 * chalk reads, returns level 0 for `false` and for any value parsing to 0.
 *
 * Exact, case-sensitive match on the two: `FALSE` and `00` are neither
 * reference's spelling, so widening the set here would put a third
 * interpretation of one variable into circulation.
 *
 * Divergence that stays: an UNRECOGNIZED nonempty value (`FORCE_COLOR=maybe`)
 * still forces color on here, where both references fall through to off.
 * Narrowing that is a second decision about a value nobody sets on purpose;
 * the reported defect is the two spellings that are set on purpose.
 */
const FORCE_COLOR_OFF = new Set(["0", "false"]);

/**
 * Precedence: --no-color flag > NO_COLOR nonempty > FORCE_COLOR nonempty
 * (`0`/`false` force off, anything else forces on) > stdout isTTY. An
 * empty-string env var counts as unset on both sides, per the informal NO_COLOR
 * spec (https://no-color.org: any nonempty value disables).
 *
 * The empty string is the one place this deliberately does not follow Node,
 * which reads `FORCE_COLOR=` as force-on: the symmetric "empty means unset"
 * rule keeps a variable that survived as `VAR=` through a shell or CI export
 * from silently deciding either way, and falling through to TTY detection is
 * the answer that reads the situation rather than a stale export.
 */
export function resolveColorEnabled(opts: {
  noColorFlag: boolean;
  env: Readonly<Record<string, string | undefined>>;
  stdoutIsTTY: boolean;
}): boolean {
  if (opts.noColorFlag) return false;
  const noColor = opts.env["NO_COLOR"];
  if (noColor !== undefined && noColor !== "") return false;
  const forceColor = opts.env["FORCE_COLOR"];
  if (forceColor !== undefined && forceColor !== "") {
    return !FORCE_COLOR_OFF.has(forceColor);
  }
  return opts.stdoutIsTTY;
}

export interface Palette {
  bold(s: string): string;
  dim(s: string): string;
  red(s: string): string;
  green(s: string): string;
  yellow(s: string): string;
  cyan(s: string): string;
}

const identity = (s: string): string => s;

const paint =
  (format: Parameters<typeof styleText>[0]) =>
  (s: string): string =>
    styleText(format, s, { validateStream: false });

/**
 * styleText-backed when enabled, identity functions otherwise. `validateStream:
 * false` keeps the resolved flag authoritative — without it node:util would
 * re-check the stream and the ambient env vars and could override our order.
 */
export function makePalette(enabled: boolean): Palette {
  if (!enabled) {
    return {
      bold: identity,
      dim: identity,
      red: identity,
      green: identity,
      yellow: identity,
      cyan: identity,
    };
  }
  return {
    bold: paint("bold"),
    dim: paint("dim"),
    red: paint("red"),
    green: paint("green"),
    yellow: paint("yellow"),
    cyan: paint("cyan"),
  };
}

export interface Spinner {
  start(text: string): void;
  update(text: string): void;
  stop(finalLine?: string): void;
}

/** ASCII frames render on every terminal the CLI targets; no cursor escapes needed. */
const SPINNER_FRAMES = ["-", "\\", "|", "/"] as const;

/**
 * Hand-rolled `\r` spinner. Frames advance one per render call (start/update),
 * not on a timer: renders are deterministic under test and no interval handle
 * can outlive the run or hold the event loop open. Callers gate `enabled` on
 * (stdout TTY && !json); when disabled, start() prints its text exactly once as
 * a plain line — the log-friendly fallback — and update() is silent.
 */
export function makeSpinner(opts: { enabled: boolean; write: (s: string) => void }): Spinner {
  const { enabled, write } = opts;
  let frame = 0;
  let width = 0;
  let active = false;

  const render = (text: string): void => {
    const line = `${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]} ${text}`;
    frame += 1;
    const pad = Math.max(0, width - line.length);
    write(`\r${line}${" ".repeat(pad)}`);
    width = Math.max(width, line.length);
    active = true;
  };

  return {
    start(text) {
      if (enabled) render(text);
      else write(`${text}\n`);
    },
    update(text) {
      if (enabled) render(text);
    },
    stop(finalLine) {
      if (enabled && active) {
        write(`\r${" ".repeat(width)}\r`);
        active = false;
        width = 0;
        frame = 0;
      }
      if (finalLine !== undefined) write(`${finalLine}\n`);
    },
  };
}
