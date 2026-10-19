---
title: Cloud runs
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit 1fd1808d. Re-attested 2026-10-18 for the whole page, written that day. -->
<!-- Re-open when: a row of `CLIENT_CLOUD_FACTS` moves, a run contract key or a pre-flight check
     changes, or a client's answer to a person-only act moves. `test/docsPages.test.ts` holds this
     page to the hand-page contract, the contract parser and that table; a vendor page that changed
     is caught by the release checklist's re-read of the pages the table cites, not by a test. -->

# Cloud runs

This page is for you if you want a planned change to run in a vendor's cloud. On Claude Code on the
web and Cursor's cloud agents it can run through a night with nobody there. Copilot's cloud agent
runs it as a chain of sessions, each stopped at 59 minutes, and a person continues each one, so it
is no night with nobody there. For each cloud it gives the setup, the branch protection the run needs before it starts, the secrets, how to start a run under
a run contract, and the morning walk. Then it covers Claude Code's GitHub Action, which is a short
surface rather than an overnight one, and the run contract itself.

The run is an ordinary touchpoint, usually `/st-work`, in unattended mode.
[Working with stamity](working-with-stamity.md) covers the touchpoints, and the
[`st-unattended` skill](../content/skills/st-unattended/SKILL.md) is the text the run follows. The
vendor facts below are rows of the [capability matrix](capability-matrix.md)'s cloud table, each
with the vendor page it was read from and the date; this page names no vendor address.

## What asks, and what refuses

A run is unattended only by declaration: `--unattended` on the touchpoint, or `STAMITY_UNATTENDED`
set to any value but empty, `false` or `0`. A cloud's own marker means "cloud", never "unattended".

- **An unattended run asks nothing.** Each question takes its declared default, written into the
  record as `Default applied:`, and a question with no default stops the run. It pushes only
  through the run verbs, `stamity run checkpoint` and `stamity run end`: the shell guard refuses a
  raw `git push`, `gh pr create` or `gh pr edit`, and every person-only act, on every client.
- **Attended, Claude Code asks for one click** on a person-only act that can be undone, such as a
  merge, a push of a tag or of the default branch, a ready-for-review mark, a release, a publish, or
  a secret or protection write, and the agent runs it on yes. It refuses instead where a sub-agent
  runs the act, and in Claude Code's `auto` permission mode.
- **Attended, Copilot CLI asks too, for your own agent alone.** The guard asks only for a call that
  carries no helper agent's fields and whose session id Copilot's session start recorded; a helper's
  call is refused. Copilot CLI 1.0.98 showed its hook permission dialog and waited for the person
  (measured 2026-10-19). Its experimental assisted mode can hand the ask to an LLM judge, which may
  approve it without you, and a hook cannot see that mode, so leave it off if the click must be yours.
- **Cursor and Codex refuse** that act and hand you the exact command. Cursor ran a command despite
  an ask under `--force`, and its hooks page says the ask is not enforced; Codex's hooks page says an
  ask is not honoured.
- **Every deletion and every force push is refused on every client**, attended or not, with a click
  or without one.

[SECURITY.md](../SECURITY.md) has the full person-only table and what the guard cannot read.

## What every cloud needs

- **The setup on the default branch.** Commit what `init` and `sync` write, as
  [getting started](getting-started.md) says, so a fresh clone in the cloud carries the hooks.
- **The CLI.** A run calls `npx --no stamity <verb>`, an installed copy, and falls back to the
  pinned version the setup was generated with. With neither, it refuses:
  `Refused: the stamity CLI is not reachable`.
- **Protection the run's account cannot get past.** The run's first act is
  `stamity gate preflight --unattended`, and its `direct-push` check reads, over GitHub's REST API,
  whether the account the cloud's `gh` acts as can push to the default branch. It refuses unless
  the account cannot. Those reads go through `gh`, so the cloud needs `gh` installed and signed in,
  and they prove something only when every URL git pushes origin to goes out as that account: over
  https with gh's credential helper the only helper for origin and no `Authorization` extra header,
  or through Claude Code's cloud proxy. Otherwise the check does not pass, and its fix names the git
  configuration to set. For an account without admin, an active ruleset or classic protection that
  requires a pull request, with no direct-push bypass for that account, counts. For an account that
  administers the repository, only an organization ruleset counts. An account with no push right
  at all is refused too, since the run could not push its own branch.
