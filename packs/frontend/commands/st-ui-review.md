---
id: ui-review
type: command
description: "Reviews a named screen or flow against the design system, the UI states and WCAG 2.2 AA through the design-quality agent and browser evidence, returning findings with path:line and never editing."
tags: [review]
load: on-demand
readonly: true
obsolete_when: clients natively review a named screen or flow against the repo's design system and WCAG 2.2 AA with rendered evidence and path:line findings
spawns: [researcher, design-quality]
---

# /st-ui-review

Reviews one named screen or flow as it stands at one commit: against the design system the
repo already has, the four UI states, and WCAG 2.2 AA. **This command reviews; it never edits.**
Its output is a list of findings, each at a `path:line`, and every fix leaves through `/st-work`.

## Scope

One run takes one target:

- **A route** — the screen it renders, with the components it composes.
- **A component path** — that component in each state it can render.
- **A named flow** — its steps in order, each stated as what a person does and what they see.

An invocation that names no target asks once, with options drawn from the routes the repo
declares, and declares the most recently changed route as the default-if-no-response. A
whole-repository pass is not this command: it is the verify skill's `ui` and `ux` axes, run
on their own.

## Evidence, in order

1. **The design-system inventory**, `.stamity/design-system-inventory.md`. When it is absent or
   its recorded commit is behind the head, `st-design-system-detect` runs first and the review
   reads what it writes. Its `Status` row decides whether token findings are raised at all.
2. **Browser evidence.** `st-browser-evidence` runs with the flow's steps stated as observable
   behaviour, one scenario per step, and the suffix `ui-review`, so its bundle lands at
   `.stamity/evidence/browser-<sha>-ui-review.json` and the unsuffixed bundle a `/st-work`
   proof block cites on the same sha is left as it was. The review's own bundle is the evidence for every
   criterion only a render decides; when its preflight stops, the bundle still names the probe
   that stopped it.
3. **The verify artifacts** for the current sha, `.stamity/verify/ui-<sha>.json` and
   `.stamity/verify/ux-<sha>.json`, read where they exist and never regenerated here: a stale
   or absent artifact is reported, not refreshed.

A criterion only a render decides — contrast as computed on screen, 2.4.7 focus visible, 2.5.8
target size, a state reached only by running the flow — reads `not measured` when the browser
evidence could not run. It is never graded from source and never guessed.

## Loop

1. **Frame.** One line: `surface: <target> · sha: <short sha> · inventory: clear | blocked |
   regenerated · browser: available | not measured · output: findings`.
2. **Detector, browser and file map, in parallel.** The detector runs only when the inventory
   needs it; the browser evidence runs either way; one researcher per step of the flow, or one
   for a route or component, returns the files that render its step, with `path:line` for the
   branch of each state. All go out as one batch: none reads another's output. Researchers
   read only.
3. **Review.** One design-quality spawn on a whole-surface brief: the head commit and the
   surface's paths the researchers mapped, in place of a diff range; the criteria (the
   inventory's tokens, the four states, WCAG 2.2 AA); and the inventory and evidence bundle
   paths. The brief names no report path, so the agent returns its full result inline. It
   reads each file with `git show <commit>:<path>`, and the named surface stands in for "the
   change" in its exclusions.
4. **Merge.** This command assembles the result it returns; it writes no file. It passes
   design-quality's findings block through unchanged and adds the criteria the evidence could
   not reach as `not measured`, each with the probe that stopped it.

## Findings

- Every finding names a `path:line`. A claim that cannot be located is rewritten as a question
  or dropped, as design-quality's own contract has it.
- Every WCAG finding names its criterion number and its measured value against the required
  one: "3.1:1 measured against 4.5:1, 1.4.3, at `path:line`".
- A token finding names the token the inventory holds for the literal it replaces. With the
  inventory's `Status` at `blocked: competing token sources`, the review raises no token
  finding and names the contested categories as one decision for the operator.
- Severity is design-quality's `Critical` / `Warning` / `Minor`, never lowered here.
- **Routes.** A fix to the surface goes to `/st-work`; a finding against the token scale
  itself (a missing step, a value that fails a criterion on every use) goes to `/st-plan`.

## Reviews, never edits

- **Spawn set.** `researcher` and `design-quality`, both read-only. No implementer and no
  fixer: no path in this command reaches a role that edits.
- **Write set.** The command writes nothing itself. The two skills it runs write their own
  evidence: the inventory and the browser bundle, and nothing else. No spawn is handed a
  report path, so no agent writes one either.
- **Routing.** A one-line fix is still a finding. It leaves as a row with its route, and
  `/st-work` applies it under its own gates.

A review that fixes what it finds cannot report what it found: the surface it measured is gone,
and its evidence stops matching the tree.

## Refusals

| Situation | Behaviour |
|---|---|
| No target named | Ask once, routes as options, the most recently changed one as the default |
| The target resolves to no file | Stop, naming every path and route pattern tried; review nothing invented |
| design-quality is deselected in this setup | `BLOCKED_DEPENDENCY` naming the agent; no review from researchers alone |
| No browser harness, or its preflight stops | Review from source; every render-only criterion reads `not measured`, with the probe that stopped it |
| Inventory `Status` is blocked | No token findings; the contested categories named as one operator decision |
| Asked to fix what it found | A one-line refusal: "UI review is read-only; `/st-work` applies these findings." No patch, no diff, no old-to-new line handed over |

## Return contract

- **status:** `DONE` | `BLOCKED_AMBIGUITY` | `BLOCKED_DEPENDENCY` | `BLOCKED_FAILURE`.
- **severity** for findings: `Critical` | `Warning` | `Minor`, as design-quality graded them.
- `DONE` carries the surface and its paths, the sha, the inventory state (`clear`, `blocked`
  with its categories, or regenerated this run), the evidence bundle path or the probe that
  stopped it, the criteria applied, those not applicable and those `not measured`, and the
  findings with their locators, routes and count. A review that found nothing returns `DONE`
  with an empty list and a count of zero.
- `BLOCKED_*` carries what was attempted, what blocks it, and the smallest unblocking input:
  a target that resolves to no file, a deselected design-quality agent, an inventory the
  detector could not write. It carries no finding count, not even zero.
- Sub-agents do not put questions to the operator. A researcher or design-quality spawn that
  returns `BLOCKED_AMBIGUITY` hands its readings up; this command runs the ambiguity gate and
  re-dispatches that brief narrowed.
