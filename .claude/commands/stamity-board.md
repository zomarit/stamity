---
description: "Work a backlog from any source — chat, file, or platform board: fill, pickup with readiness gate and handoff to work, groom, setup."
---

# /stamity-board

Turns any backlog into ready items, hands one item at a time to `/stamity-work`,
and keeps the linked source aligned with what the repo actually shipped. The
board does not execute work: selection ends in a handoff, not an edit.

## Modes

Open with the chosen mode and its reason on one line — `mode: pickup — an item
id was named`. When two modes fit the request equally, ask once with the two
readings named; default to the read-only one.

| Mode | Runs when | Ends with |
|---|---|---|
| `fill` | raw intent exists (chat, file, inbox) and items do not | items created or refined, each with a readiness verdict |
| `pickup` | a ready item is about to be worked | a handoff payload for `/stamity-work` |
| `groom` | the board drifted from repo reality | a health view plus applied dispositions |
| `setup` | no source is linked yet | a recorded source link and a semantics advisory |

Sub-agent dispatch: `fill` and `pickup` each brief a researcher — duplicate and
context scan for `fill`, collision census for `pickup`. Independent briefs go
out in one parallel batch; results merge through this command, which is the
single writer for every item it touches.

### fill — intake to items

1. **Collect sources.** Read the sources named in the invocation, then the
   source linked for this session, then `.stamity/inbox.md`. With no linked
   source and an empty inbox, fall back to chat intake and ask for the items
   directly. Nothing is invented: no backlog file is created, no todo file is
   written, no source is assumed to exist because one usually does.

   Invocation grammar: `--source <ref>`, repeatable, where `<ref>` is a repo
   path, a platform item or board identifier, or `chat`. Order is precedence —
   the first `--source` wins a conflict, and a later one contributes only what
   the earlier did not carry. `fill` is the one mode that reads more than one
   source in a run; every other mode takes the single linked source. An
   unresolvable `<ref>` is reported by name and skipped, and the run continues
   against the sources that did resolve.
2. **Scan before creating.** Brief the researcher, one brief per independent
   question: open items describing the same outcome, delivered work that
   already covers it, and the repo and spec context the acceptance criteria
   must respect. A duplicate folds into the existing item and is not re-filed.
3. **Interview the gaps only.** Score each candidate across the six dimensions
   below, then ask about unanswered dimensions in ONE batched question per
   theme — not one question per item, and not a question the source answers.

   | Dimension | Answered when the source states |
   |---|---|
   | Scope | what done looks like, and what is out of scope |
   | Value | the user problem and who feels it |
   | Unknowns | the open design decisions, or that there are none |
   | External blockers | dependencies on people, services, or approvals |
   | Size | one deliverable, or the split it needs |
   | Stakeholder | the affected user and the current workaround |

   All six answered skips the interview. One or two open asks targeted
   questions. Three or more open means the item is decomposed first, then
   re-scored.
4. **Source acceptance criteria in priority order.** (1) the user's interview
   answers; (2) constraints and failure modes the user stated; (3) repo context
   — existing tests, interfaces, contracts; (4) model inference, marked
   `inferred` so it can be validated. Every criterion names a verifiable
   outcome: "rejects a missing required field with a 400 and a field-level
   message", not "validates input".
5. **Triage the inbox.** Each entry becomes a new item, folds into an existing
   item, becomes a recorded proposal, or is dropped with its reason recorded.
   An entry leaves `.stamity/inbox.md` once its destination item exists — or,
   where the destination is a proposal this contract cannot file, once the run
   report records that proposal under an id and the entry is annotated with it.
   That is the drain for proposal-only entries: without it the rendezvous grows
   monotonically, since the write-back contract opens no creation channel. A
   proposal still unfiled after two further `fill` runs is re-raised in the
   bundled question rather than aging in place.
6. **Verdict per item.** Apply the readiness gate below and record `ready` or
   the named gaps. Items reach the source through the write-back contract only,
   and that contract opens no creation channel: a new item is a proposal in the
   run report until a person files it.

Labels are a default, not a mandate: `type:*`, `priority:*`, `area:*`,
`status:*` when the source carries no taxonomy of its own; an existing taxonomy
is adopted as it stands.

### pickup — select, gate, hand off

1. **Read candidates** from the linked source. An unlinked source has no
   pickup — run `setup` first, or work from `fill` output in chat. The link is
   session-carried, so `pickup` cannot confirm a `setup` that ran in an earlier
   session: a session that arrives with no link runs `setup` again rather than
   assuming one, and that refusal is the same one an unlinked repo gets.
