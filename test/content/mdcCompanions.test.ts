import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildContentIndex, type CatalogItem } from "../../src/content/catalog.ts";
import { parseFrontmatter } from "../../src/content/frontmatter.ts";
import { buildMdcRule } from "../../src/adapters/cursor.ts";
import {
  cursorCompanionFrontmatter,
  generateMdcCompanions,
  planMdcCompanions,
  resolveRuleActivation,
} from "../../src/content/mdcCompanions.ts";
import { EngineError } from "../../src/types/errors.ts";
import { useTempDir } from "../support/tempDir.ts";
import { makeVolume } from "../support/vfs.ts";

/**
 * Two lanes, split by what each half touches: the transform and the planner are
 * pure, so they run over literals and a virtual corpus, while the regenerator
 * writes through the atomic temp+rename path — a real-filesystem guarantee that
 * an in-memory volume cannot express.
 */

const artifact = (frontmatter: string, body = "Body text.\n"): string =>
  `---\n${frontmatter}\n---\n${body}`;

/** A minimal indexed rule; cases override only the fields they exercise. */
function ruleItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    type: "rule",
    id: "security",
    filePath: "/corpus/rules/stamity-security.md",
    relativePath: "rules/stamity-security.md",
    description: "Security floor.",
    tags: ["floor:security"],
    body: "Body text.\n",
    frontmatter: { id: "security", type: "rule", description: "Security floor.", scope: "agent-requested" },
    ...overrides,
  };
}

const COMPANION_SOURCE = readFileSync(
  new URL("../../src/content/mdcCompanions.ts", import.meta.url),
  "utf8",
);
const EMISSION_SOURCE = readFileSync(
  new URL("../../src/adapters/cursor.ts", import.meta.url),
  "utf8",
);

/** The header block: everything before the first import, which is where the design notes live. */
const COMPANION_HEADER = COMPANION_SOURCE.slice(0, COMPANION_SOURCE.indexOf("\nimport "));

/** The two frontmatter shapes both generators refuse, each in the other's exact words. */
const REFUSED_SHAPES: readonly Record<string, unknown>[] = [
  { id: "security", description: "d", scope: "always" },
  { id: "security", description: "d", scope: "agent-requested", globs: ["*.ts"] },
];

function expectEngineError(run: () => unknown, code: EngineError["code"]): EngineError {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(EngineError);
  const error = thrown as EngineError;
  expect(error.code).toBe(code);
  return error;
}

