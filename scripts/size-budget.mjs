#!/usr/bin/env node
// The dist size budget, as a standalone gate.
//
// The numbers and the classification are NOT redeclared here. Both halves — logic (every `.js`
// tsdown emits at the top of dist/) and corpus (`dist/content` plus `dist/packs`, the data the
// runtime reads) — come from `tsdown.config.mjs`, which is where the build's own `build:done`
// hook reads them from too. One set of numbers, two callers: a budget that a pull-request check
// and a build could disagree about would be worse than no check at all.
//
// Why it exists at all when the build already throws. A build failure reports "the build broke",
// on a step whose job is to produce output; this reports the two totals and their headroom every
// run, passing or failing, so a reviewer sees the trend rather than only the cliff. It is also
// the step a required pull-request context can name.
//
// Usage: node scripts/size-budget.mjs [dist-dir]
//   dist-dir  defaults to `dist/` beside this script's repository root.
//
// Exit codes: 0 inside both budgets, 1 over one or both, 2 the gate could not run (no such
// directory, or a directory with no files in it — which must never read as a pass).

import { appendFileSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkSizeBudgets, formatBytes } from '../tsdown.config.mjs'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = resolve(process.argv[2] ?? join(REPO_ROOT, 'dist'))

/** Every file under `dir`, as dist-relative POSIX paths with their byte counts. */
async function listTree(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile())
  return await Promise.all(
    files.map(async (entry) => {
      const absPath = join(entry.parentPath, entry.name)
      return {
        relPath: absPath.slice(dir.length + 1).split('\\').join('/'),
        bytes: (await stat(absPath)).size,
      }
    }),
  )
}

/** Write to the step summary when a runner offers one; a no-op locally. */
function summarize(lines) {
  const target = process.env.GITHUB_STEP_SUMMARY
  if (target === undefined || target === '') return
  appendFileSync(target, `${lines.join('\n')}\n`, 'utf8')
}

function cannotRun(reason, remedy) {
  console.error(`size budget: ${reason}`)
  console.error(remedy)
  summarize(['### Size budget did not run', '', reason, '', remedy])
  process.exit(2)
}

let listing
try {
  listing = await listTree(DIST)
} catch (error) {
  cannotRun(
    `cannot read ${DIST} (${error.code ?? error.message})`,
    'Run `npm run build` first — this gate measures a build, and a missing one is not a pass.',
  )
}

if (listing.length === 0) {
  cannotRun(
    `${DIST} holds no files`,
    'An empty build directory and a build inside its budget are the same number here and opposite facts. Run `npm run build`.',
  )
}

const report = checkSizeBudgets(listing)
const line = (row) =>
  `${row.half}: ${formatBytes(row.bytes)} of ${formatBytes(row.budget)} budget`

for (const row of report.budgets) console.info(`[size] ${line(row)}`)
if (report.other > 0) console.info(`[size] unbudgeted: ${formatBytes(report.other)}`)
console.info(`[size] ${listing.length} files under ${DIST}`)

summarize([
  '### Size budget',
  '',
  '| Half | Measured | Budget | Verdict |',
  '| --- | --- | --- | --- |',
  ...report.budgets.map(
    (row) =>
      `| ${row.half} | ${formatBytes(row.bytes)} | ${formatBytes(row.budget)} | ${
        row.bytes > row.budget ? 'OVER' : 'inside'
      } |`,
  ),
])

if (report.violations.length > 0) {
  console.error(
    `size budget exceeded — ${report.violations.map(line).join('; ')}. ` +
      'Reduce what landed in the build, or move the budget in tsdown.config.mjs with the reason ' +
      'it moved. Raising a ceiling because the build grew into it is how the ceiling stops ' +
      'meaning anything.',
  )
  process.exit(1)
}

console.info('[size] both halves inside budget')
