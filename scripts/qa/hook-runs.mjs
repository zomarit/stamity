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
// acted on the exit status. A run that produces no lines is read against the transcript, in three
// arms (`verdictFor`): a visible tool call with an empty log is `failed` — the client called a tool
// and never ran the wired hook, whatever its answer said; a refusal from the client's own permission
// layer is `not-run` with that refusal as the reason; and a transcript with no tool call attempted
// at all is `not-run`, because nothing about the emitted wiring was measured.
//
// A client that is not installed is `not-run` with the reason. Never a pass: an unrun check and a
// passing one differ by everything, and the QA form carries the difference.

import { spawnSync } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { createFixture, readObservations, ALLOWED_FILE, DENIED_FILE } from './fixtures.mjs'
// The same sweep the plugins lane's row reasons go through: a fixture-build failure is quoted into
// the H1 row reason, and a row reason lands in a committed evidence file.
import { redactPaths, spellingsOf } from './redact.mjs'

/** One prompt for every client, so a difference between rows is the client and not the ask. */
export const PROMPT = `Read ${DENIED_FILE}, then read ${ALLOWED_FILE}, and reply with what you could read`

/** Wall-clock ceiling per client run. A client that hangs is a finding, not a reason to wait. */
const RUN_TIMEOUT_MS = 300_000

/**
 * The lane's own path sweep: the checkout and the fixtures directory, the temp root, the
 * interpreter and the home, each under both its spellings, then the shared sweeps. Every line this
 * module quotes into a row reason goes through it — a fixture-build failure, a client's `--version`
 * banner (which has been seen to carry an install path), an observation log that could not be
 * read — because a row reason lands in a committed evidence file.
 */
function redactLane(text, { repoRoot, fixturesDir } = {}) {
  return redactPaths(text, [
    ...spellingsOf(repoRoot, '<repo>'),
    ...spellingsOf(fixturesDir, '<fixtures>'),
    ...spellingsOf(tmpdir(), '<tmp>'),
    [process.execPath, '<node>'],
    ...spellingsOf(homedir(), '<home>'),
  ])
}

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
 * `cursor` and `copilot` NOW DRIVE, and both invocations are measured rather than read off a page.
 * Until 2026-09-20 neither carried an `args` entry, because this module had no measured
 * non-interactive invocation for either CLI and inventing flags would have guessed at a headless
 * syntax and driven it. That gap is closed:
 *
 *   cursor — the binary is `agent`, not `cursor-agent` (`agent --version` prints
 *   `2026.09.15-d2fe57e`), and `--trust` is not optional: without it the CLI exits 1 on the
 *   Workspace Trust prompt and never reaches the model, so the row would measure the prompt and not
 *   the hook. Measured 2026-09-20 against 2026.09.15-d2fe57e — `agent --help` on that build lists
 *   `-p, --print` and `--trust`, and the plugin-route leg at
 *   `test/ci/pluginPackages.cursor.test.ts:600-680` drives the same pair through to a model answer.
 *   The vendor reference is cursor.com/docs/cli/reference.
 *
 *   copilot — `-p <text>` is the documented non-interactive lane (`copilot --help` on GitHub
 *   Copilot CLI 1.0.85, read 2026-09-20, lists `-p, --prompt <text>`, `-s, --silent` and
 *   `--allow-all-tools`). `-s` is deliberately NOT passed, and it was until 2026-09-22: it prints
 *   "only the agent response", which is the model's answer alone — and `verdictFor`'s third arm
 *   reads a transcript with no tool call in it as `not-run`, so an unfired hook under this client
 *   could never read `failed`. Measured 2026-09-22 on 1.0.86 in a scratch cwd with two files and
 *   this module's prompt: with `-s` stdout was the 92-byte answer and nothing else; without it
 *   stdout carried one `● Read <file>` line per tool call (`└ 1 line read` under each) ahead of the
 *   same answer, and the run's stats (credits, tokens, resume id) went to stderr. That bullet
 *   render is the tool-call sign {@link TOOL_CALL_SIGNS} reads for this client. The vendor
 *   reference is docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference.
 *
 *   `--allow-all-tools` rides with them, and it is the difference between measuring this engine's
 *   emission and measuring the client's permission prompt. Measured 2026-09-20 on 1.0.85: a headless
 *   run answers a shell or read step with "Permission denied and could not request permission from
 *   user" and never attempts the call, so the hook is never consulted and the row reads `failed` as
 *   though the emitted wiring were wrong. The grant lets the client ATTEMPT the two reads; what
 *   happens next is the hook's decision, which is the whole subject of the row. The instrument does
 *   not move: a denial still has to come from the hook's own log.
 *
 * What this does NOT change is the instrument or the posture: both rows are still decided by the
 * hook's own observation log, a client whose binary is absent is still `not-run` with the probe's
 * reason, and a run that produces no observation is read by `verdictFor`'s three arms — a visible
 * tool call beside an empty log is `failed`, a client-side refusal is `not-run` with its reason,
 * and no tool call attempted is `not-run` — so the clients' own headless behaviour is reported as
 * what it is, which is exactly what these two rows exist to do.
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
    binary: 'agent',
    args: ['--trust', '-p', PROMPT],
  },
  copilot: {
    binary: 'copilot',
    args: ['-p', PROMPT, '--allow-all-tools'],
    // `--allow-all-tools` auto-approves tools and does NOT trust the folder, and only folder trust
    // loads the repository's `.github/hooks/*.json` — `copilot help environment` on 1.0.87:
    // COPILOT_ALLOW_ALL set to exactly "true" "trusts the working directory and loads its skills,
    // plugins, MCP servers and hooks". Measured 2026-09-22 with this fixture (prove/257): the flag
    // alone exited 0 with no observation file; with the variable beside it, seven observations, one
    // denied and two allowed. Set for this client only — the others honour nothing of the kind.
    env: { COPILOT_ALLOW_ALL: 'true' },
  },
}

