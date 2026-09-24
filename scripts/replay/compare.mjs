// The replay's comparison (REPLAY-v1 §10, §12, §14; C12): the baseline shape's scored summaries
// against the changed shape's, one verdict per §12 row and the merge gate. `score.mjs compare`
// reads the summaries and the protocol, calls `compare`, and writes `renderComparison`'s text to
// `evals/replay/COMPARISON-v1.md` — the verdict of record each run's RESULTS.md defers to.
//
// Every summary is held to r8a's `validateSummary` before a row is computed, and the thresholds
// are the ones `parseThresholds` read from the protocol's one `replay-thresholds` block; nothing
// here restates a threshold value. The readings the protocol's prose fixes, beyond the block:
//   - the sample (§10): the first `scoredRunsPerShape` valid scored runs of a shape, in run-id
//     order, decide its size — more than `scoredSpreadSeeds` seeds found apart (max − min) and
//     the shape takes `scoredRunsIfVariance` (R28; the pilots are not read for it). An invalid
//     run is counted and never scored; past the replacements §10 allows, every row the shape
//     feeds is NOT-EVALUATED and the merge gate fails;
//   - decoy-flags and approved-unfixed compare per-scored-run rates, so a shape at 5 runs meets
//     one at 3 on equal terms; recall rates are scaled to `recallOpportunities` with both
//     denominators printed; verdict-rounds compares median rounds per pass;
//   - a security seed the implementer removed counts as found (r8a's `securityHeld`);
//   - the ambient lists (§3, build/250): a scored run whose lists differ from its shape's pilot is
//     an invalid run, counted and replaced like any other; a shape given no pilot cannot be
//     checked, so every row it feeds is NOT-EVALUATED and the merge gate fails.

import { PASS_IDS } from './fixture.mjs'
import { MAX_REPLACEMENTS_PER_SHAPE, ROW_IDS, median, securityHeld, validateSummary } from './score.mjs'

export const COMPARISON_FILE = 'COMPARISON-v1.md'
/** Where §11 places the comparison, the path the leak gate reads it under once committed. */
export const COMPARISON_PATH = `evals/replay/${COMPARISON_FILE}`
const SHAPES = ['baseline', 'changed']

/** The shapes whose runs feed each row: the loss rule reads the changed shape's samples only. */
const FED_BY = {
  'security-seeds': SHAPES, 'pooled-recall': SHAPES, 'decoy-flags': SHAPES, 'compaction-loss': ['changed'], 'verdict-class': SHAPES,
  'verdict-rounds': SHAPES, 'approved-unfixed': SHAPES, 'loop-chars': SHAPES, 'subagent-tokens': SHAPES, 'eval-set-floors': [],
}

const sum = (list, f) => list.reduce((a, x) => a + f(x), 0)
const mean = (values) => sum(values, (v) => v) / values.length
const fmt = (v, digits = 0) => (Number.isFinite(v) ? v.toFixed(digits) : 'n/a')
const cell = (v) => String(v).replaceAll('|', '\\|').replace(/\r?\n/g, ' ')
const runNumber = (runId) => Number(runId.slice(runId.lastIndexOf('-') + 1))
/** Run-id order: the date, then the run number as a number (`-replay-10` after `-replay-9`). */
const byRunId = (a, b) => a.runId.slice(0, 10).localeCompare(b.runId.slice(0, 10)) || runNumber(a.runId) - runNumber(b.runId)
const describeRun = (s) => `${s.shape} ${s.kind === 'pilot' ? 'pilot' : `${s.kind} run`}`

// ---------- inputs ----------

/**
 * Refuses, naming the run, any input that is no replay summary, sits in the wrong list, is given
 * twice, or disagrees with the others on the protocol sha256 or the instrument commit.
 */
