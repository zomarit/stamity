import { describe, expect, it } from "vitest";
import { frontmatterField } from "../../../src/content/frontmatter.ts";
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
 * The second half of the verify axis set — scalability, performance,
 * maintainability, enhancability, product-spec — plus the three standalone
 * tool skills: browser-evidence, design-system-detect, dep-audit.
 *
 * What this suite binds:
 *
 *   - **Reference anatomy.** The axis contract itself (dispatch, run contract,
 *     artifact schema, status vocabulary) lives once in the verify `SKILL.md`
 *     and is that unit's to assert. Here the references are bound to the shape
 *     that contract expects of them: two sections named for the two `kind`
 *     values, every check addressable by an id, and a body inside the 40-100
 *     line band so an axis read costs a known amount of context.
 *   - **Anti-shadowing.** A skill's description is its trigger surface, so two
 *     descriptions competing over one domain is a routing defect, not a style
 *     one. Distinctive nouns are declared per skill and asserted in both
 *     directions: each description carries its own and none of its siblings'.
 *   - **The refusals.** For these three skills the refusal IS the skill —
 *     browser-evidence not installing, dep-audit not applying,
 *     design-system-detect not electing a token source. Deleting the sentence
 *     deletes the behavior, so the sentences are asserted.
 *
 * Prose assertions run against a whitespace-flattened view ({@link flow}) so a
 * reflowed paragraph is not a failure; structural assertions (headings, ids,
 * caps) run against the raw body.
 */

/** The nine touchpoints: every `/st-*` mention in these bodies must resolve to one. */
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

/** Reference body band. Below 40 an axis is a stub; above 100 it stops being a gated read. */
const REFERENCE_MIN_LINES = 40;
const REFERENCE_MAX_LINES = 100;

/** Skill body cap from the anatomy standard: 500 lines, with 200 as this unit's design target. */
const SKILL_BODY_CAP = 500;
const SKILL_DESIGN_TARGET = 200;

/** Cap on `description` length, in characters — mirrors the corpus frontmatter contract. */
const DESCRIPTION_MAX = 1024;

/** A description addressing the reader is second person by construction. */
const SECOND_PERSON = /\b(?:you|your|yours|yourself)\b/i;

/**
 * Protocol sections the skill anatomy bans per-skill: ambiguity (B1), fan-out
 * (B2), error handling, and definition of done live once in the charter and the
 * rules, not repeated in every skill body.
 */
const BANNED_SECTION = /^#{2,}\s.*\b(?:B1|B2|error handling|definition of done)\b/im;

interface AxisReference {
  /** Bare frontmatter id, which is also the filename slug. */
  id: string;
  relPath: string;
  /** Every check id in this reference starts with this prefix. */
  prefix: string;
}

const REFERENCES: readonly AxisReference[] = [
  {
    id: "scalability",
    relPath: "skills/st-verify/references/scalability.md",
    prefix: "scale-",
  },
  {
    id: "performance",
    relPath: "skills/st-verify/references/performance.md",
    prefix: "perf-",
  },
  {
    id: "maintainability",
    relPath: "skills/st-verify/references/maintainability.md",
    prefix: "maint-",
  },
  {
    id: "enhancability",
    relPath: "skills/st-verify/references/enhancability.md",
    prefix: "enh-",
  },
  {
    id: "product-spec",
    relPath: "skills/st-verify/references/product-spec.md",
    prefix: "spec-",
  },
];

interface ToolSkill {
  id: string;
  relPath: string;
  tags: string[];
  /**
   * Nouns that make this description's trigger domain distinctive. Each
   * description must carry all of its own and none of any sibling's — the
   * machine-checkable half of "no two skills share a trigger domain".
   */
  distinctive: string[];
}

const SKILLS: readonly ToolSkill[] = [
  {
    id: "browser-evidence",
    relPath: "skills/st-browser-evidence/SKILL.md",
    tags: ["review"],
    distinctive: ["browser", "screenshot", "accessibility"],
  },
  {
    id: "design-system-detect",
    relPath: "skills/st-design-system-detect/SKILL.md",
    tags: ["maintenance"],
    distinctive: ["design", "tokens", "theming", "inventory"],
  },
  {
    id: "dep-audit",
    relPath: "skills/st-dep-audit/SKILL.md",
    tags: ["maintenance", "devops"],
    distinctive: ["dependency", "advisories", "licenses"],
  },
];

