import { describe, expect, it } from "vitest";
import {
  CI_PROVIDER_TOKEN,
  DETECTION_UNKNOWN,
  LINTER_TOKEN,
  MATURITY_TIER_TOKEN,
  REPO_SUBSTITUTION_TOKENS,
  TEST_FRAMEWORK_TOKEN,
  VERIFY_GATE_ALL_TOKEN,
  VERIFY_GATE_LINT_TOKEN,
  VERIFY_GATE_TEST_TOKEN,
  VERIFY_GATE_TYPECHECK_TOKEN,
  detectionContextFromManifest,
  renderDetectionList,
  substituteRepoTokens,
  substituteVerificationGateTokens,
  type DetectedRepoContext,
  type VerificationGateSet,
} from "../../src/emit/substitution.ts";
import { DEFAULT_MATURITY_TIER, type MaturityTier } from "../../src/types/core.ts";
import type { SetupManifest } from "../../src/types/manifest.ts";

const ctx = (over: Partial<DetectedRepoContext> = {}): DetectedRepoContext => ({
  linters: [],
  testFrameworks: [],
  ciProviders: [],
  ...over,
});

const gates = (over: Partial<VerificationGateSet> = {}): VerificationGateSet => ({
  test: "npm test",
  lint: "npm run lint",
  typecheck: "npm run typecheck",
  all: "npm run lint && npm run typecheck && npm test",
  ...over,
});

const manifest = (detected?: SetupManifest["detected"]): SetupManifest => ({
  version: "1.0.0",
  generatedBy: "0.0.0",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  tools: ["codex"],
  selection: { items: { agent: [], skill: [], rule: [], command: [] } },
  ledger: [],
  ...(detected === undefined ? {} : { detected }),
});

/** A manifest with the maturity dial turned; the base builder leaves it absent. */
const tieredManifest = (tier: MaturityTier): SetupManifest => ({
  ...manifest(),
  maturityTier: tier,
});

describe("detection-token substitution", () => {
  it("replaces every occurrence of every detection token", () => {
    const body = [
      `Lint with ${LINTER_TOKEN} before pushing.`,
      `Tests run under ${TEST_FRAMEWORK_TOKEN}; CI is ${CI_PROVIDER_TOKEN}.`,
      `Re-run ${LINTER_TOKEN} and ${TEST_FRAMEWORK_TOKEN} after a fix.`,
    ].join("\n");

    const out = substituteRepoTokens(
      body,
      ctx({ linters: ["oxlint"], testFrameworks: ["vitest"], ciProviders: ["github-actions"] }),
    );

    expect(out).toBe(
      [
        "Lint with oxlint before pushing.",
        "Tests run under vitest; CI is github-actions.",
        "Re-run oxlint and vitest after a fix.",
      ].join("\n"),
    );
    for (const token of [LINTER_TOKEN, TEST_FRAMEWORK_TOKEN, CI_PROVIDER_TOKEN]) {
      expect(out).not.toContain(token);
    }
  });

  it("returns token-free content unchanged", () => {
    const body = "No tokens here — just prose, a $variable, and ${OTHER:THING}.";
    expect(substituteRepoTokens(body, ctx({ linters: ["oxlint"] }))).toBe(body);
    expect(substituteVerificationGateTokens(body, gates())).toBe(body);
  });

  it("substitutes tokens inside a fenced code block", () => {
    // Emission-time semantics are purely textual: a token is resolved wherever
    // it appears. Fenced examples that must survive verbatim are a content
    // concern, not something this layer special-cases.
    const body = ["```bash", `${LINTER_TOKEN} --fix .`, "```"].join("\n");

    expect(substituteRepoTokens(body, ctx({ linters: ["ruff"] }))).toBe(
      ["```bash", "ruff --fix .", "```"].join("\n"),
    );
  });

  it("is idempotent — a second pass changes nothing", () => {
    const body = `${LINTER_TOKEN} / ${TEST_FRAMEWORK_TOKEN} / ${CI_PROVIDER_TOKEN}`;
    const detection = ctx({ linters: ["eslint", "prettier"], ciProviders: ["gitlab-ci"] });

    const once = substituteRepoTokens(body, detection);
    expect(substituteRepoTokens(once, detection)).toBe(once);
  });

  it("leaves the other family's tokens standing so the two passes compose", () => {
    const body = `${LINTER_TOKEN} then ${VERIFY_GATE_TEST_TOKEN}`;
    const detection = ctx({ linters: ["oxlint"] });
    const commands = gates({ test: "cargo test" });

    expect(substituteRepoTokens(body, detection)).toBe(`oxlint then ${VERIFY_GATE_TEST_TOKEN}`);
    expect(substituteVerificationGateTokens(body, commands)).toBe(`${LINTER_TOKEN} then cargo test`);
    expect(substituteVerificationGateTokens(substituteRepoTokens(body, detection), commands)).toBe(
      substituteRepoTokens(substituteVerificationGateTokens(body, commands), detection),
    );
  });

  it("leaves an unrecognised token in place rather than blanking it", () => {
    const body = "Consult ${STAMITY:NOT_A_REAL_TOKEN} for details.";
    expect(substituteRepoTokens(body, ctx({ linters: ["oxlint"] }))).toBe(body);
  });

  it("never re-scans replacement text for further tokens", () => {
    // Detection values are read off the repository, so a value that looks like
    // another token must not be substituted a second time.
    const body = `linter: ${LINTER_TOKEN}, ci: ${CI_PROVIDER_TOKEN}`;
    const out = substituteRepoTokens(
      body,
      ctx({ linters: [CI_PROVIDER_TOKEN], ciProviders: ["github-actions"] }),
    );

    expect(out).toBe(`linter: ${CI_PROVIDER_TOKEN}, ci: github-actions`);
  });
});

