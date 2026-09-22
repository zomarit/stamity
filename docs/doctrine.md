---
title: Doctrine
---

<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.9.0 release cut (2026-09-21). -->
<!-- Re-open when: an invariant's text changes, a pillar gains or loses a public enforcement
     surface, the root question's three answers change, the always-on split across clients moves,
     or the deferred with-versus-without measurement lands. `test/docsPages.test.ts` holds this
     page to the hand-page contract; `../src/content/charter.ts` owns the budgets and
     `../evals/runs/` owns what is red. -->

# Doctrine

This page is the reasoning behind everything stamity ships, for the operator or reviewer deciding
whether one more rule, skill, command or page is worth its cost. It answers one question: why
does this tool ship what it ships, and how does something get removed again?

Start with the cost. A rule that loads every session is context somebody pays for before any work
happens. Every artifact here has to earn that: a rule, a skill, a command, a page, a gate. Below
is the test each one takes, the four properties the test comes from, and the mechanism that
deletes an artifact once it stops passing.

This page is not a second copy of the corpus. The
[charter](../content/charter/stamity-charter.md) is what agents load.
[Working with stamity](working-with-stamity.md) is what the touchpoints do.

## What question does every artifact have to answer?

> What fails without it now, and how would we know?

You ask it of a corpus artifact, a gate, a page, or a piece of this machinery itself. Then you
ask it again of the answer. There is one question rather than a checklist, because a checklist
accretes. That is how the larger apparatus that stood here before died.

The question has three admissible answers.

**Stays.** Something nameable fails, and there is evidence that it happens in this tree. Not a
failure that sounds plausible in general. One this repository can point at. A tightening that
followed a screening hit stays, because the hit is recorded in an eval run artifact.

**Goes.** Nothing nameable fails, or a gate already catches it. General programming wisdom that
current frontier models apply unprompted was never worth shipping. An instruction that a
commit-time gate enforces is worth less than the gate. Gates run every time. Prose runs when the
model happens to weight it.

**Measure first.** The failure is nameable but unmeasured. This is a real answer, not a polite
refusal. It says the artifact stays for now, and it names the instrument that would settle the
question. What it may not do is quietly become "stays" because nobody built the instrument.

### How does a safety floor answer it?

The question invites a wrong reading, so the right one is stated here. Take a control against a
rare, high-severity event. A security floor, a destructive-action refusal and an accessibility
basic are all that shape. Such a control answers "what fails without it" with the event itself.
It answers "how would we know" with evidence that the control is **armed and probed**. It never
answers with an incident. No floor is retired because nothing has gone wrong yet. Absence of the
event is what a working control looks like.

## What are the four pillars, and where do you check them?

Each pillar names a public surface you can check it against. A pillar with no such surface is a
slogan. The list is short because the surfaces are.

### Lean

Context is the budget, and you spend it every session on every artifact that loads
unconditionally.

- The charter template is capped at 150 physical lines. The cap is `CHARTER_MAX_LINES` in
  [`src/content/charter.ts`](../src/content/charter.ts). The loader enforces it and refuses an
  over-budget template rather than emitting it.
- The composite always-on slice is a per-client ratchet. The corpus invariant suite in
  [`test/corpus/invariants.test.ts`](../test/corpus/invariants.test.ts) asserts it, and
  [the capability matrix](capability-matrix.md) discloses it per client. Each ceiling equals the
  composite it measures. A slice that grows past its ceiling fails, and so does one that shrinks
  without the ceiling moving with it. The table is a measurement, never a bound with slack.
- Every corpus artifact declares `obsolete_when`. That covers the charter, commands, agents,
  skills and rules, under both `content/` and `packs/`. The corpus invariant suite refuses a
  `content/` artifact that does not declare it. Each pack's own suite under `test/packs/` applies
  the same check to its pack. So no corpus artifact ships without stating the condition under
  which it is deleted.

A hand-written page carries the same thing as a re-open trigger. A generated page carries it as
the renderer the page is byte-compared against.

### Provable

A claim about behaviour is worth what its instrument is worth.

- The verification gates decide whether a change is done. They are lint, typecheck and tests.
  `AGENTS.md` is their home, and [working with stamity](working-with-stamity.md) quotes them
  verbatim. [README](../README.md) and [CONTRIBUTING](../CONTRIBUTING.md) name the wider
  contributor gate, `npm run check`, which chains them with the leak gate, the build and the
  unused-code scan.
- The corpus is prose executed by a model, so a test suite cannot decide it. The
  [eval set](../evals/README.md) decides it instead. Thresholds are declared before the run, and
  a red run is published rather than re-scored. The run of record is
  [run 32](../evals/runs/2026-09-22-run-32/RESULTS.md), the 1.9.0 release run, which passed every
  declared threshold. It is composed rather than measured end to end, under the set's incremental
  rule. Run 27 measured every case in full. Runs 29, 30, 31 and 32 then re-measured only the cases
  whose inputs had moved, and carried the rest with their hashes.
  [The measurements page](measurements.md) rolls an eval run of record up beside the verified
  merge-ready rate.
- Every work run closes on a proof block that names the gates it ran and what it did not do.
- The question protocol declares a default for every question it asks. An unanswered question
  therefore produces a recorded decision instead of a silent pick.

### Current

An artifact that was true once and says nothing about when is unfalsifiable.

- [The capability matrix](capability-matrix.md) carries a dated access stamp on every client's
  sources. A platform fact is only as current as the date beside it.
