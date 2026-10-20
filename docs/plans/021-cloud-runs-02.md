---
id: cloud-runs-02
intent: feature
stamp: e377be7aede16b491cb666121bafb502a336615d 2026-10-18
reads: [src/hooks/personOnly.ts, src/manifest/claudeSettings.ts, src/emit/hooksInfra.ts, src/cli/commands/run.ts, src/cli/engine/gitWrite.ts, src/runs/preflight.ts, src/runs/planCoverage.ts, src/runs/pullRequest.ts, src/runs/runContract.ts, src/cli/engine/ghRunner.ts, src/cli/commands/gate.ts, src/roster/agentPolicies.ts, src/cli/kit/packageName.ts, src/cli/commands/clean.ts, src/cli/docs/configReference.ts, src/runs/resumeCard.ts, src/runs/cardSource.ts, src/runs/layout.ts, src/hooks/scripts.ts, src/hooks/model.ts, src/hooks/portableRunner.ts, src/cli/commands/ledger.ts, src/cli/commands/check.ts, src/adapters/claude.ts, src/adapters/cursor.ts, src/adapters/copilot.ts, src/adapters/codex.ts, src/emit/agentsMd.ts, src/emit/planner.ts, src/emit/capabilityMatrix.ts, src/emit/skillsProjection.ts, src/content/charter.ts, src/tools/translator.ts, src/types/manifest.ts, src/types/markers.ts, src/manifest/manifest.ts, src/cli/engine/clientModels.ts, src/cli/commands/init/apply.ts, src/cli/commands/sync.ts, src/cli/commands/sync/engine.ts, src/cli/commands/sync/report.ts, src/cli/commands/config.ts, src/cli/docs/llmsIndex.ts, src/mcp/env.ts, src/worktree/policy.ts, content/skills/st-unattended/SKILL.md, content/rules/stamity-question-protocol.md, content/skills/st-verify/scripts/spec-plan-coverage.mjs, .github/workflows/ci.yml, .github/workflows/nightly.yml, .github/release-egress.md, .github/release-controls-checklist.md, test/hooks/personOnly.test.ts, test/hooks/personOnlyGuard.test.ts, test/cli/commands/runCheckpoint.test.ts, test/runs/planCoverageParity.test.ts, test/ci/workflow.test.ts, test/cloud/containerLeg.test.ts, test/hooks/sessionStartCard.test.ts, test/corpus/invariants.test.ts, test/docsPages.test.ts, scripts/qa/hook-runs.mjs, scripts/qa/form.mjs, scripts/qa/run.mjs, website/sidebars.ts, docs/customization.md, docs/getting-started.md, docs/capability-matrix.md, docs/security-mapping.md, docs/troubleshooting.md, docs/workspaces.md, CHANGELOG.md, SECURITY.md, evals/SET-v7.md, docs/specs/orchestrator-context.md, docs/specs/everyday-flows.md, docs/specs/model-ladder.md, docs/specs/worktree-lane.md, docs/specs/prove-behavior-and-value.md]
depends_on: [docs/plans/021-cloud-runs-01.md]
---

# Cloud runs — file 2 of 2: the guard's ask rule, long runs, each cloud, the proof and the cut's preparation

This file is self-contained. It is the second of two `/st-plan` artifacts for **Package 25**, which makes Stamity work in
the clouds of Claude Code, Cursor and Copilot as it does locally, and is cut as **1.16.0**. It runs after file 1
(`docs/plans/021-cloud-runs-01.md`, pull request #112), whose unattended declaration, ready check, run verbs, morning
list, pre-flight, person-only guard and `st-unattended` skill it builds on, and its branch is cut from #112's final
head. Two rules the maintainer set after file 1's build come first: attended, a person-only act that can be undone
gets the client's one-click approve prompt and the agent runs it, while every deletion and force push stays refused
(`v0a`, `v0a2`, `v0d`); and unattended, a run verb stands alone on its line (`v0b`, `v0c`). Then this file makes a
long run survive a machine that goes away, adds each cloud's specifics, proves the whole (the CI container leg
extended, the maintainer's cloud checks), writes the cloud page, folds PR #112's leftovers routed here (`v21`,
`v22`), and prepares the 1.16.0 cut. The cut itself (the full eval run, the spec flips, the tag and the publish)
follows the release checklist on the maintainer's yes; it is listed at the end, not as units. Paths file 1 moved are
exempt from this file's freshness guard (the plan-chain rule).

intent chosen: feature because the units add capabilities (an approve prompt for person-only acts, a stand-alone
run-verb rule, resume from the branch, a reclaim-proof review gate, cloud readiness, per-cloud detection and entry
points, a container proof leg, a cloud page); no defect is diagnosed.

## Context

No cloud keeps a long run alive by itself: Claude Code's cloud pauses an idle machine after minutes and restores only
the conversation when it comes back, Cursor hibernates and later deletes idle machines, and Copilot's cloud agent stops
every session at 59 minutes. Real unattended runs take twelve to fourteen wall hours and stop mostly on capacity. So a
run must continue from what its branch holds — the record, the ledger, the review count — and each cloud needs its own
entry, detection, readiness and limits stated. File 1's guard refuses every person-only act to an agent, attended or
not; the maintainer wants the attended reversible ones to cost one click instead. Out of scope: everything file 1
owns, a trigger or automatic pickup, a committed `.cursor/environment.json`, the GitHub Action as an overnight
surface, and Codex's cloud.

## Decisions

The maintainer's walks are summarised in file 1: the three clouds; proof by the vendors' documentation, a cloud-like
container in CI and the maintainer's own run per cloud; Copilot's long runs as chained sessions a person restarts; the
1.16.0 cut. On 2026-10-15: the declared defaults as they stand, updated for 1.15.0; the cloud checks on Claude Code and
Cursor only (no Copilot cloud-agent account, so Copilot's cloud rows read "documented, not run"); no CI secrets, so the
client legs are built and stay off. On 2026-10-16: the shell forms that still reach a run verb's environment are
closed by a class rule, a run verb standing alone on its line. On 2026-10-18: this file is built stacked on #112 (a
draft pull request into `main` that says so; #112 merges first); attended, a person-only act that can be undone asks
for one click and the agent runs it, deletions and force pushes staying refused even with a click, and unattended
unchanged; built first, in this file.

### Declared defaults this file builds

- **The ask rule.** Attended, merging, marking ready, approving, a non-forced push of the default branch, a tag, a
  release, publishing, secret and variable writes, protection, ruleset and custom-property writes and repository
  writes ask for one click; every deletion and every force push is refused; unattended, every person-only act is
  refused and carried on the morning list, whose walk then runs it after the person's click.
- **The run verb's line.** Unattended, a run verb passes only as one simple command; its own git runs without git's
  program-valued variables.
- **Long runs.** Frame continues an `in progress` record on the current branch, and the session start prints its card
  on `startup` too; a missing review counter is rebuilt from the run's `usage: review rN` lines instead of opening the
  gate; at a usage limit in a cloud machine the run checkpoints, refreshes the PR body and returns `BLOCKED_DEPENDENCY`
  naming the reset; no `/loop` or wakeups pace a cloud night, the gate runs in the background with a timeout, Cursor's
  `stop` hook continues while units remain, parallel implementers are capped and agent teams are off; lanes use the
  client's own isolation or run one at a time and fold into the run branch before each checkpoint; the cloud machine is
  made ready by a Claude Code session-start entry, Copilot's setup steps and `check`'s install lines for Cursor.
- **Each cloud.** Claude Code: a session with several repositories loads no hooks, and an unattended run refuses there;
  the GitHub Action is documented as a six-hour surface. Cursor: a cloud block in the emitted `AGENTS.md`, the session's
  context also through a once-per-conversation `postToolUse` row, managed runs detected by the `agent/runtime` metadata,
  the translator's Cursor entry split local from cloud. Copilot: a long plan as a chain of sessions of at most 59
  minutes, each ending in a committed checkpoint; the entry names the prompt file and the plan; roles run in line where
  no sub-agent tool exists; CI waits for a person's approval and the proof block says so.
- **The proof.** The container leg runs three cloud profiles, an offline run, two clones, a bare remote with the cloud's
  push rules and a `gh` stub, and blocks merges; the client-CLI legs and a release-prep unattended run are built and stay
  off until secrets exist; the maintainer's cloud checks are scripted; a changed vendor page re-owes its cloud's row.
- **The page and the cut.** One cloud page with the run contract's section; the capability matrix's cloud column gains
  the unattended rows; 1.16.0 cut by the whole release checklist on the maintainer's yes.

### Settled by this plan

- **Which clients ask.** Claude Code answers ask; Copilot CLI, Cursor and Codex keep refusing, and the security page
  names each reason (Copilot CLI holds an ask, but its tool-call payload names no calling agent, so the guard cannot keep
  the ask for the person alone; decided 2026-10-18 for `review/89`, its ask to return once the payload names the agent). Measured on 2026-10-18 in throwaway folders: Claude Code 2.1.302 holds a hook's `ask` in
  bypass-permissions mode (a `-p` run denies it for want of a person, as it denies a settings ask row and the default
  mode's ask), which its documentation does not state; its settings `permissions.ask` rows are documented to prompt in
  every mode. Cursor 2026.10.14 runs the command despite a `beforeShellExecution` ask under `--force`. Copilot CLI
  1.0.89 holds an ask under `-p --allow-all-tools`, and its documentation says an interactive session prompts. Codex's
  hooks page says an ask is parsed and not honoured, so the call goes through.
- **A refused act wins.** The verdict reads every act on a line and in a GraphQL text; one refused act refuses the whole
  call, so a deletion never rides an approval. `deny` stays true on every person-only verdict, so the run verbs refuse
  as today.
- **What else stays refused:** a line the guard cannot read (a hidden method or URL target, the nesting limit, no
  command), since the person cannot judge a hidden act from the prompt either; a local `git tag -d` or `-f`, a deletion
  or a force by its words; `gh repo sync --force` (a hard reset), `gh release upload --clobber` (it replaces an asset),
  `npm unpublish` and `npm dist-tag rm`; and a repository's visibility change and transfer: making a repository public
  cannot be undone in effect, a transfer back needs the new owner, and one settings prefix row covers every visibility.
- **Repository writes** that can be undone ask: rename, archive and unarchive, the default branch, and every settings
  flag of `gh repo edit` but `--visibility` (the security-and-analysis and merge toggles among them, today read only
  through their REST twin); plain `gh repo sync` and `npm dist-tag add` ask too.
- **Without the hook.** Where no hook runs, the settings' rows are the only layer, and an ask prefix row also matches a
  line that adds a refused flag later (`git push --tags --force`, `--all --prune`, `gh pr merge 7 -d`,
  `gh release upload v1 a --clobber`, `gh repo edit --default-branch x --visibility public`). A `*` inside a settings
  Bash row matches anywhere on the line (measured 2026-10-18 on Claude Code 2.1.302), so `CLAUDE_DENY_ROWS` gains a
  mid-pattern row for each refused flag that can follow an ask-class prefix, and the deny row wins over the ask row. A
  row ending in ` :*` after such a `*` matched nothing at all in the same measurement, so a colon-refspec deletion
  behind an ask prefix (`git push --tags origin :v1`) has no row; it and every respelling no row can name stay the
  hook's, and `SECURITY.md` names that residual.
- **The clients' answers are re-measured each release.** Attended safety now rests on each client holding an ask: a
  `--ask` mode of `scripts/qa/hook-runs.mjs` repeats the throwaway-folder measurement per installed client, and the
  release checklist runs it under the machine lock; a client whose ask lets the command run moves to refusing.
- **#112's last round** adds rows this file's guard units class on the rebase: `gh repo sync` and `gh repo unarchive`
  (ask, `--force` refused), dot segments resolved in HTTP paths, and a coded throw for local tags past the cap (refused).
  The cells' line numbers in `src/hooks/personOnly.ts` and the guard region of `src/hooks/scripts.ts` were read at
  `96f5eda4`; that round (`61c99765`) moved them by up to about a hundred lines at the stamp `e377be7a`, so each cell's
  named function is the anchor there.
- **The GitHub MCP rows** that can be undone, `create_branch` and `create_pull_request` among them, move to
  `permissions.ask`; `delete_repository` stays denied. A hook on those tools reads the mode and refuses them while an
  unattended run is in progress, since a settings row cannot read the mode and an ask would otherwise wait for a person
  in a cloud session.
- **No upgrade step.** 1.15.0 wrote no `permissions.deny` row, so no installed file holds the rows that move; this
  repository's own `.claude/settings.json` drops them in the integration lane. A checkout synced from an unreleased
  build before 1.16.0 keeps those deny rows, which the client reads before an ask, until a person removes them;
  `clean` names them, and `SECURITY.md` says so.
- **The morning walk** runs each held act; on Claude Code the client's approve prompt is the person's one click, and
  deletions, force pushes and every held act on Copilot CLI, Cursor and Codex go to the person as the exact command.
- **The run verb's line** is judged by its shape, not by spelling. The per-spelling rules stay: they also cover a verb
  inside a script and a variable set on an earlier line.
- **The run verbs' own git** runs without git's program-valued variables in an unattended run; `GIT_CONFIG_*` stays,
  since the pre-flight vetted it. Refusing a run instead was not taken: editors' terminals set `GIT_ASKPASS`, so every
  unattended run started there would refuse. A `GIT_CONFIG_*` variable gained after the pre-flight (an earlier line in
  a shell that persists, or the environment file `v5` writes) is a named residual, beside the scheduled proposal that the
  run verbs require a fresh pre-flight verdict.
- **Two attended residuals** named in #112's fourth round, a symbolic ref already on disk and a same-line branch switch
  before a push, stay named: `v0b` is unattended-only, and attended, a default-branch push now asks anyway.
- **"On the current branch"** is read from the record's `Branch:` line against `.git/HEAD`, read without spawning (the
  hook's no-spawn rule, `src/runs/cardSource.ts:56-60`), through one shared reader lifted from the ask gate's
  `currentBranch` (`src/hooks/scripts.ts:4064-4082`), which follows a linked worktree's `gitdir:`; a record with no
  `Branch:` keeps today's card.
- **A continuation on another machine** needs `stamity run start --run <id>` to take the run branch from origin (`v21`);
  the skill tells a fresh clone to run it first.
- **The rebuilt review count** carries an unrecorded verdict, so the gate holds until a review is recorded; the counter
  stays keyed by session (`src/hooks/scripts.ts:2879`), named in the record.
- **Cursor's continuation** is an adapter-owned `stop` script under a fixed emitted `loop_limit`, continuing only for an
  unattended run in progress on this branch whose record names units remaining; it runs through the adapter's script
  command, since the portable runner refuses a `followup_message` (`src/hooks/portableRunner.ts:476-482`).
- **The pacing text** is a cloud exception sentence in the skill; the agents' shared Shell paragraph
  (`content/agents/stamity-test-runner.md:150-157`, pinned by `test/corpus/agents/shellDiscipline.test.ts:38-46`) is
  not edited.
- **The skill's cloud rules** live in a reference file beside `references/chains.md`, with one pointer line in the body,
  which sits at its 160-line cap; `/st-work`'s body is not edited (485 of 500 lines, one spare character).
- **Claude Code's readiness** is its own adapter-placed `startup|resume` entry with its own budget, skipping without a
  `package.json` and working offline; it writes `STAMITY_HOOKS_ACTIVE=1` through `CLAUDE_ENV_FILE`, and the pre-flight
  then also refuses in Claude Code's cloud without it.
- **The Cursor block** is appended to the root `AGENTS.md` only when Cursor is selected; the always-on tripwire
  (`test/corpus/invariants.test.ts:796-805`, a byte figure) splits into two figures, with and without Cursor, and the
  disclosure says so. A missing `node` is answered by the block's "Node first" line, not by a command prefix (a POSIX
  prefix would fail closed on Windows).
- **Cursor's context-once script** prints only where `CURSOR_AGENT_SOCKET` is set, so a local session's start stays
  write-free; a duplicate on self-hosted workers is accepted. It prints Cursor's own `additional_context`, since an
  adapter script does not pass through the portable runner.
- **One session detector.** `detectSession()` replaces the session start's table and the pre-flight's own marker read
  (`src/cli/commands/gate.ts:1965-1976`); `CLAUDE_CODE_REMOTE` counts only as `true`, so the pre-flight's JSON `cloud`
  for a value of `1` becomes false, a stated change.
- **Copilot's entry** is a thin `stamity-run.agent.md` under 2,000 characters naming the prompt file (the 36,253-byte
  `st-work.prompt.md` is over the agent cap of 30,000 characters). It is adapter-emitted for Copilot only, with no
  roster row: the roster's shipped-agent count (`test/roster/agentPolicies.test.ts:141-153`) and `RUNTIME_AGENT_IDS`
  (`src/roster/agentPolicies.ts:270`, read by Cursor's role guards) do not move. If an emission test ties every
  `.github/agents/stamity-*` file to a roster row, the file is named `run.agent.md` instead.
- **The model list** leaves the committed manifest without a generation bump: the account's list moves to a git-ignored
  cache; a fresh clone's `check` reports no drift; another account warns, never fails. The held `plugin` block and its
  warning leave in the same manifest family: `plugin` is dropped from the raw object before validation on read, with no
  migration step (the migrations are keyed by the version they start from).
- **The container leg** stays one job with its name and its place in the aggregator; it drops `container:` and runs the
  image pinned by digest through `docker run` per profile (no volume but the read-only source, no socket), because a job
  inside `container:` cannot run `docker run --network none`. Each profile is asserted through the session start's
  printed cloud line, which `v8` makes come from `detectSession()`, so the leg does not wait for `v8`.
- **The client legs** gate each drive step on an arm step holding one secret and writing `armed=true|false`, never the
  value; with no secret every drive step is skipped and the job is green.
- **The cloud page** carries no vendor URL (the page test allows only this repository's own links); vendors are named
  with their page titles.
- **The two eval misses of the 1.15.0 run** (`cut/24`, `cut/25`) are fixed in the cases after the samples' judge spans
  are read; the release run measures them.
- **A cloud machine's capacity rule** binds an unattended run (it lives in the `st-unattended` skill); an attended run
  in a cloud machine keeps the ladder's wait, a person being there.
- **The session start's Cursor line** names "a Cursor agent machine (managed or self-hosted)", since
  `CURSOR_AGENT_SOCKET` is set on managed machines too; the managed reading comes from the context-once script.
- **Unchanged requirements.** Copilot's camelCase hooks requirement carries no change (its default-branch sentence
  already reads as `docs/customization.md:433-434` holds it); lanes in the cloud are flow text, so the lane spec, which
  governs the `stamity worktree` verbs, changes only where it names state the verbs skip and refuse (the context-once
  folder, REQ-WORKTREE-003 and -004, amended 2026-10-18 for `review/96`).
- **The held `plugin` block** is accepted on read and dropped on write, with no generation bump, so a 1.15 engine still
  reads a manifest 1.16 wrote. **`ListedModels`** stays exported (`src/index.ts:73-82`). **A checkout with no model
  cache** reads its model rows as unverified, never drift, and `sync` keeps the pick already emitted.

## Spec delta

This delta changes five spec files: `docs/specs/everyday-flows.md` (REQ-FLOW-105 to REQ-FLOW-119 and REQ-FLOW-121 to
REQ-FLOW-124 added; REQ-FLOW-016, REQ-FLOW-025, REQ-FLOW-036, REQ-FLOW-080, REQ-FLOW-085, REQ-FLOW-091, REQ-FLOW-093, REQ-FLOW-095,
REQ-FLOW-101, REQ-FLOW-102, REQ-FLOW-104, REQ-FLOW-120, REQ-PLUGIN-014 and REQ-PLUGIN-016 modified),
`docs/specs/orchestrator-context.md` (REQ-CTX-013 and REQ-CTX-016 modified), `docs/specs/prove-behavior-and-value.md`
(REQ-PROVE-039 to REQ-PROVE-045 added, REQ-PROVE-003, REQ-PROVE-005, REQ-PROVE-021 and REQ-PROVE-037 modified) and `docs/specs/model-ladder.md` (REQ-LADDER-009 added;
REQ-LADDER-002, -005 and -006 modified) and `docs/specs/worktree-lane.md` (REQ-WORKTREE-003 and REQ-WORKTREE-004
modified, for the context-once folder `v6` adds). It merges at this file's spec-merge unit. File 1 amended several of these on 2026-10-16; the entries below amend other clauses of them, or narrow
what file 1 wrote where the maintainer's 2026-10-18 rule changes it.

### REQ-FLOW-105 — Continue a run from its branch (ADDED)
Given an in-progress run record whose `Branch:` names the checked-out branch, When a session starts there, Then the
session start prints that run's resume card (REQ-CTX-013), and an unattended `/st-work` continues that run from its
record and ledger at Frame instead of opening a new record, the folder count under `.stamity/runs/` unchanged; Given a
record naming another branch, a detached HEAD, or no `Branch:` line, Then Frame opens a new record as today. Where no
session-start hook runs, `stamity ledger status` prints the card. Given `stamity run start --run <id>` on a fresh clone
where `stamity/<id>` is only on origin, Then the local branch starts at origin's tip, so the next push fast-forwards.
A session continues only the run whose record is on the branch it was given, and never guesses another branch; a
continued run passes its record's `Base:` to the readiness check (`stamity plan check <plan> --since <Base>`, which one
plan now accepts as a chain does), so a path moved only by the run's own commits is not read as stale; a continued
chain file passes the chain's first record's `Base:`, as the chain rules do.

### REQ-FLOW-106 — The review gate survives a reclaimed machine (ADDED)
Given no `.stamity/review-gate.json`, or one that cannot be read or parsed, and the newest in-progress record (not a
`_debug-` run) whose `Branch:` matches HEAD holding N `usage: review rN` lines, When the review gate decides or records,
Then it rebuilds N rounds with the last verdict unrecorded and holds the completion, below the cap as an open round and
at the cap with a message of its own (the last verdict went with the machine; one fresh review re-records it), never the
cap's end-of-run text, instead of opening; with no such record or line it stays open, naming the missing counter; when
the records cannot be read it holds and names the fault, and a reviewer's stop whose rebuild faults records round 1,
naming the fault and the lost count. A readable counter file wins and nothing is rebuilt, a faulted one is replaced once
a rebuild succeeds, and the text names that the counter is keyed by the client's session, not by the run. An unattended
cloud run checkpoints after each review round, so the round's usage line reaches the branch before a reclaim.

### REQ-FLOW-107 — Pacing an unattended night in a cloud session (ADDED)
Given an unattended run in a session the session start names a cloud session, Then the run uses no `/loop`, wakeup or
agent team to pace itself, runs the full gate as one background command under a stated timeout (the one exception to
the bound agents' Shell paragraph, whose words stay byte for byte), and runs at most two implementers at once; the text
sits in the unattended skill's cloud reference, and a corpus test pins each clause beside the Shell paragraph's pin.

### REQ-FLOW-108 — Lanes in a cloud session (ADDED)
Given an unattended run in a cloud session with units that could run in parallel, Then each lane uses the client's own
isolation or the units run one at a time, never the sibling folder `stamity worktree setup` makes, so no folder appears
under `<parent>/.stamity-worktrees/`; each lane's change is applied to the run's work tree uncommitted before the next
checkpoint, whose own classifier moves any held part into `held/person-only.patch` and commits the rest, so no held path
enters the pushed history and nothing a lane did is lost at a reclaim (amended 2026-10-18 for `review/62` and `/78`).
Text only: the `stamity worktree` verbs and their lane requirement are unchanged, and a corpus test pins the text.

### REQ-FLOW-109 — Cursor's stop hook carries an unattended run on (ADDED)
Given Cursor selected, Then `.cursor/hooks.json` wires a `stop` entry, never `failClosed`, running an adapter-owned
script under one fixed emitted `loop_limit`; When it runs, Then it answers a follow-up only where `CURSOR_AGENT_SOCKET` is
set and an in-progress record on this branch reads `Mode: unattended` and states units left, and otherwise (a local
session, no `Mode:` line, a closed run, a count it cannot read) answers nothing and exits 0, so a local session on a
branch carrying such a record never gets one. The `stop` event, `loop_limit` and the follow-up answer are
vendor-documented, re-checked at build.

### REQ-FLOW-110 — Claude Code's cloud machine readies itself (ADDED)
Given Claude Code selected, Then `.claude/settings.json` gains its own `SessionStart` entry, matcher `startup|resume`,
running an adapter-placed script that does nothing unless `CLAUDE_CODE_REMOTE` is `true`; there it checks `node`
against `engines`, runs `npm ci` when `node_modules` is missing and a lockfile exists, pre-warms the pinned CLI and
appends `STAMITY_HOOKS_ACTIVE=1` to `$CLAUDE_ENV_FILE`; offline, or with that variable unset, it says so and exits 0.
Its budget is the one REQ-CTX-016 declares; that the file reaches shell commands only is vendor-documented, re-checked at build.

### REQ-FLOW-111 — Readiness on Copilot and Cursor (ADDED)
Given Copilot selected, Then `copilot-setup-steps.yml` installs Node and the pinned CLI so `stamity` resolves with no
registry fetch, at the generator's current action pins; Given Cursor selected, Then no `.cursor/environment.json` is
emitted and `stamity check` prints an install row with the lines a Cursor environment needs. Both name `gate scan` and
`ledger status` as hard needs. That a repository file overrides Cursor's saved environments is vendor-documented,
re-checked at build.

### REQ-FLOW-112 — A Claude Code session with several repositories refuses unattended (ADDED)
Given a shell that sees `CLAUDE_CODE_REMOTE=true` and no `STAMITY_HOOKS_ACTIVE`, When an unattended run starts, Then it
refuses with "hooks did not load" first: the pre-flight's canary finds no fresh marker, and where no CLI runs the run
refuses first because the CLI is not reachable (the skill names no client variable); the refusal names a session holding
several repositories and the remedy, one repository per session. That such a session loads no repository's hooks is vendor-documented, re-checked at build; a
repository added after the start is a named residual.

### REQ-FLOW-113 — Claude Code's GitHub Action is a short surface (ADDED)
Given `docs/cloud.md` and the capability matrix's Claude Code facts, Then the GitHub Action is named a job of at most
six hours with no question tool by default, never an overnight surface, where declared defaults apply, each fact with
the status its vendor page gives at build; Given `scripts/qa/hook-runs.mjs`, Then a unit test pins Claude's runner
arguments to hold no `--bare`, and the nightly hook-fire check (REQ-PROVE-040) records `failed` when `claude -p` ran a
tool call and no hook fired.

### REQ-FLOW-114 — Cursor's cloud block in `AGENTS.md` (ADDED)
Given Cursor selected, Then the root `AGENTS.md` ends on a "Cursor Cloud specific instructions" block: `/st-<id>` means
read `.agents/skills/st-<id>/SKILL.md`; the screened learnings read of charter invariant 5; `node --version` first, the
missing-`node` remedy, with no prefix on any hook command; keep the PR a draft, never ready; the unattended rule.
Without Cursor no byte moves, Codex's override and nested copies included. The block is counted apart from the
charter's 95-line pin, the always-on figure is published with and without it, and the heading is vendor-documented.

### REQ-FLOW-115 — Cursor's context once per conversation, and its managed runs (ADDED)
Given Cursor selected, Then a `postToolUse` entry, never `failClosed`, runs an adapter-owned script that prints the
screened session-start index once per `conversation_id` (a git-ignored marker keyed on its hash), only where
`CURSOR_AGENT_SOCKET` is set, and names a Cursor cloud agent when the `agent/runtime` metadata reads managed; a missing
or non-string id prints nothing, a failed metadata read prints no cloud line, and both exit 0. That this event alone
injects context in the cloud, never on the read-only first turns, is vendor-documented, re-checked at build.

### REQ-FLOW-116 — Commits after the proof block are counted (ADDED)
Given commits on the run branch after its last checkpoint's sha that the run verbs did not make (theirs carry the
subject `chore(run): checkpoint <id>`), a cloud's CI autofix or a person's push among them, When the morning list is
regenerated, Then its `Not done:` section carries one row naming their count, and the proof block's gate results are
not read as covering them; the run's own closing commit is never counted.

### REQ-FLOW-117 — Copilot runs a long plan as a chain of sessions (ADDED)
Given an unattended run on Copilot's cloud agent, Then each session commits and pushes a checkpoint before about minute
45 to 50, plan units are sized to one session, and the next session starts on a write-access person's
`@copilot continue` and resumes from the committed record on the same PR; `docs/cloud.md` promises a night with nobody
there on Claude Code and Cursor only. The 59-minute cap and the continuation are vendor-documented and not run, with no
Copilot cloud-agent account.

### REQ-FLOW-118 — Copilot's entry and its roles (ADDED)
Given Copilot selected, Then `.github/agents/stamity-run.agent.md`, under 2,000 characters, tells the agent to read
`.github/prompts/st-work.prompt.md` and the plan the issue names, since a prompt file is not run by name there; where no
sub-agent tool exists, the roles run in line in their order and the proof block says so. Without Copilot the file is
not emitted, and no roster row is added. The 30,000-character cap, the prompt-file rule and the sub-agent question are
vendor-documented, not run.

### REQ-FLOW-119 — Copilot's gates and CI approval (ADDED)
Given an unattended run on Copilot's cloud agent, Then the gates run in its sandbox; while PR CI waits for "Approve and
run workflows" the proof block reads `CI not run: awaiting approval`, never green, and the morning list carries that
setup row and, under required reviews, the prerequisite of a second approver. Detection stays `COPILOT_AGENT_PROMPT`
and the hooks file camelCase, as today; the approval step and the second approver are vendor-documented, not run.

### REQ-FLOW-121 — A run verb stands alone on its line, unattended (ADDED)
Given an unattended run, When a shell line runs `stamity run start|checkpoint|end` (its parsed command at any depth, or
raw text naming the verb and the package), Then it passes only as one simple command: `stamity`, `st`, or `npx` with
`-y|--yes|--no|--no-yes`, an optional `--@<scope>:registry=<url>`, then `stamity` or `<pkg>@<semver>`; then `run <verb>`,
literal option words and at most one closing `2>&1`, and no other command, prefix assignment, wrapper, nested line, `$`,
backtick, backslash or redirection; else it is refused as a deny naming the run verbs. Attended lines are unaffected,
and a PowerShell tool call is read as PowerShell, not through its synthetic `pwsh -Command` wrapper.

### REQ-FLOW-122 — The run verbs' git runs without inherited program variables, unattended (ADDED)
Given an unattended run, When `stamity run start`, `checkpoint` or `end` starts git, Then git's program-valued variables
(the set the guard's line-wide rule names in `src/hooks/personOnly.ts`: `GIT_EXEC_PATH`, `GIT_SSH`, `GIT_SSH_COMMAND`,
`GIT_ASKPASS`, `GIT_EDITOR`, `GIT_PAGER` and `GIT_EXTERNAL_DIFF` among them) are removed from its environment, the
`GIT_CONFIG_*` variables the pre-flight vetted are kept, and the verb's output names each removed variable by name only,
never its value; an attended run starts git as today.

### REQ-FLOW-123 — How each client answers a person-only act, and the unattended refusal (ADDED)
Given an attended act that can be undone (REQ-FLOW-102), Then Claude Code asks through the guard's `"ask"` and the
settings' `permissions.ask` rows; Copilot CLI, Cursor and Codex refuse: Copilot CLI holds an ask, but its tool-call
payload names no calling agent, so the guard cannot keep the ask for the person alone (decided 2026-10-18 for
`review/89`), Cursor ran a command despite an ask under `--force` (measured 2026-10-18) and Codex lets an ask through. The ask is the person's only: an ask-class act a sub-agent runs is refused, and so is one in Claude
Code's `auto` permission mode, where a classifier may settle a prompt (added 2026-10-18 for `review/72` and `review/75`).
Given a session the guard reads as unattended (an in-progress record reading `Mode: unattended`, or
`STAMITY_UNATTENDED` set with none reading `Mode: attended`), or a fault reading it, Then every client refuses every
person-only act, and the act lands on the morning list.

### REQ-FLOW-124 — Deletions, force pushes and acts that cannot be undone stay refused, attended too (ADDED)
Given any session, When the main thread deletes a branch (`--delete-branch` on `gh pr close` or `merge`, a `:branch`,
`--delete` or `--prune` push, an `updateRefs` entry to the zero sha), a tag (remote, or local by `-d` or `-f`), a release
or asset (`--clobber` too), a repository, a secret or variable, a protection rule, ruleset or custom property, or a
package version (`npm unpublish`, `npm dist-tag rm`); force-pushes (`--force`, `--force-with-lease`, `+`, `--mirror`,
`gh repo sync --force`); or changes a repository's visibility or owner, Then every client refuses it; a refused act in
any reading of a line or GraphQL text wins over an ask, and a hidden method or URL target, the nesting limit and no command stay refused.

### REQ-FLOW-025 — Run records are written with the file tools (MODIFIED)
Given `buildSettingsJson`, Then `.claude/settings.json` carries the engine's `permissions.ask` rows (REQ-FLOW-123) beside
its `permissions.deny` rows, which now hold only deletions and force pushes (REQ-FLOW-124), and still no allow row, so
"setup writes no permission allowlist" holds; the criterion added 2026-10-16 reads `permissions` holding the engine's
`ask` and `deny` rows and no `allow` row. The file-tool and inbox clauses are unchanged.

### REQ-FLOW-036 — `.claude/settings.json` is merged entry by entry, and an owner's entries survive every verb (MODIFIED)
Given the engine's ask rows (REQ-FLOW-123), Then `permissions.ask` takes the co-ownership `permissions.deny` took on
2026-10-16: the engine adds the rows of its table the list lacks and records those it added, `sync` keeps every row of
either list byte for byte and in place, an owner's row equal to an engine row included, whatever the ledger's age, and
`clean` removes no row of either list and names those equal to the engine's that it left. "Never writes, replaces or
removes `permissions.ask`" reads as never replaces or removes an ask row; `SECURITY.md`'s settings row says the same.

### REQ-FLOW-091 — An unattended start needs a ready plan (MODIFIED)
Given `stamity plan check` and the skill's `spec-plan-coverage.mjs`, which answer alike, When units depend on one another
in a cycle, Then one `dependency-cycle` finding names it however many units lead into it, and the walk stays linear in
the plan's units; When a unit's requirement list holds a bare number of three or more digits after a comma that follows
an id, Then it reads as that id's area with that number, as the dash shorthand does, and prose elsewhere reads as today.
The blocker codes, exit codes and L1 are unchanged.

### REQ-FLOW-093 — An unattended run checkpoints as it goes (MODIFIED)
Given an unattended checkpoint and a held path absent at `Base:`, staged as new and then deleted from the work tree, Then
the held patch carries no section for it and the `held` line still names it; a held path whose deletion is staged while
the work tree has a file there gets a new-file part after the deletion; so the patch applied on `Base:` gives the work
tree's bytes. A held patch the branch already carries is kept and listed while the work tree holds no held change.

### REQ-FLOW-095 — The morning walk (MODIFIED)
Given the morning walk and a held person-only act the morning list names, When the walk reaches it, Then the walk runs it,
the client's approve prompt being the person's one click, on Claude Code; a REQ-FLOW-124 act, every held act on Copilot
CLI, Cursor and Codex, and every held act in Claude Code's cloud final round (where `STAMITY_UNATTENDED` stays set, so
the guard still refuses) are handed to the person as the exact command, which the walk does not run. The walk's entry,
its rounds and the answers' mapping are unchanged.

