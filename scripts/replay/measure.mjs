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
import { extractFreeText, ledgerFindings, matchItems, parseDigest, parseFindingsBlock, secondaryLocators, unreadFreeText, verdictOf } from './findings.mjs'
import { PASS_IDS } from './fixture.mjs'
import { UNCOVERED_REASON } from './protocols.mjs'
import { LEDGER_GATED_KINDS, ledgerSourceRole, roleFunction, scanSubagent, walkTranscriptLines } from './transcript.mjs'

const SELF = fileURLToPath(import.meta.url)

export const MEASUREMENT_SCHEMA = 'stamity/replay-measurement/v1'
const SEEDS_SCHEMA = 'stamity/replay-seeds/v1'

/** REPLAY-v1 §3: the orchestrator's model pin. */
const ORCHESTRATOR_MODEL = 'claude-opus-5-5'
/** §3: the client version the init event's `claude_code_version` (build/250) and run.json's `client.version` (build/282) must read. */
const CLIENT_VERSION = '2.1.280'
/**
 * §3's five ambient lists, as the measurement names them and as the init event keys them. A run
 * whose lists differ from its shape's pilot is invalid; `compare.mjs` holds each run to its pilot.
 */
export const AMBIENT_LISTS = { skills: 'skills', agents: 'agents', slashCommands: 'slash_commands', plugins: 'plugins', mcpServers: 'mcp_servers' }
/** §8: every per-pass figure divides the run's total by the six passes. */
const PASS_COUNT = 6
/** §8: projected compactions per 10 passes = 10 × context tokens per pass ÷ this. */
const COMPACTION_TOKENS = 947_000
/** §8: the per-pass split is flagged unreliable above this unattributed share (RESULTS words its note from it). */
export const UNATTRIBUTED_MAX = 0.2
/**
 * §8: substrings whose appearance in any tool input voids the run, beside the `--forbid` paths —
 * §8's two and §5's reference fixes, the answer key `fixture.mjs` also keeps out of the fixture (build/254).
 */
const ALWAYS_FORBIDDEN = ['seeds.json', '__oracle__', 'reference-fixes']
/** REPLAY-v3 §8 (plan 012): the seeded patches' folder joins the forbidden terms, under v3 only. */
const FORBIDDEN_V3 = [...ALWAYS_FORBIDDEN, 'patches-seeded']
/**
 * REPLAY-v3 C6 (plan 012): the harness's own strings, whose appearance in any main or sub-agent transcript
 * line voids the run, beside the `--forbid` paths (the instrument checkout and the private layer's).
 */
const HARNESS_STRINGS = ['REPLAY_', 'marker-hook', 'seeds.json', 'stamity-replay', 'replay@invalid', 'evals/replay']
/** REPLAY-v3 C5: the client's change notice (`edited_text_file`) for a pass's patch, which only the swap rewrites. */
const PATCH_NOTICE = /(?:^|\/)(vendor\/contrib\/u[1-3]-p[12]\.patch)$/

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
    // REPLAY-v2 R4: each pass's tree as the first review round covering it completed.
    reviewSnapshots: join(captures, 'review-snapshots'),
    // REPLAY-v3 (plan 012, S3): each build agent's end-of-build copy with its index, and the hook's swap records.
    buildEnd: join(captures, 'build-end'),
    swaps: join(captures, 'swaps'),
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

/**
 * S1 (REPLAY-v2): an item's optional `injection` — `{ file, find, replace }`, the text the driver's
 * hook turns the clean tree's `find` into at the first review dispatch covering the item's pass.
 * It edits the item's own file only (an injection never spans two files), and `find` and `replace`
 * are non-empty strings that differ. v1's items carry none.
 */
function checkInjection(item, where) {
  if (item.injection === undefined) return
  const inj = item.injection
  if (inj === null || typeof inj !== 'object' || Array.isArray(inj)) throw new Error(`${where} injection is not an object`)
  for (const key of ['file', 'find', 'replace']) {
    if (typeof inj[key] !== 'string') throw new Error(`${where} injection.${key} is not a string`)
    if (inj[key] === '') throw new Error(`${where} injection.${key} is empty`)
  }
  if (inj.file !== item.file) throw new Error(`${where} injection.file ${JSON.stringify(inj.file)} is not the item's file ${JSON.stringify(item.file)}: an injection edits one file`)
  if (inj.find === inj.replace) throw new Error(`${where} injection.find equals injection.replace, so the injection changes nothing`)
}

/** A `present.notMatch` source compiled, or a refusal naming the item and the source. */
function compileNotMatch(source, where) {
  try {
    return new RegExp(source)
  } catch (error) {
    throw new Error(`${where} present.notMatch ${JSON.stringify(source)} is no regex: ${error.message}`, { cause: error })
  }
}

/**
 * S1 (REPLAY-v2, build/365): an item's optional `present.notMatch`, regex sources beside
 * `present.contains`, each non-empty and compiling. v1's items carry none.
 */
function checkNotMatch(item, where) {
  const list = item.present?.notMatch
  if (list === undefined) return
  if (!Array.isArray(list) || !list.every((s) => typeof s === 'string' && s !== '')) throw new Error(`${where} present.notMatch is not a list of non-empty strings`)
  for (const source of list) compileNotMatch(source, where)
}

const SHA256_HEX = /^[0-9a-f]{64}$/

/**
 * S1 (REPLAY-v3, plan 012): the document's optional `arrival: "patch"` and `patches`, which come
 * together; `patches` maps a pass id to `{ clean, seeded }`, the sha256 of its clean and seeded patch.
 */
function checkArrival(seeds) {
  if (seeds.arrival === undefined && seeds.patches === undefined) return
  if (seeds.arrival === undefined || seeds.patches === undefined) throw new Error('seeds: arrival and patches come together (REPLAY-v3)')
  if (seeds.arrival !== 'patch') throw new Error(`seeds: arrival ${JSON.stringify(seeds.arrival)} is not "patch"`)
  if (seeds.patches === null || typeof seeds.patches !== 'object' || Array.isArray(seeds.patches)) throw new Error('seeds: patches is not an object')
  const digest = (v) => typeof v === 'string' && SHA256_HEX.test(v)
  for (const [pass, d] of Object.entries(seeds.patches)) {
    if (!PASS_IDS.includes(pass)) throw new Error(`seeds: patches.${pass} names no pass of ${PASS_IDS.join(', ')}`)
    if (!digest(d?.clean) || !digest(d?.seeded)) throw new Error(`seeds: patches.${pass} is not { clean, seeded } sha256 digests`)
  }
}

/**
 * The seeds document's schema check (`stamity/replay-seeds/v1`): each item's id, pass, file, span
 * and terms, the two optional v2 fields (S1), `injection` and `present.notMatch`, and v3's `arrival`
 * with `patches`. A v1 document, which has none of them, reads exactly as before. Throws on the first
 * refusal, naming the item.
 */
export function checkSeeds(seeds) {
  if (!seeds || typeof seeds !== 'object' || seeds.schema !== SEEDS_SCHEMA) throw new Error(`seeds: the document is not ${SEEDS_SCHEMA}`)
  checkArrival(seeds)
  for (const list of ['seeds', 'decoys']) {
    if (!Array.isArray(seeds[list])) throw new Error(`seeds: "${list}" is not a list`)
    for (const item of seeds[list]) {
      const where = `seeds: ${list} item ${JSON.stringify(item?.id ?? null)}`
      if (typeof item?.id !== 'string' || !item.id) throw new Error(`${where} has no id`)
      if (!PASS_IDS.includes(item.pass)) throw new Error(`${where} names no pass of ${PASS_IDS.join(', ')}`)
      if (typeof item.file !== 'string' || !item.file) throw new Error(`${where} names no file`)
      if (!Array.isArray(item.span) || item.span.length !== 2 || !item.span.every(Number.isInteger)) throw new Error(`${where} has no [start, end] span`)
      if (!Array.isArray(item.terms) || item.terms.length === 0) throw new Error(`${where} has no terms`)
      checkInjection(item, where)
      checkNotMatch(item, where)
    }
  }
}

const copiesOf = (snapshots, pass) => entriesOf(join(snapshots, pass)).filter((e) => e.isDirectory()).map((e) => join(snapshots, pass, e.name))
const fileIn = (copy, file) => readTextIfPresent(join(copy, ...file.split('/')))
const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])

/**
 * Whether an item's `present` rule holds in one tree (a snapshot copy, or any checkout); `null`
 * when the tree lacks the file. Present iff every `contains` string occurs, no `notContains` string
 * does, and no `notMatch` pattern matches (S1, build/365: the fixed code that keeps the seeded text
 * beside a guard reads absent).
 */
