#!/usr/bin/env node
// The fork probe for `ci.yml`'s `fork-probe` job (REQ-PLUGIN-033, REQ-FORK-011). Importing it
// performs no I/O.
//
//   node scripts/ci/fork-probe.mjs [--kind registry|private] [--keep]
//
// It proves that this tree passes its own gate as a renamed, suffixed fork, the state
// `docs/enterprise-forks.md` puts a downstream in, of either kind `scripts/fork-identity.mjs`
// makes (`FORK_KINDS`): `private`, the guide's default, renamed with no `--registry`, so the
// package is private and its pinned calls read `npx --no`; or `registry` (the default here), a
// fork that publishes its CLI, renamed with `--registry`, so its pinned calls name that registry.
// The `fork-probe` job runs one matrix leg per kind. It copies the checkout (`git ls-files -z
// --cached --others --exclude-standard`, so an uncommitted change is proved too) into a temporary
// folder, links `node_modules` rather than installing, and commits the copy as a new repository.
// Then, in the copy:
//
//   fork steps   `scripts/fork-identity.mjs` renames it to `FORK_PROBE_IDENTITY`, a commit, the
//                version set to `<M>.<m>.<p>-fork.1` and the bundled packs restamped to it
//                (`PACK_RESTAMP`), the guide's `regenerate` list (`REGENERATE_COMMANDS`), a
//                commit. The first failure stops the probe: a gate over a half-renamed tree
//                proves nothing.
//   gate steps   every part of `package.json`'s `scripts.check`, `npm run test` read as
//                `node scripts/ci/test-run.mjs` (CI's test step, with its one re-run for a load
//                timeout); `node dist/cli.js check`; `fork-identity.mjs --check`; the tarball
//                smoke; then a walk with the copy's own CLI in a fresh scratch repository: `init`,
//                `add` of a made-up pack, `sync`, `check`, `clean --pack`, `check`. Each runs even
//                after another failed, so the log names every red step.
//   last         `git status --porcelain --untracked-files=no` in the copy is empty, so no gate
//                step rewrote a tracked file.
//
// One `PASS|FAIL <step> (<s>s)` line per step, a failed step's exit code and last 40 lines of
// output, and a table appended to `$GITHUB_STEP_SUMMARY` when the runner provides one. `--keep`
// keeps the copy and prints its path; otherwise it is removed, after a failure too. Nothing is
// written into the checkout, and the made-up pack is written into the scratch area, never under
// `packs/`.
//
// Exit 0 when every step passed; 1 when a fork or gate step failed; 2 when it could not run: an
// argument it does not know, a folder that is not a checkout root, no `node_modules`, or a copy or
// `git init` that failed. The job reads no secret and holds `contents: read`, and the probe needs
// none: the walk's CLI calls run with no client probe and no update check, and every other step
// with the job's own environment, as the `check` job's steps run.
import { spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isMain } from '../native-typescript.mjs'

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..')

const USAGE = 'usage: node scripts/ci/fork-probe.mjs [--kind registry|private] [--keep]'

/**
 * The two fork kinds `scripts/fork-identity.mjs` makes: `registry` passes `--registry`, `private`
 * (the guide's default) does not. `registry` is the kind run with no `--kind`.
 */
export const FORK_KINDS = Object.freeze(['registry', 'private'])

/** The made-up fork. Its scope is `fork-identity.mjs`'s default for the owner, spelled out. */
export const FORK_PROBE_IDENTITY = Object.freeze({
  repository: 'https://github.com/fork-probe/stamity-fork',
  registry: 'https://npm.pkg.github.com',
  scope: 'fork-probe',
})

/**
 * The guide's `regenerate` list (`docs/enterprise-forks.md`, "Start from these values for a fork of
 * this repository"), minus its first entry, `npm ci --ignore-scripts`: the copy links the checkout's
 * `node_modules`, which an install would write through. `test/ci/forkProbe.test.ts` holds the two
 * equal.
 */
export const REGENERATE_COMMANDS = Object.freeze([
  'node scripts/generate-capability-matrix.mjs',
  'node scripts/generate-docs.mjs',
  'node scripts/generate-pack-manifests.mjs',
  'npm run build && node dist/cli.js sync',
])

/** The version bump's own regeneration: every bundled `pack.json` takes `package.json`'s version. */
export const PACK_RESTAMP = 'node scripts/generate-pack-manifests.mjs --write'

/** The test step `scripts.check` names, and the CI command that stands in for it. */
const TEST_PART = 'npm run test'
const TEST_STEP = 'node scripts/ci/test-run.mjs'

