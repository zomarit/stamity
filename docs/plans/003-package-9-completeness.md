---
id: package-9-completeness
intent: feature
stamp: b8928d3 2026-09-09
reads: [content/commands/st-work.md, content/commands/st-board.md, content/commands/st-plan.md, content/commands/st-rework.md, content/commands/st-pr-resolve.md, content/skills/st-qa/SKILL.md, test/corpus/commands/work.test.ts, test/corpus/commands/board.test.ts, test/corpus/commands/plan.test.ts, test/corpus/commands/feedbackPair.test.ts, test/evals/locators.test.ts, test/evals/support.ts, evals/SET-v4.md, evals/rubric-v4.md, evals/cases-v4, evals/runs/2026-09-07-run-7/RESULTS.md, evals/runs/2026-09-07-run-7/samples.jsonl, .stamity/runs, .stamity/overrides/skills/st-eval-run/SKILL.md, CONTRIBUTING.md, docs/getting-started.md, docs/working-with-stamity.md, scripts/leak-gate.mjs, .stamity/learnings]
depends_on: [docs/plans/002-package-8-closeout.md]
---

# Package 9 — completeness

## Context

Every earlier package closed carrying something, and the residue was never collected: fourteen run
ledgers under `.stamity/runs/` hold 83 `deferred` rows and 61 rows still `open` (59 of them in the two
2026-09-01 ledgers, whose fixes landed in the review of PR #10 and the closure run, and two QA-checkpoint
rows open by the qa skill's own instruction); the deferral inbox the work, plan, rework, pr-resolve and
board commands name as the deferral home was never written; the private register calls 41 clauses
"carried"; run 7 is red on two of four metrics under the strict rule with seven cases named and eight
advisory two-run repeats owed a reviewed diff; the QA sign-offs of the last two records are driven and
captured but unsigned. None of it is a regression. This package collects it, retires it to zero with one
line per item, decides every reserved question as one numbered batch put to the maintainer, and wires
the close step so the residue cannot regrow silently. Out of scope: Package 7 and the L1/L2/L3 lanes
(each gets a written trigger and an owner, nothing more), any release, any merge, any threshold move.

**Decisions, each with the reading taken and the reading dropped**, in the question protocol's words.

- *Assumption taken:* the residue sweep, the mechanism build and the eval slice run through the
  explicit-model-id lane (the workflow harness of record), because the kickoff prompt of record binds
  every agent to an explicit id and the agent tool dispatches by tier alias only. Dropped: alias
  dispatch with post-hoc attestation, which the record calls inadmissible.
- *Assumption taken:* the retirement of a ledger row is an added `retired` line on the row, dated and
  naming the disposition; the row's recorded `state` is not rewritten except where it was never true —
  the two 2026-09-01 ledgers' stale `open` rows move to the state the tree proves. Dropped: appending a
  second row per retirement, which the ledger grammar's converge-by-id rule forbids.
- *Assumption taken:* the gate against regrowth is deterministic in this repository's own suite (a test
  over every committed ledger and the inbox's grammar) and prose in the shipped process text; an engine
  doctor probe in `check` is a product feature the batch asks about rather than builds unasked.
- *Assumption taken:* the register's one HOLD row is scheduled to L2 — its recheck trigger is a client
  event, which is L2's own trigger. Dropped: L1, whose trigger is a usage window unrelated to the recheck.
- Every other reserved decision — the QA signatures, the seven red cases, the eight advisory repeats,
  the survivors of the sweep, the sigstore major bump's review, the two review notes — reaches the
  maintainer as one numbered batch with declared defaults, and each answer becomes a decision row in
  the private layer. Nothing is decided here by the plan.

## Spec delta

None. `docs/specs/` carries three `status: design` documents whose requirement families none of these
units implements. Every unit states `spec carries no ids`.

## Units

### U1 · `close-step-inbox-append` — the work run's close appends what it deferred; the board census counts it

**id** `close-step-inbox-append` · **requirements** spec carries no ids · **depends_on** none
**files** `content/commands/st-work.md`, `content/commands/st-board.md`, `test/corpus/commands/work.test.ts`,
`test/corpus/commands/board.test.ts`, `evals/cases-v4/golden/work-proof-block-fields.md` (its `source`
range, the re-inlined governing block, the claim and one new binding criterion), every case whose
`source` range in `content/commands/st-work.md` shifts, `evals/SET-v4.md` (the case-index rows those
moves invalidate, and the dated "Package 9 repairs" section they open), `test/evals/roster.test.ts`
(new — the gate that derives those rows), the emitted copies under `.claude/` and `.apm/` (the only projections this tree carries: the
manifest's tools are `["claude"]`) and the manifest through the dogfood sync, both golden ledgers.
**verify** `npx vitest run test/corpus test/evals && npm run build && node dist/cli.js check`

**Interfaces.** The proof block's run-exit paragraphs gain one paragraph: at exit every `deferred` row is
appended to `.stamity/inbox.md` in the board's declared grammar with a `Ref:` to the ledger row; a ledger
row gains its `retired` line only when its inbox row leaves; an `open` row in a committed ledger is a gate
failure; the `Not done:` list is empty or names the scheduled item each line became. The board's
`## Deferral inbox` census names the fifth writer and the completeness pass as a removal path.

### U2 · `ledger-gate` — a deterministic gate over every committed ledger and the inbox

**id** `ledger-gate` · **requirements** spec carries no ids · **depends_on** U1 (the grammar it enforces)
**files** `test/records/ledgers.test.ts` (new), fixtures inline
**verify** `npx vitest run test/records && npm run lint && npm run typecheck`

**Interfaces.** Over every `ledger.jsonl` git tracks under `.stamity/runs/`: rows parse with the seven
fields; `state` is one of `fixed`, `deferred`, `rejected`, `closed`; no row reads `open`; a `deferred` row
carries a non-empty `rationale` and either a dated `retired` line or an inbox row whose `Ref:` names it.
`.stamity/inbox.md` exists and every bullet parses under the board grammar. Red fixtures prove the gate
fails on an `open` row and on an unaccounted `deferred` row. The tree itself reads red until U4 lands the
retirements, and the unit reports the count rather than weakening the assertion.

### U3 · `eval-instrument` — the batch's eval answers, as case diffs and a slice run

**id** `eval-instrument` · **requirements** spec carries no ids · **depends_on** the batch
**files** `evals/SET-v4.md` (extending the "Package 9 repairs" section U1 opens), the case files the
answers name, `evals/README.md`
if a count moves, `evals/runs/2026-09-09-run-8/`
**verify** the eval locator and coverage gates; calibration 5/5 before any score; every attested id

### U4 · `records` — the inbox emptied, the ledgers retired, the run record (orchestrator-owned)

**id** `records` · **requirements** spec carries no ids · **depends_on** the sweep's verdicts, the batch
**files** `.stamity/inbox.md`, the fourteen ledgers, `.stamity/runs/2026-09-09_package-9/` (ledger, record,
`inbox-retirements.md`), the two records whose QA sign-off the batch closes
**verify** `npx vitest run test/records && npm run gate`
