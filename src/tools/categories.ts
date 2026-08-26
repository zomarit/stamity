/**
 * Tool-category taxonomy — the privilege vocabulary shared by agent policies,
 * client-side guard scripts, and the per-client frontmatter transforms.
 *
 * Categories exist because tool NAMES are client dialect: the same "read a
 * file" capability is `Read` on one client, `read_file` on another, and a
 * shell invocation on a third. A policy that enumerated names would have to be
 * rewritten per client and would silently under-deny on any client whose name
 * table drifted. Naming the capability instead keeps one policy authoritative
 * across every client, and pushes the dialect into a single mapping seam
 * ({@link ToolCategoryMap}) that each client owns.
 *
 * Zero-import leaf: the taxonomy is data every other tool module reads, so it
 * depends on nothing.
 */

/**
 * Categories that grant a distinct real capability. These six are the whole
 * privilege envelope a policy can hand out — every check that asks "is this
 * grant too broad?" measures against this set, not against
 * {@link ALL_TOOL_CATEGORIES}.
 *
 * - `read`     — inspect the workspace without changing it: file reads, code
 *                search, directory listing.
 * - `edit`     — create, modify, or delete files in the workspace.
 * - `execute`  — run commands: tests, linters, builds, and anything else that
 *                reaches a shell.
 * - `network`  — leave the machine: web fetch/search, MCP server calls.
 * - `spawn`    — delegate to another agent. Held separately from `execute`
 *                because delegation multiplies privilege: a spawned agent
 *                carries its own grant, so this is the one category whose
 *                blast radius is not bounded by the tools it names.
 * - `planning` — session-local planning surfaces (todo/plan tools) that change
 *                nothing outside the conversation.
 */
export const FUNCTIONAL_TOOL_CATEGORIES = [
  "read",
  "edit",
  "execute",
  "network",
  "spawn",
  "planning",
] as const;

/**
 * Declared but inert categories. Both collapse into a functional category on
 * every client that exists today — git is driven through the shell (`execute`)
 * and board operations through MCP (`network`) — so granting one would widen
 * nothing while reading like an extra privilege.
 *
 * They stay named rather than deleted so a future client with a first-class
 * git or board tool has a slot to map onto without a taxonomy migration. Until
 * then no policy can grant them: access checks deny a tool that maps here, and
 * policy derivation strips them.
 */
export const RESERVED_TOOL_CATEGORIES = ["git", "board"] as const;
export type ReservedToolCategory = (typeof RESERVED_TOOL_CATEGORIES)[number];

/** The full category vocabulary — functional grants first, reserved names last. */
export const ALL_TOOL_CATEGORIES = [
  ...FUNCTIONAL_TOOL_CATEGORIES,
  ...RESERVED_TOOL_CATEGORIES,
] as const;
export type ToolCategory = (typeof ALL_TOOL_CATEGORIES)[number];

const VALID_TOOL_CATEGORIES: ReadonlySet<string> = new Set(ALL_TOOL_CATEGORIES);
const RESERVED_LOOKUP: ReadonlySet<string> = new Set(RESERVED_TOOL_CATEGORIES);

/**
 * Membership test over `unknown`, not over `string`: rosters and policy
 * documents arrive as parsed data, so the declared type is a claim to be
 * checked rather than a guarantee to be trusted.
 */
export function isToolCategory(value: unknown): value is ToolCategory {
  return typeof value === "string" && VALID_TOOL_CATEGORIES.has(value);
}

/** Whether `value` is one of the inert {@link RESERVED_TOOL_CATEGORIES}. */
export function isReservedToolCategory(value: unknown): value is ReservedToolCategory {
  return typeof value === "string" && RESERVED_LOOKUP.has(value);
}

// ── Mapping seam ─────────────────────────────────────────────────

/**
 * Client-native tool name → category. The lookup direction an access check
 * needs: a client hands over the tool it is about to call, and the engine has
 * to resolve it to a category before it can rule on it.
 */
export type ToolCategoryMap = Readonly<Record<string, ToolCategory>>;

/**
 * Category → the client-native tool names it covers. The authoring direction:
 * a client's tool table is naturally written per capability, and every entry
 * is visible at a glance under the category it grants.
 */
export type CategoryToolNames = Partial<Readonly<Record<ToolCategory, readonly string[]>>>;

/**
 * Invert an authored {@link CategoryToolNames} table into the
 * {@link ToolCategoryMap} an access check reads.
 *
 * Iteration follows {@link ALL_TOOL_CATEGORIES}, not the key order of the
 * literal, so the result is identical however the source table was written —
 * two clients whose tables differ only in key order produce byte-identical
 * maps, and a re-ordered literal is never a behaviour change.
 *
 * A tool name listed under two categories resolves to the earlier one in
 * canonical order, which is the narrower grant: functional categories precede
 * reserved ones, and `read` precedes everything that mutates. A double listing
 * is a table bug either way, and resolving it toward less privilege keeps the
 * bug from widening access.
 */
export function buildToolCategoryMap(names: CategoryToolNames): ToolCategoryMap {
  const map: Record<string, ToolCategory> = Object.create(null) as Record<string, ToolCategory>;
  for (const category of ALL_TOOL_CATEGORIES) {
    for (const tool of names[category] ?? []) {
      if (tool === "" || map[tool] !== undefined) continue;
      map[tool] = category;
    }
  }
  return map;
}
