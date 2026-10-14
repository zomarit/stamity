# Run record — Batch E: release controls + CHANGELOG (handoff 2026-08-31_triage-decisions_410bf)

- Run id: 2026-08-31_batch-e-release
- Flow: /st-work light-tier release-ops. Operator marathon authority.
- Baseline: public-main@46f8984 (all five engine lanes committed).
- Scope: decision 17 (CHANGELOG bootstrap + wire the extraction hook) and decision 16
  (release-controls checklist — PREPARE ONLY; the SECURITY.md wording flip and the platform
  arming are operator-gated, the handoff's standing blocker).

## Units
One implementer covering both decisions (disjoint files, one release-ops concern) + one
focused release-safety review + one W1 fixer.

## Proof block

Gates: lint/typecheck green; full suite 6156 (implementer) → 6162 (W1 test); leak gate 0 hits;
workflow structural test 85→91; the extraction's fail-closed behavior proven at the shell
(VERSION=1.0.0 extracts the section; bogus version exits nonzero; 1.0.1 does not match 1.0.10)
AND now by an executed test that parses the real YAML step.
Review: focused release-safety pass, high/0.85 request-changes — W1 (the fail-closed publish
gate shipped untested) and W2 (commit-range accuracy the reviewer couldn't check — my briefing
error gave it a Bash the agent type lacks). W1 fixed (test lands, exercises the real block,
perturbation-proven per-guard). W2 verified by the orchestrator with git: v1.0.0..v1.0.1 is
exactly the six [1.0.1] bullets (two brand commits→one), 0982f6c is post-tag → correctly
[Unreleased] — no CHANGELOG defect. M1 (footer stop-regex edge) deferred as a note.

Decision 17 LANDED: CHANGELOG.md (Keep a Changelog, six-group categories aligned to
st-release SKILL.md; [1.0.0] retrospective 2026-08-26, [1.0.1] the six-commit cut,
[Unreleased] this session's twelve); release.yml Compose-release-notes wired to extract the
section fail-closed ahead of the irreversible publish, with the conventional→category mapping
commented and an executed test.
Decision 16 PREPARED: .github/release-controls-checklist.md — the three platform controls
(npm-publish required reviewer, v* tag ruleset, npm trusted-publisher entry) each with
console steps / what-it-closes / verify-armed, the code-half already in release.yml named, and
the post-arming SECURITY.md flip drafted-but-NOT-made (operator confirms arming first; the
draft re-reads test/docsPages.test.ts). SECURITY.md untouched.

Ledger: all rows closed. Shippable: YES.
Remaining after Batch E (operator-gated, NOT agent-closable): decision 16 platform arming
(needs GitHub/npm access) + the SECURITY.md flip after it; decision 18 (eval harness) deferred
by operator. These are the handoff's own recorded non-agent items.
