# Stamity 1.7.0 preparation handoff

**Not done:** 1.7.0 is not released. The maintainer's conditional sign-off and release
go-ahead (2026-09-11) require the complete fresh behavioral evaluation to pass every
declared threshold and floor; three complete full runs (19, 20, 21) each admitted all 234
scenario samples and did not meet that bar. Version 1.6.0 remains published; 1.7.0 is
prepared and unpublished. No merge, tag, publication or protected deployment approval
occurred. A maintainer decision is pending among: continue the repair-and-rerun loop,
close 1.7.0 unreleased pending a set revision, or release under an explicit written
exception naming the red metrics.

Current candidate: `29894bc4987706a92c295313057ee046f71c52fb` on
`feat/package-10-finish-implementation`, draft [PR #34](https://github.com/zomarit/stamity/pull/34),
measured by run 21. The reader corrections that followed run 21 are committed on top of it
(reader only; the corpus, cases and thresholds are unchanged since `29894bc`).

## Route and runs

Route `stamity-claude-cli-v1`: one fresh `claude -p` subprocess per call, exact model ids
(`claude-opus-5` scenarios, `claude-fable-5-1` judges) proved on every admitted call at the
API boundary, harness tool removal, exact task delivery observed, ambient context fingerprinted
per role, harness-default decoding recorded, a loopback capture of every request and response,
three attempts per logical call, admission codes and a circuit breaker. Rubric v6 and its
calibration keys, SET-v5, the thresholds, the floors and the strict three-sample rule are
unchanged throughout.

| Run | Candidate | Calibration | Scenarios | Judges admitted / blocked | Outcome |
|---|---|---|---|---|---|
| 15 | `0d711d8` | 0/5 (reader) | 0 | 0 | terminal; first reader correction |
| 16 | `c9ee343` | 3/5 (reader) | 0 | 0 | terminal; second reader correction |
| 17 | `94e639d` | 5/5 | 9 | 1 / 0, then circuit break | terminal; third reader correction |
| 18 | `d382e0d` | 5/5 | 52 | 50 / 2 | stopped at a capacity hold; fourth reader correction |
| 19 | `51e45af` | 5/5 | 234 | 220 / 14 | blocked; 20 product failures adjudicated and repaired |
| 20 | `fd8ec0d` | 5/5 | 234 | 229 / 5 | blocked; 13 product failures adjudicated and repaired |
| 21 | `29894bc` | 5/5 | 234 | 233 / 1 | blocked; 10 product failures, 3 ambiguous, 2 judge errors |

Every run's attempts, per-case verdicts, blocked status, refusal reasons and adjudication are
published under `evals/runs/2026-09-11-run-NN/`. Nothing from any run is scored, reused or
resumed; each correction was measured only by a fresh full run.

## What the three complete runs show

Under the strict rule a case passes only when all three samples pass every binding criterion.
Run 21, with its one reader-blocked sample admitted, would still not pass: golden rate 41/48
(0.854, zero headroom) with the floor clause failing on `rework-persistence-guard-holds`;
guardrail hold 11/14 against 1.0; benign-twin false refusal 0/4 and probes 12/12 pass. Across
the three runs 22 → 15 → 11 cases carried a non-passing sample. Each corpus repair fixed what it
targeted; each run produced a fresh set of single-sample misses elsewhere. In run 21 seven of
ten failing cases miss on exactly one sample with two compliant siblings under the identical
Brief, and the second repair caused no new failure (Briefs byte-identical where new failures
appeared). Two failures persist through all three runs (`agent-performance-return-contract`
B6, `eval-change-needs-fresh-measurement` B4). The per-sample miss rate of roughly one in
twenty on a sampling model leaves the declared strict bar with little tolerance; that finding
is recorded for the maintainer, and the thresholds are unchanged.

## Instrument corrections (all public, all independently reviewed)

Seven reader corrections (`c9ee343`, `94e639d`, `d382e0d`, `51e45af`, `249b4c9`, `6b12446`,
and the unit committed after run 21) widened what the citation reader accepts as presentation:
line wrap, elisions, negative-search vocabulary, silence phrasings, markup absorption,
structural fragments, fenced quotes, list markers, quote-mark classes, uncited advisory rows
admitted as a third state, HTML tags, scoped searches, join-token runs. Every one was measured
against every historical citation with zero regressions; the README section "What the citation
reader accepts as presentation" states the envelope and its residuals. Quotes of text the
transcript does not carry stay refused. The deterministic canaries K3c/K4c cited by runs 15–19
recorded vacuous passes; the defect is corrected, real canaries ran under every later driver,
and the affected notes carry the correction.

## Product repairs (public, reviewed on merits and by execution)

Two corpus repairs (`fd8ec0d`, `29894bc`) repaired the adjudicated product failures of runs 19
and 20 in the model-executed corpus, with every affected sealed Brief and source range moved in
the same diff; no Expected block, criterion, claim, class, metric, floor tag, threshold, rubric
or profile changed. The always-on line budgets ratcheted down where they could (cursor 97 → 92,
claude and copilot 240 → 236, codex held at 1063); the shared-bytes disclosures and the
capability matrix carry the measured figures.

## Automated and platform verification on the candidate

| Actual run on `29894bc` | Result |
|---|---|
| CI 34681313989 | Passed (Windows, Linux, APM). |
| PR checks 34681313990 | Passed. |
| Docs site 34681315583 | Passed. |
| Release dry run 34681342641 | Gates, pack and APM route passed; publication skipped. Tarball `zomarit-stamity-1.7.0.tgz` sha256 `ea713559924508d685c5383f71b97096a4e5eba99a50a58b280a7dfebe20c733`, SBOM present. |
| Signing rehearsal 34681343585 | Real GitHub OIDC/Sigstore signing passed. |

Local gates on every commit: lint, typecheck, `npm run test -- --coverage` (197 files,
7,923–7,931 tests, 2 existing skips; coverage 96.37 / 89.66 / 98.68 / 97.25), leak gate 0
hits, knip, drift clean. The four client fixtures and the local site snapshot prepared for
human QA were built from the earlier tarball (`2f86a82c…`, source `cae3fcd`) and were not
rebuilt; the nine human observations remain UNPERFORMED and were accepted as such under the
conditional approval, whose condition is unmet.

## Prepared release sequence (unchanged, not executed)

1. Confirm PR head, version, changelog date, checks, registry state and protections.
2. Mark PR34 ready, rebase-merge, compare the merged main tree with the candidate tree.
3. Create and push the governed `v1.7.0` tag at the merged commit; let `release.yml` prove tag,
   version and main ancestry and run gates, pack and APM; a person approves the protected
   `npm-publish` deployment; the workflow publishes and creates the GitHub release.
4. Verify the published tarball, registry integrity, provenance, signatures and SBOM
   independently; smoke the CLI and client setup; verify the APM route and the deployed docs;
   recheck after at least 15 minutes.

Not done: a full run passing every declared threshold and floor; the release sequence above;
post-publication verification; all nine human QA observations (accepted UNPERFORMED). The
maintainer's decision on how to proceed is pending.
