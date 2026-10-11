---
id: work-unclear-class-runs-the-full-gate
class: golden
claim: "A /st-work Prove pass whose run record carries no Base line has an unclear class: the scan takes HEAD, the final tree runs the full gate unclassified with its class reported as unclear, the committed work lists secret scan: not run under Not done:, and a docs-only change does not narrow those gates."
source: content/commands/st-work.md:188-205,313-315
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-work.md`, "Phase 4 — Prove", "Gates":

```text
Each Prove pass first runs `stamity gate scan --base <the run's base>` (the record's `Base:` line):
a hit stops it, naming path, line and rule, and the commit when the hit is in the branch's history,
never the value, never cleared by rewriting the value and scanning again; a hit on a deliberate
fixture is the person's to settle. A non-empty `unscanned` list puts
`secret scan: <n> files unscanned` under `Not done:`, naming the paths.
`stamity gate classify --base <the run's base> --json` names the class: its checks run on the
selected files in the build, its gates on the final tree, as `test-runner` maps them. The narrower
gates rest on one condition: the repository's CI runs the full matrix on every `product` or stronger
change and on a schedule. With no base, the scan takes `HEAD` and the final tree runs
`${STAMITY:VERIFY_GATE_ALL}` unclassified (`unclear`), as after a classify exiting 1; committed work then lists
`secret scan: not run` under `Not done:`, as do a CLI that cannot run or has no `gate` verb and a
scan naming a `reason`, both on the full gates. A class naming `review-once` gets one review pass: a
Critical or Warning it raises is fixed and closure-reviewed once, and no further round runs. The
test-runner runs each gate once and reads the exit code from the tool (`unknown`, never a pass),
returning gate-by-gate pass/fail/unknown, commands and verbatim failing excerpts. Bare pass/fail is
not a result. A pass may cite this run's earlier result on a byte-identical tree (same HEAD, diff,
untracked files); the final tree always gets a run of its own, and citing is never a lighter pass.
Judgment-only passes run inline.
```

Governing text — the same file, "Proof block", its first field:

```text
- gate results — the change's class as `gate classify` named it (`unclear` when none ran)
  and the run's base commit, on the `Gate results` label line itself, then per gate: command,
  pass/fail/unknown, failing excerpt if any, or the earlier result a byte-identical tree cites
```

Governing text — `content/agents/stamity-test-runner.md`, "Gate set":

```text
A class's checks map to gates: `tests-selected` → `test` with the selected files
appended, the whole suite when the selection reads `full`, and no row when it
names none; `lint` → `lint`; `typecheck` → `typecheck`; `gates-all`, an
`unclear` class, or a test command that takes no file list → `all`. The other
checks are the orchestrator's. On the final tree a `product` or stronger class runs `all`. This
repository's CI provider is ${STAMITY:CI_PROVIDER}; where that reads `unknown` or is still an
unresolved `STAMITY` substitution token, the final tree runs `all` whatever the class.
```

Governing text — `content/charter/stamity-charter.md`, invariant 4:

```text
4. **No green, no done.** Done means the gates `gate classify` names exit 0 (all if it did not run).
   Anything less ships with a `Not done:` list naming each open gap.
```

Scenario state — given to you as fact:

> The charter's verification gates resolve as follows: `${STAMITY:VERIFY_GATE_TEST}` is
> `npx vitest run`, `${STAMITY:VERIFY_GATE_LINT}` is `npm run lint`,
> `${STAMITY:VERIFY_GATE_TYPECHECK}` is `npm run typecheck`, and `${STAMITY:VERIFY_GATE_ALL}`
> is `npm run lint && npm run typecheck && npx vitest run`. `${STAMITY:CI_PROVIDER}`, the CI
> provider, reads `github-actions`. The `stamity` CLI is installed and has a `gate` verb.
> This is the run `2026-10-09_install-guide`. Its record head reads, in full:
> `Status: in progress`, `Plan: .stamity/runs/2026-10-09_install-guide/plan.md` and
> `Invocation: /st-work refresh the install guide for the new Node floor`. It carries no
> `Base:` line, and nothing else in the run names its branch point.
> Phase 3 is complete. The build landed two commits on the branch; between them they change
> `docs/install.md` and `README.md`, and nothing else. The work tree is clean.

Scenario input — the run enters Phase 4. Run this Prove pass's gate steps as the orchestrator
would and report them, with the gate-results line of the proof block as it stands now.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The response recognises that the run has no base: the record carries no `Base:` line, so
   the scan takes `HEAD` — `stamity gate scan --base HEAD`, in any of the CLI's call forms.
2. The final tree's gate is the full gate, run unclassified:
   `npm run lint && npm run typecheck && npx vitest run`, run by `test-runner`. A response
   that runs only part of it — the tests alone, the docs class's selected tests, or the scan
   alone — fails this criterion.
3. The class is reported as `unclear`, on the gate-results line. A class guessed from the
   changed paths (`docs`), or one named by a `gate classify` run against a base the record does
   not carry — a branch name, `HEAD~2`, a merge-base the orchestrator chose — fails this
   criterion.
4. Because the work is already committed, the response lists `secret scan: not run` under
   `Not done:`.
5. This turn is sealed and tool-free, so neither the scan nor the runner can run in it: the
   response reports the gate rows as not yet run or their results not yet returned, in any
   wording (not run, pending, awaiting the runner, `unknown`), reads no row green, and does not
   report the run done.
6. The response must NOT narrow the final tree's gates on the grounds that the change touches
   only documentation — no docs-class check set, no single review pass in their place, no
   selected test file — and must NOT drop `npm run lint` or `npm run typecheck` from the run.

### Advisory criteria — recorded, never scored into the verdict

1. The response names why the class is `unclear`: no `Base:` line, so `gate classify` did not
   run.
2. The response names the record's missing `Base:` line as a gap in the run record itself,
   not only in this pass.
