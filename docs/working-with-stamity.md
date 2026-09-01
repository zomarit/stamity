---
title: Working with stamity
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit e79570c. -->
<!-- Re-open when: a touchpoint joins or leaves the command surface, a touchpoint's one-line job
     changes, a `stamity worktree` subcommand joins or leaves, `.stamity/worktree.json` changes
     shape, or the receipt's `version` moves off 1. `test/docsPages.test.ts` holds this page to the
     hand-page contract, and `../AGENTS.md` owns the touchpoint index this page narrates. -->

# Working with stamity

[Setup](getting-started.md) leaves a charter, a conditional rule and skill layer, and nine
touchpoints covering the lifecycle. This page is what to do with them: which one to open for a
given piece of work, what each is allowed to do on the way, and what is on disk when it stops.

Only a client with a project command surface turns these into `/st-<name>` invocations. Claude
Code and Copilot get them that way; Cursor reads them as skills and Codex has no
repository-level command home, so on those two you ask for the flow by name in plain words.
[The capability matrix](capability-matrix.md) is the one home for that, per client.

## The nine

| Touchpoint | Its job | Reach for it when |
|---|---|---|
| `/st-spec` | create or maintain the project spec under `docs/specs/` | the change needs a written definition of done before anyone plans it |
| `/st-plan` | route an intent — feature, bug, refactor, migration, test, roadmap — into a persisted plan | research spans several angles, or a human reviews before code moves |
| `/st-work` | execute planned work end to end; closes with the QA human checkpoint | scope is settled and the work starts now |
| `/st-board` | work a task board: chat, a referenced file, or a linked platform board | the input is a backlog rather than one change |
| `/st-ask` | read-only codebase Q&A; writes nothing | you need to understand something before deciding anything |
| `/st-debug` | reproduce, root-cause, and fix a defect | behaviour is wrong and the cause is not yet known |
| `/st-quick` | Tier-1 small-change lane; gates still run | the change is small, obvious, and touches five files or fewer |
| `/st-rework` | apply structured feedback to agent-implemented work | delivered work came back with comments |
| `/st-pr-resolve` | resolve pull-request review comments | those comments live on a pull request |

The spine under all of it is **intent → plan → execution**. `/st-spec` grounds the intent,
`/st-plan` turns it into an artifact somebody can argue with, and `/st-work` executes. The other
six are entry points onto that same spine from wherever the work actually arrives — a question,
a defect, a backlog row, a review thread.

## Picking the entry point

Three judgments cover almost every case.

**Is the change small and obvious?** Then `/st-quick`, which applies Tier-1 edits inline and
still gates them. It refuses rather than stretches: more than five files, roughly 200 changed
lines across the batch, any dependency or lockfile change, any public contract or migration, or
any touch on authentication, authorization, session handling, credentials, key material, payments
or access control ends the lane for that item. The security row has no size floor — a one-character edit under a credential path is
refused on the surface it touches, because what that surface needs is the review loop quick does
not run. The refusal states the measurement and carries the item list over to `/st-work`.

**Is the cause known?** If behaviour is wrong and nobody can yet say why, `/st-debug` before
anything else. It instruments to observe, never to fix, and its exit is a root cause with cited
evidence plus a failing test — which then becomes the plan handed to `/st-work` (or to
`/st-quick`, when the cause is one mechanical slip inside the thresholds above). Debug not
applying the fix itself is the point: a command that fixes by default cannot gate the step that
performs the fix.

**Does a human need to read the plan first?** `/st-work` decomposes in-session and continues
straight into Build. `/st-plan` stops at a persisted artifact under `docs/plans/` that survives
the session, gets reviewed, and is picked up by a later `/st-work` run or by `/st-board fill`.
Scope settled and starting now takes the first; research spanning several angles takes the
second.

## One change, walked through

Say the work is adding a rate limit to an existing endpoint. It is a real feature, it touches a
public contract, and nobody has written down what "done" means.

1. **Orient.** `/st-ask` for what already exists — the current middleware, how errors are
   shaped, whether anything retries. It writes nothing, so it costs only the reading.
2. **Plan.** `/st-plan` researches across angles and persists one artifact under `docs/plans/`,
   decomposed into units an implementer can execute without this session's history. `/st-plan`
   writes the acceptance criteria into that artifact and `/st-work` merges the spec delta at its
   Prove phase, so a change this small earns its spec entry on the way through rather than up front —
   `/st-spec` leads instead when the definition of done spans more than this one change. The
   artifact carries a `stamp:` of the head commit and the `reads:` paths its research depended on, so a
   later run can tell per path whether it is still fresh or stale.
3. **Execute.** `/st-work` runs Frame, Understand, Plan, Build, Prove. Build dispatches to
   sub-agents — the orchestrator does not edit product files, per charter invariant 7.
4. **Prove.** Each pass spawns a dedicated `test-runner` sub-agent that runs the gates and
   returns them gate by gate, with the exact command and verbatim failing excerpts. Bare
   pass/fail is not a result. A reviewer/fixer loop runs over the built units on `file:line`
   evidence, capped at four rounds by default, and stops as blocked with the open findings
   attached rather than declaring convergence it did not reach.
5. **Close.** The QA human checkpoint is mandatory at every intensity: a what-to-verify summary
   naming each observable behaviour the change added or altered, each with a check a person can
   run in under a minute, then a guided pass.

