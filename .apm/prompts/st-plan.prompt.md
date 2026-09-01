---
description: Produce a persisted, reviewable plan from deep research — feature, bug, refactor, migration, test, or roadmap intent — consumed by work.
---

# /st-plan

Deep multi-angle research turned into one persisted plan artifact under `docs/plans/`,
decomposed into units an implementer can execute without this session's history. The run
writes that artifact and nothing else: no product file moves here, and execution is a
user-gated switch to `/st-work`.

## Boundary vs work

| Axis | `/st-work` Plan phase | `/st-plan` |
|---|---|---|
| Output | in-flow decomposition held in the session | persisted `.md` artifact under `docs/plans/` |
| Lifetime | session-scoped; gone when the run ends | reviewable across sessions and authors |
| Gate | execute-on-approval, continues into Build | the run ends at the artifact |
| Consumer | the same run's Build phase | a later `/st-work` run, or `/st-board fill` |
| Pick it when | scope is settled and the work starts now | research spans several angles, or a human reviews before code moves |

**Freshness guard — the intake contract `/st-work` applies to a persisted plan.** This
command owns the contract; `/st-work` cites this section and adds no inputs of its own.

- **Inputs: two head keys, nothing else.** `stamp: <head-commit-sha> <UTC date>` and `reads:`,
  the paths the research depended on. No spec version, no per-file fingerprint, no content
  hash — the guard is cheap by design, and an artifact that would need more than these two
  keys was decomposed at the wrong seam.
- **Mechanism.** Per `reads:` path, compare the recorded `stamp:` sha against the commit that
  last touched that path. Unchanged → that path is fresh. Moved → that path is stale.
- **Verdict, not a status.** `fresh` when every path holds; `STALE` naming the moved paths
  otherwise. `STALE` is a guard verdict recorded in the run report — it is never a terminal
  state, and neither command mints a fifth one beyond the four in the Return contract.
- Staleness is per-path: units whose `reads:` did not move stay executable, so a one-file drift
  does not discard a six-unit plan — the affected units re-run research, refresh the stamp,
  then Build.
- **A `reads:` path that no longer exists is a failed guard for that path**, reported with the
  path named and re-planned like any other stale unit. A deleted dependency is a fact about the
  repo, not an error that ends the run.
- **An absent optional head key satisfies the guard.** The guard reads `stamp:` and `reads:`
  and nothing else, so an artifact written before `approach:` or `depends_on:` existed is
  fresh, not stale.
- A stale plan is re-planned at the seam that produced it, not patched mid-Build.

## Intent routing

One run resolves ONE intent. Detection scores the request; `--intent=feature|bug|refactor|migration|test|roadmap` skips scoring.

| Intent | Strong signals | Weak signals |
|---|---|---|
| Feature | net-new capability named; a user story; "add", "build" | "support X"; a persona sentence |
| Bug | observed defect with a symptom; a stack trace; repro steps | "broken", "regression", "flaky" |
| Refactor | structure change with behavior preserved; "extract", "decompose", "debt" | "clean up", "hard to change" |
| Migration | version or technology move, X → Y; an end-of-life notice | "upgrade", "deprecated" |
| Test | verification strategy for existing behavior; a named coverage gap | "add tests", "what should we test" |
| Roadmap | sequencing across several items; milestones; "what order" | "priorities", "next quarter" |

Match rule: one strong signal, or two weak ones. Emit `intent chosen: <intent> because <matched signals>` before any research starts.

**Ambiguous intent — one ASK with a declared default.** Two intents firing is the common case: a
defect whose fix is a restructure reads as both bug and refactor. Ask once, numbered, default stated.

> Signals match bug (`<signal>`) and refactor (`<signal>`). (a) bug — diagnose the defect, remedy
> scoped to the symptom. (b) refactor — restructure with behavior preserved. (c) bug first,
> refactor as a follow-up plan. Default if unanswered: (a) — an observed defect outranks
> structural intent.

