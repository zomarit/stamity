import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { shownSkillRows } from "../../src/adapters/codex.ts";
import { isPlainObject, parseYamlStrict } from "../../src/config/parse.ts";
import { frontmatterField } from "../../src/content/frontmatter.ts";
import {
  assertDenyClean,
  assertLineCap,
  filenameSlug,
  requireLoadClass,
  requireObsoleteWhen,
  walkAllMarkdown,
  type CorpusFile,
} from "../corpus/harness.ts";

/**
 * `st-incident`, the `production` pack's incident skill (plan 018 file 2, u12-incident-skill;
 * REQ-PACK-020, REQ-PACK-004): it investigates a production incident read-only, the changes
 * before it included, proposes every mitigation and applies none, and writes a post-incident
 * review whose code root cause names a `path:line`, a commit and a confidence.
 *
 *   - **Explicit-only.** `disable-model-invocation: true` in the head and the Codex companion
 *     hiding it, read through the adapter's own predicate (`shownSkillRows`), so the skill adds no
 *     character to Codex's shown list; the predicate is shown listing it once the companion goes,
 *     so the check is not green for want of a row.
 *   - **Proposes, never applies**, at every severity, and a demanded rollback stays a proposal.
 *   - **The leaked-credential case cites the secrets rule and restates none of it.** The steps are
 *     read from the rule's own item, so a reworded rule keeps the probe honest, and the probe is
 *     shown red on a made-up body that copies them.
 *   - **No clock.** No minute, hour, day or week deadline anywhere, a spelled-out or "business"
 *     count included; the probe is shown red on made-up lines of each shape.
 *
 * Prose assertions run against a whitespace-flattened view ({@link flow}) so a reflowed paragraph
 * is not a failure. No mocks: every read is a real file.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACK_ROOT = join(REPO_ROOT, "packs", "production");
const SKILL = "skills/st-incident/SKILL.md";
const COMPANION = join(PACK_ROOT, "skills", "st-incident", "agents", "openai.yaml");
const SECRETS_RULE = join(REPO_ROOT, "content", "rules", "stamity-secrets.md");

/** REQ-PACK-011: a pack skill's description holds to 250 characters. */
const DESCRIPTION_MAX = 250;

/** The plan's "about 120-150 lines", with room for a reflow; under the skill design target of 200. */
const BODY_CAP = 170;

const SECOND_PERSON = /\b(?:you|your|yours|yourself)\b/i;

/** A count, in digits or spelled out, as a deadline states it. */
const COUNT = String.raw`(?:\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|twenty-four|forty-eight|seventy-two)`;

/**
 * The deadline shape the plan forbids, widened past its `/\b\d+\s*(h|hours|days)\b/`: a count of
 * minutes, hours, days or weeks, singular or plural, abbreviated, hyphenated ("72-hour") or
 * qualified ("4 business days"), so the old ops clock ("within 5 minutes") cannot come back green.
 */
const DEADLINE = new RegExp(
  String.raw`\b${COUNT}[\s-]*(?:(?:business|working|calendar)\s+)?(?:h|hrs?|hours?|min|mins|minutes?|d|days?|wks?|weeks?)\b`,
  "i",
);

/** The escalation's scope, as each section that mentions it states it: P0 or P1, and every exposure. */
const ESCALATION_SCOPE = /P0 or P1,? and every exposure/;

/** Protocol sections the anatomy keeps in the charter and the rules, never per artifact. */
const BANNED_SECTION = /^#{2,}\s.*\b(?:B1|B2|error handling|definition of done)\b/im;

/** The nine touchpoints and the pack's command: every `/st-*` mention must resolve to one. */
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
  "production-review",
];

/** The escalation sentence the plan cell fixes, word for word. */
const ESCALATION = "This may start a reporting duty; tell the contact the policy file names, now.";

async function skill(): Promise<CorpusFile> {
  const file = (await walkAllMarkdown(PACK_ROOT)).find((candidate) => candidate.relPath === SKILL);
  if (file === undefined) throw new Error(`${SKILL}: not present under packs/production`);
  return file;
}

