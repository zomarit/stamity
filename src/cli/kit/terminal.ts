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
  /**
   * The terminal's own width in columns, absent when the stream reports none
   * (a pipe, a file, a test double).
   *
   * Read here rather than at the surfaces that need it, for the same reason
   * every other fact on this interface is: a renderer that fits its output to
   * the window takes the width as an INJECTED fact instead of reaching for
   * `process.stdout.columns` itself. `./banner.ts::bannerBlock` is the first
   * consumer — a fixed-width picture wraps rather than shrinks, so it stays out
   * of a window narrower than it — and absent means "the caller does not know",
   * which every consumer treats as the behaviour it had before this fact.
   */
  stdoutColumns?: number;
}

/** Reads TTY-ness, and the reported width, from the given streams — defaulting to the live process streams. */
export function detectTerminalFacts(streams?: {
  stdout?: { isTTY?: boolean; columns?: number };
  stderr?: { isTTY?: boolean };
  stdin?: { isTTY?: boolean };
}): TerminalFacts {
  const columns = (streams?.stdout ?? process.stdout).columns;
  return {
    stdoutIsTTY: (streams?.stdout ?? process.stdout).isTTY === true,
    stderrIsTTY: (streams?.stderr ?? process.stderr).isTTY === true,
    stdinIsTTY: (streams?.stdin ?? process.stdin).isTTY === true,
    // Conditional, not `stdoutColumns: undefined`: a stream that reports no
    // width leaves NO key, so a facts object built off a pipe keeps the exact
    // shape it has always had.
    ...(typeof columns === "number" ? { stdoutColumns: columns } : {}),
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

/** How much of an accent color a terminal can be given. */
export type AccentDepth = "truecolor" | "ansi256" | "ansi16" | "none";

/**
 * TWO accent ladders, because the brand violet is spent on two different jobs
 * and only one of them is decoration.
 *
 * `MARK_ACCENT_SGR` is the MARK's ladder: `#6B24FF`, exactly as
 * `website/static/img/wordmark.svg` spells it, spent on the one cell run in the
 * wordmark (`./banner.ts`). Nothing the mark communicates depends on it — the
 * ink carries the letterforms and the accent is a flourish on top — so the
 * exact brand value is the right answer at every rung there, including the rung
 * that is a theme-defined magenta.
 *
 * `UI_ACCENT_SGR` is the INTERFACE's ladder, and it is deliberately a different
 * color. Measured on WCAG 2.x relative luminance, `#6B24FF` is 3.32:1 on black
 * and 2.25:1 on a Dracula ground (`#282A36`), so as a STATE INDICATOR it fails
 * WCAG 1.4.11's 3:1 floor for non-text contrast on dark grounds — and its
 * degrade ladder makes that worse rather than better (`#5F00FF`, the 256-color
 * cube's nearest index, is 2.93:1 on black). A menu cursor is not decoration,
 * so the UI accent is a ground-INDEPENDENT tint of the same brand hue instead:
 * `#8A52FF` — the token set's own `--ifm-color-primary-lightest` — at 4.7:1 on
 * black, 4.4:1 on white and 3.2:1 on `#282A36`, above the floor on every ground
 * a terminal plausibly has. Its 256-color rung is index 99 (`#875FFF`), the
 * cube's nearest neighbour.
 *
 * At `ansi16` the UI accent writes NO ESCAPE AT ALL, which is why this table
 * has no `ansi16` row where the mark's does. SGR 35 is whatever the reader's
 * theme maps magenta to — an unknowable value that may well be 2.2:1 against
 * their own background — and a color nobody can measure may not be asked to
 * carry state. Vanishing is the honest rung: the glyph underneath (the `>`
 * cursor, the `x` in the box) is what says which row is active, and the color
 * is redundant reinforcement everywhere it appears.
 *
 * Both ladders close with `ACCENT_RESET` — SGR 39, default foreground — rather
 * than SGR 0, so an accent run can never reset a bold or dim a caller had open
 * around it.
 */
const MARK_ACCENT_RGB = [107, 36, 255] as const;

/** The mark's ladder: `#6B24FF`, decorative, one cell run in the wordmark. */
export const MARK_ACCENT_SGR: Readonly<Record<Exclude<AccentDepth, "none">, string>> = {
  truecolor: `\u001B[38;2;${MARK_ACCENT_RGB[0]};${MARK_ACCENT_RGB[1]};${MARK_ACCENT_RGB[2]}m`,
  ansi256: "\u001B[38;5;57m",
  ansi16: "\u001B[35m",
};

/** `#8A52FF` — the UI accent, a ground-independent tint of the brand hue. */
const UI_ACCENT_RGB = [138, 82, 255] as const;

/** The interface's ladder. It has no `ansi16` row on purpose: see above. */
const UI_ACCENT_SGR: Readonly<Record<Exclude<AccentDepth, "none" | "ansi16">, string>> = {
  truecolor: `\u001B[38;2;${UI_ACCENT_RGB[0]};${UI_ACCENT_RGB[1]};${UI_ACCENT_RGB[2]}m`,
  ansi256: "\u001B[38;5;99m",
};

/** Default foreground. Closes an accent run without touching other attributes. */
export const ACCENT_RESET = "\u001B[39m";

/**
 * How much of an accent this terminal gets, given a color decision already made
 * by `resolveColorEnabled` above.
 *
 * Capability is read from the environment, not from `getColorDepth()`, so the
 * answer is a pure function of inputs a caller can inject — the same reason the
 * rest of this kit takes injected terminal facts instead of touching
 * `process.stdout`. The cost is a truecolor terminal that advertises nothing
 * getting the 256-color index instead of the exact one; the failure direction
 * is a slightly different violet, never a broken escape.
 */
export function resolveAccentDepth(opts: {
  colorEnabled: boolean;
  env: Readonly<Record<string, string | undefined>>;
}): AccentDepth {
  if (!opts.colorEnabled) return "none";
  const colorterm = (opts.env["COLORTERM"] ?? "").toLowerCase();
  if (colorterm === "truecolor" || colorterm === "24bit") return "truecolor";
  const term = (opts.env["TERM"] ?? "").toLowerCase();
  if (term.includes("256color") || colorterm !== "") return "ansi256";
  return "ansi16";
}

export interface Palette {
  bold(s: string): string;
  dim(s: string): string;
  red(s: string): string;
  green(s: string): string;
  yellow(s: string): string;
  cyan(s: string): string;
  /**
   * The UI accent (`#8A52FF`) at the depth this terminal can take; the identity
   * at `"none"`, at `"ansi16"` and whenever color is off. Reserved for a state
   * indicator whose glyph already carries the state on its own.
   */
  accent(s: string): string;
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
 *
 * `accent` is the one method styleText cannot express (there is no named style
 * for a 24-bit color), so it is composed from `UI_ACCENT_SGR` directly. Its
 * depth DEFAULTS to `"none"`, which keeps `makePalette(true)` exactly what it
 * always was: a caller that has not resolved an accent depth gets the old
 * behaviour rather than a silent new one.
 */
export function makePalette(enabled: boolean, accent: AccentDepth = "none"): Palette {
  const sgr = enabled && accent !== "none" && accent !== "ansi16" ? UI_ACCENT_SGR[accent] : null;
  const accentFn = sgr === null ? identity : (s: string): string => `${sgr}${s}${ACCENT_RESET}`;
  if (!enabled) {
    return {
      bold: identity,
      dim: identity,
      red: identity,
      green: identity,
      yellow: identity,
      cyan: identity,
      accent: accentFn,
    };
  }
  return {
    bold: paint("bold"),
    dim: paint("dim"),
    red: paint("red"),
    green: paint("green"),
    yellow: paint("yellow"),
    cyan: paint("cyan"),
    accent: accentFn,
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
