# Run record — Batch D lane 12: overlay layers (handoff 2026-08-31_triage-decisions_410bf)

- Run id: 2026-08-31_batch-d12-overlays
- Flow: /st-work executing docs/specs/overlay-layers.md (15 REQs / 32 ACs, authored this
  session, D11-consistency sweep complete). Standard intensity; operator marathon authority.
- Baseline: public-main@424ce62 (D11 closed).
- Learnings applied: leak-gate (no reserved tokens in any artifact); the D11 C1 lesson —
  any corpus content/ edit ships WITH `npm run build && node dist/cli.js sync` so the
  dogfooded .claude/ copy and manifest hash move in the same unit.

## Units

| Unit | Concern | Files | Status |
|---|---|---|---|
| U1 | catalog core: candidate-filter narrowing (kills the live phantom-artifact bug), overlay discovery, parse/merge/materialize via composeFrontmatter, the seven refusals, catalog tests | ~5 | dispatched |
| U2 | gates side: validate "patched" outcome + merged-artifact gate, save-path parity, creator-agent overlay prose + lightTrio pin migration + dogfood sync | ~6 | pending (after U1) |
| U3 | docs close: customization page overlay section (its own Re-open trigger fires), header re-attested | ~2 | pending (after U2) |

## Proof block

Gates: authoritative runs green at 5863 (post-build), 5875 (post-fix-1), 5878 (post-fix-3);
final counts verified by dedicated runners; site build green throughout.
Review: round 1 needs-fixes high/0.86 — C1 (skill-overlay emission hole: merged body never
shipped while validate asserted it; the marathon's sharpest catch), W1 coverage matrix, W2
save-probe spelling; round 2 high/0.85 verified C1 airtight, found the attribution regression
(W3) + prose recurrence (W4); round 3 closed both red-first; round 4 (cap) verified all code
findings, reopened the citation class — post-cap triage closed it surgically with span-quoted
proof (reviewer-named operator lever exercised; rationale in prove/19).
Units: U1 catalog core (arch-ratchet-guided fold, phantom bug killed), U2 gates side (byKey
reuse seam, patched-row union, fileSlug, pack roots), U2c finisher (ceiling cross-pin,
check-drift parity), U3 docs close (page section + 13 riders), 3 fixer rounds + 1 surgical.
Ledger: all rows closed. QA: engine surface auto-proven by the suites (merge semantics,
refusal matrix, emission seam ×4 classes, drift parity); page claims reviewer-verified.
Shippable: YES (operator marathon authority).
Next: D14 implementation against docs/specs/workspace-surface.md.
