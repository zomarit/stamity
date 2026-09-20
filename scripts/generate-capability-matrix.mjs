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
// One data set does NOT come from the engine, and it cannot: the four plugin
// containers are declared by the emitter modules under scripts/plugins/clients/,
// which are build-time modules that are never bundled into dist/. This script is
// on the same side of that line as they are, so it reads them — through
// ./plugin-container-facts.mjs — and passes the rows in. The suite that
// byte-compares the committed page builds them through the same module, so the
// page and its drift gate are one derivation.
//
// The renderer is TypeScript and there is no build step here on purpose — a
// generator that needs `npm run build` first goes stale the moment someone
// skips the build. Node strips the types itself from v22.18 onward, which every
// Node the declared floor (>=22.22.2) admits does; the re-exec below is a
// tolerance for a HOST Node under that floor — unsupported, but a state a
// contributor's machine can be in — where the same capability sits behind
// --experimental-strip-types, so this script re-execs itself once with the
// flag rather than asking a maintainer to remember it. The re-exec must
// happen before the renderer is loaded, which is why the imports below are
// dynamic.
//
// Exit codes: 0 wrote the page, 1 render or write failed, 2 bad arguments.

import { prepareNativeTypescriptCli } from './native-typescript.mjs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const ROOT = resolve(SELF, '..', '..')

function usage(problem) {
  console.error(`${problem}\nUsage: node scripts/generate-capability-matrix.mjs [--out <path>]`)
  process.exit(2)
}

if (prepareNativeTypescriptCli(import.meta.url)) {

  const args = process.argv.slice(2)
  let outArg = null
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== '--out') usage(`Unknown argument: ${args[i]}`)
    i += 1
    if (i >= args.length) usage('--out needs a path.')
    outArg = args[i]
  }

  const { CAPABILITY_MATRIX_DOC_PATH, LIVE_CAPABILITY_INPUTS, renderCapabilityMatrixFrom } =
    await import('../src/emit/capabilityMatrix.ts')
  const { atomicWriteFile } = await import('../src/merge/atomicWrite.ts')
  const { buildPluginContainerFacts } = await import('./plugin-container-facts.mjs')

  const target = outArg === null ? resolve(ROOT, CAPABILITY_MATRIX_DOC_PATH) : resolve(outArg)

  try {
    // Rendering first keeps a failed citation check from truncating the page.
    const page = renderCapabilityMatrixFrom({
      ...LIVE_CAPABILITY_INPUTS,
      plugins: buildPluginContainerFacts(),
    })
    await atomicWriteFile(target, page)
    console.log(`Wrote ${target}`)
  } catch (err) {
    // An EngineError already carries an operator-readable message; a stack trace
    // would bury it.
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
