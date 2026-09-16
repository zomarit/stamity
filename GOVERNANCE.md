<!-- HAND-WRITTEN PAGE — verified against the tree at commit e79dcf0. Re-attested 2026-09-16 in the Package 14 rewrite. -->
<!-- Re-open when: a check named below is added, renamed or removed in `.github/workflows/`, the
     required-approval count changes, the MAJOR/MINOR/PATCH bump rules change, what the private
     layer holds changes, or a trigger in the EU AI Act section fires. `test/docsPages.test.ts`
     resolves the link README makes to this page; `test/ci/workflow.test.ts` holds the two
     required-context names below to the workflow files. -->

# Governance

> Last updated: 2026-09-16

This page is for a contributor or a reviewer who wants to know who runs stamity and how a change
gets in. It answers four questions: who decides, the two required checks a change passes to land,
what the private layer holds, and what happens if the maintainer stops.

Three neighbouring pages carry the rest. [CONTRIBUTING.md](CONTRIBUTING.md) has the contribution
loop, the test lanes and the regeneration commands. [README.md](README.md) describes the product.
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) covers behaviour.

## Who decides?

One person maintains stamity. Decision, merge, publish and consent authority all sit with that
person. There is no steering committee, no vote, and no second approver to appeal to.

The maintainer merges every pull request and tags every release. The maintainer also approves
every change to the corpus. The corpus is `content/` and `packs/`, the files stamity installs into
other people's repositories.

The branch protection on `main` says the same thing: **0 required approvals**. A rubber stamp from
the only person who could give it would add a click and no scrutiny. What reviews a change is the
required checks below, plus a maintainer's read.

## How do you propose a change?

- **A defect, a capability, or feedback on a generated agent.** Open an issue. Three forms are
  offered, and each asks for what a fix needs and nothing else. Blank issues are off for that
  reason.
- **Code, tests, or a hand-written page.** Send a pull request directly. A single-purpose pull
  request lands faster.
- **A change to the corpus.** Open an issue first, and say what should change and to what. The
  corpus reaches every consumer at the next release, so the shape gets agreed before the patch.
- **A suspected vulnerability.** Never in an issue. Use the private advisory form named in
  [SECURITY.md](SECURITY.md).

## What does a pull request have to pass before it merges?

A pull request merges when two required status checks pass and a maintainer has read it. Each
check has one stable name, so a required check does not rotate when the matrix does.

### What `all-ci-checks` covers

`all-ci-checks` is the aggregator job in `.github/workflows/ci.yml`, and it runs on every event.
It passes when two lanes pass: the check matrix, and the APM route lane.

The check matrix runs three legs: the pinned Node floor, the current LTS, and one Windows leg.
Which step runs on which leg is not uniform.

- **Every leg** runs the build, the test suite, the dogfood check and the leak gate. The dogfood
  check re-proves that this repository's own generated setup is drift-clean. The leak gate refuses
  a retired name, a credential shape, or a reference to the private layer anywhere in the tree.
- **The LTS toolchain leg only** runs typecheck, lint, the repository-hygiene scan, the
  self-consistency generate-and-diff over every derived page, and the unused-code scan. Their
  answers turn on neither the operating system nor the Node version, and their vendors do not
  claim the floor.
- **The floor leg only** runs the tarball smoke: pack the tarball, install it, run the published
  shape. What it proves is a runtime claim about the oldest supported Node.

The APM route lane installs this repository's generated APM package into a throwaway consumer and
checks the deployed tree. [CONTRIBUTING.md](CONTRIBUTING.md) names the client versions it runs
against.

### What `all-pr-checks` covers

`all-pr-checks` is the aggregator job in `.github/workflows/pr-checks.yml`, and it runs on pull
requests only. It carries the three things that can only be asked about a pull request.

1. **DCO sign-off on every commit.** Sign off with `git commit -s`. The job walks the pull
   request's own commit list and fails naming the commits that lack the trailer. That trailer is
   the Developer Certificate of Origin. It is what lets the patch be taken under this repository's
   MIT licence.
2. **A conventional-commit pull-request title.** The shape is `type(scope): message`. A release
   note is read out of it.