/** The body with every whitespace run collapsed, so a wrapped sentence still reads as one. */
function flow(file: CorpusFile): string {
  return file.parsed.body.replace(/\s+/g, " ");
}

/** The text of a top-level `## <heading>` section, whitespace-flattened. */
function flowSection(file: CorpusFile, heading: string): string {
  const marker = `\n## ${heading}\n`;
  const start = file.parsed.body.indexOf(marker);
  expect(start, `${file.relPath}: no "## ${heading}" section`).toBeGreaterThanOrEqual(0);
  const rest = file.parsed.body.slice(start + marker.length);
  const end = rest.indexOf("\n## ");
  return (end === -1 ? rest : rest.slice(0, end)).replace(/\s+/g, " ");
}

/**
 * The rotation steps of the secrets rule, read from its item 6 ("Exposure opens a rotation"): the
 * comma-separated clauses after "The sequence is fixed:", each lower-cased, the "then" dropped.
 */
async function rotationSteps(): Promise<string[]> {
  const rule = (await readFile(SECRETS_RULE, "utf8")).replace(/\s+/g, " ");
  const item = /\*\*Exposure opens a rotation, not a deletion\.\*\*(.*?)(?= \d+\. \*\*)/.exec(rule)?.[1] ?? "";
  const sequence = /The sequence is fixed: (.*?)\./.exec(item)?.[1] ?? "";
  return sequence
    .split(",")
    .map((step) => step.trim().replace(/^then /, "").toLowerCase())
    .filter((step) => step !== "");
}

/** Each rotation step `text` restates, matched case-blind over a flattened view. */
function restatedSteps(text: string, steps: readonly string[]): string[] {
  const flat = text.replace(/\s+/g, " ").toLowerCase();
  return steps.filter((step) => flat.includes(step));
}

describe("st-incident — explicit-only head and companion", () => {
  it("carries the skill identity head, explicit-only, with no spawn", async () => {
    const file = await skill();

    expect(frontmatterField(file.parsed, "license")).toBe("MIT");
    expect(frontmatterField(file.parsed, "compatibility")).toEqual(expect.any(String));
    expect(frontmatterField(file.parsed, "id")).toBe("incident");
    expect(filenameSlug(file.relPath)).toBe("incident");
    expect(frontmatterField(file.parsed, "type")).toBe("skill");
    expect(frontmatterField(file.parsed, "tags")).toEqual(["incident"]);
    expect(frontmatterField(file.parsed, "disable-model-invocation")).toBe(true);
    // The plan cell: no spawn. The skill works in the caller's own session.
    expect(frontmatterField(file.parsed, "spawns")).toBeUndefined();
    requireLoadClass(file, ["on-demand"]);
    requireObsoleteWhen(file);
  });

  it("describes itself in the third person, within 250 characters, starting only by name", async () => {
    const text = frontmatterField((await skill()).parsed, "description");

    expect(typeof text).toBe("string");
    const description = text as string;
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(description).not.toMatch(SECOND_PERSON);
    expect(description).toMatch(/only when invoked by name/i);
    expect(description.slice(description.search(/\bTriggers\b/))).toMatch(/^Triggers\b.*\bwhen\b/i);
  });

  it("ships the companion in the core form, hiding the skill from Codex's model", async () => {
    const doc = parseYamlStrict(await readFile(COMPANION, "utf8"), COMPANION);

    expect(isPlainObject(doc)).toBe(true);
    expect(doc).toEqual({
      interface: {
        display_name: "Incident",
        short_description: "Use the Stamity incident workflow",
        default_prompt: "Use $st-incident for this repository.",
      },
      policy: { allow_implicit_invocation: false },
    });
  });

  it("adds no row to Codex's shown list, and would add one without its companion (REQ-PACK-004)", async () => {
    const skillRow = { path: ".agents/skills/st-incident/SKILL.md", content: (await skill()).raw };
    const companionRow = {
      path: ".agents/skills/st-incident/agents/openai.yaml",
      content: await readFile(COMPANION, "utf8"),
    };

    expect(shownSkillRows([skillRow, companionRow])).toEqual([]);
    // Non-degenerate: the same predicate lists the skill once the companion is gone.
    expect(shownSkillRows([skillRow])).toEqual([skillRow]);
  });
});

