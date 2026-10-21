import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { appendFile, cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { shownSkillRows, skillsListCharacters, CODEX_SKILLS_LIST_BUDGET_CHARS } from "../../src/adapters/codex.ts";
import { COMMANDS } from "../../src/cli.ts";
import { extractToolsFrontmatter, frontmatterField, parseFrontmatter } from "../../src/content/frontmatter.ts";
import { isFloorTag } from "../../src/content/tags.ts";
import { curatedPacks, deriveCatalog } from "../../src/pack/curated.ts";
import {
  checkDeclaredTools,
  checkFootprint,
  checkLifecycleScripts,
  checkMcpServerDefinitions,
  checkRuleActivation,
  enumeratePackContent,
  readPackManifest,
  scanPackBodies,
  verifyIntegrityMap,
  type PackManifest,
} from "../../src/pack/manifest.ts";
import { checkAgentCapabilities, checkPermissions } from "../../src/pack/permissions.ts";
import { lookupRetiredPack, type RetiredPack } from "../../src/pack/retired.ts";
import { computeAggregateContentSha } from "../../src/pack/trust.ts";
import type { Tool } from "../../src/types/core.ts";
import {
  filenameSlug,
  requireLoadClass,
  requireObsoleteWhen,
  walkAllMarkdown,
  type CorpusFile,
} from "../corpus/harness.ts";
import { runInProcess } from "../support/inProcess.ts";
import { madeUpArtifact, prose, writeMadeUpPack } from "../support/packFixtures.ts";
import { seedGitRepo } from "../support/repoFixtures.ts";
import { makeTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * One suite for every pack (plan 018, u17-pack-suite; REQ-PACK-012). The packs are enumerated
 * from `packs/*\/pack.json`, so a pack a fork adds is proven here with no edit, and each is held,
 * in-process, to:
 *
 *   - **Static:** a valid manifest named after its directory at the release version; its
 *     integrity map in both directions, each digest recomputed; the installer's ingress gates, as
 *     `planPackInstall` (`src/pack/install.ts`) runs them; the frontmatter contract, the two
 *     pass-through keys as booleans; first-party classes within commands and skills; names unique
 *     across the core and every pack in every class; no retired id; cross-references resolving
 *     against the core and every pack; no `floor:` tag; none of the leak gate's reserved names.
 *   - **Dynamic:** `add <id> -y` by catalog id, then `sync` and `check`, each exit 0, on each
 *     client alone and on all four; each shipped skill in the client's skills folder; on Codex,
 *     the shown skills list recomputed at 8,000 characters or under. One case adds every pack to
 *     the four-client set.
 *
 * Every probe is a function returning its problems, run over the real packs (expected `[]`) and
 * over a made-up pack that breaks it (expected to name the break), so none is green for want of
 * an input that could trip it. Made-up packs live in a temp tree: the checkout's `packs/` is never
 * written, since the install-smoke lane digests it.
 *
 * `ops`, `product-audit` and `scaffold` retire in Package 22 file 2; `ops` ships agents and
 * `product-audit` a rule, so the three are exempt from the class rule by name while their
 * directories exist, each exemption going red once its directory is gone.
 *
 * No mocks: the CLI runs in-process over real temp repositories, one template per client set
 * built on first use and copied per case.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKS_ROOT = join(REPO_ROOT, "packs");
const GATE_SCRIPT = join(REPO_ROOT, "scripts", "leak-gate.mjs");

/** Retiring packs, exempt from the first-party class rule while their directories exist. */
const RETIRING_PACKS: readonly string[] = ["ops", "product-audit", "scaffold"];

/** The content classes a first-party pack ships. */
const FIRST_PARTY_CLASSES: ReadonlySet<string> = new Set(["commands", "skills"]);

/** The client keys a skill head passes through, booleans only (REQ-PACK-006). */
const PASSTHROUGH_KEYS: readonly string[] = ["user-invocable", "disable-model-invocation"];

/** The pack ids under `root`: every directory holding a `pack.json`, sorted. */
function packIdsUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "pack.json")))
    .map((entry) => entry.name)
    .toSorted();
}

const PACK_IDS: readonly string[] = packIdsUnder(PACKS_ROOT);

const RELEASE_VERSION: string = (
  JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { version: string }
).version;

/** A defect message from whatever a gate threw. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Run `check`, keeping its throw as a problem rather than ending the probe. */
function collect(problems: string[], label: string, check: () => unknown): void {
  try {
    check();
  } catch (error) {
    problems.push(`${label}: ${messageOf(error)}`);
  }
}

/** The async form of {@link collect}. */
async function collectAsync(problems: string[], label: string, check: () => Promise<unknown>): Promise<void> {
  try {
    await check();
  } catch (error) {
    problems.push(`${label}: ${messageOf(error)}`);
  }
}

// ── Artifacts: one shape for the core and every pack ──────────────────────

type ArtifactClass = "commands" | "skills" | "agents" | "rules";

const TYPE_OF: Readonly<Record<ArtifactClass, string>> = {
  commands: "command",
  skills: "skill",
  agents: "agent",
  rules: "rule",
};

interface Artifact {
  /** `core`, or `pack <id>`. */
  owner: string;
  cls: ArtifactClass;
  /** The declared id, or the filename slug where none is declared. */
  id: string;
  /** The name it lands under in a client: the file or folder name. */
  emitted: string;
  file: CorpusFile;
}

