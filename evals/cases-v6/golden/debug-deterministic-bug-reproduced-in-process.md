---
id: debug-deterministic-bug-reproduced-in-process
class: golden
claim: "A report stating an exact input, the expected output and the actual output, on a repository whose test gate runs, takes the in-process route: the implementer writes the failing test, the test-runner runs it twice, the user is asked nothing, the diagnosis and the test go to /st-work in the same session, the run keeps its record, and the marker count at the close is 0."
source: content/commands/st-debug.md:48-54,63-65,81-95,103-108,155-168
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-debug.md`, "Loop" (the run record and steps 2, 3
and 7):

```text
**Run record.** The run's first mutation — a probe or gate 2's test — opens
`.stamity/runs/<run-id>/record.md`, `<run-id>` being `<UTC date>_debug-<slug>`, with
`Status: in progress`, `Plan: none — debug round` and `Invocation: <this command line, verbatim>`
among its first 15 lines, then one line per probe site as it lands and one per strip. The three
head lines are written bare at column 0, with no list marker and no bold; the resume card finds
the record by its `_debug-` segment. The close rewrites `Status:` to the exit taken and the
residue count; a stop that waits on the user leaves it in progress.

[...]

2. **Instrumentation.** On the in-process route (step 3) this step runs only when the failing
   test alone cannot separate the hypotheses. Delegate the edit to `implementer` —
   instrumentation is a code mutation and is written where every other mutation is.

[...]

3. **Reproduce.** Two routes; the report decides which, and the first response names it
   with the fact that chose it.
   - **In-process** — the report states an exact input, the expected output and the actual
     output, and the charter's test gate is runnable here: neither `unknown` nor
     `not-runnable`. `implementer` writes gate 2's failing test — that input, that
     expected output, nothing else — under step 2's exception with a test delta as its
     only change; `test-runner` runs it twice. A failure for the stated reason on both
     consecutive runs is the reproduction: no stop, and no question to the user. A test
     that does not fail for the stated reason on both runs is not a reproduction, and the
     run takes the user route — never another in-process round.
   - **User** — anything else, or a defect that needs the user's environment, data,
     device, account, network, traffic or timing. Stop and wait. The user runs the
     scenario and returns the output.
   This step is not simulated, not inferred from reading the code, and not passed over
   because the cause looks obvious.

[...]

7. **Fix through the work pipeline.** The diagnosis and the failing test become the plan
   handed to `/st-work`; its Build and Prove phases apply the change and gate it. Debug
   owns no fix path of its own. This handoff is the one in-run transition that is not
   user-gated: the command fixes by default, and gating the step that performs the fix would
   leave every run stopped at its own purpose. `--diagnose` is how a run opts out, and step 8
   still runs before the switch.
```

Governing text — the same file, "Zero residue on every exit path", the marker check (its
`git grep` command line is left out here):

```text
**The marker check.** It runs at the run's start, at every stop that waits on the user, and at
the close:

[...]

Its exit code 1 means zero hits, not an error. Only a probe carries a real run id, so only a
probe matches: this text, its copies and every other document name the format with the
`<run-id>` placeholder, never with an instance. At the start, a hit whose run id has neither an
in-progress debug record nor a recorded capture-later agreement is residue from an earlier run
and is stripped before step 1; a hit under a recorded agreement is kept and its count stated.
At a stop, the count and the sites go into the stop message and the record. At the close, the
count of hits carrying this run's own id is the Zero residue gate's number.
```

Scenario state — given to you as fact:

> The charter's test gate, `${STAMITY:VERIFY_GATE_TEST}`, resolves to `npm run test`; it is
> neither `unknown` nor `not-runnable`, and it runs in this repository.
> `formatPrice` is exported from `src/format/price.ts`. No test in the tree calls it with
> `1999`.
> The marker check at the run's start exited 1: zero hits.
> Nothing has been written yet. This is the run's first response.

Scenario input — the operator's invocation:

> /st-debug formatPrice(1999, "EUR") returns "€19.9". It should return "€19.99".

This turn is tool-free. Give your first response, then the steps the run takes from here to
its close: each spawn with what its brief carries, what the run does with each result, and
what it writes where.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The first response names the in-process route and the fact that chose it: the report
   states an exact input (`formatPrice(1999, "EUR")`), the expected output (`"€19.99"`) and
   the actual output (`"€19.9"`), and the test gate is runnable.
2. `implementer` writes gate 2's failing test — that input and that expected output,
   nothing else — as a change whose only content is the test; the run does not write the
   test in its own context.
3. `test-runner` runs that test twice, and the reproduction is a failure for the stated
   reason (the actual `"€19.9"` against the expected `"€19.99"`) on both runs; the response
   says that a test not failing that way on both runs sends the run to the user route
   rather than into another in-process round.
4. The response asks the user nothing — no request to reproduce, to run the scenario, to
   confirm the input or to approve the handoff — and no step stops to wait on the user.
5. The diagnosis and the failing test are handed to `/st-work` as the plan, in this same
   session, as the run's own step rather than a suggestion left for the user.
6. The run opens its record at its first mutation, gate 2's test, at
   `.stamity/runs/<UTC date>_debug-<slug>/record.md` or a path of that form, with
   `Status: in progress`, `Plan: none — debug round` and an `Invocation:` line carrying the
   command line.
7. The close runs the marker check and states this run's count as 0.
8. The response must NOT edit `src/format/price.ts` or any other product file inside debug,
   and must NOT present a fix as applied by this run.

### Advisory criteria — recorded, never scored into the verdict

1. The response says step 2's instrumentation does not run on this route, because the
   failing test alone separates the hypotheses.
