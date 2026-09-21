#!/usr/bin/env node
// Does a built plugin root install, get discovered and run its setup under each client's own
// route? Asked once, of all four clients, through the route smoke — and answered as QA rows.
//
// This is the harness half of `scripts/plugin-route-smoke.mjs`. The smoke is the instrument: it
// walks structure, install, discovery and invocation per client and writes one JSON document with
// every leg's status, the command it ran, the client build it ran against and the sha-256 of that
// call's transcript. This module runs it ONCE with `--invoke` against the binaries this machine
// has, and folds each client's four legs into the one row the QA form carries (`H4a`–`H4d`).
//
// THE ROW'S STATUS IS THE WEAKEST LEG, never the best one. Every leg passed is `passed`; any leg
// FAILED is `failed`, with the failing leg's own reason leading; anything else — a binary this
// machine does not have, a leg that needs a credential nobody exported, a listing the client has
// no subcommand for — is `not-run` with that reason. A skipped leg is never rounded up, which is
// the same rule `scripts/qa/hook-runs.mjs` applies to a hook that never fired.
//
// THE ROW'S INPUTS ARE LOGICAL LABELS. Each row is bound to the bytes it was measured against: the
// root's own `stamity-plugin.json`, its hooks document, and the smoke script itself. The labels are
// `dist/<client>/…` and a repo-relative script path, never the absolute directory the distribution
// was built into — see `repoRelativeLabel` in `scripts/qa/run.mjs` and its S-4 comment for why a
// committed evidence file must not carry a checkout location.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
// The SAME sweep the smoke applies to its own reasons: this module quotes the smoke's stderr and its
// last stdout line into a row reason, and a row reason lands in a committed evidence file.
import { redactPaths } from '../plugin-route-smoke.mjs'

/** The smoke is a four-client, `--invoke` run: model calls, installs, uninstalls. */
const SMOKE_TIMEOUT_MS = 1_800_000

/**
 * After `SIGTERM`, how long the smoke gets before `SIGKILL`.
 *
 * Not a courtesy, and the number is derived rather than picked. The smoke installs the plugin into
 * the operator's REAL home for the two clients whose login lives there, and removes it from a
 * `SIGTERM` handler — which it can only run between client calls, because its work is a chain of
 * blocking spawns that a handler cannot interrupt. So the grace has to cover the worst case that
 * actually exists: one in-flight client call at the smoke's own 300 s per-call ceiling, plus its two
 * removal calls at 60 s each. 420 s is that sum, and `SIGKILL` — which cannot be handled at all —
 * follows only after it. Killing without the grace would leave the operator's home carrying a plugin
 * this harness installed, which is also why this lane spawns asynchronously instead of using
 * `spawnSync`'s one-shot `timeout`, whose kill signal arrives with no grace of any kind.
 */
const CLEANUP_GRACE_MS = 420_000

/** How much of each stream to keep: the reasons quote a tail and a last line, never the whole run. */
const STREAM_TAIL = 8192

/** Where the smoke lives, relative to the repository root the caller passes. */
const SMOKE = ['scripts', 'plugin-route-smoke.mjs']

/**
 * Fold one client's legs into a row. Exported for `test/qa/pluginRuns.test.ts`.
 *
 * The reason carries ALL FOUR leg lines, in the smoke's own order, plus the transcript hash of
 * every leg that made a client call — the hashes are what a run record cites, and a row whose
 * reason names only the verdict sends the next reader back to a transcript nobody kept.
 */
