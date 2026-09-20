// The pieces `scripts/build-plugin-runtime.mjs` assembles a bundled runtime out
// of: a tar reader, a production install, the prune, the manifest and the
// measurement. Kept apart from the CLI so each step is testable on its own and
// so P8's distribution builder can reuse the measurement without re-running a
// build.
//
// THE TAR SUBSET. The extractor reads the archive itself rather than shelling
// out to a `tar` binary, because the Windows leg of CI has no guaranteed one and
// a build step that works on three platforms out of four is not a build step.
// What it understands, and nothing more:
//
//   header      512-byte ustar blocks; `name` (0..100) joined under `prefix`
//               (345..500); `size` (124..136) as NUL/space-terminated octal;
//               `typeflag` at 156; the `ustar` magic at 257 is required.
//   entries     regular files ('0' and the historical '\0') and directories
//               ('5'). Every other type is refused by name — a hard link or a
//               symlink in a package tarball is a write this build will not
//               perform on someone's disk.
//   pax         an 'x' extended header preceding an entry supplies `path` and
//               `size` for it (the `length key=value\n` record form, read as
//               bytes so a multibyte path counts correctly). A 'g' global
//               header is skipped. GNU long-name entries ('L'/'K') are NOT
//               supported: npm's packer emits pax, and a format nothing we
//               build produces is better refused than half-read.
//   end         the first all-zero block ends the archive.
//   sizes       base-256 (the high bit set in the size field) is refused; it
//               means a file above 8 GiB, which this is not.
//
// Path safety is checked on the name AS WRITTEN, before it touches the disk: a
// backslash, an absolute path, a `..` segment, or anything outside the
// `package/` prefix ends the build naming the entry. The resolved destination is
// then re-checked against the output directory, so a name that slipped past the
// text checks still cannot escape.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { gunzipSync } from 'node:zlib'

/** The prefix every entry of an npm tarball carries. */
export const PACKAGE_PREFIX = 'package'

/**
 * Files pruned UNDER `node_modules`: documentation, sourcemaps, declarations.
 *
 * The scope is the whole point. `dist/content/` is the bundled corpus — every
 * agent, command, rule and skill body, and the charter — and it is `.md` by
 * FORMAT, not by being documentation. A suffix prune that walked the whole tree
 * would empty the runtime of the content it exists to serve, and every
 * `package.json`-shaped assertion about that runtime would stay green.
 */
export const PRUNE_FILE_SUFFIXES = ['.md', '.map', '.d.ts', '.d.mts', '.d.cts']

/** Directories pruned under `node_modules`: a dependency's own test and doc trees. */
export const PRUNE_DIRECTORY_NAMES = ['test', 'tests', 'docs', '.github']

/** Scopes pruned whole from `node_modules`. */
export const PRUNE_SCOPES = ['@types']

/** Kept whatever their extension: the licences a redistribution must carry. */
const KEEP_FILE_PATTERN = /^(licen[cs]e|copying|notice)/i

// ── the tar reader ──────────────────────────────────────────────────────────

function readField(header, start, end) {
  const raw = header.toString('utf8', start, end)
  const nul = raw.indexOf('\0')
  return nul === -1 ? raw : raw.slice(0, nul)
}

function readSize(header) {
  if ((header[124] & 0x80) !== 0) {
    throw new Error('the tarball uses base-256 sizes, which this reader does not support')
  }
  const text = readField(header, 124, 136).trim()
  if (text === '') return 0
  const size = Number.parseInt(text, 8)
  if (!Number.isInteger(size) || size < 0) {
    throw new Error(`the tarball carries an unreadable size field ${JSON.stringify(text)}`)
  }
  return size
}

/** `length key=value\n` records, counted in bytes. */
function parsePaxRecords(body) {
  const records = {}
  let offset = 0
  while (offset < body.length) {
    const space = body.indexOf(0x20, offset)
    if (space === -1) break
    const length = Number(body.toString('utf8', offset, space))
    if (!Number.isInteger(length) || length <= 0 || offset + length > body.length) break
    const record = body.toString('utf8', space + 1, offset + length).replace(/\n$/, '')
    const equals = record.indexOf('=')
    if (equals > 0) records[record.slice(0, equals)] = record.slice(equals + 1)
    offset += length
  }
  return records
}

