// The replay's attribution walk: every payload that enters an orchestrator's MAIN context, sorted
// into a class with its character count, plus the request, delivery, dispatch, shell and
// compaction rows the per-run measurement (`scripts/replay/measure.mjs`) reads.
//
// A port of the package's measurement method — the research walk that sized the orchestrator's
// context economy before any of it was built — with its counting rules unchanged, so the replay's
// numbers stay comparable with the numbers that motivated it:
//
//   * chars = JavaScript string length (UTF-16 code units) of the text that reaches the model.
//   * user string / text blocks: the text. tool_result: its text content (string, or the text
//     blocks of an array; images count 0 and are tallied). attachment: the `rendered[].content`
//     text only — an attachment with no `rendered` field is not sent to the model and is skipped
//     (tallied in `skipped.attachmentNoRendered`).
//   * assistant: text blocks = prose; thinking blocks = thinking (the transcript stores thinking
//     text empty, so the thinking cost is read from the request's
//     `usage.output_tokens_details.thinking_tokens`); tool_use = the sum of key lengths plus
//     leaf-string lengths of `input` (raw text, no JSON escaping).
//   * not counted: system rows other than `compact_boundary` (UI only), bookkeeping entry types,
//     synthetic API-error assistant stubs (`isApiErrorMessage`; tallied apart and written as
//     `excluded.apiError`), sidechain rows, unparseable lines (`skipped.entryTypes.PARSE_ERROR`).
//   * seg = compaction segment (0 before the first `compact_boundary`). turn = index of the
//     orchestrator API request (deduplicated by `message.id`) that the payload precedes (inbound)
//     or belongs to (outbound).
//
// One departure from the research walk, on purpose: its target tags named the private record
// layer's paths, and this file is public; the replay's fixture has no such layer, and a read
// outside the fixture is the measurement's `--forbid` check, not a tag.
//
// Pure functions over lines; the one file reader streams with readline, because a single
// transcript line can be megabytes.

import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'

// ---------- helpers ----------

const leafChars = (v) => (typeof v === 'string' ? v.length : v == null ? 0 : typeof v !== 'object' ? String(v).length
  : Array.isArray(v) ? v.reduce((a, x) => a + leafChars(x), 0) : Object.entries(v).reduce((a, [k, x]) => a + k.length + leafChars(x), 0))

const blockText = (c) => {
  if (typeof c === 'string') return { text: c, images: 0 }
  if (!Array.isArray(c)) return { text: c == null ? '' : JSON.stringify(c), images: 0 }
  let text = ''
  let images = 0
  for (const b of c) {
    if (b.type === 'text') text += (text ? '\n' : '') + (b.text || '')
    else if (b.type === 'image') images++
    else if (b.type === 'tool_reference') text += (text ? '\n' : '') + (b.tool_name || '')
    else text += (text ? '\n' : '') + JSON.stringify(b)
  }
  return { text, images }
}

const renderedText = (r) => (Array.isArray(r) ? r.map((x) => (typeof x?.content === 'string' ? x.content : blockText(x?.content).text)).join('\n') : '')