export function rowFor(client, entry) {
  const legs = entry?.legs ?? []
  if (legs.length === 0) {
    return { client, status: 'not-run', reason: 'the route smoke wrote no leg for this client' }
  }
  const lines = legs.map((leg) => {
    const version = leg.binaryVersion === null ? '' : ` [${leg.binaryVersion}]`
    const transcript = leg.transcriptSha256 === null ? '' : ` [transcript sha256 ${leg.transcriptSha256}]`
    return `${leg.leg} ${leg.status}${version}: ${leg.reason}${transcript}`
  })
  const failed = legs.filter((leg) => leg.status === 'FAIL')
  const skipped = legs.filter((leg) => leg.status === 'SKIPPED')
  const reason = lines.join(' || ')
  if (failed.length > 0) return { client, status: 'failed', reason }
  if (skipped.length > 0) return { client, status: 'not-run', reason }
  return { client, status: 'passed', reason }
}

/**
 * The inputs one client's row is bound to, out of the smoke's own `sha256s` map. Exported for the
 * suite, which is the only caller that can drive it against a report it composed itself.
 *
 * The map is already keyed by logical label, so this selects rather than composes: the client's own
 * entries plus the smoke script every row shares.
 */
export function inputsFor(client, sha256s) {
  return Object.keys(sha256s ?? {})
    .filter((label) => label.startsWith(`dist/${client}/`) || !label.startsWith('dist/'))
    .toSorted()
    .map((label) => ({ path: label, sha256: sha256s[label] }))
}

/**
 * Run the route smoke once with `--invoke` and return one row per client. Async because the run has
 * to be ENDED in two steps rather than killed in one — see {@link runSmoke}.
 *
 * `distDir` is the built distribution — the caller's to build, because a harness that built one
 * would be reporting on a tree it had just made rather than on the tree under test. The binaries
 * come from the `STAMITY_<CLIENT>_BIN` variables the smoke reads itself, so a machine with none of
 * them produces four honest `not-run` rows rather than an error.
 */
