// The one shape a plugin version may take, stated once.
//
// `major.minor.patch` with an optional prerelease and NO build metadata. Three places judge a
// version — the distribution builder's `--version`, the package generator's `--version`, and the
// capability validator that reads the value back out of every root — and each carried its own
// copy of this pattern. The builder's copy drifted to admit `+build` (M-4), so `--version 1.9.0+1`
// passed the parent, was forwarded to the generator and refused THERE, with the child's usage text
// and exit 1 in place of the parent's own exit-2 refusal. One export, three readers.
//
// Build metadata is refused rather than stripped because nothing downstream can carry it: neither
// the `plugins/v<version>` tag pattern nor the `^x.y.z` companion range has a place to put it, and
// `scripts/plugins/locate.mjs` parses the capability file's version as semver without it.

/** A version this distribution can be built at: `major.minor.patch`, an optional prerelease, nothing after. */
export const PLUGIN_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