/** The artifacts among `files`: top-level commands, agents and rules, and each skill's `SKILL.md`. */
function artifactsOf(owner: string, files: readonly CorpusFile[]): Artifact[] {
  return files.flatMap((file): Artifact[] => {
    const flat = /^(commands|agents|rules)\/([^/]+)\.md$/.exec(file.relPath);
    const skill = /^skills\/([^/]+)\/SKILL\.md$/.exec(file.relPath);
    const cls = flat !== null ? (flat[1] as ArtifactClass) : skill !== null ? "skills" : null;
    if (cls === null) return [];
    const declared = frontmatterField(file.parsed, "id");
    return [
      {
        owner,
        cls,
        id: typeof declared === "string" && declared !== "" ? declared : filenameSlug(file.relPath),
        emitted: flat !== null ? flat[2]! : skill![1]!,
        file,
      },
    ];
  });
}

interface LoadedPack {
  id: string;
  root: string;
  manifestRaw: string;
  /** Every markdown file, as the corpus harness reads it. */
  files: CorpusFile[];
  artifacts: Artifact[];
}

async function loadPack(root: string): Promise<LoadedPack> {
  const id = basename(root);
  const files = await walkAllMarkdown(root);
  return {
    id,
    root,
    manifestRaw: await readFile(join(root, "pack.json"), "utf8"),
    files,
    artifacts: artifactsOf(`pack ${id}`, files),
  };
}

/** Every regular file of a pack, `pack.json` included, as `{ relPath, text }`. */
async function everyFile(root: string): Promise<{ relPath: string; text: string }[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name))
      .toSorted()
      .map(async (absPath) => ({
        relPath: relative(root, absPath).split(sep).join("/"),
        text: await readFile(absPath, "utf8"),
      })),
  );
}

// ── Static probes ─────────────────────────────────────────────────────────

/** A valid manifest, named after its directory, at `version`. */
async function manifestProblems(pack: LoadedPack, version: string): Promise<string[]> {
  let manifest: PackManifest;
  try {
    manifest = await readPackManifest(pack.root);
  } catch (error) {
    return [`${pack.id}: pack.json does not validate: ${messageOf(error)}`];
  }
  const problems: string[] = [];
  if (manifest.name !== pack.id) {
    problems.push(`${pack.id}: pack.json names ${JSON.stringify(manifest.name)}, not its directory`);
  }
  if (manifest.version !== version) {
    problems.push(`${pack.id}: pack.json is at ${manifest.version}, not the release's ${version}`);
  }
  return problems;
}

/** The integrity map in both directions, each digest recomputed from the bytes on disk. */
async function integrityProblems(pack: LoadedPack): Promise<string[]> {
  const problems: string[] = [];
  const manifest = await readPackManifest(pack.root);
  const content = await enumeratePackContent(pack.root);
  const shipped = new Set(content.map((file) => file.relPath));
  const listed = Object.keys(manifest.integrity);
  for (const relPath of shipped) {
    if (!listed.includes(relPath)) problems.push(`${pack.id}: ships ${relPath} with no digest`);
  }
  for (const relPath of listed.filter((listedPath) => !shipped.has(listedPath))) {
    problems.push(`${pack.id}: lists ${relPath}, which it does not ship`);
  }
  const recomputed = await Promise.all(
    listed
      .filter((relPath) => shipped.has(relPath))
      .map(async (relPath) => {
        const bytes = await readFile(join(pack.root, ...relPath.split("/")));
        return { relPath, matches: createHash("sha256").update(bytes).digest("hex") === manifest.integrity[relPath] };
      }),
  );
  for (const { relPath } of recomputed.filter((row) => !row.matches)) {
    problems.push(`${pack.id}: ${relPath} does not hash to its digest`);
  }
  await collectAsync(problems, `${pack.id}: verifyIntegrityMap`, () =>
    verifyIntegrityMap(pack.root, manifest, content),
  );
  return problems;
}

/** The installer's ingress gates, in `planPackInstall`'s order. */
async function ingressProblems(pack: LoadedPack): Promise<string[]> {
  const problems: string[] = [];
  const manifest = await readPackManifest(pack.root);
  const files = await enumeratePackContent(pack.root);
  const agents = files
    .filter((file) => /^agents\/[^/]+\.md$/i.test(file.relPath))
    .map((file) => ({
      relPath: file.relPath,
      frontmatter: parseFrontmatter(readFileSync(file.absPath, "utf8"), file.relPath).frontmatter,
    }));
  const label = (gate: string): string => `${pack.id}: ${gate}`;
  await collectAsync(problems, label("lifecycle scripts"), () => checkLifecycleScripts(pack.root));
  await collectAsync(problems, label("body scan"), () => scanPackBodies(files));
  await collectAsync(problems, label("MCP servers"), () => checkMcpServerDefinitions(manifest, files));
  collect(problems, label("footprint"), () => checkFootprint(manifest, files));
  await collectAsync(problems, label("declared tools"), () => checkDeclaredTools(manifest, files));
  await collectAsync(problems, label("rule activation"), () => checkRuleActivation(manifest, files));
  collect(problems, label("permissions"), () => checkPermissions(manifest, files));
  collect(problems, label("agent capabilities"), () => checkAgentCapabilities(agents, manifest.permissions));
  return problems;
}

