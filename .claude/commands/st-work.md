---
description: "Execute a change end to end: frame, research, plan, build with sub-agents, prove with gates, review loop, QA checkpoint, proof block."
---

# /st-work

Execute one change end to end. Five phases — Frame, Understand, Plan, Build,
Prove — closing with a QA human checkpoint and a machine-readable proof block.

## Phase 0 — Frame

Seconds, not ceremony. In order:

1. **Parse intent.** Restate the request as one outcome sentence plus in-scope /
   out-of-scope bullets. Ambiguity gate: ask ONLY when two or more readings
   diverge materially in artifacts, cost, or risk — one question, numbered
   options, a declared default-if-no-response. Otherwise proceed without asking.
2. **Derive intensity.** light / standard / deep, from three signals: expected
   diff size (against the ~400-line unit ceiling), risk surface
   (security-sensitive paths, public contracts, migrations, new dependencies),
   and novelty (first touch of a subsystem, no matching learnings). Operator
   override: `--effort light|standard|deep` wins over the derivation. Tier
   table under Dials.
3. **Model plan + cost preview.** Assign each role a class from the four-class
   ladder (Dials) and emit the spawn plan — role, class, count per phase — with
   a cost order of magnitude, before any spawn.
4. **Deferral inbox.** Read the deferral inbox and surface every item whose
   paths overlap the files this change will touch. Present overlapping items as
   fold-in candidates; the operator decides. This read is guaranteed on every
   run — `/st-board`'s `## Deferral inbox` section owns the reader census
   and names this phase in it; the count lives there, not here.

## Phase 1 — Understand

Spawn brief-driven researcher sub-agents — parallel when their questions are
independent under the parallel-safety conditions (Dispatch contract). Typical
briefs: repo context for the touched area; spec delta against `docs/specs/`;
prior learnings and recorded failures. Every brief carries objective, scope +
task boundaries, questions, named output sections, depth, and tool tier.
Researchers return findings with file:line citations; a question that cannot be
answered comes back as a named unknown and is carried into the plan, not
silently dropped.

## Phase 2 — Plan

- **Plan-artifact intake.** This phase plans in-flow — session-scoped, executed
  on approval, persisted nowhere; the reviewable plan artifact on disk belongs
  to `/st-plan`. Discovery is a glob plus a rule, not a guess: read
  `docs/plans/*.md`, keep the artifacts whose head `intent:` and Context cover
  this request, and take the newest `stamp:`. Two artifacts still matching
  after that is one ambiguity-gate question, never a pick. Nothing found is a
  normal outcome — this phase plans in-flow and says so.
- **Freshness guard.** `/st-plan` owns the intake contract; its
  `## Plan artifact shape` section and the freshness guard stated beside it are
  the contract of record, and this phase applies them rather than restating
  them. Two head keys are read and no others: `stamp:` and `reads:`. On a
  failed guard, re-plan with the stale artifact as input; a stale plan is never
  executed silently. Staleness is a guard verdict recorded in the run report —
  it is not a return status, and this flow mints no fifth one.
- **Decompose** into reviewable units: one unit = one concern, ≤~400 changed
  lines and ≤8 files. The 400 is a ceiling, not a target — typical units land
  well below it. Split oversized concerns here at Plan, not mid-build. Each
  unit carries complete interfaces so a context-free implementer can execute
  it, and names the spec requirement ids it implements — or records that the
  spec carries none — the join key the plan unit, the implementer's delta and
  the test name share.
- **Plan gate.** light: auto-continue. standard/deep: present the unit list
  and ask, with execute-now as the declared default.

### Contract census

The Phase 2 → Phase 3 boundary, run once before the first parallel dispatch.
File-disjoint is not contract-disjoint: each unit emits one row per shared
contract it touches — exported signature, persisted field, wire key, event
payload, shared constant, configuration key — naming the producer, the
consumers a repo-wide search found, and the change kind. Two units needing one
contract take the facade-hold: the unit whose acceptance criteria require the
change owns it, the peer codes against the held shape. The `contract-census`
rule carries the row grammar and the hold mechanics; this step is where the
flow runs them.

Exit criterion: every shared contract the batch touches sits on exactly one
unit's row set, and every row closes as `clean`, `reconciled(N)`, or
`N unreconciled` naming each consumer left behind. A batch that cannot state
that dispatches serially instead — inferring independent contracts from
disjoint file lists is the failure this step exists to catch.

Skip condition, stated so a run does not stall on it: a greenfield repo has no
prior consumers to collide with and runs no census, and a batch of one unit has
no peer to collide with. Either case skips the step and records the skip in one
line rather than emitting an empty census.

