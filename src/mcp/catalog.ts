/**
 * Curated MCP server catalog — the single source of truth for every server this
 * generator knows how to write into a client config.
 *
 * One table, not three: the server metadata, the platform mapping, and the
 * environment-variable help text all live on the row. A second table anywhere
 * (a per-adapter map, a separate env-help lookup) is a defect — hand-syncing
 * parallel tables is how a server ends up described one way and launched
 * another.
 *
 * Curation discipline: a row exists because it was reviewed, version-pinned,
 * and given a blast-radius rationale. The list is open to growth — new servers
 * are added by meeting that bar, not by passing an arbitrary count budget.
 *
 * A trust-gated pack may ADD a server to a project ({@link PackSuppliedServer},
 * resolved through {@link resolveServerMeta}) under the same pin discipline,
 * enforced at pack ingress. It may never redefine a curated id: this table wins
 * every resolution, and a colliding pack row is refused rather than merged.
 *
 * Supply-chain posture. Every fetch-launched row pins an exact version
 * ({@link McpServerMeta.pinnedVersion}) against an exact package name
 * ({@link McpServerMeta.packageNameLock}). npm forbids republishing a version
 * with different bytes, so an exact pin is effectively content-addressed: a
 * maintainer who publishes a trojaned release cannot reach a pinned consumer
 * without a reviewable version bump. Residual risk: `npx` re-fetches the pinned
 * version from the registry on each launch, so a first-fetch registry or DNS
 * interception is not covered here.
 *
 * Secrets are never inlined. A row names the variables it needs; `./emit.ts`
 * renders the placeholder form each client documents (they are not the same
 * shape — see the citation table in that module's header), and the literal
 * value lives in the operator's environment file, outside version control.
 *
 * Currency is tracked in TWO dates, not one, because they answer different
 * questions and one of them was answering both wrongly.
 * {@link CATALOG_VERIFIED_ON} is the last SWEEP: the day this row set as a whole
 * was walked. {@link McpServerMeta.pinReviewedOn} is per row: the day THAT row's
 * version was last read off its upstream. A single constant let a fresh sweep
 * imply fresh pins, which is the false green that hid a row set whose pins were
 * already superseded upstream on the day the sweep date was written. A pin
 * guarantees immutability, which is exactly why it cannot guarantee currency: a
 * version that was clean on the day it was read stays byte-identical while the
 * world learns it is vulnerable. The advisory sweep in CI
 * (`.github/workflows/ci.yml` → `supply-chain`) is the duty that closes that
 * gap; it ages both dates and queries OSV for advisories against every pinned
 * package.
 *
 * ## Where this table sits in the org-knowledge stack
 *
 * Four layers carry an organisation's context, and this catalog is one of them:
 *
 * 1. **Static** — the charter (`AGENTS.md`) and the rules beside it. Emitted.
 * 2. **Procedural** — skills. Emitted.
 * 3. **Systems-of-record over MCP** — this table. Configured, not emitted:
 *    the engine writes the client config, the operator supplies the credential.
 * 4. **Client-indexed documentation** — Cursor `@docs`, Copilot Spaces.
 *    Documented only; no client exposes an API this engine could write to.
 *
 * Layer 3 is where the honest reading of the rows below matters. `github` is the
 * vendor's own remote endpoint reached through a pinned community stdio bridge.
 * `gitlab` is the vendor's own CLI, and its MCP subcommand is a declared
 * experiment. `azure-devops` and `linear` are COMMUNITY stdio re-implementations,
 * not first-party remote endpoints — `firstParty: false` on each row says so, and
 * nothing here should be read as vendor-operated coverage of those two systems.
 * Atlassian has no row at all: no reviewed, exact-pinnable launcher was
 * identified for it at the last sweep, and a row invented without a verified pin
 * would defeat the pin discipline this table exists to hold. Absence here is
 * recorded rather than quietly filled.
 *
 * A rendered catalog page — the operator-facing accepted-value set for
 * `config set mcp.servers` — does not exist yet. It belongs in the generated
 * docs lane beside the capability matrix, which projects adapter constants the
 * same way this table would be projected.
 */

/**
 * The date the row SET in {@link CURATED_MCP_SERVERS} was last swept: every row
 * present, every row still wanted, no row missing a rationale. Machine-readable
 * so the CI advisory job can age it.
 *
 * It says nothing about whether any individual pin is current — that is
 * {@link McpServerMeta.pinReviewedOn}, one date per row. Reading this constant
 * as pin freshness is the specific misreading the split exists to prevent.
 */