function checkInputs(lists, pilots) {
  const all = []
  for (const [shape, list] of Object.entries(lists)) {
    if (!Array.isArray(list)) throw new Error(`the ${shape} summaries are not a list`)
    list.forEach((s, k) => all.push({ s, at: `${shape} ${k + 1}`, want: { shape, kind: 'scored' } }))
  }
  for (const shape of SHAPES) if (pilots[shape] != null) all.push({ s: pilots[shape], at: `pilot-${shape}`, want: { shape, kind: 'pilot' } })

  for (const { s, at, want } of all) {
    const problems = validateSummary(s)
    const label = `${at} (${s?.runId ?? 'no run id'})`
    if (problems.length > 0) throw new Error(`${label} is not a replay summary: ${problems.join('; ')}`)
    if (s.shape !== want.shape || s.kind !== want.kind) {
      throw new Error(`${label} is a ${describeRun(s)}, not a ${want.shape} ${want.kind === 'pilot' ? 'pilot' : 'scored run'}`)
    }
    if (want.kind === 'pilot' && s.invalid.length > 0) throw new Error(`${label} is an invalid run (§10): a pilot is replaced, never named`)
  }
  const seen = new Set()
  for (const { s } of all) {
    if (seen.has(s.runId)) throw new Error(`${s.runId} is given twice: every run enters the comparison once`)
    seen.add(s.runId)
  }
  const groups = (key) => {
    const by = new Map()
    for (const { s } of all) by.set(key(s), [...(by.get(key(s)) ?? []), s.runId])
    return [...by.entries()].map(([value, ids]) => `${value} (${ids.join(', ')})`)
  }
  const shas = groups((s) => s.protocol.sha256)
  if (shas.length > 1) throw new Error(`mixed protocol sha256 values across the summaries: ${shas.join('; ')} — every run is scored under one protocol`)
  const commits = groups((s) => s.instrument.commit)
  if (commits.length > 1) throw new Error(`${commits.length} instrument commits across the summaries: ${commits.join('; ')}`)
  return all.map((x) => x.s)
}

/**
 * The §10 sample of one shape. Refuses a sample that is short or long while replacements remain;
 * past them the shape is `exhausted` and the rows it feeds are not evaluated.
 */
function sampleOf(shape, runs, t) {
  const ordered = runs.toSorted(byRunId)
  const valid = ordered.filter((s) => s.invalid.length === 0)
  const invalid = ordered.filter((s) => s.invalid.length > 0)
  const first = valid.slice(0, t.scoredRunsPerShape).map((s) => s.totals.recall.found)
  const spread = first.length === t.scoredRunsPerShape && first.length > 0 ? Math.max(...first) - Math.min(...first) : null
  const variance = spread !== null && spread > t.scoredSpreadSeeds
  const required = variance ? t.scoredRunsIfVariance : t.scoredRunsPerShape
  const exhausted = invalid.length > MAX_REPLACEMENTS_PER_SHAPE
  if (!exhausted && valid.length !== required) {
    if (variance && valid.length < required) {
      throw new Error(`${shape}: its first ${t.scoredRunsPerShape} scored runs differ by ${spread} seeds found (max − min, over scoredSpreadSeeds ${t.scoredSpreadSeeds}), so the shape takes ${required} scored runs (scoredRunsIfVariance, §10, R28); ${valid.length} given`)
    }
    if (valid.length < required) {
      throw new Error(`${shape}: ${valid.length} valid scored run(s), ${required} required (scoredRunsPerShape); an invalid run is replaced (§10), ${invalid.length} of ${MAX_REPLACEMENTS_PER_SHAPE} replacement(s) used`)
    }
    throw new Error(`${shape}: ${valid.length} valid scored runs, the sample is ${required} (§10): a scored run beyond the sample is not read, so none is chosen`)
  }
  return { shape, runs: valid, invalid, required, spread, variance, exhausted }
}

/** The five ambient lists of a summary, one comparable string each (`measure.mjs` sorts every list). */
const ambientOf = (s) => s.client?.ambient ?? null
const ambientKeys = (a, b) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].toSorted()

/**
 * §3: each scored run of a shape against that shape's pilot. A run whose lists differ gains an
 * `invalid` reason naming the lists, so the §10 sample counts it as a replaced run.
 */
function heldToPilot(shape, runs, pilot) {
  if (pilot == null) return runs
  const want = ambientOf(pilot)
  return runs.map((s) => {
    const got = ambientOf(s)
    const differ = want === null || got === null ? ['every list'] : ambientKeys(want, got).filter((k) => JSON.stringify(want[k] ?? null) !== JSON.stringify(got[k] ?? null))
    if (differ.length === 0) return s
    return { ...s, invalid: [...s.invalid, `its ambient lists (§3) differ from the ${shape} pilot ${pilot.runId}: ${differ.join(', ')}`] }
  })
}

// ---------- rows ----------

