import { describe, expect, it } from "vitest";
import { ADAPTER_REGISTRY } from "../../src/adapters/registry.ts";
import { composeEmissionPlanner, type EmissionContext } from "../../src/emit/planner.ts";
import {
  CI_PROVIDER_TOKEN,
  CLI_TOKEN,
  DETECTION_UNKNOWN,
  INVARIANTS_VERSION_TOKEN,
  LINTER_TOKEN,
  MATURITY_TIER_TOKEN,
  REPO_SUBSTITUTION_TOKENS,
  TEST_FRAMEWORK_TOKEN,
  VERIFY_GATE_ALL_TOKEN,
  VERIFY_GATE_LINT_TOKEN,
  VERIFY_GATE_TEST_TOKEN,
  VERIFY_GATE_TYPECHECK_TOKEN,
  cliCallContextOf,
  detectionContextFromManifest,
  renderDetectionList,
  renderInvariantsVersion,
  substituteCharterTokens,
  substituteCliTokens,
  substituteRepoTokens,
  substituteVerificationGateTokens,
  type CharterInvariants,
  type CliCallContext,
  type DetectedRepoContext,
  type VerificationGateSet,
} from "../../src/emit/substitution.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import { DEFAULT_MATURITY_TIER, TOOLS, type MaturityTier } from "../../src/types/core.ts";
import type { RuleDelivery, SetupManifest } from "../../src/types/manifest.ts";
import { useTempDir } from "../support/tempDir.ts";

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
  //
  // TEST CHANGE, justified (2026-09-15): INVARIANTS_VERSION_TOKEN joined the
  // same set, and with it a THIRD resolving pass. The charter's invariants
  // version is declared by the charter's own frontmatter, so it resolves from
  // neither detection nor gates — the wiring case below therefore composes all
  // three passes instead of two. Nothing was loosened: the same "every
  // enumerated token resolves" claim now has one more token and one more pass
  // to satisfy it with, and both count literals moved 8 -> 9 rather than away.
  //
  // TEST CHANGE, justified (2026-09-30, sw26-cli-token): CLI_TOKEN joined the
  // set with a FOURTH pass of its own family — its input is the emission
  // context (package name and engine version), neither detection, gates nor the
  // charter's frontmatter. The list grows by one token at its end, both count
  // literals move 9 -> 10, the wire-format pin gains `${STAMITY:CLI}`, and the
  // wiring case composes four passes instead of three. No existing token or
  // claim changed.
  const EXPECTED = [
    LINTER_TOKEN,
    TEST_FRAMEWORK_TOKEN,
    CI_PROVIDER_TOKEN,
    MATURITY_TIER_TOKEN,
    VERIFY_GATE_TEST_TOKEN,
    VERIFY_GATE_LINT_TOKEN,
    VERIFY_GATE_TYPECHECK_TOKEN,
    VERIFY_GATE_ALL_TOKEN,
    INVARIANTS_VERSION_TOKEN,
    CLI_TOKEN,
  ];

  const CLI: CliCallContext = { packageName: "@zomarit/stamity", version: "1.11.0" };

  const INVARIANTS: CharterInvariants = {
    version: "2.3.4",
    ratified: "2026-01-02",
    amended: "2026-03-04",
  };

  it("enumerates exactly the ten exported tokens, without duplicates", () => {
    expect(REPO_SUBSTITUTION_TOKENS).toEqual(EXPECTED);
    expect(new Set(REPO_SUBSTITUTION_TOKENS).size).toBe(10);
  });

  it("pins the wire format of every token", () => {
    expect([...REPO_SUBSTITUTION_TOKENS].toSorted()).toEqual(
      [
        "${STAMITY:CI_PROVIDER}",
        // Justified extension (2026-09-30): wire format of the pinned CLI call token.
        "${STAMITY:CLI}",
        // Justified extension: wire format of the new invariants token.
        "${STAMITY:INVARIANTS_VERSION}",
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
      const resolved = substituteCliTokens(
        substituteCharterTokens(
          substituteVerificationGateTokens(
            substituteRepoTokens(`prefix ${token} suffix`, detection),
            gates(),
          ),
          INVARIANTS,
        ),
        CLI,
      );
      expect(resolved, token).not.toContain(token);
    }
  });

  it("renders the invariants version as one line carrying both dates", () => {
    const rendered = substituteCharterTokens(
      `Invariants version ${INVARIANTS_VERSION_TOKEN}`,
      INVARIANTS,
    );

    expect(rendered).toBe(
      "Invariants version 2.3.4 · ratified 2026-01-02 · last amended 2026-03-04",
    );
    expect(renderInvariantsVersion(INVARIANTS)).toBe(
      "2.3.4 · ratified 2026-01-02 · last amended 2026-03-04",
    );
  });

  it("leaves the other two families alone, so the three passes compose in any order", () => {
    const document = `${LINTER_TOKEN} ${VERIFY_GATE_TEST_TOKEN} ${INVARIANTS_VERSION_TOKEN}`;

    // The charter pass resolves exactly one of the three...
    const charterOnly = substituteCharterTokens(document, INVARIANTS);
    expect(charterOnly).toContain(LINTER_TOKEN);
    expect(charterOnly).toContain(VERIFY_GATE_TEST_TOKEN);
    expect(charterOnly).not.toContain(INVARIANTS_VERSION_TOKEN);

    // ...and the other two leave the charter token standing, which is what a
    // rule or skill body would carry if it ever grew one: visible, not silent.
    const others = substituteVerificationGateTokens(
      substituteRepoTokens(document, ctx({ linters: ["eslint"] })),
      gates(),
    );
    expect(others).toContain(INVARIANTS_VERSION_TOKEN);
    expect(others).toContain("eslint");
  });
});

