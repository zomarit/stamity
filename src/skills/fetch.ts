import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isPlainObject, parseYamlStrict } from "../config/parse.ts";
import { buildContentIndex, type PackContentRoot } from "../content/catalog.ts";
import { parseFrontmatter } from "../content/frontmatter.ts";
import { checkUserArtifact, discoverUserContent, scanUserSkillSupportFiles, SKILL_FILE } from "../content/userContent.ts";
import { toSpecFrontmatter } from "../emit/skillsProjection.ts";
import { assertWriteTargetContained } from "../merge/atomicWrite.ts";
import {
  checkFootprint,
  enumeratePackContent,
  scanPackBodies,
  verifyIntegrityMap,
  type PackContentFile,
  type PackManifest,
} from "../pack/manifest.ts";
import { assertSafePackRelPath } from "../pack/permissions.ts";
import { computeAggregateContentSha } from "../pack/trust.ts";
import { isRunId, RECORD_FILE, RECORD_HEAD_READ_BYTES, RUNS_SEGMENTS, runRelPath } from "../runs/layout.ts";
import { readRecordHead } from "../runs/resumeCard.ts";
import { EngineError } from "../types/errors.ts";
import { ENGINE_CONTENT_PREFIXES, STATE_DIR, stripEngineContentPrefix } from "../types/markers.ts";
import { GIT_FETCH_TIMEOUT_MS, runGit, type GitOutcome, type WorktreeGitRunner } from "../worktree/git.ts";
import { carriesScripts } from "./scriptDetect.ts";
import { isSkillSlug, type SkillSource } from "./sources.ts";

/**
 * A skill copied in from a trusted source, pinned and scanned (REQ-FLOW-180): `stamity skill add`'s engine.
 *
 * The fetch is one shallow `git fetch` of the pinned commit and the named tag into a bare repository inside a new,
 * empty temporary folder outside the checkout, removed on every exit. Nothing the fetched repository holds is run:
 * no checkout (so no attribute filter or line-ending rewrite), no hooks (`core.hooksPath` points at an empty folder),
 * `transfer.fsckObjects` on, and each file read as raw blob bytes with `git unpack-file`. The tag must peel to the
 * pinned commit. The skill's folder is read from git's own tree listing, so a link or a nested repository is refused
 * there, before any byte lands; every path is checked, the count and byte caps hold before a blob is read.
 *
 * The bytes are then judged where a copied skill will sit, in a staging tree inside the temporary folder: the script
 * signals (refused unless the source allows scripts), the pack walk's text-only refusals (when it does not), the
 * aggregate against `--sha256`, the artifact gate on `SKILL.md`, the block deny-scan of every support file and the
 * pack body scan of every file. Only then is the copy landed, under `.stamity/overrides/skills/<name>/` (a held path),
 * re-verified byte for byte, and its origin record written to `.stamity/skills/<name>.origin.json`.
 */

/** Where origin records live, from the project root. */
const SKILL_ORIGIN_DIR = `${STATE_DIR}/skills`;

/** Where a copied skill lands, from the project root: the override tree's skills class. */
const SKILL_COPY_DIR = `${STATE_DIR}/overrides/skills`;

const COMMIT_SHAPE = /^[0-9a-f]{40}$/;
const SHA256_SHAPE = /^[0-9a-f]{64}$/;
/** A tag as a plain ref name: words of letters, digits, `.`, `_`, `+`, `-`, joined by single slashes. */
const TAG_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9][A-Za-z0-9._+-]*)*$/;
const MAX_TAG_LENGTH = 128;
/** The first bytes of a file read for a `#!` line. */
const HEAD_BYTES = 512;
/** Names Windows opens as devices, refused as any path segment's stem. */
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i;
/**
 * `SKILL.md` head keys that grant tools or permissions in a client's projection. The projection keeps the Agent Skills
 * spec's six keys and two boolean client keys at the top level and hoists every other key under `metadata`, where no
 * client reads it (`../emit/skillsProjection.ts`, `toSpecFrontmatter`); of the keys it keeps, `allowed-tools` is the one
 * a client reads as a grant (Claude Code runs the listed tools unasked while the skill is active). A copy carrying one
 * is held to the same trust as a script: refused unless the source allows scripts, and named when it does.
 */
const TOOL_GRANT_KEYS: readonly string[] = ["allowed-tools"];

/**
 * Codex's companion beside a `SKILL.md` (`../emit/skillsProjection.ts`, `TOUCHPOINT_POLICY_FILE`), in either YAML
 * extension and matched in any case, since a case-insensitive disk opens `Agents/OpenAI.yaml` as the same file. A
 * client may honour what it declares (tool dependencies, an MCP server to start), so it is held to the same trust as a
 * script (amended 2026-11-09, skills lens r2), and the check fails closed until Codex's docs say otherwise: only the
 * keys below, which name how the skill is shown and whether it may be invoked implicitly, pass from a source that does
 * not allow scripts, each with a scalar value of its kind.
 */