describe("st-incident — anatomy", () => {
  it("stays inside its body cap, scans clean and carries no protocol boilerplate", async () => {
    const file = await skill();

    assertLineCap(file, BODY_CAP);
    assertDenyClean(file);
    expect(file.parsed.body).not.toMatch(BANNED_SECTION);
    expect(file.parsed.body).toContain("\n## Quick Start\n");
    expect(file.parsed.body).toMatch(/\n## Step 1 —/);
    expect(file.parsed.body).toContain("\n## Output artifact\n");
  });

  it("carries no CLI call", async () => {
    const body = (await skill()).parsed.body;

    // A pack carries no CLI call: a pinned call is the engine's to render.
    expect(body).not.toMatch(/(?<![\w./-])stamity\s+[a-z]/);
    expect(body).not.toMatch(/\bnpx\b/);
    expect(body).not.toContain("${STAMITY:");
  });

  it("mentions only commands that exist, and routes follow-ups to the three named", async () => {
    const file = await skill();
    const mentioned = [...file.parsed.body.matchAll(/\/st-([a-z][a-z-]*)/g)].map((match) => match[1]);

    expect(mentioned.length).toBeGreaterThan(0);
    for (const id of new Set(mentioned)) {
      expect(COMMAND_IDS, `/st-${id} is not a command`).toContain(id);
    }
    const text = flow(file);
    expect(text).toContain("/st-debug");
    expect(text).toContain("/st-work");
    expect(text).toContain("/st-board fill --source <review>");
    expect(text).toContain("`st-handoff`");
  });
});

describe("st-incident — investigates read-only and applies nothing", () => {
  it("investigates read-only, the changes before the incident included", async () => {
    const text = flow(await skill());

    expect(text).toMatch(/investigates read-only/i);
    for (const source of ["git log", "git diff", "release tags", "CI runs"]) expect(text).toContain(source);
    // TEST CHANGE, justified: review/40. Step 2's `git diff` runs before Step 5's rule, so for an
    // exposure the change is listed by commit and file only and its diff body, which holds the
    // value, never reaches the reply.
    expect(text).toMatch(
      /For an exposure, the change that carried the credential is listed by its commit and file only, read with `git diff --stat`, never by its diff body/,
    );
    expect(text).toMatch(/one topology line/i);
    expect(text).toMatch(/severity sets who is told; it never opens an apply/i);
  });

  it("proposes every mitigation and applies none, at every severity, with its confidence and undo", async () => {
    const file = await skill();
    const text = flow(file);
    const mitigation = flowSection(file, "Step 4 — Propose a mitigation");

    expect(text).toMatch(/\bnever (?:applied|applies)\b/i);
    expect(text).toMatch(/at every severity/i);
    for (const part of ["exact command, flag or config change", "confidence", "reversib", "undo"]) {
      expect(mitigation).toContain(part);
    }
    // The edge case: a demanded rollback is printed with its undo, not run.
    expect(mitigation).toMatch(/"roll it back now"/i);
    expect(mitigation).toMatch(/proposed with its undo and not run/i);
    expect(text).toMatch(/recovery is a telemetry claim/i);
  });

  it("carries the ops never-list, blameless rules and data hygiene", async () => {
    const file = await skill();
    const never = flowSection(file, "Never");

    for (const act of ["apply a mitigation", "rewrite history", "write a secret", "name a person as a cause"]) {
      expect(never).toContain(act);
    }
    const text = flow(file);
    expect(text).toMatch(/blameless/i);
    expect(text).toMatch(/credentials, personal data or proprietary source/i);
    expect(text).toMatch(/every timeline entry cites its source/i);
  });
});

describe("st-incident — the leaked-credential case", () => {
  it("cites the secrets rule's rotation order and restates none of its steps", async () => {
    const file = await skill();
    const section = flowSection(file, "Step 5 — A leaked credential");
    const steps = await rotationSteps();

    // Cited by the rule's name and item title, never by a path: Claude Code keeps a
    // `stamity-secrets.md` file, Codex folds the rule into `AGENTS.override.md`, and an installed repo
    // holds no `content/`; the pack suite also reads a slash before `stamity-` as a command mention.
    expect(section).toContain("the secrets rule (`stamity-secrets`), item 6");
    expect(section).toMatch(/Exposure opens a rotation, not a deletion/);
    expect(section).toMatch(/wherever this client keeps its rules/);
    expect(section).not.toMatch(/rules folder|stamity-secrets\.md/);
    expect(section).toMatch(/cited, never restated/i);
    // The cited item number holds in the rule itself, so a renumbered rule turns this red.
    expect(await readFile(SECRETS_RULE, "utf8")).toMatch(/^6\. \*\*Exposure opens a rotation, not a deletion\.\*\*/m);
    expect(section).toMatch(/every use/i);
    // Finding each use never types the live value: no search by the literal, nothing printed.
    expect(section).toMatch(/variable or key name, the file that held it, or a non-reversible fingerprint/);
    expect(section).toMatch(/never by the literal value/);
    expect(section).toMatch(/never typed or printed/);
    expect(section).toMatch(/history rewrite stay the person's/i);
    // Non-degenerate: the rule's item yields its five steps, so the absence below means something.
    expect(steps).toHaveLength(5);
    expect(restatedSteps(file.parsed.body, steps)).toEqual([]);
  });

  it("is red on a made-up body that copies the rule's steps", async () => {
    const steps = await rotationSteps();
    const copied = `Rotate it: ${steps[0]}, then\n${steps[3]}.`;

    expect(restatedSteps(copied, steps)).toEqual([steps[0], steps[3]]);
  });
});

describe("st-incident — escalation, no clock, and the review", () => {
  it("escalates to the policy file's contact, asking once when none is named", async () => {
    const file = await skill();
    const text = flowSection(file, "Step 6 — Escalate");

    expect(text).toContain(ESCALATION);
    expect(text).toContain(".stamity/production/policy.md");
    expect(text).toContain("`Escalation contact`");
    expect(text).toMatch(/asked once/i);
    expect(text).toMatch(/no clock table/i);
  });

  it("scopes the escalation the same way in the Quick Start, Step 6 and the output artifact", async () => {
    const file = await skill();

    for (const heading of ["Quick Start", "Step 6 — Escalate", "Output artifact"]) {
      const section = flowSection(file, heading);
      expect(section, heading).toMatch(ESCALATION_SCOPE);
      expect(section, heading).not.toMatch(/every incident takes/i);
    }
  });

  it("states no minute, hour, day or week deadline anywhere, and the probe is red on each shape", async () => {
    const file = await skill();

    expect(file.raw).not.toMatch(DEADLINE);
    for (const line of [
      "notify the regulator within 72 hours",
      "page on-call in 24h",
      "P0 pages on-call within 5 minutes",
      "acknowledge within 1 hour",
      "file the report within 1 day",
      "send the notice within 4 business days",
      "close the review in three working days",
      "a 72-hour reporting window",
      "update the status page every 30 min",
      "publish the review within 2 weeks",
    ]) {
      expect(line, line).toMatch(DEADLINE);
    }
    // Not so wide that it trips on the skill's own numbering.
    for (const line of ["Step 6 — Escalate", "item 6", "P0 and P3 alike", "at P0 or P1"]) {
      expect(line, line).not.toMatch(DEADLINE);
    }
  });

  it("writes the review at docs/incidents/ with a path:line code root cause, its commit and confidence", async () => {
    const file = await skill();
    const review = flowSection(file, "Step 7 — The post-incident review");

    expect(review).toContain("docs/incidents/");
    // ADDED: review/56. The review is written only under the pack's declared `docs/incidents/**`,
    // the scope `add` shows; no other location is written.
    expect(review).toContain("Written to `docs/incidents/<yyyy-mm-dd>-<slug>.md`.");
    expect(review).not.toMatch(/elsewhere/);
    for (const part of ["Summary", "Timeline", "Root cause", "Impact", "Follow-ups", "Lessons"]) {
      expect(review).toContain(part);
    }
    expect(review).toMatch(/names a `path:line`, the commit that introduced it, and a confidence/i);
    expect(review).toMatch(/a low-confidence root cause keeps the review open/i);
  });
});
