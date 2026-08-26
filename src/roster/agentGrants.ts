import {
  AGENT_POLICY_ROSTER,
  GRANTABLE_TOOL_CATEGORIES,
  type AgentPolicyRow,
  type GrantableToolCategory,
} from "./agentPolicies.ts";

/**
 * Agent grant resolution: one answer, read by every grant consumer, for a
 * corpus agent and a pack-supplied agent alike.
 *
 * `./agentPolicies.ts` is the roster of SHIPPED agents, and each consumer used
 * to look grants up in it directly. That is right for the corpus and wrong for
 * everything else: an installed pack's agent has no roster row, so the lookup
 * finds nothing and every emitter writes the narrowest thing it has — an empty
 * `tools:` on a Claude sub-agent, an empty grant in the Codex TOML, a
 * `NO_POLICY` refusal from the generated pre-tool-use guard. The pack installs
 * cleanly and everything it ships is inert, which is the live-emission
 * invariant broken from the far end: a pack may only ship classes the engine
 * emits precisely so an install cannot be structurally dead on arrival.
 *
 * A pack agent's grant therefore comes from its own `capabilities:`
 * frontmatter, bounded twice. The roster wins outright on any runtime id it
 * carries, so an agent file named after a core agent re-states that agent
 * rather than widening it. What survives is intersected with the pack's
 * declared tool footprint, so an agent can never hold a capability its pack did
 * not disclose and the operator did not read in the install preview.
 *
 * Deny-by-default throughout: every unreadable, unknown, or unbounded input
 * resolves to a smaller grant plus a diagnostic, never to a wider one and never
 * to a throw. A resolver that threw would push callers into a catch block whose
 * obvious recovery is "carry on with no policy", which is the same lockout
 * wearing a different hat.
 *
 * Pure and synchronous by construction — no filesystem, no manifest, no I/O.
 * Both enforcement points (the in-process check at the delegation boundary and
 * the policy document the emitted guard parses) call this on the same inputs
 * and must reach the same verdict; a resolver that read anything of its own
 * could not promise that.
 *
 * `src/roster/` may import only `src/types/` and its own siblings — the
 * boundary `./agentPolicies.ts` documents and `test/architecture/boundaries.test.ts`
 * enforces. The pack-side ingress check this module's ceiling depends on
 * (`src/pack/permissions.ts::checkAgentCapabilities`) therefore mirrors the
 * category vocabulary structurally rather than importing it, exactly as the
 * roster mirrors `AgentToolPolicy`; `test/roster/agentGrants.test.ts` binds the
 * two ends, so a taxonomy change fails there instead of at a call site.
 */

/** Where a resolved grant came from. `none` is the deny-by-default floor, not an error. */
export type GrantSource = "roster" | "frontmatter" | "none";

/** One agent's resolved grant, with the reasoning that produced it. */
export interface ResolvedAgentGrant {
  /** The runtime (prefixed) id this grant answers for, echoed back for logging and emission. */
  readonly runtimeId: string;
  /** Categories the agent may use, in {@link GRANTABLE_TOOL_CATEGORIES} order, deduplicated. */
  readonly allow: readonly GrantableToolCategory[];
  /** Which of the two derivation paths answered — or neither. */
  readonly source: GrantSource;
  /** Operator-readable notes: each dropped category, malformed field, and ignored override. */
  readonly diagnostics: readonly string[];
}

/** Everything the resolver rules on. No handle, path, or manifest — see the module header. */
export interface ResolveAgentGrantInput {
  /** Runtime (prefixed) agent id, e.g. `stamity-devops`. Matched exactly against the roster. */
  readonly runtimeId: string;
  /** The agent file's parsed frontmatter. Only `capabilities:` is read. */
  readonly frontmatter: Readonly<Record<string, unknown>>;
  /** Roster to rule against; defaults to the shipped {@link AGENT_POLICY_ROSTER}. */
  readonly roster?: readonly AgentPolicyRow[];
  /**
   * The pack's declared tool footprint — the ceiling a pack agent's frontmatter
   * is intersected with. `undefined` means "there is no pack", true of every
   * corpus agent; a PACK agent arriving without its footprint is a caller
   * defect and resolves to nothing. See {@link resolveAgentGrant}.
   */
  readonly declaredTools?: readonly GrantableToolCategory[];
}

/**
 * Categories no frontmatter can produce, whatever a pack declares and whatever
 * its footprint allows.
 *
 * `spawn` is the whole set, and the roster header says why it is ungranted on
 * every core row: delegation multiplies privilege, because a spawned agent
 * carries its own grant rather than the spawner's. Commands orchestrate from
 * the main thread, delegation depth stays 1, and the day an agent body genuinely
 * delegates that is decided on its own row — by a maintainer, in the corpus,
 * not by an installed pack asserting it in frontmatter.
 */
