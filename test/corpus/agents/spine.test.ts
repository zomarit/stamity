import { describe, expect, it } from "vitest";
import { frontmatterField } from "../../../src/content/frontmatter.ts";
import { MODEL_LADDER } from "../../../src/roster/modelLadder.ts";
import { DEFAULT_MAX_REVIEW_ITERATIONS } from "../../../src/roster/reviewCaps.ts";
import { FUNCTIONAL_TOOL_CATEGORIES } from "../../../src/tools/categories.ts";
import {
  assertDenyClean,
  assertLineCap,
  filenameSlug,
  requireLoadClass,
  requireObsoleteWhen,
  walkAllMarkdown,
  type CorpusFile,
} from "../harness.ts";

/**
 * The four spine agents — researcher, implementer, reviewer, fixer — as a contract over
 * their shipped bodies.
 *
 * What this suite binds, and why each check is here rather than left to prose review:
 *
 *   - **Privilege is frontmatter, not habit.** `capabilities` is the grant the roster
 *     policy mirrors, so its values are checked against the engine's own functional
 *     category vocabulary and its per-agent shape is pinned: a reviewer that gains
 *     `edit`, or a researcher that gains `execute`, is a privilege change that has to
 *     show up as a failing test rather than as a quiet frontmatter edit.
 *   - **Model independence.** `model_class` carries a class name from the four-class
 *     ladder — the doctrine's contract is that a capability shift can obsolete an artifact
 *     but never strand its wording. The companion half, that no body names a vendor or a
 *     model id, is deliberately NOT checked here: it is invariant 17 in
 *     `test/corpus/invariants.test.ts`, one token list over every shipped markdown file.
 *     This suite's own copy was deleted, and the re-add
 *     guard that keeps it deleted lives beside the list it protects — invariant 17's
 *     "no suite under test/corpus/agents/ re-implements this check" case — so the tokens
 *     are named in exactly one file instead of being mirrored back into this one.
 *   - **The contract sentences ARE the agent.** For these four the body text is the
 *     mechanism: the brief schema, the single-writer stop, the posting gates, the round
 *     ladder. Deleting the sentence deletes the behaviour, so the sentences are asserted.
 *   - **The shared return contract is inlined per consumer**, so each body is checked for
 *     the full status enum and severity scale on its own rather than by reference.
 *
 * Prose assertions run against a whitespace-flattened view ({@link flow}) so a reflowed
 * paragraph is not a failure; structural assertions (headings, tables, caps) run against
 * the raw body. Corpus-wide roster and cross-reference census live in the invariant
 * suite; the constants below are this unit's local slice.
 */

/** The four-class model ladder. Class names only — concrete ids are per-client config. */
const MODEL_CLASSES: readonly string[] = ["frontier", "advanced", "standard", "economy"];

/**
 * Body cap for an agent definition. The engine's lean-line ceiling, made hard for
 * canonical content: an agent that needs more than this is carrying a procedure that
 * belongs in a skill or a rule.
 */
const AGENT_BODY_CAP = 350;

/** The status enum every sub-agent returns, inlined in every body. */
const STATUS_ENUMS: readonly string[] = [
  "DONE",
  "BLOCKED_AMBIGUITY",
  "BLOCKED_DEPENDENCY",
  "BLOCKED_FAILURE",
];

/** The researcher's six required brief keys, in schema order. */
const REQUIRED_BRIEF_KEYS: readonly string[] = [
  "objective",
  "scope",
  "questions",
  "output_sections",
  "depth",
  "tool_tier",
];

/**
 * How each key is spelled where a command enumerates a brief. The commands write prose
 * ("named output sections", "tool tier") while the schema writes the key, so a token match
 * would report a supplied key as missing — matching on the spelling set is what makes the
 * cross-file count comparable at all.
 */
const BRIEF_KEY_SPELLINGS: Readonly<Record<string, RegExp>> = {
  objective: /objective/i,
  scope: /scope/i,
  questions: /questions/i,
  output_sections: /output[_ ]sections|named output sections/i,
  depth: /depth/i,
  tool_tier: /tool[_ ]tier/i,
  handoff_to: /handoff[_ ]to/i,
};

