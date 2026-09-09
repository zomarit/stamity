---
id: apm-canonical-distribution
# A design document, authored outside the spec command and excluded from the site build.
status: shipped-with-1.4.0
obsolete_when: the getting-started page and the README carry the route and its client floor, and the mirror repository no longer exists
---
# APM served from the main repository

The decision note for the APM (Agent Package Manager) route: why the package this repository
already generates is now installed straight from `zomarit/stamity`, what the minimum client
is, what a consumer gets that differs from the retired mirror, how the route is proven, and
how the mirror repository is retired. Research date: 2026-09-09; every external fact below is
cited to the APM source at a tag, a GitHub object with its timestamp, or a run executed that
evening (the probe log is kept with the release run's journal in the private layer).

## Intent

One canonical source for every published surface. The corpus under `content/` is projected
into the APM package by `scripts/generate-apm-package.mjs` — `apm.yml` at the root and the
`.apm/` primitive tree — and that projection is byte-checked in CI (`test/ci/apmPackage.test.ts`).
A second repository that copied the projection on a timer added a second place to be wrong,
a second thing to keep alive, and an install command that named a repository nobody
contributes to. The route now names the repository people do.

## Context

### What broke, and what fixed it

APM classifies a package by a first-match cascade. Through 0.29.0 the cascade ranked a root
`plugin.json` carrying the Agent Plugins schema, and any `plugin.json` or `.claude-plugin/`
directory, ahead of `apm.yml` + `.apm/`
(`src/apm_cli/models/format_detection.py:433-460@v0.29.0`). This repository carries both
plugin surfaces at the root on purpose — they are two of its published channels — so the
tree was typed `AGENT_PLUGIN`: the imperative `apm install <path>` was refused outright, and
the declarative form "registered" the plugin for the `copilot` target and deployed zero
`.apm/` primitives while exiting 0. That is the failure recorded in microsoft/apm#2735
(opened 2026-08-31 from this repository's observations).

PR #2776, merged 2026-09-03T23:12:58Z (merge commit `7baf8829…`), moved an *eligible*
`apm.yml` to the head of the cascade: eligible means `.apm/` exists beside it OR the manifest
declares at least one APM or MCP dependency (`format_detection.py:451-460@v0.30.0`). A
metadata-only manifest still lets the plugin signals win, which is how a repository that
wants the plugin layout keeps it. The fix shipped in 0.29.1 (release published
2026-09-06T07:47:16Z; PyPI wheel 2026-09-06T07:47:59Z) and is in 0.30.0 (2026-09-07); the
detection code is byte-identical across v0.29.1, v0.30.0 and `main` as of 2026-09-09, and no
regression has been filed (#2831 is a duplicate whose reporter confirmed the released 0.29.1).

### What the probes showed (2026-09-09, apm-cli 0.29.0 / 0.29.1 / 0.30.0 in isolated venvs)

| client | route | result |
|---|---|---|
| 0.29.0 | `apm install zomarit/stamity --target claude` | exit 0, **zero** primitives, "install natively only for the 'copilot' target" |
| 0.29.0 | declarative, `--target copilot` | exit 0, "Registered 1 Agent Plugin", one file under `.github/copilot/`, zero `.apm/` primitives |
| 0.29.1 / 0.30.0 | `apm install zomarit/stamity --target claude` | 10 agents, 9 commands, 12 rules, 8 skills → `.claude/` |
| 0.30.0 | `apm install zomarit/stamity#v1.3.0 --target claude` | the same 49 files; `.claude/` byte-identical to an install from the mirror |
| 0.30.0 | `#v1.3.0`, copilot / cursor / codex | 49 / 49 / 28 files (codex: agents and skills; APM's codex profile carries no commands and compiles instructions on `apm compile`) |
| 0.30.0 | imperative local path | still refused as an Agent Plugin (the local-bundle route inspects `plugin.json` first, by design) |
| 0.30.0 | declarative local path in a consumer `apm.yml` | 49 files — the deterministic fixture route CI uses |

So the canonical replacement was live at `zomarit/stamity` (main and every `v*` tag) for any
client at or above 0.29.1 before this change; the change proves and documents it.

### The intentional difference from the mirror

A remote install is a `git clone` (shallow for a tag or branch, full for a sha) with `.git`
removed; APM reads no `.gitattributes` and has no ignore file
(`src/apm_cli/deps/github_downloader.py:1966-2008@v0.30.0`). Everything committed at the ref
is therefore vendored under the consumer's `apm_modules/zomarit/stamity/`: 870 files and
19 MB for this repository (tests, evals, source, site), against 54 files and 476 KB from the
mirror, which carried only the projection. `apm_modules/` is gitignored by APM itself, and the
deployed primitives are identical. The cost is disk and clone time on the consumer's side; it
is accepted rather than worked around, because every workaround (a subdirectory package, a
second repository, stripping tracked files) reintroduces the second copy this decision removes.
If APM gains a package-side include list, the projection can adopt it in the generator.

### The client floor, and why it cannot be enforced package-side

The minimum tested client is **0.29.1**; the current stable, also tested, is **0.30.0**. No
key in `apm.yml` can declare a minimum client: the manifest schema at v0.30.0 has none, and
`apm_version` exists only in the lockfile as the version that wrote it. The route therefore
documents the floor and the exact symptom of an older client — the line
*"Agent Plugins v1.0.0 packages install natively only for the 'copilot' target"* with zero
primitives deployed — and the remedy (`pip install --upgrade apm-cli`, `brew upgrade apm`, or
`apm self-update` where the client offers it). A future client that exits non-zero on a
zero-target Agent Plugin install (microsoft/apm#2806, merged 2026-09-09, unreleased) turns the
symptom into a failure on its own.

## Invariants

1. `apm.yml` and `.apm/` remain generated, byte-checked, and the only APM surface; no second
   copy is maintained anywhere.
2. The plugin surfaces (`plugin.json`, `.claude-plugin/`, `.cursor-plugin/`) stay exactly as
   they are; the route works with them present because the cascade now prefers an eligible
   manifest — nothing is stripped to make APM work.
3. The route is proven by deployment content in CI, not by an exit code: the smoke fails when
   a supported class deploys zero files, when an expected id is missing, when a deployed body
   lacks its source's heading, or when the lockfile types the package as anything but
   `apm_package`.
4. The regression witness runs on every push: the same smoke against 0.29.0 with
   `--expect-failure` proves the check detects the original failure.

## Requirements

- REQ-APM-001 — `scripts/apm-install-smoke.mjs` builds a consumer, installs the package through
  the declarative route (a clean export of the checkout by default, or `owner/repo[#ref]`),
  and verifies deployment per target for claude, copilot, cursor and codex.
- REQ-APM-002 — `ci.yml` runs the smoke at 0.29.1 (minimum), 0.30.0 (current) and 0.29.0
  (`--expect-failure`), required through `all-ci-checks`.
- REQ-APM-003 — `release.yml`'s gates run the smoke against the canonical remote at the
  release sha before the tarball is packed.
- REQ-APM-004 — The README and the getting-started page carry the install command, the pinned
  form, the client floor, the symptom of an older client, and the vendored-tree note; the
  generator's header records the history instead of the limit.
- REQ-APM-005 — The mirror is retired after the route is verified live: backed up (every ref
  as a bundle, the tree, the platform metadata, verified by restore) into the owner's private
  layer, then deleted; its README's install command is replaced, not redirected, because no
  consumer depends on it (the owner's statement, 2026-09-09).

## Acceptance criteria

- GIVEN apm-cli 0.29.1 or 0.30.0 WHEN the smoke runs against the checkout THEN every supported
  class deploys for every target and the lockfile says `apm_package`.
- GIVEN apm-cli 0.29.0 WHEN the smoke runs with `--expect-failure` THEN it exits 0 having
  detected zero deployed primitives.
- GIVEN a consumer with a lockfile saying `agent_plugin` and no primitives WHEN the exported
  verifier runs THEN it fails naming the classes at zero.
- GIVEN the tag route `zomarit/stamity#v1.4.0` after publication WHEN the release gates run
  THEN the smoke passes against the remote at the release sha.

## Non-goals

- An APM registry or a publish step: git remotes are APM's default resolver and the
  documented distribution for this package.
- Declaring `targets:` in `apm.yml`: APM's target catalog is its one moving surface, and an
  omitted field cannot be invalidated by a value-space change.

## References

- microsoft/apm issue #2735; PR #2776; releases v0.29.1 and v0.30.0; PyPI `apm-cli` JSON
  (all read 2026-09-09). Source citations at tags as given above.
- The probe log: `apm-probes-2026-09-09.md`, kept with the release run's journal.
