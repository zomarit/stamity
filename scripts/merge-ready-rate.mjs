#!/usr/bin/env node
// Measure the verified merge-ready rate over this repository's run records.
//
// Usage: node scripts/merge-ready-rate.mjs [--json]
//        --json  prints the report object instead of the human summary.
//
// Thin by design, the way scripts/generate-docs.mjs is: every rule lives in
// src/cli/docs/measurements.ts, which is also what renders docs/measurements.md,
// so the page and this command cannot disagree about the number. The inputs are
// committed artifacts only — .stamity/runs/*/record.md, each run's ledger.jsonl,
// and CHANGELOG.md — and nothing here reaches the network or reads the clock.
//
// The re-exec below is the same tolerance generate-docs.mjs carries: the module
// is TypeScript and Node strips the types itself from v22.18 onward, so a HOST
// Node under the declared floor gets one re-exec with the flag rather than a
// "run it with --experimental-strip-types" instruction nobody remembers. It must
// happen before the module loads, which is why the import below is dynamic.
//
// Exit codes: 0 measured, 1 the measurement refused, 2 bad arguments.

import { prepareNativeTypescriptCli } from './native-typescript.mjs'

const USAGE = 'Usage: node scripts/merge-ready-rate.mjs [--json]'

if (prepareNativeTypescriptCli(import.meta.url)) {
  const args = process.argv.slice(2)
  const unknown = args.filter((arg) => arg !== '--json')
  if (unknown.length > 0) {
    console.error(`Unknown argument: ${unknown[0]}\n${USAGE}`)
    process.exit(2)
  }

  const { computeMergeReadyRate } = await import('../src/cli/docs/measurements.ts')

  try {
    const report = computeMergeReadyRate()
    if (args.includes('--json')) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      const { n, d, value } = report.rate
      console.log(`Verified merge-ready rate: ${n} of ${d} (${value.toFixed(3)})`)
      console.log(`Rule: ${report.rule}`)
      console.log(`Generated for: ${report.generated} (the newest run record's date)`)
      console.log('')
      console.log(`Numerator (${report.numerator.length}):`)
      for (const run of report.numerator) console.log(`  ${run.run} — ${run.evidence}`)
      console.log(`Denominator, less the numerator (${report.denominator.length}):`)
      for (const run of report.denominator) console.log(`  ${run.run} — ${run.reason}`)
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
