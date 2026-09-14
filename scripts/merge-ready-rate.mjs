#!/usr/bin/env node
// Measure the verified merge-ready rate over this repository's run records.
//
// Usage: node scripts/merge-ready-rate.mjs [--json] [--write]
//        --json   prints the report object instead of the human summary.
//        --write  freezes the report into evals/measurements/merge-ready-<today>.json,
//                 which is what docs/measurements.md renders from. Refuses to
//                 overwrite an existing snapshot.
//
// Thin by design, the way scripts/generate-docs.mjs is: every rule lives in
// src/cli/docs/measurements.ts, which is also what renders docs/measurements.md,
// so the page and this command cannot disagree about the number. The inputs are
// committed artifacts only — .stamity/runs/*/record.md, each run's ledger.jsonl,
// and CHANGELOG.md, which supplies the reported merge-evidence column rather
// than a clause — and nothing here reaches the network.
//
// THE CLOCK LIVES HERE, and only for the snapshot's filename. The renderer is
// byte-compared by the suite and must be clock-free, so it takes the date as an
// argument rather than reading one; this file is the caller that knows what day
// it is.
//
// The re-exec below is the same tolerance generate-docs.mjs carries: the module
// is TypeScript and Node strips the types itself from v22.18 onward, so a HOST
// Node under the declared floor gets one re-exec with the flag rather than a
// "run it with --experimental-strip-types" instruction nobody remembers. It must
// happen before the module loads, which is why the import below is dynamic.
//
// Exit codes: 0 measured, 1 the measurement or the write refused, 2 bad arguments.

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareNativeTypescriptCli } from './native-typescript.mjs'

const SELF = fileURLToPath(import.meta.url)
const ROOT = resolve(SELF, '..', '..')
const FLAGS = ['--json', '--write']
const USAGE = `Usage: node scripts/merge-ready-rate.mjs [${FLAGS.join('] [')}]`

if (prepareNativeTypescriptCli(import.meta.url)) {
  const args = process.argv.slice(2)
  const unknown = args.filter((arg) => !FLAGS.includes(arg))
  if (unknown.length > 0) {
    console.error(`Unknown argument: ${unknown[0]}\n${USAGE}`)
    process.exit(2)
  }

  const { computeMergeReadyRate, writeMeasurementSnapshot } = await import(
    '../src/cli/docs/measurements.ts'
  )

  try {
    if (args.includes('--write')) {
      // The LOCAL day, not the UTC one: a snapshot is named for the day the
      // maintainer took it, and the run records beside it are dated the same
      // way. `en-CA` is the locale whose short date IS ISO-8601.
      const today = new Date().toLocaleDateString('en-CA')
      const path = writeMeasurementSnapshot(ROOT, today)
      console.log(`Wrote ${path}`)
      console.log('Regenerate the page with `node scripts/generate-docs.mjs --page measurements`.')
    }

    const report = computeMergeReadyRate(ROOT)
    if (args.includes('--json')) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      const { n, d, value } = report.rate
      console.log(`Verified merge-ready rate: ${n} of ${d} (${value.toFixed(3)})`)
      console.log(`Rule: ${report.rule}`)
      console.log(`Generated for: ${report.generated} (the newest closed run record's date)`)
      const from = report.computedFrom
      console.log(
        `Computed from: ${from.records} records · changelog head ${from.changelogHead}`,
      )
      console.log('')
      console.log(`Numerator (${report.numerator.length}):`)
      for (const run of report.numerator) {
        console.log(`  ${run.run} — merge evidence: ${run.mergeEvidence}`)
      }
      console.log(`Denominator, less the numerator (${report.denominator.length}):`)
      for (const run of report.denominator) {
        console.log(`  ${run.run} — ${run.reason} (merge evidence: ${run.mergeEvidence})`)
      }
      console.log(`Excluded (${report.excluded.length}):`)
      for (const run of report.excluded) console.log(`  ${run.run} — ${run.reason}`)
    }
  } catch (err) {
    // An EngineError already carries an operator-readable message; a stack trace
    // would bury it.
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
