#!/usr/bin/env node
// The locator every plugin root ships as `runtime/locate.mjs`, and the one file
// in this repository copied VERBATIM into a distribution: whatever a client
// spawns for a stamity command goes through here first.
//
// That copy is why this file imports nothing but node builtins. It lands in a
// plugin root beside a bundled runtime and nothing else — no node_modules of
// its own, no sibling module of this repository's, not even `./runtime.mjs`.
// An import of anything else would resolve here and fail there, on a user's
// machine, with a stack trace naming a path that does not exist.
//
// What it decides, in order:
//
//   1. Node floor.   `<runtime>/package.json` `engines.node` (`>=x.y.z`) against
//                    the running interpreter. Below the floor is a refusal, not
//                    a downgrade: the runtime cannot run, so nothing else about
//                    the resolution matters.
//   2. Project.      `--project`, else `STAMITY_REPO_ROOT` under BOTH of the
//                    bounds `src/hooks/scripts.ts` puts on it (ancestor-or-equal
//                    of the working directory, AND holding a `.stamity`
//                    directory), else the working directory. A value failing
//                    either bound is ignored and the working directory stands.
//   3. Runtime.      A COMPANION install of the stamity package in the project
//                    wins when its version satisfies the plugin's compatible
//                    range, because a repository that pinned its own version is
//                    the authority on which engine reads its state. Otherwise
//                    the BUNDLED copy beside this file.
//
// It never consults PATH. A `stamity` on PATH is an unrelated program as far as
// a plugin is concerned — a different version, a shim, a shadowing name — and
// spawning it would make the resolution above decorative. The only two
// candidates are the two paths named in the refusal below.
//
// The compatible range comes from `../stamity-plugin.json` (`version`, and
// `runtime.companion.package` / `runtime.companion.compatible` when present).
// A bare runtime directory with no descriptor beside it still locates itself:
// the fallback is `<runtime>/package.json`'s own `name` and `^<version>`, so a
// runtime lifted out of a root on its own keeps working.
//
// `STAMITY_LOCATE_NODE_VERSION` overrides the interpreter version the floor is
// checked against. It is TEST-ONLY — it exists so the refusal below can be
// proven on a machine that satisfies the floor, and it changes nothing except
// which version string is compared and reported.
//
// Exit codes: 0 the runtime ran (or --print reported it), 1 the child died on a
// signal, 2 a refusal or a bad argument.
// Usage: node locate.mjs [--print] [--project <dir>] [--companion <package>] -- <stamity args>

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = 'Usage: node locate.mjs [--print] [--project <dir>] [--companion <package>] -- <stamity args>'

/** The directory this file sits in: the runtime directory of a plugin root. */
const RUNTIME_DIR = dirname(fileURLToPath(import.meta.url))

function usage(problem) {
  console.error(`${problem}\n${USAGE}`)
  process.exit(2)
}

/**
 * A JSON file, or `undefined` when it is absent or does not parse.
 *
 * Absent is the ordinary case for every file this reads and says nothing.
 * MALFORMED is a one-line stderr warning naming the path, as the companion
 * probe below already does for its own manifest: a descriptor that exists and
 * cannot be read changes what the locator resolves — an unreadable
 * `runtime/package.json` drops the Node floor, so the refusal that should have
 * named an old interpreter never fires — and silence there is a resolution
 * nobody can account for.
 */
function readJson(path) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
  try {
    return JSON.parse(raw)
  } catch {
    console.error(`stamity plugin: ignoring ${path} — it is not readable JSON`)
    return undefined
  }
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const isNonEmptyString = (value) => typeof value === 'string' && value !== ''

// ── versions ────────────────────────────────────────────────────────────────

/** `major.minor.patch` plus an optional prerelease; build metadata is ignored. */
function parseVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(text ?? '').trim())
  if (match === null) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  }
}

/** -1, 0 or 1 over `major.minor.patch` only. */
function compareTriples(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1
  }
  return 0
}

/**
 * The caret comparator, in the only four shapes a plugin range takes. Written
 * out rather than imported, because `semver` is exactly the kind of dependency
 * this file cannot have.
 *
 *   ^1.8.0        same major, at or ahead of 1.8.0
 *   ^0.7.2        same minor, at or ahead of 0.7.2
 *   ^0.0.3        exactly 0.0.3
 *   ^1.9.0-rc.1   exactly 1.9.0-rc.1
 *
 * A prerelease COMPANION is refused under a released range: `1.9.0-rc.1` is not
 * `1.9.0`, and a plugin pinned to a release should not be answered by a
 * candidate that has not shipped. A prerelease RANGE is the mirror image — it
 * accepts only the identical prerelease, because there is no ordering between
 * two release candidates a plugin can safely assume.
 */