/** The authoring head every artifact carries, the two pass-through keys as booleans. */
function frontmatterProblems(pack: LoadedPack): string[] {
  const problems: string[] = [];
  for (const artifact of pack.artifacts) {
    const { file } = artifact;
    const where = `${pack.id}/${file.relPath}`;
    if (!file.parsed.hadFrontmatter) {
      problems.push(`${where}: no frontmatter`);
      continue;
    }
    const id = frontmatterField(file.parsed, "id");
    if (id !== filenameSlug(file.relPath)) {
      problems.push(`${where}: id ${JSON.stringify(id)} disagrees with its file name`);
    }
    if (frontmatterField(file.parsed, "type") !== TYPE_OF[artifact.cls]) {
      problems.push(`${where}: type must be ${TYPE_OF[artifact.cls]}`);
    }
    const description = frontmatterField(file.parsed, "description");
    if (typeof description !== "string" || description.trim() === "") {
      problems.push(`${where}: description must be a non-empty string`);
    } else if (/\b(?:you|your|yours|yourself)\b/i.test(description)) {
      problems.push(`${where}: description addresses the reader`);
    }
    const tags = frontmatterField(file.parsed, "tags");
    if (!Array.isArray(tags) || tags.length === 0 || tags.some((tag) => typeof tag !== "string")) {
      problems.push(`${where}: tags must be a non-empty array of strings`);
    }
    for (const key of PASSTHROUGH_KEYS) {
      const value = frontmatterField(file.parsed, key);
      if (value !== undefined && typeof value !== "boolean") {
        problems.push(`${where}: \`${key}\` must be a boolean, not ${JSON.stringify(value)}`);
      }
    }
    collect(problems, where, () => requireLoadClass(file, ["on-demand"]));
    collect(problems, where, () => requireObsoleteWhen(file));
    collect(problems, where, () => extractToolsFrontmatter(file.raw, file.relPath));
  }
  return problems;
}

/** Content classes outside commands and skills, unless the pack is exempt by name. */
async function classProblems(pack: LoadedPack, exempt: readonly string[]): Promise<string[]> {
  if (exempt.includes(pack.id)) return [];
  const classes = new Set((await enumeratePackContent(pack.root)).map((file) => file.contentClass));
  return [...classes]
    .filter((cls) => !FIRST_PARTY_CLASSES.has(cls))
    .toSorted()
    .map((cls) => `${pack.id}: ships ${cls}, outside the first-party classes (commands, skills)`);
}

/** The raw head of a markdown file: the text between its opening and closing `---`. */
function headOf(raw: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  return match === null ? "" : match[1]!;
}

/** A `floor:*` tag, or the marker anywhere in a head or the manifest. */
function floorProblems(pack: LoadedPack): string[] {
  const problems: string[] = [];
  for (const file of pack.files) {
    const tags = frontmatterField(file.parsed, "tags");
    for (const tag of Array.isArray(tags) ? tags : []) {
      if (typeof tag === "string" && isFloorTag(tag)) problems.push(`${pack.id}/${file.relPath}: tag ${tag}`);
    }
    if (headOf(file.raw).includes("floor:")) problems.push(`${pack.id}/${file.relPath}: floor: in its head`);
  }
  if (pack.manifestRaw.includes("floor:")) problems.push(`${pack.id}/pack.json: floor: in the manifest`);
  return problems;
}

interface ReservedRule {
  id: string;
  token: string;
}

/** The leak gate's reserved-name rules, read from the gate so this suite never spells one. */
async function reservedRules(): Promise<ReservedRule[]> {
  const source = await readFile(GATE_SCRIPT, "utf8");
  const entry = /\{\s*id:\s*'([^']+)',\s*parts:\s*\[([^\]]*)\]/g;
  return [...source.matchAll(entry)].map((match) => ({
    id: match[1] ?? "",
    token: [...(match[2] ?? "").matchAll(/'([^']*)'/g)].map((part) => part[1] ?? "").join(""),
  }));
}

/** A reserved name in any path or byte the pack ships. */
async function reservedNameProblems(pack: LoadedPack, rules: readonly ReservedRule[]): Promise<string[]> {
  const problems: string[] = [];
  for (const { relPath, text } of await everyFile(pack.root)) {
    for (const rule of rules) {
      const pattern = new RegExp(rule.token, "i");
      if (pattern.test(relPath) || pattern.test(text)) {
        problems.push(`${pack.id}/${relPath}: matches reserved-name rule ${rule.id}`);
      }
    }
  }
  return problems;
}

/** Both prefixes: commands and skills are `st-<id>`, agents and rules `stamity-<id>`. */
const COMMAND_MENTION = /\/(?:stamity|st)-([a-z0-9][a-z0-9-]*)/g;
const BARE_MENTION = /(?<![/A-Za-z0-9_-])(?:stamity|st)-([a-z0-9][a-z0-9-]*)/g;

/** Prose only: fenced blocks hold examples, not references. */
function stripFencedBlocks(body: string): string {
  return body
    .split("```")
    .filter((_, index) => index % 2 === 0)
    .join(" ");
}

