#!/usr/bin/env node
// Publish and restore this repository's records, which live on the orphan `records` branch at the
// same relative paths as on `main` (REQ-PROVE-023, REQ-PROVE-024). The records stay ordinary files
// where the commands write them; `setup` hides them from `main` through `.git/info/exclude`, never
// through `.gitignore` and never through a symlink.
//
// Usage: node scripts/records.mjs <verb> [options]
//   setup                                   write the exclude block, then restore
//   restore [--ref <ref>] [--no-fetch] [--force]
//                                           write the records of <ref> (origin/records) into the
//                                           checkout; refuses where a local file differs
//   commit -m <message> [--dry-run] [--allow-deletions]
//                                           build a commit on origin/records from the records on
//                                           disk, gate that exact commit, then push it
//   verify --base <sha> [--ref <ref>]       every record path at <sha> has the same blob at <ref>
//   guard [--ref <ref>]                     refuse any record path tracked at <ref> (HEAD)
//   init --base <sha>                       create the branch once, from the records at <sha>
//
// What holds for every verb: `git` runs through execFileSync with argument arrays, never a shell;
// a revision the caller supplies is resolved to an object id with `--end-of-options` before any
// other command sees it; no push is ever forced; `main`'s index is never written (the branch's
// index is a separate GIT_INDEX_FILE, and a GIT_INDEX_FILE inherited from the caller is dropped);
// no file is ever deleted from the working tree; and nothing is written through a symlink.
//
// The module API is the six verbs, each `async (options) → { code, lines }` (`publish` is the
// CLI's `commit`); `root` and `env` are accepted by every verb, and `publish` takes `runGates`, the
// injectable gate runner the tests use. The CLI has no flag that skips a gate.
//
// Exit codes: 0 done, 1 refused, 2 bad arguments.

import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isRecordPath, KEEP_ON_MAIN, RECORDS_PATHSPECS } from './records-paths.mjs'

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url))
const BRANCH_REF = 'refs/heads/records'
const REMOTE_REF = 'refs/remotes/origin/records'
const BLOCK_START = '# >>> stamity records (node scripts/records.mjs setup) — records live on the records branch'
const BLOCK_END = '# <<< stamity records'
/** Template under scripts/records/ → its path at the branch root. */
const TEMPLATES = [
  ['README.md', 'README.md'],
  ['gitignore', '.gitignore'],
  ['gitattributes', '.gitattributes'],
  ['workflow.yml', '.github/workflows/records.yml'],
]
const MODES = new Set(['100644', '100755'])
const MAX_BUFFER = 256 * 1024 * 1024
const RUNS_DIR = '.stamity/runs'
/** The head line /st-work and /st-debug keep on a run's record until its close. */
const IN_PROGRESS = /^Status: in progress\s*$/
const RESTORE_HINT = 'run `node scripts/records.mjs restore`, then `commit` again'

/** A verb's refusal, carried to the verb's boundary and returned as `{ code, lines }`. */
class Stop extends Error {
  constructor(code, lines) {
    super(lines[0] ?? 'refused')
    this.code = code
    this.lines = lines
  }
}
const stop = (code, lines) => { throw new Stop(code, lines) }

function firstLine(error) {
  const stderr = error?.stderr === undefined ? '' : String(error.stderr)
  return stderr.split('\n').map((line) => line.trim()).find(Boolean) ?? (error instanceof Error ? error.message : String(error))
}

