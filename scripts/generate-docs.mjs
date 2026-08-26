#!/usr/bin/env node
// Rewrite every generated documentation page from code.
//
// Usage: node scripts/generate-docs.mjs [--page <cli|config|reference|llms|all>] [--out-dir <dir>]
//        --page  renders one family instead of all four.
//        --out-dir redirects every write under that directory, keeping the
//                  repo-relative layout; tests use it to prove idempotency
//                  without touching the committed pages.
//
// Thin by design: this file parses two arguments and hands off. Every byte of
// every page comes from src/cli/docs/*.ts, and the writes go through the
// engine's atomic writer, so a run interrupted mid-write leaves the old page
// intact rather than a half-page.
//
// The renderers are TypeScript and there is no build step here on purpose — a
// generator that needs `npm run build` first goes stale the moment someone
// skips the build. Node strips the types itself from v22.18 onward; on the
// repo's declared floor (22.12) the same capability sits behind
// --experimental-strip-types, so this script re-execs itself once with the
// flag rather than asking a maintainer to remember it. The re-exec must
// happen before the renderers are loaded, which is why the imports below are
// dynamic.
//
// Exit codes: 0 wrote the pages, 1 render or write failed, 2 bad arguments.

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const ROOT = resolve(SELF, '..', '..')
const PAGES = ['cli', 'config', 'reference', 'llms', 'all']
const USAGE = `Usage: node scripts/generate-docs.mjs [--page <${PAGES.join('|')}>] [--out-dir <dir>]`

if (!process.features.typescript) {
  // Re-exec once, never twice: a Node build that still cannot strip types with
  // the flag on would otherwise respawn itself forever.
  if (process.execArgv.includes('--experimental-strip-types')) {
    console.error(
      `This Node build (${process.version}) cannot strip TypeScript types, so the renderers ` +
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
  console.error(`${problem}\n${USAGE}`)
  process.exit(2)
}

const args = process.argv.slice(2)
let page = 'all'
let outDir = null
for (let i = 0; i < args.length; i += 1) {
  const flag = args[i]
  if (flag !== '--page' && flag !== '--out-dir') usage(`Unknown argument: ${flag}`)
  i += 1
  if (i >= args.length) usage(`${flag} needs a value.`)
  if (flag === '--page') {
    page = args[i]
    if (!PAGES.includes(page)) usage(`Unknown page: ${page}`)
  } else {
    outDir = args[i]
  }
}

const { CLI_REFERENCE_DOC_PATH, renderCliReference } = await import('../src/cli/docs/cliReference.ts')
const { CONFIG_REFERENCE_DOC_PATH, renderConfigReference } = await import(
  '../src/cli/docs/configReference.ts'
)
const { renderReferencePages } = await import('../src/cli/docs/referencePages.ts')
const { LLMS_INDEX_DOC_PATH, renderLlmsIndex } = await import('../src/cli/docs/llmsIndex.ts')
const { atomicWriteFile } = await import('../src/merge/atomicWrite.ts')

/** Repo-relative path -> page bytes, for the requested family. */
async function render(which) {
  const pages = new Map()
  if (which === 'cli' || which === 'all') pages.set(CLI_REFERENCE_DOC_PATH, renderCliReference())
  if (which === 'config' || which === 'all') {
    pages.set(CONFIG_REFERENCE_DOC_PATH, renderConfigReference())
  }
  if (which === 'reference' || which === 'all') {
    for (const [path, bytes] of await renderReferencePages()) pages.set(path, bytes)
  }
  // The index lists the other pages, so it renders last — after anything that
  // would have refused has already refused.
  if (which === 'llms' || which === 'all') pages.set(LLMS_INDEX_DOC_PATH, renderLlmsIndex())
  return pages
}

try {
  // Rendering every page before writing any keeps one defective artifact from
  // leaving a half-updated docs tree behind.
  const rendered = await render(page)
  const base = outDir === null ? ROOT : resolve(outDir)
  // Distinct paths, so the writes are independent; each still takes its own
  // lock and lands through temp+rename.
  const targets = [...rendered].map(([relPath, bytes]) => [resolve(base, relPath), bytes])
  await Promise.all(targets.map(([target, bytes]) => atomicWriteFile(target, bytes)))
  for (const [target] of targets) console.log(`Wrote ${target}`)
} catch (err) {
  // An EngineError already carries an operator-readable message; a stack trace
  // would bury it.
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}
