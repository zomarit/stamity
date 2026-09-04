---
id: spec
type: command
description: "Create and maintain the project spec: greenfield/brownfield auto-detect, converge scan on drift, confirm-gated truth merge, testability census."
tags: [planning]
load: on-demand
obsolete_when: clients natively maintain a spec-of-record with drift detection and gated merge
spawns: [researcher, spec-author, test-runner]
---

# /st-spec

Creates and maintains the project's spec of record under `docs/specs/`. One
touchpoint, four verbs, state-aware: it reads what the repo already has, names
the mode it picked, and only then acts.

Writes are delegated. `researcher` gathers evidence — repo signals, pattern
detection with `file:line` citations, route and schema inventory. `spec-author`
writes every file under `docs/specs/`. This command reads, dispatches, and
gates; it edits no spec file inline.

## Mode dispatch

| Repo state | Mode | What runs |
|---|---|---|
| No spec files under `docs/specs/` | `create` | greenfield/brownfield scoring, then a first spec plus the manifest |
| Spec absent or thin where a code-form artifact of record exists (test suite, OpenAPI/AsyncAPI file, typed schema) | `extract` | lift requirements out of the code-form artifact into prose that points back at it |
| Spec present, working tree clean | `check` | converge gap scan plus testability census, report only |
| Spec present, change in flight (plan artifact, or uncommitted diff on a specced surface) | `sync` | merge the change's spec delta into truth, confirm-gated |

Rows are read top to bottom and the **first match wins**. States overlap by
design: a brownfield repo with a test suite and no `docs/specs/` matches the
`create` row and the `extract` row both, and `create` takes it. The
mode-chosen line names the row that was beaten, so an operator who wanted the
lift re-runs with the explicit verb instead of guessing why the mode differed.

An explicit verb — `create`, `extract`, `check`, `sync` — wins over the detected
state. Detection is evidence, not authority.

**Every response opens with one line:**

`mode chosen: <verb> because <evidence>`

For example: `mode chosen: check because docs/specs/ holds 4 specs and the
working tree is clean`. A run that cannot name its evidence stops and asks
rather than guessing.

## Greenfield vs brownfield detection

`create` scores the repo before choosing a posture. Every probe is read-only
and the batch runs in one pass.

