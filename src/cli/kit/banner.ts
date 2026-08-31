import { resolveColorEnabled } from "./terminal.ts";

/**
 * The terminal wordmark — "stamity" drawn in half-block characters so the CLI
 * looks like the brand mark instead of announcing itself in prose.
 *
 * INK IS NOT A COLOR. Every letterform cell is written with no escape sequence
 * at all, so it renders in whatever foreground the reader's theme already uses
 * — light terminal, dark terminal, high-contrast, a `script(1)` transcript. The
 * mark therefore needs no light/dark variant and can never collide with a
 * user's background. Exactly ONE cell run carries color: the whole crossbar of
 * the first `t` — left arm, stem crossing, right arm, the one continuous violet
 * path the SVG draws — in the brand violet #6B24FF. That single accent is the
 * whole of the color budget, and it degrades (24-bit -> 256 -> 16) or vanishes
 * rather than being approximated by painting more of the mark.
 *
 * The grid below is the source of truth, at two pixels per terminal row:
 * `#` is ink, `+` is the accent, a space is the terminal's own background. Each
 * output cell pairs the pixel above with the pixel below — ` `, `▀`, `▄` or `█`
 * — which buys 14 pixel rows of vertical resolution inside 7 text rows without
 * ever needing a BACKGROUND color. That last point is the constraint the shape
 * is built around: a cell painted with a background would stop adapting to the
 * theme, so no cell ever mixes two inks, and the letterforms are drawn so that
 * situation cannot arise (`test/cli/banner.test.ts` pins it).
 *
 * Proportions are read off `website/static/img/wordmark.svg` — the tree's copy
 * of the drawn mark, and the same file README's banner shows — not eyeballed:
 * the 23.2-unit stem is two columns, so the 489x130 artwork lands at 47 columns
 * with a three-pixel ascender, an eight-pixel x-height and a three-pixel
 * descender. The `i` keeps its square dot (two cells wide, one row tall, one
 * pixel of air under it), both `t`s keep the slab crossbar and the foot that
 * kicks right, and the `y` keeps the tail that hooks back left under the
 * baseline.
 */

/** `#6B24FF` — the one accent in the mark, as the SVG spells it. */
const ACCENT_RGB = [107, 36, 255] as const;

/**
 * The accent's escape sequence per terminal capability, and nothing else — ink
 * has no entry here because ink is never colored.
 *
 * `ansi256` is cube index 57 (rgb 95/0/255), the closest the 6x6x6 cube gets to
 * #6B24FF; `ansi16` falls back to magenta, the only violet-adjacent name the
 * base palette has. Every run closes with SGR 39 (default foreground) rather
 * than SGR 0, so the accent cannot reset a bold or dim the caller had open.
 */
const ACCENT_SGR: Readonly<Record<Exclude<BannerAccent, "none">, string>> = {
  truecolor: `\u001B[38;2;${ACCENT_RGB[0]};${ACCENT_RGB[1]};${ACCENT_RGB[2]}m`,
  ansi256: "\u001B[38;5;57m",
  ansi16: "\u001B[35m",
};

/** Default foreground. Closes an accent run without touching other attributes. */
const ACCENT_RESET = "\u001B[39m";

/** How much of the accent color a terminal can be given. */
export type BannerAccent = "truecolor" | "ansi256" | "ansi16" | "none";

/**
 * The one non-space pixel that is not plain ink. Everything else that is not a
 * space is ink, which is why the renderer tests for "not a space" rather than
 * for `#`: a new ink character in the grid should draw, not silently vanish.
 */
const ACCENT = "+";

/**
 * The wordmark at two pixels per text row: 14 rows of at most 47 columns.
 *
 * Read it as artwork — the letterforms are visible in the source on purpose, so
 * a change to the mark is reviewable as a picture rather than as a diff of
 * escape sequences. Rows are stored right-trimmed and read through
 * {@link pixelAt}, which treats a short row as trailing background.
 */
const WORDMARK: readonly string[] = [
  "        ##                      ##  ##",
  "        ##                      ##  ##",
  "        ++                          ##",
  "###### +++++ ####### ########## ## ##### ##  ##",
  "###### +++++ ####### ########## ## ##### ##  ##",
  "##      ++   ##   ## ##  ##  ## ##  ##   ##  ##",
  "######  ##   ##   ## ##  ##  ## ##  ##   ##  ##",
  "######  ##   ##   ## ##  ##  ## ##  ##   ##  ##",
  "    ##  ##   ##   ## ##  ##  ## ##  ##   ##  ##",
  "######  #### ####### ##  ##  ## ##  #### ######",
  "######  #### ####### ##  ##  ## ##  #### ######",
  "                                             ##",
  "                                             ##",
  "                                           ####",
];

/** Text rows the mark occupies: two pixel rows each. */
export const BANNER_ROWS = WORDMARK.length / 2;

/** Columns the mark occupies, before any indent. */
export const BANNER_COLUMNS = Math.max(...WORDMARK.map((row) => row.length));