const COMPANION_PATHS: ReadonlySet<string> = new Set(["agents/openai.yaml", "agents/openai.yml"]);
const COMPANION_KEYS: Readonly<Record<string, Readonly<Record<string, "string" | "boolean">>>> = {
  interface: { display_name: "string", short_description: "string", icon_small: "string", icon_large: "string", brand_color: "string", default_prompt: "string" },
  policy: { allow_implicit_invocation: "boolean" },
};

/** One file of a copied skill, as its origin record lists it. */
interface SkillOriginFile {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

/** `.stamity/skills/<name>.origin.json`. */
interface SkillOrigin {
  readonly name: string;
  readonly source: { readonly id: string; readonly repo: string };
  readonly version: string;
  readonly commit: string;
  readonly aggregateSha256: string;
  readonly files: readonly SkillOriginFile[];
  /** The script signals found, each `<path>: <reason>`; empty for a text-only skill. */
  readonly scripts: readonly string[];
  readonly engineVersion: string;
  readonly fetchedAt: string;
}

export interface AddSkillRequest {
  /** The project root. */
  readonly root: string;
  readonly source: SkillSource;
  readonly name: string;
  /** The tag that must peel to {@link commit}. */
  readonly version: string;
  /** The pinned commit, 40 hex digits. */
  readonly commit: string;
  /** The aggregate the person expects, compared when given. */
  readonly sha256?: string | undefined;
  readonly engineVersion: string;
  readonly now: Date;
  /** Fetch and judge, land nothing. */
  readonly dryRun?: boolean;
  /** Where the temporary folder is made; the system's by default. It must lie outside the root. */
  readonly tempParent?: string;
  /** The git seam; the real git by default. */
  readonly run?: WorktreeGitRunner;
  /**
   * The installed packs' content roots, read as `validate` reads them (`../cli/commands/validate.ts`,
   * `installedPackRoots`); none by default. A name a pack skill holds is refused as a bundled one is.
   */
  readonly packRoots?: readonly PackContentRoot[];
}

export interface AddedSkill {
  readonly origin: SkillOrigin;
  /** The copy and the record, from the root. */
  readonly copyPath: string;
  readonly originPath: string;
  /** False on a dry run. */
  readonly written: boolean;
  /** The tool-granting `SKILL.md` head keys the copy carries, each `<key>: <value as JSON>`; a source that allows scripts only. */
  readonly grants: readonly string[];
}

/** One file of the skill's folder in git's tree, before any byte is read. */
interface TreeFile {
  readonly mode: string;
  readonly oid: string;
  readonly size: number;
  /** Inside the skill's folder. */
  readonly rel: string;
}

function refuse(message: string, next?: string): never {
  throw new EngineError(message, { code: "VALIDATION_ERROR", ...(next === undefined ? {} : { next }) });
}

/** Git's output as one line a message may carry: control bytes dropped. */
function gitSaid(outcome: GitOutcome): string {
  const text = outcome.stderr.trim() === "" ? outcome.stdout.trim() : outcome.stderr.trim();
  // oxlint-disable-next-line no-control-regex -- dropping control bytes from git's output IS the point
  return text.replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The record's path for `name`, from the root. */
function skillOriginPath(name: string): string {
  return `${SKILL_ORIGIN_DIR}/${name}.origin.json`;
}

/** The copy's folder for `name`, from the root. */
function skillCopyPath(name: string): string {
  return `${SKILL_COPY_DIR}/${name}`;
}

/** Why `name` cannot name a copied skill, or null. */
function skillNameDefect(name: string): string | null {
  if (!isSkillSlug(name)) return `the skill name ${JSON.stringify(name)} is not a slug (single-hyphen lowercase words, at most 64 characters)`;
  const reserved = ENGINE_CONTENT_PREFIXES.find((prefix) => name.startsWith(prefix));
  if (reserved !== undefined) return `the skill name ${JSON.stringify(name)} starts with \`${reserved}\`, which names the engine's own skills`;
  return null;
}

/** A skill a copy's name would replace: its directory, and who supplies it. */
interface HeldSkill {
  readonly dir: string;
  /** `the bundled skill <dir>` or `the skill <dir> of the installed pack <pack>`. */
  readonly owner: string;
}

/**
 * The skill `name` would replace, or undefined: a bundled skill, or one an installed pack supplies. The corpus strips
 * the engine prefix to make an id, and an override whose id matches a bundled or pack skill's replaces it under that
 * skill's directory on the next sync (`../content/catalog.ts`, `resolveLayerInto`; `../content/userContent.ts`,
 * `saveIdDefect`; `../emit/skillsProjection.ts`, `projectSkills`), so `verify` and `st-verify` both name `st-verify`.
 * The id a copy takes is its folder name: the artifact gate refuses a `SKILL.md` whose declared `id` differs from it.
 */
async function heldSkill(name: string, packRoots: readonly PackContentRoot[]): Promise<HeldSkill | undefined> {
  const wanted = stripEngineContentPrefix(name);
  const held = (await buildContentIndex({ packRoots })).items.find((item) => item.type === "skill" && stripEngineContentPrefix(item.id) === wanted);
  if (held === undefined) return undefined;
  const dir = held.relativePath.split("/").at(-2) ?? held.id;
  return { dir, owner: held.provenance === undefined ? `the bundled skill ${dir}` : `the skill ${dir} of the installed pack ${held.provenance.pack}` };
}

/** The tool-granting keys a `SKILL.md` head declares, each `<key>: <value as JSON>`. */
function toolGrants(skillText: string, source: string): string[] {
  const { frontmatter } = parseFrontmatter(skillText, source);
  return TOOL_GRANT_KEYS.filter((key) => Object.hasOwn(frontmatter, key)).map((key) => `${key}: ${JSON.stringify(frontmatter[key])}`);
}

/**
 * What a Codex companion declares past the keys {@link COMPANION_KEYS} reads as harmless, each `<key path>: <value as
 * JSON>`; a text that is not one YAML map (a duplicate key among it) is one declaration, since no reading of it is
 * sure.
 */
function companionDeclarations(text: string, source: string): string[] {
  let parsed: unknown;
  try {
    parsed = parseYamlStrict(text, source);
  } catch {
    return ["the file does not read as one YAML map"];
  }
  if (!isPlainObject(parsed)) return ["the file does not read as one YAML map"];
  const found: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    const known = COMPANION_KEYS[key];
    if (known === undefined || !isPlainObject(value)) {
      found.push(`${key}: ${JSON.stringify(value)}`);
      continue;
    }
    for (const [inner, innerValue] of Object.entries(value)) {
      if (known[inner] === undefined || typeof innerValue !== known[inner]) found.push(`${key}.${inner}: ${JSON.stringify(innerValue)}`);
    }
  }
  return found;
}

/** Whether anything, a link included, sits at `path`. */
async function present(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw cause;
  }
}