/**
 * Every `/st-<id>` mention resolves to a command, and every bare `st-<id>` or `stamity-<id>` to
 * an artifact, in the core or any pack (the scaffold suite's resolver, widened the same way).
 */
function crossReferenceProblems(
  pack: LoadedPack,
  corpus: readonly CorpusFile[],
  artifacts: readonly Artifact[],
): string[] {
  const declaredId = (file: CorpusFile): string => {
    const id = frontmatterField(file.parsed, "id");
    return typeof id === "string" && id.trim() !== "" ? id : filenameSlug(file.relPath);
  };
  const known = new Set(corpus.filter((file) => file.parsed.hadFrontmatter).map(declaredId));
  const commands = new Set(artifacts.filter((artifact) => artifact.cls === "commands").map((artifact) => artifact.id));
  const problems: string[] = [];
  for (const file of pack.files) {
    const text = stripFencedBlocks(file.parsed.body);
    for (const match of text.matchAll(COMMAND_MENTION)) {
      if (!commands.has(match[1] ?? "")) {
        problems.push(`${pack.id}/${file.relPath}: ${match[0]} resolves to no shipped command`);
      }
    }
    for (const match of text.matchAll(BARE_MENTION)) {
      if (!known.has(match[1] ?? "")) {
        problems.push(`${pack.id}/${file.relPath}: mentions ${match[0]}, which nothing answers to`);
      }
    }
  }
  return problems;
}

/**
 * A name two artifacts hold: one id in one class, one emitted name in one class, or one emitted
 * `st-<x>` across commands and skills, which land in the same `.agents/skills/` folder.
 */
function nameClashes(artifacts: readonly Artifact[]): string[] {
  const groups = new Map<string, Artifact[]>();
  const add = (key: string, artifact: Artifact): void => {
    groups.set(key, [...(groups.get(key) ?? []), artifact]);
  };
  for (const artifact of artifacts) {
    add(`${artifact.cls} id "${artifact.id}"`, artifact);
    const space = artifact.cls === "commands" || artifact.cls === "skills" ? "commands and skills" : artifact.cls;
    add(`${space} emitted name "${artifact.emitted}"`, artifact);
  }
  return [...groups]
    .filter(([, held]) => held.length > 1)
    .map(
      ([key, held]) =>
        `${key} is held by ${held.map((artifact) => `${artifact.owner} (${artifact.cls}/${artifact.file.relPath})`).join(", ")}`,
    );
}

/** Pack ids a release retired. */
function retiredProblems(ids: readonly string[], map?: readonly RetiredPack[]): string[] {
  return ids
    .filter((id) => lookupRetiredPack(id, map) !== undefined)
    .map((id) => `${id}: a retired pack id is a pack directory again`);
}

/** Pack directories the catalog does not list, and catalog ids with no pack directory. */
function enumerationProblems(dirIds: readonly string[], catalogIds: readonly string[]): string[] {
  return [
    ...dirIds.filter((id) => !catalogIds.includes(id)).map((id) => `${id}: a pack directory the catalog does not list`),
    ...catalogIds.filter((id) => !dirIds.includes(id)).map((id) => `${id}: catalogued with no pack directory`),
  ];
}

// ── The real packs ────────────────────────────────────────────────────────

const corePromise: Promise<CorpusFile[]> = walkAllMarkdown();
const packsPromise: Promise<LoadedPack[]> = Promise.all(PACK_IDS.map((id) => loadPack(join(PACKS_ROOT, id))));

async function universe(extra: readonly LoadedPack[] = []): Promise<{ files: CorpusFile[]; artifacts: Artifact[] }> {
  const [core, packs] = await Promise.all([corePromise, packsPromise]);
  const all = [...packs, ...extra];
  return {
    files: [...core, ...all.flatMap((pack) => pack.files)],
    artifacts: [...artifactsOf("core", core), ...all.flatMap((pack) => pack.artifacts)],
  };
}

async function realPack(id: string): Promise<LoadedPack> {
  const pack = (await packsPromise).find((candidate) => candidate.id === id);
  if (pack === undefined) throw new Error(`packs/${id} was not loaded`);
  return pack;
}

describe("every pack — enumeration", () => {
  it("enumerates the packs from packs/*/pack.json, equal to the catalog's ids", () => {
    // Non-degenerate: the four first-party packs this file was written against are all here.
    expect(PACK_IDS).toEqual(expect.arrayContaining(["frontend", "ops", "product-audit", "scaffold"]));
    expect(enumerationProblems(PACK_IDS, curatedPacks().map((entry) => entry.id))).toEqual([]);
  });

  it("holds no retired id among the pack directories", () => {
    expect(retiredProblems(PACK_IDS)).toEqual([]);
  });

  it.each(RETIRING_PACKS)("the class exemption for %s holds only while its directory exists", (id) => {
    expect(
      PACK_IDS,
      `packs/${id} is gone: drop "${id}" from RETIRING_PACKS in test/packs/packs.test.ts, and from lint.test.ts's list if it is there`,
    ).toContain(id);
  });
});

