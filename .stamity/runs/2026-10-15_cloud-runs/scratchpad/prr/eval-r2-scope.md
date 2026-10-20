**decision:** ACCEPT

**severity:** Minor. The check accepts a contract it should refuse, but nothing at HEAD reads the scope entries afterwards. `src/runs/planCheck.ts` only reads `parsed.contract.plan?.trim()` (`:507`) and never touches `scope`. So the harm is that a contract can be called ready while naming no usable path, not that a run goes wrong. That makes it Minor rather than Warning.

**confidence:** high, basis `direct`. I read every line cited below at HEAD `cbc610ac`.

**applicability:** current. The line the reviewer cited (`:340`) is the return inside `readStringList`, and the check it relies on is on `:339`, unchanged.

**evidence:**
- `src/runs/runContract.ts:339`: `value.every((entry) => typeof entry === "string" && entry !== "")`. `"   "` passes this test. (Q1)
- `src/runs/runContract.ts:352-355`: the empty-`scope.in` check is `inside.length === 0`, which is a count of entries. `["   "]` has length 1, so the check never fires. (Q2)
- `src/runs/runContract.ts:310` (`requiredText`) and `:317` (`optionalText`): the single-value fields use `typeof value === "string" && value.trim() !== ""`, and keep the value as written. The prerequisite `name` (`:376`) and `owner` (`:382`) use the same trimmed check. (Q3)
- `src/runs/runContract.ts:357`: `scope.out` goes through the same `readStringList`, so it has the same gap. (Q4)
- `test/runs/runContract.test.ts:199-211`: the only `scope.in` refusal test uses `in: []`. No test sends a whitespace-only entry, which is why the gap is untested.
- `docs/specs/everyday-flows.md:3699-3704` (REQ-FLOW-098) says strict parsing but does not spell out a rule for scope entries. The fix fits the spec, and the spec text needs no amendment.

**causal_chain:**
1. A contract has `scope: { in: ["   "] }`. YAML parses it as a one-item list holding a string of spaces.
2. At `runContract.ts:339`, `"   " !== ""` is true, so `readStringList` returns `["   "]` and reports nothing.
3. At `:353`, `inside.length` is 1, so the "must name at least one path or area" problem is skipped.
4. If no other field fails, `problems` is empty at `:138`, `parseRunContract` returns `ok: true` with a scope that names nothing, and `stamity plan check --contract` treats the contract as valid.

**counter_argument:** none. This is an ACCEPT.

**smallest_fix:** at `src/runs/runContract.ts:339`, change `entry !== ""` to `entry.trim() !== ""`, keeping each entry as written as `requiredText` does. This one change covers both `scope.in` and `scope.out`, and it also makes the empty-`scope.in` check at `:353` work again, because a whitespace-only list now becomes `[]` through the `?? []` fallback. The "must name at least one" message still won't print for that list, because the "list of non-empty strings" problem is reported instead, and that is enough to refuse the contract.

**proving_test:** in `test/runs/runContract.test.ts`, add a test titled "refuses whitespace-only scope entries". It replaces `in: [src/runs, test/runs]` in `FULL` with `in: ["   "]` and expects one problem containing `` `scope.in` ``. A second assertion sets `out: ["  "]` and expects a problem containing `` `scope.out` ``. Both fail on the code at HEAD and pass after the fix.

**also_affected:**
- `scope.out`: same problem, through the shared `readStringList` (`:357`).
- `allow`: this field doesn't exist in the contract. The allowed top-level keys are listed at `:74-86`, and there is no list field other than `scope.in`, `scope.out` and `prerequisites`.
- `prerequisites`: not affected. Each item must be a map, and its `name`/`owner` already use the trimmed check (`:376`, `:382`).
- Single-value fields (`plan`, `item`, `acceptance`, `answerer`): not affected, since they already use the trimmed check.

There are no breaking-change candidates. The fix only rejects contracts the parser accepts today, and the exported `RunContract` type and `parseRunContract` signature stay the same.

Every question was answered. Sources read: `src/runs/runContract.ts`, `src/runs/planCheck.ts` (searched for scope and contract reads), `test/runs/runContract.test.ts`, `docs/specs/everyday-flows.md` (REQ-FLOW-098), and the brief at `brief-r2b.txt`.

**status:** DONE