export const CATALOG_VERIFIED_ON = "2026-08-16";

import type { Platform } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";

/** One environment variable a server needs, with the help shown when it is collected. */
export interface McpEnvRequirement {
  /** Variable name as it appears in the environment file. */
  name: string;
  /** One line telling the operator what to create and at what scope. */
  comment: string;
  /** Where the credential is issued. */
  url: string;
}

/** A reviewed, version-pinned MCP server. */
export interface McpServerMeta {
  /** Stable catalog id; also the key under which the server is emitted. */
  id: string;
  /** What the server does, in the operator's terms. */
  description: string;
  /** Launcher executable. */
  command: string;
  /**
   * Full argument vector. For a fetch launcher the package token carries the
   * exact pin (`<packageNameLock>@<pinnedVersion>`); a floating spec — a bare
   * name or `@latest` — is a supply-chain defect, not a shorthand.
   */
  args: readonly string[];
  /**
   * Transport the server speaks. `stdio` runs as a child process with the
   * editor's full privileges — no authentication, no encryption; the absence
   * of a URL is not a security property. `http` reaches a remote endpoint over
   * TLS through a locally launched bridge.
   */
  transport: "stdio" | "http";
  /** Variables that must be set before the server starts. Absent when none are. */
  requiresEnv?: readonly McpEnvRequirement[];
  /**
   * Exact version this row is verified against. For a fetch launcher it is the
   * version embedded in {@link args}; for a host-installed launcher it is the
   * minimum release the invocation is known to work with, since the operator —
   * not this catalog — controls that binary.
   */
  pinnedVersion: string;
  /**
   * ISO date {@link pinnedVersion} was last read off this package's own registry
   * page or repository — per row, deliberately not derived from
   * {@link CATALOG_VERIFIED_ON}. A sweep that confirms the row set is still the
   * right set says nothing about whether this version is still the right
   * version, and collapsing the two into one constant is what let a table of
   * superseded pins report itself fresh. The CI advisory sweep ages this field
   * per row.
   *
   * Optional on the TYPE and required on every CURATED row (asserted in
   * `test/mcp/catalog.test.ts`), because it records a curator's act. A
   * pack-supplied row has no curator in this repository, so it carries none and
   * the sweep reports it as an unreviewed pin rather than reading an absent date
   * as a fresh one.
   */
  pinReviewedOn?: string;
  /**
   * Exact artifact identity: the package name for a fetch launcher, the
   * executable name for a host-installed one. Emission compares against this
   * so a renamed or substituted package fails loudly.
   */
  packageNameLock: string;
  /**
   * True when the server is published by the vendor of the service it fronts,
   * false for a community re-implementation. A trust signal for the operator,
   * not a gate — community rows are pinned to the same standard.
   */
  firstParty: boolean;
  /** Damage scope if the server is compromised or misdriven, plus the mitigation that bounds it. */
  blastRadius: string;
  /** Upstream documentation for the server itself. */
  docsUrl: string;
}

/**
 * A server a third-party pack supplies, resolved for the same emission paths
 * the curated rows feed. Structurally an {@link McpServerMeta} — a pack row is
 * held to the identical pin discipline at ingress (`../pack/manifest.ts` →
 * `validatePackMcpServer`), so nothing downstream needs a second shape — with
 * two narrowings that state where it came from:
 *
 * - `firstParty` is fixed `false`. Vendor-published is a claim about the
 *   publisher of the service being fronted, and a pack cannot make it about
 *   itself; the field is not readable from the pack file at all.
 * - `sourcePackId` names the installed pack the row arrived with, so a
 *   preview, a receipt, or a refusal can say which supply chain owns it.
 */
export interface PackSuppliedServer extends McpServerMeta {
  readonly firstParty: false;
  /** Installed pack the definition shipped in, as the ledger's `pack:<id>` owner spells it. */
  readonly sourcePackId: string;
}

/**
 * The curated set. Ordered systems-of-record first, then general-purpose
 * servers, then the ones that reach production data — roughly ascending blast
 * radius within each group.
 */