/** The checkout a verb works in, and its git runner. `index` points one call at a separate index. */
function context(options) {
  const env = { ...(options.env ?? process.env) }
  delete env.GIT_INDEX_FILE
  const exec = (cwd, args, { input, index, buffer } = {}) => execFileSync('git', ['-C', cwd, ...args], {
    // The C locale keeps git's messages, and so a refusal's wording, the same on every machine.
    env: index === undefined ? { ...env, LC_ALL: 'C' } : { ...env, LC_ALL: 'C', GIT_INDEX_FILE: index },
    input,
    encoding: buffer ? 'buffer' : 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: MAX_BUFFER,
  })
  const start = resolve(options.root ?? process.cwd())
  let root
  try { root = resolve(exec(start, ['rev-parse', '--show-toplevel']).trim()) }
  catch (error) { stop(1, [`not inside a git checkout: ${firstLine(error)}`]) }
  const git = (args, extra) => {
    try { return exec(root, args, extra) }
    catch (error) { throw new Error(`git ${args[0]} failed: ${firstLine(error)}`, { cause: error }) }
  }
  const tryGit = (args) => {
    try { return { ok: true, output: exec(root, args) } }
    catch (error) { return { ok: false, output: `${error?.stdout ?? ''}${error?.stderr ?? ''}`, error: firstLine(error) } }
  }
  /** The commit a revision names, or null; the revision never reaches git as an option. */
  const commit = (rev) => {
    const found = tryGit(['rev-parse', '--verify', '--quiet', '--end-of-options', `${rev}^{commit}`])
    return found.ok ? found.output.trim() : null
  }
  return { root, env, git, tryGit, commit, abs: (path) => join(root, ...path.split('/')) }
}

async function run(options, body) {
  try {
    return await body(context(options))
  } catch (error) {
    if (error instanceof Stop) return { code: error.code, lines: error.lines }
    return { code: 1, lines: [error instanceof Error ? error.message : String(error)] }
  }
}

const splitZ = (output) => output.split('\0').filter(Boolean)
const lstatOrNull = (path) => { try { return lstatSync(path) } catch { return null } } // absent is an answer here

/** Every row of the records set at a commit, `.stamity/handoffs/.gitkeep` left out. */
function lsTree(ctx, oid) {
  return splitZ(ctx.git(['ls-tree', '-r', '-z', '--full-tree', oid, '--', ...RECORDS_PATHSPECS])).map((row) => {
    const tab = row.indexOf('\t')
    const [mode, type, object] = row.slice(0, tab).split(' ')
    return { mode, type, oid: object, path: row.slice(tab + 1) }
  }).filter((row) => !KEEP_ON_MAIN.includes(row.path))
}

function requireCommit(ctx, rev, hint) {
  return ctx.commit(rev) ?? stop(1, [`cannot read ${rev} as a commit${hint ? `: ${hint}` : ''}`])
}

function fetchRecords(ctx) {
  const fetched = ctx.tryGit(['fetch', '--no-tags', 'origin', `${BRANCH_REF}:${REMOTE_REF}`])
  if (fetched.ok) return
  if (ctx.commit(REMOTE_REF) === null) stop(1, ['no records branch on origin: run `node scripts/records.mjs init --base <sha>` once'])
  stop(1, [`fetching the records branch failed: ${fetched.error}`])
}

const excludeEntry = (spec) => (spec.split('/').at(-1).includes('.') ? `/${spec}` : `/${spec}/`)

/** `text` with the records block in place of the old one, or appended: a second run is byte-identical. */
function withBlock(text) {
  const block = [BLOCK_START, ...RECORDS_PATHSPECS.map(excludeEntry), BLOCK_END]
  const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n')
  const start = lines.indexOf(BLOCK_START)
  const end = start === -1 ? -1 : lines.indexOf(BLOCK_END, start)
  const next = end === -1 ? [...lines, ...block] : [...lines.slice(0, start), ...block, ...lines.slice(end + 1)]
  return `${next.join('\n')}\n`
}

/** The first existing ancestor of a record that is a symlink or not a directory, or null. */
function blockedParent(ctx, path) {
  const parts = path.split('/')
  for (let i = 1; i < parts.length; i++) {
    const prefix = parts.slice(0, i).join('/')
    const stat = lstatOrNull(ctx.abs(prefix))
    if (stat === null) return null
    if (stat.isSymbolicLink()) return { path: prefix, why: 'symlink' }
    if (!stat.isDirectory()) return { path: prefix, why: 'not a directory' }
  }
  return null
}

