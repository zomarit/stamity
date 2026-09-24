---
id: enterprise-release-02
intent: feature
stamp: d072a347ec44abd365850f44692be6ce1a4225d7 2026-09-24
reads: [AGENTS.md, package.json, CHANGELOG.md, README.md, GOVERNANCE.md, docs/doctrine.md, docs/measurements.md, .github/release-controls-checklist.md, evals/model-profiles-v1.json, evals/MODEL-PROFILES-v1.md, evals/SET-v7.md, evals/README.md, evals/EVIDENCE-STORAGE.md, evals/runs/2026-09-22-run-32/RESULTS.md, evals/runs/2026-09-15-run-27/RESULTS.md, scripts/eval/run.mjs, scripts/merge-ready-rate.mjs, scripts/evidence-archive.py, scripts/evidence-summary.mjs, src/cli/docs/measurements.ts, test/evals/modelProfiles.test.ts, test/evals/manualRunner.test.ts, test/cli/docs/measurements.test.ts, test/docsPages.test.ts, docs/specs/prove-behavior-and-value.md, docs/specs/orchestrator-context.md, docs/specs/model-ladder.md, content/skills/st-eval-run/SKILL.md, .stamity/inbox.md]
depends_on: [docs/plans/010-enterprise-release-01.md, docs/plans/011-replay-v2.md]
---

# Enterprise end to end and the 1.10.0 cut — file 2 of 2: the 1.10.0 cut

This file is self-contained. It follows file 1 (`docs/plans/010-enterprise-release-01.md`), whose units all land
first. It releases 1.10.0: session 1's context economy (already on `main`, #54) plus file 1's enterprise work.

## Context

1.10.0 is Package 16's one release. At the cut, the eval harness moves from `claude-opus-5` to `claude-opus-5-5` for
the `claude` profile's scenario model and loaders; the judge and calibration stay `claude-fable-5-1`, per the model
mix of 2026-09-23. SET-v7 says a profile change starts a separate baseline (`evals/SET-v7.md:160`, `:531`). So the
whole set runs once at three samples with calibration first (102 cases, about 306 scenario and 306 judge calls), and
nothing is composed with run 32.

The tag waits for four things:
- REPLAY-v2's committed comparison reads `Merge gate: PASS` (plan 011; the maintainer's gate decision of 2026-09-24,
  REQ-CTX-015);
- that run's eval-set floors hold;
- the QA checkpoint is signed;
- CI and the gate of record are green.

Out of scope: plan 009's four eval case gaps. They stay deferred (D3).

## Decisions (the maintainer, 2026-09-24, through the question tool; answered by 10:33Z)

| # | Decision |
|---|---|
| D3 | The four case gaps plan 009 filed stay in the inbox: a verdict role's digest, a security finding under pressure to shorten, re-review closures, and the capacity rung. The new baseline measures the 102 existing cases, and the gaps join a later increment, which is cheap under the incremental rule. |
| D4 | The profile moves in place in `evals/model-profiles-v1.json`, with a dated SET-v7 paragraph, and the model pair joins the comparator key, so a run on another pair can never be composed with this one. No SET-v8. |

Assumed defaults, recorded here for the maintainer's review:
- `model-ladder.md` keeps its status `shipped-with-1.9.0`. Only its citations refresh, because nothing located says
  an amended requirement re-ships.
- The private driver's canaries K1, K1b, K1c, K2, K3 and K4 all re-run on the new pins, because `prepare` checks them
  under the current driver hashes.
- The measure's confidence fix (`build/369`) rides the cut, because the close regenerates the measurements page.

## Research (2026-09-24; accessed and read on that date)

**The profile and the comparator**
- The `claude` profile is `evals/model-profiles-v1.json:6-11` (scenario `claude-opus-5`, judge `claude-fable-5-1`),
  documented at `evals/MODEL-PROFILES-v1.md:10` and `:29-30`, and pinned by `test/evals/modelProfiles.test.ts:33-38`.
- The comparator key is `{profile, rubricCoreHash, harness}` and holds no model id (`scripts/eval/run.mjs:89-93`).
  Today only the CLI version string inside `harness` keeps run 33 apart from run 32.

**The private layer's eval driver**
- It pins the ids itself: `EXACT_MODELS` and `ACCEPTED_REPORTING` in `driver/inspect.mjs:17-18`, and the profile's
  sha256 in `driver/run.mjs:44` with its self-test in `driver/inspect.test.mjs:231-232`.
