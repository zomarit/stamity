#!/usr/bin/env node
// The CI test step, with one re-run for a load timeout and never for anything else. Importing it
// performs no I/O.
//
//   node scripts/ci/test-run.mjs [--coverage] [--shard=<i>/<n>] [<test file>...]
//
// Named test files make a scoped run: vitest runs exactly those files, and `--coverage` is not
// passed on, because the floors in `vitest.config.ts` are per-file and keyed over all of `src/**`,
// so a partial run reports every file it did not load below its floor and is red for no defect;
// collecting coverage with the thresholds off would only add wall time for a report no gate
// reads. The per-file floors are measured on the full run, CI's command, which names no file.
//
// It runs vitest once, with this file as an extra reporter (the default export below) that writes
// every failure's error name and message to a JSON report. Exit 0 from vitest is a pass. Otherwise
// the report decides. When EVERY failure is a vitest timeout — a message that STARTS "Test timed
// out in <n>ms" or "Hook timed out in <n>ms", on an error that is not an `AssertionError` — and
// nothing else went wrong, it runs again ONCE: the failed files alone on a leg without
// coverage, or the whole run again with `--coverage` on a coverage leg, because a partial run
// cannot meet the per-file floors. A green re-run exits 0 and says so out loud — one
// `::warning title=flaky test::` annotation per file and one line per file in
// `$GITHUB_STEP_SUMMARY` — so a flaky pass is never read as a clean one. Everything else is red
// (exit 1): an assertion failure, a timeout beside any other failure, a failed file with no
// message, an unhandled error, an interrupted run, a coverage floor, a missing report, and any
// failure at all on the re-run, a second timeout included. Exit 2 is a flag this script does not
// know, so a typo in the workflow is red rather than quietly unsharded.
//
// Why its own reporter rather than vitest's built-in `json` one: the built-in report carries a
// file's own errors and each test's, but not a `describe` block's, so an `afterAll` inside a
// `describe` that times out reads there as a failed file with an empty message (measured on
// vitest 5.0.1). Two of the cleanup hooks this re-run exists for have exactly that shape.
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Vitest's two timeout messages, and nothing wider: anchored at the start, because an assertion's
 * custom message (`expect(status, childOutput)`) is a prefix of its failure text and can quote a
 * child vitest's "Hook timed out"; and `ETIMEDOUT` from a spawn is not one.
 */
export const TIMEOUT = /^(Test|Hook) timed out in \d+ms/

/** An assertion failure is never a timeout, whatever its message quotes. */
const ASSERTION_ERROR = 'AssertionError'

/** Where the reporter writes its JSON; set by the runner below for each vitest process. */
export const REPORT_ENV = 'STAMITY_TEST_RUN_REPORT'

const SELF = fileURLToPath(import.meta.url)
const USAGE = 'usage: node scripts/ci/test-run.mjs [--coverage] [--shard=<i>/<n>] [<test file>...]'

/**
 * The vitest reporter. It writes
 * `{ reason, unhandled, failures: [{ file, errors: [{ name, message }] }] }`, where a file's errors
 * are its own, every suite's (hooks included) and every failed test's, each carrying the error's
 * `name` so the decision can tell an assertion from a timeout. A file vitest failed with none of
 * those still appears, with no error, so the decision below can refuse it.
 */
export default class FailureReport {
  onTestRunEnd(testModules, unhandledErrors, reason) {
    const target = process.env[REPORT_ENV]
    if (!target) return
    writeFileSync(target, JSON.stringify(collectFailures(testModules, unhandledErrors, reason, process.cwd())))
  }
}

/** The report's content, from vitest's reported-task objects. */
export function collectFailures(testModules, unhandledErrors, reason, cwd) {
  const failures = []
  for (const module of testModules) {
    const errors = [
      ...module.errors(),
      ...[...module.children.allSuites()].flatMap(suite => suite.errors()),
      ...[...module.children.allTests('failed')].flatMap(test => test.result().errors ?? []),
    ]
    if (module.state() === 'failed' || errors.length > 0) {
      failures.push({ file: relative(cwd, module.moduleId).replaceAll('\\', '/'), errors: errors.map(entryOf) })
    }
  }
  return { reason, unhandled: unhandledErrors.map(messageOf), failures }
}

function messageOf(error) {
  return String(error?.message ?? error)
}

function entryOf(error) {
  return { name: String(error?.name ?? ''), message: messageOf(error) }
}

function isTimeout(error) {
  return error.name !== ASSERTION_ERROR && TIMEOUT.test(error.message)
}

function firstLine(text) {
  return text.split('\n')[0]
}

function fail(reason) {
  return { action: 'fail', files: [], reason }
}

/**
 * The decision, with no I/O: `{ action: 'pass' | 'rerun' | 'fail', files, reason }`. `rerun` needs
 * a report that names at least one failed file, every failed file carrying at least one error,
 * and every error a timeout; anything short of that is `fail`.
 */