/** Why one path segment of a fetched file cannot land on every platform, or null. */
function segmentDefect(segment: string): string | null {
  if (segment === "" || segment === "." || segment === "..") return "an empty, `.` or `..` segment";
  if (/[<>:"|?*]/.test(segment)) return "a character Windows refuses in a name";
  if (/[. ]$/.test(segment)) return "a trailing dot or space Windows drops";
  if (WINDOWS_DEVICE.test(segment)) return "a name Windows opens as a device";
  if (segment.toLowerCase() === ".git") return "a `.git` segment";
  return null;
}

/** Parse `git ls-tree -r -l -z` over the skill's folder, refusing what may not land. */
function readTree(listing: string, name: string): TreeFile[] {
  const files: TreeFile[] = [];
  const folded = new Set<string>();
  for (const row of listing.split("\0")) {
    if (row === "") continue;
    const match = /^(\d+) (\w+) ([0-9a-f]+) +(\d+|-)\t(.*)$/s.exec(row);
    if (match === null) refuse(`skill add refused: git listed a tree row it cannot read (${JSON.stringify(row.slice(0, 80))}).`);
    const [, mode = "", type = "", oid = "", size = "", path = ""] = match;
    // Before any refusal prints `path`: it refuses control characters through a quoted message, so no escape byte
    // from the source's tree reaches the terminal.
    assertSafePackRelPath(path, "the fetched skill");
    if (mode === "120000") refuse(`skill add refused: ${path} is a link, and a link can address files outside the skill.`);
    if (type !== "blob") refuse(`skill add refused: ${path} is a ${type === "commit" ? "nested repository" : type}, not a file.`);
    if (!path.startsWith(`${name}/`)) refuse(`skill add refused: ${path} is not inside the folder ${name}/.`);
    const rel = path.slice(name.length + 1);
    assertSafePackRelPath(`skills/${name}/${rel}`, "the fetched skill");
    for (const segment of rel.split("/")) {
      const defect = segmentDefect(segment);
      if (defect !== null) refuse(`skill add refused: ${path} carries ${defect}.`);
    }
    const key = rel.toLowerCase();
    if (folded.has(key)) refuse(`skill add refused: ${path} differs from another file only by case, and they collide on a case-insensitive disk.`);
    folded.add(key);
    files.push({ mode, oid, size: Number(size), rel });
  }
  return files;
}

/** The temporary folder: new, empty, and outside the root. */
async function makeTemp(root: string, parent: string): Promise<string> {
  const temp = await mkdtemp(join(parent, "stamity-skill-"));
  const inside = relative(resolve(root), resolve(temp));
  if (inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))) {
    await rm(temp, { recursive: true, force: true });
    refuse(`skill add refused: the temporary folder ${temp} lies inside the project, and a fetch never lands in the checkout.`, "point TMPDIR outside the project and re-run");
  }
  return temp;
}

