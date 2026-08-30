import { describe, expect, it } from "vitest";
import { frontmatterField } from "../../../src/content/frontmatter.ts";
import { planMdcCompanions } from "../../../src/content/mdcCompanions.ts";
import { facetOf, isContextTag, primaryTag } from "../../../src/content/tags.ts";
import { CONTENT_DENY_PATTERNS, scanForDeniedPatterns } from "../../../src/denyscan/denyScan.ts";
import {
  assertDenyClean,
  assertLineCap,
  filenameSlug,
  loadCorpusIndex,
  requireLoadClass,
  requireObsoleteWhen,
  walkAllMarkdown,
  type CorpusFile,
} from "../harness.ts";

/**
 * The four quality rules — contract-census, ui-states, testing, resilience — as
 * a contract over their shipped bodies.
 *
 * What this suite binds beyond the corpus-wide frontmatter contract:
 *
 *   - **Activation shape, per rule.** A rule activates in one of TWO sanctioned
 *     modes — glob-scoped, or agent-requested by description (content-classes
 *     SoT, class row 5; a maintainer ruling of 2026-08-16, which settled the
 *     contradiction with the rules-layer SoT's narrower "glob-conditional only"
 *     wording in favour of the two-mode reading and kept the shipped
 *     agent-requested rules). All four attach on the paths where their subject
 *     lives: contract-census took brownfield source globs when the census
 *     became a gate inside the work lane, since a rule that must bind
 *     before parallel dispatch cannot wait for a description to pull it in.
 *     `scope: always` exists in neither mode — always-on content is the
 *     charter's. The same four run through the companion planner so a shape the
 *     Cursor projection would only warn about fails here instead.
 *   - **Tag facets are load-bearing.** contract-census is the one rule carrying
 *     a context tag. It sits second: the picker groups by the first tag, so a
 *     context-tag primary would file an orchestration rule under a compatibility
 *     bucket. Asserted through the engine's own facet kernel, not by string.
 *   - **The sentence IS the floor.** Each rule's value is a handful of clauses a
 *     well-meaning edit would smooth away: the file-disjoint/contract-disjoint
 *     distinction, the facade-hold, the four states, the gating-test clause, the
 *     jitter and deadline mandates. Deleting the sentence deletes the behaviour,
 *     so the sentences are asserted.
 *   - **Routed depth stays routed.** Threshold tables belong to the verify
 *     skill's testability axis and accessibility machinery to its UI axis. Each
 *     body is asserted to point rather than to restate — a number that reappears
 *     here is a second source of truth that no gate reads.
 *   - **Attach-shape edge cases.** A glob-scoped rule meets repos its globs never
 *     match, and a rule about tests attaches from a test file while binding the
 *     whole change. Both are asserted as wording properties: no applicability
 *     hedging, no clause scoped to the file that triggered the attach.
 *
 * Prose assertions run against a whitespace-flattened view ({@link flow}) so a
 * reflowed paragraph is not a failure; structural assertions (headings, table
 * rows, bullets, caps) run against the raw body.
 */

/** Body cap for every rule: the authoring anatomy's ceiling. */
const RULE_BODY_CAP = 120;

/**
 * Both sanctioned rule activation modes — neither one narrower than the other,
 * and neither optional (content-classes SoT, class row 5; a maintainer ruling of
 * 2026-08-16). `always` is banned corpus-wide: that layer is the charter's.
 */
const RULE_SCOPES: readonly string[] = ["agent-requested", "conditional"];

interface QualityRule {
  /** Bare frontmatter id, which is also the filename slug. */
  id: string;
  relPath: string;
  tags: string[];
  scope: "agent-requested" | "conditional";
  /** Declared exactly when the scope is conditional. */
  globs?: string[];
}

const RULES: readonly QualityRule[] = [
  {
    id: "contract-census",
    relPath: "rules/stamity-contract-census.md",
    tags: ["orchestration", "ctx:brownfield"],
    scope: "conditional",
    globs: [
      "src/**",
      "lib/**",
      "app/**",
      "apps/**",
      "packages/**",
      "services/**",
      "internal/**",
      "pkg/**",
    ],
  },
  {
    id: "ui-states",
    relPath: "rules/stamity-ui-states.md",
    tags: ["implementation"],
    scope: "conditional",
    globs: ["**/components/**", "**/pages/**", "**/views/**", "**/*.tsx", "**/*.vue", "**/*.svelte"],
  },
  {
    id: "testing",
    relPath: "rules/stamity-testing.md",
    tags: ["review", "implementation"],
    scope: "conditional",
    globs: ["**/*.test.*", "**/*.spec.*", "**/tests/**", "**/__tests__/**"],
  },
  {
    id: "resilience",
    relPath: "rules/stamity-resilience.md",
    tags: ["devops", "implementation"],
    scope: "conditional",
    globs: ["**/server/**", "**/services/**", "**/api/**", "**/workers/**", "**/queue/**"],
  },
];