## Phase 3 — Build

One implementer per unit, parallel across disjoint units, single writer per
file. Tests ship with the change that motivates them — test-first when a
unit's acceptance criteria are expressible as a failing test up front. Lint
and type fixes land inline in the owning unit; they spawn nothing. An
implementer that finds its unit mis-scoped returns BLOCKED_AMBIGUITY or
BLOCKED_DEPENDENCY (Return contract) instead of improvising scope.

## Phase 4 — Prove

### Gates

Each Prove pass spawns a dedicated test-runner sub-agent that runs the gates
and returns a structured result: gate-by-gate pass/fail, the exact command run
per gate, and verbatim failing excerpts (test names, assertion diffs, build
errors). Bare pass/fail is not a result. The orchestrator's context stays
clean; the fixer receives the debugging signal intact. Judgment-only passes
(spec review, plan review) may run inline — they execute no commands.

Gate commands are the charter's verification gates: `npm run lint && npm run typecheck && npm run test`
for the full pass; `npm run test`, `npm run lint`,
and `npm run typecheck` for targeted re-runs.

### Review loop

Evidence-graded reviewer ↔ fixer loop over the built units:

- The reviewer returns verdict + confidence + findings graded Critical /
  Warning / Minor, each carrying file:line evidence. Behavior claims without
  evidence do not post.
- Critical and Warning findings route to a fixer; the fix re-enters review. An
  approval below the declared confidence gate re-reviews once on a stronger
  class before it counts.
- Iteration cap: 4 rounds by default, operator-configurable within 1..10 — the
  engine clamps to that band, and this text stays lockstepped with the
  engine's default.
- Escalation ladder: rounds 1–3 keep the same fixer; round 4 spawns a fresh
  fixer on a stronger model class; at the cap the run stops as BLOCKED_FAILURE
  to the human with the open findings attached. Round 4 is the default cap's
  last round — an operator who raises the cap within the band buys further
  fresh-fixer rounds, each costing a full round of latency and spend, and adds
  no new stage. Convergence is expected by round 2–3.
- Escape before the cap: an at-confidence approval exits; an unchanged finding
  set across two consecutive rounds exits as diverged (BLOCKED_FAILURE);
  findings oscillating between two states exit as diverged rather than burning
  the remaining rounds.
- Minor/nit findings are ledgered, never loop-triggering. On re-review, new
  nits are suppressed: only regressions on prior findings and new
  Critical/Warning findings count.

Two client events sit under this loop and they do different jobs. The
task-completion event is the one that HOLDS: a gate emitted there can refuse
the completion, so the cap binds mechanically. The sub-agent-completion event
only COUNTS — it carries the round number and the finishing verdict, and it
never blocks, so a gate emitted there is telemetry. Exactly one of the four
supported clients publishes either event. Each is an additional check on top of
this text, not a replacement for it. On clients without those events the ladder
and the cap are prompt-carried only, and nothing outside this body enforces
them. The enforcement is uneven by construction, and the flow says so rather
than promising one bar everywhere.

### Specialist pass

Three review lenses run beside the loop: `security`, `design-quality`,
`performance`. A lens is pulled in by a changed path or by the task's topic —
the trigger roster is the single source of those patterns and each specialist
body names the surfaces it answers for, so this text carries the mechanism and
no copy of the rows. Deep runs the full pass; standard and light run the
`security` lens on a trigger-path match; light runs no other lens. The
charter's universal floor holds at every tier, so a tier that skipped the
security lens outright made that floor false — a trigger-path match is the
narrowest shape that keeps it true.

- **Read-only.** A specialist returns findings and edits nothing. Repair is the
  fixer's, so no lens answers its own finding in the following round.
- **Evidence bar.** Every behavior claim carries `path:line`. A claim that
  cannot be located is dropped rather than posted — it spends a fix round on an
  assertion nobody can check.
- **Severity floor.** Only Critical and Warning findings reach the QA
  checkpoint; Minor rows are ledgered and travel with the run. Not reaching the
  checkpoint is not the same as not closing: the run closes its own Minor rows
  against the exit invariant, normally as deferred with the rationale that put
  them below the floor. A Minor row reaches the operator only when its
  disposition is itself ambiguous, which is the ambiguity floor firing on the
  row rather than the severity floor being overridden.
- **Precision kill switch.** Each lens measures its own false-positive rate at
  the checkpoint against the bar its body states, and downgrades itself to
  advisory for the following run once it reaches that bar: findings recorded,
  none blocking, and the downgrade declared in its return. A lens past its bar
  says so rather than keeping the flow's attention on its own noise.
- **`performance` blocks only on a breached budget.** With no declared budget
  over the surface, its strongest finding is a Warning.

