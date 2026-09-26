# Replay protocol v2 — `REPLAY-v2`

The protocol and the thresholds of the replay that gates the 1.10.0 tag: the changed `/st-work` of Package 16 against
the 1.9.1 one, on a fixture where the seeds reach review. It implements REQ-CTX-015 as plan
`docs/plans/011-replay-v2.md` amends it. This file is committed before the first v2 result and is never edited
afterwards: a gap a pilot finds is recorded against this file as it stands (§7, §14), or it restarts the pilots under a
new protocol, `REPLAY-v3`.

`REPLAY-v1` stays frozen, and its two pilots stay unscored evidence in `evals/replay/runs/`. Its seeds sat in the
contrib patches the units applied, so the orchestrator's reading of the plan caught every seed before any review, and
the replay could not score review. v2 keeps v1's shapes, pins, messages, samples and thresholds. What changes:

- **The seeds arrive at review.** The units start clean. At the first review dispatch that covers a pass, the driver
  commits that pass's seeds and snapshots the tree (§5).
- **The fixture** is `evals/replay/v2/` (§5, Fixture notes).
- **Scoring.** A negated severity word is no severity, a term inside the finding's own locator credits nothing, one
  term window serves both shapes, and one review round's verdict counts for every pass the round covers (§8, §9).
- **Compaction** is placed per review round (§7).
- **§8's invalid-run sentence** names all three forbidden terms.
- **Runs and the comparison** live under v2's own paths (§11).
- **Threats to validity** are written down (§15).

## §1 Scope

- Not an eval-set run. The replay measures one thing: whether the changed shape of `/st-work` keeps the decisions the
  1.9.1 shape makes while it spends fewer characters in the orchestrator's loop. It uses no rubric, no judge model and
  no case from `evals/cases-*`.
- The eval set runs once as the new baseline at the 1.10.0 cut (plan `docs/plans/010-enterprise-release-02.md`). Its
  floors are not the replay's to measure, so the `eval-set-floors` row is carried, not measured (§12).
- The replay runs `/st-work` at the deep tier over a three-unit, six-pass plan on a disposable fixture, with twelve
  seeds injected at review and three decoys, on Claude Code only, one run at a time. Cursor, GitHub Copilot CLI and
  Codex are not replayed: the driver speaks Claude Code's stream-json only.

## §2 Shapes

- `baseline` is the CLI built at `fed39ac` (`fed39ac4efe545da298e8b07fe0e2d4b0e2aa041`, the 1.9.1 tree after its
  cleanup merge).
- `changed` is the CLI built at the package branch's commit at the instrument freeze (§13): every public unit of plan
  011 landed, together with plan 010's `hook-row-timeout` and `card-read-caps`, because the resume card is part of what
  is measured. Each run records the sha it built.
- Both are installed into the fixture as `npm pack` tarballs (§4). The emitted setup is the only difference between the
  shapes: the fixture, the plan, the injections, the client, the model, the argv, the environment and the invocation
  bytes (§6) are identical.

## §3 Pins

- **Client.** Claude Code 2.1.280, run from a copied binary whose sha256 is recorded, with `DISABLE_AUTOUPDATER=1` in
  the child's environment. `claude --version` and the init event's `claude_code_version` must both read `2.1.280`.
- **Models.** The orchestrator runs on `--model claude-opus-5-5`. Every sub-agent's `message.model` is recorded; an
  alias resolving to another model voids the run. The orchestrator's effort is the client default, recorded from the
  init event.
- **Account and client folder.** `CLAUDE_CONFIG_DIR` is the operator's own logged-in client folder (plan 011's
  decision R2). The replay shares that login the way a second terminal would, and no credential is copied: a copied
  OAuth credential can be invalidated when either copy refreshes it.
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
  variable is dropped.

## §4 Install

For each shape: `git worktree add --detach <tmp>/cli-<shape> <sha>`, then
`npm ci && npm run build && npm pack --pack-destination <dir>`. The tarball's sha256 is recorded. Never `git stash`:
the stash is one stack shared by every linked worktree.

Before the canary, v1's prepared shapes move aside inside the replay home and are never deleted. The pinned client
binary stays where it is.

## §5 Fixture

- Built by `node scripts/replay/fixture.mjs --protocol v2` from `evals/replay/v2/` under the OS temp directory, never
  inside this repository. Its base commit S0 is deterministic: fixed author, committer and dates, and `-c` flags that
  override the operator's global git config.
