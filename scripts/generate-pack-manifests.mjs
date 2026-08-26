#!/usr/bin/env node
// Verify the bundled first-party packs and (re)generate the catalog pins
// module (src/pack/catalogPins.ts) — the pinned-or-refuse anchor the curated
// catalog grants its trust tiers against.
//
// Usage: node scripts/generate-pack-manifests.mjs [--check|--write] [--packs-dir <dir>] [--pins <path>]
//
//   default        verify every packs/<id>/ against its own pack.json
//                  integrity map (per-file SHA-256, both directions), then
//                  rewrite the pins module with the recomputed aggregate
//                  content SHAs. The pins module is the only repo file this
//                  mode writes; a drifted pack fails the run instead of being
//                  re-pinned silently.
//   --check        verify the packs AND that the pins module matches the
//                  recomputed aggregates; writes nothing (CI-able drift gate).
//   --write        maintenance mode for future pack edits: additionally
//                  rewrite each pack.json integrity map from the bytes on
//                  disk. Pack bodies and manifests are owned by their pack
//                  units, so run this against a staged copy (--packs-dir)
//                  unless the pack edit itself is deliberate.
//   --packs-dir    packs root (default <repo>/packs). Requires an explicit
//                  --pins, so a staged run can never touch the repo pins.
//   --pins         pins module path (default <repo>/src/pack/catalogPins.ts).
//
// Thin by design: the aggregate SHA algorithm, the manifest schema, the
// content walk and the integrity verification are all imported from
// src/pack/trust.ts and src/pack/manifest.ts — this script re-implements
// none of them, so it cannot drift from what `add` verifies at install time.
//
// The imports are TypeScript and there is no build step here on purpose — a
// generator that needs `npm run build` first goes stale the moment someone
// skips the build. Node strips the types itself from v22.18 onward; on the
// repo's declared floor (22.12) the same capability sits behind
// --experimental-strip-types, so this script re-execs itself once with the
// flag rather than asking a maintainer to remember it. The re-exec must
// happen before any TypeScript is loaded, which is why the imports below are
// dynamic.
//
// Exit codes: 0 ok, 1 verification or write failure, 2 bad arguments.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const ROOT = resolve(SELF, '..', '..')

if (!process.features.typescript) {
  // Re-exec once, never twice: a Node build that still cannot strip types with
  // the flag on would otherwise respawn itself forever.
  if (process.execArgv.includes('--experimental-strip-types')) {
    console.error(
      `This Node build (${process.version}) cannot strip TypeScript types, so the engine ` +
        'modules cannot be loaded. Run the generator on Node >=22.12.',
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
  console.error(
    `${problem}\nUsage: node scripts/generate-pack-manifests.mjs [--check|--write] [--packs-dir <dir>] [--pins <path>]`,
  )
  process.exit(2)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

const args = process.argv.slice(2)
let mode = 'generate'
let packsDirArg = null
let pinsArg = null
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (arg === '--check' || arg === '--write') {
    if (mode !== 'generate') usage('Pass at most one of --check / --write.')
    mode = arg.slice(2)
  } else if (arg === '--packs-dir') {
    i += 1
    if (i >= args.length) usage('--packs-dir needs a path.')
    packsDirArg = args[i]
  } else if (arg === '--pins') {
    i += 1
    if (i >= args.length) usage('--pins needs a path.')
    pinsArg = args[i]
  } else {
    usage(`Unknown argument: ${arg}`)
  }
}
if (packsDirArg !== null && pinsArg === null) {
  usage('--packs-dir requires an explicit --pins, so a staged run cannot touch the repo pins module.')
}

const packsDir = packsDirArg === null ? resolve(ROOT, 'packs') : resolve(packsDirArg)
const pinsPath = pinsArg === null ? resolve(ROOT, 'src', 'pack', 'catalogPins.ts') : resolve(pinsArg)

const { computeAggregateContentSha } = await import('../src/pack/trust.ts')
const { PACK_MANIFEST_FILE, enumeratePackContent, readPackManifest, verifyIntegrityMap } =
  await import('../src/pack/manifest.ts')
const { atomicWriteFile } = await import('../src/merge/atomicWrite.ts')

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function sha256File(absPath, label) {
  try {
    return sha256(await readFile(absPath))
  } catch (err) {
    throw new Error(`${label}: cannot hash ${absPath} (${err.code ?? err.message})`, { cause: err })
  }
}

/** Pack ids = the subdirectory names under the packs root, sorted. */
async function listPackIds(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    fail(`No packs directory at ${dir}.`)
  }
  const ids = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted()
  if (ids.length === 0) fail(`No pack directories under ${dir}.`)
  return ids
}

/**
 * Rebuild a pack's integrity map from the bytes on disk: every enumerated
 * content file, plus any pack-root metadata key the current map already lists
 * (a detached signing bundle sitting next to pack.json) re-hashed in place. A
 * listed root-metadata file that is missing fails the run — dropping the entry
 * silently would un-pin a file the author deliberately listed.
 */
async function rebuildIntegrity(id, root, manifest, files) {
  const rebuilt = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file.relPath,
        await sha256File(file.absPath, `packs/${id}`),
      ]),
    ),
  )
  const rootMetadata = Object.keys(manifest.integrity).filter((key) => !key.includes('/'))
  await Promise.all(
    rootMetadata.map(async (key) => {
      try {
        rebuilt[key] = sha256(await readFile(join(root, key)))
      } catch {
        throw new Error(
          `packs/${id}: integrity lists pack-root metadata ${JSON.stringify(key)} but the file is missing; ` +
            'remove the entry from pack.json or restore the file before regenerating.',
        )
      }
    }),
  )
  return Object.fromEntries(Object.entries(rebuilt).toSorted(([a], [b]) => (a < b ? -1 : 1)))
}

