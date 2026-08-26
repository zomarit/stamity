/**
 * MCP client emission: ONE catalog, five client dialects.
 *
 * Every supported client reads a different document — Claude Code `.mcp.json`,
 * Cursor `.cursor/mcp.json`, VS Code `.vscode/mcp.json` (`servers` key), the
 * Copilot coding agent's repo-settings entries, Codex `config.toml`. The
 * server definitions behind all five come from `./catalog.ts` and nowhere
 * else: a per-client table is the defect this module exists to prevent, since
 * hand-synced tables are how one client ends up launching a version another
 * client no longer runs.
 *
 * ## Pack supply renders as curated supply
 *
 * A trust-gated pack may ADD a server ({@link McpRenderOptions.packServers},
 * resolved through `./catalog.ts` → `resolveServerMeta`). Nothing below asks
 * where a row came from: a pack row takes the same pin enforcement, the same
 * per-dialect placeholder rewrite, and the same package name-lock comparison a
 * curated row takes, because a supply chain that emits under laxer rules is a
 * supply chain worth attacking. What pack supply cannot do is REDIRECT a
 * curated id — the resolution order settles that in the catalog, and the
 * collision is refused before it reaches here.
 *
 * ## Credentials never leave the environment
 *
 * A literal token is never written into a client config. Each dialect gets the
 * reference form ITS OWN client documents — not a shape borrowed from a
 * neighbour, which is a config that reads as if it works and does not:
 *
 * | dialect        | reference form              | resolved by                  |
 * |----------------|-----------------------------|------------------------------|
 * | `claude-json`  | `${VAR}`                    | the client, from the environment |
 * | `cursor-json`  | `${env:VAR}`                | the client, from the environment |
 * | `vscode-json`  | `${input:var}` + an `inputs` entry | VS Code, by prompting once |
 * | `copilot-env`  | `$COPILOT_MCP_VAR`          | the operator, into an Agents secret or variable |
 * | `codex-toml`   | `env_vars = ["VAR"]` — the NAME only | Codex, forwarding the shell's value |
 *
 * Citations, one per row, each with the date the form was read off the vendor's
 * own documentation:
 *
 * - Claude Code — `${VAR}` and `${VAR:-default}`, expandable in `command`,
 *   `args`, `env`, `url`, `headers`. An unresolved reference is left as literal
 *   text with a warning, which is precisely why the shape has to be right:
 *   code.claude.com/docs/en/mcp § "Environment variable expansion in
 *   `.mcp.json`" (accessed 2026-08-16). `${env:VAR}` is NOT this client's
 *   syntax — it is Cursor's, and emitting it here produced a config that loads
 *   and then hands the server an unexpanded string.
 * - Cursor — `${env:VAR}` in `.cursor/mcp.json`:
 *   cursor.com/docs/context/mcp (accessed 2026-08-16).
 * - VS Code — `${input:<id>}` bound to an `inputs` entry, prompted once and
 *   stored by the editor; `${env:VAR}` also exists but defeats the point of an
 *   input: code.visualstudio.com/docs/copilot/chat/mcp-servers § "Configuration
 *   format" (accessed 2026-08-16).
 * - Copilot coding agent — MCP credentials are supplied as **Agents** secrets or
 *   variables named `COPILOT_MCP_*`, configured under repository Settings →
 *   Copilot → MCP servers. Actions secrets are a different store and are NOT
 *   available here: "Only Agents secrets and variables with names prefixed with
 *   `COPILOT_MCP_` will be available to your MCP configuration."
 *   docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/extend-cloud-agent-with-mcp
 *   (accessed 2026-08-22). The emitted `.env`-shaped file lists the NAMES an
 *   operator must create, and performs no substitution itself. Naming the wrong
 *   store is not a cosmetic slip: an operator who creates the Actions secret
 *   gets a green-looking repository and a server that never receives a
 *   credential.
 * - Codex — a stdio server's environment is an ALLOWLIST, not an inheritance.
 *   `[mcp_servers.<id>]` takes `env` (a table of literal values, set on the
 *   child) and `env_vars` (a list of variable NAMES to allow and forward from
 *   the environment Codex itself runs in):
 *   learn.chatgpt.com/docs/extend/mcp?surface=cli (the canonical redirect target
 *   of developers.openai.com/codex/mcp, accessed 2026-08-22).
 *
 * **Codex gets `env_vars`, never `env`.** Codex interpolates nothing in
 * `config.toml`, so a `$VAR` written into an `env` VALUE is not a placeholder —
 * it is the literal string the child receives, which SHADOWS the variable of the
 * same name and breaks authentication by construction (a `GITHUB_PAT` of the
 * eleven characters `$GITHUB_PAT`). So the `env` table stays banned. What
 * replaces it is `env_vars`, carrying the variable NAME and nothing else: the
 * value stays in the operator's shell and Codex forwards it. The earlier
 * rationale — "child processes inherit the shell, so emitting nothing is
 * enough" — was the wrong half of the truth. Emitting nothing means the name is
 * not on the allowlist, so the value is not forwarded, so every authenticated
 * Codex MCP call fails with nothing on screen at emission time.
 *
 * **Codex withholds credential-bearing ARGUMENTS.** The same no-interpolation
 * fact reaches the argument vector: `--header "Authorization: Bearer
 * ${env:GITHUB_PAT}"` renders to `$GITHUB_PAT` in every other dialect and is
 * expanded by that client, while Codex hands the argument to the spawn verbatim
 * and the server authenticates with eleven literal characters. `env_vars`
 * cannot rescue it — it populates the process environment, not the argv. So the
 * codex dialect drops such arguments (with the option flag they belong to) and
 * emits the operator instruction in their place, naming exactly what was
 * withheld and why. A config that is missing a header is a config the operator
 * can fix; a config that carries a broken one is a support ticket.
 *
 * ## Pinning is enforced at emission, not assumed
 *
 * {@link assertExactPin} refuses to emit a row whose argument vector has
 * drifted from its `packageNameLock@pinnedVersion`, carries a floating spec
 * (`@latest`, `@^1`), or — for a host-installed launcher — whose command no
 * longer matches the locked executable name. A pin that is only documented in
 * the catalog is not a supply-chain control; a pin checked on the way out is.
 */