describe("detection list rendering", () => {
  it("renders the unknown sentinel for anything that resolves to nothing", () => {
    expect(renderDetectionList([])).toBe(DETECTION_UNKNOWN);
    expect(renderDetectionList(undefined)).toBe(DETECTION_UNKNOWN);
    expect(renderDetectionList(["", "   "])).toBe(DETECTION_UNKNOWN);
  });

  it("renders one value bare and several comma-separated", () => {
    expect(renderDetectionList(["vitest"])).toBe("vitest");
    expect(renderDetectionList(["eslint", "prettier"])).toBe("eslint, prettier");
    expect(renderDetectionList([" eslint ", "", "prettier"])).toBe("eslint, prettier");
  });

  it("substitutes the sentinel — never an empty string — for undetected facts", () => {
    const body = `lint=[${LINTER_TOKEN}] test=[${TEST_FRAMEWORK_TOKEN}] ci=[${CI_PROVIDER_TOKEN}]`;

    expect(substituteRepoTokens(body, ctx())).toBe(
      `lint=[${DETECTION_UNKNOWN}] test=[${DETECTION_UNKNOWN}] ci=[${DETECTION_UNKNOWN}]`,
    );
    expect(substituteRepoTokens(body, ctx())).not.toContain("[]");
  });
});

describe("maturity-tier substitution", () => {
  it("renders the default tier when the context carries no dial", () => {
    const out = substituteRepoTokens(`Tier: ${MATURITY_TIER_TOKEN}.`, ctx());

    expect(out).toBe(`Tier: ${DEFAULT_MATURITY_TIER}.`);
    expect(out).toBe("Tier: solo.");
  });

  it("renders the explicit tier, at every occurrence", () => {
    const body = `${MATURITY_TIER_TOKEN} gates; escalate per ${MATURITY_TIER_TOKEN} policy`;

    expect(substituteRepoTokens(body, ctx({ maturityTier: "enterprise" }))).toBe(
      "enterprise gates; escalate per enterprise policy",
    );
  });

  it("never renders the unknown sentinel — the dial always has an effective value", () => {
    expect(substituteRepoTokens(MATURITY_TIER_TOKEN, ctx())).not.toContain(DETECTION_UNKNOWN);
  });

  it("resolves alongside the detection tokens in the same repo-facts pass", () => {
    const body = `lint=${LINTER_TOKEN} tier=${MATURITY_TIER_TOKEN}`;

    expect(substituteRepoTokens(body, ctx({ linters: ["ruff"], maturityTier: "team" }))).toBe(
      "lint=ruff tier=team",
    );
  });
});

describe("manifest detection context", () => {
  it("yields empty lists when the manifest carries no detection block", () => {
    expect(detectionContextFromManifest(manifest())).toEqual({
      linters: [],
      testFrameworks: [],
      ciProviders: [],
    });
  });

  it("omits the maturity key entirely for a manifest without the dial", () => {
    // Key absence, not `undefined`: under exactOptionalPropertyTypes the two
    // are distinct shapes, and consumers spread the context onward.
    expect("maturityTier" in detectionContextFromManifest(manifest())).toBe(false);
  });

  it("carries the persisted maturity dial through to substitution", () => {
    const context = detectionContextFromManifest(tieredManifest("team"));

    expect(context.maturityTier).toBe("team");
    expect(substituteRepoTokens(MATURITY_TIER_TOKEN, context)).toBe("team");
  });

  it("carries the persisted detection lists", () => {
    const context = detectionContextFromManifest(
      manifest({
        languages: ["typescript"],
        linters: ["oxlint", "eslint"],
        testFrameworks: ["vitest"],
        ciProviders: ["github-actions"],
      }),
    );

    expect(context).toEqual({
      linters: ["oxlint", "eslint"],
      testFrameworks: ["vitest"],
      ciProviders: ["github-actions"],
    });
    expect(substituteRepoTokens(LINTER_TOKEN, context)).toBe("oxlint, eslint");
  });

  it("copies the lists so callers cannot mutate persisted manifest state", () => {
    const persisted = manifest({
      languages: ["typescript"],
      linters: ["oxlint"],
      testFrameworks: [],
      ciProviders: [],
    });

    detectionContextFromManifest(persisted).linters.push("mutated");

    expect(persisted.detected?.linters).toEqual(["oxlint"]);
  });
});

