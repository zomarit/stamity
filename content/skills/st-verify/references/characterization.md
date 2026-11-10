---
id: characterization
type: skill
description: Characterization recipe for the verify skill — pin what old, weakly tested code does today as unit 0, before any change lands on it.
tags: [review]
load: reference
obsolete_when: clients generate and prove characterization tests for an uncovered path on their own before editing it
---

# Characterization recipe

Old code with no tests is changed safely only after its current behaviour is
written down as tests. This recipe is unit 0 of a plan: it pins what the code
does today, right or wrong, so the units after it can prove they changed only
what they meant to.

## When

- A path the plan touches has no test that exercises it.
- A coverage report already on disk shows the path uncovered. Read the report;
  never generate one to decide this.
- A refactor invariant is marked `uncovered`.

Code with tests that already pin the touched behaviour skips this recipe.

## Find the seams

1. List the public entry points that reach the touched path: exported
   functions, command verbs, routes, handlers, jobs.
2. For each, name its observable outputs: return values, written files,
   printed lines, exit codes, stored rows, emitted events.
3. Pin at the highest seam that still runs fast and alone. A private helper is
   pinned through its caller, not opened up for the test.

## Record what the code does today

- Name each test `pins current: <behaviour>`, so a reader sees it records
  today's behaviour, not a requirement.
- Take the expected value from a real run of today's code, never from the docs
  or from what the code ought to return.
- Cover each branch the touched path takes, with inputs that make the code do
  real work: non-empty collections, non-zero amounts, two or more records where
  it merges or removes duplicates.
- Inject the clock, randomness and the environment through the seam the code
  already has, or the smallest one that changes no behaviour. A pin that reads
  the real clock is red tomorrow for no reason.
- Large outputs go to golden files beside the test, reviewed in full the first
  time they are written. A golden refreshed without that read pins nothing.

## Prove each pin bites

For each pin, change one line of the code it covers, run it, and see it go red
on an assertion. Put the line back and see it green again. A pin that stays
green against a changed line is rewritten or dropped. Record the line changed
and the red result in the unit's report.

## Odd behaviour is a finding

A pin that records something surprising (a wrong total, a swallowed error, an
input that crashes) stays as it is. Name the consequence as a finding in the
report, with its severity. Never fix it in unit 0: a fix inside the pinning
unit moves the baseline the later units are measured against. A fix, when
chosen, is its own unit after unit 0.

## Close unit 0

- Every pin is green and every gate the repository declares exits 0.
- Commit unit 0 on its own, green, before any change to the pinned code.
- Every later unit names unit 0 in its `depends_on`, and keeps every pin green
  unless it changes that behaviour on purpose. A pin it changes is named in its
  changed-test list with the reason.