/** One corpus-shaped artifact, with the frontmatter keys the catalog walk requires. */
function artifact(id, type, description) {
  return [
    '---',
    `id: ${id}`,
    `type: ${type}`,
    `description: ${JSON.stringify(description)}`,
    'tags: [orchestration]',
    'load: on-demand',
    `obsolete_when: fixture ${id} trigger`,
    '---',
    '',
    `# ${id}`,
    '',
    'Fixture body for a made-up pack.',
    '',
  ].join('\n')
}

/** The made-up pack the walk adds from a path and takes back with `clean --pack`. */
export const MADE_UP_PACK = Object.freeze({
  name: 'fork-probe-pack',
  files: Object.freeze({
    'agents/stamity-fork-probe-agent.md': artifact('fork-probe-agent', 'agent', 'Answers the fork probe.'),
    'skills/st-fork-probe/SKILL.md': artifact('fork-probe', 'skill', 'Walks the fork probe.'),
    'commands/st-fork-probe.md': artifact('fork-probe-command', 'command', 'Starts the fork probe.'),
  }),
})

/**
 * Writes `pack` into `join(dir, pack.name)`: its files plus a `pack.json` naming it, version
 * `1.0.0` and a sha256 integrity map over every file, as `writeMadeUpPack` in
 * `test/support/packFixtures.ts` writes one. Returns the pack's folder.
 */
export function writeProbePack(dir, pack = MADE_UP_PACK) {
  const packDir = join(dir, pack.name)
  const integrity = {}
  for (const [rel, body] of Object.entries(pack.files)) {
    integrity[rel] = createHash('sha256').update(body, 'utf8').digest('hex')
    const abs = join(packDir, ...rel.split('/'))
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body, 'utf8')
  }
  writeFileSync(join(packDir, 'pack.json'), `${JSON.stringify({ name: pack.name, version: '1.0.0', integrity }, null, 2)}\n`, 'utf8')
  return packDir
}

/** `<M>.<m>.<p>-<suffix>.1` from a semver version, its prerelease and build dropped. */
export function forkVersion(version, suffix) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(version))
  if (match === null) throw new Error(`fork-probe: "${version}" is not a semver version`)
  return `${match[1]}.${match[2]}.${match[3]}-${suffix}.1`
}

/** `scripts.check` split on `&&`, in order, with the test part read as CI's test step. */
export function gateCommands(checkScript) {
  return checkScript
    .split('&&')
    .map(part => part.trim())
    .filter(part => part !== '')
    .map(part => (part === TEST_PART ? TEST_STEP : part))
}

/** The rename call's arguments for one fork kind: `--registry` only for a `registry` fork. */
export function identityArgs(forkKind = 'registry') {
  const registry = forkKind === 'registry' ? ` --registry ${FORK_PROBE_IDENTITY.registry}` : ''
  return `--repository ${FORK_PROBE_IDENTITY.repository}${registry} --scope ${FORK_PROBE_IDENTITY.scope}`
}

const COMMIT = 'git -c user.name=fork-probe -c user.email=fork-probe@example.invalid -c commit.gpgsign=false'

/**
 * Every step of the probe, in order. A step is `{ name, kind, cwd, command }` with a shell command,
 * or `{ name, kind, cwd, run }` with an in-process function returning `{ code, output }`.
 */
export function probeSteps({ copy, scratch, checkScript, forkKind = 'registry' }) {
  const commit = message => `${COMMIT} add -A && ${COMMIT} commit --quiet --no-verify --allow-empty -m "${message}"`
  const cli = `node ${JSON.stringify(join(copy, 'dist', 'cli.js'))}`
  const repo = join(scratch, 'repo')
  return [
    { name: 'rename (fork-identity.mjs)', kind: 'fork', cwd: copy, command: `node scripts/fork-identity.mjs ${identityArgs(forkKind)}` },
    { name: 'commit the rename', kind: 'fork', cwd: copy, command: commit('fork-probe: the renamed fork') },
    { name: 'set the fork version', kind: 'fork', cwd: copy, run: () => setForkVersion(copy) },
    // A bundled pack's `pack.json` carries the release version, and only the write mode restamps it
    // (`docs/specs/packs.md`, REQ-PACK-001's catalog criterion); the guide's list runs the default mode.
    { name: `restamp the bundled packs: ${PACK_RESTAMP}`, kind: 'fork', cwd: copy, command: PACK_RESTAMP },
    ...REGENERATE_COMMANDS.map(command => ({ name: `regenerate: ${command}`, kind: 'fork', cwd: copy, command })),
    { name: 'commit the regenerated tree', kind: 'fork', cwd: copy, command: commit('fork-probe: regenerated') },
    ...gateCommands(checkScript).map(command => ({ name: `gate: ${command}`, kind: 'gate', cwd: copy, command })),
    { name: 'gate: node dist/cli.js check', kind: 'gate', cwd: copy, command: 'node dist/cli.js check' },
    { name: 'gate: fork-identity.mjs --check', kind: 'gate', cwd: copy, command: `node scripts/fork-identity.mjs ${identityArgs(forkKind)} --check` },
    { name: 'gate: node scripts/tarball-smoke.mjs', kind: 'gate', cwd: copy, command: 'node scripts/tarball-smoke.mjs' },
    { name: 'walk: a scratch repository', kind: 'gate', cwd: scratch, run: () => scratchRepo(repo) },
    { name: 'walk: init', kind: 'gate', cwd: repo, command: `${cli} init -y --tools claude,cursor` },
    { name: `walk: add ${MADE_UP_PACK.name}`, kind: 'gate', cwd: repo, command: `${cli} add ${JSON.stringify(join(scratch, MADE_UP_PACK.name))} --allow-untrusted -y` },
    { name: 'walk: sync', kind: 'gate', cwd: repo, command: `${cli} sync` },
    { name: 'walk: check', kind: 'gate', cwd: repo, command: `${cli} check` },
    { name: `walk: clean --pack ${MADE_UP_PACK.name}`, kind: 'gate', cwd: repo, command: `${cli} clean --pack ${MADE_UP_PACK.name} -y` },
    { name: 'walk: check after clean --pack', kind: 'gate', cwd: repo, command: `${cli} check` },
    { name: 'no tracked file rewritten', kind: 'gate', cwd: copy, run: () => trackedClean(copy) },
  ]
}

