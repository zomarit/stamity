import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { frontmatterField } from "../../src/content/frontmatter.ts";
import { CATALOG_PINS } from "../../src/pack/catalogPins.ts";
import { lookupCatalogEntry } from "../../src/pack/curated.ts";
import { enumeratePackContent, readPackManifest, verifyIntegrityMap } from "../../src/pack/manifest.ts";
import { MOVED_CORE_SKILLS } from "../../src/pack/moved.ts";
import { TOOLS } from "../../src/types/core.ts";
import {
  assertDenyClean,
  assertLineCap,
  filenameSlug,
  requireLoadClass,
  requireObsoleteWhen,
  walkAllMarkdown,
  type CorpusFile,
} from "../corpus/harness.ts";
import { TRIGGER_DOMAINS } from "../corpus/skills/triggerDomains.ts";

/**
 * The `frontend` pack (plan 018, u13-frontend-move; REQ-PACK-007): the two interface skills,
 * design-system-detect and browser-evidence, which left the core for this pack.
 *
 * Their suites moved here from `test/corpus/skills/verifyRestTools.test.ts` with the files, and
 * run against `packs/frontend/` with the same assertions, bar two: a description now holds to 250
 * characters (REQ-PACK-007), not the corpus's 1,024, and the trigger-surface checks that held the
 * two apart from the core's skills inside one roster now read the core from `content/` beside the
 * pack, in both directions.
 *
 *   - **The refusals.** For these two skills the refusal IS the skill — browser-evidence not
 *     installing, design-system-detect not electing a token source. Deleting the sentence deletes
 *     the behavior, so the sentences are asserted.
 *   - **Anti-shadowing.** With the pack installed, its descriptions sit in one list with the
 *     core's. Distinctive nouns are declared per skill and asserted in both directions, each
 *     pack skill's trigger phrase appears in no core skill's description, each core trigger
 *     phrase (`test/corpus/skills/triggerDomains.ts`, the table the core roster reads) appears
 *     in neither pack description, and the ten descriptions open on ten different verbs.
 *
 * Plan 018 file 2 (u3-frontend-set; REQ-PACK-021, REQ-PACK-022) adds `/st-ui-review`, the pack's
 * one command, which reviews a named screen or flow through the core design-quality agent and
 * never edits, and changes the detector's inventory: a `Status` row in place of the per-request
 * verdict, an alias source counted with the source it refers to, and a token-set proposal when no
 * source is found.
 *
 * Prose assertions run against a whitespace-flattened view ({@link flow}) so a reflowed paragraph
 * is not a failure; structural assertions (headings, caps) run against the raw body.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACK_ROOT = join(REPO_ROOT, "packs", "frontend");

/** The manifest description, as the plan states the pack's identity. */
const PACK_IDENTITY =
  "Interface work that reuses the design system a repo already has and captures browser evidence for the accessibility floor.";

/** Exactly what this pack ships: one command, and two skills, each a SKILL.md and its Codex companion. */
const SHIPPED_FILES: readonly string[] = [
  "commands/st-ui-review.md",
  "skills/st-browser-evidence/SKILL.md",
  "skills/st-browser-evidence/agents/openai.yaml",
  "skills/st-design-system-detect/SKILL.md",
  "skills/st-design-system-detect/agents/openai.yaml",
];

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

/** Skill body cap from the anatomy standard: 500 lines, with 200 as the design target. */
const SKILL_BODY_CAP = 500;
const SKILL_DESIGN_TARGET = 200;

/** REQ-PACK-007: each moved skill's description holds to 250 characters. */
const DESCRIPTION_MAX = 250;

/** A description addressing the reader is second person by construction. */
const SECOND_PERSON = /\b(?:you|your|yours|yourself)\b/i;

/**
 * Protocol sections the skill anatomy bans per-skill: ambiguity (B1), fan-out (B2), error
 * handling, and definition of done live once in the charter and the rules.
 */
const BANNED_SECTION = /^#{2,}\s.*\b(?:B1|B2|error handling|definition of done)\b/im;