/**
 * Every entry of a decompressed archive, in the order it was written.
 *
 * Two properties this reader will not trade away. Every body is bounds-checked
 * BEFORE it is read — extended headers included — because `subarray` clamps
 * rather than throwing, so a short read looks exactly like a complete one and
 * the caller writes a silently incomplete file. And the stream has to END the
 * way tar says it ends, with two zero blocks: a tarball truncated at a block
 * boundary otherwise runs the loop out of input and returns the entries it
 * happened to reach, which is a PARTIAL extraction reported as a whole one.
 */
export function* readTarEntries(archive) {
  let offset = 0
  let pending = null
  let terminated = false
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    offset += 512
    if (header.every((byte) => byte === 0)) {
      // The end-of-archive marker is TWO zero blocks. One alone is a stream
      // that stopped mid-marker, which is truncation wearing the shape of a
      // clean end.
      if (offset + 512 > archive.length || !archive.subarray(offset, offset + 512).every((byte) => byte === 0)) {
        throw new Error('the tarball ends after a single zero block, not the two the end-of-archive marker needs — the tarball is truncated')
      }
      terminated = true
      break
    }
    if (readField(header, 257, 262) !== 'ustar') {
      throw new Error('the tarball is not in ustar format (no magic at offset 257)')
    }
    const prefix = readField(header, 345, 500)
    const base = readField(header, 0, 100)
    const type = header[156] === 0 ? '0' : String.fromCharCode(header[156])
    const rawSize = readSize(header)
    const advance = Math.ceil(rawSize / 512) * 512

    if (type === 'x' || type === 'g') {
      // Bounds-checked before the body is read, exactly as a file entry is: an
      // extended header read past a truncated end used to yield a CLAMPED,
      // short record set, and a pax `path` or `size` half-read from it decides
      // the name and the length of the entry that follows.
      if (offset + rawSize > archive.length) {
        throw new Error(`the tarball's extended header "${prefix === '' ? base : `${prefix}/${base}`}" runs past the end of the archive — the tarball is truncated`)
      }
      if (type === 'x') pending = parsePaxRecords(archive.subarray(offset, offset + rawSize))
      offset += advance
      continue
    }

    const name = pending?.path ?? (prefix === '' ? base : `${prefix}/${base}`)
    // A pax `size` record OVERRIDES the header field, so it decides both how
    // many bytes this entry has and how far the reader advances. An unparseable
    // or negative one would produce a NaN advance and desynchronise every entry
    // after it, so it is refused rather than coerced.
    const size = pending?.size === undefined ? rawSize : Number(pending.size)
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(
        `the tarball entry "${name}" declares an unusable pax size ${JSON.stringify(String(pending?.size))}`,
      )
    }
    pending = null
    // `subarray` CLAMPS, so a truncated archive would otherwise yield a short
    // body and this build would write a silently incomplete file to disk.
    if (offset + size > archive.length) {
      throw new Error(`the tarball entry "${name}" runs past the end of the archive — the tarball is truncated`)
    }
    const body = archive.subarray(offset, offset + size)
    offset += Math.ceil(size / 512) * 512
    yield { name, type, body }
  }
  if (!terminated) {
    throw new Error('the tarball ends without its end-of-archive marker — the tarball is truncated')
  }
}

/**
 * The `package/`-relative segments of an entry, or a throw naming the entry.
 * Every refusal here names the entry because the operator's next question is
 * always "which file", and an archive that carries one is not to be trusted
 * about the rest.
 */
export function packageRelativeSegments(name) {
  if (name.includes('\\')) throw new Error(`the tarball entry "${name}" contains a backslash`)
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
    throw new Error(`the tarball entry "${name}" is an absolute path`)
  }
  const segments = name.split('/').filter((segment) => segment !== '' && segment !== '.')
  if (segments.includes('..')) throw new Error(`the tarball entry "${name}" contains a ".." segment`)
  if (segments[0] !== PACKAGE_PREFIX) {
    throw new Error(`the tarball entry "${name}" is outside the ${PACKAGE_PREFIX}/ prefix`)
  }
  return segments.slice(1)
}

