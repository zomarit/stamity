# Package 16, session 2 — the enterprise work, REPLAY-v2 and the 1.10.0 cut (plans 010 and 011)

Status: in progress — opened 2026-09-24T11:04Z on the kickoff "Package 16, session 2 of 2: the enterprise work, REPLAY-v2 and the 1.10.0 cut"; the maintainer is present for the build, and the replay's pilots and scored runs and the eval run are authorized to run unattended afterwards (R2).
Plan: docs/plans/010-enterprise-release-01.md
Invocation: /st-work docs/plans/010-enterprise-release-01.md docs/plans/011-replay-v2.md docs/plans/010-enterprise-release-02.md — Package 16 session 2 (the enterprise work, REPLAY-v2, the 1.10.0 cut). Decisions D1–D4 and R1–R2 answered by the maintainer through the question tool on 2026-09-24; the maintainer is present for the build phase, and the replay pilots, scored runs and eval run are authorized to run unattended afterwards (R2).

The package branch is `package-16-enterprise-release`, cut from `main` `d072a347`. The plans are
`docs/plans/010-enterprise-release-01.md` (the enterprise work, 15 units), `docs/plans/011-replay-v2.md` (REPLAY-v2,
9 units) and `docs/plans/010-enterprise-release-02.md` (the 1.10.0 cut, 9 units), in that order of execution. Every
decision goes to the maintainer through the question tool, one per turn, recommended option first, with a declared
default. The replay's gate and the eval-set floors gate the 1.10.0 tag, not the merge of the build.

## Frame (2026-09-24T11:04Z)

- **Outcome.** Package 16 session 2 built and proven at the deep tier. The tag waits until all five hold: the gate of
  record, CI, the QA checkpoint, REPLAY-v2's `Merge gate: PASS`, and the eval-set floors at the Opus 5.5 baseline.
  Then 1.10.0 is released.
- **In scope.** The 33 units of the three plan files and the nine inbox rows folded in below.
- **Out of scope.** The proposals decided and not built (plan 010 file 1's list, GitHub attestations for fork
  releases among them), plan 009's four eval case gaps (D3), and every inbox row not folded in.
- **Intensity: deep.** Three signals, and `--effort` was not given:
  - a high risk surface: a publishing workflow holding a registry secret, public contracts, a managed policy, the
    release itself;
  - novel territory: fork releases, managed-settings rollout, a new replay protocol;
  - a wide diff: 33 units.
- **Model plan** (the model mix of 2026-09-23). Every class is attested per agent from its transcript.
  - Opus 5.5 (`claude-opus-5-5`, dispatched as `opus`): implementers, fixers on rounds 1–3, test-runners, the
    spec-author and researchers.
  - Fable 5.1 (`claude-fable-5-1`, dispatched as `fable`): reviewers, the security, performance and design-quality
    lenses, the round-4 and whole-branch fixers, the whole-branch deep review, and the release re-attestors.
- **Spawn plan.** About 28 implementers, about 30 reviewer and lens rounds, 10–20 fixers, and one test-runner per
  integration batch. Eight researchers already ran at `/st-plan`.
- **Measurement runs.** REPLAY-v2: 2 canaries, 2 pilots and 6–10 scored runs, about 10–14 hours. The eval baseline:
  306 + 306 + 5 calls, about 5 hours.
- **Cost order of magnitude.** 10^8 tokens, mostly the replay and eval runs.
- **Build isolation.** The operator-prepared worktree farm, as in session 1: one worktree per lane under
  `~/Projects/zomarit/.stamity-worktrees/stamity/p16s2-<unit>`. Each lane is reset to the package branch and has a
  `node_modules` symlink, stages by explicit path, and never uses `git stash`.
- **Plan intake.** Three persisted plans. Freshness guard: fresh — every `stamp:` is `d072a347` = HEAD, and no
  `reads:` path moved. Structural coverage passes on all three, with five advisory provisional definitions (the
  requirements plan 010 file 1 adds).

### Decisions

