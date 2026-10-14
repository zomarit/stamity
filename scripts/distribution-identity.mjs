// The package-author identity check: who owns the source (`stamity.publisher`) and where it
// lives (`repository.url`). Configuration states who owns the source; it never authorizes any
// public publishing job. `scripts/fork-identity.mjs` runs every candidate manifest through it
// before it writes anything.
//
// Through 1.14.0 a DISTRIBUTION half lived here too: where the per-client plugin roots were
// fetched from once published. The plugin and APM routes are deleted in 1.15.0, and that half
// with them. For one release a leftover `stamity.distribution` block is ignored with a one-line
// notice rather than refused, so a fork that merges upstream keeps working while it removes the
// block. The block is never read: whatever it holds, the notice is the same fixed line.

const DEFAULT_PUBLISHER = 'zomarit'
const OWNER_SLUG = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i
const REPOSITORY_SLUG = /^[a-z0-9_.-]{1,100}$/i

const DISTRIBUTION_NOTICE = 'package.json `stamity.distribution` is ignored since 1.15.0; remove it'

/** A JSON object — not null, not an array, not a class instance the config could not carry. */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The publisher, checked against the owner in `repository.url`, and the notices the manifest
 * earns. Throws on a manifest the identity rules refuse; no message echoes a configured value.
 *
 * @returns {{ publisher: string, notices: string[] }}
 */
export function resolveDistributionIdentity(pkg) {
  let publisher = DEFAULT_PUBLISHER
  const notices = []
  if (Object.hasOwn(pkg, 'stamity')) {
    const config = pkg.stamity
    if (!isPlainObject(config)) {
      throw new Error('package.json `stamity` must be an object containing only `publisher`.')
    }
    const unknown = Object.keys(config).filter((key) => key !== 'publisher' && key !== 'distribution')
    if (unknown.length > 0) {
      throw new Error('package.json `stamity` accepts only `publisher`; remove unsupported keys.')
    }
    if (Object.hasOwn(config, 'publisher')) {
      publisher = config.publisher
      if (typeof publisher !== 'string' || !OWNER_SLUG.test(publisher)) {
        throw new Error('package.json `stamity.publisher` must be a GitHub owner slug (1–39 letters, digits or single interior hyphens).')
      }
    }
    if (Object.hasOwn(config, 'distribution')) notices.push(DISTRIBUTION_NOTICE)
  }

  const url = pkg.repository?.url
  if (typeof url !== 'string') {
    throw new Error('Set package.json `repository.url` to https://github.com/<owner>/<repo>.')
  }
  const repository = url.replace(/^git\+/, '').replace(/\.git$/, '')
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(repository)
  if (match === null || !OWNER_SLUG.test(match[1]) || !REPOSITORY_SLUG.test(match[2]) || ['.', '..'].includes(match[2])) {
    // Do not echo an invalid URL: an accidentally embedded credential must not
    // become a diagnostic or a CI log entry.
    throw new Error('package.json `repository.url` must normalize to https://github.com/<owner>/<repo>, without credentials, query, fragment or extra paths. Update the supported github.com source URL and re-run.')
  }
  if (match[1].toLowerCase() !== publisher.toLowerCase()) {
    throw new Error('package.json `stamity.publisher` must match the owner in `repository.url`. Set an explicit downstream publisher (the absent default is zomarit) or correct the source URL, then re-run.')
  }
  return { publisher, notices }
}
