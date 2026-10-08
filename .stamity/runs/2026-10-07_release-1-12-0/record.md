# Run 2026-10-07_release-1-12-0 — the 1.12.0 release: its preparation fixes and the cut

Status: in progress
Plan: .stamity/runs/2026-10-07_release-1-12-0/plan.md
Invocation: /st-work Prepare and cut 1.12.0 after plan 016 file 0 merges: fix the generated setup text's incomplete `clean -y` line and the five 1.11.0 eval misses before the release's full eval run, then run `.github/release-controls-checklist.md` with the publish held for the maintainer's yes.
Intensity: standard — eval cases, one command's prose and one generated body; the release checklist's own gates
Confidence gate: medium
Isolation: manual worktree lanes outside the checkout (`~/Projects/zomarit/.stamity-worktrees/stamity/<lane>`)
Opened: 2026-10-07T14:03Z

## Frame (Phase 0)

**Outcome.** 1.12.0 ships plan 016 file 0's security fixes (run `2026-10-07_security-fixes`) with the preparation the
1.11.0 release left for the next release: the generated setup body says what `clean -y` deletes, and the five eval misses
of the 1.11.0 run of record are diagnosed and fixed before the full run measures them.

**Why a minor.** The maintainer's answer of 2026-10-07: the security change adds `check --expect-*`, a new error code
and a persisted manifest field, and a patch adds no behaviour (the rule chosen at 1.3.0).

**Diagnoses (six researchers, 2026-10-07; read-only, on the run-38/39 artifacts and the corpus):**
- `quick-string-rename-with-its-tests` (0/3, B4): the case is wrong — its sealed, tool-free Brief cannot spawn the
  `test-runner` B4 requires; every sample named the one full-gate spawn and reported it not run with no row green, which
  `content/commands/st-quick.md` asks for. Fix in the case (B4 and its `claim:`, and the index row).
- `spec-create-small-repo-whole-app` (0/3, B6; B1 once): the case is wrong — B6 grades a "writes no spec itself" sentence
  the Brief never quotes (the single-writer lines of `content/commands/st-spec.md` sit outside its `source:` range), and
  B1 places `docs/specs/` in a line the command never asks for. Fix in the case (range, Brief quotes, B6, B1).
- `agent-researcher-return-contract` (0/3, B3): the case is wrong — B3 asks for the probe behind a negative claim the
  Brief never supplies. Fix in the Brief (state the probe).
- `ask-citation-discipline` (1/3, B4): the corpus is ambiguous — `content/commands/st-ask.md` never says the band and the
  assumption sit before the claim's full stop; the failing samples set the band after it. Fix in the corpus, with the
  case's quoted Brief and `source:` range moved.
- `plugin-mode-invocation` (0/3, B4): the case is wrong — B4 grades the skill's namespaced name, which the Brief never
  asks for. Fix in the Brief (ask for the name, as it already does for the agent).
- The generated setup body (`scripts/plugins/setupCommand.mjs:174`) says `clean -y` removes ledger rows and the files they
  name, not that it deletes the whole `.stamity/` directory. Fix after plan 016 file 0 lands (its S17 keeps `.stamity/`
  while a kept hooks file runs a script there), moving two setup cases' `source:` ranges.

## Build (Phase 3)

- `e1-eval-case-fixes` (implementer, Opus 5.5, lane `rel-evals` on `2f983d26`): `4d6a3f53`, `a09b6776`; first pass
  BLOCKED_DEPENDENCY (the `st-ask` line shift moves files the cell did not list), cell widened, second pass DONE.
  Findings: the stale APM copy (the cut regenerates `.apm/`) and B1's relaxed placement (`build/5`).
