# Enterprise downstream support — execution record

Status: implementation and independent review complete through `da7d8a7`; final gates and live public recovery proof are running. Canonical release and human QA remain pending. Dated entries below preserve the earlier failures and pending states.

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
