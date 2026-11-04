import { closeSync, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { readAutonomy, strictestAutonomy, type ResolvedAutonomy } from "../../config/autonomy.ts";

/**
 * The setting a run's act reads (REQ-FLOW-132, REQ-FLOW-137): the strictest of the default branch's manifest, `HEAD`'s
 * and the work tree's, so a run cannot loosen it on its own branch. Moved here from `../commands/runLand.ts`, which
 * imports it with the capped read and the refusal it throws, so a verb one wave up can read the same setting the same
 * way. It names GitHub's answer by shape rather than importing `./ghRunner.ts`, a module of this wave.
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

/**
 * The setting as the strictest of the default branch's manifest (so the run cannot loosen it on its own branch),
 * `HEAD`'s and the work tree's; none of the three there refuses as `no setup found`.
 */
export async function readSetting(
  cwd: string,
  prefix: string,
  repoPath: string,
  defaultBranch: string,
  gitLine: (args: readonly string[]) => Promise<string | null>,
  call: (path: string) => Promise<{ readonly status: number; readonly json: unknown }>,
): Promise<ResolvedAutonomy> {
  const found: ResolvedAutonomy[] = [];
  const path = `${prefix}${MANIFEST}`.split("/").map((segment) => encodeQuery(segment)).join("/");
  const remote = await call(`${repoPath}/contents/${path}?ref=${encodeQuery(defaultBranch)}`);
  if (remote.status === 200) {
    const content = typeof remote.json === "object" && remote.json !== null ? (remote.json as Record<string, unknown>)["content"] : undefined;
    found.push(typeof content === "string" ? settingOf(Buffer.from(content, "base64").toString("utf8")) : settingOf(""));
  } else if (remote.status !== 404) {
    throw new Refused(`the default branch's manifest read answered HTTP ${remote.status}`);
  }
  const committed = await gitLine(["show", `HEAD:./${MANIFEST}`]);
  if (committed !== null) found.push(settingOf(committed));
  const local = readCapped(join(cwd, MANIFEST), READ_MAX_BYTES);
  if (local !== null) found.push(local.truncated ? settingOf("") : settingOf(local.text));
  const [first, ...rest] = found;
  if (first === undefined) throw new Refused(`no setup found: no ${MANIFEST} on ${defaultBranch}, at HEAD or in the work tree`);
  return strictestAutonomy(first, ...rest);
}
