#!/usr/bin/env node
// The per-client ROUTE PROOF: does a built plugin root install through the client's own route, get
// discovered under the form the root declares, and run its setup command in a real repository?
// (REQ-PLUGIN-020.)
//
// Every gate in this repository so far has read the BYTES a build produces — the manifest against
// its vendor schema, the capability file against its reader, the archive against its digest. Not
// one of them has watched a client take the tree. That is the gap this script measures, and it
// measures it in four legs per client, deliberately separate, because they cost different things
// and only the first of them can gate CI:
//
//   structure    no binary, no credential, no network. The root's `stamity-plugin.json` parses and
//                validates, every CARRIED class's declared count equals what the tree actually
//                holds, and the container manifest satisfies the vendored vendor schema. This is
//                the leg a pull request blocks on.
//   install      the client's own install command, in a scratch home wherever the client honours
//                one. What it proves is the DEPLOYED TREE, not an exit code: a marketplace entry a
//                client cannot resolve is skipped silently, so the bytes under the client's own
//                cache are compared file by file with the root that was installed.
//   discovery    the client's listing where one exists without a model call, otherwise the
//                invocation transcript. The leg resolves the marker ids the root carries (`st-work`
//                where a command class rides, `stamity-reviewer` where agents ride, a carried skill
//                otherwise) under the form `stamity-plugin.json` declares for that class.
//   invocation   `--invoke` only, and the instrument is a FILE: the prompt asks the client to run
//                the root's `st-setup`, and the leg passes when the scratch repository grows a
//                `.stamity/manifest.json` carrying `plugin.mode: "plugin-backed"` and its own
//                client under `plugin.clients`. The model's reply is never the evidence — the same
//                posture `scripts/qa/hook-runs.mjs` takes for a hook that either fired or did not.
//
// A LEG THAT COULD NOT RUN IS NEVER GREEN. A client with no binary records every binary-bound leg
// as `SKIPPED (STAMITY_<CLIENT>_BIN unset)`; a leg that needs a model call without `--invoke` is
// `SKIPPED (needs --invoke)`; a leg that would have to write a credential somewhere is `SKIPPED`
// with that reason. The one thing this script must never do is report an unrun check as a pass.
//
// THE LEGS ARE REPORTED IN ORDER, NOT NECESSARILY RUN IN IT. Claude publishes no listing that names
// a plugin's commands without a model call, so its discovery leg reads the markers out of the
// invocation transcript — one model call answers both, and the two legs still print in the fixed
// order so a reader compares clients row by row.
//
// CREDENTIALS. Copilot keeps its login under the real `COPILOT_HOME` and Codex under the real
// `CODEX_HOME`, so those two clients' `--invoke` legs install into the REAL home and remove
// themselves in a `finally`; their install legs stay in scratch homes. Claude and Cursor inherit
// the environment, because their logins live outside the scratch repository the run happens in.
// Every leg's reason names the home it used. Nothing here writes, copies or prints a credential.
//
// Exit codes: 0 no leg failed, 1 at least one leg FAILED, 2 the smoke could not run (bad
// arguments, a `--dist` that is absent or is not a distribution root).
//
// Usage: node scripts/plugin-route-smoke.mjs --dist <dir> [--client <csv>]
//        [--bin-claude <path>] [--bin-cursor <path>] [--bin-copilot <path>] [--bin-codex <path>]
//        [--invoke] [--scratch <dir>] [--json <path>]

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DISTRIBUTION_CLIENTS } from './distribution-identity.mjs'
import { CATALOG_PATHS } from './plugins/catalogs.mjs'
import { INVOCATION_NOTE_KEYS, validateCapabilityFile } from './plugins/capability.mjs'
import * as claudeContainer from './plugins/clients/claude.mjs'
import * as codexContainer from './plugins/clients/codex.mjs'
import * as copilotContainer from './plugins/clients/copilot.mjs'
import * as cursorContainer from './plugins/clients/cursor.mjs'
// The same limitation, from the module that measured it: a shell-less spawn on Windows resolves
// `.exe`/`.com` and nothing else, so an npm `.cmd` shim reads as an absent binary. Imported rather
// than restated, because a second copy of a sentence is a pin that drifts.
import { exitDescription, WINDOWS_PROBE_LIMIT } from './qa/hook-runs.mjs'

const SELF = fileURLToPath(import.meta.url)
const ROOT = resolve(SELF, '..', '..')

const USAGE =
  'Usage: node scripts/plugin-route-smoke.mjs --dist <dir> [--client <csv>]\n' +
  '       [--bin-claude <path>] [--bin-cursor <path>] [--bin-copilot <path>] [--bin-codex <path>]\n' +
  '       [--invoke] [--scratch <dir>] [--json <path>]'

/** The four legs, in the order every client reports them. */
export const LEGS = ['structure', 'install', 'discovery', 'invocation']

/** Wall-clock ceiling on one client call. A client that hangs is a finding, not a reason to wait. */
const CLIENT_TIMEOUT_MS = 300_000

/**
 * Ceiling on one REMOVAL call, and it is short on purpose: the removals run while the process is
 * trying to stop, and a removal that hangs would hold a stop open for as long as a client call may.
 */
const CLEANUP_CALL_MS = 60_000

/** The capability file every root carries, at its one fixed name. */
const CAPABILITY_FILE = 'stamity-plugin.json'

/** The containers, keyed the way every surface in this repository keys them. */
const CONTAINERS = { claude: claudeContainer, cursor: cursorContainer, copilot: copilotContainer, codex: codexContainer }

/** Where the vendored vendor documents live — the same fixtures the four package suites read. */
const FIXTURES = join(ROOT, 'test', 'fixtures', 'plugins')

/**
 * The vendor document each container manifest is judged against.
 *
 * Three of them are JSON Schema and are applied by {@link schemaDefects}. Cursor publishes no
 * schema at all, so its fixture is a hand transcription of the fields its reference page documents
 * and is applied by {@link transcriptionDefects} — the same split `test/ci/pluginPackages.*.test.ts`
 * makes, for the same reason: what cannot be fetched cannot be validated, only compared.
 */
const MANIFEST_DOCUMENT = {
  claude: { fixture: 'claude-code-plugin-manifest.schema.json', kind: 'schema' },
  cursor: { fixture: 'cursor-plugin-fields.json', kind: 'transcription' },
  copilot: { fixture: 'agent-plugins-1.0.0.schema.json', kind: 'schema' },
  codex: { fixture: 'agent-plugins-1.0.0.schema.json', kind: 'schema' },
}

/**
 * How each root's CARRIED classes are counted back out of the tree.
 *
 * This mirrors `buildClasses` in `scripts/plugins/layout.mjs`, which is the only place the counts
 * are computed on the way in: agents, commands and rules count FILES, skills count top-level
 * DIRECTORIES under `skills/`, and hooks count hook SCRIPTS rather than the two JSON documents
 * beside them. Each entry names the directory the class lands in for THAT client, read off
 * `scripts/plugins/clients/<client>.mjs`'s own `place`.
 *
 * `classes` is a LIST because two classes can share one directory: Cursor delivers a command as a
 * skill carrying `disable-model-invocation`, so its ten commands and its eight skills are eighteen
 * directories under `skills/` and only their SUM is provable from the tree. A group of two states
 * that, and a proof that claimed more would be claiming something the bytes do not carry.
 */
const COUNT_RULES = {
  claude: [
    { classes: ['agent'], dir: 'agents', kind: 'files' },
    { classes: ['command'], dir: 'commands', kind: 'files' },
    { classes: ['skill'], dir: 'skills', kind: 'directories' },
    { classes: ['hooks'], dir: 'hooks', kind: 'scripts' },
  ],
  cursor: [
    { classes: ['agent'], dir: 'agents', kind: 'files' },
    { classes: ['rule'], dir: 'rules', kind: 'files' },
    { classes: ['skill', 'command'], dir: 'skills', kind: 'directories' },
    { classes: ['hooks'], dir: 'hooks', kind: 'scripts' },
  ],
  copilot: [
    { classes: ['agent'], dir: 'com.github.copilot/agents', kind: 'files' },
    { classes: ['command'], dir: 'com.github.copilot/commands', kind: 'files' },
    { classes: ['skill'], dir: 'skills', kind: 'directories' },
    { classes: ['hooks'], dir: 'hooks', kind: 'scripts' },
  ],
  codex: [
    { classes: ['skill'], dir: 'skills', kind: 'directories' },
    { classes: ['hooks'], dir: 'hooks', kind: 'scripts' },
  ],
}

/**
 * The marker a discovery leg looks for, per class, and the id it prefers.
 *
 * `st-work` is the id the plan names, and it is the right marker for every root that carries a
 * COMMAND class. The Codex container carries none — no agents either — so its markers come from
 * the one class it does carry, and a leg that searched a Codex transcript for `st-work` would be
 * searching for an id that root cannot hold. The preference is checked against the tree before it
 * is used, so a corpus that renames the id produces a leg that says so rather than a false red.
 */
const MARKER_PREFERENCE = { command: 'st-work', agent: 'stamity-reviewer', skill: 'st-qa' }

/** What a plugin-backed repository's own manifest says once `st-setup` has run. */
const PLUGIN_MODE = 'plugin-backed'

/** The id of the one command a root GENERATES, and the only id an invocation leg asks for. */
const SETUP_ID = 'st-setup'

/**
 * Set by a `SIGTERM`/`SIGINT` handler, read between client calls.
 *
 * The signal path only works because {@link call} YIELDS after every spawn. Node runs a signal
 * handler on the event loop, and this script's work is a chain of blocking `spawnSync` calls — so a
 * handler registered in a synchronous run cannot fire until the whole run is over, by which time the
 * `finally` has already cleaned up and every remaining leg has been walked. Each call therefore
 * hands control back to the loop once, which is the point at which a queued handler runs, sets this
 * flag, and removes whatever a real-home install added; the next call refuses to spawn and the run
 * unwinds through its `finally` blocks with the remaining legs recorded as stopped.
 *
 * The residual, precisely: a signal CANNOT interrupt the client call already in flight (up to
 * {@link CLIENT_TIMEOUT_MS}), and `SIGKILL` cannot be handled at all — so a caller that wants the
 * cleanup to happen sends `SIGTERM` and waits out one call before escalating, which is what
 * `scripts/qa/plugin-runs.mjs` does and why its grace period is what it is.
 */
const stopped = { signal: null }

/** Thrown by {@link call} once a stop has been requested: the remaining legs are not measured. */
class RunStopped extends Error {
  constructor(signal) {
    super(`the run was stopped by ${signal} before this leg ran, so nothing about it was measured`)
    this.name = 'RunStopped'
    this.signal = signal
  }
}

/**
 * The one tool grant the Claude invocation leg passes, in the client's own pattern form.
 *
 * Every command `st-setup` runs is `node "<root>/runtime/locate.mjs" -- …`, so the grant names
 * `node` and leaves every other command needing an approval this headless run cannot give. Measured
 * on Claude Code 2.1.278 (2026-09-21): with this grant the setup command runs and the scratch
 * repository's `.stamity/manifest.json` appears.
 */
const CLAUDE_BASH_GRANT = 'Bash(node *)'

/**
 * The discovery ask, one wording for every client so a difference between rows is the client.
 *
 * It names NO id and NO invocation form, deliberately: every marker this script then looks for in
 * the answer is the client's own word rather than an echo of the question. The first `--invoke` run
 * of this script (2026-09-20) asked the client to run a command BY NAME and then found that name in
 * the transcript, which measured the prompt. Asking for the literal an operator would type is what
 * makes the form half of the measurement mean anything.
 */
