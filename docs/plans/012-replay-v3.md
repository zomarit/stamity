---
id: replay-v3
intent: test
stamp: 5fe507092e251007db83528f4413a60b84a61d46 2026-09-29
reads: [AGENTS.md, evals/replay/REPLAY-v2.md, evals/replay/REPLAY-v1.md, docs/plans/011-replay-v2.md, docs/plans/011-replay-v2-02.md, evals/replay/v2/seeds.json, evals/replay/v2/plan/001-replay.md, evals/replay/v2/patches/base.patch, evals/replay/v2/patches/u1-p1.patch, evals/replay/v2/patches/u1-p2.patch, evals/replay/v2/patches/u2-p1.patch, evals/replay/v2/patches/u2-p2.patch, evals/replay/v2/patches/u3-p1.patch, evals/replay/v2/patches/u3-p2.patch, evals/replay/v2/oracle/oracles.patch, evals/replay/v2/oracle/reference-fixes.patch, evals/replay/v2/runs/2026-09-28-replay-1/RESULTS.md, scripts/replay/fixture.mjs, scripts/replay/measure.mjs, scripts/replay/findings.mjs, scripts/replay/transcript.mjs, scripts/replay/score.mjs, scripts/replay/compare.mjs, scripts/replay/protocols.mjs, scripts/replay/oracle.mjs, scripts/replay/summary.mjs, test/replay/measure.test.ts, test/replay/fixture.test.ts, test/replay/synth.ts, docs/specs/orchestrator-context.md, .stamity/runs/2026-09-28_replay-v2/record.md, .stamity/inbox.md, .stamity/learnings]
depends_on: [docs/plans/011-replay-v2-02.md]
---

# REPLAY-v3 — seeds the units apply themselves, no clean copy within review's reach, a symmetric reader

This file is self-contained. It builds a new replay protocol, REPLAY-v3, runs its canaries, pilots and scored runs,
and ends with `evals/replay/COMPARISON-v3.md` reading a `Merge gate:` verdict for REQ-CTX-015's floor rows: the 1.9.1
`/st-work` (baseline) against 1.10.0's context economy (changed). REPLAY-v1 and REPLAY-v2 are frozen and never change.

## Context

REPLAY-v2's instrument held: both canaries passed K1–K16 at `c6b686df`. Its baseline pilot `2026-09-28-replay-1`
then fell outside the calibration band. The orchestrator restored 8 of the 10 injected seeds before review, so recall
read 2 of 2. Every v2 orchestrator saw the seeds as foreign edits. The units' own tests went red seconds after the
implementers reported green, nine files' times jumped to the same second, the staged form left dangling index blobs,
and a file one unit had not touched appeared in the change set. Round-1 reviewers also read the tree against the
clean `vendor/contrib` patches, so every surviving seed showed as a deviation (the baseline canary found 10 of 10 in
round 1). And the finding reader read structured findings one locator per entry while it read free text one finding
per locator, which understated the changed shape (7 of 10 against 10 of 10).

REPLAY-v2's protocol froze when its first result appeared, so this file writes REPLAY-v3. Its seeds arrive inside the
units' own patches, one pass at a time, so each implementer applies its own seeds as its own work. No clean copy of
the intended code stays within review's reach. The reader treats both shapes' findings alike. The thresholds (v1's,
key for key), the calibration band, the samples, the pins and the invocation bytes do not change.

Out of scope: any change to the context economy; REPLAY-v1, REPLAY-v2 and their data; the thresholds; the clients other
than Claude Code. A FAIL is recorded, and the maintainer decides between fixing the context economy and reverting a
part of it.

## Decisions (the maintainer, 2026-09-29, through the question tool, one per turn)

| # | Decision |
|---|---|
| D1 | **Seeded patches, per pass** (08:22Z). The fixture's `vendor/contrib/<pass>.patch` files are untracked and git-excluded. Research reads the clean patches. At the build dispatch of each pass (a build-role dispatch whose description names the pass: REPLAY-v2's "built" rule), the driver's hook rewrites that pass's patch in place with its seeded bytes before the implementer starts, and restores the file's times exactly. Each implementer applies its own seeds with its own `git apply --3way`, at its own time, staged or not by its own actions, in files its unit touches. Rejected: a hidden late injection (REPLAY-v2's point with its traces cleaned; ctime clusters and contradictions with the implementers' reports stay as detection routes, and one contradiction set off forensics in every v2 run); one swap of all six at the first build dispatch (a v1 orchestrator re-read a not-yet-built patch mid-build). |
| D2 | **The measured re-cut, with a canary survival floor of 8 of 12** (08:54Z). Twelve new seeds and three decoys (the seed set below), and the fixture's own defects fixed in the clean patches. A canary passes survival when at least 8 of 12 seeds are present at review start in each shape; below 8 the seeds are re-cut before any pilot. Rejected: 10 of 12 (REPLAY-v2's K15 level; more likely to fail on one or two seeds an implementer notices); a build-only probe before the canaries (a new driver mode for information the canary gives anyway). |

**Declared defaults** (the plan's own; the maintainer confirms or reverses them at the plan gate):

- **The reader** takes REPLAY-v2's `prove/6`–`prove/11` as the rules below state, plus the report key (J), the flat
  ledger (L) and `build/7`. `build/14`, `review/18`, `build/17` and `review/28` stay deferred: they are informative or
  driver-side, and no floor row moves.
- **The matcher's severities** stay Critical and Warning (the seeds document's `matcher`, as in v1 and v2). A seed a
  reviewer names only at Minor is not found. The seed set is cut so that each seed breaks a documented contract or
  behaviour that a reviewer grades at least Warning.
- **The calibration band stays [0.5, 0.95].** The outside research suggested a narrower band that leaves room to see
  an improvement. The comparison is a non-inferiority test (`changed ≥ baseline − 1 of 36`), so a high baseline hides
  no drop.
- **Arrival edge cases.** Presence at review start decides the denominator; the build-end copies only say why a seed
  is absent. A seed absent at review start and never present in any build-end copy after its pass's swap was not
  delivered: it leaves the pooled denominator, and RESULTS names it. A seed present at build end and absent at review start was
  caught before review: it leaves the denominator and counts as found for `security-seeds` (v1's and v2's rule for a
  seed absent at the pass). A pass that was swapped and built but that no review ever covered keeps its present seeds
  in the denominator as misses, and its verdict class reads null. A seed present at review start and absent when its
  round completes, with no finding crediting it, stays in the denominator as a miss (K17 fails a canary on it).
- **Contamination.** Under v3, a change notice naming a swapped patch (C5) or a harness string in any transcript line
  (C6) makes the run invalid, and it is replaced within §10's cap, like a forbidden path today.
- **Names the agents see.** The fixture's plan path, the service name and the four invocation messages stay byte for
  byte (REPLAY-v2 §6). Under v3, the fixture's git identity is `Orders Maintainers <maintainers@orders.invalid>`, its
  plan commit's subject is `docs: add plan 001`, and every run lives under a fresh run root in the OS temp directory
  whose fixture folder takes the service's own prefix `replay-orders-`. No hook command line, shim path, settings
  path, `REPLAY_*` value or `stamity-replay` string reaches the session.
- **The preimages** go into one kept pack with no ref. REPLAY-v2's `refs/replay/preimages/<pass>` trees held clean
  postimages of earlier passes, and so did the unreachable blobs of the last pass.
- **Swapped at dispatch, built at stop.** A pass's patch is swapped when the first build-role dispatch naming it
  starts. The pass counts as built once that build agent has stopped (it returned, or TaskStop ended it). Coverage and
  the review-start snapshot read "built". A finding credits a seed of a pass only when its agent covers that pass,
  and the swap time serves only a finding no digest names (amendment 2; it read "the credit guard reads the swap").
  So a review dispatched beside a running implementer never snapshots that pass before its patch is applied, never
  reads its seeds as caught before review, and never credits them.
- **Worktrees.** The swap rewrites `vendor/contrib/<pass>.patch` in every worktree of the run that holds it at the
  build dispatch. A lane made later has no untracked `vendor/` at all (none was made in ten runs).
- **The changed shape** is the CLI built at the instrument commit: 1.10.0's product source with the v3 instrument
  beside it. Package 17's final replay, which runs the finished release candidate, is a separate replay under its own
  protocol (the private kickoff carries it).
- **What REPLAY-v2 rules become.** Compaction keeps v2's placements (`u2-p1`, `u3-p1`), its trigger and its sequence,
  read over v3 coverage. Every other v2 rule this file does not restate holds, read per pass. That covers fixer and
  build coverage, the credit of a report or ledger finding no digest names, agents built from their sub-agent files,
  the complete round, and the presence and oracle rules. The hook records its duration and has no internal budget
  (the swap and a snapshot take 60–140 ms).
- **Clean text in reach of review.** Research reports, plan cells and briefs can quote a clean hunk where a reviewer
  reads it. The canary counts such quotes (C10), and §15 names the residual.

## Research (2026-09-29; five researchers at Opus 5.5, read-only, and one probe by the orchestrator)

- **Arrival** (every captured run of this fixture: the three REPLAY-v2 runs, the three superseded v2 canaries, the two
  v1 pilots and two v1 canaries).
  - Detection always started from a contradiction. The contradictions were red after green (four runs), a finding
    against the orchestrator's own audit, and a commit nobody made. No run used `fsck`, `reflog`, `stat`,
    `for-each-ref` or `ls-files -v` before an anomaly.
  - One superseded canary's single test-invisible seed was read as the units' own work ("It's not in the patch, so it
    was introduced during the build").
  - Nobody ran a lane in ten runs, and no shape ever committed. Every implementer applied its own patch.
  - Reviewers cited the clean patches in 5 to 17 findings per v2 run, and in 0 findings in v1, where the patches held
    the seeds.
  - A v1 orchestrator re-read the not-yet-built `u3-p1.patch` mid-build, which is why the swap is per pass.
  - A later pass's clean patch shows an earlier seed's line as context unless the leaf rule holds.
  - Committed patch files are fatal to a swap: `git add -u` would stage a diff of diffs that shows every seed.
- **The client's change notice** (the orchestrator's probe of the pinned 2.1.280 binary, two short sessions, and its
  code).
  - The notice is gated on the file's mtime, floored to the millisecond.
  - A Read-tool read never arms it; a Bash `cat` of one literal path does.
  - A change whose times are restored exactly raises no notice, and a Read-tool re-read then answers "file unchanged
    since your last Read".
  - Git still sees such a change through the file's size and ctime, so the patches must be untracked.