/** Extract the `package/` tree of an npm tarball into `outDir`. */
export function extractPackage(tarballPath, outDir) {
  const archive = gunzipSync(readFileSync(tarballPath))
  const root = resolve(outDir)
  mkdirSync(root, { recursive: true })
  const written = []
  for (const entry of readTarEntries(archive)) {
    if (entry.type !== '0' && entry.type !== '5') {
      throw new Error(`the tarball entry "${entry.name}" is type ${entry.type}, which this build refuses to write`)
    }
    const segments = packageRelativeSegments(entry.name)
    const target = segments.length === 0 ? root : join(root, ...segments)
    if (target !== root && !resolve(target).startsWith(root + sep)) {
      throw new Error(`the tarball entry "${entry.name}" resolves outside ${root}`)
    }
    if (entry.type === '5' || segments.length === 0) {
      mkdirSync(target, { recursive: true })
      continue
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, entry.body)
    written.push(segments.join('/'))
  }
  return written
}

// ── the install ─────────────────────────────────────────────────────────────

/** npm's JavaScript entry, as npm itself names it when it launched this process. */
function npmEntryFromEnvironment() {
  const declared = process.env.npm_execpath
  if (typeof declared !== 'string') return null
  // Another package manager also sets `npm_execpath`, at its OWN cli — running
  // `ci --omit=dev` through yarn or pnpm would mean something else entirely.
  return /(^|[\\/])npm-cli\.[cm]?js$/.test(declared) && existsSync(declared) ? declared : null
}

/** npm's JavaScript entry as it ships beside the interpreter, in either layout. */
function npmEntryBesideNode() {
  const here = dirname(process.execPath)
  const candidates = [
    join(here, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(here, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

/**
 * Run npm WITHOUT a shell, on every platform this repository claims.
 *
 * `execFileSync('npm', ...)` is what scripts/tarball-smoke.mjs does, and it is
 * correct there: that gate runs on one Linux leg. It is not portable. On
 * Windows `npm` is `npm.cmd`, and since CVE-2024-27980 Node refuses to spawn a
 * `.cmd` without `shell: true` — and `shell: true` hands argv to cmd.exe
 * unquoted, so the first temporary path with a space in it becomes a second
 * bug behind the first. Neither is a failure mode to discover from a build
 * script that writes a release artifact.
 *
 * So npm is run as what it actually is: a JavaScript program, started by this
 * interpreter. Two probes find its entry — the path npm exports when it
 * launched us, then the copy that ships beside `process.execPath` — and only if
 * both miss does this fall back to the PATH name, which on Windows needs the
 * shell and carries the quoting caveat above.
 */
export function runNpm(args, options = {}) {
  const entry = npmEntryFromEnvironment() ?? npmEntryBesideNode()
  const windows = process.platform === 'win32'
  return execFileSync(
    entry === null ? (windows ? 'npm.cmd' : 'npm') : process.execPath,
    entry === null ? args : [entry, ...args],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: entry === null && windows,
      ...options,
    },
  )
}

/**
 * The production graph, from THIS repository's lockfile rather than the
 * tarball's dependency ranges: the lockfile is the source of truth for what a
 * release was tested against, and resolving ranges afresh would make two builds
 * of one tarball disagree the day a transitive dependency publishes.
 *
 * `--omit=optional` is what leaves `sigstore` out. `--ignore-scripts` is passed
 * explicitly because npm reads its config from the working directory, and this
 * one is a throwaway with no `.npmrc` to inherit the repository's setting from.
 */
export function installProduction(dir, lockfilePath, options = {}) {
  copyFileSync(lockfilePath, join(dir, 'package-lock.json'))
  return runNpm(
    ['ci', '--omit=dev', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: dir, ...options },
  )
}

// ── the prune ───────────────────────────────────────────────────────────────

function prunable(name) {
  if (KEEP_FILE_PATTERN.test(name)) return false
  return PRUNE_FILE_SUFFIXES.some((suffix) => name.toLowerCase().endsWith(suffix))
}

/**
 * Walk and prune. `insideModules` gates BOTH prunes — the suffix one and the
 * directory-name one — because outside `node_modules` this tree is the release
 * itself: `dist/content/**` is markdown the engine reads, and a skill's own
 * `docs/` reference tree carries the same name a dependency's does.
 */
function pruneTree(dir, insideModules, removed) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') {
        pruneTree(child, true, removed)
      } else if (insideModules && PRUNE_DIRECTORY_NAMES.includes(entry.name)) {
        rmSync(child, { recursive: true, force: true })
        removed.push(child)
      } else {
        pruneTree(child, insideModules, removed)
      }
    } else if (insideModules && prunable(entry.name)) {
      rmSync(child, { force: true })
      removed.push(child)
    }
  }
}