export function presentIn(copy, item) {
  const text = fileIn(copy, item.file)
  if (text === null) return null
  const rule = item.present ?? {}
  return asList(rule.contains).every((s) => text.includes(s))
    && asList(rule.notContains).every((s) => !text.includes(s))
    && asList(rule.notMatch).every((source) => !new RegExp(source).test(text))
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

/**
 * R3 (review/150): the whole text between two consecutive pass ids that makes them a named range, as in
 * `u1-p1..u3-p2`: two or three dots, an ellipsis, an en dash or an em dash, with optional spaces or tabs
 * around it, or the word `to` or `through` between spaces. An ASCII hyphen is none, since it is the
 * hyphen inside an id, a report slug's joint (`u1-p1-u1-p2`) and a list bullet; and the gap is the
 * whole text between the ids, so a range never spans a line break or another word.
 */
const RANGE_GAP = /^(?:[ \t]*(?:\.{2,3}|\u2026|\u2013|\u2014)[ \t]*|[ \t]+(?:to|through)[ \t]+)$/i

/**
 * The distinct pass ids a text names, in pass order. With `ranges` (R3, review/150), two consecutive
 * ids joined by a range gap also name every pass between them, in the protocol's pass order; a range
 * named backwards (`u3-p2..u1-p1`) covers the same passes, because coverage is a set and refusing it
 * would leave only its two ends, the under-coverage review/150 records.
 */
const passIdsIn = (text, ranges = false) => {
  const s = String(text ?? '')
  const ids = new Set()
  let prev = null
  for (const m of s.matchAll(PASS_IDS_G)) {
    ids.add(m[0])
    if (ranges && prev && RANGE_GAP.test(s.slice(prev.index + prev[0].length, m.index))) {
      const [a, b] = [PASS_IDS.indexOf(prev[0]), PASS_IDS.indexOf(m[0])]
      for (const id of PASS_IDS.slice(Math.min(a, b), Math.max(a, b) + 1)) ids.add(id)
    }
    prev = m
  }
  return PASS_IDS.filter((id) => ids.has(id))
}

/**
 * build/366: the passes a dispatch covers. When its description names a pass, that is
 * `[attributePass(...)]`, the one pass the pinned attribution rule takes (first-wins), so `pass` and
 * `passes` never disagree (review/38, signed off 2026-09-26); otherwise the distinct ids its prompt
 * names, in pass order — a `multi` dispatch every pass it names, one naming none `[]`. One rule for
 * the loop measures, the verdict mapping, the fixer join and the capture-defect check.
 *
 * R3 (review/150, REPLAY-v2 §8): a range the prompt names (`u1-p1..u3-p2`) covers every pass in it.
 * `ranges` is on by default, which is REPLAY-v2's rule and the one the driver's v2 hook reads; v1's
 * measurement passes `{ ranges: false }`, since REPLAY-v1 is frozen and its pilots name ranges.
 */
export function passesOf(desc, prompt, { ranges = true } = {}) {
  return PASS_ID.test(String(desc ?? '')) ? [attributePass(desc, prompt)] : passIdsIn(prompt, ranges)
}

/**
 * S2, R6 (review/167, REPLAY-v2 only): "all built, then all seeded". The private driver imports this
 * from `--repo` at run time and calls it on its marker log's prefix; the measurement calls it on the
 * whole run. Pure and causal: a dispatch's row depends only on the events before it.
 *
 * `events` is the run's time-ordered list of
 *   `{ kind: 'dispatch', id, role, description, prompt }` — one Agent dispatch; `id` is any key the
 *     caller keeps unique per dispatch, `role` is `roleFunction`'s value (`build`, `fix`, `verdict`,
 *     `gate` or `other`), `description` and `prompt` the Agent input's strings; and
 *   `{ kind: 'stop', id, returned }` — that dispatch's agent ended: `returned` is true when it
 *     delivered by itself, false for a TaskStop.
 * A SendMessage re-review is no dispatch: it keeps the resumed agent's row. Any other event is skipped.
 *
 * Returns a Map of dispatch id to `{ built, passes, injectionPoint }`, pass ids in pass order:
 *   `built` — the passes a build-role description names (every id, a range included); never the prompt;
 *   `injectionPoint` — true for exactly the first verdict-role dispatch after every pass of
 *     `planPasses` is built (its hook injects every pass in one call);
 *   `passes` — its coverage: a verdict before the injection point none, at or after it the passes its
 *     description names, else every plan pass; a fixer the passes its description names, else every
 *     pass covered by the verdict agents that returned before it was dispatched; a build the passes its
 *     description names; any other role none.
 *
 * `rule: 'v3'` (REPLAY-v3, plan 012, S4): a pass is swapped at the first build dispatch whose description
 * names it (`built` names every pass a build describes, so the driver's hook records a repeat) and built at
 * the stop of that swapping agent, returned or ended by TaskStop; a repeat dispatch naming it neither swaps
 * nor builds it. A verdict covers the passes its description names that
 * are built, else every plan pass that is built, so one before any pass is built covers nothing. Fixers
 * and builds read as under v2, and `injectionPoint` is always false. The v2 result is unchanged.
 */
export function coverageOf(events, planPasses = PASS_IDS, { rule = 'v2' } = {}) {
  const v3 = rule === 'v3'
  const plan = PASS_IDS.filter((p) => planPasses.includes(p))
  const rows = new Map()
  const verdicts = new Set()
  const builders = new Map()
  const swappedBy = new Set()
  const built = new Set()
  const reviewed = new Set()
  let reached = false
  for (const e of events ?? []) {
    if (e?.kind === 'stop') {
      if (e.returned === true && verdicts.has(e.id)) for (const p of rows.get(e.id).passes) reviewed.add(p)
      for (const p of builders.get(e.id) ?? []) built.add(p)
      continue
    }
    if (e?.kind !== 'dispatch') continue
    const named = passIdsIn(e.description, true)
    const row = { built: [], passes: [], injectionPoint: false }
    if (e.role === 'build') {
      if (v3) {
        builders.set(e.id, named.filter((p) => !swappedBy.has(p)))
        for (const p of named) swappedBy.add(p)
      } else for (const p of named) built.add(p)
      Object.assign(row, { built: named, passes: [...named] })
    } else if (e.role === 'verdict') {
      verdicts.add(e.id)
      if (v3) row.passes = (named.length > 0 ? named : plan).filter((p) => built.has(p))
      else {
        if (!reached && plan.every((p) => built.has(p))) {
          reached = true
          row.injectionPoint = true
        }
        if (reached) row.passes = named.length > 0 ? named : [...plan]
      }
    } else if (e.role === 'fix') row.passes = named.length > 0 ? named : PASS_IDS.filter((p) => reviewed.has(p))
    rows.set(e.id, row)
  }
  return rows
}

const isPass = (p) => PASS_IDS.includes(p)
const passKey = (p) => (isPass(p) ? p : 'unattributed')
/**
 * build/366: whether an agent or a finding covers `pass`, one of its `passes`. Under v1 `passes` always
 * holds the attributed pass when that is a pass id (`passesOf`, a report slug), so this is v1's reading
 * unchanged; under v2 it is R6's coverage, which an incidental id in a prompt no longer widens.
 */
const covers = (x, pass) => Array.isArray(x.passes) && x.passes.includes(pass)
/**
 * build/366: whether two agents share a pass, for the fixer round count: any common pass. v1 keeps its
 * fallback to the attributed pass when either names none (two agents naming no pass share); R6 drops it
 * under v2, so a fixer covering nothing raises no round.
 */
const sharePass = (x, y, byCoverage) => (x.passes.length > 0 && y.passes.length > 0 ? x.passes.some((p) => y.passes.includes(p)) : !byCoverage && x.pass === y.pass)

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

function cwdsIn(lines) {
  const out = new Set()
  for (const text of lines) {
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

/** An ambient entry by its name: a plugin or an MCP server is an object whose path must not reach a summary. */
const ambientName = (entry) => (typeof entry === 'string' ? entry : typeof entry?.name === 'string' ? entry.name : JSON.stringify(entry))

/**
 * The init event's five ambient lists (§3), each entry by its name, deduplicated and sorted; a list
 * the event does not carry is null. Null with no init event.
 */
function ambientOf(init) {
  if (init === null) return null
  return Object.fromEntries(Object.entries(AMBIENT_LISTS).map(([key, field]) => [key, Array.isArray(init[field]) ? [...new Set(init[field].map(ambientName))].toSorted() : null]))
}

// ---------- findings ----------

/** A delivery's verdict: `blocked` on a `BLOCKED_*` return, else the digest's label, else the free-text word (v3: prove/8's grammar). */
function verdictOfDelivery(text, digest, version) {
  if (BLOCKED.test(text)) return 'blocked'
  return digest.verdict ?? verdictOf(text, { version })
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

/**
 * The fixture run folders of one state copy (`compaction-<n>-pre` or `end`): ledger rows and report files.
 * REPLAY-v3 (plan 012, L): a ledger kept beside its run folder, `runs/<run-id>.ledger.jsonl`, is read too.
 */
function readState(stateDir, version) {
  const runsDir = join(stateDir, 'runs')
  const ledger = []
  const reports = []
  let ledgerParseErrors = 0
  if (version === 'v3') for (const flat of entriesOf(runsDir).filter((e) => e.isFile() && /^.+\.ledger\.jsonl$/.test(e.name))) {
    const { rows, errors } = jsonlCounted(readTextIfPresent(join(runsDir, flat.name)))
    ledger.push(...rows)
    ledgerParseErrors += errors
  }
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
 * REPLAY-v3 C5 and C6 over one transcript's lines: the first change notice for a pass's patch (by its
 * filename only) and the first line holding a harness string, each with its 1-based line; null when none.
 */
function contaminationIn(lines, harness) {
  let c5 = null
  let c6 = null
  lines.forEach((text, k) => {
    const hit = c6 === null ? harness.find(([needle]) => text.includes(needle)) : undefined
    if (hit) c6 = { line: k + 1, label: hit[1] }
    if (c5 !== null || !text.includes('edited_text_file')) return
    const a = parseJson(text)?.attachment
    const m = a?.type === 'edited_text_file' && typeof a.filename === 'string' ? a.filename.replaceAll('\\', '/').match(PATCH_NOTICE) : null
    if (m) c5 = { line: k + 1, patch: m[1] }
  })
  return { c5, c6 }
}

/**
 * The capture read once: `run.json`, the main transcript (walked, and indexed for what the walk's
 * rows do not carry), every sub-agent scan, the init event, and every spelling of every root the
 * transcripts name. Validity reasons found on the way go to `invalid`; under v3 (plan 012) they
 * include contamination, C5 and C6, read over every main and sub-agent line.
 */
async function loadCapture(runDir, forbid, version) {
  const L = layoutOf(runDir)
  const invalid = []
  const run = readJsonIfPresent(L.runJson)
  if (run === null) invalid.push('run.json is missing')
  const endReason = run?.end?.reason ?? null
  if (endReason !== 'complete') invalid.push(`run.json end.reason is ${endReason === null ? 'absent' : JSON.stringify(endReason)}, not "complete"`)

  // Forbidden inputs, each spelling labelled so no absolute path reaches the document.
  const terms = version === 'v3' ? FORBIDDEN_V3 : ALWAYS_FORBIDDEN
  const forbidLabels = new Map(terms.map((s) => [s, s]))
  forbid.forEach((path, k) => {
    for (const spelling of rootSpellings([path])) forbidLabels.set(spelling, `--forbid[${k}]`)
  })
  const forbidList = [...forbidLabels.keys()]

  const sessions = entriesOf(L.transcriptDir).filter((e) => e.isFile() && e.name.endsWith('.jsonl')).map((e) => e.name)
  if (sessions.length === 0) throw new Error('expected one main transcript under captures/transcript/, found 0')
  // build/255: a restart or a stray file leaves several; the newest session is measured and the run is invalid.
  const newest = sessions.map((name) => ({ name, mtime: statSync(join(L.transcriptDir, name)).mtimeMs })).toSorted((a, b) => b.mtime - a.mtime || (a.name < b.name ? 1 : -1))[0].name
  const session = newest.slice(0, -'.jsonl'.length)
  if (sessions.length > 1) invalid.push(`${sessions.length} main transcripts under captures/transcript/ (a restart or a stray file): measured on the newest, ${session}`)
  const lines = await readLines(join(L.transcriptDir, newest))
  const walk = walkTranscriptLines(lines, { forbid: forbidList, version })
  const index = indexTranscript(lines)
  const subDir = join(L.transcriptDir, session, 'subagents')
  const subFiles = entriesOf(subDir).filter((e) => e.isFile() && /^agent-.+\.jsonl$/.test(e.name)).map((e) => e.name)
  const harness = [...HARNESS_STRINGS.map((s) => [s, s]), ...[...forbidLabels].filter(([s]) => !terms.includes(s))]
  const subs = await Promise.all(subFiles.map(async (name) => {
    const agentId = name.slice('agent-'.length, -'.jsonl'.length)
    const [scan, subLines] = await Promise.all([
      scanSubagent(join(subDir, name), join(subDir, `agent-${agentId}.meta.json`), { forbid: forbidList }),
      readLines(join(subDir, name)),
    ])
    return Object.assign(scan, { agentId, cwds: cwdsIn(subLines), contamination: version === 'v3' ? contaminationIn(subLines, harness) : null })
  }))
  if (version === 'v3') {
    const found = [{ where: 'main transcript', ...contaminationIn(lines, harness) }, ...subs.map((s) => ({ where: `sub-agent ${s.agentId}`, ...s.contamination }))]
    const c5 = found.find((f) => f.c5 !== null)
    const c6 = found.find((f) => f.c6 !== null)
    if (c5) invalid.push(`contamination (C5): a change notice for ${c5.c5.patch} (${c5.where} line ${c5.c5.line})`)
    if (c6) invalid.push(`contamination (C6): a harness string (${c6.c6.label}) in ${c6.where} line ${c6.c6.line}`)
  }
  const init = await initEvent(L.stdout)

  const orchestratorModels = {}
  for (const r of walk.requests) if (r.model && r.model !== '<synthetic>') orchestratorModels[r.model] = (orchestratorModels[r.model] ?? 0) + 1
  if (init === null) invalid.push('no init event in captures/stdout.jsonl, so the orchestrator model pin cannot be checked')
  else if (init.model !== ORCHESTRATOR_MODEL) invalid.push(`init model ${JSON.stringify(init.model ?? null)} is not the pin ${ORCHESTRATOR_MODEL}`)
  if (init !== null && init.claude_code_version !== CLIENT_VERSION) invalid.push(`init claude_code_version ${JSON.stringify(init.claude_code_version ?? null)} is not the pin ${CLIENT_VERSION}`)
  // build/282: §3 holds `claude --version` too, which the driver records as run.json client.version.
  if (run !== null && run.client?.version !== CLIENT_VERSION) invalid.push(`run.json client.version ${JSON.stringify(run.client?.version ?? null)} is not the pin ${CLIENT_VERSION}`)
  for (const model of Object.keys(orchestratorModels)) if (model !== ORCHESTRATOR_MODEL) invalid.push(`orchestrator request answered on ${model}, not the pin ${ORCHESTRATOR_MODEL}`)
  for (const hit of walk.forbidHits) invalid.push(`forbidden ${forbidLabels.get(hit.forbid)} in a ${hit.tool} input (main transcript line ${hit.line})`)
  for (const s of subs) for (const hit of s.forbidHits) invalid.push(`forbidden ${forbidLabels.get(hit.forbid)} in a ${hit.tool} input (sub-agent ${s.agentId} line ${hit.line})`)

  const stateNames = entriesOf(L.state).filter((e) => e.isDirectory()).map((e) => e.name)
  const states = Object.fromEntries(stateNames.map((name) => [name, readState(join(L.state, name), version)]))
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
  const oracleRun = oracleRunOf(oracle)
  // build/252: an oracle harness that did not run reads every behaviour seed as unfixed, so the run is re-run, never scored.
  if (oracleRun.status !== 'ok') invalid.push(`oracle run status ${JSON.stringify(oracleRun.status)}${oracleRun.detail !== '' ? ` (${oracleRun.detail})` : ''}, not "ok": the run is re-run, never scored`)
  return { L, run, invalid, walk, index, subs, init, roots, orchestratorModels, stateNames, states, oracleStatus, oracleRun }
}

/**
 * The oracle run's own `run.{status, detail}` (`stamity/replay-oracle/v1`), so a harness that never
 * ran reads as that, not as one error per seed. A null status names why none was recorded.
 */
function oracleRunOf(oracle) {
  if (oracle === null) return { status: null, detail: 'no captures/oracle.json' }
  const run = oracle?.run
  if (run === null || typeof run !== 'object' || typeof run.status !== 'string') return { status: null, detail: 'the oracle document records no run-level status' }
  return { status: run.status, detail: typeof run.detail === 'string' ? run.detail : '' }
}

// ---------- the measurement: agents ----------

/**
 * The orchestrator's agents, joined across the walk: each Agent dispatch with its role function
 * and pass, the SendMessages that reach it, and every delivery — a notification, or a synchronous
 * Agent, SendMessage or TaskOutput result — with its digest and verdict read once. Under v2 and v3
 * (`version`, `measureRun`'s switch) each agent's `passes` come from `coverageOf` by that version's rule
 * and branch level is read by R8; `injectionLine` is the dispatch line of R6's injection point (null
 * under v1 and v3, or never reached).
 */
function joinAgents(walk, index, subs, roots, version) {
  const agents = []
  const byUse = new Map()
  for (const d of walk.dispatches.filter((x) => x.kind === 'agent')) {
    const input = index.uses.get(d.toolUseId)?.input ?? {}
    const prompt = typeof input.prompt === 'string' ? input.prompt : ''
    const agent = {
      toolUseId: d.toolUseId, line: d.line, role: roleName(d.role), fn: roleFunction(d.role), desc: d.desc ?? '', prompt, chars: d.chars,
      model: d.model ?? null, name: typeof input.name === 'string' && input.name ? input.name : null, pass: attributePass(d.desc, prompt),
      // v1's reading (REPLAY-v1 §14 reads no range); v2 replaces it with coverageOf once the deliveries are read.
      passes: passesOf(d.desc, prompt, { ranges: false }), branch: false, round: 1, resume: RESUME.test(prompt),
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
        model: null, name: null, pass: attributePass(s.description, s.firstPrompt), passes: passesOf(s.description, s.firstPrompt, { ranges: false }),
        branch: false, round: 1, resume: RESUME.test(prompt), fromFile: true, agentId: s.agentId,
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
    d.digest = parseDigest(d.text, { source: 'digest', role: d.agent?.role ?? null, roots, version })
    d.verdict = verdictOfDelivery(d.text, d.digest, version)
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

  // R6 (review/167, v2): every agent's coverage by coverageOf, over its dispatches and the returns
  // (a TaskStop's failed notification reads not returned) in transcript order; an agent built from its
  // sub-agent file is placed at the line of the delivery that named it, and credits nothing (review/15, `credits`).
  let injectionLine = null
  if (version !== 'v1') {
    const ids = new Map(agents.map((a, k) => [a, k]))
    const timeline = [
      ...agents.map((a) => ({ line: a.line, rank: 0, event: { kind: 'dispatch', id: ids.get(a), role: a.fn, description: a.desc, prompt: a.prompt } })),
      ...deliveries.filter((d) => d.agent !== null && !d.reread).map((d) => ({ line: d.line, rank: 1, event: { kind: 'stop', id: ids.get(d.agent), returned: !d.failed } })),
    ].toSorted((x, y) => x.line - y.line || x.rank - y.rank)
    const coverage = coverageOf(timeline.map((t) => t.event), PASS_IDS, { rule: version })
    for (const a of agents) {
      const row = coverage.get(ids.get(a))
      a.passes = row.passes
      if (row.injectionPoint) injectionLine = a.line
    }
    // R8 (v2): a verdict dispatch whose description names the whole branch after an approving reviewer
    // delivery is branch-level, and so is every verdict agent dispatched after it. One named so before any
    // approval is a loop round (the residual REPLAY-v2 §15 names). review/30: the prompt is never read here,
    // since a re-review's brief may mention the whole-branch review that follows it, and that re-review is a
    // loop round. review/13: only a reviewer dispatched at or after the injection point approves here; a plan
    // or cell review before it covers nothing. review/20: a reviewer built from its sub-agent file has no known
    // dispatch line, so its approval counts for nothing.
    // REPLAY-v3 (plan 012) has no injection point: a reviewer whose coverage holds a built pass approves here.
    const point = injectionLine ?? Infinity
    const reviewedBuilt = (a) => (version === 'v3' ? a.passes.length > 0 : a.line >= point)
    const approvals = deliveries.filter((d) => d.round && d.agent?.role === 'reviewer' && d.verdict === 'approve' && reviewedBuilt(d.agent) && !d.agent.fromFile).map((d) => d.line)
    const namedAfterApproval = (a) => WHOLE_BRANCH.test(a.desc) && approvals.some((line) => line < a.line)
    // review/21: an agent built from its sub-agent file has no known dispatch time, so no position makes it
    // branch-level, and its characters stay in the loop figure.
    const verdictAgents = agents.filter((x) => x.fn === 'verdict' && !x.fromFile)
    if (version === 'v3') {
      // prove/7 (REPLAY-v3): a dispatch named for the whole branch after such an approval is branch-level, and so is a
      // verdict dispatch made while one of those runs (after its dispatch, before its first stop that is no re-read).
      // Every other verdict dispatch is a loop round, so a re-review after the whole-branch review stays in the loop.
      const named = verdictAgents.filter(namedAfterApproval)
      const stopOf = (a) => deliveries.find((d) => d.agent === a && !d.reread)?.line ?? Infinity
      for (const a of verdictAgents) a.branch = named.includes(a) || named.some((n) => a.line > n.line && a.line < stopOf(n))
    } else {
      let from = Infinity
      for (const a of verdictAgents.toSorted((x, y) => x.line - y.line)) {
        if (a.line <= from && !namedAfterApproval(a)) continue
        a.branch = true
        from = Math.min(from, a.line)
      }
    }
  } else {
    // v1: branch-level verdict dispatches: after u3-p2's last reviewer approval with no single pass id,
    // or named a whole-branch pass. The prompt is read for the name only when the dispatch carries
    // no single pass id, so a per-pass brief that mentions the whole-branch review stays per pass.
    const lastApproval = deliveries.findLast((d) => d.agent?.role === 'reviewer' && d.agent.pass === 'u3-p2' && d.verdict === 'approve')?.line ?? Infinity
    for (const a of agents) {
      if (a.fn === 'verdict') a.branch = WHOLE_BRANCH.test(a.desc) || (!isPass(a.pass) && (a.line > lastApproval || WHOLE_BRANCH.test(a.prompt)))
    }
  }
  // A verdict agent's round: one more than the fixers of its pass dispatched before it (build/366:
  // of any pass it covers, so a u1-p1 fixer counts toward a round covering u1-p1 and u1-p2).
  const fixers = agents.filter((a) => a.fn === 'fix')
  // Sweep (review/21, v2): a fixer built from its sub-agent file counts as dispatched before every agent sharing its
  // passes, so its unknown dispatch time can only raise a round, never leave a later find in round 1.
  const byCoverage = version !== 'v1'
  for (const a of agents) a.round = 1 + fixers.filter((f) => sharePass(f, a, byCoverage) && ((byCoverage && f.fromFile) || f.line < a.line)).length
  return { agents, byAgentId, sends, deliveries, notes, injectionLine }
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

/** A report path from `.stamity/runs/` on, the one spelling a digest's `report:`, a ledger row and a state copy share. */
const reportKey = (path) => {
  const s = String(path ?? '').replaceAll('\\', '/')
  const at = s.lastIndexOf('.stamity/runs/')
  return at >= 0 ? s.slice(at) : s
}

/**
 * REPLAY-v3 (plan 012, J): the report key. A path from `.stamity/runs/` on keys as `reportKey` keys it; a path
 * relative to its run folder (`reports/<f>` or `./reports/<f>`, one path token ending `.md`) keys as the one state
 * report of that file name, and joins nothing (null) when no run folder, or several, holds it. Any other value keys
 * as `reportKey` keys it, and so joins no state report. The digest-to-report join, the term window, the credit
 * guard and §8's report-path coverage all read this key under v3.
 */
function reportKeyerOf(stateNames, states) {
  const runsOf = new Map()
  for (const n of stateNames) for (const r of states[n].reports) runsOf.set(r.file, new Set([...(runsOf.get(r.file) ?? []), r.runId]))
  return (path) => {
    if (path === null || path === undefined) return null
    const key = reportKey(path)
    if (key.startsWith('.stamity/runs/')) return key
    const m = key.trim().match(/^(?:\.\/)?reports\/([^/\s]+\.md)$/)
    if (!m) return key
    const runs = runsOf.get(m[1])
    return runs?.size === 1 ? `.stamity/runs/${[...runs][0]}/reports/${m[1]}` : null
  }
}

/**
 * REPLAY-v3 (prove/6, prove/10): the entry a finding belongs to — its free-text block, its structured entry (a
 * digest entry, its report row and an inline block's row share the report key and the local id), or its ledger row.
 */
const entryOf = (f) => f.unit ?? (f.source === 'ledger' ? `ledger:${f.ledgerId ?? f.text}`
  : f.localId !== null ? (f.reportPath ? `entry:${f.reportPath}#${f.localId}` : `entry:d${f.delivered}#${f.localId}`) : `loc:${locKey(f) ?? `${f.reportPath}#${f.text}`}`)
/** REPLAY-v3 (prove/6): a structured finding, whose term window may name secondary locators; a free-text block's locators are all its own. */
const isStructured = (f) => f.source === 'digest' || f.source === 'report' || (f.source === 'return' && f.localId !== null) || (f.source === 'ledger' && f.head === true)

/** review/15: an agent's dispatch line; an agent built from its sub-agent file has no known one, so its findings carry none. */
const lineOf = (agent) => (agent.fromFile ? null : agent.line)

/**
 * Every verdict-role finding, annotated with its pass, branch flag, round, delivery line and its
 * agent's dispatch line (`dispatched`, R6's credit guard): every verdict delivery read by all three
 * readers (free text, a C2 block, a digest) in both shapes, the C2 blocks of the verdict reports in
 * the run-state copies, and the run-end ledger rows from a verdict source. A report or ledger finding
 * takes the dispatch line of the agent whose digest names its report, else null. `readerSkips` counts
 * what the readers could not read (build/109).
 *
 * REPLAY-v3 (plan 012, v3-reader), with `rk` its report key (J): every report path is keyed by `rk`; a report or
 * ledger finding takes its passes, level, round and dispatch line from the agent whose digest names its report,
 * and reads the report's file name only when no digest names it (prove/11); a ledger row's role is the verdict role
 * its source names (prove/9); every finding carries its `entry`, and each structured finding is followed by one
 * finding per secondary locator (prove/6), marked `secondary`, copying everything but the locator.
 */
function collectFindings(deliveries, stateNames, states, roots, version, rk = null) {
  const v3 = version === 'v3'
  const keyOf = v3 ? rk : reportKey
  const all = []
  const byReport = new Map()
  const agentOfReport = new Map()
  for (const d of deliveries) {
    const key = d.agent === null || d.digest.report === null ? null : keyOf(d.digest.report)
    if (key === null || byReport.has(key)) continue
    byReport.set(key, lineOf(d.agent))
    agentOfReport.set(key, d.agent)
  }
  const dispatchedOf = (reportPath) => (reportPath ? byReport.get(keyOf(reportPath)) ?? null : null)
  const placeOf = (key, slug) => {
    const a = v3 && key ? agentOfReport.get(key) : undefined
    if (a) return { pass: a.pass, passes: a.passes, branch: a.branch, round: a.round, dispatched: lineOf(a), spanPasses: a.passes }
    return { pass: slug?.pass ?? null, passes: passesIn(slug?.pass), branch: slug?.pass === 'branch', round: slug?.round ?? null, dispatched: dispatchedOf(key) }
  }
  const readerSkips = {
    unreadFreeText: { 'severity-without-locator': 0, 'locator-without-severity': 0 }, digestErrors: 0, findingsBlockErrors: 0,
    ledgerParseErrors: sum(stateNames, (n) => states[n].ledgerParseErrors ?? 0),
  }
  deliveries.filter((d) => d.agent?.fn === 'verdict').forEach((d, k) => {
    const where = { pass: d.agent.pass, passes: d.agent.passes, branch: d.agent.branch, round: d.agent.round, delivered: d.line, dispatched: lineOf(d.agent), ...(v3 ? { spanPasses: d.agent.passes } : {}) }
    const meta = { role: d.agent.role, roots, source: 'return' }
    const digest = d.digest.status !== null && d.digest.report !== null
    const structured = digest || C2_FENCE.test(d.text)
    // build/183: a structured return is read by its own readers only, so a digest's entries are
    // never folded into one free-text block.
    if (!structured) for (const f of extractFreeText(d.text, meta)) all.push({ ...f, ...where, unit: `return:${k}:${f.text}` })
    // build/202: an inline block carries the digest's report path, the key its ledger rows cite.
    const block = parseFindingsBlock(d.text, { ...meta, reportPath: v3 ? rk(d.digest.report) : d.digest.report })
    readerSkips.findingsBlockErrors += block.errors.length
    for (const f of block.findings) all.push({ ...f, ...where, unit: null })
    for (const f of d.digest.findings) all.push({ ...f, ...(v3 ? { reportPath: rk(f.reportPath) } : {}), ...where, unit: null })
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
    for (const f of parsed.findings) all.push({ ...f, ...placeOf(reportPath, slug), delivered: null, unit: null })
  }
  const endLedger = states.end?.present ? states.end.ledger : stateNames.flatMap((n) => states[n].ledger)
  for (const f of ledgerFindings(endLedger, { roots, version })) {
    const role = v3 ? ledgerSourceRole(f.role) : f.role
    if (roleFunction(role) !== 'verdict') continue
    const key = v3 ? rk(f.reportPath) : f.reportPath
    all.push({ ...f, role, reportPath: key, ...placeOf(key, slugOf(key ?? f.reportPath)), delivered: null, unit: null })
  }
  widenToEntries(all)
  if (v3) {
    const read = all.splice(0)
    for (const f of read) {
      f.entry = entryOf(f)
      all.push(f)
      if (isStructured(f)) for (const loc of secondaryLocators(f, roots)) all.push({ ...f, ...loc, secondary: true })
    }
  }
  // The pass whose copies locate a finding's spans (build/190): v1 its attributed pass id; R6 (review/167, v2)
  // its one covered pass, so a round covering every pass meets the union whatever id its prompt names in
  // passing. v1 keeps its key: a report slug with a prefix (`lane-u1-p1`) names one pass and is no pass id.
  for (const f of all) f.spansPass = version !== 'v1' ? (f.passes.length === 1 ? f.passes[0] : null) : isPass(f.pass) ? f.pass : null
  return { all, readerSkips }
}

/**
 * The pass ids a report's slug names (`u1-p1`, or a multi round's `u1-p1-u1-p2`), in pass order. A
 * slug is no dispatch description: a multi round's report is named for every pass it covers.
 */
const passesIn = (slugPass) => passIdsIn(slugPass)

/**
 * Inbox rows 228 and 231: one term window in both shapes. A free-text finding's terms are read over
 * its own block (`extractFreeText`); a structured finding's over its own entry — its summary plus the
 * matching entry of its report's `stamity-findings` block (by the report path and the local id, or,
 * for a ledger row, which carries no local id, the same locator). So a digest whose summary is
 * shorter than its report row reads what the row reads, and neither shape reads report prose. A
 * finding with no file is left as it is: the matcher skips it, and at-risk coverage reads its text.
 */
function widenToEntries(all) {
  const byId = new Map()
  const byLocator = new Map()
  const index = (f) => {
    if (f.reportPath === null || f.file == null) return
    if (f.localId !== null && !byId.has(`${f.reportPath}#${f.localId}`)) byId.set(`${f.reportPath}#${f.localId}`, f.text)
    if (!byLocator.has(`${f.reportPath}@${locKey(f)}`)) byLocator.set(`${f.reportPath}@${locKey(f)}`, f.text)
  }
  // The report of record first (its last state copy), then a block carried inline in a return.
  for (const f of all) if (f.source === 'report') index(f)
  for (const f of all) if (f.source === 'return' && f.localId !== null) index(f)
  for (const f of all) {
    if (f.file == null || f.reportPath === null || (f.source !== 'digest' && f.source !== 'ledger')) continue
    const entry = f.source === 'digest' ? byId.get(`${f.reportPath}#${f.localId}`) : byLocator.get(`${f.reportPath}@${locKey(f)}`)
    if (typeof entry === 'string' && entry !== f.text) f.text = `${f.text}\n${entry}`
  }
}

/**
 * The matcher over every finding: seeds at the seeds document's severities, seeds and decoys at
 * Critical and Warning for the flags; the unmatched count (build/91: a finding with no file is
 * not unmatched) and the adjudication list.
 */
/**
 * build/190: the matcher per pass — a finding with a `spansPass` (`collectFindings`) meets the items'
 * spans as that pass's snapshot copies locate them; any other (a ledger row with no report, a
 * multi-pass or branch finding naming none, R6's round covering every pass) meets the union over
 * every pass. Indices stay `all`'s. REPLAY-v3 §9: a finding whose agent is known (`spanPasses`, from
 * `collectFindings`) meets the spans located in the copies of the passes that agent covers, and one of an agent
 * covering nothing meets no span, so it matches nothing and enters no adjudication row.
 */
function matchByPass(all, items, snapshots, opts) {
  const groups = new Map()
  all.forEach((f, i) => {
    const key = Array.isArray(f.spanPasses) ? f.spanPasses.join(',') : f.spansPass ?? '*'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(i)
  })
  const matched = Object.fromEntries(items.map((item) => [item.id, []]))
  const adjudication = []
  for (const [key, idxs] of groups) {
    if (key === '') continue
    const spans = relocatedSpans(items, snapshots, key === '*' ? undefined : key.split(','))
    const part = matchItems(idxs.map((i) => all[i]), items, spans, opts)
    for (const [id, hits] of Object.entries(part.matched)) matched[id].push(...hits.map((h) => idxs[h]))
    adjudication.push(...part.adjudication.map((a) => ({ id: a.id, findingIdx: idxs[a.findingIdx] })))
  }
  for (const id of Object.keys(matched)) matched[id].sort((a, b) => a - b)
  adjudication.sort((a, b) => a.findingIdx - b.findingIdx)
  return { matched, adjudication }
}

function scoreFindings(all, seeds, snapshots, guard = null, version = null) {
  const items = [...seeds.seeds, ...seeds.decoys]
  const tolerance = seeds.matcher?.lineTolerance ?? 3
  const seedMatch = matchByPass(all, seeds.seeds, snapshots, { tolerance, severities: seeds.matcher?.severities ?? FLAG_SEVERITIES })
  const flagMatch = matchByPass(all, items, snapshots, { tolerance, severities: FLAG_SEVERITIES })
  // review/16: a seed match the credit guard withholds is no match for precision either (a decoy is in every tree).
  const seedPass = new Map(seeds.seeds.map((seed) => [seed.id, seed.pass]))
  const flagged = new Set(Object.entries(flagMatch.matched).flatMap(([id, idxs]) => (seedPass.has(id) ? idxs.filter((i) => credits(all[i], guard, seedPass.get(id))) : idxs)))

  // One per free-text block and one per location, so a finding repeated by a digest, a report and
  // a ledger row counts once. REPLAY-v3 (prove/6) counts entries: an entry (a free-text block, a structured
  // entry with its report row and its secondaries, a ledger row) is unmatched when it holds a Critical or
  // Warning finding with a file and none of its findings is flagged.
  const v3 = version === 'v3'
  const units = new Map()
  all.forEach((f, i) => {
    if (!FLAG_SEVERITIES.includes(f.severity) || f.file == null || (!v3 && flagged.has(i))) return
    const key = v3 ? f.entry : f.unit ?? `loc:${locKey(f)}`
    if (!units.has(key)) units.set(key, { keys: [], flagged: false })
    units.get(key).keys.push(locKey(f))
    if (flagged.has(i)) units.get(key).flagged = true
  })
  // An entry sharing a locator with one already counted is that one again.
  const counted = new Set()
  let unmatched = 0
  for (const { keys, flagged: hit } of units.values()) {
    if (hit || keys.some((k) => counted.has(k))) continue
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

/** build/197: a seed present, not found, whose oracle passes at run end, is named. */
function unfoundWithOracle(r, notes) {
  if (r.present === true && !r.found && r.oracle === 'pass') notes.push(`seed ${r.id} (${r.pass}): present in the snapshot and not found by a verdict role, while its oracle passes at run end — scored not found (build/197)`)
}

/** Where a seed was first found: its own pass, another pass, the whole-branch review, or a source naming no pass (a ledger row with no report). */
const STAGE_ORDER = ['pass', 'other-pass', 'branch', 'unknown']
// build/366: a finding of a multi round is at the pass stage for every pass the round covers.
const stageOf = (f, seed) => (f.branch ? 'branch' : covers(f, seed.pass) ? 'pass' : isPass(f.pass) ? 'other-pass' : 'unknown')

/** Whether a seeds document is REPLAY-v2's: a seed carries an `injection` (S1). A v1 document carries none. */
const injecting = (seeds) => seeds.seeds.some((seed) => seed.injection !== undefined)

/** The two per-seed states the driver's hook records in `run.json`'s `injection` (REPLAY-v2 §5). */
const INJECTED = 'injected'
const NOT_INJECTED = 'not injected (anchor missing)'
/** review/5, build/9: a seed the record cannot give a state for (no record, or a malformed one); never a recorded state. */
const UNREADABLE = Symbol('unreadable')

/**
 * review/135 (REPLAY-v2 §5, §8): an injecting seeds document (a seed carries `injection`) is read
 * beside the driver's injection record, `run.json`'s `injection.passes[<pass>].seeds[]` — a map of
 * seed id to state. A v1 document returns null and reads no record. A v2 run with no record, or a
 * record the driver would not write, is invalid, naming why.
 * R7 (review/168): every seed of the document is checked against a readable record. A pass with no
 * entry is uncovered — the injection point never came for it, so its seeds were in no tree — and the
 * run is invalid, one reason per pass beginning `UNCOVERED_REASON`; a seed its pass's entry omits is
 * uncovered too, its reason also beginning `UNCOVERED_REASON` (review/1). A pass with an entry and no
 * injection snapshot (`snapshots`) is a capture defect. A seed a missing or malformed record gives no
 * readable state is mapped to `UNREADABLE`, so its row is not read as uncovered (review/5, build/9).
 */
function injectionStatesOf(seeds, run, invalid, snapshots) {
  if (!injecting(seeds)) return null
  const states = new Map()
  const record = run?.injection
  const unreadable = () => new Map(seeds.seeds.map((seed) => [seed.id, UNREADABLE]))
  if (record === undefined || record === null) {
    invalid.push('run.json carries no injection record (injection), so no seed can be read as injected or not: a REPLAY-v2 run is invalid without it')
    return unreadable()
  }
  const malformed = (why) => invalid.push(`run.json's injection record is malformed: ${why}`)
  if (typeof record !== 'object' || record.passes === null || typeof record.passes !== 'object' || Array.isArray(record.passes)) {
    malformed('passes is not an object')
    return unreadable()
  }
  const listed = new Map()
  for (const [pass, entry] of Object.entries(record.passes)) {
    // R7: the hook snapshots a pass in the call that injects it, so an entry with no copy is a capture defect.
    if (copiesOf(snapshots, pass).length === 0) invalid.push(`capture defect: pass ${pass} has an entry in run.json's injection record, but captures/snapshots/${pass}/ holds no copy`)
    if (!Array.isArray(entry?.seeds)) {
      malformed(`pass ${pass} has no seeds list`)
      continue
    }
    listed.set(pass, new Set(entry.seeds.map((s) => s?.id)))
    for (const s of entry.seeds) {
      if (typeof s?.id !== 'string' || (s.state !== INJECTED && s.state !== NOT_INJECTED)) malformed(`seed ${JSON.stringify(s?.id ?? null)} has state ${JSON.stringify(s?.state ?? null)}`)
      else states.set(s.id, s.state)
    }
  }
  const uncovered = new Map()
  for (const seed of seeds.seeds) {
    if (!Object.hasOwn(record.passes, seed.pass)) uncovered.set(seed.pass, [...(uncovered.get(seed.pass) ?? []), seed.id])
    else if (listed.get(seed.pass)?.has(seed.id) === false) invalid.push(`${UNCOVERED_REASON} ${seed.pass}: its entry in run.json's injection record omits seed ${seed.id}, so it was never injected`)
    else if (!states.has(seed.id)) states.set(seed.id, UNREADABLE)
  }
  for (const [pass, ids] of uncovered) invalid.push(`${UNCOVERED_REASON} ${pass}: no review dispatch covered it, so its seeds (${ids.join(', ')}) were never injected`)
  return states
}

/**
 * R6's credit guard (review/167, v2 only; `guard` null under v1): a finding credits a seed only if its
 * agent was dispatched at or after the injection point (`guard.line`, Infinity when never reached). A
 * report or ledger finding no digest names (no `dispatched`) credits only when no verdict agent was
 * dispatched before the injection point (`guard.orphans`). review/15: an agent built from its sub-agent
 * file has no known dispatch line (`dispatched` null) and makes `guard.orphans` false, so it never credits.
 * review/14, review/16: the compaction samples and precision read seed matches through the same guard.
 * REPLAY-v3 (plan 012, amendments 2 and 3), per pass: the guard is `{ lines, orphans }`, keyed by pass. A finding
 * whose agent is known (`dispatched`) credits a seed of pass P only when that agent covers P (`covers`: a return by
 * its agent's coverage, a report or ledger finding by the coverage of the agent whose digest names its report). A
 * finding no digest places credits a seed of P only when no verdict agent was dispatched before P's swap
 * (`orphans[P]`); `lines[P]`, the swap line, serves only that.
 */
const credits = (f, guard, pass) => {
  if (guard === null) return true
  if (guard.lines) return typeof f.dispatched === 'number' ? covers(f, pass) : guard.orphans[pass] === true
  return typeof f.dispatched === 'number' ? f.dispatched >= guard.line : guard.orphans
}

/**
 * One row per seed: presence at its pass from the snapshot copies, found, the earliest stage and
 * round-1 find, and the oracle status. A pass with no snapshot at all (no verdict agent ever
 * started it) leaves presence unknown and keeps the seed in the denominator rather than read it as
 * "caught by implementer", which would ease the recall row; `notes` names each such pass.
 * review/135: a seed the injection record (`injected`, REPLAY-v2 only) names not injected is filed
 * absent at its pass whatever the snapshot reads, since a negative presence rule cannot tell a
 * rewritten guard from a missing one: it leaves the denominator and holds its security row.
 * review/162 (REPLAY-v2 R4 only): an injected seed's presence is read from its pass's review snapshot
 * (`reviewSnapshots`) when one exists. An injected seed absent there was reverted before review: filed
 * absent at the pass, it leaves the denominator and holds its security row, as a not-injected seed
 * does. With no review snapshot for the pass, the injection snapshot is read, as before R4.
 * R7 (review/168, REPLAY-v2 only): the presence-unknown reading above is REPLAY-v1's, and v2 does
 * not keep it. A seed with no state in the record is uncovered: it was in no tree, so it is filed
 * never found, whatever a finding matches, and `injectionStatesOf` voided the run. A seed recorded
 * injected whose file is absent from every copy of its pass's injection snapshot is a capture defect,
 * as is a pass with an entry and no injection snapshot (named by `injectionStatesOf`); neither writes a
 * presence-unknown note, since presence is never unknown in a valid v2 run.
 */
function seedRowsOf(seeds, all, seedMatch, snapshots, oracleStatus, notes, invalid, injected = null, reviewSnapshots = null, guard = null) {
  const missing = new Set()
  const absent = []
  const rows = seeds.seeds.map((seed) => {
    const hits = seedMatch.matched[seed.id].map((i) => all[i]).filter((f) => credits(f, guard, seed.pass))
    const stages = hits.map((f) => stageOf(f, seed)).toSorted((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b))
    const found = { found: hits.length > 0, foundRound1: hits.some((f) => !f.branch && covers(f, seed.pass) && f.round === 1), stage: stages[0] ?? null, oracle: oracleStatus.get(seed.id) ?? null }
    if (injected?.get(seed.id) === NOT_INJECTED) {
      notes.push(`seed ${seed.id} (${seed.pass}): recorded ${NOT_INJECTED} in run.json's injection record, so it is filed absent at the pass and leaves the recall denominator, whatever the snapshot reads${seed.class === 'security' ? '; a security seed, so it holds its security-seeds row' : ''}`)
      return { id: seed.id, class: seed.class ?? null, pass: seed.pass, present: false, caughtByImplementer: true, ...found }
    }
    // review/5, build/9: the record gives no readable state, and the run's own reason says why; never credited either.
    if (injected?.get(seed.id) === UNREADABLE) {
      notes.push(`seed ${seed.id} (${seed.pass}): no readable state in run.json's injection record (the run's invalid reason names why), so it is filed never found, whatever a finding matches; the run is invalid (§8)`)
      return { id: seed.id, class: seed.class ?? null, pass: seed.pass, present: null, caughtByImplementer: false, ...found, found: false, foundRound1: false, stage: null }
    }
    // R7: a finding that meets an uncovered seed's span and a term met the clean line the injection would have replaced.
    if (injected !== null && !injected.has(seed.id)) {
      notes.push(`seed ${seed.id} (${seed.pass}): uncovered — no state in run.json's injection record, so it was never injected and no finding can find it; the run is invalid (§8)`)
      return { id: seed.id, class: seed.class ?? null, pass: seed.pass, present: null, caughtByImplementer: false, ...found, found: false, foundRound1: false, stage: null }
    }
    const reviewed = injected !== null && reviewSnapshots !== null ? copiesOf(reviewSnapshots, seed.pass) : []
    if (reviewed.length > 0) {
      const heldAtReview = new Set(reviewed.map((copy) => presentIn(copy, seed)))
      if (!heldAtReview.has(true) && heldAtReview.has(false)) {
        notes.push(`seed ${seed.id} (${seed.pass}): injected, and absent from every copy under captures/review-snapshots/${seed.pass}/, so it was reverted before review: it is filed absent at the pass and leaves the recall denominator${seed.class === 'security' ? '; a security seed, so it holds its security-seeds row' : ''}`)
        return { id: seed.id, class: seed.class ?? null, pass: seed.pass, present: false, caughtByImplementer: true, ...found }
      }
    }
    const atInjection = copiesOf(snapshots, seed.pass)
    const copies = reviewed.length > 0 ? reviewed : atInjection
    // build/167: a file absent from every copy says nothing of the rule, so presence is unknown.
    const held = new Set(copies.map((copy) => presentIn(copy, seed)))
    const present = held.has(true) ? true : held.has(false) ? false : null
    if (injected !== null) {
      // R7: v2 reads the injection snapshot for the file; a pass with no copy at all was named by injectionStatesOf.
      if (atInjection.length > 0 && atInjection.every((copy) => presentIn(copy, seed) === null)) {
        invalid.push(`capture defect: seed ${seed.id} (${seed.pass}): ${seed.file} is absent from every copy of the pass's injection snapshot (captures/snapshots/${seed.pass}/)`)
      } else if (copies.length > 0 && present === null) {
        invalid.push(`capture defect: seed ${seed.id} (${seed.pass}): ${seed.file} is absent from every copy of the pass's review snapshot (captures/review-snapshots/${seed.pass}/)`)
      }
    } else {
      if (copies.length === 0) missing.add(seed.pass)
      if (copies.length > 0 && present === null) absent.push(seed)
    }
    return { id: seed.id, class: seed.class ?? null, pass: seed.pass, present, caughtByImplementer: present === false, ...found }
  })
  for (const pass of missing) notes.push(`no snapshot under captures/snapshots/${pass}/: its seeds stay in the recall denominator with presence unknown`)
  for (const r of rows) unfoundWithOracle(r, notes)
  for (const seed of absent) {
    notes.push(`seed ${seed.id} (${seed.pass}, ${seed.file}): the file is absent from every snapshot copy of the pass, so the seed stays in the recall denominator with presence unknown`)
    // build/251: a seeded file no copy holds is a capture defect, in either shape.
    invalid.push(`capture defect: seed ${seed.id} (${seed.pass}): ${seed.file} is absent from every snapshot copy of the pass`)
  }
  return rows
}

// ---------- REPLAY-v3: the seeds arrive in the units' own patches (plan 012) ----------

/** The two pass states of S2 that leave a pass's patch holding its seeded bytes. */
const SEEDED_STATES = new Set(['swapped', 'already-seeded'])

/**
 * S2 (REPLAY-v3 §5): `run.json`'s `injection`, the driver's swap record, read as a Map of pass to its
 * entry. No record, or one whose `passes` is no object, is invalid and swaps nothing. An entry whose
 * state is not `swapped` or `already-seeded`, whose `seeded` digest is not the seeds document's, or whose
 * `mtimeKept` is not true is a swap defect. A pass holding a seed with no entry is uncovered, one reason
 * per pass beginning `UNCOVERED_REASON`, so §10 does not replace a changed scored run invalid only this way.
 */
function swapStatesOf(seeds, run, invalid) {
  const record = run?.injection
  const swapped = new Map()
  if (record === undefined || record === null) {
    invalid.push('run.json carries no swap record (injection), so no pass can be read as swapped: a REPLAY-v3 run is invalid without it')
    return swapped
  }
  if (typeof record !== 'object' || record.passes === null || typeof record.passes !== 'object' || Array.isArray(record.passes)) {
    invalid.push("run.json's swap record is malformed: passes is not an object")
    return swapped
  }
  for (const [pass, entry] of Object.entries(record.passes)) {
    swapped.set(pass, entry)
    if (!SEEDED_STATES.has(entry?.state)) invalid.push(`swap defect: pass ${pass} reads state ${JSON.stringify(entry?.state ?? null)}, not swapped or already-seeded`)
    if (entry?.seeded !== seeds.patches[pass]?.seeded) invalid.push(`swap defect: pass ${pass}'s seeded digest ${entry?.seeded ?? 'none'} is not seeds.patches["${pass}"].seeded`)
    if (entry?.mtimeKept !== true) invalid.push(`swap defect: pass ${pass}'s mtime was not kept (mtimeKept is ${JSON.stringify(entry?.mtimeKept ?? null)})`)
  }
  for (const pass of PASS_IDS) {
    const ids = seeds.seeds.filter((seed) => seed.pass === pass).map((seed) => seed.id)
    if (ids.length > 0 && !swapped.has(pass)) invalid.push(`${UNCOVERED_REASON} ${pass}: no build dispatch named it, so its patch was never swapped and its seeds (${ids.join(', ')}) never arrived`)
  }
  return swapped
}

/**
 * Each pass's swapping agent: the dispatch whose tool_use id the swap record names (S2, else
 * `captures/swaps/<pass>.json`), else the first build dispatch whose description names the pass; none when
 * there is neither.
 */
function swappersOf(agents, swapped, L) {
  const dispatched = agents.filter((a) => !a.fromFile)
  return Object.fromEntries(PASS_IDS.map((pass) => {
    const recorded = swapped.get(pass)?.toolUseId
    const id = typeof recorded === 'string' && recorded !== '' ? recorded : readJsonIfPresent(join(L.swaps, `${pass}.json`))?.toolUseId
    return [pass, dispatched.find((a) => a.toolUseId === id) ?? dispatched.find((a) => a.fn === 'build' && passIdsIn(a.desc, true).includes(pass))]
  }))
}

/** Each pass's swap line, the credit guard's `lines`: its swapping agent's dispatch line; Infinity when there is none, so nothing credits that pass's seeds. */
const swapLinesOf = (swappers) => Object.fromEntries(PASS_IDS.map((pass) => [pass, swappers[pass] ? swappers[pass].line : Infinity]))

/** Whether an item holds in some copy (true), in none of those holding its file (false), or no copy holds the file (null). */
function heldIn(copies, item) {
  const held = new Set(copies.map((copy) => presentIn(copy, item)))
  return held.has(true) ? true : held.has(false) ? false : null
}

/**
 * Each seed's arrival (REPLAY-v3 §5, §8), read before the matcher, since a seed in no reviewed tree is no
 * matcher item (build/7): `{ present, caught, item }`. A seed of a pass with no swap record is uncovered and
 * never found. Presence is its `present` rule over the pass's review-start copies (`captures/snapshots/<P>/`);
 * a pass no review covered reads it from the last build-end copy, of any agent, taken after the pass was built
 * (the copy at the stop that built it included; review/11, REPLAY-v3 §8). The pass was built at the stop of the
 * build agent whose dispatch swapped it (`swappers`, amendment 1): a repeat dispatch's build end builds nothing
 * (review/18). A last copy lacking the seed's file reads back to the last copy after the swap that holds it, and
 * none holding it is a capture defect (review/17); so is a pass whose swapping build left no build-end copy
 * (review/26, amendment 6), so no presence is left open. A seed absent there was not delivered
 * when no build-end copy after the pass's swap held it, and was caught before review otherwise, the note naming
 * the build ends it went between (a copy lacking the seed's file names nothing, review/13); either way it leaves
 * the denominator and holds its security row. A seed file absent from every review-start copy is a capture defect.
 */
function arrivalsOf(seeds, swapped, swappers, L, byAgentId, notes, invalid) {
  const who = (row) => (byAgentId.has(row.agentId) ? `${row.agentId} (${JSON.stringify(byAgentId.get(row.agentId).desc)})` : String(row.agentId))
  const { rows } = jsonlCounted(readTextIfPresent(join(L.buildEnd, 'index.jsonl')))
  const arrivals = new Map()
  for (const seed of seeds.seeds) {
    const tag = `seed ${seed.id} (${seed.pass})`
    const held = seed.class === 'security' ? '; a security seed, so it holds its security-seeds row' : ''
    if (!swapped.has(seed.pass)) {
      notes.push(`${tag}: uncovered — no swap record for its pass, so its patch was never swapped and no finding can find it; the run is invalid (§8)`)
      arrivals.set(seed.id, { present: null, caught: false, item: false })
      continue
    }
    // A build-end copy stamped before the swap never counts; an unreadable stamp does.
    const swappedAt = Date.parse(swapped.get(seed.pass)?.at)
    const ends = rows.filter((r) => typeof r.dir === 'string' && !(Date.parse(r.at) < swappedAt)).map((r) => Object.assign({}, r, { held: heldIn(copiesOf(L.buildEnd, r.dir.split(/[\\/]/).pop()), seed) }))
    const reviewStart = copiesOf(L.snapshots, seed.pass)
    // The pass was built at its swapping agent's build end; the last copy from there on that holds the seed's file is read.
    const swapper = swappers[seed.pass]
    const built = swapper !== undefined && ends.some((r) => r.dispatch === swapper.toolUseId || byAgentId.get(r.agentId) === swapper)
    const lastBuild = built ? ends.findLast((r) => r.held !== null) : undefined
    if (reviewStart.length === 0 && built && lastBuild === undefined) invalid.push(`capture defect: seed ${seed.id} (${seed.pass}): ${seed.file} is absent from every build-end copy after the pass's swap, and no review covered the pass`)
    // review/26 (amendment 6): a swapping build that never stopped left no build-end copy, so presence would be open.
    if (reviewStart.length === 0 && !built) invalid.push(`capture defect: seed ${seed.id} (${seed.pass}): the build agent whose dispatch swapped the pass left no build-end copy, and no review covered the pass, so its presence would be left open`)
    const present = reviewStart.length > 0 ? heldIn(reviewStart, seed) : lastBuild?.held ?? null
    if (present === false) {
      // False from the build ends only when the last build-end copy after the pass was built lacks the seed.
      const at = reviewStart.length > 0 ? `every review-start copy under captures/snapshots/${seed.pass}/ that holds ${seed.file}` : `the last build-end copy taken after the pass was built, ${who(lastBuild)}'s, as the pass was never reviewed`
      const last = ends.findLastIndex((r) => r.held === true)
      const gone = ends.slice(last + 1).find((r) => r.held === false)
      if (last === -1) notes.push(`${tag}: was not delivered — absent from ${at}, and from every build-end copy after the pass's swap (${ends.length === 0 ? 'none was taken' : `the first, ${who(ends[0])}'s, lacks it`}), so it leaves the recall denominator${held}`)
      else notes.push(`${tag}: caught before review — absent from ${at}; it went between the build end of ${who(ends[last])} and ${gone ? `the build end of ${who(gone)}` : 'the review start'}, so it leaves the recall denominator${held}`)
      arrivals.set(seed.id, { present: false, caught: true, item: false })
    } else if (reviewStart.length === 0) {
      notes.push(`${tag}: was never reviewed — its pass was swapped and no review covered it, so its presence is read from ${lastBuild ? `the last build-end copy taken after the pass was built, ${who(lastBuild)}'s` : built ? 'no build-end copy that holds its file, a capture defect' : 'no build-end copy of the build agent whose dispatch swapped it, a capture defect'}; it stays in the recall denominator as a miss`)
      arrivals.set(seed.id, { present, caught: false, item: false })
    } else {
      if (present === null) invalid.push(`capture defect: seed ${seed.id} (${seed.pass}): ${seed.file} is absent from every copy of the pass's review-start snapshot (captures/snapshots/${seed.pass}/)`)
      arrivals.set(seed.id, { present, caught: false, item: true })
    }
  }
  return arrivals
}

/**
 * One row per seed under REPLAY-v3 (plan 012), beside `seedRowsOf`: presence from `arrivalsOf`, found by a
 * finding the per-pass guard credits (a seed that is no matcher item has no match). A seed present at review
 * start, absent from every round-completion copy holding its file (`captures/review-snapshots/<P>/`) and
 * credited by no finding is named as removed during review; it stays a miss.
 */
function seedRowsV3(seeds, all, seedMatch, arrivals, reviewSnapshots, oracleStatus, notes, guard) {
  const rows = seeds.seeds.map((seed) => {
    const arrival = arrivals.get(seed.id)
    const hits = (seedMatch.matched[seed.id] ?? []).map((i) => all[i]).filter((f) => credits(f, guard, seed.pass))
    const stages = hits.map((f) => stageOf(f, seed)).toSorted((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b))
    const atCompletion = copiesOf(reviewSnapshots, seed.pass).map((copy) => presentIn(copy, seed)).filter((h) => h !== null)
    if (arrival.present === true && hits.length === 0 && atCompletion.length > 0 && !atCompletion.includes(true)) {
      notes.push(`seed ${seed.id} (${seed.pass}): removed during review, uncredited — present at review start and absent from every copy under captures/review-snapshots/${seed.pass}/ that holds ${seed.file}, and no finding credits it: it stays in the recall denominator as a miss`)
    }
    return {
      id: seed.id, class: seed.class ?? null, pass: seed.pass, present: arrival.present, caughtByImplementer: arrival.caught,
      found: hits.length > 0, foundRound1: hits.some((f) => !f.branch && covers(f, seed.pass) && f.round === 1), stage: stages[0] ?? null, oracle: oracleStatus.get(seed.id) ?? null,
    }
  })
  for (const r of rows) unfoundWithOracle(r, notes)
  return rows
}

// ---------- the measurement: compaction samples and context ----------

/**
 * One sample per driver compaction (`manual`; `auto` too under the auto-window mechanism), `n` from
 * 1 in transcript order, read against `captures/state/compaction-<n>-pre/`. At risk: a verdict-role
 * Critical or Warning finding delivered before the boundary with no pre-compaction row; lost: no
 * row at run end either, and no seed it matches has a passing oracle. Valid iff at risk ≥ 1.
 * Inbox row 230: an `auto` boundary is a sample only inside §7's window — after a lens (verdict-role)
 * delivery, with no ledger write between that delivery and the boundary. One outside it keeps its
 * `n`, so the pre-compaction copies stay aligned, and is named in `notes`, never sampled.
 */
function compactionSamplesOf({ walk, mechanism, states, deliveries, all, seedMatch, seedPass, oracleStatus, roots, tolerance, notes, recorded = [], guard = null, rk = null }) {
  const driverCompactions = walk.compactions.filter((c) => c.trigger === 'manual' || (mechanism === 'auto-window' && c.trigger === 'auto'))
  // REPLAY-v3 (J): a row's report path is keyed as the findings' are.
  const rowsOf = (ledger) => (rk ? ledgerFindings(ledger, { roots }).map((r) => Object.assign(r, { reportPath: rk(r.reportPath) })) : ledgerFindings(ledger, { roots }))
  const endRows = rowsOf(states.end?.ledger ?? [])
  const seedsOfFinding = new Map()
  // review/14: a finding the credit guard withholds never reads a seed as fixed.
  for (const [id, idxs] of Object.entries(seedMatch.matched)) for (const i of idxs.filter((k) => credits(all[k], guard, seedPass.get(id)))) seedsOfFinding.set(i, [...(seedsOfFinding.get(i) ?? []), id])
  const writes = ledgerWriteLines(walk)
  const inWindow = (c) => {
    const lens = deliveries.findLast((d) => d.line < c.line && d.agent?.fn === 'verdict')
    return lens !== undefined && !writes.some((line) => line > lens.line && line < c.line)
  }
  return driverCompactions.flatMap((c, k) => {
    const n = k + 1
    if (c.trigger === 'auto' && !inWindow(c)) {
      notes.push(`auto compaction ${n} at main transcript line ${c.line} falls outside §7's window (no lens delivery before it without a ledger write since): no sample`)
      return []
    }
    // review/164: a last lens delivery naming no pass takes the placement the driver recorded for compaction n, if it names one.
    const fromDriver = recorded.find((r) => r?.n === n)?.placement
    const placement = deliveries.findLast((d) => d.line < c.line && d.agent?.fn === 'verdict')?.agent.pass ?? (isPass(fromDriver) ? fromDriver : null)
    const sample = { n, placement, trigger: c.trigger ?? null, preTokens: c.preTokens ?? null, postTokens: c.postTokens ?? null, atRisk: 0, lost: 0, valid: false }
    const pre = states[`compaction-${n}-pre`]
    if (!pre?.present) return [Object.assign(sample, { reason: `no captures/state/compaction-${n}-pre/ copy` })]
    const preRows = rowsOf(pre.ledger)
    const seen = new Set()
    const keyOf = (f) => locKey(f) ?? `${f.reportPath}#${f.localId ?? f.text}`
    if (rk) {
      // REPLAY-v3 (prove/10): loss counts entries. An entry's own locators are a free-text block's every locator, or a
      // structured entry's one locator (never a secondary). It is at risk when delivered before the boundary at Critical
      // or Warning, no pre-compaction row covers any own locator, and not all of them were counted in this sample; lost
      // when, as well, no end row covers any own locator and no finding of the entry, secondaries included, credits a
      // seed whose oracle passes.
      const entries = new Map()
      all.forEach((f, i) => {
        if (f.delivered === null || f.delivered >= c.line || !FLAG_SEVERITIES.includes(f.severity)) return
        if (!entries.has(f.entry)) entries.set(f.entry, { own: [], idx: [] })
        if (!f.secondary) entries.get(f.entry).own.push(f)
        entries.get(f.entry).idx.push(i)
      })
      for (const { own, idx } of entries.values()) {
        const keys = own.map(keyOf)
        if (own.length === 0 || keys.every((key) => seen.has(key)) || own.some((f) => hasRow(f, preRows, tolerance))) continue
        for (const key of keys) seen.add(key)
        sample.atRisk++
        const fixed = idx.some((i) => (seedsOfFinding.get(i) ?? []).some((id) => oracleStatus.get(id) === 'pass'))
        if (!own.some((f) => hasRow(f, endRows, tolerance)) && !fixed) sample.lost++
      }
    } else all.forEach((f, i) => {
      if (f.delivered === null || f.delivered >= c.line || !FLAG_SEVERITIES.includes(f.severity)) return
      const key = keyOf(f)
      if (seen.has(key) || hasRow(f, preRows, tolerance)) return
      seen.add(key)
      sample.atRisk++
      const fixed = (seedsOfFinding.get(i) ?? []).some((id) => oracleStatus.get(id) === 'pass')
      if (!hasRow(f, endRows, tolerance) && !fixed) sample.lost++
    })
    sample.valid = sample.atRisk >= 1
    return [sample]
  })
}

/** A `stamity ledger status` call: the verb's read, which writes nothing and closes no window. */
const LEDGER_STATUS = /\bledger\s+status\b/

/** The main-transcript lines of the orchestrator's ledger writes: the gated kinds of term (c), a `ledger status` read excepted. */
function ledgerWriteLines(walk) {
  return [
    ...walk.bash.filter((b) => b.kind === 'command' && b.ledger && LEDGER_GATED_KINDS.has(b.ledger.kind) && !(b.ledger.kind === 'verb' && LEDGER_STATUS.test(b.command ?? ''))).map((b) => b.line),
    ...walk.events.filter((e) => e.dir === 'out' && e.ledger && LEDGER_GATED_KINDS.has(e.ledger.kind)).map((e) => e.line),
  ]
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
 * spelling, beside `ALWAYS_FORBIDDEN`'s three: `seeds.json`, `__oracle__` and `reference-fixes`, and under v3 `patches-seeded`). Returns the `stamity/replay-measurement/v1`
 * document; a run that breaks a validity rule is measured anyway and names each reason in `invalid`.
 */
export async function measureRun(runDir, { seeds, forbid = [] } = {}) {
  checkSeeds(seeds)
  // R3, R6 and R8 (review/150, review/167): a named pass range, coverage by coverageOf, branch level after an
  // approval and the credit guard are REPLAY-v2's and REPLAY-v3's; v1's measurement reads none of them
  // (REPLAY-v1 §14). REPLAY-v3 (plan 012): per-pass arrival, its coverage rule, guard, presence and contamination.
  const version = seeds.arrival === 'patch' ? 'v3' : injecting(seeds) ? 'v2' : 'v1'
  const cap = await loadCapture(runDir, forbid, version)
  const { L, run, invalid, walk, roots, states, oracleStatus, oracleRun } = cap
  const { agents, byAgentId, sends, deliveries, notes, injectionLine } = joinAgents(walk, cap.index, cap.subs, roots, version)
  const { perPass, beside, unresolved } = loopCharacters(walk, cap.index, agents, sends, deliveries)
  const usage = subagentUsage(cap.subs, byAgentId, deliveries, invalid, notes)
  const agentsWithoutTranscript = reconcileAgents(agents, cap.subs, byAgentId, deliveries, notes)
  // build/196: a pass no loop agent was dispatched for still divides the figures by six.
  for (const id of PASS_IDS) {
    if (!agents.some((a) => LOOP_FUNCTIONS.has(a.fn) && !a.branch && a.pass === id)) notes.push(`pass ${id} has no loop dispatch: its loop characters and sub-agent tokens are 0 and still count in the ÷ 6`)
  }
  // REPLAY-v3 (J): one report key for the findings, the credit guard and the compaction rows.
  const rk = version === 'v3' ? reportKeyerOf(cap.stateNames, states) : null
  const { all, readerSkips } = collectFindings(deliveries, cap.stateNames, states, roots, version, rk)
  const point = injectionLine ?? Infinity
  // review/15: a verdict agent built from its sub-agent file may have been dispatched before the point, so orphans do not credit beside it.
  const orphansBefore = (line) => !agents.some((a) => a.fn === 'verdict' && (a.fromFile || a.line < line))
  const swapped = version === 'v3' ? swapStatesOf(seeds, run, invalid) : null
  const swappers = swapped ? swappersOf(agents, swapped, L) : null
  const lines = swappers ? swapLinesOf(swappers) : null
  const guard = lines ? { lines, orphans: Object.fromEntries(PASS_IDS.map((p) => [p, orphansBefore(lines[p])])) } : version === 'v2' ? { line: point, orphans: orphansBefore(point) } : null
  // build/7 (v3): a seed in no reviewed tree, or known absent from it, is no matcher item: no credit, no adjudication row.
  const arrivals = swapped ? arrivalsOf(seeds, swapped, swappers, L, byAgentId, notes, invalid) : null
  const items = arrivals ? { ...seeds, seeds: seeds.seeds.filter((seed) => arrivals.get(seed.id).item) } : seeds
  const { seedMatch, decoysFlagged, unmatched, adjudication, tolerance } = scoreFindings(all, items, L.snapshots, guard, version)
  // build/251: a pass a verdict agent was dispatched for holds a snapshot, by the marker hook's rule; none is a capture defect
  // (build/366: for each pass a multi dispatch covers).
  for (const id of PASS_IDS) {
    if (agents.some((a) => a.fn === 'verdict' && !a.branch && covers(a, id)) && copiesOf(L.snapshots, id).length === 0) {
      invalid.push(`capture defect: a verdict agent was dispatched for ${id}, but captures/snapshots/${id}/ holds no copy`)
    }
  }
  const seedRows = arrivals
    ? seedRowsV3(seeds, all, seedMatch, arrivals, L.reviewSnapshots, oracleStatus, notes, guard)
    : seedRowsOf(seeds, all, seedMatch, L.snapshots, oracleStatus, notes, invalid, injectionStatesOf(seeds, run, invalid, L.snapshots), L.reviewSnapshots, guard)
  const mechanism = run?.mechanism ?? 'interrupt'
  // review/164 (REPLAY-v2, and v3 by its placements): the driver's recorded placements, read when no lens delivery names the pass.
  const recorded = version !== 'v1' && Array.isArray(run?.compactions) ? run.compactions : []
  const seedPass = new Map(seeds.seeds.map((seed) => [seed.id, seed.pass]))
  const compactionSamples = compactionSamplesOf({ walk, mechanism, states, deliveries, all, seedMatch, seedPass, oracleStatus, roots, tolerance, notes, recorded, guard, rk })

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
    // build/366: one review round's verdict and round count are recorded for every pass it covers.
    const reviews = reviewsOf((a) => !a.branch && covers(a, id))
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
    // REPLAY-v3 (plan 012): the measurement names its version under v3 only; v1's and v2's documents gain no field.
    ...(version === 'v3' ? { version } : {}),
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
      oracleRun,
    },
    compactionSamples,
    wholeBranch: { finalClass: finalClassOf(branchReviews), rounds: branchReviews.filter((d) => d.round).length },
    adjudication,
    models: { pin: ORCHESTRATOR_MODEL, init: cap.init?.model ?? null, orchestrator: cap.orchestratorModels, subagents: usage.models },
    client: { version: typeof cap.init?.claude_code_version === 'string' ? cap.init.claude_code_version : null, ambient: ambientOf(cap.init) },
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