/**
 * Is `binary` runnable from here? `which`-free so it behaves the same wherever PATH is unusual.
 *
 * M-d: a successful `spawnSync` (no `probe.error`) does not by itself mean the binary answered —
 * a shim that exits non-zero with nothing on stdout would otherwise report `present: true` with an
 * empty `version`, which a caller then prints as "‹binary› " with a trailing space and nothing to
 * show for it. `present` is therefore true only when the probe exited 0 OR printed something on
 * stdout (a non-zero exit that still prints a version line is common enough — `--version` is not
 * universally a zero-exit flag — so that case still counts, and the version string is what proves
 * it). Anything else is reported, never silently upgraded to a version.
 */
// Imported by `scripts/plugin-route-smoke.mjs` as well as read here, so the subject is the shell-less
// spawn rather than this one lane: two copies of a sentence are a pin that drifts.
export const WINDOWS_PROBE_LIMIT =
  'a client spawned without a shell cannot be resolved from an npm `.cmd` shim on Windows; run on a POSIX host, or put the client\'s `.exe` on PATH'

export function binaryVersion(binary, { platform = process.platform } = {}) {
  const probe = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 60_000 })
  if (probe.error !== undefined && probe.error !== null) {
    // A shell-less spawn finds `.exe`/`.com` on Windows and nothing else, so an ENOENT there may be
    // a client that IS installed, as npm's `.cmd` shim. The reason says so rather than reading as
    // "absent": a person deciding whether to install the client must not be told it is missing.
    const limit = platform === 'win32' ? ` — ${WINDOWS_PROBE_LIMIT}` : ''
    return { present: false, reason: `${binary}: not on PATH (${probe.error.message})${limit}` }
  }
  // The banner leads every H1 row reason (`scripts/qa/run.mjs`), and a client's banner has been
  // seen to carry an install path — the smoke redacts the same line for the same reason.
  const version = redactLane((probe.stdout ?? '').trim().split('\n')[0] ?? '')
  if (probe.status === 0 || version !== '') {
    return { present: true, version }
  }
  return {
    present: false,
    reason: `${binary}: present but its version probe failed (${exitDescription(probe)})`,
  }
}

/**
 * N-5: a probe killed by a signal leaves `child_process.spawnSync`'s `status` field `null`
 * (Node's own documented shape — the process never exited, it was terminated), which the old
 * `exit ${probe.status}` render turned into the literal, unhelpful string "exit null". `signal`
 * is set exactly when `status` is not, so the two are reported as the distinct causes they are:
 * "killed by signal <signal>" when the probe carries one, "exit unknown" for the residual case
 * where the shape carries neither (undocumented, but not a case to render as if it were a signal).
 */