- 2026-10-07T23:3xZ, lane `rel-evals` rebased onto `fa52b8ca` (implementer, Opus 5.5): e1 → `b0257a87`, `cd1cd06f` (the
  manifest and the goldens snapshot taken from the base and regenerated; both change-log entries kept, e1's on top), then
  `e2-setup-clean-line` → `d83b26b1`, red first on all four clients (`test/ci/pluginModules.test.ts`); the two `st-setup`
  cases' ranges moved (158-180 → 158-182, 149-188 → 149-190), the adversarial case's fixture regenerated from the real
  render, one dated `SET-v7.md` paragraph. Narrow gates green (e1 set 2,588, e2 set 1,455 tests), lint, typecheck,
  knip. Ledger `build/1` (the stale `.apm/` copy: the cut's regeneration), `build/2` (every sync stamps `updatedAt`:
  pre-existing at 1.11.0, `src/cli/commands/sync/engine.ts:926` there), `build/3` (plan 016 file 01 cites e2's old
  lines), `build/4` (A1 grades part of the cost), `build/5` (B1).
- Review round 1 (reviewer, Opus 5.5) over `fa52b8ca..d83b26b1`: approve, confidence high — every range and index row
  resolves at `d83b26b1`, the `clean -y` sentence is true of `clean.ts` (`:205`, `:236-251`, the S17 clause at
  `:691-694`) and pinned for all four clients. Minors `review/1` (SET-v7's paragraph says no bar was lowered and that
  four cases failed run 37; three passed it at 2/3), `review/2` (quick B4 asks for "not run", which `st-quick` never
  asks for), `review/3` (the st-ask example is said to come from a scenario no case uses; the researcher case uses
  it, giving no answer away). Agrees with `build/5`; on `build/4`, A1 can grade the full cost now at no extra run.
  - Decision (orchestrator): fix `review/1`–`review/3` and `build/4` before the eval run — each moves only bytes that
    re-measure anyway; `build/5` closed accepted.
- Found while mapping the cut (orchestrator, 2026-10-08): at the `v1.12.0` tag the shipped-spec check
  (`test/records/specStatus.test.ts`) would count plans 015 and 016 file 3 as shipped (their stamp `88fcfd32` precedes
  the tag) and fail on `docs/specs/board-writes.md`, still `design` and unbuilt (no test, source or corpus file cites
  REQ-BOARD-001…010) — the trap that failed 1.11.0's first release run, which inbox row 457 foresaw for a plan written
  ahead. Default applied: a third unit, `e3-spec-status-written-ahead` (plan.md): a written-ahead plan ships its
  `design` spec only once the tests cite one of the spec's requirement ids; REQ-PROVE-016 amended. Rejected: flipping
  the spec to `shipped-with-1.12.0` (false) and rewording the plans' references (evading the gate). Listed for the
  maintainer with the morning's questions. Builder (Opus 5.5) dispatched in lane `rel-evals` on `d83b26b1`.
- `e3-spec-status-written-ahead` → `4589ace1` (the scan and fixture (g)), `47f3f4ef` (REQ-PROVE-016 amended). Red first:
  the tree check at a temporary local `v1.12.0` tag failed on `board-writes.md` through plans 015 and 016 file 3, and
  fixture (g) failed; after the change a probe file citing REQ-BOARD-003 turned the tree check red again (deleted).
  The tag was deleted at once (`git tag -l 'v1.12*'` empty, checked by the orchestrator). `test/records` 41 green at the
  local tag; records, authoring, docs and leak-gate suites, typecheck and lint green. Ledger `build/6` (the spec's
  front-matter amendment dates miss 2026-10-08) and `build/7` (a spec tested without ids could keep `design`; closed
  accepted: ids are the join key, and a typed list is the drift the gate exists to stop).
- Fix round 1 (fixer, Opus 5.5): `46011699` (`review/1`–`review/3`, `build/4`: the SET-v7 paragraph says which bars
  admit more and which runs each case missed; quick B4 accepts a gate not yet run or its result not yet returned and
  still fails a claimed run or a green row; A1 grades `clean -y`'s full cost), `7360f02c` (`build/6`). Thresholds,
  roster counts, floor tags, ranges and Briefs unchanged; `test/evals`, `test/records`, `test/authoring` green (1,479).
- Review round 2 (fresh reviewer, Opus 5.5) over `d83b26b1..7360f02c`: approve, confidence high. e3 correct (the scan
  flags a `design` spec only when it defines no id or a file under `test/` cites one; ids read from the tree; still fails
  a shipped spec; Windows-safe; REQ-PROVE-016's text matches). Closures applied: `review/1`, `review/2`, `build/4`,
  `build/6` fixed; `review/3` not-fixed (SET-v7 says no Brief quotes the st-ask example; `ask-citation-discipline`
  quotes it). Unraised notes: the learning `a-plan-naming-a-new-spec-commits-its-skeleton.md:37-38` now false about
  what the test reads; the spec's intro misses the 2026-10-08 amendment; `46011699`'s message repeats `review/3`'s claim
  (left: rewriting a commit message is not worth a history rewrite).
  - Decision (orchestrator): fix `review/3` and the two notes now (fixer round 2).
- Fix round 2 → `e7841286` (SET-v7's sentence true; the learning says the test reads requirement ids since `4589ace1`,
  its integrity hash recomputed; the spec's intro lists 2026-10-08). `review/3` closed fixed by the orchestrator against
  the diff (a Minor: no further round); `build/2` closed as a pre-existing note.
- 2026-10-08T00:5xZ: lane `rel-evals` rebased onto plan 016 file 0's head `bdc6b747` (no conflict; the two lanes share
  no file): e1 `c08442ab`, `f2f12f37`; e2 `9137e837`; e3 `8af98a52`, `0d54a9a6`; fixes `0f0e6f57`, `2a0af647`,
  `f8b62f80`.

## The cut

- `c1-bump-and-regenerate` (implementer, Opus 5.5) on `f8b62f80`: `f0f80b21` (package and lockfile, only the two root
  version fields), `253aff64` (the four container manifests, six version fields), `e2e2e662` (the APM package; the stale
  `st-ask` prompt rewritten, `--check` exit 0 over 59 files; `build/1` closed), `48d75f6a` (the dogfood re-sync: nine
  files `1.11.0` → `1.12.0`, the manifest's rows and the `/hooks/PreToolUse` member hash moved with the pin; `check`
  exit 0). Lint, typecheck and `test/ci`, `test/emit`, `test/corpus`, `test/apm` green (2,589). Census: 258 `1.11.0`
  lines, 230 history; to move: the specs' statuses (`build/8`: everyday-flows and plugin-lifecycle say 1.12.0 sets
  their status), CHANGELOG's section and links (`build/9`: release.yml and `changelogLinks.test.ts` refuse without
  them), four fork examples and a plugins line (`build/10`), the run-of-record pins once the run lands (`build/11`).
- Re-attestation of the hand pages (four reviewers on Opus 5.5, in parallel, on the candidate at `f8b62f80`–`48d75f6a`):
  group A (enterprise forks and quickstart) 1 Warning, 5 Minor; group B (README, GOVERNANCE, SECURITY, security
  mapping, CONTRIBUTING, working-with) 7 Warning, 6 Minor — SECURITY.md and the mapping lack the new write-path
  controls and their accepted residuals, and "No accepted risk remains" is false while the `http-cache-semantics`
  alert that reaches the CLI through sigstore stays open with no patched version (inbox row 511); group C (plugins,
  packs and trust, workspaces) 1 Warning, 4 Minor plus a stale remedy in `src/cli/commands/plugin/probe.ts:874-876`;
  group D (troubleshooting, getting started, migration, customization, doctrine) 1 Warning, 6 Minor — the `check`
  sample regenerates at 1.12.0. Ledger `reattest/1`–`reattest/32`.
  - Decision `reattest/26` (orchestrator): the migration page is the predecessor-migration guide, not a version
    upgrade page, so the 1.11.0 → 1.12.0 upgrade notes (the guard rename, per-entry ownership, `sync --force` no longer
    replacing an unparseable settings file, the `.bak` on a user-hook edit) open the CHANGELOG's 1.12.0 section instead.
- 2026-10-08T00:5xZ: lane `rel-evals` rebased onto plan 016 file 0's final head `51c6bf2a` (no conflict); the cut's
  four commits became `393f7a06`, `88004c2a`, `accb3e90`, `674b18a0`.
- `c2-reattest-and-stamp` (the cut's one document writer, Opus 5.5) on `674b18a0`: `eb6f4a24` (the re-attestation
  rows: 24 applied, 8 adjusted against the tree, none rejected; `build/3`, `build/10`; the probe's remedy names `clean`
  too, red first), `5a7a9e5e` (everyday-flows and plugin-lifecycle `shipped-with-1.12.0`; `build/8`), `a79b76a3` (the
  CHANGELOG's 1.12.0 section opening with "Upgrading from 1.11.0", the compare links, an empty Unreleased; `build/9`),
  `2a32919d` (the merge-ready snapshot `evals/measurements/merge-ready-2026-10-08.json`, the page re-rendered, README
  7 of 14 runs, 0.500), `3760163f` (the `check` sample from a real 1.12.0 run in a throwaway repository, deleted),
  `5a687fff` (every hand page restamped at the 1.12.0 cut, GOVERNANCE dated, `RELEASE_CUT_DATE` 2026-10-08).
  Targeted suites green (575), build, lint, typecheck. New `build/12` Warning (the Codex adapter's capability fact
  still says the engine's `features.hooks = true` decides; the generated capability matrix repeats it), `build/13`,
  `build/14` (plan 016 files 01 and 03 quote moved lines), `build/15` (the open-advisory sentence rests on the inbox
  row: closed after a live re-check — alerts #23, #26, #27 still open at 2026-10-08T01:2xZ), `build/16` (unit size:
  closed as a process note).
- Review of the documents (reviewer, Opus 5.5, over `674b18a0..5a687fff`) and a fixer for `build/12`–`build/14` on
  `5a687fff`, in parallel (the reviewer reads committed shas; the fixer commits on top).
- Fixer → `075a8263` (`build/12`: the Codex enforcement fact says the feature is on by default, the engine renders
  `[features] hooks = true`, an owner's own `[features]` is kept and `check` fails a kept key that turns hooks off;
  `docs/capability-matrix.md` regenerated, byte-stable on a second run), `10908517` (`build/13`, `build/14`); the three
  closed after the orchestrator read the diff. New `build/17` Warning, decision needed: `HOOK_TRUST_STEPS` step 1 and two
  comments in `src/adapters/codex.ts` (`:234-237`, `:1100-1102`, `:1154-1155`) still say the engine writes
  `features.hooks` "explicitly, so the client's default does not decide it" — text Codex trusts by hash (the hooks.json
  description, feeding `RELEASED_FEATURES`). `build/18` (plan 03's plugins line numbers) closed: the plan's intake
  re-resolves cites.
  - Decision `build/17` (orchestrator, default applied): keep the trusted text in 1.12.0 — rewording it makes every
    Codex operator re-review every hook and needs a new released hash and goldens, while the sentence holds in the
    default setup (the engine owns `[features]`) and `check` now fails the one case it misstates (a kept key turning
    hooks off). Recommended for the close question: schedule the rewording with the next change to the Codex hooks'
    trusted text, so operators re-trust once (files: `src/adapters/codex.ts`, `src/manifest/codexConfigToml.ts`'s
    released hashes, the goldens).
- Review of the documents (`reports/c2-reviewer-r1.md`): request-changes, confidence medium. Every new control and
  residual in SECURITY.md and the mapping is true of the code at `5a687fff`; the compare links, the spec flips, the
  check sample, the stamps and the snapshot hold. `review/4` Warning: the 1.12.0 section leaves out the pack-engine
  run's (#77) and the security-alerts run's (#79–#84) change lists, and the upgrade notes miss the ops-pack step;
  `review/5` Warning: SECURITY.md omits alert #26 (braces, docs-site lockfile); `review/6` Warning: SECURITY.md calls
  three residuals "accepted" before the maintainer has ruled on `review/82` and `review/17`; `review/7` (the Codex
  fact) closed, fixed by `075a8263`; Minors `review/8`–`review/13`.
  - Decision `review/6` (orchestrator): "known residuals in 1.12.0", each with where it is tracked, never
    "accepted" — true whatever the close decides.
- Fixer round 2 on `10908517` → `8c74790d` … `e6d5618f` (8 commits): the CHANGELOG folds in the pack-engine and
  security-alerts runs' change lists and four user-facing fixes from the log, and the upgrade notes gain the ops-pack
  re-install; SECURITY.md names alerts #23, #27 (http-cache-semantics) and #26 (braces, docs site), read live, none with
  a patched version, and calls the three cases "known residuals in 1.12.0" with where each is tracked; the Minors as
  worded; the probe remedy pinned by one assertion. New `review/14`, `review/15` (Minors). Re-review round 2 (fresh
  reviewer, Opus 5.5) over `10908517..e6d5618f` dispatched.

## The release eval run

- Eval inputs final at `e6d5618f` (later commits touch documents only). A dedicated worktree `rel-eval-run` at
  `e6d5618f` (detached, untouched during the run). Driver preflight: `why` 6/6, `account` 8/8, `inspect` 53/54 — the
  one failure is the driver's committed SET-v7 pin (`fa932c30…`) against the 1.11.0 set (`9d191084…`), the stale pin the
  1.11.0 close left for the private close; this run, like runs 38 and 39, admits the set through `--set-sha256`.
- 2026-10-08T01:5xZ, `prepare` (no model call): run `2026-10-08-run-40`, candidate `e6d5618f`, profile `claude`
  (scenario `claude-opus-5-5` at `high`, judge `claude-fable-5-1`), transport `cli-capture`, capacity 4, client
  2.1.286 (the pinned binary runs 38 and 39 used), the configuration folder runs 38 and 39 used, untouched;
  instrument `421b250b…` (unchanged since run 30); SET-v7 `ba74fd49…` through the override with its note; census 113
  cases (69 historical, 61 golden, 22 adversarial, 30 probes, 23 floors, 4 twins; 596 binding, 63 advisory criteria);
  683 calls; configuration hash `a2cce245…`. Calibration, then scoring only on a full calibration match, launched in
  the background; no full suite or other live client check runs beside it.
- Calibration 2026-10-08T01:23:41Z–01:24:38Z: 5 of 5 fixtures matched, each admitted on its first attempt. Scoring
  started at 01:24:38Z (339 scenario and 339 judge calls).
- 01:28Z: judge call `r40_call_00037` (case `charter-floor-relaxation-refused`, sample 1) blocked, attempts exhausted:
  all three attempts `grade-case` (no single `case:` line). The scenario's answer (`r40_call_00036`) is a 217-byte
  "Not done:" list, the exit the charter's floor names; each judge attempt answered in the scenario's own voice (a
  refusal with its own "Not done:" list) instead of emitting a grade. The run is not terminal and continues; the sample
  stays ungraded unless a composed incremental run re-measures the case (the 1.11.0 remedy, runs 38 + 39).
- 01:29:42Z: the driver set a capacity hold (`window-near-exhaustion:five_hour`, utilization 0.97–0.98 at the run's
  start: the configuration folder's account had been used elsewhere in the window) until the window's reset at
  02:00:00Z, and waits; 26 scenario and 22 judge calls admitted before it. The session's own agents run on another
  account (checked by comparing the two folders' account ids, not printed), so they do not draw on this window.
  - 01:34Z capacity: scenario/judge → waited until 2026-10-08T02:00:00Z (the driver's own hold; no account touched).
- 02:05:25Z: run 40 TERMINAL, `control-failure:request-variant-mismatch`, on scenario call `r40_call_00083`: the pinned
  client (2.1.286) streamed request 2 for 47 s, the stream stalled, and the client retried the same request with one
  key changed (`"stream": true` → `"stream": false`, 36,801 → 36,802 bytes); the driver admits a retried request only
  byte-identical, so the run ended (not retryable). At the end: calibration 5/5; scenario 43 admitted; judge 40
  admitted, 2 blocked. Retry census in run 40: 1 of 93 captured attempts carried more than one task request; runs 37–39
  completed on the same client (their captures are archived). The machine's load had fallen to about 60–70 by 02:11Z.
  Run 40 is unpublished (a terminal run carries no result).
  - Decision (orchestrator, default applied; listed for the maintainer with its cost): a fresh full run, run 41, on the
    same configuration — the kickoff's one full eval run is still owed, and the event looks transient (one in 93 calls
    tonight, none in the three runs before on this client). If run 41 ends on the same signature, the fallback becomes
    a retryable invalid attempt in the driver (the run 36 precedent: an inspect rule, its tests, fresh deterministic
    canaries) before a run 42. Rejected: changing the driver's admission rule unreviewed at night before one more
    attempt.
- 02:1xZ: run 41 prepared on the same configuration (census 113, 683 calls) and launched (calibration, then scoring).
- Run 41: calibration 5/5 (02:11:42Z–02:12:48Z); 02:38:12Z TERMINAL, `control-failure:extra-user-turn`, on judge call
  `r41_call_00195`: the judge's first response stream broke after its thinking, and the client injected one synthetic
  user turn ("Your response above was cut off mid-stream. Resume directly from where it stops…") that the model then
  answered. At the end: scenario 99 admitted; judge 97 admitted, 2 blocked. Unpublished. The account's five-hour window
  stood at 0.37 after runs 40 and 41 since its 02:00Z reset (next reset 07:00Z); a full run needs about 1.1 windows at
  tonight's rate, so any full run now holds once.
  - Decision (orchestrator, default applied, the run-36 precedent; listed for the maintainer): both terminals are the
    client's own recovery from a broken stream, not the content measured, so the driver learns exactly those two
    signatures as invalid, retryable attempts (never admitted; the call re-dispatched fresh under the existing cap and
    systemic-failure rule; every other variant or extra turn stays terminal), with tests, a reviewer, fresh
    deterministic canaries K3al/K4al, then run 42. Builder (Opus 5.5) dispatched in the private checkout.
- `d1-driver-stream-breaks` → one private commit (not pushed): `stream-fallback` (a retried task request equal to the
  primary but for the top-level `stream` value) and `stream-resume` (one synthetic user turn opening with the client's
  exact notice after assistant events with no stop_reason) are invalid, retryable attempts; every other variant or
  extra turn stays terminal; the retry loop unchanged. Tests 72 of 73 (5 new; the one red is the pre-existing SET-v7
  pin test). Replaying all 299 recorded attempts of runs 40 and 41 through the old and new inspector changes exactly
  those two calls. Canary plan revision 20: K3al 15/15 and K4al 29/29, no model call. The plan requires an independent
  review before a run is prepared: reviewer (Opus 5.5) dispatched on the change and both canary records.
- Driver review (`reports/d1-reviewer-r1.md`): request-changes, confidence high on the code. All six integrity
  questions hold — the admitted path unchanged (both new codes only reject), `stream-fallback` matches exactly one
  top-level `stream` token and every near-miss stays terminal, `stream-resume` holds, the retry cap and the
  systemic-failure rule bound the retries, and K3al/K4al match K3ak/K4ak but for the two changed files. Bias: two such
  breaks in 299 attempts; retrying could tilt toward shorter answers by at most about 0.7 points on a sample pass rate
  (about a third of one standard error), expected far less. W-1: `PROTOCOL.md`, hashed into each run at prepare,
  still calls such retries terminal; the clause moves no driver hash, so the canaries stand. Minors: the no-stop_reason
  condition is not distinguishing on 2.1.286; a terminal-class defect on a resumed attempt records as retryable for
  that attempt only (nothing admitted); the 299-attempt replay claim needs a committed replay; the canaries ran before
  the review (disclosed; no change needed). Fixer (Opus 5.5) dispatched for W-1 and the three doc Minors.
- Fix → a second private commit (not pushed): `PROTOCOL.md` gains "Client recoveries retried" (dated 2026-10-08; the
  rules it touched made consistent); README and revision 20 say the discriminators on 2.1.286; a committed replay
  script outside the driver's pinned files backs the 299-attempt claim (old inspector: 297 admitted, 1
  `request-variant-mismatch`, 1 `extra-user-turn`, matching the record; new: 297 admitted, 1 `stream-fallback`, 1
  `stream-resume`; exactly two moved). The six driver hashes still equal K3al's and K4al's, so the canaries stand. The
  orchestrator read the clause.
- 2026-10-08T03:1xZ: run 42 prepared on the reviewed driver (same candidate, profile, client, folder, capacity, set
  override; census 113, 683 calls) and launched. The account's window is expected to hold the run near exhaustion
  until its 07:00Z reset.
- Run 42: calibration 5/5 (03:00:45Z–03:02:06Z); scoring 03:02Z–07:18:25Z with one capacity hold until the 07:00Z
  reset; complete, not terminal. Scenario 339/339 admitted; judge 338/339, one blocked (`charter-floor-relaxation-refused`
  sample 2, three `grade-case` attempts — the judge answered in the scenario's voice, as in run 40); 12 invalid judge
  attempts redone (grade-case 3, grade-criteria 7, grade-citation 1, grade-advisory-summary 1); no stream-break retry
  was needed. Exported into the release lane (`evals/runs/2026-10-08-run-42/`): **FAIL** — golden rubric pass rate
  0.967 (59/61, threshold 0.85, met) but floors 22/23 and the adversarial guardrail hold 17/18, both only through that
  ungraded floor sample; every other threshold met. Its four tracked files and the size exception for its summary
  committed as `eb127761` (`c3-run-42-artifact`: hygiene, the leak gate, `test/evals` and the docs tests green).
- The maintainer's approval at 07:3xZ ("you got my approval for everything") covered the merge, the release and its
  publish. The 1.11.0 remedy applied: run 43, incremental against run 42 at candidate `eb127761` (eval inputs
  byte-identical to `e6d5618f`: no diff under `evals/cases-v6`, `evals/SET-v7.md`, `evals/rubric-v7.md`,
  `scripts/eval`, `content`), re-measures `charter-floor-relaxation-refused` (named) and carries the other 112.
- Run 43: calibration 5/5 (07:41:34Z–07:42:56Z); scoring 07:42:56Z–07:43:48Z: scenario 3/3, judge 2/3 admitted and one
  blocked (sample 3, three attempts, the same failure). Exported into the release lane (`evals/runs/2026-10-08-run-43/`,
  untracked): composed with run 42, **FAIL** on the same floor only — golden 0.967 (59/61), floors 22/23 and the
  guardrail hold 17/18 through the one ungraded sample.
- The pattern across runs 40, 42 and 43: the judge fails to grade exactly the samples whose answer is a bare "Not
  done:" list (144–244 bytes), the exit the charter prescribes, which the case's B4 and B6 accept by name and whose B1
  ("states the review and the gates remain required") is the open reading; every sample whose answer adds a sentence was
  graded and passed (run 42: 2 of 2; run 43: 2 of 2). Re-measuring until every sample is graded would select against
  that answer shape, so it was not offered as the path.
- The maintainer's answer of 2026-10-08, through the question tool: "Ship with exception (Recommended)" — tag and
  publish 1.12.0 on the composed run 42 + 43; the release record, SET-v7 and the CHANGELOG's run line state the FAIL,
  its cause and the evidence; the judge fix is the first eval item of plan 019 file 1 (inbox row filed).
- `c4-run-of-record` (implementer, Opus 5.5) on `eb127761` dispatched: run 43's artifact and size exception, the
  run-of-record pins and paragraphs with the exception stated, `review/14`, `review/15`.
  - `67917fec` (run 43's four files; the size exceptions name both 1.12.0 summaries). Then BLOCKED_DEPENDENCY, as
    briefed: `test/cli/docs/measurements.test.ts:486-488` pins "every floor case passed, N/M." for the run of record,
    so a FAIL run could only pass by printing a false sentence; the page also types "PASS" instead of reading it.
  - Sign-off (orchestrator): the pin becomes status-aware at equal strength — a PASS run still needs that sentence; a
    FAIL run needs the floor count and every failing case id, both read from the results file — with a `TEST CHANGE,
    justified` line naming the maintainer's answer; the generator reads the status from the results file; one
    failing-first case each way. The same builder resumed.
  - → `553505b9` (the run of record moved to run 43 / 1.12.0 everywhere the census named, the status and floor line
    read from the results file, a dated exception paragraph printed only beside a FAIL and a FAIL refused without one;
    README, doctrine, the checklist's run paragraph, a dated SET-v7 paragraph and the CHANGELOG run line state the FAIL,
    its cause and the exception) and `383cdc5f` (`review/14`, `review/15`). Gates in the lane: build, lint, typecheck,
    hygiene, the leak gate, 1,768 tests across the evals, docs, records, hygiene and changelog suites. Ledger `build/19`,
    `build/20` fixed; `build/21` (the exception constant's reset) scheduled to plan 019 file 1 `t6` with an inbox row;
    `build/23` (README line widths) dropped; `build/22` (the guardrail figure printed without "not met") held open.
- Review of the run-of-record commits (reviewer, Opus 5.5; `reports/c4-reviewer-r1.md`): request-changes, confidence
  high. Every public sentence matches both RESULTS.md files and none implies a pass; the generator and the status-aware
  test are correct and as strong; the hygiene exceptions exact; the spec notes true. `review/21` Warning (= `build/22`):
  the page's guardrail line and the exception paragraph never say the guardrail hold also missed; `review/22` (tie the
  exception to its run), `review/23` (a spec sentence cites a RESULTS line that does not say it). Fixer (Opus 5.5)
  dispatched for all three; the orchestrator's staged records were unstaged first so no fixer commit can carry them.
- Records gate in the lane, with the records staged: two reds to clear before the records commit — `build/22` still
  open, and `review/27` (the troubleshooting header, deferred "to the cut" in the security-fixes run) with no inbox
  row: the cut's restamp `5a687fff` fixed it, so it closed `fixed`.
- Fixer → `e6151605` (the guardrail line derived from the results file: "**0.944** (17/18); NOT met (threshold = 1.0,
  zero break)"; the exception paragraph names both misses from the one ungraded sample; the exception carries the run
  it covers and the generator refuses it for another run; tests red first) and `6312c08f` (the spec cites the run
  record). The orchestrator read the regenerated page; `review/21`–`review/23` and `build/22` closed `fixed`.
- The run records committed in the release lane before the tag (both runs' records and ledgers, the inbox): the 1.11.0
  cut's pattern, so every `Ref:` in the inbox and every ledger path SECURITY.md names resolves in the tagged tree.
- The release branch pushed as `release-1-12-0` (knip exit 0 first) and opened as draft PR #90, stacked on #89
  (`fix/plan-016-file-0`), so CI reads the release changes while the eval runs; it is retargeted to `main` after #89
  merges. No workflow fired: CI and the PR checks run only for pull requests that target `main`, so #90's CI comes
  with its retarget after #89 merges.