- The plan `docs/plans/001-replay.md` holds six passes, `u1-p1 → u1-p2 → u2-p1 → u2-p2 → u3-p1 → u3-p2`, as a single
  `depends_on` chain in both shapes: attribution and placement stay deterministic, and no parallel lane runs.
- **The units start clean.** Each pass's contrib patch under `vendor/contrib/` adds correct code. No patch, no line of
  the plan and no file the plan's `reads:` names holds a seed, because the seeds do not exist until review.
- The fixture never contains `seeds.json`, the oracles or the reference fixes.

**Injection.** A review dispatch covers the one pass its description names (the first pass id, as §8's attribution
reads it), else the distinct pass ids its prompt names. When the first verdict-role dispatch that covers a pass starts,
whether it covers one pass or several, the driver's hook does this for each covered pass not yet injected, all in the
same hook call and before the reviewer's first tool call:

1. For each seed of the pass, replace the seed's `injection.find` with its `injection.replace`, once, in every
   worktree of the run. The `find` text occurs exactly once in its file on the clean chain.
2. Commit the change under the fixed replay author, with the message `replay: <pass> review fixture`.
3. Record each seed in the run journal as `injected` or `not injected (anchor missing)`.
4. Snapshot the pass (`captures/snapshots/<pass>/`).

A commit is used, not a working-tree edit, because reviewers read the branch diff. A pass is injected once. The hook
has 120 seconds; a hook that runs out records a partial injection, and the driver marks the run invalid, to be
replaced (§10).

**A seed that is not injected.** A seed whose anchor is missing is recorded as not injected, and it leaves the recall
denominator: it is never scored as found or missed. The measurement reads this from the snapshot, which the hook takes
after the injection. The seed's defect is absent there, so §8 files it as absent at the pass. Two cases read
otherwise, and the snapshot's reading stands: a unit that wrote the seeded text itself leaves the seed present, and it
is scored like any other; a unit that removed or renamed the seed's file leaves its presence unknown, and it stays in
the denominator (§8, Recall).

**Canary.** Before any pilot, one canary run per shape (`K-inject-baseline`, `K-inject-changed`) proves the
mechanics on the pinned client. Its new checks: at least 10 of 12 seeds injected in each shape (K11); each covered
pass's snapshot exists, and each injected seed reads present in it (K12); at least one verdict-role finding cites an
injected file (K13); the orchestrator does not end blocked over the injected commit (K14). K11's record also names,
per injected pass, every unit test the injection turned red (§15). If K11 falls below 10 of 12 in either shape, the
fallback, where the seeds arrive as a prepared change set, is written as a revised protocol before any pilot.

### Fixture notes

What `evals/replay/v2/` carries over from `evals/replay/v1/`, and where it differs.

- **Copies of v1.** `patches/base.patch` and `oracle/oracles.patch` are v1's, byte for byte. The three decoys are v1's
  unchanged. Each seed keeps v1's `id`, `class`, `severity`, `pass`, `file`, `locate`, `span`, `terms` and `oracle`,
  with the changes below.
- **The pass patches** are v1's with the seeded hunks taken out, so a unit that applies one adds correct code.
  `oracle/reference-fixes.patch` is the injections turned around.
- **The plan** is v1's, with the same units, reads and contract of record. One line differs: u2-p1's interfaces say
  the cancel route sits behind `requireAuth`, because the clean route carries the guard.
- **Each seed gains an `injection`** (`file`, `find`, `replace`): the clean text in the seed's own file and the
  seeded text it becomes.
- **sec-sql-sort.** The clean `listOrders` checks `sort` against an allowlist written inside the `column` line
  itself. The injection replaces that line and the query with v1's seeded query, so it leaves no unused allowlist
  behind, and the injected `src/store/query.ts` is v1's seeded file. Its `present` gains
  `notMatch: ["\\.(has|includes)\\(\\s*sort\\s*\\)"]`: a fix that tests `sort` against a list, and keeps the
  interpolation, reads as fixed (`build/365`).