/** The pinned-call context the CLI-pass cases render against. */
const CLI_CONTEXT: CliCallContext = { packageName: "@zomarit/stamity", version: "1.11.0" };

describe("CLI-call token substitution (REQ-FLOW-002)", () => {
  it("renders the token to the pinned npx call, so a body writes `${STAMITY:CLI} <verb>`", () => {
    const out = substituteCliTokens(
      `Run ${CLI_TOKEN} learn capture, then ${CLI_TOKEN} ledger status.`,
      { packageName: "@zomarit/stamity", version: "1.0.0-golden" },
    );
    expect(out).toBe(
      "Run npx -y @zomarit/stamity@1.0.0-golden learn capture, " +
        "then npx -y @zomarit/stamity@1.0.0-golden ledger status.",
    );
    expect(out).not.toContain("${STAMITY:");
  });

  it("names a fork's own package when the context carries it", () => {
    expect(
      substituteCliTokens(`${CLI_TOKEN} sync`, { packageName: "@acme/stamity", version: "2.0.1" }),
    ).toBe("npx -y @acme/stamity@2.0.1 sync");
  });

  it("builds its context from the emission context, defaulting to the canonical package", () => {
    expect(cliCallContextOf({ engineVersion: "1.11.0" })).toEqual({
      packageName: "@zomarit/stamity",
      version: "1.11.0",
    });
    expect(cliCallContextOf({ engineVersion: "1.11.0", packageName: "@acme/stamity" })).toEqual({
      packageName: "@acme/stamity",
      version: "1.11.0",
    });
  });

  it("refuses to render an unpinned call: `latest` or an empty version is a VALIDATION_ERROR", () => {
    for (const version of ["latest", ""]) {
      expect(() =>
        substituteCliTokens(`${CLI_TOKEN} check`, { packageName: "@zomarit/stamity", version }),
      ).toThrow(expect.objectContaining({ code: "VALIDATION_ERROR" }));
    }
  });

  it("validates only when a body carries the token, so an unrelated body never fails on the context", () => {
    const body = `Lint with ${LINTER_TOKEN}.`;
    expect(substituteCliTokens(body, { packageName: "", version: "" })).toBe(body);
  });

  it("leaves every other family standing, and they leave it standing", () => {
    const document = `${CLI_TOKEN} ${LINTER_TOKEN} ${VERIFY_GATE_TEST_TOKEN} ${INVARIANTS_VERSION_TOKEN}`;
    const cliOnly = substituteCliTokens(document, CLI_CONTEXT);
    expect(cliOnly).toBe(
      `npx -y @zomarit/stamity@1.11.0 ${LINTER_TOKEN} ${VERIFY_GATE_TEST_TOKEN} ${INVARIANTS_VERSION_TOKEN}`,
    );
    const others = substituteCharterTokens(
      substituteVerificationGateTokens(substituteRepoTokens(document, ctx({ linters: ["eslint"] })), gates()),
      { version: "1.2.3", ratified: "2026-01-02", amended: "2026-03-04" },
    );
    expect(others.startsWith(CLI_TOKEN)).toBe(true);
  });

  it("inserts the value once — a rendered call is never rescanned", () => {
    const once = substituteCliTokens(`${CLI_TOKEN} check`, CLI_CONTEXT);
    expect(substituteCliTokens(once, CLI_CONTEXT)).toBe(once);
  });
});

// ── The CLI pass at every emission call site ──────────────────────────────

/** Every body in the fixture corpus carries this sentence; the pass must render it everywhere. */
const CLI_SENTENCE = `Record it with \`${CLI_TOKEN} learn capture\`.`;

const fixtureDoc = (head: readonly string[], title: string): string =>
  ["---", ...head, "---", "", `# ${title}`, "", CLI_SENTENCE, ""].join("\n");

/**
 * A corpus with one artifact per class, each carrying the token: the charter
 * (the `AGENTS.md` render), an agent and a command (every client's agent and
 * command lanes), an always-on rule (the rule lanes, or the skills projection's
 * demoted-rule lane under `on-demand`) and a skill (the skills projection).
 */
