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
- The session resumed 2026-09-26T14:07Z, two days after the last activity; the state on disk was intact.
- The E4 walk returned `BLOCKED_DEPENDENCY` (`build/17`): `CLAUDE_CODE_MANAGED_SETTINGS_PATH` is a stub in the public
  builds. The orchestrator's earlier claim that the client reads it rested on a string in the binary, not on use.
  The maintainer chose the Linux-container walk. The cell is amended.
- Sign-offs, 14:08Z:
  - `review/28` and `review/36`: Claude's ConfigChange tamper entry declares the same 30 s budget.
  - `review/38`: a dispatch covers the one pass its description names (first-wins, like the pinned attribution),
    else the distinct passes its prompt names; REPLAY-v2 words it and the driver mirrors it.
  - `review/46`: v2 runs keep the `<date>-replay-<n>` id form inside `evals/replay/v2/runs/`.
  - `review/48`: an unknown `--protocol` exits 1 in every command, so `compare`'s exit 2 keeps one meaning.
- Sign-off, 14:15Z, the card reviewer's `SECURITY.md:104` Warning (decision needed: no unit owns `SECURITY.md`): the
  card's stack owns the correction, because the bound it documents is the card's. It lands in a lane stacked on
  `p16s2/hook-fix`. The implementer's `build/15` is the same finding.
- `v2-multipass`'s new NOTE_ROWS entry (`review/43`) is routed to `v2-protocol-paths`, which owns `score.mjs`.
- Sign-off, 14:28Z, the ceilings reviewer's review-gate Warning (decision needed): the plan cell is amended; a shared `planReviewGateScript` that the budget test could call is deferred to a unit owning `src/adapters/claude.ts`.
- Sign-off, 14:28Z, the driver-pins reviewer's SET-v7 pin Warning (decision needed): the pin moves to the committed hash in driver-repeats (already building, stacked on driver-pins), and the deterministic K3/K4 pair re-runs after it; driver-pins' W-1 text fix and six Minors land as a fixer round on the stack top before the live canaries run.
- 14:38Z: the driver-repeats reviewer's comparator-key Warning (decision needed) is deferred with the implementer's matching Minor: whether a CLI bump starts a new eval configuration is a methodology decision for the next increment; it cannot affect run 33.
- Sign-offs, 15:24Z:
  - `review/82` and `review/83` (hook latency): add a `--budget` flag so no CI case bounds timing; the non-Write payload names a governed role so it times the call the D2 baseline measured.
  - `review/88` (the fixture): inline sec-sql-sort's allowlist so the injection leaves no residue, before the freeze.
  - `review/89` (the fixture): REPLAY-v2 states the red-own-test effect as a threat to validity, and the canary measures it per injected pass.
  - `build/36`: the maintainer answered "Pin high". The claude profile's scenario runs at reasoning effort high, matching runs 15 to 32 and the judge. A follow-up unit moves the public profile and the private driver, and the live scenario canaries re-run at high.