- **sec-path-traversal.** Its `present` gains `notMatch: ["(?:\\.test|basename)\\(\\s*file\\s*\\)"]`. The clean guard
  checks the file name and keeps `readFile(join(dir, file))`, so v1's `contains` alone read the clean and the fixed
  trees as present. Every presence rule must read false on the reference-fixed tree, so this rule needs the
  `notMatch` too, although the plan's list of changes did not name it (`review/90`).
- **Terms.** No bare generic term remains. sec-missing-guard's `guard` becomes `unguarded`, and its bare term `auth`
  becomes `authenticat` and `authoriz`, so it no longer credits a finding that names `requireAuth`, which every route
  line of the file names.
- **Presence.** Every presence rule reads false on each clean state of the chain and on the reference-fixed tree, and
  true once the seed is injected (`test/replay/seeds-v2.test.ts`). The injected tree fails all 12 oracles, and the
  reference-fixed tree passes them (`test/replay/oracle-v2.test.ts`, behind `STAMITY_REPLAY_SUITE=1`).

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

- **Placement.** Per review round, not per pass: the run's first review round, whichever passes it covers. One round
  gives one sample.
- **Trigger.** v1's trigger, read per round: it fires when every verdict-role agent dispatched for that round has
  stopped, at least two of them have returned, and no fixer has been dispatched for a pass the round covers.
- **Sequence.** Interrupt; wait for `result`; snapshot the fixture's `.stamity/runs/`; send `/compact`; wait for
  `compact_boundary` with `trigger:"manual"`; send the resume message (§6).
- **Decision rule.** Interrupt mode if the canary (`K-inject-baseline` and `K-inject-changed`) passes K1–K4.
  Otherwise the auto-window mode: `CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000`, where an automatic compaction is a sample
  only when its boundary falls inside the window, after a lens delivery and before the next ledger write. One outside
  the window is named in the notes, beside `compaction-loss`, and is no sample. The canary record states which branch
  applied, and every run's RESULTS names it. Choosing the fallback is not an edit of this file.
- **Validity.** A sample with at-risk = 0 (§8, loss) is recorded and is not valid. With the seeds now reaching review,
  findings sit at risk at the boundary, which is what makes a sample valid.

## §8 Metrics

The exact definitions `scripts/replay/measure.mjs` implements.

- **Role functions**, by sub-agent type: implementer → build; fixer → fix; reviewer, security, performance,
  design-quality → verdict; test-runner → gate; everything else → other. The loop functions are build, fix, verdict and
  gate.
- **Pass attribution.** The first `\bu[1-3]-p[12]\b` in the dispatch description, else a single distinct pass id in
  the prompt; several distinct ids attribute to `multi`. **Branch-level** dispatches are verdict dispatches after
  `u3-p2`'s last reviewer approval that carry no single id, or that match `/whole[- ]branch/i`.
- **Covered passes.** Beside its attribution, each dispatch records the passes it covers: the one pass its description
  names, else the distinct pass ids its prompt names. A `multi` dispatch covers every pass it names. The verdicts, the
  round-1 flag, the stage, the fixer round count and the capture-defect check read the covered passes, so a round that
  reviews several passes counts for each of them.
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
- **Recall.** A seed is present at pass P iff its `present` rule holds in some copy under `snapshots/P/` (the main
  checkout or any worktree); otherwise it is "caught by implementer" and leaves the denominator. A `present` rule holds
  when every `contains` string occurs, no `notContains` string occurs, and no `notMatch` pattern matches. Found =
  matched (§9) by any verdict-role finding (return, digest, report, or a ledger row from a verdict source), with the
  stage (pass or branch) and whether it was found in round 1 recorded; a finding of a round that covers several passes
  is at the pass stage, and in round 1, for each pass it covers.
  Presence is unknown, and the seed is neither "caught by implementer" nor absent at the pass for `security-seeds`
  (§12), in two cases: pass P has no snapshot at all, or the seed's file is absent from every copy under an existing
  `snapshots/P/`. A seed whose presence is unknown stays in the denominator; it counts as found only when a
  verdict-role finding matches it (§9), and otherwise it is not found. RESULTS names each such pass, and in the second
  case the file. A seed that was not injected (§5) is read the same way, from its pass's snapshot.
- **Precision.** A decoy is flagged when a Critical or Warning finding matches it. Unmatched = Critical or Warning
  findings matching no seed or decoy, deduplicated by block; reported, not thresholded.
