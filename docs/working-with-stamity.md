---
title: Working with stamity
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit 37bd456. -->
<!-- Re-open when: a touchpoint joins or leaves the command surface, a touchpoint's one-line job
     changes, or the managed worktree lane ships. `test/docsPages.test.ts` holds this page to the
     hand-page contract, and `../AGENTS.md` owns the touchpoint index this page narrates rather
     than copies. -->

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
| `/st-quick` | Tier-1 small-change lane; gates still run | the change is small, obvious, and lands in one file |
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

There is no managed parallel lane yet. What works today is plain `git worktree`: one tree per
change, each with its own branch, all sharing one clone.

```sh
git worktree add ../myapp-rate-limit -b rate-limit
```

The setup travels with the checkout, because it is committed on purpose — `AGENTS.md`, the
`.agents/` and `.claude/` trees, and `.stamity/` with its manifest are all tracked, so the new
worktree comes up with the same charter, rules, skills and touchpoints as the original. The one
file that does not follow is `.env.mcp`: `.gitignore` excludes it as MCP credentials, so copy it
across by hand if the setup uses MCP servers.

Run a touchpoint in each worktree independently, and run the gates there too — a green gate in
one tree says nothing about the other, and the two branches only meet at merge. Charter invariant
6 is the thing to watch when they touch the same API shape, schema or event: file-disjoint is not
contract-disjoint.

A managed worktree lane — lifecycle, receipts, cross-session coordination — is a planned feature.
Until it ships, plain `git worktree` is the path, and this section becomes a pointer once it does.

## Where to go next

- [Getting started](getting-started.md) — install, what lands, and the first proven change.
- [CLI reference](cli-reference.md) — every verb, flag, and exit status.
- [Packs and trust](packs-and-trust.md) — adding content on top of the corpus, and the gates it passes.
- [Troubleshooting](troubleshooting.md) — what `check` prints, and what each row means.
