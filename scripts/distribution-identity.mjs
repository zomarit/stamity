// Shared package-author identity for the APM and plugin generators. Configuration
// states who owns the source; it never authorizes any public publishing job.

const DEFAULT_PUBLISHER = 'zomarit'
const OWNER_SLUG = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i
const REPOSITORY_SLUG = /^[a-z0-9_.-]{1,100}$/i

export function resolveDistributionIdentity(pkg) {
  let publisher = DEFAULT_PUBLISHER
  if (Object.hasOwn(pkg, 'stamity')) {
    const config = pkg.stamity
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('package.json `stamity` must be an object containing only `publisher`.')
    }
    const unknown = Object.keys(config).filter((key) => key !== 'publisher')
    if (unknown.length > 0) {
      throw new Error('package.json `stamity` accepts only `publisher`; remove unsupported keys.')
    }
    publisher = config.publisher
    if (typeof publisher !== 'string' || !OWNER_SLUG.test(publisher)) {
      throw new Error('package.json `stamity.publisher` must be a GitHub owner slug (1–39 letters, digits or single interior hyphens).')
    }
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
  return { publisher, repository, ownerSlug }
}
