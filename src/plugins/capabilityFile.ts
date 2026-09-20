/**
 * The reader of `stamity-plugin.json` — the one file a generated plugin root
 * carries to declare what it is (REQ-PLUGIN-015).
 *
 * The WRITER is `scripts/plugins/capability.mjs`, which runs under bare Node in
 * the release job with no TypeScript nearby. The two halves are a contract, not
 * a convenience: `buildCapabilityFile` there lays the document out in one fixed
 * key order and `validateCapabilityFile` names each defect by its JSON path,
 * and everything below mirrors that key set exactly. `test/plugins/capabilityFile.test.ts`
 * moves bytes across the seam — every parse case reads a file the real writer
 * built — so the mirror cannot drift silently green.
 *
 * STRICT by design. An unknown top-level key, an unknown class key, a schema
 * version other than 1, or a client outside this engine's {@link Tool} set all
 * refuse with `CONFIG_ERROR` naming the offending key. A root carrying a key
 * this engine does not understand was built by a newer generator, and ignoring
 * it would set a repository up against capabilities that are not there — the
 * failure mode a permissive reader turns into a silent half-install.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseJsonStrict } from "../config/parse.ts";
import { TOOLS, VALID_TOOLS, type Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import { PLUGIN_OWNED_CLASSES, type PluginOwnedClass } from "../types/manifest.ts";

/** The capability document's filename, at the root of every generated plugin root. */
export const CAPABILITY_FILE = "stamity-plugin.json";

/** The only schema generation this reader understands. */
export const CAPABILITY_SCHEMA_VERSION = 1;

/**
 * Every class a root declares a status for: the five a plugin can OWN, plus
 * `mcp`, which a root always declares and never carries (server selection and
 * credential references are the repository's).
 *
 * Derived from {@link PLUGIN_OWNED_CLASSES} rather than restated, so a sixth
 * ownable class lands here the day the content model grows one instead of
 * drifting against the writer's own list. The derivation is pinned against the
 * writer's `PLUGIN_CLASSES` by the suite.
 */
export const PLUGIN_CAPABILITY_CLASSES: readonly PluginCapabilityClass[] = [
  ...PLUGIN_OWNED_CLASSES,
  "mcp",
];

/** A class a capability file declares a status for. */
export type PluginCapabilityClass = PluginOwnedClass | "mcp";

/** What a root says about one class: it carries it, the repository owns it, or it cannot. */
export type CapabilityClassStatus = "carried" | "repository-owned" | "unsupported";

/** The three statuses as one English list, so every message naming them reads the same. */
const CLASS_STATUS_LIST = "carried, repository-owned or unsupported";

const CLASS_STATUSES = new Set<string>(["carried", "repository-owned", "unsupported"]);

/** One class entry: a status, plus the count or the reason that status implies. */
export interface PluginCapabilityClassEntry {
  status: CapabilityClassStatus;
  /** Files the root carries for this class; present on a `carried` class. */
  count?: number;
  /** Why the class is not carried; present on a class that is not `carried`. */
  reason?: string;
}

/** The client-version floor a root states, with the vendor page it was read from. */
export interface PluginClientFloor {
  version: string;
  citation?: { url: string; accessDate: string };
  reason?: string;
}

/** Where the bundled runtime sits inside a root, and the package that may replace it. */
export interface PluginRuntimeLocation {
  path: string;
  locator: string;
  companion: { package: string; compatible: string };
}

/**
 * `stamity-plugin.json`, as the writer lays it out. Key-for-key with
 * `scripts/plugins/capability.mjs`'s `TOP_KEYS`.
 *
 * `distribution` is OPTIONAL because the writer emits it only when the input
 * records a route worth stating — its absence means "no route", never "the
 * builder forgot".
 */
export interface PluginCapabilityFile {
  schemaVersion: 1;
  client: Tool;
  version: string;
  sourceCommit: string;
  invocation: Record<string, string>;
  clientFloor: PluginClientFloor;
  prerequisites: { node: string; git: "optional" | "required"; [client: string]: string };
  classes: Record<PluginCapabilityClass, PluginCapabilityClassEntry>;
  runtime: PluginRuntimeLocation;
  distribution?: { note: string };
}

