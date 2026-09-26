// The replay's findings reader and its deterministic matcher (REPLAY-v1 §9).
//
// Findings reach the measurement in two shapes. The 1.9.1 baseline returns free text, read here by
// a block heuristic (`extractFreeText`). The changed shape writes a report whose `stamity-findings`
// block (C2) is read strictly (`parseFindingsBlock`), returns a digest (C4, both the reviewer's and
// a lens's) read by its labels (`parseDigest`), closes rows with a `stamity-closures` block (C9,
// `parseClosures`), and appends ledger rows (C3, `ledgerFindings`). Every reader returns the same
// `Finding` row:
//
//   { source: "return" | "report" | "digest" | "ledger", role, file, line, lineEnd, severity, text,
//     localId | null, ledgerId | null, reportPath | null }
//
// plus `decisionNeeded: true` and `security: true` only where the source says so. `file` is the
// repo-relative POSIX path (absolute fixture and worktree paths are made relative first); `file`
// and `line` are null where the locator is a gate command or absent.
//
// `matchItems` scores findings against the seeded items by the three §9 rules — the same file, a
// line range intersecting the item's span widened by the tolerance, and one accepted term as a
// case-insensitive substring — with no model call. A location match without a term goes to the
// adjudication list, never to the score. Two REPLAY-v2 scoring rules sit on top (build/363,
// build/364): a severity word governed by a negation is no severity (`maskNegated`), and a term
// found only inside a locator credits nothing. A v1 result stays scored at its pinned instrument
// commit (REPLAY-v1 §13), so these rules never re-score it.
//
// The fence grammar (a backtick fence, at most three spaces of indent, the info string exact) is
// the product's own (`src/runs/layout.ts`, `fenceOpenPattern`), restated here because a contributor
// script cannot import the TypeScript engine.

// ---------- shared grammar ----------

const SEVERITY_BY_LETTER = { C: 'Critical', W: 'Warning', M: 'Minor' }
const SEVERITIES = new Set(Object.values(SEVERITY_BY_LETTER))
const CLOSURE_STATUSES = new Set(['fixed', 'not-fixed', 'regressed', 'rejection-upheld', 'rejection-overturned'])
const SUMMARY_MAX = 300

