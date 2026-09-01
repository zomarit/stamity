# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!--
  AUTHORING NOTE — commit types map to Keep-a-Changelog groups deliberately, not 1:1.
  The conventional-commit types this repository uses (CONTRIBUTING.md: feat, fix, refactor,
  test, docs, chore, ci, perf, build, style) do not line up one-for-one with the six groups
  below. Categorize each entry by the effect on a consumer of the package, using this mapping:

    feat  → Added      when it introduces a capability
            Changed    when it reshapes an existing one
    fix   → Fixed
    perf  → Changed
    refactor / build / style / test / chore / ci
          → usually omitted (no consumer-visible effect); include under Changed only when the
            change alters shipped behaviour, install output, or a documented surface
    docs  → Changed    when it moves a user-facing document or claim; omitted otherwise
    a removal          → Removed
    a deprecation      → Deprecated
    a security fix     → Security

  Sections use `## [x.y.z] - YYYY-MM-DD` headings. The release workflow
  (.github/workflows/release.yml, "Compose release notes") extracts the section whose heading
  matches the version being released; a version with no matching section fails the release
  before anything is published.
-->

## [Unreleased]

Work landed on `main` since the `v1.0.1` tag, not yet cut into a released version.

### Added

- Skill-override emission: a pack skill can override a shipped skill of the same id, and the
  pack's support files are screened before they are emitted.
- Overlay layers: layered configuration overlays that compose over the base emission.
- Workspace surface: the workspace engine and its CLI entry point.
- A managed worktree lane for driving work in a dedicated worktree.
- Raw-mode interactive menus for `init`, and a configuration picker.

### Changed

- Documentation: added the lifecycle guide, the tier riders, and the reference introduction;
  published the overlay, workspace-surface, and worktree lane designs; and re-attested the
  customization, workspace, and lifecycle pages against the landed engine work.
- The docs-site deploy is armed only by a succeeded real release, rather than by any push.
- Security: `SECURITY.md` ("Publishing this package") now records the three platform release
  controls (required reviewer, `v*` tag ruleset, npm trusted publisher) as in force, rather
  than as not yet armed.

## [1.0.1] - 2026-08-31

### Added

- A generated APM package projection: the `apm.yml` manifest and the `.apm/` primitive tree,
  regenerated and verified alongside the other published surfaces.

### Changed

- Unified the pack surface onto the `st-` prefix, slimmed the tracked assets, and quieted the
  migration path.
- Brand: the social preview is the dark card, and the social cards carry the wordmark alone.

### Fixed

- Release: the GitHub-release step now names the repository explicitly, closing the gap where
  the artifact-only publish job had no git directory to infer the repository from.
- Site: `llms.txt` is served at the site root, and the homepage points at stamity.dev.

## [1.0.0] - 2026-08-31

### Added

- Initial public release. The engine; the SDLC touchpoint command surface; four-client
  emission (Claude, Cursor, Copilot, and Codex); the first-party packs; and the documentation
  site.

[Unreleased]: https://github.com/zomarit/stamity/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/zomarit/stamity/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/zomarit/stamity/releases/tag/v1.0.0
