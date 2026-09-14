#!/usr/bin/env node
// Throwaway repositories the hook rows are measured in.
//
// A hook row claims that a setup this engine emitted actually STOPS a tool call on a real client.
// That claim cannot be checked in this repository: its own `.claude/settings.json` is the setup a
// session is already running under, and pointing a deny hook at it would either brick the session
// or measure the session's configuration rather than a fresh install's. So every client gets its
// own disposable git repository under the OS temp directory, built the way a user builds one —
// `init`, `config set`, `sync`, `check` — with one user hook added and two files for it to decide
// about.
//
// Under the OS temp directory, and never under this repo: the leak gate walks tracked AND
// untracked-but-not-ignored files (`.stamity/learnings/leak-gate-scans-stamity-state-files.md`),
// so a fixture tree left inside the worktree would be walked by every gate run from then on.
//
// The hook itself is the evidence instrument. It appends one JSONL observation per call it is
// handed and exits 2 when the payload mentions the denied file, which is the exit code every
// client this engine emits for honours as a block (`src/hooks/scripts.ts`, `BLOCKING_EXIT_CODE`).
// The observation file is what the run reads: a model's prose about what it could read is a report
// of its own behaviour, and the hook's append-only log is the record of what the CLIENT did.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The file the hook refuses, by name. The prompt asks for it first, so a refusal is unmissable. */
export const DENIED_FILE = 'qa-denied.txt'

/** The file the hook allows. Read after the refusal, so one run produces both observations. */
export const ALLOWED_FILE = 'qa-allowed.txt'

/** Append-only JSONL the hook writes and the run reads. One line per tool call the hook saw. */
export const OBSERVATIONS_FILE = 'qa-observations.jsonl'

/** Repo-relative hooks directory the fixture configures through `config set hooks.userHooksDir`. */
export const HOOKS_DIR = 'qa-hooks'

/** Exit status that blocks the pending call. Mirrors `BLOCKING_EXIT_CODE` in `src/hooks/scripts.ts`. */
const BLOCKING_EXIT_CODE = 2

/**
 * The user hook, as generated text.
 *
 * Three properties it holds on purpose, because a hook that broke any of them would measure the
 * hook rather than the client: it decides from the PAYLOAD alone (whatever dialect the client
 * speaks, the denied file's name appears somewhere in the serialized call), it records every call
 * it sees rather than only the ones it refuses (a run where the hook never fired is then visibly
 * different from one where it fired and allowed), and it writes its log beside itself rather than
 * relative to the working directory the client happened to pick.
 *
 * `process.exitCode` rather than `process.exit`: stderr is a pipe when a client runs a hook, and
 * on macOS and the BSDs a pipe write is asynchronous — exiting immediately races the reason out of
 * the record. The engine's own guard takes the same care for the same reason.
 */
function decisionScript() {
  return `#!/usr/bin/env node
// QA instrument, written by scripts/qa/fixtures.mjs. Not a product hook.
//
// Records every tool call it is handed, and refuses the one that mentions ${DENIED_FILE}.
// The refusal is exit ${BLOCKING_EXIT_CODE} plus a reason on stderr — the block every client
// this engine emits for honours.

import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const LOG = fileURLToPath(new URL('../${OBSERVATIONS_FILE}', import.meta.url))
const DENIED = ${JSON.stringify(DENIED_FILE)}
const ALLOWED = ${JSON.stringify(ALLOWED_FILE)}

let raw = ''
try {
  raw = readFileSync(0, 'utf8')
} catch (error) {
  // No stdin is a real client shape (some events pass nothing), so the call is still recorded —
  // with the read failure named, so an empty payload and an unreadable one never look alike.
  raw = JSON.stringify({ qaStdinError: String(error && error.message ? error.message : error) })
}

let payload = {}
try {
  payload = JSON.parse(raw)
} catch {
  // An unparseable payload is still a call the hook saw. The raw text is scanned as-is below.
  payload = {}
}

const tool =
  typeof payload.tool_name === 'string' ? payload.tool_name
  : typeof payload.toolName === 'string' ? payload.toolName
  : typeof payload.tool === 'string' ? payload.tool
  : ''
const mentionsDenied = raw.includes(DENIED)
const mentionsAllowed = raw.includes(ALLOWED)
const decision = mentionsDenied ? 'denied' : mentionsAllowed ? 'allowed' : 'unmatched'

appendFileSync(
  LOG,
  JSON.stringify({
    at: new Date().toISOString(),
    tool,
    decision,
    mentionsDenied,
    mentionsAllowed,
    payloadBytes: raw.length,
  }) + '\\n',
)

if (decision === 'denied') {
  process.stderr.write(
    JSON.stringify({
      hook: 'qa-decision',
      blocked: true,
      permissionDecision: 'deny',
      permissionDecisionReason: 'QA instrument: ' + DENIED + ' is refused by this repository\\'s hook.',
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'QA instrument: ' + DENIED + ' is refused by this repository\\'s hook.',
      },
    }) + '\\n',
  )
  process.exitCode = ${BLOCKING_EXIT_CODE}
}
`
}

