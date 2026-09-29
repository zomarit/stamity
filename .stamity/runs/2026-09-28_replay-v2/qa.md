# QA walk-through — REPLAY-v2's own package (run 2026-09-28_replay-v2, PR #58)

The change has no user-facing product surface. The npm package ships `dist/` only, and `dist/` is unchanged. What
changed:
- the replay instrument (`scripts/replay/`, `evals/replay/`), its protocol and REQ-CTX-015;
- the run records and two learnings;
- one docs page's sample `check` transcript.

No browser evidence applies. Eight rows derive from the diff:
- one for the docs page;
- four for the replay's invalid-run and replacement paths, where a scoring error would overstate recall;
- one for the injection mechanics;
- two for the frozen protocol and the check command.

**All 8 rows auto-proven**; spot-check the two highest-risk pointers, then sign. The walk-through table for a person
is empty. Each row stays walkable: every `Steps` cell is a command, run from the public checkout's root on the branch
head.

## Appendix — auto-proven rows

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| 1 | A replay whose review never covered a pass reads invalid, and none of that pass's seeds is credited | `npx vitest run test/replay/measure.test.ts -t "third canary's shape"` | exit 0; the case asserts one invalid reason naming the pass and its seed, and no credit | H | 1 | `test/replay/measure.test.ts:1613` (the third canary's shape) and `:1629` (a pass entry that omits a seed); the gate of record `npm test -- --coverage` exit 0 on `c6b686df`; the third canary re-measured at the instrument reads invalid with five uncovered passes |
| 2 | A finding made before the seeds went in credits no seed | `npx vitest run test/replay/measure.test.ts -t "dispatched before the injection point"` | exit 0 | H | 1 | `test/replay/measure.test.ts:1889` and `:1911` (a verdict agent read from its sub-agent file); the gate of record exit 0 |
| 3 | A review that names its units by feature, after six build dispatches, injects every pass exactly once | `npx vitest run test/replay/measure.test.ts -t "six builds build their own pass"` | exit 0 | H | 1 | `test/replay/measure.test.ts:1766`, `:1778`, `:1795`; both canaries pass K11, K12 and K16 at the instrument `c6b686df` (the private canary records); the driver's 126 tests exit 0 against the candidate |
| 4 | A changed scored run invalid only for an uncovered pass is not replaced, its rows read NOT-EVALUATED, and the merge gate fails | `npx vitest run test/replay/compare.test.ts -t "uncovered pass"` | exit 0 | H | 1 | `test/replay/compare.test.ts:737`; the gate of record exit 0 |
| 5 | The replay check passes over the committed v2 result | `node scripts/replay/score.mjs check --protocol v2 --runs evals/replay/v2/runs; echo exit=$?` | `exit=0` and "1 run(s) checked" | M | 1 | the command's run in this session, exit 0, after the pilot's export; the export's own check, exit 0 |
| 6 | REPLAY-v1 stays frozen | `shasum -a 256 evals/replay/REPLAY-v1.md` | the digest starts `fdee42b1` | M | 1 | the gate of record's gate 11 on `c6b686df` |
| 7 | REPLAY-v2's thresholds are v1's, key for key, and §8 names every forbidden term | `npx vitest run test/replay/score.test.ts` | exit 0 | M | 1 | the `score.test.ts` pins; the gate of record exit 0 |
| 8 | The troubleshooting page's sample `check` matches a real run | `npm run build && node dist/cli.js check`, then compare with the sample in `docs/troubleshooting.md` | the learnings row reads 16 in both | L | 2 | the section-0 implementer's diff of the sample against the real output (empty, exit 0); `test/docsPages.test.ts:2521`; the gate of record exit 0 |

**Sign-off** — REPLAY-v2's own package, PR #58, 2026-09-29

- [x] Every H row walked and passing. All eight rows are auto-proven. The maintainer signed without walking them
  ("yeah you got my approval", 2026-09-29), as in earlier sessions; the spot-check was not performed.
- [x] Every failing M row has a filed follow-up, linked. None failed.
- L failures are recorded, not blocking. None.
- Rollback: revert the package's commits on `main` (`git revert --no-edit 6f04a35c..<the merged head>`). The product
  CLI is untouched: the package ships `dist/` only, and nothing under `dist/` changed.
- Shippable: YES (the maintainer).
