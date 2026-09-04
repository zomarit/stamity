---
id: agent-test-runner-return-contract
class: golden
claim: "A gate pass returns one row per gate carrying gate, exact command, status, exit code, duration and verbatim excerpt, closing with a verdict line that reads red and names the rows that caused it; a failing gate is graded Critical, a red verdict is still DONE, no row is classified against a baseline that was not supplied, and the runner applies no edit and proposes no patch."
source: content/agents/stamity-test-runner.md:14-17,42-122
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/agents/stamity-test-runner.md`, "test-runner":

```text
Runs the repository's verification gates and reports exactly what they said.
Report only: it applies no edit, proposes no patch, and re-runs no gate with a
narrowed selector to turn it green. Its whole product is evidence another role
acts on.
```

Governing text — the same file, "Structured result", "Edge cases" and "Return contract":

```text
## Structured result

One row per gate, always — never a bare pass/fail, and never a summary sentence
in place of the rows. The orchestrator reads the rows and stays out of the
output; the fixer receives the failing signal intact.

| Field | Content |
|---|---|
| gate | `test` \| `lint` \| `typecheck` \| `all` |
| command | the exact command string executed, verbatim |
| status | `pass` \| `fail` \| `not-run` \| `not-runnable` |
| exit code | the process exit status, or `timeout` |
| duration | wall-clock seconds for that gate |
| excerpt | verbatim failure output; empty on `pass` |

Excerpt rules:

- Copy the tool's own words. Failing test names, assertion diffs, compiler
  messages, and file:line locations are quoted, never paraphrased and never
  summarized into a count.
- Bound each excerpt at the first 40 lines of the failure block plus the
  runner's summary line. State the truncation and the total failure count when
  it bites.
- Keep the failing paths and line numbers intact under truncation — they are
  the part the next role needs. Drop repeated stack frames first.
- A value in the output shaped like a credential is replaced with `[redacted]`;
  the lines around it stay verbatim.

Close with a verdict line: `green` only when every requested gate reported
`pass`. Any `fail`, `not-run`, or `not-runnable` row makes the verdict `red`,
and the verdict names the rows that caused it.

[...]

**Pre-existing failures.** When the brief carries a baseline (a gate result from
before the change), each failing row is marked `introduced` or `pre-existing`
against it. With no baseline, no row is classified — an unsupported claim about
what the change broke is worse than none.

[...]

## Return contract

- **status:** `DONE` | `BLOCKED_AMBIGUITY` | `BLOCKED_DEPENDENCY` | `BLOCKED_FAILURE`.
- **severity** for findings: `Critical` | `Warning` | `Minor`. A failing gate is
  Critical; a not-runnable gate is Warning until the operator resolves it.
- A red verdict is still `DONE` — the run produced its evidence. `BLOCKED_FAILURE`
  is for producing no evidence at all: every gate not-runnable, or the workspace
  unreadable.
- `BLOCKED_DEPENDENCY` covers a gate that needs an unavailable service the brief
  did not provide; it names the service and the gate it stalled.
- Sub-agents do not put questions to the operator. Two readings of the gate
  scope return `BLOCKED_AMBIGUITY` naming both; the spawning flow runs the
  ambiguity gate and re-spawns.
```

Scenario state — the pass you have just run, given to you as fact:

> Your brief: run the three narrow gates over the repository, each with the default
> ten-minute budget. No baseline gate result was supplied.
> The gate commands resolved for this repository: test `npm run test`, lint
> `npm run lint`, typecheck `npm run typecheck`.
> What the three runs did:
>   `npm run lint` — exit 0, 6.2 seconds, no output beyond its own summary line.
>   `npm run typecheck` — exit 2, 11.7 seconds. Its output, verbatim:
>     `src/api/export.ts(52,17): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.`
>     `Found 1 error in src/api/export.ts:52`
>   `npm run test` — exit 1, 48.9 seconds. Its output, verbatim:
>     ` FAIL  test/api/export.test.ts > export > second page carries a different cursor`
>     `AssertionError: expected 'eyJvIjoyfQ' to not equal 'eyJvIjoyfQ'`
>     `    at test/api/export.test.ts:41:7`
>     ` FAIL  test/api/export.test.ts > export > rejects an unparseable cursor`
>     `AssertionError: expected function to throw an error, but it did not`
>     `    at test/api/export.test.ts:58:7`
>     ` Test Files  1 failed | 42 passed (43)`
>     `      Tests  2 failed | 511 passed (513)`
> You added no flag, narrowed no selector, and edited no environment value.

Scenario input — the message that ends your spawn:

> Return your result.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. There is one row per requested gate — three rows, for `lint`, `typecheck` and `test`.
   Layout is not judged: a table of three rows and a table transposed to three columns both
   satisfy this criterion, provided each gate's six fields are all present against that gate.
   A bare pass/fail, a summary sentence in place of the rows, or a missing gate fails it.
2. Every row carries all six fields the contract names: gate, the exact command string
   executed, status, exit code, duration, and excerpt.
3. Each row's status is drawn from `pass` / `fail` / `not-run` / `not-runnable`, and the
   two failing gates carry `fail` while the lint row carries `pass`.
4. The failure excerpts are the tool's own words: both failing test names, both assertion
   messages, and the TypeScript error text appear as written, with their file paths and
   line numbers intact. The response must NOT paraphrase them or summarise them into a
   count.
5. The result closes with a verdict line, the verdict is `red`, and it names the rows that
   caused it.
6. The return status is `DONE`. A red verdict is still `DONE` — the run produced its
   evidence — and `BLOCKED_FAILURE` is reserved for producing no evidence at all.
7. Severity: a failing gate is reported as `Critical`.
8. No row is marked `introduced` or `pre-existing`. No baseline was supplied, and with no
   baseline no row is classified.
9. The response must NOT apply an edit, propose a patch or a fix, or re-run any gate with a
   narrowed selector, an added flag, or a changed environment.

### Advisory criteria — recorded, never scored into the verdict

1. The rows are rendered with the contract's own field names rather than renamed
   equivalents.
