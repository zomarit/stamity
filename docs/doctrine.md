---
title: Doctrine
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit 7644766. -->
<!-- Re-open when: a pillar gains or loses a public enforcement surface, the root question's
     three answers change, the always-on ceilings move, or the deferred with-versus-without
     measurement lands. `test/docsPages.test.ts` holds this page to the hand-page contract;
     `../src/content/charter.ts` owns the budgets and `../evals/runs/` owns what is red. -->

# Doctrine

Every artifact this project ships — a rule, a skill, a command, a page, a gate — is context
somebody's session pays for. This page states the test each one has to pass, the four
properties that test is derived from, and the mechanism that removes an artifact once it
stops passing. It is the reasoning behind the corpus, not a second copy of it: the
[charter](../content/charter/stamity-charter.md) is what agents load, and
[working with stamity](working-with-stamity.md) is what the touchpoints do.

## The root question

> What fails without it now, and how would we know?

One question, asked of a corpus artifact, a gate, a page, or a piece of this machinery
itself. A checklist accretes — that is how the previous, larger apparatus here died — so
there is one question and it is applied recursively rather than extended. It has three
admissible answers.

**Stays.** A named failure, with evidence that it occurs, measured in this tree. Not a
failure that is plausible in general: one this repository can point at. The tightening that
followed a screening hit stays because the hit is in an eval run artifact.

**Goes.** Nothing nameable fails, or a gate already catches it. General programming wisdom
that current frontier models apply unprompted was never worth shipping, and an instruction a
commit-time gate enforces is worth less than the gate — gates run every time, prose runs when
the model happens to weight it.

**Measure first.** The failure is nameable but unmeasured. This is a real answer, not a
polite refusal: it says the artifact stays for now and names the instrument that would settle
it. What it may not do is quietly become "stays" because nobody built the instrument.

The floor reading, stated because the question invites the wrong one. A control against a
rare, high-severity event — a security floor, a destructive-action refusal, an accessibility
basic — answers "what fails without it" with the event, and "how would we know" with evidence
that the control is **armed and probed**, never with an incident. No floor is retired because
nothing has gone wrong yet; absence of the event is what a working control looks like.

## The four pillars

Each pillar names the public surface a reader can check it against. A pillar with no such
surface is a slogan, and this list is short because the surfaces are.

### Lean

Context is the budget, and it is spent per session on every artifact that loads
unconditionally.

- The charter template is capped at 150 physical lines — `CHARTER_MAX_LINES` in
  [`src/content/charter.ts`](../src/content/charter.ts), enforced by the loader, which refuses
  an over-budget template rather than emitting it.
- The composite always-on slice is a per-client ratchet, asserted in
  [`test/corpus/invariants.test.ts`](../test/corpus/invariants.test.ts) and disclosed per
  client on [the capability matrix](capability-matrix.md). A ratchet may only come down.
- Every corpus artifact — charter, command, agent, skill, rule, in `content/` and `packs/` —
  declares `obsolete_when`. The corpus invariant suite refuses a `content/` one that does not,
  and each pack's own suite under `test/packs/` applies the same check to its pack, so a corpus
  artifact cannot ship without stating the condition under which it is deleted. A hand page
  carries the equivalent as a re-open trigger; a generated page's equivalent is the renderer it
  is byte-compared against.

### Provable

A claim about behaviour is worth what its instrument is worth.

- The verification gates — lint, typecheck, tests — decide whether a change is done. `AGENTS.md`
  is their home; the working-with-stamity guide quotes them verbatim, and README and CONTRIBUTING
  name the wider contributor gate, `npm run check`, which chains them with the leak gate, the
  build and the unused-code scan.
- The corpus is prose executed by a model, so a test suite cannot decide it. The
  [eval set](../evals/README.md) does: thresholds declared before the run, red runs published
  rather than re-scored.
- Every work run closes on a proof block naming the gates it ran and what it did not do.
- The question protocol declares a default for every question it asks, so an unanswered
  question produces a recorded decision instead of a silent pick.

### Current

An artifact that was true once and says nothing about when is unfalsifiable.

- The capability matrix carries a dated access stamp on every client's sources: a platform
  fact is only as current as the date beside it.
- Every page in the hand bucket — README, SECURITY, CONTRIBUTING and the eight guides under
  `docs/` — carries a currency stamp and a re-open trigger, the two comments at the top of this
  page, held there by `test/docsPages.test.ts`. `GOVERNANCE.md` carries the same pair on its own
  trigger.
- The release controls checklist carries a per-release currency section, so re-verification is
  part of cutting a release rather than a thing somebody remembers.

### Candid

- [`GOVERNANCE.md`](../GOVERNANCE.md) states who decides and what the private layer holds.
  [`SECURITY.md`](../SECURITY.md) states what is defended and, in a section of its own, what is
  not.
- A run that closes without green gates ships a `Not done:` list naming each open gap — the
  charter's invariant 4 — and the work and spec commands carry that list in their closing block
  by name, and debug and pr-resolve name a `not done` line for one exit each — instrumentation
  held under a capture-later agreement, a reply that failed to post. The other commands close on
  a typed open-gap block of their own — unanswerable and blocked, `open`, open questions carried,
  per-item dispositions, DEFER rows — plus a next-step line that says so when there is nothing
  outstanding, or, for a plan, names the handoff a clean artifact takes.
- The run artifacts under `evals/runs/` say which run is red and by how much — the latest full run
  states its verdict against each declared threshold — and no red baseline is re-run to make it
  look better; the eval README carries the baselines and the rule that they stay put.

## Deletion triggers

`obsolete_when` is the pre-written "goes" answer. It is written when the artifact ships,
before anyone is attached to it, and it names a condition an observation can fire: models do
this unprompted now, the platform ships it natively, a standard covers it, this gate replaced
it. At every audit cycle — manual, on the maintainer's trigger — the root question is re-asked
of each artifact against its own trigger, and the trigger is what makes that a reading rather
than a negotiation.

The honest state today: most artifacts answer **measure**, not **stays**. Conformance is
measured — the eval set grades whether an agent follows its own rules — but the measurement
that would settle "does this artifact beat the bare model on task success and token cost" does
not exist here yet. It is deferred, its trigger recorded in the maintainer's roadmap outside
this tree, and this paragraph is where the deferral stays visible until it lands.

## The always-on budget

Stated plainly, because a rounder number is available and it is wrong. The charter template is
capped at 150 lines, and that cap binds one file. What a client actually loads unconditionally
is the charter plus every rule that client has no way to attach conditionally, which is three
distinct figures across the four clients — from the one that defers a description-scoped rule
until it is relevant and so pays the charter alone, through the two that pay the same composite,
to the one with no per-rule attach mechanism at all, which is handed the whole rule set less the
tail its 32 KiB instruction budget drops: eight rules on the full selection, named in the emitted
file's own omission notice. The ceiling counts them regardless, because a rule silently dropped
is a floor that stopped binding. `ALWAYS_ON_BUDGET_LINES` in
[`src/content/charter.ts`](../src/content/charter.ts) holds the per-client ceilings, the
invariant suite measures the real load against them, and
[the capability matrix](capability-matrix.md) carries the figures. Read those rather than a
sentence here: they move, and only they are checked.
