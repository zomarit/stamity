---
id: everyday-flows
# A design document, authored from docs/plans/013-optimization-sweep-02.md on 2026-09-30 and excluded from the site build.
status: design
obsolete_when: every requirement below is pinned by a test or an eval case that names its id and the command reference carries it, or a decision row cuts the surface
---
# Everyday flows

What the nine commands and the setup that serves them do for a user day to day: calls resolve, gates run and report
honestly, records say what happened, and the person is asked only what needs the person. The area code is `FLOW`.
`status: design` until these requirements ship; the 1.11.0 close moves it to `shipped-with-1.11.0`.

This is the planning-time skeleton. The requirement statements and acceptance criteria are drafted in
`docs/plans/013-optimization-sweep-02.md` and `docs/plans/013-optimization-sweep-03.md` § Spec delta and are merged
here, with those plans' amendments, at the Prove phase of their `/st-work` runs. Until then the plans' units carry the
testable criteria.

## Requirements

### REQ-FLOW-001 — Emitted scripts pass the project's own lint gate

### REQ-FLOW-002 — Every CLI call the flows and hooks make resolves after the documented npx setup

### REQ-FLOW-003 — A step whose CLI cannot run says so

### REQ-FLOW-004 — Every researcher dispatch carries the brief keys the researcher requires

### REQ-FLOW-005 — The quick lane takes a small change together with the tests that follow it

### REQ-FLOW-006 — Setup detects vitest and pytest from the manifest

### REQ-FLOW-007 — Python gates run from the repository root without an activated environment

### REQ-FLOW-008 — `check` names the gates it did not run

### REQ-FLOW-009 — `/st-debug` reproduces a precisely described bug with a failing test and hands off

### REQ-FLOW-010 — Probes keep the gates green and never outlive their record

### REQ-FLOW-011 — A debug record from the first probe

### REQ-FLOW-012 — On a small repository, `/st-spec` offers the whole app as a scope

### REQ-FLOW-013 — Each gate runs once, as the charter spells it, with its exit code read from the tool

### REQ-FLOW-014 — Agent and command bodies write portable shell and wait instead of polling

### REQ-FLOW-015 — A byte-identical tree cites its earlier gate result; the final tree is always gated

### REQ-FLOW-016 — Setup ignores the review gate's state files

### REQ-FLOW-017 — QA rows record walked, auto-proven or accepted-unwalked

### REQ-FLOW-018 — No QA question when every row auto-proved; unattended means not signed; unchanged accepted rows are not asked again

### REQ-FLOW-019 — `/st-work` asks only what needs the person

### REQ-FLOW-020 — `/st-ask` is sized to the question

### REQ-FLOW-021 — The learning index warns ahead, orders by date and reports real bytes

### REQ-FLOW-022 — First-run output matches what setup did

### REQ-FLOW-023 — Copilot's writing agents load the charter

### REQ-FLOW-024 — A run retires the inbox rows it fixed

### REQ-FLOW-025 — Run records are written with the file tools

### REQ-FLOW-026 — The touchpoints ship as shared skills, so Codex gets them

## References

- `docs/plans/013-optimization-sweep-01.md` — the measures and the method that found these items.
- `docs/plans/013-optimization-sweep-02.md` — the core: its decisions, shared contracts and spec delta.
- `docs/plans/013-optimization-sweep-03.md` — the next tier and the drop list.