### QA checkpoint

The mandatory closing checkpoint, human-facing, at every intensity:

1. Emit a what-to-verify summary: each observable behavior this change added
   or altered, with a concrete check a human can run in under a minute.
2. Invoke the qa skill for the guided pass.
3. When the change has a user-facing surface, offer a browser-evidence skill
   run; captured screenshots and console output attach to the proof block.

The checkpoint covers what automation cannot.

### Proof block

Every run ends with a proof block, machine- and human-readable, doubling as an
audit record:

- gate results — per gate: command, pass/fail, failing excerpt if any
- review verdicts + confidence, per round
- decisions trace — every gate decision, ASK outcome, and deferral with its
  rationale
- artifacts touched — path + owning sub-agent
- per-action attribution — agent identity, tool used, outcome
- recommended next step — derived from this run's own state, never a generic
  suggestion: the findings it deferred, the acceptance criteria it left
  uncovered, the inbox rows it appended. A run that closed with none of those
  says so in the same line.

Cite native platform artifacts where they exist — per-sub-agent transcripts,
hook-gate outcomes, session logs. A self-quoted completion marker is the
fallback when no native artifact exists, and the proof block states which
evidence class each citation is.

The proof block is backed by the findings ledger: write-ahead JSONL, one row
per finding, appended before the finding is acted on. One row, seven fields:

| Field | Content |
|---|---|
| `id` | `<run-id>/<phase>/<n>` — stable across every rewrite of the row |
| `phase` | the phase that raised the finding |
| `source` | the sub-agent role that returned it |
| `severity` | `Critical` · `Warning` · `Minor` |
| `evidence` | `path:line`, or the gate command plus its failing excerpt |
| `state` | `open` · `fixed` · `deferred` · `rejected` |
| `rationale` | required on `deferred` and `rejected`, empty otherwise |

A row is appended `open` before the finding is acted on and rewritten in place
as its state moves; the id is what makes the rewrite converge instead of
appending a second row. Run-exit invariant: no finding ends the run pending —
every row closes as fixed, deferred with rationale, or rejected with reasoning.

The invariant binds at exit, and a run holding a live question has not exited.
Where closing a row means choosing between dispositions that differ materially
in cost or blast radius, the ambiguity floor applies and the run asks — asking
is not a pending finding, it is the run declining to invent an answer it does
not have. The run then closes on the reply. An unattended run has no reply to
wait for, so there the declared default executes and the row closes with it,
which is the same rule read in the other direction.

Both persist under the state directory, in `.stamity/runs/` — one record per run
carrying the fields above, with that run's ledger rows beside it. That is the
baseline `/st-rework` reads and the directory `/st-pr-resolve` appends
its own record to; a record already written is read-only to every later run.

### Side effects

Run after gates pass; each lands in the run report:

- **Spec delta merge.** The change's `ADDED/MODIFIED/REMOVED` spec deltas
  merge into `docs/specs/` truth — auto-proposed, confirm-gated,
  append/merge-only; the spec-author sub-agent applies the merge on
  confirmation, and a converged spec is a byte-stable no-op.
- **Dependency-audit note.** Each new or bumped dependency gets a one-line
  note, and the dep-audit skill owns the fields it carries — advisories,
  licences, the path to a transitive package. Invoke it for them; deriving
  them here again is a second answer to a question that already has an owner.
- **Learnings capture.** Failures met and resolved during the run land in
  `.stamity/learnings/`.
- **Pull-request emission.** Where a platform is linked and the change sits on
  a branch, the close opens that branch's pull request — or updates the one
  already open — and emits `pr.linked` carrying the link. With no linked
  platform the step is a no-op: the branch is left for the operator and the run
  says which, rather than reporting a link nothing created.
- **Board progress events.** Emit idempotent progress events — phase
  transition, acceptance-criterion done, PR link, terminal state — with zero
  platform knowledge: the board layer maps events to platform actions. When no
  board source is linked, emission is a silent no-op; events publish only when
  a linked source exists.

## Dispatch contract

Every spawn in every phase runs under these contracts:

- **Parallel safety.** Fan out only when all three conditions hold:
  (1) read-only or disjoint writes, (2) deterministic aggregation of results,
  (3) no shared mutable state. A dependency edge is the only valid reason to
  serialize; token cost is not.
- **Single-writer synthesis.** Reads fan out; exactly one writer merges
  results into any one artifact. Two writers on one file is a protocol
  violation, not a race to tolerate.
