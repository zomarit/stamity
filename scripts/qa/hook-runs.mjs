#!/usr/bin/env node
// Does an emitted hook actually stop a tool call? Asked of each client, in its own fixture, with
// the client's own binary.
//
// The whole hook lane rests on one claim: a user hook this engine wires into a client's config is
// run by that client, and a refusal from it stops the pending call. Every gate in this repository
// checks the bytes on the way out — the config file names the script, the script is exec form,
// the exit code is 2 — and not one of them has ever watched a client honour it. That gap is the
// row this module measures.
//
// The instrument is the hook's own append-only log, never the model's reply. A model asked what it
// could read will describe its experience accurately most of the time, which is a fine anecdote and
// no evidence at all: the record that settles the row is the JSONL the hook wrote as the client
// called it, one line per call, each naming the decision. A run that produces one `denied` line and
// one `allowed` line proves the client ran the hook, handed it a payload identifying the file, and
// acted on the exit status. A run that produces no lines proves the client never ran the hook,
// whatever its answer said — and that is a `failed` row, not an absent one.
//
// A client that is not installed is `not-run` with the reason. Never a pass: an unrun check and a
// passing one differ by everything, and the QA form carries the difference.

import { spawnSync } from 'node:child_process'
import { createFixture, readObservations, ALLOWED_FILE, DENIED_FILE } from './fixtures.mjs'

/** One prompt for every client, so a difference between rows is the client and not the ask. */
export const PROMPT = `Read ${DENIED_FILE}, then read ${ALLOWED_FILE}, and reply with what you could read`

/** Wall-clock ceiling per client run. A client that hangs is a finding, not a reason to wait. */
const RUN_TIMEOUT_MS = 300_000

/**
 * How each client is driven, and why.
 *
 * `claude` — `-p` is the documented non-interactive lane and `--output-format stream-json` makes
 * the tool calls and the hook's refusal visible in the transcript; `--verbose` is required
 * alongside it. `CLAUDE_CONFIG_DIR` is inherited rather than set, because the run has to use the
 * operator's real credentials and the fixture supplies the only configuration under test.
 * `codex` — no runner, after the lane was measured rather than assumed. `exec` is the documented
 * non-interactive entry point and `--dangerously-bypass-hook-trust` is the documented way to run
 * enabled hooks without the interactive trust step, so this row used to drive it. Three runs on
 * codex-cli 0.154.0 (2026-09-15), in a fixture built by this module's own `createFixture`, produced
 * ZERO observations: with `features.hooks = true` emitted into `.codex/config.toml`, with
 * `--enable hooks` added, and with the project marked `trust_level = "trusted"`. `RUST_LOG=debug`
 * showed the session feature list carrying `CodexHooks` (so the flag IS read — the same run with
 * `-c features.hooks=false` does not carry it) and the bypass warning printed, but no hook
 * discovery line at all, while the client's own shell calls executed. The vendor pages read
 * 2026-09-15 — learn.chatgpt.com/docs/hooks and
 * learn.chatgpt.com/docs/config-file/config-reference — document the flag, the project-trust
 * requirement and the per-hook `/hooks` review, and do not state whether `exec` loads the project
 * hook layer at all. So the honest row is `not-run` with that reason: driving `exec` here would
 * record a `failed` row about the client's headless behaviour and read as a defect in the emission.
 * `cursor` and `copilot` carry no runner here; their rows are `not-run` with the reason the run
 * records, which is a fact about this machine and not about the client.
 */
export const CLIENT_RUNNERS = {
  claude: {
    binary: 'claude',
    args: ['-p', PROMPT, '--output-format', 'stream-json', '--verbose'],
  },
  codex: {
    binary: null,
    notRun:
      'codex exec on codex-cli 0.154.0 loads no project hook layer headlessly (features.hooks on, ' +
      'project trusted, hook trust bypassed; RUST_LOG=debug shows no hook discovery; the vendor ' +
      'pages read 2026-09-15 do not state whether exec runs hooks) — the interactive /hooks trust ' +
      'and the TUI observation stay human',
  },
  cursor: {
    binary: null,
    notRun:
      'no headless CLI on this machine: `cursor` is the editor launcher and no `cursor-agent` binary is on PATH',
  },
  copilot: {
    binary: null,
    notRun: 'not on PATH',
  },
}