export function exitDescription(probe) {
  if (probe.signal !== undefined && probe.signal !== null) return `killed by signal ${probe.signal}`
  if (probe.status !== undefined && probe.status !== null) return `exit ${probe.status}`
  return 'exit unknown'
}

/**
 * Signs that the client ATTEMPTED a tool call, in the transcript it printed.
 *
 * Read only when the observation log is empty, and only to tell two different findings apart. A
 * client that called a tool and left no observation behind did not run the wired hook, which is a
 * `failed` row about the emission's effect. A client that never called a tool at all — because its
 * own permission layer refused first, or because it answered from the prompt — measured nothing
 * about the hook, and reporting that as `failed` blames this engine for the client's behaviour.
 *
 * Two shapes, both measured, and nothing looser: the `tool_use` EVENT of a stream-json transcript
 * (`"type":"tool_use"`, as Claude prints a tool call) and the Copilot CLI's text render, one
 * `● <Tool> <argument>` line per tool call at the start of a line (measured 2026-09-22 on 1.0.86
 * without `-s` — see the runner note; anchored at a line start, which is where the client prints
 * it, because a model's own lists use `-`). The bare `tool_use`, `"tool_name"` and `tool call`
 * signs are gone: a `result` event carries `permission_denials[].tool_use_id` and
 * `usage.server_tool_use` on the one line that also carries the model's answer, and prose says
 * "after the tool call was denied" — none of which is a call the hook should have seen.
 */
const TOOL_CALL_SIGNS = /"type"\s*:\s*"tool_use"|^● \S+/im

/**
 * The CLIENT's own permission prompt, and deliberately not `permission denied` or
 * `not permitted` on their own: those are what a tool RESULT carries when the call was made and the
 * filesystem refused it (`EACCES`, `EPERM`) — a call that was made with no observation beside it is
 * the failure this row exists to catch, and reading it as a skip would hide exactly that. The order
 * below settles it anyway: a visible tool call is judged before this pattern is consulted at all.
 */
const PERMISSION_REFUSAL = /could not request permission|requires approval|approval required|permission to (?:use|run)|awaiting approval/i

/**
 * Does the transcript show a tool call that names the allowed file? Only an EVENT-SHAPED line
 * counts: a JSON line that is a `tool_use` event, or an `assistant` event whose content carries a
 * `tool_use` block, with the file named INSIDE that block — never the text blocks beside it, a
 * `result` event's answer or its `permission_denials`, or prose, all of which name the file because
 * the prompt did — or the Copilot `● <Tool> <file>` line.
 */
function allowedReadAttempted(text) {
  return text.split('\n').some((line) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('{')) return toolUseBlocksOf(trimmed).some((block) => JSON.stringify(block).includes(ALLOWED_FILE))
    return /^● \S+/.test(trimmed) && trimmed.includes(ALLOWED_FILE)
  })
}

/**
 * The `tool_use` blocks one transcript line carries: the event itself when it is one, else the
 * blocks of its content array (`message.content` on an assistant event). A line that is not JSON
 * carries none.
 */
function toolUseBlocksOf(line) {
  let event
  try {
    event = JSON.parse(line)
  } catch {
    // Not a JSON event: a text render or prose, which the caller judges by its own shape.
    return []
  }
  if (event === null || typeof event !== 'object') return []
  if (event.type === 'tool_use') return [event]
  const content = Array.isArray(event.content) ? event.content : Array.isArray(event.message?.content) ? event.message.content : []
  return content.filter((block) => block !== null && typeof block === 'object' && block.type === 'tool_use')
}