export const NEVER_DERIVABLE_CATEGORIES: ReadonlySet<GrantableToolCategory> =
  new Set<GrantableToolCategory>(["spawn"]);

/** The frontmatter key that declares an agent's capabilities. */
const CAPABILITIES_FIELD = "capabilities";

/** Membership over `unknown`: frontmatter is parsed data, so its types are claims, not facts. */
const GRANTABLE_LOOKUP: ReadonlySet<string> = new Set<string>(GRANTABLE_TOOL_CATEGORIES);

/** The same set over `string`, so an unvalidated entry can be tested without a cast at each site. */
const NEVER_DERIVABLE_LOOKUP: ReadonlySet<string> = NEVER_DERIVABLE_CATEGORIES;

/** The categories a pack agent may actually be granted, as a message list. */
const DERIVABLE_CATEGORIES: readonly GrantableToolCategory[] = GRANTABLE_TOOL_CATEGORIES.filter(
  (category) => !NEVER_DERIVABLE_LOOKUP.has(category),
);

/** Longest rendered value a diagnostic will quote back; a malformed field is not a payload channel. */
const MAX_QUOTED_VALUE = 60;

/**
 * A pack's declared `permissions.toolFootprint` narrowed to the categories a
 * grant can actually name — canonical order, deduplicated, everything else
 * dropped.
 *
 * `toolFootprint` is validated against the WHOLE taxonomy at manifest ingress,
 * which includes reserved categories that license nothing. A ceiling carrying
 * one would still grant nothing, so echoing it back would overstate what the
 * pack disclosed. Every surface that carries a footprint — the install
 * preview, the receipt that persists it, the projection that reads it back,
 * the four adapters that render a grant from it — narrows through THIS
 * function, so an operator-edited receipt cannot smuggle a category the
 * taxonomy does not grant, and no two surfaces can disagree about what a
 * footprint means.
 *
 * `undefined` in, `[]` out: absent and empty are the same disclosure, and both
 * are a real ceiling of nothing rather than an absent one. Whether an agent
 * has a pack ceiling AT ALL is the caller's distinction, carried by passing
 * `declaredTools` or omitting it (see {@link resolveAgentGrant}).
 */
export function grantableFootprint(
  declared: readonly string[] | undefined,
): GrantableToolCategory[] {
  if (declared === undefined || declared.length === 0) return [];
  const set = new Set<string>(declared);
  return GRANTABLE_TOOL_CATEGORIES.filter((category) => set.has(category));
}

/** `"read", "edit"` — a value list for diagnostics, never assembled by hand. */
function list(values: readonly string[]): string {
  return values.map((value) => JSON.stringify(value)).join(", ");
}

/** `read, edit` — a category list for prose, with a word rather than an empty gap for none. */
function describeCategories(values: readonly string[]): string {
  return values.length === 0 ? "no categories" : values.join(", ");
}

/** A value rendered for a message: JSON where it serialises, its type otherwise, always bounded. */
function describeValue(value: unknown): string {
  const rendered = JSON.stringify(value) ?? typeof value;
  return rendered.length <= MAX_QUOTED_VALUE
    ? rendered
    : `${rendered.slice(0, MAX_QUOTED_VALUE)}…`;
}

/**
 * A rejected entry's label: the raw value, plus the id it nearly spells.
 *
 * Matching is EXACT — `"Read"` and `" read "` are both rejected, both on
 * purpose. The mistake that spells a category wrong is the same one that would
 * silently acquire a grant under a forgiving matcher, and a capability list is
 * the last place to be generous about what an author meant. Trimming appears
 * only here, in the message: normalising for a hint is help, normalising for
 * the match would be a grant.
 */
function describeRejected(entry: unknown): string {
  if (typeof entry !== "string") return describeValue(entry);
  const trimmed = entry.trim();
  return GRANTABLE_LOOKUP.has(trimmed) && trimmed !== entry
    ? `${JSON.stringify(entry)} (did you mean ${JSON.stringify(trimmed)}? ids match exactly — no case folding, no surrounding whitespace)`
    : JSON.stringify(entry);
}

