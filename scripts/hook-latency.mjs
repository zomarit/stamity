#!/usr/bin/env node
// The pre-tool-use guard's latency over node's own start, checked locally at each release
// (REQ-CTX-016, plan 010 D2). Never in CI: a shared runner's timing says more about its
// neighbours than about the guard, so the number of record is the one a person takes on a
// quiet machine and pastes into the release record.
//
// Usage: node scripts/hook-latency.mjs [--runs <n>] [--guard <path>] [--budget <ms>]
//        --runs   timed runs per case, after one untimed warm-up round. Default 7.
//        --guard  the guard script to time. Default: this checkout's
//                 .stamity/generated/hooks/claude/stamity-pre-tool-use-guard.mjs
//        --budget the overhead allowed per case, in ms. Default 15; the release uses the default.
//
// Exit codes: 0 every overhead within the budget, 1 one or more over it, 2 the check could not
// run (a bad argument, a missing guard, a spawn that failed or did not return in time, a guard
// that exited non-zero on a payload — a refused payload times the refusal, not the call it
// stands for — or any other crash, printed with its stack).
//
// METHOD. Three cases: node's own start (`node -e ""`), a governed non-Write call (a verdict
// role's `Read`, which carries its `agent_type` so the guard reads the policy, as the D2
// baseline's call did) and an allowed Write,
// each spawned with no shell as `spawnSync(process.execPath, [...])` and timed with
// `process.hrtime.bigint()` around the spawn. The cases are interleaved round by round, so a
// machine that slows down part-way slows every case alike rather than the last one measured.
// A case's overhead is its median minus node start's median.
//
// THE WRITE PAYLOAD. A verdict role (`stamity-reviewer`) writing its own report, which is the
// one Write the guard admits after walking the path's ancestors. The path is the one the
// batch-sync-3 measurement used when that report is in this checkout (reports are git-ignored,
// so a fresh clone falls back); otherwise a report path under `.stamity/runs/hook-latency/`.
// Either way it sits under the guard's own repository root, four levels above the guard.

import { spawnSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isMain } from './native-typescript.mjs'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')
const DEFAULT_GUARD = join(REPO_ROOT, '.stamity', 'generated', 'hooks', 'claude', 'stamity-pre-tool-use-guard.mjs')
const MEASUREMENT_REPORT = join(
  REPO_ROOT,
  '.stamity',
  'runs',
  '2026-09-23_orchestrator-context',
  'reports',
  'batch-sync-3-implementer-r1.md',
)
const FALLBACK_WRITE_PATH = '.stamity/runs/hook-latency/reports/latency-reviewer-r1.md'

export const BUDGET_MS = 15
export const VERDICT_AGENT = 'stamity-reviewer'
const DEFAULT_RUNS = 7
// One spawn's ceiling: the guard takes tens of ms, so a spawn still running after this is hung.
export const SPAWN_TIMEOUT_MS = 30_000

const USAGE = `Usage: node scripts/hook-latency.mjs [--runs <n>] [--guard <path>] [--budget <ms>]
  --runs   timed runs per case after one warm-up round (default ${DEFAULT_RUNS})
  --guard  the guard to time (default .stamity/generated/hooks/claude/stamity-pre-tool-use-guard.mjs)
  --budget the overhead allowed per case in ms (default ${BUDGET_MS})`

class CannotRun extends Error {}

