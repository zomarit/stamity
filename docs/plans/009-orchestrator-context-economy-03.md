---
id: orchestrator-context-economy-03
intent: feature
stamp: fed39ac4efe545da298e8b07fe0e2d4b0e2aa041 2026-09-23
reads: [content/commands/st-plan.md, content/commands/st-work.md, scripts/qa/fixtures.mjs, scripts/qa/run.mjs, scripts/qa/redact.mjs, scripts/repo-hygiene.mjs, scripts/leak-gate.mjs, eslint.config.js, .oxlintrc.json, vitest.config.ts, tsconfig.json, package.json, .gitattributes, evals/runs/2026-09-22-run-32/PROTOCOL.md, test/evals/rubricCoreHash.test.ts, src/hooks/model.ts]
depends_on: [docs/plans/009-orchestrator-context-economy-01.md, docs/plans/009-orchestrator-context-economy-02.md]
---

# Orchestrator context economy — file 3 of 3: the replay, the old-vs-new measurement and the merge gate

intent chosen: feature because a new measurement instrument is named — a fixture with seeded defects, a deterministic matcher, a forced compaction, an analyzer and a scorer — and it gates the merge of the capabilities files 1 and 2 build.

## Context

The maintainer's research directive for this package asks that the solution be "as effective as possible without quality loss". No outside source has measured what a digest costs an orchestrator's decisions on coding work, so this file builds and runs a replay: the same three-unit, six-pass `/st-work` run at the deep tier, on a throwaway service with twelve planted defects and three decoys, once with 1.9.1 and once with the candidate of files 1 and 2, a forced compaction right after a lens returns, scored by a deterministic matcher against the floor the maintainer declared before any run (C12). It is not an eval-set run (the set runs once, as the new baseline, at the 1.10.0 cut). The runs go one at a time on Claude Code, on the account the operator's client folder is logged into (the maintainer's decision D11; no extra login). The package merges only on `Merge gate: PASS`.

## Shared contracts

The same text stands in all three files of this plan. A unit that finds a contract unworkable at a cited line
returns `BLOCKED_AMBIGUITY` naming the contract and the evidence; it does not redesign the contract in place.