/** One walk for the whole suite; the corpus does not change under it. */
const corpus = walkAllMarkdown();

async function load(relPath: string): Promise<CorpusFile> {
  const file = (await corpus).find((candidate) => candidate.relPath === relPath);
  if (file === undefined) {
    throw new Error(`${relPath}: not present under the corpus root`);
  }
  return file;
}

/** Every whitespace run collapsed, so a wrapped sentence still reads as one. */
function flatten(text: string): string {
  return text.replace(/\s+/g, " ");
}

/** The whole body, flattened. */
function flow(file: CorpusFile): string {
  return flatten(file.parsed.body);
}

/** The text of a top-level `## <heading>` section, up to the next top-level heading. */
function section(file: CorpusFile, heading: string): string {
  const marker = `\n## ${heading}\n`;
  const start = file.parsed.body.indexOf(marker);
  expect(start, `${file.relPath}: no "## ${heading}" section`).toBeGreaterThanOrEqual(0);
  const rest = file.parsed.body.slice(start + marker.length);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

/** Top-level `- ` bullets in a section, each flattened with its continuation lines. */
function bullets(sectionText: string): string[] {
  const collected: string[] = [];
  for (const line of sectionText.split("\n")) {
    if (line.startsWith("- ")) {
      collected.push(line.slice(2));
    } else if (line.startsWith("  ") && collected.length > 0) {
      collected[collected.length - 1] += ` ${line.trim()}`;
    }
  }
  return collected.map(flatten);
}

/**
 * One numbered Floor item, flattened: from `N. ` through its indented
 * continuation lines. Numbering is the item's identity, so a reordered list
 * fails loudly here rather than matching the wrong clause.
 */
function floorItem(file: CorpusFile, index: number): string {
  const lines = section(file, "Floor").split("\n");
  const start = lines.findIndex((line) => line.startsWith(`${index}. `));
  expect(start, `${file.relPath}: no Floor item ${index}`).toBeGreaterThanOrEqual(0);
  const collected = [lines[start] ?? ""];
  for (const line of lines.slice(start + 1)) {
    if (/^\d+\. /.test(line)) break;
    collected.push(line);
  }
  return flatten(collected.join(" ")).trim();
}

describe("quality rules — frontmatter contract", () => {
  it.each(RULES)("$id carries the rule identity head", async (rule) => {
    const file = await load(rule.relPath);

    expect(frontmatterField(file.parsed, "id")).toBe(rule.id);
    expect(filenameSlug(file.relPath)).toBe(rule.id);
    expect(frontmatterField(file.parsed, "type")).toBe("rule");
    expect(frontmatterField(file.parsed, "tags")).toEqual(rule.tags);

    const description = frontmatterField(file.parsed, "description");
    expect(typeof description).toBe("string");
    expect(String(description).length).toBeGreaterThan(0);
    expect(String(description).length).toBeLessThanOrEqual(1024);
    // Third person: a description addressing the reader is second person by construction.
    expect(String(description)).not.toMatch(/\b(?:you|your|yours|yourself)\b/i);

    // Rules load on context match. Only the charter may declare `always`.
    requireLoadClass(file, ["on-demand"]);
    requireObsoleteWhen(file);
  });

  it.each(RULES)("$id declares a sanctioned activation shape", async (rule) => {
    const file = await load(rule.relPath);
    const scope = frontmatterField(file.parsed, "scope");
    const globs = frontmatterField(file.parsed, "globs");

    expect(RULE_SCOPES).toContain(scope);
    expect(scope).toBe(rule.scope);
    // `scope: always` is banned in rules — always-on content is the charter's.
    expect(scope).not.toBe("always");

    if (rule.scope === "conditional") {
      // Authored as a YAML string array, not a bare CSV: the engine's glob
      // reader accepts both, and only one of them survives review intact.
      expect(globs).toEqual(rule.globs);
      expect(Array.isArray(globs) && globs.length > 0).toBe(true);
    } else {
      // An agent-requested rule declaring globs is a hard contradiction in the
      // companion transform, so the absence is asserted, not assumed.
      expect(globs).toBeUndefined();
    }
  });

  it("keeps the context tag off the primary slot on contract-census", async () => {
    const file = await load("rules/stamity-contract-census.md");
    const tags = frontmatterField(file.parsed, "tags") as string[];

    // The picker groups by the first tag. A `ctx:*` primary would file an
    // orchestration rule under a compatibility bucket instead.
    expect(tags).toContain("ctx:brownfield");
    expect(isContextTag(tags[0] ?? "")).toBe(false);
    expect(facetOf(tags[0] ?? "")).toBe("capability");
    expect(primaryTag(tags)).toBe("orchestration");
  });

  it("projects to Cursor companions with no warnings and the expected shapes", async () => {
    const index = await loadCorpusIndex();
    // Scoped to this unit's four rules: a sibling unit's rule defect belongs to
    // that unit's suite, not to this one.
    const owned = index.items.filter(
      (item) => item.type === "rule" && RULES.some((rule) => rule.id === item.id),
    );
    expect(owned.map((item) => item.id).toSorted()).toEqual(RULES.map((rule) => rule.id).toSorted());

    const warnings: string[] = [];
    const companions = planMdcCompanions(owned, { warnings });

    expect(warnings).toEqual([]);
    expect(companions).toHaveLength(RULES.length);

    for (const rule of RULES) {
      const companion = companions.find((planned) =>
        planned.outputPath.endsWith(`stamity-${rule.id}.mdc`),
      );
      expect(companion, `${rule.relPath}: no planned companion`).toBeDefined();
      const content = companion?.content ?? "";
      expect(content).toContain("alwaysApply: false");
      expect(content).not.toContain("alwaysApply: true");
      if (rule.scope === "conditional") {
        const rendered = (rule.globs ?? []).map((glob) => `"${glob}"`).join(", ");
        expect(content).toContain(`globs: [${rendered}]`);
      } else {
        expect(content).not.toContain("globs:");
      }
    }
  });
});

describe("quality rules — body budget and write-path hygiene", () => {
  it.each(RULES)("$id stays inside the rule body cap and scans clean", async (rule) => {
    const file = await load(rule.relPath);

    assertLineCap(file, RULE_BODY_CAP);
    // Asserted twice: the harness helper is the corpus-wide gate, and the
    // explicit scan names any offending pattern id in the failure message.
    assertDenyClean(file);
    const hits = scanForDeniedPatterns(file.parsed.body, CONTENT_DENY_PATTERNS).filter(
      (hit) => hit.severity === "block",
    );
    expect(hits.map((hit) => hit.patternId)).toEqual([]);
  });

  it.each(RULES)("$id opens with a title and carries Floor and Gates", async (rule) => {
    const file = await load(rule.relPath);

    expect(file.parsed.body.trimStart()).toMatch(/^# \S/);
    expect(section(file, "Floor").trim().length).toBeGreaterThan(0);
    expect(section(file, "Gates").trim().length).toBeGreaterThan(0);
  });

  it.each(RULES)("$id mints no URL", async (rule) => {
    const file = await load(rule.relPath);

    // Content links no product domain; these four cite no external standard by
    // URL at all, so the absence is exact rather than allowlisted.
    expect(file.parsed.body).not.toMatch(/https?:\/\//);
  });
});

describe("contract-census — file-disjoint is not contract-disjoint", () => {
  it("states the distinction and names the classes it covers", async () => {
    const file = await load("rules/stamity-contract-census.md");
    const text = flow(file);

    expect(text).toMatch(/file-disjoint is not contract-disjoint/i);
    expect(text).toMatch(/share no file still collide/i);
    for (const cls of ["symbol", "persisted-name", "wire-field", "event", "constant", "config-key"]) {
      expect(text).toContain(cls);
    }
  });

  it("fixes the census grammar: one row per contract, before dispatch", async () => {
    const file = await load("rules/stamity-contract-census.md");
    const text = flow(file);
    const columns = [...file.parsed.body.matchAll(/^\| (Contract|Class|Producer|Consumers|Change kind) \|/gm)];

    expect(text).toMatch(/one row per\s+shared contract/i);
    expect(columns.map((match) => match[1])).toEqual([
      "Contract",
      "Class",
      "Producer",
      "Consumers",
      "Change kind",
    ]);
    // The census closes with a value, not with a narrative.
    expect(text).toContain("`clean`");
    expect(text).toContain("`reconciled(N)`");
    expect(text).toContain("`N unreconciled`");
  });

  it("searches the repository rather than the unit's file list", async () => {
    const text = flow(await load("rules/stamity-contract-census.md"));

    expect(text).toMatch(/consumer search spans the repository, not the unit/i);
    expect(text).toMatch(/constants by name \*and\* by literal value/i);
    expect(text).toMatch(/a consumer outside the unit's file list is the normal case/i);
  });

  it("holds the facade when two units need one contract", async () => {
    const file = await load("rules/stamity-contract-census.md");
    const text = flow(file);

    expect(text).toContain("facade");
    expect(text).toMatch(/exactly one unit owns the change/i);
    expect(text).toMatch(/codes against the held facade/i);
    // Nulled, not removed: absence is the shape change a reader misses.
    expect(text).toMatch(/explicit null rather than removed/i);
    expect(text).toMatch(/zero unguarded readers/i);
    expect(flatten(section(file, "Gates"))).toMatch(/removed, or nulled behind the facade/i);
  });

  it("states the mid-flight path in a two-sentence budget", async () => {
    const file = await load("rules/stamity-contract-census.md");
    const item = floorItem(file, 4);

    // Edge case: contracts discovered during the build. The path is re-census
    // plus facade-hold, and it stays short enough to act on mid-flight — the
    // budget is asserted in words and sentences so a reflow is not a failure.
    expect(item).toMatch(/mid-flight/i);
    expect(item).toMatch(/re-censused across the units still running/i);
    expect(item).toMatch(/facade-hold/i);
    expect(item.split(/\s+/).length).toBeLessThanOrEqual(60);
    expect(item.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(3);
  });

  it("ranks silent-wrong above loud-broken in the gates", async () => {
    const gates = flatten(section(await load("rules/stamity-contract-census.md"), "Gates"));

    expect(gates).toMatch(/critical finding/i);
    expect(gates).toMatch(/a removed import fails the build, a stale constant computes a wrong value/i);
    expect(gates).toMatch(/re-levelled sequential/i);
  });
});

describe("ui-states — the four-state contract", () => {
  it("names all four states as rows with a trigger and a render", async () => {
    const file = await load("rules/stamity-ui-states.md");
    const rows = [...file.parsed.body.matchAll(/^\| (Loading|Empty|Error|Success) \| ([^|]+)\| ([^|]+)\|/gm)];

    expect(rows.map((match) => match[1])).toEqual(["Loading", "Empty", "Error", "Success"]);
    for (const row of rows) {
      expect((row[2] ?? "").trim().length).toBeGreaterThan(0);
      expect((row[3] ?? "").trim().length).toBeGreaterThan(0);
    }
    // One state value, not overlapping booleans.
    expect(flow(file)).toMatch(/the state is one value, not a set of independent booleans/i);
  });

  it("requires actionable errors and designed empty states", async () => {
    const file = await load("rules/stamity-ui-states.md");
    const text = flow(file);

    expect(text).toMatch(/one sentence for what failed, one action that recovers it/i);
    expect(text).toMatch(/status codes, exception class names, null, undefined — stays in logs/i);
    expect(text).toMatch(/empty states are designed by sub-type, not defaulted/i);
    expect(text).toMatch(/nothing exists yet.*filter or query excluded everything.*access is missing/i);
    // The archetypal wrong-sub-type defect, named so it is recognisable.
    expect(text).toMatch(/"clear filters" on a\s+first-run surface/i);
  });

  it("conditions i18n and token mandates on the layer the repo already has", async () => {
    const text = flow(await load("rules/stamity-ui-states.md"));

    expect(text).toMatch(/strings come from the localisation layer where the repo has one/i);
    expect(text).toMatch(/styling comes from the token system where the repo has one/i);
    expect(text).toMatch(/where detection reports no\s+token source/i);
    expect(text).toMatch(/plural and gender variants carried inside the message/i);
  });

  it("keeps the accessibility floor and routes the scanner rows to the verify UI axis", async () => {
    const file = await load("rules/stamity-ui-states.md");
    const text = flow(file);

    expect(text).toMatch(/every control\s+resolves to an accessible name/i);
    expect(text).toMatch(/focus remains visible/i);
    expect(text).toMatch(/belong to the verify skill's UI axis/i);
    // Routed depth stays routed: no ratios, no criterion numbers, no standard ids.
    expect(file.parsed.body).not.toMatch(/\b\d(?:\.\d)?\s*:\s*1\b/);
    expect(file.parsed.body).not.toMatch(/\bWCAG\b|\bSC \d/);
  });

  it("carries no applicability hedging — the globs are the filter", async () => {
    const file = await load("rules/stamity-ui-states.md");

    // Edge case: a backend-only repo. The globs simply never match, so the body
    // states its floor without asking whether it applies.
    expect(frontmatterField(file.parsed, "scope")).toBe("conditional");
    expect(flow(file)).not.toMatch(
      /if (?:this|your|the) (?:project|repo|repository|app) (?:has no|does not|contains no)/i,
    );
    expect(flow(file)).not.toMatch(/skip this rule|does not apply|ignore this section|not applicable/i);
  });
});

describe("testing — behaviour assertions and the gating-test clause", () => {
  it("binds assertions to behaviour and ships a regression case per fix", async () => {
    const text = flow(await load("rules/stamity-testing.md"));

    expect(text).toMatch(/assert behaviour, not implementation/i);
    expect(text).toMatch(/breaks on a refactor that keeps every promise/i);
    expect(text).toMatch(/every defect fix ships its regression case/i);
    expect(text).toMatch(/fails against the\s+unfixed code and passes after/i);
    expect(text).toMatch(/the name states the invariant/i);
  });

  it("states no green, no done with the Not done: escape hatch", async () => {
    const file = await load("rules/stamity-testing.md");
    const text = flow(file);

    expect(text).toMatch(/no green, no done/i);
    expect(text).toContain("`Not done:`");
    expect(text).toMatch(/reports success while a gate is red is the defect/i);
  });

  it("states the gating-test clause self-contained, binding the whole change", async () => {
    const file = await load("rules/stamity-testing.md");
    const item = floorItem(file, 5);

    // Edge case: the rule attaches because a test file was read, but the clause
    // binds the author of the change — not only the file that triggered the
    // attach. The wording carries that scope itself, with no deferral to a
    // command or agent body that may not be loaded in this session.
    expect(item).toMatch(/gating tests are never weakened by the change that makes them pass/i);
    expect(item).toMatch(/regardless of which file the work started in/i);
    for (const evasion of ["edited", "deleted", "skipped", "expected-to-fail", "weaker matcher", "excluded by configuration"]) {
      expect(item.toLowerCase()).toContain(evasion);
    }
    expect(item).toMatch(/carries an inline reason/i);
    expect(item).toMatch(/changed test files as part\s*of the diff/i);
    expect(item).not.toMatch(/see |per the |as stated in|refer to/i);
    expect(item).not.toMatch(/\/st-\w+/);
  });

  it("keeps mocks justified and determinism injected", async () => {
    const text = flow(await load("rules/stamity-testing.md"));

    expect(text).toMatch(/real dependency first; each mock carries its reason/i);
    expect(text).toMatch(/inline\s+note naming what makes the real one unusable/i);
    expect(text).toMatch(/substitute for the unit under test is a design signal/i);
    expect(text).toMatch(/determinism is injected, not hoped for/i);
    expect(text).toMatch(/flaky by construction/i);
    // Degenerate-input guard: one input must activate the computation.
    expect(text).toMatch(/at least one input activates the computation/i);
    expect(text).toMatch(/differs from that degenerate\s+baseline/i);
  });

  it("routes numeric thresholds to the verify testability axis instead of restating them", async () => {
    const file = await load("rules/stamity-testing.md");

    expect(flow(file)).toMatch(/verify skill's testability\s+axis/i);
    expect(flow(file)).toMatch(/numeric floors.*are\s+the repository's own/i);
    // A percentage or score target here would be a second source of truth that
    // no gate reads — the axis reads the repo's own configuration instead.
    expect(file.parsed.body).not.toMatch(/\d+\s*%|\bpercent\b/i);
  });

  it("gates a silenced case on a tracking reference and an owner", async () => {
    const gates = flatten(section(await load("rules/stamity-testing.md"), "Gates"));

    expect(gates).toMatch(/skipped, excluded, quarantined/i);
    expect(gates).toMatch(/tracking\s+reference and an owner/i);
    expect(gates).toMatch(/green only on degenerate inputs/i);
  });
});

describe("resilience — breakers, jitter, deadlines, idempotency", () => {
  it("names the breaker's threshold semantics without minting fixed numbers", async () => {
    const file = await load("rules/stamity-resilience.md");
    const text = flow(file);

    expect(text).toMatch(/circuit breaker per external dependency/i);
    expect(text).toMatch(/failure count or\s+ratio that opens it/i);
    expect(text).toMatch(/rolling window/i);
    expect(text).toMatch(/minimum request volume/i);
    expect(text).toMatch(/cooldown before one trial call/i);
    expect(text).toMatch(/one breaker per\s+dependency/i);
    // Concrete tunings are repo data, not corpus content.
    expect(file.parsed.body).not.toMatch(/\b\d+\s*(?:ms|s|sec|secs|seconds|minutes|%)\b/i);
  });

  it("separates transient from substantive failure", async () => {
    const text = flow(await load("rules/stamity-resilience.md"));

    expect(text).toMatch(/only a transient failure counts toward the threshold/i);
    expect(text).toMatch(/rejected argument or a failed authorisation/i);
    expect(text).toMatch(/neither open breakers nor consume retry budget/i);
    expect(text).toMatch(/unmapped failure is\s+treated as transient with a single attempt/i);
  });

  it("requires decorrelated jitter under a budget, inside the breaker", async () => {
    const text = flow(await load("rules/stamity-resilience.md"));

    expect(text).toMatch(/retry with decorrelated jitter, under a budget/i);
    expect(text).toMatch(/randomly between the base delay and three times the previous delay/i);
    expect(text).toMatch(/backoff without jitter synchronises every client/i);
    expect(text).toMatch(/server-supplied retry-after\s+wins/i);
    expect(text).toMatch(/retries wrap inside the breaker/i);
  });

  it("propagates the deadline and never resets it", async () => {
    const text = flow(await load("rules/stamity-resilience.md"));

    expect(text).toMatch(/the deadline propagates and never resets/i);
    expect(text).toMatch(/passes down what is left, minus its own overhead/i);
    expect(text).toMatch(/no hop restores the original value/i);
    expect(text).toMatch(/cancelled rather than awaited/i);
    expect(text).toMatch(/parent budget spent,\s+no retry is attempted/i);
  });

  it("requires idempotent handlers for at-least-once delivery", async () => {
    const text = flow(await load("rules/stamity-resilience.md"));

    expect(text).toMatch(/handlers are idempotent, because delivery is at-least-once/i);
    expect(text).toMatch(/processing it twice reaches the same end state/i);
    expect(text).toMatch(/caller-generated\s+key, stable across every attempt/i);
    expect(text).toMatch(/replays the stored outcome for a duplicate/i);
  });

  it("carries the slim observability floor without a metrics catalogue", async () => {
    const file = await load("rules/stamity-resilience.md");
    const text = flow(file);

    expect(text).toMatch(/correlation identifier that travels with the deadline/i);
    expect(text).toMatch(/request\s+rate, error count by class, and duration distribution/i);
    expect(text).toMatch(/breaker state transition/i);
    expect(text).toMatch(/pool usage, queue depth/i);
    expect(text).toMatch(/no\s+credential, token value, or personal datum enters a log line/i);
  });

  it("phrases every gate on the call that exists, not on a service that might not", async () => {
    const file = await load("rules/stamity-resilience.md");
    const gateBullets = bullets(section(file, "Gates"));

    // Edge case: a repo with no external dependency. Each gate is quantified
    // over calls, handlers, and dependencies, so an empty set satisfies it —
    // no vacuous mandate, and no hedging sentence to carry the exception.
    expect(gateBullets.length).toBeGreaterThanOrEqual(4);
    for (const gate of gateBullets) {
      expect(
        gate,
        `resilience gate is not quantified over a trigger: ${gate}`,
      ).toMatch(/\b(call|handler|dependency|retry|breaker|timeout|metric|log line)\b/i);
    }
    expect(flow(file)).not.toMatch(
      /if (?:this|your|the) (?:project|repo|repository|service) (?:has no|does not|contains no)/i,
    );
    expect(flow(file)).not.toMatch(/skip this rule|does not apply|not applicable/i);
  });
});
