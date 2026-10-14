# Package 17, session 2 — the optimization sweep built (plan 013 files 2 and 3)

Status: closed
Plan: docs/plans/013-optimization-sweep-02.md
Invocation: /st-work docs/plans/013-optimization-sweep-02.md — Package 17 session 2 (the kickoff "Package 17, session 2 of 3: build what the maintainer kept"); file 3 (`docs/plans/013-optimization-sweep-03.md`, the split's second half) runs in this record after file 2's lanes on shared files.

The package branch is `package-17-sweep` (draft #63), at `f387c5e7` when this run opened; `main` is `02096da9`.
The plans are `docs/plans/013-optimization-sweep-02.md` (the core: 32 units and the one-off jobs) and
`docs/plans/013-optimization-sweep-03.md` (the next tier: 15 units, and the drop list). Session 3 runs the release eval,
QA of the candidate and the 1.11.0 cut; this session merges without a release, by fast-forward only.

## Frame (2026-09-30T10:41Z)

- **Outcome.** Plan 013 files 2 and 3 built and proven at the deep tier on `package-17-sweep`, then merged to `main`
  by fast-forward with no tag and no publish.
- **In scope.** File 2's 32 units and one-off jobs; file 3's units; the learning the kickoff names (a plan that names a
  new spec commits its skeleton in the same commit).
- **Out of scope.** The release (session 3); every drop-list item (file 3, D-01 to D-58); any before/after or
  replay-like run and any planted bug; inbox rows not folded in below.
- **Intensity: deep.** Three signals, and `--effort` was not given:
  - a security surface: a guard branch that admits read-only git for five verdict roles, and a new leak-gate rule;
  - public contracts, all additive: a substitution token, CLI flags and output lines, JSON keys, a QA status value;
  - a wide diff: 47 units across the engine, the corpus, the QA harness, CI and the eval set.
- **Model plan** (the model mix of 2026-09-23). Every class is attested per agent.
  - Opus 5.5 (`claude-opus-5-5`, dispatched as `opus`): implementers, fixers on rounds 1–3, test-runners, the
    spec-author and researchers.
  - Fable 5.1 (`claude-fable-5-1`, dispatched as `fable`): reviewers, the security, performance and design-quality
    lenses, the round-4 and whole-branch fixers, and the whole-branch deep review.
- **Spawn plan.** 3 census researchers; about 47 implementers; one reviewer round per lane batch plus the lenses on
  trigger matches (about 20 rounds); 10–20 fixers; one test-runner per integration batch; one spec-author for the
  spec merge; one whole-branch deep review.
- **Cost order of magnitude.** 10^7–10^8 tokens. This session runs no eval or replay run.
- **Build isolation.** The operator-prepared worktree farm, as in Package 16: one worktree per lane under
  `~/Projects/zomarit/.stamity-worktrees/stamity/p17s2-<lane>`, reset to the package branch, with a `node_modules`
  symlink; lanes stage by explicit path and never use `git stash`. Implementers run targeted tests; the full suite runs
  once per integration batch through a test-runner, one full suite on the machine at a time.
- **Plan intake.** Two persisted plans, both stamped `67d2b954` (a branch commit; `main` cannot reach it, so #63 merges
  by fast-forward only). Freshness guard: every `reads:` path holds except `.stamity/inbox.md`, which the plans' own
  commit `f387c5e7` moved by appending seven lines at its end. The two units that cite inbox rows
  (`l2-retire-review-197` at `:286`, `l1-gap2-digest-security-case` at `:200`) re-read their rows: both unchanged, so
  the verdict is fresh in substance and nothing re-plans.
- **Audit of session 1's late work** (read-only, before building): the stamp and `reads:`, the spec stub
  `docs/specs/everyday-flows.md` (`status: design`, 26 requirement headings) and the two inbox rows hold. Three slips
  are built around, not re-planned: `work-asks-once` spells its plan-gate log line two ways (built in the long form,
  which carries the plan path REQ-FLOW-019 asks for); `sw26-engine-cli-call-form` still lists creating
  `src/shared/cliCall.ts`, which `sw26-cli-token` owns (it only adds `cliCallHint` there); plan file 1 still calls
  itself "file 1 of 2" (left: it records the measures fixed before any run). One kickoff fact was stale: Dependabot's
  #64 (six development updates) had opened at 03:25Z, before session 1's close; its CI fails on one new oxlint rule
  (`test/cli/commands/learn.test.ts:563`), and it must not merge before #63 or #63 cannot fast-forward.

### Decisions

| # | At (UTC) | Decision |
|---|---|---|
| D1 | before 10:41 | The plans' 20 declared defaults (14 in file 2, 6 in file 3): kept as written, all four groups (the recommended option) |
| G1 | 10:41–10:47 | Plan gate (deep): execute now (the recommended option) |
| F1 | 10:41–10:47 | Inbox fold-in: only the rows the plans settle (the recommended option) |
| G2 | 10:47–11:28 | The resume card's handoff-drafts line is dropped: the session-start banner already lists each refused handoff by name and reason on every start (the recommended option) |
| G3 | 10:47–11:28 | Codex's `hooks.json` carries the pinned CLI form like every other file; the release notes say Codex re-asks for hook approval after each upgrade (the recommended option) |

### Contract census (before 11:28Z)

Four read-only researchers (Opus 5.5, attested `claude-opus-5-5[1m]` each) searched the repository for every shared
contract the two plans touch. Every file-2 contract closes on one owning unit; the settled shapes and the per-unit cell
amendments are the run's census file (`reports/census-settled.md`, local). The orchestrator settled, without a
question because the readings do not differ for the user:
- the CLI token joins the wired-token list (content validators accept only listed tokens) and the charter's one bare
  call, "change via `stamity config`", becomes the pinned form (the charter test requires every wired token in the
  charter; about 23 always-on bytes);
- in the QA harness, whose row ids all begin with `H` for a human row, an `accepted-unwalked` row never carries
  forward; the skill's input hash is its own, not the harness's `rowHash`;
- a debug record's head lines are bare, its run id carries `_debug-`, and the card identifies it by that segment;
- `ensureGitignoreEntry` runs in `sync` before the first write, and every caller inherits the four entries.
File 3's findings (two Critical, on sw18 and sw17) are amended when those units dispatch.

### Deferral inbox

82 inbox rows sit on files the two plans' units write (an exact-path match of each row's location against the units'
`files` cells). The plans settle their own: `review/197` (`l2-retire-review-197`), plan 009's gap 2 at `:200`
(`l1-gap2-digest-security-case`), the three cleanup-hook timeouts and `test/ci/pluginLifecycle.test.ts:157`
(`sw12-flake-unit`), the learnings-count sample at `docs/troubleshooting.md:34` (`retire-gate-repeat-learnings`), and
the two rows the plans appended (`src/runs/blocks.ts:17-18`, the `/st-rework` and `/st-pr-resolve` records). The other
overlapping rows stay in the inbox (F1): they sit on files this package touches but concern other behaviour.

- inbox retired: content/rules/stamity-question-protocol.md:66-67 (review/197) — retired as written

### Plan coverage

`spec-plan-coverage.mjs` on both files against `docs/specs`: exit 0 each; file 2 has 32 units over 27 ids, and file 3
has 15 units. Each file carries one advisory `provisional-definition`, for REQ-CTX-017 and REQ-CTX-018 respectively,
the new ids whose definitions this run's spec merge adds. Session 1 ran the semantic review (a Fable pass whose 22
fixes landed before `f387c5e7`).

### Live checks

