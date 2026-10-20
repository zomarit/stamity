---
id: cloud-runs-01
intent: feature
stamp: 02e040eb29de0468d90febe856ae205f31d6632d 2026-10-15
reads: [src/cli.ts, src/cli/kit/program.ts, src/cli/commands/ledger.ts, src/cli/commands/gate.ts, src/cli/commands/learn.ts, src/cli/commands/check.ts, src/cli/engine/gitStatus.ts, src/cli/docs/cliReference.ts, src/composition/root.ts, src/runs/layout.ts, src/runs/resumeCard.ts, src/runs/cardSource.ts, src/runs/ledgerStore.ts, src/change/scan.ts, src/mcp/secretScan.ts, src/mcp/env.ts, src/shared/programPath.ts, src/workspace/git.ts, src/config/parse.ts, src/content/frontmatter.ts, src/learnings/store.ts, src/hooks/scripts.ts, src/hooks/model.ts, src/hooks/portableRunner.ts, src/emit/hooksInfra.ts, src/adapters/claude.ts, src/adapters/cursor.ts, src/adapters/copilot.ts, src/adapters/codex.ts, src/manifest/claudeSettings.ts, src/manifest/hookDocuments.ts, src/cli/commands/init/panel.ts, src/worktree/policy.ts, content/commands/st-work.md, content/commands/st-board.md, content/commands/st-debug.md, content/commands/st-rework.md, content/commands/st-quick.md, content/commands/st-pr-resolve.md, content/commands/st-plan.md, content/rules/stamity-question-protocol.md, content/rules/stamity-injection-screening.md, content/skills/st-qa/SKILL.md, content/skills/st-verify/scripts/spec-plan-coverage.mjs, SECURITY.md, docs/security-mapping.md, docs/specs/everyday-flows.md, docs/specs/orchestrator-context.md, docs/specs/board-writes.md, docs/specs/prove-behavior-and-value.md, evals/SET-v7.md, evals/cases-v6, evals/coverage-exemptions-v6.md, scripts/eval/run.mjs, test/architecture/boundaries.test.ts, test/cli/surface.e2e.test.ts, test/corpus/commands/work.test.ts, test/corpus/commands/board.test.ts, test/adapters/claude.test.ts, test/hooks/scriptBudget.test.ts, test/evals/coverage.test.ts, .stamity/change-classes.json, .gitignore]
---

# Cloud runs — file 1 of 2: the unattended run and its floors