const DISCOVERY_PROMPT =
  'List every command, agent and skill this plugin provides, including any marked ' +
  'disable-model-invocation. For each one print the exact literal an operator would type to ' +
  'invoke it, one per line, and nothing else.'

const sha256 = (data) => createHash('sha256').update(data).digest('hex')

function usage(problem) {
  console.error(`plugin-route: ERROR - ${problem}\n${USAGE}`)
  return 2
}

/** Every regular file under `dir`, POSIX-relative and sorted. Absent directory -> no files. */
function treeFiles(dir, prefix = '') {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((entry) => {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) return treeFiles(join(dir, entry.name), rel)
      return entry.isFile() ? [rel] : []
    })
}

/**
 * `{ <relative path>: <sha256 of its bytes> }` over a tree, minus the bundled runtime.
 *
 * `runtime/` is excluded because it is 600-odd files of packed tarball whose bytes have their own
 * owner (`test/ci/pluginRuntime.test.ts`) and whose presence would swamp the comparison this leg is
 * about: what the CONTAINER carries. That leaves a gap the install leg cannot close on its own — the
 * invocation leg runs `runtime/locate.mjs` out of the very tree the client installed, so a cached
 * runtime that arrived truncated would fail THERE, which is where a broken runtime should be
 * noticed. The two legs cover it together; neither claims the other's ground.
 */
function treeDigest(dir) {
  const map = {}
  for (const rel of treeFiles(dir)) {
    if (rel === 'runtime' || rel.startsWith('runtime/')) continue
    map[rel] = sha256(readFileSync(join(dir, ...rel.split('/'))))
  }
  return map
}

/** Top-level directory names under `dir`, sorted. */
function directoriesIn(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted()
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function isDirectory(path) {
  return existsSync(path) && statSync(path).isDirectory()
}

// ── the vendored vendor documents ────────────────────────────────────────────

/** Annotation keywords: present in a vendor's document, constraining nothing. */
const ANNOTATIONS = new Set(['$schema', '$id', '$comment', 'title', 'description', 'examples', 'default'])

/** The draft-07 keywords this reader applies; any other is REPORTED, never ignored. */
const APPLIED = new Set([
  'type', 'const', 'enum', 'pattern', 'format', 'minLength', 'maxLength', 'exclusiveMinimum',
  'required', 'properties', 'additionalProperties', 'propertyNames', 'items', 'anyOf', 'allOf', 'not',
])

function typeOf(value) {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

/**
 * Defects of `value` against a JSON-Schema `node`, each naming its own JSON path.
 *
 * The same small reader `test/ci/pluginPackages.claude.test.ts` carries, for the same reason: five
 * to a dozen keywords is less code than a validator dependency, and a keyword the reader does not
 * apply is reported as a defect so a refreshed fixture cannot quietly stop constraining anything.
 */
function schemaDefects(value, node, path = '') {
  const at = path === '' ? '<root>' : path
  const defects = []
  for (const keyword of Object.keys(node)) {
    if (ANNOTATIONS.has(keyword) || APPLIED.has(keyword)) continue
    defects.push(`${at}: the vendor states \`${keyword}\`, which this reader does not apply`)
  }
  const actual = typeOf(value)
  if (node.type !== undefined && actual !== node.type && !(node.type === 'number' && actual === 'integer')) {
    defects.push(`${at}: must be ${node.type}, is ${actual}`)
    return defects
  }
  if (node.const !== undefined && value !== node.const) defects.push(`${at}: must be ${JSON.stringify(node.const)}`)
  if (node.enum !== undefined && !node.enum.includes(value)) {
    defects.push(`${at}: ${JSON.stringify(value)} is not one of the values the vendor enumerates`)
  }
  if (typeof value === 'string') {
    if (node.pattern !== undefined && !new RegExp(node.pattern, 'u').test(value)) {
      defects.push(`${at}: ${JSON.stringify(value)} does not match ${node.pattern}`)
    }
    if (node.minLength !== undefined && value.length < node.minLength) {
      defects.push(`${at}: must be at least ${node.minLength} character(s)`)
    }
    if (node.maxLength !== undefined && value.length > node.maxLength) {
      defects.push(`${at}: must be at most ${node.maxLength} character(s)`)
    }
    if (node.format === 'uri' && !URL.canParse(value)) defects.push(`${at}: ${JSON.stringify(value)} is not a URI`)
  }
  if (typeof value === 'number' && node.exclusiveMinimum !== undefined && value <= node.exclusiveMinimum) {
    defects.push(`${at}: must be greater than ${node.exclusiveMinimum}`)
  }
  if (Array.isArray(value) && node.items !== undefined) {
    for (const [index, entry] of value.entries()) defects.push(...schemaDefects(entry, node.items, `${at}[${index}]`))
  }
  if (typeOf(value) === 'object') {
    for (const key of node.required ?? []) {
      if (!Object.hasOwn(value, key)) defects.push(`${at}: the vendor requires \`${key}\``)
    }
    for (const [key, entry] of Object.entries(value)) {
      const child = node.properties?.[key]
      if (child !== undefined) defects.push(...schemaDefects(entry, child, `${at}.${key}`))
      else if (node.additionalProperties === false) defects.push(`${at}.${key}: is not a key the vendor names`)
      else if (typeof node.additionalProperties === 'object' && node.additionalProperties !== null) {
        defects.push(...schemaDefects(entry, node.additionalProperties, `${at}.${key}`))
      }
      if (node.propertyNames !== undefined) defects.push(...schemaDefects(key, node.propertyNames, `${at}: key ${key}`))
    }
  }
  for (const [index, branch] of (node.allOf ?? []).entries()) {
    defects.push(...schemaDefects(value, branch, `${at} (allOf[${index}])`))
  }
  if (node.anyOf !== undefined && !node.anyOf.some((branch) => schemaDefects(value, branch, at).length === 0)) {
    defects.push(`${at}: ${JSON.stringify(value)} satisfies none of the ${node.anyOf.length} forms the vendor allows`)
  }
  if (node.not !== undefined && schemaDefects(value, node.not, at).length === 0) {
    defects.push(`${at}: matches a form the vendor forbids`)
  }
  return defects
}

/** Defects against a hand transcription of a vendor page that publishes no schema (Cursor). */
function transcriptionDefects(manifest, transcription) {
  const defects = []
  if (typeOf(manifest) !== 'object') return ['<root>: must be a JSON object']
  for (const key of transcription.required ?? []) {
    if (!Object.hasOwn(manifest, key)) defects.push(`<root>: the vendor requires \`${key}\``)
  }
  for (const key of Object.keys(manifest).toSorted()) {
    if (!(transcription.fields ?? []).includes(key)) {
      defects.push(`<root>.${key}: is not a field ${transcription.source?.url ?? 'the vendor page'} documents`)
    }
  }
  return defects
}

/** One manifest, judged by the document its client publishes. */
function manifestDefects(client, manifest) {
  const { fixture, kind } = MANIFEST_DOCUMENT[client]
  const document = readJson(join(FIXTURES, fixture))
  const defects = kind === 'schema' ? schemaDefects(manifest, document) : transcriptionDefects(manifest, document)
  return { fixture, defects }
}

// ── the structure leg ────────────────────────────────────────────────────────

/** The count one rule reads off the tree. */
function countFor(root, rule) {
  const dir = join(root, ...rule.dir.split('/'))
  if (rule.kind === 'directories') return directoriesIn(dir).length
  const files = treeFiles(dir)
  // Hooks count SCRIPTS: the hook configuration document and the policy document beside them are
  // not hooks, which is the same rule `buildClasses` applies on the way in.
  if (rule.kind === 'scripts') return files.filter((rel) => rel.endsWith('.mjs')).length
  return files.length
}

/**
 * The credential-free leg, and the only one that gates a pull request.
 *
 * Three claims: the capability file is one its own reader admits, every CARRIED class's declared
 * count is the number of artifacts the tree holds for it, and the container manifest satisfies the
 * vendor document. A carried class with no counting rule is a FAILURE rather than a skip — it is a
 * new surface, and the layout's own refusal takes the same position.
 */
function structureLeg(client, root) {
  const capabilityPath = join(root, CAPABILITY_FILE)
  if (!isDirectory(root)) return leg('structure', 'FAIL', `no root at dist/${client}`)
  if (!existsSync(capabilityPath)) return leg('structure', 'FAIL', `dist/${client}/${CAPABILITY_FILE} is absent`)

  let capability
  try {
    capability = readJson(capabilityPath)
  } catch (error) {
    return leg('structure', 'FAIL', `dist/${client}/${CAPABILITY_FILE} does not parse: ${error.message}`)
  }
  const defects = validateCapabilityFile(capability)
  if (defects.length > 0) {
    return leg('structure', 'FAIL', `dist/${client}/${CAPABILITY_FILE} is invalid: ${defects.join('; ')}`)
  }
  if (capability.client !== client) {
    return leg('structure', 'FAIL', `dist/${client}/${CAPABILITY_FILE} declares client ${capability.client}`)
  }

  const carried = Object.keys(capability.classes).filter((name) => capability.classes[name].status === 'carried')
  const rules = COUNT_RULES[client]
  const unruled = carried.filter((name) => !rules.some((rule) => rule.classes.includes(name)))
  if (unruled.length > 0) {
    return leg(
      'structure',
      'FAIL',
      `dist/${client} carries ${unruled.join(', ')} and this smoke declares no counting rule for it: ` +
        'a carried class with no rule is a new surface, so add one beside the others in COUNT_RULES',
    )
  }

  const notes = []
  for (const rule of rules) {
    const mine = rule.classes.filter((name) => carried.includes(name))
    if (mine.length === 0) continue
    const declared = mine.reduce((sum, name) => sum + capability.classes[name].count, 0)
    const found = countFor(root, rule)
    const unit = rule.kind === 'directories' ? 'directory(ies)' : rule.kind === 'scripts' ? 'hook script(s)' : 'file(s)'
    // One class states its own count; two sharing a directory state a SUM, because that is all the
    // tree can prove about them (see COUNT_RULES).
    const claim = mine.map((name) => `${name} ${capability.classes[name].count}`).join(' + ')
    if (declared !== found) {
      return leg(
        'structure',
        'FAIL',
        `dist/${client} declares ${claim}${mine.length > 1 ? ` = ${declared}` : ''} but ${rule.dir}/ holds ${found} ${unit}`,
      )
    }
    notes.push(`${mine.join('+')} ${declared} = ${rule.dir}/`)
  }

  const manifestPath = CONTAINERS[client].MANIFEST_PATH
  const manifestAbsolute = join(root, ...manifestPath.split('/'))
  if (!existsSync(manifestAbsolute)) return leg('structure', 'FAIL', `dist/${client}/${manifestPath} is absent`)
  let manifest
  try {
    manifest = readJson(manifestAbsolute)
  } catch (error) {
    return leg('structure', 'FAIL', `dist/${client}/${manifestPath} does not parse: ${error.message}`)
  }
  const judged = manifestDefects(client, manifest)
  if (judged.defects.length > 0) {
    return leg('structure', 'FAIL', `dist/${client}/${manifestPath} against ${judged.fixture}: ${judged.defects.join('; ')}`)
  }

  return leg(
    'structure',
    'PASS',
    `${CAPABILITY_FILE} valid at version ${capability.version}; counts match (${notes.join(', ')}); ` +
      `${manifestPath} satisfies ${judged.fixture}`,
  )
}

// ── markers: what a discovery leg looks for, read off the root ───────────────

/**
 * The invocation forms a root declares, with the reserved note keys left out.
 *
 * `invocation.citation` is a sentence about where the forms were read, not a form an operator
 * types — `scripts/plugins/capability.mjs` reserves the key and the reader excludes it, so this
 * does too rather than offering a citation as something to type.
 */
function invocationForms(capability) {
  const forms = {}
  for (const [key, value] of Object.entries(capability.invocation ?? {})) {
    if (INVOCATION_NOTE_KEYS.includes(key)) continue
    forms[key] = value
  }
  return forms
}

/**
 * The markers this root must be discovered by: `{ class, id, form }`.
 *
 * A root carrying commands is asked for `st-work`, a root carrying agents for `stamity-reviewer`,
 * and a root carrying neither for one of its skills — the Codex case. The id is checked against the
 * tree, so a corpus rename produces a marker naming what is actually there.
 */
function markersFor(client, root, capability) {
  const forms = invocationForms(capability)
  const rules = COUNT_RULES[client]
  const markers = []
  const idsOf = (name) => {
    const rule = rules.find((entry) => entry.classes.includes(name))
    if (rule === undefined) return []
    const dir = join(root, ...rule.dir.split('/'))
    if (rule.kind === 'directories') return directoriesIn(dir)
    // An id is the file name up to its FIRST dot, not its last: this client's agents are
    // `<id>.agent.md` and its rules `<id>.mdc`, and stripping one extension would ask a transcript
    // for `stamity-reviewer.agent`. No id in this corpus carries a dot.
    return treeFiles(dir).map((rel) => (rel.split('/')[0] ?? '').split('.')[0])
  }
  for (const [name, plural] of [['command', 'commands'], ['agent', 'agents']]) {
    if (capability.classes[name]?.status !== 'carried') continue
    const ids = idsOf(name)
    const id = ids.includes(MARKER_PREFERENCE[name]) ? MARKER_PREFERENCE[name] : ids[0]
    if (id === undefined) continue
    markers.push({ class: name, id, form: (forms[plural] ?? '<id>').replaceAll('<id>', id) })
  }
  if (markers.length === 0 && capability.classes['skill']?.status === 'carried') {
    const ids = idsOf('skill')
    const id = ids.includes(MARKER_PREFERENCE['skill']) ? MARKER_PREFERENCE['skill'] : ids[0]
    if (id !== undefined) markers.push({ class: 'skill', id, form: (forms['skills'] ?? '<id>').replaceAll('<id>', id) })
  }
  return markers
}

/**
 * Resolve the markers against a transcript or a listing.
 *
 * The id is what decides the leg: a client asked to list its skills prints ids, and holding the
 * leg to the namespaced literal would fail a client that discovered the artifact perfectly well.
 * WHICH FORMS resolved is recorded beside it, because that measurement is the point for Claude —
 * the corpus cross-references the bare `/st-work`, and whether the installed client resolves it is
 * what the inbox row of 2026-09-17 waits on.
 */
function resolveMarkers(markers, transcript, extraForms = []) {
  const missing = []
  const notes = []
  for (const marker of markers) {
    const id = transcript.includes(marker.id)
    const form = transcript.includes(marker.form)
    if (!id) missing.push(marker.id)
    notes.push(`${marker.class} ${marker.id}: id ${id ? 'found' : 'ABSENT'}, declared form ${marker.form} ${form ? 'found' : 'absent'}`)
  }
  for (const form of extraForms) {
    notes.push(`alternate form ${form} ${transcript.includes(form) ? 'found' : 'absent'}`)
  }
  return { missing, notes }
}

/** Claude's bare command form beside its namespaced one — the measurement the inbox row needs. */
function alternateForms(client, markers) {
  if (client !== 'claude') return []
  return markers.filter((marker) => marker.class === 'command').map((marker) => `/${marker.id}`)
}

/**
 * The literal an operator types to run this root's generated setup command, or `null` where the
 * container generates none.
 *
 * Derived from the container's own `SETUP_COMMAND_PATH` and the form the capability file declares
 * for that class — NOT from the discovery marker, which is `st-work` and names a whole workflow. An
 * invocation leg that asked for the marker would run the wrong command and measure the wrong thing,
 * which is exactly what the first `--invoke` run of this script did (2026-09-20).
 */
function setupFormFor(client, root, capability) {
  const path = CONTAINERS[client].SETUP_COMMAND_PATH
  if (typeof path !== 'string' || !existsSync(join(root, ...path.split('/')))) return null
  const forms = invocationForms(capability)
  const template = forms['commands'] ?? forms['skills']
  if (typeof template !== 'string') return null
  return template.replaceAll('<id>', SETUP_ID)
}

// ── spawning a client ────────────────────────────────────────────────────────

/**
 * The environment a spawned client gets when it is meant to touch no operator state: an explicit
 * allowlist, never the whole of `process.env`.
 *
 * The same helper the four package suites carry, for the same reason — a client CLI reads its
 * credentials out of variables a shell is full of, and a measurement taken with somebody's own
 * token is not the measurement it claims to be.
 */
function allowlistedEnv(scratch) {
  const allowed = {}
  for (const name of ['PATH', 'TMPDIR', 'LANG']) {
    const value = process.env[name]
    if (value !== undefined) allowed[name] = value
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('STAMITY_') && value !== undefined) allowed[name] = value
  }
  return { ...allowed, ...scratch }
}

/**
 * Every user home a line could name, swept in one pass: POSIX, macOS and the Windows spelling.
 *
 * Exported because two files need the SAME sweep — this script's own reasons and the QA lane's row
 * reasons (`scripts/qa/plugin-runs.mjs`), which quote this script's output. A second copy of the
 * pattern is a pin that drifts, and the thing it guards is an absolute path reaching a committed
 * evidence file.
 */
const HOME_PATHS = /(?:\/Users|\/home|\/root)\/[^/\s"']+|[A-Za-z]:\\Users\\[^\\/\s"']+/g

/**
 * `text` with the paths that must never reach a printed line or a committed evidence file removed.
 *
 * `replacements` are the run's own known locations, replaced by their LOGICAL label first, so a
 * reader still learns which tree a line is about; the sweep then takes any home this run did not
 * know it would see (a second checkout, another account, a runner's).
 */
export function redactPaths(text, replacements = []) {
  let out = String(text ?? '')
  for (const [from, to] of replacements) {
    if (typeof from === 'string' && from.length > 0) out = out.replaceAll(from, to)
  }
  return out.replaceAll(HOME_PATHS, '<home>')
}

/** The redactor one client's legs use: its own dist, scratch, binary and home, then the sweep. */
function redactor(context) {
  const pairs = [
    [context.dist, '<dist>'],
    [context.scratch, '<scratch>'],
    // The binary's own path: a spawn failure's message carries it verbatim
    // (`spawnSync /Users/…/.local/bin/claude ENOENT`), and what a reader needs is which client
    // could not be run, not where it was installed.
    [context.binary, `<${context.display}>`],
    [homedir(), '<home>'],
  ]
  return (text) => redactPaths(text, pairs)
}

/**
 * Spawn one client call. `shell: false` (the default) on purpose: a shell would re-parse a prompt
 * this script composed, and on Windows it is the difference between finding a binary and finding a
 * shim — the limitation {@link WINDOWS_PROBE_LIMIT} states rather than works around.
 */
async function call(context, { args, cwd, env, name }) {
  // A stop already requested: nothing more is spawned, and the leg that asked for this call is
  // recorded as stopped rather than as a failure of the client.
  if (stopped.signal !== null) throw new RunStopped(stopped.signal)
  const started = Date.now()
  const result = spawnSync(context.binary, args, {
    cwd,
    encoding: 'utf8',
    env,
    timeout: CLIENT_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  })
  const transcript = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  const redact = context.redact
  // REDACT FIRST, THEN SLICE. The other order leaks: a path that straddles the 400-character
  // boundary loses its head, so `<home>/…` arrives as the tail of a home directory that no longer
  // matches the pattern that would have removed it — measured on 2026-09-20, where a codex leg's
  // reason carried the second half of an operator's user name into the evidence file.
  const redacted = redact(transcript)
  // THE YIELD. One turn of the event loop per client call, which is what lets a queued signal
  // handler run at all — see {@link stopped}. It costs a microtask per call and buys the difference
  // between a cleanup that happens and a comment claiming one does.
  await new Promise((resume) => {
    setImmediate(resume)
  })
  const spawnFailure =
    result.error === undefined || result.error === null
      ? null
      : `${result.error.message}${process.platform === 'win32' ? ` — ${WINDOWS_PROBE_LIMIT}` : ''}`
  return {
    name: name ?? args[0],
    command: redact([context.display, ...args].join(' ')),
    status: result.status ?? null,
    signal: result.signal ?? null,
    exit: exitDescription({ status: result.status, signal: result.signal }),
    transcript,
    // The redacted transcript is what every REASON is built from — the tail, the first line, and
    // the blocker patterns of {@link invocationLeg}, which used to match against the raw text and
    // then inline the match. A pattern that matched a path matched a path that had not been
    // redacted yet.
    redacted,
    firstLine: redacted.trim().split('\n')[0] ?? '',
    tail: redacted.trim().slice(-400).replaceAll('\n', ' ⏎ '),
    transcriptSha256: sha256(transcript),
    durationMs: Date.now() - started,
    spawnFailure: spawnFailure === null ? null : redact(spawnFailure),
  }
}

/** `<binary> --version`, first line. The pair a leg reports is this engine's root and that build. */
function probeVersion(binary) {
  const probe = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 60_000 })
  if (probe.error !== undefined && probe.error !== null) return null
  const line = (probe.stdout ?? '').trim().split('\n')[0] ?? ''
  return line === '' ? null : line
}