Splitting one request into two half-plans is a defect: one artifact, one intent, one lint pass.
When both intents are real, sequence two runs (option c) and let the second plan's `depends_on`
name the first artifact.

**Shared intake — one batched read pass, orchestrator-inline, every intent:**

1. Charter repo facts: stack, verification gates. Detection does not re-run here.
2. `docs/specs/` manifest headers: what truth exists, and where this request lands in it.
3. `.stamity/learnings/` entries touching the same area — a repeated recorded failure is a
   process defect, so prior failures shape the plan before research widens it.
4. `.stamity/inbox.md` deferred items overlapping the scope: fold them in, or leave them with a
   one-line reason.
5. History for the touched paths (bug, refactor, and migration intents).

**Research fan-out.** Each intent section below names its research questions. Spawn one
`researcher` per independent question, in parallel — a dependency edge is the only reason to
sequence. Typical width 2-4; 5-6 when the request spans several modules. `spec-author` drafts the
spec-delta section from the returned findings. A run that spawns nothing has skipped the research
this command exists for: the intake above is inline reading, not research. Sub-agents return
findings; one writer merges them into one artifact, and that writer is this command's own
orchestrating run — never a sub-agent. `researcher` and `spec-author` return findings and write
nothing, the run drafts every section from them, and the run also executes the plan-lint pass
over its own draft. Naming the writer is what makes the single-writer rule checkable instead of
an undeclared spawn write.

## Feature

Research questions: codebase impact (affected modules, integration points, coupling) · analogous
implementation (the closest existing feature and the conventions it set) · risk (security,
performance, back-compat, breaking consumers).

**Dimension probing.** One batched ASK covering only the dimensions the request leaves open:
data (shape, source, volume, validation) · behavior (success, failure, concurrency) · UI states
(loading, empty, error, permission) · security (authorization, data sensitivity, input validation,
rate limits) · performance (volume, pagination, caching) · integration (features touched, shared
state, events) · back-compat (existing data or behavior that changes) · observability (logs,
metrics, error surface) · testing (what counts as working) · rollout (flag, phasing, reversal).
Dimensions the request already answers are skipped. Every dimension resolved by an assumed default
is recorded in the artifact with the default that was assumed.

**Convention alignment.** Each unit cites the reference file (`path:line`) whose pattern it
follows for structure, state handling, error shape, data access, and test layout. A unit that
diverges states why in one line — divergence is a recorded decision, not an accident.

**Model-backed features.** A feature that calls a model carries an eval unit: an offline eval set,
a pass threshold, and the failure classes the threshold gates. The `ai-evals` rule holds the
criteria — it is description-scoped, not path-scoped, so name it when the unit is written rather
than waiting for a file match; the plan points at it instead of restating them.

Output: units plus a spec delta (`ADDED`/`MODIFIED` requirement ids with Given/When/Then criteria).

## Bug

**Report, do not fix.** This intent produces a diagnosis, ranked hypotheses, and a failing-test
design; it changes no product file. Remediation runs elsewhere: `/st-debug` while reproduction
is still open, `/st-work docs/plans/<file>` once the plan is the remedy. A bug plan that edits
product code has broken its own contract, and the review that follows treats it as a defect.

Research questions: symptom trace (entry point to divergence) · blast radius (flows, data
integrity, related reports) · history window (when the behavior changed and with what).

**Ranked hypotheses** — ordered by evidence, not by how cheap the fix would be:

| Rank | Hypothesis | Evidence (`path:line`) | Disconfirming observation | Cost to test |
|---|---|---|---|---|
| 1 | `<mechanism, stated as cause → symptom>` | `<file:line>` | `<the observation that would refute it>` | `<minutes / hours>` |

A hypothesis with no disconfirming observation is not a hypothesis — rewrite it as one, or drop it.

**Introduction window.** Name it as `<sha>..<sha>` (last known-good to first known-bad) with the
narrowing method: history bisect over the reproducing check, lockfile diff, or deployment record.
"Not narrowed" is a legitimate answer when it names what blocked the narrowing — an invented
window is worse than an open one.

