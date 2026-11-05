import { closeSync, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import pLimit from "p-limit";
import { looserAutonomyKeys, readAutonomy, reviewToolConflict, strictestAutonomy, type AutonomyLeg, type ResolvedAutonomy } from "../../config/autonomy.ts";

/**
 * The setting a run's act reads (REQ-FLOW-132, REQ-FLOW-137, REQ-FLOW-138): the strictest of the default branch's
 * manifest, `HEAD`'s, the work tree's and the baked guard's, so a run cannot loosen it on its own branch and a key
 * merged to the default branch binds only once a person has baked it; a review tool the legs differ on is named as a
 * conflict for a person to settle. Every leg is read at the repository's top, whatever folder the verb starts in; a
 * project below the top adds its own legs beside them, so it can tighten the top's setting and never loosen it.
 * Moved here from `../commands/runLand.ts`, which imports it with the capped read and
 * the refusal it throws, so a verb one wave up can read the same setting the same way. It names GitHub's answer by
 * shape rather than importing `./ghRunner.ts`, a module of this wave, and takes the guard's reader from its caller for
 * the same reason: `readGuardLegs` lives in `./autonomyGate.ts`, also this wave.
 */

/** The strictest setting, and the legs a person has to settle before its `reviewTool` means anything. */
export interface LandSetting extends ResolvedAutonomy {
  /**
   * Each leg, named, where they disagree on the review tool ({@link reviewToolConflict}); empty where they agree. Not
   * empty, no leg's tool stands: `reviewTool` is then only the first leg's, kept so a read still shows a tool is in
   * play, and a land asks a person instead of acting on it.
   */
  readonly reviewToolConflict: readonly string[];
}

/** UTF-8's byte-order mark, which a manifest's reader drops before it parses; built from its code, never typed. */
const BOM = String.fromCharCode(0xfeff);
/** The run's manifest, from the project root. */
const MANIFEST = ".stamity/manifest.json";
/** The most of a manifest, a ledger or a record read. */
export const READ_MAX_BYTES = 4_194_304;

/** A refusal before the decision: the reasons go to `notDone`. */
export class Refused extends Error {
  readonly reasons: string[];

  constructor(...reasons: string[]) {
    super(reasons.join("; "));
    this.reasons = reasons;
  }
}

/**
 * A refusal that is a normal end for a job (REQ-FLOW-157): it exits 0, and `shown` puts its reasons in the status line. To a
 * session it is any refusal.
 */
export class Held extends Refused {
  readonly shown: boolean;

  constructor(shown: boolean, ...reasons: string[]) {
    super(...reasons);
    this.shown = shown;
  }
}

/**
 * `read`, one past what the verb's own folder holds: a refusal from it stops the land as any other, and in a job as a hold.
 * These reads stand in front of ends a job takes quietly, so a GitHub that fails on one must not turn such an end red.
 */
async function holdingOnRefusal<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof Refused) || error instanceof Held) throw error;
    throw new Held(true, ...error.reasons);
  }
}