- Hard-coded ids also sit in the K3/K4 canaries (`run.mjs:701-730`), the results table (`:1021-1022`), the test
  fixtures, the private claude profile JSON, `PROTOCOL.md:5` and `:33-36`, and `canary-plan.json`.
- **Critical, stale canaries:** `liveAdmitted` (`run.mjs:496`) checks role, transport and admission but not the
  model. Canaries recorded on the old model would satisfy `prepare` for a new-model run.
- **Critical, repeats against run 24:** with no `--prior-run`, a full run falls back to
  `REPEATS_AGAINST = '2026-09-11-run-24'` (`run.mjs:770`, `:923`). The 1.10.0 baseline would compare advisory repeats
  against a run on the old model, which SET-v7:160 forbids.
- **`prove/295`:** `PREVIOUS_CASE_DIR = 'evals/cases-v5'` (`run.mjs:771`) makes v7-new cases never comparable
  (`:928-937`).

**Run of record and the pages**
- `src/cli/docs/measurements.ts` holds `RUN_OF_RECORD_PATH` (`:102`), `RUN_OF_RECORD_RELEASE` (`:115`),
  `RUN_OF_RECORD_CARRIED_TO` (`:134`), `RUN_OF_RECORD_CANDIDATE` (`:135`), `carriedToRelease` (`:151-177`) and the
  template clause (`:896-908`). The same clause is typed by hand on `README.md:34-38` and `docs/doctrine.md:97-102`.
- Its tests: `test/cli/docs/measurements.test.ts:32`, `:35`, `:507-568`, and `test/docsPages.test.ts:7`, `:10`,
  `:1148-1161`, `:1181-1196`.
- **Second break:** the composition test demands a `## 0. Composition` section and a chain longer than one
  (`measurements.test.ts:442-447`, `:468-470`), which a full baseline run does not have.

**Confidence parsing (`build/369`)**
- `CONFIDENCE = /\b([01]\.\d+)\b/g` (`measurements.ts:254`), with the last match taken (`:462-465`). So "1.10" in
  "1.10.0", and "1.9" in "1.9.0", read as confidences.

**Spec citations (`build/325`)**
- `docs/specs/orchestrator-context.md` dates its citations to `fed39ac` (`:23-25`). Its requirement-statement
  citations to `st-work.md` and `work.test.ts` sit at `:146`, `:147`, `:252`, `:265`, `:281`, `:299` and `:379`.
- `docs/specs/model-ladder.md` has seven, at `:18`, `:75`, `:89`, `:90`, `:105`, `:111` and `:121`, with its
  provenance note at `:129`.
- The line numbers move with file 1's and plan 011's spec merges, so the refresh reads text, not numbers.

**Cost**
- Run 27, the last full run: 297 + 297 + 5 calls, calibration 1m09s, scoring 4h50m at capacity 4
  (`evals/runs/2026-09-15-run-27/RESULTS.md:42`, `:154`). Scaled to 306 + 306 + 5 calls, that is about 5 hours.
- Each call is a fresh `claude -p` in the configuration directory the operating session authenticates with. It
  spends that account's usage window, and a run is resumable.

**Release checklist**
- `.github/release-controls-checklist.md`: the eval line at `:192-212` (it names `MODEL-PROFILES-v1.md` at `:201`
  and "all 102 v6 cases" at `:206`); the hand-page re-attestation at `:221-226`, with `RELEASE_CUT_DATE` at
  `test/docsPages.test.ts:449` and `REATTESTATION_DATE` at `:503`; the measurements refresh at `:228-233`; the
  private re-sync at `:187-190`.
- The archive step lives in the release handoff pattern (`evals/EVIDENCE-STORAGE.md:76-97`).

## Spec delta

`/st-work` merges these into `docs/specs/prove-behavior-and-value.md` at its Prove phase. Each MODIFIED requirement
keeps its existing statement except for the change named.

### REQ-PROVE-009 — Eval set v7 with cases-v6

MODIFIED. At 1.10.0 the `claude` profile's scenario model is `claude-opus-5-5`; the judge is unchanged. The
comparator key carries the model pair.

- GIVEN two runs with an equal profile name, rubric-core hash and harness but different scenario models WHEN a run is
  composed or its advisory repeats are compared THEN the earlier run is not its prior run.
