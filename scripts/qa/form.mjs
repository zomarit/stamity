#!/usr/bin/env node
// The QA form, rendered from an evidence file rather than typed.
//
// Nine rows were carried through two releases as "UNPERFORMED", which is an honest record of a
// walk-through nobody did and a useless one for deciding whether the next release needs it. This
// module renders thirteen rows out of `.stamity/evidence/qa-<sha>.json` — the original nine plus one
// per client for the plugin route (`H4a`–`H4d`) — so each one arrives with the thing a typed form
// never carries: what it was measured against. The rows the harness can measure end to end it
// measures; the rest stay human, and a human row reads UNPERFORMED until somebody signs it — with
// the row's input hash beside the signature, so the next run can tell whether that signature still
// describes the tree.
//
// Nothing here decides a status. `run.mjs` measures, `bind.mjs` carries human answers forward, and
// this file only renders what those two produced. A row with no measurement renders as `not-run`
// with the harness's reason — never as a pass, and never as prose that reads like one.
//
// Usage: node scripts/qa/form.mjs <evidence.json>

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * The thirteen rows, in form order.
 *
 * The ids are the form's (`H1a`–`H1d`, `H2`, `H3a`–`H3d`, `H4a`–`H4d`) and the split follows what
 * each row is measured BY: H1 is one row per client whose hook lane is exercised, H2 is the
 * accessibility tree and scanner pass over the built pages, H3 is one row per viewport/theme pair
 * of the keyboard journey, and H4 is one row per client for the plugin route — install, discovery
 * and invocation of a built plugin root through that client's own commands. `lane` names which half
 * of the harness owns the row, and is what `run.mjs` dispatches on — a row nobody owns would be a
 * row nobody measures.
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
  {
    id: 'H4a',
    lane: 'plugins',
    client: 'claude',
    title: 'Plugin route — install, discovery and invocation under Claude Code',
    proves:
      "the built root installs through the client's own route, lists `st-work` and `stamity-reviewer` where agents ride, and its `st-setup` command writes `.stamity/manifest.json` with `plugin.mode` `plugin-backed`",
  },
  {
    id: 'H4b',
    lane: 'plugins',
    client: 'cursor',
    title: 'Plugin route — install, discovery and invocation under Cursor',
    proves:
      "the built root installs through the client's own route, lists `st-work` and `stamity-reviewer` where agents ride, and its `st-setup` command writes `.stamity/manifest.json` with `plugin.mode` `plugin-backed`",
  },
  {
    id: 'H4c',
    lane: 'plugins',
    client: 'copilot',
    title: 'Plugin route — install, discovery and invocation under the Copilot CLI',
    proves:
      "the built root installs through the client's own route, lists `st-work` and `stamity-reviewer` where agents ride, and its `st-setup` command writes `.stamity/manifest.json` with `plugin.mode` `plugin-backed`",
  },
  {
    id: 'H4d',
    lane: 'plugins',
    client: 'codex',
    title: 'Plugin route — install, discovery and invocation under Codex',
    // This container carries no command and no agent class, so the sentence its three siblings share
    // would promise ids this root cannot hold: `st-work` rides as a command and `st-setup` is
    // generated into one. What Codex carries is skills, and the setup route is the line its own
    // README prints — which is what this row is a claim about.
    proves:
      'the built root installs through the marketplace route into the client\'s own cache, its carried skills are discovered under the form the root declares, and the setup line its README names writes `.stamity/manifest.json` with `plugin.mode` `plugin-backed`',
  },
  {
    id: 'H5',
    lane: 'plugins',
    title: "Upgrade and rollback through each client's own route",
    proves:
      "installing the first fixture version, updating to the second and rolling back restores the first version's tree byte for byte, with `plugin status` compatible in all three states and the repository-owned files unchanged",
    // The four routes, named here because they differ and the difference is what an operator has to
    // plan around. Measured 2026-09-20; the row's own reason carries the route each client actually
    // walked, out of the run, rather than out of this list.
    routes: {
      claude:
        'reinstall — re-add the marketplace at the previous tag, `plugin install stamity@stamity --scope project`, then `plugin update stamity@stamity --scope project` completes it (there is no `plugin rollback` subcommand)',
      copilot:
        'tree replacement — a local marketplace loads live, so `plugin update` is a no-op and the version follows the directory',
      codex: '`plugin remove stamity@stamity`, then marketplace add at the earlier tag and `plugin add`',
      cursor: '`--plugin-dir` tree replacement — this client documents no install, update or rollback subcommand',
    },
  },
]

/** Row id -> catalogue entry, so a renderer never has to scan the list. */
const BY_ID = new Map(QA_ROWS.map((row) => [row.id, row]))

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
 */
export function humanCell(row) {
  if (row.status === 'performed') {
    const by = row.performedBy === undefined ? '' : ` by ${row.performedBy}`
    const at = row.performedAt === undefined ? 'date not recorded' : row.performedAt
    return `PERFORMED ${at}${by} (carried forward: inputs unchanged)`
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
      'above and `scripts/qa/bind.mjs` reopens that row on the next run.',
  )
  return `${lines.join('\n')}\n`
}

/** Catalogue lookup, exported so `run.mjs` builds its rows from the same nine entries. */
export function rowDefinition(id) {
  return BY_ID.get(id)
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
