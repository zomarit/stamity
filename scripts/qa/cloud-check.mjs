#!/usr/bin/env node
// The maintainer's cloud checks, scripted (REQ-PROVE-041): the QA form's person rows P1 (Claude
// Code's cloud) and P2 (Cursor's cloud agents), and P3 (Copilot), which reads not-run for want of a
// Copilot cloud-agent account.
//
// A cloud run cannot be measured from this machine: it runs on the vendor's, under the person's
// account, for a night. What CAN be scripted is everything around it. `setup` builds a scratch
// repository the way a user builds one (the QA fixture, `scripts/qa/fixtures.mjs`), adds a small
// plan and a run contract, creates a PUBLIC repository for it by REST, pushes `main` with one
// baseline tag naming `main`'s sha, and prints the start commands. In the morning `verify` reads by
// REST only what the run must have left — one open draft pull request, unmerged, whose body is the
// morning list with a `Default applied:` line, the run's record reading `Mode: unattended` on its
// branch — and that `main` and the tags did not move. `teardown` prints the deletion and runs
// nothing: deleting a repository is a person's act.
//
// The baseline tag is how `verify` knows `main`'s sha with nothing but the repository's name: the
// sha is recorded IN the repository, so a check run on another machine the next morning needs no
// file this one wrote. A run that moved `main` or touched a tag fails either way.
//
// Every REST call goes through one injected function, `rest({ method, path, body })` →
// `{ status, json }`, so the suite (`test/qa/cloudCheck.test.ts`) proves every branch with no
// network. The real one (`githubRest`) talks to api.github.com with `GH_TOKEN`, `GITHUB_TOKEN` or
// `gh auth token`; `verify` reads a public repository without a token too.
//
// Starting a cloud run is the one client-touching step, and it is the person's: under the machine
// lock, never while an eval run is running (the start lines say so). `setup` itself starts no
// client: its fixture's `stamity check` runs with `STAMITY_NO_CLIENT_PROBE=1`.
//
// Usage:
//   node scripts/qa/cloud-check.mjs setup --owner <login> [--clients claude,cursor] [--dir <tmp>]
//   node scripts/qa/cloud-check.mjs verify --repo <owner/name> --client <claude|cursor|copilot> [--out <path>]
//   node scripts/qa/cloud-check.mjs teardown --repo <owner/name> [--repo <owner/name> ...]

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFixture } from './fixtures.mjs'

const SELF = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(SELF, '..', '..', '..')

/** The clients a cloud row can name; `setup`'s default is the two the maintainer runs. */
export const CLOUD_CLIENTS = ['claude', 'cursor', 'copilot']
const DEFAULT_CLIENTS = ['claude', 'cursor']

/** The lightweight tag `setup` pushes at `main`'s sha: the baseline `verify` reads by REST. */
export const BASE_TAG = 'stamity-cloud-check-base'

/** Where `setup` writes the run contract and the plan in the scratch repository. */
export const CONTRACT_PATH = 'run-contract.yml'
export const PLAN_PATH = 'docs/plans/001-cloud-check.md'

/**
 * The morning list's sections, in order (`src/runs/morning.ts`, `MORNING_SECTIONS`). Restated
 * because this contributor tool imports nothing from the engine's TypeScript; the suite holds the
 * two lists equal, so a renamed section fails there before a morning reads it wrong.
 */
export const MORNING_SECTIONS = [
  'For you to check',
  'Decisions',
  'Prerequisites',
  "Person's calls held",
  'Not done:',
  'How to answer',
]

/** The three answers `verify` prints. */
export const VERDICTS = ['pass', 'failed', 'not-run']

/** The marker that ends a body the run wrote (`src/runs/pullRequest.ts`, `runMarker`). */
const RUN_MARKER = /<!-- stamity:run ([0-9]{4}-[0-9]{2}-[0-9]{2}_[a-z0-9-]+) -->/

/** An owner or a repository name: what GitHub allows, never a path part of its own. */
const NAME_PART = /^[A-Za-z0-9._-]+$/

export const USAGE =
  'Usage: node scripts/qa/cloud-check.mjs setup --owner <login> [--clients claude,cursor] [--dir <tmp>]\n' +
  '       node scripts/qa/cloud-check.mjs verify --repo <owner/name> --client <claude|cursor|copilot> [--out <path>]\n' +
  '       node scripts/qa/cloud-check.mjs teardown --repo <owner/name> [--repo <owner/name> ...]'

