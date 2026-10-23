/**
 * The git surface an unattended run's pushes rest on (REQ-FLOW-131, review/97), as pure functions over injected
 * reads: git's effective configuration, every entry with its scope and its origin, and the git-relevant part of the
 * environment the run verbs start git in.
 *
 * `gate preflight --unattended` vets that surface and records it ({@link surfaceRecord}) in the work tree's own git
 * directory ({@link SURFACE_RECORD_FILE}), marked `refused` when it refuses (review/33); `run checkpoint` and `run end`
 * read the surface again when they start and just before they push, and refuse when {@link surfaceRefusal} finds no
 * usable record or {@link compareSurface} finds the surface moved. Only `run end --refused`, the refusal's own ending,
 * takes a record marked `refused`. A config pair
 * set by a shell line the guard's stand-alone rule did not see, or a repository hook that edits `.git/config`
 * during the commit, then stops the push instead of redirecting it.
 *
 * **No value is kept.** The record holds a salted digest of the whole surface, the configuration's key names with
 * every subsection masked (a subsection can be a URL carrying a credential), and the variables' names. Nothing in
 * it is a value, or a digest of one value on its own, so a value cannot be read back or guessed key by key.
 *
 * **What is left out.** `branch.<name>.remote`, `branch.<name>.merge` and `branch.<name>.rebase` in the repository's
 * own (`local`) configuration, which git writes itself when a branch starts tracking one of origin's (`run start` on a
 * continued branch; `.rebase` under `branch.autoSetupRebase`, review/35); the run verbs push to `origin` by an
 * explicit refspec, so none moves a push. `GIT_TERMINAL_PROMPT`
 * and `GIT_ASKPASS`, which the write runner sets itself.
 *
 * A record the agent can write is trusted: a steered agent can re-run the pre-flight, which vets the new surface
 * again, or forge the record. That is the named residual.
 *
 * Erasable syntax only, and no internal import, so every layer may import it.
 */

import { createHmac } from "node:crypto";

/** One git call: its arguments, answered with git's exit status and its stdout. */
export type GitRead = (args: readonly string[]) => Promise<{ code: number; stdout: string }>;

/** One configuration entry as `git config --list --show-scope --show-origin -z` prints it. */
export interface GitConfigEntry {
  scope: string;
  origin: string;
  /** Section and variable lowercased, the subsection as written. */
  key: string;
  /** `null` for a key given with no `=` (a boolean true). */
  value: string | null;
}

/** What one read found. Held in memory only; a record keeps none of its values. */
export interface GitSurface {
  config: readonly GitConfigEntry[];
  /** The git-relevant variables, `[name, value]`, sorted by name. */
  env: readonly (readonly [string, string])[];
  /** The git program the write runner resolves, or `null` where `PATH` holds none. */
  gitProgram: string | null;
}

/** The pre-flight's record of a surface. */
export interface SurfaceRecord {
  version: 1;
  at: string;
  /** Hex, fresh for each record. */
  salt: string;
  /** HMAC-SHA-256 of the whole surface under `salt`, hex. */
  digest: string;
  /** Every configuration key, subsection masked, sorted, a repeated key repeated. */
  keys: readonly string[];
  /** The variables' names, sorted. */
  env: readonly string[];
  /** The pre-flight refused (review/33): only `run end --refused` takes the record then. */
  refused: boolean;
}

/**
 * How a surface compares with its record. `added` and `removed` name configuration keys (subsections masked) and
 * variables; `valuesChanged` is true when the digest differs and no name moved, so a value, an entry's order, scope
 * or file, or the git program changed.
 */
export type SurfaceComparison = { same: true } | { same: false; added: string[]; removed: string[]; valuesChanged: boolean };

/** Where the record lives, under the work tree's git directory (`git rev-parse --git-dir`), beside the checkpoint marker. */
export const SURFACE_RECORD_FILE = "stamity/preflight-git.json";

/** How the record is named in the verbs' text: its place, never the machine's path. */
export const SURFACE_RECORD_LABEL = `${SURFACE_RECORD_FILE} in the git directory`;

/** The most of a record read; a larger file is not a record. */
export const SURFACE_RECORD_MAX_BYTES = 65_536;

/** The read: every entry git applies, with where it comes from, NUL-separated so no value can split a line. */
export const CONFIG_LIST_ARGS: readonly string[] = ["config", "--list", "--show-scope", "--show-origin", "-z"];

/** The keys git writes itself when a branch starts tracking (left out in the `local` scope only). */
const TRACKING_KEY = /^branch\.[\s\S]+\.(?:remote|merge|rebase)$/;

/** The variables the write runner sets itself on every write, whatever the caller's environment holds. */
const RUNNER_SET = new Set(["GIT_TERMINAL_PROMPT", "GIT_ASKPASS"]);

/** The non-`GIT_*` variables that move which configuration files git reads. */
const HOME_VARIABLES = new Set(["HOME", "XDG_CONFIG_HOME"]);

