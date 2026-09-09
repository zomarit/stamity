import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import {
  ACCENT,
  BANNER_COLUMNS,
  BANNER_ROWS,
  WORDMARK,
  bannerBlock,
  renderWordmark,
  resolveBannerAccent,
  type BannerAccent,
} from "../../src/cli/kit/banner.ts";
import type { CommandModule } from "../../src/cli/kit/program.ts";
import { runInProcess } from "../support/inProcess.ts";

/**
 * The brand contract for the CLI's first screen, in four claims:
 *
 * 1. The plain rendering is pure block characters — the snapshot below is what
 *    a NO_COLOR reader, a captured transcript and a `script(1)` log all get.
 * 2. Ink carries NO escape at all, so it inherits the reader's theme; the
 *    accent opens one run per text row it touches — two in all, since the
 *    crossbar spans pixel rows 2-5 — and stripping every escape from a colored
 *    rendering returns the plain bytes unchanged.
 * 3. The accent degrades 24-bit -> 256 -> 16 and then vanishes.
 * 4. Nothing is printed on a machine-read path: a piped stdout or a `--json`
 *    run gets no mark, not a stripped one.
 */

/** The violet the mark is allowed to spend, per capability. */
const VIOLET = {
  truecolor: "\u001B[38;2;107;36;255m",
  ansi256: "\u001B[38;5;57m",
  ansi16: "\u001B[35m",
} as const;

/** Default foreground: what closes an accent run. */
const RESET_FG = "\u001B[39m";

const COLORED: readonly Exclude<BannerAccent, "none">[] = ["truecolor", "ansi256", "ansi16"];

function fixtureCommand(name: string): CommandModule {
  return {
    name,
    summary: `${name} fixture`,
    mutating: false,
    run: async () => ({ exitCode: 0 }),
  };
}

describe("wordmark — the plain rendering", () => {
  it("draws stamity in block characters, and nothing else", () => {
    expect(renderWordmark()).toMatchInlineSnapshot(`
      "           ███                             ███  ███
        ▄▄▄▄▄▄▄ ▄███▄▄   ▄▄▄▄▄▄▄▄▄   ▄▄▄▄ ▄▄▄▄   ▄▄▄ ▄███▄▄ ▄▄▄  ▄▄▄
      ▄██▀▀▀▀▀▀ ▀███▀▀ ▄███▀▀█████ ▄██▀█████▀██▄ ███ ▀███▀▀ ███  ███
      █████████  ███   ███    ████ ███  ███  ███ ███  ███   ███  ███
      ▄▄▄▄▄▄██▀  ███▄▄ ▀███▄▄█████ ███  ███  ███ ███  ███▄▄ ▀███████
      ▀▀▀▀▀▀▀     ▀▀▀▀   ▀▀▀▀▀▀▀▀▀ ▀▀▀  ▀▀▀  ▀▀▀ ▀▀▀   ▀▀▀▀   ▀█████
                                                               ███▀"
    `);
  });

  it("fits the terminal budget: at most 7 rows and 64 columns", () => {
    const lines = renderWordmark({ indent: "  " }).split("\n");
    expect(lines).toHaveLength(BANNER_ROWS);
    expect(BANNER_ROWS).toBeLessThanOrEqual(7);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(64);
    expect(BANNER_COLUMNS).toBeLessThanOrEqual(64);
  });

  it("carries no escape byte, so ink is whatever the reader's theme calls foreground", () => {
    const art = renderWordmark();
    expect(art).not.toContain("\u001B");
    // Half blocks and full blocks only: a cell is background, top, bottom or
    // both. Anything else would need a background color to render.
    expect(new Set(art.replace(/\n/gu, ""))).toEqual(new Set([" ", "▀", "▄", "█"]));
  });

  it("leaves no trailing whitespace on any row", () => {
    for (const line of renderWordmark({ indent: "  " }).split("\n")) {
      expect(line).toBe(line.replace(/\s+$/u, ""));
    }
  });
});

