// Shared package-author identity for the APM and plugin generators. Configuration
// states who owns the source; it never authorizes any public publishing job.
//
// The DISTRIBUTION half answers a second question: where the per-client plugin roots
// this repository builds are fetched FROM once they are published — a branch, a tag
// pattern and one source per client. It is configuration, never a credential store:
// a consuming organization points the sources at its own remote, and the secret that
// reaches that remote is the client's own git or npm authentication, held by the
// machine doing the fetch. Every refusal below exists to keep it that way.

const DEFAULT_PUBLISHER = 'zomarit'
const OWNER_SLUG = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i
const REPOSITORY_SLUG = /^[a-z0-9_.-]{1,100}$/i

/** The clients a distribution carries one source for, in the emission order every surface uses. */
export const DISTRIBUTION_CLIENTS = ['claude', 'cursor', 'copilot', 'codex']

/** The source kinds a catalog entry may name. `git-subdir` is the host-neutral one. */
export const SOURCE_KINDS = ['git-subdir', 'github', 'archive', 'npm']

const DEFAULT_BRANCH = 'plugin-dist'
const DEFAULT_TAG_PATTERN = 'plugins/v<version>'
const DEFAULT_NPM_REGISTRY = 'https://registry.npmjs.org'

const DISTRIBUTION_KEYS = ['branch', 'tagPattern', 'sources']
const SOURCE_KEYS = ['kind', 'url', 'repo', 'path', 'registry']

/**
 * A git ref name this generator is willing to write into a catalog: no leading or
 * trailing separator, no `..`, no shell or glob metacharacter. Narrower than git's own
 * rules on purpose — a branch or tag from configuration ends up inside a command line
 * a consumer's client runs.
 */
const REF_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

/** Words that name a credential wherever they appear in a key. */
const CREDENTIAL_WORDS = ['token', 'password', 'secret', 'auth', 'credential']

/**
 * Credential VALUE shapes, copied out of `scripts/leak-gate.mjs`'s `SECRET_RULES` rather
 * than imported: the gate is a whole-tree scanner whose module pulls in its rule table,
 * its normalizing passes and its path exemptions, and a generator that loaded it to check
 * five strings would inherit all of that on every run.
 *
 * Five of the gate's eleven shapes are mirrored — the ones that can plausibly be typed
 * into a configuration value by somebody wiring a private remote: a GitHub classic token
 * (`github-token`), a GitHub fine-grained token (`github-fine-grained-token`), a GitLab
 * personal access token (`gitlab-access-token`), a Slack token (`slack-token`) and an
 * `sk-` prefixed API key (`sk-prefixed-api-key`). The gate's other shapes describe things
 * that are not configuration values here (an AWS key id, a PEM block, a connection string
 * carrying inline credentials — that last one is already refused by the URL check below).
 *
 * A copy drifts unless something compares it: `test/ci/distributionIdentity.test.ts` pins
 * every `source` here against the gate's own rule of the same id, so the two cannot part.
 */
export const CREDENTIAL_SHAPES = [
  { id: 'github-token', source: '\\bgh[pousr]_[A-Za-z0-9]{36}\\b', flags: 'g' },
  { id: 'github-fine-grained-token', source: '\\bgithub_pat_[A-Za-z0-9_]{82}\\b', flags: 'g' },
  { id: 'gitlab-access-token', source: '\\bglpat-[A-Za-z0-9_-]{20,}\\b', flags: 'g' },
  { id: 'slack-token', source: '\\bxox[abporas]-[A-Za-z0-9-]{10,}\\b', flags: 'g' },
  { id: 'sk-prefixed-api-key', source: '\\bsk-(?:[A-Za-z0-9]{1,12}-)?[A-Za-z0-9_-]{20,}\\b', flags: 'g' },
].map((shape) => ({ id: shape.id, source: shape.source, pattern: new RegExp(shape.source, shape.flags) }))

/** A JSON object — not null, not an array, not a class instance the config could not carry. */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Refuse a credential before anything else reads the block, keys and values alike, at any
 * depth. Values are never echoed: a refusal is printed by the generators and lands in a CI
 * log, so quoting the thing that must not be committed would publish it a second time.
 */
