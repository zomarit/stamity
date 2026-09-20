#!/usr/bin/env node
// Build the runtime a plugin root ships as `runtime/`: this package's published
// tarball, extracted, with its production dependencies installed beside it, so
// a client that has never seen npm can run `node runtime/dist/cli.js` and get
// the release.
//
// The input is a TARBALL, not the checkout. `npm pack` is the only thing that
// knows what `files` publishes, and building from the working tree would ship a
// runtime containing sources, fixtures and build config that the published
// package does not have — and, worse, would pass every test while doing it.
// The lockfile, by contrast, comes from the REPOSITORY: it is the record of
// what this release was tested against, so the install is resolved from it
// rather than from the tarball's dependency ranges.
//
// Steps:
//   1. extract    the tarball's `package/` prefix into <dir>, so <dir>/package.json
//                 and <dir>/dist/cli.js land where `findPackageRoot` expects them.
//                 The reader is in scripts/plugins/runtime.mjs — a tar subset over
//                 node:zlib, so the Windows leg needs no `tar` binary.
//   2. install    `npm ci --omit=dev --omit=optional --ignore-scripts --no-audit
//                 --no-fund` inside <dir>, against the copied package-lock.json.
//                 `--omit=optional` is what leaves `sigstore` out.
//   3. prune      documented below, and applied in this order.
//   4. describe   <dir>/RUNTIME.json: { package, version, nodeFloor,
//                 tarballSha256, dependencies }, fixed key order, dependencies
//                 sorted by name.
//   5. measure    one summary line with the file count and the byte total.
//
// THE PRUNE LIST, in full:
//   - node_modules/.package-lock.json   npm's own bookkeeping; nothing reads it
//                                       in a tree that will never be installed into
//   - node_modules/@types/              the whole scope. `@types/node` arrives as a
//                                       PRODUCTION dependency (via @types/make-fetch-happen
//                                       -> @types/node-fetch) and is megabytes of
//                                       declarations that no runtime ever reads.
//   - *.md, *.map, *.d.ts, *.d.mts,     under node_modules only: documentation,
//     *.d.cts                           sourcemaps and type declarations are all
//                                       read by tools, never by the interpreter
//   - test/, tests/, docs/, .github/    under node_modules only: a dependency's
//                                       own fixtures and CI config
//   NOTHING outside node_modules is pruned. `dist/content/` is the bundled
//   corpus — every agent, command, rule and skill body, and the charter — and it
//   is markdown by FORMAT, so a suffix prune over the whole tree would ship a
//   runtime that starts, prints its version, and can emit nothing.
//   LICENSE, LICENCE, COPYING and NOTICE files are KEPT whatever their
//   extension — a redistribution carries the licences of what it redistributes.
//
// Determinism: two builds from one tarball produce the same file set and the
// same RUNTIME.json, because the tarball is fixed, the lockfile is fixed, and
// the prune is a pure function of the tree.
//
// Exit codes: 0 the runtime was built, 1 a step failed, 2 bad arguments —
// including a --tarball that does not exist and an --out that already holds files.
// Usage: node scripts/build-plugin-runtime.mjs --tarball <file.tgz> --out <dir>

import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './native-typescript.mjs'
import { buildRuntime } from './plugins/runtime.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const USAGE = 'Usage: node scripts/build-plugin-runtime.mjs --tarball <file.tgz> --out <dir>'

function usage(problem) {
  console.error(`${problem}\n${USAGE}`)
  return 2
}

function parseArguments(argv) {
  let tarball = null
  let out = null
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--tarball') {
      i += 1
      if (i >= argv.length) return { code: usage('--tarball needs a path.') }
      tarball = argv[i]
    } else if (arg === '--out') {
      i += 1
      if (i >= argv.length) return { code: usage('--out needs a path.') }
      out = argv[i]
    } else {
      return { code: usage(`Unknown argument: ${arg}`) }
    }
  }
  if (tarball === null) return { code: usage('--tarball is required.') }
  if (out === null) return { code: usage('--out is required.') }
  const tarballPath = resolve(tarball)
  const outDir = resolve(out)
  if (!existsSync(tarballPath)) return { code: usage(`No tarball at ${tarballPath}.`) }
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    return { code: usage(`--out ${outDir} already holds files; give an empty or nonexistent directory.`) }
  }
  return { tarballPath, outDir }
}

function main(argv) {
  const parsed = parseArguments(argv)
  if (parsed.code !== undefined) return parsed.code
  const built = buildRuntime({
    tarballPath: parsed.tarballPath,
    outDir: parsed.outDir,
    lockfilePath: resolve(ROOT, 'package-lock.json'),
    log: (message) => console.log(`build-plugin-runtime: ${message}`),
  })
  console.log(
    `build-plugin-runtime: PASS - ${built.manifest.package}@${built.manifest.version} ` +
      `is ${built.files} file(s), ${built.bytes} byte(s) in ${parsed.outDir}`,
  )
  return 0
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    console.error(`build-plugin-runtime: FAIL - ${error instanceof Error ? error.message : String(error)}`)
    if (error instanceof Error && typeof error.stderr === 'string' && error.stderr.trim() !== '') {
      console.error(error.stderr.trim().split('\n').map((line) => `  ${line}`).join('\n'))
    }
    process.exitCode = 1
  }
}