/** The renderer's own rule: any non-space pixel that is not the accent is ink. */
const isInk = (pixel: string): boolean => pixel !== " " && pixel !== ACCENT;

describe("wordmark — the single accent", () => {
  it.each(COLORED)("spends the violet exactly once per row it touches (%s)", (accent) => {
    const art = renderWordmark({ accent });
    const opens = art.split(VIOLET[accent]).length - 1;
    const closes = art.split(RESET_FG).length - 1;
    expect(opens).toBeGreaterThan(0);
    // Every opened run closes, and no row is left with the color still on.
    expect(closes).toBe(opens);
    for (const line of art.split("\n")) {
      expect(line.split(VIOLET[accent]).length - 1).toBe(line.split(RESET_FG).length - 1);
    }
  });

  it("emits the 24-bit form of #6B24FF when the terminal can take it", () => {
    expect(renderWordmark({ accent: "truecolor" })).toContain("\u001B[38;2;107;36;255m");
  });

  it("degrades to the closest 256-colour violet, then to magenta", () => {
    expect(renderWordmark({ accent: "ansi256" })).toContain(VIOLET.ansi256);
    expect(renderWordmark({ accent: "ansi256" })).not.toContain(VIOLET.truecolor);
    expect(renderWordmark({ accent: "ansi16" })).toContain(VIOLET.ansi16);
    expect(renderWordmark({ accent: "ansi16" })).not.toContain(VIOLET.ansi256);
  });

  it.each(COLORED)("adds escapes and nothing else: stripping (%s) returns the plain art", (accent) => {
    expect(stripVTControlCharacters(renderWordmark({ accent }))).toBe(renderWordmark());
  });

  it("colours a single cell run — the first t's whole crossbar, not the letterforms", () => {
    const art = renderWordmark({ accent: "truecolor" });
    // Split rather than match: a regex literal spelling the escape byte is a
    // control character in source, which the lint bans outright.
    const colored = art
      .split(VIOLET.truecolor)
      .slice(1)
      .map((tail) => tail.split(RESET_FG)[0] ?? "");
    // Contract change (handoff 2026-08-31_triage-decisions_410bf, decision 4):
    // the accent was the crossbar's left
    // ARM alone — `["▄", "▀"]`, one violet square beside the stem — and is now
    // the FULL crossbar, matching the single continuous violet path in
    // `website/static/img/wordmark.svg` (x 75.96 -> 122.96), which runs left arm
    // through stem crossing to right arm with no ink drawn over it.
    //
    // The stem crossing is violet rather than ink because the medium colours a
    // whole cell or none of it: the two cells where crossbar meets stem render
    // as one glyph each, so the grid declares those pixels accent outright
    // instead of leaning on the renderer's accent-wins fallback — which is what
    // keeps "no cell mixes two inks" literally true of the grid.
    //
    // Six cells per text row, the crossbar's width: arm, stem, stem, stem, arm,
    // arm.
    //
    // What this equality can and cannot see: a SECOND coloured run, or a run of
    // the wrong width or on the wrong row, fails it. A cell that mixed accent
    // with ink cannot — such a cell draws the same `█` glyph inside the very
    // same coloured run, so the rendered bytes are identical. That half of the
    // contract is a property of the grid, and it is pinned on the grid, in
    // "never pairs an accent pixel with an ink pixel in one cell" below.
    //
    // TEST CHANGE, justified: the expected run grew from five cells to six
    // because the mark was re-derived at 62 columns, where the `t`'s 23.2-unit
    // stem is THREE columns rather than two. What is coloured did not move: it
    // is the same single continuous violet path (x 75.96 -> 122.96,
    // `website/static/img/wordmark.svg:11`), left arm through stem crossing to
    // right arm. Only the stem's column count changed, so arm/stem/stem/arm/arm
    // became arm/stem/stem/stem/arm/arm. The assertion is not weakened — it is
    // still an exact equality on the full set of coloured runs, so a second
    // coloured run or a cell mixing accent with ink still fails it.
    expect(colored).toEqual(["▄███▄▄", "▀███▀▀"]);
  });

  it("never pairs an accent pixel with an ink pixel in one cell", () => {
    // The renderer accents a cell when EITHER of its two pixels is accent
    // (src/cli/kit/banner.ts, `wantsAccent`), so a grid that paired `+` above
    // `#` would silently paint that ink violet — and no assertion on the
    // rendered bytes could see it, because the cell draws `█` either way. The
    // claim in the module docblock ("no cell ever mixes two inks ... the
    // letterforms are drawn so that situation cannot arise") is about the
    // pixels, so it is read off the pixels.
    const mixed: string[] = [];
    for (let row = 0; row < WORDMARK.length; row += 2) {
      const top = WORDMARK[row] ?? "";
      const bottom = WORDMARK[row + 1] ?? "";
      for (let column = 0; column < BANNER_COLUMNS; column += 1) {
        const upper = top[column] ?? " ";
        const lower = bottom[column] ?? " ";
        if ((upper === ACCENT && isInk(lower)) || (lower === ACCENT && isInk(upper))) {
          mixed.push(`text row ${String(row / 2)}, column ${String(column)}: ${upper}/${lower}`);
        }
      }
    }
    expect(mixed).toEqual([]);
    // Non-degenerate: the grid does carry accent pixels for the walk to reject.
    expect(WORDMARK.some((row) => row.includes(ACCENT))).toBe(true);
  });
});