function satisfiesCaret(version, range) {
  if (typeof range !== 'string' || !range.startsWith('^')) return false
  const want = parseVersion(range.slice(1))
  const have = parseVersion(version)
  if (want === undefined || have === undefined) return false
  if (want.prerelease !== null) return compareTriples(have, want) === 0 && have.prerelease === want.prerelease
  if (have.prerelease !== null) return false
  if (want.major >= 1) return have.major === want.major && compareTriples(have, want) >= 0
  if (want.minor > 0) return have.major === 0 && have.minor === want.minor && have.patch >= want.patch
  return compareTriples(have, want) === 0
}

/** The `>=x.y.z` floor an `engines.node` range declares, as a plain version. */
function parseNodeFloor(engines) {
  const match = /^\s*>=\s*v?(\d+\.\d+\.\d+)/.exec(String(engines ?? ''))
  return match === null ? null : match[1]
}

// ── the plugin root ─────────────────────────────────────────────────────────

/** The runtime's own manifest: the Node floor, and the identity fallback. */
const runtimeManifest = readJson(join(RUNTIME_DIR, 'package.json')) ?? {}

/**
 * The descriptor beside the runtime directory, when there is one. A runtime
 * directory copied out on its own has none, and falls back to its own manifest.
 */
function readDescriptor() {
  const descriptor = readJson(join(RUNTIME_DIR, '..', 'stamity-plugin.json'))
  const companion = isObject(descriptor) && isObject(descriptor.runtime) && isObject(descriptor.runtime.companion)
    ? descriptor.runtime.companion
    : {}
  const version = isObject(descriptor) && isNonEmptyString(descriptor.version)
    ? descriptor.version
    : runtimeManifest.version
  return {
    package: isNonEmptyString(companion.package) ? companion.package : runtimeManifest.name,
    compatible: isNonEmptyString(companion.compatible) ? companion.compatible : `^${version ?? '0.0.0'}`,
  }
}

/**
 * The entry file of an installed package: its `bin` when it declares one (the
 * `stamity` entry by name, else the first in sorted order, so the choice does
 * not depend on key insertion), and the conventional build output otherwise.
 */
function entryOf(packageDir, manifest) {
  const bin = isObject(manifest) ? manifest.bin : undefined
  if (isNonEmptyString(bin)) return resolve(packageDir, bin)
  if (isObject(bin)) {
    const names = Object.keys(bin).toSorted()
    const pick = names.includes('stamity') ? 'stamity' : names[0]
    if (pick !== undefined && isNonEmptyString(bin[pick])) return resolve(packageDir, bin[pick])
  }
  return join(packageDir, 'dist', 'cli.js')
}

// ── resolution ──────────────────────────────────────────────────────────────

/**
 * The repository the plugin is acting on. The `STAMITY_REPO_ROOT` bounds are
 * the ones `src/hooks/scripts.ts` emits into every hook script, mirrored here
 * rather than imported for the same reason nothing else is imported: a value
 * that is not an ancestor of the working directory, or that names a directory
 * holding no state directory, is not naming the repository the client opened.
 */
function resolveProject(flag) {
  if (flag !== null) return resolve(flag)
  const cwd = resolve(process.cwd())
  const declared = process.env.STAMITY_REPO_ROOT
  if (typeof declared !== 'string' || declared === '') return cwd
  const candidate = resolve(cwd, declared)
  const prefix = candidate.endsWith(sep) ? candidate : candidate + sep
  if (candidate !== cwd && !cwd.startsWith(prefix)) return cwd
  try {
    if (!statSync(join(candidate, '.stamity')).isDirectory()) return cwd
  } catch {
    // Unreadable or absent: either way the declared root is not usable, and
    // the working directory stands.
    return cwd
  }
  return candidate
}

/** The nearest directory at or above `from` that holds a package.json. */
function nearestPackageRoot(from) {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * The companion install, if the project has one in range.
 *
 * `probe` is always reported, even when nothing was probed, because it is the
 * path the refusal message has to name: it is where a companion WOULD be, which
 * is the only actionable thing to tell someone whose runtime did not resolve.
 */
function findCompanion(projectDir, packageName, range) {
  const segments = String(packageName ?? '').split('/').filter((part) => part !== '')
  const root = nearestPackageRoot(projectDir)
  const probe = join(root ?? projectDir, 'node_modules', ...segments, 'package.json')
  if (root === null || segments.length === 0) return { probe, found: null }
  if (!existsSync(probe)) return { probe, found: null }
  const manifest = readJson(probe)
  if (!isObject(manifest)) {
    // `readJson` already named the path when it failed to PARSE; this branch
    // covers the rest — valid JSON that is not an object — so the two do not
    // print the same line twice for one file.
    if (manifest !== undefined) {
      console.error(`stamity plugin: ignoring ${probe} — it is not readable JSON`)
    }
    return { probe, found: null }
  }
  if (!satisfiesCaret(manifest.version, range)) return { probe, found: null }
  const entry = entryOf(dirname(probe), manifest)
  if (!existsSync(entry)) return { probe, found: null }
  return { probe, found: { kind: 'companion', path: entry, version: String(manifest.version) } }
}

/** The copy shipped inside the plugin root, beside this file. */
function bundled() {
  const path = join(RUNTIME_DIR, 'dist', 'cli.js')
  return {
    path,
    found: existsSync(path)
      ? { kind: 'bundled', path, version: isNonEmptyString(runtimeManifest.version) ? runtimeManifest.version : null }
      : null,
  }
}

// ── the run ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
let print = false
let projectFlag = null
let companionFlag = null
let forwarded = []
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (arg === '--') {
    forwarded = args.slice(i + 1)
    break
  } else if (arg === '--print') {
    print = true
  } else if (arg === '--project') {
    i += 1
    if (i >= args.length) usage('--project needs a directory.')
    projectFlag = args[i]
  } else if (arg === '--companion') {
    i += 1
    if (i >= args.length) usage('--companion needs a package name.')
    companionFlag = args[i]
  } else {
    usage(`Unknown argument: ${arg}`)
  }
}