- Every page in the hand-written bucket carries a currency stamp and a re-open trigger. They are
  the two comments at the top of this page. The bucket is `README.md`, `SECURITY.md`,
  `CONTRIBUTING.md` and the eleven guides under `docs/`, and `test/docsPages.test.ts` holds all
  fourteen to that pair. [`GOVERNANCE.md`](../GOVERNANCE.md) carries the same pair on its own
  trigger.
- The release controls checklist carries a per-release currency section. Re-verification is part
  of cutting a release, rather than something somebody has to remember.

### Candid

What the project does not do is published beside what it does.

- [`GOVERNANCE.md`](../GOVERNANCE.md) states who decides, and what the private layer holds.
  [`SECURITY.md`](../SECURITY.md) states what is defended and, in a section of its own, what is
  not.
- A run that closes without green gates ships a `Not done:` list naming each open gap. That is
  the charter's invariant 4. The work and spec touchpoints carry that list in their closing block
  by name. Debug and pr-resolve each name a `not done` line for one exit apiece. Debug's is
  instrumentation left in place under a capture-later agreement. Pr-resolve's is a reply that
  failed to post.
- The other touchpoints close on a typed open-gap block of their own. Those blocks carry
  unanswerable and blocked items, `open` rows, open questions carried forward, per-item
  dispositions and DEFER rows. Each block ends on a next-step line, which says so when nothing is
  outstanding. For a plan, that line names the handoff a clean artifact takes.
- The run artifacts under `evals/runs/` say which run is red and by how much. The latest full run
  states its verdict against each declared threshold. No red baseline is re-run to make it look
  better. The [eval set README](../evals/README.md) carries the baselines and the rule that they
  stay put.

## How does an artifact get deleted?

`obsolete_when` is the "goes" answer, written in advance. It is written when the artifact ships,
before anyone is attached to it. It names a condition that an observation can fire. Models do
this unprompted now. The platform ships it natively. A standard covers it. This gate replaced it.

At each audit cycle the root question is re-asked of every artifact, against that artifact's own
trigger. The cycle is manual, on the maintainer's trigger. The trigger is what makes the re-ask a
reading rather than a negotiation.

### What is the honest state today?

Most artifacts answer **measure first**, not **stays**. Conformance is measured: the eval set
grades whether an agent follows its own rules. The other measurement is missing. Nothing here
shows whether an artifact beats the bare model on task success and token cost. That
with-versus-without measurement does not exist in this tree yet. It is deferred, its trigger is
recorded in the maintainer's roadmap outside this tree, and this paragraph is where the deferral
stays visible until it lands.

## What does a session pay before it starts?

There is a rounder answer to this, and it is wrong. The 150-line cap binds the charter template,
and nothing else. What a client loads unconditionally is that template plus every rule the client
cannot attach conditionally. The composite differs by client, because the delivery mechanisms
differ.

Three of the four clients pay the charter alone today, for two different reasons. Cursor's own
rule layer already defers a rule that declares no globs until the conversation matches it. Claude
and copilot get those same rules projected as skills instead, opened on description. Codex is the
fourth. It has no per-rule attach mechanism, so it loads the charter plus the rules that have to
stay unconditional, and the rest reach it as skills too. The ceiling counts whatever the client
is handed, because a rule silently dropped is a floor that stopped binding.

Do not read the figures off this page. `ALWAYS_ON_BUDGET_LINES` in
[`src/content/charter.ts`](../src/content/charter.ts) holds the per-client ceilings. The corpus
invariant suite measures the real load against them. [The capability matrix](capability-matrix.md)
carries the figures, and also describes what changes if a repository selects the older
`always-on` rule delivery instead of the shipped default. Read those rather than a sentence here:
they move, and only they are checked.

## Amendments: how the invariants change

The charter's seven invariants carry a version, because a floor that can be reworded without a
record is a floor nobody can cite. The version moves under three rules. **MAJOR** is a
backward-incompatible removal or redefinition of an invariant. **MINOR** is a new invariant, or
materially expanded guidance inside one. **PATCH** is a clarification, a wording change, or a
non-semantic refinement.

Every amendment carries a sync-impact note. The invariants text is rendered into every generated
repository's always-on file, so a repository that never re-syncs keeps the old floor.
[GOVERNANCE](../GOVERNANCE.md) states who bumps the version and when.
`test/content/invariantsVersion.test.ts` hashes the block and fails an edit that arrives without a
bump and a row below.

| Version | Date | Invariant(s) | Class | Sync impact |
|---|---|---|---|---|
| — (`c2489db`) | 2026-09-07 | 7 | MINOR-equivalent | handing the operator a line, diff or file body to paste is named as the same violation; recorded, no bump — versioning begins at 1.0.0 |
| — (`5a49b93`) | 2026-09-07 | 1 | MINOR-equivalent | a hand-off framed so the operator can close without the floor is named as the relaxation; recorded, no bump — versioning begins at 1.0.0 |
| — (`a9074f1`) | 2026-09-13 | 1, 7 | MINOR-equivalent | offering a subset, a lighter pass or a deferral is the same relaxation, and a refusal calls the act a protocol violation in those words; recorded, no bump — versioning begins at 1.0.0 |
| — (`33e13a1`) | 2026-09-13 | 1 | MINOR-equivalent | the `Not done:` report is the whole exit — no context block, no closing summary beside it; recorded, no bump — versioning begins at 1.0.0 |
| 1.0.0 | 2026-09-15 | all seven | ratification | the version line is rendered in every client's charter; hash pinned in `test/content/invariantsVersion.test.ts` |

The block ratified at 1.0.0 is the 2026-08-31 text plus the four amendments above. Nothing was
reworded to ratify it, which is why the first version records no diff of its own.
