# Run record — frontier review of PR #10 (triage-handoff-execution)

- Run id: 2026-09-01_frontier-review-pr10
- Flow: standalone deep Prove-final review (frontier class, whole branch), adversarial by
  brief: every prior "fixed"/"verified"/"armed" claim treated as unproven until re-derived.
  Operator directive: fix confirmed findings, push, do NOT merge.
- Baseline: branch head c5ba9b2 (19 signed commits over origin/main@0982f6c), CI green on
  all three legs. Own darwin baseline established first: lint 0 / typecheck 0 /
  `npm test -- --coverage` 6169 tests, 168 files, all per-file floors met.
- Learnings applied (cited by id): the-local-test-gate-is-weaker-than-ci (all gates ran
  with --coverage; Windows-only claims marked CI-dependent throughout),
  surface-pins-are-literals-that-drift (R6 re-censused every pin for both new verbs),
  corpus-edits-ship-with-a-dogfood-sync (R6 verified the tri-copy + manifest digest; no
  corpus files touched by the fix set), leak-gate-scans-stamity-state-files (this record
  and the ledger scanned clean; gate run twice, 0 hits).

## Units

Review fan-out (all read every changed line of their region; no edits): R1 worktree lane,
R2 overlay/content, R3 workspace, R4 CLI raw-mode, R5 Windows cross-cut, R6 docs/pins/corpus
(stamity-reviewer ×6), S1 (stamity-security), D1 (stamity-design-quality), P1
(stamity-performance, advisory). Orchestrator lane: external claims verification (GitHub
API, npm registry), diff anomaly hunt, ledger. Fixers: F-A worktree, F-B prompts/init/config,
F-C overlay/content, F-D workspace, F-E release docs — disjoint file sets, census clean,
one writer per artifact. Dedicated stamity-test-runner for every gate.

## What the review found (before fixes)

4 Critical, ~28 Warning, graded Minors. Highest-consequence, all reproduced/derived
independently of the prior session's records:

- C: `isInside` cross-drive guard used `startsWith("/")` — `path.win32.relative` returns a
  drive-absolute for cross-root pairs (orchestrator-executed probe), so `cleanup --all`
  could force-remove worktrees the lane never created (cleanup.ts + duplicated in the CLI).
- C: a keystroke buffered between prompts auto-answered the NEXT question (menus and, via
  the paused-stream kernel queue, cooked confirms — including the destructive migrate
  default and the no-git write gate).
- C: one overlay on any pack-supplied artifact made every `stamity sync` throw a false
  orphan refusal while `validate` stayed green (emission index built without pack roots).
- C: every patched command failed `validate` with a false filename-mismatch (cmd-prefixed
  id passed as the file slug).
- W set includes: directory-copy rows stripping the credential flag from children;
  trailing-dot/space (and later `::$DATA` and symlink-strategy) credential aliases;
  consent "granted" conflated with "not needed"; two returned-not-thrown violations plus a
  mid-sweep report loss; cleanup racing setup outside the lock; over-broad Windows test
  skips; a stale "no Windows CI" claim in spec+code; a spec JSON contract never shipped;
  FIFO hang on the workspace journal; stale/single in-flight reporting; untested
  `workspace sync --force`; symlink-alias double-cascade; typed-prompt sinks printing
  manifest bytes unsanitized (the carried prove/32, independently re-found by three
  lenses); silent EOF defaults; the config picker opening into a piped stdout.

## Claims audit (prose vs. platforms)

- SECURITY.md "in force": TRUE — verified against platforms, not wording. GitHub API:
  `npm-publish` env carries required_reviewers AND a `v*` deployment tag policy; ruleset
  `release-tags` active on `refs/tags/v*` (creation/update/deletion/non_fast_forward).
  npm registry: 1.0.0 and 1.0.1 published by GitHub Actions with SLSA provenance naming
  this repo + release.yml. Nuances recorded: prevent_self_review=false; admin bypass on
  the ruleset; the 0.0.0 placeholder predates controls.
- CHANGELOG: [1.0.1] = exactly the six v1.0.0..v1.0.1 commits; [Unreleased] correctly
  carries 0982f6c. Two accuracy defects fixed: [1.0.0] date (in-tree stamp date, not the
  2026-08-31 release date) and the missing bullet for the SECURITY.md claim flip.
- release.yml extraction: genuinely fail-closed (missing file / missing section /
  blank section all fail before publish; the [1.0.1] vs [1.0.10] prefix trap closed);
  traced by hand and covered by the executed workflow test.
- Records honesty: the D15 record's "no Windows CI" was false when written (leg exists
  since the 2026-08-26 scaffold — already corrected by the local-gate learning); the
  archived handoff cites pre-rebase hashes (expected artifact of the DCO rewrite).
