// The replay's per-run scorer (REPLAY-v1 §11, §12, §14): one `stamity/replay-measurement/v1`
// document (`scripts/replay/measure.mjs`) and the driver's `run.json` in, `summary.json`
// (`stamity/replay-summary/v1`) and `RESULTS.md` out, under `evals/replay/runs/<date>-replay-<n>/`.
// `check` validates every committed run folder.
//
// The thresholds are read from the protocol's one `replay-thresholds` block and never restated
// here. A summary carries every total r7 measures, and RESULTS renders each qualifier — the
// readers' skips, the unjoined and transcript-less agents, the walk's skips, the unparseable
// sub-agent lines, the ledger kinds reported beside the gated figure, every notes line — beside
// the figure it qualifies, never folded away. Every string that reaches either file passes
// through `redactPaths` with the fixture root and the worktrees labelled, and `run` refuses to
// write a file that `check` would refuse.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256 } from '../qa/bind.mjs'
import { redactPaths, spellingsOf } from '../qa/redact.mjs'
import { PASS_IDS } from './fixture.mjs'
import { MEASUREMENT_SCHEMA } from './measure.mjs'

const SELF = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(SELF, '..', '..', '..')

export const SUMMARY_SCHEMA = 'stamity/replay-summary/v1'
const THRESHOLDS_SCHEMA = 'stamity/replay-thresholds/v1'
const DEFAULT_PROTOCOL = 'evals/replay/REPLAY-v1.md'
/** §11: `<date>-replay-<n>`, never `-run-<n>` (the eval set's run of record is the newest `-run-<n>`). */
const RUN_ID = /^\d{4}-\d{2}-\d{2}-replay-\d+$/
const SHA256 = /^[0-9a-f]{64}$/
/** The path shapes `check` refuses anywhere in a summary or a RESULTS file. */
const FORBIDDEN_SHAPES = ['/Users/', '/home/', '/private/var/', '/var/folders/']
/**
 * `redactPaths` sweeps the `/private/var/folders/…/T` spelling of the macOS temp root; the bare
 * `/var/folders/…/T` spelling a path that no longer resolves keeps is swept here, under the same label.
 */
const BARE_TMP_PATHS = /\/var\/folders\/[^/\s"']+\/[^/\s"']+\/T(?![^/\s"'])/g
const EXCERPT_MAX = 200
const PASS_COUNT = PASS_IDS.length

/** Every key of the protocol's `replay-thresholds` block and the type of its value (r1). */
const THRESHOLD_TYPES = {
  schema: 'string', lineTolerance: 'number', securityAllRuns: 'boolean', recallMargin: 'number', recallOpportunities: 'number',
  decoyFlags: 'string', lossPerValidSample: 'number', minValidSamplesChanged: 'number', verdictClassMinPasses: 'number',
  roundsTolerance: 'number', approvedUnfixed: 'string', loopCharsRatioMax: 'number', loopCharsReference: 'string',
  loopCharsScope: 'string', subagentTokensRatioMax: 'number', subagentTokensScope: 'string', subagentTokensReference: 'string',
  scoredRunsPerShape: 'number', scoredSpreadSeeds: 'number', scoredRunsIfVariance: 'number', securityExemption: 'string',
  evalSetFloors: 'string',
}

/** Every total of the measurement, carried into the summary whole (a test pins it to r7's list). */
export const TOTALS_KEYS = [
  'loopChars', 'loopCharsPerPass', 'breakdown', 'unattributedShare', 'perPassUnreliable', 'unresolvedDeliveriesAndSends',
  'ledgerBeside', 'subagentTokens', 'subagentTokensPerPass', 'subagentOutputTokens', 'notificationTrailerTokens',
  'unjoinedSubagents', 'agentsWithoutTranscript', 'walkSkipped', 'mainContextChars', 'contextTokensPerPass', 'compactionsAuto',
  'projectedPer10', 'recall', 'readerSkips', 'decoyFalseFlags', 'unmatched', 'oraclePass', 'oracleError',
]
const NUMERIC_TOTALS = [
  'loopChars', 'loopCharsPerPass', 'unattributedShare', 'unresolvedDeliveriesAndSends', 'subagentTokens', 'subagentTokensPerPass',
  'subagentOutputTokens', 'notificationTrailerTokens', 'unjoinedSubagents', 'mainContextChars', 'contextTokensPerPass',
  'compactionsAuto', 'projectedPer10', 'decoyFalseFlags', 'unmatched', 'oraclePass', 'oracleError',
]
const BREAKDOWN_KEYS = ['returns', 'prompts', 'ledger', 'briefs', 'reportReads', 'resumes']

/**
 * The §12 rows a notes line of `measure.mjs` qualifies, by a phrase the line always carries (a test
 * pins each phrase to `measure.mjs`). A line matching none is rendered under the other notes.
 */
export const NOTE_ROWS = [
  { includes: 'SendMessage result(s) over ', rows: ['loop-chars', 'verdict-rounds'] },
  { includes: 'delivery joined to no agent: ', rows: ['loop-chars', 'pooled-recall', 'verdict-rounds'] },
  { includes: 'reviewer round with no readable verdict: ', rows: ['verdict-rounds'] },
  { includes: ' built from its sub-agent file (', rows: ['loop-chars'] },
  { includes: 'SendMessage joined to no agent: ', rows: ['loop-chars'] },
  { includes: ' has no loop dispatch: ', rows: ['loop-chars', 'subagent-tokens'] },
  { includes: 'sub-agent(s) joined to no dispatch and naming no agent type', rows: ['subagent-tokens'] },
  { includes: 'sub-agent tokens reconciled: ', rows: ['subagent-tokens'] },
  { includes: 'no snapshot under captures/snapshots/', rows: ['pooled-recall', 'security-seeds'] },
  { includes: 'present in the snapshot and not found by a verdict role', rows: ['pooled-recall'] },
  { includes: 'the file is absent from every snapshot copy of the pass', rows: ['pooled-recall', 'security-seeds'] },
]

/** The §12 rows, in the protocol's order. */
const ROW_IDS = ['security-seeds', 'pooled-recall', 'decoy-flags', 'compaction-loss', 'verdict-class', 'verdict-rounds', 'approved-unfixed', 'loop-chars', 'subagent-tokens', 'eval-set-floors']

