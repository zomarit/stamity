<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.0.0 release cut (2026-08-30). -->
<!-- Re-open when: a gate named under Landing rules is added, renamed or removed in
     `.github/workflows/`, the required-approval count changes, or the private layer's scope
     changes. `test/docsPages.test.ts` resolves the link README makes to this page;
     `test/ci/workflow.test.ts` holds the required-context names below to the workflows. -->

# Governance

> Last updated: 2026-08-30

How this project is run and how a change lands. Contribution mechanics — the loop, the test lanes,
regeneration — are in [CONTRIBUTING.md](CONTRIBUTING.md); the product, in
[README.md](README.md); behaviour, in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Decision model

One maintainer, stated rather than dressed up. Decision, merge, publish and consent authority sit
with the same person: no steering committee, no vote, no second approver to appeal to. That
person merges every pull request, tags every release, and approves every change to what the
engine generates into other people's repositories. The branch protection says the same thing —
**0 required approvals** on `main`, because a rubber stamp from the only person who could give it
would add a click and no scrutiny. What reviews a change is the gate below, plus a read.

## Proposing changes

- **A defect, a capability, or feedback on a generated agent:** open an issue. The three forms
  ask for what a fix needs and nothing else, which is why blank issues are off.
- **Code, tests, hand-written pages:** send a pull request directly. Single-purpose lands faster.
- **The corpus** — `content/` and `packs/`, the files this engine installs elsewhere: open an
  issue first, saying what should change and to what. It reaches every consumer at the next
  release, so the shape gets agreed before the patch.
- **A suspected vulnerability:** never in an issue. Use the private advisory form named in
  [SECURITY.md](SECURITY.md).

## Landing rules

A pull request merges when all of these hold.

1. **CI green.** Two required status contexts, one stable name each, so a required check does not
   rotate when the matrix does. `all-ci-checks` (`ci.yml`) passes when the check matrix passes,
   and which gate runs where is not uniform. Build, test suite, the dogfood check that re-proves
   this repository's own generated setup drift-clean, and the leak gate run on **every leg** —
   the pinned Node floor, the current LTS, one Windows leg. Typecheck, lint, the self-consistency
   generate-and-diff over every derived page, and the unused-code scan run on the **LTS toolchain
   leg only**: their answers turn on neither OS nor Node version, and their vendors do not claim
   the floor. The tarball smoke — pack, install, run the published shape — runs on the **floor
   leg only**: what it proves is a runtime claim about the oldest supported Node.
2. **DCO sign-off** on every commit — `git commit -s`. That trailer is the Developer Certificate
   of Origin: it is what lets the patch be taken under this repository's MIT licence.
3. **Conventional-commit PR title** — `type(scope): message`. A release note is read out of it.
4. **A maintainer read.** External pull requests get theirs through this project's own
   `/st-pr-resolve` command: the setup this repository generates reviews changes to it. A
   review that lands badly is a defect in the corpus and is fixed there.

Rules 2 and 3 are the second required context, `all-pr-checks` (`pr-checks.yml`, pull requests
only): it walks the pull request's commits for the sign-off trailer and fails naming the ones that
lack it, matches the title against the conventional-commit pattern, and measures the built `dist/`
against both halves of the size budget. The template still carries the first two as boxes — a
contributor should meet them before a red check, not because of one.

Two lanes run beside the gate and are advisory on purpose — supply-chain pin currency, and
dependency review on the incoming diff. Both report into the run summary; neither blocks a merge,
because a lane that cannot run on every event makes a required check that never reports.

No force-push to `main`; work lands from feature branches. Releases are hand-versioned — the
maintainer picks the number and tags it, and that tag is what triggers a publish. A maintainer
can also dispatch the release workflow, which is held to the same proofs: a `v*` tag naming the
declared version, on a commit reachable from `main`, or the run fails before it packs anything.

## The private governance layer

Not all of this project is in this repository, and pretending otherwise would be the easier lie.
A private repository holds the product strategy, the audit machinery that grades the corpus, and
the process that decides what changes next. It is private because it is the expensive half to
rebuild — not because the output needs hiding.

What that layer produces is public and checkable, which is the half that should decide whether
anyone depends on this: the CI gates above; the leak gate, which refuses a retired name or a
credential shape anywhere in the tree; the capability matrix, rendered from adapter code rather
than typed; and this repository running its own generated setup, so an emission regression fails
a check here before it reaches anyone.

## Continuity

MIT, and fork-friendly on purpose. Everything needed to build, test, generate and publish this
engine is here: a fork is a working project on day one — no private dependency, no gated content.

If the maintainer stops, the private layer freezes and this repository stays buildable by whoever
forks it. There is no escrow and no named successor today, and saying so is worth more than
describing an arrangement that does not exist.
