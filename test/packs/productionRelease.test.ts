import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { shownSkillRows, skillsListCharacters } from "../../src/adapters/codex.ts";
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
 * The `production` pack's release skill (plan 018 file 2, u11-release-skill; REQ-PACK-019,
 * REQ-PACK-024, REQ-PACK-004): `st-release`, explicit-only, which writes the change record and
 * stops before every irreversible step until a typed token.
 *
 *   - **Explicit-only:** the head declares `disable-model-invocation: true` and the Codex
 *     companion sets `policy.allow_implicit_invocation: false`, so Codex's shown skills list
 *     drops the skill; the drop is shown against the same rows without the companion, which do
 *     count, so the zero is not a skill that was never measured.
 *   - **The change record:** every field REQ-PACK-019 names, read as rows of the record table.
 *   - **The stop:** the two typed tokens, a free-text yes opening nothing, silence holding, and an
 *     approver equal to the requester holding every stop.
 *   - **The readiness warning:** the sentence that keeps the readiness review a warning to the
 *     release (REQ-PACK-024). This pin holds it until a run of record passes every seeded readiness
 *     case and both twins; making a `NO` block the release changes this pin with it.
 *
 * Prose assertions run against a whitespace-flattened view ({@link flow}) so a reflowed paragraph
 * is not a failure; tables are parsed from the raw body. No mocks: every read is a real file.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACK_ROOT = join(REPO_ROOT, "packs", "production");

const SKILL = "skills/st-release/SKILL.md";
const COMPANION = "skills/st-release/agents/openai.yaml";

/** REQ-PACK-011's cap on a pack skill's description. */
const DESCRIPTION_MAX = 250;

/** The plan's "about 150-190 lines", with room for a reflow. */
const BODY_CAP = 200;

/** The record's rows, in table order: REQ-PACK-019's fields, requester and approver apart. */
const RECORD_FIELDS: readonly string[] = [
  "Reason",
  "Security impact",
  "Test evidence",
  "Requester",
  "Approver",
  "Rollback path",
  "Emergency route",
  "SBOM",
  "Provenance",
];

/** The corpus pin REQ-PACK-024 names: the readiness review stays a warning to the release. */
const READINESS_WARNING = "The readiness review is read as a warning and never stops the release.";

/** The nine touchpoints and the pack's one command: every `/st-*` mention must resolve to one. */
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

const packFiles: Promise<CorpusFile[]> = walkAllMarkdown(PACK_ROOT);

async function skill(): Promise<CorpusFile> {
  const file = (await packFiles).find((candidate) => candidate.relPath === SKILL);
  if (file === undefined) throw new Error(`${SKILL}: not present under packs/production`);
  return file;
}

async function companionText(): Promise<string> {
  return readFile(join(PACK_ROOT, ...COMPANION.split("/")), "utf8");
}

/** The body with every whitespace run collapsed, so a wrapped sentence still reads as one. */
function flow(file: CorpusFile): string {
  return file.parsed.body.replace(/\s+/g, " ");
}

/** The text of a `## <heading>` section, up to the next `## ` heading. */
function section(file: CorpusFile, heading: string): string {
  const marker = `\n## ${heading}\n`;
  const start = file.parsed.body.indexOf(marker);
  expect(start, `${file.relPath}: no "## ${heading}" section`).toBeGreaterThanOrEqual(0);
  const rest = file.parsed.body.slice(start + marker.length);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

/** One section, whitespace-flattened. */
function flowSection(file: CorpusFile, heading: string): string {
  return section(file, heading).replace(/\s+/g, " ");
}

/** The rows of the first markdown table in `text`, header and separator dropped, cells trimmed. */
function tableRows(text: string): string[][] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
}

