import { closeSync, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { looserAutonomyKeys, readAutonomy, strictestAutonomy, type ResolvedAutonomy } from "../../config/autonomy.ts";

/**
 * The setting a run's act reads (REQ-FLOW-132, REQ-FLOW-137, REQ-FLOW-138): the strictest of the default branch's
 * manifest, `HEAD`'s, the work tree's and the baked guard's, so a run cannot loosen it on its own branch and a key
 * merged to the default branch binds only once a person has baked it. Moved here from `../commands/runLand.ts`, which
 * imports it with the capped read and the refusal it throws, so a verb one wave up can read the same setting the same
 * way. It names GitHub's answer by shape rather than importing `./ghRunner.ts`, a module of this wave, and takes the
 * guard's reader from its caller for the same reason: `readGuardSetting` lives in `./autonomyGate.ts`, also this wave.
 */

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

/**
 * The setting as the strictest of the default branch's manifest (so the run cannot loosen it on its own branch and it
 * stays the first leg, whose review tool stands), `HEAD`'s, the work tree's and the baked guard's, which `guard` reads
 * from `cwd` (`null` where the setup has none); none of the three manifests there refuses as `no setup found`.
 */
export async function readSetting(
  cwd: string,
  prefix: string,
  repoPath: string,
  defaultBranch: string,
  gitLine: GitLine,
  call: GitHubCall,
  guard: (rootDir: string) => Promise<ResolvedAutonomy | null>,
): Promise<ResolvedAutonomy> {
  const found: ResolvedAutonomy[] = [];
  const remote = await defaultBranchSetting(prefix, repoPath, defaultBranch, call);
  if (remote !== null) found.push(remote);
  const committed = await gitLine(["show", `HEAD:./${MANIFEST}`]);
  if (committed !== null) found.push(settingOf(committed));
  const local = readCapped(join(cwd, MANIFEST), READ_MAX_BYTES);
  if (local !== null) found.push(local.truncated ? settingOf("") : settingOf(local.text));
  const [first, ...rest] = found;
  if (first === undefined) throw new Refused(`no setup found: no ${MANIFEST} on ${defaultBranch}, at HEAD or in the work tree`);
  const baked = await guard(cwd);
  return strictestAutonomy(first, ...rest, ...(baked === null ? [] : [baked]));
}

/**
 * The `autonomy` keys `HEAD`'s manifest loosens against the default branch's, for a land ask to name: the manifest's
 * path alone also moves on every sync, so an ask that names only the path does not tell a person a key is loosening.
 * A default branch with no manifest reads as the default setting, so a key turned on is still named; a `HEAD` with no
 * manifest names nothing, the default branch's setting standing.
 */
export async function readLooserKeys(prefix: string, repoPath: string, defaultBranch: string, gitLine: GitLine, call: GitHubCall): Promise<string[]> {
  const committed = await gitLine(["show", `HEAD:./${MANIFEST}`]);
  if (committed === null) return [];
  const baseline = await defaultBranchSetting(prefix, repoPath, defaultBranch, call);
  return looserAutonomyKeys(settingOf(committed), baseline ?? readAutonomy({}));
}