- **A plan the ready check passes.** `stamity plan check` must exit 0 on the plan and the contract
  before the run frames anything.

## Claude Code on the web

### Set it up

Start one repository per session: a session holding several repositories loads none of their
hooks, and the pre-flight's `hooks-loaded` check refuses it. Set `STAMITY_UNATTENDED=1` in the
cloud environment. The setup ships a readiness hook for this cloud. Where `CLAUDE_CODE_REMOTE` is
`true` it marks the session's hooks loaded and runs `npm ci` when `node_modules` is missing and a
lockfile is there. Locally it does nothing. The GitHub proxy refuses GraphQL, so `gh pr` and
`gh issue` fail there; the run verbs open and update the draft pull request over REST. A machine
that was reclaimed comes back fresh, and the review gate rebuilds its round counter from the run
record on the branch.

### Protect the default branch

The proxy refuses a tag push and a branch deletion, but not a branch push, the default branch's
included. So branch protection or a ruleset is the only thing that keeps a run off the default
branch, and the pre-flight's `direct-push` check refuses to start a run without it.

### Secrets

The run needs no secret of its own: it acts as the cloud's GitHub connection. An MCP server's
credential is read as `${VAR}` from the session's environment. `.env.mcp` is git-ignored, so set the
variable in the cloud environment, never in a committed file. The pre-flight warns `token-env`,
naming each credential-shaped variable it sees, by name only.

### Start a contract run

In a new cloud session on the repository, send
`/st-work --unattended docs/plans/<file>.md (run contract: <path>)`. The run runs the pre-flight,
then `stamity plan check docs/plans/<file>.md --contract <path> --json`, and any exit but 0 is a
refusal.

### The morning walk

The draft pull request's body is the morning list. A question Claude asks holds the session idle
until someone answers, and an unattended run asks none. If the session is still open, the run ended
on `run end --final-round` and asks one final round there. The variable is still set, so each held
act comes to you as the exact command. Or walk it locally: `/st-work --resume <run-id>` on the run's
branch, where in Claude Code each held act that can be undone asks for your click.

## Cursor's cloud agents

### Set it up

Cursor's cloud agents run the repository's `.cursor/hooks.json` command hooks, except
`sessionStart`, `sessionEnd` and the MCP hooks. So for Cursor the setup adds three things. The
root `AGENTS.md` ends on a "Cursor Cloud specific instructions" block: what `/st-<id>` means,
`node --version` first, and the pull request kept a draft. A `postToolUse` hook prints the session
index once per conversation. A `stop` hook keeps an unattended run going while its record leaves
units. `stamity check`'s `cloud-install` row prints the install lines, `node --version` and then
the CLI's global install at the version that generated the setup. Put them in the install step of
the environment you saved in Cursor, with `STAMITY_UNATTENDED=1`, and give that environment a `gh`
that is signed in and is origin's only credential helper, which the pre-flight's `direct-push`
check needs. `init` and `sync` write no
`.cursor/environment.json`, because a repository file replaces every environment saved there.

### Protect the default branch

The push Cursor's agent makes is the platform's, not a shell call, so no shell guard sees it. The
remote's protection is what holds, and the pre-flight's `direct-push` check refuses to start a run
without it.

### Secrets

An MCP server's credential is read as `${env:VAR}`. Set it in the saved environment's secrets, never
in a committed file. The pre-flight's `token-env` warning names each credential-shaped variable,
by name only.

### Start a contract run

Start a new cloud agent on the repository with
`/st-work --unattended docs/plans/<file>.md (run contract: <path>)`. The run runs the pre-flight,
then `stamity plan check docs/plans/<file>.md --contract <path> --json`, and any exit but 0 is a
refusal. The session line names a Cursor cloud agent, and in a managed run the agent asks nothing
and takes each declared default.
Cursor's page does not say whether the pull request its agent opens is a draft, so the run opens its
own draft through the run verbs and never marks it ready.

### The morning walk

Read the morning list in the draft pull request's body, and answer the way its
`## How to answer` section names. Cursor's guard refuses every person-only act rather than asking,
so each held act comes to you as the exact command, the morning walk included. Locally,
`/st-work --resume <run-id>` on the run's branch walks the same list.

