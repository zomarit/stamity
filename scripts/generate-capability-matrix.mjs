#!/usr/bin/env node
// Rewrite docs/capability-matrix.md from adapter code.
//
// Usage: node scripts/generate-capability-matrix.mjs [--out <path>]
//        --out redirects the write; tests use it to prove idempotency without
//        touching the committed page.
//
// Thin by design: this file parses two arguments and hands off. Every byte of
// the page comes from src/emit/capabilityMatrix.ts, and the write goes through
// the engine's atomic writer, so a run interrupted mid-write leaves the old
// page intact rather than a half-page.
//
// The renderer is TypeScript and there is no build step here on purpose — a
// generator that needs `npm run build` first goes stale the moment someone
// skips the build. Node strips the types itself from v22.18 onward; on the
// repo's declared floor (22.12) the same capability sits behind
// --experimental-strip-types, so this script re-execs itself once with the
// flag rather than asking a maintainer to remember it. The re-exec must
// happen before the renderer is loaded, which is why the imports below are
// dynamic.
//
// Exit codes: 0 wrote the page, 1 render or write failed, 2 bad arguments.

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const ROOT = resolve(SELF, '..', '..')

if (!process.features.typescript) {
  // Re-exec once, never twice: a Node build that still cannot strip types with
  // the flag on would otherwise respawn itself forever.
  if (process.execArgv.includes('--experimental-strip-types')) {
    console.error(
      `This Node build (${process.version}) cannot strip TypeScript types, so the renderer ` +
        'cannot be loaded. Run the generator on Node >=22.12.',
    )
    process.exit(1)
  }
  const child = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--disable-warning=ExperimentalWarning',
      SELF,
      ...process.argv.slice(2),
    ],
    { stdio: 'inherit' },
  )
  // A signalled child has no status; 1 is the honest "did not complete".
  process.exit(child.status ?? 1)
}

function usage(problem) {
  console.error(`${problem}\nUsage: node scripts/generate-capability-matrix.mjs [--out <path>]`)
  process.exit(2)
}

const args = process.argv.slice(2)
let outArg = null
for (let i = 0; i < args.length; i += 1) {
  if (args[i] !== '--out') usage(`Unknown argument: ${args[i]}`)
  i += 1
  if (i >= args.length) usage('--out needs a path.')
  outArg = args[i]
}

const { CAPABILITY_MATRIX_DOC_PATH, renderCapabilityMatrix } = await import(
  '../src/emit/capabilityMatrix.ts'
)
const { atomicWriteFile } = await import('../src/merge/atomicWrite.ts')

const target = outArg === null ? resolve(ROOT, CAPABILITY_MATRIX_DOC_PATH) : resolve(outArg)

try {
  // Rendering first keeps a failed citation check from truncating the page.
  const page = renderCapabilityMatrix()
  await atomicWriteFile(target, page)
  console.log(`Wrote ${target}`)
} catch (err) {
  // An EngineError already carries an operator-readable message; a stack trace
  // would bury it.
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}
