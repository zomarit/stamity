# In-flow units added to run 2026-11-10_patch-1-19-1

The run executes `docs/plans/025-patch-1-19-1-01.md` and `-02.md`. These two units were added on the maintainer's
answers of 2026-11-11 (the morning sitting). They are the copy every dispatch points at, not a reviewable plan.

### s1-land-suite-split (ledger `prove/1`)

| Field | Content |
|---|---|
| `id` | `s1-land-suite-split` |
| `requirements` | spec carries no ids (a test-layout change; no behaviour moves) |
| `files` | `test/cli/commands/runLand.test.ts` (removed, or reduced to one block); new `test/cli/commands/runLand.<block>.test.ts` files; one shared set-up module beside them whose name does not end in `.test.ts`; any configuration or guard file that names the old path (`.stamity/change-classes.json`, the vitest configuration, the knip configuration, a list under `test/ci/` or `test/architecture/`); a spec line that cites the old path, the path only, and only where a test requires the cited path to exist |
| `interfaces` | No product file moves. The one file (4,621 lines, 382 tests, one top-level `describe("stamity run land")` at `:293` with nested blocks at `:479`, `:612`, `:1456`, `:1555`, `:1878`, `:2316`, `:2674`, `:2711`, `:3038`) becomes five to eight files split along those blocks; a large block (`:612`, `:3038`) may be cut in two. Every test keeps its full name (each enclosing `describe` title, then its own title) and its body, byte for byte apart from indentation and imports. Set-up that several blocks use moves to the shared module unchanged. Why: on CI's second Windows shard the file ran for 24.1 minutes by itself, in sequence, against a 30-minute job limit; files run side by side, tests inside one file do not. |
| `testCriteria` | Given `npx vitest list` over the old file at `7ba883eb` and over the new files after the change, then the two sets of full test names are equal and the count is the same (382, one skipped). Given the new files run together, then every test passes and the same one is skipped. Given a search for `runLand.test` in the tree after the change, then every hit names a file that exists, or sits in a record (`docs/plans/`, `CHANGELOG.md`, `.stamity/`), which is listed in the report and not edited. Given each new file run alone, then it passes (no file leans on another's set-up). |
| `edgeCases` | A `beforeAll`, `afterAll` or module-level value shared across blocks is given to each file on its own, never shared across files. A test that passes only after another block ran is a finding: report it, do not hide it. Two files running at once must not share a temporary folder or a fixed port. A requirement id in a test or block title stays in the title. |
| `depends_on` | none |
| `verify` | `npx vitest run` over the new files; each new file once alone; `npx vitest run test/ci test/architecture test/docsPages.test.ts`; `npm run lint`; `npm run typecheck`; the repository's knip script |
| `skills` | none |

### s2-windows-limit (the maintainer's answer of 2026-11-11, after the split's CI run)

| Field | Content |
|---|---|
| `id` | `s2-windows-limit` |
| `requirements` | spec carries no ids (a CI setting; no product behaviour moves) |
| `files` | `.github/workflows/ci.yml`, and a test under `test/ci/` only if one pins this job's limit or its comment |
| `interfaces` | The `check` job's `timeout-minutes` moves from 30 to 45, and the comment above it is rewritten to today's measurement, in the comment's own shape (why this number, measured on which run). The measurement: on run 42990208283 (2026-11-11, pull request head `fe58986b`, after the land suite was split into seven files) the Test step of `check (windows-2, node 24)` took 28.5 minutes in a 29m06s job and `check (windows-1, node 24)` took 19.1 minutes in a 20m07s job; the ubuntu legs took 13.5 and 15.3 minutes. On the run before it (42924749672) the second Windows leg was cancelled at 30 minutes with no failed test. A ceiling a healthy run brushes against is a flake generator: 45 leaves a healthy Windows leg about a third of its limit as room. Nothing else in the workflow moves: no matrix, job name or step. |
| `testCriteria` | Given `.github/workflows/ci.yml`, then the `check` job's `timeout-minutes` is 45 and no other job's limit moved (`git diff` shows one changed setting and its comment). Given the repository's workflow tests, then they pass. |
| `edgeCases` | A test or a doc that states the 30-minute limit moves with it, listed in the report. The comment names no ledger id, plan path or run id of this repository's own runs (a GitHub run number is fine). |
| `depends_on` | `s1-land-suite-split` |
| `verify` | `npx vitest run test/ci test/docsPages.test.ts`; `npm run lint` |
| `skills` | none |

### e4-run65-case-repairs (the maintainer's answer of 2026-11-11, after eval run 65)

| Field | Content |
|---|---|
| `id` | `e4-run65-case-repairs` |
| `requirements` | REQ-PROVE-009 |
| `files` | `evals/cases-v6/work-cap-round-escalates-not-round-four.md`, `evals/cases-v6/unattended-blocked-run-still-hands-off.md` (find each by its case id if the file name differs), and whatever `evals/` file must move with a case's bytes, as unit `e1-case-repairs` of `docs/plans/025-patch-1-19-1-02.md` did (the set's notes or census, an Expected block); the tests under `test/evals/` only where one pins a moved value |
| `interfaces` | Two case files are brought in step with what their own rows judge; no product content moves. The evidence is `reports/eval-run65-failures-researcher-r1.md`. (1) `work-cap-round-escalates-not-round-four`: binding row B6 asks for a "fresh reviewer spawn", a rule of `content/commands/st-work.md` (near `:233`) that the case's Brief does not quote (it quotes the lines before it), so the scenario agent never sees it. Quote that sentence in the Brief, word for word from the content at this head, and widen the case's `source:` range to cover it. The row does not change. (2) `unattended-blocked-run-still-hands-off`: binding row B5 asks the agent to say that `run end` pushes the record onto the pull request, which the Brief's quoted text only implies. Either quote the sentence of the skill that states it, if the skill at this head states it, or reword the row's push clause to what the quoted text states. Prefer the quote. No row is deleted, and no row is made weaker: a row may ask for less only where the content itself never said the stronger thing. |
| `testCriteria` | Given each repaired case, then every sentence a binding row judges is quoted in its Brief (the rule the repository's learning on eval briefs states), each quote equals the content file at this head byte for byte, and `source:` covers every quoted line. Given the eval tests, then they pass. Given `git diff` on the two cases, then no binding row was removed and each changed row is listed in the report with its before and after. |
| `edgeCases` | A case file copied into another place (a fixture, a calibration set) moves with it or is listed. If a quote would have to come from a sentence the content does not hold, stop: that is a content gap, returned as `BLOCKED_DEPENDENCY`, not papered over in the case. The two cases that only varied (`unattended-non-write-comment-no-fix`, `charter-touchpoints-delegate`) are not edited. |
| `depends_on` | `e1-case-repairs` |
| `verify` | `npx vitest run test/evals test/docsPages.test.ts test/ci/testInputsGuard.test.ts`; `npm run lint`; `git diff --quiet 091d999b -- evals/rubric-v7.md` |
| `skills` | none |

### e3b-judge-effort (the maintainer's answer of 2026-11-11; amends `e3-judge-move`)

| Field | Content |
|---|---|
| `id` | `e3b-judge-effort` |
| `requirements` | REQ-PROVE-009, REQ-PROVE-047 |
| `files` | `evals/model-profiles-v1.json`, `evals/MODEL-PROFILES-v1.md`, `evals/SET-v7.md`, `evals/README.md`, `test/evals/modelProfiles.test.ts`, and any other file under `evals/` or `test/` that pins or states the current Claude judge's effort as null or "the default" (read `test/evals/manualRunner.test.ts`, `test/evals/usage.test.ts`, `test/records/evalRunInputs.test.ts`, `test/runs/transcriptUsage.test.ts`; most hold history or comparator fixtures and do not move) |
| `interfaces` | The lane holds `e3-judge-move`'s commit already (the judge is `claude-fable-5-2`, effort null). This unit changes one thing: the current `claude` profile's judge becomes `{ "model": "claude-fable-5-2", "reasoningEffort": "high" }`. Earlier profile versions keep their judge and its null effort, and null keeps its meaning there (the client's default). `MODEL-PROFILES-v1.md`: the table row; the paragraph on the judge's null effort now says that from this version the judge's effort is declared, `high`, on the maintainer's word of 2026-11-11, because the client's default for this model measured `medium` (client 2.1.322, 2026-11-10) and the route needs the judge and the scenario to decode alike. `SET-v7.md`: the dated paragraph `e3-judge-move` added says the judge's default effort does not move; amend that paragraph in place so it states the declared `high`, and that a judge effort move is a whole-set trigger and a new baseline. Nothing in "Incremental runs" moves (the skill quotes that section word for word). `evals/rubric-v7.md` does not move. |
| `testCriteria` | Given `evals/model-profiles-v1.json`, when the current `claude` profile is resolved, then its judge is `{ model: "claude-fable-5-2", reasoningEffort: "high" }` and its scenario is `{ model: "claude-opus-5-5", reasoningEffort: "high" }`. Given each earlier profile version, then its judge's model and null effort are unchanged. Given `MODEL-PROFILES-v1.md`'s profile table, then each row's model cells, and its effort cells where the table shows them, equal that profile's JSON. `git diff --quiet 091d999b -- evals/rubric-v7.md` exits 0. |
| `edgeCases` | A reader that treats a null judge effort as "send no effort flag" must still do so for the earlier versions. If the run's calibration misses, the revert set is three commits, each reverted on the release line by one revert commit, newest first: the spec amendment of REQ-PROVE-009 (`12597855` on the lane), this unit's commit (`3785ebdc`) and `e3-judge-move`'s (`462edd5a`); a revert that leaves the spec saying `claude-fable-5-2` at `high` is not done (amended 2026-11-11 after the unit's review: the spec commit was outside the set). No sentence may say the judge "runs at the default" for the current version. |
| `depends_on` | `e3-judge-move` |
| `verify` | `npx vitest run test/evals test/records test/runs/transcriptUsage.test.ts test/docsPages.test.ts test/ci/testInputsGuard.test.ts`; `npm run lint`; `npm run typecheck` |
| `skills` | none |
