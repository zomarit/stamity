#!/usr/bin/env node
// The QA form, rendered from an evidence file rather than typed.
//
// Nine rows were carried through two releases as "UNPERFORMED", which is an honest record of a
// walk-through nobody did and a useless one for deciding whether the next release needs it. This
// module renders those nine rows out of `.stamity/evidence/qa-<sha>.json`, so each one arrives with
// the thing a typed form never carries: what it was measured against. The five plugin-route rows
// (`H4a`–`H4d`, `H5`) left the form in 1.15.0 with the route they measured; an evidence file that
// still carries them renders them under "Retired rows", never in the table. The rows the harness can measure end to end it
// measures; the rest stay human, and a human row reads UNPERFORMED until somebody signs it — with
// the row's input hash beside the signature, so the next run can tell whether that signature still
// describes the tree. A person who signs a row off without walking it gets ACCEPTED UNWALKED, which
// says exactly that and holds for one run only.
//
// Nothing here decides a status. `run.mjs` measures, `bind.mjs` carries human answers forward, and
// this file only renders what those two produced. A row with no measurement renders as `not-run`
// with the harness's reason — never as a pass, and never as prose that reads like one.
//
// Usage: node scripts/qa/form.mjs <evidence.json>

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * The nine rows, in form order.
 *
 * The ids are the form's (`H1a`–`H1d`, `H2`, `H3a`–`H3d`) and the split follows what each row is
 * measured BY: H1 is one row per client whose hook lane is exercised, H2 is the accessibility tree
 * and scanner pass over the built pages, and H3 is one row per viewport/theme pair of the keyboard
 * journey. `lane` names which half of the harness owns the row, and is what `run.mjs` dispatches
 * on — a row nobody owns would be a row nobody measures.
 */
export const QA_ROWS = [
  {
    id: 'H1a',
    lane: 'hooks',
    client: 'claude',
    title: 'Hook denial and allowance under Claude Code',
    proves: 'a user hook wired by `sync` denies a tool call it refuses and lets an allowed one through',
  },
  {
    id: 'H1b',
    lane: 'hooks',
    client: 'codex',
    title: 'Hook denial and allowance under Codex',
    proves: 'the same user hook, wired into the Codex hook config, denies and allows the same two calls',
  },
  {
    id: 'H1c',
    lane: 'hooks',
    client: 'cursor',
    title: 'Hook denial and allowance under Cursor',
    proves: 'the same user hook, wired into the Cursor hook config, denies and allows the same two calls',
  },
  {
    id: 'H1d',
    lane: 'hooks',
    client: 'copilot',
    title: 'Hook denial and allowance under the Copilot CLI',
    proves: 'the same user hook, wired into the Copilot hook config, denies and allows the same two calls',
  },
  {
    id: 'H2',
    lane: 'a11y',
    title: 'Accessibility tree and scanner over the built documentation pages',
    proves: 'heading levels never skip, every link has a name, every `th` is associated, and the scanner reports its violations',
  },
  {
    id: 'H3a',
    lane: 'keyboard',
    width: 375,
    theme: 'light',
    title: 'Keyboard journey — 375px, light',
    proves: 'every focus stop is visible, reading order equals DOM order, and the table page answers the arrow keys or says why not',
  },
  {
    id: 'H3b',
    lane: 'keyboard',
    width: 375,
    theme: 'dark',
    title: 'Keyboard journey — 375px, dark',
    proves: 'every focus stop is visible, reading order equals DOM order, and the table page answers the arrow keys or says why not',
  },
  {
    id: 'H3c',
    lane: 'keyboard',
    width: 1440,
    theme: 'light',
    title: 'Keyboard journey — 1440px, light',
    proves: 'every focus stop is visible, reading order equals DOM order, and the table page answers the arrow keys or says why not',
  },
  {
    id: 'H3d',
    lane: 'keyboard',
    width: 1440,
    theme: 'dark',
    title: 'Keyboard journey — 1440px, dark',
    proves: 'every focus stop is visible, reading order equals DOM order, and the table page answers the arrow keys or says why not',
  },
]

/**
 * The rows the form carried until 1.15.0, by id, with why each left.
 *
 * `H4a`–`H4d` proved the plugin route one client at a time and `H5` walked its upgrade and
 * rollback; 1.15.0 deleted that route, so no run measures them again. An evidence file written
 * before the cut still carries them, and the form lists them by id under "Retired rows" with the
 * status they were recorded with, so the file renders whole and nobody reads a retired row as a
 * row of this run. `bind.mjs` carries forward only the rows a run writes, so a signature on one of
 * these is not carried to the next file.
 */
export const RETIRED_ROWS = {
  H4a: 'retired in 1.15.0: the plugin route it measured under Claude Code is deleted',
  H4b: 'retired in 1.15.0: the plugin route it measured under Cursor is deleted',
  H4c: 'retired in 1.15.0: the plugin route it measured under the Copilot CLI is deleted',
  H4d: 'retired in 1.15.0: the plugin route it measured under Codex is deleted',
  H5: "retired in 1.15.0: the plugin route's upgrade-and-rollback walk is deleted with the route",
}