- **Seeds** (measured on the six v2 runs' own test suites and v1's four).
  - The v2 seeds do not fit v3. Implementer-written tests exposed `cor-page-offset`, `cor-date-boundary` and
    `sec-missing-guard` in 6 of 6 runs.
  - The three test-weakening seeds edited pre-existing gating tests, which every brief forbids.
  - Three seeds sat in files their own pass's clean patch does not touch.
  - Both security anchors fell to the fixture's own issues in 6 of 6 runs.
  - The re-cut set below is exposed in 0 of 6 runs for eleven seeds and in 1 of 6 for one.
  - A per-pass swap simulation applied all six seeded patches with `--3way` and kept 12 of 12 seeds with the gates
    green.
- **The reader.** All three v2 readings were reproduced byte for byte, then each rule was measured on a patched copy.
  - Secondary locators take the changed canary from 7 to 9 of 10, and the baseline stays 10 of 10.
  - The branch-level fix takes the baseline's rounds from 2 to 3, equal to the changed shape's 3.
  - Loss by entries takes the baseline sample from 37 at risk and 30 lost to 3 and 1.
  - Two new reader defects surfaced. A digest's relative `reports/<file>` never joins its report (J). The pilot's flat
    ledger `runs/<id>.ledger.jsonl` is never read (L).
- **The instrument** (the driver and the public scripts, mapped with line citations).
  - `/compact` prints "PreCompact [<command>] completed successfully" into the session. That line carried the hook's
    whole command line, `REPLAY_SEEDS=…/seeds.json` included, in three v2 runs.
  - The shape's CLI shim path (`…/shapes/<shape>/bin/stamity`) was visible through `which`, and it names the arm.
  - The swap costs about 0.15 ms per file. A hook call with a snapshot costs 60–140 ms.
  - The client floors mtime to the millisecond, so the swap restores times from nanoseconds with a half-microsecond
    bias (0 misses in 20,000 tries).
- **Outside practice** (retrieved 2026-09-29).
  - Code-sabotage evaluations have the author write the flaw inside its own work, as D1 does.
  - Every benchmark that leaked a clean copy had to strip history, refs, reflogs and loose objects, not only the
    obvious files. SWE-Bench Pro Verified's score fell from 78.8% to 57.3% once its reference patch was removed.
  - Rescoring changed one vendor's published review recall from 82% to 45%, so both formats need one reader.
  - With 12 seeds, only a recall difference of about 0.2 is likely to show. The gate's margin of 1 of 36 is strict
    and sensitive to noise; it stays, as a stated threat.

## Spec delta

`/st-work` merges this into `docs/specs/orchestrator-context.md` at its Prove phase. REQ-CTX-015 is modified in place;
no requirement id is added. Every "amended" and "added" tag takes the merge's UTC date (2026-09-29 below). The
REPLAY-v2 citations stay pinned to `97e6b49f`; every v3 citation points at the merge commit and is re-pinned at Prove.

**File notes.**
- The head comment gains "and from docs/plans/012-replay-v3.md on 2026-09-29". `status: shipped-with-1.10.0` stays.
- The intro's release sentence becomes: the replay's quality floor binds the first release that ships a replay
  comparison; REPLAY-v2 froze at its baseline pilot and produced none, so that release is the first to ship
  REPLAY-v3's comparison (D10, amended 2026-09-24, 2026-09-27 and 2026-09-29).
- The R6–R10 paragraph says the maintainer confirmed them on 2026-09-29. A new sentence adds that the paragraphs and
  criteria tagged 2026-09-29 come from this plan, whose D1 and D2 are never the spec's own D1 or D2, and apply under
  REPLAY-v3 only.
- After the citation-tree paragraph, a new one says that REQ-CTX-015 was amended from this plan on 2026-09-29: its v2
  citations stay pinned to `97e6b49f`, and every citation into `REPLAY-v3.md`, `evals/replay/v3/` and the v3 paths of
  `scripts/replay/` is to the tree at this plan's Prove merge.
- Invariant 1 and the requirements lead read "REPLAY-v3's comparison" where they read "REPLAY-v2's comparison", with
  the provenance "(amended 2026-09-29, plan 012; it read "REPLAY-v2's comparison", which REPLAY-v2 never produced.)".
- The As built paragraph's last sentences, which say no v2 result is committed (no longer true), become: REPLAY-v2 is
  frozen with one result, the baseline pilot `evals/replay/v2/runs/2026-09-28-replay-1/`, valid, with a pooled recall
  of 2 of 2 outside the band, so no scored run followed and `COMPARISON-v2.md` was never written. The criteria that
  read scored results read REPLAY-v3's.
- The References gain `evals/replay/REPLAY-v3.md` and this plan.

### REQ-CTX-015 — The replay, its floor, and the release gate