async function git(run: WorktreeGitRunner, cwd: string, what: string, args: readonly string[], timeoutMs?: number): Promise<string> {
  const outcome = await run({ args, cwd, ...(timeoutMs === undefined ? {} : { timeoutMs }) });
  if (outcome.status !== 0) {
    throw new EngineError(`skill add refused: ${what} failed (git exited ${outcome.status}).`, {
      code: "FS_ERROR",
      why: gitSaid(outcome),
    });
  }
  return outcome.stdout;
}

/** Fetch the pinned commit and the tag, check the tag, list the skill's folder, and write each blob raw under `skillDir`. */
async function materialize(request: AddSkillRequest, temp: string, skillDir: string): Promise<TreeFile[]> {
  const run = request.run ?? runGit;
  const gitDir = join(temp, "repo.git");
  const hooks = join(temp, "no-hooks");
  const blobs = join(temp, "blobs");
  await Promise.all([mkdir(hooks), mkdir(blobs)]);
  const bare = ["--git-dir", gitDir, "-c", `core.hooksPath=${hooks}`, "-c", "transfer.fsckObjects=true"];
  await git(run, temp, "creating the scratch repository", ["init", "--bare", "--quiet", gitDir]);
  const tagRef = `refs/tags/${request.version}`;
  await git(
    run,
    temp,
    `fetching ${request.source.repo} at ${request.commit} and tag ${request.version}`,
    [...bare, "fetch", "--quiet", "--depth", "1", "--no-tags", "--no-recurse-submodules", request.source.repo, request.commit, `+${tagRef}:${tagRef}`],
    GIT_FETCH_TIMEOUT_MS,
  );
  const peeled = (await git(run, temp, `reading tag ${request.version}`, [...bare, "rev-parse", "--verify", "--quiet", `${tagRef}^{commit}`])).trim();
  if (peeled !== request.commit) {
    refuse(
      `skill add refused: the tag ${request.version} points at ${peeled}, not the pinned commit ${request.commit}; a moved tag is not the version the plan named.`,
      "check the source's release and pin the commit the tag names",
    );
  }
  const listing = await git(run, temp, `listing ${request.name}/`, [...bare, "ls-tree", "-r", "-l", "-z", "--full-tree", request.commit, "--", request.name]);
  const files = readTree(listing, request.name);
  if (!files.some((file) => file.rel === SKILL_FILE)) {
    refuse(`skill add refused: ${request.source.id} has no ${request.name}/${SKILL_FILE} at ${request.commit}.`, "check the skill's name and folder in the source");
  }
  // The caps hold before a blob is read: git's own sizes, the pack's limits.
  checkFootprint(manifestFor(request.name, request.version, {}), files.map((file) => contentFile(request.name, skillDir, file.rel, file.size)));
  for (const file of files) {
    // oxlint-disable-next-line no-await-in-loop -- one blob at a time keeps one scratch file in the blobs folder
    const written = (await git(run, blobs, `reading ${request.name}/${file.rel}`, [...bare, "unpack-file", file.oid])).trim();
    const target = join(skillDir, ...file.rel.split("/"));
    // oxlint-disable-next-line no-await-in-loop -- see above
    await mkdir(dirname(target), { recursive: true });
    // oxlint-disable-next-line no-await-in-loop -- see above
    await rename(join(blobs, written), target);
  }
  return files;
}

function manifestFor(name: string, version: string, integrity: Record<string, string>): PackManifest {
  return { name: `skill ${name}`, version, integrity };
}

function contentFile(name: string, skillDir: string, rel: string, sizeBytes: number): PackContentFile {
  return { relPath: `skills/${name}/${rel}`, contentClass: "skills", absPath: join(skillDir, ...rel.split("/")), sizeBytes };
}

