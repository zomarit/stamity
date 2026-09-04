---
id: plan-artifact-head-and-units-shape
class: golden
claim: "The plan artifact is persisted at docs/plans/<NNN>-<slug>.md with NNN the next free number, its head carries id, intent, stamp and reads as required keys with approach present for migration intent only and depends_on optional, and every unit carries all eight fields the command lists — requirements never blank, interfaces inline, at least one edge case."
source: content/commands/st-plan.md:289-342
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-plan.md`, "Plan artifact shape":

```text
## Plan artifact shape

Path: `docs/plans/<NNN>-<slug>.md`, `NNN` the next free number. Head:

[...]
---
id: <slug>
intent: feature | bug | refactor | migration | test | roadmap
stamp: <head-commit-sha> <UTC date>
reads: [<path>, ...]
approach: <one line — migration intent only>
depends_on: [<plan path>, ...] — <sequenced or follow-up plans only>
---
[...]

`id`, `intent`, `stamp` and `reads` are required. `approach` and `depends_on` are optional: an
absent optional key is a valid head, and the freshness guard treats it as satisfied rather than
stale. `depends_on` at head level names whole plan artifacts — a follow-up run's predecessor, or
the preceding file of a split — while the per-unit `depends_on` below names unit ids inside this
artifact. Two scopes, one word, and the key exists at both so neither reference dangles.

Sections, in order:

[...]
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

[...]
**Fresh-context criteria.** The artifact is executable by an implementer holding no session
history. Two checks before the write: (1) every unit's `interfaces` resolve without opening another
document; (2) the artifact plus the files it names fits a fresh context window.

A unit whose `interfaces` cannot be filled from what this run already holds is not written with a
placeholder: the run reads the paths in its own `reads` and fills the field before the write, or
it returns `BLOCKED_DEPENDENCY` naming the document it has to open. `not yet resolvable`, `see
below`, and a pointer to another file are not values this field takes.
```

Scenario state — the run so far, given to you as fact:

> `intent chosen: feature because a net-new capability was named ("add a --json flag to
> the `stamity status` verb")`.
> Head commit `9f3c1ab`, and today is `2026-09-02` UTC.
> The research depended on three paths: `src/cli.ts`, `src/commands/status.ts`, and
> `docs/cli-reference.md`.
> `docs/plans/` currently holds `001-worktree-lane.md` and `002-board-fill-source.md`.
> `docs/specs/cli-surface.md` carries the requirement id `REQ-cli-140` for the status
> verb's output contract.
> `REQ-cli-140` states the contract in full: `stamity status --json` prints one JSON object
> to stdout with the keys `workspace`, `branch`, `managedFiles`, `driftedFiles` and
> `lastSync`, each a string except `managedFiles` and `driftedFiles`, which are integers;
> exit code 0 on success and 1 on a drift finding; nothing is printed to stderr on success.
> The flag is declared `--json`, boolean, default false, no value argument and no short alias.
> The change is one unit, slug `json-flag-render`: it writes `src/commands/status.ts` and
> `test/commands/status.test.ts`, and the repository's test gate is `npm run test`.
> The unit depends on no other unit in this plan.
> Nothing has been written yet.

Scenario input — the operator's message:

> Before you write it: show me the head you are about to put on the artifact, the path you
> are writing it to, and the `json-flag-render` unit in full.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The head carries all four required keys: `id`, `intent`, `stamp`, `reads`.
2. `intent` is `feature`.
3. `stamp` carries the head commit `9f3c1ab` and the UTC date `2026-09-02`, and `reads`
   lists the three paths the research depended on.
4. The head must NOT carry `approach` — that key is migration intent only, and an absent
   optional key is a valid head.
5. The artifact path is under `docs/plans/`, takes the next free number `003`, and is
   given as `docs/plans/003-<slug>.md` with a slug rather than as a placeholder.
6. The unit carries all eight fields the table lists: `id`, `requirements`, `files`,
   `interfaces`, `testCriteria`, `edgeCases`, `depends_on` (with `none` where the unit
   depends on nothing), and `verify`.
7. `requirements` is not blank: it names `REQ-cli-140`. It must NOT read `spec carries no
   ids`, because the scenario states the spec carries one.
8. `interfaces` is filled inline from the facts above — the flag's declared shape (`--json`,
   boolean, default false, no value argument, no short alias) and the `REQ-cli-140` output
   contract's keys, types and exit codes — rather than deferred, marked "not yet fillable",
   or given as a pointer to a document the implementer must open.
9. `edgeCases` lists at least one edge case with its expected behavior.

### Advisory criteria — recorded, never scored into the verdict

None declared for this case. Nothing in it turns on a routing destination, a hand-off
sentence, a choice between sibling labels, or the completeness of a stated reason.
