import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  SECRET_PATTERNS,
  detectSecrets,
  formatSecretFindings,
  maskValue,
  scanValueForSecrets,
} from "../../src/mcp/secretScan.ts";

// Synthetic fixtures. Each is shaped like the credential it stands for and is
// deliberately not a usable key: the sequences are hand-built, not generated.
// TEST CHANGE, justified (REQ-PLUGIN-033): each one is assembled at run time, so this source
// carries no credential shape; the value every case reads is byte-identical to the old literal.
const AWS_KEY_ID = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
const FORGE_TOKEN = ["gh", "p_", "0123456789abcdefghijklmnopqrstuvwxyz"].join("");
const SK_API_KEY = ["sk", "-", "abcdefghijklmnopqrstuvwxyz012345"].join("");
const PEM_BODY_LINE = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4v";
const PEM_KEY = [
  ["-----BEGIN RSA PRIVATE", "KEY-----"].join(" "),
  PEM_BODY_LINE,
  "-----END RSA PRIVATE KEY-----",
].join("\n");

const expectMatch = (name: string, value: string, id: string): void => {
  expect(scanValueForSecrets(name, value).map((f) => f.patternId)).toContain(id);
};

describe("SECRET_PATTERNS", () => {
  it("gives every pattern a unique id and a description", () => {
    const ids = SECRET_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { id, description } of SECRET_PATTERNS) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
      expect(description.length).toBeGreaterThan(0);
    }
  });

  it("declares no global regex, so `test` stays stateless across calls", () => {
    // A `/g` pattern advances `lastIndex` on every `test`, which would make the
    // scanner alternate between hit and miss for one repeated value.
    for (const { id, pattern } of SECRET_PATTERNS) {
      expect(pattern.global, `${id} must not be global`).toBe(false);
      expect(pattern.sticky, `${id} must not be sticky`).toBe(false);
    }
  });
});

describe("scanValueForSecrets", () => {
  it.each([
    { label: "cloud access key id", name: "AWS_ACCESS_KEY_ID", value: AWS_KEY_ID, expected: ["aws-access-key-id"] },
    { label: "forge token", name: "FORGE_TOKEN", value: FORGE_TOKEN, expected: ["github-token"] },
    { label: "sk- api key", name: "MODEL_API_KEY", value: SK_API_KEY, expected: ["sk-prefixed-api-key"] },
    // The PEM body is itself a long base64 run, so it legitimately reports two
    // patterns — asserted in full here and again in the dedup case below.
    { label: "pem private key", name: "SSH_PRIVATE_KEY", value: PEM_KEY, expected: ["pem-private-key", "high-entropy-string"] },
  ])("matches the $label fixture against exactly its own pattern(s)", ({ name, value, expected }) => {
    expect(scanValueForSecrets(name, value).map((f) => f.patternId)).toEqual(expected);
  });

  it("carries the variable name and only a masked value on every finding", () => {
    const [finding] = scanValueForSecrets("FORGE_TOKEN", FORGE_TOKEN);
    expect(finding).toEqual({
      patternId: "github-token",
      varName: "FORGE_TOKEN",
      maskedValue: maskValue(FORGE_TOKEN),
    });
    expect(finding?.maskedValue).not.toContain(FORGE_TOKEN);
  });

  it("reports a value matching two patterns once per patternId", () => {
    const ids = scanValueForSecrets("SSH_PRIVATE_KEY", PEM_KEY).map((f) => f.patternId);
    expect(ids).toContain("pem-private-key");
    expect(ids).toContain("high-entropy-string");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns the same findings when one value is scanned twice", () => {
    const first = scanValueForSecrets("SSH_PRIVATE_KEY", PEM_KEY);
    expect(scanValueForSecrets("SSH_PRIVATE_KEY", PEM_KEY)).toEqual(first);
  });

  it("returns nothing for empty, whitespace-only, and benign values", () => {
    expect(scanValueForSecrets("EMPTY", "")).toEqual([]);
    expect(scanValueForSecrets("BLANK", "   \n\t")).toEqual([]);
    expect(scanValueForSecrets("ENDPOINT", "https://example.test/mcp")).toEqual([]);
    expect(scanValueForSecrets("PORT", "8080")).toEqual([]);
  });

  it("holds the generic high-entropy pattern back on digest-shaped values under a neutral name", () => {
    // 64 hex characters: a content digest, not a credential. Flagging these is
    // the false positive that makes a scanner ignorable.
    expect(scanValueForSecrets("GIT_COMMIT_SHA", "e3b0c442".repeat(8))).toEqual([]);
    expect(scanValueForSecrets("BUILD_DIGEST", "a".repeat(64))).toEqual([]);
  });

  it("applies the high-entropy pattern when the name or padding signals a credential", () => {
    const base64 = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU2Nzg5YWJjZGVm";
    expect(scanValueForSecrets("SESSION_TOKEN", base64).map((f) => f.patternId)).toEqual([
      "high-entropy-string",
    ]);
    // Neutral name, but padded and long enough to read as an encoded credential.
    expect(scanValueForSecrets("PAYLOAD", `${base64}abcd=`).map((f) => f.patternId)).toEqual([
      "high-entropy-string",
    ]);
  });

  it("matches the remaining provider and inline shapes", () => {
    // TEST CHANGE, justified (REQ-PLUGIN-033): the three literal shapes below are assembled at
    // run time, byte-identical, so the source carries none.
    expectMatch("PAYMENTS_KEY", ["sk", "_test_", "51H8xYzAbCdEfGhIjKlMnOpQr"].join(""), "stripe-api-key");
    expectMatch("CHAT_TOKEN", ["xox", "b-", "000000000000-abcdefghijkl"].join(""), "slack-token");
    expectMatch("FORGE_PAT", `github_pat_${"A".repeat(82)}`, "github-fine-grained-token");
    expectMatch("REPO_TOKEN", `glpat-${"a".repeat(20)}`, "gitlab-access-token");
    expectMatch("TRACKER_KEY", `lin_api_${"b".repeat(40)}`, "linear-api-key");
    expectMatch("MONITORING_TOKEN", `sntrys_${"c".repeat(40)}`, "sentry-auth-token");
    expectMatch("DEVOPS_PAT", `${"d".repeat(75)}AZDO${"e".repeat(5)}`, "azure-devops-pat");
    expectMatch("AUTH_HEADER", "Bearer abc123def456ghi789", "bearer-token");
    expectMatch("DATABASE_URL", ["postgresql://admin:hunter2", "@db.internal:5432/app"].join(""), "credentialed-connection-string");
    expectMatch("SERVER_ARGS", "--api-key=abc123", "inline-api-key-assignment");
    expectMatch("SERVER_ARGS", "password: hunter2", "inline-password-assignment");
  });
});

