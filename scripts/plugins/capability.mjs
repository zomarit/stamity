// `stamity-plugin.json`: what one generated plugin root declares about itself.
//
// One file answers the questions a consumer cannot answer by looking: which client this root is
// for, which commit built it, how its artifacts are invoked, which version of the client it needs,
// which classes it CARRIES versus which the repository still owns, and where the runtime that
// runs `stamity plugin setup` lives. The reader is `src/plugins/capabilityFile.ts`, and it is
// STRICT — an unknown top-level key is refused there — so the key set below is a contract between
// two halves of the system rather than a convenience for whoever writes the generator next.
//
// Two halves, deliberately separate, following `scripts/plugins/releaseManifest.mjs`.
// `buildCapabilityFile` PROJECTS: it lays the measured root out in one fixed key order and judges
// nothing, so two builds of one source commit produce one byte sequence and a missing input
// becomes a missing key rather than a throw. `validateCapabilityFile` JUDGES: one message per
// defect, each naming its JSON path, so the generator can refuse before writing and a consumer
// can say exactly which field of a downloaded root is wrong.
//
// `distribution` is emitted ONLY when the input records one. It carries the route an organization
// serves this root through where the route is not simply "install the file" — the Cursor team
// marketplace is the case that motivated it. The key is therefore OPTIONAL in the reader's schema,
// and its absence means "no route worth stating", never "the builder forgot".

import { DISTRIBUTION_CLIENTS } from '../distribution-identity.mjs'
// The plugin's own version, validated rather than merely non-empty because
// `scripts/plugins/locate.mjs` parses this same field as semver — a root
// declaring `latest` would resolve nothing there and say nothing here.
import { PLUGIN_VERSION } from './version.mjs'

/** The schema version every capability file this module builds declares. */
export const CAPABILITY_SCHEMA_VERSION = 1

/** Every artifact class a root declares a status for, in the order the file lists them. */
export const PLUGIN_CLASSES = ['agent', 'skill', 'command', 'rule', 'hooks', 'mcp']

/** What a class's `status` may say. */
const CLASS_STATUSES = new Set(['carried', 'repository-owned', 'unsupported'])

/** The three statuses as one English list, so every message naming them reads the same. */
const CLASS_STATUS_LIST = 'carried, repository-owned or unsupported'

/** Where the bundled runtime sits inside every root. Fixed by the layout, not per client. */
const RUNTIME_PATH = 'runtime'
const RUNTIME_LOCATOR = 'runtime/locate.mjs'

const TOP_KEYS = [
  'schemaVersion',
  'client',
  'version',
  'sourceCommit',
  'invocation',
  'clientFloor',
  'prerequisites',
  'classes',
  'runtime',
  'distribution',
]
const CLIENT_FLOOR_KEYS = ['version', 'citation', 'reason']
const CITATION_KEYS = ['url', 'accessDate']
const CLASS_KEYS = ['status', 'count', 'reason']
const RUNTIME_KEYS = ['path', 'locator', 'companion']
const COMPANION_KEYS = ['package', 'compatible']
const DISTRIBUTION_KEYS = ['note']

const COMMIT_SHA = /^[0-9a-f]{40}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** The floor shape `package.json` `engines.node` carries, the only range this file states. */
const NODE_FLOOR = /^>=\d+\.\d+\.\d+$/

/**
 * The companion range: same major, at or above this plugin's version.
 *
 * The prerelease tail is admitted because `satisfiesCaret` in
 * `scripts/plugins/locate.mjs` HONOURS a prerelease range — `^1.9.0-rc.1`
 * accepts exactly `1.9.0-rc.1` — and a validator that refused what the resolver
 * accepts would block the release-candidate root the resolver was written for.
 */
const CARET_RANGE = /^\^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

/** Keys in a fixed order whatever order they were built in: the named ones first, then the rest sorted. */
function orderedKeys(source, known) {
  const first = known.filter((key) => Object.hasOwn(source, key))
  const rest = Object.keys(source)
    .filter((key) => !known.includes(key))
    .toSorted()
  return [...first, ...rest]
}

/** A record whose key order is its own, not its caller's — two builds must agree byte for byte. */
function orderedRecord(value, known = []) {
  const source = isPlainObject(value) ? value : {}
  const ordered = {}
  for (const key of orderedKeys(source, known)) ordered[key] = source[key]
  return ordered
}

function buildClientFloor(value) {
  const source = isPlainObject(value) ? value : {}
  const floor = { version: source.version }
  if (isPlainObject(source.citation)) {
    floor.citation = { url: source.citation.url, accessDate: source.citation.accessDate }
  }
  if (source.reason !== undefined) floor.reason = source.reason
  return floor
}

