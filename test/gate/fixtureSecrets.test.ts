import { execFileSync } from "node:child_process";
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { SECRET_PATTERNS } from "../../src/mcp/secretScan.ts";
// @ts-expect-error — the gate is a plain .mjs script with no type declarations, and it stays
// that way on purpose: it must run standalone against an arbitrary `--root`.
import { RULES } from "../../scripts/leak-gate.mjs";

/**
 * REQ-PLUGIN-033 (fixture rule): a fixture that needs a credential shape builds it at run time.
 *
 * The leak gate used to exempt the suites that carried example credentials, by path and per shape
 * (`SHAPE_FIXTURES`), and the scanner's own test corpus with them. A fork's gate, or any scanner
 * that does not carry those exemptions, reads every one of those lines as a leak. So the suites now
 * assemble each example at run time (`["AKIA", "..."].join("")`, a URL split at its `@`), which
 * leaves the value a test sees byte-identical and leaves no credential shape in the source.
 *
 * This guard keeps it that way. It reads with the gate's own credential rules, each with its
 * trailing boundary dropped, so a near-miss the gate's bounded shape lets through (a token two
 * characters too long) is still caught here; and with one more matcher, a URL whose userinfo holds
 * a `user:password` pair. There is no exemption for `test/`: the remedy for a hit is run-time
 * assembly. A hit prints `path:line rule` and never the matched text, since the text is the
 * credential shape the guard exists to keep out of logs as well as the tree. This file holds no
 * literal of any shape for the same reason: every probe below is assembled.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The gate's credential-shape rules: the ones mirrored from the engine's `SECRET_PATTERNS`. */
const CREDENTIAL_IDS = [
  "aws-access-key-id",
  "github-token",
  "github-fine-grained-token",
  "gitlab-access-token",
  "slack-token",
  "stripe-api-key",
  "sk-prefixed-api-key",
  "pem-private-key",
  "linear-api-key",
  "sentry-auth-token",
  "credentialed-connection-string",
];

/** The trailing boundaries a credential rule may end with; the empty tail is a rule with none. */
const TAILS = ["\\b", "(?![A-Za-z0-9])"];

/** A URL whose userinfo carries a `user:password` pair; `${TOKEN}` and `<user>` spellings are not one. */
const USERINFO_URL: Matcher = {
  rule: "userinfo-url",
  pattern: /[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._~%!*+,;=-]+:[A-Za-z0-9._~%!*+,;=-]+@/i,
};

interface Matcher {
  rule: string;
  pattern: RegExp;
}

interface Hit {
  path: string;
  line: number;
  rule: string;
}

interface GateRule {
  id: string;
  pattern: RegExp;
}

const gateRules = RULES as readonly GateRule[];

function gateRule(id: string): GateRule {
  const rule = gateRules.find((candidate) => candidate.id === id);
  if (rule === undefined) throw new Error(`the leak gate has no rule ${id}`);
  return rule;
}

/** A gate rule's source with its trailing boundary dropped, and the tail it dropped. */
function unbounded(source: string): { source: string; tail: string } {
  const tail = TAILS.find((candidate) => source.endsWith(candidate)) ?? "";
  return { source: source.slice(0, source.length - tail.length), tail };
}

/** One matcher per credential rule, unbounded, and stateless (no `g`), so `test` never carries an index. */
const CREDENTIAL_MATCHERS: Matcher[] = CREDENTIAL_IDS.map((id) => {
  const { pattern } = gateRule(id);
  return { rule: id, pattern: new RegExp(unbounded(pattern.source).source, pattern.flags.replace("g", "")) };
});

/**
 * Every line of every named file that a matcher reads, as `{ path, line, rule }`, never the text.
 * A file holding a NUL byte is skipped (a binary or non-UTF-8 file: the leak gate's decoders read
 * it), and so is a path that is no regular file, or no file at all by the time it is read.
 */
function scanFiles(root: string, relPaths: readonly string[], matchers: readonly Matcher[]): Hit[] {
  const hits: Hit[] = [];
  for (const path of relPaths) {
    const full = join(root, path);
    let bytes: Buffer;
    try {
      if (!lstatSync(full).isFile()) continue;
      bytes = readFileSync(full);
    } catch {
      continue;
    }
    if (bytes.includes(0)) continue;
    bytes
      .toString("utf8")
      .split(/\r?\n/)
      .forEach((text, index) => {
        for (const { rule, pattern } of matchers) {
          if (pattern.test(text)) hits.push({ path, line: index + 1, rule });
        }
      });
  }
  return hits;
}

/** This checkout's files under the given roots: tracked, plus untracked ones git does not ignore. */
function treeFiles(...roots: string[]): string[] {
  const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...roots], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return [...new Set(listed.split("\0").filter(Boolean))];
}