/** A leg result. `PASS`, `FAIL` or `SKIPPED`, one reason, and the call it came from where there was one. */
function leg(name, status, reason, made = null) {
  return {
    leg: name,
    status,
    reason,
    command: made?.command ?? null,
    exitCode: made?.status ?? null,
    binaryVersion: made?.binaryVersion ?? null,
    transcriptSha256: made?.transcriptSha256 ?? null,
  }
}

/** The same, carrying the call's own command, exit and transcript hash. */
function legFrom(name, status, reason, made, binaryVersion) {
  return { ...leg(name, status, reason), command: made.command, exitCode: made.status, binaryVersion, transcriptSha256: made.transcriptSha256 }
}

/**
 * A throwaway repository for an invocation leg: `git init`, one README, outside every checkout.
 *
 * Outside, because `plugin setup` writes into the repository it is run in and a client discovers
 * whatever `.claude/`, `.agents/` or `.cursor/` tree is above its cwd — a run inside this checkout
 * would measure this repository answering for the root.
 */
function scratchRepository(context, label) {
  const dir = mkdtempSync(join(context.scratch, `${label}-repo-`))
  execFileSync('git', ['init', '--quiet', dir], { stdio: ['ignore', 'pipe', 'pipe'] })
  writeFileSync(join(dir, 'README.md'), `# ${label} route-proof consumer\n\nOne file, so the repository is not empty.\n`)
  return dir
}

/**
 * Did the setup actually land? The instrument is the FILE, never the model's reply.
 *
 * `plugin.mode` says the repository is plugin-backed and `plugin.clients.<client>` says which
 * root it is backed by. A reply describing a successful setup with no manifest beside it is a
 * model being agreeable, which is exactly what this check exists not to accept.
 */
