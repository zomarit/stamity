import { describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { ADAPTER_REGISTRY } from "../../src/adapters/registry.ts";
import { CODEX_AGENTS_OVERRIDE_FILE } from "../../src/adapters/codex.ts";
import type { EmissionContext } from "../../src/cli/engine/emission.ts";
import {
  ALWAYS_ON_CURSOR_BLOCK_LINES,
  ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX,
  ALWAYS_ON_SHARED_BYTES_WITH_CURSOR,
  CHARTER_MAX_LINES,
  CHARTER_RELATIVE_PATH,
} from "../../src/content/charter.ts";
import { composeEmissionPlanner } from "../../src/emit/planner.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import type { Tool } from "../../src/types/core.ts";
import type { ImportDecision } from "../../src/types/manifest.ts";
import {
  DEFAULT_GATE_COMMANDS,
  unresolvedGate,
  verificationGatesFor,
} from "../../src/detect/verificationGates.ts";
import {
  AGENTS_MD_FILE,
  CURSOR_CLOUD_BLOCK_HEADING,
  renderAgentsMd,
  renderCursorCloudBlock,
  verificationGatesFromManifest,
  type AgentsMdPlan,
} from "../../src/emit/agentsMd.ts";
import {
  CI_PROVIDER_TOKEN,
  DETECTION_UNKNOWN,
  LINTER_TOKEN,
  MATURITY_TIER_TOKEN,
  TEST_FRAMEWORK_TOKEN,
  VERIFY_GATE_ALL_TOKEN,
  VERIFY_GATE_LINT_TOKEN,
  VERIFY_GATE_TEST_TOKEN,
  VERIFY_GATE_TYPECHECK_TOKEN,
} from "../../src/emit/substitution.ts";
import { EngineError } from "../../src/types/errors.ts";
import type { DetectedSummary, PackageEntry } from "../../src/types/detect.ts";
import type { SetupManifest } from "../../src/types/manifest.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The core AGENTS.md charter renderer: one render from the charter template
 * plus the manifest, consumed by every adapter. Fixture-first — each case
 * seeds its own charter into a temp content root — with one integration case
 * over the shipped corpus template proving the real charter is fully wired.
 */

/** A well-formed substitution token, per the engine's own grammar (`substitution.ts` TOKEN_PATTERN). */
const WELL_FORMED_TOKEN = /\$\{STAMITY:[A-Z_]+\}/g;

/** The shipped corpus root, for the real-template integration case. */
const CORPUS_ROOT = resolve(fileURLToPath(new URL("../../content", import.meta.url)));

/**
 * Fixture charter carrying every wired token — the linter token twice, so
 * every-occurrence substitution is observable — plus a multibyte em dash, so
 * byte length and code-unit length measurably diverge.
 */
const FIXTURE_LINES = [
  "---",
  "id: charter",
  "type: charter",
  "description: fixture charter",
  "tags: [orchestration]",
  "load: always",
  "obsolete_when: fixture trigger",
  "---",
  "",
  "# Fixture Charter",
  "",
  `- Linter: ${LINTER_TOKEN}`,
  `- Test framework: ${TEST_FRAMEWORK_TOKEN}`,
  `- CI provider: ${CI_PROVIDER_TOKEN}`,
  `- Maturity tier: ${MATURITY_TIER_TOKEN} — a dial, not a detection.`,
  `- Re-lint with ${LINTER_TOKEN} after fixes.`,
  "",
  "## Gates",
  "",
  `- Tests: \`${VERIFY_GATE_TEST_TOKEN}\``,
  `- Lint: \`${VERIFY_GATE_LINT_TOKEN}\``,
  `- Typecheck: \`${VERIFY_GATE_TYPECHECK_TOKEN}\``,
  `- Full gate: \`${VERIFY_GATE_ALL_TOKEN}\``,
] as const;

const FIXTURE_CHARTER = `${FIXTURE_LINES.join("\n")}\n`;

/**
 * The exact bytes {@link FIXTURE_CHARTER} must render to for
 * {@link detectedManifest} — written out, not rebuilt from the builders under
 * test. A derived expectation here can only fail when composition ORDER
 * changes: it re-runs the same substitution passes over the same parsed body,
 * so a wrong linter value, a wrong gate command or a surviving frontmatter line
 * would appear identically on both sides and pass. The literal is what makes
 * this a render assertion instead of a restatement.
 */
const EXPECTED_DETECTED_RENDER = `${[
  "",
  "# Fixture Charter",
  "",
  "- Linter: ruff",
  "- Test framework: pytest",
  "- CI provider: gitlab-ci",
  "- Maturity tier: team — a dial, not a detection.",
  "- Re-lint with ruff after fixes.",
  "",
  "## Gates",
  "",
  "- Tests: `pytest`",
  "- Lint: `ruff check .`",
  "- Typecheck: `mypy .`",
  "- Full gate: `ruff check . && mypy . && pytest`",
].join("\n")}\n`;

const manifest = (over: Partial<SetupManifest> = {}): SetupManifest => ({
  version: "1.0.0",
  generatedBy: "0.0.0",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  tools: ["codex"],
  selection: { items: { agent: [], skill: [], rule: [], command: [] } },
  ledger: [],
  ...over,
});

/** A manifest whose persisted detection resolves every repo-facts token to a real value. */
const detectedManifest = (over: Partial<SetupManifest> = {}): SetupManifest =>
  manifest({
    detected: {
      languages: ["python"],
      linters: ["ruff"],
      testFrameworks: ["pytest"],
      ciProviders: ["gitlab-ci"],
    },
    maturityTier: "team",
    ...over,
  });

const pkg = (name: string, path: string): PackageEntry => ({ name, path });

/** Asserts the render ends with exactly one `\n`; `tail` labels the template variant. */
const expectSingleTrailer = ({ root }: AgentsMdPlan, tail: string): void => {
  expect(root.content.endsWith("\n"), JSON.stringify(tail)).toBe(true);
  expect(root.content.endsWith("\n\n"), JSON.stringify(tail)).toBe(false);
};

describe("renderAgentsMd over a fixture charter", () => {
  const getTemp = useTempDir("agents-md");

  /**
   * Renders from a seeded fixture charter. The context is built as a full
   * CLI-layer `EmissionContext` on purpose: the assignment is the compile-time
   * proof that the renderer's engine-local context type stays structurally
   * compatible with the context the emission planner will pass through.
   */
  async function render(
    setup: SetupManifest,
    packages: readonly PackageEntry[] = [],
    raw: string = FIXTURE_CHARTER,
  ): Promise<AgentsMdPlan> {
    const temp = getTemp();
    await temp.seedFiles({ [CHARTER_RELATIVE_PATH]: raw });
    const ctx: EmissionContext = {
      rootDir: temp.dir,
      manifest: setup,
      engineVersion: "0.0.0",
      facts: { monorepoPackages: [...packages] },
    };
    return renderAgentsMd({ ...ctx, contentRoot: temp.dir });
  }

  it("substitutes every token — detection lists, all four gates, the maturity tier — leaving zero residue", async () => {
    const { root } = await render(detectedManifest());

    expect(root.content).toContain("- Linter: ruff");
    expect(root.content).toContain("- Test framework: pytest");
    expect(root.content).toContain("- CI provider: gitlab-ci");
    expect(root.content).toContain("- Maturity tier: team — a dial, not a detection.");
    // Gate commands derive from the persisted language (python), not from any default.
    expect(root.content).toContain("- Tests: `pytest`");
    expect(root.content).toContain("- Lint: `ruff check .`");
    expect(root.content).toContain("- Typecheck: `mypy .`");
    expect(root.content).toContain("- Full gate: `ruff check . && mypy . && pytest`");

    expect(root.content.match(WELL_FORMED_TOKEN)).toBeNull();
    // Stronger than the token grammar: no raw opener survives in any form.
    expect(root.content).not.toContain("${STAMITY:");
  });

  it("renders the operator's pinned gate, leaving the unpinned rows detected", async () => {
    const { root } = await render(detectedManifest({ gates: { test: "npm run test:unit" } }));

    // The pinned row is the operator's string verbatim...
    expect(root.content).toContain("- Tests: `npm run test:unit`");
    // ...and the other two still state what the repository showed.
    expect(root.content).toContain("- Lint: `ruff check .`");
    expect(root.content).toContain("- Typecheck: `mypy .`");
    // `${STAMITY:VERIFY_GATE_ALL}` composes all three: two detected, one
    // pinned. A charter whose full gate still quoted `pytest` here would tell
    // a reader to run a suite the Tests row above it had just replaced.
    expect(root.content).toContain("- Full gate: `ruff check . && mypy . && npm run test:unit`");
    expect(root.content.match(WELL_FORMED_TOKEN)).toBeNull();
  });

  it("renders a manifest that pins nothing byte-identically to one with no gates block", async () => {
    // The no-op property REQ-PLUGIN-026 rests on: the committed dogfood tree
    // and the cross-client golden pin nothing, so an empty (or absent) gates
    // block may not move a single byte.
    const pinned = await render(detectedManifest({ gates: {} }));
    const unpinned = await render(detectedManifest());

    expect(unpinned.root.content).toBe(EXPECTED_DETECTED_RENDER);
    expect(pinned.root.content).toBe(EXPECTED_DETECTED_RENDER);
  });

  it("substitutes a repo token at every occurrence, not only the first", async () => {
    const { root } = await render(detectedManifest());

    expect(root.content).toContain("- Re-lint with ruff after fixes.");
    expect(root.content).not.toContain(LINTER_TOKEN);
  });

  it("strips the frontmatter block and renders the substituted body byte-for-byte", async () => {
    // MODIFIED: the expectation was rebuilt from the same four builders the
    // render calls (parseFrontmatter → substituteRepoTokens →
    // substituteVerificationGateTokens → verificationGatesFromManifest), so the
    // case could only ever fail on a change to composition ORDER — a wrong
    // linter, a wrong gate command or a surviving frontmatter line appeared on
    // both sides and passed. It is now a literal.
    const { root } = await render(detectedManifest());

    expect(root.content).toBe(EXPECTED_DETECTED_RENDER);
    expect(root.content.startsWith("---")).toBe(false);
    expect(root.content).not.toContain("id: charter");
    expect(root.content).not.toContain("load: always");
  });

  it("ends with exactly one trailing newline, whatever the template ended with", async () => {
    // Unrolled, not looped: each render re-seeds the same charter path, so the
    // three cases are inherently sequential on the shared file.
    expectSingleTrailer(await render(detectedManifest(), [], FIXTURE_CHARTER.trimEnd()), "");
    expectSingleTrailer(await render(detectedManifest(), [], `${FIXTURE_CHARTER.trimEnd()}\n`), "\\n");
    expectSingleTrailer(
      await render(detectedManifest(), [], `${FIXTURE_CHARTER.trimEnd()}\n\n\n`),
      "\\n\\n\\n",
    );
  });

  it("renders deterministically: two renders are byte-identical and no clock is read", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    try {
      const first = await render(detectedManifest(), [pkg("web", "packages/web")]);
      const second = await render(detectedManifest(), [pkg("web", "packages/web")]);

      expect(second.root).toEqual(first.root);
      expect(second.root.content).toBe(first.root.content);
      expect(second.nestedFor("codex")).toEqual(first.nestedFor("codex"));
      // Byte equality across renders is the determinism proof; the spy pins
      // the mechanism — the render path never consults the wall clock.
      expect(nowSpy).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("renders the documented sentinel for empty detection — never an invented value", async () => {
    const { root } = await render(manifest());

    expect(root.content).toContain(`- Linter: ${DETECTION_UNKNOWN}`);
    expect(root.content).toContain(`- Test framework: ${DETECTION_UNKNOWN}`);
    expect(root.content).toContain(`- CI provider: ${DETECTION_UNKNOWN}`);
    // No `detected` block at all is a manifest written before detection was
    // persisted, not a repository that showed nothing: it keeps the
    // conventional npm gates it has always been given.
    expect(root.content).toContain(`- Tests: \`${DEFAULT_GATE_COMMANDS.test}\``);
    expect(root.content.match(WELL_FORMED_TOKEN)).toBeNull();
  });

  it("names no gate command when detection ran and found nothing to run", async () => {
    // The reachable `unknown` the charter's own preamble documents: "the
    // literal value `unknown` means detection found nothing — treat that item
    // as unconfigured and report it; do not invent a value." Before this
    // change the gate rows could not reach it — a repo with no identified
    // language was handed `npm run test` and, worse, a TypeScript type check.
    const { root } = await render(
      manifest({ detected: { languages: [], linters: [], testFrameworks: [], ciProviders: [] } }),
    );

    // The row still LEADS with the documented sentinel, and now carries
    // the instruction that keeps it from reading as a runnable command — these
    // strings are quoted into "Run `X`" positions elsewhere in the corpus.
    expect(root.content).toContain(`- Tests: \`${unresolvedGate("test")}\``);
    expect(root.content).toContain(`- Lint: \`${unresolvedGate("lint")}\``);
    expect(root.content).toContain(`- Typecheck: \`${unresolvedGate("typecheck")}\``);
    expect(root.content).toContain(`- Full gate: \`${unresolvedGate("full-gate")}\``);
    for (const row of ["Tests", "Lint", "Typecheck", "Full gate"]) {
      expect(root.content).not.toContain(`- ${row}: \`${DETECTION_UNKNOWN}\``);
    }
    // No command is named beside the sentinel — not npm's, not anyone's.
    expect(root.content).not.toContain("npm run");
    expect(root.content).not.toContain("tsc --noEmit");
    expect(root.content.match(WELL_FORMED_TOKEN)).toBeNull();
  });

  it("renders the runners detection recorded, not a hard-coded pair", async () => {
    const { root } = await render(
      manifest({
        detected: {
          languages: ["javascript"],
          linters: ["biome"],
          testFrameworks: ["jest"],
          ciProviders: [],
          packageManager: "pnpm",
          packageScripts: [],
        },
      }),
    );

    expect(root.content).toContain("- Tests: `pnpm exec jest`");
    expect(root.content).toContain("- Lint: `pnpm exec biome check .`");
    // Plain JavaScript: the linter is the static-analysis pass, and `tsc` never
    // appears for a repo with no TypeScript.
    expect(root.content).toContain("- Typecheck: `pnpm exec biome check .`");
    expect(root.content).not.toContain("vitest");
    expect(root.content).not.toContain("eslint");
    expect(root.content).not.toContain("tsc");
  });

  it("defaults the maturity tier to solo and renders a set dial verbatim", async () => {
    const { root: dialless } = await render(manifest());
    expect(dialless.content).toContain("- Maturity tier: solo — a dial, not a detection.");

    const { root: tiered } = await render(manifest({ maturityTier: "team" }));
    expect(tiered.content).toContain("- Maturity tier: team — a dial, not a detection.");
  });

  it("reports byteLength in UTF-8 bytes and lineCount in wc -l physical lines", async () => {
    const { root } = await render(detectedManifest());

    expect(root.byteLength).toBe(Buffer.byteLength(root.content, "utf8"));
    // The em dash is multibyte, so UTF-8 accounting measurably exceeds code units.
    expect(root.byteLength).toBeGreaterThan(root.content.length);
    // wc -l: the trailing newline terminates the last line, opening no empty one.
    expect(root.lineCount).toBe(root.content.split(/\r?\n/).length - 1);
  });
});

describe("nested monorepo targets", () => {
  const getTemp = useTempDir("agents-md-nested");

  async function renderWith(packages: readonly PackageEntry[]): Promise<AgentsMdPlan> {
    const temp = getTemp();
    await temp.seedFiles({ [CHARTER_RELATIVE_PATH]: FIXTURE_CHARTER });
    return renderAgentsMd({
      manifest: detectedManifest(),
      facts: { monorepoPackages: packages },
      contentRoot: temp.dir,
    });
  }

  it("plans one AGENTS.md per package for codex: sorted, deduplicated, root excluded", async () => {
    const plan = await renderWith([
      pkg("web", "packages/web"),
      pkg("api", "apps/api"),
      pkg("web-alias", "./packages/web/"),
      pkg("root", "."),
    ]);

    const nested = plan.nestedFor("codex");
    expect(nested.map((target) => target.outputPath)).toEqual([
      `apps/api/${AGENTS_MD_FILE}`,
      `packages/web/${AGENTS_MD_FILE}`,
    ]);
    for (const target of nested) {
      expect(target.content).toBe(plan.root.content);
    }
  });

  it("plans nothing for the tools whose load model does not read per-directory files", async () => {
    const plan = await renderWith([pkg("web", "packages/web")]);

    expect(plan.nestedFor("claude")).toEqual([]);
    expect(plan.nestedFor("cursor")).toEqual([]);
    expect(plan.nestedFor("copilot")).toEqual([]);
  });

  it("does not reintroduce a package path the planner skips as unusable", async () => {
    const plan = await renderWith([
      pkg("absolute", "/etc/packages"),
      pkg("escape", "../outside"),
      pkg("climb", "packages/../../etc"),
      pkg("web", "packages/web"),
    ]);

    expect(plan.nestedFor("codex").map((target) => target.outputPath)).toEqual([
      `packages/web/${AGENTS_MD_FILE}`,
    ]);
  });

  it("returns an empty plan for a single-package repo", async () => {
    const plan = await renderWith([]);
    expect(plan.nestedFor("codex")).toEqual([]);
  });
});

describe("renderAgentsMd edge cases", () => {
  const getTemp = useTempDir("agents-md-edge");

  it("propagates the loader's VALIDATION_ERROR for an over-budget template — never truncates", async () => {
    const temp = getTemp();
    const overBudget = `${Array.from(
      { length: CHARTER_MAX_LINES + 1 },
      (_, i) => `filler line ${i + 1}`,
    ).join("\n")}\n`;
    await temp.seedFiles({ [CHARTER_RELATIVE_PATH]: overBudget });

    const attempt = renderAgentsMd({
      manifest: manifest(),
      facts: { monorepoPackages: [] },
      contentRoot: temp.dir,
    });

    await expect(attempt).rejects.toBeInstanceOf(EngineError);
    await expect(attempt).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(attempt).rejects.toThrow(/always-on budget/);
  });

  it("propagates a missing template as the loader's VALIDATION_ERROR", async () => {
    const temp = getTemp();

    await expect(
      renderAgentsMd({ manifest: manifest(), facts: { monorepoPackages: [] }, contentRoot: temp.dir }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("emits a CRLF template as the parser returns it, with no stray \\r and an LF-only final newline", async () => {
    const temp = getTemp();
    await temp.seedFiles({ [CHARTER_RELATIVE_PATH]: FIXTURE_LINES.join("\r\n") + "\r\n" });

    const { root } = await renderAgentsMd({
      manifest: detectedManifest(),
      facts: { monorepoPackages: [] },
      contentRoot: temp.dir,
    });

    // Interior line endings pass through as the frontmatter parser captured
    // them (verbatim CRLF body); only the file's final terminator is
    // normalised, so every \r present is half of a \r\n pair.
    expect(root.content).toContain("\r\n");
    expect(root.content).not.toMatch(/\r(?!\n)/);
    expect(root.content.endsWith("\n")).toBe(true);
    expect(root.content.endsWith("\r\n")).toBe(false);
    expect(root.content.match(WELL_FORMED_TOKEN)).toBeNull();
    expect(root.lineCount).toBe(root.content.split(/\r?\n/).length - 1);
  });

  it("renders a greenfield repo with empty detection: sentinels, no throw", async () => {
    const temp = getTemp();
    await temp.seedFiles({ [CHARTER_RELATIVE_PATH]: FIXTURE_CHARTER });
    const ctx: EmissionContext = {
      rootDir: temp.dir,
      manifest: manifest(),
      engineVersion: "0.0.0",
      facts: { monorepoPackages: [] },
    };

    const { root } = await renderAgentsMd({ ...ctx, contentRoot: temp.dir });

    expect(root.content).toContain(`- Linter: ${DETECTION_UNKNOWN}`);
    expect(root.content).toContain("- Maturity tier: solo");
    expect(root.content.match(WELL_FORMED_TOKEN)).toBeNull();
  });
});

describe("verification gates from the manifest", () => {
  it("resolves the ranked persisted language that has a native gate row", () => {
    const gates = verificationGatesFromManifest(
      manifest({
        detected: { languages: ["klingon", "go"], linters: [], testFrameworks: [], ciProviders: [] },
      }),
    );

    expect(gates).toEqual({
      test: "go test ./...",
      lint: "golangci-lint run",
      typecheck: "go vet ./...",
      all: "golangci-lint run && go vet ./... && go test ./...",
    });
  });

  it("keeps the conventional npm defaults only for a manifest carrying no detection block", () => {
    // MODIFIED: the second half asserted the SAME npm defaults for a manifest
    // whose detection ran and recognised nothing. That is the defect — a
    // repository that showed no language was told to run `npm run test` and
    // `npm run typecheck` as detection-derived facts. Absent-block behaviour is
    // unchanged; the recognised-nothing case now resolves to the sentinel.
    expect(verificationGatesFromManifest(manifest())).toEqual(DEFAULT_GATE_COMMANDS);

    expect(
      verificationGatesFromManifest(
        manifest({
          detected: { languages: ["klingon"], linters: [], testFrameworks: [], ciProviders: [] },
        }),
      ),
    ).toEqual({
      test: unresolvedGate("test"),
      lint: unresolvedGate("lint"),
      typecheck: unresolvedGate("typecheck"),
      all: unresolvedGate("full-gate"),
    });
  });

  it("carries the manifest's pinned gates into the resolver", () => {
    const gates = { test: "npm run test:unit" };
    const detected: DetectedSummary = {
      languages: ["python"],
      linters: ["ruff"],
      testFrameworks: ["pytest"],
      ciProviders: [],
    };

    expect(verificationGatesFromManifest(manifest({ detected, gates }))).toEqual(
      verificationGatesFor(detected, gates),
    );
    // Not the detected answer: the two differ, so the equality above cannot
    // pass by the pin being dropped on the floor.
    expect(verificationGatesFromManifest(manifest({ detected, gates })).test).toBe(
      "npm run test:unit",
    );
    expect(verificationGatesFor(detected).test).toBe("pytest");
  });

  it("renders gate rows identical to the live resolver, over every detection shape", () => {
    // The charter's gate rows and the resolver are one answer, not two: the
    // adapters quote `verificationGatesFromManifest` and the renderer
    // substitutes it, so a second derivation here would let a user's charter
    // and their skill bodies disagree about how to run the tests.
    const fixtures: DetectedSummary[] = [
      { languages: ["python"], linters: ["ruff"], testFrameworks: ["pytest"], ciProviders: [] },
      {
        languages: ["typescript"],
        linters: ["eslint"],
        testFrameworks: ["vitest"],
        ciProviders: [],
        packageManager: "bun",
        packageScripts: ["test"],
      },
      { languages: [], linters: [], testFrameworks: [], ciProviders: [] },
      {
        languages: ["javascript"],
        linters: ["oxlint"],
        testFrameworks: ["mocha"],
        ciProviders: [],
        packageScripts: [],
      },
    ];

    for (const detected of fixtures) {
      const label = JSON.stringify(detected);
      expect(verificationGatesFromManifest(manifest({ detected })), label).toEqual(
        verificationGatesFor(detected),
      );
    }
  });
});

describe("renderAgentsMd over the shipped corpus template", () => {
  it("fully resolves the real charter — including the tokenised maturity line", async () => {
    const dialless = await renderAgentsMd({
      manifest: manifest(),
      facts: { monorepoPackages: [] },
      contentRoot: CORPUS_ROOT,
    });

    expect(dialless.root.content.match(WELL_FORMED_TOKEN)).toBeNull();
    expect(dialless.root.content).not.toContain("${STAMITY:");
    expect(dialless.root.content).toContain("- Maturity tier: solo — seeded from git history");
    expect(dialless.root.content.startsWith("---")).toBe(false);

    const tiered = await renderAgentsMd({
      manifest: manifest({ maturityTier: "enterprise" }),
      facts: { monorepoPackages: [] },
      contentRoot: CORPUS_ROOT,
    });
    expect(tiered.root.content).toContain("- Maturity tier: enterprise — seeded from git history");
  });
});

describe("Cursor's cloud block (REQ-FLOW-114)", () => {
  /**
   * The exact bytes the block renders to at the cross-client golden's engine
   * version — written out, not rebuilt from the module's own line list, so a
   * reworded bullet, a lost line or a dropped separator fails here rather than
   * passing on both sides.
   */
  const EXPECTED_BLOCK = [
    "",
    "## Cursor Cloud specific instructions",
    "",
    "For a Cursor cloud agent in this repository; the charter above binds it as it binds every session.",
    "",
    "- Node first: run `node --version` before anything else, and stop with that fix if it fails: install Node.js",
    "  on this machine through the repository's Cursor environment, and confirm it with",
    "  `npx -y @zomarit/stamity@1.0.0-golden check`. Every hook calls `node` with no prefix.",
    "- `/st-<id>` means: read `.agents/skills/st-<id>/SKILL.md` and follow it.",
    "- Learnings first: where no session-start banner has printed, run",
    "  `node .stamity/generated/hooks/cursor/stamity-session-start.mjs` with an empty stdin and open only the files",
    "  it lists as loaded.",
    "- Keep the pull request a draft and never mark it ready; a person does that.",
    "- An unattended run follows the `st-unattended` skill, `.agents/skills/st-unattended/SKILL.md`.",
    "",
  ].join("\n");

  it("renders the block byte for byte, its line count the pinned figure", () => {
    const block = renderCursorCloudBlock({ engineVersion: "1.0.0-golden" });

    expect(block.content).toBe(EXPECTED_BLOCK);
    expect(block.lineCount).toBe(ALWAYS_ON_CURSOR_BLOCK_LINES);
    // The with-Cursor root figure is the charter's plus exactly this block, so
    // the two disclosure constants cannot drift apart from the render.
    expect(block.byteLength).toBe(ALWAYS_ON_SHARED_BYTES_WITH_CURSOR - ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX);
    expect(block.byteLength).toBe(Buffer.byteLength(EXPECTED_BLOCK, "utf8"));
  });

  it("pins a fork's package in its check call, never the canonical one", () => {
    const block = renderCursorCloudBlock({ engineVersion: "2.3.4", packageName: "@acme/stamity-fork" });

    expect(block.content).toContain("@acme/stamity-fork@2.3.4 check`");
    expect(block.content).not.toContain("@zomarit/stamity");
    expect(block.lineCount).toBe(ALWAYS_ON_CURSOR_BLOCK_LINES);
  });

  describe("on the root AGENTS.md row", () => {
    // The REAL composed planner over the shipped corpus. The root does not
    // exist: planning is pure, and a missing operator AGENTS.md is the state
    // every import decision below reads as "no text of the operator's own".
    const GHOST_ROOT = join(tmpdir(), `stamity-cursor-block-ghost-${process.pid}`);
    const planner = composeEmissionPlanner(ADAPTER_REGISTRY);

    const planFor = (tools: Tool[], importChoice?: readonly ImportDecision[]) => {
      const ctx: EmissionContext = {
        rootDir: GHOST_ROOT,
        manifest: createManifest({
          tools,
          // The three rules codex folds into its override, so the override is
          // emitted on every codex selection below and its bytes can be compared.
          selection: {
            items: { agent: [], skill: [], rule: ["injection-screening", "secrets", "security-patterns"], command: [] },
          },
          ...(importChoice === undefined ? {} : { importChoice }),
          generatorVersion: "1.0.0-golden",
          now: new Date("2026-10-18T00:00:00.000Z"),
        }),
        engineVersion: "1.0.0-golden",
        facts: { monorepoPackages: [pkg("pkg-a", "packages/a")] },
      };
      return planner.planWithWarnings(ctx);
    };
    const contentOf = (outputs: readonly { path: string; content: string }[], path: string) =>
      outputs.find((row) => row.path === path)?.content;

    it("ends on the block with Cursor selected and carries none of it without", async () => {
      const block = renderCursorCloudBlock({ engineVersion: "1.0.0-golden" }).content;
      const without = await planFor(["claude", "copilot", "codex"]);
      const withCursor = await planFor(["claude", "copilot", "codex", "cursor"]);
      const charter = contentOf(without.outputs, AGENTS_MD_FILE)!;

      expect(charter).not.toContain(CURSOR_CLOUD_BLOCK_HEADING);
      expect(contentOf(withCursor.outputs, AGENTS_MD_FILE)).toBe(`${charter}${block}`);
      expect(contentOf(withCursor.outputs, AGENTS_MD_FILE)!.endsWith(block)).toBe(true);
      // Cursor alone: the same file, so the block is a fact of Cursor's
      // presence, not of any co-selection.
      expect(contentOf((await planFor(["cursor"])).outputs, AGENTS_MD_FILE)).toBe(`${charter}${block}`);
    });

    it("leaves Codex's override and every nested copy byte for byte unchanged", async () => {
      const without = await planFor(["codex"]);
      const withCursor = await planFor(["codex", "cursor"]);
      const override = contentOf(without.outputs, CODEX_AGENTS_OVERRIDE_FILE);

      expect(override).toBeDefined();
      expect(contentOf(withCursor.outputs, CODEX_AGENTS_OVERRIDE_FILE)).toBe(override);
      expect(override).not.toContain(CURSOR_CLOUD_BLOCK_HEADING);

      const nested = (outputs: readonly { path: string; content: string }[]) =>
        outputs.filter((row) => row.path.endsWith(`/${AGENTS_MD_FILE}`));
      // Non-degenerate: the monorepo layout plans at least one nested copy.
      expect(nested(withCursor.outputs).length).toBeGreaterThan(0);
      for (const row of nested(withCursor.outputs)) {
        expect(row.content, row.path).not.toContain(CURSOR_CLOUD_BLOCK_HEADING);
      }
      expect(nested(withCursor.outputs).map((row) => row.content)).toEqual(
        nested(without.outputs).map((row) => row.content),
      );
    });

    it("drops the block with the file under `skip` and says so on the plan's warnings", async () => {
      const skipped = await planFor(["claude", "cursor"], [{ path: AGENTS_MD_FILE, mode: "skip" }]);

      expect(contentOf(skipped.outputs, AGENTS_MD_FILE)).toBeUndefined();
      const named = skipped.warnings.filter((line) => line.includes("Cursor Cloud specific instructions"));
      expect(named).toHaveLength(1);
      expect(named[0]).toContain('"skip"');

      // Without Cursor the same decision loses no block, so nothing is said.
      const plain = await planFor(["claude"], [{ path: AGENTS_MD_FILE, mode: "skip" }]);
      expect(plain.warnings.some((line) => line.includes("Cursor Cloud specific instructions"))).toBe(false);
    });

    it("carries the block inside the managed block under `supplement`", async () => {
      const supplemented = await planFor(["claude", "cursor"], [{ path: AGENTS_MD_FILE, mode: "supplement" }]);
      const content = contentOf(supplemented.outputs, AGENTS_MD_FILE)!;
      const heading = content.indexOf(CURSOR_CLOUD_BLOCK_HEADING);
      const end = content.indexOf("<!-- STAMITY:END");

      expect(heading).toBeGreaterThan(0);
      expect(end).toBeGreaterThan(heading);
      expect(supplemented.warnings.some((line) => line.includes("Cursor Cloud specific instructions"))).toBe(false);
    });
  });
});
