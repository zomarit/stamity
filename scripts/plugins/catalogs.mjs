// The four marketplace catalogs a distribution root ships — one per client, each in the shape
// its own vendor documents, all four describing the SAME plugin at the same version.
//
// A catalog is the file a client reads to learn that a plugin exists and where to fetch it
// from. It is not the plugin: each root under `<dist>/<client>/` carries its own container
// manifest, its capability file and its README. What a catalog adds is the ADDRESS, and the
// address is the one part of a published tree that a consuming organization has to be able to
// change without editing anything else — which is why every `source` object below is projected
// from `stamity.distribution.sources.<client>` in package.json rather than written here.
//
// FOUR SCHEMAS, NOT ONE. The clients agree on nothing but the word "marketplace"; each shape
// below is the one its reference page documents, read on the dates named, and the differences
// are load-bearing rather than cosmetic:
//
//   claude   `.claude-plugin/marketplace.json` — `name`, `owner { name, url }`, `description`,
//            `version`, `plugins[]`. The entry repeats the identity fields and carries a
//            SOURCE OBJECT whose `source` key names the kind: `git-subdir` (`url`, `path`,
//            `ref`, optional `sha`), `github` (`repo`, `ref`, optional `sha`), `archive`
//            (`url`, optional `sha256`, and NO ref — an archive is already one immutable
//            state), `npm` (`package`, optional `version` and `registry`).
//            https://code.claude.com/docs/en/plugin-marketplaces, read 2026-09-20.
//   cursor   `.cursor-plugin/marketplace.json` — `owner` is REQUIRED here and nowhere else,
//            `metadata` carries the description and version, and an entry's `source` is a
//            DIRECTORY PATH STRING. No remote source object is documented, so a configured
//            `archive` or `npm` kind cannot be expressed in this catalog; the distribution's
//            own copy of the root is what a Cursor team marketplace serves, and that is stated
//            in the README rather than approximated with a guessed object.
//            https://cursor.com/docs/reference/plugins, read 2026-09-20.
//   copilot  `.github/plugin/marketplace.json` — `name`, `owner { name, email? }`, `metadata
//            { description?, version?, pluginRoot? }`, `plugins[] { name, description,
//            version, source }`. `source` may be a relative path or an object naming a github
//            or url source with `ref`/`sha`/`path`; the object's KEY SPELLING is not stated on
//            the pages read, so this catalog emits the relative path — the form the tree it
//            ships in always satisfies — and leaves the object form to a downstream that has
//            read a page naming its keys.
//            https://docs.github.com/en/copilot/reference/cli-plugin-reference, read 2026-09-20.
//   codex    `.agents/plugins/marketplace.json` — `name`, `interface { displayName }`,
//            `plugins[]` whose entries MUST carry `policy.installation`,
//            `policy.authentication` and `category`, whose `source` is one of `local`, `url`,
//            `git-subdir` or `npm` (there is no `github` and no `archive` kind), and whose
//            `source.path` must start with `./` and stay inside the marketplace root. NO entry
//            `version` is documented — see the note on REQ-PLUGIN-010 below.
//            https://developers.openai.com/plugins/build/plugins, read 2026-09-20.
//
// REQ-PLUGIN-010 SAYS "every entry's version equals the release version". It holds for three
// catalogs and CANNOT hold for the fourth: the Codex marketplace schema documents no `version`
// key on a plugin entry, and an undocumented key on a catalog whose unresolvable entries are
// skipped SILENTLY is the worst kind of guess — it would not fail, it would disappear. The
// Codex entry therefore carries the version only where the vendor put it: inside the source
// object, as the `ref` of a git-backed source (`plugins/v<version>`) or the `version` of an
// npm source. The plugin's own `plugin.json` inside `codex/` carries the version for every
// reader that installs it.
//
// The literal policy and category values are the vendor example's, quoted from the page above:
// `"policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" }` and
// `"category": "Productivity"`. `installation` is documented with the value set `AVAILABLE`,
// `INSTALLED_BY_DEFAULT`, `NOT_AVAILABLE`; `AVAILABLE` is the one that means "a person may
// install this", which is what a public catalog offers. `authentication` is documented only as
// "decide whether auth happens on install or first use" with `ON_INSTALL` as its one example
// value, and no "none" value appears on the page — this plugin authenticates nothing, so the
// field is carried at the vendor's example value and the absence of a truthful alternative is
// recorded here rather than papered over. `category` has exactly one documented value on that
// page, `Productivity`, and a developer-tooling corpus is a defensible member of it.
//
// Every catalog is emitted as 2-space JSON with a trailing newline and a FIXED key order at
// every level, because the release compares bytes.

import { DISTRIBUTION_CLIENTS } from '../distribution-identity.mjs'

/** Where each client reads its catalog from, relative to the distribution root. */
export const CATALOG_PATHS = {
  claude: '.claude-plugin/marketplace.json',
  cursor: '.cursor-plugin/marketplace.json',
  copilot: '.github/plugin/marketplace.json',
  codex: '.agents/plugins/marketplace.json',
}

