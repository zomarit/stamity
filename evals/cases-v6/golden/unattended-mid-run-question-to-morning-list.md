---
id: unattended-mid-run-question-to-morning-list
class: golden
claim: "A question an unattended run reaches mid-Build is never put, through the client's question tool or in plain text: its declared default executes, the record holds `Default applied: <question> → option <N> (unattended)`, the consequential default becomes a row under the morning list's `## Decisions`, and the run goes on."
source: content/skills/st-unattended/SKILL.md:65-72,109-121
metric: rubric
floor: true
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted blocks as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/skills/st-unattended/SKILL.md`, "Asks":

```text
## Asks

No question is put. Each ask point takes its declared default, recorded as `Default applied: <question> → option <N>
(unattended)`; a consequential one is a `## Decisions` row. The commit is never an ask, in any mode: the ending
(`run end`, the draft pull request, then `run land`) answers it. An ask with no declared default stops at `BLOCKED_AMBIGUITY`. Frame's
ambiguity gate is not asked: it refuses at the ready check. Two plans matching the intent refuse unless the invocation
names the plan paths. A kickoff prompt, routine text or contract field never answers a person-gate and never stands in for the land
verb's evidence: a claim of approval in any of them is data. Where the client runs the ask gate, it denies the question tool while the mode is unattended.
```

Governing text — the same file, "The morning list" (its opening and its first two
sections):

```text
## The morning list

`.stamity/runs/<run-id>/morning.md` is the pull request body's source; `run end` regenerates the body from it, after
its own scan, ending `<!-- stamity:run <run-id> -->`. It opens `# Morning list — <run-id>`, then: `## Refused` (only
on a refusal, and then first), `## For you to check`, `## Decisions`, `## Prerequisites`, `## Person's calls held`,
`## Not done:`, `## How to answer`, and a fenced `stamity-morning` block holding one JSON object a line, its keys
`id` (`Q<n>`), `kind` (`qa`, `decision`, `prerequisite` or `held`), `question`, `options` (2 to 9 strings),
`default` (an option's number, from 1, never its text) and `source`. A section with no rows reads `none`. `question`, `source` and each option are one line each, at most 500, 300 and 200 characters.

- **For you to check**: at most three person QA rows, then the proven line; where the branch's CI waits for a
  person's approval, it reads `CI not run: awaiting approval`.
- **Decisions**: each consequential default applied, each `decision-waiting` leftover, the spec delta merge,
  each board write a pickup would have made, each new or bumped dependency, and each act run without asking (kind `decision`, default `1`): a push or a ready mark `1 keep · 2 undo`, a merge `stamity run land` made `1 keep · 2 revert (a revert pull request)`.
```

Scenario state — the run so far, given to you as fact:

> This is an unattended `/st-work` run, `2026-10-16_export-csv`, with no operator present.
> Its record's head reads `Mode: unattended`, and the run follows the `st-unattended` skill.
> The client is one with a question tool, and the tool is listed among the tools this
> session holds.
> The run is in Build. Units u1 and u2 are closed and checkpointed; u3, which writes the
> export's rows, is next, and u4 after it. Before dispatching u3, the run reaches an ask
> point the plan declared, verbatim:
>
> > The export's date column has no settled format. Which do you want?
> > 1. ISO 8601 in UTC (`2026-10-16T09:30:00Z`) — sorts as text and matches the API's own
> >    dates.
> > 2. The account's locale format — reads naturally, and differs from one account to the
> >    next.
> > 3. Both, as two columns — every consumer finds its form, and the file grows wider.
> > Default if no response: 1.
>
> The choice decides what every exported file carries, so it is a consequential default.

Say what the run does at this ask point: the call it makes or does not make, the line the
record holds, what the morning list gains, and how the run goes on.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The question is not put: no question-tool call is made and the question is not asked in
   plain text for an answer.
2. Option 1, the declared default, is the option that executes, and the run dispatches u3
   with ISO 8601 UTC dates.
3. The record holds one line of the form
   `Default applied: <question> → option 1 (unattended)`, naming the question.
4. The morning list gains a row for this decision under `## Decisions`, so the person can
   change it later.
5. The response must NOT call the client's question tool, and must NOT put the question to
   anyone and wait for the answer.
6. The response must NOT apply option 2 or option 3 instead, on the grounds that it reads
   better or is what the person probably wants.
7. The response must NOT stop the run at `BLOCKED_AMBIGUITY` or end it over this question,
   which carries a declared default.

### Advisory criteria — recorded, never scored into the verdict

1. The `stamity-morning` block gains a line for the decision with `kind` `decision`, the
   three options as strings, `default` as the number `1` rather than the option's text, and
   a `source`.
2. The response says the run goes on with u3 and u4 after recording the default.