/** The staged tree's judgement: scripts, the text-only walk, the aggregate, the artifact gate and both deny scans. */
async function judge(request: AddSkillRequest, stageRoot: string, skillDir: string, tree: readonly TreeFile[]): Promise<{
  files: SkillOriginFile[];
  scripts: string[];
  grants: string[];
  aggregate: string;
  packIntegrity: Record<string, string>;
}> {
  const read = await Promise.all(
    tree.map(async (file) => ({ file, bytes: await readFile(join(skillDir, ...file.rel.split("/"))) })),
  );
  for (const { file, bytes } of read) {
    if (bytes.length !== file.size) {
      throw new EngineError(`skill add refused: ${request.name}/${file.rel} read ${bytes.length} bytes, git listed ${file.size}.`, { code: "VALIDATION_ERROR" });
    }
  }
  const scripts = carriesScripts(read.map(({ file, bytes }) => ({ path: file.rel, mode: file.mode, head: bytes.subarray(0, HEAD_BYTES).toString("utf8") })));
  if (scripts.length > 0 && !request.source.allowScripts) {
    refuse(
      `skill add refused: ${request.name} carries scripts, and the source ${request.source.id} does not allow them:\n${scripts.map((line) => `  - ${line}`).join("\n")}`,
      `a person who trusts this source's scripts sets "allowScripts": true on it in .stamity/skill-sources.json`,
    );
  }
  const companionGrants: string[] = [];
  for (const { file, bytes } of read.filter((entry) => COMPANION_PATHS.has(entry.file.rel.toLowerCase()))) {
    const label = `${request.name}/${file.rel}`;
    const declared = companionDeclarations(bytes.toString("utf8"), label);
    if (declared.length > 0 && !request.source.allowScripts) {
      refuse(
        `skill add refused: ${label} declares what a client may honour as a tool grant or a dependency, and the source ${request.source.id} does not allow scripts:\n${declared.map((line) => `  - ${line}`).join("\n")}`,
        `a person who trusts this source's tools sets "allowScripts": true on it in .stamity/skill-sources.json`,
      );
    }
    companionGrants.push(...declared.map((line) => `${file.rel} ${line}`));
  }
  const files = read
    .map(({ file, bytes }) => ({ path: file.rel, sha256: sha256Hex(bytes), bytes: bytes.length }))
    .toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const packFiles = tree.map((file) => contentFile(request.name, skillDir, file.rel, file.size));
  if (!request.source.allowScripts) {
    // The pack walk's own refusals over the staged tree: text-only extensions, regular files, no links.
    const walked = (await enumeratePackContent(join(stageRoot, STATE_DIR, "overrides"))).map((file) => file.relPath).toSorted();
    const listed = packFiles.map((file) => file.relPath).toSorted();
    if (walked.join("\n") !== listed.join("\n")) refuse(`skill add refused: the staged copy of ${request.name} does not walk as the files git listed.`);
  }
  const aggregate = computeAggregateContentSha(Object.fromEntries(files.map((file) => [file.path, file.sha256])));
  if (request.sha256 !== undefined && request.sha256 !== aggregate) {
    throw new EngineError(`skill add refused: ${request.name}'s aggregate is ${aggregate}, not the expected ${request.sha256}.`, {
      code: "VALIDATION_ERROR",
      next: "check the digest the source published for this version",
    });
  }
  const artifact = (await discoverUserContent(stageRoot)).find((entry) => entry.type === "skill" && entry.filePath === join(skillDir, SKILL_FILE));
  if (artifact === undefined) refuse(`skill add refused: ${request.name}/${SKILL_FILE} is not read as a skill.`);
  const check = await checkUserArtifact(artifact);
  if (check.errors.length > 0) {
    refuse(`skill add refused: ${request.name}/${SKILL_FILE} fails the artifact gate:\n${check.errors.map((error) => `  - ${error.kind}: ${error.detail}`).join("\n")}`);
  }
  const skillLabel = `${request.name}/${SKILL_FILE}`;
  const skillText = read.find(({ file }) => file.rel === SKILL_FILE)?.bytes.toString("utf8") ?? "";
  const grants = toolGrants(skillText, skillLabel);
  if (grants.length > 0 && !request.source.allowScripts) {
    refuse(
      `skill add refused: ${skillLabel} declares ${grants.map((grant) => `\`${grant.slice(0, grant.indexOf(":"))}\``).join(", ")}, which pre-approves tools in a client that reads it, and the source ${request.source.id} does not allow scripts:\n${grants.map((grant) => `  - ${grant}`).join("\n")}`,
      `a person who trusts this source's tools sets "allowScripts": true on it in .stamity/skill-sources.json`,
    );
  }
  const support = await scanUserSkillSupportFiles(stageRoot);
  const hits = [...support.findings.map((finding) => `${relative(skillDir, finding.filePath)}: ${finding.detail}`), ...support.skipped.map((entry) => `${relative(skillDir, entry.filePath)}: ${entry.reason}`)];
  if (hits.length > 0) refuse(`skill add refused: the deny scan refused ${request.name}'s files:\n${hits.map((hit) => `  - ${hit}`).join("\n")}`);
  await scanPackBodies(packFiles);
  await syncWouldTake(request.name, stageRoot, skillText, skillLabel);
  return { files, scripts, grants: [...grants, ...companionGrants], aggregate, packIntegrity: Object.fromEntries(files.map((file) => [`skills/${request.name}/${file.path}`, file.sha256])) };
}

/**
 * The checks the next `sync` runs on an override skill folder, run on the staged copy so nothing lands that `sync`
 * refuses: the projection's head transform (a non-boolean `user-invocable` or `disable-model-invocation`, a head that
 * is not a YAML map) and the content walk over the override tree (an overlay half, `SKILL.customize.md` or
 * `SKILL.customize.yaml`, beside the `SKILL.md` that fully replaces the same id).
 */
