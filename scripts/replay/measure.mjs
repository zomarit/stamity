// The replay's per-run measurement (REPLAY-v1 §8): one run directory in, one
// `stamity/replay-measurement/v1` document out, which the scorer (`scripts/replay/score.mjs`) reads.
//
// The run directory is the layout of the replay's contract census, the same one the synthetic
// builders write (`writeCapture` in `test/replay/synth.ts`): `run.json` beside `captures/`, and
// under `captures/` the driver's stdout, the main transcript and its sub-agent files, the per-pass
// snapshots, the fixture's run-state copies and the oracle results. This file resolves every path
// itself and imports nothing from `test/`.
//
// What it measures, each rule as §8 states it:
//
//   * loop characters — (a) deliveries and (b) Agent prompts and SendMessages of the non-branch
//     agents whose role function is build, fix, verdict or gate (resumes reported apart), plus
//     (c) ledger writes of the kinds `LEDGER_GATED_KINDS` names (every other kind the walk returns
//     is reported beside the gated figure, never inside it), (d) brief files and (e) report reads
//     (Read, read- or search-class Bash, and Grep or Glob on a report path),
//     each with its tool results; ÷ 6 per pass;
//   * sub-agent tokens — Σ `processed` over the loop-function agents, ÷ 6;
//   * recall, decoy flags and unmatched findings, by the deterministic matcher
//     (`scripts/replay/findings.mjs`) over every verdict-role finding: returns in both shapes,
//     report blocks, digests and ledger rows from a verdict source;
//   * verdicts per pass, the whole-branch verdict, compaction samples and the run's validity.
//
// Where §8 leaves a reading open, this file takes the one that cannot ease the merge gate; each
// such reading is named at its rule below.