function setupLanded(client, repo) {
  const manifestPath = join(repo, '.stamity', 'manifest.json')
  if (!existsSync(manifestPath)) return { ok: false, detail: 'no .stamity/manifest.json was written' }
  let manifest
  try {
    manifest = readJson(manifestPath)
  } catch (error) {
    return { ok: false, detail: `.stamity/manifest.json does not parse: ${error.message}` }
  }
  const mode = manifest.plugin?.mode
  const clients = Object.keys(manifest.plugin?.clients ?? {})
  if (mode !== PLUGIN_MODE) return { ok: false, detail: `.stamity/manifest.json plugin.mode is ${JSON.stringify(mode)}` }
  if (!clients.includes(client)) {
    return { ok: false, detail: `.stamity/manifest.json plugin.clients names ${clients.join(', ') || 'nothing'}` }
  }
  return { ok: true, detail: `.stamity/manifest.json carries plugin.mode ${PLUGIN_MODE} and plugin.clients.${client}` }
}

/**
 * The shapes a client takes when it never ran what it was asked to run.
 *
 * An invocation leg that finds no manifest has two very different causes, and reporting them the
 * same way would be the most misleading thing this script could do: the root's setup command may be
 * broken (a FAILURE, and the leg's whole point), or the CLIENT may have refused to execute a shell
 * command at all under its own headless permission model or sandbox — in which case nothing about
 * the root was measured and the honest record is `SKIPPED` with the refusal quoted. The plan names
 * the Codex sandbox as the case it expects; the same reasoning covers a permission prompt no
 * headless run can answer.
 *
 * The pattern is deliberately narrow and the leg always quotes the MATCH and the transcript tail
 * beside it, so a reader can tell a real refusal from a word that happened to appear.
 */
const BLOCKERS = [
  {
    label: 'the client never reached its model',
    // A login, a quota or a rate limit. FIRST, because a client that never reached its model also
    // prints the words the refusal pattern looks for — the codex leg on 2026-09-20 hit a usage
    // limit and would otherwise have been recorded as a sandbox refusal.
    pattern: /usage limit|rate limit|quota|no authentication information|authentication required|please run .*login|not authorized|\b401\b/i,
  },
  {
    label: 'the client refused to run what it was asked to run',
    // THE CLIENT'S OWN PERMISSION LAYER, and nothing else. A bare `permission denied` or
    // `operation not permitted` is also what a setup STEP prints when it cannot write a file
    // (EACCES/EPERM), and that is a genuine FAILURE of the thing this leg exists to measure — so
    // those two spellings are deliberately absent and only phrases a client says when it is asking
    // for approval it cannot get are here.
    pattern:
      /could not request permission|requires approval|needs approval|approval required|permission to (?:use|run)|blocked by the sandbox|sandbox denied|denied by the sandbox/i,
  },
]

/**
 * Which blocker a transcript shows, or `null` for a transcript that shows none.
 *
 * Exported so the suite can hold the SCOPE, which is the part that is easy to get wrong in the
 * generous direction: a setup step's own `EACCES: permission denied` must reach a FAILURE, because
 * that is the root's setup failing and the leg's whole subject; only a client asking for an approval
 * it cannot be given is a blocker. A pattern that matched both would turn every such failure into a
 * skip, and a skip is what nobody looks at again.
 */
export function blockerFor(text) {
  for (const blocker of BLOCKERS) {
    const hit = blocker.pattern.exec(String(text ?? ''))
    if (hit !== null) return { label: blocker.label, match: hit[0] }
  }
  return null
}

/**
 * The sandbox grant the Codex invocation leg runs under, exported so the suite can pin the exact
 * argv. `codex exec` defaults to a read-only sandbox and the setup writes (prove/274). Measured
 * 2026-09-22 on codex-cli 0.154.0 (`codex exec --help` sha-256 0e82cfde…) in a scratch
 * repository: under `--sandbox workspace-write` the model creates `.stamity/` and an ordinary
 * directory, and is refused `mkdir .codex` and a write inside an existing `.codex/` — the client
 * protects the repository's own `.codex/` from model writes, and that is exactly where this
 * client's setup lands (`.codex/config.toml`, `.codex/hooks.json`). `--add-dir <repo>/.codex`
 * ("additional directories that should be writable alongside the primary workspace") lifts
 * that one directory, and accepts one that does not exist yet. So the grant is the narrowest
 * pair that lets the setup land: the workspace, plus its own `.codex/`. Never
 * `danger-full-access`, never the flag that drops the sandbox.
 */
export function codexSandbox(repo) {
  return ['--sandbox', 'workspace-write', '--add-dir', join(repo, '.codex')]
}

/** The one ask of an invocation leg, in the client's own idiom. */
function setupPrompt(form) {
  return (
    `Run the ${form} command in this repository now, and follow its steps in order until it tells ` +
    'you to stop. Do not ask me for anything: run the commands it names and report what they printed.'
  )
}

/** Compare an installed tree with the root that was installed, and say what differed. */
function compareTrees(rootDigest, deployedDir) {
  const deployed = treeDigest(deployedDir)
  const rootKeys = Object.keys(rootDigest).toSorted()
  const deployedKeys = Object.keys(deployed).toSorted()
  const missing = rootKeys.filter((rel) => deployed[rel] === undefined)
  const extra = deployedKeys.filter((rel) => rootDigest[rel] === undefined)
  const differing = rootKeys.filter((rel) => deployed[rel] !== undefined && deployed[rel] !== rootDigest[rel])
  return { count: rootKeys.length, deployedCount: deployedKeys.length, missing, extra, differing }
}

/** The one-line verdict of a tree comparison. */
function treeVerdict(comparison) {
  if (comparison.missing.length + comparison.differing.length + comparison.extra.length === 0) {
    return { ok: true, detail: `${comparison.count} file(s) byte-identical (the bundled runtime excluded)` }
  }
  return {
    ok: false,
    detail:
      `${comparison.count} root file(s) vs ${comparison.deployedCount} deployed: ` +
      `${comparison.missing.length} missing (${comparison.missing.slice(0, 3).join(', ')}), ` +
      `${comparison.differing.length} differing (${comparison.differing.slice(0, 3).join(', ')}), ` +
      `${comparison.extra.length} unexpected (${comparison.extra.slice(0, 3).join(', ')})`,
  }
}

/** The marketplace and plugin names a distribution's own catalog declares for a client. */
function catalogNames(dist, client) {
  const path = join(dist, ...CATALOG_PATHS[client].split('/'))
  if (!existsSync(path)) return null
  const catalog = readJson(path)
  const plugin = (catalog.plugins ?? [])[0]?.name
  if (typeof catalog.name !== 'string' || typeof plugin !== 'string') return null
  return { marketplace: catalog.name, plugin, spec: `${plugin}@${catalog.name}` }
}

// ── the four client handlers ─────────────────────────────────────────────────

/**
 * Claude Code. `plugin validate --strict` is the install-side proof — it is the client's own
 * judgement on the root, needs no credential, and is the only one of the four vendors to publish
 * such a command. Discovery and invocation share ONE model call, for the reason the header states.
 */
async function claudeLegs(context) {
  const validate = await call(context, { args: ['plugin', 'validate', '--strict', context.root], cwd: context.scratch, env: process.env })
  const install =
    validate.spawnFailure !== null
      ? legFrom('install', 'FAIL', `claude plugin validate could not run: ${validate.spawnFailure}`, validate, context.version)
      : validate.status === 0
        ? legFrom(
            'install',
            'PASS',
            `claude plugin validate --strict accepted the root (${validate.firstLine}); ` +
              'the environment is inherited and no state is written',
            validate,
            context.version,
          )
        : legFrom('install', 'FAIL', `claude plugin validate --strict exited ${validate.exit}: ${validate.tail}`, validate, context.version)

  if (!context.invoke) {
    return [
      install,
      leg('discovery', 'SKIPPED', 'this client publishes no listing of a plugin-dir root without a model call; pass --invoke'),
      leg('invocation', 'SKIPPED', 'needs --invoke'),
    ]
  }

  // A LISTING RUN of its own, rather than the setup transcript. The setup command's own output names
  // the ids it wrote artifacts for, so reading discovery out of it would pass on a transcript that
  // named `st-work` for a reason that has nothing to do with the client discovering it.
  const listing = await call(context, {
    args: ['--plugin-dir', context.root, '-p', DISCOVERY_PROMPT, '--output-format', 'text'],
    cwd: mkdtempSync(join(context.scratch, 'claude-cwd-')),
    env: process.env,
  })
  const discovery = discoveryFromTranscript(context, listing, 'a --plugin-dir listing run in a scratch directory (the real home)')
  if (context.setupForm === null) return [install, discovery, noSetupCommand(context)]
  const repo = scratchRepository(context, 'claude')
  const run = await call(context, {
    args: [
      '--plugin-dir',
      context.root,
      '-p',
      setupPrompt(context.setupForm),
      '--output-format',
      'stream-json',
      '--verbose',
      // The setup command's body RUNS things, and every one of them has the same shape:
      // `node "${CLAUDE_PLUGIN_ROOT}/runtime/locate.mjs" -- plugin status|setup …`. A headless run
      // cannot answer a permission prompt, so without a grant the leg measures the client's
      // permission model instead of the root — which is what the Copilot leg measured on
      // 2026-09-20 ("Permission denied and could not request permission from user"). The grant is
      // therefore the narrowest form that covers those commands and nothing else: one tool, and
      // within it only `node`. The leg's instrument is still the manifest file on disk.
      '--allowed-tools',
      CLAUDE_BASH_GRANT,
    ],
    cwd: repo,
    // Inherited: this client's login lives in the operator's own home, outside the scratch
    // repository the run happens in, and a curated environment would measure a login failure.
    env: process.env,
  })
  return [install, discovery, invocationLeg(context, run, repo, 'the real home')]
}

/**
 * Cursor. `--plugin-dir` is the install route of record for the headless client: no CLI install
 * command is documented (cursor.com/docs/reference/plugins, read 2026-09-20), and the team
 * marketplace is a dashboard act that stays a human QA row. So install and discovery are ONE
 * credential-bound call, and without `--invoke` both are SKIPPED rather than guessed.
 */
