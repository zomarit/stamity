import { describe, expect, it } from "vitest";
import { frontmatterField } from "../../../src/content/frontmatter.ts";
import { LEAN_LINE_THRESHOLDS } from "../../../src/content/userContent.ts";
import {
  VERIFY_GATE_ALL_TOKEN,
  VERIFY_GATE_LINT_TOKEN,
  VERIFY_GATE_TEST_TOKEN,
  VERIFY_GATE_TYPECHECK_TOKEN,
} from "../../../src/emit/substitution.ts";
import { CANONICAL_HOOK_EVENTS } from "../../../src/hooks/model.ts";
import { FUNCTIONAL_TOOL_CATEGORIES } from "../../../src/tools/categories.ts";
import { CONTENT_CLASSES } from "../../../src/types/content.ts";
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
 * The three quality-lane agents — `test-runner`, `spec-author`, `creator` — as a contract
 * over their shipped bodies.
 *
 * What this suite binds beyond the corpus-wide frontmatter contract, and why each check is
 * mechanical rather than left to prose review:
 *
 *   - **Declared privilege.** `capabilities` is what the roster and the client-side guard
 *     derive a grant from, so the values are asserted against the engine's own functional
 *     category list — and `test-runner` is asserted to hold no `edit`, which is the whole
 *     independence argument for a separate runner role.
 *   - **The mandate IS the body.** For these three the guarantees are sentences: a
 *     structured result instead of a bare verdict, a deleted claim instead of a hedged one,
 *     a refused save instead of a silent overwrite. Deleting the sentence deletes the
 *     behavior, so the sentences are asserted.
 *   - **Engine lockstep.** Gate tokens, the agent line cap, the per-class advisory
 *     thresholds `creator` quotes, and the six canonical hook events are imported from the
 *     modules that own them rather than restated here — a body that drifts from the engine
 *     fails this suite instead of shipping a number no code honours.
 *
 * Prose assertions run against a whitespace-flattened view ({@link flow}) so a reflowed
 * paragraph is not a failure; structural assertions (headings, table rows, caps) run against
 * the raw body. Corpus-wide roster and cross-reference census lives in the invariant suite.
 */

/**
 * The four model classes — the half of the Model-Independence Contract this suite owns.
 *
 * The other half, that no shipped body names a vendor or a model id, is invariant 17 in
 * `test/corpus/invariants.test.ts`: ONE token list over EVERY shipped markdown file. This
 * suite used to carry its own regex over its own three files; that copy was deleted
 * because eight such copies, no two alike, are how a vendor name ships
 * green on one axis while its sibling would have failed the build. Widen `VENDOR_TOKENS`
 * there; do not mint a copy here — the re-add guard in that suite scans this file.
 */
const MODEL_CLASSES: readonly string[] = ["frontier", "advanced", "standard", "economy"];

/** The nine touchpoints: every `/stamity-*` mention in these bodies must resolve to one. */
const COMMAND_IDS: readonly string[] = [
  "spec",
  "plan",
  "work",
  "board",
  "ask",
  "debug",
  "quick",
  "rework",
  "pr-resolve",
];

/** Body cap for an agent: the engine's own lean ceiling, made hard for canonical content. */
const AGENT_BODY_CAP = LEAN_LINE_THRESHOLDS.agent;

/** The shared return-contract status enums every sub-agent body inlines. */
const STATUS_ENUMS: readonly string[] = [
  "DONE",
  "BLOCKED_AMBIGUITY",
  "BLOCKED_DEPENDENCY",
  "BLOCKED_FAILURE",
];

interface QualityAgent {
  /** Bare frontmatter id, which is also the filename slug. */
  id: string;
  relPath: string;
  tags: string[];
  /** Privilege grant, mirroring what the agent-policy roster hands this role. */
  capabilities: string[];
  modelClass: string;
}

