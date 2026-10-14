# Independent ledger retirement verification

Tested commit: `23d4b17134accb85dccbb313171e6e9c256c593a`.
Predecessor: `64f6c533467acfb479b294579778e2797d603b0e`.
Reviewer: independent release-verification agent. Root checkout remained read-only;
all execution used the isolated checkout in this evidence directory.

Verdict: the bounded fix passes independent review and verification. Only
`.stamity/runs/2026-09-10_release-1.4.0/ledger.jsonl:6` changes, adding the optional
dated `retired` field to `2026-09-10_release-1.4.0/build/3`. Its seven original
fields, including the historical `state: deferred`, remain unchanged. Every other
line is byte-identical. `preservation.json` retains before/after hashes and the
original blob identity; both complete ledger snapshots are retained here.

The field conforms to the existing grammar at `test/records/ledgers.test.ts:42`
and the dated-disposition requirement at line 119. Its disposition refers to the
actual public lifecycle recorded by the current run and explicitly retains the
separate private enforcement and enterprise deployment/monitoring limits.

Independent regression evidence:

- At the predecessor, the unchanged records suite exits 1: 17 pass, one expected
  failure at `test/records/ledgers.test.ts:433`, naming precisely build/3 as a
  deferred row with neither retirement metadata nor an inbox reference.
- At the tested fix, the records and leak-gate suites exit 0: 30 tests pass in
  two files. No tests were modified or weakened. `git diff --check` passes; the
  isolated checkout is clean.
- Exact git-tree comparisons prove product, generated client artifacts, release
  workflows and graded corpus inputs unchanged from independently full-gated
  `0f7b0e9a457c6c78c96eb3cb9c24c3802d85718b`; site/docs inputs are unchanged from
  independently built and browser-verified
  `caec7fac5e45d82ad1b766c30affd3696829c690`. See `source-binding.json` for the
  explicit path sets and tree-listing hashes.

No new full-suite or browser execution is claimed for this metadata-only fix.
The previous 0f7 product gate and caec site/browser snapshots remain immutable.
Required platform CI on the final combined head and the human QA checkpoint
remain root-owned gates before merge/release.

One ancillary wording correction was sent to the root writer: the current run
record still said the historical ledger “remains unchanged.” Its original fields
and other lines are preserved, but the new retirement field must be acknowledged.
This is separate from the reviewed one-file commit.

Commands, timestamps, exit codes and logs are recorded in `commands.json` and the
adjacent logs. Reproduction script: `verify-retirement.py`. This verification did
not publish, merge, tag, approve a platform action, or alter the root checkout.
