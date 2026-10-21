---
license: MIT
compatibility: Requires a supported coding client, repository access, git, and the project verification tools.
id: release
type: skill
description: "Cuts a versioned release or a deploy from main: writes the change record, runs the gates, and stops before each irreversible step until its typed token. Starts only by name. Triggers when someone invokes st-release to ship a version or a deploy."
tags: [release]
load: on-demand
disable-model-invocation: true
obsolete_when: release tooling natively writes a change record with a distinct approver and holds every one-way publish or deploy behind a typed confirmation
---

# Release

Assemble a release, write its change record, and hand every one-way door to a person. Everything
this skill does before the stop can be undone; every step past it opens only on a token the
person types. It starts only when invoked by name and is never selected on its own.

## Fail-closed boundary

Stated here in full, because every later step depends on it:

- **What it never does on its own.** It pushes no tag, creates no release on the hosting
  platform, publishes nothing to a registry, merges nothing into the default branch and deploys
  nothing. It assembles the release, prints the exact command for each irreversible step, and
  stops.
- **Typed tokens, not assent.** A tag push, a release creation and a publish open only on the
  typed `v<version>`; a deploy opens only on the typed `DEPLOY`. A free-text "yes, publish", an
  approval in other words, or a token for another version opens nothing.
- **Silence holds.** No answer, an empty answer or a mismatched token leaves the release
  assembled and unpublished. Hold is the default at every stop, and a run with nobody watching
  opens none of them: it writes the record and ends held.
- **Opening a stop runs the printed command and nothing else.** An infrastructure apply, a
  cluster rollout by hand, a resource deletion or a write to a protected branch is never run by
  this skill, even after `DEPLOY`: it is printed for the person with what it changes and how to
  undo it.

## Two modes

| Mode | When | What differs |
|---|---|---|
| Versioned release | a version number ships: a package, a tagged build | branch and tag preflight, version decision, bump and changelog |
| Deploy from main | the default branch's head goes to an environment | no release-branch or tag preflight, no version; the record is keyed by the sha |

The frame line names the mode: `mode: release | deploy · service: <name> · target: v<version> |
<sha> · requester: <name> · record: .stamity/production/releases/<version | sha>.md`. The
requester is the person who invoked the skill. A mode the request does not settle is asked once,
release as the default.

## Step 1 — Preflight, read-only

Halt with an actionable message rather than working around a row:

| Probe | Requirement | On failure |
|---|---|---|
| `git status --porcelain` | empty, skipping the pack's own record paths (`.stamity/production/**`) | halt naming the dirty paths; the person commits them |
| current branch (release mode) | a `release/*` branch, never the default branch | halt and print `git switch -c release/<version>` |
| current branch (deploy mode) | the default branch, at the head the remote holds | halt naming the difference |
| change set | the log since the last tag (`git describe --tags --abbrev=0`), or since the last deploy's record in deploy mode | halt when nothing changed: there is nothing to ship |

With no earlier deploy record or tag, a first deploy or release, the change set's base is the
repository's root commit (`git rev-list --max-parents=0 HEAD`), and the run says so. Keep the
change set. The version decision, the changelog and the record's reason all read it,
and deriving it three times invites three answers.

## Step 2 — The readiness read

Read `.stamity/production/<service>-<sha>.json`, the report `/st-production-review` writes,
and its `ready.value`, named as the review names it: `<service>` in lower case, `[a-z0-9-]`
only, and `<sha>` the short sha its frame shows. The report read is the service's newest whose
sha is HEAD or an ancestor of HEAD, the review's own range rule, so committing the review does
not lose it. The readiness review is read as a warning and never stops the release.

- **Absent**, no review at HEAD or an ancestor: one line, `readiness: no review for <service>
  at or before <short sha>; the record names it`.
- **At an ancestor**: the value's line names the review's sha and whether the commits since it
  touch anything outside `.stamity/`; when they do, it reads stale.
- **`NO`** or **`not signed`**: one line naming the value and the open blocking checks it lists.
- **`YES`**: one line naming the approval of record it cites.

The line is copied into the record's security impact. Making a `NO` stop the release is a later
change, never a choice this run makes; the warning is the whole of its effect here.

## Step 3 — Version decision (release mode)

| Increment | Trigger |
|---|---|
| MAJOR | an incompatible change to a public surface: API shape, persisted or wire field, CLI flag, removed capability |
| MINOR | backward-compatible capability: a new surface, a new option, a deprecation that still works |
| PATCH | backward-compatible fix, documentation, or a dependency bump that changes no public surface |

A MAJOR bump is a scope decision: ask before taking it even when the person named the version,
and carry the answer into the changelog's breaking-change section. Competing readings take the
larger increment and the changelog says why. A pre-release takes the same table with a
`-alpha.N`, `-beta.N` or `-rc.N` suffix and publishes under a non-default distribution tag, so
an unsuspecting install cannot land on it.

## Step 4 — Bump and changelog (release mode)

This skill writes both, because they must agree:

- The version in `package.json`, with the lockfile it owns (`package-lock.json`,
  `pnpm-lock.yaml` or `yarn.lock`) refreshed through the package manager, never by hand. The
  lockfile is staged with the manifest: a bumped manifest beside a stale lockfile installs the
  previous version. These are the only manifests the pack's install scope declares: a version
  kept in another stack's manifest is printed as the edit for the person to make, never written.
