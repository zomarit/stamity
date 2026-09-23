#!/usr/bin/env node
// The replay fixture: a throwaway service repository a `/st-work` run is replayed in.
//
// The replay (`evals/replay/REPLAY-v1.md`) measures one question — what a digest costs an
// orchestrator's decisions — by running the same six-pass plan once per shape against the same
// service. "The same service" has to be literal: the base commit S0 must hash identically on every
// build, whichever operator builds it and whatever their global git config says, or two runs are
// not two samples of one experiment. So every commit here is made under a fixed identity and date
// (`FIXED_GIT_ENV`), every git call carries `-c` overrides for the settings that change bytes or
// refuse a commit (signing, hooks, line endings, global excludes), and patches apply with
// whitespace handling pinned so no config can "fix" a planted line.
//
// Under the OS temp directory, never under this repo: the leak gate walks tracked AND
// untracked-but-not-ignored files (`scripts/qa/fixtures.mjs` says the same for the QA fixtures), so
// a service tree left in the worktree would be scanned by every gate run from then on.
//
// What the fixture never holds: `seeds.json`, the oracles, the reference fixes. The agents under
// measurement work inside this tree with bypassed permissions; an answer key they can `ls` is not
// a hidden answer key. Only the base patch, the pass patches the plan names, and the rendered plan
// are copied in — and S0 is refused if one of those still carries an answer-key path.
//
// Usage:
//   node scripts/replay/fixture.mjs [--out <parentDir>] [--cli-tarball <tgz>]
//                                   [--deps <dir> | --deps-link <dir>] [--units <id,…|none>]
//                                   [--no-setup] [--no-install] [--run-gates] [--json]

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isOutsideRoot } from '../qa/run.mjs'

const SELF = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(SELF, '..', '..', '..')

/** The six passes of the replay plan, in chain order. Each names one `v1/patches/<id>.patch`. */
export const PASS_IDS = ['u1-p1', 'u1-p2', 'u2-p1', 'u2-p2', 'u3-p1', 'u3-p2']

/** The date every fixture commit carries, and the date half of the plan's `stamp:` line. */
const FIXTURE_DATE = '2026-09-24'

/**
 * The identity and clock of every fixture commit. Author and committer both, because a commit id
 * hashes both; `.invalid` because the fixture is disposable and its authorship means nothing.
 */
export const FIXED_GIT_ENV = {
  GIT_AUTHOR_NAME: 'replay fixture',
  GIT_AUTHOR_EMAIL: 'replay@invalid.local',
  GIT_COMMITTER_NAME: 'replay fixture',
  GIT_COMMITTER_EMAIL: 'replay@invalid.local',
  GIT_AUTHOR_DATE: `${FIXTURE_DATE}T00:00:00Z`,
  GIT_COMMITTER_DATE: `${FIXTURE_DATE}T00:00:00Z`,
}

/**
 * How long one child may run before it is killed. Git calls against a fixture finish in well under
 * a second, so a minute means something is stuck (a credential prompt, a lock); an install, a
 * `stamity` verb or a fixture gate can take minutes, and fifteen of them means it never ends (a
 * verb waiting on a TTY, a test runner left in watch mode). `createReplayFixture` takes
 * `timeouts: { git, command }` in milliseconds to change either.
 */
const GIT_TIMEOUT_MS = 60_000
const COMMAND_TIMEOUT_MS = 15 * 60_000

/** Where the rendered plan lands in the fixture. The start message of REPLAY-v1 §6 names it. */
const PLAN_PATH = 'docs/plans/001-replay.md'

/** Where each selected pass patch is copied, so the plan's "apply `vendor/contrib/<id>.patch`" resolves. */
const CONTRIB_DIR = 'vendor/contrib'

/**
 * Paths that belong to the answer key. S0 is refused if any of them is staged: the generator
 * copies none of them, so a hit means a patch itself carries one, and that is a data defect to fix
 * at its source rather than a file to quietly drop.
 */
const ANSWER_KEY = /seeds\.json|__oracle__|reference-fixes/

/**
 * Inherited variables that would point git at a different repository, index or object store than
 * the fixture's, or inject config ahead of the `-c` overrides. A test run launched from a git hook
 * carries several of these, and every one of them would make the fixture's commands act on the
 * caller's checkout instead. `GIT_CONFIG_GLOBAL` is kept on purpose: it is how a caller (and the
 * determinism test) names a global config, and the overrides below are what neutralise it.
 */
