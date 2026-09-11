# Final verification follow-up

The first final gate tested the `cae3fcdb9f76429144294d0f0bdebd541cd8b831`
implementation plus the then-frozen 16-file run14 export and three readiness
records: 1,144 inputs. `npm run test -- --coverage` exited 1 with 7,818 passing
tests, one failure and two existing skips. No current coverage acceptance was
established by that command. Lint, typecheck, leak, Knip and diff checks passed;
the earlier 7,819-test/coverage evidence keeps its original candidate binding.
The [handoff](handoff.md) identifies that earlier evidence separately.

The failure was `test/worktree/engine.test.ts`'s different-name concurrent setup:
beta's `git worktree add` exited 128. The test runner did not print the structured
`EngineError.why` field containing Git stderr. Cleanup then reported `ENOTEMPTY`
while removing alpha. The original raw failure and residual fixture evidence are
retained. Git 128's primary cause remains unexplained.

A bounded diagnostic using the unchanged engine ran six natural concurrent pairs,
three pairs synchronized at the Git-add boundary, and one serial control. All ten
pairs completed successfully. This did not reproduce or explain the original
failure and does not erase it or constitute a passing full gate.

Independent review established a separate test lifecycle and diagnostic weakness:
`Promise.all` can reject while its sibling still uses the fixture, allowing test
cleanup to race that work; the reported error omits fields needed to diagnose the
primary failure. The test now launches both original setup operations concurrently
and awaits `Promise.allSettled`. It requires both named outcomes to be fulfilled,
with full `EngineError` code/message/why/next in the failure context, then retains
both complete-status assertions and the exact alpha/beta farm assertion.

This repair changes no runtime code, name-lock contract, timeout, skip, retry,
coverage floor or concurrency requirement. It is not a demonstrated fix for the
primary Git failure. A later full gate must execute against the reviewed repaired
inputs and preserve its own receipt, result and exact containing commit binding.
Actual later Windows/Linux/APM/docs/PR checks likewise require their own candidate
identity and results; none is inferred from the earlier pass or diagnostic pairs.

Focused verification ran `npm run test -- test/worktree/engine.test.ts -t "the name lock"`: four real-Git name-lock tests passed, including same-name
contention, held-name independence and different-name success. The 67 other tests
were omitted by that explicit filter; no skip was added. Scoped Oxlint and project
typecheck passed. ESLint's current configuration does not select this test file;
its ignored-file warning is not represented as source validation. These focused
results do not establish a final coverage pass or the original Git failure's cause.

Not done at this checkpoint: fresh final gate acceptance after the reviewed test
repair, plus the separate native task-transfer control, complete fresh behavioral
evaluation and unsigned human QA/sign-off recorded in the current handoff.
