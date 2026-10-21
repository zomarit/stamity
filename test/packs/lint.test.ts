import { existsSync, readdirSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../../src/cli.ts";
import { isPlainObject, parseYamlStrict } from "../../src/config/parse.ts";
import { parseFrontmatter } from "../../src/content/frontmatter.ts";
import { madeUpArtifact, writeMadeUpPack } from "../support/packFixtures.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The pack lint (plan 018, u17-pack-suite; REQ-PACK-011), over every file under `packs/` and
 * over made-up packs written to a temp tree.
 *
 * A pack is supply: it installs into a repository whose Stamity version, command name and
 * package name it cannot know, so it carries no `${STAMITY:` substitution token (the pack lane
 * renders bodies byte-verbatim and would ship the token unexpanded) and no CLI call (a pinned
 * call is the engine's to render; a pack's would name a version it was never tested with). A
 * `.stamity/` path and a `stamity-<id>` name are neither, and stay allowed.
 *
 * Two head rules beside them: a skill that is explicit-only (`disable-model-invocation: true`)
 * ships the Codex companion that hides it from the model, and the reverse, so Codex's skills list
 * and the other clients agree about it (REQ-PACK-006); and a pack skill's description holds to
 * 250 characters, every pack held to it (REQ-PACK-011): the exemption `ops` and `product-audit`
 * held by name left with their folders in Package 22 file 2 (plan 018 file 2, u8-retire-old-packs).
 * The cap keeps an exemption parameter, empty by default, proven only on a made-up pack.
 *
 * Every rule is a function from one file to its problems, run over the real packs (expected
 * clean) and over a made-up pack that breaks it (expected to name the break), so no rule here is
 * green for want of an input that could trip it.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKS_ROOT = join(REPO_ROOT, "packs");

/** REQ-PACK-011: a pack skill's description holds to 250 characters. */
const DESCRIPTION_MAX = 250;

/** The registered verbs (`src/cli.ts`'s `COMMANDS`), read from the registry, never restated. */
const VERBS: readonly string[] = COMMANDS.map((command) => command.name);

/** The pack directories: every folder under `packs/` holding a `pack.json`. */
const PACK_IDS: readonly string[] = readdirSync(PACKS_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(PACKS_ROOT, entry.name, "pack.json")))
  .map((entry) => entry.name)
  .toSorted();

/** One file of a pack, as the lint reads it. */
interface PackFile {
  /** The pack id (its directory name). */
  pack: string;
  /** Pack-relative POSIX path. */
  relPath: string;
  text: string;
}

