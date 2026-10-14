#!/usr/bin/env node
// Set a fork's identity in one command: the package.json identity fields and the Renovate preset
// that carries the package name as data.
//
// Usage: node scripts/fork-identity.mjs --repository <url> [--scope <npm-scope>]
//                                        [--registry <https-url>] [--check] [--help]
//        --repository  the fork's github.com repository: https://github.com/<owner>/<repo>,
//                      with or without a `git+` prefix and a `.git` suffix.
//        --scope       the npm scope, without the `@`. Defaults to the owner lowercased.
//                      The package is always `@<scope>/stamity`.
//        --registry    make this a CLI-publishing fork: `private` is removed and
//                      `publishConfig.registry` names this https registry. Without it the
//                      fork is private (`private: true`, no `publishConfig`), which is what
//                      a fork that does not publish its CLI to a registry wants.
//        --check       write nothing; exit 1 when a file differs from its target.
//
// Exit codes: 0 applied or already current, 1 invalid identity, dirty target or drift under
// --check, 2 bad arguments
//
// WHAT IT REPLACES. The copy-paste identity block of `docs/enterprise-forks.md` ("Set the
// private package's identity"). That block rewrote the presets with a plain `replaceAll`,
// which was not idempotent: a fork whose `<owner>/<repo>` starts with the route the preset
// already carries was rewritten a second time on every rerun. Here each preset value is read
// with JSON.parse and exactly that quoted JSON string is replaced, once, so a rerun meets a
// file already at its target and leaves it alone.
//
// WHAT IT DOES NOT DO. No history import, no workflow switching, no lockfile edit and no
// generator run: the guide keeps `npm install --package-lock-only` after this script, so the
// script stays offline. Since 1.15.0 it leaves `renovate/plugins.json` alone: the plugin route
// that preset served is deleted, and a fork still holding the file keeps it as it is.
// It lives in `scripts/`, outside the `src/` boundary map, and imports nothing from `src/`.
//
// ORDER. Every target is computed and validated before anything is written: the candidate
// manifest goes through `resolveDistributionIdentity`, so an identity the distribution scripts
// would refuse is refused here first. Then a file that would change and has uncommitted edits
// stops the run before any write, because overwriting it would discard work nobody reviewed.
// Then the writes, one temporary file and one rename each.

import { spawnSync } from 'node:child_process'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveDistributionIdentity } from './distribution-identity.mjs'
import { isMain } from './native-typescript.mjs'
import { REGISTRY_URL } from './registry-url.mjs'

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')

const USAGE = `Usage: node scripts/fork-identity.mjs --repository <url> [--scope <npm-scope>] [--registry <https-url>] [--check] [--help]
  --repository  https://github.com/<owner>/<repo> (a git+ prefix and a .git suffix are accepted)
  --scope       the npm scope without the @; defaults to the owner lowercased
  --registry    publish the CLI to this https registry instead of keeping the fork private
  --check       write nothing; exit 1 on drift`

/** npm's scope rule, as the plan states it: lowercase, and no leading dot or underscore. */
const SCOPE = /^[a-z0-9-~][a-z0-9-._~]*$/

/** The package.json identity keys (contract C1), in the order a changed-keys list names them. */
const IDENTITY_KEYS = ['name', 'repository', 'homepage', 'bugs', 'stamity.publisher', 'private', 'publishConfig']

class Refusal extends Error {}

function parseArgs(args) {
  const parsed = { check: false }
  const values = { '--repository': 'repository', '--scope': 'scope', '--registry': 'registry' }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--help' || arg === '-h') return { help: true }
    if (arg === '--check') {
      parsed.check = true
    } else if (Object.hasOwn(values, arg)) {
      const key = values[arg]
      i += 1
      if (i >= args.length) return { problem: `${arg} needs a value.` }
      if (parsed[key] !== undefined) return { problem: `${arg} is given twice.` }
      parsed[key] = args[i]
    } else {
      return { problem: unknownArgument(arg) }
    }
  }
  if (parsed.repository === undefined) return { problem: '--repository is required.' }
  return parsed
}

/** A flag's name, the only part of an argv token that is ever printed. */
const FLAG_NAME = /^--?[A-Za-z][A-Za-z0-9-]*$/

/**
 * The refusal for an argument the table does not know, naming at most the flag. A value is never
 * echoed: `--repository=<url>`, `--registry=<url>` and a bare positional URL all arrive here, and
 * a URL with a token in its userinfo is the input the two value refusals already withhold.
 */