interface ToolSkill {
  id: string;
  relPath: string;
  tags: string[];
  /** Nouns that make this description's trigger domain distinctive (see the header). */
  distinctive: string[];
  /** The exclusive trigger phrase no core description may carry (was `flow.test.ts` TRIGGER_DOMAINS). */
  phrase: RegExp;
}

const SKILLS: readonly ToolSkill[] = [
  {
    id: "browser-evidence",
    relPath: "skills/st-browser-evidence/SKILL.md",
    tags: ["review"],
    distinctive: ["browser", "screenshot", "accessibility"],
    phrase: /browser/i,
  },
  {
    id: "design-system-detect",
    relPath: "skills/st-design-system-detect/SKILL.md",
    tags: ["maintenance"],
    distinctive: ["design", "tokens", "theming", "inventory"],
    phrase: /design system/i,
  },
];

/**
 * The core siblings these two must stay clear of, with their distinctive nouns: dep-audit (the
 * third tool skill of `verifyRestTools.test.ts`) and verify. Restated here as that suite restates
 * verify's; the case below locks each list to its core description.
 */
const CORE_NEIGHBOURS: readonly { relPath: string; distinctive: string[] }[] = [
  { relPath: "skills/st-dep-audit/SKILL.md", distinctive: ["dependency", "advisories", "licenses"] },
  { relPath: "skills/st-verify/SKILL.md", distinctive: ["axis", "gate", "judgment"] },
  // Added in plan 018 file 2 (u9-st-plain): the core's writing skill, whose nouns stay out of both
  // pack descriptions and theirs out of its own, the two directions the cases below assert.
  { relPath: "skills/st-plain/SKILL.md", distinctive: ["plain", "reply", "simpler"] },
];

/** One walk of the pack and one of the core; neither changes under the suite. */
const packFiles: Promise<CorpusFile[]> = walkAllMarkdown(PACK_ROOT);
const coreFiles: Promise<CorpusFile[]> = walkAllMarkdown();

async function load(relPath: string): Promise<CorpusFile> {
  const file = (await packFiles).find((candidate) => candidate.relPath === relPath);
  if (file === undefined) {
    throw new Error(`${relPath}: not present under packs/frontend`);
  }
  return file;
}

async function loadCore(relPath: string): Promise<CorpusFile> {
  const file = (await coreFiles).find((candidate) => candidate.relPath === relPath);
  if (file === undefined) {
    throw new Error(`${relPath}: not present under the corpus root`);
  }
  return file;
}

