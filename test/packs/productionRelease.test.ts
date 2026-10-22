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

/** The secrets sentence: a change record holds names and locations, and a pasted credential is refused. */
const SECRETS_RULE =
  "The record names variables, files and locations, never a secret value. An answer carrying a credential, such as a connection string with its password or a webhook address with its key, is refused, not recorded, citing the secrets floor (the `stamity-secrets` rule, items 1 and 4)";

/** The approver as the record writes it: the requester's claim, never shown as a confirmed approval. */
const APPROVER_CLAIM = "named by the requester, not confirmed by this skill";

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

  it("skips the pack's own records in the clean-tree probe and falls back to the root commit with no earlier base", async () => {
    const file = await skill();
    const preflight = section(file, "Step 1 — Preflight, read-only");
    const porcelain = tableRows(preflight).find((row) => row[0] === "`git status --porcelain`");

    // TEST CHANGE, justified: review/57. The review this release reads refreshes the verify
    // artifacts, so the skip covers both of the pack's declared `.stamity/` write paths.
    expect(porcelain?.[1]).toContain(
      "skipping the pack's own paths under `.stamity/` (`.stamity/production/**`, `.stamity/verify/**`)",
    );
    expect(preflight.replace(/\s+/g, " ")).toMatch(
      /With no earlier deploy record or tag, a first deploy or release, the change set's base is the repository's root commit \(`git rev-list --max-parents=0 HEAD`\), and the run says so/,
    );
  });

  it("keys the record, the SBOM and the last-deploy lookup by the service, so two services at one HEAD keep apart", async () => {
    // ADDED: pr/3. A record keyed by `<version | sha>` alone is overwritten by the next service
    // deployed from the same head, and a change set read from it starts at another service's deploy.
    const file = await skill();
    const changeSet = tableRows(section(file, "Step 1 — Preflight, read-only")).find((row) => row[0] === "change set");

    expect(flow(file)).toContain("record: .stamity/production/releases/<service>-<version | sha>.md");
    expect(changeSet?.[1]).toContain("since this service's last deploy record in deploy mode");
    for (const heading of ["Step 6 — Supply-chain references", "Step 7 — The change record"]) {
      expect(flowSection(file, heading)).not.toMatch(/releases\/<version \| sha>/);
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
    expect(text).toContain(".stamity/production/<service>-<sha>.json");
    expect(text).toContain("`ready.value`");
  });

  it("reads the review under the review's own name and range rule, so a committed review is still found", async () => {
    const text = flowSection(await skill(), "Step 2 — The readiness read");

    // The review's file name: the service lower-cased to [a-z0-9-], the short sha its frame shows.
    expect(text).toMatch(/`<service>` in lower case, `\[a-z0-9-\]` only, and `<sha>` the short sha its frame shows/);
    // The review's range rule: the newest report at HEAD or an ancestor, never HEAD alone.
    expect(text).toMatch(/the service's newest whose sha is HEAD or an ancestor of HEAD, the review's own range rule/);
    expect(text).toMatch(/\*\*At an ancestor\*\*: the value's line names the review's sha/);
  });

  it("reads absent, stale, NO, not signed and YES as one line each, and no value stops it", async () => {
    const text = flowSection(await skill(), "Step 2 — The readiness read");

    expect(text).toMatch(/\*\*Absent\*\*, no review at HEAD or an ancestor: one line/);
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

    // TEST CHANGE, justified: pr/3. Keyed without the service, two services deployed from one HEAD
    // wrote one record over the other, so the record's key now leads with the service.
    expect(record).toContain(".stamity/production/releases/<service>-<version | sha>.md");
    expect(tableRows(record).map((row) => row[0])).toEqual([...RECORD_FIELDS]);
    expect(flow(file)).toMatch(/ticket-ready block/i);
  });

  it("holds test evidence as gate rows with command and exit code, and asks for an approver who is not the requester", async () => {
    const rows = new Map(tableRows(section(await skill(), "Step 7 — The change record")).map((row) => [row[0], row[1]]));

    expect(rows.get("Test evidence")).toMatch(/command and exit code/);
    expect(rows.get("Approver")).toMatch(/not the requester/);
    expect(rows.get("Approver")).toContain(APPROVER_CLAIM);
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

  // TEST CHANGE, justified: review/38. The pack's install scope is what `add` shows before install,
  // so every manifest the bump writes and the SBOM's path must fall inside it; the skill now names
  // the declared manifests only and writes the SBOM beside the record, under a declared glob.
  it("writes the bump and the SBOM only inside the pack's declared install scope", async () => {
    const file = await skill();
    const manifest = JSON.parse(await readFile(join(PACK_ROOT, "pack.json"), "utf8")) as {
      permissions: { touchedPaths: string[] };
    };
    const scope = manifest.permissions.touchedPaths;
    const bump = flowSection(file, "Step 4 — Bump and changelog (release mode)");
    const written = [...bump.matchAll(/`([\w.-]+\.(?:json|yaml|lock))`/g)].map((match) => match[1]!);

    expect(written.toSorted()).toEqual(["package-lock.json", "package.json", "pnpm-lock.yaml", "yarn.lock"]);
    for (const path of written) expect(scope, `${path} is outside touchedPaths`).toContain(path);
    // TEST CHANGE, justified: pr/1. Printing another stack's version edit for the person handed them
    // a line to paste, which the charter's invariant 7 calls a protocol violation; the run now holds
    // on that bump, names the manifest in what it hands back, and routes the bump to `/st-work`.
    expect(bump).toMatch(
      /a version kept in another stack's manifest is never written or printed as an edit; the run ends held, naming that manifest, and the bump leaves through `\/st-work`/,
    );
    expect(bump).not.toMatch(/edit for the person to make/);
    expect(flowSection(file, "What the run hands back")).toMatch(/`held` with the field, token or manifest that holds it/);
    // TEST CHANGE, justified: pr/3. The SBOM sits beside the record, so it takes the record's key.
    expect(flowSection(file, "Step 6 — Supply-chain references")).toContain(
      "Generate it into `.stamity/production/releases/<service>-<version | sha>.sbom.json`, beside the record",
    );
    expect(scope).toContain(".stamity/production/**");
  });

  it("keeps secret values out of the record and refuses a pasted credential, citing the secrets floor", async () => {
    expect(flowSection(await skill(), "Step 7 — The change record")).toContain(SECRETS_RULE);
    // TEST CHANGE, justified: the u11 r2 suppressed Minor. Items 1 and 4 cover the refusal, but the
    // steps for a value that counts as exposed are the floor's item 6, so that part cites item 6.
    expect(flowSection(await skill(), "Step 7 — The change record")).toMatch(
      /counts as exposed, whose rotation is that floor's item 6/,
    );
    // TEST CHANGE, justified: review/55. Codex folds the rule into `AGENTS.override.md` and Cursor
    // ships it as `.mdc`, so the citation names the rule, as `st-incident` and the review do.
    expect(flowSection(await skill(), "Step 7 — The change record")).not.toMatch(/stamity-secrets\.md/);
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
    // The release creation never makes a tag of its own, so a failed push cannot leave it tagging the default branch.
    expect(rows.find((row) => /release creation/.test(row[0]!))?.[0]).toContain("`gh release create v<version> --verify-tag`");
  });

  it("runs the opened commands in order and stops at the first non-zero exit, ending held", async () => {
    const text = flowSection(await skill(), "Step 8 — The stop");

    expect(text).toContain(
      "After the token, the opened commands run in table order, each once, and the run stops at the first non-zero exit: no later command runs, and the run ends held, naming each command that ran with its exit code.",
    );
    // ADDED: review/58. The local tag a failed push leaves makes a re-run's change set empty, so
    // the held message names the way back.
    expect(text).toContain(
      "After a failed tag push it also names `git tag -d v<version>`, since the local tag left behind makes a re-run find nothing to ship.",
    );
  });

  // ADDED: review/53, the maintainer's "Printed person step". Release mode commits on the release
  // branch; landing that branch is the person's act, printed before the stop and never run here,
  // and a tag the publish proof needs reachable from the default branch waits for that merge.
  it("prints the release branch's push and pull request as the person's acts, and holds the tag push for the merge where the publish proof needs it", async () => {
    const file = await skill();
    const record = flowSection(file, "Step 7 — The change record");
    const stop = flowSection(file, "Step 8 — The stop");

    expect(record).toContain(
      "committed together on the release branch with the project's commit conventions; nothing is pushed. Before the stop the run prints `git push -u origin release/<version>` and the pull request into the default branch as the person's acts.",
    );
    expect(stop).toContain(
      "Where the project's publish proof needs the tag reachable from the default branch, the tag push waits until the release branch's pull request has put the release commit there, and the stop says so.",
    );
    // The skill still pushes nothing before the typed token and merges nothing itself.
    expect(flowSection(file, "Fail-closed boundary")).toMatch(/merges nothing into the default branch/);
    expect(tableRows(section(file, "Step 8 — The stop")).map((row) => row[0])).not.toContain(
      "`git push -u origin release/<version>`",
    );
  });

  it("shows the approver as the requester's claim before asking, the typed token being the confirmation", async () => {
    const text = flowSection(await skill(), "Step 8 — The stop");

    expect(text).toMatch(/^ ?Show the record's approver line, `named by the requester, not confirmed by this skill`, then print each remaining command/);
    expect(text).toContain("The typed token is the person's confirmation that the named approver approved.");
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
    expect(text).toMatch(/for `DEPLOY`, while the rollback path reads `not named` or is empty/);
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
    // TEST CHANGE, justified: u11's note. With `st-incident` shipped beside it, the live-impact
    // hand-off names the skill instead of "the pack's incident procedure".
    expect(text).toMatch(/A live production impact leaves for the pack's incident skill, `st-incident`/);
  });

  it("stops the cut on a red gate row and fixes nothing inside the run", async () => {
    const text = flowSection(await skill(), "Step 5 — Gates and build");

    expect(text).toMatch(/the charter's full gate and the project's build/);
    expect(text).toMatch(/A red row stops the cut/);
    expect(text).toMatch(/never inside this run/);
  });
});