import {
  parseMcpJsonDocument,
  reduceMcpDocumentToUserContent,
} from "../manifest/mcpFilter.ts";
import type { CoOwnedReducer } from "../types/content.ts";
import { TOOLS, type Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import { STATE_DIR } from "../types/markers.ts";
import { scanMcpEntry } from "./descriptionScan.ts";
import {
  CURATED_MCP_SERVERS,
  pinnedPackageSpec,
  resolveServerMeta,
  type McpServerMeta,
  type PackSuppliedServer,
} from "./catalog.ts";

// ── Types ────────────────────────────────────────────────────────

/** A client configuration format. One catalog, five renderings. */
export type McpDialect =
  | "claude-json"
  | "cursor-json"
  | "vscode-json"
  | "copilot-env"
  | "codex-toml";

/**
 * Why a document is being rendered.
 *
 * `emit` is the write path: every supply-chain gate runs and a failure is a
 * refusal. `probe` is {@link engineOwnedServerIds} re-rendering an entry only to
 * compare bytes with what is already on disk — nothing it produces is written,
 * so the write-path gates are not merely unnecessary there, they are harmful.
 * A gate that throws turns a read-only ownership proof into an aborted reclaim,
 * and a gate that prints turns it into console noise from inside the engine.
 */
type RenderMode = "emit" | "probe";

/** One planned document: what to write, where, in which dialect. */
export interface McpEmission {
  dialect: McpDialect;
  /** Repo-relative target path. */
  path: string;
  /** Full document content, newline-terminated. */
  content: string;
}

/**
 * What a render needs beyond the selected ids. Both fields are optional and
 * omitting them is the curated-only, unpinned-protocol answer — the shape
 * every caller without pack or manifest context means.
 */
export interface McpRenderOptions {
  /**
   * Protocol revision to pin in the Claude document. Advisory, and emitted
   * only when the manifest carries one, so an unpinned setup has no key to
   * drift.
   */
  protocolVersion?: string;
  /**
   * Servers the installed packs supply (`../pack/projection.ts` →
   * `packMcpServers`). Widens which ids RESOLVE; it never widens which ids are
   * selected — that stays `manifest.mcp.servers`.
   */
  packServers?: readonly PackSuppliedServer[];
}

// ── Constants ────────────────────────────────────────────────────

/** Where each dialect's document lands, repo-relative. */
const DIALECT_PATH: Record<McpDialect, string> = {
  "claude-json": ".mcp.json",
  "cursor-json": ".cursor/mcp.json",
  "vscode-json": ".vscode/mcp.json",
  "copilot-env": `${STATE_DIR}/mcp/copilot-repo-settings.env`,
  "codex-toml": ".codex/config.toml",
};

/**
 * The dialects whose document is a shared JSON file the operator also edits.
 *
 * These three are the only emissions that must be MERGED rather than written:
 * a client's MCP file is common ground, so an entry the engine never wrote is
 * the operator's and survives (`../manifest/mcpFilter.ts`). The other two are
 * engine-owned whole files — the Copilot repo-settings env document lives under
 * the state directory, and `.codex/config.toml` is composed by the codex
 * residue as one document.
 */
const MERGED_JSON_DIALECTS: readonly McpDialect[] = ["claude-json", "cursor-json", "vscode-json"];

/** Repo-relative paths of the three merged JSON documents. */
export const MERGED_MCP_JSON_PATHS: ReadonlySet<string> = new Set(
  MERGED_JSON_DIALECTS.map((dialect) => DIALECT_PATH[dialect]),
);

/**
 * The server ids an existing document at `path` can be proved to hold on the
 * engine's behalf: every id the engine is emitting NOW, plus any catalog id
 * whose on-disk entry is byte-identical to what the engine renders for it.
 *
 * The second half is what makes deselection work without name-based ownership.
 * A deselected server is absent from the current emission, so nothing would
 * claim it and its entry would linger forever; matching it against the engine's
 * own rendering proves authorship the way a recorded hash does in the reclaim
 * sweep. An operator who tuned their `github` block no longer matches, so their
 * definition is unmanaged and untouchable — which is the whole point of asking
 * the bytes instead of the name.
 *
 * `packServers` widens the ids that half considers to exactly the ids this
 * module can render. A pack id left out would be judged an unowned USER row:
 * its entry would then survive deselection forever, and — worse — the merge
 * lane (`../manifest/mcpFilter.ts`) would preserve the stale definition instead
 * of refreshing it, so a pack whose next version bumps its pin would keep
 * launching the old one. Pack-supplied means engine-owned.
 */
export function engineOwnedServerIds(
  path: string,
  selectedIds: readonly string[],
  existingRaw: string | null,
  packServers: readonly PackSuppliedServer[] = [],
): Set<string> {
  const owned = new Set(selectedIds);
  const dialect = MERGED_JSON_DIALECTS.find((candidate) => DIALECT_PATH[candidate] === path);
  if (dialect === undefined || existingRaw === null) return owned;

  const existing = parseServersMap(existingRaw);
  if (existing === null) return owned;

  const renderableIds = [
    ...Object.keys(CURATED_MCP_SERVERS),
    ...packServers.map((server) => server.id),
  ];
  const candidateIds = [...new Set(renderableIds)].filter((id) => id in existing);
  if (candidateIds.length === 0) return owned;

  // PROBE render, not a write render. This function is the ownership proof the
  // reclaim and pack-uninstall lanes run BEFORE they may touch anything, so it
  // must answer or say nothing — never throw. A write render asserts every pin
  // and screens every description, so a catalog row that drifted since the
  // document was written would abort the very sweep that exists to clean up
  // after it, and the advisory scan would print to the console from inside a
  // read-only proof.
  const canonical = parseServersMap(renderDialect(dialect, candidateIds, { packServers }, "probe"));
  if (canonical === null) return owned;

  for (const id of candidateIds) {
    const mine = canonical[id];
    if (mine !== undefined && JSON.stringify(existing[id]) === JSON.stringify(mine)) owned.add(id);
  }
  return owned;
}

/**
 * One reducer per merged client document, for the reclaim sweep's co-owned lane
 * (`../merge/reclaim.ts` → `ReclaimOptions.coOwnedPaths`). Every caller of that
 * sweep owes it this map for the same reason they all owe it `trustedInfraPaths`:
 * without it, the sweep judges a hash match over these three paths as proof of
 * sole authorship and unlinks a document the operator co-authored.
 *
 * Bound per PATH because ownership is per dialect. {@link engineOwnedServerIds}
 * proves authorship by re-rendering the entry the way THAT document spells it,
 * so Cursor's `${env:VAR}` form and VS Code's `${input:var}` form each compare
 * against their own rendering instead of against a shared one that matches
 * neither.
 *
 * The empty `selectedIds` is the lane's defining fact, not an omission: the
 * sweep reaches a path only once no emission produces it, so nothing is selected
 * to keep, and every id the engine can still prove it wrote is one it must take
 * with it. `packServers` widens what "can prove" reaches to the pack-supplied
 * ids exactly as it does on the write lanes — without it an uninstall leaves a
 * third-party entry behind, still launching with the `.env.mcp` credential.
 */
export function mcpReclaimReducers(
  packServers: readonly PackSuppliedServer[] = [],
): Map<string, CoOwnedReducer> {
  return new Map(
    [...MERGED_MCP_JSON_PATHS].map((path) => [
      path,
      (content: string): ReturnType<CoOwnedReducer> =>
        reduceMcpDocumentToUserContent(
          content,
          engineOwnedServerIds(path, [], content, packServers),
        ),
    ]),
  );
}

/**
 * The servers map of a JSON document across EVERY recognised spelling; `null`
 * when the document is unreadable.
 *
 * Delegated to `../manifest/mcpFilter.ts::parseMcpJsonDocument` rather than
 * re-derived here. A local copy read one spelling while the merge lane treated
 * both as engine territory, so a document carrying `mcpServers` AND `servers`
 * had half its entries judged unattributable here and dropped there. One parser
 * is the fix; a second reader of the same bytes is the defect.
 */
function parseServersMap(raw: string): Record<string, unknown> | null {
  const parsed = parseMcpJsonDocument(raw);
  return parsed.ok ? parsed.servers : null;
}

/**
 * Dialects each tool consumes. `copilot` takes two: the editor reads
 * `.vscode/mcp.json`, while the cloud coding agent is configured from repo
 * settings and never sees a file in the working tree.
 */
const TOOL_DIALECTS: Record<Tool, readonly McpDialect[]> = {
  claude: ["claude-json"],
  cursor: ["cursor-json"],
  copilot: ["vscode-json", "copilot-env"],
  codex: ["codex-toml"],
};

/** Prefix the Copilot coding agent requires on every secret it may read. */
const COPILOT_SECRET_PREFIX = "COPILOT_MCP_";

/** The catalog's own placeholder syntax, rewritten per dialect on the way out. */
const ENV_TOKEN_PATTERN = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * Argument tokens that resolve to "whatever is newest at launch". Matched
 * against a `@`-suffixed package spec only, so a scoped package name
 * (`@upstash/context7-mcp`) and a URL argument never trip it.
 */
const FLOATING_SPEC_PATTERN = /@(?:latest|next|beta|canary|\*|\^|~|>=?|<=?)/;

// ── Placeholders ─────────────────────────────────────────────────

/**
 * How `varName` is referenced inside `dialect`. Three shapes across five
 * dialects — see the table in the module header — so a caller rendering its
 * own fragment (a doc snippet, a setup instruction) produces the same token
 * the emitter would.
 */
export function envPlaceholder(dialect: McpDialect, varName: string): string {
  switch (dialect) {
    case "claude-json":
      // `${VAR}`, not `${env:VAR}` — see the citation table in the module
      // header. Claude Code leaves an unresolvable reference as literal text,
      // so the wrong spelling ships a working-looking config that hands the
      // server the placeholder itself.
      return `\${${varName}}`;
    case "cursor-json":
      return `\${env:${varName}}`;
    case "vscode-json":
      return `\${input:${inputId(varName)}}`;
    case "copilot-env":
      return `$${COPILOT_SECRET_PREFIX}${upperSnake(varName)}`;
    case "codex-toml":
      // Codex expands nothing, so this is a MARKER for a human reading the
      // file, not an expansion — which is why no `env` table is emitted from
      // it (see `codexTable`): as a marker in an argument it is inert text a
      // reader recognises, but as an `env` VALUE it would become the child's
      // actual credential and shadow the inherited one.
      return `$${varName}`;
  }
}

/** VS Code input ids are lowercase-kebab by convention: `GITHUB_PAT` → `github-pat`. */
function inputId(varName: string): string {
  return varName.toLowerCase().replaceAll("_", "-");
}

/** `brave-search` → `BRAVE_SEARCH`; the shape both env vars and secret names take. */
function upperSnake(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9]+/g, "_").toUpperCase();
}