// ---------- small helpers ----------

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const str = (v) => (typeof v === 'string' && v !== '' ? v : null)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const sum = (list, f) => list.reduce((a, x) => a + f(x), 0)
const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)))
const cutCodePoints = (text, max) => [...text].slice(0, max).join('')
const strOrNull = (v) => v === null || typeof v === 'string'
const numOrNull = (v) => v === null || (typeof v === 'number' && Number.isFinite(v))

function median(values) {
  const sorted = values.toSorted((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Every `/var/…` spelling beside its `/private/var/…` twin, so a root that no longer resolves is still met. */
function withTwins(pairs) {
  const out = []
  for (const [from, label] of pairs) {
    out.push([from, label])
    if (from.startsWith('/private/var/')) out.push([from.slice('/private'.length), label])
    else if (from.startsWith('/var/')) out.push([`/private${from}`, label])
  }
  // Longest first, so a worktree under the fixture root keeps its own label.
  return out.toSorted((a, b) => b[0].length - a[0].length)
}

const sweep = (text, pairs) => redactPaths(text, pairs).replaceAll(BARE_TMP_PATHS, '<tmp>')

function redactDeep(value, pairs) {
  if (typeof value === 'string') return sweep(value, pairs)
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, pairs))
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v, pairs)]))
  return value
}

/** The path shapes of `FORBIDDEN_SHAPES` that `text` carries. */
const forbiddenIn = (text) => FORBIDDEN_SHAPES.filter((shape) => text.includes(shape))

// ---------- thresholds ----------

/**
 * The thresholds of the protocol's one `replay-thresholds` block: exactly one block, a flat JSON
 * object, every key of r1 with its type, no key twice (which `JSON.parse` would hide by keeping the
 * last), and no other key. Throws naming the first problem.
 */
export function parseThresholds(md) {
  const lines = String(md ?? '').split(/\r?\n/)
  const blocks = []
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^ {0,3}```replay-thresholds[ \t]*$/.test(lines[i])) continue
    const end = lines.findIndex((line, j) => j > i && /^ {0,3}```[ \t]*$/.test(line))
    if (end === -1) throw new Error('replay-thresholds: the block is never closed')
    blocks.push(lines.slice(i + 1, end).join('\n'))
    i = end
  }
  if (blocks.length !== 1) throw new Error(`replay-thresholds: expected exactly one replay-thresholds block, found ${blocks.length}`)
  const body = blocks[0]
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch (error) {
    throw new Error(`replay-thresholds: the block is not JSON (${error.message})`, { cause: error })
  }
  if (!isObject(parsed)) throw new Error('replay-thresholds: the block is not a JSON object')
  // In JSON a string followed by `:` is always a key, and string tokens are matched in order.
  const seen = new Set()
  for (const m of body.matchAll(/"((?:[^"\\]|\\.)*)"(\s*:)?/g)) {
    if (!m[2]) continue
    const key = JSON.parse(`"${m[1]}"`)
    if (seen.has(key)) throw new Error(`replay-thresholds: duplicated key "${key}"`)
    seen.add(key)
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in THRESHOLD_TYPES)) throw new Error(`replay-thresholds: unknown key "${key}"`)
    if (typeof value !== THRESHOLD_TYPES[key]) throw new Error(`replay-thresholds: "${key}" must be a ${THRESHOLD_TYPES[key]}`)
  }
  for (const key of Object.keys(THRESHOLD_TYPES)) if (!(key in parsed)) throw new Error(`replay-thresholds: missing key "${key}"`)
  if (parsed.schema !== THRESHOLDS_SCHEMA) throw new Error(`replay-thresholds: schema is ${JSON.stringify(parsed.schema)}, not ${THRESHOLDS_SCHEMA}`)
  return parsed
}

// ---------- summarize ----------

function checkMeasurement(m) {
  if (!isObject(m) || m.schema !== MEASUREMENT_SCHEMA) throw new Error(`the measurement is not ${MEASUREMENT_SCHEMA}`)
  if (!Array.isArray(m.passes) || m.passes.map((p) => p?.id).join(',') !== PASS_IDS.join(',')) throw new Error(`measurement: passes are not ${PASS_IDS.join(', ')}`)
  if (!isObject(m.totals)) throw new Error('measurement: no totals')
  for (const key of TOTALS_KEYS) if (!(key in m.totals)) throw new Error(`measurement: totals.${key} is missing`)
  for (const key of ['invalid', 'notes', 'compactionSamples', 'adjudication']) if (!Array.isArray(m[key])) throw new Error(`measurement: ${key} is not a list`)
  if (!isObject(m.models) || !isObject(m.wholeBranch)) throw new Error('measurement: models or wholeBranch is missing')
}

/** The provenance fields read from run.json, each named by its summary path. */
function provenanceOf(run) {
  const at = (obj, key) => (isObject(obj) ? obj[key] : undefined)
  return {
    cli: { commit: str(at(run.cli, 'commit')), version: str(at(run.cli, 'version')), tarballSha256: str(at(run.cli, 'tarballSha256')) },
    client: { version: str(at(run.client, 'version')), binarySha256: str(at(run.client, 'binarySha256')) },
    fixture: { baseCommit: str(at(run.fixture, 'baseCommit')), planSha256: str(at(run.fixture, 'planSha256')), depsSha256: str(at(run.fixture, 'depsSha256')) },
    timing: {
      activeMs: num(at(run.timing, 'activeMs')), pausedMs: num(at(run.timing, 'pausedMs')), capacityHolds: num(at(run.timing, 'capacityHolds')),
      nudges: num(at(run.timing, 'nudges')), restarts: num(at(run.timing, 'restarts')),
    },
  }
}

/**
 * The `stamity/replay-summary/v1` document of one run. `runJson` is the driver's `run.json`, whose
 * `instrument` (`commit`, `files`), `cli`, `client`, `fixture` (`root`, `baseCommit`, `planSha256`,
 * `depsSha256`), `worktrees` and `timing` carry the provenance; `protocolSha` is the sha256 of the
 * protocol file. A missing provenance field is recorded as null and named in `notDone`. The
 * protocol is read at the instrument commit (§13), so `protocol.commit` is that commit.
 */
