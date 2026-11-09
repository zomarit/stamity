import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isPlainObject, parseJsonStrict, unknownFields } from "../config/parse.ts";
import { repositoryKey } from "../hooks/personOnly.ts";
import { STATE_DIR } from "../types/markers.ts";

/**
 * The trusted skill sources (REQ-FLOW-180): the one held file naming the repositories a skill may be copied in from.
 *
 * A repository commits it, or a company hands it out; a person lands it, since the path is held
 * (`src/change/personOnlyPaths.ts`). Absent means no source is trusted. Strict, and failing closed as a whole: an
 * unknown field, a duplicate id, a repository that is not a plain `https://` URL of one repository, a file that is not
 * a plain file (a folder, a link) or one that cannot be read refuses, and a refusal trusts no source at all, not
 * the valid entries beside the bad one.
 *
 * ```json
 * { "version": 1, "sources": [{ "id": "house", "repo": "https://github.com/acme/skills", "allowScripts": false }] }
 * ```
 */

/** The file, from the project root. */
export const SKILL_SOURCES_REL_PATH = `${STATE_DIR}/skill-sources.json`;

/** One trusted source, as read. */
export interface SkillSource {
  /** A slug: lowercase letters and digits in single-hyphen words, at most {@link MAX_ID_LENGTH} characters. */
  readonly id: string;
  /** The `https://` URL as the file writes it: what a fetch reads from. */
  readonly repo: string;
  /** The repository as `host/owner/repo`, lower-cased, read by `repositoryKey` (`src/hooks/personOnly.ts`). */
  readonly key: string;
  /** Whether a skill from this source may carry scripts; absent reads as `false`. */
  readonly allowScripts: boolean;
}

/** The read: the sources, empty when the file is absent, or the one refusal that trusts none of them. */
export type SkillSourcesRead = { readonly sources: readonly SkillSource[] } | { readonly error: string };

const ROOT_FIELDS = ["version", "sources"] as const;
const SOURCE_FIELDS = ["id", "repo", "allowScripts"] as const;
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 64;
const BOM = "\uFEFF";

/** An `https://` URL naming one repository and nothing else: no credentials, port aside no extra path, no query. */
const ONE_REPOSITORY_URL = /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?\/[\w.-]+\/[\w.-]+\/?$/;

/** Whether `text` is a slug as a source id and a skill name are: single-hyphen lowercase words, at most 64 characters. */
export function isSkillSlug(text: string): boolean {
  return text.length <= MAX_ID_LENGTH && SLUG.test(text);
}

/** A refused URL as a message may show it: any credential part before an `@` replaced, so a token never reaches a log. */
function shown(repo: string): string {
  return JSON.stringify(repo.replace(/^([^/]*\/\/)[^/]*@/, "$1<credentials>@"));
}

function quoted(keys: readonly string[]): string {
  return keys.map((key) => JSON.stringify(key)).join(", ");
}

/** Why the source at `index` (zero-based) is refused, or its reading. */
function readSource(entry: unknown, index: number): SkillSource | string {
  const where = `source ${index + 1}`;
  if (!isPlainObject(entry)) return `${where} must be an object with "id", "repo" and an optional "allowScripts".`;
  const stray = unknownFields(entry, SOURCE_FIELDS);
  if (stray.length > 0) return `${where} has unknown field(s) ${quoted(stray)}. Allowed: ${quoted(SOURCE_FIELDS)}.`;
  const id = entry.id;
  if (typeof id !== "string" || !isSkillSlug(id)) {
    return `${where}'s "id" ${JSON.stringify(id ?? null)} is not a slug: lowercase letters and digits in single-hyphen words, at most ${MAX_ID_LENGTH} characters.`;
  }
  const named = `source ${JSON.stringify(id)}`;
  const repo = entry.repo;
  if (typeof repo !== "string") return `${named} has no "repo" string; name the repository's https:// URL.`;
  const key = ONE_REPOSITORY_URL.test(repo) ? repositoryKey(repo, "") : "";
  if (key === "") {
    return (
      `${named}'s "repo" ${shown(repo)} is not an https:// URL of one repository ` +
      "(https://<host>/<owner>/<repo>, no credentials, no extra path, no query)."
    );
  }
  const allowScripts = Object.hasOwn(entry, "allowScripts") ? entry.allowScripts : false;
  if (typeof allowScripts !== "boolean") return `${named}'s "allowScripts" must be true or false.`;
  return { id, repo, key, allowScripts };
}

function refusal(defect: string): { readonly error: string } {
  return {
    error: `Invalid trusted skill sources in ${SKILL_SOURCES_REL_PATH}: ${defect} No skill source is trusted until the file is fixed (fail-closed).`,
  };
}

/** The defect in a parsed document, or its sources. */
function readDocument(raw: string): readonly SkillSource[] | string {
  let document: unknown;
  try {
    document = parseJsonStrict(raw.startsWith(BOM) ? raw.slice(BOM.length) : raw, SKILL_SOURCES_REL_PATH);
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
  if (!isPlainObject(document)) return "the root must be an object.";
  const stray = unknownFields(document, ROOT_FIELDS);
  if (stray.length > 0) return `unknown field(s) ${quoted(stray)}. Allowed: ${quoted(ROOT_FIELDS)}.`;
  if (document.version !== 1) return '"version" must be the number 1; this engine reads only version 1.';
  if (!Array.isArray(document.sources)) return '"sources" must be an array of sources.';
  const sources: SkillSource[] = [];
  const ids = new Set<string>();
  for (const [index, entry] of (document.sources as unknown[]).entries()) {
    const source = readSource(entry, index);
    if (typeof source === "string") return source;
    if (ids.has(source.id)) return `the id ${JSON.stringify(source.id)} is listed more than once.`;
    ids.add(source.id);
    sources.push(source);
  }
  return sources;
}

/**
 * Read {@link SKILL_SOURCES_REL_PATH} under `root`. An absent file, or an absent state folder, trusts nothing and is
 * no defect: `{ sources: [] }`. Anything else that is not a valid plain file is `{ error }`, naming the file and the
 * defect, and trusts nothing either; a caller never reads past an error to a partial list.
 */
export function readSkillSources(root: string): SkillSourcesRead {
  const path = join(root, SKILL_SOURCES_REL_PATH);
  let raw: string;
  try {
    // lstat, not stat: a link at the held path could point at bytes no person landed.
    if (!lstatSync(path).isFile()) return refusal("it is not a plain file (a folder or a link).");
    raw = readFileSync(path, "utf8");
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") return { sources: [] };
    return refusal(`it cannot be read (${code ?? (cause instanceof Error ? cause.message : String(cause))}).`);
  }
  const read = readDocument(raw);
  return typeof read === "string" ? refusal(read) : { sources: read };
}
