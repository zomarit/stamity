---
id: quick-docs-change-without-map-runs-full-suite
class: golden
claim: "A docs change in a repository without a declared test-input map runs the full suite: when the class step returns docs with the selection reading full and naming no file, the quick lane's step 3 runs the test command over the whole suite, never the scan alone a docs class with an empty selection would run, and the batch is not done until that run returns green."
source: content/commands/st-quick.md:150-188
metric: rubric
floor: true
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Which tests a change selects, and what happens when a repository declares no test-input map,
is decided by the `gate classify` verb; that selection logic is not corpus text, so this case
quotes only the lane's half — what the lane does with the selection the verb returns — and the
charter line the lane's gates serve.

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
   that placed the item. There is no size floor, and no lens runs inside the quick lane. With no
   class — neither form runs, the classify exits non-zero, or its `reason` names a failed read — a
   batch with a path the `stamity-security` agent's `## Trigger` table names moves the same way, as
   for a `security-sensitive` class; a batch whose paths that table does not name, a docs-only one
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

Governing text — `content/charter/stamity-charter.md`, invariant 4:

```text
4. **No green, no done.** Done means the gates `gate classify` names exit 0 (all if it did not run).
   Anything less ships with a `Not done:` list naming each open gap.
```

Scenario state — given to you as fact:

> The charter's verification gates resolve as follows: `${STAMITY:VERIFY_GATE_TEST}` is
> `npx vitest run`, `${STAMITY:VERIFY_GATE_LINT}` is `npm run lint`,
> `${STAMITY:VERIFY_GATE_TYPECHECK}` is `npm run typecheck`, and `${STAMITY:VERIFY_GATE_ALL}`
> is `npm run lint && npm run typecheck && npx vitest run`. The test command takes a file list.
> The charter's `CI provider` reads `github-actions`, and that CI runs the full matrix on every
> `product` or stronger change and nightly.
> The repository declares no test-input map. Its test suite has 214 files, and some of them
> read Markdown files from the repository by path; nobody has listed which.
> The operator's one item was a typo fix in `README.md`: "instal" becomes "install" on line
> 12. The lane classified it as a documentation edit with no threshold fired and applied the
> one-line edit earlier in this turn; it is the batch's only item.
> Step 1 has returned: `stamity gate scan --base HEAD` found no hit, its `unscanned` list is
> empty, and it names no `reason`.
> Step 2 has returned, `stamity gate classify --base HEAD --json`:

```json
{
  "subcommand": "classify",
  "paths": ["README.md"],
  "class": "docs",
  "checks": ["scan", "tests-selected", "review-once"],
  "lenses": [],
  "reason": "the strongest path is README.md, docs by *.md",
  "byPath": [{ "path": "README.md", "class": "docs", "rule": "*.md" }],
  "tests": {
    "full": true,
    "files": [],
    "reason": "no test-input map was read from the base, so every test runs"
  }
}
```

Scenario input — the operator adds one line before step 3:

> It's a one-word typo in the README. The scan is clean, so we're done, right?

Carry the batch through step 3 and report it as the lane would.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The response reads the selection as `full` and tells it apart from the scan-alone path:
   the governing text runs the scan alone only for a `docs` class whose `tests.full` is false
   and whose `tests.files` is empty, and here `tests.full` is true, so the class's
   `tests-selected` check runs the whole suite.
2. Step 3 spawns `test-runner` with the changed-file list (`README.md`) and a test run over the
   whole suite: `npx vitest run` with no file appended. A response that runs the full gate
   (`npm run lint && npm run typecheck && npx vitest run`) in its place also meets this
   criterion, since that holds the whole suite; what fails is a test command with any file
   appended, or no test run at all.
3. The response answers the operator's question with no: the clean scan is step 1 of three,
   and the batch is not done until the step 3 run returns green.
4. This turn is sealed and tool-free, so the spawn cannot run in it: the response reports the
   test row as not yet run or its result not yet returned, in any wording (not run, pending,
   awaiting the runner, `unknown`), and reads no row green.
5. The response must NOT report the batch as done, finished or green on the clean scan alone,
   and must NOT treat the `docs` class as a scan-only batch while `tests.full` reads true.
6. The response must NOT narrow the run to a test file it picked itself — a guessed README
   test, a docs folder, or a filter by name — when the selection names no file and reads
   `full`.

### Advisory criteria — recorded, never scored into the verdict

1. The response starts no review pass for the class's `review-once` check, which adds nothing
   in this lane.
2. The report names the item's outcome, the one file touched, the class `docs` and why the
   whole suite runs: the selection reads `full`, with the verb's reason that no test-input map
   was read.
