# Package 10 candidate handoff

Implementation and independent source reviews are complete, including the six-file
repair prompted by actual CI. The corrected full local gate passes 7,667 tests with
two existing opt-in skips and unchanged floors. The current source digest is
`5ef6446414d8bc5c2787a40f6712bf9eb55ffef5a35369554536527085bca37d`
over 1,075 inputs. All 54 render inputs and the built site are unchanged, preserving
the passing browser evidence.

The initial implementation was `4e649f8a703021a3c0e4e057c258942b2330220f`; its
recorded input binding remains historical. The local packed-scan claim was corrected
explicitly after CI exposed the scanner's skipped entry path. `verification.md`
preserves the old receipts and adds genuine positive and negative packed-scan proof.
The repaired commit/PR binding and fresh CI/rehearsal receipts follow before final
handoff. Draft PR #34 remains unmerged; 1.7.0 is prepared and unpublished. Baseline
`v1.6.0` / `99c1094953346ef19a8aaab3ee0bd7d292c36ba6` is retained.

| Item | Implemented outcome | Proof / remaining boundary |
|---|---|---|
| 10A native clients and hooks | Current discovery/invocation schemas; stop/deny/error translation; Cursor seconds/failClosed; Copilot CLI/cloud hook support; Codex native command/trust disclosure | `.github/client-contracts.md`, `review-u1-u2.md`, complete gates and four-client lifecycle fixtures. Authenticated native client/trust session remains open. |
| 10A three proposals/context | MIT/compatibility metadata and eight Codex companions; retain compatible Claude command delivery; remove duplicate context | `integration.md`, `verification.md`: charter 97/150; client ceilings 97/240/240/1063. No upward ratchet. |
| 10A memory overlap | Second-client trigger fired; retain repository-versioned cross-client learnings with dated rationale | `.github/client-contracts.md`; native personal memory does not replace repository knowledge. |
| 10B three authoring proposals | Structural reverse coverage helper plus semantic review; author checklist; dated plans/run records/git archive | `u2-evidence.json`, independent source review and structural fixtures. Seeded semantic model behavior remains unmeasured. |
| 10B onboarding | Every timer exit retains mandatory gates; explicit JavaScript typecheck detection repaired; fresh-repository recovery fixture | `u2-evidence.json`: actual agent-run CLI/gates and elapsed steps. New behavioral case is unmeasured; no real-beginner timing claim. |
| 10C pack signing | Author API/CLI reuse existing signed payload; verify before atomic safe write; case/symlink alias defects fixed | `u3-signing-distribution.md`, `review-u3.md`: real cryptographic round trip and 24 tests/original exploit rechecks. OIDC/Fulcio/TUF/transparency services are substituted; authenticated proof belongs to 12B. |
| 10C release egress | Twenty official dynamic artifact-storage accounts across all relevant jobs; existing identity/digest/human boundaries preserved | `.github/release-egress.md`; actual candidate non-publishing rehearsal pending. Skipped publish cannot prove the credential-bearing path, owned by12B. |
| 10D eval instrument | Stateless official API transport; exact input/model/effort admission; full response/refusal preservation; bounded infrastructure retries; all five calibration fixtures precede scores | `review-u4.md`,41 runner tests. Native diagnostic path admits extra developer messages; supported API transport lacks credential. Run 12records `OPENAI_API_KEY-unavailable`; no live admission/calibration/scores. |
| 10D six behavior repairs | Independently classified retained transcripts; repaired injection wording, closure routing, credential fragments, security categories, reviewer evidence basis and benign-skip wording | `u2-evidence.json`, `review-u1-u2.md`; changed source/Briefs synchronized. Affected three-sample behavior remains unmeasured. |
| 10D bootstrap/declarations | Shared import-inert native TypeScript helper; supported declaration compiler; public types and size accounting | `u3-signing-distribution.md`, `verification.md`: external strict TS (`skipLibCheck:false`), JS import and packed CLI pass. |
| 10D dependencies | Dated primary-source recheck retains exact unmet Docusaurus-v4/image-size fix triggers | `SECURITY.md`; no supported fix/migration found; site typecheck/build pass. |
| 10E integration/accessibility | APM, customization, upstream and CLI contracts preserved; all generated surfaces reconciled; shared reference heading defect repaired | `integration.md`, `verification.md`, `browser-review.md`:15 local gates pass;194 test files/7,667 tests,2 existing opt-in skips;46browser scenarios/44 zero-violation scans. Human walks remain open. |

All actionable independent source-review findings are fixed and rechecked. Red coverage
and browser attempts are retained. `history-preservation.json` confirms91 original
v4/rubric/run-10/run-11 files are unchanged. SET-v5 contains78 cases×3samples; the
69 inherited Expected blocks are unchanged. Selected profile remains `codex-astra`: Astra
scenarios, Sol judge, both high effort, rubric-v5. No fallback, baseline pooling, lucky
resampling or threshold change occurred.

## Not done

- Actual candidate Linux/Windows CI, APM route, PR checks and non-publishing rehearsal are
  pending the candidate push at this checkpoint; their final receipt will be added here.
- Live input-isolation/provider model and effort admission, all five calibration fixtures,
  affected-case results and the fresh full234-sample release eval are unperformed. The
  supported API transport has no authorized API credential configured. New
  `evals/runs/2026-09-10-run-12/RESULTS.md` records the exact committed configuration,
  BLOCKED status and all 78 cases at 0/3; no call or grade was admitted. Deterministic
  tests and inadmissible native diagnostics do not replace this proof.
- Current human QA, authenticated native-client trust observations, complete keyboard and
  screen-reader journeys are unsigned/unperformed in `qa.md`. Existing protected publication
  approval remains human-controlled. Prior 1.6.0 sign-off and eval reuse do not transfer.
- Existing enterprise engine/bot/network/mirror/notification/monitor identifiers remain
  owner-dependent; private enforcement read returns HTTP 403; registry authentication/settings
  read returns HTTP 401. No configuration was inferred. Authenticated signing/final publish
  proof retains its 12B owner.

The user authorized 1.7.0 only after all applicable gates pass. No merge/tag/release is
justified while these release prerequisites remain open. Packages 11–12, comparative
measurement, final audit and repository/fixture cleanup have not started. Package 11
receives the reviewed implementation and preserved instrument/behavior evidence; it must
revalidate admissibility before final conformance and owns new findings and due advisory
dispositions. This handoff does not silently reassign the six implemented repairs.