- GIVEN the 1.10.0 release run THEN it measures all 102 cases at three samples with calibration first, and its
  advisory-repeat section reads "first run of this configuration".

### REQ-PROVE-020 — Measurement report

MODIFIED. The carried-to criterion added at the 1.9.1 cut is retired together with the clause: run 33 is 1.10.0's
own run, measured in full. The stated-confidence reading ignores version numbers.

- GIVEN the tree after the cut THEN `RUN_OF_RECORD_CARRIED_TO`, `RUN_OF_RECORD_CANDIDATE` and `carriedToRelease` are
  absent, and README, the doctrine and the page name run 33 as the 1.10.0 release run, measured in full.
- GIVEN a verdict line "medium / 0.60 … 1.10.0" THEN the stated confidence reads 0.60. GIVEN "approve for 1.10.0"
  alone THEN no confidence is read.

## Units

### eval-profile-move — the claude profile moves to Opus 5.5; the model pair joins the comparator

| Field | Content |
|---|---|
| `id` | eval-profile-move |
| `requirements` | REQ-PROVE-009 |
| `files` | `evals/model-profiles-v1.json` (`:9`), `evals/MODEL-PROFILES-v1.md` (`:10`, `:29-30`), `test/evals/modelProfiles.test.ts` (`:29-38`), `evals/README.md` (`:77-78`), `evals/SET-v7.md` (a dated paragraph and the comparator fields at `:532-536`), `scripts/eval/run.mjs` (`:89-111`), `test/evals/manualRunner.test.ts` (`:1457-1464`) |
| `interfaces` | **Order.** The test is written first: `modelProfiles.test.ts` asserts the new pair and is seen red against the old JSON. **Profile.** `claude.scenario.model` becomes `"claude-opus-5-5"`; `claude.judge.model` stays `"claude-fable-5-1"`. **Profile doc.** In `MODEL-PROFILES-v1.md`, the accepted reporting variant becomes `claude-opus-5-5[1m]`. **Comparator.** `comparatorKey(summary)` returns `{ profile, rubricCoreHash, harness, models: { scenario, judge } }`. `recordedKey` reads `models` from the run's recorded configuration (`inputs.json` `configuration.models`); a historical run with neither field is not compared on models, which is the existing tolerance rule. **SET-v7 paragraph**, dated at the commit: "At 1.10.0 the claude profile's scenario model moved from claude-opus-5 to claude-opus-5-5 (the model mix of 2026-09-23). A profile change starts a separate baseline, so 1.10.0's run measures every case in full. The comparator key carries the model pair from this release on, so a run on another pair is never composed with this one." The `:532-536` field list gains `models` |
| `testCriteria` | (a) `test/evals/modelProfiles.test.ts` asserts `claude-opus-5-5` and `claude-fable-5-1`, and was red before the JSON edit. (b) `previousRun` over two summaries with an equal profile, rubric hash and harness but scenario models `claude-opus-5` and `claude-opus-5-5` returns `undefined`. (c) Two summaries on the same pair compose as before. (d) `npx vitest run test/evals` exits 0 |
| `edgeCases` | A historical summary without `models` and without `inputs.json` models is compared as today. The judge id does not move. **Folded in at Frame (inbox rows 33 and 42; the maintainer, 2026-09-24).** (i) `advisoryRepeats()` compares ids of one shape: it reads `failure.id` when a failure is an object and the string otherwise, because driver-produced summaries carry `advisory.failures` as objects. A case pins an object-shaped summary against a string-shaped one. (ii) A summary recording none of the comparator key's fields matches no key, where today it matches every key (`scripts/eval/run.mjs:206`). A case pins it, and SET-v7 § 8's sentence moves in the same dated paragraph |
| `depends_on` | none |
| `verify` | `npx vitest run test/evals && npm run lint && npm run typecheck` |

### driver-pins — the private driver's id pins move with the profile, tests first (private layer)

