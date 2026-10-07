# Run 2026-10-07_security-fixes — plan 016 file 0, the five 1.11.0 security fixes

Status: in progress
Plan: docs/plans/016-fork-distribution-00.md
Invocation: /st-work docs/plans/016-fork-distribution-00.md
Intensity: deep — security-sensitive paths (the ledger, the reclaim sweep, settings and hook files), public CLI contracts (`check --expect-*`, a new error code, `check --json` fields), a persisted manifest field; the full specialist pass and a whole-branch review on the frontier class (Fable 5.1) before the merge
Confidence gate: medium
Isolation: manual worktree lanes outside the checkout (`~/Projects/zomarit/.stamity-worktrees/stamity/<lane>`, branched from the integration branch, `node_modules` symlinked); units that share a file integrate one writer at a time in the plan's integration order
Branch: `fix/plan-016-file-0`, from `main` at `8540fcf2`
Opened: 2026-10-07T13:55Z

## Frame (Phase 0)

**Outcome.** The five security defects measured in 1.11.0 are fixed in one pull request: the ledger and the import
decisions are bounded to what the engine writes, and a delete or an overwrite needs the bytes too; `.claude/settings.json`,
`.cursor/hooks.json`, `.codex/hooks.json` and `.codex/config.toml` keep an owner's entries; `check` takes the expected
release, client set and install mode from its caller; a registry fork's pinned calls name its registry. Merged to `main`,
then shipped as 1.12.0.

In scope:
- the five units of the plan, in its lanes and integration order;
- the plan text the 2026-10-06 merge left inconsistent in `docs/plans/016-fork-distribution-01.md` to `-03.md`, and file
  0's own release lines (the maintainer's answer below);
- the inbox rows the plan folds in, the review bot's row on file 0, and the late review comments on #87 recorded as rows.

Out of scope:
- everything in plan 016 files 1 to 3 beyond their text fixes;
- the release cut itself (its own branch after this merge: version, CHANGELOG section, the full eval run, the generated
  setup text's `clean -y` line and the five 1.11.0 eval misses);
- the live Claude plugin walk on Claude Code 2.1.291 (diagnosed in Package 19; this run's gates run with
  `STAMITY_CLAUDE_BIN` unset and record why).

**Start answers (2026-10-07, the question tool; the maintainer).**
- The declared defaults S1–S19 stand as written.
- The release is **1.12.0**, not a patch: the change adds `check --expect-*`, a new error code and a persisted manifest
  field, and a patch adds no behaviour (the rule chosen at 1.3.0).
- The release also carries the generated setup text's incomplete `clean -y` line and the five 1.11.0 eval misses, in its
  preparation.
- The plan 016 files 1–3 merge damage is fixed now, in this pull request.

**Intake (before building).**
- Every reproduction re-ran at `8540fcf2` (code identical to the plan's stamp `d10db029`): forged ledger rows (`sync -y`
  deleted five owner files and overwrote a sixth with no `.bak`; `check` printed "5 queued for reclaim" and named `sync`),
  both `importChoice` flips, the guard-dropping `skip`, the client drop (78 rows, 76 files; `check` exit 0), and a
  `--registry` fork's 44 bare pinned calls in 23 files (`sync --help` and the update banner bare too). All reproduce.
- One release before the head (1.10.0), a Codex rule anchored to a plain folder writes `packages/app/AGENTS.md` whose first
  non-blank line is ``# Conditional rules (Codex down-conversion) — `packages/app` ``, byte-identical to the head's; the
  plan's risk row ("another first line") does not hold for 1.10.0. A folder that is an npm workspace package gets its own
  charter instead, and the rule moves into that charter's section.
- The review bot's row on file 0 (a forged row with a matching hash can still delete an owner's own `st-`-named file in an
  engine content folder): declined as a change to S3/S4 — a stronger proof cannot re-render what older releases wrote,
  and `check` now names every path a `sync` would reclaim; the residual widens the plan's follow-up row on in-bound byte
  proofs.
- The 13 post-merge #73 comments on plan 016: none bears on file 0's units; the two on what `sync` and `clean` delete
  (folder claims in another tool's lock, pre-existing placeholders) stay file 1's.
- Plan 019's #87 got a second review-bot pass after its merge (8 comments); none bears on this run; recorded as inbox rows
  for plan 019 file 1's opening inbox pass.

**Deferral inbox (step 4).** 114 rows name a path in the five units' `files` cells. The plan settles six (363 split, 486,
487, 384, 386; 324 changed and left open) and the review bot's row on file 0; the rest stay in the inbox by default (the
inbox is cleared once at plan 019 file 1's start).

**Plan gate.** Default applied: plan gate → option 1, execute now (persisted plan docs/plans/016-fork-distribution-00.md;
the start questions were asked and answered).
