import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import {
  BANNER_COLUMNS,
  BANNER_ROWS,
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
 * 2. Ink carries NO escape at all, so it inherits the reader's theme; exactly
 *    one run is colored, and stripping every escape from a colored rendering
 *    returns the plain bytes unchanged.
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
      "        ██                      ██  ██
      ▄▄▄▄▄▄ ▄██▄▄ ▄▄▄▄▄▄▄ ▄▄▄▄▄▄▄▄▄▄ ▄▄ ▄██▄▄ ▄▄  ▄▄
      ██▀▀▀▀ ▀██▀▀ ██▀▀▀██ ██▀▀██▀▀██ ██ ▀██▀▀ ██  ██
      ██████  ██   ██   ██ ██  ██  ██ ██  ██   ██  ██
      ▄▄▄▄██  ██▄▄ ██▄▄▄██ ██  ██  ██ ██  ██▄▄ ██▄▄██
      ▀▀▀▀▀▀  ▀▀▀▀ ▀▀▀▀▀▀▀ ▀▀  ▀▀  ▀▀ ▀▀  ▀▀▀▀ ▀▀▀▀██
                                                 ▄▄██"
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
    // Contract change (operator decision): the accent was the crossbar's left
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
    // Five cells per text row, the crossbar's width: arm, stem, stem, arm, arm.
    expect(colored).toEqual(["▄██▄▄", "▀██▀▀"]);
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

  it("keeps the mark off stderr when help rides a usage error", async () => {
    const result = await runInProcess(commands, ["nope"], {
      env: { NO_COLOR: "1" },
      tty: { stdout: true },
    });
    expect(result.code).toBe(2);
    expect(result.stderr).not.toContain("█");
  });
});
