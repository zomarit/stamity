# Run record — Batch D lane 14: workspace surface (handoff 2026-08-31_triage-decisions_410bf)

- Run id: 2026-08-31_batch-d14-workspace
- Flow: /st-work executing docs/specs/workspace-surface.md (17 REQs / 43 ACs). Standard
  intensity. Operator marathon authority stands.
- Baseline: public-main@5d02439 (D12 closed).
- Lessons applied: a new src module is a registration event (boundaries plan map + registry
  ride in the owning unit's file set — D12-U1); corpus/docs edits ship with their dogfood
  sync (D11-C1); getting-started's verb prose and the docsPages verb array move together
  (the array is hand-maintained, not derived — D14 research).

## Units

| Unit | Concern | Files | Status |
|---|---|---|---|
| W-U1 | the verb skeleton + status: CommandModule, dispatch, five row states, journal line, --json; registration (cli.ts + counts, boundaries map, registry if demanded) | ~5 | dispatched |
| W-U2 | workspace init: guided creation, candidate selectMany, tools union, refusal matrix, unattended-creates | ~2 | pending (after U1) |
| W-U3 | workspace sync: the three-field bridge into member manifests, planSync/applySync per member, absent-manifest row failure, full re-run | ~3 | pending (after U1) |
| W-U4 | init hook: detectWorkspaceContext probe, conditional question, non-interactive disclosure | ~3 | pending |
| W-U5 | docs: workspaces feature page (decision 9's first page) + wiring + verb prose + regen | ~7 | pending (last) |

## Proof block

Gates: authoritative runs green at 5898/5915/5932/5951 through the build; final 5959 (+8 from
the fix round) with site build; the workspaces page proven titled and sidebar-listed.
Review: round 1 needs-fixes at 0.68 (breadth-limited confidence, no diff access; no Critical;
5 Warnings all accepted) — the false-green refused-paths branch, the cannot-fail selection
pin, the --tools page overclaim, the unsanitized journal ts, five unpinned criteria; fix
round closed all seven with perturbation proofs; round 2 APPROVE high/0.86 with one Minor
(citation drift, closed by orchestrator mechanical retake).
Units: W-U1 verb+status (4 registration pins incl. one discovered), W-U2 init (split
built-then-reverted on ratchet evidence), W-U3 cascade (REGISTRY_ONLY shrank by four,
layering probed), W-U4 init hook (options empirically ruled out; census reconciled(4)),
W-U5a page+14 riders (criteria count catch), W-U5b wiring + the README verb surface (three
pins found beyond the spec's four; two-stage red-check exposing the containment-vs-list
class).
Ledger: all rows closed. QA: CLI surface auto-proven (refusal matrices, gate floors, the
asymmetry pair, the persistence capstone); real-terminal residue joins the standing Batch C
rows. Shippable: YES (operator marathon authority).
Next: D15 against docs/specs/worktree-lane.md — the final build lane.
