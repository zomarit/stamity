# Final verification — release candidate

Candidate `a81fa5a88ed5eb525fbdffa6e1f0d23f7401fbca`, measured by evaluation run 24
(`evals/runs/2026-09-11-run-24`, PASS under SET-v6 with rubric v7). Every commit since the
prepared candidate `0d711d8` was verified locally before it was pushed: lint, typecheck,
`npm run test -- --coverage` (197 files; 7,895 → 7,945 tests as reader and rule tests were
added; 2 existing skips; statements 96.37%, branches 89.66%, functions 98.68%, lines 97.25%,
every configured floor passing), the leak gate (0 hits), knip, working and staged diff checks,
and `node dist/cli.js check` (drift clean) after each corpus repair.

| Actual run on `a81fa5a` | Result |
|---|---|
| CI 34758383684 | Passed, including the Windows, Linux and APM jobs. |
| PR checks 34758383716 | Passed. |
| Docs site 34758383679 | Passed. |
| Release dry run 34758486456 | Gates and pack, APM route smoke and the dry-run summary passed; publication skipped. Tarball sha256 `ad406d0cd035e0fcca8495550e3797ffdf2b8422f3a5d560316bcc89a288a30d`, SBOM present, tarball smoke passed. |
| Pack signing rehearsal 34758487370 | Passed (real GitHub OIDC/Sigstore signing, verification, install/update and negative controls). |

Evidence binding: the four corpus repairs changed runtime-build inputs (16 corpus artifacts and
`src/content/charter.ts`), one signing input (`src/content/charter.ts`), one release-source input
(`CHANGELOG.md`) and one QA-site input (`docs/capability-matrix.md`); the dry run and the signing
rehearsal above are bound to the final candidate. The record-only commit that carries the run-24
artifact and these records changes the changelog's release date (a release-source input read by
the release workflow's notes composition by version heading) and no runtime, packaged, site or
signing input. The prepared client fixtures and local site snapshot for human QA were not rebuilt
(the observations are UNPERFORMED and accepted).

The evaluation instrument, its tests and the evals README changed in seven reviewed reader
corrections and the SET-v6 / rubric v7 change; none is a runtime-build, packaged, site-build or
signing input. The private evaluation driver keeps calibration strict on every row, reports
uncited advisory rows as a third state, and holds a run under its capacity guard rather than
losing attempts to refusals.

Not done at this commit: the release sequence (merge, tag, workflow, protected approval) and
post-publication verification, executed after it.