export function summarize(measurement, runJson, protocolSha, { protocolPath = DEFAULT_PROTOCOL, runId, kind } = {}) {
  checkMeasurement(measurement)
  const m = measurement
  const run = isObject(runJson) ? runJson : {}
  const instrument = isObject(run.instrument) ? run.instrument : {}
  const prov = provenanceOf(run)
  const files = isObject(instrument.files) ? Object.fromEntries(Object.entries(instrument.files).filter(([, v]) => typeof v === 'string')) : {}
  const resolvedModels = new Set(Object.keys(m.models.orchestrator ?? {}))
  for (const s of m.models.subagents ?? []) for (const model of Object.keys(s?.resolved ?? {})) resolvedModels.add(model)
  resolvedModels.delete('<synthetic>')
  const summaryKind = kind ?? m.kind ?? run.kind ?? null

  const notDone = []
  if (summaryKind === 'pilot') notDone.push('pilot — not scored: excluded from the COMPARISON inputs except the pilot-variance check (§10)')
  for (const reason of m.invalid) notDone.push(`invalid run — ${reason}; replace it (§10: at most 2 replacements per shape)`)
  for (const [group, fields] of Object.entries(prov)) for (const [field, value] of Object.entries(fields)) if (value === null) notDone.push(`run.json records no ${group}.${field}`)
  if (Object.keys(files).length === 0) notDone.push('run.json records no instrument.files')
  if (m.models.init == null) notDone.push('the init event names no orchestrator model')

  const summary = {
    schema: SUMMARY_SCHEMA,
    runId: runId ?? m.runId ?? run.runId ?? null,
    kind: summaryKind,
    shape: m.shape ?? run.shape ?? null,
    protocol: { path: protocolPath, sha256: protocolSha, commit: str(instrument.commit) },
    instrument: { commit: str(instrument.commit), files },
    cli: prov.cli,
    client: { ...prov.client, orchestratorModel: m.models.init ?? null, resolvedModels: [...resolvedModels].toSorted() },
    fixture: prov.fixture,
    mechanism: m.mechanism ?? null,
    timing: prov.timing,
    passes: m.passes.map((p) => ({
      id: p.id,
      loopChars: p.loopChars,
      breakdown: Object.fromEntries(BREAKDOWN_KEYS.map((k) => [k, p.breakdown?.[k] ?? 0])),
      subagentTokens: p.subagentTokens,
      verdict: { finalClass: p.verdict?.finalClass ?? null, rounds: p.verdict?.rounds ?? 0, approvedWithSeedUnfixed: p.verdict?.approvedWithSeedUnfixed === true },
      // `class` rides along: the comparison's security row needs to know which seeds are security seeds.
      seeds: (p.seeds ?? []).map((s) => ({
        id: s.id, class: s.class ?? null, present: s.present ?? null, caughtByImplementer: s.caughtByImplementer === true, found: s.found === true,
        foundRound1: s.foundRound1 === true, stage: s.stage ?? null, oracle: s.oracle ?? null,
      })),
      decoysFlagged: [...(p.decoysFlagged ?? [])],
    })),
    totals: Object.fromEntries(TOTALS_KEYS.map((k) => [k, clone(m.totals[k])])),
    compactionSamples: m.compactionSamples.map((s) => ({
      n: s.n ?? null, placement: s.placement ?? null, trigger: s.trigger ?? null, preTokens: s.preTokens ?? null, postTokens: s.postTokens ?? null,
      atRisk: s.atRisk ?? 0, lost: s.lost ?? 0, valid: s.valid === true, ...(typeof s.reason === 'string' ? { reason: s.reason } : {}),
    })),
    wholeBranch: { finalClass: m.wholeBranch.finalClass ?? null, rounds: m.wholeBranch.rounds ?? 0 },
    adjudication: m.adjudication.map((a) => ({ item: a.item, pass: a.pass ?? null, role: a.role ?? null, locator: String(a.locator ?? ''), excerpt: String(a.excerpt ?? '') })),
    models: clone(m.models),
    notes: [...m.notes],
    invalid: [...m.invalid],
    notDone,
  }

  const worktrees = Array.isArray(run.worktrees) ? run.worktrees.map((w) => (typeof w === 'string' ? w : w?.path ?? w?.worktree)).filter((w) => typeof w === 'string') : []
  const fixtureRoot = isObject(run.fixture) ? run.fixture.root : undefined
  const pairs = withTwins([...spellingsOf(fixtureRoot, '<fixture>'), ...worktrees.flatMap((w) => spellingsOf(w, '<worktree>'))])
  const out = redactDeep(summary, pairs)
  for (const a of out.adjudication) a.excerpt = cutCodePoints(a.excerpt, EXCERPT_MAX)
  return out
}

// ---------- validation ----------