describe.each(PACK_IDS)("pack %s — static", (id) => {
  it("carries a valid manifest named after its directory, at the release version", async () => {
    expect(await manifestProblems(await realPack(id), RELEASE_VERSION)).toEqual([]);
  });

  it("lists every shipped file in its integrity map and nothing else, each digest recomputed", async () => {
    expect(await integrityProblems(await realPack(id))).toEqual([]);
  });

  it("passes the installer's ingress gates", async () => {
    expect(await ingressProblems(await realPack(id))).toEqual([]);
  });

  it("carries the frontmatter contract on every artifact", async () => {
    const pack = await realPack(id);
    expect(pack.artifacts.length, "the pack ships no artifact").toBeGreaterThan(0);
    expect(frontmatterProblems(pack)).toEqual([]);
  });

  it("ships first-party classes only, the retiring packs exempt", async () => {
    expect(await classProblems(await realPack(id), RETIRING_PACKS)).toEqual([]);
  });

  it("resolves every cross-reference against the core and every pack", async () => {
    const { files, artifacts } = await universe();
    expect(crossReferenceProblems(await realPack(id), files, artifacts)).toEqual([]);
  });

  it("carries no floor: tag", async () => {
    expect(floorProblems(await realPack(id))).toEqual([]);
  });

  it("carries none of the leak gate's reserved names", async () => {
    const rules = await reservedRules();
    expect(rules.length).toBeGreaterThanOrEqual(4);
    expect(rules.every((rule) => rule.token !== "")).toBe(true);
    expect(await reservedNameProblems(await realPack(id), rules)).toEqual([]);
  });
});

describe("every pack — names", () => {
  it("holds every name unique across the core and every pack, in every class", async () => {
    const { artifacts } = await universe();
    // Non-degenerate: the core's touchpoints and every pack's artifacts are in the set.
    expect(artifacts.filter((artifact) => artifact.owner === "core" && artifact.cls === "commands")).toHaveLength(9);
    for (const id of PACK_IDS) expect(artifacts.some((artifact) => artifact.owner === `pack ${id}`), id).toBe(true);
    expect(nameClashes(artifacts)).toEqual([]);
  });

  it("needs the class exemption only for the retiring packs", async () => {
    const flagged = await Promise.all(
      (await packsPromise).map(async (pack) => ((await classProblems(pack, [])).length > 0 ? pack.id : null)),
    );
    expect(flagged.filter((id) => id !== null && !RETIRING_PACKS.includes(id))).toEqual([]);
  });
});

// ── Made-up packs: each static probe shown red ────────────────────────────

let suite: TempDirHandle;
let counter = 0;

beforeAll(async () => {
  suite = await makeTempDir("pack-suite");
});

afterAll(async () => {
  await suite.cleanup();
});

/** A fresh directory under the suite's temp tree. */
function freshDir(label: string): string {
  counter += 1;
  return suite.path(label, String(counter));
}

/** A made-up pack, written to the temp tree, loaded as the real packs are. */
async function madeUp(name: string, files: Record<string, string>): Promise<LoadedPack> {
  return loadPack(await writeMadeUpPack(freshDir("made-up"), name, files));
}

const ACME_SKILL = "skills/st-acme-lint/SKILL.md";

/** A made-up skill head with `extra` lines spliced in after `load:`. */
function skillWith(extra: string, description = "Acme lint steps. Triggers when a lint runs."): string {
  return madeUpArtifact("acme-lint", "skill", description).replace("load: on-demand", `load: on-demand\n${extra}`);
}

