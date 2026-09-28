---
id: replay-v2-02
intent: test
stamp: 9b4ab247e0e0535327403bf80f0eb3c9efd81dc6 2026-09-28
reads: [AGENTS.md, docs/plans/011-replay-v2.md, evals/replay/REPLAY-v2.md, evals/replay/REPLAY-v1.md, evals/replay/v2/seeds.json, evals/replay/v2/plan/001-replay.md, evals/replay/v2/patches/base.patch, evals/replay/v2/patches/u3-p1.patch, scripts/replay/measure.mjs, scripts/replay/findings.mjs, scripts/replay/score.mjs, scripts/replay/compare.mjs, scripts/replay/protocols.mjs, test/replay/measure.test.ts, test/replay/score.test.ts, test/replay/compare.test.ts, test/replay/synth.ts, docs/specs/orchestrator-context.md, content/commands/st-work.md, .stamity/inbox.md, .stamity/learnings]
depends_on: [docs/plans/011-replay-v2.md]
---

# REPLAY-v2 — file 2: the covered-pass rule, the fix round, and the runs

This file is self-contained. It is REPLAY-v2's own package (plan 011's R5 moved the canary, the pilots and the scored
runs here when 1.10.0 was decoupled from the replay). It follows `docs/plans/011-replay-v2.md`, whose instrument
shipped in 1.10.0 at `1bd6e571`, and it ends with `evals/replay/COMPARISON-v2.md` reading a `Merge gate:` verdict for
REQ-CTX-015's floor rows: the 1.9.1 `/st-work` (baseline) against 1.10.0's context economy (changed).

## Context

The third `K-inject-baseline` canary failed on the instrument, not the product. The baseline built all six passes
staged and reviewed the whole change set in one round whose dispatch named the units by feature; `passesOf` read that
round as `[u3-p1]` and every later round as `[]`, so 10 of 12 seeds were never injected (K11 and K15 read 1 of 12) and
the `u2-p1` placement never fired (K1–K4, K6) (`review/167`). The measurement still read the run as valid at recall 4
of 11: the seeds of the five uncovered passes stayed in the denominator with presence unknown, and three of them were
credited to findings at their clean lines (`review/168`). This file decides how a feature-named review maps to passes
and how an uncovered pass's seeds count, fixes the instrument once (with `build/85`, `review/169` and `review/170`),
then runs the canary, the pilots and the scored runs, and writes the comparison.