const QUALITY: readonly QualityAgent[] = [
  {
    id: "test-runner",
    relPath: "agents/stamity-test-runner.md",
    tags: ["review", "implementation", "floor:spine"],
    capabilities: ["read", "execute"],
    modelClass: "economy",
  },
  {
    id: "spec-author",
    relPath: "agents/stamity-spec-author.md",
    tags: ["planning"],
    capabilities: ["read", "edit"],
    modelClass: "advanced",
  },
  {
    id: "creator",
    relPath: "agents/stamity-creator.md",
    tags: ["maintenance"],
    capabilities: ["read", "edit"],
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

describe("quality agents — frontmatter contract", () => {
  it.each(QUALITY)("$id carries the agent identity head", async (agent) => {
    const file = await load(agent.relPath);

    expect(frontmatterField(file.parsed, "id")).toBe(agent.id);
    expect(filenameSlug(file.relPath)).toBe(agent.id);
    expect(frontmatterField(file.parsed, "type")).toBe("agent");
    expect(frontmatterField(file.parsed, "tags")).toEqual(agent.tags);

    const description = frontmatterField(file.parsed, "description");
    expect(typeof description).toBe("string");
    expect(String(description).length).toBeGreaterThan(0);
    expect(String(description).length).toBeLessThanOrEqual(1024);
    // Third person: a description addressing the reader is second person by construction.
    expect(String(description)).not.toMatch(/\b(?:you|your|yours|yourself)\b/i);

    // Agents load on spawn. Only the charter may declare `always`.
    requireLoadClass(file, ["on-demand"]);
    requireObsoleteWhen(file);
  });

  it.each(QUALITY)("$id declares capabilities from the functional category set", async (agent) => {
    const file = await load(agent.relPath);
    const capabilities = frontmatterField(file.parsed, "capabilities");

    expect(capabilities).toEqual(agent.capabilities);
    for (const capability of agent.capabilities) {
      expect(FUNCTIONAL_TOOL_CATEGORIES as readonly string[]).toContain(capability);
    }
    // `tools:` is the engine's target-tool restriction, not a privilege grant. Corpus
    // content ships everywhere, so the reserved key stays absent.
    expect(frontmatterField(file.parsed, "tools")).toBeUndefined();
  });

  it.each(QUALITY)("$id declares a plain model class from the ladder", async (agent) => {
    const file = await load(agent.relPath);

    expect(frontmatterField(file.parsed, "model_class")).toBe(agent.modelClass);
    expect(MODEL_CLASSES).toContain(agent.modelClass);
  });

  it("grants test-runner execute without edit — the independence guarantee", async () => {
    const runner = await load("agents/stamity-test-runner.md");
    const capabilities = frontmatterField(runner.parsed, "capabilities");

    // A runner that could edit is a runner that could make a red gate green, which is
    // exactly the conflict the separate role exists to remove.
    expect(capabilities).toContain("execute");
    expect(capabilities).not.toContain("edit");
    expect(flow(runner)).toMatch(/holds no edit capability/i);
  });
});

describe("quality agents — body budget and write-path hygiene", () => {
  it.each(QUALITY)("$id stays inside the agent body cap and scans clean", async (agent) => {
    const file = await load(agent.relPath);

    assertLineCap(file, AGENT_BODY_CAP);
    assertDenyClean(file);
  });

  it.each(QUALITY)("$id mentions only touchpoints that exist", async (agent) => {
    const file = await load(agent.relPath);
    const mentioned = [...file.parsed.body.matchAll(/\/stamity-([a-z][a-z-]*)/g)].map(
      (match) => match[1],
    );

    for (const id of new Set(mentioned)) {
      expect(COMMAND_IDS, `${file.relPath}: /stamity-${id} is not a touchpoint`).toContain(id);
    }
  });

  it.each(QUALITY)("$id inlines the shared return contract", async (agent) => {
    const contract = section(await load(agent.relPath), "Return contract");

    for (const status of STATUS_ENUMS) {
      expect(contract).toContain(status);
    }
    // Rendering, not just presence: the spine agents write the enum backticked and
    // pipe-separated. Pinning the exact line keeps the two agent units from drifting into
    // two spellings of one contract.
    expect(contract).toContain(
      `**status:** ${STATUS_ENUMS.map((status) => `\`${status}\``).join(" | ")}.`,
    );
    // Severity asserted token-wise, matching the spine suite's check on the same shared
    // contract: the three quality agents render it identically to the four spine agents,
    // so a wave-3 corpus-wide census reads one rendering across all seven.
    for (const severity of ["Critical", "Warning", "Minor"]) {
      expect(contract).toContain(severity);
    }
    // Reference indirection fails the Earns-Its-Context test, so the ask-nothing rule is
    // inlined per consumer rather than pointed at. Sentence is the spine's wording verbatim.
    expect(contract.replace(/\s+/g, " ")).toMatch(
      /Sub-agents do not put questions to the operator/i,
    );
  });
});

describe("test-runner — gate set", () => {
  it("carries all four verification-gate tokens verbatim", async () => {
    const gates = section(await load("agents/stamity-test-runner.md"), "Gate set");

    // Imported, not restated: a token renamed in the emission layer fails here.
    expect(gates).toContain(VERIFY_GATE_TEST_TOKEN);
    expect(gates).toContain(VERIFY_GATE_LINT_TOKEN);
    expect(gates).toContain(VERIFY_GATE_TYPECHECK_TOKEN);
    expect(gates).toContain(VERIFY_GATE_ALL_TOKEN);
  });

  it("states the chain semantics that keep an unreached gate off the pass list", async () => {
    const text = flow(await load("agents/stamity-test-runner.md"));

    // `all` resolves to a `&&` chain, so a failure short-circuits the rest of it.
    expect(text).toMatch(/`&&` chain and stops at the first failing link/i);
    expect(text).toMatch(/never reached is reported `not-run`, not `pass`/i);
    expect(text).toMatch(/invoke the three narrow gates separately/i);
  });

  it("forbids altering the resolved command to produce a green result", async () => {
    const text = flow(await load("agents/stamity-test-runner.md"));

    expect(text).toMatch(/no flag added to the resolved command/i);
    expect(text).toMatch(/no filter narrowing the suite unless the brief supplied it/i);
    expect(text).toMatch(/altered to pass has measured nothing/i);
  });
});

describe("test-runner — structured result", () => {
  it("mandates a per-gate result, never a bare pass/fail", async () => {
    const file = await load("agents/stamity-test-runner.md");
    const result = section(file, "Structured result");

    const mandate = result.replace(/\s+/g, " ");
    expect(mandate).toMatch(/never a bare pass\/fail/i);
    expect(mandate).toMatch(/never a summary sentence in place of the rows/i);
    // The per-gate row shape: what the fixer reads instead of the runner's transcript.
    for (const field of ["gate", "command", "status", "exit code", "duration", "excerpt"]) {
      expect(result, `missing result field: ${field}`).toMatch(
        new RegExp(`^\\| ${field} \\|`, "m"),
      );
    }
    expect(result).toContain("`pass` \\| `fail` \\| `not-run` \\| `not-runnable`");
  });

  it("requires verbatim failure excerpts with the locations preserved under truncation", async () => {
    const excerpts = section(await load("agents/stamity-test-runner.md"), "Structured result")
      .replace(/\s+/g, " ");

    expect(excerpts).toMatch(/never paraphrased and never summarized into a count/i);
    expect(excerpts).toMatch(/failing test names, assertion diffs, compiler messages/i);
    expect(excerpts).toMatch(/state the truncation and the total failure count/i);
    expect(excerpts).toMatch(/keep the failing paths and line numbers intact/i);
    // A credential-shaped value in tool output must not be copied through verbatim.
    expect(excerpts).toContain("[redacted]");
  });

  it("gates the green verdict on every requested gate passing", async () => {
    const text = flow(await load("agents/stamity-test-runner.md"));

    expect(text).toMatch(/`green` only when every requested gate reported `pass`/i);
    expect(text).toMatch(/any `fail`, `not-run`, or `not-runnable` row makes the verdict `red`/i);
  });
});

describe("test-runner — edge cases", () => {
  it("reports an unresolvable gate command as not-runnable, quoting it literally", async () => {
    const edges = section(await load("agents/stamity-test-runner.md"), "Edge cases").replace(
      /\s+/g,
      " ",
    );

    // Substitution renders an undetected value as the literal `unknown` and leaves an
    // unwired token standing; neither may be reported as a passing gate.
    // The sentinel is a sentence now (it lands in command positions in
    // six other bodies), so the body branches on its LEADING word rather than
    // on equality — which is what the rendered value guarantees.
    expect(edges).toMatch(/rendering begins with the\s+literal `unknown`/i);
    expect(edges).toContain("unresolved `${STAMITY:` token");
    expect(edges).toMatch(/exit 127/);
    expect(edges).toMatch(/reported `not-runnable` with the literal command string quoted/i);
    expect(edges).toMatch(/red verdict, not a silent pass and not an omitted row/i);
  });

  it("reports a hung gate as a timed-out failure with its elapsed time", async () => {
    const edges = section(await load("agents/stamity-test-runner.md"), "Edge cases").replace(
      /\s+/g,
      " ",
    );

    expect(edges).toMatch(/wall-clock budget/i);
    expect(edges).toContain("`exit code: timeout`");
    expect(edges).toMatch(/elapsed seconds/i);
    expect(edges).toMatch(/last 40 lines the process emitted before the kill/i);
  });

  it("isolates gates so one hung gate does not void the others' results", async () => {
    const edges = section(await load("agents/stamity-test-runner.md"), "Edge cases").replace(
      /\s+/g,
      " ",
    );

    expect(edges).toMatch(/gates are separate invocations/i);
    expect(edges).toMatch(/one timeout or crash voids one row/i);
    expect(edges).toMatch(/the remaining gates still run and still report/i);
    // Classification against a baseline, or no classification at all — never a guess.
    expect(edges).toMatch(/`introduced` or `pre-existing`/);
    expect(edges).toMatch(/with no baseline, no row is classified/i);
  });
});

describe("test-runner — independence and status mapping", () => {
  it("separates the writer from the certifier, one runner per pass", async () => {
    const independence = section(await load("agents/stamity-test-runner.md"), "Independence").replace(
      /\s+/g,
      " ",
    );

    expect(independence).toMatch(/the role that wrote a change does not certify it/i);
    expect(independence).toMatch(/spawns fresh per Prove pass/i);
    expect(independence).toMatch(/one runner per pass/i);
    expect(independence).toMatch(/not the implementer's reasoning/i);
  });

  it("maps a red gate to DONE and reserves BLOCKED_FAILURE for producing no evidence", async () => {
    const contract = section(await load("agents/stamity-test-runner.md"), "Return contract").replace(
      /\s+/g,
      " ",
    );

    // A red gate is a successful measurement. Conflating the two would let a broken
    // workspace read as a failing test suite.
    expect(contract).toMatch(/a red verdict is still `DONE`/i);
    expect(contract).toMatch(/`BLOCKED_FAILURE` is for producing no evidence at all/i);
  });
});

describe("spec-author — modes", () => {
  it("carries all four modes as rows, one mode per invocation", async () => {
    const file = await load("agents/stamity-spec-author.md");
    const modes = section(file, "Modes");

    for (const mode of ["greenfield", "brownfield", "architect", "docs"]) {
      expect(modes, `missing mode row: ${mode}`).toMatch(new RegExp(`^\\| ${mode} \\|`, "m"));
    }
    const text = modes.replace(/\s+/g, " ");
    expect(text).toMatch(/one mode per invocation/i);
    expect(text).toContain("BLOCKED_AMBIGUITY");
  });
});

describe("spec-author — format contract", () => {
  it("fixes requirement ids, their allocation rule, and the retirement pointer", async () => {
    const text = flow(await load("agents/stamity-spec-author.md"));

    expect(text).toContain("`REQ-<area>-<nnn>`");
    expect(text).toMatch(/allocated once and never renumbered/i);
    expect(text).toContain("`superseded by`");
  });

  it("requires Given/When/Then criteria with a judgment tag where machines cannot check", async () => {
    const text = flow(await load("agents/stamity-spec-author.md"));

    expect(text).toContain("Given/When/Then");
    expect(text).toMatch(
      /GIVEN a cart holding one item WHEN checkout is submitted with an expired card THEN/,
    );
    expect(text).toContain("`judgment:` tag");
  });

  it("keeps [NEEDS CLARIFICATION] as the only way to record an open question", async () => {
    const text = flow(await load("agents/stamity-spec-author.md"));

    expect(text).toContain("[NEEDS CLARIFICATION]");
    expect(text).toMatch(/inventing a plausible answer to close a marker is the defect/i);
    expect(text).toContain("/stamity-work");
  });

  it("carries the four typed reference pointers and bans restated contracts", async () => {
    const file = await load("agents/stamity-spec-author.md");
    const contract = section(file, "Format contract");

    for (const pointer of ["test", "api", "mockup", "source"]) {
      expect(contract, `missing pointer row: ${pointer}`).toMatch(
        new RegExp("^\\| `" + pointer + "` \\|", "m"),
      );
    }
    expect(contract.replace(/\s+/g, " ")).toMatch(/drop the copy and keep the pointer/i);
  });
});

describe("spec-author — evidence rules", () => {
  it("deletes an uncited claim rather than hedging it", async () => {
    const evidence = section(await load("agents/stamity-spec-author.md"), "Evidence rules").replace(
      /\s+/g,
      " ",
    );

    // The failure shape this rule exists for: hedged prose reads as weaker, but a later
    // reader still trusts it.
    expect(evidence).toMatch(/a claim without evidence is deleted, not hedged/i);
    expect(evidence).toMatch(/or remove the sentence and record the gap as a `\[NEEDS CLARIFICATION\]` marker/i);
  });

  it("requires searched integration surfaces and named existing patterns", async () => {
    const evidence = section(await load("agents/stamity-spec-author.md"), "Evidence rules").replace(
      /\s+/g,
      " ",
    );

    expect(evidence).toMatch(/integration surfaces are enumerated, not recalled/i);
    expect(evidence).toContain("`path:line`");
    expect(evidence).toMatch(/an unsearched surface is absent from the spec, not assumed empty/i);
    expect(evidence).toMatch(/name what the repo already does, with evidence/i);
  });

  it("requires an expand-contract path with per-phase rollback and consumer proof", async () => {
    const evidence = section(await load("agents/stamity-spec-author.md"), "Evidence rules").replace(
      /\s+/g,
      " ",
    );

    expect(evidence).toMatch(/expand-contract path/i);
    expect(evidence).toMatch(/the rollback step for that phase/i);
    expect(evidence).toMatch(/destructive cutover with no reverse path is incomplete/i);
    expect(evidence).toMatch(/non-destructive adoption/i);
    expect(evidence).toMatch(/named backward-compatibility test/i);
  });

  it("labels an inferred ADR and refuses reconstructed motive as rationale", async () => {
    const architect = section(await load("agents/stamity-spec-author.md"), "Architect mode").replace(
      /\s+/g,
      " ",
    );

    expect(architect).toMatch(/an \*\*Evidence\*\* block of `path:line` citations/i);
    expect(architect).toMatch(/alternatives the code rules out/i);
    expect(architect).toMatch(/intent that cannot be cited is recorded as an open question/i);
    expect(architect).toMatch(/an inferred ADR states that it is inferred, in its first line/i);
  });

  it("keeps docs mode on shipped behavior rather than aspiration", async () => {
    const docs = section(await load("agents/stamity-spec-author.md"), "Docs mode").replace(
      /\s+/g,
      " ",
    );

    expect(docs).toMatch(/documentation describes what the current tree does/i);
    expect(docs).toMatch(/never written in the present tense as though it shipped/i);
    expect(docs).toMatch(/a doc example is copied from a run, not composed/i);
  });

  it("keeps authorship single-writer and convergence byte-stable", async () => {
    const rules = section(await load("agents/stamity-spec-author.md"), "Writing rules").replace(
      /\s+/g,
      " ",
    );

    expect(rules).toMatch(/one writer per file/i);
    expect(rules).toMatch(/a converged spec is a byte-stable no-op/i);
    expect(rules).toMatch(/manifest wins/i);
  });
});

describe("creator — target tree", () => {
  it("routes every content class into .stamity/overrides", async () => {
    const file = await load("agents/stamity-creator.md");
    const tree = section(file, "Target tree");

    expect(file.parsed.body).toContain(".stamity/overrides");
    for (const cls of CONTENT_CLASSES) {
      expect(tree, `missing class row: ${cls}`).toMatch(new RegExp(`^\\| ${cls} \\|`, "m"));
    }
    // A skill is addressed by its directory; the readable file sits inside it.
    expect(tree).toContain(".stamity/overrides/skills/<id>/SKILL.md");
    // Platform formats are generated: no hand-authored twin, in the user lane either.
    expect(tree.replace(/\s+/g, " ")).toMatch(/the platform companion is generated/i);
  });

  it("refuses a write into the bundled corpus and restates it against the override path", async () => {
    const text = flow(await load("agents/stamity-creator.md"));

    expect(text).toMatch(/the bundled corpus under `content\/` is out of bounds/i);
    expect(text).toMatch(/refused with the `\.stamity\/overrides\/<class>\/` path/i);
    expect(text).toMatch(/corpus files are framework-CI territory/i);
    expect(text).toMatch(/an edit there is erased by the next update/i);
  });
});

describe("creator — save contract", () => {
  it("states the strict gates that refuse a save, deny hits included", async () => {
    const file = await load("agents/stamity-creator.md");
    const contract = section(file, "Save contract");
    const text = contract.replace(/\s+/g, " ");

    expect(text).toMatch(/strict — the save is refused and nothing is written/i);
    expect(text).toMatch(/`id`, `type`, `description`, and `tags` are all present/i);
    expect(text).toMatch(/`id` is a lowercase kebab slug and matches the filename/i);
    expect(text).toMatch(/`id` does not carry the `stamity-` prefix/i);
    expect(text).toMatch(/`type` equals the class directory/i);
    // The deny-refusal rule, and the reason frontmatter is scanned as well as the body.
    expect(text).toMatch(
      /no block-severity deny hit anywhere in the body or in any frontmatter string/i,
    );
    expect(text).toMatch(/rendered into pickers and roster lines/i);
  });

  it("quotes the engine's per-class advisory thresholds, not invented ones", async () => {
    const contract = section(await load("agents/stamity-creator.md"), "Save contract");

    // Lockstep: the numbers come from LEAN_LINE_THRESHOLDS, so a threshold change in the
    // engine fails here instead of leaving the agent quoting a stale figure.
    for (const cls of CONTENT_CLASSES) {
      expect(contract, `missing advisory row: ${cls}`).toMatch(
        new RegExp(`^\\| ${cls} \\| ${LEAN_LINE_THRESHOLDS[cls]} \\|`, "m"),
      );
    }
    const text = contract.replace(/\s+/g, " ");
    expect(text).toMatch(/advisory — the file lands, warnings ride along/i);
    expect(text).toMatch(/a gate that blocks on length is a gate authors learn to route around/i);
    expect(text).toMatch(/reported as landed with three warnings, not as clean/i);
  });
});

describe("creator — refusals", () => {
  it("surfaces supplement, replace, or abort on a colliding id and overwrites nothing", async () => {
    const refusals = section(await load("agents/stamity-creator.md"), "Refusals").replace(
      /\s+/g,
      " ",
    );

    expect(refusals).toMatch(/\*\*supplement\*\*/);
    expect(refusals).toMatch(/\*\*replace\*\*/);
    expect(refusals).toMatch(/\*\*abort\*\*/);
    expect(refusals).toContain("BLOCKED_AMBIGUITY");
    // The engine's forced write takes a verified backup; recoverability is not consent.
    expect(refusals).toMatch(/verified `\.bak` is a recovery path rather than consent/i);
    expect(refusals).toMatch(/no path silently overwrites/i);
  });

  it("keeps one artifact per invocation and refuses classes with no home", async () => {
    const refusals = section(await load("agents/stamity-creator.md"), "Refusals").replace(
      /\s+/g,
      " ",
    );

    expect(refusals).toMatch(/one artifact per invocation/i);
    expect(refusals).toMatch(/requested class is outside agent, skill, rule, command/i);
  });
});

describe("creator — hook lane", () => {
  it("routes user hooks through JSON files under the strict ingress rules", async () => {
    const hooks = section(await load("agents/stamity-creator.md"), "Hook lane").replace(/\s+/g, " ");

    expect(hooks).toMatch(/hooks are not a content class/i);
    expect(hooks).toContain('{"hooks": [ ... ]}');
    expect(hooks).toMatch(/exec-form argv only/i);
    expect(hooks).toMatch(/no network reach in a command/i);
    expect(hooks).toMatch(/paths stay inside the repository/i);
    expect(hooks).toMatch(/a defective entry is reported by index/i);
  });

  it("names the six canonical events the engine accepts, and no others", async () => {
    const hooks = section(await load("agents/stamity-creator.md"), "Hook lane");

    // Imported from the hook model: an event added or renamed there fails here.
    for (const event of CANONICAL_HOOK_EVENTS) {
      expect(hooks, `missing canonical event: ${event}`).toContain(`\`${event}\``);
    }
    expect(hooks.replace(/\s+/g, " ")).toMatch(
      /client-specific events are not portable and are refused/i,
    );
  });
});