2. **Order by dependency.** `Blocked by #N` is hard: an open blocker removes
   the candidate from this pass. `Recommended after #N` is soft: it advises
   sequence and blocks nothing. Implementation Order is a derived view over
   those two edge kinds — read it, rebuild it when the edges change, and do not
   maintain it as an independent field.
3. **Collision check.** Predict each candidate's write surface: the paths its
   body names plus the researcher's scan, and the named contracts it touches
   (endpoint paths, schemas, event names, exported symbols, shared config
   keys). Two candidates sharing a file or a contract collide even when their
   file sets look disjoint. On a collision, defer the lower-priority candidate
   to the next pass and say which one was deferred and why — overlapping writes
   are not assigned in parallel.
4. **Readiness gate — one pass, no loop.** Every row holds or the item returns
   to `fill`. The gate reports gaps; it does not fix them.
   - acceptance criteria present, each one verifiable
   - scope states what is out of scope, or states that nothing is excluded
   - open unknowns resolved, or a spike item exists and is linked
   - dependencies recorded, every hard blocker closed
   - small enough to estimate; an oversized item is split before it is picked
5. **Hand off to `/stamity-work`.** The payload carries item id and source link,
   acceptance criteria verbatim, scope in and out, the satisfied dependency
   list, the predicted write surface, and the progress-event channel below.
   Where the status channel was enabled for this session, the item moves to
   in-progress through it, and that is the last write pickup performs. Where it
   was not — the read-only default, or a source this run cannot write — pickup
   writes nothing: the return block's `writes` list stays empty and `handoff`
   carries `status-write: skipped`, so the work run does not assume a board
   already showing the item in progress. Everything after that belongs to the
   work run and returns as events.

### groom — maintain

**Health view (read-only).** Item counts by status; unready items each with its
named gap; dependency cycles; soft edges pointing at closed items; links that no
longer resolve. The view mutates nothing and is safe to run at any time.

**Staleness.** Two criteria earn their cost:

- **S2 — status contradicts delivery.** A merged pull request against an item
  still open, or an item in review with no open pull request behind it.
- **S4 — already delivered.** A merged or closed change already produced the
  item's outcome. Partial overlap is not S4.

Dispositions split by direction. Forward re-syncs apply automatically: an item
moved to done behind a merged pull request, a comment recording the newer
evidence. Closes and status downgrades are confirm-first and arrive as ONE
bundled question at the end of the pass — not per item, and not silently.

That question states its mechanism per row, because a close is not one thing
across platforms. `status` — the platform models closure as the status field's
terminal value, so the close rides the status-transition channel and is applied
on confirmation. `proposal` — closure is a separate operation the status field
does not express, so no channel carries it and the row is recorded in the run
report for a person to apply. A row whose mechanism the reference table does not
settle is a `proposal`; guessing it into a transition is how a board acquires a
state nobody chose.

**Grouping is guidance.** Propose epic groupings and re-scopes once, apply what
the user confirms, and stop. There is no re-scoring loop and no audit pass over
the result.

**Completed items are immutable.** A request to change a delivered item is
refused; append a superseding item that cites the original instead. The
original's record stays as the evidence of what was delivered.

### setup — wiring

1. Pick the platform from the reference table and confirm its access path
   answers: the CLI reports an authenticated session, or the MCP server is
   configured and reachable. Setup verifies a session that already exists. It
   captures no credentials and stores none.
2. Record the source link — platform, project or repository, board identifier.
   It is session-carried: no config key and no manifest field holds it, so the
   link lives in this run's report and is re-supplied on the next session. One
   linked source at a time. A durable home is not built, and this text claims
   none — a pointer at storage that does not exist is worse than the honest
   sentence.
3. Choose which write-back channels are enabled for this session. The default is
   read-only, and it is where every session starts: enablement is session-
   carried too, so a channel opened here is open until the session ends and
   never after.
4. **Post-merge semantics advisory, once.** State for this platform what a
   merged pull request does to an item on its own, and what stays manual: the
   platform's own automation, the status a merge produces, and who moves the
   item when the platform moves nothing. Recorded at setup, not repeated per
   run.

## Sources and authority

Four source kinds, one model: chat, a referenced file, a backlog file found in
the repo, or a platform board. No source shape is required — this command owns
no board file of its own and imposes no line grammar on anyone else's.

- **The linked source is authoritative.** Its content is read as given, not
  corrected in place.