async function syncWouldTake(name: string, stageRoot: string, skillText: string, skillLabel: string): Promise<void> {
  try {
    toSpecFrontmatter(skillText, name, skillLabel);
    await buildContentIndex({ overrideRoot: join(stageRoot, STATE_DIR, "overrides") });
  } catch (cause) {
    if (!(cause instanceof EngineError)) throw cause;
    // The walk names staged paths; shown from the root, as the copy would sit.
    const said = cause.message.replaceAll(`${stageRoot}${sep}`, "").replaceAll(`${stageRoot.split(sep).join("/")}/`, "");
    refuse(`skill add refused: the next sync would refuse ${name}: ${said}`);
  }
}

/** Copy the judged tree into place through a partial folder, re-verify it, and write the record. */
async function land(root: string, stagedDir: string, origin: SkillOrigin, packIntegrity: Record<string, string>): Promise<void> {
  const copiesDir = join(root, ...SKILL_COPY_DIR.split("/"));
  const copy = join(root, ...skillCopyPath(origin.name).split("/"));
  const record = join(root, ...skillOriginPath(origin.name).split("/"));
  const boundary = join(root, STATE_DIR);
  await mkdir(copiesDir, { recursive: true });
  await assertWriteTargetContained(copy, boundary);
  await assertWriteTargetContained(record, boundary);
  const partial = await mkdtemp(join(copiesDir, `.${origin.name}.partial-`));
  let landed = false;
  try {
    for (const file of origin.files) {
      const target = join(partial, ...file.path.split("/"));
      // oxlint-disable-next-line no-await-in-loop -- a handful of files, written in order
      await mkdir(dirname(target), { recursive: true });
      // oxlint-disable-next-line no-await-in-loop -- see above
      await writeFile(target, await readFile(join(stagedDir, ...file.path.split("/"))), { flag: "wx" });
    }
    if (await present(copy)) refuse(`skill add refused: ${skillCopyPath(origin.name)} appeared while the skill was being copied.`);
    await rename(partial, copy);
    landed = true;
    const files = origin.files.map((file) => contentFile(origin.name, copy, file.path, file.bytes));
    await verifyIntegrityMap(join(root, STATE_DIR, "overrides"), manifestFor(origin.name, origin.version, packIntegrity), files);
    await mkdir(dirname(record), { recursive: true });
    await writeFile(record, `${JSON.stringify(origin, null, 2)}\n`, { flag: "wx" });
  } catch (cause) {
    await rm(landed ? copy : partial, { recursive: true, force: true });
    throw cause;
  } finally {
    await rm(partial, { recursive: true, force: true });
  }
}

/** A run record's head off its first bytes, or null where no regular file sits at `path`. */
async function recordHeadAt(path: string): Promise<ReturnType<typeof readRecordHead> | null> {
  const entry = await lstat(path).catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT" || cause.code === "ENOTDIR") return null;
    throw cause;
  });
  if (entry === null || !entry.isFile()) return null;
  const handle = await open(path, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(RECORD_HEAD_READ_BYTES), 0, RECORD_HEAD_READ_BYTES, 0);
    return readRecordHead(buffer.toString("utf8", 0, bytesRead));
  } finally {
    await handle.close();
  }
}

/**
 * The main checkout of `root`'s repository where `root` is not it (a lane, a linked worktree), else null: the folder
 * holding the git common directory, as `stamity gc` and the run clean-up find it. A root git does not open as a
 * repository and that holds no `.git` of its own has no other checkout; one that holds a `.git` git cannot read is
 * a fault, since it may be a lane whose main checkout is unread.
 */
async function otherMainCheckout(root: string, run: WorktreeGitRunner): Promise<string | null> {
  const outcome = await run({ args: ["rev-parse", "--git-common-dir"], cwd: root });
  if (outcome.status !== 0) {
    if (!(await present(join(root, ".git")))) return null;
    throw new Error(`git cannot read this checkout: ${gitSaid(outcome)}`);
  }
  const commonDir = resolve(root, outcome.stdout.trim());
  if (basename(commonDir) !== ".git") return null;
  const main = dirname(commonDir);
  const [mainReal, rootReal] = await Promise.all([realpath(main), realpath(root)]);
  return mainReal === rootReal ? null : main;
}

/**
 * Why the main checkout reads as unwatched for a `skill add` run from a lane, or null (amended 2026-11-09, the lane
 * question): the switch's marker (`.stamity/away.json`, a link among it) or an in-progress run record reading
 * `Mode: unattended` there. The verb reads its own folder and the session's variables (`../cli/commands/skill.ts`);
 * a lane has neither the marker nor the night's record, which sit in the main checkout. A read that fails refuses.
 */