/** {@link parseCapabilities} plus the reasoning it discards. */
interface ReadCapabilities {
  /** What a grant can be derived from: the claim minus every never-derivable category. */
  readonly categories: GrantableToolCategory[];
  /**
   * What the frontmatter CLAIMED — canonical order, deduplicated, unknown
   * entries dropped, never-derivable ones KEPT.
   *
   * The distinction is the whole point of carrying two lists. `categories` is
   * an answer and must not contain `spawn`; a claim of `spawn` is a fact about
   * the file, and comparing a file to its roster row on the post-strip list
   * compared it as if the one category the roster never grants had never been
   * asserted (see {@link resolveAgentGrant}).
   */
  readonly claimed: GrantableToolCategory[];
  readonly diagnostics: string[];
}

/**
 * Read `capabilities:` off a frontmatter map, dropping everything that is not a
 * derivable grant and explaining each drop. Subject-free: {@link resolveAgentGrant}
 * prefixes the agent id, so one sentence reads the same wherever it surfaces.
 */
function readCapabilities(frontmatter: Readonly<Record<string, unknown>>): ReadCapabilities {
  const diagnostics: string[] = [];
  const raw = Object.hasOwn(frontmatter, CAPABILITIES_FIELD)
    ? frontmatter[CAPABILITIES_FIELD]
    : undefined;

  if (raw === undefined) {
    diagnostics.push(
      `declares no \`${CAPABILITIES_FIELD}:\` frontmatter, so no grant can be derived from it.`,
    );
    return { categories: [], claimed: [], diagnostics };
  }
  if (!Array.isArray(raw)) {
    diagnostics.push(
      `\`${CAPABILITIES_FIELD}:\` must be an array of tool categories (got ${describeValue(raw)}); ` +
        `nothing is derived from a field that cannot be read.`,
    );
    return { categories: [], claimed: [], diagnostics };
  }

  const entries: readonly unknown[] = raw;
  if (entries.length === 0) {
    diagnostics.push(
      `declares an empty \`${CAPABILITIES_FIELD}:\` list — an explicit empty grant, not a missing one.`,
    );
    return { categories: [], claimed: [], diagnostics };
  }

  const granted = new Set<string>();
  const rejected: string[] = [];
  const refused = new Set<string>();
  for (const entry of entries) {
    if (typeof entry !== "string" || !GRANTABLE_LOOKUP.has(entry)) {
      rejected.push(describeRejected(entry));
      continue;
    }
    if (NEVER_DERIVABLE_LOOKUP.has(entry)) {
      refused.add(entry);
      continue;
    }
    granted.add(entry);
  }

  if (rejected.length > 0) {
    diagnostics.push(
      `dropped ${rejected.join(", ")} — not a grantable tool category. ` +
        `Grantable: ${DERIVABLE_CATEGORIES.join(", ")}.`,
    );
  }
  if (refused.size > 0) {
    diagnostics.push(
      `dropped ${list([...refused])} — never derivable from frontmatter, because a delegated ` +
        `agent carries its own grant rather than this one. Delegation depth stays 1.`,
    );
  }

  // Canonical order and dedup in one pass: two spellings of one grant, in any
  // order, produce byte-identical emission on every client.
  return {
    categories: GRANTABLE_TOOL_CATEGORIES.filter((category) => granted.has(category)),
    claimed: GRANTABLE_TOOL_CATEGORIES.filter(
      (category) => granted.has(category) || refused.has(category),
    ),
    diagnostics,
  };
}

/**
 * The grantable categories a frontmatter map's `capabilities:` field declares —
 * canonical order, deduplicated, `spawn` and every unknown entry dropped.
 *
 * Returns `[]` for an absent, non-array, or malformed field. The reasoning
 * behind a result is available from {@link resolveAgentGrant}, which is what
 * emission and enforcement call; this is the derivation on its own, for a
 * caller that has already established the frontmatter path applies.
 */
export function parseCapabilities(
  frontmatter: Readonly<Record<string, unknown>>,
): GrantableToolCategory[] {
  return readCapabilities(frontmatter).categories;
}