- **Board is truth for STATUS. Repo is truth for CONTENT.** Where an item
  stands lives on the board; requirements, criteria, and design live in the
  repo and its specs.
- **One direction at a time.** Item state flows source-to-repo on read, and
  repo-to-source through the four write-back channels. Two-way file-and-board
  synchronization is not performed at any tier.
- **Completed items are immutable** — append or supersede, never rewrite.
- **Optional mirror.** Items may be mirrored one-way into the client's native
  task list for visibility. The mirror is a view: it is not read back as truth
  and never propagates to the source.

## Semantic signals

Three signals are extracted from any source shape. An absent signal stays
absent; it is not inferred into the source.

| Signal | Extracted from | Consumed by |
|---|---|---|
| Priority bucket | an explicit label, the heading an item sits under, or stated urgency | ordering within a dependency level at pickup |
| Business or technical lean | a scope tag, or the stated audience of the outcome | interview depth in `fill`, review emphasis at handoff |
| Spec reference | a trailing `Ref: <path>`, or an inline link to a spec file | acceptance-criteria sourcing, and the spec delta the work run merges |

## Platform reference table

The one place platform facts live; every mode reads them from here, so platform
churn changes this table and nothing else. Verified 2026-08 — re-verify each
audit cycle.

| Platform | MCP tools | CLI fallback | Access check | Status field | Availability |
|---|---|---|---|---|---|
| GitHub | `mcp__github__list_issues`, `mcp__github__get_issue`, `mcp__github__update_issue`, `mcp__github__add_issue_comment` | `gh issue list/view/edit/comment`, `gh pr view`, `gh project item-list` | `gh auth status` | issue `state` (`open`/`closed`); a project board adds its own `Status` single-select | core |
| GitLab | `mcp__gitlab__*`, pack-declared — one tool per board-contract verb | `glab issue list/view/update/note`, `glab mr view` | `glab auth status` | issue `state` (`opened`/`closed`); board columns are label-backed | pack |
| Azure DevOps | `mcp__azure-devops__*`, pack-declared — one tool per board-contract verb | `az boards work-item show/update`, `az repos pr show` (the `azure-devops` extension) | `az account show` | `System.State`, whose values come from the project's process template | pack |
| Anything else | `mcp__<server>__*`, pack-declared | pack-supplied | pack-declared | pack-declared | pack |

**Tool naming and fallback direction.** Content names the canonical
`mcp__server__tool` id, never a bare command: a mode calls the MCP tool where
the server is configured and its access check passes, drops to the CLI column
when it is not, and reports the failed check and stays read-only when neither
answers. Naming the tool is what keeps this content portable — the CLI is the
graceful fallback, not the interface.

**Status field** is the platform's own primitive that the status-transition
channel writes, and the vocabulary the phase map in the progress contract
resolves into. It is also what decides whether a close is a transition or a
proposal: a platform whose status field carries the terminal value closes
through the channel, and one whose closure is a separate operation does not.

**Availability** is where support lives — `core` ships in the box, `pack`
arrives with an installed pack. It says nothing about the platform's own status
model: what a merged pull request does to an item there is platform behavior,
and `setup` states it once in the post-merge semantics advisory.

Packs implement one abstract board contract — `list`, `get`, `update`,
`comment`, `link-PR` — and every mode calls that contract rather than learning a
second platform vocabulary. A missing CLI or an unreachable server is reported
with the access check that failed, and the run continues read-only against
whatever source remains.

## Write-back contract

Read-only by default. A write happens only when its channel was enabled at
setup, and only through these four channels:

1. **Progress comment** — one comment per progress event on the item, carrying
   the event id, so a replay updates the existing comment instead of adding a
   second one.
2. **PR link** — associates a pull request with the item, once per pull
   request.
3. **Status transition** — moves the item's status field or column to a mapped
   value. Forward transitions apply automatically; a downgrade is confirm-first.
   A platform close rides this channel exactly when the platform models closure
   AS that status field — a terminal value the field already carries, per the
   reference table's Status field column. Where closure is a separate operation
   the status field does not express, it is a proposal in the run report, and
   the fifth-channel refusal below is what stops it becoming a write.
4. **PR-thread reply** — a reply on one review thread, written by
   `/stamity-pr-resolve` only, one reply per resolved finding.