**Unit 1 is the failing test** that encodes the symptom: it fails on the current head for the
stated reason, and it is the acceptance evidence the executing run proves green.

## Refactor

**Behavioral invariants first** — what may not change under any transformation:

| # | Invariant | Verified by | Status |
|---|---|---|---|
| 1 | `<observable behavior>` | `<test path, or the command that proves it>` | covered / uncovered |

**Phase 0 test scaffolding.** Every `uncovered` invariant becomes unit 0: characterization tests
pinning current behavior before one transformation lands. Every transforming unit declares
`depends_on: [unit-0]`. A refactor plan holding uncovered invariants with no unit 0 does not leave
the plan-lint gate.

**Every phase green.** Each unit leaves the verification gates passing on its own; no unit borrows
green from a later one. Sequence to that rule and state the verification command per unit — a
sequence that is red between units is a single unit that was split at the wrong seam.

**Scope test.** If an external contract moves (public signature, wire shape, stored schema), the
intent is feature or migration: re-route rather than carrying a contract change inside a refactor.

## Migration

**Resolve the graph first — delegate it, do not re-derive it.** This intent's whole trigger set is
dependency movement, and both of its judgement inputs — the manual-class count in the table below,
and the two breaking-change axes at the end — are claims about packages nobody has listed yet.
Invoke the dep-audit skill before the approach is chosen: it resolves the installed graph from the
lockfile, scans advisories, flags licences, and returns one update-risk class per package (`patch` ·
`minor` · `major` · `pinned-back` · `unmaintained`). That report is an input to this section, never
something the section computes for itself — advisories and licences already have one owner, and a
second derivation is a second answer that can disagree with the first.

How the classes land here: `major` is where the breaking changes come from, so each one's
per-package migration note is what the severity and codemod axes below are applied to, and the
`Manual` count that falls out is what the incremental-vs-direct table reads. `pinned-back` names a
pin phase 0 either lifts or records a reason for. `unmaintained` is a replacement question rather
than a bump, so it is scoped as its own change instead of being carried inside a phase. A report the
skill marked `partial` carries that word into the artifact head: an approach chosen over a graph one
source could not be read for is a decision short an input, and the artifact says which.

**Incremental or direct — decide before decomposing:**

| Input | Favors incremental | Favors direct |
|---|---|---|
| Consumers | many, or owned outside this repo | few, all in-repo |
| Rollback cost | high — data or live traffic involved | low — revert one commit |
| Coexistence | both versions can run side by side | mutually exclusive |
| Manual-class count | high (see classes below) | low |

Record `approach: incremental | direct because <deciding input>` in the artifact head.

**Phase skeleton, one rollback per phase:**

| Phase | Goal | Rollback |
|---|---|---|
| 0 Preparation | coverage over affected paths, version pinned, baseline captured | revert prep commits; no product behavior has moved yet |
| 1 Non-breaking | additive changes valid on both versions | revert the additive commit; both versions still build |
| 2 Consumers | migrate call sites in reviewable batches | per-batch revert behind the compatibility layer |
| 3 Cleanup | remove compatibility layer, old version, dead flags | last reversible point, recorded before cleanup starts |

**Classify every breaking change on two axes.** Severity: `Blocking` (build or types fail) ·
`Behavioral` (compiles, semantics shift silently — the class that needs tests before the move) ·
`Cosmetic` (deprecation warning only). Codemod class: `Mechanical` (one named transform, gates
verify it) · `Assisted` (transform plus per-site review) · `Manual` (semantic judgment per site).
Carry the counts in the head — `<n> blocking / <n> behavioral / <n> cosmetic` and `<n> mechanical
/ <n> assisted / <n> manual` — because a high manual count against many consumers is the
incremental signal, and a mechanical-only set with few consumers is the direct one.

## Test

**Strategy matrix** — one row per layer that earns its place:

