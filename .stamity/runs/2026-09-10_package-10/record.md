# Package 10 execution

Status: source implementation and independent reviews are complete; final verification is in progress.
This record does not perform human QA or platform publication approval.

Baseline: clean HEAD and remote main `99c1094953346ef19a8aaab3ee0bd7d292c36ba6`;
annotated `v1.6.0` object `1d7d2856607ca543caee9b1cc046ef38ed0788bb` peels to that SHA.
GitHub latest is published v1.6.0 (2026-09-10T17:41:13Z), npm latest is 1.6.0 with integrity
`sha512-p50XOfkpYROuHQhfdeuHOX73XgYvaviuIIxUWkDTJoWzhCcGCs6Zr9VmjT14Ml4GyELRR64+bgJBhSJZJQXWgA==`.

Plan: `docs/plans/006-finish-implementation.md`. Read-only independent client, behavior and
systems researchers completed the pre-edit contract census. One writer owns each artifact;
shared generation waits for source convergence. Implementation, review and verification use
independent roles. All repository learnings were read before project work.

Overnight decisions: retain the selected codex-astra profile; preserve historical evals and
strict thresholds; use reversible fixes within the plan; publish a reviewed candidate PR; run
actual required CI and non-publishing rehearsal. The subsequent authorization below permits
release 1.7.0 only after all applicable gates pass. No cleanup, comparative measurement or
final downstream audit is authorized. Missing proof is recorded, not replaced by a mock or
inferred success. Human QA must identify the finished candidate.

Early eval assessment: run 11's isolated dispatch admitted additional ambient instructions.
The installed Codex CLI is 0.154.0 with existing ChatGPT authentication. No OPENAI_API_KEY,
CODEX_API_KEY or OPENAI_BASE_URL is configured. Supported input controls and actual traces
must establish an admissible path before calibration/scoring; no model fallback is selected.

Initial Not done: implementation, independent reviews, required verification, affected evals,
candidate PR and current human QA. Owner-dependent enterprise configuration/network/monitor,
private required-check enforcement, registry environment binding and full human accessibility
walks remain separate open proofs inherited from the released baseline.

## Subsequent release authorization

The user explicitly authorized release after all gates pass, targeting 1.7.0. This supersedes
the initial no-release/unmerged disposition only. Full fresh release eval and current human QA
and platform approvals remain required; no other package or cleanup is authorized.

## Live isolation diagnostics

Codex 0.154.0 native exec and app-server diagnostic calls resolved judge gpt-5.6-sol
with high effort and returned no tool calls. Even with project context disabled, empty
app-server base/developer instructions, no environment roots and supported context/tool
feature controls, native traces retained two additional developer messages: 2,264 bytes
(SHA256 af60719c7b64906bd05733aec72a96726712fe25d382a7bc9e05a6733cfd67dc) and
271 bytes (SHA256 6ded806e3cdbb35599ecaf8742574bc5274908472b1729090010c404c2151e8e).
The installed binary is byte-identical to the official npm 0.154.0 Darwin ARM64 binary
(SHA256 4f85982624b3898c8991cb80c0981b2aa71070e3537046c9a95950318a95afcc).
These diagnostic outputs are not calibration or case scores. Input isolation remains
unproved on the tested native path; no calibration or score is admitted from these calls.
The configuration source is the official Codex config schema and app-server protocol.

## Implementation and review progress

The client, authoring/behavior and signing/distribution units have delivered their source
changes and focused verification. Independent review is in progress. The source/plan
structural check passes for all ten requirements and five units; it explicitly retains
`semanticReview: required`. The first root invocation used unsupported named arguments and
exited 2; the documented positional invocation exits 0.

The successor SET-v5 contains 78 cases (234 strict samples). All 69 inherited Expected
blocks remain byte-identical; eight Briefs change with the repaired governing text. Nine
new cases cover onboarding/semantic ambiguity plus the seven recorded next-set coverage
triggers. Original v4 inputs, retained rubrics and run-10/run-11 results are preserved.

Independent signing review reproduced manifest corruption through case and symlink path
aliases. The writer is repairing this before integration, with source-preservation tests
and an independent recheck. The complete review record is `review-u3.md`.

The new manual eval runner uses the stateless official Responses endpoint, with no tools
and no conversation continuity. This is a new disclosed isolation configuration for the
same selected model pair. Deterministic admission tests do not establish live identity,
isolation or calibration. The required API credential remains unavailable locally.

Review updates: U3's signing alias finding is independently closed (24 tests plus
both original exploit rechecks, no signing calls or manifest changes on refusal).
U1's global-stop precedence/reason finding is independently closed (26 hook tests).
U2's context-ratchet regression and full-lint findings are in repair. The runner
review is enforcing preservation of completed scenario refusals/multipart outputs
and refusal of unrequested provider prompt context before any live use.

Source convergence: U2 reports Codex 1,063 lines against the existing 1,065 ceiling,
with 196 words of repeated prose removed and the unchanged criteria synchronized.
Full configured lint, typecheck and 1,569 focused tests pass. Independent delta review
is checking those fixes. Integration will lower the measured Codex ceiling to 1,063
and reconcile the separate exact-byte disclosure; other ceilings and the charter cap
remain held. U4 independent review is clean after its two findings; 41 runner tests pass.

One integration writer is now preparing unpublished version 1.7.0 metadata/changelog
and regenerating all affected surfaces. The locked dependencies retain their previous
versions; supporting declaration dependencies are additive. No candidate is committed,
tagged or released at this checkpoint.