/** Every way `s` departs from `stamity/replay-summary/v1`; empty when it conforms. */
export function validateSummary(s) {
  const problems = []
  const need = (cond, what) => {
    if (!cond) problems.push(what)
  }
  if (!isObject(s)) return ['the summary is not a JSON object']
  need(s.schema === SUMMARY_SCHEMA, `schema is not ${SUMMARY_SCHEMA}`)
  need(typeof s.runId === 'string' && RUN_ID.test(s.runId), 'runId is not <YYYY-MM-DD>-replay-<n>')
  need(s.kind === 'pilot' || s.kind === 'scored', 'kind is not pilot or scored')
  need(s.shape === 'baseline' || s.shape === 'changed', 'shape is not baseline or changed')
  need(isObject(s.protocol) && typeof s.protocol.path === 'string' && SHA256.test(s.protocol.sha256 ?? '') && typeof s.protocol.commit === 'string', 'protocol is not {path, sha256, commit}')
  need(isObject(s.instrument) && typeof s.instrument.commit === 'string' && s.instrument.commit !== '' && isObject(s.instrument.files) && Object.values(s.instrument.files).every((v) => typeof v === 'string'), 'instrument is not {commit, files}')
  need(isObject(s.cli) && ['commit', 'version', 'tarballSha256'].every((k) => strOrNull(s.cli[k])), 'cli is not {commit, version, tarballSha256}')
  need(isObject(s.client) && ['version', 'binarySha256', 'orchestratorModel'].every((k) => strOrNull(s.client[k])) && Array.isArray(s.client.resolvedModels), 'client is not {version, binarySha256, orchestratorModel, resolvedModels}')
  need(isObject(s.fixture) && ['baseCommit', 'planSha256', 'depsSha256'].every((k) => strOrNull(s.fixture[k])), 'fixture is not {baseCommit, planSha256, depsSha256}')
  need(s.mechanism === 'interrupt' || s.mechanism === 'auto-window', 'mechanism is not interrupt or auto-window')
  need(isObject(s.timing) && ['activeMs', 'pausedMs', 'capacityHolds', 'nudges', 'restarts'].every((k) => numOrNull(s.timing[k])), 'timing is not {activeMs, pausedMs, capacityHolds, nudges, restarts}')
  const passesOk = Array.isArray(s.passes) && s.passes.map((p) => p?.id).join(',') === PASS_IDS.join(',')
  need(passesOk, `passes are not ${PASS_IDS.join(', ')}`)
  if (passesOk) {
    for (const p of s.passes) {
      need(typeof p.loopChars === 'number' && typeof p.subagentTokens === 'number' && isObject(p.breakdown) && BREAKDOWN_KEYS.every((k) => typeof p.breakdown[k] === 'number'), `pass ${p.id}: loopChars, breakdown or subagentTokens is malformed`)
      need(isObject(p.verdict) && strOrNull(p.verdict.finalClass) && typeof p.verdict.rounds === 'number' && typeof p.verdict.approvedWithSeedUnfixed === 'boolean', `pass ${p.id}: verdict is malformed`)
      need(Array.isArray(p.seeds) && p.seeds.every((x) => typeof x?.id === 'string' && typeof x.found === 'boolean' && typeof x.caughtByImplementer === 'boolean' && typeof x.foundRound1 === 'boolean' && (x.present === null || typeof x.present === 'boolean')), `pass ${p.id}: seeds are malformed`)
      need(Array.isArray(p.decoysFlagged) && p.decoysFlagged.every((d) => typeof d === 'string'), `pass ${p.id}: decoysFlagged is malformed`)
    }
  }
  const totalsOk = isObject(s.totals) && TOTALS_KEYS.every((k) => k in s.totals)
  need(totalsOk, 'totals lack a measured key')
  if (totalsOk) {
    for (const k of NUMERIC_TOTALS) need(typeof s.totals[k] === 'number' && Number.isFinite(s.totals[k]), `totals.${k} is not a number`)
    need(isObject(s.totals.recall) && typeof s.totals.recall.found === 'number' && typeof s.totals.recall.denominator === 'number' && isObject(s.totals.recall.byClass), 'totals.recall is not {found, denominator, byClass}')
    need(isObject(s.totals.readerSkips), 'totals.readerSkips is not an object')
  }
  need(Array.isArray(s.compactionSamples) && s.compactionSamples.every((c) => typeof c?.atRisk === 'number' && typeof c.lost === 'number' && typeof c.valid === 'boolean'), 'compactionSamples are malformed')
  need(isObject(s.wholeBranch) && strOrNull(s.wholeBranch.finalClass), 'wholeBranch is not {finalClass}')
  need(Array.isArray(s.adjudication) && s.adjudication.every((a) => typeof a?.item === 'string' && typeof a.locator === 'string' && typeof a.excerpt === 'string' && [...a.excerpt].length <= EXCERPT_MAX), `adjudication is malformed or an excerpt is over ${EXCERPT_MAX} characters`)
  for (const key of ['notes', 'invalid', 'notDone']) need(Array.isArray(s[key]) && s[key].every((x) => typeof x === 'string'), `${key} is not a list of strings`)
  return problems
}

// ---------- RESULTS.md ----------

const cell = (v) => String(v).replaceAll('|', '\\|').replace(/\r?\n/g, ' ')
const fmt = (v, digits = 0) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : 'n/a')
const pct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : 'n/a')
const securitySeedsOf = (s) => s.passes.flatMap((p) => p.seeds.filter((x) => x.class === 'security'))
/** §12: a security seed the implementer removed before the lens started counts as found. */
const securityHeld = (x) => x.found || x.caughtByImplementer

const bullets = (list) => (list.length === 0 ? ['- no notes line'] : list.map((x) => `- ${x}`))

/** The notes lines filed beside each §12 row, and the ones no row claims. */
function notesByRow(notes) {
  const byRow = Object.fromEntries(ROW_IDS.map((id) => [id, []]))
  const other = []
  for (const note of notes) {
    const kind = NOTE_ROWS.find((k) => note.includes(k.includes))
    if (kind) for (const row of kind.rows) byRow[row].push(note)
    else other.push(note)
  }
  return { byRow, other }
}

function checkReferences(summary, reference) {
  if (reference.length === 0) return
  if (summary.shape !== 'changed' || summary.kind !== 'scored') throw new Error('references apply to a changed-shape scored run only')
  for (const [k, ref] of reference.entries()) {
    const problems = validateSummary(ref)
    if (problems.length > 0) throw new Error(`reference ${k + 1} is no replay summary: ${problems[0]}`)
    if (ref.shape !== 'baseline' || ref.kind !== 'scored') throw new Error(`reference ${k + 1} (${ref.runId}) is not a baseline scored run`)
    if (ref.protocol.sha256 !== summary.protocol.sha256) throw new Error(`reference ${k + 1} (${ref.runId}) was scored under protocol sha256 ${ref.protocol.sha256}, not ${summary.protocol.sha256}`)
  }
}

