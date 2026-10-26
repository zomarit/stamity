import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RECORD_BASE_PATTERN,
  RECORD_BRANCH_PATTERN,
  RECORD_HEAD_LINES,
  RECORD_MODE_PATTERN,
  RECORD_RESUMES_PATTERN,
} from "../../src/runs/layout.ts";
import { readRecordHead, readsUnattended } from "../../src/runs/resumeCard.ts";

/**
 * The run record's head reads the run's mode, branch, base and resumed run
 * (REQ-CTX-012, REQ-FLOW-089): the six lines Frame writes among the first 15,
 * each bare at column 0, and a missing or unknown `Mode:` reads as `null`, which
 * every reader takes as attended. The hook twin reads the same head; that half
 * is proven in `resumeCardParity.test.ts`, beside the card it feeds.
 */

const SHA = "02e040eb29de0468d90febe856ae205f31d6632d";
/** A full commit id in a SHA-256 repository: 64 hex digits. */
const SHA256 = "02e040eb29de0468d90febe856ae205f31d6632d0123456789abcdef01234567";

/** A head as Frame writes it in 1.16.0, every line bare at column 0. */
function sixLineHead(lines: { mode?: string; branch?: string; base?: string; resumes?: string } = {}): string {
  return [
    "# Run 2026-10-16_x",
    "",
    "Status: in progress — opened 2026-10-16T02:00Z",
    "Plan: docs/plans/021-cloud-runs-01.md",
    `Base: ${lines.base ?? SHA}`,
    `Branch: ${lines.branch ?? "stamity/2026-10-16_x"}`,
    "Invocation: /st-work --unattended docs/plans/021-cloud-runs-01.md",
    `Mode: ${lines.mode ?? "unattended"}`,
    ...(lines.resumes === undefined ? [] : [`Resumes: ${lines.resumes}`]),
    "",
    "## Frame",
    "",
  ].join("\n");
}

/** `n` filler lines, so the line that follows sits on line n + 1. */
function leadLines(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `line ${i + 1}`);
}