/** Every regular file under `packRoot`, `pack.json` included, sorted by path. */
async function readPackFiles(packRoot: string, pack: string): Promise<PackFile[]> {
  const entries = await readdir(packRoot, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .toSorted();
  return Promise.all(
    files.map(async (absPath) => ({
      pack,
      relPath: relative(packRoot, absPath).split(sep).join("/"),
      text: await readFile(absPath, "utf8"),
    })),
  );
}

// ── The rules ─────────────────────────────────────────────────────────────

/** `${STAMITY:` anywhere, well-formed or not. */
function substitutionTokens(file: PackFile): string[] {
  return /\$\{STAMITY:/.test(file.text)
    ? [`${file.pack}/${file.relPath}: carries a \${STAMITY: substitution token`]
    : [];
}

/**
 * `stamity` as a word of its own: not `.stamity/`, not `stamity-<id>`, not inside a longer
 * word. A `/` before it is allowed through on purpose, so `@zomarit/stamity` still reads as the
 * package.
 */
const STAMITY_WORD = /(?<![\w.-])stamity(?![\w-])/;

/** Every line that is a CLI call, each with the reason it reads as one. */
function cliCalls(file: PackFile): string[] {
  const verb = new RegExp(`(?<![\\w./-])stamity\\s+(?:${VERBS.join("|")})(?![\\w-])`);
  const problems: string[] = [];
  let fence: string | null = null;
  for (const [index, line] of file.text.split("\n").entries()) {
    const where = `${file.pack}/${file.relPath}:${index + 1}`;
    const opener = /^\s*(`{3,}|~{3,})/.exec(line);
    if (opener !== null) {
      const marker = opener[1]!;
      if (fence === null) fence = marker[0]!.repeat(marker.length);
      else if (marker.startsWith(fence)) fence = null;
      continue;
    }
    const reasons: string[] = [];
    if (/\bnpx\b/.test(line) && STAMITY_WORD.test(line.slice(line.search(/\bnpx\b/)))) {
      reasons.push("an npx call of stamity");
    }
    if (line.includes("@zomarit/stamity")) reasons.push("the package name @zomarit/stamity");
    if (fence !== null && /^\s*(?:\$\s+)?stamity\s/.test(line)) {
      reasons.push("a fenced line opening on `stamity `");
    }
    if (fence === null && line.trimStart().startsWith("|")) {
      const cells = line.split("|").map((cell) => cell.trim().replace(/^`+/, ""));
      if (cells.some((cell) => cell.startsWith("stamity "))) {
        reasons.push("a table cell opening on `stamity `");
      }
    }
    const called = verb.exec(line);
    if (called !== null) reasons.push(`\`${called[0]}\`, a registered verb`);
    if (reasons.length > 0) problems.push(`${where}: ${reasons.join("; ")}`);
  }
  return problems;
}

/** The skill folder a `skills/<dir>/…` path belongs to, or `null` outside one. */
function skillFolder(relPath: string): string | null {
  const match = /^skills\/([^/]+)\//.exec(relPath);
  return match === null ? null : match[1]!;
}

/**
 * Per skill: `disable-model-invocation: true` in `SKILL.md`'s head if and only if
 * `agents/openai.yaml` beside it sets `policy.allow_implicit_invocation: false`.
 */
function explicitOnlyCompanions(files: readonly PackFile[]): string[] {
  const problems: string[] = [];
  for (const skill of files.filter((file) => /^skills\/[^/]+\/SKILL\.md$/.test(file.relPath))) {
    const folder = skillFolder(skill.relPath)!;
    const head = parseFrontmatter(skill.text, skill.relPath).frontmatter;
    const explicitOnly = head["disable-model-invocation"] === true;
    const companion = files.find(
      (file) => file.pack === skill.pack && file.relPath === `skills/${folder}/agents/openai.yaml`,
    );
    let hidden = false;
    if (companion !== undefined) {
      const doc = parseYamlStrict(companion.text, `${companion.pack}/${companion.relPath}`);
      const policy = isPlainObject(doc) ? doc["policy"] : undefined;
      hidden = isPlainObject(policy) && policy["allow_implicit_invocation"] === false;
    }
    const where = `${skill.pack}/skills/${folder}`;
    if (explicitOnly && !hidden) {
      problems.push(
        `${where}: declares \`disable-model-invocation: true\` but ships no agents/openai.yaml ` +
          "setting `policy.allow_implicit_invocation: false`, so Codex still lists it",
      );
    }
    if (hidden && !explicitOnly) {
      problems.push(
        `${where}: agents/openai.yaml hides it from Codex's model, but SKILL.md does not ` +
          "declare `disable-model-invocation: true`, so the other clients still auto-load it",
      );
    }
  }
  return problems;
}

/** A pack skill's description past {@link DESCRIPTION_MAX}, unless its pack is exempt. */
function descriptionCap(file: PackFile, exempt: readonly string[]): string[] {
  if (!/^skills\/[^/]+\/SKILL\.md$/.test(file.relPath) || exempt.includes(file.pack)) return [];
  const description = parseFrontmatter(file.text, file.relPath).frontmatter["description"];
  const length = typeof description === "string" ? description.length : 0;
  return length > DESCRIPTION_MAX
    ? [`${file.pack}/${file.relPath}: description is ${length} characters, over ${DESCRIPTION_MAX}`]
    : [];
}

