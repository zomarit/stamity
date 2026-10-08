#!/usr/bin/env node
// The CI lane classifier: records, specs, learnings and website (`LANE_PATHS`). The file keeps the
// name it had when records were its only lane, so no reference moves. Importing it performs no I/O.
//
//   node scripts/ci/records-only.mjs --base <sha>
//
// Prints six `key=value` lines — `full`, `lanes` (a JSON array), `suites` (space-joined),
// `site_build`, `cli_check` and `records_only` — and appends the same lines to `$GITHUB_OUTPUT`
// when the runner provides one. The reason goes to stderr, so the job log says WHY a change got
// the lanes job or the full matrix.
//
// It fails closed. `full=false` needs all of: a push or pull_request event (read from
// `GITHUB_EVENT_NAME`), a base that is a non-zero hex commit id git can resolve, a non-empty diff,
// and EVERY path in `git diff --name-only --no-renames <base> HEAD` inside some lane. Any other
// answer — a schedule, a dispatch, a new branch's all-zero base, a base git cannot find, one path
// in no lane — is `full=true`, which is full CI. `site_build=true` whenever the diff touches a
// website path, on a full answer too (the full side's LTS leg builds the site then), and whenever
// the diff could not be read; an empty diff builds no site. `records_only=true` still means every
// path is a record; it is derived from the lanes, nothing in ci.yml reads it, and it is kept for
// one release for any reader of the old output: remove it at the first release after this change
// merges.
// Exit 2 is reserved for an argument this script does not know, so a typo in the workflow is red
// rather than quietly full.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * The record locations: run records, the deferral inbox, handoffs, and plans. What they share is
 * that no build, no emitted file and no published byte reads them; the suites that DO read the
 * committed copies are `RECORDS_SUITES`, which the records lane runs instead of the full matrix.
 * `.stamity/learnings/` is deliberately absent: it feeds the session hook and the troubleshooting
 * count, so it is its own lane, which also builds the CLI and runs its `check`.
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
 * committed runs, and the two suites that run the leak gate over the whole tree. It is the records
 * lane's list in `LANE_SUITES`, and the specs lane's starts with it. The `lanes` job in
 * `.github/workflows/ci.yml` runs the `suites` output this script prints, so the workflow spells
 * no list of its own; `test/ci/recordsOnly.test.ts` pins this one.
 */
export const RECORDS_SUITES = Object.freeze([
  'test/records',
  'test/docsPages.test.ts',
  'test/cli/docs/measurements.test.ts',
  'test/authoring/specPlanCoverage.test.ts',
  'test/ci/leakGate.test.ts',
])

/**
 * Each lane's paths. A path takes the first lane whose pattern holds it, in this key order, so a
 * `docs/` path under `plans/` is a record, under `specs/` a spec, and anywhere else website. A
 * `/**` pattern holds the paths strictly beneath its folder; any other pattern is one exact path.
 * `README.md` is in no lane: it ships in the npm tarball.
 */
export const LANE_PATHS = Object.freeze({
  records: RECORDS_PATHS,
  specs: Object.freeze(['docs/specs/**']),
  learnings: Object.freeze(['.stamity/learnings/**']),
  website: Object.freeze(['website/**', 'docs/**']),
})

/**
 * The suites each lane runs: those that read that lane's REAL repository-root copies, confirmed on
 * 2026-10-08 by reading every test that opens such a path. Specs: every records suite (a plan
 * naming a new spec lands in both), the spec-status walk, the plan-coverage check and the site
 * roster's exclusion of `docs/specs/`. Learnings: the learnings suite and the whole-tree leak gate;
 * the session hook's read of them is what the lane's `check` step proves. Website: the site, roster
 * and table-header suites over `website/`, every suite reading a `docs/` page or regenerating one,
 * and the leak gate.
 */
export const LANE_SUITES = Object.freeze({
  records: RECORDS_SUITES,
  specs: Object.freeze([...RECORDS_SUITES, 'test/records/specStatus.test.ts', 'test/ci/docsRoster.test.ts']),
  learnings: Object.freeze(['test/learnings/repoLearnings.test.ts', 'test/ci/leakGate.test.ts']),
  website: Object.freeze([
    'test/ci/docsSite.test.ts',
    'test/ci/docsRoster.test.ts',
    'test/ci/tableHeaderScope.test.ts',
    'test/docsPages.test.ts',
    'test/ci/workflow.test.ts',
    'test/ci/leakGate.test.ts',
    'test/cli/docs/cliReference.test.ts',
    'test/cli/docs/configReference.test.ts',
    'test/cli/docs/measurements.test.ts',
    'test/cli/docs/referencePages.test.ts',
    'test/cli/docs/llmsIndex.test.ts',
    'test/cli/commands/check.test.ts',
    'test/content/invariantsVersion.test.ts',
    'test/emit/capabilityMatrix.test.ts',
    'test/corpus/invariants.test.ts',
    'test/ci/packSigningRehearsal.test.ts',
  ]),
})