- **Build isolation, native-first.** Parallel implementers run under the
  client's own isolation primitive where it has one — a per-sub-agent workspace
  the client provisions, or its parallel-agent lane. The primitive in use is
  declared once, before the first Phase 3 dispatch, and travels in the proof
  block. One of the four supported clients publishes no primitive at all: there
  the fallback is manual, an operator-prepared second checkout per parallel
  unit, and a run that cannot get one serializes Phase 3 rather than fanning
  out into a shared tree. Isolation is never inferred from disjoint file lists —
  it is declared or it is absent, and absent reads as serialize.
- **Failure ladder.** A failed sub-agent is retried once with an enriched
  brief — the failure excerpt plus sharpened task boundaries; a second failure
  reassigns the work to a stronger model class; a third goes to the human as
  BLOCKED_FAILURE. No silent drops: every spawn resolves to a result or a
  BLOCKED status in the run report.
- **Context degradation.** Under budget pressure, degrade summaries before
  evidence. Security-relevant content — findings, injection-screening results,
  secret-scan hits — is exempt from truncation at every budget level, deep
  included.
- **Findings ledger.** The write-ahead JSONL described under Proof block;
  failure-ladder outcomes and degradation events append to it, so the ledger —
  not orchestrator memory — is the recovery point.

## Dials

### Intensity

| Tier | When | What changes |
|---|---|---|
| light | small diff, low risk, familiar ground | Skips: researcher fan-out (one inline context read instead), the plan-gate ASK (auto-continues), the `design-quality` and `performance` specialist lenses, and the whole-branch deep review. Keeps: unit decomposition, at least one reviewer round, the `security` specialist lens on a trigger-path match, every gate, the QA checkpoint, the proof block. |
| standard | the default | Full spine: researcher fan-out sized to independent questions; plan gate asks (execute-now default); review loop to the cap; a specialist lens on a trigger match. |
| deep | high risk surface, novel territory, wide diff | standard plus the full specialist pass and a whole-branch multi-lens review on the frontier class, run once the review loop converges and before the QA checkpoint. |

Auto-derived at Frame; `--effort` wins. Gates, QA checkpoint, and proof block
hold at every tier — intensity prunes roles and fan-out, not floors.

### Model ladder

Four classes, assigned per role. Class names only — concrete model ids live in
per-client config (`stamity config`), and after substitution the resolved class
is verified against this plan.

Where the assignment comes from: a role's class is declared once, in that
role's own agent definition, and the engine projects that one declaration into
the `model` and `effort` keys wherever the client has a field the class
resolves into — one client carries effort inside the model value rather than a
key of its own, and one carries it nowhere at all. Where nothing resolves — a
class the client publishes no name for, with no operator pin behind it — the
key is left out rather than filled with a guess, and the client's own default
applies. A missing key is the ladder declining to invent a sizing decision,
not a role running unsized; `stamity config` is where an operator states one.

The table below restates those declarations for the check above; it does not
decide them. So when a row and an agent file disagree, the agent file is the
truth and the row is the stale side — report the row rather than re-sizing the
role to match it. The only two placements no agent file can declare are the
flow's own escalation and drop, marked as such below.

| Class | Assigned to |
|---|---|
| frontier | `reviewer`, escalated for the whole-branch deep review that runs once the review loop converges and before the QA checkpoint — a flow placement, declared by no agent file |
| advanced | `reviewer` every round; `implementer`; `spec-author`; the `security` and `design-quality` specialists |
| standard | `researcher`; `creator`; the `performance` specialist; `fixer` on rounds that still need judgement — its declared class |
| economy | `test-runner`; `fixer` dropped here once a round is mechanical — lint, format, rename sweeps — a flow placement |

## Testing philosophy

> No green, no done. Real-deal-first — mocks justified inline. Tests ship with
> the change that motivates them. Verification runs in a dedicated runner
> sub-agent, never in the orchestrator's context. The QA phase covers what
> automation can't. Green counts only against tests the implementer did not
> weaken: gating tests are not edited, deleted, or special-cased in the change
> that makes them pass — any test modification in that change requires the
> same inline justification as a mock, and review treats changed tests as part
> of the diff under scrutiny.

## Return contract

Every sub-agent returns a structured result the orchestrator consumes without
re-reading its transcript:

- **status:** DONE | BLOCKED_AMBIGUITY | BLOCKED_DEPENDENCY | BLOCKED_FAILURE
- **severity scale** for findings: Critical / Warning / Minor
- DONE carries the unit's artifact list and evidence pointers. BLOCKED_*
  carries what was attempted, what blocks, and the smallest unblocking input.
- Sub-agents do not ask the operator questions. Ambiguity returns as
  BLOCKED_AMBIGUITY naming the competing readings; the orchestrator runs the
  ambiguity gate from Frame.
