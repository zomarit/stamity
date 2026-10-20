All three findings are true at HEAD `ae65b89e`, and I recommend accepting all three. None of them is covered by a test or a stated limit. F13 and F19 also exist in the skill's `.mjs` copy, which has the same code, so each fix has to go into both copies to keep the parity test passing. F14 is the only one whose runtime claim I couldn't confirm, because running commands was out of scope.

**status:** DONE

---

### F13: malformed shorthand such as `-00X` is dropped without a finding (`src/runs/planCoverage.ts:137`)

- **decision:** ACCEPT
- **severity:** Minor
- **confidence:** high (`direct`). Every step below is read from the code. The reviewer's `status: "pass"` comes from their own run; I did not reproduce it, but the trace gives the same result.
- **applicability:** current
- **evidence:**
  - The malformed check only sees words that start with `REQ-`: `TOKEN_SCAN = /REQ-[^\s,;|.)\]:(]+/g` at `src/runs/planCoverage.ts:119`, used at `:136-138`. So `-00X` is never checked.
  - The shorthand reader needs three or more digits: `-(\d{3,})` at `src/runs/planCoverage.ts:123`. `-00X` doesn't match, so the loop at `:143-161` skips it and nothing is reported.
  - In `checkCoverage`, `ids` ends up holding only `REQ-DEMO-001` (`:366`). `missing-requirements` doesn't fire because `ids.length` is 1 (`:367`), and no other check sees the dropped text.
  - Existing tests cover a malformed *full* id, `REQ-DEMO-00X` (`test/runs/planCoverageParity.test.ts:66`, `:219`). No test covers malformed *shorthand*. The parity test is outside the brief's file list; I read it because `planCoverage.ts:10` names it as the parity contract.
- **causal_chain:**
  1. In `requirements: REQ-DEMO-001, -00X`, only `REQ-DEMO-001` is a `REQ-` word. It is valid, so the malformed check at `:136-138` passes.
  2. The id reader at `:123` reads `REQ-DEMO-001`. At `, -00X` the shorthand branch fails on the `X`, so nothing is added and no error is thrown.
  3. The unit now covers only `REQ-DEMO-001`. If the intended id is out of scope or covered by another unit, no finding is raised. `ADVISORY_CODES` doesn't matter here, so `status` is `pass` (`:412-413`) and the L4 check passes on the remaining id.
- **severity basis:** if the intended id is in scope and no other unit covers it, `missing-coverage` still fires (`:395`). So the false pass only hides a typo whose target is out of scope or covered elsewhere. That limits the damage, hence Minor.
- **smallest_fix:** in `references()` of both copies, after the `TOKEN_SCAN` loop, scan for shorthand words with `/(?:^|(?<=,\s))-\d[^\s,;|.)\]:(]*/gm` and throw `Malformed requirement reference: <token>` for any word that doesn't match `` new RegExp(`^-\\d{3,}(?:[–-](?:REQ-${AREA}-)?\\d{3,})?$`) ``.
  - Requiring a digit right after the `-` keeps prose like `-foo` readable.
  - The existing "negative measurement" fixture (`planCoverageParity.test.ts:80`, `budget -200ms`) is still fine because it isn't preceded by `, `.
  - A line-start `-200ms` is already read as shorthand by `ID_SCAN` (`:123`), so this adds no new false refusals there.
- **proving test:** add `fx("malformed shorthand", plan.replace("- **requirements**: REQ-DEMO-002.", "- **requirements**: REQ-DEMO-002, -00X."))` to `FIXTURES` (`test/runs/planCoverageParity.test.ts:52-112`), and the matching case to `test/authoring/specPlanCoverage.test.ts`. That file holds the source fixtures the parity test mirrors; I didn't read it because it was outside scope. Assert `invalid-reference` and `status: "fail"`, and see the case fail before the fix.
- **parity_note:** same behaviour in the script. `content/skills/st-verify/scripts/spec-plan-coverage.mjs:31`, `:38` and `:59-60` match the engine line for line, and `planCoverage.ts:9-11` says a change to one is made in both.
- **residual (not part of the finding):** a bare `REQ-DEMO-001, 002` with no dash is also dropped silently by the same mechanism (`:123`). The fix above doesn't cover it.

