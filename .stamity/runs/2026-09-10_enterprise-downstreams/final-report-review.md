# Independent review of prepared-update reporting

Candidate: `0f7b0e9a457c6c78c96eb3cb9c24c3802d85718b`; parent: `bdc7965eac67d3d14869c927f1810916df400f2b`.

Verdict: **approve**. No actionable findings in this three-file correction.

- `.github/workflows/upstream-update.yml:689`: shared reporting now describes a prepared update. It no longer presupposes a pull request exists on the workflow-refusal issue or run-summary paths. The merge-ancestry explanation remains intact.
- `.github/workflows/upstream-update.yml:701`: the report identifies the configured credential without asserting it performed a push. At line 710, repository-token approval guidance is conditional on the lane opening a pull request; the automatic workflow-file refusal still holds for either credential.
- `.github/workflows/upstream-update.yml:826`: the reviewed-push issue explicitly states that no branch was pushed and no PR opened, and directs the reviewer to the prepared artifact and its gate results.
- `.github/workflows/upstream-update.yml:837`: the first copyable block fetches the bundle and reads the exact prepared merge's workflow diff against its first parent. The push/create commands appear in a separate block after explicit review of that diff and the gate results. This does not execute or grant permission for those actions.
- `test/upstream/workflowRecovery.test.ts:99`: the new behavioral test runs the actual report/issue shell with real git/jq and a declared GitHub boundary substitute. It verifies the absent-PR wording and separated command blocks, then executes the emitted read-only bundle-inspection block and proves it reveals the workflow change while no remote update branch exists.
- `test/upstream/workflowRecovery.test.ts:146`: both credential modes still produce actual PR bodies carrying merge-commit guidance. Repository-token approval instructions appear only for that mode.
- `test/ci/upstreamWorkflow.test.ts:556`: the existing issue-contract test is strengthened to require the concrete diff command and fetch → diff → push ordering. No existing gating assertion was weakened or excluded.

`control-shape.mjs` compares parsed workflow objects after removing exactly the three changed shell bodies. Every other field is identical, including permissions, environment bindings, job/step conditions, action pins and artifact handling. Direct diff review confirms the shell-body changes are reporting and emitted inspection text. The initial ad-hoc control probe used a mistaken expected step label; its object-equality assertion already passed. The retained script uses the actual unchanged label and passes.

Independent red/green: with the parent's workflow and the current tests, the report test fails at `workflowRecovery.test.ts:118` for the absent no-push/no-PR sentence, and the issue-contract test fails at `upstreamWorkflow.test.ts:575` for the missing diff command. Restoring the candidate workflow passes all 65 selected workflow tests. These are separate from the fresh full gate and coverage run.

QA pointers for the new row: `test/upstream/workflowRecovery.test.ts:99` (truthful issue), `:125` (exact first-parent diff), `:138` (executes the emitted inspection without a remote push), `:146` (preserved actual-PR approval guidance), plus `test/ci/upstreamWorkflow.test.ts:556` (manual instruction contract). Actual platform issue/reviewed-push evidence remains the lifecycle agent's independent run, not this local substitute.
