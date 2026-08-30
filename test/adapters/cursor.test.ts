import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  CURSOR_AGENTS_DIR,
  CURSOR_COMMANDS_DIR,
  CURSOR_GUARD_EVENTS,
  CURSOR_RULE_LINE_CAP,
  EVENT_RENAME,
  MCP_GUARD_PATH,
  SUBAGENT_GUARD_PATH,
  buildCursorAgent,
  buildCursorCommand,
  buildHooksJson,
  buildMcpGuardScript,
  buildMdcRule,
  buildSubagentGuardScript,
  cursorDialectFacts,
  cursorResiduePlanner,
} from "../../src/adapters/cursor.ts";
import { buildContentIndex, type CatalogItem } from "../../src/content/catalog.ts";
import { __resetContentRootCacheForTests } from "../../src/content/contentRoot.ts";
import { buildCoreEmissionPlan, composeEmissionPlanner, type EmissionContext } from "../../src/emit/planner.ts";
import { CANONICAL_HOOK_EVENTS, type HookInterchange } from "../../src/hooks/model.ts";
import { IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS } from "../../src/hooks/scripts.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import { resolveAgentGrant, type ResolvedAgentGrant } from "../../src/roster/agentGrants.ts";
import type { GrantableToolCategory } from "../../src/roster/agentPolicies.ts";
import { RUNTIME_AGENT_IDS } from "../../src/roster/agentPolicies.ts";
import type { EffortMap, ModelPinMap } from "../../src/roster/modelLadder.ts";
import type { AdapterOutput } from "../../src/types/content.ts";
import { EngineError } from "../../src/types/errors.ts";
import { CORPUS_ROOT } from "../corpus/harness.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The Cursor residue planner. Assertions run through the real emission
 * pipeline — `composeEmissionPlanner` over a fixture corpus in a temp repo —
 * so what is checked is the bytes a run would write, not a builder's opinion
 * of them. The two guard scripts are executed with `node` against fixture
 * stdin, because a guard is only worth its bytes if its verdicts are real.
 */

const getTemp = useTempDir("adapter-cursor");

const FIXED_NOW = new Date("2026-08-14T00:00:00.000Z");
const ENGINE_VERSION = "0.0.0-test";

/** Paths the fixture corpus produces, as the composed plan emits them. */
const P = {
  scopedRule: ".cursor/rules/stamity-scoped.mdc",
  askedRule: ".cursor/rules/stamity-asked.mdc",
  reviewer: ".cursor/agents/stamity-reviewer.md",
  implementer: ".cursor/agents/stamity-implementer.md",
  drifter: ".cursor/agents/stamity-drifter.md",
  workCommand: `${CURSOR_COMMANDS_DIR ?? "<none>"}/st-work/SKILL.md`,
  askCommand: `${CURSOR_COMMANDS_DIR ?? "<none>"}/st-ask/SKILL.md`,
  hooksConfig: ".cursor/hooks.json",
  mcpConfig: ".cursor/mcp.json",
  agentsMd: "AGENTS.md",
} as const;

/**
 * The core pre-tool-use guard's emitted path.
 *
 * Spelled out rather than imported: `src/hooks/scripts.ts` does not export the
 * file name, and this is the row the adapter has to recognise as CORE when it
 * decides blocking. A relocation or rename upstream therefore fails here rather
 * than silently reclassifying the guard as an authored row and handing it back
 * the `failClosed` flag its body cannot honour.
 */
const PRE_TOOL_USE_GUARD_PATH = ".stamity/generated/hooks/cursor/stamity-pre-tool-use-guard.mjs";

/** This module's own source, for the assertions that bind what it may not contain. */
const MODULE_SOURCE: string = readFileSync(
  new URL("../../src/adapters/cursor.ts", import.meta.url),
  "utf-8",
);

const CHARTER_FIXTURE = [
  "---",
  "id: charter",
  "type: charter",
  "description: fixture charter",
  "tags: [orchestration]",
  "---",
  "",
  "# Test Charter",
  "",
].join("\n");

const artifact = (front: readonly string[], body: string): string =>
  ["---", ...front, "---", "", body, ""].join("\n");

const SCOPED_RULE = artifact(
  [
    "id: scoped",
    "type: rule",
    "description: Attaches on the caller-facing surface.",
    "tags: [implementation]",
    "scope: conditional",
    'globs: ["**/auth/**", "**/api/**"]',
  ],
  "# Scoped\n\nGuidance body.",
);

const ASKED_RULE = artifact(
  [
    "id: asked",
    "type: rule",
    "description: Pulled in by description when the conversation is relevant.",
    "tags: [review]",
    "scope: agent-requested",
  ],
  "# Asked\n\nGuidance body.",
);

/** Ids matching roster rows: `reviewer` is read-only, `implementer` edits and executes. */
const REVIEWER_AGENT = artifact(
  [
    "id: reviewer",
    "type: agent",
    "description: Returns a verdict on a change set it must not touch.",
    "tags: [review]",
    "capabilities: [read]",
    "model_class: advanced",
  ],
  "# reviewer\n\nAgent body.",
);

const IMPLEMENTER_AGENT = artifact(
  [
    "id: implementer",
    "type: agent",
    "description: Builds one planned unit.",
    "tags: [implementation]",
    "capabilities: [read, edit, execute]",
    "model_class: advanced",
  ],
  "# implementer\n\nAgent body. Run ${STAMITY:VERIFY_GATE_ALL} before returning.",
);

/**
 * An agent id the shipped roster does not carry, declaring a wide grant in its
 * own frontmatter. The corpus stand-in for a pack agent reaching emission
 * without its pack's tool footprint — the case that must stay read-only.
 */
const DRIFTER_AGENT = artifact(
  [
    "id: drifter",
    "type: agent",
    "description: Declares more than any roster row grants it.",
    "tags: [implementation]",
    "capabilities: [read, edit, execute]",
    "model_class: standard",
  ],
  "# drifter\n\nAgent body.",
);

/** Two touchpoint commands: one carrying a gate token, so substitution is observable. */
const WORK_COMMAND = artifact(
  [
    "id: work",
    "type: command",
    "description: Execute a change end to end.",
    "tags: [orchestration]",
  ],
  "# /st-work\n\nRun ${STAMITY:VERIFY_GATE_ALL} before the QA checkpoint.",
);

const ASK_COMMAND = artifact(
  ["id: ask", "type: command", "description: Read-only codebase Q&A.", "tags: [orchestration]"],
  "# /st-ask\n\nAnswers, writes nothing.",
);

const BASE_CORPUS: Record<string, string> = {
  "corpus/charter/stamity-charter.md": CHARTER_FIXTURE,
  "corpus/rules/stamity-scoped.md": SCOPED_RULE,
  "corpus/rules/stamity-asked.md": ASKED_RULE,
  "corpus/agents/stamity-reviewer.md": REVIEWER_AGENT,
  "corpus/agents/stamity-implementer.md": IMPLEMENTER_AGENT,
  "corpus/agents/stamity-drifter.md": DRIFTER_AGENT,
  "corpus/commands/st-work.md": WORK_COMMAND,
  "corpus/commands/st-ask.md": ASK_COMMAND,
};

