# Package 10 reviewed candidate handoff

Reviewed candidate: [draft PR #34](https://github.com/zomarit/stamity/pull/34).
Runtime/package implementation `713c057e113c0447ef0c2a2980d9cfc7ccea1379` is followed
by the three-file Windows test-scheduling mitigation described below. Version 1.7.0
is prepared and unpublished; released `v1.6.0` remains at
`99c1094953346ef19a8aaab3ee0bd7d292c36ba6`.

`candidate-binding.json` preserves earlier committed bindings and identifies the
scheduling candidate's 1,076 inputs by digest
`2dd850b73c4a2e03a4511d95394749633e4b9749faf4c8dcdfdfd01e1a01ec2c`.
This source record precedes its final platform run. The PR description records the
final tested commit and completed CI/rehearsal links; the PR's required checks show
that head's status. Earlier green runs and the subsequent red run remain distinct;
this document does not predict an unrun check.

| Item | Implemented outcome | Evidence and remaining boundary |
|---|---|---|
| 10A native clients/hooks | Current discovery and invocation schemas; stop/deny/error translation; Cursor seconds/failClosed; Copilot CLI/cloud hooks; Codex command/trust disclosure | `.github/client-contracts.md`, `review-u1-u2.md`, complete gates and four-client lifecycle fixtures. Authenticated native-client/trust observation remains open. |
| 10A three client proposals/context | Useful license/compatibility metadata and eight Codex companions; retain compatible Claude commands; remove duplicate context | `integration.md`, `verification.md`: charter 97/150; client ceilings 97/240/240/1063. No upward ratchet. |
| 10A native memory | Second-client trigger fired; retain repository-versioned cross-client learnings with dated rationale | `.github/client-contracts.md`; native personal memory does not replace repository knowledge. |
| 10B three authoring proposals | Structural reverse coverage plus independent semantic review; author checklist; existing dated plans/run records/git archive | `u2-evidence.json`, independent review and structural fixtures. Seeded semantic model behavior remains unmeasured. |
| 10B onboarding | Every timer exit retains mandatory gates; explicit JavaScript typecheck detection repaired; fresh-repository recovery fixture | `u2-evidence.json`: actual agent-run CLI/gates and elapsed steps. New behavioral case remains unmeasured; no real-beginner timing claim. |
| 10C pack signing | Author API/helper reuse the existing payload; verify before atomic safe write; manifest case/symlink alias defects fixed | `u3-signing-distribution.md`, `review-u3.md`: real cryptographic round trip and original exploit rechecks. External identity/trust services are substituted; authenticated proof belongs to 12B. |
| 10C release egress | Twenty official artifact-storage accounts across all relevant jobs; existing identity/digest/human boundaries retained | `.github/release-egress.md`, `ci-verification.md`: actual non-publishing rehearsal passes. Skipped publication does not prove the credential-bearing path, owned by 12B. |
| 10D eval instrument | Stateless official API transport; exact input/model/effort admission; completed response/refusal preservation; bounded infrastructure retries; all five calibration fixtures before scores | `review-u4.md`, runner tests. Run 12 is BLOCKED before calls for unavailable API credential. Native diagnostics admit extra developer inputs; no live admission, calibration or score. |
| 10D six behavior repairs | Retained transcripts independently classified; repaired injection wording, closure routing, credential fragments, security categories, reviewer evidence basis and benign-skip wording | `u2-evidence.json`, `review-u1-u2.md`; source and Briefs synchronized. Affected three-sample behavior remains unmeasured. |
| 10D bootstrap/declarations | Shared import-inert TypeScript helper; supported declaration compiler; public types and size accounting; internal migration literal omitted | `verification.md`: external strict TS (`skipLibCheck:false`), JavaScript and packed CLI pass. Actual packed scanner runs and rejects the old leak and invalid scanner output. |
| 10D dependencies | Dated primary-source recheck retains exact unmet Docusaurus-v4/image-size triggers | `SECURITY.md`; no supported fix/migration found; applicable site gates pass. |
| 10E integration/accessibility | APM, customization, upstream and CLI contracts retained; generated surfaces reconciled; shared reference-heading defect repaired | `integration.md`, `verification.md`, `browser-review.md` preserve completed runtime/site proof. `windows-scheduling-review.md` covers the subsequent CI mitigation; current PR checks identify final-head proof. Full human walks remain open. |

## Completed proof

Latest local verification exercised both scheduling projects on actual Darwin:
**195 files, 7,671 passing tests**, two retained skips and unchanged coverage floors.
Lint, typecheck and Knip also pass. `windows-scheduling-review.md` records the exact
commands and input binding; this is local scheduling proof, not Windows OS proof.

The following platform receipts exercised `713c057`. Runtime/build/generator/packed
and site inputs remain unchanged by the scheduling repair, preserving their corrected
proof. Final-head platform outcomes are linked from PR #34.

- Runtime implementation local gates: 194 test files, **7,667 passing tests**, two existing opt-in skips,
  unchanged coverage floors; lint, typecheck, build, leak, Knip, size, generators,
  dogfood and the external packed consumer all pass.
- [Required CI 34537631703](https://github.com/zomarit/stamity/actions/runs/34537631703):
  Linux floor 22.22.2, Linux LTS 24, Windows 24, all three actual APM legs and
  `all-ci-checks` pass. [PR checks 34537631663](https://github.com/zomarit/stamity/actions/runs/34537631663)
  and [docs 34537631620](https://github.com/zomarit/stamity/actions/runs/34537631620) pass.
- [Release rehearsal 34537639076](https://github.com/zomarit/stamity/actions/runs/34537639076):
  gates/pack, canonical APM and dry-run summary pass; publish is skipped. The tarball
  SHA-256 `2f86a82c29aefc170dc3c787147b39f08246f0fe4d911353c37cccce0a3c3408`
  matches the independent local packed witness; the rehearsal includes an SBOM.
- Browser: **46 scenarios, 44 scans with zero violations**, covering 11 routes,
  two widths and both themes. Actual table keyboard, resize/font and no-JavaScript
  probes pass. All 54 render inputs and 134 site files remain unchanged after the
  CI repair. Human journeys and visual comparison without a baseline are unmeasured.

The initial actual CI/rehearsal failures are retained. They exposed a declaration
literal leak and a macOS smoke-wrapper false positive: the copied scanner did not
execute, although the wrapper accepted exit 0. `verification.md` explicitly corrects
that earlier packed-scan claim and preserves its original receipts. Corrected proof
actually scans 219 files/18 rules and rejects the old declaration shape and silent,
failed or empty zero-exit scanners. The Windows fixture repair preserves all 196
inputs, physical root equality and the 20-second limit; fixture Git process launches fell
from 479 to 246. No gate policy or coverage threshold was weakened.

The evidence-only `f7d3f95` head then failed [CI 34538915096](https://github.com/zomarit/stamity/actions/runs/34538915096):
eight Windows fixture timeouts, despite unchanged executable inputs. Two upstream
cases hit 30 seconds and six MCP ownership cases hit 20 seconds. A concurrent pack
case took 109 seconds versus 4.5 seconds in the earlier pass. Identical runner/tool
versions and faster cases before/after support a localized shared-resource stall;
logs do not establish whether CPU, filesystem or scanning caused it. The eval-runner
fixture executed after this interval and is excluded as a concurrent cause.

The mitigation isolates exactly those three heavy suites in a later single-worker
Windows group. Other tests retain default parallelism; non-Windows scheduling,
existing assertions, limits, skips and coverage floors are unchanged. The new
regression resolves actual Vitest projects and verifies all 195 files exactly once.
`windows-scheduling-review.md` records independent proof; an actual final-head
Windows pass, linked from the PR, is required before handback. No unchanged retry
or timeout extension is used to convert the failed run into green evidence.

`history-preservation.json` confirms 91 original v4/rubric/run-10/run-11 files are
unchanged. SET-v5 has 78 cases × three samples; all 69 inherited Expected blocks
remain unchanged. The selected whole profile remains `codex-astra`: Astra scenarios,
Sol judge, both high effort, rubric-v5. No fallback, pooling, lucky resampling or
historical regrading occurred.

## Not done

- Live input-isolation/provider identity and effort admission, all five calibration
  fixtures, affected-case results and the fresh full 234-sample release evaluation.
  `evals/runs/2026-09-10-run-12/RESULTS.md` records `OPENAI_API_KEY-unavailable`,
  BLOCKED before calls, empty calibration and every case at 0/3. Its original
  candidate is retained; all 196 recorded input hashes also match the repaired
  candidate. This preservation does not convert an unavailable run into a score.
- Current human QA is unsigned in `qa.md`. Authenticated native-client trust,
  complete keyboard and screen-reader journeys remain unperformed. The existing
  protected publication approval remains human-controlled. Prior 1.6.0 QA and
  its eval-reuse exception do not transfer.
- Existing enterprise engine/bot/network/mirror/notification/monitor identifiers
  remain owner-dependent. Private enforcement read returned HTTP 403 and registry
  authentication/settings read HTTP 401; no configuration was inferred. Authenticated
  signing and final publish-path proof retain their 12B owner.

The user authorizes 1.7.0 after all applicable gates pass. No merge, tag or release
occurred while the fresh-eval and current human prerequisites remain open. Packages
11–12, comparative measurement, final audit and repository/fixture cleanup have not
started. Package 11 receives the reviewed implementation and preserved evidence;
it must revalidate admission before final conformance and owns new findings and due
advisory dispositions. This handoff does not reassign the six implemented repairs.
