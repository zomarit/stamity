# Run record — Batch D lane 15: worktree lane (handoff 2026-08-31_triage-decisions_410bf)

- Run id: 2026-08-31_batch-d15-worktree
- Flow: /st-work executing docs/specs/worktree-lane.md (18 REQs / 47 ACs). DEEP intensity
  (largest new subsystem of the marathon; git-state mutation surface; the operator's
  strongest mandate). Marathon authority stands.
- Baseline: public-main@4a117e0 (D14 closed).
- Lessons applied: registration events ride the owning unit (plan map, registry, waves —
  the gates prescribe); the verb surface has SEVEN known pins (cli.ts comments ×2,
  boundaries map, surface.e2e ADVERTISED+counts, cli-reference bytes, docsPages verb
  arrays ×2, README list+enumeration+trigger, getting-started section) — all baked into
  WT-U2's brief up front; corpus/docs edits ship with dogfood sync; re-attestations at the
  lane commit; the reference study lives in operator-session memory (leak gate).

## Units

| Unit | Concern | Files | Status |
|---|---|---|---|
| WT-U1a | engine primitives: policy file (parse/resolve, longest-prefix, admissibility), receipt schema+IO (git-dir home, write-time digests), materialization (EEXCL semantics, 0600 secrets) — pure, isolation-testable | ~6 | dispatched |
| WT-U1b | git orchestration: branch plan (attach/track/create + fetch), worktree add/remove wrappers, the name-scoped lock across check→add→materialize→receipt, setup/cleanup engine flows | ~5 | pending |
| WT-U2 | the verb: list/setup/cleanup dispatch, consent gates, partial-success contract, all seven registration pins | ~8 | pending |
| WT-U3 | docs close: working-with-stamity's parallel-work section shrinks to the managed lane (its own Re-open trigger fires), spec riders, re-attestations | ~3 | pending |

## Proof block

Gates: builds green at 5826(U1a-isolated)/6099-red(U1b, the known registry block)/6127(U2 unblocked)/6128(U3); post-fix 6152; final 6156 with the leak gate (0 hits, credential rules incl.), the commit-readiness probe (the NETWORK_ERROR producer visible to git grep), and the site build — all green.
Deep-tier Prove (two lenses + gates): frontier whole-diff needs-fixes high/0.84 (4W/10M — the partial-success orphan, cleanup mutate-then-refuse, receipt traversal, timeout blanket) and SECURITY lens needs-fixes/posting (1 Critical + 4W/4M — the policy could author away its own .env.mcp secret flag; a receipt row could delete the MAIN tree's credentials). Both converged on the receipt-traversal gap. One consolidated fixer (opus) closed all thirteen with red-first/perturbation proof on every security fix + the orchestrator managed-orphan decision + spec/docs reconciliation. Round-2 security re-check APPROVE high/0.83 with one case-fold residual, closed surgically under the security floor (the marathon's last fix).
Units: U1a primitives (BLOCKED_DEPENDENCY by the registry contract, resolved by U2's import; 95 mutation-proven tests, 9 spec-over-brief decisions), U1b git layer (the discriminating held-lock race test after git's own refusal masked the naive one; the real-git suite caught a latent EPIPE production crash; no pattern-fallback per the spec's retirement), U2 the verb (unblocked the tree; the ten-verb surface across seven pins; a designed-to-fire NETWORK_ERROR census test defused at commit), U3 docs (the Reserved-note cashed with a both-states proof; the mutating-write-location claim generalized after finding it false for two commands; 12 riders; criteria 47→87 derived).
Decisions trace: orchestrator managed-orphan recovery shape (a farm-resident receiptless tree is cleanable whole under --force, no pattern inversion — the spec's own retirement honored); the case-fold hardening taken rather than shipped as an approved residual (universal security floor).
Ledger: all rows closed. QA: git-mutating credential surface — auto-proven by the real-git suites (main-tree byte-identity, the race pair, receipt round-trip, 0600/withhold/traversal, the managed-orphan recovery) + both review lenses. Human residue: real-terminal worktree walkthrough + real-Windows (no Windows CI — the standing residual, now spanning the raw-mode and git-worktree surfaces). Shippable: YES (operator marathon authority).
Next: Batch E — the release-controls checklist (operator-gated) + CHANGELOG bootstrap; then the handoff closes.