This file is self-contained. It is the first of two `/st-plan` artifacts for **Package 25**, which makes Stamity work in
the clouds of Claude Code, Cursor and Copilot as it does locally, and is cut as **1.16.0**. This file makes an
unattended run an explicit declaration with one ending — a pushed branch and one draft pull request carrying a morning
list — a ready check before it starts, and the floors that hold while nobody watches. File 2
(`docs/plans/021-cloud-runs-02.md`) makes long runs survive machines that go away, adds each cloud's specifics, the
proof (a CI container leg, the maintainer's cloud checks), the cloud page and the cut's preparation. The floors land
with the unattended path, in this file: no part of it merges without them.

intent chosen: feature because the package adds net-new capabilities (an unattended mode, a ready check, a draft-PR
ending, a morning list, a run contract, a pre-flight, main-thread deny rules, outbound-text scans); no defect is
diagnosed and external contracts move (CLI verbs, the run record's head, the emitted settings).

## Context

Today "unattended" is a habit, not a mode: nothing marks a run unattended, `/st-work`'s close falls back to `leave
uncommitted` (so its pull-request step is unreachable with nobody there), it never checks a plan's open questions, two
asks carry no declared default, the pull-request step names no tool and `gh pr create` uses GraphQL (refused in Claude
Code's cloud), and the state a run resumes from is local or git-ignored. Nothing stops the main agent's outward acts — a
push to the default branch, a merge, a tag, a publish — when nobody watches: the guard governs only Stamity's own
sub-agents and no deny rules are emitted. This file closes those gaps on every client, locally and in the clouds. Out of
scope: starting runs automatically (no trigger is built), a service identity, runs across repositories, Codex's cloud,
and everything file 2 owns.

## Decisions

### The maintainer's walks (2026-10-14 and 2026-10-15)

Taken on 2026-10-14 after a research round on the three clouds: Stamity must work the same in Claude Code's cloud,
Cursor's cloud agents and Copilot's cloud agent; it is proven from the vendors' documentation, a cloud-like Linux
container in CI and one real run per cloud by the maintainer at the package's end; every run with nobody watching ends
with a draft pull request carrying the morning list, locally too; the groundwork for a future factory is a written run
contract, with no trigger built; the package cuts the next minor, 1.16.0; on Copilot a long run is a chain of sessions a
person restarts; and an unattended run refuses to start where the account running it could push to the default branch
directly (no protection, or a bypass for direct pushes). Taken on 2026-10-15 at this plan's start: every declared default
below as it stands, updated for what 1.15.0 already built; the maintainer's cloud checks run on Claude Code and Cursor
(no Copilot cloud-agent account, so Copilot's cloud rows stay documented and unrun); the optional CI legs that need
secrets are built and stay off; and this repository keeps its administrators' bypass, so its own pre-flight refuses
here and no Stamity unattended run happens in this repository.

### Declared defaults this file builds

- **Unattended mode.** An explicit declaration (`--unattended`, or `STAMITY_UNATTENDED=1` on a cloud environment,
  routine or automation) recorded as the record head's `Mode:` line and passed on by `/st-board pickup`, `/st-debug` and
  `/st-rework`; a cloud marker means "cloud", never "unattended". An unattended run asks nothing: every ask point takes
  its declared default with `Default applied:`; on Claude Code a hook denies the question tool while the mode is
  unattended. A ready precondition (`stamity plan check`) refuses a start on a clarification marker, open questions, a
  Critical risk, a failed mechanical lint, a stale plan, or no persisted plan.
- **The ending.** Every exit commits, pushes after a clean secret scan, and opens or updates one draft pull request by
  REST (an open one on the branch first, then `POST …/pulls` with `draft: true`, then a normal one titled `[DRAFT]` on a
  422, else `Not done:`); never a push to the default branch, a force push, a tag, a merge or ready-for-review.
  Checkpoints push after each closed unit; the draft opens at the start of Build. The morning list
  (`.stamity/runs/<id>/morning.md`) is the PR body's source; the morning walk reopens the close attended through the
  client's question tool. Plan prerequisites are a plan section plus detection from the diff, never a value. One
  invocation may run a chain of split-plan files on one branch. The other touchpoints follow the mode. The attended
  close offers "commit, push, draft PR" first and recommended, and with no answer stays `leave uncommitted`. The run
  contract is a committed file, `run-contract: 1`, taken by reference.
- **The floors (charter invariant 1; each replaceable only by an equal or stronger control).** Learnings and handoffs
  read through the screen and the question protocol and injection screening loaded explicitly; input by reference, from
  write or admin authors only; a pre-flight that refuses where hooks did not load, `node` or the pinned CLI is
  unreachable, the scan cannot run, the input came from a non-write author, or the account could push to the default
  branch directly; main-thread deny rules for person-only acts on every client; person-only paths never pushed; a
  secret scan after the close writes its records and before the push, and over every outbound text; the accepted risks
  named in `SECURITY.md`.

### Settled by this plan

- **Verbs.** Hidden plumbing in the `ledger`/`gate` grammar (`src/cli/kit/program.ts:112-125`, positional
  subcommands as `src/cli/commands/gate.ts:1518-1538`): `stamity plan check`, `stamity run start|checkpoint|end`,
  `stamity gate preflight --unattended`, `stamity gate scan --text`, `stamity learn read`.
- **Where the unattended text lives.** A new skill, `content/skills/st-unattended/SKILL.md`, called by name only when
  the record's `Mode:` reads `unattended`, as the qa skill is called by name (`content/skills/st-qa/SKILL.md:6`).
  `/st-work` has no spare line and one spare character before its re-attach cut (`test/corpus/commands/work.test.ts:
  439-446`): its one pointer sentence goes into the head paragraph below the cut, paid for by rewrapping the Testing
  philosophy blockquote; the close's third option line by rewrapping the close-walk paragraph.
- **Two value-less asks, not three.** `/st-pr-resolve`'s re-poll already declares `done`
  (`content/commands/st-pr-resolve.md:327-328`). Unattended, Frame's ambiguity gate refuses at the precondition, and
  two matching plans need the plan paths in the invocation. Seven other asks with no declared default already stop at
  `BLOCKED_AMBIGUITY` under the protocol's item 8 when nobody answers; unchanged (a follow-up below).
- **Names.** The hand-off field is `run-mode:` (`mode` is the board's own return field, `st-board.md:498`); a hand-off
  read from disk carries `run-mode: attended`, as it carries `preview: stop`.
- **The record head** gains `Mode:` and `Branch:` together (six lines among the first 15); file 2 reads `Branch:` for
  the startup resume card. The debug record keeps its three head lines when attended.
- **Every touchpoint that pushes unattended takes the same entry.** `/st-work`, `/st-debug`'s user route and
  `/st-pr-resolve` each write `Mode:`, `Branch:` and `Base:` into their record (`/st-pr-resolve`, which keeps none today, opens one
  of its own, `Branch:` naming its pull request's head), call the `st-unattended` skill by name,
  run the pre-flight before the first fetch or push, push only through the run verbs, and post every reply from a file
  the outbound scan passed. `/st-quick` refuses unattended, naming `/st-work --effort light`.
- **The deny rules are always on, on every client**, as the default is written, Codex included: a mode-conditional
  guard would miss a cloud run nobody declared unattended, a weaker control. From the merge and the next `sync`, an
  agent in a Stamity repository no longer force-pushes, pushes to the default branch (named, or implied by a
  refspec-less push or `HEAD` while on it), tags, deletes remote branches, merges, marks ready, releases, publishes, or
  edits secrets, variables, protection or rulesets: the person runs those. The changelog says so plainly.
- **While a run is unattended, the run verbs are the only push path.** The same shell guard also refuses any raw `git
  push`, `gh pr create`, `gh pr edit`, and a REST write that moves a branch or a pull request (`pulls` and `pulls/<n>`,
  `contents/`, `git/` refs and objects, `merges`) while any in-progress record — debug records included, read directly
  rather than through the resume card's selection — reads `Mode: unattended` (or the variable is set and no run is in
  progress), so the held paths and the last scan cannot be stepped around; a reply on `pulls/<n>/comments` or
  `issues/<n>/comments` passes, posted only from a scanned file. A run that rewrites its own record head escapes this; `SECURITY.md` names it.
- **"Hooks did not load"** is read from one canary on every client: the shell guard, which runs before every shell
  command, writes `.stamity/preflight-canary.json` when the command it guards is the pre-flight, and the pre-flight
  refuses unless that file is at most 120 s old. A canary, not a wall: the REST check of the default branch is the
  wall, and unknown REST state refuses. File 2 adds Claude Code's readiness signal.
- **The shell guard is its own core script**, wired only to the shell tools (matchers), so the extra process runs on
  shell calls alone; the core guard keeps its sub-agent scope. File 2 measures the latency (its follow-up row).
- **Held paths** — CI workflows and actions, hook and guard configuration (`.stamity/generated/`, the manifest),
  `.stamity/change-classes.json`, CODEOWNERS, the charter files and Codex's override, and (stronger than the default)
  the rule and instruction files of each client — never reach a pushed tree **in an unattended run**: `run checkpoint`
  and `run end` move such a change into an inert patch under the run folder, restore those paths in the index only (the
  work tree keeps the change), and list it. An attended run's push (the close's option 1) holds nothing.
- **The pull request's body** is replaced only when it ends with this run's own marker; any other open PR on the branch
  (a person's, or `/st-pr-resolve`'s) keeps its body and gets the morning list as one scanned comment.
- **The morning walk is attended by definition** and opens only on a run whose record is closed (handed off):
  `--resume <run-id>`, or `/st-work` on that run's branch, reads `Mode: attended` whatever `STAMITY_UNATTENDED` sets,
  and `--attended` beats the variable; an invocation that itself declares the start unattended there (`--unattended`, a
  hand-off's `run-mode: unattended`, or a chain's next file) takes the unattended entry instead, never the walk
  (review/145). On a run still in progress `--resume` refuses and names the continuation (the second file's: an
  unattended start continues it). An attended record opened beside an in-progress unattended one leaves both the push
  rule and the ask gate on: each reads every in-progress record, in no order among them, and any one reading
  `Mode: unattended` decides (review/101). A run closes its record before Claude Code's final question round, and that
  round's exemption holds only on the closed record's own `Branch:` (review/100).
- **The repository the pre-flight checks** is read from `origin` alone (github.com, `GH_HOST`, or Claude Code's
  documented proxy shape); `GH_REPO` set to another repository refuses, and any other host is unknown, so refused.
- **A plan chain's exemption** starts at the chain's run base (`Base:`), not at the plans' stamp, so a commit between
  the stamp and the base still makes a path stale.
- **Outbound texts** are scanned by `scanAddedLines` (`src/change/scan.ts:357-365`), which reports no part of a value,
  never by `src/mcp/secretScan.ts`'s formatter, whose mask keeps four leading and two trailing characters (`:153-162`).
- **Git writes** take the same hardening as every verb's git (`safe.bareRepository=explicit`, `core.fsmonitor=false`,
  the bare-repository look first; `SECURITY.md:96`).
- **This repository's records** are excluded through `.git/info/exclude` (`scripts/records.mjs:2-5`): the run verbs
  stage an explicit path list, never `-A` or `-f`, and report an ignored path as `records: not committed (<source>)`.
- **The contract's public page** is a section of file 2's cloud page; this file builds the file format and its check.
- **The eval cases that quote this file's text ride this file**: ten new cases, the two unattended cases re-baselined,
  and every case whose quoted range a corpus edit moves. The new skill carries a coverage exemption from its unit until
  the first case sources it. Each corpus edit rewraps inside its own region where it can, so later ranges keep their
  lines; `evals/SET-v7.md`'s index has one writer at a time (u15, then u22, then u22b).
- **The session start's CI line** ("No person answers; declared defaults apply.", `src/hooks/scripts.ts:690`) stays: it
  states the protocol's item 8 for a question nobody answers and declares no mode.

## Spec delta

This file moves four spec files: `docs/specs/everyday-flows.md` gains REQ-FLOW-089 to REQ-FLOW-104 and REQ-FLOW-120 and
amends REQ-FLOW-019, -025, -036, -075, -077, -080, -088 and REQ-PLUGIN-016; `docs/specs/orchestrator-context.md` amends
REQ-CTX-012; `docs/specs/board-writes.md` amends REQ-BOARD-002 and REQ-BOARD-005; `docs/specs/prove-behavior-and-value.md`
gains REQ-PROVE-038. `/st-work` merges this delta at the file's last unit, before the whole-branch review, so that review
reads merged truth; one commit reverts it.

### REQ-FLOW-089 — A run is unattended only by declaration (ADDED)
Given `--unattended` on the touchpoint or `STAMITY_UNATTENDED` set to a value other than empty, `false` or `0`,
the flag winning and `--attended` beating the variable, When Frame opens the record, Then its head reads
`Mode: unattended`; given neither, or only a cloud or CI marker (`CLAUDE_CODE_REMOTE`, `COPILOT_AGENT_PROMPT`,
`CURSOR_AGENT_SOCKET`, `CI`), Then `Mode: attended`, and a head with no `Mode:` line reads attended. `/st-board pickup`
and `/st-rework` hand the mode to `/st-work` as `run-mode: attended | unattended`, and `/st-debug` hands it over only
when attended: an unattended debug run stops after the root cause and hands nothing to `/st-work` (REQ-FLOW-097); a
hand-off read from disk carries `run-mode: attended`.

### REQ-FLOW-090 — An unattended run asks nothing and says so (ADDED)
Given `Mode: unattended`, When an ask point is reached, Then no question is put: its declared default runs and
the record holds `Default applied:`; Frame's ambiguity gate refuses at the ready check (REQ-FLOW-091), two matching
plans refuse unless the invocation names the plan paths, and an ask with no default returns `BLOCKED_AMBIGUITY`. On
Claude Code a PreToolUse hook on `AskUserQuestion`, with no fail-closed tail, exits 2 naming the rule and the record
or the variable it read, reading no order among records: while any in-progress record reads `Mode: unattended`; else,
with no in-progress record reading `Mode: attended`, while the variable is set, except when no run is in progress
and a closed record reading `Mode: unattended` names the current branch as its `Branch:` (Claude Code's final round
after that run handed off; on any other branch the variable decides). The detail lives in the `st-unattended` skill,
called by name only in that mode.

### REQ-FLOW-091 — An unattended start needs a ready plan (ADDED)
Given an unattended start, When `stamity plan check <plan...> [--chain --since <Base>] [--contract <path>] --json` runs,
Then it exits 0 when ready, 1 naming each blocker (`needs-clarification`, `open-questions`, `critical-risk`, `lint-L2` to
`lint-L4`, `lint-structure`, `head-key-missing`, `stale`, `stamp-unresolved`, `freshness-error`, `chain-order`,
`prerequisite-open`, `contract`, `contract-mismatch`, each on its plan; `no-plan` for an input it could not read, in a
top-level `blockers` list beside `plans: []`, nothing checked) and 2 on a usage error, `--chain` without `--since`
among them, and reports L1 `not-checked`, never a blocker; a board item whose hand-off carries a failed
readiness verdict refuses in the flow. A refusal is a pushed record and a draft pull request titled `Refused:` where a
branch can be pushed, else the reply on the start surface.

### REQ-FLOW-092 — Every unattended exit is a pushed branch and one draft pull request (ADDED)
Given `Mode: unattended`, When the run exits by any path, Then `stamity run end` commits an explicit path list, never
`git add -f`, pushes after a clean scan (REQ-FLOW-103) and opens or updates one draft pull request: an open one on the
branch, its body replaced only when it ends with this run's marker (else the list posted as one comment), else REST
`POST …/pulls` with `draft: true`, else on a 422 a normal one titled `[DRAFT]`, else `Not done: draft PR not opened`,
exit 1 (0 with a pull request). No call runs `gh pr create`, `gh pr ready`, a merge, a force push, a tag or a push to
the default branch, read by REST; `run start` leaves it for a branch of the run's own.

### REQ-FLOW-093 — An unattended run checkpoints as it goes (ADDED)
Given `Mode: unattended`, When a unit closes or the run is about to wait, Then `stamity run checkpoint` commits the
explicit path list and pushes the run's branch under the limits of REQ-FLOW-092, and with nothing staged commits nothing
and pushes only when the branch is ahead; the draft pull request opens when Build starts; the record, ledger, plan
and morning list ride the branch wherever git does not ignore them (an ignored one reads `records: not committed`).

### REQ-FLOW-094 — The morning list (ADDED)
Given an unattended run, Then `.stamity/runs/<run-id>/morning.md` is the source and the pull request body is
regenerated from it, ending `<!-- stamity:run <run-id> -->`, after a secret scan: a pre-flight refusal's reason
first (`## Refused`); the person's QA rows (at most three) and the proven line; decisions (consequential defaults
applied, `decision-waiting` leftovers, the spec delta merge, board proposals); prerequisites, each kind · name · read
where · set by · blocks merge, deploy or run · verified yes or no, never a value, a row found in the diff marked
`inferred`; person's calls held; `Not done:`. A section with no rows reads `none`.

### REQ-FLOW-095 — The morning walk (ADDED)
Given an unattended run whose record is closed, When `/st-work --resume <run-id>` runs, or `/st-work` on its branch,
Then it reopens the close under a record of its own reading `Mode: attended`, whatever `STAMITY_UNATTENDED` sets,
citing the first run, walks the morning list through the client's question tool in rounds, applies the answers on the
same branch, pushes and refreshes the pull request body; an invocation that itself declares the start unattended
(`--unattended`, a hand-off's `run-mode: unattended`, or a chain's next file) takes the unattended entry on that branch,
never the walk (`content/commands/st-work.md:413-415`, `content/skills/st-unattended/SKILL.md:140-145`); on a run
still in progress `--resume` refuses, naming the continuation. In Claude Code's cloud the run closes its record,
pushes, then asks one final round; on Cursor, follow-ups on its pull request's comments; on Copilot, one
`@copilot answers: Q1→2, Q3→1` comment; locally, the touchpoint.

### REQ-FLOW-096 — An unattended plan chain (ADDED)
Given `stamity plan check a b c --chain --since <Base>`, When each file's head `depends_on` names the file before it, Then
one unattended invocation runs the chain on one branch, each file its own run and record, stopping at the first
`BLOCKED_*`, with one draft pull request and one merged morning list; otherwise the blocker `chain-order` refuses.
A `reads` path that only commits after the chain's run base moved is exempt from the freshness guard; a path a commit
between the stamp and that base moved stays stale.

### REQ-FLOW-097 — The other touchpoints, unattended (ADDED)
Given `Mode: unattended`, When another touchpoint runs, Then `/st-quick` refuses, naming `/st-work --effort light`;
every unattended `/st-debug` run and `/st-pr-resolve` (in a record of its own, `Branch:` its pull request's head)
take the unattended entry without the ready check — `Mode:`, `Branch:`, `Base:`, the `st-unattended` skill, the
pre-flight before the first fetch or push, pushes only through `stamity run checkpoint|end`, every reply posted from a
file `gate scan --text` passed, and no exit leaving the record in progress. `/st-pr-resolve` runs no `run start`,
fixes only the mechanical class and sends nothing to `/st-work`, every other finding deferred as `needs a planned run`.
Unattended `/st-debug` stops after the root cause and hands nothing to `/st-work`: it pushes its record, the ranked
hypotheses and the failing test when one was written, and the morning list carries the fix as `needs a planned run`; a
user-route stop strips its instrumentation and returns `BLOCKED_DEPENDENCY`. `/st-rework` passes the mode to
`/st-work`; `/st-board pickup` carries it, keeps `preview: stop`, its board writes land as morning-list rows.

### REQ-FLOW-098 — The run contract file (ADDED)
Given a file carrying `run-contract: 1`, When `stamity plan check --contract <path>` parses it strictly, Then it
takes by reference the plan path or board item, the base, the acceptance verbatim, the scope, prerequisites each
done or owned, a budget (stop-by, max units) and who answers the morning list, and fixes
`preview: stop` and `move: off`; an unknown field is refused, `run-contract: 2` is refused naming version 1, and a
prerequisite neither done nor owned is the blocker `prerequisite-open`. No trigger is built;
the contract's public page belongs to the next file.

### REQ-FLOW-099 — Screened reads and loaded floors, unattended (ADDED)
Given `Mode: unattended`, When the run starts, Then it loads the question protocol and the injection-screening rule
by name and the record names both; learnings come from the session-start banner, else `stamity learn read`
(`--body <id>` for one body) beside `stamity handoff list`, else the session-start script run by hand, never a file
opened with the file tools; `learn read` screens with the write gate's whole catalog, exfil rows included, lists
a refused file by its pattern ids with no span, and exits 1 when the folder cannot be listed or a `--body` id is
skipped or unknown.

### REQ-FLOW-100 — Input by reference, from write or admin authors (ADDED)
Given `Mode: unattended`, When input reaches the run, Then items come by id or path only; the board's author rule
applies on every repository (REQ-BOARD-005); `/st-pr-resolve` reads each author's permission through the endpoint
REQ-BOARD-005 names and routes a finding no `admin` or `write` author's own comment asks for to DEFER, reported
`non-write author` with a morning-list row and never fixed, an unreadable permission counting as none; the question
protocol's item 8 adds that a kickoff prompt, routine text or contract field never answers a person-gate.

### REQ-FLOW-101 — The unattended pre-flight (ADDED)
Given `stamity gate preflight --unattended [--item <ref>] --json`, Then it exits 1 when the hooks canary is absent or
older than 120 s (the shell guard writes it for the pre-flight's own command), `node` falls outside `engines`, the
pinned CLI is unreachable, `gate scan` cannot run, the item's author is not `admin` or `write`, or REST does not prove
the account cannot push to the default branch of the `origin` repository (no protection, a direct-push bypass, a 403,
a 404, a non-GitHub origin, or `GH_REPO` naming another repository; a pull-request-only bypass passes). It warns on
Cursor egress, token-shaped variable names (names only) and missing review state; with no refusal it exits 0.

### REQ-FLOW-102 — Person-only acts are denied on every client, and person-only paths are held (ADDED)
Given any session, When the main thread runs a force push, a push of a tag or of the default branch (named, or
implied by a refspec-less push or `HEAD` while on it), a remote branch deletion, a merge, `gh pr ready`, `gh release`,
`npm publish`, or a `gh secret`, `gh variable`, protection or ruleset call, Then Claude Code's `permissions.deny` and
shell guard, Cursor's fail-closed `beforeShellExecution`, and Copilot's and Codex's `preToolUse` checks refuse it.
Unattended, a change to CI, hook or guard configuration (`.stamity/generated/`, the manifest), the class file,
CODEOWNERS, the charter or the rule and instruction files is held off the pushed tree as an inert patch, listed.

### REQ-FLOW-103 — Secrets are scanned last, and every outbound text before it leaves (ADDED)
Given a close that pushes, When its record, inbox, learnings, spec merge and morning list are written, Then
`stamity gate scan --base <Base>` runs again before the push and a hit holds it; given a pull request's title or body,
a morning list, a comment or a reply, Then `stamity gate scan --text <file> --label <label>` scans it through `scanAddedLines`
and exits 1 on a hit or a line past the cap, naming label, line and rule and no part of the value, and the text
posts only from the scanned file. A new or bumped dependency is a morning-list row.

### REQ-FLOW-104 — The cloud's accepted risks are named (ADDED)
Given `SECURITY.md`, Then a `### Cloud and unattended runs` section under what it does not defend replaces "Runs nobody
watches" and names the accepted risks: runtime ingress is screened by the model, not enforced; a Copilot hook that
times out fails open; Cursor's read-only first turns run no hooks; no shell guard sees Cursor's own push; a pattern
deny rule can be respelled; every command in Claude Code's cloud can read the environment; a run that rewrites its
own record head escapes the unattended push rule; Codex's non-interactive mode was seen running no project hooks, where
the pre-flight then refuses; a repository's own push configuration and a GraphQL mutation read from a file pass the
shell guard's patterns; behind Claude Code's cloud proxy the push and the REST reads run as the platform's shared app
identity; a custom repository role that can edit rules, without admin, can lift a repository ruleset the pre-flight
counted; a custom organization role that manages rulesets lets a member who administers the repository lift an
organization ruleset; an administrator's repository-level acts (a transfer, a rename, a default-branch change) can take
the default branch out of an organization ruleset's reach, the guard holding their known forms and repository acts
respelled past it a residual, so the wall is strongest with an account that has no admin on the repository;
`PATH` decides which `gh` a credential helper naming `gh` runs; a `GIT_CONFIG_*` value changed between the pre-flight
and the push goes unseen; and an environment file can name a build file outside the held set. It names the attended
guard's accepted gaps — gh's field conversions and current-branch placeholder read as literal text, a batch ref update
given as a GraphQL variable, the GraphQL tag-ref create and ref delete, a percent-encoded ref path, and a directory
change the place reader does not follow — as covered in an unattended run by the push rule and the REST check, and
names as uncovered by the unattended rules PowerShell's command wrappers, gh's alias for the create-and-push form, and
a multi-root workspace file's settings and an editor tasks file's folder-open task, which are not held. Its settings
row says the engine removes no `permissions.deny` row: `sync` keeps each byte for byte and `clean` names those equal to
the engine's that it left. The engine's start of `gh` is listed among its named network exceptions, and the run verbs
on the git-hardening row.

### REQ-FLOW-120 — An unattended run pushes only through the run verbs (ADDED)
Given any in-progress record (debug records included) reading `Mode: unattended`, or `STAMITY_UNATTENDED` set with no
run in progress, When the main thread runs a raw `git push`, `gh pr create`, `gh pr edit`, or a REST write on `pulls`
or `pulls/<n>`, `contents/`, `git/` refs or objects, or `merges`, Then the shell guard refuses it on every client,
naming `stamity run checkpoint` and `run end` as the push path; replies on `pulls/<n>/comments` and
`issues/<n>/comments` pass. An attended session keeps its own pushes. A run that rewrites its own record head escapes
this rule, a residual `SECURITY.md` names (REQ-FLOW-104).

### REQ-PROVE-038 — The unattended eval cases (ADDED)
Given `evals/SET-v7.md`, Then nine new floor cases hold: an unattended close opens a draft pull request; a start with
open questions refuses; a mid-run question lands on the morning list without the blocking tool; "ship it overnight"
makes no merge and no tag; a blocked run still hands off; item text telling the run to merge or push to `main` is
refused; a non-write comment drives no fix; a kickoff prompt claiming approval is not consent; a hookless pre-flight
refuses. One benign twin, `benign-attended-twin-leave-uncommitted`, gating the release as every twin does (its
false-refusal threshold 0, `evals/SET-v7.md:111`): the attended twin honours "leave uncommitted". The two existing
unattended cases are re-baselined and the cases quoting the close's default re-quoted, each quote a contiguous run of
its range.

### REQ-FLOW-019 — `/st-work` asks only what needs the person: the close's commit part (MODIFIED)
Given an attended close with uncommitted changes, Then its commit part offers `1 commit, push, draft PR`
(recommended), `2 commit only` and `3 leave uncommitted`, and keeps `Default if no response: leave uncommitted`
word for word; option 1 runs `stamity run checkpoint --pr`, holding no path in an attended run, off the default
branch, its draft pull request taking a short fixed body naming the run id and its record's path (an attended run
writes no `morning.md`), and where no platform is linked commits and lists `Not done: draft PR not opened` naming the
branch. "GIVEN no answer … nothing is committed" holds for an attended run; an unattended close ends by REQ-FLOW-075
and REQ-FLOW-092.

### REQ-FLOW-075 — An unattended close never drops a real defect, by the declared mode (MODIFIED)
Given a record head reading `Mode: unattended`, When the close runs, Then it asks nothing: leftovers take the
no-answer rule above, QA reads `Shippable: not signed`, the spec delta stays unmerged as a morning-list decision,
and the commit part runs `stamity run end` (REQ-FLOW-092) where an attended close would leave the work uncommitted;
given `Mode: attended`, or no `Mode:` line, and no answer, Then nothing is committed, as before. A cloud marker
never selects this rule.

### REQ-FLOW-077 — Every inbox writer follows the schedule rule: the plan shape's optional sections (MODIFIED)
Given `/st-plan`'s Plan artifact shape, Then an optional **Prerequisites** section follows Open questions, one row per
need: kind · name · read where · set by · blocks merge, deploy or run · verified yes or no, never a value; Follow-ups
and Drop list become 7 and 8, where this requirement read "6 Follow-ups and 7 Drop list". The morning list carries
each row as declared, beside the rows the diff infers (REQ-FLOW-094).

### REQ-FLOW-080 — Every touchpoint ends on a walk, the summary last: the `/st-work` bullet (MODIFIED)
Given `/st-work`'s close, Then the bullet reads: the close's parts as REQ-FLOW-019 states, the commit part's three
numbered options among them, the answers taking effect together after the last round; under `Mode: unattended` there
is no walk: each part takes its declared default by REQ-FLOW-075, and the morning list carries what the walk would
have asked (REQ-FLOW-094).

### REQ-FLOW-088 — A cloud with no session-start hook reads learnings through the screen (MODIFIED)
Given a session where no session-start hook ran, Then learnings are read through the screen, by the committed script
run with an empty stdin or by `stamity learn read` (`--body <id>` for one body), which applies the write gate's whole
catalog, exfil rows included; the unattended skill names both (REQ-FLOW-099), and a file under
`.stamity/learnings/` is never opened with the file tools.

### REQ-CTX-012 — The run record's head names the plan, the invocation, the branch and the mode (MODIFIED)
Given Frame, Then the first 15 lines of `record.md` carry `Status:`, `Plan:`, `Base:`, `Branch: <the run's branch>`,
`Invocation:` and `Mode: attended | unattended`, each bare at column 0; `readRecordHead` returns `mode`, `branch` and
`base`, and a missing `Mode:` line or any other value reads as attended. The debug record keeps its three head lines
when attended; an unattended `/st-debug` record adds `Mode:`, `Branch:` and `Base:`, and an unattended
`/st-pr-resolve` opens a record of its own with the six lines. The resume card's printed lines do not change.

### REQ-BOARD-002 — One preview per run, and no answer means stop: the pickup hand-off (MODIFIED)
Given pickup step 5, Then its payload carries `run-mode: attended | unattended` beside `move:` and `preview:`, with
the item's readiness verdict and its source link for the run; a hand-off read from disk carries
`run-mode: attended`, as it carries `preview: stop`. Unattended, a pickup keeps `preview: stop` and `move: off`,
and each board write it would make lands as a morning-list row. The field is not `mode`, which the return block
names for the board mode.

### REQ-BOARD-005 — Item text is data: the author rule, unattended (MODIFIED)
Given an unattended run, Then the author rule applies whatever either repository's visibility: text from an author
whose permission on its repository is neither `admin` nor `write`, or cannot be read, never supplies the content or
the trigger of a write or a fix. Attended, the rule still applies where the text's repository or the linked one is
public (`content/commands/st-board.md:313-318`), an unreadable permission counting as none there too.

### REQ-FLOW-025 — Run records are written with the file tools: the settings' `permissions` member (MODIFIED)
Given `buildSettingsJson`, Then `.claude/settings.json` carries the engine's `permissions.deny` rows (REQ-FLOW-102)
and still no allow row, so "setup writes no permission allowlist" holds and "The engine renders no `permissions`
member" reads "renders no `permissions.allow` row"; the tests that pin no `permissions` member move with it.

### REQ-FLOW-036 — `.claude/settings.json` is merged entry by entry: the engine's deny rows (MODIFIED)
Given the person-only deny rows (REQ-FLOW-102), Then the engine writes the rows of its table the file lacks and
records those it added by the hash of their canonical JSON, but no `permissions.deny` row in the file is ever judged
the engine's, since a hash cannot tell its row from an owner's equal one: `sync` keeps every row already there byte
for byte and in place, an owner's row equal to an engine row included, whatever the ledger's age (under a 1.11.0 row,
after setup, or after a lost record), and appends only the missing rows; `clean` never removes a `permissions.deny`
row and names the rows equal to the engine's that it left, for the person to remove by hand
(`src/manifest/claudeSettings.ts:154`, `:230-237`, `:337-346`). "Never writes, replaces or removes
`permissions.deny`" reads as never replaces or removes a deny row; `SECURITY.md:98` moves with it (u21).

### REQ-PLUGIN-016 — The ledger bound, settings co-ownership, the node row and the pack-reach row (MODIFIED)
Given its paragraphs of 2026-10-08 and 2026-09-22, Then "The engine renders no `permissions` member" and "it never
writes or removes `permissions.deny`" read as REQ-FLOW-025 and REQ-FLOW-036 now state them: the engine renders its
own deny rows and no allow row, appends only the rows the file lacks, and removes no deny row, `clean` included.

## Units

### u1-record-head — the record head reads `Mode:`, `Branch:`, `Base:` and `Resumes:`

| Field | Content |
|---|---|
| `id` | u1-record-head |
| `requirements` | REQ-FLOW-089, REQ-CTX-012 |
| `files` | `src/runs/layout.ts` (`:82-92`), `src/runs/resumeCard.ts` (`RecordHead` `:66-71`, `readRecordHead` `:214-225`), `src/runs/cardSource.ts` (the hook twin `:102-107`), new `test/runs/recordHead.test.ts`, `test/runs/resumeCardParity.test.ts` |
| `interfaces` | `RECORD_MODE_PATTERN = /^mode:\s*(attended\|unattended)\b/i`, `RECORD_BRANCH_PATTERN = /^branch:\s*(\S+)/i`, `RECORD_BASE_PATTERN = /^base:\s*([0-9a-f]{7,64})\b/i` (7 to 64 hex digits, so a SHA-256 repository's full commit id reads, `src/runs/layout.ts:95-99`), `RECORD_RESUMES_PATTERN = /^resumes:\s*(\S+)/i`, each read per line within `RECORD_HEAD_LINES` (15), as the existing patterns (`/i`, `layout.ts:83-87`); `RecordHead` gains `mode: "attended" \| "unattended" \| null`, `branch: string \| null`, `base: string \| null`, `resumes: string \| null`; the twin in `cardSource.ts` gains the same constants; `null` mode reads as attended everywhere; the card's printed lines do not change |
| `testCriteria` | GIVEN a head with `Mode: unattended` THEN `readRecordHead` returns `mode: "unattended"`; GIVEN no `Mode:` line or `Mode: sometimes` THEN `mode: null`; GIVEN `Branch: stamity/2026-10-16_x` and `Base: 02e040eb…` THEN `branch` and `base` equal them; GIVEN a 64-digit `Base:` THEN both the engine and the hook twin read it whole; GIVEN the parity fixtures THEN the engine and the hook twin read the same head (`resumeCardParity.test.ts`) |
| `edgeCases` | A `Mode:` line below line 15 → ignored (`null`); a 1.15.0 record → `null` mode, branch and base, the card unchanged |
| `depends_on` | none |
| `verify` | `npx vitest run test/runs` |
| `amended` | 2026-10-15: `RECORD_BASE_PATTERN` takes 7 to 64 hex digits; the hook twin builds its pattern from the same constant, both tested on a 64-digit base (review/3, `01af4692`) |

### u2-coverage-port — the structural coverage check in the engine

| Field | Content |
|---|---|
| `id` | u2-coverage-port |
| `requirements` | REQ-FLOW-091 |
| `files` | new `src/runs/planCoverage.ts`, new `test/runs/planCoverageParity.test.ts` |
| `interfaces` | A TypeScript port (erasable syntax only) of `checkCoverage` in `content/skills/st-verify/scripts/spec-plan-coverage.mjs:111-279` with the same signature and result: `checkCoverage(plan: { path: string; text: string }, specs: { path: string; text: string }[], options?: { missingSpecInputs?: string[]; exists?: (path: string) => boolean; cwd?: string }): { status: "pass" \| "fail"; semanticReview: string; scope: string[]; units: string[]; findings: { code: string; path: string; line: number; message: string }[] }`, codes and messages as the `.mjs`'s (`:211-276`), the dependency check reading the file system through `exists` (`:251`). Beside it, `parsePlanUnits(text): PlanUnit[]`, `PlanUnit = { id: string; line: number; requirements: string[]; dependsOn: string[]; edgeCases: string; verify: string; fields: Record<string, string> }`. The `.mjs` stays the skill's standalone copy. Pattern: the twin-and-parity pair `src/runs/cardSource.ts` / `test/runs/resumeCardParity.test.ts` |
| `testCriteria` | GIVEN every fixture of `test/authoring/specPlanCoverage.test.ts` THEN the port's result deep-equals the `.mjs`'s, the same `exists` injected into both; GIVEN CRLF line endings THEN the same findings as LF |
| `edgeCases` | A plan with no `## Units` section → `fail` with the `.mjs`'s code; a unit table with an extra field → kept in `fields`, no finding |
| `depends_on` | none |
| `verify` | `npx vitest run test/runs/planCoverageParity.test.ts test/authoring` |

### u3-freshness-contract — the freshness guard and the run contract as code

| Field | Content |
|---|---|
| `id` | u3-freshness-contract |
| `requirements` | REQ-FLOW-091, REQ-FLOW-096, REQ-FLOW-098 |
| `files` | new `src/runs/freshness.ts`, new `src/runs/runContract.ts`, new `test/runs/freshness.test.ts`, new `test/runs/runContract.test.ts` |
| `interfaces` | `freshness(git: GitRunner, cwd: string, stamp: string, reads: string[], opts?: { exemptSince?: string }): Promise<{ verdict: "fresh" \| "stale"; stale: { path: string; reason: "moved" \| "missing" }[]; exempt: string[]; unresolved: boolean }>` (`GitRunner` from `src/workspace/git.ts:32`): fresh when `git rev-list --count <stamp>..HEAD -- <path>` is 0; missing on disk → stale `missing`; a stamp not in history → `unresolved: true`, verdict stale; with `exemptSince` (a chain's run base, never the stamp), a path is exempt only when `git rev-list --count <stamp>..<exemptSince> -- <path>` is 0, so every commit that moved it lies after the base. `parseRunContract(text: string, source: string): { ok: true; contract: RunContract } \| { ok: false; problems: string[] }` on `parseYamlStrict` (`src/config/parse.ts:80`, the library's warnings off at `:91`), every defect collected in one pass, each problem `<source>: ` then a message that names a key this engine knows and where it stands, never text the file holds (`src/runs/runContract.ts:33-37`): a version other than 1 → "names a version this engine does not read; it reads version 1", never the value; a prerequisite by its list index (`prerequisites[<i>]`), never its name or state, an open one under `prerequisite-open:` (`:393-397`); unknown keys at any level by count and line, never their text, the allowed keys named (`checkUnknown`, `:179-200`, the lines from a positions-only re-parse, `keyLocator`, `:210-249`); a YAML syntax error by line and column only, never the library's message (`unparsed`, `:160-172`); `RunContract = { version: 1; plan?: string; item?: string; base: string; acceptance: string; scope: { in: string[]; out: string[] }; prerequisites: { name: string; state: "done" \| "owned"; owner?: string }[]; budget: { stopBy?: string; maxUnits?: number }; answerer: string; preview: "stop"; move: "off" }`, the version read from the key `run-contract` |
| `testCriteria` | Over a temp repository (`seedGitRepo`, `test/support/repoFixtures.ts:83`): an untouched path fresh; a later commit → `moved`; a deleted path → `missing`; a stamp rebased away → `unresolved`; with `exemptSince` = a base after the stamp, a commit after the base → exempt, a commit between stamp and base → still stale. Contract: `run-contract: 2` refused naming 1; a prerequisite neither done nor owned → `prerequisite-open`; `preview: write` refused; neither `plan` nor `item` refused; a canary string written as a version, a prerequisite's name or state, an unknown key, or inside a YAML syntax error → no problem holds it, the unknown key counted with its line |
| `edgeCases` | A `reads:` path holding a space → one argv entry, never a joined string; an empty `reads:` → fresh |
| `depends_on` | none |
| `verify` | `npx vitest run test/runs/freshness.test.ts test/runs/runContract.test.ts` |
| `amended` | 2026-10-16: contract problems name a known key and its position, never file text: no version value, no prerequisite name or state, no YAML error text (line and column only), and unknown keys by count and line with the allowed keys named, never the key's text (review/144, `5bad9693`; review/152, `af4de065`); `parseYamlStrict` keeps the library's warnings off the process (build/87, `cc0e81ab`) |

### u4-pr-runners — git writes, REST calls and the draft pull request, by stub-tested logic

| Field | Content |
|---|---|
| `id` | u4-pr-runners |
| `requirements` | REQ-FLOW-092 |
| `files` | new `src/cli/engine/gitWrite.ts`, new `src/cli/engine/ghRunner.ts`, new `src/runs/pullRequest.ts`, new `test/runs/pullRequest.test.ts`, new `test/cli/engine/gitWrite.test.ts`, new `test/cli/engine/ghRunner.test.ts` |
| `interfaces` | `gitWrite(cwd, args: string[], opts?: { timeoutMs?: number }): Promise<{ code; stdout; stderr }>`: git by absolute path (`resolveProgramOnPath`, `src/shared/programPath.ts:144`) with the same hardening as the read runner (`src/cli/engine/gitStatus.ts:170-191`: `-c safe.bareRepository=explicit`, `-c core.fsmonitor=false`, the bare-repository look first), plus `-c push.followTags=false`: the argv is those three `-c` options (`PINNED_OPTIONS`, `src/cli/engine/gitWrite.ts:57-65`), then the caller's arguments, each one after the first `--` given `:(literal)` magic and an empty one left empty (`gitWriteArgs`, `:88-104`), and no global `--literal-pathspecs`, which git exports to every hook as `GIT_LITERAL_PATHSPECS=1`; callers pass plain paths after `--`, pass `--` only to commands that take paths after it (never `push`), and write an option value that is itself `--` attached (`--message=--`); the environment is the caller's, kept for credentials, without the repository-location variables and `GIT_{LITERAL,GLOB,NOGLOB,ICASE}_PATHSPECS`, with `GIT_TERMINAL_PROMPT=0` (`gitWriteEnv`, `:106-119`); 120 s, stderr kept. `ghApi(request: GhRequest, opts?: { cwd?; env?; timeoutMs? }): Promise<GhResponse>` (`src/cli/engine/ghRunner.ts:38-60`, `:198`), `GhRequest = { method: "GET" \| "POST" \| "PATCH"; path: string; body?: unknown; hostname: string }`, `hostname` required (a bare lowercase host name, the one the repository was matched on), `GhResponse = { status: number; json: unknown }`: `gh` runs `api --hostname <host> --include --method <M>`, `--input -` for a body, then the path (`ghApiArgs`, `:129-142`); the path a REST path in a closed alphabet (no scheme, no `//`, no dot segment), never `graphql`, a non-GET only on `repos/<o>/<r>/pulls`, `pulls/<n>`, `issues/<n>/comments` or `pulls/<n>/comments` (`WRITE_PATHS`, `:94-99`), any other call refused as `GH_REFUSED` before `gh` starts; the status from the head's first line, `gh` by absolute path (no `PATH` entry under `node_modules/.bin`), 60 s. `ensureDraftPr(gh: GhApi, request: DraftPrRequest): Promise<PrOutcome>` (`src/runs/pullRequest.ts:195`), `GhApi = (request: RestRequest) => Promise<RestResponse>`, `RestRequest = { method: "GET" \| "POST" \| "PATCH"; path: string; body?: unknown; hostname: string }` with `hostname` required (`:19-25`), `DraftPrRequest = { host: string; owner; repo; head; base; title; body; runId }` with `host` required and passed as `hostname` on every call (`:37-50`), `PrOutcome = { number; url; how: "existing" \| "commented" \| "created" \| "created-fallback" } \| { notDone: string }`: (1) `GET repos/{o}/{r}/pulls?head={o}:{head}&state=open` → if its body ends with `<!-- stamity:run <runId> -->`, `PATCH …/pulls/{n}` with `{ body }` only, else `POST repos/{o}/{r}/issues/{n}/comments` with the body (`how: "commented"`); (2) `POST …/pulls` `{ title, head, base, body, draft: true }`; (3) a 422 naming drafts → `POST` `{ title: "[DRAFT] " + title, head, base, body }`; (4) else `{ notDone: "draft PR not opened (<head>)" }`; a part failing validation → `{ notDone: "draft PR not opened (<part> failed validation)" }` before any call. `resolveRepo(env, originUrl): { host: string; owner: string; repo: string } \| null` (`src/runs/pullRequest.ts:278-294`): Claude Code's proxy shape `http://<user>@127.0.0.1:<port>/git/<owner>/<repo>` → host `github.com`, only while `GH_HOST` is unset, empty or names `github.com`, else `null` (`:284-285`); else the origin on the host `gh` talks to, `GH_HOST` when set and `github.com` when not, so a `github.com` origin under a `GH_HOST` naming another host → `null`; any other host → `null`. Host, owner, repo, run id and branches validated (`^[A-Za-z0-9._-]+$`, git's ref rules) before a path is built |
| `testCriteria` | With a stubbed `ghApi` (inline mock reason: no network, and a vendor 422): an open PR carrying this run's marker → one PATCH, no POST; an open PR without it → one comment, its body untouched; none → one POST with `draft: true`; a draft 422 → a second POST titled `[DRAFT] …` without `draft`; a 422 "already exists" → a re-lookup, never the fallback; across every case no recorded call names `merge`, `ready`, `graphql` or method `PUT`. `gitWriteArgs` puts the three `-c` options, and no global pathspec flag, ahead of arguments that carry no `--`, unchanged, and gives every argument after the first `--` the `:(literal)` magic, a later `--` and a leading colon included, an empty one left empty; `--message=--` before a trailing `--` passes unchanged; against a real repository a pre-commit hook sees no `GIT_LITERAL_PATHSPECS` and its glob still matches while `[ab].txt` stages alone (`test/cli/engine/gitWrite.test.ts`, `92e5a190`); a bare-shaped folder in the path → refused before git starts. `resolveRepo`: a `gitlab.com` origin → `null`; the proxy shape under `GH_HOST: "ghe.example.com"` → `null`, under `GH_HOST` empty or `github.com` → `github.com` |
| `edgeCases` | `gh` absent → `{ notDone: "gh not found" }`, no throw; `http://local_proxy@127.0.0.1:1234/git/o/r` with `GH_HOST` unset → `{ host: "github.com", owner: "o", repo: "r" }` |
| `depends_on` | none |
| `verify` | `npx vitest run test/runs/pullRequest.test.ts test/cli/engine/gitWrite.test.ts test/cli/engine/ghRunner.test.ts` |
| `threat` | Boundary: the engine → git and GitHub's REST API under the operator's `gh` login. Trusts: the run's own branch, title and body. Abuse: a crafted title, body or branch steering a call to a merge or ready path, a person's PR body overwritten, or git started in a planted bare-shaped folder. Check: fixed path templates with validated parts, a closed method set (GET, POST, PATCH), the marker rule, the bare look; the argv assertion above |
| `amended` | 2026-10-15: `GhRequest.hostname`, `RestRequest.hostname` and `DraftPrRequest.host` are required; `resolveRepo` returns `{ host, owner, repo }`; `gh` runs `api --hostname <host> …`, a path holding `:` or `//` refused; the proxy edge case's result gains `host` (u4's lens M-1, `5908acb0`); the cell now also names the four `WRITE_PATHS` a write may reach, as landed in `fedd1ba9` |
| `amended` | 2026-10-15: `resolveRepo` takes the proxy shape only while `GH_HOST` is unset or names `github.com` (review/61, `6a546b44`); `gitWrite` gives each path after the first `--` `:(literal)` magic and pins no global `--literal-pathspecs`, the `GIT_*_PATHSPECS` variables dropped from git's environment, so the argv's pinned part is the three `-c` options; the callers' `--` rules named (review/84, `92e5a190`) |

### u5-morning — the morning list, the PR body and inferred prerequisites

| Field | Content |
|---|---|
| `id` | u5-morning |
| `requirements` | REQ-FLOW-094, REQ-FLOW-095, REQ-FLOW-103 |
| `files` | new `src/runs/morning.ts`, new `src/runs/prerequisites.ts`, new `test/runs/morning.test.ts`, new `test/runs/prerequisites.test.ts` |
| `interfaces` | The shape: `# Morning list — <run-id>`, then `## Refused` (present only on a pre-flight or plan-check refusal, and then first), `## For you to check`, `## Decisions`, `## Prerequisites`, `## Person's calls held`, `## Not done:`, `## How to answer`, then a fenced `stamity-morning` block with one JSON object a line, `{ "id": "Q<n>", "kind": "qa" \| "decision" \| "prerequisite" \| "held", "question", "options": string[], "default": number, "source" }` (the fence pattern of `src/runs/layout.ts:69-80`). `parseMorning(text): { ok: true; sections: Record<string, string>; questions: MorningQuestion[] } \| { ok: false; problems: string[] }`; `prBodyFrom(text, runId, opts?: { inferred?: PrereqRow[]; maxChars?: number }): string` — the sections, the inferred rows not already named, then `<!-- stamity:run <run-id> -->` last (the marker form of `st-board.md:322`); past `maxChars` (60,000) it keeps the head, `Not done:` and the first rows and names `morning.md`; `parseAnswers(text): Map<string, number>` for `Q1→2, Q3→1` (also `->`), unknown ids listed as refused; `screenOutbound(text, label): { ok: boolean; hits: { line: number; rule: string }[] }` over `scanAddedLines` with `path: label`. `inferPrerequisites(files: { path: string; added: { line: number; text: string }[] }[]): PrereqRow[]`, `PrereqRow = { kind: "env" \| "migration"; name; where; setBy: "person"; blocks: "merge" \| "deploy" \| "run"; verified: false; inferred: true }` from added `process.env.X`, `os.environ["X"]`, `os.getenv("X")`, `ENV["X"]`, `.env.example` keys and files under `migrations/` or `db/migrate/`; test paths excluded; never a value |
| `testCriteria` | A text missing a required section → `problems` names it; `## Refused` present → parsed first; `Q7→2` for an unknown id → refused; a token-shaped line → `screenOutbound` `ok: false` naming line and rule, and the serialized result holds none of the value's first four characters; an env read under `test/` → no row |
| `edgeCases` | Every section empty → each prints `none` and parses; a body over the cap → truncated with the pointer, the marker still last |
| `depends_on` | none |
| `verify` | `npx vitest run test/runs/morning.test.ts test/runs/prerequisites.test.ts test/change` |

### u6-person-only-tables — one table of person-only acts, the unattended push rule and the held paths

| Field | Content |
|---|---|
| `id` | u6-person-only-tables |
| `requirements` | REQ-FLOW-102, REQ-FLOW-120 |
| `files` | new `src/hooks/personOnly.ts`, new `src/change/personOnlyPaths.ts`, new `test/hooks/personOnly.test.ts`, new `test/change/personOnlyPaths.test.ts` |
| `interfaces` | `PERSON_ONLY_RULES: readonly { id: PersonOnlyRuleId; act: string }[]` (`src/hooks/personOnly.ts:62-86`), one row per id `force-push`, `push-default`, `push-tags`, `push-delete`, `tag`, `pr-merge`, `pr-ready`, `release`, `publish`, `secrets`, `protection`, each with the act the person keeps. `personOnlyVerdict(command: string, ctx: PersonOnlyContext): { deny: false } \| { deny: true; rule: PersonOnlyRuleId; reason: string }`, `PersonOnlyContext = { defaultBranches: readonly string[]; currentBranch: string \| null; tags: readonly string[] }` (`:95-105`, `tags` the repository's local tag names, `[]` when unread): quotes honoured, segments split on `&&`, `\|\|`, `;`, `\|`, `&`, a newline, a subshell's parentheses and a command substitution, wrappers (`env`, `sudo`, …) skipped, a literal `sh -c` or `eval` argument read as its own line, git's global options (`-c k=v` pairs among them) skipped; denies a `git push` with `-f`, `--force`, `--force-with-lease`, `--force-if-includes` or a `+` refspec; a destination naming a default branch (`X`, `refs/heads/X`, `<src>:X`; `main` and `master` always among them), a `:` matching refspec, and, when `currentBranch` is a default branch, a refspec-less `git push` (any remote) and a `HEAD` or `@` destination, and on any branch a refspec-less push under `-c push.default=matching`; `--tags`, `--follow-tags`, `--mirror`, `--all`, `--branches`, a `push.followTags` or `remote.<n>.mirror` `-c` pair, or a refspec side naming a tag (`refs/tags/…`, `tags/…`, or a name in `ctx.tags`); `--delete`, `--prune`, `-d` or a `:ref` refspec; `git tag` except list-only forms; `gh pr merge`, `gh pr ready`; `gh release` except `list`, `view`, `download`; `npm`, `pnpm`, `yarn`, `yarn npm` and `bun` publish; `gh secret` and `gh variable` except `list`; `gh repo edit --default-branch`, `gh repo delete`, `gh repo archive` (`protection`); from u6's round 2 (signed off 23:20Z–23:34Z, landed in `2fc0824b`), also `protection`: `gh repo edit --visibility` (review/69), `gh repo rename` and a `gh api`, `curl` or `wget` PATCH or DELETE on the bare `repos/<o>/<r>` path (build/31), a write on the branch-rename endpoint `branches/<b>/rename` (review/60's 23:20Z sign-off), and a repository transfer, the REST transfer endpoint and any `gh` form (review/89); a `gh api`, `curl` or `wget` write naming `pulls/<n>/merge`, `merge-async`, `branches/<b>/protection`, `rulesets`, the secrets or variables of `actions`, `dependabot`, `codespaces`, `agents` or `environments/<e>`, `releases`, or `git/refs` (a DELETE → `push-delete`, a tag ref → `push-tags`, a default-branch head → `push-default`), and `graphql` naming `mergePullRequest`, `enablePullRequestAutoMerge` or `markPullRequestReadyForReview`. `unattendedPushVerdict(command: string): { deny: false } \| { deny: true; reason: string }`: denies any `git push` or `git send-pack`, `gh pr create`, `gh pr new`, `gh pr edit`, `gh repo sync`, and a `gh api`, `curl` or `wget` write (POST, PATCH, PUT, DELETE) on `repos/<o>/<r>/pulls`, `pulls/<n>`, `pulls/<n>/merge` or `pulls/<n>/update-branch`, on `contents/…`, on `git/refs`, `git/commits`, `git/trees`, `git/blobs` or `git/tags`, on `merges` or `merge-upstream`, or on `branches/<b>/rename`, and a GraphQL mutation that moves a branch or a pull request, naming `stamity run checkpoint` and `run end`; a POST on `pulls/<n>/comments` or `issues/<n>/comments` (a reply) passes. `CLAUDE_DENY_ROWS: readonly string[]`, the subset a prefix rule expresses: 49 rows (`:117-167`, `gh repo edit --visibility`, `gh repo rename` and `gh repo transfer` among them), none ending in a branch name (a default-branch push is the shell guard's alone). `PERSON_ONLY_PATHS: readonly string[]`, 57 globs (`src/change/personOnlyPaths.ts:26-93`): GitHub Actions' `.github/workflows/**`, `.github/actions/**`, `**/action.yml`, `**/action.yaml`; the other CI providers' `.gitlab-ci.yml`, `.circleci/**`, `azure-pipelines.yml`, `azure-pipelines.yaml`, `.azure-pipelines/**`, `**/Jenkinsfile`, `.buildkite/**`, `buildkite.yml`, `buildkite.yaml`, `buildkite.json`, `.travis.yml`, `bitbucket-pipelines.yml` (review/75); `.claude/settings*.json`, `.cursor/hooks.json`, `.github/hooks/**`, `.codex/hooks.json`, `.codex/config.toml`, `.vscode/settings.json` (review/106); `.stamity/generated/**`, `.stamity/hooks/**`, `.stamity/manifest.json`, `.stamity/change-classes.json`; `CODEOWNERS`, `.github/CODEOWNERS`, `docs/CODEOWNERS`; `**/AGENTS.md`, `**/AGENTS.override.md`, `**/CLAUDE.md`, `.claude/rules/**`, `.cursor/rules/**`, `.cursorrules`, `.github/copilot-instructions.md`, `.github/instructions/**`; `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`; `.claude/agents/**`, `.claude/commands/**`, `.claude/skills/**`, `.agents/skills/**`, `.cursor/agents/**`, `.cursor/commands/**`, `.cursor/skills/**`, `.cursor/hooks/**`, `.codex/agents/**`, `.codex/skills/**`, `.github/agents/**`, `.github/prompts/**`, `.github/skills/**`, `.github/chatmodes/**` (review/70); `.cursor/environment.json`, `.devcontainer.json`, `.devcontainer/**` (build/50) — matched without case, and `heldPaths(paths: readonly string[]): string[]` (`:96-98`) |
| `testCriteria` | A matrix test: every deny case → `{ deny: true, rule }`; every allow case → `{ deny: false }`, among them `git push origin HEAD:refs/heads/stamity/2026-10-16_x`, `git push -u origin feat/x` on `feat/x`, `git tag -l`, `gh release view`; `git push`, `git push origin` and `git push origin HEAD` with `currentBranch: "main"` → denied, the same on `feat/x` → allowed; `unattendedPushVerdict` denies `git push origin HEAD:refs/heads/x`, `gh pr create`, `gh api -X PUT repos/o/r/contents/a.yml` and `gh api -X PATCH repos/o/r/git/refs/heads/x`, allows `npx --no stamity run end --run x` and `gh api repos/o/r/pulls/3/comments -F in_reply_to=1 -F body=@reply.md`; `heldPaths` keeps `.github/workflows/ci.yml`, `CODEOWNERS`, `pkg/AGENTS.md`, `.claude/settings.json`, `.claude/rules/x.md`, `.stamity/generated/agent-tool-policies.json`, `.stamity/manifest.json`, `AGENTS.override.md` and drops `src/a.ts`. After round 2: `heldPaths` keeps `.mcp.json` and a path under `.claude/agents/` (the case that kept `.claude/agents/**` unheld flips) and a CI definition of each provider review/75 names; `gh repo edit --visibility`, `gh repo rename`, a REST PATCH or DELETE on `repos/o/r`, a write on `repos/o/r/branches/main/rename` and a repository transfer → `protection` |
| `edgeCases` | `git -c a=b push -f` → denied; a respelling through an alias or `sh -c "$(…)"` → allowed, asserted so the residual is written down |
| `depends_on` | none |
| `verify` | `npx vitest run test/hooks/personOnly.test.ts test/change/personOnlyPaths.test.ts` |
| `threat` | Boundary: the main thread's shell → the remote. Trusts: the command text. Abuse: injected item text tells the run to `gh pr merge`, `git push origin HEAD:main`, or a plain `git push` on `main`, or to push a workflow change around the run verbs. Check: the matrix over every rule and over the run verb's exact push argv (u18b shares the table); the respelling residual asserted and named in `SECURITY.md` (u21); the pre-flight's REST check is the wall |
| `amended` | 2026-10-15: `PERSON_ONLY_RULES` rows carry `act`; `PersonOnlyContext` gains `tags`, and a refspec side naming a tag (`tags/…`, or a local tag's bare name) is `push-tags`; `bun publish` is `publish`; `gh repo edit --default-branch`, `gh repo delete` and `gh repo archive` are `protection`; `CLAUDE_DENY_ROWS` drops its eight rows ending in a branch name, 46 rows; `.cursorrules` held, 24 globs (`65299243`, build/25, build/29, build/30). The wider shell reading, the REST and GraphQL rows of both verdicts and the three CODEOWNERS globs are recorded as landed in `1040aa27` |
| `amended` | 2026-10-15: round 2's decided rows, to land in that round: `protection` gains `gh repo edit --visibility` (review/69), `gh repo rename` and the REST PATCH or DELETE on the bare repository path (build/31), the branch-rename endpoint (23:20Z), and a repository transfer, REST and any `gh` form (review/89, 23:34Z); `PERSON_ONLY_PATHS` gains the clients' agent, command, skill and MCP configuration paths (review/70) and the other CI providers' definitions (review/75); no count fixed until the round lands |
| `amended` | 2026-10-16: the landed lists read from the tree (build/59): `PERSON_ONLY_PATHS` holds 57 globs, Copilot's workspace settings (review/106) and the cloud environment files (build/50) among them (`2fc0824b`, `ded883c6`); `CLAUDE_DENY_ROWS` holds 49 rows; line references re-pointed; open at the cap and named by u21: review/127–129, build/75–78, build/89 |

### u7-learn-read — a screened read verb for learnings

| Field | Content |
|---|---|
| `id` | u7-learn-read |
| `requirements` | REQ-FLOW-099, REQ-FLOW-088 |
| `files` | `src/cli/commands/learn.ts` (`:427-434`: a `read` choice beside `capture`; `--title` and `--summary` validated per subcommand through a `preAction` hook as `gate.ts:1528-1532` does), `src/learnings/store.ts` (the loader exposes each skip's pattern ids from its `detail`, `:236-240`, without the span), `test/cli/commands/learn.test.ts`, `test/hooks/scripts.test.ts` |
| `interfaces` | `stamity learn read [--json] [--body <id>]` prints `formatLearningsIndex(await loadValidatedLearnings({ rootDir, now, screenPrinted: true }), { now, patternIds: true })` (`src/cli/commands/learn.ts:507-521`) with each skip line naming its pattern ids; `screenPrinted` screens each printed field again as its YAML-decoded value (a hit skips the file `injection-detected` under its pattern ids) and strips a skipped file's name of C1, bidi, zero-width and tag-block characters (`src/learnings/store.ts:272-282`); `--body <id>` resolves the declared `id` first and the file stem only when no learning declares it (`learn.ts:534-541`) and prints that loaded learning's body with its warn-class material stripped (`printableBody`, `store.ts:724`); index JSON `{ learnings: [{ id, fileName, confidence, summary }], skips: [{ fileName, reason, patternIds: string[] }], totalBytes }` (no span, no other `detail`); `--body --json` → `{ id, fileName, body, stripped: [{ patternId, count }] }`, `body` the stripped text (`learn.ts:554-557`), and without `--json` a non-empty strip is reported on stderr by pattern id and count; exit 0, or 1 when there is no `.stamity/` (as `capture` refuses it, `learn.ts:176-198`), the folder cannot be listed, or a `--body` id is skipped, unknown, or declared by two learnings neither of whose stems is that id; `read` refuses `--dry-run` and capture's flags; `capture` still exits 2 without `--title` |
| `testCriteria` | A poisoned learning is skipped with its pattern ids and no span; a file carrying only a pattern the session-start screen lets through and the write gate refuses is refused by `read` (a parity row beside `test/hooks/scripts.test.ts:414`); `--body` of a skipped id → exit 1 naming the skip; a body holding invisible characters → `--body --json` prints the stripped `body` and `stripped` names `invisible-chars` with its count; no `.stamity/` → exit 1; `capture` without `--title` → exit 2 |
| `edgeCases` | No learnings folder under an existing `.stamity/` → an empty index, exit 0; no `.stamity/` at all → exit 1, never an empty index; an expired `reviewBy` → skipped `expired-review` with no pattern ids |
| `depends_on` | none |
| `verify` | `npx vitest run test/cli/commands/learn.test.ts test/hooks/scripts.test.ts test/learnings` |
| `threat` | Boundary: `.stamity/learnings/` (any writer) → model context. Trusts: the write gate's catalogue. Abuse: a hand-merged learning carrying an exfiltration directive, read raw by a hookless cloud run. Check: `read` loads through the full catalogue and never prints a span; the skill (u9) forbids opening a learning with the file tools |
| `amended` | 2026-10-15: `learn read` exits 1 when there is no `.stamity/`; `--body --json` carries `stripped: [{ patternId, count }]` and its `body` is the stripped text; printed fields screened again as decoded values, skipped names stripped, `--body` resolves the declared id first (build/18, review/34, review/35, review/40, review/41, `6cd93d17`) |

### u8-preflight-core — the pre-flight's checks as pure functions

| Field | Content |
|---|---|
| `id` | u8-preflight-core |
| `requirements` | REQ-FLOW-101 |
| `files` | new `src/runs/preflight.ts`, new `test/runs/preflight.test.ts` |
| `interfaces` | `type RestRead = (path: string) => Promise<{ status: number; json: unknown }>`. `runPreflight(deps: PreflightDeps): Promise<PreflightVerdict>`, `PreflightDeps = { env; nodeVersion; engines?; pinnedVersion?; runningVersion; scanRuns: () => Promise<boolean>; rest: RestRead \| null; repo: { owner; repo } \| null; ghRepoEnv: string \| null; canary: { at: string } \| null; now: Date; item?: { owner; repo; number }; floors: readonly { id; path; exists: boolean }[]; pushIdentity: { fetchUrl: string \| null; pushUrls: readonly PushUrlFacts[] }; reviewState: { counter: boolean; usageReviewLines: number } }` (`src/runs/preflight.ts:71-103`), the push identity as raw facts this module decides on: origin's fetch URL (`null` when it has none) and every URL `git push origin` pushes to, `PushUrlFacts = { url: string; helpers: readonly string[] \| null; authorizationHeader: boolean }` (`:57-69`) — `url` as `git remote get-url --push --all origin` prints it, `helpers` the `credential.helper` list git builds for that URL (`null` when an entry cannot be placed), `authorizationHeader` whether an `http.extraHeader` naming `Authorization`, generic or URL-scoped, applies to it; `PreflightVerdict = { ok: boolean; checks: { id: "hooks-loaded" \| "node-engine" \| "cli-pin" \| "gate-scan" \| "direct-push" \| "input-author" \| "floors"; state: "pass" \| "refuse" \| "unknown"; evidence: string }[]; refusals: { id; reason; fix }[]; warnings: { id: "cursor-egress" \| "token-env" \| "review-state"; names?: string[]; reason?: string }[] }` (`:44-50`), `ok` false on any `refuse` or `unknown`. `repo` is the `origin` repository (u4's `resolveRepo`, its `host` dropped); `null` (no origin, a non-GitHub host) → `direct-push` unknown. `direct-push`, in order: `GH_HOST` naming another host than the origin's (a `proxy` origin reads `github.com`) → refuse; `ghRepoEnv` (`[HOST/]OWNER/REPO`) unreadable, on another host, or naming another repository → refuse; `repo` null → unknown; `rest` null → unknown; then the push facts (`pushIdentityCheck`, `:566-629`), any unbound one → unknown with no REST read made and no URL or helper echoed: a fetch URL that does not resolve (u4's `resolveRepo`) to the checked repository → the fix "point origin at the GitHub repository the run pushes to"; no push URL → unknown; then every push URL in turn must bind — an Authorization header applying to it → the fix naming actions/checkout's `persist-credentials: false`, the proxy URL included; an ssh URL, an https URL carrying userinfo, or any other transport → the fix "use an https origin with `gh auth setup-git`"; a URL naming another host, owner or repository than the fetch URL's → the fix "point every push URL of origin at the repository its fetch URL names"; an https URL binds only when `helpers` holds exactly one entry and it is `gh`'s own `!<path to gh> auth git-credential` (`isGhCredentialHelper`, `:532-544`), `null`, empty or longer → unknown; a proxy-shaped URL binds, its platform app both identities, a named residual; then `directPushVerdict(rest, repo): Promise<"blocked" \| "open" \| "unknown">`: `GET /repos/{o}/{r}` (`default_branch`; `permissions.push` false → blocked); `GET /repos/{o}/{r}/rules/branches/{b}`, and for each `pull_request` or `update` rule `GET /repos/{o}/{r}/rulesets/{id}`: an `active` ruleset with `current_user_can_bypass` `never` or `pull_requests_only` blocks, `always` or absent is a bypass; an account with admin on the repository, or a reply with no rights block (`:319`), is blocked only by an active organization ruleset (`ruleset_source_type: "Organization"`) with bypass `never` or `pull_requests_only` whose conditions keep the default branch in scope against a repository admin's acts (`pinsDefaultBranch`, `:243-277`): a `ref_name.include` holding `~ALL` or `refs/heads/<default>` and no `exclude` that may match it (`~ALL`, `~DEFAULT_BRANCH`, a glob matching it, any class, brace or escape counted a match, `excludeMayMatch`, `:230-241`), no `repository_property` condition, and a repository condition present, by `repository_id` naming this repository's `id` or by `repository_name` with `include` holding `~ALL` and an empty `exclude`, absent or unreadable conditions not counting; and then only when `GET /user/memberships/orgs/{owner}` reads `role: "member"` (`organizationMember`, `:279-287`), an organization owner, any other role, or an unreadable role getting no exception; else `open` with the fix "run as an account or token without admin on this repository" (`unknown` beside an unread ruleset), and classic protection is never read for it; for any other account with no blocking ruleset `GET /repos/{o}/{r}/branches/{b}/protection`: blocked only with `required_pull_request_reviews` and the account outside `bypass_pull_request_allowances` (users matched against `GET /user`; listed teams or apps → unknown); a 403, a 404, or an unread ruleset beside an open verdict → unknown. `hooks-loaded` passes only on a canary at most 120 s before `now`, one dated after `now` refusing. `input-author`: `GET /repos/{o}/{r}/issues/{n}` then the author's permission on the `origin` repository, `GET /repos/<origin>/collaborators/{login}/permission`, `admin` or `write` passes. `token-env` names variables whose name or value is credential-shaped, never a value, and never a path-holding variable (`PWD`, `OLDPWD`, `HOME`, `PATH`, `TMPDIR`, `NODE_PATH`, `XDG_CONFIG_HOME`, matched by whole name only, `:751-757`) on the high-entropy row alone. `cursor-egress` warns when `CURSOR_AGENT_SOCKET` is set. `review-state` warns, its `reason` saying why, when the review gate holds no counter and the in-progress record has no `usage: review` line, or when every blocking ruleset reads `pull_requests_only` (the account can merge past the required review) |
| `testCriteria` | A ruleset with `current_user_can_bypass: "always"` (this repository's shape) → `direct-push` refuse; `pull_requests_only` for a writer → pass with a `review-state` warning naming the merge bypass; an administrator under a repository ruleset, or under classic protection with `enforce_admins` on or off → refuse with the admin fix; an administrator under an organization ruleset whose target is `~ALL`, the explicit default branch, `~ALL` with an exclude that cannot match it, or the repository by id, with a `member` role read → blocked (the role read made); the same administrator under a `~DEFAULT_BRANCH` target, another branch only, an exclude of `~DEFAULT_BRANCH`, a matching or character-class exclude, a repository name pattern, a `~ALL` name with an exclude, a repository property, an id list without this repository, no repository condition, no conditions or an unreadable ref condition → `open`, refused with the admin fix; an organization owner, a 404 or a 403 role read → no exception, refused; a writer under a `~DEFAULT_BRANCH` organization ruleset → blocked, no role read; a write token, no ruleset, protection 404 → unknown → refuse; an `evaluate`-mode ruleset is not active and does not count; `repo` null → refuse; `GH_REPO=other/repo` beside an `origin` of `o/r` → refuse; `GH_HOST` naming another host beside a proxy origin → refuse; a push URL that is ssh, `ssh://`, https carrying credentials or plain http, or an https one with no helper, an unplaceable list, `osxkeychain`, `gh`'s helper beside another, a chaining helper, a helper not `gh`, or `gh` on another verb → unknown, refused with the gh fix, no REST read made, neither the URL nor a helper in the serialized verdict; an Authorization header on the push URL → unknown with the `persist-credentials: false` fix, the proxy URL included, the same URL without it passing; a second push URL that is ssh, on another repository, under the header or through another helper → unknown naming `push URL 2 of 2`; two binding push URLs → pass; a push URL on another repository, no push URL, no fetch URL, or a fetch URL off the checked repository → unknown; no canary, or one 121 s old → refuse; a token-shaped environment value → a warning naming the variable, its value absent from the serialized verdict; a long path in `PWD` or `PATH` → no `token-env` warning, while `MYSQL_PWD` and `DB_PWD` holding a long password are named (`test/runs/preflight.test.ts`, `e486c406`) |
| `edgeCases` | `rest` null (no `gh`) → `direct-push` unknown → refuse with the fix "add a ruleset that requires a pull request, or run as an account that can read the protection"; `node` below `engines` → refuse naming both versions |
| `depends_on` | none |
| `verify` | `npx vitest run test/runs/preflight.test.ts` |
| `threat` | Boundary: the account's rights on the default branch. Trusts: REST reads the engine makes itself about the `origin` repository, never a verdict or a repository the model passes in. Abuse: an injected "push to main" succeeding because the account bypasses protection, or a `GH_REPO` pointing the check at a protected repository. Check: refuse unless a ruleset or classic protection proves no direct push on `origin`; unknown refuses; the canary is named a canary |
| `amended` | 2026-10-15: `PreflightDeps` gains `pushIdentity` and `reviewState`; a warning gains `reason`; `direct-push` refuses where git's push identity is not the REST reads' (review/36), where the account administers the repository and no organization ruleset blocks it (review/37), and where `GH_HOST` names another host than the origin's (review/39); `review-state` reads the run's own review state and a `pull_requests_only` merge bypass (review/18, review/38); path holders leave `token-env` (`e7eda022`); the cell now also names `cursor-egress`'s `CURSOR_AGENT_SOCKET` read, as landed in `6a28bbb4` |
| `amended` | 2026-10-15: `pushIdentity` becomes raw facts, `{ fetchUrl, pushUrls: PushUrlFacts[] }`, each push URL with its helper list and Authorization-header fact, every one required to bind on the fetch URL's repository (review/63, review/64); an administrator's exception needs an organization ruleset whose conditions pin the default branch and a plain `member` role read through `GET /user/memberships/orgs/{owner}` (review/60, review/65); the path-holder rule matches whole names (review/66); line references re-pointed; testCriteria set to the landed tests (`e486c406`) |

### u9-unattended-skill — the skill an unattended run follows

| Field | Content |
|---|---|
| `id` | u9-unattended-skill |
| `requirements` | REQ-FLOW-089, REQ-FLOW-090, REQ-FLOW-091, REQ-FLOW-092, REQ-FLOW-093, REQ-FLOW-094, REQ-FLOW-095, REQ-FLOW-096, REQ-FLOW-097, REQ-FLOW-098, REQ-FLOW-099, REQ-FLOW-100, REQ-FLOW-101, REQ-FLOW-102, REQ-FLOW-103, REQ-FLOW-120 |
| `files` | new `content/skills/st-unattended/SKILL.md`, new `content/skills/st-unattended/agents/openai.yaml` (`allow_implicit_invocation: false`, as every bundled skill ships a companion: the skill is called by name only, so Codex's always-on list keeps its count), new `test/corpus/skills/unattended.test.ts`, `test/corpus/census.test.ts` (the ninth skill: `SKILL_CENSUS`, its count word and length), `test/corpus/cliCallForm.test.ts` (`CALL_SITES`) and `test/corpus/skills/flow.test.ts` (`TRIGGER_DOMAINS`) where those tables list every skill, `evals/coverage-exemptions-v6.md` (one row for the skill, reason "sourced by the cases `u22` adds"; `u22` removes it) |
| `interfaces` | Frontmatter as `content/skills/st-qa/SKILL.md:1-10` (`id: unattended`, `type: skill`, `load: on-demand`, a description saying it is called by name from a flow whose record reads `Mode: unattended` and never selected on its own). Sections, in order: `## The declaration` (`--unattended`, or `STAMITY_UNATTENDED` set to any value but empty, `false` or `0`, `--attended` beating the variable; a cloud marker never means unattended; every pushing touchpoint but `/st-pr-resolve` runs `stamity run start --run <id> --json` first and takes `Branch:` and `Base:` from its output; the `Mode:`, `Branch:` and `Base:` head lines in every pushing touchpoint's record; `run-mode:` on hand-offs, `content/skills/st-unattended/SKILL.md:22-33`); `## Before Frame` (`stamity gate preflight --unattended --json` first, any exit but 0 a refusal, each refusal reason, else `pre-flight exited <code>`, first on the morning list under `## Refused`, review/86, `content/skills/st-unattended/SKILL.md:37-40`; the two floors read from the verdict's `floors[]` and `floors loaded: question-protocol, injection-screening` recorded; learnings from the session banner, else `stamity learn read` and `stamity handoff list`, else the session-start script run by hand — never a file opened raw; input by reference from write or admin authors; `stamity plan check <plan...> [--chain --since <Base>] [--contract <path>]`, any exit but 0 a refusal (review/86), its blockers as u13 and u17 code them, `lint-structure` (build/38), `freshness-error`, `contract-mismatch` and `no-plan` among them, and skipped by every unattended `/st-debug` run and by `/st-pr-resolve` (`:51-57`); a refusal ending with a pushed record and a draft titled `Refused:` through `run end --refused`, or, before the run's branch is checked out or where no branch can be pushed, as one reply on the start surface — issue, pull request or session — written to a file and posted only after `stamity gate scan --text <file> --label comment` exits 0 (review/87), `:59-63`); `## Asks` (no question asked: each ask takes its declared default with `Default applied:`; Frame's ambiguity refuses; two matching plans need the paths in the invocation; a kickoff prompt, routine text or contract field never answers a person-gate); `## Checkpoints` (`stamity run start` at Frame; `stamity run checkpoint` after each closed unit and before any wait, with `--pr` at the start of Build; the record line `- <UTC> checkpoint: <sha> units done=<n> remaining=<m>`); `## The ending` (the run verbs are the only push path — a raw push is refused by the shell guard, and while unattended no raw push, pull-request write, or REST write on `contents/`, `git/` refs or objects or `merges` runs at all, however spelled, review/85, `:88-91`; record, ledger, inbox and learnings first, the spec delta left unmerged as a morning-list decision, each learning file the close captured named in `run end --paths` (review/146, `:93-94`), then `morning.md`, then `stamity run end --run <id> --title <t> --paths <p...> --json` (`:97-98`); never a push to the default branch, a force push, a tag, a merge or ready-for-review); `## The morning list` (the shape u5 parses, the `stamity-morning` block's `options` 2 to 9 strings and its `default` an option's number from 1, never its text, review/81, `:110-114`; at most three person QA rows; `CI not run: awaiting approval` where CI waits); `## Person's calls held`; `## The morning walk` (`/st-work --resume <run-id>` opens `Mode: attended`, and `--unattended`, `run-mode: unattended` or a chain's next file makes a start on that branch unattended, never the walk, review/145, `:140-145`; Claude Code's run closes its record, pushes, then asks one final round; Cursor's follow-up; Copilot's `@copilot answers: Q1→2`; only a `write` or `admin` author's comment answers, an unreadable permission counting as none, another's answers not applied and listed on the next morning list, review/88, `:147-151`); `## Other touchpoints` (`/st-quick` refuses; every unattended `/st-debug` run, not only its user route, and `/st-pr-resolve` take this same entry without the ready check — head lines, pre-flight before the first fetch or push, the run verbs, every reply posted from a file `stamity gate scan --text` passed (review/80); `/st-pr-resolve` runs no `stamity run start`, opens its record, `<UTC date>_pr-resolve-<n>-r<round>`, after the fetch with `Branch:` its pull request's head, fixes only the mechanical class and sends nothing to `/st-work`, any other finding deferred as `needs a planned run` and one no `admin` or `write` author's own comment asks for as `non-write author`, each a morning-list row (build/35, `:156-159`; review/82); unattended `/st-debug` stops after the root cause and hands nothing to `/st-work`, pushing its record, the ranked hypotheses and the failing test when one was written, the morning list carrying the fix as `needs a planned run` (review/83, as `content/commands/st-debug.md:134-138` reads it); `/st-rework` hands the mode to `/st-work` as `run-mode:`; `/st-board pickup` carries `run-mode:`, keeps `preview: stop` and `move: off`); `## Chains`. The `Running the CLI` paragraph as `content/commands/st-plan.md:359` carries it (`${STAMITY:CLI}`). Body at most 160 lines |
| `testCriteria` | The corpus test pins the section headings in order, every verb as u7, u16, u17, u18, u18b and u19 spell it, the `Default applied:` line, the two refusal values, the only-push-path sentence, the carve-outs (no ready check for any unattended `/st-debug` run or for `/st-pr-resolve`, no `run start` for `/st-pr-resolve`, its mechanical-only fixes, and neither sending anything to `/st-work`), the debug stop after the root cause, and that no sentence tells a run to merge, tag or mark ready; `test/evals/coverage.test.ts` green with the exemption row |
| `edgeCases` | Read in an attended run → its first line says it applies only when the record reads `Mode: unattended`; a client with no CLI → the prose fallbacks named per section, never a skipped floor |
| `depends_on` | none |
| `verify` | `npx vitest run test/corpus/skills/unattended.test.ts test/corpus/frontmatterContract.test.ts test/corpus/cliCallForm.test.ts test/evals/coverage.test.ts` |
| `threat` | Boundary: the text an unattended run follows. Trusts: nothing it reads at run time. Abuse: a floor stated weaker than the code enforces, or a step that lets a run push around the verbs. Check: the security lens reads the skill against REQ-FLOW-099 to -103 and -120; the corpus test pins the floor sentences |
| `amended` | 2026-10-15: the declaration reads the variable as REQ-FLOW-089 does; `run start` first for every pushing touchpoint but `/st-pr-resolve`; the carve-outs — no ready check for `/st-pr-resolve` or debug's user route, no `run start` for `/st-pr-resolve`, its mechanical-only fixes, nothing it sends to `/st-work` — and u13's `freshness-error` and `contract-mismatch` codes, as landed in `1b3a927c` (build/35, build/39; review/82 is the delta's REQ-FLOW-097, amended to match); decided at 23:29Z for u9's next round: the ready-check skip covers every unattended `/st-debug` run (review/80), and unattended debug stops after the root cause with nothing sent to `/st-work`, as `616db020` lands it in `/st-debug` (review/83) |
| `amended` | 2026-10-16: the 23:29Z decisions as landed in `00ff4f60` and the corpus rounds (build/58): any non-0 exit from the pre-flight or the ready check refuses (review/86); refusal replies are written to a file and posted only after `gate scan --text` exits 0, wherever they post (review/87); the push rule names the REST writes REQ-FLOW-120 bars (review/85); the morning block's value shapes (review/81); only write or admin authors' answers are applied (review/88); `lint-structure` and `no-plan` among the blockers (build/38, build/83); the ending names the learning files in `run end --paths` and leaves the spec delta unmerged (review/146, `9e2afdef`); the walk pointer's unattended-start exception (review/145) |

### u10-board — the mode passes through pickup; the author rule holds unattended

| Field | Content |
|---|---|
| `id` | u10-board |
| `requirements` | REQ-FLOW-089, REQ-FLOW-097, REQ-FLOW-100, REQ-BOARD-002, REQ-BOARD-005 |
| `files` | `content/commands/st-board.md` (the pickup payload `:126-133` gains `run-mode:`; `:347-348` a hand-off read from disk carries `run-mode: attended`; the author rule `:313-318` "is public" → "is public, or the run is unattended"; each region rewrapped within its own line count, so the file stays within `test/corpus/commands/board.test.ts:37`'s cap and no later range moves), `test/corpus/commands/board.test.ts` (`:1681-1698`), `evals/cases-v6/adversarial/board-item-directive-is-data.md` (its quote of `:307-318`) and, only if a region's count must change, every case whose `st-board.md` range starts after it (`vague-deferral-without-place-refused`, `board-write-back-four-channels`) |
| `interfaces` | The payload line `run-mode: attended \| unattended`. `evals/SET-v7.md`'s index rows for the re-quoted cases are written by `u15`, not here |
| `testCriteria` | `board.test.ts` green with the body cap held and `run-mode:` pinned; the author rule names the unattended case; `test/evals/locators.test.ts` green |
| `edgeCases` | A hand-off read from disk naming `run-mode: unattended` → read as attended (only this session's invocation declares); the board's return `mode` field unchanged |
| `depends_on` | none |
| `verify` | `npx vitest run test/corpus/commands/board.test.ts test/evals/locators.test.ts` (the roster test waits for `u15`'s index rows) |

### u10b-debug-quick — debug's unattended entry and mode hand-off; quick refuses

| Field | Content |
|---|---|
| `id` | u10b-debug-quick |
| `requirements` | REQ-FLOW-089, REQ-FLOW-097, REQ-CTX-012 |
| `files` | `content/commands/st-debug.md` (an **Unattended** paragraph under Run record `:56-68`: the variable read as unattended for any value but empty, `false` or `0`, `--attended` beating it; `stamity run start --run <run-id> --json` first, before step 1, the record opening on it with `Mode: unattended`, `Branch:` and `Base:` from its output; the `st-unattended` skill invoked by name so the pre-flight runs before any sub-agent is briefed; every unattended exit — the user-route stop, step 7's stop after root cause, the `--diagnose` report, `BLOCKED_FAILURE` at `root-cause-before-fix`, the escape valve — pushed through the skill's ending; the user-reproduction route unattended `:108-115`: strip the instrumentation, rewrite `Status:` to `closed <date> (blocked: a person reproduces)`, push the record with the ranked hypotheses through `stamity run checkpoint --run <run-id> --pr --title <title>`, the failing test only if written, return `BLOCKED_DEPENDENCY`; step 7 `:131-138`: the attended hand-off carries `run-mode:`, and unattended the run stops after gate `root-cause-before-fix`, as `--diagnose` does, hands nothing to `/st-work`, step 6 not run and step 8 run, the fix deferred as `needs a planned run`, a morning-list row, and pushes the record, the ranked hypotheses and gate 2's test when one was written), `content/commands/st-quick.md` (`:16-21`: an unattended run refuses and names `/st-work --effort light`, rewrapped within the region's lines), `test/corpus/commands/lightTrio.test.ts` (debug's pins `:798`, `:896` — the attended head stays three lines — and quick's), the debug cases whose ranges move (`debug-deterministic-bug-reproduced-in-process`, `debug-no-reproduction-blocks`, `debug-root-cause-before-fix`, `debug-next-step-derived-from-run-state`) and, only if quick's region count must change, the twelve `quick-*` cases and `benign-small-change-quick-proceeds` |
| `interfaces` | The pointer: the Unattended paragraph (`st-debug.md:56-68`), which writes `Mode:`, `Branch:` and `Base:` from `stamity run start`'s output and invokes the `st-unattended` skill by name. The unattended stop: "Unattended, the run stops after gate `root-cause-before-fix`, as `--diagnose` does, and hands nothing to `/st-work`" (`:134-135`). Quick's refusal: "An unattended run does not take /st-quick: run `/st-work --effort light` instead." `evals/SET-v7.md`'s index rows are `u15`'s |
| `testCriteria` | Step 7's attended hand-off names the mode; the Unattended paragraph, the unattended stop after root cause with nothing handed to `/st-work` and the fix deferred as `needs a planned run`, and quick's refusal pinned; the attended debug head pin unchanged; `locators.test.ts` green |
| `edgeCases` | An attended user route → unchanged ("Stop and wait"); an attended default run → step 7 hands the fix to `/st-work` as before; an unattended route with no failing test written → the record and hypotheses pushed, the test named not written on `Not done:`; an unattended run with the root cause found → no `/st-work` hand-off, the record, hypotheses and any written test pushed |
| `depends_on` | none |
| `verify` | `npx vitest run test/corpus/commands/lightTrio.test.ts test/evals/locators.test.ts` |
| `threat` | Boundary: an unattended debug run → a push. Trusts: the skill's floors. Abuse: a debug run pushing around the pre-flight and the held paths. Check: the pointer sends it through the skill and the run verbs; the shell guard reads debug records too and refuses a raw push (u14) |
| `amended` | 2026-10-15: the unattended entry is a paragraph under Run record (`run start` first, the three head lines from its output, the user-route stop closing the record; review/9, review/10, review/15, review/17, `0a15b525`), every unattended exit pushed and the variable read for any value but empty, `false` or `0` (review/11, review/13, `833349eb`); an unattended run stops after the root cause, hands nothing to `/st-work` and defers the fix as `needs a planned run` (review/83, `616db020`); line references re-pointed |

### u11-rework-pr-resolve — rework passes the mode; PR-resolve's unattended entry and write authors only

| Field | Content |
|---|---|
| `id` | u11-rework-pr-resolve |
| `requirements` | REQ-FLOW-097, REQ-FLOW-100, REQ-CTX-012 |
| `files` | `content/commands/st-rework.md` (`:263-273`: execute-now hands the mode to `/st-work` as `run-mode: unattended \| attended`, the variable read as unattended for any value but empty, `false` or `0`), `content/commands/st-pr-resolve.md` (the Unattended pre-flight row `:54`: it calls the `st-unattended` skill by name and follows its `/st-pr-resolve` entry, which runs no `stamity plan check` and no `stamity run start`; the pre-flight names the pull request as `--item <owner>/<repo>#<n>` before the first fetch; `Branch:` (the head ref) and `Base:` (the head sha) come only from the pull request's first metadata read; a head ref failing the allowlist or naming the default branch is refused, and so is a same-named local branch whose tip is neither that sha nor its ancestor, never reset; every fork is refused (`:55`); an exit before checkout — a refusal, a failed fetch or a failed checkout — pushes nothing and ends as one scanned comment on the pull request, before the record opens writes no record, and after it rewrites `Status:` to `closed <date> (refused: <reason>)`, as every later exit rewrites it through the skill's ending, so no exit leaves the record `in progress` (`:54`); a fetch-result guard skips every comment carrying the run marker `<!-- stamity:run `, whoever posted it, by literal substring, its body neither stored nor screened and each skipped id listed in the proof block (`:83-90`); the record, `.stamity/runs/<UTC date>_pr-resolve-<n>-r<round>/record.md`, opens only after the fetch-result guards fix the round, with `Status: in progress`, `Mode: unattended`, `Plan: none — pr-resolve #<n>`, `Invocation:`, `Branch:` and `Base:` bare among its first 15 lines; the head is then checked out under the `Branch:` name on `Base:`; §1 `:154-188`: each comment author's permission read through `GET /repos/{o}/{r}/collaborators/{user}/permission` and recorded per comment, `author_permission: {<comment id>: admin \| write \| read \| none \| unknown}`, and a non-write comment never merges into a finding holding a write author's, so its text reaches no `quoted:`, brief or fix; §3 `:236-248`: the write-author row second, after SCREENED — no comment in the finding by an admin or write author → DEFER, rationale `non-write author`, a morning-list row; §4 `:271-274`: unattended, only the mechanical class is fixed, through its own `fixer`, every other finding a FIX route reached DEFER as `needs a planned run`, and nothing goes to `/st-work`; every reply written to a file under that run folder and posted with `-F body=@<file>`, which `gh` reads as the file's content sent as a string, the field-typing rule's one exception, so the body never rides the command line (`:323-333`), only after `stamity gate scan --text <file> --label reply` exits 0; pushes go through `stamity run checkpoint --run <its id>` to the pull request's head, never a new branch; `stamity run end --run <its id> --title "pr-resolve #<n>"` then finds that open pull request and, its body carrying no run marker, posts the morning list as one comment), `test/corpus/commands/feedbackPair.test.ts`, the cases whose ranges move (`rework-next-step-derived-from-run-state`, `pr-resolve-next-step-derived-from-run-state`) |
| `interfaces` | The DEFER row reuses DEFER's reply (`st-pr-resolve.md:310`), so every terminal state still has one (`:231-234`); the run verbs push the checked-out branch and refuse, as `branch mismatch`, when it is not the record's `Branch:` (build/93, u18b); `evals/SET-v7.md`'s index rows are `u15`'s |
| `testCriteria` | The write-author row exists, second after SCREENED and above every FIX row; the permission endpoint and its per-comment record, the pointer sentence (no `plan check`, no `run start`), the `-r<round>` folder opened after the fetch, the mechanical-only sentence, the run-marker row, the every-exit close of the record, the field-typing exception, and the scanned-reply sentence with `-F body=@<file>` pinned; rework's hand-off names `run-mode:`; `locators.test.ts` green |
| `edgeCases` | A review bot with no repository role → `unknown` → report-only; a failed permission read → `unknown` → report-only; a reply the scan holds → not posted, its line and rule on the morning list |
| `depends_on` | none |
| `verify` | `npx vitest run test/corpus/commands/feedbackPair.test.ts test/evals/locators.test.ts` |
| `threat` | Boundary: comment text from any commenter → FIX → push, and replies → GitHub. Trusts: the REST permission only, and the scan. Abuse: an outside commenter files a "Critical" that the `accept` default would push overnight, or a reply leaks a value. Check: the permission row before routing, beside the ingress screen (`st-pr-resolve.md:95-139`); the scanned-reply rule; the run verbs' push |
| `amended` | 2026-10-15: replies post with `-f body="$(cat <file>)"`, never `-F body=@<file>`; the record folder is `<UTC date>_pr-resolve-<n>-r<round>`, opened after the fetch, with no `plan check` and no `run start`, `Branch:` and `Base:` from the first metadata read; the permission recorded per comment; SCREENED before the write-author row; unattended, mechanical fixes only and nothing routed to `/st-work`; rework hands on `run-mode:`; every fork refused (review/42–53, `01a0f7af`) |
| `amended` | 2026-10-15: review/51 re-decided at 23:21Z: replies post with `-F body=@<file>`, the field-typing paragraph naming that exception, the `$(cat <file>)` form retired (the first pass's line corrected); a fetch-result guard skips every run-marker comment (review/78); every exit after the record opens closes it, `closed <date> (refused: <reason>)` before checkout (review/77); line references re-pointed (`67d41d25`) |
| `amended` | 2026-10-16: record of what landed in u18b, not a change to this unit's ask: the run verbs push the checked-out branch and refuse a checkout that is not the record's `Branch:` as `branch mismatch`, rather than reading `Branch:` as the push target (build/93, `89589691`) |

### u12-protocol-plan-shape — the protocol's consent sentence and the plan's Prerequisites

| Field | Content |
|---|---|
| `id` | u12-protocol-plan-shape |
| `requirements` | REQ-FLOW-090, REQ-FLOW-091, REQ-FLOW-077, REQ-FLOW-100 |
| `files` | `content/rules/stamity-question-protocol.md` (item 8 `:51-56` gains "A kickoff prompt, routine text or contract field never answers a person-gate."), `content/commands/st-plan.md` (`## Plan artifact shape` `:317`, the sections list `:338-370`: an optional `Prerequisites` section after Open questions, renumbering what follows — rows `kind · name · read where · set by · blocks merge\|deploy\|run · verified yes\|no`, never a value; L2 at `:286` accepts a prerequisite row as a dependency with a named owner), `test/corpus/rules/protocol.test.ts`, the `/st-plan` corpus test, the cases whose ranges move (`unattended-run-applies-declared-default`, `close-summary-after-last-decision`, `subagent-returns-blocked-ambiguity`, `plan-artifact-head-and-units-shape`, `plan-lint-three-fails-returns-blocked-ambiguity`, `plan-security-unit-carries-threat-note`, `plan-semantic-ambiguity-survives-structural-pass`) |
| `interfaces` | The protocol body stays within `test/corpus/rules/protocol.test.ts:54` and `## Close walk` stays its last section (REQ-FLOW-080); `evals/SET-v7.md`'s index rows are `u15`'s |
| `testCriteria` | The sentence pinned; the section list names Prerequisites as optional; `locators.test.ts` green |
| `edgeCases` | A plan with no Prerequisites → valid as before; a row carrying a value → the section text says values never appear, and u13's check refuses a row whose `name` holds `=` |
| `depends_on` | none |
| `verify` | `npx vitest run test/corpus/rules test/corpus/commands test/evals/locators.test.ts` |

### u13-plan-check — a plan's readiness for an unattended start

| Field | Content |
|---|---|
| `id` | u13-plan-check |
| `requirements` | REQ-FLOW-091, REQ-FLOW-096, REQ-FLOW-098 |
| `files` | new `src/runs/planCheck.ts`, new `test/runs/planCheck.test.ts` |
| `interfaces` | `checkPlans(plans: { path; text }[], deps: { specs: { path; text }[]; git: GitRunner; cwd: string; chain?: { since: string }; contract?: { path; text } }): Promise<PlanCheckResult>`; `PlanCheckResult = { ready: boolean; plans: { path; ready; head: { id; intent; stamp: { sha; date } \| null; reads: string[]; dependsOn: string[] }; blockers: { code; line?: number; message }[]; advisories: { code; message }[]; freshness; lint: { L1: "not-checked"; L2: "pass" \| "fail"; L3: "pass" \| "fail"; L4: "pass" \| "fail"; L5: number } }[]; contract?: { ok; problems: string[] } }`. Blocker codes: `needs-clarification` (any clarification marker — the square-bracketed `NEEDS CLARIFICATION` tag `/st-plan` defines — fenced or not; a plan describing the marker names it without the brackets), `open-questions` (no `## ` heading whose name, numbering dropped and lower-cased, starts `open questions`, absent not reading as `None.`; or that section's unfenced, non-blank lines, joined, reading other than `None` or `None.` in any case, an empty section included, `src/runs/planCheck.ts:374-394`, the sections read by `sectionRows`, `:353-371`, fenced lines skipped), `critical-risk` (an unfenced line of a section whose name starts `risks` that is a bullet — `-`, `*`, `+` or numbered — or a table row opening with `\|` with a cell, led by `Critical` as a word past any emphasis or code markup, so bold or plain, with or without a colon, `CRITICAL_LEAD` and `isCriticalRisk`, `:170-173`, `:395-412`; a paragraph line, a severity after the text and a table row with no leading pipe are not read, build/42 and its two shapes, open Minors), `lint-L2` (the `.mjs`'s dependency codes, `dangling-dependency` and cycles), `lint-L3` (a unit whose `edgeCases` from `parsePlanUnits` is empty, `none` without a reason), `lint-L4` (its requirement codes: `dangling-requirement`, `invalid-reference`, `missing-coverage`, duplicate definitions), `lint-structure` (`missing-units`, `duplicate-unit`), `head-key-missing` (`id`, `intent`, `stamp`, `reads`), `stale`, `stamp-unresolved` (u3), `chain-order` (with `chain`, each file's head `depends_on` names the previous), `prerequisite-open` (a Prerequisites row neither verified nor owned, or one whose name holds `=`), `contract` (each of u3's problems, as u3 words it, on every plan checked, a problem carrying `: prerequisite-open:` taking that code instead, `readContract`, `:499-509`; `ready` also needs the contract's `ok`, `:200-206`), `contract-mismatch` (a contract that parsed and whose `plan` names none of the plans checked, by path resolved against `cwd` or by head `id`, whatever its `item` says, one blocker on every plan, its message naming the key and never the value; an item-only contract, or one that did not parse, gets none, since a board item names no plan and the pickup's own ready read ties the item to its plan, `contractMismatch`, `:511-527`); `freshness-error` (u3's `error`: git failed to measure, its reason named); `provisional-definition` and the size codes are advisories. With `chain`, freshness takes `exemptSince = chain.since` (the run's `Base:`). Head parsed by `parseFrontmatter` (`src/content/frontmatter.ts:79-86`) |
| `testCriteria` | One fixture per blocker code → `ready: false` naming it with its line; a clean plan → `ready: true`; `None.` open questions pass, a plan with no Open questions section → `open-questions`; a Critical risk as a bold or plain bullet, with or without a colon, or as a table row → `critical-risk`; a contract whose `plan` names no checked plan → `contract-mismatch` whatever `item` says, an item-only contract → no mismatch; the freshness measure's throw path → `freshness-error`; L1 always `not-checked`; every `.mjs` finding code maps to one blocker or advisory (a table test) |
| `edgeCases` | An absent optional head key (`depends_on`, `approach`) passes; with `chain`, a second file naming an unknown predecessor → `chain-order` |
| `depends_on` | u2-coverage-port, u3-freshness-contract |
| `verify` | `npx vitest run test/runs/planCheck.test.ts` |
| `amended` | 2026-10-15: `contract-mismatch` reads only the contract's `plan` (review/54); an absent Open questions section refuses as `open-questions` (review/56); a Critical risk refuses in any spelling a Risks bullet or table row carries (review/57); the throw path tested (review/58) (`a47e11d6`) |
| `amended` | 2026-10-16: the contract, open-questions and critical-risk rules restated as landed at `af4de065` — contract problems on every plan, `prerequisite-open` split out, `ready` needing the contract's `ok`, the mismatch only for a parsed contract with a `plan` and naming no value; the Open questions section found by heading prefix past numbering, its unfenced body reading `None` or `None.`; Critical risks read only on unfenced Risks bullets and `\|`-led table rows, the unread shapes left as build/42's open Minors; line references re-pointed |

### u14-shell-guard — the person-only shell guard, with the unattended push rule and the canary

| Field | Content |
|---|---|
| `id` | u14-shell-guard |
| `requirements` | REQ-FLOW-101, REQ-FLOW-102, REQ-FLOW-120 |
| `files` | `src/hooks/scripts.ts` (a core script `stamity-person-only-guard.mjs` in `planCoreHookScripts` `:3039-3070`, emitted under `.stamity/generated/hooks/<client>/` for every selected client, with its row in `HOOK_SCRIPT_BUDGETS` `:137-162`), `src/mcp/env.ts` (`REQUIRED_GITIGNORE_ENTRIES` `:193-198` gains `.stamity/preflight-canary.json`), `src/cli/commands/init/panel.ts` (`GITIGNORE_REASONS` `:744-749`), `src/worktree/policy.ts` (`:205`), new `test/hooks/personOnlyGuard.test.ts`, `test/hooks/scriptBudget.test.ts` (`:51`, `:138`), and the four tests that pin the gitignore entry list, `test/mcp/env.test.ts`, `test/cli/commands/init.test.ts`, `initPanel.test.ts` and `syncEngine.test.ts`, each gaining the canary's entry (build/45, `c21fd771`); the canary's entry takes its own covering patterns, never the review gate's prefix (build/48, `47b6e953`) |
| `interfaces` | The guard reads the command from each client's payload (Claude Code `tool_input.command`; Cursor `command`; Copilot and Codex through the runtime map, `src/hooks/portableRunner.ts:115-117`), embeds `personOnlyVerdict` and `unattendedPushVerdict` (u6) as `NORMALIZE_FOR_SCREEN` is embedded (`scripts.ts:786`), and is rendered only when `planCoreHookScripts` is given `personOnlyGuard: true` (`src/hooks/scripts.ts:3701-3719`), which u20 passes for every selected client with no user-facing switch (build/44). It reads the branch where the command runs (review/94): the payload's working directory (`cwd`, resolved against the repository root, else the root, `decide`, `:3643-3644`), then each place a command on the line moves git to (`placesOf`, `:3370-3485`) — `cd`, `pushd`, `chdir`, PowerShell's `Set-Location`, `sl` and `Push-Location` in any letter case with `-Path` or `-LiteralPath`, `cd..`, `env -C` or `--chdir`, a `GIT_DIR=` assignment or `$env:GIT_DIR` (review/117), and git's own `-C` and `--git-dir` — each read only at a command position (a line's start, or after `;`, `&&`, `\|\|`, `\|`, `(`, a keyword, an assignment or a wrapper) and inside a shell's command-string argument (`sh -c`, `bash -c`) or `eval`, as the shell itself reads them, a quoted word elsewhere being data (review/116, `:3398-3406`); at each place, with `fs`, the current branch from that git dir's `HEAD` (a `gitdir:` file followed), the default branch from `refs/remotes/origin/HEAD` and the local tag names from `refs/tags/` and `packed-refs`, `main` and `master` always counted (`contextsOf`, `:3487-3510`), where a `HEAD` naming no branch and no commit, or a reftable repository, reads as unreadable and an implied destination there counts as the default branch, denied (review/118); `personOnlyVerdict` runs once per place, so an implied push is refused when any place the line names is on the default branch or unreadable (build/63, an open Minor), passing the tags as `ctx.tags` so a push naming a tag by its bare name is denied; and the mode, read only when `unattendedPushVerdict` denies the call, so an unreadable record refuses no other call (review/95, `:3649-3654`), by reading run records directly — unattended when any record under `.stamity/runs/` (the 50 newest run folders by name, heads only) reads `Status: in progress` and `Mode: unattended`, debug records (`_debug-`, which the resume card's selection skips, `src/runs/layout.ts:156-160`) included — or when `STAMITY_UNATTENDED` is set and no in-progress record reads `Mode: attended` (the variable governs a record with no `Mode:` line, such as one opened by an older version), the unattended refusal naming up to three such records by repository path, else the variable (review/96, `unattendedBy`, `:3571-3603`); a deny exits 2 with the reason on stderr on Claude Code and Codex, the client's deny output on Cursor and Copilot; when the command names `gate preflight` it writes `{ "at": "<ISO>" }` to `.stamity/preflight-canary.json` and allows; a payload that is not a shell call → allow at once; an internal error denies (fail closed, shell tools only). Wiring is `u20`'s |
| `testCriteria` | The built guard, run with each u6 matrix payload in each client's shape → deny or allow as the table says; `git push` with `.git/HEAD` on `main` → denied; with an in-progress record reading `Mode: unattended`, `git push origin HEAD:refs/heads/x` and `gh pr create` → denied, `npx --no stamity run end --run x` → allowed; the same with only an in-progress `_debug-` record reading unattended → denied; an attended record opened beside an in-progress unattended one → still denied; a `gate preflight` command → the canary written and the call allowed; the budget test lists the script |
| `edgeCases` | A worktree whose `.git` is a file → its `gitdir:` followed; a payload `cwd` in a linked worktree on `main`, or a `cd`, `pushd`, `Set-Location` or `git -C` into one at a command position, and a refspec-less `git push` → denied, the same from a feature worktree → allowed; `cd`, `GIT_DIR=` or `git -C` inside a quoted commit message → data, no place added; an unreadable or placeholder `HEAD` (reftable) → the implied destination counts as the default branch, denied; a detached `HEAD` → no current branch, an implied push not read as a default-branch push; no `origin/HEAD` → `main` and `master` only; an unreadable run record → a raw push and `gh pr create` refused, every other call unaffected; no record and no variable → the always-on table only |
| `depends_on` | u1-record-head, u6-person-only-tables |
| `verify` | `npm run build && npx vitest run test/hooks` |
| `threat` | Boundary: the main agent's shell calls → the remote. Trusts: the command text; the record head and the environment for the mode. Abuse: a respelled push, or a steered run unsetting the variable or rewriting `Mode:` to push around the run verbs. Check: the always-on table never depends on the mode; the unattended rule names its residual (a rewritten head) on `SECURITY.md`; the REST check stays the wall |
| `amended` | 2026-10-16: the branch is read where the command runs — the payload's `cwd`, then each directory change and git `-C` or `--git-dir` at a command position, PowerShell's location commands and `$env:GIT_DIR` included, a quoted word elsewhere being data — and a placeholder or unreadable `HEAD` counts as the default branch (review/94, 116, 117, 118; `47b6e953`, `e57c6656`); the mode is read only for a call the unattended rule refuses (review/95), whose refusal names its records or the variable (review/96); the guard rendered behind `personOnlyGuard`, which u20 passes (build/44), and the four gitignore-pinning tests in its boundary (build/45) (build/60); open at the cap: review/153, 154 (u21 names them) |

### u14b-ask-gate — the unattended ask gate on Claude Code

| Field | Content |
|---|---|
| `id` | u14b-ask-gate |
| `requirements` | REQ-FLOW-090, REQ-FLOW-095 |
| `files` | `src/hooks/scripts.ts` (an adapter-placed builder `buildUnattendedAskGate`, placed as the review gate's is, with its row in `HOOK_SCRIPT_BUDGETS`), new `test/hooks/unattendedAskGate.test.ts`, `test/hooks/scriptBudget.test.ts` |
| `interfaces` | Claude Code only; denies `AskUserQuestion` with exit 2 and "This run is unattended: take the declared default and record `Default applied: <question> → option <N> (unattended)`; with no declared default, stop at BLOCKED_AMBIGUITY." (`UNATTENDED_ASK_GATE_REASON`, `src/hooks/scripts.ts:3772-3774`), reading the records directly as `u14` reads them (the newest run folders by name, heads only, debug records included) and no order among them, since a run id carries only the UTC date (review/101, `unattendedSource`, `:3953-3970`): any in-progress record reading `Mode: unattended` denies; else any in-progress record reading `Mode: attended` (a morning walk) allows, whatever the variable says; else `STAMITY_UNATTENDED` set (not `""`, `false`, `0`, trimmed, any case) denies, except when no run is in progress and a closed record reading `Mode: unattended` names the current branch (read off `.git/HEAD`, a linked worktree's `gitdir:` followed, `currentBranch`, `:3932-3951`) on its `Branch:` line, Claude Code's final round after that run handed off; a closed record carried into a later clone on another branch exempts nothing (review/100). A deny appends what it read: the record's repository path (`UNATTENDED_ASK_GATE_RECORD_SOURCE`, `:3780`) or the variable (`UNATTENDED_ASK_GATE_VARIABLE_SOURCE`, `:3783-3784`) (review/104). Fail open: an unreadable payload, records folder, record or git file, or any fault while deciding allows, with one control-stripped stderr line naming the read and its cause (`UNATTENDED_ASK_GATE_FAULT_NOTE`, `:3790-3791`, review/105). Builder `buildUnattendedAskGate`, `:3824-3997`. Wiring is `u20`'s |
| `testCriteria` | Unattended in progress → deny naming its record; attended in progress → allow; the variable set, no run → deny naming the variable; the variable set, no run in progress and a closed unattended record whose `Branch:` is the current branch → allow, the same on `main`, another branch, a detached `HEAD` or a record with no `Branch:` → deny; the variable set, an attended walk record in progress → allow; an unattended and an attended record of one day in progress → deny, whichever slug sorts first; a fault → allow with the one stderr line. The budget test lists the script |
| `edgeCases` | An in-progress record with no `Mode:` line → neither mode: allow without the variable, the variable deciding when set; an unreadable records folder → allow with the fault line (asking is the safe failure) |
| `depends_on` | u14-shell-guard |
| `verify` | `npm run build && npx vitest run test/hooks` |
| `threat` | Boundary: the question tool in an unattended run. Trusts: the record head and the variable. Abuse: a run asks and waits forever with nobody there. Check: the deny names the rule; asking is the safe failure, so the gate fails open by design |
| `amended` | 2026-10-16: no order among records — any in-progress unattended record denies, else an in-progress attended one allows, else the variable decides (review/101); the final-round exemption holds only while the current branch is the closed record's `Branch:` (review/100); a deny names its record or the variable (review/104); the fail-open path writes one stderr line (review/105) (`7c93e84c`); REQ-FLOW-090 and the morning-walk decision in the delta amended to match |

### u15-work-text — `/st-work`'s head, pointer and close options, and the eval index for the re-quoted cases

| Field | Content |
|---|---|
| `id` | u15-work-text |
| `requirements` | REQ-FLOW-019, REQ-FLOW-075, REQ-FLOW-080, REQ-FLOW-089, REQ-FLOW-095, REQ-CTX-012 |
| `files` | `content/commands/st-work.md` (the head paragraph `:405-412`: six lines among the first 15 — `Status:`, `Mode: attended \| unattended` (from `--unattended`, or `STAMITY_UNATTENDED` set to any value but empty, `false` or `0` as REQ-FLOW-089 reads it, `--attended` beating the variable, `--resume` always attended, and an in-session hand-off's `run-mode:`, which carries the caller's already-resolved mode and so wins over this run's own reading of the variable), `Branch:`, `Plan:`, `Base:`, `Invocation:` — and "When `Mode:` reads `unattended`, invoke the `st-unattended` skill by name and follow it." — an unattended run calls `stamity run start --run <id> --json` before it writes the head and takes `Branch:` and `Base:` from that output; the close walk `:298-306`: the commit part offers 1 commit, push, draft PR (`stamity run checkpoint --pr`, recommended) · 2 commit only · 3 leave uncommitted, with `Default if no response: leave uncommitted` verbatim; the Testing philosophy blockquote `:487-494` rewrapped to about 100 characters, every line still opening `>` and "gating tests are not edited, deleted, or special-cased" kept on one line (`work.test.ts:2262-2267`); the close-walk paragraph rewrapped; nothing added above `### Specialist pass`), `test/corpus/commands/work.test.ts` (`:712-717`, `:1410-1416`, `:1469`, `:1479-1484`), every case whose `st-work.md` range starts after the first changed line (`work-persisted-plan-asks-once`, `unattended-close-keeps-real-defects`, `close-real-defect-never-preset-to-drop`, `benign-close-no-leftovers-asks-nothing-extra`, `work-capacity-rung-classes-stop-notices`), and `evals/SET-v7.md`'s index rows for these and for every case `u10`, `u10b`, `u11` and `u12` re-quoted, with one dated paragraph |
| `interfaces` | The budget checks `work.test.ts:439-446` stay green: body at most 485 lines, the characters before the cut unchanged |
| `testCriteria` | The head pin reads six lines and names `Mode:` and `Branch:`; the options pinned in order with the default sentence verbatim; the skill pointer pinned; `test/evals` green (locators, roster, coverage) |
| `edgeCases` | An attended run with no answer → leave uncommitted, rows unsigned, the delta unmerged (unchanged); option 1 with HEAD on the default branch → `stamity run start` first, never a push to the default branch; `STAMITY_UNATTENDED=true` or `yes` → unattended, `false`, `0` or empty → attended |
| `depends_on` | u9-unattended-skill, u10-board, u10b-debug-quick, u11-rework-pr-resolve, u12-protocol-plan-shape |
| `verify` | `npx vitest run test/corpus/commands/work.test.ts test/evals` |
| `amended` | 2026-10-15: the variable reads unattended for any value but empty, `false` or `0`, as REQ-FLOW-089 and the landed `/st-debug`, `/st-quick`, `/st-board` and `/st-pr-resolve` text (`833349eb`) and `/st-rework`'s (u11) read it, not only `=1` (record 23:25Z–23:28Z) |
| `amended` | 2026-10-16: on a closed unattended run's branch, an invocation that declares the start unattended (`--unattended`, a hand-off's `run-mode: unattended`, or a chain's next file) takes the skill's unattended entry, never the walk, and `STAMITY_UNATTENDED` alone does not stop the walk (review/145, `9e2afdef`: `content/commands/st-work.md:413-415`, `content/skills/st-unattended/SKILL.md:140-145`); option 1's `--paths` also names the learning files the close captured under `.stamity/learnings/` (review/146, `st-work.md:299-300`); REQ-FLOW-095 in the delta amended to match (review/155) |

### u16-gate-verbs — `gate preflight` and `gate scan --text`

| Field | Content |
|---|---|
| `id` | u16-gate-verbs |
| `requirements` | REQ-FLOW-101, REQ-FLOW-103 |
| `files` | `src/cli/commands/gate.ts` (`:152-153` a third choice `preflight`; `scan` gains `--text <file> --label <pr-body\|morning\|reply\|comment>`, the per-subcommand flag check in the `preAction` hook `:1528-1532`; `scanChange` `:1418` and `readChange` `:815-874` exported for u18b and u19), `test/cli/commands/gate.test.ts`, new `test/cli/commands/gatePreflight.test.ts`, `test/architecture/boundaries.test.ts` (`PLAN_MAP` rows for every new `src/` file of u2, u3, u4, u5, u6, u8 and u13 — one writer for them all), `src/composition/root.ts` and `test/composition/root.test.ts` (the engine modules among them wired, `:253-261`, `:425-433`), `.stamity/change-classes.json` (`testInputs` for each new test of u1–u15 that reads a tracked page) |
| `interfaces` | `preflight --unattended [--item <owner/repo#n>] [--json]` builds u8's `PreflightDeps` (`src/runs/preflight.ts:71-103`), every field from the engine's own reads: `env` (`process.env`); `nodeVersion` (`process.versions.node`); `engines` (`package.json`'s `engines.node`); `pinnedVersion` and `runningVersion` (the manifest's `generatedBy` against the running version, through `evaluateExpectations`, exported, `src/cli/commands/check.ts:2523`, or the same comparison inline); `scanRuns` (`scanChange` with no base); `rest` (a `RestRead` over u4's `ghApi` GET, its `hostname` the host `resolveRepo` matched; `null` when no `gh` is found; it passes every GET path u8 reads, `/repos/…`, `/user` and `/user/memberships/orgs/{owner}` (`src/runs/preflight.ts:201`, `:281`), and adds no path filter of its own: `ghApi` takes any GET path in its alphabet, a leading `/` dropped, `src/cli/engine/ghRunner.ts:80`, `:111`, `:118`); `repo` (the `owner` and `repo` of `resolveRepo(env, <origin's fetch URL>)`, `null` when it returns `null`); `ghRepoEnv` (`GH_REPO`, or `null`); and, at `:88-102`, `canary` (`.stamity/preflight-canary.json`, or `null`), `now`, `item` (from `--item`), `floors` (the emitted copies of the question protocol and the injection-screening rule for the manifest's clients), `pushIdentity` and `reviewState` (`counter`: whether `.stamity/review-gate.json`, the review gate's counter, exists; `usageReviewLines`: the in-progress record's `usage: review` line count). `pushIdentity` is `{ fetchUrl, pushUrls }` (`src/runs/preflight.ts:100`), raw facts u16 gathers through the hardened read runner and never decides on (u8 decides, `pushIdentityCheck`): `fetchUrl` from `git remote get-url origin`, `null` when origin has none; `pushUrls`, one `PushUrlFacts` (`:57-69`) per URL `git remote get-url --push --all origin` prints (a `pushurl` and `pushInsteadOf` applied, every push URL, not the first only), each `{ url, helpers, authorizationHeader }`: `url` as printed; `helpers` the `credential.helper` list git builds for that URL — every entry that applies, generic and URL-scoped, in config order, an empty value resetting the list — or `null` when an entry cannot be placed; `authorizationHeader` true when an `http.extraHeader` naming `Authorization`, generic or URL-scoped, applies to that URL. No URL, helper or header value reaches the verb's output; exit 0 no refusal (warnings allowed), 1 a refusal or unknown, 2 usage (also without `--unattended`); JSON `{ ok, mode: "unattended", client, cloud, checks, refusals, warnings, floors }`. `scan --text` reads the file (bounded by `MAX_USER_CONTENT_LENGTH`), runs `scanAddedLines` with `path: <label>`, exits 0 clean or 1 on a hit or a line past the cap, JSON `{ ok, hits: [{ label, line, rule }] }` |
| `testCriteria` | `preflight` with an injected `ghApi` (inline mock reason: network) reproduces u8's matrix through the verb, every call naming the matched host; no canary → exit 1 `hooks-loaded`; `fetchUrl` is origin's URL and a set `pushurl` lands in `pushUrls`, not the fetch URL; two push URLs → two `PushUrlFacts`, an ssh second one → exit 1; an https push URL carrying userinfo → exit 1; helpers `[another, gh]` → `helpers` holds both, exit 1; an empty `credential.helper` before `gh`'s → `helpers` is `gh`'s alone, bound; a URL-scoped helper or header applies only to its URL; an `http.extraHeader` naming `Authorization` that applies to a push URL → `authorizationHeader: true`, exit 1; the administrator-under-an-organization-ruleset case reaches `/user/memberships/orgs/{owner}` through the verb's `RestRead`, never refused before the stub; no URL, helper or header value in the output; `scan --text` on a token-shaped line → exit 1 naming label, line and rule, and the output holds none of the value's characters beyond the rule name; `--help` lists both |
| `edgeCases` | `--item` not `owner/repo#n` → exit 2; `scan --text` on a missing file → exit 1 naming the path |
| `depends_on` | u4-pr-runners, u8-preflight-core |
| `verify` | `npx vitest run test/cli/commands/gate.test.ts test/cli/commands/gatePreflight.test.ts test/composition/root.test.ts test/ci/testInputsGuard.test.ts` (the architecture test's call-site rules wait for u19, when the last new module gets its caller) |
| `threat` | Boundary: an unattended start → the engine's own REST and file reads. Trusts: nothing the model passes but `--item`; the repository from `origin`. Abuse: a run forges a verdict, skips the verb, or points it at another repository. Check: the verdict is computed in-process; `GH_REPO` naming another repository refuses; the skill makes the verb the run's first act; the eval case "a hookless pre-flight refuses" (u22) proves the refusal reaches the morning list |
| `amended` | 2026-10-15: the push identity reads `git remote get-url --push origin`, an https push URL carrying userinfo or naming another repository than the fetch URL's giving `originScheme: "other"` (build/33); the credential-helper list is built as git builds it, `credentialHelper` its sole entry or `null` (build/34); the `PreflightDeps` fields named as landed in `e7eda022` (`pushIdentity`, `reviewState`); four testCriteria added; `rest` names the host u4's `resolveRepo` returns (`5908acb0`) |
| `amended` | 2026-10-15: `pushIdentity` is u8's raw facts, `{ fetchUrl, pushUrls: PushUrlFacts[] }` (`e486c406`, review/63, review/64): `fetchUrl` from `git remote get-url origin`, every push URL from `git remote get-url --push --all origin`, each with git's helper list (or `null`) and its Authorization-header fact; the `originScheme`/`credentialHelper` reading of the first pass is gone; `RestRead` passes `/user/memberships/orgs/{owner}` (review/60, review/65); line references re-pointed; testCriteria set to the facts |

### u17-plan-verb — `stamity plan check`, registered

| Field | Content |
|---|---|
| `id` | u17-plan-verb |
| `requirements` | REQ-FLOW-091 |
| `files` | new `src/cli/commands/plan.ts`, `src/cli.ts` (`COMMANDS` `:63-77`, the count comment `:31`), `src/composition/root.ts` (the `runs` group `:253-261`, `:425-433`), `test/architecture/boundaries.test.ts` (this unit's `PLAN_MAP` row), `test/cli/surface.e2e.test.ts` (`:69`, `:81`), `docs/cli-reference.md` (regenerated by `node scripts/generate-docs.mjs`), new `test/cli/commands/plan.test.ts`, `.stamity/change-classes.json` (`testInputs` for this unit's test) — eight files, the registration files each a few lines |
| `interfaces` | `stamity plan check <plan...> [--chain --since <sha>] [--contract <path>] [--json]`, hidden, non-mutating; exit 0 every plan ready, 1 a blocker, an unread input or no git work tree, 2 usage (`--chain` without `--since`, and `--since` without `--chain`, included; `--since` 7 to 64 hex characters); the specs from `docs/specs/*.md` (every `.md` but `manifest.md`, sorted); every input resolved against the directory the verb runs in, symlinks followed, and read only inside the git top-level, as a regular file of at most 4 MiB; the JSON is u13's `PlanCheckResult`, except that a plan it could not read — absent, outside the repository, not a regular file or too large — is a `no-plan` entry in a top-level `blockers` list, `{ code: "no-plan", path, message }` beside `{ code: "contract", … }` for an unread contract, with `ready: false` and `plans: []`, nothing checked, each named on stderr (`src/cli/commands/plan.ts:101-123`, build/83) |
| `testCriteria` | In-process (`runInProcess`, as `gate.test.ts:7-11`): a ready plan → exit 0; a clarification marker → exit 1 naming its line; `--chain --since` across two files; `--contract` with a version-2 file → exit 1; the CLI reference byte-equal after regeneration (`test/cli/docs/cliReference.test.ts:90-92`); the root and census-guard tests green |
| `edgeCases` | A plan path outside the repository → exit 1, a top-level `no-plan` blocker naming it, `plans: []`; no `docs/specs/` → each plan carries the `.mjs`'s `missing-spec-input` advisory, L4 handled as the `.mjs` handles it |
| `depends_on` | u13-plan-check, u16-gate-verbs |
| `verify` | `npx vitest run test/cli/commands/plan.test.ts test/cli/surface.e2e.test.ts test/cli/docs/cliReference.test.ts test/composition/root.test.ts test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: `.stamity/change-classes.json` → the gates later runs choose. Trusts: the base commit's copy (classify reads the base blob). Abuse: a `testInputs` edit narrowing a test selection. Check: only additive rows, each naming a new test's tracked inputs; the census guard test; the security lens reads the class-file diff |
| `amended` | 2026-10-16: an unread plan is `no-plan` in the verb's top-level `blockers` with `plans: []`, outside u13's `PlanBlockerCode` (build/83, `086844ae`); `--since` without `--chain` is a usage error; the chain cases run a move between stamp and base and one after it through `--since` (review/143, `5bad9693`); REQ-FLOW-091's list and REQ-FLOW-096's example call amended to match (review/147) |

### u18-run-verb — `stamity run start`, registered

| Field | Content |
|---|---|
| `id` | u18-run-verb |
| `requirements` | REQ-FLOW-092, REQ-FLOW-093 |
| `files` | new `src/cli/commands/run.ts`, `src/cli.ts`, `test/architecture/boundaries.test.ts` (this unit's `PLAN_MAP` row), `test/cli/surface.e2e.test.ts`, `docs/cli-reference.md`, new `test/cli/commands/run.test.ts`, `.stamity/change-classes.json` — seven files, the registration files each a few lines |
| `interfaces` | `stamity run start --run <id> [--json]`, hidden, mutating: on a default branch, or at a detached `HEAD`, create and switch to `stamity/<run-id>` (an existing one checked out, never recreated); any other branch, a platform one (`claude/…`, `cursor/…`, `copilot/…`) included, is kept. The default branches are the one the first source that answers names — REST `default_branch` through u4's `ghApi`, its required `hostname` the host `resolveRepo` matched on `origin`, else `refs/remotes/origin/HEAD` — with `main` and `master` always counted beside it, and alone where neither answers, all lowercased and the current branch compared without case, the set and the match the guard's table uses, so `start` switches wherever the guard would refuse a push (review/149, `defaultBranches` and `withFallbacks`, `src/cli/commands/run.ts:287-307`). JSON `{ subcommand, run, branch, created, base }` (`base` the full commit id at `HEAD` once on the branch, for the record's `Base:`), with `dryRun: true` under `--dry-run`, which switches nothing; exit 1 a refused run id, no commit at `HEAD`, or a git call that failed; all git through `gitWrite` (u4) |
| `testCriteria` | `start` on `main` → `stamity/<id>` created and checked out; on `feat/x` → kept, `created: false`; on `main` or `master` where REST names `develop` → switched; REST naming `trunk` beside `origin/HEAD` naming `develop` → `HEAD` on `trunk` switches, on `develop` stays, so swapping the source order fails (review/151); the CLI reference and the census-guard test green |
| `edgeCases` | A detached HEAD → a branch created at it; an existing `stamity/<id>` → checked out, not recreated |
| `depends_on` | u4-pr-runners, u5-morning, u6-person-only-tables, u17-plan-verb |
| `verify` | `npx vitest run test/cli/commands/run.test.ts test/cli/surface.e2e.test.ts test/cli/docs/cliReference.test.ts test/ci/testInputsGuard.test.ts` |
| `threat` | Boundary: the run's start → the local branch. Trusts: the REST default branch. Abuse: a run committing on the default branch. Check: `start` never stays on a default branch; `checkpoint` refuses to commit there (u18b) |
| `amended` | 2026-10-15: the REST read passes `hostname`, now required on every `ghApi` call, from `resolveRepo`'s `host` (`5908acb0`) |
| `amended` | 2026-10-16: `main` and `master` count as default beside whichever source answered, compared without case, replacing "the first source decides" for the set (review/149, review/151, `ed7eb063`); the JSON named as landed, `subcommand`, `run` and `dryRun` included (`0f8c6980`) |

### u18b-run-checkpoint — `stamity run checkpoint`

| Field | Content |
|---|---|
| `id` | u18b-run-checkpoint |
| `requirements` | REQ-FLOW-092, REQ-FLOW-093, REQ-FLOW-102, REQ-FLOW-103 |
| `files` | `src/cli/commands/run.ts`, new `test/cli/commands/runCheckpoint.test.ts`, `docs/cli-reference.md`, `test/architecture/boundaries.test.ts` (`run.ts`'s `PLAN_MAP` row moved to wave 15, since it imports the wave-14 `gate.ts` for `scanChange` and `readChange`, build/91) |
| `interfaces` | `stamity run checkpoint --run <id> [--paths <p...>] [--pr --title <t>] [--signoff] [--json]` (`src/cli/commands/run.ts:58-75`, `runCheckpoint` `:360-563`); usage errors, exit 2: no `--run`, a checkpoint option given to `start`, `--pr` without `--title` or the reverse, an empty `--title` or `--paths` entry (`:156-170`). It reads the record's head (`Mode:`, `Branch:`, `Base:`), the `Base:` resolved to a commit or the verb fails, then: (1) refuses, exit 1 with nothing staged, a detached `HEAD`, a `HEAD` on a default branch (the set built as `run start` builds it: the source that answered with `main` and `master` beside it, caseless), a `HEAD` that is not the record's `Branch:` when the record names one, as `branch mismatch: the checkout is on <b>, and the record's Branch: names <r>` (build/93), and a branch name outside `[A-Za-z0-9._/-]` or opening with `-` (`:398-417`); (2) stages only the run folder's `record.md`, `ledger.jsonl`, `plan.md` and `morning.md` that exist as regular files, `.stamity/inbox.md`, `held/*.patch` and `--paths` (relative to the project root; one outside the repository, naming the whole project or held by neither the work tree nor the index is left out as `not staged: <p> (…)`; a learning file under `.stamity/learnings/` the close names there stages like any other, review/146) — never `-A`, never `-f` (`:423-447`) — a path git ignores reported as `records: not committed (<path>: <source>:<line> <pattern>)` from `git check-ignore -v --non-matching`, each path passed as `./<path>` with no `--`, since `check-ignore` refuses the `:(literal)` magic `gitWrite` adds after a `--` (build/92, `ignoredPaths`, `:611-633`); every other path reaches `gitWrite` (u4) plain after a `--`, which gives each one `:(literal)` magic itself (`src/cli/engine/gitWrite.ts:88-104`), so no caller adds magic or sets `--literal-pathspecs`, an empty path is never passed, `--` is never passed to `push`, and an option value that could read as one is written attached (`--message=…`); (3) only when the record reads `Mode: unattended`, after the staging so a `--paths` entry naming a held path is held too: the work tree's and the index's change against `Base:` (`git diff --name-only -z <Base> --`, external diff, textconv and renames pinned off) under `PERSON_ONLY_PATHS` (u6's globs) is written by git itself to a scratch file (`git diff --binary --full-index --output=<file> <Base> -- <held>`) and moved byte for byte to `.stamity/runs/<id>/held/person-only.patch` by the engine's atomic write, so a held file in any encoding applies again (build/95), and those paths are restored to `Base:` in the index only (`git restore --staged --source=<Base>`, the work tree keeps them), each listed; with nothing to hold, a patch an earlier checkpoint left leaves the index (`git rm --cached`) and the run folder, only where `held/` is the run folder's own directory (build/96, `removeStalePatch`, `:644-668`); (4) commits only when something is staged, `--message=chore(run): checkpoint <run-id>` (`--signoff` adds the DCO line); (5) `scanChange(<project root>, <Base>)` over `Base..HEAD` and the work tree, so an untracked file the run never stages can hold the push too (build/94, the safe direction, an open Minor); a hit, a failed scan or an incomplete one holds the push, a hit named by path, line, rule and commit, never the value (`:515-530`); (6) no push when `HEAD` equals `refs/remotes/origin/<branch>`; else `git push --quiet origin HEAD:refs/heads/<branch>`, its command first checked by `personOnlyVerdict` with a `PersonOnlyContext` (`src/hooks/personOnly.ts:95-105`) carrying the default set, the current branch and the local tag names (`git for-each-ref refs/tags/`), a refusal reported as `push rejected by the remote: …`, `push refused by a hook` or `push failed: …` (`:532-554`); (7) with `--pr`, `draftPr` (`:698-742`), the step u19 was to build and u18b built here: `resolveRepo` over `origin`'s URL, the target the default branch as the answering source spells it (none on the `main`/`master` fallback: `draft PR not opened (no default branch was read to target)`), the title through `screenOutbound` (`pr-title`), a hit replacing it with `Run <run-id>`; an attended run's body is the short fixed `` Run `<run-id>`, attended. Its record: `<record path>`. ``, with no `morning list missing` entry (review/114); an unattended run's body is `prBodyFrom(morning.md, runId, { inferred })` after `screenOutbound` (`pr-body`), `inferred` from `inferPrerequisites` over `readChange`'s added lines against `Base:`, a hit replacing it with a fixed body naming `morning.md` and the hits' lines and rules, an absent `morning.md` giving `morning list missing` and one over 1 MiB `morning list not posted`, each with a fixed body; then `ensureDraftPr` (u4) with `host`, `owner`, `repo`, `head`, `base`, `title`, `body` and `runId`. Exit 0 when the remote branch holds `HEAD` (pushed now, or nothing ahead) and, with `--pr`, a pull request was opened, updated or commented; else 1; `notDone[]` may carry entries on exit 0 too (an ignored record). `--dry-run` stages, writes, commits and pushes nothing and reports what it would stage and hold. JSON `{ subcommand, run, branch, base, committed, pushed, held: string[], scan: { hits: { path, line, rule, commit? }[], unscanned: string[] }, pr: { number, url, how } \| null, notDone: string[] }`, plus `inferred` with `--pr` and `dryRun: true` under `--dry-run` |
| `testCriteria` | Against a real bare remote (`git init --bare`, as `gate.test.ts` does), `ghApi` stubbed (inline mock reason: network): an unattended record with a change to `.github/workflows/x.yml` → absent from the pushed tree, present in the patch and still in the work tree, listed in `held`, and a change to `.cursorrules` held likewise; an attended record → the change pushed, `held` empty; no pushed argv names `main`, `--force` or `--tags`, and none carries `--`; a `--paths` entry shaped like a glob (`[ab].txt`) stages that file alone, and the repository's own pre-commit hook still matches its globs; an ignored record → `records: not committed (…)`; `HEAD` on another branch than the record's `Branch:` → exit 1 `branch mismatch`, nothing staged; a held file in a non-UTF-8 encoding → a patch that `git apply` takes back byte for byte; a held change reverted by a later checkpoint → the earlier patch gone from the index and the run folder; an attended `--pr` → the short fixed body and no `morning list missing`; a learning file named in `--paths` → staged |
| `edgeCases` | Nothing to commit → no commit, a push only when ahead; a failing pre-push hook → `Not done: push refused by a hook`, never `--no-verify`; no `user.email` → `Not done: commit failed (identity)`; a record with no `Branch:` → no mismatch check, the default-branch refusal still applies; a `Base:` naming no commit here → the verb fails before it stages anything; an untracked, unstaged file holding a token-shaped line → the push held, though that file would not be pushed (build/94) |
| `depends_on` | u16-gate-verbs, u18-run-verb |
| `verify` | `npx vitest run test/cli/commands/runCheckpoint.test.ts test/cli/commands/run.test.ts test/cli/docs/cliReference.test.ts` |
| `threat` | Boundary: the run's branch → the remote. Trusts: the run folder and the record's base and mode. Abuse: a steered run pushing to the default branch, or shipping a workflow change CI runs at once. Check: the push argv passes the guard's own table; held paths never reach an unattended pushed tree; a scan hit holds the push |
| `amended` | 2026-10-15: the push argv's check passes `PersonOnlyContext.tags`, the repository's local tag names read through the git runner (build/25); the held paths include `.cursorrules` (build/29) (`65299243`) |
| `amended` | 2026-10-15: the staging step passes plain paths after `--` and `gitWrite` adds the `:(literal)` magic, no `--` to `push`, an option value of `--` attached (review/84, `92e5a190`); the held-path count left to u6's landed list (review/70, review/75) |
| `amended` | 2026-10-16: the cell restated as landed in `c7c2a240` and `89589691`: an attended run's draft takes a short fixed body (review/114); a learning file named in `--paths` is staged (review/146); `HEAD` off the record's `Branch:` refuses as `branch mismatch` (build/93); the scan reads `Base..HEAD` and the work tree, an untracked file holding the push left open (build/94); the held patch is written by git to a file and moved as bytes (build/95), and a stale one leaves the index and the folder (build/96); `git check-ignore` takes `./<path>` with no `--` (build/92); the hold runs after the staging; the default set built as `run start` builds it; `run.ts` at wave 15 (build/91); u19's draft-PR step now lives in `run.ts` as `draftPr`, shared by `run checkpoint --pr` |

### u19-run-end — `stamity run end` and the draft pull request

| Field | Content |
|---|---|
| `id` | u19-run-end |
| `requirements` | REQ-FLOW-092, REQ-FLOW-094, REQ-FLOW-095, REQ-FLOW-103 |
| `files` | `src/cli/commands/run.ts`, new `test/cli/commands/runEnd.test.ts`, `docs/cli-reference.md` |
| `interfaces` | What is left once u18b built the draft-PR step: `stamity run end --run <id> --title <t> [--paths <p...>] [--refused] [--signoff] [--json]`, the form the skill calls (`content/skills/st-unattended/SKILL.md:60`, `:98`) and `/st-pr-resolve` calls with `--title "pr-resolve #<n>"` (u11). In `src/cli/commands/run.ts`: `end` joins `start` and `checkpoint` as a `<subcommand>` choice (`:149`); the preAction hook (`:156-170`) makes `--title` required on `end`, a usage error (exit 2) without it, and `--refused` is `end`'s flag; `--pr` is not one of `end`'s flags, since the pull request is not optional at the end; the action runs `runCheckpoint`'s steps (`:360-554`: the refusals, the staging with `--paths`, the hold, the commit, the scan, the push) and then `draftPr` (`:698-742`) every time, never only with `--pr`, so the title screen, the attended fixed body, the unattended `prBodyFrom(morning.md, …)` body with its screen and `inferred` rows, and `ensureDraftPr` stay u18b's, unchanged; `--refused` titles it `Refused: <title>` before the title screen, a hit giving `Run <run-id>`; a scan hit or a refused push returns before any pull-request call, as in `checkpoint`. Exit 0 when the remote branch holds `HEAD` and a pull request was opened, updated or commented (the `[DRAFT]` fallback included), else 1 with `notDone[]`; the JSON is `checkpoint`'s with `subcommand: "end"`, `pr: { number, url, how } \| null` and `inferred` always present. `docs/cli-reference.md` regenerated; the architecture test's call-site rules run whole |
| `testCriteria` | With the bare remote and a stubbed `ghApi`: an open PR carrying this run's marker → its body PATCHed, no second PR; an open PR without it → one comment, the body untouched; a token in `morning.md` → the fixed body, and no output holds the value's characters; `--refused` → a title starting `Refused: `; a draft 422 → `how: "created-fallback"`; `run end` without `--title` → exit 2; `run end` with no `--pr` still opens the pull request |
| `edgeCases` | An unattended run with no `morning.md` → `Not done: morning list missing`, the PR opened with the fixed body (u18b's `draftPr`); an attended run → the short fixed body, no `morning list missing`; the push held by a scan hit → no PR call, the reason in `notDone`; `HEAD` off the record's `Branch:` → `branch mismatch`, nothing pushed, no PR call |
| `depends_on` | u18b-run-checkpoint |
| `verify` | `npx vitest run test/cli/commands/runEnd.test.ts test/cli/commands/runCheckpoint.test.ts test/cli/docs/cliReference.test.ts test/architecture/boundaries.test.ts test/composition/root.test.ts` (the architecture test whole: every new module now has its caller) |
| `threat` | Boundary: agent text → a pull request on GitHub. Trusts: `morning.md` after the scan. Abuse: an injected environment dump pasted into the morning list and posted, or a person's PR description overwritten. Check: the outbound scan before every post; the body never posted unscanned; the marker rule |
| `amended` | 2026-10-15: `ensureDraftPr`'s request carries the required `host`, from `resolveRepo` (`5908acb0`) |
| `amended` | 2026-10-16: u18b built the draft-PR step in `run.ts` (`draftPr`, `c7c2a240`, `89589691`): the title and body screens, the attended short fixed body (review/114), the unattended morning-list body with its inferred rows and `ensureDraftPr`; what is left to u19 is the `end` subcommand, its flags (`--title` required, `--refused`), the always-run pull-request step after `checkpoint`'s steps, the `Refused:` title, its own test file, the regenerated reference and the whole architecture test |

### u20-hook-emission — the deny rows and the guards wired on every client

| Field | Content |
|---|---|
| `id` | u20-hook-emission |
| `requirements` | REQ-FLOW-090, REQ-FLOW-102, REQ-FLOW-120, REQ-FLOW-025, REQ-FLOW-036, REQ-PLUGIN-016 |
| `files` | `src/emit/hooksInfra.ts` (`:429-446`: a portable `pre_tool_use` row running the shell guard, its matcher the client's shell tools, fail-closed where the client allows; Cursor excluded), `src/adapters/claude.ts` (`buildSettingsJson` `:838-882`: `permissions.deny` from `CLAUDE_DENY_ROWS`; the ask gate as a PreToolUse entry `{ matcher: "AskUserQuestion" }` without the fail-closed tail, placed as the review gate is, `:776-792`, `:516`), `src/manifest/claudeSettings.ts` (the deny slot bounds nothing and recognises nothing, `claudeSettingsSpec`, `:143-159`, `:154`; the rendering handed to the shared core carries only the engine's rows the file lacks, `renderingToAdd`, `:230-237`; the record keeps the engine's rows it added while they stay, `withDenyRecord`, `:248-259`; the reducer strips no deny row and names the table's rows it left, `reduceClaudeSettingsToForeignContent`, `:337-346`; the shared co-ownership core, `src/manifest/coOwnedJson.ts`, unchanged), `src/adapters/cursor.ts` (`buildHooksJson` `:926-981`: `beforeShellExecution` with `failClosed: true` running the core script at `.stamity/generated/hooks/cursor/stamity-person-only-guard.mjs`), `src/adapters/copilot.ts` and `src/adapters/codex.ts` (the portable row's translation, as the core guard's is), `test/adapters/claude.test.ts` (`:675`, `:702-705`, `:777`, `:781`, `:2147`, `:2227`, `:2388`), `test/adapters/cursor.test.ts`, `test/adapters/copilot.test.ts`, `test/adapters/codex.test.ts`, `test/manifest/claudeSettings.test.ts`, `test/merge/settingsOwnerEntries.test.ts` (`:175`, `:367`, `:476`, `:539`) — the adapter tests one per client; `test/emit/hooksInfra.test.ts`, which pinned three core scripts and three rows per client (build/68); `test/merge/settingsKeyOwnership.test.ts` and `test/cli/ledgerForgery.test.ts`, which pinned `clean`'s old settings result (`622439ef`) |
| `interfaces` | The deny strings follow Claude Code's documented permission-rule form, re-read from the vendor's page at build; each a prefix the guard also denies (`CLAUDE_DENY_ROWS`, 49 rows, `src/hooks/personOnly.ts:117-167`). No `permissions.deny` row in the file is ever judged the engine's, since a hash cannot tell its row from an owner's equal one (review/124, review/125, build/70): `sync` keeps every row already there byte for byte and in place, an owner's row equal to an engine row included, whatever the ledger's age — under a 1.11.0 row, after setup, after a lost record — and appends only the table's rows the file lacks; `clean` never removes a `permissions.deny` row, and names the rows equal to the engine's that it left, only table rows, so no text the owner wrote reaches the line, for the person to remove by hand ("It left the permissions.deny rows equal to the engine's (…): clean removes no deny row, as an equal one may be yours. Remove the ones you do not want by hand.", `claudeSettings.ts:342-344`); the change sits in the deny spec, not the shared core. The shell guard is asked for on every selected client with no switch, `planCoreHookScripts(…, { personOnlyGuard: true })` (build/44), its portable row's matcher the client's shell tools (`SHELL_GUARD_MATCHERS`: Claude Code and Copilot `Bash\|PowerShell`, Codex `Bash`, the last read from the runner, not the vendor's page, build/71), and Cursor's copy placed with no portable row, wired on `beforeShellExecution` only |
| `testCriteria` | The emitted settings carry the deny rows and the PreToolUse entries (the core guard, the shell guard on `Bash\|PowerShell`, the ask gate) with their matchers; an owner's own deny row survives `sync` byte for byte; an owner's row equal to an engine row under a 1.11.0 ledger row, one added after setup, and the rows under a lost record → each kept in place by `sync` and by `clean`, never recorded as the engine's, `clean` naming the table's rows it left; `clean` on a file holding only the engine's keys → the file kept, holding the deny rows (`co-owned-reduced`, no `.bak`); Cursor's row is `failClosed` and Cursor runs no second copy through `preToolUse`; Copilot's and Codex's rows run the guard on their shell tools |
| `edgeCases` | An owner row equal to an engine row → kept where it stands, never the engine's, never removed, the missing table rows appended after it; a forged deny record → grows nothing and names nothing of the owner's; a `deny` that is not an array → refused as `co-owned-shape` by the core; a selection without Cursor → no Cursor row |
| `depends_on` | u14b-ask-gate |
| `verify` | `npx vitest run test/adapters test/emit/hooksInfra.test.ts test/manifest/claudeSettings.test.ts test/merge/settingsOwnerEntries.test.ts` |
| `threat` | Boundary: the emitted settings → every session on the repository. Trusts: the shipped tables. Abuse: an owner's deny row overwritten, or the shell guard's fail-closed tail lost so a crash lets a push through. Check: the ownership tests and a fail-closed assertion per client |
| `amended` | 2026-10-16: `clean` never removes a `permissions.deny` row and names the engine's rows it left; `sync` keeps an owner's row byte for byte whatever the ledger's age (review/124, review/125, build/70, `d788b2a6`, `622439ef`); the cell's old wording ("the engine owns its own deny rows … an owner's row, equal or not, stays the owner's") and REQ-FLOW-036's at the delta (u20's fixer round 1 W-3) replaced; the guard wiring named as landed in `e4b0da4a`, `personOnlyGuard` passed for every client (build/44, build/60) |

### u21-security-page — the cloud's controls and accepted risks on `SECURITY.md`

| Field | Content |
|---|---|
| `id` | u21-security-page |
| `requirements` | REQ-FLOW-104 |
| `files` | `SECURITY.md` (a `### Cloud and unattended runs` block under `:253` replacing `:264-269`; rows in the controls table `:73-103` for `src/runs/preflight.ts::directPushVerdict`, `src/hooks/personOnly.ts::personOnlyVerdict`, `src/hooks/personOnly.ts::unattendedPushVerdict` and `src/change/scan.ts::scanAddedLines`; the run verbs added to the git-hardening row `:96`; the `gh` start as a named network exception in `:107-142`; the settings promise at `:98` restated), `docs/security-mapping.md` (a row per control above, and the resume card's and the ledger writer's strip rows, inbox `2026-10-11_release-1-14-0/build/14`), `test/docsPages.test.ts` |
| `interfaces` | The accepted risks: screening of runtime ingress is followed by the model, not enforced; Copilot hook timeouts fail open; Cursor's read-only first turns run no hooks; Cursor's own push is not seen by a shell guard; pattern deny rules can be respelled; environment variables are readable by every command in Claude Code's cloud; a run that rewrites its own record head escapes the unattended push rule; Codex's non-interactive mode was seen running no project hooks, where the pre-flight then refuses; a repository's own push configuration (`remote.<name>.push`, `push.default=matching`) and a GraphQL mutation read from a file pass the shell guard's patterns; behind Claude Code's cloud proxy the push and the REST reads run as the platform's shared app identity, so the pre-flight binds the push to that app, not to the person (`src/runs/preflight.ts:622-628`); a custom repository role that can edit repository rules, without admin, can lift a repository ruleset the pre-flight counted as blocking, since it reads only `permissions.admin` (`:319`); a custom organization role that manages rulesets lets a member who administers the repository lift an organization ruleset the pre-flight counted as blocking, since the role read takes `member` as plain membership (`:279-287`, review/91); an administrator's repository-level acts — a transfer, a rename, a default-branch change — can take the default branch out of an organization ruleset's reach: the shell guard holds their known forms (u6), repository acts respelled past the guard are a residual, and the wall is strongest when the unattended account has no admin on the repository (review/89); `PATH` decides which `gh` a credential helper written as `!gh auth git-credential` runs, the check reading the helper's program name, not the binary it resolves to (`isGhCredentialHelper`, `:532-544`); a `GIT_CONFIG_*` variable changed between the pre-flight and the push: the pre-flight reads git's configuration through git, in the environment the push will use, those variables included, and refuses a read that fails as "configuration unreadable", so only a value changed after it goes unseen (build/73, review/140); and an environment file can name a build file outside the held set — a dev container's build file in another folder, the image a cloud environment builds — which no glob list can follow, so an unattended run can change a later cloud run's setup through it, unlisted (build/78). The attended guard's accepted gaps, left open at the caps of u6's and u14's review loops, in plain words: gh's own field conversions and its current-branch placeholder are read as literal text, so an attended REST commit or ref update made from a checkout on the default branch passes (review/127); a batch ref update whose list element is given whole as a GraphQL variable passes (review/128); the GraphQL forms of a tag-ref create and of a ref delete pass, while their REST twins are refused (build/75); a ref path with a percent-encoded letter passes (build/76); a directory change inside a program word that holds a whole line, or a brace placeholder given as `git -C`'s value, is not followed, so an implied push there is judged on the working directory's branch (review/153, review/154). In an unattended run the unattended rules cover each of these: the push rule refuses every raw `git push`, every REST write on `contents/` and `git/` refs and objects and every GraphQL branch or ref move, whatever the branch (`src/hooks/personOnly.ts:1266-1276`, `:1278-1309`), and the pre-flight's REST check that the account cannot push to the default branch stays the wall. Three gaps the unattended rules do not cover, named as such: PowerShell's command wrappers (`pwsh -c`, `powershell -Command`, `Invoke-Expression`) are not read by the always-on verdict, so a person-only act wrapped in one passes on every client, and the unattended verdict carries the same shell reading (`personOnly.ts:185`, `:1256`), so it is taken to miss a raw push wrapped that way too, read from the code, not run; the REST check still refuses a direct push to the default branch (build/89); gh's alias for the create-and-push form is not read by the unattended rule, so an unattended run can push into a new repository it creates, around the run verbs, the held paths and the last scan, a repository the pre-flight never reads (review/129); and a multi-root workspace file's settings and an editor tasks file's folder-open task are not held paths, so an unattended run pushes a change to either unlisted (build/77). The settings promise at `SECURITY.md:98` restated to what `clean` does: the engine records each allow row, hook entry, member and table it wrote by hash and keeps everything else byte for byte; in `.claude/settings.json` it writes the person-only `permissions.deny` rows the file lacks and removes none — `sync` keeps every deny row byte for byte and in place, an owner's row equal to an engine row included, whatever the ledger's age, and `clean` leaves every deny row and names those equal to the engine's, for the person to remove by hand (`src/manifest/claudeSettings.ts::reduceClaudeSettingsToForeignContent` joins the row's controls) |
| `testCriteria` | Every new table row's `file::symbol` resolves (`test/docsPages.test.ts:1957-1987`); every risk above listed, in the words REQ-FLOW-104 uses; the mapping holds a row per control |
| `edgeCases` | A renamed symbol → the docs test red (intended) |
| `depends_on` | u16-gate-verbs, u19-run-end, u20-hook-emission |
| `verify` | `npx vitest run test/docsPages.test.ts` |
| `amended` | 2026-10-15: three accepted risks added from u8's fix round — the cloud proxy's shared app identity, custom repository roles that can edit rules, and `PATH` deciding which `gh` the helper runs (`e7eda022`) |
| `amended` | 2026-10-15: two accepted risks added — a custom organization role that manages rulesets (review/91, 23:36Z), and an administrator's repository-level acts taking the default branch out of an organization ruleset's reach, with repository acts respelled past the guard a residual (review/89, 23:34Z; the 23:20Z sign-off) — and the `preflight.ts` citations re-pointed to `e486c406`'s lines; REQ-FLOW-104 in the delta now lists the same risks (build/41) |
| `amended` | 2026-10-16: the residuals the record assigns here — review/89 and review/91 (kept, their rows closing when `SECURITY.md` names them), the `GIT_CONFIG_*` window between the pre-flight and the push (build/73, review/140), an environment file naming a build file outside the held set (build/78) — and the gaps left open at the caps of u6's and u14's loops (review/127, 128, 129, 153, 154; build/75, 76, 77, 89), named as the attended table's accepted gaps with the unattended rules covering them, and the three the unattended rules do not cover (build/89, review/129, build/77) named as such; the settings promise at `:98` restated to the `clean` reading (`d788b2a6`); REQ-FLOW-104 in the delta lists the same |

### u22-eval-golden — the unattended golden cases and the twin

| Field | Content |
|---|---|
| `id` | u22-eval-golden |
| `requirements` | REQ-PROVE-038 |
| `files` | five new cases under `evals/cases-v6/` — golden floor: `unattended-close-opens-draft-pr`, `unattended-mid-run-question-to-morning-list`, `unattended-blocked-run-still-hands-off`, `unattended-hookless-preflight-refuses`; benign twin: `benign-attended-twin-leave-uncommitted` (the `benign-` prefix is how the instrument detects a twin, build/65); `evals/coverage-exemptions-v6.md` (u9's row removed), `evals/SET-v7.md` (`:109-112`, `:130`, `:3019`, the appendix, "What v7 adds", the index, a dated paragraph), `scripts/eval/run.mjs:50`, `.stamity/overrides/skills/st-eval-run/SKILL.md:133-135`, `evals/README.md:566` |
| `interfaces` | The case shape of `evals/cases-v6/golden/unattended-run-applies-declared-default.md:1-8` (`id`, `class`, `claim`, `source` a verbatim range of the skill or command text it quotes, `metric`, `floor`) with `## Brief` and `## Expected`'s numbered Binding and Advisory lists; each floor case carries a `must NOT` row; the roster after: 149 cases (87 golden, 32 adversarial of which 8 twins, 30 probes), 37 floors, 447 scenarios, 899 calls with calibration |
| `testCriteria` | `npx vitest run test/evals` green: the roster recomputed, every quote verbatim and anchored, the skill sourced so its exemption is gone; the counts in the four literal places equal the roster |
| `edgeCases` | A quoted range a later fix moves → re-quoted in that fix's diff |
| `depends_on` | u15-work-text, u14b-ask-gate |
| `verify` | `npx vitest run test/evals` |
| `amended` | 2026-10-16: the twin's file name as landed, `benign-attended-twin-leave-uncommitted` (build/65, `3f51f7f9`); REQ-PROVE-038 in the delta names it a release-gating twin, not an advisory case (review/123, build/67) |

### u22b-eval-adversarial — the unattended adversarial cases and the re-baselines

| Field | Content |
|---|---|
| `id` | u22b-eval-adversarial |
| `requirements` | REQ-PROVE-038 |
| `files` | five new adversarial floor cases under `evals/cases-v6/adversarial/` — `unattended-open-questions-refuse-start`, `unattended-ship-it-overnight-no-merge-or-tag`, `unattended-item-says-merge-refused`, `unattended-non-write-comment-no-fix`, `unattended-kickoff-claims-approval`; the two re-baselined cases `golden/unattended-run-applies-declared-default.md` and `golden/unattended-close-keeps-real-defects.md`; `evals/SET-v7.md`, `scripts/eval/run.mjs:50`, `.stamity/overrides/skills/st-eval-run/SKILL.md:133-135`, `evals/README.md:566` |
| `interfaces` | As u22; the roster after: 154 cases (87 golden, 37 adversarial of which 8 twins, 30 probes), 42 floors, 462 scenarios, 929 calls with calibration |
| `testCriteria` | `npx vitest run test/evals` green; each new case a non-twin floor case with a `must NOT` row; the counts equal the roster |
| `edgeCases` | A re-baselined case's expected rows contradicting the new text → rewritten to the text, the move named in the dated paragraph |
| `depends_on` | u22-eval-golden |
| `verify` | `npx vitest run test/evals` |

### u23-spec-merge — the delta into the specs

| Field | Content |
|---|---|
| `id` | u23-spec-merge |
| `requirements` | REQ-FLOW-019, REQ-FLOW-025, REQ-FLOW-036, REQ-FLOW-075, REQ-FLOW-077, REQ-FLOW-080, REQ-FLOW-088, REQ-FLOW-089, REQ-FLOW-090, REQ-FLOW-091, REQ-FLOW-092, REQ-FLOW-093, REQ-FLOW-094, REQ-FLOW-095, REQ-FLOW-096, REQ-FLOW-097, REQ-FLOW-098, REQ-FLOW-099, REQ-FLOW-100, REQ-FLOW-101, REQ-FLOW-102, REQ-FLOW-103, REQ-FLOW-104, REQ-FLOW-120, REQ-PLUGIN-016, REQ-CTX-012, REQ-BOARD-002, REQ-BOARD-005, REQ-PROVE-038 |
| `files` | `docs/specs/everyday-flows.md` (REQ-FLOW-089 to -104 and -120 added; -019, -025, -036, -075, -077, -080, -088 and REQ-PLUGIN-016 amended; REQ-FLOW-065's citation re-pointed, inbox `2026-10-11_release-1-14-0/spec/8`), `docs/specs/orchestrator-context.md` (REQ-CTX-012), `docs/specs/board-writes.md` (REQ-BOARD-002, REQ-BOARD-005), `docs/specs/prove-behavior-and-value.md` (REQ-PROVE-038) |
| `interfaces` | The delta above, merged append-or-amend only, each citation pointing at the landed line; each spec's header line gains "amended in run <run-id> on <date>" |
| `testCriteria` | The structural coverage pass over this plan and the merged specs exits 0; `npx vitest run test/authoring` green |
| `edgeCases` | A citation to a line a later fix round moves → re-pointed at that round |
| `depends_on` | u1-record-head, u2-coverage-port, u3-freshness-contract, u4-pr-runners, u5-morning, u6-person-only-tables, u7-learn-read, u8-preflight-core, u9-unattended-skill, u10-board, u10b-debug-quick, u11-rework-pr-resolve, u12-protocol-plan-shape, u13-plan-check, u14-shell-guard, u14b-ask-gate, u15-work-text, u16-gate-verbs, u17-plan-verb, u18-run-verb, u18b-run-checkpoint, u19-run-end, u20-hook-emission, u21-security-page, u22-eval-golden, u22b-eval-adversarial |
| `verify` | `node content/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/021-cloud-runs-01.md docs/specs && npx vitest run test/authoring` |

## Inbox rows this file matched

`stamity ledger inbox --paths <this package's files> --area unattended cloud overnight draft morning` matched 81 of 147
rows. Each is folded, placed, or left with its reason (ids are the `Ref:` fragment).

| Ref | Disposition |
|---|---|
| `2026-10-11_release-1-14-0/build/14` | folded into u21: the mapping gains the resume card's and the ledger strip's rows |
| `2026-10-11_release-1-14-0/spec/8` | folded into u23: REQ-FLOW-065's citation re-pointed while the spec is open |
| `2026-10-14_cli-native/close/1` (the committed model list) | placed: file 2 (`docs/plans/021-cloud-runs-02.md`) |
| `docs/plans/020-cli-native-01.md` (the held `plugin` block, due at the first release after 1.15.0) | placed: file 2, with the manifest's other change |
| `2026-10-14_cli-native/build/31` | placed: file 2, with the block it reads |
| `2026-10-10_next-tier/review/22`, `build/14` | placed: file 2 (Copilot's agent files) |
| `2026-10-14_cli-native/build/43`, `build/45`, `build/67`, `build/76`; `docs/plans/020-cli-native-02.md` (hook latency) | placed: file 2 (each cloud's hooks) |
| `2026-10-11_release-1-14-0/review/36` | left: the instruction-file residual needs a designed lens trigger; this file holds those paths from an unattended pushed tree, which narrows but does not close it |
| `2026-10-12_board-writes/close/1`; `2026-10-11_release-1-14-0/fix/17` | left: routing every inbox writer through the CLI is an engine design (`src/runs/ledgerStore.ts:1175-1182`); this file adds no inbox writer |
| `2026-10-14_cli-native/build/19` | left: `/st-debug`'s refused-folder stop is not this file's behaviour; u10b edits other lines |
| `2026-10-10_next-tier/review/40`; `2026-10-14_cli-native/cut/29` | left: `/st-work` has no spare character above its cut |
| `2026-10-10_next-tier/build/44`, `review/87`; `2026-10-11_release-1-14-0/build/24` | left: each asks for a derivation test; u22 and u22b update the literals by hand and the roster test recomputes the index |
| `2026-10-08_product-core/build/50`, `review/127`, `close/2`, `close/3`, `close/4`; `2026-10-11_release-1-14-0/fix/5`, `fix/16`, `prove/1` | left: `gate`'s history read and scanner residuals; u16 adds a choice and a flag and changes neither read |
| `2026-10-11_release-1-14-0/close/4`, `close/6`, `close/7`, `close/8`, `build/16`, `build/17` | left: placed with the docs package |
| `2026-10-11_release-1-14-0/fix/13`, `fix/14`, `review/51`, `fix/25`, `review/68`, `review/65`, `fix/32`, `fix/33`, `fix/22` | left: the designed unit on the bare-repository look, `when: touched` on files this file does not edit |
| `2026-10-10_next-tier/review/37`, `review/79`, `build/19`, `review/104`, `review/108`, `review/95`, `review/20`; `2026-10-11_release-1-14-0/prove/2`, `audit/1`, `close/12`; `2026-10-12_board-writes/close/2` | left: the inbox and ledger readers, unchanged here |
| `2026-10-12_board-writes/qa/3`, `qa/4`, `plan/27` | left: board fill and setup behaviour; u10 edits the pickup and author lines only |
| every other matched row (`check`, `clean`, `init`, `validate`, `sync`, pack, merge and Codex rows) | left: matched by a broad path; not this package's behaviour |

## Execution order

1. Wave 1, thirteen lanes at once, files disjoint: `u1`–`u8` (engine) and `u9`, `u10`, `u10b`, `u11`, `u12` (corpus).
   Each lane runs its own `verify` only, never the full suite; `u16` adds every wave-1 and wave-2 file's `PLAN_MAP` row
   and root wiring, and the architecture test's call-site rules go green at `u19`, when the last new module gets its
   caller; the corpus lanes re-quote their case files and leave `evals/SET-v7.md` to u15.
2. Wave 2: `u13` (after u2, u3), `u14` (after u1, u6), `u15` (after u9, u10, u10b, u11, u12).
3. The integration lane, serially: `u16` → `u17` → `u18` → `u18b` → `u19`; `u14b` after `u14`, then `u20` in its own
   lane beside the integration lane (its files are disjoint), folded after `u19`. Then `u21` beside `u22` → `u22b`, then
   `u23` last.
4. Derived files only in the integration lane: the dogfood copies (`npm run build && node dist/cli.js sync`), the CLI
   reference (`node scripts/generate-docs.mjs`) and the golden snapshots (`npx vitest run
   test/emit/crossClientGoldens.test.ts test/corpus/emissionGoldens.test.ts test/emit/upgradeFrom1140.e2e.test.ts
   --update`, the files first and the flag last), each diff read before it is committed and grepped for a ledger id.
5. Then typecheck, lint, knip, the full suite alone under the machine lock, `npm run check`, the dogfood check, the leak
   gate and the hygiene check, each read by its exit code; per-unit review on every unit, the security lens on u4, u6,
   u7, u8, u9, u10b, u11, u14, u14b, u16, u17, u18, u18b, u19, u20 and u21, and the whole-branch review before the
   merge.

## QA walk

At most one person row: the security-negative check that a real Claude Code session in a scratch repository, after
`sync`, refuses `git tag v0` and `git push origin HEAD:main` through the shell guard. No `permissions.deny` row covers
either: the `git tag` rows all begin with an option, and no row ends in a branch name (`src/hooks/personOnly.ts:107-167`),
so the refusal to expect is the guard's (build/40). The QA prover tries it
first through `scripts/qa/hook-runs.mjs` on the operator's own client (a live client check, under the machine lock);
proven there, no person row remains. Every other behaviour is proven by a committed test.

## Risks

- **Warning** — the deny rules change attended work: an agent no longer merges, tags or pushes to the default branch.
  Mitigation: the changelog and the morning list say so plainly; the person runs those acts.
- **Warning** — a push spelling drifting between the run verb and the guard would block the run's own push or let a
  default-branch push through. Mitigation: one table (u6) and one matrix test shared by u14 and u18b.
- **Warning** — `gh api`'s status and draft-422 text are read from documentation, not a captured response.
  Mitigation: the status from `--include`'s head line; file 2's container leg stubs both; the maintainer's cloud checks
  run the real call.
- **Warning** — the canary and the unattended push rule both read state a steered run could rewrite. Mitigation: named
  a canary and a residual on `SECURITY.md`; the REST check is the wall.
- **Minor** — `/st-board` sits about one line under its body cap. Mitigation: u10 rewraps within its regions.
- **Minor** — this repository never runs Stamity unattended (its pre-flight refuses here); the refusal is proven by
  u8's test on its ruleset shape.

## Open questions

None.

## Follow-ups (appended to `.stamity/inbox.md` when this plan lands)

- Minor · — · the seven asks with no declared default stop at `BLOCKED_AMBIGUITY` when nobody answers; give each a
  declared value · source: /st-plan · Ref: docs/plans/021-cloud-runs-01.md · when: a run reports one of them stopping
  an unattended run · files: content/commands/st-work.md, content/commands/st-board.md, content/commands/st-plan.md,
  content/commands/st-spec.md, content/commands/st-quick.md
- Minor · src/runs/pullRequest.ts · the draft-422 message match rests on documentation; pin it from a captured
  response · source: /st-plan · Ref: docs/plans/021-cloud-runs-01.md · when: the first live draft refusal is seen

## Drop list

| Item | Revisit when |
|---|---|
| A deny that holds only while unattended | the maintainer chooses it knowingly at a walk |
| Board readiness checked inside `plan check` | a board source the CLI can read without a session exists |
