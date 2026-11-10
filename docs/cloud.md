---
title: Cloud runs
---

<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.18.0 release cut (2026-11-09). -->
<!-- Re-open when: a row of `CLIENT_CLOUD_FACTS` moves, a run contract key or a pre-flight check
     changes, or a client's answer to a person-only act moves. `test/docsPages.test.ts` holds this
     page to the hand-page contract, the contract parser and that table; a vendor page that changed
     is caught by the release checklist's re-read of the pages the table cites, not by a test. -->

# Cloud runs

This page is for you if you want a planned change to run in a vendor's cloud. On Claude Code on the
web and Cursor's cloud agents it can run through a night with nobody there. Copilot's cloud agent
runs it as a chain of sessions, stopped at 59 minutes when they run on GitHub Actions, and a person
continues each one, so it is no night with nobody there. In real runs so far, several sessions on
Claude's cloud and three on Cursor's, neither Claude's nor Cursor's has merged: Claude's reached a draft
pull request with green CI on 2026-11-06, and Cursor's stopped at or before the pre-flight on 2026-11-08, as each cloud's section says. For each cloud it gives the setup, the branch protection the run needs before it starts, the secrets, how to start a run under
a run contract, and the morning walk. Then it covers Claude Code's GitHub Action, which is a short
surface rather than an overnight one, the run contract itself, and the parts that take a ready item
through to a merge: the label, the review tool, auto-ship and the land job.

The run is an ordinary touchpoint, usually `/st-work`, in unattended mode.
[Working with stamity](working-with-stamity.md) covers the touchpoints, and the
[`st-unattended` skill](../content/skills/st-unattended/SKILL.md) is the text the run follows. The
vendor facts below are mostly rows of the [capability matrix](capability-matrix.md)'s cloud table, each
with the vendor page it was read from and the date; a fact with no row gives its read date where it
stands. This page names no vendor address.

## What asks, and what refuses

A run is unattended only by declaration: `--unattended` on the touchpoint, or `STAMITY_UNATTENDED`
set to any value but empty, `false` or `0`. A cloud's own marker means "cloud", never "unattended".

