# Independent final workflow-report verification

Candidate: `0f7b0e9a457c6c78c96eb3cb9c24c3802d85718b`, prepared version 1.6.0.

Verdict: **approve** the three-file reporting correction; every requested local release gate passed in the isolated detached checkout. Root product files and concurrent public records were not changed. No commits were made.

- `npm run lint && npm run typecheck && npm run test`: exit 0; 187 files, **7,458 tests passed, two existing skips**.
- `npm test -- --coverage`: exit 0; same 7,458 passed/two skipped; all configured per-file floors met. Aggregate statements 96.38%, branches 89.65%, functions 98.68%, lines 97.27%.
- Build, leak (928 committed files, zero hits), Knip, all five CI generator checks plus clean git diff, managed CLI drift check and the real packed-artifact smoke passed. The smoke packs/installs the actual candidate, checks five content classes and three packs, scans packed bytes and exercises init/check.
- Independent regression control: the new no-push/no-PR reporting assertion and the concrete manual diff assertion both fail against the previous workflow, at their intended assertions. Restored candidate passes all **65 focused workflow tests**. See `report-red.log`, `report-green.log` and `report-red-green.json`.
- Parsed YAML control comparison proves every non-shell workflow field is unchanged. Exactly three reporting shell bodies changed; direct review finds no changed permission, condition, credential handling, refusal or platform mutation. The first ad-hoc probe used a wrong expected label after already confirming object equality; the retained control script uses the actual unchanged label and passes.

`REVIEW.md` records the review and QA source pointers. New functional proof: `test/upstream/workflowRecovery.test.ts:99` (truthful issue), `:125` (exact first-parent workflow diff), `:138` (executes inspection and proves no remote update branch), `:146` (actual-PR merge and approval guidance), and `test/ci/upstreamWorkflow.test.ts:556` (manual instruction contract).

Environment: macOS arm64, Node 22.22.3, npm 10.9.8; dependency installation used the committed lockfile with lifecycle scripts disabled. Actual Linux floor/LTS and Windows CI remain separately required. This leak scan covers committed 0f7b0e9, including bdc7965's public evidence; later record corrections require their final scan.

There is no change between da7d8a7 and 0f7b0e9 under packaged source, corpus, scripts, docs, website or package metadata. The forthcoming final guide reconciliation and current-document browser verification are separate evidence bound to their own documentation commit. This report does not claim to have scanned future document bytes.

Human QA, final GitHub CI, platform approvals, publication and published-artifact/provenance checks remain the release coordinator's work. The approved run-10 eval reuse and its failed floors/limitations remain unchanged; no eval was rerun here. Actual public/private lifecycle evidence is not replaced by these local platform substitutes.