/** The free-text locator (the unit's contract, verbatim): a path with a code or doc extension, then `:<n>` or `#L<n>`. */
const LOCATOR = /(?<![\w/.-])((?:[\w.-]+\/)*[\w.-]+\.(?:ts|js|mjs|json|md))(?::|#L)(\d+)(?:\s*[-–]\s*(\d+))?/g
// The severity words match in any case and in the plural (`warning`, `WARNING`, `## Warnings`) and are
// normalized to title case — a recorded deviation from the cell's literal `\b(Critical|Warning)\b`,
// because every free-text miss lowers the baseline's recall and so eases the merge gate.
const FINDING_WORD = /\b(critical|warning)s?\b/i
const SEVERITY_WORD = /\b(critical|warning|minor)s?\b/i

// build/363: a severity word governed by a negation is no severity. (a) A severity word, or a run
// of them joined by `or`/`and`/`nor`, after `no`, `zero`, `0`, `none of the` or `without`, with
// `new`, `remaining`, `open` or `further` optionally between; (b) the count form `Critical: 0`
// (`0 Critical` is (a) with the negator `0`). The gaps are spaces and tabs only, never a line
// break, so a mask never reaches across two lines of a return and hides a real finding. A zero
// that is part of a number or a locator (`10`, `1.0`, `x.ts:0`) negates nothing, and neither does
// a severity word that is part of a path (`no critical.ts:3`). Two negations are read only where
// they govern the severity word itself: `none of the` only when the run ends the clause or is
// followed by a place or a remaining-word, with an optional count noun and copula between
// (`None of the Critical findings are left` is masked; `None of the Critical paths are guarded`
// and `None of the Critical findings were fixed` are live Criticals), and the count form only when the `0` ends there too (`Warning: 0-based offset` is a
// live Warning). Every over-mask lowers the baseline's recall alone, so the doubtful case stays live.
const GAP = String.raw`[ \t]+`
const SEVERITY_TOKEN = String.raw`[*_]*(?:critical|warning|minor)s?[*_]*(?![\w/-]|\.\w)`
const NEGATOR = String.raw`(?:\b(?:no|zero|without)|(?<![\w.:/#-])0)`
const MODIFIERS = String.raw`(?:(?:new|remaining|open|further)${GAP})*`
const SEVERITY_RUN = String.raw`${SEVERITY_TOKEN}(?:,?${GAP}(?:or|and|nor)${GAP}${SEVERITY_TOKEN})*`
/** What may follow a negated run or a zero count: a clause end, a closing mark, a dash, or a place or remaining-word. */
const clauseEnd = (words) => String.raw`(?=[ \t]*(?:$|[,;:)|!?*_]|\.(?!\w)|[-–—](?=[ \t]|$)|(?:${words})\b))`
const NEGATED_RUN = new RegExp(String.raw`(${NEGATOR}${GAP}${MODIFIERS})(${SEVERITY_RUN})`, 'gi')
const NONE_OF_THE_RUN = new RegExp(
  String.raw`(\bnone${GAP}of${GAP}the${GAP}${MODIFIERS})(${SEVERITY_RUN})((?:${GAP}(?:findings?|issues?|items?|rows?))?)` +
    clauseEnd(String.raw`at|in|on|across|remain|remains|(?:(?:is|are|was|were)${GAP})?(?:remaining|left|open|found|outstanding)`),
  'gim',
)
const ZERO_COUNT = new RegExp(
  String.raw`\b((?:critical|warning|minor)s?)([*_]*[ \t]*:[*_]*[ \t]*0)(?!\w)${clauseEnd('at|in|on|across|remaining|open|left|found|after|findings?|issues?')}`,
  'gim',
)
const SEVERITY_IN_RUN = /(?:critical|warning|minor)s?/gi
const blank = (word) => ' '.repeat(word.length)

/**
 * `text` with spaces in place of every negated severity word (the rules above). The result has the
 * text's length and every other character, so an index into it (a locator's `at`) is an index into
 * `text`. The readers test severity words on the masked text only; a finding's `text` keeps the
 * original.
 */
export function maskNegated(text) {
  return String(text ?? '')
    .replace(NEGATED_RUN, (_, lead, run) => lead + run.replace(SEVERITY_IN_RUN, blank))
    .replace(NONE_OF_THE_RUN, (_, lead, run, noun) => lead + run.replace(SEVERITY_IN_RUN, blank) + noun)
    .replace(ZERO_COUNT, (_, word, rest) => blank(word) + rest)
}

/** `warning`, `WARNINGS` → `Warning`; a string that is no severity word is returned unchanged. */
function normalizeSeverity(word) {
  const m = String(word).trim().match(/^(critical|warning|minor)s?$/i)
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : word
}

const FENCE_OPEN = /^ {0,3}```([^`]*?)[ \t]*$/
const FENCE_CLOSE = /^ {0,3}```[ \t]*$/
const STRUCTURED_FENCES = new Set(['stamity-findings', 'stamity-closures'])

/** Replace every `<root>/` prefix with nothing, the longest root first so a worktree inside the fixture wins. */
function relativize(text, roots) {
  let out = String(text ?? '')
  const sorted = (roots || []).filter((r) => typeof r === 'string' && r).map((r) => r.replace(/[\\/]+$/, '')).toSorted((a, b) => b.length - a.length)
  for (const root of sorted) out = out.split(`${root}/`).join('')
  return out
}

const normalizeFile = (file) => file.replace(/^(?:\.\/)+/, '')

/**
 * A structured locator (C2's `path:line`, `path:line-line`, or a gate command). Anything that is
 * not a single path token ending in a line number reads as a command: no file, no line. A
 * `path:line:col` locator is off the contract and is refused with a `reason`, never read as the
 * file `path:line`.
 */
function parseLocator(locator, roots) {
  const raw = relativize(String(locator ?? '').trim().replace(/^`+|`+$/g, ''), roots).trim()
  if (/^\S+:\d+:\d+$/.test(raw)) return { file: null, line: null, lineEnd: null, reason: 'locator has a column (path:line:col); expected path:line' }
  const m = raw.match(/^(\S+?)(?::|#L)(\d+)(?:\s*[-–]\s*L?(\d+))?$/)
  if (!m) return { file: null, line: null, lineEnd: null }
  const line = Number(m[2])
  const end = m[3] === undefined ? line : Number(m[3])
  return { file: normalizeFile(m[1]), line: Math.min(line, end), lineEnd: Math.max(line, end) }
}

/** Every distinct free-text locator in a text, in order of first appearance, with `at`, its first index. */
function locatorsIn(text) {
  const seen = new Set()
  const out = []
  for (const m of text.matchAll(LOCATOR)) {
    const line = Number(m[2])
    const end = m[3] === undefined ? line : Number(m[3])
    const loc = { file: normalizeFile(m[1]), line: Math.min(line, end), lineEnd: Math.max(line, end), at: m.index }
    const key = `${loc.file}:${loc.line}:${loc.lineEnd}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push(loc)
    }
  }
  return out
}