/** Top-level key set, in the writer's order. */
const TOP_KEYS: readonly string[] = [
  "schemaVersion",
  "client",
  "version",
  "sourceCommit",
  "invocation",
  "clientFloor",
  "prerequisites",
  "classes",
  "runtime",
  "distribution",
];

/**
 * Keys under `invocation` that are NOTES about the forms rather than forms.
 *
 * Mirrors `INVOCATION_NOTE_KEYS` in the writer (`scripts/plugins/capability.mjs`), pinned
 * against it by the suite. `citation` is the one: the Cursor root reads its `/<id>` form off
 * two pages the plugins reference does not state it on, and the file records which. Offering
 * that sentence to an operator as something to type is the mistake this reservation prevents.
 */
const INVOCATION_NOTE_KEYS: ReadonlySet<string> = new Set(["citation"]);

const CLIENT_FLOOR_KEYS: readonly string[] = ["version", "citation", "reason"];
const CITATION_KEYS: readonly string[] = ["url", "accessDate"];
const CLASS_KEYS: readonly string[] = ["status", "count", "reason"];
const RUNTIME_KEYS: readonly string[] = ["path", "locator", "companion"];
const COMPANION_KEYS: readonly string[] = ["package", "compatible"];
const DISTRIBUTION_KEYS: readonly string[] = ["note"];

const COMMIT_SHA = /^[0-9a-f]{40}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** One message per unsupported key, each naming its own JSON path. */
function unsupportedKeys(
  value: Record<string, unknown>,
  supported: readonly string[],
  prefix: string,
): string[] {
  return Object.keys(value)
    .filter((key) => !supported.includes(key))
    .toSorted()
    .map((key) => `${prefix}${key}: is not a key this engine understands`);
}

function checkString(
  value: unknown,
  path: string,
  requirement: string,
  defects: string[],
): void {
  if (!isNonEmptyString(value)) defects.push(`${path}: ${requirement}`);
}

function checkInvocation(value: unknown, defects: string[]): void {
  if (!isPlainObject(value)) {
    defects.push("invocation: must be an object naming at least one invocation form");
    return;
  }
  if (Object.keys(value).every((key) => INVOCATION_NOTE_KEYS.has(key))) {
    defects.push("invocation: must be an object naming at least one invocation form");
    return;
  }
  for (const key of Object.keys(value).toSorted()) {
    const requirement = INVOCATION_NOTE_KEYS.has(key)
      ? "must be the note this key reserves: where the forms beside it were read from"
      : "must be the literal form an operator types";
    checkString(value[key], `invocation.${key}`, requirement, defects);
  }
}

function checkClientFloor(value: unknown, defects: string[]): void {
  if (!isPlainObject(value)) {
    defects.push("clientFloor: must be an object carrying the client's version floor");
    return;
  }
  defects.push(...unsupportedKeys(value, CLIENT_FLOOR_KEYS, "clientFloor."));
  checkString(value.version, "clientFloor.version", "must be a version or the word unknown", defects);
  if (value.citation !== undefined) {
    if (!isPlainObject(value.citation)) {
      defects.push("clientFloor.citation: must be an object carrying url and accessDate");
    } else {
      defects.push(...unsupportedKeys(value.citation, CITATION_KEYS, "clientFloor.citation."));
      checkString(value.citation.url, "clientFloor.citation.url", "must be the vendor page the floor was read from", defects);
      checkString(value.citation.accessDate, "clientFloor.citation.accessDate", "must be the ISO date the page was read on", defects);
    }
  }
  if (value.reason !== undefined) {
    checkString(value.reason, "clientFloor.reason", "must say why no floor is stated", defects);
  }
}

function checkPrerequisites(value: unknown, defects: string[]): void {
  if (!isPlainObject(value)) {
    defects.push("prerequisites: must be an object carrying node and git");
    return;
  }
  checkString(value.node, "prerequisites.node", "must be the Node floor the root needs", defects);
  if (value.git !== "optional" && value.git !== "required") {
    defects.push("prerequisites.git: must be optional or required");
  }
  for (const key of Object.keys(value).toSorted()) {
    if (key === "node" || key === "git") continue;
    checkString(value[key], `prerequisites.${key}`, "must be the command that installs the tool", defects);
  }
}

