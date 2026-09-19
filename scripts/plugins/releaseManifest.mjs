// The machine-readable release contract: `release.json`, the one file a consumer reads to
// learn what a published distribution contains and whether the bytes it fetched are the
// bytes this repository built.
//
// Two halves, deliberately separate. `buildReleaseManifest` PROJECTS — it takes what the
// release job measured and lays it out in one fixed key order, so two builds of one source
// commit produce one byte sequence; it judges nothing, because a builder that silently
// dropped a malformed field would publish a manifest that reads as complete.
// `validateReleaseManifest` JUDGES — it returns one message per defect, each naming the
// JSON path, so the release job can refuse before publishing and a consumer can say exactly
// which field of a downloaded manifest is wrong. The writer of the file is P8's release
// builder; this module is the schema both it and the consumer share.

import { DISTRIBUTION_CLIENTS } from '../distribution-identity.mjs'

/** The schema version every manifest this module builds declares. */
export const RELEASE_MANIFEST_SCHEMA_VERSION = 1

const MANIFEST_KEYS = [
  'schemaVersion',
  'version',
  'sourceCommit',
  'sourceCommitDate',
  'distribution',
  'runtime',
  'packages',
  'catalogs',
  'apm',
]
const DISTRIBUTION_KEYS = ['branch', 'tag', 'commit']
const RUNTIME_KEYS = ['package', 'version', 'nodeFloor', 'tarballSha256']
const PACKAGE_KEYS = ['client', 'path', 'archive', 'sha256', 'bytes', 'clientFloor']
const APM_KEYS = ['manifest', 'primitives', 'installSpec']

const COMMIT_SHA = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
/** An RFC 3339 instant with an offset or `Z` — the shape `git log -1 --format=%cI` prints. */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

/** A client's place in the emission order; an unrecognised one ranks after all four. */
function clientRank(entry) {
  const index = DISTRIBUTION_CLIENTS.indexOf(entry?.client)
  return index === -1 ? DISTRIBUTION_CLIENTS.length : index
}

/**
 * The order two packages appear in, whatever order they were measured in: the four known
 * clients in emission order, then anything else by name — a manifest carrying an unrecognised
 * client is still built (and refused by the validator) rather than dropped.
 */
function comparePackages(left, right) {
  if (clientRank(left) !== clientRank(right)) return clientRank(left) - clientRank(right)
  const byClient = String(left?.client).localeCompare(String(right?.client))
  if (byClient !== 0) return byClient
  return String(left?.archive).localeCompare(String(right?.archive))
}

/** The catalog map in client order, so the emitted object's key order never follows input order. */
function orderCatalogs(catalogs) {
  const source = isPlainObject(catalogs) ? catalogs : {}
  const known = DISTRIBUTION_CLIENTS.filter((client) => Object.hasOwn(source, client))
  const rest = Object.keys(source)
    .filter((key) => !DISTRIBUTION_CLIENTS.includes(key))
    .toSorted()
  const ordered = {}
  for (const key of [...known, ...rest]) ordered[key] = source[key]
  return ordered
}

/**
 * Lay the measured release out as `release.json`'s object, key order fixed at every level.
 * Pure and total: a missing input becomes a missing key rather than a throw, and
 * {@link validateReleaseManifest} is what refuses it.
 */
