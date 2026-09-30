---
id: spec-create-small-repo-whole-app
class: golden
claim: "On a brownfield repository under 5,000 source lines, a request naming the app opens with a mode-chosen line that states the line count and asks one scope question whose first numbered option and declared default is the whole app — asked, never assumed — and the chosen scope is written by spec-author in brownfield mode as spec files carrying REQ- ids."
source: content/commands/st-spec.md:40-46,61-63,90-110,173-175,262-266
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-spec.md`, "Mode dispatch" and "Greenfield vs
brownfield detection":

```text
**Every response opens with one line:**

`mode chosen: <verb> because <evidence>`

For example: `mode chosen: check because docs/specs/ holds 4 specs and the
working tree is clean`. A run that cannot name its evidence stops and asks
rather than guessing.

[...]

Total >=3 is **brownfield**; total <=2 is **greenfield**. The score, the matched
rows, and the verdict go into the mode-chosen line. `--state=greenfield` or
`--state=brownfield` sets the posture by hand when the score misreads the repo.

[...]

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
module path, a feature name, a route group, or the whole app on a small repo,
asked and never assumed. Below 5,000 source lines, counted over the files the
Source tree probe found, the whole app is the first numbered option beside the
narrowest readings and the declared default when the request names the app
("create the spec", "spec this app"); the mode-chosen line states the count.
"Backfill the specs" with no named scope gets one question offering the three
narrowest readings; the default when no answer arrives is to decline the sweep
and keep accreting per change. A 200k-line codebase is the case the rule exists
for: a sweep of that size produces prose nobody verified and everybody then trusts.
```

Governing text — the same file, "Spec format" (Requirements) and "Dispatch":

```text
3. **Requirements** — stable ids of the form `REQ-<area>-<nnn>`, allocated once
   and not renumbered. A retired requirement keeps its id and gains a
   `superseded by` pointer to the id that replaced it.

[...]

| `researcher` | brownfield `create`, every `extract`, and any `check` needing a code inventory | objective, scope boundaries, questions, named output sections, depth, tool tier |
| `spec-author` · `greenfield` | `create` on a repo scored greenfield | stated intent, the interview's answers, target files under `docs/specs/`, manifest rows to reconcile |
| `spec-author` · `brownfield` | `create` on a repo scored brownfield, and every `extract` | researcher findings with their `file:line` evidence, the touched surface, target files, manifest rows |
| `spec-author` · `architect` | an inferred ADR, and the greenfield interview's resolved clarifications | the decision as observed, its evidence, the alternatives it rules out, the stub path under `docs/adr/` |
| `spec-author` · `docs` | `docs/codebase-map.md`, on brownfield day one and on every regeneration | the inventory — module boundaries, entry points, integration surfaces, conventions — each claim with its `file:line`, and the map path as the target. The map is documentation about the tree, so docs mode's rule holds it: every claim exists at a cited path |
```

Scenario state — given to you as fact:

> The repository has no `docs/specs/` directory, and no test suite, OpenAPI or AsyncAPI
> file, or typed schema.
> The read-only probe batch returned: Source tree — 34 tracked files under `src/` (+2);
> Commit history — 41 commits (+1); Dependency manifest — `package.json`, first committed
> 118 days ago (+2); Tests — none (0); Prior docs — `docs/` holds one markdown file (0).
> Total 5.
> The 34 files the Source tree probe found hold 1,157 source lines.

Scenario input — the operator's message:

> /st-spec — create the spec for this app.

Respond with this run's opening response, up to the point where it waits or dispatches.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The response opens with one line of the form `mode chosen: create because <evidence>`,
   and the evidence names the missing `docs/specs/`, the brownfield score of 5 with its
   matched rows, and the source-line count, 1,157.
2. The response asks exactly one scope question with numbered options, the whole app first,
   beside narrower readings of the kind the text names — a module path, a feature name, a
   route group.
3. The whole app is the declared default when no answer arrives.
4. The response must NOT assume the whole-app scope: it writes no spec file and dispatches
   no `spec-author` for the specs before the answer arrives or the default applies.
5. The response must NOT make declining the sweep, or a codebase map with no spec, the
   declared default of this question.
6. The response states that the chosen scope is written by `spec-author` in `brownfield`
   mode from the `researcher`'s `file:line` findings, as spec files under `docs/specs/`
   whose requirements carry `REQ-<area>-<nnn>` ids, and that this command writes no spec
   file itself.

### Advisory criteria — recorded, never scored into the verdict

1. The response names the regenerable codebase map at `docs/codebase-map.md` as the
   day-one inventory that sits beside the specs.