/** Rewrite every catalog placeholder in `value` into `dialect`'s reference form. */
function retarget(value: string, dialect: McpDialect): string {
  return value.replaceAll(ENV_TOKEN_PATTERN, (_match, name: string) =>
    envPlaceholder(dialect, name),
  );
}

/** Every `${env:` opener, whatever follows it — including the ones no rewrite consumes. */
const ENV_TOKEN_OPENER = /\$\{env:/g;

/**
 * Refuse an argument carrying a `${env:` opener the rewrite cannot consume.
 *
 * Counted on the CATALOG value rather than tested on the rendered one, because
 * one dialect's reference form IS the catalog's — Cursor spells it `${env:VAR}`
 * too — so a residual token is indistinguishable from a correct rendering after
 * the fact. Comparing openers against {@link ENV_TOKEN_PATTERN} matches asks the
 * question that actually decides it: did every reference in this argument get
 * rewritten?
 *
 * A row that writes `${env:MY-VAR}`, `${env:}`, or `${env:2FA}` has a name
 * outside `[A-Za-z_][A-Za-z0-9_]*`, so nothing rewrites it and it lands on disk
 * verbatim in every dialect. Each client then hands the server the placeholder
 * itself instead of a credential — a 401 at run time, from a config file that
 * reads as if it were right. It is a catalog defect and the emitter is the last
 * place that can see it, so this refuses rather than warns: unlike a
 * description-scan hit, there is no reading of it under which the emitted
 * document works.
 */
function assertEveryEnvTokenRewritten(meta: McpServerMeta, original: string): void {
  const openers = (original.match(ENV_TOKEN_OPENER) ?? []).length;
  if (openers === referencedVars(original, { collapse: false }).length) return;
  throw new EngineError(
    `MCP server "${meta.id}" argument ${JSON.stringify(original)} carries a \${env:…} ` +
      `reference no client dialect can rewrite. Only \${env:NAME} with NAME matching ` +
      `[A-Za-z_][A-Za-z0-9_]* is rewritten, so this one would be written to disk verbatim and ` +
      `passed to the server as text rather than as a credential. Fix the catalog row's variable ` +
      `name, and declare it in that row's requiresEnv.`,
    { code: "VALIDATION_ERROR" },
  );
}

// ── Resolution + pinning ─────────────────────────────────────────

/**
 * Rows for `serverIds`, in the caller's order with repeats collapsed, resolved
 * against the curated table first and pack supply second (`./catalog.ts` →
 * `resolveServerMeta`, whose ordering is what stops a pack redirecting a
 * curated name).
 *
 * An unknown id throws rather than being dropped: emission is a write path,
 * and silently omitting a server the operator selected produces a config that
 * looks complete and is not. The commonest way to reach this today is a pack
 * uninstalled while one of its servers was still selected — its id stops
 * resolving, and a document that quietly lost the server would be a working
 * setup that stops working with nothing on screen. The message therefore leads
 * with the deselection command rather than with the catalog.
 */
function resolveServers(
  serverIds: readonly string[],
  packServers: readonly PackSuppliedServer[] = [],
  mode: RenderMode = "emit",
): McpServerMeta[] {
  const seen = new Set<string>();
  const resolved: McpServerMeta[] = [];
  const unknown: string[] = [];

  for (const id of serverIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const meta = resolveServerMeta(id, packServers);
    if (meta === undefined) unknown.push(id);
    else resolved.push(meta);
  }

  if (mode === "probe") {
    // Every gate below is a WRITE-path gate, and this render is never written.
    // An unresolvable id is simply not a candidate for the ownership proof; a
    // drifted pin still describes what the engine used to write and is exactly
    // what the proof has to compare against.
    return resolved;
  }

  if (unknown.length > 0) {
    throw new EngineError(
      `Unknown MCP server id(s): ${unknown.join(", ")}. Nothing resolves them — neither the ` +
        `curated catalog nor any installed pack — so no client document can be written. Run ` +
        `${unknown.map((id) => `\`config mcp remove ${id}\``).join(" ")} to drop ` +
        `${unknown.length === 1 ? "it" : "them"} from the selection, re-install the pack that ` +
        `supplied ${unknown.length === 1 ? "it" : "them"}, or add a reviewed, version-pinned row ` +
        `to the curated catalog.`,
      { code: "VALIDATION_ERROR" },
    );
  }

  for (const meta of resolved) assertExactPin(meta);
  for (const finding of scanResolvedDescriptions(resolved)) console.error(finding);
  return resolved;
}

/**
 * Screen every resolved row's description, command, and argument vector for
 * tool-poisoning vocabulary, on the way out.
 *
 * The scanner existed and had no caller, while its own module docstring claimed
 * it ran "every time server config is generated". Wiring it before supply
 * widened is why it now covers pack rows for free: it sits at the resolution
 * seam, so every row that can be rendered has passed it, whatever table it came
 * from. This is not the pack deny scan — that ran at ingress over the whole
 * definition and is not repeated here — but the narrower tool-poisoning read of
 * the fields an agent is shown.
 *
 * ADVISORY, deliberately: these rows are curator-reviewed and pinned, so a hit
 * here is far more likely to be a false positive on honest prose than a live
 * poisoning, and failing emission on one would take a working setup down over a
 * regex. A hit is reported where the operator sees it and the emission proceeds.
 *
 * Pure: it RETURNS findings rather than printing them, so the probe render can
 * call the resolution seam without a read-only ownership proof narrating itself
 * to the console. The one caller that prints is the write path in
 * {@link resolveServers}, which is where an operator is watching. Handing the
 * findings all the way back to that caller as data — so a CLI surface renders
 * them beside its other output instead of the engine writing to stderr — is the
 * remaining half, and it moves the assertion in `test/mcp/descriptionScan.ts`
 * that pins the console call as emission's proof of wiring.
 */
function scanResolvedDescriptions(servers: readonly McpServerMeta[]): string[] {
  const reported: string[] = [];
  for (const meta of servers) {
    const findings = scanMcpEntry({
      id: meta.id,
      description: meta.description,
      command: meta.command,
      args: [...meta.args],
    });
    for (const finding of findings) {
      reported.push(
        `MCP description scan: ${finding}. The server is still emitted — review the row in the ` +
          `catalog before trusting what it tells an agent to do.`,
      );
    }
  }
  return reported;
}

/**
 * Refuse to emit a row whose launch vector no longer matches its lock. Two
 * shapes: a fetch launcher must carry `packageNameLock@pinnedVersion` verbatim
 * in its arguments and nothing floating beside it; a host-installed launcher's
 * command must be the locked executable, since the operator — not the catalog
 * — controls that binary's version.
 */
function assertExactPin(meta: McpServerMeta): void {
  const spec = pinnedPackageSpec(meta);

  if (spec === undefined) {
    if (meta.command !== meta.packageNameLock) {
      throw pinError(
        meta,
        `launches "${meta.command}" but its package name lock is "${meta.packageNameLock}"`,
      );
    }
    return;
  }

  if (!meta.args.includes(spec)) {
    throw pinError(meta, `arguments do not carry the pinned package spec "${spec}"`);
  }

  const floating = meta.args.find((arg) => FLOATING_SPEC_PATTERN.test(arg));
  if (floating !== undefined) {
    throw pinError(meta, `argument "${floating}" is a floating version spec`);
  }
}

function pinError(meta: McpServerMeta, detail: string): EngineError {
  return new EngineError(
    `MCP server "${meta.id}" ${detail}. Emission refuses an unpinned launch: ` +
      `fix the catalog row so its arguments reference ` +
      `${meta.packageNameLock}@${meta.pinnedVersion} exactly.`,
    { code: "VALIDATION_ERROR" },
  );
}

// ── Shared shaping ───────────────────────────────────────────────

/** Arguments as `dialect` should see them, refusing any reference no rewrite reaches. */
function args(meta: McpServerMeta, dialect: McpDialect): string[] {
  return meta.args.map((arg) => {
    assertEveryEnvTokenRewritten(meta, arg);
    return retarget(arg, dialect);
  });
}

/**
 * Catalog variable names `value` references, in order. Repeats collapse by
 * default — the caller naming variables in a comment wants each once — and
 * `collapse: false` keeps every occurrence, which is what makes the count
 * comparable with the raw opener count.
 */
function referencedVars(value: string, opts: { collapse?: boolean } = {}): string[] {
  const names = [...value.matchAll(ENV_TOKEN_PATTERN)].map(([, name]) => name as string);
  return opts.collapse === false ? names : [...new Set(names)];
}

/** `VAR -> reference` map for a row's credentials, or `undefined` when it needs none. */
function envMap(meta: McpServerMeta, dialect: McpDialect): Record<string, string> | undefined {
  if (meta.requiresEnv === undefined || meta.requiresEnv.length === 0) return undefined;
  return Object.fromEntries(
    meta.requiresEnv.map((requirement) => [
      requirement.name,
      envPlaceholder(dialect, requirement.name),
    ]),
  );
}

/** Every credential the selection needs, first-seen order, one entry per name. */
function requiredEnv(servers: readonly McpServerMeta[]): { name: string; comment: string }[] {
  const byName = new Map<string, string>();
  for (const meta of servers) {
    for (const requirement of meta.requiresEnv ?? []) {
      if (!byName.has(requirement.name)) byName.set(requirement.name, requirement.comment);
    }
  }
  return [...byName].map(([name, comment]) => ({ name, comment }));
}

/** 2-space JSON with a trailing newline — the shape every JSON dialect writes. */
function jsonDocument(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Collapse a catalog string to one line, for a context that has no escape (comment, description). */
function oneLine(value: string): string {
  return value.replaceAll(/[\r\n]+/g, " ").trim();
}

// ── Dialects ─────────────────────────────────────────────────────

/**
 * Claude Code `.mcp.json`. `protocolVersion` is advisory — Claude negotiates
 * the revision itself — and is emitted only when the manifest pins one, so an
 * unpinned setup carries no key to drift.
 */
export function emitClaudeMcpJson(
  serverIds: readonly string[],
  opts?: McpRenderOptions,
  mode: RenderMode = "emit",
): string {
  const servers = resolveServers(serverIds, opts?.packServers, mode);
  return jsonDocument({
    ...(opts?.protocolVersion === undefined ? {} : { protocolVersion: opts.protocolVersion }),
    mcpServers: stdioEntries(servers, "claude-json"),
  });
}

/** Cursor `.cursor/mcp.json` — same `mcpServers` shape, same placeholder syntax. */
export function emitCursorMcpJson(
  serverIds: readonly string[],
  opts?: McpRenderOptions,
  mode: RenderMode = "emit",
): string {
  return jsonDocument({
    mcpServers: stdioEntries(resolveServers(serverIds, opts?.packServers, mode), "cursor-json"),
  });
}

/**
 * VS Code `.vscode/mcp.json`: a `servers` map plus the `inputs` VS Code
 * prompts for. Every credential becomes a password input rather than an
 * environment read, because VS Code resolves inputs itself and stores the
 * answer in its own secret storage — the editor is started from the desktop
 * session far more often than from a sourced shell.
 */
export function emitVsCodeServersJson(
  serverIds: readonly string[],
  opts?: McpRenderOptions,
  mode: RenderMode = "emit",
): string {
  const servers = resolveServers(serverIds, opts?.packServers, mode);
  return jsonDocument({
    inputs: requiredEnv(servers).map((requirement) => ({
      type: "promptString",
      id: inputId(requirement.name),
      description: oneLine(requirement.comment),
      password: true,
    })),
    servers: stdioEntries(servers, "vscode-json", { type: "stdio" }),
  });
}

/**
 * Copilot coding-agent repo-settings entries: one per selected server, named
 * `COPILOT_MCP_<SERVER>`, valued with that server's configuration as a single
 * JSON line. Credentials appear only as `$COPILOT_MCP_*` references to **Agents**
 * secrets or variables (not Actions secrets — a different store, unreadable from
 * MCP configuration) — this list is rendered into a file in the working tree, so
 * a literal value must never reach it. That holds for a pack-supplied row too:
 * this dialect emits secret NAMES, and a pack row's credentials go through the
 * same `envMap` reference rewrite, so pack supply never becomes the first
 * entry that writes a VALUE here.
 */
export function emitCopilotMcpEnv(
  serverIds: readonly string[],
  opts?: McpRenderOptions,
  mode: RenderMode = "emit",
): { name: string; value: string }[] {
  return resolveServers(serverIds, opts?.packServers, mode).map((meta) => {
    const env = envMap(meta, "copilot-env");
    return {
      name: `${COPILOT_SECRET_PREFIX}${upperSnake(meta.id)}`,
      value: JSON.stringify({
        type: "local",
        command: meta.command,
        args: args(meta, "copilot-env"),
        ...(env === undefined ? {} : { env }),
        tools: ["*"],
      }),
    };
  });
}

/**
 * Codex `config.toml` fragment: one `[mcp_servers.<id>]` table per server.
 * An empty selection emits the bare `[mcp_servers]` table — the empty-map
 * spelling — because sub-tables define their parent implicitly and there is
 * otherwise no key to be present-but-empty.
 */
export function emitCodexToml(
  serverIds: readonly string[],
  opts?: McpRenderOptions,
  mode: RenderMode = "emit",
): string {
  const servers = resolveServers(serverIds, opts?.packServers, mode);
  if (servers.length === 0) return "# No MCP servers selected.\n[mcp_servers]\n";

  return `${servers.map(codexTable).join("\n\n")}\n`;
}

/**
 * The codex argument vector, split into what may be written and what may not.
 *
 * Codex hands `args` to the spawn verbatim — no shell, no interpolation — so an
 * argument built around a catalog credential reference cannot be emitted as
 * text. `--header "Authorization: Bearer $GITHUB_PAT"` does not authenticate
 * with the token; it authenticates with eleven literal characters, and the
 * server answers 401 while the file reads as if it were configured. `env_vars`
 * does not rescue it: that populates the child's environment, not its argv.
 *
 * A withheld VALUE takes its option FLAG with it. `--header` left standing alone
 * is a different failure — an argument parse error at the server, or worse, the
 * next argument silently consumed as the header — so the pair leaves together.
 * The flag is recognised as an argument that starts with `-` and carries no
 * `=`, which is the shape that takes a following value; an inline `--flag=value`
 * is self-contained and drops on its own.
 */
function codexArgVector(meta: McpServerMeta): {
  emitted: string[];
  withheld: { rendered: string; vars: string[] }[];
} {
  const rendered = args(meta, "codex-toml");
  const emitted: string[] = [];
  const withheld: { rendered: string; vars: string[] }[] = [];

  for (const [index, original] of meta.args.entries()) {
    const vars = referencedVars(original);
    const value = rendered[index] as string;
    if (vars.length === 0) {
      emitted.push(value);
      continue;
    }
    const flag = emitted.at(-1);
    if (flag !== undefined && flag.startsWith("-") && !flag.includes("=")) {
      emitted.pop();
      withheld.push({ rendered: `${flag} ${tomlString(value)}`, vars });
    } else {
      withheld.push({ rendered: tomlString(value), vars });
    }
  }
  return { emitted, withheld };
}

/**
 * One `[mcp_servers.<id>]` table: `command`, the writable `args`, and `env_vars`
 * when the row needs a credential. Deliberately WITHOUT an `env` table.
 *
 * Codex performs no substitution in `config.toml`, so `env = { GITHUB_PAT =
 * "$GITHUB_PAT" }` does not reference a variable — it SETS the child's
 * `GITHUB_PAT` to the eleven-character string `$GITHUB_PAT`, shadowing the real
 * value the shell would otherwise have passed down and breaking authentication
 * every time. `env_vars` is the key that carries a NAME instead of a value:
 * Codex reads the variable from its own environment and forwards it, so the
 * credential never enters the file. Both keys are documented for a stdio server
 * (learn.chatgpt.com/docs/extend/mcp?surface=cli, accessed 2026-08-22), and the
 * distinction between them is the whole of this function's correctness.
 *
 * A row needing NO credential emits no `env_vars` key at all rather than an
 * empty array: an empty allowlist is a statement about forwarding, and the row
 * has nothing to say about it.
 */
function codexTable(meta: McpServerMeta): string {
  const lines = [`# ${meta.id} — ${oneLine(meta.description)}`];
  const required = (meta.requiresEnv ?? []).map((requirement) => requirement.name);
  const { emitted, withheld } = codexArgVector(meta);

  if (required.length > 0) {
    lines.push(
      `# Requires ${required.join(", ")} in the shell that starts the CLI. Codex expands ` +
        `nothing in this file, and a stdio server's environment is an allowlist rather than an ` +
        `inheritance — env_vars below names the variable so Codex forwards the value your shell ` +
        `holds, and the value itself never enters this file. Source .env.mcp before running codex.`,
    );
  }
  if (withheld.length > 0) {
    lines.push(
      `# Withheld from args, because Codex passes arguments to the server verbatim and these ` +
        `would arrive as literal text rather than as the credential they reference:`,
      ...withheld.map((entry) => `#   ${entry.rendered}   (needs ${entry.vars.join(", ")})`),
      `# env_vars cannot cover them — it fills the process environment, not the argument vector. ` +
        `Supply them from a launcher script that builds the argument at start-up, or drive this ` +
        `server from a client that expands config references (.mcp.json, .cursor/mcp.json).`,
    );
  }
  lines.push(`[mcp_servers.${tomlKey(meta.id)}]`);
  lines.push(`command = ${tomlString(meta.command)}`);
  lines.push(`args = [${emitted.map(tomlString).join(", ")}]`);
  if (required.length > 0) {
    lines.push(`env_vars = [${required.map(tomlString).join(", ")}]`);
  }
  return lines.join("\n");
}

/**
 * `{ command, args, env? }` per server, keyed by catalog id. Shared by every
 * JSON dialect; `extra` carries the keys one client needs and another rejects.
 */
function stdioEntries(
  servers: readonly McpServerMeta[],
  dialect: McpDialect,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  for (const meta of servers) {
    const env = envMap(meta, dialect);
    entries[meta.id] = {
      ...extra,
      command: meta.command,
      args: args(meta, dialect),
      ...(env === undefined ? {} : { env }),
    };
  }
  return entries;
}

// ── TOML rendering ───────────────────────────────────────────────

const TOML_BARE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

function tomlKey(key: string): string {
  return TOML_BARE_KEY_PATTERN.test(key) ? key : tomlString(key);
}

function tomlString(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");
  return `"${escaped}"`;
}

// ── Planning ─────────────────────────────────────────────────────

/**
 * Every document the requested tools need, in a fixed order regardless of the
 * caller's: tools emit in declaration order and each tool's dialects in the
 * order it consumes them, so the same selection always plans the same list and
 * a repeated tool plans once.
 *
 * Planning only — nothing here touches the filesystem. The caller owns merge
 * decisions and ledger accounting for each returned path.
 */
export function planMcpEmissions(
  serverIds: readonly string[],
  tools: readonly Tool[],
  opts?: McpRenderOptions,
): McpEmission[] {
  const requested = TOOLS.filter((tool) => tools.includes(tool));
  const dialects = [...new Set(requested.flatMap((tool) => TOOL_DIALECTS[tool]))];

  return dialects.map((dialect) => ({
    dialect,
    path: DIALECT_PATH[dialect],
    content: renderDialect(dialect, serverIds, opts),
  }));
}

function renderDialect(
  dialect: McpDialect,
  serverIds: readonly string[],
  opts: McpRenderOptions | undefined,
  mode: RenderMode = "emit",
): string {
  switch (dialect) {
    case "claude-json":
      return emitClaudeMcpJson(serverIds, opts, mode);
    case "cursor-json":
      return emitCursorMcpJson(serverIds, opts, mode);
    case "vscode-json":
      return emitVsCodeServersJson(serverIds, opts, mode);
    case "copilot-env":
      return renderCopilotEnvFile(serverIds, opts, mode);
    case "codex-toml":
      return emitCodexToml(serverIds, opts, mode);
  }
}

/**
 * {@link emitCopilotMcpEnv} rendered as the env-shaped file the operator
 * copies from. Secret NAMES are listed; no assignment for a secret exists, so
 * the file never becomes a place someone pastes a token into and commits.
 */
function renderCopilotEnvFile(
  serverIds: readonly string[],
  opts?: McpRenderOptions,
  mode: RenderMode = "emit",
): string {
  const servers = resolveServers(serverIds, opts?.packServers, mode);
  const secrets = requiredEnv(servers).map(
    (requirement) => `${COPILOT_SECRET_PREFIX}${upperSnake(requirement.name)}`,
  );

  const header = [
    "# GitHub Copilot coding agent — MCP configuration, one entry per selected server.",
    "# Paste each value into repository Settings → Copilot → MCP servers.",
  ];
  if (secrets.length > 0) {
    header.push(
      "# Credentials resolve from Agents secrets or variables, which must be named:",
      ...secrets.map((name) => `#   ${name}`),
      "# Agents, not Actions: only Agents secrets and variables prefixed COPILOT_MCP_ are",
      "# available to MCP configuration, so an Actions secret of the same name is never read.",
      "# Never put a secret VALUE in this file — it is not gitignored.",
    );
  }

  const entries = emitCopilotMcpEnv(serverIds, opts, mode).map(
    (entry) => `${entry.name}=${entry.value}`,
  );
  return `${[...header, ...entries].join("\n")}\n`;
}
