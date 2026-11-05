import { realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, parse } from "node:path";
import { entryPlaceOf, placeOf, withinAny, type PlaceReads } from "../../runs/landEvidence.ts";
import { ghProgramPath, withoutVersionChoice, type GhApiOptions } from "./ghRunner.ts";
import { Refused } from "./landSetting.ts";

/**
 * Whether a verb may trust what `gh` answers (REQ-FLOW-131, REQ-FLOW-132): the check `run land` and the pre-flight both run
 * before their first REST read, so what either proves rests on a program the run could not write. Moved here from
 * `../commands/runLand.ts`, since that verb and `../commands/gate.ts` share a wave and neither may import the other.
 */

/**
 * review/96: the folder every `gh` call starts in: `/` on POSIX; on Windows the system drive's root (`SystemDrive` and
 * a `\`), else the root of the home folder's drive.
 */
function filesystemRoot(): string {
  if (process.platform !== "win32") return "/";
  const drive = process.env["SystemDrive"] ?? "";
  return /^[A-Za-z]:$/.test(drive) ? `${drive}\\` : parse(homedir()).root;
}

/**
 * build/18: the temp folders a planted `gh` must not lie in: `os.tmpdir()`; `/tmp` and `/var/tmp` on POSIX; on macOS
 * also `/var/folders`; on win32 also `%TEMP%`, `%TMP%` and the user's local `Temp` folder under `AppData`, from the
 * verb's environment and the process's, as found. `os.tmpdir()` follows `TMPDIR`, and macOS gives each user's temp
 * folder to a process only through that variable, so with it unset or moved `os.tmpdir()` says nothing of that folder:
 * `/var/folders`, which holds every user's, is named here.
 */
export function tempRoots(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string[] {
  if (platform !== "win32") return [tmpdir(), "/tmp", "/var/tmp", ...(platform === "darwin" ? ["/var/folders"] : [])];
  const named = [env, process.env].flatMap((from) => [from["TEMP"], from["TMP"], from["LOCALAPPDATA"] === undefined ? undefined : join(from["LOCALAPPDATA"], "Temp")]);
  return [tmpdir(), join(homedir(), "AppData", "Local", "Temp"), ...named.filter((root): root is string => typeof root === "string" && root !== "")];
}

/** gh, before any of its answers is trusted: outside the work tree and the temp folders. What every later call starts; `lines` takes what was dropped from its environment. */
export function trustedGh(cwd: string, env: NodeJS.ProcessEnv, top: string, lines: string[]): GhApiOptions {
  const gh = ghProgramPath({ cwd, env });
  if (gh === null) throw new Refused("gh not found on PATH");
  if (!isAbsolute(gh)) throw new Refused("gh resolves to a PATH entry that is not an absolute path");
  // review/91: the PATH entry (its folder's links resolved) and the program it finally names are each checked; a
  // version manager's shim is a link whose target picks the tool by the name it was started under. build/18: each
  // place and each root read as one real, normalised form (Windows' short and long names, either separator, any
  // letter case), compared by a separator boundary; a place that does not resolve counts as inside.
  const placeReads: PlaceReads = { platform: process.platform, realpath: (path) => realpathSync.native(path) };
  const ghPlaces = [entryPlaceOf(gh, placeReads), placeOf(gh, placeReads)];
  const where = (roots: readonly string[]): boolean => ghPlaces.some((place) => withinAny(place, roots, placeReads));
  if (where([top])) throw new Refused("gh resolves to a program inside the work tree, whose answers the run could write");
  if (where(tempRoots(env))) throw new Refused("gh resolves to a program inside a temp folder, whose answers the run could write");
  // review/75, review/91: every later call starts this same absolute PATH entry, never one resolved again from PATH,
  // and never its link target, so a shim still sees its own name. review/95, review/96: from the filesystem's root
  // (every call names its host and its full API path, so gh needs no repository folder), which has no parent a
  // version manager's shim reads a version file from and which no one but an administrator writes, and without the
  // version managers' version-choosing variables, so the run cannot steer a shim to another program.
  const shimNeutral = withoutVersionChoice(env);
  if (shimNeutral.dropped.length > 0) lines.push(`gh environment: dropped ${shimNeutral.dropped.join(", ")}`);
  return { cwd: filesystemRoot(), env: shimNeutral.env, program: gh };
}