/** The middle value; the mean of the two middle values for an even count. */
export function median(values) {
  const sorted = values.toSorted((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * The allowed Write's repository-relative path from the batch-sync-3 report's table row, or
 * undefined when there is no report, no such row, or a row whose path is not a plain relative one.
 */
export function reportWritePath(reportText) {
  if (typeof reportText !== 'string') return undefined
  const match = /reviewer `Write` to `([^`]+)` \(allowed\)/.exec(reportText)
  if (match === null) return undefined
  const path = match[1]
  const plain = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(path)
  if (!plain || path.split('/').some((segment) => segment === '.' || segment === '..')) return undefined
  return path
}

/** A verdict role writing its own report under `root`. */
export function writePayload(root, reportText) {
  const relPath = reportWritePath(reportText) ?? FALLBACK_WRITE_PATH
  return {
    hook_event_name: 'PreToolUse',
    agent_type: VERDICT_AGENT,
    tool_name: 'Write',
    tool_input: { file_path: join(root, ...relPath.split('/')), content: '# hook-latency probe\n' },
  }
}

/** The two timed payloads for `guard`, each as the stdin text the guard reads. */
export function payloads(guard) {
  // The guard anchors its repository at the fourth directory above itself
  // (<root>/.stamity/generated/hooks/<client>/guard), so the Write lands under that root.
  const root = resolve(dirname(guard), '..', '..', '..', '..')
  let reportText
  try {
    reportText = readFileSync(MEASUREMENT_REPORT, 'utf8')
  } catch {
    reportText = undefined
  }
  return [
    {
      name: 'non-Write call',
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        agent_type: VERDICT_AGENT,
        tool_name: 'Read',
        tool_input: { file_path: join(root, 'package.json') },
      }),
    },
    { name: 'allowed Write', input: JSON.stringify(writePayload(root, reportText)) },
  ]
}

function parseArgs(args) {
  const parsed = { runs: DEFAULT_RUNS, guard: DEFAULT_GUARD, budget: BUDGET_MS }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--help' || arg === '-h') return { help: true }
    if (arg !== '--runs' && arg !== '--guard' && arg !== '--budget') throw new CannotRun(`Unknown argument: ${arg}\n${USAGE}`)
    i += 1
    if (i >= args.length) throw new CannotRun(`${arg} needs a value.\n${USAGE}`)
    if (arg === '--guard') {
      parsed.guard = resolve(args[i])
    } else if (arg === '--budget') {
      if (!/^[0-9]+(\.[0-9]+)?$/.test(args[i])) throw new CannotRun(`--budget must be a number of ms, 0 or more.\n${USAGE}`)
      parsed.budget = Number(args[i])
    } else {
      if (!/^[1-9][0-9]*$/.test(args[i])) throw new CannotRun(`--runs must be a positive whole number.\n${USAGE}`)
      parsed.runs = Number(args[i])
    }
  }
  return parsed
}

/** One spawn's wall time in ms; any failure, hang or non-zero exit stops the whole check. */
export function timeOnce(name, args, input, timeoutMs = SPAWN_TIMEOUT_MS) {
  const start = process.hrtime.bigint()
  const result = spawnSync(process.execPath, args, { input, encoding: 'utf8', windowsHide: true, timeout: timeoutMs })
  const elapsed = Number(process.hrtime.bigint() - start) / 1e6
  if (result.error?.code === 'ETIMEDOUT') throw new CannotRun(`${name}: the spawn did not return within ${timeoutMs} ms.`)
  if (result.error !== undefined) throw new CannotRun(`${name}: the spawn failed (${result.error.message}).`)
  if (result.status !== 0) {
    const how = result.status === null ? `was killed by ${result.signal}` : `exited ${result.status}`
    const said = result.stderr.trim().split('\n')[0] ?? ''
    throw new CannotRun(`${name}: the guard ${how}${said === '' ? '' : ` (${said})`}; a refused payload times the refusal, not the call.`)
  }
  return elapsed
}

function main(args) {
  const parsed = parseArgs(args)
  if (parsed.help) {
    console.log(USAGE)
    return 0
  }
  let isFile
  try {
    isFile = statSync(parsed.guard).isFile()
  } catch {
    isFile = false
  }
  if (!isFile) {
    throw new CannotRun(`no guard at ${parsed.guard}; regenerate the setup, or name one with --guard <path>.`)
  }

  const cases = [
    { name: 'node start', args: ['-e', ''], input: '' },
    ...payloads(parsed.guard).map(({ name, input }) => ({ name, args: [parsed.guard], input })),
  ]
  const samples = cases.map(() => [])
  for (let round = 0; round <= parsed.runs; round += 1) {
    cases.forEach((entry, index) => {
      const ms = timeOnce(entry.name, entry.args, entry.input)
      if (round > 0) samples[index].push(ms)
    })
  }

  const medians = samples.map(median)
  // The verdict reads the raw difference; the one-decimal form is for the print only.
  const rows = cases.map((entry, index) => ({
    name: entry.name,
    median: medians[index].toFixed(1),
    overheadMs: index === 0 ? undefined : medians[index] - medians[0],
  }))

  console.log(
    `hook-latency: node ${process.version} on ${process.platform}, ${parsed.runs} runs after 1 warm-up, guard ${parsed.guard}`,
  )
  console.log('')
  console.log('| case | median (ms) | overhead (ms) |')
  console.log('|---|---|---|')
  for (const row of rows) console.log(`| ${row.name} | ${row.median} | ${row.overheadMs?.toFixed(1) ?? '—'} |`)
  console.log('')

  const over = rows.filter((row) => row.overheadMs !== undefined && row.overheadMs > parsed.budget)
  for (const row of over) {
    console.error(
      `hook-latency: ${row.name}: guard overhead ${row.overheadMs.toFixed(1)} ms over the ${parsed.budget} ms budget`,
    )
  }
  if (over.length > 0) return 1
  console.log(`hook-latency: every overhead within the ${parsed.budget} ms budget`)
  return 0
}

/**
 * The exit code for one run of `body`: its own code, or 2 for anything that stopped the check —
 * a known cannot-run case by its message, any other throw with its stack, since a crash measured
 * nothing and 1 is reserved for over budget.
 */
export function cli(args, body = main) {
  try {
    return body(args)
  } catch (error) {
    if (error instanceof CannotRun) {
      console.error(`hook-latency: ${error.message}`)
    } else {
      console.error(`hook-latency: the check crashed and measured nothing.\n${error?.stack ?? String(error)}`)
    }
    return 2
  }
}

if (isMain(import.meta.url)) process.exitCode = cli(process.argv.slice(2))