function description(file: CorpusFile): string {
  return String(frontmatterField(file.parsed, "description"));
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

describe("frontend pack — manifest and catalog", () => {
  it("carries the pack identity, the release version, the four clients and an honest footprint", async () => {
    const manifest = await readPackManifest(PACK_ROOT);
    const packageJson = JSON.parse(await readFile(join(REPO_ROOT, "package.json"), "utf8")) as {
      version: string;
    };

    expect(manifest.name).toBe("frontend");
    expect(manifest.version).toBe(packageJson.version);
    expect(manifest.description).toBe(PACK_IDENTITY);
    expect(manifest.declaredTools).toEqual([...TOOLS]);
    // TEST CHANGE, justified (2026-10-21, plan 018 file 2, unit u3-frontend-set; REQ-PACK-021):
    // the pin read ["read", "edit", "execute"] because neither skill delegated. What moved:
    // `/st-ui-review` spawns researchers and the core design-quality agent, so the footprint
    // discloses `spawn`; the command writes nothing, so `touchedPaths` is unchanged.
    expect(manifest.permissions?.toolFootprint).toEqual(["read", "edit", "execute", "spawn"]);
    expect(manifest.permissions?.touchedPaths).toEqual([
      ".stamity/design-system-inventory.md",
      ".stamity/evidence/**",
    ]);
  });

  it("ships exactly its declared roster, every file under its integrity digest", async () => {
    const manifest = await readPackManifest(PACK_ROOT);
    const content = await enumeratePackContent(PACK_ROOT);

    expect(content.map((file) => file.relPath).toSorted()).toEqual([...SHIPPED_FILES]);
    expect(Object.keys(manifest.integrity).toSorted()).toEqual([...SHIPPED_FILES]);
    await expect(verifyIntegrityMap(PACK_ROOT, manifest, content)).resolves.toBe("pass");
  });

  it("declares exactly the write surface its two bodies claim", async () => {
    const manifest = await readPackManifest(PACK_ROOT);
    const claims = [
      { path: ".stamity/design-system-inventory.md", body: "skills/st-design-system-detect/SKILL.md" },
      { path: ".stamity/evidence/**", body: "skills/st-browser-evidence/SKILL.md" },
    ];

    expect(manifest.permissions?.touchedPaths).toEqual(claims.map((claim) => claim.path));
    const bodies = await Promise.all(claims.map((claim) => load(claim.body)));
    for (const [index, claim] of claims.entries()) {
      const literal = claim.path.replace("/**", "/");
      expect(flow(bodies[index]!), `${claim.body} no longer claims ${claim.path}`).toContain(literal);
    }
  });

  it("resolves `add frontend` through the catalog at the generated pin", () => {
    const entry = lookupCatalogEntry("frontend");

    expect(entry).toBeDefined();
    expect(entry?.source).toEqual({ kind: "bundled" });
    expect(entry?.description).toBe(PACK_IDENTITY);
    expect(CATALOG_PINS.frontend).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ships every skill the moved-skills table names as moved to it", async () => {
    const moved = MOVED_CORE_SKILLS.filter((skill) => skill.pack === "frontend").map((skill) => skill.id);

    expect(moved.toSorted()).toEqual(SKILLS.map((skill) => skill.id).toSorted());
    const [pack, core] = await Promise.all([packFiles, coreFiles]);
    for (const id of moved) {
      expect(pack.some((file) => file.relPath === `skills/st-${id}/SKILL.md`), id).toBe(true);
      expect(core.some((file) => file.relPath.startsWith(`skills/st-${id}/`)), id).toBe(false);
    }
  });
});

describe("frontend skills — contract and anatomy", () => {
  it.each(SKILLS)("$id carries the skill identity head", async (skill) => {
    const file = await load(skill.relPath);

    expect(frontmatterField(file.parsed, "id")).toBe(skill.id);
    expect(filenameSlug(file.relPath)).toBe(skill.id);
    expect(frontmatterField(file.parsed, "type")).toBe("skill");
    expect(frontmatterField(file.parsed, "tags")).toEqual(skill.tags);

    const text = description(file);
    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(text).not.toMatch(SECOND_PERSON);
    // The trigger clause names a condition: the description is what the skill fires on.
    expect(text.slice(text.search(/\bTriggers\b/))).toMatch(/^Triggers\b.*\bwhen\b/i);

    requireLoadClass(file, ["on-demand"]);
    requireObsoleteWhen(file);
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
    expect((await load(skill.relPath)).parsed.body).not.toMatch(BANNED_SECTION);
  });

  it.each(SKILLS)("$id mentions only touchpoints that exist", async (skill) => {
    const file = await load(skill.relPath);
    const mentioned = [...file.parsed.body.matchAll(/\/st-([a-z][a-z-]*)/g)].map((match) => match[1]);

    for (const id of new Set(mentioned)) {
      expect(COMMAND_IDS, `${file.relPath}: /st-${id} is not a touchpoint`).toContain(id);
    }
  });
});

describe("frontend skills — anti-shadowing on the trigger surface", () => {
  it.each(SKILLS)("$id carries its own distinctive nouns", async (skill) => {
    const text = description(await load(skill.relPath)).toLowerCase();

    for (const noun of skill.distinctive) {
      expect(text).toContain(noun);
    }
  });

  it.each(SKILLS)("$id claims no sibling's or core neighbour's trigger domain", async (skill) => {
    const text = description(await load(skill.relPath)).toLowerCase();
    const foreign = [
      ...CORE_NEIGHBOURS.flatMap((neighbour) => neighbour.distinctive),
      ...SKILLS.filter((other) => other.id !== skill.id).flatMap((other) => other.distinctive),
    ];

    for (const noun of foreign) {
      expect(text, `${skill.id}: description claims "${noun}"`).not.toContain(noun);
    }
  });

  // TEST CHANGE, justified (u9-st-plain, plan 018 file 2): CORE_NEIGHBOURS gained plain, so the
  // title names the three neighbours the loop now reads; the loop is unchanged.
  it("keeps dep-audit, verify and plain on their own nouns and clear of these two domains", async () => {
    const files = await Promise.all(CORE_NEIGHBOURS.map((neighbour) => loadCore(neighbour.relPath)));
    for (const [index, neighbour] of CORE_NEIGHBOURS.entries()) {
      const text = description(files[index]!).toLowerCase();
      for (const noun of neighbour.distinctive) {
        expect(text, `${neighbour.relPath} lost "${noun}"`).toContain(noun);
      }
      for (const noun of SKILLS.flatMap((skill) => skill.distinctive)) {
        expect(text, `${neighbour.relPath}: description claims "${noun}"`).not.toContain(noun);
      }
    }
  });

  it("names each pack skill's trigger phrase in no core skill's description", async () => {
    const coreSkills = (await coreFiles).filter((file) => /^skills\/[^/]+\/SKILL\.md$/.test(file.relPath));
    // Non-degenerate: the core's eight skills, each read.
    // TEST CHANGE, justified (u9-st-plain, plan 018 file 2): `plain` joined the core (REQ-FLOW-129).
    expect(coreSkills).toHaveLength(8);

    const own = await Promise.all(SKILLS.map((skill) => load(skill.relPath)));
    for (const [index, skill] of SKILLS.entries()) {
      expect(description(own[index]!), `${skill.id} lost its own phrase`).toMatch(skill.phrase);
      for (const core of coreSkills) {
        expect(description(core), `${core.relPath} borrows ${skill.id}'s trigger domain`).not.toMatch(
          skill.phrase,
        );
      }
    }
  });

  // review/25: the reverse direction the moved roster rows carried in flow.test.ts.
  it("names no core skill's trigger phrase in either pack description", async () => {
    const coreSkills = (await coreFiles).filter((file) => /^skills\/[^/]+\/SKILL\.md$/.test(file.relPath));
    // Non-degenerate and drift-proof: the table names exactly the core's skills, so a new core
    // skill without a row fails here before it can share a trigger with a pack skill.
    expect(TRIGGER_DOMAINS.map((row) => row.relPath).toSorted()).toEqual(
      coreSkills.map((file) => file.relPath).toSorted(),
    );

    const own = await Promise.all(SKILLS.map((skill) => load(skill.relPath)));
    for (const [index, skill] of SKILLS.entries()) {
      const text = description(own[index]!);
      for (const row of TRIGGER_DOMAINS) {
        expect(text, `${skill.id} borrows ${row.id}'s trigger domain`).not.toMatch(row.phrase);
      }
    }
  });

  // TEST CHANGE, justified (u9-st-plain, plan 018 file 2): the core holds eight skills, so the
  // title's counts move; the assertions read TRIGGER_DOMAINS and are unchanged.
  it("opens the eight core and two pack descriptions on ten different verbs", async () => {
    const files = [
      ...(await Promise.all(TRIGGER_DOMAINS.map((row) => loadCore(row.relPath)))),
      ...(await Promise.all(SKILLS.map((skill) => load(skill.relPath)))),
    ];
    const leading = files.map((file) => description(file).split(/\s+/)[0]!.toLowerCase());

    // The word a matcher reads first. Two skills opening on one verb compete for the same
    // trigger, and only one of them ever wins.
    expect(leading).toHaveLength(TRIGGER_DOMAINS.length + SKILLS.length);
    expect(new Set(leading).size, `shared opening verb in ${leading.join(", ")}`).toBe(leading.length);
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

  // Plan 018 file 2, u3-frontend-set (review/4): `/st-ui-review` is a second caller on the
  // same sha, so the skill takes an optional suffix and the review passes one, leaving the
  // unsuffixed bundle a `/st-work` proof block cites untouched.
  it("takes an optional caller suffix, and /st-ui-review passes `ui-review`", async () => {
    const output = section(
      await load("skills/st-browser-evidence/SKILL.md"),
      "Output artifact",
    ).replace(/\s+/g, " ");

    expect(output).toContain(".stamity/evidence/browser-<sha>-<suffix>.json");
    expect(output).toMatch(/with no suffix the name is the one above/i);
    expect(flow(await load(UI_REVIEW))).toContain(
      ".stamity/evidence/browser-<sha>-ui-review.json",
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

  it("emits one regenerated inventory at a stable path with a status row, the verdict handed back", async () => {
    const file = await load("skills/st-design-system-detect/SKILL.md");
    const output = section(file, "Output artifact").replace(/\s+/g, " ");

    expect(output).toContain(".stamity/design-system-inventory.md");
    expect(output).toMatch(/regenerated in place rather than accumulating per-run copies/i);
    // TEST CHANGE, justified (2026-10-21, plan 018 file 2, unit u3-frontend-set; REQ-PACK-022):
    // the pin read "`reuse`, `extend`, `create`, or `blocked`" among the file's sections. What
    // moved: every later request reads the file, so it keeps repo facts and a `Status` row, and
    // the per-request verdict leaves it for the hand-back; the old row is asserted gone.
    expect(output).not.toMatch(/`reuse`, `extend`, `create`, or `blocked`/);
    expect(output).toMatch(/\| Status \| `clear` or `blocked: competing token sources` \|/);
    expect(output).toMatch(/no per-request verdict/i);
    expect(output).toMatch(/records the commit it was generated from/i);
    const step5 = section(file, "Step 5 — Emit the inventory").replace(/\s+/g, " ");
    expect(step5).toMatch(/the verdict goes in the hand-back, naming the need it answers/i);
  });

  it("counts an alias source as one system with the source it refers to", async () => {
    const conflict = section(
      await load("skills/st-design-system-detect/SKILL.md"),
      "Competing token sources",
    ).replace(/\s+/g, " ");

    // Edge case: a theme block whose every colour refers to the token file's colours is not a
    // second system, and reading it as one blocks every request on a choice with no stakes.
    expect(conflict).toContain("alias of <path>");
    expect(conflict).toMatch(/every value in a category refers to another source's token/i);
    expect(conflict).toMatch(/does not define that category, and the pair counts as one system/i);
    expect(conflict).toMatch(/one literal value makes it a definer again/i);
  });

  it("proposes a minimal token set as text when no token source is found", async () => {
    const file = await load("skills/st-design-system-detect/SKILL.md");
    const proposal = section(file, "No token source — the Proposal").replace(/\s+/g, " ");
    const output = section(file, "Output artifact");

    expect(proposal).toMatch(/carries a `Proposal` section as text/i);
    expect(proposal).toMatch(/focus ring at 3:1/i);
    expect(proposal).toMatch(/reduced-motion variant/i);
    expect(proposal).toMatch(/light and dark with identical keys/i);
    expect(proposal).toMatch(/4\.5:1 and 3:1/);
    expect(proposal).toMatch(/brand hue is left to the operator/i);
    expect(proposal).toContain("/st-work");
    expect(output).toMatch(/^\| Proposal \|/m);
    // Still a detector: the proposal is text in the inventory, never a token file.
    expect(flow(file)).toMatch(/it writes no tokens, no components, and no themes/i);
    expect(flow(file)).not.toMatch(/generation belongs to a generator pack/i);
  });
});

/** The pack's one command: reviews a named screen or flow, never edits (REQ-PACK-021). */
const UI_REVIEW = "commands/st-ui-review.md";

/** The command head the plan cell fixes, word for word. */
const UI_REVIEW_DESCRIPTION =
  "Reviews a named screen or flow against the design system, the UI states and WCAG 2.2 AA through the design-quality agent and browser evidence, returning findings with path:line and never editing.";

describe("/st-ui-review — reviews a named surface, never edits", () => {
  it("carries the command head: id, type, read-only, and a spawn set with no writer", async () => {
    const file = await load(UI_REVIEW);

    expect(frontmatterField(file.parsed, "id")).toBe("ui-review");
    expect(filenameSlug(file.relPath)).toBe("ui-review");
    expect(frontmatterField(file.parsed, "type")).toBe("command");
    expect(frontmatterField(file.parsed, "description")).toBe(UI_REVIEW_DESCRIPTION);
    expect(frontmatterField(file.parsed, "tags")).toEqual(["review"]);
    expect(frontmatterField(file.parsed, "readonly")).toBe(true);
    // The spawn set is the guarantee: no role on the far end holds an edit grant.
    expect(frontmatterField(file.parsed, "spawns")).toEqual(["researcher", "design-quality"]);
    requireLoadClass(file, ["on-demand"]);
    requireObsoleteWhen(file);
  });

  it("stays inside the design target and scans clean", async () => {
    const file = await load(UI_REVIEW);

    assertLineCap(file, SKILL_DESIGN_TARGET);
    assertDenyClean(file);
    expect(file.parsed.body).not.toMatch(BANNED_SECTION);
  });

  it("states the read-only boundary, the not-measured rule and the blocked exits", async () => {
    const file = await load(UI_REVIEW);
    const text = flow(file);

    expect(text).toMatch(/reviews, never edits/i);
    expect(text).toContain("never edit");
    expect(text).toContain("not measured");
    expect(text).toContain("BLOCKED_DEPENDENCY");
    expect(text).toMatch(/no implementer and no fixer/i);
    // A pack carries no CLI call: a pinned call is the engine's to render.
    expect(file.parsed.body).not.toMatch(/(?<![\w./-])stamity\s+[a-z]/);
    expect(file.parsed.body).not.toMatch(/\bnpx\b/);
  });

  it("runs the detector first when the inventory is absent or behind, and raises no token finding over a blocked one", async () => {
    const text = flow(await load(UI_REVIEW));

    expect(text).toContain("st-design-system-detect");
    expect(text).toMatch(/absent or its recorded commit is behind the head/i);
    expect(text).toContain("st-browser-evidence");
    expect(text).toMatch(/whole-surface brief/i);
    expect(text).toMatch(/raises no token finding/i);
    expect(text).toMatch(/contested categories/i);
  });

  it("routes fixes out and refuses a fix request in one line, with no diff handed over", async () => {
    const file = await load(UI_REVIEW);
    const refusals = section(file, "Refusals");
    const text = flow(file);

    expect(text).toContain("/st-work");
    expect(text).toContain("/st-plan");
    expect(refusals).toMatch(/one-line refusal/i);
    expect(refusals.replace(/\s+/g, " ")).toMatch(/no patch, no diff/i);
    // Every situation the cell lists has its row.
    for (const situation of [/no target/i, /resolves to no file/i, /design-quality/i, /browser/i, /blocked/i, /fix/i]) {
      expect(refusals).toMatch(situation);
    }
  });

  it("mentions only commands that exist: the nine touchpoints and itself", async () => {
    const file = await load(UI_REVIEW);
    const mentioned = [...file.parsed.body.matchAll(/\/st-([a-z][a-z-]*)/g)].map((match) => match[1]);

    expect(mentioned.length).toBeGreaterThan(0);
    for (const id of new Set(mentioned)) {
      expect([...COMMAND_IDS, "ui-review"], `${file.relPath}: /st-${id} is not a command`).toContain(id);
    }
  });

  it("returns DONE with the surface, sha, inventory state and criteria, and BLOCKED_* in the standard form", async () => {
    const contract = section(await load(UI_REVIEW), "Return contract").replace(/\s+/g, " ");

    expect(contract).toContain("`DONE` | `BLOCKED_AMBIGUITY` | `BLOCKED_DEPENDENCY` | `BLOCKED_FAILURE`");
    for (const field of [/surface/i, /sha/i, /inventory/i, /not applicable/i, /not measured/i, /count/i]) {
      expect(contract).toMatch(field);
    }
    expect(contract).toMatch(/smallest unblocking input/i);
  });
});
