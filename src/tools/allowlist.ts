import type { FailureLogEntry } from "../resilience/failureLog.ts";
import {
  ALL_TOOL_CATEGORIES,
  isReservedToolCategory,
  isToolCategory,
  type ToolCategory,
  type ToolCategoryMap,
} from "./categories.ts";

/**
 * Per-agent tool allowlists: deny-by-default authorization over the category
 * taxonomy in `./categories.ts`.
 *
 * The engine holds the MECHANISM only. Every function here takes the roster as
 * a parameter and no default roster ships — which agents exist, and what each
 * may do, is content, and content changes on a different clock than the check
 * that enforces it. A hardcoded roster would also make the engine untestable
 * without the real agent set and would silently deny every agent a downstream
 * consumer added.
 *
 * A policy set is not always one roster, either: the document planner composes
 * the shipped rows PLUS a row per installed-pack agent it is handed
 * (`../emit/hooksInfra.ts`, resolved by `../roster/agentGrants.ts`) — the
 * provenance {@link AgentPolicySource} records. The hand-off is pending: the
 * emission composer does not supply pack agents yet, so a production document
 * today carries roster rows alone. Nothing here privileges one origin over the
 * other — a row is a row, and the caller decides which rows exist and in what
 * order.
 *
 * ONE enforcement point reads this policy set today, and it is the client-side
 * one: {@link buildAgentToolPoliciesJson} serializes the roster for the
 * generated guard script, which is the only thing standing in front of a tool
 * call once the agent is running inside a client the engine has handed off to.
 * Every emitted byte of that document flows from this module.
 *
 * The in-process half is BUILT BUT UNWIRED, and the previous wording claimed a
 * second, in-process point that does not run. {@link checkToolAccess} — with
 * {@link getAgentToolPolicy}, {@link deriveUserAgentPolicy},
 * {@link onAllowlistDenial} and {@link toFailureLogEntry} behind it — has zero
 * production call sites; the delegation boundary it was written for does not
 * call it. It is exercised by this repo's suite and by nothing else.
 *
 * That distinction is load-bearing rather than cosmetic: an operator told there
 * is a pair would take a denial as defence-in-depth when the guard script is in
 * fact the whole of it, and would mis-price a guard the client fails open on.
 * The sanitizing described below is therefore not
 * belt-and-braces — it is the only filter between a roster row and what a
 * running agent is permitted, which is why the emitted document is
 * pre-sanitized to exactly what {@link checkToolAccess} WOULD authorize.
 *
 * Wiring the check at the delegation boundary is what would make a second point
 * real; until then this header states the single point that exists.
 * `../roster/agentPolicies.ts` — the roster this mechanism reads — now states
 * it too. Sibling headers still describing a pair carry the same correction
 * pending; rather than list them here, where the list rots as each one lands,
 * `test/tools/allowlist.test.ts` holds the set under a delete-only ratchet, so
 * it can shrink to nothing but no new file can join it.
 */

// ── Types ────────────────────────────────────────────────────────

/**
 * Where a grant came from, for an operator auditing privilege in the emitted
 * document: the shipped roster, or the installed pack that supplied the agent.
 *
 * Optional on {@link AgentToolPolicy} and omitted on every shipped roster row,
 * which is what keeps a pack-unaware document byte-identical to a document
 * built after this field existed. An absent `source` therefore reads as core —
 * the field earns its bytes only where the answer is not already obvious, and
 * the one case it is not obvious is a row an install added.
 */
export type AgentPolicySource =
  | { readonly kind: "core" }
  | { readonly kind: "pack"; readonly packId: string };

/** One agent's grant. */
export interface AgentToolPolicy {
  /** Agent identifier, matched exactly — see {@link getAgentToolPolicy}. */
  agentId: string;
  /** Categories this agent may use. Empty means it may use nothing. */
  allow: readonly ToolCategory[];
  /**
   * Client-native tool names denied regardless of category — the escape hatch
   * for one dangerous member of an otherwise needed category. Outranks
   * {@link allow}: a denied name stays denied however the category resolves.
   */
  denyTools?: readonly string[];
  /** Why this agent holds this grant. Read by operators auditing privilege. */
  rationale: string;
  /**
   * Provenance of the grant ({@link AgentPolicySource}). Absent on core rows.
   * Read by nothing in {@link checkToolAccess}: privilege is decided by
   * {@link allow} alone, so a mislabelled source can misinform an audit but can
   * never widen a verdict.
   */
  source?: AgentPolicySource;
}

