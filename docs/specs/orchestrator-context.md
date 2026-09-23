---
id: orchestrator-context
# A design document, authored from docs/plans/009-orchestrator-context-economy-01.md on 2026-09-23 and excluded from the site build.
status: design
obsolete_when: every supported client hands a parent a sub-agent's full report by reference and restores a running flow's state after a compaction on its own, or a decision row cuts the surface
---
# Orchestrator context economy

What enters the `/st-work` orchestrator's context and what stays on disk: full reports on disk with a digest in
context, one serialized ledger writer, dispatches that point at a plan unit instead of restating it, a resume card
recomputed from disk after a compaction, and a body ordered so what a resumed run needs survives the client's
re-attachment. `status: design` until these requirements ship; the 1.10.0 close moves it to `shipped-with-1.10.0`.

This is the planning-time skeleton. The requirement statements, the acceptance criteria and the per-client parity
table are drafted in `docs/plans/009-orchestrator-context-economy-01.md` § Spec text and are merged here, with that
plan's amendments, at the Prove phase of its `/st-work` run. Until then the plan's units carry the testable criteria.

## Requirements

### REQ-CTX-001 — Execution roles write the full report to disk and return a digest

### REQ-CTX-002 — The never-digested classes and the never-cut lines

### REQ-CTX-003 — Verdict-role report write on Claude Code, and the degradation elsewhere

### REQ-CTX-004 — Report naming, and a folder git ignores

### REQ-CTX-005 — `stamity ledger append`, the one serialized ledger writer

### REQ-CTX-006 — The `report` and `decision_needed` fields, and the sign-off

### REQ-CTX-007 — A fixer is dispatched by report path and ledger ids

### REQ-CTX-008 — Re-review closures and `stamity ledger close`

### REQ-CTX-009 — Pointer dispatch, and an in-flow plan persisted once

### REQ-CTX-010 — Plan-cell amendment, and `BLOCKED_DEPENDENCY` on a cell that no longer resolves

### REQ-CTX-011 — The implementer's return carries its census closure and its report path

### REQ-CTX-012 — The run record's head names the plan and the invocation

### REQ-CTX-013 — The resume card, and `stamity ledger status`

### REQ-CTX-014 — The `/st-work` body's order puts what a resumed run needs before the re-attachment cut

### REQ-CTX-015 — The replay, its floor, and the merge gate

## References

- `docs/plans/009-orchestrator-context-economy-01.md` — the research, the decisions, the shared contracts and the spec text.