| # | At (UTC) | Decision |
|---|---|---|
| D1 | by 10:33 | E1 signing: checksums only; GitHub attestations for fork releases on the not-built list |
| D2 | by 10:33 | Hook budgets: the proposed set; `build/32` and `build/40` ride along |
| D3 | by 10:33 | Plan 009's four eval case gaps stay deferred past the 1.10.0 baseline |
| D4 | by 10:33 | The eval profile moves in place; the model pair joins the comparator key |
| R1 | 10:33–11:04 | REPLAY-v2 injects each pass's seeds as a commit at the first review dispatch covering it; the prepared change set is the fallback |
| R2 | 10:33–11:04 | Build and gate everything while the maintainer is present; then the replay's pilots and scored runs, and after them the eval run, unattended on `~/.claude-alt`; the cut follows QA, the replay gate and the eval floors |
| F1 | by 11:04 | Inbox fold-in: the nine rows below (the recommended option) |
| G1 | 11:04 | Plan gate: execute now. R2's "build first" is the go, so it is not asked a second time |

### Deferral inbox

51 inbox rows sit on files these plans touch. Nine are folded in (F1), each named by its ledger id:
- into `v2-multipass`:
  - `2026-09-23_orchestrator-context/build/172` (a structured source's term window is the ≤ 300-character summary
    only);
  - `2026-09-23_orchestrator-context/build/194` (a changed-shape report read for its findings block only);
  - `2026-09-23_orchestrator-context/build/191` (the `auto-window` sample window).
- into `v2-protocol-paths`: `2026-09-23_orchestrator-context/build/273` (the score/compare import cycle).
- into `eval-profile-move`: `2026-09-17_plugin-lifecycle/build/4` (the `advisoryRepeats()` id shapes) and
  `2026-09-17_plugin-lifecycle/prove/7` (a summary recording no key field matches every key).
- into `card-read-caps`: `2026-09-23_orchestrator-context/build/180` (the twin's unbounded ledger read).
- into the E3 units: `2026-09-17_plugin-lifecycle/build/63` (the Codex remote `--ref` form never executed) and
  `2026-09-17_plugin-lifecycle/prove/116` (the literal-against-literal Codex `--ref` pin).

The plans' own rows are already in scope: `prove/337`, `prove/338`, `prove/295`, `build/31`, `build/32`, `build/40`,
`build/139`, `build/325`, `build/353`, `build/355`, `build/362`–`build/367`, `build/369`.

The other 42 overlapping rows stay in the inbox. They sit on files this package touches but concern other behaviour.

## Ledger

`ledger.jsonl` beside this record is the write-ahead findings ledger. Rows are appended through
`stamity ledger append` and moved through `stamity ledger close`; the first two rows are the kickoff's two Windows
timeouts on `main`'s CI after session 1's close.

## Build

Lanes are dispatched as pointer dispatches from the three plan files. Implementers run at Opus 5.5 with targeted
tests only; the full suite runs once per integration batch through a test-runner. Reviewers and lenses run at
Fable 5.1. Each approved lane is cherry-picked onto the package branch in plan order of its wave.

- 11:04Z–11:10Z: 13 lanes dispatched (wave 0, wave A, plan 011's three instrument units, plan 010 file 2's two
  independent units).
- `win-timeouts` approved (high); integrated at `9d4a1946`; the draft pull request #55 opened at `6e0ba35f`.
- `e6-claude-install-note` approved (high); integrated at `871ee7bd`.
- `v2-protocol-paths` returned `BLOCKED_AMBIGUITY`: the cell's "neither file imports the other" would break v1's
  recorded `score.mjs compare` and six unedited cases. The orchestrator took reading 1: the cycle breaks in one
  direction, and the shared bindings move to leaf modules. The plan's own byte-identical rule excludes the literal
  reading, and the remaining variants do not differ materially, so the maintainer was not asked. The cell was
  amended, and the same implementer resumed.
- `confidence-version`: the implementer showed that the planned pattern backtracks on `1.10.0` (ledger `build/1`,
  fixed). The cell took the landed form.
- `e6-locator-check-root` approved (medium; the security lens posted 0 findings); integrated at `cb4fdb1f`.
- Sign-off, 11:17Z, `2026-09-24_enterprise-release/review/6` (decision needed; a two-part version such as "on 1.9"
  reads as a confidence): add a value guard in `statedConfidence`, because a read number above 1 is never a
  confidence. Also widen the lookahead to `(?!\w|\.\w)`, so that a dot followed by any word character is refused;
  this folds in `review/7` (`1.0.x`). This states the invariant directly, not through a narrower pattern.
- Sign-off, 11:20Z, `2026-09-24_enterprise-release/review/18` (decision needed; the plan cell's homepage rule has no
  referent): amend the plan cell to `https://github.com/<owner>/<repo>`, the guide's value and both fixtures'; the
  code stands. The implementer's `build/2` is the same finding.