/** The per-run check of each §12 row against the baseline references, where the rule binds per run. */
function perRunChecks(s, t, reference) {
  const out = {}
  const pooled = 'pooled — decided in COMPARISON-v1'
  for (const id of ROW_IDS) out[id] = { verdict: pooled, baseline: '' }
  const refLoop = median(reference.map((r) => r.totals.loopCharsPerPass))
  const ratio = refLoop === 0 ? (s.totals.loopCharsPerPass === 0 ? 0 : Infinity) : s.totals.loopCharsPerPass / refLoop
  out['loop-chars'] = {
    verdict: `${s.totals.loopCharsPerPass <= t.loopCharsRatioMax * refLoop ? 'PASS' : 'FAIL'} — ${fmt(ratio, 3)} × the baseline median (≤ ${t.loopCharsRatioMax})`,
    baseline: `median ${fmt(refLoop)} per pass over ${reference.length} run(s)`,
  }
  const missedBy = (ref, id) => ref.passes.some((p) => p.seeds.some((x) => x.id === id && !securityHeld(x)))
  const exempt = []
  const missed = []
  for (const x of securitySeedsOf(s)) {
    if (reference.some((ref) => missedBy(ref, x.id))) exempt.push(x.id)
    else if (!securityHeld(x)) missed.push(x.id)
  }
  out['security-seeds'] = {
    verdict: `${missed.length === 0 ? 'PASS' : `FAIL — missed: ${missed.join(', ')}`}${exempt.length > 0 ? ` — exempt: ${exempt.join(', ')}` : ''}`,
    baseline: `${reference.filter((ref) => securitySeedsOf(ref).every(securityHeld)).length} of ${reference.length} run(s) held every security seed`,
  }
  const valid = s.compactionSamples.filter((c) => c.valid)
  out['compaction-loss'] = {
    verdict: valid.length === 0 ? `no valid sample in this run — the minimum of ${t.minValidSamplesChanged} is pooled, decided in COMPARISON-v1` : `${valid.every((c) => c.lost <= t.lossPerValidSample) ? 'PASS' : 'FAIL'} — lost ${sum(valid, (c) => c.lost)} over ${valid.length} valid sample(s)`,
    baseline: '',
  }
  const found = sum(reference, (r) => r.totals.recall.found)
  const denominator = sum(reference, (r) => r.totals.recall.denominator)
  out['pooled-recall'].baseline = `${found}/${denominator} pooled${denominator > 0 ? ` = ${fmt((found / denominator) * t.recallOpportunities, 2)} of ${t.recallOpportunities}` : ''}`
  out['decoy-flags'].baseline = `${fmt(sum(reference, (r) => r.totals.decoyFalseFlags) / reference.length, 2)} per run`
  out['approved-unfixed'].baseline = `${fmt(sum(reference, (r) => r.passes.filter((p) => p.verdict.approvedWithSeedUnfixed).length) / reference.length, 2)} per run`
  const refTokens = sum(reference, (r) => r.totals.subagentTokensPerPass) / reference.length
  out['subagent-tokens'].baseline = `mean ${fmt(refTokens)} per pass; this run ${fmt(refTokens === 0 ? NaN : s.totals.subagentTokensPerPass / refTokens, 3)} × it`
  out['eval-set-floors'].verdict = 'CARRIED to session 2'
  return out
}

/**
 * RESULTS.md of one run: the head with the pins and the protocol sha; the per-metric table beside
 * each §12 threshold (a per-run column only where baseline references are supplied); what stands
 * beside each figure; the per-pass table; seeds; decoys; compaction samples; adjudication; then the
 * closing line and `Not done:`. `reference` is the baseline scored summaries a changed run is read
 * against; the verdict of record is always COMPARISON-v1's.
 */