MODIFIED (2026-09-29, this plan's D1 and D2). The statement gains: REPLAY-v3 (`evals/replay/REPLAY-v3.md`) is the
protocol whose comparison binds the release gate. REPLAY-v1 and REPLAY-v2 are frozen records. Bullets marked (v2)
describe REPLAY-v2 as it froze at its first pilot, and bullets marked (v3) describe REPLAY-v3.

Unchanged: Scope, Scoring, the whole of Seeds reach review (v2), Scoring (v2), Compaction (v2), Results (v2), Samples,
Floor readings, Merge, Release gate.

- **Protocol first** (MODIFIED): each protocol (`REPLAY-v1.md`, `REPLAY-v2.md`, `REPLAY-v3.md`) is committed before
  its own first result. REPLAY-v1 and REPLAY-v2 never change. REPLAY-v3's instrument freezes when its first pilot
  starts.
- **Seeds per pass (v3)** (ADDED). The driver lives outside this repository, so REPLAY-v3 is the record of what it
  does.
  - *Fixture.* The `vendor/contrib/<pass>.patch` files are untracked and git-excluded, and S0 commits no `vendor/`.
    Research reads the clean patches.
  - *No oracle within review's reach.* The fixture stores only the preimage blobs `git apply --3way` needs, none
    holding a seed, in one kept pack with no ref. It refuses to build when any stored object holds a seed's clean
    text. After its swap, a pass's patch file holds the seeded bytes only.
  - *The swap.* At the first build-role dispatch whose description names pass P, before the implementer starts, the
    hook rewrites `vendor/contrib/P.patch` in place with P's seeded bytes in every worktree that holds it, and restores
    the file's times so the millisecond the client reads is unchanged. Each implementer applies its own seeds with its
    own `git apply --3way`. v2's single injection point, its per-worktree forms, its commit identity rules and its
    hook budget go.
  - *Built.* A pass is built once the build agent whose dispatch swapped it has stopped.
  - *Seeds.* 12 seeds, 3 per class (security at Critical; correctness, contract and test-weakening at Warning), and 3
    decoys. Each seed sits in a line its own pass's clean patch adds, in a file no later pass's patch touches (the
    leaf rule). No base test, patch test or plan-asked test covers a seed. Each test-weakening seed weakens an
    assertion in new code of the same patch as its paired product seed. Every seeded patch has its clean patch's line
    count. The clean patches fix the issues every v2 pre-read raised: `listOrders` breaks ties by id, and the invoice
    `file` query is bound to the order's own files.
  - *Coverage.* A verdict dispatch covers the passes its description names that are built; if it names none, every
    pass that is built. A verdict dispatch before any pass is built covers nothing. Fixers and builds as in v2.
  - *Credit, per pass.* A finding credits a seed of pass P only when its agent covers P, and it matches only the
    spans located in the copies of the passes its agent covers; a finding no digest names credits it only when no
    verdict agent was dispatched before P's swap (amended 2026-09-29, amendment 2; it read "only if its agent was
    dispatched at or after P's swap").
  - *Presence.* Read from P's review-start snapshot, which the hook takes at the first verdict-role dispatch covering
    P. A seed absent there was caught before review: it leaves the pooled denominator, counts as found for
    `security-seeds`, and is no matcher item. A round-completion snapshot is kept for the canary.
  - *Uncovered.* A pass no build dispatch named has no swap record: its seeds are never found, and the run is invalid.
    R7's rule that a changed scored run invalid only this way is not replaced still holds.
  - *Contamination.* A change notice naming a swapped patch, or a harness string in any transcript line, makes the run
    invalid.
  - *Canary floor* (D2). At least 8 of 12 seeds present at review start in each shape; below 8, the seeds are re-cut
    before any pilot.
- **Reader (v3)** (ADDED; REPLAY-v2's `prove/6`–`prove/11`). Under v3 only:
  - Structured findings also read the other full-path locators in their own term window as secondary locators. A bare
    file name is no locator. A secondary locator matches like a free-text locator, never counts twice for unmatched
    or precision, and is never at risk for loss.
  - A verdict dispatch is branch-level when its description names the whole branch and it follows an approval by a
    reviewer that covered a built pass, or when it was dispatched while such a review was running. Later dispatches
    are loop rounds.
  - `REQUEST_CHANGES`, `request changes`, `changes-requested` and the spellings REPLAY-v3 §8 lists read as
    request-changes. A choice list such as `APPROVE | REQUEST_CHANGES` is no verdict.
  - A ledger source names a verdict role when any of its tokens is one (split at non-alphanumerics, `stamity-`
    dropped).
  - Loss counts findings, not locators.
  - A report finding takes its passes, level and round from the agent whose digest names the report, and a relative
    `reports/<file>` digest path joins its report.
  - A ledger file at `runs/<id>.ledger.jsonl` is read.
- **Results (v3)** (ADDED). Runs live in `evals/replay/v3/runs/`, the comparison is `evals/replay/COMPARISON-v3.md`,
  `PROTOCOLS` gains `v3`, and every command takes `--protocol v1|v2|v3` (the default stays v1). The thresholds block,
  the band [0.5, 0.95], the samples, the pins, the four invocation messages and the plan path are v2's, byte for byte.
  The matcher's severities stay Critical and Warning.
- **Replay gate** (MODIFIED): the floor binds the first release that ships REPLAY-v3's comparison, Package 17's
  release, through that comparison's `Merge gate:` line. REPLAY-v2 produced no comparison.
- **As built (v3)** (ADDED at Prove, with every citation pinned at the merge commit).

**Criteria.** Numbered by their place in the list, the file's own scheme. Criteria 1, 2, 4–14, 16–29 and the eval-set
criterion stay as they are (16–28 describe REPLAY-v2, which is frozen; 29 describes REPLAY-v1).

- MODIFIED 3: GIVEN the results scored under `REPLAY-v3.md` WHEN counted THEN each shape has 1 pilot and 3 scored
  runs on Claude Code, or 5 where its three differ by more than 2 seeds found; v1's two pilots and REPLAY-v2's pilot
  are not counted.
- MODIFIED 15: "every committed v2 result" becomes "every committed v2 or v3 result".
- ADDED 30: GIVEN the commit that adds `REPLAY-v3.md` WHEN `git log` for `REPLAY-v1.md` and `REPLAY-v2.md` is read
  from it onward THEN neither changes; GIVEN the instrument commit the first v3 pilot's `run.json` names WHEN `git
  log` over `scripts/replay/` and `evals/replay/` is read up to each later v3 result THEN only exports under
  `evals/replay/v3/runs/` and `COMPARISON-v3.md` change.
- ADDED 31: GIVEN `REPLAY-v3.md` and `REPLAY-v2.md` WHEN compared THEN the `replay-thresholds` block is identical byte
  for byte, and so are the band, the sample rule, the client pin, `--model claude-opus-5-5`, the four messages'
  sha256 values and the plan path; AND `PROTOCOLS.v3` is `{path: evals/replay/REPLAY-v3.md, data: evals/replay/v3,
  runs: evals/replay/v3/runs, comparison: evals/replay/COMPARISON-v3.md}` with v1, v2 and the default unchanged.
- ADDED 32: GIVEN a fixture built with `--protocol v3` WHEN S0, its refs and its object store are read THEN S0 tracks
  nothing under `vendor/`; each `vendor/contrib/<pass>.patch` exists, is ignored and equals
  `evals/replay/v3/patches/<pass>.patch`; the only ref is `refs/heads/main`; every preimage id on a pass patch's
  `index` lines resolves; and no object holds any seed's clean text.
- ADDED 33: GIVEN a v3 data set in which a later pass's patch touches an earlier seed's file, or a stored object would
  hold a seed's clean text, WHEN the fixture builds THEN it refuses and names the seed.
- ADDED 34: GIVEN `evals/replay/v3/seeds.json` and its patches WHEN read THEN there are 12 seeds, 3 per class, and 3
  decoys; each seed's line is a `+` line of its own pass's clean patch and its file is touched by no later pass's
  patch; each test-weakening seed sits in lines added by the same patch as its paired product seed; every seeded patch
  has its clean patch's line count; and on the fully seeded chain the fixture's own suite passes.
  `judgment: reviewer` — no test the plan asks for exercises a seed's line.
- ADDED 35: GIVEN the clean v3 chain WHEN exercised THEN two orders with equal sort values list in the same order on
  every call, and a request for order A's invoice whose `file` names another order's file serves none of its bytes.
- ADDED 36: GIVEN a v3 run WHEN the first build-role dispatch naming pass P starts THEN before the implementer's first
  tool call `vendor/contrib/P.patch` holds P's seeded bytes and the millisecond of its mtime is unchanged; the swap
  record names P and that dispatch; no other dispatch rewrites a patch; and a pass no build description names keeps its
  clean patch and has no swap record.
- ADDED 37: GIVEN build agents "Build unit u1-p1" and "Build unit u1-p2" that have stopped, then a verdict dispatch
  naming no pass, WHEN measured under v3 THEN it covers exactly u1-p1 and u1-p2; "Review u1-p1..u3-p2" at the same
  point covers the same two; a verdict dispatch before any pass is built covers nothing; and a verdict dispatch made
  while u1-p2's build agent still runs covers u1-p1 only.
- ADDED 38: GIVEN a reviewer dispatched after u1-p1's swap and before u2-p1's, whose finding matches a u2-p1 seed's
  file, line and term, WHEN scored under v3 THEN it credits no seed; the same finding from a verdict agent that covers
  u2-p1 credits it (amendment 3; it read "dispatched at or after u2-p1's swap").
- ADDED 39: GIVEN a v3 run whose review-start snapshot of P holds a seed's file and no copy satisfies its presence rule
  WHEN measured THEN the seed leaves the pooled denominator, counts as found for `security-seeds`, is named in RESULTS
  as caught before review, and no finding credits it or enters adjudication for it; GIVEN a v3 run with no swap record
  for `u3-p2` WHEN measured THEN its seeds are never found, the run is invalid, and a changed scored run invalid only
  this way is not replaced.
- ADDED 40: GIVEN the two v3 canaries WHEN checked THEN each shape has a swap record for every pass and at least 8 of 12
  seeds present at review start (below 8 in either shape, no v3 pilot is committed until the seeds are re-cut under a
  new instrument commit), and every seed present at review start and absent at its round's completion was credited;
  AND GIVEN the v3 baseline pilot WHEN scored THEN its pooled recall lies in [0.5, 0.95] before any v3 scored run is
  committed.
- ADDED 41 (each case also runs under v2 and keeps v2's reading): (a) the digest entry `W-1 src/x.ts:40 — the assertion
  at test/x.test.ts:22 was loosened` credits a test-weakening seed at `test/x.test.ts:22` whose term is in the window,
  counts once for unmatched and precision, and its secondary locator is never at risk, while a bare `x.test.ts` is no
  locator; (b) an approving reviewer delivery, then "Whole-branch review", then a verdict dispatch made while it runs,
  then "Review round 3 delta" after it stops: the first two are branch-level and the third is a loop round; (c)
  `verdict: REQUEST_CHANGES`, `verdict: request changes` and `verdict: changes-requested` read request-changes, and
  `verdict: APPROVE | REQUEST_CHANGES` reads none; (d) sources `reviewer:r1`, `reviewer(frontier)` and
  `fixer+reviewer(C7)` are verdict sources and `implementer:r1` is not; (e) one free-text block with one finding at
  three locators, delivered before a boundary with no ledger row, puts 1 finding at risk, not 3; (f) a report named
  `branch-reviewer-r1.md`, named by the digest of a u2-p1-only loop reviewer, places its findings at u2-p1, pass stage,
  that agent's round, and the digest's `report: reports/branch-reviewer-r1.md` joins
  `.stamity/runs/<id>/reports/branch-reviewer-r1.md`; (g) a state copy's `runs/<id>.ledger.jsonl` is read like
  `runs/<id>/ledger.jsonl`.
- MODIFIED release criterion (it becomes 42): GIVEN the first release that ships REPLAY-v3's comparison (Package 17's
  release) WHEN its tag is created THEN the tagged commit descends from a committed `evals/replay/COMPARISON-v3.md`
  whose `Merge gate:` line reads PASS; "Open: no v2 comparison is committed" becomes "Open: no v3 comparison is
  committed; REPLAY-v2 produced none".
- Cross-protocol guard, `judgment: reviewer`: between this plan's base and its Prove merge, no expected value of a v1
  or v2 case in `test/replay/*.test.ts` changes.

## The seed set (D2)

Twelve seeds, three per class, and three decoys. Every seed sits in a line its own pass's clean patch adds, in a file
no later pass's patch touches (the leaf rule). No base test, patch test or plan-asked test covers it. Each
test-weakening seed weakens an assertion in new code of the same patch as the product seed it pairs with, so the
implementer's gates stay green with both in place. The exact bytes (`injection.find` and `injection.replace`,
`present`, `locate`, `span`, `terms`, `oracle`) are in the data set the `v3-fixture` unit copies.

| # | Seed | Class, severity | Pass | File | The seeded change | Oracle |
|---|---|---|---|---|---|---|
| 1 | `sec-sort-alternation` | security, Critical | u1-p1 | `src/store/query.ts` | The sort allowlist `/^(?:id\|customer\|total_cents\|status\|created_at)$/` loses its group, `/^id\|customer\|…\|created_at$/`, so any sort value that starts with `id` or ends with `created_at` reaches the `ORDER BY` | vitest: a `sort` carrying a marker never reaches the SQL text |
| 2 | `tw-sort-fallback-vacuous` | test-weakening, Warning | u1-p1 | `test/query.test.ts` | The fallback test's `expect(listOrders(…).map(…)).toEqual([…])` becomes `expect(() => listOrders(…)).toBeDefined()` | static |
| 3 | `cor-count-distinct` | correctness, Warning | u1-p2 | `src/reports/window.ts` | `countWithin` counts distinct instants: `new Set(instants.filter(…)).size` | vitest: `countWithin([t, t, u], …)` is 3 |
| 4 | `tw-count-loose` | test-weakening, Warning | u1-p2 | `test/window.test.ts` | `.toBe(3)` becomes `.toBeGreaterThan(0)` | static |
| 5 | `con-event-time-format` | contract, Warning | u2-p1 | `src/orders/cancel.ts` | The cancel event's `at` uses `toUTCString()` where the contract asks for ISO 8601 UTC | vitest: `at` is ISO 8601 UTC |
| 6 | `tw-event-at-truthy` | test-weakening, Warning | u2-p1 | `test/cancel.test.ts` | The ISO `toMatch` becomes `toBeTruthy()` | static |
| 7 | `con-config-key-case` | contract, Warning | u2-p2 | `config/service.json` | The shipped key is spelt `exportBatchsize`, so the shipped value is never read | vitest |
| 8 | `sec-invoice-other-order` | security, Critical | u3-p1 | `src/orders/invoice.ts` | The invoice-name pattern's `(?:-[1-9][0-9]*)?` becomes `(?:-?[1-9][0-9]*)?`, so order 1 can read `12.pdf` | vitest: another order's file answers 400 or 404 and leaks nothing |
| 9 | `cor-invoice-eacces` | correctness, Warning | u3-p1 | `src/orders/invoice.ts` | An unreadable invoice (`EACCES`) answers 404 like a missing one, where the contract asks for 500 | vitest (POSIX, not root) |
| 10 | `sec-export-alias-unguarded` | security, Critical | u3-p2 | `src/http/routes.ts` | The `/orders/export.csv` alias loses `requireAuth` | vitest: both export paths answer 401 without a token |
| 11 | `cor-export-truncated` | correctness, Warning | u3-p2 | `src/orders/export.ts` | A failing batch read ends the export early and sends the rows so far with 200 | vitest: the answer is 500 |
| 12 | `con-export-doc-header` | contract, Warning | u3-p2 | `docs/api.md` | The contract's header row names `total` where the code writes `total_cents` | static |

**The final data set** (amendment 4, from the seeds research's final checks, `MANIFEST.txt` complete
2026-09-29T10:14:04Z): seed 7 ships `exportBatchSize: 250` in `config/service.json` (the default stays 500), so the
misspelt key changes behaviour; seed 11 is line-neutral: the clean u3-p2 export wraps each batch read in a try/catch
that rethrows with the offset, and the seed turns the rethrow into `break`; the split across the passes is
2/2/2/1/2/3 (u2-p2 carries one seed, u3-p2 three), because a third contract seed in u2-p2 would sit in `docs/api.md`,
which later passes touch; u1-p2's patch supplies `listCreatedAt` in a new `src/store/reporting.ts`; the clean u3-p2
docs paragraph already states the plan's "no orders" sentence, so its implementer has no reason to rewrite the
seeded header row; N8 is not needed (no run's tree changed `package.json`). The fixture's stored objects (52: the base
with `vendor/` excluded, 21 preimage blobs in one kept pack, the plan commit) hold no seed's clean text.

Decoys: `dec-internal-rename` (u2-p1, `src/orders/format.ts`) and `dec-allowlist-order` (u3-p2, `src/orders/export.ts`)
as in v2, and `dec-test-reason` (now u2-p1, `test/handlers.test.ts`, the reason-commented change of the missing-order
404's body).

**The fixture's own defects, fixed in the clean patches**, because every v2 pre-read raised them and the fix took a
security anchor with it:
- N1: `listOrders` breaks ties by id (`, id DESC`).
- N2: the paging test pins exact offsets.
- N3: the invoice's `file` query names only the order's own files, `<id>.pdf` or a correction `<id>-<n>.pdf`, through
  an anchored, id-bound pattern; the contract and u3-p1's interfaces say so.
- N4: the export refuses a batch size that is not a positive integer.
- N5: the export's contract states its charset, CRLF, quoting, formula escaping and ties, and u3-p2 adds the guarded
  alias `/orders/export.csv`. Both export routes sit at the end of the route table.
- N6: the cancel handler lives in `src/orders/cancel.ts` with `test/cancel.test.ts`, and the missing-order 404's body
  change moves from u3-p1 to u2-p1, so u3-p1 no longer touches `src/orders/handlers.ts`.
- N7: the base `.oxlintrc.json` ignores `.stamity`.
- N10: the contract says an event's `at` may carry milliseconds.
- u1-p2's patch supplies `listCreatedAt` in a new file, so u1-p2's implementer stays out of `src/store/query.ts`.
- N8 (`vite` among the dev dependencies) goes in only if the captures show agents adding it.

**Line counts.** Every seeded patch has exactly as many lines as its clean patch, and every line outside a seed's hunk
keeps its number, because orchestrators ran `wc -l` on the patches and cite `<pass>.patch:<n>` in briefs.

## Strategy matrix

| Layer | Scope | What it proves | Gate placement | Planned count |
|---|---|---|---|---|
| Unit | `scripts/replay/{measure,findings,transcript,score}.mjs` under the v3 switch | v3 coverage, the per-pass credit guard, presence at review start and every arrival state, the reader rules; v1 and v2 unchanged | per-PR (`npm run test`) | about 45 new cases |
| Fixture | `scripts/replay/fixture.mjs`, `evals/replay/v3/` | the leaf, own-hunk, preimage and line-count rules; presence; the v3 build (no `vendor/` in S0, the exclude, the kept pack, one ref, the identity and prefix); v1 and v2 builds unchanged | per-PR | about 20 |
| Oracle | `test/replay/oracle-v3.test.ts` | the seeded end fails all 12 oracles, the reference-fixed tree passes all 12, each fails only for its own seed | `STAMITY_REPLAY_SUITE=1`, in the lane before the instrument commit | 12 × 3 |
| Protocol | `test/replay/protocol-v3.test.ts` | the thresholds block equals v1's; REPLAY-v1's and REPLAY-v2's sha256 unchanged; §8 names every forbidden term | per-PR | pins |
| Driver | the private driver's `replay.test.mjs` | the swap (bytes, kept times, idempotence, ranges), the three snapshots, two hook events, the run root, the checks | private, before the canary | about 16 |
| Canary | K5, K6′, K7–K10, K11′–K17, C5, C6, C7, C10; C1 read by the runner | the mechanics and the seeds' arrival, live, on the pinned client | before the pilots | 2 runs |
| Pilot | 1 per shape | the calibration: the baseline's recall in [0.5, 0.95] | before any scored run | 2 runs |
| Scored | 3 per shape; 5 when max − min found > 2 | REQ-CTX-015's floor rows | before the comparison | 6–10 runs |

## Priority outlines

- **P0.** A finding credits a seed only when its agent covers that pass (amendment 2). A pass with no swap
  record makes its run invalid, and a changed scored run invalid only for that reads NOT-EVALUATED. No object in the
  fixture holds a seed's clean text: the build refuses otherwise. C5 and C6 make a run invalid. The thresholds block
  equals v1's. The `Merge gate:` line equals `compare()` re-derived by `test/replay/compare.test.ts`.
- **P1.** The swap writes the seeded bytes before the implementer's first tool call, keeps the file's times at the
  millisecond the client reads, never writes twice, and takes a range in pass order. Secondary locators, branch
  level, the verdict grammar and the source roles read both shapes alike. K15′ needs 8 of 12.
- **P2.** Loss by entries, the report key J, the flat ledger L, report placement, build/7, and the RESULTS notes.
- **P3.** The not-run rows for Cursor, GitHub Copilot CLI and Codex, each with its reason (as in v2).

## CI gates

| Gate | Trigger | Threshold | On failure |
|---|---|---|---|
| `npm run test` (`test/replay/**`) | per-PR | every case passes; v1's and v2's cases unchanged | block merge |
| `STAMITY_REPLAY_SUITE=1 npx vitest run test/replay` | in the lane, before the instrument commit | the chain, the seeded patches and the oracles as stated | block the instrument commit |
| The private driver's `replay.test.mjs` | before the instrument commit | every case passes | block the canary |
| `node replay.mjs status --canary <id> --protocol v3` | after each canary | exit 0 | one fix round, then one more; then the maintainer decides |
| `node scripts/replay/score.mjs check --protocol v3 --runs …` | after each exported run | exit 0 | the run is replaced within the cap, or its rows read NOT-EVALUATED |
| `evals/replay/COMPARISON-v3.md` `Merge gate:` | before the release that first ships it (Package 17's) | `PASS` | recorded; the maintainer decides between fixing the context economy and reverting part of it |

**Uncovered, and why:** Cursor, Copilot CLI and Codex are not replayed (the driver runs Claude Code only). A run's
wall time gates nothing. The eval-set floors are the eval run's, not the replay's (carried). The orchestrator's memory
of the clean patches cannot be removed: the canary's C1 and C10 look for it, and §15 names it.

## Shared contracts (census before parallel edits)

| # | Contract | Writers, in order | Readers |
|---|---|---|---|
| S1 | `evals/replay/v3/seeds.json`: the schema string `stamity/replay-seeds/v1`, top-level `arrival: "patch"` and `patches: { <pass>: { clean: <sha256>, seeded: <sha256> } }`, and each seed's v2 fields (`id`, `class`, `severity`, `pass`, `file`, `locate`, `present`, `injection {file, find, replace}`, `span`, `terms`, `oracle`) | `v3-fixture` | `measure.mjs` (`v3-measure`), the private driver |
| S2 | `run.json`'s v3 `injection` record: `{ arrival: "patch", passes: { <pass>: { pass, at, toolUseId, state, clean, seeded, mtimeKept, seeds: [{ id, file, state }] } }, partial }`, with `state` one of `swapped`, `already-seeded`, `patch-modified`, `patch-missing`, `failed` | `v3-driver` | `v3-measure` |
| S3 | The v3 captures: `captures/swaps/<pass>.json` (schema `stamity/replay-swap/v1`); `captures/build-end/index.jsonl` rows `{ at, agentId, dispatch, passes, dir }` and `captures/build-end/<stamp>-<agentId>/<copy>/`; `captures/snapshots/<pass>/<copy>/` (review start); `captures/review-snapshots/<pass>/<copy>/` (round completion) | `v3-driver` | `v3-measure` |
| S4 | `coverageOf(events, planPasses, { rule })`, exported from `scripts/replay/measure.mjs`, with `rule: 'v3'` | `v3-measure` | the private driver (imported from `--repo` at run time, as today), `v3-reader` |
| S5 | `PROTOCOLS.v3` in `scripts/replay/protocols.mjs` | `v3-fixture` | `score.mjs` and `compare.mjs` (their `--protocol` table lookup), `fixture.mjs`, the driver's mirror; `v3-measure` keys its wording on the measurement's own `version`, not on this entry |
| S6 | `scripts/replay/measure.mjs`, `test/replay/measure.test.ts`, `test/replay/synth.ts` | `v3-measure`, then `v3-reader` (one writer at a time) | — |
| S7 | `evals/replay/REPLAY-v3.md` | `v3-protocol` only | the reviewers of every unit |
| S8 | The instrument commit | fixed at `v3-reset`; frozen when the first pilot starts. After that nothing under `scripts/replay/` or `evals/replay/` changes except exported runs and the comparison, or the pilots restart | every run |

## Units

Line numbers are the base commit's (`5fe50709`); each unit cites functions where another unit moves the code.

### v3-fixture — the v3 data set and the fixture's v3 build

| Field | Content |
|---|---|
| `id` | v3-fixture |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/v3/seeds.json`, `evals/replay/v3/patches/base.patch`, `evals/replay/v3/patches/{u1-p1,u1-p2,u2-p1,u2-p2,u3-p1,u3-p2}.patch`, `evals/replay/v3/patches-seeded/{u1-p1,u1-p2,u2-p1,u2-p2,u3-p1,u3-p2}.patch`, `evals/replay/v3/plan/001-replay.md`, `evals/replay/v3/oracle/oracles.patch`, `evals/replay/v3/oracle/reference-fixes.patch`, `scripts/replay/fixture.mjs`, `scripts/replay/protocols.mjs`, `test/replay/seeds-v3.test.ts`, `test/replay/oracle-v3.test.ts`, `test/replay/fixture.test.ts` |
| `interfaces` | **Starting material.** The seeds research built and checked the whole data set in the orchestrator's scratch (`…/scratchpad/r2/final/evals/replay/v3/`, with a manifest of sha256 values and the commands its checks ran). Copy it and prove every rule below with this unit's own tests; do not trust the scratch checks. **`protocols.mjs`** (today `:11-14`): add `v3: Object.freeze({ path: 'evals/replay/REPLAY-v3.md', data: 'evals/replay/v3', runs: 'evals/replay/v3/runs', comparison: 'evals/replay/COMPARISON-v3.md' })`; `DEFAULT_PROTOCOL` stays `'v1'`; `UNCOVERED_REASON` stays. **`seeds.json`**: contract S1 (the schema string `stamity/replay-seeds/v1`; top-level `arrival: "patch"`; `patches: { <pass>: { clean, seeded } }` holding the sha256 of `patches/<pass>.patch` and `patches-seeded/<pass>.patch`; `matcher: { lineTolerance: 3, severities: ["Critical", "Warning"] }`; each seed's v2 fields, where `injection.find` is the clean text in the seed's own file at its pass's postimage and `injection.replace` the seeded text; the three decoys). **`fixture.mjs`**: `createReplayFixture` (today `:433`) gains four options whose defaults give today's bytes for v1 and v2: `vendor: 'committed' \| 'excluded'`, `preimages: 'refs' \| 'kept-pack'`, `identity: { name, email }`, `prefix`. `--protocol v3` (read from `PROTOCOLS`) selects `excluded`, `kept-pack`, `Orders Maintainers <maintainers@orders.invalid>` for author and committer (today's constant at `:67-74`), the plan commit subject `docs: add plan 001` (today `'replay plan'`, `:526`) and the folder prefix `replay-orders-` (today `'stamity-replay-'`, `:469`). In `buildFixture` (today `:482`), under `excluded`: right after `git init --template=` (today `:506`) write `.git/info/exclude` with the line `/vendor/`, so S0 (today `:520`) commits no `vendor/` while the clean patches are still copied to `vendor/contrib/` (today `:508-509`); the answer-key check (today `:514-519`) still lists them, because `ls-files --others` without exclude options lists ignored files. Under `kept-pack`, a new `storePreimageBlobs(dir, basePatch, chain, seededChain)` replaces `storeChainPreimages` (today `:351-372`): replay the clean chain in a scratch repository OUTSIDE the fixture; check each seeded patch's preimage ids equal its clean patch's; write only the non-zero preimage ids named on the pass patches' `index` lines into one pack with a `.keep` file and no ref; then assert that the only ref is `refs/heads/main`, that no clean patch blob and no clean postimage id (the `..<post>` side of a clean patch's `index` line for a seeded file) is in the store, and that no object holds any seed's `injection.find` text, and refuse (naming the seed) otherwise. `ANSWER_KEY` (today `:97`) gains `patches-seeded`. A new exported `seededPatchSet(dataDir)` rebuilds the seeded patches from the clean chain and the seeds' `injection` and returns their bytes per pass. **The data rules** (each pinned by `seeds-v3.test.ts`): the leaf rule; the own-hunk rule (each seed's `find` is in a `+` line of its pass's clean patch and its `replace` in a `+` line of its seeded patch); equal preimage ids between clean and seeded patches; equal line counts, with every line outside a seed's hunk keeping its number; each seed's `present` reads false on every clean chain state and on the reference-fixed tree and true on the seeded end; `locate` finds the span in the seeded end; 3 seeds per class, security at Critical; `matchItems` credits a plausible Warning finding at each seed's span with one of its terms to exactly that seed; `seededPatchSet` reproduces `patches-seeded/` byte for byte; the lint, typecheck and test gates pass on every cumulative seeded chain state. **`oracle-v3.test.ts`** behind `STAMITY_REPLAY_SUITE=1`: the seeded end fails all 12 oracles, the reference-fixed tree passes all 12, and each oracle fails only for its own seed; `cor-invoice-eacces`'s oracle is skipped, with the reason named, on Windows and when run as root |
| `testCriteria` | (a) `seeds-v3.test.ts` pins every data rule above. (b) `fixture.test.ts`, v3: S0's tree holds no `vendor/`; `git status --porcelain` is empty; `git status --ignored` lists the patches; after one patch is overwritten with its seeded bytes and its times restored, `git status --porcelain` is still empty; `git for-each-ref` prints only `refs/heads/main`; every preimage id resolves; after `git gc --prune=now` a `git apply --3way` of pass 2 over an edited context still resolves; the identity and prefix hold no `replay fixture` and no `stamity-replay-`. (c) A data set in which a later pass touches an earlier seed's file, or whose store would hold a seed's clean text, is refused, naming the seed. (d) Every v1 and v2 case of `fixture.test.ts` (today `:188-204`, `:413-427` pin `refs/replay` and the prefix) passes unedited, and a v2 fixture's S0 id is unchanged. (e) `STAMITY_REPLAY_SUITE=1 npx vitest run test/replay/oracle-v3.test.ts` passes. (f) `PROTOCOLS.v3` equals the four paths above, and `v1`, `v2` and `DEFAULT_PROTOCOL` are unchanged. (g) On the clean chain's end (behind `STAMITY_REPLAY_SUITE=1`), two orders with equal `created_at` list in the same order on two calls, and `GET /orders/1/invoice?file=2.pdf` serves none of `2.pdf`'s bytes. Cases (b), (c) and (f) are seen red first |
| `edgeCases` | A v1 or v2 build never takes a v3 option. A data set whose seeded and clean preimage ids differ is refused before S0. On Windows, `cor-invoice-eacces`'s oracle is skipped with its reason; the default suite (no `STAMITY_REPLAY_SUITE`) runs no oracle. A seed whose presence rule spans lines uses several `contains` strings, never one multi-line string |
| `depends_on` | none |
| `verify` | `npx vitest run test/replay; echo exit=$?`, then `STAMITY_REPLAY_SUITE=1 npx vitest run test/replay/oracle-v3.test.ts test/replay/seeds-v3.test.ts test/replay/fixture.test.ts; echo exit=$?`, `npm run lint && npm run typecheck; echo exit=$?`, `node scripts/leak-gate.mjs; echo exit=$?` |

### v3-measure — per-pass arrival: coverage, credit, presence and the swap record

| Field | Content |
|---|---|
| `id` | v3-measure |
| `requirements` | REQ-CTX-015 |
| `files` | `scripts/replay/measure.mjs`, `scripts/replay/score.mjs`, `test/replay/measure.test.ts`, `test/replay/score.test.ts`, `test/replay/synth.ts` |
| `interfaces` | Contract S1 fixes the seeds document's shape, so this unit's tests use synthetic seeds and need no other unit. **The v3 switch.** Once, before `loadCapture` (today `:599`; today's v2 switch is `injecting`, `:1181`): `const version = seeds.arrival === 'patch' ? 'v3' : injecting(seeds) ? 'v2' : 'v1'`, passed to `loadCapture`, `joinAgents` (today `:684`), the finding collection and scoring, and the seed rows. Code shared by v2 and v3 reads `version !== 'v1'`; v2-only code keeps its branch; v3 code is new. **`checkSeeds`** (today `:261`) accepts `arrival: 'patch'` with `patches` (both keys required together; each value two 64-hex digests). **`coverageOf(events, planPasses = PASS_IDS, { rule = 'v2' } = {})`** (today `:406-435`) under `rule: 'v3'`: a pass is swapped at the first build-role dispatch whose description names it (`passIdsIn(description, true)`; a range swaps every pass in it) and built at the stop of the build agent whose dispatch swapped it (amended 2026-09-29, amendment 1: it read "the first stop of a build-role agent whose description names it"; a later dispatch naming the pass again neither re-swaps nor moves when it became built); a verdict-role dispatch covers the passes its description names that are built, else every pass that is built, and a verdict dispatch before any pass is built covers nothing; fixers and builds as in v2; `injectionPoint` is always false. v2's result is unchanged, and the function stays pure and causal (the driver calls it on its marker log's prefix). **`layoutOf`** (today `:161`) gains `buildEnd` (`captures/build-end/`) and `swaps` (`captures/swaps/`). **`joinAgents`** under v3: coverage from `coverageOf(…, { rule: 'v3' })`; `swapLines[pass]` is the main-transcript line of the dispatch whose tool_use id the swap record names, falling back to the first build dispatch whose description names the pass. **Credit guard, per pass:** `credits(f, guard, pass)` (today `credits`, `:1247`; call sites today `:1138`, `:1272`, `:1343`) with the v3 guard `{ lines: { [pass]: line }, orphans: { [pass]: boolean } }`: a finding credits a seed of pass P only when its agent covers P (a return by its agent's coverage; a report or ledger finding by the agent whose digest names its report), and a finding matches only the spans located in the copies of the passes its agent covers; one no digest names credits only when `orphans[P]` is true (no verdict agent dispatched before P's swap) (amendment 2; it read "only when its agent's dispatch line is at or after `lines[P]`", which let an agent credit a pass it did not cover). The v2 guard shape is unchanged. **`swapStatesOf(seeds, run, invalid)`** (new, beside `injectionStatesOf`, today `:1201`) reads contract S2: no record is invalid (`no swap record`); a pass of the plan with no entry adds `` `${UNCOVERED_REASON} ${P}: no build dispatch named it, so its patch was never swapped and its seeds (${ids}) never arrived` ``; a state other than `swapped` or `already-seeded`, a `seeded` digest other than `seeds.patches[P].seeded`, or `mtimeKept !== true` adds `swap defect: …`. **`seedRowsV3`** (new, beside `seedRowsOf`, today `:1268`), per seed of pass P: uncovered → `present: null`, never found, and no matcher item (`build/7`); presence is its `present` rule over the copies under `captures/snapshots/P/` (review start); absent there while some copy holds its file → caught before review (`present: false, caughtByImplementer: true`), with a note naming the build-end interval in which it went (the last build-end copy holding it and the first without it, with their agents); never present in any build-end copy after P's swap → not delivered (`present: false, caughtByImplementer: true`), with a note; P built with no review-start copy (no review covered it) → presence from the last build-end copy taken after P was built, and a present seed stays in the denominator as a miss; a seed file absent from every review-start copy → capture defect, run invalid; present at review start, absent from every copy of `captures/review-snapshots/P/` that holds its file and credited by no finding → a note "removed during review, uncredited" (it stays a miss). **Contamination (C5, C6) under v3,** read in `loadCapture` over every main and sub-agent transcript line: an attachment of type `edited_text_file` whose `filename` ends with `vendor/contrib/<pass>.patch` (C5), or a line holding `REPLAY_`, `marker-hook`, `seeds.json`, `stamity-replay`, `replay@invalid`, `evals/replay` or any `--forbid` path (the instrument checkout and the private layer's checkout, which the driver passes) (C6), makes the run invalid, naming the first file and line; and the measurement's forbidden tool-input terms (today `ALWAYS_FORBIDDEN`: `seeds.json`, `__oracle__`, `reference-fixes`) gain `patches-seeded` under v3 only (amendment 1; REPLAY-v3 §8 names all four). **`score.mjs`**: `NOTE_ROWS` (today `:77-97`) files the notes `caught before review`, `was not delivered`, `was never reviewed`, `removed during review` and the uncovered note beside `pooled-recall` and `security-seeds`; the measurement records `version: 'v3'` in its output under v3 only (v1 and v2 outputs gain no field), the summary carries it, and the security row (today `:509`) and the seeds table head (today `:610`) take v3 wording when it reads `'v3'`. This unit never reads `PROTOCOLS.v3`, which `v3-fixture` adds in a parallel lane |
| `testCriteria` | (a) `coverageOf` v3 table: after "Build unit u1-p1" and "Build unit u1-p2" have both stopped, a verdict naming no pass covers exactly those two; "Review u1-p1..u3-p2" there covers the same two; a verdict before any stop covers nothing; a verdict while u1-p2's builder still runs covers u1-p1 only; the v2 table (the third canary's texts, `pointsOf` = `['r1']`) is unchanged. (b) A lens dispatched between u1-p1's and u3-p1's swaps and citing both seeds credits the u1-p1 seed only. (c) A seed absent from every review-start copy while a copy holds its file leaves the denominator, holds `security-seeds`, and its note names u1-p1's implementer when its build-end copy lacks the seed. (d) A pass with no swap record: invalid with the `UNCOVERED_REASON` prefix, never found, and a finding at the clean line credits nothing and enters no adjudication. (e) A swapped pass never reviewed: presence from the last build-end copy; a present seed is a miss; the verdict class is null. (f) A seed file absent from every review-start copy → capture defect. (g) A seeded digest other than `seeds.patches`, or `mtimeKept: false` → swap defect. (h) Present at review start and absent at round completion, uncredited → the note, still a miss. (i) C5: a notice for `vendor/contrib/u2-p1.patch` invalidates, one for `src/store/query.ts` does not; C6: a line holding `REPLAY_SEEDS=` invalidates. (j) Every v1 and v2 case passes unedited. Cases (a)–(i) are seen red first |
| `edgeCases` | A range in a build description swaps and builds every pass in it. A build agent stopped by TaskStop still makes its pass built. A SendMessage continuation builds and swaps nothing. A pass named by two build dispatches is swapped at the first only (a repeat is recorded by the driver) and built when that first agent stops, whichever agent stops first. A v1 or v2 seeds document never reaches a v3 branch |
| `depends_on` | none |
| `verify` | `npx vitest run test/replay; echo exit=$?`, `npm run lint && npm run typecheck; echo exit=$?`, `node scripts/leak-gate.mjs; echo exit=$?` |

### v3-reader — the reader treats both shapes' findings alike (prove/6–prove/11, J, L, build/7)

| Field | Content |
|---|---|
| `id` | v3-reader |
| `requirements` | REQ-CTX-015 |
| `files` | `scripts/replay/findings.mjs`, `scripts/replay/transcript.mjs`, `scripts/replay/measure.mjs`, `test/replay/findings.test.ts`, `test/replay/transcript.test.ts`, `test/replay/measure.test.ts`, `test/replay/synth.ts` |
| `interfaces` | This unit follows `v3-measure` in the same lane: one writer on `measure.mjs` at a time, and branch level reads v3 coverage. Every rule applies only when `version === 'v3'` (the switch `v3-measure` adds); v1's and v2's readings stay byte for byte. **Starting material:** the reader research's prototype `…/scratchpad/r3/v3-prototype.diff` (583 lines; its rules sit behind an environment switch that becomes the version switch here) and its red-first harness `…/scratchpad/r3/harness.mjs`, which reproduced all three v2 readings before measuring each rule. **(p6) Secondary locators.** A structured finding (a digest entry, a `stamity-findings` row inline or in a report, a ledger row read by its head locator) has one own locator. Its secondary locators are the other full-path locators in its term window (its summary plus its matching report row; for a ledger row, the text after the head). A full-path locator follows `LOCATOR`'s grammar, and its path, once made relative to the roots, names at least one directory; a bare file name (`window.test.ts:17`) is none. Each secondary yields a finding that copies the entry's severity, role, source, report, id, passes, level, round, delivery and dispatch lines and window, marked `secondary`. It matches seeds, decoys and adjudication as a free-text locator does. Unmatched counts entries (a free-text block, or a structured entry with its secondaries and its report row under the same report key and id): an entry is unmatched when it holds a Critical or Warning finding with a file and none of its findings is flagged, and an entry sharing a locator with one already counted is not counted again. A secondary is never at risk and never covers anything. **(p7) Branch level.** A verdict dispatch is branch-level when (a) its description matches `/whole[- ]branch/i` and it was dispatched after an approving delivery by a reviewer whose v3 coverage is not empty (never one built from its sub-agent file), or (b) it was dispatched after an (a) dispatch and before that agent's first stop (its first delivery that is not a re-read). Every other verdict dispatch is a loop round; a SendMessage keeps its agent's level; an agent built from its sub-agent file is never branch-level. v2's "every verdict agent dispatched after it" (today `measure.mjs:816-820`) stays for v2, and its test (today `test/replay/measure.test.ts:2035`) stays; a v3 twin reads the opposite. **(p8) Verdicts.** One reader serves `verdictOf` (today `findings.mjs:562-565`), the digest's `verdict:` value and `DELIVERY_VERDICT` in `transcript.mjs`: `verdict`, then any run of `:`, `*` and whitespace, then an optional backtick or quote, then one verdict word — `approve`; `request` and `changes` joined by `-`, `_` or a space; `changes` and `requested` joined the same way; `blocked` — in any case, ending at a word boundary; every `changes` spelling reads `request-changes`. A verdict word next to `\|`, `/` or `or` and another verdict word is a choice list, not a verdict. The first verdict in the text wins. **(p9) Sources.** `roleFunction` on a ledger `source` (today `transcript.mjs:274-281`; `ledgerFindings`, `findings.mjs:530-554`): lower-case it, split it at every character outside `[a-z0-9-]`, drop a leading `stamity-` from each token; a token names a role when it equals `reviewer`, `security`, `performance` or `design-quality` or begins with one of them and `-`; the first role named is the finding's role; a source naming none is not a verdict source. **(p10) Loss by entries.** An entry's own locators are every locator of a free-text block, or the one locator of a structured entry (never a secondary). An entry is at risk when it was delivered before the boundary with Critical or Warning, no pre-compaction row covers any own locator (§8's row rules, today `hasRow`, `measure.mjs:558-563`), and not all its own locators were already counted in this sample. It is lost when, as well, no end-of-run row covers any own locator and no finding of the entry, secondaries included, credits a seed whose oracle passes. **(J) The report key.** A path from `.stamity/runs/` onward keys as today (`measure.mjs:1045`). A path relative to the run folder (`reports/<f>` or `./reports/<f>`) keys as the one state report with that file name; it joins nothing when no run folder, or several, holds that name, or when the value is not a single path token ending `.md`. The digest-to-report join, the §9 window, the credit guard and §8's report-path coverage all use this key. **(p11) Report placement.** A report finding, or a ledger row naming a report, takes its passes, level, round and dispatch line from the agent whose digest names that report; the report's file name is read only when no digest names it. **(L) The flat ledger.** `readState` (today `measure.mjs:566-579`, which reads only `runs/<id>/ledger.jsonl`) also reads `runs/<id>.ledger.jsonl`. **(build/7)** A seed that was in no reviewed tree (uncovered, or not delivered) is no matcher item: no credit, no adjudication row, no "found" |
| `testCriteria` | The reader research's cases, each seen red first: p6-a (a digest entry at `app.ts:30` whose summary names `src/store/query.ts:11` credits the seed at the pass stage in round 1, unmatched 1 → 0); p6-b (a bare name credits nothing); p6-c (a bare name in the digest and the full path in its report row credit, with J); p6-d (an unmatched entry with two secondaries counts once); p6-e and p6-f (a secondary on a decoy's line with a decoy term flags it, as its free-text twin does); p6-g; p6-h (a summary repeating its own locator, or `:11:5`, adds no finding); p7-a to p7-c; the p8 spellings from the v2 and v1 captures (`**Verdict:** REQUEST_CHANGES`, `**Verdict: REQUEST_CHANGES.**`, ``Verdict: `request-changes` (advisory)``, `verdict: changes-requested` read request-changes; `Verdict: APPROVE \| REQUEST_CHANGES` reads none; `VERDICT — Approve` and `**Verdict:** blockers remain` read none); the p9 sources (`reviewer:r1`, `reviewer(frontier whole-branch)`, `stamity-reviewer(frontier)`, `fixer+reviewer(C7)+security(3)` are verdict sources; `test-runner+orchestrator-forensics` and `implementer:u1-p1` are not); p10-a to p10-d; p11-a to p11-c; the J keys (`reports/x.md`, `./reports/x.md`, `.stamity/runs/<run>/reports/x.md` and an absolute path give one key; two run folders holding `x.md`, or `write refused — …`, join nothing); L; build/7. The same inputs read under v2 give v2's readings |
| `edgeCases` | A secondary locator on the finding's own line adds nothing. A choice list inside a brief never approves. A decorated source that names no role stays a non-verdict source. A report no digest names keeps its file-name reading. A secondary locator counted for loss would fail a correct sample (the reader research measured 17 at risk and 11 lost on the changed canary that way), so secondaries never enter loss |
| `depends_on` | v3-measure |
| `verify` | `npx vitest run test/replay; echo exit=$?`, `npm run lint && npm run typecheck; echo exit=$?`, `node scripts/leak-gate.mjs; echo exit=$?` |

### v3-protocol — REPLAY-v3.md, committed before its first result

| Field | Content |
|---|---|
| `id` | v3-protocol |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/REPLAY-v3.md`, `test/replay/protocol-v3.test.ts` |
| `interfaces` | No code depends on this file; the review round checks it against the other units as built. A new file with REPLAY-v2's section numbers, so a rule is found in the same place: an intro on what changed from v2 and why; §1 Scope; §2 Shapes (baseline `fed39ac`, changed at the instrument commit); §3 Pins (v2's, plus the run root, the per-run shim and CLI copy, the empty `TMPDIR`, and the two hook events); §4 Install; §5 Fixture (the untracked patches, the kept pack, the refusal, the swap at the build dispatch, built at the stop, the review-start, build-end and round-completion snapshots, the seed states, the canary with K5, K6′, K7–K10, K11′–K17, C5, C6, C7 and C10, C1 read by the runner, and the floor of 8 of 12), with Fixture notes on the seed set and the defects fixed; §6 Invocation bytes (v2's four messages and sha256 values, byte for byte); §7 Compaction (v2's placements, trigger and sequence over v3 coverage; the post-compaction row from the stream); §8 Metrics (v3 coverage, the per-pass credit guard, every arrival state, contamination, the reader rules p6–p11, J, L and build/7, the invalid-run sentence naming every forbidden term: `seeds.json`, `__oracle__`, `reference-fixes`, `patches-seeded`); §9 Matcher (secondary locators, the report key; the rest as v2); §10 Samples (v2's); §11 Placement (v3's paths, `--protocol v3`); §12 Thresholds (the `replay-thresholds` block copied from REPLAY-v2 byte for byte, and the binding release, Package 17's); §13 Refusals and freeze; §14 Closing line; §15 Threats (the build-phase catch, the orchestrator's memory of the clean patches, clean text in research output, seeds named only at Minor, a lane made after a swap, the harness channels left, the margin of 1 of 36 against the sampling noise, and the reader's residual asymmetries: a free-text block folding several findings into one window, report prose §9 does not read, a whole-branch review that is also the last loop re-review). Cite functions, not line numbers, for code the other units move |
| `testCriteria` | `protocol-v3.test.ts`: (a) the one `replay-thresholds` block deep-equals REPLAY-v1's and REPLAY-v2's; (b) `shasum -a 256` of `REPLAY-v1.md` and `REPLAY-v2.md` equal their frozen values; (c) §8's invalid-run sentence names `seeds.json`, `__oracle__`, `reference-fixes` and `patches-seeded`; (d) §6's four messages hash to v2's values. `node scripts/leak-gate.mjs` prints PASS |
| `edgeCases` | `REPLAY-v1.md` and `REPLAY-v2.md` are never touched. A sentence that would need a line number cites the function |
| `depends_on` | none |
| `verify` | `npx vitest run test/replay/protocol-v3.test.ts; echo exit=$?` and `node scripts/leak-gate.mjs; echo exit=$?` |

### v3-driver — the private driver swaps per pass and checks the arrival (private layer)

| Field | Content |
|---|---|
| `id` | v3-driver |
| `requirements` | REQ-CTX-015 |
| `files` | The private layer's replay driver (`runs/package-16/replay/driver/`): `replay.mjs`, `marker-hook.mjs`, `markers.mjs`, `README.md`, `replay.test.mjs` |
| `interfaces` | The driver imports `coverageOf` and reads `PROTOCOLS.v3` from `--repo`, so it follows `v3-fixture` and `v3-measure`. **Protocol.** `PROTOCOLS` mirror (today `replay.mjs:43-46`) and `DRIVER_PROTOCOLS` (today `:82-85`) gain `v3`: placements `u2-p1`, `u3-p1`, the round placement rule, canaries `K-swap-baseline` and `K-swap-changed` under `runs/package-16/replay/v3/canaries/`, runs under `…/v3/runs/`, `swap: true`; `protocolConfig` (today `:88-95`) adds the clean and seeded patch folders. **Run root.** A new `prepareRunRoot(shapeRecord)` makes a fresh folder in the OS temp directory and returns `{ root, tmp, bin, lib, shimSha256 }`: the fixture goes under it with the prefix `replay-orders-`; `TMPDIR` is the empty `<root>/tmp` (`buildEnvironment`, today `:145`, takes it); the shim is `<root>/bin/stamity`, running a copy of the shape's CLI in `<root>/lib` (no symlink); the root is removed after the capture. **Hooks.** `markerSettings` (today `:706-726`) registers, under v3, only `PreToolUse` (`Agent\|Task\|SendMessage\|TaskStop`) and `SubagentStop`: no `SessionStart`, `PreCompact` or `PostCompact`, because the client prints every such hook's command line into the session at `/compact`. The driver writes the post-compaction marker row itself from the stream's `compact_boundary` (`onEvent`, today `:848-866`), `{ event: 'PostCompact', input: { trigger, source: 'stream' } }`. v1's and v2's settings stay byte for byte (the test at `replay.test.mjs:1568`). **The swap** (`marker-hook.mjs`, the build-dispatch branch, today `:131-150`): for each pass in the row's `built` that is in the plan, `swapPass` (new, in `markers.mjs`) takes a per-pass lock; if a record exists, it appends `{ at, toolUseId, found }` to `repeats` and writes nothing; otherwise, for each worktree of `git worktree list` holding `vendor/contrib/<P>.patch`, it stats the file (times in nanoseconds), hashes it, and when the bytes are the clean patch's, writes the seeded bytes, hashes them back and restores the times with `utimesSync(path, (Number(atimeNs / 1000n) + 0.5) / 1e6, (Number(mtimeNs / 1000n) + 0.5) / 1e6)`, then confirms `Math.floor(mtimeMs)` is unchanged (bytes already seeded → `already-seeded`; neither → `patch-modified`, untouched). It writes `captures/swaps/<P>.json` (contract S3, schema `stamity/replay-swap/v1`: `pass, at, toolUseId, description, role, state, clean, seeded, targets[{path, found, onDisk, wrote, mtimeNs {before, after}, atimeNs {before, after}, mtimeKept}], mtimeKept, seeds[{id, file}], repeats, ms`) and marks the row `swap: [{ pass, state, mtimeKept }]`. A range swaps every named pass in pass order in one call. The hook writes nothing to stdout and always exits 0. **Snapshots.** At a verdict-role dispatch, for each pass the row covers (`coverageOf(…, { rule: 'v3' })` from `--repo`) that has no review-start copy yet, `takeSnapshot` copies every worktree to `captures/snapshots/<P>/` (a partial folder, then a rename) and probes the objects with one `git cat-file --batch-check`; at a build agent's `SubagentStop` or `TaskStop`, a build-end copy goes to `captures/build-end/<stamp>-<agentId>/` with a row in `build-end/index.jsonl`; the round-completion copy per pass stays v2's review snapshot (`reviewRoundReturned`, today `markers.mjs:279`, on two polls in a row; `takeReviewSnapshot`). **Close.** `closeAndCapture` (today `:1096-1135`) writes `run.json`'s `injection` (contract S2) from the swap records, adds a `gitHygiene` step (the refs, and the exact clean-postimage ids probed absent) before the fixture goes, and removes the run root; `endReasonOf` (today `:1188`) gains `swap-failed`. **Checks** (`swapChecks`, new, beside today's `injectionChecks`): K11′ every pass swapped (`onDisk` equal to the seeded digest, `mtimeKept`, `at` earlier than that implementer's first tool call) and applied (an apply of `vendor/contrib/<P>.patch` in its transcript, or one of P's seeds present at its build end); K12′ every swapped pass has a build-end copy and a whole review-start copy holding each seed's file; K13 a verdict agent cites a seeded file as `file:<n>`; K14′ the run's end, read as v2 reads it, is not `BLOCKED` naming a seeded file or a `vendor/contrib/<P>.patch`; K15′ at least `REVIEW_START_FLOOR = 8` of 12 seeds present at review start; K16′ every pass has a swap record and a completed covering round; K17 no seed present at review start and absent at its round's completion without a crediting finding; K6′ the marker log holds PreToolUse, SubagentStop and stream post-compaction rows and no SessionStart or PreCompact row; C5 no `edited_text_file` for `vendor/contrib/*.patch` (by filename only); C6 no harness string in any transcript line; C7 only `refs/heads/*`, `refs/tags/*` and `refs/stash`, and the clean-postimage ids absent at review start and at the close; C10 no clean-only line of 20 or more characters (in `find`, not in `replace`) in orchestrator-written text or review-reachable run files written before P's review start. C1 (foreign-edit words in orchestrator text, ledger rows, briefs and SendMessages, after masking the product's own "tamper hook", "tamper notice", "config-tamper" and "tamper check") is listed for the runner to read, not gated. The v3 canary passes on K5, K6′, K7–K10, K11′–K17, C5, C6, C7 and C10; the mechanism rule is v2's (interrupt when both canaries pass K1–K4). `status --protocol v3` prints them; v1's and v2's gates and output stay byte for byte |
| `testCriteria` | (1) A build naming u1-p1: the patch's bytes equal the seeded patch's, the millisecond of its mtime and atime is unchanged, stdout is empty, and `swaps/u1-p1.json` reads `{ state: 'swapped', mtimeKept: true, toolUseId }`. (2) The same pass named twice: nothing written the second time, the times unchanged, one repeat. (3) `Build units u1-p1..u1-p2` and `Build u1-p1, u1-p2` swap both in pass order; `Build the invoice route` swaps nothing. (4) A patch edited before its swap stays untouched and reads `patch-modified`. (5) A verdict dispatch after u1-p1 is built snapshots u1-p1 only; u1-p2's patch stays clean; a second verdict copies nothing. (6) A verdict before any pass is built covers nothing and snapshots nothing. (7) An implementer's stop adds a build-end row; a researcher's adds none. (8) The v3 settings register exactly two events; v1's and v2's are unchanged. (9) A scripted `compact_boundary` yields a stream post-compaction row. (10) The v3 environment, shim, fixture path and `TMPDIR` hold no `.stamity-replay`, `stamity-replay-` or `REPLAY_`. (11) K11′ fails when the implementer's first tool call precedes the swap, or when neither an apply nor a seed at build end shows. (12) K15′ fails at 7 of 12. (13) K16′ fails for a pass swapped whose covering round never completed. (14) C5 fails on a notice for `vendor/contrib/u2-p1.patch` and passes on one for `src/store/query.ts`. (15) C6 fails on the K-inject-baseline main transcript's line 257 (the v2 leak). (16) Under `--protocol v1` and `v2`, `status` prints byte-identically on the existing canary fixtures. (17) The private hygiene gate prints PASS |
| `edgeCases` | Two passes named by one range are swapped in one hook call under one tool_use id. A swap that cannot restore the millisecond ends the run as `swap-failed` rather than continue with a changed time. A lane made after a swap has no `vendor/` (named in §15). The driver's own tests never run while a replay run is live |
| `depends_on` | v3-fixture, v3-measure |
| `verify` | From the private checkout: `STAMITY_REPO=<a public checkout holding both units> node --test runs/package-16/replay/driver/replay.test.mjs; echo exit=$?`, then `node scripts/repo-hygiene.mjs --kind governance --base <base sha>; echo exit=$?` |

### v3-reset — the v2 shapes aside, the instrument pinned, both shapes prepared

| Field | Content |
|---|---|
| `id` | v3-reset |
| `requirements` | REQ-CTX-015 |
| `files` | The replay home's `~/.stamity-replay/superseded-c6b686df/` (the moved v2 shapes, and `deps/` when v3's `base.patch` differs from v2's) and `~/.stamity-replay/shapes/` (new); the pinned instrument checkout `…/.stamity-worktrees/stamity/p16s2-instrument` (switched) |
| `interfaces` | The **instrument commit** `X` is the package branch head once every public unit has landed, the review loop has converged, the spec delta is merged and the gate of record and CI are green. In order: (1) no `~/.stamity-replay/run.lock`; (2) `mkdir ~/.stamity-replay/superseded-c6b686df && mv ~/.stamity-replay/shapes ~/.stamity-replay/superseded-c6b686df/` (and `deps/` the same way when v3's `base.patch` differs; `bin/` and `client.json` stay); (3) `git -C <instrument> switch --detach X`, with `evals/replay/` and `scripts/replay/` clean there; (4) from the driver folder, `node replay.mjs prepare-client --config-dir ~/.claude-alt` only if the folder's settings hash drifted from the client record; (5) `node replay.mjs prepare --shape baseline --cli-ref fed39ac --instrument-commit X --repo <instrument> --protocol v3`, then `--shape changed --cli-ref X` |
| `testCriteria` | Both shape records name `X`; both prepares exit 0; the moved folder holds the v2 shapes; `git -C <instrument> rev-parse HEAD` prints `X` |
| `edgeCases` | A lock present: wait for its holder. A dirty instrument checkout is refused, never cleaned by force. No worktree holding ignored captures is removed |
| `depends_on` | v3-fixture, v3-measure, v3-reader, v3-protocol, v3-driver |
| `verify` | `ls ~/.stamity-replay/shapes/baseline.json ~/.stamity-replay/shapes/changed.json` and `git -C <instrument> rev-parse HEAD` equal to `X` |

### v3-canary — the arrival proven live in both shapes

| Field | Content |
|---|---|
| `id` | v3-canary |
| `requirements` | REQ-CTX-015 |
| `files` | The private layer's `runs/package-16/replay/v3/canaries/K-swap-baseline/` and `K-swap-changed/` (`record.md`, `record.json`, `run.json`, `marker-settings.json`; `captures/` ignored) |
| `interfaces` | One run at a time, with no full test suite and no docs-site build on the machine while it runs: `node replay.mjs canary --id K-swap-baseline --shape baseline --units u1-p1,u1-p2,u2-p1,u2-p2,u3-p1,u3-p2 --placements u2-p1 --repo <instrument> --config-dir ~/.claude-alt --protocol v3`, then `node replay.mjs status --canary K-swap-baseline --protocol v3`; the same for `K-swap-changed` with `--shape changed`. The runner's notes per record: each pass's swap and the implementer's apply; each seed's state at build end, review start and round completion, and who removed any; the unit tests red at build end; the C1 hits, read one by one; the C10 quotes; the measurement's reading, recall included, as a preview of the calibration (not gated). **Mechanism:** interrupt when both records pass K1–K4, else both shapes run `auto-window` |
| `testCriteria` | Both `status` commands exit 0; each record names the instrument commit and the mechanism it decided; every C1 hit is read and recorded as about the seeds or not |
| `edgeCases` | K15′ below 8 in either shape: the seeds are re-cut (the failed record moved to `superseded-<commit>`, a new instrument commit, both shapes re-prepared). Any other failure: one fix round, then one more; after that the runs stop and the maintainer decides. A C1 hit that is about the seeds counts as a failed canary |
| `depends_on` | v3-reset |
| `verify` | `node replay.mjs status --canary K-swap-baseline --protocol v3; echo exit=$?` and the same for `K-swap-changed` |

### v3-pilots — one pilot per shape at the frozen instrument

| Field | Content |
|---|---|
| `id` | v3-pilots |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/v3/runs/<date>-replay-1/` and `-2/` (`RESULTS.md`, `summary.json`, exported and committed from the main checkout by path); the private layer's `runs/package-16/replay/v3/runs/<id>/` (never `captures/`) |
| `interfaces` | The instrument freezes when the first pilot starts. `node replay.mjs run --shape baseline --kind pilot --run-id <UTC date>-replay-1 --placements u2-p1,u3-p1 --mechanism <the canaries'> --repo <instrument> --config-dir ~/.claude-alt --protocol v3`, then `node replay.mjs export --run-id <id> --public <main checkout> --protocol v3`; the changed pilot as `-replay-2` |
| `testCriteria` | `node scripts/replay/score.mjs check --protocol v3 --runs <both pilots>; echo exit=$?` exits 0; the baseline pilot's pooled recall lies in [0.5, 0.95]; each RESULTS names every seed's state |
| `edgeCases` | Recall out of band: the runs stop, the cause is recorded, and the maintainer decides on a re-cut (a new instrument commit and restarted pilots). An invalid run is replaced, at most twice per shape |
| `depends_on` | v3-canary |
| `verify` | `node scripts/replay/score.mjs check --protocol v3 --runs <paths>; echo exit=$?` and `node scripts/leak-gate.mjs; echo exit=$?` |

### v3-scored — three scored runs per shape and the comparison

| Field | Content |
|---|---|
| `id` | v3-scored |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/v3/runs/<date>-replay-3/` onwards; `evals/replay/COMPARISON-v3.md`; the comparison's re-derivation case in `test/replay/compare.test.ts` |
| `interfaces` | Three scored runs per shape, alternating shapes, one at a time, under the frozen instrument and mechanism, each exported and committed by path; two more for a shape whose three differ by more than 2 seeds found. Invalid runs are replaced within the cap; a changed scored run invalid only for an uncovered pass is not. Then `node scripts/replay/score.mjs compare --protocol v3 --baseline … --changed … --pilot-baseline … --pilot-changed … --out evals/replay/COMPARISON-v3.md` |
| `testCriteria` | `test/replay/compare.test.ts` re-derives `compare()` over the committed v3 runs and equals the committed file's rows and `Merge gate:` line; `node scripts/replay/score.mjs check --protocol v3 --runs <all v3 runs>` exits 0; the leak gate prints PASS; the comparison names the instrument commit and the protocol's sha256 |
| `edgeCases` | More than 2 invalid runs in a shape: its rows read NOT-EVALUATED and the gate FAILs. A FAIL is recorded with each failing row's evidence and goes to the maintainer; this package neither fixes nor reverts the context economy |
| `depends_on` | v3-pilots |
| `verify` | `node scripts/replay/score.mjs check --protocol v3 --runs <all v3 runs>; echo exit=$?`, `npx vitest run test/replay/compare.test.ts; echo exit=$?`, `node scripts/leak-gate.mjs; echo exit=$?` |

## Execution order

1. `v3-fixture`, `v3-measure` and `v3-protocol` in parallel lanes; `v3-reader` after `v3-measure` (one writer on
   `measure.mjs`).
2. `v3-driver` (private) once `v3-fixture` and `v3-measure` have landed.
3. The review loop at Fable 5.1 over every unit (the security and performance lenses on `v3-driver`, whose hook writes
   files the session reads and runs git), the spec delta merged, the whole-branch deep review, the gate of record and
   CI: then the instrument commit `X`.
4. `v3-reset`, then `v3-canary`.
5. `v3-pilots`, then `v3-scored` and the comparison, unattended, one run at a time, about 40–50 minutes each.

No full suite, docs-site build or eval run shares the machine with a live replay run.

## Risks

| Risk | Severity | Guard |
|---|---|---|
| Implementers notice seeds while applying their patch, so few survive to review | Warning | K15′ needs 8 of 12 in each canary; a seed caught at build leaves the denominator; below 8 the seeds are re-cut |
| The orchestrator remembers a clean patch from research and compares it with an implementer's diff | Warning | the canary's C1 and C10; §15 names it; it would favour the shape that reads more |
| Reviewers name a seed at Minor, which the matcher does not credit, so recall falls under 0.5 | Warning | each seed breaks a documented contract or behaviour; the canary previews recall; the pilot's band stops the runs |
| A harness path reaches the session through a channel not closed here (`ps`, a listable client or replay folder) | Minor | C6 invalidates any run whose transcript shows one; none of the ten runs looked |
| A lane made after a swap has no untracked `vendor/`, or a build description names no pass | Warning | K11′ and K16′ in the canary; an uncovered pass invalidates a scored run (R7 as before) |
| The account's usage window runs out during the runs | Warning | the driver's capacity hold resumes within its process; no login switch while a run is prepared, running or held |
| The loop-character and sub-agent-token bars fail (the v2 canaries read 19,517 against 22,361 characters per pass, and 1.66 M against 1.28 M tokens) | Warning | none in this package: a FAIL goes to the maintainer with its evidence |
| The gate's margin (1 of 36) is smaller than the sampling noise at 12 seeds | Minor | named in §15; the thresholds do not move |

## Open questions

None. D1 and D2 are the maintainer's; every other choice above is a declared default for the plan gate.

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

- The harness channels this package leaves open: the settings path in `ps`, and the listable replay home and client
  folders. Harden them if a canary's C6 ever fires.
- A per-seed paired table in the comparison (found in both shapes, one or neither), and an "inconclusive" reading
  declared before the scored runs, as outside practice suggests. Both are informative, and the maintainer decides
  before Package 17's final replay.
- The matcher's severity rule: a Minor finding naming a seed is never credited. Revisit it if the pilots show seeds
  named at Minor.