/**
 * Rewrite only the `integrity` field, preserving the manifest's other fields
 * and their authored order: the pack unit owns the prose of its manifest, the
 * generator owns the digests.
 */
async function writeManifestIntegrity(manifestPath, integrity) {
  const raw = JSON.parse(await readFile(manifestPath, 'utf8'))
  raw.integrity = integrity
  await atomicWriteFile(manifestPath, `${JSON.stringify(raw, null, 2)}\n`)
}

/** Verify (or in write mode regenerate) one pack; returns its aggregate SHA. */
async function processPack(id) {
  const root = join(packsDir, id)
  const manifest = await readPackManifest(root)
  if (manifest.name !== id) {
    throw new Error(
      `packs/${id}: manifest \`name\` ${JSON.stringify(manifest.name)} must equal the directory name — ` +
        'catalog pins are keyed by the directory id.',
    )
  }
  const files = await enumeratePackContent(root)
  if (mode === 'write') {
    const rebuilt = await rebuildIntegrity(id, root, manifest, files)
    await writeManifestIntegrity(join(root, PACK_MANIFEST_FILE), rebuilt)
    return computeAggregateContentSha(rebuilt)
  }
  await verifyIntegrityMap(root, manifest, files)
  return computeAggregateContentSha(manifest.integrity)
}

function renderPinsModule(pins) {
  const rows = Object.entries(pins)
    .toSorted(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, sha]) => `  "${id}": "${sha}",`)
    .join('\n')
  return (
    '/**\n' +
    ' * GENERATED FILE — do not edit by hand.\n' +
    ' *\n' +
    ' * Aggregate content SHA-256 pins for the bundled first-party packs: one pin\n' +
    ' * per pack id, computed by `computeAggregateContentSha` (./trust.ts) over the\n' +
    ' * sorted `pack.json` integrity map. The curated catalog (./curated.ts) grants\n' +
    ' * its trust tiers against these exact digests — pinned-or-refuse — and the\n' +
    ' * pins-in-sync suite (test/pack/curated.test.ts) fails on any drift between\n' +
    ' * this module, the pack manifests, and the bytes on disk.\n' +
    ' *\n' +
    ' * Regenerate:  node scripts/generate-pack-manifests.mjs\n' +
    ' * Verify only: node scripts/generate-pack-manifests.mjs --check\n' +
    ' */\n' +
    'export const CATALOG_PINS: Record<string, string> = {\n' +
    `${rows}\n` +
    '};\n'
  )
}

/** Compare recomputed pins against the checked-in module; returns drift lines. */
async function diffAgainstPinsModule(pins) {
  let existing
  try {
    const mod = await import(pathToFileURL(pinsPath).href)
    existing = mod.CATALOG_PINS
  } catch {
    return [`pins module ${pinsPath} is missing or unloadable`]
  }
  if (existing === null || typeof existing !== 'object') {
    return [`pins module ${pinsPath} does not export a CATALOG_PINS record`]
  }
  const drift = []
  for (const [id, sha] of Object.entries(pins)) {
    const pinned = existing[id]
    if (pinned === undefined) drift.push(`pack "${id}" has no pin`)
    else if (pinned !== sha) drift.push(`pack "${id}": pinned ${pinned}, recomputed ${sha}`)
  }
  for (const id of Object.keys(existing)) {
    if (!(id in pins)) drift.push(`stale pin "${id}" names no pack directory`)
  }
  return drift
}

const ids = await listPackIds(packsDir)

// Packs are independent of each other; verify them concurrently and report
// every failure in one run rather than one per invocation.
const settled = await Promise.allSettled(ids.map((id) => processPack(id)))
const failures = settled
  .map((outcome, index) => ({ id: ids[index], outcome }))
  .filter(({ outcome }) => outcome.status === 'rejected')
  .map(({ id, outcome }) => `packs/${id}:\n${indent(String(outcome.reason?.message ?? outcome.reason))}`)
if (failures.length > 0) {
  fail(
    `Pack verification failed:\n${failures.join('\n')}\n` +
      'Fix the pack, or regenerate a deliberately edited copy with --write (staged copies only ' +
      'unless the pack edit itself is intended).',
  )
}

function indent(text) {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
}

const pins = Object.fromEntries(ids.map((id, index) => [id, settled[index].value]))

if (mode === 'check') {
  const drift = await diffAgainstPinsModule(pins)
  if (drift.length > 0) {
    fail(
      `Catalog pins out of sync:\n${drift.map((line) => `  - ${line}`).join('\n')}\n` +
        'Regenerate: node scripts/generate-pack-manifests.mjs',
    )
  }
  console.log(`Verified ${ids.length} pack(s) against ${packsDir}; pins in sync.`)
} else {
  const rendered = renderPinsModule(pins)
  const current = await readFile(pinsPath, 'utf8').catch(() => null)
  if (current === rendered) {
    console.log(`Verified ${ids.length} pack(s); ${pinsPath} unchanged.`)
  } else {
    await atomicWriteFile(pinsPath, rendered)
    console.log(`Verified ${ids.length} pack(s); wrote ${pinsPath}.`)
  }
}
