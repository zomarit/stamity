# In-flow plan — PR #76 review fixes, round 1

Run `2026-10-02_pr76-review-round-1`. Base `7b795a8f`, branch `docs/plan-017-c4-run-id` (PR #76's head). One unit;
plan text only.

The findings are F1–F4 of `/st-pr-resolve` round 1 on PR #76 (review 5393368323, on `541c8f94`). One read-only
evaluation accepted all four: F1 Warning, F2 Minor, F3 Minor, F4 Warning, each at high confidence. Ledger rows
`frame/1`–`frame/4` hold them in that order.
- **F1** (comment 4166983991): an older same-login dispatch inside the window can be the sole match.
- **F2** (comment 4166984000): `verify` lacks the maintainer-resolved path.
- **F3** (comment 4166984009): the commands mix the canonical repository and the checkout's.
- **F4** (comment 4166984018): after the maintainer names their run, nothing may cancel a wrong-S run.

Facts the edits rest on:
- **gh on this machine.** The installed gh is 2.86.0, and its `gh workflow run` prints no run URL. The orchestrator
  measured that on 2026-10-02.
- **Newer gh.** GitHub's dispatch API returns run details since 2026-02-19. gh 2.87.0 and newer print the created run's
  URL "if available", per the gh manual and the GitHub changelog, as the evaluation cited them.
- **Concurrency.** `docs-site.yml:62-67` never cancels an in-progress dispatch.

## Units

### u1-c4-dispatch-identity — c4 takes only its own dispatch's run, in the canonical repository

| Field | Content |
|---|---|
| `id` | `u1-c4-dispatch-identity` |
| `requirements` | spec carries no ids (PR #76 findings F1–F4; package goal G8) |
| `files` | `docs/plans/017-docs-overhaul-03.md` only |
| `interfaces` | See the edits below the table. |
| `testCriteria` | **Given** the edited file, **when** `node .claude/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/017-docs-overhaul-03.md docs/specs` runs, **then** it prints `"status": "pass"` with 5 units and no findings. **When** `npx vitest run test/records/specStatus.test.ts test/authoring/specPlanCoverage.test.ts test/corpus/commands/plan.test.ts` runs, **then** it exits 0. **When** `node scripts/leak-gate.mjs` runs, **then** it exits 0. **Then** c4 accepts a list-found run only when its id was not listed before the dispatch. Every `gh` command in step 2 and in `verify` targets `zomarit/stamity`. The S check reads the canonical `main`. Nothing is cancelled while the run is in doubt, and the run the maintainer names can still be cancelled. |
| `edgeCases` | **A table cell grows long:** keep it in its cell, as its neighbours are, and put no `\|` character inside a cell. **The new step text wraps:** keep the file's line width and the step's three-space indent; a code span that cannot wrap stays alone on its line, as the list command does now. |
| `depends_on` | none |
| `verify` | `node .claude/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/017-docs-overhaul-03.md docs/specs && npx vitest run test/records/specStatus.test.ts test/authoring/specPlanCoverage.test.ts test/corpus/commands/plan.test.ts && node scripts/leak-gate.mjs` |

**The edits, in `docs/plans/017-docs-overhaul-03.md` at `7b795a8f`:**

1. **c4 interfaces, step 2 (`:210-222`).** Replace the text from "Record S" (`:210`) to "Otherwise watch it to
   completion." (`:222`) with the paragraph below. Keep the step's earlier lines (`:202-209`) unchanged.

   > Record S, the sha c3 signed off. Every `gh` command in this step and in `verify` targets the canonical
   > repository, with `-R zomarit/stamity` or its API path, whatever checkout it runs from. On yes, first check that
   > `gh api repos/zomarit/stamity/commits/main --jq .sha` prints S. Then read your login with
   > `gh api user --jq .login`, note T, the UTC time one minute before now, and list the candidates with
   > `gh api -X GET repos/zomarit/stamity/actions/workflows/docs-site.yml/runs -f event=workflow_dispatch -f created='>=<T>' --jq '.workflow_runs[] | select(.actor.login == "<login>") | {id, head_sha, created_at, status}'`.
   > Keep the ids it lists: none of them is this dispatch. Then run
   > `gh workflow run docs-site.yml -R zomarit/stamity --ref main -f deploy=true`, and take the dispatched run, never
   > the newest one. If `gh workflow run` printed a run URL (gh 2.87.0 and newer print one when GitHub returns it),
   > its last path segment is the run id; use it. Otherwise list again with the same query and leave out the kept
   > ids. If no new run is listed, poll until one appears. If exactly one is new, that is the run. If more than one is
   > new, stop and ask the maintainer which run is theirs, record the choice, and go on with that id; cancel nothing
   > while the run is in doubt. If the identified run's `head_sha` differs from S, cancel it
   > (`gh run cancel <id> -R zomarit/stamity`) before its deploy job starts, and stop. When the id came from the list,
   > first list again with the same query: if another new run has appeared, ask the maintainer which run is theirs,
   > and go on with the run they name. If the deploy job has already started, do not cancel: record the deploy of a
   > sha other than S as a `Not done:`, and stop. If the run ends `cancelled` without a cancel from this step (a newer
   > dispatch replaced it in the concurrency queue), record that and stop. Otherwise watch it to completion with
   > `gh run watch <id> -R zomarit/stamity`.

2. **c4 `testCriteria` (`:196`).** Replace only its last sentence, "**Given** more than one candidate dispatch run,
   **then** no run is cancelled, and the run record holds the maintainer's choice.", with:

   > **Given** more than one new candidate dispatch run, **then** nothing is cancelled until the maintainer names
   > their run, the run record holds that choice, and only the named run is ever cancelled.

3. **c4 `edgeCases` (`:197`).** Replace only its last sentence, the one that begins "**Several dispatch runs
   match,**", with:

   > **Several new dispatch runs match,** at the first list or at the list again before a cancel: stop and ask the
   > maintainer which run is theirs; cancel nothing until they name it, then go on with that id.

4. **c4 `verify` (`:199`).** Replace the whole cell with:

   > `gh run view <deploy-run-id> -R zomarit/stamity --json conclusion,headSha,event` shows `success`, event
   > `workflow_dispatch`, and `headSha` equal to S; the run id came from the printed URL, from the only new
   > actor-filtered match, or from the maintainer's recorded choice; the live-check script prints `ok` for every row

Left out on purpose: the evaluation's 30-second second list after a single new match (see the run record's Frame).
