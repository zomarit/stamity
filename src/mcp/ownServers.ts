import {
  CONTENT_DENY_PATTERNS,
  INJECTION_PATTERNS,
  INVISIBLE_SMUGGLING_CHARS,
  MCP_POISONING_PATTERNS,
  scanNormalized,
  type DenyPattern,
} from "../denyscan/denyScan.ts";
import { validatePackMcpServer, type PackMcpServerDefinition } from "../pack/manifest.ts";
import { EngineError } from "../types/errors.ts";
import { MANIFEST_FILE, type SetupManifest } from "../types/manifest.ts";
import { STATE_DIR } from "../types/markers.ts";
import type { PackSuppliedServer } from "./catalog.ts";

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
 * through {@link provableOwnServers}, while every lane that emits reads through
 * {@link withOwnServers} and refuses.
 */

/**
 * The `sourcePackId` of an own row. A pack name cannot start with a colon
 * (`PACK_NAME_PATTERN` in `../pack/manifest.ts`), so no installed pack can claim
 * this source, and `clean --pack` can never take an own row with it.
 */
export const OWN_SERVER_SOURCE = ":own";

/**
 * The two mask rows pack ingress promotes to refusals (`PACK_BODY_PROMOTED_ROWS`
 * in `../pack/manifest.ts`). Named again here because that table is private to a
 * file this seam does not own.
 */
const PROMOTED_MASK_ROWS: ReadonlySet<string> = new Set([
  "homoglyph-instruction-mask",
  "combining-mark-instruction-mask",
]);

/** The refusal-grade rows of the pack body scan, at their shipped windows. */
const OWN_TEXT_DENY_PATTERNS: readonly DenyPattern[] = [
  ...CONTENT_DENY_PATTERNS,
  ...INJECTION_PATTERNS,
  ...MCP_POISONING_PATTERNS,
].filter((row) => row.severity === "block" || PROMOTED_MASK_ROWS.has(row.id));

/** The two fields an agent reads as a server's own account of itself. */
const SCANNED_FIELDS = ["description", "blastRadius"] as const;

/** Where a row sits, by place and, when it has one, by id: the person fixes it there. */
function rowLabel(row: unknown, index: number): string {
  const id = (row as { id?: unknown } | null)?.id;
  const named = typeof id === "string" && id !== "" ? ` (${JSON.stringify(id)})` : "";
  return `${STATE_DIR}/${MANIFEST_FILE} mcp.ownServers[${index}]${named}`;
}

/**
 * Refuse a row whose text carries an injection or a concealment directive.
 * `scanPackBodies` does this for a pack at install, and an own row has no
 * install, so the same vocabulary runs here over the text itself. Only pattern
 * ids are reported, since the span is the payload.
 */
function assertCleanText(definition: PackMcpServerDefinition, label: string): void {
  const problems = SCANNED_FIELDS.flatMap((field) => {
    const stripped = definition[field].replace(INVISIBLE_SMUGGLING_CHARS, "");
    const hits = scanNormalized(stripped, OWN_TEXT_DENY_PATTERNS);
    if (hits.length === 0) return [];
    return [`${label}: \`${field}\` matches ${[...new Set(hits.map((hit) => hit.patternId))].join(", ")}`];
  });
  if (problems.length === 0) return;
  throw new EngineError(
    `${problems.join("\n")}\nThese words match known injection or exfiltration patterns, and an ` +
      `agent reads this text as the server's own account of itself. Reword them.`,
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

/** Every row that clears the bar joined to `packRows`, and one message per row that did not. */
function resolveOwnRows(
  packRows: readonly PackSuppliedServer[],
  manifest: Pick<SetupManifest, "mcp">,
): { servers: PackSuppliedServer[]; problems: string[] } {
  const holders = new Map(packRows.map((row) => [row.id, `pack ${row.sourcePackId}`]));
  const own: PackSuppliedServer[] = [];
  const problems: string[] = [];
  for (const [index, row] of (manifest.mcp?.ownServers ?? []).entries()) {
    const label = rowLabel(row, index);
    try {
      const definition = validatePackMcpServer(row, label);
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
    } catch (cause) {
      if (!(cause instanceof EngineError)) throw cause;
      problems.push(cause.message);
    }
  }
  const servers = [...packRows, ...own].toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { servers, problems };
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