const CLI_CORPUS: Readonly<Record<string, string>> = {
  "corpus/charter/stamity-charter.md": fixtureDoc(
    [
      "id: charter",
      "type: charter",
      "description: fixture charter",
      "tags: [orchestration]",
      "load: always",
      "obsolete_when: fixture trigger",
    ],
    "Charter",
  ),
  "corpus/agents/stamity-reviewer.md": fixtureDoc(
    [
      "id: reviewer",
      "type: agent",
      'description: "Reviews a change set and returns a verdict."',
      "tags: [review]",
      "capabilities: [read]",
      "model_class: advanced",
    ],
    "reviewer",
  ),
  "corpus/commands/st-work.md": fixtureDoc(
    ["id: work", "type: command", 'description: "Execute a change end to end."', "tags: [orchestration]"],
    "work",
  ),
  "corpus/rules/stamity-ask-first.md": fixtureDoc(
    ["id: ask-first", "type: rule", 'description: "Ask before an irreversible action."', "tags: [implementation]"],
    "Ask first",
  ),
  "corpus/skills/stamity-alpha/SKILL.md": fixtureDoc(
    ["id: alpha", "type: skill", "description: fixture skill", "tags: [implementation]"],
    "Alpha",
  ),
};

/** Paths whose content carries the rendered call; asserts no row carries the raw token. */
function renderedPaths(rows: readonly { path: string; content: string }[], call: string): string[] {
  for (const row of rows) expect(row.content, row.path).not.toContain(CLI_TOKEN);
  return rows.filter((row) => row.content.includes(call)).map((row) => row.path);
}

describe("the CLI pass runs at every emission call site (REQ-FLOW-002)", () => {
  const getTemp = useTempDir("cli-token-emission");

  async function planAll(
    delivery: RuleDelivery,
    packageName?: string,
  ): Promise<{ path: string; content: string }[]> {
    const temp = getTemp();
    await temp.seedFiles({ ...CLI_CORPUS });
    const emission: EmissionContext = {
      rootDir: temp.path("repo"),
      manifest: {
        ...createManifest({
          tools: [...TOOLS],
          selection: {
            items: { agent: ["reviewer"], skill: ["alpha"], rule: ["ask-first"], command: ["work"] },
          },
          generatorVersion: GOLDEN_VERSION,
          now: new Date("2026-08-14T00:00:00.000Z"),
        }),
        ruleDelivery: delivery,
      },
      engineVersion: GOLDEN_VERSION,
      ...(packageName === undefined ? {} : { packageName }),
      facts: { monorepoPackages: [] },
      contentRoot: temp.path("corpus"),
    };
    const rows = await composeEmissionPlanner(ADAPTER_REGISTRY).plan(emission);
    return rows.map((row) => ({ path: row.path, content: row.content }));
  }

  const GOLDEN_VERSION = "1.0.0-golden";
  const CANONICAL_CALL = "npx -y @zomarit/stamity@1.0.0-golden learn capture";

  it("renders the pinned call in the charter, agent, command, rule and skill bodies of all four clients", async () => {
    const paths = renderedPaths(await planAll("always-on"), CANONICAL_CALL);
    // Every body-rendering lane, named by the call site that renders it:
    expect(paths.toSorted()).toEqual(
      [
        "AGENTS.md", // src/emit/agentsMd.ts (codex's appendix re-uses this render)
        ".agents/skills/stamity-alpha/SKILL.md", // src/emit/skillsProjection.ts
        ".claude/agents/stamity-reviewer.md", // src/adapters/claude.ts — agent lane
        ".claude/commands/st-work.md", // src/adapters/claude.ts — command lane
        ".claude/rules/stamity-ask-first.md", // src/adapters/claude.ts — rule lane
        ".claude/skills/stamity-alpha/SKILL.md", // the projection's native claude copy
        ".cursor/agents/stamity-reviewer.md", // src/adapters/cursor.ts
        ".cursor/rules/stamity-ask-first.mdc",
        ".cursor/skills/st-work/SKILL.md",
        ".github/agents/stamity-reviewer.agent.md", // src/adapters/copilot.ts
        ".github/instructions/stamity-ask-first.instructions.md",
        ".github/prompts/st-work.prompt.md",
        ".codex/agents/stamity-reviewer.toml", // src/adapters/codex.ts
      ].toSorted(),
    );
  });

  it("renders the demoted rule through the skills projection under on-demand delivery", async () => {
    const rows = await planAll("on-demand");
    const paths = renderedPaths(rows, CANONICAL_CALL);
    expect(paths.some((path) => path.startsWith(".agents/skills/") && path.includes("ask-first"))).toBe(true);
  });

  it("names a fork's own package when the context carries it", async () => {
    const rows = await planAll("always-on", "@acme/stamity");
    const forkPaths = renderedPaths(rows, "npx -y @acme/stamity@1.0.0-golden learn capture");
    expect(forkPaths).toEqual(renderedPaths(await planAll("always-on"), CANONICAL_CALL));
    for (const row of rows) expect(row.content, row.path).not.toContain("@zomarit/stamity@");
  });
});
