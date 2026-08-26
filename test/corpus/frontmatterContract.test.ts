import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractToolsFrontmatter, frontmatterField } from "../../src/content/frontmatter.ts";
import { useTempDir } from "../support/tempDir.ts";
import {
  LOAD_CLASSES,
  corpusFileOf,
  filenameSlug,
  requireLoadClass,
  requireObsoleteWhen,
  walkAllMarkdown,
  type CorpusFile,
} from "./harness.ts";

/**
 * The frontmatter contract, data-driven over whatever exists on disk: every
 * `.md` under `content/` that declares frontmatter carries the identity head
 * below, and a file that declares none (a README) is not an artifact and not a
 * failure. Shape binds per-file — roster completeness and class-level rules
 * (line caps, per-class load policy) are the corpus-invariant suite's job — so
 * the suite is green on a partial corpus and grows its coverage as waves land.
 */

/** The closed artifact-type vocabulary across the shipped classes. */
const ARTIFACT_TYPES: readonly string[] = ["charter", "command", "agent", "skill", "rule"];

/** Cap on `description` length, in string characters. */
const DESCRIPTION_MAX = 1024;

/**
 * Mechanical proxy for the third-person register: a description that addresses
 * the reader is second person by construction. Third-person phrasing cannot be
 * fully machine-judged; this catches the failure shape that actually occurs.
 */
const SECOND_PERSON = /\b(?:you|your|yours|yourself)\b/i;

/**
 * A skill entry point: `skills/<dir>/SKILL.md`. Its `description` is the only
 * byte of the skill a client always holds, so it is the activation surface and
 * carries the whole trigger claim. `references/` files under the same directory
 * are progressive-disclosure material behind a dispatch table, never matched
 * against a task, so the trigger rules below bind entry points only.
 */
const SKILL_ENTRY_POINT = /^skills\/[^/]+\/SKILL\.md$/;

/**
 * Third-person opener: a description states what the skill DOES, so it starts
 * on a present-tense third-person verb ("Runs", "Detects", "Carries"). An
 * imperative opener ("Run", "Detect") addresses the reader, and a noun-phrase
 * opener ("Standalone dependency audit") states no action at all.
 */
const THIRD_PERSON_OPENER = /^[A-Z][a-z]+s\b/;

/** The trigger clause: the sentence that names WHEN the skill fires. */
const TRIGGER_CLAUSE = /\bTriggers\b/;

/**
 * Whether a description carries a trigger clause with at least one condition.
 * "Triggers when …", "Triggers at … or when …", "Triggers after …, when …" all
 * qualify; a bare "Triggers." names no condition and does not.
 */
function hasWhenClause(description: string): boolean {
  const start = description.search(TRIGGER_CLAUSE);
  return start !== -1 && /\bwhen\b/i.test(description.slice(start));
}

/**
 * Every contract violation in one file, each message leading with the file's
 * corpus-relative path. Collected rather than thrown so the suite reports the
 * whole corpus in one pass, and reused verbatim by the defect fixtures below.
 */
