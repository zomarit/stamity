# Package 10 reviewed candidate handoff

The implementation and deterministic repairs are reviewed at
`bc7b9f9bcb7fd5a5dd625ed8ee1a9dab0867a5ba` in
[PR #34](https://github.com/zomarit/stamity/pull/34). Version 1.7.0 is prepared and
unpublished. Run 13 reached a valid C3 calibration mismatch and stopped before
scenario scoring. Full fresh behavioral validation and current human QA remain
**Not done**; the candidate is not cleared for release.

The [session evaluation handoff](../2026-09-11_package-10-session-evals/handoff.md)
records the exact terminal result, the separate C4 dispatch error, current proof
and disclosure limits. The authorized session-native route needs no API credential.
Run 12 retains its original API-route blocker and is not substituted for run 13.

`candidate-binding.json` preserves the initial implementation binding at
`4e649f8a703021a3c0e4e057c258942b2330220f`, the repaired implementation at
`713c057e113c0447ef0c2a2980d9cfc7ccea1379` and the 1,076-input scheduling digest
`2dd850b73c4a2e03a4511d95394749633e4b9749faf4c8dcdfdfd01e1a01ec2c`.
The scheduling candidate `184bc4835fa04718589a26f36447480818b5edf6` subsequently
passed actual platform checks and a non-publishing rehearsal. These identities and
receipts remain distinct from the later session-native protocol and validator
candidate. Released `v1.6.0` remains at
`99c1094953346ef19a8aaab3ee0bd7d292c36ba6`; this handoff performs no release action.

| Implemented area | Retained implementation and evidence | Remaining proof boundary |
|---|---|---|
| 10A native clients/hooks | Current discovery/invocation schemas; stop/deny/error translation; Cursor seconds/failClosed; Copilot CLI/cloud hooks; Codex command/trust disclosure. `.github/client-contracts.md`, `review-u1-u2.md` and four-client lifecycle fixtures retain the reviewed contracts. | Authenticated native-client discovery/trust UI and actual deny/allow observation remain H1 in `qa.md`. Process projections do not perform that observation. |
| 10A context and memory | License/compatibility metadata, eight Codex companions and compatible Claude commands; duplicated context removed. `integration.md` and `verification.md` retain charter 97/150 and client ceilings 97/240/240/1063. Repository-versioned learnings retain the dated cross-client rationale. | Native personal memory does not replace repository knowledge. No context ceiling or evidence requirement was raised. |
| 10B authoring | Structural reverse coverage, an independent semantic-review requirement, author checklist and existing dated plans/run records. `u2-evidence.json` and structural fixtures retain the implemented behavior. | A structural pass does not prove a model performs semantic review. `plan-semantic-ambiguity-survives-structural-pass` and related cases remain at 0/3 admitted samples. |
| 10B onboarding | Timer exits retain mandatory gates; JavaScript typecheck detection repaired; fresh-repository recovery fixture executes init/check, drift/recovery and declared gates. | The deterministic fixture proves recovery and command execution. `onboard-exhausted-budget-keeps-required-gates` has no admitted model samples; no exhausted-timer or real-beginner timing claim is supplied. |
| 10C signing and distribution | Author API/helper reuse the existing payload and verify before atomic write; manifest case/symlink alias defects fixed. `u3-signing-distribution.md` and `review-u3.md` retain real cryptographic fixture round trips and original exploit rechecks. Twenty official artifact-storage accounts and existing release identity/digest/human boundaries remain. | Invalid service responses are rejected after a service call; local unsafe inputs refuse before it. Authenticated remote signing and the credential-bearing publication path remain unproved. Non-publishing rehearsal does not establish them. |
| 10D eval instrument | The optional stateless runner remains available. The committed `stamity-session-native-v1` route records accepted ambient instructions, exact fresh model/effort requests, native inspection and same-response reader adjudication. Public parser assertions, native helper tests and independent validator checks pass. | Run 13 is terminally blocked by C3's valid calibration mismatch. C4 was created with 210 UTF-8 rubric bytes omitted by the driver and completed unbound/ungraded. The applied 0003 bookkeeping transition now records it invalid and nonretryable; the original input error remains preserved. No retry may resume this stopped run. |
| 10D six behavior repairs | Retained transcripts were independently classified; injection wording, closure routing, credential fragments, security categories, reviewer evidence basis and benign-skip wording were repaired. `u2-evidence.json` and `review-u1-u2.md` retain source/Brief synchronization. | These six implementations remain completed source work. Their affected three-sample behavior and the full fresh set remain unmeasured; the handoff does not reassign their implementation. |
| 10D bootstrap, declarations and dependencies | Import-inert TypeScript helper, supported declaration compiler, public types and size accounting; the internal migration literal is omitted. External strict TS/JS and direct installed CLI init/check pass. The corrected packed scanner rejects the old declaration leak and silent/invalid scanners. `SECURITY.md` retains dated dependency-trigger decisions. | The cited smoke executes installed `dist/cli.js`; it does not demonstrate launching both installed CLI aliases. Applicable dependency/site gates pass without inventing an unmet upstream fix. |
| 10E integration and accessibility | APM, customization, upstream and CLI contracts remain; generated surfaces reconciled; reference-heading defect repaired. `integration.md`, `verification.md` and `browser-review.md` retain runtime/site proof. | Automated browser probes do not replace the complete human screen-reader/keyboard journeys H2/H3. Current human QA remains unsigned. |

## Completed proof and retained history

On `bc7b9f9`, `npm run lint`, `npm run typecheck` and
`npm run test -- --coverage` exited 0: **195 files, 7,770 passing tests**, two existing
skips. Coverage remains statements 96.37%, branches 89.66%, functions 98.68% and
lines 97.25%, with every unchanged configured floor passing. The public parser
suite passed 140 tests, the independently reviewed native helper passed 49 tests,
and the independent validator checks passed 92 cases. These are deterministic
checks; they do not supply the missing behavioral samples. The later bookkeeping
mechanism passed 54 helper tests and 27 independent synthetic checks before its
single successful application, separately from the original grading-helper proof.

- [CI 34584132810](https://github.com/zomarit/stamity/actions/runs/34584132810)
  passed Windows, Linux floor/LTS, APM and required aggregation on evidence head
  `0ae0949f573f2a7413d1718d07e7d3325b7a9ba7`, with all 197 measured inputs unchanged.
  [Docs 34584132731](https://github.com/zomarit/stamity/actions/runs/34584132731)
  and [PR checks 34584238020](https://github.com/zomarit/stamity/actions/runs/34584238020)
  passed on that head. The earlier `bc7b9f9` platform proof remains in the session
  handoff. Later CI 34588320202 on `c4571693` failed one Windows golden timeout;
  the [scheduling follow-up](../2026-09-11_package-10-session-evals/windows-golden-scheduling.md)
  awaits fresh full gates and actual Windows acceptance.
- [Rehearsal 34541257716](https://github.com/zomarit/stamity/actions/runs/34541257716)
  on `184bc483` passed gates/pack, canonical APM and summary; publication was
  skipped. Independent artifact verification retained the tarball SHA-256
  `2f86a82c29aefc170dc3c787147b39f08246f0fe4d911353c37cccce0a3c3408`
  and a 67,940-byte CycloneDX 1.5 SBOM with 77 components. This is retained
  rehearsal evidence on its original commit, not a new rehearsal or authenticated
  publication proof. The changed scheduling configuration affects the workflow's
  test gate; current scheduling gates and actual subsequent platform CI acceptance
  are separate proof tracked in the scheduling follow-up above.
- Original `713c057` runtime proof remains in `verification.md` and
  `ci-verification.md`: 194 files/7,667 passing tests, two existing skips, corrected
  external strict TypeScript/JavaScript consumer, installed direct CLI init/check,
  and an actual packed scan of 219 files against 18 rules. Original CI
  34537631703 and rehearsal 34537639076 keep their original identities.
- Browser evidence retains **46 scenarios and 44 zero-violation scans**, covering
  11 routes, two widths and both themes. Its exact 54 render inputs and 134 site
  files are unchanged by the scheduling, session protocol and validator changes.
  Automated keyboard, resize/font and no-JavaScript probes passed. Complete human
  journeys and visual comparison without a baseline remain unperformed.

The original declaration-leak and smoke-wrapper false-green failures remain in
`verification.md`; the corrected scanner actually executed and rejected the old
shape and invalid scanner outputs. No earlier receipt is overwritten by a later
pass. The subsequent `f7d3f95` Windows timeout failure in CI 34538915096 also remains
in `windows-scheduling-review.md`. Its diagnosis supports reducing overlap among
three heavy suites without claiming an unproved CPU/filesystem/scanning cause.
The bounded mitigation retains assertions, limits, skips, floors and non-Windows
scheduling; actual Windows acceptance subsequently passed on `184bc483`,
`bc7b9f9` and `0ae0949`. Later `c4571693` failed one 20-second fresh-directory
golden in the ordinary parallel group. The new follow-up adds that fourth
real-disk fixture to the existing serialized Windows group; current acceptance
remains pending. The dated three-suite review and its earlier passes are preserved.

`history-preservation.json` retains the 91 original v4/rubric/run-10/run-11 files.
Run 12 retains its original before-calls `OPENAI_API_KEY-unavailable` result. Run 13
uses the disclosed session-native baseline; it does not retrospectively admit those
older runs. SET-v5 still has 78 cases, three required samples per case, 447 binding
and 57 advisory criteria and 21 floors. The whole `codex-astra` profile remains
Astra scenarios/Sol judges, both high effort, with rubric-v5. Cases, labels,
thresholds, calibration comparison and aggregation remain unchanged.

C4's bookkeeping gap is closed by the applied
[0003 supplement](../2026-09-11_package-10-session-evals/bookkeeping-0003.json):
state revision 11 records its first attempt invalid, ungraded and nonretryable.
The first command invocation refused before mutation because its capture files
entered the frozen evidence roster. Those records were preserved byte-for-byte;
with the capture destination corrected, the second invocation made the first and
only successful transition. No model call was retried. All 13 original export
files remain the unchanged revision-10 snapshot, and C3's terminal block remains.

## Not done and handoff boundary

- **Current scheduling verification:** fresh full gates and actual Windows
  acceptance of the four-suite follow-up remain pending after the `c4571693` failure.
- **Fresh full behavioral validation:** run 13 stopped at `calibration-C3-mismatch`.
  C1/C2 matched every label after reviewed adjudication of their original responses;
  C3 mismatched B1 despite matching the case FAIL verdict and advisory labels.
  Zero of 234 scenario/grade pairs were admitted, so every case remains at 0/3
  and no aggregate release score exists. No reroll or labels/threshold change may
  convert this terminal result into a passing continuation.
- **Current human QA and publication approval:** H1/H2/H3 in `qa.md` are unchecked.
  Every H row must be walked and passing; every failing M row needs a linked
  follow-up. Protected `npm-publish` approval remains human-controlled. Prior
  1.6.0 QA and its historical eval-reuse exception do not transfer.
- **Authenticated external proof:** real signing-service identity and the
  credential-bearing publication path remain outside the deterministic fixtures.
  Existing protected approval, tag and owner controls are retained; no unobserved
  registry setting or successful publication is inferred.

Package 11 receives the implemented 10A–E map and these exact proof gaps. No
Package 11/12 execution, comparative measurement, final audit or cleanup started
through this handoff. Version 1.7.0 remains prepared only; the conditional release
authorization does not waive calibration, full behavioral validation, current
human QA or protected publication approval.
