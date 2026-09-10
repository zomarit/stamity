import { execFileSync } from 'node:child_process'
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { aggregate, calibrationMatches, EvalBlocked, parseCase, parseGrade, parseRubric, requireEvidence, sha256 } from './instrument.mjs'
import { boundedMap, callWithRetries, CONTROLS, HARNESS, makeRequest, responsesTransport } from './transport.mjs'

const PROFILE_PATH = 'evals/model-profiles-v1.json'
const CURRENT_SET = 'evals/SET-v5.md'
const RUNNER_FILES = ['scripts/eval-run.mjs', 'scripts/eval/instrument.mjs', 'scripts/eval/transport.mjs',
  'scripts/eval/run.mjs', 'scripts/native-typescript.mjs', '.stamity/overrides/skills/st-eval-run/SKILL.md']
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

export function loadInputs(root, profileName) {
  const candidate = git(root, ['rev-parse', 'HEAD']).trim()
  const inputs = {}
  const read = path => {
    let committed
    let working
    try { committed = git(root, ['show', `${candidate}:${path}`]); working = readFileSync(join(root, path), 'utf8') }
    catch { throw new EvalBlocked('input-not-committed') }
    requireEvidence(committed === working, 'input-working-tree-mismatch')
    inputs[path] = sha256(committed)
    return committed
  }
  const profiles = JSON.parse(read(PROFILE_PATH))
  requireEvidence(profiles.schemaVersion === 1 && profiles.set === CURRENT_SET && profiles.defaultProfile === 'claude', 'profile-schema-or-set')
  const selected = profileName ?? profiles.defaultProfile
  const profile = profiles.profiles[selected]
  requireEvidence(profile && profile.scenario.model !== profile.judge.model, 'unknown-or-identical-profile')
  requireEvidence(profile.harness === 'codex' && ['codex-astra', 'codex-astra-judge'].includes(selected), 'profile-transport-unavailable')
  const expectedModels = selected === 'codex-astra' ? ['gpt-6-astra', 'gpt-5.6-sol'] : ['gpt-5.6-sol', 'gpt-6-astra']
  requireEvidence(profile.scenario.model === expectedModels[0] && profile.judge.model === expectedModels[1] &&
    profile.scenario.reasoningEffort === 'high' && profile.judge.reasoningEffort === 'high' &&
    profile.rubric === 'evals/rubric-v5.md', 'unsupported-profile-controls')
  const set = read(CURRENT_SET)
  requireEvidence(set.includes('**>= 0.85** overall') && set.includes('**= 1.0**') &&
    set.includes('**= 0**') && set.includes('**>= 0.85**, with per-skill recall') && set.includes('Strict three-sample scoring'), 'set-threshold-contract')
  for (const path of RUNNER_FILES) read(path)
  const loadCases = directory => readdirSync(join(root, directory), { recursive: true, encoding: 'utf8' })
    .filter(path => path.endsWith('.md')).toSorted().map(path => {
      const logical = `${directory}/${path.replaceAll('\\', '/')}`
      return parseCase(read(logical), logical)
    })
  const cases = loadCases('evals/cases-v5')
  const historical = loadCases('evals/cases-v4')
  requireEvidence(cases.length === 78 && new Set(cases.map(item => item.id)).size === 78, 'set-roster')
  for (const scenario of cases) {
    requireEvidence(scenario.source?.startsWith('content/'), 'case-source')
    read(scenario.source)
  }
  const rubric = parseRubric(read(profile.rubric), historical)
  const dirty = git(root, ['status', '--porcelain', '--untracked-files=all', '--', 'src', 'content', 'scripts', 'package.json', 'package-lock.json'])
  requireEvidence(dirty === '', 'candidate-source-not-committed')
  const configuration = { profile: selected, roles: profile, profilePath: PROFILE_PATH,
    profileSchemaVersion: profiles.schemaVersion, set: CURRENT_SET, harness: HARNESS,
    node: process.version, controls: CONTROLS, inputs, rubricCoreHash: rubric.coreHash }
  const configurationHash = sha256(JSON.stringify(configuration))
  const assertUnchanged = () => {
    requireEvidence(git(root, ['rev-parse', 'HEAD']).trim() === candidate, 'candidate-changed-during-run')
    for (const [path, hash] of Object.entries(inputs)) {
      requireEvidence(sha256(readFileSync(join(root, path))) === hash, 'input-changed-during-run')
    }
  }
  return { candidate, selected, profile, cases, rubric, configuration, configurationHash, assertUnchanged }
}