function checkClasses(value: unknown, defects: string[]): void {
  if (!isPlainObject(value)) {
    defects.push(
      `classes: must be an object carrying one entry per class in ${PLUGIN_CAPABILITY_CLASSES.join(", ")}`,
    );
    return;
  }
  defects.push(...unsupportedKeys(value, PLUGIN_CAPABILITY_CLASSES, "classes."));
  for (const name of PLUGIN_CAPABILITY_CLASSES) {
    const at = `classes.${name}`;
    const entry = value[name];
    if (!isPlainObject(entry)) {
      defects.push(`${at}: must declare a status of ${CLASS_STATUS_LIST}`);
      continue;
    }
    defects.push(...unsupportedKeys(entry, CLASS_KEYS, `${at}.`));
    if (typeof entry.status !== "string" || !CLASS_STATUSES.has(entry.status)) {
      defects.push(`${at}.status: must be ${CLASS_STATUS_LIST}`);
      continue;
    }
    if (entry.status === "carried") {
      if (!(typeof entry.count === "number" && Number.isSafeInteger(entry.count) && entry.count >= 0)) {
        defects.push(`${at}.count: must be the number of files the root carries for a carried class`);
      }
      continue;
    }
    if (!isNonEmptyString(entry.reason)) {
      defects.push(`${at}.reason: must say why the class is not carried`);
    }
  }
}

function checkRuntime(value: unknown, defects: string[]): void {
  if (!isPlainObject(value)) {
    defects.push("runtime: must be an object carrying path, locator and companion");
    return;
  }
  defects.push(...unsupportedKeys(value, RUNTIME_KEYS, "runtime."));
  checkString(value.path, "runtime.path", "must be the directory the bundled runtime sits in", defects);
  checkString(value.locator, "runtime.locator", "must be the path of the locator script inside the root", defects);
  if (!isPlainObject(value.companion)) {
    defects.push("runtime.companion: must be an object carrying package and compatible");
    return;
  }
  defects.push(...unsupportedKeys(value.companion, COMPANION_KEYS, "runtime.companion."));
  checkString(value.companion.package, "runtime.companion.package", "must be the npm package a repository may install instead", defects);
  checkString(value.companion.compatible, "runtime.companion.compatible", "must be a range over the plugin version", defects);
}

function checkDistribution(value: unknown, defects: string[]): void {
  if (!isPlainObject(value)) {
    defects.push("distribution: must be an object carrying a note, or be absent");
    return;
  }
  defects.push(...unsupportedKeys(value, DISTRIBUTION_KEYS, "distribution."));
  checkString(value.note, "distribution.note", "must state the route an organization serves this root through", defects);
}

/**
 * One message per defect, each naming its JSON path; an empty array is a file
 * this engine can act on. The mirror of `validateCapabilityFile` in the writer.
 *
 * Takes an object rather than `unknown`: `parseJsonStrict` already refuses a
 * document whose root is not one, so a root-shape check here would be a branch
 * no input can reach. That refusal is the boundary, and it names the path.
 */
function collectCapabilityErrors(value: Record<string, unknown>): string[] {
  const defects = unsupportedKeys(value, TOP_KEYS, "");
  if (value.schemaVersion !== CAPABILITY_SCHEMA_VERSION) {
    defects.push(
      `schemaVersion: must be ${CAPABILITY_SCHEMA_VERSION}, the only schema this engine reads, not ${JSON.stringify(value.schemaVersion)}`,
    );
  }
  if (typeof value.client !== "string" || !VALID_TOOLS.has(value.client)) {
    defects.push(
      `client: must be one of ${TOOLS.join(", ")}, not ${JSON.stringify(value.client)}`,
    );
  }
  checkString(value.version, "version", "must be the plugin version this root was built at", defects);
  if (!(typeof value.sourceCommit === "string" && COMMIT_SHA.test(value.sourceCommit))) {
    defects.push("sourceCommit: must be a 40-character lowercase hex commit sha");
  }
  checkInvocation(value.invocation, defects);
  checkClientFloor(value.clientFloor, defects);
  checkPrerequisites(value.prerequisites, defects);
  checkClasses(value.classes, defects);
  checkRuntime(value.runtime, defects);
  if (value.distribution !== undefined) checkDistribution(value.distribution, defects);
  return defects;
}