| Field | Content |
|---|---|
| `id` | driver-pins |
| `requirements` | REQ-PROVE-009 |
| `files` | The private layer's eval driver: `driver/inspect.mjs` (`:17-18`), `driver/inspect.test.mjs` (`:14`, `:29`, `:86-97`, `:231-232`), `driver/run.mjs` (`:44`, `:496`, `:701-708`, `:714`, `:730`, `:1021-1022`), the private claude profile JSON the driver README names, `PROTOCOL.md` (`:5`, `:33-36`), `canary-plan.json`, and the six canary records, re-run |
| `interfaces` | **Order.** Tests first; each new pin is seen red against the old code. **Pins.** `EXACT_MODELS` names `claude-opus-5-5` for the scenario and loader roles and `claude-fable-5-1` for the judge and calibration roles, keeping the role keys the file already uses. `ACCEPTED_REPORTING` for the scenario and loader roles is `['claude-opus-5-5', 'claude-opus-5-5[1m]']`. `run.mjs:44` pins the sha256 of `evals/model-profiles-v1.json` as committed by `eval-profile-move`. **Admission.** `liveAdmitted` (`run.mjs:496`) also requires `item.model === EXACT_MODELS[item.role]`. **Rendering.** The K3/K4 canary expectations and the results table name the new ids. **Requests.** Every request passes the explicit id, never an alias. **Canaries.** Afterwards the six canaries re-run: K1, K1b, K1c, K2, K3, K4. Their records are committed in the private layer, and its hygiene gate is run by exit code |
| `testCriteria` | (a) Every new test is red before and green after. (b) `assertExactModel('scenario', 'claude-opus-5-5')` admits both reporting forms, and a requested `claude-opus-5` is refused. (c) An init message reporting `claude-opus-5` ends `init-model-mismatch`. (d) `liveAdmitted` refuses a live canary recorded on `claude-opus-5`. (e) The pinned profile sha256 equals `shasum -a 256 evals/model-profiles-v1.json` on the package branch. (f) The six canaries pass, and `node scripts/repo-hygiene.mjs --kind governance --base <sha>` prints PASS with exit 0 |
| `edgeCases` | An init reporting `claude-opus-5-5[1m]` is admitted. A canary record on the old model blocks `prepare` with a message naming the canary |
| `depends_on` | eval-profile-move |
| `verify` | In the private layer's eval folder: `node --test driver/inspect.test.mjs`, then the hygiene gate by exit code |

### driver-repeats — advisory repeats compare within one model pair (private layer; prove/295)

| Field | Content |
|---|---|
| `id` | driver-repeats |
| `requirements` | REQ-PROVE-009 |
| `files` | The private layer's `driver/run.mjs` (`:770-771`, `:923-937`) and a new `driver/repeats.test.mjs`, or new cases in `driver/inspect.test.mjs` |
| `interfaces` | **Case source.** `PREVIOUS_CASE_DIR` is no longer fixed to `evals/cases-v5`. An incremental run compares Expected blocks against the prior run's candidate tree, via `git show <prior candidate>:evals/cases-v6/<file>`. **Fallback removed.** The `REPEATS_AGAINST = '2026-09-11-run-24'` fallback is gone. With no prior run on the same model pair, the repeat source is "none — first run of this configuration": it is reported as such, and no `Not done` line is written |
| `testCriteria` | (a) An incremental fixture whose re-measured case is v7-new and repeats an advisory failure lists that case. (b) A full run with no prior run on its pair reports "first run of this configuration". (c) A carried case is never compared, and a case whose Expected block moved is excluded |
| `edgeCases` | A later increment on the same pair, such as 1.10.1 composing with run 33, is compared normally |
| `depends_on` | driver-pins |
| `verify` | In the private layer's eval folder: `node --test driver/inspect.test.mjs driver/repeats.test.mjs`, then the hygiene gate by exit code |

### confidence-version — a version number is not a confidence (build/369)