Those four are the whole set. Creating an item and writing labels are not among
them: a new item is a proposal in the run report and its labels travel with it,
the one exception being the status field or column the status channel maps.
Item bodies, titles, checklist ticks, deletions, and any edit to a completed
item stay outside as well, and surface the same way — proposals in the run
report for a human to apply. Closes are the one case that splits, and channel 3
above states which side a given platform falls on. A write that would need a
fifth channel stops and returns `BLOCKED_DEPENDENCY` rather than improvising
one.

## Progress contract

The work run publishes progress events with zero platform knowledge; this
command maps them onto the channels above. Every event carries
`id = <run-id>/<kind>/<subject>` and is idempotent by that id: a retry after a
failed or half-applied platform write converges on the same board state and
posts no duplicate.

| Event | Emitted when | Board mapping |
|---|---|---|
| `phase.transition` | a work phase opens or closes | status transition, where the phase map below carries the phase |
| `criterion.done` | an acceptance criterion is verified | progress comment |
| `pr.linked` | a pull request opens for the item | the PR link channel |
| `run.terminal` | the run ends done or blocked | status transition plus a closing progress comment naming the outcome |

Every cell in the mapping column names one or more of the four write-back
channels and nothing else. A checklist tick would be an item-body edit, which no
channel opens, so `criterion.done` publishes as a progress comment: the most
routine event on the board stays loud, and a run that also wants the tick
carries it as a proposal in the report. A mapping that named an action outside
the four would return `BLOCKED_DEPENDENCY` by the fifth-channel rule — which is
why the column is written in channel names.

The phase map channel 3 resolves against:

| Work phase | Mapped item status |
|---|---|
| Frame, Understand, Plan | in progress |
| Build, Prove | in review |
| terminal — done | done |
| terminal — blocked | blocked, or the platform's nearest needs-attention value |

The left column is this flow's vocabulary and the right column is the board's;
the platform's own spelling for each right-hand value is the Status field column
of the reference table. A phase with no mapped status emits no transition.

Mapping is table-driven and one-way: an event never names a platform status,
and platform state never rewrites the run. An unmapped event is dropped with a
line in the report — an unknown event is not a failure, and it is not invented
into a transition either.

## Deferral inbox

`.stamity/inbox.md` — one fixed location, one declared row grammar, and this
command is what parses it.

- **Writers, four:** `/stamity-rework` deferrals, `/stamity-pr-resolve` findings
  routed out of the current change, `/stamity-plan` follow-ups appended while
  planning, and the dep-audit skill's deferred upgrades.
- **Readers, three, all mandatory:** `fill` triages the inbox on every run,
  `/stamity-work` surfaces overlapping entries at its framing phase when a run
  touches the files an entry names, and `/stamity-plan` folds overlapping entries
  into its shared intake. An inbox no one reads is a defect.
- **Row grammar, declared:** `severity · file:line · description · source: <writer>`,
  with an optional `Ref: <path>` and an optional tag word. `file:line` is `—`
  when the row names no location. The writers' own row grammars are this one, so
  a reader parses rather than guesses. A row that does not parse is kept verbatim
  and triaged as an untagged entry: the grammar governs what board can read, not
  what a writer is allowed to say.
- **Triage order:** rows tagged `critical-deferred` are triaged first, ahead of
  every other row and regardless of file order. That tag is the elevated-triage
  signal a deferred Critical carries; with no reader pulling it forward, a
  deferred Critical is indistinguishable from a Minor.
- **Removal:** an entry leaves when its destination item exists, when its
  proposal id is recorded per `fill` step 5, or when the user drops it by name.
  Triage does not rewrite an entry in place.

## Return contract

Every run returns one block:

- `status` — `DONE`, `BLOCKED_AMBIGUITY` (a question is open),
  `BLOCKED_DEPENDENCY` (a hard blocker, missing access, or an unlinked source),
  or `BLOCKED_FAILURE` (a platform or gate failure, with its evidence).
- `mode` — the mode and the one-line reason it was chosen.
- `source` — kind and link, or `chat` when intake had no linked source.
- `items` — id, title, readiness verdict, and named gaps, per item.
- `writes` — every write-back channel used, with its item id and event id;
  empty when the run stayed read-only.
- `handoff` — the payload passed to `/stamity-work` (`pickup` only).
- `open` — what this run did not act on, each rated `Critical`, `Warning`, or
  `Minor`, with where it went: inbox, report, or an open question.
- `next` — the recommended next step, derived from this run's own state and not
  from a fixed menu: unready items and their named gaps, inbox entries that did
  not drain, proposals waiting on a person. With nothing outstanding, the line
  says so.