- Diff-integrity: a pre-existing raw NUL byte made init/plan.ts diff as binary, so its
  branch changes were invisible in the PR — read in full here; the idiom was removed from
  plan.ts and the new workspace.ts (files are textual again).

## Fix loops

Reviewer↔fixer per batch, ≥0.8 verification bar, 4-round cap, write-ahead ledger
(ledger.jsonl beside this record; every row closed or deferred-with-rationale):

- F-A worktree: rounds 1-4; R1 APPROVED 0.86 + security APPROVED. Round 2/3 found and
  closed a fixer-introduced fail-open (`not-required` proceeding through setup gates —
  now structurally fail-closed via one shared isGranted), the symlink-strategy credential
  bypass (refused pre-syscall, rationale recorded), and the `::$DATA` alias (colon refused).
- F-B prompts: rounds 1-4 + micro-round; R4 APPROVED 0.83. The drain shape was corrected
  against node stream semantics (throwaway-listener + one check-phase tick); the
  reviewer withdrew its own proposal. Incident: a fixer `git checkout --` destroyed ~450
  uncommitted test lines mid-round; reconstructed and audited complete case-by-case.
- F-C overlay: rounds 1-4; R2 APPROVED 0.88. Round 2 caught a would-be Windows-leg test
  break (native join asserted against a POSIX-rendered message), a docblock instructing
  the bug's restoration, and a vacuous fixture; round 3 additionally surfaced and closed
  a latent untested guard (origin filter under empty selection).
- F-D workspace: rounds 1-3; R3 approve 0.80, residual one-liners closed.
- F-E release docs: 2 rounds (orchestrator-reviewed); the checklist's stale draft-quote
  of SECURITY.md corrected to verbatim.

## Proof block

Gates (dedicated runner, this working tree, pre-commit): lint exit 0; typecheck exit 0;
`npm test -- --coverage` exit 0 — 6239 tests / 168 files / 1 skipped (baseline 6169;
+69 new tests ride the fixes, every behavior fix red-first with the red excerpt in the
fixer reports); per-file floors met (planner branches 93.47%≥90, skillsProjection
93.75%≥90); leak gate 0 hits / 595 files. Dist-size measured on the pre-fix head:
logic 1.87 of 2.00 MiB — inside budget, ~133 KiB headroom left (operator note).
CI at push: see PR #10 checks for the pushed head; the Windows leg is the confirmation
of record for every path/mode claim marked CI-dependent above.

Deferred with rationale (full detail in ledger rows): materialize sequential copy+digest
cost (documented design; no latency budget); UTF-16 vs display-column width (needs a
width table; ASCII surfaces safe post-clamp); detectSubRepos unbounded fan-out (pre-existing
module outside the diff; the wasteful call was removed from the refusal path); farm
containment realpath half (async ripple — tracked residual, not silent); menuTty
split-escape fidelity; pty-lane proof for the kernel-queue drain half (mechanism +
manual repro is the shipping basis, declared in-source); assorted cosmetic minors.
Rejected findings: none judged wrong without written reasoning; P1's dist-size risk
closed by measurement; S1's "in force vs. checklist" contradiction resolved by platform
evidence (the flip is true; the stale documents were corrected).

NOT merged: PR #10 remains open for the operator. Merge-readiness = CI green at the
pushed head on all three legs.

## CI addendum (post-record)

The record above was committed before the push; the CI outcome for the fix set:

- Push 1 (184724c): floor + windows GREEN; LTS red on knip — `mkfifo` (the FIFO
  regression test's binary) unlisted. knip runs ONLY on the LTS leg and no local gate
  invokes it: a third local-vs-CI divergence axis beyond coverage and the windows leg.
  Fixed by declaring the binary in knip.json (0ed50df), verified by the runner.
- Push 2 (0ed50df) attempt 1: LTS green; windows red — test/hooks/scripts.test.ts
  review-gate counter lost 1 of 30 concurrent rounds. Attempt 2 (identical code):
  windows red on a DIFFERENT test — syncDriftProof e2e at the 20s timeout. Both files
  untouched by the branch and the fixes; the hooks test's own comment records this exact
  "green to red with no source change" Windows history. Diagnosis: slow-runner flake
  class, pre-existing. Attempt 3: ALL GREEN including windows and all-ci-checks.
- Final: head 0ed50df green on floor / LTS / windows + DCO, PR-title, dist-size.
  PR #10 OPEN, NOT merged — the operator merges.

Operator notes carried out of the ledger: only ~133 KiB of logic dist-budget headroom
remains; the Windows runner flake class in hooks/scripts + syncDriftProof e2e deserves a
timing-margin pass of its own; the pty-lane drain proof and the farm-containment realpath
half are the two tracked engineering residuals; a learning candidate exists for the knip
divergence and for stash-before-checkout on shared uncommitted trees.