const where = (hit: Hit): string => `${hit.path}:${hit.line} ${hit.rule}`;

/** One run-time canary per credential rule, each assembled so this file carries none. */
const CANARIES: Record<string, string> = {
  "aws-access-key-id": ["AKIA", "IOSFODNN7EXAMPLE"].join(""),
  "github-token": ["gh", "p_", "a".repeat(38)].join(""),
  "github-fine-grained-token": ["github", "_pat_", "A".repeat(82)].join(""),
  "gitlab-access-token": ["glpat", "-", "a".repeat(20)].join(""),
  "slack-token": ["xox", "b-", "0".repeat(10)].join(""),
  "stripe-api-key": ["sk", "_test_", "a".repeat(16)].join(""),
  "sk-prefixed-api-key": ["sk", "-", "a".repeat(20)].join(""),
  "pem-private-key": ["-----BEGIN RSA PRIVATE", "KEY-----"].join(" "),
  "linear-api-key": ["lin", "_api_", "b".repeat(40)].join(""),
  "sentry-auth-token": ["sntrys", "_", "c".repeat(40)].join(""),
  "credentialed-connection-string": ["postgres://u:p", "@h/db"].join(""),
};

describe("fixture secrets (REQ-PLUGIN-033)", () => {
  let scratch: string | undefined;

  afterEach(() => {
    if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
    scratch = undefined;
  });

  it("reads every credential rule of the leak gate, each differing from the gate's only by its trailing boundary", () => {
    const engineIds = new Set(SECRET_PATTERNS.map((pattern) => pattern.id));
    // The gate's credential family is the rules it mirrors from the engine; a twelfth fails here.
    expect(gateRules.map((rule) => rule.id).filter((id) => engineIds.has(id))).toEqual(CREDENTIAL_IDS);
    for (const id of CREDENTIAL_IDS) {
      const bounded = gateRule(id).pattern.source;
      const { source, tail } = unbounded(bounded);
      expect(`${source}${tail}`, id).toBe(bounded);
      expect(["", ...TAILS], id).toContain(tail);
      expect(TAILS.some((candidate) => source.endsWith(candidate)), id).toBe(false);
    }
    // Two of the shapes end on a literal, not a boundary, so their matcher is the gate's own.
    expect(unbounded(gateRule("pem-private-key").pattern.source).tail).toBe("");
    expect(unbounded(gateRule("github-token").pattern.source).tail).toBe("\\b");
  });

  it("matches one run-time canary per rule, including a near-miss the gate's bounded shape lets through", () => {
    for (const { rule, pattern } of CREDENTIAL_MATCHERS) {
      expect(pattern.test(CANARIES[rule] ?? ""), rule).toBe(true);
    }
    // A forge token two characters too long: the gate's `\b` refuses it, the guard does not.
    const tooLong = CANARIES["github-token"] ?? "";
    expect(tooLong).toHaveLength(42);
    const bounded = gateRule("github-token").pattern;
    expect(new RegExp(bounded.source, bounded.flags.replace("g", "")).test(tooLong)).toBe(false);
  });

  it("finds no credential shape written out anywhere under test/", () => {
    const hits = scanFiles(REPO_ROOT, treeFiles("test"), CREDENTIAL_MATCHERS);
    expect(
      hits.map(where),
      "a fixture spells a credential shape: assemble it at run time (a join the shape cannot span)",
    ).toEqual([]);
  });

  it("finds no URL carrying a user:password pair under test/, scripts/, src/ or .github/", () => {
    const hits = scanFiles(REPO_ROOT, treeFiles("test", "scripts", "src", ".github"), [USERINFO_URL]);
    expect(hits.map(where), "a URL spells its userinfo: split it at the `@`, or write a placeholder").toEqual([]);
  });

  it("reads a userinfo pair as one hit, and a template, a placeholder, a binary file and a missing one as none", () => {
    scratch = mkdtempSync(join(tmpdir(), "fixture-secrets-"));
    const url = ["https://u:p", "@h/x"].join("");
    writeFileSync(join(scratch, "pair.ts"), `const a = 1\nconst url = "${url}"\n`);
    writeFileSync(join(scratch, "template.ts"), ["const url = `https://$", "{TOKEN}@h/x`\n"].join(""));
    writeFileSync(join(scratch, "placeholder.md"), "Set it to `https://<user>:<token>@h/x`.\n");
    writeFileSync(join(scratch, "binary.bin"), Buffer.concat([Buffer.from([0x00]), Buffer.from(url)]));

    const hits = scanFiles(
      scratch,
      ["pair.ts", "template.ts", "placeholder.md", "binary.bin", "missing.ts"],
      [USERINFO_URL],
    );

    expect(hits).toEqual([{ path: "pair.ts", line: 2, rule: "userinfo-url" }]);
    expect(where(hits[0] as Hit)).not.toContain(url);
  });
});