/** At most `maxBytes` of a regular file (never through a link), and whether it held more; `null` when absent or unreadable. */
export function readCapped(path: string, maxBytes: number): { text: string; truncated: boolean } | null {
  try {
    if (!lstatSync(path).isFile()) return null;
    const fd = openSync(path, "r");
    try {
      if (!fstatSync(fd).isFile()) return null;
      const buffer = Buffer.alloc(maxBytes + 1);
      let filled = 0;
      while (filled < buffer.length) {
        const read = readSync(fd, buffer, filled, buffer.length - filled, filled);
        if (read === 0) break;
        filled += read;
      }
      return { text: buffer.toString("utf8", 0, Math.min(filled, maxBytes)), truncated: filled > maxBytes };
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

/** A branch name or value encoded for a query string in the REST runner's path alphabet. */
export function encodeQuery(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * How many setups' manifests are read together. Each read is its own `gh` process, so a repository holding many setups
 * would otherwise start them all at once and meet the machine's process limit, which refuses a land with no setup at
 * fault and no ask for `--approved` to answer. `../../runs/hookPaths.ts` caps its own read of this list the same way.
 */
const SETUPS_AT_ONCE = 4;

/** `read` of each root, {@link SETUPS_AT_ONCE} at a time, in the order given; the first that refuses decides, and no root still waiting is read. */
async function eachSetup<T>(roots: readonly string[], read: (root: string) => Promise<T>): Promise<T[]> {
  const limit = pLimit(SETUPS_AT_ONCE);
  try {
    return await limit.map(roots, read);
  } finally {
    limit.clearQueue();
  }
}

/** The setting a manifest's text resolves to; text that does not parse resolves to the strictest. */
function settingOf(text: string): ResolvedAutonomy {
  try {
    const parsed: unknown = JSON.parse(text.startsWith(BOM) ? text.slice(1) : text);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return readAutonomy(parsed as { autonomy?: unknown });
  } catch {
    // Falls through to the strictest setting.
  }
  return readAutonomy({ autonomy: "unreadable" });
}

type GitLine = (args: readonly string[]) => Promise<string | null>;
type GitHubCall = (path: string) => Promise<{ readonly status: number; readonly json: unknown }>;

/** The setting on the default branch, `null` where it holds no manifest; any other failed read refuses. */
async function defaultBranchSetting(prefix: string, repoPath: string, defaultBranch: string, call: GitHubCall): Promise<ResolvedAutonomy | null> {
  const path = `${prefix}${MANIFEST}`.split("/").map((segment) => encodeQuery(segment)).join("/");
  const remote = await call(`${repoPath}/contents/${path}?ref=${encodeQuery(defaultBranch)}`);
  if (remote.status === 404) return null;
  if (remote.status !== 200) throw new Refused(`the default branch's manifest read answered HTTP ${remote.status}`);
  const content = typeof remote.json === "object" && remote.json !== null ? (remote.json as Record<string, unknown>)["content"] : undefined;
  return typeof content === "string" ? settingOf(Buffer.from(content, "base64").toString("utf8")) : settingOf("");
}

/** The folders a setting is read from: the repository's top as git names it, the verb's own folder, and that folder below the top (`""` at the top). */
interface SettingPlace {
  readonly top: string;
  readonly cwd: string;
  readonly prefix: string;
}

/**
 * A setup elsewhere as a leg: what it names stands, and a key it leaves out reads as the top's, so a setup silent on a
 * key, a fixture tree's among them, takes nothing from a repository set up at its top.
 */
function namedOver(top: ResolvedAutonomy, setup: ResolvedAutonomy): ResolvedAutonomy {
  return { ...top, ...setup };
}

/** The three manifests of the project at `prefix`, whose folder is `dir`, as legs, and whether the default branch held its own. */
async function manifestLegs(
  dir: string,
  prefix: string,
  repoPath: string,
  defaultBranch: string,
  gitLine: GitLine,
  call: GitHubCall,
): Promise<{ legs: AutonomyLeg[]; onDefaultBranch: boolean }> {
  const named = prefix === "" ? "" : ` of ${prefix}`;
  const legs: AutonomyLeg[] = [];
  const remote = await defaultBranchSetting(prefix, repoPath, defaultBranch, call);
  if (remote !== null) legs.push({ source: `the default branch's manifest${named}`, setting: remote });
  const committed = await gitLine(["show", `HEAD:${prefix}${MANIFEST}`]);
  if (committed !== null) legs.push({ source: `the manifest committed at \`HEAD\`${named}`, setting: settingOf(committed) });
  const local = readCapped(join(dir, MANIFEST), READ_MAX_BYTES);
  if (local !== null) legs.push({ source: `the manifest on disk${named}`, setting: local.truncated ? settingOf("") : settingOf(local.text) });
  return { legs, onDefaultBranch: remote !== null };
}

/**
 * Each leg of the setting, named: the default branch's manifest (so the run cannot loosen it on its own branch), `HEAD`'s,
 * the work tree's and the baked guard's, whose legs `guard` reads from a folder (none where the setup has no guard). None
 * of the three manifests refuses as `no setup found`. A leg with no manifest at all is no leg.
 *
 * Those legs are the top's, wherever the verb started, so a folder the top's setting does not name cannot step around
 * it, and started below the top the project's own legs stand beside them. The top's default-branch manifest must be
 * there, wherever the verb started, since it is what a run cannot write, so with none it refuses, and a repository
 * whose only setup sits below the top waits for a person to place one. That refusal is a {@link Held}, and so is one from
 * reading the top's legs below the top: the job's own hold is judged on these legs, so neither may turn that end red.
 */
export async function readLegs(
  place: SettingPlace,
  repoPath: string,
  defaultBranch: string,
  gitLine: GitLine,
  call: GitHubCall,
  guard: (rootDir: string) => Promise<readonly AutonomyLeg[]>,
): Promise<[AutonomyLeg, ...AutonomyLeg[]]> {
  const { top, cwd, prefix } = place;
  const below = prefix !== "";
  const readTop = (): ReturnType<typeof manifestLegs> => manifestLegs(top, "", repoPath, defaultBranch, gitLine, call);
  const atTop = await (below ? holdingOnRefusal(readTop) : readTop());
  const atProject = below ? (await manifestLegs(cwd, prefix, repoPath, defaultBranch, gitLine, call)).legs : [];
  const manifests = [...atTop.legs, ...atProject];
  const [first] = manifests;
  if (first === undefined) throw new Refused(`no setup found: no ${MANIFEST} on ${defaultBranch}, at HEAD or in the work tree`);
  if (!atTop.onDefaultBranch) {
    throw new Held(true, `${defaultBranch} holds no ${MANIFEST} at the repository's top, so nothing a run cannot write binds this land: a person places one there first`);
  }
  const topGuard = await guard(top);
  const projectGuard = below ? (await guard(cwd)).map(({ source, setting }) => ({ source: `${source} of ${prefix}`, setting })) : [];
  return [first, ...manifests.slice(1), ...topGuard, ...projectGuard];
}

/** The strictest of `legs`, and those legs named where they disagree on the review tool; a leg with no manifest names no tool and disagrees with nothing. */
export function settingOfLegs(legs: readonly [AutonomyLeg, ...AutonomyLeg[]]): LandSetting {
  return { ...strictestAutonomy(legs[0].setting, ...legs.slice(1).map((leg) => leg.setting)), reviewToolConflict: reviewToolConflict(legs) };
}

/**
 * The setting {@link readLegs}' `legs` make with every other setup in `setups`, each read from the default branch alone, as
 * {@link namedOver} says, so what a project names binds wherever the verb started; one the default branch does not hold is no leg.
 */
export async function readSetting(
  legs: readonly [AutonomyLeg, ...AutonomyLeg[]],
  place: { readonly prefix: string; readonly setups: readonly string[] },
  repoPath: string,
  defaultBranch: string,
  call: GitHubCall,
): Promise<LandSetting> {
  const { prefix, setups } = place;
  const roots = [...new Set(setups)].filter((root) => root !== "" && root !== prefix);
  const read = await holdingOnRefusal(() => eachSetup(roots, (root) => defaultBranchSetting(root, repoPath, defaultBranch, call)));
  const elsewhere = roots.flatMap((root, index) => {
    const setting = read[index] ?? null;
    return setting === null ? [] : [{ source: `the default branch's manifest of ${root}`, setting: namedOver(legs[0].setting, setting) }];
  });
  return settingOfLegs([...legs, ...elsewhere]);
}

/**
 * The `autonomy` keys the manifests at `roots` (`""` for the repository's top) loosen at `HEAD` against the default
 * branch's, each key once, for a land ask to name: a manifest's path alone also moves on every sync, so an ask that names
 * only the path does not tell a person a key is loosening. A default branch with no manifest reads as the default
 * setting, so a key turned on is still named; at the top a `HEAD` with no manifest names nothing, since the next land
 * then refuses.
 *
 * A manifest below the top binds the whole repository as {@link namedOver} reads it, so it is judged that way too: a key
 * it leaves out reads as the top's, so taking a key out can lift what the top holds, and a `HEAD` with no manifest there
 * takes every key it named. A setup new on this branch adds a leg, which loosens nothing as read, so only its own text
 * is judged.
 */
export async function readLooserKeys(roots: readonly string[], repoPath: string, defaultBranch: string, gitLine: GitLine, call: GitHubCall): Promise<string[]> {
  return holdingOnRefusal(async () => {
    const topRead = roots.some((root) => root !== "") ? await defaultBranchSetting("", repoPath, defaultBranch, call) : null;
    const top = topRead ?? readAutonomy({});
    const asRead = (setting: ResolvedAutonomy | null): ResolvedAutonomy => strictestAutonomy(top, namedOver(top, setting ?? top));
    const read = await eachSetup(roots, async (root) => {
      const committed = await gitLine(["show", `HEAD:${root}${MANIFEST}`]);
      if (root === "" && committed === null) return [];
      const next = committed === null ? null : settingOf(committed);
      const baseline = await defaultBranchSetting(root, repoPath, defaultBranch, call);
      const alone = next === null ? [] : looserAutonomyKeys(next, baseline ?? readAutonomy({}));
      return root === "" || baseline === null ? alone : [...alone, ...looserAutonomyKeys(asRead(next), asRead(baseline))];
    });
    return [...new Set(read.flat())];
  });
}
