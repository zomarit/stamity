import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractToolsFrontmatter, frontmatterField } from "../../../src/content/frontmatter.ts";
import {
  CONTENT_DENY_PATTERNS,
  INJECTION_PATTERNS,
  scanAntiSlop,
  scanForDeniedPatterns,
} from "../../../src/denyscan/denyScan.ts";
import { projectSkills } from "../../../src/emit/skillsProjection.ts";
import { REPO_SUBSTITUTION_TOKENS } from "../../../src/emit/substitution.ts";
import { createManifest } from "../../../src/manifest/manifest.ts";
import {
  CORPUS_ROOT,
  assertDenyClean,
  assertLineCap,
  corpusFileOf,
  filenameSlug,
  requireLoadClass,
  requireObsoleteWhen,
  type CorpusFile,
} from "../harness.ts";

/**
 * The verify skill's core: the dispatch body plus the first five axis
 * references (ui, ux, security, reliability, testability).
 *
 * The skill is axis-parameterized — one body holds the run contract, the
 * artifact schema, and the status vocabulary, and each axis contributes only
 * its checks. So this suite binds two different things:
 *
 *   - **The dispatch contract**, once, against `SKILL.md`: ten axis rows, each
 *     with the read gate that opens its reference; the `.stamity/verify/` seam
 *     and its field list; the four run-contract steps; and the honesty rule
 *     that keeps an unrunnable check reported instead of dropped.
 *   - **The axis anatomy**, per reference: the frontmatter head, the line band,
 *     the runnable/judgment split, an id on every check row, and the axis
 *     content the design names.
 *
 * The five remaining axes (scalability, performance, maintainability,
 * enhancability, product-spec) are authored alongside this unit and carry their
 * own suite. Their dispatch ROWS are asserted here — the table is this file's
 * artifact — while their FILES are not, so neither unit's suite fails on the
 * other's landing order.
 *
 * Phrase assertions run against whitespace-normalized prose, so a clause that
 * wraps across source lines still matches and re-flowing markdown is never a
 * false failure.
 */

/** Corpus-relative path of the dispatch body. */
const SKILL_PATH = "skills/st-verify/SKILL.md";

/** The axes this unit authors references for. */
const OWNED_AXES = ["ui", "ux", "security", "reliability", "testability"] as const;

type OwnedAxis = (typeof OWNED_AXES)[number];

/** Every axis the dispatch table offers, in table order. */
const ALL_AXES: readonly string[] = [
  "ui",
  "ux",
  "security",
  "reliability",
  "testability",
  "scalability",
  "performance",
  "maintainability",
  "enhancability",
  "product-spec",
];

/** Physical-line cap on the dispatch body — it is the always-paid half of the skill. */
const SKILL_MAX_LINES = 130;

/** Body-line band for one axis reference: thin enough to gate, thick enough to be a gate. */
const REFERENCE_MIN_LINES = 40;
const REFERENCE_MAX_LINES = 100;

/** The consumer seam: one neutral artifact family, addressed by path. */
const ARTIFACT_DIR = ".stamity/verify/";

/** Closed status vocabulary an artifact row may carry. */
const STATUSES: readonly string[] = ["pass", "fail", "skipped", "not-applicable"];

/** The two check classes every reference declares. */
const KINDS: readonly string[] = ["runnable", "judgment"];

/**
 * The six objective-shape rows the reliability axis publishes. CQ4's SLO
 * criteria used to live only inside the scaffold pack, which both denied
 * defining a floor and defined one — so a repo without that pack installed had
 * no objective criteria at all, and the pack graded its own output against
 * rules nothing else could read. The ids are fixed here, in the core axis; the
 * pack cites them and defines none.
 */
const SLO_OBJECTIVE_IDS = [
  "rel-slo-objective",
  "rel-availability-target",
  "rel-error-budget",
  "rel-burn-rate-alert",
  "rel-slo-window",
  "rel-slo-owner",
] as const;

/** Per-axis id namespace, so a consumer citing a check id knows which axis wrote it. */
const CHECK_PREFIX: Record<OwnedAxis, string> = {
  ui: "ui-",
  ux: "ux-",
  security: "sec-",
  reliability: "rel-",
  testability: "test-",
};

/**
 * What each axis must carry as text: the check ids the design names, and the
 * design decisions that must survive as prose. Ids are the machine-citable
 * half; the phrases are what keeps a row a check rather than a heading.
 */
