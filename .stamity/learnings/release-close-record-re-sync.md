---
id: release-close-record-re-sync
title: release-close record re-sync
date: 2026-09-01
confidence: medium
summary: the private layer's side-by-side record fell two releases stale because closes ran only in this repo — release-sized closes end with a record re-sync (see .github/release-controls-checklist.md)
reviewBy: 2026-12-01
validatedAgainst: .github/release-controls-checklist.md
integrity: sha256:877559d43286d5c032aa9c23dd2f42447d8cb8fdda6f30ad3e1cee0e5aa5fb5d
---

Release-sized arcs (a triage, its execution, an adversarial review, a version
cut) run and close inside this repository, and nothing in this tree goes red
when the private layer's record is left stale. Observed 2026-09-01: the
record's continuity log still described the pre-publish state — the whole arc
from the 2026-08-31 triage through the v1.1.0 release was absent — because
every session closed green here, and the record re-sync step lives in a
side-by-side checkout that no gate in this repository reaches.

## Why

Verified, not theorized: the 2026-09-01 completeness audit (twelve read-only
auditors against v1.1.0, main a4346f7) measured the record as frozen two
releases behind its own session log, and a dedicated catch-up session had to
append the missing history the same day. The mechanism is structural — the
gates that define done here (lint, typecheck, tests, leak gate) all run in this
tree, so a record kept in a separate checkout stays current only through an
explicit close step, and an explicit step with no gate behind it is the kind
that silently drops. Review horizon: validate at the next version cut by
checking the record's log carries that release.

## How to apply

At the close of release-sized work — anything that cuts a version or lands an
arc a future session must know about — re-sync the private layer's record in
its side-by-side checkout: append the arc to its continuity log and regenerate
its kickoff prompt. The per-release reminder is the "Per-release record
currency" section of .github/release-controls-checklist.md (added 2026-09-01);
it is part of the release flow, not optional polish.