const descriptor = readDescriptor()
const companionPackage = companionFlag ?? descriptor.package
const project = resolveProject(projectFlag)

const floor = parseNodeFloor(runtimeManifest.engines?.node)
const nodeVersion = String(process.env.STAMITY_LOCATE_NODE_VERSION ?? process.versions.node).replace(/^v/, '')
const parsedNode = parseVersion(nodeVersion)
const parsedFloor = floor === null ? null : parseVersion(floor)
// An unreadable floor judges nothing: a runtime that failed to declare one is a
// packaging defect, and refusing every run over it would be worse than running.
const nodeOk = parsedFloor === null || parsedNode === undefined || compareTriples(parsedNode, parsedFloor) >= 0

const bundle = bundled()
const companion = findCompanion(project, companionPackage, descriptor.compatible)
const resolved = companion.found ?? bundle.found

let refusal = null
if (!nodeOk) {
  refusal =
    `stamity plugin: Node ${nodeVersion} is below the floor ${floor}; ` +
    `install Node ${floor} or newer (https://nodejs.org) and retry`
} else if (resolved === null) {
  refusal =
    `stamity plugin: no runtime found — probed ${companion.probe} and ${bundle.path}; ` +
    'reinstall the plugin'
}

if (print) {
  // Fixed key order, and every key always present: a consumer (the doctor row
  // of REQ-PLUGIN-008 among them) reads one shape whether or not this refused.
  const report = {
    project,
    runtime: {
      kind: refusal === null ? resolved.kind : 'none',
      path: refusal === null ? resolved.path : null,
      version: refusal === null ? resolved.version : null,
      refusal,
    },
    node: { version: nodeVersion, floor, ok: nodeOk },
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exit(refusal === null ? 0 : 2)
}

if (refusal !== null) {
  console.error(refusal)
  process.exit(2)
}

/**
 * The plugin root this locator sits in, handed to a `plugin` subcommand as `--plugin-root`
 * (prove/259). The locator KNOWS its root — `dirname(RUNTIME_DIR)` — and until 2026-09-22 never
 * said so: it spawned the CLI with only `cwd` and `stdio`, so the Codex README's setup line,
 * followed literally with the cache path substituted, exited 1 with "No installed plugin root"
 * (measured on codex-cli 0.154.0), while the same line with `PLUGIN_ROOT` set exited 0.
 *
 * The FLAG rather than a variable in the child's environment, because of how the CLI resolves
 * a root (`src/cli/commands/plugin.ts`, `resolveRoots`): a flagged root is read first and
 * validated by its own capability file; the environment is a fallback read in a fixed order —
 * CLAUDE_PLUGIN_ROOT, CURSOR_PLUGIN_ROOT, PLUGIN_ROOT, COPILOT_PLUGIN_ROOT — so a `PLUGIN_ROOT`
 * set here would be shadowed by a client's own variable when that is ALSO set (a stale
 * CLAUDE_PLUGIN_ROOT from another session, a hook's export), and the CLI would set up whatever
 * root that named. The flag is deterministic and is what the CLI validates.
 *
 * Only for a `plugin` subcommand, only when the caller passed no `--plugin-root` of its own,
 * and only when the parent directory IS a plugin root (it carries `stamity-plugin.json`): a
 * bare runtime directory locates itself too, and handing the CLI a directory that is not a root
 * would turn "no root" into "malformed root".
 */
function withPluginRoot(stamityArgs) {
  if (stamityArgs[0] !== 'plugin' || stamityArgs.includes('--plugin-root')) return stamityArgs
  const root = dirname(RUNTIME_DIR)
  if (!existsSync(join(root, 'stamity-plugin.json'))) return stamityArgs
  return [...stamityArgs, '--plugin-root', root]
}

const child = spawnSync(process.execPath, [resolved.path, ...withPluginRoot(forwarded)], {
  cwd: project,
  stdio: 'inherit',
  shell: false,
})
if (child.error !== undefined) {
  console.error(`stamity plugin: could not start ${resolved.path} — ${child.error.message}`)
  process.exit(1)
}
if (child.signal !== null && child.signal !== undefined) {
  console.error(`stamity plugin: the runtime was terminated by ${child.signal}`)
  process.exit(1)
}
process.exit(child.status ?? 1)
