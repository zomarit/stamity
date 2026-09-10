---
id: enterprise-downstream-support
intent: feature
stamp: d6096aca357ad51c68a79e4fbb3b64cf929b2362 2026-09-10
reads: [AGENTS.md, .github/release-controls-checklist.md, docs/specs/fork-layer.md, docs/specs/enterprise-upstream-lane.md, docs/specs/apm-canonical-distribution.md, scripts/generate-apm-package.mjs, scripts/generate-plugin-manifests.mjs, scripts/apm-install-smoke.mjs, scripts/upstream.mjs, src/content/catalog.ts, src/content/selection.ts, src/emit/skillsProjection.ts, .github/workflows/upstream-update.yml, .github/workflows/release.yml, .github/workflows/docs-site.yml, docs/enterprise-forks.md]
---

# Enterprise downstream support

## Context

Complete the public and independent-private downstream lifecycle using the existing git
upstream lane, APM package and downstream-owned Renovate distribution. Source edits already
work; the APM reader of the fork layer omits resolved additions/replacements and incorrectly
requires every skill to use a prefixed source directory. Preserve supported CLI commands,
public distribution, upstream history, private destinations and review controls while fixing
those gaps, proving the resulting lifecycle and shipping the canonical release.

This plan is executable under the user's instruction to prepare and implement. External
platform, fixture, distribution and QA prerequisites retain their existing owners and must
be evidenced; they do not block independent implementation. No private customer settings,
credentials, confidential planning source or governance records belong in this public plan.

## Spec delta

- **MODIFIED REQ-APM-003**: the credential-free `apm-route` job runs independently of packing
  and gates publication at the canonical release SHA; postpublication tag verification is
  separate. Correct the historical every-tag and generic-failure claims without rewriting
  old probe/run evidence.
- **ADDED REQ-APM-006–009, REQ-FORK-010–011**: resolved corpus/fork projection, shared skill
  identity, safe companion files, explicit publisher metadata, private destinations and
  independent public/private/APM/packaged-CLI compatibility evidence.
- **MODIFIED REQ-UPSTREAM-001, -013**: require both `version: 1` and `upstream`, configurable
  hourly polling, PAT setup, retained no-config skip and trust split. Mark the original
  bundled-layer deferral fulfilled by 1.5.0 with the fork spec pointer.
- **ADDED REQ-UPSTREAM-016–018**: recover a missing PR only for an unchanged owned branch,
  preserve all existing PR dispositions, bootstrap private copies with history, document
  operational recovery, and retain actual lifecycle/monitoring evidence.

The specs carry observable criteria; each implementation unit below joins those IDs to its
tests and evidence. Historical `status: shipped-with-*` headers identify the original design
release, not completion of these new requirements.

## Units

### U1 — `contracts-docs`

- **requirements**: REQ-APM-003, -006–009; REQ-FORK-010–011; REQ-UPSTREAM-001, -013, -016–018.
- **files**: this plan, the three named specs, `docs/enterprise-forks.md`,
  `docs/customization.md`, `docs/getting-started.md`; additional existing navigation or prose
  pins only when changed content requires them.
- **interfaces**: compatibility matrix below; `package.json.stamity.publisher` contract;
  unchanged upstream config/report schema plus conservative missing-PR recovery.
- **testCriteria**: every promised route has author inputs, runtime limits and a named
  observable proof; public pages carry no confidential identifiers or unsupported claims.
- **edgeCases**: absent access yields the exact missing proof, never an invented live result.
- **depends_on**: none; description of final mechanics reconciles U2/U3/U4 after their edits.
- **verify**: `npx vitest run test/docsPages.test.ts test/ci/docsRoster.test.ts`.

### U2 — `apm-content-identity`

- **requirements**: REQ-APM-006, -007, -009; REQ-FORK-010, -011.
- **files**: `scripts/generate-apm-package.mjs`, `scripts/generate-plugin-manifests.mjs`,
  shared identity helper, focused generator/identity fixtures and tests, the byte-writing
  seam and its regression tests if required for binary APM companions.