const securityIds = (runs) => [...new Set(runs.flatMap((s) => s.passes.flatMap((p) => p.seeds.filter((x) => x.class === 'security').map((x) => x.id))))].toSorted()
const rowsOf = (s, id) => s.passes.flatMap((p) => p.seeds.filter((x) => x.id === id))

function securityRow(b, c) {
  const ids = securityIds([...b.runs, ...c.runs])
  if (ids.length === 0) return { verdict: 'NOT-EVALUATED', baseline: 'no security seed', changed: 'no security seed', reason: 'no summary carries a security seed' }
  // A baseline run with no row for a seed did not miss it: the exemption needs a measured miss.
  const exempt = ids.filter((id) => b.runs.some((s) => rowsOf(s, id).length > 0 && !rowsOf(s, id).every(securityHeld)))
  const missed = []
  for (const s of c.runs) {
    for (const id of ids) {
      if (exempt.includes(id)) continue
      const rows = rowsOf(s, id)
      if (rows.length === 0) missed.push(`${id} has no row in ${s.runId}`)
      else if (!rows.every(securityHeld)) missed.push(`${id} missed in ${s.runId}`)
    }
  }
  const heldIn = (runs) => runs.filter((s) => ids.every((id) => rowsOf(s, id).length > 0 && rowsOf(s, id).every(securityHeld))).length
  return {
    verdict: missed.length === 0 ? 'PASS' : 'FAIL',
    baseline: `${heldIn(b.runs)} of ${b.runs.length} run(s) held all ${ids.length} security seeds; exempt: ${exempt.join(', ') || 'none'}`,
    changed: `${heldIn(c.runs)} of ${c.runs.length} run(s) held all ${ids.length} security seeds${missed.length > 0 ? `; ${missed.join('; ')}` : ''}`,
  }
}

function recallRow(b, c, t) {
  const pool = (runs) => ({ found: sum(runs, (s) => s.totals.recall.found), denominator: sum(runs, (s) => s.totals.recall.denominator) })
  const pb = pool(b.runs)
  const pc = pool(c.runs)
  const show = (p, n) => `${p.found}/${p.denominator} over ${n} run(s)${p.denominator > 0 ? ` = ${fmt((p.found / p.denominator) * t.recallOpportunities, 2)} of ${t.recallOpportunities}` : ''}`
  const out = { baseline: show(pb, b.runs.length), changed: show(pc, c.runs.length) }
  if (pb.denominator === 0 || pc.denominator === 0) return { ...out, verdict: 'NOT-EVALUATED', reason: 'a pooled denominator is 0: no seed reached a lens in that shape, so it has no recall rate' }
  // changed/dc × O ≥ baseline/db × O − margin, multiplied through by dc × db (both > 0): exact in integers.
  const O = t.recallOpportunities
  const holds = pc.found * pb.denominator * O >= pb.found * pc.denominator * O - t.recallMargin * pc.denominator * pb.denominator
  return { ...out, verdict: holds ? 'PASS' : 'FAIL' }
}

/** A count per scored run: changed total ÷ its runs ≤ baseline total ÷ its runs, cross-multiplied. */
function rateRow(b, c, count, unit) {
  const tb = sum(b.runs, count)
  const tc = sum(c.runs, count)
  const show = (total, n) => `${total} ${unit} over ${n} run(s) = ${fmt(total / n, 2)} per run`
  return { verdict: tc * b.runs.length <= tb * c.runs.length ? 'PASS' : 'FAIL', baseline: show(tb, b.runs.length), changed: show(tc, c.runs.length) }
}

function lossRow(c, t) {
  const samples = c.runs.flatMap((s) => s.compactionSamples.map((x) => ({ ...x, runId: s.runId })))
  const valid = samples.filter((x) => x.valid)
  const lost = valid.filter((x) => x.lost > t.lossPerValidSample)
  const changed = `${valid.length} valid of ${samples.length} sample(s), lost ${sum(valid, (x) => x.lost)}${lost.length > 0 ? ` — ${lost.map((x) => `${x.runId} sample ${x.n} lost ${x.lost}`).join('; ')}` : ''}`
  const baseline = 'not read (the rule binds the changed shape)'
  if (lost.length > 0) return { verdict: 'FAIL', baseline, changed }
  if (valid.length < t.minValidSamplesChanged) return { verdict: 'NOT-EVALUATED', baseline, changed, reason: `${valid.length} valid changed sample(s), at least ${t.minValidSamplesChanged} required (minValidSamplesChanged)` }
  return { verdict: 'PASS', baseline, changed }
}