| Signal | Probe | Score |
|---|---|---|
| Source tree | tracked files under the language's source roots | +2 at >=10 files, +3 at >=200 |
| Commit history | `git rev-list --count HEAD` | +1 at >=5, +2 at >=50 |
| Dependency manifest | `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `pom.xml`, `Gemfile`, `composer.json` | +1 present; +1 more when its first commit is >=30 days old |
| Tests | any file matching the repo's test convention | +1 |
| Prior docs | `docs/` holding >=3 non-template markdown files | +1 |

Total >=3 is **brownfield**; total <=2 is **greenfield**. The score, the matched
rows, and the verdict go into the mode-chosen line. `--state=greenfield` or
`--state=brownfield` sets the posture by hand when the score misreads the repo.

### Greenfield posture

Bounded interview: **one** clarification round, at most five questions, each
with numbered options and a declared default. Anything still open after that
round ships as a `[NEEDS CLARIFICATION]` marker in the spec — it does not buy a
second round. The output is the PRD core: intent, personas, requirements with
acceptance criteria, risk list, test plan.

The spec format below closes at seven sections, so every one of those outputs
is named a home rather than assumed one, and the two records that are decisions
rather than requirements land outside the spec file:

| Greenfield output | Lands in |
|---|---|
| Intent, personas | **Intent** — what the surface is for and who meets it |
| Requirements, acceptance criteria | **Requirements**, then **Acceptance criteria**, one Given/When/Then per requirement id |
| Risk list | **Risks** |
| Test plan | **Acceptance criteria** plus one `test` pointer per requirement under **References**; there is no separate test-plan section |
| `Resolved clarifications` — question, chosen answer, date | an ADR stub under `docs/adr/`. A clarification resolved in the interview is a decision with a rationale, and decisions live in the ADR tree, not in a requirements file |
| Stack trade-off table, written only when the stack is undecided — one row per candidate, with the deciding criterion named in the header | the same ADR stub, as the alternatives the decision rules out |

An empty repo with no code and no answers still produces a spec: one
requirement per stated intent, everything else marked. The interview stops at
the round boundary, not when the questions run out.

### Brownfield posture

**No bulk backfill.** Day one produces a regenerable codebase map at
`docs/codebase-map.md` — inventory, not truth: module boundaries, entry points,
integration surfaces, and conventions, each with `file:line` evidence. The map
is regenerated on demand and is never merged into `docs/specs/`. The charter is
not this command's output: `AGENTS.md` is emitted by `stamity init` and refreshed
by `stamity sync`, and a spec run writes `docs/specs/`, that map, and the ADR
stubs it writes — never the charter.

Specs accrete per change: the first time work touches a surface, that surface
gets its spec file. A backfill request needs an explicitly named scope — a
module path, a feature name, a route group. "Backfill the specs" with no named
scope gets one question offering the three narrowest readings; the default when
no answer arrives is to decline the sweep and keep accreting per change. A
200k-line codebase is the case the rule exists for: a sweep of that size
produces prose nobody verified and everybody then trusts.

Brownfield requirements that change an existing contract state their
expand-contract path and the rollback step for each phase. A spec that mandates
a destructive cutover with no reverse path is incomplete.

## Artifact model

- `docs/specs/` is **current truth**: one markdown file per feature or domain,
  flat tree, no nesting.
- `docs/specs/manifest.md` is the **Deliverable Manifest** — the single source
  of truth on what exists. One row per spec file: id, covered surface, status,
  last-verified commit.
- When a spec file and the manifest disagree about what is specified,
  **manifest wins**. The discrepancy is reported, and the spec file is
  reconciled to the manifest — not the reverse.
- Work in flight carries **spec deltas** inside its plan artifact, under three
  named sections: `ADDED`, `MODIFIED`, `REMOVED`. A delta is a proposal; truth
  changes only at the merge gate.
- `/st-work` merges deltas at its Prove phase. `sync` performs the same
  merge when this command is invoked directly.

**Same-delivery mandate:** a diff that changes behavior ships its spec delta in
the same change. A behavior change that arrives with no delta is a `Warning`
finding against that change, not a follow-up ticket.

## Sync tiers

Automation is graded by what a wrong merge would cost.

| Tier | What moves | Automation |
|---|---|---|
| T1 | Execution and task record — status, owner, progress | Fully automatic. It lives in the work ledger and on the board, and is never written into a spec file. |
| T2 | Converge gap scan and delta merge at Prove | Auto-proposed, confirm-gated, append/merge-only. New sections and additions are shown as a diff; the operator confirms before any write. |
| T3 | Requirement-text mutation — changing what a requirement says, or retiring one | Never silent. Each mutation is presented with its requirement id, before/after text, and the evidence that prompted it. |

A T2 proposal is shown, not described. The operator reads the exact lines that would be added,
verbatim, before confirming: a paraphrase of an addition is not the addition, and a confirmation
given against a paraphrase confirms text nobody saw.

A converged spec makes `sync` a **byte-stable no-op**: the scan finds no gap, no
file is opened for writing, and the run reports `no changes`. Re-running `sync`
against an unchanged tree yields an identical report. A run that rewrites a
converged file — reordering rows, reflowing prose, restamping a date — is a
defect in the merge, not a convergence event.

## Spec format

Markdown prose with structure. A rigid data body degrades the reasoning of the
agent that reads it, so the file stays readable and only its head is parsed.

Each spec file opens with a YAML head carrying three keys:

```yaml
id: checkout-flow
status: current | draft | superseded
obsolete_when: the checkout surface is retired or replaced by a named successor
```

Body sections, in order:

1. **Intent** — what this surface is for, in prose. Two paragraphs at most.
2. **Invariants** — what holds regardless of implementation. One line each.
3. **Requirements** — stable ids of the form `REQ-<area>-<nnn>`, allocated once
   and not renumbered. A retired requirement keeps its id and gains a
   `superseded by` pointer to the id that replaced it.
4. **Acceptance criteria** — Given/When/Then per requirement. One example:
   `GIVEN a cart holding one item WHEN checkout is submitted with an expired
   card THEN the order is rejected and the cart is preserved`.
5. **References** — typed pointers to the code-form artifacts that carry the
   real contract.
6. **Risks** — one line each: what could break, and the signal that it is
   breaking.
7. **Concerns** — compact debt register. One row per item: claim, `file:line`
   evidence, impact, disposition. An item with no evidence gets no row.

### Typed reference pointers

| Pointer | Target | Rule |
|---|---|---|
| `test` | suite path or test id | Once the test exists it is the normative spec of record for that requirement: prose describes intent, the test defines passing. Tests name the requirement id they cover. |
| `api` | OpenAPI/AsyncAPI file plus operation id | The file is the contract; prose restates no schema. |
| `mockup` | markup or design file | The visual contract for a UI surface. |
| `source` | function or module path | The implementation a requirement was lifted from during `extract`. |

`[NEEDS CLARIFICATION]` markers are load-bearing: a spec carrying one is not
handed to `/st-work`. `check` lists every marker with its file and
requirement id; `create` and `extract` emit markers rather than inventing an
answer.

**Testability census** (`check` mode): every acceptance criterion is either
machine-checkable — a named test, a gate command, a measurable threshold — or
carries a `judgment:` tag naming the role that decides. The census reports
per-file counts and names every criterion that is neither. A criterion whose
test exists is confirmed through a `test-runner` spawn running the repo's test
gate, `${STAMITY:VERIFY_GATE_TEST}`, and returning its per-gate result; a
criterion pointing at a test that does not exist is reported as a gap.

The spawn is part of the census, not a step after it: the census dispatches `test-runner` in the
turn it classifies, and does not hold the dispatch for the operator's go-ahead.

**Inferred ADR:** when `create` or `extract` meets a decision baked into the
code with no written record, it writes an ADR stub under `docs/adr/` carrying
the decision as observed, `file:line` evidence, the alternatives the code rules
out, and a confidence rating. Intent that cannot be cited is recorded as an
open question, not as a rationale.

## API leg

For an HTTP or event surface, the OpenAPI or AsyncAPI file **is** the api-spec
of record. The prose spec points at it by operation id and adds only what a
schema cannot carry: intent, invariants, and acceptance criteria that span
operations. A schema duplicated into prose is a defect — drop the copy, keep
the pointer.

`check` on an API surface classifies every operation:

| Class | Meaning | Action |
|---|---|---|
| Matching | In both, shapes agree | None |
| Undocumented | In code, absent from the spec | Propose an addition (T2) |
| Stale | In the spec, absent from code | Propose retirement with evidence (T3) |
| Drifted | In both, shapes disagree | Report both shapes; code is evidence, not automatically truth |

Auth and error-response differences get their own row: a drifted security
scheme is a `Critical` finding, not a schema nit.

## Dispatch

Every artifact this command reports goes out through a spawn. `spec-author`
takes one mode per invocation and the brief names which, so a run never leaves
the mode to be inferred from the target path:

| Sub-agent | When | Brief carries |
|---|---|---|
| `researcher` | brownfield `create`, every `extract`, and any `check` needing a code inventory | objective, scope boundaries, questions, named output sections, depth, tool tier |
| `spec-author` · `greenfield` | `create` on a repo scored greenfield | stated intent, the interview's answers, target files under `docs/specs/`, manifest rows to reconcile |
| `spec-author` · `brownfield` | `create` on a repo scored brownfield, and every `extract` | researcher findings with their `file:line` evidence, the touched surface, target files, manifest rows |
| `spec-author` · `architect` | an inferred ADR, and the greenfield interview's resolved clarifications | the decision as observed, its evidence, the alternatives it rules out, the stub path under `docs/adr/` |
| `spec-author` · `docs` | `docs/codebase-map.md`, on brownfield day one and on every regeneration | the inventory — module boundaries, entry points, integration surfaces, conventions — each claim with its `file:line`, and the map path as the target. The map is documentation about the tree, so docs mode's rule holds it: every claim exists at a cited path |
| `test-runner` | the `check` mode's testability census, wherever a criterion names a test that exists | `${STAMITY:VERIFY_GATE_TEST}` and the criteria being confirmed |

The census reads the runner's structured per-gate result — the gate command,
pass or fail, and the verbatim failing excerpt — and never runs the gate in this
command's own context. `check` stays report-only on both sides: the runner
applies no edit, and this command writes nothing in that mode.

Fan out researchers when the questions are independent — one per module or
surface — and merge through a single writer: `spec-author` owns every file
under `docs/specs/`. Two authors on one spec file is a protocol violation.
Sub-agents do not question the operator: an ambiguity comes back as
`BLOCKED_AMBIGUITY` naming the readings, and this command asks.

## Return contract

Every run closes with:

- The `mode chosen:` line, restated with its outcome.
- Status: `DONE`, `BLOCKED_AMBIGUITY`, `BLOCKED_DEPENDENCY`, or
  `BLOCKED_FAILURE`.
- Findings, each with severity `Critical`, `Warning`, or `Minor`, a `file:line`
  or requirement id, and a one-line disposition.
- Manifest delta: rows added, changed, retired — or `none`.
- Open markers: every `[NEEDS CLARIFICATION]` in the touched files — or `none`.
- Not done: each gap the run left open — or `none`.
- Next step — derived from this run's own state, never a fixed menu: an open
  `[NEEDS CLARIFICATION]` marker makes resolving it the step, since a marked
  spec is not handed to `/st-work`; an unconfirmed T2 or T3 proposal makes that
  confirmation the step; a census gap makes the criterion it named the step. A
  run that closed with none of those says so in the same line.

`create` against a repo that already holds a hand-authored spec asks before
writing anything:

1. **Supplement** — keep the file, add the missing sections and requirement
   ids. Default when no answer arrives.
2. **Replace** — write a fresh spec; the prior file stays in git history.
3. **Abort** — write nothing, and report what would have changed.

An existing spec file is not overwritten without that answer.
