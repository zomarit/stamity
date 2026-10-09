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
// EVERY path in `git diff --name-only --no-renames <base> HEAD` inside some lane, and a valid
// test-input map at the base commit (`git show <base>:.stamity/change-classes.json`, validated by
// `parseClassFile`) with an entry matching every changed path and none of those saying "all". The
// suites are the union of the `tests` of every entry a changed path matches (REQ-FLOW-062). The
// checked-out copy of the map is never read: in CI it is the head's, which the change could edit.
// Any other answer — a schedule, a dispatch, a new branch's all-zero base, a base git cannot find,
// one path in no lane, no map or a refused one at the base, a path no entry matches — is
// `full=true`, which is full CI. `site_build=true` whenever the diff touches a
// website path, on a full answer too (the full side's LTS leg builds the site then), and whenever
// the diff could not be read; an empty diff builds no site. `records_only=true` still means every
// path is a record; it is derived from the lanes, nothing in ci.yml reads it, and it is kept for
// one release for any reader of the old output: remove it at the first release after this change
// merges.
// Exit 2 is reserved for an argument this script does not know, so a typo in the workflow is red
// rather than quietly full.
//
// `src/change/classify.ts`, and what it imports, load by Node's type stripping: the `changes` job
// runs Node 24 with no install, so that closure must stay erasable TypeScript over Node built-ins
// (`test/ci/recordsOnly.test.ts` runs a copy of it with plain `node`, and gives a change to any
// module in it full CI).
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CLASS_FILE, matchGlob, parseClassFile, testEntryError } from '../../src/change/classify.ts'

/**
 * The record locations: run records, the deferral inbox, handoffs, and plans. What they share is
 * that no build, no emitted file and no published byte reads them; the suites that DO read the
 * committed copies are the ones the base commit's test-input map lists for them, which the records
 * lane runs instead of the full matrix. `.stamity/learnings/` is deliberately absent: it feeds the
 * session hook and the troubleshooting count, so it is its own lane, which also builds the CLI and
 * runs its `check`.
 */
export const RECORDS_PATHS = Object.freeze([
  '.stamity/runs/**',
  '.stamity/inbox.md',
  '.stamity/handoffs/**',
  'docs/plans/**',
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
 * Whether `path` matches `glob` by either reading of `\`, as `selectTests` matches a map entry, so
 * a lane's suites are the same union `selectTests` gives for its paths (review/77).
 */
function entryMatches(path, glob) {
  return matchGlob(path, glob) || matchGlob(path, glob, { literal: true })
}

/**
 * The suites the map gives `paths`, or the reason it cannot answer narrow: the union of the
 * `tests` of every entry a path matches, sorted. A path no entry matches, a matching `"all"`
 * entry, or a selected name a runner could misread (`testEntryError`; the workflow passes the list
 * unquoted) is a reason. No class enters: a lane asks which suites read a path, not which gates
 * its class needs.
 */
function suitesFromMap(paths, map) {
  const suites = new Set()
  for (const path of paths) {
    const entries = map.filter(entry => entryMatches(path, entry.glob))
    if (entries.length === 0) return { reason: `${path} matches no entry of the base commit's test-input map` }
    const every = entries.find(entry => entry.tests === 'all')
    if (every !== undefined) return { reason: `the test-input entry ${every.glob} selects every test and matches ${path}` }
    for (const entry of entries) for (const test of entry.tests) suites.add(test)
  }
  for (const suite of suites) {
    const problem = testEntryError(suite)
    if (problem !== undefined) return { reason: `the selected name ${JSON.stringify(suite)} ${problem}` }
  }
  return { suites: [...suites].toSorted() }
}

/**
 * The classification, with no I/O: `{ full, lanes, suites, siteBuild, cliCheck, recordsOnly,
 * reason }`. `map` is the base commit's parsed `testInputs`, or `null` when it has none or a
 * refused one; `null` and an absent `map` are full CI. `lanes` is sorted; `suites` is the sorted
 * union of every map entry a changed path matches, each suite once.
 */
export function decide({ event, base, paths, map = null }) {
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
  if (map === null) return fullCi('no valid test-input map at the base commit names the lanes\' suites', hit.has('website'))
  const selection = suitesFromMap(paths, map)
  if (selection.suites === undefined) return fullCi(selection.reason, hit.has('website'))
  const lanes = [...hit].toSorted()
  const suites = selection.suites
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

/**
 * The base commit's test-input map, or null when the base has no class file or one
 * `parseClassFile` refuses. Read with `git show <base>:<path>` only: the checked-out copy is the
 * head's, which the change itself could have edited.
 */
function loadBaseMap(base, cwd = process.cwd()) {
  let text
  try {
    text = execFileSync('git', ['show', `${base}:${CLASS_FILE}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    })
  } catch {
    return null
  }
  const parsed = parseClassFile(text)
  return parsed.ok ? parsed.testInputs : null
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
      ? decide({ event, base: args.base, paths, map: loadBaseMap(args.base) })
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