- **interfaces**: optional strict `package.json.stamity: { publisher: string }`; absent
  retains `zomarit`; publisher must match normalized `repository.url`'s GitHub owner. Both
  generators use one validator. APM consumes reachable resolved corpus/fork items and
  `replacedClaimantOf(index, item)` for skill directories. Plugin manifests retain their
  existing direct `content/` surface and do not acquire fork projection by implication.
- **testCriteria**: additions/replacements/patches in all four APM classes match independent
  bodies; bare skill additions, bundled replacement names, text/binary APM companion bytes,
  duplicate/unsafe path refusals and default canonical bytes are asserted. Distributable CLI
  fixtures assert source/fork/user precedence and supported text companion emission.
- **edgeCases**: full replacements remove every corpus-origin member of a class; duplicate
  targets with identical bytes still refuse; invalid metadata writes no partial output.
- **depends_on**: U1 contract delta.
- **verify**: focused content/APM/plugin/atomic-write tests, build and external tarball install.

### U3 — `upstream-recovery`

- **requirements**: REQ-UPSTREAM-013, -016–018.
- **files**: `scripts/upstream.mjs`, `.github/workflows/upstream-update.yml`,
  `test/upstream/**`, `test/ci/upstreamWorkflow.test.ts`.
- **interfaces**: existing report and integration-record schema; actual retained remote SHA
  is authoritative for the recovered PR. Same release, target, merge topology, non-record
  tree and semantic record are required. A target advance or human fixup needs manual review.
- **testCriteria**: inject PR creation failure after push, recover one missing PR without a
  rewrite, repeat with unchanged PR metadata; closed/merged/wrong-base/ambiguous/human-modified
  cases preserve state. Failed remote auth never becomes "branch absent". Bundle/report SHA
  mismatch refuses. Workflow-file changes retain unconditional reviewed-push recovery.
- **edgeCases**: auth, shallow/imported/lost history, conflicts and regeneration/gate failures
  retain actionable reports. Hourly polling remains best effort and canonical no-config skips.
- **depends_on**: U1 contract delta.
- **verify**: `npx vitest run test/upstream test/ci/upstreamWorkflow.test.ts`, YAML/run-block
  validation, then actual approved platform fixtures through U5.

### U4 — `publication-boundary`

- **requirements**: REQ-APM-003, -008, -009; REQ-UPSTREAM-017.
- **files**: `.github/workflows/release.yml`, `.github/workflows/docs-site.yml`,
  `test/ci/workflow.test.ts` and directly related release/docs workflow tests.
- **interfaces**: trusted GitHub execution context, canonical repository equality and
  repository privacy checked at publication/deployment job boundaries. Editable package
  metadata never authorizes a public destination. Existing canonical release conditions and
  environment/tag/trusted-publisher controls continue to apply.
- **testCriteria**: private and noncanonical repositories cannot invoke inherited public npm
  or docs publication; canonical rehearsal still packs and verifies without publishing;
  private tags use explicitly documented private git release commands.
- **edgeCases**: a private repository retaining canonical package metadata is excluded; a
  real publish dispatch still requires the correct tag/version/main ancestry.
- **depends_on**: U1 contract delta; independent of U2/U3.
- **verify**: focused workflow tests and canonical release rehearsal.

### U5 — `independent-review-proof`

- **requirements**: REQ-APM-006–009; REQ-FORK-011; REQ-UPSTREAM-016–018.
- **files**: review/evidence records in their approved location; product fixes return to the
  owning implementation unit. Generated artifacts have one integration owner.
- **interfaces**: exact candidate SHA, fixture refs, independent expectations and evidence
  identity; no fixture result is relabeled as a canonical or production result.
- **testCriteria**: independent review closes actionable findings; lint/typecheck/tests,
  coverage, build, leak, knip, package/generator checks and required CI legs including Windows
  pass. Site typecheck/build and applicable accessibility checks pass for changed pages.
  Current/minimum APM clients pass, old client preserves the actual routing witness. The
  complete private lifecycle matrix below has live platform proof.
- **edgeCases**: generated output alone, stubbed GitHub calls, canonical skips and unobserved
  Renovate configurations cannot close live proof. Preserve historical failures and evidence.