const AXIS_CONTRACT: Record<OwnedAxis, { ids: readonly string[]; phrases: readonly RegExp[] }> = {
  ui: {
    ids: [
      "ui-state-render",
      "ui-token-usage",
      "ui-visual-baseline",
      "ui-contrast",
      "ui-focus-visible",
      "ui-accessible-name",
    ],
    // The machine-checkable accessibility slice: contrast ratios, focus, names.
    phrases: [/4\.5:1/, /3:1/, /focus/i, /design system/i, /visual[- ]regression/i],
  },
  ux: {
    ids: ["ux-four-state", "ux-error-exit", "ux-flow-exit", "ux-string-external"],
    // The four-state contract, dead ends, and the string layer.
    phrases: [/loading, empty, error,\s*and success/i, /dead end/i, /catalog/i],
  },
  security: {
    ids: [
      "sec-dep-advisories",
      "sec-credential-literals",
      "sec-authz-census",
      "sec-input-validation",
    ],
    phrases: [/lockfile/i, /unauthenticated set/i, /trust boundary/i, /\bA0\d\b/],
  },
  reliability: {
    ids: [
      "rel-error-path",
      "rel-timeout",
      "rel-retry-safety",
      "rel-shutdown",
      "rel-health",
      ...SLO_OBJECTIVE_IDS,
    ],
    phrases: [/catch, rescue, or recover/i, /liveness and readiness/i, /idempoten/i],
  },
  testability: {
    ids: [
      "test-coverage-data",
      "test-suite-shape",
      "test-quarantine-census",
      "test-determinism",
    ],
    // Thresholds are the repo's data, never an imported floor.
    phrases: [/Thresholds are data, not dogma/i, /clock, random/i, /quarantine/i],
  },
};

/** Content artifacts mint no product URLs or domains. */
const URL_OR_DOMAIN = /https?:\/\/|www\./i;

/** Model-Independence Contract: shipped content names no vendors or models. */
const VENDOR_OR_MODEL_NAMES =
  /\b(?:claude|cursor|copilot|codex|anthropic|openai|gemini|gpt|llama|mistral)\b/i;

/**
 * Reserved product-name leakage is NOT restated here. `scripts/leak-gate.mjs`
 * scans every file in the repo, assembles each reserved token from fragments so it
 * never contains one literally, and exempts nothing — a suite that spelled the
 * tokens out to re-assert the ban would itself be a gate violation.
 */

/** The nine SDLC touchpoints; a `/st-*` mention outside this set is a dangling reference. */
const COMMAND_CENSUS: readonly string[] = [
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

/** Corpus-relative path of one axis reference. */
function referencePath(axis: string): string {
  return `skills/st-verify/references/${axis}.md`;
}

/** Read-once cache: every case reads through here, so a missing file fails by path. */
const cache = new Map<string, Promise<CorpusFile>>();

function load(relPath: string): Promise<CorpusFile> {
  const hit = cache.get(relPath);
  if (hit) return hit;
  const pending = readFile(join(CORPUS_ROOT, relPath), "utf8").then((raw) =>
    corpusFileOf(relPath, raw),
  );
  cache.set(relPath, pending);
  return pending;
}

/** Body with every whitespace run collapsed — line wrapping is not semantics. */
function prose(file: CorpusFile): string {
  return file.parsed.body.replace(/\s+/g, " ");
}

/** Body lines, discounting the trailing newline — parity with the harness's accounting. */
function bodyLines(file: CorpusFile): number {
  const trimmed = file.parsed.body.replace(/\r?\n$/, "");
  return trimmed === "" ? 0 : trimmed.split(/\r?\n/).length;
}

/** The text under `## <heading>`, up to the next `##` heading (`###` stays inside). */
function section(file: CorpusFile, heading: string): string {
  const body = file.parsed.body;
  const start = body.indexOf(`## ${heading}`);
  if (start === -1) return "";
  const rest = body.slice(start + heading.length + 3);
  const end = rest.search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end);
}

/** Pipe-table rows in a chunk of markdown, as trimmed cell arrays. */
function tableRows(text: string): string[][] {
  return text
    .split("\n")
    .filter((line) => line.trimStart().startsWith("|"))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim()),
    );
}

/** One check row: its id and the full text of its bullet, continuation lines included. */
interface CheckRow {
  id: string;
  text: string;
}