async function cursorLegs(context) {
  if (!context.invoke) {
    const reason = 'a Cursor run is a model call; pass --invoke'
    return [leg('install', 'SKIPPED', reason), leg('discovery', 'SKIPPED', reason), leg('invocation', 'SKIPPED', reason)]
  }
  const listing = await call(context, {
    args: ['--trust', '--plugin-dir', context.root, '-p', DISCOVERY_PROMPT, '--output-format', 'text'],
    cwd: mkdtempSync(join(context.scratch, 'cursor-cwd-')),
    // `--trust` is required — without it the CLI exits 1 on the Workspace Trust prompt
    // (measured 2026-09-20 on 2026.09.15-d2fe57e) — and the environment is inherited because the
    // login lives in the operator's own home.
    env: process.env,
  })
  // The install leg IS a model call for this client, so it consults the same blocker list discovery
  // and invocation do (prove/260): an account limit read as `install FAIL … usage limit` while the
  // invocation leg beside it read the same words as SKIPPED.
  const blocker = listing.spawnFailure === null ? blockerFor(listing.redacted) : null
  const install =
    listing.spawnFailure !== null
      ? legFrom('install', 'FAIL', `agent --plugin-dir could not run: ${listing.spawnFailure}`, listing, context.version)
      : blocker !== null
        ? legFrom(
            'install',
            'SKIPPED',
            `${blocker.label} (${blocker.match}), so nothing about this root was measured (the --plugin-dir run ` +
              `exited ${listing.exit}): ${listing.tail}`,
            listing,
            context.version,
          )
      : listing.status === 0
        ? legFrom(
            'install',
            'PASS',
            'the --plugin-dir route loaded the root and the run reached the model (the real home; no CLI ' +
              'install command is documented, so this is the install route of record)',
            listing,
            context.version,
          )
        : legFrom('install', 'FAIL', `agent --trust --plugin-dir exited ${listing.exit}: ${listing.tail}`, listing, context.version)
  const discovery =
    install.status === 'PASS'
      ? discoveryFromTranscript(context, listing, 'the --plugin-dir listing run (the real home)')
      : leg('discovery', 'SKIPPED', 'the install leg did not reach the model, so nothing was listed')

  if (context.setupForm === null) return [install, discovery, noSetupCommand(context)]
  const repo = scratchRepository(context, 'cursor')
  // `--force` is this client's documented grant ("Force allow commands unless explicitly denied",
  // `agent --help` on 2026.09.15-d2fe57e, read 2026-09-20) and is here for the reason the Claude
  // leg states: the setup command runs shell commands, and a headless run cannot be prompted.
  const run = await call(context, {
    args: ['--trust', '--force', '--plugin-dir', context.root, '-p', setupPrompt(context.setupForm)],
    cwd: repo,
    env: process.env,
  })
  return [install, discovery, invocationLeg(context, run, repo, 'the real home')]
}

/**
 * The GitHub Copilot CLI. The MARKETPLACE route, not the direct install: 1.0.85 prints a
 * deprecation warning for a repository, URL or local path install in favour of
 * `plugin@marketplace`, and the distribution root is itself a marketplace (`.github/plugin/`).
 *
 * WHAT A LOCAL-PATH MARKETPLACE ACTUALLY DOES, measured 2026-09-20 against 1.0.85 in a scratch
 * `COPILOT_HOME`: nothing is copied. The install prints "It is loaded live from <path>, so edits
 * take effect on the next session — nothing was copied", `plugin list --json` reports the entry
 * with `"source": "live"` and `installedFrom` naming the marketplace tree, and
 * `installed-plugins/<marketplace>/<plugin>/` is never written. So the tree comparison the plan
 * asked for has nothing to compare on this route, and the leg says so rather than passing on a
 * check it did not make: the entry, its version and its `installedFrom` are what a live install
 * can prove. A copied install (a remote marketplace, or the deprecated direct route) leaves the
 * deployed tree, and the comparison below runs whenever that tree exists.
 *
 * The install leg runs in a scratch `HOME`/`COPILOT_HOME`/`XDG_CONFIG_HOME` and reads no operator
 * state. `skill list` needs no login, so discovery has a listing to read; the agent class has no
 * listing subcommand at all (`copilot --help`, 2026-09-20), so resolving its marker waits for
 * `--invoke`, which installs into the REAL home (where the login is) and removes itself afterwards.
 */
async function copilotLegs(context) {
  const names = catalogNames(context.dist, 'copilot')
  if (names === null) {
    const reason = `dist/${CATALOG_PATHS.copilot} names no marketplace, so there is no marketplace route to walk`
    return [leg('install', 'FAIL', reason), ...blocked(reason)]
  }
  const home = mkdtempSync(join(context.scratch, 'copilot-home-'))
  const copilotHome = join(home, '.copilot')
  const cwd = mkdtempSync(join(context.scratch, 'copilot-cwd-'))
  const env = allowlistedEnv({ HOME: home, COPILOT_HOME: copilotHome, XDG_CONFIG_HOME: join(home, '.config') })

  const added = await call(context, { args: ['plugin', 'marketplace', 'add', context.dist], cwd, env })
  if (added.spawnFailure !== null || added.status !== 0) {
    const reason = `copilot plugin marketplace add exited ${added.exit}: ${added.spawnFailure ?? added.tail}`
    return [legFrom('install', 'FAIL', reason, added, context.version), ...blocked('the install leg failed')]
  }
  const installed = await call(context, { args: ['plugin', 'install', names.spec], cwd, env })
  if (installed.spawnFailure !== null || installed.status !== 0) {
    const reason = `copilot plugin install ${names.spec} exited ${installed.exit}: ${installed.spawnFailure ?? installed.tail}`
    return [legFrom('install', 'FAIL', reason, installed, context.version), ...blocked('the install leg failed')]
  }
  const install = copilotInstallLeg(context, { names, copilotHome, installed, listed: await call(context, { args: ['plugin', 'list', '--json'], cwd, env }) })

  // `skill list` in a SCRATCH cwd: project skills are searched first on this client
  // (`.github/skills/`, `.agents/skills/`, `.claude/skills/`), so a listing taken inside a
  // checkout lets the repository answer for the root — measured on 2026-09-20, where the same
  // listing run in this checkout reported 20 project skills and one plugin skill.
  const listing = await call(context, { args: ['skill', 'list'], cwd, env })
  const listingLabel = 'the unauthenticated copilot skill list in a scratch COPILOT_HOME'
  const sources = listing.status === 0 ? [{ label: listingLabel, transcript: listing.redacted }] : []

  if (!context.invoke) {
    const discovery =
      listing.spawnFailure !== null || listing.status !== 0
        ? legFrom('discovery', 'SKIPPED', `copilot skill list exited ${listing.exit}: ${listing.spawnFailure ?? listing.tail}`, listing, context.version)
        : discoveryFrom(context, sources, listing, 'this client lists skills and commands but has no agent listing subcommand; pass --invoke')
    return [install, discovery, leg('invocation', 'SKIPPED', 'needs --invoke')]
  }

  // The REAL home, because the login lives there and the leg is worthless without one — which makes
  // the operator's own state the thing to be careful with. Probe first, install inside the guarded
  // region, remove from the `finally` AND from a signal.
  const realEnv = process.env
  const repo = scratchRepository(context, 'copilot')
  const existing = await operatorAlreadyHas(context, {
    cwd: repo,
    env: realEnv,
    names,
    pluginList: ['plugin', 'list', '--json'],
    marketplaceList: ['plugin', 'marketplace', 'list'],
  })
  const blockedByHome = preexistingReason(existing)
  if (blockedByHome !== null) {
    return [install, discoveryFrom(context, sources, listing, blockedByHome), leg('invocation', 'SKIPPED', blockedByHome)]
  }
  // `plugin --help` read ONCE, before anything is installed, so the guard's removals are
  // subcommands this build has — recorded the way the codex leg records its own.
  const help = await call(context, { args: ['plugin', '--help'], cwd: repo, env: realEnv })
  const removals = removalNote(help, ['uninstall', 'marketplace'])
  const guard = realHomeGuard(context, {
    cwd: repo,
    env: realEnv,
    removals: [
      ['plugin', 'uninstall', names.plugin],
      ['plugin', 'marketplace', 'remove', names.marketplace],
    ],
    label: 'copilot',
  })
  let discovery
  let invocation
  // Set once the real home holds the plugin: only then does a removal outcome belong on a leg.
  let installedInRealHome = false
  try {
    const realAdd = await call(context, { args: ['plugin', 'marketplace', 'add', context.dist], cwd: repo, env: realEnv })
    const realInstall = realAdd.status === 0 ? await call(context, { args: ['plugin', 'install', names.spec], cwd: repo, env: realEnv }) : realAdd
    if (realInstall.status !== 0) {
      const reason = `the real-home install refused (marketplace add ${realAdd.exit}, plugin install ${realInstall.exit}): ${realInstall.tail}`
      discovery = discoveryFrom(context, sources, listing, reason)
      invocation = legFrom('invocation', 'SKIPPED', reason, realInstall, context.version)
    } else {
      installedInRealHome = true
      const asked = await copilotListing(context, repo, realEnv)
      if (asked.status === 0) sources.push({ label: 'a copilot -p listing run in the REAL COPILOT_HOME', transcript: asked.redacted })
      discovery = discoveryFrom(context, sources, asked, `the listing run exited ${asked.exit}: ${asked.tail}`)
      if (context.setupForm === null) invocation = noSetupCommand(context)
      else {
        // `--allow-all-tools` for the reason measured on 2026-09-20: without it this client answers
        // the setup command's own shell steps with "Permission denied and could not request
        // permission from user" and the leg measures the permission model rather than the root. The
        // narrower `--allow-tool <tools>` is documented but its tool NAMES are not, so the measured
        // flag is the one used and the run happens in a throwaway repository outside every checkout.
        // `COPILOT_ALLOW_ALL=true` beside the flag (prove/277): `copilot help environment` on 1.0.87
        // says the variable, set to exactly "true", "trusts the working directory and loads its
        // skills, plugins, MCP servers and hooks", and folder trust is what lets a headless session
        // run the shell commands the command body asks for; `--allow-all-tools` alone auto-approves
        // tools, and under it every `node …` line the session composed answered "Permission denied
        // and could not request permission from user". This client only. The instrument is still
        // the manifest on disk.
        //
        // `--add-dir <dist>` beside them (prove/279): the locator the command body runs sits in
        // the DISTRIBUTION, outside the scratch repository, and `copilot help permissions` on
        // 1.0.87 (read 2026-09-22, sha-256 b11bef78…) says "file access is restricted to paths
        // within the current working directory and its subdirectories, plus the system temporary
        // directory". Measured the same day in a scratch repository: a script under a non-temp
        // directory outside the cwd answered "Permission denied and could not request permission
        // from user" under COPILOT_ALLOW_ALL=true and --allow-all-tools alone, and ran under
        // `--add-dir <that directory>` ("Allow file access to a directory", `copilot --help`,
        // sha-256 cef26adc…). The earlier PASS of this leg had the distribution under the OS temp
        // directory, which the client allows by default; the harness's sits under the checkout.
        // Never `--allow-all-paths`: the distribution root is the one directory the session needs.
        const run = await call(context, {
          args: ['-p', setupPrompt(context.setupForm), '-s', '--allow-all-tools', '--add-dir', context.dist],
          cwd: repo,
          env: { ...realEnv, COPILOT_ALLOW_ALL: 'true' },
        })
        invocation = invocationLeg(
          context,
          run,
          repo,
          `the REAL COPILOT_HOME (the login lives there; ${existing.detail}), with plugin --help ` +
            `listing ${removals}, run with COPILOT_ALLOW_ALL=true beside --allow-all-tools because ` +
            `only folder trust lets the session run the command body's shell lines, and with ` +
            `--add-dir <dist> because file access outside the working directory is gated separately ` +
            `and the locator sits in the distribution`,
        )
      }
    }
  } finally {
    // The removal's OUTCOME, read after it ran, is what the legs and the JSON carry — never the
    // plan. `discovery` and `invocation` are undefined here when a stop unwound the `try`.
    const removal = guard.finish()
    console.error(`plugin-route: copilot cleanup - ${removal.summary}`)
    context.cleanup = removal.lines
    if (installedInRealHome) {
      if (discovery !== undefined) discovery = withRemoval(discovery, removal)
      if (invocation !== undefined) invocation = withRemoval(invocation, removal)
    }
  }
  return [install, discovery, invocation]
}

/**
 * The Copilot listing run.
 *
 * `--allow-all-tools` rides on the LISTING as well as on the setup run: without it the 2026-09-20
 * run was killed by the 300 s ceiling with an empty transcript, which is what a client waiting for a
 * permission it can never be granted looks like from outside.
 */
