# Package 10 session evaluation handoff

Run `2026-09-11-run-13` is **BLOCKED at calibration-C3-mismatch**. A valid completed
calibration response disagreed with the retained B1 label, so scoring stopped.
There are no admitted scenario samples or aggregate release score. Version 1.7.0
is prepared and unpublished; fresh full behavioral validation and current human
QA remain Not done.

Reviewed validator candidate:
`bc7b9f9bcb7fd5a5dd625ed8ee1a9dab0867a5ba`.
The prospective protocol is `evals/session-native-v1.md`, SHA-256
`9658738b30ec7f10cdfe625863fb26fcb189ad28b550e4b4e096eb4a633f0a32`.
The validator SHA-256 is
`7e707da2450c0f786ebd9369c4ecee1a66538217d4d47ae7c53b245f0767839f`.
The independently reviewed sanitized
[BLOCKED result](../../../evals/runs/2026-09-11-run-13/RESULTS.md) now exists with
its input, output and limitation artifacts. All 13 exported files passed the
independent binding and disclosure review; the evaluation remains BLOCKED.

## Actual calibration outcome

| Fixture | Observed disposition |
|---|---|
| C1 | Original completed response admitted after reviewed reader adjudication; every retained binding/advisory label matches. Its original invalid citation receipt and events remain preserved. |
| C2 | Original completed response admitted after the same adjudication; every retained binding/advisory label matches. No replacement response was generated. |
| C3 | Valid admitted response, terminal calibration mismatch. Expected binding: `[pass, pass, pass, fail, fail]`; actual: `[fail, pass, pass, fail, fail]`. Expected and actual advisory: `[pass, fail]`. Expected and actual case verdict: `FAIL`. The B1 mismatch stops the run despite matching the overall verdict. |
| C4 | A separate driver copying error omitted 210 UTF-8 bytes from the prepared rubric. The child was created and completed, but the call remains unbound and ungraded. Its original diagnostics are retained; created-invalid-dispatch handling remains an open helper gap. |
| C5 | Not dispatched after the terminal calibration stop. |

The C4 error does not change C3's valid mismatch. No retry, parser reroll,
label-aware exception or favorable replacement can resume this stopped run.
All five fixtures would have had to match before any scenario. The planned full
measurement was 78 cases × three samples, each with its own scenario and judge,
plus five calibration judges; the planned 473-call total is not an executed count.
Zero of the 234 required scenario/grade pairs were admitted, and all cases remain
at 0/3. There is no evidence for the pending timer-expiry or semantic-review model
behaviors, or for a fresh full release pass.

## Admission and preserved history

The authorized `stamity-session-native-v1` baseline uses this session without an
API credential prerequisite. It requests fresh Astra/high scenarios and Sol/high
judges, with no inherited conversation and an empty wrapper. The operator accepted
recorded ambient client/repository instructions. That acceptance neither erased
those instructions nor proved them harmless. C1–C3 native inspections established
the requested judge model/effort, route and absence of tool use. Independent
provider attestation and unexposed decoding controls remain unavailable.

C1/C2 were dispatched at
`22c292c85bd15717d8574a4537abc4212bd01609` under the original prepared configuration.
The native reader correction retained exact parent/child ciphertext correspondence,
prepared input hashes and a separately identified driver invocation attestation.
Native plaintext verification remains unavailable for encrypted task records.
The later committed validator adjudication parsed the same original responses
once, retaining original invalid classifications, receipts and journal events
alongside separate admission decisions. Updating the validation candidate did not
relabel the original dispatches as executions at the new commit.

Run 12 remains the original API-route result blocked before calls; earlier runs
and completed historical scores are unchanged. The selected whole profile, cases,
rubric, calibration labels, thresholds, three-sample requirement, 447 binding and
57 advisory criteria, 21 floors, calibration comparison and aggregation were held.
No historical score was transferred and no failure was rerolled.

## Completed deterministic and platform proof

On `bc7b9f9`, `npm run lint`, `npm run typecheck` and
`npm run test -- --coverage` exited 0: 195 files, 7,770 passing tests and two existing
skips. Coverage: statements 96.37%, branches 89.66%, functions 98.68%, lines 97.25%;
all unchanged configured floors passed. Public parser tests passed 140 cases;
independent native helper verification passed 49 tests; independent validator
checks passed 92 cases. These results establish their tested contracts, not live
scenario behavior or authenticated publication.

[CI 34574708462](https://github.com/zomarit/stamity/actions/runs/34574708462) passed
Windows, Linux floor/LTS, APM and required aggregation on that candidate.
[Docs 34574708398](https://github.com/zomarit/stamity/actions/runs/34574708398) and
[PR checks 34574741703](https://github.com/zomarit/stamity/actions/runs/34574741703)
also passed. Any later evidence commit requires its own applicable final-head
checks. The original implementation and `713c057`/`184bc483` proofs remain in the
[Package 10 handoff](../2026-09-10_package-10/handoff.md), with their original
runtime, packed artifact, rehearsal and browser bindings.

## Not done

- Fresh full behavioral validation: C3's terminal calibration-label mismatch;
  zero scenario samples and no aggregate release score.
- The separate C4 created-invalid-dispatch handling gap and its completed,
  unbound/ungraded call. Original evidence remains preserved.
- Current human QA: H1 native-client/trust, H2 screen-reader and H3 complete
  keyboard observations remain unchecked in
  [qa.md](../2026-09-10_package-10/qa.md). Every H row must be walked and passing;
  every failing M row needs a linked follow-up. Human sign-off remains unsigned.
- Protected npm publication approval and authenticated signing/publishing proof.
  Existing human, tag, identity and owner controls remain in force.

The existing implemented 10A–E areas and their remaining proof boundaries are
mapped in the Package 10 handoff for subsequent conformance work. This record
starts no Package 11/12 work, comparative measurement, final audit or cleanup,
and performs no merge, tag or 1.7.0 release.