## Copilot's cloud agent

### Set it up

The cloud agent uses a hooks file only when it is on the default branch, so `.github/hooks/`
must be on the default branch before the first run. `copilot-setup-steps.yml` installs the CLI;
the agent's environment also needs a `gh` that is signed in and is origin's only credential
helper, which the pre-flight's `direct-push` check needs.
A prompt file is not run by name on this agent, so the setup writes a thin entry agent,
`.github/agents/stamity-run.agent.md`, that points at `/st-work`'s prompt file and the plan the
issue names. While that agent is not yet on the default branch, the run writes a
`## Prerequisites` row naming it.

### Protect the default branch

The agent pushes to one branch and opens a draft pull request, and cannot mark it ready, approve it
or merge it. The run still starts only past the pre-flight, whose `direct-push` check reads the
account the agent's `gh` acts as and refuses without protection. Workflows on its pull request wait
for a write-access person's approval unless the repository lets them run, so the proof block then
reads `CI not run: awaiting approval`.

### Secrets

An MCP server's credential is read as `$COPILOT_MCP_<VAR>`. Set it in the agent's environment,
never in a committed file. The pre-flight's `token-env` warning names each credential-shaped
variable, by name only.

### Start a contract run

Assign the agent an issue, with the `stamity-run` agent, whose text is
`/st-work --unattended docs/plans/<file>.md (run contract: <path>)`. The run runs the pre-flight,
then `stamity plan check docs/plans/<file>.md --contract <path> --json`, and any exit but 0 is a
refusal. Each session stops at 59
minutes, so a long plan runs as a chain of sessions, each ending in a pushed checkpoint. A
write-access person's `@copilot continue` on the pull request starts the next one, which resumes
from the committed record. Copilot's unattended facts are documented and not run: no person check
has run them, for want of a Copilot cloud-agent account.

### The morning walk

Answer in one comment on the pull request, `@copilot answers: Q1→2, Q3→1`. Only a `write` or
`admin` author's comment answers; anyone else's is listed on the next morning list, not applied.
Copilot's documentation says its cloud agent denies a hook's ask, since nobody is there to click it,
so each held act comes to you as the exact command.

## Codex Cloud

Its page documents no project hooks, so assume none run there. No guard writes the pre-flight's
canary, `hooks-loaded` fails, and an unattended start is refused. Run Codex locally.

## Claude Code's GitHub Action

The Action runs Claude Code as a GitHub Actions job, and a job on a GitHub-hosted runner is stopped
and failed at 6 hours of execution time (documented). It is a surface for a short task, one unit
rather than a plan, and never an overnight surface. Its page names no question tool among the tools
a run is given by default, and nobody sits in the job to answer one. That it has none rests on the
page's silence (not documented), so a run there takes its declared defaults.

On a pull request, the Action restores `.claude/`, `CLAUDE.md` and the other Claude configuration
paths from the base branch before Claude starts (documented). Stamity's own entries in the restored
`.claude/settings.json` run copies of its hook scripts under `.claude/hooks/stamity/`, beside the
copy of the agent tool policy document the guard reads, so the restore covers them too: on that run
Stamity's own hooks run the base branch's scripts, and a pull request cannot change what the guard
runs on its own Action run. The copies under `.stamity/generated/hooks/claude/` are still written,
for the session start the charter has a session run by hand where no hook ran; no hook entry runs
them. That holds only until the base branch carries a `sync` that writes those copies. Before it, the base branch's
entries run the scripts under `.stamity/generated/hooks/claude/`, and those come from the pull
request.

What the restore does not cover still comes from the pull request. The base branch's `CLAUDE.md`
imports `AGENTS.md`, which the restore does not cover, so the agent on that run reads that pull
request's `AGENTS.md`. What the hook scripts read from the rest of the checkout, the run records
and the learnings under `.stamity/`, are that pull request's too. And hooks of your own and hooks a
pack supplies are wired into the same settings but run scripts outside `.claude/`, at their own
paths, so those scripts come from the pull request, and the Action runs them with its token. Run the
Action on a pull request only when you would let its author change the charter. Before you run it on
pull requests from outside, keep such scripts under `.claude/`, or drop them.

