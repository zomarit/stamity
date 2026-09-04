import {
  ACCENT_RESET,
  MARK_ACCENT_SGR,
  resolveAccentDepth,
  resolveColorEnabled,
  type AccentDepth,
} from "./terminal.ts";

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
 * Proportions are derived from `website/static/img/wordmark.svg` — the tree's
 * copy of the drawn mark, and the same file README's banner shows — not
 * eyeballed. The derivation is NOT one raster of the whole artwork, and should
 * not be "simplified" into one: the mark's inter-letter gaps run 4.6 to 7.3 SVG
 * units, and at 62 columns a column is 7.9 units, so every gap is sub-column at
 * every width this 64-column budget allows. Rasterize the 489x130 artwork in
 * one pass and the letters fuse — the `s` welds to the `t`'s crossbar and the
 * `a` welds to the `m`. So each letter was rasterized in its OWN column box,
 * 16x16 supersampled coverage per pixel thresholded at 50%, and one blank
 * column was then inserted by hand between letters.
 *
 * Two allocations are hand-set rather than sampled, because the raster's answer
 * was worse than the mark: the `a`'s right mass is widened to four columns, and
 * the `m` is narrowed to thirteen so its three legs come out equal. Two further
 * cells are cleanups of raster phase noise inside the `a`, where the sampling
 * grid broke the letter's own top/bottom symmetry by one cell — rows 8 and 10
 * are mirrored back onto rows 5 and 3. On top of those sit the three
 * adjustments this mark has always carried: the `i` keeps its square dot with
 * one pixel of air under it, both `t`s keep the slab crossbar and the foot that
 * kicks right, and the `y` keeps the tail that hooks back left under the
 * baseline.
 *
 * The grid is deliberately ANISOTROPIC — a difference to preserve, not a bug to
 * correct. 489/62 gives 7.9 SVG units per column against 130/14 = 9.3 units per
 * pixel row, so the 23.2-unit stem is three cells WIDE while a stroke of the
 * same weight lying flat is two rows TALL. Squaring the two would either
 * overflow the budget or thin every vertical back to two columns, which is what
 * the previous 47-column grid did — and it cost the `a`. A bowl and a stem the
 * same width, with the arcs squared off at the corners, is an axis-symmetric
 * ring, and an axis-symmetric ring is the shape an `o` IS; in a word carrying
 * no real `o` the eye still resolved it that way. At three columns the
 * letterform does the work unaided: the bowl's left edge steps in, the right
 * edge stays dead straight across the whole x-height, and the counter comes out
 * a lozenge instead of a rectangle.
 */

/**
 * The mark's accent, its degrade ladder and the SGR 39 that closes a run all
 * live in `./terminal.ts` now, beside the SECOND ladder the interface spends on
 * state indicators (the menu cursor, the checked box) — one home for both, and
 * the comment there is where the reason the two are different colors is
 * written down. This file keeps the names it has always exported.
 */

/** How much of the accent color a terminal can be given. */
export type BannerAccent = AccentDepth;

/**
 * The banner's own spelling of `./terminal.ts::resolveAccentDepth`, re-exported
 * rather than reimplemented: `test/cli/banner.test.ts` imports it from here,
 * and the mark is not the only surface that needs the answer any more.
 */
export { resolveAccentDepth as resolveBannerAccent } from "./terminal.ts";

/**
 * The one non-space pixel that is not plain ink. Everything else that is not a
 * space is ink, which is why the renderer tests for "not a space" rather than
 * for `#`: a new ink character in the grid should draw, not silently vanish.
 */
const ACCENT = "+";

/**
 * The wordmark at two pixels per text row: 14 rows of at most 62 columns.
 *
 * Read it as artwork — the letterforms are visible in the source on purpose, so
 * a change to the mark is reviewable as a picture rather than as a diff of
 * escape sequences. Rows are stored right-trimmed and read through
 * {@link pixelAt}, which treats a short row as trailing background.
 */
const WORDMARK: readonly string[] = [
  "           ###                             ###  ###",
  "           ###                             ###  ###",
  "           +++                                  ###",
  "  ####### ++++++   #########   #### ####   ### ###### ###  ###",
  " ######## ++++++  ##########  ###########  ### ###### ###  ###",
  "###        +++   ####  ##### ### ##### ### ###  ###   ###  ###",
  "#########  ###   ###    #### ###  ###  ### ###  ###   ###  ###",
  "#########  ###   ###    #### ###  ###  ### ###  ###   ###  ###",
  "      ###  ###   ####  ##### ###  ###  ### ###  ###   ########",
  "########   #####  ########## ###  ###  ### ###  #####  #######",
  "#######     ####   ######### ###  ###  ### ###   ####   ######",
  "                                                         #####",
  "                                                         ####",
  "                                                         ###",
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
  const sgr = accent === "none" ? null : MARK_ACCENT_SGR[accent];
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
 * The mark as a ready-to-write block for a human-facing surface, or the empty
 * string when this surface is not one.
 *
 * Three gates, and they answer different questions. WHETHER to print is decided
 * by the reader: a non-TTY stdout is a pipe, a file or a CI log, and a `--json`
 * run is a document with a schema — neither is a person looking at a first
 * screen, and the mark stays out of both entirely rather than being emitted and
 * stripped. WHETHER IT FITS is decided by `columns`, the terminal's own width,
 * injected like every other terminal fact here: the mark is a fixed-width
 * picture, so a window narrower than it does not shrink it, it WRAPS it, and a
 * wrapped wordmark is a scramble of half blocks that reads worse than no mark
 * at all. Same stay-out-rather-than-print-broken rule as the first two gates.
 * `columns` absent means the caller does not know the width, and the mark
 * prints — the behaviour every call site had before this fact existed. HOW to
 * print is decided by the color rules the whole CLI shares (`--no-color` beats
 * NO_COLOR beats FORCE_COLOR beats TTY), so a reader who turned color off still
 * gets the mark, in plain ink.
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
  columns?: number;
}): string {
  if (!opts.stdoutIsTTY) return "";
  if (opts.machineReadable) return "";
  const indent = opts.indent ?? BANNER_INDENT;
  // The width the mark actually needs is the art plus whatever margin it is
  // printed at — 62 + 2 today — PLUS one column of slack, so 64 gets nothing
  // and 65 gets the mark.
  //
  // The slack is not padding for taste; it is the difference between two
  // terminal wrap behaviours. Four of the seven rendered rows are exactly 64
  // characters with the indent, and a line that exactly fills the window is
  // where terminals disagree. An xterm-family terminal implements DECAWM
  // deferred (pending) wrap: the cursor parks in the last column and the
  // newline that follows just ends the row, so an exact-width mark draws
  // correctly there and this extra column costs it nothing. conhost and some
  // other Windows hosts wrap eagerly instead — writing the 64th character
  // moves the cursor to the next row on its own, and the newline after it then
  // consumes a SECOND row, so those four rows come out separated by blank
  // lines: a gapped mark on exactly the first screen this gate exists to
  // protect. Requiring one column of slack removes the disagreement rather
  // than betting on which host is reading.
  if (typeof opts.columns === "number" && opts.columns <= BANNER_COLUMNS + indent.length) {
    return "";
  }
  const accent = resolveAccentDepth({
    colorEnabled: resolveColorEnabled({
      noColorFlag: opts.noColorFlag ?? false,
      env: opts.env,
      stdoutIsTTY: opts.stdoutIsTTY,
    }),
    env: opts.env,
  });
  return `${renderWordmark({ accent, indent })}\n`;
}