/** New directories and exclusive writes only; no historical artifact can be replaced. */
export function createArtifacts(root, runId) {
  requireEvidence(/^\d{4}-\d{2}-\d{2}-run-[1-9]\d*$/.test(runId), 'invalid-run-id')
  const parent = join(root, 'evals', 'runs')
  for (const path of [join(root, 'evals'), parent]) {
    try { requireEvidence(lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink(), 'unsafe-artifact-parent') }
    catch (error) { if (error.code === 'ENOENT') continue; throw error }
  }
  mkdirSync(parent, { recursive: true })
  const directory = join(parent, runId)
  try { mkdirSync(directory, { mode: 0o700 }) }
  catch { throw new EvalBlocked('run-directory-exists-or-unwritable') }
  const write = (name, value) => {
    requireEvidence(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name), 'unsafe-artifact-name')
    const body = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`
    writeFileSync(join(directory, name), body, { flag: 'wx', mode: 0o600 })
    return sha256(body)
  }
  return { directory, write }
}

export function advisoryRepeats(aggregateResult, previous) {
  const failures = aggregateResult.rows.flatMap(row => [...new Set(row.samples.flatMap(sample =>
    sample.grade.advisory.filter(item => item.verdict === 'fail').map(item => `${row.caseId}:${item.id}`)))])
  return { failures, repeats: failures.filter(id => previous?.advisory?.failures.includes(id)) }
}

function previousRun(root, configurationHash) {
  const directory = join(root, 'evals', 'runs')
  const matches = []
  for (const name of readdirSync(directory)) {
    if (!/^\d{4}-\d{2}-\d{2}-run-[1-9]\d*$/.test(name)) continue
    let raw
    try { raw = readFileSync(join(directory, name, 'summary.json'), 'utf8') }
    catch (error) { if (error.code === 'ENOENT') continue; throw error }
    const summary = JSON.parse(raw)
    if (summary.configurationHash === configurationHash && ['PASS', 'FAIL'].includes(summary.status)) matches.push(summary)
  }
  return matches.toSorted((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1)
}

function markdown(summary) {
  const lines = [`# Eval ${summary.runId}`, '', `Status: **${summary.status}**`, '',
    `Trigger: ${summary.trigger}. Candidate: \`${summary.candidate ?? 'unavailable'}\`.`,
    `Profile: \`${summary.profile}\`. Set: \`SET-v5\`. Samples: strict three; all binding criteria must pass in all three.`,
    `Configuration: \`${summary.configurationHash ?? 'unavailable'}\`; exact input/provider evidence is in \`inputs.json\` and each call receipt.`,
    'Model/effort values in receipts are provider metadata. Agent attestation is unavailable; no attestation text was added.', '',
    '## Calibration', '']
  if (!summary.calibration.length) lines.push('Not measured.')
  for (const fixture of summary.calibration) lines.push(`- ${fixture.fixture}: ${fixture.match ? 'MATCH' : 'MISMATCH'}; expected ${fixture.expected.verdict}, returned ${fixture.grade.verdict}. Binding and advisory labels: see calibration.json.`)
  if (summary.aggregate) {
    lines.push('', '## Metrics', '', '| Metric | Score | Threshold | Result |', '|---|---|---|---|')
    for (const metric of summary.aggregate.metrics) lines.push(`| ${metric.metric} | ${metric.numerator}/${metric.denominator} = ${metric.score} | ${metric.metric === 'benign-false-refusal' ? '<=' : '>='} ${metric.threshold} | ${metric.pass ? 'PASS' : 'FAIL'} |`)
    lines.push('', `Floors: ${summary.aggregate.floors.filter(row => row.pass).length}/${summary.aggregate.floors.length}; every floor must pass.`, '',
      '## Cases', '', '| Case | Result | Advisory misses |', '|---|---|---|')
    for (const row of summary.aggregate.rows) lines.push(`| ${row.caseId}${row.floor ? ' (floor)' : ''} | ${row.pass ? 'PASS' : 'FAIL'} | ${summary.advisory.failures.filter(id => id.startsWith(`${row.caseId}:`)).join(', ') || 'none'} |`)
    lines.push('', 'Every B/A verdict and its cited transcript span, all three transcripts, floor results and per-skill recall are retained in summary.json and the individual scenario/judge receipts.',
      '', `Advisory repeats requiring reviewed disposition: ${summary.advisory.repeats.join(', ') || 'none'}.`)
  }
  lines.push('', '## Not done', '')
  lines.push(...(summary.notDone.length ? summary.notDone.map(item => `- ${item}`) : ['None within this eval; human QA and platform release controls remain separate.']))
  const unmeasured = summary.coverage?.filter(row => row.samples.length !== 3) ?? []
  if (unmeasured.length) {
    lines.push('', '| Unmeasured case | Admitted graded samples / required |', '|---|---|')
    for (const row of unmeasured) lines.push(`| ${row.caseId} | ${row.samples.length}/3 |`)
  }
  lines.push('', 'Infrastructure and invalid-response attempts, including rejected calls, are retained individually. Scored failures and calibration mismatches are never retried.', '')
  return lines.join('\n')
}