/**
 * The verify skill's own distinctive trigger nouns. The verify `SKILL.md` is a
 * sibling unit's file, so the constant is declared here and locked to the file
 * below once it exists — the assertion that these three skills stay clear of
 * verify's domain must hold whether or not that file has landed yet.
 */
const VERIFY_DISTINCTIVE: readonly string[] = ["axis", "gate", "judgment"];

const VERIFY_SKILL_PATH = "skills/st-verify/SKILL.md";

/** One walk for the whole suite; the corpus does not change under it. */
const corpus = walkAllMarkdown();

async function load(relPath: string): Promise<CorpusFile> {
  const file = (await corpus).find((candidate) => candidate.relPath === relPath);
  if (file === undefined) {
    throw new Error(`${relPath}: not present under the corpus root`);
  }
  return file;
}

/** The file at `relPath`, or undefined when a sibling unit has not landed it yet. */
async function optional(relPath: string): Promise<CorpusFile | undefined> {
  return (await corpus).find((candidate) => candidate.relPath === relPath);
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

/** Check ids in a reference section — each check leads with its id in bold code. */
function checkIds(text: string): string[] {
  return [...text.matchAll(/\*\*`([a-z][a-z0-9-]*)`\*\*/g)].map((match) => match[1] ?? "");
}

/** Assert the identity head every corpus artifact declares, per the frontmatter contract. */
function expectIdentityHead(
  file: CorpusFile,
  id: string,
  loadClass: string,
  tags: string[],
): void {
  expect(frontmatterField(file.parsed, "id")).toBe(id);
  expect(filenameSlug(file.relPath)).toBe(id);
  expect(frontmatterField(file.parsed, "type")).toBe("skill");
  expect(frontmatterField(file.parsed, "tags")).toEqual(tags);

  const description = frontmatterField(file.parsed, "description");
  expect(typeof description).toBe("string");
  expect(String(description).length).toBeGreaterThan(0);
  expect(String(description).length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  expect(String(description)).not.toMatch(SECOND_PERSON);

  requireLoadClass(file, [loadClass]);
  requireObsoleteWhen(file);
}

describe("verify axis references — contract and anatomy", () => {
  it.each(REFERENCES)("$id carries the reference identity head", async (reference) => {
    const file = await load(reference.relPath);

    // `load: reference` is what marks the file non-standalone: opened outside the
    // verify dispatch it carries no run contract, and the load class says so.
    expectIdentityHead(file, reference.id, "reference", ["review"]);
  });

  it.each(REFERENCES)("$id stays inside the 40-100 line band", async (reference) => {
    const file = await load(reference.relPath);
    const bodyLines = file.parsed.body.replace(/\r?\n$/, "").split(/\r?\n/).length;

    expect(bodyLines).toBeGreaterThanOrEqual(REFERENCE_MIN_LINES);
    assertLineCap(file, REFERENCE_MAX_LINES);
  });

  it.each(REFERENCES)("$id splits into the two kind sections", async (reference) => {
    const file = await load(reference.relPath);

    // The two headings mirror the artifact's `kind` values, so a reference row
    // and an artifact row are readable against each other without a mapping.
    expect(file.parsed.body).toContain("\n## Runnable checks\n");
    expect(file.parsed.body).toContain("\n## Judgment checks\n");
  });

  it.each(REFERENCES)("$id gives every check a prefixed id", async (reference) => {
    const file = await load(reference.relPath);
    const runnable = checkIds(section(file, "Runnable checks"));
    const judgment = checkIds(section(file, "Judgment checks"));

    expect(runnable.length).toBeGreaterThanOrEqual(5);
    expect(judgment.length).toBeGreaterThanOrEqual(4);
    for (const id of [...runnable, ...judgment]) {
      expect(id, `${file.relPath}: check id ${id} lacks the ${reference.prefix} prefix`).toMatch(
        new RegExp(`^${reference.prefix}`),
      );
    }
    // Ids address rows in the artifact, so a repeat inside one axis would make
    // two rows indistinguishable to a consumer.
    expect(new Set([...runnable, ...judgment]).size).toBe(runnable.length + judgment.length);
  });

  it("keeps check ids unique across the five axes", async () => {
    const files = await Promise.all(REFERENCES.map((reference) => load(reference.relPath)));
    const ids = files.flatMap((file) => checkIds(file.parsed.body));

    expect(ids.length).toBeGreaterThanOrEqual(45);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(REFERENCES)("$id scans clean on the write path", async (reference) => {
    assertDenyClean(await load(reference.relPath));
  });
});

describe("tool skills — contract and anatomy", () => {
  it.each(SKILLS)("$id carries the skill identity head", async (skill) => {
    expectIdentityHead(await load(skill.relPath), skill.id, "on-demand", skill.tags);
  });

  it.each(SKILLS)("$id stays inside the body cap and scans clean", async (skill) => {
    const file = await load(skill.relPath);

    assertLineCap(file, SKILL_BODY_CAP);
    assertLineCap(file, SKILL_DESIGN_TARGET);
    assertDenyClean(file);
  });

  it.each(SKILLS)("$id carries Quick Start and an output section", async (skill) => {
    const file = await load(skill.relPath);

    expect(file.parsed.body).toContain("\n## Quick Start\n");
    expect(file.parsed.body).toContain("\n## Output artifact\n");
    expect(file.parsed.body).toMatch(/\n## Step 1 —/);
  });

  it.each(SKILLS)("$id carries no per-skill protocol boilerplate", async (skill) => {
    const file = await load(skill.relPath);

    // Protocol lives once in the charter and the rules; repeating it per skill is
    // the token tax the anatomy standard exists to remove.
    expect(file.parsed.body).not.toMatch(BANNED_SECTION);
  });

  it.each(SKILLS)("$id mentions only touchpoints that exist", async (skill) => {
    const file = await load(skill.relPath);
    const mentioned = [...file.parsed.body.matchAll(/\/st-([a-z][a-z-]*)/g)].map(
      (match) => match[1],
    );

    for (const id of new Set(mentioned)) {
      expect(COMMAND_IDS, `${file.relPath}: /st-${id} is not a touchpoint`).toContain(id);
    }
  });
});

describe("tool skills — anti-shadowing on the trigger surface", () => {
  it.each(SKILLS)("$id carries its own distinctive nouns", async (skill) => {
    const description = String(frontmatterField((await load(skill.relPath)).parsed, "description"));

    for (const noun of skill.distinctive) {
      expect(description.toLowerCase()).toContain(noun);
    }
  });

  it.each(SKILLS)("$id claims no sibling's trigger domain", async (skill) => {
    const description = String(
      frontmatterField((await load(skill.relPath)).parsed, "description"),
    ).toLowerCase();
    const foreign = [
      ...VERIFY_DISTINCTIVE,
      ...SKILLS.filter((other) => other.id !== skill.id).flatMap((other) => other.distinctive),
    ];

    for (const noun of foreign) {
      expect(description, `${skill.id}: description claims "${noun}"`).not.toContain(noun);
    }
  });

  it("keeps the verify skill clear of these three domains", async () => {
    const verify = await optional(VERIFY_SKILL_PATH);
    // Sibling unit's file. Absent, the assertion above still holds these three
    // clear of verify's nouns; present, this locks the constant to the corpus.
    if (verify === undefined) return;

    const description = String(frontmatterField(verify.parsed, "description")).toLowerCase();
    for (const noun of VERIFY_DISTINCTIVE) {
      expect(description).toContain(noun);
    }
    for (const noun of SKILLS.flatMap((skill) => skill.distinctive)) {
      expect(description, `verify: description claims "${noun}"`).not.toContain(noun);
    }
  });
});

describe("performance axis — advisory unless budgets", () => {
  it("states the advisory posture and what makes a finding fail", async () => {
    const text = flow(await load("skills/st-verify/references/performance.md"));

    expect(text).toMatch(/advisory unless budgets/i);
    expect(text).toMatch(/recorded as evidence, never a merge block/i);
    expect(text).toMatch(/unless a budget declared in the repo is exceeded, which is a `fail`/i);
  });

  it("names the absent budget classes when the repo declares none", async () => {
    const text = flow(await load("skills/st-verify/references/performance.md"));

    // Edge case: zero declared budgets — every row advisory, and the artifact
    // records which budget classes were missing rather than reporting a pass.
    expect(text).toMatch(/with zero declared budgets/i);
    expect(text).toMatch(/`skipped` with the reason `no declared budget`/);
    expect(text).toMatch(/bundle or asset size, latency target, benchmark threshold/i);
    expect(text).toMatch(/reported as unmeasured, never as passing/i);
  });

  it("gates the axis on the budget-declaration check", async () => {
    const runnable = section(
      await load("skills/st-verify/references/performance.md"),
      "Runnable checks",
    ).replace(/\s+/g, " ");

    expect(runnable).toContain("perf-budget-declared");
    expect(runnable).toMatch(/decides whether the rows below can `fail` at all/i);
  });

  it("keeps the gating row from disabling itself under the zero-budget rule", async () => {
    const file = await load("skills/st-verify/references/performance.md");
    const text = flow(file);

    // "With zero declared budgets every row below reports `skipped`" swept the
    // row that DECIDES whether the axis gates into its own consequence: the
    // check that answers "is there a budget" cannot answer "no budget, so I did
    // not run". Its disposition is stated first, and it is never `skipped`.
    expect(text).toMatch(/so it is run and dispositioned first, before the rows it governs/i);
    expect(text).toMatch(/`fail` when none is, naming the absent classes/i);
    expect(text).toMatch(
      /it never reports `skipped`; the row that decides whether the axis gates cannot disable itself/i,
    );
    // Scoped, so the budget-independent rows are no longer swept up with it.
    expect(text).toMatch(/only the rows measured against a budget report `skipped`/i);
    expect(text).toMatch(/the budget-independent rows still run and still record their census/i);
  });

  it("gives every performance row an explicit zero-budget disposition", async () => {
    const file = await load("skills/st-verify/references/performance.md");
    const runnableText = section(file, "Runnable checks");
    const judgmentText = section(file, "Judgment checks");

    // Non-degenerate: five runnable rows, each with its own stated line, so a
    // run on a repo declaring no budget has a disposition per row rather than
    // one blanket rule that contradicts three of them.
    const runnableIds = checkIds(runnableText);
    expect(runnableIds).toHaveLength(5);
    const blocks = runnableText.split(/\n(?=\*\*`perf-)/).slice(1);
    expect(blocks).toHaveLength(runnableIds.length);
    for (const [index, block] of blocks.entries()) {
      expect(block, `${runnableIds[index]} states no zero-budget disposition`).toMatch(
        /Zero-budget disposition:/,
      );
    }
    // Judgment rows take the section rule once — a judgment needs evidence,
    // not a budget.
    expect(judgmentText.replace(/\s+/g, " ")).toMatch(
      /Zero-budget disposition, once for this section/i,
    );
  });

  it("reserves skipped for an expected check and not-applicable for an absent subject", async () => {
    const text = flow(await load("skills/st-verify/references/performance.md"));

    // The skill's own definitions: `skipped` is a check that was expected to run
    // and could not; an absent subject is `not-applicable` with the detection
    // fact as evidence. "judgment-tag the row" was neither.
    expect(text).not.toMatch(/judgment-tag the row/i);
    expect(text).toMatch(/is `not-applicable` with that detection fact as its evidence/i);
    expect(text).toMatch(/`skipped` is for a check that was expected to run and could not/i);
    // The disposition a consumer reads is a field that exists on the artifact.
    expect(text).toMatch(/records it per row in the artifact's `checks\[\]\.status`/);
  });
});

describe("enhancability axis — the migrations floor it gates", () => {
  it("names all four phases the migrations rule names, and one reversal per phase", async () => {
    const axis = await load("skills/st-verify/references/enhancability.md");
    const rule = await load("rules/stamity-migrations.md");
    const migrationRow =
      section(axis, "Runnable checks")
        .split(/\n(?=\*\*`enh-)/)
        .find((block) => block.startsWith("**`enh-migration-path`**")) ?? "";
    const ruleText = flow(rule);

    // The gate enumerated three of the rule's four phases, so a change that
    // dropped `switch` — the phase whose flag IS the rollback — passed a check
    // written to catch exactly that. Phases are read off the rule, not retyped.
    const phases = ["expand", "backfill", "switch", "contract"];
    expect(ruleText).toMatch(/Four phases: expand, backfill, switch, contract/i);
    for (const phase of phases) {
      expect(migrationRow.toLowerCase(), `the gate omits the ${phase} phase`).toContain(phase);
    }
    expect(migrationRow).toMatch(/the four the migrations floor names/i);

    // One stated reverse for four phases is not the rule's reversal contract.
    expect(ruleText).toMatch(/The reversal for each phase is written before phase one ships/i);
    expect(ruleText).toMatch(/One line per phase naming the exact reversal and its cost/i);
    expect(migrationRow).toMatch(/one reversal line per phase naming the exact reversal and its cost/i);
    expect(migrationRow).toMatch(/all four phases present or ruled out with their reason/i);
    expect(migrationRow).toMatch(/a four-phase plan carrying a single reverse for the set/i);
  });
});

describe("product-spec axis — spec tree as the subject", () => {
  it("binds its checks to the spec tree of record", async () => {
    const file = await load("skills/st-verify/references/product-spec.md");
    const text = flow(file);

    expect(text).toContain("docs/specs/");
    expect(text).toContain("[NEEDS CLARIFICATION]");
    expect(text).toContain("REQ-");
    expect(text).toMatch(/given\/when\/then/i);
  });

  it("reports a missing spec tree as not-applicable, not as a failure", async () => {
    const text = flow(await load("skills/st-verify/references/product-spec.md"));

    // Edge case: no docs/specs/ at all — a starting condition, and the next step
    // is the spec touchpoint rather than a finding against this change.
    expect(text).toMatch(/a repo with no `docs\/specs\/` directory reports every row below as not-applicable/i);
    expect(text).toContain("/st-spec");
    expect(text).toContain("`create`");
    expect(text).toMatch(/a starting condition, not a failure of this axis/i);
  });
});

describe("browser-evidence — harness, not gate", () => {
  it("stops and reports on a missing harness without an install instruction", async () => {
    const file = await load("skills/st-browser-evidence/SKILL.md");
    const text = flow(file);

    expect(text).toMatch(/a missing harness stops the run/i);
    expect(text).toContain("BLOCKED_DEPENDENCY");
    expect(text).toMatch(/naming the absent package and the probe that found it absent/i);
    expect(text).toMatch(/this skill adds no dependency and downloads no browser/i);
    // The dependency manifest is the operator's file: a body carrying an install
    // command would read as authorization to run it.
    expect(file.parsed.body).not.toMatch(
      /\b(?:npm|yarn|pnpm|bun|pip|poetry)\s+(?:install|add|i)\b|\bnpx\s+\S+\s+install\b/i,
    );
  });

  it("gives every preflight probe a disposition and records a blocked one in the bundle", async () => {
    const file = await load("skills/st-browser-evidence/SKILL.md");
    const preflight = section(file, "Step 1 — Preflight");
    const rows = preflight
      .split("\n")
      .filter((line) => line.startsWith("|"))
      .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
    const [header, separator, ...probes] = rows;

    // Five probes, two dispositions: a run with a harness and no browser binary
    // read as fine through Step 2 and reached Step 3 with nothing to drive.
    expect(header).toEqual(["Probe", "Looks for", "Absent"]);
    expect(separator?.[0]).toMatch(/^-+$/);
    expect(probes).toHaveLength(5);
    for (const probe of probes) {
      expect(probe[2], `probe "${probe[0]}" states no disposition`).not.toBe("");
    }
    expect(probes.map((probe) => [probe[0], probe[2]])).toEqual([
      ["Harness", "stops the run"],
      ["Accessibility scanner", "Step 5 only"],
      ["Serving path", "stops the run"],
      ["Browser build", "stops the run"],
      ["Surface", "no web surface"],
    ]);

    const text = flow(file);
    // The recovery the skill forecloses is stated as foreclosed, for the binary
    // as well as the package — and the block is auditable in the bundle rather
    // than only in a token the operator never sees.
    expect(text).toMatch(/An absent serving path and an absent browser build stop it the same way/i);
    expect(text).toMatch(/A stopped preflight still writes the bundle/i);
    expect(text).toMatch(/every probe lands in `probes\[\]`/i);
    expect(text).toMatch(/the one that stopped the run carries `not-applicable`/i);
    expect(text).toMatch(/leaves no record that the run happened/i);
    // An absent surface is a different outcome from a blocked dependency.
    expect(text).toMatch(/An absent surface is the "no web surface" case below, not a blocked dependency/i);
  });

  it("derives scenarios from acceptance criteria and refuses unanchored ones", async () => {
    const text = flow(await load("skills/st-browser-evidence/SKILL.md"));

    expect(text).toContain("docs/specs/");
    expect(text).toMatch(/one scenario per given\/when\/then criterion/i);
    expect(text).toMatch(/recording the requirement id it proves/i);
    expect(text).toMatch(/a scenario with neither origin is not run/i);
  });

  it("reads failures only and keeps bulk output on disk", async () => {
    const text = flow(await load("skills/st-browser-evidence/SKILL.md"));

    expect(text).toMatch(/run against the built artifact rather than a development server/i);
    expect(text).toMatch(/on a pass, read the summary count and nothing else/i);
    expect(text).toMatch(/enter the bundle as paths/i);
  });

  it("reports a repo with no web surface as not-applicable, never a fabricated capture", async () => {
    const file = await load("skills/st-browser-evidence/SKILL.md");
    const text = flow(file);

    // Edge case: nothing to drive. The probes are the evidence, and the bundle is
    // still written so an absent surface is a recorded outcome.
    expect(text).toMatch(/a repo with no runnable web surface reports `not-applicable`/i);
    expect(text).toMatch(/lists every probe from step 1 with what it found/i);
    expect(text).toMatch(/an absent surface is a recorded outcome, not a blank/i);
    expect(text).toMatch(
      /never describe a screenshot that was not captured, a scenario that was not run, or a violation count that was not measured/i,
    );
    expect(text).toMatch(/a row with no artifact path is deleted rather than narrated/i);
  });

  it("writes one sha-keyed bundle and hands interpretation back", async () => {
    const output = section(
      await load("skills/st-browser-evidence/SKILL.md"),
      "Output artifact",
    ).replace(/\s+/g, " ");

    expect(output).toContain(".stamity/evidence/browser-<sha>.json");
    expect(output).toMatch(/`-dirty` suffix on an unclean worktree/i);
    expect(output).toContain("`probes[]`");
    expect(output).toMatch(/two runs on one sha overwrite the same path/i);
    expect(flow(await load("skills/st-browser-evidence/SKILL.md"))).toMatch(
      /a harness, not a gate/i,
    );
  });
});

describe("design-system-detect — detection only", () => {
  it("declares itself read-only and refuses generation", async () => {
    const text = flow(await load("skills/st-design-system-detect/SKILL.md"));

    expect(text).toMatch(/read-only detection/i);
    expect(text).toMatch(/it writes no tokens, no components, and no themes/i);
    expect(text).toMatch(/a detector that also generates cannot be trusted to report what it found/i);
  });

  it("lists three competing token sources, flags the conflict, and picks none", async () => {
    const conflict = section(
      await load("skills/st-design-system-detect/SKILL.md"),
      "Competing token sources",
    ).replace(/\s+/g, " ");

    // Edge case: three sources. All three are recorded with evidence; electing a
    // canonical one needs facts the detector cannot see.
    expect(conflict).toMatch(/lists all three with `file:line`/i);
    expect(conflict).toMatch(/marks the conflict, and picks none/i);
    expect(conflict).toMatch(/electing a canonical source is an operator decision/i);
    expect(conflict).toContain("blocked: competing token sources");
  });

  it("states one overlap-count rule instead of two answers for the multi-source case", async () => {
    const file = await load("skills/st-design-system-detect/SKILL.md");
    const conflict = section(file, "Competing token sources").replace(/\s+/g, " ");
    const step2 = section(file, "Step 2 — Token source").replace(/\s+/g, " ");

    // Step 2 said "first match wins" while this section said "picks none"; the
    // boundary was drawn at three sources with no rule for exactly two, and
    // every source still had to be marked canonical or conflicting.
    expect(step2).not.toMatch(/first match wins/i);
    expect(step2).toMatch(/The order is the reporting order, not an election/i);
    expect(step2).toMatch(/a later match is never discarded for arriving second/i);

    expect(conflict).toMatch(/One rule, keyed on how many sources define the SAME value category/);
    expect(conflict).toMatch(/\*\*One source defines a category\*\* — that source is `canonical`/);
    expect(conflict).toMatch(/\*\*Two or more define it\*\* — every one of them is marked `conflicting`/);
    // The two-source case, which the three-source wording left unanswered.
    expect(conflict).toMatch(/Two overlapping sources block exactly as five do/i);
    expect(conflict).toMatch(/Several sources is not by itself a conflict/i);
  });

  it("lists the blocked verdict in the Step 5 table, not only seventeen lines later", async () => {
    const file = await load("skills/st-design-system-detect/SKILL.md");
    const verdicts = section(file, "Step 5 — Emit the inventory")
      .split("\n")
      .filter((line) => line.startsWith("|"))
      .slice(2)
      .map((line) => line.replace(/^\||\|$/g, "").split("|")[0]?.trim());

    // Step 5 declared the verdict "one of" three rows; the Output section lists
    // four and the pack consumer routes on four. The omitted row is the one
    // that stops an irreversible write, so it is in the table a reader uses.
    expect(verdicts).toEqual(["`reuse`", "`extend`", "`create`", "`blocked`"]);
    expect(flow(file)).toMatch(/it is the row that stops an irreversible write/i);
    expect(flow(file)).toMatch(/mints the parallel system this skill exists to prevent/i);
  });

  it("separates a negative probe from an absent probe", async () => {
    const text = flow(await load("skills/st-design-system-detect/SKILL.md"));

    expect(text).toMatch(/no dependency manifest does not mean no design system/i);
    expect(text).toMatch(/looked and found nothing.*did not look/i);
  });

  it("emits one regenerated inventory at a stable path with a verdict", async () => {
    const output = section(
      await load("skills/st-design-system-detect/SKILL.md"),
      "Output artifact",
    ).replace(/\s+/g, " ");

    expect(output).toContain(".stamity/design-system-inventory.md");
    expect(output).toMatch(/regenerated in place rather than accumulating per-run copies/i);
    expect(output).toMatch(/`reuse`, `extend`, `create`, or `blocked`/);
    expect(output).toMatch(/records the commit it was generated from/i);
  });
});

describe("dep-audit — report-only", () => {
  it("states report-only and routes action to the work touchpoint", async () => {
    const text = flow(await load("skills/st-dep-audit/SKILL.md"));

    expect(text).toMatch(/report-only\. it reads the dependency graph and reports risk/i);
    expect(text).toMatch(/it edits no manifest, no lockfile, and no source file/i);
    expect(text).toContain("/st-work");
    expect(text).toMatch(/a dependency change is a code change/i);
  });

  it("audits the lockfile rather than the declared ranges", async () => {
    const text = flow(await load("skills/st-dep-audit/SKILL.md"));

    expect(text).toMatch(/the lockfile is the subject/i);
    expect(text).toMatch(/shortest path from a direct dependency/i);
    expect(text).toMatch(/no lockfile is a finding in itself/i);
  });

  it("reports an unreachable advisory source as a gap, not a clean scan", async () => {
    const text = flow(await load("skills/st-dep-audit/SKILL.md"));

    // Edge case: a source that could not be queried. Marking the run partial is
    // what keeps an unrun scan from reading as a clean one.
    expect(text).toMatch(/when a source cannot be queried — offline, rate limited, credentials absent/i);
    expect(text).toMatch(/names what it did not cover, and marks the run `partial`/i);
    expect(text).toMatch(/a scan that could not run is not a clean scan/i);
  });

  it("classifies update risk and hands breaking-change detail to research", async () => {
    const text = flow(await load("skills/st-dep-audit/SKILL.md"));

    for (const klass of ["patch", "minor", "major", "pinned-back", "unmaintained"]) {
      expect(text).toContain(`| ${klass} |`);
    }
    expect(text).toMatch(/version numbers state intent, not fact/i);
    expect(text).toMatch(/hand a `researcher` brief/i);
  });

  it("flags licences without deciding policy", async () => {
    const licences = section(await load("skills/st-dep-audit/SKILL.md"), "Step 3 — Licences");

    expect(licences).toMatch(/packages declaring no licence at all/i);
    expect(licences).toMatch(/the skill flags; the operator decides/i);
  });

  it("flags only the licence classes a report-only run can populate", async () => {
    const file = await load("skills/st-dep-audit/SKILL.md");
    const licences = section(file, "Step 3 — Licences");
    const classes = licences
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim());
    const output = section(file, "Output artifact").replace(/\s+/g, " ");

    // "Licences that changed since the last recorded run of this skill" needs a
    // previous run on disk to diff, and the skill states it writes to no
    // artifact family — so one of three classes could never be populated.
    expect(classes).toHaveLength(2);
    expect(licences).not.toMatch(/changed since the last recorded run/i);
    expect(licences.replace(/\s+/g, " ")).toMatch(/Licence CHANGE is not a third class here/);
    expect(licences.replace(/\s+/g, " ")).toMatch(
      /this skill writes no artifact family, so there is nothing on disk/i,
    );
    // The Output section counts the same classes the step flags.
    expect(output).toMatch(/the two flag classes above/i);
    expect(output).toMatch(/not written to a new artifact family/i);
  });
});
