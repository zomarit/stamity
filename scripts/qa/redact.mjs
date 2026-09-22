#!/usr/bin/env node
// The path redaction every reason goes through before it is printed or written into
// `.stamity/evidence/`: the route smoke's leg reasons, the plugins lane's row reasons and the hooks
// lane's fixture-build failure. ONE module, because three files need the SAME sweep and a second
// copy of the pattern is a pin that drifts, while the thing it guards is an absolute path reaching
// a committed evidence file. It sits beside the lanes rather than inside the smoke — where the
// sweep used to live — because the smoke imports `hook-runs.mjs` (for `exitDescription` and the
// Windows probe limit), so a hooks lane that took the sweep from the smoke would close an import
// cycle.

import { realpathSync } from 'node:fs'

/** Every user home a line could name, swept in one pass: POSIX, macOS and the Windows spelling. */
const HOME_PATHS = /(?:\/Users|\/home|\/root)\/[^/\s"']+|[A-Za-z]:\\Users\\[^\\/\s"']+/g

/**
 * The OS temp roots in the spelling a child process reports on macOS. `os.tmpdir()` is
 * `/var/folders/<a>/<b>/T` and `/tmp` is `/tmp`, and both are symlinks into `/private`, so a
 * `process.cwd()` under either — and `realpathSync`, which `test/ci/pluginLifecycle.test.ts`
 * applies to its own root — spells them `/private/var/folders/<a>/<b>/T` and `/private/tmp`. A
 * pair built from the `os.tmpdir()` spelling never matched the resolved one, and the home sweep
 * stops at `/Users`, so a failed fixture build's `--out` under the resolved root reached an H5
 * reason. The sweep takes whichever spelling the pairs did not, under the label the pairs use.
 */
const PRIVATE_TMP_PATHS = /\/private\/(?:var\/folders\/[^/\s"']+\/[^/\s"']+\/T|tmp)(?![^/\s"'])/g

/**
 * `text` with the paths that must never reach a printed line or a committed evidence file removed.
 *
 * `replacements` are the run's own known locations, replaced by their LOGICAL label first, so a
 * reader still learns which tree a line is about; the sweeps then take any home this run did not
 * know it would see (a second checkout, another account, a runner's) and the resolved spelling of
 * the temp roots.
 */
export function redactPaths(text, replacements = []) {
  let out = String(text ?? '')
  for (const [from, to] of replacements) {
    if (typeof from === 'string' && from.length > 0) out = out.replaceAll(from, to)
  }
  return out.replaceAll(HOME_PATHS, '<home>').replaceAll(PRIVATE_TMP_PATHS, '<tmp>')
}

/**
 * One replacement pair per SPELLING of `path`, under one label: the path as given and, when it
 * differs, its resolved form — resolved FIRST, because the resolved form can contain the given one
 * as its tail (`/private` + `/var/…`) and a pair applied in the other order leaves `/private<tmp>`
 * behind. A path that does not exist has one spelling; a blank or absent one has none, so a
 * caller hands an undefined scratch directory through this rather than branching around it.
 */
export function spellingsOf(path, label) {
  if (typeof path !== 'string' || path === '') return []
  let resolved = path
  try {
    resolved = realpathSync(path)
  } catch {
    // Absent or unreadable: the given spelling is the only one a line could carry.
  }
  return resolved === path ? [[path, label]] : [[resolved, label], [path, label]]
}
