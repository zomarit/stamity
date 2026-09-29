# Replay protocol v3 — `REPLAY-v3`

The protocol and the thresholds of the replay of the changed `/st-work` of Package 16 against
the 1.9.1 one, on a fixture where each unit applies its own seeds. It implements REQ-CTX-015 as plan
`docs/plans/012-replay-v3.md` amends it, under that plan's decisions D1 (seeded patches, per pass) and D2 (the
measured re-cut, with a canary floor of 8 of 12), both of 2026-09-29. This file is committed before the first v3
result and is never edited afterwards: a gap a pilot finds is recorded against this file as it stands (§7, §14), or it
restarts the pilots under a new protocol, `REPLAY-v4`.

`REPLAY-v1` and `REPLAY-v2` stay frozen. REPLAY-v2's instrument held: both of its canaries passed K1–K16 at
`c6b686df`. Its baseline pilot, `evals/replay/v2/runs/2026-09-28-replay-1/`, was valid and fell outside §10's band:
the orchestrator restored 8 of the 10 injected seeds before review, so recall read 2 of 2, no scored run followed,
and `COMPARISON-v2.md` was never written. Three things went wrong, and this file answers each.

- **The v2 seeds were foreign edits.** They went in at the first review after the build phase, into work the
  orchestrator had already audited. Every v2 orchestrator saw them: the units' own tests went red seconds after the
  implementers reported green, nine files' times jumped to the same second, the staged form left dangling index
  blobs, and a file one unit had not touched appeared in the change set. Detection always started from such a
  contradiction.
- **Review held a clean copy.** Round-1 reviewers read the tree against the clean `vendor/contrib` patches, so every
  surviving seed showed as a deviation from them (the baseline canary found 10 of 10 in round 1). Reviewers cited the
  clean patches in 5 to 17 findings per v2 run, and in none in v1, where the patches held the seeds.
- **The reader read the two shapes differently.** It read a structured finding one locator per entry and a free-text
  finding one finding per locator, which understated the changed shape (7 of 10 against 10 of 10).

v3 keeps v2's shapes, messages, samples, band and thresholds, and v2's pins with the additions §3 names. What changes:

- **The seeds arrive inside the units' own patches** (D1). At the build dispatch of each pass, the driver rewrites
  that pass's contrib patch with its seeded bytes, keeping the file's times, so each implementer applies its own
  seeds as its own work, at its own time and in its own form (§5, The swap).
- **No clean copy stays within review's reach.** The patches are untracked and git-excluded, the fixture keeps only
  the preimage blobs `git apply --3way` needs, and the build refuses when any stored object holds a seed's clean
  text (§5).
- **A new seed set** (D2): twelve seeds and three decoys, cut so that each sits in a line its own pass adds, and the
  fixture's own defects fixed in the clean patches (§5, Fixture notes).
- **Coverage, credit and presence are read per pass.** A pass is swapped at its build dispatch and built when that
  build agent stops; a finding credits a pass's seed only when its agent covers that pass; presence is read at
  review start (§5, §8).
- **The canary proves the arrival**, with a floor of 8 of 12 seeds present at review start in each shape (§5).
- **The session sees no harness.** A fresh run root, the service's own names, and two hook events (§3); a change
  notice for a swapped patch or a harness string in any transcript line makes a run invalid (§8).
- **One reader for both shapes**: secondary locators, branch level, the verdict grammar, the ledger sources, loss by
  entries, the report key, report placement and the flat ledger (§8, §9).
- **Runs and the comparison** live under v3's own paths (§11).
- **Threats to validity** are written down again for v3 (§15).

## §1 Scope

- Not an eval-set run. The replay measures one thing: whether the changed shape of `/st-work` keeps the decisions the
  1.9.1 shape makes while it spends fewer characters in the orchestrator's loop. It uses no rubric, no judge model and
  no case from `evals/cases-*`.
- The eval set's floors are the eval run's, not the replay's to measure, so the `eval-set-floors` row is carried, not
  measured (§12).
- The replay runs `/st-work` at the deep tier over a three-unit, six-pass plan on a disposable fixture, with twelve
  seeds that the units' own patches carry once each pass is dispatched for build, and three decoys, on Claude Code
  only, one run at a time. Cursor, GitHub Copilot CLI and Codex are not replayed, because the instrument drives only
  the pinned Claude Code CLI (§3). Each run's RESULTS and the comparison carry the same Clients table: Claude Code as
  `measured`, and one `not-run` row for each of the other three, with that reason. In RESULTS it stands before the
  closing line; in the comparison, between its rows and its `Merge gate:` line. The table gates nothing.
- Out of scope: any change to the context economy; REPLAY-v1, REPLAY-v2 and their data; the thresholds. A FAIL is
  recorded, and the maintainer decides between fixing the context economy and reverting a part of it.

## §2 Shapes

- `baseline` is the CLI built at `fed39ac` (`fed39ac4efe545da298e8b07fe0e2d4b0e2aa041`, the 1.9.1 tree after its
  cleanup merge).
- `changed` is the CLI built at the instrument commit (§13): 1.10.0's product source, which carries the context
  economy, with the v3 instrument beside it. Each run records the sha it built. Package 17's final replay, which runs
  the finished release candidate, is a separate replay under its own protocol.
- Both are installed into the fixture as `npm pack` tarballs (§4). The emitted setup is the only difference between the
  shapes: the fixture, the plan, the seeded patches, the client, the model, the argv, the environment and the
  invocation bytes (§6) are identical.

## §3 Pins

- **Client.** Claude Code 2.1.280, run from a copied binary whose sha256 is recorded, with `DISABLE_AUTOUPDATER=1` in
  the child's environment. `claude --version` and the init event's `claude_code_version` must both read `2.1.280`.
- **Models.** The orchestrator runs on `--model claude-opus-5-5`. Every sub-agent's `message.model` is recorded; an
  alias resolving to another model voids the run. The orchestrator's effort is the client default, recorded from the
  init event.
- **Account and client folder.** `CLAUDE_CONFIG_DIR` is the operator's own logged-in client folder. The replay shares
  that login the way a second terminal would, and no credential is copied: a copied OAuth credential can be
  invalidated when either copy refreshes it. No login is switched while a run is prepared, running or held.
- **What the folder must not carry.** No user `CLAUDE.md`, no `agents/`, `commands/` or `output-styles/`, and no
  `enabledPlugins`. Its `settings.json` hooks must include the operator's pattern-kill guard
  (`/bin/bash <home>/.claude/hooks/block-pattern-kill.sh`), because the replay's agents run headless with permission
  prompts bypassed.
- **What the folder does carry.** Account-synced skills and the user settings' model default (overridden by
  `--model`). That is ambient context, identical in both shapes. Every run records the init event's skills, agents,
  slash commands, plugins and MCP servers, and a run whose lists differ from its shape's pilot is invalid. MCP
  servers stay off (`--strict-mcp-config`).
- **Argv**, built by the driver:

  ```text
  -p --model claude-opus-5-5 --input-format stream-json --output-format stream-json --verbose
  --replay-user-messages --strict-mcp-config --permission-mode bypassPermissions --settings <marker-settings.json>
  ```

  with no `--tools ""`, no `--disable-slash-commands` and no `--no-session-persistence`: the run needs the tools, the
  `/st-work` command and the session transcript.
