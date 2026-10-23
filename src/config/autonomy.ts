import {
  AUTONOMY_MODES,
  DEPLOYING_ACTS,
  type AutonomousAct,
  type AutonomyMode,
  type DeployingAct,
  type SetupManifest,
} from "../types/manifest.ts";

/**
 * The autonomy setting, resolved (REQ-FLOW-137, REQ-FLOW-138's comparison).
 *
 * Pure: types, the resolver, the looser-than comparison, the strictest of
 * several settings, the marker line a guard copy carries, and the
 * deploying-branch pattern. No CLI import and no file read, so the guard's
 * builder, the planner and the CLI may all import it; the gate that throws and
 * the reader of the guard copies on disk live in the CLI layer.
 */

/** The acts mode `autonomous` runs unasked, in canonical order; mode `ask` asks for them. */
export const AUTONOMOUS_ACTS: readonly AutonomousAct[] = ["pr-ready", "tag"];

/** A manifest's `autonomy` block with every default applied. */
export interface ResolvedAutonomy {
  readonly mode: AutonomyMode;
  /** The {@link AUTONOMOUS_ACTS} that run unasked: none in mode `ask`, else those not named as deploying. */
  readonly runs: readonly AutonomousAct[];
  /** Branch names or one-segment `*` patterns, first spelling kept, repeats (by {@link branchKey}) dropped. */
  readonly deployingBranches: readonly string[];
  /** The acts named as deploying, in {@link DEPLOYING_ACTS} order. */
  readonly deploying: readonly DeployingAct[];
}

/** How two branch spellings compare: case folded, a `refs/heads/` prefix dropped. */
function branchKey(name: string): string {
  const lower = name.toLowerCase();
  return lower.startsWith("refs/heads/") ? lower.slice("refs/heads/".length) : lower;
}

/** `names` without the repeats {@link branchKey} folds together, first spelling kept. */
function uniqueBranches(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const name of names) {
    const key = branchKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(name);
  }
  return kept;
}

/**
 * The setting a manifest's `autonomy` block resolves to. An absent block, or
 * an absent member, takes the default: mode `autonomous`, nothing named.
 * Assumes a block the manifest schema admitted; an act outside
 * {@link DEPLOYING_ACTS} is dropped rather than carried.
 */
export function resolveAutonomy(manifest: Pick<SetupManifest, "autonomy">): ResolvedAutonomy {
  const block = manifest.autonomy;
  const mode: AutonomyMode = block?.mode === "ask" ? "ask" : "autonomous";
  const named = new Set<DeployingAct>(block?.deployingActs ?? []);
  const deploying = DEPLOYING_ACTS.filter((act) => named.has(act));
  return {
    mode,
    runs: mode === "ask" ? [] : AUTONOMOUS_ACTS.filter((act) => !named.has(act)),
    deployingBranches: uniqueBranches(block?.deployingBranches ?? []),
    deploying,
  };
}

/**
 * The one reader `run land` imports: the same function as {@link resolveAutonomy}.
 *
 * @alias
 */
export const readAutonomy = resolveAutonomy;

/**
 * True when `next` lets an agent do something `baseline` does not: its mode is
 * `autonomous` over a baseline `ask`, an act runs that did not, or an act or a
 * branch the baseline names as deploying is no longer named (so removing
 * `workflow-dispatch` from the acts loosens). Branches compare by
 * {@link branchKey}, and a pattern counts only as itself: narrowing
 * `release/*` to `release/1.17` loosens.
 */
export function loosens(next: ResolvedAutonomy, baseline: ResolvedAutonomy): boolean {
  if (next.mode === "autonomous" && baseline.mode === "ask") return true;
  if (next.runs.some((act) => !baseline.runs.includes(act))) return true;
  if (baseline.deploying.some((act) => !next.deploying.includes(act))) return true;
  const nextBranches = new Set(next.deployingBranches.map(branchKey));
  return baseline.deployingBranches.some((name) => !nextBranches.has(branchKey(name)));
}

