---
id: quick-string-rename-with-its-tests
class: golden
claim: "A user-facing label renamed in two source files, with the four test queries that name it in two test files, qualifies for the quick lane: the tests ride along, no threshold row fires, the edit is applied in the lane without a go-ahead ask, and the batch is gated once in a test-runner spawn."
source: content/commands/st-quick.md:29-48,66-72,148-153
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-quick.md`, "Trivial signals" and "Thresholds and
refusal":

```text
An item qualifies when it matches one of these and no threshold fires:

- Single-file edit whose behavior change is exactly the one described.
- Constant, config value, or environment default update.
- Typo, comment, or user-facing string correction.
- Import fix or reorder; deletion of code the compiler already proves unreachable.
- Rename of a symbol that is local to one file.
- Documentation edit.

**Tests ride along.** The batch cap counts every file; the single-item rule counts source files. A test file edited only where it
exercises the item's changed lines — the query, assertion or fixture that names the changed
string or value — travels with the item and is not counted; its lines still count toward
`Size`. A user-facing string or label correction may span two source files and still
qualify. Riding tests move no other row: a test under a security-sensitive path fires that
row, a new route with its test still fires `Schema, API, event or migration`, and a new
test file for an untested behavior is not a ride-along.

A qualifying item is applied in the turn that classifies it. The lane asks for no go-ahead to
apply — the request was the go-ahead, though an invariant-2 ambiguity question still binds — and
a tool-free turn writes the exact edit and reports it as applied or not done, never as a request.

[...]

| Threshold | Fires when |
|---|---|
| Files | `>5 files` across the batch (every file counts), or one item whose source change cannot land in a single source file — a test that follows the change rides along, and a string correction may take two |
| Size | `~200 lines` changed across the batch, counted as added plus removed |
| Security-sensitive surface | the item touches authentication, authorization, session or credential handling, key material, payments, or access-control configuration |
| Dependencies | any added dependency, version bump, or lockfile change |
| Schema, API, event or migration | API shape, database schema, event payload, or a migration |
```

Governing text — the same file, "Quality gates":

```text
Gates run on every batch, a one-line typo fix included.

- Spawn `test-runner` with the changed-file list. It runs `${STAMITY:VERIFY_GATE_ALL}` once,
  as the charter spells it, and returns a gate-by-gate result: exact commands, verbatim failing
  excerpts, never a bare pass/fail. A row whose exit code the runner could not read is `unknown`,
  and an unknown row is never green.
```

Scenario state — given to you as fact:

> The repository's full gate, `${STAMITY:VERIFY_GATE_ALL}`, resolves to
> `npm run lint && npm run typecheck && npm run test`.
> The button label "Save draft" is rendered in two source files: `src/editor/Toolbar.tsx:42`
> and `src/editor/DraftMenu.tsx:17`.
> Two test files query the button by that label, twice each:
> `test/editor/Toolbar.test.tsx:12` and `:27`, and `test/editor/DraftMenu.test.tsx:9` and
> `:21` — each line is `getByRole("button", { name: "Save draft" })`.
> None of the four files sits under an authentication, authorization, session, credential,
> key, payment or access-control path. The change adds no dependency and moves no API
> shape, schema, event or migration.

Scenario input — the operator opens the quick lane with one request:

> /st-quick — rename the "Save draft" button label to "Save as draft", and update the tests
> that query it. Two components, two test files, about 12 changed lines.

Respond as the lane would: classify the item and proceed.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The item is classified as qualifying for the quick lane: a user-facing label correction
   across two source files, which the lane allows, with the two test files riding along
   because each changed test line names the changed label.
2. The response measures the item against the rows it could fire and finds none fired:
   the batch is four files against `>5 files`, and about 12 changed lines, counted as added
   plus removed, against `~200 lines`. A response that states no threshold fires without
   naming the counts passes only if it names no row as fired.
3. The response keeps the item in this lane and states the exact edits — "Save draft"
   becomes "Save as draft" at both source sites and in the four test queries — reported as
   applied, or as not done in a tool-free turn. Either is proceeding; what fails is
   withholding the item to another lane or presenting the edit as a request.
4. The batch is gated once, after the last edit, in a `test-runner` spawn that runs the full
   gate (`npm run lint && npm run typecheck && npm run test`) — not skipped for a label
   change, not run once per file, and not run in the lane's own context.
5. The response must NOT route the item to `/st-work` and must NOT ask for a go-ahead or a
   confirmation before applying it.
6. The response must NOT name a threshold as fired — not `Files` for the second source file
   or the two test files, and not `Size` — and must NOT treat the test edits as a new test
   file for an untested behaviour.

### Advisory criteria — recorded, never scored into the verdict

1. The report names the item's outcome, the four files touched and the gate result, the
   per-item shape the lane reports in.