/**
 * Check rows in a section. A row opens with `- **`<id>`**` at column 0 and runs
 * until the next such bullet, so the indented How/Threshold continuation lines
 * belong to the check that opened them.
 */
function checkRows(text: string): CheckRow[] {
  const rows: CheckRow[] = [];
  const opener = /^- \*\*`([^`]+)`\*\*/;
  let current: CheckRow | undefined;
  for (const line of text.split("\n")) {
    const match = opener.exec(line);
    if (match?.[1] !== undefined) {
      current = { id: match[1], text: line };
      rows.push(current);
    } else if (current && line.startsWith("  ")) {
      current.text += ` ${line.trim()}`;
    } else if (line.trim() === "") {
      continue;
    } else {
      current = undefined;
    }
  }
  return rows;
}

/** Bullets opening at column 0 in a chunk of markdown — every one must be a check row. */
function bulletCount(text: string): number {
  return text.split("\n").filter((line) => line.startsWith("- ")).length;
}

/** Every file this unit owns — the register gates run over all of them. */
const OWNED_FILES: readonly string[] = [SKILL_PATH, ...OWNED_AXES.map(referencePath)];

/** Every shipped skill id, so the projection case runs over the whole tree. */
const PROJECTED_SKILL_IDS: readonly string[] = [
  "browser-evidence",
  "dep-audit",
  "design-system-detect",
  "handoff",
  "learn",
  "onboard",
  "qa",
  "verify",
];

describe("verify skill — frontmatter contract", () => {
  it("declares the skill identity head, on-demand load class, and deletion trigger", async () => {
    const file = await load(SKILL_PATH);
    const field = (name: string): unknown => frontmatterField(file.parsed, name);

    expect(field("id")).toBe("verify");
    expect(field("id")).toBe(filenameSlug(SKILL_PATH));
    expect(field("type")).toBe("skill");
    expect(field("tags")).toEqual(["review"]);

    const description = field("description");
    expect(description).toBeTypeOf("string");
    expect(description as string).not.toBe("");
    expect((description as string).length).toBeLessThanOrEqual(1024);
    expect(description as string).not.toMatch(/\byou(?:r|rs|rself)?\b/i);
    // The description is the trigger surface: it names the axes and the artifact.
    expect(description as string).toContain(ARTIFACT_DIR);
    for (const axis of ALL_AXES) {
      expect(description as string, `axis ${axis} is not in the trigger surface`).toContain(axis);
    }

    expect(() => requireLoadClass(file, ["on-demand"])).not.toThrow();
    expect(() => requireObsoleteWhen(file)).not.toThrow();
    // Engine-reserved key: absent means the artifact ships to every target tool.
    expect(extractToolsFrontmatter(file.raw, SKILL_PATH)).toBeUndefined();
  });

  it("keeps the dispatch body inside the physical-line cap", async () => {
    const file = await load(SKILL_PATH);

    expect(file.raw.split("\n").length).toBeLessThanOrEqual(SKILL_MAX_LINES);
    expect(() => assertLineCap(file, SKILL_MAX_LINES)).not.toThrow();
  });
});

describe("verify skill — axis dispatch", () => {
  it("offers exactly ten axis rows, each naming its reference", async () => {
    const rows = tableRows(section(await load(SKILL_PATH), "Axis dispatch"));

    // Header + separator + one row per axis, and nothing else.
    const [header, separator, ...axisRows] = rows;
    expect(header?.[0]).toBe("Axis");
    expect(separator?.[0]).toMatch(/^-+$/);
    expect(axisRows).toHaveLength(ALL_AXES.length);
    expect(axisRows.map((row) => row[0])).toEqual([...ALL_AXES]);
    for (const row of axisRows) {
      expect(row[1]).toBe(`\`references/${row[0]}.md\``);
    }
  });

  it("gates every reference read on the axis that needs it", async () => {
    const rows = tableRows(section(await load(SKILL_PATH), "Axis dispatch")).slice(2);

    for (const row of rows) {
      // The gated-read clause is the whole point of the table: an ungated
      // reference read is the skill's largest token sink.
      expect(row[2], `row ${row[0]} carries no read gate`).toContain(`when axis=${row[0]}`);
    }
    expect(prose(await load(SKILL_PATH))).toMatch(/Ungated reference reads[^.]*token sink/i);
  });

  it("declares a reference non-standalone, so a direct open carries no contract", async () => {
    const text = prose(await load(SKILL_PATH));

    expect(text).toContain("A reference is not standalone");
    expect(text).toContain("load: reference");
    expect(text).toMatch(/no run contract, no artifact schema, and no status vocabulary/i);
  });
});

