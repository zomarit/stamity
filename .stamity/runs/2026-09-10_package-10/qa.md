# Package 10 candidate QA (draft)

Prepared version: 1.7.0, unpublished. `candidate-binding.json` identifies the runtime
implementation at `713c057` and the subsequent scheduling candidate's 1,076-input
digest. `verification.md` and `ci-verification.md` preserve earlier proof;
`windows-scheduling-review.md` records the Windows mitigation. The final tested
commit and latest platform results are identified in [PR #34](https://github.com/zomarit/stamity/pull/34).
This table is not a human sign-off. The user's conditional release authorization does not
perform the final QA or the protected npm deployment approval.

## Remaining human observations

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| H1 | Review current client hook activation | In an isolated initialized consumer, use the installed client's normal hook trust/approval screen; review the generated registrations; attempt the documented denied action and a permitted action. | Native discovery and the approval UI match the documented supported surface; denial and allowance are observable. Unsupported native timeout/identity controls remain disclosed. | H | 5 | [ ] Native authenticated client/trust session unperformed; process fixtures cover translated configurations and outcomes. |
| H2 | Read changed documentation with a screen reader | Open the final locally built getting-started, customization and packs-and-trust pages; navigate headings and links; read a capability table's headers and cells. | Meaningful headings/links and correctly associated table cells; no new focus trap. | M | 4 | [ ] Human screen-reader journey unperformed; automated browser evidence passes46 scenarios/44 scans in `browser-review.md`. |
| H3 | Navigate changed documentation by keyboard | Open the final site at 375px and 1440px in each theme; Tab through navigation and changed-page links; read a wide table using arrow keys; continue between getting started and customization. | Visible focus, usable reading order, reachable controls and readable overflow without a pointer. | M | 6 | [ ] Human complete keyboard journey unperformed; automated browser evidence passes46 scenarios/44 scans in `browser-review.md`. |

## Functional evidence appendix (bound to the repaired candidate)

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| A1 | Signing cannot replace authored sources | Attempt a manifest/content alias, symlink ancestor, changed pack bytes, malformed bundle and wrong identity; sign a valid detached destination. | Invalid inputs refuse without signing or changing source; valid fixture verifies and installs/updates. | H | 5 | Independent `review-u3.md`: 24 tests and original alias repros pass; final local source binding is in `verification.md`. Authenticated Sigstore service proof remains 12B. |
| A2 | A global hook stop overrides allow | Run a hook returning global stop plus nested allow and conflicting reason in Cursor, Copilot and Codex projections. | All three deny with the global stop reason; declared native limitations stay explicit. | H | 3 | Independent `review-u1-u2.md`: 26 runner tests pass; final local source binding is in `verification.md`. |
| A3 | Contaminated eval calls cannot become scores | Inject an extra message, stored prompt, wrong model/effort or an invalid trace; supply completed multipart/refusal scenario output. | Extra context and invalid identity refuse; completed scenario output is retained once and graded without replacement. All five rubric fixtures precede scoring. | H | 4 | Independent `review-u4.md`: 41 runner tests pass; live API isolation/calibration and full evaluation remain blocked/unperformed. |
| A4 | Client setup retains user work | Initialize, sync, check and clean the four-client fixtures with authored settings, hooks and skill companions. | User-owned content survives; native invocation names and supported CLI contracts remain compatible. | H | 4 | `integration.md` and `verification.md`: four-client lifecycle, generated outputs and67 drift-clean dogfood rows pass. |
| A5 | Exhausted onboarding does not bypass required gates | Run the fresh-repository recovery fixture; inspect the timer-expired case and execute the declared commands. | Init/check detects drift; sync repairs it; lint/typecheck/tests run. Missing gates remain Not done regardless of the timer. | M | 4 | `u2-evidence.json` records agent-run timings and actual deterministic gates; model behavior remains unmeasured. |
| A6 | Structural coverage remains separate from semantic clarity | Run complete and defective existing-format spec/plan fixtures, including missing coverage, duplicate/dangling references and ambiguous semantics. | Structural defects fail with usable locators; complete structure passes with semantic review still required. | M | 4 | Independent 430-test U2 recheck includes structural/eval/source tests; seeded live semantic behavior remains unmeasured. |
| A7 | Packed JavaScript and TypeScript consumers work | Install the candidate tarball outside the checkout; import the public API and reachable types; run both supported CLI entries. | Existing JavaScript import resolves; strict TypeScript consumer compiles and rejects invalid types; expected CLI files/behavior appear. | M | 4 | `verification.md` repaired-candidate addendum: external packed strict TS/JS consumer, negative type assertion and CLI init/check pass. The real packed scanner checks 219 files/18 rules; injected old declarations and silent/invalid scanners fail. |
| A8 | Release rehearsal retains identity boundaries | Inspect actual non-publishing candidate workflow jobs and artifact handoff. | Gates and APM route pass with restricted egress; publish is skipped; no publishing identity reaches those jobs. | H | 3 | `ci-verification.md`: rehearsal34537639076 passes gates/pack, canonical APM and dry-run summary on713c057; publication is skipped. This is not authenticated publication proof. |
| A9 | Windows scheduling retains every test and gate | Resolve actual Vitest project membership; inspect the final Windows job identified in PR #34. | Every test file runs once; only the three observed heavy suites serialize. Assertions, timeouts, skips and coverage floors stay unchanged. | M | 3 | `windows-scheduling-review.md` records local group/coverage proof; actual final-head Windows acceptance must be recorded in the PR before handback. |

## Sign-off

- [ ] Highest-risk evidence reviewed against the final candidate.
- [ ] Remaining medium-risk human observations explicitly dispositioned by the maintainer.
- Rollback: revert through a reviewed PR; retain historical tags and artifacts. Restore a consumer
  to its last verified version if needed. A published correction requires a new governed release.
- Shippable: **NO — fresh behavioral evidence and current human approval remain pending.**
  Required platform checks must also pass on the final candidate.

The current QA skill requires human sign-off on every run, including one whose rows all
auto-prove. This record preserves that checkpoint and the separate platform approval.