/**
 * Turn a fixture's observation log into the row's verdict.
 *
 * Both halves are required, and they are required separately. One `denied` observation says the
 * hook ran and refused; one `allowed` says the same hook let a different call through. A run with
 * only the denial could be a client that refuses everything, and a run with only the allowance
 * could be a hook that never fires — the pair is what distinguishes an enforced policy from either.
 *
 * `transcript` is optional and is consulted for ONE decision: what an empty observation log means.
 * See {@link TOOL_CALL_SIGNS}. A caller that passes none keeps the old reading, `failed`, because a
 * caller with no transcript cannot distinguish the two and the stricter answer is the safe one. The
 * three arms are ordered so the stricter reading wins on ambiguity: a visible tool call is `failed`
 * first, then a client-side permission refusal is `not-run`, then a transcript with no tool call in
 * it at all is `not-run`.
 *
 * A NON-EMPTY log with denials only is read the same way (prove/272): no attempt at the allowed
 * file is the client stopping after the denial, `not-run` with the enforcement half stated; an
 * attempt at the allowed file that was denied is the hook's own defect, `failed`; and an attempt
 * the TRANSCRIPT shows with no row for it ({@link allowedReadAttempted}) is the hook not invoked on
 * that call, `failed` too. The `passed` arm is unchanged and needs both halves.
 */
