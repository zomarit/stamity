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
// whose HEAD carries the same tree and whose `all-ci-checks` check run, created by the GitHub
// Actions app, concluded `success`. The tree is compared rather than the commit, because a
// fast-forward and a rebase merge of an up-to-date branch both land the pull request's tree under
// new or identical commits; a branch that was behind lands a tree no pull-request run tested, and
// no row matches.
//
// The check run's producer is the trust boundary. Any integration holding `checks: write` can
// create a check run named `all-ci-checks`, and the check-runs read does not filter by producer,
// so only a run whose `app.slug` is `github-actions` is evidence. The workflow run's conclusion is
// never read: the advisory `supply-chain` lane can be red beside a green gate.
//
// It fails open to full CI and never red. A failed `gh` read, a missing field, an answer that is
// not JSON, a missing token, sha or repository: all `proven=false`, exit 0. Exit 2 is reserved for
// an argument this script does not know, so a typo in the workflow is red rather than quietly full.
// `gh` runs through `execFileSync` with an argv, never a shell string.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The one app whose check runs count as evidence: GitHub Actions itself. */
export const TRUSTED_CHECK_APP = 'github-actions'

/** The aggregator context `ci.yml` exposes; the branch rule requires the same name. */
const CHECK_NAME = 'all-ci-checks'

/** The only ref a proven push can land on. */
const MAIN_REF = 'refs/heads/main'

/** A full git object id, lowercase as the API prints it. */
const OBJECT_ID = /^[0-9a-f]{40}$/

/** `owner/name`, in the characters GitHub admits, so the endpoint path cannot walk elsewhere. */
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

/**
 * The decision, with no I/O: `{ proven, reason }`.
 *
 * `prRuns` holds one row per check run read: `{ headTree, checkConclusion, checkApp }`, where
 * `checkApp` is the run's `app.slug` (null when the run carries none).
 */
export function decide({ event, ref, tree, prRuns }) {
  if (event !== 'push') {
    return { proven: false, reason: `event "${event ?? ''}" is never proven: only a push to main reads a pull request's run` }
  }
  if (ref !== MAIN_REF) {
    return { proven: false, reason: `ref "${ref ?? ''}" is not ${MAIN_REF}` }
  }
  if (typeof tree !== 'string' || !OBJECT_ID.test(tree)) {
    return { proven: false, reason: `the pushed tree "${String(tree ?? '')}" is not a 40-hex object id` }
  }
  const rows = (Array.isArray(prRuns) ? prRuns : []).filter(row => row !== null && typeof row === 'object' && row.headTree === tree)
  if (rows.length === 0) {
    return { proven: false, reason: `no ${CHECK_NAME} run on a pull-request head with tree ${tree}` }
  }
  if (rows.some(row => row.checkApp === TRUSTED_CHECK_APP && row.checkConclusion === 'success')) {
    return { proven: true, reason: `a pull-request head with tree ${tree} passed ${CHECK_NAME} under ${TRUSTED_CHECK_APP}` }
  }
  const read = rows.map(row => `${row.checkConclusion ?? 'null'} by ${row.checkApp ?? 'no app'}`).join(', ')
  const foreign = rows.find(row => row.checkConclusion === 'success' && row.checkApp !== TRUSTED_CHECK_APP)
  if (foreign !== undefined) {
    return {
      proven: false,
      reason:
        `a successful ${CHECK_NAME} run on tree ${tree} came from ${foreign.checkApp === null || foreign.checkApp === undefined ? 'no app' : `app "${foreign.checkApp}"`}, ` +
        `and only ${TRUSTED_CHECK_APP} runs are evidence (read: ${read})`,
    }
  }
  return { proven: false, reason: `no ${CHECK_NAME} run by ${TRUSTED_CHECK_APP} on tree ${tree} concluded success (read: ${read})` }
}

/** One `gh api` read; stdout as text. Throws on a non-zero exit or a missing binary. */
function ghApi(args) {
  return execFileSync('gh', ['api', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  })
}

/** A tree id read through `--jq .tree.sha`, validated; throws on anything else. */
function treeOf(repository, commit) {
  const tree = ghApi([`repos/${repository}/git/commits/${commit}`, '--jq', '.tree.sha']).trim()
  if (!OBJECT_ID.test(tree)) throw new Error(`commit ${commit} answered no tree id`)
  return tree
}

function parseJson(text, what) {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${what} is not JSON (${error instanceof Error ? error.message : String(error)})`, { cause: error })
  }
}

/** The pushed tree and one row per `all-ci-checks` check run on each pull-request head. */
function readEvidence(repository, sha) {
  const tree = treeOf(repository, sha)
  const pulls = parseJson(ghApi([`repos/${repository}/commits/${sha}/pulls`]), 'the pull-request list')
  if (!Array.isArray(pulls)) throw new Error('the pull-request list is not an array')
  const heads = []
  for (const pull of pulls) {
    const head = pull?.head?.sha
    if (typeof head !== 'string' || !OBJECT_ID.test(head)) throw new Error('a pull request answered no head sha')
    if (!heads.includes(head)) heads.push(head)
  }
  const prRuns = []
  for (const head of heads) {
    const headTree = treeOf(repository, head)
    const runs = parseJson(
      ghApi([
        `repos/${repository}/commits/${head}/check-runs?check_name=${CHECK_NAME}`,
        '--jq',
        '[.check_runs[] | {conclusion, app: .app.slug}]',
      ]),
      `the check runs of ${head}`,
    )
    if (!Array.isArray(runs)) throw new Error(`the check runs of ${head} are not an array`)
    for (const run of runs) {
      if (run === null || typeof run !== 'object' || !('conclusion' in run) || !('app' in run)) {
        throw new Error(`a check run of ${head} lacks its conclusion or app`)
      }
      prRuns.push({
        headTree,
        checkConclusion: typeof run.conclusion === 'string' ? run.conclusion : null,
        checkApp: typeof run.app === 'string' ? run.app : null,
      })
    }
  }
  return { tree, prRuns }
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
  let decision = decide({ event, ref, tree: '0'.repeat(40), prRuns: [] })
  if (event === 'push' && ref === MAIN_REF) {
    const problem = preconditionProblem(args.sha, process.env.GITHUB_REPOSITORY, process.env.GH_TOKEN)
    if (problem !== null) {
      decision = { proven: false, reason: problem }
    } else {
      try {
        const { tree, prRuns } = readEvidence(process.env.GITHUB_REPOSITORY, args.sha)
        decision = decide({ event, ref, tree, prRuns })
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
