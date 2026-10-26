#!/usr/bin/env node
// Release pack: `npm pack` with a production `npm-shrinkwrap.json` inside the tarball
// (REQ-FLOW-049).
//
// Why. A package installed from the registry resolves its own dependencies fresh, inside every
// range its package.json allows, so a user can run a tree this repository never tested. npm honours
// a shrinkwrap a published package carries (the registry marks it `_hasShrinkwrap`), and packs one
// only when `files` names it (docs.npmjs.com/cli/v11/configuring-npm/npm-shrinkwrap-json, read
// 2026-10-23). So the release writes one for the pack and for the pack only.
//
// What it is derived from. The gated `package-lock.json`, the lock `npm ci` installed in the same
// job, with every dev row dropped: a shrinkwrap copied from the dev lock would ship the
// devDependencies to every user. The pack refuses a lock whose bytes differ from the one `HEAD`
// commits, since steps that run code sit between the job's lock check and the pack. The file
// exists only between the write and the pack; a `finally` removes it, also on SIGINT, SIGTERM and
// SIGHUP, `.gitignore` keeps a leftover out of a commit, and the next pack refuses a leftover
// rather than trusting bytes it did not write.
//
// Usage: node scripts/pack-release.mjs --pack-destination <dir> --json
// It prints npm's pack JSON unchanged on stdout. Exit 0 packed, 1 refused or failed, 2 bad arguments.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './native-typescript.mjs'

export const SHRINKWRAP = 'npm-shrinkwrap.json'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const USAGE = 'usage: node scripts/pack-release.mjs --pack-destination <dir> --json'

/** One lock row with `devOptional` read as `optional`, in the spot the key held. */
function asProductionRow(row) {
  if (row.devOptional !== true) return row
  const out = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'devOptional') out.optional = true
    else out[key] = value
  }
  return out
}

/**
 * The production shrinkwrap of a version 3 lock: every `dev: true` row dropped, `devOptional`
 * turned into `optional: true`, the root row's `devDependencies` removed, and every other key and
 * row kept in its order. Pure: the lock passed in is not changed.
 */
export function productionShrinkwrap(lock) {
  if (lock?.lockfileVersion !== 3) {
    throw new Error(`the lock is lockfileVersion ${JSON.stringify(lock?.lockfileVersion)}; a release shrinkwrap is derived from lockfileVersion 3 only`)
  }
  if (lock.packages === null || typeof lock.packages !== 'object' || Array.isArray(lock.packages)) {
    throw new Error('the lock has no packages map to derive a shrinkwrap from')
  }
  const packages = {}
  for (const [path, row] of Object.entries(lock.packages)) {
    if (row.dev === true) continue
    if (path === '') {
      packages[path] = Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'devDependencies'))
    } else {
      packages[path] = asProductionRow(row)
    }
  }
  return { ...lock, packages }
}

/**
 * The bytes of `<root>/package-lock.json` as `HEAD` holds them. The release's lock check runs
 * right after `npm ci`, and build, tests and smoke run code after it, so the pack compares the lock
 * it derives from with the commit itself rather than trusting that nothing wrote it since.
 */
function committedLock(root) {
  try {
    return execFileSync('git', ['cat-file', 'blob', 'HEAD:./package-lock.json'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    })
  } catch (error) {
    const detail = typeof error?.stderr?.toString === 'function' ? error.stderr.toString().trim() : ''
    throw new Error(`cannot read the committed package-lock.json from git (HEAD:./package-lock.json)${detail === '' ? '' : `: ${detail}`}; the release shrinkwrap is derived only from a committed lock`, { cause: error })
  }
}

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP']

/**
 * Keep an interrupt from skipping the `finally`. With no listener, SIGINT, SIGTERM or SIGHUP ends
 * Node at once, inside the synchronous pack, and the shrinkwrap stays at the root. With one, Node
 * lives on, the `finally` removes the file, and the signal waits for the event loop. The listener
 * then removes the file again, stands down and raises the signal once more, so the process still
 * ends by it. The returned release waits two turns of the loop, so a poll phase, where the waiting
 * signal is read, always comes first.
 */
function holdSignals(target) {
  const onSignal = (signal) => {
    stand()
    rmSync(target, { force: true })
    process.kill(process.pid, signal)
  }
  const stand = () => {
    for (const signal of SIGNALS) process.removeListener(signal, onSignal)
  }
  for (const signal of SIGNALS) process.on(signal, onSignal)
  return () => {
    setImmediate(() => setImmediate(stand))
  }
}

/**
 * Pack `root` into `destination` with its production shrinkwrap inside. Refuses a leftover
 * `<root>/npm-shrinkwrap.json` before any write, and a `package-lock.json` whose bytes differ from
 * the committed one. Removes the file it wrote in a `finally`, on SIGINT, SIGTERM and SIGHUP too,
 * and refuses pack JSON that does not list it. `run` is `execFileSync`'s shape; tests pass a stub.
 */
export function packRelease({ root, destination, run = execFileSync }) {
  const target = join(root, SHRINKWRAP)
  if (existsSync(target)) {
    throw new Error(`${target} is a leftover from an earlier pack; the release writes its own and refuses one it did not write. Remove it and pack again.`)
  }
  const lockBytes = readFileSync(join(root, 'package-lock.json'))
  if (!lockBytes.equals(committedLock(root))) {
    throw new Error(`${join(root, 'package-lock.json')} differs from the committed one (HEAD); the release shrinkwrap is derived only from the lock as committed. Commit or restore it and pack again.`)
  }
  const shrinkwrap = productionShrinkwrap(JSON.parse(lockBytes.toString('utf8')))
  const release = holdSignals(target)
  let stdout
  try {
    writeFileSync(target, `${JSON.stringify(shrinkwrap, null, 2)}\n`, { flag: 'wx' })
    stdout = run('npm', ['pack', '--json', '--pack-destination', destination], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } finally {
    rmSync(target, { force: true })
    release()
  }
  const packed = JSON.parse(stdout)
  const files = Array.isArray(packed) ? packed[0]?.files : undefined
  if (!Array.isArray(files) || !files.some((file) => file?.path === SHRINKWRAP)) {
    throw new Error(`npm pack did not put ${SHRINKWRAP} in the tarball; package.json "files" must name it`)
  }
  return { stdout, packed }
}

function parseArgs(argv) {
  const args = { destination: undefined, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') args.json = true
    else if (arg === '--pack-destination' && argv[index + 1] !== undefined) {
      args.destination = argv[index + 1]
      index += 1
    } else return { error: `unknown or incomplete argument: ${arg}` }
  }
  if (args.destination === undefined || args.destination === '') return { error: '--pack-destination <dir> is required' }
  if (!args.json) return { error: '--json is required: npm\'s pack JSON is the only output' }
  return args
}

function main(argv) {
  const args = parseArgs(argv)
  if (args.error !== undefined) {
    process.stderr.write(`pack-release: ${args.error}\n${USAGE}\n`)
    return 2
  }
  try {
    const { stdout, packed } = packRelease({ root: ROOT, destination: resolve(args.destination) })
    process.stdout.write(stdout)
    process.stderr.write(`pack-release: packed ${packed[0]?.filename} with ${SHRINKWRAP}, and removed it from ${ROOT}\n`)
    return 0
  } catch (error) {
    process.stderr.write(`pack-release: ${error instanceof Error ? error.message : String(error)}\n`)
    if (typeof error?.stderr === 'string' && error.stderr !== '') process.stderr.write(error.stderr)
    return 1
  }
}

if (isMain(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