- **depends_on**: U2, U3, U4; external fixture/distribution/operations owners below.
- **verify**: `npm run lint && npm run typecheck && npm run test`,
  `npm test -- --coverage`, `npm run build`, `npm run gate`, `npm run knip`, generated-output
  checks, site gates and retained platform runs.

### U6 — `canonical-release-close`

- **requirements**: REQ-APM-003, -008, -009; REQ-UPSTREAM-018.
- **files**: canonical release metadata/changelog/generated currency files and release run
  evidence; adjacent private continuity records stay in their existing private location.
- **interfaces**: current release checklist, full `evals/SET-v4.md` run under a named actual
  model profile with calibration, human QA and release controls, PR/merge/tag/npm provenance.
- **testCriteria**: reviewed candidate passes required fresh full evals and QA; PR merges;
  next appropriate semver tag identifies released commit; published npm bytes/CLI, provenance,
  canonical APM SHA/tag/content and deployed docs are verified; record currency is current.
- **edgeCases**: no prior release's eval exception is inherited; fixture releases, prepared
  PRs or prepared canonical releases do not complete publication proof.
- **depends_on**: U5, maintainer QA/publish controls.
- **verify**: release rehearsal, required CI, observed publish workflow and registry/platform
  evidence tied to the final commit/tag and artifact integrity.

## Contract census and ownership

| Contract/class | Producer | Consumers | Change/owner |
| --- | --- | --- | --- |
| `ContentOrigin`, `ContentIndex.items/byKey`, resolved body; symbols | `src/content/catalog.ts` | selection, planner, skills projection, validate, docs, APM generator and tests | Existing shape held; APM winner filtering reconciled by U2 |
| `replacedClaimantOf`; symbol | catalog | skillsProjection, APM generator | Existing facade held; U2 adds APM reader |
| `stamity.publisher`; config key | package.json/shared identity helper | APM/plugin generators, generated author/repository URLs, docs/tests | Add; U2 owns producer and generator consumers, U1 documents |
| `.apm/**`, `apm.yml`; persisted names | APM generator | APM client, install smoke, CI, release, downstream Renovate consumers | Paths retained; corrected contents/names by U2; integration regenerates once |
| Companion bytes; writer signature | atomic write helper | generators, source/manifest/lock writers and tests | Additive binary support if needed; U2 owns full census, text callers unchanged |
| Upstream JSON config/report/integration record; wire/persisted fields | upstream script | workflow prepare/publish, guide, tests | Schema held; semantics corrected by U3 |
| `stamity-upstream/<tag>`/all PR states; identity | upstream workflow | GitHub refs/PRs, retained reports, fixture observers | Revalue retry ownership; U3 |
| `STAMITY_UPSTREAM_TOKEN`; secret reference | approved downstream configuration | publish job only | PAT route retained; U3, no stored App installation token |
| Canonical repository/private context; platform fields | GitHub Actions | release/docs publication job conditions and tests | Add guards; U4 |

Searches covered the repository's scripts, source, workflows, tests, specs, guide and prior
run/inbox references. U2/U3/U4 own their producer and test changes; U1 reconciles prose after
implementation. No shared report field is renamed or removed. A newly discovered shared
contract is reported before edits expand beyond its owner.

## Compatibility and live-proof matrix

| Subject | Required proof |
| --- | --- |
| Canonical APM | Default byte parity; 0.29.1 minimum/0.30.0 current; 0.29.0 misclassification witness; exact candidate SHA and final public tag installation |
| Public downstream APM | Independent expected content for source edits and fork operations in every class, identities/support files after actual install |
| Private downstream APM | Approved independent import with `private=true`/`fork=false`, retained ancestry, customized private ref, successful authenticated consumer installation |
| Private update/consumer cycle | Controlled ordinary-file upstream release → one real PR → actual required checks → reviewed merge preserving ancestry/customization → second private APM release → existing Renovate's observed consumer PR → installed-content assertion |
| Recovery | Missing-PR fault/retry, all-state idempotency, human/closed branch cases, policy warning, workflow refusal/reviewed push; focused destructive failures and actual credential/PR/install runs |
| CLI | External tarball installation proves direct source edits, fork/user precedence, supported client emission and command discovery |
| Monitoring | Approved failure notification and independent stale/disabled polling signal reach the chosen owner/destination |
| Canonical release | Fresh eval/QA/gates; merged PR/tag; npm integrity/provenance/installed CLI; public APM; deployed docs; private record currency |