/**
 * The three commands that ENUMERATE a researcher brief, and the enumeration each carries.
 * The other spawn sites brief a researcher without listing keys, so they say nothing about
 * the schema's required set and are out of this comparison.
 */
const BRIEF_ENUMERATION_SITES: readonly {
  relPath: string;
  enumeration: RegExp;
  suppliesHandoff: boolean;
}[] = [
  {
    relPath: "commands/st-ask.md",
    enumeration: /Each researcher brief carries:([^.]*)\./,
    suppliesHandoff: true,
  },
  {
    relPath: "commands/st-work.md",
    enumeration: /Every brief carries([^.]*)\./,
    suppliesHandoff: false,
  },
  {
    relPath: "commands/st-spec.md",
    enumeration: /\| `researcher` \|[^|]*\|([^|]*)\|/,
    suppliesHandoff: false,
  },
];

interface SpineAgent {
  /** Bare frontmatter id, which is also the filename slug. */
  id: string;
  relPath: string;
  tags: string[];
  /** Functional tool categories the definition grants; mirrored by the roster policy. */
  capabilities: string[];
  modelClass: string;
}

const SPINE: readonly SpineAgent[] = [
  {
    id: "researcher",
    relPath: "agents/stamity-researcher.md",
    tags: ["planning", "floor:spine"],
    capabilities: ["read", "network"],
    modelClass: "standard",
  },
  {
    id: "implementer",
    relPath: "agents/stamity-implementer.md",
    tags: ["implementation", "floor:spine"],
    capabilities: ["read", "edit", "execute"],
    modelClass: "advanced",
  },
  {
    id: "reviewer",
    relPath: "agents/stamity-reviewer.md",
    tags: ["review", "floor:spine"],
    capabilities: ["read"],
    modelClass: "advanced",
  },
  {
    id: "fixer",
    relPath: "agents/stamity-fixer.md",
    tags: ["implementation", "review", "floor:spine"],
    capabilities: ["read", "edit", "execute"],
    modelClass: "standard",
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

/** The body with every whitespace run collapsed, so a wrapped sentence still reads as one. */
function flow(file: CorpusFile): string {
  return file.parsed.body.replace(/\s+/g, " ");
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

/** The backticked key a brief-schema table row declares. */
function keyOf(row: string): string {
  return /`([a-z_]+)`/.exec(row)?.[1] ?? "";
}

/** Data rows of the first markdown table in `text`: header and separator dropped. */
function tableRows(text: string): string[] {
  const piped = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  const separator = piped.findIndex((line) => /^\|[\s:|-]+\|$/.test(line));
  expect(separator, "no markdown table found").toBeGreaterThanOrEqual(0);
  const rows: string[] = [];
  for (const line of piped.slice(separator + 1)) {
    if (/^\|[\s:|-]+\|$/.test(line)) break;
    rows.push(line);
  }
  return rows;
}

describe("agent spine — frontmatter contract", () => {
  it.each(SPINE)("$id carries the agent identity head", async (agent) => {
    const file = await load(agent.relPath);

    expect(frontmatterField(file.parsed, "id")).toBe(agent.id);
    expect(filenameSlug(file.relPath)).toBe(agent.id);
    expect(frontmatterField(file.parsed, "type")).toBe("agent");
    // Capability tag first: the picker groups an artifact under its primary tag.
    expect(frontmatterField(file.parsed, "tags")).toEqual(agent.tags);

    const description = frontmatterField(file.parsed, "description");
    expect(typeof description).toBe("string");
    expect(String(description).length).toBeGreaterThan(0);
    expect(String(description).length).toBeLessThanOrEqual(1024);
    // Third person: a description addressing the reader is second person by construction.
    expect(String(description)).not.toMatch(/\b(?:you|your|yours|yourself)\b/i);

    // Agents load when spawned. Only the charter may declare `always`.
    requireLoadClass(file, ["on-demand"]);
    requireObsoleteWhen(file);

    // `tools:` is the engine's target-tool restriction; the corpus ships everywhere.
    expect(frontmatterField(file.parsed, "tools")).toBeUndefined();
  });

  it.each(SPINE)("$id grants capabilities from the functional category set", async (agent) => {
    const file = await load(agent.relPath);
    const capabilities = frontmatterField(file.parsed, "capabilities");

    expect(capabilities).toEqual(agent.capabilities);
    expect(agent.capabilities.length).toBeGreaterThan(0);
    for (const capability of agent.capabilities) {
      // The grant vocabulary is the engine's, not a parallel list minted in content.
      expect(FUNCTIONAL_TOOL_CATEGORIES as readonly string[]).toContain(capability);
    }
  });

  it("keeps the reviewer read-only and the researcher non-mutating", async () => {
    const reviewer = await load("agents/stamity-reviewer.md");
    const researcher = await load("agents/stamity-researcher.md");

    // A reviewer that can edit reviews its own fixes; a researcher that can execute is no
    // longer a read path. Both directions are the grant, so both are pinned.
    expect(frontmatterField(reviewer.parsed, "capabilities")).toEqual(["read"]);
    expect(frontmatterField(researcher.parsed, "capabilities")).not.toContain("edit");
    expect(frontmatterField(researcher.parsed, "capabilities")).not.toContain("execute");
  });

  it.each(SPINE)("$id declares a plain model class from the ladder", async (agent) => {
    const file = await load(agent.relPath);
    const modelClass = frontmatterField(file.parsed, "model_class");

    expect(modelClass).toBe(agent.modelClass);
    expect(MODEL_CLASSES).toContain(String(modelClass));
  });

});

describe("agent spine — body budget and shared return contract", () => {
  it.each(SPINE)("$id stays inside the agent body cap and scans clean", async (agent) => {
    const file = await load(agent.relPath);

    assertLineCap(file, AGENT_BODY_CAP);
    assertDenyClean(file);
  });

  it.each(SPINE)("$id inlines the full status enum and severity scale", async (agent) => {
    const file = await load(agent.relPath);
    const contract = section(file, "Return contract");

    for (const status of STATUS_ENUMS) {
      expect(contract, `${agent.relPath}: return contract omits ${status}`).toContain(status);
    }
    for (const severity of ["Critical", "Warning", "Minor"]) {
      expect(contract).toContain(severity);
    }
  });

  it.each(SPINE)("$id routes ambiguity to the flow instead of the operator", async (agent) => {
    const text = flow(await load(agent.relPath));

    // Sub-agents have no ASK channel: the ambiguity gate belongs to the spawning flow.
    expect(text).toMatch(/sub-agents do not put questions to the operator/i);
    expect(text).toContain("BLOCKED_AMBIGUITY");
  });
});

describe("researcher — one brief-driven definition", () => {
  it("states all seven brief-schema keys verbatim", async () => {
    const schema = section(await load("agents/stamity-researcher.md"), "Brief schema");

    for (const key of [
      "objective",
      "scope",
      "questions",
      "output_sections",
      "depth",
      "tool_tier",
      "handoff_to",
    ]) {
      expect(schema, `brief schema omits \`${key}\``).toContain(key);
    }
    // The schema replaces a mode roster, so the depth and tool tiers are enumerated here.
    expect(schema).toContain("pattern-match-checklist");
    expect(schema).toMatch(/quick/);
    expect(schema).toMatch(/standard/);
    expect(schema).toMatch(/deep/);
    expect(schema).toContain("codebase");
    expect(schema).toContain("+docs");
    expect(schema).toContain("+web");
  });

  it("requires exactly the keys every enumerating spawn site supplies", async () => {
    // The schema declared seven keys and returned BLOCKED_AMBIGUITY on any omission, while
    // two of the three commands that enumerate a brief stop at the tool tier — so a
    // well-formed spawn from either one was contractually under-specified. The schema now
    // splits the six they all supply from the one only `/st-ask` sends, and this case
    // holds that split to the commands rather than to a number written twice.
    const schema = section(await load("agents/stamity-researcher.md"), "Brief schema");
    const rows = tableRows(schema);
    expect(rows).toHaveLength(7);

    const required = rows.filter((row) => /^\|[^|]*\|\s*yes\s*\|/.test(row));
    const defaulted = rows.filter((row) => /^\|[^|]*\|\s*defaulted\s*\|/.test(row));

    expect(required.map(keyOf)).toEqual(REQUIRED_BRIEF_KEYS);
    expect(defaulted.map(keyOf)).toEqual(["handoff_to"]);
    // A defaulted key without a stated default is the same under-specification one level down.
    expect(defaulted[0]).toMatch(/Absent, the consumer is the spawning flow itself/);

    const sites = await Promise.all(
      BRIEF_ENUMERATION_SITES.map(async (site) => ({ site, body: flow(await load(site.relPath)) })),
    );
    for (const { site, body } of sites) {
      const enumeration = site.enumeration.exec(body)?.[1];
      expect(enumeration, `${site.relPath}: no researcher-brief enumeration found`).toBeDefined();

      for (const key of REQUIRED_BRIEF_KEYS) {
        expect(
          BRIEF_KEY_SPELLINGS[key]?.test(String(enumeration)),
          `${site.relPath} never supplies required key \`${key}\``,
        ).toBe(true);
      }
      // The other direction is what forces the default: the key two of these sites do not
      // send may not be required, and the one that does send it keeps it meaningful.
      expect(
        BRIEF_KEY_SPELLINGS["handoff_to"]?.test(String(enumeration)),
        `${site.relPath}: handoff_to presence changed`,
      ).toBe(site.suppliesHandoff);
    }
  });

  it("defines the confidence basis once, in words its consumers can be answered in", async () => {
    // Four spellings of one field's basis shipped at once, and two commands demanded from a
    // researcher a triad it never promised. The triad is defined here now, and it absorbs
    // the consumer spellings by name so a brief written in one of them has a mapping instead
    // of provoking a fifth vocabulary.
    const contract = section(await load("agents/stamity-researcher.md"), "Output contract").replace(
      /\s+/g,
      " ",
    );

    expect(contract).toMatch(/the basis comes from one closed triad, and this is where the triad is defined/i);
    for (const basis of ["`direct`", "`inferred`", "`unverified`"]) {
      expect(contract, `basis vocabulary omits ${basis}`).toContain(basis);
    }
    for (const spelling of [
      "direct measurement",
      "sampled observation",
      "inference from analogue",
      "unverified reading",
    ]) {
      expect(contract, `no mapping for the consumer spelling "${spelling}"`).toContain(spelling);
    }

    // The demand is real, which is what makes the mapping load-bearing rather than decorative.
    const consumers = ["commands/st-pr-resolve.md", "commands/st-rework.md"];
    const demands = await Promise.all(
      consumers.map(async (relPath) => ({ relPath, text: flow(await load(relPath)) })),
    );
    for (const { relPath, text } of demands) {
      expect(text, `${relPath} asks for no basis`).toMatch(
        /direct measurement, sampled observation, or inference from analogue/i,
      );
    }
  });

  it("scales researcher count to the brief, not to the budget", async () => {
    const scaling = section(await load("agents/stamity-researcher.md"), "Effort scaling").replace(
      /\s+/g,
      " ",
    );

    expect(scaling).toMatch(/two to four in parallel/i);
    expect(scaling).toMatch(/serialize only on a dependency edge/i);
    expect(scaling).toMatch(/not its token budget/i);
  });

  it("keeps the breaking-change taxonomy in the body", async () => {
    const file = await load("agents/stamity-researcher.md");
    const body = file.parsed.body;

    for (const category of [
      "api_signature",
      "type_shape",
      "event_schema",
      "public_interface",
      "data_migration",
      "cli_contract",
    ]) {
      expect(body, `breaking-change taxonomy omits ${category}`).toContain(category);
    }
  });

  it("degrades summaries before evidence and never truncates security content", async () => {
    const file = await load("agents/stamity-researcher.md");
    const degradation = section(file, "Degradation policy");
    const text = degradation.replace(/\s+/g, " ");

    // Ordering is the policy, so ordering is asserted, not just membership.
    expect(degradation.indexOf("Summaries first")).toBeGreaterThanOrEqual(0);
    expect(degradation.indexOf("Evidence last")).toBeGreaterThan(
      degradation.indexOf("Summaries first"),
    );
    expect(text).toMatch(/security-relevant content is exempt at every depth and every budget/i);
    expect(text).toMatch(/reproduced in full/i);
    expect(text).toMatch(/truncating a security finding/i);
  });

  it("returns an unanswerable question set as output rather than padding", async () => {
    const text = flow(await load("agents/stamity-researcher.md"));

    // Edge case: a brief whose questions no evidence in the repo can settle.
    expect(text).toMatch(/unanswerable questions are output, not failure/i);
    expect(text).toMatch(/what was probed \(paths, greps, sources\)/i);
    expect(text).toMatch(/smallest input that would/i);
    expect(text).toMatch(/padding an unanswerable question/i);
    // Empty sections are legitimate output, stated with the probes that were run.
    expect(text).toMatch(/a section with nothing in it is emitted empty/i);
    expect(text).toMatch(/an omitted section is indistinguishable from a dropped question/i);
  });
});

describe("implementer — single unit, single writer", () => {
  it("binds the unit ceiling and one writer per file", async () => {
    const unit = section(await load("agents/stamity-implementer.md"), "Unit contract").replace(
      /\s+/g,
      " ",
    );

    expect(unit).toContain("~400 changed lines");
    expect(unit).toContain("≤8 files");
    expect(unit).toMatch(/ceilings, not targets/i);
    expect(unit).toMatch(/exactly one writer/i);
  });

  it("stops on a mid-build file overlap instead of writing into another unit", async () => {
    const text = flow(await load("agents/stamity-implementer.md"));

    // Edge case: the needed edit turns out to live in another writer's file.
    expect(text).toContain("BLOCKED_DEPENDENCY");
    expect(text).toMatch(/writing into another writer's file is a protocol breach/i);
    expect(text).toMatch(/even when the edit is correct/i);
    expect(text).toMatch(/nothing is written there, not even a comment/i);
  });

  it("ships tests with the change and protects gating tests", async () => {
    const testing = section(await load("agents/stamity-implementer.md"), "Testing rules").replace(
      /\s+/g,
      " ",
    );

    expect(testing).toMatch(/tests ship with the change that motivates them/i);
    expect(testing).toMatch(/test-first when the criterion is expressible as a failing test/i);
    expect(testing).toMatch(/mocks are justified inline/i);
    // The gating-tests clause: no silent weakening inside the change that turns it green.
    expect(testing).toMatch(/gating tests are not weakened/i);
    expect(testing).toMatch(/not edited, deleted, skipped, or special-cased/i);
    expect(testing).toMatch(/inline justification comment/i);
  });

  it("proposes a spec delta rather than writing the spec", async () => {
    const delta = section(await load("agents/stamity-implementer.md"), "Spec delta").replace(
      /\s+/g,
      " ",
    );

    expect(delta).toContain("ADDED");
    expect(delta).toContain("MODIFIED");
    expect(delta).toContain("REMOVED");
    expect(delta).toMatch(/the delta is a proposal/i);
    expect(delta).toMatch(/out of contract/i);
  });

  it("names the requirement id the delta lands under, with an honest no-ids fallback", async () => {
    const delta = section(await load("agents/stamity-implementer.md"), "Spec delta").replace(
      /\s+/g,
      " ",
    );

    // The spec author states the mandate — "Ids are the join key every other artifact
    // uses — a plan unit, a test name, a board item" — and `/st-plan` already emits its
    // delta as requirement ids. The build seam named the spec file and its SECTION, so
    // the join key went missing at the one place that produces code, and nothing on the
    // work path re-derives it (`spec-requirement-coverage` is a verify criterion, and
    // `/st-work` does not invoke that skill).
    expect(delta).toMatch(/requirement id/i);
    expect(delta).toContain("REQ-<area>-<nnn>");
    expect(delta).toMatch(/join key/i);
    // A repo whose spec carries no ids is not blocked; it falls back and says which.
    expect(delta).toMatch(/where the spec carries no ids/i);
    expect(delta).toMatch(/name the section instead and say so/i);
  });

  it("runs the repo's gate tokens locally without replacing the runner", async () => {
    const gates = section(await load("agents/stamity-implementer.md"), "Gates");

    expect(gates).toContain("${STAMITY:VERIFY_GATE_ALL}");
    expect(gates).toContain("${STAMITY:VERIFY_GATE_TEST}");
    expect(gates).toContain("${STAMITY:VERIFY_GATE_LINT}");
    expect(gates).toContain("${STAMITY:VERIFY_GATE_TYPECHECK}");
    const text = gates.replace(/\s+/g, " ");
    expect(text).toMatch(/bare pass\/fail is not a gate result/i);
    expect(text).toMatch(/a gate that did not run is reported as not run/i);
    expect(text).toMatch(/never substitutes for it/i);
  });
});

describe("reviewer — multi-lens verdict", () => {
  it("carries a ten-row rubric naming every lens", async () => {
    const file = await load("agents/stamity-reviewer.md");
    const rubric = section(file, "Rubric");
    const rows = tableRows(rubric);

    expect(rows).toHaveLength(10);
    for (const lens of [
      "UI",
      "UX",
      "Security",
      "Reliability",
      "Testability",
      "Scalability",
      "Performance",
      "Maintainability",
      "Enhancability",
      "Product & Spec",
    ]) {
      expect(
        rows.some((row) => row.startsWith(`| ${lens} |`)),
        `rubric has no row for ${lens}`,
      ).toBe(true);
    }
    expect(rubric.replace(/\s+/g, " ")).toMatch(/recorded as not applicable/i);
  });

  it("scopes itself to the diff by default and carves out the whole-branch deep pass", async () => {
    const file = await load("agents/stamity-reviewer.md");
    const rubric = section(file, "Rubric").replace(/\s+/g, " ");
    const intro = file.parsed.body.split("\n## ")[0]?.replace(/\s+/g, " ") ?? "";

    // The work flow escalates this role to the top model class for one review
    // that reads a finished branch end to end. Nothing here admitted a
    // branch-scoped input: the head said "no branch or board state", the
    // rubric said "the diff", and the nit policy scopes re-review to the
    // delta — so the flow's only justification for that rung contradicted the
    // agent it escalates. The carve-out is pinned as a DEFAULT plus one named
    // exception, not as a widened default.
    expect(rubric).toMatch(/default scope is that diff/i);
    expect(rubric).toMatch(/at deep intensity the flow invokes this role once more/i);
    expect(rubric).toMatch(/whole branch against its merge base/i);
    // A distinct invocation, so the delta-scoped re-review rule still holds.
    expect(rubric).toMatch(/distinct pass rather than a re-review round/i);
    // Read-only is unchanged; what the head forbids is MUTATION, which is what
    // it always meant — a branch the reviewer reads is not a branch it writes.
    expect(intro).toMatch(/reads only — no edits, no commands, no branch or board mutation/i);
  });

  it("loads verify axes on demand and embeds no runnable check", async () => {
    const file = await load("agents/stamity-reviewer.md");
    const body = file.parsed.body;

    // A check body copied into an agent drifts from the axis it copied; the rule is a
    // citation, and the absence of runnable commands is what makes it checkable.
    expect(body).not.toMatch(/```/);
    expect(body).not.toMatch(/^\s*\$ /m);
    const axes = section(file, "Verify axes").replace(/\s+/g, " ");
    expect(axes).toMatch(/verify skill's per-axis references/i);
    expect(axes).toMatch(/check bodies are not restated here/i);
  });

  it("keeps the critical rows and the edge-case criteria", async () => {
    const critical = section(await load("agents/stamity-reviewer.md"), "Critical rows").replace(
      /\s+/g,
      " ",
    );
    const edges = section(await load("agents/stamity-reviewer.md"), "Edge-case criteria").replace(
      /\s+/g,
      " ",
    );

    expect(critical).toMatch(/rejects unauthenticated requests/i);
    expect(critical).toMatch(/consumer census/i);
    expect(critical).toMatch(/regression test/i);
    expect(critical).toMatch(/self-certification is a blocking finding/i);
    expect(edges).toMatch(/empty and single-element inputs/i);
    expect(edges).toMatch(/partial failure/i);
    expect(edges).toMatch(/idempotent/i);
  });

  it("gates posting on locators, severity floor, and ranked evidence classes", async () => {
    const gates = section(await load("agents/stamity-reviewer.md"), "Evidence and posting gates");
    const text = gates.replace(/\s+/g, " ");

    expect(text).toMatch(/every finding asserting what the code does cites/i);
    expect(text).toContain("path:line");
    expect(text).toMatch(/only `Critical` and `Warning` findings reach the human/i);
    // Evidence classes are ranked, so the ranking order is asserted.
    const native = gates.indexOf("native client artifact");
    const file = gates.indexOf("structured result file");
    const quoted = gates.indexOf("self-quoted completion marker");
    expect(native).toBeGreaterThanOrEqual(0);
    expect(file).toBeGreaterThan(native);
    expect(quoted).toBeGreaterThan(file);
    expect(text).toMatch(/fallback when no artifact exists/i);
  });

  it("states the qualification gate before any verdict is trusted", async () => {
    const gate = section(await load("agents/stamity-reviewer.md"), "Qualification gate").replace(
      /\s+/g,
      " ",
    );

    expect(gate).toMatch(/catch rate on seeded defects/i);
    expect(gate).toMatch(/regressions from its own fix history/i);
    expect(gate).toMatch(/false-positive budget/i);
    expect(gate).toContain("10%");
    expect(gate).toContain("30%");
    expect(gate).toMatch(/advisory rather than merge-blocking/i);
  });

  it("ledgers nits and suppresses new ones on re-review", async () => {
    const nits = section(await load("agents/stamity-reviewer.md"), "Nit policy").replace(/\s+/g, " ");

    expect(nits).toMatch(/do not re-open the loop/i);
    expect(nits).toMatch(/not re-raised against unchanged code/i);
    expect(nits).toMatch(/new `Minor` findings raised on re-review are suppressed/i);
    expect(nits).toMatch(/from round two onward/i);
  });

  it("states a clean verdict explicitly when there are zero findings", async () => {
    const clean = section(await load("agents/stamity-reviewer.md"), "Zero findings").replace(
      /\s+/g,
      " ",
    );

    // Edge case: nothing found. An empty result is indistinguishable from no review.
    expect(clean).toMatch(/a clean review is a stated result, not an absence/i);
    expect(clean).toMatch(/confidence and its basis/i);
    expect(clean).toMatch(/which of the ten lenses were applied/i);
    expect(clean).toMatch(/silence is not a verdict/i);
  });
});

describe("fixer — bounded scope, escalating rounds", () => {
  it("fixes the round's findings and defers everything else", async () => {
    const scope = section(await load("agents/stamity-fixer.md"), "Scope rule").replace(/\s+/g, " ");

    expect(scope).toMatch(/the round's list, nothing else/i);
    expect(scope).toMatch(/fixed, rejected with reasoning, or unresolved with a reason/i);
    expect(scope).toMatch(/minimal change at the cause/i);
    expect(scope).toMatch(/no opportunistic edits/i);
    expect(scope).toContain("BLOCKED_DEPENDENCY");
  });

  it("answers a finding it judges wrong instead of skipping it", async () => {
    const path = section(await load("agents/stamity-fixer.md"), "Disagreement path").replace(
      /\s+/g,
      " ",
    );

    // Edge case: the fixer believes the finding is wrong. Both silent outcomes are breaches.
    expect(path).toMatch(/answered, not dropped/i);
    expect(path).toMatch(/the disposition is `rejected`/i);
    expect(path).toMatch(/carries the technical reasoning/i);
    expect(path).toMatch(/silently leaving a finding unfixed is a contract breach/i);
    expect(path).toMatch(/applying a fix believed to be wrong/i);
    expect(path).toMatch(/a rejection is a proposal/i);
  });

  it("runs the mechanical lane at the economy class with no behaviour change", async () => {
    const lane = section(await load("agents/stamity-fixer.md"), "Mechanical tier").replace(
      /\s+/g,
      " ",
    );

    expect(lane).toMatch(/economy class/i);
    expect(lane).toMatch(/changes no behaviour/i);
    expect(lane).toMatch(/does not edit test assertions/i);
    expect(lane).toMatch(/leaves the lane and returns as a `Warning`/i);
  });

  /**
   * The stage numbers derive from {@link DEFAULT_MAX_REVIEW_ITERATIONS} rather than being
   * spelled here. This case previously pinned the literal "rounds 4–5", the ladder the
   * body inherited from a SoT written against a cap of at least five; at the shipped cap
   * of four that stage was unreachable, so the body promised a round that never runs.
   * Hardcoding is what let that ship, so the assertions now track the engine: a
   * cap change fails this case instead of leaving a stale promise green. The same-fixer
   * run ends one round below the cap and the cap's own round carries the escalation, so
   * both bounds move together.
   *
   * Scope split: the cross-body half — that this body and the work body state the same
   * stages, and that no body names a round past the cap — is invariant 16's. What stays
   * local is the fixer's own contract prose: the blind-spot rationale the escalation
   * exists for, and the two divergence exits.
   */
  it("keeps the same fixer until the cap's last round, which escalates", async () => {
    const rounds = section(await load("agents/stamity-fixer.md"), "Round policy").replace(
      /\s+/g,
      " ",
    );

    expect(rounds).toMatch(
      new RegExp(`rounds 1[–-]${DEFAULT_MAX_REVIEW_ITERATIONS - 1}: the same fixer`, "i"),
    );
    expect(rounds).toMatch(
      new RegExp(
        `round ${DEFAULT_MAX_REVIEW_ITERATIONS}: a fresh fixer on a stronger model class`,
        "i",
      ),
    );
    expect(rounds).toMatch(/repeats its own blind spot/i);
    expect(rounds).toContain("BLOCKED_FAILURE");
    expect(rounds).toMatch(/convergence is expected by round two or three/i);
    expect(rounds).toMatch(/exits as diverged/i);

    // MODIFIED with the round-4 honesty fix. What moved: the stage sentence is unchanged
    // (the engine cap still derives it, and the cross-body invariant still holds both
    // bodies to it), and the body now also states what "stronger" does NOT resolve to. The
    // promise was readable as an emitted model setting while the ladder places this role on
    // two rungs, neither above its declared class — so the claim about the table is checked
    // against the table, next to the sentence that makes it.
    const rungs = MODEL_LADDER.filter((entry) => entry.roles.includes("fixer")).map(
      (entry) => entry.modelClass,
    );
    expect(rungs).toEqual(["standard", "economy"]);
    expect(rounds).toMatch(/what "stronger" resolves to is the flow's own placement/i);
    expect(rounds).toMatch(/at no rung above either/i);
    expect(rounds).toMatch(/reaches no emitted model key/i);
    expect(rounds).toMatch(/the stage is prompt-carried/i);
  });

  it("takes gate evidence from the runner and never closes its own loop", async () => {
    const handback = section(await load("agents/stamity-fixer.md"), "Gate handback").replace(
      /\s+/g,
      " ",
    );

    expect(handback).toMatch(/gate evidence comes from the test-runner spawn/i);
    expect(handback).toMatch(/not evidence that the gates ran/i);
    expect(handback).toMatch(/re-review is required whenever the changed-file list is non-empty/i);
    expect(handback).toMatch(/self-approval/i);
  });
});
