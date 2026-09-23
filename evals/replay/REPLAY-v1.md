# Replay protocol v1 — `REPLAY-v1`

The protocol and the thresholds of the replay that decides whether Package 16 (the orchestrator's context economy,
plan `docs/plans/009-orchestrator-context-economy-0{1,2,3}.md`) merges. It implements REQ-CTX-015 and the plan's
shared contract C12. This file is committed before the first pilot and is never edited afterwards: a pilot that
reveals a gap in the mechanism is recorded against this file as it stands (§7, §14), and a change to the rules
themselves is a new protocol, `REPLAY-v2`, which restarts the pilots.

## §1 Scope

- Not an eval-set run. The replay measures one thing: whether the changed shape of `/st-work` keeps the decisions the
  1.9.1 shape makes while it spends fewer characters in the orchestrator's loop. It uses no rubric, no judge model and
  no case from `evals/cases-*`.
- SET-v7 hard trigger 1 (`evals/SET-v7.md`, "Hard triggers") still binds Package 16's corpus edits: the eval cases
  whose `source:` cites an edited range are re-measured by the eval set, not by this replay. The eval-set floor row is
  carried to session 2 of the package, where the set runs once as the new baseline at the 1.10.0 cut (§12,
  `eval-set-floors`).
- The replay runs `/st-work` at the deep tier over a three-unit, six-pass plan on a disposable fixture with twelve
  seeded defects and three decoys, on Claude Code only, one run at a time.

## §2 Shapes

- `baseline` is the CLI built at `fed39ac` (`fed39ac4efe545da298e8b07fe0e2d4b0e2aa041`, the 1.9.1 tree after its
  cleanup merge).
- `changed` is the CLI built at the candidate sha (every unit of plan files 1 and 2 merged on the package branch).
- Both are installed into the fixture as `npm pack` tarballs (§4). The emitted setup is the only difference between the
  shapes: the fixture, the plan, the client, the model, the argv, the environment and the invocation bytes (§6) are
  identical.

## §3 Pins

- **Client.** Claude Code 2.1.280, run from a copied binary whose sha256 is recorded, with `DISABLE_AUTOUPDATER=1` in
  the child's environment. `claude --version` and the init event's `claude_code_version` must both read `2.1.280`.
- **Models.** The orchestrator runs on `--model claude-opus-5-5`. Every sub-agent's `message.model` is recorded; an
  alias resolving to another model voids the run. The orchestrator's effort is the client default, recorded from the
  init event (plan resolution R31).
- **Account and client folder.** `CLAUDE_CONFIG_DIR` is the operator's own logged-in client folder — the maintainer's
  decision of 2026-09-23 ("you can also run the replay with this account"; plan decision D11). The replay shares that
  login the way a second terminal would, and no credential is copied: a copied OAuth credential can be invalidated
  when either copy refreshes it.
- **What the folder must not carry.** No user `CLAUDE.md`, no `agents/`, `commands/` or `output-styles/`, and no
  `enabledPlugins`. Its `settings.json` hooks must include the operator's pattern-kill guard
  (`/bin/bash <home>/.claude/hooks/block-pattern-kill.sh`; plan resolution R27), because the replay's agents run
  headless with permission prompts bypassed.
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

## §5 Fixture

- Built by `scripts/replay/fixture.mjs` under the OS temp directory, never inside this repository. Its base commit S0
  is deterministic: fixed author, committer and dates, and `-c` flags that override the operator's global git config.
- The plan `docs/plans/001-replay.md` holds six passes, `u1-p1 → u1-p2 → u2-p1 → u2-p2 → u3-p1 → u3-p2`, as a single
  `depends_on` chain in both shapes (plan resolution R31): attribution and placement stay deterministic, and no
  parallel lane runs.
- The fixture never contains `seeds.json`, the oracles or the reference fixes.

## §6 Invocation bytes

Byte-identical in both shapes. Each message is UTF-8 with no trailing newline; the sha256 is over exactly those bytes.
The JSON form is the string as the driver encodes it into the stream-json user message; the fenced form is the same
bytes as text (the fence adds none).

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

