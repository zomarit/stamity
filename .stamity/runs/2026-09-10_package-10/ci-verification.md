# Independent GitHub verification — Package 10

PASS for actual CI, PR checks, Docs build and the **non-publishing** Release rehearsal on `713c057e113c0447ef0c2a2980d9cfc7ccea1379`. This establishes the requested automated external gates; release approval, fresh model execution and human/platform checks remain open.

All runs name the same PR #34 head. PR jobs actually checked out synthetic merge `5ba8ad80ba81e982e7550f7990a770c54f7dabd8`; the Release workflow checked out `713c057e113c0447ef0c2a2980d9cfc7ccea1379` directly. GitHub reports the same tree `0bdfe1515ec7793cb3d3fdcf5c92a3f92543dec0` for both. Independent comparison also confirms every one of the 1075 locally verified input files matches the pushed commit. The retained browser/render inputs and all 196 original blocked-run inputs still match; neither binding turns an unperformed behavioral run into a score.

| Workflow | Candidate | Conclusion | Elapsed |
|---|---|---|---:|
| [CI 34537631703](https://github.com/zomarit/stamity/actions/runs/34537631703) | `713c057` | success | 509s |
| [PR checks 34537631663](https://github.com/zomarit/stamity/actions/runs/34537631663) | `713c057` | success | 22s |
| [Docs site 34537631620](https://github.com/zomarit/stamity/actions/runs/34537631620) | `713c057` | success | 73s |
| [Release 34537639076](https://github.com/zomarit/stamity/actions/runs/34537639076) | `713c057` | success | 229s |

| Job | Job ID | Conclusion | Elapsed |
|---|---:|---|---:|
| [dependency review (advisory)](https://github.com/zomarit/stamity/actions/runs/34537631703/job/103072826001) | 103072826001 | success | 6s |
| [apm route (minimum, apm 0.29.1)](https://github.com/zomarit/stamity/actions/runs/34537631703/job/103072826153) | 103072826153 | success | 29s |
| [check (lts, node 24)](https://github.com/zomarit/stamity/actions/runs/34537631703/job/103072826166) | 103072826166 | success | 191s |
| [apm route (regression-witness, apm 0.29.0)](https://github.com/zomarit/stamity/actions/runs/34537631703/job/103072826243) | 103072826243 | success | 36s |
| [check (floor, node 22.22.2)](https://github.com/zomarit/stamity/actions/runs/34537631703/job/103072826283) | 103072826283 | success | 217s |
| [apm route (current, apm 0.30.0)](https://github.com/zomarit/stamity/actions/runs/34537631703/job/103072826294) | 103072826294 | success | 34s |
| [supply-chain currency (advisory)](https://github.com/zomarit/stamity/actions/runs/34537631703/job/103072826315) | 103072826315 | success | 14s |
| [check (windows, node 24)](https://github.com/zomarit/stamity/actions/runs/34537631703/job/103072826612) | 103072826612 | success | 500s |
| [all-ci-checks](https://github.com/zomarit/stamity/actions/runs/34537631703/job/103074977224) | 103074977224 | success | 2s |
| [PR title (conventional commit)](https://github.com/zomarit/stamity/actions/runs/34537631663/job/103072825838) | 103072825838 | success | 4s |
| [DCO sign-off](https://github.com/zomarit/stamity/actions/runs/34537631663/job/103072826059) | 103072826059 | success | 2s |
| [dist size budget](https://github.com/zomarit/stamity/actions/runs/34537631663/job/103072826150) | 103072826150 | success | 14s |
| [all-pr-checks](https://github.com/zomarit/stamity/actions/runs/34537631663/job/103072891592) | 103072891592 | success | 3s |
| [Build](https://github.com/zomarit/stamity/actions/runs/34537631620/job/103072825510) | 103072825510 | success | 68s |
| [Deploy to GitHub Pages](https://github.com/zomarit/stamity/actions/runs/34537631620/job/103073119250) | 103073119250 | skipped | — |
| [apm route smoke](https://github.com/zomarit/stamity/actions/runs/34537639076/job/103072854303) | 103072854303 | success | 32s |
| [gates and pack](https://github.com/zomarit/stamity/actions/runs/34537639076/job/103072854575) | 103072854575 | success | 219s |
| [dry run summary](https://github.com/zomarit/stamity/actions/runs/34537639076/job/103073797918) | 103073797918 | success | 3s |
| [publish](https://github.com/zomarit/stamity/actions/runs/34537639076/job/103073799382) | 103073799382 | skipped | — |

Both Linux legs ran coverage and passed 194 files / 7667 tests with the two existing opt-in skips. Windows reports: Test Files  192 passed | 2 skipped (194); Tests  7521 passed | 148 skipped (7669); Duration  420.74s (tests 96%, import 3%, transform 1%). All configured floors and the 20-second test timeout remained unchanged. The CI aggregator and PR-check aggregator passed.

The actual APM 0.29.1 and 0.30.0 routes each deployed 135 primitives across four targets, with 173 deployed files and correct lockfile typing. APM 0.29.0 was the explicit negative witness: its job passed because the real routing failure was detected (151 problems). Release's separate APM job used the canonical repository at the exact candidate commit.

Linux floor CI and Release both passed the repaired packed-artifact scan plus strict external TypeScript, JavaScript import and CLI init/check. The release rehearsal completed gates, pack, SBOM and its summary; `dry_run` was true and `publish` was skipped. Its tarball SHA-256 is `2f86a82c29aefc170dc3c787147b39f08246f0fe4d911353c37cccce0a3c3408`, identical to the independently scanned local packed artifact. The rehearsal explicitly skipped the real-release tag, version and main-ancestry proofs. Docs build passed and Pages deployment was skipped for the pull request.

## Preserved failures and corrected proof

| Original workflow | Candidate | Conclusion | Elapsed |
|---|---|---|---:|
| [CI 34535881719](https://github.com/zomarit/stamity/actions/runs/34535881719) | `41cf1aa` | failure | 433s |
| [PR checks 34535881807](https://github.com/zomarit/stamity/actions/runs/34535881807) | `41cf1aa` | success | 32s |
| [PR checks 34536659420](https://github.com/zomarit/stamity/actions/runs/34536659420) | `41cf1aa` | success | 21s |
| [Docs site 34535881728](https://github.com/zomarit/stamity/actions/runs/34535881728) | `41cf1aa` | success | 47s |
| [Release 34535889890](https://github.com/zomarit/stamity/actions/runs/34535889890) | `41cf1aa` | failure | 188s |

The original Linux floor and Release jobs found a declaration leak. Their failing raw logs remain preserved. They also exposed a false local scan claim: on macOS the copied scanner's direct-entry check accepted no work and exited zero under a temporary-path alias. `verification.md` and `verification.json` retain the historical command exits/hashes and explicitly correct that scan claim. The repaired declaration type and scanner were independently reviewed, with a real packed positive scan, a reconstructed leaking declaration and silent/failed/zero-file scanner controls before these replacement runs.

The first Windows job failed three assertions: dynamic import, cwd spelling and the committed-input fixture timeout. Its raw log is preserved. The repaired tests use file URLs and physical-path comparison, report child stderr and avoid a redundant second traversal while retaining the complete initial committed-input load, drift/rejection checks and original timeout. The new actual Windows job proves those repaired tests on Windows.

`ci-verification.json` records every original and current job conclusion, UTC timing, source identity, raw snapshot hash and downloaded log hash. Bulky raw evidence remains in the durable private CI archive. Every completed non-skipped job log was downloaded and hash-checked; skipped jobs have no execution log. This verifier only read GitHub data and wrote verification evidence; it did not dispatch/rerun, approve, merge, publish or deploy anything.

The public evidence leak gate passed: 1097 scanned files, zero hits. `git diff --check` is clean.

Not done: admitted fresh model execution/calibration, human QA, live-client runtime/trust proof and platform approval. Run12 remains the original blocked request with no admitted samples. A later evidence-only head must pass its own required GitHub checks; these results remain bound to `713c057e113c0447ef0c2a2980d9cfc7ccea1379`.