- **An unattended run asks nothing.** Each question takes its declared default, written into the
  record as `Default applied:`, and a question with no default stops the run. It pushes only
  through the run verbs, `stamity run checkpoint` and `stamity run end`: the shell guard refuses a
  raw `git push`, `gh pr create` or `gh pr edit`, and every act on the ask list, on every client.
  After `run end`, when the morning list holds no blocked or refused item, it runs
  `stamity run land --ready`, which marks the run's own draft ready and merges it only when the
  evidence holds: every required check run green on the exact head commit
  (commit statuses do not count), no unresolved review thread, and no open Critical or Warning row
  in the run's ledger, with the branch's own protection deciding any required human review. Where
  `autonomy.reviewTool` names a tool, that tool's clean word on the same head is evidence too, and
  silence holds the merge, a hand-written `clean: reaction` being [the exception](#the-review-tool). A diff to the CI definitions or the guard's own files still asks, a
  required check failing on the default branch's tip asks (the brake), a closed review thread that
  someone beside its closer and the run wrote in asks, so a person merges that pull request by hand, and an asks or refused outcome
  leaves each reason as a held row on the morning list and in the pull request's body, unless the
  land stopped before it could write there. A raw ready mark, a raw merge and a raw push to the
  default branch stay refused. `run land` is not the only
  caller of this evidence: [the land job](#the-land-job) reads it again from GitHub where a cloud cannot
  finish, with limits of its own.
- **What runs without a click.** In `autonomy.mode: autonomous`, the default, a ready-for-review
  mark, a local tag and a workflow dispatch run unasked on Claude Code's and Copilot CLI's main
  thread, and never for a sub-agent. Cursor and Codex refuse them in every mode, since their hook
  payloads name no agent and no call can be shown to be the main thread's. In a run nobody watches a
  raw ready mark stays refused, while on Claude Code and Copilot CLI a local tag and an unnamed
  dispatch run, so name
  `workflow-dispatch` in `autonomy.deployingActs` if a dispatchable workflow releases or deploys. The
  run's own merge goes only through `run land`, which runs on every client. Everything else on the ask list still asks: a raw merge, a
  push of a tag or of the default branch, a release, a publish, a secret or protection write, an
  `--admin` merge, a write to another repository or a mention of a person, a `learn accept`, and a
  loosening of the setting. To tighten back to 1.16.0's asks, set `autonomy.mode` to `ask` and run `sync`. To name
  what deploys, set `autonomy.deployingBranches` to the branches a push to which deploys (the
  default branch included, so the land verb asks before it merges there, unless the change fits
  `autonomy.autoShip`) and `autonomy.deployingActs` to the acts that ask in every mode; `stamity
  check` warns on a workflow that deploys from a branch the list leaves out. Loosening either needs
  the person's `--loosen`. Attended, `autonomy.unaskedPushRepos` can also lift the ask on a push that
  names one branch on its line to a repository it names, on the main thread of Claude Code or Copilot
  CLI alone and never while nobody watches;
  [SECURITY.md](../SECURITY.md) states its rules.
- **Attended, Claude Code asks for one click** on an act on the ask list that can be undone, such
  as a raw merge, a push of a tag or of the default branch, a release, a publish, or a secret or
  protection write, and the agent runs it on yes. It refuses instead where a sub-agent runs the
  act, and in Claude Code's `auto` permission mode.
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
- **Nobody watching is a switch of its own.** Set `STAMITY_NOBODY_WATCHING` to any value but empty,
  `false` or `0` when you launch the session, or run `stamity away on`, and every ask the guard would
  put to you is refused instead and kept on the held list, `.stamity/away-held.jsonl`, with the time,
  the rule and the act. `stamity away status` and `stamity run overview` show it. On Claude Code the
  question tool is refused too. It is not unattended mode: push rules and the pre-flight stay as they
  are, and what ran unasked still runs. `stamity away off` removes the marker; the variable holds
  until a launch without it. Your client's own permission prompts are not the guard's, so the switch
  does not remove them: The same steps locally in [The factory](factory.md) says what does.

[SECURITY.md](../SECURITY.md) has the full person-only table and what the guard cannot read.

## What every cloud needs

- **The setup on the default branch.** Commit what `init` and `sync` write, as
  [getting started](getting-started.md) says, so a fresh clone in the cloud carries the hooks.
- **The CLI.** A run calls `npx --no stamity <verb>`, an installed copy, and falls back to the
  pinned version the setup was generated with. With neither, it refuses:
  `Refused: the stamity CLI is not reachable`. The fallback helps only where the pinned version holds
  the verbs the run calls, and a setup pinned to an older release may not. The pre-flight cannot show
  that: its `cli-pin` row compares version numbers alone, so a tarball and the published copy of one
  version both read `pass`.
- **Protection the run's account cannot get past.** The run's first act is
  `stamity gate preflight --unattended`, and its `direct-push` check reads, over GitHub's REST API,
  whether the account the cloud's `gh` acts as can push to the default branch. It refuses unless
  the account cannot. Those reads go through `gh`, so the cloud needs `gh` installed and signed in,
  and they prove something only when every URL git pushes origin to goes out as that account: over
  https with gh's credential helper the only helper for origin and no `Authorization` extra header,
  or through Claude Code's cloud proxy. Otherwise the check does not pass, and its fix names the git
  configuration to set. For an account without admin, an active ruleset or classic protection that
  requires a pull request, with no direct-push bypass for that account, counts; a classic
  pull-request bypass that lists any team or app does not, since nothing proves the account is not
  in it. For an account that administers the repository, only an active organization ruleset
  counts, only one whose branch target is `~ALL` or the default branch by its own name, with no
  exclude that could match it, and whose repository target is this repository's id or every
  repository by name (not `~DEFAULT_BRANCH`, a name pattern or a property), and only while the
  account is a plain member of the organization, never an owner. `autonomy.adminRuleProof` is a
  person's opt-in past that: on in every leg of the setting, a repository or organization ruleset
  that binds the account now counts too, where GitHub says the account cannot bypass it, and the
  verdict carries the warning `admin-can-lift`. Classic protection still does not count. The account
  could still lift the rule, and only the guard stops that. A refusal's evidence names the
  rulesets and protection it read and why none counted. An account with no push right at all is
  refused too, since the run could not push its own branch.
- **A plan the ready check passes.** `stamity plan check` must exit 0 on the plan and the contract
  before the run frames anything.

## Claude Code on the web

### Set it up

Start one repository per session, outside a project: in an Anthropic-hosted environment, a session
holding several repositories loads none of their hooks, a project's cloud thread loads none whatever
the number of repositories, and the pre-flight's `hooks-loaded` check refuses either. A self-hosted
environment goes by its runner's settings. Set `STAMITY_UNATTENDED=1` in the
cloud environment. The setup ships a readiness hook for this cloud. Where `CLAUDE_CODE_REMOTE` is
`true` it marks the session's hooks loaded and runs `npm ci` when `node_modules` is missing and a
lockfile is there. Locally it does nothing. The GitHub proxy refuses GraphQL, so `gh pr` and
`gh issue` fail there; the run verbs open and update the draft pull request over REST. `stamity run
land` reads the review threads and marks a draft ready over GraphQL, so on this cloud it cannot
land. It refuses with `the review threads could not be read`. The pull request stays a draft. That
refusal comes before the land can write on the pull request, so its body gets no
`merge waits on:` line. [The land job](#the-land-job) is built to finish it from GitHub, and lands
only a run that ended with the job turned on. On 2026-11-06 it did not: it answered `not-a-run`,
since it then read the run from a marker that had to end the pull request's body, and this cloud
added a "Generated by Claude Code" footer after it. Every reader of the marker now finds it when only
a footer follows it: a "Generated by …" or "Generated with …" line, or a line that is only a link.
Any other text after the marker still reads as no run. No real run has shown this yet, so no route
has landed a run on this cloud. For any other run, see
[A held pull request from a cloud run](#a-held-pull-request-from-a-cloud-run). A machine
that was reclaimed comes back fresh, and the review gate rebuilds its round counter from the run
record on the branch.

The environment needs a Node of at least the CLI's engines floor, 22.22.2: on 2026-10-19 the
cloud's own Node was 22.22.0, and the pre-flight's `node-engine` check refused it. On 2026-11-06 it
was 22.23.4, which passes. Also run `gh auth setup-git` inside the session, before the pre-flight,
so that `gh` is origin's credential helper: by default git pushed origin over https with no
credential helper, and `direct-push` refused. The setup script is too early for it. On 2026-11-06 a
setup script's `gh auth setup-git || true` left the session with no credential helper, and
`direct-push` refused. Claude's cloud environments page, read 2026-11-08, says the setup script runs
before the session sets the environment's variables, which fits that. Run inside the session, it
exited 0, and `direct-push` then passed over https with gh's credential, so the start prompt in
[The factory](factory.md) runs it first. In that session origin was the repository's plain GitHub
https URL, with `https_proxy` pointing at a local port.

One full run went through on 2026-11-06, started by a label. The pre-flight passed, the run pushed
through the run verbs and opened a draft pull request authored by the task owner's account, and CI
was green on every head. It did not land. Its test-runner sub-agent returned no result, so the test
gate read unknown and the run ended blocked. Its `morning.md` did not parse, so the morning comment
carried none of it. And the land job answered `not-a-run`, as above. Each failed closed.
[The factory](factory.md) has the detail.

### Protect the default branch

The proxy refuses a tag push and a branch deletion, but not a branch push, the default branch's
included. So branch protection or a ruleset is the only thing that keeps a run off the default
branch, and the pre-flight's `direct-push` check refuses to start a run without it. The land job
merges through the same rules, with no bypass.

### Secrets

The run needs no secret of its own: it acts as the cloud's GitHub connection. Nor does `gh` need a
sign-in from you. Claude's cloud environments page, read 2026-11-05, says `gh` is already installed,
and that with `GH_TOKEN` and `GITHUB_TOKEN` both unset the proxy puts your own credentials on `gh api`
calls for the session's repositories. Leave both unset, since a token you set goes to `gh` as it is,
and the run's reads then speak for that token's account. The same page, read 2026-11-08, says the
setup script runs before the session sets the environment's variables, so run `gh auth setup-git`
in the session, as Set it up says.

The proxy does not answer every read the pre-flight makes. In one real session on 2026-11-06 it answered
403 on every `collaborators` path and on `user/memberships/orgs/<org>`, and 404 on
`branches/main/protection`. It answered 200 on `user`, the repository, its branch rules, a ruleset, an
issue and that issue's events, and 204 on `assignees/<login>`. That is what one session read, not a
promise from Claude. So where the permission read answers 403, the pre-flight and `run contract` take
the repository's `permissions` for the account the run acts as, and only for a person who is that
account. On 2026-11-06 the start prompt's permission read answered 403, and its 403 branch passed on
the task owner's own label. On this cloud only the task owner's label can start a run: anyone else's
label stops it, and so does an issue someone else wrote. A first run may also refuse on `direct-push` where the block
rests on classic protection, or for an administrator on an organization ruleset.

In that session `user` named the person and the repository's `permissions` read admin true. So the
`user` read spoke for the person, but a person's rights and an app's would read alike for an account
holding admin. The 403 fallback was read only for such an account, and a task owner under write has
not been measured. Its reach is that owner alone, in their own session. Behind Claude's proxy the
pre-flight binds the push to gh's credential over https, or to the proxy connection where origin is
the proxy's own URL, and neither shows which account a push goes out as. `SECURITY.md` names both
as residuals.

An MCP server's
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
branch, where in Claude Code each held act that can be undone asks for your click. A local walk
answers the list but cannot land the run: see
[A held pull request from a cloud run](#a-held-pull-request-from-a-cloud-run).

## Cursor's cloud agents

### Set it up

Cursor's cloud agents run the repository's `.cursor/hooks.json` command hooks, except
`sessionStart`, `sessionEnd`, the MCP hooks, `beforeTabFileRead`, `afterTabFileEdit` and
`workspaceOpen`. So for Cursor the setup adds three things. The
root `AGENTS.md` ends on a "Cursor Cloud specific instructions" block: what `/st-<id>` means,
`node --version` first, and the pull request kept a draft until `stamity run land --ready` marks it
ready. A `postToolUse` hook prints the session
index once per conversation. A `stop` hook keeps an unattended run going while its record leaves
units. `stamity check`'s `cloud-install` row prints the install lines, `node --version` and then
the CLI's global install at the version that generated the setup. Put them in the install step of
the environment you saved in Cursor, with `STAMITY_UNATTENDED=1`, and give that environment a `gh`
that is signed in and is origin's only credential helper, which the pre-flight's `direct-push`
check needs. The saved environment's origin URL must not carry credentials: in that install step,
set origin's URL, and its push URL where one is set, to the repository's plain https URL, then run
`gh auth setup-git`. The first check showed why: on 2026-10-19 Cursor's origin push URL carried its
own credentials, which cannot be tied to `gh`'s identity, and `direct-push` refused.

That was not enough on 2026-11-08, in a run a label started. `npm ci` and `gh auth setup-git` passed,
and every pre-flight check passed but `direct-push`: the origin URL and the URL rewrites in
`~/.gitconfig` carried Cursor's own login, so the push could not be tied to `gh`'s identity. The
agent also reported `gh` as read-only, even with a `GH_TOKEN` runtime secret set. That is its own
report, not checked. A start prompt that cleared the rewrites was refused by the person-only guard,
which refuses a remote write while a run is unattended, as it should. The same lines in the
environment's start script did not hold: the rewrites were still there when the run started. So on
this cloud a run reaches the pre-flight and refuses at `direct-push`, and no push has been seen
there. Cursor's cloud pushes with its own login, written into origin's URL and `~/.gitconfig`, and
the pre-flight never ties a login carried in a URL to `gh`'s account, by design, so on Cursor's
cloud it refuses `direct-push`. `init` and
`sync` write no `.cursor/environment.json`. Cursor uses a personal or team environment saved in its
settings before a repository file, and a saved environment reads that file only when its
environment.json location points at it (Cursor's cloud agent setup page, read 2026-10-26).

### Protect the default branch

The push Cursor's agent makes is the platform's, not a shell call, so no shell guard sees it. The
remote's protection is what holds, and the pre-flight's `direct-push` check refuses to start a run
without it. The land job merges through the same rules, with no bypass.

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
own draft through the run verbs and marks it ready only through `stamity run land --ready`, once the
evidence holds.

### The morning walk

Read the morning list in the draft pull request's body, and answer the way its
`## How to answer` section names. Cursor's guard refuses every person-only act rather than asking,
a ready mark and a local tag included, so each held act comes to you as the exact command, the
morning walk included. Locally,
`/st-work --resume <run-id>` on the run's branch walks the same list. It cannot land the run: see
[A held pull request from a cloud run](#a-held-pull-request-from-a-cloud-run).

## Copilot's cloud agent

### Set it up

The cloud agent uses a hooks file only when it is on the default branch, so `.github/hooks/`
must be on the default branch before the first run. `copilot-setup-steps.yml` installs the CLI
under `toolOptions.copilot.setupSteps: managed`, the default; with `user` or `off` the workflow is
yours to write, and a project Node pin below 22.22.2 gets a comment instead of the install. The
agent's environment also needs a `gh` that is signed in and is origin's only credential
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
refusal. A session that runs on GitHub Actions stops at 59 minutes, and Copilot's page states no
limit for a session in a cloud sandbox. Either way a long plan runs as a chain of sessions, each
ending in a pushed checkpoint. A
write-access person's `@copilot continue` on the pull request starts the next one, which resumes
from the committed record. Copilot's unattended facts are documented and not run: no person check
has run them, for want of a Copilot cloud-agent account.

### The morning walk

Answer in one comment on the pull request, `@copilot answers: Q1→2, Q3→1`. Only a `write` or
`admin` author's comment answers; anyone else's is listed on the next morning list, not applied.
Copilot's documentation says its cloud agent denies a hook's ask, since nobody is there to click it,
so an act the guard asks for does not run there. The denied ask tells the agent only that the act is
yours to approve, not to give you the command, so whether its reply names the command is up to the
agent: ask it for the command and run it yourself. Where the guard refuses instead (a helper agent's
call, or a session Copilot's session start did not record), the refusal tells the agent to give you
the exact command.

### Copilot's limits

- **Starting the agent from a workflow, read 2026-11-05.** GitHub documents starting the agent by
  API, through the Agent tasks API and through issue assignment, both in public preview, and those
  calls take a user's token. `GITHUB_TOKEN` is an installation token, so a workflow needs a token a
  person creates and stores, and Stamity emits no workflow for it. Reports say an assigned agent
  does not always start: weak evidence, one person each, the newest from 2026-06-22. GitHub's
  Copilot Automations list an issue `labeled` trigger as of 2026-10-28, and GitHub's pages disagree
  on which repositories qualify: a reading, not a run. The route reads `not run`, and it holds no
  release.

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
runs on its own Action run. The older copies under `.stamity/generated/hooks/claude/` are no longer
written: the upgrade's `sync` removes each one still as it wrote it and keeps and names one you
edited, and a session run by hand where no hook ran starts
`.claude/hooks/stamity/stamity-session-start.mjs`. All of this holds only once the base branch carries
a `sync` that writes the copies under `.claude/hooks/stamity/`. Before it, the base branch's entries
run the scripts under `.stamity/generated/hooks/claude/`, and those come from the pull request. That
leaves a window on the upgrade itself: on a pull request whose base predates 1.16.0, the base's
entries name the scripts that pull request's `sync` removed, so those hooks cannot start. From a
1.9.0 to 1.15.x base, the guard's entry, failing closed, refuses every tool call on that Action run.
Before 1.9.0 the guard's entry has no fail-closed tail, so the guard does not run on that Action run
and its tool calls go through unchecked. For a base older than 1.9.0, upgrade through 1.16.0 first,
whose settings already name the copies under `.claude/hooks/stamity/`, which stay, or keep the Action
off that one upgrade pull request. The next run after the upgrade merges reads the new entries.

What the restore does not cover still comes from the pull request. The base branch's `CLAUDE.md`
imports `AGENTS.md`, which the restore does not cover, so the agent on that run reads that pull
request's `AGENTS.md`. What the hook scripts read from the rest of the checkout, the run records,
the learnings and the resumable handoffs under `.stamity/`, are that pull request's too. And hooks of your own and hooks a
pack supplies are wired into the same settings but run scripts outside `.claude/`, at their own
paths, so those scripts come from the pull request, and the Action runs them with its token. Run the
Action on a pull request only when you would let its author change the charter. Before you run it on
pull requests from outside, keep such scripts under `.claude/`, or drop them.

The restore has one limit the Action names as its own, in its source rather than its documentation
(read 2026-10-19). A pull request that changes `.claude/` sees that change reverted on the Action's
run, so its new hooks and settings do not run there. And when the agent on that run commits with
`git add -A`, the revert goes into that commit, onto the pull request's branch.

## The run contract

A run contract is a YAML file that states, by reference, what one unattended run is for. You can
write one, start the run and name the file, or let `stamity run contract` write it from a ready item
([below](#from-a-label-to-a-contract)). The engine reads it strictly. An unknown key at any level is
refused, and so is every defect, all in one pass.

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
- `acceptance` is kept verbatim. `run contract` strips the issue's criteria before it writes them.
- `scope` lists the paths the run works `in` and keeps `out` of.
- `prerequisites` are each `done`, or `owned` by a named `owner`.
- `budget` holds `stop-by`, a day or a time with its offset, and `max-units`.
- `answerer` is who answers the morning list, as `@login` or `@org/team`. With the contract at
  `.stamity/runs/<run-id>/contract.yml`, where `run contract` writes it, the first `run end` with a pull
  request, `--refused` aside, also sends them a GitHub review request, with no text, unless they opened
  that pull request. A contract elsewhere sends none. A request that cannot reach them adds a `Not done:` line, and the run still ends.
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

- A branch whose commits the run verbs made, each subject `chore(run): checkpoint <run-id>`:
  `stamity/<run-id>` where the run started on the default branch or a detached `HEAD`, and
  otherwise the branch the session was given, a platform's own (`claude/…`, `cursor/…`,
  `copilot/…`) included. The pull request's head names it.
- The record, `.stamity/runs/<run-id>/record.md`, opening on `Mode: unattended`, `Branch:` and
  `Base:`.
- One draft pull request whose body is `.stamity/runs/<run-id>/morning.md`: `## For you to check`,
  `## Decisions`, `## Prerequisites`, `## Person's calls held`, `## Not done:` and
  `## How to answer`. Where the repository takes no drafts, it is a normal pull request titled
  `[DRAFT] <title>`. Where a pull request this run did not open is already open from the branch
  into the base, a person's or the platform's, the run posts the body on it as one comment.
- Where the run's contract names an issue in origin's repository as `owner/repo#<n>`, a
  `Closes <owner>/<repo>#<n>` line just before the run's marker in that body, so GitHub closes the
  issue when the pull request merges into the default branch. An item written as a bare `#<n>` gets
  no line, and `run end` says so under `Not done:`. No real run has merged yet, so this has not been
  seen, and for a merge the land job makes it is not known: check the issue after such a merge and
  close it by hand if it is still open.
- After a session's `run land` that lands, or finds the run landed, the run's clean-up: each lane
  `stamity worktree setup --run <run-id>` tagged with the run goes through `git worktree remove` with
  no force, the local `stamity/<run-id>` branch through `git branch -d`, and that branch's tracking
  ref once origin no longer has it. A lane with changes, an ignored file its setup did not place, or
  commits only its own `HEAD` holds is kept and named. Each act is one `cleanup:` line in the record,
  and a remote branch is never touched. The land job cleans up nothing.
- The land step's result: where the evidence held, the pull request merged by `stamity run land`
  and a `land:` line in the record, or the body's evidence line alone where the land job merged it; otherwise the pull request left open, its body saying
  `merge waits on: <reasons>` unless the land stopped before it could write there, and each reason a
  row of `## Person's calls held` in the session's own `morning.md`.
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

### A held pull request from a cloud run

`/st-work --resume <run-id>` on your own machine answers the morning list, but it cannot land a
cloud run. The run's record reads `Mode: unattended` on every machine, so `run land` needs the
pre-flight's record and the pull-request record, and both sit in the git folder of the machine that
ran the run. A fresh clone holds neither, and the walk runs no pre-flight, so `run land` refuses
there with `no pre-flight record`.

What you can do instead:

- **Merge it yourself on GitHub.** Read the evidence first: the checks on the head, the review
  threads, the run's ledger, and any `merge waits on:` line in the body. Mark a draft ready, then
  merge. Your branch's rules still apply, and stamity does not check this merge.
- **Start the land job by hand,** if it is on, with the pull request's number. It reads the evidence
  again and merges only if that holds. It lands only a run that ended with the job turned on, and it
  takes no approval, so anything that still asks stays held. On 2026-11-06 it was started by hand on
  a draft pull request from Claude's cloud. The workflow's steps all ran, but `stamity run land --job`
  stopped at its first read, of the pull request's body, with `not-a-run`, since Claude's cloud adds
  its footer after the run's marker in the body. So the job's evidence reads and its merge were not
  exercised. So a hand start has run, but it has not landed.

## From a ready item to a merge

These parts are each off until you set them up. Each works without the others. No real run has
landed through any of them yet. The label started a run on each cloud, and the land job ran once and
answered `not-a-run`, as below. For the rest their tests use fixtures, so read each as `not run`.

### From a label to a contract

The ready signal is the label `stamity:ready` on a GitHub issue. The board never creates a label, so
a person creates it once. A run started from such an issue reads only its `Branch:` line, switches to
that branch, and runs `stamity run contract --run <id> --item <owner/repo#n>`. The verb writes
`.stamity/runs/<id>/contract.yml`, and the ready check then runs as usual. The issue's text is data.

The verb refuses unless the item is an open issue in origin's repository that carries the label,
and its author and the last person to apply the label each hold write or admin. It also refuses when
the current branch is not the item's, or the plan's hash differs from the item's. That hash detects
drift only: a person with write access may name any plan committed on the branch. The criteria lose
control and invisible characters and HTML comments, are cut at the next heading, are held to 16,384
bytes, and are scanned before anything is written. A comment opener with no closer refuses. A dropped
comment is counted, and a run that sees a count above zero refuses to start, since a visible criterion
may have gone with the comment: edit the issue, close the `Refused:` draft, and label it again. On
Cursor's **Issue label changed** trigger a quick label off and on is two events, which can start two runs on one branch,
so follow check 7 under When nothing fired in [The factory](factory.md).

What starts the run is the vendor's. As read on 2026-11-05, Claude Code's scheduled tasks can start
on an issue's `labeled` action once the Claude GitHub App is installed. Claude's page shows filters
for pull requests only, and says events over its hourly caps are dropped. In several sessions on
2026-11-06 the label started a task that way, and the page showed no label filter for issues.
Cursor's automations page, read 2026-11-08, names an **Issue label changed** trigger, for a label
added to or taken off an issue, with no label filter, and a webhook trigger. On that date the
automation's own screen offered **Label Added** under Issues, with a filter for one label, and in three
sessions the label started the agent through it. None of these runs has merged, as
[The factory](factory.md) says. Both rows of the [capability matrix](capability-matrix.md)'s cloud
table now name these sessions as their person check, with their dates.

### The review tool

With `autonomy.reviewTool` set, `run land` asks the named tool to review the head, at most once per
head, and waits for it. Only that bot's own word on the exact head passes. Under a hand-written `clean: reaction` that does not hold: a `+1` names no commit, so one left on an earlier head reads clean on every later head, and no request is sent. Findings, no result within
`waitMinutes`, spent `rounds` or a block it does not know each hold the merge and say why, and
silence never passes. A wait longer than one `run land` call comes back as a pending
outcome, and the run calls the land line again, since no approval passes a wait. Once the tool reads
clean on the head, `run land` resolves the threads the tool opened and no person joined, never a
person's, and a `clean: reaction` tool resolves none.

The fix rounds are Cursor's cloud's and a local run's. There the session's `run land` is meant to read
the tool, so on findings the run takes them through `/st-pr-resolve` and calls the land line again,
which can ask the tool on the new head. Neither has been proven by a real run. Unattended,
`/st-pr-resolve` fixes only the mechanical class: a fix in one file with no change in behaviour, such
as a typo, an unused import or a comment's wording. It defers any other finding as
`needs a planned run`, so while the tool still reports one the pull request holds for you. `rounds`
counts the heads that carry the run's review marker, the first among them, so at most one fewer get a
fix, and `rounds: 1` gives none, since a finding on its one head reads as spent.

On Claude's cloud the review tool holds and no fix round runs. The session's `run land` refuses on the
review threads before it reads the tool, so with no land job stamity never asks the tool. The land job
is built to ask it and fix nothing: it writes the
reason on the pull request's `merge waits on:` line and exits 0, so the pull request waits for you.
It now finds the run's marker before this cloud's footer, which no real run has shown yet. To clear a finding there, run `/st-pr-resolve` on the pull
request from your own machine. A fix it pushes goes to the run's branch, and once your CI finishes
well on that head the land job can ask the tool again, if a round is left. With no round left the reason
reads `review rounds spent`, and [Troubleshooting](troubleshooting.md) says what a person does. On
either cloud, [A held pull request from a cloud run](#a-held-pull-request-from-a-cloud-run) says what
else you can do.

Limits: the Codex state comment this reads is not in Codex's documentation, so anything unknown reads
not clean. The state comment is read from real pull requests and proven only in tests: the full loop of request, wait, read and resolve is `not run`. A deleted state comment is not seen. A hand-written `clean: reaction` is the
weakest proof. Unattended, a bot of exactly that login counts as a `write` author for its own findings
alone, so its text can reach a fix with no person's comment behind it: the text stays data, and the fix
stays inside the files the pull request already changes and the plan's `files`.

### Auto-ship

By default a default branch named in `autonomy.deployingBranches` asks before every merge.
`autonomy.autoShip` lets `run land` merge there with nobody asked when a change fits every rule: its
file count, its line count, its classes, its paths where you set them, and no specialist lens. A
`docs`-class path must also end in `.md` or `.txt`. The `low-risk` preset allows 10 files and 200 lines,
all records, docs or tests. Any rule that fails, and anything that cannot be read, asks and names each
reason, except that a change over the file limit by GitHub's count stops there and names that alone. A fast-forward still asks, and so does an act `autonomy.deployingActs` names. Stamity never deploys, tags or releases itself, but a merge onto a deploying branch starts that repository's own pipeline, with nobody asked, by the person's opt-in. That is the point of auto-ship. Under the emitted `GITHUB_TOKEN`, a land job's merge starts no Actions `push` workflow. That is all it stops: a webhook or a GitHub App listening to the push still fires, and under any other token the workflow starts too.

Limits: the rules read paths, size and class, never content, so a script inside a `.md` file passes
them. If your site tool passes raw HTML through `.md` files, leave `docs` out of `classes`. The range
read needs git 2.41 or newer. The hunks
come from the clone: to fake them a run needs a raw write under `.git/`, and such a write moves nothing
GitHub supplies.

### The land job

`autonomy.landJob` writes `.github/workflows/stamity-land.yml`, a GitHub job built to finish a run's
land where its session cannot. It is off by default, and turning it on is a person's act. The job
starts when a workflow `landJob.workflows` names finishes well on a pull request, when the review
tool comments, or by hand with a pull request's number. Its concurrency group is one per pull request,
so one pull request's events never cancel another's. It runs `stamity run land --job`, the second
caller of the land evidence, and it merges through the same rules, with no bypass:

- **The evidence gates hold.** It reads the checks, the threads, the ledger, the merge state, the review
  tool and every ask as `run land` does, and merges only when they pass.
- **It gives up two things a session has.** It makes no compare of git's surface with a pre-flight's
  record, since no pre-flight ran, and it reads no local pull-request record. Its proof that a pull request is a run's own is text: the run's marker at the end of the pull request's body, before at most a client's short footer (three lines at most, each a "Generated by …" or "Generated with …" line or a line that is only a link), read on GitHub, and the `PR:` and `Login:` lines of the record at the head. So anyone who can push a branch and write those lines passes that one test. The evidence gates still hold.
- **It lands only a run that ended.** The record at the head must read `Status: closed`, with no
  `(blocked:` and no `## Refused` row. With the setting on, every `run end` that holds its own pull request, a `--refused` end aside, commits
  `PR:` and `Login:` lines at the head so the job can read them, attended or not, and that commit starts CI again. So the
  job can land an attended run that ended on `run end`. One closed through `run checkpoint --pr` alone
  has no such lines, so the job leaves it to a person.
- **A hold is a status line.** A job exits 0 on every normal end, and a hold shows as the pull request's status line, never as a red job. So a pending check, an ask and a refusal
  each write `merge waits on: <reasons>` and exit 0. Three ends leave no line: a run still in progress,
  a head a newer job speaks for, and a pull request that does not read as the run's own, such as one
  whose base someone changed. That last one is no wait: nothing lands it until a person puts it right,
  and its reason is only in the job's log. It exits 1 only for a true failure, a read or a write GitHub did not
  answer as it should, but a read that fails into a decision holds, with its line, and exits 0.
- **It can leave things behind.** A job that merges nothing can still leave the pull request marked
  ready, the tool's threads resolved and an evidence line in the body, since it does those before its
  last read or the merge call.
- **It treats the head as data.** The CLI installs by version before any head file exists, the checkout
  keeps no credential, and nothing from the head runs. So the job reaches only a version the registry
  serves: a tarball or a local pre-release build has no supported route to it. A hand edit of the
  install step turns `stamity check` red, and the next `sync` writes the step back.
- **It asks the review tool itself**, since a cloud that cannot run `run land` cannot post the request.
  It then waits out the tool's silence in the one call, since a silent tool sends no event to wake it,
  so it holds a runner up to `waitMinutes` per head.
- **It picks the merge method at run time.** The merge method comes from the ruleset or the repository at run time: the job takes the first of merge,
  squash and rebase that both the rulesets and the repository's settings allow, and a linear-history rule takes out
  merge. With none allowed, it holds. `--method` is refused in job mode.
- **It takes no approval.** `--approved` is refused in job mode, and the guard refuses that mode on any
  agent's line.

Limits: No real run has proven the land job, so the whole job is `not run` until one does. That covers the ready mark, the thread reads and the thread resolve under `GITHUB_TOKEN`, the merge call under that token, the review request and the status line the job writes, and the `issue_comment` wake. One real run reached the job, on Claude's cloud on 2026-11-06: it answered `not-a-run` at its read of the pull request's body, as Claude Code on the web says, so it made no read or write after that one. `GITHUB_TOKEN` is the emitted workflow's
configuration, not an engine check. A dispatch runs the file at the ref it names, not the default
branch's copy, and an unnamed dispatch runs unasked, so name `workflow-dispatch` in
`autonomy.deployingActs` to make it ask. `GITHUB_TOKEN` starts no Actions `push` workflow after the merge, so an
Actions deploy on push must not rely on this path, and a webhook or a GitHub App on the push still fires. Under the emitted token a job's merge starts no Actions `push` workflow, so the brake has no such run to read on that tip. A "Restrict updates" rule refuses the job,
and it is never given a bypass. List every required workflow in `landJob.workflows`: one left out
finishes with nothing to wake the job. The `land-job-workflows` row of `stamity check`, and the same
warning from `sync`, name a watched name no workflow carries, which is the only sign a renamed
workflow gives.

## How this page stays current

Each release re-reads the vendor pages the capability matrix's cloud table cites, and a page that
changed since its read date re-owes that cloud's person check at the next release. The container
leg, CI's `cloud-container` job, runs on every full CI run. The hook-fire check runs nightly where
its secrets exist; no release-prep job runs it. At release prep the release checklist runs
`scripts/qa/hook-runs.mjs --ask` by hand, with a person's one-minute check of each ask-class
client's interactive ask beside it, in an interactive Claude Code session and an interactive Copilot
CLI session. The person checks, one unattended run per cloud in a scratch
repository, run with `scripts/qa/cloud-check.mjs`, and the capability matrix reads "not run" for a
fact no person check has run.
