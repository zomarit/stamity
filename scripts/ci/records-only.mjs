#!/usr/bin/env node
// The records-only CI lane's detector. Importing it performs no I/O.
//
//   node scripts/ci/records-only.mjs --base <sha>
//
// Prints exactly one line, `records_only=true` or `records_only=false`, and appends the same line
// to `$GITHUB_OUTPUT` when the runner provides one. The reason goes to stderr, so the job log says
// WHY a push got the short lane or the full one.
//
// It fails closed. `true` needs all of: a push or pull_request event (read from
// `GITHUB_EVENT_NAME`), a base that is a non-zero hex commit id git can resolve, a non-empty diff,
// and EVERY path in `git diff --name-only --no-renames <base> HEAD` inside `RECORDS_PATHS`. Any
// other answer — a schedule, a dispatch, a new branch's all-zero base, a base git cannot find, a
// learnings change, one code path — is `false`, which is full CI. Exit 2 is reserved for an
// argument this script does not know, so a typo in the workflow is red rather than quietly full.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * The record locations: run records, the deferral inbox, handoffs, and plans. What they share is
 * that no build, no emitted file and no published byte reads them; the suites that DO read the
 * committed copies are `RECORDS_SUITES`, which the records lane runs instead of the full matrix.
 * `.stamity/learnings/` is deliberately absent: it feeds the session hook and the troubleshooting
 * count, so a learnings change runs full CI.
 */
export const RECORDS_PATHS = Object.freeze([
  '.stamity/runs/**',
  '.stamity/inbox.md',
  '.stamity/handoffs/**',
  'docs/plans/**',
])

/**
 * The suites that read the REAL repository-root copies of the record locations, confirmed by
 * reading each suite on 2026-09-30: the ledgers and the spec-status plan walk (`test/records`),
 * the plan-coverage check over two committed plans, the measurements page rendered from the
 * committed runs, and the two suites that run the leak gate over the whole tree. The records job
 * in `.github/workflows/ci.yml` runs exactly this list, and `test/ci/workflow.test.ts` holds the
 * two equal.
 */
export const RECORDS_SUITES = Object.freeze([
  'test/records',
  'test/docsPages.test.ts',
  'test/cli/docs/measurements.test.ts',
  'test/authoring/specPlanCoverage.test.ts',
  'test/ci/leakGate.test.ts',
])

/** The events whose diff can be records-only. Everything else is full CI. */
const DIFF_EVENTS = new Set(['push', 'pull_request'])

/**
 * The engine's state-scaffold keep file. `sync` plans it and `stamity check` re-proves it drift-clean,
 * and the dogfood check does not run on the records lane — so a change to one is never a record.
 */
const KEEP_FILE = '.gitkeep'

/** True when `path` (repository-relative, `/`-separated, as git prints it) is a record. */
export function isRecordsPath(path) {
  const segments = path.split('/')
  if (segments.includes('..') || segments.includes('.') || segments.at(-1) === KEEP_FILE) return false
  return RECORDS_PATHS.some(pattern => {
    if (!pattern.endsWith('/**')) return path === pattern
    const folder = pattern.slice(0, -2)
    return path.startsWith(folder) && path.length > folder.length
  })
}

/** The classification, with no I/O: `{ recordsOnly, reason }`. */
export function decide({ event, base, paths }) {
  if (!DIFF_EVENTS.has(event ?? '')) {
    return { recordsOnly: false, reason: `event "${event ?? ''}" always runs full CI` }
  }
  const verdict = baseProblem(base)
  if (verdict !== null) return { recordsOnly: false, reason: verdict }
  if (paths.length === 0) return { recordsOnly: false, reason: 'the diff lists no path' }
  const other = paths.find(path => !isRecordsPath(path))
  if (other !== undefined) {
    return { recordsOnly: false, reason: `${other} is not a record` }
  }
  return { recordsOnly: true, reason: `all ${paths.length} changed path(s) are records` }
}

function baseProblem(base) {
  if (base === undefined || base === '') return 'no base commit to compare against'
  if (!/^[0-9a-f]{7,64}$/i.test(base)) return `base "${base}" is not a commit id`
  if (/^0+$/.test(base)) return 'the base is all zeros (a new ref has no earlier commit)'
  return null
}

/** The changed paths between `base` and HEAD, both sides of every rename; null when git refuses. */
function changedPaths(base, cwd) {
  try {
    const out = execFileSync(
      'git',
      ['diff', '--name-only', '--no-renames', '--no-ext-diff', '-z', base, 'HEAD', '--'],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
    )
    return out.split('\0').filter(path => path !== '')
  } catch (error) {
    return { failure: String(error?.stderr ?? error?.message ?? error).trim().split('\n')[0] }
  }
}

function parseArgs(argv) {
  const args = { base: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--base') {
      args.base = argv[index + 1] ?? ''
      index += 1
    } else if (arg.startsWith('--base=')) {
      args.base = arg.slice('--base='.length)
    } else {
      return { error: `unknown argument: ${arg}` }
    }
  }
  return args
}

function main(argv) {
  const args = parseArgs(argv)
  if (args.error !== undefined) {
    process.stderr.write(`records-only: ${args.error}\nusage: node scripts/ci/records-only.mjs --base <sha>\n`)
    return 2
  }
  const event = process.env.GITHUB_EVENT_NAME
  let decision = decide({ event, base: args.base, paths: [] })
  // Only ask git when the event and the base could still allow a records-only answer.
  if (DIFF_EVENTS.has(event ?? '') && baseProblem(args.base) === null) {
    const paths = changedPaths(args.base, process.cwd())
    decision = Array.isArray(paths)
      ? decide({ event, base: args.base, paths })
      : { recordsOnly: false, reason: `git could not diff against the base: ${paths.failure}` }
  }
  const line = `records_only=${decision.recordsOnly}`
  process.stdout.write(`${line}\n`)
  process.stderr.write(`records-only: ${decision.reason}\n`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`)
  return 0
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2))
}
