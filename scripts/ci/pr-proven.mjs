#!/usr/bin/env node
// The proven-push detector for `ci.yml`'s `prove-pr` job. Importing it performs no I/O.
//
//   node scripts/ci/pr-proven.mjs --sha <sha>
//
// Prints exactly one line, `proven=true` or `proven=false`, and appends the same line to
// `$GITHUB_OUTPUT` when the runner provides one. The reason goes to stderr, so the job log says
// WHY a push skipped the test matrix or ran it.
//
// `true` needs all of: a `push` event (`GITHUB_EVENT_NAME`) to `refs/heads/main` (`GITHUB_REF`),
// a pushed commit whose tree is a 40-hex object id, and a pull request containing that commit
// whose HEAD carries the same tree and whose newest `ci.yml` pull-request run passed: the latest
// attempt of that run holds exactly one `all-ci-checks` job, and it concluded `success`. The tree
// is compared rather than the commit, because a fast-forward and a rebase merge of an up-to-date
// branch both land the pull request's tree under new or identical commits; a branch that was
// behind lands a tree no pull-request run tested, and no head matches.
//
// `ci.yml`'s own run is the trust boundary, not the app that reports it. Every job of every
// workflow reports as the `github-actions` app, so a second workflow (a fork's pull request can
// add one) can put a passing `all-ci-checks` check run beside a failing gate. Every
// `all-ci-checks` check run on the head is read with its check suite, and one from any suite but
// the gate run's is a second producer: not proven. The workflow run's conclusion is never read:
// the advisory `supply-chain` lane can be red beside a green gate. Every list is paged.
//
// It fails open to full CI and never red. A failed or stalled `gh` read, a missing field, an
// answer that is not JSON, a list shorter than its own count, a missing token, sha or repository:
// all `proven=false`, exit 0. Each read has its own timeout and all of them share one budget,
// both well inside the job's five minutes. Exit 2 is reserved for an argument this script does
// not know, so a typo in the workflow is red rather than quietly full. `gh` runs through
// `execFileSync` with an argv, never a shell string.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The one producer whose run counts as evidence: this repository's gate workflow. */
export const GATE_WORKFLOW = '.github/workflows/ci.yml'

/** The aggregator context `ci.yml` exposes; the branch rule requires the same name. */
const CHECK_NAME = 'all-ci-checks'

/** The only ref a proven push can land on. */
const MAIN_REF = 'refs/heads/main'

/** A full git object id, lowercase as the API prints it. */
const OBJECT_ID = /^[0-9a-f]{40}$/

/** `owner/name`, in the characters GitHub admits, so the endpoint path cannot walk elsewhere. */
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

/** Rows a list read asks for per page, and the pages it reads before giving up as not proven. */
const PER_PAGE = 100
const MAX_PAGES = 10

/** One read's timeout, and the budget every read shares; the job's own timeout is 5 minutes. */
const READ_TIMEOUT_MS = 30_000
const READS_BUDGET_MS = 180_000

const isSuite = value => Number.isSafeInteger(value) && value > 0

/**
 * The decision, with no I/O: `{ proven, reason }`.
 *
 * `heads` holds one row per pull-request head holding the pushed commit:
 * `{ headTree, gateSuite, gateJobs, checkSuites }`. `gateSuite` is the check suite of the newest
 * `ci.yml` pull-request run on that head (null when there is none), `gateJobs` the conclusions of
 * the `all-ci-checks` jobs in that run's latest attempt, and `checkSuites` the check suite of
 * every `all-ci-checks` check run on the head, whoever created it.
 */