/** The modal final classes of one pass over a shape's runs: every class at the highest count, sorted. */
function modalClasses(runs, passId) {
  const counts = new Map()
  for (const s of runs) {
    const cls = s.passes.find((p) => p.id === passId).verdict.finalClass ?? 'none'
    counts.set(cls, (counts.get(cls) ?? 0) + 1)
  }
  const top = Math.max(...counts.values())
  return [...counts.entries()].filter(([, n]) => n === top).map(([cls]) => cls).toSorted()
}

function classRow(b, c, t) {
  const per = PASS_IDS.map((id) => ({ id, b: modalClasses(b.runs, id), c: modalClasses(c.runs, id) }))
  // A tie is a set of modal classes; two shapes hold the same modal class when the sets are equal.
  const same = per.filter((x) => x.b.join('/') === x.c.join('/')).length
  return {
    verdict: same >= t.verdictClassMinPasses ? 'PASS' : 'FAIL',
    baseline: per.map((x) => `${x.id} ${x.b.join('/')}`).join(', '),
    changed: `${per.map((x) => `${x.id} ${x.c.join('/')}`).join(', ')} — the same on ${same} of ${PASS_IDS.length}`,
  }
}

const medianRoundsOf = (runs, id) => median(runs.map((s) => s.passes.find((p) => p.id === id).verdict.rounds))

function roundsRow(b, c, t) {
  const per = PASS_IDS.map((id) => ({ id, b: medianRoundsOf(b.runs, id), c: medianRoundsOf(c.runs, id) }))
  const off = per.filter((x) => Math.abs(x.c - x.b) > t.roundsTolerance)
  return {
    verdict: off.length === 0 ? 'PASS' : 'FAIL',
    baseline: `median rounds ${per.map((x) => `${x.id} ${x.b}`).join(', ')}`,
    changed: `median rounds ${per.map((x) => `${x.id} ${x.c}`).join(', ')}${off.length > 0 ? ` — beyond ±${t.roundsTolerance}: ${off.map((x) => x.id).join(', ')}` : ''}`,
  }
}

function loopRow(b, c, t) {
  const ref = median(b.runs.map((s) => s.totals.loopCharsPerPass))
  const over = c.runs.filter((s) => s.totals.loopCharsPerPass > t.loopCharsRatioMax * ref)
  const ratio = (v) => (ref === 0 ? (v === 0 ? 0 : Infinity) : v / ref)
  return {
    verdict: over.length === 0 ? 'PASS' : 'FAIL',
    baseline: `median ${fmt(ref)} per pass over ${b.runs.length} run(s)`,
    changed: c.runs.map((s) => `${s.runId} ${fmt(s.totals.loopCharsPerPass)} (${fmt(ratio(s.totals.loopCharsPerPass), 3)} ×)`).join(', '),
  }
}

/** A decimal threshold as the exact fraction its digits spell, `[numerator, denominator]` in BigInt. */
function fractionOf(value) {
  const m = String(value).match(/^(\d+)(?:\.(\d+))?$/)
  if (!m) throw new Error(`a threshold ${value} is not a plain non-negative decimal`)
  const digits = m[2] ?? ''
  return [BigInt(m[1] + digits), 10n ** BigInt(digits.length)]
}

/** A shape's sub-agent tokens in whole tokens: each run's per-pass mean times the six passes is its total. */
const wholeTokens = (runs) => runs.reduce((a, s) => a + BigInt(Math.round(s.totals.subagentTokensPerPass * PASS_IDS.length)), 0n)

function tokensRow(b, c, t) {
  const mb = mean(b.runs.map((s) => s.totals.subagentTokensPerPass))
  const mc = mean(c.runs.map((s) => s.totals.subagentTokensPerPass))
  // build/270: Σ changed ÷ (6·nc) ≤ num/den × Σ baseline ÷ (6·nb), multiplied through, exact in integers.
  const [num, den] = fractionOf(t.subagentTokensRatioMax)
  const holds = wholeTokens(c.runs) * BigInt(b.runs.length) * den <= num * wholeTokens(b.runs) * BigInt(c.runs.length)
  return {
    verdict: holds ? 'PASS' : 'FAIL',
    baseline: `mean ${fmt(mb)} per pass over ${b.runs.length} run(s)`,
    changed: `mean ${fmt(mc)} per pass over ${c.runs.length} run(s) = ${fmt(mb === 0 ? NaN : mc / mb, 3)} × the baseline mean`,
  }
}