/** The margin the mark is printed at when a caller does not name one. */
const BANNER_INDENT = "  ";

/** A pixel outside a right-trimmed row is background, not an error. */
function pixelAt(row: string, column: number): string {
  return row[column] ?? " ";
}

/**
 * Renders the mark as text rows, joined by newlines with no trailing newline.
 *
 * With `accent: "none"` (the default) the result is pure block characters — no
 * escape byte anywhere in it — which is what a NO_COLOR reader, a captured log
 * and the snapshot test all see. Any other accent adds escapes around the
 * accent run ONLY: stripping every escape from a colored rendering returns the
 * plain one byte for byte.
 */
export function renderWordmark(opts: { accent?: BannerAccent; indent?: string } = {}): string {
  const accent = opts.accent ?? "none";
  const indent = opts.indent ?? "";
  const sgr = accent === "none" ? null : ACCENT_SGR[accent];
  const lines: string[] = [];

  for (let row = 0; row < WORDMARK.length; row += 2) {
    const top = WORDMARK[row] ?? "";
    const bottom = WORDMARK[row + 1] ?? "";
    let line = "";
    let accentOpen = false;

    for (let column = 0; column < BANNER_COLUMNS; column += 1) {
      const upper = pixelAt(top, column);
      const lower = pixelAt(bottom, column);
      const upperInk = upper !== " ";
      const lowerInk = lower !== " ";
      const glyph = upperInk ? (lowerInk ? "█" : "▀") : lowerInk ? "▄" : " ";
      // A cell is accented when either of its two pixels is. The grid never
      // pairs an accent pixel with an ink pixel, so this never has to choose
      // between two inks in one cell — the invariant the test pins.
      const wantsAccent = sgr !== null && (upper === ACCENT || lower === ACCENT);
      if (wantsAccent && !accentOpen) {
        line += sgr;
        accentOpen = true;
      } else if (!wantsAccent && accentOpen) {
        line += ACCENT_RESET;
        accentOpen = false;
      }
      line += glyph;
    }

    if (accentOpen) line += ACCENT_RESET;
    // Trailing background is invisible but not free: it widens the mark past
    // its declared column count and leaves whitespace at the end of every line
    // of a copied transcript.
    lines.push(`${indent}${line}`.replace(/[ ]+$/u, ""));
  }

  return lines.join("\n");
}

/**
 * How much of the accent this terminal gets, given a color decision already
 * made by `./terminal.ts::resolveColorEnabled`.
 *
 * Capability is read from the environment, not from `getColorDepth()`, so the
 * answer is a pure function of inputs a caller can inject — the same reason the
 * rest of this kit takes injected terminal facts instead of touching
 * `process.stdout`. The cost is a truecolor terminal that advertises nothing
 * getting the 256-color index instead of the exact one; the failure direction
 * is a slightly different violet, never a broken escape or a wrong-colored
 * letterform.
 */
export function resolveBannerAccent(opts: {
  colorEnabled: boolean;
  env: Readonly<Record<string, string | undefined>>;
}): BannerAccent {
  if (!opts.colorEnabled) return "none";
  const colorterm = (opts.env["COLORTERM"] ?? "").toLowerCase();
  if (colorterm === "truecolor" || colorterm === "24bit") return "truecolor";
  const term = (opts.env["TERM"] ?? "").toLowerCase();
  if (term.includes("256color") || colorterm !== "") return "ansi256";
  return "ansi16";
}

/**
 * The mark as a ready-to-write block for a human-facing surface, or the empty
 * string when this surface is not one.
 *
 * Two gates, and they answer different questions. WHETHER to print is decided
 * by the reader: a non-TTY stdout is a pipe, a file or a CI log, and a `--json`
 * run is a document with a schema — neither is a person looking at a first
 * screen, and the mark stays out of both entirely rather than being emitted and
 * stripped. HOW to print is decided by the color rules the whole CLI shares
 * (`--no-color` beats NO_COLOR beats FORCE_COLOR beats TTY), so a reader who
 * turned color off still gets the mark, in plain ink.
 *
 * Returns a newline-terminated block so it composes by concatenation; empty
 * output is exactly `""`, which every writer here treats as nothing to write.
 */
export function bannerBlock(opts: {
  stdoutIsTTY: boolean;
  machineReadable: boolean;
  env: Readonly<Record<string, string | undefined>>;
  noColorFlag?: boolean;
  indent?: string;
}): string {
  if (!opts.stdoutIsTTY) return "";
  if (opts.machineReadable) return "";
  const accent = resolveBannerAccent({
    colorEnabled: resolveColorEnabled({
      noColorFlag: opts.noColorFlag ?? false,
      env: opts.env,
      stdoutIsTTY: opts.stdoutIsTTY,
    }),
    env: opts.env,
  });
  return `${renderWordmark({ accent, indent: opts.indent ?? BANNER_INDENT })}\n`;
}