export const CURATED_MCP_SERVERS: Record<string, McpServerMeta> = {
  github: {
    id: "github",
    description: "Repository management: code review, issues, pull requests, and project boards.",
    command: "npx",
    args: [
      "-y",
      "mcp-remote@0.1.16",
      "https://api.githubcopilot.com/mcp/",
      "--header",
      "Authorization: Bearer ${env:GITHUB_PAT}",
      "--header",
      "X-MCP-Toolsets: repos,issues,pull_requests",
    ],
    transport: "http",
    requiresEnv: [
      {
        name: "GITHUB_PAT",
        comment:
          "Fine-grained token with Contents, Issues, and Pull requests read/write on the repositories the agent may touch",
        url: "https://github.com/settings/tokens/new",
      },
    ],
    pinnedVersion: "0.1.16",
    pinReviewedOn: "2026-08-16",
    packageNameLock: "mcp-remote",
    firstParty: true,
    blastRadius:
      "High — can merge pull requests, push code, and read private repository contents. The toolset header grants repos/issues/pull_requests only, excluding Actions, org admin, and secret scanning; widening it raises the radius. The remote endpoint is vendor-operated but is reached through the pinned community stdio bridge, which sees every request. Scope the token per-repository and rotate it on a 90-day maximum.",
    docsUrl: "https://github.com/github/github-mcp-server",
  },
  "azure-devops": {
    id: "azure-devops",
    description: "Work items, repos, pipelines, and boards.",
    command: "npx",
    args: ["-y", "@tiberriver256/mcp-server-azure-devops@0.1.45"],
    transport: "stdio",
    requiresEnv: [
      {
        name: "AZURE_DEVOPS_PAT",
        comment: "Personal access token with Work Items, Code, and Build read/write",
        url: "https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate",
      },
      {
        name: "AZURE_DEVOPS_ORG",
        comment: "Organization name exactly as it appears in the project URL",
        url: "https://dev.azure.com/",
      },
    ],
    pinnedVersion: "0.1.45",
    pinReviewedOn: "2026-08-16",
    packageNameLock: "@tiberriver256/mcp-server-azure-devops",
    firstParty: false,
    blastRadius:
      "High — can modify work items, trigger pipelines, and push code across every project the token reaches. Scope the token to the minimum permission set and prefer short expirations over standing access.",
    docsUrl: "https://www.npmjs.com/package/@tiberriver256/mcp-server-azure-devops",
  },
  gitlab: {
    id: "gitlab",
    description: "Issues, merge requests, pipelines, and project management.",
    command: "glab",
    args: ["mcp", "serve"],
    transport: "stdio",
    requiresEnv: [
      {
        name: "GITLAB_TOKEN",
        comment: "Project or group access token with the api scope; read_api is enough for read-only use",
        url: "https://gitlab.com/-/user_settings/personal_access_tokens",
      },
    ],
    pinnedVersion: "1.99.0",
    pinReviewedOn: "2026-08-16",
    packageNameLock: "glab",
    firstParty: true,
    blastRadius:
      "High — can merge requests, modify code, and drive CI/CD; the api scope grants broad project access. Prefer a project-scoped token over a personal one and set an expiration date. The launcher is a host-installed binary, so its version is the operator's to keep current. Maturity: `glab mcp serve` is declared an experiment by its vendor — \"not ready for production use and might be unstable or removed at any time\" (docs.gitlab.com/cli/mcp/serve/, accessed 2026-08-22) — so this row can stop working on a glab upgrade with no deprecation window. Every other row here is a stable published interface; this one is not, and selecting it is accepting that.",
    docsUrl: "https://gitlab.com/gitlab-org/cli",
  },
  context7: {
    id: "context7",
    description: "Version-specific library documentation lookup.",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp@2.1.1"],
    transport: "stdio",
    pinnedVersion: "2.1.1",
    pinReviewedOn: "2026-08-16",
    packageNameLock: "@upstash/context7-mcp",
    firstParty: true,
    blastRadius:
      "Low — read-only lookups against public documentation, no credentials held. Unexpected outbound traffic is the only signal worth watching.",
    docsUrl: "https://github.com/upstash/context7",
  },
  filesystem: {
    id: "filesystem",
    description: "File reads, writes, and edits inside the project directory.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem@2026.1.14", "."],
    transport: "stdio",
    pinnedVersion: "2026.1.14",
    pinReviewedOn: "2026-08-16",
    packageNameLock: "@modelcontextprotocol/server-filesystem",
    firstParty: true,
    blastRadius:
      "Medium — can read, write, and delete anything under the directory it is given, including config files. Keep the allowed root at the project directory; never widen it to the home directory or a system path.",
    docsUrl: "https://github.com/modelcontextprotocol/servers",
  },
  playwright: {
    id: "playwright",
    description: "Browser automation, web testing, and UI interaction.",
    command: "npx",
    args: ["-y", "@playwright/mcp@0.0.68"],
    transport: "stdio",
    pinnedVersion: "0.0.68",
    pinReviewedOn: "2026-08-16",
    packageNameLock: "@playwright/mcp",
    firstParty: true,
    blastRadius:
      "Medium — can navigate to any URL, submit data through a page, and screenshot whatever is on screen. Point it at localhost or staging, block external navigation in CI, and clear browser state between runs.",
    docsUrl: "https://github.com/microsoft/playwright-mcp",
  },
  "brave-search": {
    id: "brave-search",
    description: "Web search for research, fact-checking, and current information.",
    command: "npx",
    args: ["-y", "@brave/brave-search-mcp-server@2.0.83", "--transport", "stdio"],
    transport: "stdio",
    requiresEnv: [
      {
        name: "BRAVE_API_KEY",
        comment: "Search API key; the free tier allows 2,000 queries per month",
        url: "https://brave.com/search/api/",
      },
    ],
    pinnedVersion: "2.0.83",
    pinReviewedOn: "2026-08-16",
    packageNameLock: "@brave/brave-search-mcp-server",
    firstParty: true,
    blastRadius:
      "Low — read-only search. A leaked key exhausts the quota rather than exposing data; rate-limit the key and watch usage for unusual patterns.",
    docsUrl: "https://github.com/brave/brave-search-mcp-server",
  },
  sentry: {
    id: "sentry",
    description: "Error tracking and performance monitoring.",
    command: "npx",
    args: ["-y", "@sentry/mcp-server@0.29.0"],
    transport: "stdio",
    requiresEnv: [
      {
        name: "SENTRY_AUTH_TOKEN",
        comment: "Organization-scoped auth token, read-only where the workflow allows",
        url: "https://sentry.io/settings/account/api/auth-tokens/",
      },
    ],
    pinnedVersion: "0.29.0",
    pinReviewedOn: "2026-08-16",
    packageNameLock: "@sentry/mcp-server",
    firstParty: true,
    blastRadius:
      "Medium — stack traces carry variable values, user identifiers, and file paths into the agent's context. Turn on data scrubbing at the source and prefer a read-only token.",
    docsUrl: "https://github.com/getsentry/sentry-mcp",
  },
  postgres: {
    id: "postgres",
    description: "Database queries and schema inspection.",
    command: "npx",
    args: ["-y", "@henkey/postgres-mcp-server@1.0.5"],
    transport: "stdio",
    requiresEnv: [
      {
        name: "POSTGRES_URL",
        comment: "Connection string for a non-production database, using a role limited to the schemas the agent needs",
        url: "https://www.postgresql.org/docs/current/libpq-connect.html",
      },
    ],
    pinnedVersion: "1.0.5",
    pinReviewedOn: "2026-08-16",
    packageNameLock: "@henkey/postgres-mcp-server",
    firstParty: false,
    blastRadius:
      "Critical — direct database access can read, change, or drop data, and the connection string itself is a credential. Enforce the limit at the database (a role granted only SELECT on named schemas) rather than trusting a server-side read-only flag, and never point it at production.",
    docsUrl: "https://www.npmjs.com/package/@henkey/postgres-mcp-server",
  },
  linear: {
    id: "linear",
    description: "Issue tracking and project management.",
    command: "npx",
    args: ["-y", "@mkusaka/mcp-server-linear@1.0.15"],
    transport: "stdio",
    requiresEnv: [
      {
        name: "LINEAR_API_KEY",
        comment: "Workspace API key, ideally issued to a dedicated service account",
        url: "https://linear.app/settings/api",
      },
    ],
    pinnedVersion: "1.0.15",
    pinReviewedOn: "2026-08-16",
    packageNameLock: "@mkusaka/mcp-server-linear",
    firstParty: false,
    blastRadius:
      "Medium — can read and change issues, projects, and team configuration across the workspace the key belongs to. Use a dedicated account, restrict it to one team where possible, and watch the audit log. Maintenance: a single-maintainer community package with no release since the pinned version, so a defect or an advisory against it has no upstream to land a fix in — the pin will not move because nothing is moving. It holds a workspace read/write key, which is the combination that makes the staleness worth stating rather than merely recording: budget for removing the row, not for waiting on it.",
    docsUrl: "https://www.npmjs.com/package/@mkusaka/mcp-server-linear",
  },
};