---

### F19: cycle detection is exponential on a diamond- or Fibonacci-shaped dependency graph (`src/runs/planCoverage.ts:402`)

- **decision:** ACCEPT
- **severity:** Warning
- **confidence:** high (`direct`) for how the code walks the graph. Medium (`inferred`) for how large real plans get. I did not reproduce the reviewer's 10-second, 35-unit timing.
- **applicability:** current
- **evidence:**
  - `visit(id, trail)` at `src/runs/planCoverage.ts:398-401` keeps no visited set and copies the trail on every edge (`[...trail, id]`, `:400`). It is started from every unit at `:402`, so the number of calls equals the number of paths through the graph.
  - Nothing caps the number of units: `graph` is filled once per unit at `:363-392`. The `max-units` field in the run contract budget is never compared against the plan (`src/runs/runContract.ts:418-425`; the plan check calls `checkCoverage` at `src/runs/planCheck.ts:223` with no limit).
  - The only cycle tests use two units (`test/runs/planCoverageParity.test.ts:151-157`, `test/runs/planCheck.test.ts:256-268`). No test or comment states a size limit.
- **causal_chain:**
  1. In a plan where unit *k* depends on *k−1* and *k−2*, a walk from unit *n* follows every path down to the base. That is about fib(*n*) calls, each copying a trail of up to *n* entries.
  2. `:402` repeats this from every unit, so the total is roughly the sum of fib(*k*). There are no cycles, so no early return cuts it short.
  3. At about 35 units that is around 10⁷ calls (the reviewer's ~10 s). A plan whose last unit depends on all the others is worse, around 2^(*n*−2) paths. `stamity plan check`, the unattended readiness gate (REQ-FLOW-091, `docs/specs/everyday-flows.md:3515-3530`), then stalls with nobody watching.
- **realistic size:** the spec cites unit ids from u2 to u19 for plan 021 file 1 (`docs/specs/everyday-flows.md:3517`, `:3543`), so a single plan file runs to about 20 units (`inferred`). Pure chains stay linear. The blow-up needs dense "depends on the previous few" edges, which plans do write but not on every unit. So this is a reachable hang rather than a common one.
- **smallest_fix:** in both copies, add `const acyclic = new Set()` and change `visit` to `if (acyclic.has(id)) return; … const before = findings.length; for (…) visit(…); if (findings.length === before) acyclic.add(id);`.
  - Why this keeps the output identical: a unit that added no finding has no cycle reachable from it. Visiting it again under any trail would also add nothing.
  - Effect: acyclic plans become roughly linear in units plus edges, with the order and count of findings unchanged. The parity test's expectation of two `dependency-cycle` findings (`:156`) still holds.
  - Not covered: a graph where many units lead *into* a cycle is still exponential, because those units are never marked. Fully bounding that needs a three-colour depth-first search that reports each back edge once. That changes `:156` from two cycle findings to one, which is a gating test edit and needs an inline reason under the testing rule.
- **proving test:** add a case to `test/runs/planCoverageParity.test.ts` that generates 60 units, each with `depends_on: u(k-1), u(k-2)`, runs both copies under a short per-test timeout (for example 2000 ms), and asserts `status: "pass"`, no `dependency-cycle`, and port equals copy. fib(60) never finishes, so the failure before the fix is unambiguous rather than flaky.
- **parity_note:** same behaviour in the script. `content/skills/st-verify/scripts/spec-plan-coverage.mjs:263-267` is the same algorithm, so the skill's standalone script hangs the same way.

---

### F14: `Date.parse` accepts impossible dates such as `2026-02-30` (`src/runs/runContract.ts:412`)

- **decision:** ACCEPT
- **severity:** Minor
- **confidence:** medium.
  - The code path is `direct`: the format check, then `Date.parse`, then the value is kept.
  - That Node's `Date.parse` turns `2026-02-30` into a March timestamp instead of rejecting it is `unverified` here, since running commands was out of scope. It rests on the reviewer's report. The repo backs it indirectly: it already has a separate real-calendar-day check whose comment rules out "the 30th of February" (`src/runs/disposition.ts:107-121`), and tests refuse `2026-02-30` there (`test/runs/inboxStore.test.ts:235`, `:238`; `test/runs/disposition.test.ts:319`).
- **applicability:** current
- **evidence:**
  - The `STOP_BY` pattern (`src/runs/runContract.ts:94`) only checks the shape, two digits for month and day. `2026-02-30` passes it.
  - `!Number.isNaN(Date.parse(stopBy))` (`:412`) is the only further check, and the original string is stored as-is (`:413`).
  - The contract does promise calendar validity: the refusal message says "must be an ISO 8601 day" (`:415`). REQ-FLOW-098 only says "a budget (stop-by, max units)" (`docs/specs/everyday-flows.md:3676-3681`) and sets no date rule.
  - The only stop-by test uses `tomorrow-ish`, which fails the format check, so `Date.parse` is never exercised (`test/runs/runContract.test.ts:181-190`).
  - Nothing reads `budget.stopBy` yet. The only matches in `src/` are inside `runContract.ts`, so the impact is a stored bad value for a future consumer, not a live misbehaviour. That's why this is Minor.
- **causal_chain:**
  1. `stop-by: "2026-02-30"` matches `STOP_BY` (`:94`).
  2. `Date.parse` rolls it over to a March timestamp instead of returning `NaN` (unverified, see confidence), so the `:412` condition is true.
  3. `budget.stopBy` is stored as `"2026-02-30"` (`:413`), the contract parses as ok (`:137-153`), and `plan check --contract` raises no `contract` blocker (`src/runs/planCheck.ts:501`). The file breaks its own "ISO 8601 day" message.
- **smallest_fix:** import `isIsoDate` from `./disposition.ts` and add `&& isIsoDate(stopBy.slice(0, 10))` to the condition at `:412`. `disposition.ts` has no imports, so this can't create an import cycle.
- **proving test:** in `test/runs/runContract.test.ts`, next to `:181`, run `it.each(["2026-02-30", "2026-02-30T06:00:00Z", "2026-04-31"])` through `FULL.replace('stop-by: "2026-10-16T06:00:00Z"', `stop-by: "${value}"`)` and assert exactly one problem containing `` `budget.stop-by` ``. It should fail before the fix.
- **parity_note:** not applicable. The skill has no copy of this code.

---

### Breaking-change candidates

None. All three fixes only tighten input checks. No exported signature, type, event, export, persisted schema or command-line flag changes. Plans or contracts that are malformed today will now be refused, which is the intent (`inferred` from the three fixes above). Confidence high.

### Unknowns / unanswerable

1. **Does Node's `Date.parse("2026-02-30")` return a number?** I probed only the repo (the `isIsoDate` comment and its tests); I ran nothing, per scope. One run of `node -e 'console.log(Date.parse("2026-02-30"))'` settles it. The fix is correct either way, since it adds a real-day check that doesn't depend on `Date.parse`. Confidence medium, `unverified`.
2. **The reviewer's 10-second, 35-unit timing:** not reproduced, since running commands was out of scope. The exponential path count is `direct` from `:398-402`; the wall-clock figure is the reviewer's. Confidence medium, `unverified`.
3. **Exact unit counts in real plans:** `docs/plans/` was outside scope. The figure of about 20 units per file comes from the unit ids cited in the spec. Confidence medium, `inferred`.

### Sources consulted

- `src/runs/planCoverage.ts`
- `content/skills/st-verify/scripts/spec-plan-coverage.mjs`
- `src/runs/runContract.ts`
- `src/runs/planCheck.ts` (grep only)
- `src/runs/disposition.ts:100-121`
- `test/runs/planCoverageParity.test.ts` (read because the source names it as the parity contract)
- `test/runs/runContract.test.ts:175-199`
- `test/runs/planCheck.test.ts` (grep only)
- `docs/specs/everyday-flows.md:3515-3544`, `:3672-3683`
- Brief: `brief-R5.txt`

The brief lists `test/runs/planCoverage.test.ts`; that file doesn't exist. The coverage tests are in `test/runs/planCoverageParity.test.ts` and `test/authoring/specPlanCoverage.test.ts`.