function isNamePart(value) {
  return typeof value === 'string' && NAME_PART.test(value) && value !== '.' && value !== '..'
}

/** `owner/name` split and checked, or a thrown usage error naming `--repo`. */
function splitRepo(repo) {
  const parts = typeof repo === 'string' ? repo.split('/') : []
  if (parts.length !== 2 || !parts.every(isNamePart)) {
    throw new Error(`--repo ${JSON.stringify(repo)} is not <owner>/<name>.\n${USAGE}`)
  }
  return { owner: parts[0], name: parts[1] }
}

function checkClient(client) {
  if (!CLOUD_CLIENTS.includes(client)) {
    throw new Error(`--client ${JSON.stringify(client)} is not one of ${CLOUD_CLIENTS.join(', ')}.\n${USAGE}`)
  }
}

/** The run id a body's marker names, or null. */
export function runIdFromBody(body) {
  return RUN_MARKER.exec(typeof body === 'string' ? body : '')?.[1] ?? null
}

/** A draft as a run leaves one: GitHub's draft flag, or a `[DRAFT]` title where the repository takes none. */
function isDraft(pr) {
  return pr.draft === true || (typeof pr.title === 'string' && pr.title.startsWith('[DRAFT]'))
}

/** The record path a pull request's marker points at, or null. */
export function recordPathFor(pr) {
  const runId = runIdFromBody(pr?.body)
  return runId === null ? null : `.stamity/runs/${runId}/record.md`
}

const short = (sha) => (typeof sha === 'string' ? sha.slice(0, 12) : String(sha))

/**
 * The verdict over what the REST reads returned. Pure.
 *
 * `prs` is the repository's pull requests (REST's list shape: `number`, `state`, `draft`, `title`,
 * `merged_at`, `body`, `head.ref`); `files` maps a path on the pull request's branch to its text;
 * `refs` is `{ main, tags: [{ name, sha }] }`. `main` and the tags are read first: a run that moved
 * them fails whatever its pull request looks like. Then exactly one pull request, open, a draft and
 * unmerged; its body carrying every morning-list section, a `Default applied:` line and the run's
 * marker; and the record that marker names reading `Mode: unattended`.
 */