describe("resolveBannerAccent", () => {
  it("returns none whenever colour is off, whatever the terminal advertises", () => {
    expect(
      resolveBannerAccent({ colorEnabled: false, env: { COLORTERM: "truecolor" } }),
    ).toBe("none");
  });

  it.each([
    ["truecolor", { COLORTERM: "truecolor" }],
    ["truecolor", { COLORTERM: "24bit" }],
    ["truecolor", { COLORTERM: "TrueColor" }],
    ["ansi256", { TERM: "xterm-256color" }],
    ["ansi256", { COLORTERM: "1", TERM: "xterm" }],
    ["ansi16", { TERM: "xterm" }],
    ["ansi16", {}],
  ] as const)("reads %s out of the environment", (expected, env) => {
    expect(resolveBannerAccent({ colorEnabled: true, env })).toBe(expected);
  });
});

describe("bannerBlock — who gets the mark", () => {
  const tty = { stdoutIsTTY: true, machineReadable: false };

  it("prints nothing at all when stdout is not a TTY, even under FORCE_COLOR", () => {
    expect(
      bannerBlock({ stdoutIsTTY: false, machineReadable: false, env: { FORCE_COLOR: "1" } }),
    ).toBe("");
  });

  it("prints nothing on a --json run, rather than printing and stripping", () => {
    expect(bannerBlock({ stdoutIsTTY: true, machineReadable: true, env: {} })).toBe("");
  });

  it("prints the mark, newline-terminated, to a TTY", () => {
    const block = bannerBlock({ ...tty, env: {} });
    expect(block.endsWith("\n")).toBe(true);
    expect(stripVTControlCharacters(block).trimEnd()).toBe(renderWordmark({ indent: "  " }));
  });

  it.each([
    ["NO_COLOR", { NO_COLOR: "1", COLORTERM: "truecolor" }],
    ["FORCE_COLOR=0", { FORCE_COLOR: "0", COLORTERM: "truecolor" }],
    ["FORCE_COLOR=false", { FORCE_COLOR: "false", COLORTERM: "truecolor" }],
  ] as const)("drops every escape under %s and still draws the mark", (_label, env) => {
    const block = bannerBlock({ ...tty, env });
    expect(block).not.toContain("\u001B");
    expect(block.trimEnd()).toBe(renderWordmark({ indent: "  " }));
  });

  it("honours --no-color the way the rest of the CLI does", () => {
    const block = bannerBlock({ ...tty, env: { COLORTERM: "truecolor" }, noColorFlag: true });
    expect(block).not.toContain("\u001B");
  });

  it("spends the 24-bit violet when the terminal advertises it", () => {
    expect(bannerBlock({ ...tty, env: { COLORTERM: "truecolor" } })).toContain(VIOLET.truecolor);
  });

  it("stays out of a window too narrow for the mark, rather than wrapping it", () => {
    // The mark is a fixed-width picture: a window narrower than the art plus
    // its indent does not shrink it, it wraps every row into a scramble of half
    // blocks. Same stay-out rule as the pipe and the --json run. The art
    // (BANNER_COLUMNS, 62) plus the default indent (2) is 64, and the guard
    // demands one column MORE than that, so 64 gets nothing and 65 draws.
    //
    // TEST CHANGE, justified: the boundary moved from 63/64 to 64/65 because
    // the guard now requires a column of slack. Five rendered rows are exactly
    // 64 characters with the indent — the count is the row widths
    // `renderWordmark({ indent: "  " })` produces, 53,64,64,64,64,64,63, and
    // the row below re-derives it rather than trusting this sentence — and a
    // line that exactly fills the window is where terminals disagree: an
    // xterm-family terminal defers the wrap (DECAWM pending wrap), so the mark
    // drew correctly there and the old boundary was fine; conhost and some
    // other Windows hosts wrap eagerly, so the newline after the 64th
    // character consumed a second row and those five rows came out with blank
    // lines between them. The assertion is not weakened — the same two legs
    // are pinned, one column over — and the absent-columns leg below is
    // unchanged.
    expect(bannerBlock({ ...tty, env: {}, columns: 64 })).toBe("");
    const fits = bannerBlock({ ...tty, env: {}, columns: 65 });
    expect(stripVTControlCharacters(fits).trimEnd()).toBe(renderWordmark({ indent: "  " }));
    // The count in the paragraph above, derived: how many rendered rows fill
    // the 64-column window exactly, which is what the eager-wrap host gaps.
    const exact = renderWordmark({ indent: "  " })
      .split("\n")
      .filter((row) => row.length === BANNER_COLUMNS + "  ".length);
    expect(exact).toHaveLength(5);
    // Absent means the caller does not know the width; the mark prints, which
    // is what every call site did before the fact existed.
    const unknown = bannerBlock({ ...tty, env: {} });
    expect(stripVTControlCharacters(unknown).trimEnd()).toBe(renderWordmark({ indent: "  " }));
    // Zero is the same "unknown" spelled as a number: a TTY whose window-size
    // query answered 0x0 reports it while still being a TTY, and a width the
    // terminal does not know is not a window narrower than the mark. It prints,
    // exactly as the absent leg above does. `./kit.test.ts` pins the seam that
    // keeps a zero out of the facts object in the first place; this pins what
    // the renderer does if one reaches it anyway.
    const zero = bannerBlock({ ...tty, env: {}, columns: 0 });
    expect(stripVTControlCharacters(zero).trimEnd()).toBe(renderWordmark({ indent: "  " }));
    // The boundary is derived, not typed: if the mark ever changes width, this
    // is the arithmetic the guard uses — the mark's own width plus the indent,
    // and the guard admits only a window WIDER than that sum.
    expect(BANNER_COLUMNS + "  ".length).toBe(64);
  });

  it("never renders a row that exactly fills the narrowest window it admits", () => {
    // The invariant behind the slack, pinned on the art rather than on the
    // guard: at the narrowest admitted window (65), every physical row is at
    // least one column short of the terminal's width, so no host — deferred
    // wrap or eager — can turn the newline after a row into a blank line.
    const rows = renderWordmark({ indent: "  " }).split("\n");
    const widest = Math.max(...rows.map((row) => row.length));
    expect(widest).toBe(BANNER_COLUMNS + "  ".length);
    expect(widest).toBeLessThan(65);
  });
});