/** The events whose diff can take a lane. Everything else is full CI. */
const DIFF_EVENTS = new Set(['push', 'pull_request'])

/**
 * The engine's state-scaffold keep file. `sync` plans it and `stamity check` re-proves it drift-clean,
 * and the dogfood check does not run on the records lane — so a change to one is never a record.
 */
const KEEP_FILE = '.gitkeep'

/** True when a `/**` pattern holds `path` strictly beneath its folder, or an exact one names it. */
function holds(pattern, path) {
  if (!pattern.endsWith('/**')) return path === pattern
  const folder = pattern.slice(0, -2)
  return path.startsWith(folder) && path.length > folder.length
}

/** A `..` or `.` segment, or the engine's keep file: outside every lane, whatever the prefix. */
function outsideEveryLane(path) {
  const segments = path.split('/')
  return segments.includes('..') || segments.includes('.') || segments.at(-1) === KEEP_FILE
}

/** True when `path` (repository-relative, `/`-separated, as git prints it) is a record. */
export function isRecordsPath(path) {
  return !outsideEveryLane(path) && RECORDS_PATHS.some(pattern => holds(pattern, path))
}

/** The lane `path` falls in, or null when it falls in none (full CI). */
export function laneOf(path) {
  if (outsideEveryLane(path)) return null
  for (const [lane, patterns] of Object.entries(LANE_PATHS)) {
    if (patterns.some(pattern => holds(pattern, path))) return lane
  }
  return null
}

/**
 * The answer that runs the full matrix and no lane. `siteBuild` asks the full side to build the
 * docs site: true when the diff touches a website path, and true when the diff could not be read,
 * because a site change no required job builds is the failure this answer exists to prevent.
 */
function fullCi(reason, siteBuild) {
  return { full: true, lanes: [], suites: [], siteBuild, cliCheck: false, recordsOnly: false, reason }
}

/**
 * The classification, with no I/O: `{ full, lanes, suites, siteBuild, cliCheck, recordsOnly,
 * reason }`. `lanes` is sorted; `suites` is the union in `LANE_SUITES` order, each suite once.
 */
export function decide({ event, base, paths }) {
  if (!DIFF_EVENTS.has(event ?? '')) return fullCi(`event "${event ?? ''}" always runs full CI`, true)
  const verdict = baseProblem(base)
  if (verdict !== null) return fullCi(verdict, true)
  if (paths.length === 0) return fullCi('the diff lists no path', false)
  const hit = new Set()
  let outside = null
  for (const path of paths) {
    const lane = laneOf(path)
    if (lane === null) outside ??= path
    else hit.add(lane)
  }
  if (outside !== null) return fullCi(`${outside} is in no lane`, hit.has('website'))
  const lanes = [...hit].toSorted()
  const suites = [...new Set(Object.keys(LANE_SUITES).filter(lane => hit.has(lane)).flatMap(lane => LANE_SUITES[lane]))]
  return {
    full: false,
    lanes,
    suites,
    siteBuild: hit.has('website'),
    cliCheck: hit.has('learnings'),
    recordsOnly: lanes.length === 1 && lanes[0] === 'records',
    reason: `all ${paths.length} changed path(s) fall in the lanes ${lanes.join(', ')}`,
  }
}

/** The six output lines, in the order the workflow maps them. */
function outputLines(decision) {
  return [
    `full=${decision.full}`,
    `lanes=${JSON.stringify(decision.lanes)}`,
    `suites=${decision.suites.join(' ')}`,
    `site_build=${decision.siteBuild}`,
    `cli_check=${decision.cliCheck}`,
    `records_only=${decision.recordsOnly}`,
  ].join('\n') + '\n'
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
  // Only ask git when the event and the base could still allow a lane.
  if (DIFF_EVENTS.has(event ?? '') && baseProblem(args.base) === null) {
    const paths = changedPaths(args.base, process.cwd())
    decision = Array.isArray(paths)
      ? decide({ event, base: args.base, paths })
      : fullCi(`git could not diff against the base: ${paths.failure}`, true)
  }
  const lines = outputLines(decision)
  process.stdout.write(lines)
  process.stderr.write(`records-only: ${decision.reason}\n`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines)
  return 0
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2))
}
