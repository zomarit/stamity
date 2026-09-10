# Enterprise downstream release QA

Candidate: `da7d8a76bad16eec38cf734a5bfeb01d0c419d38`, prepared version 1.6.0. This checkpoint is unsigned. Final public lifecycle evidence and remaining release gates must finish before sign-off is requested.

The independent full gate passed 7,455 tests with two existing platform skips. Evidence pointers below bind to that candidate. The browser bundle is [browser-da7d8a7.json](../../evidence/browser-da7d8a7.json); all 12 theme/viewport scans and 20 actual table keyboard probes passed. These automate specific assertions, not a complete human accessibility review.

## Remaining human walk

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | Read and navigate the updated guide using a keyboard | Start the built site; open `/enterprise-forks` at 375px and 1440px in each theme; Tab through navigation, links and a wide table; scroll the table with arrow keys; continue to customization and getting started. | Focus remains visible, reading order is usable, every control is reachable and a wide table can be read without a pointer. | M | 6 | [ ] Human full journey unperformed; automated table-only probes passed. |
| H2 | Read the guide with a screen reader | Start the built site with the available screen reader; open `/enterprise-forks`; navigate its headings, links and first compatibility table; read its headers and cells. | Headings and links are meaningful; table headers remain associated with the native cells; no new focus trap occurs. | M | 4 | [ ] Human screen-reader review unperformed; native Chromium accessibility roles and automated scans passed. |

The tables below are evidence review, not instructions to repeat completed installations. Spot-check the privacy/publication and recovery pointers before signing. A missing enterprise deployment is not auto-proven by the fixtures.

## Auto-proven functional appendix

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Private downstream cannot use inherited public publication | Use an independent private package retaining canonical metadata; create a private fixture tag and dispatch the inherited rehearsal. | Public npm/docs jobs skip; package and consumer remain private. | H | 3 | `test/ci/workflow.test.ts:783` and `:811`, full gate exit 0; actual private tag and dispatch job snapshots retained in the maintainer evidence. |
| A2 | Authentication protects private package contents | Start a fresh consumer with no credentials; install the private ref, then repeat with authorized transient credentials. | Anonymous fetch refuses; authenticated install resolves the exact private commit and expected content. | H | 3 | Actual fresh APM authentication negative and 0.29.1/0.30.0 positive results retained; each positive passes 56 primitive and eight companion assertions. |
| A3 | Recover only an unchanged owned update branch | Cause PR creation to fail after push; prepare the same release again; retry publication; then test a changed manifest, human followup and deliberately closed PR. | Recovery retains the actual branch SHA and creates one missing PR; content edits, human work and closed state are preserved. | H | 5 | `test/upstream/workflowRecovery.test.ts:95`, `:210`, `:221`, `:251`, `:271`; full gate exit 0; independent real-writer red/green result; actual platform recovery is added to the final run record. |
| A4 | Workflow changes require reviewed publication | Integrate a release changing `.github/workflows/`; inspect the retained report and reviewed-push instructions. | Automatic push refuses regardless of credential strength; the report supplies a bounded, conventional manual PR command and retains complete evidence. | H | 3 | `test/upstream/workflowRecovery.test.ts:303`, full gate exit 0; actual controlled reviewed-push evidence is added to the final run record. |
| A5 | All customization classes survive APM installation | Author source edits plus fork additions, replacements and patches in rules, commands, agents and skills; generate and install the public fixture using both supported clients. | Correct winners, names and text/binary companions arrive; unaffected canonical content remains present. | H | 4 | `test/ci/apmDownstream.test.ts:32`, `:60`, `:117`, full gate exit 0; anonymous real public installs at `5f79635763f3f867871726f9d31f8a013be64878`, 56 primitive/eight companion/135 canonical assertions per APM version. |
| A6 | Unsafe identity and companion paths refuse before publication | Use a moved owner without explicit identity, colliding targets, an unsafe companion or conflicting fork definitions; generate. | Nonzero refusal without partial generated output; canonical absence retains the original publisher. | H | 3 | `test/ci/apmDownstream.test.ts:70`, `:80`, `:107`, `:139`, `:190`, full gate exit 0. |
| A7 | Private update reaches the consumer through Renovate | Start at the first valid private release; integrate an ordinary upstream release through a reviewed PR and successful human-approved CI; cut the second valid private release; run the actual scoped native APM manager; review and install its consumer PR. | Upstream ancestry and customization remain intact; real consumer PR updates the manifest/lock; fresh install matches expected bytes; repeat produces no update branch. | H | 6 | Actual private package PR, approved CI, merge/tag and Renovate 44.79.1 runs retained privately. Consumer PR merged; fresh install passed 56 primitive/eight companion assertions; postmerge engine exit 0 with no update branches. |
| A8 | Existing packaged CLI behavior remains supported | Install the external built npm tarball; discover commands; init/sync/check/validate source/fork/user fixtures for all four clients. | Nine advertised commands and documented exit behavior remain; supported customization precedence and text support files are emitted. | M | 4 | `test/cli/surface.e2e.test.ts:89`, `:148`, full gate exit 0; independent canonical/customized external tarball report. No runtime or corpus source changed after the compared tarball candidate. |
| A9 | Landing policy reflects actual repository constraints | Inspect required linear history, disabled merge commits and accessible legacy protection; attempt a merge before required CI completes. | Warning reports the real ancestry constraint; active required checks reject the early merge; the target remains unchanged. | M | 3 | `test/upstream/workflowLandingPolicy.test.ts:64`, `:74`, `:109`, full gate exit 0; actual public policy responses and protected merge HTTP 405 retained. |
| A10 | Changed docs remain readable across themes and widths | Build the site and scan enterprise forks, customization and getting started in light/dark at 375px/1440px; resize and enlarge text. | No automated accessibility violation or page error; native table roles persist and overflow adds keyboard focus. | M | 3 | Current candidate [browser bundle](../../evidence/browser-da7d8a7.json): 12 scans, 20 keyboard probes, resize/text-enlargement and no-JavaScript checks pass. |

## Explicit external limits

- Existing enterprise engine, bot credential and network/mirror policy: unidentified; the controlled real engine and authorized operator session establish fixture compatibility only.
- Existing notification destination and independent stale/disabled-poll monitor: no delivered enterprise signal proved.
- Enforced private required checks: unavailable under the fixture owner's current plan (HTTP 403); successful actual CI is a separate fact.
- Eval: maintainer-approved one-release reuse of run 10. Corpus, complete case Briefs/binding criteria and retained rubric inputs are unchanged. Its failed strict floors remain failed; run 11 is unadmitted, not replacement evidence.

## Sign-off

**Sign-off — enterprise downstream support 1.6.0, 2026-09-10**

- [ ] Every H-risk row is covered by its named passing proof and reviewed.
- [ ] Every failing M row has a filed follow-up; unperformed human rows remain explicit.
- Rollback: revert the merged implementation through a normal reviewed PR; restore any affected consumer to its prior immutable ref. Do not move or delete published tags. A published npm correction requires a new patch release, with the same controls.
- Shippable: **pending human decision**. No approval, manual walkthrough or release is inferred from this artifact.
