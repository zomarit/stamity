<!-- GENERATED FILE — do not edit by hand. Rewrite it with `node scripts/generate-docs.mjs`. -->

# Commands

A command is a touchpoint a human types. Ids carry the `cmd-` prefix the catalog applies so a command can never shadow a skill or agent of the same name; the typed touchpoint drops it. Authored in `content/commands/`.

9 commands.

### `cmd-ask`

Read-only codebase Q&A: parallel facet research, file:line-cited claims, confidence, contradictions, blocked list.

- **Tags:** `planning`
- **Load:** `on-demand`
- **Obsolete when:** clients natively answer codebase questions with cited, confidence-rated claims

### `cmd-board`

Work a backlog from any source — chat, file, or platform board: fill, pickup with readiness gate and handoff to work, groom, setup.

- **Tags:** `board`, `planning`
- **Load:** `on-demand`
- **Obsolete when:** clients natively bridge repo work to platform boards with status-only write-back

### `cmd-debug`

Hypothesis-driven debugging with observation-only instrumentation and user reproduction; fixes route through the work pipeline after root cause and a failing test.

- **Tags:** `implementation`
- **Load:** `on-demand`
- **Obsolete when:** clients natively enforce root-cause-before-fix with failing-test gates

### `cmd-plan`

Produce a persisted, reviewable plan from deep research — feature, bug, refactor, migration, test, or roadmap intent — consumed by work.

- **Tags:** `planning`
- **Load:** `on-demand`
- **Obsolete when:** clients natively produce persisted decomposed plans with complete per-unit interfaces

### `cmd-pr-resolve`

Resolve PR review comments: normalized findings, rigor-evaluated auto-declines with cited replies, one consolidated triage ask, signed replies.

- **Tags:** `review`, `devops`
- **Load:** `on-demand`
- **Obsolete when:** PR platforms natively triage and answer review threads with evidence-graded rigor

### `cmd-quick`

Tier-1 small-change lane with batch semantics and hard size/risk refusal thresholds; quality gates never skipped.

- **Tags:** `implementation`
- **Load:** `on-demand`
- **Obsolete when:** trivial-change quality gating is a native client feature

### `cmd-rework`

Intake and triage feedback on agent-delivered work: proof-block baseline, leftover scan, REVISE/DEFER routing, validated plan into the work pipeline.

- **Tags:** `review`, `implementation`
- **Load:** `on-demand`
- **Obsolete when:** clients natively triage delivered-work feedback against run proof records

### `cmd-spec`

Create and maintain the project spec: greenfield/brownfield auto-detect, converge scan on drift, confirm-gated truth merge, testability census.

- **Tags:** `planning`
- **Load:** `on-demand`
- **Obsolete when:** clients natively maintain a spec-of-record with drift detection and gated merge

### `cmd-work`

Execute a change end to end: frame, research, plan, build with sub-agents, prove with gates, review loop, QA checkpoint, proof block.

- **Tags:** `orchestration`, `implementation`
- **Load:** `on-demand`
- **Obsolete when:** target clients natively provide phased delegation with evidence-graded review loops and machine-readable run proof
