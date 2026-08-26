---
id: onboard
type: skill
description: "Guides the first real change in a repository this setup was just installed into — orients on the actual code, settles on one small change with the operator, runs it through the touchpoints the install shipped, and closes on a passing verification gate. Triggers right after `stamity init` finishes, when someone opens a freshly set-up repository and asks what to do next, or when a repository carries the setup but has no first proven change through it yet."
tags: [planning]
load: on-demand
obsolete_when: clients walk a newcomer through a proven change on their own code at session start, leaving no guided first run to script
---

# First proven change

The walk from a finished install to one real change on the operator's own code,
proven by a verification gate. Six phases, each ending at a question the
operator answers. Nothing about this repository is assumed: every fact comes
from the charter, from the code, or from the answer to a checkpoint.

## Quick Start

1. Orient on the real repository — charter facts first, then the code behind them.
2. Settle on ONE small change, picked from candidates found in that code.
3. Name the proof before anything is edited.
4. Make the change through the lane this install shipped.
5. Run the gate: green is the proven change; red is a named `Not done:` list.
6. Optional — leave a short orientation note behind.

## The clock

Fifteen minutes is what the six phases are SIZED for, not a claim about a
particular repository. The budget is stated per phase so the walk degrades in a
planned direction instead of quietly overrunning:

| Phase | Target | Dropped first when the clock runs out |
|---|---|---|
| 1 Orient | 3 min | the tour past the charter's own rows — read them, spot-check two, move on |
| 2 Pick | 3 min | the candidate list narrows to one, offered rather than chosen from |
| 3 Name the proof | 2 min | nothing — a change with no named proof is not a proven change |
| 4 Change | 4 min | the lane narrows from `/stamity-work` to `/stamity-quick`: one file, one behavior |
| 5 Prove | 3 min | the full gate narrows to `${STAMITY:VERIFY_GATE_TEST}` over the touched files |
| 6 Note | — | dropped first, always; it is the one optional phase |

**The minimum proven change**: one file, one behavior, one test that fails
without the edit and passes with it, and `${STAMITY:VERIFY_GATE_TEST}` green over
the files it touched. Anything below that produced a tour, and the handback says
so rather than calling it a proven change.

**A repository too large to orient on in three minutes** narrows phase 1 to a
single subsystem — the directory recent history touches most — and the clock
runs from there. Same six phases, longer clock, stated out loud at phase 1
rather than discovered at phase 5.

## Phase 1 — Orient

Read the charter's repo facts, then check two of them against the code instead
of restating them: the declared test framework against a real test file, the
declared gates against the file that declares them. A row beginning `unknown` is
unconfigured — report it and ask for the value, never fill it in with a
plausible one.

Then state, in three lines: what this repository produces, its entry point, and
the directory recent history touches most.

**Checkpoint.** Present the facts that held, the ones that did not, and the
three lines. Ask which to correct. The charter is rendered whole from detection
and carries no hand-editable block, so a correction reaches it by re-running
detection — `stamity init` or `stamity sync` — with `stamity config` for the values
detection does not derive; an edit made any other way is overwritten on the next
sync. Nothing is rewritten here on the way past.

## Phase 2 — Pick one change

Offer two or three candidates, each found by reading THIS repository — never a
generic starter task. Productive sources: a `TODO` sitting beside code that
explains itself, a missing guard on an input path, an error message that names
no next action, a test whose name promises more than its assertions reach.

Each candidate carries one line: the file, the observable change, and why it is
small. A candidate nobody can size in one line is too big for this walk.

**Checkpoint.** Ask which candidate to take, with "none of these — here is
mine" as a listed option. An operator who arrives with their own change in mind
is the best case for this walk, not an exception to it.

## Phase 3 — Name the proof

Before anything is edited, state the proof in one sentence: the observable that
is false now and true afterwards, and the `${STAMITY:TEST_FRAMEWORK}` test that
reads it. Write that test first whenever the criterion is expressible as one,
and watch it fail for the expected reason — a test that has never been red
proves the suite runs, not that the change works.

**Checkpoint.** Show the red test and its failure message. Ask whether that is
the proof to hold the change to.

## Phase 4 — Make the change

Run it through the lane this install shipped rather than by hand beside it —
walking the lane is half of what the walk teaches:

| The pick | Lane |
|---|---|
| one file, one behavior, no contract other code reads | `/stamity-quick` |
| more than one file, or a shape another module depends on | `/stamity-work` |
| the pick turned out to be a defect with an unknown cause | `/stamity-debug` |

**This skill spawns nothing.** Delegation belongs to the touchpoints: when the
pick needs a planned implementation pass, hand it to `/stamity-work` and rejoin
at phase 5 with the diff that run produced. A skill that spawns its own workers
is a command wearing a skill's frontmatter.

**Checkpoint.** Show the diff. Ask whether it is the change that was picked —
scope creep is the common failure here, and it is visible in the diff long
before it is visible in the gate.

## Phase 5 — Prove it

Run `${STAMITY:VERIFY_GATE_ALL}`. Under clock pressure narrow to
`${STAMITY:VERIFY_GATE_TEST}` over the touched files and name the gates that did
not run — an unrun gate is reported as unrun, because silence reads as green.
A single red static gate re-runs on its own, `${STAMITY:VERIFY_GATE_LINT}` or
`${STAMITY:VERIFY_GATE_TYPECHECK}`, instead of the whole chain again.

Green closes the walk: the first proven change is done. Red closes it just as
honestly — a `Not done:` list naming each open gap, quoting the failing gate
output rather than summarising it.

**Checkpoint.** Ask whether to keep the change, refine it inside this walk, or
revert it. A walk that ends in a revert still proved the lane end to end, which
is the other thing it came for.

## Phase 6 — Leave a note (optional)

A short orientation note at `docs/onboarding.md` holding what this walk
established — the charter facts that held, the ones that did not, the lane the
change went through, and the gate that proved it. Every line comes from the walk
that just ran; nothing is gathered for it, and an existing file at that path is
shown as a diff before anything replaces it.

The note is a by-product. The proven change is the product, and a repository
that never wants the note loses nothing this skill exists for.

**Checkpoint.** Offer the note once, here, with declining as the stated default.
A decline ends the walk on the proven change, which is where it was always
going.

## Checkpoints

Every phase above ends with one question and waits for the answer. A phase that
answers its own question is a generator with extra steps — the walk exists so
the operator makes each call on their own code. An unanswered checkpoint closes
the run at that phase and reports what stands; it never advances on an assumed
answer.

<!-- STAMITY:PLATFORM-TOOL -->

The plain-text fallback is the checkpoint line itself: print the phase's
question and the options it offers, name what happens with no answer, and stop
there.

## Handback

Five facts, in this order: the change made (file and observable), the proof and
its result, the lane it went through, the gate command with its exit status, and
the phases the clock dropped. Invoked inside another run, those five lines are
what that run records.
