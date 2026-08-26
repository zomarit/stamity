import { parse as parseYaml } from "yaml";
import { EngineError } from "../types/errors.ts";

/**
 * Config-ingress vocabulary. Every boundary that reads structured input — the
 * setup manifest, pack manifests, hook definitions, frontmatter, env knobs —
 * goes through these helpers instead of casting `JSON.parse(...) as T`.
 *
 * Two error codes, split so the operator's next step and the CI exit status
 * differ by defect class:
 *   - `CONFIG_ERROR` (65) — the document could not be read: syntax failure, or
 *     a root that is not a map. Next step: fix the file's syntax.
 *   - `VALIDATION_ERROR` (64) — the document parsed, but a field has the wrong
 *     shape or the object carries a key outside the allowed set. Next step:
 *     fix that value.
 *
 * The `require*` helpers throw on the first defect. A caller that wants every
 * defect in one pass (manifest validation) wraps each field read in a
 * try/catch and collects `err.message`; a caller reading a single field gets an
 * actionable throw for free.
 */

/** Human-readable value class for messages. Never dumps a large value. */
function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "string") {
    return `string ${JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value)}`;
  }
  if (typeof value === "object") return "an object";
  if (typeof value === "function") return "a function";
  return `${typeof value} ${String(value)}`;
}

/** First line of a thrown reason — parser errors carry multi-line context we do not re-print. */
function firstLine(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.split("\n")[0] ?? message;
}

/** Non-null, non-array object gate — the first check for any document-shaped ingress. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireDocumentRoot(parsed: unknown, format: string, source: string): unknown {
  if (isPlainObject(parsed)) return parsed;
  throw new EngineError(
    `Malformed ${format} in ${source}: expected an object at the document root, got ${describeValue(parsed)}.`,
    { code: "CONFIG_ERROR" },
  );
}

/**
 * Parse a JSON document. Throws `CONFIG_ERROR` naming `source` (a path or a
 * logical name) on a syntax failure or a root that is not an object. Returns
 * `unknown`: the root shape is settled, the field shapes are the caller's.
 */
export function parseJsonStrict(raw: string, source: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (cause) {
    throw new EngineError(
      `Malformed JSON in ${source}: ${firstLine(cause)}. Fix the JSON syntax and re-run.`,
      { code: "CONFIG_ERROR", cause },
    );
  }
  return requireDocumentRoot(parsed, "JSON", source);
}

/**
 * Parse a single YAML document, with the same contract as
 * {@link parseJsonStrict}. One deliberate difference: a document that parses to
 * `null` — blank file, comments only, an explicit `null` — yields `{}` rather
 * than a rejection, because that is what every config surface means by an empty
 * document (an empty frontmatter block is not a defect).
 */
export function parseYamlStrict(raw: string, source: string): unknown {
  let parsed: unknown;
  try {
    // `merge: true` — `<<: *anchor` merge keys are opt-in from yaml v2 onward and
    // shared config blocks rely on them. `maxAliasCount` stays at the library
    // default (100): that is the alias-expansion bomb guard, so a bomb is refused
    // in milliseconds here instead of expanding into memory.
    parsed = parseYaml(raw, { merge: true }) as unknown;
  } catch (cause) {
    throw new EngineError(
      `Malformed YAML in ${source}: ${firstLine(cause)}. Fix the YAML syntax and re-run.`,
      { code: "CONFIG_ERROR", cause },
    );
  }
  if (parsed === null) return {};
  return requireDocumentRoot(parsed, "YAML", source);
}

/** Shared options for the `require*` field validators. */
export interface RequireFieldOptions {
  /** Path or logical name of the document being read; prefixes every message. */
  source: string;
  /** When true an absent field returns `undefined` instead of throwing. Default false. */
  optional?: boolean;
}

/**
 * Read one field under the shared absent/mismatch policy. Non-own keys read as
 * absent, so a prototype member (`constructor`, `toString`) can never be
 * mistaken for a supplied value.
 */