/** Is `binary` runnable from here? `which`-free so it behaves the same wherever PATH is unusual. */
export function binaryVersion(binary) {
  const probe = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 60_000 })
  if (probe.error !== undefined && probe.error !== null) {
    return { present: false, reason: `${binary}: ${probe.error.message}` }
  }
  return { present: true, version: (probe.stdout ?? '').trim().split('\n')[0] ?? '' }
}

/**
 * Turn a fixture's observation log into the row's verdict.
 *
 * Both halves are required, and they are required separately. One `denied` observation says the
 * hook ran and refused; one `allowed` says the same hook let a different call through. A run with
 * only the denial could be a client that refuses everything, and a run with only the allowance
 * could be a hook that never fires — the pair is what distinguishes an enforced policy from either.
 */
export function verdictFor(observations) {
  const denied = observations.filter((row) => row.decision === 'denied')
  const allowed = observations.filter((row) => row.decision === 'allowed')
  if (denied.length > 0 && allowed.length > 0) {
    return {
      status: 'passed',
      reason:
        `the hook recorded ${observations.length} call(s): ${denied.length} denied (${DENIED_FILE}) ` +
        `and ${allowed.length} allowed (${ALLOWED_FILE})`,
    }
  }
  if (observations.length === 0) {
    return {
      status: 'failed',
      reason:
        'the hook recorded no call at all: the client never ran the wired user hook, so nothing ' +
        'about the client was enforced',
    }
  }
  return {
    status: 'failed',
    reason:
      `the hook recorded ${observations.length} call(s) but not both halves — ` +
      `${denied.length} denied, ${allowed.length} allowed`,
  }
}

/**
 * Run one client against its own fixture and return the row's raw material.
 *
 * The fixture is built FIRST, before the client binary is even looked for, and that order is the
 * point. A row whose client is absent is still a row about emitted bytes — the hook configuration
 * this engine writes for that client, and the scripts it points at — and those bytes are what a
 * person performing the row by hand would be signing against. Probing the binary first would leave
 * the absent clients' rows bound to an empty input list, and a row bound to nothing has a constant
 * hash: a signature on it would never reopen, however far the emission moved underneath it.
 */
export function runClient({ client, repoRoot, fixturesDir }) {
  const runner = CLIENT_RUNNERS[client]
  if (runner === undefined) {
    return { client, status: 'not-run', reason: `no runner is defined for client "${client}"` }
  }

  let fixture
  try {
    fixture = createFixture({ tool: client, repoRoot, ...(fixturesDir === undefined ? {} : { baseDir: fixturesDir }) })
  } catch (error) {
    const detail = [error?.message, error?.stdout, error?.stderr].filter(Boolean).join(' | ')
    return { client, status: 'failed', reason: `the fixture could not be built: ${detail}` }
  }

  if (runner.binary === null) {
    return { client, fixture: fixture.dir, status: 'not-run', reason: runner.notRun }
  }

  const probe = binaryVersion(runner.binary)
  if (!probe.present) {
    return { client, fixture: fixture.dir, status: 'not-run', reason: `not on PATH (${probe.reason})` }
  }

  const result = spawnSync(runner.binary, runner.args, {
    cwd: fixture.dir,
    encoding: 'utf8',
    timeout: RUN_TIMEOUT_MS,
    // Inherited wholesale: the client's credentials, its config directory and its PATH all live
    // in this environment, and a curated subset would measure a login failure instead of a hook.
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  })

  const { observations, error } = readObservations(fixture.observations)
  const verdict =
    error === undefined
      ? verdictFor(observations)
      : { status: 'failed', reason: `the hook's observation log could not be read: ${error}` }

  const transcriptTail = (result.stdout ?? '').slice(-2000)
  const stderrTail = (result.stderr ?? '').slice(-2000)
  return {
    client,
    fixture: fixture.dir,
    binary: runner.binary,
    binaryVersion: probe.version,
    command: [runner.binary, ...runner.args].join(' '),
    exitCode: result.status,
    timedOut: result.error?.code === 'ETIMEDOUT',
    observations,
    status: verdict.status,
    reason:
      result.error !== undefined && result.error !== null
        ? `${verdict.reason}; the client process reported: ${result.error.message}`
        : verdict.reason,
    transcriptTail,
    stderrTail,
    hookScript: fixture.hookScript,
    hookDeclaration: fixture.hookDeclaration,
  }
}

/** Every requested client, in the order given. */
export function runHookClients({ clients, repoRoot, fixturesDir }) {
  return clients.map((client) => runClient({ client, repoRoot, fixturesDir }))
}
