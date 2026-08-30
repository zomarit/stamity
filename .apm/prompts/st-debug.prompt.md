---
description: Hypothesis-driven debugging with observation-only instrumentation and user reproduction; fixes route through the work pipeline after root cause and a failing test.
---

# /st-debug

Finds what actually causes a defect, then routes the fix through `/st-work`. Fixes by
default; `--diagnose` stops after the cause is named and written up.

## Target detection

Two targets. Detect before step 1 and state the detected target in the first response.

| Symptom signal | Target | Probe |
|---|---|---|
| Failing product test, stack trace in product paths, wrong user-visible behavior | app code | `${STAMITY:VERIFY_GATE_TEST}` on the failing case; `git log -S` on the suspect symbol for the introduction window |
| Generated agent files absent, stale, or edited outside their managed block | this install | `stamity check` — environment probes plus the drift gate |
| Frontmatter or structure complaints about repo-authored content | this install | `stamity validate` |
| Manifest or ownership ledger disagreeing with what is on disk | this install | read `.stamity/manifest.json`, then `stamity check` |

There is no separate doctor verb: `stamity check` is the install probe and its exit code is
the signal — any failing probe or unclean drift exits non-zero, warnings alone exit 0.

Every repo gate named here — the probe above, and the failing-test gate at step 6 — runs in a
`test-runner` spawn, never in this command's own context. The runner returns a gate-by-gate
result: the exact command, pass or fail, and the verbatim failing excerpt. Bare pass/fail is not
a result, and a fresh spawn keeps a long gate's output out of the reasoning context that ranks
the hypotheses. The runner reports and nothing else — it applies no edit and proposes no patch,
so adding it opens no second fix path.

When both targets are live (a product test fails *and* drift is reported), debug the install
first. Generated context is an input to every other hypothesis, so a stale corpus makes the
app-code round unfalsifiable.

## Loop

Nine steps. Steps 1-4 form a round and repeat while the evidence lands short; steps 5-9 run
once each.

1. **Hypotheses.** From the symptom — expected, actual, reproduction path, frequency — write
   numbered hypotheses ranked by prior probability, each paired with the single observation
   that separates it from its neighbours. A hypothesis with no discriminating observation is
   not testable: rewrite it or drop it. Brief a `researcher` when the suspect surface spans
   more than two files or is unfamiliar: symptom trace, introduction window, prior learnings.
2. **Instrumentation.** Delegate the edit to `implementer` — instrumentation is a code
   mutation and is written where every other mutation is. Observation-only logging at the
   discriminating points, every line
   prefixed `[STAMITY-DEBUG]` and naming its site (`[STAMITY-DEBUG] cart/total.ts:41 applyDiscount
   entry — subtotal, coupon id`). Use the logging mechanism the project already has; add no
   dependency. Control flow, state, and error handling stay byte-identical in behavior —
   instrumentation that changes behavior invalidates the round.
   The brief states the exception this spawn runs under, because the implementer's own
   contract mandates a unit with interfaces, a test delta and a spec delta, and observation-only
   logging produces none of the three: no unit, no interfaces, no test delta, no spec delta, and
   the changed-file list plus the instrumented sites as the whole return. A brief that leaves
   the exception unstated promises a unit it does not carry, and the spawn answers it with
   `BLOCKED_AMBIGUITY`. The same exception covers the strip at step 8.
3. **User reproduces.** Stop and wait. The user runs the scenario and returns the output.
   This step is not simulated, not inferred from reading the code, and not passed over
   because the cause looks obvious.
4. **Log analysis.** Order the tagged lines; state which instrumentation points did *not*
   fire, since a silent point is evidence; map every hypothesis to the lines that confirm or
   kill it; strike the killed ones. If no hypothesis survives with evidence, start another
   round with instrumentation moved — bounded by the escape valve below.
5. **Root cause.** Gate `root-cause-before-fix` (see Hard gates).
6. **Failing test.** Gate `failing-test-before-fix` (see Hard gates).
7. **Fix through the work pipeline.** The diagnosis and the failing test become the plan
   handed to `/st-work`; its Build and Prove phases apply the change and gate it. Debug
   owns no fix path of its own. This handoff is the one in-run transition that is not
   user-gated: the command fixes by default, and gating the step that performs the fix would
   leave every run stopped at its own purpose. `--diagnose` is how a run opts out, and step 8
   still runs before the switch.
8. **Instrumentation cleanup.** `implementer` strips what step 2 added; the orchestrator
   verifies the count itself. Zero residue (see Hard gates).
9. **Regression clauses.** Write what the repository shall continue to do, one clause per
   observation the defect violated — "the cart total shall continue to exclude expired
   coupons" — and point each clause at the test that holds it. Clauses with no test are
   listed as gaps in the closing report, not silently dropped.

