/**
 * Which rules a client carries always-on, and which it pulls in on demand.
 *
 * A rule is authored with a scope its author chose — a glob set, or none at
 * all — and every client expresses that scope differently. Cursor attaches
 * both shapes natively (`.mdc` globs, plus a description-pulled
 * `agent-requested` mode). Claude and Copilot attach a GLOB-scoped rule
 * conditionally and load a glob-less one unconditionally at launch, so the
 * rules with no globs are the ones whose whole body sits in launch context on
 * every session. Codex has no conditional rule layer at all: every rule it
 * receives is inlined into an `AGENTS.md` it reads in full.
 *
 * {@link demotedRuleIds} is the one answer to "which rules does THIS client
 * stop carrying always-on", and the `.agents/skills/` projection, the three
 * adapters that skip a demoted rule, and the always-on measurement all read
 * it. A second implementation anywhere is how a rule would get skipped by an
 * adapter and never projected as a skill — delivered nowhere — so the
 * predicate lives here and nothing re-derives it.
 *
 * Pure: facts in, ids out. The facts themselves are read off a catalog item by
 * {@link ruleDeliveryInputOf}, which is also where the two readers that used to
 * live in the codex adapter now sit ({@link declaredRuleGlobs},
 * {@link ruleAnchor}) — the anchoring answer is now needed by the core plan as
 * well as by the down-converter, and both have to agree about it exactly: a
 * rule the core demotes but the appendix still inlines would ship twice, and
 * one the core keeps but the appendix has no room for would ship nowhere.
 */

import { isFloorTag } from "./tags.ts";
import type { CatalogItem } from "./catalog.ts";
import type { Tool } from "../types/core.ts";
import { STATE_DIR } from "../types/markers.ts";
import type { RuleDelivery } from "../types/manifest.ts";

/**
 * Directory prefix of a rule projected as a skill:
 * `.agents/skills/stamity-<rule-id>/SKILL.md`.
 *
 * `stamity-` and not `st-` on purpose. `st-` is the invocable surface — the
 * nine touchpoint commands and the skills a human or an agent calls by name —
 * and the charter publishes it as a closed list. A demoted rule is not a new
 * entry on that surface: it is the same rule, reaching the model through a
 * different door. It therefore takes the prefix the corpus already spells for
 * rules and agents (`stamity-question-protocol.md`), which is also what makes
 * a projected rule recognisable as one in a listing of skill directories.
 */
export const RULE_SKILL_DIR_PREFIX = "stamity-";

/** The four facts the delivery decision reads, resolved per rule. */
export interface RuleDeliveryInput {
  /** Catalog id (unprefixed, as authored). */
  id: string;
  /** True when the rule declares at least one glob. */
  globScoped: boolean;
  /** True when the rule declares `precedence: critical`. */
  critical: boolean;
  /** True when any tag is a `floor:*` tag. */
  floorTagged: boolean;
  /** True when every glob shares a literal directory a nested `AGENTS.md` can sit in. */
  anchored: boolean;
}

/** The empty answer for every client — what `always-on` resolves to everywhere. */
export const NO_DEMOTED_RULES: Readonly<Record<Tool, ReadonlySet<string>>> = Object.freeze({
  claude: new Set<string>(),
  cursor: new Set<string>(),
  copilot: new Set<string>(),
  codex: new Set<string>(),
});

/**
 * The ids `tool` should NOT carry as always-on rule text — the rules the
 * skills projection delivers instead.
 *
 * Per client, and each answer is the client's own limit rather than a
 * preference:
 *
 * - **`always-on`** demotes nothing anywhere. It is the pre-option emission,
 *   and it is what every golden, ratchet and byte tripwire is pinned to.
 * - **cursor** demotes nothing even under `on-demand`: it is the one client
 *   with a native description-pull rule mode, so a rule with no globs already
 *   costs it nothing at launch and moving it would trade a rule the client
 *   understands for a skill it reads the same way.
 * - **claude, copilot** demote the GLOB-LESS rules that are neither
 *   `critical` nor floor-tagged. A glob-scoped rule is attached conditionally
 *   on both (`paths:`, `applyTo:`), so it is already paid for only when it
 *   applies; a rule with no globs is loaded on every session, and that is the
 *   whole cost this option exists to reclaim. The same floor guard codex
 *   applies keeps a floor-tagged glob-less rule always-on here too: a floor
 *   rule with nothing to anchor it to must not lose its every-session
 *   delivery on any client.
 * - **codex** demotes everything that is neither `critical`, nor floor-tagged,
 *   nor anchorable to a nested `AGENTS.md`. It has no conditional layer, so
 *   the question is not "does this attach conditionally" but "does this have
 *   to be in front of the model unconditionally": floors do (that is what a
 *   floor is), and an anchored rule already scopes itself by living in the
 *   package directory it is about. Everything else is better delivered as a
 *   skill the client pulls when its description matches than as another
 *   section of an appendix the 32 KiB budget is already dropping rules from.
 */