describe("every pack — each static probe red on a made-up pack", () => {
  it("manifest: a version off the release and a name off the directory", async () => {
    const pack = await madeUp("acme-demo", { [ACME_SKILL]: madeUpArtifact("acme-lint", "skill", "Acme.") });
    const moved = join(dirname(pack.root), "acme-moved");
    await rename(pack.root, moved);

    expect(await manifestProblems(await loadPack(moved), RELEASE_VERSION)).toEqual([
      expect.stringMatching(/acme-moved: pack\.json names "acme-demo", not its directory/),
      expect.stringMatching(new RegExp(`acme-moved: pack\\.json is at 1\\.0\\.0, not the release's ${RELEASE_VERSION.replaceAll(".", "\\.")}`)),
    ]);
  });

  it("integrity: an unlisted file, a listed file gone, and a file edited after its digest", async () => {
    const pack = await madeUp("acme-demo", {
      [ACME_SKILL]: madeUpArtifact("acme-lint", "skill", "Acme."),
      "skills/st-acme-gone/SKILL.md": madeUpArtifact("acme-gone", "skill", "Acme."),
    });
    await writeFile(join(pack.root, "skills", "st-acme-lint", "notes.md"), "unlisted\n", "utf8");
    await rm(join(pack.root, "skills", "st-acme-gone"), { recursive: true });
    await appendFile(join(pack.root, ...ACME_SKILL.split("/")), "edited\n", "utf8");

    const problems = await integrityProblems(pack);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/ships skills\/st-acme-lint\/notes\.md with no digest/),
        expect.stringMatching(/lists skills\/st-acme-gone\/SKILL\.md, which it does not ship/),
        expect.stringMatching(/skills\/st-acme-lint\/SKILL\.md does not hash to its digest/),
        expect.stringMatching(/verifyIntegrityMap/),
      ]),
    );
  });

  it("ingress: a skill addressing a tool the manifest does not declare", async () => {
    const pack = await madeUp("acme-demo", { [ACME_SKILL]: skillWith("tools: [cursor]") });

    expect(await ingressProblems(pack)).toEqual([expect.stringMatching(/acme-demo: declared tools: .*cursor/)]);
  });

  it("frontmatter: a pass-through key that is not a boolean, a type off its class, and no trigger", async () => {
    const pack = await madeUp("acme-demo", {
      [ACME_SKILL]: skillWith('user-invocable: "no"').replace("type: skill", "type: command").replace(/obsolete_when: .*\n/, ""),
    });

    expect(frontmatterProblems(pack)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/`user-invocable` must be a boolean, not "no"/),
        expect.stringMatching(/type must be skill/),
        expect.stringMatching(/obsolete_when/),
      ]),
    );
    const clean = await madeUp("acme-clean", { [ACME_SKILL]: skillWith("user-invocable: false") });
    expect(frontmatterProblems(clean)).toEqual([]);
  });

  it("classes: an agent in a pack that is not exempt, cleared by naming the pack exempt", async () => {
    const pack = await madeUp("acme-demo", {
      [ACME_SKILL]: madeUpArtifact("acme-lint", "skill", "Acme."),
      "agents/stamity-acme.md": madeUpArtifact("acme", "agent", "Acme agent."),
    });

    expect(await classProblems(pack, RETIRING_PACKS)).toEqual([
      expect.stringMatching(/acme-demo: ships agents, outside the first-party classes/),
    ]);
    expect(await classProblems(pack, ["acme-demo"])).toEqual([]);
  });

  it("names: a skill taking a core skill's folder, and a command beside a skill of one name", async () => {
    const pack = await madeUp("acme-demo", {
      "skills/st-verify/SKILL.md": madeUpArtifact("verify", "skill", "Acme verify."),
      "commands/st-acme-drill.md": madeUpArtifact("acme-drill", "command", "Acme drill."),
      "skills/st-acme-drill/SKILL.md": madeUpArtifact("acme-drill", "skill", "Acme drill steps."),
    });
    const { artifacts } = await universe([pack]);

    expect(nameClashes(artifacts)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^skills id "verify" is held by core .*, pack acme-demo/),
        expect.stringMatching(/^commands and skills emitted name "st-acme-drill" is held by pack acme-demo \(commands\/.*pack acme-demo \(skills\//),
      ]),
    );
  });

  it("retired: a pack directory under a retired id", () => {
    const map: RetiredPack[] = [{ id: "acme-old", lastShippedIn: "1.0.0", pins: [], parts: [] }];

    expect(retiredProblems(["acme-demo", "acme-old"], map)).toEqual(["acme-old: a retired pack id is a pack directory again"]);
  });

  it("cross-references: a touchpoint and an artifact nothing answers to", async () => {
    const pack = await madeUp("acme-demo", {
      [ACME_SKILL]: `${madeUpArtifact("acme-lint", "skill", "Acme.")}\nHand off to /st-acme-missing, then read st-acme-ghost.\n\n\`\`\`\nst-acme-example stays an example\n\`\`\`\n`,
    });
    const { files, artifacts } = await universe([pack]);

    expect(crossReferenceProblems(pack, files, artifacts)).toEqual([
      expect.stringMatching(/\/st-acme-missing resolves to no shipped command/),
      expect.stringMatching(/mentions st-acme-ghost, which nothing answers to/),
    ]);
  });

  it("floor: a floor:* tag in a skill head", async () => {
    const pack = await madeUp("acme-demo", {
      [ACME_SKILL]: madeUpArtifact("acme-lint", "skill", "Acme.").replace("tags: [orchestration]", "tags: [orchestration, floor:security]"),
    });

    expect(floorProblems(pack)).toEqual([
      expect.stringMatching(/tag floor:security/),
      expect.stringMatching(/floor: in its head/),
    ]);
  });

  it("reserved names: a body carrying one, built from the gate's own parts", async () => {
    const [rule] = await reservedRules();
    const pack = await madeUp("acme-demo", {
      [ACME_SKILL]: `${madeUpArtifact("acme-lint", "skill", "Acme.")}\nAs the ${rule!.token} notes said.\n`,
    });

    expect(await reservedNameProblems(pack, [rule!])).toEqual([
      `acme-demo/${ACME_SKILL}: matches reserved-name rule ${rule!.id}`,
    ]);
  });

  it("enumeration: a pack directory a fork adds is enumerated and catalogued with no edit", async () => {
    const root = freshDir("fork-packs");
    const dir = await writeMadeUpPack(root, "acme-fork", { [ACME_SKILL]: madeUpArtifact("acme-lint", "skill", "Acme.") });
    await writeFile(
      join(dir, "pack.json"),
      (await readFile(join(dir, "pack.json"), "utf8")).replace('"version"', '"description": "Acme fork pack.",\n  "version"'),
      "utf8",
    );
    const { integrity } = await readPackManifest(dir);

    expect(packIdsUnder(root)).toEqual(["acme-fork"]);
    expect(deriveCatalog(root, { "acme-fork": computeAggregateContentSha(integrity) }).map((entry) => entry.id)).toEqual([
      "acme-fork",
    ]);
    // Red: the equality probe, run over the fork's packs root against the bundled catalog, names
    // the fork's directory as uncatalogued and every bundled id as having no directory there.
    const bundled = curatedPacks().map((entry) => entry.id);
    expect(bundled.length).toBeGreaterThan(0);
    expect(enumerationProblems(packIdsUnder(root), bundled)).toEqual([
      "acme-fork: a pack directory the catalog does not list",
      ...bundled.map((id) => `${id}: catalogued with no pack directory`),
    ]);
  });
});

