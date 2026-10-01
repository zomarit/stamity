# In-flow plan — PR #73 review fixes, round 1

Session-scoped plan for run `2026-10-01_pr73-review-round-1`: the copy every dispatch points at, not a reviewable
artifact. No persisted `docs/plans/` artifact covers this request (it amends three of them), so the run plans in-flow.
The brief with every finding's evidence and fix sketch is
`/private/tmp/claude-501/-Users-denismasatovic-Projects-zomarit-stamity/68d93474-4cc9-4ad1-a5a6-9a2664f470de/scratchpad/pr73-round1-work-brief.md`.

Common to every unit: the change is plan text only. Line numbers in the brief are at `4607ba7d`; locate each edit by its
quoted anchor (or apply bottom-up), since earlier edits shift later lines. Each design choice taken overnight is added
as one row to that plan's `### Settled by this plan (declared defaults; …)` table, so the maintainer can reverse it.

### u1-plan-015 — plan 015's eight accepted review fixes

| Field | Content |
|---|---|
| `id` | u1-plan-015 |
| `requirements` | none in `docs/specs/` (the board-writes skeleton carries headings only); amends plan 015's own REQ-BOARD-001, REQ-BOARD-002, REQ-BOARD-003 and REQ-BOARD-007 text |
| `files` | `docs/plans/015-board-writes.md` |
| `interfaces` | Apply F01, F02, F03, F04, F05, F06, F07 and F09 as the brief's U1 section states, together where they interact (F01+F03 the pickup-preview sentence; F01+F02 the progress table; F06+F07 the contract opening and New item write; F05+F09 the GitHub notes paragraph). Add one row to `### Settled by this plan` for F07's choice: a Projects-board link names the repository new items are filed in; with none named, New item rows stay proposals (the alternative not taken: default to the checkout's repository when it is on the project). |
| `testCriteria` | **Given** the amended plan, **when** the `verify` command runs, **then** it passes; **and** the reviewer finds each of F01–F07, F09 fixed at its anchors with the requirement text, unit text, test pins and execution order consistent. |
| `edgeCases` | An anchor no longer matches the file → `BLOCKED_DEPENDENCY` naming the finding. A fix needs a product choice the brief does not settle → `BLOCKED_AMBIGUITY` naming the readings. |
| `depends_on` | none |
| `verify` | `npx vitest run test/authoring/specPlanCoverage.test.ts test/records test/docsPages.test.ts test/corpus/commands/plan.test.ts test/corpus/commands/work.test.ts && node scripts/leak-gate.mjs` |

### u2-plan-016-02 — plan 016 file 2's four accepted review fixes

| Field | Content |
|---|---|
| `id` | u2-plan-016-02 |
| `requirements` | none in `docs/specs/` (the requirements sit in the plan's spec delta); amends REQ-PLUGIN-036's neighbourhood only through the census row |
| `files` | `docs/plans/016-fork-distribution-02.md`; `docs/plans/016-fork-distribution-01.md` (the census row at `:896` only) |
| `interfaces` | Apply F11, F12, F13 and F14 as the brief's U2 section states, F11+F12 together in `u2-upgrade-verb`. Add one row to file 2's `### Settled by this plan` for F14's choice: `u2-apm-backed-mode` owns the additive lock-reader extension (`virtualPath`, `version`, the `deployments[]` fallback) to file 1's `src/detect/apmLock.ts` (the alternative not taken: fold it into file 1's `u1-foreign-paths`). |
| `testCriteria` | **Given** the amended plans, **when** the `verify` command runs, **then** it passes; **and** the reviewer finds each of F11–F14 fixed at its anchors, with file 1's census row and file 2's census, files lists, interfaces and testCriteria consistent. |
| `edgeCases` | As u1-plan-015. File 1 changes beyond the `:896` census row → stop and name why. |
| `depends_on` | none |
| `verify` | as u1-plan-015 |

### u3-plan-016-03 — plan 016 file 3's six accepted review fixes

| Field | Content |
|---|---|
| `id` | u3-plan-016-03 |
| `requirements` | none in `docs/specs/`; aligns the release steps with REQ-PLUGIN-044 as the plan's own spec delta states it |
| `files` | `docs/plans/016-fork-distribution-03.md` |
| `interfaces` | Apply F16, F17, F18, F19, F20 and F21 as the brief's U3 section states, together where they interact (F17+F20 the reset block; F19+F21 the step-14 paragraph). Add one row to file 3's `### Settled by this plan` for F16's narrowing: a `not-run` non-live leg may ship named under `Not done:` on the maintainer's recorded decision (default: hold); a `failed` leg always holds the release. |
| `testCriteria` | **Given** the amended plan, **when** the `verify` command runs, **then** it passes; **and** the reviewer finds each of F16–F21 fixed at its anchors, with the reset recipe's two blocks, its test prose and testCriteria, and the release steps consistent. |
| `edgeCases` | As u1-plan-015. |
| `depends_on` | none |
| `verify` | as u1-plan-015 |
