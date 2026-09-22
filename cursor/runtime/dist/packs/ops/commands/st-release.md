---
id: release
type: command
description: "Cuts a versioned release: preflight, SemVer decision, changelog, gates, supply-chain artifacts — assembled on a release branch and stopped before tag push, registry publish, and production deploy."
tags: [devops, orchestration]
load: on-demand
obsolete_when: release tooling natively couples the version decision, attested artifacts, and a typed human gate on every one-way publish action
spawns: [implementer, test-runner, reviewer, fixer, devops]
---

# /st-release

Assemble a release; hand the publish decision to a human. Everything this
command does is reversible. Every one-way door is somebody else's keystroke.

## Fail-closed boundary

Stated here in full, because every later step depends on it — and stated here
rather than referenced, so the boundary travels with the command that enforces
it:

This command does not push a tag, does not publish to a registry, does not
merge to the default branch, and does not deploy to production. It assembles
the release on a `release/X.Y.Z` branch, commits it, prints the exact command
for each irreversible step, and stops before publish.

- **Typed confirmation, not assent.** An irreversible step opens only on a
  literal the operator types — the target version `vX.Y.Z` to publish,
  `DEPLOY` to promote to production. A free-text "yes" does not open it.
- **Silence holds.** No answer, an empty answer, or a mismatched token leaves
  the release assembled and unpublished. Hold is the default outcome at every
  gate and every intensity.
- **The one-way doors, named.** Registry publish, tag push, public release
  creation, production promotion. A published version cannot be returned to
  the state that preceded it, so a bad release is answered with a deprecation
  and a follow-up patch, not an unpublish.

## Step 1 — Preflight, read-only

Halt with an actionable message rather than working around any row:

| Probe | Requirement | On failure |
|---|---|---|
| `git status --porcelain` | empty | halt naming the dirty paths; the operator commits or stashes |
| current branch | a `release/*` branch, never the default branch | halt and print `git switch -c release/<target>` |
| last tag + change set | `git describe --tags --abbrev=0`, then the log since that tag | halt when nothing changed since the last tag — there is no release to cut |
| open blockers | no open blocker-labelled issue on this milestone | present the list; the operator decides whether it blocks |

Cache the change set here. The version decision, the changelog, and the review
scope all read it, and re-deriving it invites three answers to one question.

## Step 2 — Version decision

| Increment | Trigger |
|---|---|
| MAJOR | an incompatible change to a public surface: API shape, persisted or wire field, CLI flag, removed capability |
| MINOR | backward-compatible capability: a new surface, a new option, a deprecation that still works |
| PATCH | backward-compatible fix, documentation, or a dependency bump that changes no public surface |

A MAJOR bump is a scope decision rather than a mechanical one: ask before
taking it even when the operator named the version, and carry the answer into
the changelog's breaking-change section. Pre-release lines use the same table
with a `-alpha.N`, `-beta.N`, or `-rc.N` suffix, published under a
non-default distribution tag so an unsuspecting install cannot land on one.

## Step 3 — Bump and changelog, delegated

One implementer owns both writes, because they must agree: the version in the
project manifest and the changelog heading for that version are read back
together in Step 6.

The unit brief carries the target version, the cached change set, and the
changelog conventions in use. Entries group by kind — added, changed,
deprecated, removed, fixed, security — under a dated version heading, each
line naming the change and its merge reference. A change set with no entry is
a defect in the brief, not a quiet omission: every merged change appears or is
listed as deliberately unlisted.

## Step 4 — Gates

A test-runner sub-agent runs the charter's full verification gate and returns
one row per gate: the exact command, pass or fail, and the verbatim failing
excerpt. A summary sentence is not a gate result. That gate set is closed and
the project's build is not in it: the build belongs to Step 6's devops
sub-agent, which already owns build output, so a broken build fails there
rather than passing unexamined here.

Red stops the cut. A failing gate routes to a fixer and the gates re-run from
the top — a re-run narrowed to the previously failing selector proves only
that the selector passes.

## Step 5 — Review

A reviewer reads the release diff: the version bump, the changelog, and
anything the fix rounds touched. Critical and Warning findings route to a
fixer and re-enter review; Minor findings are ledgered and travel with the
release notes. An unreviewed release diff is an unreviewed change, and the
release commit is the last moment it is cheap to fix.

**Spec currency at the release cut.** Sample the requirements this release's
changes touched and report each as agreeing with shipped behaviour, drifted, or
unverifiable. Drift is resolved on one side or recorded in the release notes as
known drift with an owner — a version that ships while its own specification
says something else has published two answers. The release cut is where
currency is checked; assuming it here is how a specification stops being one.

## Step 6 — Build and supply-chain artifacts

Delegated to the devops sub-agent, which runs the project's build, produces the
artifacts beside its output, and reports what it could not produce. Skipping a
row silently is the failure this step exists to prevent; an unproduced artifact
is named in the handoff, and a failing build stops the cut as a red gate does.
The artifact set and its command shapes are the `st-release` skill's Step 5
— cited, not restated, because two copies of one table drift. The floor:

every release carries build provenance signed through a transparency log plus
the verification snippet a consumer runs; every release shipping an image
carries that image's signature over its digest; team tier and above adds the
SBOM and the build-level attestation, both deferrable on a solo project.

Two rules bind the set. Publishing credentials are short-lived workload
identities issued to the build job, never long-lived registry tokens held in
project settings. And every artifact is bound to the image or package
**digest**, never to a moving tag — a signature on a tag proves nothing once
the tag moves.

Reconcile before the handoff: the changelog heading version equals the
manifest version, the change references in the section equal the Step 1 change
set, and a MAJOR release carries migration notes. A mismatch routes back to
the Step 3 implementer.

## Step 7 — Assemble, then stop

1. Stage and commit on the `release/*` branch with a conventional message and
   the project's required sign-off. No push, no tag, no merge.
2. Present the release summary: target version, gate rows, review verdict with
   confidence, supply-chain artifacts produced and skipped, and the reconciled
   changelog section.
3. Print the remaining commands verbatim, labelled by reversibility. Local tag
   creation comes first and is reversible — `git tag -d vX.Y.Z` undoes it. Tag
   push, the registry publish the build system runs on that pushed tag, and the
   production promotion are the irreversible ones, and are labelled so.
4. Ask once: push the branch and open the release request, print the commands
   for the operator to run, or hold. Default on no response: hold.

## Rollback

Decided before the release, not during the incident it causes. Deprecate the
bad version and publish a fixed patch; revert on the default branch and cut a
new patch line; record the reason in the changelog and open a follow-up. An
automatic unpublish or an automatic rollback is never taken by this flow — the
operator does it or approves it.

When a release causes a production incident, hand off to
`/st-incident-response`, which owns severity, mitigation, and the
post-mortem. This command's job ended at the gate it stopped in front of.

## Model classes

A restatement of what each role's own agent file declares, readable without
opening five files. Nothing carries it — the agent file is the truth, and a row
here that disagrees with one is a defect in this table.

| Role | Class | Why |
|---|---|---|
| reviewer | advanced | the release diff is the last review before a one-way door |
| implementer | advanced | the bump and the changelog are read back together in Step 6 |
| devops | standard | artifact emission follows a known procedure |
| fixer | standard | mechanical gate failures on a frozen change set |
| test-runner | economy | runs commands and reports them verbatim |

## Return contract

Sub-agents return `DONE` or a `BLOCKED_*` status with what was attempted, what
blocks, and the smallest unblocking input. They do not put questions to the
operator: an ambiguous release scope comes back as `BLOCKED_AMBIGUITY` naming
the competing readings, and this command runs the gate.