// ── Dynamic: add, sync and check, in-process ──────────────────────────────

const CLIENT_SETS: readonly (readonly Tool[])[] = [
  ["claude"],
  ["cursor"],
  ["codex"],
  ["copilot"],
  ["claude", "cursor", "copilot", "codex"],
];

/** A case may build its template first: an init plus its own verbs. */
const CASE_TIMEOUT = 90_000;

interface CliRun {
  code: number;
  output: string;
}

async function cli(cwd: string, argv: readonly string[]): Promise<CliRun> {
  const result = await runInProcess(COMMANDS, argv, { cwd });
  return { code: result.code, output: `${result.stdout}\n${result.stderr}` };
}

const templates = new Map<string, Promise<string>>();

async function buildTemplate(key: string, tools: readonly Tool[]): Promise<string> {
  const repo = suite.path("templates", key);
  await mkdir(repo, { recursive: true });
  await seedGitRepo(repo);
  const setup = await cli(repo, ["init", "-y", "--tools", tools.join(",")]);
  if (setup.code !== 0) throw new Error(`template ${key} failed to set up: ${setup.output.slice(0, 1200)}`);
  return repo;
}

/** A fresh copy of the once-built template repository for `tools`. */
async function freshRepo(tools: readonly Tool[]): Promise<string> {
  const key = tools.join("-");
  let pending = templates.get(key);
  if (pending === undefined) {
    pending = buildTemplate(key, tools);
    templates.set(key, pending);
  }
  const repo = freshDir("cases");
  await cp(await pending, repo, { recursive: true });
  return repo;
}

/** One verb's problems: none on exit 0, else its exit code and what it said. */
async function verbStep(repo: string, argv: readonly string[]): Promise<string[]> {
  const run = await cli(repo, argv);
  return run.code === 0 ? [] : [`\`${argv.join(" ")}\` exited ${run.code}: ${run.output.slice(0, 1500)}`];
}

/** The skills folders a client set reads: Claude Code its own, the other three the shared tree. */
function skillFolders(tools: readonly Tool[]): string[] {
  return [
    ...(tools.includes("claude") ? [".claude/skills"] : []),
    ...(tools.some((tool) => tool !== "claude") ? [".agents/skills"] : []),
  ];
}

/** The skill folders `packRoot` ships. */
async function shippedSkills(packRoot: string): Promise<string[]> {
  return (await enumeratePackContent(packRoot))
    .map((file) => /^skills\/([^/]+)\/SKILL\.md$/.exec(file.relPath)?.[1])
    .filter((folder): folder is string => folder !== undefined)
    .toSorted();
}

/** Each shipped skill's `SKILL.md` in each skills folder the client set reads. */
function missingSkills(repo: string, tools: readonly Tool[], skills: readonly string[]): string[] {
  return skillFolders(tools).flatMap((folder) =>
    skills
      .filter((skill) => !existsSync(join(repo, folder, skill, "SKILL.md")))
      .map((skill) => `${folder}/${skill}/SKILL.md is missing after sync`),
  );
}

/** The skills list Codex would show, recomputed from the shared tree on disk. */
async function codexList(repo: string): Promise<number> {
  const root = join(repo, ".agents", "skills");
  if (!existsSync(root)) return 0;
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const rows = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const absPath = join(entry.parentPath, entry.name);
        return {
          path: relative(repo, absPath).split(sep).join("/"),
          content: await readFile(absPath, "utf8"),
        };
      }),
  );
  return skillsListCharacters(shownSkillRows(rows));
}

async function codexListProblems(repo: string): Promise<string[]> {
  const total = await codexList(repo);
  return total > CODEX_SKILLS_LIST_BUDGET_CHARS
    ? [`Codex's shown skills list is ${total} characters, over ${CODEX_SKILLS_LIST_BUDGET_CHARS}`]
    : [];
}

/**
 * The whole dynamic proof for one setup: each `add` argv, then `sync`, then `check`, stopping at
 * the first verb that fails; then the skills on disk, and on Codex the list.
 */
async function prove(
  repo: string,
  tools: readonly Tool[],
  adds: readonly (readonly string[])[],
  skills: readonly string[],
): Promise<string[]> {
  for (const argv of [...adds, ["sync"], ["check"]]) {
    // oxlint-disable-next-line no-await-in-loop -- each verb runs over the repository the previous one left
    const problems = await verbStep(repo, argv);
    if (problems.length > 0) return problems;
  }
  return [
    ...missingSkills(repo, tools, skills),
    ...(tools.includes("codex") ? await codexListProblems(repo) : []),
  ];
}

const SETS = CLIENT_SETS.map((tools) => [tools.join(","), tools] as const);

describe.each(PACK_IDS)("pack %s — add, sync and check", (id) => {
  it.each(SETS)(
    "tools=%s: each exits 0, its skills land, and Codex's list fits",
    async (_, tools) => {
      const repo = await freshRepo(tools);
      expect(await prove(repo, tools, [["add", id, "-y"]], await shippedSkills(join(PACKS_ROOT, id)))).toEqual([]);
    },
    CASE_TIMEOUT,
  );
});