/** Every per-file rule's problems over `files`, plus the companion rule over the set. */
function lint(files: readonly PackFile[], exempt: readonly string[] = []): string[] {
  return [
    ...files.flatMap((file) => [
      ...substitutionTokens(file),
      ...cliCalls(file),
      ...descriptionCap(file, exempt),
    ]),
    ...explicitOnlyCompanions(files),
  ];
}

// ── The real packs ────────────────────────────────────────────────────────

const realFiles: Promise<PackFile[]> = Promise.all(
  PACK_IDS.map((id) => readPackFiles(join(PACKS_ROOT, id), id)),
).then((perPack) => perPack.flat());

describe("pack lint — every file under packs/", () => {
  it("reads every pack, the first-party one among them, and each one's files", async () => {
    // Non-degenerate: the lint below runs over real text in every pack, not over an empty set.
    // TEST CHANGE, justified: `ops`, `product-audit` and `scaffold` were deleted in plan 018 file 2
    // (u8-retire-old-packs); `frontend` is the one first-party pack until u10 adds `production`.
    expect(PACK_IDS).toEqual(["frontend"]);
    const files = await realFiles;
    for (const id of PACK_IDS) {
      expect(files.filter((file) => file.pack === id).length, id).toBeGreaterThan(1);
    }
  });

  it("carries no substitution token, no CLI call, and every explicit-only skill its companion", async () => {
    const files = await realFiles;
    expect([
      ...files.flatMap((file) => [...substitutionTokens(file), ...cliCalls(file)]),
      ...explicitOnlyCompanions(files),
    ]).toEqual([]);
  });

  // TEST CHANGE, justified: the retiring packs' exemption and its expiry cases left with their
  // folders (plan 018 file 2, u8-retire-old-packs); every real pack skill is held to the cap with
  // no exemption, and the files read are shown to include skills, so the check is not vacuous.
  it("holds every pack skill's description to 250 characters, with no pack exempt", async () => {
    const files = await realFiles;
    expect(files.some((file) => /^skills\/[^/]+\/SKILL\.md$/.test(file.relPath))).toBe(true);
    expect(files.flatMap((file) => descriptionCap(file, []))).toEqual([]);
  });
});

// ── Made-up packs: each rule shown red ────────────────────────────────────

const tempDir = useTempDir("pack-lint");

/** A made-up pack written to the temp tree and read back the way the real packs are read. */
async function madeUp(name: string, files: Record<string, string>): Promise<PackFile[]> {
  return readPackFiles(await writeMadeUpPack(tempDir().dir, name, files), name);
}

/** A made-up skill whose body is `body`. */
function skillWith(body: string, description = "Acme fixture skill. Triggers when a fixture runs."): string {
  return `${madeUpArtifact("acme-lint", "skill", description)}\n${body}\n`;
}

const SKILL = "skills/st-acme-lint/SKILL.md";

