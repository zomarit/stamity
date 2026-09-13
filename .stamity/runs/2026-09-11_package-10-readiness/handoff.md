# Stamity 1.7.0 release handoff

The maintainer's conditional sign-off and release go-ahead (2026-09-11) required the complete
fresh behavioral evaluation and all mandatory release gates to pass. Both hold at candidate
`a81fa5a88ed5eb525fbdffa6e1f0d23f7401fbca` on `feat/package-10-finish-implementation`
([PR #34](https://github.com/zomarit/stamity/pull/34)): evaluation run 24 passes every SET-v6
threshold and floor, and CI, PR checks, Docs site, the release dry run and the signing rehearsal
are green on that commit. This record-only commit carries the run artifact and the closed
records; it changes no runtime-build, packaged, site-build or signing input.

## Route and runs

Route `stamity-claude-cli-v1`: one fresh `claude -p` subprocess per call, exact model ids
(`claude-opus-5` scenarios, `claude-fable-5-1` judges) proved on every admitted call at the
API boundary, harness tool removal, exact task delivery observed, ambient context fingerprinted
per role, harness-default decoding recorded, a loopback capture of every request and response,
three attempts per logical call, admission codes, a circuit breaker and a capacity guard.

| Run | Candidate | Rule | Calibration | Scenarios | Judges | Outcome |
|---|---|---|---|---|---|---|
| 15–18 | `0d711d8` … `d382e0d` | SET-v5 | reader-limited | 0–52 | 0–50 | terminal; reader corrections 1–4 |
| 19 | `51e45af` | SET-v5 | 5/5 | 234 | 220 (14 blocked) | 20 product failures adjudicated and repaired |
| 20 | `fd8ec0d` | SET-v5 | 5/5 | 234 | 229 (5 blocked) | 13 product failures adjudicated and repaired |
| 21 | `29894bc` | SET-v5 | 5/5 | 234 | 233 (1 blocked) | strict rule not met; SET-v6 decided |
| 22 | `224c8bc` | SET-v6 | 5/5 | 234 | 231 (3 blocked) | one floor case (rework rephrase) failed; repaired |
| 23 | `587d507` | SET-v6 | 5/5 | 234 | 234 | one floor guardrail sample (a closing offer) failed; repaired |
| 24 | `a81fa5a` | SET-v6 | 5/5 | 234 | 234 | **PASS** — golden 48/48, floors 21/21, guardrail 14/14, twins 0/4, probes 12/12 |

Every run's attempts, per-case verdicts, refusal reasons and adjudication are published under
`evals/runs/2026-09-11-run-NN/`. Nothing from any run was rescored, rerolled, resumed or reused;
every correction was measured only by a fresh full run.

## What changed to get there

- Seven reviewed reader corrections widened what the citation reader accepts as presentation
  (zero regressions over every historical citation each time); `evals/README.md` states the
  envelope and its residuals.
- Four reviewed corpus repairs (`fd8ec0d`, `29894bc`, `5e1b327`, `a81fa5a`) made the measured
  obligations explicit in the model-executed prose, with every affected sealed Brief and source
  range moved in the same diff; no Expected block, criterion, claim, class, metric, floor tag or
  threshold number changed.
- The maintainer decided (2026-09-12) that SET-v5's strict three-of-three rule measured sampling
  luck on 105 all-or-nothing samples and replaced it with SET-v6: every must-NOT criterion on a
  floor or guardrail case stays all-or-nothing, every case otherwise passes at two of three, the
  four metrics keep their names and numbers; rubric v7 adds a closed citation form with the
  calibration fixtures and keys byte-identical to v6. SET-v6 records what the rule would have
  changed on run 21 (an illustration, not a score) and that runs 15–21 are not rescored.

## Automated and platform verification on the candidate

| Actual run on `a81fa5a` | Result |
|---|---|
| CI 34758383684 | Passed (Windows, Linux, APM). |
| PR checks 34758383716 | Passed. |
| Docs site 34758383679 | Passed. |
| Release dry run 34758486456 | Gates, pack and APM route passed; publication skipped. Tarball sha256 `ad406d0cd035e0fcca8495550e3797ffdf2b8422f3a5d560316bcc89a288a30d`, SBOM present. |
| Signing rehearsal 34758487370 | Real GitHub OIDC/Sigstore signing passed. |

Local gates on every commit: lint, typecheck, `npm run test -- --coverage` (197 files, 7,945
tests, 2 existing skips; 96.37 / 89.66 / 98.68 / 97.25), leak gate 0 hits, knip, drift clean.

## Human checkpoint

The nine human-only QA observations in the [QA form](qa.md) are UNPERFORMED and were accepted as
such by the maintainer under the conditional approval; no observation, result or signature was
invented. The prepared client fixtures and local site snapshot were built from an earlier
tarball and were not rebuilt.

## Release sequence

1. This record-only commit is pushed; the required checks run on it.
2. PR34 is marked ready and rebase-merged; the merged main tree is compared with this commit.
3. The annotated `v1.7.0` tag is created at the merged commit and pushed; `release.yml` proves
   tag, version and main ancestry and runs gates, pack and APM; the maintainer approves the
   protected `npm-publish` deployment; the workflow publishes and creates the GitHub release.
4. The published tarball, registry integrity, provenance, signatures and SBOM are verified
   independently; the CLI and client setup are smoked from a clean consumer; the APM route and
   the deployed documentation are checked; a currency recheck follows after at least 15 minutes.

Not done at this commit: steps 2–4 above (executed after it); the nine human observations
(accepted UNPERFORMED).