async function copilotListing(context, cwd, env) {
  return await call(context, { args: ['-p', DISCOVERY_PROMPT, '-s', '--allow-all-tools'], cwd, env })
}

/**
 * What the Copilot install proves: a copied tree where there is one, the live entry where there is
 * not. Exported so the suite can hand it a listing it composed — the disabled-entry case cannot be
 * produced on demand from a real install.
 */
export function copilotInstallLeg(context, { names, copilotHome, installed, listed }) {
  const where = `installed-plugins/${names.marketplace}/${names.plugin}`
  if (listed.status !== 0) {
    return legFrom('install', 'FAIL', `copilot plugin list --json exited ${listed.exit} after the install: ${listed.tail}`, listed, context.version)
  }
  let entry
  try {
    entry = (JSON.parse(listed.transcript.trim())).find((row) => row.name === names.plugin)
  } catch (error) {
    return legFrom('install', 'FAIL', `copilot plugin list --json did not parse: ${context.redact(error.message)}`, listed, context.version)
  }
  if (entry === undefined) {
    return legFrom('install', 'FAIL', `copilot plugin list --json does not name ${names.plugin}: ${listed.tail}`, listed, context.version)
  }
  // `entry.version` and `entry.source` are the CLIENT's strings, not this script's: they reach a
  // committed evidence file through the row reason, so they go through the same redactor every
  // transcript does.
  const entryVersion = context.redact(String(entry.version ?? ''))
  const entrySource = context.redact(String(entry.source ?? ''))
  if (entry.version !== context.pluginVersion) {
    return legFrom(
      'install',
      'FAIL',
      `the installed entry is version ${entryVersion}, the root is ${context.pluginVersion}`,
      listed,
      context.version,
    )
  }
  // `enabled` is the client's own word for whether the entry LOADS: `plugin list --json` on 1.0.87
  // (measured 2026-09-22 in a scratch COPILOT_HOME) prints one row per plugin with `name`,
  // `marketplace`, `version`, `enabled`, `source` and `installedFrom`, and `settings.json` mirrors
  // it under `enabledPlugins`. Version equality alone used to pass this leg (prove/210): an entry
  // the client lists at the right version and will not load is an install that proves nothing.
  if (entry.enabled !== true) {
    return legFrom(
      'install',
      'FAIL',
      `the installed entry is DISABLED (enabled: ${JSON.stringify(entry.enabled ?? null)}) at version ` +
        `${entryVersion}: the client lists ${names.plugin} but will not load it`,
      listed,
      context.version,
    )
  }
  const deployed = join(copilotHome, 'installed-plugins', names.marketplace, names.plugin)
  if (isDirectory(deployed)) {
    const verdict = treeVerdict(compareTrees(context.rootDigest, deployed))
    return legFrom(
      'install',
      verdict.ok ? 'PASS' : 'FAIL',
      `marketplace add + plugin install ${names.spec} in a scratch COPILOT_HOME; the deployed tree under ${where} is ${verdict.detail}`,
      listed,
      context.version,
    )
  }
  if (entry.source === 'live') {
    return legFrom(
      'install',
      'PASS',
      `marketplace add + plugin install ${names.spec} in a scratch COPILOT_HOME; the entry is ` +
        `enabled at version ${entryVersion} with source "live", so ` +
        `${where} was never written and there is no copied tree to compare — a local-path marketplace is loaded ` +
        `live from the distribution (the client's own line: ${installed.tail})`,
      listed,
      context.version,
    )
  }
  return legFrom(
    'install',
    'FAIL',
    `nothing was deployed under ${where} and the entry's source is ${JSON.stringify(entrySource)} rather than "live"`,
    listed,
    context.version,
  )
}

/**
 * Codex. A marketplace add of the distribution root (whose `.agents/plugins/marketplace.json`
 * carries a `local` `./codex` source), then `plugin add`, then `plugin list --json`, then the
 * cached tree compared byte for byte — a marketplace entry the client cannot resolve is skipped
 * SILENTLY, so only the cache proves the install.
 *
 * `plugin list --json` names the PLUGIN, not its skills, so discovery needs a `codex exec`
 * measurement and waits for `--invoke`. Nothing here asserts anything about hooks: headless codex
 * ran zero project hooks on 0.154.0 (the learning), so a leg that asked it to would be measuring
 * the client and calling the result an emission defect.
 */
async function codexLegs(context) {
  const names = catalogNames(context.dist, 'codex')
  if (names === null) {
    const reason = `dist/${CATALOG_PATHS.codex} names no marketplace, so there is no marketplace route to walk`
    return [leg('install', 'FAIL', reason), ...blocked(reason)]
  }
  const home = mkdtempSync(join(context.scratch, 'codex-home-'))
  const env = allowlistedEnv({ HOME: home, CODEX_HOME: home, XDG_CONFIG_HOME: join(home, '.config') })

  const added = await call(context, { args: ['plugin', 'marketplace', 'add', context.dist], cwd: context.dist, env })
  const installed = added.status === 0 ? await call(context, { args: ['plugin', 'add', names.spec], cwd: context.dist, env }) : added
  if (added.spawnFailure !== null || added.status !== 0 || installed.status !== 0) {
    const reason = `codex plugin marketplace add / plugin add ${names.spec} exited ${installed.exit}: ${installed.spawnFailure ?? installed.tail}`
    return [legFrom('install', 'FAIL', reason, installed, context.version), ...blocked('the install leg failed')]
  }
  const listed = await call(context, { args: ['plugin', 'list', '--json'], cwd: context.dist, env })
  const named = listed.status === 0 && listed.transcript.includes(names.plugin)
  const cacheBase = join(home, 'plugins', 'cache', names.marketplace, names.plugin)
  const versions = directoriesIn(cacheBase)
  if (!named || versions.length !== 1) {
    return [
      legFrom(
        'install',
        'FAIL',
        `codex plugin list --json ${named ? 'named' : 'did NOT name'} ${names.plugin} and the cache holds ` +
          `${versions.length} version directory(ies) under plugins/cache/${names.marketplace}/${names.plugin}: ${listed.tail}`,
        listed,
        context.version,
      ),
      ...blocked('the install leg failed'),
    ]
  }
  const verdict = treeVerdict(compareTrees(context.rootDigest, join(cacheBase, versions[0])))
  const install = legFrom(
    'install',
    verdict.ok ? 'PASS' : 'FAIL',
    `marketplace add + plugin add ${names.spec} in a scratch CODEX_HOME; plugin list --json names ${names.plugin}; ` +
      `the cache tree at plugins/cache/${names.marketplace}/${names.plugin}/${versions[0]} is ${verdict.detail}`,
    listed,
    context.version,
  )

  if (!context.invoke) {
    return [
      install,
      leg('discovery', 'SKIPPED', 'plugin list --json names the plugin, not its skills; the skill listing is a codex exec measurement — pass --invoke'),
      leg('invocation', 'SKIPPED', 'needs --invoke'),
    ]
  }

  // The REAL CODEX_HOME for the model calls: the login lives there. Probe first, install inside the
  // guarded region, remove from the `finally` and from a signal — see {@link realHomeGuard}.
  const realEnv = process.env
  const realCwd = scratchRepository(context, 'codex')
  const existing = await operatorAlreadyHas(context, {
    cwd: realCwd,
    env: realEnv,
    names,
    pluginList: ['plugin', 'list', '--json'],
    marketplaceList: ['plugin', 'marketplace', 'list'],
  })
  const blockedByHome = preexistingReason(existing)
  if (blockedByHome !== null) return [install, ...blocked(blockedByHome)]
  // `plugin --help` read before anything is installed, so the guard's removals are subcommands this
  // build has.
  const help = await call(context, { args: ['plugin', '--help'], cwd: realCwd, env: realEnv })
  const removals = removalNote(help, ['remove', 'marketplace'])
  const guard = realHomeGuard(context, {
    cwd: realCwd,
    env: realEnv,
    removals: [
      ['plugin', 'remove', names.spec],
      ['plugin', 'marketplace', 'remove', names.marketplace],
    ],
    label: 'codex',
  })
  let discovery
  let invocation
  let installedInRealHome = false
  try {
    const realAdd = await call(context, { args: ['plugin', 'marketplace', 'add', context.dist], cwd: context.dist, env: realEnv })
    const realInstall = realAdd.status === 0 ? await call(context, { args: ['plugin', 'add', names.spec], cwd: context.dist, env: realEnv }) : realAdd
    if (realInstall.status !== 0) {
      const reason = `the real-home install refused (marketplace add ${realAdd.exit}, plugin add ${realInstall.exit}): ${realInstall.tail}`
      discovery = legFrom('discovery', 'SKIPPED', reason, realInstall, context.version)
      invocation = legFrom('invocation', 'SKIPPED', reason, realInstall, context.version)
    } else {
      installedInRealHome = true
      const listing = await call(context, {
        args: ['exec', '--skip-git-repo-check', DISCOVERY_PROMPT],
        cwd: mkdtempSync(join(context.scratch, 'codex-cwd-')),
        env: realEnv,
      })
      discovery =
        listing.status === 0
          ? discoveryFromTranscript(
              context,
              listing,
              `a codex exec listing run (the REAL CODEX_HOME; plugin --help lists ${removals})`,
            )
          : legFrom('discovery', 'SKIPPED', `codex exec exited ${listing.exit}: ${listing.tail}`, listing, context.version)
      // The codex container carries NO command class, so there is no `st-setup` to ask for: its
      // README's own setup line is the route, and the prompt names it with the installed root's
      // real path. `CODEX_HOME` when the operator exports one, `~/.codex` otherwise — the same
      // precedence the client itself applies, so the path named is the one the install wrote to.
      const codexHome = process.env['CODEX_HOME'] ?? join(homedir(), '.codex')
      const cached = join(codexHome, 'plugins', 'cache', names.marketplace, names.plugin)
      const cachedVersions = directoriesIn(cached)
      const cachedRoot = join(cached, cachedVersions[0] ?? '')
      const locator = join(cachedRoot, 'runtime', 'locate.mjs')
      const run = await call(context, {
        args: [
          'exec',
          '--skip-git-repo-check',
          // `codex exec`'s default sandbox is read-only, and the setup WRITES: with the README's line
          // now reaching the write (prove/259), the run refused with "EPERM: operation not
          // permitted, mkdir '<repo>/.stamity'" (prove/274), and `workspace-write` alone still
          // refused `mkdir '<repo>/.codex'`. The grant is {@link codexSandbox}, measured there; the
          // reason below says what was granted. The instrument is still the manifest on disk.
          ...codexSandbox(realCwd),
          `Run exactly this command in this repository and report what it printed: node "${locator}" -- plugin setup --client codex -y --plugin-root "${cachedRoot}"`,
        ],
        cwd: realCwd,
        env: realEnv,
      })
      invocation = invocationLeg(
        context,
        run,
        realCwd,
        `the REAL CODEX_HOME (the login lives there; ${existing.detail}); this root carries no ` +
          // The grant as a PLACEHOLDER, never the argv's real path (prove/278): the scratch
          // repository is a temp path, and this reason lands in a committed evidence file.
          `st-setup command, so the prompt names the README's own setup line, run under ` +
          `${codexSandbox('<repo>').join(' ')} because the default read-only sandbox refuses the write ` +
          `and workspace-write alone refuses the repository's own .codex/`,
      )
    }
  } finally {
    const removal = guard.finish()
    console.error(`plugin-route: codex cleanup - ${removal.summary}`)
    context.cleanup = removal.lines
    if (installedInRealHome) {
      if (discovery !== undefined) discovery = withRemoval(discovery, removal)
      if (invocation !== undefined) invocation = withRemoval(invocation, removal)
    }
  }
  return [install, discovery, invocation]
}

