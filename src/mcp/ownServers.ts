import { INVISIBLE_SMUGGLING_CHARS, scanNormalized, type DenyPattern } from "../denyscan/denyScan.ts";
import {
  PACK_BODY_DENY_PATTERNS,
  validatePackMcpServer,
  type PackMcpServerDefinition,
} from "../pack/manifest.ts";
import { EngineError } from "../types/errors.ts";
import { MANIFEST_FILE, type McpOwnServer, type SetupManifest } from "../types/manifest.ts";
import { STATE_DIR } from "../types/markers.ts";
import { resolveServerMeta, type PackSuppliedServer } from "./catalog.ts";

/**
 * A repository's own MCP servers (REQ-FLOW-160): `mcp.ownServers` rows joining
 * the pack rows every reader of server supply resolves ids from.
 *
 * The rows ride the pack bar. Each one passes `validatePackMcpServer`, so the
 * pin and secret checks are the packs' own, and the catalog stays as it is. Past
 * this seam an own row IS a pack row: `./emit.ts`, `./env.ts` and the ownership
 * proof ask nothing about where a row came from, and {@link OWN_SERVER_SOURCE}
 * is what keeps it out of a pack's accounting.
 *
 * The bar runs here and not in the manifest reader, on every read. A setup with
 * a bad row must still open: `clean` exists to clear such a state, so it reads
 * through {@link provableOwnServers}, and a rendering proof plans from
 * {@link provableOwnSetup}, while every lane that emits reads through
 * {@link withOwnServers} and refuses.
 *
 * Every refusal here is printed to a terminal or a CI log, and an own row is
 * where a person types a real credential, so no refusal repeats a typed value:
 * {@link maskArgs} names each argument by its place, and {@link maskFields}
 * withholds the other fields a refusal would quote.
 */

/**
 * The `sourcePackId` of an own row. A pack name cannot start with a colon
 * (`PACK_NAME_PATTERN` in `../pack/manifest.ts`), so no installed pack can claim
 * this source, and `clean --pack` can never take an own row with it.
 */
export const OWN_SERVER_SOURCE = ":own";

/** A `${...}` reference, as `../pack/manifest.ts` reads one. */
const INTERPOLATION = /\$\{[^}]*\}/g;

/** Where a row sits, by place and, when it has one, by id: the person fixes it there. */
function rowLabel(row: unknown, index: number): string {
  const id = (row as { id?: unknown } | null)?.id;
  const named = typeof id === "string" && id !== "" ? ` (${JSON.stringify(id)})` : "";
  return `${STATE_DIR}/${MANIFEST_FILE} mcp.ownServers[${index}]${named}`;
}

/**
 * Refuse `args` that are not a list before the validator reads them: its
 * refusal quotes a wrong value, and a value typed here can be a credential.
 */
function assertArgsList(row: unknown, label: string): void {
  const args = (row as { args?: unknown } | null)?.args;
  if (args === undefined || Array.isArray(args)) return;
  throw new EngineError(`${label}: \`args\` must be an array of strings.`, { code: "VALIDATION_ERROR" });
}

/**
 * `message` with each of the row's arguments named by its place. The validator
 * quotes an argument it refuses, which suits a pack's public file and not a
 * person's token, and it masks only what the secret scan recognises. So every
 * argument goes, whether the scan knew it or not, and with it any `${...}`
 * reference inside one, which the validator quotes alone. The row's id and its
 * pin stay when an argument repeats them: the message states those from fields
 * that are not arguments.
 */
function maskArgs(message: string, row: unknown): string {
  const { id, args, packageNameLock, pinnedVersion } = (row ?? {}) as Partial<McpOwnServer>;
  if (!Array.isArray(args)) return message;
  const stated = new Set([id, `${packageNameLock ?? ""}@${pinnedVersion ?? ""}`]);
  let masked = message;
  for (const [index, arg] of args.entries()) {
    if (typeof arg !== "string") continue;
    for (const value of [arg, ...(arg.match(INTERPOLATION) ?? [])]) {
      if (!stated.has(value)) masked = masked.replaceAll(JSON.stringify(value), `<args[${index}]>`);
    }
  }
  return masked;
}

