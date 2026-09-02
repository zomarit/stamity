---
description: "Tier-1 small-change lane with batch semantics and hard size/risk refusal thresholds; quality gates never skipped."
---

# /st-quick

Applies small, obvious changes inline and gates them like any other change. Tier 1 only:
anything larger leaves before the first edit, not after it.

## What quick is not

Quick differs from `/st-work` by contract, not by effort setting. It has no board source,
no issue or PR state, no phase state, and no persisted plan artifact; no research phase, no
review loop, no QA checkpoint. Those are absent by design, which is why the thresholds below
are hard rather than advisory — the change that needs them has to go where they exist.

Charter invariant 7 names one carve-out from delegated implementation, and this lane is it:
Tier-1 edits apply inline. Verification does not. Gates run in the `test-runner` sub-agent,
which is what keeps "the gates ran" a claim from somewhere other than the writer.

## Trivial signals

An item qualifies when it matches one of these and no threshold fires:

- Single-file edit whose behavior change is exactly the one described.
- Constant, config value, or environment default update.
- Typo, comment, or user-facing string correction.
- Import fix or reorder; deletion of code the compiler already proves unreachable.
- Rename of a symbol that is local to one file.
- Documentation edit.

An item that fits none of these cleanly does not qualify. Classification defaults toward
leaving, because a misclassified item costs a full re-run in `/st-work` while a
conservatively-routed one costs a command switch.

## Thresholds and refusal

Any single row firing ends quick for that item. Hard refusal: there is no proceed-anyway
option, no confirmation prompt that unlocks it, and no operator flag that raises the bar.

Nor is there a hand-off that works around it. Writing the change out for the operator to
paste, attaching it as a diff, splitting it into pieces that each miss the threshold, or
applying it and flagging it for review afterwards are all the same refused change with a
different hand on the keyboard — the surface still gets edited, and it still skips the review
loop the threshold fired to route it into. "I am not the one making the edit" is not a
distinction the thresholds draw. The item moves to `/st-work` intact or it does not move.

| Threshold | Fires when |
|---|---|
| Files | `>5 files` across the batch, or one item that cannot land in a single file |
| Size | `~200 lines` changed across the batch, counted as added plus removed |
| Security-sensitive surface | the item touches authentication, authorization, session or credential handling, key material, payments, or access-control configuration |
| Dependencies | any added dependency, version bump, or lockfile change |
| Public contract | API shape, database schema, event payload, or a migration |

The refusal states the measurement, not a verdict:

> This crosses the `<threshold>` threshold (`<measured value>`). Switch to `/st-work` —
> the item list carries over.

`<threshold>` is the name of the row that fired, copied from the table above — not a
paraphrase, not a category invented to sound like one. The refusal's whole purpose is that
the operator can take the name to the table and check the call; a coined label reads as a
judgement about the change and leaves nothing to check against.

The security-sensitive row has no size floor. A one-character edit under an authentication or
credential path is refused regardless of line count: what that surface needs is the review
loop quick does not run, and small diffs are exactly where authorization defects hide.

## Repo-owned content items

One branch does not apply inline: a Tier-1 request to add or edit one of this repo's own
agents, skills, rules or commands. That item is delegated to `creator`, which writes under
`.stamity/overrides/<class>/` — never into the bundled corpus — and returns the path it wrote
plus its save-gate result: strict refusals naming the field or offset that caused them, and
the advisories that rode along with a file that landed. A refused save is reported as refused,
with nothing written and nothing half-written.

A saved artifact is not a live one. The override file exists, and the per-client copies change
on the next `stamity sync`, so a content item closes as saved rather than applied and its report
line carries that run as the remaining step. `creator` returns the limits that hold under it.

The rest of the batch is unchanged. Content items count against the file and size thresholds
like any other file, the gate below still runs once over the batch, and an item that needs
product code changed as well as an artifact authored is not Tier 1 — it leaves for
`/st-work`.

## Batch flow

1. Split the request into discrete items; a single change is a batch of one. Record per item:
   description, target files, type, estimated changed lines.
2. Classify every item against Trivial signals and Thresholds, and report the classification
   before the first edit. Refusals are reported here, not discovered later.
3. Apply qualifying items in order. One writer per file: two items touching the same file are
   applied in sequence.
4. Gate the batch once, after the last item lands.
5. Report per item — applied, saved, refused, or deferred — with files touched and the gate
   result. A content item reports `saved`, never `applied`, and names the `stamity sync` run
   that publishes it.

### Mid-run re-escalation

Scope found during editing is re-measured against Thresholds at the moment it appears. Item 3
of 5 growing past a threshold stops the batch there:

- Items already applied and gated stay applied, and are reported as applied.
- The crossing item is reverted to its pre-edit state. A half-applied item is never left in
  the working tree.
- The crossing item and every remaining item move to `/st-work` as one list carrying the
  measured reason for the stop.
- Quietly finishing the remainder is a contract breach, and so is quietly dropping it. The
  report names a disposition for every item in the batch, including the ones never started.

## Quality gates

Gates run on every batch, a one-line typo fix included.

- Spawn `test-runner` with the changed-file list. It runs `npm run lint && npm run typecheck && npm run test` and
  returns a gate-by-gate result: exact commands, verbatim failing excerpts, never a bare
  pass/fail.
- No flag, tier, or batch size turns this step off. A batch whose gates are red is not done —
  fix inside the same Tier-1 envelope, or revert the batch and escalate. Reporting a red gate
  as done is a contract breach.
- One retry after a fix. A second red result escalates to `/st-work` with the runner's
  output attached.
- Lint and type failures the batch introduced are fixed inline. Failures that predate the
  batch are reported as pre-existing and left alone; adopting them silently rewrites the
  batch's scope.

## Commit

- Commit when the user asks for it. Quick does not push on its own and creates no branch and
  no PR.
- Message prefix is fixed: `quick:` — one item is `quick: <description>`; a batch is
  `quick: <N> small changes` with one body line per item.
- One commit per batch, after the gates are green.

## Escalation

Never automatic; user-gated in session, with the batch state as the evidence that carries.

| Trigger | Switch to | Evidence carried |
|---|---|---|
| Any threshold fires | `/st-work` | batch list, measurements, per-item classification |
| Gates stay red after one retry | `/st-work` | runner output plus the applied-item list |
| The item needs its cause found first | `/st-debug` | the symptom and the item that would have changed |
| The item is really a question | `/st-ask` | the question, with the files already identified |