function setForkVersion(copy) {
  const file = join(copy, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  pkg.version = forkVersion(pkg.version, 'fork')
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
  return { code: 0, output: `version ${pkg.version}\n` }
}

function scratchRepo(repo) {
  mkdirSync(repo, { recursive: true })
  writeProbePack(dirname(repo))
  const init = spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: repo, encoding: 'utf8' })
  return { code: init.status ?? 1, output: `${init.stdout ?? ''}${init.stderr ?? ''}` }
}

function trackedClean(copy) {
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: copy, encoding: 'utf8' })
  if (status.status !== 0) return { code: status.status ?? 1, output: status.stderr ?? '' }
  const changed = status.stdout.trim()
  return changed === ''
    ? { code: 0, output: '' }
    : { code: 1, output: `a gate step rewrote tracked files:\n${changed}\n` }
}

/**
 * Runs `steps` through `exec(step) → { code, output }`, timing each. The first failing fork step
 * stops the run before any gate step; a failing gate step marks the run failed and the next gate
 * step still runs. Returns `{ exitCode, results }`, one result per step that ran; `onResult` sees
 * each result as its step ends, so a long run's log shows progress.
 */
export function runSteps(steps, exec, { now = () => Date.now(), onResult = () => {} } = {}) {
  const results = []
  let exitCode = 0
  for (const step of steps) {
    if (step.kind === 'fork' && exitCode !== 0) break
    if (step.kind === 'gate' && results.some(result => result.kind === 'fork' && result.code !== 0)) break
    const started = now()
    let outcome
    try {
      outcome = exec(step)
    } catch (error) {
      outcome = { code: 1, output: `${error?.stack ?? error}\n` }
    }
    const seconds = Math.round((now() - started) / 100) / 10
    const result = { name: step.name, kind: step.kind, code: outcome.code, output: outcome.output ?? '', seconds }
    results.push(result)
    onResult(result)
    if (outcome.code !== 0) exitCode = 1
  }
  return { exitCode, results }
}

/**
 * A step's environment. The walk's CLI calls run with no client probe and no update check, so they
 * start no client and ask no registry; every other step gets the job's own environment, as the
 * `check` job's steps do, so the nested gate is the one a fork runs.
 */
function stepEnv(step) {
  return step.name.startsWith('walk: ')
    ? { ...process.env, STAMITY_NO_CLIENT_PROBE: '1', STAMITY_NO_UPDATE_CHECK: '1' }
    : process.env
}

