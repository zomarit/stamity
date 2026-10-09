import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanAddedLines } from "../../src/change/scan.ts";

/**
 * p5e-secret-scan (REQ-FLOW-066): the secret scan of a change's added lines.
 *
 * Every secret-shaped value here is built at run time from fragments (the
 * sign-off on plan/57), so no line of this file carries one and `gate scan`
 * over this file's own added lines finds nothing; the last case proves it.
 * The bodies come from a seeded generator over upper-case letters and digits,
 * so a fragment of one cannot turn up by chance in a lower-case path or a hex id.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** `length` characters from {@link ALPHABET}, the same for the same seed: fixture data, never a credential. */
function body(length: number, seed = 7): string {
  let state = seed;
  let out = "";
  for (let at = 0; at < length; at += 1) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    out += ALPHABET[state % ALPHABET.length] ?? "A";
  }
  return out;
}

const FORGE_TOKEN = ["gh", "p", "_", body(36)].join("");
const PASS = ["pass", "word"].join("");
const KEY = ["api", "Key"].join("");
const INTEGRITY_512 = ["sha", "512-", body(86, 11), "=="].join("");
const INTEGRITY_384 = ["sha", "384-", body(64, 13)].join("");
const INTEGRITY_256 = ["sha", "256-", body(43, 17), "="].join("");

/** One file of added lines, numbered from `from`. */
const file = (path: string, lines: readonly string[], from = 1) => ({
  path,
  added: lines.map((text, at) => ({ line: from + at, text })),
});

describe("scanAddedLines", () => {
  it("names the path, line and rule of a source-forge token in an added assignment, and no part of the value", () => {
    const hits = scanAddedLines([file("src/a.ts", ["export {};", `const t = "${FORGE_TOKEN}";`])]);

    expect(hits).toEqual([{ path: "src/a.ts", line: 2, rule: "github-token" }]);
    expect(JSON.stringify(hits)).not.toContain(FORGE_TOKEN.slice(4, 12));
  });

  it("reads a credential name beside a long value as context: the name and value pair is extracted first", () => {
    const value = body(40, 23);

    expect(scanAddedLines([file("src/a.ts", [`const API_TOKEN = "${value}";`])])).toEqual([
      { path: "src/a.ts", line: 1, rule: "high-entropy-string" },
    ]);
    // The same value under a name with no credential word is no hit: the context came from the pair.
    expect(scanAddedLines([file("src/a.ts", [`const LABEL = "${value}";`])])).toEqual([]);
  });

  it("meets the anchored bearer pattern with a string literal's value, alone on its line", () => {
    const bearer = ["Bear", "er ", body(30, 29)].join("");

    expect(scanAddedLines([file("src/a.ts", [`  "${bearer}",`])])).toEqual([{ path: "src/a.ts", line: 1, rule: "bearer-token" }]);
    expect(scanAddedLines([file("notes.txt", [bearer])])).toEqual([{ path: "notes.txt", line: 1, rule: "bearer-token" }]);
  });

  it("reads typed code as a name and its type, never as an inline assignment", () => {
    const typed = [
      `  ${PASS}: string;`,
      `  ${KEY}?: string;`,
      `export function login(user: string, ${PASS}: string, ${KEY} = options.${KEY}): void {}`,
    ];

    expect(scanAddedLines([file("src/auth.ts", typed)])).toEqual([]);
  });

  it("reads a flag and its argument as a pair", () => {
    expect(scanAddedLines([file("scripts/x.sh", [`tool --token ${FORGE_TOKEN} --verbose`])])).toEqual([
      { path: "scripts/x.sh", line: 1, rule: "github-token" },
    ]);
  });

  it("keeps a URL whole, so credentials in a connection string are found", () => {
    const url = ["postgres", "://", "app:", body(12, 31), "@db.internal/app"].join("");

    expect(scanAddedLines([file(".env.example", [`DATABASE_URL=${url}`])])).toEqual([
      { path: ".env.example", line: 1, rule: "credentialed-connection-string" },
    ]);
  });

  it("passes no lockfile integrity hash to the patterns, and still finds a secret on the next line", () => {
    const lockfile = file("package-lock.json", [`      "integrity": "${INTEGRITY_512}",`, `      "token": "${FORGE_TOKEN}"`], 40);

    expect(scanAddedLines([lockfile])).toEqual([{ path: "package-lock.json", line: 41, rule: "github-token" }]);
  });

  it.each([
    ["sha384, unpadded", `"integrity": "${INTEGRITY_384}",`],
    ["sha256, one pad", `"integrity": "${INTEGRITY_256}",`],
    ["sha512 in YAML", `    resolution: {integrity: ${INTEGRITY_512}}`],
    ["sha512 alone on the line", INTEGRITY_512],
  ])("passes no integrity hash on: %s", (_label, line) => {
    expect(scanAddedLines([file("pnpm-lock.yaml", [line])])).toEqual([]);
  });

  it("scans a value one character off an integrity hash's length as any other value", () => {
    const offByOne = ["sha", "512-", body(87, 11), "="].join("");

    expect(scanAddedLines([file("package-lock.json", [`"integrity": "${offByOne}",`])])).toEqual([
      { path: "package-lock.json", line: 1, rule: "high-entropy-string" },
    ]);
  });

  it("reports one hit per rule and line, across two files and two hunks of one file", () => {
    const hits = scanAddedLines([
      file("src/a.ts", [`const a = "${FORGE_TOKEN}"; const b = "${FORGE_TOKEN}";`], 3),
      file("src/b.ts", ["export {};"], 1),
      file("src/a.ts", [`x("${FORGE_TOKEN}")`], 9),
    ]);

    expect(hits).toEqual([
      { path: "src/a.ts", line: 3, rule: "github-token" },
      { path: "src/a.ts", line: 9, rule: "github-token" },
    ]);
  });

  it("scans a line longer than the pair bound whole, so a token at its end is still found", () => {
    const line = `${"a=1,".repeat(1_500)}"${FORGE_TOKEN}"`;

    expect(scanAddedLines([file("dist/x.min.js", [line])])).toEqual([{ path: "dist/x.min.js", line: 1, rule: "github-token" }]);
  });

  it("finds nothing in an empty change or in blank lines", () => {
    expect(scanAddedLines([])).toEqual([]);
    expect(scanAddedLines([file("src/a.ts", ["", "   "])])).toEqual([]);
  });

  it("finds no hit in this unit's own test files, read whole as added lines", () => {
    const sources = ["./scan.test.ts", "../cli/commands/gate.test.ts"].map((relative) => {
      const url = new URL(relative, import.meta.url);
      return file(relative, readFileSync(url, "utf8").split("\n"));
    });

    expect(sources.every((source) => source.added.length > 100)).toBe(true);
    expect(scanAddedLines(sources)).toEqual([]);
  });
});