import { createReadStream, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { spellingsOf } from '../qa/redact.mjs'
import { extractFreeText, ledgerFindings, matchItems, parseDigest, parseFindingsBlock, unreadFreeText, verdictOf } from './findings.mjs'
import { PASS_IDS } from './fixture.mjs'
import { LEDGER_GATED_KINDS, roleFunction, scanSubagent, walkTranscriptLines } from './transcript.mjs'

const SELF = fileURLToPath(import.meta.url)

export const MEASUREMENT_SCHEMA = 'stamity/replay-measurement/v1'
const SEEDS_SCHEMA = 'stamity/replay-seeds/v1'

/** REPLAY-v1 §3: the orchestrator's model pin. */
const ORCHESTRATOR_MODEL = 'claude-opus-5-5'
/** §8: every per-pass figure divides the run's total by the six passes. */
const PASS_COUNT = 6
/** §8: projected compactions per 10 passes = 10 × context tokens per pass ÷ this. */
const COMPACTION_TOKENS = 947_000
/** §8: the per-pass split is flagged unreliable above this unattributed share. */
const UNATTRIBUTED_MAX = 0.2
/** §8: substrings whose appearance in any tool input voids the run, beside the `--forbid` paths. */
const ALWAYS_FORBIDDEN = ['seeds.json', '__oracle__']

const LOOP_FUNCTIONS = new Set(['build', 'fix', 'verdict', 'gate'])
const FLAG_SEVERITIES = ['Critical', 'Warning']
const PASS_ID = /\bu[1-3]-p[12]\b/
const PASS_IDS_G = /\bu[1-3]-p[12]\b/g
const RESUME = /^Resume|after the (?:rate limit|stall)/i
const WHOLE_BRANCH = /whole[- ]branch/i
const BRIEF = /\/briefs?\/|brief[-\w]*\.md|\/lanes\//
const REPORT_READ = /\.stamity\/runs\/[^/\s'"]+\/reports\/|\/tasks\/[^/\s'"]+\.output/
/** A `BLOCKED_*` status at the start of a line (a bare mention inside a sentence is no status). */
const BLOCKED = /^[\s*#>-]*(?:status[\s*:]*)?`?BLOCKED_[A-Z]+/im
const REPORT_FILE = /^(.+)-(implementer|fixer|reviewer|security|performance|design-quality|test-runner|spec-author)-r(\d+)\.md$/
/** A C2 `stamity-findings` fence: with a digest's `status:` and `report:` pair, the mark of a structured return. */
const C2_FENCE = /^ {0,3}```stamity-findings[ \t]*$/m
/**
 * Bash classes that count as a read for term (e): `read`, `search` (a grep or rg prints the lines it
 * finds, build/185) and `rs`, and `mixed`, which pairs a read or search head verb with another
 * verb — counting it can only raise the loop figure, never hide an on-demand read.
 */
const READ_CLASSES = new Set(['read', 'rs', 'mixed', 'search'])
/** Tool results whose text is a sub-agent's delivery. */
const DELIVERY_TOOLS = new Set(['Agent', 'Task', 'SendMessage', 'TaskOutput'])
/** Tools whose results term (e) reads when their input names a report path (build/169). */
const SEARCH_TOOLS = new Set(['Grep', 'Glob'])
/** The length above which the walk once read a SendMessage result as a report; now only a visibility mark. */
const LONG_SEND_RESULT = 1500

// ---------- small readers ----------

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

function readTextIfPresent(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR' || error?.code === 'ENOTDIR') return null
    throw error
  }
}

function readJsonIfPresent(path) {
  const text = readTextIfPresent(path)
  return text === null ? null : JSON.parse(text)
}

function entriesOf(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return []
    throw error
  }
}

/** Every line of a file, streamed (a single transcript line can be megabytes). */
async function readLines(path) {
  const out = []
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  for await (const text of rl) out.push(text)
  return out
}

/** The object rows of a JSONL text, and how many non-blank lines were no JSON object. */
function jsonlCounted(text) {
  const rows = []
  let errors = 0
  for (const line of (text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const o = parseJson(line)
    if (o && typeof o === 'object' && !Array.isArray(o)) rows.push(o)
    else errors++
  }
  return { rows, errors }
}

/** Text of a tool_result's content: a string, or its text blocks joined by newlines. */
function resultText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter((b) => b?.type === 'text').map((b) => b.text || '').join('\n')
}

/** The role a sub-agent type names, without a plugin namespace or the `stamity-` prefix. */
const roleName = (type) => String(type ?? '').split(':').pop().replace(/^stamity-/, '') || null

const sum = (list, f) => list.reduce((a, x) => a + f(x), 0)

// ---------- the capture layout ----------

/**
 * The census layout of one run directory: `run.json` in it, everything else under `captures/`.
 */
function layoutOf(runDir) {
  const captures = join(runDir, 'captures')
  return {
    runJson: join(runDir, 'run.json'),
    stdout: join(captures, 'stdout.jsonl'),
    transcriptDir: join(captures, 'transcript'),
    snapshots: join(captures, 'snapshots'),
    state: join(captures, 'state'),
    oracle: join(captures, 'oracle.json'),
  }
}

/**
 * Every spelling of the given absolute roots (build/112): the path, its resolved form
 * (`spellingsOf`, the redaction precedent), and the macOS `/var` ↔ `/private/var` twin, which
 * holds even after the fixture is gone and `realpath` can no longer resolve it.
 */
function rootSpellings(paths) {
  const out = new Set()
  for (const path of paths) {
    if (typeof path !== 'string' || path.length < 2) continue
    for (const [spelling] of spellingsOf(path, '')) {
      out.add(spelling)
      if (spelling.startsWith('/private/var/')) out.add(spelling.slice('/private'.length))
      else if (spelling.startsWith('/var/')) out.add(`/private${spelling}`)
    }
  }
  return [...out]
}

/** The worktree paths run.json records (`worktrees`: strings, or objects with a `path` or `worktree`). */
function worktreesOf(run) {
  const list = Array.isArray(run?.worktrees) ? run.worktrees : []
  return list.map((w) => (typeof w === 'string' ? w : typeof w?.path === 'string' ? w.path : typeof w?.worktree === 'string' ? w.worktree : null)).filter(Boolean)
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Every absolute path prefix in `texts` that ends at a directory named like a snapshot copy
 * (`…/<worktree>/`), the split point a lane-worktree locator is made relative at (build/182). A
 * prefix must start a path token, so a relative path that passes through such a name is left alone.
 */
function splitRoots(texts, names) {
  const out = new Set()
  for (const name of names) {
    if (!name) continue
    const re = new RegExp(`(?<![\\w.~-])(/[^\\s'"\`|()<>\\[\\]{},;]*?/${escapeRe(name)})(?=/)`, 'g')
    for (const text of texts) for (const m of String(text ?? '').matchAll(re)) out.add(m[1])
  }
  return [...out]
}

// ---------- seeds ----------

function checkSeeds(seeds) {
  if (!seeds || typeof seeds !== 'object' || seeds.schema !== SEEDS_SCHEMA) throw new Error(`seeds: the document is not ${SEEDS_SCHEMA}`)
  for (const list of ['seeds', 'decoys']) {
    if (!Array.isArray(seeds[list])) throw new Error(`seeds: "${list}" is not a list`)
    for (const item of seeds[list]) {
      const where = `seeds: ${list} item ${JSON.stringify(item?.id ?? null)}`
      if (typeof item?.id !== 'string' || !item.id) throw new Error(`${where} has no id`)
      if (!PASS_IDS.includes(item.pass)) throw new Error(`${where} names no pass of ${PASS_IDS.join(', ')}`)
      if (typeof item.file !== 'string' || !item.file) throw new Error(`${where} names no file`)
      if (!Array.isArray(item.span) || item.span.length !== 2 || !item.span.every(Number.isInteger)) throw new Error(`${where} has no [start, end] span`)
      if (!Array.isArray(item.terms) || item.terms.length === 0) throw new Error(`${where} has no terms`)
    }
  }
}

const copiesOf = (snapshots, pass) => entriesOf(join(snapshots, pass)).filter((e) => e.isDirectory()).map((e) => join(snapshots, pass, e.name))
const fileIn = (copy, file) => readTextIfPresent(join(copy, ...file.split('/')))
const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])

/** Whether a seed's `present` rule holds in one snapshot copy; `null` when the copy lacks the file. */
function presentIn(copy, item) {
  const text = fileIn(copy, item.file)
  if (text === null) return null
  const rule = item.present ?? {}
  return asList(rule.contains).every((s) => text.includes(s)) && asList(rule.notContains).every((s) => !text.includes(s))
}

/**
 * An item's spans in the reviewed trees: every line of every snapshot copy that holds
 * `locate.text`, widened by `locate.from`/`locate.to` — the lines a reviewer of that tree cites,
 * which drift from the pure seeded tree's `span` as the chain's own edits land. With no located
 * line anywhere, the matcher falls back to the item's `span`.
 */
function relocatedSpans(items, snapshots, passes = entriesOf(snapshots).filter((e) => e.isDirectory()).map((e) => e.name)) {
  const byFile = {}
  for (const item of items) {
    const needle = item.locate?.text
    if (typeof needle !== 'string' || !needle) continue
    const seen = new Map()
    for (const pass of passes) {
      for (const copy of copiesOf(snapshots, pass)) {
        const text = fileIn(copy, item.file)
        if (text === null) continue
        text.split(/\r?\n/).forEach((line, i) => {
          if (!line.includes(needle)) return
          const span = [i + 1 + (item.locate.from ?? 0), i + 1 + (item.locate.to ?? 0)]
          seen.set(span.join(':'), span)
        })
      }
    }
    if (seen.size > 0) (byFile[item.file] ??= {})[item.id] = [...seen.values()]
  }
  return byFile
}

// ---------- attribution ----------

/**
 * The pass a dispatch belongs to: the first `u<n>-p<n>` in its description, else the single
 * distinct pass id its prompt names; several distinct ids in the prompt give `multi`, none `null`.
 */
export function attributePass(desc, prompt) {
  const first = String(desc ?? '').match(PASS_ID)
  if (first) return first[0]
  const ids = new Set(String(prompt ?? '').match(PASS_IDS_G) ?? [])
  if (ids.size === 1) return [...ids][0]
  return ids.size > 1 ? 'multi' : null
}

const isPass = (p) => PASS_IDS.includes(p)
const passKey = (p) => (isPass(p) ? p : 'unattributed')

/**
 * One streamed pass over the main transcript for what the walk's rows do not carry: every tool
 * input by id, the text of every delivery-tool and Grep or Glob result, the ids of the Bash calls
 * whose result names a report path, and the `cwd` of every entry.
 */
function indexTranscript(lines) {
  const uses = new Map()
  const results = new Map()
  const bashNamesReport = new Set()
  const cwds = new Set()
  for (const text of lines) {
    if (!text.trim()) continue
    const o = parseJson(text)
    if (!o || typeof o !== 'object' || o.isSidechain) continue
    if (typeof o.cwd === 'string') cwds.add(o.cwd)
    const content = o.message?.content
    if (!Array.isArray(content)) continue
    for (const b of content) {
      if (o.type === 'assistant' && b?.type === 'tool_use') uses.set(b.id, { name: b.name, input: b.input ?? {} })
      else if (o.type === 'user' && b?.type === 'tool_result') {
        const name = uses.get(b.tool_use_id)?.name
        if (DELIVERY_TOOLS.has(name) || SEARCH_TOOLS.has(name)) results.set(b.tool_use_id, resultText(b.content))
        else if (name === 'Bash' && REPORT_READ.test(resultText(b.content))) bashNamesReport.add(b.tool_use_id)
      }
    }
  }
  return { uses, results, bashNamesReport, cwds }
}

async function cwdsOf(path) {
  const out = new Set()
  for (const text of await readLines(path)) {
    const o = text.trim() ? parseJson(text) : undefined
    if (o && typeof o.cwd === 'string') out.add(o.cwd)
  }
  return out
}

/** The first `system`/`init` event of the driver's stdout, streamed and stopped there (stdout is the largest capture). */
async function initEvent(stdoutPath) {
  try {
    if (!statSync(stdoutPath).isFile()) return null
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null
    throw error
  }
  const input = createReadStream(stdoutPath)
  const rl = createInterface({ input, crlfDelay: Infinity })
  try {
    for await (const text of rl) {
      if (!text.includes('"init"')) continue
      const o = parseJson(text)
      if (o && o.type === 'system' && o.subtype === 'init') return o
    }
    return null
  } finally {
    rl.close()
    input.destroy()
  }
}

/**
 * Whether a sub-agent's answering model stays inside its pin (§3: "an alias resolving to another
 * model voids the run"): an alias (`opus`, `sonnet`, …) must resolve to a model of that family,
 * a full id to itself, `inherit` to the orchestrator's pin. With no requested model on record the
 * model is recorded and not judged.
 */
function withinPin(requested, model) {
  if (typeof requested !== 'string' || requested === '') return true
  if (requested === 'inherit') return model === ORCHESTRATOR_MODEL
  if (/^[a-z]+$/.test(requested)) return new RegExp(`(?:^|-)${requested}(?:-|$)`).test(model)
  return model === requested
}

// ---------- findings ----------

/** A delivery's verdict: `blocked` on a `BLOCKED_*` return, else the digest's label, else the free-text word. */
function verdictOfDelivery(text, digest) {
  if (BLOCKED.test(text)) return 'blocked'
  return digest.verdict ?? verdictOf(text)
}

const locKey = (f) => (f.file == null ? null : `${f.file}:${f.line}-${f.lineEnd ?? f.line}`)

function rangesMeet(a, b, tolerance) {
  return a.line <= (b.lineEnd ?? b.line) + tolerance && (a.lineEnd ?? a.line) >= b.line - tolerance
}

/**
 * Whether a ledger row covers a finding: its `report` is the finding's report, or the same file within
 * ±tolerance, or — for a finding with no file (a gate command, build/202) — a row that has no file
 * either and whose text holds the finding's text (build/206: a row with a file covers only its own
 * location, so it never lowers at-risk for a file-less finding).
 */
function hasRow(f, rows, tolerance) {
  const text = f.file == null ? String(f.text ?? '').trim() : ''
  return rows.some((r) => (f.reportPath && r.reportPath === f.reportPath)
    || (f.file != null && r.file === f.file && r.line != null && rangesMeet(f, r, tolerance))
    || (text !== '' && r.file == null && String(r.text ?? '').includes(text)))
}

/** The fixture run folders of one state copy (`compaction-<n>-pre` or `end`): ledger rows and report files. */
function readState(stateDir) {
  const runsDir = join(stateDir, 'runs')
  const ledger = []
  const reports = []
  let ledgerParseErrors = 0
  for (const run of entriesOf(runsDir).filter((e) => e.isDirectory())) {
    const { rows, errors } = jsonlCounted(readTextIfPresent(join(runsDir, run.name, 'ledger.jsonl')))
    ledger.push(...rows)
    ledgerParseErrors += errors
    for (const file of entriesOf(join(runsDir, run.name, 'reports')).filter((e) => e.isFile() && e.name.endsWith('.md'))) {
      reports.push({ runId: run.name, file: file.name, text: readTextIfPresent(join(runsDir, run.name, 'reports', file.name)) ?? '' })
    }
  }
  return { present: entriesOf(stateDir).length > 0, ledger, reports, ledgerParseErrors }
}

/** The final class from the last delivery; `rounds` counts only the deliveries that are rounds (build/175). */
function finalClassOf(reviews) {
  if (reviews.length === 0) return null
  const last = reviews.at(-1).verdict
  const rounds = reviews.filter((d) => d.round).length
  if (last === 'approve') return rounds <= 1 ? 'approve' : 'approve-after-fixes'
  if (last === 'request-changes' || last === 'blocked') return 'blocked'
  return null
}

// ---------- the measurement: loading ----------

/**
 * The capture read once: `run.json`, the main transcript (walked, and indexed for what the walk's
 * rows do not carry), every sub-agent scan, the init event, and every spelling of every root the
 * transcripts name. Validity reasons found on the way go to `invalid`.
 */
async function loadCapture(runDir, forbid) {
  const L = layoutOf(runDir)
  const invalid = []
  const run = readJsonIfPresent(L.runJson)
  if (run === null) invalid.push('run.json is missing')
  const endReason = run?.end?.reason ?? null
  if (endReason !== 'complete') invalid.push(`run.json end.reason is ${endReason === null ? 'absent' : JSON.stringify(endReason)}, not "complete"`)

  // Forbidden inputs, each spelling labelled so no absolute path reaches the document.
  const forbidLabels = new Map(ALWAYS_FORBIDDEN.map((s) => [s, s]))
  forbid.forEach((path, k) => {
    for (const spelling of rootSpellings([path])) forbidLabels.set(spelling, `--forbid[${k}]`)
  })
  const forbidList = [...forbidLabels.keys()]

  const sessions = entriesOf(L.transcriptDir).filter((e) => e.isFile() && e.name.endsWith('.jsonl')).map((e) => e.name)
  if (sessions.length !== 1) throw new Error(`expected one main transcript under captures/transcript/, found ${sessions.length}`)
  const session = sessions[0].slice(0, -'.jsonl'.length)
  const lines = await readLines(join(L.transcriptDir, sessions[0]))
  const walk = walkTranscriptLines(lines, { forbid: forbidList })
  const index = indexTranscript(lines)
  const subDir = join(L.transcriptDir, session, 'subagents')
  const subFiles = entriesOf(subDir).filter((e) => e.isFile() && /^agent-.+\.jsonl$/.test(e.name)).map((e) => e.name)
  const subs = await Promise.all(subFiles.map(async (name) => {
    const agentId = name.slice('agent-'.length, -'.jsonl'.length)
    const [scan, cwds] = await Promise.all([
      scanSubagent(join(subDir, name), join(subDir, `agent-${agentId}.meta.json`), { forbid: forbidList }),
      cwdsOf(join(subDir, name)),
    ])
    return Object.assign(scan, { agentId, cwds })
  }))
  const init = await initEvent(L.stdout)

  const orchestratorModels = {}
  for (const r of walk.requests) if (r.model && r.model !== '<synthetic>') orchestratorModels[r.model] = (orchestratorModels[r.model] ?? 0) + 1
  if (init === null) invalid.push('no init event in captures/stdout.jsonl, so the orchestrator model pin cannot be checked')
  else if (init.model !== ORCHESTRATOR_MODEL) invalid.push(`init model ${JSON.stringify(init.model ?? null)} is not the pin ${ORCHESTRATOR_MODEL}`)
  for (const model of Object.keys(orchestratorModels)) if (model !== ORCHESTRATOR_MODEL) invalid.push(`orchestrator request answered on ${model}, not the pin ${ORCHESTRATOR_MODEL}`)
  for (const hit of walk.forbidHits) invalid.push(`forbidden ${forbidLabels.get(hit.forbid)} in a ${hit.tool} input (main transcript line ${hit.line})`)
  for (const s of subs) for (const hit of s.forbidHits) invalid.push(`forbidden ${forbidLabels.get(hit.forbid)} in a ${hit.tool} input (sub-agent ${s.agentId} line ${hit.line})`)

  const stateNames = entriesOf(L.state).filter((e) => e.isDirectory()).map((e) => e.name)
  const states = Object.fromEntries(stateNames.map((name) => [name, readState(join(L.state, name))]))
  // build/182: every root a locator may be spelled under — the transcripts' cwds, the init cwd, the
  // worktrees run.json records, and every absolute path that ends in a snapshot copy's worktree name.
  const texts = [
    ...walk.deliveries.map((d) => d.result ?? ''), ...index.results.values(),
    ...stateNames.flatMap((n) => [...states[n].reports.map((r) => r.text), ...states[n].ledger.map((r) => String(r.evidence ?? ''))]),
  ]
  const copyNames = new Set(entriesOf(L.snapshots).filter((e) => e.isDirectory()).flatMap((e) => copiesOf(L.snapshots, e.name).map((c) => c.split(/[\\/]/).pop())))
  const roots = rootSpellings([...index.cwds, ...subs.flatMap((s) => [...s.cwds]), init?.cwd, ...worktreesOf(run), ...splitRoots(texts, copyNames)])
  const oracle = readJsonIfPresent(L.oracle)
  const oracleStatus = new Map((Array.isArray(oracle?.results) ? oracle.results : []).map((r) => [r.seed, r.status]))
  return { L, run, invalid, walk, index, subs, init, roots, orchestratorModels, stateNames, states, oracleStatus }
}

// ---------- the measurement: agents ----------

/**
 * The orchestrator's agents, joined across the walk: each Agent dispatch with its role function
 * and pass, the SendMessages that reach it, and every delivery — a notification, or a synchronous
 * Agent, SendMessage or TaskOutput result — with its digest and verdict read once.
 */
function joinAgents(walk, index, subs, roots) {
  const agents = []
  const byUse = new Map()
  for (const d of walk.dispatches.filter((x) => x.kind === 'agent')) {
    const input = index.uses.get(d.toolUseId)?.input ?? {}
    const prompt = typeof input.prompt === 'string' ? input.prompt : ''
    const agent = {
      toolUseId: d.toolUseId, line: d.line, role: roleName(d.role), fn: roleFunction(d.role), desc: d.desc ?? '', prompt, chars: d.chars,
      model: d.model ?? null, name: typeof input.name === 'string' && input.name ? input.name : null, pass: attributePass(d.desc, prompt),
      branch: false, round: 1, resume: RESUME.test(prompt),
    }
    agents.push(agent)
    byUse.set(d.toolUseId, agent)
  }
  // A sub-agent is joined by the dispatching tool_use id its meta file records, then by the id its
  // launch ack names, then by the name its dispatch gave it (the three spellings a SendMessage `to` uses).
  const byAgentId = new Map()
  for (const s of subs) if (s.toolUseId && byUse.has(s.toolUseId)) byAgentId.set(s.agentId, byUse.get(s.toolUseId))
  for (const agent of agents) {
    const ack = index.results.get(agent.toolUseId)?.match(/agentId:\s*([\w-]+)/)
    if (ack && !byAgentId.has(ack[1])) byAgentId.set(ack[1], agent)
    if (agent.name && !byAgentId.has(agent.name)) byAgentId.set(agent.name, agent)
  }
  const sends = walk.dispatches.filter((x) => x.kind === 'send').map((d) => {
    const input = index.uses.get(d.toolUseId)?.input ?? {}
    const message = typeof input.message === 'string' ? input.message : typeof input.content === 'string' ? input.content : ''
    return { toolUseId: d.toolUseId, line: d.line, chars: d.chars, target: byAgentId.get(d.to) ?? null, resume: RESUME.test(message) }
  })
  const sendByUse = new Map(sends.map((s) => [s.toolUseId, s]))

  // A delivery is a round (build/175) when it completed and carries a verdict: a failed
  // notification is none, and neither is a TaskOutput re-read of a task already notified.
  // build/184: a delivery joined to no dispatch falls back to the sub-agent file its notification
  // names (the file's agent id is the task id, or its meta records the tool_use id); the agent
  // built from that file's meta carries the file's first prompt as its dispatch prompt in term (b)
  // (build/207), since the main transcript shows none, and is named in the notes.
  const fromFile = new Map()
  const fileAgent = (key, line) => {
    const s = key ? subs.find((x) => x.agentId === key || (x.toolUseId && x.toolUseId === key)) : null
    if (!s) return null
    if (byAgentId.has(s.agentId)) return byAgentId.get(s.agentId)
    if (!fromFile.has(s.agentId)) {
      const prompt = s.firstPrompt ?? ''
      const agent = {
        toolUseId: s.toolUseId, line, role: roleName(s.agentType), fn: roleFunction(s.agentType), desc: s.description ?? '', prompt, chars: prompt.length,
        model: null, name: null, pass: attributePass(s.description, s.firstPrompt), branch: false, round: 1, resume: RESUME.test(prompt), fromFile: true, agentId: s.agentId,
      }
      fromFile.set(s.agentId, agent)
      agents.push(agent)
      byAgentId.set(s.agentId, agent)
    }
    return fromFile.get(s.agentId)
  }
  const deliveries = []
  const taskAgent = new Map()
  const notified = new Map()
  for (const d of walk.deliveries) {
    const agent = byUse.get(d.toolUseId) ?? sendByUse.get(d.toolUseId)?.target ?? fileAgent(d.taskId, d.line) ?? fileAgent(d.toolUseId, d.line)
    if (agent && d.taskId) taskAgent.set(d.taskId, agent)
    if (d.taskId && !notified.has(d.taskId)) notified.set(d.taskId, d.line)
    const failed = typeof d.status === 'string' && d.status !== 'completed'
    deliveries.push({ line: d.line, chars: d.chars, text: d.result ?? '', agent, trailer: d.subagentTokens ?? 0, failed, reread: false, tool: 'task-notification' })
  }
  const notes = []
  const longAcks = []
  for (const e of walk.events) {
    if (e.dir !== 'in' || !e.toolUseId) continue
    if (e.tool === 'SendMessage' && e.cls === 'returns.sendAck' && e.chars > LONG_SEND_RESULT) longAcks.push(e.line)
    if (e.cls !== 'returns.report') continue
    let agent = null
    let reread = false
    if (e.tool === 'Agent' || e.tool === 'Task') agent = byUse.get(e.toolUseId) ?? fileAgent(e.toolUseId, e.line)
    else if (e.tool === 'SendMessage') {
      const send = sendByUse.get(e.toolUseId)
      agent = send?.target ?? fileAgent(index.uses.get(e.toolUseId)?.input?.to, e.line)
      if (send && send.target === null) send.target = agent
    } else if (e.tool === 'TaskOutput') {
      const taskId = index.uses.get(e.toolUseId)?.input?.task_id
      agent = taskAgent.get(taskId) ?? byAgentId.get(taskId) ?? fileAgent(taskId, e.line)
      reread = notified.has(taskId) && notified.get(taskId) < e.line
    }
    deliveries.push({ line: e.line, chars: e.chars, text: index.results.get(e.toolUseId) ?? '', agent, trailer: 0, failed: false, reread, tool: e.tool })
  }
  // build/165: a SendMessage result is a delivery by its content; a long one with no delivery mark
  // is read as an acknowledgement, out of term (a) and the rounds, and named here.
  if (longAcks.length > 0) notes.push(`${longAcks.length} SendMessage result(s) over ${LONG_SEND_RESULT} characters read as acknowledgements (no digest label, BLOCKED_ status or verdict word), outside term (a) and the rounds: main transcript line(s) ${longAcks.join(', ')}`)
  deliveries.sort((a, b) => a.line - b.line)
  for (const d of deliveries) {
    d.digest = parseDigest(d.text, { source: 'digest', role: d.agent?.role ?? null, roots })
    d.verdict = verdictOfDelivery(d.text, d.digest)
    // build/201: every completed delivery that is no re-read is a round, as §8 words it; a
    // reviewer's round with no readable verdict is named below.
    d.round = !d.failed && !d.reread
  }
  for (const d of deliveries) {
    if (d.agent === null) notes.push(`delivery joined to no agent: main transcript line ${d.line}, ${d.tool}, ${d.chars} characters — out of the findings, rounds and compaction samples, kept in term (a) unattributed`)
    else if (d.agent.role === 'reviewer' && d.round && d.verdict === null) notes.push(`reviewer round with no readable verdict: main transcript line ${d.line}, ${d.chars} characters — counted as a round`)
  }
  for (const a of fromFile.values()) notes.push(`agent ${a.agentId} built from its sub-agent file (${a.role ?? 'unknown'}, ${a.pass ?? 'no pass'}): its dispatch prompt of ${a.chars} characters counted in term (b)${a.resume ? ' as a resume' : ''}, read from the file's first prompt`)
  for (const s of sends) if (s.target === null) notes.push(`SendMessage joined to no agent: main transcript line ${s.line}, ${s.chars} characters — kept in term (b) unattributed`)

  // Branch-level verdict dispatches: after u3-p2's last reviewer approval with no single pass id,
  // or named a whole-branch pass. The prompt is read for the name only when the dispatch carries
  // no single pass id, so a per-pass brief that mentions the whole-branch review stays per pass.
  const lastApproval = deliveries.findLast((d) => d.agent?.role === 'reviewer' && d.agent.pass === 'u3-p2' && d.verdict === 'approve')?.line ?? Infinity
  for (const a of agents) {
    if (a.fn === 'verdict') a.branch = WHOLE_BRANCH.test(a.desc) || (!isPass(a.pass) && (a.line > lastApproval || WHOLE_BRANCH.test(a.prompt)))
  }
  // A verdict agent's round: one more than the fixers of its pass dispatched before it.
  const fixers = agents.filter((a) => a.fn === 'fix')
  for (const a of agents) a.round = 1 + fixers.filter((f) => f.pass === a.pass && f.line < a.line).length
  return { agents, byAgentId, sends, deliveries, notes }
}

// ---------- the measurement: loop characters and sub-agent tokens ----------

/** Whether a Grep or Glob reads report text: its path, pattern or glob names a report path, or its results do. */
function searchesReports(input, result) {
  const i = input && typeof input === 'object' ? input : {}
  const path = typeof i.path === 'string' ? i.path : ''
  const spellings = [path, i.pattern, i.glob, `${path.replace(/\/+$/, '')}/${typeof i.glob === 'string' ? i.glob : typeof i.pattern === 'string' ? i.pattern : ''}`]
  return spellings.some((s) => typeof s === 'string' && REPORT_READ.test(s)) || REPORT_READ.test(result ?? '')
}

const blankBreakdown = () => ({ returns: 0, prompts: 0, ledger: 0, briefs: 0, reportReads: 0, resumes: 0 })
/** The loop figure of a breakdown row: every term but the resumes, which are reported apart. */
const loopOf = (row) => row.returns + row.prompts + row.ledger + row.briefs + row.reportReads
const byPass = (make) => Object.fromEntries([...PASS_IDS, 'unattributed'].map((k) => [k, make()]))

/**
 * §8's loop characters per pass, terms (a)–(e), with the resumes apart and every ledger kind outside
 * `LEDGER_GATED_KINDS` reported beside the gated figure (`beside`), never inside it. Terms (c)–(e)
 * are orchestrator calls, each attributed to the pass of the last loop dispatch before it. An
 * unresolved delivery or send (no dispatch to join it to) stays in the loop, unattributed: leaving
 * it out could only lower the figure.
 */
function loopCharacters(walk, index, agents, sends, deliveries) {
  const perPass = byPass(blankBreakdown)
  const inLoop = (agent) => agent === null || (LOOP_FUNCTIONS.has(agent.fn) && !agent.branch)
  const passLines = agents.filter((a) => LOOP_FUNCTIONS.has(a.fn) && !a.branch && isPass(a.pass)).map((a) => [a.line, a.pass])
  const passAt = (line) => passLines.findLast(([l]) => l <= line)?.[1] ?? 'unattributed'
  const resultChars = new Map()
  for (const e of walk.events) if (e.dir === 'in' && e.toolUseId) resultChars.set(e.toolUseId, (resultChars.get(e.toolUseId) ?? 0) + e.chars)
  const withResult = (chars, id) => chars + (resultChars.get(id) ?? 0)
  let unresolved = 0

  // (a) deliveries, (b) prompts and sends.
  for (const d of deliveries) {
    if (d.agent === null) unresolved++
    if (inLoop(d.agent)) perPass[passKey(d.agent?.pass)].returns += d.chars
  }
  for (const a of agents) if (inLoop(a)) perPass[passKey(a.pass)][a.resume ? 'resumes' : 'prompts'] += a.chars
  for (const s of sends) {
    if (s.target === null) unresolved++
    if (inLoop(s.target)) perPass[passKey(s.target?.pass)][s.resume ? 'resumes' : 'prompts'] += s.chars
  }

  // (c) ledger writes: the gated kinds only.
  const beside = {}
  const counted = new Set()
  const ledgerCalls = [
    ...walk.bash.filter((b) => b.kind === 'command' && b.ledger).map((b) => ({ id: b.toolUseId, line: b.line, ledger: b.ledger })),
    ...walk.events.filter((e) => e.dir === 'out' && e.ledger).map((e) => ({ id: e.toolUseId, line: e.line, ledger: e.ledger })),
  ]
  for (const call of ledgerCalls) {
    const chars = withResult(call.ledger.chars, call.id)
    if (LEDGER_GATED_KINDS.has(call.ledger.kind)) {
      counted.add(call.id)
      perPass[passAt(call.line)].ledger += chars
    } else {
      const row = (beside[call.ledger.kind] ??= { calls: 0, chars: 0 })
      row.calls++
      row.chars += chars
    }
  }

  // (d) brief files: a Write or Edit on a brief path, or a heredoc into one.
  for (const e of walk.events) {
    if (e.dir !== 'out' || !['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(e.tool) || counted.has(e.toolUseId)) continue
    if (!BRIEF.test(String(e.filePath ?? ''))) continue
    counted.add(e.toolUseId)
    perPass[passAt(e.line)].briefs += withResult(e.chars, e.toolUseId)
  }
  for (const b of walk.bash) {
    if (b.kind !== 'command') continue
    const briefChars = sum(b.heredocs.filter((h) => BRIEF.test(h.target)), (h) => h.chars)
    if (briefChars === 0) continue
    // A command already counted under (c) keeps its brief bodies here; its result is counted there once (build/173).
    if (counted.has(b.toolUseId)) {
      perPass[passAt(b.line)].briefs += briefChars
      continue
    }
    counted.add(b.toolUseId)
    perPass[passAt(b.line)].briefs += withResult(briefChars, b.toolUseId)
  }

  // (e) report reads: a Read, a read-class Bash call, or a Grep or Glob (build/169) naming a report
  // or a task output, or a Grep or Glob whose results name one.
  for (const e of walk.events) {
    if (e.dir !== 'out') continue
    if (e.tool === 'Read' && REPORT_READ.test(String(e.filePath ?? ''))) perPass[passAt(e.line)].reportReads += withResult(e.chars, e.toolUseId)
    else if (SEARCH_TOOLS.has(e.tool) && searchesReports(index.uses.get(e.toolUseId)?.input, index.results.get(e.toolUseId))) {
      perPass[passAt(e.line)].reportReads += withResult(e.chars, e.toolUseId)
    }
  }
  for (const b of walk.bash) {
    if (b.kind !== 'command' || counted.has(b.toolUseId) || !READ_CLASSES.has(b.cls)) continue
    if (!REPORT_READ.test(b.command) && !index.bashNamesReport.has(b.toolUseId)) continue
    perPass[passAt(b.line)].reportReads += withResult(b.chars, b.toolUseId)
  }
  return { perPass, beside, unresolved }
}

/**
 * §8's sub-agent tokens (Σ `processed` over the loop-function agents, branch passes included, as the
 * rule names no exclusion), the output tokens and notification trailer reported beside them, and
 * each sub-agent's models against its pin.
 */
function subagentUsage(subs, byAgentId, deliveries, invalid, notes) {
  const tokensByPass = byPass(() => 0)
  let tokens = 0
  let outputTokens = 0
  const models = []
  const unjoined = []
  for (const s of subs) {
    const agent = byAgentId.get(s.agentId) ?? null
    const requested = s.requestedModel ?? agent?.model ?? null
    models.push({ agentId: s.agentId, agentType: s.agentType, requested, resolved: s.models, unparseableLines: s.parseErrors ?? 0 })
    for (const model of Object.keys(s.models)) {
      if (model !== '<synthetic>' && !withinPin(requested, model)) invalid.push(`sub-agent ${s.agentType ?? 'unknown'} (${s.agentId}) answered on ${model}, outside the pin for ${requested}`)
    }
    // build/164: a sub-agent joined to no dispatch and naming no type could be any role, so its
    // tokens stay in the sum, unattributed, and it is counted and named.
    if (agent === null && !s.agentType) unjoined.push(s.agentId)
    else if (!LOOP_FUNCTIONS.has(agent?.fn ?? roleFunction(s.agentType))) continue
    tokens += s.processed
    outputTokens += s.outTok
    tokensByPass[passKey(agent?.pass)] += s.processed
  }
  const trailer = sum(deliveries.filter((d) => d.agent && LOOP_FUNCTIONS.has(d.agent.fn)), (d) => d.trailer)
  if (unjoined.length > 0) notes.push(`${unjoined.length} sub-agent(s) joined to no dispatch and naming no agent type, their tokens kept in the sub-agent-token sum unattributed: ${unjoined.join(', ')}`)
  return { tokensByPass, tokens, outputTokens, trailer, models, unjoined: unjoined.length }
}

/**
 * build/186: the dispatches reconciled against the scanned sub-agent files. `agentsWithoutTranscript`
 * lists every dispatched agent no sub-agent file joins to (its tokens are missing from the sum), and
 * one note compares, per loop agent, the notification's `subagent_tokens` with the file's `processed`.
 */
function reconcileAgents(agents, subs, byAgentId, deliveries, notes) {
  const processed = new Map()
  for (const s of subs) {
    const agent = byAgentId.get(s.agentId)
    if (agent) processed.set(agent, (processed.get(agent) ?? 0) + s.processed)
  }
  const agentsWithoutTranscript = agents.filter((a) => !a.fromFile && !processed.has(a)).map((a) => ({ toolUseId: a.toolUseId, role: a.role, fn: a.fn, pass: a.pass, line: a.line }))
  const loop = agents.filter((a) => LOOP_FUNCTIONS.has(a.fn))
  const trailerOf = (a) => sum(deliveries.filter((d) => d.agent === a), (d) => d.trailer)
  const over = loop.filter((a) => trailerOf(a) > (processed.get(a) ?? 0))
  notes.push(`sub-agent tokens reconciled: Σ notification subagent_tokens ${sum(loop, trailerOf)} against Σ processed ${sum(loop, (a) => processed.get(a) ?? 0)} over ${loop.length} loop agent(s); ${agentsWithoutTranscript.length} dispatched agent(s) with no transcript file${over.length > 0 ? `; notification tokens above processed for ${over.map((a) => `${a.role ?? 'unknown'} at line ${a.line}`).join(', ')}` : ''}`)
  return agentsWithoutTranscript
}

// ---------- the measurement: findings ----------

const slugOf = (reportPath) => {
  const m = String(reportPath ?? '').split('/').pop().match(REPORT_FILE)
  return m ? { pass: m[1], role: m[2], round: Number(m[3]) } : null
}

/**
 * Every verdict-role finding, annotated with its pass, branch flag, round and delivery line: every
 * verdict delivery read by all three readers (free text, a C2 block, a digest) in both shapes, the
 * C2 blocks of the verdict reports in the run-state copies, and the run-end ledger rows from a
 * verdict source. `readerSkips` counts what the readers could not read (build/109).
 */
function collectFindings(deliveries, stateNames, states, roots) {
  const all = []
  const readerSkips = {
    unreadFreeText: { 'severity-without-locator': 0, 'locator-without-severity': 0 }, digestErrors: 0, findingsBlockErrors: 0,
    ledgerParseErrors: sum(stateNames, (n) => states[n].ledgerParseErrors ?? 0),
  }
  deliveries.filter((d) => d.agent?.fn === 'verdict').forEach((d, k) => {
    const where = { pass: d.agent.pass, branch: d.agent.branch, round: d.agent.round, delivered: d.line }
    const meta = { role: d.agent.role, roots, source: 'return' }
    const digest = d.digest.status !== null && d.digest.report !== null
    const structured = digest || C2_FENCE.test(d.text)
    // build/183: a structured return is read by its own readers only, so a digest's entries are
    // never folded into one free-text block.
    if (!structured) for (const f of extractFreeText(d.text, meta)) all.push({ ...f, ...where, unit: `return:${k}:${f.text}` })
    // build/202: an inline block carries the digest's report path, the key its ledger rows cite.
    const block = parseFindingsBlock(d.text, { ...meta, reportPath: d.digest.report })
    readerSkips.findingsBlockErrors += block.errors.length
    for (const f of block.findings) all.push({ ...f, ...where, unit: null })
    for (const f of d.digest.findings) all.push({ ...f, ...where, unit: null })
    // A digest (its `status:` and `report:` pair) and a C2 block are no free text: counting their
    // locators as unread blocks would charge the changed shape for the baseline heuristic's skips.
    // A free-text return's `Findings:` heading is no digest, so it adds no digest error (build/166).
    if (digest) readerSkips.digestErrors += d.digest.errors.length
    if (!structured) for (const u of unreadFreeText(d.text, meta)) readerSkips.unreadFreeText[u.reason]++
  })

  // Reports by path, the end state last so the final copy of a report wins.
  const reports = new Map()
  for (const name of [...stateNames.filter((n) => n !== 'end'), ...stateNames.filter((n) => n === 'end')]) {
    for (const r of states[name].reports) reports.set(`.stamity/runs/${r.runId}/reports/${r.file}`, r)
  }
  for (const [reportPath, r] of reports) {
    const slug = slugOf(reportPath)
    if (!slug || roleFunction(slug.role) !== 'verdict') continue
    const parsed = parseFindingsBlock(r.text, { source: 'report', role: slug.role, roots, reportPath })
    readerSkips.findingsBlockErrors += parsed.errors.length
    for (const f of parsed.findings) all.push({ ...f, pass: slug.pass, branch: slug.pass === 'branch', round: slug.round, delivered: null, unit: null })
  }
  const endLedger = states.end?.present ? states.end.ledger : stateNames.flatMap((n) => states[n].ledger)
  for (const f of ledgerFindings(endLedger, { roots })) {
    if (roleFunction(f.role) !== 'verdict') continue
    const slug = slugOf(f.reportPath)
    all.push({ ...f, pass: slug?.pass ?? null, branch: slug?.pass === 'branch', round: slug?.round ?? null, delivered: null, unit: null })
  }
  return { all, readerSkips }
}

/**
 * The matcher over every finding: seeds at the seeds document's severities, seeds and decoys at
 * Critical and Warning for the flags; the unmatched count (build/91: a finding with no file is
 * not unmatched) and the adjudication list.
 */
/**
 * build/190: the matcher per pass — a finding attributed to a pass meets the items' spans as that
 * pass's snapshot copies locate them; only a finding with no pass (a ledger row with no report, a
 * multi-pass or branch finding naming none) meets the union over every pass. Indices stay `all`'s.
 */
function matchByPass(all, items, snapshots, opts) {
  const groups = new Map()
  all.forEach((f, i) => {
    const key = isPass(f.pass) ? f.pass : '*'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(i)
  })
  const matched = Object.fromEntries(items.map((item) => [item.id, []]))
  const adjudication = []
  for (const [key, idxs] of groups) {
    const spans = relocatedSpans(items, snapshots, key === '*' ? undefined : [key])
    const part = matchItems(idxs.map((i) => all[i]), items, spans, opts)
    for (const [id, hits] of Object.entries(part.matched)) matched[id].push(...hits.map((h) => idxs[h]))
    adjudication.push(...part.adjudication.map((a) => ({ id: a.id, findingIdx: idxs[a.findingIdx] })))
  }
  for (const id of Object.keys(matched)) matched[id].sort((a, b) => a - b)
  adjudication.sort((a, b) => a.findingIdx - b.findingIdx)
  return { matched, adjudication }
}

function scoreFindings(all, seeds, snapshots) {
  const items = [...seeds.seeds, ...seeds.decoys]
  const tolerance = seeds.matcher?.lineTolerance ?? 3
  const seedMatch = matchByPass(all, seeds.seeds, snapshots, { tolerance, severities: seeds.matcher?.severities ?? FLAG_SEVERITIES })
  const flagMatch = matchByPass(all, items, snapshots, { tolerance, severities: FLAG_SEVERITIES })
  const flagged = new Set(Object.values(flagMatch.matched).flat())

  // One per free-text block and one per location, so a finding repeated by a digest, a report and
  // a ledger row counts once.
  const units = new Map()
  all.forEach((f, i) => {
    if (!FLAG_SEVERITIES.includes(f.severity) || f.file == null || flagged.has(i)) return
    const key = f.unit ?? `loc:${locKey(f)}`
    if (!units.has(key)) units.set(key, [])
    units.get(key).push(f)
  })
  const counted = new Set()
  let unmatched = 0
  for (const group of units.values()) {
    const keys = group.map(locKey)
    if (keys.some((k) => counted.has(k))) continue
    unmatched++
    for (const k of keys) counted.add(k)
  }

  // One row per item and locator: a finding repeated by a digest, a report and a ledger row (each
  // spelling its text its own way) is one question for the adjudicator, listed at its first source
  // in reading order — a delivered return before a report before a ledger row. Reported, never scored.
  const adjudication = []
  const seen = new Set()
  for (const { id, findingIdx } of [...seedMatch.adjudication, ...flagMatch.adjudication]) {
    const f = all[findingIdx]
    const locator = `${f.file}:${f.line}${f.lineEnd !== f.line ? `-${f.lineEnd}` : ''}`
    const key = JSON.stringify([id, locator])
    if (seen.has(key)) continue
    seen.add(key)
    adjudication.push({ item: id, pass: f.branch ? 'branch' : f.pass, role: f.role, source: f.source, locator, excerpt: String(f.text).slice(0, 200) })
  }
  const decoysFlagged = seeds.decoys.filter((d) => flagMatch.matched[d.id].length > 0)
  return { seedMatch, decoysFlagged, unmatched, adjudication, tolerance }
}

/** Where a seed was first found: its own pass, another pass, the whole-branch review, or a source naming no pass (a ledger row with no report). */
const STAGE_ORDER = ['pass', 'other-pass', 'branch', 'unknown']
const stageOf = (f, seed) => (f.branch ? 'branch' : f.pass === seed.pass ? 'pass' : isPass(f.pass) ? 'other-pass' : 'unknown')

/**
 * One row per seed: presence at its pass from the snapshot copies, found, the earliest stage and
 * round-1 find, and the oracle status. A pass with no snapshot at all (no verdict agent ever
 * started it) leaves presence unknown and keeps the seed in the denominator rather than read it as
 * "caught by implementer", which would ease the recall row; `notes` names each such pass.
 */
function seedRowsOf(seeds, all, seedMatch, snapshots, oracleStatus, notes) {
  const missing = new Set()
  const absent = []
  const rows = seeds.seeds.map((seed) => {
    const copies = copiesOf(snapshots, seed.pass)
    if (copies.length === 0) missing.add(seed.pass)
    // build/167: a file absent from every copy says nothing of the rule, so presence is unknown.
    const held = new Set(copies.map((copy) => presentIn(copy, seed)))
    const present = held.has(true) ? true : held.has(false) ? false : null
    if (copies.length > 0 && present === null) absent.push(`${seed.id} (${seed.pass}, ${seed.file})`)
    const hits = seedMatch.matched[seed.id].map((i) => all[i])
    const stages = hits.map((f) => stageOf(f, seed)).toSorted((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b))
    return {
      id: seed.id, class: seed.class ?? null, pass: seed.pass, present, caughtByImplementer: present === false, found: hits.length > 0,
      foundRound1: hits.some((f) => !f.branch && f.pass === seed.pass && f.round === 1), stage: stages[0] ?? null, oracle: oracleStatus.get(seed.id) ?? null,
    }
  })
  for (const pass of missing) notes.push(`no snapshot under captures/snapshots/${pass}/: its seeds stay in the recall denominator with presence unknown`)
  for (const r of rows) {
    if (r.present === true && !r.found && r.oracle === 'pass') notes.push(`seed ${r.id} (${r.pass}): present in the snapshot and not found by a verdict role, while its oracle passes at run end — scored not found (build/197)`)
  }
  for (const seed of absent) notes.push(`seed ${seed}: the file is absent from every snapshot copy of the pass, so the seed stays in the recall denominator with presence unknown`)
  return rows
}

// ---------- the measurement: compaction samples and context ----------

/**
 * One sample per driver compaction (`manual`; `auto` too under the auto-window mechanism), `n` from
 * 1 in transcript order, read against `captures/state/compaction-<n>-pre/`. At risk: a verdict-role
 * Critical or Warning finding delivered before the boundary with no pre-compaction row; lost: no
 * row at run end either, and no seed it matches has a passing oracle. Valid iff at risk ≥ 1.
 */
function compactionSamplesOf({ walk, mechanism, states, deliveries, all, seedMatch, oracleStatus, roots, tolerance }) {
  const driverCompactions = walk.compactions.filter((c) => c.trigger === 'manual' || (mechanism === 'auto-window' && c.trigger === 'auto'))
  const endRows = ledgerFindings(states.end?.ledger ?? [], { roots })
  const seedsOfFinding = new Map()
  for (const [id, idxs] of Object.entries(seedMatch.matched)) for (const i of idxs) seedsOfFinding.set(i, [...(seedsOfFinding.get(i) ?? []), id])
  return driverCompactions.map((c, k) => {
    const n = k + 1
    const placement = deliveries.findLast((d) => d.line < c.line && d.agent?.fn === 'verdict')?.agent.pass ?? null
    const sample = { n, placement, trigger: c.trigger ?? null, preTokens: c.preTokens ?? null, postTokens: c.postTokens ?? null, atRisk: 0, lost: 0, valid: false }
    const pre = states[`compaction-${n}-pre`]
    if (!pre?.present) return Object.assign(sample, { reason: `no captures/state/compaction-${n}-pre/ copy` })
    const preRows = ledgerFindings(pre.ledger, { roots })
    const seen = new Set()
    all.forEach((f, i) => {
      if (f.delivered === null || f.delivered >= c.line || !FLAG_SEVERITIES.includes(f.severity)) return
      const key = locKey(f) ?? `${f.reportPath}#${f.localId ?? f.text}`
      if (seen.has(key) || hasRow(f, preRows, tolerance)) return
      seen.add(key)
      sample.atRisk++
      const fixed = (seedsOfFinding.get(i) ?? []).some((id) => oracleStatus.get(id) === 'pass')
      if (!hasRow(f, endRows, tolerance) && !fixed) sample.lost++
    })
    sample.valid = sample.atRisk >= 1
    return sample
  })
}

/** The orchestrator's context growth per pass: Σ over compaction segments of the last request's context minus the first's input, ÷ 6. */
function contextTokensPerPassOf(walk) {
  const segments = new Map()
  for (const r of walk.requests) {
    if (!segments.has(r.seg)) segments.set(r.seg, [])
    segments.get(r.seg).push(r)
  }
  let growth = 0
  for (const rs of segments.values()) {
    const [first, last] = [rs[0], rs.at(-1)]
    growth += Math.max(0, last.input + last.cc + last.cr + last.out - (first.input + first.cc + first.cr))
  }
  return growth / PASS_COUNT
}

// ---------- the measurement ----------

/**
 * Measure one replay run. `seeds` is the parsed `stamity/replay-seeds/v1` document; `forbid` the
 * absolute paths whose appearance in any tool input voids the run (each is matched in every
 * spelling, beside `seeds.json` and `__oracle__`). Returns the `stamity/replay-measurement/v1`
 * document; a run that breaks a validity rule is measured anyway and names each reason in `invalid`.
 */
export async function measureRun(runDir, { seeds, forbid = [] } = {}) {
  checkSeeds(seeds)
  const cap = await loadCapture(runDir, forbid)
  const { L, run, invalid, walk, roots, states, oracleStatus } = cap
  const { agents, byAgentId, sends, deliveries, notes } = joinAgents(walk, cap.index, cap.subs, roots)
  const { perPass, beside, unresolved } = loopCharacters(walk, cap.index, agents, sends, deliveries)
  const usage = subagentUsage(cap.subs, byAgentId, deliveries, invalid, notes)
  const agentsWithoutTranscript = reconcileAgents(agents, cap.subs, byAgentId, deliveries, notes)
  // build/196: a pass no loop agent was dispatched for still divides the figures by six.
  for (const id of PASS_IDS) {
    if (!agents.some((a) => LOOP_FUNCTIONS.has(a.fn) && !a.branch && a.pass === id)) notes.push(`pass ${id} has no loop dispatch: its loop characters and sub-agent tokens are 0 and still count in the ÷ 6`)
  }
  const { all, readerSkips } = collectFindings(deliveries, cap.stateNames, states, roots)
  const { seedMatch, decoysFlagged, unmatched, adjudication, tolerance } = scoreFindings(all, seeds, L.snapshots)
  const seedRows = seedRowsOf(seeds, all, seedMatch, L.snapshots, oracleStatus, notes)
  const mechanism = run?.mechanism ?? 'interrupt'
  const compactionSamples = compactionSamplesOf({ walk, mechanism, states, deliveries, all, seedMatch, oracleStatus, roots, tolerance })

  const loopChars = sum(Object.values(perPass), loopOf)
  const unattributedShare = loopChars === 0 ? 0 : loopOf(perPass.unattributed) / loopChars
  const breakdown = blankBreakdown()
  for (const row of Object.values(perPass)) for (const k of Object.keys(breakdown)) breakdown[k] += row[k]
  const inDenominator = seedRows.filter((s) => s.present !== false)
  const byClass = {}
  for (const s of inDenominator) {
    const row = (byClass[s.class ?? 'unclassed'] ??= { found: 0, denominator: 0 })
    row.denominator++
    if (s.found) row.found++
  }
  const reviewsOf = (pred) => deliveries.filter((d) => d.agent?.role === 'reviewer' && pred(d.agent))
  const passes = PASS_IDS.map((id) => {
    const reviews = reviewsOf((a) => !a.branch && a.pass === id)
    const finalClass = finalClassOf(reviews)
    const approved = finalClass === 'approve' || finalClass === 'approve-after-fixes'
    const ownSeeds = seedRows.filter((s) => s.pass === id)
    return {
      id, loopChars: loopOf(perPass[id]), breakdown: perPass[id], subagentTokens: usage.tokensByPass[id],
      // An oracle that errors, or has no result, counts as unfixed (§8).
      verdict: { finalClass, rounds: reviews.filter((d) => d.round).length, approvedWithSeedUnfixed: approved && ownSeeds.some((s) => s.oracle !== 'pass') },
      seeds: ownSeeds,
      decoysFlagged: decoysFlagged.filter((d) => d.pass === id).map((d) => d.id),
    }
  })
  const branchReviews = reviewsOf((a) => a.branch)
  const contextTokensPerPass = contextTokensPerPassOf(walk)
  const statuses = [...oracleStatus.values()]

  return {
    schema: MEASUREMENT_SCHEMA,
    runId: run?.runId ?? null,
    shape: run?.shape ?? null,
    kind: run?.kind ?? null,
    mechanism,
    invalid: [...new Set(invalid)],
    notes,
    passes,
    totals: {
      loopChars,
      loopCharsPerPass: loopChars / PASS_COUNT,
      breakdown,
      unattributedShare,
      perPassUnreliable: unattributedShare > UNATTRIBUTED_MAX,
      unresolvedDeliveriesAndSends: unresolved,
      ledgerBeside: beside,
      subagentTokens: usage.tokens,
      unjoinedSubagents: usage.unjoined,
      agentsWithoutTranscript,
      walkSkipped: walk.skipped,
      subagentTokensPerPass: usage.tokens / PASS_COUNT,
      subagentOutputTokens: usage.outputTokens,
      notificationTrailerTokens: usage.trailer,
      mainContextChars: sum(walk.events.filter((e) => e.cls !== 'excluded.apiError'), (e) => e.chars),
      contextTokensPerPass,
      compactionsAuto: walk.compactions.filter((c) => c.trigger === 'auto').length,
      projectedPer10: (10 * contextTokensPerPass) / COMPACTION_TOKENS,
      recall: { found: inDenominator.filter((s) => s.found).length, denominator: inDenominator.length, byClass },
      readerSkips,
      decoyFalseFlags: decoysFlagged.length,
      unmatched,
      oraclePass: statuses.filter((s) => s === 'pass').length,
      oracleError: statuses.filter((s) => s === 'error').length,
    },
    compactionSamples,
    wholeBranch: { finalClass: finalClassOf(branchReviews), rounds: branchReviews.filter((d) => d.round).length },
    adjudication,
    models: { pin: ORCHESTRATOR_MODEL, init: cap.init?.model ?? null, orchestrator: cap.orchestratorModels, subagents: usage.models },
  }
}

// ---------- CLI ----------

export const USAGE = 'Usage: node scripts/replay/measure.mjs --run-dir <dir> --seeds <seeds.json> --out <measurement.json> [--forbid <absPath>]…'

function parseArgs(argv) {
  const options = { forbid: [] }
  const valued = { '--run-dir': 'runDir', '--seeds': 'seeds', '--out': 'out' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (!(arg in valued) && arg !== '--forbid') throw new Error(`Unknown option ${arg}.\n${USAGE}`)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value.\n${USAGE}`)
    if (arg === '--forbid') options.forbid.push(value)
    else options[valued[arg]] = value
    i += 1
  }
  return options
}

async function main(argv) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write(`${USAGE}\n`)
    return
  }
  for (const key of ['runDir', 'seeds', 'out']) if (!options[key]) throw new Error(`--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required.\n${USAGE}`)
  const seeds = JSON.parse(readFileSync(options.seeds, 'utf8'))
  const m = await measureRun(resolve(options.runDir), { seeds, forbid: options.forbid })
  writeFileSync(options.out, `${JSON.stringify(m, null, 2)}\n`)
  const r = m.totals.recall
  process.stdout.write(`[replay] measured ${m.runId ?? 'run'}: loop chars/pass ${Math.round(m.totals.loopCharsPerPass)}, recall ${r.found}/${r.denominator}, ${m.invalid.length === 0 ? 'valid' : `INVALID (${m.invalid.length})`}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SELF) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`[replay] the run could not be measured: ${error.message}\n`)
    process.exitCode = 1
  })
}
