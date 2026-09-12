# Stamity 1.7.0 human QA — conditional sign-off given, condition unmet

Candidate: `29894bc4987706a92c295313057ee046f71c52fb` (runtime, packed artifact and site inputs
differ from the prepared QA source `cae3fcdb…` through two corpus repairs; the prepared client
fixtures and site snapshot were not rebuilt). Draft [PR #34](https://github.com/zomarit/stamity/pull/34).
**Shippable: NO.** The maintainer's conditional sign-off and release go-ahead (2026-09-11)
apply only once the complete fresh behavioral evaluation and all mandatory release gates
pass; runs 19, 20 and 21 did not meet the declared thresholds (see the [handoff](handoff.md)).

The maintainer's statement, recorded verbatim in the private QA record, gives sign-off and the
final release go-ahead conditional on the evaluation and gates, supersedes the earlier
instruction to stop for another human QA signature, and accepts the remaining unperformed
human-only observations as UNPERFORMED while waiving no security, correctness, accessibility
or baseline-test floor. No observation below was performed by anyone; no signature was
invented.

| # | Scenario | Result |
|---|---|---|
| H1a | Claude Code native discovery, trust and allow/deny | [ ] UNPERFORMED — accepted under the conditional approval |
| H1b | Cursor native discovery, trust and allow/deny | [ ] UNPERFORMED — accepted under the conditional approval |
| H1c | Copilot native discovery, trust and allow/deny | [ ] UNPERFORMED — accepted under the conditional approval |
| H1d | Codex native discovery, trust and allow/deny | [ ] UNPERFORMED — accepted under the conditional approval |
| H2 | Screen reader understands changed documentation | [ ] UNPERFORMED — accepted under the conditional approval |
| H3a | Complete keyboard journey at 375px/light | [ ] UNPERFORMED — accepted under the conditional approval |
| H3b | Complete keyboard journey at 375px/dark | [ ] UNPERFORMED — accepted under the conditional approval |
| H3c | Complete keyboard journey at 1440px/light | [ ] UNPERFORMED — accepted under the conditional approval |
| H3d | Complete keyboard journey at 1440px/dark | [ ] UNPERFORMED — accepted under the conditional approval |

Mandatory floors: no security, correctness or accessibility violation is known in the
candidate. The two open Dependabot advisories on the website's `image-size` dependency
(denial of service in image parsers, no patched upstream version) are build-only docs
toolchain exposure with a recorded disposition; the published package does not carry that
dependency. The evaluation measured accessibility-floor omissions in the model's behaviour
(`ui-error-state-announces-recovery`) that the corpus repairs addressed in part; they are
product-behaviour findings, not defects in the shipped code.

This form authorizes no merge, tag, publication or protected deployment approval.