export function renderResults(summary, thresholds, reference = []) {
  const s = summary
  const t = thresholds
  const refs = reference ?? []
  checkReferences(s, refs)
  const T = s.totals
  const lines = []
  const push = (...xs) => lines.push(...xs)
  const pilot = s.kind === 'pilot'

  push(pilot ? `# Replay run \`${s.runId}\` — pilot — not scored (${s.shape} shape)` : `# Replay run \`${s.runId}\` — ${s.shape} shape, ${s.kind}`, '')
  if (pilot) push('This run is a pilot. It is not scored, and it enters the comparison only through the pilot-variance check (§10).', '')
  push(
    `- Protocol: REPLAY-v1 (\`${s.protocol.path}\`), sha256 \`${s.protocol.sha256}\`, read at commit \`${s.protocol.commit}\`.`,
    `- Instrument: commit \`${s.instrument.commit}\`, ${Object.keys(s.instrument.files).length} file(s) hashed.`,
    `- CLI: commit \`${s.cli.commit ?? 'unrecorded'}\`, version ${s.cli.version ?? 'unrecorded'}, tarball sha256 \`${s.cli.tarballSha256 ?? 'unrecorded'}\`.`,
    `- Client: Claude Code ${s.client.version ?? 'unrecorded'}, binary sha256 \`${s.client.binarySha256 ?? 'unrecorded'}\`; orchestrator model \`${s.client.orchestratorModel ?? 'unrecorded'}\` (pin \`${s.models?.pin ?? 'unrecorded'}\`); models answering: ${s.client.resolvedModels.map((x) => `\`${x}\``).join(', ') || 'none recorded'}.`,
    `- Fixture: base commit \`${s.fixture.baseCommit ?? 'unrecorded'}\`, plan sha256 \`${s.fixture.planSha256 ?? 'unrecorded'}\`, deps sha256 \`${s.fixture.depsSha256 ?? 'unrecorded'}\`.`,
    `- Compaction mechanism (§7): \`${s.mechanism}\`.`,
    `- Timing: active ${fmt(s.timing.activeMs)} ms, paused ${fmt(s.timing.pausedMs)} ms, capacity holds ${fmt(s.timing.capacityHolds)}, nudges ${fmt(s.timing.nudges)}, restarts ${fmt(s.timing.restarts)}.`,
    s.invalid.length === 0 ? '- Validity: valid.' : `- Validity: INVALID — ${s.invalid.length} reason(s): ${s.invalid.join('; ')}.`,
    '',
  )

  // The per-metric table.
  const security = securitySeedsOf(s)
  const rc = T.recall
  const valid = s.compactionSamples.filter((c) => c.valid)
  const passList = (f) => s.passes.map((p) => `${p.id} ${f(p)}`).join(', ')
  const rs = T.readerSkips ?? {}
  const unread = rs.unreadFreeText ?? {}
  const unparseable = sum(s.models?.subagents ?? [], (x) => x.unparseableLines ?? 0)
  const rows = {
    'security-seeds': {
      threshold: `every security seed in every changed scored run; implementer-removed counts as found (securityAllRuns ${t.securityAllRuns}, securityExemption ${t.securityExemption})`,
      value: `${security.filter(securityHeld).length} of ${security.length} held (${security.filter((x) => x.caughtByImplementer).length} caught by the implementer, ${security.filter((x) => x.present === null).length} with presence unknown)`,
    },
    'pooled-recall': {
      threshold: `changed ≥ baseline − ${t.recallMargin} of ${t.recallOpportunities} (recallMargin ${t.recallMargin}, recallOpportunities ${t.recallOpportunities})`,
      value: `${rc.found}/${rc.denominator}${rc.denominator > 0 ? ` = ${fmt((rc.found / rc.denominator) * t.recallOpportunities, 2)} of ${t.recallOpportunities}` : ''}`,
    },
    'decoy-flags': { threshold: `per-run rate ${t.decoyFlags} (decoyFlags)`, value: `${T.decoyFalseFlags} flagged` },
    'compaction-loss': {
      threshold: `lost ≤ ${t.lossPerValidSample} in every valid changed sample, ≥ ${t.minValidSamplesChanged} valid sample(s) (lossPerValidSample, minValidSamplesChanged)`,
      value: `${valid.length} valid of ${s.compactionSamples.length} sample(s), lost ${sum(valid, (c) => c.lost)}`,
    },
    'verdict-class': { threshold: `the same modal final class on ≥ ${t.verdictClassMinPasses} of ${PASS_COUNT} passes (verdictClassMinPasses)`, value: passList((p) => p.verdict.finalClass ?? 'none') },
    'verdict-rounds': { threshold: `median rounds within ±${t.roundsTolerance} on every pass (roundsTolerance)`, value: passList((p) => p.verdict.rounds) },
    'approved-unfixed': { threshold: `per-run rate ${t.approvedUnfixed} (approvedUnfixed)`, value: `${s.passes.filter((p) => p.verdict.approvedWithSeedUnfixed).length} pass(es)` },
    'loop-chars': {
      threshold: `every changed scored run ≤ ${t.loopCharsRatioMax} × the baseline median (loopCharsRatioMax ${t.loopCharsRatioMax}, loopCharsReference ${t.loopCharsReference}, loopCharsScope ${t.loopCharsScope})`,
      value: `${fmt(T.loopCharsPerPass)} per pass (${T.loopChars} ÷ ${PASS_COUNT})`,
    },
    'subagent-tokens': {
      threshold: `changed mean ≤ ${t.subagentTokensRatioMax} × the baseline mean (subagentTokensRatioMax ${t.subagentTokensRatioMax}, subagentTokensScope ${t.subagentTokensScope}, subagentTokensReference ${t.subagentTokensReference})`,
      value: `${fmt(T.subagentTokensPerPass)} per pass (${T.subagentTokens} ÷ ${PASS_COUNT})`,
    },
    'eval-set-floors': { threshold: `checked at the 1.10.0 baseline run of the eval set (evalSetFloors ${t.evalSetFloors})`, value: 'not measured by the replay' },
  }
  const perRun = refs.length > 0 ? perRunChecks(s, t, refs) : null
  push('## Metrics beside their thresholds (§12)', '')
  if (perRun) {
    push(`The per-run check reads this run against ${refs.length} baseline scored run(s): ${refs.map((r) => `\`${r.runId}\``).join(', ')}. The verdict of record is COMPARISON-v1's.`, '')
    push('| Row | Threshold | This run | Baseline reference | Per-run check |', '|---|---|---|---|---|')
    for (const id of ROW_IDS) push(`| \`${id}\` | ${cell(rows[id].threshold)} | ${cell(rows[id].value)} | ${cell(perRun[id].baseline || '—')} | ${cell(perRun[id].verdict)} |`)
  } else {
    push('| Row | Threshold | This run |', '|---|---|---|')
    for (const id of ROW_IDS) push(`| \`${id}\` | ${cell(rows[id].threshold)} | ${cell(rows[id].value)} |`)
  }
  push('')

  // What stands beside each figure.
  const { byRow, other } = notesByRow(s.notes)
  push('### Beside the figures', '')
  push('#### Beside `security-seeds`', '', ...bullets(byRow['security-seeds']), '')
  push(
    '#### Beside `pooled-recall`',
    '',
    `- readers' skips (never folded into recall): unread free-text blocks severity-without-locator ${unread['severity-without-locator'] ?? 0}, locator-without-severity ${unread['locator-without-severity'] ?? 0}; digest errors ${rs.digestErrors ?? 0}; findings-block errors ${rs.findingsBlockErrors ?? 0}; ledger parse errors ${rs.ledgerParseErrors ?? 0}`,
    `- unmatched Critical or Warning findings: ${T.unmatched} (reported, not thresholded)`,
    `- by class: ${Object.entries(rc.byClass).map(([k, v]) => `${k} ${v.found}/${v.denominator}`).join(', ') || 'none'}`,
    '- a changed-shape report is read for its `stamity-findings` block only, while a baseline free-text return is read whole: a term that stands only in a report\'s prose goes to adjudication, never to the score — a known conservative asymmetry that can only cost the changed shape recall',
    ...bullets(byRow['pooled-recall']),
    '',
  )
  push('#### Beside `decoy-flags`', '', ...bullets(byRow['decoy-flags']), '')
  push(
    '#### Beside `compaction-loss`',
    '',
    `- automatic compactions: ${T.compactionsAuto}; projected compactions per 10 passes: ${fmt(T.projectedPer10, 2)} (context ${fmt(T.contextTokensPerPass)} tokens per pass, reported only)`,
    ...s.compactionSamples.filter((c) => typeof c.reason === 'string').map((c) => `- sample ${c.n}: ${c.reason}`),
    ...bullets(byRow['compaction-loss']),
    '',
  )
  push('#### Beside `verdict-class`', '', `- whole-branch review: ${s.wholeBranch.finalClass ?? 'none'} after ${s.wholeBranch.rounds} round(s)`, ...bullets(byRow['verdict-class']), '')
  push('#### Beside `verdict-rounds`', '', ...bullets(byRow['verdict-rounds']), '')
  push('#### Beside `approved-unfixed`', '', `- oracles passing: ${T.oraclePass}; oracles erroring (counted unfixed): ${T.oracleError}`, ...bullets(byRow['approved-unfixed']), '')
  const beside = Object.entries(T.ledgerBeside ?? {})
  push(
    '#### Beside `loop-chars`',
    '',
    `- breakdown: ${BREAKDOWN_KEYS.map((k) => `${k} ${T.breakdown?.[k] ?? 0}`).join(', ')} (resumes reported apart, outside the figure)`,
    `- unattributed share ${pct(T.unattributedShare)}${T.perPassUnreliable ? ' — the per-pass split is UNRELIABLE (over 20% unattributed)' : ''}`,
    `- unresolved deliveries and sends: ${T.unresolvedDeliveriesAndSends} (kept in the figure, unattributed)`,
    `- ledger kinds beside the gated figure, never inside it: ${beside.length === 0 ? 'none' : beside.map(([k, v]) => `${k} ${v.calls} call(s), ${v.chars} characters`).join('; ')}`,
    `- walk skipped: ${JSON.stringify(T.walkSkipped)}`,
    `- orchestrator context: ${T.mainContextChars} characters in the main transcript`,
    ...bullets(byRow['loop-chars']),
    '',
  )
  const withUnparseable = (s.models?.subagents ?? []).filter((x) => (x.unparseableLines ?? 0) > 0)
  push(
    '#### Beside `subagent-tokens`',
    '',
    `- sub-agents joined to no dispatch: ${T.unjoinedSubagents} (their tokens kept in the sum, unattributed)`,
    `- dispatched agents with no transcript: ${T.agentsWithoutTranscript.length}${T.agentsWithoutTranscript.length > 0 ? ` — ${T.agentsWithoutTranscript.map((a) => `${a.role ?? 'unknown'} ${a.pass ?? 'no pass'} (line ${a.line ?? '?'})`).join(', ')}` : ''}`,
    `- unparseable sub-agent lines: ${unparseable} over ${(s.models?.subagents ?? []).length} sub-agent(s)${withUnparseable.length > 0 ? ` — ${withUnparseable.map((x) => `${x.agentId} ${x.unparseableLines}`).join(', ')}` : ''}`,
    `- output tokens ${T.subagentOutputTokens}; notification trailer ${T.notificationTrailerTokens} (final context, not spend)`,
    ...bullets(byRow['subagent-tokens']),
    '',
  )
  push('#### Beside `eval-set-floors`', '', '- carried to session 2 of the package, where the eval set runs once as the new baseline', '')
  push('#### Other measurement notes', '', ...bullets(other), '')

  // The per-pass table.
  push('## Per pass', '', '| Pass | Loop chars | Returns | Prompts | Ledger | Briefs | Report reads | Resumes | Sub-agent tokens | Final class | Rounds | Approved with a seed unfixed | Decoys flagged |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const p of s.passes) {
    const b = p.breakdown
    push(`| ${p.id} | ${p.loopChars} | ${b.returns} | ${b.prompts} | ${b.ledger} | ${b.briefs} | ${b.reportReads} | ${b.resumes} | ${p.subagentTokens} | ${p.verdict.finalClass ?? 'none'} | ${p.verdict.rounds} | ${p.verdict.approvedWithSeedUnfixed ? 'yes' : 'no'} | ${cell(p.decoysFlagged.join(', ') || '—')} |`)
  }
  push('')

  push('## Seeds', '', '| Seed | Class | Pass | Present | Caught by the implementer | Found | Round 1 | Stage | Oracle |', '|---|---|---|---|---|---|---|---|---|')
  for (const p of s.passes) {
    for (const x of p.seeds) push(`| ${cell(x.id)} | ${cell(x.class ?? '—')} | ${p.id} | ${x.present === null ? 'unknown' : x.present ? 'yes' : 'no'} | ${x.caughtByImplementer ? 'yes' : 'no'} | ${x.found ? 'yes' : 'no'} | ${x.foundRound1 ? 'yes' : 'no'} | ${x.stage ?? '—'} | ${x.oracle ?? 'no result'} |`)
  }
  push('')

  push('## Decoys', '', `Decoys flagged Critical or Warning: ${T.decoyFalseFlags}.`, '')
  for (const p of s.passes) if (p.decoysFlagged.length > 0) push(`- ${p.id}: ${p.decoysFlagged.join(', ')}`)
  push('')

  push('## Compaction samples', '', '| Sample | Placement | Trigger | Tokens before | Tokens after | At risk | Lost | Valid |', '|---|---|---|---|---|---|---|---|')
  for (const c of s.compactionSamples) push(`| ${c.n ?? '?'} | ${c.placement ?? '—'} | ${c.trigger ?? '—'} | ${c.preTokens ?? '—'} | ${c.postTokens ?? '—'} | ${c.atRisk} | ${c.lost} | ${c.valid ? 'yes' : 'no'} |`)
  if (s.compactionSamples.length === 0) push('| — | no driver compaction | | | | | | |')
  push('')

  push('## Adjudication', '', 'A location match without an accepted term: listed for a reader, never scored (§9).', '')
  if (s.adjudication.length === 0) push('None.')
  else {
    push('| Item | Pass | Role | Locator | Excerpt |', '|---|---|---|---|---|')
    for (const a of s.adjudication) push(`| ${cell(a.item)} | ${cell(a.pass ?? '—')} | ${cell(a.role ?? '—')} | ${cell(a.locator)} | ${cell(a.excerpt)} |`)
  }
  push('')

  push('No threshold moved.', '', 'Not done:', '', ...(s.notDone.length === 0 ? ['- none'] : s.notDone.map((x) => `- ${x}`)))
  return `${lines.join('\n')}\n`
}