const REDIRECTING_GIT_ENV = new Set([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_NAMESPACE',
  'GIT_PREFIX',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_TEMPLATE_DIR',
  'GIT_ATTR_SOURCE',
])

/** The environment every child of this script runs under. */
function childEnv(extra = {}) {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (REDIRECTING_GIT_ENV.has(key) || /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(key)) delete env[key]
  }
  return { ...env, GIT_CONFIG_NOSYSTEM: '1', STAMITY_NO_UPDATE_CHECK: '1', ...FIXED_GIT_ENV, ...extra }
}

/**
 * `-c` overrides for every git call against a fixture. Command-line config outranks the global
 * and system files, so each of these holds whatever the operator's own config says:
 * - `commit.gpgsign=false` — a signature is a commit header, so a signing config changes S0's id
 *   (or fails the commit outright when the signing program is absent).
 * - `core.hooksPath` at a path that does not exist — a global hooks path would otherwise run the
 *   operator's `commit-msg` or `pre-commit` hooks, which can rewrite the message or the tree.
 * - `core.autocrlf=false` — line-ending conversion changes blob bytes.
 * - `core.excludesFile` at a path that does not exist — a global ignore file could hide
 *   `vendor/` or `*.patch` from `git add -A`, and S0 would silently lack the pass patches.
 * - `core.attributesFile` at a path that does not exist — a global attributes file could assign a
 *   `filter=` driver (or an `eol`) that rewrites blob bytes on `git add`.
 * The template directory is the fourth route in (`init.templateDir`: an `info/exclude` hiding
 * `vendor/`, or hooks); `git init --template=` copies none, and it outranks the config key.
 */
function gitConfigArgs(dir) {
  return [
    '-c',
    'init.defaultBranch=main',
    '-c',
    'commit.gpgsign=false',
    '-c',
    `core.hooksPath=${join(dir, '.git', 'replay-no-hooks')}`,
    '-c',
    'core.autocrlf=false',
    '-c',
    `core.excludesFile=${join(dir, '.git', 'replay-no-excludes')}`,
    '-c',
    `core.attributesFile=${join(dir, '.git', 'replay-no-attributes')}`,
  ]
}

/**
 * Run one command, capturing both streams, killed after `timeoutMs`. Never throws: the caller
 * decides what a failure means. A child ended by a signal (the timeout's SIGTERM, or any other)
 * reports a null exit code, and its output gains a line naming the signal and the elapsed time, so
 * a recorded step says why it stopped.
 */
function exec(cwd, file, args, { env, shell = false, timeoutMs = COMMAND_TIMEOUT_MS } = {}) {
  const started = Date.now()
  const result = spawnSync(file, args, {
    cwd,
    encoding: 'utf8',
    env: env ?? childEnv(),
    maxBuffer: 256 * 1024 * 1024,
    shell,
    timeout: timeoutMs,
  })
  const elapsed = Date.now() - started
  const timedOut = result.error?.code === 'ETIMEDOUT'
  const spawnError = result.error && !timedOut ? `\n${result.error.message}` : ''
  const killed = result.signal
    ? `\n[replay] ${file} ${timedOut ? `timed out after ${timeoutMs} ms: ` : ''}killed by ${result.signal} after ${elapsed} ms`
    : ''
  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    output: `${result.stdout ?? ''}${result.stderr ?? ''}${spawnError}${killed}`,
  }
}