- One dated section in `CHANGELOG.md`, entries grouped as added, changed, deprecated, removed,
  fixed and security, each naming the change and its merge reference. Every change in the set
  appears or is listed as deliberately unlisted. A MAJOR release carries migration notes: what
  breaks, and the smallest edit a consumer makes.

Read back before Step 5: the changelog heading's version equals the manifest's.

## Step 5 — Gates and build

Run the charter's full gate and the project's build, each once, and keep one row per command:
the exact command, its exit code, and the verbatim failing excerpt when it is not `0`. A summary
sentence is not a gate row. A red row stops the cut: the run ends held with the failing excerpt,
and the fix leaves through `/st-debug` or `/st-work`, never inside this run. A re-run narrowed
to the failing selector proves only that the selector passes.

## Step 6 — Supply-chain references

One SBOM and one provenance reference, or a named absence for each. An absence is a line, never
a silence, and the record is written either way.

- **SBOM.** Generate it into `.stamity/production/releases/<version | sha>.sbom.json`, beside
  the record, for example with `npm sbom --sbom-format=cyclonedx --sbom-type=application`, or the
  stack's own generator; the record names its path and digest.
  With no generator available: `SBOM: absent — <why>`.
- **Provenance.** Produced by the build job that publishes, for example `npm publish
  --provenance`, or by the build system's attestation generator pinned by full commit sha; the
  record names where the attestation will live and the command a consumer verifies it with.
  With none configured: `provenance: absent — <why>`.

Two rules bind both. **Identity, not stored credentials:** publishing runs under a short-lived
workload identity issued to the build job, never a long-lived registry credential kept in
project settings. **Digest, not tag:** every signature, attestation and image reference binds to
the content digest, and an image is pinned by digest, never by a moving tag.

## Step 7 — The change record

Write `.stamity/production/releases/<version | sha>.md`, one row per field, before any stop:

| Field | What it holds |
|---|---|
| Reason | why this ships now, from the change set |
| Security impact | the changes that touch a security surface, and the readiness line from Step 2 |
| Test evidence | the gate rows from Step 5: command and exit code each |
| Requester | the person who invoked the skill |
| Approver | a named person who is not the requester, written as `<name>, named by the requester, not confirmed by this skill` |
| Rollback path | the way back for this release, migrations included, written before any deploy |
| Emergency route | the policy file's `Escalation contact`, or the person's answer |
| SBOM | its path and digest, or `absent — <why>` |
| Provenance | its reference and verification command, or `absent — <why>` |

The approver, the rollback path and the emergency route are asked in one batched question when
the record cannot fill them, read first from `.stamity/production/policy.md`; each default is
`not named`. An approver equal to the requester is recorded as such and counts as no approver.
The record ends in a ticket-ready block: title, target, approver as recorded, rollback path, in
a form a change ticket takes as it is.

The record names variables, files and locations, never a secret value. An answer carrying a
credential, such as a connection string with its password or a webhook address with its key, is
refused, not recorded, citing the secrets floor (`stamity-secrets.md`, items 1 and 4): the
refusal names the field and never the value, says the pasted value now counts as exposed, whose
rotation is that floor's item 6, and asks again for the variable or location that holds it.

In release mode the record, the bump and the changelog are committed together on the release
branch with the project's commit conventions; nothing is pushed. In deploy mode the record stays
in the tree, uncommitted, and the run says so.

## Step 8 — The stop

Show the record's approver line, `named by the requester, not confirmed by this skill`, then
print each remaining command verbatim, labelled by reversibility, then ask once. The typed
token is the person's confirmation that the named approver approved.

| Command | Reversible? | Opens on |
|---|---|---|
| `git tag -a v<version> -m "v<version>"` | yes: `git tag -d v<version>` | the typed `v<version>`, with the push |
| `git push origin v<version>` | no: the tag is public at once | the typed `v<version>` |
| the hosting platform's release creation, such as `gh release create v<version> --verify-tag`, which never creates a tag | no | the typed `v<version>` |
| the registry publish, run by the build job on the pushed tag | no: a version number cannot be reused | the typed `v<version>` |
| the project's deploy command | no | the typed `DEPLOY` |

After the token, the opened commands run in table order, each once, and the run stops at the
first non-zero exit: no later command runs, and the run ends held, naming each command that ran
with its exit code. No stop opens while the approver reads `not named` or equals the requester,
or, for `DEPLOY`, while the rollback path reads `not named` or is empty: the run says which
field holds it and ends held. Running a command personally is always an acceptable answer.

## Rollback

Decided before the release, not during the incident it causes. A published version is never
unpublished: deprecate it and publish a fixed patch, or revert on the default branch and cut a
new patch line, with the reason in the changelog. A regression after a deploy is answered by the
rollback first and the diagnosis second, and that rollback is proposed with its command and its
undo for the person to run; this skill takes no automatic rollback. A live production impact
leaves for the pack's incident skill, `st-incident`, and this run ends where it stopped.

## What the run hands back

The frame line; the readiness line; the version and why, in release mode; the gate rows; the
supply-chain references or their absences; the record's path; each printed command with its
reversibility; and what opened, or `held` with the field or token that holds it.
