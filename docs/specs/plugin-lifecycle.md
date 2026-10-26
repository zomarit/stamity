---
id: plugin-lifecycle
# A design document, authored from docs/plans/008-plugin-lifecycle-01.md to -03.md on 2026-09-17, amended from docs/plans/010-enterprise-release-01.md on 2026-09-26 and from docs/plans/013-optimization-sweep-02.md and -03.md on 2026-09-30, amended at the close of run 2026-10-03_pack-engine-defects on 2026-10-06, amended from docs/plans/016-fork-distribution-00.md at the Prove phase of run 2026-10-07_security-fixes on 2026-10-07, amended in run 2026-10-08_maintainer-tooling on 2026-10-08, amended in run 2026-10-08_product-core on 2026-10-09, amended in run 2026-10-11_release-1-14-0 on 2026-10-12, amended in run 2026-10-13_records-branch on 2026-10-14, retired to this stub in run 2026-10-14_cli-native on 2026-10-14, its held id range amended in run 2026-10-25_autonomy-distribution-02 on 2026-10-26, and excluded from the site build.
# The records moved to the `records` branch on 2026-10-14; every path below that names this repository's own records — under `.stamity/runs/`, `.stamity/evidence/`, `.stamity/handoffs/`, `.stamity/inbox.md`, `docs/plans/`, `evals/runs/`, `evals/measurements/` or `evals/reach/` — reads on that branch (REQ-PROVE-023 in docs/specs/prove-behavior-and-value.md). A path of the run layout a consuming repository writes, such as `.stamity/runs/<run-id>/`, is the product's and is not one of them.
status: shipped-with-1.14.0
obsolete_when: no committed plan names this spec any more and the records gate admits a retired spec, so the stub can be deleted
---
# Plugin lifecycle