/** The hook declaration the engine's reader ingests: exec-form argv, repo-relative script. */
function decisionDeclaration() {
  return `${JSON.stringify(
    { hooks: [{ event: 'pre_tool_use', command: ['node', `${HOOKS_DIR}/decision.mjs`] }] },
    null,
    2,
  )}\n`
}

/** Run a command in the fixture, returning its captured output. Throws with the output attached. */
function run(cwd, file, args, env) {
  return execFileSync(file, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  })
}

/**
 * Build one fixture repository for `tool` and return where everything in it lives.
 *
 * Order is load-bearing. The hook script and its declaration are written BEFORE `sync`, because
 * the engine's hook reader refuses a declaration whose script does not exist on disk
 * (`src/hooks/userHooks.ts`, `MISSING_SCRIPT`) — a fixture that synced first would emit a client
 * config with no user hook in it and the run would measure nothing. `git init` and a commit come
 * first for the same class of reason: the hook lane judges an accepted command as code a reviewer
 * can read in a diff, and a fixture that is not a repository is not the shape a user has.
 *
 * Every step's captured output is returned. A `check` that warns is not a failure here — the run
 * records the transcript and reads the client's own behaviour for its verdict.
 */
export function createFixture({ tool, repoRoot, baseDir }) {
  const parent = baseDir ?? tmpdir()
  mkdirSync(parent, { recursive: true })
  const dir = mkdtempSync(join(parent, `stamity-qa-${tool}-`))
  const cli = join(repoRoot, 'dist', 'cli.js')
  const steps = []
  const step = (name, file, args, env) => {
    steps.push({ name, command: [file, ...args].join(' '), output: run(dir, file, args, env) })
  }

  // A fixture repo with no identity cannot commit, and the operator's own git identity is not this
  // harness's to borrow — the fixture is disposable and its authorship means nothing.
  step('git init', 'git', ['init', '--quiet', '--initial-branch', 'main'])
  step('git config user.email', 'git', ['config', 'user.email', 'qa@invalid.local'])
  step('git config user.name', 'git', ['config', 'user.name', 'stamity qa harness'])

  mkdirSync(join(dir, HOOKS_DIR), { recursive: true })
  writeFileSync(join(dir, HOOKS_DIR, 'decision.mjs'), decisionScript(), 'utf8')
  writeFileSync(join(dir, HOOKS_DIR, 'decision.json'), decisionDeclaration(), 'utf8')
  writeFileSync(
    join(dir, DENIED_FILE),
    'This file is refused by the QA hook. Reading it is the denial the row measures.\n',
    'utf8',
  )
  writeFileSync(
    join(dir, ALLOWED_FILE),
    'This file is allowed by the QA hook. Reading it is the allowance the row measures.\n',
    'utf8',
  )
  step('git add', 'git', ['add', '-A'])
  step('git commit', 'git', ['commit', '--quiet', '-m', 'qa fixture'])

  step('stamity init', process.execPath, [cli, 'init', '-y', '--tools', tool])
  step('stamity config set', process.execPath, [cli, 'config', 'set', 'hooks.userHooksDir', HOOKS_DIR])
  step('stamity sync', process.execPath, [cli, 'sync', '-y'])
  step('stamity check', process.execPath, [cli, 'check'])

  return {
    dir,
    tool,
    steps,
    hookScript: join(dir, HOOKS_DIR, 'decision.mjs'),
    hookDeclaration: join(dir, HOOKS_DIR, 'decision.json'),
    observations: join(dir, OBSERVATIONS_FILE),
    deniedFile: join(dir, DENIED_FILE),
    allowedFile: join(dir, ALLOWED_FILE),
  }
}

/** Every observation the fixture's hook recorded, oldest first. Absent file means it never fired. */
export function readObservations(path) {
  let raw
  try {
    raw = existsSync(path) ? readFileSync(path, 'utf8') : ''
  } catch (error) {
    // An unreadable log is reported as no observations plus the reason; the caller turns that into
    // a `failed` row rather than a pass, which is the only safe direction here.
    return { observations: [], error: String(error && error.message ? error.message : error) }
  }
  const observations = []
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue
    try {
      observations.push(JSON.parse(line))
    } catch {
      // A truncated final line means the hook was killed mid-write. Recorded as a malformed
      // observation rather than dropped, so a partial run cannot read as a clean one.
      observations.push({ decision: 'malformed', raw: line })
    }
  }
  return { observations }
}