describe("st-release — head and companion", () => {
  it("carries the skill head, explicit-only, with no spawn", async () => {
    const file = await skill();

    expect(frontmatterField(file.parsed, "license")).toBe("MIT");
    const compatibility = frontmatterField(file.parsed, "compatibility");
    expect(typeof compatibility === "string" && compatibility.trim() !== "" && !compatibility.includes("\n")).toBe(true);
    expect(frontmatterField(file.parsed, "id")).toBe("release");
    expect(filenameSlug(file.relPath)).toBe("release");
    expect(frontmatterField(file.parsed, "type")).toBe("skill");
    expect(frontmatterField(file.parsed, "tags")).toEqual(["release"]);
    expect(frontmatterField(file.parsed, "disable-model-invocation")).toBe(true);
    // The plan cell says "No spawn": the skill runs its own steps and delegates to no role.
    expect(frontmatterField(file.parsed, "spawns")).toBeUndefined();
    requireLoadClass(file, ["on-demand"]);
    requireObsoleteWhen(file);
  });

  it("describes itself in at most 250 characters, third person, starting only by name", async () => {
    const description = frontmatterField((await skill()).parsed, "description");

    expect(typeof description).toBe("string");
    const text = description as string;
    expect(text.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(text).not.toMatch(/\b(?:you|your|yours|yourself)\b/i);
    expect(text).toMatch(/\bTriggers\b[^.]*\bwhen\b/);
    expect(text).toMatch(/\bonly by name\b/i);
  });

  it("ships the core companion form, hiding the skill from Codex's model", async () => {
    const doc = parseYamlStrict(await companionText(), COMPANION);

    expect(isPlainObject(doc)).toBe(true);
    const record = doc as Record<string, unknown>;
    expect(record["interface"]).toEqual({
      display_name: "Release",
      short_description: "Use the Stamity release workflow",
      default_prompt: "Use $st-release for this repository.",
    });
    expect(record["policy"]).toEqual({ allow_implicit_invocation: false });
  });

  it("adds no character to Codex's shown skills list, where the same rows without the companion count", async () => {
    const file = await skill();
    const skillRow = { path: `.agents/${SKILL}`, content: file.raw };
    const companionRow = { path: `.agents/${COMPANION}`, content: await companionText() };

    // REQ-PACK-004: the fit check and sync's refusal both count through shownSkillRows.
    expect(skillsListCharacters(shownSkillRows([skillRow, companionRow]))).toBe(0);
    // Non-degenerate: without its companion the same skill row is shown and counted.
    const description = frontmatterField(file.parsed, "description") as string;
    expect(skillsListCharacters(shownSkillRows([skillRow]))).toBe(description.length + 3);
  });
});

describe("st-release — anatomy", () => {
  it("stays inside its body cap and scans clean", async () => {
    const file = await skill();

    assertLineCap(file, BODY_CAP);
    assertDenyClean(file);
  });

  it("carries no CLI call", async () => {
    const body = (await skill()).parsed.body;

    // A pack carries no CLI call: a pinned call is the engine's to render.
    expect(body).not.toMatch(/(?<![\w./-])stamity\s+[a-z]/);
    expect(body).not.toMatch(/\bnpx\b/);
    expect(body).not.toContain("${STAMITY:");
  });

  it("mentions only commands that exist: the nine touchpoints and the pack's review", async () => {
    const mentioned = [...(await skill()).parsed.body.matchAll(/\/st-([a-z][a-z-]*)/g)].map((match) => match[1]);

    expect(mentioned.length).toBeGreaterThan(0);
    for (const id of new Set(mentioned)) {
      expect(COMMAND_IDS, `/st-${id} is not a command`).toContain(id);
    }
  });

  it("runs in two modes, the deploy mode with no release-branch or tag preflight", async () => {
    const file = await skill();
    const modes = tableRows(section(file, "Two modes"));

    expect(modes.map((row) => row[0])).toEqual(["Versioned release", "Deploy from main"]);
    expect(modes[1]![2]).toMatch(/no release-branch or tag preflight/);
    expect(flow(file)).toContain("mode: release | deploy");
  });
});

describe("st-release — the readiness read", () => {
  it("holds the sentence that keeps the readiness review a warning", async () => {
    const text = flowSection(await skill(), "Step 2 — The readiness read");

    expect(text).toContain(READINESS_WARNING);
    expect(text).toContain(".stamity/production/<service>-<HEAD sha>.json");
    expect(text).toContain("`ready.value`");
  });

  it("reads absent, stale, NO, not signed and YES as one line each, and no value stops it", async () => {
    const text = flowSection(await skill(), "Step 2 — The readiness read");

    expect(text).toMatch(/\*\*Absent\*\*, or present only at another sha: one line/);
    expect(text).toMatch(/\*\*`NO`\*\* or \*\*`not signed`\*\*: one line/);
    expect(text).toMatch(/\*\*`YES`\*\*: one line/);
    expect(text).toMatch(/the warning is the whole of its effect here/i);
    // The warning never turns into a stop: no sentence of the section halts or holds on it.
    expect(text).not.toMatch(/\b(?:halt|ends held|does not open)\b/i);
  });
});

describe("st-release — the change record", () => {
  it("writes the record at its path, one row per field REQ-PACK-019 names", async () => {
    const file = await skill();
    const record = section(file, "Step 7 — The change record");

    expect(record).toContain(".stamity/production/releases/<version | sha>.md");
    expect(tableRows(record).map((row) => row[0])).toEqual([...RECORD_FIELDS]);
    expect(flow(file)).toMatch(/ticket-ready block/i);
  });

  it("holds test evidence as gate rows with command and exit code, and asks for an approver who is not the requester", async () => {
    const rows = new Map(tableRows(section(await skill(), "Step 7 — The change record")).map((row) => [row[0], row[1]]));

    expect(rows.get("Test evidence")).toMatch(/command and exit code/);
    expect(rows.get("Approver")).toMatch(/not the requester/);
    expect(rows.get("Emergency route")).toMatch(/`Escalation contact`/);
    expect(rows.get("Rollback path")).toMatch(/before any deploy/);
  });

  it("names an absent SBOM or provenance and writes the record either way", async () => {
    const file = await skill();
    const rows = new Map(tableRows(section(file, "Step 7 — The change record")).map((row) => [row[0], row[1]]));
    const supply = flowSection(file, "Step 6 — Supply-chain references");

    expect(rows.get("SBOM")).toContain("`absent — <why>`");
    expect(rows.get("Provenance")).toContain("`absent — <why>`");
    expect(supply).toContain("`SBOM: absent — <why>`");
    expect(supply).toContain("`provenance: absent — <why>`");
    expect(supply).toMatch(/the record is written either way/i);
  });

  it("counts an approver equal to the requester as no approver", async () => {
    const text = flowSection(await skill(), "Step 7 — The change record");

    expect(text).toMatch(/An approver equal to the requester is recorded as such and counts as no approver/);
  });
});

describe("st-release — the stop", () => {
  it("opens the tag push, the release creation and the publish on v<version> alone, the deploy on DEPLOY alone", async () => {
    const rows = tableRows(section(await skill(), "Step 8 — The stop"));
    const opensOn = (pattern: RegExp): string | undefined => rows.find((row) => pattern.test(row[0]!))?.[2];

    expect(rows).toHaveLength(5);
    expect(opensOn(/git push origin v<version>/)).toBe("the typed `v<version>`");
    expect(opensOn(/release creation/)).toBe("the typed `v<version>`");
    expect(opensOn(/registry publish/)).toBe("the typed `v<version>`");
    expect(opensOn(/deploy command/)).toBe("the typed `DEPLOY`");
    // Every row but the local tag is labelled irreversible.
    expect(rows.filter((row) => row[1]!.startsWith("no")).map((row) => row[0])).toHaveLength(4);
    expect(opensOn(/git tag -a/)).toMatch(/typed `v<version>`/);
  });

  it("opens nothing on a free-text yes, and holds on silence", async () => {
    const text = flowSection(await skill(), "Fail-closed boundary");

    expect(text).toContain('A free-text "yes, publish", an approval in other words, or a token for another version opens nothing.');
    expect(text).toMatch(/\*\*Silence holds\.\*\* No answer, an empty answer or a mismatched token leaves the release assembled and unpublished/);
    expect(text).toMatch(/a run with nobody watching opens none of them/);
  });

  it("holds every stop without an approver distinct from the requester, and the deploy without a rollback path", async () => {
    const text = flowSection(await skill(), "Step 8 — The stop");

    expect(text).toMatch(/No stop opens while the approver reads `not named` or equals the requester/);
    expect(text).toMatch(/for `DEPLOY`, while the rollback path is empty/);
  });
});

describe("st-release — the boundaries carried from ops", () => {
  it("never unpublishes, binds to the digest, publishes under an identity, and never applies to live infrastructure", async () => {
    const text = flow(await skill());

    expect(text).toMatch(/A published version is never unpublished: deprecate it and publish a fixed patch/);
    expect(text).toMatch(/\*\*Digest, not tag:\*\*/);
    expect(text).toMatch(/pinned by digest, never by a moving tag/);
    expect(text).toMatch(/\*\*Identity, not stored credentials:\*\*/);
    expect(text).toMatch(/An infrastructure apply, a cluster rollout by hand, a resource deletion or a write to a protected branch is never run by this skill, even after `DEPLOY`/);
    expect(text).toMatch(/this skill takes no automatic rollback/);
  });

  it("stops the cut on a red gate row and fixes nothing inside the run", async () => {
    const text = flowSection(await skill(), "Step 5 — Gates and build");

    expect(text).toMatch(/the charter's full gate and the project's build/);
    expect(text).toMatch(/A red row stops the cut/);
    expect(text).toMatch(/never inside this run/);
  });
});