/**
 * The variables `gh` reads for its token, its host, its config folder, its own path and the default repository
 * (`gh help environment`, gh 2.102.0; review/32). gh's credential helper takes the push's credential from them, so
 * one set, cleared or swapped after the pre-flight moves the identity it vetted. Recorded like the others: the name
 * where set, the value only inside the salted digest.
 */
const GH_VARIABLES = new Set(["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN", "GH_HOST", "GH_CONFIG_DIR", "GH_PATH", "GH_REPO"]);

/** Subsection mask in a recorded key. */
const MASK = "<…>";

/**
 * Reads the surface: git's configuration through `git` (the run verbs' own runner), the git-relevant variables of
 * `env` (the environment that runner starts git in), and `gitProgram`. On `win32` a name is uppercased, as Windows
 * reads one. A failed or unparsable read answers `unreadable` with why, never a surface.
 */
export async function readGitSurface(
  git: GitRead,
  env: Readonly<Record<string, string | undefined>>,
  gitProgram: string | null,
  platform: NodeJS.Platform = process.platform,
): Promise<GitSurface | { unreadable: string }> {
  let read: { code: number; stdout: string };
  try {
    read = await git(CONFIG_LIST_ARGS);
  } catch (cause) {
    return { unreadable: `git config --list could not run (${cause instanceof Error ? cause.message : "no answer"})` };
  }
  if (read.code !== 0) return { unreadable: `git config --list answered ${read.code}` };
  const config = parseConfigList(read.stdout);
  if (config === null) return { unreadable: "git config --list printed output this read does not parse" };
  const names = new Map<string, string[]>();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    const name = platform === "win32" ? key.toUpperCase() : key;
    if (!HOME_VARIABLES.has(name) && !GH_VARIABLES.has(name) && !(name.startsWith("GIT_") && !RUNNER_SET.has(name))) continue;
    names.set(name, [...(names.get(name) ?? []), value]);
  }
  const vars: (readonly [string, string])[] = [];
  for (const name of [...names.keys()].toSorted(byCodeUnit)) {
    for (const value of (names.get(name) ?? []).toSorted(byCodeUnit)) vars.push([name, value]);
  }
  return {
    config: config.filter((entry) => !(entry.scope === "local" && TRACKING_KEY.test(entry.key))),
    env: vars,
    gitProgram,
  };
}

/** `-z` output: per entry, the scope, the origin, then the key and its value split at the first newline. */
function parseConfigList(stdout: string): GitConfigEntry[] | null {
  if (stdout === "") return [];
  if (!stdout.endsWith("\0")) return null;
  const fields = stdout.slice(0, -1).split("\0");
  if (fields.length % 3 !== 0) return null;
  const entries: GitConfigEntry[] = [];
  for (let index = 0; index < fields.length; index += 3) {
    const [scope = "", origin = "", pair = ""] = fields.slice(index, index + 3);
    const newline = pair.indexOf("\n");
    const key = newline === -1 ? pair : pair.slice(0, newline);
    if (key === "" || scope === "") return null;
    entries.push({ scope, origin, key, value: newline === -1 ? null : pair.slice(newline + 1) });
  }
  return entries;
}

/** A key with its subsection masked: `url.<…>.insteadof`; a key with none as it is. */
function maskKey(key: string): string {
  const first = key.indexOf(".");
  const last = key.lastIndexOf(".");
  return first === -1 || first === last ? key : `${key.slice(0, first)}.${MASK}.${key.slice(last + 1)}`;
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The salted digest of the whole surface: every entry in git's order, every variable, the program. */
function digestOf(surface: GitSurface, salt: string): string {
  const canonical = JSON.stringify({
    config: surface.config.map((entry) => [entry.scope, entry.origin, entry.key, entry.value]),
    env: surface.env,
    git: surface.gitProgram,
  });
  return createHmac("sha256", salt).update(canonical).digest("hex");
}

/** The names a surface shows: its keys, masked, then its variables, each list sorted. */
function namesOf(surface: GitSurface): { keys: string[]; env: string[] } {
  return {
    keys: surface.config.map((entry) => maskKey(entry.key)).toSorted(byCodeUnit),
    env: [...new Set(surface.env.map(([name]) => name))].toSorted(byCodeUnit),
  };
}

/** The record of `surface` under `salt` (hex, fresh per record), taken at `at`, marked `refused` where the pre-flight refused. */
export function surfaceRecord(surface: GitSurface, salt: string, at: string, refused = false): SurfaceRecord {
  const { keys, env } = namesOf(surface);
  return { version: 1, at, salt, digest: digestOf(surface, salt), keys, env, refused };
}

const HEX = /^[0-9a-f]+$/;
/** The `at` a record carries: `Date#toISOString()`'s shape, so a forged one cannot carry text into a refusal line. */
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const DIGEST = /^[0-9a-f]{64}$/;

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** A record's text read back, or `null` when it is not one this version wrote. */
export function parseSurfaceRecord(text: string): SurfaceRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const { version, at, salt, digest, keys, env, refused } = parsed as Record<string, unknown>;
  if (version !== 1 || typeof at !== "string" || !AT.test(at) || typeof salt !== "string" || salt.length < 32 || !HEX.test(salt)) return null;
  if (typeof digest !== "string" || !DIGEST.test(digest) || !stringList(keys) || !stringList(env) || typeof refused !== "boolean") return null;
  return { version: 1, at, salt, digest, keys, env, refused };
}

