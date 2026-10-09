import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { linesPastCap, scanAddedLines } from "../../src/change/scan.ts";

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

  // review/135: a long line keeps its pairs, read in overlapping windows, so a name or an anchor still gives context.
  it.each([
    ["a credential-named value", `{${["to", "ken"].join("")}:"${body(40, 23)}"}`, "high-entropy-string"],
    ["a bearer header", `headers:{Authorization:"${["Bear", "er "].join("")}${body(30, 29)}"}`, "bearer-token"],
  ])("finds %s past column 4,096 of a minified line, at every offset around the window edges", (_label, pair, rule) => {
    for (const at of [4_000, 4_090, 4_096, 4_100, 7_160, 7_170, 12_300, 50_000]) {
      const line = `${"a=1,".repeat(Math.ceil(at / 4)).slice(0, at)}${pair},b=2${",c=3".repeat(400)}`;
      expect(scanAddedLines([file("dist/x.min.js", [line])]), `${rule} at ${at}`).toEqual([{ path: "dist/x.min.js", line: 1, rule }]);
    }
  });

  // review/135: past the hard cap a line is not read, and is named so the scan fails closed.
  it("names a line past the hard cap as unread, reads none of it, and still reports a hit on another line", () => {
    const files = [file("dist/x.min.js", ["a".repeat(300_000), `const t = "${FORGE_TOKEN}";`]), file("dist/y.js", ["b".repeat(200_000)])];

    expect(linesPastCap(files)).toEqual([{ path: "dist/x.min.js", line: 1 }]);
    expect(scanAddedLines(files)).toEqual([{ path: "dist/x.min.js", line: 2, rule: "github-token" }]);
  });

  // review/95: the joined name and value meet the two inline-assignment patterns for a quoted value or a config file.
  describe("a credential-named assignment of a short value", () => {
    const SHORT = body(10, 41);
    const HEX_KEY = body(32, 43).toLowerCase().replace(/[^0-9a-f]/g, "a");
    const UPPER = PASS.toUpperCase();

    it.each([
      ["a quoted value in code", "src/db.ts", `const DB_${UPPER} = "${SHORT}";`, "inline-password-assignment"],
      ["a quoted 32-hex key in code", "src/client.ts", `export const ${KEY.toUpperCase()} = "${HEX_KEY}";`, "inline-api-key-assignment"],
      ["an unquoted .env entry", ".env.production", `DB_${UPPER}=${SHORT}`, "inline-password-assignment"],
      ["an unquoted YAML entry", "compose.yaml", `      ${PASS}: ${SHORT}`, "inline-password-assignment"],
      ["a JSON key", "config/app.json", `  "${PASS}": "${SHORT}",`, "inline-password-assignment"],
      ["an INI entry", "settings.ini", `${PASS} = ${SHORT}`, "inline-password-assignment"],
      ["a properties entry", "app.properties", `db.${PASS}=${SHORT}`, "inline-password-assignment"],
    ])("hits %s", (_label, path, line, rule) => {
      expect(scanAddedLines([file(path, [line])])).toEqual([{ path, line: 1, rule }]);
    });

    it.each([
      ["an unquoted value in code", "src/db.ts", `const ${PASS} = options.${PASS};`],
      ["a placeholder in YAML", "compose.yaml", `      ${PASS}: ${"$"}{{ secrets.DB }}`],
      ["a placeholder in .env", ".env", `DB_${UPPER}=${"$"}{DB_${UPPER}}`],
      ["a quoted placeholder in JSON", "config/app.json", `  "${PASS}": "${"$"}{DB}",`],
      ["an empty quoted value", "src/db.ts", `const ${PASS} = "";`],
      ["a JSON null", "config/app.json", `  "${PASS}": null,`],
      // The 500-commit measurement's two new hits: a code span closing after the key is no quoted value.
      ["a Markdown code span ending in a key", "docs/plan.md", `holding a literal \`${["api", "_key"].join("")}:\` line, **then** exit 0, \`a.bak\` holds`],
    ])("passes %s", (_label, path, line) => {
      expect(scanAddedLines([file(path, [line])])).toEqual([]);
    });

    // review/132: the files where an unquoted NAME=value is the normal syntax read the name beside the value too.
    it.each([
      ["a shell script's export line", "scripts/deploy.sh", `export DB_${UPPER}=${SHORT}`],
      ["a Dockerfile ENV line", "Dockerfile", `ENV DB_${UPPER}=${SHORT}`],
      ["a Dockerfile ARG line", "docker/api.Dockerfile", `ARG DB_${UPPER}=${SHORT}`],
      ["a Containerfile ENV line", "Containerfile", `ENV DB_${UPPER}=${SHORT}`],
      ["a direnv entry", ".envrc", `export DB_${UPPER}=${SHORT}`],
      ["a .cnf entry", "etc/my.cnf", `${PASS}=${SHORT}`],
      ["a .conf entry", "etc/app.conf", `db_${PASS} = ${SHORT}`],
    ])("hits %s", (_label, path, line) => {
      expect(scanAddedLines([file(path, [line])])).toEqual([{ path, line: 1, rule: "inline-password-assignment" }]);
    });

    // review/132: a value that opens with `$` is an expansion, no literal.
    it.each([
      ["a positional parameter", "scripts/deploy.sh", `export DB_${UPPER}=$1`],
      ["a command substitution", "scripts/deploy.sh", `export DB_${UPPER}=$(cat /run/secrets/db)`],
      ["a variable in a Dockerfile ENV line", "Dockerfile", `ENV DB_${UPPER}=${"$"}DB_${UPPER}`],
      ["a variable in .envrc", ".envrc", `export DB_${UPPER}="${"$"}VAULT_DB"`],
    ])("passes %s", (_label, path, line) => {
      expect(scanAddedLines([file(path, [line])])).toEqual([]);
    });

    // review/136: a value that is wholly a {{ … }} template placeholder is no literal, as ${…} is.
    it.each([
      ["an Ansible variable, quoted", "roles/db/defaults/main.yml", `db_${PASS}: "{{ vault_db_${PASS} }}"`],
      ["a Helm value, unquoted", "charts/app/templates/secret.yaml", `  ${PASS}: {{ .Values.db.${PASS} | quote }}`],
      ["a Mustache placeholder in .env", ".env", `DB_${UPPER}={{db_${PASS}}}`],
      ["a Go template in code", "src/db.ts", `const DB_${UPPER} = "{{ .Secret }}";`],
    ])("passes %s", (_label, path, line) => {
      expect(scanAddedLines([file(path, [line])])).toEqual([]);
    });

    it("still hits a short credential beside a placeholder on the same line", () => {
      const line = `  ${PASS}: ${SHORT} # was {{ .Values.x }}`;
      expect(scanAddedLines([file("charts/app/values.yaml", [line])])).toEqual([
        { path: "charts/app/values.yaml", line: 1, rule: "inline-password-assignment" },
      ]);
    });
  });

  // review/126: a pair whose name is a file path gives no credential context; its value is still scanned.
  describe("a value keyed by a file path", () => {
    const DIGEST = body(64, 61);
    const AUTHOR = ["au", "thor"].join("");

    it.each([
      ["a JSON key holding a slash", "evals/runs/x/inputs.json", `      "evals/golden/spec-${AUTHOR}-contract.md": "${DIGEST}",`],
      ["a snapshot key holding a slash", "test/__snapshots__/x.test.ts.snap", `  ".claude/agents/spec-${AUTHOR}.md": "${DIGEST} 11479 bytes",`],
      ["a key ending in a file extension", "inputs.json", `  "spec-${AUTHOR}.md": "${DIGEST}",`],
      ["a Windows path key", "inputs.json", `  "evals\\golden\\${AUTHOR}": "${DIGEST}",`],
    ])("passes %s", (_label, path, line) => {
      expect(scanAddedLines([file(path, [line])])).toEqual([]);
    });

    it.each([
      ["a credential key that is no path", "config/app.json", `  "${AUTHOR}_${["to", "ken"].join("")}": "${DIGEST}",`, "high-entropy-string"],
      ["a property on an object", "src/a.ts", `this.${["to", "ken"].join("")} = "${DIGEST}";`, "high-entropy-string"],
      ["an anchored token keyed by a path", "inputs.json", `  "docs/${AUTHOR}.md": "${FORGE_TOKEN}",`, "github-token"],
    ])("hits %s", (_label, path, line, rule) => {
      expect(scanAddedLines([file(path, [line])])).toEqual([{ path, line: 1, rule }]);
    });
  });

  // review/100: a comparison is not an assignment.
  it.each([
    ["a strict comparison", "src/auth.ts", `  if (${PASS} === confirm) return;`],
    ["a loose comparison with null", "src/auth.ts", `  if (${KEY} == null) throw new Error("missing");`],
    ["a negated comparison", "src/auth.ts", `  return ${KEY} !== undefined && ${PASS} != "";`],
    ["a Python comparison", "app/auth.py", `    if ${PASS} == confirm_${PASS}:`],
  ])("passes %s of a credential-named variable", (_label, path, line) => {
    expect(scanAddedLines([file(path, [line])])).toEqual([]);
  });

  // review/101: a name the pair extraction takes is scanned bare too.
  it("finds a source-forge token used as the user name of an unquoted URL", () => {
    const line = `git clone https://${FORGE_TOKEN}:x-oauth-basic@github.com/org/repo.git`;

    expect(scanAddedLines([file("scripts/clone.sh", [line])])).toEqual([{ path: "scripts/clone.sh", line: 1, rule: "github-token" }]);
  });

  // review/97: a quoted header string is split at its separator before matching.
  it("finds a bearer token inside a quoted header argument", () => {
    const header = ["Authori", "zation: ", "Bear", "er ", body(30, 47)].join("");

    expect(scanAddedLines([file("scripts/call.sh", [`curl -H "${header}" https://api.example.test/v1`])])).toEqual([
      { path: "scripts/call.sh", line: 1, rule: "bearer-token" },
    ]);
  });

  // review/99: yarn v1 and go.sum record content digests in their own line shapes.
  describe("lockfile digests outside the JSON and YAML shapes", () => {
    const GO_SUM_DIGEST = ["h", "1:", body(43, 53), "="].join("");

    it.each([
      ["yarn v1's integrity line", "yarn.lock", `  integrity ${INTEGRITY_512}`],
      ["a go.sum module line", "go.sum", `example.com/mod v1.2.3 ${GO_SUM_DIGEST}`],
      ["a go.sum go.mod line", "go.sum", `example.com/mod v1.2.3/go.mod ${GO_SUM_DIGEST}`],
    ])("passes %s", (_label, path, line) => {
      expect(scanAddedLines([file(path, [line])])).toEqual([]);
    });

    // review/134: NuGet's packages.lock.json records a base64 SHA-512 under contentHash for every package.
    const CONTENT_HASH = createHash("sha512").update("fixture").digest("base64");

    it("passes NuGet's contentHash line, and scans the same digest on any other line", () => {
      const line = `        "contentHash": "${CONTENT_HASH}",`;
      const offByOne = `        "contentHash": "${CONTENT_HASH.slice(1)}=",`;

      expect(scanAddedLines([file("src/App/packages.lock.json", [line])])).toEqual([]);
      expect(scanAddedLines([file("config/app.json", [line])])).toEqual([{ path: "config/app.json", line: 1, rule: "high-entropy-string" }]);
      expect(scanAddedLines([file("packages.lock.json", [`        "resolved": "${CONTENT_HASH}",`])])).toEqual([
        { path: "packages.lock.json", line: 1, rule: "high-entropy-string" },
      ]);
      expect(scanAddedLines([file("packages.lock.json", [offByOne])])).toEqual([
        { path: "packages.lock.json", line: 1, rule: "high-entropy-string" },
      ]);
    });

    // review/134: the other common lockfile digest forms already pass, each pinned so a pattern change shows.
    it.each(
      ((): [string, string][] => {
        const hex = (alg: string): string => createHash(alg).update("fixture").digest("hex");
        const b64 = (alg: string): string => createHash(alg).update("fixture").digest("base64");
        return [
          ["Cargo.lock", `checksum = "${hex("sha256")}"`],
          ["poetry.lock", `    {file = "pkg-1.0-py3-none-any.whl", hash = "sha256:${hex("sha256")}"},`],
          ["Pipfile.lock", `                "sha256:${hex("sha256")}",`],
          ["composer.lock", `                "shasum": "${hex("sha1")}"`],
          ["Gemfile.lock", `  rake (13.0.6) sha256=${hex("sha256")}`],
          ["pubspec.lock", `      sha256: "${hex("sha256")}"`],
          ["gradle/verification-metadata.xml", `            <sha256 value="${hex("sha256")}" origin="Generated by Gradle"/>`],
          ["gradle/verification-metadata.xml", `            <sha512 value="${hex("sha512")}" origin="Generated by Gradle"/>`],
          ["flake.lock", `        "narHash": "sha256-${b64("sha256")}",`],
        ];
      })(),
    )("passes a %s digest line", (path, line) => {
      expect(scanAddedLines([file(path, [line])])).toEqual([]);
    });

    it("scans a go.sum digest one character off its length as any other value", () => {
      const offByOne = ["h", "1:", body(45, 53), "="].join("");

      expect(scanAddedLines([file("go.sum", [`example.com/mod v1.2.3 ${offByOne}`])])).toEqual([
        { path: "go.sum", line: 1, rule: "high-entropy-string" },
      ]);
    });
  });

  // review/112: a line read from a commit since the base carries that commit.
  it("names the commit a history line came from", () => {
    expect(scanAddedLines([{ path: "src/a.ts", commit: "0123456789ab", added: [{ line: 4, text: `const t = "${FORGE_TOKEN}";` }] }])).toEqual([
      { path: "src/a.ts", line: 4, rule: "github-token", commit: "0123456789ab" },
    ]);
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
