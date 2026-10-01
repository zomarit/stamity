---
id: release
type: skill
description: "Executes the release procedure for a single version — version bump, changelog section, gate run, SBOM and provenance emission, and the typed confirmation each irreversible publish step takes. Triggers when a version is cut, when supply-chain artifacts precede a publish, or when the irreversible steps want their gates stated."
tags: [devops]
load: on-demand
obsolete_when: package tooling emits attested release artifacts and gates every irreversible publish step behind a typed confirmation by default
---

# Release

The runnable half of a release: the commands, the artifacts, and the gates.
`/st-release` is the orchestrating half — it spawns the roles, runs the
review, and stops in front of the same boundary — and the two are one procedure
split by what each holds. Where both would state a table, it lives on one side
only: the version decision is stated there, the artifact command shapes here.

One version per run, assembled locally, published only on an explicit typed
confirmation.

## Quick Start

1. Preflight: clean tree, release branch, change set since the last tag.
2. Decide the version from the change set (Step 2).
3. Write the bump and the changelog section (Step 3).
4. Run the gates and the build (Step 4).
5. Emit the supply-chain artifacts (Step 5).
6. Stop. Print the irreversible commands and wait for a typed confirmation
   (Step 6).

A run without a typed confirmation ends after Step 5 with a staged release and
no published bytes. That is a complete run, not a failed one.

## Step 1 — Preflight

- `git status --porcelain` returns empty. A dirty tree is stashed or committed
  by the operator, not worked around.
- The current branch is a `release/*` branch. Releases are not cut on the
  default branch.
- `git describe --tags --abbrev=0` gives the last tag; the log since it is the
  change set every later step reads.
- Nothing changed since the last tag means there is no release to cut.

## Step 2 — Version decision

The increment table and the pre-release suffixes live in `/st-release`,
beside the gate that asks before a MAJOR bump; they are not repeated here. Two
rules this side adds: competing readings take the larger increment and record
why in the changelog, and a published pre-release is smoke-tested before the
stable version is published over it.

## Step 3 — Bump and changelog

- Update the version in the project manifest — `package.json` or the stack's
  equivalent — and refresh the lockfile it owns (`package-lock.json`,
  `pnpm-lock.yaml`, or `yarn.lock`) through the package manager rather than by
  hand. Both files are staged together; a bumped manifest beside a stale
  lockfile installs the previous version.
- Add one dated section per version to `CHANGELOG.md`, entries grouped by kind:
  added, changed, deprecated, removed, fixed, security. Each entry names the
  change and its merge reference.
- A breaking release carries migration notes in the section — what breaks, and
  the smallest edit a consumer makes.
- Stage the changelog with the manifest. The two disagree only if someone
  edited one of them alone, which is what Step 6 re-checks.

## Step 4 — Gates

Run the charter's full verification gate — the chained lint, typecheck, and
test pass it names for this project — and the project's build. Every gate
passes before anything is signed or staged; a failing gate is fixed and the
whole chain re-runs. Narrowing the re-run to the previously failing selector
proves only that the selector passes now.

Record the exact command and the verbatim failing excerpt for any red row —
the release summary carries them, and a bare "gates failed" makes the next
person re-run everything to find out what.

## Step 5 — Supply-chain artifacts

Emit these before the publish gate, not after. A consumer verifies what shipped
only if the evidence shipped with it.

| Artifact | Command shape | Notes |
|---|---|---|
| SBOM | `npm sbom --sbom-format=cyclonedx --sbom-type=application > dist/sbom.cdx.json` | attach to the release; SPDX is an equally acceptable format |
| Package provenance | `npm publish --provenance` from the build job | requires a workload identity, not a long-lived registry credential |
| Build attestation | the build system's attestation generator, pinned by full commit SHA | pin the generator by SHA; a moving tag is an unpinned dependency |
| Image signature | `cosign sign --yes <registry>/<image>@<digest>` | sign the digest; a signature on a moving tag proves nothing |

Two rules bind the table:

- **Identity, not stored credentials.** Publishing runs from the build system
  under a short-lived workload identity. Configure the registry's trusted
  publisher once; grant the job `id-token` write permission so it can request
  that identity. A long-lived publish credential in project settings is the
  thing this arrangement removes.
- **Digest, not tag.** Attestations and signatures bind to the content digest.
  Consumers verify against the digest too.

Maturity dial: a solo project may defer the SBOM and the build attestation and
still publish provenance and sign images. A team project and above emits every
row, because consumer-side verification is what the rows are for.

Publish the verification commands with the release notes: the package
manager's signature check, the attestation verifier against the source
repository and tag, and the image signature check against the signing
identity. Verification instructions nobody can run are decoration.

## Step 6 — The irreversible steps

Each of these is default-off and opens only on the typed literal named beside
it. No answer, an empty answer, or a mismatched token leaves the step un-run.

| Action | Reversible? | Opens on |
|---|---|---|
| `git tag -a vX.Y.Z -m "vX.Y.Z"` | yes — `git tag -d vX.Y.Z` undoes it | the operator types `vX.Y.Z`; the assembled release carries no tag until then |
| `git push origin vX.Y.Z` | no — the tag is public immediately | the operator types `vX.Y.Z` |
| release creation on the hosting platform | no | the same typed version |
| registry publish | no — a version number cannot be reused | the same typed version; the publish itself runs in the build job on the pushed tag |
| production promotion | no | the operator types `DEPLOY`, after staging smoke tests pass |

Print each command verbatim before asking. The operator running the command
personally is always an acceptable answer, and the default answer is hold.

## Step 7 — After the publish

- Deploy to staging and run smoke tests before any production promotion.
- Watch the error rate, the affected flows, and startup or cold-start timings
  against the pre-release baseline for the first day.
- A regression is answered by rollback first and diagnosis second; hand a live
  production impact to the incident lane rather than debugging it inside the
  release.

## Rollback

Decided in `/st-release`, which owns the deprecate-over-unpublish rule and
the handoff to the incident lane. The one thing this side enforces: an automatic
unpublish is never run by this procedure, whatever the summary says.