describe("the record head's mode, branch, base and resumes lines (REQ-CTX-012)", () => {
  it("reads an unattended six-line head whole", () => {
    expect(readRecordHead(sixLineHead({ resumes: "2026-10-15_cloud-runs" }))).toEqual({
      status: "in progress — opened 2026-10-16T02:00Z",
      inProgress: true,
      plan: "docs/plans/021-cloud-runs-01.md",
      invocation: "/st-work --unattended docs/plans/021-cloud-runs-01.md",
      mode: "unattended",
      branch: "stamity/2026-10-16_x",
      base: SHA,
      resumes: "2026-10-15_cloud-runs",
    });
  });

  it("reads `Mode: attended`, and either value in any case as the lower-case word", () => {
    expect(readRecordHead(sixLineHead({ mode: "attended" })).mode).toBe("attended");
    expect(readRecordHead(sixLineHead({ mode: "UNATTENDED" })).mode).toBe("unattended");
    expect(readRecordHead("mode: Attended\n").mode).toBe("attended");
  });

  it("reads no mode from a missing line, another value, a longer word or an indented line", () => {
    const noMode = sixLineHead().replace(/^Mode: .*\n/m, "");
    expect(readRecordHead(noMode).mode).toBeNull();
    expect(readRecordHead(sixLineHead({ mode: "sometimes" })).mode).toBeNull();
    expect(readRecordHead(sixLineHead({ mode: "unattendedly" })).mode).toBeNull();
    expect(readRecordHead(sixLineHead({ mode: "" })).mode).toBeNull();
    expect(readRecordHead("  Mode: unattended\n").mode).toBeNull();
  });

  it("takes the base sha before a trailing ellipsis, and nothing that is not 7 to 64 hex digits", () => {
    expect(readRecordHead(sixLineHead({ base: "02e040eb… (the plan's stamp)" })).base).toBe("02e040eb");
    expect(readRecordHead(sixLineHead({ base: "02e040e" })).base).toBe("02e040e");
    expect(readRecordHead(sixLineHead({ base: "02e040" })).base).toBeNull();
    expect(readRecordHead(sixLineHead({ base: SHA256 })).base).toBe(SHA256);
    expect(readRecordHead(sixLineHead({ base: `${SHA256}0` })).base).toBeNull();
    expect(readRecordHead(sixLineHead({ base: "main" })).base).toBeNull();
  });

  it("takes the branch and the resumed run as their first word", () => {
    const head = readRecordHead(sixLineHead({ branch: "stamity/2026-10-16_x (pushed)", resumes: "2026-10-15_y — file 1" }));
    expect(head.branch).toBe("stamity/2026-10-16_x");
    expect(head.resumes).toBe("2026-10-15_y");
    expect(readRecordHead(sixLineHead({ branch: "" })).branch).toBeNull();
  });

  it("lets the first mode, branch, base and resumes line each win", () => {
    const text = [
      "Mode: attended",
      "Mode: unattended",
      "Branch: first",
      "Branch: second",
      "Base: aaaaaaa",
      "Base: bbbbbbb",
      "Resumes: one",
      "Resumes: two",
      "",
    ].join("\n");
    expect(readRecordHead(text)).toMatchObject({ mode: "attended", branch: "first", base: "aaaaaaa", resumes: "one" });
  });

  it("reads the four lines on line 15 and ignores them on line 16", () => {
    const tail = ["Mode: unattended", "Branch: b", `Base: ${SHA}`, "Resumes: r"];
    expect(RECORD_HEAD_LINES).toBe(15);
    for (const [index, line] of tail.entries()) {
      const key = (["mode", "branch", "base", "resumes"] as const)[index];
      if (key === undefined) throw new Error("four keys for four lines");
      expect(readRecordHead([...leadLines(14), line, ""].join("\n"))[key]).not.toBeNull();
      expect(readRecordHead([...leadLines(15), line, ""].join("\n"))[key]).toBeNull();
    }
  });

  it("reads a 1.15.0 record, which has none of the four lines, as before: every new field null", () => {
    const text = ["# Run", "", "Status: in progress", "Plan: docs/plans/020-x.md", "Invocation: /st-work docs/plans/020-x.md", ""].join("\n");
    expect(readRecordHead(text)).toEqual({
      status: "in progress",
      inProgress: true,
      plan: "docs/plans/020-x.md",
      invocation: "/st-work docs/plans/020-x.md",
      mode: null,
      branch: null,
      base: null,
      resumes: null,
    });
  });

  it("reads CRLF line endings and a BOM as LF", () => {
    // The BOM is built from its code point, so this file holds no invisible character itself.
    const crlf = `${String.fromCodePoint(0xfeff)}${sixLineHead({ resumes: "r" }).replaceAll("\n", "\r\n")}`;
    expect(readRecordHead(crlf)).toEqual(readRecordHead(sixLineHead({ resumes: "r" })));
  });

  it("matches each line shape as the plan's interface cell writes it", () => {
    // The literals pin the four patterns, so a widening (no anchor, no case
    // flag, a looser sha) is a visible edit here too.
    expect(RECORD_MODE_PATTERN).toEqual(/^mode:\s*(attended|unattended)\b/i);
    expect(RECORD_BRANCH_PATTERN).toEqual(/^branch:\s*(\S+)/i);
    expect(RECORD_BASE_PATTERN).toEqual(/^base:\s*([0-9a-f]{7,64})\b/i);
    expect(RECORD_RESUMES_PATTERN).toEqual(/^resumes:\s*(\S+)/i);
  });
});

/** The command modules, which read the run's mode through the one reader below. */
const COMMANDS_DIR = fileURLToPath(new URL("../../src/cli/commands/", import.meta.url));

describe("whether a run is unattended, from the record head's mode and the variable (REQ-FLOW-120, review/84)", () => {
  it("reads the variable unset, empty, false or 0 in any case and spacing as attended, and any other value as unattended", () => {
    for (const flag of [undefined, "", "false", "0", "FALSE ", " 0 "]) expect(readsUnattended(null, flag), JSON.stringify(flag)).toBe(false);
    for (const flag of ["1", "yes", "true"]) expect(readsUnattended(null, flag), flag).toBe(true);
  });

  it("lets the record's Mode: win over the variable either way", () => {
    expect(readsUnattended("attended", "1")).toBe(false);
    expect(readsUnattended("unattended", "0")).toBe(true);
    expect(readsUnattended(readRecordHead(sixLineHead({ mode: "attended" })).mode, "yes")).toBe(false);
    expect(readsUnattended(readRecordHead(sixLineHead()).mode, undefined)).toBe(true);
  });

  it("is the one reader: no command module keeps a local copy", () => {
    const copies = readdirSync(COMMANDS_DIR)
      .filter((name) => name.endsWith(".ts"))
      .filter((name) => /\bfunction readsUnattended\b/.test(readFileSync(join(COMMANDS_DIR, name), "utf8")));
    expect(copies).toEqual([]);
  });
});