/** The registry a `npm` source omits, because it is what every client already resolves against. */
const DEFAULT_NPM_REGISTRY = 'https://registry.npmjs.org'

const COMMIT_SHA = /^[0-9a-f]{40}$/

/**
 * The build context every renderer is given. It is checked rather than merely accepted: a
 * catalog describes ONE built tree, and rendering one without the commit that produced it is
 * how a published address ends up pointing at a version nobody can identify.
 */
function requireContext(version, sourceCommit) {
  if (typeof version !== 'string' || version === '') {
    throw new Error('catalogs: the release version is required; a catalog entry states the version it serves.')
  }
  if (typeof sourceCommit !== 'string' || !COMMIT_SHA.test(sourceCommit)) {
    throw new Error(
      'catalogs: the source commit must be a 40-character lowercase hex sha, so a rendered catalog names one built tree.',
    )
  }
}

/** `plugins/v<version>`, from the identity's own tag pattern. */
export function releaseTag(identity, version) {
  return identity.distribution.tagPattern.replaceAll('<version>', version)
}

/** The distribution commit, when the caller knows it — the only optional selector a source adds. */
function requireDistributionCommit(distributionCommit) {
  if (distributionCommit === undefined || distributionCommit === null) return null
  if (typeof distributionCommit !== 'string' || !COMMIT_SHA.test(distributionCommit)) {
    throw new Error('catalogs: --distribution-commit must be a 40-character lowercase hex sha.')
  }
  return distributionCommit
}

/**
 * An archive source's URL. A configured `archive` kind names the location itself — this
 * repository's own release assets are one shape of that, a downstream's artifact store is
 * another — and `<version>` and `<client>` are substituted so one configured template serves
 * every release and every client.
 */
function archiveUrl(source, client, version) {
  return source.url.replaceAll('<version>', version).replaceAll('<client>', client)
}

/**
 * The digest of the archive this entry points at, supplied by the builder that just wrote it.
 * An `archive` source without one would publish a download nothing can verify, which is the
 * failure mode the whole release manifest exists to close.
 */
function archiveDigest(options, client) {
  const digest = options.archives?.[client]?.sha256
  if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) {
    throw new Error(
      `catalogs: the ${client} source is an archive, so the builder must supply the archive's sha256 ` +
        'before the catalog can name a verifiable download.',
    )
  }
  return digest
}

/**
 * Claude's source object, by configured kind. The whole object is replaced when the kind
 * changes — REQ-PLUGIN-010's "changes only that entry's source" — and nothing else in the
 * catalog moves with it.
 */
function claudeSource(identity, client, version, options) {
  const source = identity.distribution.sources[client]
  const tag = releaseTag(identity, version)
  const sha = requireDistributionCommit(options.distributionCommit)
  if (source.kind === 'archive') {
    // No `ref`: an archive URL already addresses one immutable state, and the vendor's archive
    // source documents `sha256` as its only selector.
    return { source: 'archive', url: archiveUrl(source, client, version), sha256: archiveDigest(options, client) }
  }
  if (source.kind === 'npm') {
    const entry = { source: 'npm', package: identity.packageName, version }
    if (source.registry !== undefined && source.registry !== DEFAULT_NPM_REGISTRY) entry.registry = source.registry
    return entry
  }
  if (source.kind === 'github') {
    const entry = { source: 'github', repo: source.repo, ref: tag }
    if (sha !== null) entry.sha = sha
    return entry
  }
  const entry = { source: 'git-subdir', url: source.url, path: source.path, ref: tag }
  if (sha !== null) entry.sha = sha
  return entry
}

/** `.claude-plugin/marketplace.json`. */
export function renderClaudeMarketplace(identity, version, sourceCommit, options = {}) {
  requireContext(version, sourceCommit)
  return {
    name: identity.name,
    owner: { name: identity.publisher, url: `https://github.com/${identity.ownerSlug}` },
    description: identity.description,
    version,
    plugins: [
      {
        name: identity.name,
        source: claudeSource(identity, 'claude', version, options),
        description: identity.description,
        version,
        author: { name: identity.publisher },
        homepage: identity.homepage,
        repository: identity.repository,
        license: identity.license,
        keywords: identity.keywords,
      },
    ],
  }
}

/** `owner` for the two catalogs that document an optional contact address on it. */
function ownerWithEmail(identity) {
  const owner = { name: identity.publisher }
  if (identity.distribution.ownerEmail !== undefined) owner.email = identity.distribution.ownerEmail
  return owner
}

/**
 * `.cursor-plugin/marketplace.json`. `owner` is required by the reference page; `pluginRoot` is
 * not emitted, because the entry's own relative `source` already names the directory and a
 * second, redundant root declaration is one more thing that can disagree with the tree.
 */