3. **The dual size budget** measured over the built `dist/`. Both halves are checked, and both
   numbers come from one declaration so the check and the build cannot disagree.

The pull-request template still carries the first two as boxes. Meet them before a red check, not
because of one.

### What the maintainer's read adds

Every change also gets a read. External pull requests get theirs through stamity's own
`/st-pr-resolve` touchpoint: the setup this repository generates is the setup that reviews changes
to it. A review that lands badly is a defect in the corpus, and it gets fixed there.

### Which lanes are advisory

Two lanes run beside the required checks and are advisory on purpose. One checks supply-chain pin
currency. One reviews the dependencies the incoming diff adds. Both report into the run summary,
and neither blocks a merge. A lane that cannot run on every event would make a required check that
never reports.

### How work lands on `main`, and how a release is cut

No force-push to `main`. Work lands from feature branches.

Releases are hand-versioned. The maintainer picks the number and tags it, and that `v*` tag is
what triggers a publish. A maintainer can also dispatch the release workflow. A dispatch defaults
to a dry run, which runs every check in the release path and publishes nothing.

A dispatch that turns the dry run off is a real release, so it is held to the same proofs as a tag
push. The dispatched ref has to be a `v*` tag naming the version `package.json` declares, on a
commit reachable from `main`. Both proofs run before the pack step, so a dispatch from a branch
fails before anything irreversible happens.

## Invariants versioning: when the version moves, and who moves it

The charter's seven invariants are the floors every flow holds. They carry a version, so a change
to one is a dated, citable event rather than a wording tweak.

Three frontmatter keys on `content/charter/stamity-charter.md` hold that version:
`invariants_version`, `invariants_ratified` and `invariants_amended`. The emitted charter renders
them as one line under `## Invariants`. Every generated repository can therefore say which version
of the floors it is running.

The version moves under three rules.

- **MAJOR**: a backward-incompatible removal or redefinition of an invariant.
- **MINOR**: a new invariant, or materially expanded guidance inside one.
- **PATCH**: a clarification, a wording change, or a non-semantic refinement.

Every amendment also carries a sync-impact note. The note says what a repository has to regenerate
to pick the amendment up.

The maintainer bumps the version in the same change as the text. Not afterwards, and not in a
release sweep: a version that trails the words it names is worse than no version. The suite
enforces that. It hashes the invariants block, and it refuses an invariants-text change that
arrives without a version bump and a matching row in the amendments table on
[docs/doctrine.md](docs/doctrine.md).

## What does the private layer hold?

Not all of this project is in this repository, and pretending otherwise would be the easier lie. A
private layer holds the governance record:

- a decision ledger and an evidence ledger
- a constitution built around one root question
- the product strategy, and the competitive analysis beside it
- a manual audit cycle, with its findings ledger and a question channel back to the maintainer
- the clause register the completeness program is measured against
- a process pack sized for shifts from a one-line correction to a change of direction

It is private because it is the expensive half to rebuild. It is not private because the output
needs hiding.

What that layer produces is public and checkable, and that is the half that should decide whether
anyone depends on stamity:

- the required checks above
- the leak gate, which refuses a retired name, a credential shape, or a reference to the private
  layer anywhere in the tree
- the capability matrix, rendered from adapter code rather than typed by hand
- this repository running its own generated setup, so an emission regression fails a check here
  before it reaches anyone

## Does the EU AI Act apply?

No. EU AI Act Article 50 sets transparency obligations, and they have applied since 2026-08-02.
They do not apply to stamity, because it is not an AI system placed on the market: it generates
configuration text for AI coding clients and runs no model of its own.

Re-open that reading if the project ships a hosted model-backed service, or if it publishes
model-generated output to end users as its own.

## What happens if the maintainer stops?

The licence is MIT, and the project is fork-friendly on purpose. Everything needed to build, test,
generate and publish this engine is in this repository. A fork is a working project on day one:
no private dependency, and no gated content.

If the maintainer stops, the private layer freezes and this repository stays buildable by whoever
forks it. There is no escrow and no named successor today. Saying so is worth more than describing
an arrangement that does not exist.