| Layer | Scope | What it proves | Gate placement | Planned count |
|---|---|---|---|---|
| Unit | `<modules>` | `<invariant class>` | per-PR | `<n>` |
| Integration | `<boundaries>` | `<contract across the boundary>` | per-PR | `<n>` |
| End-to-end | `<flows>` | `<user-visible path>` | per-PR / nightly | `<n>` |
| Property | `<pure functions>` | `<invariant over generated input>` | per-PR | `<n>` |
| Contract | `<APIs, events>` | `<shape agreement with consumers>` | per-PR | `<n>` |

**Priority outlines** — each case names its target and the observable it asserts:

- **P0** — correctness and security-critical paths; a failure is a stop-ship.
- **P1** — primary user flows and the contracts other teams consume.
- **P2** — secondary flows, error branches, known-fragile areas.
- **P3** — stretch coverage, explicitly droppable under time pressure.

**CI gates:**

| Gate | Trigger | Threshold | On failure |
|---|---|---|---|
| `<gate command>` | per-PR / nightly | `<pass condition>` | block merge / alert |

State what stays uncovered and why — an unstated gap is the failure mode this intent exists to
prevent. A coverage percentage is recorded only beside the behavior it protects.

## Roadmap

**Dual lens.** Two lanes, explicitly mapped. Business milestones carry the outcome, the metric
they move, and the date that binds them; technical milestones carry the capability gained or the
debt cleared. Each business milestone names the technical items that unblock it; each technical
milestone names the business outcome it serves, or is marked `enabling` with its rationale.

**Stage-adaptive prioritization.** Stage comes from the charter's maturity tier when set,
otherwise from one batched ASK (stage, user scale, compliance surface, deployment maturity):

| Stage | What leads | What waits |
|---|---|---|
| Pre-revenue / early | time to first value; one reversible deployment path | scale work, polish |
| Growth | retention, the measured bottleneck, production hardening | feature breadth |
| Scale / regulated | reliability, compliance evidence, governance | opportunistic features |

**Zero business context.** When business inputs are unavailable, the artifact opens with
`Business lens unavailable: <what was missing>` and ships the technical lane alone. Market size,
revenue impact, and competitor timing are not inferred: an invented business claim is a worse
artifact than an honest single-lane one.

**Consumer.** The persisted roadmap is handed to `/st-board fill` as a referenced-file source
— fill extracts each item with its priority bucket, business/tech lean, and spec `Ref:`. The file
stays repo-side truth for content; the board owns status. This command opens no board and writes
no board item.

## Plan-lint gate

A deterministic single pass over the drafted artifact before it is written, on every intent, run
by the same writer that drafted it — this command's own run. The pass is inline: a dedicated
plan-review sub-agent loop at this seam produced no measured quality gain, so none runs.

| # | Check | Pass condition | Fail action |
|---|---|---|---|
| L1 | **Testable acceptance criteria** | every criterion names an observable subject and a verifiable condition — Given/When/Then, or a threshold with units plus the command that measures it. Bare adjectives ("works", "is fast", "handles errors") fail. | rewrite each failing criterion in place, re-run the pass |
| L2 | **Dependencies resolve** | every `depends_on` names a unit in this plan, a path that exists on disk, or an external prerequisite with a named owner. Zero dangling references. | add the missing prerequisite or correct the reference, re-run the pass |
| L3 | **Edge cases non-empty** | every unit lists at least one edge case with its expected behavior. `none` is admissible only with a one-line reason. | derive the missing cases from the unit's inputs and failure modes, re-run the pass |

A failing check blocks the write. Three consecutive failed passes on the same check means the
request is under-specified: stop and return `BLOCKED_AMBIGUITY` naming the check and the unit that
keeps failing.

## Plan artifact shape

Path: `docs/plans/<NNN>-<slug>.md`, `NNN` the next free number. Head:

```
---
id: <slug>
intent: feature | bug | refactor | migration | test | roadmap
stamp: <head-commit-sha> <UTC date>
reads: [<path>, ...]
approach: <one line — migration intent only>
depends_on: [<plan path>, ...] — <sequenced or follow-up plans only>
---
```

