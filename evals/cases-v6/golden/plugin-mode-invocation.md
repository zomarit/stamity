---
id: plugin-mode-invocation
class: golden
claim: "Running as the Claude Code plugin invoked at `/stamity:st-plan`, a plan run fans its research out under the namespaced agent form `@stamity:stamity-researcher`, reaches its coverage pass through the skill form `/stamity:st-verify` inside the root, keeps itself the single writer of the artifact, and cites the charter-reference phrase the root renders rather than an unresolved gate token."
source: content/commands/st-plan.md:88-97,164-166,285-290
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and treat the
quoted blocks as the only governing text you hold. Respond exactly as you would in the live
session.

Governing text — `content/commands/st-plan.md`, "Research fan-out":

```text
**Research fan-out.** Each intent section below names its research questions. Spawn one
`researcher` per independent question, in parallel — a dependency edge is the only reason to
sequence. Typical width 2-4; 5-6 when the request spans several modules. `spec-author` drafts the
spec-delta section from the returned findings. A run that spawns nothing has skipped the research
this command exists for: the intake above is inline reading, not research. Sub-agents return
findings; one writer merges them into one artifact, and that writer is this command's own
orchestrating run — never a sub-agent. `researcher` and `spec-author` return findings and write
nothing, the run drafts every section from them, and the run also executes the plan-lint pass
over its own draft. Naming the writer is what makes the single-writer rule checkable instead of
an undeclared spawn write.
```

Governing text — `content/commands/st-plan.md`, the refactor intent's "Every phase green":

```text
**Every phase green.** Each unit leaves the verification gates passing on its own; no unit borrows
green from a later one. Sequence to that rule and state the verification command per unit — a
sequence that is red between units is a single unit that was split at the wrong seam.
```

Governing text — `content/commands/st-plan.md`, the plan-lint gate's "Structural coverage pass":

```text
**Structural coverage pass.** Before handoff, locate the installed verify skill and run
`node <verify-skill>/scripts/spec-plan-coverage.mjs <plan.md> <spec.md|spec-directory> ...`.
Use its `scripts/` companion relative to that skill's own location, never an assumed
client directory. If the client cannot execute it, report that check unrun; do not
replace a missing result with a claimed pass. A scratch draft may be checked before
publishing the plan. This pass supplements L2/L4 and changes no plan head key.
```

Scenario fixture — how this installation is reached and what it renders, given to you as fact.
Cursor, Copilot and Codex invocation is not measured by this case: those three routes are proven
by the plugin route proof, and this case measures the Claude namespaced form alone.

```text
The artifacts above reach you from an installed plugin root, not from this repository's own
directories. The root declares one literal per carried class:

  commands: /stamity:<id>        (the bare /st-work form resolves when it is unambiguous)
  agents:   @stamity:<id>
  skills:   /stamity:<id>

The agent ids the root carries are stamity-researcher, stamity-spec-author, stamity-reviewer,
stamity-implementer, stamity-fixer, stamity-test-runner, stamity-security, stamity-performance,
stamity-design-quality and stamity-creator.

The skill ids the root carries are st-browser-evidence, st-dep-audit, st-design-system-detect,
st-handoff, st-learn, st-onboard, st-qa and st-verify. They live inside the root, under its own
skills directory; this repository's client directories carry none of them.

The root carries no charter and no repository facts: those are repository-owned. Where an
artifact would have carried the charter's full-gate placeholder, the root renders the phrase
"the Full gate command listed under Verification gates in AGENTS.md" instead, and no artifact in
the root carries a `${STAMITY:` placeholder of any kind.
```

Scenario state — given to you as fact:

> You are that installed plugin's `st-plan` command, invoked as `/stamity:st-plan`. The
> repository is a small TypeScript service whose AGENTS.md carries a Repo facts section and a
> Verification gates section listing four commands. The request is a refactor: one 90-line
> module is to be split in two with no behaviour change.

Scenario input — the operator's message:

> /stamity:st-plan extract the parsing half of `src/report/render.ts` into its own module. No
> behaviour change, and it is small — two units at most.

State how you run this: what you spawn and under exactly which name, who writes the plan
artifact, what the `verify` line of one planned unit says, and how you reach the plan-lint gate's
structural coverage pass.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The response spawns the researcher for the research fan-out rather than doing the research
   inline, and names it in the root's namespaced agent form — `@stamity:stamity-researcher`, or
   the namespaced id `stamity:stamity-researcher` — rather than a bare `researcher`,
   `@researcher` or `@stamity-researcher` as the form it invokes.
2. The response names itself, the orchestrating run, as the single writer of the plan artifact,
   and says the sub-agents return findings and write nothing.
3. Where the response states a unit's `verify` command, it reaches the gate through the
   charter's `Verification gates` section — the rendered phrase "the Full gate command listed
   under Verification gates in AGENTS.md", or that section named as where the command is read
   from — rather than through a gate command it supplies from its own knowledge of the stack.
4. The response reaches the structural coverage pass through the verify skill as the root
   carries it: it names the skill under the root's own skill form, `/stamity:st-verify`, and runs
   the `scripts/` companion relative to that skill's own location inside the root rather than at
   an assumed client directory such as `.claude/skills/st-verify/scripts/`.
5. The response must NOT emit a `${STAMITY:` placeholder as a command, as a `verify` value, or
   as anything else it asks to be run or pasted.
6. The response must NOT hand the writing of the plan artifact to a sub-agent, and must NOT
   describe a researcher or the spec-author as writing any file.

### Advisory criteria — recorded, never scored into the verdict

1. The response names the research questions it fans out on, one per spawn, rather than
   spawning an unexplained count. That the spawn uses the namespaced form is binding above; how
   completely the questions are enumerated is recorded here.
