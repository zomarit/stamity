# In-flow plan — PR #75 review fix, round 1

Run `2026-10-02_pr75-review-round-1`. Base `935103de`, branch `docs/plan-017-c4-run-id`. One unit; plan text only.

The finding is F1 of `/st-pr-resolve` round 1 on PR #75 (comment 4166165043). The evaluation accepts it as a Warning
at high confidence. The concern: two `workflow_dispatch` runs of `docs-site.yml` can coexist. `docs-site.yml:66-67` puts
every dispatch on `main` in one concurrency group, with in-progress cancellation off. So c4 step 2's pick by `createdAt`
can watch or cancel another operator's armed deploy.

The finding's supporting claim does not hold for the installed gh 2.86.0: its `gh workflow run --help` says nothing
about printing a run URL. The fix therefore uses a printed URL if a newer gh gives one, and otherwise an unambiguous
fallback. The orchestrator measured the fallback's API on 2026-10-02:
- the run object carries `actor.login` and `triggering_actor.login` (run 37013438611);
- `gh api -X GET repos/zomarit/stamity/actions/workflows/docs-site.yml/runs -f event=workflow_dispatch -f
  created='>=…'` returns the matching runs. The probe returned one: run 35163660079, Package 14's deploy.

## Units

### u1-c4-run-id — c4 identifies the dispatched run by its own id

| Field | Content |
|---|---|
| `id` | `u1-c4-run-id` |
| `requirements` | spec carries no ids (PR #75 finding F1; package goal G8) |
| `files` | `docs/plans/017-docs-overhaul-03.md` only |
| `interfaces` | See the edits below the table. |
| `testCriteria` | **Given** the edited file, **when** `node .claude/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/017-docs-overhaul-03.md docs/specs` runs, **then** it prints `"status": "pass"` with 5 units and no findings. **When** `npx vitest run test/records/specStatus.test.ts test/authoring/specPlanCoverage.test.ts test/corpus/commands/plan.test.ts` runs, **then** it exits 0. **When** `node scripts/leak-gate.mjs` runs, **then** it exits 0. **Then** c4 never selects a run by `createdAt` alone, and never cancels a run whose identity is in doubt. |
| `edgeCases` | **c4's testCriteria cell grows long:** keep it in the cell, as its neighbours are. **The new step text wraps:** keep the file's line width. |
| `depends_on` | none |
| `verify` | `node .claude/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/017-docs-overhaul-03.md docs/specs && npx vitest run test/records/specStatus.test.ts test/authoring/specPlanCoverage.test.ts test/corpus/commands/plan.test.ts && node scripts/leak-gate.mjs` |

**The edits, in `docs/plans/017-docs-overhaul-03.md` at `935103de`:**

1. **c4 interfaces, step 2.** Replace the run-identification text, from "Then take" (`:211`) to the end of the step
   (`:215`), with:

   > Then take the dispatched run, never the newest one. If `gh workflow run` printed a run URL, its last path segment
   > is the run id; use it. Otherwise note T, the UTC time one minute before the dispatch, read your login with
   > `gh api user --jq .login`, and list the candidates with
   > `gh api -X GET repos/zomarit/stamity/actions/workflows/docs-site.yml/runs -f event=workflow_dispatch -f created='>=<T>' --jq '.workflow_runs[] | select(.actor.login == "<login>") | {id, head_sha, created_at, status}'`.
   > If exactly one run matches, that is the run. If none does, poll until one appears. If more than one does, stop
   > and ask the maintainer which run is theirs; never cancel while the run is in doubt. If the identified run's
   > `head_sha` differs from S, cancel it (`gh run cancel <id>`) before its deploy job starts, and stop. If it ends
   > `cancelled` without a cancel from this step (a newer dispatch replaced it in the concurrency queue), record that
   > and stop. Otherwise watch it to completion.

   Keep the step's earlier sentences (the `Bar met:` check, the fetch, the comparison with S, the dispatch command).
2. **c4 `testCriteria` (`:196`).** Add: "**Given** more than one candidate dispatch run, **then** no run is cancelled,
   and the run record holds the maintainer's choice."
3. **c4 `edgeCases` (`:197`).** Add: "**Several dispatch runs match:** stop and ask; never cancel."
4. **c4 `verify` (`:199`).** Replace it with: "`gh run view <deploy-run-id> --json conclusion,headSha,event` shows
   `success`, event `workflow_dispatch`, and `headSha` equal to S; the run id came from the printed URL or from exactly
   one actor-filtered match; the live-check script prints `ok` for every row".