/** Markdown table cells are pipe-delimited, so a reason carrying one has to escape it. */
function cell(text) {
  return String(text ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
}

/**
 * What the human column says about a row.
 *
 * A row the harness measured says so and points at the measurement. Everything else is UNPERFORMED
 * — the one word the form has always used for "nobody did this" — unless a person signed it and
 * `carryForward` found the row's inputs unchanged, in which case the signature reads with its
 * ORIGINAL date. A signature re-dated to tonight would claim a walk-through that did not happen.
 * The carry suffix is printed only beside a row `carryForward` marked `carried: true`: a row a
 * person walked this run reads as the walk it is, and an evidence file written before the mark
 * existed claims no carry it cannot show.
 */
export function humanCell(row) {
  if (row.status === 'performed') {
    const by = row.performedBy === undefined ? '' : ` by ${row.performedBy}`
    const at = row.performedAt === undefined ? 'date not recorded' : row.performedAt
    const carry = row.carried === true ? ' (carried forward: inputs unchanged)' : ''
    return `PERFORMED ${at}${by}${carry}`
  }
  // Signed off WITHOUT a walk. It never reads as PERFORMED and never as a carry: `carryForward`
  // reopens an acceptance on the next run whatever its hash, so the cell says so.
  if (row.status === 'accepted-unwalked') {
    const by = row.acceptedBy === undefined ? '' : ` by ${row.acceptedBy}`
    const at = row.acceptedAt === undefined ? 'date not recorded' : row.acceptedAt
    return `ACCEPTED UNWALKED ${at}${by} (not walked; holds for this run only)`
  }
  if (row.automated === true) return `automated (${row.status})`
  return 'UNPERFORMED'
}

/** Short hash form for a table cell; the full hash is in the evidence file the header names. */
function shortHash(hash) {
  return typeof hash === 'string' && hash.length > 12 ? `${hash.slice(0, 12)}…` : String(hash ?? '')
}

/**
 * Render the form.
 *
 * `evidence` is a parsed `.stamity/evidence/qa-<sha>.json`. Rows are rendered in CATALOGUE order,
 * not in the order the file happens to list them, and a catalogue row the evidence file does not
 * carry renders as `not-run` with "the harness wrote no row for this id" — an absent row is a gap
 * in the evidence, and printing nothing would hide it.
 */
export function renderForm(evidence) {
  const rows = Array.isArray(evidence?.rows) ? evidence.rows : []
  const byId = new Map(rows.map((row) => [row.row, row]))
  const harness = evidence?.harness ?? {}
  const lines = []

  lines.push(`# QA form — ${evidence?.sha ?? 'unknown sha'}`)
  lines.push('')
  lines.push(
    'Rendered by `node scripts/qa/form.mjs <evidence.json>`. Every status below was measured by ' +
      '`scripts/qa/run.mjs` or signed by a person; nothing here is asserted by this renderer.',
  )
  lines.push('')
  lines.push(`- Evidence run: ${evidence?.timestamp ?? 'timestamp not recorded'}`)
  lines.push(
    `- Harness: ${harness.name ?? 'none'} ${harness.version ?? ''}`.trimEnd() +
      `${harness.browser === undefined ? '' : ` · browser ${harness.browser}`}` +
      `${harness.scanner === undefined ? '' : ` · ${harness.scanner} ${harness.scannerVersion ?? ''}`.trimEnd()}`,
  )
  lines.push('')
  lines.push('| Row | What it proves | Automated | Status | Human sign-off | rowHash | Evidence |')
  lines.push('|---|---|---|---|---|---|---|')

  for (const catalogue of QA_ROWS) {
    const row = byId.get(catalogue.id)
    if (row === undefined) {
      lines.push(
        `| **${catalogue.id}** ${cell(catalogue.title)} | ${cell(catalogue.proves)} | no | not-run | ` +
          'UNPERFORMED | — | the harness wrote no row for this id |',
      )
      continue
    }
    lines.push(
      `| **${catalogue.id}** ${cell(catalogue.title)} | ${cell(catalogue.proves)} | ` +
        `${row.automated === true ? 'yes' : 'no'} | ${cell(row.status)} | ${cell(humanCell(row))} | ` +
        `\`${shortHash(row.rowHash)}\` | ${cell(row.reason)} |`,
    )
  }

  // Rows an older evidence file still carries for a route 1.15.0 deleted. Listed by id with the
  // status they were recorded with, after the table and outside it, so the form renders whole and
  // a retired row never reads as a row of this run.
  const retired = rows.filter((row) => Object.hasOwn(RETIRED_ROWS, row?.row))
  if (retired.length > 0) {
    lines.push('')
    lines.push('## Retired rows')
    lines.push('')
    lines.push(
      'This evidence file carries rows the form no longer has. Each is shown with the status it was ' +
        'recorded with; no run measures it again, and the next run carries no signature forward for it.',
    )
    lines.push('')
    for (const row of retired) {
      lines.push(`- **${row.row}** — recorded \`${cell(row.status)}\`; ${RETIRED_ROWS[row.row]}.`)
    }
  }

  lines.push('')
  lines.push('## Inputs each row is bound to')
  lines.push('')
  for (const catalogue of QA_ROWS) {
    const row = byId.get(catalogue.id)
    const inputs = row?.inputHashes ?? {}
    const paths = Object.keys(inputs).toSorted()
    lines.push(`### ${catalogue.id} — \`${row?.rowHash ?? 'no rowHash'}\``)
    lines.push('')
    if (paths.length === 0) {
      lines.push('No inputs recorded, so this row is bound to nothing and reopens on every run.')
      lines.push('')
      continue
    }
    for (const path of paths) lines.push(`- \`${path}\` — \`${inputs[path]}\``)
    lines.push('')
  }

  lines.push(
    'A human row stays PERFORMED only while its `rowHash` holds. Change a byte under any input ' +
      'above and `scripts/qa/bind.mjs` reopens that row on the next run. An ACCEPTED UNWALKED row ' +
      'holds for the run that recorded it and reopens on the next run whatever its hash: walk it or ' +
      'accept it again.',
  )
  return `${lines.join('\n')}\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2]
  if (path === undefined) {
    process.stderr.write('Usage: node scripts/qa/form.mjs <evidence.json>\n')
    process.exitCode = 1
  } else {
    process.stdout.write(renderForm(JSON.parse(readFileSync(path, 'utf8'))))
  }
}