/** Seeds the fixture corpus (plus any extra files) and returns its root. */
async function seedCorpus(extra: Record<string, string> = {}): Promise<string> {
  const temp = getTemp();
  await temp.seedFiles({ ...BASE_CORPUS, ...extra });
  return temp.path("corpus");
}

interface CtxOptions {
  rules?: string[];
  agents?: string[];
  commands?: string[];
  servers?: string[];
  /** Operator model pins, as `stamity config` stores them. */
  pins?: ModelPinMap;
  /**
   * Operator effort overrides per class — the other half of the same setting,
   * and on this client the half that only reaches a file through the model
   * value, so it needs its own way in here.
   */
  efforts?: EffortMap;
}

function ctxOf(contentRoot: string, over: CtxOptions = {}): EmissionContext {
  const manifest = createManifest({
    tools: ["cursor"],
    selection: {
      items: {
        agent: over.agents ?? ["reviewer", "implementer"],
        skill: [],
        rule: over.rules ?? ["scoped", "asked"],
        command: over.commands ?? ["work", "ask"],
      },
    },
    generatorVersion: ENGINE_VERSION,
    now: FIXED_NOW,
    ...(over.servers === undefined ? {} : { mcp: { servers: over.servers } }),
  });
  const models = {
    ...(over.pins === undefined ? {} : { pins: over.pins }),
    ...(over.efforts === undefined ? {} : { effort: over.efforts }),
  };
  return {
    rootDir: getTemp().path("repo"),
    // `createManifest` has no models option — the pins are an operator setting
    // written by `stamity config`, so a test supplies them the same way the
    // config command persists them: on the manifest, after creation. Each half
    // is spread only when given, so a pins-only case still produces the manifest
    // an operator who set no effort would carry.
    manifest: Object.keys(models).length === 0 ? manifest : { ...manifest, models },
    engineVersion: ENGINE_VERSION,
    facts: { greenfield: true, monorepoPackages: [] },
    contentRoot,
  };
}

/** The composed plan: core rows plus this adapter's residue, exactly as a run would emit. */
async function planFor(contentRoot: string, over: CtxOptions = {}): Promise<AdapterOutput[]> {
  return composeEmissionPlanner({ cursor: cursorResiduePlanner }).plan(ctxOf(contentRoot, over));
}

/** This adapter's rows alone, unwrapped by the composer, for failure-mode assertions. */
async function residueFor(contentRoot: string, over: CtxOptions = {}): Promise<AdapterOutput[]> {
  const ctx = ctxOf(contentRoot, over);
  return (await cursorResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs;
}

const byPath = (plan: readonly AdapterOutput[]): Map<string, AdapterOutput> =>
  new Map(plan.map((output) => [output.path, output]));

const contentAt = (plan: readonly AdapterOutput[], path: string): string => {
  const row = byPath(plan).get(path);
  expect(row, path).toBeDefined();
  return row!.content;
};

/** The rejection an async call produced, or `null` when it resolved. */
async function rejectionOf(promise: Promise<unknown>): Promise<EngineError | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    expect(err).toBeInstanceOf(EngineError);
    return err as EngineError;
  }
}

/**
 * The refusal a synchronous builder threw, or `null` when it returned — the
 * `rejectionOf` twin for the pure builders. Assertions are unchanged from the
 * try/catch blocks it replaces; a builder that returns instead of throwing
 * yields `null`, so the caller's `code` assertion still fails the test.
 */
function refusalOf(build: () => unknown): EngineError | null {
  try {
    build();
    return null;
  } catch (err) {
    expect(err).toBeInstanceOf(EngineError);
    return err as EngineError;
  }
}

/**
 * A grant from the real resolver, never a hand-built literal: the builder's
 * contract is that the decision arrives already made, so composing the object
 * by hand here would assert the fixture rather than the rule that produced it.
 * `declaredTools` omitted is "no pack" — the caller-defect branch that grants
 * nothing.
 */
function grantOf(
  runtimeId: string,
  frontmatter: Record<string, unknown> = {},
  declaredTools?: readonly GrantableToolCategory[],
): ResolvedAgentGrant {
  return resolveAgentGrant({
    runtimeId,
    frontmatter,
    ...(declaredTools === undefined ? {} : { declaredTools }),
  });
}

/** A synthetic catalog item, for the pure-builder cases. */
function itemOf(over: Partial<CatalogItem> & Pick<CatalogItem, "type" | "id">): CatalogItem {
  return {
    filePath: `/corpus/${over.type}s/stamity-${over.id}.md`,
    relativePath: `${over.type}s/stamity-${over.id}.md`,
    description: "Fixture description.",
    tags: [],
    body: "\n# Body\n",
    frontmatter: {},
    ...over,
  };
}

/**
 * Runs an emitted guard with a payload on stdin. `home` overrides the home
 * directory the MCP guard resolves the operator-level manifest from, so a
 * developer's own configuration cannot decide the outcome.
 */