/** Caller starts one full run explicitly. Importing this module never calls a provider. */
export async function runEvaluation({ root, runId, profileName, trigger, capacity = 4, apiKey,
  load = loadInputs, transport: suppliedTransport, wait }) {
  requireEvidence(['release', 'content', 'model'].includes(trigger), 'invalid-trigger')
  requireEvidence(Number.isInteger(capacity) && capacity >= 1 && capacity <= 16, 'capacity-out-of-range')
  const artifacts = createArtifacts(root, runId)
  const summary = { schemaVersion: 1, runId, startedAt: new Date().toISOString(), trigger,
    profile: profileName ?? 'claude', capacity, status: 'BLOCKED', calibration: [], notDone: [] }
  try {
    const loaded = load(root, profileName)
    Object.assign(summary, { candidate: loaded.candidate, profile: loaded.selected, configurationHash: loaded.configurationHash,
      coverage: loaded.cases.map(scenario => ({ caseId: scenario.id, samples: [] })) })
    artifacts.write('inputs.json', loaded.configuration)
    // Test transports exercise orchestration only. The CLI supplies no override and requires an API key.
    requireEvidence(suppliedTransport || (typeof apiKey === 'string' && apiKey.trim().length > 0), 'OPENAI_API_KEY-unavailable')
    const transport = suppliedTransport ?? (request => responsesTransport(request, { apiKey }))
    const prior = previousRun(root, loaded.configurationHash)
    requireEvidence(!prior?.advisory?.repeats.length, 'advisory-repeat-disposition-required')
    const invoke = async (name, role, blocks, validate, allowRefusal = false) => {
      loaded.assertUnchanged()
      const request = makeRequest(role, blocks)
      const result = await callWithRetries({ request, transport, validate, allowRefusal,
        ...(wait ? { wait } : {}), record: receipt => artifacts.write(`${name}-attempt-${receipt.attempt}.json`, receipt) })
      loaded.assertUnchanged()
      return result
    }
    // Non-scoring, role-specific controls probe before calibration. No project state is supplied.
    await boundedMap(['scenario', 'judge'], capacity, async role => {
      const result = await invoke(`isolation-${role}`, loaded.profile[role], ['ISOLATION_PROBE: reply with READY.'], value => value)
      artifacts.write(`isolation-${role}.json`, result)
    })
    summary.calibration = await boundedMap(loaded.rubric.fixtures, capacity, async fixture => {
      const grade = await invoke(`calibration-${fixture.id}`, loaded.profile.judge,
        [loaded.rubric.core, fixture.scenario.brief, fixture.scenario.expected, fixture.transcript],
        value => parseGrade(value.transcript, fixture.scenario, fixture.transcript))
      const match = calibrationMatches(fixture, grade)
      return { fixture: fixture.id, match, expected: { verdict: fixture.verdict, binding: fixture.binding, advisory: fixture.advisory }, grade }
    })
    artifacts.write('calibration.json', summary.calibration)
    const mismatch = summary.calibration.find(fixture => !fixture.match)
    if (mismatch) throw new EvalBlocked(`calibration-${mismatch.fixture}-mismatch`)
    const jobs = loaded.cases.flatMap(scenario => [1, 2, 3].map(sample => ({ scenario, sample })))
    const samples = await boundedMap(jobs, capacity, async ({ scenario, sample }) => {
      const name = `${scenario.id}-sample-${sample}`
      const scenarioOutput = await invoke(`scenario-${name}`, loaded.profile.scenario, [scenario.brief], value => value, true)
      const grade = await invoke(`judge-${name}`, loaded.profile.judge,
        [loaded.rubric.core, scenario.brief, scenario.expected, scenarioOutput.transcript],
        value => parseGrade(value.transcript, scenario, scenarioOutput.transcript))
      const result = { caseId: scenario.id, sample, grade, transcript: scenarioOutput.transcript,
        outputType: scenarioOutput.outputType, parts: scenarioOutput.parts }
      artifacts.write(`sample-${name}.json`, result)
      summary.coverage.find(row => row.caseId === scenario.id).samples.push(sample)
      return result
    })
    loaded.assertUnchanged()
    summary.aggregate = aggregate(loaded.cases, samples)
    summary.advisory = advisoryRepeats(summary.aggregate, prior)
    summary.status = summary.aggregate.pass ? 'PASS' : 'FAIL'
    if (!summary.aggregate.pass) summary.notDone.push('One or more binding metrics or floor cases failed; see per-case results and citations.')
  } catch (error) {
    summary.notDone.push(error instanceof EvalBlocked ? error.code : 'runner-io-or-input-failure')
    summary.notDone.push('Full release measurement is unavailable. No aggregate scores admitted; inspected partial receipts remain diagnostic evidence.')
  }
  artifacts.write('summary.json', summary)
  artifacts.write('RESULTS.md', markdown(summary))
  return { summary, directory: artifacts.directory, exitCode: summary.status === 'PASS' ? 0 : 1 }
}