/**
 * Is this plugin — or its marketplace — ALREADY installed in the operator's own home?
 *
 * Asked BEFORE anything is added, and it decides whether the `--invoke` legs run at all. The legs
 * install into the real home because that is where the login is, and they remove what they added
 * afterwards; if the operator was already using this plugin, that removal would take THEIR install
 * with it. So a pre-existing install is not something to work around — it is a reason to skip, and
 * the reason says so.
 *
 * The listings are parsed as JSON where the client emits it and matched word-wise where it does not,
 * and the note records which, so a changed output shape reads as a changed shape rather than as an
 * absent install.
 */
async function operatorAlreadyHas(context, { cwd, env, names, pluginList, marketplaceList }) {
  const listed = await call(context, { args: pluginList, cwd, env })
  // FAIL CLOSED. A probe that could not answer is not an answer of "no": treating a non-zero listing
  // as an empty home is how this run would install into an operator's real home on the strength of a
  // command that errored, and then remove what it found there afterwards. `answered: false` skips the
  // model legs with the probe's own exit and its last words.
  if (listed.spawnFailure !== null || listed.status !== 0) {
    return {
      answered: false,
      present: false,
      detail:
        `${context.display} ${pluginList.join(' ')} could not answer (${listed.exit}): ` +
        `${listed.spawnFailure ?? listed.tail}`,
    }
  }
  const rows = installedRows(context, listed)
  if (rows.names !== null) {
    if (rows.names.includes(names.plugin)) {
      return {
        answered: true,
        present: true,
        detail: `${context.display} ${pluginList.join(' ')} already names ${names.plugin}`,
      }
    }
  } else if (new RegExp(`\\b${names.plugin}\\b`).test(listed.redacted)) {
    return {
      answered: true,
      present: true,
      detail: `${context.display} ${pluginList.join(' ')} mentions ${names.plugin} (${rows.note})`,
    }
  }
  const markets = await call(context, { args: marketplaceList, cwd, env })
  if (markets.spawnFailure !== null || markets.status !== 0) {
    return {
      answered: false,
      present: false,
      detail:
        `${context.display} ${marketplaceList.join(' ')} could not answer (${markets.exit}): ` +
        `${markets.spawnFailure ?? markets.tail}`,
    }
  }
  if (new RegExp(`\\b${names.marketplace}\\b`).test(markets.redacted)) {
    return {
      answered: true,
      present: true,
      detail: `${context.display} ${marketplaceList.join(' ')} already names the ${names.marketplace} marketplace`,
    }
  }
  return {
    answered: true,
    present: false,
    detail: `neither ${names.plugin} nor the ${names.marketplace} marketplace was in the operator's home before this run`,
  }
}

/** The `name`s a client's plugin listing carries, or `null` with the reason it could not be parsed. */
function installedRows(context, made) {
  try {
    const parsed = JSON.parse(made.transcript.trim())
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.installed) ? parsed.installed : null
    if (rows === null) return { names: null, note: 'the listing parsed as JSON of an unexpected shape' }
    return { names: rows.map((row) => String(row?.name ?? '')), note: 'parsed as JSON' }
  } catch (error) {
    // Not JSON — a text listing, which the caller matches word-wise instead. The parse failure is
    // carried into the note rather than dropped (a client that stops emitting JSON should be
    // visible) and REDACTED on the way, because `JSON.parse`'s own message quotes the head of what
    // it was given — a listing that begins with a path would arrive verbatim in a row reason.
    return { names: null, note: `the listing did not parse as JSON (${context.redact(error.message)})` }
  }
}

/**
 * Remove what a real-home install added — from the `finally` AND from a signal.
 *
 * A JavaScript `finally` does not run when the process is killed, and this script is run by an
 * unattended harness that kills it on a timeout (`scripts/qa/plugin-runs.mjs`). Without a signal
 * handler, a timeout during a 300-second model call would leave the plugin and the marketplace
 * installed in the operator's home with nothing on the machine that knows to take them out again.
 *
 * Two limits, stated because they shape the harness's own timeout policy rather than being
 * hidden: a handler cannot interrupt a blocking `spawnSync`, so the removal runs when the client
 * call in flight returns — and `SIGKILL` cannot be handled at all, which is why the harness sends
 * `SIGTERM` first and escalates only after a grace period. The removal runs at most once whichever
 * path reaches it.
 */
function realHomeGuard(context, { cwd, env, removals, label }) {
  let done = false
  /**
   * Deliberately NOT routed through {@link call}: no transcript hash, no redaction pass, no yield,
   * and no stop check. A removal must be the dumbest thing in this file — it runs from a signal
   * handler, where an `await` would hand control back to a loop that is trying to unwind, and it must
   * run even though a stop has been requested, which is the one condition `call` refuses on.
   */
  const removeNow = () => {
    if (done) return []
    done = true
    return removals.map((args) => {
      const result = spawnSync(context.binary, args, {
        cwd,
        env,
        encoding: 'utf8',
        timeout: CLEANUP_CALL_MS,
        maxBuffer: 8 * 1024 * 1024,
      })
      const spawned = result.error === undefined || result.error === null
      const how = spawned
        ? exitDescription({ status: result.status, signal: result.signal })
        : `could not run (${context.redact(result.error.message)})`
      // Each removal is an OUTCOME, not a line: a caller composing a leg's reason after the
      // `finally` needs to know whether the operator's home is clean, and a string does not say.
      return { line: `${context.display} ${args.join(' ')} ${how}`, ok: spawned && result.status === 0 }
    })
  }
  const registered = []
  for (const signal of ['SIGTERM', 'SIGINT']) {
    const handler = () => {
      // Set the flag FIRST: the loop this handler interrupted is between two client calls, and the
      // next one must refuse to spawn rather than carry on measuring a run somebody stopped.
      stopped.signal = signal
      console.error(`plugin-route: ${label} cleanup on ${signal} - ${removalOutcome(removeNow()).summary}`)
    }
    registered.push([signal, handler])
    process.once(signal, handler)
  }
  return {
    finish: () => {
      const outcome = removalOutcome(removeNow())
      for (const [name, fn] of registered) process.off(name, fn)
      return outcome
    },
  }
}

/**
 * What the removals did, as one sentence a leg reason can carry and one list the JSON keeps.
 *
 * Composed AFTER the removals ran, which is the fix (prove/221): the copilot and codex reasons used
 * to say "the plugin removed afterwards" from inside the `try`, before the `finally` had run a
 * single removal, so the evidence claimed a clean home on the strength of a plan. A removal that
 * failed now names its command and exit (already redacted by `removeNow`), and the words "removed
 * afterwards" appear only when every removal exited 0.
 */
export function removalOutcome(results) {
  const lines = results.map((result) => result.line)
  if (results.length === 0) return { lines, ok: true, summary: 'nothing to remove' }
  const failed = results.filter((result) => !result.ok).map((result) => result.line)
  if (failed.length === 0) return { lines, ok: true, summary: `removed afterwards (${lines.join('; ')})` }
  return {
    lines,
    ok: false,
    summary: `NOT removed afterwards — ${failed.join('; ')} — the operator's home may still carry it`,
  }
}

/** A leg that ran in the operator's real home, with the removal's own outcome appended to its reason. */
function withRemoval(entry, outcome) {
  return { ...entry, reason: `${entry.reason}; ${outcome.summary}` }
}

/**
 * Why the model legs must not run against the operator's real home, or `null` when they may.
 *
 * Two different reasons, one decision. An install that is already there must not be removed by this
 * run, and a probe that could not say either way must not be read as permission — a `SKIPPED` leg
 * costs a measurement, and the other way costs somebody their installed plugin.
 */
function preexistingReason(existing) {
  if (!existing.answered) {
    return (
      `the pre-existing-install probe could not answer (${existing.detail}), and this leg installs ` +
      `into the operator's own home and removes afterwards — it does not run on an unanswered probe`
    )
  }
  if (!existing.present) return null
  return (
    `a stamity plugin or marketplace is already installed in the operator's home ` +
    `(${existing.detail}); this leg installs and then removes, and removing would take the ` +
    `operator's own install with it`
  )
}

/** Which removal subcommands a client's own `plugin --help` lists, read before anything is added. */
function removalNote(help, words) {
  const found = words.filter((word) => help.redacted.includes(word))
  return found.length === 0 ? 'NO removal subcommand' : found.join(' and ')
}

/** The two legs after a leg that could not run: never a pass, always the reason. */
function blocked(reason) {
  return [leg('discovery', 'SKIPPED', reason), leg('invocation', 'SKIPPED', reason)]
}

/**
 * Discovery over one or more LISTINGS, which is the shape a client with a list subcommand takes.
 *
 * Every source's transcript is searched, and the leg passes only when every marker the root
 * declares resolves somewhere in them. A marker no source can answer for is not a failure of the
 * root — a client with no agent listing cannot list an agent — so the leg is SKIPPED with
 * `unresolved` naming what the missing measurement needs.
 */
function discoveryFrom(context, sources, made, unresolved) {
  if (sources.length === 0) return legFrom('discovery', 'SKIPPED', unresolved, made, context.version)
  const resolved = resolveMarkers(context.markers, sources.map((source) => source.transcript).join('\n'))
  const where = sources.map((source) => source.label).join(' + ')
  if (resolved.missing.length === 0) {
    return legFrom('discovery', 'PASS', `${where} names every marker — ${resolved.notes.join('; ')}`, made, context.version)
  }
  return legFrom(
    'discovery',
    'SKIPPED',
    `${where} — ${resolved.notes.join('; ')}; ${resolved.missing.join(', ')} is unresolved: ${unresolved}`,
    made,
    context.version,
  )
}

/**
 * Discovery read out of a transcript, with the forms that resolved named.
 *
 * The SAME blocker list {@link invocationLeg} consults, consulted FIRST (prove/211): a listing run
 * that never reached its model prints no id whatever the root carries, and a client can print a
 * usage limit or a login prompt and still exit 0 — the codex leg of 2026-09-20 did. Before this
 * order, that transcript read as a FAIL of the root's discovery while the invocation leg beside it,
 * reading the same words, said SKIPPED. Exported so the suite can drive the order with a
 * hand-built call rather than a credential.
 */
export function discoveryFromTranscript(context, made, source) {
  if (context.markers.length === 0) {
    return legFrom(
      'discovery',
      'SKIPPED',
      `this root declares no invocation form for a class it carries, so there is no marker to search ` +
        `for (${source})`,
      made,
      context.version,
    )
  }
  const blocker = blockerFor(made.redacted)
  if (blocker !== null) {
    return legFrom(
      'discovery',
      'SKIPPED',
      `${blocker.label} (${blocker.match}), so nothing about this root was listed (${source}; the run ` +
        `exited ${made.exit}): ${made.tail}`,
      made,
      context.version,
    )
  }
  const resolved = resolveMarkers(context.markers, made.redacted, alternateForms(context.client, context.markers))
  if (made.status !== 0) {
    return legFrom('discovery', 'SKIPPED', `the run exited ${made.exit} before it could list anything (${source}): ${made.tail}`, made, context.version)
  }
  if (resolved.missing.length > 0) {
    return legFrom(
      'discovery',
      'FAIL',
      `${resolved.missing.join(', ')} never appeared in ${source} — ${resolved.notes.join('; ')}; ` +
        `transcript tail: ${made.tail}`,
      made,
      context.version,
    )
  }
  return legFrom('discovery', 'PASS', `${source} — ${resolved.notes.join('; ')}`, made, context.version)
}