- 2026-09-30T10:36Z `sw14-copilot-charter-live-check`: copilot 1.0.88 writing-agent charter: loaded yes. A scratch
  fixture set up by this branch's `init -y --tools copilot`; `copilot -p … --agent stamity-implementer
  --available-tools none` quoted both the agent body's first line and the charter's first line under `## Invariants`,
  with zero tool calls; the control without `--agent` answered `NONE` for the agent line and quoted the charter line.
  Model `mai-code-1.1-flash` (Copilot's auto routing). REQ-FLOW-023 retires with the disposition "live check found no
  gap", and no Copilot fix joins lane E.

- 2026-09-30T13:27Z `sw14-codex-learning` (the Codex learning's own fixture, re-run before its unit so the learnings
  writer can take it): codex-cli 0.155.1 (this machine; the vendor's latest is 0.159.2, unmeasured), model
  `gpt-6-astra`, auth kind chatgpt, six runs in a scratch fixture built by this branch's engine. With the key absent
  the hooks feature is on (the default, now measured); a project-file `hooks = false` did not turn it off, because the
  project `.codex/` layer is not loaded under the `-c` trust override; `codex exec` ran no project hook in 3 of 3
  runs, cause not isolated. The learning's claims fail as stated: the learnings writer recaptures it, and
  `sw14-client-currency-sweep` moves the claims tied to it (`build/95`–`build/98`). The raw debug logs carried
  account identity fields; they were redacted in place, and the report quotes none.

- 2026-09-30T14:49Z `sw18-live-check` (before its unit, in a scratch fixture built by this branch's engine for all
  four clients): codex appendix at AGENTS.override.md: codex yes, claude no, cursor no, copilot no. Controls with the
  marker in AGENTS.md: all four quoted it. Versions: codex-cli 0.155.1, Claude Code 2.1.285, cursor-agent 2026.09.28,
  Copilot CLI 1.0.89. Codex reads the override instead of AGENTS.md (a second run with a marker in each file quoted
  only the override's). Candidate (b) was not needed, and the operator's Codex config was not touched.

- 2026-09-30T15:56Z `sw17` live check (a scratch fixture built by the unit's lane, `init -y --tools codex,cursor,copilot`):
  touchpoints at .agents/skills/st-<id>/: codex $st-work yes, cursor /st-work yes; copilot lists the nine as project
  skills beside .github/prompts, and its model-visible skills list omits them (the hide key is honoured). codex-cli
  0.155.1 (read-only sandbox, model passed with `-m`, no account setting touched), cursor-agent 2026.09.28 (ask mode),
  Copilot CLI 1.0.89.

## Ledger

`ledger.jsonl` beside this record is the write-ahead findings ledger. Rows are appended through `stamity ledger append`
(the dogfood build, `node dist/cli.js`) and moved through `stamity ledger close`.

## Build

Correction, 12:49Z: several stamps in this section and in Decisions were first written ahead of the clock (estimates
up to 13:40Z, none read with `date -u`). Each is now a bound read from the clock or from git (the tag's date, commit
times); the order of the entries is the order of events.

Lanes are dispatched as pointer dispatches from the plan files, each pointing at the lane rules and the settled census
(`reports/lane-rules.md`, `reports/census-settled.md`, both local). Implementers run at Opus 5.5 with targeted tests
only; the full suite runs once per integration batch through a test-runner. Reviewers and lenses run at Fable 5.1.
Each approved lane is cherry-picked onto the package branch; the orchestrator is the one writer of generated files at
integration (build, sync, the generators, the two golden snapshots).

- 10:47Z (the tag's own date): the tag `replay-frozen-2026-09-30` pushed at `origin/main` `02096da9` (50 replay files; annotated, no
  signing key on this machine). The tag ruleset guards only `v*` tags.
- Before 11:28Z: wave 0 dispatched, nine lanes from `f387c5e7`: `sw26-cli-token` (E1), `sw30-coverage-checker` (C0),
  `qa-harness-accepted-unwalked` (Q), `sw15-agent-shell-discipline` with the researcher body's line (A),
  `work-make-room` (W), `sw25-quick-tests-ride-along` (C2), `sw04-test-framework-detection` (E2),
  `l8-delete-replay-files-behind-tag` (L8) and file 3's `sw20-email-rule` (X20, disjoint files; it integrates after L8).
- Before 11:28Z: a spec-author amends plan file 2's cells in place from the census (worktree `p17s2-spec`).
- Implementers wrote their first findings blocks as YAML, which the ledger refuses; the orchestrator re-filed them
  as JSON lines on `--stdin`, and the lane rules now spell the block's grammar. Reviewer blocks that carry an extra
  key are re-filed with the ledger's keys only.
- `sw30-coverage-checker` approved (high); integrated at `35411eff`.
- `sw04-test-framework-detection` approved (high); integrated at `23f0ae2a`. Its stale-comment Minor (`review/4`) rides
  with `sw04-python-gate-runner`, the next unit on the same file.
- Sign-off, 11:37Z, `2026-09-30_optimization-sweep/build/18` (decision needed; `sw05-verdict-roles-read-git` returned
  `BLOCKED_DEPENDENCY`: the cell's reviewer intro drops "no commands", which `test/corpus/agents/spine.test.ts:585`
  pins, and that file is `sw30-researcher-brief-keys`' in lane C1): the verdict-roles unit takes line 585 of that file
  with a dated TEST CHANGE (the head now forbids mutating commands only, since read-only git is the role's one command
  family); `sw30-researcher-brief-keys` leaves the line alone and builds on the package head that carries it. The same
  implementer resumed.
- `l8-delete-replay-files-behind-tag` approved (high); integrated at `d5d3fee7`. Its Warning `build/4` (REQ-CTX-015's
  Retired bullet still says the files stay) is the Prove-phase spec merge's.
- `sw25-quick-tests-ride-along` approved (high); integrated at `6838d2b4`.
- Integration batch 1 (`6838d2b4`: four units): the full gate green — build, lint, typecheck, 10,010 tests (12
  skipped), knip, the leak gate and the dogfood check — by a test-runner in a detached gate worktree; pushed to #63 for
  CI. The runner first wrapped each gate in a `timeout` command, which this machine lacks, then ran each once plainly:
  the habit SW-15's shell rules now forbid.
- `sw15-agent-shell-discipline` approved (high); integrated at `1013ca9c`. `sw15-quick-gate-once` approved (high, no
  findings); integrated at `5918846a`. Plan file 2's census amendment integrated at `57bb664d`.
- Sign-off, before 11:53Z, `2026-09-30_optimization-sweep/review/13` (decision needed; the test-runner writes its green
  report through its shell because it holds no edit tool, while the shared Shell paragraph forbids "a redirect into a
  temp file"): the ban covers gate commands; the test-runner's one report write is the stated exception, worded in its
  own green-verdict bullet, and the shared Shell paragraph stays byte-identical in the four bodies. A fixer applies it
  in lane A.
- `qa-harness-accepted-unwalked`: round 1 approved (high) with one Warning (`review/6`: the reopen reason survived a
  later walk); the fixer closed it and two Minors (`review/7`, `review/8`) in `978b7e81`; the re-review approved
  (high) with each id fixed. Integrated at `985ff429` and `c8651abf`. The re-review's report spelled its closures block
  with the dispatch's wrong keys (the digest had the right ones), so the three rows were moved by manual close with the
  re-review's rationale.
- `review/13` fixed in `f9230841` (lane A), checked by the orchestrator against the sign-off.
- Between 11:53Z and 12:06Z, lane order changes (no contract moves; each unit finds its text, not the cell's line numbers): the units
  that need the CLI token (`work-cli-call-form`, `sw26-cli-call-form`) move to the end of lanes W and C1, so
  `work-gates-once` and `sw24-debug-reproduce-in-process` start now; `sw01-generated-lint-header` builds in its own
  worktree (`p17s2-e1b`) beside the token's review, touching different symbols; `sw04-python-gate-runner` starts before
  `sw26-engine-cli-call-form`, adding its panel line without touching the hint strings the later unit rewrites.
- `sw26-cli-token`'s security lens (posted, 1 Warning `review/15`, security-relevant): no shell-injection path — names
  and versions cross an ASCII allowlist, the version is the installed package's own; the Warning is the fork-name
  wiring gap already filed as `build/20` and routed to `sw26-engine-cli-call-form`, where both close.
- Sign-off, 11:53Z, `2026-09-30_optimization-sweep/review/16` (decision needed, security-relevant; the Reading-the-change
  section forbids git options that write a file but not options that run a configured external program — `-c`,
  `--ext-diff`, `--textconv`, a pager — which REQ-CTX-017 denies; on a client with a declared guard gap the prose is the
  only line): add "or runs a configured external program" to the forbidden-options clause in all five bodies and pin
  the phrase in the verdict-returns test; lane V's new case quotes the amended text.
- Sign-off, 11:53Z, `2026-09-30_optimization-sweep/review/17` (decision needed; the spec-author's appended exit returns
  `BLOCKED_DEPENDENCY` whenever a brief carries neither a range nor hunks, which every greenfield, architect and docs
  spawn does): the spec-author's variant reads history with read-only git when its brief names a range and otherwise
  works from its mode's inputs; the blocking exit stays for the four verdict roles only, whose brief shape REQ-CTX-017
  defines.
- CI on #63 at `6838d2b4` (integration batch 1): `all-ci-checks` and `all-pr-checks` pass; the three check legs pass
  (floor 5m18s, current 3m9s, Windows 12m48s).
- `sw26-cli-token` approved (medium: the reviewer's own basis, no full suite in the lane; the security lens posted only
  the routed wiring gap); integrated at `d4d4501b` with its generated files regenerated. The lanes that wait for the
  token (`work-cli-call-form`, `sw26-cli-call-form`, `sw26-engine-cli-call-form`) now build on a head that carries it.
- `work-make-room` approved (high): the reviewer traced every sentence removed above the re-attach cut (35 rows) to a
  repeat in the body, a move below the cut, or an agent body every client emits; integrated at `52ef52f6`. The pick
  met the first hand-written conflict: two adjacent `evals/SET-v7.md` rows, each changed on one side (the st-work row by
  this unit, the st-quick row by `sw25-quick-tests-ride-along`); the orchestrator kept each side's changed row, and
  `test/evals` passed on the result (1,439 tests).
- Between 11:58Z and 12:14Z (the make-room pick's and sw27's commit times): `sw27-ignore-review-gate-state` (lane E1, reset to `52ef52f6`) and `sw07-card-on-resume-and-closed` (new
  worktree `p17s2-e1c`) dispatched beside `sw01-generated-lint-header` (`p17s2-e1b`); `sw30-researcher-brief-keys`
  follows `sw24` in lane C1.
- `sw20-email-rule` (file 3): round 1 asked for changes (three Warnings: an address in a file name echoed into output,
  hunk fusion under a user's `diff.interHunkContext`, CONTRIBUTING's three families); the fixer's `a410671d` closed
  them; the re-review approved (medium, reading only). Integrated after the replay deletion at `8f548866` and
  `77490ca1`; the leak gate passes on the integrated head.
- `work-gates-once` approved (high); integrated at `b18a878b`. Lane A (`sw05-verdict-roles-read-git` with its round-1
  fixes and the test-runner's redirect wording) integrated at `beb05f06`, `f43845db` and `c8ee6276`. Every lane-W pick
  meets the same `evals/SET-v7.md` shape (the st-work row changed on the lane, the st-quick row on the package branch);
  the integration step now resolves such blocks row by row against the pick's base, and refuses when both sides
  changed one row.
- Sign-off, after 12:06Z, `2026-09-30_optimization-sweep/review/35` (decision needed; `/st-debug`'s marker check
  `git grep -n -F '[STAMITY-DEBUG]'` also matches the emitted command files, which name the tag, so the count never
  reaches 0 and the start rule would strip the command's own file): the check excludes the directories this setup
  writes (`.stamity`, `.claude`, `.apm`, `.cursor`, `.agents`, `.codex`, `.github`) through `git grep` exclude
  pathspecs; a probe is never written there.
- Sign-off, after 12:06Z, `2026-09-30_optimization-sweep/review/36` (decision needed; the in-process condition drops two of
  REQ-FLOW-009's conditions): the spec wins — the in-process route needs the exact input, the expected output AND the
  actual output, and a runnable test gate (neither `unknown` nor `not-runnable`); otherwise the user route.
- The fixer closed `review/36`, `/37`, `/38` and `/42` in `a616f013` and returned `BLOCKED_DEPENDENCY` on `review/35`:
  the exclusion list names client directories in shipped content, which the content invariant on vendor and client
  names refuses; and even excluded, this repository holds the tag in its own tests and plans (`review/56`).
- Re-sign-off, before 12:49Z, `review/35` and `review/56` (both decision needed): the exclusion list is withdrawn. Probes carry
  the run id — `[STAMITY-DEBUG <run-id>]` — and the marker check searches for a real run id only,
  `git grep -n -E '\[STAMITY-DEBUG [0-9]{4}-[0-9]{2}-[0-9]{2}_debug-[^]]*\]'` (exit 1 means zero hits). The command
  and every document name the format with the `<run-id>` placeholder, never a literal instance, so no document
  matches, in a user's repository or in this one; no client name enters shipped content. The start rule strips only
  hits whose run id has neither an in-progress record nor a capture-later agreement.
- Integration batch 2 (`1951de2b`, 21 units): the full gate RED — 2 test files failed of 249. (a) A regression from
  `sw20-email-rule`: `test/ci/pluginRuntime.test.ts:483` runs the leak gate over the packed plugin runtime, vendored
  `node_modules/` included, and the new email rule finds 50 addresses in third-party package metadata. (b) The second
  file was cut from the runner's output; a diagnostic run names it. The runner also reported build, lint, typecheck,
  knip, the leak gate and check as `unknown`: the client's shell tool shows an exit status only for a failing command,
  and the new test-runner rule read a missing status as `unknown`, so no gate could ever read `pass` on that client.
- Sign-off, before 12:49Z, the test-runner's exit status (a defect in `sw15-agent-shell-discipline`, found at integration):
  the shared Shell paragraph and the test-runner body gain a calibration — before the first gate, run `false` once;
  if the tool shows that failure's status, a later result that shows none exited `0`; otherwise a status the tool did
  not show stays `unknown`, never a pass. Each gate still runs once and unwrapped; the calibration is not a gate. A
  client whose tool shows no status even for `false` keeps `unknown` (honest; named as a residual for session 3's QA).
- Sign-off, before 12:49Z, the email rule and vendored files: the email rule skips `node_modules/` (third-party package
  metadata carries author addresses by design); every other rule keeps scanning vendored trees.
- Sign-off, before 12:49Z, `review/59` (decision needed; `/st-spec`'s small-app text reads two ways when the request names
  the app): the whole app is the scope question's declared default, as REQ-FLOW-012 says — one question, numbered
  options, the whole app first; it is not a scope named without a question.
- Sign-off, before 12:49Z, `review/61` (decision needed; the closed card's window keys on the run id's date, the day a run
  opened, while three texts promise "closed in the last two days"): the rule stays as REQ-CTX-013 words it — the
  newest record dated within the last two days — and the three texts (the session-start header, `ledger.ts`'s status
  help, `docs/getting-started.md`) adopt SECURITY.md's "dated within". A file's modified time is not a close date: a
  fresh clone stamps every record with the clone's time.
- Sign-off, before 12:49Z, `review/66` (decision needed; a worktree copy row on an ignored parent such as `.stamity` walks
  past the by-name refusal and carries the review-gate files): a copy walk skips the three review-gate names and paths
  under the lock directory; a symlinked parent shares state live, which the lane cannot split, and the docs say so
  instead of claiming the state never travels.
- Sign-off, before 12:49Z, `review/67` (decision needed; sync appends to the operator's `.gitignore` without saying so):
  `ensureGitignoreEntry` returns the entries it added (callers that ignore the value are unaffected), and sync's
  report and its JSON name them.
- `build/54` closed rejected: the reviewer judged a `skip` row naming the review-gate state harmless — it only carves
  the state out of a parent copy walk.
- The diagnostic full-suite run (JSON reporter) named batch 2's second red file: `test/ci/forkIdentity.test.ts:233`,
  "a canonical spelling count changed" — the CLI-token unit's test cases spelled the package name nine more times
  (`prove/3`, Critical). Fixed in `e4189d67` (the cases derive the name from the identity helper; the count is back to
  its pin with no exception added), checked by the orchestrator, integrated at `93913829`.
- `prove/1` fixed in `673b314c` (the email rule's vendored-tree skip; the security lens re-reviewed it, fixed);
  integrated at `c9fcc0c5`. `prove/2` fixed in `58f463c3` (the calibration sentence, byte-identical in the four Shell
  paragraphs; re-review fixed, high); integrated at `98759e0d`.
- Lane C1 (`sw24-debug-reproduce-in-process` and its two fix commits, `sw30-researcher-brief-keys`): the debug unit's
  round 1 asked for changes; the re-review closed all six rows (medium). Integrated at `449cf7b0`, `60d9e96b`,
  `0ed2b1cb` and `b2896b34`. `sw04-check-names-unrun-gates` approved (medium); integrated at `6bdc9ccf`.
  `sw01-generated-lint-header` approved (high); integrated at `1dc2dfd6`. `sw28-spec-small-app-scope` with its fix
  (round 2 fixed, high) integrated at `3709c963` and the commit before it; its pick met two dated `SET-v7.md`
  paragraphs appended at one place, kept both in order.
- Before 12:49Z: file 3's `sw06-records-only-ci-lane`, `sw19-eval-cost-in-summary` and `sw31-ask-sized-to-question`
  dispatched (their files are disjoint from every open file-2 lane), with `sw26-cli-call-form` in lane C1.
- Lane W's `work-qa-states` (two fixer rounds; round 3 fixed `review/83`, high) and `work-asks-once` (medium)
  integrated at `0ab2a9a2`, `ba249b93`, `2d111b4f` and `e5395ee6`. `prove/4` (knip: an unused exported type from
  `sw04-check-names-unrun-gates`) fixed in `bfe22e02` and integrated at `b87a94e4`.
- Integration batch 3 (`3709c963`): the calibration read build, lint, typecheck, the leak gate and check as passes;
  knip failed on `prove/4` (fixed since); the suite failed only on three `afterAll` cleanup timeouts under the
  machine's load (`test/ci/apmDownstream.test.ts:11`, `test/upstream/lane.test.ts:752`,
  `test/upstream/workflowRecovery.test.ts:38`) — the learning `full-suite-cleanup-hooks-time-out-under-concurrent-load`,
  which file 3's `sw12-flake-unit` addresses; no assertion failed (10,162 passed).
- Sign-off, 12:51Z, `review/90` (decision needed; the eval summary's `listCostUsd.total` reads as complete while
  attempts without usage are left out): the total stays the sum over reported attempts, `listCostUsd` gains
  `notReported`, and EVIDENCE-STORAGE.md says a non-zero count makes the total a lower bound.
- Sign-off, 12:51Z, `build/79` and `build/80` (`sw26-cli-call-form` returned `BLOCKED_DEPENDENCY`: the token's first
  use in a corpus body breaks three plugin tests that stage the real corpus without a CLI identity): the unit takes
  `test/ci/pluginModules.test.ts`, `test/ci/pluginPackages.cursor.test.ts` and `test/ci/pluginPackages.copilot.test.ts`
  (pass the build's CLI identity; the carried-skill equality accepts a moved line holding the pinned call), after
  carrying its uncommitted work onto the package head as a patch (never `git stash`).
- Integrated since 12:51Z: `sw19-eval-cost-in-summary` with its fix (`review/90` checked by the orchestrator) at
  `95162196` and `4d680dcd`; `sw31-ask-sized-to-question` (round 2 approve, high) at `6a5c4307` and `e1deea73`;
  lane E1c, `sw07-card-on-resume-and-closed` and `sw07-card-debug-rounds` with the card fix (round 2 approve,
  medium; `review/61`, `build/68` and `review/62` fixed), at `9cabbca7`, `d0c60854` and `8e0d08e0`.
- `sw26-engine-cli-call-form` (lane E1, `75e18e5e`) approved in round 1 (medium); its closures fixed `build/20` and
  `review/15`. `sw06-records-only-ci-lane` (`79525a08`) approved in round 1 (high); its reviewer asks for a
  one-clause MODIFIED delta at the spec merge: the records-only exception to "required through `all-ci-checks`"
  (`build/82`).
- Sign-off, 13:05Z, `review/94` (security Warning, decision needed: a fork with no npm channel now emits
  `npx -y <its package>@<version>` for a name nobody publishes, so a squatted scope would run without a prompt):
  fail closed. A package with no npm channel — its running manifest is `private: true` and carries no
  `publishConfig.registry`, the registry-less fork of `docs/enterprise-forks.md` — renders the pinned call as
  `npx --no <name>@<version> <verb>`, which runs a copy already installed in the project and never fetches one. A
  package with a channel (the canonical build, a fork made with `--registry`) keeps `npx -y`. The decision is read
  once, off the same manifest read as the name; init, sync, the CLI remedies and the plugin build carry it; the
  pinned-call kernel renders it; the fork guide says what the no-channel form does. The maintainer can reverse it at
  the QA checkpoint.
- Confirmed, 13:05Z: the `sw27` fixer's write to `src/cli/commands/sync/report.ts`, outside the unit's `files` cell. The
  `review/67` sign-off names sync's report, and no unit of files 2 or 3 lists the file, so it has no other writer.
- `sw26-cli-call-form` (lane C1, `51528b60`) approved in round 1 (medium) with two Warnings on its own new test
  (`review/103`, `review/104`). `sw27-ignore-review-gate-state` round 2 approved (medium; `review/66`, `review/67`,
  `review/69` fixed); the re-review's two notes are filed as Minors `review/100` and `review/101`.
  `sw06-records-only-ci-lane` integrated at `428e2ee1`.
- Sign-off, 13:13Z, `review/102` (security, decision needed: the shared sentence's local form `npx stamity <verb>` falls
  through to the unscoped registry name `stamity` when no copy is installed, and npm installs it without a prompt on a
  non-TTY shell). A registry read at 13:12Z (`npm view stamity`: E404) shows the unscoped name unpublished and open
  to anyone, which the lens's own condition grades Critical, so the fix blocks the merge. The local form becomes
  `npx --no stamity <verb>`: npm runs an installed copy (this repository's own bin, the project's
  `node_modules/.bin`, a global one) and never downloads one; where it refuses, the call runs as
  `${STAMITY:CLI} <verb>`. The "where the project's `package.json` lists this package" condition goes, so an agent
  needs no judgment to choose. The sentence stays one shared constant, byte-identical in every body. For the close: the
  maintainer may hold the unscoped name on npm as a placeholder; a publish is the maintainer's call, not this run's.
- Sign-off, 13:13Z, `build/89` and `build/90` (`sw12-flake-unit`: `CONTRIBUTING.md` and `GOVERNANCE.md` still describe a
  three-leg check matrix): the unit's fixer takes both lines, stated as the four legs with Windows in two shards and the
  dogfood check and leak gate on the first shard only. `build/93` (the unit is 12 files and about 1,100 lines, over
  the ceiling) is accepted: the plan cell lists the 12 files, and a unit is not split mid-build.
- `l2-retire-review-197` (`f2b9dabc`), checked by the orchestrator at 13:15Z: the diff removes exactly the one inbox row
  and adds exactly the cell's `retired` value, every other key of the ledger row byte-identical; integrated at
  `32ceeeec`.
- `sw26-cli-call-form` round 2: the fixer (`1fea2e3c`) moved the shared sentence to `npx --no stamity <verb>` with
  the pinned fallback and pinned the Run cells, the fallback lines and the `@latest` check; the re-review approved
  (high; `review/103`–`review/105` fixed). The security re-check of `review/102` is out.
- `sw26-engine-cli-call-form` fix round 1 (`5a639454`): a package with no npm channel renders `npx --no` everywhere
  (`review/94`, `review/95`, `review/92` claimed fixed); the fixer proved the npm behaviour on npm 10.9.8 (a missing
  package is refused with no download; an installed copy runs offline). A security re-check and a re-review are out.
  The lane's one red test (a fork-identity census count) is a stale lane base: the package head runs that file green.
- `sw12-flake-unit` round 1 asked for changes: the re-run rule matched "timed out" anywhere in a message
  (`review/106`); its fixer also takes `build/89` and `build/90`.
- The `sw14` research (vendor pages read 13:27Z) and the live check feed the unit's cell: Claude's dated claims all verify
  (its date moves); Copilot, Codex and Cursor each keep theirs (a changed or unverified claim); the Codex effort
  scale's change reaches `src/roster/modelLadder.ts`, outside the cell, and becomes a follow-up; the Copilot
  `reasoning-effort` line is refuted as worded (the key dates from 1.0.66). The spec-author amends the cell.
- `review/102` closed fixed by the security re-check (13:30Z; no new finding; one residual below the bar: with no
  installed copy npm still reads the unscoped name's manifest once before the `--no` refusal, and runs nothing).
  Lane C1's `sw26-cli-call-form` with its fix integrated at `359b1b10` and `16555b1f`; on the package head its own
  tests, the three plugin suites, the fork-identity pin and `test/evals` pass (1,397 tests). `work-cli-call-form`
  dispatched in lane W on `16555b1f`, taking the sentence from the test constant while its cell is amended.
- `sw12-flake-unit` fix round 1 (`9947440f`): the re-run needs a message that starts with vitest's own timeout text
  and an error that is not an `AssertionError`; the two docs name the four legs. Re-review out.
- `sw12-flake-unit` round 2 approved (medium; `review/106`–`review/108`, `build/89`, `build/90` fixed); integrated at
  `87349cd5` and `9c70c086`; its suites and the docs pages pass on the package head (339 tests).
- `sw26-engine-cli-call-form` round 2: the re-review approved (medium; `review/92` fixed) and the security re-check
  closed `review/94` and `review/95` fixed, with one new Warning on a line the unit did not write (`review/109`).
- Sign-off, 13:34Z, `review/109` (security, decision needed: `sync --help`'s update line prints an unpinned
  `npx <name>@latest sync` with no channel check, so a registry-less fork's line points at an unheld public name):
  the line follows the update notice's own private-package rule. A package with no npm channel gets an update line
  that names no registry fetch (`npx --no <name> sync` after the newer release is installed into the project); a
  package with a channel keeps today's line. The unit's round-2 fixer takes it, with a test for both shapes.
- `sw05-read-only-git-grants` built (`b329d4ba`, lane E1g on `b50f3371`; guard 20,711 B / 511 lines against
  24,576 / 600); its three Minors are `build/99`–`build/101`. Review and the security lens next.
- Lane E1 integrated at 13:39Z: `9f04e56d` (sw27), `e939b28f` (sw26-engine), `2252003c` (the sw27 fix) and `b28d6a6b` (the
  review/94 fix). The sw26-engine pick met two add/add conflicts against units integrated after the lane's base (an
  import beside the lint-header unit's import in `src/hooks/portableRunner.ts`; two new describe blocks at the end of
  `test/cli/commands/initPanel.test.ts`, beside the Python gate-runner unit's); resolved by script as a union, both
  sides kept in order, the first block closed before the second; generated files regenerated. Typecheck passes;
  590 of 592 targeted tests pass. The two red cases are `prove/5` (Critical): the fork test refuses any
  `npx --no` in emitted bodies, while the integrated shared sentence carries the local `npx --no stamity`; the
  unit's fixer takes it in round 2 with `review/109`, in lane E1 reset to the package head.
- `work-cli-call-form` built (`2e00bdc2`, lane W on `16555b1f`; the Review loop ends at 17,013 of 18,000 and the body
  is 478 of 500 lines, so about 987 characters remain above the cut for file 3's three st-work units). Its `M-1`
  (decision needed) is signed off: the by-hand fallback points at the row grammar under Proof block, because
  `test/records/ledgers.test.ts` does not exist in the repositories the body ships to. Review out, with the git-grants
  unit's review and security lens.
- `work-cli-call-form` approved in round 1 (high, no findings) and integrated at `204fc216`; st-work's tests, the
  sentence pin and `test/evals` pass on the package head (1,390 tests). The `sw26-engine` round-2 fix (`4e32987e`)
  was closed by the security re-check (`review/109`, `prove/5` fixed) and integrated at `cc283e66`.
- `sw05-read-only-git-grants` round 1: the reviewer asked for changes (high) and the security lens posted the same
  gap: `git log --show-signature` runs the configured gpg program and `git <sub> --help` runs `man`, both options on
  the command line the guard can see (`review/110`, `review/113`); Minors `review/111`, `review/112`, `review/114`.
- Sign-off, 13:48Z, `review/110` and `review/113`: the guard refuses `--show-signature` and `--help` as it refuses
  `--ext-diff`; the fixer first measures on this machine's git whether an abbreviated long option (`--show-sig`,
  `--ext`, `--textc`) is accepted, and if it is, the guard refuses any option token that is a prefix of a refused
  option — failing closed. `review/114` (an implicit `--no-index` diff of paths outside the repository) grants
  nothing the `read` category does not already give and stays a Minor.
- Sign-off, 13:48Z, the plan amendment's open question on `sw21` (which row an `already-filed` line names when several
  rows share one evidence string): one-to-one in row order — the k-th incoming finding names the k-th existing row with
  that evidence, and a finding with no row left is appended; re-piping a block files nothing and names each original
  row once. The amendment's extra `sw14` claim sites (a grep of the same stale claims) are confirmed.
- Integration batch 4 (`b28d6a6b`, test-runner r1): build, lint, typecheck, knip, the leak gate and check pass; the
  suite fails five cases in two files and no timeout: `prove/5` (fixed since, in `cc283e66`) and `prove/6`
  (Critical): three refusal cases in `test/merge/writeEscape.test.ts` now find a `.gitignore` beside the refused file.
  No afterAll cleanup timed out under the machine's load (the sw12 unit's lazy cleanup, integrated).
- Sign-off, 13:50Z, `prove/6`: the ordering stays — a live sync writes the ignore rules before the first emitted file,
  on purpose (the lane can refuse, and a refusal after the emitted files would leave a half-applied run). The three
  listings assert what they exist for: no backup was made, so each compares the listing without `.gitignore`, under a
  dated TEST CHANGE naming REQ-FLOW-016. The `sw27` fixer takes it in round 2.
- The plan amendment (spec-author, `a096408e`) integrated at `d2289c96`: file 2 carries the reviewed sentence and the
  no-channel form; file 3's sw13, sw21, sw11, sw10, sw18, sw17 and sw14 cells are amended from the census and the
  research. Both files pass the plan-coverage check (exit 0, one advisory each), the leak gate and the records tests.
- Sign-off, 13:52Z, `sw08-fresh-re-reviewer` (returned BLOCKED_DEPENDENCY: its test criteria need
  `test/corpus/commands/work.test.ts`, which its cell does not list): the unit's files gain that test and the two
  goldens test files for their dated notes; `sw13` owns the test file after it in lane W, so there is one writer at a
  time. The same implementer resumed.
- The learnings writer's one commit (`fade9c85`, lane x20 on `b28d6a6b`), built by 13:53Z: four learnings retired (the two
  that restate a test, the full-suite cleanup-timeout learning — its own condition, a lazy cleanup on the three hooks,
  is met by `sw12-flake-unit` — and the Codex hooks learning, whose claims failed on 0.155.1); two captured through
  `learn capture` (the Codex learning's replacement, naming what stays unmeasured, and the kickoff's
  `a-plan-naming-a-new-spec-commits-its-skeleton`); twelve re-dated after a re-check against each file's own
  `validatedAgainst`:
  - learning corpus-edits-ship-with-a-dogfood-sync re-verified via `npm run build && node dist/cli.js sync`; reviewBy -> 2026-12-10
  - learning leak-gate-scans-stamity-state-files re-verified via `npx vitest run test/ci/leakGate.test.ts test/docsPages.test.ts`; reviewBy -> 2026-12-20
  - learning surface-pins-are-literals-that-drift re-verified via `npx vitest run test/cli/surface.e2e.test.ts test/docsPages.test.ts`; reviewBy -> 2026-12-30
  - learning the-local-test-gate-is-weaker-than-ci re-verified via a read of package.json:57, the vitest.config.ts thresholds and ci.yml's coverage and Windows legs; reviewBy -> 2027-01-09
  - learning release-close-record-re-sync re-verified via `grep -n -i "record currency" .github/release-controls-checklist.md`; reviewBy -> 2027-01-19
  - learning git-stash-is-shared-across-worktrees re-verified via `git rev-parse --path-format=absolute --git-path refs/stash` and `git stash list` from two worktrees; reviewBy -> 2027-02-08
  - learning claude-code-refuses-sub-agent-report-file-names re-verified via `grep -a` of the Claude Code 2.1.285 binary; reviewBy -> 2027-02-18
  - learning a-full-eval-export-needs-its-hygiene-exception re-verified via `npx vitest run test/ci/repoHygiene.test.ts`; reviewBy -> 2027-02-28
  - learning an-account-switch-mid-run-ends-an-eval-run re-verified via a read of evals/runs/2026-09-11-run-24/PROTOCOL.md:200-213; reviewBy -> 2027-03-10
  - learning vitest-update-flag-takes-an-optional-value re-verified via `npx vitest --help` and `npx vitest list -u <file> --filesOnly --json`; reviewBy -> 2027-03-30
  - learning corpus-line-shifts-move-eval-case-source-ranges re-verified via `npx vitest run test/evals/locators.test.ts`; reviewBy -> 2027-04-09
  - learning typed-unicode-escapes-land-as-raw-code-points re-verified via `od -c` of an escape typed through Bash and Write on 2.1.285; reviewBy -> 2027-04-19
- `prove/6` fixed by the `sw27` fixer's round 2 (`7be2e651`, integrated at `0e44b30b`): the three listings compare the
  root without `.gitignore`; a search of every `readdir(` after a live sync found no other site; the file passes on the
  package head (54 tests); closed by the orchestrator's check at 13:56Z.
- `sw05-read-only-git-grants` fix round 1: the unit was carried onto `cc283e66` (`cb02846e`; only generated files
  conflicted, regenerated) and fixed in `247d3d37`: `--show-signature` and `--help` are refused; on git 2.52.0 the
  five subcommands reject every abbreviation of a refused option, so no prefix rule was added. The guard is 512 lines
  and 20,833 bytes. Re-review and security re-check out.
- The learnings writer's commit approved (medium; Minors `review/115`, `review/116`) and integrated at `cb215fb3` (14:00Z):
  `check` reads 14 learnings, all valid, byte-identical to `docs/troubleshooting.md:34`; docs pages, learnings and
  records tests pass (214). `review/115` (one learning re-dated from a read of its config, its own full-suite command
  barred in a lane) is accepted: the Prove gate runs `npm test -- --coverage`. `review/116` (the page header names the
  lane's base commit): `sw14`, which edits the same page next, names the integrated commit. The reviewer's note that
  the kickoff's new learning restates a test-enforced rule is answered by the kickoff itself: the maintainer asked for
  that learning by name.
- `sw05-read-only-git-grants` round 2: the re-review approved (high; `review/110`, `review/112` fixed).
- `sw08-fresh-re-reviewer` approved (high; Minor `review/117`) and integrated at `f75de2eb`; st-work's tests and
  `test/evals` pass (1,375). `sw05-read-only-git-grants` closed by the security re-check (`review/113` fixed; no
  other option among the five subcommands starts a configured program) and integrated at `19ef742c` and `2c5a5667`;
  typecheck passes and the guard, adapter, roster, tools, hook-wiring and latency suites pass (973).
- Dispatched at 14:05Z on `2c5a5667`, in parallel and file-disjoint: `sw14-client-currency-sweep` (lane E1; no live client
  run — the Codex facts are measured), `sw11-learning-index-honest` (lane E1c), and lane V's three landings
  (`eval-set-cases-and-moves`, `l1-gap2-digest-security-case`, then file 3's two cases: 110, 111, 113 cases). `sw13`
  builds on sw08's commit in its own lane; the `source:` ranges it shifts under lane V's new cases are reconciled after
  both land.
- `sw13-runs-retire-fixed-inbox-rows` approved in round 1 (high; the reviewer read the range with read-only git, the
  grant `sw05` added). Sign-off, 14:14Z, `review/118` (decision needed: a re-run of `--retired` with the same disposition
  on a later day is reported unchanged and never re-dated): ratified — the retired value records the day the row first
  left the inbox; the row closes rejected. Minors `review/119`–`review/122` stay ledgered; `review/122` (st-quick spells
  its new call `npx --no stamity` with no pinned fallback) joins a Minor-polish pass once `sw21` and `sw29` land.
- `sw13` integrated at `102d3ddf`; runs, records, command-body and eval tests pass on the package head (1,917).
  `sw29-records-via-file-tools` built on sw13 (`a3aefe29`; st-work's Review loop ends at 17,663 of 18,000, the body is
  493 of 500 lines) and `sw11-learning-index-honest` built on `2c5a5667` (`d2dff1fb`; session-start 46,716 B / 1,038
  lines of 49,152 / 1,100): both in review. `sw21` builds on sw13; `sw14` and lane V build on `2c5a5667`.
- Sign-off, 14:20Z, `sw29`'s review W-1 (decision needed: the Frame sentence names the record, the reports and the inbox,
  but not the in-flow `plan.md` that REQ-FLOW-025 also covers): extend the enumeration to name the in-flow plan
  (about 12 characters of the 337 left above the cut); the requirement stays as written. The unit's fixer takes it.
- `sw11-learning-index-honest` approved (high; Minors `review/125`, `review/126`) and integrated at `e0483817`; its
  hook, learnings and card-parity suites pass on the package head (526). `sw29` fix round 1 (`de93893a`): the Frame
  sentence names the in-flow plan; no line moved; 325 characters remain above the cut; a fresh re-review is out.
- Sign-off, 14:24Z, `sw21`'s review W-1 (decision needed: an `already-filed` line prints the incoming finding's severity
  and decision-needed marker under the existing row's id, so a re-pipe with a changed severity or a dropped marker
  misstates the row): the line describes the row that is filed — it prints that row's own severity and marker, read
  from the ledger. The unit's fixer takes it.
- `sw29` round 2 approved (medium; `review/123`, `review/124` fixed); integrated at `0a58100b` and `f6fe113a`.
  `sw21` fix round 1 (`76367f52`): an `already-filed` line prints the matched row's own severity and marker, and a
  match needs the row to belong to this run; a fresh re-review is out.
- `sw14-client-currency-sweep` returned BLOCKED_AMBIGUITY on the cell's no-op allow rows: the cell assumed the engine
  owns rows in `permissions.allow`, but it owns the whole `permissions` key, so keeping the key with an empty list
  breaks the cell's own "a hand-added row survives sync" criterion, and dropping the key changes the settings-ownership
  contract (three more test files, legacy rows left for good, an empty plugin-mode settings file to decide).
  Sign-off, 14:29Z: the allow rows are deferred — the rows are harmless (the client already allows reads and greps inside
  the working directory), a follow-up row at the close names both readings for the maintainer, and REQ-FLOW-025's
  "setup writes no permission allowlist" sentence is recorded as not shipped at the spec merge. The rest of the unit
  (stale lines, Claude's date, the Codex claims on six pages, the page headers) commits as built.
- Lane V built its three landings on `2c5a5667` (`a8d12418` 110 cases, `54aeb920` 111, `45bf55c1` 113; totals derived
  from the files); it carries them onto `f6fe113a` and moves its own new cases' ranges past sw13 and sw29 before review.
- `sw21` round 2 approved (high; `review/127`, `review/128` fixed) and integrated at `c419eab1` and `ee7abdcc`; runs and
  records tests pass (307). This run's own ledger CLI now takes short ids and re-pipes without re-filing.
- `sw14-client-currency-sweep` committed at 14:38Z (`5b44825f`, lane E1 on `2c5a5667`), the allow rows left as at HEAD
  per the sign-off (`build/124`, answered: deferred); in review. `sw10-first-run-output` builds on it in lane E1c.
  Lane V's three landings (carried: `f77c854c`, `450359da`, `b9c3868e`; 113 cases, 339 scenarios) are in review.
- Sign-off, 14:40Z, `sw10-first-run-output` (returned BLOCKED_DEPENDENCY before writing anything): (1) its files gain
  `test/cli/commands/initApply.test.ts`, whose whole-report equality the new report field changes (no unit owns it;
  the census missed the consumer); (2) the panel's `.gitkeep` count comes from a second report field listing the keep
  files the scaffold actually created (REQ-FLOW-022: each printed count equals the files written), not from the created
  directories, which undercounts; (3) the Copilot scan skips the engine-emitted workflow by Copilot's own setup-steps
  path constant, so no file outside the cell changes. The same implementer resumed.
- Lane V round 2 approved (high; `review/129`–`review/132` fixed; the gap-3 inbox row left with its case) and integrated at
  14:48Z as `4ba7dcb1` (110 cases), `e8d618c2` (111), `95d1cbf9` (113) and `d59b7b12` (the fix); `find evals/cases-v6`
  counts 113; eval and records tests pass on the package head (1,424). `sw14` fix round 1 (`278a6bd0`) is in a fresh
  re-review; `sw10` builds on sw14; the `sw18` live check runs alone (no full suite meanwhile).
- Sign-off, 14:49Z, the sw18 live check's W-1 (Codex reads `AGENTS.override.md` instead of `AGENTS.md`): the override is
  engine-owned and generated at sync from the `AGENTS.md` bytes that sync has just written (the operator's text
  included) plus the Codex appendix; `check` reports the override as drift when `AGENTS.md` changed after the last sync;
  an operator's own root `AGENTS.override.md` goes through the usual user-file collision lane (refused without
  `--force`, a backup with it). The unit re-pins the shared-byte pair to its own measurement.
- Integration batch 5 (`d59b7b12`, test-runner r1, 14:57Z): green — build, lint (one pre-existing warning), typecheck,
  the suite (258 files, 10,531 passed, 12 skipped, no timeout under the machine's concurrent load), knip, the leak gate
  and check. `sw14` round 2 approved (high; `review/133`, `review/134`, `review/136`, `review/137` fixed) and integrated
  at `079a8c8b` and `b855876a`; its suites pass on the package head (487).
- `sw10-first-run-output` built (`f33b5573`, on sw14's `5b44825f`; the Codex trusted bytes unmoved — the unedited
  goldens passed after the reshape). Its size (18 files) is accepted as sw12's was: the cell lists the files. Sign-off,
  14:59Z, its M-1 (decision needed: after a live init the panel says `--tools`, while the working route then is the
  config `tools` key): the panel names the route that works after init. In review; `sw18` builds on it in lane E1.
- Pushed `b855876a` to the draft PR at 15:05Z (knip and the leak gate exit 0 first; a fast-forward from `6838d2b4`). CI:
  the APM, plugin, DCO, size and dependency lanes pass, `check (lts, node 24)` and `check (windows-1, node 24)` pass;
  `check (floor, node 22.22.2)` failed on one assertion (`prove/7`, Critical): the partial-staging cleanup test
  lists the shared temp root and saw another worker's staging tree as new — a race between parallel staging suites,
  not a leak; the re-run rule correctly refused to retry an assertion. Sign-off: a test-only fix gives that call a temp
  root of its own; a fixer is on it.
- CI on `b855876a` finished red: besides `prove/7`, `check (windows-2, node 24)` failed one case (`prove/8`,
  Critical): a REQ-FLOW-008 test injects `platform: "linux"` with a PATH built from the host's temp directory, which
  on a Windows runner (`D:\…`) the linux branch splits at the drive colon — a test that cannot hold on a win32 host,
  first seen now because `sw04-check-names-unrun-gates` landed after the last push. `prove/7`'s fix (`8cacafd1`) was
  checked by the orchestrator and integrated at `748d6426` (15:09Z). `prove/8`'s fixer confirms the cause in the resolver
  before changing any test. `sw10` round 1 asked for changes (`review/138`, `review/139`; `build/131` still open at the
  built commit); its fixer is out.
- `prove/8`'s fix (`fc608960`): the cause is confirmed at `src/cli/commands/check.ts:1286-1289` (PATH is split by the
  injected platform, as designed; a real Windows host passes `win32`, splits on `;` and uses PATHEXT); the case now
  seeds its tools in `node_modules/.bin`, which the resolver reads before PATH, and runs on every host. Integrated at
  `08bd8f88`; pushed at 15:12Z (knip and the leak gate exit 0 first) for the Windows leg to prove it.
- CI on `08bd8f88` (15:24Z): every check passes — `check (lts, node 24)`, `check (floor, node 22.22.2)`, `check (windows-1,
  node 24)`, `check (windows-2, node 24)` and `all-ci-checks`; `prove/7` and `prove/8` are closed by it.
- Spec merge pass 1 (spec-author, `dc2d4b97`) integrated at `7a18c4e9`: both plans pass coverage with no advisory
  left (REQ-CTX-017 and REQ-CTX-018 are defined), the scenario count reads 137 as the spec states, records and docs-page
  tests pass (116), the leak gate passes. REQ-FLOW-022, REQ-FLOW-026, REQ-PROVE-003 and REQ-PROVE-005 wait for pass 2.
- `sw10-first-run-output` round 2 approved (high; `review/138`–`review/142` and `build/131` fixed) and integrated at
  `84a87300` and `1f0c0f2f`; typecheck passes and its suites pass on the package head (2,365).
- `sw18-codex-rules-leave-shared-charter` built, uncommitted (BLOCKED_DEPENDENCY on three tests outside its files): the
  shared `AGENTS.md` is byte-identical with and without Codex (golden 5,276 B; a real four-client init 5,379 B, `cmp`
  identical), and `AGENTS.override.md` carries the charter as sync writes it plus the appendix (golden 25,306 B — the
  sha256 of the old with-Codex `AGENTS.md`; a real init 25,409 B). Sign-off, 15:27Z: its files gain
  `test/emit/syncDriftProof.e2e.test.ts`, `test/emit/substitution.test.ts` and `test/pack/projection.test.ts` (pin
  moves to the override, each under a TEST CHANGE), and the three docs lines that say Codex reads `AGENTS.md`
  (`docs/getting-started.md:163`, `docs/customization.md:183`, `README.md:67`) with any docs-page pin on them; the same
  implementer resumed.
- `sw18` committed at 15:32Z (`e03179a9`, on sw10's `f33b5573`; its widened files included): measured
  `shared AGENTS.md 5,379 B with codex = 5,379 B without (cmp identical); AGENTS.override.md 25,409 B`; its suites pass
  (946), the matrix regenerates clean. In review. `sw17-touchpoints-as-shared-skills` dispatched in lane E1c on the
  package head `1f0c0f2f` with sw18's commit carried under it as a base (not integrated with it); its live check runs
  after the build, alone.
- Ledger triage (a read-only analyst, Fable; report `ledger-triage-analyst-r1.md`), 203 open rows: fixed 37 (each with
  HEAD evidence), spec merge 3, polish 55, inbox 12, retire 81, reject 15. Sign-off, 15:39Z: the polish set is cut to the
  items that fix shipped text or behaviour or pin a real gap — two parallel fixers on disjoint files (A: content, evals,
  plans; B: code, strings and eight test additions), clear of sw17's files; the adapter-file items wait for sw17; the
  churn-only items (a describe moved to its own file, a count derived, an export for one import) retire as below the
  floor. The rest closes by the triage plan at the close, each row through the CLI.
- `sw18` round 1 asked for changes (high). Sign-off, 15:40Z, its C-1 (security: the override repeats the operator's
  `AGENTS.md` read with a plain `readFile` and is written through the whole-file lane, so under `skip` a symlinked
  `AGENTS.md` lands its target's bytes in the override, and under the default `supplement` a hard-linked `AGENTS.md` or
  one carrying a block-severity pattern is refused on `AGENTS.md` alone while the override lands with those bytes):
  before the override is built from `AGENTS.md`, the same refusals the managed lane applies hold — a symlink, a shared
  hard link or a block-severity deny hit refuses the override, classified as a collision on `AGENTS.override.md` in the
  plan so `check` and `sync` agree; three tests (a symlink under skip, a hard link under supplement, a deny hit under
  supplement). W-1: the matrix page says an edit to `AGENTS.md` reaches Codex at the next sync only under a
  `supplement` or `skip` import decision. The fix gets a security re-check.
- Sign-off, 15:56Z, `sw17` (returned BLOCKED_DEPENDENCY: the Codex plugin packager would carry the nine touchpoints as
  skills once Codex emits them into `.agents/skills/`): option (b) — the touchpoints stay repository-owned; the Codex
  plugin drops command rows as it drops `AGENTS.override.md` (the reason says they are written into the repository's
  shared `.agents/skills/`), and plugin setup writes them there. The unit's files gain
  `scripts/plugins/clients/codex.mjs`, `test/ci/pluginPackages.codex.test.ts` and `test/cli/commands/plugin.test.ts`
  (the sw18 fixer does not edit them), plus `docs/plugins.md` for the matching sentence. The same implementer resumed.
- `sw18` round 2: the security re-check closed `review/143` fixed (no new finding; the check-then-read window is the
  merge lane's mirror, no wider); the re-review closed `review/144`–`review/146` fixed and asked for changes where the new
  "source refused" class did not reach. Sign-off, 16:05Z: `check` and a forced `sync` name the source's problem and its
  real remedy (repair `AGENTS.md` — a regular file, no flagged text — then sync), never "move it aside" or "re-run with
  --force"; a source-refused run keeps the override's existing ledger row (the file on disk is the engine's last write),
  so after the repair the next sync updates it and a Codex deselection reclaims it. The same fixer, round 2.
- Minor polish A approved (high; all 16 rows fixed, its three departures justified; no eval range moved) and integrated
  at `472c0bb2`. Minor polish B approved (high; all 26 rows fixed; each code fix red at the base) with a security lens
  on the resume-card changes (no finding: no card path prints unscreened text in either twin; run ids admit no control,
  bidi or tag character) and integrated at `ffadc8a2` (16:12Z); typecheck passes and its suites pass on the package head
  (3,385). `sw18` fix round 2 (`b2f094a2`) is in a fresh re-review (round 3).
- `sw17` round 1 approved (medium) with three Warnings. Sign-off, 16:14Z: W-1 — one home for the YAML-injection guard
  `frontmatterScalar` (exported once, imported by the other adapter). W-2 — the Codex capability row states only what
  is measured or cited: the touchpoints carry `allow_implicit_invocation: false`; the live check measured that
  `-work` loads the touchpoint; no claim about a plain ask unless a dated vendor page is cited. W-3 (decision
  needed: the charter, the always-on file every client reads, still says a client with no command surface receives no
  command file and lists the nine as `/st-<id>`): fix the charter now with the smallest wording that makes it true —
  Codex receives the nine as skills under `.agents/skills/`, started as `-<id>`; a client with neither surface still
  asks in plain words — carrying the ripple (the shared-byte figures re-pinned to measurement, goldens regenerated,
  any eval range the charter edit moves). The unit's fixer takes all three.
- `sw18` round 3 approved (high; `review/152`–`review/154` fixed; a kept ledger row never licenses an overwrite or skips
  a refusal a normally written file would not face) and integrated at 16:20Z as `666dd70e`, `d0ee2236` and `cdfaa723`;
  typecheck passes and its suites pass on the package head (1,578). `sw17`'s fixer is on round 1.
- `sw17-touchpoints-as-shared-skills` round 2 approved (medium; `review/155`–`review/159` fixed; the charter now says a
  client that reads `.agents/skills/` instead receives the nine there as skills, started as `$st-<id>` — the product's
  vendor-name rule keeps the client unnamed) and its last Warning (`review/160`, the golden refresh-ledger entries) closed
  by the orchestrator's check; integrated at 16:32Z as `cf64788f`, `ca7210c5`, `ce6aff87` and `cc52e321`. The shared
  `AGENTS.md` is 5,296 B on the golden with and without Codex; the override 25,326 B. Every unit of both plan files is
  built, reviewed and integrated, except the one deferral (`sw14`'s no-op allow rows).
- STATE at 16:44Z (session paused on a usage limit). Package head `6754ad25` (not pushed; origin has `08bd8f88`, CI green
  there). Every unit of both plans is built, reviewed and integrated, except the deferred no-op allow rows (`build/124`).
  Spec merge passes 1–3 integrated. Final gate with coverage on `6754ad25`: RED — one case, `prove/9`
  (`test/worktree/engine.test.ts:1098`, the concurrent name lock), not yet diagnosed; coverage floors not read (output
  cut). The whole-branch deep review was still running (report: `reports/branch-reviewer-r1.md`). Left, in order:
  diagnose and fix `prove/9` (re-run that file alone first: flake or regression); read the branch review and fix its
  findings; re-run the final gate with coverage and read the floors; push; CI with the Windows legs; the QA checkpoint
  (one question: unproven rows plus the fast-forward merge, default no merge); `git push origin <gated head>:main`;
  the close — the ledger close from `reports/ledger-close-overrides.json` over the triage plan, the three sw12 inbox rows
  retired, the private units (p-slim-records, p-one-close, AD row, HANDOFF, banner, the private layer's directive note), the private main
  push (driver and frozen lanes already on private main, unpushed), and the session 3 kickoff (eval set at the release
  run, re-run K3/K4 canaries and the SET-v7 hash pin under the final driver, QA, 1.11.0 notes).
- The whole-branch deep review (Fable) finished after the pause: approve (medium), no Critical, three Warnings to
  settle before the gate re-run — W-1 everyday-flows.md:30-32 (rollback spelled without `-y`, stale citation);
  W-2 (decision needed) the charter's Touchpoints sentence says a `.agents/skills/` reader starts `$st-<id>`, but Cursor
  reads that tree and starts `/st-<id>`; W-3 (security, decision needed) a `--registry` fork keeps `npx -y`, yet npx
  resolves the scope through the consumer's `.npmrc`, not `publishConfig` — without that mapping the pinned call fetches
  the unheld public name; smallest fix: state the `.npmrc` precondition (the identity script may write it), stricter:
  tie `hasNpmChannel` to the mapping. Report: `reports/branch-reviewer-r1.md`.
- Resumed at 18:03Z. `prove/9` diagnosed: the file passes alone 3 of 3; the cause predates the branch — `addWorktree`
  (`src/worktree/git.ts`) retries once after the commondir race, and when the first attempt created the target
  directory before losing, the retry answers "already exists" and refuses, though the directory is the engine's own;
  under full-suite load two concurrent names hit it on macOS. The branch touched only `src/worktree/policy.ts` there.
  Sign-off: fix it here (a known flake in the release gate's path) — the retry removes the directory only when this
  same call created it (absent before the first attempt, a real directory, not a link), and a path that existed before
  the call still refuses; tests with a stub runner for both shapes.
- Sign-offs, 18:03Z, on the whole-branch review: `review/161` — the spec's rollback line takes the pinned form and the
  current citation. `review/162` (decision needed) — the charter's Touchpoints sentence says a client that reads
  `.agents/skills/` receives the nine there as skills and starts one the way it starts a skill (`/st-<id>` or
  `$st-<id>`), true for both clients without naming either; the byte ripple is re-pinned to measurement.
  `review/163` (security, decision needed) — the fork guide states the precondition beside the `--registry` sentence:
  every consumer machine maps `@<scope>` to the fork's registry in its `.npmrc` (as the guide's consume section says),
  and it recommends holding the scope on the public registry so a missing mapping fails with a 404 instead of fetching
  a stranger's package; an engine-side check of the consumer's npm config becomes an inbox follow-up. The security lens
  re-checks the wording.
- `prove/9`'s fixer returned BLOCKED_AMBIGUITY with the cause corrected by reproduction (git 2.52.0, darwin: 20 losses
  in 150 rounds of 8 concurrent `worktree add -b`): a lost commondir race leaves no directory and no admin entry, but
  the BRANCH already created; the same-argv retry then fails "a branch named '<name>' already exists" (status 255), which
  the engine's "already exists" check misreads as a taken path. Sign-off, 18:06Z: option 1, non-destructive — note whether
  the branch existed before the first attempt; after a lost race on `create` or `track`, when the branch exists now and
  did not before, retry once as an attach (`worktree add <path> <branch>`), keeping the branch git just made; a branch
  that existed before the call is not retried as attach and still refuses; the "already exists" check stops reading
  git's branch refusal as a taken path. The retry-argv pin and the comment above the retry change with it.
- `prove/9` fixed (`5aad7a98`, approved medium) and integrated at `1a6435f2`; worktree suites pass (217). The branch
  review's fix (`9b4caedc`: the rollback line, the charter's Touchpoints sentence — "gets them as skills, started as any
  skill (`/st-<id>` or `$st-<id>`)", three lines, +8 bytes, 5,304 / 5,304 / 25,334 — the card-on-resume line, the
  vendor quote) approved (medium) and integrated at 18:20Z; `review/166` rejected (a floor cell names the lowest proven
  version). The security re-check closed `review/163` fixed and posted two sibling sinks. Sign-off, 18:20Z: W-1 — the
  update notice probes the fork's own `publishConfig.registry` (and stays silent when that probe fails), never the
  public registry for a `--registry` fork's scope; W-2 — the guide's marketplace sentence states the same `.npmrc`
  precondition. A fixer takes both on the package head; the security lens re-checks.
- Final gate with coverage (test-runner r2, 18:26Z) on `c35a6f23`: GREEN — build, lint (one pre-existing warning), typecheck,
  `npm run test -- --coverage` (260 files, 10,619 passed, 12 skipped; no file below its floor, read from
  `coverage/coverage-summary.json`; global lines 97.64), knip, the leak gate and check. The branch fix's round 2
  (`165d7eff`, the notice probes the fork's own registry) is in the security re-check.

- inbox retired: test/upstream/workflowRecovery.test.ts:38 (the afterAll cleanup timeouts; 2026-09-17_plugin-lifecycle/prove/134) — fixed in 2026-09-30_optimization-sweep
- inbox retired: test/ci/pluginLifecycle.test.ts:157 (2026-09-17_plugin-lifecycle/prove/218) — fixed in 2026-09-30_optimization-sweep
- inbox retired: test/ci/apmDownstream.test.ts:11 (2026-09-24_enterprise-release/review/148) — fixed in 2026-09-30_optimization-sweep
- The ledger closed at 18:35Z through the CLI, from the triage plan and the orchestrator's overrides
  (`reports/ledger-close-overrides.json`, `reports/ledger-close-extra.json`): 0 open; 184 fixed, 99 deferred with a dated
  `retired` field, 15 deferred with an inbox row, 21 rejected. The inbox gains those 15 rows in a dated section; the three
  rows `sw12-flake-unit` settled left it, their older ledger rows retired with dated fields. The records test's Ref check
  passes once this run's ledger is committed (it reads tracked ledgers). `prove-final` r2 green on `c35a6f23`; the head
  `5f8ad2f6` is pushed and in CI; the QA table is being built.
- CI on `5f8ad2f6` (18:43Z), the gated head: every check passes — the three APM route lanes, the plugin route, `check (lts,
  node 24)`, `check (floor, node 22.22.2)`, `check (windows-1, node 24)`, `check (windows-2, node 24)` and
  `all-ci-checks`. `5f8ad2f6` is the head the fast-forward merge would take.
- QA checkpoint built at 19:28Z (`reports/qa-checkpoint-r1.md`, st-qa by name): 90 rows derived, 66 auto-proven from the
  gates' test assertions, 24 left for a person (3 H: P01 `npx --no stamity` with nothing installed runs nothing; P02 a
  registry-less fork's plugin build pins `npx --no`; P03 a 1.10.0 Codex upgrade keeps the operator's AGENTS.md line and
  moves the rules to the override). CI green on `5f8ad2f6` is recorded as the final tree's gate of record (REQ-FLOW-015),
  beside the local coverage gate at `c35a6f23`. Two test-only additions are being built to auto-prove P02 and P03, so
  the one close question carries only what a person must decide.
- qa-proofs implementer (lane `p17s2-fix`, branch `p17s2-qa-proofs`), 19:36Z: P02 proven as `dacd7d7f`
  (`test/ci/pluginPackages.registryless.test.ts` runs the plugin generator over a private manifest with no
  `publishConfig`: every pinned call reads `npx --no`, none `npx -y`, per-file call counts match the canonical build;
  red first three ways). P03 returned `BLOCKED_DEPENDENCY` with `prove/10` (decision needed): on a real 1.10.0
  Codex-only setup (a whole-file `AGENTS.md`, no markers, a `codex:infra` ledger hash, no import decision) plus an
  appended operator line, `sync -y` regenerates `AGENTS.md` whole, keeps the old file at `AGENTS.md.bak` and prints
  the drift warning naming both; the appendix moves to `AGENTS.override.md`; `check` is clean. Sign-off, 19:38Z:
  accepted, the standing lane. It is the drifted-overwrite lane any 1.10.0 re-sync takes after a hand edit
  (`src/merge/safeWrite.ts:1117-1130` at `v1.10.0`), because a Codex-only `AGENTS.md` is a whole file the engine owns
  in both versions, and the spec promises no keep for that case ("With no import decision … nothing is read from
  disk", `docs/specs/prove-behavior-and-value.md:88-89`). The line is not lost without a word: the warning names the
  file and the `.bak`. P03's Expected was narrower than the product and is amended to this lane; the P03 test pins
  it. The 1.11.0 notes say it for Codex-only setups.
- 19:43Z: the private unit `p-slim-records` dispatched in its own lane of the private layer (implementer, Opus 5.5); it
  depends on nothing in the close question, and `p-one-close` writes after it.
- 19:40Z: Dependabot #64 (six development bumps) read for the close. It is red on `main`'s tree for two reasons: a
  replay test this branch deletes (the floor and Windows legs), and oxlint 1.85.0 turning on
  `unicorn/consistent-function-scoping`, which reports 178 hits on this branch's tree (172 in tests, 3 in `src/`,
  3 in `scripts/`; measured with `npx -y oxlint@1.85.0 -c .oxlintrc.json` in the main checkout).
- 19:44Z: the qa-proofs implementer returned DONE (`reports/qa-proofs-implementer-r1.md`): P03 as `66e375be`, two cases
  in `test/emit/sharedCharterIdentity.test.ts` (Codex-only, one ledger owner row; four clients, four rows; 1.10.0 wrote
  the same `AGENTS.md` bytes both times), red first by disabling the drift backup. Two Minors ledgered (`prove/11` the
  clean check is proven through the drift gate function, not the CLI; `prove/12` the seed uses HEAD's bytes in 1.10.0's
  shape). `prove/10` closed rejected on the 19:38Z sign-off. Integrated as `6c28d8e3` and `f43f66ce` (clean picks; the
  goldens, locators and `check` exit 0; knip and the leak gate exit 0), pushed at 19:46Z; the tree equals the lane's.
  In flight: the Fable review of both tests, `prove-final` r3 (the full gate with coverage on `f43f66ce`), and CI.
- 19:52Z: `prove-final` r3 green on `f43f66ce` in the detached gate worktree (`reports/prove-final-test-runner-r3.md`):
  build, lint (the one known warning), typecheck, `npm run test -- --coverage` (261 files, 10,633 passed, 12 skipped;
  96.71 / 90.3 / 98.98 / 97.65; every floor met), knip, the leak gate and `check`. This is the gate of record for the
  final tree (REQ-FLOW-015). The private unit `p-slim-records` landed as `cb5b559b`, fast-forwarded into the private
  layer's main (its hygiene check and the byte-for-byte proof pass); its findings are settled in the private close.
- 19:56Z: the qa-proofs review (Fable 5.1, `reports/qa-proofs-reviewer-r1.md`): request-changes, confidence medium.
  Every clause of P02 and of P03's amended Expected maps to an assertion that goes red on regression; the Codex-only
  seed matches the real 1.10.0 fixture. `prove/13` (Warning): the P02 contrast asserts the running checkout renders
  `npx -y`, so a registry-less fork's inherited gate would go red against the fork guide's no-test-edit promise.
  `prove/14`, `prove/15` (Minors). The review summaries over 300 characters were shortened for the ledger, meaning kept.
  CI on `f43f66ce` is green on every check leg (floor 5m58s, lts 5m22s, windows-1 5m47s, windows-2 7m10s); the P02
  file ran 3.3–3.8 s on Linux and 10.6 s on windows-2, and `sharedCharterIdentity.test.ts` 32–35 s and 75.5 s (70.9 s
  on Windows before the two P03 cases). Fixer dispatched on `prove/13` in the same lane.
- The close question (question tool, asked 19:57Z and answered by 20:50Z; explained in plain words first: where things stand, the 22 rows left for a
  person with P01 the one H row, the fast-forward merge, the Codex `AGENTS.md.bak` lane decided at 19:38Z, Dependabot
  #64 and the unheld unscoped npm name). The maintainer's reply, verbatim: "Accept and merge (Recommended)" to "How
  should session 2 close?", and "Fix and merge it (Recommended)" to "What should happen to Dependabot #64?". So the 22
  rows are recorded `accepted-unwalked` with their input hashes (none walked; the reply names no row), P01 stays the
  open H row that blocks the 1.11.0 release, `main` is fast-forwarded to the gated head once the last test fix passes
  its re-review and CI, and #64 is rebased, given the one-line oxlint setting, and merged after the merge. No answer
  asked for a placeholder under the unscoped npm name.
- 19:59Z (about): the qa-proofs fixer returned DONE (`reports/qa-proofs-fixer-r1.md`): `prove/13` fixed as `49b934ea` — the
  contrast takes its flag from `canonical().npmChannel`, and the file joins `IDENTITY_SUITES`; the opt-in fork run
  (`STAMITY_FORK_SUITE=1`) failed on the old contrast and passes with the fix (35 s with 19 suites).
- 20:54Z: the qa-proofs re-review (Fable 5.1, a fresh spawn, `reports/qa-proofs-reviewer-r2.md`): approve, confidence
  medium; `prove/13` closed fixed (the flag agrees with the generator's own channel rule on canonical, registry-less and
  `--registry` manifests; the `-y` control stays anchored; nothing weakened). One nit recorded for the ledger and not
  looped: `prove/16`, a stale "eighteen" count in a comment, deferred to the inbox (this run's block is now sixteen
  rows). The loop closed at round 2.
- 21:01Z: CI on `cbfdd00a` green on every leg (floor 5m56s, lts 5m37s, windows-1 6m54s, windows-2 10m2s),
  `all-ci-checks` and `all-pr-checks` pass. The ledger's two follow-ups the record named without a row of their own were
  filed at the close as `review/171` (an engine-side npm scope-mapping check, `review/163`'s sign-off) and `review/172`
  (the fork's registry in the marketplace entry, `review/168`'s fuller fix), each deferred with an inbox row; the
  ledger is 328 rows, 0 open.
- 21:02Z: `main` fast-forwarded from `02096da9` to `cbfdd00a` under the admin bypass (`git push origin cbfdd00a:main`,
  after confirming `origin/main` unmoved and an ancestor); PR #63 reads MERGED at 21:02:01Z with `cbfdd00a` as its merge
  commit, so the plans' stamp `67d2b954` keeps its sha on `main`. No tag, no publish.
- 21:02Z–21:07Z: Dependabot #64, on the maintainer's "Fix and merge it". `@dependabot rebase` put it on `cbfdd00a` as
  `e4f363fa` (oxlint 1.83.0 → 1.85.0 in `package.json`; five lockfile-only development bumps). Unit `dep64-oxlint-setting`
  (implementer, Opus 5.5, lane `p17s2-dep64`, `reports/dep64-implementer-r1.md`) landed `cbfe237c`: `.oxlintrc.json`
  turns off `unicorn/consistent-function-scoping`, and a test comment that gave that rule as its reason is dropped
  (the implementer's own Minor, folded in). `npx -y oxlint@1.85.0 -c .oxlintrc.json` exits 0 (it reported 178 hits,
  exit 1, before); lint, typecheck, knip, the leak gate and the two touched test files exit 0. Pushed to #64's branch
  at 21:07Z; a Fable review of the whole PR (supply chain, the setting, the comment) and CI are running.
- 21:11Z: the #64 review (Fable 5.1, `reports/dep64-reviewer-r1.md`): approve, confidence medium. Supply chain clean:
  every changed `resolved` line is the public registry with a `sha512` integrity, no package added, three removed and
  explained, no install script (`.npmrc` sets `ignore-scripts=true`), no `bin` change, no engine range near the
  22.22.2 floor. `review/173` (Warning): the lockfile also moves 18 entries the PR body does not name (vite 8.3.1 pulls
  rolldown 1.2.11, the build's bundler, with its bindings); its closing evidence is CI's build, size-budget and
  packaging legs, with no code change if they pass. `review/174` (Minor): a `test/**` override would be narrower than
  the repo-wide `off` the maintainer chose. The summaries were re-keyed and shortened for the ledger, meaning kept.
- 21:19Z: #64 merged. CI run 36777347270 on `cbfe237c` green on every leg (floor 5m35s, lts 5m37s, windows-1 6m38s,
  windows-2 7m43s), `all-ci-checks` and `all-pr-checks` pass; the PR approved with the review's findings in its body;
  `main` fast-forwarded from `cbfdd00a` to `cbfe237c` under the admin bypass (so the recorded shas stay), and #64
  reads MERGED at 21:19:19Z. `review/173` retired on that CI (the build on the moved bundler, the size budget, the
  routes); `review/174` cut (the maintainer's chosen setting). The ledger is 330 rows: 185 fixed, 22 rejected, 123
  deferred (105 retired with a date, 18 with an inbox row), 0 open.
- 21:02Z–21:21Z: new Dependabot alerts on `main` at 21:02Z, the moment it moved, and six PRs at 21:03Z (#65 to #70):
  brace-expansion (root, development only, medium), ip-address (root, an optional runtime dependency through
  sigstore, medium) and, in the docs site's `website/` lockfile, brace-expansion (two high, one medium), joi (high),
  dompurify and serialize-javascript (low). None came from this run: the same versions were on `main` at `02096da9`.
  Asked in plain words (question tool), the maintainer answered "Session 3, first (Recommended)": session 3's kickoff
  merges them first, before its eval run, so the release gates and the new baseline run on the updated lockfiles.

## Proof block (2026-09-30 — the Package 17 session 2 close, merged without a release)

- **Candidate and merge.** `cbfdd00a` on `package-17-sweep` (PR #63): 96 commits and 408 files over `main` `02096da9`
  (+27,028 / −26,745), 50 of them the replay files deleted behind the tag `replay-frozen-2026-09-30`
  (record.md:141-142, :160). The candidate is `f43f66ce` plus one test-only fix, `prove/13` in two test files
  (record.md:721-723); its tree equals the lane commit `49b934ea` (`git diff 49b934ea cbfdd00a` is empty). `main` was
  fast-forwarded to `cbfdd00a` under the admin bypass at 21:02Z (PR #63 reads MERGED at 21:02:01Z, with `cbfdd00a` as its merge commit), after CI, on the maintainer's close answer
  (record.md:716-719). A fast-forward is the only way this branch can merge: both plans are stamped with the branch
  commit `67d2b954` (record.md:37-38). There is no tag and no npm publish. The release is session 3's
  (record.md:9-10, :14-15).
- **After the merge: Dependabot #64** (the maintainer's "Fix and merge it"). Rebased onto `cbfdd00a`, it gained one
  oxlint setting and a stale comment's removal (`cbfe237c`, unit `dep64-oxlint-setting`), was reviewed (Fable 5.1,
  approve, medium; `review/173` retired on CI, `review/174` cut) and went green on every CI leg; `main` was
  fast-forwarded to `cbfe237c` at 21:19Z, and #64 reads MERGED (record.md:737-756).
- **Build isolation.** The operator-prepared worktree farm, declared at Frame: one worktree per lane, reset to the
  package branch, staged by explicit path, never `git stash` (record.md:33-36).
- **Gates.** The gate of record at `f43f66ce` (test-runner, `reports/prove-final-test-runner-r3.md`, class 2). It ran
  `false` once to calibrate: the tool showed exit 1, so a result with no status shown exited 0 (report :9). Record line:
  record.md:700-703.

  | Gate | Command | Result |
  |---|---|---|
  | build | `npm run build` | pass |
  | lint | `npm run lint` | pass (0 errors; the one known warning, `content/skills/st-verify/scripts/spec-plan-coverage.mjs:1`) |
  | typecheck | `npm run typecheck` | pass |
  | tests with coverage | `npm run test -- --coverage` | pass (261 files, 10,633 passed, 12 skipped; 96.71 / 90.3 / 98.98 / 97.65; every scoped floor met) |
  | unused code | `npm run knip` | pass |
  | leak gate | `node scripts/leak-gate.mjs` | pass (0 hits for 19 rules across 1,671 files) |
  | drift | `node dist/cli.js check` | pass (setup green, drift clean; it names the three gates it does not run) |

  **The final tree** `cbfdd00a` had no local full gate of its own. Its evidence is in two parts:
  - The fixer's targeted gates at the identical tree `49b934ea` (class 3, `reports/qa-proofs-fixer-r1.md:35-44`). The two
    changed files passed, the opt-in fork run passed 4 of 4, and lint, typecheck, knip and the leak gate each exited 0.
  - CI at `cbfdd00a`: green on every leg (floor 5m56s, lts 5m37s, windows-1 6m54s, windows-2 10m2s), with `all-ci-checks` and `all-pr-checks` passing (run 36775539804) (class 1, native). It is recorded as the final tree's gate of record, as CI at
    `5f8ad2f6` was (record.md:671).

  The earlier runs:
  - Integration batches:
    - 1 green (record.md:163-166);
    - 2 red, `prove/1`–`prove/3`, since fixed (record.md:237-273);
    - 3 red, on knip (`prove/4`) and three cleanup timeouts (record.md:285-289);
    - 4 red, `prove/5` and `prove/6`, since fixed (record.md:396-403, :429-431);
    - 5 green (record.md:505-507).
  - Final gate:
    - r1 red at `6754ad25`, `prove/9` (record.md:602-603);
    - r2 green at `c35a6f23` (record.md:651-653).
  - CI:
    - green at `6838d2b4` (record.md:198-199);
    - red at `b855876a`, `prove/7` and `prove/8` (record.md:513-525);
    - green at `08bd8f88` (record.md:530-531), `5f8ad2f6` (record.md:665-667) and `f43f66ce`, every check leg
      (record.md:710-712).
- **Review verdicts.** This record declares no `Confidence gate:`, so an approval counts as given
  (`.claude/commands/st-work.md:242-245`). Every unit loop closed on an approval at medium or high, as its Build line
  says. The loops below took more than one round, or ran in Prove:

  | Loop | Rounds | Last verdict | Confidence | Where |
  |---|---|---|---|---|
  | qa-harness-accepted-unwalked | 2 | approve | high | record.md:174-178 |
  | sw20-email-rule | 2 | approve | medium | record.md:211-214 |
  | sw24-debug-reproduce-in-process | 2 | approve | medium | record.md:274-276 |
  | sw28-spec-small-app-scope | 2 | approve | high | record.md:277-279 |
  | work-qa-states | 3 | approve | high | record.md:282-283 |
  | sw31-ask-sized-to-question | 2 | approve | high | record.md:299 |
  | sw07 card units | 2 | approve | medium | record.md:300-301 |
  | sw27-ignore-review-gate-state | 2 | approve | medium | record.md:318-319 |
  | sw26-cli-call-form | 2, plus a security re-check | approve | high | record.md:337-339, :350-353 |
  | sw12-flake-unit | 2 | approve | medium | record.md:344-345, :357-358 |
  | sw26-engine-cli-call-form | 2, plus two security re-checks | approve | medium | record.md:302-303, :359-360, :383 |
  | sw05-read-only-git-grants | 2, plus a security re-check | approve | high | record.md:384-386, :443-447 |
  | sw29-records-via-file-tools | 2 | approve | medium | record.md:472 |
  | sw21 ledger papercuts | 2 | approve | high | record.md:485-486 |
  | lane V (eval cases) | 2 | approve | high | record.md:496-498 |
  | sw14-client-currency-sweep | 2 | approve | high | record.md:505-508 |
  | sw10-first-run-output | 2 | approve | high | record.md:524-525, :535-536 |
  | sw18-codex-rules-leave-shared-charter | 3, plus a security re-check | approve | high | record.md:556-564, :571-576, :591-593 |
  | sw17-touchpoints-as-shared-skills | 2 | approve | medium | record.md:582-590, :594-599 |
  | whole-branch deep review (Fable) | 2, each a fresh spawn | approve | medium | record.md:612-618, :643-646 |
  | whole-branch security lens (Fable) | re-checks r2 and r3 | `review/163`, `/167`, `/168` fixed; no Warning left | — | record.md:643-650; `reports/branch-security-r3.md:5-6` |
  | `prove/9` fix | 1 | approve | medium | record.md:643 |
  | qa-proofs tests | 2 | r1 request-changes, r2 approve (`prove/13` fixed) | medium | record.md:705-712, :721-723; `reports/qa-proofs-reviewer-r2.md:6-7` |

- **Security.** Every security-relevant finding closed before the merge:
  - `review/94`: a fork with no npm channel renders `npx --no`, failing closed (record.md:306-314; closed :359-360).
  - `review/102`: the local form `npx --no stamity` never downloads the unheld unscoped name (record.md:321-329; closed
    :350-351). Its one residual is below the bar: npm reads that name's manifest once before refusing.
  - `review/109`: `sync --help` for a registry-less fork (record.md:361-365; closed :381-383).
  - `review/110` and `review/113`: the guard refuses `--show-signature` and `--help` (record.md:384-391; closed
    :443-447).
  - sw18's C-1: the override never republishes refused `AGENTS.md` bytes (record.md:556-564; closed :571-572).
  - `review/163`, then `review/167` and `review/168`: the `--registry` fork's `.npmrc` precondition, its own registry
    for the update notice, and the marketplace sentence (record.md:626-634, :647-650).
  - `prove/1`: the email rule skips vendored trees (record.md:248-249, :271).

  One screening hit was kept: quoted test source in a QA locator's results, not a directive (qa.md:347-349).
- **QA checkpoint.** `qa.md` beside this record, built with st-qa by name (record.md:668-673):
  - 90 rows: 68 auto-proven, each with its gate and assertions. That count includes P02 and P03, proven at the close by
    `6c28d8e3` and `f43f66ce` (record.md:674-686, :693-698).
  - 22 rows `accepted-unwalked`, each with its input hash, none walked: P01 (H), P04–P18 (M) and P19–P24 (L)
    (record.md:716-718).
  - Signed by the maintainer's close answer. **Shippable: NO**, because P01, an H row, stays open and blocks the 1.11.0
    release (record.md:717-718).
  - Browser evidence is not applicable: no UI surface changed (qa.md:33).
- **Decisions trace.** The maintainer answered through the question tool and took the recommended option every time:
  - five at Frame: D1, the 20 plan defaults; G1, the plan gate; F1, the inbox fold-in; G2, the handoff-drafts line;
    G3, Codex's pinned `hooks.json` (record.md:55-59);
  - two at the close: "Accept and merge (Recommended)" and, for Dependabot #64, "Fix and merge it (Recommended)"
    (record.md:713-720);
  - one after it, on six new Dependabot security PRs (#65 to #70): "Session 3, first (Recommended)"
    (record.md:757-762).

  The orchestrator signed off on its own lines:
  - build/18 (record.md:154-159);
  - review/13, /16, /17 (record.md:169-173, :188-197);
  - review/35, /36, /56 (record.md:220-236);
  - the exit-status calibration and the email rule's vendored skip (record.md:243-249);
  - review/59, /61, /66, /67 (record.md:250-264);
  - review/90 and build/79–80 (record.md:290-297);
  - review/94 and review/102, above;
  - build/89, /90, /93 (record.md:330-333);
  - review/110, /113 and the sw21 row rule (record.md:387-395);
  - prove/6 (record.md:400-403);
  - sw08's files (record.md:407-410);
  - review/118 (record.md:454-457);
  - the sw29 and sw21 Warnings (record.md:462-471);
  - build/124, deferred (record.md:479-482);
  - sw10 (record.md:490-495, :510-512);
  - sw18's live check and files (record.md:500-504, :537-544);
  - the ledger triage cut (record.md:550-555);
  - sw18's C-1 and round 2 (record.md:556-576);
  - sw17 (record.md:565-570, :582-590);
  - prove/9 (record.md:619-625, :635-642);
  - the whole-branch findings (record.md:626-634, :647-650);
  - prove/10, rejected: the Codex-only `AGENTS.md.bak` lane is the product's standing lane (record.md:677-686).

  Other decisions:
  - REQ-FLOW-023 retired: its live check found no gap (record.md:96-101).
  - review/94's fail-closed form was left open for the maintainer to reverse at QA, and the close answer did not
    reverse it (record.md:313-314, :713-720).
- **Ledger.** `ledger.jsonl` has 330 rows and 0 open:
  - 185 fixed;
  - 22 rejected;
  - 123 deferred: 105 retired with a dated field, and 18 with an inbox row.

  The count closed at 18:35Z through the CLI (record.md:659-663) and then took the Prove rows `prove/10`–`prove/16`
  (record.md:693-698, :705-712, :721-723). `prove/16`, the qa-proofs re-review's Minor, is a stale "eighteen" in a
  comment at `test/ci/pluginDownstream.test.ts:723`, deferred to the inbox (`ledger.jsonl:326`). At the close, `review/171`
  and `review/172` filed the two follow-ups the record named without a row of their own: an engine-side check of a
  consumer's npm scope mapping (`review/163`'s sign-off, record.md:630-633) and the plugin generator writing the fork's
  registry into the marketplace entry (`review/168`'s fuller fix, `reports/branch-security-r3.md:25`).

  The 18 rows sit in `.stamity/inbox.md`'s block dated 2026-09-30, each with its `Ref:`. Two are Warnings:
  - `build/26`: the hygiene script now imports the leak gate;
  - `build/124`: the no-op allow rows.

  Rows this run removed from the inbox:
  - `review/197`, as written (record.md:85);
  - the three cleanup-timeout rows `sw12-flake-unit` fixed, each retired with a date (record.md:656-658).
- **Live checks.** Four were run against real clients (record.md:96-122):
  - Copilot's writing-agent charter;
  - the Codex hooks learning;
  - sw18's `AGENTS.override.md`, read by Codex only;
  - sw17's touchpoints, under `$st-work` in Codex and `/st-work` in Cursor.
- **Learnings.** One commit from the learnings writer, `cb215fb3`: four retired, two captured through `learn capture`
  (one of them the kickoff's spec-skeleton learning), twelve re-dated. `check` reads 14, all valid (record.md:411-442).
  Two stale learning bodies are inbox rows (`build/105`, `build/106`).
- **Spec and plans.**
  - Spec merge passes 1–3: `7a18c4e9`, `a9e94f06`, `6754ad25` (record.md:532-534, :602). REQ-CTX-017 and REQ-CTX-018
    are defined (record.md:533).
  - REQ-FLOW-025's "setup writes no permission allowlist" is recorded as not shipped (record.md:479-482).
  - The plan cells were amended in place by the spec-author: `57bb664d`, `d2289c96` (record.md:147, :168, :404-406).
- **Artifacts touched** (path, then its owner):

  | Path | Owner |
  |---|---|
  | `src/`, `content/`, `scripts/`, `test/`, `.github/workflows/ci.yml`, `docs/` pages | one implementer per unit, then its fixers (record.md:135-139) |
  | generated files, dogfood sync, both golden snapshots | the orchestrator, at each integration (record.md:138-139) |
  | `evals/cases-v6/` (113 cases) | lane V's implementer (record.md:496-498) |
  | `evals/replay/`, `scripts/replay/`, `test/replay/` (deleted) | the L8 implementer (record.md:141-142, :160) |
  | `docs/specs/` | the spec-author, merge passes 1–3 (record.md:532-534) |
  | `docs/plans/013-optimization-sweep-02.md`, `-03.md` | the spec-author, cell amendments (record.md:147, :404-406) |
  | `.stamity/learnings/` | the learnings writer (record.md:411-436) |
  | `test/ci/pluginPackages.registryless.test.ts`, `test/emit/sharedCharterIdentity.test.ts`, `test/ci/forkIdentity.test.ts` | the qa-proofs implementer and fixer (record.md:674-698, :721-723) |
  | `.oxlintrc.json`, `test/cli/prompts.test.ts` (#64, after the merge) | the `dep64-oxlint-setting` implementer (record.md:737-743) |
  | `record.md`, `ledger.jsonl`, `.stamity/inbox.md` | the orchestrator, through the file tools and the ledger CLI (record.md:126-127) |
  | `qa.md` | the QA checkpoint agent, Opus 5.5, with st-qa (qa.md:3-4); updated at the close by the orchestrator (P02, P03, G3, the sign-off) |
  | this proof block | the spec-author, Opus 5.5 |

- **Per-action attribution.** Model mix of 2026-09-23 (record.md:24-28). Each report's first line names the model it
  ran on (for example `reports/branch-reviewer-r1.md:1`, `reports/prove-final-test-runner-r3.md:1`).

  | Role | Model | Tool and surface | Outcome |
  |---|---|---|---|
  | census researchers (4) | Opus 5.5 `claude-opus-5-5` | read-only search | every file-2 contract on one owning unit (record.md:63-74) |
  | implementers | Opus 5.5 | one worktree lane each, targeted tests | every unit of both plans built and integrated, except the deferred allow rows (record.md:598-601) |
  | fixers, rounds 1–3 | Opus 5.5 | the same lane | no loop reached round 4 (the table above) |
  | reviewers, security lens, deep review, ledger triage | Fable 5.1 `claude-fable-5-1` | read-only; read-only git once sw05 landed (record.md:453) | verdicts above |
  | test-runners | Opus 5.5 | a detached gate worktree, each gate once | batch and final gates above |
  | spec-author | Opus 5.5 | file tools; read-only git | plan amendments, spec passes 1–3, this block |
  | QA checkpoint agent | Opus 5.5 | read-only; five locator sub-agents | `qa.md` (qa.md:8) |
  | orchestrator | the session | integration, `stamity ledger`, question tool | sign-offs above; pushes; the merge |

  Some sub-agents returned BLOCKED. Each was settled by a sign-off, and the same agent resumed:
  - `sw05` (record.md:154-159);
  - `review/35`'s fixer (record.md:228-236);
  - `sw26-cli-call-form` (record.md:293-297);
  - `sw08` (record.md:407-410);
  - `sw14`, BLOCKED_AMBIGUITY (record.md:475-482);
  - `sw10` (record.md:490-495);
  - `sw18` (record.md:537-544);
  - `sw17` (record.md:565-570);
  - `prove/9`'s fixer, BLOCKED_AMBIGUITY (record.md:635-642);
  - the P03 proof (record.md:677-686).

  The session paused on a usage limit at 16:44Z and resumed at 18:03Z (record.md:600, :619).
- **Process slips, recorded:**
  - Build stamps were first written ahead of the clock, then corrected to bounds (record.md:131-133).
  - Findings blocks were first written as YAML (record.md:148-150).
  - A test-runner wrapped gates in `timeout` (record.md:165-166).
  - A re-review's closures used the wrong keys (record.md:176-178).
  - The census missed two consumers: `initApply.test.ts` and sw08's test file (record.md:407-410, :490-492).
  - The first exit-status rule could never read `pass` on a client that shows no status for a success
    (record.md:241-247).
- **Recommended next step.**
  - Session 3, the 1.11.0 release:
    - first, the six Dependabot security PRs #65 to #70, on the maintainer's answer (record.md:757-762);
    - the eval set at the release run, with a new baseline where the corpus moved;
    - QA of the candidate with P01 walked (record.md:717-718);
    - the 1.11.0 notes, naming Codex's hook re-approval (record.md:59) and the Codex-only `AGENTS.md.bak` lane
      (record.md:685-686);
    - the cut.
  - The private layer's close follows this record in the same session (record.md:608-610, :687-688, :703-704).
  - The 18 inbox rows this run appended wait in the 2026-09-30 block.
- **Not done:**
  - REQ-FLOW-025's "no permission allowlist" is not shipped. The no-op allow rows stay until the maintainer picks
    reading A or B (`build/124`, inbox; record.md:475-482).
  - 22 QA rows are accepted unwalked. P01, an H row, stays open and blocks 1.11.0 (record.md:716-718).
  - Six Dependabot security PRs (#65 to #70; two high and one medium in the docs site's lockfile, two medium at the
    root) wait for session 3's first step, on the maintainer's answer; none came from this run (record.md:757-762).
  - 18 deferred rows wait in the inbox, two of them Warnings (`build/26`, `build/124`), among them the npm
    scope-mapping check (`review/171`) and the registry in the marketplace entry (`review/172`).
  - The unscoped npm name `stamity` stays unheld. Holding a placeholder is the maintainer's call, and the close did not
    ask it (record.md:328-329, :720).
  - A client whose shell tool shows no status even for `false` reports every gate `unknown`. This is the residual left
    for session 3's QA (P15; record.md:246-247).
  - The QA residuals in `qa.md:354-361` stay as written: the lint header under Node globals, and the assertion gaps.
  - The private layer's close (its decision row, the handoff page, the banner, the directive note and the session 3
    kickoff) is written after this record, in the same session (record.md:608-610, :703-704).
