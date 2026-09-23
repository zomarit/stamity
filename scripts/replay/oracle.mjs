#!/usr/bin/env node
// The replay's hidden oracles: whether each seeded defect is still in a tree (REPLAY-v1 §9, the
// "approved with a seed unfixed" row).
//
// Two kinds, as `evals/replay/v1/seeds.json` names them per seed. A behaviour seed's oracle is a
// vitest file under `test/__oracle__/`, shipped in `evals/replay/v1/oracle/oracles.patch` and
// applied to a copy of the run's tree only after the run, because the fixture an agent works in
// never holds it (`scripts/replay/fixture.mjs`). A test-weakening seed's oracle is static: every
// `mustMatch` source, compiled as `new RegExp(source)` with no flags, matches the file's text and no
// `mustNotMatch` source does. Those patterns live only in `seeds.json`; nothing here restates one.
//
// A result is `pass` when the defect is absent, `fail` when an oracle's assertion saw it, and
// `error` when the oracle could not say: its file did not load (a seam it reaches the service
// through is gone — the oracles resolve those at load time for exactly this reason), no result came
// back, every test was skipped, the run timed out, or a static file is missing. RESULTS counts
// `error` separately, and an erroring seed counts as unfixed.
//
// `evals/replay/v1/oracle/reference-fixes.patch` fixes all twelve seeds on the pure seeded tree; the
// replay suite (`test/replay/oracle.test.ts`) proves each oracle red on that tree and green after it.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { redactPaths, spellingsOf } from '../qa/redact.mjs'
import { applyPatch } from './fixture.mjs'

export const ORACLE_SCHEMA = 'stamity/replay-oracle/v1'

/** Where the behaviour oracles land in a tree, and the argument that selects them. */
const ORACLE_DIR = 'test/__oracle__'

/** The longest `detail` a result carries, in code points. */
const DETAIL_MAX = 300

/**
 * How long the whole vitest run may take before it is killed. Nine small files finish in seconds;
 * a run past two minutes is stuck, and a stuck run is what an agent's edit can cause: the export's
 * batch loop never ends on a batch size of 0 until the pass that adds that check
 * (`evals/replay/v1/patches/u2-p2.patch`), and a synchronous loop is past vitest's own test timeout.
 */
const RUN_TIMEOUT_MS = 120_000

/**
 * Apply the oracle patch to a tree: plain `git apply`, since every file it carries is new. Through
 * the fixture's `applyPatch`, so the same `-c` overrides and whitespace pin hold. Throws with git's
 * output when the patch does not apply (a tree that already holds an oracle file among them).
 */
export function applyOraclePatch(treeDir, patchPath) {
  return applyPatch(treeDir, patchPath)
}

/** `text` with the tree's own paths labelled and every home, temp root and credential shape swept, cut to the cap. */
function detailOf(text, treeDir) {
  const redacted = redactPaths(String(text ?? '').trim(), [...spellingsOf(treeDir, '<tree>')])
  const points = [...redacted]
  return points.length <= DETAIL_MAX ? redacted : `${points.slice(0, DETAIL_MAX - 1).join('')}…`
}

/** The first non-blank line of `text`, or `text` itself when it has none. */
function firstLine(text) {
  return String(text ?? '').split('\n').find((line) => line.trim() !== '') ?? String(text ?? '')
}

/** The environment of the vitest child. */
function childEnv() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    // A run started from inside vitest (this repository's own suite) carries the parent runner's
    // worker and pool variables, and a coverage run carries NODE_V8_COVERAGE, which would write the
    // child's coverage into the parent's report. The oracles run as a fresh, uninstrumented vitest.
    if (key.startsWith('VITEST') || key === 'NODE_V8_COVERAGE') delete env[key]
  }
  return env
}