- **Placements.** `u2-p1` and `u3-p1`.
- **Trigger.** It fires when every verdict-role agent dispatched for the placement pass has stopped, at least two of
  them have returned, and no fixer has been dispatched for that pass.
- **Sequence.** Interrupt; wait for `result`; snapshot the fixture's `.stamity/runs/`; send `/compact`; wait for
  `compact_boundary` with `trigger:"manual"`; send the resume message (§6).
- **Decision rule.** Interrupt mode if canary K-compact passes K1–K5. Otherwise the auto-window mode:
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000`, keeping only the samples whose boundary falls between a lens delivery and
  the next ledger write. The canary record states which branch applied, and every run's RESULTS names it. Choosing
  the fallback is not an edit of this file.
- **Validity.** A sample with at-risk = 0 (§8, loss) is recorded and is not valid.

## §8 Metrics

The exact definitions `scripts/replay/measure.mjs` implements, reproduced from the r7 unit of the plan.

- **Role functions**, by sub-agent type: implementer → build; fixer → fix; reviewer, security, performance,
  design-quality → verdict; test-runner → gate; everything else → other. The loop functions are build, fix, verdict and
  gate.
- **Pass attribution.** The first `\bu[1-3]-p[12]\b` in the dispatch description, else a single distinct pass id in
  the prompt; several distinct ids attribute to `multi`. **Branch-level** dispatches are verdict dispatches after
  `u3-p2`'s last reviewer approval that carry no single id, or that match `/whole[- ]branch/i`.
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
  checkout or any worktree); otherwise it is "caught by implementer" and leaves the denominator. Found = matched (§9)
  by any verdict-role finding (return, digest, report, or a ledger row from a verdict source), with the stage (pass or
  branch) and whether it was found in round 1 recorded.
  Presence is unknown, and the seed is neither "caught by implementer" nor absent at the pass for `security-seeds`
  (§12), in two cases: pass P has no snapshot at all, or the seed's file is absent from every copy under an existing
  `snapshots/P/`. A seed whose presence is unknown stays in the denominator; it counts as found only when a
  verdict-role finding matches it (§9), and otherwise it is not found. RESULTS names each such pass, and in the second
  case the file.
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
  return). `approvedWithSeedUnfixed` = approved while some seed of the pass has an oracle status other than `pass`; an
  oracle that errors counts as unfixed.
- **Invalid run.** An init or sub-agent model outside the pins; a forbidden path (this checkout, the private layer,
  `seeds.json` or `__oracle__`) in any tool input; or a run whose end reason is not `complete`.

**Amendment, 2026-09-23, before any run.** Three readings of this section were written down before the first pilot,
so no replay summary carries a hash of the earlier text and no threshold moved. They settle ledger rows build/151,
build/167, build/169 and build/171 of run `2026-09-23_orchestrator-context`. Under Recall, a pass with no snapshot,
and a seed whose file is absent from every copy of an existing snapshot, leave presence unknown: the seed stays in
the denominator, counts as found only on a verdict-role match, and RESULTS names the pass. Under loop characters,
term (e) counts Grep and Glob calls on report paths beside Read and read-class Bash. §9, §10 and §12 are unchanged.

**Amendment, 2026-09-23, before any run.** Five more readings were written down before the first pilot, as
`scripts/replay/measure.mjs` implements them, so no replay summary carries a hash of the earlier text and no
threshold, §10 row or C12 row moved. They settle ledger rows build/157, build/169, build/175, build/182, build/185,
build/190, build/201, build/202 and build/206 of run `2026-09-23_orchestrator-context`. Under Loss, a finding with no
file is covered by the report-path match or by a ledger row that itself has no file and whose text contains the
finding's trimmed text, and a row with a file covers only its own location. Under loop characters, term (e) counts
search-class Bash (grep, rg, …) beside read-class Bash, a Bash call whose result names a report path beside one whose
command does, and a Grep or Glob whose pattern, file glob or result names one beside one whose path does. Under verdicts per pass, every
completed reviewer delivery is a round, one with no verdict word included, and a re-read of an earlier delivery or a
failed notification is none. Under §9, an item's span is located by its `locate.text` line in each reviewed snapshot
copy, a finding attributed to a pass matches only the spans located in that pass's copies, and locators are made
relative to the fixture root and to each worktree root in every spelling. §9 is amended by this note; §10 and §12
are unchanged.

## §9 Matcher

Deterministic, with no model call. A finding matches a seed or a decoy when all three hold:

1. the file is equal;
2. the finding's line range intersects the item's span widened by ±3 lines;
3. at least one of the item's accepted terms occurs in the finding's text (case-insensitive substring).

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
  gets 2 more scored runs, 5 in all (plan resolution R28). Pilots are not scored.
- The sub-agent-token bar compares the changed shape's mean per pass over its scored runs with the baseline shape's
  mean (R29). The loop-character bar binds every changed scored run against the baseline median. A security seed is
  exempt when at least one baseline scored run missed it (R30).
- An incomplete, contaminated or pin-drifted run is invalid and replaced, at most 2 replacements per shape. Beyond
  that, the rows it feeds are not evaluated and the merge gate fails.

## §11 Placement

Results go under `evals/replay/runs/<date>-replay-<n>/` (`RESULTS.md`, `summary.json`) and the comparison under
`evals/replay/COMPARISON-v1.md`. Never under `evals/runs/`, and never named `-run-<n>`: the eval set's run of record is
the newest `<date>-run-<n>` directory under `evals/runs/` (`test/evals/rubricCoreHash.test.ts:36-44`), and a replay
result there would displace it.

## §12 Thresholds

The package merges only when every row holds (C12). Recall rates are scaled to 36 seed opportunities (12 seeds × 3
scored runs; a shape with 5 scored runs has 60 opportunities, 12 × 5, and its rate is scaled to 36 before the
comparison), and both shapes' denominators are printed beside each rate, because implementers catch different seeds.

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
| `eval-set-floors` | Carried to session 2: checked at the 1.10.0 baseline run of the eval set | `evalSetFloors` |

The matcher's line tolerance is `lineTolerance` (§9). The sample rule is `scoredRunsPerShape`, `scoredSpreadSeeds` and
`scoredRunsIfVariance` (§10).

The machine block below is the one the scorer reads. It is the only `replay-thresholds` block in this file.

```replay-thresholds
{"schema":"stamity/replay-thresholds/v1","lineTolerance":3,"securityAllRuns":true,"recallMargin":1,"recallOpportunities":36,"decoyFlags":"<=baseline","lossPerValidSample":0,"minValidSamplesChanged":1,"verdictClassMinPasses":5,"roundsTolerance":1,"approvedUnfixed":"<=baseline","loopCharsRatioMax":0.5,"loopCharsReference":"baseline-median","loopCharsScope":"every-scored-run","subagentTokensRatioMax":1.2,"subagentTokensScope":"pooled-mean","subagentTokensReference":"baseline-mean","scoredRunsPerShape":3,"scoredSpreadSeeds":2,"scoredRunsIfVariance":5,"securityExemption":"any-baseline-scored-run-missed","evalSetFloors":"carried-to-session-2"}
```

## §13 Refusals

A run is refused before it starts on:

- a dirty `evals/replay/` or `scripts/replay/`;
- an instrument commit other than the pinned one;
- a binary drift (a client binary whose sha256 differs from the recorded one) or a config drift (a client folder or
  settings file that differs from the recorded one, or fails §3).

Every result records the instrument commit and the sha256 of this file.

## §14 Closing line and change rule

"No threshold moved." closes every RESULTS file and the comparison. A pilot that reveals a gap in the mechanism does
not edit this file: the canary record states which §7 branch applied, and the RESULTS of every run name it. A change
to the rules themselves is `REPLAY-v2`, and it restarts the pilots.
