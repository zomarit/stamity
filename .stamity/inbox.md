# Deferral inbox

The deferral home the work, plan, rework, pr-resolve and board commands name: one row per deferred item, in the grammar `/st-board`'s `## Deferral inbox` section declares — `severity · file:line · description · source: <writer>`, with an optional `Ref: <path>#<anchor>` and an optional tag word (`critical-deferred` on a deferred Critical). The work command's close appends every `deferred` ledger row here at run exit; `/st-board fill` triages the rows; an entry leaves when its destination item exists, when its proposal id is recorded, when the user drops it by name, or when a completeness pass retires it with one line recorded in that pass's run record.

Empty since 2026-09-09: the 0 rows it held when Package 9 built it from the fourteen run ledgers and the records' Not-done lines are each retired with one line in `.stamity/runs/2026-09-09_package-9/inbox-retirements.md`.