`id`, `intent`, `stamp` and `reads` are required. `approach` and `depends_on` are optional: an
absent optional key is a valid head, and the freshness guard treats it as satisfied rather than
stale. `depends_on` at head level names whole plan artifacts — a follow-up run's predecessor, or
the preceding file of a split — while the per-unit `depends_on` below names unit ids inside this
artifact. Two scopes, one word, and the key exists at both so neither reference dangles.

Sections, in order:

1. **Context** — the problem, the decision taken, what is out of scope. Two to four sentences.
2. **Spec delta** — `ADDED` / `MODIFIED` / `REMOVED` requirement ids with Given/When/Then
   criteria, stated against `docs/specs/`. `/st-work` merges the delta into truth at its Prove
   phase; this command proposes and does not merge. An empty delta carries its reason — a test or
   roadmap plan often changes no requirement.
3. **Units** — the executable core. Per unit:

| Field | Content |
|---|---|
| `id` | stable slug, the target of `depends_on` |
| `files` | paths this unit writes; disjoint from every unit that can run beside it |
| `interfaces` | the exact signatures, schemas, props, and error shapes the implementer needs, inline |
| `testCriteria` | the assertions that prove the unit, each testable under L1 |
| `edgeCases` | at least one, with its expected behavior |
| `depends_on` | unit ids, or `none` |
| `verify` | the command that proves this unit green |

4. **Risks** — each with a severity: `Critical` blocks handoff · `Warning` proceeds with a named
   mitigation · `Minor` recorded, not gating.
5. **Open questions** — a `[NEEDS CLARIFICATION]` marker blocks handoff to `/st-work` until
   it is resolved.

**Fresh-context criteria.** The artifact is executable by an implementer holding no session
history. Two checks before the write: (1) every unit's `interfaces` resolve without opening another
document; (2) the artifact plus the files it names fits a fresh context window.

**Oversized plan.** When check (2) fails, split into sequenced files `<NNN>-<slug>-01.md`,
`-02.md`, … — each self-complete, with its own context, units, spec-delta slice, and stamp. Each
file names the preceding one in its head `depends_on`. A stub pointing at a sibling for its
interfaces defeats the criteria: every file stands alone, or the split landed at the wrong seam.

## Side effects

Two, both after the artifact is written, both reported in the Return contract below. No product
file moves here, and neither side effect is a third write channel for the plan itself.

- **Learnings capture.** A failure met and resolved while researching — a reproduction that
  needed a specific setup, a constraint nobody had written down — lands in `.stamity/learnings/`
  through the learn skill's capture path. The bar is that skill's, not this command's:
  non-obvious, verified, repo-specific. A run that met no qualifying failure writes none and
  says so, because a silent zero and an unrecorded finding read identically.
- **Deferral-inbox append.** Follow-ups this plan deliberately left out append to
  `.stamity/inbox.md`, one row each, citing the plan path. That inbox is the rendezvous
  `/st-board fill` triages and `/st-work` reads at its framing phase, so a deliberate
  exclusion stays visible instead of dying with the session.

## Return contract

Terminal state, one of: `DONE` · `BLOCKED_AMBIGUITY` · `BLOCKED_DEPENDENCY` · `BLOCKED_FAILURE`.

Close the run with:

- `status` plus a one-line outcome.
- `intent chosen: <intent> because <matched signals>`.
- Artifact path(s) written, with the unit count.
- Plan-lint result per check: `L1 pass|fail · L2 pass|fail · L3 pass|fail`.
- `sub_agents_spawned: <count> · task_structure: parallelizable | sequential | mixed`.
- Open questions carried; a non-empty list blocks handoff.
- Learnings written, with their paths; `none` when the run met no qualifying failure.
- Next step — user-gated, not automatic, and derived from this run's own state rather than a
  fixed menu: open questions still carried make resolving them the next step; a clean roadmap
  artifact goes to `/st-board fill --source docs/plans/<file>`; any other clean artifact
  goes to `/st-work docs/plans/<file>`. One action, named, with the state that chose it.
- Follow-ups outside this plan's scope append to `.stamity/inbox.md`, one line each, citing the
  plan path.