function restoreIn(ctx, { ref = 'origin/records', fetch = true, force = false }) {
  if (fetch) fetchRecords(ctx)
  const oid = requireCommit(ctx, ref, 'fetch the records branch, or run `init` once')
  const rows = lsTree(ctx, oid)
  const unsupported = rows.filter((row) => !isRecordPath(row.path) || !MODES.has(row.mode)).map((row) => `${row.mode} ${row.path}`)
  if (unsupported.length > 0) stop(1, [`refused: ${ref} holds entries restore does not write (only regular files under the record paths):`, ...unsupported])
  const symlinks = new Set(), blocked = new Set(), differs = [], writes = [], modes = []
  let unchanged = 0
  for (const row of rows) {
    const parent = blockedParent(ctx, row.path)
    if (parent !== null) { (parent.why === 'symlink' ? symlinks : blocked).add(parent.path); continue }
    const stat = lstatOrNull(ctx.abs(row.path))
    if (stat === null) { writes.push(row); continue }
    if (stat.isSymbolicLink()) { symlinks.add(row.path); continue }
    if (!stat.isFile()) { blocked.add(row.path); continue }
    const local = ctx.git(['hash-object', `--path=${row.path}`, '--', row.path]).trim()
    if (local !== row.oid) { differs.push({ row, stat }); continue }
    if (process.platform !== 'win32' && ((stat.mode & 0o100) !== 0) !== (row.mode === '100755')) modes.push({ row, stat })
    else unchanged++
  }
  if (symlinks.size > 0) stop(1, ['refused: a record or one of its folders is a symlink, and restore never writes through one:', ...[...symlinks].toSorted()])
  if (blocked.size > 0) stop(1, ['refused: something other than a file is in the way of a record, and restore never deletes:', ...[...blocked].toSorted()])
  if (differs.length > 0 && !force)
    stop(1, [`refused: ${differs.length} local record(s) differ from ${ref}; nothing was written (--force overwrites them):`, ...differs.map(({ row }) => row.path)])
  for (const row of writes) {
    const target = ctx.abs(row.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, ctx.git(['cat-file', 'blob', row.oid], { buffer: true }))
    if (row.mode === '100755' && process.platform !== 'win32') chmodSync(target, 0o755)
  }
  for (const { row } of differs) writeFileSync(ctx.abs(row.path), ctx.git(['cat-file', 'blob', row.oid], { buffer: true }))
  for (const { row, stat } of [...differs, ...modes]) {
    if (process.platform === 'win32') continue
    chmodSync(ctx.abs(row.path), row.mode === '100755' ? (stat.mode | 0o111) & 0o777 : stat.mode & 0o666)
  }
  return {
    code: 0,
    lines: [`restored ${writes.length} record(s) from ${ref}, overwrote ${differs.length}, fixed ${modes.length} mode(s), ${unchanged} unchanged`],
  }
}

export async function setup(options = {}) {
  return run(options, (ctx) => {
    const common = resolve(ctx.root, ctx.git(['rev-parse', '--git-common-dir']).trim())
    const file = join(common, 'info', 'exclude')
    const before = existsSync(file) ? readFileSync(file, 'utf8') : ''
    const after = withBlock(before)
    if (after !== before) {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, after)
    }
    const restored = restoreIn(ctx, {})
    return { code: restored.code, lines: [`${after === before ? 'kept' : 'wrote'} the records block in ${file}`, ...restored.lines] }
  })
}

export async function restore(options = {}) {
  return run(options, (ctx) => restoreIn(ctx, options))
}

/**
 * The default gate runner: the leak gate and the hygiene check over a scratch worktree of the
 * built commit, then the records suite in the checkout, whose on-disk records are the commit's.
 * Resolves `{ failed, lines }`, `failed` naming the first gate that did not exit 0, or null.
 */