**C1 — Report path and name.** `.stamity/runs/<run-id>/reports/<pass>-<role>-r<N>.md`, always under the main
checkout's run folder. `<run-id>` matches `^[0-9]{4}-[0-9]{2}-[0-9]{2}_[a-z0-9-]+$`. `<pass>` is the plan unit id
(`[a-z0-9][a-z0-9-]*`), `branch` for a whole-branch pass, `plan` for planning research; a unit id beginning `report`,
`summary`, `findings` or `analysis` takes a `u-` prefix, because Claude Code (2.1.278 and 2.1.280, read from the
client's code) refuses a sub-agent's `Write` whose basename matches `/^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\.md$/i`.
`<role>` is `implementer | fixer | reviewer | security | performance | design-quality | test-runner | spec-author`;
`r<N>` is the round, from 1. The dispatch names the report by its **absolute** path in the main checkout (a lane
writes there); a digest's `report:` line and the ledger's `report` field carry the **repo-relative** form. Each run's
`reports/` folder holds a `.gitignore` whose one line is `*` — created at Frame, ensured by `stamity ledger append` and
`close` — and this repository's root `.gitignore` also ignores `/.stamity/runs/*/reports/` and the ledger's lock and
temp names; the ledger stays the durable record.

**C2 — The findings block.** Every full report, and every verdict return delivered inline, carries exactly one fenced
block whose info string is `stamity-findings`, one JSON object per line: `id` (`C-<n>`, `W-<n>`, `M-<n>`, local to the
report, its letter matching the severity), `severity` (`Critical | Warning | Minor`), `locator` (`path:line`,
`path:line-line`, or a gate command), `summary` (one line, the failure scenario, ≤ 300 characters), optional
`decision_needed` (true when the fix changes a shared contract or needs a product choice), optional `security` (true
on a security-relevant finding). A pass that found nothing carries an empty block; a `BLOCKED_*` return carries none.

**C3 — Ledger row.** The seven fields `id, phase, source, severity, evidence, state, rationale`, optional `retired`,
and two new optional fields: `report` (the repo-relative report path) and `decision_needed` (present only as `true`).
The states stay `open | fixed | deferred | rejected`. A row appended from a C2 block has `evidence` =
`<locator> — <summary>`, `state` `open`, `rationale` `""`. A `decision_needed` row is signed off by the orchestrator
in a run-record line `- <UTC> sign-off: <ledger-id> — <decision>` before the first fixer dispatch naming its id.

**C4 — The digest.** The final message of a two-tier role, one labelled line each: `status:`; for the reviewer only,
`verdict:` (`approve | request-changes | blocked`) and `confidence:` with its basis word (the review gate parses these);
for a lens (security, performance, design-quality), `mode:` posted or advisory with the posted count (performance also
names whether a declared budget was breached); `report:` with the repo-relative path; `findings:` every Critical and
Warning as `<id> <locator> — <summary>`, Minors as a count with their ids and locators; `security:` every
security-relevant finding in full, or `none`; `contract delta:` the census rows in full, or `none`; then at most 1,500
characters of prose. The cap binds the prose only. **Never digested** (returned in full): a `BLOCKED_*` return, a red
test-runner return, a researcher return, a verdict role's return where its client grants no report write, and any
return whose report write was refused (it says so). Execution roles (implementer, fixer, spec-author, test-runner on a
green verdict — the test-runner writes through its shell) are two-tier on every client; verdict roles are two-tier only
where the client grants the report write (C8).

**C5 — Run record head.** Among the first 15 lines of `.stamity/runs/<run-id>/record.md`: the existing `Status:` line
(in progress while it matches `\bin progress\b`, case-insensitive), `Plan: <repo-relative plan path>` and
`Invocation: <the exact /st-work command line>`, written at Frame.

**C6 — The resume card** (≤ 2,000 characters; recomputed from disk at every print; screened like the session-start
loader's other output — a screen hit prints one `withheld` line naming the pattern):

    stamity resume card — run <run-id> (as of <UTC ISO minute>)
    plan: <C5 Plan>  ·  invocation: <C5 Invocation>
    ledger: <n> open rows (<up to 10 ids>)  ·  the ledger is the recovery point
    reports without a ledger row: <n> (<up to 10 paths>)
    lanes: <n> (<linked worktrees: path [branch], up to 10>)
    next: read the open rows and the listed reports before dispatching anything

The run is the lexicographically greatest in-progress run folder; none → no card. "Reports without a ledger row" are
report files whose C2 block holds ≥ 1 finding and whose path no row carries in `report`. Lanes are linked worktrees read
from the git common dir with `node:fs` (a hook spawns no process). Lists shrink to fit and end `… +<n> more`. Printed by
the session-start hook when its stdin `source` is `compact` (Claude Code, Codex) and by `stamity ledger status` (every
client; by hand where the client does not re-run its session-start hook after a compaction). No pre-compaction hook and
no new hook event is added.

**C7 — `stamity ledger`** (hidden plumbing verb, beside `learn` and `handoff`; the one serialized ledger writer,
through the engine's existing write lock). `append --run <run-id> --phase <phase> --source <role> (--report <path> |
--stdin)`: validates the C2 block (any bad line refuses the whole append, naming the line), appends one `open` row per
finding (ids `<run-id>/<phase>/<n>`, n continuing that run and phase's highest, numerically), prints
`<ledger-id> <severity> <report-local id>` per row with a trailing ` decision-needed` on such rows, and refuses a
report already appended. `close --run <run-id> (--report <path> --ids <comma list> | --id <ledger-id> --state
<fixed|rejected|deferred> --rationale <text>)`: applies a C9 closures block, or one manual transition, rewriting rows in
place; `--ids` lists the ledger ids handed to that re-review, and an unknown id, or a closure naming an id outside
`--ids`, refuses the whole close. `status [--run <run-id>]`: prints C6. Every refusal exits 1; a report path must
resolve directly inside that run's `reports/`, with no `..` segment and no symlink. (Amended 2026-09-23: `close
--report` takes `--ids`, and a closure outside it refuses the whole close — resolution R38, ledger row `build/58`.)

**C8 — Verdict-role report write on Claude Code only.** An optional `writePaths` on the four verdict policy rows,
each naming only its own role's reports: `.stamity/runs/*/reports/*-reviewer-r*.md`, `*-security-r*.md`,
`*-performance-r*.md`, `*-design-quality-r*.md`. The policy document schema stays `stamity/agent-tool-policies/v1`
(an older guard denies `Write` through the category, fail-closed). The Claude adapter renders `Write` — never `Edit`
or `NotebookEdit` — for those agents in the repository layout only; a plugin install (the container hook layout,
which anchors no project root) renders none. The generated pre-tool-use guard allows such a `Write` only for a regular
file resolving inside the root its own location names and matching the row's pattern, with no `..`, no symlink, no hard
link; every other edit-category call by those agents stays denied. The guard's matcher reads a pattern's last `*` (the
round number just before the `.md` suffix) as one or more ASCII digits only, so `*-reviewer-r*.md` matches
`<pass>-reviewer-r<N>.md` and never a basename in which another role's token comes after it — the per-role isolation
rests on that rule, not on the pass slug. Cursor, Copilot and Codex keep read-only grants and their capability
disclosure says verdict reports are returned inline there. The guard change gets a security lens pass and a security
review of its diff. (Amended 2026-09-23: the round-number rule of the guard's matcher — ledger row `build/70`, signed
off as the declared default, option 2.)

**C9 — Re-review closures.** A re-review carries a `stamity-closures` block, one object per prior ledger id:
`{"ledger_id":"<id>","status":"fixed|not-fixed|regressed|rejection-upheld|rejection-overturned"}` with an optional
`rationale`; plus new Critical/Warning only (C2), the reviewer's labelled `verdict:`/`confidence:` lines, and one line
`read: <files>; lenses: <list>`. `ledger close --report` maps `fixed` → `fixed`, `rejection-upheld` → `rejected`
(its rationale, default `rejection upheld by <report>`), and keeps `not-fixed`, `regressed`, `rejection-overturned`
open with a note appended; `regressed` also reopens a `fixed` row.

**C10 — Pointer dispatch** (at most 15 lines): role, class and run id; the plan path and unit id, never a line number;
worktree, branch and base; the absolute report path (C1); the unit's `verify`; its `files` cell as the boundary; the
learnings that apply; the digest (C4) as the return. A fixer's dispatch also carries the orchestrator's sign-off
beside each `decision_needed` id it names (the C3 run-record sign-off line stays too), and the fixer fixes such a row
only then. An in-flow plan is persisted once as
`.stamity/runs/<run-id>/plan.md` in `/st-plan`'s unit shape. When an implementer's contract delta moves a seam a later
unit relies on, the spec-author amends that later cell in place (`amended <UTC date>: <what moved> (<commit>)`) before
it is dispatched; when that unit touches a security trigger path or a shared contract, the reviewer reads the amended
cell first. An implementer whose cell names an interface that does not resolve at HEAD returns `BLOCKED_DEPENDENCY`.
(Amended 2026-09-23: the fixer's dispatch carries the sign-off beside each `decision_needed` id — resolution R39,
ledger row `build/59`.)

**C11 — Capacity rung**, a Dispatch-contract bullet after the findings-ledger bullet. A stop is classed by its notice:
`stall` (no progress) or `connection` (dropped transport) → resume the same agent; a second stop waits five minutes,
then resumes; a third → `BLOCKED_DEPENDENCY` with the smallest unblocking input. `limit-reset` (a limit naming its
reset) → wait for a reset within 12 hours, then resume one agent as a probe before the rest; a later reset →
`BLOCKED_DEPENDENCY` naming it. `limit-no-reset` (credits, a model limit with no reset) → a build role (implementer,
fixer on rounds 1–3, researcher, creator, test-runner) may drop one class, named in the proof block; every other role
stops as `BLOCKED_DEPENDENCY`. Verdict roles and the spec-author never fall back to a weaker class. A resume is neither
a ladder rung nor a review round (on clients with no sub-agent resume it is a re-dispatch of the same brief at the
same class, naming the on-disk state). One run-record line per event:
`- <UTC> capacity: <role> <stop class> → <resumed | waited until <UTC> | BLOCKED_DEPENDENCY>`.

**C12 — The quality floor and the replay** (declared before any run). The changed shape against the 1.9.1 baseline,
on Claude Code, one run at a time on the account the operator's client folder is logged into (shared login, no copied
credential), scored by a deterministic matcher (file + line ±3 + one accepted term; no model judge):
every security seed found in every changed scored run (exempt when at least one baseline scored run missed it);
pooled seeded recall ≥ baseline − 1 of 36; decoys wrongly flagged ≤ baseline; 0 findings lost across a forced
compaction in every valid sample; verdicts — the same modal final class on ≥ 5 of 6 passes, rounds within ±1 per pass,
no more passes approved with a seed still unfixed than the baseline. Saving shown: loop characters per pass in every
changed scored run ≤ 0.5 × the baseline median; the changed shape's mean sub-agent tokens per pass ≤ 1.2 × the
baseline's mean. Samples: 1 pilot plus 3 scored runs per shape; a shape whose three scored runs differ by more than 2
seeds found gets 5. Protocol and thresholds are committed in `evals/replay/REPLAY-v1.md` before the pilot and never
moved. The package merges only when every row holds; the eval-set floors are checked at the 1.10.0 baseline run.

## Spec delta

The requirements this file's units implement. Their statements, acceptance criteria and the amendments the Prove merge applies are the one canonical copy in `docs/plans/009-orchestrator-context-economy-01.md` § Spec text; `/st-work` merges them into `docs/specs/orchestrator-context.md` (a new spec) and `docs/specs/model-ladder.md` (two requirements added) at its Prove phase.

### REQ-CTX-001 — Execution roles write the full report to disk and return a digest

### REQ-CTX-002 — The never-digested classes and the never-cut lines

### REQ-CTX-005 — `stamity ledger append`, the one serialized ledger writer

### REQ-CTX-008 — Re-review closures and `stamity ledger close`

### REQ-CTX-012 — The run record's head names the plan and the invocation

### REQ-CTX-013 — The resume card, and `stamity ledger status`

### REQ-CTX-015 — The replay, its floor, and the merge gate

## Units

### r1-protocol — REPLAY-v1: protocol and C12 thresholds, committed before the pilot

| Field | Content |
|---|---|
| `id` | r1-protocol |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/REPLAY-v1.md` (new) |
| `interfaces` | **Sections, in order:** **§1 Scope.** Not an eval-set run. SET-v7 hard trigger 1 still binds Package 16's corpus edits; the eval-set floor row is carried to session 2. **§2 Shapes.** `baseline` is the CLI built at `fed39ac`. `changed` is the CLI built at the candidate sha. Both are installed as `npm pack` tarballs (§4); the emitted setup is the only difference between shapes. **§3 Pins.** Client 2.1.280, run from a copied binary whose sha256 is recorded, with `DISABLE_AUTOUPDATER=1`. `claude --version` and the init event's `claude_code_version` must both read 2.1.280. The orchestrator runs on `--model claude-opus-5-5`. Every sub-agent's `message.model` is recorded; an alias resolving to another model voids the run. `CLAUDE_CONFIG_DIR` is the operator's own logged-in client folder — the maintainer's decision of 2026-09-23 ("you can also run the replay with this account"; plan decision D11): the replay shares that login the way a second terminal would, and no credential is copied (a copied OAuth credential can be invalidated when either copy refreshes it). The folder must carry no user `CLAUDE.md`, no `agents/`, `commands/` or `output-styles/`, no `enabledPlugins`, and its `settings.json` hooks must include the operator's pattern-kill guard (`/bin/bash <home>/.claude/hooks/block-pattern-kill.sh`; plan resolution R27). What it does carry — account-synced skills, the user settings' model default (overridden by `--model`) — is ambient context identical in both shapes: every run records the init event's skills, agents, slash commands, plugins and MCP servers, and a run whose lists differ from its shape's pilot is invalid. MCP servers stay off (`--strict-mcp-config`). **Argv:** `-p --model claude-opus-5-5 --input-format stream-json --output-format stream-json --verbose --replay-user-messages --strict-mcp-config --permission-mode bypassPermissions --settings <marker-settings.json>`, with no `--tools ""`, no `--disable-slash-commands` and no `--no-session-persistence`. **Environment** follows the private dispatch pattern (`PATH HOME USER LOGNAME SHELL TMPDIR LANG`, `TERM=dumb`, `CLAUDE_CONFIG_DIR`, `DISABLE_TELEMETRY=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `DISABLE_AUTOUPDATER=1`) plus `STAMITY_NO_UPDATE_CHECK=1`; `CLAUDE*`, `ANTHROPIC*` and `AI_AGENT*` variables are dropped. **§4 Install.** `git worktree add --detach <tmp>/cli-<shape> <sha>`, then `npm ci && npm run build && npm pack --pack-destination <dir>`; the tarball's sha256 is recorded. Never `git stash`. **§5 Fixture.** Built by `scripts/replay/fixture.mjs` under the OS temp directory; its base commit S0 is deterministic. The fixture never contains `seeds.json`, the oracles or the reference fixes. **§6 Invocation bytes**, byte-identical in both shapes, each with its sha256 stated: the start message `"/st-work docs/plans/001-replay.md --effort deep\n\nUnattended run: no operator will answer. At every question, execute its declared default (plan gate: execute now). At the QA checkpoint, emit the what-to-verify summary and record the human sign-off as not performed. Do not open a pull request."`; the resume message `"Continue the /st-work run from where it stopped."`; the nudge `"This run is unattended; no reply will come. Apply the declared default and continue the /st-work run."` (at most 3, counted); the capacity resume `"The usage limit has reset. Continue the /st-work run from where it stopped."`. **§7 Compaction.** Placements are `u2-p1` and `u3-p1`. The trigger fires when every verdict-role agent dispatched for the placement pass has stopped, at least two of them have returned, and no fixer has been dispatched for that pass. Sequence: interrupt, wait for `result`, snapshot the fixture's `.stamity/runs/`, send `/compact`, wait for `compact_boundary` with `trigger:"manual"`, send the resume message. **Decision rule:** interrupt mode if canary K-compact passes K1–K5; otherwise `CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000`, keeping only samples whose boundary falls between a lens delivery and the next ledger write. A sample with at-risk = 0 is recorded and is not valid. **§8 Metrics:** the exact definitions r7 implements (loop characters, sub-agent tokens, recall, precision, loss, verdicts), reproduced in r7's `interfaces`. **§9 Matcher:** file equal, line range intersecting span ±3, and at least one accepted term (case-insensitive substring). A location match without a term goes to the adjudication list, never to the score. Sources are verdict-role returns and reports, plus ledger rows whose `source` is a verdict role. **§10 Samples:** 1 pilot plus 3 scored runs per shape; a shape whose three scored runs differ by more than 2 seeds found (max − min) gets 2 more scored runs, 5 in all (plan resolution R28). The sub-agent-token bar compares the changed shape's mean per pass over its scored runs with the baseline shape's mean (R29); the loop-character bar binds every changed scored run against the baseline median; a security seed is exempt when at least one baseline scored run missed it (R30). An incomplete, contaminated or pin-drifted run is invalid and replaced, at most 2 replacements per shape. **§11 Placement:** results under `evals/replay/runs/<date>-replay-<n>/`, never under `evals/runs/`, and never named `-run-<n>` (`test/evals/rubricCoreHash.test.ts:36-44`). **§12 Thresholds:** the table plus a fenced machine block whose info string is `replay-thresholds`: `{"schema":"stamity/replay-thresholds/v1","lineTolerance":3,"securityAllRuns":true,"recallMargin":1,"recallOpportunities":36,"decoyFlags":"<=baseline","lossPerValidSample":0,"minValidSamplesChanged":1,"verdictClassMinPasses":5,"roundsTolerance":1,"approvedUnfixed":"<=baseline","loopCharsRatioMax":0.5,"loopCharsReference":"baseline-median","loopCharsScope":"every-scored-run","subagentTokensRatioMax":1.2,"subagentTokensScope":"pooled-mean","subagentTokensReference":"baseline-mean","scoredRunsPerShape":3,"scoredSpreadSeeds":2,"scoredRunsIfVariance":5,"securityExemption":"any-baseline-scored-run-missed","evalSetFloors":"carried-to-session-2"}`. **§13 Refusals:** a dirty `evals/replay/` or `scripts/replay/`, an instrument commit other than the pinned one, a binary or config drift. Every result records the instrument commit and the sha256 of this file. **§14** "No threshold moved" closes every RESULTS file. Refers to the private layer only as "the private layer" |
| `testCriteria` | `parseThresholds` (r8a) finds exactly one `replay-thresholds` block in the committed file and every key above with the stated value. The file contains the four message strings byte-for-byte, and their sha256 values as printed match `sha256` of those strings (a test in `test/replay/score.test.ts`). `npm run gate` exits 0 on the file |
| `edgeCases` | The pilot reveals a mechanism gap after this file is committed. The file is not edited. The canary record states which §7 branch applied, and the RESULTS of every run name it. A change to the rules themselves is a REPLAY-v2 and restarts the pilot |
| `depends_on` | none (committed before `r11a-pilots`; r8a's thresholds parser reads it) |
| `verify` | `npm run gate && npx vitest run test/replay/score.test.ts` |

Confidence: high on the layout, rules and pins (direct: `final.md` §3–§5, `contracts.md:165-173`, `PROTOCOL.md:27-60, 238-247`, and the binary strings cited in Unknowns). Medium on the three readings flagged in Unknowns (inferred).

### r2-fixture-generator — scripts/replay/fixture.mjs

| Field | Content |
|---|---|
| `id` | r2-fixture-generator |
| `requirements` | REQ-CTX-015 |
| `files` | `scripts/replay/fixture.mjs` (new), `test/replay/fixture.test.ts` (new), `.gitattributes` (one line: `evals/replay/v1/**/*.patch -whitespace`) |
| `interfaces` | **CLI:** `node scripts/replay/fixture.mjs [--out <parentDir>] [--cli-tarball <tgz>] [--deps <dir> \| --deps-link <dir>] [--units <id,…\|none>] [--no-setup] [--no-install] [--run-gates] [--json]`. It refuses an `--out` inside this repository: `rel = relative(repoRoot, out); rel.startsWith('..') \|\| isAbsolute(rel)` must hold, the same check as `scripts/qa/run.mjs:98-101`, because the leak gate walks untracked files (`scripts/qa/fixtures.mjs:12-14`). **Exports:** `export const PASS_IDS = ["u1-p1","u1-p2","u2-p1","u2-p2","u3-p1","u3-p2"]`; `export const FIXED_GIT_ENV = { GIT_AUTHOR_NAME:"replay fixture", GIT_AUTHOR_EMAIL:"replay@invalid.local", GIT_COMMITTER_NAME:…, GIT_COMMITTER_EMAIL:…, GIT_AUTHOR_DATE:"2026-09-24T00:00:00Z", GIT_COMMITTER_DATE:"2026-09-24T00:00:00Z" }`; `export function createReplayFixture({ out, cliTarball, deps, depsLink, units, setup = true, install = true, runGates = false, v1Dir }) → { dir, baseCommit, planCommit, setupCommit\|null, planPath:"docs/plans/001-replay.md", planSha256, units, steps:[{name, command, exitCode, output}], cli:{ tarballSha256, version }\|null, gates:{lint,typecheck,test}\|null }`; `export function renderPlan(template, { stamp, units }) → string` (replaces `{{STAMP}}` with `<S0> 2026-09-24` and drops the unit sections not in `units`); `export function applyPatch(dir, patchPath, { threeWay = false })`. **Steps:** (1) `git -c init.defaultBranch=main -c commit.gpgsign=false -c core.autocrlf=false init`. (2) `git apply v1/patches/base.patch`; copy `v1/patches/<pass>.patch` for each selected unit to `vendor/contrib/<pass>.patch`; store every preimage blob of every pass patch (the pure seeded chain) so `git apply --3way` resolves later — the base and each pass are applied in order to a scratch index with `git apply --cached`, the chain state before each pass is written as a tree and pinned under `refs/replay/preimages/<pass>` (a ref naming a tree keeps its blobs through any gc, and `git log --all` does not show it), and a recorded preimage id that does not resolve refuses the build, naming the patch and the blob; `git add -A`; commit "service base" under `FIXED_GIT_ENV`, giving S0. (3) Write the rendered plan to `docs/plans/001-replay.md`; commit "replay plan". (4) Dependencies: copy `--deps` (`cpSync`, `verbatimSymlinks`), or symlink `--deps-link` (tests only), or run `npm install --prefer-offline --no-audit --no-fund`. (5) Unless `--no-setup`: `npm install --no-save --no-audit --no-fund --prefer-offline <cliTarball>`, then `node_modules/.bin/stamity init -y --tools claude`, `sync -y`, `check`, all with `STAMITY_NO_UPDATE_CHECK=1`; `git add -A`; commit "stamity setup". (6) `--run-gates` runs `npm run lint`, `npm run typecheck` and `npm test` in the fixture. It never copies `seeds.json`, `oracle/` or `fixes`. Every `catch` in the file names or rethrows its error (the `stamity/silent-catch` and `stamity/hatch-error` rules bind `.mjs`, `eslint.config.js:145-161`) |
| `testCriteria` | These run over a synthetic `v1Dir` the test writes (a two-file base patch, two pass patches, a template), so r2 does not wait on r3 or r4a. (1) Two builds with `--no-install --no-setup` produce the same `baseCommit`. (2) `--out` under the repository root throws a message naming the leak gate. (3) `--units u1-p1` renders a plan with exactly one unit section, and `vendor/contrib/` holds only `u1-p1.patch`. (4) `git ls-files` in the fixture lists no path matching `/seeds\.json\|__oracle__\|reference-fixes/`. (5) Stored preimages, three cases, of which 5a and 5c are the proof. (5a) Every preimage blob id pass 2's patch records resolves in the fixture's object store (`git cat-file -e <id>^{blob}` exits 0), and none of them is in S0's tree. (5b) `git apply --3way` of pass 1, then an edit to one of pass 2's context lines, staged: a plain apply of pass 2 refuses, and `git apply --3way` of pass 2 merges clean, keeping the edit. On its own 5b stays green with no stored preimages, because `--3way` implies `--index` and writes pass 1's postimage blob itself; a comment in the case says so, so 5b is never taken to cover 5a or 5c. (5c) Pass 1 applied without `--index`, then the edit, staged, then `git apply --3way` of pass 2 succeeds; without the stored preimages it fails with "lacks the necessary blob". Beside them, from the fix round: the preimages survive `git gc --prune=now` (pinned by `refs/replay/preimages/<pass>`), the fallback still resolves, and `git log --all` shows only the two commits; and a pass patch cut from bytes other than the chain's is refused, naming its preimage blob. (6) The plan's `stamp:` line equals `<baseCommit> 2026-09-24` |
| `edgeCases` | The operator's global git config sets `commit.gpgsign=true` or a hooks path: the `-c` flags override it and S0 is unchanged (asserted by running with `GIT_CONFIG_GLOBAL` pointing at a file that sets both). `npm install` fails offline: the step's exit code and output land in `steps`, and the function throws naming the step |
| `depends_on` | none |
| `verify` | `npx vitest run test/replay/fixture.test.ts && npm run lint && npm run typecheck && npm run gate` |
| `amended` | amended 2026-09-23: testCriteria (5) as first worded stayed green with no stored preimages (`--3way` implies `--index`, which writes pass 1's postimage itself), so it is restated as the landed cases 5a, 5b and 5c, 5a and 5c being the proof, with the fix round's gc and drift cases beside them; step (2) names the landed storage — a scratch-index `git apply --cached` of the chain, pinned under `refs/replay/preimages/<pass>` — in place of `git hash-object -w` (ledger rows `build/22`, `build/23`; lane head 1ce40164) |

Confidence: high (direct: `scripts/qa/fixtures.mjs:160-207`, `eslint.config.js:145-161`, `.gitattributes:3-7`). The preimage-blob approach is inferred from git's documented `--3way` behaviour and is proved by tests 5a and 5c.

### r3-service-base — the small service as one base patch

| Field | Content |
|---|---|
| `id` | r3-service-base |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/v1/patches/base.patch` (new; one file of about 800 added lines, declared a data exception to the 400-line ceiling) |
| `interfaces` | **Service `replay-orders`.** TypeScript ESM, no runtime dependencies. **`package.json`:** `"type":"module"`, scripts `test: vitest run`, `typecheck: tsc --noEmit`, `lint: oxlint`; exact devDeps equal to this checkout's installed versions: `vitest 5.0.1`, `typescript 7.0.2`, `oxlint 1.83.0`, `@types/node 26.6.2`. Also `tsconfig.json` (nodenext, strict, noEmit, `allowImportingTsExtensions`, include `src`, `test`), `.oxlintrc.json` (correctness: error), `.gitignore` (`node_modules/`, `coverage/`) and `README.md`. **`docs/api.md`**, the contract of record: Bearer auth; wire keys `id, customer, total_cents, status, created_at`; 1-based `page`; `size` defaults to `pageSizeDefault` = 20, max 100; windows inclusive at both ends; errors `{"error":"<msg>"}` with 400/401/404/500; event payload `{type, orderId, at}`; invoices only `<id>.pdf` inside the invoice directory. **`config/service.json`:** `{"pageSizeDefault":20,"maxPageSize":100,"retentionDays":30}`. **`src/config/load.ts`:** `interface ServiceConfig {pageSizeDefault;maxPageSize;retentionDays}`, `export const DEFAULTS`, `loadConfig(raw: Partial<ServiceConfig> = {}): ServiceConfig`, `readConfigFile(path)`. **`src/store/db.ts`:** `openDb(): DatabaseSync` (`node:sqlite`, `:memory:`, table `orders(id INTEGER PRIMARY KEY, customer TEXT, total_cents INTEGER, status TEXT, created_at TEXT)`), `insertOrder`, `type OrderRow`. **`src/store/query.ts`:** `listOrders(db,{size})` ordering by `created_at DESC LIMIT ?`, `getOrder`, `setStatus`. **`src/reports/window.ts`:** `isWithin(at, from, until)` returning `at >= from && at <= until`, doc comment "both ends inclusive". **`src/auth/guard.ts`:** `requireAuth(h: Handler): Handler` returns 401 `{error:"unauthorized"}` unless `authorization === "Bearer "+t` for some `t` in `deps.tokens`. **`src/http/router.ts`:** `class Router { get; post; match(method, pathname) }` with `:id` params. **`src/http/app.ts`:** `interface AppDeps { db; tokens: ReadonlySet<string>; config: ServiceConfig; bus: { publish(raw: string): void }; invoiceDir: string }`, `createApp(deps) → (req,res) => void`; an unmatched route returns 404 `{error:"not found"}` and a thrown error returns 500 `{error:"internal"}`. **`src/http/routes.ts`:** `GET /orders` → `requireAuth(listHandler)`, `GET /orders/:id` → `requireAuth(getHandler)`. **`src/orders/handlers.ts`:** `toWire(row)` (the five documented keys), `listHandler`, `getHandler`. **`src/orders/format.ts`:** non-exported `fmt(cents)`, exported `describeOrder`. **`src/events/emitter.ts`:** `orderEvent(type, order, at)` → `JSON.stringify({ type, orderId: order.id, at })`. **`src/events/audit.ts`:** `auditLine(raw)` reads `payload["orderId"]`; `createAuditBus(lines)`. **`src/server.ts`:** entry point. **Tests:** `test/helpers.ts` (`startApp(deps?) → {url, close, db, bus, lines}`); `test/window.test.ts` including `it("includes the last instant of the window", …toBe(true))`; `test/config.test.ts` including `it("defaults the page size to 20", …)`; `test/handlers.test.ts` including `it("lists orders with their totals", …)` with `expect(body.orders[0].total_cents).toBe(1250);`, a 401 without a token, and a 404 body `{error:"not found"}`; `test/audit.test.ts`, which feeds the literal `'{"type":"order.created","orderId":7,"at":"2026-09-01T00:00:00Z"}'` (the untyped boundary, so the event-key seed stays green); `test/query.test.ts` |
| `testCriteria` | `createReplayFixture({ units: [], setup:false, depsLink:<repo>/node_modules, runGates:true })` exits with lint, typecheck and test all green. This runs in `test/replay/seeds.test.ts` behind `STAMITY_REPLAY_SUITE=1`. The patch applies with `git apply --check` to an empty repo in the default suite. `npm run gate` reports 0 hits on the file: no credential shapes (tokens are plain words such as `test-token`) and no home paths |
| `edgeCases` | Node without `node:sqlite` (below 22.13): the fixture's `engines` states `>=22.13` and `openDb` throws a message naming the floor. This checkout's floor is 22.22.2 (`package.json:28`) |
| `depends_on` | r2-fixture-generator |
| `verify` | `STAMITY_REPLAY_SUITE=1 npx vitest run test/replay/seeds.test.ts -t base && npm run gate` |

Confidence: high on the gate avoidance (direct: `vitest.config.ts:54`, `tsconfig.json:27`, `.oxlintrc.json:201`, installed versions read from `node_modules/*/package.json`). Medium on the module shape (inferred from `final.md` §2.1 and sized to the 600–900 line target).

### r4a-seed-patches — six pass patches, seeds.json, the persisted plan

| Field | Content |
|---|---|
| `id` | r4a-seed-patches |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/v1/patches/{u1-p1,u1-p2,u2-p1,u2-p2,u3-p1,u3-p2}.patch`, `evals/replay/v1/seeds.json`, `evals/replay/v1/plan/001-replay.md` (8 files; data exception on lines, as the brief allows) |
| `interfaces` | **`seeds.json`**: `{"schema":"stamity/replay-seeds/v1","matcher":{"lineTolerance":3,"severities":["Critical","Warning"]},"seeds":[Seed×12],"decoys":[Decoy×3]}`. `Seed = { id, class: "security"\|"correctness"\|"contract"\|"test-weakening", severity: "Critical"\|"Warning", pass, file, locate: { text, from, to }, present: { contains? , notContains? }, span: [start, end], terms: string[3..6], oracle: { kind: "vitest", file } \| { kind: "static", file, mustMatch: string[], mustNotMatch: string[] } }`; `Decoy` has the same shape without `class`, `severity` or `oracle`. `span` gives lines in the pure seeded tree (base plus the six patches, in order). `locate.text` is a unique line; the span is `[locLine+from, locLine+to]`. **Ids never use a `C-`, `B-` or `Q-` prefix before digits** (the leak gate's private-ledger rule, `scripts/leak-gate.mjs:512-557`). **Seeds and their planted shapes** (security seeds Critical, all others Warning): `sec-sql-sort` (u1-p1, `src/store/query.ts`): ``const sql = `SELECT id, customer, total_cents, status, created_at FROM orders ORDER BY ${sort} DESC LIMIT ? OFFSET ?`;`` with `sort` taken raw from `ctx.query.get("sort")`; terms `inject, concatenat, interpolat, parameteri, allowlist`. `cor-page-offset` (u1-p1, new `src/store/paging.ts`): `return page * size;` under the doc comment "pages are 1-based"; the patch's own test checks only `pageOffset(2,10) > pageOffset(1,10)`; terms `off-by-one, off by one, 1-based, first page, skips`. `cor-date-boundary` (u1-p2, `src/reports/window.ts`): `return at >= from && at < until;` with the doc comment unchanged; terms `inclusive, exclusive, boundary, last instant, <=`. `tw-assert-loosen` (u1-p2, `test/window.test.ts`): `expect(isWithin(UNTIL, FROM, UNTIL)).toBeDefined();`; terms `weaken, loosen, toBeDefined, vacuous, matcher`. `sec-missing-guard` (u2-p1, `src/http/routes.ts`): `router.post("/orders/:id/cancel", cancelHandler);` beside two `requireAuth(...)` siblings; terms `auth, guard, requireauth, unauthenticated, 401`. `con-event-key` (u2-p1, `src/events/emitter.ts`): `return JSON.stringify({ type, id: order.id, at });`; terms `orderid, payload, consumer, audit, rename`. `con-config-default` (u2-p2, `src/config/load.ts`): `pageSizeDefault: 50` inside `DEFAULTS`; terms `default, 20, docs/api, contract, config`. `tw-test-skip` (u2-p2, `test/config.test.ts`): `it.skip("defaults the page size to 20", () => {`; terms `skip, skipped, disabled, weaken`. `sec-path-traversal` (u3-p1, new `src/orders/invoice.ts`): `return await readFile(join(dir, file));` with `file` from `?file=`; ENOENT maps to `null`; terms `traversal, ../, normaliz, contain, escape`. `cor-swallowed-error` (u3-p1, `src/orders/handlers.ts` `listHandler`): `try { rows = listOrders(...) } catch { rows = []; }`; terms `swallow, silent, catch, empty, 500`. `con-wire-key` (u3-p2, `handlers.ts` `toWire`, at least 7 lines from the previous seed): `totalCents: row.total_cents`; terms `total_cents, wire, rename, breaking, api`. `tw-expectation-deleted` (u3-p2, `test/handlers.test.ts`): the line `expect(body.orders[0].total_cents).toBe(1250);` is removed, with `locate` on `it("lists orders with their totals"` from 0 to 6 and `present.notContains` on that line; terms `delet, remov, total_cents, expectation, weaken`. **Decoys:** `dec-internal-rename` (u2-p1, `src/orders/format.ts`): non-exported `fmt` → `formatCents`, with every caller in the file updated; terms `rename, breaking, consumer, export`. `dec-test-reason` (u3-p1, `test/handlers.test.ts`): the 404 assertion becomes `{ error: "order 99 not found" }` under `// reason: the 404 body now names the missing order id (docs/api.md, Errors, changed in this pass);`, with docs/api.md and the handler changed to match; terms `weaken, loosen, changed test, justif`. `dec-allowlist-order` (u3-p2, new `src/orders/export.ts`): `const EXPORT_COLUMNS = { created: "created_at", total: "total_cents", customer: "customer" } as const;`, with the column taken from `EXPORT_COLUMNS[key] ?? "created_at"` inside ``ORDER BY ${column} ASC``; terms `inject, concatenat, interpolat, sql`. No seed or decoy span lies within 3 lines of another in the same file. **Patches carry no comment hinting at a defect.** **The plan** (`/st-plan` shape, `content/commands/st-plan.md:311-364`). Head: `id: replay`, `intent: feature`, `stamp: {{STAMP}}`, `reads: [docs/api.md, src/…]`. Six units, `u1-p1 → u1-p2 → u2-p1 → u2-p2 → u3-p1 → u3-p2`, as a single `depends_on` chain. Each unit's text: "Apply `vendor/contrib/<id>.patch` with `git apply --3way`, then <task>, and make the gates green." The tasks: u1-p1, document `sort` and `page` in docs/api.md and test the newest-first default; u1-p2, add `GET /orders/count?since&until` over `isWithin` and test the empty window; u2-p1, return 409 `{error:"already cancelled"}` on a second cancel, with a test; u2-p2, reject a non-positive `exportBatchSize` with a test; u3-p1, test that a missing invoice returns 404; u3-p2, test that `GET /orders/export` returns CSV with a header row. `verify`: `npm run lint && npm run typecheck && npm test`. Each unit stays under 400 lines and 8 files |
| `testCriteria` | These run in `test/replay/seeds.test.ts`, default suite, git only. (1) Base plus the six patches apply in order with `git apply --3way`. (2) For every seed and decoy, `locate.text` occurs exactly once in `file` in the pure seeded tree and resolves to `span`; `present` holds there and fails in the base tree, or in the preceding state for a deletion seed. (3) The seeds give 12 ids with 3 per class, 2 per pass, security seeds Critical and all others Warning; 3 decoys; each item has 3–6 terms. (4) No two spans in one file lie within `lineTolerance`. (5) No id matches `/^(?:AD\|Q\|AL\|EV\|DR\|B\|C\|BD)[-‐-―−－]\d{2,4}$/`. (6) The rendered plan parses to 6 unit sections whose ids equal `PASS_IDS` and whose `depends_on` values form a single chain. Behind `STAMITY_REPLAY_SUITE=1`: after each cumulative patch, the fixture's own lint, typecheck and test gates stay green, which is the "gates miss it" property |
| `edgeCases` | An implementer resolves a `--3way` conflict by dropping a seed. The lens-start snapshot shows `present` false, so the seed is counted "caught by implementer" and leaves the recall denominator (r7) |
| `depends_on` | r2-fixture-generator, r3-service-base |
| `verify` | `npx vitest run test/replay/seeds.test.ts && STAMITY_REPLAY_SUITE=1 npx vitest run test/replay/seeds.test.ts && npm run gate` |

Confidence: medium. The seed table follows `final.md:67-75`; the shapes and couplings are this draft's design (inferred). Each "gates miss it" claim is proved by the opt-in gate-green test, not asserted.

### r4b-oracles — hidden oracles, reference fixes, and the runner

| Field | Content |
|---|---|
| `id` | r4b-oracles |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/v1/oracle/oracles.patch` (new: adds `test/__oracle__/harness.ts` plus 9 `test/__oracle__/<seed-id>.test.ts`), `evals/replay/v1/oracle/reference-fixes.patch` (new), `scripts/replay/oracle.mjs` (new), `test/replay/oracle.test.ts` (new) |
| `interfaces` | **Behaviour oracles** go through HTTP or exported base functions, so a refactor keeps them valid. The harness wraps `db.prepare` to record SQL text. `sec-sql-sort`: an authenticated `GET /orders?sort=zz_marker_col`; pass iff no recorded SQL contains `zz_marker_col`. `sec-missing-guard`: an unauthenticated `POST /orders/1/cancel` returns 401 and order 1 stays `open`. `sec-path-traversal`: `GET /orders/1/invoice?file=..%2Fsecret.txt` (secret file in the invoice directory's parent) returns 400 or 404 and the body lacks the secret. `cor-page-offset`: `GET /orders?page=1&size=2` returns the two newest ids. `cor-date-boundary`: `isWithin(U,F,U) === true`. `cor-swallowed-error`: `db.close()` then `GET /orders` returns 500. `con-event-key`: an authenticated cancel publishes a payload with `orderId === 1`, and `auditLine` returns `"order 1 order.cancelled"`. `con-config-default`: `loadConfig({}).pageSizeDefault === 20`. `con-wire-key`: `orders[0].total_cents` is a number. **Static oracles** (the three test-weakening seeds) come from `seeds.json` regexes. `tw-assert-loosen`: mustNotMatch `isWithin\(\s*UNTIL,\s*FROM,\s*UNTIL\s*\)\)\.toBeDefined\(\)`; mustMatch `isWithin\(\s*UNTIL,\s*FROM,\s*UNTIL\s*\)\)\.(?:toBe\|toEqual\|toStrictEqual)\(true\)\|\.toBeTruthy\(\)`. `tw-test-skip`: mustNotMatch `\b(?:it\|test\|describe)\.skip\(`; mustMatch `defaults the page size to 20`. `tw-expectation-deleted`: mustMatch `total_cents\)?\.toBe\(1250\)\|total_cents:\s*1250`. **`oracle.mjs`:** `export function applyOraclePatch(treeDir, patchPath)` (plain `git apply`; the files are new); `export function runOracles(treeDir, { seeds, vitestEntry }) → { schema:"stamity/replay-oracle/v1", results:[{ seed, kind, status:"pass"\|"fail"\|"error", detail }] }`. It runs `node <vitestEntry> run test/__oracle__ --root <treeDir> --reporter=json --outputFile <tmp>`: a file whose tests all passed is `pass`, one with a failed assertion is `fail`, one that failed to load is `error`; a missing static file is `error`. `detail` is at most 300 characters and passes through `redactPaths` (`scripts/qa/redact.mjs:43`). "pass" means the defect is absent |
| `testCriteria` | Default suite: both patches apply to the pure seeded tree (`git apply --check`); the oracle file set maps one-to-one to the 9 behaviour seeds; the static regexes compile. Behind `STAMITY_REPLAY_SUITE=1`, with `node_modules` symlinked (junction on Windows) to this checkout's: (1) on the pure seeded tree all 12 oracles report `fail`, none `error`; (2) with `reference-fixes.patch` applied, all 12 report `pass`. That is each oracle seen red, then green (`.claude/rules/stamity-testing.md` floor 2). (3) On the base tree the static oracles report `pass` |
| `edgeCases` | An agent renames an exported function an oracle imports: that oracle reports `error`, never `pass`. RESULTS counts `error` separately, and a seed whose oracle errors counts as unfixed in the "approved with a seed unfixed" row |
| `depends_on` | r4a-seed-patches |
| `verify` | `npx vitest run test/replay/oracle.test.ts && STAMITY_REPLAY_SUITE=1 npx vitest run test/replay/oracle.test.ts && npm run lint && npm run typecheck && npm run gate` |

Confidence: medium. The red-then-green proof is direct once built. The oracles' robustness to agent refactors is unverified until the pilot.

### r5-transcript-walk — the attribution walk ported from the r1 method

| Field | Content |
|---|---|
| `id` | r5-transcript-walk |
| `requirements` | REQ-CTX-015 |
| `files` | `scripts/replay/transcript.mjs` (new), `test/replay/transcript.test.ts` (new), `test/replay/synth.ts` (new; builders of synthetic transcripts and capture directories, shared by r6, r7 and r8 as a reader) |
| `interfaces` | **`walkTranscriptLines(lines: string[]) → { events, requests, deliveries, dispatches, bash, compactions, skipped }`.** A pure port of `r1-measurement/measure.cjs:40-356`, with the same counting rules: characters are JS string length; attachments count only `rendered`; sidechain rows are skipped; API-error stubs are excluded; `seg` goes up at each `compact_boundary`. **`walkTranscriptFile(path): Promise<Walk>`** reads with readline, because lines can be megabytes (`measure.cjs:4-5`). **`scanSubagent(jsonlPath, metaPath) → { agentType, requestedModel, models:{id:n}, nReq, processed, inputSide, outTok, think, firstPrompt }`**, with processed = Σ over requests, deduplicated by `message.id`, of `input + cache_creation + cache_read + output` (`subagents.cjs:4-5, 40-43`). **`bashClass(cmd)`, `heredocs(cmd)`** ported verbatim (`measure.cjs:58-116`). **`ledgerWrite(toolUse) → { kind, chars } \| null`**, where `kind` is one of seven, detects both shapes. **`export const LEDGER_GATED_KINDS = new Set(["heredoc","echo","writeEdit","verb"])`** — the four kinds REPLAY-v1 §8 names, and the only ones loop-characters term (c) sums: `heredoc` (a heredoc whose cat/tee target is `*ledger.jsonl`, or whose unredirected body types ledger rows — a `phase` key and a phase-local id; `repeats.cjs:26-31, 62-80`), `echo` (a heredoc-free command redirecting `>>` into `ledger.jsonl`, or typing a `"phase"` row beside it with no read or search head verb), `writeEdit` (a Write, Edit or MultiEdit on `*ledger.jsonl`) and `verb` (the ledger verb `/(?:^\|[\s;&(])(?:npx\s+(?:--yes\s+)?)?(?:@zomarit\/stamity\|stamity\|st)\s+ledger\s+(?:append\|close\|status)\b/`, the whole command). The three kinds §8 is silent on, returned so the measurement reports them beside the gated figure and never inside it: `helperHeredoc` (a heredoc whose target's basename names `ledger` but is not `*ledger.jsonl`), `helperWriteEdit` (a Write, Edit or MultiEdit on such a basename) and `codeHeredoc` (an unredirected heredoc body that opens `ledger.jsonl` from code without typing rows). When one command holds heredocs of several kinds, the gated kind wins, then `helperHeredoc`, then `codeHeredoc`, and `chars` counts the winning kind's bodies only. **`roleFunction(subagentType)`**: implementer → build; fixer → fix; reviewer, security, performance, design-quality → verdict; test-runner → gate; everything else → other. This replaces plan-008's description regexes (`classify.cjs:6-21`), which do not transfer. **`synth.ts`** exports `mainLine.{userText, taskNotification, toolResult, assistantText, agentToolUse, sendMessage, bashToolUse, readToolUse, compactBoundary, attachment}`, `subagentFile(...)`, and `writeCapture(dir, spec)`, which writes the whole run-directory layout from the Contract census (run.json, captures/transcript/…, markers.jsonl, snapshots/, state/, oracle.json) |
| `testCriteria` | Over `synth.ts` builders: a delivered notification's characters count as `returns.report`; a queued attachment without `rendered` is skipped and tallied; a `compact_boundary` starts `seg` 1 and records `trigger` and `preTokens`; a baseline heredoc `cat >> .stamity/runs/r/ledger.jsonl <<EOF` and a changed-shape `npx @zomarit/stamity ledger append --run r --phase build --source reviewer --report …` are both detected with their characters; `scanSubagent` deduplicates two assistant lines sharing a `message.id`; outputs are equal whether the lines come from the file or the array |
| `edgeCases` | An unparseable line is counted under `skipped.entryTypes.PARSE_ERROR` and the walk continues, as in `measure.cjs:217`. An `isApiErrorMessage` stub stays out of every class |
| `depends_on` | none |
| `verify` | `npx vitest run test/replay/transcript.test.ts && npm run lint && npm run typecheck && npm run gate` |
| `amended` | amended 2026-09-23: `ledgerWrite` returns the seven kinds as landed, with the exported `LEDGER_GATED_KINDS` (heredoc, echo, writeEdit, verb) naming the four term (c) may sum, and an unparseable line is tallied at `skipped.entryTypes.PARSE_ERROR`, not `skipped.PARSE_ERROR` (ledger rows `build/68`, `build/28`; lane head f6286920) |

Confidence: high (direct: the r1 scripts at the cited lines). The role-only classifier is inferred from the fixture's fixed roster.

### r6-findings-matcher — findings from both shapes, and the deterministic matcher

| Field | Content |
|---|---|
| `id` | r6-findings-matcher |
| `requirements` | REQ-CTX-015, REQ-CTX-001, REQ-CTX-002, REQ-CTX-005, REQ-CTX-008 |
| `files` | `scripts/replay/findings.mjs` (new), `test/replay/findings.test.ts` (new) |
| `interfaces` | `Finding = { source:"return"\|"report"\|"digest"\|"ledger", role, file, line, lineEnd, severity, text, localId\|null, ledgerId\|null, reportPath\|null }`. **`extractFreeText(text, meta) → Finding[]`** (baseline returns). It splits the text into blocks: a table row, a list item with its indented continuation, a heading with the lines below it up to the next heading, or a paragraph. A block is a finding iff it holds `\b(Critical\|Warning)\b` and at least one locator `/(?<![\w/.-])((?:[\w.-]+\/)*[\w.-]+\.(?:ts\|js\|mjs\|json\|md))(?::\|#L)(\d+)(?:\s*[-–]\s*(\d+))?/`. One Finding is emitted per locator; the severity is the block's first severity word. Absolute fixture paths are made relative first. **`parseFindingsBlock(text) → { findings, errors }`** reads C2 fences whose info string is `stamity-findings`; a malformed line goes to `errors` and is skipped (`contracts.md:49-62`). **`parseDigest(text) → { status, verdict, confidence, report, findings, security }`** reads the C4 labels (`contracts.md:71-84`). **`parseClosures(text)`** reads the C9 `stamity-closures` block. **`ledgerFindings(rows)`** reads the C3 fields: the `evidence` locator is taken up to ` — `; `report` and `decision_needed` are carried when present. **`verdictOf(text)`** matches `/verdict[:*\s]*\**\s*(approve\|request-changes)/i` in both shapes (`measure.cjs:183`). **`matchItems(findings, items, spansByFile, { tolerance:3 })`** returns `{ matched: {id: findingIdx[]}, adjudication: [{ id, findingIdx }] }`. A match needs the same file, an intersecting line range and at least one term (case-insensitive substring); a location match without a term goes only to `adjudication`. One finding may match several items |
| `testCriteria` | A baseline table row `\| Critical \| src/store/query.ts:12 \| sort value concatenated into SQL \|` matches `sec-sql-sort` (span [11,11]). The same row reading "style nit" goes to adjudication, not a match. A finding at line 16 misses at tolerance 3. A C2 block with one malformed line yields its valid rows and one error naming the line. A C4 digest's `findings:` line `W-1 src/store/paging.ts:4 — page 1 skips the first 10 rows` parses to file, line and text. A ledger row whose evidence is `src/http/routes.ts:9 — cancel route has no guard` matches `sec-missing-guard`. `verdictOf` reads `**Verdict:** request-changes` and `verdict: approve` |
| `edgeCases` | A finding that names a directory with no line is not a finding and is not counted as unmatched. Any C2 id with two or more digits after `C-` in a test would fail the leak gate, so synthetic ids stay below ten |
| `depends_on` | r5-transcript-walk (reads `synth.ts`) |
| `verify` | `npx vitest run test/replay/findings.test.ts && npm run lint && npm run typecheck && npm run gate` |

Confidence: medium. The C2, C4 and C9 grammars are direct (`contracts.md`). The free-text block heuristic is inferred, and its miss rate is what the adjudication list exists to expose.

### r7-measure — per-run metrics over one capture

| Field | Content |
|---|---|
| `id` | r7-measure |
| `requirements` | REQ-CTX-015, REQ-CTX-012, REQ-CTX-013 |
| `files` | `scripts/replay/measure.mjs` (new), `test/replay/measure.test.ts` (new) |
| `interfaces` | **CLI:** `node scripts/replay/measure.mjs --run-dir <dir> --seeds evals/replay/v1/seeds.json --out <measurement.json> [--forbid <absPath>]…`. **Export:** `measureRun(runDir, { seeds, forbid }) → Measurement`. **Measurement** (`stamity/replay-measurement/v1`): `{ runId, shape, kind, invalid: string[], passes: PassRow[], totals, compactionSamples, wholeBranch, adjudication, models }`. **Pass attribution:** `attributePass(desc, prompt)` finds the first `\bu[1-3]-p[12]\b` in the description, else a single distinct id in the prompt; several distinct ids give `multi`. **Branch-level:** verdict dispatches after u3-p2's last reviewer approval that carry no single id, or that match `/whole[- ]branch/i`. **Loop characters:** Σ over non-branch agents with function build, fix, verdict or gate of (a) their deliveries (notification part or sync tool_result), (b) their Agent prompts and SendMessages, excluding resumes `/^Resume\|after the (?:rate limit\|stall)/i`, which are reported separately. Added to that: (c) ledger writes — only calls whose `ledgerWrite` kind is in `LEDGER_GATED_KINDS` (heredoc, echo, writeEdit, verb; the kinds REPLAY-v1 §8 names) — with their tool_results; every other kind `ledgerWrite` returns (`helperHeredoc`, `helperWriteEdit`, `codeHeredoc`) is reported per kind beside the gated figure, never inside it, so a sum over every non-null result, which would ease the gate, is ruled out; (d) brief files written by the orchestrator (`/\/briefs?\/\|brief[-\w]*\.md\|\/lanes\//`) with their results; (e) report reads, meaning Read or Bash read-class calls naming `.stamity/runs/*/reports/` or `/tasks/*.output`, with their results. Driver messages are excluded. **Loop characters per pass = the total ÷ 6.** The per-pass split is informative only, and is flagged unreliable when more than 20% is unattributed. This is the r1 method (`perpass.cjs:1-2`, `proposals.cjs:124-146`) plus (e), so P1's saving cannot move into on-demand reads. **Sub-agent tokens per pass** = Σ `processed` over loop-function agents ÷ 6. Output tokens and the notification trailer are reported beside it; the trailer is final context, not spend (`r1-measurement/out-roles.md:19`). **Capture paths:** every capture file is read through the layout the Contract census row fixes and `writeCapture` (`test/replay/synth.ts`) returns as `CaptureLayout`: `run.json` in the run directory, everything else under its `captures/` — `captures/transcript/<session>.jsonl`, `captures/markers.jsonl`, `captures/snapshots/<pass>/<worktree>/…`, `captures/state/<compaction-<n>-pre\|end>/runs/<run-id>/…` — never a literal `snapshots/P/` or `state/` under the run directory. **Recall:** a seed counts as present at pass P iff its `present` rule holds in some copy under `captures/snapshots/<P>/` (the main checkout or any worktree), otherwise it is "caught by implementer". Found = matched by any verdict-role finding (return, digest, report, or a ledger row from a verdict source), with the stage (pass or branch) and `foundRound1` recorded. **Decoys:** flagged = matched Critical or Warning. **Unmatched:** Critical or Warning findings matching no item, deduplicated by block. **Verdicts per pass:** rounds = the reviewer's deliveries; final class `approve` (1 round, approve), `approve-after-fixes` (more rounds, approve) or `blocked` (last verdict request-changes, or a BLOCKED_* return); `approvedWithSeedUnfixed` = approve and some seed of the pass has an oracle status other than `pass`. **Compaction samples:** for each driver compaction event, at-risk = verdict-role Critical or Warning findings delivered before the boundary (transcript order) with no ledger row in `captures/state/compaction-<n>-pre/runs/<run-id>/ledger.jsonl` (same file and line within ±3, or `report` equal to the report path). Lost = at-risk, no row at run end, and not a seed whose oracle passes. Valid iff at-risk ≥ 1. `compactionsAuto` counts `trigger:"auto"` only; projected compactions per 10 passes = 10 × context tokens per pass ÷ 947,000, reported only. **Invalid** when an init or sub-agent model is outside the pins, a `--forbid` path or `seeds.json`/`__oracle__` appears in any tool input, or `run.json.end.reason` is not `complete` |
| `testCriteria` | Two synthetic captures built with `writeCapture`, one per shape, each with one reviewer finding on a seed, one on a decoy, one unmatched, a fixer round and one forced compaction. (1) Baseline recall 1/1, decoy flagged 1, unmatched 1. (2) Changed shape (report file with a C2 block, digest return, `stamity ledger append` Bash call) gives the same three numbers. (3) The ledger-verb Bash call and its result count under (c); a Read of `reports/u1-p1-reviewer-r1.md` counts under (e). A `codeHeredoc` Bash call and a `helperWriteEdit` Write are each reported under their own kind beside the gated figure, and the loop characters equal the same capture's with those two calls removed. The captures are built with `writeCapture` and every path the test asserts on comes from its returned `CaptureLayout`. (4) A finding delivered before the boundary with no row in the pre-snapshot is at-risk 1; with a row at end it is lost 0; with no row at end and the seed's oracle failing it is lost 1. (5) A dispatch whose prompt names `u2-p1` and `u3-p1` attributes to `multi`. (6) A tool input containing a `--forbid` path marks the run invalid. (7) A seed whose `present` fails in every snapshot copy is caught by the implementer and leaves the denominator |
| `edgeCases` | A run with no valid compaction sample: `compactionSamples` lists the invalid ones with `valid:false`, and the loss row is decided in r8b, not here |
| `depends_on` | r5-transcript-walk, r6-findings-matcher |
| `verify` | `npx vitest run test/replay/measure.test.ts && npm run lint && npm run typecheck && npm run gate` |
| `amended` | amended 2026-09-23: term (c) sums only the `ledgerWrite` kinds in `LEDGER_GATED_KINDS` and reports every other kind beside the gated figure, never inside it; capture files are read through the `CaptureLayout` that `writeCapture` returns (the `captures/` prefix), not literal `snapshots/P/` and `state/` paths; testCriteria (3) gains the reported-beside case (ledger rows `build/68`, `build/27`; r5 lane head f6286920) |

Confidence: medium. The method is direct from the r1 scripts. Addition (e), the pass regex and the branch rule are inferred and need the pilot's confirmation (Unknowns).

### r8a-score-run — per-run summary.json and RESULTS.md, thresholds from the protocol

| Field | Content |
|---|---|
| `id` | r8a-score-run |
| `requirements` | REQ-CTX-015 |
| `files` | `scripts/replay/score.mjs` (new), `test/replay/score.test.ts` (new) |
| `interfaces` | **CLI:** `score.mjs run --measurement <m.json> --run-json <run.json> --protocol evals/replay/REPLAY-v1.md --run-id <YYYY-MM-DD>-replay-<n> --kind pilot\|scored --out-dir evals/replay/runs/<run-id> [--reference <baseline summary.json>…]`. It refuses an existing out-dir, a run id not matching `^\d{4}-\d{2}-\d{2}-replay-\d+$`, and a `run.json.instrument.protocolSha256` different from sha256 of `--protocol`. `score.mjs check --runs evals/replay/runs --protocol <p>` validates every summary against the schema, the protocol sha, one instrument commit across runs, and the absence of `/Users/`, `/home/`, `/private/var/` and `/var/folders/`. **Exports:** `parseThresholds(md)` (exactly one `replay-thresholds` fence; unknown or missing keys refused); `summarize(measurement, runJson, protocolSha) → Summary`; `renderResults(summary, thresholds, reference?) → string`. **`summary.json`** (`stamity/replay-summary/v1`): `{ runId, kind, shape, protocol:{path, sha256, commit}, instrument:{commit, files:{path:sha256}}, cli:{commit, version, tarballSha256}, client:{version, binarySha256, orchestratorModel, resolvedModels}, fixture:{baseCommit, planSha256, depsSha256}, mechanism:"interrupt"\|"auto-window", timing:{activeMs, pausedMs, capacityHolds, nudges, restarts}, passes:[{id, loopChars, breakdown:{returns, prompts, ledger, briefs, reportReads, resumes}, subagentTokens, verdict:{finalClass, rounds, approvedWithSeedUnfixed}, seeds:[{id, present, caughtByImplementer, found, foundRound1, stage, oracle}], decoysFlagged:[]}], totals:{loopCharsPerPass, subagentTokensPerPass, mainContextChars, contextTokensPerPass, compactionsAuto, projectedPer10, recall:{found, denominator, byClass}, decoyFalseFlags, unmatched, oraclePass, oracleError}, compactionSamples:[{placement, trigger, preTokens, postTokens, atRisk, lost, valid}], wholeBranch:{finalClass}, adjudication:[{item, pass, role, locator, excerpt≤200}], invalid:[], notDone:[] }`. **RESULTS.md**: head with pins and the protocol sha; the per-metric table beside its threshold (per-run rows only where a baseline reference was supplied); the per-pass table; seeds; decoys; compaction samples; adjudication; then "No threshold moved." and `Not done:`. Every excerpt passes through `redactPaths(text, spellingsOf(fixtureRoot,"<fixture>"))` (`scripts/qa/redact.mjs:43-67`). Import from `.mjs` with `// @ts-expect-error — native ESM contributor tool, outside the product package.` (`test/qa/bind.test.ts:5-6`) |
| `testCriteria` | `parseThresholds` over the committed REPLAY-v1.md returns the r1 values; a copy with a duplicated or unknown key throws naming it. `run` over the r7 synthetic measurement writes both files, and `check` passes on them. An excerpt carrying `/Users/x/…` and the fixture root comes out as `<home>/…` and `<fixture>/…`. A second `run` into the same directory is refused. The four r1 message sha256 values match (r1's testCriteria) |
| `edgeCases` | A pilot is summarized with `kind:"pilot"`, its RESULTS headed "pilot — not scored", and it is excluded from `compare` inputs except for the pilot-variance check |
| `depends_on` | r1-protocol, r7-measure |
| `verify` | `npx vitest run test/replay/score.test.ts && npm run lint && npm run typecheck && npm run gate` |

Confidence: high on placement and redaction (direct: `rubricCoreHash.test.ts:36-44`, `repo-hygiene.mjs:9, 49-54`, `redact.mjs`). The schema is this draft's design.

### r8b-score-compare — COMPARISON-v1 and the merge-gate verdict per C12 row

| Field | Content |
|---|---|
| `id` | r8b-score-compare |
| `requirements` | REQ-CTX-015 |
| `files` | `scripts/replay/compare.mjs` (new; imported by `score.mjs compare`), `test/replay/compare.test.ts` (new) |
| `interfaces` | **CLI:** `score.mjs compare --baseline <s>… --changed <s>… [--pilot-baseline <s>] [--pilot-changed <s>] --protocol <p> --out evals/replay/COMPARISON-v1.md`. **Export:** `compare(baseline[], changed[], thresholds, pilots?) → { rows:[{ id, rule, baseline, changed, verdict:"PASS"\|"FAIL"\|"NOT-EVALUATED"\|"CARRIED" }], mergeGate:"PASS"\|"FAIL", sampleCount:{required, got} }`. **The rows:** `security-seeds`: every security seed found in every changed scored run, unless at least one baseline scored run also missed it; a seed caught by the implementer counts as found. `pooled-recall`: changed rate × 36 ≥ baseline rate × 36 − 1. `decoy-flags`: pooled changed ≤ pooled baseline. `compaction-loss`: lost = 0 in every valid changed sample, and at least 1 valid sample, otherwise NOT-EVALUATED. `verdict-class`: the modal final class per pass is equal on ≥ 5 of 6 passes. `verdict-rounds`: on every pass, the absolute difference of median rounds is ≤ 1. `approved-unfixed`: pooled changed count ≤ pooled baseline. `loop-chars`: every changed scored run ≤ 0.5 × the baseline median. `subagent-tokens`: the changed shape's mean sub-agent tokens per pass over its scored runs ≤ 1.2 × the baseline shape's mean (plan resolution R29). `eval-set-floors`: CARRIED to session 2. **mergeGate** is PASS iff every row except the CARRIED one is PASS. It refuses mixed protocol sha values, fewer runs than `scoredRunsPerShape`, or exactly 3 runs of a shape whose three scored runs differ by more than 2 seeds found (max − min), which requires 5 (plan resolution R28) |
| `testCriteria` | Synthetic summaries: a changed shape with one security miss that the baseline found in all runs FAILs `security-seeds`, and PASSes when one baseline run also missed it. Recall 33/36 against 35/36 FAILs and 34/36 PASSes. A changed run at 51% loop characters FAILs. No valid sample gives NOT-EVALUATED and a merge gate of FAIL. Pilots differing by 3 seeds with 3 scored runs are refused, naming 5 |
| `edgeCases` | Denominators differ between shapes because implementers caught different seeds: rates are compared scaled to 36, and both denominators are printed in the row |
| `depends_on` | r8a-score-run |
| `verify` | `npx vitest run test/replay/compare.test.ts && npm run lint && npm run typecheck && npm run gate` |

Confidence: medium. The rows are direct from `contracts.md:165-173`; three readings are inferred (Unknowns U-R1 to U-R3).

### r9-driver — the headless driver, in the private layer

| Field | Content |
|---|---|
| `id` | r9-driver |
| `requirements` | REQ-CTX-015, REQ-CTX-013 |
| `files` | `<private>/runs/package-16/replay/driver/{replay.mjs, session.mjs, markers.mjs, marker-hook.mjs, capacity.mjs, replay.test.mjs, README.md}` (new) |
| `interfaces` | **`replay.mjs prepare-client`** copies `~/.local/share/claude/versions/2.1.280` to `~/.stamity-replay/bin/claude-2.1.280` and records its sha256. It takes `--config-dir <path>` (the operator's own logged-in client folder, plan decision D11; the driver never creates, copies or moves a login), checks `--version` = 2.1.280, checks that every argv flag appears in `--help` and records the help text's hash (the run-32 precedent, `PROTOCOL.md:43-44`), and runs `auth status` against that folder (exit 0 required). It refuses a folder carrying a user `CLAUDE.md`, `agents/`, `commands/`, `output-styles/` or a non-empty `enabledPlugins`, and one whose `settings.json` hooks lack the pattern-kill guard (`/bin/bash <home>/.claude/hooks/block-pattern-kill.sh`; plan resolution R27); it records the folder's `settings.json` sha256. Every run sets `DISABLE_AUTOUPDATER=1` in the child's environment only — it never writes the operator's settings. **`prepare --shape baseline\|changed --cli-ref <sha> --instrument-commit <sha>`** builds the tarball (REPLAY §4). It refuses a dirty `evals/replay/` or `scripts/replay/`, or a HEAD other than the instrument commit. It prepares a shared deps directory once (a `npm install` in a staging copy of base) and records the sha256 of its lockfile. **`run --shape --kind --run-id --placements u2-p1,u3-p1 [--mechanism interrupt\|auto-window]`** builds the fixture (`createReplayFixture`), writes the marker settings, spawns the client, drives it, captures, runs the oracles on a copy (`runOracles`), then calls `measure.mjs` and `score.mjs run` into a staging directory. **`canary --id K-compact`**. **`export --run-id --public <repo>`**, which must be the last command of a run (the private driver's `export` precedent, `driver/README.md:36-44`). **`status`**. **`session.mjs`:** `startSession({ claudePath, configDir, cwd, argv, env }) → { send(text), interrupt(), close(), next(predicate, timeoutMs) }`. Stdin carries a user message `{"type":"user","message":{"role":"user","content":[{"type":"text","text":…}]}}` (`inspect.mjs:31-33`) or an interrupt `{"type":"control_request","request_id":"<uuid>","request":{"subtype":"interrupt"}}` (the 2.1.280 binary's print-mode stdin handler branches on `request.subtype==="interrupt"`). Stdin stays open until the end condition. **`marker-hook.mjs <Event>`** is registered through `--settings`: `PreToolUse` (matcher `Agent\|Task`), `SubagentStop`, `SessionStart` (matcher `compact`), `PreCompact`, `PostCompact`. It appends one line to `$REPLAY_MARKER_LOG`: `{"v":1,"at","event","session_id","subagent_type"\|null,"agent_type"\|null,"agent_id"\|null,"pass"\|null,"description"≤160,"trigger"\|null,"source"\|null,"snapshot"\|null}`. On SubagentStop, `pass` is read from the first user message in `agent_transcript_path`. On the first verdict-role PreToolUse of a pass, it copies `src/ test/ config/ docs/` of every `git worktree list` entry into `$REPLAY_SNAPSHOT_DIR/<pass>/<worktree-basename>/`. It writes nothing to stdout, since SessionStart stdout would enter the context, and always exits 0. **Placement:** interrupt when, for pass P, verdict PreToolUse count equals verdict SubagentStop count, that count is at least 2, and there has been no fixer PreToolUse for P. **End condition:** a `result` event, no verdict or build agent in flight, and a fixture `.stamity/runs/*/record.md` whose `Status:` line lacks `in progress` (C5, `contracts.md:86-90`). Otherwise the nudge, at most 3 times. An 8 h active wall cap applies. **`capacity.mjs`:** `classify(event) → null \| { hold, resetsAt }` from a `rate_limit_event` whose status is `rejected` or whose utilization exceeds 0.98, a `result.api_error_status` of 429 or 529, or a limit text naming a reset. A hold lasts until the reset, at most 12 h (`PROTOCOL.md:238-247`); then the capacity resume message is sent. A process exit mid-run marks the run invalid. **Run-directory layout** is in the Contract census. `captures/` is never committed (the private hygiene gate's payload rule matches `captures/`, `scripts/repo-hygiene.mjs:31, 49-54`) |
| `testCriteria` | `node --test replay.test.mjs`, with no model call. User and interrupt messages encode byte-exactly. The placement predicate fires on a synthetic marker sequence (reviewer and security stopped, no fixer) and does not fire when a fixer PreToolUse precedes the second SubagentStop. The capacity classifier maps a `rejected` event with `resetsAt` to a hold and a 0.97 utilization to none. The end predicate needs all three conditions. The marker hook run on a synthetic SessionStart input writes nothing to stdout and one log line. `prepare-client` refuses a config folder that contains `skills/`. The environment builder drops `CLAUDE_FOO` and keeps `DISABLE_AUTOUPDATER=1` |
| `edgeCases` | The orchestrator dispatches the fixer before the last lens returns: the placement is skipped, the next one is used, and a run with neither fired is recorded with no valid sample (not invalid). The pinned binary copy fails to launch: `prepare-client` falls back to the versioned path with its sha pinned, and says so |
| `depends_on` | r2-fixture-generator, r4b-oracles, r7-measure, r8a-score-run |
| `verify` | `node --test <private>/runs/package-16/replay/driver/replay.test.mjs && node scripts/repo-hygiene.mjs --repo <private> --kind governance --base <private HEAD before this unit>` |

Confidence: medium. The environment, capture and export patterns are direct (`dispatch.mjs:13-14, 103-124`; `inspect.mjs:31`). The interrupt wire shape and the `--settings` flag are direct from the 2.1.280 binary. Headless behaviour with a held stdin is unverified until r10.

### r10-canary — K-compact proves the sequence before the pilot

| Field | Content |
|---|---|
| `id` | r10-canary |
| `requirements` | REQ-CTX-015 |
| `files` | `<private>/runs/package-16/replay/canaries/K-compact/record.json`, `<private>/runs/package-16/replay/canaries/K-compact/record.md` (new; raw material under `captures/`, uncommitted) |
| `interfaces` | `replay.mjs canary --id K-compact --shape baseline --units u1-p1,u1-p2 --placements u1-p2`. `record.json` = `{ id, at, client, mechanismDecision:"interrupt"\|"auto-window", checks:[{ id:"K1".."K9", pass, evidence }] }`. **K1:** the interrupt gives a control_response of success and a `result` within 60 s. **K2:** `/compact` gives a `system` `compact_boundary` with `trigger:"manual"` and `pre_tokens > post_tokens`, and the transcript line matches. **K3:** after the resume message, a verdict or build dispatch naming `u1-p2` occurs and the end condition is reached. **K4:** zero verdict or build agents in flight at the interrupt; after it, SubagentStop count equals PreToolUse count. **K5:** stdout carries assistant turns after a `result` event with no driver input between them (the session outlives the turn while background agents finish). **K6:** markers hold PreToolUse, SubagentStop, PreCompact, PostCompact and SessionStart(compact) rows. **K7:** the emitted review-gate hook ran (`.stamity/review-gate.json` exists in the fixture). **K8:** init model `claude-opus-5-5` and every sub-agent `message.model` recorded. **K9:** `<configDir>/projects/*/<session>.jsonl` and `…/subagents/agent-*.jsonl` exist. `mechanismDecision` is `interrupt` iff K1–K5 pass (REPLAY §7). A repeat canary with `CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000` runs only when that decision is `auto-window` |
| `testCriteria` | `replay.mjs status --canary K-compact` exits 0 only when K6–K9 pass and a mechanism decision is recorded. `record.md` carries no home path, and the public leak gate is not run over private files |
| `edgeCases` | K1 passes but K5 fails: the run would end at the first background dispatch. The decision is `auto-window`, and REPLAY §7's fallback applies with no protocol edit |
| `depends_on` | r9-driver, r4a-seed-patches (no human login: the replay runs on the account the operator's client folder is logged into, plan decision D11) |
| `verify` | `node <private>/runs/package-16/replay/driver/replay.mjs status --canary K-compact` |

Confidence: medium on the design (inferred from `final.md` §2.4 and the binary). Its outcome is unknown by construction.

### r11a-pilots — one pilot per shape

| Field | Content |
|---|---|
| `id` | r11a-pilots |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/runs/<date>-replay-1/{RESULTS.md,summary.json}` (baseline pilot), `evals/replay/runs/<date>-replay-2/{RESULTS.md,summary.json}` (changed pilot) |
| `interfaces` | `replay.mjs run --shape baseline --kind pilot --run-id <date>-replay-1`, then `export`; the same for `changed` at the candidate sha. The instrument commit is the one carrying r1–r8b, and REPLAY-v1.md is unchanged since it. `summary.json.kind` is `"pilot"`. The pilot checks recorded in RESULTS: baseline recall in [0.5, 0.95] (`final.md:255`); per-pass unattributed share; oracle `error` count; placement fired or missed |
| `testCriteria` | `node scripts/replay/score.mjs check --runs evals/replay/runs --protocol evals/replay/REPLAY-v1.md` exits 0. Each summary's `protocol.sha256` equals sha256 of the committed REPLAY-v1.md. `invalid` is empty, or a replacement run exists |
| `edgeCases` | Baseline pilot recall outside [0.5, 0.95]: the seeds are re-authored as a new `v1` commit before any scored run, and the thresholds do not move. If that is not acceptable, the result is REPLAY-v2 and the pilots restart |
| `depends_on` | r10-canary, r1-protocol, r8b-score-compare; the changed pilot also depends on every unit of `docs/plans/009-orchestrator-context-economy-01.md` and `docs/plans/009-orchestrator-context-economy-02.md` (the candidate) |
| `verify` | `node scripts/replay/score.mjs check --runs evals/replay/runs --protocol evals/replay/REPLAY-v1.md && npm run gate && node scripts/repo-hygiene.mjs --base fed39ac` |

Confidence: medium (inferred; the budget of about 2 h per run is an estimate, `final.md:168`).

### r11b-scored-and-comparison — 3 scored runs per shape (5 on variance) and COMPARISON-v1

| Field | Content |
|---|---|
| `id` | r11b-scored-and-comparison |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/runs/<date>-replay-<3..8>/{RESULTS.md,summary.json}` (12 generated files, or 20 on variance), `evals/replay/COMPARISON-v1.md` |
| `interfaces` | All baseline scored runs first, then changed, one run at a time on one account. The changed runs' RESULTS pass `--reference` pointing at the three baseline summaries, so each per-run row is stated. `score.mjs compare --baseline … --changed … --pilot-baseline …-replay-1/summary.json --pilot-changed …-replay-2/summary.json --protocol … --out evals/replay/COMPARISON-v1.md`. The COMPARISON head names both pilots, the mechanism, the instrument commit and the protocol sha. Then the ten rows, then `Merge gate: PASS\|FAIL`, then "No threshold moved.", then `Not done:` (the eval-set row carried to session 2) |
| `testCriteria` | `score.mjs check` exits 0 over every run. `compare` refuses a run count below `scoredRunsPerShape` and a variance case with fewer than 5. The COMPARISON merge-gate line equals `compare(...).mergeGate`, re-derived in `test/replay/compare.test.ts` from the committed summaries when the file exists |
| `edgeCases` | A changed run hits a capacity hold of up to 12 h: the pause is excluded from active time and recorded. A run marked invalid is replaced, at most 2 times per shape; beyond that the COMPARISON row is NOT-EVALUATED and the merge gate is FAIL |
| `depends_on` | r11a-pilots |
| `verify` | `node scripts/replay/score.mjs check --runs evals/replay/runs --protocol evals/replay/REPLAY-v1.md && npx vitest run test/replay && npm run gate && node scripts/repo-hygiene.mjs --base fed39ac` |

Confidence: medium (inferred).

## Contract census, risks and unknowns — the replay

#### Contract census

| Contract | Class | Producer | Consumers (searched) | Change kind | Closure |
|---|---|---|---|---|---|
| `seeds.json` `stamity/replay-seeds/v1` | persisted-name | r4a | r4b `oracle.mjs`, r6 `matchItems`, r7, r8a, r9; r2 must never copy it | add | clean: new file, no prior readers (`Grep "replay-seeds"` finds none in the tree) |
| Run-directory layout: `run.json` plus `captures/{stdin.jsonl, stdout.jsonl, stderr.txt, markers.jsonl, transcript/<session>.jsonl, transcript/<session>/subagents/agent-*.jsonl\|.meta.json, snapshots/<pass>/<worktree>/…, state/<compaction-n-pre\|end>/runs/<run-id>/{record.md, ledger.jsonl, reports/*.md}, final/tree.diff, oracle.json}` | wire-field | r9 | r7 (`--run-dir`), r5 `synth.ts writeCapture` | add | Facade: r5 and r7 code against this row, and r9 must emit exactly it |
| Marker line `{"v":1,…}` | event | r9 `marker-hook.mjs` | r9 placement logic, r7 | add | clean |
| `stamity/replay-measurement/v1` | wire-field | r7 | r8a | add | clean |
| `stamity/replay-summary/v1` | persisted-name | r8a | r8b, r11a, r11b | add | clean |
| `replay-thresholds` fence in REPLAY-v1.md | config-key | r1 | r8a `parseThresholds`, r8b | add | clean |
| Pass ids `u1-p1…u3-p2` | constant | r4a (the plan) | r2 `PASS_IDS`, r7 regex, r9 placements; C1 `<pass>` grammar (`contracts.md:41-44`) | add | reconciled(1): the ids satisfy the C1 regex and its banned prefixes |
| C2 `stamity-findings`, C4 digest labels, C3 `report` and `decision_needed`, C9 `stamity-closures` | wire-field | the Package 16 implementation units | r6 (read-only) | read | 0 unreconciled today; r6 re-censuses if any key moves |
| Ledger-verb command spelling (`stamity ledger`, `npx @zomarit/stamity ledger`) | config-key | the ledger-verb unit and the `/st-work` body edit | r5 `ledgerWrite` regex | read | open until the candidate body is read (Unknowns) |
| C5 `Status:` line | persisted-name | the record-head unit (changed); 1.9.1 record (baseline) | r9 end condition | read | guarded: the nudge cap and the wall cap end a run whose record never closes |
| `redactPaths`, `spellingsOf` (`scripts/qa/redact.mjs:43,58`) | symbol | existing | r4b, r8a (new importers) | none | clean: imported unchanged |
| `.gitattributes` | config-key | r2 (one added line) | git | add | clean |
| `vitest.config.ts` `heavy` list (`vitest.config.ts:18-24`) | config-key | not touched | the heavy replay tests are opt-in (`STAMITY_REPLAY_SUITE`), so CI does not run them | none | clean by design |

Confidence: high (direct searches: `Grep` for `replay-seeds`, `ignorePatterns` and `package.json` in `test/`; `test/ci/workflow.test.ts:4005-4009` hard-codes `/` and `/website`, and no replay `package.json` exists outside the patches).

**Breaking-change candidates:** none. The units add files and one `.gitattributes` line. No exported function, type, event, package export, persisted schema or CLI flag of the product changes.

#### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| The changed-shape fixture resolves `stamity` to npm 1.9.1, which has no ledger verb, and the run silently measures a hybrid | Warning | Tarball installed `--no-save` into the fixture (r2 step 5). r9 `prepare` checks that `node_modules/.bin/stamity ledger --help` exits 0 in the changed fixture and records the installed `dist/cli.js` sha256 |
| Headless interrupt, `/compact` and the held stdin behave differently from the SDK docs | Warning | r10's K1–K5 decide, and REPLAY §7 already declares the fallback and its validity rule |
| The client's updater prunes the 2.1.280 binary (2.1.281 is already installed beside it) | Warning | Binary copied to `~/.stamity-replay/bin` with its sha pinned; `DISABLE_AUTOUPDATER=1` |
| A copied or moved login breaks: the keychain service name is `Claude Code…-<sha256(configDir)[0:8]>` when `CLAUDE_CONFIG_DIR` is set (read from the 2.1.280 binary), and a copied OAuth credential can be invalidated when either copy refreshes it | Minor | The replay runs on the operator's own logged-in client folder, shared the way a second terminal shares it (plan decision D11); the driver never creates, copies or moves a login (amended 2026-09-23 at the build, ledger row `build/4`) |
| Leak gate: a C-, B- or Q-prefixed id with two or more digits in seeds, synthetic C2 blocks or quoted findings; home or temp paths in RESULTS | Warning | Id rule tested in r4a (5); `redactPaths` on every excerpt; `score.mjs check` refuses path shapes. Gate verdicts are read by exit code, never through `tail` |
| Oracles break on agent refactors and read `error` | Warning | HTTP-level oracles; `error` counted apart and treated as unfixed; the pilot shows the rate |
| Agents read outside the fixture (bypass permissions) and find `seeds.json` | Minor | `--forbid` makes the run invalid if the checkout path, the private-layer path, `seeds.json` or `__oracle__` appears in any tool input |
| Implementer lanes in worktrees hide the reviewed tree from a main-checkout snapshot | Warning | The hook snapshots every `git worktree list` entry, and presence is taken from any copy |
| The linear six-pass chain removes parallel lanes, so the replay under-represents lane traffic | Minor | Equal in both shapes. The trade was determinism of attribution and placement at n=3 |
| Forced interrupt, resume and nudges perturb the orchestrator | Warning | Byte-identical in both shapes and placed by one rule. No-compaction control runs were dropped to hold D10's "1 trial + 3 scored" (drop list) |
| Hard trigger 1: eval-set cases citing the edited corpus stay unmeasured until session 2 | Warning | The `eval-set-floors` row is CARRIED, and the merge record says so (`final.md:206`) |
| The windows share one account; a limit mid-run stretches wall clock | Minor | Wall clock is reported, not scored; holds last up to 12 h and are excluded from active time |
| Heavy opt-in tests never run in CI (`STAMITY_REPLAY_SUITE`) | Minor | Each unit's `verify` sets it locally. The light default-suite tests are git and fs only, so they are safe on Windows (learning `the-local-test-gate-is-weaker-than-ci`) |

Confidence: medium (inferred, each from the cited instrument).

#### Unknowns

| # | Question | What was probed | Why it did not settle | Smallest input that settles it |
|---|---|---|---|---|
| U1 | Does interrupt then `/compact` work over CLI stream-json stdin, and does a held stdin keep a `-p` session alive through background agents? | 2.1.280 binary: `request.subtype==="interrupt"` in the print-mode handler; `sendInterrupt` wire shape `{"type":"control_request","request_id","request":{"subtype":"interrupt"}}`; `final.md:274-275` | Static strings show the handler exists, not its effect on background tasks (the handler touches a task registry and "survivors") | r10 K1–K5 |
| U2 | Do `--settings` hooks merge with the project's hooks, does SessionStart(compact) fire headless, and does the stamity guard still run under `bypassPermissions`? | `--settings <file-or-json>` in the 2.1.280 help strings; `.claude/settings.json:9-67` | No run on record | r10 K6, K7 |
| U3 | What "the pilot varies by > 2 seeds" means with one pilot per shape | `contracts.md:172`; `final.md:162` | Two pilots per comparison mix the variance with the effect | A planner decision. **Default:** the absolute difference of the two pilots' found counts (r8b implements it) |
| U4 | Whether "in every scored run" also binds the sub-agent token clause, and what the baseline reference is | `contracts.md:171-172` | The sentence is ambiguous | **Default:** every changed run against the baseline median, for both clauses (r1 block `…Scope`) |
| U5 | Whether "unless the baseline missed it too" is judged per seed across runs | `contracts.md:168` | Several readings | **Default:** exempt if at least one baseline scored run missed it |
| U6 | The exact ledger-verb spelling in the candidate `/st-work` body, and whether the resume card uses the CLI | `contracts.md:105-116`; the candidate is not yet written | Other units own it | Read the candidate body; r5's regex already accepts three spellings |
| U7 | Whether the baseline orchestrator names unit ids in its dispatch prompts (per-pass split) | `final.md:280` | No baseline replay exists | Pilot 1's unattributed share; the thresholded figure is the per-run total ÷ 6 regardless |
| U8 | The final-tree semantics: which branch or worktree holds the merged work at run end | `content/commands/st-work.md:300-304` (the branch is left for the operator) | The run's own choice | Pilot 1: record the branch and unmerged lanes; oracles run on the main checkout's working tree |
| U9 | The unit ids of plan 009's implementation units, for the `depends_on` cells of r11a and r11b | Outside this brief | Another drafter owns them | The assembled plan |
| U10 | An explicit `--effort` for the orchestrator | `final.md:187`; the run-32 protocol keeps the default (`PROTOCOL.md:37-42`) | No decision recorded | **Default:** client default, recorded from the init event |

Confidence: high that these are open (direct: each probe listed ran and did not settle the question).

## Open questions

None; the replay's readings are settled in file 1 § Resolved details (R27–R31) and folded into the units above.