- CI round 3 is green on every leg at `fcc4f59e`.
- 15:30Z: plan 010 file 2 gains two units for the maintainer's "Pin high": `eval-effort-high` (the public profile's claude scenario declares `high`; the file's sha256 becomes `f8059057…`; SET-v7 does not move) and `driver-effort` (the private driver sends `--effort high` for the scenario and pins the new sha; revision 16 re-runs the stale live canaries, then `K3ah` and `K4ah`). `baseline-run-33` now depends on both.
- 15:30Z: docs-guides rulings. `build/38` (573 lines) is accepted as built: the cell's two sections and their pins, in hand prose. `build/39`, `build/40` and `build/41` are accepted, and the cell is amended to match: vendor pages are cited by name and doc path; the manual push recipe stays for `private: true` forks; `npm ci` runs before the script. `build/43` is routed to docs-quickstart, whose cell now widens the llms entry. `build/42` is the concurrent-load flake the learning names; deferred.
- 15:30Z: `review/91` (the fixture's size) is accepted with no split. `review/90` and `review/43` wait for v2-protocol.
- 15:32Z: dispatched in parallel: the hook-latency-local fixer (review/82-87), the v2-fixture fixer (review/88, review/92), the eval-effort-high and driver-effort implementers, and the docs-guides reviewer (Fable; build/18, review/61). Then v2-protocol and v2-driver, started before v2-fixture's round 1 closes: their edge on v2-fixture is its layout, which the review settled, and the fix moves two seeds' bytes only. v2-driver's tests read a detached snapshot of the fixture lane at `1594b66d` and re-verify against the fixed head before integration.
- 15:33Z: Docker Desktop's engine is up (the maintainer cleared the dialog), so the E4 container walk is dispatched in its lane, reset to `fcc4f59e`.
- 15:37Z: docs-guides review round 1 (Fable): approve, medium confidence, no Critical or Warning. `build/18` and `review/61` are closed as fixed by its closures. `build/39`, `build/40` and `build/41` are closed against the amended cell. Four Minors (`review/93` to `review/96`) go to the walk follow-up commit, which owns the two guides. docs-guides is fast-forwarded onto the package branch (`37482812`), and the plan amendments are committed (`6bf8725b`). docs-quickstart is dispatched from `6bf8725b`.
- 15:45Z: the E4 container walk (Claude Code 2.1.281, Node 22.23.3, no credential in the container) passed W1 to W5. W1 needs one interactive start first: until then the managed marketplace is unknown to the CLI and the install fails. W2 shows the allowlist does not gate the plugin entry's own `git-subdir` source, so the renderer does not change. The record is integrated as `99317fff`. Rows `build/44` to `build/48` are opened; `build/48` (the W4 wording) is closed by amending the walk cell.
- 15:45Z: driver-effort is built as `d2ec4ae8`, stacked on `106d248f`. Rows `build/49` to `build/56` are opened. `build/49` (the canaries not yet run) and `build/50` (the verify reads the old public profile until eval-effort-high merges) are expected by the cell's order. `build/56` (no loader role) is closed by amending the cell.
- 15:46Z: the v2-fixture fixer landed `f5d38336` (review/88 and review/92) and raised `review/97`: `authenticat` no longer credits "authorization" or "unauthorized" wording. Ruling: add `authoriz` as a seventh term, before the freeze. It matches "authorization" and "unauthorized" but not `requireAuth`, so review/92's false credit stays closed and a common phrasing for a missing guard is credited again. Terms are any-of (`findings.mjs:630`), so this adds credit and cannot remove any.
- 15:49Z: the fixture's round 2 landed `ac31a7b1` (`authoriz` added; the test's six-term cap now allows seven for this one seed). It goes to a Fable re-review with review/88, review/92 and review/97. The guides follow-up landed `94805b24`, covering build/44 to build/47 and review/93 to review/96; it goes to a Fable re-review. For the release cut: the guide's `plugins/v1.10.0` block and its "reaches your fork" 1.10.0 sentence are re-checked at the candidate tree.
- 15:52Z: the private eval driver's review (Fable, driver round 2 plus driver-effort) asked for changes at medium confidence. `review/81` and `build/35` are closed as fixed. `build/37` is not fixed: the edit landed in the run folder's README, not `driver/README.md`. `review/98` (a scored sample captured at the wrong effort is admitted) and `review/99` (prepare's live-canary check ignores the requested effort) regrade `build/53` and `build/51`. Neither needs a product decision: both follow the driver's per-call admission rule. `review/100` is closed with no defect. `build/55` (effort in the comparator) is deferred with the comparator-key question.
- 15:52Z: the v2-fixture re-review (Fable) approved at medium confidence and closed review/88, review/92 and review/97 as fixed. Its preference for a uniform seven-term cap, instead of the one-seed exception, does not hold the approval and is not taken. v2-fixture is integrated as `01185d63`, `82e1ce42` and `52defaaf`. The guides re-review (Fable) closed eight ids as fixed and opened review/101 (the first-run condition) and review/102 (vendor statements in the "Not measured" list); the same fixer takes round 3. The private driver fixer is dispatched on review/98, review/99, build/37, build/51 to build/54.
- 15:58Z: the guides re-review round 3 (Fable) approved at medium confidence; review/101 and review/102 are fixed. The follow-up is integrated. docs-guides is done.
- 15:58Z: the private driver fixer landed `0ce80289` (review/98, review/99, build/37, build/52, build/54) and raised review/103 and review/104. Sign-off on `review/103`: a live canary not admitted for a non-retryable reason (a control failure such as effort not applied) refuses prepare for good. One not admitted for a retryable reason (the driver's own retryable codes, such as a transport error or a model mismatch) is lifted by a later admitted record of the same canary, on the same pins and requested effort. A failed control check is never re-rolled away; a passing network error does not strand the run. `review/104` is closed as built: a dropped effort flag is not transient, and a model mismatch can be.
- 16:00Z: v2-driver is built as `a11ddefc` (private; its tests pass against the snapshot and against the main checkout at `52defaaf`). Rulings on its rows:
  - `build/57`: take the measured 2,000 ms window; the cell is amended.
  - `build/58`: fire a placement only when its condition holds on two consecutive polls.
  - `build/59`: K11-K14 and the K5-K14 gate go to a new unit, `v2-driver-checks`, which v2-canary now depends on. The injection-red tests are listed by the canary runner, not gated.
  - `build/60`: the placement passes stay `u2-p1` and `u3-p1`, each firing when the first review round covering it has returned.
  - `build/61` stays open until REPLAY-v2.md lands and the skipped digest half runs.
  - `build/62` (size) is accepted.
  - `build/63`: when the two K-inject records disagree, both shapes run auto-window.
  - `build/64`: record whether a seeded file was dirty before injection.
  - `build/65` and `build/66` are recorded as built; `build/67` is closed by amending the v2-pilots cell.