function finding(meta, loc, fields) {
  return {
    source: meta.source,
    role: meta.role ?? null,
    file: loc.file,
    line: loc.line,
    lineEnd: loc.lineEnd,
    severity: fields.severity ?? null,
    text: fields.text ?? '',
    localId: fields.localId ?? null,
    ledgerId: fields.ledgerId ?? null,
    reportPath: fields.reportPath ?? null,
    ...(fields.decisionNeeded === true ? { decisionNeeded: true } : {}),
    ...(fields.security === true ? { security: true } : {}),
  }
}

/**
 * The JSON lines of every fence whose info string is exactly `info`, each with its 1-based line
 * number in `text`. An unclosed fence runs to the end of the text and is reported as an error.
 */
function fencedLines(text, info) {
  const lines = String(text ?? '').split(/\r?\n/)
  const rows = []
  const errors = []
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(FENCE_OPEN)
    if (!open) continue
    const isTarget = open[1].trim() === info
    let j = i + 1
    while (j < lines.length && !FENCE_CLOSE.test(lines[j])) {
      if (isTarget && lines[j].trim() !== '') rows.push({ line: j + 1, text: lines[j] })
      j++
    }
    if (isTarget && j >= lines.length) errors.push({ line: i + 1, text: lines[i], reason: `unclosed ${info} fence` })
    i = j
  }
  return { rows, errors }
}

function parseJsonObject(raw) {
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value) ? { value } : { reason: 'not a JSON object' }
  } catch (error) {
    return { reason: `not JSON (${error instanceof Error ? error.message : String(error)})` }
  }
}

// ---------- free text (the baseline) ----------

const HEADING = /^ {0,3}#{1,6}(?:\s|$)/
const TABLE_ROW = /^\s*\|/
const LIST_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+/
const indentOf = (line) => line.match(/^\s*/)[0].length

/**
 * The text split into sections (a heading and the lines below it up to the next heading; the lines
 * before the first heading form a section with no heading) and, inside each, leaf blocks: a table
 * row, a list item with its indented continuation, a paragraph, or a fence other than the two
 * structured ones (those belong to `parseFindingsBlock` and `parseClosures`, and are dropped).
 */