/** Run git in a fixture with the overrides. Throws with git's own output when git refuses. */
function git(dir, args, { env, timeoutMs = GIT_TIMEOUT_MS } = {}) {
  const { exitCode, output } = exec(dir, 'git', [...gitConfigArgs(dir), ...args], { env, timeoutMs })
  if (exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} exited ${exitCode} in ${dir}:\n${output.trim()}`)
  }
  return output
}

/**
 * `npm` on Windows is `npm.cmd`, a batch file, which spawn refuses to launch without a shell since
 * the CVE-2024-27980 fix (the same reasoning as `scripts/advisory-check.mjs`). Through a shell,
 * cmd.exe splits arguments on whitespace and reads its own metacharacters, so an argument carrying
 * either is refused here rather than quoted by hand.
 */
function npmArgs(args) {
  const shell = process.platform === 'win32'
  if (shell) {
    const unsafe = args.find((arg) => /[\s&|<>^"%!()]/.test(arg))
    if (unsafe !== undefined) {
      throw new Error(`npm argument ${JSON.stringify(unsafe)} cannot pass through cmd.exe unquoted; move it to a path without spaces or shell metacharacters.`)
    }
  }
  return { shell }
}

/**
 * Apply one patch to a fixture's working tree.
 *
 * Whitespace handling is pinned to `nowarn`: a planted defect may sit on a line with trailing
 * whitespace, and a global `apply.whitespace=fix` would rewrite it (or `=error` refuse it). With
 * `threeWay`, git falls back to a three-way merge against the patch's recorded preimage blobs —
 * which `createReplayFixture` stores at S0 so that fallback can resolve after an agent has edited
 * the context around a later pass. Throws with git's output when the patch does not apply.
 */
export function applyPatch(dir, patchPath, { threeWay = false } = {}) {
  return git(dir, ['apply', ...(threeWay ? ['--3way'] : []), '--whitespace=nowarn', resolve(patchPath)])
}

/**
 * The plan template with its stamp filled and the unselected unit sections dropped.
 *
 * `stamp` is S0's commit id; the rendered `stamp:` value is `<S0> 2026-09-24`, the `/st-plan` head
 * shape (`<head-commit-sha> <UTC date>`). A unit section is a `### <id> …` heading under
 * `## Units` and everything up to the next `###` or `##` heading. A kept unit whose
 * `depends_on` row names a dropped unit gets that unit replaced by the dropped unit's own
 * dependencies, transitively, and `none` when nothing is left — so a subset keeps the chain's
 * order and names no unit the plan lacks; a row naming no dropped unit keeps its bytes. A requested unit the template
 * does not carry, a template with no `{{STAMP}}` or no `## Units` section, all refuse: each would
 * render a plan the run then executes as if it were the one the protocol describes.
 */
export function renderPlan(template, { stamp, units }) {
  if (!template.includes('{{STAMP}}')) throw new Error('the plan template carries no {{STAMP}} placeholder')
  const lines = template.replaceAll('{{STAMP}}', `${stamp} ${FIXTURE_DATE}`).split('\n')
  const unitsStart = lines.findIndex((line) => /^## Units\s*$/.test(line))
  if (unitsStart === -1) throw new Error('the plan template has no "## Units" section')
  const found = new Set()
  const dependsOn = new Map()
  const sections = []
  let current = null
  let inUnits = false
  for (const [index, line] of lines.entries()) {
    if (index === unitsStart) inUnits = true
    else if (line.startsWith('## ')) inUnits = false
    if (/^#{1,3} /.test(line)) current = null
    const unit = inUnits ? /^### `?([a-z0-9][a-z0-9-]*)`?(?:\s|$)/.exec(line) : null
    if (unit) {
      current = unit[1]
      found.add(current)
    }
    const row = current === null ? null : DEPENDS_ON_ROW.exec(line)
    if (row) dependsOn.set(current, parseDependsOn(row[2]))
    sections.push({ line, unit: current, row })
  }
  const missing = units.filter((id) => !found.has(id))
  if (missing.length > 0) throw new Error(`the plan template has no unit section for ${missing.join(', ')}`)
  const dropped = (id) => found.has(id) && !units.includes(id)
  const expand = (ids, seen) =>
    ids.flatMap((id) => {
      if (!dropped(id)) return [id]
      if (seen.has(id)) return []
      seen.add(id)
      return expand(dependsOn.get(id) ?? [], seen)
    })
  const kept = []
  for (const { line, unit, row } of sections) {
    if (unit !== null && !units.includes(unit)) continue
    const deps = row ? dependsOn.get(unit) : []
    if (!row || !deps.some(dropped)) {
      kept.push(line)
      continue
    }
    const rewritten = [...new Set(expand(deps, new Set()))]
    kept.push(`${row[1]}${rewritten.length === 0 ? 'none' : rewritten.join(', ')}${row[3]}`)
  }
  return kept.join('\n')
}

/** A unit's `depends_on` table row: the prefix up to the value, the value, and the closing cell. */
const DEPENDS_ON_ROW = /^(\|\s*`depends_on`\s*\|\s*)(.*?)(\s*\|\s*)$/

/** The unit ids a `depends_on` value names; `none` is the empty list. */
function parseDependsOn(value) {
  if (value.trim() === 'none') return []
  return value
    .split(',')
    .map((id) => id.trim().replace(/^`|`$/g, ''))
    .filter((id) => id !== '')
}

/** `--units` as the ordered selection it names. `none` is the empty selection; order follows the chain. */
function normalizeUnits(units) {
  if (units === undefined) return [...PASS_IDS]
  const list = typeof units === 'string' ? (units === 'none' ? [] : units.split(',').filter((id) => id !== '')) : units
  const unknown = list.filter((id) => !PASS_IDS.includes(id))
  if (unknown.length > 0) throw new Error(`unknown unit ${unknown.join(', ')}; the passes are ${PASS_IDS.join(', ')}`)
  return PASS_IDS.filter((id) => list.includes(id))
}

/**
 * The pass patches present in `v1Dir`, in chain order. They must form a prefix of `PASS_IDS`: the
 * preimages of pass N are the tree after passes 1..N-1, so a gap leaves every later pass without
 * the state its preimage blobs were cut from.
 */
function chainPatches(patchesDir) {
  const present = PASS_IDS.filter((id) => existsSync(join(patchesDir, `${id}.patch`)))
  const gap = present.findIndex((id, index) => id !== PASS_IDS[index])
  if (gap !== -1) {
    throw new Error(`the pass patches are not a prefix of the chain: ${PASS_IDS[gap]}.patch is missing before ${present[gap]}.patch`)
  }
  return present.map((id) => ({ id, path: join(patchesDir, `${id}.patch`) }))
}

/** Preimage blob ids a patch records on its `index <pre>..<post>` lines; new files record zeros. */
function preimageIds(patchText) {
  const ids = []
  for (const match of patchText.matchAll(/^index ([0-9a-f]+)\.\.[0-9a-f]+/gm)) {
    if (!/^0+$/.test(match[1])) ids.push(match[1])
  }
  return ids
}

/**
 * Put every preimage blob of the pure seeded chain into the fixture's object store.
 *
 * `git apply --3way` resolves a pass against the blob ids its `index` lines record. After an agent
 * has edited a file (or applied the previous pass without `--index`), the pure chain state those
 * ids name exists nowhere else, and the fallback fails with "lacks the necessary blob". So the
 * whole chain — base, then every pass patch in order — is applied to a scratch index: `git apply
 * --cached` writes each resulting blob into the object store as it builds the index, which is the
 * preimage set of the next pass. Then each recorded preimage id is checked to resolve: a patch cut
 * from bytes other than the chain's would otherwise apply by context today and fail its
 * three-way fallback mid-run.
 *
 * Loose objects nothing reaches are what `git gc --prune=now` deletes, so the chain state before
 * each pass is written as a tree and pinned under `refs/replay/preimages/<pass>`. A ref naming a
 * tree keeps every blob in it through any gc, and a history walk (`git log --all`) does not show
 * it — the agent sees no extra commits.
 */
function storeChainPreimages(dir, basePatch, chain, timeoutMs) {
  const scratchIndex = join(dir, '.git', 'replay-chain.index')
  rmSync(scratchIndex, { force: true })
  const env = childEnv({ GIT_INDEX_FILE: scratchIndex })
  try {
    git(dir, ['apply', '--cached', '--whitespace=nowarn', basePatch], { env, timeoutMs })
    for (const pass of chain) {
      const tree = git(dir, ['write-tree'], { env, timeoutMs }).trim()
      git(dir, ['update-ref', `refs/replay/preimages/${pass.id}`, tree], { env, timeoutMs })
      const ids = preimageIds(readFileSync(pass.path, 'utf8'))
      for (const id of ids) {
        const found = exec(dir, 'git', [...gitConfigArgs(dir), 'cat-file', '-e', `${id}^{blob}`], { env, timeoutMs })
        if (found.exitCode !== 0) {
          throw new Error(`${pass.id}.patch records preimage blob ${id}, which is not the chain's content before ${pass.id}; regenerate the patch from the pure seeded chain`)
        }
      }
      git(dir, ['apply', '--cached', '--whitespace=nowarn', pass.path], { env, timeoutMs })
    }
  } finally {
    rmSync(scratchIndex, { force: true })
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/** The absolute, real git common dir of the repository holding `dir`, or null outside any. */
function gitCommonDir(dir) {
  const { exitCode, stdout } = exec(dir, 'git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { timeoutMs: GIT_TIMEOUT_MS })
  const found = stdout.trim()
  return exitCode === 0 && found !== '' && existsSync(found) ? realpathSync(found) : null
}

/** `path` itself when it exists, else its nearest existing ancestor. */
function nearestExisting(path) {
  let current = resolve(path)
  while (!existsSync(current) && dirname(current) !== current) current = dirname(current)
  return current
}

/**
 * Throw when `out` lies inside `repoRoot` or inside any other worktree of the same repository.
 *
 * The leak gate walks a worktree's untracked files, and a lane runs it from its own worktree while
 * the main checkout (or a sibling lane) is a different directory tree. So the path check against
 * `repoRoot` is not enough: the repository is every worktree sharing its git common dir, and an
 * `out` is refused when its nearest existing directory resolves to that same common dir.
 */
export function refuseOutInsideRepository(out, repoRoot = REPO_ROOT) {
  const refuse = () => {
    throw new Error(
      `--out ${out} is inside this repository (or one of its worktrees). The leak gate walks untracked files ` +
        '(scripts/leak-gate.mjs), so a fixture tree there would be scanned by every later gate run; ' +
        'point --out under the OS temp directory, or omit it.',
    )
  }
  if (!isOutsideRoot(repoRoot, resolve(out))) refuse()
  const existing = nearestExisting(out)
  // A symlink can put a temp-looking path inside the repository; the real paths decide.
  if (existsSync(repoRoot) && !isOutsideRoot(realpathSync(repoRoot), realpathSync(existing))) refuse()
  const own = gitCommonDir(repoRoot)
  if (own !== null && gitCommonDir(existing) === own) refuse()
}

/**
 * Build one replay fixture and return where everything in it lives.
 *
 * Steps, in order: (1) `git init`; (2) the base patch, the selected pass patches under
 * `vendor/contrib/`, the chain's preimage blobs, and the commit "service base" — S0; (3) the
 * rendered plan and the commit "replay plan"; (4) dependencies — a copy of `deps`, a link to
 * `depsLink` (tests only), or `npm install`; (5) unless `setup` is false, the CLI tarball installed
 * `--no-save` and `stamity init`, `sync`, `check`, then the commit "stamity setup"; (6) with
 * `runGates`, the fixture's own lint, typecheck and test.
 *
 * Every command lands in `steps` with its exit code and output. A failed step throws naming it,
 * with `error.steps` carrying everything recorded up to and including the failure. Any error after
 * the fixture directory exists carries `error.dir` and names it in the message, so the partial
 * tree can be inspected or removed. A gate that fails (or times out) is a measurement, not a
 * failure: it lands in `gates` and the build still returns. Every child is killed after
 * `timeouts.git` (git) or `timeouts.command` (npm, the CLI, the gates) milliseconds.
 */
export function createReplayFixture({
  out,
  cliTarball,
  deps,
  depsLink,
  units,
  setup = true,
  install = true,
  runGates = false,
  v1Dir,
  timeouts = {},
} = {}) {
  const gitTimeoutMs = timeouts.git ?? GIT_TIMEOUT_MS
  const commandTimeoutMs = timeouts.command ?? COMMAND_TIMEOUT_MS
  const parent = resolve(out ?? tmpdir())
  refuseOutInsideRepository(parent)
  if (deps !== undefined && depsLink !== undefined) throw new Error('--deps and --deps-link are exclusive; pass one')
  if (depsLink !== undefined && setup) {
    // A linked node_modules resolves into the linked checkout, so `node_modules/../evals/replay/v1`
    // would put the answer key one `..` away from the agents a setup build is made for.
    throw new Error('--deps-link is for tests only and is refused on a setup build: the agents under measurement could follow the link back into its checkout; use --deps or npm install, or pass --no-setup')
  }
  if (setup && cliTarball === undefined) throw new Error('the setup step needs --cli-tarball <tgz>, or pass --no-setup')
  const selected = normalizeUnits(units)
  const source = resolve(v1Dir ?? join(REPO_ROOT, 'evals', 'replay', 'v1'))
  const basePatch = join(source, 'patches', 'base.patch')
  const templatePath = join(source, 'plan', '001-replay.md')
  for (const required of [basePatch, templatePath]) {
    if (!existsSync(required)) throw new Error(`the replay data is missing ${required}`)
  }
  const chain = chainPatches(join(source, 'patches'))
  const absent = selected.filter((id) => !chain.some((pass) => pass.id === id))
  if (absent.length > 0) throw new Error(`no pass patch for ${absent.join(', ')} in ${join(source, 'patches')}`)

  mkdirSync(parent, { recursive: true })
  refuseOutInsideRepository(realpathSync(parent))
  const dir = realpathSync(mkdtempSync(join(parent, 'stamity-replay-')))
  try {
    return buildFixture({ dir, source, basePatch, templatePath, chain, selected, deps, depsLink, install, setup, cliTarball, runGates, gitTimeoutMs, commandTimeoutMs })
  } catch (error) {
    if (error instanceof Error && error.dir === undefined) {
      error.dir = dir
      error.message = `${error.message}\nThe partial fixture is at ${dir}.`
    }
    throw error
  }
}

/** Steps (1) to (6) of `createReplayFixture`, inside the fixture directory it has made. */
function buildFixture({ dir, source, basePatch, templatePath, chain, selected, deps, depsLink, install, setup, cliTarball, runGates, gitTimeoutMs, commandTimeoutMs }) {

  const steps = []
  const step = (name, file, args, options = {}) => {
    const shown = options.shown ?? [file, ...args]
    const { exitCode, output } = exec(dir, file, args, { timeoutMs: commandTimeoutMs, ...options })
    steps.push({ name, command: shown.join(' '), exitCode, output })
    if (exitCode !== 0) {
      const error = new Error(`replay fixture step "${name}" exited ${exitCode}:\n${output.trim()}`)
      error.step = name
      error.steps = steps
      throw error
    }
    return output
  }
  const gitStep = (name, args) =>
    step(name, 'git', [...gitConfigArgs(dir), ...args], { shown: ['git', ...args], timeoutMs: gitTimeoutMs })
  const commit = (name, message) => {
    gitStep('git add', ['add', '-A'])
    gitStep(name, ['commit', '--quiet', '-m', message])
    return gitStep('git rev-parse', ['rev-parse', 'HEAD']).trim()
  }

  // (1) and (2): the service at S0, with the pass patches and their preimages beside it.
  gitStep('git init', ['init', '--quiet', '--template='])
  gitStep('apply base.patch', ['apply', '--whitespace=nowarn', basePatch])
  mkdirSync(join(dir, CONTRIB_DIR), { recursive: true })
  for (const id of selected) copyFileSync(join(source, 'patches', `${id}.patch`), join(dir, CONTRIB_DIR, `${id}.patch`))
  storeChainPreimages(dir, basePatch, chain, gitTimeoutMs)
  gitStep('git add', ['add', '-A'])
  // Tracked, untracked and ignored alike: with no exclude option, `--others` lists every file in
  // the working tree, so a patch that ignores its own answer-key file does not hide it here.
  const leaked = gitStep('git ls-files', ['ls-files', '--cached', '--others'])
    .split('\n')
    .filter((path) => ANSWER_KEY.test(path))
  if (leaked.length > 0) {
    throw new Error(`S0 would carry answer-key paths (${leaked.join(', ')}); the fixture never holds seeds.json, the oracles or the reference fixes`)
  }
  const baseCommit = commit('commit service base', 'service base')

  // (3): the plan, stamped with S0.
  const plan = renderPlan(readFileSync(templatePath, 'utf8'), { stamp: baseCommit, units: selected })
  mkdirSync(join(dir, 'docs', 'plans'), { recursive: true })
  writeFileSync(join(dir, PLAN_PATH), plan, 'utf8')
  const planCommit = commit('commit replay plan', 'replay plan')

  // (4): dependencies.
  const nodeModules = join(dir, 'node_modules')
  if (deps !== undefined) {
    cpSync(resolve(deps), nodeModules, { recursive: true, verbatimSymlinks: true })
  } else if (depsLink !== undefined) {
    symlinkSync(resolve(depsLink), nodeModules, 'junction')
    // `node_modules/` in a .gitignore matches directories only, and a link is not one to git.
    mkdirSync(join(dir, '.git', 'info'), { recursive: true })
    appendFileSync(join(dir, '.git', 'info', 'exclude'), '/node_modules\n', 'utf8')
  } else if (install) {
    const args = ['install', '--prefer-offline', '--no-audit', '--no-fund']
    step('npm install', 'npm', args, npmArgs(args))
  }

  // (5): the emitted setup under measurement.
  let setupCommit = null
  let cli = null
  if (setup) {
    const tarball = resolve(cliTarball)
    const args = ['install', '--no-save', '--no-audit', '--no-fund', '--prefer-offline', tarball]
    step('npm install cli tarball', 'npm', args, npmArgs(args))
    const ownName = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).name
    const installedManifest = join(nodeModules, ...ownName.split('/'), 'package.json')
    if (!existsSync(installedManifest)) throw new Error(`the tarball did not install ${ownName} (no ${installedManifest})`)
    const installed = JSON.parse(readFileSync(installedManifest, 'utf8'))
    const binRel = typeof installed.bin === 'string' ? installed.bin : installed.bin?.stamity
    if (typeof binRel !== 'string') throw new Error(`${ownName} ${installed.version} declares no stamity bin`)
    // The same file `node_modules/.bin/stamity` links to, run through this node so the step is
    // portable where `.bin` holds a `.cmd` shim.
    const bin = join(nodeModules, ...ownName.split('/'), binRel)
    const stamity = (name, verb) => step(name, process.execPath, [bin, ...verb], { shown: ['stamity', ...verb] })
    stamity('stamity init', ['init', '-y', '--tools', 'claude'])
    stamity('stamity sync', ['sync', '-y'])
    stamity('stamity check', ['check'])
    setupCommit = commit('commit stamity setup', 'stamity setup')
    cli = { tarballSha256: sha256(readFileSync(tarball)), version: installed.version }
  }

  // (6): the fixture's own gates, recorded rather than enforced.
  let gates = null
  if (runGates) {
    gates = {}
    for (const [key, gateArgs] of [
      ['lint', ['run', 'lint']],
      ['typecheck', ['run', 'typecheck']],
      ['test', ['test']],
    ]) {
      const { exitCode, output } = exec(dir, 'npm', gateArgs, { ...npmArgs(gateArgs), timeoutMs: commandTimeoutMs })
      steps.push({ name: `gate ${key}`, command: ['npm', ...gateArgs].join(' '), exitCode, output })
      gates[key] = { exitCode, output }
    }
  }

  return {
    dir,
    baseCommit,
    planCommit,
    setupCommit,
    planPath: PLAN_PATH,
    planSha256: sha256(plan),
    units: selected,
    steps,
    cli,
    gates,
  }
}

export const USAGE =
  'Usage: node scripts/replay/fixture.mjs [--out <parentDir>] [--cli-tarball <tgz>]\n' +
  '                                       [--deps <dir> | --deps-link <dir>] [--units <id,…|none>]\n' +
  '                                       [--no-setup] [--no-install] [--run-gates] [--json]'

/** `--flag value` and `--flag` over argv, the shape `scripts/qa/run.mjs` uses. */
function parseArgs(argv) {
  const options = {}
  const valued = { '--out': 'out', '--cli-tarball': 'cliTarball', '--deps': 'deps', '--deps-link': 'depsLink', '--units': 'units' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg in valued) {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value.\n${USAGE}`)
      options[valued[arg]] = value
      i += 1
    } else if (arg === '--no-setup') options.setup = false
    else if (arg === '--no-install') options.install = false
    else if (arg === '--run-gates') options.runGates = true
    else if (arg === '--json') options.json = true
    else throw new Error(`Unknown option ${arg}.\n${USAGE}`)
  }
  return options
}

function main(argv) {
  const { help, json, ...options } = parseArgs(argv)
  if (help) {
    process.stdout.write(`${USAGE}\n`)
    return
  }
  const result = createReplayFixture(options)
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  process.stdout.write(
    `[replay] fixture at ${result.dir}\n` +
      `  S0 ${result.baseCommit} · plan ${result.planCommit} · setup ${result.setupCommit ?? 'skipped'}\n` +
      `  units ${result.units.length === 0 ? 'none' : result.units.join(', ')} · plan sha256 ${result.planSha256}\n`,
  )
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SELF) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`[replay] the fixture could not be built: ${error.message}\n`)
    process.exitCode = 1
  }
}