- **Environment.** Built from scratch after the private layer's dispatch pattern: `PATH HOME USER LOGNAME SHELL TMPDIR
  LANG`, `TERM=dumb`, `CLAUDE_CONFIG_DIR`, `DISABLE_TELEMETRY=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`,
  `DISABLE_AUTOUPDATER=1`, plus `STAMITY_NO_UPDATE_CHECK=1`. Every other `CLAUDE*`, `ANTHROPIC*` and `AI_AGENT*`
  variable is dropped. `TMPDIR` is the run root's empty `tmp/` folder. Right after the fixture's `node_modules/.bin`
  on `PATH` comes a fallback shim for `stamity`, because an agent's own `npm install` may prune the CLI the fixture
  installed with `--no-save`.
- **The run root.** Every run lives under a fresh folder in the OS temp directory, made by the driver
  (`prepareRunRoot`) and removed after the capture. It holds the fixture, whose folder takes the service's own prefix
  `replay-orders-`; the empty `tmp/`; the shim `bin/stamity`; and `lib/`, a copy of the shape's CLI the shim runs (a
  copy, never a symlink). The shim's sha256 is recorded. In v2 the shim's path named the shape (`…/shapes/<shape>/`),
  and `which stamity` showed it; in v3 no path the session can read names the shape, the replay or the harness: the
  environment, the shim, the fixture path and `TMPDIR` hold no `.stamity-replay`, `stamity-replay-` or `REPLAY_`.
- **Two hook events.** The marker settings register, under v3, only `PreToolUse` (for `Agent`, `Task`, `SendMessage`
  and `TaskStop`) and `SubagentStop`. There is no `SessionStart`, `PreCompact` or `PostCompact` hook, because at
  `/compact` the client prints each such hook's whole command line into the session, and in three v2 runs that line
  carried `REPLAY_SEEDS=…/seeds.json`. The driver writes the post-compaction marker row itself (§7). The hook writes
  nothing to stdout, always exits 0, and records its own duration; it has no internal budget (a swap and a snapshot
  take 60 to 140 ms).
- **The names the agents see.** The fixture's plan path, the service's name and the four invocation messages are
  v2's, byte for byte (§6). The fixture's git author and committer are `Orders Maintainers
  <maintainers@orders.invalid>`, and its plan commit's subject is `docs: add plan 001`. No hook command line, shim
  path, settings path, `REPLAY_*` value or `stamity-replay` string reaches the session (§8, Contamination).

## §4 Install

For each shape: `git worktree add --detach <tmp>/cli-<shape> <sha>`, then
`npm ci && npm run build && npm pack --pack-destination <dir>`. The tarball's sha256 is recorded. Never `git stash`:
the stash is one stack shared by every linked worktree.

Before the canary, v2's prepared shapes move aside inside the replay home, to `superseded-c6b686df/`, and are never
deleted; the prepared dependencies move with them when v3's `base.patch` differs from v2's. The pinned client binary
and the client record stay where they are. Both shapes are then prepared with `--protocol v3` against the pinned
instrument checkout at the instrument commit (§13): the baseline's CLI from `fed39ac`, the changed shape's from the
instrument commit itself.

## §5 Fixture

- Built by `node scripts/replay/fixture.mjs --protocol v3` from `evals/replay/v3/` under the run root (§3), never
  inside this repository. Its base commit S0 is deterministic: fixed author, committer and dates, and `-c` flags that
  override the operator's global git config. Under v3 the author and committer are the service's maintainers, the
  plan commit's subject is `docs: add plan 001`, and the folder takes the prefix `replay-orders-`
  (`createReplayFixture`'s `identity` and `prefix` options); a v1 or v2 build keeps its own bytes and takes no v3
  option.
- The plan `docs/plans/001-replay.md` holds six passes, `u1-p1 → u1-p2 → u2-p1 → u2-p2 → u3-p1 → u3-p2`, as a single
  `depends_on` chain in both shapes: attribution and placement stay deterministic, and no parallel lane runs.
- **The patches are untracked.** Each pass's contrib patch sits at `vendor/contrib/<pass>.patch`, and right after
  `git init` the build writes `/vendor/` into `.git/info/exclude` (`createReplayFixture`'s `vendor: 'excluded'`). S0
  commits no `vendor/`, and `git status` never lists the patches. Until its pass is swapped, each patch is the clean
  one: it adds correct code, and research and planning read it. No line of the plan and no file the plan's `reads:`
  names holds a seed. A committed patch file would be fatal to the swap: git sees a rewritten file through its size
  and ctime even when its times are kept, and `git add -u` would stage a diff of diffs that shows every seed.
- **No oracle within review's reach.** The fixture never contains `seeds.json`, the oracles, the reference fixes or
  the seeded patches; the build lists every file it wrote, ignored ones included, and refuses when one of them is
  such a file. The fixture stores only the preimage blobs `git apply --3way` needs, none of them holding a seed, in
  one kept pack (a `.keep` file) that no ref names (`createReplayFixture`'s `preimages: 'kept-pack'`,
  `storePreimageBlobs`). Its only ref is `refs/heads/main`. REPLAY-v2's `refs/replay/preimages/<pass>` trees held clean
  postimages of the earlier passes, and so did the last pass's unreachable blobs; v3 stores neither.
- **The refusal.** The build refuses, naming the seed, before S0 when a seeded patch's preimage ids differ from its
  clean patch's, when a later pass's patch touches an earlier seed's file, or when any stored object would hold a
  seed's clean text (its `injection.find`), a clean patch's blob, or a clean postimage id of a seeded file.

**The swap** (D1). A pass P is *swapped* when the first build-role dispatch whose description names P starts (§8,
Role functions and Covered passes: every pass id the description names counts, a named range names every pass in it,
and the prompt is never read). Before the implementer's first tool call, the driver's `PreToolUse` hook rewrites
`vendor/contrib/P.patch` in place with P's seeded bytes, in every worktree of the run that holds that file at the
dispatch, and restores the file's access and modification times so the millisecond the client reads is unchanged.
The implementer then applies its own seeds with its own `git apply --3way`, at its own time, staged or not by its own
actions, in files its own unit touches. The swap is per pass because a v1 orchestrator re-read a patch it had not yet
built, mid-build.

- For each worktree, the hook reads the file's bytes. The clean patch's bytes are rewritten (`swapped`); bytes that are
  already the seeded patch's are left alone (`already-seeded`); any other bytes are left alone (`patch-modified`). A
  pass whose patch no worktree holds reads `patch-missing`, and a swap that throws reads `failed`.
- A range swaps every pass it names, in pass order, in one hook call under one tool_use id. No other dispatch writes a
  patch: a later build dispatch naming a swapped pass is recorded as a repeat and writes nothing, a SendMessage
  continuation swaps nothing, and a pass no build description names keeps its clean patch and has no swap record.
- The times are restored from nanoseconds with a half-microsecond bias, and the hook then confirms the millisecond
  of the modification time is unchanged. The client's change notice is gated on that millisecond: a Read-tool read
  never arms it, a change whose times are restored exactly raises none, and a Read-tool re-read then answers "file
  unchanged since your last Read". A swap that cannot keep the millisecond ends the run as `swap-failed` rather than
  continue with a changed time.
- Each swap writes `captures/swaps/<P>.json` (schema `stamity/replay-swap/v1`): the pass, the time, the tool_use id and
  description of the dispatch, its role, the state, the clean and seeded digests, each target worktree's path,
  on-disk digest, whether it wrote, its times in nanoseconds before and after and whether the millisecond was kept,
  P's seeds, the repeats and the hook's duration. `run.json` carries every pass's record as `injection`:
  `{ arrival: "patch", passes: { <pass>: { pass, at, toolUseId, state, clean, seeded, mtimeKept, seeds: [{ id, file,
  state }] } }, partial }`.
- A worktree made after its pass's swap holds no untracked `vendor/` at all, so no swap can reach it (§15).

**Built.** A pass is *built* once the build agent whose dispatch swapped it has stopped: it returned, or TaskStop ended
it. So a pass is swapped at its dispatch and built at its stop. Coverage, the review-start snapshot and the credit guard
read "built"; the swap decides only the credit of a finding no agent's digest names (§8). A review dispatched beside a
running implementer therefore never snapshots that pass before its patch is applied, never reads its seeds as caught
before review, and credits none of them.

**Three snapshots.** Each copies every worktree of the run, the main checkout included.

- **Build end.** At every stop of a build-role agent (its `SubagentStop`, or the TaskStop that ended it), the hook
  copies the trees to `captures/build-end/<stamp>-<agentId>/` and adds a row `{ at, agentId, dispatch, passes, dir }`
  to `captures/build-end/index.jsonl`. The stop of an agent of any other role adds none.
- **Review start.** At the first verdict-role dispatch that covers P (§8, Covered passes), the hook copies the trees
  to `captures/snapshots/<P>/` (a partial folder, then a rename) and probes the object store once. Each pass is copied
  once: a later verdict dispatch that covers it copies nothing for it. This is the tree the review of P starts from,
  and presence is read here (§8, Recall).
- **Round completion.** When the first review round that covers P completes, the driver copies P's trees again to
  `captures/review-snapshots/<P>/`, once per pass, as REPLAY-v2's review snapshot is taken once. "Completes" is v2's
  complete round, read over the whole round (§7): every member has stopped (TaskStop counts as a stop), at least one
  member returned by itself, and this holds on two polls in a row; when TaskStop stopped every member, the copy is
  taken when the next round completes. The copy serves the canary's K17 and the note "removed during review" (§8); it
  decides no seed's presence.

**The seed states.** The measurement reads each seed of pass P into one state (§8, Recall):

- **Uncovered.** P has no swap record: no build description named it. Its seeds never arrived, they are never found
  and no finding is matched against them, and the run is invalid (§8, §10).
- **Present at review start.** The seed's `present` rule holds in some copy under `captures/snapshots/P/`. It is in
  the pooled denominator, found or missed as §8 and §9 read. When it reads present in no copy of its round-completion
  snapshot that holds its file, and no finding credits it, it stays a miss and RESULTS notes it as removed during
  review, uncredited.
- **Caught before review.** The seed reads present in no review-start copy of P while some copy there holds its
  file, and some build-end copy after P's swap held it. It leaves the pooled denominator and counts as found for
  `security-seeds`, as v1 and v2 read a seed absent at the pass, and it is no matcher item. RESULTS names the
  build-end interval in which it went: the last build-end copy that held it and the first that did not, with their
  agents.
- **Not delivered.** As caught before review, except that no build-end copy after P's swap ever held it. It leaves the
  denominator, counts as found for `security-seeds`, and RESULTS names it as not delivered.
- **Never reviewed.** P was swapped and built, and no review covered it, so it has no review-start copy. §8 (Recall)
  reads its seeds from its build-end copies: present, a miss; absent, caught before review or not delivered. P's
  verdict class reads null.
- **A capture defect.** P has a review-start snapshot, and a seed's file is absent from every copy in it. A file gone
  from every copy says nothing of the seed, so the run is invalid (§8).

**Canary.** Before any pilot, one canary run per shape (`K-swap-baseline`, `K-swap-changed`) proves the arrival on the
pinned client. K1–K4 decide the mechanism (§7), and K5 and K7–K10 are REPLAY-v2's, unchanged. The checks v3 adds or
changes:

- **K6′.** The marker log holds `PreToolUse`, `SubagentStop` and stream post-compaction rows, and no `SessionStart` or
  `PreCompact` row.
- **K11′.** Every pass was swapped, before its implementer's first tool call, with the on-disk bytes equal to the
  seeded digest and the millisecond kept; and applied: an apply of `vendor/contrib/<P>.patch` shows in the
  implementer's transcript, or one of P's seeds is present at its build end.
- **K12′.** Every swapped pass has a build-end copy, and a whole review-start copy that holds each seed's file.
- **K13.** A verdict agent cites a seeded file as `file:<n>`.
- **K14′.** The run's end, read as REPLAY-v2's K14 reads it, does not say `BLOCKED` naming a seeded file or a
  `vendor/contrib/<P>.patch`.
- **K15′.** At least 8 of 12 seeds are present at review start, in each shape (D2).
- **K16′.** Every pass has a swap record and a completed covering round.
- **K17.** No seed is present at review start and absent at its round's completion without a finding that credits it.
- **C5.** No change notice (an `edited_text_file` attachment) names a `vendor/contrib/*.patch`, read by file name.
- **C6.** No harness string appears in any transcript line (§8, Contamination).
- **C7.** The fixture holds only `refs/heads/*`, `refs/tags/*` and `refs/stash`, and the clean postimage ids are
  absent from its object store at review start and at the close.
- **C10.** No clean-only line of 20 or more characters (a line of a seed's `find` that is not in its `replace`) appears
  in orchestrator-written text or in a run file a reviewer can read that was written before P's review start.

The canary passes when K5, K6′, K7–K10, K11′–K17, C5, C6, C7 and C10 all pass. **C1** is listed for the runner to read,
not gated: the foreign-edit words in orchestrator text, ledger rows, briefs and SendMessages, after masking the
product's own "tamper hook", "tamper notice", "config-tamper" and "tamper check". The runner reads each hit and records
whether it is about the seeds; a hit about the seeds counts as a failed canary. Each record also names, per pass, the
swap and the implementer's apply; each seed's state at build end, at review start and at round completion, and who
removed any; the unit tests red at build end; the C10 quotes; and the measurement's reading, recall included, as a
preview of the calibration (not gated).

**The floor** (D2). Below 8 of 12 seeds present at review start in either shape, the seeds are re-cut before any
pilot: the failed record moves to `superseded-<commit>`, a new instrument commit follows, and both shapes are prepared
again. Any other canary failure gets one fix round, then one more; after that the runs stop and the maintainer
decides.

### Fixture notes

What `evals/replay/v3/` carries, and where it differs from `evals/replay/v2/`.

- **The data set.** `seeds.json`; `patches/` (`base.patch` and the six clean pass patches); `patches-seeded/` (the six
  seeded pass patches); `plan/001-replay.md`; `oracle/oracles.patch` and `oracle/reference-fixes.patch`. The plan
  keeps v2's path, units, passes and service; its interfaces and the contract of record change only where the defects
  below are fixed.
- **The seeds document** keeps the schema string `stamity/replay-seeds/v1` and gains a top-level `arrival: "patch"` and
  `patches: { <pass>: { clean, seeded } }`, the sha256 of each pass's clean and seeded patch. Its `matcher` is
  `{ lineTolerance: 3, severities: ["Critical", "Warning"] }`, as in v1 and v2. Each seed keeps v2's fields (`id`,
  `class`, `severity`, `pass`, `file`, `locate`, `present`, `injection {file, find, replace}`, `span`, `terms`,
  `oracle`); `injection.find` is the clean text in the seed's own file at its pass's postimage, and
  `injection.replace` the seeded text. `seededPatchSet` in `scripts/replay/fixture.mjs` rebuilds the seeded patches
  from the clean chain and the seeds' injections, byte for byte.
- **Why the v2 seeds do not fit v3.** Measured on the six v2 runs' own test suites and v1's four: implementer-written
  tests exposed `cor-page-offset`, `cor-date-boundary` and `sec-missing-guard` in 6 of 6 runs; the three
  test-weakening seeds edited pre-existing gating tests, which every brief forbids; three seeds sat in files their own
  pass's clean patch does not touch; and both security anchors fell to the fixture's own issues in 6 of 6 runs. The
  set below is exposed in 0 of those runs for eleven seeds and in 1 of 6 for one, and a per-pass swap simulation
  applied all six seeded patches with `--3way` and kept 12 of 12 seeds with the gates green.

**The seeds.** Twelve, three per class: security at Critical; correctness, contract and test-weakening at Warning.

| # | Seed | Class, severity | Pass | File | The seeded change | Oracle |
|---|---|---|---|---|---|---|
| 1 | `sec-sort-alternation` | security, Critical | u1-p1 | `src/store/query.ts` | The sort allowlist `/^(?:id\|customer\|total_cents\|status\|created_at)$/` loses its group, `/^id\|customer\|…\|created_at$/`, so any sort value that starts with `id` or ends with `created_at` reaches the `ORDER BY` | vitest: a `sort` carrying a marker never reaches the SQL text |
| 2 | `tw-sort-fallback-vacuous` | test-weakening, Warning | u1-p1 | `test/query.test.ts` | The fallback test's `expect(listOrders(…).map(…)).toEqual([…])` becomes `expect(() => listOrders(…)).toBeDefined()` | static |
| 3 | `cor-count-distinct` | correctness, Warning | u1-p2 | `src/reports/window.ts` | `countWithin` counts distinct instants: `new Set(instants.filter(…)).size` | vitest: `countWithin([t, t, u], …)` is 3 |
| 4 | `tw-count-loose` | test-weakening, Warning | u1-p2 | `test/window.test.ts` | `.toBe(3)` becomes `.toBeGreaterThan(0)` | static |
| 5 | `con-event-time-format` | contract, Warning | u2-p1 | `src/orders/cancel.ts` | The cancel event's `at` uses `toUTCString()` where the contract asks for ISO 8601 UTC | vitest: `at` is ISO 8601 UTC |
| 6 | `tw-event-at-truthy` | test-weakening, Warning | u2-p1 | `test/cancel.test.ts` | The ISO `toMatch` becomes `toBeTruthy()` | static |
| 7 | `con-config-key-case` | contract, Warning | u2-p2 | `config/service.json` | The shipped key is spelt `exportBatchsize`, so the shipped value is never read | vitest |
| 8 | `sec-invoice-other-order` | security, Critical | u3-p1 | `src/orders/invoice.ts` | The invoice-name pattern's `(?:-[1-9][0-9]*)?` becomes `(?:-?[1-9][0-9]*)?`, so order 1 can read `12.pdf` | vitest: another order's file answers 400 or 404 and leaks nothing |
| 9 | `cor-invoice-eacces` | correctness, Warning | u3-p1 | `src/orders/invoice.ts` | An unreadable invoice (`EACCES`) answers 404 like a missing one, where the contract asks for 500 | vitest (POSIX, not root) |
| 10 | `sec-export-alias-unguarded` | security, Critical | u3-p2 | `src/http/routes.ts` | The `/orders/export.csv` alias loses `requireAuth` | vitest: both export paths answer 401 without a token |
| 11 | `cor-export-truncated` | correctness, Warning | u3-p2 | `src/orders/export.ts` | A failing batch read ends the export early and sends the rows so far with 200 | vitest: the answer is 500 |
| 12 | `con-export-doc-header` | contract, Warning | u3-p2 | `docs/api.md` | The contract's header row names `total` where the code writes `total_cents` | static |

**The decoys.** `dec-internal-rename` (u2-p1, `src/orders/format.ts`) and `dec-allowlist-order` (u3-p2,
`src/orders/export.ts`), as in v2, and `dec-test-reason` (now u2-p1, `test/handlers.test.ts`: the reason-commented
change of the missing-order 404's body).

**The data rules**, each pinned by `test/replay/seeds-v3.test.ts`:

- *The leaf rule.* Each seed sits in a file no later pass's patch touches, so no later clean patch shows an earlier
  seed's line as context.
- *The own-hunk rule.* Each seed's `find` is in a `+` line of its own pass's clean patch, and its `replace` in a `+`
  line of its seeded patch.
- *No test covers a seed.* No base test, patch test or test the plan asks for exercises a seed's line (a reviewer's
  judgment). Each test-weakening seed weakens an assertion in new code of the same patch as the product seed it pairs
  with, so the implementer's gates stay green with both in place.
- *A documented break.* Each seed breaks a documented contract or behaviour that a reviewer grades at least Warning.
- *Equal preimages and equal lines.* Each seeded patch names its clean patch's preimage ids and has exactly as many
  lines, and every line outside a seed's hunk keeps its number, because orchestrators ran `wc -l` on the patches and
  cite `<pass>.patch:<n>` in briefs.
- *Presence.* Each seed's `present` rule reads false on every clean state of the chain and on the reference-fixed
  tree, and true on the seeded end; a rule that spans lines uses several `contains` strings, never one multi-line
  string. Its `locate` finds its span in the seeded end.
- *The gates.* The fixture's lint, typecheck and test gates pass on every cumulative seeded state of the chain.
- *The oracles* (`test/replay/oracle-v3.test.ts`, behind `STAMITY_REPLAY_SUITE=1`). The seeded end fails all 12, the
  reference-fixed tree passes all 12, and each fails only for its own seed; `cor-invoice-eacces`'s oracle is skipped,
  with its reason named, on Windows and when run as root.

**The fixture's own defects, fixed in the clean patches**, because every v2 pre-read raised them and the fix took a
security anchor with it:

- `listOrders` breaks ties by id (`, id DESC`), and the paging test pins exact offsets.
- The invoice's `file` query names only the order's own files, `<id>.pdf` or a correction `<id>-<n>.pdf`, through an
  anchored, id-bound pattern; the contract and u3-p1's interfaces say so.
- The export refuses a batch size that is not a positive integer. Its contract states its charset, CRLF, quoting,
  formula escaping and ties, and u3-p2 adds the guarded alias `/orders/export.csv`; both export routes sit at the end
  of the route table.
- The cancel handler lives in `src/orders/cancel.ts` with `test/cancel.test.ts`, and the missing-order 404's body
  change moves from u3-p1 to u2-p1, so u3-p1 no longer touches `src/orders/handlers.ts`.
- The contract says an event's `at` may carry milliseconds.
- u1-p2's patch supplies `listCreatedAt` in a new file, so u1-p2's implementer stays out of `src/store/query.ts`.
- The base `.oxlintrc.json` ignores `.stamity`.
- `vite` goes among the dev dependencies only if the captures show agents adding it.

## §6 Invocation bytes

Byte-identical in both shapes, and v1's bytes: the fixture's plan keeps its path, so the four messages do not change.
Each message is UTF-8 with no trailing newline; the sha256 is over exactly those bytes. The JSON form is the string as
the driver encodes it into the stream-json user message; the fenced form is the same bytes as text (the fence adds
none).

**Start message** — sent once, first. 293 bytes. sha256
`b693f87303116d90879d32b9b15decf56ef18f0a5dd125873070e2fb06edf663`.
JSON form: `"/st-work docs/plans/001-replay.md --effort deep\n\nUnattended run: no operator will answer. At every question, execute its declared default (plan gate: execute now). At the QA checkpoint, emit the what-to-verify summary and record the human sign-off as not performed. Do not open a pull request."`

```text
/st-work docs/plans/001-replay.md --effort deep

Unattended run: no operator will answer. At every question, execute its declared default (plan gate: execute now). At the QA checkpoint, emit the what-to-verify summary and record the human sign-off as not performed. Do not open a pull request.
```

**Resume message** — sent after a forced compaction (§7). 48 bytes. sha256
`5c8e00fbc08eae1925524b31103de39e13f7bcbbf5e1a24db4e155f7e1dcd4dc`.

```text
Continue the /st-work run from where it stopped.
```

**Nudge** — sent when a turn ends before the end condition; at most 3 per run, counted in the results. 101 bytes.
sha256 `cf500a657233bca8721439ad93189fc242573d8e6a995955aeada846c89c20a1`.

```text
This run is unattended; no reply will come. Apply the declared default and continue the /st-work run.
```

**Capacity resume** — sent when a usage-limit hold ends. 75 bytes. sha256
`578284f96aa5a14323dcc0fdd907939e626f582fb7b737701df269b491f8db99`.

```text
The usage limit has reset. Continue the /st-work run from where it stopped.
```

## §7 Compaction

- **Placements.** `u2-p1` and `u3-p1`, as in v1 and v2.
- **Trigger.** v2's trigger, read over the review rounds that cover the placement pass under v3's coverage (§8,
  Covered passes).
  - **A round's members.** A review round opens at its first verdict-role dispatch and stays open until every member
    has stopped. Its members are all the verdict-role agents dispatched while it is open. An agent ended by TaskStop
    counts as stopped.
  - **What a round covers.** The round covers the union of its members' coverage, each read by §8's rule (Covered
    passes). A member that covers nothing by itself still belongs to the round it ran in, so it counts as a member.
    A round may cover the placement pass alone or several passes.
  - **A complete round.** A round is complete for a pass it covers when every member has stopped and at least one
    member covering that pass returned by itself, rather than being stopped.
  - **When the placement fires.** The first round that covers the placement pass is complete, at least two of its
    members returned by themselves, and no fixer has been dispatched for the pass. The driver checks this on each
    poll, and the placement fires only when it holds on two polls in a row. A round that covers both placement passes
    fires one forced compaction, whose record names both passes in `covers`; it is one sample, not two.
- **Sequence.** Interrupt; wait for `result`; snapshot the fixture's `.stamity/runs/`; send `/compact`; wait for
  `compact_boundary` with `trigger:"manual"`; send the resume message (§6).
- **The post-compaction row.** No compaction hook is registered (§3), so the driver writes the post-compaction marker
  row itself from the stream's `compact_boundary`, as `{ event: 'PostCompact', input: { trigger, source: 'stream' } }`,
  for a forced and an automatic compaction alike.
- **Decision rule.** Interrupt mode if the canary (`K-swap-baseline` and `K-swap-changed`) passes K1–K4, and
  auto-window mode otherwise. When the two canary records disagree on the mechanism, both shapes run auto-window
  mode. Auto-window mode sets `CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000`, and an automatic compaction is a sample only
  when its boundary falls inside the window, after a lens delivery and before the next ledger write. One outside the
  window is named in the notes, beside `compaction-loss`, and is no sample. The canary record states which branch
  applied, and every run's RESULTS names it. Choosing the fallback is not an edit of this file.
- **Validity.** A sample with at-risk = 0 (§8, Loss) is recorded and is not valid.

## §8 Metrics

The exact definitions `scripts/replay/measure.mjs` implements under v3. The measurement reads v3 when the seeds
document carries `arrival: "patch"`, and records `version: 'v3'` in its output; a v1 or v2 seeds document never reaches
a v3 rule, and v1's and v2's readings do not change.

- **Role functions**, by sub-agent type: implementer → build; fixer → fix; reviewer, security, performance,
  design-quality → verdict; test-runner → gate; everything else → other. The loop functions are build, fix, verdict and
  gate.
- **Pass attribution.** The first `\bu[1-3]-p[12]\b` in the dispatch description, else a single distinct pass id in
  the prompt; several distinct ids attribute to `multi`. Attribution places an agent's loop characters and sub-agent
  tokens in the per-pass split, and names a compaction sample's pass; what a dispatch builds, reviews or fixes is its
  coverage (below), not its attribution.
- **Branch-level dispatches.** A verdict dispatch is branch-level when (a) its description matches
  `/whole[- ]branch/i` and it was dispatched after an approving delivery by a reviewer whose coverage (below) is not
  empty and that was not built from its sub-agent file, or (b) it was dispatched after an (a) dispatch and before that
  agent's first stop (its first delivery that is not a re-read). Every other verdict dispatch is a loop round; a
  SendMessage keeps its agent's level; an agent built from its sub-agent file is never branch-level. The dispatch's
  prompt is not read for the name. REPLAY-v2's rule, under which every verdict agent dispatched after a branch-level
  dispatch is branch-level too, stays v2's; REPLAY-v1 keeps its own reading.
- **Covered passes.** Beside its attribution, each dispatch records the passes it covers. The rule is `coverageOf` in
  `scripts/replay/measure.mjs` with `{ rule: 'v3' }`. A dispatch's coverage depends only on the events before it, so
  the driver's hook reads the same function over its marker log so far (§5).
  - A build-role dispatch swaps the passes its description names that have no swap yet, and builds them when its
    agent stops (§5). A range in its description swaps and builds every pass in it. A SendMessage continuation swaps
    and builds nothing.
  - A verdict-role dispatch covers the passes its description names that are built. If its description names no pass,
    it covers every pass that is built. A verdict dispatch made before any pass is built covers nothing.
  - A fixer covers the passes its description names. If it names none, it covers every pass covered by the verdict
    agents that returned by themselves before it was dispatched. A fixer dispatched before any review has returned
    covers nothing.
  - Any other dispatch covers nothing. A SendMessage re-review is no dispatch: it keeps the resumed agent's coverage.

  Only a dispatch's description names passes here; its prompt is never read for coverage. A range covers every pass
  between its two ends, inclusive, in pass order, and one named backwards covers the same passes. A range is two pass
  ids whose whole gap is one range mark: `..`, `...`, `…`, an en dash or an em dash, each with optional spaces or tabs
  around it, or the word `to` or `through` between spaces; ranges chain (`u1-p1..u2-p1..u3-p2`). A list (`u1-p1,
  u3-p2`, `u1-p1 and u3-p2`) covers its ids alone. An ASCII hyphen is never a range mark, and neither is a line break.
  So after "Build unit u1-p1" and "Build unit u1-p2" have both stopped, a verdict dispatch naming no pass covers
  exactly those two, and "Review u1-p1..u3-p2" at the same point covers the same two; a verdict dispatch made while
  u1-p2's build agent still runs covers u1-p1 only. The snapshots, the rounds, the verdicts, the round-1 flag, the
  stage and the fixer round count read the covered passes, so a round that reviews several passes counts for each.
- **Loop characters.** Characters are JS string length. The sum, over non-branch agents with a loop function, of
  (a) their deliveries (the notification part or the synchronous tool result) and (b) their Agent prompts and
  SendMessages, excluding resumes (`/^Resume|after the (?:rate limit|stall)/i`, reported separately); plus (c) ledger
  writes (a heredoc, redirect or script body targeting `ledger.jsonl`; a Write, Edit or MultiEdit on `*ledger.jsonl`;
  or a `stamity ledger append|close|status` call) with their tool results; (d) brief files written by the orchestrator
  (`/\/briefs?\/|brief[-\w]*\.md|\/lanes\//`) with their results; and (e) report reads — a Read of a report path
  (`.stamity/runs/*/reports/` or `/tasks/*.output`); a Bash call of class read or search (a file read, or grep, rg,
  …, alone or beside another verb) whose command or result names a report path; or a Grep or Glob call whose path,
  pattern, file glob or result names one — with their results, so a saving cannot move into
  on-demand reads. Driver messages are excluded. **Loop characters per pass = the total ÷ 6.** The per-pass split is
  informative only, and is flagged unreliable when more than 20% is unattributed.
- **Sub-agent tokens per pass** = Σ `processed` over the loop-function agents ÷ 6, where `processed` is the sum, over
  the agent's requests deduplicated by `message.id`, of input + cache-creation + cache-read + output tokens. Output
  tokens and the notification trailer are reported beside it; the trailer is final context, not spend.
- **The swap record.** The measurement reads `run.json`'s `injection` (§5) before any snapshot. A run with no v3
  record is invalid (`no swap record`). A pass of the plan with no entry is uncovered, and the invalid reason reads
  `uncovered pass <P>: no build dispatch named it, so its patch was never swapped and its seeds (<ids>) never arrived`.
  A pass whose state is neither `swapped` nor `already-seeded`, whose `seeded` digest is not the seeds document's, or
  whose `mtimeKept` is not true is a swap defect, and the run is invalid.
- **Recall.** Each seed takes one state of §5 (The seed states). A seed present at review start is in the pooled
  denominator. Uncovered, caught before review and not delivered seeds are not; the last two count as found for
  `security-seeds`. No seed's presence is left open. A `present` rule holds when every `contains` string occurs, no
  `notContains` string occurs, and no `notMatch` pattern matches. Found = matched (§9) by any verdict-role finding
  (return, digest, report, or a ledger row from a verdict source, below) that the credit guard lets credit it, with
  the stage (pass or branch) and whether it was found in round 1 recorded; a finding of a round that covers several
  passes is at the pass stage, and in round 1, for each pass it covers.
  - **A pass no review covered.** Its seeds are read from the last build-end copy taken after P was built (the copy at
    the stop that built it included). A seed present there is in the pooled denominator as a miss: no agent covers P,
    so no finding credits it. A seed absent there was caught before review when an earlier build-end copy after P's
    swap held it, and was not delivered otherwise; either way it leaves the denominator, and a security seed counts as
    found for `security-seeds`. RESULTS names each such seed as never reviewed.
  - **The credit guard, per pass.** A finding credits a seed of pass P only when its agent covers P (Covered passes):
    a return by its agent's coverage, and a report or ledger finding by the coverage of the agent whose digest names
    its report (§8, The report key). An agent covers P only when P was built at its dispatch, so it was dispatched
    after P's swap. So a reviewer dispatched while u2-p1's build agent still runs credits no u2-p1 seed, whatever it
    cites, and the same finding from a verdict agent that covers u2-p1 credits it. A finding that no agent's digest
    names credits a seed of P only when no verdict agent was dispatched before P's swap: the main-transcript line of
    the dispatch whose tool_use id P's swap record names, or, failing that, the first build dispatch whose description
    names P. An agent the measurement builds from its sub-agent file, because the main transcript holds no dispatch for
    it, has no known dispatch time: its findings credit no seed, and a finding no agent's digest names credits none
    beside it. Such a fixer counts as dispatched before every agent whose passes it shares, for the round-1 flag.
  - **No matcher item.** A seed that was in no reviewed tree (uncovered, not delivered, caught before review, or of a
    pass no review covered) is no matcher item: no finding credits it, it enters no adjudication row, and it is never
    read as found by a finding. A finding can meet such a seed's span and a term without finding anything. A finding
    that credits no seed is no seed match for precision and never reads a seed as fixed for loss (below).
  - **RESULTS names** each seed caught before review, not delivered, never reviewed or removed during review, and each
    uncovered pass with its seeds, beside `pooled-recall` and `security-seeds`.
- **Precision.** A decoy is flagged when a Critical or Warning finding matches it. Unmatched counts entries: a
  free-text block, or a structured entry together with its secondary locators and its report row under the same
  report key and id (§9). An entry is unmatched when it holds a Critical or Warning finding with a file and none of its
  findings matches a decoy or credits a seed; an entry that shares a locator with one already counted is not counted
  again. Reported, not thresholded.
- **Loss.** For each driver compaction event, an entry's own locators are every locator of a free-text block, or the
  one locator of a structured entry; a secondary locator (§9) is never an own locator. An entry is at risk when a
  verdict-role agent delivered it before the boundary (transcript order) with a Critical or Warning finding, no row of
  the pre-compaction state snapshot covers any of its own locators, and not all its own locators were already counted
  in this sample. A row covers a locator when it names the same file and a line within ±3, or when its `report` equals
  the report path; a finding with no file is covered by the report-path match or by a row that itself has no file and
  whose text contains the finding's trimmed text, and a row with a file covers only its own location. The entry is lost
  when, as well, no row at run end covers any of its own locators and no finding of the entry, secondary locators
  included, credits a seed whose oracle passes (Recall, above). Loss counts findings, not locators: one free-text
  block with one finding at three locators puts 1 finding at risk, not 3. A sample is valid iff at-risk ≥ 1. Automatic
  compactions (`trigger:"auto"`) are counted; projected compactions per 10 passes = 10 × context tokens per pass ÷
  947,000, reported only.
- **Verdicts per pass.** Rounds = the reviewer's completed deliveries: each one is a round, including one whose text
  carries no verdict word (RESULTS names it); a re-read of an earlier delivery and a failed notification (a status
  other than completed) are not rounds. The final class is `approve` (one round, approve),
  `approve-after-fixes` (more rounds, approve) or `blocked` (the last verdict request-changes, or a `BLOCKED_*`
  return). One review round's final verdict and round count are recorded for every pass the round covers. A pass that
  no review covered, or that was never built, has no covering review: its final class is null and its rounds 0, so
  `verdict-class` reads `none` for it and fails the gate (§10), and `approved-unfixed` counts nothing for it.
  `approvedWithSeedUnfixed` = approved while some seed of the pass has an oracle status other than `pass`; an
  oracle that errors counts as unfixed.
- **The verdict grammar.** One reader serves a delivery's verdict, a digest's `verdict:` value and a report's verdict
  (`verdictOf` in `scripts/replay/findings.mjs` and the delivery reader in `scripts/replay/transcript.mjs`): the word
  `verdict`, then any run of `:`, `*` and whitespace, then an optional backtick or quote, then one verdict word, in any
  case and ending at a word boundary. The verdict words are `approve`; `request` and `changes` joined by `-`, `_` or a
  space; `changes` and `requested` joined the same way; and `blocked`. Every spelling with `changes` reads
  request-changes. A verdict word next to `|`, `/` or `or` and another verdict word is a choice list, not a verdict, so
  `verdict: APPROVE | REQUEST_CHANGES` in a brief reads none and never approves. The first verdict in the text wins.
  So `**Verdict:** REQUEST_CHANGES`, `**Verdict: REQUEST_CHANGES.**`, ``Verdict: `request-changes` (advisory)``,
  `verdict: request changes` and `verdict: changes-requested` read request-changes, while `VERDICT — Approve` and
  `**Verdict:** blockers remain` read none.
- **Ledger sources.** A ledger row is a verdict-role finding when its `source` names a verdict role (`roleFunction` in
  `scripts/replay/transcript.mjs`): the source is lower-cased and split at every character outside `[a-z0-9-]`, a
  leading `stamity-` is dropped from each token, and a token names a role when it equals `reviewer`, `security`,
  `performance` or `design-quality`, or begins with one of them and `-`. The first role named is the row's role; a
  source that names none is not a verdict source. So `reviewer:r1`, `reviewer(frontier whole-branch)`,
  `stamity-reviewer(frontier)` and `fixer+reviewer(C7)+security(3)` are verdict sources, and `implementer:u1-p1` and
  `test-runner+orchestrator-forensics` are not.
- **The report key.** A report path from `.stamity/runs/` onward keys as v2 keys it. A path relative to the run folder
  (`reports/<f>` or `./reports/<f>`) keys as the one state report with that file name. It joins nothing when no run
  folder, or several, holds that name, or when the value is not a single path token ending `.md` (a digest's
  `write refused — …` joins nothing). So `reports/x.md`, `./reports/x.md`, `.stamity/runs/<run>/reports/x.md` and an
  absolute path ending in it give one key. The digest-to-report join, §9's term window, the credit guard and Loss's
  report-path match all use this key.
- **Report placement.** A report finding, or a ledger row that names a report, takes its passes, level, round and
  dispatch line from the agent whose digest names that report. The report's file name is read for its passes only when
  no digest names it. So a report named `branch-reviewer-r1.md` that the digest of a u2-p1-only loop reviewer names
  places its findings at u2-p1, at the pass stage and in that agent's round.
- **The state read.** The measurement reads the fixture's `.stamity/` state as v2 does, and each run's ledger at
  `runs/<id>/ledger.jsonl` and at the flat `runs/<id>.ledger.jsonl` alike.
- **Contamination.** Read over every line of the main transcript and of every sub-agent transcript. C5: an attachment
  of type `edited_text_file` whose `filename` ends with `vendor/contrib/<pass>.patch` is a change notice naming a
  swapped patch. C6: a line that holds `REPLAY_`, `marker-hook`, `seeds.json`, `stamity-replay`, `replay@invalid`,
  `evals/replay` or any path the driver passes as `--forbid` (the instrument checkout and the private layer's
  checkout) carries a harness string. Either makes the run invalid, and the reason names the first file and line.
- **Invalid run.** An init or sub-agent model outside the pins; a forbidden path (this checkout, the private layer,
  `seeds.json`, `__oracle__`, `reference-fixes` or `patches-seeded`) in any tool input; a contamination (C5 or C6,
  above); a run whose end reason is not `complete`; a run whose ambient lists differ from its shape's pilot (§3); a run
  whose `run.json` carries no v3 swap record, or with a swap defect (above); a run with an uncovered pass, one of the
  plan's passes with no swap record (§5); or a capture defect, meaning a seed whose file is absent from every copy of
  its pass's review-start snapshot (§5).

## §9 Matcher

Deterministic, with no model call. A finding matches a seed or a decoy when all three hold:

1. the file is equal;
2. the finding's line range intersects the item's span widened by ±3 lines;
3. at least one of the item's accepted terms occurs in the finding's text (case-insensitive substring), read as the
   rules below say.

Only a Critical or Warning finding credits a seed (the seeds document's `matcher.severities`, as in v1 and v2): a
seed a reviewer names only at Minor is not found (§15).

**Reading a severity.** A severity word governed by a negation is no severity. That is a severity word, or a run of
them joined by `or`, `and` or `nor`, that follows `no`, `zero`, `0`, `none of the` or `without`, with `new`,
`remaining`, `open` or `further` allowed in between; and the count forms `Critical: 0` and `0 Critical` (and the same
for Warning). So `src/config/load.ts:15 — fix held. No Critical findings.` yields no finding, while `Warning: no tests
at src/a.ts:3` is still a Warning, and `no Critical, but a Warning at x:3` still yields the Warning. The mask never
reaches across a line break. A finding's text keeps its words; only the severity reading skips them.

**Reading a term.** Every locator in the finding's text (a path with a line, and a prose `line 20`) is blanked before
the term test, and for a term with no slash every other path too. A term found only inside the finding's own locator
credits nothing, and the finding goes to the adjudication list when its location matches. An all-digit term matches
only as a number of its own: `20` is read in "the default is 20 vs 50", and never in `220`, `20ms`, `1.20` or `:20`.

**One term window in both shapes.** A finding's terms are read over its own entry. For a structured finding (a
digest line or a ledger row) that is its summary plus the matching entry of its report's `stamity-findings` block,
joined through the report key (§8); for a free-text finding it is its own block. Neither shape reads report prose
around the entry.

**Secondary locators.** A structured finding (a digest entry, a `stamity-findings` row inline or in a report, or a
ledger row read by its head locator) has one own locator. Its secondary locators are the other full-path locators in
its term window: its summary plus its matching report row, or for a ledger row the text after the head. A full-path
locator is a path with a line, whose path, once made relative to the roots (Locators, below), names at least one
directory; a bare file name such as `window.test.ts:17` is none. Each secondary locator yields a finding that copies
the entry's severity, role, source, report, id, passes, level, round, delivery and dispatch lines and term window,
marked secondary. It matches seeds, decoys and the adjudication list as a free-text locator does. It never counts twice
for unmatched or precision (§8, Precision), is never at risk and never covers anything for loss (§8, Loss). A
secondary locator on the finding's own line, or a summary that repeats its own locator (`:11:5` included), adds
nothing. So the digest entry `W-1 src/x.ts:40 — the assertion at test/x.test.ts:22 was loosened` credits a
test-weakening seed at `test/x.test.ts:22` whose term is in the window, and counts once for unmatched and precision.

**The item's span.** An item that carries `locate.text` is located in each reviewed snapshot copy: every line that
holds the text gives the span `[line + locate.from, line + locate.to]`, the lines a reviewer of that tree cites. The
seeds document's `span` is the fallback when no searched copy holds the line, and the span of an item with no
`locate.text`. A finding matches only the spans located in the copies (`snapshots/<pass>/`) of the passes its agent
covers (§8, Covered passes, and the credit guard): a return by its agent's coverage, and a report finding or a ledger
row by the coverage of the agent whose digest names its report. A finding of an agent that covers nothing matches no
span. A report finding or a ledger row that no agent's digest names matches the spans located in the copies of the
passes its report's file name names (§8, Report placement); only one that names no single pass that way (a ledger row
with no report, a report whose name names several passes or none) matches against the spans located in the copies of
every pass. Either way it credits a seed only as the credit guard allows.

**Locators.** Before the file comparison, a finding's locator is made relative to every root it may be spelled
under: the fixture root (each working directory the transcripts and the init event record), each worktree path the
run's `run.json` lists, and each absolute path that ends in a snapshot copy's worktree name — each in its given and its
resolved spelling, with `/var/…` and `/private/var/…` alike.

A location match without a term goes to the adjudication list, never to the score. The sources are verdict-role
returns and reports, plus ledger rows whose `source` names a verdict role (§8, Ledger sources).

## §10 Samples

- 1 pilot plus 3 scored runs per shape, on Claude Code. A shape whose three scored runs differ by more than 2 seeds
  found (max − min) gets 2 more scored runs, 5 in all. Pilots are not scored. v1's two pilots and REPLAY-v2's pilot
  are not counted.
- The pilots calibrate the fixture: the baseline pilot's pooled recall must lie in [0.5, 0.95]. Out of that band, the
  runs stop, the cause is recorded, and the seeds are cut again before any scored run, which means a new instrument
  commit and restarted pilots.
- The sub-agent-token bar compares the changed shape's mean per pass over its scored runs with the baseline shape's
  mean. The loop-character bar binds every changed scored run against the baseline median. A security seed is
  exempt when at least one baseline scored run missed it.
- An incomplete, contaminated or pin-drifted run is invalid and replaced, at most 2 replacements per shape. Beyond
  that, the rows it feeds are not evaluated and the merge gate fails.
- A run with an uncovered pass (§5, §8) is invalid too. A baseline run is replaced as above. A changed scored run
  invalid only for an uncovered pass is not replaced: the rows the changed shape feeds are not evaluated and the merge
  gate fails, because a changed shape that reviews less is what the replay measures, and a replacement would hide it.
- Runs go one at a time, alternating shapes, under the frozen instrument and mechanism (§13), and no full test suite,
  docs-site build or eval run shares the machine with a live run.

## §11 Placement

Results go under `evals/replay/v3/runs/<date>-replay-<n>/` (`RESULTS.md`, `summary.json`) and the comparison under
`evals/replay/COMPARISON-v3.md`. Every command that reads or writes results runs with `--protocol v3`
(`node scripts/replay/score.mjs run|check|compare --protocol v3`, and `node scripts/replay/fixture.mjs --protocol v3`);
the paths come from `PROTOCOLS.v3` in `scripts/replay/protocols.mjs`, and the default protocol stays v1. A v3 command
never reads v1's results in `evals/replay/runs/` or v2's in `evals/replay/v2/runs/`, and a folder holding runs of more
than one protocol is refused. Never under `evals/runs/`, and never named `-run-<n>`: the eval set's run of record is
the newest `<date>-run-<n>` directory under `evals/runs/`, and a replay result there would displace it.

## §12 Thresholds

A committed `evals/replay/COMPARISON-v3.md` whose `Merge gate:` line reads PASS binds the release that first ships
REPLAY-v3's comparison, which is Package 17's release; REPLAY-v2 produced no comparison. That line keeps its name. It
reads PASS only when every row holds, except `eval-set-floors`, which is carried; a row that is not evaluated counts as
a FAIL. Recall rates are scaled to 36 seed opportunities (12 seeds × 3 scored runs; a shape with 5 scored runs has 60
opportunities, 12 × 5, and its rate is scaled to 36 before the comparison), and both shapes' denominators are printed
beside each rate, because implementers catch different seeds and a seed caught before review or not delivered leaves
its denominator. An uncovered seed (§8) enters no pooled denominator, because its run is invalid.

| Row | Rule | Keys |
|---|---|---|
| `security-seeds` | Every security seed is found in every changed scored run; a seed is exempt when at least one baseline scored run missed it; a security seed caught before review or not delivered (§5, §8) counts as found | `securityAllRuns`, `securityExemption` |
| `pooled-recall` | Pooled seeded recall: changed ≥ baseline − 1 of 36 | `recallMargin`, `recallOpportunities` |
| `decoy-flags` | Decoys wrongly flagged Critical or Warning, compared per scored run: the changed shape's rate (flags ÷ its scored runs) ≤ the baseline's rate; at 3 scored runs each this equals the raw pooled comparison | `decoyFlags` |
| `compaction-loss` | 0 findings lost across a forced compaction in every valid changed sample, with at least 1 valid sample | `lossPerValidSample`, `minValidSamplesChanged` |
| `verdict-class` | The same modal final class on ≥ 5 of 6 passes | `verdictClassMinPasses` |
| `verdict-rounds` | On every pass, the absolute difference between the two shapes' median rounds over their scored runs is ≤ 1 | `roundsTolerance` |
| `approved-unfixed` | Passes approved with a seed still unfixed, compared per scored run: the changed shape's rate (count ÷ its scored runs) ≤ the baseline's rate; at 3 scored runs each this equals the raw pooled comparison | `approvedUnfixed` |
| `loop-chars` | Loop characters per pass in every changed scored run ≤ 0.5 × the baseline median | `loopCharsRatioMax`, `loopCharsReference`, `loopCharsScope` |
| `subagent-tokens` | The changed shape's mean sub-agent tokens per pass ≤ 1.2 × the baseline's mean | `subagentTokensRatioMax`, `subagentTokensScope`, `subagentTokensReference` |
| `eval-set-floors` | Carried: checked at the 1.10.0 baseline run of the eval set (plan 010 file 2), outside the replay | `evalSetFloors` |

The matcher's line tolerance is `lineTolerance` (§9). The sample rule is `scoredRunsPerShape`, `scoredSpreadSeeds` and
`scoredRunsIfVariance` (§10). The calibration band [0.5, 0.95] is §10's, as in v2.

The machine block below is the one the scorer reads. It is the only `replay-thresholds` block in this file, and it is
REPLAY-v2's byte for byte, whose values are v1's, key for key: the floor declared before any run does not move.

```replay-thresholds
{"schema":"stamity/replay-thresholds/v1","lineTolerance":3,"securityAllRuns":true,"recallMargin":1,"recallOpportunities":36,"decoyFlags":"<=baseline","lossPerValidSample":0,"minValidSamplesChanged":1,"verdictClassMinPasses":5,"roundsTolerance":1,"approvedUnfixed":"<=baseline","loopCharsRatioMax":0.5,"loopCharsReference":"baseline-median","loopCharsScope":"every-scored-run","subagentTokensRatioMax":1.2,"subagentTokensScope":"pooled-mean","subagentTokensReference":"baseline-mean","scoredRunsPerShape":3,"scoredSpreadSeeds":2,"scoredRunsIfVariance":5,"securityExemption":"any-baseline-scored-run-missed","evalSetFloors":"carried-to-session-2"}
```

## §13 Refusals

A run is refused before it starts on:

- a dirty `evals/replay/` or `scripts/replay/`;
- an instrument commit other than the pinned one;
- a binary drift (a client binary whose sha256 differs from the recorded one) or a config drift (a client folder or
  settings file that differs from the recorded one, or fails §3).

The instrument commit is the package branch's head once every public unit of plan 012 has landed, its review loop has
converged, its spec delta is merged and its gates and CI are green. The instrument freezes when the first pilot starts.
Its commit is named in the first pilot's `run.json`, not in this file. After it, nothing under `scripts/replay/` or
`evals/replay/` changes except exported runs under `evals/replay/v3/runs/` and `COMPARISON-v3.md`, or the pilots
restart. A re-cut of the seeds, at the canary's floor (§5) or at the pilot's band (§10), is a new instrument commit
with both shapes prepared again. Every result records the instrument commit and the sha256 of this file.

## §14 Closing line and change rule

"No threshold moved." closes every RESULTS file and the comparison. A gap a pilot finds is never fixed by editing this
file after the first v3 result: it is recorded, or it restarts the pilots under `REPLAY-v4`. The canary record states
which §7 branch applied, and the RESULTS of every run name it.

## §15 Threats to validity

- **An implementer may catch a seed while it builds.** The implementer applies the seeded patch itself, and may read
  a seeded line and fix it, or write a test of its own that exposes it. Such a seed is caught before review, or not
  delivered when no build-end copy after its swap ever held it (§5): either way it leaves the denominator rather than
  scoring as a miss, a security seed counts as found for `security-seeds` without any review having run, and it
  measures the build, not the review. The seed set was cut on the v2 and v1 runs' own tests so that almost none is
  exposed that way (§5, Fixture notes), and K15′ needs at least 8 of 12 present at review start in each canary.
- **The orchestrator may remember a clean patch.** Research and planning read the clean patches before any swap, and
  an orchestrator can compare an implementer's diff with a hunk it remembers. That memory cannot be removed. The
  canary's C1 and C10 look for it, and it would favour the shape that reads more.
- **Clean text may sit in research output.** Research reports, plan cells and briefs written before a swap can quote
  a clean hunk where a reviewer later reads it. C10 counts such quotes in the canary; in a scored run they stay a
  residual.
- **A seed named only at Minor is not found.** The matcher credits Critical and Warning findings only (§9). Each seed
  breaks a documented contract or behaviour so that a reviewer grades it at least Warning, the canary previews recall,
  and the pilot's band stops the runs if recall falls under 0.5.
- **A lane made after a swap holds no patch.** The swap rewrites `vendor/contrib/<P>.patch` only in the worktrees that
  hold it at the build dispatch, and a worktree made later has no untracked `vendor/` at all. None was made in ten
  runs. K11′ and K16′ check the arrival in the canary, and a pass no build description names invalidates its run.
- **The swap leaves traces outside the change notice.** A rewritten patch keeps its line count and its times, but its
  size and ctime change, and `ls -l` or `stat` shows them. No run of this fixture used `stat`, `fsck`, `reflog`,
  `for-each-ref` or `ls-files -v` before an anomaly.
- **Harness channels remain.** The settings path in `ps`, and the replay home and client folders an agent could list,
  are not closed. C6 makes any run whose transcript shows a harness string invalid; none of the ten runs looked.
- **The margin is smaller than the noise.** With 12 seeds, only a recall difference of about 0.2 is likely to show,
  and the gate's margin of 1 of 36 is strict and sensitive to sampling noise. It stays as declared: the thresholds do
  not move.
- **The reader keeps residual asymmetries.** A free-text block that folds several findings into one term window lets
  a term of one finding credit another's locator. Report prose outside the `stamity-findings` entry is not read (§9),
  so a shape that writes its reasons there loses terms the other shape puts in its entry. A whole-branch review that
  is also the last loop re-review reads as branch-level, so its characters leave the loop figure and its verdict is no
  loop round.
- **A finding credits only the passes its agent covers** (§8, the credit guard; §9, The item's span). A reviewer
  dispatched beside a running implementer may meet and cite that pass's seeds, and credits none of them, because the
  pass was not built at its dispatch. The rule is the same in both shapes, and it costs recall to a shape that reviews
  beside a running build. A pass no review covered keeps its present seeds in the denominator as misses.
- **A whole-branch review before any approval counts as a loop round** (§8, Branch-level dispatches). Its characters
  count in the loop and its verdict counts for the passes it covers, where a reader might call it branch-level.
- **One round's verdict counts for every pass it covers.** A shape that reviews all six passes in one round gives six
  equal verdicts, so `verdict-class` and `verdict-rounds` compare a round with a pass where the shapes review
  differently.
- **The round-completion copy lags its round.** It is taken on the second poll after the round closes, so a fixer
  that removes a seed faster than that shows in it as a removal during review. The score does not move, because
  presence is read at review start; only K17 and the "removed during review" note read that copy.
- **The negation mask can hide a real finding** in a sentence it misreads. It stays on one line, and RESULTS keeps the
  count of free-text blocks it could not read, beside `pooled-recall`.
