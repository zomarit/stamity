# Enterprise downstream support — execution record

Status: implementation, independent review, full product gates and controlled public/private lifecycle proof are complete through documentation candidate `caec7fa`. Human QA, final combined-head CI, canonical publication and postpublication verification/currency remain pending. Enterprise deployment and private-plan enforcement limits remain explicit below; dated entries preserve earlier failures and pending states.

## Intake

- Date: 2026-09-10.
- Intake commit: `d6096aca357ad51c68a79e4fbb3b64cf929b2362`; initial working tree clean.
- Published baseline: `v1.5.0`, release commit `7de015ca6a6963d27a4f5c4917c1e808aeb7604a`.
- Work branch: `package-13-enterprise-downstreams`.
- Scope: public and independent private downstream support through the existing APM and upstream lanes; existing CLI distribution remains supported.
- Isolation: separate git worktrees for APM and upstream implementation; one writer per shared contract. Documentation and release guard changes have a separate owner. Review and final gate execution use independent agents.
- Authorization: the maintainer requested implementation, review, PR, merge and release. Mandatory human QA and the platform deployment approval remain pending until a concrete candidate is available.

## Baseline and prerequisite evidence

Read-only GitHub and npm queries confirmed main and the published baseline above. The active main rules require `all-ci-checks`, `all-pr-checks` and linear history. Release-tag mutation restrictions and the `npm-publish` reviewer/tag policies remain active. Repository metadata, the administrator roster and npm maintainer roster were inspected.

The previous Actions PR-creation permission blocker is stale: the repository now permits Actions PR creation. That observation does not close the missing live update PR evidence. Existing dated run records remain unchanged.

Official sources were rechecked on 2026-09-10:

- [GitHub repository duplication](https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository) and [fork visibility](https://docs.github.com/en/pull-requests/reference/forks).
- [Scheduled workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) and [token-triggered workflows](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
- [APM private packages](https://microsoft.github.io/apm/consumer/private-and-org-packages/) and [authentication](https://microsoft.github.io/apm/consumer/authentication/).
- [APM 0.30.0](https://github.com/microsoft/apm/releases/tag/v0.30.0), [0.29.1](https://github.com/microsoft/apm/releases/tag/v0.29.1), and the [routing correction](https://github.com/microsoft/apm/pull/2776). The minimum/current/witness matrix remains 0.29.1/0.30.0/0.29.0.
- [Renovate APM manager](https://docs.renovatebot.com/modules/manager/apm/) and [private package credentials](https://docs.renovatebot.com/getting-started/private-packages/). Current native-manager documentation establishes a supported integration option; it does not establish any particular downstream deployment.

## Outstanding external proof

The maintainer delegated fixture selection. Disposable private package/consumer repositories and controlled public upstream/downstream repositories have been created under an administered owner. The private import was verified as private, outside the fork network, with the intake commit retained; Actions were disabled before importing historical refs. Raw private repository metadata and evidence remain in the approved private evidence location. Fixture cleanup has not occurred.

An approved automation credential, actual downstream APM/Renovate configuration and observable run, enterprise-approved network or mirror route, and notification/overdue-poll monitor remain unidentified. The accessible organization's installation API lists no installed GitHub Apps. Corresponding live claims remain unproven. Local connectivity and automated fixtures are separate evidence.

Private fixture rulesets and branch-protection APIs return HTTP 403 requiring a qualifying GitHub plan. The fixtures remain private; real CI runs can still be observed, but enforcement by private required-check rules remains blocked. The controlled public fixture's rules API is accessible for the separate landing-policy case.

The maintainer selected the committed `codex-astra` release eval profile: Astra scenarios and an independent Sol judge, both at high reasoning effort. The planned full run uses three fresh samples per case and strict all-samples scoring. No prior-release eval exception is inherited.

## Implementation progress

- `6a221c8`: public plan/spec delta and downstream lifecycle documentation.
- `ee06a8f`: resolved APM customization and shared validated publisher identity. The implementation agent reported passing lint/typecheck/knip, 156 focused tests and unchanged canonical APM/plugin output. Its earlier full run recorded a collision regression that was subsequently fixed and rechecked in the focused suite; the final independent full gate remains pending.
- `39d47df`: canonical/public publication guards, with 107 focused workflow/docs tests, lint and typecheck reported passing.
- `35da09c`: bootstrap/release instruction refinements.
- `63d3e86` and `fa4128a`: conservative missing-PR recovery, retained SHA/report evidence, hourly polling and operational recovery; 231 focused tests, lint and typecheck reported passing.
- Independent scoped APM review found no actionable issues. The whole-branch review raised two Warnings: mirrored hidden refs during bootstrap and oversized recovery PR bodies. Both were fixed in `17da583`, with 92 focused tests, lint/typecheck and shell syntax checks reported passing. Final independent re-review remains pending. Automated review qualification was not supplied; reviewer verdicts are advisory, with direct evidence attached to findings.
- Local commits were rebased with DCO signoff before publication. Original implementation IDs remain in the session evidence; the IDs above name the signed integrated branch.

## Verification and close

Release preparation `e0eff2e26d36ea2da6313f7eaebfffac6d578828` selects 1.6.0 for the added downstream contracts. Version carriers and managed artifacts were regenerated, with canonical content unchanged. Independent final verification at that commit passed lint, typecheck and all 186 test files (7,432 passing, two existing skips), plus build, leak gate and site typecheck/build. Coverage and remaining checks are separate evidence, still pending at this entry.

Independent re-review confirmed the bootstrap and bounded recovery-body fixes. It found a remaining plugin-test catalog mismatch in a customized downstream; runtime reproduction and correction are assigned. The verifier also reproduced a required knip failure: the recovery test's external `jq` executable is not declared. Both findings remain open until their fixes and reruns are observed.

The canonical branch was pushed, and a credential-free [release rehearsal](https://github.com/zomarit/stamity/actions/runs/34495421866) was dispatched with `dry_run=true`. Its APM job passed; other jobs were still running at this entry. No tag or publication was requested.

The attempted fresh Codex eval is recorded separately in `evals/runs/2026-09-10-run-11/RESULTS.md`. The harness injected ambient repository context into the supposedly fresh judge. Its calibration output is unadmitted; all 207 scenario samples remain unrun, and there are no new scores. The maintainer questioned the need to rerun unchanged behavioral inputs. A one-release reuse exception has been recommended but is not yet authorized. Run 10's failures and limitations remain unchanged; neither an exception nor a green eval is claimed.

The two open website `image-size` alerts were rechecked against the current GitHub advisories ([ICNS](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr), [JXL/HEIF](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)). Both still list no patched version. They are the existing website build dependency findings already recorded on 2026-09-07, not new package runtime dependencies. The current committed website image inventory contains SVG and PNG assets. The alerts remain open; this observation is not a claim that the vulnerable dependency was fixed.

## Subsequent verification and release decision

The maintainer explicitly selected "Reuse run 10 for this release" on 2026-09-10, retaining its recorded limitations. This is a one-release exception for 1.6.0, not a standing policy change. `eval-reuse-inputs.json` compares the run-10 SHA with candidate `96c4e76`: the `content/` tree is identical (`3adad2f34631d144d56378b3b1815e05b4fac29c`); all 69 complete Briefs and binding-criteria prefixes are byte-identical; the retained rubric-v4 is byte-identical. Of the full case files, 68 are identical; the remaining file only removed a non-scoring advisory. The set document acquired model-profile/protocol documentation, so whole-instrument byte identity is not claimed.

Run 10 remains Claude/legacy-harness/rubric-v4 evidence. Its strict golden rate is 37/41 with the floor conjunction false, guardrail hold is 11/12, benign-twin false refusals are 1/4, and probes are 12/12. Nothing is rescored, relabeled green, or presented as a Codex baseline. The attempted run 11 remains blocked historical evidence.

Commit `96c4e76119e026736fca258b50d9101081adbc93` fixes the plugin-test catalog mismatch and Knip declaration. Independent verification reran Knip/lint/typecheck and the full coverage suite: 7,433 tests pass, two existing skips, and every coverage floor passes. Canonical and customized external npm tarball probes pass; the customized probe covers all four clients, source/fork/user precedence, skill names/support files and the existing nine CLI verbs.

[PR 33](https://github.com/zomarit/stamity/pull/33) is open as a draft. At `96c4e76`, [required CI](https://github.com/zomarit/stamity/actions/runs/34495912110) passed Linux floor/LTS, Windows and all three APM-client legs; [PR policy checks](https://github.com/zomarit/stamity/actions/runs/34495912114) and [site build](https://github.com/zomarit/stamity/actions/runs/34495911609) passed. Deployment was skipped. The earlier credential-free release rehearsal finished successfully with publication skipped.

Actual public git-SHA APM installs at `96c4e76` passed on 0.29.1 and 0.30.0 across the four targets, each resolving that exact commit and recording 155 deployed files. The authenticated-client predecessor 0.29.0 is not needed for this public fetch: its actual install exited zero but classified the package as `agent_plugin` and deployed zero files, satisfying only the narrowly defined routing-failure witness.

The private customized fixture also passed authenticated minimum/current APM installation and independent expected-byte assertions. A fresh anonymous install was refused. Private update and consumer-cycle proof continues separately; no unseen enterprise deployment is claimed.

Browser verification of the built changed pages found low-contrast syntax tokens and a horizontally scrolling table lacking keyboard focus. These are assigned for correction; passing site compilation is not treated as accessibility proof. Initial scan failures and screenshots are retained.

Pending: accessibility fixes/review/rescan and their affected checks; complete live lifecycle evidence; human QA; canonical merge/tag/publication; published npm/APM artifact and provenance checks; deployed documentation; release record currency.

## Final implementation and controlled private cycle

Subsequent entries supersede the pending states above without changing their historical evidence.

- `c2535a79a1188bfbc2aaec9b69a3a755088bd362` fixes syntax contrast, prose-link distinction and keyboard access to overflowing tables. Independent review approved the change. Browser verification covered three changed pages, both themes and 375/1440px widths: 12 scans with zero accessibility violations or page errors, 20 actual Tab/ArrowRight table probes, resize and text-enlargement transitions, native accessibility-tree roles and the no-JavaScript table fallback. A human screen-reader walk remains unperformed; no visual-regression baseline exists.
- `034c6810fdd58b108a1474d9521636cfaa3ee920` fixes the no-config regression test's dependence on the host checkout, includes repository merge settings and legacy branch protection in the landing-policy warning, adds valid conventional titles and configured-committer DCO signoff to lane-created contributions, and documents Renovate prerelease ordering and persistent APM consumer targets. The full gate and coverage each passed 7,448 tests with two existing skips; build, leak and Knip passed.
- `b0c999f` applies the conventional title to the manual reviewed-push command and records the non-main integration-branch CI prerequisites. `da7d8a76bad16eec38cf734a5bfeb01d0c419d38` fixes a live fresh-retry failure: the real sync writer updates the manifest timestamp even when every customization byte is unchanged. Recovery may mask only the top-level `updatedAt` value in two validated, canonical, regular-file manifests. All other bytes, target/release/parent checks and semantic-record checks remain strict. Independent review and 48 focused workflow/recovery tests pass, including actual manifest-writer red/green evidence and tampering/malformed/symlink refusals.

The authorized independent private package and consumer completed the controlled release-to-consumer cycle. The package retained upstream ancestry and source/fork customization after a real update PR, human-approved successful CI and reviewed merge. A second version-consistent private APM release was consumed by a real Renovate 44.79.1 native APM-manager run. Its real consumer PR changed only the APM manifest and lock; an authenticated fresh install from that PR passed 56 primitive assertions and eight text/binary companion assertions before reviewed merge. A subsequent real Renovate run exited zero with no update branches. Raw private refs, platform responses, logs and identities remain exclusively in the approved private evidence location.

Failed fixture evidence is retained: one intermediate private tag had a package-version mismatch and was excluded from the consumer test; its ref was not moved or deleted. Two initial Renovate attempts exposed prerelease-versioning and missing persistent-target prerequisites, now documented. The successful engine was scoped to the authorized fixture; it does not prove the enterprise's unidentified existing Renovate deployment. Operator credentials were transient, and final evidence/cache/install scanning found no credential literals. This does not establish a dedicated enterprise bot credential.

The private owner's plan prevents required-check rule enforcement (HTTP 403). Actual private CI succeeded, but enforced private required checks remain unproven. The controlled public branch independently rejected an administrative merge while required checks were missing. Existing enterprise network/mirror approval and delivered failure/stale-poll monitoring signals remain blocked by unavailable deployment configuration and owner/destination evidence.

`eval-reuse-final-inputs.json` extends the approved run-10 comparison through `da7d8a7`: no corpus, case or retained rubric input changed since the complete prior comparison. The exception and all recorded failed metrics remain unchanged.

## Reviewed candidate gates

Independent verification at `da7d8a7` is complete: [full results](verification.md), [timestamp recovery review](recovery-review.md), [command outcomes](verification-gates.json) and [artifact hashes](verification-artifact-hashes.json). Full gate and coverage each passed 7,455 tests with two existing skips; every per-file floor passed. Build, leak, Knip, generators, dogfood, packed install and site gates passed. The new recovery regression independently failed at its intended assertion under the preceding workflow and passed with the shipping workflow (62 focused tests). Initial harness setup errors are retained and excluded from the red-control result.

Fresh current-candidate browser verification repeated the 12 scans and 20 keyboard table probes successfully; its [bundle](../../evidence/browser-da7d8a7.json) records source SHA, raw evidence and limitations. Raw verification and earlier failed evidence have been retained with the maintainer's release evidence, beyond the original temporary run locations.

Actual canonical [CI](https://github.com/zomarit/stamity/actions/runs/34500371411) passed Linux minimum/LTS, Windows and all three APM matrix legs. [PR checks](https://github.com/zomarit/stamity/actions/runs/34500371651) and [site build](https://github.com/zomarit/stamity/actions/runs/34500371613) passed. The final credential-free [release rehearsal](https://github.com/zomarit/stamity/actions/runs/34500672177) passed with publication skipped. These runs bind to `da7d8a7`; subsequent record-only commits still require their own current required checks.

The distinct customized public APM matrix is complete: [proof](public-apm-proof.md). Real anonymous 0.29.1 and 0.30.0 installs from the public synthetic tag at `5f79635763f3f867871726f9d31f8a013be64878` each resolved the exact commit, passed 56 independent primitive assertions, eight companion-byte assertions and 135 canonical witnesses. Authoring came only from the committed public fixture helper, with all 15 version carriers aligned and no private material copied.

Release controls and currency were rechecked: canonical main retains required contexts and linear history in an active ruleset; the active tag ruleset remains armed; `npm-publish` retains its required reviewer and `v*` tag policy. Metadata, administrator and npm maintainer rosters were inspected. GitHub and npm latest remain 1.5.0, so the prepared additive minor 1.6.0 is still the next appropriate release. The final public-record leak scan covered 928 files with zero hits.

The [QA checkpoint](qa.md) is prepared and unsigned. Final public lifecycle evidence, human QA, merge/tag/publication, actual published artifact/provenance/APM/docs verification and release record currency remain open.

## Final public lifecycle and reporting correction

The actual public lifecycle now passes. Repository-token run [34500980273](https://github.com/zomarit/stamity-p13-public-downstream-20260910/actions/runs/34500980273) completed preparation and pushed the owned update branch, then encountered the deliberately disabled PR-creation permission. Fresh full run [34501404211](https://github.com/zomarit/stamity-p13-public-downstream-20260910/actions/runs/34501404211) recovered [PR 5](https://github.com/zomarit/stamity-p13-public-downstream-20260910/pull/5) without changing retained SHA `dc034184f10831163dfb3e9007dda4ceabae6833`. A further retry preserved actual PR metadata and comments. The maintainer approved [CI](https://github.com/zomarit/stamity-p13-public-downstream-20260910/actions/runs/34501804100) and [PR checks](https://github.com/zomarit/stamity-p13-public-downstream-20260910/actions/runs/34501804114); all required checks passed, including Windows. Independent review preceded merge `26347e53ef459949dd377fc3764f117eacf474f0`, retaining upstream ancestry and customization.

The controlled next release changed only an inert workflow comment. [Run 34502962897](https://github.com/zomarit/stamity-p13-public-downstream-20260910/actions/runs/34502962897) passed full preparation, then correctly refused publication before pushing any update branch and opened [issue 6](https://github.com/zomarit/stamity-p13-public-downstream-20260910/issues/6). The retained bundle and exact first-parent workflow/full diffs were independently reviewed before the operator pushed [PR 7](https://github.com/zomarit/stamity-p13-public-downstream-20260910/pull/7). Required [CI](https://github.com/zomarit/stamity-p13-public-downstream-20260910/actions/runs/34503680726) and [PR checks](https://github.com/zomarit/stamity-p13-public-downstream-20260910/actions/runs/34503680955) passed before merge `4b1e20224850b51b824551058c58f2c35ddd6b47`. The final stable target reports up to date and preserves upstream ancestry/source/fork/APM content.

The actual issue exposed an inaccurate common report sentence that assumed a PR existed. Commit `0f7b0e9` corrected prepared-update wording and printed fetch/diff/review before the separate push/create commands. [Independent review](final-report-review.md), [verification](final-report-verification.md), [gates](final-report-gates.json) and [retained hashes](final-report-artifact-hashes.json) record intended old-workflow red controls, 65 focused passing tests, and fresh full gate/coverage: **7,458 passed, two existing skips, every configured floor met**. Build, leak, Knip, generators, dogfood and actual packed-artifact smoke passed. Parsed workflow comparison proves permissions, conditions, credential handling and refusal controls unchanged. Original issue wording remains historical evidence; no platform proof is attributed to edited historical output.

A separate real landing-warning/new-PR case also passed: [run 34503629304](https://github.com/zomarit/stamity-p13-public-downstream-20260910/actions/runs/34503629304) prepared and created [PR 8](https://github.com/zomarit/stamity-p13-public-downstream-20260910/pull/8) with the actual required-linear-history warning. The temporary rule targeted only its disjoint proof branch and was disabled afterward. PR 8 remains open/unmerged; its branch is outside the CI filters, so this case claims no successful PR CI. Actual required-check enforcement and approved green CI are established separately above.

Retired the old live-PR deferral at `.stamity/runs/2026-09-10_release-1.4.0/ledger.jsonl#2026-09-10_release-1.4.0/build/3`. Real repository-token creation failure and fresh recovery, human-approved required CI and reviewed merge, plus a separate actual landing-warning/new-PR case replace the old stub-only evidence. The originating ledger preserves its original fields and other lines; only a dated retirement field was subsequently added to satisfy the existing accounting gate, as recorded below. Private-plan enforcement and unverified enterprise deployment/monitoring proofs remain separate open items. Only the completed fixture's polling workflow was disabled after evidence capture; CI, required checks, branches, tags and history remain retained.

## Final documentation and QA candidate

Commit `caec7fac5e45d82ad1b766c30affd3696829c690` reconciles onboarding prerequisites and live-proof dispositions. Its 73 focused documentation/workflow tests, lint and typecheck pass. [Final site verification](final-site-verification.md) passed production build/typecheck plus 12 clean accessibility scans, 20 keyboard table probes and 14 scenarios. The [current browser bundle](../../evidence/browser-caec7fa.json) binds to those exact document bytes; [source comparison](final-site-source-binding.json) confirms no runtime, corpus, workflow, website code or distribution-metadata changes since fully gated `0f7b0e9`. Final raw browser hash is `e850c00f4ea0a85e17a79de7c1d6f9118a3a657e03c2c8d991f3370757c26f2b`; screenshots were inspected before final hashing and raw files were copied byte-for-byte into retained maintainer evidence. The preceding browser projection was corrected to match its own finalized raw bundle; its earlier state remains in commit history.

Actual canonical `0f7b0e9` [CI](https://github.com/zomarit/stamity/actions/runs/34504279310), [PR checks](https://github.com/zomarit/stamity/actions/runs/34504279331) and [site build](https://github.com/zomarit/stamity/actions/runs/34504279271) are green. Current combined-head required CI remains mandatory before merge. The credential-free rehearsal already passed; subsequent changes do not alter its release workflow, runtime or packed inputs.

[Eval input equivalence](eval-reuse-doc-candidate-inputs.json) extends the approved run-10 comparison through the final documentation candidate with zero corpus/case/rubric changes. It does not rescore the failed strict floors, admit run 11 or change the standing policy. [Human QA](qa.md) remains unsigned; full human keyboard and screen-reader journeys remain unperformed. Publication approval, actual npm/APM/provenance/docs verification and final release currency follow the checkpoint. The unidentified enterprise deployment/bot/network/monitor and unavailable private-plan enforcement remain explicit Not done items after fixture success.

The complete [public lifecycle report](public-lifecycle-proof.md) and 262 raw evidence files are retained. The curated archive excludes only a redundant checkout; archive SHA256 `7e304c1a0d4797ab8ea351529a5cebcb8e3fe27b473ae80ac3e7c7de0177c2b1` and all member hashes were independently verified before copying into retained maintainer evidence.

The [independent final readiness review](release-readiness-review.md) approved the candidate for human QA, independently revalidated live GitHub results/eval inputs/confidentiality, and found only a stale status line and QA row ordering. Both ancillary findings are corrected. Final public evidence leak scan: 938 files, zero hits; the additional review record will be scanned before commit.

## Required CI retirement accounting correction

The first final combined-head [CI run 34506061049](https://github.com/zomarit/stamity/actions/runs/34506061049), at `64f6c53`, failed the ledger-accounting assertion: the old live-PR inbox row had been removed but its originating deferred row lacked the schema's dated `retired` field. Both Linux legs passed 7,457 tests and failed this one assertion; the Windows run and all original logs are retained. The narrative retirement entry alone did not satisfy the existing gate. No test or gate was weakened.

Commit `23d4b17134accb85dccbb313171e6e9c256c593a` adds only that dated disposition to the original `build/3` row. Its original state, evidence, rationale and every other original field/value are preserved, and every other ledger line is byte-identical. The [preservation proof](retirement-preservation.json) binds the original Git blob `4d5d86012628579f14369467fe7695a5658e6d25` and both file hashes. Earlier statements that the originating ledger was unchanged describe the state before this required additive accounting correction; the underlying historical evidence remains intact. The implementation agent reproduced the intended old-state failure, then passed 30 focused records/leak tests plus lint/typecheck. No product, corpus, workflow or rendered-document inputs changed.

[Independent retirement verification](retirement-verification.md) reproduced the predecessor failure and passed all 30 corrected records/leak tests. [Exact source bindings](retirement-source-binding.json) prove unchanged fully gated product/workflow/corpus inputs and unchanged final site/document inputs. Both complete before/after ledger snapshots and all 16 verifier files are retained with verified hashes. The reviewer's current-record wording finding is corrected above. Root also ran the current combined records suite (18 passed), leak scan (940 files, zero hits) and diff check successfully; final combined-head platform CI still gates merge.