/** A static seed's verdict over the tree. */
function staticResult(seed, treeDir) {
  const { file, mustMatch = [], mustNotMatch = [] } = seed.oracle
  const base = { seed: seed.id, kind: 'static' }
  const path = typeof file === 'string' ? resolve(treeDir, file) : null
  const rel = path === null ? '' : relative(resolve(treeDir), path)
  if (path === null || rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return { ...base, status: 'error', detail: detailOf(`the oracle file ${JSON.stringify(file)} is not a path inside the tree`, treeDir) }
  }
  if (!existsSync(path)) return { ...base, status: 'error', detail: detailOf(`${file} is missing from the tree`, treeDir) }
  let text
  let compiled
  try {
    text = readFileSync(path, 'utf8')
    compiled = {
      mustMatch: mustMatch.map((source) => ({ source, re: new RegExp(source) })),
      mustNotMatch: mustNotMatch.map((source) => ({ source, re: new RegExp(source) })),
    }
  } catch (error) {
    return { ...base, status: 'error', detail: detailOf(`${file}: ${error instanceof Error ? error.message : String(error)}`, treeDir) }
  }
  const missing = compiled.mustMatch.find(({ re }) => !re.test(text))
  if (missing) return { ...base, status: 'fail', detail: detailOf(`${file}: mustMatch /${missing.source}/ found no match`, treeDir) }
  const present = compiled.mustNotMatch.find(({ re }) => re.test(text))
  if (present) return { ...base, status: 'fail', detail: detailOf(`${file}: mustNotMatch /${present.source}/ matched`, treeDir) }
  return { ...base, status: 'pass', detail: '' }
}

/**
 * One behaviour seed's verdict from the vitest JSON report's entry for its file. A failed
 * assertion is `fail`; a file that failed with no failed assertion (it did not load, or a hook
 * outside the tests threw) is `error`; every test passed, at least one, is `pass`; a file whose
 * tests were all skipped proves nothing and is `error`.
 */
function vitestResult(seed, entry, treeDir) {
  const base = { seed: seed.id, kind: 'vitest' }
  const assertions = Array.isArray(entry.assertionResults) ? entry.assertionResults : []
  const failed = assertions.find((assertion) => assertion.status === 'failed')
  if (failed) {
    const message = (failed.failureMessages ?? []).join('\n')
    return { ...base, status: 'fail', detail: detailOf(`${failed.title ?? ''}: ${firstLine(message)}`, treeDir) }
  }
  const fileMessage = typeof entry.message === 'string' ? entry.message.trim() : ''
  if (fileMessage !== '' || entry.status === 'failed') {
    return { ...base, status: 'error', detail: detailOf(`the oracle file did not run: ${firstLine(fileMessage) || entry.status}`, treeDir) }
  }
  const passed = assertions.filter((assertion) => assertion.status === 'passed').length
  if (passed === 0 || passed !== assertions.length) {
    return { ...base, status: 'error', detail: detailOf(`the oracle file ran ${passed} of ${assertions.length} test(s); the rest did not run`, treeDir) }
  }
  return { ...base, status: 'pass', detail: `${passed} test(s) passed` }
}

/** The repo-relative POSIX path vitest's `name` stands for in `treeDir`, or null outside it. */
function treeRelative(name, realTree) {
  if (typeof name !== 'string') return null
  let real = name
  try {
    real = realpathSync(name)
  } catch (error) {
    // A file gone after the run keeps its reported spelling; anything else is a real fault.
    if (error?.code !== 'ENOENT') throw error
  }
  const rel = relative(realTree, real)
  return rel.startsWith('..') || isAbsolute(rel) ? null : rel.replaceAll('\\', '/')
}

/**
 * Run every seed's oracle over `treeDir` and return one result per seed that carries an oracle, in
 * the order given. `seeds` is `seeds.json`'s `seeds` array (or the whole document). `vitestEntry`
 * is the vitest CLI script (`node_modules/vitest/vitest.mjs`); it is spawned once, as
 * `node <vitestEntry> run test/__oracle__ --root <treeDir> --pool=threads --reporter=json --outputFile <tmp>`,
 * only when a behaviour seed is present, and killed after `timeoutMs`. The tree must already carry
 * the oracle patch (`applyOraclePatch`).
 */