function sectionsOf(text) {
  const lines = text.split(/\r?\n/)
  const sections = [{ head: null, leaves: [] }]
  let current = sections[0]
  let paragraph = null
  const endParagraph = () => {
    if (paragraph) current.leaves.push(paragraph.join('\n'))
    paragraph = null
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.match(FENCE_OPEN)
    if (fence) {
      endParagraph()
      let j = i + 1
      while (j < lines.length && !FENCE_CLOSE.test(lines[j])) j++
      if (!STRUCTURED_FENCES.has(fence[1].trim())) current.leaves.push(lines.slice(i, j + 1).join('\n'))
      i = j
    } else if (line.trim() === '') {
      endParagraph()
    } else if (HEADING.test(line)) {
      endParagraph()
      current = { head: line, leaves: [] }
      sections.push(current)
    } else if (TABLE_ROW.test(line)) {
      endParagraph()
      current.leaves.push(line)
    } else if (LIST_ITEM.test(line)) {
      endParagraph()
      const indent = indentOf(line)
      const item = [line]
      while (
        i + 1 < lines.length &&
        lines[i + 1].trim() !== '' &&
        indentOf(lines[i + 1]) > indent &&
        !LIST_ITEM.test(lines[i + 1]) &&
        !TABLE_ROW.test(lines[i + 1]) &&
        !HEADING.test(lines[i + 1]) &&
        !FENCE_OPEN.test(lines[i + 1])
      ) item.push(lines[++i])
      current.leaves.push(item.join('\n'))
    } else {
      if (!paragraph) paragraph = []
      paragraph.push(line)
    }
  }
  endParagraph()
  return sections
}

/**
 * One Finding per distinct locator of a block that holds `Critical` or `Warning`. Its severity is
 * the block's first severity word, or, with `nearest` (the folded section read), the nearest
 * severity word before the locator, falling back to the block's first when none precedes it.
 */
function blockFindings(block, meta, { nearest = false } = {}) {
  // build/363: the severity words are read from the masked block, which keeps the block's indices.
  const live = maskNegated(block)
  if (!FINDING_WORD.test(live)) return []
  const words = [...live.matchAll(new RegExp(SEVERITY_WORD.source, 'gi'))]
  const first = normalizeSeverity(words[0][1])
  return locatorsIn(block).map((loc) => {
    const before = nearest ? words.findLast((w) => w.index < loc.at) : undefined
    const severity = before ? normalizeSeverity(before[1]) : first
    return finding(meta, loc, { severity, text: block, reportPath: meta.reportPath })
  })
}

const hasLocator = (block) => locatorsIn(block).length > 0

/**
 * The free-text read shared by `extractFreeText` and `unreadFreeText`. A leaf holding both a
 * severity word and a locator classifies itself. Every other leaf folds into its section block —
 * the heading line (if any) plus the folded leaves — so a finding split over sibling leaves
 * (`Severity: Warning` and `Locator: src/x.ts:9` as two paragraphs or two list items) is read as
 * one. In that folded block each locator takes the nearest severity word before it (the block's
 * first when none precedes it), so a split Minor after a Warning stays Minor and a Minor, or prose
 * `minor`, before a split Warning does not demote it; on a block with one finding this is the
 * block's first word, as before. Accepted residual: a severity word in a summary sentence
 * followed by a bare locator leaf (`one Warning below`, then `- src/other.ts:8 — fine`) reads as a
 * Warning at that locator — a visible finding, never a silent one.
 * A section block that is no finding is unread when it holds a Critical or Warning word but
 * no locator, or a locator but no severity word; a heading left alone because its every leaf
 * classified itself is a summary line, not an unread block.
 */
function readFreeText(text, meta) {
  const m = { ...meta, source: meta.source ?? 'return' }
  const findings = []
  const unread = []
  for (const section of sectionsOf(relativize(text, meta.roots))) {
    const folded = []
    let classified = 0
    for (const leaf of section.leaves) {
      if (SEVERITY_WORD.test(maskNegated(leaf)) && hasLocator(leaf)) {
        findings.push(...blockFindings(leaf, m))
        classified++
      } else folded.push(leaf)
    }
    if (folded.length === 0 && (section.head === null || classified > 0)) continue
    const block = (section.head === null ? folded : [section.head, ...folded]).join('\n')
    const read = blockFindings(block, m, { nearest: true })
    const live = maskNegated(block)
    if (read.length > 0) findings.push(...read)
    else if (FINDING_WORD.test(live) && !hasLocator(block)) unread.push({ block, reason: 'severity-without-locator' })
    else if (hasLocator(block) && !SEVERITY_WORD.test(live)) unread.push({ block, reason: 'locator-without-severity' })
  }
  return { findings, unread }
}

