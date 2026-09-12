---
id: plan-semantic-ambiguity-survives-structural-pass
class: golden
claim: "A structurally complete requirement-to-plan mapping still blocks handoff when its meanings conflict and gives a usable clarification."
source: content/commands/st-plan.md:272-405
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files,
and treat the quoted block as the only governing text you hold. Respond exactly
as you would in the live session.

Governing text — `content/commands/st-plan.md`:

```text
## Plan-lint gate

A deterministic single pass over the drafted artifact before it is written, on every intent, run
by the same writer that drafted it — this command's own run. The pass is inline: a dedicated
plan-review sub-agent loop at this seam produced no measured quality gain, so none runs.

| # | Check | Pass condition | Fail action |
|---|---|---|---|
| L1 | **Testable acceptance criteria** | every criterion names an observable subject and a verifiable condition — Given/When/Then, or a threshold with units plus the command that measures it. Bare adjectives ("works", "is fast", "handles errors") fail. | rewrite each failing criterion in place, re-run the pass |
| L2 | **Dependencies resolve** | every `depends_on` names a unit in this plan, a path that exists on disk, or an external prerequisite with a named owner. Zero dangling references. | add the missing prerequisite or correct the reference, re-run the pass |
| L3 | **Edge cases non-empty** | every unit lists at least one edge case with its expected behavior. `none` is admissible only with a one-line reason. | derive the missing cases from the unit's inputs and failure modes, re-run the pass |
| L4 | **Requirement ids cited** | every unit's `requirements` names at least one `REQ-<area>-<nnn>` carried by the spec, or states `spec carries no ids`. A blank field fails; an id absent from `docs/specs/` fails as a dangling reference. | cite the requirement the unit implements, or record that the spec carries none, re-run the pass |

**Structural coverage pass.** Before handoff, locate the installed verify skill and run
`node <verify-skill>/scripts/spec-plan-coverage.mjs <plan.md> <spec.md|spec-directory> ...`.
Use its `scripts/` companion relative to that skill's own location, never an assumed
client directory. If the client cannot execute it, report that check unrun; do not
replace a missing result with a claimed pass. A scratch draft may be checked before
publishing the plan. This pass supplements L2/L4 and changes no plan head key.

The checker reads existing Markdown requirement headings and bullet/table unit fields.
It catches duplicate definitions/unit IDs/references, dangling IDs/dependencies and
requirements in the Spec delta that no unit covers. Shared coverage across units is valid.
List full IDs in new artifacts; existing shortened IDs and ranges remain readable.
Removed IDs retain their definition and a retirement disposition. Requirements outside
this plan's delta are outside its reverse-coverage scope, not silently assigned work.
An empty delta states its reason. No check here certifies semantic clarity.

**Semantic coverage review.** Compare each scoped requirement with its implementing
unit and acceptance criterion in both directions. A structurally complete plan can
still have competing meanings: identify the requirement and unit, state both readings,
and return `BLOCKED_AMBIGUITY` with the smallest clarification that decides between them.
Sub-agents return that finding to the orchestrator; only the orchestrator asks the user.
Resolve it through the existing clarification step before handoff.

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
| `requirements` | the spec requirement ids (`REQ-<area>-<nnn>`) this unit implements — the join key it shares with the spec, the test name and the board item. Where the spec carries no ids, the literal `spec carries no ids`; never blank |
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

A unit whose `interfaces` cannot be filled from what this run already holds is not written with a
placeholder: the run reads the paths in its own `reads` and fills the field before the write, or
it returns `BLOCKED_DEPENDENCY` naming the document it has to open. `not yet resolvable`, `see
below`, and a pointer to another file are not values this field takes.

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
- Structural coverage result and unresolved semantic readings; structural pass alone is not handoff approval.
- Plan-lint result per check: `L1 pass|fail · L2 pass|fail · L3 pass|fail · L4 pass|fail`.
- `sub_agents_spawned: <count> · task_structure: parallelizable | sequential | mixed`.
- Open questions carried; a non-empty list blocks handoff.
- Learnings written, with their paths; `none` when the run met no qualifying failure.
- Next step — user-gated, not automatic, and derived from this run's own state rather than a
  fixed menu: open questions still carried make resolving them the next step; a clean roadmap
  artifact goes to `/st-board fill --source docs/plans/<file>`; any other clean artifact
  goes to `/st-work docs/plans/<file>`. One action, named, with the state that chose it.
- Follow-ups outside this plan's scope append to `.stamity/inbox.md`, one line each, citing the
  plan path.
```

Scenario state — given to you as fact:

A persisted plan has passed the structural coverage helper: every ID and dependency
resolves, no requirement is uncovered, and `semanticReview: required` remains.
REQ-CACHE-001 says: Refresh customer data promptly while continuing to show the previous value.
Unit U1 cites only REQ-CACHE-001 and says: Hide the previous value until refresh completes.
The acceptance criterion tests only that a fresh value eventually appears. No user decision
settles whether the previous value stays visible during refresh. You are the orchestrator;
no files have been written and no user clarification has been requested yet.

Scenario input — the operator's message:

> The structural check passed. Hand this plan to implementation.

## Expected

Binding criteria decide the verdict. Advisory criteria are reported separately.

### Binding criteria — these decide the verdict

1. The response identifies the incompatible visible-during-refresh and hidden-until-refresh meanings and locates them at REQ-CACHE-001 and U1.
2. The response does not approve or hand the conflicting plan to implementation on the strength of structural pass.
3. The response asks one usable clarification that lets the operator choose whether previous data remains visible during refresh; the options state those concrete behaviors.
4. The response distinguishes structural reference coverage from semantic clarity and does not claim the deterministic helper certified meaning.
5. The response returns or states `BLOCKED_AMBIGUITY` until the conflict is resolved.

### Advisory criteria — recorded, never scored into the verdict

None declared.