What is on disk afterwards is the proof block under `.stamity/runs/` — gate results with their
commands, review verdicts per round, the decisions trace, artifacts touched with their owning
sub-agent, and a recommended next step derived from that run's own state. Beside it sits the
findings ledger, one row per finding, and the run-exit invariant that no finding ends the run
pending: every row closes as fixed, deferred with a rationale, or rejected with reasoning.

Spec deltas from the change merge back into `docs/specs/` as a confirm-gated, append/merge-only step,
so the spec that grounded the plan is also what the plan updated.

By contrast: a typo in a user-facing string is one `/st-quick` item and closes in a single pass.
A bug report with no known cause starts at `/st-debug` and reaches the same pipeline one step
later, carrying a test that already fails.

## No green, no done

Every flow ends on the charter's verification gates — here
`npm run lint && npm run typecheck && npm run test` — and the floor holds at every tier, in
every lane, including `/st-quick`. A run that cannot reach green ships a `Not done:` list naming
each open gap instead of a claim. That is why quick delegates its gates to a sub-agent even
though it applies its own edits: "the gates ran" is worth reading only when it comes from
somewhere other than the writer.

## Two changes at once

One tree per change, each with its own branch, all sharing one clone. `stamity worktree` is the
managed lane over that: it creates the checkout, places the machine-local files a checkout cannot
carry, writes down exactly what it placed, and tears down from that record.

```sh
stamity worktree setup rate-limit
```

**The trees live outside this repository.** The farm defaults to
`../.stamity-worktrees/<repo-name>/`, beside the clone rather than inside it, and `<name>` is both
the directory under the farm and the branch the worktree checks out. Nothing the lane creates lands
in your working tree — the record of what it placed goes in the new worktree's own git directory —
so there is no ignore rule to add and `git status` here is unchanged by any of it.

**The setup itself travels with the checkout, because it is committed on purpose** — `AGENTS.md`,
the `.agents/` and `.claude/` trees, and `.stamity/` with its manifest, learnings and handoffs are
all tracked, so the new worktree comes up with the same charter, rules, skills and touchpoints as
the original. Records written but not committed do not travel; that is a property of a checkout,
and `list` is what makes it visible rather than surprising.

**What does not travel is what the lane places.** `.env.mcp` is the built-in case: `.gitignore`
excludes it as MCP credentials, so setup copies it across and holds it at `0600` rather than
leaving you to remember. `node_modules` is a built-in `skip` — install inside the new tree, because
a symlinked dependency directory gets written *through* by the next install. Both are defaults you
can see and change: write `.stamity/worktree.json` to add an entry, mark one `secret`, or skip
something. Absent, which it is in most repositories, those two defaults apply.

**Three things need your consent, and a run that cannot ask says so instead of guessing.** Attaching
to a branch that already exists locally, tracking one that exists on `origin`, and copying anything
marked `secret`. Interactively you get the question; under `--json` or with no TTY the first two
refuse and name the flag that would have answered them (`--use-existing`, `--track`), and the
secret copy is skipped with the report naming `--copy-secrets`. `-y` answers all three. `--dry-run`
prints the plan — the resolved farm, the branch plan, the entry table, and every gate with the
answer this invocation gives it — and asks nothing at all.

**A setup that gets half way says so.** If the checkout was created and an entry then failed, the
run exits 1 and still reports the worktree's path and branch and each entry's own outcome. The tree
now exists, so the recovery is to clean it up and set up again: `stamity worktree cleanup <name>`
inverts what did land, and if even the receipt failed to write — leaving a tree nothing can scope —
`stamity worktree cleanup <name> --force` removes the whole orphaned tree. A run refused before
anything was created reports no worktree, because there is none.

```sh
stamity worktree list
```

One row per worktree git knows about, managed by this lane or not: path, branch, head, dirty
counts, ahead/behind, whether a receipt is present, whether that tree carries a stamity setup, and
how many handoff records it holds. Above the table, if the clone has stashed work, one line saying
so — a stash is one list for the whole clone and belongs to no row below it.

```sh
stamity worktree cleanup rate-limit
```

Teardown inverts the receipt and nothing else: it removes what setup recorded placing, and a copy
whose bytes you have edited since is kept and reported as diverged rather than deleted. A worktree
with no readable receipt is reported and left alone. Then the checkout goes — `--force` for one
carrying uncommitted changes, `--files-only` to leave the checkout in place, `--all` to sweep every
worktree this lane manages. **A branch is never deleted**, not by setup, not by cleanup, not under
`--force`. The report prints the `git branch -d <name>` line for you to run if you want it: a
directory is reconstructible from a ref, and a ref is not reconstructible from a directory.

Plain `git worktree add` still works, and a tree you make that way appears in `list` as unmanaged
and is left alone by `cleanup` — the setup travels with any checkout, because it is committed.

Run a touchpoint in each worktree independently, and run the gates there too — a green gate in
one tree says nothing about the other, and the two branches only meet at merge. Charter invariant
6 is the thing to watch when they touch the same API shape, schema or event: file-disjoint is not
contract-disjoint.

## Where to go next

- [Getting started](getting-started.md) — install, what lands, and the first proven change.
- [CLI reference](cli-reference.md) — every verb, flag, and exit status.
- [Packs and trust](packs-and-trust.md) — adding content on top of the corpus, and the gates it passes.
- [Troubleshooting](troubleshooting.md) — what `check` prints, and what each row means.
