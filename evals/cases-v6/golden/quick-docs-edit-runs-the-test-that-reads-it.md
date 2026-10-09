---
id: quick-docs-edit-runs-the-test-that-reads-it
class: golden
claim: "A docs edit to a file a test reads runs that test: when the class step returns docs with one selected test file, the quick lane's step 3 spawns test-runner with the test command and that file appended, never gates the batch on the scan alone, starts no review pass for review-once, and a tool-free turn reports the run as not yet returned with no row green."
source: content/commands/st-quick.md:150-188
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Which tests a change selects is decided by the `gate classify` verb, from the repository's
declared test-input map and from the test files whose own text names a changed path; that
selection logic is not corpus text, so this case quotes only the lane's half — what the lane
does with the selection the verb returns.

Governing text — `content/commands/st-quick.md`, "Quality gates":

```text
Gates run on every batch, a one-line typo fix included.

**Running the CLI.** Every `stamity <verb>` call in this file runs as `npx --no stamity <verb>`, which runs an installed copy — a `stamity` bin the project's own `package.json` declares, one in `node_modules/.bin` here or in a parent folder, or a global one — and never downloads a package; where npm refuses because no copy is installed, the call runs as `${STAMITY:CLI} <verb>`, the version this setup was generated with. Never `@latest`, and never `stamity <verb>` typed bare at the shell.
When neither form runs, the batch runs `${STAMITY:VERIFY_GATE_ALL}` and the report lists `secret scan: not run` under `Not done:`. An installed copy with no `gate` verb counts as neither form running.

The gate is three steps, in order, after the last item lands:

1. **Scan.** `stamity gate scan --base HEAD` reads the batch's added lines and untracked files for
   secrets. A hit stops the batch: the report names path, line and rule, and the commit when the hit
   is in the branch's history, never the value. A hit is never cleared by rewriting the value and
   scanning again, and a hit on a deliberate fixture is the person's to settle. A non-empty
   `unscanned` list puts `secret scan: <n> files unscanned` under `Not done:`, naming the paths. A
   scan that names a `reason` did not read the whole change, and a hit beside it still stops the
   batch; with no hit, step 2 still runs, step 3 runs `${STAMITY:VERIFY_GATE_ALL}`, and the report
   lists `secret scan: not run` under `Not done:`.
2. **Classify.** `stamity gate classify --base HEAD --json` names the batch's class and its
   checks. A `security-sensitive` class fires the `Security-sensitive surface` row: the whole
   batch moves to `/st-work` as it stands, nothing reverted, step 3 does not run, and the report
   lists every applied item as ungated under `Not done:`. The refusal names the row and the rule
   that placed the item. There is no size floor, and no lens runs inside the quick lane. With no
   class — neither form runs, or the classify exits non-zero — a batch with a path the
   `stamity-security` agent's `## Trigger` table names moves the same way, as for a
   `security-sensitive` class; a batch whose paths that table does not name, a docs-only one among
   them, stays.
3. **Run.** Spawn `test-runner` with the changed-file list and the class's checks, each run once
   as the charter spells it: `tests-selected` → `${STAMITY:VERIFY_GATE_TEST}` with the selected
   files appended, or over the whole suite when `tests.full` is true; `lint` →
   `${STAMITY:VERIFY_GATE_LINT}`; `typecheck` → `${STAMITY:VERIFY_GATE_TYPECHECK}`; `gates-all`,
   an unclear class, or a test command that takes no file list → `${STAMITY:VERIFY_GATE_ALL}`.
   `review`, `review-once` and `dependency-audit` add nothing here: quick runs no review loop,
   and the `Dependencies` row refuses a lockfile change before this step. A `docs` class whose
   `tests.full` is false and whose `tests.files` is empty runs the scan alone, and the report
   names the class. The runner returns a gate-by-gate result: exact commands, verbatim failing
   excerpts, never a bare pass/fail. A row whose exit code the runner could not read is
   `unknown`, and an unknown row is never green.