export function buildReleaseManifest(input) {
  const source = isPlainObject(input) ? input : {}
  const distribution = isPlainObject(source.distribution) ? source.distribution : {}
  const runtime = isPlainObject(source.runtime) ? source.runtime : {}
  const apm = isPlainObject(source.apm) ? source.apm : {}
  const packages = Array.isArray(source.packages) ? source.packages : []
  return {
    schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
    version: source.version,
    sourceCommit: source.sourceCommit,
    sourceCommitDate: source.sourceCommitDate,
    distribution: {
      branch: distribution.branch,
      tag: distribution.tag,
      // `null` rather than absent: the distribution commit is unknowable while the commit
      // that carries this file is being written, and a key that disappears in that case
      // would make "not yet known" indistinguishable from "this build forgot to record it".
      commit: distribution.commit ?? null,
    },
    runtime: {
      package: runtime.package,
      version: runtime.version,
      nodeFloor: runtime.nodeFloor,
      tarballSha256: runtime.tarballSha256,
    },
    packages: packages.toSorted(comparePackages).map((entry) => {
      const row = isPlainObject(entry) ? entry : {}
      return {
        client: row.client,
        path: row.path,
        archive: row.archive,
        sha256: row.sha256,
        bytes: row.bytes,
        clientFloor: row.clientFloor,
      }
    }),
    catalogs: orderCatalogs(source.catalogs),
    apm: { manifest: apm.manifest, primitives: apm.primitives, installSpec: apm.installSpec },
  }
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

function checkTreePath(value, path, defects) {
  const ok =
    isNonEmptyString(value) && !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..')
  if (!ok) defects.push(`${path}: must be a relative path inside the distribution tree`)
}

function validateDistribution(value, defects) {
  if (!isPlainObject(value)) {
    defects.push('distribution: must be an object carrying branch, tag and commit')
    return
  }
  defects.push(...unsupportedKeys(value, DISTRIBUTION_KEYS, 'distribution.'))
  checkString(value.branch, 'distribution.branch', 'must be the distribution branch name', defects)
  checkString(value.tag, 'distribution.tag', 'must be the release tag name', defects)
  if (value.commit !== null && !(typeof value.commit === 'string' && COMMIT_SHA.test(value.commit))) {
    defects.push('distribution.commit: must be a 40-character lowercase hex commit sha, or null')
  }
}

function validateRuntime(value, defects) {
  if (!isPlainObject(value)) {
    defects.push('runtime: must be an object carrying package, version, nodeFloor and tarballSha256')
    return
  }
  defects.push(...unsupportedKeys(value, RUNTIME_KEYS, 'runtime.'))
  checkString(value.package, 'runtime.package', 'must be the runtime package name', defects)
  checkString(value.version, 'runtime.version', 'must be the runtime package version', defects)
  checkString(value.nodeFloor, 'runtime.nodeFloor', 'must be the declared Node floor range', defects)
  if (!(typeof value.tarballSha256 === 'string' && SHA256.test(value.tarballSha256))) {
    defects.push('runtime.tarballSha256: must be a 64-character lowercase hex digest')
  }
}

function validatePackages(value, defects) {
  if (!Array.isArray(value) || value.length === 0) {
    defects.push('packages: must be a non-empty array, one entry per built client root')
    return
  }
  const seen = new Set()
  value.forEach((entry, index) => {
    const at = `packages[${index}]`
    if (!isPlainObject(entry)) {
      defects.push(`${at}: must be an object describing one client root`)
      return
    }
    defects.push(...unsupportedKeys(entry, PACKAGE_KEYS, `${at}.`))
    if (!DISTRIBUTION_CLIENTS.includes(entry.client)) {
      defects.push(`${at}.client: must be one of ${DISTRIBUTION_CLIENTS.join(', ')}`)
    } else if (seen.has(entry.client)) {
      defects.push(`${at}.client: repeats a client already listed`)
    } else {
      seen.add(entry.client)
    }
    checkTreePath(entry.path, `${at}.path`, defects)
    checkString(entry.archive, `${at}.archive`, 'must be the release archive file name', defects)
    if (!(typeof entry.sha256 === 'string' && SHA256.test(entry.sha256))) {
      defects.push(`${at}.sha256: must be a 64-character lowercase hex digest`)
    }
    if (!(typeof entry.bytes === 'number' && Number.isSafeInteger(entry.bytes) && entry.bytes > 0)) {
      defects.push(`${at}.bytes: must be the archive size in bytes, a positive integer`)
    }
    checkString(entry.clientFloor, `${at}.clientFloor`, "must be the client's declared version floor", defects)
  })
}

function validateCatalogs(value, defects) {
  if (!isPlainObject(value) || Object.keys(value).length === 0) {
    defects.push('catalogs: must be a non-empty object mapping a client to its catalog file')
    return
  }
  for (const key of Object.keys(value).toSorted()) {
    if (!DISTRIBUTION_CLIENTS.includes(key)) {
      defects.push(`catalogs.${key}: is not a supported client`)
      continue
    }
    checkTreePath(value[key], `catalogs.${key}`, defects)
  }
}

function validateApm(value, defects) {
  if (!isPlainObject(value)) {
    defects.push('apm: must be an object carrying manifest, primitives and installSpec')
    return
  }
  defects.push(...unsupportedKeys(value, APM_KEYS, 'apm.'))
  checkTreePath(value.manifest, 'apm.manifest', defects)
  checkTreePath(value.primitives, 'apm.primitives', defects)
  checkTreePath(value.installSpec, 'apm.installSpec', defects)
}

/**
 * Judge one parsed `release.json`. Returns an empty array when it is valid, and otherwise one
 * message per defect, each beginning with the JSON path of the field it names.
 *
 * What it does NOT check: that a digest matches the archive it names, or that a catalog file
 * exists — both need the tree beside the manifest, which is the release job's own check
 * (REQ-PLUGIN-011). Nor does it cross-check `packages[]` against `catalogs`: one defect must
 * produce one message, and a cross-check turns a single wrong client into two.
 */
export function validateReleaseManifest(value) {
  if (!isPlainObject(value)) return [': must be a JSON object']
  const defects = unsupportedKeys(value, MANIFEST_KEYS, '')
  if (value.schemaVersion !== RELEASE_MANIFEST_SCHEMA_VERSION) {
    defects.push(`schemaVersion: must be ${RELEASE_MANIFEST_SCHEMA_VERSION}`)
  }
  checkString(value.version, 'version', 'must be the released package version', defects)
  if (!(typeof value.sourceCommit === 'string' && COMMIT_SHA.test(value.sourceCommit))) {
    defects.push('sourceCommit: must be a 40-character lowercase hex commit sha')
  }
  if (
    !(typeof value.sourceCommitDate === 'string' && TIMESTAMP.test(value.sourceCommitDate)) ||
    Number.isNaN(Date.parse(value.sourceCommitDate))
  ) {
    defects.push("sourceCommitDate: must be the source commit's committer date as an RFC 3339 timestamp")
  }
  validateDistribution(value.distribution, defects)
  validateRuntime(value.runtime, defects)
  validatePackages(value.packages, defects)
  validateCatalogs(value.catalogs, defects)
  validateApm(value.apm, defects)
  return defects
}