function contractViolations(file: CorpusFile): string[] {
  const problems: string[] = [];
  const flag = (message: string): void => {
    problems.push(`${file.relPath}: ${message}`);
  };
  const collect = (check: () => void): void => {
    try {
      check();
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  };
  const field = (name: string): unknown => frontmatterField(file.parsed, name);

  const id = field("id");
  const implied = filenameSlug(file.relPath);
  if (typeof id !== "string" || id.trim() === "") {
    flag("`id` must be a non-empty string");
  } else if (id !== implied) {
    flag(
      `\`id\` is ${JSON.stringify(id)} but the filename implies ${JSON.stringify(implied)} — ` +
        `ids are bare slugs that agree with their file`,
    );
  }

  const type = field("type");
  if (typeof type !== "string" || !ARTIFACT_TYPES.includes(type)) {
    flag(`\`type\` must be one of: ${ARTIFACT_TYPES.join(", ")}`);
  }

  const description = field("description");
  if (typeof description !== "string" || description.trim() === "") {
    flag("`description` must be a non-empty string");
  } else {
    if (description.length > DESCRIPTION_MAX) {
      flag(`\`description\` is ${description.length} chars, over the ${DESCRIPTION_MAX} cap`);
    }
    if (SECOND_PERSON.test(description)) {
      flag("`description` addresses the reader — write it in the third person");
    }
    if (SKILL_ENTRY_POINT.test(file.relPath)) {
      if (!THIRD_PERSON_OPENER.test(description.trim())) {
        flag(
          "`description` must open on a third-person verb (\"Runs\", \"Detects\") — " +
            "an imperative or noun-phrase opener states no action",
        );
      }
      if (!hasWhenClause(description)) {
        flag(
          "`description` carries no trigger clause — a skill fires on its description, " +
            'so it states when: "… Triggers when <condition>."',
        );
      }
    }
  }

  const tags = field("tags");
  const isTagList =
    Array.isArray(tags) &&
    tags.length > 0 &&
    tags.every((tag) => typeof tag === "string" && tag.trim() !== "");
  if (!isTagList) {
    flag("`tags` must be a non-empty array of non-empty strings, capability primary first");
  }

  // Shape-only here: which classes are allowed per artifact class is the
  // corpus-invariant suite's policy. The harness helpers already lead their
  // messages with the file path, so they collect verbatim.
  collect(() => requireLoadClass(file, LOAD_CLASSES));
  collect(() => requireObsoleteWhen(file));

  // Engine-reserved key: `tools:` is the target-tool restriction with a closed
  // vocabulary; the engine's own validator rejects anything else, and its
  // message names the file.
  collect(() => extractToolsFrontmatter(file.raw, file.relPath));

  return problems;
}

/** Contract violations across a walked corpus; files without frontmatter are skipped by design. */
async function corpusViolations(root?: string): Promise<string[]> {
  const files = await walkAllMarkdown(root);
  return files.filter((file) => file.parsed.hadFrontmatter).flatMap(contractViolations);
}

const tempDir = useTempDir("frontmatter-contract");

const lines = (...rows: string[]): string => rows.join("\n");

/** A fully-valid artifact body for fixtures; one defect per defective fixture. */
const valid = {
  charter: lines(
    "---",
    "id: charter",
    "type: charter",
    "description: Anchors repo facts, floor invariants, and the touchpoint index in one always-on file.",
    "tags: [charter]",
    "load: always",
    "obsolete_when: every target platform ships a native always-on repo-context standard.",
    "---",
    "# Charter",
    "",
    "Repo facts land here.",
    "",
  ),
  // The description carries a trigger clause because a SKILL.md is an
  // activation surface: the entry-point rules added with the trigger-form
  // contract bind every `skills/<dir>/SKILL.md`, this fixture included.
  skill: lines(
    "---",
    "id: verify",
    "type: skill",
    "description: Runs the verification axes and reports findings per axis. Triggers when a change needs one axis graded before review.",
    "tags: [review]",
    "load: on-demand",
    "obsolete_when: platforms run verification natively.",
    "---",
    "Procedure.",
    "",
  ),
  reference: lines(
    "---",
    "id: axis-security",
    "type: skill",
    "description: Carries the security axis criteria for the verify skill.",
    "tags: [review]",
    "load: reference",
    "obsolete_when: the security axis merges into the reviewer gate.",
    "---",
    "Criteria.",
    "",
  ),
  rule: lines(
    "---",
    "id: scope",
    "type: rule",
    "description: Bounds the change surface a unit may touch.",
    "tags: [review]",
    "load: on-demand",
    "obsolete_when: models bound change surfaces unprompted.",
    "---",
    "Rule body.",
    "",
  ),
  agent: lines(
    "---",
    "id: planner",
    "type: agent",
    "description: Plans the work into reviewable units.",
    "tags: [planning]",
    "load: on-demand",
    "obsolete_when: models plan multi-unit work unprompted at parity.",
    "---",
    "Role.",
    "",
  ),
  command: lines(
    "---",
    "id: work",
    "type: command",
    "description: Drives a unit of work through implementation and review.",
    "tags: [orchestration]",
    "load: on-demand",
    "obsolete_when: platforms ship a native work loop with review gates.",
    "---",
    "Flow.",
    "",
  ),
};

describe("frontmatter contract — shipped corpus", () => {
  it("every frontmatter-declaring file under content/ satisfies the contract", async () => {
    // Data-driven over the real corpus: an early tree may hold nothing or only the
    // charter, and later waves grow coverage without touching this suite.
    expect(await corpusViolations()).toEqual([]);
  });
});

describe("frontmatter contract — partial-corpus posture", () => {
  it("passes on a charter-only corpus (the wave-0 shape)", async () => {
    const t = tempDir();
    await t.seedFiles({ "charter/stamity-charter.md": valid.charter });

    const files = await walkAllMarkdown(t.dir);

    expect(files).toHaveLength(1);
    expect(await corpusViolations(t.dir)).toEqual([]);
  });

  it("treats an absent corpus root as zero artifacts, zero violations", async () => {
    const t = tempDir();

    expect(await corpusViolations(join(t.dir, "content"))).toEqual([]);
  });

  it("skips a README without frontmatter — not an artifact, not a failure", async () => {
    const t = tempDir();
    await t.seedFiles({
      "agents/README.md": "How the agents fit together.\n",
      "agents/stamity-planner.md": valid.agent,
    });

    const files = await walkAllMarkdown(t.dir);

    expect(files.map((file) => file.relPath)).toContain("agents/README.md");
    expect(files.filter((file) => file.parsed.hadFrontmatter)).toHaveLength(1);
    expect(await corpusViolations(t.dir)).toEqual([]);
  });
});

describe("frontmatter contract — defect detection", () => {
  it("flags missing obsolete_when, out-of-enum load, id/filename disagreement, and an empty description", async () => {
    const t = tempDir();
    // One defect per file, otherwise valid — so the violation count is exact.
    await t.seedFiles({
      "agents/stamity-planner.md": valid.agent.replace(
        "obsolete_when: models plan multi-unit work unprompted at parity.\n",
        "",
      ),
      "rules/stamity-scope.md": valid.rule.replace("load: on-demand", "load: sometimes"),
      "commands/stamity-ship.md": valid.command.replace("id: work", "id: deploy"),
      "skills/stamity-lint/SKILL.md": lines(
        "---",
        "id: lint",
        "type: skill",
        'description: ""',
        "tags: [maintenance]",
        "load: on-demand",
        "obsolete_when: linting folds into the review gate.",
        "---",
        "Procedure.",
        "",
      ),
    });

    const violations = await corpusViolations(t.dir);

    expect(violations).toHaveLength(4);
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/agents\/stamity-planner\.md: `obsolete_when` must be a non-empty/),
        expect.stringMatching(/rules\/stamity-scope\.md: `load` is "sometimes"/),
        expect.stringMatching(/commands\/stamity-ship\.md: `id` is "deploy" but the filename implies "ship"/),
        expect.stringMatching(/skills\/stamity-lint\/SKILL\.md: `description` must be a non-empty/),
      ]),
    );
  });

  it("accepts a fully-valid artifact of every class shape, id derived per layout", () => {
    const files = [
      corpusFileOf("charter/stamity-charter.md", valid.charter),
      corpusFileOf("skills/stamity-verify/SKILL.md", valid.skill),
      corpusFileOf("skills/stamity-verify/references/axis-security.md", valid.reference),
      corpusFileOf("rules/stamity-scope.md", valid.rule),
      corpusFileOf("agents/stamity-planner.md", valid.agent),
      corpusFileOf("commands/stamity-work.md", valid.command),
    ];

    expect(files.flatMap(contractViolations)).toEqual([]);
  });

  it.each([
    [
      "a missing id",
      valid.rule.replace("id: scope\n", ""),
      /`id` must be a non-empty string/,
    ],
    [
      "a type outside the vocabulary",
      valid.rule.replace("type: rule", "type: mode"),
      /`type` must be one of: charter, command, agent, skill, rule/,
    ],
    [
      "a missing type",
      valid.rule.replace("type: rule\n", ""),
      /`type` must be one of/,
    ],
    [
      "an over-length description",
      valid.rule.replace(
        "description: Bounds the change surface a unit may touch.",
        `description: ${"x".repeat(DESCRIPTION_MAX + 1)}`,
      ),
      /`description` is 1025 chars, over the 1024 cap/,
    ],
    [
      "a second-person description",
      valid.rule.replace(
        "description: Bounds the change surface a unit may touch.",
        "description: Bounds the change surface you may touch.",
      ),
      /write it in the third person/,
    ],
    [
      "empty tags",
      valid.rule.replace("tags: [review]", "tags: []"),
      /`tags` must be a non-empty array/,
    ],
    [
      "tags that are not a list",
      valid.rule.replace("tags: [review]", "tags: review"),
      /`tags` must be a non-empty array/,
    ],
    [
      "a missing load class",
      valid.rule.replace("load: on-demand\n", ""),
      /`load` must be declared/,
    ],
    [
      "a whitespace-only obsolete_when",
      valid.rule.replace(
        "obsolete_when: models bound change surfaces unprompted.",
        'obsolete_when: "   "',
      ),
      /`obsolete_when` must be a non-empty string/,
    ],
  ])("flags %s", (_defect, raw, expected) => {
    const violations = contractViolations(corpusFileOf("rules/stamity-scope.md", raw));

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(expected);
    expect(violations[0]).toContain("rules/stamity-scope.md");
  });

  it.each([
    [
      "an imperative opener on a skill entry point",
      "Run one content-quality axis as a gate. Triggers when a review needs axis evidence.",
      /must open on a third-person verb/,
    ],
    [
      "a noun-phrase opener on a skill entry point",
      "Standalone dependency audit: advisories and licenses. Triggers when a release needs one.",
      /must open on a third-person verb/,
    ],
    [
      "a skill entry point with no trigger clause",
      "Detects the design system a repo already has and writes the inventory.",
      /carries no trigger clause/,
    ],
    [
      "a trigger clause naming no condition",
      "Detects the design system a repo already has. Triggers.",
      /carries no trigger clause/,
    ],
  ])("flags %s", (_defect, description, expected) => {
    const violations = contractViolations(
      corpusFileOf(
        "skills/stamity-verify/SKILL.md",
        // Quoted: these fixtures carry colons, which YAML would otherwise read
        // as a nested mapping before the contract ever sees the string.
        valid.skill.replace(/^description: .*$/m, `description: ${JSON.stringify(description)}`),
      ),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(expected);
    expect(violations[0]).toContain("skills/stamity-verify/SKILL.md");
  });

  it("holds a reference file to the shared contract but not to the trigger form", () => {
    // `references/*.md` sit behind the verify skill's dispatch table: no client
    // ever matches a task against them, so an imperative, clause-free
    // description is correct there and a failure here would be a false one.
    const reference = corpusFileOf(
      "skills/stamity-verify/references/axis-security.md",
      valid.reference,
    );

    expect(String(frontmatterField(reference.parsed, "description"))).not.toMatch(TRIGGER_CLAUSE);
    expect(contractViolations(reference)).toEqual([]);
  });

  it("accepts every shipped core skill's description as a trigger surface", async () => {
    const entryPoints = (await walkAllMarkdown()).filter((file) =>
      SKILL_ENTRY_POINT.test(file.relPath),
    );

    // Data-driven, so a skill authored later inherits the contract without an
    // edit here. Non-degenerate: the corpus ships eight entry points.
    expect(entryPoints.length).toBeGreaterThanOrEqual(8);
    for (const file of entryPoints) {
      const description = String(frontmatterField(file.parsed, "description"));
      expect(description.trim(), `${file.relPath} opens on a non-third-person word`).toMatch(
        THIRD_PERSON_OPENER,
      );
      expect(hasWhenClause(description), `${file.relPath} names no trigger condition`).toBe(true);
    }
  });

  it("accepts the closed tools vocabulary and rejects anything else under the reserved key", () => {
    const restricted = contractViolations(
      corpusFileOf(
        "rules/stamity-scope.md",
        valid.rule.replace("tags: [review]", "tags: [review]\ntools: [claude, cursor, copilot, codex]"),
      ),
    );
    expect(restricted).toEqual([]);

    const unknown = contractViolations(
      corpusFileOf(
        "rules/stamity-scope.md",
        valid.rule.replace("tags: [review]", "tags: [review]\ntools: [claud]"),
      ),
    );
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatch(/unknown tool "claud"/);
    expect(unknown[0]).toContain("rules/stamity-scope.md");
  });
});