/** The rule each row states, its keys and values as the protocol's block gives them. */
function rules(t) {
  return {
    'security-seeds': `every security seed found in every changed scored run; exempt when at least one baseline scored run missed it; implementer-removed counts as found (securityAllRuns ${t.securityAllRuns}, securityExemption ${t.securityExemption})`,
    'pooled-recall': `pooled seeded recall scaled to ${t.recallOpportunities}: changed ≥ baseline − ${t.recallMargin} (recallMargin, recallOpportunities)`,
    'decoy-flags': `decoys wrongly flagged Critical or Warning per scored run: changed ${t.decoyFlags} (decoyFlags)`,
    'compaction-loss': `lost ≤ ${t.lossPerValidSample} in every valid changed sample, with at least ${t.minValidSamplesChanged} valid sample(s) (lossPerValidSample, minValidSamplesChanged)`,
    'verdict-class': `the same modal final class on ≥ ${t.verdictClassMinPasses} of ${PASS_IDS.length} passes (verdictClassMinPasses)`,
    'verdict-rounds': `on every pass, |changed median rounds − baseline median rounds| ≤ ${t.roundsTolerance} (roundsTolerance)`,
    'approved-unfixed': `passes approved with a seed unfixed per scored run: changed ${t.approvedUnfixed} (approvedUnfixed)`,
    'loop-chars': `loop characters per pass in every changed scored run ≤ ${t.loopCharsRatioMax} × the baseline median (loopCharsRatioMax, loopCharsReference ${t.loopCharsReference}, loopCharsScope ${t.loopCharsScope})`,
    'subagent-tokens': `the changed mean sub-agent tokens per pass ≤ ${t.subagentTokensRatioMax} × the baseline mean (subagentTokensRatioMax, subagentTokensScope ${t.subagentTokensScope}, subagentTokensReference ${t.subagentTokensReference})`,
    'eval-set-floors': `checked at the 1.10.0 baseline run of the eval set (evalSetFloors ${t.evalSetFloors})`,
  }
}

const COMPUTE = {
  'security-seeds': (b, c) => securityRow(b, c),
  'pooled-recall': recallRow,
  'decoy-flags': (b, c) => rateRow(b, c, (s) => s.totals.decoyFalseFlags, 'flag(s)'),
  'compaction-loss': (_b, c, t) => lossRow(c, t),
  'verdict-class': classRow,
  'verdict-rounds': roundsRow,
  'approved-unfixed': (b, c) => rateRow(b, c, (s) => s.passes.filter((p) => p.verdict.approvedWithSeedUnfixed).length, 'pass(es)'),
  'loop-chars': loopRow,
  'subagent-tokens': tokensRow,
}

// ---------- compare ----------

/**
 * The comparison of the baseline shape's scored summaries with the changed shape's, under the
 * thresholds `parseThresholds` read. `pilots` (`{ baseline?, changed? }`) are validated and named
 * in the head, never scored. Returns `{ rows, mergeGate, sampleCount, head }`; throws on any input
 * §10 or the protocol refuses.
 */