export function demotedRuleIds(
  tool: Tool,
  rules: readonly RuleDeliveryInput[],
  mode: RuleDelivery,
): ReadonlySet<string> {
  if (mode === "always-on" || tool === "cursor") return new Set();
  const demotes =
    tool === "codex"
      ? (rule: RuleDeliveryInput) => !rule.critical && !rule.floorTagged && !rule.anchored
      : (rule: RuleDeliveryInput) => !rule.critical && !rule.floorTagged && !rule.globScoped;
  return new Set(rules.filter((rule) => demotes(rule)).map((rule) => rule.id));
}

/** The four facts of one catalog rule. */
export function ruleDeliveryInputOf(item: CatalogItem): RuleDeliveryInput {
  const globs = declaredRuleGlobs(item);
  return {
    id: item.id,
    globScoped: globs.length > 0,
    critical: item.precedence === "critical",
    floorTagged: item.tags.some(isFloorTag),
    anchored: ruleAnchor(globs) !== null,
  };
}

/** Declared globs as a clean list; an array or a legacy comma string both parse. */
export function declaredRuleGlobs(item: CatalogItem): string[] {
  const declared = item.frontmatter.globs;
  const raw = Array.isArray(declared)
    ? declared
    : typeof declared === "string"
      ? declared.split(",")
      : [];
  return raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

/** Segments a glob cannot carry and still name a literal directory. */
const WILDCARD_PATTERN = /[*?[\]{}!]/;

/**
 * The directory every glob in the set lives under, or null when there is none.
 * A single unanchorable glob makes the whole rule unanchorable: placing the
 * file deeper would silently stop covering that glob's surface. A glob
 * {@link anchorOfGlob} refuses outright — state directory, absolute,
 * `..`-climbing — takes the whole rule to the root with it: its siblings would
 * otherwise pick a home that covers them and not it.
 */
export function ruleAnchor(globs: readonly string[]): string | null {
  let common: string[] | null = null;

  for (const glob of globs) {
    const anchor = anchorOfGlob(glob);
    if (anchor === null) return null;
    const segments = anchor.split("/");
    if (common === null) {
      common = segments;
      continue;
    }
    const shared: string[] = [];
    for (const [index, segment] of common.entries()) {
      if (segments[index] !== segment) break;
      shared.push(segment);
    }
    common = shared;
    if (common.length === 0) return null;
  }

  return common === null || common.length === 0 ? null : common.join("/");
}

/**
 * One glob's literal directory prefix: the segments before the first one
 * carrying a wildcard, with the final segment excluded because it names a file
 * rather than a directory. Anything that could address outside the repository —
 * absolute, drive-rooted, `..`-climbing — anchors nowhere, so it falls back to
 * the root appendix instead of aiming a write at another tree.
 *
 * {@link STATE_DIR} is refused for the mirror-image reason: it addresses INSIDE
 * a tree that is not free space. The state directory is the engine's own store,
 * and every file in it is read by code that knows what it expects to find —
 * `.stamity/learnings/` is walked as learnings, so an `AGENTS.md` left there is
 * parsed as a malformed learning by the validate command, the session banner,
 * and the learnings reader alike, and a fresh init would fail its own
 * `validate` on a file this planner wrote. The rules that make this reachable
 * are the ones ABOUT the state directory (`.stamity/**`, `.stamity/learnings/**`)
 * — exactly the rules a repo most wants.
 *
 * WHAT THE REFUSAL COSTS, measured rather than assumed. The fallback is the
 * codex root appendix, and on the shipped corpus under `always-on` that
 * appendix is already over budget, so the two rerouted rules do not arrive
 * intact — they enter a zero-sum file and the down-converter's budget shaper
 * settles it. `injection-screening` survives on its `floor:security` rank and
 * displaces `contract-census`; `learnings-schema` carries no risk flag, so it
 * ranks last and drops. Net against the anchored behaviour, Codex receives two
 * FEWER rules than before the refusal: both rerouted rules used to be delivered
 * in full in their own files, and now one of them and one bystander are
 * delivered nowhere. Neither loss is silent — the down-converter's omission
 * notice names both — and neither is endorsed here: this comment records the
 * measurement, and `test/adapters/codex.test.ts` pins the exact inlined and
 * omitted sets so the next change to either is a diff somebody has to approve.
 * Under `on-demand` the same two rules are demoted rather than dropped, which
 * is the delivery this refusal cost them being paid back through a different
 * door.
 *
 * The refusal is on the FIRST directory segment, after `./` stripping and
 * backslash normalization, and it is an equality test rather than a prefix
 * test: a sibling like `.stamityx/**` is somebody else's directory and anchors
 * normally, and a nested `src/.stamity/**` is not this engine's store either.
 */
function anchorOfGlob(glob: string): string | null {
  const normalized = glob.replaceAll("\\", "/").replace(/^\.\//, "");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return null;

  const segments = normalized.split("/");
  const dirs: string[] = [];
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) break;
    if (WILDCARD_PATTERN.test(segment)) break;
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    // First segment only: `dirs` is still empty exactly once, on the segment
    // that would root the anchor.
    if (dirs.length === 0 && segment === STATE_DIR) return null;
    dirs.push(segment);
  }
  return dirs.length === 0 ? null : dirs.join("/");
}