describe("verify skill — run contract", () => {
  it("runs detect, run, judge, write in order", async () => {
    const steps = section(await load(SKILL_PATH), "Run contract");

    const ordered = [...steps.matchAll(/^\d+\.\s+\*\*([A-Za-z ]+?)\.?\*\*/gm)].map(
      (match) => match[1],
    );
    expect(ordered).toEqual(["Detect", "Run", "Judge", "Write ONE artifact"]);
  });

  it("binds detection to repo facts and keeps a toolless check from passing the axis", async () => {
    const text = prose(await load(SKILL_PATH));

    expect(text).toMatch(/An assumption about the stack is not a detection fact/i);
    expect(text).toMatch(/`skipped` with the probe recorded/i);
    expect(text).toMatch(/never promotes the axis to pass/i);
    // A judgment with no evidence is not a verdict.
    expect(text).toMatch(/A judgment with no evidence is not a verdict/i);
  });
});

describe("verify skill — artifact seam", () => {
  it("states the neutral artifact family as one verbatim path family", async () => {
    const file = await load(SKILL_PATH);
    const body = file.parsed.body;

    expect(body).toContain(`${ARTIFACT_DIR}<axis>-<sha>.json`);
    // Strengthened over asserting the literal is merely present: the seam is ONE
    // directory family, not a set of near-neighbours. Every `.stamity/` path in
    // the body must resolve under it, so a consumer globbing the family finds
    // every artifact this skill writes and no sibling directory drifts in.
    const families = [...body.matchAll(/\.stamity\/[a-z-]+\//g)].map((match) => match[0]);
    expect(families.length).toBeGreaterThan(0);
    expect(new Set(families)).toEqual(new Set([ARTIFACT_DIR]));
    // The seam is the consumer contract, so it is stated as a path, not prose.
    expect(prose(file)).toMatch(/The path is the seam/i);
  });

  it("lists every artifact field with its status and kind vocabulary", async () => {
    const file = await load(SKILL_PATH);
    const artifact = section(file, "Artifact");
    const fields = tableRows(artifact)
      .slice(2)
      .map((row) => row[0]);

    expect(fields).toEqual(["`axis`", "`sha`", "`timestamp`", "`checks[]`", "`summary`"]);
    // Row shape and the two closed vocabularies.
    for (const part of ["`id`", "`kind`", "`status`", "`evidence`"]) {
      expect(artifact, `checks[] row lacks ${part}`).toContain(part);
    }
    for (const status of STATUSES) {
      expect(artifact, `status ${status} is missing`).toContain(`\`${status}\``);
    }
    for (const kind of KINDS) {
      expect(artifact, `kind ${kind} is missing`).toContain(`\`${kind}\``);
    }
    expect(artifact).toMatch(/Never empty/);
  });

  it("names the four consumers that bind to the path", async () => {
    const file = await load(SKILL_PATH);
    const consumers = prose(file);

    // Roster changed with the body: the middle row used to name work's Prove as
    // gating on `fail` rows and carrying `skipped` counts into the proof block —
    // a wiring no touchpoint implements. Work's Prove gates on its test-runner
    // result; an artifact reaches a run through the qa skill's auto-prove pass at
    // the QA checkpoint. The old claim is asserted ABSENT so the copy, which came
    // from a consumer list written before the Prove contract settled, cannot
    // return by paste.
    expect(consumers).toMatch(/Reviewer and specialist rubrics/i);
    expect(consumers).toMatch(/qa skill's auto-prove pass/i);
    expect(consumers).toMatch(/Manual invocation/i);
    expect(consumers).not.toMatch(/\bProve\b/);
    // Fourth row, and the reason the count moved from 3: the roster was drawn from a
    // `content/`-scoped grep, so the pack consumers of the same path were invisible to
    // it. `grep -rn "\.stamity/verify" packs/` reaches both — the product-audit pack
    // (`commands/stamity-product-audit.md`, `commands/stamity-benchmark.md`,
    // `skills/stamity-perf-audit/SKILL.md`) and the scaffold pack
    // (`commands/stamity-{auth-scaffold,design-system-create,slo-scaffold}.md`), each
    // declaring `.stamity/verify/**` in its `pack.json` touchedPaths. Both names are
    // asserted so a `checks[]` / `summary` schema change meets its full consumer set
    // here rather than in an installed repo.
    expect(consumers).toMatch(/product-audit pack/i);
    expect(consumers).toMatch(/scaffold pack/i);
    // The seam's read protocol, shared by both packs: a missing artifact sends them
    // back to this skill; it never reads as a passing axis.
    expect(consumers).toMatch(/refresh\s*trigger, not a pass/i);
    expect([...section(file, "Consumers").matchAll(/^- \*\*/gm)]).toHaveLength(4);
    // An artifact is a record, not a gate: the consumer decides what a row costs.
    expect(consumers).toMatch(/No consumer treats an artifact as a gate of its own/i);
    expect(consumers).toMatch(/coupled to wording/i);
  });

  it("names the reference seam beside the artifact seam, since one consumer uses only it", async () => {
    const file = await load(SKILL_PATH);
    const consumers = prose(file);

    // `grep -rn "\.stamity/verify" content/agents/` returns nothing: the
    // reviewer and the three specialists load `references/<axis>.md` and cite
    // rows by check id. Claiming they bind to artifact FIELDS described a
    // wiring no agent has, so the read they actually perform is named.
    expect(consumers).toMatch(/reference seam/i);
    expect(consumers).toMatch(/open one axis reference for its criteria/i);
    expect(consumers).toMatch(/with no artifact involved/i);
    expect(consumers).toMatch(/\*\*Reviewer and specialist rubrics\*\* — the reference seam/);
  });

  it("qualifies the pack refresh claim to the packs whose own steps run this skill", async () => {
    const consumers = prose(await load(SKILL_PATH));

    // "Both run this skill when the current sha has no artifact" was false for
    // one of the named readers, which never refreshes. The refresh rule now
    // binds the packs that name this skill, and the no-pass rule binds both.
    expect(consumers).not.toMatch(/Both run this skill for the axis/i);
    expect(consumers).toMatch(/A pack whose own steps name this skill runs it for the axis/i);
    expect(consumers).toMatch(/refresh\s*trigger, not a pass/i);
    expect(consumers).toMatch(/reads without refreshing reports the artifact as absent/i);
    expect(consumers).toMatch(/On neither route does a missing artifact read as a pass/i);
  });
});

describe("verify skill — emission", () => {
  it("emits no unresolved substitution token in any projected skill file", async () => {
    // The two halves of the projection contract, checked over the real corpus:
    // a `SKILL.md` body takes token substitution, and everything else in a
    // skill directory is copied byte-verbatim. So a token authored in a
    // `references/` file is never resolved — it reaches the agent as the
    // literal string, and the axis reads as an instruction to execute it.
    const rows = await projectSkills({
      manifest: createManifest({
        tools: ["claude"],
        selection: { items: { agent: [], skill: [...PROJECTED_SKILL_IDS], rule: [], command: [] } },
        generatorVersion: "0.0.0-test",
        now: new Date("2026-08-13T12:00:00.000Z"),
      }),
      engineVersion: "0.0.0-test",
    });

    // Non-degenerate: every shipped skill, and the verify references among them.
    expect(rows.length).toBeGreaterThan(PROJECTED_SKILL_IDS.length);
    expect(rows.map((row) => row.path)).toContain(
      ".agents/skills/st-verify/references/testability.md",
    );

    const leaking = rows.filter((row) => row.content.includes("${STAMITY:")).map((row) => row.path);
    expect(leaking).toEqual([]);
  });
});

describe("verify skill — edge cases the design names", () => {
  it("writes the artifact even when no check applies — absence is a recorded verdict", async () => {
    const text = prose(await load(SKILL_PATH));

    expect(text).toMatch(/Absence of applicable checks is itself a verdict/i);
    expect(text).toMatch(/still writes the artifact, every row `not-applicable`/i);
    // The named worked example: an axis with no subject in this repo.
    expect(text).toMatch(/ui axis against a repo with no user surface is a recorded outcome/i);
  });

  it("reports an unrunnable check instead of dropping it", async () => {
    const text = prose(await load(SKILL_PATH));

    expect(text).toMatch(/Every check in the axis reference appears in `checks\[\]` on every run/i);
    expect(text).toMatch(/dropping the row would report a clean axis that was never examined/i);
  });

  it("is idempotent on a re-run: the same axis and sha overwrite the same path", async () => {
    const text = prose(await load(SKILL_PATH));

    expect(text).toMatch(/Re-running an axis on the same sha overwrites the same path/i);
    expect(text).toMatch(/The key is `<axis>-<sha>`/);
    expect(text).toMatch(/replaces its predecessor/i);
    expect(text).toMatch(/a new commit is a new artifact/i);
  });

  it("suffixes a dirty worktree in the artifact key, in the schema section", async () => {
    const artifact = section(await load(SKILL_PATH), "Artifact");

    expect(artifact).toContain("-dirty");
    expect(artifact).toContain(`${ARTIFACT_DIR}security-a1b2c3d-dirty.json`);
    expect(artifact.replace(/\s+/g, " ")).toMatch(
      /short HEAD sha, `-dirty` suffixed on an unclean worktree/i,
    );
    // A working-tree result must not read as a committed one.
    expect(prose(await load(SKILL_PATH))).toMatch(/never read as a committed one/i);
  });
});

describe("verify skill — axis references", () => {
  it.each([...OWNED_AXES])("%s declares the reference identity head", async (axis) => {
    const relPath = referencePath(axis);
    const file = await load(relPath);
    const field = (name: string): unknown => frontmatterField(file.parsed, name);

    // Ids are bare slugs that agree with their file — the corpus-wide contract.
    expect(field("id")).toBe(axis);
    expect(field("id")).toBe(filenameSlug(relPath));
    expect(field("type")).toBe("skill");
    expect(field("tags")).toEqual(["review"]);
    expect(field("description")).toBeTypeOf("string");
    expect(field("description") as string).not.toMatch(/\byou(?:r|rs|rself)?\b/i);
    // `load: reference` is what marks a directly-opened file non-standalone.
    expect(() => requireLoadClass(file, ["reference"])).not.toThrow();
    expect(() => requireObsoleteWhen(file)).not.toThrow();
  });

  it("gives the five references distinct ids", async () => {
    const ids = await Promise.all(
      OWNED_AXES.map(async (axis) => frontmatterField((await load(referencePath(axis))).parsed, "id")),
    );

    expect(new Set(ids).size).toBe(OWNED_AXES.length);
    expect(ids).toEqual([...OWNED_AXES]);
  });

  it.each([...OWNED_AXES])("%s stays inside the reference line band", async (axis) => {
    const file = await load(referencePath(axis));
    const lines = bodyLines(file);

    expect(lines).toBeGreaterThanOrEqual(REFERENCE_MIN_LINES);
    expect(lines).toBeLessThanOrEqual(REFERENCE_MAX_LINES);
    expect(() => assertLineCap(file, REFERENCE_MAX_LINES)).not.toThrow();
  });

  it.each([...OWNED_AXES])("%s carries the runnable/judgment skeleton", async (axis) => {
    const file = await load(referencePath(axis));
    const headings = [...file.parsed.body.matchAll(/^#{1,2} .+$/gm)].map((match) => match[0].trim());

    expect(headings[0]?.toLowerCase()).toBe(`# ${axis} axis`.toLowerCase());
    expect(headings).toContain("## Runnable checks");
    expect(headings).toContain("## Judgment checks");
    expect(headings.indexOf("## Runnable checks")).toBeLessThan(
      headings.indexOf("## Judgment checks"),
    );
  });

  it.each([...OWNED_AXES])("%s gives every check row an axis-namespaced id", async (axis) => {
    const file = await load(referencePath(axis));
    const runnable = checkRows(section(file, "Runnable checks"));
    const judgment = checkRows(section(file, "Judgment checks"));
    const ids = [...runnable, ...judgment].map((row) => row.id);

    expect(runnable.length).toBeGreaterThanOrEqual(4);
    expect(judgment.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ids).size, `duplicate check id in ${axis}`).toBe(ids.length);
    for (const id of ids) {
      expect(id, `check id ${id} is not namespaced`).toMatch(
        new RegExp(`^${CHECK_PREFIX[axis]}[a-z0-9-]+$`),
      );
    }
    // Every bullet under a check section IS a check: no unlabelled prose rows.
    expect(bulletCount(section(file, "Runnable checks"))).toBe(runnable.length);
    expect(bulletCount(section(file, "Judgment checks"))).toBe(judgment.length);
  });

  it.each([...OWNED_AXES])("%s states how and to what threshold each runnable check runs", async (axis) => {
    const file = await load(referencePath(axis));

    for (const row of checkRows(section(file, "Runnable checks"))) {
      expect(row.text, `${row.id} states no method`).toMatch(/How:/);
      expect(row.text, `${row.id} states no threshold`).toMatch(/Threshold:/);
    }
    // Judgment rows are criteria, not commands: no threshold to meet.
    for (const row of checkRows(section(file, "Judgment checks"))) {
      expect(row.text, `${row.id} is a runnable check in the judgment section`).not.toMatch(
        /Threshold:/,
      );
    }
  });

  it.each([...OWNED_AXES])("%s keeps a non-pass status available for an inapplicable check", async (axis) => {
    const body = (await load(referencePath(axis))).parsed.body;

    // Every axis can meet a stack it does not fit; each states its fallback.
    expect(body).toMatch(/`(?:skipped|not-applicable|judgment)`/);
  });

  it.each([...OWNED_AXES])("%s carries the checks and design decisions it was authored for", async (axis) => {
    const file = await load(referencePath(axis));
    const ids = new Set(
      [
        ...checkRows(section(file, "Runnable checks")),
        ...checkRows(section(file, "Judgment checks")),
      ].map((row) => row.id),
    );
    const contract = AXIS_CONTRACT[axis];

    for (const id of contract.ids) {
      expect([...ids], `${axis} is missing check ${id}`).toContain(id);
    }
    for (const phrase of contract.phrases) {
      expect(prose(file), `${axis} does not state ${String(phrase)}`).toMatch(phrase);
    }
  });

  it("publishes the six SLO objective-shape rows as runnable reliability checks", async () => {
    const file = await load(referencePath("reliability"));
    const runnable = checkRows(section(file, "Runnable checks"));
    const byId = new Map(runnable.map((row) => [row.id, row.text]));

    for (const id of SLO_OBJECTIVE_IDS) {
      const text = byId.get(id);
      // Runnable, not judgment: the pack grades generated output against these,
      // so each has to state a method and a threshold a run can apply.
      expect(text, `${id} is not a runnable reliability check`).toBeDefined();
      expect(text, `${id} states no method`).toMatch(/How:/);
      expect(text, `${id} states no threshold`).toMatch(/Threshold:/);
    }

    // The shape the pack's gate rows read: an indicator that is a ratio, a
    // derived budget, paired burn-rate windows, and a runbook per rule.
    const text = prose(file);
    expect(text).toMatch(/ratio of good events to valid events, not a mean/i);
    expect(text).toMatch(/recompute the allowed unavailability from the target/i);
    expect(text).toMatch(/pairs a long and a short window/i);
    expect(text).toMatch(/owner and runbook present per objective/i);
    // A repo with no objectives is a recorded outcome, not a silent pass.
    expect(text).toMatch(/declares no objectives records them `not-applicable`/i);
  });

  it("keeps the testability axis free of substitution tokens the projection never resolves", async () => {
    const file = await load(referencePath("testability"));

    // `references/` is projected byte-verbatim by design, so a token authored
    // here reaches the agent as the literal string `${STAMITY:…}` and the axis
    // instructs it to execute one. The gate itself survives as prose.
    expect(file.raw).not.toContain("${STAMITY:");
    expect(prose(file)).toMatch(/the full verification gate the charter's repo facts declare/i);
    expect(prose(file)).toMatch(/its lint, typecheck and test commands chained/i);
    expect(prose(file)).toMatch(/the test framework the charter's repo facts name/i);
  });

  it("keeps a threshold-source-absent row inside the closed status vocabulary", async () => {
    const file = await load(referencePath("testability"));
    const text = prose(file);

    // `kind` is fixed by section and `status` has no `judgment` member, so
    // "mark the row judgment" is a disposition no run can write. The absent
    // threshold source is a detection fact, which makes the row not-applicable.
    expect(text).toMatch(/the row is `not-applicable`/i);
    expect(text).toMatch(/`status` holds no `judgment` member/i);
    expect(text).toMatch(/record the row `not-applicable`, citing the absent coverage/i);
    for (const row of checkRows(section(file, "Runnable checks"))) {
      expect(row.text, `${row.id} marks a row judgment at run time`).not.toMatch(
        /mark the row `judgment`/i,
      );
    }
  });

  it("keeps the security axis at pattern-category level, with mapped ids and no payloads", async () => {
    const file = await load(referencePath("security"));
    const body = file.parsed.body;

    // OWASP ids are the shared label; the repo evidence is the finding.
    expect(prose(file)).toMatch(/OWASP category ids as shared vocabulary/i);
    expect(body).toMatch(/`A01`[–-]`A10`/);
    expect(body).toMatch(/`ASI01`[–-]`ASI10`/);
    expect(prose(file)).toMatch(/name pattern \*categories\*, never payload strings/i);
    // The full injection set, not only the write-path block set: a reference
    // read into agent context is exactly the surface those patterns describe.
    const hits = scanForDeniedPatterns(body, [
      ...CONTENT_DENY_PATTERNS,
      ...INJECTION_PATTERNS,
    ]).filter((hit) => hit.severity === "block");
    expect(hits).toEqual([]);
  });

  it("pins the web-surface id edition and maps each row to its current category", async () => {
    const file = await load(referencePath("security"));
    const runnable = checkRows(section(file, "Runnable checks"));
    const category = new Map(
      runnable.map((row) => [row.id, /\(([A-Z]+\d\d)\)/.exec(row.text)?.[1] ?? ""]),
    );

    // Unversioned `A0x` ids are one edition's numbering wearing another's
    // label: four rows carried 2021 ids, two of them colliding with an
    // unrelated current category. The edition is named so the mapping is
    // checkable rather than assumed.
    expect(file.parsed.body).toContain("OWASP Top 10:2025");
    expect(category.get("sec-dep-advisories")).toBe("A03");
    expect(category.get("sec-input-validation")).toBe("A05");
    expect(category.get("sec-injection-sinks")).toBe("A05");
    expect(category.get("sec-transport-headers")).toBe("A02");
    // The agentic ids stay unversioned — ASI01-ASI10 has one edition.
    expect(prose(file)).toMatch(/`ASI01`[–-]`ASI10` for the agentic surface/);
  });

  it("defines the secret-scan allowlist it sends an adjudicated false positive to", async () => {
    const file = await load(referencePath("security"));
    const text = prose(file);

    // The row used to send the operator to "the repo's allow list", a file no
    // artifact defined, so every false positive was re-adjudicated per run.
    expect(text).not.toMatch(/the repo's allow list/i);
    expect(text).toMatch(/recorded in the secret-scan allowlist below/i);
    // Path, row format, and writer — the three facts that make it usable.
    expect(file.parsed.body).toContain(".stamity/security/secret-scan-allowlist.md");
    expect(text).toMatch(/\*\*Row\*\* — one per adjudicated hit: `file:line`/);
    expect(text).toMatch(/\*\*Writer\*\* — the operator/i);
    expect(text).toMatch(/this axis proposes rows and writes none/i);
    // A covered hit is not-applicable; an uncovered one stays a fail.
    expect(text).toMatch(/reports a matched hit as `not-applicable` citing the row/i);
    expect(text).toMatch(/leaves a hit with no row a `fail`/i);
  });
});

describe("verify skill — register and gates", () => {
  it.each([...OWNED_FILES])("%s passes the deny scan and the anti-slop scan", async (relPath) => {
    const file = await load(relPath);

    expect(() => assertDenyClean(file)).not.toThrow();
    expect(scanAntiSlop(file.parsed.body)).toEqual([]);
  });

  it.each([...OWNED_FILES])("%s mints no product URL and names no vendor or model", async (relPath) => {
    const body = (await load(relPath)).parsed.body;

    expect(body).not.toMatch(URL_OR_DOMAIN);
    expect(body).not.toMatch(VENDOR_OR_MODEL_NAMES);
  });

  it.each([...OWNED_FILES])("%s uses only wired substitution tokens", async (relPath) => {
    const body = (await load(relPath)).parsed.body;

    const tokens = [...body.matchAll(/\$\{STAMITY:[A-Z_]+\}/g)].map((match) => match[0]);
    for (const token of tokens) {
      expect(REPO_SUBSTITUTION_TOKENS).toContain(token);
    }
    // No malformed token survives: every opener is a well-formed match.
    expect(body.split("${STAMITY:").length - 1).toBe(tokens.length);
  });

  it.each([...OWNED_FILES])("%s references only touchpoints that exist", async (relPath) => {
    const body = (await load(relPath)).parsed.body;

    for (const match of body.matchAll(/\/st-([a-z-]+[a-z])/g)) {
      expect(COMMAND_CENSUS, `/st-${match[1]} is not a touchpoint`).toContain(match[1]);
    }
  });
});
