#!/usr/bin/env node
// Contributor storage helper. Importing it performs no I/O and changes no eval harness.
import { lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Preserve all summary facts, removing only the two archived copies of detailed samples. */
export function compactSummary(summary, manifest = 'ARCHIVE.json') {
  if (manifest !== 'ARCHIVE.json') throw new Error('summary storage requires an adjacent ARCHIVE.json reference')
  if (!object(summary) || (summary.aggregate != null && !object(summary.aggregate)))
    throw new Error('summary must be a JSON object with an object or null aggregate')
  if (Object.hasOwn(summary, 'archiveStorage')) throw new Error('summary already has storage metadata; use the original archived summary')
  const compact = structuredClone(summary)
  delete compact.coverage
  if (object(compact.aggregate)) delete compact.aggregate.rows
  compact.archiveStorage = { kind: 'compact-summary', manifest, originalPath: 'summary.json' }
  return compact
}

const relativePath = value => typeof value === 'string' && value.length > 0 &&
  !value.includes('\\') && !value.includes(':') &&
  [...value].every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127) &&
  value.split('/').every(part => part.length > 0 && part !== '.' && part !== '..')

function validManifest(value) {
  const source = value?.source, archive = value?.archive
  if (value?.schemaVersion !== 1 || value.format !== 'tar.gz' ||
      !/^[\w.-]+\/[\w.-]+$/.test(source?.repository ?? '') ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(source?.commit ?? '') ||
      !['git', 'working-tree'].includes(source?.capture) ||
      !Array.isArray(source?.paths) || source.paths.length === 0 || !source.paths.every(relativePath) ||
      !/^[\w.-]+\.tar\.gz$/.test(archive?.file ?? '') ||
      !/^[a-f0-9]{64}$/.test(archive?.sha256 ?? '') ||
      !Number.isSafeInteger(archive?.bytes) || archive.bytes <= 0 ||
      !Number.isSafeInteger(value.files) || value.files <= 0 ||
      !Number.isSafeInteger(value.payloadBytes) || value.payloadBytes < 0) return false
  try {
    const url = new URL(archive.url)
    const prefix = `/${source.repository}/releases/download/`
    const tail = url.pathname.slice(prefix.length).split('/')
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.port &&
      !url.username && !url.password && !url.search && !url.hash && url.pathname.startsWith(prefix) &&
      tail.length === 2 && tail[0].length > 0 && decodeURIComponent(tail[1]) === archive.file
  } catch {
    // Invalid URL data is rejected without echoing any untrusted pointer content.
    return false
  }
}

function readJson(path, label) {
  try {
    if (!lstatSync(path).isFile()) throw new Error('not a regular file')
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    // JSON parse errors may quote source content; keep diagnostics at the operation boundary.
    throw new Error(`could not read valid JSON from the ${label} regular file`)
  }
}

function main(args) {
  const options = {}
  for (let index = 0; index < args.length; index++) {
    const key = args[index].slice(2)
    if (!args[index].startsWith('--') || !['source', 'output', 'manifest'].includes(key) ||
        Object.hasOwn(options, key) || !args[index + 1] || args[index + 1].startsWith('--'))
      throw new Error('usage: node scripts/evidence-summary.mjs --source FILE --output NEWFILE --manifest ARCHIVE.json')
    options[key] = args[++index]
  }
  if (!options.source || !options.output || !options.manifest)
    throw new Error('source, output and manifest are required')
  const source = resolve(options.source), output = resolve(options.output), manifest = resolve(options.manifest)
  if (source === output) throw new Error('source and output must be different paths')
  if (basename(manifest) !== 'ARCHIVE.json') throw new Error('manifest file must be named ARCHIVE.json')
  if (!validManifest(readJson(manifest, 'archive pointer')))
    throw new Error('invalid archive pointer: require source identity, safe paths, hash, counts and a published GitHub Release asset URL')
  const compact = compactSummary(readJson(source, 'source summary'))
  const body = `${JSON.stringify(compact, null, 2)}\n`
  try { writeFileSync(output, body, { flag: 'wx', mode: 0o644 }) }
  catch {
    // Exclusive creation refuses existing outputs, including source aliases and symlinks.
    throw new Error('could not create output; choose a new file in an existing writable directory')
  }
  console.log(`evidence-summary: wrote ${Buffer.byteLength(body)} bytes; source and archive pointer unchanged`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main(process.argv.slice(2)) }
  catch (error) {
    console.error(`evidence-summary: ${error.message}`)
    process.exitCode = 1
  }
}