- **Loss.** For each driver compaction event, at-risk = the verdict-role Critical or Warning findings delivered before
  the boundary (transcript order) with no ledger row in the pre-compaction state snapshot (same file and a line within
  ±3, or `report` equal to the report path; a finding with no file is covered by the report-path match or by a row
  that itself has no file and whose text contains the finding's trimmed text, and a row with a file covers only its
  own location). Lost = at-risk, no row at run end, and not a seed whose oracle passes. A
  sample is valid iff at-risk ≥ 1. Automatic compactions (`trigger:"auto"`) are counted; projected compactions per
  10 passes = 10 × context tokens per pass ÷ 947,000, reported only.
- **Verdicts per pass.** Rounds = the reviewer's completed deliveries: each one is a round, including one whose text
  carries no verdict word (RESULTS names it); a re-read of an earlier delivery and a failed notification (a status
  other than completed) are not rounds. The final class is `approve` (one round, approve),
  `approve-after-fixes` (more rounds, approve) or `blocked` (the last verdict request-changes, or a `BLOCKED_*`
  return). One review round's final verdict and round count are recorded for every pass the round covers, so "the
  same class on 5 of 6 passes" (§12) still counts six passes when a shape reviews them together.
  `approvedWithSeedUnfixed` = approved while some seed of the pass has an oracle status other than `pass`; an
  oracle that errors counts as unfixed.
- **Invalid run.** An init or sub-agent model outside the pins; a forbidden path (this checkout, the private layer,
  `seeds.json`, `__oracle__` or `reference-fixes`) in any tool input; or a run whose end reason is not `complete`.

## §9 Matcher

Deterministic, with no model call. A finding matches a seed or a decoy when all three hold:

1. the file is equal;
2. the finding's line range intersects the item's span widened by ±3 lines;
3. at least one of the item's accepted terms occurs in the finding's text (case-insensitive substring), read as the
   rules below say.

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
digest line or a ledger row) that is its summary plus the matching entry of its report's `stamity-findings` block; for
a free-text finding it is its own block. Neither shape reads report prose around the entry.

**The item's span.** An item that carries `locate.text` is located in each reviewed snapshot copy: every line that
holds the text gives the span `[line + locate.from, line + locate.to]`, the lines a reviewer of that tree cites. The
seeds document's `span` is the fallback when no searched copy holds the line, and the span of an item with no
`locate.text`. A finding attributed to a pass matches only the spans located in that pass's copies
(`snapshots/<pass>/`); only a finding attributed to no single pass (a ledger row with no report, a multi-pass or a
branch finding) matches against the spans located in the copies of every pass.

**Locators.** Before the file comparison, a finding's locator is made relative to every root it may be spelled
under: the fixture root (each working directory the transcripts and the init event record), each worktree path the
run's `run.json` lists, and each absolute path that ends in a snapshot copy's worktree name — each in its given and its
resolved spelling, with `/var/…` and `/private/var/…` alike.

A location match without a term goes to the adjudication list, never to the score. The sources are verdict-role
returns and reports, plus ledger rows whose `source` is a verdict role.

## §10 Samples

- 1 pilot plus 3 scored runs per shape. A shape whose three scored runs differ by more than 2 seeds found (max − min)
  gets 2 more scored runs, 5 in all. Pilots are not scored. v1's two pilots are not counted.
- The pilots calibrate the fixture: the baseline pilot's recall must lie in [0.5, 0.95]. Out of that band, the seeds
  are cut again before any scored run, which means a new instrument commit and restarted pilots.
- The sub-agent-token bar compares the changed shape's mean per pass over its scored runs with the baseline shape's
  mean. The loop-character bar binds every changed scored run against the baseline median. A security seed is
  exempt when at least one baseline scored run missed it.
- An incomplete, contaminated or pin-drifted run is invalid and replaced, at most 2 replacements per shape. Beyond
  that, the rows it feeds are not evaluated and the merge gate fails.

## §11 Placement

Results go under `evals/replay/v2/runs/<date>-replay-<n>/` (`RESULTS.md`, `summary.json`) and the comparison under
`evals/replay/COMPARISON-v2.md`. Every command that reads or writes results runs with `--protocol v2`
(`node scripts/replay/score.mjs run|check|compare --protocol v2`); the paths come from `scripts/replay/protocols.mjs`.
A v2 command never reads v1's results in `evals/replay/runs/`, and a folder holding runs of both protocols is refused.
Never under `evals/runs/`, and never named `-run-<n>`: the eval set's run of record is the newest `<date>-run-<n>`
directory under `evals/runs/` (`test/evals/rubricCoreHash.test.ts:36-44`), and a replay result there would displace
it.