/** What stands where a refusal would print a typed field; the field's name stays beside it. */
const WITHHELD = "<value withheld>";

/** How a refusal prints a number typed where a string belongs. */
const TYPED_NUMBER = /\(got number [^)]*\)/g;

/** `../config/parse.ts` cuts a string of a wrong type to this many characters before quoting it. */
const TYPE_REFUSAL_CUT = 40;

/** Control characters JSON's quoting leaves as they are, and some terminals obey. */
const C1_CONTROLS = /[\u0080-\u009f]/g;

/**
 * `message` with no typed `command`, `docsUrl`, `pinnedVersion`, `transport` or
 * variable `name` left in it. The validator quotes each of them when it refuses
 * one, and the pin refusals quote a `command` that has a launcher's shape, which a
 * pasted token can have. These fields are where a pasted shell line, or a link
 * with its password in it, lands. Two things stay. The `id` is how the person
 * finds the row, so a field equal to it stays too. The pin says which token the
 * refusal wants, and it prints only once its version has an exact version's shape.
 */
function maskFields(message: string, row: unknown): string {
  const { id, command, docsUrl, pinnedVersion, transport, requiresEnv } = (row ?? {}) as Partial<McpOwnServer>;
  const names = (Array.isArray(requiresEnv) ? requiresEnv : []).map(
    (requirement) => (requirement as { name?: unknown } | null)?.name,
  );
  let masked = message.replaceAll(TYPED_NUMBER, `(got number ${WITHHELD})`);
  for (const [index, name] of names.entries()) {
    masked = masked.replaceAll(`requiresEnv[${String(name)}]`, `requiresEnv[${index}]`);
  }
  for (const value of [command, docsUrl, pinnedVersion, transport, ...names]) {
    if (typeof value !== "string" || value === id) continue;
    masked = masked
      .replaceAll(JSON.stringify(value), WITHHELD)
      .replaceAll(JSON.stringify(`${value.slice(0, TYPE_REFUSAL_CUT)}…`), WITHHELD);
  }
  return masked;
}

/**
 * A refusal as it may print: no typed value, and no C1 control. The row's id
 * reaches a message through the label and again through the validator's own line,
 * and a stray key through its quote, so the escape runs here over the whole
 * message and not in {@link rowLabel} alone. It runs last, because the masks match
 * values as `JSON.stringify` prints them.
 */