describe("every pack at once", () => {
  it(
    "tools=claude,cursor,copilot,codex: every pack adds, syncs and checks in one repository",
    async () => {
      const tools = CLIENT_SETS.at(-1)!;
      const repo = await freshRepo(tools);
      const skills = (await Promise.all(PACK_IDS.map((id) => shippedSkills(join(PACKS_ROOT, id))))).flat();
      // Non-degenerate: the set ships skills, and the list it measures holds the core's and theirs.
      expect(skills.length).toBeGreaterThan(0);

      expect(await prove(repo, tools, PACK_IDS.map((id) => ["add", id, "-y"]), skills)).toEqual([]);
      expect(await codexList(repo)).toBeGreaterThan(0);
    },
    CASE_TIMEOUT,
  );
});

describe("add, sync and check — each step red on a made-up pack", () => {
  const LINT_PACK: Record<string, string> = {
    [ACME_SKILL]: madeUpArtifact("acme-lint", "skill", "Acme lint steps. Triggers when a lint runs."),
  };

  /** `add <dir> --allow-untrusted -y`: a made-up pack carries no trust basis. */
  function addMadeUp(dir: string): string[] {
    return ["add", dir, "--allow-untrusted", "-y"];
  }

  it(
    "add: a pack skill taking the core's st-verify folder",
    async () => {
      const repo = await freshRepo(["cursor"]);
      const dir = await writeMadeUpPack(freshDir("made-up"), "acme-demo", {
        "skills/st-verify/SKILL.md": madeUpArtifact("verify", "skill", "Acme verify."),
      });

      expect(await prove(repo, ["cursor"], [addMadeUp(dir)], ["st-verify"])).toEqual([
        expect.stringMatching(/^`add .* --allow-untrusted -y` exited 1: /),
      ]);
    },
    CASE_TIMEOUT,
  );

  it(
    "sync: an overlay on the made-up pack's skill",
    async () => {
      const repo = await freshRepo(["cursor"]);
      const dir = await writeMadeUpPack(freshDir("made-up"), "acme-demo", LINT_PACK);
      expect(await verbStep(repo, addMadeUp(dir))).toEqual([]);
      const overlay = join(repo, ".stamity", "overrides", "skills", "acme-lint", "SKILL.customize.md");
      await mkdir(dirname(overlay), { recursive: true });
      await writeFile(overlay, "Escalate within the hour.\n", "utf8");

      expect(await prove(repo, ["cursor"], [], ["st-acme-lint"])).toEqual([expect.stringMatching(/^`sync` exited 1: /)]);
    },
    CASE_TIMEOUT,
  );

  it(
    "check: the made-up pack's installed copy edited after the install",
    async () => {
      const repo = await freshRepo(["cursor"]);
      const dir = await writeMadeUpPack(freshDir("made-up"), "acme-demo", LINT_PACK);
      expect(await prove(repo, ["cursor"], [addMadeUp(dir)], ["st-acme-lint"])).toEqual([]);
      await appendFile(join(repo, ".stamity", "packs", "acme-demo", ...ACME_SKILL.split("/")), "edited\n", "utf8");

      expect(await verbStep(repo, ["check"])).toEqual([expect.stringMatching(/^`check` exited [1-9]: /)]);
    },
    CASE_TIMEOUT,
  );

  it.each(SETS.filter(([, tools]) => tools.length === 1))(
    "skills: tools=%s, the made-up pack's skill folder removed after the sync",
    async (_, tools) => {
      const repo = await freshRepo(tools);
      const dir = await writeMadeUpPack(freshDir("made-up"), "acme-demo", LINT_PACK);
      expect(await prove(repo, tools, [addMadeUp(dir)], ["st-acme-lint"])).toEqual([]);
      await Promise.all(skillFolders(tools).map((folder) => rm(join(repo, folder, "st-acme-lint"), { recursive: true })));

      expect(missingSkills(repo, tools, ["st-acme-lint"])).toEqual([
        `${skillFolders(tools)[0]}/st-acme-lint/SKILL.md is missing after sync`,
      ]);
    },
    CASE_TIMEOUT,
  );

  it(
    "Codex's list: nine 900-character skills, synced where no fit check runs, measured over 8,000",
    async () => {
      // Cursor reads the shared tree Codex reads and runs no Codex fit check, so the pack lands
      // and the recomputed list is what Codex would show once it is selected. Nine, because the
      // pack's rows alone pass 8,000: Cursor's tree holds no projected rule-skills, so the core's
      // share there is smaller than on Codex.
      const repo = await freshRepo(["cursor"]);
      const dir = await writeMadeUpPack(
        freshDir("made-up"),
        "acme-demo",
        Object.fromEntries(
          [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`skills/st-acme-skill-${n}/SKILL.md`, madeUpArtifact(`acme-skill-${n}`, "skill", prose(900, `skill ${n}`))]),
        ),
      );
      expect(await prove(repo, ["cursor"], [addMadeUp(dir)], [])).toEqual([]);

      expect(await codexListProblems(repo)).toEqual([expect.stringMatching(/^Codex's shown skills list is \d+ characters, over 8000$/)]);
    },
    CASE_TIMEOUT,
  );
});