// ---------- check ----------

/**
 * Every problem of a runs folder: each `<date>-replay-<n>/` holds a `summary.json` that conforms,
 * names its own folder, was scored under the given protocol's sha256, and a `RESULTS.md`; neither
 * file carries a home or temp path shape; and every run shares one instrument commit.
 */
export function checkRuns(runsDir, protocolPath) {
  const protocolSha = sha256(readFileSync(protocolPath))
  const problems = []
  const dirs = readdirSync(runsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).toSorted()
  if (dirs.length === 0) return { runs: 0, problems: ['no run directory under the runs folder'] }
  const commits = new Set()
  for (const name of dirs) {
    if (!RUN_ID.test(name)) {
      problems.push(`${name}: the folder name is not <YYYY-MM-DD>-replay-<n>`)
      continue
    }
    const read = (file) => {
      try {
        return readFileSync(join(runsDir, name, file), 'utf8')
      } catch (error) {
        if (error?.code === 'ENOENT') return null
        throw error
      }
    }
    const summaryText = read('summary.json')
    const results = read('RESULTS.md')
    if (summaryText === null) {
      problems.push(`${name}: no summary.json`)
      continue
    }
    if (results === null) problems.push(`${name}: no RESULTS.md`)
    let s
    try {
      s = JSON.parse(summaryText)
    } catch (error) {
      problems.push(`${name}: summary.json is not JSON (${error.message})`)
      continue
    }
    for (const p of validateSummary(s)) problems.push(`${name}: summary.json ${p}`)
    if (s?.runId !== name) problems.push(`${name}: summary.json names run ${JSON.stringify(s?.runId ?? null)}`)
    if (s?.protocol?.sha256 !== protocolSha) problems.push(`${name}: protocol sha256 ${s?.protocol?.sha256 ?? 'absent'} is not the sha256 of the protocol (${protocolSha})`)
    if (typeof s?.instrument?.commit === 'string') commits.add(s.instrument.commit)
    for (const shape of forbiddenIn(summaryText)) problems.push(`${name}/summary.json carries "${shape}"`)
    for (const shape of forbiddenIn(results ?? '')) problems.push(`${name}/RESULTS.md carries "${shape}"`)
  }
  if (commits.size > 1) problems.push(`${commits.size} instrument commits across the runs: ${[...commits].toSorted().join(', ')}`)
  return { runs: dirs.length, problems }
}