## Research record and baseline

Intake `d6096aca357ad51c68a79e4fbb3b64cf929b2362`, latest local tag `v1.5.0`, package 1.5.0,
revalidated 2026-09-10. The catalog/selection/CLI fork behavior already shipped; APM's
corpus-only filter and prefixed skill source-directory check are the remaining defects.
Both generators pin the publisher today, so a repository-owner change breaks regeneration.
The release already isolates APM in its own job; its earlier spec incorrectly placed it
before packing. The old inbox's live-PR failure remains historical until new evidence closes
its exact PR and separate landing-policy proof gaps.

Official dependency/platform sources checked 2026-09-10:

- [GitHub repository duplication](https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository)
  and [fork visibility](https://docs.github.com/en/pull-requests/reference/forks): independent
  private copies retain history without joining the public fork network.
- [Workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
  and [triggering workflows](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow):
  polling belongs to the downstream; schedules are best effort; repository-token PR events
  require approval under current behavior.
- [APM private packages](https://microsoft.github.io/apm/consumer/private-and-org-packages/)
  and [authentication](https://microsoft.github.io/apm/consumer/authentication/): per-org
  `GITHUB_APM_PAT_<ORG>`, then `GITHUB_APM_PAT`, then repository/general GitHub token fallbacks;
  token access and organization authorization remain deployment prerequisites.
- [APM releases](https://github.com/microsoft/apm/releases) and
  [the classification fix](https://github.com/microsoft/apm/pull/2776): current client 0.30.0,
  tested minimum 0.29.1, historical regression witness 0.29.0. The fix merge is
  `7baf88292f4ec11152e1642d61ee3dcd86d36b66`; actual fixture and release runs name their refs.
- [Renovate APM manager](https://docs.renovatebot.com/modules/manager/apm/) and
  [private package access](https://docs.renovatebot.com/getting-started/private-packages/):
  current APM manifest support exists, but that fact neither selects nor proves a particular
  downstream's deployed distribution engine. Reuse its existing configuration and observe it.

## Risks

- **Critical**: unavailable authorized fixtures, private credentials, actual Renovate runs or
  notification destinations leave their named live proofs incomplete. Owners supply access;
  code/docs/tests proceed independently and evidence remains labeled.
- **Critical**: missing mandatory QA, full release eval or platform publication approval
  blocks its corresponding merge/tag/publish step. Prepare the complete reviewable candidate.
- **Warning**: clean textual integration can change source semantics; downstream behavior
  gates and reviewed merge remain the mitigation.
- **Warning**: local POSIX tests miss Windows and per-file coverage; require coverage plus
  actual CI platform legs. Regenerate dogfood/APM/docs outputs after final source changes.
- **Warning**: postrelease private record drift; use the release checklist's currency step.

## Open questions and external prerequisites

| Owner | Required input/evidence | Unavailable proof |
| --- | --- | --- |
| Downstream platform/network owner | Approved GitHub/npm/Actions access or operational mirrors | Selected fetch/build/update deployment |
| GitHub organization owner | Authorized fixture/consumer locations, credentials, Actions/rules permissions and cleanup scope | Private visibility/auth/PR/checks/recovery/cleanup |
| Distribution owner | Existing APM/Renovate configuration and observable consumer run | Actual Renovate release-to-consumer cycle |
| Operations owner | Existing notification destination and external monitor | Delivered failure and stale/disabled polling signals |
| Stamity maintainer | Current QA/eval/release approvals and publication controls | Corresponding merge/tag/npm/docs/provenance close |

No unresolved implementation-choice question blocks U2–U4. Each external prerequisite is
closed only by authorization or actual evidence, and every remaining gap is reported as
`Not done:`. Plan lint: testable criteria, resolved dependencies, nonempty edge cases and
spec requirement IDs checked across U1–U6.