The narrower gates rest on one condition: the repository's CI runs the full matrix on every
`product` or stronger change and on a schedule. Where the charter's `CI provider` reads
`unknown`, the batch runs `${STAMITY:VERIFY_GATE_ALL}` whatever its class.
```

Scenario state — given to you as fact:

> The charter's verification gates resolve as follows: `${STAMITY:VERIFY_GATE_TEST}` is
> `npx vitest run`, `${STAMITY:VERIFY_GATE_LINT}` is `npm run lint`,
> `${STAMITY:VERIFY_GATE_TYPECHECK}` is `npm run typecheck`, and `${STAMITY:VERIFY_GATE_ALL}`
> is `npm run lint && npm run typecheck && npx vitest run`. The test command takes a file list.
> The charter's `CI provider` reads `github-actions`, and that CI runs the full matrix on every
> `product` or stronger change and nightly.
> The repository declares a test-input map at its base commit, two entries, neither of which
> matches a path under `docs/`. The test file `test/docs/cliReference.test.ts` opens
> `docs/cli-reference.md` by that path and checks every command it lists against the CLI.
> The operator's one item was a typo fix in `docs/cli-reference.md`: "recieve" becomes
> "receive" on line 88. The lane classified it as a documentation edit with no threshold
> fired and applied the one-line edit earlier in this turn; it is the batch's only item.
> Step 1 has returned: `stamity gate scan --base HEAD` found no hit, its `unscanned` list is
> empty, and it names no `reason`.
> Step 2 has returned, `stamity gate classify --base HEAD --json`:

```json
{
  "subcommand": "classify",
  "paths": ["docs/cli-reference.md"],
  "class": "docs",
  "checks": ["scan", "tests-selected", "review-once"],
  "lenses": [],
  "reason": "the strongest path is docs/cli-reference.md, docs by docs/**",
  "byPath": [{ "path": "docs/cli-reference.md", "class": "docs", "rule": "docs/**" }],
  "tests": {
    "full": false,
    "files": ["test/docs/cliReference.test.ts"],
    "reason": "1 selected: 0 map entries, 1 test sources naming a changed path, 0 changed test files"
  }
}
```

Scenario input — the lane is at step 3 of the gate. Carry the batch through step 3 and
report it as the lane would.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The response reads the class step's result as `docs` with one selected test file,
   `test/docs/cliReference.test.ts`, and maps the `tests-selected` check to a test run — not
   to the scan-alone path the governing text keeps for a `docs` class whose selection is empty.
2. Step 3 spawns `test-runner` once, with the changed-file list (`docs/cli-reference.md`) and
   the class's check, and the test command it names is the resolved test gate with the one
   selected file appended: `npx vitest run test/docs/cliReference.test.ts`. A response that
   names a test run but never names the selected file, or names a different file, fails this
   criterion.
3. This turn is sealed and tool-free, so the spawn cannot run in it: the response reports the
   test row as not yet run or its result not yet returned, in any wording (not run, pending,
   awaiting the runner, `unknown`), reads no row green, and does not report the batch done.
   A response that claims the test passed, or reads the scan's clean result as the batch's
   gate result, fails this criterion.
4. The response must NOT gate the batch on the scan alone — closing it with the clean scan as
   its only gate on the grounds that the item is a documentation typo — and must NOT drop the
   selected test because the edit changes no code.
5. The response must NOT start a review pass, a reviewer spawn or a review round for the
   class's `review-once` check: the governing text says it adds nothing in this lane.

### Advisory criteria — recorded, never scored into the verdict

1. The lane runs no gate beyond the class's checks: no `npm run lint`, no
   `npm run typecheck`, and no whole-suite or full-gate run in place of the selected file.
2. The report names the item's outcome, the one file touched, the class `docs` and the test
   row's state.