function buildClasses(value) {
  const source = isPlainObject(value) ? value : {}
  const classes = {}
  for (const name of PLUGIN_CLASSES) {
    if (!isPlainObject(source[name])) continue
    const entry = source[name]
    const built = { status: entry.status }
    // A key present with `undefined` reads as declared-but-empty to `Object.keys`; a class that
    // states no count states no count.
    if (entry.count !== undefined) built.count = entry.count
    if (entry.reason !== undefined) built.reason = entry.reason
    classes[name] = built
  }
  return classes
}

function buildRuntime(value) {
  const source = isPlainObject(value) ? value : {}
  const companion = isPlainObject(source.companion) ? source.companion : {}
  return {
    path: source.path ?? RUNTIME_PATH,
    locator: source.locator ?? RUNTIME_LOCATOR,
    companion: { package: companion.package, compatible: companion.compatible },
  }
}

/**
 * Lay a measured root out as `stamity-plugin.json`'s object, key order fixed at every level.
 * Pure and total; {@link validateCapabilityFile} is what refuses a malformed input.
 */
export function buildCapabilityFile(input) {
  const source = isPlainObject(input) ? input : {}
  const file = {
    schemaVersion: CAPABILITY_SCHEMA_VERSION,
    client: source.client,
    version: source.version,
    sourceCommit: source.sourceCommit,
    invocation: orderedRecord(source.invocation),
    clientFloor: buildClientFloor(source.clientFloor),
    prerequisites: orderedRecord(source.prerequisites, ['node', 'git']),
    classes: buildClasses(source.classes),
    runtime: buildRuntime(source.runtime),
  }
  if (isPlainObject(source.distribution)) file.distribution = { note: source.distribution.note }
  return file
}

/** One message per unsupported key, each naming its own path. */
function unsupportedKeys(value, supported, prefix) {
  return Object.keys(value)
    .filter((key) => !supported.includes(key))
    .toSorted()
    .map((key) => `${prefix}${key}: is not a supported key`)
}

function checkString(value, path, requirement, defects) {
  if (!isNonEmptyString(value)) defects.push(`${path}: ${requirement}`)
}

/**
 * Keys under `invocation` that are NOTES about the forms rather than forms themselves.
 *
 * `citation` is the one, and it is RESERVED rather than merely tolerated. The Cursor container
 * reads its `/<id>` form off the subagents and skills pages because the plugins reference states
 * no invocation form at all, and the file records which page said what. A consumer enumerating
 * the literals an operator may type must not offer that sentence as one of them, so the key is
 * named here and excluded by `invocationForms` in `src/plugins/capabilityFile.ts`. A container
 * that wants a second note adds it to this list; anything else under `invocation` is a form.
 */
export const INVOCATION_NOTE_KEYS = ['citation']

function validateInvocation(value, defects) {
  if (!isPlainObject(value)) {
    defects.push('invocation: must be an object naming at least one invocation form')
    return
  }
  if (Object.keys(value).every((key) => INVOCATION_NOTE_KEYS.includes(key))) {
    defects.push('invocation: must be an object naming at least one invocation form')
    return
  }
  for (const key of Object.keys(value).toSorted()) {
    const requirement = INVOCATION_NOTE_KEYS.includes(key)
      ? 'must be the note this key reserves: where the forms beside it were read from'
      : 'must be the literal form an operator types'
    checkString(value[key], `invocation.${key}`, requirement, defects)
  }
}

function validateClientFloor(value, defects) {
  if (!isPlainObject(value)) {
    defects.push("clientFloor: must be an object carrying the client's version floor")
    return
  }
  defects.push(...unsupportedKeys(value, CLIENT_FLOOR_KEYS, 'clientFloor.'))
  checkString(value.version, 'clientFloor.version', 'must be a version or the word unknown', defects)
  if (value.citation !== undefined) {
    if (!isPlainObject(value.citation)) {
      defects.push('clientFloor.citation: must be an object carrying url and accessDate')
    } else {
      defects.push(...unsupportedKeys(value.citation, CITATION_KEYS, 'clientFloor.citation.'))
      checkString(value.citation.url, 'clientFloor.citation.url', 'must be the vendor page the floor was read from', defects)
      if (!(typeof value.citation.accessDate === 'string' && ISO_DATE.test(value.citation.accessDate))) {
        defects.push('clientFloor.citation.accessDate: must be an ISO date, YYYY-MM-DD')
      }
    }
  }
  if (value.reason !== undefined) {
    checkString(value.reason, 'clientFloor.reason', 'must say why no floor is stated', defects)
  }
}

function validatePrerequisites(value, defects) {
  if (!isPlainObject(value)) {
    defects.push('prerequisites: must be an object carrying node and git')
    return
  }
  if (!(typeof value.node === 'string' && NODE_FLOOR.test(value.node))) {
    defects.push('prerequisites.node: must be a >=x.y.z range naming the Node floor')
  }
  if (value.git !== 'optional' && value.git !== 'required') {
    defects.push('prerequisites.git: must be optional or required')
  }
  for (const key of Object.keys(value).toSorted()) {
    if (key === 'node' || key === 'git') continue
    checkString(value[key], `prerequisites.${key}`, 'must be the command that installs the tool', defects)
  }
}