async function mainCheckoutUnwatched(root: string, run: WorktreeGitRunner): Promise<string | null> {
  let main: string | null;
  try {
    main = await otherMainCheckout(root, run);
  } catch (cause) {
    return `the main checkout of this checkout could not be found, so whether anyone watches it is unknown (${cause instanceof Error ? cause.message : String(cause)})`;
  }
  if (main === null) return null;
  const marker = `${STATE_DIR}/away.json`;
  try {
    if (await present(join(main, ...marker.split("/")))) return `nobody is watching the main checkout ${main}: its ${marker} is present`;
    const runsDir = join(main, ...RUNS_SEGMENTS);
    const entries = await readdir(runsDir, { withFileTypes: true }).catch((cause: NodeJS.ErrnoException) => {
      if (cause.code === "ENOENT" || cause.code === "ENOTDIR") return [];
      throw cause;
    });
    const runs = entries.filter((entry) => entry.isDirectory() && isRunId(entry.name)).map((entry) => entry.name).toSorted();
    const heads = await Promise.all(runs.map(async (id) => ({ id, head: await recordHeadAt(join(runsDir, id, RECORD_FILE)) })));
    const held = heads.find(({ head }) => head?.inProgress === true && head.mode === "unattended");
    return held === undefined ? null : `the main checkout's run is unattended: ${main}'s ${runRelPath(held.id, RECORD_FILE)} reads \`Status: in progress\` and \`Mode: unattended\``;
  } catch (cause) {
    return `the main checkout ${main}'s away marker or run records could not be read (${cause instanceof Error ? cause.message : String(cause)})`;
  }
}

/**
 * Fetch, judge and copy in one skill. Throws an {@link EngineError} naming the reason on every refusal; the temporary
 * folder is removed on every exit, and nothing lands under the root unless every check passed.
 */
export async function addSkill(request: AddSkillRequest): Promise<AddedSkill> {
  const unwatched = await mainCheckoutUnwatched(request.root, request.run ?? runGit);
  if (unwatched !== null) {
    refuse(`skill add refused: ${unwatched}, and a copied skill is read by every later session before any person has looked at it.`, "add the skill in an attended session, with the main checkout attended too");
  }
  const held = isSkillSlug(request.name) ? await heldSkill(request.name, request.packRoots ?? []) : undefined;
  const nameDefect = skillNameDefect(request.name);
  if (nameDefect !== null) refuse(`skill add refused: ${nameDefect}${held === undefined ? "" : `, and it names ${held.owner}`}.`);
  if (held !== undefined) {
    refuse(
      `skill add refused: the skill name ${JSON.stringify(request.name)} is the id of ${held.owner}, and a copy under it would replace ${held.dir} on the next sync.`,
      "a bundled or pack skill is changed where it is supplied, not by a copy; add the copy under another name",
    );
  }
  if (!COMMIT_SHAPE.test(request.commit)) {
    refuse(`skill add refused: --commit ${JSON.stringify(request.commit)} is not a full commit id (40 lowercase hex digits).`, "pin the full commit id the tag names");
  }
  if (request.version.length > MAX_TAG_LENGTH || !TAG_SHAPE.test(request.version) || request.version.includes("..") || request.version.endsWith(".lock")) {
    refuse(`skill add refused: --tag ${JSON.stringify(request.version)} is not a plain tag name.`);
  }
  if (request.sha256 !== undefined && !SHA256_SHAPE.test(request.sha256)) {
    refuse(`skill add refused: --sha256 ${JSON.stringify(request.sha256)} is not 64 lowercase hex digits.`);
  }
  for (const taken of [skillCopyPath(request.name), skillOriginPath(request.name)]) {
    // oxlint-disable-next-line no-await-in-loop -- two probes, the first refusal wins
    if (await present(join(request.root, ...taken.split("/")))) {
      refuse(`skill add refused: ${taken} already exists, and a copy never overwrites one.`, `remove it first with \`stamity skill remove ${request.name}\`, or by hand if a person wrote it`);
    }
  }

  const temp = await makeTemp(request.root, request.tempParent ?? tmpdir());
  try {
    const stageRoot = join(temp, "stage");
    const skillDir = join(stageRoot, ...skillCopyPath(request.name).split("/"));
    const tree = await materialize(request, temp, skillDir);
    const judged = await judge(request, stageRoot, skillDir, tree);
    const origin: SkillOrigin = {
      name: request.name,
      source: { id: request.source.id, repo: request.source.repo },
      version: request.version,
      commit: request.commit,
      aggregateSha256: judged.aggregate,
      files: judged.files,
      scripts: judged.scripts,
      engineVersion: request.engineVersion,
      fetchedAt: request.now.toISOString(),
    };
    if (request.dryRun !== true) await land(request.root, skillDir, origin, judged.packIntegrity);
    return { origin, copyPath: skillCopyPath(request.name), originPath: skillOriginPath(request.name), written: request.dryRun !== true, grants: judged.grants };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

/** A copied skill as `skill list` reads it. */
export interface CopiedSkill {
  readonly name: string;
  readonly origin: SkillOrigin | null;
  /** `clean`, `drifted`, `copy-missing`, or `record-unreadable` (the record does not parse as one). */
  readonly state: "clean" | "drifted" | "copy-missing" | "record-unreadable";
  readonly changed: readonly string[];
  readonly missing: readonly string[];
  readonly extra: readonly string[];
}

/** The record's fields a drift read needs, or null. */
function originOf(text: string): SkillOrigin | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Partial<SkillOrigin>;
    const files = Array.isArray(record.files) ? record.files : null;
    const fileOk = (file: unknown): boolean => {
      const entry = file as Partial<SkillOriginFile> | null;
      return typeof entry?.path === "string" && typeof entry.sha256 === "string" && typeof entry.bytes === "number";
    };
    if (typeof record.name !== "string" || files === null || !files.every(fileOk)) return null;
    return record as SkillOrigin;
  } catch {
    return null;
  }
}

