// The Claude Code managed-settings template an organization's admin installs to roll this
// plugin out to every user (REQ-PLUGIN-029). `scripts/build-plugin-distribution.mjs` renders it
// into `admin/claude-managed-settings.json` of the distribution tree, from the same identity the
// catalogs are rendered from, so the file is derived and travels with the tag an admin pins.
//
// FOUR KEYS, AND ONE PAIR THAT MUST AGREE. The template declares the company marketplace, turns
// the plugin on, admits only that marketplace, and refuses a client too old to enforce the
// admission. The allowlist is matched EXACTLY by the client — a `ref` or `repo` that differs from
// the declared source by one character matches nothing — so the declared source and the
// allowlist entry are built by one function and never spelled twice.
//
// NO VENDORED SCHEMA. The SchemaStore schema for Claude Code settings admits unknown keys at its
// top level, so validating against it could not catch a renamed key; the key list below is the
// contract, each with the page it was read from.

/**
 * The first Claude Code release where an invalid `strictKnownMarketplaces` value is enforced as
 * an empty allowlist (fails closed) rather than ignored.
 * https://code.claude.com/docs/en/managed-settings, accessed 2026-09-24.
 */
export const MIN_CLAUDE_VERSION = '2.1.277'

/** The template's keys, in the order the file carries them. */
export const MANAGED_SETTINGS_KEYS = [
  // The marketplaces every user's client knows without a `marketplace add`.
  // https://code.claude.com/docs/en/plugin-marketplaces, accessed 2026-09-24.
  'extraKnownMarketplaces',
  // `<plugin>@<marketplace>` -> on, for everyone the managed file reaches.
  // https://code.claude.com/docs/en/plugin-marketplaces, accessed 2026-09-24.
  'enabledPlugins',
  // The only marketplace sources a user may add, matched exactly against the declared source.
  // https://code.claude.com/docs/en/managed-settings, accessed 2026-09-24.
  'strictKnownMarketplaces',
  // An older client refuses to start; an invalid value is dropped by the client.
  // https://code.claude.com/docs/en/managed-settings, accessed 2026-09-24.
  'requiredMinimumVersion',
]

/**
 * The git ref-name rule of `scripts/distribution-identity.mjs`, mirrored rather than imported
 * because that module keeps it private. `test/ci/managedSettings.test.ts` reads the original's
 * literal out of the committed source and pins this copy to it, so the two cannot part.
 */
export const REF_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

// SemVer numeric identifiers carry no leading zero: `2.1.0277` would pass a numeric floor, and the
// client drops the invalid value, so an older client would start under the policy.
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/** `owner/repo`: one `/`, a non-empty part either side, no whitespace. */
const SLUG = /^[^/\s]+\/[^/\s]+$/

/** `identity`, or a throw naming the field. A missing field would render as `undefined` on both sides. */
function requireIdentity(identity) {
  if (typeof identity?.name !== 'string' || identity.name === '') {
    throw new Error('managed-settings: identity.name must be a non-empty string. Pass buildCatalogIdentity(pkg, resolved).')
  }
  if (typeof identity.slug !== 'string' || !SLUG.test(identity.slug)) {
    throw new Error('managed-settings: identity.slug must be a string in owner/repo form. Pass buildCatalogIdentity(pkg, resolved).')
  }
  return identity
}

/** `ref`, or a throw naming the field. The value is a git ref a client fetches, so it is narrow. */
function requireRef(ref) {
  if (typeof ref !== 'string' || !REF_NAME.test(ref) || ref.includes('..') || ref.endsWith('/')) {
    throw new Error(
      'managed-settings: ref must be a git ref name — letters, digits, `.`, `_`, `-` or `/`, starting with a ' +
        'letter or digit, with no `..` and no trailing `/`. The builder passes the release tag.',
    )
  }
  return ref
}

/** `minimumVersion`, or a throw naming the field: a plain x.y.z at or above the floor. */
function requireMinimumVersion(minimumVersion) {
  const parts = typeof minimumVersion === 'string' ? SEMVER.exec(minimumVersion) : null
  if (parts === null) {
    throw new Error(
      'managed-settings: minimumVersion must be a semantic version x.y.z with no leading zeros, for example 2.1.277.',
    )
  }
  const floor = SEMVER.exec(MIN_CLAUDE_VERSION).slice(1).map(Number)
  const given = parts.slice(1).map(Number)
  const index = given.findIndex((value, at) => value !== floor[at])
  if (index !== -1 && given[index] < floor[index]) {
    throw new Error(
      `managed-settings: minimumVersion must be at least ${MIN_CLAUDE_VERSION}, the first Claude Code ` +
        'release where an invalid allowlist fails closed.',
    )
  }
  return minimumVersion
}

/**
 * The template for one identity. `identity` is `buildCatalogIdentity(pkg, resolved)` from
 * `./catalogs.mjs`; its repository is always on github.com, because the identity refuses any
 * other host, so the marketplace source is always the `github` kind.
 */
export function renderClaudeManagedSettings(identity, { ref, minimumVersion = MIN_CLAUDE_VERSION } = {}) {
  requireIdentity(identity)
  const pinned = requireRef(ref)
  const floor = requireMinimumVersion(minimumVersion)
  // A fresh object per use, so a caller that edits one copy cannot silently edit the other.
  const source = () => ({ source: 'github', repo: identity.slug, ref: pinned })
  return {
    extraKnownMarketplaces: { [identity.name]: { source: source() } },
    enabledPlugins: { [`${identity.name}@${identity.name}`]: true },
    strictKnownMarketplaces: [source()],
    requiredMinimumVersion: floor,
  }
}