/** The entries of `from` that `minus` does not hold, a repeated entry counted as often as it repeats. */
function without(from: readonly string[], minus: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const name of minus) left.set(name, (left.get(name) ?? 0) + 1);
  const out: string[] = [];
  for (const name of from) {
    const count = left.get(name) ?? 0;
    if (count > 0) left.set(name, count - 1);
    else out.push(name);
  }
  return out;
}

/** Whether `now` is the surface `record` was taken of, and where not, which names moved. */
export function compareSurface(record: SurfaceRecord, now: GitSurface): SurfaceComparison {
  if (digestOf(now, record.salt) === record.digest) return { same: true };
  const { keys, env } = namesOf(now);
  const added = [...new Set([...without(keys, record.keys), ...without(env, record.env)])];
  const removed = [...new Set([...without(record.keys, keys), ...without(record.env, env)])];
  return { same: false, added, removed, valuesChanged: added.length === 0 && removed.length === 0 };
}

/** The file reads the record check makes, injected so the check stays pure. */
export interface RecordFileReads {
  /** `missing` where nothing is at `path`, `file` for a regular file (never through a link), else `other`. */
  kind(path: string): "missing" | "file" | "other";
  /** At most `maxBytes` of the regular file at `path`, and whether it held more; `null` where it cannot be read as one. */
  read(path: string, maxBytes: number): { text: string; truncated: boolean } | null;
}

/**
 * What the record is checked for: `push` (`run checkpoint`, a plain `run end`, `run land`) takes only a record of a
 * passing pre-flight; `refused-end` (`run end --refused`, the refusal's own ending) takes a `refused` one too.
 */
export type RecordUse = "push" | "refused-end";

/**
 * review/97, review/34 (REQ-FLOW-131): why an unattended run verb refuses git's surface, or `null` where it is the one
 * the pre-flight recorded. `place` is the record's path (or why the git directory could not be read), `reads` the
 * file reads, `readNow` the surface as the verb's git sees it now. No record (none, a link or anything but a regular
 * file, over {@link SURFACE_RECORD_MAX_BYTES}, text that is not a record, or a `refused` one where `use` is `push`)
 * refuses as `no pre-flight record`; a configuration git cannot list refuses as `configuration unreadable`; a surface
 * that moved refuses as `config changed`, naming the keys (subsections masked) and variables added or removed, never
 * a value. The one record check every run verb uses, so no copy of it can drift.
 */
export async function surfaceRefusal(
  place: { path: string } | { unreadable: string },
  reads: RecordFileReads,
  readNow: () => Promise<GitSurface | { unreadable: string }>,
  use: RecordUse,
): Promise<string | null> {
  if ("unreadable" in place) return `no pre-flight record (${place.unreadable})`;
  const kind = reads.kind(place.path);
  if (kind === "missing") return `no pre-flight record (${SURFACE_RECORD_LABEL} is missing; gate preflight --unattended writes it)`;
  const read = kind === "file" ? reads.read(place.path, SURFACE_RECORD_MAX_BYTES) : null;
  if (read === null) return `no pre-flight record (${SURFACE_RECORD_LABEL} is not a regular file)`;
  if (read.truncated) return `no pre-flight record (${SURFACE_RECORD_LABEL} is over ${SURFACE_RECORD_MAX_BYTES / 1024} KiB)`;
  const record = parseSurfaceRecord(read.text);
  if (record === null) return `no pre-flight record (${SURFACE_RECORD_LABEL} does not read as one)`;
  if (record.refused && use === "push") return "no pre-flight record (the pre-flight refused)";
  const now = await readNow();
  if ("unreadable" in now) return `configuration unreadable (${now.unreadable}), so it cannot be compared with the pre-flight's record`;
  const compared = compareSurface(record, now);
  if (compared.same) return null;
  const moved = [
    ...(compared.added.length === 0 ? [] : [`added ${compared.added.join(", ")}`]),
    ...(compared.removed.length === 0 ? [] : [`removed ${compared.removed.join(", ")}`]),
  ];
  const what = compared.valuesChanged ? "a value, a source file or the git program changed, no key or variable added or removed" : moved.join("; ");
  return `config changed: git's configuration or environment is not the one the pre-flight recorded at ${record.at} (${what})`;
}