/**
 * System-of-record server for each hosting platform. Values are catalog ids;
 * {@link getServerMeta} resolves every one of them.
 */
export const PLATFORM_MCP_SERVER: Record<Platform, string> = {
  github: "github",
  "azure-devops": "azure-devops",
  gitlab: "gitlab",
};

/**
 * Launchers that fetch the package at start-up. For these the version pin has
 * to be in the argument vector, because nothing else constrains what runs.
 */
const FETCH_LAUNCHERS: ReadonlySet<string> = new Set(["npx", "bunx", "uvx", "pipx"]);

/**
 * Catalog row for `id`, or `undefined` when the id is not curated. Own keys
 * only: a bare index would resolve `toString` to an inherited function and hand
 * back something typed as a server row.
 */
export function getServerMeta(id: string): McpServerMeta | undefined {
  return Object.hasOwn(CURATED_MCP_SERVERS, id) ? CURATED_MCP_SERVERS[id] : undefined;
}

/**
 * Resolve `id` against the curated table first and pack supply second, or
 * `undefined` when neither knows it.
 *
 * The order is the security property, not a convenience: an installed pack can
 * ADD a server, never redirect one. If a pack ships an `id` the catalog
 * already curates, this returns the curated row — the pack's launcher is not
 * reachable through a name the operator selected by its curated meaning. The
 * collision is refused outright by {@link assertNoCuratedCollision}, which the
 * install and projection paths run so the pack fails loudly rather than
 * shipping a definition that silently resolves to something else.
 *
 * Called with no pack supply this is exactly {@link getServerMeta}, so a path
 * that has no pack context stays curated-only by construction.
 */