export async function defaultGates({ root, commit, base, env = process.env }) {
  const tree = mkdtempSync(join(tmpdir(), 'stamity-records-'))
  const git = (args) => execFileSync('git', ['-C', root, ...args], { env, stdio: 'pipe' })
  const gates = [
    ['leak gate', process.execPath, [join(SCRIPTS_DIR, 'leak-gate.mjs'), '--root', tree]],
    ['hygiene check', process.execPath, [join(SCRIPTS_DIR, 'repo-hygiene.mjs'), '--repo', tree, '--base', base]],
    ['records suite', 'npm', ['run', 'test:records']],
  ]
  try {
    git(['worktree', 'add', '--detach', tree, commit])
    for (const [name, command, args] of gates) {
      const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', maxBuffer: MAX_BUFFER })
      if (result.status !== 0) {
        const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? String(result.error) : ''}`
        return { failed: name, lines: output.trimEnd().split('\n').slice(-20) }
      }
    }
    return { failed: null, lines: gates.map(([name]) => `${name}: pass`) }
  } finally {
    try { git(['worktree', 'remove', '--force', tree]) }
    catch { rmSync(tree, { recursive: true, force: true }) } // never added, or already gone: the folder is all that is left
  }
}

/**
 * The `.stamity/runs/<id>` folders whose `record.md` carries the head line `Status: in progress` in
 * its first 15 lines: a run that has not closed neither blocks a publish nor rides one.
 */
function runsInProgress(ctx) {
  const runs = ctx.abs(RUNS_DIR)
  if (lstatOrNull(runs)?.isDirectory() !== true) return []
  return readdirSync(runs, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${RUNS_DIR}/${entry.name}`)
    .filter((folder) => {
      const record = ctx.abs(`${folder}/record.md`)
      if (lstatOrNull(record)?.isFile() !== true) return false
      return readFileSync(record, 'utf8').split('\n').slice(0, 15).some((line) => IN_PROGRESS.test(line))
    })
    .toSorted()
}

export async function publish({ message, dryRun = false, allowDeletions = false, runGates = defaultGates, ...options } = {}) {
  return run(options, async (ctx) => {
    if (typeof message !== 'string' || message.trim() === '') stop(2, ['a commit message is required: commit -m <message>'])
    const held = runsInProgress(ctx)
    const notes = held.map((folder) => `left out ${folder}: the run is still in progress`)
    try {
      const result = await publishIn(ctx, { message, dryRun, allowDeletions, runGates, held })
      return { code: result.code, lines: [...notes, ...result.lines] }
    } catch (error) {
      if (error instanceof Stop) error.lines = [...notes, ...error.lines]
      throw error
    }
  })
}

async function publishIn(ctx, { message, dryRun, allowDeletions, runGates, held }) {
  const isHeld = (path) => held.some((folder) => path.startsWith(`${folder}/`))
  fetchRecords(ctx)
  const base = requireCommit(ctx, REMOTE_REF)
  const exclude = existsSync(join(ctx.root, '.gitignore')) ? ['--exclude-from=.gitignore'] : []
  const listed = new Set(splitZ(ctx.git(['ls-files', '-z', '--others', '--cached', ...exclude, '--', ...RECORDS_PATHSPECS]))
    .filter((path) => !KEEP_ON_MAIN.includes(path) && !isHeld(path)))
  const odd = [...listed].filter((path) => !isRecordPath(path))
  if (odd.length > 0) stop(1, ['refused: record paths this script cannot publish:', ...odd])
  const present = new Map(), symlinks = []
  for (const path of listed) {
    const stat = lstatOrNull(ctx.abs(path))
    if (stat?.isSymbolicLink()) symlinks.push(path)
    else if (stat?.isFile()) present.set(path, stat)
  }
  if (symlinks.length > 0) stop(1, ['refused: a record may not be a symlink:', ...symlinks.toSorted()])
  const baseRows = new Map(lsTree(ctx, base).map((row) => [row.path, row]))
  const deleted = [...baseRows.keys()]
    .filter((path) => !present.has(path) && !isHeld(path) && lstatOrNull(ctx.abs(path)) === null).toSorted()
  if (deleted.length > 0 && !allowDeletions)
    stop(1, [`refused: ${deleted.length} record(s) on the records branch are gone from disk; restore them, or pass --allow-deletions:`, ...deleted])
  const index = join(ctx.git(['rev-parse', '--absolute-git-dir']).trim(), 'records.index')
  rmSync(index, { force: true })
  let tree
  try {
    ctx.git(['read-tree', base], { index })
    for (const [path, stat] of present) {
      const oid = ctx.git(['hash-object', '-w', `--path=${path}`, '--', path]).trim()
      const was = baseRows.get(path)
      const mode = process.platform === 'win32' ? (was?.mode ?? '100644') : (stat.mode & 0o100 ? '100755' : '100644')
      if (was?.oid !== oid || was.mode !== mode) ctx.git(['update-index', '--add', '--cacheinfo', mode, oid, path], { index })
    }
    for (const path of deleted) ctx.git(['update-index', '--force-remove', '--', path], { index })
    tree = ctx.git(['write-tree'], { index }).trim()
  } finally {
    rmSync(index, { force: true })
  }
  if (tree === ctx.git(['rev-parse', `${base}^{tree}`]).trim()) return { code: 0, lines: ['nothing to publish: the records on disk equal origin/records'] }
  const commit = ctx.git(['commit-tree', tree, '-p', base, '-m', message]).trim()
  const status = splitZ(ctx.git(['diff-tree', '-r', '-z', '--no-renames', '--name-status', base, commit]))
  const changes = []
  for (let i = 0; i + 1 < status.length; i += 2) changes.push(`${status[i]} ${status[i + 1]}`)
  const gates = await runGates({ root: ctx.root, commit, base, env: ctx.env })
  if (gates.failed) return { code: 1, lines: [...changes, `refused: the ${gates.failed} failed on ${commit}; nothing was pushed`, ...gates.lines] }
  if (dryRun) return { code: 0, lines: [...changes, `dry run: built ${commit} on ${base}; the gates passed and no ref moved`] }
  const pushed = ctx.tryGit(['push', '--porcelain', 'origin', `${commit}:${BRANCH_REF}`])
  if (!pushed.ok) {
    if (/^!\t.*\[rejected\] \((?:non-fast-forward|fetch first)\)/m.test(pushed.output))
      stop(1, [...changes, `refused: the records branch moved since the fetch; ${RESTORE_HINT}`])
    stop(1, [...changes, `the push failed: ${pushed.error}`])
  }
  // A push updates the remote-tracking ref itself when the fetch refspec covers it; this covers the rest.
  ctx.git(['update-ref', REMOTE_REF, commit])
  return { code: 0, lines: [...changes, `published ${commit} to origin/records`] }
}

function verifyIn(ctx, base, ref) {
  const left = requireCommit(ctx, base), right = requireCommit(ctx, ref)
  const entries = (oid) => new Map(lsTree(ctx, oid).map((row) => [row.path, `${row.mode} ${row.oid}`]))
  const a = entries(left), b = entries(right)
  const differing = [...new Set([...a.keys(), ...b.keys()])].filter((path) => a.get(path) !== b.get(path)).toSorted()
  if (differing.length > 0) return { code: 1, lines: [`${differing.length} record path(s) differ between ${base} and ${ref}:`, ...differing] }
  return { code: 0, lines: [`verified: ${a.size} record path(s) carry the same mode and blob at ${base} and ${ref}`] }
}

export async function verify({ base, ref = 'origin/records', ...options } = {}) {
  return run(options, (ctx) => verifyIn(ctx, base, ref))
}

export async function guard({ ref = 'HEAD', ...options } = {}) {
  return run(options, (ctx) => {
    const tracked = lsTree(ctx, requireCommit(ctx, ref)).map((row) => row.path)
    if (tracked.length > 0) return { code: 1, lines: [`${tracked.length} record path(s) are tracked at ${ref}; records live on the records branch:`, ...tracked] }
    return { code: 0, lines: [`no record path is tracked at ${ref}`] }
  })
}

export async function init({ base, ...options } = {}) {
  return run(options, (ctx) => {
    ctx.git(['fetch', '--no-tags', 'origin'])
    const existing = [BRANCH_REF, REMOTE_REF].filter((ref) => ctx.commit(ref) !== null)
    if (existing.length > 0) stop(1, [`refused: the records branch already exists (${existing.join(', ')}); init runs once`])
    const source = requireCommit(ctx, base)
    const rows = lsTree(ctx, source)
    const unsupported = rows.filter((row) => !isRecordPath(row.path) || !MODES.has(row.mode)).map((row) => `${row.mode} ${row.path}`)
    if (unsupported.length > 0) stop(1, ['refused: only regular files under the record paths are imported:', ...unsupported])
    const index = join(ctx.git(['rev-parse', '--absolute-git-dir']).trim(), 'records-init.index')
    rmSync(index, { force: true })
    let tree
    try {
      ctx.git(['read-tree', '--empty'], { index })
      for (const row of rows) ctx.git(['update-index', '--add', '--cacheinfo', row.mode, row.oid, row.path], { index })
      for (const [name, destination] of TEMPLATES) {
        const text = readFileSync(join(SCRIPTS_DIR, 'records', name), 'utf8').replaceAll('\r\n', '\n')
        const oid = ctx.git(['hash-object', '-w', '--stdin'], { input: text }).trim()
        ctx.git(['update-index', '--add', '--cacheinfo', '100644', oid, destination], { index })
      }
      tree = ctx.git(['write-tree'], { index }).trim()
    } finally {
      rmSync(index, { force: true })
    }
    const commit = ctx.git(['commit-tree', tree, '-m', `records: import the records from main at ${source}`]).trim()
    ctx.git(['update-ref', BRANCH_REF, commit, ''])
    const verified = verifyIn(ctx, source, BRANCH_REF)
    const pushed = verified.code === 0 ? ctx.tryGit(['push', 'origin', `${BRANCH_REF}:${BRANCH_REF}`]) : null
    if (pushed?.ok !== true) {
      ctx.git(['update-ref', '-d', BRANCH_REF, commit])
      if (pushed === null) return verified
      stop(1, [`the push failed, and the local records branch was removed again: ${pushed.error}`])
    }
    ctx.git(['update-ref', REMOTE_REF, commit])
    return { code: 0, lines: [`imported ${rows.length} record(s) and ${TEMPLATES.length} template(s) from ${source} as ${commit}`, ...verified.lines, 'pushed origin/records'] }
  })
}

const USAGE = 'Usage: node scripts/records.mjs setup | restore [--ref <ref>] [--no-fetch] [--force] | ' +
  'commit -m <message> [--dry-run] [--allow-deletions] | verify --base <sha> [--ref <ref>] | guard [--ref <ref>] | init --base <sha>'

/** Each verb's flags: a flag with a key takes a value; a flag with a pair sets a boolean. */
const VERBS = {
  setup: { run: setup, flags: {} },
  restore: { run: restore, flags: { '--ref': 'ref', '--no-fetch': ['fetch', false], '--force': ['force', true] } },
  commit: { run: publish, flags: { '-m': 'message', '--dry-run': ['dryRun', true], '--allow-deletions': ['allowDeletions', true] }, required: ['-m'] },
  verify: { run: verify, flags: { '--base': 'base', '--ref': 'ref' }, required: ['--base'] },
  guard: { run: guard, flags: { '--ref': 'ref' } },
  init: { run: init, flags: { '--base': 'base' }, required: ['--base'] },
}

/** `{ verb, options }`, or `{ error }` for an unknown verb, an unknown flag or a missing value. */
export function parseArgs(argv) {
  const [verb, ...rest] = argv
  const spec = Object.hasOwn(VERBS, verb ?? '') ? VERBS[verb] : undefined
  if (spec === undefined) return { error: verb === undefined ? 'no verb given' : `unknown verb: ${verb}` }
  const options = {}, seen = new Set()
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]
    const target = Object.hasOwn(spec.flags, flag) ? spec.flags[flag] : undefined
    if (target === undefined) return { error: `unknown argument for ${verb}: ${flag}` }
    seen.add(flag)
    if (Array.isArray(target)) { options[target[0]] = target[1]; continue }
    const value = rest[++i]
    if (value === undefined || value === '') return { error: `${flag} needs a value` }
    options[target] = value
  }
  const missing = (spec.required ?? []).filter((flag) => !seen.has(flag))
  if (missing.length > 0) return { error: `${verb} needs ${missing.join(' and ')}` }
  return { verb, options }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const parsed = parseArgs(process.argv.slice(2))
  if ('error' in parsed) {
    console.error(`records: ${parsed.error}\n${USAGE}`)
    process.exitCode = 2
  } else {
    const result = await VERBS[parsed.verb].run(parsed.options)
    for (const line of result.lines) (result.code === 0 ? console.log : console.error)(`records: ${line}`)
    process.exitCode = result.code
  }
}
