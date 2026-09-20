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

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The smoke is a four-client, `--invoke` run: model calls, installs, uninstalls. */
const SMOKE_TIMEOUT_MS = 1_800_000

/** Where the smoke lives, relative to the repository root the caller passes. */
const SMOKE = ['scripts', 'plugin-route-smoke.mjs']

/**
 * Fold one client's legs into a row.
 *
 * The reason carries ALL FOUR leg lines, in the smoke's own order, plus the transcript hash of
 * every leg that made a client call — the hashes are what a run record cites, and a row whose
 * reason names only the verdict sends the next reader back to a transcript nobody kept.
 */
function rowFor(client, entry) {
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
 * The inputs one client's row is bound to, out of the smoke's own `sha256s` map.
 *
 * The map is already keyed by logical label, so this selects rather than composes: the client's own
 * entries plus the smoke script every row shares.
 */
function inputsFor(client, sha256s) {
  return Object.keys(sha256s ?? {})
    .filter((label) => label.startsWith(`dist/${client}/`) || !label.startsWith('dist/'))
    .toSorted()
    .map((label) => ({ path: label, sha256: sha256s[label] }))
}

/**
 * Run the route smoke once with `--invoke` and return one row per client.
 *
 * `distDir` is the built distribution — the caller's to build, because a harness that built one
 * would be reporting on a tree it had just made rather than on the tree under test. The binaries
 * come from the `STAMITY_<CLIENT>_BIN` variables the smoke reads itself, so a machine with none of
 * them produces four honest `not-run` rows rather than an error.
 */
export function runPluginClients({ clients, repoRoot, distDir, scratchDir }) {
  const smoke = join(repoRoot, ...SMOKE)
  if (!existsSync(smoke)) {
    return clients.map((client) => ({ client, status: 'not-run', reason: `${SMOKE.join('/')} is absent` }))
  }
  const work = mkdtempSync(join(tmpdir(), 'stamity-qa-plugin-runs-'))
  const jsonPath = join(work, 'legs.json')
  try {
    const args = [smoke, '--dist', distDir, '--client', clients.join(','), '--invoke', '--json', jsonPath]
    if (scratchDir !== undefined) args.push('--scratch', scratchDir)
    const result = spawnSync(process.execPath, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: SMOKE_TIMEOUT_MS,
      // Inherited wholesale: every client's credentials, config directory and PATH live in this
      // environment, and the smoke's own scratch homes are what isolate the legs that must be
      // isolated. A curated subset here would measure a login failure instead of a route.
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
    })
    if (!existsSync(jsonPath)) {
      // Exit 2 is the smoke's "could not run" — bad arguments, or a `--dist` that is not a
      // distribution root. The row says so with the smoke's own last words rather than a verdict.
      const detail = `${(result.stdout ?? '').trim().split('\n').at(-1) ?? ''} ${(result.stderr ?? '').trim().slice(-400)}`.trim()
      return clients.map((client) => ({
        client,
        status: 'not-run',
        reason: `the route smoke wrote no --json document (exit ${String(result.status)}): ${detail}`,
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