export function decide({ event, ref, tree, heads }) {
  if (event !== 'push') {
    return { proven: false, reason: `event "${event ?? ''}" is never proven: only a push to main reads a pull request's run` }
  }
  if (ref !== MAIN_REF) {
    return { proven: false, reason: `ref "${ref ?? ''}" is not ${MAIN_REF}` }
  }
  if (typeof tree !== 'string' || !OBJECT_ID.test(tree)) {
    return { proven: false, reason: `the pushed tree "${String(tree ?? '')}" is not a 40-hex object id` }
  }
  const rows = (Array.isArray(heads) ? heads : []).filter(row => row !== null && typeof row === 'object' && row.headTree === tree)
  if (rows.length === 0) {
    return { proven: false, reason: `no pull-request head with tree ${tree}` }
  }
  for (const row of rows) {
    const suites = Array.isArray(row.checkSuites) ? row.checkSuites : []
    const foreign = suites.find(suite => !isSuite(row.gateSuite) || suite !== row.gateSuite)
    if (foreign !== undefined) {
      return {
        proven: false,
        reason:
          `a second producer: an ${CHECK_NAME} check run on tree ${tree} sits in check suite ${foreign ?? 'none'}, ` +
          `not in ${GATE_WORKFLOW}'s pull-request run (suite ${row.gateSuite ?? 'none'})`,
      }
    }
  }
  const passed = rows.find(
    row => isSuite(row.gateSuite) && Array.isArray(row.gateJobs) && row.gateJobs.length === 1 && row.gateJobs[0] === 'success',
  )
  if (passed !== undefined) {
    return { proven: true, reason: `a pull-request head with tree ${tree} passed ${CHECK_NAME} in ${GATE_WORKFLOW}'s run (suite ${passed.gateSuite})` }
  }
  const read = rows
    .map(row => (isSuite(row.gateSuite) ? `[${(Array.isArray(row.gateJobs) ? row.gateJobs : []).map(job => job ?? 'null').join(', ')}]` : 'no run'))
    .join(', ')
  return {
    proven: false,
    reason: `no ${GATE_WORKFLOW} pull-request run on tree ${tree} has one ${CHECK_NAME} job at success in its latest attempt (read: ${read})`,
  }
}

/** A `gh api` reader whose every read has a timeout, inside one budget shared by all of them. */
function makeReader() {
  const asked = Number(process.env.PR_PROVEN_READ_TIMEOUT_MS)
  const perRead = Number.isSafeInteger(asked) && asked > 0 && asked < READ_TIMEOUT_MS ? asked : READ_TIMEOUT_MS
  const deadline = Date.now() + READS_BUDGET_MS
  return endpoint => {
    const left = deadline - Date.now()
    if (left <= 0) throw new Error(`the reads ran past their ${READS_BUDGET_MS / 1000} s budget`)
    // Throws on a non-zero exit, a missing binary, or a read still running at its timeout.
    return execFileSync('gh', ['api', endpoint], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
      timeout: Math.min(perRead, left),
    })
  }
}