describe("maskValue", () => {
  it("reveals the first 4 and last 2 characters", () => {
    expect(maskValue(SK_API_KEY)).toBe("sk-a********45");
    expect(maskValue("abcdefg")).toBe("abcd********fg");
  });

  it("masks values of 6 characters or fewer whole", () => {
    for (const short of ["", "a", "ab", "abc", "abcd", "abcde", "abcdef"]) {
      const masked = maskValue(short);
      expect(masked).toMatch(/^\*+$/);
      expect(masked).not.toContain(short.slice(0, 1) || "\0");
    }
  });

  it("never reveals more than 6 cleartext characters, for any value", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 512 }), (value) => {
        // Asterisks are the mask; everything else in the output is revealed.
        expect(maskValue(value).replaceAll("*", "").length).toBeLessThanOrEqual(6);
      }),
      // Fixed seed: the suite must not pass or fail differently between runs.
      { seed: 20260813, numRuns: 300 },
    );
  });

  it("keeps a multi-line value on one line", () => {
    const masked = maskValue(PEM_KEY);
    expect(masked).not.toContain("\n");
    expect(masked).not.toContain(PEM_BODY_LINE);
  });
});

describe("detectSecrets", () => {
  it("reports an empty record as clean with no findings", () => {
    expect(detectSecrets({})).toEqual({ findings: [], clean: true });
  });

  it("reports a record of benign values as clean", () => {
    expect(detectSecrets({ PORT: "8080", ENDPOINT: "https://example.test/mcp" })).toEqual({
      findings: [],
      clean: true,
    });
  });

  it("scans every variable and reports clean=false when any matches", () => {
    const result = detectSecrets({
      PORT: "8080",
      AWS_ACCESS_KEY_ID: AWS_KEY_ID,
      FORGE_TOKEN,
    });
    expect(result.clean).toBe(false);
    expect(result.findings.map((f) => f.varName)).toEqual(["AWS_ACCESS_KEY_ID", "FORGE_TOKEN"]);
    expect(result.findings.map((f) => f.patternId)).toEqual(["aws-access-key-id", "github-token"]);
  });

  it("handles an empty-string value without crashing", () => {
    expect(detectSecrets({ OPTIONAL_TOKEN: "", PORT: "8080" })).toEqual({
      findings: [],
      clean: true,
    });
    expect(detectSecrets({ OPTIONAL_TOKEN: "", FORGE_TOKEN }).findings).toHaveLength(1);
  });
});

describe("formatSecretFindings", () => {
  it("prints masked values and never the raw secret", () => {
    const output = formatSecretFindings(
      detectSecrets({ SSH_PRIVATE_KEY: PEM_KEY, FORGE_TOKEN, PORT: "8080" }),
    );

    expect(output).not.toContain(PEM_BODY_LINE);
    expect(output).not.toContain(FORGE_TOKEN);
    for (const line of PEM_KEY.split("\n")) expect(output).not.toContain(line);
    expect(output).toContain(maskValue(PEM_KEY));
    expect(output).toContain(maskValue(FORGE_TOKEN));
    expect(output).toContain("SSH_PRIVATE_KEY");
    expect(output).toContain("pem-private-key");
  });

  it("reports a clean result without listing anything", () => {
    expect(formatSecretFindings({ findings: [], clean: true })).toBe(
      "No secret-shaped values detected.",
    );
  });

  it("lists findings even when the result carries a stale clean flag", () => {
    const output = formatSecretFindings({
      findings: [{ patternId: "github-token", varName: "FORGE_TOKEN", maskedValue: "ghp_****" }],
      clean: true,
    });
    expect(output).toContain("FORGE_TOKEN");
    expect(output).toContain("ghp_****");
  });

  it("falls back to a placeholder name and the raw id for an unknown pattern", () => {
    const output = formatSecretFindings({
      findings: [{ patternId: "not-in-the-table", maskedValue: "abcd****ef" }],
      clean: false,
    });
    expect(output).toContain("(value)");
    expect(output).toContain("not-in-the-table");
  });
});
