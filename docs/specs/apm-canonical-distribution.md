---
id: apm-canonical-distribution
# A design document, authored outside the spec command, amended in run 2026-10-08_maintainer-tooling on 2026-10-08, amended in run 2026-10-13_records-branch on 2026-10-14, retired to this stub in run 2026-10-14_cli-native on 2026-10-14, and excluded from the site build.
# The records moved to the `records` branch on 2026-10-14; every path below that names this repository's own records — under `.stamity/runs/`, `.stamity/evidence/`, `.stamity/handoffs/`, `.stamity/inbox.md`, `docs/plans/`, `evals/runs/`, `evals/measurements/` or `evals/reach/` — reads on that branch (REQ-PROVE-023 in docs/specs/prove-behavior-and-value.md).
status: shipped-with-1.4.0
obsolete_when: no committed plan names this spec any more and the records gate admits a retired spec, so the stub can be deleted
---
# APM served from the main repository

**Retired in 1.15.0.** 1.15.0 deletes the APM route: `apm.yml`, the `.apm/` tree, `scripts/generate-apm-package.mjs`,
`scripts/apm-install-smoke.mjs` and their suites leave `main` (`4a1cf96e`), and the CI `apm-install` matrix and the
release's `apm-route` job leave the workflows (`0801927b`). The npm CLI is the one install route. An unpinned
`apm install zomarit/stamity` stops resolving once the deletion reaches `main`; an install pinned to an earlier tag keeps
working at that version, since no tag is deleted. This file stays as a stub because committed plans name it and the
records gate refuses a plan that names a spec the tree does not carry (`test/records/specStatus.test.ts`, "names no
spec file the tree does not carry").

The decision is the spec delta of `docs/plans/020-cli-native-01.md` (plan 020 file 1, run `2026-10-14_cli-native`):
every requirement below is retired, keeping its id and its heading with its disposition; the downstream publisher
identity of REQ-APM-007 moved to REQ-PLUGIN-028 in `docs/specs/fork-layer.md`. The full text as it stood before the
retirement — the decision note, the 2026-09-09 probes, the client floor, the downstream contract and every criterion —
reads at `c96c7146`: `git show c96c7146:docs/specs/apm-canonical-distribution.md`.

## Intent

Record that the APM route is deleted, and where its one surviving half went.

## Requirements

### REQ-APM-001 — The install smoke

Retired 1.15.0 — the route is deleted. `scripts/apm-install-smoke.mjs` went in `4a1cf96e`.

### REQ-APM-002 — The CI matrix

Retired 1.15.0 — the route is deleted. The `apm-install` job went in `0801927b`; `all-ci-checks` needs no APM job
(REQ-PLUGIN-020, amended 2026-10-14, in `docs/specs/prove-behavior-and-value.md`).

### REQ-APM-003 — The release check against the canonical remote

Retired 1.15.0 — the route is deleted. The `apm-route` job went in `0801927b`, and `publish` needs `gates` alone.

### REQ-APM-004 — The README and getting-started route

Retired 1.15.0 — the route is deleted. The README and `docs/getting-started.md` no longer carry it (`a1a55379`), and
getting-started's section "If you installed through APM or a plugin" tells such a user which refs still resolve
(`docs/getting-started.md:95-103`).

### REQ-APM-005 — The mirror retired

Retired 1.15.0 — the route is deleted, and with it any reason to bring back the mirror this requirement retired.

### REQ-APM-006 — Resolved package content and skill identity

Retired 1.15.0 — the route is deleted. The CLI's own reading of the resolved layer stands as REQ-FORK-010 in
`docs/specs/fork-layer.md`.

### REQ-APM-007 — Explicit downstream publisher identity

Retired 1.15.0 — superseded by REQ-PLUGIN-028 in `docs/specs/fork-layer.md`, which holds its publisher half:
`stamity.publisher` checked against the owner in `repository.url`, the `zomarit` default, and a refusal before any
write. The generators it bound are deleted.

### REQ-APM-008 — Private destinations and authenticated consumers

Retired 1.15.0 — the route is deleted. A private fork's release is REQ-PLUGIN-027 in `docs/specs/fork-layer.md`, the
npm package only.

### REQ-APM-009 — Compatibility and evidence matrix

Retired 1.15.0 — the route is deleted. Its packaged-CLI row stands as REQ-FORK-011 in `docs/specs/fork-layer.md`.

## References

- `docs/plans/020-cli-native-01.md` — the deletion's plan and spec delta; `.stamity/runs/2026-10-14_cli-native/` — its
  run.
- `docs/specs/fork-layer.md` — REQ-PLUGIN-027, REQ-PLUGIN-028, REQ-FORK-010 and REQ-FORK-011, the CLI's halves of what
  this spec covered.