The restore has one limit the Action names as its own, in its source rather than its documentation
(read 2026-10-19). A pull request that changes `.claude/` sees that change reverted on the Action's
run, so its new hooks and settings do not run there. And when the agent on that run commits with
`git add -A`, the revert goes into that commit, onto the pull request's branch.

## The run contract

A run contract is a committed YAML file that states, by reference, what one unattended run is for.
No trigger reads it yet: you start the run and name the file. The engine reads it strictly. An
unknown key at any level is refused, and so is every defect, all in one pass.

```yaml
run-contract: 1
plan: docs/plans/042-search-index.md
item: "#412"
base: 02e040eb
acceptance: |
  The search index rebuilds in under a minute, and its tests pass.
scope:
  in: [src/search/, test/search/]
  out: [src/auth/]
prerequisites:
  - { name: the staging index, state: done }
  - { name: the search service credential, state: owned, owner: "@ops" }
budget: { stop-by: "2026-10-20T06:00:00Z", max-units: 6 }
answerer: "@maintainer"
preview: stop
move: off
```

- `run-contract` is the version, `1`. Any other is refused, naming version 1.
- `plan` is a repository-relative plan path and `item` a board item or issue. A contract names one or
  both.
- `base` is the commit the run starts from, 7 to 64 hexadecimal characters.
- `acceptance` is kept verbatim.
- `scope` lists the paths the run works `in` and keeps `out` of.
- `prerequisites` are each `done`, or `owned` by a named `owner`.
- `budget` holds `stop-by`, a day or a time with its offset, and `max-units`.
- `answerer` is who answers the morning list.
- `preview: stop` and `move: off` are fixed, and an absent key reads the same. A run under a
  contract stops at a board write's preview and moves no card: each write it would make is a
  morning-list row.

The ready check is the start check: `stamity plan check docs/plans/<file>.md --contract <path>`.
It reports a contract defect as `contract`, a prerequisite neither done nor owned as
`prerequisite-open`, and a contract whose `plan` names none of the plans checked as
`contract-mismatch`. Any exit but 0 refuses the run. The engine checks the file's shape and its
plan. The budget, the scope and the acceptance are the run's instructions, which it follows as
text, and the draft pull request's diff is where you check them.

### What a run leaves

- A branch, `stamity/<run-id>`, whose commits the run verbs made, each subject
  `chore(run): checkpoint <run-id>`.
- The record, `.stamity/runs/<run-id>/record.md`, opening on `Mode: unattended`, `Branch:` and
  `Base:`.
- One draft pull request whose body is `.stamity/runs/<run-id>/morning.md`: `## For you to check`,
  `## Decisions`, `## Prerequisites`, `## Person's calls held`, `## Not done:` and
  `## How to answer`.
- A change to a held path, such as a CI workflow, the hook configuration or the charter, never
  reaches the pushed tree. It waits in `.stamity/runs/<run-id>/held/person-only.patch` as a row of
  `## Person's calls held`.

### When it stops

- **Refused.** The pre-flight or the ready check refused, and the morning list opens on
  `## Refused`, the pull request titled `Refused:`. A refusal before the run's branch exists is one
  reply on the start surface instead.
- **Blocked.** A question with no declared default stops at `BLOCKED_AMBIGUITY`. A usage limit stops
  at `BLOCKED_DEPENDENCY` naming the reset: the record stays in progress, and the next session on
  the branch continues it.
- **Not pushed.** A run verb that exits 1 keeps its `Not done:` lines for the morning list, such as
  `Not done: draft PR not opened`, and is never retried with a raw push or a force.
- **No CLI.** A run whose CLI stops answering closes its record and ends on
  `Not done: run end not run — CLI unavailable`.

## How this page stays current

Each release re-reads the vendor pages the capability matrix's cloud table cites, and a page that
changed since its read date re-owes that cloud's person check at the next release. The container
leg, CI's `cloud-container` job, runs on every full CI run. The hook-fire check runs nightly where
its secrets exist; no release-prep job runs it. At release prep the release checklist runs
`scripts/qa/hook-runs.mjs --ask` by hand, with a person's one-minute check in an interactive
Claude Code session beside it. The person checks, one unattended run per cloud in a scratch
repository, run with `scripts/qa/cloud-check.mjs`, and the capability matrix reads "not run" for a
fact no person check has run.