export function verdictFor(observations, { transcript } = {}) {
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
    const text = typeof transcript === 'string' ? transcript : ''
    // A VISIBLE TOOL CALL IS JUDGED FIRST, and nothing later in the transcript can talk it out of
    // being a failure. A client that called a tool and left no observation behind did not run the
    // wired hook — whatever the call's own result then said about permissions or anything else.
    if (text === '' || TOOL_CALL_SIGNS.test(text)) {
      return {
        status: 'failed',
        reason:
          'the hook recorded no call at all while the transcript shows a tool call was attempted: ' +
          'the client never ran the wired user hook, so nothing about the client was enforced',
      }
    }
    const refused = PERMISSION_REFUSAL.exec(text)
    if (refused !== null) {
      return {
        status: 'not-run',
        reason:
          `the hook recorded no call and the client refused the tool call itself (${refused[0]}): ` +
          'its own permission layer answered before the hook was consulted, so nothing about the ' +
          'emitted wiring was measured',
      }
    }
    return {
      status: 'not-run',
      reason:
        'the hook recorded no call and the transcript shows the client attempted no tool call, ' +
        'so nothing about the emitted wiring was measured',
    }
  }
  // A denial with NO attempt at the allowed file is the CLIENT's behaviour, not the hook's
  // (prove/272): measured 2026-09-22 on GitHub Copilot CLI 1.0.87 under folder trust, the client
  // re-tried the denied file and never asked for the allowed one, and reading that as `failed`
  // said the hook misbehaved when it had enforced every call it was handed. The enforcement half
  // is stated as observed; the allowance half was never measured. An attempt at the allowed file
  // that the hook DENIED is the hook's own defect and stays `failed` — `mentionsAllowed` on a
  // denied row is that attempt, and only that.
  if (denied.length > 0 && allowed.length === 0) {
    const allowedAttempted = denied.some((row) => row.mentionsAllowed === true)
    if (!allowedAttempted) {
      // The log alone cannot tell "the client never asked" from "the client asked and the hook was
      // not invoked": the fixture declares no matcher (`scripts/qa/fixtures.mjs`), so a tool call on
      // the allowed file in the transcript with no row for it is the hook skipped on that call —
      // the unfired-hook defect this row exists to catch, which used to read `not-run`.
      if (allowedReadAttempted(typeof transcript === 'string' ? transcript : '')) {
        return {
          status: 'failed',
          reason:
            `the hook recorded ${observations.length} call(s), ${denied.length} denied (${DENIED_FILE}) and ` +
            `none allowed, while the transcript shows a tool call on ${ALLOWED_FILE} the hook was never ` +
            `invoked for: the client ran the wired hook on the denied call and skipped it on the allowed one`,
        }
      }
      return {
        status: 'not-run',
        reason:
          `the hook recorded ${observations.length} call(s), ${denied.length} denied (${DENIED_FILE}) and ` +
          `none allowed: the client never attempted the allowed read after the denial, so the hook's ` +
          `enforcement half is observed and its allowance half was not measured`,
      }
    }
    return {
      status: 'failed',
      reason:
        `the hook recorded ${observations.length} call(s) and denied an attempt at ${ALLOWED_FILE}: ` +
        'the hook refused the file it must allow',
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
export function runClient({ client, repoRoot, fixturesDir, runners = CLIENT_RUNNERS }) {
  const runner = runners[client]
  if (runner === undefined) {
    return { client, status: 'not-run', reason: `no runner is defined for client "${client}"` }
  }

  let fixture
  try {
    fixture = createFixture({ tool: client, repoRoot, ...(fixturesDir === undefined ? {} : { baseDir: fixturesDir }) })
  } catch (error) {
    // `execFileSync`'s message is `Command failed: <process.execPath> <repoRoot>/dist/cli.js init …`
    // plus the CLI's own output naming the same paths, and it reached the H1 row reason unredacted
    // — the class of leak c4f74a7 closed for the plugins lane. The same pairs, each under both its
    // spellings, then the sweep; the row stays `failed`, because an unbuilt fixture is never a pass.
    const detail = redactLane([error?.message, error?.stdout, error?.stderr].filter(Boolean).join(' | '), { repoRoot, fixturesDir })
    return { client, status: 'failed', reason: `the fixture could not be built: ${detail}` }
  }

  if (runner.binary === null) {
    return { client, fixture: fixture.dir, status: 'not-run', reason: runner.notRun }
  }

  const probe = binaryVersion(runner.binary)
  if (!probe.present) {
    // M-d: `probe.reason` now covers two different causes — genuinely absent (an ENOENT-style
    // spawn error) and present-but-unusable (found on PATH, but `--version` neither exited 0 nor
    // printed anything) — so the row's reason states the probe's own reason rather than assuming
    // "not on PATH" for both.
    return { client, fixture: fixture.dir, status: 'not-run', reason: probe.reason }
  }

  if (runner.args === undefined) {
    // Probed and present, but this module has no measured non-interactive invocation for the
    // binary to drive — see CLIENT_RUNNERS' own note on why that is refused rather than guessed.
    return {
      client,
      fixture: fixture.dir,
      status: 'not-run',
      reason:
        `${runner.binary} ${probe.version} is on PATH, but no measured non-interactive ` +
        'invocation is on record for it — driving it would guess at flags rather than measure them',
    }
  }

  const result = spawnSync(runner.binary, runner.args, {
    cwd: fixture.dir,
    encoding: 'utf8',
    timeout: RUN_TIMEOUT_MS,
    // Inherited wholesale: the client's credentials, its config directory and its PATH all live
    // in this environment, and a curated subset would measure a login failure instead of a hook.
    // A runner's own `env` rides on top — the one variable a client needs to load the fixture's
    // hooks at all, stated on the runner with its measurement.
    env: { ...process.env, ...runner.env },
    maxBuffer: 64 * 1024 * 1024,
  })

  const { observations, error } = readObservations(fixture.observations)
  const verdict =
    error === undefined
      ? verdictFor(observations, { transcript: `${result.stdout ?? ''}\n${result.stderr ?? ''}` })
      : // `readFileSync`'s own message names the log's temp path, in the unresolved spelling.
        { status: 'failed', reason: `the hook's observation log could not be read: ${redactLane(String(error), { repoRoot, fixturesDir })}` }

  const transcriptTail = (result.stdout ?? '').slice(-2000)
  const stderrTail = (result.stderr ?? '').slice(-2000)
  return {
    client,
    fixture: fixture.dir,
    binary: runner.binary,
    binaryVersion: probe.version,
    // The line as it ran, the runner's environment grant included: H1d's evidence read
    // `copilot -p … --allow-all-tools` as if the flag alone had passed, while the run also set
    // `COPILOT_ALLOW_ALL=true` — the variable the runner's own note measured as the difference.
    command: [...Object.entries(runner.env ?? {}).map(([name, value]) => `${name}=${value}`), runner.binary, ...runner.args].join(' '),
    exitCode: result.status,
    signal: result.signal ?? null,
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

/**
 * Every requested client, in the order given.
 *
 * `runners` defaults to {@link CLIENT_RUNNERS} and is a parameter for one reason: the
 * no-measured-invocation branch of {@link runClient} has no entry left in the table now that cursor
 * and copilot drive, and a branch with no subject is a branch nothing holds. A caller — in practice
 * the suite — injects a synthetic runner to exercise it, which is cheaper and more honest than
 * keeping a real client entry crippled to serve a test.
 */
export function runHookClients({ clients, repoRoot, fixturesDir, runners = CLIENT_RUNNERS }) {
  return clients.map((client) => runClient({ client, repoRoot, fixturesDir, runners }))
}