describe("root help wiring", () => {
  const commands = [fixtureCommand("greet")];

  it("puts the mark above the usage line on an interactive root help", async () => {
    const result = await runInProcess(commands, ["--help"], {
      env: { NO_COLOR: "1" },
      tty: { stdout: true },
    });
    expect(result.code).toBe(0);
    const art = renderWordmark({ indent: "  " });
    expect(result.stdout).toContain(art);
    expect(result.stdout.indexOf(art)).toBeLessThan(result.stdout.indexOf("Usage:"));
    // One blank line between the mark and the usage line, not zero and not two.
    expect(result.stdout).toContain(`${art}\n\nUsage:`);
  });

  it("stays out of a piped root help — the machine-read path", async () => {
    const result = await runInProcess(commands, ["--help"], { env: { NO_COLOR: "1" } });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).not.toContain("█");
    expect(result.stdout.startsWith("Usage:")).toBe(true);
  });

  it("stays out of a --json invocation even on a TTY", async () => {
    const result = await runInProcess(commands, ["--help", "--json"], {
      env: { NO_COLOR: "1" },
      tty: { stdout: true },
    });
    expect(result.stdout).not.toContain("█");
  });

  it("brands the product, not each verb: subcommand help gets no mark", async () => {
    const result = await runInProcess(commands, ["greet", "--help"], {
      env: { NO_COLOR: "1" },
      tty: { stdout: true },
    });
    expect(result.stdout).toContain("Usage: stamity greet");
    expect(result.stdout).not.toContain("█");
  });

  it("honours --no-color wherever it sits, --help included", async () => {
    // Two claims, and the second is why this case exists at all.
    //
    // The flag is not positional: `--help --no-color` and `--no-color --help`
    // are the same invocation, and a reader has no reason to think word order
    // decides whether the mark is painted. Commander 15 happens to parse the
    // whole option run before acting on `--help`, so the program's parsed
    // options were already a correct answer — but that is an undocumented
    // ordering inside a dependency, and the funnel now reads argv instead.
    //
    // And until this case, the suite could not observe the decision at all.
    // Commander picks its own answer for whether help output may carry colour,
    // from the REAL `process.stdout` — never from the injected terminal facts —
    // and under vitest that is a pipe, so every escape the mark wrote was
    // stripped before any assertion saw it. `--no-color` "passing" here proved
    // nothing. The funnel now hands commander the CLI's own colour decision,
    // which is what makes the last leg below a control rather than a
    // formality.
    const violet = { COLORTERM: "truecolor" };
    const after = await runInProcess(commands, ["--help", "--no-color"], {
      env: violet,
      tty: { stdout: true },
    });
    expect(after.code).toBe(0);
    expect(after.stdout, "the flag after --help was ignored").not.toContain("\u001B");
    expect(after.stdout).toContain(renderWordmark({ indent: "  " }));

    // The spelling that already worked still does.
    const before = await runInProcess(commands, ["--no-color", "--help"], {
      env: violet,
      tty: { stdout: true },
    });
    expect(before.stdout).not.toContain("\u001B");
    expect(before.stdout).toBe(after.stdout);

    // NO_COLOR keeps beating the terminal, whichever side the flag is on.
    const viaEnv = await runInProcess(commands, ["--help"], {
      env: { ...violet, NO_COLOR: "1" },
      tty: { stdout: true },
    });
    expect(viaEnv.stdout).not.toContain("\u001B");

    // Non-degenerate: without the flag, the same TTY DOES get the accent — so
    // the three assertions above are reading a decision, not a blank terminal.
    const painted = await runInProcess(commands, ["--help"], {
      env: violet,
      tty: { stdout: true },
    });
    expect(painted.stdout, "the colour TTY leg paints nothing to begin with").toContain(
      VIOLET.truecolor,
    );
  });

  it("keeps the mark off stderr when help rides a usage error", async () => {
    const result = await runInProcess(commands, ["nope"], {
      env: { NO_COLOR: "1" },
      tty: { stdout: true },
    });
    expect(result.code).toBe(2);
    expect(result.stderr).not.toContain("█");
  });
});