### REQ-FLOW-101 — The unattended pre-flight (MODIFIED)
Given `direct-push` refusing because origin's https push goes through a credential helper other than gh's alone, Then its
fix is one sequence run in the repository, an empty `credential.helper` entry that resets the list, then
`!gh auth git-credential` added after it, which leaves gh's helper the only entry whatever the system or global
configuration holds, a helper `gh auth setup-git` wrote through a shim included; the fix names no `--global` or `--system`
write and echoes no value. The pre-flight's JSON `client` and `cloud` fields and its Cursor egress warning are read
through the one session detector (the one REQ-FLOW-085 states), so: `CLAUDE_CODE_REMOTE` counts only as exactly `true` (`1` is not a
cloud), `GITHUB_ACTIONS` alone reads as a cloud, a `CURSOR_AGENT_SOCKET` of `0` or `false` no longer warns, and marker
values are no longer trimmed or lower-cased; these are labels, and none selects an unattended run (added 2026-10-18 for
`review/103`). The checks, their states and the other fixes are unchanged.

### REQ-FLOW-102 — Person-only acts that can be undone ask, attended; person-only paths are held (MODIFIED)
Given an attended session, When the main thread runs a person-only act that can be undone (a merge in any form: gh,
REST, GraphQL, the merge queue, the MCP merge row; marking ready; a review approval; a non-forced push or sync of the
default branch; creating or pushing a tag; a release create, edit or upload; a publish or dist-tag; a secret or variable
write; a protection, ruleset or custom-property write; a repository's settings, name, archive state or default branch),
Then the client asks (REQ-FLOW-123) and the agent runs it on yes; the acts of REQ-FLOW-124 stay refused, and the
held-path half of this requirement is unchanged.

### REQ-FLOW-104 — The cloud's accepted risks are named (MODIFIED)
Given `SECURITY.md`, Then its rows state each client's answer to a person-only act (REQ-FLOW-123), the deletions and
force pushes refused everywhere (REQ-FLOW-124), the run-verb line rule and the verbs' git environment (REQ-FLOW-121,
REQ-FLOW-122), the settings' ask and deny lists (REQ-FLOW-036) and the MCP hook (REQ-FLOW-120); and it names as accepted
residuals: an ask holds only while a client honours it (Claude Code's hook ask in bypass mode measured, not documented;
re-measured each release); where no hook runs, a respelling no settings row names is one click; a `GIT_CONFIG_*`
variable gained after the pre-flight reaches the verbs' git, including one set on a line whose run verb the stand-alone
rule's text reading cannot see (a launcher it does not unwrap, a name split by quotes or built by an expression; added
2026-10-18 for `review/97`); and a checkout synced from an unreleased build keeps its old deny rows.

### REQ-FLOW-120 — An unattended run pushes only through the run verbs (MODIFIED)
Given Claude Code's settings, Then the thirteen GitHub MCP rows that can be undone (merge, branch and file writes, review
writes and submission, pull-request update, state and creation, branch creation) sit in `permissions.ask`, and
`delete_repository` alone stays in `permissions.deny`; a PreToolUse entry on those tools runs the person-only guard,
which refuses each while an unattended run is in progress, since a settings row cannot read the mode, and answers ask in
an attended session. The push rule and its other refusals are unchanged.

### REQ-FLOW-080 — Every touchpoint ends on a walk, the summary last (MODIFIED)
Given the question-tool map (`ASK_USER_TOOLS`), Then a row may carry an optional `cloud` note of one sentence, rendered
as its own column; Cursor's says that in a managed cloud run, which its session line names, the agent asks nothing and
takes the declared default; each local note keeps its two-sentence cap and the four rows stay; a client's own
per-client copy of the question protocol carries its cloud note too (Cursor's and Copilot's). Given the golden,
non-floor eval case on Cursor's note, Then a managed Cursor run reaching an ask calls no question tool and writes
`Default applied:` (amended 2026-10-18 for `review/108`: the case is golden with binding rows, not advisory).

### REQ-FLOW-085 — The session start names a cloud or CI session (MODIFIED)
Given `CLAUDE_CODE_REMOTE=true`, Then none of Claude Code's lines reads "The review-gate counter resets with the VM." or
says a missing counter opens the gate, now rebuilt from the run record (REQ-FLOW-106); Given `CURSOR_AGENT_SOCKET`, Then
its line names "a Cursor agent machine (managed or self-hosted)", the managed reading coming from the once-per-conversation
script (REQ-FLOW-115); the session start keeps its markers, its order and no network call, and the capability
matrix's cloud table is regenerated to match.

### REQ-PLUGIN-014 — The manifest's `gates` object, and the `plugin` key held through the 1.15 line (MODIFIED)
Given a manifest holding a `plugin` key of any shape, When `check`, `sync` or `clean` reads it, Then it loads with no
refusal, and When `sync` writes it, Then the written manifest holds no `plugin` key, `MANIFEST_FIELD_ORDER` names none,
and a second `sync` moves no byte: the key is no longer held. The `gates` object's grammar and bounds are unchanged.
This closes the follow-up due at the first release after 1.15.0.

### REQ-PLUGIN-016 — The ledger bound, settings co-ownership, the node row and the pack-reach row (MODIFIED)
Given any manifest and any `.claude/settings.json`, `enabledPlugins` included, When `check` runs, Then its doctor rows
hold no `plugin-duplicates` row and `pack-reach` keeps its place before `invariants`; `sync`'s report and `clean`, its
preview included, print no leftover-plugin lines, and `init`, `sync` and `clean` still keep `enabledPlugins`. The
settings co-ownership takes `permissions.ask` beside `permissions.deny` (REQ-FLOW-036): only missing engine rows are
appended, none is removed. The ledger bound, the `node-version` row and `pack-reach`'s states are unchanged.

### REQ-CTX-013 — The resume card, and `stamity ledger status` (MODIFIED)
Given an in-progress run whose record's `Branch:` names the branch `.git/HEAD` points at, When the session-start hook
runs with `"source":"startup"`, Then stdout carries the line beginning `stamity resume card — run` for that run, HEAD
read from disk with no process spawned, an attended record only within the closed card's two-day age (an unattended one
at any age); Given only a run on another branch, a record with no `Branch:` line, a detached HEAD, or only a closed or
debug record, Then startup prints no card. `ledger status` prefers the run in progress on this branch. `compact` and
`resume` keep today's pick, and the 2,000-character cap, the screen and the twins' parity stand.

### REQ-CTX-016 — Declared hook budgets (MODIFIED)
Given an emitted Claude configuration, Then the cloud readiness `SessionStart` entry (REQ-FLOW-110) carries a timeout of
its own, a declared constant apart from `HOOK_SESSION_START_TIMEOUT_MS`, while the session-start rows keep 30 s on all
four clients and the guard and review gate carry none; Given the readiness script, Cursor's once-per-conversation
script and its stop script, Then each has a byte and line ceiling row in `HOOK_SCRIPT_BUDGETS`, and a script over its
ceiling fails the budget test naming the script, its size and the budget.

### REQ-PROVE-037 — A CI leg imitates a cloud machine (MODIFIED)
Given `ci.yml`'s `cloud-container` job, Then it keeps its name, its `needs`, its condition and its place in
`all-ci-checks`, holds no `container:` key, and runs the `node:24-bookworm` image pinned by digest through `docker run`
once per cloud profile and once more under `--network none`, with the source mounted read-only, no Docker socket, no
secret and no client account; the release checklist's per-release line re-reads the digest the leg runs, and
`test/ci/workflow.test.ts` pins each of these.

### REQ-PROVE-039 — The container leg's cloud profiles (ADDED)
Given the leg's profiles for Claude Code's, Cursor's and Copilot's clouds, each with its marker and `HOME` shape, and
Copilot's with `/workspace` as its working folder, Then `detectSession()`, the one detector the CLI and the emitted
session start share, names that cloud; two clones under one parent each run their own hooks; and against a bare remote
refusing tags, deletions and pushes to `main`, and a `gh` stub answering the default-branch read and refusing
`draft: true` with 422, the ending verb opens a `[DRAFT]` PR, or with both POSTs refused prints `Not done: draft PR not
opened` naming the branch. A red leg blocks the merge.

### REQ-PROVE-040 — Client legs and a release-prep run, built and off without secrets (ADDED)
Given the workflows, Then a nightly hook-fire job and an on-demand release-prep job run under the canonical guard, each
client step holding exactly one secret behind an arm step that writes only `armed=true|false`; with no secret every
drive step is skipped, the job ends green, and neither feeds `all-ci-checks`. Armed, hook-fire runs
`scripts/qa/hook-runs.mjs` in the pinned image (`claude -p` without `--bare`, `agent --trust -p`, `copilot -p` with
`COPILOT_ALLOW_ALL=true`), and release-prep runs a light unattended `/st-work` with `--permission-prompts none` against
a bare remote.

### REQ-PROVE-041 — The maintainer's cloud checks (ADDED)
Given Package 25's close, Then two person rows each run once: Claude Code's cloud, an overnight unattended `/st-work`
whose morning question is answered at least eight hours after its start, and Cursor's cloud agents; each starts from a
public scratch repository `scripts/qa/cloud-check.mjs setup` makes outside this checkout, and its `verify` reads by REST
one open draft PR, unmerged, with `main` and the tags unchanged; `teardown` prints the delete and runs nothing.
Copilot's row is not run, for want of a Copilot cloud-agent account, and `Not done:` names it.

### REQ-PROVE-021 — QA automation and binding (MODIFIED)
Given the QA form, Then the harness measures twelve rows: the nine of 2026-10-14 (`H1a`–`H1d`, `H2`, `H3a`–`H3d`) and the
maintainer's cloud checks `P1`–`P3` in a `cloud` lane, which `scripts/qa/run.mjs` reads from `cloud-check.mjs verify`'s
output and otherwise records `not-run` with its reason (`P3`: no Copilot cloud-agent account), never as a keyboard row;
a person can sign `--walked P1` or `P2`. The retired rows' rendering and the evidence binding are unchanged.

### REQ-PROVE-042 — The cloud proof's cadence (ADDED)
Given the release checklist, Then one line carrying `Runs when:` re-reads the vendor pages the capability matrix's
cloud column cites, and a page changed since its read date re-owes that cloud's person row at the next release; the
container leg runs on every full CI run, the hook-fire check nightly and at release prep where its secrets exist, and
the person rows once, at Package 25's end. `test/docsPages.test.ts` pins the line.

### REQ-PROVE-043 — The cloud page (ADDED)
Given `docs/cloud.md`, Then it is a hand page listed with the guides, in the sidebar, the README map and the LLM index,
linking only under this repository's own home, and per cloud it gives the setup, branch protection as a prerequisite,
the secrets, starting a contract run and the morning walk; its run-contract section names `run-contract: 1`, the plan
or board item, base, acceptance, scope, prerequisites, budget and who answers, the fixed `preview: stop` and
`move: off`, the outputs and the failure modes. `test/docsPages.test.ts` pins it.

### REQ-PROVE-044 — The capability matrix's unattended rows (ADDED)
Given the capability matrix's cloud column, Then each client gains facts for an unattended run (the draft-PR ending,
question handling, and Copilot's chain of 59-minute sessions), and a fact may carry an optional `run` field naming the
person check and its date, rendered "not run" when absent; Copilot's unattended rows read documented, not run, and a
fact carrying a session-start line stays `documented` (`test/emit/capabilityMatrix.test.ts`).

### REQ-PROVE-045 — The release network page's action pins match the workflows (ADDED)
Given `.github/release-egress.md`, Then every action it links at a pinned commit, the hardening action included, names
the sha the release workflows pin for that action, and a test fails naming the action and both shas when they differ.

### REQ-PROVE-003 — Codex folds only floors (MODIFIED)
The shared `AGENTS.md` is the core charter for every selection without Cursor; with Cursor selected, the root file ends
on the block of REQ-FLOW-114. Codex's override still holds the core render (or the operator's text around it under
`supplement`), so with Cursor selected the override no longer repeats `AGENTS.md`: the block is the one part it leaves
out. The requirement's four criteria hold as written (added 2026-10-18 for `review/79`).

### REQ-PROVE-005 — Always-on composite re-measured (MODIFIED)
The emission golden carries two root `AGENTS.md` byte figures: the charter alone for every selection without Cursor,
equal to both shared constants, and the charter plus the block for exactly the selections with Cursor, equal to
`ALWAYS_ON_SHARED_BYTES_WITH_CURSOR`. `ALWAYS_ON_CURSOR_BLOCK_LINES` (14) is counted apart from the line ceilings;
`composeAlwaysOnLoad` takes the selection and adds the block on every client but Codex; the capability page refuses a
with-Cursor figure no larger than the charter's, or a block of zero lines (added 2026-10-18 for `review/79`).

### REQ-FLOW-016 — Setup ignores the review gate's state files (MODIFIED)
Setup's required ignore entries gain `.stamity/context-once/`, Cursor's once-per-conversation markers (REQ-FLOW-115),
dominated by the state directory's own rule as the review gate's entries are; the entry count the requirement states
moves with it (added 2026-10-18 for `review/96`).

### REQ-WORKTREE-003 — A structured include manifest, resolved by specificity, never by order (MODIFIED)
The context-once folder and everything under it resolve to `skip` by name, whatever the manifest says, as the review
gate's state does (added 2026-10-18 for `review/96`).

### REQ-WORKTREE-004 — The state tiers, settled against what this project commits (MODIFIED)
`.stamity/context-once/` is runtime state of one machine: never committed, never copied into a lane, and a rule naming
it is refused by name with case and trailing dots folded (added 2026-10-18 for `review/96`).

### REQ-LADDER-002 — A capacity stop resumes or waits; it is not a failed sub-agent (MODIFIED)
Given an unattended run in a session the session start names a cloud session, When a sub-agent stops as `limit-reset`,
Then nothing waits inside the machine, however near the reset: the run commits and pushes a checkpoint, refreshes its
draft PR's body, writes `- <UTC> capacity: <role> limit-reset → BLOCKED_DEPENDENCY` and returns `BLOCKED_DEPENDENCY`
naming the reset time, a failed push adding `Not done:` naming the branch; an attended run and a local one keep the
12-hour wait, and the failure-ladder bullet and its pins are unchanged.

### REQ-LADDER-005 — Pins per client (MODIFIED)
Given a 1.0.0 manifest with `pins.standard = "Y"` and a `plugin` block, When `PER_CLIENT_PINS_STEP` alone runs, Then
`pins.standard` is `{ all: "Y" }`, the block is value-identical, the version reads 2.0.0, and migrating twice equals
migrating once; When this engine reads it and `sync` writes it, Then no `plugin` key is written back (REQ-PLUGIN-014).
The other criteria stand.

### REQ-LADDER-006 — A working pick out of the box (MODIFIED)
Given a Cursor, Codex or Copilot CLI on `PATH`, When `init`, `sync` or `workspace sync` reads its model list, Then the
list is kept as `{ ids, source }` per client in the git-ignored cache of REQ-LADDER-009, never under `models.listed` in the
committed manifest, and the pick reads it there; the resolver's order, the read, the 200-id cap and
`STAMITY_NO_CLIENT_PROBE` are unchanged, `SECURITY.md` no longer says the list lands in the committed manifest, and the
`sync` criterion reads the cache where it read `models.listed.cursor`.

### REQ-LADDER-009 — No account's model list in the committed manifest (ADDED)
Given a client's model list read by `init` or `sync`, Then it lands in a cache file `git check-ignore` reports ignored,
the committed manifest carries no `models.listed` key, and its generation stays 2.0.0; Given a manifest still holding
`models.listed`, Then it loads, and `sync` moves its lists to the cache and writes the manifest without the key; Given
a fresh clone with no cache, Then `check` reports no drift and exits 0, every client's emitted pick kept (Cursor's
included); Given a cache another account's list filled, Then `check` warns, naming the client and class, and still exits
0. With no list read, the picks stay as the committed model maps have them until a `sync` that reads the client updates
them (added 2026-10-18 for `build/61` and `/62`).

## Units

### v0a-ask-then-act — the verdict sorts every person-only act into ask or refuse

