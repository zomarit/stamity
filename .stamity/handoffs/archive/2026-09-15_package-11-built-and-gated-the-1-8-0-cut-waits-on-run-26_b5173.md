---
id: 2026-09-15_package-11-built-and-gated-the-1-8-0-cut-waits-on-run-26_b5173
status: archived
created: 2026-09-15T04:08:00.915Z
expires: 2026-10-15T04:08:00.915Z
summary: "Package 11 D/A/C built, reviewed and gated on candidate f2b90dc (PR #36, CI green); run 26 held on capacity at 266/599; no tag. Next: capacity, export, the scripted cut, then the morning script."
fromTool: claude
gitRef: feat/package-11-prove-behavior-and-value@fe0b596
integrity: sha256:44da169ba96a0ced9d94fc3cad839ad70e553276a5c1bb4435d7ebd4ae9c6633
---
## Problem

Package 11 (tracks D, A and C) and the 1.8.0 cut were to be executed as one overnight run on
2026-09-14/15 under "finish or do not start". Every build item ended implemented, gated and
recorded; the cut did not happen, because the release run (the eval set on the route of record)
was held by the account's capacity guard at 266 of 599 calls and cannot complete before the
maintainer decides on capacity. The candidate is measured by every other gate and waits.

## Decisions

- Every decision of the maintainer's instruction was applied with its stated default; each is
  recorded as `Default applied: …` in `.stamity/runs/2026-09-14_package-11/record.md`.