/** Verdict for one (agent, tool) pair. */
export interface ToolAccessResult {
  allowed: boolean;
  /** Resolved category, or `null` when the tool mapped to none. */
  category: ToolCategory | null;
  /** Operator-facing explanation — always populated, allow and deny alike. */
  reason: string;
}

/** Machine-readable denial code, so consumers never string-match {@link ToolAccessResult.reason}. */
export type AllowlistDenialReason =
  /** No roster entry for the agent. */
  | "unknown-agent"
  /** The tool resolved to a category the agent does not hold. */
  | "category-denied"
  /**
   * Denied at the tool name rather than the category: either the name is on
   * the policy's `denyTools`, or it maps to no category at all. Both are
   * name-level facts, and both are fixed by editing a name list.
   */
  | "tool-denied"
  /** The tool maps to a reserved category, which no policy can grant. */
  | "reserved-category";

/** Emitted on every denial. Carries no timestamp — see {@link toFailureLogEntry}. */
export interface AllowlistDenialEvent {
  agentId: string;
  /** The client-native tool name that was requested. */
  tool: string;
  reason: AllowlistDenialReason;
}

export type AllowlistDenialListener = (event: AllowlistDenialEvent) => void;

/** Phase written on every denial that reaches the failure log. */
export const ALLOWLIST_FAILURE_PHASE = "tool-allowlist";

/**
 * Envelope discriminator on the emitted policy document.
 *
 * Unchanged by the optional per-row `source` field: a reader that predates it
 * ignores an unknown key, and a reader that knows it treats absence as core, so
 * both directions of the version skew answer identically. A discriminator bump
 * is for a change that would make an older reader wrong — this one does not.
 */
export const AGENT_TOOL_POLICIES_SCHEMA = "stamity/agent-tool-policies/v1";

/**
 * File name {@link buildAgentToolPoliciesJson}'s output is written under.
 *
 * Named here, in the module that owns the document, because writer and reader
 * are generated separately: the guard script hardcodes a path to this file, and
 * a literal repeated on both sides drifts into a guard that silently reads
 * nothing — the failure mode of a policy file being missing is an unenforced
 * allowlist, not a crash.
 */
export const AGENT_TOOL_POLICIES_FILE = "agent-tool-policies.json";

// ── Denial events ────────────────────────────────────────────────

const denialListeners = new Set<AllowlistDenialListener>();

/**
 * Subscribe to denials; returns an unsubscribe.
 *
 * The registry is process-wide because a denial is a security event whose sink
 * (failure log, telemetry) is wired once at startup, far from the call sites
 * that trigger it — threading a callback through every access check would put
 * an observability concern in the signature of an authorization decision.
 *
 * Registration is by function identity: subscribing the same function twice is
 * one subscription. The returned unsubscribe is idempotent and only ever
 * removes its own registration, so a stale copy cannot detach a listener that
 * re-subscribed after it.
 */
export function onAllowlistDenial(listener: AllowlistDenialListener): () => void {
  denialListeners.add(listener);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    denialListeners.delete(listener);
  };
}

function emitDenial(event: AllowlistDenialEvent): void {
  for (const listener of denialListeners) {
    try {
      listener(event);
    } catch {
      // A broken sink must never change an authorization outcome, and must not
      // hide the denials queued behind it. The verdict is already decided at
      // this point; notification is best-effort by construction.
      continue;
    }
  }
}

function deny(
  agentId: string,
  tool: string,
  category: ToolCategory | null,
  reason: AllowlistDenialReason,
  message: string,
): ToolAccessResult {
  emitDenial({ agentId, tool, reason });
  return { allowed: false, category, reason: message };
}

// ── Access checks ────────────────────────────────────────────────

/**
 * Look up an agent's policy. Exact, case-sensitive match: agent ids are
 * identifiers, and a case-insensitive match would let `Stamity-Reviewer` inherit
 * the grant of a different roster row.
 *
 * A linear scan over a roster of a few rows costs less than the map that would
 * replace it, and a cached map would serve a stale roster the moment a caller
 * passed a different one. First entry wins on a duplicated id — a duplicate is
 * a roster bug, reported by {@link validateToolPolicies}.
 */