/** Apply the documented prune list. Returns the paths removed. */
export function pruneRuntime(dir) {
  const removed = []
  const modules = join(dir, 'node_modules')
  const lock = join(modules, '.package-lock.json')
  if (existsSync(lock)) {
    rmSync(lock, { force: true })
    removed.push(lock)
  }
  for (const scope of PRUNE_SCOPES) {
    const scoped = join(modules, scope)
    if (existsSync(scoped)) {
      rmSync(scoped, { recursive: true, force: true })
      removed.push(scoped)
    }
  }
  pruneTree(dir, false, removed)
  return removed
}

// ── the roster and the measurement ──────────────────────────────────────────

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    // A directory under node_modules with no readable manifest is not an
    // installed package; it contributes nothing to the roster.
    return undefined
  }
}

function recordPackage(parentDir, name, prefix, roster) {
  const packageDir = join(parentDir, name)
  const manifest = readJson(join(packageDir, 'package.json'))
  if (manifest !== undefined && typeof manifest.version === 'string') {
    roster[`${prefix}${name}`] = manifest.version
  }
  const nested = join(packageDir, 'node_modules')
  if (existsSync(nested)) walkModules(nested, `${prefix}${name}/node_modules/`, roster)
}

function walkModules(modulesDir, prefix, roster) {
  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (entry.name.startsWith('@')) {
      const scope = join(modulesDir, entry.name)
      for (const scoped of readdirSync(scope, { withFileTypes: true })) {
        if (scoped.isDirectory()) recordPackage(scope, scoped.name, `${prefix}${entry.name}/`, roster)
      }
      continue
    }
    recordPackage(modulesDir, entry.name, prefix, roster)
  }
}

/**
 * Every installed package under `<dir>/node_modules`, name to version, sorted.
 * The key is the `node_modules`-relative path, which for a hoisted install IS
 * the package name (scoped ones included) and for a nested duplicate spells out
 * where it sits — one rule, so two packages of one name never collide.
 */
export function collectInstalled(dir) {
  const roster = {}
  const modules = join(dir, 'node_modules')
  if (existsSync(modules)) walkModules(modules, '', roster)
  return Object.fromEntries(Object.keys(roster).toSorted().map((name) => [name, roster[name]]))
}

/** Files only: the byte total and the count a size budget is read against. */
export function measureTree(dir) {
  let bytes = 0
  let files = 0
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(child)
      } else {
        files += 1
        bytes += lstatSync(child).size
      }
    }
  }
  walk(dir)
  return { bytes, files }
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** `RUNTIME.json`, in the one key order every consumer of it reads. */
export function buildRuntimeManifest({ manifest, tarballSha256, dependencies }) {
  return {
    package: manifest.name,
    version: manifest.version,
    nodeFloor: manifest.engines?.node ?? null,
    tarballSha256,
    dependencies,
  }
}

// ── the whole build ─────────────────────────────────────────────────────────

/**
 * Extract, install, prune, describe, measure. Every failure throws with a
 * message naming what could not be done; the CLI turns that into exit 1.
 */
export function buildRuntime({ tarballPath, outDir, lockfilePath, log = () => {} }) {
  const root = resolve(outDir)
  log(`extracting ${tarballPath}`)
  extractPackage(tarballPath, root)

  const manifestPath = join(root, 'package.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`the tarball carried no ${PACKAGE_PREFIX}/package.json, so there is nothing to install`)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

  log(`installing the production graph of ${manifest.name}@${manifest.version}`)
  installProduction(root, lockfilePath)

  const removed = pruneRuntime(root)
  log(`pruned ${removed.length} path(s)`)

  const runtimeManifest = buildRuntimeManifest({
    manifest,
    tarballSha256: sha256File(tarballPath),
    dependencies: collectInstalled(root),
  })
  writeFileSync(join(root, 'RUNTIME.json'), `${JSON.stringify(runtimeManifest, null, 2)}\n`)

  return { manifest: runtimeManifest, ...measureTree(root) }
}
