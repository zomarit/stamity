# Independent timestamp recovery review

Reviewed commit: `da7d8a76bad16eec38cf734a5bfeb01d0c419d38`.

Verdict: approve this four-file correction. No actionable findings.

- `.github/workflows/upstream-update.yml:958`: recovery still requires the same release, release object, current target, record semantics and ordered merge parents. The prepared integration remains a comparison object; the retained remote SHA supplies the recovered PR body and publication evidence.
- `.github/workflows/upstream-update.yml:983`: changed manifests must both be regular non-executable Git blobs. Nothing from the fetched tree is executed during comparison.
- `.github/workflows/upstream-update.yml:986`: the changed manifest needs the recognized envelope and valid UTC millisecond timestamps. `jq` reserialization rejects duplicate fields, alternate formatting and malformed JSON; exactly one canonical top-level `updatedAt` line is masked. This is an equality exception for one generated field, not a promise that this trusted shell duplicates every TypeScript manifest validator.
- `.github/workflows/upstream-update.yml:1006`: every remaining manifest byte, including creation time, selection, ownership ledger and unknown metadata, stays exact. The following tree comparison retains every other path. Workflow-file refusal and the last remote-head race check remain in place.
- `src/manifest/manifest.ts:716`, `src/manifest/manifest.ts:827`: the real writer emits stable two-space JSON, sorts nested objects and updates `updatedAt` on a copy each successful write. The workflow exception matches that demonstrated write behavior.
- `test/upstream/workflowRecovery.test.ts:178`: the positive regression creates two fresh real integrations using the actual manifest read/write seam, retaining the first pushed branch. It checks the first remote SHA is retained and the second prepared SHA is absent from the recovered PR body. Git and jq are real; only the GitHub mutation boundary is substituted, with the reason declared at line 25.
- `test/upstream/workflowRecovery.test.ts:221`: negative cases change a non-timestamp field, use an invalid date, malformed/noncanonical JSON, a symlink or a missing manifest. Every case refuses PR writes and retains the remote branch. Existing cases continue to protect human followups, target movement, ambiguous/closed PRs, changed workflow files and invalid records.
- `test/upstream/workflowRecovery.test.ts:29`: the executable shell suite explicitly excludes Windows; its production workflow uses Ubuntu. Required Windows CI still owns the cross-platform package claim.

The st-verify reliability reference was used as review criteria for retry safety, data safety and visible recovery failures. This document does not claim an all-repository reliability-axis run or replace the skill's complete per-axis JSON contract.

The regression was independently run with the parent commit's workflow and current test: it failed at the expected recovery exit-code assertion. The shipping workflow is restored for the focused green run, and both source hashes are retained in `timestamp-red-green.json`. An earlier worktree setup race reached no tests (`MODULE_NOT_FOUND`); those initial infrastructure logs are preserved separately and do not count as the red control.