/**
 * Findings in a free-text return (the baseline shape). A block is a finding iff it holds
 * `Critical` or `Warning` and at least one locator; one Finding per distinct locator, with the
 * block's first severity word (`Critical`, `Warning` or `Minor`) and the block as its text.
 *
 * Severity words match in any case and in the plural, and are normalized to title case.
 *
 * Leaf blocks are read first. A leaf holding a severity word and a locator classifies itself, so a
 * `Minor` row is never promoted by a sibling's word. Every other leaf folds into its section block
 * — the heading line (if any) plus the folded leaves — which is then read as one block, so
 * `## Critical` over a bare list item still yields a Critical finding, and `Severity: Warning` and
 * `Locator: src/x.ts:9` split over sibling paragraphs or list items are one finding. A path with no
 * line (a directory, a bare file) is no locator and yields nothing, counted neither as a finding
 * nor as unmatched; `unreadFreeText` names such blocks.
 *
 * meta: `{ source = "return", role, roots: absolute fixture and worktree roots to strip, reportPath }`.
 */
export function extractFreeText(text, meta = {}) {
  return readFreeText(text, meta).findings
}

/**
 * The free-text section blocks `extractFreeText` read as no finding although they look like one:
 * `[{ block, reason }]`, reason `severity-without-locator` (a Critical or Warning word, no
 * readable locator — `query.ts line 12`, a directory) or `locator-without-severity` (a locator, no
 * severity word). The measurement reports them per shape so the heuristic's skips stay visible.
 * meta: as `extractFreeText`.
 */
export function unreadFreeText(text, meta = {}) {
  return readFreeText(text, meta).unread
}

// ---------- the C2 findings block ----------

function checkFindingRow(row) {
  const id = typeof row.id === 'string' ? row.id.match(/^([CWM])-(\d+)$/) : null
  if (!id) return 'id is not C-<n>, W-<n> or M-<n>'
  if (!SEVERITIES.has(row.severity)) return 'severity is not Critical, Warning or Minor'
  if (SEVERITY_BY_LETTER[id[1]] !== row.severity) return `id letter ${id[1]} does not match severity ${row.severity}`
  if (typeof row.locator !== 'string' || !row.locator.trim()) return 'locator is missing'
  if (typeof row.summary !== 'string' || !row.summary.trim()) return 'summary is missing'
  if (/[\r\n]/.test(row.summary)) return 'summary is not one line'
  if (row.summary.length > SUMMARY_MAX) return `summary is over ${SUMMARY_MAX} characters`
  for (const key of ['decision_needed', 'security']) {
    if (row[key] !== undefined && typeof row[key] !== 'boolean') return `${key} is not a boolean`
  }
  return null
}

/**
 * The C2 rows of every `stamity-findings` fence in `text`. A malformed line goes to `errors` as
 * `{ line, text, reason }` (its 1-based line number in `text`) and is skipped; keys beyond C2's
 * are tolerated. meta: `{ source = "report", role, roots, reportPath }`.
 */
export function parseFindingsBlock(text, meta = {}) {
  const m = { ...meta, source: meta.source ?? 'report' }
  const { rows, errors } = fencedLines(text, 'stamity-findings')
  const findings = []
  for (const { line, text: raw } of rows) {
    const parsed = parseJsonObject(raw)
    const reason = parsed.reason ?? checkFindingRow(parsed.value)
    if (reason) {
      errors.push({ line, text: raw, reason })
      continue
    }
    const row = parsed.value
    const loc = parseLocator(row.locator, meta.roots)
    if (loc.reason) {
      errors.push({ line, text: raw, reason: loc.reason })
      continue
    }
    findings.push(finding(m, loc, {
      severity: row.severity,
      text: row.summary,
      localId: row.id,
      reportPath: meta.reportPath,
      decisionNeeded: row.decision_needed,
      security: row.security,
    }))
  }
  return { findings, errors: errors.toSorted((a, b) => a.line - b.line) }
}

// ---------- the C4 digest ----------