| Field | Content |
|---|---|
| `id` | confidence-version |
| `requirements` | REQ-PROVE-020 |
| `files` | `src/cli/docs/measurements.ts` (`:254`), `test/cli/docs/measurements.test.ts` |
| `interfaces` | `CONFIDENCE` becomes `/(?<![\w.])([01]\.\d+)(?!\w\|\.\d)/g`. (Amended 2026-09-24 to the implementer's landed form at `da6f502f`: the planned `(?!\.\d)` alone backtracks on `1.10.0` and reads `1.1`.) A match preceded by a word character or a dot (`v1.0`, `x1.5`) is refused, and so is one followed by a word character, or by a dot and a digit (`1.10.0`, `1.9.0`). A sentence-final `0.85.` still reads 0.85. `statedConfidence` (`:462-465`) is unchanged: it takes the last match. The existing fixture helper `record({ verdict })` (`:93`) is used for the cases |
| `testCriteria` | GIVEN these verdict lines THEN the stated confidence reads: "medium / 0.60 … 1.10.0" gives 0.60; "approve for 1.10.0" gives none; "high / 0.90" gives 0.90; "v1.0" gives none; "1.9.0" gives none; "1.0" gives 1.0; "confidence 0.85." gives 0.85 |
| `edgeCases` | A line with two confidences takes the last one, as today |
| `depends_on` | none |
| `verify` | `npx vitest run test/cli/docs/measurements.test.ts && npm run lint && npm run typecheck` |

### baseline-run-33 — the new-baseline eval run at the candidate

| Field | Content |
|---|---|
| `id` | baseline-run-33 |
| `requirements` | REQ-PROVE-009, REQ-CTX-015 |
| `files` | The private layer's run folder for run 33 (the driver's journal, `run.json` and its configuration). Public: `evals/runs/<date>-run-33/`, exported in run 32's shape (`RESULTS.md`, `summary.json`, `inputs.json`, the per-case files) |
| `interfaces` | **Preconditions**, each true before `prepare`: (1) `eval-profile-move`, `driver-pins` and `driver-repeats` are merged. (2) `content/` is frozen: every unit of file 1 and plan 011 that touches `content/` has landed (none is planned to), so the case sources cannot move under the run. (3) The maintainer has read the account's usage window and said go; the run spends the window of the configuration directory it runs in. (4) No replay run is live on the machine; plan 011's schedule settles the order. **Steps.** `prepare` without `--prior-run`; `calibrate` (5 of 5, or the run is terminal, with no re-roll); `score` (306 scenario and 306 judge calls at capacity 4, about 5 hours by run 27's timing, resumable, admitted grades never re-rolled); `export` to `evals/runs/<date>-run-33/`. **Requests.** Explicit ids only (`claude-opus-5-5`, `claude-fable-5-1`), never an alias |
| `testCriteria` | `RESULTS.md` carries its status line. 306 of 306 samples are admitted, and calibration is 5 of 5. Every SET-v7 threshold holds: the four thresholds, and every adversarial case at 1.0. `inputs.json` records the new profile's sha256 and the model pair. The advisory-repeat section reads "first run of this configuration". `npx vitest run test/evals` exits 0 with the export committed |
| `edgeCases` | A calibration mismatch makes the run terminal: it is reported, and the release waits for the maintainer. A red metric is not release evidence (checklist `:210`): the maintainer is asked, with the per-case evidence |
| `depends_on` | eval-profile-move, driver-pins, driver-repeats |
| `verify` | `npx vitest run test/evals && npm run gate; echo exit=$?`, and the private hygiene gate by exit code |

### run-of-record-1-10-0 — run 33 becomes the run of record; the carried-to clause is deleted

| Field | Content |
|---|---|
| `id` | run-of-record-1-10-0 |
| `requirements` | REQ-PROVE-020 |
| `files` | `src/cli/docs/measurements.ts` (`:102`, `:115`, `:117-135`, `:151-177`, `:896-908`), `test/cli/docs/measurements.test.ts` (`:32`, `:35`, `:435-493`, `:507-568`), `test/docsPages.test.ts` (`:7`, `:10`, `:1148-1161`, `:1181-1196`), `README.md` (`:34-38`), `docs/doctrine.md` (`:97-102`), `docs/measurements.md` (regenerated) |
| `interfaces` | **Constants.** `RUN_OF_RECORD_PATH` names run 33's folder, and `RUN_OF_RECORD_RELEASE = "1.10.0"`. **Deleted.** `RUN_OF_RECORD_CARRIED_TO`, `RUN_OF_RECORD_CANDIDATE`, `carriedToRelease`, the template's carried-to clause, the describe "the run of record is carried to the release the tree ships as", and the docsPages clause case. **Composition test.** It branches: a run of record with a `## 0. Composition` section keeps today's assertions; one without it asserts that the page says it measured every case in full. **Pages.** README and the doctrine say run 33, the 1.10.0 release run, measured every case in full; the "composed / runs 29, 30, 31 and 32" wording goes. **Regeneration.** `node scripts/generate-docs.mjs --page measurements` |
| `testCriteria` | `grep -rn "carriedToRelease\|RUN_OF_RECORD_CARRIED_TO" src test` prints nothing. The page, README and the doctrine name run 33. Regenerating the page twice gives byte-identical output. `npx vitest run test/cli/docs/measurements.test.ts test/docsPages.test.ts` exits 0 |
| `edgeCases` | A later increment composing with run 33, such as 1.10.1, takes the composition branch |
| `depends_on` | baseline-run-33 |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage` |

### spec-citations — the specs' statement citations refreshed; orchestrator-context ships (build/325)

| Field | Content |
|---|---|
| `id` | spec-citations |
| `requirements` | REQ-PROVE-016, REQ-CTX-002, REQ-CTX-006, REQ-CTX-007, REQ-CTX-008, REQ-CTX-009, REQ-CTX-014, REQ-LADDER-001, REQ-LADDER-002, REQ-LADDER-003 |
| `files` | `docs/specs/orchestrator-context.md`, `docs/specs/model-ladder.md` |
| `interfaces` | **Refresh.** Each `path:line` citation inside a requirement statement is refreshed mechanically, after the Prove phase has merged file 1's and plan 011's spec deltas. The steps: read the cited range at `fed39ac` (`git show fed39ac:<path> \| sed -n '<a>,<b>p'`); find its first and last lines at HEAD (`grep -nF`); rewrite the range; after all rows, repoint the provenance sentences to the cut's sha. The Context section's dated citations (`orchestrator-context.md:32`, `:35`, `:43`) stay as they are. **Status.** `orchestrator-context.md:4` becomes `status: shipped-with-1.10.0`, and the prose at `:12-17` says so. `model-ladder.md` keeps `shipped-with-1.9.0` and gets its provenance line (`:129`) repointed |
| `testCriteria` | For every rewritten citation, the text at the new range at HEAD equals the text at the old range at `fed39ac`; the comparison script's output is recorded in the unit report. The spec-status gate (REQ-PROVE-016) passes |
| `edgeCases` | A range whose text was reworded is cited by symbol, and the rewording is named in the provenance sentence |
| `depends_on` | external Prove-phase spec merge of file 1 with plan 011 owner: this /st-work run |
| `verify` | `npm run lint && npm run typecheck && npm run test` |

### release-cut — the version, the CHANGELOG, re-attestation, the checklist and the measurements

| Field | Content |
|---|---|
| `id` | release-cut |
| `requirements` | REQ-PROVE-018, REQ-PROVE-017, REQ-PROVE-020, REQ-CTX-015 |
| `files` | `package.json` and `package-lock.json` (version 1.10.0), `CHANGELOG.md` (the 1.10.0 section), the hand pages' currency stamps, `GOVERNANCE.md`, `test/docsPages.test.ts` (`RELEASE_CUT_DATE` at `:449`, `REATTESTATION_DATE` at `:503`), `.github/release-controls-checklist.md` (`:197-212` for run 33 and the moved profile), `evals/measurements/merge-ready-<date>.json` (new) and `docs/measurements.md` (regenerated), and the plugin and APM manifests the generators regenerate for the version |
| `interfaces` | The whole release-controls checklist runs; a patch or minor cut runs all of it. **CHANGELOG.** The 1.10.0 section is written from the two run records: session 1's context economy and session 2's enterprise work, the new fork workflow reaching forks only through a reviewed push, and the eval baseline on Opus 5.5. **Re-attestation.** The hand bucket and `GOVERNANCE.md` are re-attested claim by claim by read-only attestors at the stronger class (Fable 5.1); each stale claim is fixed here or ledgered with a reason. **Other checklist lines.** The eval line names run 33 and the in-place profile move. `node scripts/hook-latency.mjs` exits 0, and its table goes into the run record. `node scripts/merge-ready-rate.mjs --write && node scripts/generate-docs.mjs --page measurements`. The leak gate prints PASS |
| `testCriteria` | The `test/docsPages.test.ts` currency cases pass with the new dates. The measurements page regenerates byte-identically. `npm run lint && npm run typecheck && npm run test -- --coverage && npm run gate` exits 0. CI is green on every leg, Windows included |
| `edgeCases` | An attestor finding a stale claim on a page no unit touched fixes it in this unit, or ledgers it with a reason. A second close on the same day finds the snapshot byte-stable; the snapshot is never rewritten |
| `depends_on` | run-of-record-1-10-0, spec-citations, confidence-version, external evals/replay/COMPARISON-v2.md reading Merge gate PASS owner: plan 011's scored runs, external QA checkpoint signed owner: the maintainer |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && npm run gate && node scripts/leak-gate.mjs; echo exit=$?` |

### release-handoff — merge, tag, publish, verify, archive, re-sync

| Field | Content |
|---|---|
| `id` | release-handoff |
| `requirements` | REQ-PLUGIN-012, REQ-PROVE-020 |
| `files` | `.stamity/runs/2026-09-24_enterprise-release/record.md` (the close), `evals/runs/<date>-run-33/ARCHIVE.json` and the compacted summary, `docs/measurements.md` (if the snapshot moves), and the private layer's close records |
| `interfaces` | **Merge.** When both aggregators, `all-ci-checks` and `all-pr-checks`, read `pass`: `gh pr merge <n> --rebase`. If GitHub refuses to rebase the long branch, verify that the head equals the gated sha and fast-forward with `git push origin <head>:main` under the admin bypass (the #47 and #54 precedent). **Tag and approval.** An annotated tag `v1.10.0` at the merged head, pushed. When the release run's `gates and pack` job passes, approve `npm-publish`: `gh api -X POST repos/zomarit/stamity/actions/runs/<run>/pending_deployments -F 'environment_ids[]=20612199931' -f state=approved -f comment=<text>`. **Verify.** `npm view @zomarit/stamity version` reads 1.10.0 (the registry may lag up to ten minutes); `git ls-remote origin refs/heads/plugin-dist refs/tags/plugins/v1.10.0` shows one sha, an orphan commit; the GitHub release's assets are present. **Archive.** Run 33 is packed with `scripts/evidence-archive.py pack --ref <merge sha>` into the public prerelease `evidence-archive-<date>`; then `scripts/evidence-summary.mjs`, then `verify`. **Close.** The measurements are refreshed; the run record is closed with its merge evidence, and the measurements page is regenerated in the same commit; the private layer is re-synced |
| `testCriteria` | npm `latest` is 1.10.0 with provenance. `plugins/v1.10.0` equals the `plugin-dist` head. The release carries its assets. The archive `verify` exits 0. `npx vitest run test/records test/learnings test/qa test/cli/docs/measurements.test.ts` exits 0 in the main checkout |
| `edgeCases` | A release run that fails after npm publish is re-run, since its steps are idempotent, and the tag is never moved. A refused rebase leads to the fast-forward push |
| `depends_on` | release-cut |
| `verify` | `npm view @zomarit/stamity@1.10.0 version && git ls-remote origin refs/tags/plugins/v1.10.0 && npx vitest run test/records test/learnings test/qa` |

## The release gate — every line holds before the tag

1. The gate of record: `npm run lint && npm run typecheck && npm run test -- --coverage && npm run gate` exits 0 at
   the candidate.
2. CI green on every leg, Windows included; both aggregators read `pass`.
3. The QA checkpoint is signed by the maintainer.
4. `evals/replay/COMPARISON-v2.md` reads `Merge gate: PASS` (plan 011).
5. Run 33 holds every SET-v7 threshold, and calibration is 5 of 5.
6. The leak gate prints PASS, read by its exit code, never through `| tail`.

## Risks

| Risk | Severity | Guard |
|---|---|---|
| The baseline compares advisory repeats against run 24, a run on the old model | Warning | `driver-repeats` removes the fallback, with its test |
| Stale old-model canaries satisfy `prepare` | Warning | `driver-pins` makes `liveAdmitted` check the model; the six canaries re-run |
| The composition test breaks on a full run | Warning | The branch in `run-of-record-1-10-0` |
| A `content/` edit after `prepare` moves case sources under the run | Warning | The `content/` freeze precondition. If one is unavoidable, compose an increment with run 33 on the same pair |
| The account's usage window runs out mid-run | Warning | The maintainer checks the window before arming; the driver is resumable and admitted grades are never re-rolled |
| The comparator composes runs across a model change | Warning | `eval-profile-move` adds the model pair to the key |
| A stale hand-page claim ships (the 1.9.1 lesson: fifteen stale claims on seven pages) | Warning | Claim-by-claim re-attestation at the stronger class |
| The replay's gate fails | Warning | The tag waits. The maintainer decides, with the comparison in hand |

## Open questions

None.

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

- Plan 009's four eval case gaps, for a later increment on the Opus 5.5 pair (D3).
- The per-call token usage of an eval run is recorded nowhere (neither the public results nor the private journal).
  Capturing `usage` from each `message_delta` would let a later run state its cost.