export function resolveServerMeta(
  id: string,
  packServers: readonly PackSuppliedServer[] = [],
): McpServerMeta | PackSuppliedServer | undefined {
  const curated = getServerMeta(id);
  if (curated !== undefined) return curated;
  return packServers.find((server) => server.id === id);
}

/**
 * Refuse pack supply that claims a curated id. Shadowing a curated row is the
 * one thing pack supply must not be able to do — `github` means the reviewed,
 * pinned row, and a pack that redefines it would repoint a name the operator
 * already trusts at a launcher they never reviewed.
 *
 * Reported as one throw naming every colliding id with the pack it came from,
 * so a multi-collision pack is fixed in one pass. Collisions BETWEEN two
 * installed packs are a different question with a different answer, and belong
 * where installed packs are read together (`../pack/projection.ts`), not here.
 */
export function assertNoCuratedCollision(packServers: readonly PackSuppliedServer[]): void {
  const seen = new Set<string>();
  const colliding: string[] = [];
  for (const server of packServers) {
    if (getServerMeta(server.id) === undefined || seen.has(server.id)) continue;
    seen.add(server.id);
    colliding.push(`${JSON.stringify(server.id)} (pack ${JSON.stringify(server.sourcePackId)})`);
  }
  if (colliding.length === 0) return;
  throw new EngineError(
    `Pack-supplied MCP server id(s) collide with the curated catalog: ${colliding.join(", ")}. ` +
      `A curated id always resolves to its reviewed row, so a pack definition under that name ` +
      `could never be launched. Rename the pack's server and re-publish the pack.`,
    { code: "VALIDATION_ERROR" },
  );
}

/**
 * The exact package token a fetch-launched row must carry in {@link
 * McpServerMeta.args}, or `undefined` for a host-installed launcher, whose
 * version lives on the operator's machine rather than in the invocation.
 * Emission uses this to refuse a row whose args have drifted from its pin.
 *
 * Typed on the three fields it reads rather than on the whole row, so pack
 * ingress (`../pack/manifest.ts` → `validatePackMcpServer`) checks a candidate
 * definition against the SAME launcher table instead of copying it. A second
 * fetch-launcher list is exactly the parallel table this module's header bans.
 */
export function pinnedPackageSpec(
  meta: Pick<McpServerMeta, "command" | "packageNameLock" | "pinnedVersion">,
): string | undefined {
  if (!FETCH_LAUNCHERS.has(meta.command)) return undefined;
  return `${meta.packageNameLock}@${meta.pinnedVersion}`;
}

/**
 * Partition requested ids into resolvable and unknown. Never throws — an
 * unknown id is a reportable input, not an exception — and never silently
 * drops one. Input order is preserved and repeats collapse, so a selection
 * listing the same server twice emits it once.
 *
 * `packServers` widens what counts as resolvable to exactly what {@link
 * resolveServerMeta} would return, so a selection is validated against the
 * same table it will be emitted from. Omitted, the answer is curated-only —
 * which is what every caller without pack context means.
 */
export function validateServerIds(
  ids: readonly string[],
  packServers: readonly PackSuppliedServer[] = [],
): { valid: string[]; unknown: string[] } {
  const valid: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (resolveServerMeta(id, packServers) === undefined) unknown.push(id);
    else valid.push(id);
  }
  return { valid, unknown };
}