export function getAgentToolPolicy(
  roster: readonly AgentToolPolicy[],
  agentId: string,
): AgentToolPolicy | undefined {
  return roster.find((policy) => policy.agentId === agentId);
}

/**
 * Rule on one tool call. Deny-by-default at every step: an unrostered agent, a
 * tool the client's map does not name, a reserved category, and a category the
 * agent does not hold all deny, and nothing authorizes by omission.
 *
 * Resolution order is name-level checks before category-level ones, so the
 * denial code always names the narrowest true cause: an explicitly denied tool
 * reports `tool-denied` even when its category was granted, and a reserved
 * category reports `reserved-category` rather than the `category-denied` a
 * plain allow-list miss would produce.
 *
 * `toolCategoryMap` is read with an own-property check and its value
 * re-validated, because a plain object literal inherits `constructor` and
 * `toString` from its prototype — a tool named after one of those would
 * otherwise resolve to a function and travel on as a category.
 */
export function checkToolAccess(
  roster: readonly AgentToolPolicy[],
  agentId: string,
  tool: string,
  toolCategoryMap: ToolCategoryMap,
): ToolAccessResult {
  const policy = getAgentToolPolicy(roster, agentId);
  if (policy === undefined) {
    return deny(
      agentId,
      tool,
      null,
      "unknown-agent",
      `No tool policy for agent "${agentId}": an agent absent from the roster may use nothing. ` +
        `Add a policy for "${agentId}", or delegate to a rostered agent.`,
    );
  }

  const mapped: unknown = Object.hasOwn(toolCategoryMap, tool) ? toolCategoryMap[tool] : undefined;
  const category = isToolCategory(mapped) ? mapped : null;

  if (policy.denyTools?.includes(tool) === true) {
    return deny(
      agentId,
      tool,
      category,
      "tool-denied",
      `Agent "${agentId}" is denied tool "${tool}" by name; its policy lists the tool in denyTools.`,
    );
  }

  if (category === null) {
    return deny(
      agentId,
      tool,
      null,
      "tool-denied",
      `Tool "${tool}" maps to no category on this client, so it cannot be authorized. ` +
        `Add "${tool}" to the client's tool-category map under the capability it grants.`,
    );
  }

  if (isReservedToolCategory(category)) {
    return deny(
      agentId,
      tool,
      category,
      "reserved-category",
      `Tool "${tool}" maps to reserved category "${category}", which no policy can grant. ` +
        `Map "${tool}" to the functional category it actually uses.`,
    );
  }

  if (!policy.allow.includes(category)) {
    const held = policy.allow.length > 0 ? policy.allow.join(", ") : "(none)";
    return deny(
      agentId,
      tool,
      category,
      "category-denied",
      `Agent "${agentId}" may not use tool "${tool}": it grants no "${category}" access. Granted: ${held}.`,
    );
  }

  return {
    allowed: true,
    category,
    reason: `Agent "${agentId}" may use tool "${tool}" through its "${category}" grant.`,
  };
}

// ── Roster validation ────────────────────────────────────────────

/**
 * Check a roster for the bugs that make a policy silently wrong rather than
 * loudly broken, returning one operator-facing line each. An empty result is a
 * clean roster.
 *
 * Reported, and why each one is invisible at runtime without this pass:
 * - duplicate agent id — the shadowed row is simply never consulted;
 * - unknown category — matches no tool, so it denies everything it was meant
 *   to grant, and the agent reads as configured;
 * - reserved category — grants nothing, so the row overstates the agent's
 *   privilege to anyone auditing it;
 * - empty allow set — an agent that can invoke nothing is a roster bug, not a
 *   least-privilege win;
 * - blank rationale — an ungrounded grant cannot be reviewed, and privilege
 *   nobody can justify is privilege nobody will remove;
 * - unnamed provenance — a `source` the schema does not name, or a pack source
 *   with no pack id, is dropped by the emitter, and an operator auditing where
 *   a grant came from would read the surviving row as core.
 *
 * Issues are returned rather than thrown: the caller owns whether a roster
 * problem is fatal (a `validate` command reporting all of them) or tolerable.
 */
