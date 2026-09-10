# Deferral inbox

The deferral home the work, plan, rework, pr-resolve and board commands name: one row per deferred item, in the grammar `/st-board`'s `## Deferral inbox` section declares — `severity · file:line · description · source: <writer>`, with an optional `Ref: <path>#<anchor>` and an optional tag word (`critical-deferred` on a deferred Critical). The work command's close appends every `deferred` ledger row here at run exit; `/st-board fill` triages the rows; an entry leaves when its destination item exists, when its proposal id is recorded, when the user drops it by name, or when a completeness pass retires it with one line recorded in that pass's run record.

Three rows were appended 2026-09-10 by the 1.4.0 release run. Two retired the same day through
pull request #28 (the overlay spec's status and the advisory repeat's diff). The remaining
live-PR item retired through the enterprise-downstream execution: actual repository-token PR
creation and recovery, human-approved required CI, and a separate real landing-warning/new-PR
case now replace its stub-only evidence. The retirement statement is retained in
`.stamity/runs/2026-09-10_enterprise-downstreams/record.md`; its original evidence remains at
`.stamity/runs/2026-09-10_release-1.4.0/ledger.jsonl#2026-09-10_release-1.4.0/build/3`.

No active rows remain. Earlier Package 9 retirements are still recorded in
`.stamity/runs/2026-09-09_package-9/inbox-retirements.md`.