## Hard gates

| Gate | Passes when | On failure |
|---|---|---|
| `root-cause-before-fix` | The cause is a causal chain from cited `path:line` to the observed symptom, confidence medium or better, explaining every step-4 observation including the points that stayed silent | No product-code edit. Run another round from step 1, or return `BLOCKED_FAILURE` with the surviving hypotheses ranked and the evidence each still needs |
| `failing-test-before-fix` | A test fails on the current tree for the stated cause, and its failure message names the defect rather than asserting a placeholder | The fix does not start. A failure mode that cannot be automated records why, plus a QA row for the human checkpoint |
| Work pipeline executes the fix | The diagnosis plus the failing test are handed to `/st-work` as the plan | An edit applied inside debug is a contract breach — **product code** is what that means, the same boundary gate 1 draws: revert it and re-route. There is no private fix pipeline. Two mutations sit outside the boundary and neither is a fix: step 2's instrumentation, and gate 2's test, which has to exist as a written file to fail on the current tree |
| Zero residue | Repo-wide `[STAMITY-DEBUG]` count is 0, and every helper or import added to support instrumentation is gone | Repeat cleanup until the count is 0. A run above 0 does not report done |
| Zero residue — capture-later exception | The user agreed at step 3 to capture later, so the instrumentation stays. The agreement is recorded with its date and the sites left in place | The count is stated, never claimed as 0, and the run closes `not done: <n> instrumentation lines held under a capture-later agreement`. It is the one exit that reports residue and still closes |

A hypothesis is not a root cause, and a green test is not a root cause either: both are
consistent with a coincidence. The chain has to say why the symptom follows from the cited
lines, and what would have to be true for the chain to be wrong.

### No reproduction, no fix

When the user cannot reproduce — intermittent, environment-only, or the scenario is not
available to them — the loop stalls at step 3 and returns `BLOCKED_DEPENDENCY` naming exactly
what it needs: environment, data, access, or a longer capture window. Instrumentation stays
in place only when the user agrees to capture later; otherwise step 8 runs immediately.

A fix written without a reproduced observation is speculation. Record the ranked hypotheses
and the observation each one still needs, and stop there.

### Zero residue on every exit path

Cleanup runs on every exit: fix shipped, `--diagnose` report, reproduction blocked, escape
valve, user abort, and escalation to another command. No exit path leaves a tagged line, a
commented-out probe, or a helper that existed only to carry one. Search the repository for
the tag before the closing report and state the resulting count in it.

One exception, and it is the gate table's own row: a capture-later agreement recorded with the
user holds the instrumentation in place. That run reports its count rather than zero, and the
next run over the same defect strips it first. No other path holds residue.

### `--diagnose` (report only)

Stops after gate `root-cause-before-fix`. Produces the ranked hypotheses with their verdicts,
the root cause with cited evidence and confidence, the failing test as a specification (what
it asserts and where it belongs, not a written file), and the fix approach with its risk.
Steps 6 and 7 do not run. Step 8 does.

## Escape valve — three failed fixes question the architecture

A failed fix is one that reached step 7, landed, and left the symptom, brought it back, or
broke a gate that had been green. Three failed fixes on one defect end the fix loop.

The counter is **in-session**: debug keeps no workspace and writes no run record, so it counts
the fixes attempted in this conversation and nothing earlier. A new session starts at zero, and
the closing report states the count it is carrying so a user on the fourth attempt across two
sessions can see that the valve did not fire and call it themselves.

At the third failure, stop fixing and report instead:

- the invariant the current design cannot hold, stated as a property;
- the structural reason the failure is reachable, cited to `path:line`;
- two or more structural options with their costs and their blast radius.

Route to `/st-plan` with a refactor or migration intent. A fourth attempt against the
same design is not debugging — it is the same experiment run again.

## Escalation

Never automatic below the first row: the user switches in session, and step 8 runs before any
switch. The first row is the exception, and it is step 7 — a default run hands the fix to
`/st-work` on its own, because a command that fixes by default cannot gate the step that
performs the fix. That row is listed here for the `--diagnose` run, which stops before step 7
and reaches the same transition as a switch the user makes.

| Situation | Switch to | Evidence carried |
|---|---|---|
| Cause confirmed, failing test written | `/st-work` | diagnosis plus failing test as the plan |
| Three failed fixes | `/st-plan` | hypotheses, evidence, structural options |
| Cause is one mechanical slip inside the quick thresholds | `/st-quick` | the cited line plus the failing test |
| The symptom turns out to be a question, not a defect | `/st-ask` | the symptom rewritten as the question |
| The defect arrived as review feedback on delivered work | `/st-rework` | the diagnosis as a triage input |