function unknownArgument(arg) {
  if (FLAG_NAME.test(arg)) return `Unknown argument: ${arg}`
  const at = arg.indexOf('=')
  const name = at === -1 ? '' : arg.slice(0, at)
  if (FLAG_NAME.test(name)) {
    return `Unknown argument: ${name}=<value>; the value is not echoed. Give the value as the next argument: ${name} <value>.`
  }
  return 'Unknown argument: a value with no flag before it; the value is not echoed.'
}

/** `<owner>/<repo>` from the accepted spellings; the resolver re-validates both slugs. */
function parseRepository(value) {
  const bare = value.replace(/^git\+/, '').replace(/\.git$/, '')
  const match = /^https:\/\/github\.com\/([^/?#@:]+)\/([^/?#@:]+)$/.exec(bare)
  if (match === null) {
    // Not echoed: a repository URL with a token in its userinfo is the shape this refusal
    // exists for, and printing it would put the token in a terminal log.
    throw new Refusal(
      '--repository must be https://github.com/<owner>/<repo> (a git+ prefix and a .git suffix are accepted), ' +
        'with no credentials, query, fragment or extra path; the value is not echoed.',
    )
  }
  return { owner: match[1], repo: match[2] }
}

/**
 * The registry rule every pinned CLI call applies (`REGISTRY_URL` in `src/shared/cliCall.ts`, read
 * here through its restatement in `scripts/registry-url.mjs`): plain https, a host, an optional
 * port and path, and no userinfo, query, fragment, `%` escape, space or shell character. The value
 * becomes `publishConfig.registry`, which every call the fork prints names for its scope, and the
 * CLI renders `npx --no` for a registry outside the rule (REQ-PLUGIN-048). Refusing it here tells
 * the operator at fork time instead of leaving a fork whose every call silently stops fetching.
 * Exported so `test/ci/forkIdentityScript.test.ts` holds it to the CLI's grammar.
 */
export function requireCleanRegistry(value) {
  if (typeof value !== 'string' || !REGISTRY_URL.test(value)) {
    throw new Refusal(
      '--registry must be a plain https URL, the rule every pinned CLI call applies to the registry it names: ' +
        'https://<host>[:<port>][/<path>], the host of letters, digits, . and -, the path of letters, digits, ' +
        '. _ ~ / and -, so no credentials, query, fragment, % escape, space or shell character; the value is not echoed.',
    )
  }
  return value
}

/** The target manifest: C1 set, every other key and its position kept. */
function targetManifest(pkg, { owner, repo, scope, registry }) {
  const url = `https://github.com/${owner}/${repo}`
  const next = structuredClone(pkg)
  next.name = `@${scope}/stamity`
  next.repository = { type: 'git', url: `git+${url}.git` }
  next.homepage = url
  next.bugs = { url: `${url}/issues` }
  const stamity = next.stamity === undefined ? {} : next.stamity
  if (stamity === null || typeof stamity !== 'object' || Array.isArray(stamity)) {
    throw new Refusal('package.json `stamity` must be an object.')
  }
  stamity.publisher = owner
  next.stamity = stamity
  if (registry === undefined) {
    next.private = true
    delete next.publishConfig
  } else {
    delete next.private
    next.publishConfig = { registry }
  }
  return next
}

function identityValue(pkg, key) {
  return key === 'stamity.publisher' ? pkg.stamity?.publisher : pkg[key]
}

/** Read and parse one JSON target, LF-normalized so a CRLF checkout compares by content. */
function readJson(relPath) {
  let bytes
  try {
    bytes = readFileSync(join(ROOT, relPath), 'utf8')
  } catch {
    throw new Refusal(`cannot read ${relPath}; run the script from a stamity checkout.`)
  }
  const text = bytes.replaceAll('\r\n', '\n')
  try {
    return { bytes, text, value: JSON.parse(text) }
  } catch {
    throw new Refusal(`${relPath} is not valid JSON; fix it and rerun.`)
  }
}

/**
 * The preset's target, keeping the file's hand formatting: the current value is found by
 * parsing, and exactly its quoted JSON spelling is replaced once. The result is parsed again and
 * must equal the original with only that value changed, so a first occurrence that turned out to
 * be some other key's value is refused rather than written. `label` is the key a report names.
 */
function retargetPreset(relPath, { locate, key, label, target }) {
  const { bytes, text, value } = readJson(relPath)
  const current = locate(value)?.[key]
  if (typeof current !== 'string') {
    throw new Refusal(`${relPath} carries no ${label} value where the preset keeps it; restore the file from upstream.`)
  }
  if (current === target) return { relPath, bytes, text, keys: [] }
  const expected = structuredClone(value)
  locate(expected)[key] = target
  const quoted = JSON.stringify(current)
  const at = text.indexOf(quoted)
  const next = at === -1 ? text : `${text.slice(0, at)}${JSON.stringify(target)}${text.slice(at + quoted.length)}`
  if (at === -1 || JSON.stringify(JSON.parse(next)) !== JSON.stringify(expected)) {
    throw new Refusal(`${relPath}: could not rewrite ${label} in place; restore the file from upstream and rerun.`)
  }
  return { relPath, bytes, text: next, keys: [label] }
}

/** Every target file, computed and validated; nothing is written here. */
function plan(options) {
  const manifest = readJson('package.json')
  const pkg = targetManifest(manifest.value, options)
  try {
    resolveDistributionIdentity(pkg)
  } catch (error) {
    // The resolver's messages name the field and never echo a URL.
    throw new Refusal(`invalid identity: ${error instanceof Error ? error.message : String(error)}`)
  }
  return [
    {
      relPath: 'package.json',
      bytes: manifest.bytes,
      text: `${JSON.stringify(pkg, null, 2)}\n`,
      keys: IDENTITY_KEYS.filter(
        (key) => JSON.stringify(identityValue(manifest.value, key)) !== JSON.stringify(identityValue(pkg, key)),
      ),
    },
    // The npm package the preset pins: the first entry of the array, located one level down.
    retargetPreset('renovate/companion.json', {
      locate: (value) => value?.packageRules?.[0]?.matchPackageNames,
      key: 0,
      label: 'matchPackageNames',
      target: pkg.name,
    }),
  ]
}

/** The keys a changed file differs in; a file that differs only in bytes is a line-ending change. */
function describe(file) {
  return file.keys.length > 0 ? file.keys.join(', ') : 'line endings'
}

function dirty(relPath) {
  const status = spawnSync('git', ['status', '--porcelain', '--', relPath], { cwd: ROOT, encoding: 'utf8' })
  if (status.status !== 0) {
    throw new Refusal(`cannot read git status for ${relPath}; run the script inside the fork's git checkout.`)
  }
  return status.stdout.trim() !== ''
}

/** One temporary file and one rename; a failed rename removes the temporary file before it rethrows. */
export function replaceFile(path, text) {
  const temporary = `${path}.tmp-${process.pid}`
  writeFileSync(temporary, text)
  try {
    renameSync(temporary, path)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
}

function write(relPath, text) {
  replaceFile(join(ROOT, relPath), text)
}

function main(args) {
  const parsed = parseArgs(args)
  if (parsed.help) {
    console.log(USAGE)
    return 0
  }
  if (parsed.problem !== undefined) {
    console.error(`${parsed.problem}\n${USAGE}`)
    return 2
  }

  const { owner, repo } = parseRepository(parsed.repository)
  const scope = parsed.scope ?? owner.toLowerCase()
  if (!SCOPE.test(scope)) {
    throw new Refusal('--scope must be an npm scope without the @: lowercase letters, digits, -, ., _ or ~.')
  }
  const registry = parsed.registry === undefined ? undefined : requireCleanRegistry(parsed.registry)

  const files = plan({ owner, repo, scope, registry })
  const changing = files.filter((file) => file.text !== file.bytes)

  if (parsed.check) {
    for (const file of files) {
      console.log(file.text === file.bytes ? `unchanged ${file.relPath}` : `drift ${file.relPath} (${describe(file)})`)
    }
    if (changing.length > 0) return 1
  } else {
    const refused = changing.filter((file) => dirty(file.relPath))
    if (refused.length > 0) {
      for (const file of refused) {
        console.error(`fork-identity: ${file.relPath} has uncommitted changes and would be rewritten; commit or discard them first.`)
      }
      return 1
    }
    for (const file of files) {
      if (file.text === file.bytes) {
        console.log(`unchanged ${file.relPath}`)
      } else {
        write(file.relPath, file.text)
        console.log(`updated ${file.relPath} (${describe(file)})`)
      }
    }
  }
  console.log(`identity: @${scope}/stamity published by ${owner}`)
  return 0
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    if (!(error instanceof Refusal)) throw error
    console.error(`fork-identity: ${error.message}`)
    process.exitCode = 1
  }
}
