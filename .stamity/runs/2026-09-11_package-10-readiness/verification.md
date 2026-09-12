# Final verification — current candidate

Candidate `29894bc4987706a92c295313057ee046f71c52fb`, measured by evaluation run 21
(`evals/runs/2026-09-11-run-21`). Every commit since the prepared candidate `0d711d8` was
verified locally before it was pushed: lint, typecheck, `npm run test -- --coverage` (197
files; 7,895 → 7,931 tests as reader tests were added; 2 existing skips; statements 96.37%,
branches 89.66%, functions 98.68%, lines 97.25%, every configured floor passing), the leak
gate (0 hits), knip, working and staged diff checks, and `node dist/cli.js check` (drift
clean) after each corpus repair.

| Actual run on `29894bc` | Result |
|---|---|
| CI 34681313989 | Passed, including the Windows, Linux and APM jobs. |
| PR checks 34681313990 | Passed. |
| Docs site 34681315583 | Passed. |
| Release dry run 34681342641 | Gates and pack, APM route smoke and the dry-run summary passed; publication skipped. Tarball 540,644 bytes, sha256 `ea713559924508d685c5383f71b97096a4e5eba99a50a58b280a7dfebe20c733`; SBOM 67,940 bytes; tarball smoke passed. |
| Pack signing rehearsal 34681343585 | Passed (real GitHub OIDC/Sigstore signing, verification, install/update and negative controls). |

Evidence binding: the two corpus repairs changed runtime-build inputs (13 corpus artifacts and
`src/content/charter.ts`), one signing input (`src/content/charter.ts`), one release-source
input (`CHANGELOG.md`) and one QA-site input (`docs/capability-matrix.md`). The earlier
packaging, signing, dry-run and QA-preparation evidence bound to `cae3fcd`/`0d711d8` is
therefore historical; the dry run and signing rehearsal above re-establish packaging and
signing evidence on the current candidate. The prepared client fixtures and local site
snapshot for human QA were not rebuilt (the observations are UNPERFORMED and accepted).

The evaluation instrument (`scripts/eval/instrument.mjs`), its tests and the evals README
changed in seven reviewed reader corrections; none is a runtime-build, packaged, site-build or
signing input. The private evaluation driver keeps calibration strict on every row and reports
uncited advisory rows as a third state from run 21's successor onward.

Not done: no full run has passed every declared threshold and floor, so no release gate beyond
preparation was exercised; the release sequence and post-publication verification remain
unexecuted.