## §12 Thresholds

The 1.10.0 tag waits for a committed `evals/replay/COMPARISON-v2.md` whose `Merge gate:` line reads PASS. That line
keeps its name. It reads PASS only when every row holds, except `eval-set-floors`, which is carried; a row that is not
evaluated counts as a FAIL. Recall rates are scaled to 36 seed opportunities (12 seeds × 3 scored runs; a shape with 5
scored runs has 60 opportunities, 12 × 5, and its rate is scaled to 36 before the comparison), and both shapes'
denominators are printed beside each rate, because implementers catch different seeds and a seed that is not
injected leaves its denominator.

| Row | Rule | Keys |
|---|---|---|
| `security-seeds` | Every security seed is found in every changed scored run; a seed is exempt when at least one baseline scored run missed it; a security seed the implementer removed before the lens started (absent at the pass, §8) counts as found | `securityAllRuns`, `securityExemption` |
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
`scoredRunsIfVariance` (§10).

The machine block below is the one the scorer reads. It is the only `replay-thresholds` block in this file, and its
values are v1's, key for key: the floor declared before any run does not move.

```replay-thresholds
{"schema":"stamity/replay-thresholds/v1","lineTolerance":3,"securityAllRuns":true,"recallMargin":1,"recallOpportunities":36,"decoyFlags":"<=baseline","lossPerValidSample":0,"minValidSamplesChanged":1,"verdictClassMinPasses":5,"roundsTolerance":1,"approvedUnfixed":"<=baseline","loopCharsRatioMax":0.5,"loopCharsReference":"baseline-median","loopCharsScope":"every-scored-run","subagentTokensRatioMax":1.2,"subagentTokensScope":"pooled-mean","subagentTokensReference":"baseline-mean","scoredRunsPerShape":3,"scoredSpreadSeeds":2,"scoredRunsIfVariance":5,"securityExemption":"any-baseline-scored-run-missed","evalSetFloors":"carried-to-session-2"}
```

## §13 Refusals

A run is refused before it starts on:

- a dirty `evals/replay/` or `scripts/replay/`;
- an instrument commit other than the pinned one;
- a binary drift (a client binary whose sha256 differs from the recorded one) or a config drift (a client folder or
  settings file that differs from the recorded one, or fails §3).

The instrument freezes when the first pilot starts. Its commit is named in the first pilot's `run.json`, not in this
file. After it, nothing under `scripts/replay/` or `evals/replay/` changes except exported runs and the comparison, or
the pilots restart. Every result records the instrument commit and the sha256 of this file.

## §14 Closing line and change rule

"No threshold moved." closes every RESULTS file and the comparison. A gap a pilot finds is never fixed by editing this
file after the first v2 result: it is recorded, or it restarts the pilots under `REPLAY-v3`. The canary record states
which §7 branch applied, and the RESULTS of every run name it.

## §15 Threats to validity

- **An injection can turn a unit's own test red.** A unit may write a test of its own that the seed breaks: a `401` on
  the cancel route, an event payload read as `orderId`, a `page=1` list, or a whole-object assertion that carries
  `total_cents`. The red test hints at the seed, and a late red gate may derail the run at review. The fixture cannot
  forbid such tests without a hint of its own. The effect is the same in both shapes. The canary measures it: K11's
  record names, per injected pass, every unit test the injection turned red.
- **The orchestrator may notice a commit it did not make** and stop. K14 checks it in the canary. It hits both shapes
  alike, and a run lost this way counts against the two replacements (§10).
- **An implementer may rewrite an anchor**, so a seed is not injected and the recall denominator shrinks. K11 needs at
  least 10 of 12 injected in the canary, and every run records each seed as injected or not.
- **One round's verdict counts for every pass it covers.** A shape that reviews all six passes in one round gives six
  equal verdicts, so `verdict-class` and `verdict-rounds` compare a round with a pass where the shapes review
  differently.
- **The negation mask can hide a real finding** in a sentence it misreads. It stays on one line, and RESULTS keeps the
  count of free-text blocks it could not read, beside `pooled-recall`.