/**
 * Resolve one agent's grant.
 *
 * Precedence is core-wins, and the order is the security property:
 *
 * 1. **Roster row.** A runtime id the roster carries is answered by that row,
 *    verbatim. The frontmatter is read only to compare against it, never to
 *    change the answer: a pack shipping `agents/stamity-reviewer.md` with a
 *    wider `capabilities:` list gets the row and a diagnostic saying so. The
 *    comparison runs over what the file CLAIMED, `spawn` included — the one
 *    category no frontmatter can ever be granted is also the one a note most
 *    needs to name, and comparing post-strip made asserting it read as
 *    agreement.
 * 2. **Frontmatter, under the pack ceiling.** No row means a pack agent, whose
 *    declared capabilities are intersected with `declaredTools`. That footprint
 *    is what the operator read in the install preview, so nothing outside it
 *    can be granted after the fact.
 * 3. **Nothing.** No row and no derivable capability resolves to `[]` with
 *    source `none` — the unchanged `NO_POLICY` posture every emitter already
 *    renders fail-closed.
 *
 * `declaredTools` being `undefined` is "there is no pack", true of every corpus
 * agent. Reaching step 2 with it undefined therefore means a pack agent arrived
 * without its pack's footprint, which is a caller defect: the answer is `[]`
 * and a diagnostic, because trusting frontmatter with no ceiling grants exactly
 * what the ceiling exists to bound.
 *
 * An empty `allow` is a first-class outcome, not a gap. Consumers keep
 * rendering it as an explicit empty grant (`tools: ""` on Claude, an empty
 * grant plus a read-only sandbox on Codex); omitting the key instead is the
 * WIDEST grant a Claude sub-agent can carry, which is the inversion this module
 * exists to prevent.
 */
export function resolveAgentGrant(input: ResolveAgentGrantInput): ResolvedAgentGrant {
  const { runtimeId, frontmatter, roster = AGENT_POLICY_ROSTER, declaredTools } = input;
  const note = (message: string): string => `${runtimeId}: ${message}`;

  const row = roster.find((candidate) => candidate.agentId === runtimeId);
  if (row !== undefined) {
    // Silent on the ordinary path: a core agent's own file mirrors its row, so
    // saying "ignored" on every corpus agent would be noise that teaches
    // consumers to skip diagnostics. The note fires only when the frontmatter
    // would have produced a DIFFERENT grant — a pack shipping a file under a
    // core id, or a corpus file that has drifted from its row.
    const declared = readCapabilities(frontmatter);
    const rowGrant = new Set<string>(row.allow);
    // Compared on the CLAIM, not on what a grant could have been derived from.
    // `spawn` is stripped before derivation, so comparing the post-strip list
    // made a pack asserting the one category the roster never grants compare
    // EQUAL to the row it was trying to widen — silence on exactly the claim
    // this note exists to report.
    const differs =
      Object.hasOwn(frontmatter, CAPABILITIES_FIELD) &&
      (declared.claimed.length !== rowGrant.size ||
        declared.claimed.some((category) => !rowGrant.has(category)));
    const diagnostics = differs
      ? [
          // The reading of the field comes first — "dropped `spawn`, never
          // derivable" is the sentence that names WHY a claim is not a grant —
          // and the override note follows it.
          ...declared.diagnostics.map((message) => note(message)),
          note(
            `resolved from the agent policy roster (${describeCategories(row.allow)}); ` +
              `the supplied \`${CAPABILITIES_FIELD}:\` frontmatter claims ` +
              `${describeCategories(declared.claimed)} and was ignored, ` +
              `because a pack cannot widen — or narrow — a core agent's grant by shipping a file under its id.`,
          ),
        ]
      : [];
    // The row IS the answer, returned as authored: a consumer swapping its own
    // roster lookup for this call emits byte-identical core agent files.
    return { runtimeId, allow: row.allow, source: "roster", diagnostics };
  }

  const declared = readCapabilities(frontmatter);
  const diagnostics = declared.diagnostics.map((message) => note(message));

  if (declared.categories.length === 0) {
    return { runtimeId, allow: [], source: "none", diagnostics };
  }
  if (declaredTools === undefined) {
    diagnostics.push(
      note(
        `has no roster row and no declared tool footprint, so nothing is granted. A pack agent ` +
          `reaches this resolver with its pack's footprint; resolving one without it is a caller ` +
          `defect, not an unbounded grant.`,
      ),
    );
    return { runtimeId, allow: [], source: "none", diagnostics };
  }

  const ceiling = new Set<string>(declaredTools);
  const allow = declared.categories.filter((category) => ceiling.has(category));
  const dropped = declared.categories.filter((category) => !ceiling.has(category));
  if (dropped.length > 0) {
    // Rendered from the canonical order, and only over categories that are
    // grantable at all: a footprint carrying a reserved or unknown id licenses
    // nothing, so naming it back would overstate what the pack disclosed.
    const footprint = GRANTABLE_TOOL_CATEGORIES.filter((category) => ceiling.has(category));
    diagnostics.push(
      note(
        `dropped ${list(dropped)} — outside the pack's declared tool footprint ` +
          `(${footprint.length === 0 ? "the pack declares none" : footprint.join(", ")}). ` +
          `An agent holds no capability its pack did not disclose at install.`,
      ),
    );
  }
  return { runtimeId, allow, source: "frontmatter", diagnostics };
}