export function decide({ exitCode, report }) {
  if (exitCode === 0) return { action: 'pass', files: [], reason: 'vitest exited 0' }
  if (report === null || report === undefined) {
    return fail(`vitest exited ${exitCode} and wrote no failure report (it crashed or was killed)`)
  }
  if (report.reason === 'interrupted') return fail('the run was interrupted before it finished')
  if (report.unhandled.length > 0) {
    return fail(`${report.unhandled.length} unhandled error(s), the first: ${firstLine(report.unhandled[0])}`)
  }
  if (report.failures.length === 0) {
    return fail(`vitest exited ${exitCode} with no failed file (a coverage floor or a run-level error)`)
  }
  for (const failure of report.failures) {
    if (failure.errors.length === 0) return fail(`${failure.file} failed without a message`)
    const other = failure.errors.find(error => !isTimeout(error))
    if (other !== undefined) return fail(`${failure.file}: ${other.name}: ${firstLine(other.message)}`)
  }
  const files = report.failures.map(failure => failure.file)
  return { action: 'rerun', files, reason: `every failure is a timeout, in ${files.length} file(s)` }
}

/**
 * `{ coverage, shard?, files? }` or `{ error }`. An empty `--shard=` is an unsharded leg; every
 * word not starting with `-` is a test file, kept in order; any other flag is an error.
 */
export function parseArgs(argv) {
  const args = { coverage: false }
  const files = []
  for (const arg of argv) {
    if (arg === '--coverage') {
      args.coverage = true
    } else if (arg.startsWith('--shard=')) {
      const value = arg.slice('--shard='.length)
      if (value === '') continue
      const match = /^(\d+)\/(\d+)$/.exec(value)
      if (match === null || Number(match[1]) < 1 || Number(match[1]) > Number(match[2])) {
        return { error: `malformed shard "${value}": want <i>/<n> with 1 <= i <= n` }
      }
      args.shard = value
    } else if (arg !== '' && !arg.startsWith('-')) {
      files.push(arg)
    } else {
      return { error: `unknown argument: ${arg}` }
    }
  }
  if (files.length > 0) args.files = files
  return args
}

/**
 * The vitest argument list for one run. Naming any reporter replaces vitest's defaults, and those
 * add `github-actions` on a runner, so it is named again there to keep the failure annotations.
 */
export function vitestArgs({ coverage, shard, files = [] }, env) {
  return [
    'run',
    ...(coverage ? ['--coverage'] : []),
    ...(shard ? [`--shard=${shard}`] : []),
    ...files,
    '--reporter=default',
    `--reporter=${SELF.replaceAll('\\', '/')}`,
    ...(env.GITHUB_ACTIONS === 'true' ? ['--reporter=github-actions'] : []),
  ]
}

/** Workflow-command data escaping, so a path can never end or forge the annotation. */
function escapeData(text) {
  return text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
}

/**
 * The step itself, over injected I/O: `io.vitest(args)` returns `{ exitCode, report }`, and
 * `io.out`, `io.err` and `io.summary` take text. Returns the exit code.
 */
export function runTests(argv, io) {
  const parsed = parseArgs(argv)
  if (parsed.error !== undefined) {
    io.err(`test-run: ${parsed.error}\n${USAGE}\n`)
    return 2
  }
  // A scoped run collects no coverage (see the head of this file), so its timeout re-run is the
  // failed files alone, the same as a leg without coverage.
  const scoped = parsed.files !== undefined
  const args = scoped ? { ...parsed, coverage: false } : parsed
  if (scoped && parsed.coverage) {
    io.err(
      `test-run: a scoped run of ${parsed.files.length} file(s), coverage off: ` +
        'the per-file coverage floors are measured on the full run only\n',
    )
  }
  const decision = decide(io.vitest(vitestArgs(args, io.env)))
  if (decision.action === 'pass') return 0
  if (decision.action === 'fail') {
    io.err(`test-run: red, no re-run: ${decision.reason}\n`)
    return 1
  }
  const again = args.coverage ? args : { coverage: false, files: decision.files }
  io.err(
    `test-run: ${decision.reason}; running once more: ` +
      `${args.coverage ? 'the whole suite with --coverage, so the floors are measured on a complete run' : decision.files.join(', ')}\n`,
  )
  const second = io.vitest(vitestArgs(again, io.env))
  if (second.exitCode !== 0) {
    io.err(`test-run: red: the re-run failed too: ${decide(second).reason}\n`)
    return 1
  }
  for (const file of decision.files) {
    io.out(`::warning title=flaky test::${escapeData(file)}: timed out once, passed on re-run\n`)
    io.summary(`- flaky test: \`${file}\` timed out once, passed on re-run\n`)
  }
  return 0
}

function err(text) {
  process.stderr.write(text)
}

function readReport(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    err(`test-run: the failure report at ${path} is unreadable: ${error.message}\n`)
    return null
  }
}

function main(argv) {
  const vitestBin = join(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs')
  const work = mkdtempSync(join(tmpdir(), 'stamity-test-run-'))
  let runs = 0
  try {
    return runTests(argv, {
      env: process.env,
      vitest(args) {
        runs += 1
        const report = join(work, `report-${runs}.json`)
        const result = spawnSync(process.execPath, [vitestBin, ...args], {
          stdio: 'inherit',
          env: { ...process.env, [REPORT_ENV]: report },
        })
        if (result.error) err(`test-run: vitest did not start: ${result.error.message}\n`)
        return { exitCode: result.status ?? 1, report: readReport(report) }
      },
      out: text => process.stdout.write(text),
      err,
      summary(text) {
        if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text)
      },
    })
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2))
}