export function compare(baseline, changed, thresholds, pilots = {}) {
  const t = thresholds
  const p = pilots ?? {}
  const all = checkInputs({ baseline, changed }, p)
  const samples = {
    baseline: sampleOf('baseline', heldToPilot('baseline', baseline, p.baseline), t),
    changed: sampleOf('changed', heldToPilot('changed', changed, p.changed), t),
  }
  const ruleOf = rules(t)
  const rows = ROW_IDS.map((id) => {
    const rule = ruleOf[id]
    if (id === 'eval-set-floors') return { id, rule, baseline: 'not measured by the replay', changed: 'not measured by the replay', verdict: 'CARRIED', reason: 'carried to session 2' }
    const spent = FED_BY[id].map((shape) => samples[shape]).filter((x) => x.exhausted)
    const unchecked = FED_BY[id].filter((shape) => p[shape] == null)
    if (spent.length > 0 || unchecked.length > 0) {
      const reason = [
        ...spent.map((x) => `${x.shape}: ${x.invalid.length} invalid runs, over the ${MAX_REPLACEMENTS_PER_SHAPE} replacements §10 allows per shape`),
        ...unchecked.map((shape) => `no ${shape} pilot supplied: its scored runs' ambient lists (§3) cannot be checked`),
      ].join('; ')
      return { id, rule, baseline: '—', changed: '—', verdict: 'NOT-EVALUATED', reason }
    }
    return Object.assign({ id, rule }, COMPUTE[id](samples.baseline, samples.changed, t))
  })
  const mergeGate = rows.every((r) => r.verdict === 'PASS' || r.verdict === 'CARRIED') ? 'PASS' : 'FAIL'
  const perShape = (f) => Object.fromEntries(SHAPES.map((shape) => [shape, f(samples[shape])]))
  const first = all[0]
  return {
    rows,
    mergeGate,
    sampleCount: { required: perShape((x) => x.required), got: perShape((x) => x.runs.length), invalid: perShape((x) => x.invalid.length) },
    head: {
      protocol: { path: first.protocol.path, sha256: first.protocol.sha256 },
      instrumentCommit: first.instrument.commit,
      mechanisms: perShape((x) => [...new Set(x.runs.map((s) => s.mechanism))].toSorted()),
      pilots: Object.fromEntries(SHAPES.map((shape) => [shape, p[shape]?.runId ?? null])),
      runs: perShape((x) => x.runs.map((s) => ({ runId: s.runId, found: s.totals.recall.found, denominator: s.totals.recall.denominator }))),
      invalidRuns: perShape((x) => x.invalid.map((s) => s.runId)),
      spread: perShape((x) => x.spread),
    },
  }
}

// ---------- COMPARISON-v1.md ----------

/**
 * COMPARISON-v1.md: the head (protocol sha, instrument commit, mechanism, pilots, samples), the
 * ten §12 rows, `Merge gate: PASS|FAIL`, "No threshold moved." and `Not done:`.
 */
export function renderComparison(result, thresholds) {
  const t = thresholds
  const h = result.head
  const lines = []
  const push = (...xs) => lines.push(...xs)
  push('# Replay comparison — `COMPARISON-v1`', '')
  push('The changed shape against the 1.9.1 baseline under REPLAY-v1, one verdict per §12 row. This file is the verdict of record; each run\'s RESULTS.md defers to it.', '')
  const pilots = SHAPES.filter((shape) => h.pilots[shape] !== null).map((shape) => `${shape} \`${h.pilots[shape]}\``)
  push(
    `- Protocol: REPLAY-v1 (\`${h.protocol.path}\`), sha256 \`${h.protocol.sha256}\`.`,
    `- Instrument: commit \`${h.instrumentCommit}\`.`,
    `- Compaction mechanism (§7): ${SHAPES.map((shape) => `${shape} ${h.mechanisms[shape].map((m) => `\`${m}\``).join(', ') || 'none read'}`).join('; ')}.`,
    `- Pilots (not scored): ${pilots.length > 0 ? pilots.join(', ') : 'none supplied'}.`,
  )
  for (const shape of SHAPES) {
    const runs = h.runs[shape].map((r) => `\`${r.runId}\` (${r.found}/${r.denominator})`).join(', ') || 'none read'
    const spread = h.spread[shape] === null ? 'no spread read' : `the first ${t.scoredRunsPerShape} differ by ${h.spread[shape]} seed(s) found (over ${t.scoredSpreadSeeds} takes ${t.scoredRunsIfVariance})`
    const invalid = h.invalidRuns[shape].map((id) => `\`${id}\``).join(', ') || 'none'
    push(`- Samples, ${shape} (§10): ${result.sampleCount.got[shape]} valid scored run(s) of ${result.sampleCount.required[shape]} required — ${runs}; ${spread}; invalid: ${invalid}.`)
  }
  push('', '## Rows (§12)', '', '| Row | Rule | Baseline | Changed | Verdict |', '|---|---|---|---|---|')
  for (const r of result.rows) push(`| \`${r.id}\` | ${cell(r.rule)} | ${cell(r.baseline)} | ${cell(r.changed)} | ${r.verdict}${r.reason ? ` — ${cell(r.reason)}` : ''} |`)
  push('', `Merge gate: ${result.mergeGate}`, '', 'No threshold moved.', '', 'Not done:', '')
  const open = result.rows.filter((r) => r.verdict === 'CARRIED' || r.verdict === 'NOT-EVALUATED')
  push(...(open.length === 0 ? ['- none'] : open.map((r) => `- \`${r.id}\`: ${r.verdict} — ${r.reason}`)))
  return `${lines.join('\n')}\n`
}