export function validateToolPolicies(roster: readonly AgentToolPolicy[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();

  for (const policy of roster) {
    const id = policy.agentId;

    if (id.trim() === "") {
      issues.push(`A roster entry has a blank agentId; every policy must name the agent it governs.`);
    } else if (seen.has(id)) {
      issues.push(
        `Duplicate policy for agent "${id}": only the first is ever consulted. Merge the rows into one grant.`,
      );
    }
    seen.add(id);

    if (policy.rationale.trim() === "") {
      issues.push(`Agent "${id}" has a grant with no rationale; state why it holds these categories.`);
    }

    if (policy.allow.length === 0) {
      issues.push(`Agent "${id}" allows no tool category, so it can invoke nothing. Grant what its role needs.`);
    }

    // A roster is data however it was typed on the way in, so the source is
    // re-read structurally rather than trusted: a hand-authored or deserialized
    // row is exactly the one that reaches the emitter with a shape the union
    // rules out.
    if (policy.source !== undefined) {
      const source: { kind?: unknown; packId?: unknown } = policy.source;
      const packId = source.packId;
      if (source.kind !== "core" && source.kind !== "pack") {
        issues.push(
          `Agent "${id}" declares policy source ${JSON.stringify(source.kind) ?? typeof source.kind}, ` +
            `which names no origin, so the emitted row would carry no provenance at all. ` +
            `Use "core" for a shipped roster row, or "pack" with the installing pack's id.`,
        );
      } else if (source.kind === "pack" && (typeof packId !== "string" || packId.trim() === "")) {
        issues.push(
          `Agent "${id}" declares a pack source with no pack id, so the emitted row cannot say which ` +
            `installed pack the grant came from. Name the pack that supplies the agent.`,
        );
      }
    }

    for (const granted of policy.allow) {
      // A roster is data, however it was typed on the way in.
      const category: string = granted;
      if (!isToolCategory(category)) {
        issues.push(
          `Agent "${id}" allows unknown tool category "${category}", which matches no tool. ` +
            `Valid categories: ${ALL_TOOL_CATEGORIES.join(", ")}.`,
        );
      } else if (isReservedToolCategory(category)) {
        issues.push(
          `Agent "${id}" allows reserved tool category "${category}", which grants nothing. ` +
            `Remove it, or grant the functional category the agent actually needs.`,
        );
      }
    }
  }

  return issues;
}

// ── Emission ─────────────────────────────────────────────────────

interface EmittedPolicy {
  agentId: string;
  allow: readonly ToolCategory[];
  denyTools?: readonly string[];
  rationale: string;
  source?: AgentPolicySource;
}

/**
 * The provenance field as the document carries it: rebuilt arm by arm, so a row
 * that arrived with extra keys cannot smuggle them into the file the guard
 * parses, and an origin this schema does not name is dropped rather than
 * emitted as something it is not. {@link validateToolPolicies} is what reports
 * the drop; dropping silently would leave a pack row reading as core.
 */
function emittedSource(source: AgentPolicySource | undefined): AgentPolicySource | undefined {
  if (source === undefined) return undefined;
  if (source.kind === "core") return { kind: "core" };
  if (source.kind === "pack") {
    const packId: string = source.packId;
    return packId.trim() === "" ? undefined : { kind: "pack", packId };
  }
  return undefined;
}

/**
 * One row as the document carries it: categories filtered to what an access
 * check would authorize, denied names deduplicated and sorted, provenance
 * rebuilt. Key order is fixed here rather than by the input, and an optional key
 * is omitted rather than emitted as null — both are what make the bytes a
 * function of the grant instead of of how the row was written.
 */
function emittedRow(policy: AgentToolPolicy): EmittedPolicy {
  const allow = ALL_TOOL_CATEGORIES.filter(
    (category) => !isReservedToolCategory(category) && policy.allow.includes(category),
  );
  const denyTools = [...new Set(policy.denyTools ?? [])].toSorted();
  const source = emittedSource(policy.source);
  return {
    agentId: policy.agentId,
    allow,
    ...(denyTools.length > 0 ? { denyTools } : {}),
    rationale: policy.rationale,
    ...(source === undefined ? {} : { source }),
  };
}

/**
 * Serialize a roster into the policy document the generated client-side guard
 * reads.
 *
 * Byte-stable by construction, not by convention: policies sort by agent id,
 * categories emit in canonical taxonomy order, and denied tool names are
 * deduplicated and sorted. Two rosters differing only in order produce
 * identical bytes, so a re-ordered roster never shows up as a diff in a
 * committed artifact and never invalidates a drift check.
 *
 * Emission is also sanitizing: unknown and reserved categories are dropped, an
 * unnamed {@link AgentPolicySource} is dropped, and a duplicated agent id keeps
 * its first row. The guard has no validator, so what it reads must already be
 * exactly what {@link checkToolAccess} would authorize — the pre-emission call
 * to {@link validateToolPolicies} is what reports the entries dropped here, and
 * skipping it means dropping them silently.
 *
 * `source` is emitted last and only where a row carries one, so a roster with no
 * provenance serializes to the same bytes it did before the field existed: a
 * pack install adds rows to the document, and must never move a core one.
 *
 * Sorting compares code units directly rather than through `localeCompare`,
 * whose ordering depends on the host locale — the same roster must not
 * serialize differently on two machines.
 */
export function buildAgentToolPoliciesJson(roster: readonly AgentToolPolicy[]): string {
  const byId = new Map<string, AgentToolPolicy>();
  for (const policy of roster) {
    if (!byId.has(policy.agentId)) byId.set(policy.agentId, policy);
  }

  const policies: EmittedPolicy[] = [...byId.values()]
    .toSorted((a, b) => (a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0))
    .map(emittedRow);

  return JSON.stringify(
    { schema: AGENT_TOOL_POLICIES_SCHEMA, categories: ALL_TOOL_CATEGORIES, policies },
    null,
    2,
  );
}

// ── Derivation ───────────────────────────────────────────────────

/**
 * Widen a base policy with categories requested outside the roster — a
 * user-authored agent declaring what it needs.
 *
 * The additions are a request, not a grant: unknown and reserved categories are
 * dropped, so no derivation path can hand out privilege the roster itself could
 * not express. `denyTools` carries over untouched — a name denied by the base
 * policy stays denied, or a user grant would reopen the exact tool the roster
 * singled out.
 *
 * The rationale records only the categories actually granted, so a stripped
 * request leaves no trace claiming privilege the policy does not hold. The base
 * policy is never mutated.
 *
 * `source` carries over untouched for the same reason `denyTools` does: a user
 * addition changes what the agent may do, never where its row came from, and a
 * derivation that dropped the field would relabel a pack-supplied grant as core
 * at exactly the moment it got wider.
 */
export function deriveUserAgentPolicy(
  base: AgentToolPolicy,
  userAdditions: readonly ToolCategory[],
): AgentToolPolicy {
  const allow: ToolCategory[] = [];
  for (const candidate of [...base.allow, ...userAdditions]) {
    const category: string = candidate;
    if (!isToolCategory(category)) continue;
    if (isReservedToolCategory(category)) continue;
    if (allow.includes(category)) continue;
    allow.push(category);
  }

  const added = allow.filter((category) => !base.allow.includes(category));

  return {
    agentId: base.agentId,
    allow,
    ...(base.denyTools !== undefined ? { denyTools: base.denyTools } : {}),
    rationale: added.length > 0 ? `${base.rationale} User-granted: ${added.join(", ")}.` : base.rationale,
    ...(base.source !== undefined ? { source: base.source } : {}),
  };
}

/**
 * Bridge a denial onto the failure log, so denied calls land in the same audit
 * trail as everything else that went wrong in a run instead of a channel of
 * their own. {@link ALLOWLIST_FAILURE_PHASE} is what filters them back out.
 *
 * `at` is a parameter because the event carries no timestamp of its own and a
 * caller replaying or batching denials must be able to pin the time it records.
 */
export function toFailureLogEntry(event: AllowlistDenialEvent, at: Date = new Date()): FailureLogEntry {
  return {
    timestamp: at.toISOString(),
    phase: ALLOWLIST_FAILURE_PHASE,
    agentId: event.agentId,
    errorType: "AllowlistDenial",
    message: `Agent "${event.agentId}" was denied tool "${event.tool}" (${event.reason}).`,
    context: { tool: event.tool, reason: event.reason },
  };
}