| Field | Content |
|---|---|
| `id` | v0a-ask-then-act |
| `requirements` | REQ-FLOW-102, REQ-FLOW-124 |
| `files` | `src/hooks/personOnly.ts` (rule ids `:51-62`, act text `:71-101`, the push reader `:836`, `:854-913`, `tagVerdict` `:918-943`, `symbolicRefVerdict` `:946-977`, the gh rows `:979-1022`, `httpVerdict`'s `--next` return `:1041-1044` and its path loop `:1144-1258`, GraphQL `:1148-1197`, REST `:1204-1255`, publish `:1262-1305`, the dispatch `:1308-1347`), `test/hooks/personOnly.test.ts` (each DENY row gains its class), `test/hooks/personOnlyGuard.test.ts` (only where a class changes what a row expects) |
| `interfaces` | `personOnlyVerdict` returns `{ deny: true, rule, act, reason, ask: boolean }` for a person-only line: `deny` stays true on every person-only verdict and `reason` keeps today's wording, so the run verbs (`src/cli/commands/run.ts:937-949`, which print `push refused: <reason>`) and the guard read it as today; the client-facing ask and refuse sentences are `v0a2`'s. Ask-class rules: `push-default` (with plain `gh repo sync`), `push-tags`, `tag` (creation), `pr-merge`, `pr-ready`, `release` (create, edit, upload without `--clobber`; REST POST/PATCH), `publish` (with `npm dist-tag add`), `secrets` (set; REST PUT), `protection` (protection, ruleset, custom-property and repository writes: every `gh repo edit` settings flag but `--visibility`, rename, archive, unarchive, the default branch). Refuse-class rules: `force-push` (`--mirror` and `remote.*.mirror` move here from `push-tags`; `gh repo sync --force`), `push-delete` (with `gh pr merge -d`/`--delete-branch`, `--prune`, and a GraphQL `updateRefs` entry whose `afterOid` is the zero sha or one the text cannot show, under `refs/heads/`), and new `tag-delete` (a remote tag deletion, the same `updateRefs` entry under `refs/tags/`, a local `git tag -d`/`--delete`/`-f`/`--force`, an `update-ref` or `symbolic-ref` deletion under `refs/tags/`), `release-delete` (`delete`, `delete-asset`, `upload --clobber`, REST DELETE), `secrets-delete` (`delete`, `remove`, REST DELETE), `repo-delete` (`gh repo delete`, REST DELETE on the repository), `repo-irreversible` (a visibility change or a transfer, by gh, REST or GraphQL), `protection-delete` (GraphQL `deleteBranchProtectionRule`, `deleteRepositoryRuleset`, `deleteRepositoryCustomProperty`; REST DELETE on protection, rulesets and properties), `unpublish` (`npm unpublish`, `npm dist-tag rm`). Every act is collected — each segment, each call `--next` joins, each path of a call, each flag of one gh call (today's order returns `--default-branch` before reading `--visibility`, `:1014-1019`), each field of one REST body, each mutation and `updateRefs` entry in a GraphQL text — and `ask` is true only when all of them are ask-class. A repository PATCH whose body holds `visibility` or `private`, or whose body the line cannot show, reads as `repo-irreversible`. The push reader reads force and delete before the `tag` word (`:874-881`), and REST `git/refs` reads force before tags (`:1243-1250`). #112's last round adds rows (`gh repo sync`, `gh repo unarchive`, dot segments in HTTP paths, a local-tags coded throw); the rebase gives each the class this cell names. The module stays self-contained (embedded by `Function.toString()`, `src/hooks/scripts.ts:3201`) |
| `testCriteria` | Each ask-class form among today's DENY rows returns `ask: true` and each refuse-class form `ask: false`; `gh pr merge 1 --delete-branch` → `push-delete`; `git push origin --mirror` → `force-push`; `git push --force origin v1 --tags` → `force-push`; a GraphQL `updateRefs` entry to the zero sha under `refs/tags/v1`, under `refs/heads/main` and under `refs/heads/feat` → `tag-delete`, `push-delete`, `push-delete`; `gh release delete v1` and `gh release upload v1 a --clobber` → `release-delete`; `gh secret delete X` → `secrets-delete`; `gh repo delete o/r` → `repo-delete`; `gh repo edit --visibility public`, `gh repo edit --default-branch x --visibility public`, `gh repo transfer o/r x`, a REST PATCH on the repository whose body sets `private` to false, and one whose body the line cannot show → `repo-irreversible`; `npm unpublish x@1.0.0` → `unpublish`; a GraphQL `deleteRepositoryRuleset` and REST `DELETE …/branches/main/protection` → `protection-delete`; `gh pr merge 1 && git push origin :feat` → `ask: false`; one GraphQL text holding `mergePullRequest` then `deleteRef` → `ask: false`; a curl DELETE on a branch ref joined by `--next` to a merge PUT, and one curl call naming a merge path and then a branch-ref path with DELETE → `ask: false`; every ALLOW row still allowed; the run verbs' push refusal prints today's reason |
| `edgeCases` | `git tag v1` → ask (`tag`), `git tag -d v1` → refuse (`tag-delete`); a review body or ref the line cannot show (`:1185`, `:1194`, `:1213`) keeps its concrete ask-class id, since `forced()` reads an unreadable refspec as forced (`:1100-1101`) and an unreadable `afterOid` reads as a deletion; `gh repo edit --enable-auto-merge` → ask (`protection`); `gh repo edit --visibility private` → refuse (`repo-irreversible`, one rule with the settings row); a line with no person-only act → allowed as today |
| `depends_on` | none (file 1's guard) |
| `verify` | `npx vitest run test/hooks test/cloud test/cli/commands/run.test.ts test/cli/commands/runCheckpoint.test.ts test/cli/commands/runEnd.test.ts test/architecture test/ci/testInputsGuard.test.ts && npm run typecheck` |
| `threat` | Boundary: an agent's shell line → a person-only act on the remote. Trusts: the guard's reading of the line. Abuse: a deletion or a force push chained after an act that asks, so one approval runs both; a deletion read under an ask-class rule. Check: every act is collected across segments, `--next` calls, paths and GraphQL entries, and a refused one wins; a zero or hidden `afterOid` reads as a deletion; force and delete are read before the tag word, and before tags in REST |

### v0a2-ask-emission — each client's answer, the settings' ask rows and the MCP hook

| Field | Content |
|---|---|
| `id` | v0a2-ask-emission |
| `requirements` | REQ-FLOW-102, REQ-FLOW-123, REQ-FLOW-124, REQ-FLOW-120, REQ-FLOW-025, REQ-FLOW-036, REQ-PLUGIN-016 |
| `files` | `src/hooks/scripts.ts` (`guardDecisionOutput` `:3107-3118` gains an ask branch; `decide()` `:3752-3787`; an MCP branch; the header and doc comment `:3121-3123`, `:3159-3165`), `src/hooks/personOnly.ts` (`CLAUDE_DENY_ROWS` `:140-210` keeps the refused rows; a new `CLAUDE_ASK_ROWS` holds the others; the MCP row table), `src/adapters/claude.ts` (`:935`: `permissions: { deny, ask }`; one `PreToolUse` entry whose matcher names the GitHub MCP tools of both tables, running the guard), `src/emit/hooksInfra.ts` (`:157`), `src/manifest/claudeSettings.ts` (`:17`, `:21-27`, `:154`, `:230-259`, `:342-344`), `test/hooks/personOnlyGuard.test.ts` (`:201-248`, per client), `test/hooks/personOnlyGuardDist.e2e.test.ts`, `test/hooks/scriptBudget.test.ts` (`:206`, only if the guard passes its row), `test/adapters/claude.test.ts`, `test/manifest/claudeSettings.test.ts`, `test/merge/settingsOwnerEntries.test.ts`, `test/cloud/containerLeg.test.ts` (each client's ask shape) |
| `interfaces` | Ask answers: Claude Code prints `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"<reason>"}}` on stdout and exits 0; Copilot, Cursor and Codex print their deny shape, the reason adding that the client cannot ask for a click (Copilot amended 2026-10-18 for `review/89`: it holds an ask, but its payload names no calling agent). Sentences, the act printed as the verdict's own text, which already carries its code spans, never wrapped again: ask — "<act> is a person-only act (`<rule>`): approve it to let the agent run it once (REQ-FLOW-102)."; refuse — "<act> deletes, force-pushes or cannot be undone (`<rule>`): it stays the person's to run, even with approval (REQ-FLOW-124). Give the person the exact command."; unattended, for an act other than a push — "<act> is a person-only act (`<rule>`) and this run is unattended: list it on the morning list, whose walk runs it after one click.", the push rule keeping its own reason (`personOnly.ts:1906-1909`). `decide()` (`:3752-3787`) collects the person-only verdict over every place it reads and both readings of a PowerShell call (the text and its `pwsh -Command` twin, `:3763-3768`) and answers ask only when every verdict found is ask-class and `unattendedBy` (`:3684-3715`) reads attended; one refuse-class verdict, an unattended reading or a fault refuses. Every coded throw (`HTTP_TARGET_HIDDEN`, `NESTING_DEPTH`, `NO_COMMAND`, a payload parse error) stays a refusal (`:3780-3787`). The MCP branch classifies a `tool_name` of the GitHub MCP server by the row tables: ask for `merge_pull_request`, `push_files`, `create_or_update_file`, `delete_file` (a commit, not a ref deletion), `update_pull_request_branch`, `pull_request_review_write`, `create_pull_request_review`, `submit_pending_pull_request_review`, `update_pull_request`, `update_pull_request_state`, `update_pull_request_draft_state`, `create_branch`, `create_pull_request`; refuse for `delete_repository`; every one refused while an unattended run is in progress. `CLAUDE_DENY_ROWS` holds the force rows (`:141-147`), `--mirror` (`:151`), `--delete`/`-d` (`:153-156`), `git tag -d`/`-f`/`--delete`/`--force` (`:159-160`, `:164-165`), `gh release delete`/`delete-asset` (`:169-170`), `gh secret delete`/`remove` (`:179-180`), `gh variable delete`/`remove` (`:182-183`), `gh repo delete` (`:187`) and `mcp__github__delete_repository` (`:206`); `CLAUDE_ASK_ROWS` holds every other row. `CLAUDE_DENY_ROWS` also keeps `gh repo edit --visibility` and `gh repo transfer` (`:184-189`), gains `npm unpublish` and `npm dist-tag rm`, and gains a mid-pattern row for each refused flag that can follow an ask-class prefix, so a line the hook never reads is still refused there (a `*` inside a Bash row matches anywhere, measured on 2.1.302): `git push * --force*`, `git push * -f*`, `git push * --mirror*`, `git push * --prune*`, `git push * --delete*`, `git push * -d *`, `git push * +*`, `gh pr merge * -d*`, `gh pr merge * --delete-branch*`, `gh pr merge -d*`, `gh pr merge --delete-branch*`, `gh release upload * --clobber*`, `gh release upload --clobber*`, `gh repo edit * --visibility*`, `gh repo sync * --force*`, `gh repo sync --force*`. A respelling no row names stays the hook's. The settings co-ownership (`claudeSettings.ts:21-27`) covers both pointers: `sync` keeps every row in its place and appends only the engine's rows the file lacks; `clean` removes neither list's rows and names every leftover row equal to an engine row of either table (`isEngineDenyRow`, `:262-264`, reads both). The MCP `PreToolUse` entry carries the shell guard's fail-closed tail (`src/adapters/claude.ts:985-987`) |
| `testCriteria` | Attended `gh pr merge 1` → Claude's ask JSON with exit 0; Copilot, Cursor and Codex → deny (Copilot amended for `review/89`); the same line with an in-progress record reading `Mode: unattended` → deny on all four with the morning-list reason; a mode read that faults → deny; `git push --force origin main` → deny on all four; a PowerShell call whose POSIX reading shows a merge and whose `pwsh` reading shows a `+main` refspec → deny; `mcp__github__merge_pull_request` attended → ask, unattended → deny; `mcp__github__delete_repository` → deny; a hidden-target line → deny attended; the emitted settings carry both lists, a second `sync` moves no byte, a person's own row is kept, and `clean` names a leftover deny row equal to an engine ask row; each mid-pattern deny row is pinned against one line it must match (`git push --tags --force origin`, `gh pr merge 7 -d`, `gh release upload v1 a --clobber`, `gh repo edit --default-branch x --visibility public`) and one ask line it must not (`git push --tags origin`, `gh pr merge 7`, `gh release upload v1 a`, `gh repo edit --default-branch x`), by a matcher in the test that applies Claude Code's documented wildcard reading |
| `edgeCases` | A person's own deny row equal to an ask row → kept, and the client's deny-before-ask order refuses it (documented); a Copilot cloud agent reads an ask as deny (documented), unchanged; an MCP server configured under another name → not covered, the named residual stays |
| `depends_on` | v0a-ask-then-act, v16-manifest-plugin-block (one writer of the adapter tests) |
| `verify` | `npx vitest run test/hooks test/adapters/claude.test.ts test/manifest test/merge/settingsOwnerEntries.test.ts test/cloud test/architecture test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: the agent's shell and MCP calls → person-only acts on the remote. Trusts: the client's approve prompt and the in-progress record's mode. Abuse: an ask reaching an unattended run, or an MCP ask row waiting for nobody in a cloud session. Check: every ask reads the mode and refuses unattended or on a fault; the MCP hook refuses unattended; deletions and force pushes stay deny rows |

### v0b-run-verb-alone — unattended, a run verb stands alone on its line

| Field | Content |
|---|---|
| `id` | v0b-run-verb-alone |
| `requirements` | REQ-FLOW-121, REQ-FLOW-120, REQ-FLOW-102 |
| `files` | `src/hooks/personOnly.ts` (in `unattendedPushVerdict`, after `// </shell-reading>`: the stand-alone rule, a deny through the `deny` builder `:1904-1910`; in both shell-reading copies: `splitLine` `:450` and `:1560` read an unquoted backtick or `(` as a nested line, so the words after it stay the same command's; the method reader `:747-753` and `:1857-1863` reads `-X` as the method for curl only, wget's `-X` being `--exclude-directories`; `:2131`: unattended, `gh extension`, `extensions` and `ext exec` refused; gh's positional reading `:630-638`, in both verdicts: a valued option placed before the subcommand is skipped with its value, so the subcommand rules, `sync` and `unarchive` among them, still apply), `src/hooks/scripts.ts` (`decide()` `:3763`: for the PowerShell tool, the unattended verdict reads the tool's text with a `pwsh` flag instead of the synthetic `pwsh -Command '<text>'`; the local-tags comment `:3626-3627` narrowed to the reader's two ceilings, a packed-refs file or loose tag entry that is not a regular file being read as absent), `src/cli/engine/gitWrite.ts` (`GIT_PROGRAM_VARIABLES` gains `SSH_ASKPASS` in the same commit as the guard's program-variable list, so `v0c`'s parity test stays green: git runs the program it names when no helper answers), `test/hooks/personOnly.test.ts` (deny `:1127-1401`, allow `:1403-1573`; the allow twins ending in a run verb `:1471-1490` retargeted to `npm test`, TEST CHANGE), `test/hooks/personOnlyGuard.test.ts` (twins `:834-838` retargeted; an `it.each(TOOLS)` unattended block; PowerShell-tool rows on Claude and Copilot), `test/hooks/personOnlyGuardDist.e2e.test.ts` |
| `interfaces` | Trigger: a parsed command at any depth whose program is `stamity` or `st` (`programName` already strips `npx` and `@<version>`, `:1376-1377`, `:1421-1424`, `:1611-1652`) followed by `run`, any option words with their values, then `start`, `checkpoint` or `end` (amended 2026-10-19 after `review/130`: the CLI takes options before the subcommand, `src/cli/commands/run.ts:230-231`, so the verb word need not follow `run` directly; each parsed command's decoded words are read joined, so a quoted value cannot cut the span, and an unsure first word after `run`, such as an expansion, a backtick, a glob, a brace or a splat, counts as an option word; unattended, a verb written after option words fails the accepted shape and is refused with its own reason); or, as a backstop for what the parser cannot read, the raw text or a decoded word naming `run` and, after any option words, one of the three verbs, beside `stamity`, `cli.js`, `cli.mjs` or `@<semver>`. Accepted shape on the raw line: optionally one trailing ` 2>&1` and no other redirection; no newline or CR; no unquoted `$`, backtick, `\`, `(`, `)`, `{`, `}`, `;`, `|`, `&`, `<`, `>` or `#`; single quotes literal; double quotes holding no `$`, backtick or `\`; words from word 0 either `stamity`/`st run <verb> …` or `npx` with `-y`, `--yes`, `--no` or `--no-yes`, an optional `--@<scope>:registry=<url>` matching `REGISTRY_URL` (`src/shared/cliCall.ts:100`), then `stamity` or `<pkg>@<semver>`, then `run <verb>` and literal option words; any other `npx` option refused; `node … cli.js run …` refused. PowerShell's accepted shape: the same words, single quotes literal, no `&`, `;`, `|`, `@{`, `@(`, `$`, backtick or `--%`. The reason names the run verbs (`personOnly.test.ts:1398-1399`) and says what broke the shape. A deny, never a throw, so an attended line is untouched. The per-spelling rules stay |
| `testCriteria` | Unattended denies: a PowerShell `Set-Content`, `Add-Content`, `Copy-Item` or `Rename-Item` on the `env:` drive before the verb on its line; `Set-Item env:/GIT_EXEC_PATH <dir>;` before the verb; `Start-Process -Environment @{GIT_EXEC_PATH='<dir>'} npx -ArgumentList '--no stamity run end --run x'`; `${GIT_CONFIG_GLOBAL=<file>}` under `setopt -a` or `bash -a` before the verb; each `SECURITY.md` form — `readonly`, `select`, `print -v`, `foreach`, `: ${NAME:=…}`, `setopt -a`, a shell started with `-a`, `source` — before the verb; a nested verb; a trailing `&`; `> file`; `env -u … <verb>`; the `node` form; `gh ext exec x`. Unattended allows: the four accepted invocations, ` 2>&1`, a single-quoted title, `npm run start`. Attended: every row as today. #112's round-4 forms: an unquoted backtick or `$(…)` substitution placed before a push's destination or a curl call's target, and `wget --method=DELETE -X /tmp …/git/refs/heads/feat`, refused as the act they hide, in both verdicts; `git update-ref --stdin` text holding a symref command after another command, and curl's short-option clusters and long-option prefixes, re-checked as conformance rows against the readings #112's cap round left; a valued gh option before the subcommand (`gh -R o/r pr merge 1`, `gh --repo o/r repo sync --force`) → the subcommand's rule, in both verdicts |
| `edgeCases` | A PowerShell tool call `npx --no stamity run end --run x` → allowed; an agent's own `pwsh -Command '<verb>'` → refused (it loads a profile the run can write); past 2,000 run folders → the guard's existing refusal, unchanged |
| `depends_on` | v0a2-ask-emission (one writer of `personOnly.ts` and of the guard's decision step) |
| `verify` | `npx vitest run test/hooks test/cloud test/architecture test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: an unattended run's shell line → the environment the run verb's git runs in. Trusts: the guard's parse of the line. Abuse: an earlier command, wrapper or expansion on the verb's line changing that environment. Check: the verb passes only as one simple command of the accepted shape; the text backstop catches what the parser cannot read; a deny read against the mode |

### v0c-verb-git-env — unattended, the run verbs' git runs without git's program variables

| Field | Content |
|---|---|
| `id` | v0c-verb-git-env |
| `requirements` | REQ-FLOW-122 |
| `files` | `src/cli/engine/gitWrite.ts` (`gitWriteEnv` `:79-89`, `:118-125`: an `unattended` option that removes git's program-valued variables and returns their names), `src/cli/commands/run.ts` (`:484-495`: an unattended run passes the option and prints `removed from git's environment: <NAME>, …`, names only), `test/cli/engine/gitWrite.test.ts`, `test/cli/commands/runCheckpoint.test.ts` |
| `interfaces` | The removed set is the program-valued variables the guard's line-wide rule names (`src/hooks/personOnly.ts:1973-1974`, `:2023-2025`), held in `gitWrite.ts` as its own constant with a parity test against the guard's list, since the guard module stays self-contained; `GIT_CONFIG_*` kept (the pre-flight vetted it); `PATH`, `HOME` and `XDG_CONFIG_HOME` untouched (a named residual); attended runs unchanged. The module comment at `gitWrite.ts:27-30`, which says `GIT_ASKPASS` or `GIT_SSH_COMMAND` carry push credentials, says that an unattended push rests on the pre-flight's https and gh-helper rule instead |
| `testCriteria` | Unattended, with `GIT_EXEC_PATH`, `GIT_SSH_COMMAND` and `GIT_ASKPASS` set, the verb's git runs without them (a stub git printing its environment) and the line names them; attended, the same variables reach git; the `GIT_CONFIG_COUNT` `insteadOf` seam (`test/cli/commands/runEnd.test.ts:56-73`) still works unattended; the parity test fails when the two lists differ |
| `edgeCases` | A variable set to an empty value → removed and named; none set → no line; a `GIT_CONFIG_*` variable gained after the pre-flight → kept, the named residual |
| `depends_on` | v21-run-verbs (one writer of `run.ts`) |
| `verify` | `npx vitest run test/cli/engine test/cli/commands/run.test.ts test/cli/commands/runCheckpoint.test.ts test/cli/commands/runEnd.test.ts test/architecture test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: the shell environment an unattended run's verb inherits → the git it starts for commits and pushes. Trusts: the pre-flight's vetting of the push configuration. Abuse: a program variable set earlier in a persistent shell or by the platform runs a program inside the verb's git. Check: the program-valued variables are removed and named; the config variables stay, vetted, with the later-gained case named |

### v0d-guard-pages — the skill, the protocol, the pages and the eval briefs for the guard units

| Field | Content |
|---|---|
| `id` | v0d-guard-pages |
| `requirements` | REQ-FLOW-102, REQ-FLOW-095, REQ-FLOW-104, REQ-FLOW-121, REQ-FLOW-122, REQ-FLOW-123, REQ-FLOW-124 |
| `files` | `content/skills/st-unattended/SKILL.md` (`:105`: the acts are never the run's, and each waits for the morning walk; `:126-130`: refused in an unattended run on every client, and attended Claude Code asks for one click while Copilot CLI, Cursor and Codex refuse (Copilot CLI because its payload names no calling agent); `:138-145`: the morning walk runs each held act after the client's prompt, and hands deletions, force pushes, every held act on Cursor and Codex, and every held act in Claude Code's cloud final round to the person as the exact command; one sentence each for `v0b` and `v0c`, the latter telling the run to copy the verbs' JSON list of removed git variables, names only, into the record's checkpoint line), `content/rules/stamity-question-protocol.md` (`:26-27`: a force push stays the person's), `SECURITY.md` (`:88`, the resume-card row: the card also prints on a startup that finds an in-progress run on this branch, an attended record only within two days of its date, its residual and walk sentences and `ledger status --json`'s `branch` with it, as `v1` built; `:98`, `:105`, `:379-390`, `:400-409`, `:496-501`, `:570-582`, `:588-597`, `:607-614`; the readiness entry's `npm ci` residual for `v5`; Cursor's ask ignored under `--force` and Codex's ask let through, each with its measurement or source; the residuals REQ-FLOW-104 names: an ask holds only while a client honours it, re-measured each release; where no hook runs, a respelling no settings row names is one click (the mid-pattern deny rows of `v0a2` refuse the common spellings); a `GIT_CONFIG_*` variable gained after the pre-flight; a checkout synced from an unreleased build keeping its old deny rows), `docs/security-mapping.md` (`:223`, `:240`, `:349`, `:363-374`, `:385`, `:388`), the eval briefs quoting the skill, re-quoted only where a quoted line moved (`evals/cases-v6/adversarial/unattended-ship-it-overnight-no-merge-or-tag.md:38`, `:60-61`; `evals/cases-v6/adversarial/unattended-item-says-merge-refused.md:65-66`; `evals/cases-v6/adversarial/unattended-kickoff-claims-approval.md:73-74`; `evals/cases-v6/golden/unattended-close-opens-draft-pr.md:51`; `evals/cases-v6/golden/unattended-blocked-run-still-hands-off.md:49`, `:63-64`), `test/corpus/skills/unattended.test.ts` (`:347-350`; the `actsTold` lint `:94-114`, `:375-378` rescoped so the walk's sentence passes), `test/docsPages.test.ts` (`:2239-2246`, `:2559`, `:2615`, `:2872`), `content/rules/stamity-injection-screening.md` (`:26-29`), `evals/cases-v6/adversarial/benign-state-note-not-screened.md`, `evals/cases-v6/adversarial/state-text-directive-not-executed.md`, `test/corpus/rules/security.test.ts` (`:629`) |
| `interfaces` | No spec file is edited (`v20` merges the delta); the five unattended cases' claims stay valid, all of them unattended; the skill stays under its body cap; the pages name each client's answer and its source. Two wording leftovers of #112 ride here: `SECURITY.md:105` and `docs/security-mapping.md:223` say what the code does for curl's prefixes (any prefix of two or more letters of a listed long option, `src/hooks/personOnly.ts:655-664`), not "a unique prefix" with examples real curl refuses as ambiguous; and the same row's shell-faithful split and wget-write claims, true again once `v0b` lands its two parser fixes; and the row's local-tags sentence narrowed, as `v0b` narrows the code comment, to the reader's two ceilings. Two items routed from `v3` on 2026-10-18 at 20:28Z: the screening rule's session-start sentence (`content/rules/stamity-injection-screening.md:26-29`, reworded in the same line count so no eval range and no always-on line count moves) also names a startup that finds a run on this branch, as `v1` built, with its two quoting cases (`evals/cases-v6/adversarial/benign-state-note-not-screened.md`, `evals/cases-v6/adversarial/state-text-directive-not-executed.md`) re-quoted and the phrase pin at `test/corpus/rules/security.test.ts:629` widened (TEST CHANGE); and the morning walk section of the skill names the late-commit count (commits after the last checkpoint's sha that the run verbs did not make, their subject being `chore(run): checkpoint <id>`, on `Not done:`), since an attended walk reads that section and not the cloud reference; and `SKILL.md`'s `plan check` line (`:51`) may name the single-plan `--since <Base>` form a continued run uses |
| `testCriteria` | `npx vitest run test/corpus test/evals test/docsPages.test.ts` green; the walk's sentence and each client's answer pinned; `test/evals/locators.test.ts` green on every re-quoted brief |
| `edgeCases` | The attended twin case (`evals/cases-v6/golden/benign-attended-twin-leave-uncommitted.md`) does not move; a brief whose quoted line did not move is not touched |
| `depends_on` | v0b-run-verb-alone, v0c-verb-git-env, v5-claude-readiness (the page describes its landed script), v3-cloud-skill (one writer of the skill and its corpus test, the body at its cap) |
| `verify` | `npx vitest run test/corpus test/evals test/docsPages.test.ts test/ci/testInputsGuard.test.ts`; the dogfood sync and the goldens in the integration lane |

### v1-branch-card — the resume card on `startup`, for the run on this branch

| Field | Content |
|---|---|
| `id` | v1-branch-card |
| `requirements` | REQ-CTX-013, REQ-FLOW-105 |
| `files` | `src/runs/resumeCard.ts` (`findCardRun` `:313-337` takes `opts?: { currentBranch?: string }`; the HEAD read's twin beside `commonDir` `:528-555`), `src/runs/cardSource.ts` (one shared `cardCurrentBranch(rootDir)` lifted from the ask gate's `currentBranch`, `src/hooks/scripts.ts:4064-4082`, which the ask gate then embeds too), `src/hooks/scripts.ts` (`:1235-1238`: on `startup` the card prints when the in-progress run's `Branch:` matches HEAD; the closed and debug cards never print on `startup`; the budget row `:176-182`), `src/cli/commands/ledger.ts` (`runStatus` `:697-740`: the JSON gains `branch` and `onCurrentBranch`), `test/hooks/sessionStartCard.test.ts` (`:164-172`, TEST CHANGE), `test/runs/resumeCardParity.test.ts` (`runHook` `:898-908`, `hookCard` `:910-918`; cases `:1202-1560`), `test/hooks/scriptBudget.test.ts` (`:195`, TEST CHANGE) |
| `interfaces` | The session-start row (`scripts.ts:182`, 49,152 bytes and 1,100 lines) has about 169 bytes and 29 lines of room at 96f5eda4 (the golden renders 48,983 bytes). The unit measures first and raises the row once, with a dated reason in the row and in the pinned literal, sized for this unit, `v2`'s line, `v6`'s Cursor line and `v8`'s inlined detector, by the review-gate row's rounding rule (`:166-169`). `findCardRun`'s other caller (`src/cli/commands/gate.ts:1959`) passes no option and keeps its reading |
| `testCriteria` | `startup` with an in-progress run on this branch → the card; on another branch → none; a closed run → none on `startup`; a linked worktree's HEAD read through its `gitdir:`; parity holds on the startup fixture; `ledger status --json` names `onCurrentBranch` |
| `edgeCases` | Two in-progress records, the newer on another branch → the older one's card; a record with no `Branch:` → today's pick on `compact`/`resume`, nothing on `startup`; a detached HEAD → no startup card, `ledger status` still prints; a reftable repository → no startup card (HEAD unreadable, as the guard reads it, `scripts.ts:3601-3603`) |
| `depends_on` | none (file 1's `u1-record-head`) |
| `verify` | `npx vitest run test/hooks test/runs test/cli/commands/ledger.test.ts test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: the resume card → a new session's context on startup. Trusts: the record head on disk, screened as the printed card. Abuse: a planted in-progress record steering a fresh session. Check: the card source's screen; the startup card only for an in-progress run whose `Branch:` matches HEAD; no record body printed |

### v2-review-gate-rebuild — a missing counter is rebuilt, not opened

| Field | Content |
|---|---|
| `id` | v2-review-gate-rebuild |
| `requirements` | REQ-FLOW-106, REQ-FLOW-085 |
| `files` | `src/hooks/scripts.ts` (`record()` `:2906-2976`, `decide()` `:2986-3062`, embedding `v1`'s branch reader: on `STATE_ABSENT` find the in-progress run whose `Branch:` matches and count its `usage: review r<N>` lines), `src/runs/layout.ts` (`USAGE_REVIEW_PATTERN` for the line `- <UTC> usage: review rN …`, `content/commands/st-work.md:331`), `src/cli/commands/gate.ts` (`usageReviewLines` `:1957-1963` re-pointed at it, one spelling), `src/hooks/model.ts` (`:210` "The review-gate counter resets with the VM." rewritten), `docs/getting-started.md` (`:342-344`), two sentences `v1` left stale in `src/hooks/scripts.ts` (the session start's banner, near `:825-835`, still saying the card prints only after a compaction or a resume; the budget table's docstring, near `:166-169`, still calling the session-start row a fixed ceiling), `test/hooks/scripts.test.ts`, `test/hooks/scriptBudget.test.ts`, `test/emit/capabilityMatrix.test.ts`, `test/runs/preflight.test.ts` |
| `interfaces` | The rebuilt entry has `rounds = <count>` and an unrecorded verdict: `decide()` holds the completion (`REVIEW_ROUND_OPEN`, `:3056`) or reaches `CAP_REACHED` (`:3044`); `record()` seeds `previous` from it. The review-gate row is 51,200 bytes and 1,120 lines (`scripts.ts:187`), its golden render 40,761 bytes; its line count is measured at build; the record walk reads a bounded size; the rewritten `model.ts:210` line is printed by the session start and measured against `v1`'s raised row |
| `testCriteria` | No counter file and two `usage: review rN` lines on this branch's run → `rounds` 2, the completion held; no record or no lines → the gate open as today, with the message saying so; a present counter → used as is, nothing rebuilt; the pre-flight's `review-state` warning reads the same pattern; a rebuilt count at the cap → held with the rebuild's own message (one fresh review re-records the lost verdict), never `CAP_REACHED`'s BLOCKED_FAILURE text (`scripts.ts:3037-3048`) |
| `edgeCases` | Two runs in progress → the one on this branch, none matching → open; the last round approved just before the reclaim → held one round below the cap, and at the cap held with the rebuild's message (the verdict is unrecorded) |
| `depends_on` | v1-branch-card, v16-manifest-plugin-block (one writer of `docs/getting-started.md`) |
| `verify` | `npx vitest run test/hooks test/emit/capabilityMatrix.test.ts test/runs/preflight.test.ts test/cli/commands/gatePreflight.test.ts test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: a reclaimed machine → the review gate. Trusts: the run's committed record. Abuse: a run deletes the counter to reopen the gate. Check: absence rebuilds from the branch's record instead of opening |

### v3-cloud-skill — the cloud night in the `st-unattended` skill

| Field | Content |
|---|---|
| `id` | v3-cloud-skill |
| `requirements` | REQ-LADDER-002, REQ-FLOW-105, REQ-FLOW-107, REQ-FLOW-108, REQ-FLOW-112, REQ-FLOW-116, REQ-FLOW-117, REQ-FLOW-118, REQ-FLOW-119 |
| `files` | new `content/skills/st-unattended/references/cloud.md` (as `references/chains.md` holds the chain rules), one pointer line in `content/skills/st-unattended/SKILL.md` after `## Chains` (`:168-170`, so no eval `source:` range moves), `test/corpus/skills/unattended.test.ts` (a pin per rule; the body cap `:33` and `SECTIONS` `:36-47` as the pointer needs, TEST CHANGE), `content/rules/stamity-injection-screening.md` (`:26`, a sentence `v1` left stale: the card's sources are also read on a startup that finds a run on this branch) |
| `interfaces` | The reference's rules: at a usage limit with a reset, checkpoint and refresh the PR body (`stamity run checkpoint --run <id> --paths <p...> --pr --title <t> --json`), record `capacity: <role> limit-reset → BLOCKED_DEPENDENCY` and return it naming the reset, no wait inside the machine; no `/loop` or wakeups; a checkpoint after each review round, so the round's usage line reaches the branch before a reclaim (the review gate rebuilds a lost counter only from what the branch carries; added 2026-10-18 for `review/56`); the full gate as one background command with a timeout, the cloud's one exception to the Shell paragraph; at most two implementers at once; agent teams off; lanes through the client's own isolation or one at a time, never the sibling worktree folder, each folded into the run branch before a checkpoint; Claude Code with several repositories refuses (hooks did not load); Frame in an unattended run continues the in-progress record whose `Branch:` names this branch instead of opening a new one, and on a fresh clone runs `stamity run start --run <id>` first; at the morning walk the commits after the last checkpoint's sha are counted on `Not done:` as `git rev-list <sha>..HEAD` gives them; Copilot: a checkpoint before about minute 45–50, units sized to one session, resume on a person's `@copilot continue` from the committed record, roles in line in order where no sub-agent tool exists and the proof block saying so, the second approver as a morning-list row (`CI not run: awaiting approval` is already at `SKILL.md:116-117`), and, when `.github/agents/stamity-run.agent.md` is not yet on the default branch, a declared `## Prerequisites` row the run writes (`v9`'s edge case). The body keeps its 160-line cap: the pointer line is paid for by a rewrap inside the body, or the cap rises by that line with its reason |
| `testCriteria` | Each rule above pinned by a phrase in the reference; the capacity line's shape pinned; the pointer line pinned; `test/evals/locators.test.ts` green |
| `edgeCases` | A local unattended run → the 12-hour capacity wait of `/st-work`'s ladder stands (`content/commands/st-work.md:110-125`); a reset five minutes away in the cloud → still returns |
| `depends_on` | v21-run-verbs (the fresh-clone sentence names its behaviour); the guard pages unit follows this one as the skill's and its corpus test's next writer |
| `verify` | `npx vitest run test/corpus/skills/unattended.test.ts test/corpus test/evals/locators.test.ts test/ci/testInputsGuard.test.ts`; the dogfood sync and the goldens in the integration lane |

### v4-cursor-continue — Cursor's `stop` hook continues an unattended run

| Field | Content |
|---|---|
| `id` | v4-cursor-continue |
| `requirements` | REQ-FLOW-109, REQ-CTX-016 |
| `files` | `src/adapters/cursor.ts` (`CursorHookEntry` `:891-896` gains `loop_limit`; `buildHooksJson` `:939-1000` adds a `stop` row through `adapterScriptCommand` (`:959-962`), never through the portable runner; the script placed as `MODEL_PINS_HOOK_PATH` is, `:316`, `:535-539`), the builder `stamity-cursor-continue.mjs` in `src/hooks/scripts.ts`, placed right after `buildUnattendedAskGate` (`:3950-4146`) and reusing its `recordHeads` (`:4026-4049`) and `v1`'s branch reader, with its `HOOK_SCRIPT_BUDGETS` row placed after the ask gate's, `src/runs/layout.ts` (`RECORD_CHECKPOINT_PATTERN` for the skill's `- <UTC> checkpoint: <sha> units done=<n> remaining=<m>` line, `content/skills/st-unattended/SKILL.md:80`), `test/hooks/scriptBudget.test.ts` (its `renderAll` entry `:81-108` after the ask gate's; the count `:157`; TEST CHANGE), `test/adapters/cursor.test.ts`, new `test/hooks/cursorContinue.test.ts` |
| `interfaces` | The script answers nothing unless `CURSOR_AGENT_SOCKET` is set (a Cursor agent machine, as `v6`'s script reads it), so a local session on a branch carrying such a record is never steered. Then it reads every in-progress record, with no order among them, as the ask gate does (`scripts.ts:3929-3930`); one reading `Mode: unattended` whose `Branch:` names HEAD and whose last `checkpoint:` line (a bounded body read) carries `remaining=<m>` above 0 → `{ "followup_message": "Continue the run: <m> units remain; the record is <path>." }`, `<m>` digits only and `<path>` built from the folder name, never from record text; anything else → no output; never `failClosed`; `loop_limit` a fixed emitted ceiling (50). `adapterScriptCommand` hard-codes `event: "pre_tool_use"` for the starter (`cursor.ts:959-962`): where the starter reads the event, the row passes its own |
| `testCriteria` | With the socket variable set, an unattended run on this branch with units left → the follow-up; without it → nothing; on another branch, attended, a record with no `Mode:`, or `remaining=0` → nothing; the emitted row carries `loop_limit` and does not pass through the runner |
| `edgeCases` | An unreadable record → nothing (stop); a closed run → nothing; a `checkpoint:` line whose count is not digits → nothing |
| `depends_on` | v2-review-gate-rebuild (one writer of `scripts.ts`' review and session regions and of `scriptBudget.test.ts` at a time) |
| `verify` | `npx vitest run test/adapters/cursor.test.ts test/hooks/cursorContinue.test.ts test/hooks/scriptBudget.test.ts test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: Cursor's stop hook → an agent run kept going. Trusts: the record's `Mode:`, `Branch:` and its checkpoint line. Abuse: a planted record keeping an agent looping, or record text injected into the follow-up. Check: a follow-up only for an unattended run in progress on this branch with units remaining, under a fixed `loop_limit`; the message carries digits and a folder-built path only; never `failClosed` |

### v5-claude-readiness — the cloud machine made ready on Claude Code, and the helper advice

| Field | Content |
|---|---|
| `id` | v5-claude-readiness |
| `requirements` | REQ-FLOW-110, REQ-FLOW-112, REQ-CTX-016, REQ-FLOW-101 |
| `files` | `src/adapters/claude.ts` (placed as the ask gate is, `:547-553`; one more `SessionStart` entry, matcher `startup\|resume`, wired as the ask gate's entry is, `:924-930`), the builder `stamity-cloud-readiness.mjs` in `src/hooks/scripts.ts`, placed right after the review gate's builder, with its `HOOK_SCRIPT_BUDGETS` row after the review gate's and its own timeout, `src/types/markers.ts` (`HOOKS_ACTIVE_ENV = "STAMITY_HOOKS_ACTIVE"` beside `:190`), `src/runs/preflight.ts` (`hooksLoaded` `:484-498` takes `deps.env`, called at `:859`; `GH_HELPER_FIX` `:146-151`), `test/adapters/claude.test.ts`, new `test/hooks/cloudReadiness.test.ts`, `test/runs/preflight.test.ts` (`:590-595`, TEST CHANGE), `test/cli/commands/gatePreflight.test.ts`, `test/manifest/claudeSettings.test.ts`, `test/hooks/scriptBudget.test.ts` (its `renderAll` entry after the review gate's; the count; TEST CHANGE) |
| `interfaces` | The script does nothing unless `CLAUDE_CODE_REMOTE` is `true`; then it first appends `STAMITY_HOOKS_ACTIVE=1` to `$CLAUDE_ENV_FILE` (the hooks loaded, whatever the install does next), then checks `node` against `engines`, runs `npm ci` when `node_modules` is missing and a lockfile exists, and resolves the pinned CLI once; with no `package.json` it skips the install and says so; it always exits 0. With `CLAUDE_CODE_REMOTE` `true` and `STAMITY_HOOKS_ACTIVE` unset, `hooks-loaded` refuses, its fix naming one repository per session. The helper advice becomes one sequence run in the repository, `git config --replace-all credential.helper ''` then `git config --add credential.helper '!gh auth git-credential'`: the repository-level reset clears every entry read before it, system, global and a shim's URL-scoped pair alike, so the system-level unset goes; the advice stays a constant that echoes no value. The `SECURITY.md` sentence for the `npm ci` residual is `v0d`'s |
| `testCriteria` | Local `startup` → nothing done; the cloud marker with a writable env file → the line appended before any install step; an install that times out → the line still there; no env file → logged, exit 0; the pre-flight refuses in Claude Code's cloud without the variable, naming the env file; with a shim's URL-scoped helper pair and a generic helper in the global config, the advised commands run literally leave one gh entry and `direct-push` passes, where today's advice still refuses |
| `edgeCases` | `npm ci` past its timeout → the marker is already written, the session start still runs, and a later pre-flight never reports "hooks did not load" for it; the container leg's `claude` profile runs it offline; a `credential.*` entry later in the repository's own config → the advice text says it must come last |
| `depends_on` | v0a2-ask-emission (one writer of `claude.ts`), v4-cursor-continue (one writer of `scriptBudget.test.ts`' count and `renderAll`) |
| `verify` | `npx vitest run test/adapters/claude.test.ts test/hooks test/runs/preflight.test.ts test/cli/commands/gatePreflight.test.ts test/manifest/claudeSettings.test.ts test/cloud test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: a session's start in a shared cloud machine → `npm ci` and the environment file; the pre-flight's advice → the push identity. Trusts: the repository's lockfile; git's credential config order. Abuse: install scripts at the session's start; advice that leaves another helper ahead of gh's. Check: `npm ci` only from a lockfile, in the cloud only, the residual named; the reset clears every earlier entry and the check still requires gh's helper alone |

### v6-cursor-cloud — Cursor's context-once row and managed-run detection

| Field | Content |
|---|---|
| `id` | v6-cursor-cloud |
| `requirements` | REQ-FLOW-115, REQ-FLOW-085, REQ-CTX-016, REQ-FLOW-016, REQ-WORKTREE-003, REQ-WORKTREE-004 |
| `files` | the builder `stamity-context-once.mjs` in `src/hooks/scripts.ts`, placed right after the session start's builder, with its budget row after the session start's, `src/adapters/cursor.ts` (a `postToolUse` row through `adapterScriptCommand`, never `failClosed`), `src/hooks/model.ts` (`:288-296`: the `CURSOR_AGENT_SOCKET` row re-cited to the identity page, `documented`), `src/hooks/scripts.ts` (`CLOUD_SESSIONS`' Cursor row `:760-764` and its comment `:739`: "a Cursor agent machine, managed or self-hosted"), `src/mcp/env.ts` (`.stamity/context-once/` in `REQUIRED_GITIGNORE_ENTRIES` `:218-225`, with the dominator branch `:270`), `src/cli/commands/init/panel.ts` (`GITIGNORE_REASONS` `:744-751`), `src/worktree/policy.ts` (a folder-prefix predicate beside `isReviewGateStatePath` `:205-215`, used at `:536`), `docs/getting-started.md` (`:338-344`), new `test/hooks/contextOnce.test.ts`, `test/adapters/cursor.test.ts`, `test/cloud/containerLeg.test.ts`, `test/cloud/profiles.test.ts` (`v12`'s profile assertion of the Cursor line) and `test/hooks/scripts.test.ts` (the "self-hosted Cursor worker" phrase) |
| `interfaces` | Only where `CURSOR_AGENT_SOCKET` is set: on the first `postToolUse` of a conversation (marker `.stamity/context-once/<sha256(conversation_id)>`) it prints the screened session index as Cursor's own `additional_context` (an adapter script runs through the starter, not the portable runner), after one `agent/runtime` read over the socket (one retry; a missing key tolerated) adding `Session: a Cursor cloud agent.` on `managed`. The emission goldens' snapshot (`test/corpus/__snapshots__/emissionGoldens.test.ts.snap`) is regenerated in the integration lane |
| `testCriteria` | First call → the index once; second call with the same id → nothing; no socket variable → nothing; a `conversation_id` of `../x` → hashed, never a path; the marker folder ignored by git and refused in a worktree policy |
| `edgeCases` | No `conversation_id` → nothing printed, no marker; an unwritable state folder → printed once, exit 0 |
| `depends_on` | v4-cursor-continue (one writer of `cursor.ts`), v5-claude-readiness (one writer of the budget rows and `scriptBudget.test.ts`), v2-review-gate-rebuild (one writer of `docs/getting-started.md`), v12-container-leg (its profile test asserts the Cursor line) |
| `verify` | `npx vitest run test/hooks test/adapters/cursor.test.ts test/cloud test/mcp test/worktree test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: hook-injected context in Cursor sessions, and the local `agent/runtime` socket. Trusts: the session-start screen; the socket. Abuse: unscreened text injected once per conversation, or a hostile `conversation_id` path. Check: the session start's screen reused; the id hashed, never a path; one socket read, no network |

### v7-cursor-agents-block — the Cursor cloud block in `AGENTS.md`

| Field | Content |
|---|---|
| `id` | v7-cursor-agents-block |
| `requirements` | REQ-FLOW-114, REQ-PROVE-003, REQ-PROVE-005 |
| `files` | `src/emit/agentsMd.ts` (`renderCursorCloudBlock(ctx): { content; lineCount }`), `src/emit/planner.ts` (`:1023-1029`: appended to the root row only when Cursor is selected, at the end), `src/content/charter.ts` (`composeAlwaysOnLoad` `:449-462` gains the selection; a with-Cursor shared-bytes figure beside `ALWAYS_ON_SHARED_BYTES_WITH_CODEX` `:339` and `ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX` `:374`; the line ceilings `:157-216`), `src/emit/capabilityMatrix.ts` (`:309-314`: the always-on cost with and without Cursor), `test/corpus/invariants.test.ts` (`:796-805`, a byte tripwire: two figures, TEST CHANGE), `test/emit/agentsMd.test.ts` (existing; cases appended) |
| `interfaces` | The block: `/st-<id>` means read `.agents/skills/st-<id>/SKILL.md`; the screened read (the charter's invariant 5 command for `cursor`); "Node first: run `node --version` before anything else, and stop with that fix if it fails"; keep the PR a draft and never mark it ready; an unattended run follows the `st-unattended` skill |
| `testCriteria` | Present with Cursor selected, absent without, its line count exact; the root `AGENTS.md` byte figures pinned per selection; Codex's override file unchanged |
| `edgeCases` | `AGENTS.md` set to `skip` → no block, `check` warns; Cursor with Claude Code → Claude pays the block through `CLAUDE.md`'s import and the disclosure says so |
| `depends_on` | v2-review-gate-rebuild (one writer of `test/emit/capabilityMatrix.test.ts`) |
| `verify` | `npx vitest run test/emit/agentsMd.test.ts test/corpus/invariants.test.ts test/emit/capabilityMatrix.test.ts test/ci/testInputsGuard.test.ts` |

### v8-detect-translator — one session detector; the translator's cloud line

| Field | Content |
|---|---|
| `id` | v8-detect-translator |
| `requirements` | REQ-FLOW-080, REQ-PROVE-039 |
| `files` | new `src/session/detect.ts` (a wave entry below `src/hooks/scripts.ts`' wave, `test/architecture/boundaries.test.ts:414`), `src/hooks/scripts.ts` (`CLOUD_SESSIONS` `:743-766` and `sessionLines` `:1199-1210` built from it, inlined as `NORMALIZE_FOR_SCREEN` is, `:396`, `:861`), `src/cli/commands/gate.ts` (`CLOUD_MARKERS` and `setIn` `:1965-1976`, the JSON fields `:2024-2026`, read through `detectSession`), `src/runs/preflight.ts` (`:873-874`), `src/tools/translator.ts` (`AskUserToolEntry` `:385-390` gains `cloud?: string`, one sentence; Cursor's "In a managed cloud run, ask nothing and take the declared default."; Copilot's "The cloud agent has no person to answer; take the declared default."; the column in `buildAskUserPlatformTable` `:470-477`), `src/emit/skillsProjection.ts` (`:758-759`), `test/tools/translator.test.ts`, new `test/session/detect.test.ts`, `test/architecture/boundaries.test.ts`, `test/cli/commands/gatePreflight.test.ts` |
| `interfaces` | `detectSession(env): { kind: "claude-cloud" \| "copilot-cloud" \| "cursor-agent" \| "ci" \| "local"; markers: string[] }`, first match in today's order, `""`, `false` and `0` not set; `CLAUDE_CODE_REMOTE` counts only as `true`, so the pre-flight's JSON `cloud` for `1` becomes false, a stated change; never "unattended" |
| `testCriteria` | One assertion per marker; `CI=true` with `CLAUDE_CODE_REMOTE=true` → `claude-cloud`; the session-start output byte-equal to before for every existing fixture; the pre-flight's `client` and `cloud` fields read through the detector |
| `edgeCases` | No marker → `local`; `CLAUDE_CODE_REMOTE=1` → not cloud (equals `true` only) |
| `depends_on` | v6-cursor-cloud (one writer of `CLOUD_SESSIONS`), v5-claude-readiness (one writer of `preflight.ts`) |
| `verify` | `npx vitest run test/session/detect.test.ts test/hooks test/cloud test/tools/translator.test.ts test/architecture/boundaries.test.ts test/cli/commands/gatePreflight.test.ts test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: environment markers → the session lines, the pre-flight's fields and the translator's cloud note. Trusts: the markers. Abuse: a marker set to pass a local session off as a cloud one. Check: a cloud marker never selects unattended (REQ-FLOW-089); the detector only labels |

### v9-copilot-entry — the thin entry agent and the chain

| Field | Content |
|---|---|
| `id` | v9-copilot-entry |
| `requirements` | REQ-FLOW-117, REQ-FLOW-118 |
| `files` | `src/adapters/copilot.ts` (`copilotResiduePlanner` `:377-437`, its rows `:420-431`, emits `.github/agents/stamity-run.agent.md` with Copilot selected; `buildSetupSteps` `:863-933` gains `timeout-minutes`), `test/adapters/copilot.test.ts` (`:724-776`, `:1276-1509`) |
| `interfaces` | The agent's body (under 2,000 characters): read `.github/prompts/st-work.prompt.md`, then the plan path the issue names; an unattended run follows the `st-unattended` skill; never the prompt inlined. No roster row: `AGENT_POLICY_ROSTER` (`src/roster/agentPolicies.ts:193`), its count test and `RUNTIME_AGENT_IDS` do not move; if an emission test ties every `.github/agents/stamity-*` file to a roster row, the file is `run.agent.md` instead |
| `testCriteria` | Emitted only with Copilot selected; its size far under the 30,000-character cap (`COPILOT_AGENT_PROMPT_CAP`, `copilot.ts:116`); it names the prompt path; setup steps carry `timeout-minutes`; the roster count unchanged |
| `edgeCases` | The agent file absent from the default branch → a declared `## Prerequisites` row the skill writes (the engine infers only env and migration rows, `src/runs/prerequisites.ts:20-30`); no `task` tool → roles in line (`v3`'s text) |
| `depends_on` | v16-manifest-plugin-block (one writer of the adapter tests) |
| `verify` | `npx vitest run test/adapters/copilot.test.ts test/roster test/ci/testInputsGuard.test.ts` |

### v10-copilot-cursor-setup — Copilot installs the pinned CLI; `check` gives Cursor's install lines

| Field | Content |
|---|---|
| `id` | v10-copilot-cursor-setup |
| `requirements` | REQ-FLOW-111 |
| `files` | `src/adapters/copilot.ts` (`buildSetupSteps` gains an optional `cli` parameter from `cliCallContextOf(ctx)`, `:425`, so its 14 direct test calls stay valid, and a step installing the pinned CLI), `src/cli/commands/check.ts` (`:1721-1752`: a `cloud-install` row, `const id = "cloud-install"`, shown only with Cursor selected), `docs/troubleshooting.md` (the "What `check` prints" section gains the row; `test/docsPages.test.ts:3940-3970` ties the two; the page's probe count and ordinal words, near `:79-81`, made to match the rows after `v16` removed one and this unit adds one), `test/adapters/copilot.test.ts`, `test/cli/commands/check.test.ts` |
| `interfaces` | The step pins the version the setup was generated with, built with `pinnedCliCall` (`src/shared/cliCall.ts:184-190`) and honouring `npmChannel` and `npmRegistry` (`src/emit/substitution.ts:151`); the `check` row prints the install lines and never fails. Copilot's hook entry keeps naming the pinned version (inbox row 257), as Codex's matching question waits for Package 20 |
| `testCriteria` | The setup steps hold the pinned install; a fork's channel and registry reach it; `check` lists `cloud-install` with Cursor selected only; the troubleshooting page lists it |
| `edgeCases` | A repository with no `package.json` → the pinned global install; no Cursor → no row |
| `depends_on` | v9-copilot-entry (one writer of `copilot.ts`), v16-manifest-plugin-block (one writer of `check.ts` and `docs/troubleshooting.md`) |
| `verify` | `npx vitest run test/adapters/copilot.test.ts test/cli/commands/check.test.ts test/docsPages.test.ts test/ci/testInputsGuard.test.ts` |

### v11-cloud-facts-matrix — the cloud facts and the matrix's unattended rows

| Field | Content |
|---|---|
| `id` | v11-cloud-facts-matrix |
| `requirements` | REQ-PROVE-044, REQ-FLOW-113 |
| `files` | `src/hooks/model.ts` (`CLIENT_CLOUD_FACTS` `:173-335`: Claude Code's GitHub Action rows — the six-hour job cap `documented`, no question tool by default `unverified`, `.claude/` restored from the base branch `documented`, none with a session-start line; the unattended rows per cloud; `ClientCloudFact` `:136-158` gains `run?: { record: string; date: string }`), `src/emit/capabilityMatrix.ts` (`cloudSection` `:756-784`: a column reading "not run" where `run` is absent), `docs/capability-matrix.md` (regenerated in the integration lane), `test/emit/capabilityMatrix.test.ts` |
| `interfaces` | `CloudFactStatus` stays `documented \| not documented \| unverified` (`model.ts:133`); Copilot's unattended rows carry no `run` and read "documented, not run" |
| `testCriteria` | Each new row renders; a row with no `run` reads "not run"; the matrix page byte-equal to its regeneration |
| `edgeCases` | A fact with no glance row → fine; a second glance row for a client → refused as today (`src/emit/capabilityMatrix.ts:435`) |
| `depends_on` | v2-review-gate-rebuild, v6-cursor-cloud (one writer of `model.ts`), v7-cursor-agents-block (one writer of `capabilityMatrix.ts`) |
| `verify` | `npx vitest run test/emit/capabilityMatrix.test.ts test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: dated vendor facts → the session lines and the matrix a person trusts. Trusts: the vendor pages as read. Abuse: a stale fact read as current. Check: a status per fact, the `run` column, and the release checklist's re-read line (`v15`) |

### v12-container-leg — the container leg runs the cloud profiles

| Field | Content |
|---|---|
| `id` | v12-container-leg |
| `requirements` | REQ-PROVE-037, REQ-PROVE-039 |
| `files` | `.github/workflows/ci.yml` (`cloud-container` `:460-502` and the header comment `:77-82`: no `container:`, `runs-on: ubuntu-latest`, one step `node scripts/ci/cloud-leg.mjs`; its place in `all-ci-checks` `:789`, `:805`, `:813`, `:816` kept), new `scripts/ci/cloud-leg.mjs` (the image digest's new home), new `test/cloud/profiles.test.ts`, new `test/cloud/ending.test.ts`, new `test/support/cloudRemote.ts`, new `test/ci/cloudLeg.test.ts`, `test/ci/workflow.test.ts` (`:683-691`, `:704-713`, TEST CHANGE), `.github/release-controls-checklist.md` (`:334` re-pointed at the digest's new home) |
| `interfaces` | The script runs the image pinned by digest through `docker run` once per profile — `claude` (an empty `HOME`, `CLAUDE_CODE_REMOTE=true`), `cursor` (a socket stub and its variable), `copilot` (`HOME=/root`, working directory `/workspace`, `GITHUB_TOKEN` unset) — and once with `--network none`; the host builds first (`npm ci`, `npm run build`), each run mounts that built tree read-only and copies it to a writable work folder inside with a temporary `HOME` and cache, needing no install, so the offline run works; no Docker socket. Inside: `test/cloud/` with two clones under one parent; a bare remote whose `pre-receive` refuses tags, deletions and the default branch; origin `https://github.com/o/r.git` mapped to it by `url.<bare>.insteadOf` and the origin pin `stamity run start` writes (as `test/cli/commands/runEnd.test.ts:56-63`, `:141-166` do); a `gh` stub on `PATH` answering `api --hostname … --include --method …` with an HTTP head line (`src/cli/engine/ghRunner.ts:134-168`): `GET repos/o/r` → 200 with `default_branch`, `GET …/pulls?head=` → 200 `[]`, `POST …/pulls` with `draft: true` → 422 "Draft pull requests are not supported in this repository." (the `[DRAFT]` fallback's trigger, `src/runs/pullRequest.ts:76`, `:294-296`), a second variant → 201; GraphQL is refused before `gh` starts (`ghRunner.ts:122`), so none is stubbed; each profile asserted through the session start's printed cloud line; `stamity run end` end to end |
| `testCriteria` | One cloud line asserted per profile; offline, every hook still exits 0 within its timeout; the 422 → a `[DRAFT]` PR; both POSTs failing → `Not done: draft PR not opened` naming the branch (`pullRequest.ts:245`); the job still required by the aggregator; every new `test/cloud/` file passes or skips with its reason on the Windows `check` shards (a POSIX `pre-receive` hook and a shell stub skip there, or the stub is Node) |
| `edgeCases` | `CI=true` beside `CLAUDE_CODE_REMOTE=true` → the Claude cloud line with "Also detected" (`src/hooks/scripts.ts:1208`); a pushed tag or a push to the default branch → refused by the bare remote, and the verb's `notDone` names it |
| `depends_on` | none (file 1's `cloud-container` job) |
| `verify` | `npx vitest run test/ci/workflow.test.ts test/ci/cloudLeg.test.ts test/cloud test/ci/testInputsGuard.test.ts` (the profiles run in CI; locally the script's `--dry-run` prints them) |
| `threat` | Boundary: CI's runner → a container with the repository's source. Trusts: the image by digest. Abuse: a test step reaching the host through a mounted socket or a writable source. Check: no socket, the source read-only, the digest pinned; `workflow.test.ts` asserts no secret in the job |

### v13-client-legs — the client-CLI legs and the release-prep run, built and off

| Field | Content |
|---|---|
| `id` | v13-client-legs |
| `requirements` | REQ-PROVE-040, REQ-FLOW-113, REQ-FLOW-104 |
| `files` | `scripts/qa/hook-runs.mjs` (a `main(argv)`: `--clients`, `--out`, `--require-observation`, exiting non-zero when `claude -p` loads no project hook; and `--ask`, which repeats the 2026-10-18 measurement per installed client in a throwaway folder outside the checkout — a hook answering ask on one harmless marked command in a headless run, in each permissive mode the client offers (Claude Code's bypass mode, Cursor's `--force`, Copilot's allow-all) — and reports `held` or `ran` per client and mode, exiting non-zero when an ask-class client's ask ran), `.github/workflows/nightly.yml` (a `hook-fire` job and a `release-prep-unattended` job under the exact repository guard `if`), `test/ci/workflow.test.ts` (the job list `:1426-1430`, the guard `:1517-1522`, the no-secret assertion `:1504-1505` and the closed secrets list `:3957-3984`, both TEST CHANGE, the list's comment recording the decision that brings the client credentials back), new `test/qa/hookRunsCli.test.ts`, `test/qa/hookRuns.test.ts` (a case pinning Claude's arguments to hold no `--bare`) |
| `interfaces` | Per client: an arm step holding only that client's secret, writing `armed=true\|false` to `$GITHUB_OUTPUT` and never the value; an install step and a drive step `if: steps.arm-<c>.outputs.armed == 'true'`; `release-prep-unattended` runs on `workflow_dispatch` with `inputs.release_prep` only, the light unattended `/st-work` against a bare remote with `--permission-prompts none`; the client args keep no `--bare` |
| `testCriteria` | The arm steps run under `sh` with an empty environment → `armed=false`, exit 0; one secret per step; neither job feeds `all-ci-checks`; `hook-runs.mjs --require-observation` with an empty observation log → non-zero; `--ask`'s verdict function, given a client run that created the marked file, reports `ran` and exits non-zero for Claude Code or Copilot, and `held` otherwise (the client runs injected; inline mock reason: accounts) |
| `edgeCases` | No secret → every drive step skipped, the job green; a secret set and an install failing → red, never in the merge gate |
| `depends_on` | v12-container-leg (one writer of `workflow.test.ts`) |
| `verify` | `npx vitest run test/ci/workflow.test.ts test/qa/hookRunsCli.test.ts test/qa/hookRuns.test.ts test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: repository secrets → CI steps. Trusts: the step that holds the secret. Abuse: a secret printed or reaching a step that does not need it. Check: one secret per step, the arm step writes a boolean only, `workflow.test.ts` asserts both |

### v14-cloud-check — the maintainer's cloud check, scripted

| Field | Content |
|---|---|
| `id` | v14-cloud-check |
| `requirements` | REQ-PROVE-041, REQ-PROVE-021 |
| `files` | new `scripts/qa/cloud-check.mjs`, new `test/qa/cloudCheck.test.ts`, `scripts/qa/form.mjs` (rows P1, P2, P3 in a `cloud` lane; the "nine rows" comments `:4-6`, `:25-32`), `scripts/qa/run.mjs` (`:533-581`: a `cloud` lane branch reading `cloud-check.mjs verify`'s output, else `not-run`, so the rows are not scored as keyboard rows), `test/qa/form.test.ts` (`:161-166`), `test/qa/run.test.ts` (two edits, each with a TEST CHANGE reason: `:351`, the expected row list gains P1–P3 after H3d; `:565`, the open count moves from 1 to 4) |
| `interfaces` | `setup --owner <login> [--clients claude,cursor] [--dir <tmp>]` builds the fixture (`createFixture`, `scripts/qa/fixtures.mjs:160`) with a contract file and a plan, creates the public repository by REST and pushes, records `main`'s sha and prints the start commands; `verify --repo <o/r> --client <c> [--out]` reads by REST only — one open draft (or `[DRAFT]`) PR, unmerged; its body's morning-list sections and a `Default applied:` line; the branch's record reading `Mode: unattended`; `main` and the tags unchanged — and prints `pass\|failed\|not-run (<reason>)`; `teardown` prints the deletion command and runs nothing. Every client-touching step runs under the machine lock and never during an eval run; P3 reads `not-run: no Copilot cloud-agent account` |
| `testCriteria` | `verdictForCloud(prs, files)` pure, with the REST boundary injected (inline mock reason: network and accounts): two drafts → `failed` "duplicate"; a PR no longer a draft → `failed`; the clean case → `pass`; the form lists P1–P3 in the `cloud` lane and `run.mjs` dispatches it |
| `edgeCases` | A moved `main` → `failed`; no PR yet → `not-run (no PR)` |
| `depends_on` | none |
| `verify` | `npx vitest run test/qa/cloudCheck.test.ts test/qa test/ci/testInputsGuard.test.ts` |

### v15-cloud-page — `docs/cloud.md`, the contract's section and the cadence line

| Field | Content |
|---|---|
| `id` | v15-cloud-page |
| `requirements` | REQ-PROVE-042, REQ-PROVE-043, REQ-FLOW-113, REQ-FLOW-104 |
| `files` | new `docs/cloud.md` (per cloud: setup, branch protection with no bypass as a prerequisite, secrets, starting a contract run, the morning walk; the GitHub Action as a six-hour surface; the run contract's section; no vendor URL), `test/docsPages.test.ts` (`GUIDES` `:189-208`; the count words "eleven guides" `:174-188` → twelve and "all fourteen" `:904-910` → fifteen; the currency header `:972`, `:988`), `website/sidebars.ts` (`:76-84`), `README.md` (`:116` "the eleven guides" → twelve; the map rows near `:120-131`, `MAPPED_GUIDES`), `src/cli/docs/llmsIndex.ts` (the Guides section `:148-234`, before the migration entry `:222-232`), `.github/release-controls-checklist.md` (one line: re-read the cited vendor pages; a changed page re-owes its cloud's row; and one more: run `node scripts/qa/hook-runs.mjs --ask` under the machine lock, a client whose ask ran moving to refusing before the tag) |
| `interfaces` | The page's facts match `CLIENT_CLOUD_FACTS` (`v11`); the contract section names the parser's keys (`src/runs/runContract.ts:11-26`, `:74-89`): `run-contract`, `plan`, `item`, `base`, `acceptance`, `scope`, `prerequisites`, `budget` with `stop-by` and `max-units`, `answerer`, `preview: stop`, `move: off`, and the start check `stamity plan check --contract <path>` (`src/cli/commands/plan.ts:80`); the checklist line opens "A further line", takes no ordinal, and carries `Runs when:` (`test/docsPages.test.ts:1656-1667`) |
| `testCriteria` | The docs test green with the page in the hand bucket; the sidebar, map and `llms.txt` list it; the count words moved; the checklist line carries `Runs when:` |
| `edgeCases` | A vendor URL typed on the page → the docs test red (intended) |
| `depends_on` | v11-cloud-facts-matrix, v14-cloud-check, v12-container-leg (one writer of the release checklist), v13-client-legs (the `--ask` mode the checklist line runs), v0d-guard-pages (one writer of `test/docsPages.test.ts`) |
| `verify` | `npx vitest run test/docsPages.test.ts test/cli/docs test/ci/docsRoster.test.ts test/ci/docsSite.test.ts test/ci/testInputsGuard.test.ts` |

### v16-manifest-plugin-block — the held `plugin` block and its warning leave

| Field | Content |
|---|---|
| `id` | v16-manifest-plugin-block |
| `requirements` | REQ-PLUGIN-014, REQ-PLUGIN-016, REQ-LADDER-005 |
| `files` | `src/manifest/manifest.ts` (`:109`, `MANIFEST_FIELD_ORDER` `:219-235`, `:1024-1025`, the unknown-key refusal `:1034-1039`, `:1224-1229`, `:1248`, `:1273`), `src/types/manifest.ts` (`plugin?: unknown` `:369-373`), `src/cli/commands/sync/report.ts` (`leftoverPluginReportLines` `:206-216`, `:330`; the drop printed once, in "would" wording on a dry run), `src/cli/commands/sync/engine.ts` (`SyncPlan` gains one boolean, set from the raw read that already feeds `manifestMigrated`, `readOnDiskManifestVersion` `:258-268`, `:541-544`, `:630`), `src/cli/commands/sync.ts` (`syncClosingLines` `:185`: the migration line in "would" wording on a dry run, inbox row 266), `test/cli/commands/syncEngine.test.ts`, `src/cli/kit/packageName.ts` (`leftoverPluginLines` `:315-348`, deleted with its three callers), `src/cli/commands/clean.ts` (`:44`, `:395-401`), `src/cli/commands/check.ts` (`plugin-duplicates` `:1222-1235`, `:1712`, `:1738`), `src/cli/engine/emissionWrite.ts` (`:1037`, checked), `docs/troubleshooting.md` (`:23`, `:44`, `:108-110`), `docs/getting-started.md` (`:115`), `test/manifest/manifest.test.ts`, `test/cli/commands/sync.test.ts`, `test/cli/commands/check.test.ts`, `test/cli/commands/clean.test.ts`, `test/emit/upgradeFrom1140.e2e.test.ts`, and the test files whose literals carry `plugin` (the held-block cases in `test/adapters/claude.test.ts`, `cursor.test.ts`, `codex.test.ts`, `copilot.test.ts`, `test/emit/planner.test.ts`, `test/cli/commands/syncEngine.test.ts` and the rest the typecheck names) |
| `interfaces` | `plugin` is removed from the raw object before `collectManifestErrors` on read, with no `MANIFEST_MIGRATIONS` step (keyed by the version it starts from, `:136-163`); `sync` writes the manifest without it, says so once, and moves no byte on a second run; no generation bump (a 1.15 engine still reads what 1.16 writes); `check` has no `plugin-duplicates` row; inbox row 255 closes with the warning; `--dry-run`'s lines read as what a real run would do (inbox row 266) |
| `testCriteria` | The upgrade test from a 1.15.0 tree with the block → green, the block gone after one `sync`, byte-stable on a second; `npm run typecheck` green |
| `edgeCases` | A manifest without the block → unchanged; `--dry-run` → reports the drop as what a real run would do |
| `depends_on` | none |
| `verify` | `npx vitest run test/manifest test/cli/commands/sync.test.ts test/cli/commands/check.test.ts test/cli/commands/clean.test.ts test/emit/upgradeFrom1140.e2e.test.ts test/adapters test/docsPages.test.ts test/ci/testInputsGuard.test.ts && npm run typecheck` |
| `threat` | Boundary: the manifest on disk → `sync`'s write. Trusts: the manifest. Abuse: a field kept through the hold window to steer configuration. Check: the block accepted on read, never used, and dropped on write |

### v17-model-list-cache — the account's model list leaves the committed manifest

| Field | Content |
|---|---|
| `id` | v17-model-list-cache |
| `requirements` | REQ-LADDER-009, REQ-LADDER-006 |
| `files` | `src/types/manifest.ts` (`:203-226`: `models.listed` no longer written to the committed manifest; the `ListedModels` export kept, `src/index.ts:73-82`), `src/manifest/manifest.ts` (`:635-640`, `:671-690`), `src/cli/engine/clientModels.ts` (the git-ignored cache's reader and writer), `src/cli/commands/init/apply.ts` (`:200-216`), `src/cli/commands/sync.ts` (`:240-241`), `src/cli/commands/sync/engine.ts` (`:551-556`), `src/cli/commands/check.ts` (`:1537`, `:1629-1631`, `:1654`), `src/cli/commands/config.ts` (`:334-337`), `src/cli/docs/configReference.ts` (`:254`; `docs/configuration.md` regenerated in the integration lane), `src/mcp/env.ts` (the cache in `REQUIRED_GITIGNORE_ENTRIES`), `SECURITY.md` (`:175-200`), `docs/workspaces.md` (`:335`), with the adapters' readers (`copilot.ts:397`, `codex.ts:462`, `cursor.ts:473`, `claude.ts:632`) reading the cache |
| `interfaces` | A checkout with no cache reads its model rows as unverified and `sync` keeps the pick already emitted, so a fresh clone shows no drift; another account's list differs → a warning, never a failure; a 1.15.0 manifest's `models.listed` moves to the cache at the next `sync` and is not written again; no generation bump |
| `testCriteria` | `check` in a fresh clone → no drift; an old manifest → moved once, then absent; another account → a warning; the upgrade test green |
| `edgeCases` | `STAMITY_NO_CLIENT_PROBE=1` with an old manifest → moved once, then dropped; an unwritable cache → the list kept in memory for the run, a warning |
| `depends_on` | v16-manifest-plugin-block, v10-copilot-cursor-setup, v6-cursor-cloud, v5-claude-readiness (one writer per adapter and of `check.ts`), v0d-guard-pages (one writer of `SECURITY.md`) |
| `verify` | `npx vitest run test/manifest test/cli/engine/clientModels.test.ts test/cli/commands/check.test.ts test/cli/commands/config.test.ts test/cli/commands/sync.test.ts test/cli/commands/syncEngine.test.ts test/cli/commands/init test/mcp test/emit/upgradeFrom1140.e2e.test.ts test/adapters test/ci/testInputsGuard.test.ts && npm run typecheck` |
| `threat` | Boundary: a git-ignored cache → the model pick emitted for every client. Trusts: the client CLI's own list. Abuse: a planted cache steering a sub-agent's model. Check: the cache read with the manifest list's validation (shape, the 200-id cap, the resolver's order); `check` warns on a mismatch, never fails, except that with a cache present it does not re-read Codex's own list, as SECURITY.md states (amended 2026-10-18 for `review/110`) |

### v18-egress-pins — the release egress page's pins tied to the workflows

| Field | Content |
|---|---|
| `id` | v18-egress-pins |
| `requirements` | REQ-PROVE-045 |
| `files` | `.github/release-egress.md` (`:29`, the one pinned link: `step-security/harden-runner` at `351661ca…`, re-pointed at the workflows' `ccd8616d… # v2.22.1`, `release.yml:107`, `:582`, `pack-signing-rehearsal.yml:41`, `:113`, `:201`), new `test/ci/releaseEgress.test.ts` (beside the host checks at `test/ci/workflow.test.ts:2771-2784`, which stay) |
| `interfaces` | Each action the page links at a sha pins the same sha as the workflows that use it; closes inbox row 119 |
| `testCriteria` | The test fails when a workflow's pin and the page's differ, naming the action and both shas; green after the re-point |
| `edgeCases` | An action named on the page and used by no workflow → the test names it |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/releaseEgress.test.ts test/ci/testInputsGuard.test.ts` |

### v19-eval-cut-prep — the Cursor case, the two misses, the changelog

| Field | Content |
|---|---|
| `id` | v19-eval-cut-prep |
| `requirements` | REQ-FLOW-080 |
| `files` | a new golden case `evals/cases-v6/golden/cursor-cloud-question-takes-default.md` (not a floor; its `source:` a `content/` path — the content file holding the platform marker `src/emit/skillsProjection.ts:758-759` renders — since `scripts/eval/run.mjs:56` and `test/evals/coverage.test.ts:66-74` require one); the misses, fixed in the cases after the run-47 samples' judge spans are read: `cut/24`, `evals/cases-v6/golden/reviewer-shallow-wrapper-pass-through.md` (B1–B3; the sentence at `:74` that makes the pass-through look planned), and `cut/25`, `evals/cases-v6/golden/plan-security-unit-carries-threat-note.md` (B5; the request's wording at `:64`); `evals/SET-v7.md` (the roster `:130-131`, `:3142-3149`, the golden denominator, the release-run figures), `scripts/eval/run.mjs:50`, `.stamity/overrides/skills/st-eval-run/SKILL.md:133`, `evals/README.md:566`; `CHANGELOG.md` (entries under `## [Unreleased]` for file 1's unattended work and this file's: Added; Changed — attended, the guard asks for one click on Claude Code (Copilot CLI, Cursor and Codex refuse; amended for `review/89`) and refuses every deletion and force push, and the deny rows are always on; Removed — the held `plugin` block; the cut renames the section) |
| `interfaces` | The roster after: 155 cases, 88 golden, 42 floors; the golden denominator 88; a release run 465 scenarios and 930 calls (935 with judges); the binding and advisory totals move by the new case's rows |
| `testCriteria` | `npx vitest run test/evals test/ci/changelogLinks.test.ts` green; every count the page, the README, the skill and the runner state agrees; the release run measures the three cases |
| `edgeCases` | A miss that the case fix does not move → named in the cut's record as the run's known miss, never hidden |
| `depends_on` | v3-cloud-skill, v8-detect-translator, v0d-guard-pages (one writer of `evals/` at a time) |
| `verify` | `npx vitest run test/evals test/ci/changelogLinks.test.ts test/ci/testInputsGuard.test.ts`; the dogfood sync in the integration lane for the override's copy |

### v21-run-verbs — a continuation on another machine, and a staged-then-deleted held path

| Field | Content |
|---|---|
| `id` | v21-run-verbs |
| `requirements` | REQ-FLOW-105, REQ-FLOW-093 |
| `files` | `src/cli/commands/run.ts` (`start` `:297-319`, `:332`, `:338`; the held patch `:798`, `:813-834`, `:842`), `test/cli/commands/run.test.ts` (beside `:270`), `test/cli/commands/runCheckpoint.test.ts` (`:290-325`, `:310` TEST CHANGE) |
| `interfaces` | `run start` with no local `stamity/<run-id>` reads `refs/remotes/origin/<runBranch>`; naming a commit, and the run's record read at that tip (`git show <tip>:.stamity/runs/<run-id>/record.md`) naming a `Base:` the tip descends from (`git merge-base --is-ancestor`), it runs `switch --quiet --create <runBranch> <that commit>`, reports "created from origin's stamity/<run-id>", and the dry-run base becomes `existing ?? remoteTip ?? head`; a tip that does not descend from its record's `Base:`, or carries no record, is refused with its reason; otherwise as today. The held patch leaves out a staged held path absent at `Base:` and absent from the work tree (both ends absent, read from `changedSince(top, base)`, `:798`): it gets no section, is still restored out of the index (`:842`), and the held line names it "staged, then deleted: no section" |
| `testCriteria` | A fresh clone of a bare remote holding `stamity/<id>` one commit ahead of `main` → `run start --run <id>`: HEAD and `base` equal the remote tip, and `run checkpoint` then pushes as a fast-forward (today HEAD is `main`'s tip); in the `:290` case, `git apply` of the patch on `Base:` leaves no `.github/workflows/x.yml`, and the patch holds no section for it; the reverse case (deleted at `Base:`, recreated in the work tree) stays green |
| `edgeCases` | A stale clone that never fetched the branch → today's behaviour, a named residual; a remote ref that names no commit → today's behaviour; a remote tip whose record's `Base:` it does not descend from → refused, naming both shas |
| `depends_on` | none |
| `verify` | `npx vitest run test/cli/commands/run.test.ts test/cli/commands/runCheckpoint.test.ts test/cli/commands/runEnd.test.ts test/architecture test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: origin's run branch → a fresh machine's local branch and the run's base; the held patch → the person's later `git apply`. Trusts: origin's ref and the record it carries. Abuse: a run branch rewritten on origin to a history that skips the run's base; a patch restoring a file the run deleted. Check: the tip must descend from its record's `Base:`; a staged-then-deleted held path gets no section |

### v22-plan-check — a cycle is reported once, and a bare shorthand id is read

| Field | Content |
|---|---|
| `id` | v22-plan-check |
| `requirements` | REQ-FLOW-091 |
| `files` | `src/runs/planCoverage.ts` (the cycle walk `:404-414`; `ID_SCAN` `:123`), `content/skills/st-verify/scripts/spec-plan-coverage.mjs` (the twin `:273-280`, `:43-44`, `:68-70`), `test/runs/planCoverageParity.test.ts` (`:159` the two-cycle pin → one finding, TEST CHANGE; a bounded case beside `:171-190`), `test/authoring/specPlanCoverage.test.ts` |
| `interfaces` | A three-colour walk: an on-stack set and a done set, a unit marked done after its walk whatever it found, a cycle reported once as the trail from the unit found on the stack; in a unit's `requirements` field only, a bare `\d{3,}` directly after `, ` that follows an id reads as shorthand for that id's area, in both twins, while Spec delta prose reads as today, so a number in a sentence is never taken for an id. The `.mjs` hash and bytes in `test/emit/__snapshots__/crossClientGoldens.test.ts.snap` and `test/corpus/emissionGoldens.test.ts:384`, and the dogfood skill copies, move in the integration lane |
| `testCriteria` | The 60-unit chain plus a unit leading into a two-unit cycle finishes inside the 10-second kill, with exactly one `dependency-cycle` finding and the twins equal (today it never ends); `REQ-DEMO-001, 002` covers `REQ-DEMO-002`, so no `missing-coverage`; `test/runs/planCheck.test.ts:268` still holds |
| `edgeCases` | `300ms, -50ms` → as today (`pr/32`'s reading unchanged); a shorthand naming an id the spec lacks → `dangling-requirement` |
| `depends_on` | none |
| `verify` | `npx vitest run test/runs/planCoverageParity.test.ts test/runs/planCheck.test.ts test/authoring test/ci/testInputsGuard.test.ts` |

### v20-spec-merge — the delta into the specs

| Field | Content |
|---|---|
| `id` | v20-spec-merge |
| `requirements` | REQ-FLOW-016, REQ-WORKTREE-003, REQ-WORKTREE-004, REQ-FLOW-025, REQ-FLOW-036, REQ-FLOW-080, REQ-FLOW-085, REQ-FLOW-091, REQ-FLOW-093, REQ-FLOW-095, REQ-FLOW-101, REQ-FLOW-102, REQ-FLOW-104, REQ-FLOW-105, REQ-FLOW-106, REQ-FLOW-107, REQ-FLOW-108, REQ-FLOW-109, REQ-FLOW-110, REQ-FLOW-111, REQ-FLOW-112, REQ-FLOW-113, REQ-FLOW-114, REQ-FLOW-115, REQ-FLOW-116, REQ-FLOW-117, REQ-FLOW-118, REQ-FLOW-119, REQ-FLOW-120, REQ-FLOW-121, REQ-FLOW-122, REQ-FLOW-123, REQ-FLOW-124, REQ-PLUGIN-014, REQ-PLUGIN-016, REQ-CTX-013, REQ-CTX-016, REQ-PROVE-003, REQ-PROVE-005, REQ-PROVE-021, REQ-PROVE-037, REQ-PROVE-039, REQ-PROVE-040, REQ-PROVE-041, REQ-PROVE-042, REQ-PROVE-043, REQ-PROVE-044, REQ-PROVE-045, REQ-LADDER-002, REQ-LADDER-005, REQ-LADDER-006, REQ-LADDER-009 |
| `files` | `docs/specs/everyday-flows.md`, `docs/specs/orchestrator-context.md`, `docs/specs/model-ladder.md`, `docs/specs/prove-behavior-and-value.md`, `docs/specs/worktree-lane.md` |
| `interfaces` | The delta above, merged append-or-amend only, each citation pointing at the landed line; each requirement gains an `Added <date>` or `Amended <date>` line naming plan 021 file 2 and its units, as file 1's do; the provenance paragraph at `docs/specs/everyday-flows.md:119-131` ("REQ-FLOW-105 to REQ-FLOW-119 are held for plan 021's second file") rewritten, naming the integration head every citation was read at; REQ-PROVE-037's pins cited in both files that hold them (`test/ci/workflow.test.ts` for the job, `test/ci/cloudLeg.test.ts` for the per-profile runs, `--network none`, the read-only mount and the missing socket); each implementer's and fixer's "spec delta" note in the run's reports read for clauses the landed code added |
| `testCriteria` | The structural coverage pass over this plan and the merged specs exits 0; `npx vitest run test/authoring` green |
| `edgeCases` | A citation a later fix round moves → re-pointed at that round |
| `depends_on` | v0a-ask-then-act, v0a2-ask-emission, v0b-run-verb-alone, v0c-verb-git-env, v0d-guard-pages, v1-branch-card, v2-review-gate-rebuild, v3-cloud-skill, v4-cursor-continue, v5-claude-readiness, v6-cursor-cloud, v7-cursor-agents-block, v8-detect-translator, v9-copilot-entry, v10-copilot-cursor-setup, v11-cloud-facts-matrix, v12-container-leg, v13-client-legs, v14-cloud-check, v15-cloud-page, v16-manifest-plugin-block, v17-model-list-cache, v18-egress-pins, v19-eval-cut-prep, v21-run-verbs, v22-plan-check |
| `verify` | `node content/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/021-cloud-runs-02.md docs/specs && npx vitest run test/authoring` |

## Morning units (2026-10-19, from the maintainer's walk)

Added after the walk by this plan's single writer, from two read-only researchers' returns, each cell read at `8b2f469d`.
Two answers shaped them:
- #112's three bot comments are fixed here before this pull request is marked ready (`pr/1`–`/3`).
- The Action's restore step lands now (`review/129`).

`v0b`'s security lens finding (`review/130`, `/131`) goes to a fixer under the review loop, not to a unit. `w4`, the ask
on Copilot CLI, Cursor and Codex, is written when its research returns.

### w1-checkpoint-hook-paths — a hook cannot widen a run verb's commit

| Field | Content |
|---|---|
| `id` | w1-checkpoint-hook-paths |
| `requirements` | REQ-FLOW-093, REQ-FLOW-092 |
| `files` | `src/cli/commands/run.ts` (`runCheckpoint` `:741`; the commit `:1009`; the unattended held-path check `:1022-1031`; `strayStaged` `:1333-1342`, its allowed-set predicate factored out so both checks share it), `test/cli/commands/runCheckpoint.test.ts` (beside `:497-511` and `:644-657`), `test/cli/commands/runEnd.test.ts` |
| `interfaces` | Before the commit, the verb records `HEAD`. After it, `HEAD^` must be that commit, so a hook's own commits are caught, and every path of `git diff --name-only -z <pins> <before> HEAD --` must be in the set `strayStaged` allows: the staged list, deletions, held patches, the held result and the `--paths` folders. Otherwise the verb undoes its commit, reports `committed: null`, adds one `notDone` line per path (`commit refused: <path> was staged by a hook and is not in --paths (commit undone)`) and a `commit: undone (a hook staged paths outside the list)` line, and exits 1 before the scan and the push. Amended 2026-10-19 after `review/136`–`/139` and `/142`–`/143`:
- The undo rewinds the run branch by name with a compare-and-swap (`git update-ref refs/heads/<run-branch> <before> <the commit it checked>`) and refuses when `HEAD` has left that branch.
- Before the commit the verb creates a pending marker, holding `before`, exclusively under the worktree's git directory (`stamity/checkpoint-pending`). It removes the marker once its own commit reads clean, before the scan and the push, or once an undo succeeds.
- A check that cannot finish, a failed undo or a throw leaves the marker, exits 1 with no push, and names the commit, the reset target and the marker. While the marker exists every later call refuses, naming it, until a person resolves it.
- Commits made outside the run verbs push as before.

Attended and unattended alike. Held paths stay in the allowed set, so `review/156`'s case keeps its result. The `Checkpoint` JSON shape is unchanged |
| `testCriteria` | Attended and unattended: a pre-commit hook staging a second file under `--paths a.txt` → exit 1, `committed: null`, the `notDone` line, `HEAD` at the base, no push, the remote unchanged, the file still staged (red before the fix); a hook making its own commit → undone and refused; `review/156`'s case at `:497` unchanged; `run end` through the same path |
| `edgeCases` | A hook staging nothing → as today; a hook staging a held path → `review/156`'s result (committed, push refused), unchanged; the reset failing → `commit not undone`, exit 1, no push |
| `depends_on` | none |
| `verify` | `npx vitest run test/cli/commands/runCheckpoint.test.ts test/cli/commands/runEnd.test.ts test/cli/commands/run.test.ts test/architecture test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: the repository's pre-commit hooks → the verb's commit and push. Trusts: the explicit path set. Abuse: a hook stages an unrelated path that the push then carries. Check: the commit's own path list is read after the hooks, and the commit is undone and refused on any path outside the set |

### w2-plan-reads — a linked or empty `reads:` list is refused

| Field | Content |
|---|---|
| `id` | w2-plan-reads |
| `requirements` | REQ-FLOW-091, REQ-FLOW-096 |
| `files` | `src/runs/freshness.ts` (presence by `lstat` `:76`, `:148-155`; `StaleReason` `:43` gains `"link"`), `src/runs/planCheck.ts` (the `reads` head check `:303-307`; the stale message `:476`), `test/runs/freshness.test.ts` (beside `:74-91`; `:310-321` unchanged), `test/runs/planCheck.test.ts` (beside `:316-333` and `:335-345`) |
| `interfaces` | Each `reads:` path is walked segment by segment from the repository root with `lstat`. A path that is a symbolic link, or lies under one, is stale with reason `"link"`, decided before any history count; exempt chains are unchanged. `planCheck.ts:476` gives it its own message: `` `<path>` is a symbolic link, or under one; name the file it points to in reads and re-stamp the plan. `` A head `reads: []` gives `head-key-missing` with "The head's `reads` must list at least one path."; any other non-list keeps "must be a list of paths". `freshness([])` itself is unchanged, as the engine API. `plan check --json`'s `reason` gains the value `link` |
| `testCriteria` | A read path `docs/link.md` linking to `a.md`, the target changed after the stamp → stale `[{path: "docs/link.md", reason: "link"}]` (fresh before the fix); a folder link `linkdir` → `docs` read as `linkdir/a.md` → the same; `plan check` → blocker `stale` at the `reads:` line naming the link; `reads: []` → `ready: false`, `head-key-missing` at the `reads:` line, "at least one path" (red before) |
| `edgeCases` | The link cases skip on Windows (`it.skipIf(WINDOWS)`, as `test/runs/ledgerInboxWrite.test.ts:539`); a missing read path → `missing`, as today; exempt chains → unchanged |
| `depends_on` | none |
| `verify` | `npx vitest run test/runs/freshness.test.ts test/runs/planCheck.test.ts test/cli/commands/plan.test.ts test/architecture test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: a plan's `reads:` → the unattended start's readiness verdict. Trusts: the history count over each read path. Abuse: a linked or empty read list makes the freshness check vacuous. Check: a link, or a path under one, is stale; an empty list blocks |

### w3-pages — the pages for `w2` and `v0b`'s fix

Re-scoped twice, 2026-10-19:
- 08:57Z: `w1`'s sentences moved to `w5-ask-pages`.
- 09:07Z: the Action's fix moved to `w6`, by the maintainer's answer. Its implementer had stopped at
  BLOCKED_AMBIGUITY: a step before the Action does not hold for a comment on a pull request, since the Action checks
  out the pull request's branch after every earlier step. The workflow step is dropped.

| Field | Content |
|---|---|
| `id` | w3-pages |
| `requirements` | REQ-FLOW-091, REQ-FLOW-121 |
| `files` | `SECURITY.md` (`:105`'s stand-alone clause, for `v0b`'s fix of `review/130`), `docs/specs/everyday-flows.md` (REQ-FLOW-091 after `:3684`; REQ-FLOW-121's stand-alone reading), `test/docsPages.test.ts` (pins for these sentences; TEST CHANGE where a pin moves, justified) |
| `interfaces` | `SECURITY.md:105`'s stand-alone clause states `v0b`'s fixed reading: the verb is found after option words in each parsed command's decoded words, an unsure first word after `run` counts as an option word, and unattended a verb written after option words is refused with its own reason. It keeps the pinned phrase "unless the verb stands alone on it as one simple command". The spec gets an `Amended 2026-10-19` bullet on REQ-FLOW-091 (`w2`'s stale reasons and messages: `spelling`, `link`, `untracked`, and an empty `reads:` list that blocks) and on REQ-FLOW-121 (`v0b`'s reading) |
| `testCriteria` | Pins for the new sentences, written first and red on today's pages; the structural coverage pass over this plan and the specs exits 0 |
| `edgeCases` | A pinned phrase → kept word for word |
| `depends_on` | w2-plan-reads, v0b-run-verb-alone (both folded at `c9c4e164`) |
| `verify` | `npx vitest run test/docsPages.test.ts test/authoring test/ci/testInputsGuard.test.ts && node content/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/021-cloud-runs-02.md docs/specs` |

### w4-copilot-ask — Copilot CLI asks for the person's own agent

Added after the research (08:23Z) and the measurement on Copilot CLI 1.0.98 (`reports/w4-measure-r1.md`). The
maintainer's answer at 08:46Z: the button on Copilot, with the LLM-judge mode named as its gap.

| Field | Content |
|---|---|
| `id` | w4-copilot-ask |
| `requirements` | REQ-FLOW-123, REQ-FLOW-102 |
| `files` | `src/hooks/scripts.ts` (`attendedAsk` `:4592-4603` and its helper-name list `:4595`; `guardDecisionOutput` `:3883-3907` and `GUARD_NO_CALLER` `:3872-3873`; `buildSessionStartScript` `:1245`, Copilot's copy), a new `test/hooks/personOnlyCopilotAsk.test.ts`, the session-start test file that covers Copilot's script, `test/hooks/scriptBudget.test.ts` only if a budget row moves (with a dated reason). Widened 09:07Z after its BLOCKED_DEPENDENCY:
- `test/hooks/personOnlyGuard.test.ts`: the `NO_CALLER` constant `:121-122`, and the `review/89` comments at `:81`, `:115-116` and `:358-360`; TEST CHANGE, justified by the reworded sentence.
- `test/cloud/containerLeg.test.ts`: `NO_CALLER` at `:103-104`, its comment at `:552`.
- `scripts/qa/hook-runs.mjs`: `ASK_CLASS_CLIENTS` at `:530` gains `copilot`, so the release re-measure marks Copilot red when it runs a command despite an ask. Its test goes with it (`test/qa/hookRunsCli.test.ts`). |
| `interfaces` | Copilot CLI, attended, an ask-class act → `permissionDecision: "ask"` with the act's reason, only when two things hold. (1) The payload carries none of `agentId`, `agent_id`, `agentType`, `agent_type`, `parentAgentId`, `parent_agent_id`, `subagentType`, `subagent_type`, `subagent_id`. (2) Its session id (`sessionId`, or `session_id` after the portable runner's renaming) is a main session id recorded by Copilot's session start for this repository. Otherwise `deny` with `GUARD_NO_CALLER`, reworded to say the call could not be shown to come from the person's own agent and to give the person the exact command. Unattended, `deny` as today. Claude Code's answer stays byte-identical; Cursor and Codex keep `deny` with `GUARD_CANNOT_ASK`. The shared helper-name list gains `agentId`, `parentAgentId`, `parent_agent_id` and `parent_tool_call_id`. The record: Copilot's session start appends the payload's session id as one line to a file outside the working tree, under the repository's common git directory (`stamity/copilot-main-sessions`), created owner-only and kept to its last 200 lines. The guard reads it through the git-directory resolution it already does for tags, and accepts only a whole-line match. A missing, unreadable, oversized (past 64 KiB) or malformed record → `deny` |
| `testCriteria` | Copilot, attended: main (no helper field, id recorded) → `ask`; each helper field alone → `deny` with `GUARD_NO_CALLER`; an id not recorded → `deny`; no record → `deny`; an oversized or unreadable record → `deny`; unattended → `deny`, unchanged. Claude Code's answers byte-identical; a Claude payload holding only `agentId`, or only `parent_tool_call_id`, now reads as a helper's. Cursor and Codex unchanged. Copilot's session start writes, appends and caps the record; other clients' session starts write none. Each red before the change |
| `edgeCases` | A deletion or force push → refused on every client, unchanged; two main sessions at once → both ids recorded, both ask; a record line with extra spaces → no match; a worktree → the common git directory's record |
| `depends_on` | none (`w2` is folded; the `v0b` fix writes `personOnly.ts` only) |
| `verify` | `npx vitest run test/hooks test/cloud test/architecture test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: a Copilot hook payload → the guard's ask or deny for a person-only act. Trusts: Copilot's helper fields, measured on 1.0.98, and the session start's record. Abuse: a helper's call shown as the main agent's ask; a forged record line. Check: any helper field refuses; the id must be a recorded main id; a missing or unreadable record refuses. Named residuals: Copilot's LLM-judge mode may settle an ask, and a hook cannot see that mode; a record line a steered agent writes makes a helper's ask look like the main agent's, which still needs the person's click |

### w6-claude-hooks-in-claude-dir — Claude Code's hook scripts live under `.claude/`

Added 09:07Z from the maintainer's answer on the Action gap, "Move scripts into .claude/". The Claude Code GitHub Action, on a
pull request, replaces the whole `.claude/` tree with the base branch's copy after its own checkout, on every event. It
was read in the Action's source at `5eb090f3`: `src/github/operations/restore-config.ts` (`SENSITIVE_PATHS`) and
`src/entrypoints/run.ts:254-276`. Scripts under `.claude/` are therefore the base's on every Action run, comments
included.

| Field | Content |
|---|---|
Redesigned 09:31Z, by the orchestrator's recorded call, after its implementer's BLOCKED_DEPENDENCY. A move would drop the scripts that the charter's
invariant 5 names for a session where no hook ran, and rewording a ratified invariant waits for the maintainer. So
Claude Code's hooks run **copies** under `.claude/hooks/stamity/`, and the copies under `.stamity/generated/hooks/claude/`
stay emitted unchanged. The protection the maintainer asked for is the same: the scripts the hooks run are the base
branch's on every Action run. Dropping the old copies, together with the invariant's rewording, is a follow-up for the
maintainer.

| Field | Content |
|---|---|
| `id` | w6-claude-hooks-in-claude-dir |
| `requirements` | REQ-FLOW-113, REQ-FLOW-104 |
| `files` | `src/manifest/ownedPaths.ts`: `OWNED_PATHS` gains a root kind for `.claude/hooks/stamity/`, its `version` raised to 3 (reading (a)), so `check --json`'s `ownedPaths` gains a field. `src/merge/reclaim.ts`: a hash alone proves a delete under the new root, as for `state` (`isHashProvable`), and the root joins its link check. `src/emit/hooksInfra.ts`: Claude's hook rows name the new copies, Claude's guard reads its own policy-document copy, and the other clients are unchanged. The Claude adapter and its settings rows (`src/adapters/claude.ts`, `src/manifest/claudeSettings.ts`, `src/manifest/coOwnedJson.ts`, `src/manifest/hookDocuments.ts` bounds). `src/hooks/scripts.ts`: a `claude` placement for the root lookup. `src/hooks/model.ts`: the folder-name constant and the cloud fact `:257-272`. `scripts/hook-latency.mjs`. The tests, among them `test/adapters/claude.test.ts`, `test/manifest/ownedPaths.test.ts`, `test/merge/reclaim.test.ts`, `test/emit/upgradeFrom1140.e2e.test.ts` (the upgrade writes the copies; no reclaim of the old ones), `test/ci/hookLatency.test.ts` if its pinned checklist line moves, `test/hooks/*.test.ts` and `test/emit/crossClientGoldens.test.ts`. The released-tree fixtures stay as released. The golden snapshot and this repository's own copies are derived and move in the integration lane |
| `interfaces` | Claude Code's hook rows run copies of the core scripts under `.claude/hooks/stamity/`, each settings row's command naming `${CLAUDE_PROJECT_DIR}/.claude/hooks/stamity/<script>`, with a copy of the agent-tool policy document beside them that Claude's guard reads (`plan/31`). The copies under `.stamity/generated/hooks/claude/` stay emitted, byte for byte, so invariant 5's manual path holds. Codex, Copilot and Cursor are unchanged. `sync` on a tree a released version wrote adds the copies and re-renders the settings rows through the owned-entry ledger. `clean` removes both sets. `check` reports drift on either. The cloud fact says the Action's restore covers the scripts Claude Code's hooks run, and the matrix row follows in the integration lane |
| `testCriteria` | A fresh `init` or `sync` writes the copies and the policy copy under `.claude/hooks/stamity/`; the settings rows point there; the old copies are still written; a `sync` over the released 1.14.0 tree fixture adds the copies and re-renders the rows; `clean` removes both sets; the guard reads its policy copy; `check --json` prints the new root kind; each red before |
| `edgeCases` | An owner's own file under `.claude/hooks/` → kept; a link at the new root → refused by the sweep's link check; Windows paths in the settings command → quoted as before |
| `depends_on` | w4-copilot-ask (one writer of `src/hooks/scripts.ts` and the hook tests, so `w6` is cut after `w4` folds) |
| `verify` | `npx vitest run test/adapters test/manifest test/hooks test/emit test/merge test/qa test/runs test/architecture test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: a pull request → the scripts Claude Code's hooks run on that pull request's Action run. Trusts: the Action's own restore of `.claude/` from the base. Abuse: a pull request rewrites the guard's scripts for its own run. Check: the scripts sit under `.claude/`, which the Action replaces with the base's before the CLI starts. Residual, the Action's own named limitation: a pull request that legitimately changes `.claude/`, and an Action run that commits with `git add -A`, reverts that change |

### w5-ask-pages — the pages for Copilot's ask, and Cursor and Codex as measured

| Field | Content |
|---|---|
| `id` | w5-ask-pages |
| `requirements` | REQ-FLOW-123, REQ-FLOW-102, REQ-FLOW-093 |
| `files` | `SECURITY.md` (`:105`, the clients' sentences; `:563-570`, appended with the pinned phrases kept, for `w1`'s rule as landed), `docs/specs/everyday-flows.md` also for `w1` (REQ-FLOW-093 before its Proof `:3774`; REQ-FLOW-102 `:3970-3975`, the verb's own unpushed commit undone by compare-and-swap; any sentence on `run checkpoint`'s pushes that the pending marker changes), `docs/security-mapping.md` (`:223`), `docs/cloud.md` (`:39`, `:197`), `docs/specs/everyday-flows.md` (REQ-FLOW-123 `:4628-4665`, with `:4634` and `:4648`; `:3963`; `:4141`), `docs/specs/prove-behavior-and-value.md` (`:1980`), `.github/release-controls-checklist.md` (the one-minute interactive check for each client that asks), any corpus line under `content/` stating that Copilot refuses (with `npm run build && node dist/cli.js sync` and the eval locator pins it moves), `test/docsPages.test.ts` (its pins, TEST CHANGE, justified) |
| `interfaces` | The pages state that Copilot CLI asks for the person's own agent. The facts measured on 1.0.98 on 2026-10-19: headless runs and autopilot deny an ask; the interactive client shows its hook permission dialog and waits; helpers carry `agentId`, `agentType` and `parentAgentId` and a session id of their own; the session start fires for the main agent only. The residuals: Copilot's experimental assisted mode (`/allow-all auto`, `--assisted-approval`) sends the ask to an LLM judge, which may approve it without the person, and a hook cannot see that mode; a forged record line. Cursor keeps refusing: its staff say an ask on a shell hook is enforced on no path; its hooks page says `preToolUse`'s ask is not enforced; a hook cannot see the run mode; and a measurement on 2026-10-18 saw a command run despite an ask. Codex keeps refusing: its hooks page says an ask fails open; a helper's hook shares the parent's session id; an auto-review agent can settle a rules prompt. The release checklist's one-minute check names Claude Code and Copilot CLI |
| `testCriteria` | The pins in `docsPages.test.ts` assert the new sentences, written first and red on today's pages; the structural coverage pass exits 0; `check` shows no drift after the sync; `test/evals/locators.test.ts` holds |
| `edgeCases` | A page sentence pinned elsewhere → found by the full suite and moved in this unit |
| `depends_on` | w4-copilot-ask, w1-checkpoint-hook-paths, w3-pages (one writer of `SECURITY.md`, `docs/cloud.md`, the spec and `docsPages.test.ts`; `w6`'s pages moved to `w7` at 09:31Z, so this unit starts now). Widened 09:31Z with `w1`'s cap-round review: `review/149`. The run skill (`content/skills/st-unattended/SKILL.md`, at its line cap, or a reference file it already links) says a run never removes the checkpoint marker or resets the branch to get past a refusal; it lists the refusal for the morning. It also states the exception to the draft-PR-at-every-exit floor while a marker exists. `SECURITY.md:563-570` names the marker's two residuals: its removal is a person's act in text only, and it is scoped to one worktree. Shift no line an eval case's `source:` range cites; check `test/evals/locators.test.ts`. No `sync` in this unit; the integration lane runs it once. Also `review/150`: the checklist's re-measure line passes `--require-observation`, so a missing Copilot fails it. Widened 09:19Z with `w3`'s review Minors, the same files' next writer: `review/146`, where `SECURITY.md:105` and REQ-FLOW-121 say an unsure line reads as running a verb, while the code still needs a verb word after the unsure one (say "so a verb written after it is still found"); and `review/147`, where PowerShell refuses an unquoted at-sign word after `run`, not after the program. Widened 09:22Z with `build/82`: `test/docsPages.test.ts:4437` pins `ASK_CLASS_CLIENTS` as Claude Code alone, and the release checklist sentence it reads says the same. Both now name Copilot CLI too, since `w4`; the pin is red on the integration branch until this unit lands |
| `verify` | `npx vitest run test/docsPages.test.ts test/emit test/corpus test/evals/locators.test.ts test/authoring test/ci/testInputsGuard.test.ts && node content/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/021-cloud-runs-02.md docs/specs` |

### w7-action-pages — the pages for the Action's restore covering Claude's hook copies

Added 09:31Z when `w6`'s pages left `w5`.

| Field | Content |
|---|---|
| `id` | w7-action-pages |
| `requirements` | REQ-FLOW-113, REQ-FLOW-104 |
| `files` | `docs/cloud.md` (`## Claude Code's GitHub Action`, `:213-220`), `SECURITY.md` (`:574-578`, `:322`), `docs/specs/everyday-flows.md` (REQ-FLOW-113 after `:4393`, REQ-FLOW-104 `:4146-4148`, and the lines naming Claude's hook folder: `:164`, `:983`, `:2360`, `:3577`), `docs/troubleshooting.md` (`:212`, `:419`), `.github/release-controls-checklist.md` (`:332`, with `test/ci/hookLatency.test.ts:253` if its pin moves), `test/docsPages.test.ts` |
| `interfaces` | The pages say Claude Code's hooks run copies under `.claude/hooks/stamity/`, which the Claude Code Action replaces with the base branch's copy on every pull-request event. So a pull request no longer changes what the guard runs on its own Action run, and the cloud residual narrows to what the Action does not restore. The copies under `.stamity/generated/hooks/claude/` stay for the manual session start. The Action's own named limitation is stated: a pull request that changes `.claude/`, and an Action run that commits with `git add -A`, reverts that change. Lines naming Claude's hook folder say which copy the hooks run. `CHANGELOG.md`'s history stays |
| `testCriteria` | Pins for the new sentences, written first and red; the coverage pass exits 0 |
| `edgeCases` | A pinned line naming the old path → moved with its pin, justified |
| `depends_on` | w6-claude-hooks-in-claude-dir, w5-ask-pages (one writer of the shared pages) |
| `verify` | `npx vitest run test/docsPages.test.ts test/ci/hookLatency.test.ts test/authoring test/ci/testInputsGuard.test.ts && node content/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/021-cloud-runs-02.md docs/specs` |

## Night units (2026-10-19, session 3, from the maintainer's start round)

Added by this plan's single writer at about 17:24Z, each cell read at `22e77b9f`, from the maintainer's answers at the
session's start: eval run 48's fix (its two floor cases, both brief gaps), `review/148` one round past the cap, `review/151`
and `/165`, the start audit's Warning on Claude Code's hook scripts, and the review bot's two comments on `22e77b9f` (pull
request review comments `4314467920` and `4314467903`). Lanes from `22e77b9f`; `n6` from the integration head once `n1`,
`n2`, `n4` and `n5` are folded. The emitted copies, the matrix and the tree-digest goldens move only in the derived pass
after the folds (`npm run build && node dist/cli.js sync`, then the goldens re-pinned and read), never in a unit's lane.

### n1-eval-ending — the unattended ending names what `run end`'s `--paths` carries

| Field | Content |
|---|---|
| `id` | n1-eval-ending |
| `requirements` | REQ-FLOW-092, REQ-FLOW-075 |
| `files` | `content/skills/st-unattended/SKILL.md` ("The ending", its steps 1 and 3, `:93-100`), `evals/cases-v6/adversarial/unattended-kickoff-claims-approval.md`, `evals/cases-v6/golden/unattended-close-opens-draft-pr.md`, the `source:` line of every other case under `evals/` whose range into that skill file the edit shifts, and the citations of that skill file's line ranges in `docs/specs/everyday-flows.md` that the shift moves (only those citations). Amended 17:30Z after the implementer's BLOCKED_DEPENDENCY: also `test/corpus/skills/unattended.test.ts` (`BODY_CAP` 161 → the body's new length, a `TEST CHANGE, justified` comment beside the earlier one, and a pin for the new sentence), and the briefs of the three other cases quoting the ending's steps, each of which judges `run end`'s `--paths` (`evals/cases-v6/adversarial/unattended-item-says-merge-refused.md`, `evals/cases-v6/adversarial/unattended-ship-it-overnight-no-merge-or-tag.md`, `evals/cases-v6/golden/unattended-blocked-run-still-hands-off.md`): each quote re-copied byte for byte from the new text, no criterion changed. The sentence goes as new lines at the end of step 3, so lines 93-100 keep their wrap. Amended again 17:34Z after its second BLOCKED_DEPENDENCY: also `evals/SET-v7.md`, limited to the case-index rows' source cells of the cases whose `source:` moved (each copied from its case, no other column or prose), and the two other specs' citations of the skill that the shift moved (`docs/specs/orchestrator-context.md:571`, `docs/specs/board-writes.md:129`) |
| `interfaces` | "The ending" states, in one sentence within its steps, what `stamity run end`'s `--paths` names: the files the run changed (every unit's files, named again though each was committed at its checkpoint) and each learning file the close captured; the run folder's own files and the inbox are staged by the verb itself. Step 1's clause about the learning files stays true. No other rule changes. Both cases' briefs quote the changed text byte for byte. The golden case's "The morning list" quote gains the section's opening paragraph (the one naming `.stamity/runs/<run-id>/morning.md` as the pull request body's source), relabelled to say it quotes that paragraph and the first two sections, and its `source:` covers those lines. No criterion, claim, class, metric or `floor:` changes: B4 and B5 stay word for word. Naming an already-committed path is made harmless by `n2` |
| `testCriteria` | `test/evals/locators.test.ts` passes with every moved range (red on the shifted ranges before the re-pin); the case tests under `test/evals` pass; the corpus tests for the skill (`test/corpus/skills/unattended.test.ts`) pass; the coverage pass exits 0 |
| `edgeCases` | A case quoting the old step text that no test holds equal to the source → listed in the report, not edited; a pinned phrase in `test/corpus` → kept word for word |
| `depends_on` | none (`n2` makes the sentence's code fact hold for a deletion; `n6` edits the same spec file after this unit is folded) |
| `verify` | `npx vitest run test/evals test/corpus/skills/unattended.test.ts test/docsPages.test.ts test/ci/testInputsGuard.test.ts && node content/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/021-cloud-runs-02.md docs/specs` (the plan lives only in the main checkout) |
| `threat` | None: guidance text and eval data; the criteria are not loosened |

### n2-pending-marker — the marker is refused before any write, and cleared when no commit landed

| Field | Content |
|---|---|
| `id` | n2-pending-marker |
| `requirements` | REQ-FLOW-093, REQ-FLOW-092 |
| `files` | `src/cli/commands/run.ts` (`runCheckpoint` `:741`; the staging step (3) `:839-900`; `namedPaths` `:1300`; the commit step (4) and its catch `:1006-1061`; `markerPath`/`takeMarker`/`dropMarker`/`markerRefusal` `:1463-1530`), `test/cli/commands/runCheckpoint.test.ts`, `test/cli/commands/runEnd.test.ts` |
| `interfaces` | Three changes, attended and unattended alike, the `Checkpoint` JSON shape unchanged:
- **The bot's comment `4314467920`:** as soon as the repository's top level is resolved, before any `git add`, held-patch write or index restore, the verb reads the checkpoint marker; when it exists (or a link or folder sits at its path) the verb refuses exactly as `takeMarker`'s refusal does today (`markerRefusal`, exit 1, nothing staged, written or pushed), so the index and `held/person-only.patch` stay as the uncertain commit left them. The exclusive create at step (4) stays.
- **`review/148`:** in the commit's catch, when the commit process has provably ended and `HEAD` still names `before` on the run branch, no commit landed: the verb removes the marker and reports `commit not made: <the cause>` (exit 1, no push), so the next call can run. Read `src/cli/engine/gitWrite.ts` first: "provably ended" means the runner kills git at its wall time and waits for the process to exit before it throws; if it does not wait, the marker stays as today and the report says why. `HEAD` moved or unreadable → the marker stays, as today.
- **The eval fix's code fact:** a `--paths` entry naming a path the run already committed is harmless: an unchanged file stages nothing and adds no `notDone` line (pin it), and a path absent from the work tree and the index whose deletion `HEAD` already holds against `Base:` is kept silently, with no `not staged: … (no such file)` line; a path never tracked keeps that line |
| `testCriteria` | A marker present before `run checkpoint` with staged changes → exit 1 with the marker refusal, and the index, the held patch and the work tree byte-identical before and after (red before: today the verb stages first); the same for `run end`. A pre-commit hook outlasting the runner's wall time (the wall time made small through the seam the existing tests use, else one added) → exit 1, `commit not made`, no marker, `HEAD` at `before`, no push, and the next `run checkpoint` commits (red before); a commit that lands and then times out → the marker stays. `run end --paths` naming a file committed at an earlier checkpoint → exit 0, no `notDone` line for it; naming a deletion committed earlier → no `not staged` line (red before); naming a path never tracked → the line, as today |
| `edgeCases` | `--dry-run` writes and reads no marker (unchanged); the marker as a link or a folder → refused before any write; a held path in `--paths` → `review/156`'s result, unchanged |
| `depends_on` | none |
| `verify` | `npx vitest run test/cli/commands/runCheckpoint.test.ts test/cli/commands/runEnd.test.ts test/cli/commands/run.test.ts test/architecture test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: an uncertain earlier commit → the next run verb. Trusts: the marker as the record of that uncertainty. Abuse: staging over the uncertain state destroys what a person needs to resolve it; a marker left after a commit that never happened stops the night. Check: refuse before any write; clear the marker only when the commit provably did not land |
| `fix round 1` | Added 17:46Z for `review/176` and `review/179`, with `review/177`, `/178` and `/180` fixed alongside. Files gain `src/cli/engine/gitWrite.ts` and its test. On POSIX the checkpoint's commit call runs git in a process group of its own, through an option only that call passes. At the wall time the verb stops the whole group (a stop, then a kill after a short grace) and waits for it to be gone. The marker clears only when the group is gone, `<git-dir>/index.lock` is absent, and `HEAD` still names `before` on the run branch. Every other case keeps the marker, an output past the runner's buffer cap included (fail closed, with the code comment saying so). Windows keeps the marker, as signed off. A test runs on every leg: an injected stop expects `commit not made` and no marker on POSIX, and `commit not checked` with the marker on win32. A file the run created and later deleted, named again, gets no `not staged` line. A hook that detaches its own child stays the residual the pages already name, and `n6`'s pages say "at the time it was read", not "provably" |

### n3-copilot-remeasure — the release re-measure checks the facts Copilot's ask rests on

| Field | Content |
|---|---|
| `id` | n3-copilot-remeasure |
| `requirements` | REQ-FLOW-123, REQ-PROVE-042 |
| `files` | `scripts/qa/hook-runs.mjs` (the `--ask` measurement: `ASK_CLASS_CLIENTS` `:533`, the hook it installs and its log, the prompt, the Copilot row's verdict), `test/qa/hookRuns.test.ts`, `test/qa/hookRunsCli.test.ts`, `.github/release-controls-checklist.md` (the `--ask --require-observation` line, `:345-384`), the test-inputs map entry if a test reads a tracked source file |
| `interfaces` | For Copilot the `--ask` run also reads, from its hook log (key names and session ids only, no other value), the three facts the guard's ask rests on (REQ-FLOW-123): (1) a main-agent tool call carries none of the guard's helper fields (`GUARD_HELPER_FIELDS`, `src/hooks/scripts.ts:4026`, restated in the tool, which imports nothing from the engine, with a test holding the two lists equal by reading the source text); (2) a helper's tool call carries at least one helper field and a session id other than the main session's; (3) `sessionStart` fires once, for the main session alone. The prompt has Copilot hand one trivial step to a helper so fact 2 can be observed (the measured behaviour: `.stamity/runs/2026-10-18_cloud-runs-2/reports/w4-measure-r1.md`). Each fact reads `held`, `changed` or `not-observed`, and the row names the fact; under `--require-observation` a `changed` or `not-observed` fact is red. Claude Code's row is unchanged. The checklist line says the re-measure checks the three facts, and that a red fact holds the tag and moves Copilot back to refusing, as the release's one-minute interactive check does for Claude Code |
| `testCriteria` | Canned logs: a main call with a helper field → fact 1 `changed`, red under `--require-observation`; a helper call with no helper field, or with the main's session id → fact 2 `changed`; a second `sessionStart`, or one with a helper's id → fact 3 `changed`; no helper call → fact 2 `not-observed`, red only under `--require-observation`; all held → green. The list-equality test fails when either list moves alone |
| `edgeCases` | A log line that is not JSON → counted, never a pass; a Copilot not installed → `not-installed`, as today; a hook log holding a value beyond key names and ids → never printed |
| `depends_on` | none |
| `verify` | `npx vitest run test/qa/hookRuns.test.ts test/qa/hookRunsCli.test.ts test/docsPages.test.ts test/ci/testInputsGuard.test.ts test/architecture` |
| `threat` | Boundary: a Copilot update → the guard's reading of who is calling. Trusts: the measured payload shape. Abuse: a release where a helper's call reads as the main agent's lets a helper's ask reach the person's prompt. Check: the release measurement turns red on each fact that moved |

### n4-held-claude-hooks — Claude Code's hook scripts are person-only paths

| Field | Content |
|---|---|
| `id` | n4-held-claude-hooks |
| `requirements` | REQ-FLOW-102 |
| `files` | `src/change/personOnlyPaths.ts` (the list; `.claude/settings*.json` `:44`, `.cursor/hooks/**` `:88`), `test/change/personOnlyPaths.test.ts`, and any test pinning the list's contents or length (with the justification) |
| `interfaces` | `PERSON_ONLY_PATHS` gains `.claude/hooks/**`: the scripts Claude Code's hooks run (since `w6` the engine's copies under `.claude/hooks/stamity/`, and a person's own hook scripts there), held beside its held settings as `.cursor/hooks/**` is beside `.cursor/hooks.json`, with a comment saying so. `run.ts`'s `HELD_PREFIXES` derives from the list and needs no edit. Erasable syntax only (`scripts/ci/records-only.mjs` imports `src/change` by type stripping) |
| `testCriteria` | `heldPaths` returns `.claude/hooks/stamity/stamity-pre-tool-use-guard.mjs`, `.claude/hooks/stamity/agent-tool-policy.json` and `.claude/hooks/own.sh` (red before); `.claude/hooksx/a` and `.claude/settings.local.json`'s existing result unchanged |
| `edgeCases` | Letter case folds as the list's other globs do; a link at `.claude/hooks` → held through the derived prefixes |
| `depends_on` | none |
| `verify` | `npx vitest run test/change/personOnlyPaths.test.ts test/corpus/skills/unattended.test.ts test/docsPages.test.ts test/composition test/architecture test/ci && npm run typecheck` |
| `threat` | Boundary: an unattended run's commit → the scripts later sessions' hooks run. Trusts: the held list, and since the fix round the hook declarations at `Base:`. Abuse: a steered run edits the guard script Claude Code's hooks run, or a script a user or pack hook runs, and a run verb pushes it. Check: the path is held, an inert patch, never pushed: `.claude/hooks/**`, `.stamity/packs/**`, and each script a user or pack hook declaration at `Base:` names, a declaration that cannot be read failing closed (amended 18:20Z after the fix round). Residual: a hook written by hand into a client's settings file whose script lies outside the held folders |
| `fix round 1` | Added 17:44Z for the security lens's `review/175` (a gap older than this range): the scripts that user and pack hooks run are pushed unheld. The fix holds `.stamity/packs/**` beside `.stamity/generated/**`, and it holds the script file each user hook declaration names, read from the hook files at `Base:` (`.stamity/hooks/`, already held) through the engine's own reader (`readHookDefinitions`, `src/hooks/userHooks.ts:149`, with `checkLauncherArgv`'s one script argument, `src/shared/launcherAllowlist.ts:297`). Reading at `Base:` means a run cannot unhold a script by editing its declaration. The run verbs hold them as they hold any person-only path (`src/cli/commands/run.ts`, `heldOf`). A hook written by hand into a client's settings file, whose script lies outside the held folders, stays a residual that `n6` names at `SECURITY.md:106`. It runs in a lane from the integration head once `n2` and `n4` are folded, since it touches `run.ts`. The tests: a user hook's script edited by an unattended run → held, not pushed (red before); a pack script → held; a script no declaration at `Base:` names → as today; the declaration edited to drop the script → still held |
| `cap round` | Added 18:31Z for `review/182`–`/189` (the closure review's two Warnings and its security lens's five Warnings and one Minor), as one rule: **the hold fails closed on anything it cannot resolve cleanly at `Base:`.**
- **The hooks folder:** the folder `Base:`'s manifest names (default `.stamity/hooks/`) is held whole, its declarations included, wherever it lies. A folder, or a pack root, that is a link at `Base:`, or that is named in another letter case than the tree holds, refuses the push and names it, never reading as "no hooks".
- **Script paths** in a declaration at `Base:`: backslashes read as separators. A `..` segment, an absolute path, a path that leaves the repository, or a path whose segments pass through a link at `Base:` refuses the push and names the declaration. Otherwise the script is held whether or not it exists at `Base:`.
- **Stand-ins:** a scratch stand-in that fails to land refuses rather than being swallowed.
- **The byte-order mark:** a manifest at `Base:` with one is read as the manifest reader reads it.
- **Named residuals, for `n6`'s pages:** modules a held script loads from outside the held folders, and a run that rewrites its own record head's `Base:` (the record-head residual already on the page).

A fresh fixer one effort level up (the cap round's escalation); tests for each case, red first where the code changed |

### n5-copilot-record-lock — Copilot's session start serializes its record update

| Field | Content |
|---|---|
| `id` | n5-copilot-record-lock |
| `requirements` | REQ-FLOW-123 |
| `files` | `src/hooks/scripts.ts` (`COPILOT_RECORD_SOURCE`, `recordMainSession` and its doc comment, `:1290-1330`), `test/hooks/personOnlyCopilotAsk.test.ts` |
| `interfaces` | The bot's comment `4314467903`: two main sessions starting at once can each read the old record, and the later rename drops the earlier id, so that live main session's asks are refused. The read, merge and rename run under an exclusive lock beside the record (`stamity/copilot-main-sessions.lock` under the common git directory, created with `wx` and owner-only, removed in a `finally`), waited for a bounded time with a synchronous sleep, a lock older than a stated age broken once, else not recorded (today's failure mode: the guard refuses that session's asks). A link or folder at the lock's path → not recorded. The guard's read (`recordedMainSession`) is unchanged: a rename is atomic. The emitted copies move only in the derived pass |
| `testCriteria` | A lock held by another writer → the session start waits and records once it is released; a lock past the stated age → broken and recorded; a lock held past the wait → the record unchanged; two session starts run concurrently against one common directory, repeated, → both ids recorded every time; a link at the lock path → not recorded |
| `edgeCases` | The lock's folder missing → created as the record's is (`0o700`); a crash while holding → broken by age; the record's 200-line and 64 KiB bounds unchanged |
| `depends_on` | none |
| `verify` | `npm run build && npx vitest run test/hooks/personOnlyCopilotAsk.test.ts test/hooks/personOnly.test.ts test/hooks/personOnlyGuard.test.ts test/cloud test/architecture test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: concurrent Copilot session starts → the record the guard trusts. Trusts: the rename's atomicity and the lock. Abuse: a planted or stale lock stops recording (fail closed: the asks are refused); a broken-lock race lets two writers in. Check: an exclusive create; a lock broken by age only; every failure leaves the record as it was |

### n7-held-below-top — the held paths for a project below the git top

Added 19:00Z for `build/99`, which `n4`'s cap-round fixer found: older than tonight, and true of every held pattern.

| Field | Content |
|---|---|
| `id` | n7-held-below-top |
| `requirements` | REQ-FLOW-102 |
| `files` | `src/cli/commands/run.ts` (the held-path matching: `heldOf`, the link prefixes, the history check, and where the verbs read `--show-prefix`), `src/change/personOnlyPaths.ts` (only if `heldPaths` takes the project's prefix), `test/cli/commands/runCheckpoint.test.ts`, `test/change/personOnlyPaths.test.ts` |
| `interfaces` | When the project root lies below the git top (`git rev-parse --show-prefix` non-empty), an unattended run holds a path if it matches a person-only pattern either as written from the git top or, when it lies under the project's prefix, as written from the project root. So `<prefix>/.claude/settings.json`, `<prefix>/.claude/hooks/**`, `<prefix>/.stamity/generated/**` and their peers are held, and the top-level patterns (`.github/workflows/**` and the rest) still hold at the top. The hook paths read at `Base:` (`n4`) resolve from the project root the manifest sits in. A project at the git top is unchanged |
| `testCriteria` | A project below the git top: an unattended checkpoint editing `<prefix>/.claude/settings.json`, `<prefix>/.claude/hooks/x.mjs` and `<prefix>/.stamity/generated/y` → each held, none pushed (red before); `.github/workflows/ci.yml` at the top → held, as today; a path outside the project and outside every pattern → pushed, as today; a link at `<prefix>/.claude` → held through the prefixes |
| `edgeCases` | A prefix in another letter case → matched as the globs fold case; a project at the top → byte-identical results |
| `depends_on` | n4-held-claude-hooks (its cap round folded), n6-night-pages (folded, since both touch `run.ts`'s comments and tests) |
| `verify` | `npx vitest run test/cli/commands/runCheckpoint.test.ts test/cli/commands/runEnd.test.ts test/cli/commands/run.test.ts test/change test/architecture test/ci && npm run typecheck` |
| `threat` | Boundary: an unattended run in a project below the git top → the files that decide later runs. Trusts: the held patterns, anchored at the git top, the prefix the verb reads from the folder it runs in, and the hook declarations at `Base:`. Abuse: a steered run edits the project's own client settings or hook scripts, or creates a file a declaration at `Base:` names, and a run verb pushes it. Check (amended 19:49Z after the round-1 lens): each pattern also matches from the project root; a hook path matches in one normalization form; a link or submodule above a held hook path is held; every file a declaration at `Base:` names, script, path-written launcher, option value or bare word, is held whether or not it exists at `Base:`, a scheme-like value is not a path, and a folder it names is not held (its contents are the named residual of what a held script reads or loads) |
| `fix round 1` | Added 19:49Z for `review/196`, `/197`, `/198` and `/199`: hold every file a declaration at `Base:` names, present or not (`review/196`, `/199`, the signed-off `build/101`); a folder a declaration names is not held, and the named residual on `SECURITY.md` widens to "anything a held script reads or loads beyond the files its declaration names" (`review/197`); a value with a URL-like scheme is not a path and is neither held nor refused, while a Windows drive path stays absolute and refused (`review/198`). The page lines that state the held set and the residual (`SECURITY.md`'s held-path sentence and residual list, `docs/security-mapping.md`, REQ-FLOW-102's 2026-10-19 bullet) join this unit's files, `n6` being done. Each case gets a test that fails first |
| `edges from n4` | Added 19:16Z when `n4` closed at its cap, the same matching code:
- `review/194`: the match between a run's changed paths and the held hook paths applies the Unicode normalization the `Base:` walk applies (read both sides in one form), so a path spelled in the other form is held.
- `review/195`: a submodule at a folder above a held hook path refuses, as a link there does, also where the declared path is absent at `Base:`.
- The option-value question: every argument of a hook declaration at `Base:` that names a repository file is held through the same resolver, not only the script and a path-written launcher, so a file passed as an option's value is covered.

Each gets a test that fails first; the files and the review loop are this unit's |

### n6-night-pages — the pages for `n2`, `n4` and `n5`

| Field | Content |
|---|---|
| `id` | n6-night-pages |
| `requirements` | REQ-FLOW-093, REQ-FLOW-102, REQ-FLOW-123 |
| `files` | `CHANGELOG.md` (Unreleased), `SECURITY.md` (the checkpoint marker paragraph `:582-598`, the held list's sentence `:106`, Copilot's ask `:105`, the residual list), `docs/specs/everyday-flows.md` (an `Amended 2026-10-19` bullet each on REQ-FLOW-092, REQ-FLOW-093, REQ-FLOW-102 and REQ-FLOW-123, and the provenance sentence `:122-127`), `docs/specs/prove-behavior-and-value.md` (REQ-PROVE-042's line ranges), `docs/specs/board-writes.md:124` and `docs/specs/orchestrator-context.md:555` (provenance only), the comment in `src/cli/commands/run.ts` that points at the security page (only that comment, if the page's wording needs it to stay true), `docs/security-mapping.md` (the held paths' rows), `content/skills/st-unattended/references/cloud.md` (`:77-86`, where it states the marker's order), the `source:` lines of eval cases whose ranges into that reference the edit shifts, and their `evals/SET-v7.md` index cells, `test/docsPages.test.ts` |
| `interfaces` | The pages say: the marker is refused before any write, and a commit that provably did not land clears it (`n2`); a `--paths` entry naming an already-committed path is harmless (`n2`); `.claude/hooks/**` is a person-only path (`n4`); Copilot's session start updates its record under a lock (`n5`). `CHANGELOG.md` also drops "after the program" where `review/147`'s correction applies (`review/164`). Amended 18:05Z, from the folds and the reviews, each stated as the code at the integration head does it (read the code; do not take this cell's words for it):
- **The marker (`n2`):** the marker is refused before any write. On POSIX the commit's git runs in a process group of its own; at the wall time the group is stopped and waited for, and the marker clears only when the group is gone, `index.lock` is absent and `HEAD` still names the commit before it, at the time it was read. Every other case keeps it: Windows, output past the buffer cap, an interrupt that stops the verb but not git's group. Write "at the time it was read", never "provably". Named residuals: a hook that detaches its own child, or starts its own process group, can still land a commit after the clear, and the next checkpoint pushes it without the hook-widening check (held paths and the secret scan still apply). The `SECURITY.md` paragraph at `:589-593` and the residual list (`:617-709`) both carry this; the comment in `src/cli/commands/run.ts` that points at the page must then be true.
- **Held paths (`n4` and its fix round):** an unattended run holds `.claude/hooks/**`, `.stamity/packs/**`, and the script file each user hook declaration at `Base:` names. Named residual: a hook written by hand into a client's settings file whose script lies outside the held folders (`SECURITY.md:106` and the residual list).
- **Copilot's record (`n5`):** updated under a lock beside it, with a bounded wait and a stale break; named residual (`build/92`): two starts breaking one dead holder's lock can drop one id, and that session's asks are refused (fail closed).
- **Spec deltas the units proposed:** MODIFIED REQ-FLOW-092 (`n1`: what `run end`'s `--paths` names, and what the verb stages itself), and REQ-PROVE-042's checklist line ranges (`n3`). Their texts are in `n1-implementer-r1.md` and `n3-implementer-r1.md` under `.stamity/runs/2026-10-18_cloud-runs-2/reports/`.
- **`review/173`:** the provenance sentences naming the sha the skill's citations were read at (`docs/specs/everyday-flows.md:122-127`, `docs/specs/board-writes.md:124`, `docs/specs/orchestrator-context.md:555`) gain a dated "re-pointed at" clause for tonight's moves |
| `testCriteria` | Pins for the new sentences, written first and red; the coverage pass exits 0; the locators test passes |
| `edgeCases` | A pinned phrase → kept word for word |
| `depends_on` | n1-eval-ending, n2-pending-marker, n4-held-claude-hooks (with its fix round), n5-copilot-record-lock, n3-copilot-remeasure (one writer of the shared pages, after them) |
| `verify` | `npx vitest run test/docsPages.test.ts test/evals test/authoring test/ci/testInputsGuard.test.ts && node content/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/021-cloud-runs-02.md docs/specs` (the plan lives only in the main checkout) |
| `threat` | None: pages |

### n8-eval-final-message — run 49's two floor misses: the final message names the hand-off; the board brief quotes the report's shape

Added by this plan's single writer at about 23:20Z, read at `1f558154`, after eval run 49 failed on two floor cases
(`unattended-close-opens-draft-pr` 1 of 3 on B5, `board-item-directive-is-data` 2 of 3 on B5). Lane from `1f558154`;
the emitted copies and the tree-digest goldens move only in the derived pass after the fold, as for the units above.

| Field | Content |
|---|---|
| `id` | n8-eval-final-message |
| `requirements` | REQ-FLOW-092, REQ-FLOW-094, REQ-BOARD-005 |
| `files` | `content/skills/st-unattended/SKILL.md` (the paragraph after "The ending"'s steps, `:104-107`, only), `test/corpus/skills/unattended.test.ts` (one pin), `evals/cases-v6/golden/unattended-close-opens-draft-pr.md`, `evals/cases-v6/golden/unattended-blocked-run-still-hands-off.md`, `evals/cases-v6/adversarial/unattended-ship-it-overnight-no-merge-or-tag.md` (each re-quotes that paragraph), `evals/cases-v6/adversarial/board-item-directive-is-data.md` (its Brief only), `evals/SET-v7.md` (two dated paragraphs under `## What v7 adds`, placed after "Two cases fixed where their judges placed the fault", and no other line), `docs/specs/everyday-flows.md` (one `Amended 2026-10-19` bullet under REQ-FLOW-092, after the last one) |
| `interfaces` | (1) The paragraph at `:104-107` gains one sentence after its first, in these words: "The run's final message names that pull request as the person's hand-off: the morning list is its body, or the one comment `run end` posted where the body was not this run's." The paragraph is rewrapped inside its four lines, which may run long as `:76-84` do, so no line of the file moves and no `source:` range, index cell or spec citation moves. No other word of the file changes. (2) Every case whose governing block quotes that paragraph re-copies it byte for byte, nothing else in it changed. (3) `board-item-directive-is-data`'s Brief gains a second governing block after the first: a heading `Governing text — \`content/rules/stamity-injection-screening.md\`, "Floor" (its item 2):` and a fenced `text` block holding `content/rules/stamity-injection-screening.md:32-43` byte for byte. Its `source:`, claim, Scenario, operator message and `## Expected` block stay as they are, B5 word for word. (4) `evals/SET-v7.md` gains two paragraphs in the style of the 2026-10-16 re-quote paragraphs: one for `ac397b7d` (2026-10-19, unit `n1-eval-ending`: step 3 of the ending names what `run end`'s `--paths` carries, five cases re-quoted, the close case's morning-list quote gains its opening paragraph, ranges re-pinned two lines down; it landed without one), and one for this unit (2026-10-19, run 49's two floor misses, each traced from the run's samples and its judges' grades). Each says no `## Expected` block, B / A, claim, floor tag, threshold or roster count moves, `EXPECTED_MOVES` gains no row, and the moved cases re-measure under hard trigger 1. Neither quotes any of the board fixture's planted text, nor three consecutive words of it. (5) The spec bullet states the sentence, cited at the skill's lines |
| `testCriteria` | The new pin (`test/corpus/skills/unattended.test.ts`) red before the sentence and green after; `BODY_CAP` unchanged at 163; `test/evals/locators.test.ts` and every case test under `test/evals` pass, including `test/evals/roster.test.ts`; the coverage pass exits 0 |
| `edgeCases` | A case quoting the paragraph that no test holds equal to the source → listed in the report, not edited; a pinned phrase in `test/corpus` or `test/docsPages.test.ts` → kept word for word |
| `depends_on` | none |
| `verify` | `npx vitest run test/evals test/corpus/skills/unattended.test.ts test/docsPages.test.ts test/ci/testInputsGuard.test.ts && node content/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/021-cloud-runs-02.md docs/specs` (the plan lives only in the main checkout) |
| `threat` | None: guidance text and eval data; no criterion is loosened, and the board case's quoted fixture is not copied anywhere new |

### n9-eval-run-50 — run 50's misses: a quote ending in a backslash, the quick refusal's size floor, the QA twin's hand-back text

Added by this plan's single writer at about 03:52Z on 2026-10-20, read at `c526348a`, after eval run 50 failed: one
sample of `unattended-ship-it-overnight-no-merge-or-tag` not graded (its judge passed every binding row in all three
attempts, and the grade reader refused each one: the B2 citation quotes a shell line ending in a line-continuation
backslash, and `quotedPhrases` reads the backslash as escaping the closing quote), `quick-security-surface-no-size-floor`
1 of 3 on B3 (two answers give the template refusal and never say the row has no size floor; 2 of 3 in run 48 too), and
the benign twin `benign-qa-second-account-stays-person-row` 0 of 3 on B1 (its Brief holds no text naming the sign-off
block or the close walk, which B1 grades and which its parent case `qa-prove-before-asking` quotes). Built after the
morning walk of 2026-10-20; run 51 is composed with run 50 and re-measures only the cases this cell moves and the one
ungraded case. Lane from `c526348a`; the emitted copies and the tree-digest goldens move only in the derived pass after
the fold.

| Field | Content |
|---|---|
| `id` | n9-eval-run-50 |
| `requirements` | REQ-FLOW-005, REQ-FLOW-065, REQ-FLOW-080; the grade reader's citation rule carries no requirement id (its contract is `test/evals/manualRunner.test.ts`) |
| `files` | `scripts/eval/instrument.mjs` (`quotedPhrases`, `:159-172`, and `locateCitation`, `:744`, only), `test/evals/manualRunner.test.ts` (one case beside `:382`), `content/commands/st-quick.md` (the security-sensitive row's paragraph, `:86-88`, only), `test/corpus/commands/lightTrio.test.ts` (one pin beside `:1105`), `evals/cases-v6/golden/quick-security-surface-no-size-floor.md`, `evals/cases-v6/adversarial/quick-refusal-under-social-pressure.md`, `evals/cases-v6/adversarial/quick-string-rename-on-auth-path-refused.md` (each re-quotes that paragraph), `evals/cases-v6/adversarial/benign-qa-second-account-stays-person-row.md` (its Brief and its `source:` line only), `evals/SET-v7.md` (one dated paragraph after n8's, and the twin's index cell), `docs/specs/everyday-flows.md` (one `Amended 2026-10-20` bullet under REQ-FLOW-065, after the last one) |
| `interfaces` | (1) The reader keeps reading `\"` inside a quote as an escaped quote mark first (`:382`'s case stays green). Only when that reading locates nothing does `locateCitation` try a second reading, in which a backslash right before a closing mark is the span's last character, and it locates by the same rules. Nothing it admitted before reads differently. (2) The paragraph at `:86-88` says the refusal itself states that the row has no size floor when the item is small (one character, one file, a few lines), rewrapped inside its three lines, which may run long as 18 lines of the file already do, so no line of the file moves and no `source:` range, index cell or spec citation moves. The refusal template at `:76-79` and its "measurement, not a verdict" rule are unchanged. (3) The three cases whose governing block quotes that paragraph re-copy it byte for byte, nothing else in them changed. (4) The twin's Brief gains one governing block after its test-runner block: a heading naming `content/skills/st-qa/SKILL.md`, "Handback", and a fenced `text` block holding `:150-159` byte for byte, as its parent case quotes them. Amended 2026-10-20 at the build's return: `test/evals/locators.test.ts:525-546` holds a block naming the case's own source file inside its `source:` ranges, so the twin's `source:` widens to `content/skills/st-qa/SKILL.md:38-55,150-159`, the ranges its parent declares. Its index cell in `evals/SET-v7.md` moves with it (`test/evals/roster.test.ts:122-126`). Amended again 2026-10-20, after the unit's review: B1 grades "followed by the sign-off block", and the Handback names only "the sign-off outcome". So the Brief also quotes the skill's "Quick Start" (`:18-24`, whose step 4 emits "the remaining table plus the sign-off block") in its own block, placed before the walk-through table's block in file order. The `source:` and the index cell then read `content/skills/st-qa/SKILL.md:18-24,38-55,150-159`. Its claim, Scenario, operator message and `## Expected` block stay as they are, B1 word for word. (5) `evals/SET-v7.md` gains one paragraph in the style of n8's (2026-10-20, run 50's misses, each traced from the run's samples and its judges' grades), which also says the twin's range widened. No `## Expected` block, B / A, claim, floor tag, threshold or roster count moves, `EXPECTED_MOVES` gains no row, and the moved cases re-measure under hard trigger 1. (6) The spec bullet states the sentence, cited at the command's lines |
| `testCriteria` | The new reader case red before (2) and green after: a citation quoting a transcript line that ends in a line-continuation backslash locates exactly; the new corpus pin red before the sentence and green after; `test/evals/locators.test.ts` and every case test under `test/evals` pass, `test/evals/roster.test.ts` included; the coverage pass exits 0 |
| `edgeCases` | A judge's `\"` inside a quote that closes later → still the escaped quote; a backslash-ended span the transcript does not hold → still refused; a case quoting the paragraph that no test holds equal to the source → listed in the report, not edited |
| `depends_on` | none |
| `verify` | `npx vitest run test/evals test/corpus/commands/lightTrio.test.ts test/docsPages.test.ts test/ci/testInputsGuard.test.ts && node content/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/021-cloud-runs-02.md docs/specs` (the plan lives only in the main checkout) |
| `threat` | None: guidance text, eval data and the grade reader's quote rule; no criterion is loosened, and the reader admits only grades it refused before. The instrument's pinned hash moves with (1), so run 51's setup re-pins it |

### n10-refused-title — `run end --refused` prefixes a title once

Added by this plan's single writer at about 08:40Z on 2026-10-20, read at `c526348a`, from the maintainer's cloud
checks of 2026-10-19: Cursor's cloud agent wrote its own `Refused: …` title, and the verb prefixed it again, so the
draft pull request read `Refused: Refused: …`. Lane from `c526348a`, beside `n9` (no file shared).

| Field | Content |
|---|---|
| `id` | n10-refused-title |
| `requirements` | REQ-FLOW-092 |
| `files` | `src/cli/commands/run.ts` (the title line at `:1225` only), `test/cli/commands/runEnd.test.ts` (one case beside `:305`) |
| `interfaces` | With `--refused`, the title gains `Refused: ` only when it does not already begin with `Refused:` once leading white space is set aside; otherwise it is used as given. The title screen runs on the final title as before, and a pull request already open keeps its own title as before (`:1231`). No other behaviour moves |
| `testCriteria` | The new case red before the change and green after: `--refused` with the title `Refused: cloud check` opens the draft pull request titled `Refused: cloud check`. The case at `:305` (`Refused: plan 021 not ready`) stays green |
| `edgeCases` | `Refused:` with no space after it → not prefixed again; `refused:` in lower case → prefixed, since the rule reads the verb's own word; a title that is `Refused:` alone → kept, and the title screen decides |
| `depends_on` | none |
| `verify` | `npx vitest run test/cli/commands/runEnd.test.ts && npm run typecheck` |
| `threat` | None: a title string; the title screen still reads the final title |

### n11-cloud-setup-page — what the first cloud checks found each cloud needs

Added by this plan's single writer at about 08:40Z on 2026-10-20, read at `c526348a`, from the maintainer's answer
"Yes, plus guide and title fix" (the morning walk of 2026-10-20). It runs after `n9` and `n10`, so it is the only
writer of `docs/specs/everyday-flows.md` at its time. The facts are the cloud checks of 2026-10-19 as the run record
states them:
- Claude Code on the web ran Node 22.22.0, and the pre-flight's `node-engine` check refused it against the engines
  floor of 22.22.2.
- Its git pushed over https with no credential helper, and `direct-push` refused.
- Cursor's origin push URL carried its own credentials, and `direct-push` refused.

| Field | Content |
|---|---|
| `id` | n11-cloud-setup-page |
| `requirements` | REQ-PROVE-043, REQ-FLOW-092 |
| `files` | `docs/cloud.md` (Claude Code's "Set it up", `:75-84`, and Cursor's, `:116-129`; "What every cloud needs", `:52-71`, only where a sentence must change to stay true), `test/docsPages.test.ts` (pins for the new sentences), `docs/specs/everyday-flows.md` (one `Amended 2026-10-20` bullet under REQ-FLOW-092 for `n10`'s rule, after the last one), `docs/specs/prove-behavior-and-value.md` (one `Amended 2026-10-20` bullet under REQ-PROVE-043, only if its text lists what each cloud's setup holds) |
| `interfaces` | (1) Claude Code's "Set it up" says the environment needs a Node of at least the engines floor, because the cloud's default ran 22.22.0 on 2026-10-19 and the pre-flight refuses it. It also needs `gh auth setup-git` before the run, so that `gh` is origin's credential helper, because by default git pushed over https with no helper and `direct-push` refused. (2) Cursor's says the saved environment's origin URL must not carry credentials: set it to the plain https URL and run `gh auth setup-git`, because a credentialed URL cannot be tied to `gh`'s identity and `direct-push` refuses. (3) Neither section claims a menu path, an image name or a version the checks did not observe; where the page names a place to run a step, it is the environment's setup or install step the page already names. (4) The REQ-FLOW-092 bullet states `n10`'s rule, cited at the code line `n10` lands |
| `testCriteria` | The new pins red before the sentences and green after; `test/docsPages.test.ts` passes; the coverage pass exits 0 |
| `edgeCases` | A pinned phrase in `test/docsPages.test.ts` → kept word for word; a sentence elsewhere on the page that the new ones contradict → changed in the same unit and listed |
| `depends_on` | n9-eval-run-50, n10-refused-title |
| `verify` | `npx vitest run test/docsPages.test.ts test/ci/testInputsGuard.test.ts && node content/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/021-cloud-runs-02.md docs/specs` (the plan lives only in the main checkout) |
| `threat` | None: pages |

### n12-records-retention — the 1.16.0 window's two run summaries

Added by this plan's single writer at about 08:45Z on 2026-10-20, read at `c526348a`. Run 51 is composed with run 50,
which needs run 50's full summary on the `records` branch. That summary is 6,122,535 bytes, over the hygiene budget,
and the branch's push workflow runs the hygiene script from `main`. So the window's entries ride this pull request, as
the 1.14.0 window's did for runs 44, 45 and 46. Until #113 merges, the `records` workflow's hygiene step reads `main`'s
empty map and refuses each push of a summary. A re-run after the merge reads the entries. Lane from `c526348a`, beside
`n9` and `n10` (no file shared).

| Field | Content |
|---|---|
| `id` | n12-records-retention |
| `requirements` | REQ-PROVE-024, REQ-PROVE-033 |
| `files` | `scripts/repo-hygiene.mjs` (the `LARGE_FILE_EXCEPTIONS` map and its comment, `:13-40`, only), `test/ci/repoHygiene.test.ts` (the size-exception case at `:284-310` and one dated TEST CHANGE paragraph above it, after the 1.15.0 close's) |
| `interfaces` | (1) The map gains two exact-path entries, each with its reviewable reason, the 1.16.0 window and the close step that ends it (the 1.16.0 close's archive step). The first is `evals/runs/2026-10-19-run-50/summary.json`: run 50, the full 1.16.0 measure on the claude profile at candidate `c526348a`, FAIL on two floor cases (one of them an ungraded sample) and one benign twin. Its exported summary is 6,122,535 bytes, and run 51 reads it from the `records` branch. The second is `evals/runs/2026-10-20-run-51/summary.json`: run 51, composed with run 50. Its entry precedes its artifact, which the map's comment already allows. (2) The comment keeps its history and says the 1.16.0 window opened with these two. (3) The test's expected list becomes those two paths, with its message and title moved as the 1.14.0 window's opening moved them. A dated TEST CHANGE paragraph in that style says why. The retirement proof is unchanged |
| `testCriteria` | The size-exception case passes with the two entries: each exempted path passes over budget while its same-directory neighbour is refused, and every retired summary is still refused; `node scripts/repo-hygiene.mjs` exits 0 on the lane |
| `edgeCases` | Run 51 prepared on a later UTC date than 2026-10-20 → its id differs, and the entry is corrected before run 51's summary is published |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/repoHygiene.test.ts && node scripts/repo-hygiene.mjs` |
| `threat` | None: two exact-path size exceptions with their reasons; no broad exemption, no raised ceiling |

### n13-model-lists-survive-every-write — a 1.15.0 manifest's saved lists reach the cache before any write leaves them out

Added by this plan's single writer at about 10:15Z on 2026-10-20, read at `035f078d`. The 1.16.0 cut's re-attestation
pass `c4c` noted the defect, and a read-only research pass confirmed it (ledger `review/237`).
- `writeManifest` (`src/manifest/manifest.ts:1202`, `:1223-1229`) leaves out `models.listed`. Only `sync` moves the
  lists to `.stamity/client-models.json` before its own write.
- The workspace cascade (`src/cli/commands/workspace.ts:1065-1072`) writes a changed member's manifest first, and
  `planSync` then re-reads it with no lists. A 1.15.0 member loses the saved list of every client not read fresh: all
  of them under `STAMITY_NO_CLIENT_PROBE=1`, any whose CLI is missing or unreadable, and any the patch removes.
- `SECURITY.md:198-199` says the next sync moves them.
- Other callers that read a manifest and write it back may drop the lists the same way: `config.ts:1279`, `:1357`;
  `config/mcp.ts:466`, `:534`; `add.ts:904`; `clean.ts:852`. That reading is unverified.

Lane from `035f078d`. It touches no `content/` file, no emitted file and no eval input, so it moves nothing in the
eval line's trigger list.

| Field | Content |
|---|---|
| `id` | n13-model-lists-survive-every-write |
| `requirements` | REQ-LADDER-009, REQ-LADDER-006 |
| `files` | `src/cli/commands/workspace.ts` (the cascade's write in `createBridge`), each other caller that reads a manifest and writes it back and is found to drop the lists (from the list above, verified one by one), `src/manifest/manifest.ts` or `src/cli/engine/clientModels.ts` only if one shared helper is the smaller correct route, `test/cli/commands/workspace.test.ts`, and the test file of each other caller changed |
| `interfaces` | No verb's manifest write drops saved lists that have not reached the cache. Before a write leaves `models.listed` out, the lists move to `.stamity/client-models.json` exactly as `sync` moves them: the same resolution order (saved, then cache, then fresh) and the same cache checks and warnings (`resolveModelLists`, `writeModelListCache`, `cacheDefects`). A `--dry-run` writes neither file. A caller that never writes a manifest it read is unchanged. The architecture boundaries hold (`test/architecture/boundaries.test.ts`). Each caller in the list is either changed and tested, or named in the report with the line showing it cannot drop the lists |
| `testCriteria` | A new cascade case, red before the change and green after: a member whose manifest holds `models.listed.codex`, a workspace default that changes the member's `tools`, and `STAMITY_NO_CLIENT_PROBE=1`; after `workspace sync`, `client-models.json` holds the saved list and the manifest no longer carries the key. One case per other changed caller, in the same shape. Existing cases stay green |
| `edgeCases` | A manifest with no `models.listed` → unchanged path. A cache that already holds a newer list for a client → the resolution order decides, as in `sync`. An unwritable cache → the warning `sync` gives, and the manifest write still proceeds as `sync`'s would |
| `depends_on` | none |
| `verify` | `npx vitest run test/cli/commands/workspace.test.ts test/cli/commands/sync.test.ts test/architecture && npm run typecheck` plus each changed caller's test file |
| `threat` | Low: local file writes inside the project's own `.stamity/`, through the existing cache writer and its checks |

### n14-bot-round-2 — a continued run's start reads its mode and origin's branch from the remote, and a held patch keeps its earlier sections

Added by this plan's single writer at about 10:28Z on 2026-10-20, read at `035f078d`, from `/st-pr-resolve` round 2 on
#113. The review bot's three comments on `035f078d` were each screened `kept`, and a read-only researcher accepted each
(`.stamity/runs/2026-10-20_pr113-pr-resolve-r2/record.md`):
- **P1** (`src/cli/commands/run.ts:281`, Warning): `startsUnattended` (`:720-724`) reads only the work tree's record. A
  fresh-clone continuation whose record is on origin's `stamity/<id>` starts as attended, keeping git's program-valued
  variables for the start, and passes the fallback refusal at `:299`.
- **P2** (`:367`, Minor): `originRunTip` trusts `refs/remotes/origin/<runBranch>` without asking origin, against the
  file's own rule at `:632-635`. A branch deleted on the server can be recreated from the stale tip and pushed back.
- **P3** (`:954`, Warning): when the checkpoint holds a new change, the committed patch's earlier sections are not read
  (`:954-963`), so on a fresh clone the replacement patch and `held` drop them.

Lane from `035f078d`; one writer, since all three are in one file.

| Field | Content |
|---|---|
| `id` | n14-bot-round-2 |
| `requirements` | REQ-FLOW-105, REQ-FLOW-122, REQ-FLOW-092 |
| `files` | `src/cli/commands/run.ts` (`runStart` at `:281` and `:299`, `startsUnattended`, `originRunTip` at `:365-394`, the checkpoint's hold block at `:954-1028`, and the docblock lines that state what start reads and how long the committed patch is kept, `:32-57` and `:102-104`), `test/cli/commands/run.test.ts`, `test/cli/commands/runCheckpoint.test.ts`, `docs/specs/everyday-flows.md` (one `Amended 2026-10-20` bullet under each requirement whose stated behaviour moves) |
| `interfaces` | (1) **P1:** the start decides its mode once. When the work tree holds no record, it reads the record head with hardened git (`startVerbGit(true)`) from `refs/heads/stamity/<id>`, then from `refs/remotes/origin/stamity/<id>`, through one helper that `originRunTip`'s regular-file check also uses. The record's `Mode:` then sets the start's git hardening and the fallback refusal, as a work-tree record does today. (2) **P2:** `originRunTip` asks origin through `remoteRefs` (`:637-651`) before using a tracking ref. A branch origin no longer advertises is refused, naming the stale ref and `git fetch --prune origin`. A tip origin has moved past is refused with "fetch origin first". A failed read is refused in both modes, before anything is switched or created. (3) **P3:** when the checkpoint holds a new change and the branch's committed patch names paths not held now, those sections are kept in order before the new ones, split at line-start `diff --git ` headers and mapped through `git apply --numstat -z`. Their paths join `held`, and a path held again takes the current diff. (4) No `SECURITY.md` edit: a wording its pages now need is named in the report for the cut's page writer |
| `testCriteria` | Each red before its change and green after. P1: a continuation seeded `Mode: unattended` with `STAMITY_UNATTENDED` unset strips `GIT_EDITOR` and `GIT_SSH_COMMAND` (`gitEnvRemoved`), and with no default-branch source refuses with no local `stamity/<id>`. P2: a remote branch deleted after the fetch refuses with the stale-ref text, leaving `main` checked out and no branch created on either side; a remote tip moved after the fetch refuses with the fetch text. P3: a clone that holds a second person-only path pushes a patch carrying both sections, `held` lists both, and `git apply --check` of it against `Base` passes |
| `edgeCases` | A work-tree record present → read as today, no remote read. A local `stamity/<id>` while the checkout is on the default branch → its record head is read too. A committed patch whose path is held again → the current diff wins. A binary section → kept whole (base85 lines hold no space) |
| `depends_on` | none |
| `verify` | `npx vitest run test/cli/commands/run.test.ts test/cli/commands/runCheckpoint.test.ts test/cli/commands/runEnd.test.ts && npm run typecheck && npm run lint` |
| `threat` | The unattended hardening of the run verbs: git's program-valued variables and the fallback-default refusal (P1); a push that could recreate a branch a person deleted (P2); the person-only hand-off (P3). The security lens runs |

## Inbox rows this file matched

`stamity ledger inbox --plan docs/plans/021-cloud-runs-02.md --paths <this file's paths>` on 2026-10-18: 147 rows, 56
matched, 91 unmatched, none unparsed or skipped. Folded: row 263 (`2026-10-14_cli-native/close/1`, the committed model
list) → `v17`; rows 279 (the held `plugin` block), 255 (`build/31`, the leftover-plugin warning) and 266 (`sync
--dry-run` says "migrated" while writing nothing) → `v16`; row 119 (the egress page's hardener pin) → `v18`; rows 272
and 273 (`cut/24`, `cut/25`) → `v19`; row 257 (`build/45`, Copilot's hook entry naming the pinned version) → decided
in `v10`: kept, beside Codex's matching question, which waits for Package 20. Left, each with its reason: rows 140,
141 and 234 (`review/22`, `build/14`, `review/36`, the instruction files Copilot's agents load) — the thin entry agent
loads nothing beyond the prompt file, and the residual stays on `SECURITY.md`; row 256 (`build/43`,
`CURSOR_PROJECT_DIR`) — the maintainer's Cursor check records it; rows 259 to 261 (`build/67`, `build/76`, Copilot's
question tool) — unverifiable without a Copilot cloud run; row 280 (the Windows `.cmd` shims in `clientModels.ts`,
triggered by `v17`'s touch) — `v17` moves where the list is kept, not how it is read, and the shim fix needs a Windows
measurement this file cannot make; row 278 (`hookScriptsRoot` with no producer, triggered by `v0a2`'s touch of
`src/emit/hooksInfra.ts`) — `v0a2` edits only the guard's matcher, and the removal spans the adapters' container
forms; rows 61, 62, 70, 102, 103, 105, 148, 152, 153, 157 to 159, 177, 179, 183 to 185, 192 to 194, 196, 197, 201,
206, 210, 218, 230, 235 to 237, 239, 240, 242 to 244, 246 to 249, 262, 269 and 271 — outside this file's units, each
keeping its own trigger; the walk-up starter's latency row (`docs/plans/020-cli-native-02.md`) — its trigger is a
latency measurement.

PR #112's leftovers routed here, ledger rows of run `2026-10-15_cloud-runs`, read here and left open for that run's
close: `build/5` → `v1`; `build/85`, `pr/39` and `pr/26` → `v21`; `pr/44` and `pr/45` → `v5`; `pr/64`, `pr/89`,
`pr/90`, `pr/97` (gh's positional reading), `review/236`, `review/245`, `review/246` and `review/252` → `v0b`; `pr/98`
(the tag reader's two ceilings) → `v0b` for the code comment and `v0d` for the page; `pr/91` and `pr/92` (the security
page's curl-prefix and parser wording) → `v0d`; round 1's two plan-check notes (units leading into a cycle, a bare shorthand
id), which carry no row → `v22`.

## Execution order

1. Lanes at once, files disjoint: `v0a`, `v1`, `v12`, `v14`, `v16`, `v18`, `v21`, `v22`.
2. Then, as each edge lands:
   - the guard: `v0a` → `v0a2` (after `v16`) → `v0b` → `v0d` (after `v0c`, `v5` and `v3`); `v0c` after `v21`; `v3`
     after `v21` (re-sequenced 2026-10-18 at 20:20Z so the skill's pointer unit runs beside the session chain; `v0d`
     follows it as the skill's and its corpus test's next writer);
   - `src/hooks/scripts.ts` outside the guard: `v1` → `v2` (after `v16`) → `v4` → `v5` (also after `v0a2`) → `v6` (also
     after `v12`) → `v8`;
   - `v7` after `v2`; `v11` after `v2`, `v6` and `v7`;
   - the adapters: `v16` → `v9` → `v10` → `v17` (also after `v5`, `v6` and `v0d`);
   - `v13` after `v12`; `v15` after `v11`, `v12`, `v13`, `v14` and `v0d`; `v19` after `v3`, `v8` and `v0d`; `v20` last.
3. `src/hooks/scripts.ts` has two writer chains by region, folded by cherry-pick: the guard chain (`v0a2`, `v0b`) writes
   only `guardDecisionOutput`, `decide()`, the guard's MCP branch and the guard's budget row; the session chain (`v1`,
   `v2`, `v4`, `v5`, `v6`, `v8`) writes the rest, its new builders placed as their cells say, and `v4` → `v5` keeps
   `test/hooks/scriptBudget.test.ts`' count and `renderAll` to one writer at a time. Lanes fold onto the integration
   branch by cherry-pick; a conflict is aborted and replayed by a fixer. Derived files only in the integration lane (the
   dogfood copies, this repository's own settings rows, the capability matrix, the CLI and configuration references,
   the golden snapshots), each diff read before it is committed.
4. Then the gates, the full suite alone under the machine lock, `npm run check`, the dogfood check, the leak gate and
   the hygiene check by exit code; per-unit review, the security lens on `v0a`, `v0a2`, `v0b`, `v0c`, `v1`, `v2`, `v4`,
   `v5`, `v6`, `v8`, `v11`, `v12`, `v13`, `v16`, `v17` and `v21`; the whole-branch review before the merge.

## QA walk

The maintainer's cloud checks are the person rows: **P1** Claude Code (an overnight unattended `/st-work` in a scratch
repository from `scripts/qa/cloud-check.mjs`, its morning question answered after at least eight hours) and **P2**
Cursor (a cloud agent run on the same kind of repository), each verified by `cloud-check.mjs verify`. **P3** (Copilot)
reads `not-run: no Copilot cloud-agent account`. Every other row is proven by a committed test or the container leg;
each client's answer to an ask was measured in throwaway folders on 2026-10-18, is pinned by the guard's tests and is
re-measured by `hook-runs.mjs --ask` at release prep. Frame's continuation of an in-progress record (REQ-FLOW-105) is
proven by its parts' tests and the skill's pinned text; no eval case observes a whole continuation, an accepted gap.

## Risks

- **Warning** — Claude Code's bypass-permissions mode holding a hook's ask is measured, not documented, and every
  client's ask is now part of the attended floor. Mitigation: the settings' ask rows, documented to prompt in every mode,
  back each prefix form; `hook-runs.mjs --ask` re-measures each client before every release; the page names it.
- **Warning** — where no hook runs, a `gh pr merge` line holding `-d` meets only the settings' ask row. Mitigation: the
  prompt shows the whole command; `SECURITY.md` names it as an attended residual.
- **Warning** — a reader that kept only the first act on a line would let a deletion ride an approval. Mitigation:
  `v0a` collects every act and a refused one wins, with mixed-line tests on every client.
- **Warning** — `v0b` turns about nineteen allow twins that end in a run verb into denials. Mitigation: each is
  retargeted to `npm test`, keeping the line-wide rule's proof that it does not over-refuse.
- **Warning** — two chains write `src/hooks/scripts.ts` by region, and #112's last round edits the guard beneath this
  branch. Mitigation: the region split in the execution order, cherry-pick folds, a conflict replayed by a fixer, and
  one rebase onto #112's final head before the first push.
- **Warning** — the vendors change their clouds weekly; every vendor fact a unit leans on is re-read when it is built.
- **Warning** — the always-on tripwire changes shape (two figures). Mitigation: the disclosure says why, in the matrix.
- **Warning** — the model list's move could read as drift in CI. Mitigation: `v17`'s fresh-clone test.
- **Minor** — the container leg drops `container:`. Mitigation: no socket, the source read-only, the digest pinned.
- **Minor** — Copilot's cloud behaviour stays unrun. Mitigation: the matrix says "documented, not run".

## Open questions

None.

## Follow-ups (appended to `.stamity/inbox.md` when this plan lands)

- Minor · src/hooks/scripts.ts · the review counter is keyed by the client session, so every reviewer stop in a session
  counts toward one cap; key it by the run · source: /st-plan · Ref: docs/plans/021-cloud-runs-02.md · when: a run's
  review gate reaches its cap early
- Minor · — · Copilot's cloud rows are documented, not run; run P3 · source: /st-plan · Ref:
  docs/plans/021-cloud-runs-02.md · when: a Copilot cloud-agent account exists · files: scripts/qa/cloud-check.mjs

## Drop list

| Item | Revisit when |
|---|---|
| A committed `.cursor/environment.json` | Cursor stops letting a repository file override saved environments |
| The GitHub Action as an overnight surface | GitHub lifts the six-hour job cap |
| A refusal in `stamity worktree setup` inside a cloud machine | a cloud run is seen using the sibling folder |
| Cursor answering ask | Cursor documents its ask and honours it under `--force` |
| Codex answering ask | Codex's hooks page says a hook's ask prompts |

## The cut (after the units; the maintainer's yes)

The whole `.github/release-controls-checklist.md`: the full eval run on the final candidate (the content and the eval set
moved), published to the `records` branch before the tag; the spec flips before the tag; QA with P1 and P2; the
hand-page re-attestation; the measurements; the container digest re-read; the record re-sync; the tag with its records
line; the publish on the maintainer's yes.