function validateClasses(value, defects) {
  if (!isPlainObject(value)) {
    defects.push(`classes: must be an object carrying one entry per class in ${PLUGIN_CLASSES.join(', ')}`)
    return
  }
  defects.push(...unsupportedKeys(value, PLUGIN_CLASSES, 'classes.'))
  for (const name of PLUGIN_CLASSES) {
    const at = `classes.${name}`
    const entry = value[name]
    if (!isPlainObject(entry)) {
      defects.push(`${at}: must declare a status of ${CLASS_STATUS_LIST}`)
      continue
    }
    defects.push(...unsupportedKeys(entry, CLASS_KEYS, `${at}.`))
    if (!CLASS_STATUSES.has(entry.status)) {
      defects.push(`${at}.status: must be ${CLASS_STATUS_LIST}`)
      continue
    }
    if (entry.status === 'carried') {
      if (!(typeof entry.count === 'number' && Number.isSafeInteger(entry.count) && entry.count >= 0)) {
        defects.push(`${at}.count: must be the number of files the root carries for a carried class`)
      }
      // A carried class may explain itself, but the explanation is prose or it
      // is nothing: a number here reaches a reader as a sentence.
      if (entry.reason !== undefined && !isNonEmptyString(entry.reason)) {
        defects.push(`${at}.reason: must be a sentence when a carried class states one`)
      }
      continue
    }
    // The count is what `carried` MEANS. A class that is not carried counting
    // files is a projection of two different facts into one key, and a consumer
    // reading the count without the status would be told the root ships them.
    if (entry.count !== undefined) defects.push(`${at}.count: is stated only by a carried class`)
    if (!isNonEmptyString(entry.reason)) defects.push(`${at}.reason: must say why the class is not carried`)
  }
}

function validateRuntime(value, defects) {
  if (!isPlainObject(value)) {
    defects.push('runtime: must be an object carrying path, locator and companion')
    return
  }
  defects.push(...unsupportedKeys(value, RUNTIME_KEYS, 'runtime.'))
  checkString(value.path, 'runtime.path', 'must be the directory the bundled runtime sits in', defects)
  checkString(value.locator, 'runtime.locator', 'must be the path of the locator script inside the root', defects)
  if (!isPlainObject(value.companion)) {
    defects.push('runtime.companion: must be an object carrying package and compatible')
    return
  }
  defects.push(...unsupportedKeys(value.companion, COMPANION_KEYS, 'runtime.companion.'))
  checkString(value.companion.package, 'runtime.companion.package', 'must be the npm package a repository may install instead', defects)
  if (!(typeof value.companion.compatible === 'string' && CARET_RANGE.test(value.companion.compatible))) {
    defects.push('runtime.companion.compatible: must be a caret range over the plugin version, for example ^1.9.0')
  }
}

function validateDistribution(value, defects) {
  if (!isPlainObject(value)) {
    defects.push('distribution: must be an object carrying a note, or be absent')
    return
  }
  defects.push(...unsupportedKeys(value, DISTRIBUTION_KEYS, 'distribution.'))
  checkString(value.note, 'distribution.note', 'must state the route an organization serves this root through', defects)
}

/** One message per defect, each naming its JSON path; an empty array is a valid file. */
export function validateCapabilityFile(value) {
  if (!isPlainObject(value)) {
    return ['capability file: must be a JSON object carrying the plugin\'s declared capabilities']
  }
  const defects = unsupportedKeys(value, TOP_KEYS, '')
  if (value.schemaVersion !== CAPABILITY_SCHEMA_VERSION) {
    defects.push(`schemaVersion: must be ${CAPABILITY_SCHEMA_VERSION}, the only schema this container declares`)
  }
  if (!DISTRIBUTION_CLIENTS.includes(value.client)) {
    defects.push(`client: must be one of ${DISTRIBUTION_CLIENTS.join(', ')}`)
  }
  if (!(typeof value.version === 'string' && PLUGIN_VERSION.test(value.version))) {
    defects.push('version: must be the plugin version this root was built at, as major.minor.patch')
  }
  if (!(typeof value.sourceCommit === 'string' && COMMIT_SHA.test(value.sourceCommit))) {
    defects.push('sourceCommit: must be a 40-character lowercase hex commit sha')
  }
  validateInvocation(value.invocation, defects)
  validateClientFloor(value.clientFloor, defects)
  validatePrerequisites(value.prerequisites, defects)
  validateClasses(value.classes, defects)
  validateRuntime(value.runtime, defects)
  if (value.distribution !== undefined) validateDistribution(value.distribution, defects)
  return defects
}