export function verdictForCloud(prs, files, refs) {
  const failed = (reason) => ({ verdict: 'failed', reason })
  const tags = Array.isArray(refs?.tags) ? refs.tags : []
  const base = tags.find((tag) => tag.name === BASE_TAG)
  if (base === undefined) {
    return failed(`the baseline tag ${BASE_TAG} is gone: a tag was deleted, or setup did not make this repository`)
  }
  const others = tags.filter((tag) => tag.name !== BASE_TAG).map((tag) => tag.name)
  if (others.length > 0) return failed(`tags changed: ${others.join(', ')} added since setup`)
  if (refs?.main !== base.sha) return failed(`main moved: ${short(base.sha)} at setup, ${short(refs?.main ?? 'none')} now`)

  const list = Array.isArray(prs) ? prs : []
  const merged = list.filter((pr) => pr.merged_at !== null && pr.merged_at !== undefined)
  if (merged.length > 0) return failed(`merged: ${merged.map((pr) => `#${pr.number}`).join(', ')}`)
  const open = list.filter((pr) => pr.state === 'open')
  if (open.length === 0) {
    if (list.length === 0) return { verdict: 'not-run', reason: 'no PR' }
    return failed(`closed unmerged, none open: ${list.map((pr) => `#${pr.number}`).join(', ')}`)
  }
  if (open.length > 1) return failed(`duplicate: ${open.length} open pull requests, ${open.map((pr) => `#${pr.number}`).join(', ')}`)
  const [pr] = open
  if (!isDraft(pr)) return failed(`#${pr.number} is no longer a draft`)

  const body = typeof pr.body === 'string' ? pr.body : ''
  const headings = new Set(body.split(/\r?\n/).map((line) => line.trimEnd()))
  const missing = MORNING_SECTIONS.filter((name) => !headings.has(`## ${name}`))
  if (missing.length > 0) return failed(`#${pr.number}'s body lacks the morning list's ${missing.map((name) => `"${name}"`).join(', ')}`)
  if (!/Default applied:/.test(body)) return failed(`#${pr.number}'s body carries no Default applied: line`)
  const path = recordPathFor(pr)
  if (path === null) return failed(`#${pr.number}'s body carries no run marker, so no record can be read`)
  const record = files?.[path]
  if (typeof record !== 'string') return failed(`${path} is not on #${pr.number}'s branch`)
  if (!/^Mode:[ \t]*unattended[ \t]*$/m.test(record)) return failed(`${path} does not read Mode: unattended`)

  return {
    verdict: 'pass',
    reason:
      `#${pr.number}: one open draft, unmerged; the morning list's sections and a Default applied: line; ` +
      `${path} reads Mode: unattended; main and the tags unchanged`,
  }
}

/** `encodeURIComponent` for a query value. */
const query = (value) => encodeURIComponent(value)

/**
 * Every REST read `verify` makes, by GET only: the pull requests, `main`, the tags, and the record
 * the single open pull request's marker names. A read answered with anything but 2xx is
 * `{ notRun }` naming it; a record answered 404 is simply absent, which the verdict fails.
 */
export async function readCloud({ repo, rest }) {
  const { owner, name } = splitRepo(repo)
  const at = `/repos/${owner}/${name}`
  const get = async (what, path) => {
    const answer = await rest({ method: 'GET', path })
    return { what, ...answer }
  }
  const pulls = await get('the pull request list', `${at}/pulls?state=all&per_page=100`)
  if (pulls.status !== 200) return { notRun: `${pulls.what} read answered HTTP ${pulls.status}` }
  const mainRef = await get("main's ref", `${at}/git/ref/heads/main`)
  if (mainRef.status !== 200) return { notRun: `${mainRef.what} read answered HTTP ${mainRef.status}` }
  const tagRefs = await get('the tag list', `${at}/git/matching-refs/tags`)
  if (tagRefs.status !== 200) return { notRun: `${tagRefs.what} read answered HTTP ${tagRefs.status}` }

  const prs = Array.isArray(pulls.json) ? pulls.json : []
  const refs = {
    main: mainRef.json?.object?.sha ?? null,
    tags: (Array.isArray(tagRefs.json) ? tagRefs.json : []).map((ref) => ({
      name: String(ref.ref ?? '').replace(/^refs\/tags\//, ''),
      sha: ref.object?.sha ?? null,
    })),
  }
  const files = {}
  const open = prs.filter((pr) => pr.state === 'open')
  const path = open.length === 1 ? recordPathFor(open[0]) : null
  const branch = open[0]?.head?.ref
  if (path !== null && typeof branch === 'string') {
    const answer = await get(path, `${at}/contents/${path}?ref=${query(branch)}`)
    if (answer.status === 200 && typeof answer.json?.content === 'string') {
      files[path] = Buffer.from(answer.json.content, answer.json.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8')
    } else if (answer.status !== 404) {
      return { notRun: `${path} read answered HTTP ${answer.status}` }
    }
  }
  return { prs, files, refs }
}

/**
 * Read one scratch repository and decide its row. The result is what `--out` writes and what
 * `scripts/qa/run.mjs --cloud` reads: `{ check, client, repo, verdict, reason, readAt }`.
 */
export async function verify({ repo, client, rest, out, now = () => new Date() }) {
  splitRepo(repo)
  checkClient(client)
  const read = await readCloud({ repo, rest })
  const decided = read.notRun === undefined ? verdictForCloud(read.prs, read.files, read.refs) : { verdict: 'not-run', reason: read.notRun }
  const result = { check: 'cloud-check', client, repo, verdict: decided.verdict, reason: decided.reason, readAt: now().toISOString() }
  if (out !== undefined) {
    mkdirSync(dirname(resolve(out)), { recursive: true })
    writeFileSync(resolve(out), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  }
  return result
}

/** The one line `verify` prints: `pass|failed|not-run (<reason>)`. */
export function formatVerdict(result) {
  return `${result.verdict} (${result.reason})`
}

/** The scratch repository's `package.json`: a test script the plan's unit runs. */
function packageText() {
  return `${JSON.stringify({ name: 'stamity-cloud-check', private: true, type: 'module', scripts: { test: 'node --test' } }, null, 2)}\n`
}

/** The plan the cloud run executes: one small unit the ready check passes. */
export function planText({ stamp, date }) {
  return [
    '---',
    'id: cloud-check-01',
    'intent: feature',
    `stamp: ${stamp} ${date}`,
    'reads: [package.json]',
    '---',
    '',
    '# Cloud check: a greeting',
    '',
    '## Context',
    '',
    "A scratch repository for the maintainer's cloud check. The run adds one small function and its test,",
    'and ends on a draft pull request whose body is the morning list.',
    '',
    '## Spec delta',
    '',
    '### REQ-GREET-001 — Greet by name (ADDED)',
    'Given a name, Then `greet(name)` returns `Hello, <name>!`.',
    '',
    '## Units',
    '',
    '### u1-greet — the greeting',
    '',
    '| Field | Content |',
    '|---|---|',
    '| `id` | u1-greet |',
    '| `requirements` | REQ-GREET-001 |',
    '| `files` | new `src/greet.mjs`, new `test/greet.test.mjs` |',
    '| `interfaces` | `greet(name: string): string` |',
    "| `testCriteria` | `greet('Ada')` → `Hello, Ada!` |",
    '| `edgeCases` | an empty name → `Hello, there!` |',
    '| `depends_on` | none |',
    '| `verify` | `node --test test/greet.test.mjs` |',
    '',
    '## Risks',
    '',
    '- **Minor** — none beyond the scratch repository. Mitigation: it is deleted after the check.',
    '',
    '## Open questions',
    '',
    'None.',
    '',
  ].join('\n')
}

/** The run contract the cloud run starts under (`src/runs/runContract.ts`). */
export function contractText({ base, stopBy, answerer }) {
  return [
    'run-contract: 1',
    `plan: ${PLAN_PATH}`,
    `base: ${base}`,
    'acceptance: |',
    '  `greet` returns the greeting its plan names, its test passes, and the run ends on one draft',
    '  pull request whose body is the morning list.',
    'scope:',
    '  in: [src/greet.mjs, test/greet.test.mjs]',
    `  out: [${CONTRACT_PATH}, package.json]`,
    'prerequisites: []',
    'budget:',
    `  stop-by: "${stopBy}"`,
    '  max-units: 1',
    `answerer: "@${answerer}"`,
    'preview: stop',
    'move: off',
    '',
  ].join('\n')
}

/** Is `candidate` outside `root`? A cross-drive `relative()` answers an absolute path (`run.mjs`, M5). */
function isOutsideRoot(root, candidate) {
  const rel = relative(root, candidate)
  return rel.startsWith('..') || isAbsolute(rel)
}

/** A UTC stamp for repository names: `YYYYMMDD-HHMM`. */
function nameStamp(date) {
  const iso = date.toISOString()
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`
}

/** The real git boundary: one call, its stdout. */
export function realGit(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/** The client's start surface, as the start line names it. */
const START_SURFACE = {
  claude: "Claude Code's cloud (a new cloud session on the repository)",
  cursor: "Cursor's cloud agents (a new background agent on the repository)",
  copilot: "Copilot's cloud agent (an issue or task assigned to it)",
}

/**
 * Build, create and push one scratch repository per client, and print how to start each run.
 *
 * Refuses a `--dir` inside this checkout before any call: a fixture tree there would be walked by
 * every later gate run. The fixture is built with `STAMITY_NO_CLIENT_PROBE=1`, so no client starts
 * on this machine. The only writes outside the scratch folder are the repository's creation (one
 * REST POST) and one push of `main` and the baseline tag, never forced.
 */
export async function setup({
  owner,
  clients = DEFAULT_CLIENTS,
  dir,
  rest,
  git = realGit,
  buildFixture = createFixture,
  print = (line) => process.stdout.write(`${line}\n`),
  now = () => new Date(),
  repoRoot = REPO_ROOT,
}) {
  if (!isNamePart(owner)) throw new Error(`--owner ${JSON.stringify(owner)} is not a GitHub login.\n${USAGE}`)
  if (!Array.isArray(clients) || clients.length === 0) throw new Error(`--clients names no client.\n${USAGE}`)
  for (const client of clients) checkClient(client)
  if (new Set(clients).size !== clients.length) throw new Error('--clients names a client twice')
  const parent = dir === undefined ? mkdtempSync(join(tmpdir(), 'stamity-cloud-check-')) : resolve(dir)
  if (!isOutsideRoot(repoRoot, parent)) {
    throw new Error(`--dir ${parent} is inside this repository; a scratch repository lives outside every checkout.`)
  }
  mkdirSync(parent, { recursive: true })

  const user = await rest({ method: 'GET', path: '/user' })
  if (user.status !== 200 || typeof user.json?.login !== 'string') {
    throw new Error(`reading the signed-in account answered HTTP ${user.status}; set GH_TOKEN or run \`gh auth login\``)
  }
  const createPath = user.json.login === owner ? '/user/repos' : `/orgs/${owner}/repos`

  const started = now()
  const date = started.toISOString().slice(0, 10)
  const stopBy = new Date(started.getTime() + 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const repos = []
  /* oxlint-disable no-await-in-loop -- One repository at a time: a failed creation or push stops before the next is made. */
  for (const client of clients) {
    const previous = process.env.STAMITY_NO_CLIENT_PROBE
    process.env.STAMITY_NO_CLIENT_PROBE = '1'
    let fixture
    try {
      fixture = buildFixture({ tool: client, repoRoot, baseDir: parent })
    } finally {
      if (previous === undefined) delete process.env.STAMITY_NO_CLIENT_PROBE
      else process.env.STAMITY_NO_CLIENT_PROBE = previous
    }
    const at = fixture.dir
    const commit = (message) => git(at, ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', message])

    // The setup the fixture emitted, with the package the plan's unit tests under, is the stamp
    // and the contract's base: the plan reads `package.json`, so it must not move after the stamp.
    writeFileSync(join(at, 'package.json'), packageText(), 'utf8')
    git(at, ['add', '-A'])
    commit('cloud check: the stamity setup')
    const base = git(at, ['rev-parse', 'HEAD']).trim()

    mkdirSync(join(at, 'docs', 'plans'), { recursive: true })
    writeFileSync(join(at, ...PLAN_PATH.split('/')), planText({ stamp: base, date }), 'utf8')
    writeFileSync(join(at, CONTRACT_PATH), contractText({ base, stopBy, answerer: owner }), 'utf8')
    git(at, ['add', '--', PLAN_PATH, CONTRACT_PATH])
    commit('cloud check: the plan and the run contract')
    const mainSha = git(at, ['rev-parse', 'HEAD']).trim()
    git(at, ['-c', 'tag.gpgsign=false', 'tag', BASE_TAG, mainSha])

    const name = `stamity-cloud-${client}-${nameStamp(started)}`
    const created = await rest({
      method: 'POST',
      path: createPath,
      body: { name, private: false, description: `Stamity cloud check (${client}); a scratch repository, deleted after the check` },
    })
    if (created.status !== 201 || typeof created.json?.clone_url !== 'string') {
      throw new Error(`creating ${owner}/${name} answered HTTP ${created.status}; nothing was pushed`)
    }
    const full = typeof created.json.full_name === 'string' ? created.json.full_name : `${owner}/${name}`
    try {
      git(at, ['remote', 'add', 'origin', created.json.clone_url])
      git(at, ['push', 'origin', 'refs/heads/main', `refs/tags/${BASE_TAG}`])
    } catch (error) {
      throw new Error(`pushing to ${full} failed (${error.message}); the repository exists: remove it with \`gh repo delete ${full}\``, { cause: error })
    }
    repos.push({ client, repo: full, url: created.json.html_url ?? null, dir: at, mainSha })
  }
  /* oxlint-enable no-await-in-loop */

  print('[cloud-check] scratch repositories ready:')
  for (const entry of repos) {
    print(`  ${entry.client}: ${entry.repo} — main ${entry.mainSha} (tag ${BASE_TAG}); local copy ${entry.dir}`)
  }
  print('')
  print('Before each start: protect main with no bypass; hold the machine lock; no eval run may be running.')
  for (const entry of repos) {
    print(`Start (${entry.client}): in ${START_SURFACE[entry.client]} on ${entry.repo}, send:`)
    print(`  /st-work --unattended ${PLAN_PATH} (run contract: ${CONTRACT_PATH})`)
    if (entry.client === 'claude') print('  P1: answer its morning question no sooner than eight hours after the start.')
  }
  print('')
  for (const entry of repos) {
    print(`Morning (${entry.client}): node scripts/qa/cloud-check.mjs verify --repo ${entry.repo} --client ${entry.client} --out <evidence-dir>/cloud-${entry.client}.json`)
  }
  for (const entry of repos) print(`Afterwards: node scripts/qa/cloud-check.mjs teardown --repo ${entry.repo}`)
  return { repos }
}

/** The lines `teardown` prints. It runs nothing: deleting a repository is a person's act. */
export function teardownLines(repos) {
  return [
    '[cloud-check] teardown runs nothing. To delete each scratch repository, run it yourself:',
    ...repos.map((repo) => `  gh repo delete ${repo}`),
  ]
}

/** A token for the real REST function: the environment's, else `gh auth token`, else none. */
function tokenFromEnvironment() {
  const fromEnv = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (fromEnv) return fromEnv
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined
  } catch {
    return undefined
  }
}

/** The real REST boundary: api.github.com over `fetch`. The suite never builds one. */
export function githubRest({ token = tokenFromEnvironment(), fetchImpl = globalThis.fetch } = {}) {
  return async ({ method, path, body }) => {
    const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'stamity-cloud-check' }
    if (token !== undefined) headers.authorization = `Bearer ${token}`
    if (body !== undefined) headers['content-type'] = 'application/json'
    const response = await fetchImpl(`https://api.github.com${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    let json
    try {
      json = text === '' ? null : JSON.parse(text)
    } catch {
      // A body that is not JSON (a proxy's HTML page) carries nothing the reads use; the status decides.
      json = null
    }
    return { status: response.status, json }
  }
}

/** `<command> --flag value …` over argv; `--repo` repeats. */
export function parseArgs(argv) {
  const [command, ...rest] = argv
  const options = { command, repos: [] }
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]
    const next = rest[i + 1]
    const value = () => {
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} takes a value.\n${USAGE}`)
      i += 1
      return next
    }
    if (arg === '--owner') options.owner = value()
    else if (arg === '--clients') options.clients = value().split(',').filter((client) => client !== '')
    else if (arg === '--dir') options.dir = value()
    else if (arg === '--repo') options.repos.push(value())
    else if (arg === '--client') options.client = value()
    else if (arg === '--out') options.out = value()
    else throw new Error(`Unknown option ${arg}.\n${USAGE}`)
  }
  return options
}

/**
 * The command line. Returns the exit code: 0 for a done setup, a `pass` or a printed teardown; 1
 * for a `failed` or `not-run` verdict or a failed step; 2 for a usage error.
 */
export async function main(argv, deps = {}) {
  const print = deps.print ?? ((line) => process.stdout.write(`${line}\n`))
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    return 2
  }
  if (options.command === 'teardown') {
    if (options.repos.length === 0) {
      process.stderr.write(`teardown needs --repo.\n${USAGE}\n`)
      return 2
    }
    try {
      for (const repo of options.repos) splitRepo(repo)
    } catch (error) {
      process.stderr.write(`${error.message}\n`)
      return 2
    }
    for (const line of teardownLines(options.repos)) print(line)
    return 0
  }
  if (options.command === 'verify') {
    if (options.repos.length !== 1 || options.client === undefined) {
      process.stderr.write(`verify needs one --repo and --client.\n${USAGE}\n`)
      return 2
    }
    const result = await verify({ repo: options.repos[0], client: options.client, rest: deps.rest ?? githubRest(), out: options.out })
    print(formatVerdict(result))
    return result.verdict === 'pass' ? 0 : 1
  }
  if (options.command === 'setup') {
    await setup({
      owner: options.owner,
      ...(options.clients === undefined ? {} : { clients: options.clients }),
      ...(options.dir === undefined ? {} : { dir: options.dir }),
      rest: deps.rest ?? githubRest(),
      ...(deps.git === undefined ? {} : { git: deps.git }),
      print,
    })
    return 0
  }
  process.stderr.write(`${USAGE}\n`)
  return 2
}

if (process.argv[1] === SELF) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (error) => {
      process.stderr.write(`[cloud-check] ${error.message}\n`)
      process.exitCode = 1
    },
  )
}
