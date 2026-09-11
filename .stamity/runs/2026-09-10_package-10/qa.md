# Package 10 candidate QA (unsigned)

Version 1.7.0 is prepared and unpublished. The reviewed evaluation candidate is
`bc7b9f9bcb7fd5a5dd625ed8ee1a9dab0867a5ba` in
[PR #34](https://github.com/zomarit/stamity/pull/34). Run 13 stopped on a valid
calibration mismatch before any scenario scoring. Fresh full behavioral validation
and current human QA remain **Not done**; this record supplies no release approval.

[The session handoff](../2026-09-11_package-10-session-evals/handoff.md) records
current commands, outcomes and platform identities. On that candidate,
`npm run lint`, `npm run typecheck` and `npm run test -- --coverage` passed:
195 files, 7,770 passing tests, two existing skips and unchanged coverage floors.
[CI 34584132810](https://github.com/zomarit/stamity/actions/runs/34584132810),
including Windows, both Linux legs and APM, and docs/PR checks passed on evidence
head `0ae0949f573f2a7413d1718d07e7d3325b7a9ba7`, with all 197 measured inputs
unchanged. Later [CI 34588320202](https://github.com/zomarit/stamity/actions/runs/34588320202)
on `c4571693` failed one Windows fresh-directory golden at its unchanged 20-second
limit. The [four-suite scheduling follow-up](../2026-09-11_package-10-session-evals/windows-golden-scheduling.md)
requires fresh full gates and actual Windows acceptance.

`candidate-binding.json`, `verification.md`, `ci-verification.md` and
`windows-scheduling-review.md` retain the earlier implementation, repaired
`713c057` and scheduling `184bc483` evidence. Those observations keep their
original identities. The current reconciliation narrows claims to the assertions
below; it does not rewrite historical receipts or turn deterministic fixtures into
model behavior. Human sign-off and the protected `npm-publish` approval remain
separate requirements.

## Remaining human observations

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| H1 | Review current client hook activation | In an isolated initialized consumer, use the installed client's normal hook trust/approval screen; review the generated registrations; attempt the documented denied action and a permitted action. | Native discovery and the approval UI match the documented supported surface; denial and allowance are observable. Unsupported native timeout/identity controls remain disclosed. | H | 5 | [ ] Native authenticated client/trust session unperformed; process fixtures cover translated configurations and outcomes. |
| H2 | Read changed documentation with a screen reader | Open the final locally built getting-started, customization and packs-and-trust pages; navigate headings and links; read a capability table's headers and cells. | Meaningful headings/links and correctly associated table cells; no new focus trap. | M | 4 | [ ] Human screen-reader journey unperformed. `browser-review.md` retains 46 automated scenarios and 44 zero-violation scans, with 54 unchanged render inputs; those scans do not perform this journey. |
| H3 | Navigate changed documentation by keyboard | Open the final site at 375px and 1440px in each theme; Tab through navigation and changed-page links; read a wide table using arrow keys; continue between getting started and customization. | Visible focus, usable reading order, reachable controls and readable overflow without a pointer. | M | 6 | [ ] Human complete keyboard journey unperformed. `browser-review.md` retains automated keyboard/resize probes and its exact render-input binding; those probes do not perform this complete journey. |

## Functional evidence appendix

Each source assertion below is paired with the completed current coverage command
and CI result above, plus the named original evidence where relevant. Only the
stated deterministic scope is auto-proven. A3's full measurement, A5's timer-expiry
behavior and A6's semantic-review behavior remain unproved.

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| A2 | A global hook stop overrides allow | Run a hook returning global stop plus nested allow and conflicting reason in Cursor, Copilot and Codex projections. | All three deny with the global stop reason; declared native limitations stay explicit. | H | 3 | `test/hooks/portableRunner.test.ts:47` selects all three clients; assertions at `:58`, `:61` and `:62` verify the envelope, denial and reason. Current coverage passes; `review-u1-u2.md` preserves the original 26-test receipt. Native trust UI remains H1. |
| A8 | Release rehearsal retains identity boundaries | Inspect the actual non-publishing workflow jobs and downloaded artifact handoff for `184bc483`. | Gates and APM pass; publication is skipped; only the protected publishing job receives publishing permissions. | H | 3 | `test/ci/workflow.test.ts:944`, `:945`, `:949`, `:953`, `:1231` and `:1287` assert permissions and publishing/rehearsal conditions. [Rehearsal 34541257716](https://github.com/zomarit/stamity/actions/runs/34541257716) passed gates/APM/summary and skipped publication. Its tarball SHA-256 is `2f86a82c29aefc170dc3c787147b39f08246f0fe4d911353c37cccce0a3c3408`; SBOM: 67,940 bytes, CycloneDX 1.5, 77 components. This is retained `184bc483` proof, not a new rehearsal or authenticated publication. The changed scheduling configuration affects the workflow's test gate; current scheduling gates and actual subsequent platform CI acceptance are separate proof tracked in A9. |
| A3 | Invalid eval evidence cannot become scores | Exercise changed inputs/model/effort, unaccepted context, invalid traces and completed multipart/refusal output; compare every calibration label before scoring. | Invalid identity/input evidence refuses; permitted completed scenario output is retained without a favorable reroll; all five fixtures must match before scoring. | H | 4 | Stateless assertions: `test/evals/manualRunner.test.ts:300`, `:322`, `:323`, `:355`, `:356`, `:382`, `:384`, `:459`, `:460` and `:474`. Current public parser suite: 140 passing tests; native grading helper at measurement: 49 passing tests; independent validator checks: 92 passing. The authorized `stamity-session-native-v1` route accepts recorded ambient instructions, requests fresh Astra/high scenarios and Sol/high judges, and uses an empty wrapper without an API credential prerequisite. Run 13 admitted C1/C2 through an explicit same-response adjudication, then stopped on C3's valid label mismatch; C4's created dispatch is now recorded invalid, ungraded and nonretryable by the [applied bookkeeping supplement](../2026-09-11_package-10-session-evals/bookkeeping-0003.json). That follow-up mechanism passed 54 helper tests and 27 independent synthetic checks; the original 49-test grading-helper proof remains separate. Zero scenarios were scored. See the session handoff for the terminal behavioral gap and native visibility limits. |
| A4 | Client setup respects tested ownership boundaries | Initialize, sync, check and clean the four-client fixtures with authored settings, hooks and skill companions. | Seeded files, user hooks, collision bytes, outside-block content and user-replaced output survive their tested operations. Explicitly consented clean removes the disclosed `.stamity` state directory, including user extras. | H | 4 | `test/emit/crossClientGoldens.test.ts:916`, `:1094`, `:1095`; `test/emit/skillsProjection.test.ts:145`, `:223`; `test/cli/commands/sync.test.ts:262`, `:264`; `test/cli/commands/clean.test.ts:251`, `:263`, `:287`, `:288`. Clean's intentional state deletion is asserted at `:255`, `:256`, `:257`, `:261`. Current coverage passes. The old 67-unchanged-row observation remains historical; session preflight recorded 0 created/1 updated/66 unchanged/0 skipped, then drift-clean. |
| A1 | Signing cannot replace authored sources | Attempt an unsafe alias, symlink ancestor, changed pack bytes, malformed bundle and wrong returned identity; sign a valid detached destination. | Local integrity/path failures refuse before the signing call. Invalid returned bundles are rejected without replacing accepted output or authored inputs. Valid detached fixture output verifies and installs/updates. | H | 5 | `test/pack/sign.test.ts:98`, `:99` cover pre-call integrity refusal; `:108`, `:109`, `:114`, `:115` cover invalid returned bundles and preserved output; `:128`, `:129`, `:217`, `:218` cover unsafe destinations; `:90`, `:193`, `:195` cover valid signing/trust/update. Current coverage and the original 24-test/exploit receipt in `review-u3.md` pass. Authenticated remote signing-service proof remains unperformed. |
| A9 | Windows scheduling retains every test and gate | Resolve actual Vitest project membership and inspect the candidate's Windows result. | Every file runs once; only the four observed heavy suites serialize. Assertions, timeouts, skips and coverage floors stay unchanged. | M | 3 | `test/ci/testScheduling.test.ts:33`, `:34`, `:44`, `:45`, `:46`, `:47`, `:48`, `:49`, `:50`, `:52`, `:53`, `:54`, `:55`, `:58`, `:65` assert the complete disjoint roster, scheduling and unchanged controls. Actual Windows passes on `184bc483`, `bc7b9f9` and `0ae0949` remain historical. CI 34588320202 on `c4571693` failed one ordinary-group golden timeout. The [new scheduling record](../2026-09-11_package-10-session-evals/windows-golden-scheduling.md) tracks its addition to the serialized group and pending current acceptance. `windows-scheduling-review.md` retains the original three-suite intervention. |
| A5 | Onboarding recovery executes declared gates | Run the fresh-repository recovery fixture: initialize/check, introduce drift, sync, confirm recovery and execute the declared commands. | Drift is detected and repaired; lint/typecheck/tests execute and failures remain visible. | M | 4 | `test/authoring/onboardingRecovery.e2e.test.ts:29`, `:36`, `:37`, `:38`, `:40`, `:48`, `:49` assert recovery, an intentional red test and gate execution. `u2-evidence.json#freshRepository` retains the exact focused command, drift exit 1 and repaired gates exit 0; current coverage reran it. Exhausted-timer model behavior in `onboard-exhausted-budget-keeps-required-gates` has no admitted samples and remains Not done. |
| A6 | Structural coverage retains semantic review as a separate requirement | Run complete and defective existing-format spec/plan fixtures, including missing coverage, duplicate/dangling references and ambiguous prose. | Structural defects fail with locators; complete structure passes while semantic review remains required. | M | 4 | `test/authoring/specPlanCoverage.test.ts:28`, `:31`, `:36`, `:39`, `:45`, `:53`, `:54`, `:61`, `:65`, `:70` assert the structural results and retained requirement. Current coverage passes. The aggregate historical 430-test count does not prove a model performed semantic review; `plan-semantic-ambiguity-survives-structural-pass` and related behavior have no admitted samples. |
| A7 | Packed JavaScript and TypeScript consumers work | Install the candidate tarball outside the checkout; import the public API and reachable types; execute the installed `dist/cli.js` with `init -y` and `check`; scan the packed tree. | JavaScript imports resolve; strict TypeScript compiles and rejects an invalid type; the installed direct CLI initializes/checks; a real nonempty packed scan runs. | M | 4 | `scripts/tarball-smoke.mjs:137`, `:144`, `:147`, `:152`, `:160`, `:165` identify the executed external consumer and direct CLI checks; `test/ci/tarballStaging.test.ts:109`, `:125`, `:138` reject the old declaration leak and invalid/silent scanners and admit a real scan. Current packed CI passes; `verification.md` retains the corrected 219-file/18-rule scan. These receipts do not establish launching both installed `st` and `stamity` aliases. |

## Sign-off

- [ ] Every H row walked and passing.
- [ ] Every failing M row has a filed follow-up, linked.
- [ ] H1, H2 and H3 observations recorded with the person, date and candidate.
- L failures are recorded, not blocking.
- Rollback: revert the affected changes through a reviewed PR and return an affected
  consumer to its last verified version. Preserve historical tags and artifacts;
  an already published correction requires a new governed release.
- Shippable: **NO — current scheduling gates/platform acceptance remain pending;
  A3 full behavioral validation is blocked by C3's calibration
  mismatch; A5/A6 behavior is unmeasured; H1–H3 and current human sign-off remain unperformed.**

The QA skill requires human sign-off on every run, including a run whose rows all
auto-prove. No conditional release authorization, prior 1.6.0 QA or automated
result performs that checkpoint or the protected npm deployment approval.
