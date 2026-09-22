---
id: ux
type: skill
description: UX axis checks for the verify skill — the four-state contract per async surface, flow dead-ends, and user-facing string externalization.
tags: [review]
load: reference
obsolete_when: client tooling derives four-state coverage and flow dead-ends from the route graph without a gate
---

# UX axis

Flows, not pixels. Three questions decide this axis: does each surface that can
wait, fail, or come back empty say so; can a user always get out of where they
are; and do the words live somewhere they can be changed and translated.

Not applicable when the repo has no user-facing flow — no routes, no views. Rows
then record `not-applicable` citing that absence, per the run contract in
`SKILL.md`.

## Runnable checks

Each row: what it establishes · how to run it from detection facts · threshold.

- **`ux-four-state`** — every asynchronous surface renders loading, empty, error,
  and success. How: list surfaces that read remote data from call sites in the
  detected data layer; for each, match render branches or fixtures to the four
  states. Threshold: 4 of 4 per surface; a missing state is one `fail` row
  naming the surface and the state.
- **`ux-error-exit`** — no error state is a dead end. How: for each error branch
  found above, confirm an actionable control (retry, back, alternate route, a
  named way to report). Threshold: 0 error states with no exit.
- **`ux-flow-exit`** — no route is a trap. How: build the route graph from the
  router or route config; find nodes with no outbound navigation and no
  documented terminal role. Threshold: 0 undocumented terminal nodes.
- **`ux-string-external`** — user-facing text lives in the string layer. How:
  detect a message catalog or i18n config; count user-facing literals in view
  files. Threshold: with a catalog present, 0 inline user-facing literals; with
  none, report the literal count and mark the row `judgment`.
- **`ux-form-feedback`** — validation says which field failed and how to fix it.
  How: enumerate form submissions and their validation branches; confirm each
  error path names a field and a corrective action. Threshold: 0 field errors
  reported only as a generic message.
- **`ux-destructive-guard`** — destructive actions are confirmed or reversible.
  How: find delete, archive, overwrite, and cancel-order style handlers; confirm
  a confirmation step or an undo path. Threshold: 0 unguarded destructive
  handlers.
- **`ux-progress-signal`** — long operations report progress. How: find
  operations with no synchronous response (uploads, jobs, batch actions);
  confirm each renders progress or a queued acknowledgement. Threshold: 0 silent
  long operations.

## Judgment checks

- **`ux-flow-length`** — the primary task takes the fewest steps that keep it
  understandable, and each step earns its place.
- **`ux-copy-clarity`** — microcopy states cause and next action; a bare "went
  wrong" message with no cause and no action is a finding.
- **`ux-consistency`** — the same action is named, placed, and shaped the same
  way across surfaces.
- **`ux-recovery-cost`** — a plausible user mistake is cheap to undo, and the
  undo is discoverable at the moment it is needed.