function refuseCredentials(value, path) {
  if (typeof value === 'string') {
    const shape = CREDENTIAL_SHAPES.find((candidate) => {
      candidate.pattern.lastIndex = 0
      return candidate.pattern.test(value)
    })
    if (shape !== undefined) {
      throw new Error(
        `package.json stamity.distribution.${path} holds a ${shape.id} credential shape. ` +
          'Distribution configuration names public locations only; the value is not echoed. ' +
          'Remove it and let the fetching client supply its own authentication.',
      )
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => refuseCredentials(entry, `${path}[${index}]`))
    return
  }
  if (!isPlainObject(value)) return
  for (const [key, entry] of Object.entries(value)) {
    const lowered = key.toLowerCase()
    if (CREDENTIAL_WORDS.some((word) => lowered.includes(word))) {
      throw new Error(
        `package.json stamity.distribution refuses credential-shaped keys (${path === '' ? key : `${path}.${key}`})`,
      )
    }
    refuseCredentials(entry, path === '' ? key : `${path}.${key}`)
  }
}

/** Every key outside the supported set, refused by name at its own path. */
function refuseUnknownKeys(value, supported, path) {
  const unknown = Object.keys(value).filter((key) => !supported.includes(key))
  if (unknown.length > 0) {
    const key = unknown.toSorted()[0]
    throw new Error(`package.json stamity.distribution.${path === '' ? key : `${path}.${key}`} is not a supported key`)
  }
}

/** An https location with no inline credentials — the only URL shape a catalog entry may name. */
function requireCleanUrl(value, path) {
  let parsed = null
  if (typeof value === 'string') {
    try {
      parsed = new URL(value)
    } catch {
      parsed = null
    }
  }
  if (parsed === null || parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
    // The URL itself is not echoed: the shape this refusal exists for is a URL with a
    // password in its userinfo, and printing it would put the password in the log.
    throw new Error(
      `package.json stamity.distribution.${path} must be an https URL carrying no credentials in its userinfo.`,
    )
  }
  return parsed
}

/** A relative location inside the distribution tree: no absolute root, no `..`, no backslash. */
function requireTreePath(value, path) {
  const ok =
    typeof value === 'string' &&
    value.length > 0 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.split('/').includes('..') &&
    !/^[A-Za-z]:/.test(value)
  if (!ok) {
    throw new Error(
      `package.json stamity.distribution.${path} must be a relative path inside the distribution tree, without \`..\` segments.`,
    )
  }
  return value
}

/**
 * One client's source. An absent entry resolves to the host-neutral default — the
 * repository's own git remote, the client's directory at the tree root — so a repository
 * that configures nothing still has four complete sources.
 */
function resolveSource(client, configured, context) {
  const at = `sources.${client}`
  if (configured === undefined) {
    return { kind: 'git-subdir', url: `${context.repository}.git`, path: client }
  }
  if (!isPlainObject(configured)) {
    throw new Error(`package.json stamity.distribution.${at} must be an object describing one source.`)
  }
  refuseUnknownKeys(configured, SOURCE_KEYS, at)

  const kind = configured.kind ?? 'git-subdir'
  if (!SOURCE_KINDS.includes(kind)) {
    throw new Error(`package.json stamity.distribution.${at}.kind must be one of ${SOURCE_KINDS.join(', ')}`)
  }

  const url = configured.url ?? (kind === 'git-subdir' ? `${context.repository}.git` : undefined)
  if (url !== undefined) requireCleanUrl(url, `${at}.url`)
  if (kind === 'archive' && url === undefined) {
    throw new Error(
      `package.json stamity.distribution.${at}.kind archive needs a url naming the archive to download.`,
    )
  }
  // The host boundary, stated once: `github` means the GitHub API — releases, tags and the
  // owner/repo pair those endpoints take — so it cannot address another forge. `git-subdir`
  // and `archive` are plain git and plain HTTPS and take any host, which is how a downstream
  // on its own server publishes without this repository knowing the hostname.
  if (kind === 'github' && url !== undefined && new URL(url).hostname !== 'github.com') {
    throw new Error(
      `package.json stamity.distribution.${at}.kind github addresses github.com only; ` +
        'use kind git-subdir, which is host-neutral, for another host.',
    )
  }

  const repo = configured.repo ?? (kind === 'github' ? `${context.ownerSlug}/${context.repositorySlug}` : undefined)
  if (repo !== undefined) {
    const parts = typeof repo === 'string' ? repo.split('/') : []
    if (parts.length !== 2 || !OWNER_SLUG.test(parts[0] ?? '') || !REPOSITORY_SLUG.test(parts[1] ?? '')) {
      throw new Error(`package.json stamity.distribution.${at}.repo must be <owner>/<repository>.`)
    }
  }

  const registry = configured.registry ?? (kind === 'npm' ? DEFAULT_NPM_REGISTRY : undefined)
  if (registry !== undefined) requireCleanUrl(registry, `${at}.registry`)

  const path = requireTreePath(configured.path ?? client, `${at}.path`)

  // Key order is fixed, not incidental: P8 renders these objects into catalog files whose
  // bytes are compared, so the order a source is built in is part of the contract.
  const source = { kind }
  if (url !== undefined) source.url = url
  if (repo !== undefined) source.repo = repo
  source.path = path
  if (registry !== undefined) source.registry = registry
  return source
}