/** JSON.parse, or `undefined` for a line that is not JSON. Anything but a syntax error is rethrown. */
function parseLine(line) {
  try {
    return JSON.parse(line)
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

// ---------- shell ----------

// Heredoc bodies inside a Bash command: the cat/tee redirection target, and the body's characters.
const HEREDOC = /(?:(cat|tee)\s*(?:-a\s*)?(>>?)?\s*("?[^\s"<>|;&()]+"?)?\s*)?<<-?\s*['"]?(\w+)['"]?[^\n]*\n([\s\S]*?)\n\s*\4(?=\n|$|\s|\)|;|&|\|)/g

/** Every heredoc in `cmd`: `{ tool: 'cat'|'tee'|'', target, chars }`, with `chars` the body's length. */
export function heredocs(cmd) {
  const res = []
  let m
  HEREDOC.lastIndex = 0
  while ((m = HEREDOC.exec(cmd))) res.push({ tool: m[1] || '', target: (m[3] || '').replace(/"/g, ''), chars: m[5].length })
  return res
}

/** Every heredoc match in `cmd`, with its body — the ledger detector needs the text, not only the size. */
function heredocMatches(cmd) {
  const res = []
  let m
  HEREDOC.lastIndex = 0
  while ((m = HEREDOC.exec(cmd))) res.push({ target: (m[3] || '').replace(/"/g, ''), body: m[5] })
  return res
}

function stripHeredocs(cmd) {
  HEREDOC.lastIndex = 0
  return cmd.replace(HEREDOC, (s, a, b, c) => (a ? `${a} ${b || ''} ${c || ''}` : ''))
}

const READ = new Set(['cat', 'sed', 'head', 'tail', 'nl', 'less', 'more', 'bat', 'awk', 'jq', 'fold', 'cut', 'strings', 'xxd', 'od', 'column', 'diff', 'cmp', 'yq'])
const SEARCH = new Set(['grep', 'rg', 'ugrep', 'egrep', 'fgrep', 'find', 'ls', 'fd', 'tree', 'du', 'stat', 'file'])
const NEUTRAL = new Set(['cd', 'echo', 'printf', 'export', 'set', 'true', 'false', ':', 'sleep', 'test', '[', '[[', 'for', 'while', 'do', 'done', 'if', 'then', 'else', 'elif', 'fi', 'wc', 'sort', 'uniq', 'tr', 'date', 'pwd', 'which', 'basename', 'dirname', 'realpath', 'local', 'unset', 'shopt', 'case', 'esac', 'in', '{', '}', '(', ')', 'xargs', 'tee', 'command', 'type', 'readlink', 'env', 'time', 'timeout'])
const SKIP_KW = new Set(['do', 'then', 'else', 'if', 'while', 'until', '!', 'time', 'command', '{', '(', 'elif'])

/**
 * A Bash command's output class, from the HEAD verb of each top-level segment (split on newline,
 * `;`, `&&`, `||`); pipe stages after the head are filters and never decide the class.
 *   read    every head is a read verb or neutral, at least one read verb (cat/sed -n/head/tail/awk/jq, git show)
 *   search  every head is a search verb or neutral, at least one (grep/rg/find/ls, git grep/ls-files)
 *   rs      read + search verbs only
 *   write   only cat>/cat>>/tee redirections (heredoc writes), no other verb
 *   mixed   read/search verbs together with any other verb (git/gh/npm/node/...) in one call
 *   other   no read/search verb at all (state inspection, gates, git/gh, scripts)
 */
export function bashClass(cmd) {
  const s = stripHeredocs(cmd)
  const segs = s.split(/\n|;|&&|\|\|/).map((x) => x.trim()).filter(Boolean)
  let read = false
  let search = false
  let other = false
  let write = false
  const heads = []
  for (const seg of segs) {
    const head = seg.split(/(?<!\|)\|(?!\|)/)[0].trim().replace(/^[({\s]+/, '')
    const toks = head.split(/\s+/)
    let i = 0
    for (;;) {
      while (i < toks.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i])) i++
      if (i < toks.length && SKIP_KW.has(toks[i])) { i++; continue }
      break
    }
    let v = (toks[i] || '').replace(/^\$\(/, '').replace(/^["'`]/, '')
    if (!v || v.startsWith('#')) continue
    v = v.split('/').pop()
    heads.push(v)
    if (v === 'git') {
      const sub = toks[i + 1] || ''
      if (sub === 'grep' || sub === 'ls-files') search = true
      else if (sub === 'show' || sub === 'cat-file') read = true
      else other = true
      continue
    }
    if ((v === 'cat' || v === 'tee') && /(^|\s)>>?\s*\S|tee\s+(-a\s+)?\S/.test(head)) { write = true; continue }
    if (READ.has(v)) { if (v === 'sed' && /\s-i/.test(head)) other = true; else read = true; continue }
    if (SEARCH.has(v)) { search = true; continue }
    if (NEUTRAL.has(v) || v === 'done' || v === 'fi' || v === 'esac') continue
    other = true
  }
  let cls
  if (other) cls = read || search ? 'mixed' : 'other'
  else if (read && search) cls = 'rs'
  else if (read) cls = 'read'
  else if (search) cls = 'search'
  else if (write) cls = 'write'
  else cls = 'other'
  return { cls, heads: heads.slice(0, 8) }
}

const targetTags = (text) => {
  const t = []
  if (/ledger\.jsonl/.test(text)) t.push('ledger')
  if (/record\.md/.test(text)) t.push('record')
  if (/inbox\.md/.test(text)) t.push('inbox')
  if (/qa-session/.test(text)) t.push('qa')
  if (/\/briefs?\//.test(text) || /brief[-\w]*\.md/.test(text)) t.push('brief')
  if (/git commit/.test(text)) t.push('commit')
  if (/\/tasks\/[a-z0-9]+\.output/.test(text)) t.push('taskOutput')
  return t
}

// ---------- ledger writes ----------

/** The file a heredoc's target names, by basename; only the ledger class matters to the replay. */
const heredocTarget = (p) => {
  const b = p.split('/').pop() || ''
  return /ledger/.test(b) ? 'ledger' : /record/.test(b) ? 'record' : /inbox/.test(b) ? 'inbox' : /qa-session|^qa-/.test(b) ? 'qa'
    : /\/briefs?\/|brief[-\w]*\.md|\/lanes\//.test(p) ? 'brief' : /memory\//.test(p) ? 'memory' : null
}

/** The changed shape's one ledger writer, in the three spellings an orchestrator types. */
const LEDGER_VERB = /(?:^|[\s;&(])(?:npx\s+(?:--yes\s+)?)?(?:@zomarit\/stamity|stamity|st)\s+ledger\s+(?:append|close|status)\b/

/**
 * Whether a tool_use writes the findings ledger, and how many typed characters the write carries.
 *
 *   verb       the ledger verb (`stamity ledger append|close|status`, any of its spellings): the
 *              whole command, a `--stdin` heredoc included
 *   heredoc    a heredoc whose cat/tee target is a ledger file, or whose unredirected body appends
 *              ledger rows (a `phase` key and a phase-local id) or opens `ledger.jsonl` from code
 *              (a python or node body): the ledger bodies' characters
 *   echo       a heredoc-free command redirecting into `ledger.jsonl`, or typing a `"phase"` row
 *              beside it: the command's characters
 *   writeEdit  a Write, Edit or MultiEdit whose path ends `ledger.jsonl`: the written text
 *
 * `null` for every other call.
 */
export function ledgerWrite(toolUse) {
  const name = toolUse?.name
  const input = toolUse?.input || {}
  if (name === 'Write' || name === 'Edit' || name === 'MultiEdit') {
    if (!(input.file_path || '').endsWith('ledger.jsonl')) return null
    const edits = Array.isArray(input.edits) ? input.edits.reduce((a, e) => a + (e?.new_string || '').length, 0) : 0
    return { kind: 'writeEdit', chars: (input.content || '').length + (input.new_string || '').length + edits }
  }
  if (name !== 'Bash') return null
  const cmd = input.command || ''
  if (LEDGER_VERB.test(cmd)) return { kind: 'verb', chars: cmd.length }
  const docs = heredocMatches(cmd)
  let chars = 0
  let found = false
  for (const { target, body } of docs) {
    let tg = heredocTarget(target)
    if (!tg && /ledger/.test(cmd) && /["']?phase["']?\s*[:=]/.test(body) && /(?:prove|build|review|plan|qa)\/\d+/.test(body)) tg = 'ledger'
    if (!tg && /ledger\.jsonl/.test(body) && /\bopen\(|(?:write|append)FileSync\(/.test(body)) tg = 'ledger'
    if (tg === 'ledger') { found = true; chars += body.length }
  }
  if (found) return { kind: 'heredoc', chars }
  if (docs.length === 0 && /ledger\.jsonl/.test(cmd) && (/>>\s*\S*ledger\.jsonl/.test(cmd) || /"phase"/.test(cmd))) return { kind: 'echo', chars: cmd.length }
  return null
}

// ---------- roles ----------

const VERDICT_ROLES = new Set(['reviewer', 'security', 'performance', 'design-quality'])

/**
 * The loop function of a sub-agent, from its `subagent_type` alone: build, fix, verdict, gate or
 * other. The replay's fixture has a fixed roster, so the role is enough; a namespace
 * (`plugin:role`) and the `stamity-` prefix are dropped first.
 */
export function roleFunction(subagentType) {
  const role = String(subagentType ?? '').split(':').pop().replace(/^stamity-/, '')
  if (role === 'implementer') return 'build'
  if (role === 'fixer') return 'fix'
  if (VERDICT_ROLES.has(role)) return 'verdict'
  if (role === 'test-runner') return 'gate'
  return 'other'
}

// ---------- task notifications ----------

const pick = (t, tag) => {
  const m = t.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'))
  return m ? m[1] : null
}

function splitNotifications(text) {
  const parts = []
  const re = /<task-notification>[\s\S]*?<\/task-notification>/g
  let m
  let covered = 0
  while ((m = re.exec(text))) {
    const p = m[0]
    covered += p.length
    const summary = pick(p, 'summary') || ''
    const status = pick(p, 'status')
    const result = pick(p, 'result')
    const usage = pick(p, 'usage') || ''
    let kind = 'agent'
    if (summary.startsWith('Background command')) kind = 'bgCommand'
    else if (summary.startsWith('Monitor event') || (/Monitor/.test(summary) && !summary.startsWith('Agent'))) kind = 'monitor'
    else if (!summary.startsWith('Agent ')) kind = 'otherTask'
    parts.push({
      kind, chars: p.length, taskId: pick(p, 'task-id'), toolUseId: pick(p, 'tool-use-id'), status, summary: summary.slice(0, 200),
      resultChars: result == null ? null : result.length, result,
      subagentTokens: +((usage.match(/<subagent_tokens>(\d+)/) || [])[1] || 0) || null,
      toolUses: +((usage.match(/<tool_uses>(\d+)/) || [])[1] || 0) || null,
      durationMs: +((usage.match(/<duration_ms>(\d+)/) || [])[1] || 0) || null,
    })
  }
  return { parts, wrapperChars: text.length - covered }
}

function toolResultClass(name, meta, text) {
  if (/^PreToolUse:|^PostToolUse:|hook error: Blocked by|^Hook /.test(text)) return ['hook', 'tool-result-hook-message']
  switch (name) {
    case 'Agent': case 'Task':
      return text.startsWith('Async agent launched') ? ['returns.launchAck', 'agent-launch'] : ['returns.report', 'sync-agent-result']
    case 'SendMessage': return text.length > 1500 ? ['returns.report', 'sendmessage-result'] : ['returns.sendAck', 'sendmessage-ack']
    case 'TaskOutput': return ['returns.report', 'taskoutput']
    case 'Bash': {
      const c = meta ? meta.bashCls : 'other'
      if (text.startsWith('Command running in background')) return ['shell.other', 'bg-launch']
      return c === 'read' || c === 'rs' ? ['file.read', 'bash-' + c] : c === 'search' ? ['search', 'bash-search'] : ['shell.other', 'bash-' + c]
    }
    case 'Read': return ['file.read', 'Read']
    case 'Grep': case 'Glob': return ['search', name]
    case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit': return ['other.in', 'write-ack']
    case 'Skill': return ['injected.skillBody', 'skill-launch-ack']
    case 'ToolSearch': return ['injected.listings', 'toolsearch']
    case 'AskUserQuestion': return ['operator', 'askuserquestion']
    case 'Monitor': case 'TaskStop': case 'BashOutput': case 'KillShell': return ['shell.other', name]
    default: return ['other.in', name || 'unknown-tool']
  }
}

// ---------- the walk ----------

const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n }

/** A stateful walker: feed it every line in order, then read `finish()`. */
function createWalker() {
  const rows = { events: [], requests: [], deliveries: [], dispatches: [], bash: [], compactions: [] }
  const w = (k, o) => rows[k].push(o)
  let lineNo = 0
  let seg = 0
  let turn = 0
  const toolMeta = new Map() // tool_use id -> {name, bashCls, line, desc, skill}
  const requests = new Map() // message.id -> request row
  const skipped = { attachmentNoRendered: {}, entryTypes: {}, apiErrorStubs: 0, apiErrorChars: 0, sidechain: 0, images: 0 }
  const ev = (o) => w('events', { line: lineNo, seg, turn, ...o })

  function classifyNotificationText(text, ts, channel) {
    const { parts, wrapperChars } = splitNotifications(text)
    if (wrapperChars > 0) ev({ ts, dir: 'in', cls: 'injected.reminders', sub: 'notification-wrapper', chars: wrapperChars })
    for (const p of parts) {
      let cls = 'returns.report'
      if (p.kind === 'agent' && p.status && p.status !== 'completed') cls = 'returns.failure'
      if (p.kind === 'bgCommand' || p.kind === 'monitor') cls = 'shell.bgNotif'
      if (p.kind === 'otherTask') cls = 'other.in'
      ev({ ts, dir: 'in', cls, sub: p.kind + ':' + channel, chars: p.chars, taskId: p.taskId })
      if (p.kind === 'agent') {
        const trig = toolMeta.get(p.toolUseId)
        w('deliveries', { line: lineNo, ts, seg, turn, channel, taskId: p.taskId, toolUseId: p.toolUseId, trigger: trig ? trig.name : null,
          triggerDesc: trig ? trig.desc : null, status: p.status, summary: p.summary, chars: p.chars, resultChars: p.resultChars,
          subagentTokens: p.subagentTokens, toolUses: p.toolUses, durationMs: p.durationMs,
          findingWords: p.result ? (p.result.match(/\b(Critical|Warning)\b/g) || []).length : 0,
          minorWords: p.result ? (p.result.match(/\bMinor\b/g) || []).length : 0,
          ledgerIds: p.result ? new Set(p.result.match(/\b(?:prove|build|review|plan|qa)\/\d+\b/g) || []).size : 0,
          shortIds: p.result ? new Set(p.result.match(/\b(?:[A-Z]{1,3}-)?[CWM]\d{1,2}\b/g) || []).size : 0,
          verdict: p.result ? ((p.result.match(/verdict[:*\s]*\**\s*(approve|request-changes|reject|block)/i) || [])[1] || null) : null,
          noNewFindings: p.result ? /new findings[^\n]{0,40}none|no new (critical|warning|findings)/i.test(p.result) : null })
      }
    }
  }

  function user(o, ts) {
    const c = o.message?.content
    if (o.isCompactSummary) { const t = blockText(c).text; ev({ ts, dir: 'in', cls: 'compaction.summary', sub: 'summary', chars: t.length }); return }
    if (o.isMeta) {
      const t = blockText(c).text
      let cls = 'injected.command'
      let sub = 'meta'
      if (o.sourceToolUseID) {
        cls = 'injected.skillBody'
        const sk = toolMeta.get(o.sourceToolUseID)
        const m = t.match(/^# \/([\w-]+)/) || t.match(/Base directory for this skill: \S*\/([\w-]+)\s/)
        sub = 'skill:' + (sk && sk.skill ? sk.skill : m ? m[1] : 'unknown')
      } else if (t.startsWith('<local-command-caveat>')) sub = 'local-command-caveat'
      else if (/usage limit has reset/.test(t)) { cls = 'other.in'; sub = 'limit-reset-continue' }
      ev({ ts, dir: 'in', cls, sub, chars: t.length })
      return
    }
    if (typeof c === 'string') {
      if (o.origin?.kind === 'task-notification' || c.includes('<task-notification>')) { classifyNotificationText(c, ts, 'user'); return }
      const sub = /<command-name>|<local-command-stdout>|<command-message>/.test(c) ? 'slash-or-local-command' : (o.origin?.kind || 'no-origin')
      ev({ ts, dir: 'in', cls: 'operator', sub, chars: c.length })
      return
    }
    if (!Array.isArray(c)) return
    for (const b of c) {
      if (b.type === 'tool_result') {
        const meta = toolMeta.get(b.tool_use_id)
        const { text, images } = blockText(b.content)
        if (images) skipped.images += images
        const [cls, sub] = toolResultClass(meta?.name, meta, text)
        ev({ ts, dir: 'in', cls, sub, chars: text.length, tool: meta?.name || null, toolUseId: b.tool_use_id, isError: !!b.is_error })
        if (meta?.name === 'Bash') w('bash', { kind: 'result', line: lineNo, ts, seg, turn, toolUseId: b.tool_use_id, chars: text.length, cls, persisted: /^<persisted-output>|Output too large/.test(text) })
      } else if (b.type === 'text') {
        if (b.text.includes('<task-notification>')) classifyNotificationText(b.text, ts, 'user-block')
        else ev({ ts, dir: 'in', cls: 'operator', sub: b.text.startsWith('[Request interrupted') ? 'interrupt' : 'text-block', chars: b.text.length })
      } else if (b.type === 'image') skipped.images++
      else ev({ ts, dir: 'in', cls: 'other.in', sub: 'user-block:' + b.type, chars: JSON.stringify(b).length })
    }
  }

  function attachment(o, ts) {
    const a = o.attachment || {}
    if (!o.rendered) { bump(skipped.attachmentNoRendered, a.type); return }
    const t = renderedText(o.rendered)
    const at = a.type
    if (at === 'queued_command') {
      if (t.includes('<task-notification>')) classifyNotificationText(t, ts, 'att')
      else ev({ ts, dir: 'in', cls: 'operator', sub: 'queued-typed', chars: t.length })
      return
    }
    let cls = 'injected.reminders'
    if (typeof at === 'string' && at.startsWith('hook_')) cls = 'hook'
    else if (at === 'invoked_skills') cls = 'injected.skillBody'
    else if (at === 'instructions' || at === 'nested_memory' || at === 'memory') cls = 'injected.instructions'
    else if (['skill_listing', 'agent_listing_delta', 'deferred_tools_delta', 'mcp_instructions_delta'].includes(at)) cls = 'injected.listings'
    else if (['file', 'edited_text_file', 'compact_file_reference', 'read_truncation_notice', 'directory', 'selected_lines_in_ide', 'opened_file_in_ide'].includes(at)) cls = 'injected.fileAttach'
    ev({ ts, dir: 'in', cls, sub: 'att:' + at, chars: t.length })
  }

  function assistant(o, ts) {
    const m = o.message || {}
    if (o.isApiErrorMessage) {
      skipped.apiErrorStubs++
      const t = blockText(m.content).text
      skipped.apiErrorChars += t.length
      w('events', { line: lineNo, seg, turn, ts, dir: 'none', cls: 'excluded.apiError', sub: String(o.error || ''), chars: t.length, text: t.slice(0, 200) })
      return
    }
    // usage: one request per message.id; the entry with stop_reason carries the final output_tokens
    if (m.id) {
      let r = requests.get(m.id)
      if (!r) {
        turn++
        r = { idx: turn, line: lineNo, ts, seg, id: m.id, model: m.model, input: 0, cc: 0, cr: 0, out: 0, think: 0, stop: null }
        requests.set(m.id, r)
        rows.requests.push(r)
      }
      const u = m.usage || {}
      r.input = Math.max(r.input, u.input_tokens || 0)
      r.cc = Math.max(r.cc, u.cache_creation_input_tokens || 0)
      r.cr = Math.max(r.cr, u.cache_read_input_tokens || 0)
      r.out = Math.max(r.out, u.output_tokens || 0)
      r.think = Math.max(r.think, u.output_tokens_details?.thinking_tokens || 0)
      if (m.stop_reason) r.stop = m.stop_reason
    }
    for (const b of m.content || []) {
      if (b.type === 'text') ev({ ts, dir: 'out', cls: 'out.prose', sub: 'text', chars: (b.text || '').length })
      else if (b.type === 'thinking' || b.type === 'redacted_thinking') ev({ ts, dir: 'out', cls: 'out.thinking', sub: b.type, chars: (b.thinking || '').length })
      else if (b.type === 'tool_use') {
        const i = b.input || {}
        const chars = leafChars(i)
        const meta = { name: b.name, line: lineNo, desc: i.description || i.summary || '', skill: b.name === 'Skill' ? (i.skill || i.command || i.name || null) : null }
        let cls = 'out.otherTool'
        let sub = b.name
        if (b.name === 'Agent' || b.name === 'Task') {
          cls = 'out.agentPrompt'
          w('dispatches', { kind: 'agent', line: lineNo, ts, seg, turn, toolUseId: b.id, role: i.subagent_type || null, model: i.model || null,
            bg: i.run_in_background ?? null, desc: i.description || '', promptChars: (i.prompt || '').length, chars, tags: targetTags(i.prompt || '') })
        } else if (b.name === 'SendMessage') {
          cls = 'out.sendMessage'
          const msg = typeof i.message === 'string' ? i.message : typeof i.content === 'string' ? i.content : JSON.stringify(i.message ?? i.content ?? '')
          w('dispatches', { kind: 'send', line: lineNo, ts, seg, turn, toolUseId: b.id, to: i.to || null, desc: i.summary || '', promptChars: msg.length, chars, tags: targetTags(msg) })
        } else if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(b.name)) {
          cls = 'out.writeEdit'
          sub = b.name + ':' + (targetTags(i.file_path || '').join('+') || 'other')
        } else if (b.name === 'Bash') {
          cls = 'out.bash'
          const cmd = i.command || ''
          const hd = heredocs(cmd)
          const bc = bashClass(cmd)
          meta.bashCls = bc.cls
          const hdChars = hd.reduce((a, x) => a + x.chars, 0)
          sub = 'bash-' + bc.cls
          w('bash', { kind: 'command', line: lineNo, ts, seg, turn, toolUseId: b.id, chars, cmdChars: cmd.length, heredocChars: hdChars,
            heredocs: hd.map((x) => ({ target: x.target, chars: x.chars, tool: x.tool })), cls: bc.cls, heads: bc.heads, tags: targetTags(cmd),
            bg: !!i.run_in_background, desc: (i.description || '').slice(0, 160) })
        }
        toolMeta.set(b.id, meta)
        ev({ ts, dir: 'out', cls, sub, chars, tool: b.name, toolUseId: b.id })
      } else ev({ ts, dir: 'out', cls: 'out.otherTool', sub: 'block:' + b.type, chars: JSON.stringify(b).length })
    }
  }

  function line(text) {
    lineNo++
    if (!text.trim()) return
    const o = parseLine(text)
    // A line that is not a JSON object (unparseable, or a bare `null`) is no entry at all.
    if (o === null || typeof o !== 'object') { bump(skipped.entryTypes, 'PARSE_ERROR'); return }
    if (o.isSidechain) { skipped.sidechain++; return }
    const ts = o.timestamp || null
    switch (o.type) {
      case 'system':
        if (o.subtype === 'compact_boundary') {
          seg++
          const md = o.compactMetadata || {}
          w('compactions', { line: lineNo, ts, seg, trigger: md.trigger, preTokens: md.preTokens, postTokens: md.postTokens, durationMs: md.durationMs, lastTurn: turn })
        } else bump(skipped.entryTypes, 'system:' + o.subtype)
        return
      case 'user': user(o, ts); return
      case 'attachment': attachment(o, ts); return
      case 'assistant': assistant(o, ts); return
      default: bump(skipped.entryTypes, o.type)
    }
  }

  function finish() {
    return { ...rows, skipped: { lines: lineNo, requests: rows.requests.length, segments: seg + 1, ...skipped } }
  }

  return { line, finish }
}

/**
 * Walk a transcript given as lines: `{ events, requests, deliveries, dispatches, bash, compactions, skipped }`,
 * each row shaped as the research walk wrote it to its per-kind JSONL file.
 */
export function walkTranscriptLines(lines) {
  const walker = createWalker()
  for (const text of lines) walker.line(text)
  return walker.finish()
}

/** Walk a transcript file, streamed line by line (a single line can be megabytes). */
export async function walkTranscriptFile(path) {
  const walker = createWalker()
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  for await (const text of rl) walker.line(text)
  return walker.finish()
}

// ---------- sub-agents ----------

/** The first user message that is not a tool result: the dispatch prompt the sub-agent was given. */
function promptText(c) {
  if (typeof c === 'string') return c
  if (!Array.isArray(c) || c.some((b) => b.type === 'tool_result')) return null
  return c.filter((b) => b.type === 'text').map((b) => b.text || '').join('\n')
}

async function readMeta(metaPath) {
  try {
    return JSON.parse(await readFile(metaPath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

/**
 * One sub-agent transcript and its `.meta.json`: the role and requested model the client recorded,
 * the models that answered (per distinct request), and the tokens it processed — Σ over requests,
 * deduplicated by `message.id`, of input + cache creation + cache read + output. API-error stubs
 * are not requests; unparseable lines are skipped. A missing meta file reads as unknown role and
 * model.
 */
export async function scanSubagent(jsonlPath, metaPath) {
  const meta = await readMeta(metaPath)
  const reqs = new Map()
  const models = {}
  let firstPrompt = null
  const rl = createInterface({ input: createReadStream(jsonlPath), crlfDelay: Infinity })
  for await (const text of rl) {
    const o = parseLine(text)
    if (o === null || typeof o !== 'object') continue
    if (o.type === 'user' && firstPrompt === null) firstPrompt = promptText(o.message?.content)
    if (o.type !== 'assistant' || o.isApiErrorMessage) continue
    const m = o.message || {}
    if (m.model) models[m.model] = (models[m.model] || 0) + (reqs.has(m.id) ? 0 : 1)
    if (m.id) {
      const u = m.usage || {}
      const r = reqs.get(m.id) || { input: 0, cc: 0, cr: 0, out: 0, think: 0 }
      r.input = Math.max(r.input, u.input_tokens || 0)
      r.cc = Math.max(r.cc, u.cache_creation_input_tokens || 0)
      r.cr = Math.max(r.cr, u.cache_read_input_tokens || 0)
      r.out = Math.max(r.out, u.output_tokens || 0)
      r.think = Math.max(r.think, u.output_tokens_details?.thinking_tokens || 0)
      reqs.set(m.id, r)
    }
  }
  let processed = 0
  let inputSide = 0
  let outTok = 0
  let think = 0
  for (const r of reqs.values()) {
    const p = r.input + r.cc + r.cr
    processed += p + r.out
    inputSide += p
    outTok += r.out
    think += r.think
  }
  return { agentType: meta.agentType ?? null, requestedModel: meta.model ?? null, models, nReq: reqs.size, processed, inputSide, outTok, think, firstPrompt }
}
