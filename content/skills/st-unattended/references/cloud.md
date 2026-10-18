---
id: cloud
type: skill
description: Cloud sessions for the unattended skill — a night paced with no wait inside the machine, lanes without the sibling worktree folder, a run continued from its branch, the commits after the last checkpoint, and a session-capped cloud agent running a long plan as a chain of sessions.
tags: [orchestration]
load: reference
obsolete_when: every supported client enforces an unattended mode natively, cloud sessions included, so no run follows these floors from text
---

# Unattended runs in a cloud session

A cloud session is one the session start names a cloud session. Pacing, lanes, hooks and the capped agent below bind an
unattended run there; a local unattended run and an attended one keep `/st-work`'s capacity rung, its 12-hour wait
included. Continuing a run and the commits after the last checkpoint bind every unattended run. Every `stamity <verb>`
call runs in the form the skill's Running-the-CLI paragraph gives.

## Pacing

At a usage limit that names its reset, the run writes `- <UTC> capacity: <role> limit-reset → BLOCKED_DEPENDENCY`
into the record, adds the stop to `morning.md`, then runs
`stamity run checkpoint --run <id> --paths <p...> --pr --title <t> --json`, which pushes the branch and refreshes the
draft pull request's body from the morning list; a checkpoint that does not push adds a `Not done:` line naming the
branch. It then returns `BLOCKED_DEPENDENCY` naming the reset time. Nothing waits inside the machine, however near the
reset: a reset five minutes away still returns. The record stays in progress, so the next session on the branch
continues it.

The run uses no `/loop`, no wakeup and no agent team to pace itself, and runs at most two implementers at once. A
checkpoint runs after each review round, so the round's `usage: review rN` line reaches the branch before the machine is
reclaimed: the review gate rebuilds a lost counter only from the record the branch carries.

The full gate runs as one background command under a stated timeout, and the run takes its completion notice, never
polled with `sleep`. That is the one exception to the bound agents' Shell paragraph, whose words stand unchanged
everywhere else: the brief that dispatches it names this exception.

## Lanes

Units that could run in parallel run each in the client's own isolation, or one at a time; never in the sibling folder
`stamity worktree setup` makes, so no folder appears under `<parent>/.stamity-worktrees/`. A lane commits in its
isolation and is folded once, when its agent returns and before the next checkpoint: its change is applied to the run's
work tree alone, as `git diff --binary <run-branch>...<lane> | git apply` applies it, never to the index, where a
deletion already staged refuses the checkpoint; that checkpoint's `--paths` names every path
`git diff --name-only --no-renames <run-branch>...<lane>` lists. The checkpoint reads every held path itself, from no
list in this text: it moves any held part into `held/person-only.patch`, restored in the index only, and commits the
rest, so no held path enters the run branch's history and nothing a lane did stays only on the machine. A lane's commit
never lands on the run branch itself: one carrying a held path refuses every later `run checkpoint` and `run end`, which
never rewrite history.

## Hooks

A cloud session that holds several repositories loads none of their hooks. An unattended start there is refused first
by the pre-flight's `hooks-loaded` check, and its fix is one repository per session.

## Continuing a run from its branch

Frame in an unattended run continues the in-progress record whose `Branch:` names the checked-out branch — the run
the session start's resume card names, or `stamity ledger status` where no hook ran — from its record and ledger,
instead of opening a new record; its head lines stand as written. A session continues only a record on the branch
it was given: it runs `stamity run start --run <id> --json` first, `<id>` that record's folder name, and its ready
check passes the record's `Base:` as `--since`, `stamity plan check <plan> --since <Base> --json`, so a `reads` path
only the run's own commits moved is exempt and one moved between the stamp and the base stays stale. A chain file's
continuation passes the chain's first record's `Base:` instead, to the chain's check,
`stamity plan check a b c --chain --since <Base> --json`, as `references/chains.md` gives it: the file's own `Base:`
comes after the earlier files' commits, so a `reads` path they moved would read stale. With no in-progress record on
the branch it was given, as on a clone given the default branch or a platform's own, it opens a new run and never
guesses another branch. A record naming another branch, a detached HEAD, or no `Branch:` line opens a new record.

## Commits after the last checkpoint

At the morning walk, the commits on the run branch after the last checkpoint's sha are counted: the subjects
`git log --format=%s <sha>..HEAD` lists, less each reading `chore(run): checkpoint <id>`, the run verbs' own subject.
The run's closing commit is never counted; a cloud's CI autofix or a person's push is, on one row under `## Not done:`:
`Not done: <n> commits after checkpoint <sha>, not covered by the proof block's gates`. The proof block's gate results
are never read as covering them.

## A session-capped cloud agent

On a cloud agent whose session ends near an hour and whose next session starts from a pull request comment, a long
plan runs as a chain of sessions: units are sized to one session, each session runs a checkpoint before about minute
45 to 50, and the next starts on a `write` or `admin` person's `@<agent> continue` and resumes from the committed
record on the same pull request, as continuing a run states. Where no sub-agent tool exists, the roles run in line in
their order, and the proof block says so.

The gates run in the agent's sandbox. While the pull request's CI waits for a person's approval to run workflows, the
proof block reads `CI not run: awaiting approval`, never green, and the morning list carries that row; under required
reviews, a second approver is a `## Prerequisites` row. When `.github/agents/stamity-run.agent.md` is not yet on the
default branch, the run writes a declared `## Prerequisites` row naming it; landing it there is the person's call.