export function runOracles(treeDir, { seeds, vitestEntry, timeoutMs = RUN_TIMEOUT_MS } = {}) {
  const list = Array.isArray(seeds) ? seeds : seeds?.seeds
  if (!Array.isArray(list)) throw new Error('runOracles needs seeds: the seeds array of evals/replay/v1/seeds.json')
  const withOracle = list.filter((seed) => seed?.oracle !== undefined)
  const behaviour = withOracle.filter((seed) => seed.oracle.kind === 'vitest')
  const entries = behaviour.length === 0 ? null : runVitest(treeDir, { vitestEntry, timeoutMs })
  const results = withOracle.map((seed) => {
    if (seed.oracle.kind === 'static') return staticResult(seed, treeDir)
    if (seed.oracle.kind !== 'vitest') {
      return { seed: seed.id, kind: String(seed.oracle.kind), status: 'error', detail: detailOf(`unknown oracle kind ${JSON.stringify(seed.oracle.kind)}`, treeDir) }
    }
    if (entries.failure !== null) return { seed: seed.id, kind: 'vitest', status: 'error', detail: entries.failure }
    const entry = entries.byFile.get(seed.oracle.file)
    if (entry === undefined) {
      return { seed: seed.id, kind: 'vitest', status: 'error', detail: detailOf(`no result for ${seed.oracle.file}: the file is not in the tree or the run did not collect it`, treeDir) }
    }
    return vitestResult(seed, entry, treeDir)
  })
  return { schema: ORACLE_SCHEMA, results }
}

/** The vitest run: its JSON report's entries by tree-relative file, or the one failure every behaviour result then carries. */
function runVitest(treeDir, { vitestEntry, timeoutMs }) {
  if (typeof vitestEntry !== 'string' || !existsSync(vitestEntry)) {
    return { byFile: new Map(), failure: detailOf(`no vitest entry at ${String(vitestEntry)}`, treeDir) }
  }
  const realTree = realpathSync(treeDir)
  const scratch = mkdtempSync(join(tmpdir(), 'stamity-replay-oracle-'))
  const outputFile = join(scratch, 'vitest.json')
  try {
    const started = Date.now()
    const child = spawnSync(
      process.execPath,
      [resolve(vitestEntry), 'run', ORACLE_DIR, '--root', realTree, '--pool=threads', '--reporter=json', '--outputFile', outputFile],
      // Worker threads, not forked workers, and SIGKILL: a timed-out run must take its workers with
      // it, and a forked worker spinning in a synchronous loop would outlive a killed parent.
      { cwd: realTree, encoding: 'utf8', env: childEnv(), maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs, killSignal: 'SIGKILL' },
    )
    if (child.error?.code === 'ETIMEDOUT' || (child.signal !== null && child.signal !== undefined)) {
      return { byFile: new Map(), failure: detailOf(`the oracle run was killed by ${child.signal ?? 'SIGKILL'} after ${Date.now() - started} ms (limit ${timeoutMs} ms)`, treeDir) }
    }
    if (child.error) return { byFile: new Map(), failure: detailOf(`the oracle run did not start: ${child.error.message}`, treeDir) }
    if (!existsSync(outputFile)) {
      const said = firstLine(`${child.stderr ?? ''}\n${child.stdout ?? ''}`)
      return { byFile: new Map(), failure: detailOf(`the oracle run exited ${child.status} with no report: ${said}`, treeDir) }
    }
    let report
    try {
      report = JSON.parse(readFileSync(outputFile, 'utf8'))
    } catch (error) {
      return { byFile: new Map(), failure: detailOf(`the oracle run's report is not JSON: ${error instanceof Error ? error.message : String(error)}`, treeDir) }
    }
    const byFile = new Map()
    for (const entry of Array.isArray(report?.testResults) ? report.testResults : []) {
      const file = treeRelative(entry?.name, realTree)
      if (file !== null) byFile.set(file, entry)
    }
    return { byFile, failure: null }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