describe("cursorCompanionFrontmatter", () => {
  it("maps the two sanctioned scopes to their documented frontmatter", () => {
    // TEST CHANGE, justified: this case used to assert `scope: always` ->
    // `alwaysApply: true`. That behaviour is gone — `always` is now refused by
    // name, matching the shipped Cursor emission, so the row moved to the
    // refusal cases below rather than being deleted.
    expect(
      cursorCompanionFrontmatter({ description: "Long workflow.", scope: "agent-requested" }),
    ).toBe("---\ndescription: Long workflow.\nalwaysApply: false\n---");

    expect(
      cursorCompanionFrontmatter({
        description: "TypeScript style.",
        scope: "conditional",
        globs: "src/**/*.ts, **/*.tsx",
      }),
    ).toBe(
      '---\ndescription: TypeScript style.\nglobs: ["src/**/*.ts", "**/*.tsx"]\nalwaysApply: false\n---',
    );
  });

  it("reads globs from a YAML list as well as a comma-separated string", () => {
    const fromList = cursorCompanionFrontmatter({
      description: "d",
      scope: "conditional",
      globs: ["src/**/*.ts", " **/*.tsx ", "src/**/*.ts"],
    });

    expect(fromList).toBe(
      '---\ndescription: d\nglobs: ["src/**/*.ts", "**/*.tsx"]\nalwaysApply: false\n---',
    );
  });

  it("emits a parseable block: the derived keys read back as Cursor declared them", () => {
    const parsed = parseFrontmatter(
      `${cursorCompanionFrontmatter({ description: "d", scope: "conditional", globs: "*.ts" })}\n`,
      "companion",
    );

    expect(parsed.frontmatter).toEqual({ description: "d", globs: ["*.ts"], alwaysApply: false });
  });

  it("carries only the three keys Cursor reads", () => {
    const block = cursorCompanionFrontmatter({
      id: "security",
      type: "rule",
      tags: ["floor:security"],
      precedence: "critical",
      description: "d",
      scope: "agent-requested",
    });

    expect(block).toBe("---\ndescription: d\nalwaysApply: false\n---");
  });

  it("defaults a rule with no scope to description-driven", () => {
    expect(cursorCompanionFrontmatter({ description: "d" })).toBe(
      "---\ndescription: d\nalwaysApply: false\n---",
    );
    expect(cursorCompanionFrontmatter({})).toBe("---\ndescription: \nalwaysApply: false\n---");
  });

  it("tolerates the deprecated glob-less conditional and reports it", () => {
    const warnings: string[] = [];

    const block = cursorCompanionFrontmatter(
      { description: "d", scope: "conditional", globs: null },
      { source: "rules/stamity-legacy.md", warnings },
    );

    expect(block).toBe("---\ndescription: d\nalwaysApply: false\n---");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("rules/stamity-legacy.md");
    expect(warnings[0]).toContain("agent-requested");
  });

  it("tolerates globs declared without a scope and reports it", () => {
    const warnings: string[] = [];

    const block = cursorCompanionFrontmatter({ description: "d", globs: ["*.ts"] }, { warnings });

    expect(block).toBe('---\ndescription: d\nglobs: ["*.ts"]\nalwaysApply: false\n---');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("scope");
  });

  it("drops the notices when the caller supplies no sink", () => {
    expect(() => cursorCompanionFrontmatter({ scope: "conditional" })).not.toThrow();
  });

  it("rejects an agent-requested scope that contradicts declared globs", () => {
    const error = expectEngineError(
      () =>
        cursorCompanionFrontmatter(
          { description: "d", scope: "agent-requested", globs: ["*.ts"] },
          { source: "rules/stamity-security.md" },
        ),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("rules/stamity-security.md");
    expect(error.message).toContain("conditional");
  });

  it("refuses scope: always outright — no companion is always-applied", () => {
    // The defect this closes: this generator used to answer `alwaysApply: true`
    // here, which is the one shape the always-on doctrine abolishes and the
    // shipped Cursor emission refuses by name. Five corpus suites gate rules
    // through this function, so the divergence made them certify a contract the
    // client would reject.
    for (const globs of [undefined, ["*.ts"]]) {
      const error = expectEngineError(
        () =>
          cursorCompanionFrontmatter(
            { description: "d", scope: "always", ...(globs === undefined ? {} : { globs }) },
            { source: 'rule "security"' },
          ),
        "VALIDATION_ERROR",
      );
      expect(error.message).toContain("AGENTS.md charter");
      expect(error.message).not.toContain("alwaysApply");
    }
  });

  it("refuses every refused shape in the shipped emission's exact words, so the two cannot drift", () => {
    // Same source label on both sides, so a byte difference is a wording
    // difference and nothing else. Two generators that refuse the same shape
    // with different sentences are two contracts an author has to reconcile.
    //
    // Both shapes, not just `always`: the two generators share no code (pinned
    // in the source-honesty case below), so this equality is the ONLY thing
    // holding them to one contract — and a mechanism that covered one refusal
    // while the contradiction message drifted freely would be half a mechanism.
    for (const frontmatter of REFUSED_SHAPES) {
      const label = String(frontmatter["scope"]);
      const item = ruleItem({ frontmatter });

      const companion = expectEngineError(
        () => cursorCompanionFrontmatter(item.frontmatter, { source: 'rule "security"' }),
        "VALIDATION_ERROR",
      );
      const emission = expectEngineError(
        () => buildMdcRule(item, "Body text.\n"),
        "VALIDATION_ERROR",
      );

      expect(companion.message, label).toBe(emission.message);
      // Non-degenerate: two empty or generic messages would satisfy equality
      // while telling an author nothing about which rule to fix.
      expect(companion.message, label).toContain('rule "security"');
      expect(companion.message.length, label).toBeGreaterThan(80);
    }
  });

  it("says in the header what actually binds the two generators, and claims nothing more", () => {
    // The residual this closes: the header asserted "Both generators reach that
    // verdict through ONE function ({@link resolveRuleActivation})", and the
    // shipped emission has never called it — the anti-drift property was real
    // but delivered by the equality case above, not by the attributed mechanism.
    //
    // Ground truth first. If this pair ever fails, the emission WAS routed
    // through the shared function: rewrite the header to claim it, do not relax
    // the assertion.
    expect(EMISSION_SOURCE).not.toContain("resolveRuleActivation");
    expect(EMISSION_SOURCE).not.toMatch(/from\s+"\.\.\/content\/mdcCompanions\.ts"/);

    // So the header must not attribute the agreement to a shared call...
    expect(COMPANION_HEADER).not.toMatch(/both[\s\S]{0,160}resolveRuleActivation/i);
    // ...and must name the mechanism that does hold, in both its halves: the
    // emission decides independently, and byte-equality is what binds it.
    expect(COMPANION_HEADER).toMatch(/does not import/i);
    expect(COMPANION_HEADER).toMatch(/byte-identical/i);
  });

  it("resolves every activation this module builds in one place, so no builder here re-branches", () => {
    // Scope of the claim is this file: `cursorCompanionFrontmatter`,
    // `planMdcCompanions` and `generateMdcCompanions` all render what
    // `resolveRuleActivation` decides, so a second local branch cannot reappear
    // beside them without this disagreeing. The shipped Cursor emission is not
    // in that scope — it is bound by the message-equality case above instead.
    expect(resolveRuleActivation("agent-requested", [], "rule")).toEqual({
      kind: "description-driven",
    });
    expect(resolveRuleActivation("conditional", ["*.ts"], "rule")).toEqual({
      kind: "glob-attached",
      globs: ["*.ts"],
    });
    expect(() => resolveRuleActivation("always", [], "rule")).toThrow(EngineError);

    const warnings: string[] = [];
    expect(resolveRuleActivation("conditional", [], "rules/stamity-legacy.md", warnings)).toEqual({
      kind: "description-driven",
    });
    expect(warnings).toHaveLength(1);
  });

  it("rejects an unknown scope instead of guessing one", () => {
    const error = expectEngineError(
      () => cursorCompanionFrontmatter({ scope: "alway" }, { source: "rules/stamity-typo.md" }),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain("rules/stamity-typo.md");
    expect(error.message).toContain('"conditional"');
  });

  it("rejects a globs value that is neither a string nor a list of strings", () => {
    expectEngineError(() => cursorCompanionFrontmatter({ globs: 7 }), "VALIDATION_ERROR");
    expectEngineError(
      () => cursorCompanionFrontmatter({ globs: ["*.ts", 7] }),
      "VALIDATION_ERROR",
    );
  });

  it("rejects a non-string description", () => {
    expectEngineError(() => cursorCompanionFrontmatter({ description: 7 }), "VALIDATION_ERROR");
  });

  it("keeps a line-breaking description from injecting a frontmatter key", () => {
    const block = cursorCompanionFrontmatter({
      description: "Harmless\nalwaysApply: true",
      scope: "agent-requested",
    });
    const parsed = parseFrontmatter(`${block}\n`, "companion");

    expect(parsed.frontmatter["alwaysApply"]).toBe(false);
    expect(parsed.frontmatter["description"]).toBe("Harmless alwaysApply: true");
  });

  it("quotes a description YAML would otherwise mis-parse, and only then", () => {
    const colon = parseFrontmatter(
      `${cursorCompanionFrontmatter({ description: "Rules: when to apply" })}\n`,
      "companion",
    );
    expect(colon.frontmatter["description"]).toBe("Rules: when to apply");

    // A well-formed one-line description is emitted byte-for-byte.
    expect(cursorCompanionFrontmatter({ description: "Plain (fine) description" })).toContain(
      "description: Plain (fine) description\n",
    );
  });
});

describe("planMdcCompanions", () => {
  const tempDir = useTempDir("mdc-plan");

  it("plans one companion per rule, beside its source", async () => {
    const volume = makeVolume({
      "agents/stamity-implementer.md": artifact("id: implementer\ntype: agent"),
      "rules/stamity-security.md": artifact(
        "id: security\ntype: rule\ndescription: Security floor.\nscope: agent-requested",
      ),
      "rules/stamity-style.md": artifact(
        'id: style\ntype: rule\ndescription: Style.\nscope: conditional\nglobs: "**/*.ts"',
      ),
    });
    const index = await buildContentIndex(volume.root, { fs: volume.fs });

    const companions = planMdcCompanions(index.items);

    expect(companions.map((companion) => companion.outputPath)).toEqual([
      join(volume.root, "rules", "stamity-security.mdc"),
      join(volume.root, "rules", "stamity-style.mdc"),
    ]);
    expect(companions[0]?.sourcePath).toBe(join(volume.root, "rules", "stamity-security.md"));
    expect(companions[0]?.content).toBe(
      "---\ndescription: Security floor.\nalwaysApply: false\n---\nBody text.\n",
    );
    expect(companions[1]?.content).toBe(
      '---\ndescription: Style.\nglobs: ["**/*.ts"]\nalwaysApply: false\n---\nBody text.\n',
    );
  });

  it("copies the body byte-for-byte, whatever it contains", async () => {
    // A body carrying its own `---` fence and CRLF line endings: the companion
    // must not re-split, re-wrap, or re-encode any of it.
    const body = "Intro\r\n\r\n---\r\n\r\n## Section\r\n\r\n```yaml\nscope: always\n```\r\n";
    const rule = ruleItem({ body });

    const [companion] = planMdcCompanions([rule]);

    expect(companion?.content.endsWith(body)).toBe(true);
    expect(parseFrontmatter(companion?.content ?? "", "companion").body).toBe(body);
  });

  it("yields no companion for a non-rule artifact", () => {
    const agent = ruleItem({ type: "agent", id: "implementer" });

    expect(planMdcCompanions([agent])).toEqual([]);
  });

  it("collects the deprecated-shape notices of every rule it plans", () => {
    const warnings: string[] = [];

    planMdcCompanions(
      [
        ruleItem({ frontmatter: { description: "a", scope: "conditional" } }),
        ruleItem({
          id: "other",
          relativePath: "rules/stamity-other.md",
          frontmatter: { description: "b", globs: ["*.ts"] },
        }),
      ],
      { warnings },
    );

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("rules/stamity-security.md");
    expect(warnings[1]).toContain("rules/stamity-other.md");
  });

  it("plans without touching the filesystem", async () => {
    const dir = tempDir();
    const rule = ruleItem({ filePath: dir.path("rules", "stamity-ghost.md") });

    const companions = planMdcCompanions([rule]);

    // Synchronous, and the source it names does not exist: nothing was read.
    expect(Array.isArray(companions)).toBe(true);
    expect(companions[0]?.outputPath).toBe(dir.path("rules", "stamity-ghost.mdc"));
    // Nothing was written either — the temp directory is still empty.
    expect(await readdir(dir.dir)).toEqual([]);
  });
});

describe("generateMdcCompanions", () => {
  const tempDir = useTempDir("mdc-generate");

  it("writes a companion per rule and returns the paths in directory order", async () => {
    const dir = tempDir();
    await dir.seedFiles({
      "rules/stamity-security.md": artifact(
        "id: security\ntype: rule\ndescription: Security floor.\nscope: agent-requested",
      ),
      "rules/stamity-style.md": artifact(
        "id: style\ntype: rule\ndescription: Style.\nscope: conditional\nglobs: [src/**/*.ts]",
      ),
      // Not a rule: no frontmatter block, so not an artifact.
      "rules/README.md": "# Rules\n\nHow this directory works.\n",
    });
    const rulesDir = dir.path("rules");

    const written = await generateMdcCompanions(rulesDir);

    expect(written).toEqual([
      join(rulesDir, "stamity-security.mdc"),
      join(rulesDir, "stamity-style.mdc"),
    ]);
    expect(await readFile(written[0] ?? "", "utf8")).toBe(
      "---\ndescription: Security floor.\nalwaysApply: false\n---\nBody text.\n",
    );
    expect(await readFile(written[1] ?? "", "utf8")).toBe(
      '---\ndescription: Style.\nglobs: ["src/**/*.ts"]\nalwaysApply: false\n---\nBody text.\n',
    );
    expect(await readdir(rulesDir)).not.toContain("README.mdc");
  });

  it("writes through temp+rename, leaving no partial file behind", async () => {
    const dir = tempDir();
    await dir.seedFiles({
      "rules/stamity-security.md": artifact("id: security\ntype: rule\nscope: agent-requested"),
    });
    const rulesDir = dir.path("rules");

    await generateMdcCompanions(rulesDir);

    const entries = await readdir(rulesDir);
    expect(entries).toEqual(["stamity-security.md", "stamity-security.mdc"]);
    expect(entries.some((entry) => entry.includes(".tmp."))).toBe(false);
  });

  it("keeps the companion body byte-identical to its source", async () => {
    const dir = tempDir();
    const body = "Intro\r\n\r\n---\r\n\r\n## Section\r\n\r\n- item\r\n";
    await dir.seedFiles({
      "rules/stamity-security.md": artifact("id: security\ntype: rule\nscope: agent-requested", body),
    });

    const [companion] = await generateMdcCompanions(dir.path("rules"));

    const source = await readFile(dir.path("rules", "stamity-security.md"), "utf8");
    const generated = await readFile(companion ?? "", "utf8");
    expect(parseFrontmatter(generated, "mdc").body).toBe(parseFrontmatter(source, "md").body);
    expect(generated.endsWith(body)).toBe(true);
  });

  it("overwrites an edited companion — companions are generated, not authored", async () => {
    const dir = tempDir();
    await dir.seedFiles({
      "rules/stamity-security.md": artifact(
        "id: security\ntype: rule\ndescription: Security floor.\nscope: agent-requested",
      ),
      "rules/stamity-security.mdc": "---\nalwaysApply: false\n---\nHand-edited.\n",
    });
    const rulesDir = dir.path("rules");

    await generateMdcCompanions(rulesDir);

    expect(await readFile(join(rulesDir, "stamity-security.mdc"), "utf8")).toBe(
      "---\ndescription: Security floor.\nalwaysApply: false\n---\nBody text.\n",
    );
  });

  it("agrees byte-for-byte with the planned companion for the same corpus", async () => {
    const dir = tempDir();
    await dir.seedFiles({
      // A colon-bearing description: the companion must quote it, and both
      // builders must quote it the same way.
      "rules/stamity-style.md": artifact(
        'id: style\ntype: rule\ndescription: "Style: applies to TS."\nscope: conditional\nglobs: "src/**/*.ts, *.tsx"',
      ),
    });

    const written = await generateMdcCompanions(dir.path("rules"));
    const index = await buildContentIndex(dir.dir);
    const [planned] = planMdcCompanions(index.items);

    expect(planned?.outputPath).toBe(written[0]);
    expect(await readFile(written[0] ?? "", "utf8")).toBe(planned?.content);
  });

  it("fails the whole run on a bad rule rather than half-regenerating", async () => {
    const dir = tempDir();
    await dir.seedFiles({
      "rules/stamity-a-ok.md": artifact("id: ok\ntype: rule\nscope: agent-requested"),
      "rules/stamity-b-broken.md": artifact("id: broken\ntype: rule\nscope: agent-requested\nglobs: [*.ts]"),
    });
    const rulesDir = dir.path("rules");

    await expect(generateMdcCompanions(rulesDir)).rejects.toThrow(EngineError);
    expect(await readdir(rulesDir)).toEqual(["stamity-a-ok.md", "stamity-b-broken.md"]);
  });

  it("returns nothing for a directory that does not exist", async () => {
    expect(await generateMdcCompanions(tempDir().path("no-rules-here"))).toEqual([]);
  });

  it("collects the deprecated-shape notices of the rules it regenerates", async () => {
    const dir = tempDir();
    await dir.seedFiles({
      "rules/stamity-legacy.md": artifact("id: legacy\ntype: rule\nscope: conditional"),
    });
    const warnings: string[] = [];

    await generateMdcCompanions(dir.path("rules"), { warnings });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("stamity-legacy.md");
  });
});