Out of scope: any change to the context economy itself, to REPLAY-v1 (frozen, sha256 `fdee42b1…`), to the thresholds
(v1's values, key for key), and to the fixture's bytes. A FAIL is recorded; the maintainer decides between fixing the
context economy and reverting a part of it.

## Decisions (unattended, 2026-09-28; each is a declared default for the maintainer to confirm or reverse)

The session ran unattended overnight on the maintainer's instruction ("copy the message for the next session into my
clipboard to let it run overnight autonomously"). It asked no question: at each decision it took the recommended
option as the declared default, and, wherever the decision shapes what the comparison can claim, the conservative
option — never a counting or mapping rule that can overstate recall. Each is written in the run record as
"Sign-off, unattended" with its UTC stamp and ledger id.

| # | Decision |
|---|---|
| R6 | **All built, then all seeded** (`review/167`; the kickoff's question on feature-named reviews). Under v2 only (a seeds document whose seeds carry `injection`); v1's measurement is unchanged. **Built:** a pass is built once a build-role dispatch's *description* names it — every id, a range included; a dispatch's prompt is never read for this, and a description naming no pass builds nothing. **Injection point:** the first verdict-role dispatch after every pass of the plan is built. Its hook injects all six passes in one call (pass order; each worktree in its own form, §5 as today), then snapshots each pass. No other dispatch injects. **Coverage:** a verdict-role dispatch before the injection point covers nothing; at or after it, the passes its description names (every id, a range included), else every pass. A fixer covers the passes its description names, else every pass covered by verdict agents that returned by themselves before it was dispatched; a fixer before any returned review covers nothing. A build dispatch covers the passes its description names. A round covers the union of its members' coverage. **Review snapshot:** every injected pass is copied when the round holding the injection point completes; if every member of that round was stopped by TaskStop, at the next round that completes. **Credit guard:** a finding credits a seed only if its agent was dispatched at or after the injection point (a report or ledger finding takes the agent whose digest names its report; one with no such agent credits only when no verdict agent precedes the injection point). Rejected: (i) today's `passesOf` (it missed five passes in the third canary and four in v1's changed pilot); (ii) the built passes at every verdict dispatch (a mid-build review, which only the changed `/st-work` text allows, would put the built passes' seeds in front of later implementers); (iii) tree-derived (7 of 12 anchors already exist in the base tree); (iv) every pass at the first review (it seeds unbuilt passes, and a plan review would seed the base anchors in front of every implementer). |
| R7 | **An uncovered seed is never credited, and its run is invalid** (`review/168`; the kickoff's question on counting). A seed with no recorded state — its pass has no entry in `run.json`'s `injection` because the injection point never came, or its pass's entry omits it — is uncovered: never found, whatever a finding matches; RESULTS names each uncovered pass and its seeds. A baseline run invalid this way is replaced within §10's cap of 2; a changed scored run invalid only this way is not replaced, so the rows the changed shape feeds read NOT-EVALUATED and the merge gate FAILs (a changed shape that reviews less is what the replay measures). The presence-unknown rule goes for v2: a pass with an injection entry and no injection snapshot, or a seed recorded injected whose file is absent from every copy of its pass's injection snapshot, is a capture defect, and the run is invalid (a seed absent from its pass's review snapshot keeps its reading as reverted before review). The canary gains **K16** — every pass of the plan has an entry in the injection record — and passes on K5–K16. Rejected: (a) out of the denominator with the exclusion reported (it flatters the shape that reviews less, and in the third canary one injected seed would set the baseline's rate); (b) invalid and replaced in both shapes (a changed shape's skipped reviews would drop out of every row for up to two runs); (c) in the denominator as not found (it understates the shape the rule misreads and so flatters the other: the third canary would read 1 of 11 as a baseline). |
| R8 | **Branch level follows an approval** (coupled to R6). Under v2, a verdict dispatch is branch-level when its description or prompt names the whole branch (`/whole[- ]branch/i`) and it was dispatched after an approving reviewer delivery of an earlier round; every verdict agent dispatched after a branch-level one is branch-level too; the clause "after `u3-p2`'s last reviewer approval, carrying no single id" goes. Why: v1's changed pilot named its only review round "Whole-branch review round 1", so today's rule filed it branch-level — its six pass verdicts read null (a spurious verdict FAIL) and its reviewer's ~8,900 characters left the loop figure (a flattered one). Residual, named in §15: a whole-branch review dispatched before any approval (v1's baseline pilot did this beside round 3) counts as a loop round. |
| R9 | **`sec-path-traversal` keeps its fixture** (`review/170`). The clean guard (`/^[\w-]+\.pdf$/`, `evals/replay/v2/patches/u3-p1.patch:128`) admits any PDF name in the invoice directory, which the contract of record forbids (`base.patch:151-154`), so the orchestrator removed the `file` query (third attempt) or narrowed the guard (second attempt), taking the anchor with it. The seed then counts as not injected, as §5 already rules: never scored as found or missed. §15 names the cause; every run's RESULTS names each seed's state, and the run record's close compares this seed's state across the two shapes (amended 2026-09-28: the first text had the comparison name it, which no unit builds). Rejected: re-anchoring (no literal survives the rewrite without re-adding the query read; a pattern anchor is a schema change) and putting the query into the contract (it breaks v1's byte pins on `base.patch`, forces a deps re-prepare, and restates the property the seed breaks). |
| R10 | **K14 reads the run's end** (`build/85`). The protocol says what plan 011's R4 decided and the driver does: K14 reads only the run's end, once a seed has been injected — the session's final `result`, each run record as copied at the run's end (a `.md` file directly in the fixture's `.stamity/runs/` or directly inside one of its folders, `reports/` skipped), and the orchestrator's last message that carries text unless it is dated before the first injection — and fails when one of those says `BLOCKED` or `BLOCKED_<WORD>` and names the injection. The driver skips `reports/` as its end-condition reader already does. |
| R11 | **The failed record moves aside first** (`review/169`): `canaries/K-inject-baseline/` becomes `canaries/superseded-1bd6e571/K-inject-baseline/` by one directory rename, so its ignored `captures/` travels with it, before any canary re-runs. |
| R12 | **The plan's form**: plan 011 stays as written; this file carries R6–R11 and the runs. |

## Research (2026-09-28; three researchers at Opus 5.5, read-only)

- **Naming habits** (every capture recomputed with the instrument's own `passesOf`): both shapes build all six passes,
  then review the whole change set. 30 of 32 build descriptions name exactly their pass (the other two are `u0`
  units); 0 of 33 verdict descriptions name a pass; 8 of 33 verdict prompts name ids, 6 by a range and 2 in passing.
  Prompt ids mislead both ways (the third canary's fifth build prompt names the later `u3-p1`).
- **The credits.** Recomputed with the driver's own call, the third canary reads valid at 4 of 11. `sec-sql-sort` was
  credited to a free-text citation ("the `sort` allowlist is at `src/store/query.ts:15`") inside a finding about
  another seed; `con-event-key` to a real, hypothetical test-gap finding on the clean `orderId` line;
  `tw-expectation-deleted` to a finding whose locator spans the whole describe block. A never-injected
  `sec-missing-guard` read "not held", which in a baseline scored run would have exempted the changed shape.
- **K14** (`replay.mjs:1302-1321` in the private driver) already reads only the run's end, but its recursive read of
  `.stamity/runs/` also picks up the changed shape's `reports/`, which is sub-agent text.
- **The run logistics** (the private driver's README and `replay.mjs`) are in the units below; `--model` is not a
  driver flag (the model is pinned in the client's argv), `--public` belongs to `export` only, and `run` ignores an
  unknown flag silently.
- **Capacity.** The account's seven-day window read 85% during the third canary; it resets 2026-09-29T03:00Z. The
  driver holds and resumes within its own process; a killed driver voids its run.

## Spec delta

`/st-work` merges this into `docs/specs/orchestrator-context.md` at its Prove phase.

### REQ-CTX-015 — The replay, its floor, and the release gate

MODIFIED (2026-09-28, this plan's R6–R10: unattended defaults, for the maintainer's confirmation). These changes
apply under v2 only; REPLAY-v1 and its measurement stay as they are. Citations name `evals/replay/REPLAY-v2.md` by
section and `scripts/replay/measure.mjs` by function, as this plan's units leave them; their line numbers are pinned
at the merge commit, the way the 2026-09-27 re-pointing was done.

Unchanged: Scope, Scoring, Protocol first, The form per worktree, Scoring (v2) (its "covers" now reads R6's
coverage), Results (v2), Samples, Floor readings, Merge, Replay gate, Release gate.

Under **Seeds reach review (v2)**:

- **Start** (amended 2026-09-28, R6, `review/167`; it read "When the first verdict-role dispatch that covers a pass
  starts, the driver's hook injects every covered pass not yet injected, in one hook call"). A pass is *built* once
  the description of a build-role dispatch names it; every id counts, a range included. A dispatch's prompt is never
  read for this, and a description that names no pass builds nothing. The *injection point* is the first verdict-role
  dispatch after every pass of the plan is built. Its hook injects all six passes in one call, before the reviewer's
  first tool call, in pass order and in each worktree's own form, as before, and then snapshots each pass. No other
  dispatch injects. The 120-second partial-injection rule stands (REPLAY-v2 §5, Injection).
- **Covered passes** (amended 2026-09-28, R6; it read "A dispatch covers the one pass its description names, else
  the distinct passes its prompt names").
  - A verdict-role dispatch before the injection point covers nothing.
  - A verdict-role dispatch at or after the injection point covers the passes its description names (every id, a
    range included). If the description names no pass, it covers every pass.
  - A fixer covers the passes its description names. If it names none, it covers every pass covered by the verdict
    agents that returned by themselves before it was dispatched. A fixer dispatched before any review has returned
    covers nothing.
  - A round covers the union of its members' coverage.

  This coverage governs v2's injection, snapshots, rounds, verdict mapping, round-1 flag, stage, fixer round count and
  capture-defect check (REPLAY-v2 §8, Covered passes, `coverageOf`). The range reading (`passIdsIn`, `RANGE_GAP`)
  stands.
- **Snapshots** (amended 2026-09-28, R6; it read "When the first review round covering a pass completes, the driver
  copies the pass's trees again"). The review snapshot of every injected pass is taken when the round that holds the
  injection point completes. If TaskStop stopped every member of that round, it is taken when the next round
  completes.
- **Credit** (added 2026-09-28, R6). A finding credits a seed only if its agent was dispatched at or after the
  injection point. A report or ledger finding is assigned to the agent whose digest names its report; if no agent's
  digest names it, it credits a seed only when no verdict agent was dispatched before the injection point
  (REPLAY-v2 §8, Recall).
- **Branch level** (added 2026-09-28, R8, coupled to R6; REPLAY-v2 §8, Pass attribution, read "verdict dispatches
  after `u3-p2`'s last reviewer approval that carry no single id, or that match `/whole[- ]branch/i`"). A verdict
  dispatch is branch-level when its description or prompt matches `/whole[- ]branch/i` and it was dispatched after an
  approving reviewer delivery of an earlier round. Every verdict agent dispatched after a branch-level one is
  branch-level too. Residual: a whole-branch review dispatched before any approval counts as a loop round.
- **Recall** (amended 2026-09-28, R7, `review/168`, and R9, `review/170`; the bullet's text stands and these
  sentences are added).
  - *Uncovered seeds.* A seed with no recorded state is *uncovered*: its pass has no entry in `run.json`'s
    `injection`, or its pass's entry leaves it out. An uncovered seed is never found, whatever a finding matches, and
    its run is invalid. RESULTS names each uncovered pass and its seeds.
  - *Replacement.* A baseline run invalid this way is replaced within §10's cap of 2. A changed scored run invalid
    only this way is not replaced: the rows the changed shape feeds read NOT-EVALUATED, and the merge gate FAILs.
  - *Capture defect.* The presence-unknown rule is removed for v2. A pass with an injection entry and no injection
    snapshot (`captures/snapshots/<pass>/`), or a seed recorded injected whose file is absent from every copy of its
    pass's injection snapshot, is a capture defect, and the run is invalid (`injectionStatesOf`, `seedRowsOf`). A seed
    absent from its pass's review snapshot keeps its reading as reverted before review.
  - *`sec-path-traversal`.* Its fixture does not change. REPLAY-v2 §15 names why its anchor is lost: the clean guard
    admits any PDF name in the invoice directory, which the contract forbids, so orchestrators have removed the query
    or narrowed the guard. Such a seed counts as not injected, as the rule already says.
- **Canary** (amended 2026-09-28, R7 and R10, `build/85`; it read "K14: no text the run wrote says `BLOCKED` … The
  canary passes when K5 to K15 all pass", followed by the note that REPLAY-v2's K14 sentence did not yet state R4's
  third change; that note is removed).
  - *K14.* K14 reads only the end of the run, once a seed has been injected: the session's final `result`; each run
    record as copied at the end of the run (a `.md` file directly in the fixture's `.stamity/runs/`, or directly inside
    one of its folders, `reports/` skipped); and the orchestrator's last message that carries text, unless that
    message is dated before the first injection. It reads no tool input, dispatch prompt, sub-agent transcript or
    report. It fails when one of those texts says `BLOCKED` or `BLOCKED_<WORD>` and names the injection by one of the
    three existing names (the 7-character sha prefix, the neutral subject, or the path token). A run with nothing
    injected passes K14.
  - *K16.* Every pass of the plan has an entry in the injection record, in each shape.
  - The canary passes when K5 to K16 all pass (REPLAY-v2 §5, Canary).

Under **Compaction (v2)** (amended 2026-09-28, R6; it read "A round covers every pass any member names … at least
one member naming that pass returned by itself"): a round covers the union of its members' coverage, and "naming that
pass" becomes "covering that pass". The rest stands. In the As built paragraph, "K11–K15" becomes "K11–K16".

**Criteria.** Two existing criteria are MODIFIED:

- "WHEN the first review dispatch covering a pass starts" becomes "WHEN the injection point's dispatch starts".
- The `passesOf` criterion becomes: GIVEN a build-role dispatch described `Build units u1-p1..u3-p2` THEN all six
  passes are built; a description naming the list `u1-p1, u3-p2` builds those two only, and a pass named only in a
  prompt builds nothing.

ADDED:

- GIVEN six dispatches described "Build unit u1-p1" … "Build unit u3-p2", then a verdict round whose descriptions name
  the feature and no pass, WHEN the run is measured THEN the round's first dispatch is the injection point, the round
  covers all six passes, and the injection record shows each pass injected once, by that one hook call.
- GIVEN a reviewer dispatched before the injection point whose finding matches a seed's file, line and term WHEN the
  finding is scored THEN it credits no seed; the same finding from an agent dispatched at or after the injection point
  credits the seed.
- GIVEN a v2 run whose injection record has no entry for `u3-p2` WHEN the run is measured THEN `u3-p2`'s seeds are
  uncovered and never found, even when a finding matches them; the run is invalid, and RESULTS names `u3-p2` and its
  seeds.
- GIVEN a changed scored run invalid only because a seed is uncovered WHEN `compare` runs THEN the run is not
  replaced, the rows the changed shape feeds read NOT-EVALUATED, and `Merge gate:` reads FAIL.
- GIVEN a seed recorded injected whose file is absent from every copy under `captures/snapshots/<pass>/` WHEN the run
  is measured THEN the run is invalid as a capture defect, and no seed is read as presence-unknown.
- GIVEN a verdict dispatch described "Whole-branch review round 1" with no approving reviewer delivery in an earlier
  round WHEN the run is measured THEN the dispatch is pass-level and counts as a loop round.
- GIVEN a canary shape whose injection record lacks an entry for one pass WHEN the canary is checked THEN K16 fails
  and the canary fails, even when K5–K15 pass.
- GIVEN a canary where only a dispatch prompt and a report say `BLOCKED` and name `src/store/query.ts` WHEN K14 is
  checked THEN K14 passes; if the session's final `result` says `BLOCKED_FAILURE` and names an injection commit's
  7-character sha prefix, K14 fails.

File notes: four places near the top of the spec gain the plan and date (`docs/plans/011-replay-v2-02.md`,
2026-09-28): the front-matter comment, the amendment paragraph, the citation note and the References bullet.

## Strategy matrix

| Layer | Scope | What it proves | Gate placement | Planned count |
|---|---|---|---|---|
| Unit | `scripts/replay/{measure,score,compare,protocols}.mjs` | R6's coverage and credit guard, R7's uncovered rule and the not-replaced changed run, R8's branch level; v1 unchanged | per-PR (`npm run test`) | about 14 new cases |
| Protocol | `evals/replay/REPLAY-v2.md` | the §8 forbidden-terms pin, the thresholds equal to v1's, REPLAY-v1's sha256 | per-PR (`test/replay/score.test.ts`) | pins unchanged |
| Driver | the private driver's `replay.test.mjs` | injection at the injection point, snapshots, K14's read, K16, the double placement | private, before the canary | about 10 |
| Canary | K1–K16, one run per shape | the mechanics live on the pinned client | before the pilots | 2 runs |
| Pilot | 1 per shape | the fixture's calibration: baseline recall in [0.5, 0.95] | before any scored run | 2 runs |
| Scored | 3 per shape; 5 on variance (max − min found > 2) | REQ-CTX-015's floor rows | before the comparison | 6–10 runs |

## Priority outlines

- **P0.** An uncovered seed is never credited and invalidates its run; a changed scored run invalid only for that
  reads NOT-EVALUATED. A finding by an agent dispatched before the injection point credits nothing. The `Merge gate:`
  line equals `compare()` re-derived by `test/replay/compare.test.ts`.
- **P1.** A feature-named round after six build dispatches covers and injects all six passes once; its verdict counts
  for each; "Whole-branch review round 1" with no earlier approving round is pass-level. K16 fails a run with a pass
  that has no entry.
- **P2.** K14 skips `reports/`. One round covering both placements fires one compaction naming both. The review snapshot waits for a
  round whose members returned.
- **P3.** The not-run rows for Cursor, Copilot CLI and Codex, each with its reason (unchanged from plan 011).

## CI gates

| Gate | Trigger | Threshold | On failure |
|---|---|---|---|
| `npm run test` (`test/replay/**`) | per-PR | every case passes; v1's cases unchanged | block merge |
| `STAMITY_REPLAY_SUITE=1 npx vitest run test/replay` | before the instrument commit, in the lane | the chain, the injections and the oracles as stated | block the instrument commit |
| The private driver's `replay.test.mjs` | before the instrument commit | every case passes | block the canary |
| `node replay.mjs status --canary <id>` | after each canary | exit 0, K5–K16 | one fix round, then one more; after that the runs stop (tonight's rule) |
| `node scripts/replay/score.mjs check --protocol v2 --runs …` | after each exported run | exit 0 | the run is replaced within the cap, or the rows read NOT-EVALUATED |
| `evals/replay/COMPARISON-v2.md` `Merge gate:` | before the release that first ships it (Package 17's) | `PASS` | recorded; the maintainer decides between fixing the context economy and reverting part of it |

**Uncovered, and why:** Cursor, Copilot CLI and Codex are not replayed (the driver runs Claude Code only; the not-run
rows say so). A run's wall time gates nothing. The eval-set floors are the eval run's, not the replay's (carried). The
matcher's precision residuals (the follow-ups below) are not fixed here: they are symmetric in rule, and the one
measured instance (a free-text citation read as its own finding) favours the free-text shape, the baseline.

## Shared contracts (census before parallel edits)

| # | Contract | Writers, in order | Readers |
|---|---|---|---|
| S1 | `UNCOVERED_REASON`, the leading text of an uncovered pass's invalid reason, exported from `scripts/replay/protocols.mjs` | `v2-uncovered` | `measure.mjs`, `score.mjs` (`NOTE_ROWS`, `checkRuns`), `compare.mjs` (`sampleOf`), the private driver's K16 evidence |
| S2 | `coverageOf`, the R6 rule, exported from `scripts/replay/measure.mjs`; the driver imports it from `--repo` at run time as it imports `passesOf` today (`markers.mjs:19-25`) | `v2-coverage` | `joinAgents` and the recall guard in `measure.mjs`; the private driver's `marker-hook.mjs`, `markers.mjs`, `replay.mjs` |
| S3 | `scripts/replay/measure.mjs` and `test/replay/measure.test.ts` | `v2-uncovered`, then `v2-coverage` (one writer at a time) | — |
| S4 | `evals/replay/REPLAY-v2.md` | `v2-protocol-text` only | the reviewers of every unit; `test/replay/score.test.ts`'s pins |
| S5 | The instrument commit | fixed when `v2-reset` points the pinned checkout at it; frozen at the first pilot. After that nothing under `scripts/replay/` or `evals/replay/` changes except exported runs and the comparison, or the pilots restart | every run |

## Units

### v2-uncovered — an uncovered seed is never credited, and its run is invalid (R7; review/168)

| Field | Content |
|---|---|
| `id` | v2-uncovered |
| `requirements` | REQ-CTX-015 |
| `files` | `scripts/replay/protocols.mjs`, `scripts/replay/measure.mjs`, `scripts/replay/score.mjs`, `scripts/replay/compare.mjs`, `test/replay/measure.test.ts`, `test/replay/score.test.ts`, `test/replay/compare.test.ts` |
| `interfaces` | **`protocols.mjs`**: `export const UNCOVERED_REASON = 'uncovered pass'` (the leaf module keeps importing nothing from `scripts/replay/`). **`measure.mjs`**: `injectionStatesOf` (today `:1071-1095`) checks, under v2, every seed of the seeds document against the record: a pass with no entry adds the invalid reason `` `${UNCOVERED_REASON} ${pass}: no review dispatch covered it, so its seeds (${ids}) were never injected` ``; a seed missing from its pass's existing entry adds `injection record: pass ${pass} omits seed ${id}`. `seedRowsOf` (today `:1110-1147`) files an uncovered seed as `{ found: false, foundRound1: false, stage: null, present: null }` with a note naming it, and never lets a match credit it. The presence-unknown branch goes under v2: a pass with an injection entry and no injection snapshot (`captures/snapshots/<pass>/`), or a seed recorded injected whose file is absent from every copy of its pass's injection snapshot, adds a capture-defect invalid reason; a seed absent from its pass's review snapshot keeps its reading as reverted before review. **`score.mjs`**: `NOTE_ROWS` (today `:77-95`) files the uncovered note beside `pooled-recall` and `security-seeds`; `checkRuns` (today `:694`, `:701-704`) reports a changed scored run invalid only for an uncovered pass as not replaced. **`compare.mjs`**: `sampleOf` (today `:95-115`) treats a changed scored run whose every invalid reason begins with `UNCOVERED_REASON` as exhausting the shape's replacements, so every row it feeds reads NOT-EVALUATED; a helper beside the notes writer names that reason in the comparison. A baseline run invalid this way is replaced as today |
| `testCriteria` | (a) The third canary's shape — one reviewer "Review round 1" whose prompt names only `u3-p1`, a free-text Critical citing "the `sort` allowlist is at `src/store/query.ts:11`", snapshots for `u3-p1` (clean query) and `u3-p2` only, no `u1-p1` entry — reads invalid with one reason beginning `uncovered pass u1-p1` and naming `sec-sql-sort`, `sec-sql-sort` not found and not held, pooled found 0; seen red on today's code, which reads it valid with the seed found. (b) A pass entry omitting a seed is invalid. (c) A changed scored run invalid only for an uncovered pass leaves nine rows NOT-EVALUATED and the gate FAIL (`compare.test.ts`). (d) The note renders beside `pooled-recall` and `security-seeds`, and `check` names the not-replaced run (`score.test.ts`). (e) Green before and after: a full record leaves nothing uncovered; a baseline run invalid this way is replaced; a changed run invalid for another reason too is replaced; every v1 case passes unedited. (f) A seed recorded injected whose file is absent from every copy of its pass's injection snapshot, and a pass with an injection entry and no injection snapshot, each read invalid as a capture defect, and no seed reads presence-unknown |
| `edgeCases` | A v1 seeds document (no `injection`) never takes the rule. A seed recorded `not injected (anchor missing)` keeps today's reading (it leaves the denominator and holds `security-seeds`). A seed reverted before review keeps today's reading |
| `depends_on` | none |
| `verify` | `npx vitest run test/replay && npm run lint && npm run typecheck` |

### v2-coverage — all built, then all seeded; branch level follows an approval (R6, R8; review/167)

| Field | Content |
|---|---|
| `id` | v2-coverage |
| `requirements` | REQ-CTX-015 |
| `files` | `scripts/replay/measure.mjs`, `test/replay/measure.test.ts`, `test/replay/synth.ts` |
| `interfaces` | **`coverageOf(events, planPasses)`**, exported beside `passesOf` (today `:379-381`), pure and causal (an event's result depends only on the events before it), so the driver's hook can call it on its marker log's prefix and the measurement on the whole run. `events` is the run's time-ordered list of `{ kind: 'dispatch', id, role, description, prompt }` and `{ kind: 'stop', id, returned }` (`role` is `roleFunction`'s value; `returned` is false for a TaskStop). It returns, per dispatch id, `{ built, passes, injectionPoint }`: `built` is the pass ids a build-role description names (`passIdsIn(description, true)`, today `:353-366`; never the prompt); `injectionPoint` is true for exactly the first verdict-role dispatch after every pass of `planPasses` is built; `passes` is R6's coverage (verdict: none before the injection point, else the description's passes (every id, a range included) or all; fixer: the description's passes, else every pass covered by verdict agents that returned before it; build: the description's passes; other roles: none). JSDoc names the event shape so the driver mirrors it. **Where it is read, under v2 only** (the `ranges` flag at today's `:1237` becomes a v2 flag): `joinAgents` (today `:626-735`) sets each agent's `passes` from `coverageOf`; `attributePass` and `passesOf` stay for v1. `sharePass` (today `:391`) loses its fallback of comparing `pass` values. The round count (today `:733-735`) reads the new coverage. `matchByPass` (today `:994`) keys a finding by `f.passes.length === 1 ? f.passes[0] : '*'` (identical under v1). **Branch level (R8, v2):** a verdict dispatch whose description or prompt matches `/whole[- ]branch/i` and that was dispatched after an approving reviewer delivery of an earlier round is branch-level, and so is every verdict agent dispatched after it; the `u3-p2` last-approval clause (today `:725-731`) applies to v1 only. **Credit guard (R6):** `seedRowsOf` credits a seed only from a finding whose agent was dispatched at or after the injection point; a report or ledger finding takes the agent whose digest names its report, and one with no such agent credits only when no verdict agent precedes the injection point. `injectionStatesOf` returns the recorded passes for the guard |
| `testCriteria` | (a) A table test of `coverageOf` over reduced texts of the third canary (six "Build unit uX-pY" dispatches, then "Review round 1" whose prompt names `u3-p1` in passing: the injection point, covering all six) and of v1's changed pilot ("Whole-branch review round 1": all six); the build descriptions `Build units u1-p1..u3-p2` (all six built), `Build u1-p1, u3-p2` (those two) and a pass named only in a prompt (none built). (b) A feature-named capture: every pass reads `approve-after-fixes` over 2 rounds, and a lens's find counts in round 1 at the pass stage. (c) A finding by an agent dispatched before the injection point credits nothing, even on a base-anchored seed. (d) A pass-less fixer dispatched before any review does not raise the lenses' round. (e) A finding by an agent whose prompt names one pass in passing matches every covered pass's spans. (f) Branch level both ways: "Whole-branch review round 1" with no earlier approving round is pass-level (its verdict counts for six passes and its characters count in the loop); a whole-branch review after an approving round, and every verdict agent after it, is branch-level. (g) Every v1 case, `V1_PILOT_TEXTS` included, passes unedited. Cases (a), (b) and (c) are seen red on the code `v2-uncovered` leaves |
| `edgeCases` | A verdict dispatch before or between builds (a plan review, an amended-cell read) covers nothing and credits nothing. "Build u1-p1 and u1-p2" builds both. A `u0` build or a feature-named build builds nothing; a plan pass never named leaves the injection point unreached, so every pass is uncovered and the run is invalid (`v2-uncovered`). A build prompt naming a later pass is ignored. A BLOCKED implementer still counts as built. A SendMessage re-review is no dispatch: it keeps the resumed agent's coverage and injects nothing. Seeds of two passes in one file go in in pass order |
| `depends_on` | v2-uncovered |
| `verify` | `npx vitest run test/replay && npm run lint && npm run typecheck` |

### v2-protocol-text — REPLAY-v2.md states R6–R10 before its first result

| Field | Content |
|---|---|
| `id` | v2-protocol-text |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/REPLAY-v2.md` |
| `interfaces` | No v2 result exists, so these are amendments; the file freezes at the first pilot (§13, §14). **Intro bullets** (today `:14-15`): the seeds arrive at the first review after the build phase. **§5 Injection** (today `:103-137`): R6's built rule, the injection point, all six passes in one hook call, and the injection snapshot after all six; **the review snapshot** (today `:139-147`) at the completion of the round holding the injection point (the TaskStop rule); a new paragraph for R7's uncovered seed ("A seed of an uncovered pass … is uncovered, which is not the same as not injected: no finding can find it, and its run is invalid (§8, §10)"); **the canary** (today `:163-174`): K14 per R10 (the clause "the run does not end blocked over the injection (K14)", and a sentence saying what K14 reads, as R10 states), K16 added, "The canary passes when K5 to K16 all pass". **§7** (today `:246-256`): a round covers the union of its members' coverage under §8's rule. **§8**: pass attribution and branch level (today `:276-278`) per R8 for v2; covered passes (today `:279-291`) replaced by R6's rule, v1 keeping its reading; Recall (today `:306-322`): the presence-unknown sentences replaced by R7's three readings of the injection record and the uncovered seed, plus R6's credit guard; Verdicts (today `:332-337`) worded over the new coverage; Invalid run (today `:340-342`) adds the uncovered seed and the capture defect and keeps the three forbidden terms (`seeds.json`, `__oracle__`, `reference-fixes`) in its sentence. **§10**: a run with an uncovered pass is invalid; a baseline run is replaced; a changed scored run invalid only for that is not. **§12**: an uncovered seed enters no pooled denominator. **§15**: the third canary's lesson (R7); seeds appear at the first review after the build phase in both shapes, and a review between builds sees clean code (R6); a whole-branch review before any approval counts as a loop round (R8); the review snapshot is taken 2–4 s after its round closes, so a fixer faster than that would read a found seed as reverted; `sec-path-traversal`'s anchor loss and its cause (R9). The `replay-thresholds` block does not change by a byte. Cite functions, not line numbers, for code the other units move |
| `testCriteria` | (a) `npx vitest run test/replay/score.test.ts` passes: the §8 pin finds every `ALWAYS_FORBIDDEN` term, and the thresholds block deep-equals v1's. (b) `shasum -a 256 evals/replay/REPLAY-v1.md` prints `fdee42b1…`. (c) `grep -c "K5 to K16" evals/replay/REPLAY-v2.md` prints 1 or more, and `grep -c "Presence is unknown" evals/replay/REPLAY-v2.md` prints 0. (d) `node scripts/leak-gate.mjs` prints PASS |
| `edgeCases` | `REPLAY-v1.md` is never touched. A sentence that would need a code line number cites the function instead |
| `depends_on` | none (its text is this file's; the review round checks it against `v2-uncovered` and `v2-coverage` as built) |
| `verify` | `npx vitest run test/replay/score.test.ts test/replay/seeds-v2.test.ts; echo exit=$?` and `node scripts/leak-gate.mjs; echo exit=$?` |

### v2-driver-coverage — the private driver injects at the injection point and checks K16 (private layer)

| Field | Content |
|---|---|
| `id` | v2-driver-coverage |
| `requirements` | REQ-CTX-015 |
| `files` | The private layer's replay driver (`runs/package-16/replay/driver/`): `marker-hook.mjs`, `markers.mjs`, `replay.mjs`, `replay.test.mjs`, `README.md` |
| `interfaces` | **`marker-hook.mjs`**: loads `coverageOf` from `--repo`'s `measure.mjs` beside `passesOf` (today `:109`); builds the event list from the marker log and sets each marker line's `passes` from `coverageOf` (today `:128-141`); on the verdict-role PreToolUse that `coverageOf` marks as the injection point, injects every pass of the plan once, in pass order, then snapshots each pass (today `:136` injects `line.passes`), all within the hook's 120 s budget. **`markers.mjs`**: the import (today `:19-25`); `injectPasses` injects every pass first, then snapshots (today `:682-692`; it already skips recorded passes at `:683`); `namedPasses` and `reviewRounds` (today `:214`, `:227-251`) read the new coverage; a new `injectionRoundReturned` beside `reviewRoundReturned` (today `:254-264`). **`replay.mjs`**: the review snapshot (today `:926-937`) at the completion of the round holding the injection point, deferred to the next completed round when every member was TaskStopped; the placements (today `:939-958`) read the new coverage; one round covering both placement passes fires one forced compaction whose record names both in `covers`, as the driver already does (amended 2026-09-28 before dispatch: the first text asked for two compactions in sequence); K3's pass test (today `:1363-1365`) reads the coverage; K11's evidence names the injection point and any pass never built; K12 reads "each injected pass"; K14 (today `:1302-1321`) skips `reports/`, as the end-condition reader does (`markers.mjs:336-360`); K16 (new, in `injectionChecks`, today `:1268-1336`) passes when every pass of the plan has an injection entry and lists the passes with none, naming `UNCOVERED_REASON`'s wording; the v2 status gate (today `:1404`, `:1417`) reads K5–K16; v1's gate and output stay byte-identical. **`README.md`**: the rule, K16 and the gate |
| `testCriteria` | (1) No injection at a verdict dispatch before six build markers, whatever its prompt names (a range included). (2) After six "Build unit uX-pY" markers, "Review round 1" naming only `u3-p1` injects all six passes in one call, and its marker's `passes` are six (the third canary reproduced). (3) A build marker's `passes` are its description's ids ("Implement u0 lint scope fix" → `[]`; "Build u1-p1 and u1-p2" → both). (4) `snapshots/u1-p1/` of that call holds `u3-p2`'s seeded text. (5) The review snapshot of every injected pass is taken when the injection round completes; an all-TaskStopped round defers it. (6) A pass-less fixer after a returned by-feature round records six passes; one before any returned verdict records `[]`. (7) K11's evidence names the injection point. (8) Five passes with entries and 10 of 12 seeds injected passes K11 and fails K16. (9) K14 ignores a `BLOCKED` line in `reports/` and in a dispatch prompt, and fails when the session's final `result` says `BLOCKED_FAILURE` and names an injection commit's 7-character sha prefix. (10) One round covering both placement passes fires one forced compaction whose record names both. (13) The injection record names how long the six-pass injection and its snapshots took, and a six-pass fixture stays within the hook's 90 s injection budget. (11) Under `--protocol v1`, `status` prints byte-identically on v1's canary fixtures. (12) The private hygiene gate prints PASS with exit 0 |
| `edgeCases` | A SendMessage re-review injects nothing. A hook that would exceed its budget records a partial injection and marks the run invalid (as today); where six full copies per worktree would put the budget at risk, each worktree is copied once and cloned for the other passes (an APFS `cp -c` clone, never a symlink). Seeds of two passes in one file (`src/orders/handlers.ts`, `u3-p1` and `u3-p2`) go in in pass order, with one snapshot after both |
| `depends_on` | v2-uncovered, v2-coverage |
| `verify` | From the private checkout: `STAMITY_REPO=<a public checkout holding both units> node --test runs/package-16/replay/driver/replay.test.mjs; echo exit=$?`, then `node scripts/repo-hygiene.mjs --kind governance --base <base sha>; echo exit=$?` |

### v2-reset — the failed record aside, the instrument pinned, both shapes prepared (R11; review/169)

| Field | Content |
|---|---|
| `id` | v2-reset |
| `requirements` | REQ-CTX-015 |
| `files` | The private layer's `runs/package-16/replay/canaries/superseded-1bd6e571/K-inject-baseline/` (moved); the replay home's `~/.stamity-replay/superseded-1bd6e571/` (moved shapes) and `~/.stamity-replay/shapes/` (new); the pinned instrument checkout `…/.stamity-worktrees/stamity/p16s2-instrument` (switched) |
| `interfaces` | The **instrument commit** `N` is the package branch head once every public unit has landed, the review loop has converged and the gate of record is green. In order: (1) no `~/.stamity-replay/run.lock`; (2) in the private checkout, `mkdir runs/package-16/replay/canaries/superseded-1bd6e571` and `git mv runs/package-16/replay/canaries/K-inject-baseline runs/package-16/replay/canaries/superseded-1bd6e571/K-inject-baseline` (one directory rename, so the ignored `captures/` travels), then a signed commit and the private hygiene gate; (3) `mv ~/.stamity-replay/shapes ~/.stamity-replay/superseded-1bd6e571` (`bin/`, `client.json` and `deps/` stay); (4) `git -C <instrument> switch --detach N`, with `evals/replay/` and `scripts/replay/` clean there; (5) from the driver folder: `node replay.mjs prepare --shape baseline --cli-ref fed39ac --instrument-commit N --repo <instrument> --protocol v2`, then `--shape changed --cli-ref N`. The changed shape's CLI is 1.10.0's source at `N` |
| `testCriteria` | The old folder is gone; the moved folder holds 103 files; `git status --porcelain --ignored=matching` there shows 4 renames and one ignored `captures/` at the new path; both prepares exit 0 and both shape records name `N` |
| `edgeCases` | A lock present: wait for its holder. A dirty instrument checkout: refused, never cleaned by force. `git worktree remove` is never used on a lane holding ignored captures |
| `depends_on` | v2-uncovered, v2-coverage, v2-protocol-text, v2-driver-coverage |
| `verify` | `ls ~/.stamity-replay/shapes/baseline.json ~/.stamity-replay/shapes/changed.json` and `git -C <instrument> rev-parse HEAD` equal to `N` |

### v2-canary — K5–K16 in both shapes; the mechanism decided

| Field | Content |
|---|---|
| `id` | v2-canary |
| `requirements` | REQ-CTX-015 |
| `files` | The private layer's `runs/package-16/replay/canaries/K-inject-baseline/` and `K-inject-changed/` (`record.md`, `record.json`, `run.json`, `marker-settings.json`; `captures/` ignored) |
| `interfaces` | One run at a time, with no full test suite and no docs-site build on the machine while it runs: `node replay.mjs canary --id K-inject-baseline --shape baseline --units u1-p1,u1-p2,u2-p1,u2-p2,u3-p1,u3-p2 --placements u2-p1 --repo <instrument> --config-dir ~/.claude-alt --protocol v2` (no `--mechanism`), then `node replay.mjs status --canary K-inject-baseline`; the same for `K-inject-changed` with `--shape changed`. The runner's notes per record: each pass's injection form, each seed's state (`sec-path-traversal`'s named), the unit tests an injection turned red (`review/89`), and each placement's at-risk count (`review/138`). **Mechanism:** interrupt when both records pass K1–K4, else both shapes run `auto-window` (§7) |
| `testCriteria` | Both `status` commands exit 0 with K5–K16 passing; each record names the mechanism it decided and the instrument commit |
| `edgeCases` | A failed canary gets one fix round (the failed record moved to `superseded-<commit>` first, a new instrument commit, both shapes re-prepared), and one more if it fails again; after that the runs stop and each failure is recorded with its cause. A changed canary cannot run until the baseline canary passes (the driver needs both records only for `run`) |
| `depends_on` | v2-reset |
| `verify` | `node replay.mjs status --canary K-inject-baseline; echo exit=$?` and `node replay.mjs status --canary K-inject-changed; echo exit=$?` |

### v2-pilots — one pilot per shape at the frozen instrument

| Field | Content |
|---|---|
| `id` | v2-pilots |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/v2/runs/<date>-replay-1/` and `-2/` (`RESULTS.md`, `summary.json`, exported and committed from the main checkout by path); the private layer's `runs/package-16/replay/v2/runs/<id>/` (never `captures/`) |
| `interfaces` | The instrument freezes when the first pilot starts. `node replay.mjs run --shape baseline --kind pilot --run-id <UTC date>-replay-1 --placements u2-p1,u3-p1 --mechanism <the canary's> --repo <instrument> --config-dir ~/.claude-alt --protocol v2`, then `node replay.mjs export --run-id <id> --public <main checkout> --protocol v2`; the changed pilot as `-replay-2` |
| `testCriteria` | `node scripts/replay/score.mjs check --protocol v2 --runs <both pilots>; echo exit=$?` exits 0; the baseline pilot's pooled recall lies in [0.5, 0.95]; each pilot records every seed's state |
| `edgeCases` | Recall out of band: the seeds must be re-cut, which restarts the pilots under a new instrument commit (tonight: recorded, and the runs stop). An invalid run is replaced, at most twice per shape |
| `depends_on` | v2-canary |
| `verify` | `node scripts/replay/score.mjs check --protocol v2 --runs <paths>; echo exit=$?` and `node scripts/leak-gate.mjs; echo exit=$?` |

### v2-scored — three scored runs per shape and the comparison

| Field | Content |
|---|---|
| `id` | v2-scored |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/v2/runs/<date>-replay-3/` onwards; `evals/replay/COMPARISON-v2.md` |
| `interfaces` | Three scored runs per shape, alternating shapes, one at a time, under the frozen instrument and mechanism, each exported and committed by path; two more for a shape whose three differ by more than 2 seeds found. Invalid runs are replaced within the cap; a changed scored run invalid only for an uncovered pass is not (R7). Then `node scripts/replay/score.mjs compare --protocol v2 --out evals/replay/COMPARISON-v2.md` |
| `testCriteria` | `test/replay/compare.test.ts` re-derives `compare()` over the committed v2 runs and equals the committed file's rows and `Merge gate:` line; `node scripts/replay/score.mjs check --protocol v2 --runs <all v2 runs>` exits 0; the leak gate prints PASS; the comparison names the instrument commit and the protocol sha256 |
| `edgeCases` | More than 2 invalid runs in a shape: its rows read NOT-EVALUATED and the gate FAILs. A FAIL is recorded with each failing row's evidence and neither fixed nor reverted in this package |
| `depends_on` | v2-pilots |
| `verify` | `node scripts/replay/score.mjs check --protocol v2 --runs <all v2 runs>; echo exit=$?`, `npx vitest run test/replay/compare.test.ts; echo exit=$?`, `node scripts/leak-gate.mjs; echo exit=$?` |

## Execution order

1. `v2-uncovered`, then `v2-coverage` (one writer on `measure.mjs`); `v2-protocol-text` beside them.
2. `v2-driver-coverage` (private) once `v2-coverage` has landed.
3. The review loop over the four units, the spec delta merged, the gate of record: then the instrument commit `N`.
4. `v2-reset`, then `v2-canary`.
5. `v2-pilots`, then `v2-scored` and the comparison, back to back, unattended.

No full suite, docs-site build or eval run shares the machine with a live replay run.

## Risks

| Risk | Severity | Guard |
|---|---|---|
| The changed shape has never run a v2 canary; a build description that names no pass leaves the injection point unreached | Warning | K11 and K16 in its canary; the fix rounds; R7 makes such a scored run invalid, never a quiet score |
| Both placements fall due at the round holding the injection point | Minor | the driver fires one forced compaction naming both (its existing rule); `compaction-loss` needs one valid changed sample |
| Six passes injected and snapshotted in one hook call run past the 90 s injection budget | Warning | the driver times the injection and clones a worktree's copy per pass where needed; a partial injection voids the run, and the canary would show it |
| The account's usage window runs out during the runs | Warning | the driver's capacity hold resumes within its process; no login switch while a run is prepared, running or held |
| An account-synced skill changes mid-campaign, so a run's init lists differ from its pilot's | Warning | no account or skill change during the runs; a drifted run is invalid and replaced within the cap |
| The loop-character bar is tight (v1's pilots read 13,341 against 0.5 × 24,703) | Minor | none needed: the comparison reports it; a FAIL goes to the maintainer |
| A whole-branch review before any approval counts as a loop round | Minor | named in §15 |
| A fixer within 2–4 s of the injection round's close reads a found seed as reverted | Minor | named in §15; the third canary's fixer came 21 s after |
| A seed anchor is rewritten (`sec-path-traversal`) | Minor | R9: not injected, never scored; K11's floor stays 10 of 12 |

## Open questions

None. Every decision above was taken unattended as its declared default and waits for the maintainer's confirmation.

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

- A survival floor for not-injected and reverted seeds in scored runs (today bounded only in the canary, K11 and K15).
- Matcher precision: a free-text citation inside another finding read as its own finding; the static span used on a
  tree that never held the seed; terms that name the guard a seed removes; a locator spanning a whole describe block.
- A `security-seeds` exemption that requires the seed to have been present at review.
- The symmetric variant of R7, where a baseline run invalid for an uncovered pass is not replaced either.