describe("verification-gate substitution", () => {
  it("replaces all four gate tokens", () => {
    const body = [
      `test: ${VERIFY_GATE_TEST_TOKEN}`,
      `lint: ${VERIFY_GATE_LINT_TOKEN}`,
      `typecheck: ${VERIFY_GATE_TYPECHECK_TOKEN}`,
      `all: ${VERIFY_GATE_ALL_TOKEN}`,
    ].join("\n");

    const out = substituteVerificationGateTokens(
      body,
      gates({
        test: "pytest",
        lint: "ruff check .",
        typecheck: "mypy .",
        all: "ruff check . && mypy . && pytest",
      }),
    );

    expect(out).toBe(
      ["test: pytest", "lint: ruff check .", "typecheck: mypy .", "all: ruff check . && mypy . && pytest"].join(
        "\n",
      ),
    );
  });

  it("inserts a command containing '$' verbatim, with no pattern expansion", () => {
    // `$&`, `$\``, `$'` and `$$` are replacement patterns for string-based
    // replace; a gate command carrying them must survive byte-for-byte.
    const command = "pytest -k '$&' --deselect \"$'x\" && echo $$PATH `$` $1";
    const out = substituteVerificationGateTokens(
      `Run ${VERIFY_GATE_TEST_TOKEN} now.`,
      gates({ test: command }),
    );

    expect(out).toBe(`Run ${command} now.`);
  });

  it("inserts a detection value containing '$' verbatim too", () => {
    const out = substituteRepoTokens(`linter=${LINTER_TOKEN}`, ctx({ linters: ["lint$&er"] }));
    expect(out).toBe("linter=lint$&er");
  });
});

describe("token enumeration drift guard", () => {
  // Justified extension: MATURITY_TIER_TOKEN joined the wired set —
  // the charter's maturity line is tokenised instead of hard-coding "solo"
  // while the manifest dial is live. The guard grows with the set it guards;
  // no prior token changed.
  const EXPECTED = [
    LINTER_TOKEN,
    TEST_FRAMEWORK_TOKEN,
    CI_PROVIDER_TOKEN,
    MATURITY_TIER_TOKEN,
    VERIFY_GATE_TEST_TOKEN,
    VERIFY_GATE_LINT_TOKEN,
    VERIFY_GATE_TYPECHECK_TOKEN,
    VERIFY_GATE_ALL_TOKEN,
  ];

  it("enumerates exactly the eight exported tokens, without duplicates", () => {
    expect(REPO_SUBSTITUTION_TOKENS).toEqual(EXPECTED);
    expect(new Set(REPO_SUBSTITUTION_TOKENS).size).toBe(8);
  });

  it("pins the wire format of every token", () => {
    expect([...REPO_SUBSTITUTION_TOKENS].toSorted()).toEqual(
      [
        "${STAMITY:CI_PROVIDER}",
        "${STAMITY:LINTER}",
        // Justified extension: wire format of the new maturity token.
        "${STAMITY:MATURITY_TIER}",
        "${STAMITY:TEST_FRAMEWORK}",
        "${STAMITY:VERIFY_GATE_ALL}",
        "${STAMITY:VERIFY_GATE_LINT}",
        "${STAMITY:VERIFY_GATE_TEST}",
        "${STAMITY:VERIFY_GATE_TYPECHECK}",
      ].toSorted(),
    );
  });

  it("wires every enumerated token to a substitution pass", () => {
    // A token constant that no pass resolves would ship as a leaked template
    // variable in generated output.
    const detection = ctx({
      linters: ["oxlint"],
      testFrameworks: ["vitest"],
      ciProviders: ["github-actions"],
    });

    for (const token of REPO_SUBSTITUTION_TOKENS) {
      const resolved = substituteVerificationGateTokens(
        substituteRepoTokens(`prefix ${token} suffix`, detection),
        gates(),
      );
      expect(resolved, token).not.toContain(token);
    }
  });
});