// ---------- run ----------

/** The protocol path as the summary records it: repository-relative POSIX when inside it. */
function protocolPathOf(path) {
  const rel = relative(REPO_ROOT, resolve(path))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) ? rel.split(/[\\/]/).join('/') : basename(path)
}

function readJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${what} could not be read as JSON: ${error.message}`, { cause: error })
  }
}

function runCommand(o) {
  for (const key of ['measurement', 'runJson', 'protocol', 'runId', 'kind', 'outDir']) if (!o[key]) throw new Error(`--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required.\n${USAGE}`)
  if (!RUN_ID.test(o.runId)) throw new Error(`--run-id ${JSON.stringify(o.runId)} does not match <YYYY-MM-DD>-replay-<n> (§11: never -run-<n>)`)
  if (o.kind !== 'pilot' && o.kind !== 'scored') throw new Error(`--kind ${JSON.stringify(o.kind)} is not pilot or scored`)
  if (basename(resolve(o.outDir)) !== o.runId) throw new Error(`--out-dir must end in the run id ${o.runId} (§11)`)
  if (existsSync(o.outDir)) throw new Error(`--out-dir already exists: a run is scored once, into a directory of its own (${o.runId})`)
  const protocolBytes = readFileSync(o.protocol)
  const protocolSha = sha256(protocolBytes)
  const runJson = readJson(o.runJson, '--run-json')
  const declared = runJson?.instrument?.protocolSha256
  if (declared !== protocolSha) throw new Error(`run.json instrument.protocolSha256 ${declared ?? 'absent'} is not the sha256 of the protocol (${protocolSha})`)
  if (typeof runJson?.instrument?.commit !== 'string' || runJson.instrument.commit === '') throw new Error('run.json records no instrument.commit (§13: every result records it)')
  const measurement = readJson(o.measurement, '--measurement')
  for (const [key, flag] of [['runId', o.runId], ['kind', o.kind]]) {
    if (runJson[key] != null && runJson[key] !== flag) throw new Error(`run.json names ${key === 'runId' ? 'run' : 'kind'} ${JSON.stringify(runJson[key])}, not ${JSON.stringify(flag)}`)
    if (measurement?.[key] != null && measurement[key] !== flag) throw new Error(`the measurement names ${key === 'runId' ? 'run' : 'kind'} ${JSON.stringify(measurement[key])}, not ${JSON.stringify(flag)}`)
  }
  if (runJson.shape != null && measurement?.shape != null && runJson.shape !== measurement.shape) throw new Error(`run.json names shape ${JSON.stringify(runJson.shape)}, the measurement ${JSON.stringify(measurement.shape)}`)
  const thresholds = parseThresholds(protocolBytes.toString('utf8'))
  const references = o.reference.map((path, k) => readJson(path, `--reference ${k + 1}`))
  if (references.length > 0 && o.kind === 'pilot') throw new Error('a pilot is not scored: it takes no --reference')

  const summary = summarize(measurement, runJson, protocolSha, { protocolPath: protocolPathOf(o.protocol), runId: o.runId, kind: o.kind })
  const problems = validateSummary(summary)
  if (problems.length > 0) throw new Error(`the summary does not conform: ${problems.join('; ')}`)
  const results = renderResults(summary, thresholds, references)
  const summaryText = `${JSON.stringify(summary, null, 2)}\n`
  const leaks = [...forbiddenIn(summaryText).map((x) => `summary.json carries "${x}"`), ...forbiddenIn(results).map((x) => `RESULTS.md carries "${x}"`)]
  if (leaks.length > 0) throw new Error(`nothing written: ${leaks.join('; ')} after redaction`)
  mkdirSync(dirname(resolve(o.outDir)), { recursive: true })
  mkdirSync(o.outDir)
  writeFileSync(join(o.outDir, 'summary.json'), summaryText)
  writeFileSync(join(o.outDir, 'RESULTS.md'), results)
  const r = summary.totals.recall
  process.stdout.write(`[replay] scored ${summary.runId} (${summary.shape}, ${summary.kind}): recall ${r.found}/${r.denominator}, loop chars/pass ${Math.round(summary.totals.loopCharsPerPass)}, ${summary.invalid.length === 0 ? 'valid' : `INVALID (${summary.invalid.length})`}\n`)
}

function checkCommand(o) {
  if (!o.runs || !o.protocol) throw new Error(`check needs --runs and --protocol.\n${USAGE}`)
  const { runs, problems } = checkRuns(o.runs, o.protocol)
  if (problems.length > 0) {
    process.stderr.write(`[replay] check failed over ${runs} run folder(s):\n${problems.map((p) => `  - ${p}`).join('\n')}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(`[replay] ${runs} run(s) checked: every summary conforms, one instrument commit, the protocol sha matches, no home or temp path\n`)
}

// ---------- CLI ----------

export const USAGE = [
  'Usage: node scripts/replay/score.mjs run --measurement <m.json> --run-json <run.json> --protocol <REPLAY-v1.md>',
  '         --run-id <YYYY-MM-DD>-replay-<n> --kind pilot|scored --out-dir <evals/replay/runs/<run-id>> [--reference <baseline summary.json>]…',
  '       node scripts/replay/score.mjs check --runs <evals/replay/runs> --protocol <REPLAY-v1.md>',
].join('\n')

function parseArgs(argv) {
  const [command, ...rest] = argv
  const options = { command, reference: [] }
  const valued = { '--measurement': 'measurement', '--run-json': 'runJson', '--protocol': 'protocol', '--run-id': 'runId', '--kind': 'kind', '--out-dir': 'outDir', '--runs': 'runs' }
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (!(arg in valued) && arg !== '--reference') throw new Error(`Unknown option ${arg}.\n${USAGE}`)
    const value = rest[i + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value.\n${USAGE}`)
    if (arg === '--reference') options.reference.push(value)
    else options[valued[arg]] = value
    i += 1
  }
  return options
}

function main(argv) {
  const options = parseArgs(argv)
  if (options.help || options.command === '--help' || options.command === '-h') {
    process.stdout.write(`${USAGE}\n`)
    return
  }
  if (options.command === 'run') runCommand(options)
  else if (options.command === 'check') checkCommand(options)
  else throw new Error(`Unknown command ${options.command}: run or check.\n${USAGE}`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SELF) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`[replay] ${error.message}\n`)
    process.exitCode = 1
  }
}