describe("pack lint — each rule red on a made-up pack", () => {
  it("passes a made-up pack that names only .stamity/ paths and stamity- ids", async () => {
    const files = await madeUp("acme-clean", {
      [SKILL]: skillWith(
        [
          "Write the inventory to `.stamity/acme-inventory.md`; the `stamity-reviewer` agent reads it.",
          "The stamity-findings block stays as it is. Stamity, the product, is named in prose.",
          "```sh",
          "ls .stamity/runs",
          "```",
          "| Path | Owner |",
          "|---|---|",
          "| `.stamity/evidence/` | stamity-qa |",
        ].join("\n"),
      ),
    });

    expect(lint(files)).toEqual([]);
  });

  it.each([
    ["a well-formed token", "Pin it to ${STAMITY:VERSION}."],
    ["a malformed token", "Pin it to ${STAMITY:version without a brace."],
  ])("refuses %s", async (_, body) => {
    const files = await madeUp("acme-token", { [SKILL]: skillWith(body) });

    expect(lint(files)).toEqual([expect.stringMatching(/acme-token\/skills\/st-acme-lint\/SKILL\.md: carries a \$\{STAMITY:/)]);
  });

  it.each([
    ["an npx call", "Run `npx -y stamity sync` first.", /an npx call of stamity/],
    ["a scoped npx call", "Run npx -y @zomarit/stamity@1.16.0 init.", /an npx call of stamity/],
    ["the package name", "Install @zomarit/stamity beside it.", /the package name @zomarit\/stamity/],
    ["a fenced line", "```sh\nstamity --help\n```", /a fenced line opening on `stamity `/],
    ["a prompted fenced line", "~~~\n$ stamity doctor\n~~~", /a fenced line opening on `stamity `/],
    ["a table cell", "| Step | Call |\n|---|---|\n| one | `stamity --version` |", /a table cell opening on `stamity `/],
    ["a registered verb in prose", "Then the operator runs stamity check on the result.", /`stamity check`, a registered verb/],
  ])("refuses %s", async (_, body, reason) => {
    const files = await madeUp("acme-cli", { [SKILL]: skillWith(body) });

    expect(lint(files)).toEqual([expect.stringMatching(reason)]);
  });

  it("refuses an explicit-only skill that ships no hiding companion", async () => {
    const explicitOnly = madeUpArtifact("acme-lint", "skill", "Acme fixture.").replace(
      "load: on-demand",
      "load: on-demand\ndisable-model-invocation: true",
    );
    const bare = await madeUp("acme-explicit", { [SKILL]: explicitOnly });
    const wrong = await madeUp("acme-explicit-wrong", {
      [SKILL]: explicitOnly,
      "skills/st-acme-lint/agents/openai.yaml": "policy:\n  allow_implicit_invocation: true\n",
    });
    const right = await madeUp("acme-explicit-right", {
      [SKILL]: explicitOnly,
      "skills/st-acme-lint/agents/openai.yaml": "policy:\n  allow_implicit_invocation: false\n",
    });

    expect(lint(bare)).toEqual([expect.stringMatching(/acme-explicit\/skills\/st-acme-lint: declares `disable-model-invocation: true`/)]);
    expect(lint(wrong)).toEqual([expect.stringMatching(/ships no agents\/openai\.yaml/)]);
    expect(lint(right)).toEqual([]);
  });

  it("refuses a hiding companion beside a skill that does not declare itself explicit-only", async () => {
    const files = await madeUp("acme-hidden", {
      [SKILL]: madeUpArtifact("acme-lint", "skill", "Acme fixture."),
      "skills/st-acme-lint/agents/openai.yaml": "policy:\n  allow_implicit_invocation: false\n",
    });

    expect(lint(files)).toEqual([expect.stringMatching(/hides it from Codex's model, but SKILL\.md does not declare/)]);
  });

  it("refuses a 251-character description and passes a 250-character one", async () => {
    const over = await madeUp("acme-long", {
      [SKILL]: madeUpArtifact("acme-lint", "skill", "a".repeat(DESCRIPTION_MAX + 1)),
    });
    const at = await madeUp("acme-short", {
      [SKILL]: madeUpArtifact("acme-lint", "skill", "a".repeat(DESCRIPTION_MAX)),
    });

    expect(lint(over)).toEqual([expect.stringMatching(/description is 251 characters, over 250/)]);
    expect(lint(at)).toEqual([]);
  });

  it("exempts a pack from the cap only by its name, and none by default", async () => {
    const files = await madeUp("acme-retiring", {
      [SKILL]: madeUpArtifact("acme-lint", "skill", "a".repeat(DESCRIPTION_MAX + 1)),
    });

    expect(lint(files, ["acme-retiring"])).toEqual([]);
    // TEST CHANGE, justified: the retiring-pack list this passed is gone (u8-retire-old-packs);
    // the empty default is what every real pack now runs with.
    expect(lint(files)).toHaveLength(1);
  });
});