export async function runPluginClients({ clients, repoRoot, distDir, scratchDir }) {
  const smoke = join(repoRoot, ...SMOKE)
  if (!existsSync(smoke)) {
    return clients.map((client) => ({ client, status: 'not-run', reason: `${SMOKE.join('/')} is absent` }))
  }
  const work = mkdtempSync(join(tmpdir(), 'stamity-qa-plugin-runs-'))
  const jsonPath = join(work, 'legs.json')
  try {
    const args = [smoke, '--dist', distDir, '--client', clients.join(','), '--invoke', '--json', jsonPath]
    if (scratchDir !== undefined) args.push('--scratch', scratchDir)
    const result = await runSmoke({ args, cwd: repoRoot })
    if (!existsSync(jsonPath)) {
      // Exit 2 is the smoke's "could not run" — bad arguments, or a `--dist` that is not a
      // distribution root. The row says so with the smoke's own last words rather than a verdict,
      // and those words go through the redactor first: they are a child process's stderr, and this
      // reason is written into `.stamity/evidence/`.
      const detail = redactPaths(
        `${result.stdout.trim().split('\n').at(-1) ?? ''} ${result.stderr.trim().slice(-400)}`.trim(),
        [
          [distDir, 'dist'],
          ...(scratchDir === undefined ? [] : [[scratchDir, '<scratch>']]),
          [repoRoot, '<repo>'],
          [homedir(), '<home>'],
        ],
      )
      return clients.map((client) => ({
        client,
        status: 'not-run',
        reason: `the route smoke wrote no --json document (${result.exit}): ${detail}`,
      }))
    }
    const report = JSON.parse(readFileSync(jsonPath, 'utf8'))
    return clients.map((client) => ({
      ...rowFor(client, report.clients?.[client]),
      inputs: inputsFor(client, report.sha256s),
    }))
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/**
 * Run the smoke to completion, or end it in two steps.
 *
 * `spawnSync`'s `timeout` sends one signal and offers no grace, which is the wrong shape for a child
 * that has the operator's home to tidy. So: `SIGTERM` at the ceiling, then `SIGKILL` only after
 * {@link CLEANUP_GRACE_MS}, and the row reason records which of the two ended it.
 */
function runSmoke({ args, cwd }) {
  return new Promise((settle) => {
    const child = spawn(process.execPath, args, {
      cwd,
      // Inherited wholesale: every client's credentials, config directory and PATH live in this
      // environment, and the smoke's own scratch homes are what isolate the legs that must be
      // isolated. A curated subset here would measure a login failure instead of a route.
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const keep = (buffer, chunk) => `${buffer}${chunk}`.slice(-STREAM_TAIL)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout = keep(stdout, chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr = keep(stderr, chunk)
    })

    let ended = null
    let killTimer = null
    const termTimer = setTimeout(() => {
      ended = 'SIGTERM after the harness ceiling'
      child.kill('SIGTERM')
      killTimer = setTimeout(() => {
        ended = `SIGKILL ${CLEANUP_GRACE_MS} ms after SIGTERM`
        child.kill('SIGKILL')
      }, CLEANUP_GRACE_MS)
    }, SMOKE_TIMEOUT_MS)

    const done = (status, signal, error) => {
      clearTimeout(termTimer)
      if (killTimer !== null) clearTimeout(killTimer)
      const how =
        error !== undefined
          ? `the smoke could not be spawned: ${error.message}`
          : signal !== null && signal !== undefined
            ? `killed by signal ${signal}${ended === null ? '' : ` (${ended})`}`
            : `exit ${String(status)}`
      settle({ stdout, stderr, status: status ?? null, signal: signal ?? null, exit: how })
    }
    child.on('error', (error) => done(null, null, error))
    child.on('close', (status, signal) => done(status, signal))
  })
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// The upgrade-and-rollback walk (row `H5`).
//
// The instrument is `test/ci/pluginLifecycle.test.ts`, spawned. That is the deliberate choice over a
// shared walk module: the walk's proof is its ASSERTIONS — installed tree equals the shipped root
// byte for byte, `plugin status` compatible in all three states, the project surface unchanged after
// every step — and a second implementation that produced a status without them would be a different
// measurement wearing the same row id. So there is one walk, the suite owns it, and this function
// reads its verdict and its rows.
//
// The channel is the suite's own `STAMITY_LIFECYCLE_LOG`: one `plugin-lifecycle: <client> <step>
// <verdict> (<reason>)` line per step, plus `plugin-lifecycle-input: <label> <sha256>` lines binding
// the row to the fixture bytes under LOGICAL labels. Nothing in this lane composes a path into a
// reason, and every reason still goes through {@link redactPaths} before it is returned — an
// evidence file is committed, and a vitest line can carry a temp directory or a home.
//
// THE ROW FOLDS ON THE PER-CLIENT `walk` LINE, not on the whole log. Four `walk PASS` and a green
// suite is `passed`; any `walk SKIPPED` — no binary, an account the walk will not reach for, a rate
// limit — is `not-run` with those clients' reasons; a red suite, or a `walk FAIL`, is `failed`. The
// one line that is FAIL by design, `claude rollback-documented`, is a measurement of `docs/plugins.md`
// rather than of a walk step, which is exactly why the fold reads the `walk` line and not the rest.

/** The suite whose armed cases ARE this walk, and the scripts the row is bound to beyond the fixture. */
const LIFECYCLE_SUITE = ['test', 'ci', 'pluginLifecycle.test.ts']

/**
 * Four client walks, each building a real runtime's worth of distribution and driving a client CLI
 * through three states. The suite's own budget for one armed run was 206.68 s measured on
 * 2026-09-20; this ceiling is ~9x that, because the harness may be the third thing running on the
 * machine and a Cursor discovery call is a network round trip.
 */
const WALK_TIMEOUT_MS = 1_800_000

/** One row line out of the suite's log, or `null` for anything else. */
function parseRow(line) {
  const match = /^plugin-lifecycle: (\S+) (\S+) (PASS|FAIL|SKIPPED)(?: \((.*)\))?$/.exec(line)
  if (match === null) return null
  return { client: match[1], step: match[2], verdict: match[3], reason: match[4] ?? '' }
}

/**
 * Fold the suite's log into the one row `H5` carries. Exported for `test/qa/pluginRuns.test.ts`,
 * which is the only caller that can drive it against a log it wrote itself.
 */
export function lifecycleRow({ clients, log, status, exit, redact = (text) => text }) {
  const lines = log.split('\n')
  const rows = lines.map(parseRow).filter((row) => row !== null)
  const reason = redact(
    lines
      .filter((line) => line.startsWith('plugin-lifecycle: ') || line.startsWith('plugin-lifecycle-runtime: '))
      .join(' || '),
  )
  if (rows.length === 0) {
    return { status: 'not-run', reason: `the lifecycle suite wrote no row (${exit})` }
  }
  // The suite's OWN verdict, kept separate from the rows: `status` is its exit code and is what says
  // whether the assertions held, while the rows say what was walked. A green log under a red exit is
  // the case this distinction exists for.
  const green = status === 0
  const walks = clients.map((client) => ({
    client,
    row: rows.findLast((row) => row.client === client && row.step === 'walk') ?? null,
  }))
  const missing = walks.filter((entry) => entry.row === null)
  const failed = walks.filter((entry) => entry.row?.verdict === 'FAIL')
  const skipped = walks.filter((entry) => entry.row?.verdict === 'SKIPPED')
  if (failed.length > 0 || !green) {
    const how = failed.length > 0 ? `walk FAIL for ${failed.map((entry) => entry.client).join(', ')}` : `the suite ended: ${exit}`
    return { status: 'failed', reason: `${how} || ${reason}` }
  }
  if (missing.length > 0) {
    // A client with no `walk` line at all: the suite never reached its closing row, which is a
    // failure to MEASURE rather than a measured failure.
    return { status: 'not-run', reason: `no walk row for ${missing.map((entry) => entry.client).join(', ')} || ${reason}` }
  }
  if (skipped.length > 0) {
    return {
      status: 'not-run',
      reason: `${skipped.map((entry) => `${entry.client}: ${entry.row.reason}`).join('; ')} || ${reason}`,
    }
  }
  return { status: 'passed', reason }
}

/** The `plugin-lifecycle-input:` lines, as the row's input list under their logical labels. */
export function lifecycleInputs(log) {
  return log
    .split('\n')
    .map((line) => /^plugin-lifecycle-input: (\S+) ([0-9a-f]{64})$/.exec(line))
    .filter((match) => match !== null)
    .map((match) => ({ path: match[1], sha256: match[2] }))
    .toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/**
 * Run the upgrade-and-rollback walk once and return the one row `H5` carries.
 *
 * `distDir` is used for ONE thing: its first root's bundled `runtime/` is handed to the fixture
 * builder, so the walk does not pack this checkout and install a production graph a second time
 * (~60 s of the ~70 s a self-built fixture costs). With no usable runtime in the distribution the
 * builder makes its own, and the reason says which happened — the `plugin-lifecycle-runtime:` line.
 *
 * `scratchDir` is a REDACTION input only, not a location: the suite makes its own temp directories
 * per client walk, and passing the harness's `--fixtures` path in would put two owners on one tree.
 * What it buys is a reason with `<scratch>` in it where a vitest line quoted that path.
 */
export async function runLifecycleWalk({ clients, repoRoot, distDir, scratchDir }) {
  const suite = join(repoRoot, ...LIFECYCLE_SUITE)
  if (!existsSync(suite)) {
    return { status: 'not-run', reason: `${LIFECYCLE_SUITE.join('/')} is absent` }
  }
  const unarmed = clients.filter((client) => process.env[`STAMITY_${client.toUpperCase()}_BIN`] === undefined)
  if (unarmed.length > 0) {
    // Asked BEFORE a thirty-minute spawn: the suite would skip those walks and this lane would read
    // its own log to discover what the environment already says.
    return {
      status: 'not-run',
      reason: `no binary for ${unarmed.map((client) => `${client} (STAMITY_${client.toUpperCase()}_BIN unset)`).join(', ')}`,
    }
  }
  const work = mkdtempSync(join(tmpdir(), 'stamity-qa-lifecycle-'))
  const logPath = join(work, 'walks.txt')
  try {
    const runtime = bundledRuntime(distDir)
    const result = await runSuite({
      args: ['vitest', 'run', LIFECYCLE_SUITE.join('/')],
      cwd: repoRoot,
      env: {
        ...process.env,
        STAMITY_LIFECYCLE_LOG: logPath,
        ...(runtime === null ? {} : { STAMITY_LIFECYCLE_RUNTIME: runtime }),
      },
    })
    const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : ''
    const redact = (text) =>
      redactPaths(text, [
        [distDir, 'dist'],
        ...(scratchDir === undefined ? [] : [[scratchDir, '<scratch>']]),
        [work, '<scratch>'],
        [repoRoot, '<repo>'],
        [tmpdir(), '<tmp>'],
        [homedir(), '<home>'],
      ])
    if (log === '') {
      const detail = redact(`${result.stdout.trim().split('\n').at(-1) ?? ''} ${result.stderr.trim().slice(-400)}`.trim())
      return { status: 'not-run', reason: `the lifecycle suite wrote no log (${result.exit}): ${detail}` }
    }
    return {
      ...lifecycleRow({ clients, log, status: result.status, exit: result.exit, redact }),
      inputs: lifecycleInputs(log),
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/**
 * A runtime directory inside a built distribution, or `null`.
 *
 * Every plugin root bundles one at `<root>/runtime/`, and the distribution builder requires exactly
 * three files of a runtime input — `package.json`, `dist/cli.js`, `RUNTIME.json`. All three are
 * checked here rather than assumed, because handing the builder a directory that only looks like a
 * runtime turns a reusable input into a refusal thirty seconds into the walk.
 */
function bundledRuntime(distDir) {
  if (distDir === undefined) return null
  for (const client of ['claude', 'cursor', 'copilot', 'codex']) {
    const dir = join(distDir, client, 'runtime')
    const complete = ['package.json', 'RUNTIME.json', join('dist', 'cli.js')].every((file) => existsSync(join(dir, file)))
    if (complete) return dir
  }
  return null
}

/**
 * Run the suite to completion, or end it in two steps — the same shape {@link runSmoke} uses and for
 * the same reason: the walks install into client state directories and remove what they installed,
 * and a single kill with no grace would leave that behind. `npx` rather than a resolved binary
 * because vitest is a dev dependency of this repository and its bin location is npm's to know.
 */
function runSuite({ args, cwd, env }) {
  return new Promise((settle) => {
    const child = spawn('npx', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const keep = (buffer, chunk) => `${buffer}${chunk}`.slice(-STREAM_TAIL)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout = keep(stdout, chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr = keep(stderr, chunk)
    })

    let ended = null
    let killTimer = null
    const termTimer = setTimeout(() => {
      ended = 'SIGTERM after the harness ceiling'
      child.kill('SIGTERM')
      killTimer = setTimeout(() => {
        ended = `SIGKILL ${CLEANUP_GRACE_MS} ms after SIGTERM`
        child.kill('SIGKILL')
      }, CLEANUP_GRACE_MS)
    }, WALK_TIMEOUT_MS)

    const done = (status, signal, error) => {
      clearTimeout(termTimer)
      if (killTimer !== null) clearTimeout(killTimer)
      const how =
        error !== undefined
          ? `the lifecycle suite could not be spawned: ${error.message}`
          : signal !== null && signal !== undefined
            ? `killed by signal ${signal}${ended === null ? '' : ` (${ended})`}`
            : `exit ${String(status)}`
      settle({ stdout, stderr, exit: how, status: status ?? null })
    }
    child.on('error', (error) => done(null, null, error))
    child.on('close', (status, signal) => done(status, signal))
  })
}