function parseJson(text, what) {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${what} is not JSON (${error instanceof Error ? error.message : String(error)})`, { cause: error })
  }
}

/** A commit's tree id, validated; throws on anything else. */
function treeOf(gh, repository, commit) {
  const tree = parseJson(gh(`repos/${repository}/git/commits/${commit}`), `commit ${commit}`)?.tree?.sha
  if (typeof tree !== 'string' || !OBJECT_ID.test(tree)) throw new Error(`commit ${commit} answered no tree id`)
  return tree
}

/**
 * Every row of a paged list: `key` names the array in each page (null when the page is the
 * array). A page shorter than `PER_PAGE` is the last; a list past `MAX_PAGES`, or shorter than
 * the `total_count` its pages state, throws.
 */
function readList(gh, endpoint, key, what) {
  const rows = []
  let stated = null
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = parseJson(gh(`${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=${PER_PAGE}&page=${page}`), `${what}, page ${page}`)
    const list = key === null ? body : body?.[key]
    if (!Array.isArray(list)) throw new Error(`${what}, page ${page}, is not a list`)
    if (key !== null && typeof body.total_count === 'number') stated = Math.max(stated ?? 0, body.total_count)
    rows.push(...list)
    if (list.length < PER_PAGE) {
      if (stated !== null && rows.length < stated) throw new Error(`${what} answered ${rows.length} of ${stated} rows`)
      return rows
    }
  }
  throw new Error(`${what} runs past ${MAX_PAGES} pages`)
}

/** One head's row for `decide`: its tree, and when the tree matches, its gate run and check suites. */
function readHead(gh, repository, head, tree) {
  const headTree = treeOf(gh, repository, head)
  if (headTree !== tree) return { headTree, gateSuite: null, gateJobs: [], checkSuites: [] }
  const runs = readList(
    gh,
    `repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${head}&event=pull_request`,
    'workflow_runs',
    `the ${GATE_WORKFLOW} runs of ${head}`,
  ).filter(run => run?.path === GATE_WORKFLOW && run?.event === 'pull_request' && run?.head_sha === head)
  let gate = null
  for (const run of runs) {
    if (!isSuite(run.id) || !isSuite(run.check_suite_id) || typeof run.created_at !== 'string') {
      throw new Error(`a ${GATE_WORKFLOW} run of ${head} lacks its id, check suite or creation time`)
    }
    if (gate === null || run.created_at > gate.created_at || (run.created_at === gate.created_at && run.id > gate.id)) gate = run
  }
  // `filter=latest` answers the jobs of the run's latest attempt, so a re-run decides.
  const jobs =
    gate === null ? [] : readList(gh, `repos/${repository}/actions/runs/${gate.id}/jobs?filter=latest`, 'jobs', `the jobs of run ${gate.id}`)
  const gateJobs = jobs
    .filter(job => job?.name === CHECK_NAME)
    .map(job => (typeof job.conclusion === 'string' ? job.conclusion : null))
  const checkSuites = readList(
    gh,
    `repos/${repository}/commits/${head}/check-runs?check_name=${CHECK_NAME}&filter=all`,
    'check_runs',
    `the ${CHECK_NAME} check runs of ${head}`,
  ).map(run => {
    if (run === null || typeof run !== 'object' || !('check_suite' in run)) throw new Error(`a check run of ${head} lacks its check suite`)
    return isSuite(run.check_suite?.id) ? run.check_suite.id : null
  })
  return { headTree, gateSuite: gate === null ? null : gate.check_suite_id, gateJobs, checkSuites }
}

/** The pushed tree and one row per pull-request head holding the pushed commit. */
function readEvidence(repository, sha) {
  const gh = makeReader()
  const tree = treeOf(gh, repository, sha)
  const pulls = readList(gh, `repos/${repository}/commits/${sha}/pulls`, null, 'the pull-request list')
  const heads = []
  for (const pull of pulls) {
    const head = pull?.head?.sha
    if (typeof head !== 'string' || !OBJECT_ID.test(head)) throw new Error('a pull request answered no head sha')
    if (!heads.includes(head)) heads.push(head)
  }
  return { tree, heads: heads.map(head => readHead(gh, repository, head, tree)) }
}

function parseArgs(argv) {
  const args = { sha: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--sha') {
      args.sha = argv[index + 1] ?? ''
      index += 1
    } else if (arg.startsWith('--sha=')) {
      args.sha = arg.slice('--sha='.length)
    } else {
      return { error: `unknown argument: ${arg}` }
    }
  }
  return args
}

/** Why the API is not asked at all, or null when it may be. */
function preconditionProblem(sha, repository, token) {
  if (typeof sha !== 'string' || !OBJECT_ID.test(sha)) return `the pushed sha "${sha ?? ''}" is not a 40-hex commit id`
  if (typeof repository !== 'string' || !REPOSITORY.test(repository) || repository.includes('..')) {
    return `GITHUB_REPOSITORY "${repository ?? ''}" is not owner/name`
  }
  if (typeof token !== 'string' || token === '') return 'GH_TOKEN is not set'
  return null
}

function main(argv) {
  const args = parseArgs(argv)
  if (args.error !== undefined) {
    process.stderr.write(`pr-proven: ${args.error}\nusage: node scripts/ci/pr-proven.mjs --sha <sha>\n`)
    return 2
  }
  const event = process.env.GITHUB_EVENT_NAME
  const ref = process.env.GITHUB_REF
  // The event and ref gate first, with no read: on any other trigger nothing is asked.
  let decision = decide({ event, ref, tree: '0'.repeat(40), heads: [] })
  if (event === 'push' && ref === MAIN_REF) {
    const problem = preconditionProblem(args.sha, process.env.GITHUB_REPOSITORY, process.env.GH_TOKEN)
    if (problem !== null) {
      decision = { proven: false, reason: problem }
    } else {
      try {
        const { tree, heads } = readEvidence(process.env.GITHUB_REPOSITORY, args.sha)
        decision = decide({ event, ref, tree, heads })
      } catch (error) {
        const detail = String(error?.stderr || error?.message || error).trim().split('\n')[0]
        decision = { proven: false, reason: `a read failed, so the full matrix runs: ${detail}` }
      }
    }
  }
  const line = `proven=${decision.proven}`
  process.stdout.write(`${line}\n`)
  process.stderr.write(`pr-proven: ${decision.reason}\n`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`)
  return 0
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2))
}