const DIGEST_LABELS = ['status', 'verdict', 'confidence', 'mode', 'report', 'findings', 'security', 'contract delta']
const DIGEST_LABEL = new RegExp(`^\\s*(?:[-*]\\s+)?\\**\\s*(${DIGEST_LABELS.join('|')})\\s*\\**\\s*:\\s*\\**\\s*(.*?)\\s*$`, 'i')
const stripTicks = (value) => value.replace(/^`+|`+$/g, '').trim()

/**
 * The labelled lines of a digest: the first occurrence of each label wins, and a label's value runs
 * on over the following lines until a blank line or the next label.
 */
function digestFields(text) {
  const fields = {}
  let current = null
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const label = line.match(DIGEST_LABEL)
    if (label) {
      const key = label[1].toLowerCase()
      current = key in fields ? null : key
      if (current) fields[current] = [label[2]]
    } else if (line.trim() === '') current = null
    else if (current) fields[current].push(line.trim())
  }
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.join('\n').trim()]))
}

/**
 * An entry id starts an entry only at the start of the value, a line, or after a separator. The id
 * may be bold and may carry a colon: `C-1`, `**C-1**`, `C-1:`, `**C-1:**`, `**C-1**:`.
 */
const ENTRY_ID = /(?<![\w*-])\**([CWM])-(\d+)\**:?\**(?=\s)/g
const ENTRY_LEAD = /(?:^|[;,·(|:]|^\s*(?:[-*]\s+)?)\s*$/

/**
 * The entries of a digest's `findings:` value: `<id> <locator> — <summary>` for Critical and
 * Warning, `<id> <locator>` for the Minors it lists. The locator is the text between the id and
 * the first spaced dash (a gate command may hold spaces), or the first token when there is none;
 * the summary runs to the end of its line.
 */
function digestEntries(value) {
  const starts = []
  for (const m of value.matchAll(ENTRY_ID)) {
    const before = value.slice(0, m.index)
    const lineStart = before.lastIndexOf('\n') + 1
    if (ENTRY_LEAD.test(before.slice(lineStart))) starts.push(m)
  }
  return starts.map((m, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].index : value.length
    const body = value.slice(m.index + m[0].length, end).split('\n')[0].trim()
    const dash = body.match(/\s[—–-]\s/)
    const locator = (dash ? body.slice(0, dash.index) : body.split(/\s/)[0]).replace(/[;,·|()]+$/, '')
    const summary = dash ? body.slice(dash.index + dash[0].length).replace(/[\s;,·|(]+$/, '').trim() : ''
    return { localId: `${m[1]}-${m[2]}`, severity: SEVERITY_BY_LETTER[m[1]], locator, summary }
  })
}

/**
 * A C4 digest in either shape: the reviewer's (`verdict:`, `confidence:`) or a lens's (`mode:`
 * posted or advisory, with the posted count). An absent label reads null; `findings: none` reads
 * as no findings. meta: `{ source = "digest", role, roots }`; each finding carries the digest's
 * `report:` path. `errors` (`[{ text, reason }]`) names a `findings:` value other than `none` that
 * yields no entry, and an entry whose locator is refused (`path:line:col`), which is skipped.
 */
export function parseDigest(text, meta = {}) {
  const m = { ...meta, source: meta.source ?? 'digest' }
  const f = digestFields(relativize(text, meta.roots))
  const verdict = f.verdict?.match(/\b(approve|request-changes|blocked)\b/i)
  const mode = f.mode?.match(/\b(posted|advisory)\b/i)
  const posted = f.mode?.match(/\d+/)
  const report = f.report !== undefined ? stripTicks(f.report) || null : null
  const errors = []
  const entries = digestEntries(f.findings ?? '')
  if (f.findings !== undefined && entries.length === 0 && !/^\W*none\W*$/i.test(f.findings)) {
    errors.push({ text: f.findings, reason: 'findings value is not none and holds no <id> <locator> entry' })
  }
  const findings = []
  for (const entry of entries) {
    const loc = parseLocator(entry.locator, meta.roots)
    if (loc.reason) {
      errors.push({ text: `${entry.localId} ${entry.locator}`, reason: loc.reason })
      continue
    }
    findings.push(finding(m, loc, { severity: entry.severity, text: entry.summary, localId: entry.localId, reportPath: report }))
  }
  return {
    status: f.status !== undefined ? stripTicks(f.status) : null,
    verdict: verdict ? verdict[1].toLowerCase() : null,
    confidence: f.confidence ?? null,
    mode: mode ? mode[1].toLowerCase() : null,
    posted: posted ? Number(posted[0]) : null,
    report,
    findings,
    security: f.security ?? null,
    errors,
  }
}

// ---------- the C9 closures block ----------

/**
 * The C9 rows of every `stamity-closures` fence: `{ ledgerId, status, rationale | null }`. Keys
 * beyond `ledger_id`, `status` and `rationale` are tolerated; a malformed line goes to `errors`
 * as `{ line, text, reason }` and is skipped.
 */
export function parseClosures(text) {
  const { rows, errors } = fencedLines(text, 'stamity-closures')
  const closures = []
  for (const { line, text: raw } of rows) {
    const parsed = parseJsonObject(raw)
    let reason = parsed.reason ?? null
    const row = parsed.value
    if (!reason && (typeof row.ledger_id !== 'string' || !row.ledger_id.trim())) reason = 'ledger_id is missing'
    if (!reason && !CLOSURE_STATUSES.has(row.status)) reason = `status is not one of ${[...CLOSURE_STATUSES].join(', ')}`
    if (!reason && row.rationale !== undefined && typeof row.rationale !== 'string') reason = 'rationale is not a string'
    if (reason) {
      errors.push({ line, text: raw, reason })
      continue
    }
    closures.push({ ledgerId: row.ledger_id, status: row.status, rationale: row.rationale ?? null })
  }
  return { closures, errors: errors.toSorted((a, b) => a.line - b.line) }
}

// ---------- the C3 ledger rows ----------

/**
 * Findings from ledger rows (C3). The locator is the evidence up to ` — `, the text what follows.
 * Where the evidence has no ` — ` or its head is no `path:line`, the free-text locators in the
 * evidence are read instead (one Finding each, the evidence as text; a `path:line:col` head reads
 * there as file `path`, line `line`, the same reading the free-text shape gives); a row with no locator at all
 * still yields one Finding with a null file, so a `report` comparison can find it. The role is the
 * row's `source`; `report` and `decision_needed` are carried when present, and a severity word is
 * title-cased (`warning` → `Warning`) so the matcher's severities filter reads it.
 * opts: `{ roots }`.
 */
export function ledgerFindings(rows, opts = {}) {
  const meta = { source: 'ledger' }
  const out = []
  for (const row of rows || []) {
    if (!row || typeof row !== 'object') continue
    const evidence = relativize(String(row.evidence ?? ''), opts.roots)
    const fields = {
      severity: typeof row.severity === 'string' ? normalizeSeverity(row.severity) : null,
      ledgerId: typeof row.id === 'string' ? row.id : null,
      reportPath: typeof row.report === 'string' ? row.report : null,
      decisionNeeded: row.decision_needed,
    }
    const rowMeta = { ...meta, role: typeof row.source === 'string' ? row.source : null }
    const cut = evidence.indexOf(' — ')
    const head = cut >= 0 ? parseLocator(evidence.slice(0, cut)) : null
    if (head && head.file !== null) {
      out.push(finding(rowMeta, head, { ...fields, text: evidence.slice(cut + 3).trim() }))
      continue
    }
    const locs = locatorsIn(evidence)
    if (locs.length === 0) locs.push({ file: null, line: null, lineEnd: null })
    for (const loc of locs) out.push(finding(rowMeta, loc, { ...fields, text: evidence }))
  }
  return out
}

// ---------- verdicts ----------

/**
 * The verdict word of a return in either shape (`**Verdict:** request-changes`, `verdict: approve`,
 * `**Verdict:** blocked`), or null — the same three words the digest's `verdict:` label reads.
 */
export function verdictOf(text) {
  const m = String(text ?? '').match(/verdict[:*\s]*\**\s*(approve|request-changes|blocked)\b/i)
  return m ? m[1].toLowerCase() : null
}

// ---------- the matcher ----------

/**
 * The spans an item is matched against. `spansByFile[file]` may relocate an item in the reviewed
 * tree, either as an object keyed by item id (a `[start, end]` span, or a list of spans when the
 * item has several copies) or as a list of `{ id, span }` rows; with no entry, the item's own
 * `span` is used.
 */
function spansOf(item, spansByFile) {
  const perFile = spansByFile?.[item.file]
  let entry
  if (Array.isArray(perFile)) entry = perFile.find((row) => row?.id === item.id)?.span
  else if (perFile && Object.hasOwn(perFile, item.id)) entry = perFile[item.id]
  if (entry === undefined) entry = item.span
  if (!Array.isArray(entry) || entry.length === 0) return []
  return Array.isArray(entry[0]) ? entry : [entry]
}

/** A prose line reference (`line 20`, `lines 20-21`): a location, never a term's evidence. */
const LINE_REF = /\blines?[ \t]+\d+(?:[ \t]*[-–][ \t]*\d+)?/gi
/**
 * A path outside `LOCATOR`'s shape: a slashed path ending in any extension, or a bare file name with
 * a code or doc extension, either with an optional line. A slash without an extension (`try/catch`)
 * is no path.
 */
const PATH_TOKEN = /(?<![\w/.-])(?:(?:[\w.-]+\/)+[\w.-]*\.[a-z][a-z0-9]*|[\w-][\w.-]*\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|ya?ml|toml|py|go|rs|java|rb|sh|css|html))(?![\w/])(?:(?::|#L)\d+(?:\s*[-–]\s*\d+)?)?/gi

/**
 * Whether an accepted term occurs in a finding's text (both lower-cased, the locators already
 * blanked): a case-insensitive substring, except that an all-digit term matches only as a number
 * of its own (build/364: `20` is not read in `220`, `20ms`, `1.20` or `:20`).
 */
function termIn(text, term) {
  if (!/^\d+$/.test(term)) return text.includes(term)
  return new RegExp(String.raw`(?<![\w.:])${term}(?!\w)`).test(text)
}

/**
 * Score findings against seeds and decoys (REPLAY-v1 §9, with REPLAY-v2's locator rule). A finding
 * matches an item when the file is equal, its line range intersects a span of the item widened by
 * `tolerance`, and one of the item's terms occurs in its text (`termIn`) once every free-text
 * locator and prose line reference in that text is blanked (build/364: a term inside a locator's
 * path or line credits nothing), and, for a term with no slash, every other path too. A location match without a term goes to `adjudication` only. One finding may match
 * several items. A finding with no file or line is skipped, and so is one whose severity is
 * outside `severities` when that list is given.
 *
 * Returns `{ matched: { <item id>: findingIdx[] } (every item listed), adjudication: [{ id, findingIdx }] }`.
 */
export function matchItems(findings, items, spansByFile = {}, { tolerance = 3, severities = null } = {}) {
  const matched = Object.fromEntries(items.map((item) => [item.id, []]))
  const adjudication = []
  findings.forEach((f, findingIdx) => {
    if (!f || f.file == null || f.line == null) return
    if (severities && !severities.includes(f.severity)) return
    const lo = f.line
    const hi = f.lineEnd ?? f.line
    // A term that is itself a path fragment (`docs/api`, `../`) is read with the paths kept; every
    // other term is read with every path blanked too, so a word inside a path credits nothing.
    const located = String(f.text ?? '').replace(LOCATOR, ' ').replace(LINE_REF, ' ').toLowerCase()
    const prose = located.replace(PATH_TOKEN, ' ')
    for (const item of items) {
      if (item.file !== f.file) continue
      if (!spansOf(item, spansByFile).some(([start, end]) => lo <= end + tolerance && hi >= start - tolerance)) continue
      const hit = (item.terms || []).some((term) => {
        const t = String(term).toLowerCase()
        return termIn(t.includes('/') ? located : prose, t)
      })
      if (hit) matched[item.id].push(findingIdx)
      else adjudication.push({ id: item.id, findingIdx })
    }
  })
  return { matched, adjudication }
}
