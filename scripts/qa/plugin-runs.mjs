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