/**
 * Read and validate `<pluginRoot>/stamity-plugin.json`.
 *
 * Refuses with `CONFIG_ERROR` in four shapes, each naming what it looked at: no
 * such file (the path), malformed JSON (the path, via `parseJsonStrict`), and a
 * document that fails the schema (every defect, one per line, each carrying its
 * own JSON path). Every other errno propagates through the same code with the
 * path in the sentence, because an unreadable root and an absent one are the
 * same answer to the operator: this is not a root this engine can set up from.
 */
export async function readCapabilityFile(pluginRoot: string): Promise<PluginCapabilityFile> {
  const file = join(pluginRoot, CAPABILITY_FILE);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    const why =
      code === "ENOENT"
        ? "no such file — the path is not a generated plugin root, or the root is incomplete"
        : `it could not be read (${String(code ?? "unknown error")})`;
    throw new EngineError(`Cannot read the plugin capability file ${file}: ${why}.`, {
      code: "CONFIG_ERROR",
      cause,
    });
  }

  const parsed = parseJsonStrict(raw, file) as Record<string, unknown>;
  const defects = collectCapabilityErrors(parsed);
  if (defects.length > 0) {
    throw new EngineError(
      `The plugin capability file ${file} is not one this engine can read:\n` +
        defects.map((defect) => `  - ${defect}`).join("\n"),
      { code: "CONFIG_ERROR" },
    );
  }
  return parsed as unknown as PluginCapabilityFile;
}

/**
 * The classes this root carries for its client, in {@link PLUGIN_OWNED_CLASSES}
 * order — which is what makes two roots that carry the same set record the same
 * list, whatever order their `classes` object was built in.
 *
 * `mcp` is excluded BY CONSTRUCTION rather than by a filter: the ownable set is
 * the manifest's own vocabulary and `mcp` is not in it, so a root that somehow
 * declared `mcp: carried` still cannot move MCP ownership. The repository keeps
 * server selection and its credential references, which is the boundary
 * REQ-PLUGIN-015 draws.
 */
export function carriedClasses(file: PluginCapabilityFile): PluginOwnedClass[] {
  return PLUGIN_OWNED_CLASSES.filter((name) => file.classes[name]?.status === "carried");
}

/**
 * The invocation FORMS a root declares — the literals an operator types — with the reserved
 * note keys left out, in the file's own key order.
 *
 * The exclusion is why {@link INVOCATION_NOTE_KEYS} exists: `invocation` is an open record so a
 * container can declare a form per class without this reader knowing the class names, and an
 * open record has no way to tell a form from a sentence about the forms. Naming the notes is
 * what keeps a consumer from printing "the /<id> form is stated on ..." as something to type.
 */
export function invocationForms(file: PluginCapabilityFile): Record<string, string> {
  return Object.fromEntries(
    Object.entries(file.invocation).filter(([key]) => !INVOCATION_NOTE_KEYS.has(key)),
  );
}

/**
 * The environment variables a client sets to name its installed plugin root,
 * in the order they are consulted. Claude first because it is the client that
 * documents the variable; `PLUGIN_ROOT` is the client-neutral fallback an
 * operator can set by hand.
 */
const PLUGIN_ROOT_VARIABLES: readonly string[] = [
  "CLAUDE_PLUGIN_ROOT",
  "CURSOR_PLUGIN_ROOT",
  "PLUGIN_ROOT",
  "COPILOT_PLUGIN_ROOT",
];

/** A value that actually names a root, trimmed; blank and absent read alike. */
function namedRoot(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Where the installed plugin root is: the explicit flag if one was given, else
 * the first of {@link PLUGIN_ROOT_VARIABLES} that names one, else `null`.
 *
 * A blank value reads as UNSET rather than as a root at the empty path — a
 * client that exports its variable without a value is saying nothing, and
 * resolving that to `""` would send every path join to the filesystem root.
 */
export function resolvePluginRoot(opts: {
  flag?: string;
  env: Readonly<Record<string, string | undefined>>;
}): string | null {
  const flagged = namedRoot(opts.flag);
  if (flagged !== null) return flagged;
  for (const variable of PLUGIN_ROOT_VARIABLES) {
    const found = namedRoot(opts.env[variable]);
    if (found !== null) return found;
  }
  return null;
}