function requireField<T>(
  obj: Record<string, unknown>,
  field: string,
  opts: RequireFieldOptions,
  expected: string,
  guard: (value: unknown) => value is T,
): T | undefined {
  const value = Object.hasOwn(obj, field) ? obj[field] : undefined;
  if (value === undefined) {
    if (opts.optional === true) return undefined;
    throw new EngineError(`${opts.source}: \`${field}\` is required (${expected}).`, {
      code: "VALIDATION_ERROR",
    });
  }
  if (guard(value)) return value;
  throw new EngineError(
    `${opts.source}: \`${field}\` must be ${expected} (got ${describeValue(value)}).`,
    { code: "VALIDATION_ERROR" },
  );
}

/** Validate `obj[field]` is a string. */
export function requireString(
  obj: Record<string, unknown>,
  field: string,
  opts: RequireFieldOptions,
): string | undefined {
  return requireField(obj, field, opts, "a string", (value) => typeof value === "string");
}

/** Validate `obj[field]` is a boolean. */
export function requireBoolean(
  obj: Record<string, unknown>,
  field: string,
  opts: RequireFieldOptions,
): boolean | undefined {
  return requireField(obj, field, opts, "a boolean", (value) => typeof value === "boolean");
}

/** Validate `obj[field]` is an array whose every element is a string. */
export function requireStringArray(
  obj: Record<string, unknown>,
  field: string,
  opts: RequireFieldOptions,
): string[] | undefined {
  return requireField(
    obj,
    field,
    opts,
    "an array of strings",
    (value): value is string[] =>
      Array.isArray(value) && value.every((entry) => typeof entry === "string"),
  );
}

/** Validate `obj[field]` is one of `allowed`, narrowed to the literal union. */
export function requireEnum<T extends string>(
  obj: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
  opts: RequireFieldOptions,
): T | undefined {
  const expected = `one of ${allowed.map((entry) => JSON.stringify(entry)).join(" | ")}`;
  return requireField(
    obj,
    field,
    opts,
    expected,
    (value): value is T =>
      typeof value === "string" && (allowed as readonly string[]).includes(value),
  );
}

/** Own keys of `obj` outside `known`, sorted so messages are stable. */
export function unknownFields(obj: Record<string, unknown>, known: readonly string[]): string[] {
  const allowed = new Set(known);
  return Object.keys(obj)
    .filter((key) => !allowed.has(key))
    .toSorted();
}

/**
 * Throw when `obj` carries any key outside `known`, naming every offending key
 * in one message — an operator fixing a rejected document should need one pass,
 * not one round-trip per stray key. Use on strict ingress (pack manifests);
 * forward-compatible surfaces route {@link unknownFields} to a warning instead.
 */
export function rejectUnknownFields(
  obj: Record<string, unknown>,
  known: readonly string[],
  source: string,
): void {
  const unknown = unknownFields(obj, known);
  if (unknown.length === 0) return;
  throw new EngineError(
    `${source}: unknown field(s) ${unknown.map((key) => JSON.stringify(key)).join(", ")}. ` +
      `Allowed: ${known.toSorted().map((key) => JSON.stringify(key)).join(", ")}.`,
    { code: "VALIDATION_ERROR" },
  );
}

/**
 * Read an integer env var: `undefined` when unset, blank, non-numeric or
 * non-finite, otherwise the value truncated toward zero. Range policy (floors,
 * clamps, defaults) stays with the caller so each knob documents its own bounds.
 *
 * Env readers never throw — a malformed knob is no signal, so a typo in the
 * environment degrades to the default instead of failing the run.
 */
export function readEnvInt(
  name: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): number | undefined {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.trunc(parsed);
}

const TRUE_TOKENS = new Set(["1", "true", "yes", "on"]);
const FALSE_TOKENS = new Set(["0", "false", "no", "off"]);

/**
 * Read a boolean env var, case-insensitively: `1|true|yes|on` → true,
 * `0|false|no|off` → false, anything else (including unset and blank) →
 * `undefined`, meaning no signal. Never throws, per {@link readEnvInt}.
 */
export function readEnvBool(
  name: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean | undefined {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined) return undefined;
  if (TRUE_TOKENS.has(raw)) return true;
  if (FALSE_TOKENS.has(raw)) return false;
  return undefined;
}