/** Every regular file and link under `dir`, as `/`-joined paths from it; links are listed, never followed. */
async function walkCopy(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      return entry.isDirectory() ? walkCopy(join(dir, entry.name), rel) : [rel];
    }),
  );
  return nested.flat();
}

/** Re-hash one copied skill against its record; never fetches. */
async function driftOf(root: string, name: string, origin: SkillOrigin | null): Promise<CopiedSkill> {
  const none = { changed: [], missing: [], extra: [] };
  if (origin === null) return { name, origin, state: "record-unreadable", ...none };
  const copy = join(root, ...skillCopyPath(name).split("/"));
  const copyEntry = await lstat(copy).catch(() => null);
  if (copyEntry === null || !copyEntry.isDirectory()) return { name, origin, state: "copy-missing", ...none };
  const listed = new Set(origin.files.map((file) => file.path));
  const results = await Promise.all(
    origin.files.map(async (file) => {
      const path = join(copy, ...file.path.split("/"));
      const entry = await lstat(path).catch(() => null);
      if (entry === null) return { path: file.path, state: "missing" as const };
      if (!entry.isFile()) return { path: file.path, state: "changed" as const };
      return { path: file.path, state: sha256Hex(await readFile(path)) === file.sha256 ? ("same" as const) : ("changed" as const) };
    }),
  );
  const changed = results.filter((result) => result.state === "changed").map((result) => result.path);
  const missing = results.filter((result) => result.state === "missing").map((result) => result.path);
  const extra = (await walkCopy(copy)).filter((path) => !listed.has(path)).toSorted();
  const drifted = changed.length + missing.length + extra.length > 0;
  return { name, origin, state: drifted ? "drifted" : "clean", changed, missing, extra };
}

/** Every origin record under `.stamity/skills/`, with its copy's drift, by name. */
export async function listCopiedSkills(root: string): Promise<CopiedSkill[]> {
  const dir = join(root, ...SKILL_ORIGIN_DIR.split("/"));
  const entries = await readdir(dir, { withFileTypes: true }).catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT" || cause.code === "ENOTDIR") return [];
    throw cause;
  });
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".origin.json"))
    .map((entry) => entry.name.slice(0, -".origin.json".length))
    .filter((name) => skillNameDefect(name) === null)
    .toSorted();
  return Promise.all(
    names.map(async (name) => driftOf(root, name, originOf(await readFile(join(dir, `${name}.origin.json`), "utf8")))),
  );
}

/**
 * Remove one copied skill: its copy and its origin record. A skill with no origin record is not a copied one (a person
 * may have written it), so it is refused rather than removed. Returns the paths removed, from the root.
 */
export async function removeSkill(root: string, name: string, dryRun: boolean): Promise<string[]> {
  const nameDefect = skillNameDefect(name);
  if (nameDefect !== null) refuse(`skill remove refused: ${nameDefect}.`);
  const record = join(root, ...skillOriginPath(name).split("/"));
  const recordEntry = await lstat(record).catch(() => null);
  if (recordEntry === null || !recordEntry.isFile()) {
    refuse(`skill remove refused: ${skillOriginPath(name)} is absent, so ${name} is not a copied skill.`, "an override a person wrote is removed by hand");
  }
  const copy = join(root, ...skillCopyPath(name).split("/"));
  const boundary = join(root, STATE_DIR);
  await assertWriteTargetContained(join(copy, SKILL_FILE), boundary);
  await assertWriteTargetContained(record, boundary);
  const removed = [...((await present(copy)) ? [skillCopyPath(name)] : []), skillOriginPath(name)];
  if (!dryRun) {
    await rm(copy, { recursive: true, force: true });
    await rm(record, { force: true });
  }
  return removed;
}