export function renderCursorMarketplace(identity, version, sourceCommit) {
  requireContext(version, sourceCommit)
  return {
    name: identity.name,
    owner: ownerWithEmail(identity),
    metadata: { description: identity.description, version },
    plugins: [
      {
        name: identity.name,
        source: `./${identity.distribution.sources.cursor.path}`,
        version,
        description: identity.description,
      },
    ],
  }
}

/** `.github/plugin/marketplace.json`. */
export function renderCopilotMarketplace(identity, version, sourceCommit) {
  requireContext(version, sourceCommit)
  return {
    name: identity.name,
    owner: ownerWithEmail(identity),
    metadata: { description: identity.description, version },
    plugins: [
      {
        name: identity.name,
        description: identity.description,
        version,
        source: `./${identity.distribution.sources.copilot.path}`,
      },
    ],
  }
}

/**
 * Codex's source object.
 *
 * The DEFAULT is `local`, and that is not a fallback: the catalog ships inside the very tree it
 * addresses, so `./codex` resolves without a fetch, without a ref, and without a network the
 * consumer may not have. A `git-subdir` source pointing at this repository's own remote would
 * describe the same bytes by a longer route.
 *
 * A configured source with a DIFFERENT url is a different tree — an organization's mirror —
 * and that one is addressed as `git-subdir`, pinned to the release tag, with `sha` available as
 * the alternative selector the vendor documents (`ref` or `sha`; this builder emits `ref`, and
 * adds `sha` when the distribution commit is known, exactly as the Claude entry does).
 *
 * `github` and `archive` have no Codex vocabulary at all — the documented kinds are `local`,
 * `url`, `git-subdir` and `npm` — so a client configured either way falls back to the in-tree
 * `local` source, which is true of the tree the catalog ships in whatever the other clients do.
 */
function codexSource(identity, version, options) {
  const source = identity.distribution.sources.codex
  const local = { source: 'local', path: `./${source.path}` }
  if (source.kind === 'npm') {
    const entry = { source: 'npm', package: identity.packageName, version }
    if (source.registry !== undefined) entry.registry = source.registry
    return entry
  }
  if (source.kind !== 'git-subdir') return local
  if (source.url === identity.defaultGitUrl) return local
  const entry = { source: 'git-subdir', url: source.url, path: `./${source.path}`, ref: releaseTag(identity, version) }
  const sha = requireDistributionCommit(options.distributionCommit)
  if (sha !== null) entry.sha = sha
  return entry
}

/** `.agents/plugins/marketplace.json`. */
export function renderCodexMarketplace(identity, version, sourceCommit, options = {}) {
  requireContext(version, sourceCommit)
  return {
    name: identity.name,
    interface: { displayName: identity.name },
    plugins: [
      {
        name: identity.name,
        source: codexSource(identity, version, options),
        // Mandatory on every entry per the vendor page; the values are its example's, and the
        // module header records why an authentication value exists at all for a plugin that
        // authenticates nothing.
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Productivity',
      },
    ],
  }
}

/** Client -> its renderer, so the builder loops rather than branching four times. */
export const CATALOG_RENDERERS = {
  claude: renderClaudeMarketplace,
  cursor: renderCursorMarketplace,
  copilot: renderCopilotMarketplace,
  codex: renderCodexMarketplace,
}

/**
 * The identity every renderer above reads: the distribution block, plus the package facts a
 * catalog entry repeats. Assembled once from package.json and the resolved identity so the
 * catalogs and the plugin roots cannot describe the same plugin differently.
 */
export function buildCatalogIdentity(pkg, resolved) {
  return {
    // The plugin id on every surface: the package name with its npm scope removed, the same
    // derivation `generate-plugin-packages.mjs` and `generate-plugin-manifests.mjs` make.
    name: pkg.name.replace(/^@[^/]+\//, ''),
    packageName: pkg.name,
    description: pkg.description,
    // The `#fragment` addresses a README section — npm's convention, not a homepage.
    homepage: typeof pkg.homepage === 'string' ? pkg.homepage.replace(/#.*$/, '') : pkg.homepage,
    repository: resolved.repository,
    license: pkg.license,
    keywords: pkg.keywords,
    publisher: resolved.publisher,
    ownerSlug: resolved.ownerSlug,
    /** `owner/repo` — what every `marketplace add` command in the README takes. */
    slug: resolved.repository.replace(/^https:\/\/github\.com\//, ''),
    /** The remote the identity defaults a `git-subdir` source to; see {@link codexSource}. */
    defaultGitUrl: `${resolved.repository}.git`,
    distribution: resolved.distribution,
  }
}

/** Render one client's catalog, or throw naming a client that has none. */
export function renderCatalog(client, identity, version, sourceCommit, options = {}) {
  const render = CATALOG_RENDERERS[client]
  if (render === undefined) {
    throw new Error(`catalogs: ${client} is not one of ${DISTRIBUTION_CLIENTS.join(', ')}.`)
  }
  return render(identity, version, sourceCommit, options)
}