- Run 25 ended at calibration (one binding label of fixture C3 against the human label, on bytes
  identical to run 24's); the protocol makes that terminal and never re-rolled, so run 26 was
  prepared on the same candidate — its calibration matched 5/5.
- Run 26 held at 98 % of the seven-day overage-included window: the guard is respected (decision
  8); no driver policy change, no third run; per decision 11's own clause, no tag.
- The pack signing rehearsal workflow is pinned to a branch that no longer exists; it ran at the
  candidate under that ref name (then deleted) rather than by editing a frozen workflow.
- The two round-four Minors and the Windows fixture defects were fixed rather than recorded as
  "later"; the ledger's rows moved to the current state vocabulary when CI's records test
  refused the legacy one.

## Work Done

- Candidate `f2b90dc8194ad12d423534c1b021be84c645337c` on `feat/package-11-prove-behavior-and-value`
  (draft PR #36): the `ruleDelivery` option (default on-demand) with the always-on ceilings at
  95·95·95·407, the charter invariants version line and its gates, the QA harness with input-hash
  binding, the record-currency gates and carriers, the Codex profiles marked unproven, the stray
  tag removed, the two carried defects repaired, `cases-v6` under `SET-v7`, the measurements page,
  the security mapping. Spec `docs/specs/prove-behavior-and-value.md` (22 requirements) and plan
  `docs/plans/007-prove-behavior-and-value.md`.
- Review: four rounds, final verdict approve. Full local gate green at the candidate (208 files,
  8,404 tests, every coverage floor). Release dry run 34923118084 and signing rehearsal
  34923283007 green. QA harness over eight pages green (`.stamity/evidence/qa-c0e129f….json`);
  the walk-through's nine human rows are the maintainer's (71 minutes, sign-off open).
- Record-only commits after the candidate: the run record, the eight-page QA evidence, run 25's
  terminal artifact `evals/runs/2026-09-15-run-25/`, three test-only fixes for the Windows leg and
  the ledger vocabulary, the closed ledger.

## Work Remaining

- Run 26's remaining 333 calls; its export, the threshold reading and the artifact commit.
- On PASS: the cut (CHANGELOG 1.8.0 section, version restamp, spec status), rebase-merge of PR #36,
  the tree comparison, the annotated tag `v1.8.0`, the release workflow waiting on the
  `npm-publish` approval; then the post-publication verifier, the 15-minute currency recheck and
  the private record re-sync.
- Named as outside tonight's decisions: Track B; the constitution's set citation and the audit
  cycle's mirror probe (Package 12C); `evals/SET-v7.md:251` still names a fourth twin (the file
  is bound to run 26 — a versioned prose correction after the run exports); the rehearsal
  workflow's branch pin; the three decision-row proposals awaiting ratification.

## Blockers

Capacity for run 26: the driver holds until 2026-09-15T15:35Z, then resumes only if every account
window reads below 98 %; the seven-day windows reset 2026-09-20T05:00Z. Whether the driver may
spend into overage is the maintainer's decision.

## Next Steps

1. Decide capacity (the maintainer): let the guard resume, wait for the reset, or change its
   policy for the overage-included window by a decision row.
2. When the private driver's `run26/detached.log` shows `scoring end`: export from a detached
   worktree at the candidate (`git worktree add --detach <dir> f2b90dc8194ad12d423534c1b021be84c645337c`,
   then the driver's `export --repo <dir> --run-dir run26 --public-dir evals/runs/2026-09-15-run-26`),
   commit the artifact on the branch, read `RESULTS.md` against SET-v7's thresholds and the
   pre-registered delivery rule. Not PASS → decision 1 (a fallen floor reverts the on-demand
   default and restores the ratchets: a new candidate) or decision 7 (a failing row repaired in
   the corpus), one more run at most.
3. On PASS, the cut in four stages: `npm version 1.8.0 --no-git-tag-version`; restamp
   `generatorVersion: '1.7.0'` → `'1.8.0'` in `scripts/pack-signing-rehearsal.mjs`;
   `node scripts/generate-plugin-manifests.mjs && node scripts/generate-apm-package.mjs && npm run build && node dist/cli.js sync && node dist/cli.js check`;
   insert the `## [1.8.0] - <date>` CHANGELOG section above `## [1.7.0]` (the drafted text is
   reproduced in the run record's closing block) with the release-run bullet from run 26; flip
   `docs/specs/prove-behavior-and-value.md` to `status: shipped-with-1.8.0` and correct its
   REQ-PROVE-011 roster sentence (three twins; 50 golden, 23 floors, 503 binding); full gate; one
   commit `chore(release): cut 1.8.0 — the CHANGELOG section, the version restamp and the spec status`;
   push; CI green on every leg; `gh pr ready 36 && gh pr merge 36 --rebase`;
   `git diff --stat f2b90dc..origin/main -- content evals scripts/eval src docs website .github/workflows`
   must show only the cut's own files; `git tag -a v1.8.0 -m "1.8.0" <merged sha> && git push origin v1.8.0`.
4. After the maintainer's `npm-publish` approval, from the private layer's side-by-side checkout
   root, one line: `zsh process/morning-1.8.0.sh` — it waits for the registry, runs the 1.8.0
   post-publication verifier read-only with its environment, performs the ≥15-minute currency
   recheck and prints the three currency rows to paste; then file the v1.8.0 currency instance,
   mark the directive done, point the dashboard's fact 4 at run 26, commit and push.

## Build & Test Status

- Local full gate at `f2b90dc`: lint, typecheck, `test -- --coverage` (208 files / 8,404 tests,
  floors held), build, leak gate, knip, sync/check, website typecheck and build — all exit 0.
- CI on the PR head: run 34926892499 success on every leg, Windows included (the docs-site deploy leg skips on a pull request by design).
- Release dry run 34923118084: success. Pack signing rehearsal 34923283007: success.
- Eval run 26: held at 266/599 admitted calls (calibration 5/5); run 25: terminal at calibration.

## File Manifest

- `.stamity/runs/2026-09-14_package-11/record.md` — committed — the run record, every phase and default
- `.stamity/runs/2026-09-14_package-11/ledger.jsonl` — committed — 85 rows, none open
- `.stamity/evidence/qa-c0e129f07de5faf4e7b599cf8e6999aceea48f0d.json` — committed — QA evidence, eight pages
- `evals/runs/2026-09-15-run-25/` — committed — run 25, terminal at calibration
- `docs/specs/prove-behavior-and-value.md` — committed — status `design` until the cut
- `CHANGELOG.md`, `package.json` — unchanged — the cut's own files, still 1.7.0
