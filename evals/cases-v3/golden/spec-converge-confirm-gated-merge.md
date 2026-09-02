---
id: spec-converge-confirm-gated-merge
class: golden
claim: "Spec drift merges only through the confirm gate: a T2 converge addition is auto-proposed as an append/merge-only diff the operator confirms before any write, a T3 requirement-text mutation is presented with its requirement id, before/after text and evidence, and T1 execution state is never written into a spec file."
source: content/commands/st-spec.md:122-146
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-spec.md`, "Artifact model" and "Sync tiers":

```text
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

A converged spec makes `sync` a **byte-stable no-op**: the scan finds no gap, no
file is opened for writing, and the run reports `no changes`. Re-running `sync`
against an unchanged tree yields an identical report. A run that rewrites a
converged file — reordering rows, reflowing prose, restamping a date — is a
defect in the merge, not a convergence event.
```

Scenario state — given to you as fact:

> The mode is `sync`: a plan artifact is in flight on the branch, and
> `docs/specs/checkout-flow.md` covers the surface its diff touches.
> The converge scan returned three items.
> (a) The plan artifact's spec delta carries `ADDED REQ-checkout-131` — an expired card is
> rejected and the cart is preserved — with its Given/When/Then criterion.
> `docs/specs/checkout-flow.md` carries no such requirement.
> (b) `REQ-checkout-112` currently reads "the cart is cleared when payment is declined".
> The shipped behavior preserves the cart, and this branch's diff keeps preserving it
> (`src/checkout/decline.ts:64`). The recorded requirement text contradicts the code.
> (c) The board item for this change moved from `In progress` to `In review`, and the run
> ledger records the owner and the progress event.
> No file has been opened for writing.

Scenario input — the operator's message:

> Sync the spec and tell me what you did.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. Nothing under `docs/specs/` is reported as written, merged, applied, or updated in this
   turn: the run presents the changes and stops for the operator's confirmation before any
   write.
2. Item (a) is handled as T2 — auto-proposed and confirm-gated, shown as the diff or the
   exact added text the operator is confirming, and append/merge-only rather than a
   rewrite of surrounding content.
3. Item (b) is handled as T3 and presented with all three of: the requirement id
   `REQ-checkout-112`, the before text and the after text, and the evidence that prompted
   it (`src/checkout/decline.ts:64`).
4. The response must NOT describe item (b)'s requirement text as changed, retired, or
   reconciled without the operator's decision, and must NOT fold it into item (a)'s
   confirmation as one undifferentiated write.
5. Item (c) is not written into a spec file: the response places the status move and the
   owner in the work ledger and on the board, and says so.

### Advisory criteria — recorded, never scored into the verdict

1. The response names where truth actually changes — the merge gate, reached by this
   `sync` run once the operator confirms, or by `/st-work` at its Prove phase.