/**
 * A client asked to run a setup command its root does not generate.
 *
 * Only Codex reaches this today — its container declares no command class at all — and its own
 * README's shell line is the setup route, which {@link codexLegs} composes instead. Any other client
 * arriving here is a root that lost its generated command, and saying so beats prompting for a form
 * that reads `null`.
 */
function noSetupCommand(context) {
  return leg(
    'invocation',
    'SKIPPED',
    `dist/${context.client} generates no ${SETUP_ID} command, so there is no command to ask the client to run`,
  )
}

/** The invocation leg: the file the run left behind, and only that. */
function invocationLeg(context, made, repo, homeNote) {
  const landed = setupLanded(context.client, repo)
  if (landed.ok) {
    return legFrom('invocation', 'PASS', `${landed.detail} (${homeNote}; the run exited ${made.exit})`, made, context.version)
  }
  if (made.spawnFailure !== null) {
    return legFrom('invocation', 'FAIL', `the client could not run: ${made.spawnFailure}`, made, context.version)
  }
  const blocker = blockerFor(made.redacted)
  if (blocker !== null) {
    return legFrom(
      'invocation',
      'SKIPPED',
      `${blocker.label} (${blocker.match}), so nothing about this root was measured: ${landed.detail} ` +
        `(${homeNote}; the run exited ${made.exit}): ${made.tail}`,
      made,
      context.version,
    )
  }
  return legFrom('invocation', 'FAIL', `${landed.detail} (${homeNote}; the run exited ${made.exit}): ${made.tail}`, made, context.version)
}

const HANDLERS = { claude: claudeLegs, cursor: cursorLegs, copilot: copilotLegs, codex: codexLegs }

// ── the run ──────────────────────────────────────────────────────────────────

function parseArguments(argv) {
  const options = { dist: null, clients: [...DISTRIBUTION_CLIENTS], binaries: {}, invoke: false, scratch: null, json: null }
  const sinks = {
    '--dist': (value) => {
      options.dist = value
    },
    '--client': (value) => {
      options.clients = value.split(',').filter((entry) => entry !== '')
    },
    '--scratch': (value) => {
      options.scratch = value
    },
    '--json': (value) => {
      options.json = value
    },
  }
  for (const client of DISTRIBUTION_CLIENTS) {
    sinks[`--bin-${client}`] = (value) => {
      options.binaries[client] = value
    }
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--invoke') {
      options.invoke = true
      continue
    }
    const sink = Object.hasOwn(sinks, arg) ? sinks[arg] : null
    if (sink === null) return { code: usage(`Unknown argument: ${arg}`) }
    i += 1
    if (i >= argv.length) return { code: usage(`${arg} needs a value.`) }
    sink(argv[i])
  }
  if (options.dist === null) return { code: usage('--dist is required: the built distribution root to prove.') }
  const unknown = options.clients.filter((client) => !DISTRIBUTION_CLIENTS.includes(client))
  if (unknown.length > 0) return { code: usage(`--client names ${unknown.join(', ')}; the clients are ${DISTRIBUTION_CLIENTS.join(', ')}.`) }
  if (options.clients.length === 0) return { code: usage('--client named no client.') }
  return { options }
}

/** `--bin-<client>`, else `STAMITY_<CLIENT>_BIN`, else absent. */
function resolveBinary(client, options) {
  const flagged = options.binaries[client]
  if (typeof flagged === 'string' && flagged !== '') return { path: flagged, source: `--bin-${client}` }
  const variable = `STAMITY_${client.toUpperCase()}_BIN`
  const fromEnv = process.env[variable]
  if (typeof fromEnv === 'string' && fromEnv !== '') return { path: fromEnv, source: variable }
  return { path: null, source: variable }
}

export async function main(argv) {
  const parsed = parseArguments(argv)
  if (parsed.options === undefined) return parsed.code
  const options = parsed.options

  const dist = resolve(options.dist)
  // The two refusals below name the LABEL, not the argument. The caller knows what it passed, and
  // this stderr is a CI log an operator's absolute home directory has no business being in.
  if (!isDirectory(dist)) return usage('--dist <dir> is not a directory.')
  // A distribution root is the tree a release publishes, and `release.json` is what makes it one:
  // the four roots, the catalogs and the archives are all described there. A directory that merely
  // contains a `claude/` is not a distribution, and telling the caller so beats half a proof.
  if (!existsSync(join(dist, 'release.json'))) {
    return usage(
      '--dist <dir> carries no release.json, so it is not a distribution root (build it with ' +
        'scripts/build-plugin-distribution.mjs).',
    )
  }

  // A run-level stop handler, beside whatever a real-home guard registers of its own: most of this
  // run touches no operator state at all, and a stop during those legs must still stop the run
  // rather than walk every remaining client first.
  const stopHandlers = []
  for (const signal of ['SIGTERM', 'SIGINT']) {
    const handler = () => {
      stopped.signal = signal
      console.error(`plugin-route: stopping on ${signal}; the legs not yet measured are recorded as stopped`)
    }
    stopHandlers.push([signal, handler])
    process.once(signal, handler)
  }

  const ownScratch = options.scratch === null
  const scratch = ownScratch ? mkdtempSync(join(tmpdir(), 'stamity-plugin-route-')) : resolve(options.scratch)
  mkdirSync(scratch, { recursive: true })

  // `dist` is the caller's own argument: this document is a scratch artifact a harness or a CI job
  // reads, never a committed one. What IS committed downstream is `sha256s`, whose labels are
  // logical (`dist/<client>/…`) for the reason `scripts/qa/run.mjs` states at `repoRelativeLabel`.
  const report = { dist, sha256s: { 'scripts/plugin-route-smoke.mjs': sha256(readFileSync(SELF)) }, clients: {} }
  let failed = 0

  try {
    for (const client of options.clients) {
      const root = join(dist, client)
      // The structure leg spawns nothing, so it is measured even for a client reached after a stop:
      // it is the one leg a stopped run can still honestly report.
      const structure = structureLeg(client, root)
      const legs = [structure]

      // The row hash's inputs, under LOGICAL labels: what the leg measured, never where the tree
      // happened to sit. `scripts/qa/run.mjs`'s `repoRelativeLabel` and its S-4 comment are the
      // reason — an absolute path in a committed evidence file carries an operator's home.
      for (const rel of [CAPABILITY_FILE, ...treeFiles(root).filter((entry) => entry.endsWith('/hooks.json'))]) {
        const absolute = join(root, ...rel.split('/'))
        if (existsSync(absolute)) report.sha256s[`dist/${client}/${rel}`] = sha256(readFileSync(absolute))
      }

      const binary = resolveBinary(client, options)
      // The real-home removals' outcome lines, for the clients whose `--invoke` legs install into
      // the operator's own home; `null` for a client that ran no guard.
      let cleanup = null
      // A refused root is the stronger statement and comes first: it is why no client saw the tree,
      // whether or not this machine has that client's binary.
      if (stopped.signal !== null) {
        for (const name of ['install', 'discovery', 'invocation']) {
          legs.push(leg(name, 'SKIPPED', new RunStopped(stopped.signal).message))
        }
      } else if (structure.status === 'FAIL') {
        for (const name of ['install', 'discovery', 'invocation']) {
          legs.push(leg(name, 'SKIPPED', 'the structure leg failed, so this root was not handed to the client'))
        }
      } else if (binary.path === null) {
        for (const name of ['install', 'discovery', 'invocation']) legs.push(leg(name, 'SKIPPED', `${binary.source} unset`))
      } else {
        const capability = readJson(join(root, CAPABILITY_FILE))
        const context = {
          client,
          dist,
          root,
          scratch,
          invoke: options.invoke,
          binary: binary.path,
          // The printed command names the CLIENT's binary, never the path it was found at: the
          // command string lands in a committed evidence file.
          display: client === 'cursor' ? 'agent' : client,
          pluginVersion: capability.version,
          markers: markersFor(client, root, capability),
          setupForm: setupFormFor(client, root, capability),
          rootDigest: treeDigest(root),
        }
        // Built from the context, then carried ON it: every reason this client's legs compose runs
        // through the same redactor, including the version banner below — a client-controlled string
        // that reaches a committed evidence file and has been seen to carry a path.
        context.redact = redactor(context)
        context.version = context.redact(probeVersion(binary.path) ?? '') || null
        // The clients are walked STRICTLY in sequence: two of them install into the same real home,
        // they share one operator's credentials and rate limits, and a stop requested during one
        // must be honoured before the next one starts. `Promise.all` here would run four clients'
        // installs over each other.
        try {
          // oxlint-disable-next-line no-await-in-loop -- sequential by necessity; see above.
          legs.push(...(await HANDLERS[client](context)))
        } catch (error) {
          // A stop requested mid-client: the legs the handler had already composed are gone with its
          // stack, and every leg it had not reached is recorded as stopped. Its `finally` blocks have
          // run by the time this catch does, which is what takes a real-home install back out.
          if (!(error instanceof RunStopped)) throw error
          for (const name of LEGS.slice(legs.length)) legs.push(leg(name, 'SKIPPED', error.message))
        }
        cleanup = context.cleanup ?? null
      }

      report.clients[client] = cleanup === null ? { legs } : { legs, cleanup }
      for (const entry of legs) {
        if (entry.status === 'FAIL') failed += 1
        console.log(`plugin-route: ${client} ${entry.leg} ${entry.status} (${entry.reason})`)
      }
    }
  } finally {
    for (const [name, fn] of stopHandlers) process.off(name, fn)
    if (ownScratch) rmSync(scratch, { recursive: true, force: true })
  }

  if (options.json !== null) {
    mkdirSync(resolve(options.json, '..'), { recursive: true })
    writeFileSync(resolve(options.json), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(`plugin-route: json written to ${options.json}`)
  }

  const counts = Object.values(report.clients).flatMap((entry) => entry.legs)
  console.log(
    `plugin-route: ${failed === 0 ? 'PASS' : 'FAIL'} - ${counts.filter((entry) => entry.status === 'PASS').length} passed, ` +
      `${failed} failed, ${counts.filter((entry) => entry.status === 'SKIPPED').length} skipped ` +
      `across ${options.clients.length} client(s)${options.invoke ? ' with --invoke' : ''}` +
      `${stopped.signal === null ? '' : ` — STOPPED by ${stopped.signal}`}`,
  )
  return failed === 0 ? 0 : 1
}

/**
 * The entry point, and the one place the signal is RE-RAISED.
 *
 * A handler that re-raised immediately would kill the process before the run could record the legs it
 * did not measure and before the `finally` blocks could take a real-home install back out. So the
 * signal is honoured in two halves: stop and clean up on the way through, then die of the signal that
 * was sent once the run has unwound — so a caller reading `killed by signal SIGTERM` is told the
 * truth.
 */
async function runCli() {
  try {
    process.exitCode = await main(process.argv.slice(2))
  } catch (error) {
    // The MESSAGE, redacted, and not the stack: a stack frame is a file path, and this line is read
    // out of a CI log and quoted into a run record. The name of the error class travels with it so a
    // reader still knows what kind of failure it was.
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    console.error(`plugin-route: ERROR - ${redactPaths(detail, [[homedir(), '<home>']])}`)
    process.exitCode = 2
  }
  if (stopped.signal !== null) process.kill(process.pid, stopped.signal)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SELF) {
  void runCli()
}