function printableRefusal(message: string, row: unknown): string {
  return maskFields(maskArgs(message, row), row).replaceAll(
    C1_CONTROLS,
    (control) => `\\u${control.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/**
 * Refuse a `${env:` that never closes. The validator reads closed references
 * only, so this argument passes it and stops at the emitter, whose refusal
 * quotes the whole argument.
 */
function assertReferencesClose(definition: PackMcpServerDefinition, label: string): void {
  const index = definition.args.findIndex((arg) => arg.replaceAll(INTERPOLATION, "").includes("${env:"));
  if (index === -1) return;
  throw new EngineError(
    `${label}: \`args[${index}]\` opens an environment reference and never closes it. Write it as ` +
      `\${env:NAME}.`,
    { code: "VALIDATION_ERROR" },
  );
}

/**
 * The bar for `args` with their references in the text or closed up: every row
 * but the one that reads on past an assignment sign. That row wants any eight
 * characters there, which every reference is, and with a reference closed up it
 * would take whatever follows `--token=` for the value the reference supplies. It
 * is the only row a reference meets by its shape, whatever its name says, so it is
 * the only one left out.
 */
const CLOSED_UP_PATTERNS = PACK_BODY_DENY_PATTERNS.filter((row) => row.id !== "inline-secret-assignment");

/** A text to scan, labelled for the refusal; `patterns` defaults to the pack's list. */
type RowText = [field: string, text: string, patterns?: readonly DenyPattern[]];

/**
 * Every free text a row carries, labelled for the refusal. A pack's scan reads
 * the whole file, so an own row's reads all of it too: the validator has
 * already held `id`, `transport`, `pinnedVersion` and each variable's `name` to
 * a fixed shape, and the rest is here. `args` also counts joined, since a deny
 * row spans whitespace and two arguments render as one line
 * (`./descriptionScan.ts`).
 *
 * The validator's secret gate calls a reference the cure for an inline credential,
 * so no credential check may read one as a value. That is all it earns: the name
 * inside it is free text a client document prints, and a pack's scan reads it. So
 * `args` are read three ways. Cut at each reference, against the full list, so a
 * literal after a sign still stops. Closed up, since a reference between a
 * directive's words takes nothing out of it. As written, since a name can hold the
 * word a row needs. Closing up is per argument: a brace opened in one and closed in
 * another is no reference.
 */
function rowTexts(definition: PackMcpServerDefinition): RowText[] {
  const { args, requiresEnv = [] } = definition;
  return [
    ["description", definition.description],
    ["blastRadius", definition.blastRadius],
    ["command", definition.command],
    ["packageNameLock", definition.packageNameLock],
    ["docsUrl", definition.docsUrl],
    ...args.flatMap((arg, index) => arg.split(INTERPOLATION).map((text): RowText => [`args[${index}]`, text])),
    ...args.join(" ").split(INTERPOLATION).map((text): RowText => ["args", text]),
    ["args", args.map((arg) => arg.replaceAll(INTERPOLATION, "")).join(" "), CLOSED_UP_PATTERNS],
    ["args", args.join(" "), CLOSED_UP_PATTERNS],
    ...requiresEnv.map((requirement, index): RowText => [
      `requiresEnv[${index}].description`,
      requirement.description,
    ]),
  ];
}

/**
 * Refuse a row whose text carries an injection or a concealment directive.
 * `scanPackBodies` does this for a pack at install, and an own row has no
 * install, so the pack's own list runs here over the row's text. Only pattern
 * ids are reported, since the span is the payload.
 */
function assertCleanText(definition: PackMcpServerDefinition, label: string): void {
  const problems = rowTexts(definition).flatMap(([field, text, patterns = PACK_BODY_DENY_PATTERNS]) => {
    const stripped = text.replace(INVISIBLE_SMUGGLING_CHARS, "");
    const hits = scanNormalized(stripped, patterns);
    if (hits.length === 0) return [];
    return [`${label}: \`${field}\` matches ${[...new Set(hits.map((hit) => hit.patternId))].join(", ")}`];
  });
  if (problems.length === 0) return;
  throw new EngineError(
    `${[...new Set(problems)].join("\n")}\nThese words match known injection or exfiltration patterns, and this ` +
      `text reaches what an agent or a person reads about the server. Reword them.`,
    { code: "VALIDATION_ERROR" },
  );
}

/**
 * A validated definition as the resolution seam's row. Two fields are added
 * rather than read: `firstParty` is fixed `false` (a supplier cannot claim to be
 * the vendor of the service it fronts), and `sourcePackId` records which supply
 * chain a preview or a refusal should name.
 *
 * `requiresEnv` is re-shaped, not copied: a definition states a variable's
 * `description`, which becomes the curated row's `comment`, and supplies no
 * issuing URL — that link exists on a curated row because a maintainer checked
 * it, and an unreviewed one has no place in the credential file. The empty
 * string is the shape `./env.ts` already renders as "no link".
 */
export function toSuppliedServer(
  definition: PackMcpServerDefinition,
  sourcePackId: string,
): PackSuppliedServer {
  const { requiresEnv, ...rest } = definition;
  return {
    ...rest,
    ...(requiresEnv === undefined
      ? {}
      : {
          requiresEnv: requiresEnv.map((requirement) => ({
            name: requirement.name,
            comment: requirement.description,
            url: "",
          })),
        }),
    firstParty: false,
    sourcePackId,
  };
}

/**
 * Every row that clears the bar joined to `packRows`, those rows as the manifest
 * holds them (`kept`), and one message per row that did not clear it.
 */
function resolveOwnRows(
  packRows: readonly PackSuppliedServer[],
  manifest: Pick<SetupManifest, "mcp">,
): { servers: PackSuppliedServer[]; kept: McpOwnServer[]; problems: string[] } {
  const holders = new Map(packRows.map((row) => [row.id, `pack ${row.sourcePackId}`]));
  const own: PackSuppliedServer[] = [];
  const kept: McpOwnServer[] = [];
  const problems: string[] = [];
  for (const [index, row] of (manifest.mcp?.ownServers ?? []).entries()) {
    const label = rowLabel(row, index);
    try {
      assertArgsList(row, label);
      const definition = validatePackMcpServer(row, label);
      assertReferencesClose(definition, label);
      assertCleanText(definition, label);
      const holder = holders.get(definition.id);
      if (holder !== undefined) {
        throw new EngineError(
          `${label}: \`id\` is already supplied by ${holder}. The id is the key the server is ` +
            `emitted under, so one definition would launch in place of the other — rename this row.`,
          { code: "VALIDATION_ERROR" },
        );
      }
      holders.set(definition.id, label);
      own.push(toSuppliedServer(definition, OWN_SERVER_SOURCE));
      kept.push(row);
    } catch (cause) {
      if (!(cause instanceof EngineError)) throw cause;
      problems.push(printableRefusal(cause.message, row));
    }
  }
  const servers = [...packRows, ...own].toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { servers, kept, problems };
}

/**
 * `packRows` with the manifest's own rows merged in, sorted by id, for every
 * lane that emits or resolves a selection. A row that fails the bar, or claims
 * an id another row or a pack holds, refuses the read, naming every such row in
 * one throw: a server the person named must not quietly fail to launch.
 */
export function withOwnServers(
  packRows: readonly PackSuppliedServer[],
  manifest: Pick<SetupManifest, "mcp">,
): PackSuppliedServer[] {
  const { servers, problems } = resolveOwnRows(packRows, manifest);
  if (problems.length > 0) {
    throw new EngineError(problems.join("\n"), { code: "VALIDATION_ERROR" });
  }
  return servers;
}

/**
 * {@link withOwnServers} for the ownership proof, which must answer and never
 * throw. A row that cannot clear the bar contributes nothing, which errs the
 * safe way: an entry the engine can no longer prove it wrote is judged the
 * person's and kept, never deleted unproven.
 */
export function provableOwnServers(
  packRows: readonly PackSuppliedServer[],
  manifest: Pick<SetupManifest, "mcp">,
): PackSuppliedServer[] {
  return resolveOwnRows(packRows, manifest).servers;
}

/**
 * `manifest` as a rendering proof plans it: rows past the bar taken out, and with
 * them each selected id nothing else supplies, which the plan would otherwise
 * refuse as unknown. One bad row must not cost the proof every other file the
 * setup wrote. Never for a plan whose outputs are written: those stay refused
 * through {@link withOwnServers}.
 */
export function provableOwnSetup(
  packRows: readonly PackSuppliedServer[],
  manifest: SetupManifest,
): SetupManifest {
  const { mcp } = manifest;
  if (mcp === undefined) return manifest;
  const { servers, kept } = resolveOwnRows(packRows, manifest);
  const refused = new Set(mcp.ownServers?.filter((row) => !kept.includes(row)).map((row) => row.id));
  const supplied = (id: string): boolean => !refused.has(id) || resolveServerMeta(id, servers) !== undefined;
  return { ...manifest, mcp: { ...mcp, ownServers: kept, servers: mcp.servers.filter(supplied) } };
}
