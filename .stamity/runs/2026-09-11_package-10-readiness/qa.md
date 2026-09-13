# Stamity 1.7.0 human QA — conditional sign-off, condition met

Candidate: `a81fa5a88ed5eb525fbdffa6e1f0d23f7401fbca`. [PR #34](https://github.com/zomarit/stamity/pull/34).
**Shippable: YES under the maintainer's conditional approval.** The maintainer's sign-off and
final release go-ahead (2026-09-11) were given conditional on the complete fresh behavioral
evaluation and all mandatory release gates passing; evaluation run 24 passes every SET-v6
threshold and floor and every mandatory gate is green on the candidate (see the
[handoff](handoff.md)). The statement superseded the earlier instruction to stop for another
human QA signature, accepted the unperformed human-only observations as UNPERFORMED, and waived
no security, correctness, accessibility or baseline-test floor.

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

No observation above was performed by anyone; no signature was invented. Mandatory floors: no
security, correctness or accessibility violation is known in the candidate; the two open
Dependabot advisories on the website's `image-size` dependency (denial of service in image
parsers, no patched upstream version) are build-only docs toolchain exposure with a recorded
disposition, and the published package does not carry that dependency.

- Human sign-off: the maintainer's conditional statement of 2026-09-11, with the nine
  observations explicitly UNPERFORMED and accepted.
- Maintainer's final release go-ahead: the same statement, its condition met by run 24 and the
  green gates on `a81fa5a`.