The first independent complete coverage run passed 7,647 tests and failed three
remaining old hook-contract assertions; two existing skips remain. Passing
coverage is not claimed from that run. The reader census also found outdated
troubleshooting and tool-allowlist disclosures. The integration writer is
reconciling that bounded contract family, preserving runtime interfaces and
historical material. Earlier successful package and site proofs will be
refreshed where their inputs change; no browser run has used the superseded site.


## Final integration findings

Independent reviews closed the source findings in `review-u1-u2.md`, `review-u3.md`
and `review-u4.md`. Integration regenerated APM/plugin/docs/dogfood/goldens, preserved
user-owned content and existing locked dependency identities, and prepared unpublished
1.7.0 metadata. The complete verification evidence will be recorded separately.

Coverage attempts preserve their red outcomes: stale current-hook consumers were
reconciled without weakening runtime assertions; the third complete run passed 7,655
tests (two existing skips) but failed a per-file branch floor. The native guarantee
update removed the last live nonblocking row, leaving the public renderer's supported
null-input branches unexercised. A synthetic observation-only transport fixture now
asserts both table sections and preserves live-client values; the unchanged full
coverage gate decides whether that gap is closed.

The first real browser run passed 20 theme/width scans, then found a moderate
heading-order defect on the skills reference page. The shared generator jumped
from H1 to H3 on six ungrouped reference pages. Six regression cases failed before
the repair. Independent review verified that all 52 generated heading changes
preserve names, slug inputs and every other byte. The failed browser bundle is
retained; the next sweep includes all six pages and keeps every scanner rule.


## Reviewed candidate and fresh eval attempt

Implementation commit `4e649f8a703021a3c0e4e057c258942b2330220f` is DCO-signed.
All 15 local gate categories pass:194 test files,7,662 tests,2 existing opt-in skips,
and unchanged coverage floors. Browser verification passes46 scenarios, including
44 theme/width scans with zero violations. Candidate binding compares every
recorded source input against the committed blob; no product byte differs.

New run 12uses the committed codex-astra profile, SET-v5, rubric-v5 and exact
harness/source hashes. It exits1 with `OPENAI_API_KEY-unavailable` before any API
call. Calibration is unmeasured, all 78 cases have0/3 admitted samples, and no
aggregate score exists. This is the required honest blocked artifact, not a
reused eval or a passing deterministic substitute. Actual CI/rehearsal follows
on the candidate PR. Human QA remains unsigned; no tag or release was created.


## Actual CI findings and correction

Draft PR #34 at `41cf1aa68d4d06448c03f4571d8fe72c95117e8a` ran actual CI,
PR checks, docs and a release `dry_run=true` rehearsal. PR checks/docs and
all APM legs passed. CI run34535881719 and rehearsal34535889890 failed
the real packed scan: a new internal declaration inferred a reserved
migration prefix literal. Windows additionally found two path-spelling
assertion failures and a committed-input fixture timeout. All failed jobs
and their raw logs are retained. No publish or deployment was requested.

The local packed-scan claim above is explicitly corrected: macOS temporary
path aliasing caused the copied scanner's direct-entry guard to skip its
body and exit0. The original wrapper accepted that as success. Earlier
strict TypeScript, JavaScript and CLI stages did execute, but that local
exit0 did not establish a scan. The repaired smoke canonicalizes its paths
and requires a nonempty successful scanner summary; real symlinked clean
and leaking fixtures plus silent/failed/empty-zero-exit regressions prove
its admission. The internal constant now declares `string`, preserving
runtime migration behavior without publishing a needless literal type.

A separate writer repaired only Windows tests: dynamic imports use file
URLs, cwd equality compares physical paths, and an early profile-byte
mismatch avoids a redundant full traversal. The initial196-input load and
actual rubric midrun-drift check remain; the20-second limit is unchanged.
Measured fixture Git processes fell479→246. Independent review approves
all six changed source/test files. Final full gates and new actual CI/
rehearsal are required before the corrected candidate is called verified.


The combined repair passed independent review and the complete local gate:194test
files,7,667passing tests,2existing opt-in skips, all held floors unchanged. New
before/after source inventories agree at
`5ef6446414d8bc5c2787a40f6712bf9eb55ffef5a35369554536527085bca37d`.
The real packed scanner inspected219files under18rules with0hits through a symlink,
then rejected the injected old declaration shape and invalid zero-exit scanners.
Corrected packed strictTS/JS/CLI checks pass. All54render inputs,134site output
files and20website TypeScript/config/package inputs are unchanged. Fresh actual
CI and non-publishing rehearsal now follow on the combined repair commit.


## Corrected candidate platform proof

Reviewed repair `713c057e113c0447ef0c2a2980d9cfc7ccea1379` now passes actual
CI34537631703 (Linux floor/LTS, Windows, three APM legs and aggregator),
PRchecks34537631663, Docs34537631620 and non-publishing Release34537639076.
The release gates/pack, canonical APM and summary pass; publication is skipped.
Its tarball SHA256 `2f86a82c29aefc170dc3c787147b39f08246f0fe4d911353c37cccce0a3c3408`
matches the independently scanned local tarball; an SBOM is included. Complete
job identities, checkout/tree comparisons, timestamps and log hashes are retained
in `ci-verification.md`/JSON. Original failed runs remain unchanged.

No actionable source finding remains. Final evidence-only records bind this
implementation and preserve all open live-eval/human/owner proofs. The final PR
head must also clear its required checks before handback; no merge/tag/release
is authorized by the failed-to-dispatch run12 or by unsigned current QA.