function execStep(step) {
  if (typeof step.run === 'function') return step.run()
  const result = spawnSync(step.command, {
    cwd: step.cwd,
    shell: true,
    encoding: 'utf8',
    env: stepEnv(step),
    maxBuffer: 512 * 1024 * 1024,
  })
  return { code: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `${result.error.message}\n` : ''}` }
}

function lastLines(text, count) {
  return text.split('\n').filter((line, index, all) => !(index === all.length - 1 && line === '')).slice(-count).join('\n')
}

export function parseArgs(argv) {
  const args = { keep: false, forkKind: 'registry' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--keep') args.keep = true
    else if (arg === '--kind' || arg.startsWith('--kind=')) {
      const value = arg === '--kind' ? argv[(index += 1)] : arg.slice('--kind='.length)
      if (!FORK_KINDS.includes(value)) return { error: `--kind takes ${FORK_KINDS.join(' or ')}, not ${JSON.stringify(value ?? '')}` }
      args.forkKind = value
    } else return { error: `unknown argument: ${arg}` }
  }
  return args
}

/** The checkout's file list, the copy and its first commit. Returns the copy's path or a problem. */
function makeCopy(root) {
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  if (listed.status !== 0) return { problem: `git ls-files failed: ${(listed.stderr ?? '').trim()}` }
  const copy = mkdtempSync(join(tmpdir(), 'stamity-fork-probe-'))
  try {
    for (const relPath of listed.stdout.split('\0')) {
      if (relPath === '' || relPath === 'node_modules') continue
      const source = join(root, relPath)
      // A tracked file deleted in the work tree is not in the tree being proved.
      if (!existsSync(source) && !isLink(source)) continue
      const destination = join(copy, relPath)
      mkdirSync(dirname(destination), { recursive: true })
      cpSync(source, destination, { verbatimSymlinks: true })
    }
    symlinkSync(join(root, 'node_modules'), join(copy, 'node_modules'), 'junction')
    const steps = [
      ['init', '-q', '-b', 'main'],
      ['add', '-A'],
      ['-c', 'user.name=fork-probe', '-c', 'user.email=fork-probe@example.invalid', '-c', 'commit.gpgsign=false',
        'commit', '--quiet', '--no-verify', '-m', 'fork-probe: the imported tree'],
    ]
    for (const args of steps) {
      const step = spawnSync('git', args, { cwd: copy, encoding: 'utf8' })
      if (step.status !== 0) return { copy, problem: `git ${args.at(-1) === 'main' ? 'init' : args[0]} failed: ${(step.stderr ?? '').trim()}` }
    }
  } catch (error) {
    return { copy, problem: `the copy failed: ${error?.message ?? error}` }
  }
  return { copy }
}

function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

function summaryTable(results, forkKind) {
  const rows = results.map(result => `| ${result.code === 0 ? 'PASS' : 'FAIL'} | ${result.name.replaceAll('|', '\\|')} | ${result.seconds} |`)
  return [`### Fork probe (${forkKind} fork)`, '', '| Result | Step | Seconds |', '|---|---|---|', ...rows, ''].join('\n') + '\n'
}

export function main(argv, io = { out: text => process.stdout.write(text), err: text => process.stderr.write(text) }, root = ROOT) {
  const args = parseArgs(argv)
  if (args.error !== undefined) {
    io.err(`fork-probe: ${args.error}\n${USAGE}\n`)
    return 2
  }
  const pkgFile = join(root, 'package.json')
  if (!existsSync(pkgFile) || !existsSync(join(root, '.git'))) {
    io.err(`fork-probe: ${root} is not a checkout root (no package.json or .git)\n`)
    return 2
  }
  if (!existsSync(join(root, 'node_modules'))) {
    io.err('fork-probe: no node_modules; run npm ci first\n')
    return 2
  }
  const checkScript = JSON.parse(readFileSync(pkgFile, 'utf8')).scripts?.check
  if (typeof checkScript !== 'string' || checkScript.trim() === '') {
    io.err('fork-probe: package.json has no scripts.check\n')
    return 2
  }
  const started = Date.now()
  const made = makeCopy(root)
  const cleanup = () => {
    if (made.copy === undefined) return
    if (args.keep) io.out(`fork-probe: kept the copy at ${made.copy}\n`)
    else rmSync(made.copy, { recursive: true, force: true })
  }
  if (made.problem !== undefined) {
    io.err(`fork-probe: ${made.problem}\n`)
    cleanup()
    return 2
  }
  const scratch = `${made.copy}-walk`
  mkdirSync(scratch, { recursive: true })
  const report = result => {
    io.out(`${result.code === 0 ? 'PASS' : 'FAIL'} ${result.name} (${result.seconds}s)\n`)
    if (result.code !== 0) io.out(`  exit ${result.code}; last 40 lines:\n${lastLines(result.output, 40).replace(/^/gm, '    ')}\n`)
  }
  let outcome
  try {
    outcome = runSteps(probeSteps({ copy: made.copy, scratch, checkScript, forkKind: args.forkKind }), execStep, { onResult: report })
  } finally {
    if (!args.keep) rmSync(scratch, { recursive: true, force: true })
    else io.out(`fork-probe: kept the walk at ${scratch}\n`)
    cleanup()
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryTable(outcome.results, args.forkKind))
  // The whole run's wall time, the copy included: the job's timeout is measured from it.
  io.out(`fork-probe: ${args.forkKind} fork, ${outcome.results.length} step(s) in ${Math.round((Date.now() - started) / 1000)}s\n`)
  io.out(outcome.exitCode === 0 ? 'fork-probe: every step passed\n' : `fork-probe: failed: ${outcome.results.filter(result => result.code !== 0).map(result => result.name).join(', ')}\n`)
  return outcome.exitCode
}

if (isMain(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
