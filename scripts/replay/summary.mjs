// The `stamity/replay-summary/v1` schema and its check, read by the scorer (`score.mjs`), which
// writes summaries, and by the comparison (`compare.mjs`), which holds every input to it. It lives
// apart from both so `compare.mjs` never imports `score.mjs` (`build/273`); it names neither.
// `score.mjs` re-exports every name here, so its importers read them where they always did.

import { AMBIENT_LISTS } from './measure.mjs'
import { PASS_IDS } from './fixture.mjs'

export const SUMMARY_SCHEMA = 'stamity/replay-summary/v1'
/** §11: `<date>-replay-<n>`, never `-run-<n>` (the eval set's run of record is the newest `-run-<n>`). */
export const RUN_ID = /^\d{4}-\d{2}-\d{2}-replay-\d+$/
const SHA256 = /^[0-9a-f]{64}$/
export const EXCERPT_MAX = 200

/** Every total of the measurement, carried into the summary whole (a test pins it to r7's list). */
export const TOTALS_KEYS = [
  'loopChars', 'loopCharsPerPass', 'breakdown', 'unattributedShare', 'perPassUnreliable', 'unresolvedDeliveriesAndSends',
  'ledgerBeside', 'subagentTokens', 'subagentTokensPerPass', 'subagentOutputTokens', 'notificationTrailerTokens',
  'unjoinedSubagents', 'agentsWithoutTranscript', 'walkSkipped', 'mainContextChars', 'contextTokensPerPass', 'compactionsAuto',
  'projectedPer10', 'recall', 'readerSkips', 'decoyFalseFlags', 'unmatched', 'oraclePass', 'oracleError', 'oracleRun',
]
const NUMERIC_TOTALS = [
  'loopChars', 'loopCharsPerPass', 'unattributedShare', 'unresolvedDeliveriesAndSends', 'subagentTokens', 'subagentTokensPerPass',
  'subagentOutputTokens', 'notificationTrailerTokens', 'unjoinedSubagents', 'mainContextChars', 'contextTokensPerPass',
  'compactionsAuto', 'projectedPer10', 'decoyFalseFlags', 'unmatched', 'oraclePass', 'oracleError',
]
export const BREAKDOWN_KEYS = ['returns', 'prompts', 'ledger', 'briefs', 'reportReads', 'resumes']

export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
export const strOrNull = (v) => v === null || typeof v === 'string'
export const numOrNull = (v) => v === null || (typeof v === 'number' && Number.isFinite(v))
/** §3's five ambient lists (build/250): null with no init event, else each list of names, or null when the event lacks it. */
export const isAmbient = (v) => v === null || (isObject(v) && Object.keys(AMBIENT_LISTS).every((k) => v[k] === null || (Array.isArray(v[k]) && v[k].every((x) => typeof x === 'string'))))

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
  need(
    isObject(s.client) && ['version', 'binarySha256', 'orchestratorModel', 'initVersion'].every((k) => strOrNull(s.client[k])) && Array.isArray(s.client.resolvedModels) && isAmbient(s.client.ambient),
    'client is not {version, binarySha256, orchestratorModel, resolvedModels, initVersion, ambient}',
  )
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
    need(isObject(s.totals.oracleRun) && strOrNull(s.totals.oracleRun.status) && typeof s.totals.oracleRun.detail === 'string', 'totals.oracleRun is not {status, detail}')
  }
  need(Array.isArray(s.compactionSamples) && s.compactionSamples.every((c) => typeof c?.atRisk === 'number' && typeof c.lost === 'number' && typeof c.valid === 'boolean'), 'compactionSamples are malformed')
  need(isObject(s.wholeBranch) && strOrNull(s.wholeBranch.finalClass), 'wholeBranch is not {finalClass}')
  need(Array.isArray(s.adjudication) && s.adjudication.every((a) => typeof a?.item === 'string' && typeof a.locator === 'string' && typeof a.excerpt === 'string' && [...a.excerpt].length <= EXCERPT_MAX), `adjudication is malformed or an excerpt is over ${EXCERPT_MAX} characters`)
  for (const key of ['notes', 'invalid', 'notDone']) need(Array.isArray(s[key]) && s[key].every((x) => typeof x === 'string'), `${key} is not a list of strings`)
  return problems
}