/** The whole `stamity.distribution` block, resolved against the defaults. */
function resolveDistribution(configured, context) {
  if (configured === undefined) return resolveDistribution({}, context)
  if (!isPlainObject(configured)) {
    throw new Error('package.json `stamity.distribution` must be an object.')
  }
  // Credentials first, so a key called `token` is refused as a credential rather than as an
  // unknown key: the second message is true but tells the author the wrong thing to fix.
  refuseCredentials(configured, '')
  refuseUnknownKeys(configured, DISTRIBUTION_KEYS, '')

  const branch = configured.branch ?? DEFAULT_BRANCH
  if (typeof branch !== 'string' || !REF_NAME.test(branch) || branch.includes('..') || branch.endsWith('/')) {
    throw new Error(
      'package.json stamity.distribution.branch must be a git branch name: letters, digits, `.`, `_`, `-` or `/`, starting with a letter or digit.',
    )
  }

  const tagPattern = configured.tagPattern ?? DEFAULT_TAG_PATTERN
  const rendered = typeof tagPattern === 'string' ? tagPattern.replaceAll('<version>', '0.0.0') : ''
  if (
    typeof tagPattern !== 'string' ||
    !tagPattern.includes('<version>') ||
    !REF_NAME.test(rendered) ||
    rendered.includes('..') ||
    rendered.endsWith('/')
  ) {
    throw new Error(
      'package.json stamity.distribution.tagPattern must contain `<version>` and render a git tag name: letters, digits, `.`, `_`, `-` or `/`.',
    )
  }

  const configuredSources = configured.sources ?? {}
  if (!isPlainObject(configuredSources)) {
    throw new Error('package.json stamity.distribution.sources must be an object keyed by client.')
  }
  refuseUnknownKeys(configuredSources, DISTRIBUTION_CLIENTS, 'sources')

  const sources = {}
  for (const client of DISTRIBUTION_CLIENTS) {
    sources[client] = resolveSource(client, configuredSources[client], context)
  }
  return { branch, tagPattern, sources }
}

export function resolveDistributionIdentity(pkg) {
  let publisher = DEFAULT_PUBLISHER
  let distributionConfig
  if (Object.hasOwn(pkg, 'stamity')) {
    const config = pkg.stamity
    if (!isPlainObject(config)) {
      throw new Error('package.json `stamity` must be an object containing only `publisher` and `distribution`.')
    }
    const unknown = Object.keys(config).filter((key) => key !== 'publisher' && key !== 'distribution')
    if (unknown.length > 0) {
      throw new Error('package.json `stamity` accepts only `publisher` and `distribution`; remove unsupported keys.')
    }
    // Each key is independently optional: a repository that configures only its
    // distribution keeps the publisher default, which is the owner in `repository.url`.
    if (Object.hasOwn(config, 'publisher')) {
      publisher = config.publisher
      if (typeof publisher !== 'string' || !OWNER_SLUG.test(publisher)) {
        throw new Error('package.json `stamity.publisher` must be a GitHub owner slug (1–39 letters, digits or single interior hyphens).')
      }
    }
    if (Object.hasOwn(config, 'distribution')) distributionConfig = config.distribution
  }

  const url = pkg.repository?.url
  if (typeof url !== 'string') {
    throw new Error('Set package.json `repository.url` to https://github.com/<owner>/<repo>.')
  }
  const repository = url.replace(/^git\+/, '').replace(/\.git$/, '')
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(repository)
  if (match === null || !OWNER_SLUG.test(match[1]) || !REPOSITORY_SLUG.test(match[2]) || ['.', '..'].includes(match[2])) {
    // Do not echo an invalid URL: an accidentally embedded credential must not
    // become a generator diagnostic or a CI log entry.
    throw new Error('package.json `repository.url` must normalize to https://github.com/<owner>/<repo>, without credentials, query, fragment or extra paths. Update the supported github.com source URL and re-run.')
  }
  const ownerSlug = match[1]
  if (ownerSlug.toLowerCase() !== publisher.toLowerCase()) {
    throw new Error('package.json `stamity.publisher` must match the owner in `repository.url`. Set an explicit downstream publisher (the absent default is zomarit) or correct the source URL, then re-run.')
  }
  const distribution = resolveDistribution(distributionConfig, {
    repository,
    ownerSlug,
    repositorySlug: match[2],
  })
  return { publisher, repository, ownerSlug, distribution }
}