**Retired in 1.15.0.** 1.15.0 deletes the plugin distribution route: the per-client plugin roots, their generator and
runtime, the catalogs, the release's plugin distribution, the `stamity plugin` verb and the `plugin-backed` install
mode. The npm CLI is the one install route. This file stays as a stub because committed plans name it and the records
gate refuses a plan that names a spec the tree does not carry (`test/records/specStatus.test.ts`, "names no spec file
the tree does not carry").

The decision is the spec delta of `docs/plans/020-cli-native-01.md` (plan 020 file 1, run `2026-10-14_cli-native`): every
requirement below with a CLI or fork job moved to the spec that now owns that job, keeping its id; every other
requirement is retired here, keeping its id and its heading with its disposition. The full text as it stood before the
retirement, every amendment and criterion included, reads at `c96c7146`:
`git show c96c7146:docs/specs/plugin-lifecycle.md`.

## Intent

Record where each requirement of the deleted plugin route went: moved, with its id, or retired, with the reason and
the commit that deleted what it governed.

## What 1.15.0 removed

Each removal landed on the integration branch of run `2026-10-14_cli-native`:

- the plugin and APM build scripts, `scripts/plugins/`, the generated trees and manifests (`.claude-plugin/`,
  `.cursor-plugin/`, `plugin.json`, `renovate/plugins.json`), `package.json`'s `stamity.distribution` block and the
  suites that tested them (`4a1cf96e`);
- the CI jobs `plugin-route` and `apm-install`, the nightly's client drive steps, the release's and the fork release's
  plugin distribution steps, and the QA rows `H4a`–`H4d` and `H5` (`0801927b`);
- the `stamity plugin` verb, `plugin status` and `plugin setup` (`714e8071`);
- the `plugin-backed` install mode and its types, the `plugin-runtime` doctor row, `check --expect-mode`, the
  `pluginOwned` (`sync --json`) and `pluginUninstall` (`clean --json`) keys and the exported install-mode names
  (`fe276d8f`);
- the plugins guide, `docs/plugins.md` (`a1a55379`), and the eval cases `plugin-mode-invocation`,
  `st-setup-fresh-repository` and `st-setup-refuses-generated-setup` (`6e2986b1`).

No ref is deleted: the `plugin-dist` branch and the `plugins/v*` tags stay as frozen history. A manifest a 1.14.0 setup
wrote keeps its `plugin` block, held unread through the 1.15 line, and `check`'s `plugin-duplicates` row names a
leftover install (REQ-PLUGIN-014 and REQ-PLUGIN-016 in `docs/specs/everyday-flows.md`).

## Moved requirements

Each is defined once, in the spec named; the text there is this spec's as it stood at `c96c7146`, its route clauses
dropped in place, with a paragraph headed "Amended 2026-10-14".

- `REQ-PLUGIN-005` — moved to `docs/specs/everyday-flows.md`: the emitted runner's start of `node`. Its plugin-root half
  retired.
- `REQ-PLUGIN-014` — moved to `docs/specs/everyday-flows.md`: the manifest's `gates` object, and the `plugin` key held
  through the 1.15 line. Its `plugin-backed` grammar retired. (Not in the plan's list; moved by the plan's rule that a
  requirement with a CLI job moves.)
- `REQ-PLUGIN-016` — moved to `docs/specs/everyday-flows.md`: the ledger bound, settings co-ownership, the node row and
  the doctor rows of 1.15.0. Its plugin-ownership boundary retired.
- `REQ-PLUGIN-017` — moved to `docs/specs/everyday-flows.md`: explicit gates beat detection. Its `plugin status` half
  retired.
- `REQ-PLUGIN-020` — moved to `docs/specs/prove-behavior-and-value.md`: the CI lanes, the proven push, the nightly
  guard and the records job. The per-client install, discovery and invocation proof retired.
- `REQ-PLUGIN-025` — moved to `docs/specs/prove-behavior-and-value.md`: the release eval artifact on the records
  branch. Its plugin-mode eval coverage retired.
- `REQ-PLUGIN-027` — moved to `docs/specs/fork-layer.md`: a fork releases through its own workflow, the npm package
  only.
- `REQ-PLUGIN-028` — moved to `docs/specs/fork-layer.md`: one command sets a fork's identity, joined by REQ-APM-007's
  publisher half.
- `REQ-PLUGIN-045` — moved to `docs/specs/everyday-flows.md`: the ownership bound.
- `REQ-PLUGIN-046` — moved to `docs/specs/everyday-flows.md`: the import decision, the byte and rendering proofs, the
  look before git.
- `REQ-PLUGIN-047` — moved to `docs/specs/everyday-flows.md`: `check`'s expectations; `--expect-mode` removed.
- `REQ-PLUGIN-048` — moved to `docs/specs/fork-layer.md`: a registry fork's pinned calls name its registry.

`REQ-PLUGIN-018` was never allocated, and `REQ-PLUGIN-031` to `REQ-PLUGIN-044` were held for plan 016's later files,
which its own re-plan places.

Amended 2026-10-26 (run `2026-10-25_autonomy-distribution-02`, passes `spec1` and `spec2`). Plan 022
(`docs/plans/022-autonomy-distribution-01.md` and `-02.md`) replaced plan 016's files 1 and 2 and placed two ids of that
range in `docs/specs/fork-layer.md`: `REQ-PLUGIN-031` (a fork release's explicit npm dist-tag, added 2026-10-25) and
`REQ-PLUGIN-033` (a fork's gate proved on every pull request, added 2026-10-26). `REQ-PLUGIN-032` and `REQ-PLUGIN-034`
to `REQ-PLUGIN-044` stay unallocated; plan 022 places no other id of the range. The two ids it allocated beyond the
range, `REQ-PLUGIN-050` and `REQ-PLUGIN-054`, are defined in the same file.

## Requirements

Each retired requirement keeps its id and heading. "Deleted in" names the commit that removed what it governed.

### REQ-PLUGIN-001 Plugin roots from the resolved corpus

Retired 1.15.0 — the route is deleted. Its generator, `scripts/generate-plugin-packages.mjs`, and the per-client
modules under `scripts/plugins/` were deleted in `4a1cf96e`.

### REQ-PLUGIN-002 Capability declaration per root

Retired 1.15.0 — the route is deleted. The capability file it declared was written per plugin root, and both its
writer and its engine reader were deleted (`4a1cf96e`, `714e8071`).

### REQ-PLUGIN-003 Companion files and the generated setup command travel

Retired 1.15.0 — the route is deleted. The generated `st-setup` command ran `plugin status` and `plugin setup`, a verb
deleted in `714e8071`; its renderer went in `4a1cf96e`.

### REQ-PLUGIN-004 Charter-reference substitution of tokens in plugin bodies

Retired 1.15.0 — the route is deleted. The plugin bodies' substitution module went in `4a1cf96e`; the engine's own
substitution of `${STAMITY:CLI}` and the call form stay REQ-FLOW-002's in `docs/specs/everyday-flows.md`.

### REQ-PLUGIN-006 Bundled runtime runs standalone and passes the leak gate

Retired 1.15.0 — the route is deleted. The bundled runtime's builder went in `4a1cf96e`.

One note under this requirement has no other home and stays here as its record. Since 1.9.0 the Sigstore client is an
OPTIONAL dependency (`optionalDependencies` in `package.json`), so an ordinary CLI install still gets it, and an install
that cannot load it returns a REFUSAL verdict for a declared signing claim, never a pass and never the pin-waivable
`unarmed` (`src/pack/sigstoreVerifier.ts`): every signed pack fails to install there, and an unsigned pack is unaffected.
The two trust pages state that pair, and a docs pin reads the claim off `package.json`. The note moves to a
packs-and-trust requirement family on the day one is written; its full text reads at `c96c7146`.

### REQ-PLUGIN-007 Locator resolution order and refusals

Retired 1.15.0 — the route is deleted. The locator was copied into each plugin root; its source went in `4a1cf96e`.

### REQ-PLUGIN-008 Prerequisites declared and probed

Retired 1.15.0 — the route is deleted. Its probe and its `plugin-runtime` doctor row went in `fe276d8f`. The engine's
own `node-version` row stays: REQ-PLUGIN-016, amended 2026-10-14, in `docs/specs/everyday-flows.md`.

### REQ-PLUGIN-009 Distribution configuration without credentials

Retired 1.15.0 — the route is deleted; superseded by REQ-PLUGIN-028 in `docs/specs/fork-layer.md`. The distribution
half of `scripts/distribution-identity.mjs` went in `4a1cf96e`, and a leftover `stamity.distribution` block is ignored
with a one-line notice for one release.

### REQ-PLUGIN-010 Catalog files per client with configurable sources

Retired 1.15.0 — the route is deleted. The catalogs and their renderer went in `4a1cf96e`.

### REQ-PLUGIN-011 Machine-readable release manifest and Renovate presets

Retired 1.15.0 — the route is deleted. `release.json`, its schema and `renovate/plugins.json` went in `4a1cf96e`. The
Renovate preset that stays, `renovate/companion.json`, is REQ-PLUGIN-028's to move.

### REQ-PLUGIN-012 Release workflow publishes the distribution

Retired 1.15.0 — the route is deleted. `release.yml` no longer builds, attests, pushes or attaches a plugin
distribution, and its `publish` job needs `gates` alone (`0801927b`; REQ-PLUGIN-020, amended 2026-10-14, in
`docs/specs/prove-behavior-and-value.md`).

### REQ-PLUGIN-013 Pinning, refresh, rollback and repository-state compatibility

Retired 1.15.0 — the route is deleted. A consumer pinned to a `plugins/v<version>` tag keeps that version: the tags
stay, and no release adds one.

### REQ-PLUGIN-015 Plugin setup writes repository-owned files only, idempotently

Retired 1.15.0 — the route is deleted. `stamity plugin setup` was removed in `714e8071`. The per-entry ownership of
`.claude/settings.json` its amendments described stands as REQ-FLOW-036 in `docs/specs/everyday-flows.md`.

### REQ-PLUGIN-019 Coexistence is detected and nothing is rewritten silently

Retired 1.15.0 — the route is deleted; superseded by REQ-PLUGIN-016, amended 2026-10-14, in
`docs/specs/everyday-flows.md`: with no plugin-backed mode there is no duplicate class to detect, and the
`plugin-duplicates` row now warns, and never fails, on a leftover plugin install (`fe276d8f`).

### REQ-PLUGIN-021 Upgrade and rollback proof

Retired 1.15.0 — the route is deleted. Its fixture went in `4a1cf96e`, and the QA row `H5` in `0801927b`.

### REQ-PLUGIN-022 Downstream-customized packages proof

Retired 1.15.0 — the route is deleted. Its suite went in `4a1cf96e`. A fork's CLI is still proved from a tarball
install: REQ-FORK-011 in `docs/specs/fork-layer.md`.

### REQ-PLUGIN-023 Controlled private chain proof

Retired 1.15.0 — the route is deleted. The rehearsal's record stays on the `records` branch as history.

### REQ-PLUGIN-024 Documentation and pinned surfaces

Retired 1.15.0 — the route is deleted. `docs/plugins.md` went in `a1a55379`, and the capability matrix's "Plugin
containers" section with its builder in `4a1cf96e`.

### REQ-PLUGIN-026 Existing routes unchanged

Retired 1.15.0 — the routes it kept unchanged are deleted.

### REQ-PLUGIN-029 A Claude Code managed-settings template for an organization's rollout

Retired 1.15.0 — the managed-settings template served the plugin rollout only; its renderer and suite went in
`4a1cf96e`.

### REQ-PLUGIN-030 An enterprise quickstart page

Retired 1.15.0 — superseded by the fork-only quickstart page: `docs/enterprise-quickstart.md` now orders the fork
route by day and links into `docs/enterprise-forks.md` and `docs/getting-started.md` (`a1a55379`).

## References

- `docs/plans/020-cli-native-01.md` — the deletion's plan, its spec delta and its units; `.stamity/runs/2026-10-14_cli-native/`
  — its run.
- `docs/plans/008-plugin-lifecycle-01.md`, `-02.md`, `-03.md`, `docs/plans/010-enterprise-release-01.md` and
  `docs/plans/016-fork-distribution-00.md` — the plans this spec was written from.
- `docs/specs/everyday-flows.md`, `docs/specs/prove-behavior-and-value.md` and `docs/specs/fork-layer.md` — where the
  moved requirements are defined.
