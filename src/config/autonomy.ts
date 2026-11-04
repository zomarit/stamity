import {
  AUTONOMY_MODES,
  DEPLOYING_ACTS,
  REVIEW_TOOL_CLEANS,
  type AutonomousAct,
  type AutonomyConfig,
  type AutonomyMode,
  type AutoShipConfig,
  type DeployingAct,
  type LandJobConfig,
  type ReviewToolConfig,
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
  /** Branch names or `*`/`**` patterns, first spelling kept, repeats (by {@link branchKey}) dropped. */
  readonly deployingBranches: readonly string[];
  /** The acts named as deploying, in {@link DEPLOYING_ACTS} order. */
  readonly deploying: readonly DeployingAct[];
  /** The four factory keys, each absent when off, so a default setting reads and bakes as it always has. */
  readonly adminRuleProof?: boolean;
  readonly autoShip?: AutoShipConfig;
  readonly reviewTool?: ReviewToolConfig;
  readonly landJob?: LandJobConfig;
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

/** The members an `autonomy` block may carry, as the manifest schema admits them. */
const AUTONOMY_KEYS: ReadonlySet<string> = new Set([
  "mode",
  "deployingBranches",
  "deployingActs",
  "adminRuleProof",
  "autoShip",
  "reviewTool",
  "landJob",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The longest `reviewTool.request`, and of any other one-line value a factory key holds. */
const MAX_REQUEST_LENGTH = 200;
const MAX_KEY_TEXT_LENGTH = 255;
/** The most entries a factory key's list holds, as `autonomy.deployingBranches` does. */
const MAX_KEY_LIST_LENGTH = 32;
/** GitHub's login shape, with the `[bot]` an app's account carries. */
const GITHUB_LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}(?:\[bot\])?$/;

/** A non-empty string of at most `max` characters that nothing could end a comment line in: a guard copy bakes it. */
function isOneLine(value: unknown, max: number): value is string {
  if (typeof value !== "string" || value === "" || value.length > max) return false;
  return ![...value].some((ch) => {
    const code = ch.charCodeAt(0);
    return code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029;
  });
}

/** Up to {@link MAX_KEY_LIST_LENGTH} one-line strings. */
function isOneLineList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_KEY_LIST_LENGTH && value.every((item) => isOneLine(item, MAX_KEY_TEXT_LENGTH));
}

function inRange(value: unknown, low: number, high: number): boolean {
  return Number.isSafeInteger(value) && (value as number) >= low && (value as number) <= high;
}

/** One line per unknown member of the factory key at `field`. */
function unknownMembers(value: Record<string, unknown>, field: string, known: readonly string[]): string[] {
  return Object.keys(value)
    .filter((key) => !known.includes(key))
    .map((key) => `unknown field \`autonomy.${field}.${key}\` (known: ${known.join(", ")})`);
}

function autoShipDefects(value: unknown): string[] {
  if (!isRecord(value)) return ["`autonomy.autoShip` must be an object"];
  const defects = unknownMembers(value, "autoShip", ["maxFiles", "maxLines", "classes", "paths"]);
  for (const limit of ["maxFiles", "maxLines"]) {
    if (!inRange(value[limit], 1, Number.MAX_SAFE_INTEGER)) defects.push(`\`autonomy.autoShip.${limit}\` must be a positive whole number`);
  }
  if (!isOneLineList(value["classes"])) defects.push("`autonomy.autoShip.classes` must be a list of change classes");
  if (value["paths"] !== undefined && !isOneLineList(value["paths"])) {
    defects.push(`\`autonomy.autoShip.paths\` must be a list of at most ${MAX_KEY_LIST_LENGTH} one-line globs`);
  }
  return defects;
}

function reviewToolDefects(value: unknown): string[] {
  if (!isRecord(value)) return ["`autonomy.reviewTool` must be an object"];
  const defects = unknownMembers(value, "reviewTool", ["login", "request", "clean", "stateMarker", "stateSection", "waitMinutes", "rounds"]);
  const { login, request, clean, waitMinutes, rounds } = value;
  if (typeof login !== "string" || !GITHUB_LOGIN.test(login)) defects.push("`autonomy.reviewTool.login` must be a GitHub login");
  if (!isOneLine(request, MAX_REQUEST_LENGTH)) defects.push(`\`autonomy.reviewTool.request\` must be one line of at most ${MAX_REQUEST_LENGTH} characters`);
  if (!(REVIEW_TOOL_CLEANS as readonly unknown[]).includes(clean)) defects.push(`\`autonomy.reviewTool.clean\` must be one of ${REVIEW_TOOL_CLEANS.join(" | ")}`);
  for (const text of ["stateMarker", "stateSection"]) {
    if (value[text] !== undefined && !isOneLine(value[text], MAX_KEY_TEXT_LENGTH)) defects.push(`\`autonomy.reviewTool.${text}\` must be one line`);
  }
  if (!inRange(waitMinutes, 1, 120)) defects.push("`autonomy.reviewTool.waitMinutes` must be a whole number from 1 to 120");
  if (!inRange(rounds, 1, 3)) defects.push("`autonomy.reviewTool.rounds` must be a whole number from 1 to 3");
  return defects;
}

function landJobDefects(value: unknown): string[] {
  if (!isRecord(value)) return ["`autonomy.landJob` must be an object"];
  const defects = unknownMembers(value, "landJob", ["workflows"]);
  if (!isOneLineList(value["workflows"])) defects.push(`\`autonomy.landJob.workflows\` must be a list of at most ${MAX_KEY_LIST_LENGTH} workflow names`);
  return defects;
}

/**
 * Why a raw block's factory keys cannot stand, one line each: the manifest
 * schema's refusals, and what {@link resolveAutonomy} fails closed on, so an
 * unchecked committed block and `config set` read one rule. Which change
 * classes `autoShip.classes` may name is the schema's alone (the list lives one
 * wave up): a class no change has never matches, so it loosens nothing.
 */
export function factoryKeyDefects(block: Record<string, unknown>): string[] {
  const { adminRuleProof, autoShip, reviewTool, landJob } = block;
  return [
    ...(adminRuleProof === undefined || typeof adminRuleProof === "boolean" ? [] : ["`autonomy.adminRuleProof` must be a boolean"]),
    ...(autoShip === undefined ? [] : autoShipDefects(autoShip)),
    ...(reviewTool === undefined ? [] : reviewToolDefects(reviewTool)),
    ...(landJob === undefined ? [] : landJobDefects(landJob)),
  ];
}

/** The factory keys of a {@link ResolvedAutonomy}. */
type FactoryKeys = Pick<ResolvedAutonomy, "adminRuleProof" | "autoShip" | "reviewTool" | "landJob">;

/**
 * Exactly the keys that are on, in the one order the marker and the guard's
 * baked constant carry them, each one's own members in a fixed order too, so a
 * marker that spells them otherwise fails {@link parseMarkerJson}'s re-render.
 * Absent stays absent: `exactOptionalPropertyTypes` refuses an explicit `undefined`.
 */
function factoryKeys(from: { readonly [Key in keyof FactoryKeys]?: FactoryKeys[Key] | undefined }): FactoryKeys {
  const { adminRuleProof, autoShip, reviewTool, landJob } = from;
  return {
    ...(adminRuleProof === true ? { adminRuleProof } : {}),
    ...(autoShip === undefined
      ? {}
      : {
          autoShip: {
            maxFiles: autoShip.maxFiles,
            maxLines: autoShip.maxLines,
            classes: [...autoShip.classes],
            ...(autoShip.paths === undefined ? {} : { paths: [...autoShip.paths] }),
          },
        }),
    ...(reviewTool === undefined
      ? {}
      : {
          reviewTool: {
            login: reviewTool.login,
            request: reviewTool.request,
            clean: reviewTool.clean,
            ...(reviewTool.stateMarker === undefined ? {} : { stateMarker: reviewTool.stateMarker }),
            ...(reviewTool.stateSection === undefined ? {} : { stateSection: reviewTool.stateSection }),
            waitMinutes: reviewTool.waitMinutes,
            rounds: reviewTool.rounds,
          },
        }),
    ...(landJob === undefined ? {} : { landJob: { workflows: [...landJob.workflows] } }),
  };
}

/**
 * Whether a raw `autonomy` block passes the manifest schema's type and set
 * checks: an object of known members, a known mode, a list of strings for the
 * branches, a list of known acts and factory keys with no defect. The git
 * spelling rules for a branch name are the schema's alone.
 */
function admittedBlock(block: unknown): block is AutonomyConfig {
  if (!isRecord(block)) return false;
  if (Object.keys(block).some((key) => !AUTONOMY_KEYS.has(key))) return false;
  if (factoryKeyDefects(block).length > 0) return false;
  const { mode, deployingBranches, deployingActs } = block;
  if (mode !== undefined && !(AUTONOMY_MODES as readonly unknown[]).includes(mode)) return false;
  if (deployingBranches !== undefined && !isStringList(deployingBranches)) return false;
  if (deployingActs === undefined) return true;
  return (
    Array.isArray(deployingActs) && deployingActs.every((act) => (DEPLOYING_ACTS as readonly unknown[]).includes(act))
  );
}

/**
 * The setting a manifest's `autonomy` block resolves to. An absent block, or
 * an absent member, takes the default: mode `autonomous`, nothing named.
 *
 * Fails closed: the land verb reads committed manifests no schema check has
 * passed, so a block the schema would refuse (a mode spelled `Ask`, a list
 * that is not a list, an unknown act or member, a factory key with a defect)
 * resolves to the strictest setting it can state, mode `ask` with every act
 * named and no key that loosens, keeping only the branch names and the review
 * tool it can read. It never resolves to the default.
 */
export function resolveAutonomy(manifest: { readonly autonomy?: unknown }): ResolvedAutonomy {
  const raw = manifest.autonomy;
  if (raw !== undefined && !admittedBlock(raw)) {
    const listed = isRecord(raw) ? raw["deployingBranches"] : undefined;
    const readable = Array.isArray(listed) ? listed.filter((name): name is string => typeof name === "string") : [];
    const tool = isRecord(raw) ? raw["reviewTool"] : undefined;
    return resolveAutonomy({
      autonomy: {
        mode: "ask",
        deployingActs: [...DEPLOYING_ACTS],
        deployingBranches: readable,
        ...(tool === undefined || reviewToolDefects(tool).length > 0 ? {} : { reviewTool: tool }),
      },
    });
  }
  const block = raw;
  const mode: AutonomyMode = block?.mode === "ask" ? "ask" : "autonomous";
  const named = new Set<DeployingAct>(block?.deployingActs ?? []);
  const deploying = DEPLOYING_ACTS.filter((act) => named.has(act));
  return {
    mode,
    runs: mode === "ask" ? [] : AUTONOMOUS_ACTS.filter((act) => !named.has(act)),
    deployingBranches: uniqueBranches(block?.deployingBranches ?? []),
    deploying,
    ...factoryKeys(block ?? {}),
  };
}

/**
 * The one reader `run land` imports: the same function as {@link resolveAutonomy}.
 *
 * @alias
 */
export const readAutonomy = resolveAutonomy;

/** Whether `next` ships a change `baseline` would ask about: on where it was off, a higher limit, a class or path more, a path limit gone. */
function autoShipWider(next: AutoShipConfig | undefined, baseline: AutoShipConfig | undefined): boolean {
  if (next === undefined) return false;
  if (baseline === undefined) return true;
  if (next.maxFiles > baseline.maxFiles || next.maxLines > baseline.maxLines) return true;
  if (next.classes.some((name) => !baseline.classes.includes(name))) return true;
  const { paths } = baseline;
  return paths !== undefined && (next.paths === undefined || next.paths.some((path) => !paths.includes(path)));
}

/**
 * Whether `next` puts off or weakens what `baseline` holds for a person (REQ-FLOW-154): a longer wait or more rounds,
 * each of which delays the hold, or another tool or proof of clean, which reads as changed whichever way it goes.
 */
function reviewToolLooser(next: ReviewToolConfig, baseline: ReviewToolConfig): boolean {
  if (next.waitMinutes > baseline.waitMinutes || next.rounds > baseline.rounds) return true;
  const identity = ({ login, request, clean, stateMarker, stateSection }: ReviewToolConfig): string =>
    JSON.stringify([login, request, clean, stateMarker, stateSection]);
  return identity(next) !== identity(baseline);
}

/** How a factory key of one setting can be looser than another's. */
export type LooserKey = "adminRuleProof" | "autoShip" | "reviewTool-dropped" | "reviewTool-changed" | "landJob";

/**
 * Each way `next`'s factory keys are looser than `baseline`'s (REQ-FLOW-138):
 * `adminRuleProof` turned on, `autoShip` turned on or widened, `reviewTool`
 * dropped, changed or given a higher `rounds` or `waitMinutes`, `landJob` turned
 * on or moved to other workflows.
 */
export function looserKeys(next: ResolvedAutonomy, baseline: ResolvedAutonomy): LooserKey[] {
  const keys: LooserKey[] = [];
  if (next.adminRuleProof === true && baseline.adminRuleProof !== true) keys.push("adminRuleProof");
  if (autoShipWider(next.autoShip, baseline.autoShip)) keys.push("autoShip");
  if (baseline.reviewTool !== undefined && next.reviewTool === undefined) keys.push("reviewTool-dropped");
  if (baseline.reviewTool !== undefined && next.reviewTool !== undefined && reviewToolLooser(next.reviewTool, baseline.reviewTool)) keys.push("reviewTool-changed");
  if (next.landJob !== undefined && JSON.stringify(next.landJob) !== JSON.stringify(baseline.landJob)) keys.push("landJob");
  return keys;
}

/**
 * The `autonomy` keys in which `next` lets an agent do something `baseline` does
 * not, in the block's order, each once and spelled as `config` spells it: its mode
 * is `autonomous` over a baseline `ask`, an act runs that did not, an act or a
 * branch the baseline names as deploying is no longer named (so removing
 * `workflow-dispatch` from the acts loosens), or a factory key is looser
 * ({@link looserKeys}). Branches compare by {@link branchKey}, and a pattern
 * counts only as itself: narrowing `release/*` to `release/1.17` loosens. What a
 * land ask names, since the manifest's path alone also moves on every sync.
 */
export function looserAutonomyKeys(next: ResolvedAutonomy, baseline: ResolvedAutonomy): string[] {
  const modeLooser = next.mode === "autonomous" && baseline.mode === "ask";
  const nextBranches = new Set(next.deployingBranches.map(branchKey));
  const keys = [
    ...(modeLooser ? ["mode"] : []),
    // Under a loosened mode every act runs that did not, which is the mode's doing, not the acts'.
    ...((!modeLooser && next.runs.some((act) => !baseline.runs.includes(act))) || baseline.deploying.some((act) => !next.deploying.includes(act)) ? ["deployingActs"] : []),
    ...(baseline.deployingBranches.some((name) => !nextBranches.has(branchKey(name))) ? ["deployingBranches"] : []),
    ...looserKeys(next, baseline).map((key) => key.replace(/-.*$/, "")),
  ];
  return keys.map((key) => `autonomy.${key}`);
}

/** True when `next` is looser than `baseline` in any key ({@link looserAutonomyKeys}). */
export function loosens(next: ResolvedAutonomy, baseline: ResolvedAutonomy): boolean {
  return looserAutonomyKeys(next, baseline).length > 0;
}

/**
 * The strictest of several settings: mode `ask` when any is, every act and
 * every branch any of them names. `adminRuleProof`, `autoShip` and `landJob`
 * survive only if every leg holds them equal; `reviewTool` survives if any leg
 * names it, the first leg's tool with the lowest rounds and the shortest wait,
 * since a higher value delays the hold for a person. Nothing any one of them
 * asks for runs, so a candidate that loosens one of them loosens it too, with one
 * exception: legs naming different tools keep only the first's, so a candidate
 * naming that one reads as no change here though it swaps the others' tool, and a
 * reader that must catch a swap compares each leg as well. The other way round, a
 * candidate may loosen this alone where the legs hold factory keys unequal.
 */
export function strictestAutonomy(first: ResolvedAutonomy, ...rest: readonly ResolvedAutonomy[]): ResolvedAutonomy {
  const all = [first, ...rest];
  const equalInAll = <Key extends "adminRuleProof" | "autoShip" | "landJob">(key: Key): ResolvedAutonomy[Key] | undefined =>
    all.every((setting) => JSON.stringify(setting[key]) === JSON.stringify(first[key])) ? first[key] : undefined;
  const tools = all.flatMap((setting) => (setting.reviewTool === undefined ? [] : [setting.reviewTool]));
  const [tool] = tools;
  return resolveAutonomy({
    autonomy: {
      mode: all.some((setting) => setting.mode === "ask") ? "ask" : "autonomous",
      deployingActs: all.flatMap((setting) => setting.deploying),
      deployingBranches: all.flatMap((setting) => setting.deployingBranches),
      ...factoryKeys({
        adminRuleProof: equalInAll("adminRuleProof"),
        autoShip: equalInAll("autoShip"),
        reviewTool:
          tool === undefined
            ? undefined
            : {
                ...tool,
                rounds: Math.min(...tools.map((entry) => entry.rounds)),
                waitMinutes: Math.min(...tools.map((entry) => entry.waitMinutes)),
              },
        landJob: equalInAll("landJob"),
      }),
    },
  });
}

/** What a guard copy's marker line starts with; the resolved setting follows as JSON. */
const AUTONOMY_MARKER = "// stamity-autonomy ";

/** The marker line a guard copy carries for `setting`: one line, fixed key order, each factory key only when on. */
export function autonomyMarkerLine(setting: ResolvedAutonomy): string {
  const { mode, runs, deployingBranches, deploying } = setting;
  return `${AUTONOMY_MARKER}${JSON.stringify({ mode, runs, deployingBranches, deploying, ...factoryKeys(setting) })}`;
}

/**
 * What a marker that is present but cannot be read stands for: mode `ask`
 * with every act named. A marker is only ever written by the engine, so one
 * that does not parse, or whose `runs` disagrees with its own mode and acts,
 * or whose keys stand in another order, was edited; reading it as the strictest
 * setting it can state keeps an edit from loosening the baseline. Its branches
 * cannot be known, so it names none. A marker from before the factory keys has
 * none of them and is not this: it reads as every key off.
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
  const { mode, runs, deployingBranches, deploying, ...keys } = parsed as Record<string, unknown>;
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
  // Any other key is resolved too: one the block refuses, or spelled off, leaves a render that differs from `json`.
  const setting = resolveAutonomy({
    autonomy: { mode: mode as AutonomyMode, deployingBranches, deployingActs: deploying as DeployingAct[], ...keys },
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

/**
 * True when the branch `name` is one `patterns` names: an exact name matches
 * only itself, a `*` matches any run of characters inside one path segment
 * (`release/*` matches `release/1.17`, not `release/1.17/hotfix`), and a `**`
 * matches any run across segments (`release/**` matches both), as a GitHub
 * Actions branch filter reads them. Both sides compare case-folded with any
 * `refs/heads/` prefix dropped.
 *
 * No regular expression: one table row per pattern token over the name's
 * characters, so the work is bounded by the two lengths' product and a
 * pattern of many wildcards against a long near-miss name cannot backtrack.
 * A `**` also consumes a line break, which a `.` would not; no branch name
 * holds one, and matching more only asks more.
 *
 * Local to this module until the guard's own matcher lands in
 * `../hooks/personOnly.ts` (unit a4-guard-ask-list); the CLI callers then
 * import that one, since this kernel module may not import the hooks layer.
 */
export function matchesDeployingBranch(name: string, patterns: readonly string[]): boolean {
  const branch = branchKey(name);
  return patterns.some((pattern) => {
    const text = branchKey(pattern);
    // `matched[j]`: the tokens read so far match the first `j` characters of `branch`.
    let matched: boolean[] = Array.from({ length: branch.length + 1 }, (_, j) => j === 0);
    for (let at = 0; at < text.length; at += 1) {
      const wide = text.startsWith("**", at);
      const star = wide || text.charAt(at) === "*";
      if (wide) at += 1;
      const next: boolean[] = [star && matched[0] === true];
      for (let j = 1; j <= branch.length; j += 1) {
        const char = branch.charAt(j - 1);
        if (wide) next.push(matched[j] === true || next[j - 1] === true);
        else if (star) next.push(matched[j] === true || (next[j - 1] === true && char !== "/"));
        else next.push(matched[j - 1] === true && char === text.charAt(at));
      }
      matched = next;
    }
    return matched[branch.length] === true;
  });
}