/**
 * The strictest of several settings: mode `ask` when any is, every act and
 * every branch any of them names. Nothing any one of them asks for runs, so a
 * candidate loosens it exactly when it loosens one of them.
 */
export function strictestAutonomy(first: ResolvedAutonomy, ...rest: readonly ResolvedAutonomy[]): ResolvedAutonomy {
  const all = [first, ...rest];
  return resolveAutonomy({
    autonomy: {
      mode: all.some((setting) => setting.mode === "ask") ? "ask" : "autonomous",
      deployingActs: all.flatMap((setting) => setting.deploying),
      deployingBranches: all.flatMap((setting) => setting.deployingBranches),
    },
  });
}

/** What a guard copy's marker line starts with; the resolved setting follows as JSON. */
const AUTONOMY_MARKER = "// stamity-autonomy ";

/** The marker line a guard copy carries for `setting`: one line, fixed key order. */
export function autonomyMarkerLine(setting: ResolvedAutonomy): string {
  const { mode, runs, deployingBranches, deploying } = setting;
  return `${AUTONOMY_MARKER}${JSON.stringify({ mode, runs, deployingBranches, deploying })}`;
}

/**
 * What a marker that is present but cannot be read stands for: mode `ask`
 * with every act named. A marker is only ever written by the engine, so one
 * that does not parse, or whose `runs` disagrees with its own mode and acts,
 * was edited; reading it as the strictest setting it can state keeps an edit
 * from loosening the baseline. Its branches cannot be known, so it names none.
 */
const UNREADABLE_MARKER: ResolvedAutonomy = resolveAutonomy({
  autonomy: { mode: "ask", deployingActs: [...DEPLOYING_ACTS] },
});

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** One marker line's JSON, or {@link UNREADABLE_MARKER} for anything the engine would not have written. */
function parseMarkerJson(json: string): ResolvedAutonomy {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return UNREADABLE_MARKER;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return UNREADABLE_MARKER;
  const { mode, runs, deployingBranches, deploying } = parsed as Record<string, unknown>;
  if (
    typeof mode !== "string" ||
    !(AUTONOMY_MODES as readonly string[]).includes(mode) ||
    !isStringList(runs) ||
    !isStringList(deployingBranches) ||
    !isStringList(deploying) ||
    !deploying.every((act) => (DEPLOYING_ACTS as readonly string[]).includes(act))
  ) {
    return UNREADABLE_MARKER;
  }
  const setting = resolveAutonomy({
    autonomy: { mode: mode as AutonomyMode, deployingBranches, deployingActs: deploying as DeployingAct[] },
  });
  return autonomyMarkerLine(setting) === `${AUTONOMY_MARKER}${json}` ? setting : UNREADABLE_MARKER;
}

/**
 * The setting a guard copy's text carries, or `null` when it carries no marker
 * line (a copy older than the marker; what that means is the caller's call).
 * Several marker lines in one copy read as the strictest of them.
 */
export function parseAutonomyMarker(text: string): ResolvedAutonomy | null {
  const found: ResolvedAutonomy[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith(AUTONOMY_MARKER)) found.push(parseMarkerJson(line.slice(AUTONOMY_MARKER.length).trim()));
  }
  const [first, ...rest] = found;
  return first === undefined ? null : strictestAutonomy(first, ...rest);
}

/** `text` with every regular-expression metacharacter escaped. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when the branch `name` is one `patterns` names: an exact name matches
 * only itself, and a `*` matches any run of characters inside one path segment
 * (`release/*` matches `release/1.17`, not `release/1.17/hotfix`). Both sides
 * compare case-folded with any `refs/heads/` prefix dropped.
 *
 * Local to this module until the guard's own matcher lands in
 * `../hooks/personOnly.ts` (unit a4-guard-ask-list); the CLI callers then
 * import that one, since this kernel module may not import the hooks layer.
 */
export function matchesDeployingBranch(name: string, patterns: readonly string[]): boolean {
  const branch = branchKey(name);
  return patterns.some((pattern) => {
    const source = branchKey(pattern).split("*").map(escapeRegExp).join("[^/]*");
    return new RegExp(`^${source}$`, "u").test(branch);
  });
}