function runGuard(
  scriptPath: string,
  payload: unknown,
  home?: string,
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [scriptPath], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    ...(home === undefined ? {} : { env: { ...process.env, HOME: home, USERPROFILE: home } }),
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

/** Writes one planned row into the temp repo and returns its absolute path. */
async function materialize(plan: readonly AdapterOutput[], path: string): Promise<string> {
  const temp = getTemp();
  await temp.seedFiles({ [`repo/${path}`]: contentAt(plan, path) });
  return temp.path("repo", path);
}

afterEach(() => {
  __resetContentRootCacheForTests();
});

// ── Rules ────────────────────────────────────────────────────────

describe("`.mdc` rules", () => {
  it("emits the comma-separated glob line with no spaces, quotes or brackets", async () => {
    const plan = await planFor(await seedCorpus());

    const rule = contentAt(plan, P.scopedRule);
    const lines = rule.split("\n");

    // The quirk, byte-for-byte: unquoted, comma-separated, no space after the
    // separator — a space is reported to stop the rule attaching at all.
    expect(lines).toContain("globs: **/auth/**,**/api/**");
    expect(lines).toContain("alwaysApply: false");
    expect(rule).not.toContain('globs: ["');
    expect(rule).not.toContain(", **/api");
    expect(lines[0]).toBe("---");
    expect(lines[1]).toBe("description: Attaches on the caller-facing surface.");
    expect(rule).toContain("# Scoped");
  });

  it("emits an agent-requested rule with no globs line, and never emits alwaysApply: true", async () => {
    const plan = await planFor(await seedCorpus());

    const asked = contentAt(plan, P.askedRule);
    expect(asked.split("\n").slice(0, 4)).toEqual([
      "---",
      "description: Pulled in by description when the conversation is relevant.",
      "alwaysApply: false",
      "---",
    ]);
    expect(asked).not.toContain("globs:");

    // The always-on layer is the charter, so no emitted rule may claim it.
    for (const row of plan.filter((output) => output.path.endsWith(".mdc"))) {
      expect(row.content, row.path).not.toContain("alwaysApply: true");
    }
  });

  it("refuses a rule that declares `scope: always` rather than demoting the charter's layer", async () => {
    const corpus = await seedCorpus({
      "corpus/rules/stamity-everywhere.md": artifact(
        [
          "id: everywhere",
          "type: rule",
          "description: Wants every session.",
          "tags: [review]",
          "scope: always",
        ],
        "# Everywhere",
      ),
    });

    const err = await rejectionOf(residueFor(corpus, { rules: ["scoped", "asked", "everywhere"] }));
    expect(err?.code).toBe("VALIDATION_ERROR");
    expect(err?.message).toContain('rule "everywhere"');
    expect(err?.message).toContain("charter");
  });

  it("passes a body at the line cap and refuses the rule one line over it, by id", () => {
    const atCap = itemOf({
      type: "rule",
      id: "at-cap",
      frontmatter: { scope: "agent-requested" },
      body: `${Array.from({ length: CURSOR_RULE_LINE_CAP }, (_, i) => `line ${i}`).join("\n")}\n`,
    });
    expect(buildMdcRule(atCap, atCap.body)).toContain("line 499");

    const overCap = itemOf({
      type: "rule",
      id: "over-cap",
      frontmatter: { scope: "agent-requested" },
      body: `${Array.from({ length: CURSOR_RULE_LINE_CAP + 1 }, (_, i) => `line ${i}`).join("\n")}\n`,
    });
    const err = refusalOf(() => buildMdcRule(overCap, overCap.body));
    expect(err?.code).toBe("VALIDATION_ERROR");
    expect(err?.message).toContain('rule "over-cap"');
    expect(err?.message).toContain(String(CURSOR_RULE_LINE_CAP));
  });

  it("keeps an interior space in a glob but refuses one carrying the separator itself", () => {
    const spaced = itemOf({
      type: "rule",
      id: "spaced",
      frontmatter: { scope: "conditional", globs: ["docs/my notes/**", "src/**"] },
    });
    // Only the SEPARATOR must stay space-free; a path glob may contain spaces.
    expect(buildMdcRule(spaced, "body\n")).toContain("globs: docs/my notes/**,src/**");

    const comma = itemOf({
      type: "rule",
      id: "comma",
      frontmatter: { scope: "conditional", globs: ["src/{a,b}/**"] },
    });
    const err = refusalOf(() => buildMdcRule(comma, "body\n"));
    expect(err?.code).toBe("VALIDATION_ERROR");
    expect(err?.message).toContain("src/{a,b}/**");
    expect(err?.message).toContain("separator");
  });

  it("refuses a scope that contradicts declared globs, and tolerates the unambiguous halves", () => {
    // Two activation modes in one frontmatter: honouring the globs would
    // auto-attach a rule declared description-driven, and dropping them would
    // narrow one the author scoped — both silent in this client.
    const contradiction = itemOf({
      type: "rule",
      id: "two-minded",
      frontmatter: { scope: "agent-requested", globs: ["**/api/**"] },
    });
    const err = refusalOf(() => buildMdcRule(contradiction, "body\n"));
    expect(err?.code).toBe("VALIDATION_ERROR");
    expect(err?.message).toContain('rule "two-minded"');
    expect(err?.message).toContain("conditional");

    // A glob-less conditional degrades to description-driven, and globs with no
    // declared scope read as conditional: each emission is unambiguous, so
    // neither shape fails a run over frontmatter style.
    const globless = buildMdcRule(
      itemOf({ type: "rule", id: "globless", frontmatter: { scope: "conditional" } }),
      "body\n",
    );
    expect(globless).toContain("alwaysApply: false");
    expect(globless).not.toContain("globs:");

    const scopeless = buildMdcRule(
      itemOf({ type: "rule", id: "scopeless", frontmatter: { globs: ["src/**"] } }),
      "body\n",
    );
    expect(scopeless).toContain("globs: src/**");
  });
});

// ── Agents ───────────────────────────────────────────────────────

describe("`.cursor/agents` definitions", () => {
  it("marks the read-only role readonly and leaves the mutating role unmarked", async () => {
    const plan = await planFor(await seedCorpus());

    const reviewer = contentAt(plan, P.reviewer);
    // Changed expectation, and the behaviour that moved is the model pin: the `model:
    // inherit` line this block used to assert is gone. Emitting the literal
    // restated the client's own default as an engine decision and inverted the
    // pinning mandate with nothing behind it; with no operator
    // pin there is now no model key at all. `readonly` is untouched — it moved
    // one line up because the key above it disappeared, not because the grant
    // changed.
    expect(reviewer.split("\n").slice(0, 4)).toEqual([
      "---",
      "description: Returns a verdict on a change set it must not touch.",
      "readonly: true",
      "---",
    ]);

    const implementer = contentAt(plan, P.implementer);
    expect(implementer).not.toContain("readonly");
    expect(implementer).toContain("# implementer");
    // Substitution runs over the body: a leaked token would ship a literal
    // `${STAMITY:…}` into an agent definition a client reads verbatim.
    expect(implementer).not.toContain("${STAMITY:");
    expect(implementer).toMatch(/Run .+ before returning\./);
  });

  it("emits no model key on any ladder rung without an operator pin, and never the literal inherit", async () => {
    // Replaces the block that asserted `model: inherit` on all four rungs.
    // Same coverage — every rung, one assertion on the emitted model lines —
    // inverted to the ruled behaviour: absence IS the client's inherit, stated
    // by saying nothing, so the engine pins only what an operator pinned.
    for (const modelClass of ["frontier", "advanced", "standard", "economy"]) {
      const item = itemOf({
        type: "agent",
        id: "test-runner",
        frontmatter: { model_class: modelClass },
      });
      const emitted = buildCursorAgent(item, grantOf("stamity-test-runner"), "body\n");

      expect(
        emitted.split("\n").filter((line) => line.startsWith("model:")),
        modelClass,
      ).toEqual([]);
    }

    // Nowhere in this client's emitted bytes, and nowhere in the module that
    // writes them: the value documented a decision no ledger row carries, so
    // its absence is asserted at the source too rather than at one call site.
    // Scoped to the `.cursor/` residue and to every emitted `model:` line —
    // the core's shared hook scripts are another writer's rows, and one of them
    // uses the word about JavaScript prototypes.
    const plan = await planFor(await seedCorpus());
    for (const row of plan) {
      if (row.path.startsWith(".cursor/")) expect(row.content, row.path).not.toContain("inherit");
      const modelLines = row.content.split("\n").filter((line) => line.startsWith("model:"));
      expect(modelLines, row.path).toEqual([]);
    }
    expect(MODULE_SOURCE).not.toContain("inherit");
  });

  it("emits the operator's pinned id for the declared class, and nothing for a class the agent does not declare", () => {
    const advanced = itemOf({
      type: "agent",
      id: "reviewer",
      frontmatter: { model_class: "advanced" },
    });

    // The pinned id, verbatim, carrying this client's effort parameter — the
    // dialect has no standalone effort key, so the level rides on the model
    // value or it is dropped entirely.
    const pinned = buildCursorAgent(advanced, grantOf("stamity-reviewer"), "body\n", {
      advanced: "composer-2",
    });
    expect(pinned.split("\n").filter((line) => line.startsWith("model:"))).toEqual([
      "model: composer-2[effort=high]",
    ]);

    // A pin for a class this agent does not declare reaches nothing.
    const unpinned = buildCursorAgent(advanced, grantOf("stamity-reviewer"), "body\n", {
      economy: "composer-2-mini",
    });
    expect(unpinned).not.toContain("model:");

    // An off-ladder class stays unmapped whatever is pinned: an invented model
    // value fails at spawn time, an absent key takes the client's default.
    const offLadder = itemOf({
      type: "agent",
      id: "ghost",
      frontmatter: { model_class: "unheard-of" },
    });
    expect(buildCursorAgent(offLadder, grantOf("stamity-ghost"), "body\n", { advanced: "composer-2" }))
      .not.toContain("model:");
  });

  it("carries the operator's effort override inside the model value instead of the ladder default", () => {
    const advanced = itemOf({
      type: "agent",
      id: "reviewer",
      frontmatter: { model_class: "advanced" },
    });
    const grant = grantOf("stamity-reviewer");

    // The pin and the level an operator sets together. This client publishes no
    // standalone effort key, so the override reaches an emitted file inside the
    // model value or nowhere — and `stamity config` already displays it as
    // binding here, so emitting the ladder's `high` would put the displayed
    // setting and the written byte in disagreement and let the engine's default
    // outrank the operator, which the operator override exists to prevent.
    expect(
      buildCursorAgent(advanced, grant, "body\n", { advanced: "composer-2" }, { advanced: "low" })
        .split("\n")
        .filter((line) => line.startsWith("model:")),
    ).toEqual(["model: composer-2[effort=low]"]);

    // An override for a class with no pin has nothing to ride on: the parameter
    // is part of a model value, so with no id there is still no key, and the
    // engine invents neither half.
    expect(buildCursorAgent(advanced, grant, "body\n", {}, { advanced: "low" })).not.toContain(
      "model:",
    );

    // An operator who typed their own bracket group stated the whole model
    // expression; options live comma-separated inside ONE group, so a second
    // group would be unparseable and the pin stands verbatim.
    expect(
      buildCursorAgent(
        advanced,
        grant,
        "body\n",
        { advanced: "composer-2[effort=high,context=300k]" },
        { advanced: "low" },
      )
        .split("\n")
        .filter((line) => line.startsWith("model:")),
    ).toEqual(["model: composer-2[effort=high,context=300k]"]);
  });

  it("reads the operator's effort map off the manifest, not the pins alone", async () => {
    // Asserted through the plan, not the builder: a builder that accepts an
    // efforts argument passes every case above while the residue planner still
    // forwards pins only, and that gap emits `[effort=high]` here. The manifest
    // read is the behaviour under test.
    const plan = await planFor(await seedCorpus(), {
      pins: { advanced: "composer-2" },
      efforts: { advanced: "low" },
    });

    expect(
      contentAt(plan, P.reviewer)
        .split("\n")
        .filter((line) => line.startsWith("model:")),
    ).toEqual(["model: composer-2[effort=low]"]);
  });

  it("drops readonly only for a grant that earns it, and keeps it for every unresolved shape", () => {
    const item = itemOf({ type: "agent", id: "packed" });

    // A pack agent whose declared capabilities survive its pack's footprint:
    // the intersected ceiling carries edit and execute, so the client's only
    // per-agent restriction is correctly not applied.
    const wide = grantOf(
      "stamity-packed",
      { capabilities: ["read", "edit", "execute"] },
      ["read", "edit", "execute"],
    );
    expect(wide.source).toBe("frontmatter");
    expect(buildCursorAgent(item, wide, "body\n")).not.toContain("readonly");

    // Read-only grant, unresolvable grant (no roster row, no pack footprint to
    // bound the declaration), and a malformed `capabilities:` field all keep
    // the restriction. A roster gap is not a licence.
    const readOnly = grantOf("stamity-packed", { capabilities: ["read"] }, ["read"]);
    const unresolvable = grantOf("stamity-packed", { capabilities: ["read", "edit", "execute"] });
    const malformed = grantOf("stamity-packed", { capabilities: "everything" }, ["read", "edit"]);

    expect(unresolvable.allow).toEqual([]);
    for (const [label, grant] of [
      ["read-only", readOnly],
      ["unresolvable", unresolvable],
      ["malformed", malformed],
    ] as const) {
      expect(buildCursorAgent(item, grant, "body\n"), label).toContain("readonly: true");
    }
  });

  it("keeps an unrostered corpus agent read-only through the planner, whatever it declares", async () => {
    const plan = await planFor(await seedCorpus(), {
      agents: ["reviewer", "implementer", "drifter"],
    });

    // The fixture declares `capabilities: [read, edit, execute]` and holds no
    // roster row. Nothing bounds that declaration at this seam, so the resolver
    // grants nothing and the emitted definition stays restricted.
    expect(contentAt(plan, P.drifter)).toContain("readonly: true");
  });
});

// ── Commands ─────────────────────────────────────────────────────

describe("touchpoint commands", () => {
  it("emits each selected command to the verified surface, one row, owned by this adapter", async () => {
    const plan = await planFor(await seedCorpus());

    // The contract holds from both ends: a client that documents a project
    // surface gets the bodies on it; one that documents none gets no rows and
    // says so in its declared caps, rather than an invented directory.
    const commandRows = plan.filter((row) => row.owner.artifactType === "command");
    const surfaceCap = cursorDialectFacts.caps.find((cap) => cap.name === "command surface");
    expect(surfaceCap).toBeDefined();

    if (CURSOR_COMMANDS_DIR === null) {
      expect(commandRows).toEqual([]);
      expect(surfaceCap?.value).toMatch(/no .*command/i);
      return;
    }

    expect(commandRows.map((row) => row.path)).toEqual([P.askCommand, P.workCommand]);
    expect(surfaceCap?.value).toContain(CURSOR_COMMANDS_DIR);
    for (const row of commandRows) {
      expect(row.owner.adapter).toBe("cursor");
      // The catalog's namespaced id is what the ledger reclaims by; the emitted
      // name drops it so the operator types what the charter promises.
      expect(row.owner.artifactId.startsWith("cmd-"), row.path).toBe(true);
    }

    const work = contentAt(plan, P.workCommand);
    expect(work.split("\n").slice(0, 5)).toEqual([
      "---",
      "name: st-work",
      "description: Execute a change end to end.",
      // The key that makes the file a command: included when the operator types
      // the slash form, never pulled in by the agent on its own judgement.
      "disable-model-invocation: true",
      "---",
    ]);
    expect(work).toContain("# /st-work");
    // Same substitution pipeline as rules and agents — a leaked token would
    // ship a broken template variable where a runnable command belongs.
    expect(work).not.toContain("${STAMITY:");
    expect(work).toMatch(/Run .+ before the QA checkpoint\./);
  });

  it("emits no command rows for an empty command selection", async () => {
    const plan = await planFor(await seedCorpus(), { commands: [] });

    expect(plan.some((row) => row.owner.artifactType === "command")).toBe(false);
    // The other axes are untouched: selection is per class.
    expect(plan.map((row) => row.path)).toContain(P.reviewer);
  });

  it("carries no frontmatter key this client does not read", () => {
    const item = itemOf({ type: "command", id: "cmd-quick", description: "Small-change lane." });
    const emitted = buildCursorCommand(item, "st-quick", "# /st-quick\n");

    const front = emitted.split("---")[1] ?? "";
    expect(front.trim().split("\n").map((line) => line.split(":")[0])).toEqual([
      "name",
      "description",
      "disable-model-invocation",
    ]);
    // Not normalised toward a sibling client's command vocabulary: a borrowed
    // key reads as a restriction this runtime never applies.
    expect(emitted).not.toContain("model:");
    expect(emitted).not.toContain("tools:");
    expect(emitted).not.toContain("paths:");
  });
});

// ── Hooks ────────────────────────────────────────────────────────

interface HooksDocument {
  version: number;
  hooks: Record<string, { command: string; matcher?: string; failClosed?: boolean }[]>;
}

const parseHooks = (raw: string): HooksDocument => JSON.parse(raw) as HooksDocument;

/**
 * Every agent-hook event this client documents, transcribed from
 * <https://cursor.com/docs/agent/hooks> (accessed 2026-08-22). The list is
 * literal on purpose: it is the only thing that can catch an emitted event name
 * the client does not have, because neither side reports an unknown key in
 * `.cursor/hooks.json` — the config parses, the entry sits there, and the hook
 * never fires.
 *
 * `beforeSubmitPrompt` is the prompt-submission hook ("Called right after user
 * hits send but before backend request. Can prevent submission."); the string
 * `userPromptSubmit` appears nowhere on that page.
 */
const DOCUMENTED_CURSOR_EVENTS: readonly string[] = [
  "sessionStart",
  "sessionEnd",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "subagentStart",
  "subagentStop",
  "beforeShellExecution",
  "afterShellExecution",
  "beforeMCPExecution",
  "afterMCPExecution",
  "beforeReadFile",
  "afterFileEdit",
  "beforeSubmitPrompt",
  "preCompact",
  "stop",
  "afterAgentResponse",
  "afterAgentThought",
];

describe("event taxonomy", () => {
  it("maps all six canonical events onto strings the client documents", () => {
    // Pinned whole, not spot-checked: the mapping is a wire contract, and five
    // of the six rows being a mechanical rename is exactly what made the sixth
    // easy to get wrong.
    expect(EVENT_RENAME).toEqual({
      session_start: "sessionStart",
      pre_tool_use: "preToolUse",
      post_tool_use: "postToolUse",
      user_prompt_submit: "beforeSubmitPrompt",
      stop: "stop",
      session_end: "sessionEnd",
    });

    for (const event of CANONICAL_HOOK_EVENTS) {
      expect(DOCUMENTED_CURSOR_EVENTS, `${event} maps to an undocumented event`).toContain(
        EVENT_RENAME[event],
      );
    }
    // Both client-only guard events answer to the same list.
    for (const event of Object.values(CURSOR_GUARD_EVENTS)) {
      expect(DOCUMENTED_CURSOR_EVENTS, event).toContain(event);
    }

    // The name the mechanical rename produces is not an event on this client,
    // so it may not survive anywhere in the module that writes the config.
    expect(Object.values(EVENT_RENAME)).not.toContain("userPromptSubmit");
    expect(MODULE_SOURCE).not.toContain('"userPromptSubmit"');
  });
});

describe("`.cursor/hooks.json`", () => {
  it("renames every canonical event, wires the core scripts, and opts both guards into blocking", async () => {
    const plan = await planFor(await seedCorpus());
    const doc = parseHooks(contentAt(plan, P.hooksConfig));

    expect(doc.version).toBe(1);

    // Every key is either a renamed canonical event or a declared client
    // extension — nothing reaches the config by improvisation.
    const known = new Set<string>([...Object.values(EVENT_RENAME), ...Object.values(CURSOR_GUARD_EVENTS)]);
    for (const event of Object.keys(doc.hooks)) expect(known).toContain(event);

    // The three core scripts land on their renamed events.
    const sessionStart = doc.hooks[EVENT_RENAME.session_start] ?? [];
    expect(sessionStart.map((entry) => entry.command)).toEqual([
      "node .stamity/generated/hooks/cursor/stamity-session-start.mjs",
      "node .stamity/generated/hooks/cursor/stamity-config-tamper-notice.mjs",
    ]);
    const preToolUse = doc.hooks[EVENT_RENAME.pre_tool_use] ?? [];
    expect(preToolUse).toEqual([
      {
        command: `node ${PRE_TOOL_USE_GUARD_PATH}`,
        // No `failClosed`, and its ABSENCE is what this row asserts.
        //
        // This assertion previously required the flag, on the reading that "the
        // script exits with the blocking status". That is no longer what the
        // emitter writes: this client's tool-call payload names no calling
        // agent, so `planCoreHookScripts` generates the guard body as telemetry
        // — `BLOCKING = false`, exit 0 on every path — and the next assertion
        // reads that out of the emitted bytes rather than taking it on trust.
        //
        // The test is not weakened by dropping the flag; it is inverted onto the
        // stronger claim. `failClosed` on a row that reaches no verdict
        // advertises an enforcement point the bytes cannot reach, and its only
        // residual reach would be a crashed record-keeper blocking a tool call.
        // The blocking claim the suite still binds moved to the guards below and
        // to authored rows (the two tests after this one).
      },
    ]);
    // Same fact from the other side: the config row and the script body agree
    // that nothing here blocks, so the pair cannot drift into disagreement.
    const guardBody = contentAt(plan, PRE_TOOL_USE_GUARD_PATH);
    expect(guardBody).toContain("const BLOCKING = false;");
    expect(guardBody).toContain("Telemetry only on this client");

    // An observation is not a gate: the session rows stay advisory.
    for (const entry of sessionStart) expect(entry.failClosed).toBeUndefined();

    expect(doc.hooks[CURSOR_GUARD_EVENTS.subagentSpawn]).toEqual([
      { command: `node ${SUBAGENT_GUARD_PATH}`, failClosed: true },
    ]);
    expect(doc.hooks[CURSOR_GUARD_EVENTS.mcpExecution]).toEqual([
      { command: `node ${MCP_GUARD_PATH}`, failClosed: true },
    ]);
  });

  it("keeps failClosed on an authored pre-tool-use row while the core guard stays advisory", async () => {
    const corpus = await seedCorpus();
    const temp = getTemp();
    await temp.seedFiles({
      "repo/.stamity/hooks/gate.json": JSON.stringify({
        hooks: [
          { event: "pre_tool_use", command: ["node", ".stamity/hooks/gate.mjs"], matcher: "Bash" },
        ],
      }),
      "repo/.stamity/hooks/gate.mjs": "process.exit(0)\n",
    });

    const doc = parseHooks(contentAt(await planFor(corpus), P.hooksConfig));

    // Narrow, not blanket. The opt-in is dropped from the ONE row whose body
    // cannot reach a verdict on this client, and the gate event keeps its
    // meaning for a hook the repo wrote to decide: that hook reads whatever the
    // payload does carry, so its exit status is its own to mean.
    expect(doc.hooks[EVENT_RENAME.pre_tool_use]).toEqual([
      { command: `node ${PRE_TOOL_USE_GUARD_PATH}` },
      { command: "node .stamity/hooks/gate.mjs", matcher: "Bash", failClosed: true },
    ]);
  });

  it("does not count the core pre-tool-use guard among the matrix's blocking emissions", async () => {
    // The generated capability matrix renders this string verbatim, so it is
    // the sentence an operator reads when deciding what this setup enforces.
    const row = cursorDialectFacts.caps.find((cap) => cap.name === "hook enforcement");
    expect(row?.value).toContain("NOT on the core pre-tool-use guard");

    // And the claim is bound to the emitted bytes, not to its own phrasing:
    // exactly the two adapter-owned guards carry the flag on a default run.
    const doc = parseHooks(contentAt(await planFor(await seedCorpus()), P.hooksConfig));
    const blocking = Object.values(doc.hooks)
      .flat()
      .filter((entry) => entry.failClosed === true)
      .map((entry) => entry.command);
    expect(blocking).toEqual([`node ${SUBAGENT_GUARD_PATH}`, `node ${MCP_GUARD_PATH}`]);

    // The single fact both the guard's body and the matrix row are derived
    // from. If this client ever starts naming the calling agent in its
    // tool-call payload the row flips upstream, the guard regains a verdict,
    // and this assertion fails — which is the prompt to re-read the page rather
    // than to leave a stale "telemetry" claim on a gate that now binds.
    expect(IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS.has("cursor")).toBe(true);
  });

  it("wires user hook rows after the core entries, keeping the planned order", async () => {
    const corpus = await seedCorpus();
    const temp = getTemp();
    // The default user hooks directory: an authored hook is WIRED through
    // emission rather than parsed and dropped.
    await temp.seedFiles({
      "repo/.stamity/hooks/greet.json": JSON.stringify({
        hooks: [{ event: "session_start", command: ["node", ".stamity/hooks/greet.mjs"] }],
      }),
      "repo/.stamity/hooks/greet.mjs": "process.exit(0)\n",
    });

    const plan = await planFor(corpus);
    const doc = parseHooks(contentAt(plan, P.hooksConfig));

    expect((doc.hooks[EVENT_RENAME.session_start] ?? []).map((entry) => entry.command)).toEqual([
      "node .stamity/generated/hooks/cursor/stamity-session-start.mjs",
      "node .stamity/generated/hooks/cursor/stamity-config-tamper-notice.mjs",
      "node .stamity/hooks/greet.mjs",
    ]);
  });

  it("wires an authored prompt-submission hook onto the event this client actually has", async () => {
    const corpus = await seedCorpus();
    const temp = getTemp();
    // The one canonical event no shipped core script binds, so it reaches the
    // config only through an authored hook — and it is the event whose emitted
    // name was a string this client does not recognise.
    await temp.seedFiles({
      "repo/.stamity/hooks/prompt.json": JSON.stringify({
        hooks: [{ event: "user_prompt_submit", command: ["node", ".stamity/hooks/prompt.mjs"] }],
      }),
      "repo/.stamity/hooks/prompt.mjs": "process.exit(0)\n",
    });

    const raw = contentAt(await planFor(corpus), P.hooksConfig);
    const doc = parseHooks(raw);

    expect(Object.keys(doc.hooks)).toContain("beforeSubmitPrompt");
    expect((doc.hooks["beforeSubmitPrompt"] ?? []).map((entry) => entry.command)).toEqual([
      "node .stamity/hooks/prompt.mjs",
    ]);
    // Not renamed twice, and not left behind: the config a client reads carries
    // one spelling of this event, and it is the documented one.
    expect(raw).not.toContain("userPromptSubmit");
  });

  it("quotes an argv token that needs it and drops a timeout the dialect cannot carry", () => {
    const rows: HookInterchange[] = [
      { event: "stop", command: ["node", ".stamity/hooks/my hook.mjs"], matcher: "git push", timeoutMs: 5000 },
    ];
    const doc = parseHooks(buildHooksJson(rows));

    expect(doc.hooks[EVENT_RENAME.stop]).toEqual([
      { command: "node '.stamity/hooks/my hook.mjs'", matcher: "git push" },
    ]);
    expect(JSON.stringify(doc)).not.toContain("5000");
  });

  it("emits the config, and both guards, with no rows to wire", async () => {
    const rows = parseHooks(buildHooksJson([]));
    expect(Object.keys(rows.hooks)).toEqual([
      CURSOR_GUARD_EVENTS.subagentSpawn,
      CURSOR_GUARD_EVENTS.mcpExecution,
    ]);
    // The rename table stays total over the canonical set, so no event can
    // reach emission without a declared name.
    for (const event of CANONICAL_HOOK_EVENTS) expect(EVENT_RENAME[event]).toBeTruthy();
  });
});

// ── Guard scripts ────────────────────────────────────────────────

const embeddedRoster = (script: string): string[] => {
  const embedded = /new Set\((\[[\s\S]*?\])\)/.exec(script)?.[1];
  expect(embedded).toBeDefined();
  return JSON.parse(embedded!) as string[];
};

describe("subagent guard", () => {
  it("embeds exactly the shipped roster", () => {
    const script = buildSubagentGuardScript(RUNTIME_AGENT_IDS);

    expect(embeddedRoster(script)).toEqual([...RUNTIME_AGENT_IDS].toSorted());
    // Count moved 7 → 10 with the three specialist roles (security,
    // design-quality, performance). The assertion is unchanged in kind: the
    // roster's size is pinned so a role appearing or vanishing is a decision
    // someone reads, not a silent widening of what may be spawned.
    expect(RUNTIME_AGENT_IDS).toHaveLength(10);
    for (const id of ["stamity-security", "stamity-design-quality", "stamity-performance"]) {
      expect(RUNTIME_AGENT_IDS).toContain(id);
    }
  });

  it("admits an emitted agent the roster does not carry, so an installed id is not refused at spawn", async () => {
    const plan = await planFor(await seedCorpus(), {
      agents: ["reviewer", "implementer", "drifter"],
    });
    const roster = embeddedRoster(contentAt(plan, SUBAGENT_GUARD_PATH));

    // `drifter` has no roster row but its definition IS emitted, so denying it
    // would refuse a spawn the setup itself invites — with nothing the operator
    // could do about it. Its grant is still empty; the guard decides identity,
    // the pre-tool-use guard decides capability.
    expect(roster).toContain("stamity-drifter");
    for (const id of RUNTIME_AGENT_IDS) expect(roster).toContain(id);
    expect(roster).toEqual([...new Set(roster)].toSorted());
  });

  it("denies an unrostered id, allows a rostered one, and ignores ids outside the namespace", async () => {
    const plan = await planFor(await seedCorpus());
    const script = await materialize(plan, SUBAGENT_GUARD_PATH);

    const denied = runGuard(script, { subagent_type: "stamity-ghost", subagent_id: "abc" });
    expect(JSON.parse(denied.stdout)).toMatchObject({ permission: "deny" });
    expect(denied.stdout).toContain("stamity-ghost");
    // The refusal is reported on stderr; stdout carries the verdict alone.
    expect(JSON.parse(denied.stderr.trim())).toMatchObject({
      hook: "stamity-cursor-subagent-guard",
      reasonCode: "AGENT_NOT_ON_ROSTER",
      agentId: "stamity-ghost",
    });
    expect(denied.status).toBe(0);

    // No verdict written is how this client reads "no decision".
    expect(runGuard(script, { subagent_type: "stamity-reviewer" }).stdout).toBe("");
    // Another client's own sub-agents are not this setup's to police.
    expect(runGuard(script, { subagent_type: "cursor-background" }).stdout).toBe("");
    expect(runGuard(script, {}).stdout).toBe("");
  });

  it("announces a payload it cannot judge instead of waving the spawn through in silence", async () => {
    const plan = await planFor(await seedCorpus());
    const script = await materialize(plan, SUBAGENT_GUARD_PATH);

    // A payload with no agent id is the state that turned the allowlist into a
    // no-op: nothing to match, no crash for failClosed to catch, and — before
    // this — nothing written on either channel.
    const nameless = runGuard(script, { subagent_id: "abc" });
    expect(nameless.stdout).toBe("");
    expect(JSON.parse(nameless.stderr.trim())).toMatchObject({
      hook: "stamity-cursor-subagent-guard",
      reasonCode: "SPAWN_PAYLOAD_UNUSABLE",
      detail: "payload carried no subagent_type",
    });

    // Unparseable stdin: same pass-through, and the reason names the parse
    // rather than being folded into the empty-payload case. Spawned directly
    // because the helper JSON-encodes its input, and the point is bytes that do
    // not encode.
    const broken = spawnSync(process.execPath, [script], { input: "{ not json", encoding: "utf8" });
    expect(broken.stdout).toBe("");
    const brokenEvent = JSON.parse(broken.stderr.trim()) as { reasonCode: string; detail: string };
    expect(brokenEvent.reasonCode).toBe("SPAWN_PAYLOAD_UNUSABLE");
    expect(brokenEvent.detail).toContain("not valid JSON");

    // The diagnostic fires on an unusable payload, not on every spawn: a
    // rostered id stays silent on both channels.
    const rostered = runGuard(script, { subagent_type: "stamity-reviewer" });
    expect(rostered.stdout).toBe("");
    expect(rostered.stderr).toBe("");
  });
});

describe("mcp guard", () => {
  it("builds one deterministic body that resolves the manifest beside itself", () => {
    // Hash-stable bytes: a client that trusts a script by digest must see the
    // same digest until the emission actually changes.
    expect(buildMcpGuardScript()).toBe(buildMcpGuardScript());
    expect(buildMcpGuardScript()).toContain('join(HERE, "..", "mcp.json")');
  });

  it("denies every mcp__ call when no server is configured, and says why", async () => {
    const plan = await planFor(await seedCorpus());
    const script = await materialize(plan, MCP_GUARD_PATH);
    const temp = getTemp();
    await temp.seedFiles({ "home/.keep": "" });

    // No `.cursor/mcp.json` beside the guard (zero selected servers) and an
    // empty home, so the resolved allowlist is genuinely empty.
    expect(byPath(plan).has(P.mcpConfig)).toBe(false);
    const denied = runGuard(script, { tool_name: "mcp__github__search_code" }, temp.path("home"));

    const verdict = JSON.parse(denied.stdout) as { permission: string; user_message: string };
    expect(verdict.permission).toBe("deny");
    expect(verdict.user_message).toContain("configured no MCP servers");
    expect(JSON.parse(denied.stderr.trim())).toMatchObject({
      reasonCode: "NO_MCP_SERVERS_CONFIGURED",
    });
  });

  it("recognises a configured server by name, by remote URL, and by full stdio command line", async () => {
    const plan = await planFor(await seedCorpus());
    const script = await materialize(plan, MCP_GUARD_PATH);
    const temp = getTemp();
    // Written by hand rather than emitted: the guard resolves whatever manifest
    // is on disk, and the remote-URL shape is one the catalog's stdio entries
    // never produce, so the emitted document cannot cover all three spellings.
    await temp.seedFiles({
      "home/.keep": "",
      "repo/.cursor/mcp.json": JSON.stringify({
        mcpServers: {
          github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
          remote: { url: "https://mcp.example.test/sse" },
        },
      }),
    });
    const home = temp.path("home");

    // One fixture per documented payload spelling: `tool_name` carrying the
    // server, `url` for a remote server, `command` for a stdio one.
    expect(runGuard(script, { tool_name: "mcp__github__search_code" }, home).stdout).toBe("");
    expect(runGuard(script, { url: "https://mcp.example.test/sse" }, home).stdout).toBe("");
    expect(
      runGuard(script, { command: "npx -y @modelcontextprotocol/server-github" }, home).stdout,
    ).toBe("");

    // The set is an allowlist, not a shape check: a fourth server addressed the
    // same way is still refused.
    const denied = runGuard(script, { url: "https://elsewhere.test/sse" }, home);
    expect(JSON.parse(denied.stdout)).toMatchObject({ permission: "deny" });
    expect(JSON.parse(denied.stderr.trim())).toMatchObject({
      reasonCode: "MCP_SERVER_NOT_CONFIGURED",
    });
  });

  it("names the unreadable manifest and its parser message instead of reporting no servers", async () => {
    const plan = await planFor(await seedCorpus(), { servers: ["github"] });
    const script = await materialize(plan, MCP_GUARD_PATH);
    const temp = getTemp();
    await temp.seedFiles({ "home/.keep": "", "repo/.cursor/mcp.json": "{ not json" });

    const denied = runGuard(script, { tool_name: "mcp__github__search_code" }, temp.path("home"));
    const verdict = JSON.parse(denied.stdout) as { permission: string; user_message: string };

    // Still a refusal — an allowlist that cannot be read allows nothing — but
    // the cause and the fix are the file, not the selection. The pre-fix message
    // said the setup configured no servers, which is false while the project
    // manifest sits right there, and named no path to fix.
    expect(verdict.permission).toBe("deny");
    expect(verdict.user_message).not.toContain("configured no MCP servers");
    expect(verdict.user_message).toContain("mcp.json");

    const event = JSON.parse(denied.stderr.trim()) as {
      reasonCode: string;
      faults: { path: string; detail: string }[];
    };
    expect(event.reasonCode).toBe("MCP_MANIFEST_UNREADABLE");
    expect(event.faults).toHaveLength(1);
    expect(event.faults[0]?.path).toContain("mcp.json");
    expect(event.faults[0]?.detail).not.toBe("");
  });

  it("allows on the manifests that loaded and still reports the one that did not", async () => {
    const plan = await planFor(await seedCorpus(), { servers: ["github"] });
    const script = await materialize(plan, MCP_GUARD_PATH);
    await materialize(plan, P.mcpConfig);
    const temp = getTemp();
    // The operator's own file is broken; the project's is fine. The call is
    // allowed on the project set, and the broken file is still surfaced —
    // whatever it configured has silently stopped being reachable.
    await temp.seedFiles({ "home/.cursor/mcp.json": '{"mcpServers": ' });
    const home = temp.path("home");

    const allowed = runGuard(script, { tool_name: "mcp__github__search_code" }, home);
    expect(allowed.stdout).toBe("");
    const event = JSON.parse(allowed.stderr.trim()) as {
      reasonCode: string;
      faults: { path: string }[];
    };
    expect(event.reasonCode).toBe("MCP_MANIFEST_UNREADABLE");
    expect(event.faults[0]?.path).toContain("mcp.json");

    // An absent manifest is not a fault: the ordinary state of a repo that
    // selected no user-level servers stays silent on both channels.
    await temp.seedFiles({ "quiet/.keep": "" });
    const quiet = runGuard(script, { tool_name: "mcp__github__search_code" }, temp.path("quiet"));
    expect(quiet.stdout).toBe("");
    expect(quiet.stderr).toBe("");
  });

  it("points every refusal at a durable next step, never at editing the generated hook config", async () => {
    const plan = await planFor(await seedCorpus(), { servers: ["github"] });
    const script = await materialize(plan, MCP_GUARD_PATH);
    const temp = getTemp();
    await temp.seedFiles({ "home/.keep": "" });
    const home = temp.path("home");

    // All three refusals, from real runs: nothing configured, a call this guard
    // cannot identify, and a server outside the resolved set.
    const unconfigured = runGuard(script, { tool_name: "mcp__github__search" }, home);
    await materialize(plan, P.mcpConfig);
    const unidentified = runGuard(script, { tool_name: "shell" }, home);
    const notInSet = runGuard(script, { tool_name: "mcp__unlisted__run" }, home);

    const messages = [unconfigured, unidentified, notInSet].map((result) => {
      const verdict = JSON.parse(result.stdout) as { permission: string; user_message: string };
      expect(verdict.permission).toBe("deny");
      return verdict.user_message;
    });
    // Three distinct branches, so the clause is checked on all three rather
    // than three times on whichever one the fixtures happened to reach.
    expect(
      [unconfigured, unidentified, notInSet].map(
        (result) => (JSON.parse(result.stderr.trim()) as { reasonCode: string }).reasonCode,
      ),
    ).toEqual([
      "NO_MCP_SERVERS_CONFIGURED",
      "MCP_SERVER_UNIDENTIFIED",
      "MCP_SERVER_NOT_CONFIGURED",
    ]);

    for (const message of messages) {
      // The next sync rewrites .cursor/hooks.json and check reports the edit as
      // drift until it does, so telling the operator to delete the entry sent
      // them at a surface that undoes itself — and contradicted the generated
      // header four lines above, which says local edits are overwritten.
      expect(message).not.toContain(".cursor/hooks.json");
      expect(message).not.toMatch(/remove this guard/i);
    }
    // The two that have a configuration answer name the durable one.
    for (const message of [messages[0], messages[2]]) {
      expect(message).toContain("stamity config mcp add <id>");
      expect(message).toContain("stamity sync");
    }
  });

  it("allows a configured server and denies one absent from the resolved set", async () => {
    const plan = await planFor(await seedCorpus(), { servers: ["github"] });
    const script = await materialize(plan, MCP_GUARD_PATH);
    // The core rendered this document; the adapter placed it. Writing it beside
    // the guard is what a real run does, and what the guard resolves.
    await materialize(plan, P.mcpConfig);
    const temp = getTemp();
    await temp.seedFiles({ "home/.keep": "" });
    const home = temp.path("home");

    expect(runGuard(script, { tool_name: "mcp__github__search_code" }, home).stdout).toBe("");

    const denied = runGuard(script, { tool_name: "mcp__unlisted__run" }, home);
    expect(JSON.parse(denied.stdout)).toMatchObject({ permission: "deny" });
    expect(denied.stdout).toContain("unlisted");
  });
});

// ── Plan shape ───────────────────────────────────────────────────

describe("emitted plan", () => {
  it("emits no entry-file mirror, bridge rule or environment descriptor", async () => {
    const plan = await planFor(await seedCorpus());
    const paths = plan.map((output) => output.path);

    // `AGENTS.md` is native here: exactly one charter row, at the root.
    expect(paths.filter((path) => path.endsWith("AGENTS.md"))).toEqual([P.agentsMd]);
    expect(paths).not.toContain(".cursor/rules/bridge.mdc");
    expect(paths.some((path) => path.endsWith("environment.json"))).toBe(false);
    // Widened by one directory, and the claim is unchanged: no markdown mirror
    // of the standards surface under `.cursor/`. The command surface joins the
    // agents directory as a sanctioned home because it carries the touchpoint
    // BODIES, which exist nowhere else on this client — a second copy of the
    // charter still fails here.
    const sanctioned = [`${CURSOR_AGENTS_DIR}/`, `${CURSOR_COMMANDS_DIR ?? "\0"}/`];
    const stray = paths.filter(
      (path) =>
        path.startsWith(".cursor/") &&
        path.endsWith(".md") &&
        !sanctioned.some((dir) => path.startsWith(dir)),
    );
    expect(stray).toEqual([]);
    expect(cursorDialectFacts.entryFile).toBeNull();
  });

  it("emits the nine touchpoint bodies and the three specialist agents from the shipped corpus", async () => {
    // The one case the fixture corpus cannot make: "nine commands" and the
    // specialist roster are facts ABOUT the shipped content, so they are
    // asserted against it rather than against a stand-in.
    const index = await buildContentIndex(CORPUS_ROOT);
    const idsOf = (type: CatalogItem["type"]): string[] =>
      index.items.filter((item) => item.type === type).map((item) => item.id);

    const plan = await planFor(CORPUS_ROOT, {
      agents: idsOf("agent"),
      rules: idsOf("rule"),
      commands: idsOf("command"),
    });
    const paths = plan.map((row) => row.path);

    const commandRows = plan.filter((row) => row.owner.artifactType === "command");
    expect(commandRows).toHaveLength(CURSOR_COMMANDS_DIR === null ? 0 : 9);
    if (CURSOR_COMMANDS_DIR !== null) {
      for (const id of ["spec", "plan", "work", "board", "ask", "debug", "quick", "rework", "pr-resolve"]) {
        expect(paths, id).toContain(`${CURSOR_COMMANDS_DIR}/st-${id}/SKILL.md`);
      }
    }

    // The three read-only specialist lenses: emitted through the ordinary agent
    // path, and restricted — each judges a surface it must not touch.
    for (const id of ["security", "design-quality", "performance"]) {
      const specialist = contentAt(plan, `${CURSOR_AGENTS_DIR}/stamity-${id}.md`);
      expect(specialist, id).toContain("readonly: true");
    }
  });

  it("plans identical bytes twice, with every row owned by this adapter", async () => {
    const corpus = await seedCorpus();

    const first = await planFor(corpus, { servers: ["github"] });
    const second = await planFor(corpus, { servers: ["github"] });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));

    expect(first.map((output) => output.path)).toEqual(first.map((o) => o.path).toSorted());
    for (const row of first) {
      expect(row.owner.adapter, row.path).toBe("cursor");
      expect(row.coOwners ?? [], row.path).toEqual([]);
    }
    // The MCP document is placed, not re-rendered, by this adapter.
    expect(contentAt(first, P.mcpConfig)).toContain('"mcpServers"');
  });

  it("emits no agent rows for an empty agent selection, and still emits the hook config", async () => {
    const plan = await planFor(await seedCorpus(), { agents: [] });
    const paths = plan.map((output) => output.path);

    expect(paths.some((path) => path.startsWith(".cursor/agents/"))).toBe(false);
    expect(paths).toContain(P.hooksConfig);
    expect(paths).toContain(SUBAGENT_GUARD_PATH);
    // Rules are a separate selection axis and are unaffected.
    expect(paths).toContain(P.scopedRule);
  });

  it("skips an artifact restricted to another client", async () => {
    const corpus = await seedCorpus({
      "corpus/rules/stamity-elsewhere.md": artifact(
        [
          "id: elsewhere",
          "type: rule",
          "description: For another client only.",
          "tags: [review]",
          "scope: agent-requested",
          "tools: [claude]",
        ],
        "# Elsewhere",
      ),
    });

    const plan = await planFor(corpus, { rules: ["scoped", "asked", "elsewhere"] });
    expect(plan.map((output) => output.path)).not.toContain(".cursor/rules/stamity-elsewhere.mdc");
  });
});
