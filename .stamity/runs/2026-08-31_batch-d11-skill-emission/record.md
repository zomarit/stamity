# Run record — Batch D lane 11: skill-override emission (handoff 2026-08-31_triage-decisions_410bf)

- Run id: 2026-08-31_batch-d11-skill-emission
- Flow: /st-work, standard intensity (bounded engineering: extend an existing emission
  pattern to one more class; the "Declared gap" comment at src/cli/engine/emission.ts:96-104
  names the closure shape). Operator marathon green light stands.
- Scope: operator-locked decision 11 — user skills under .stamity/overrides emit to clients
  so shadowing is real, not index-only. Closes validate's emits:false caveat. This lane's
  closing docs unit authors the customization guide page (decision 9's second page, riding
  here per the Batch B sequencing decision) WITHOUT the skill-emission caveat.
- Baseline: public-main@5aacecd.
- /st-spec disposition: satisfied by the locked decision + the behavior contract recorded
  here — the lane's shape is fully evidence-determined; D12/D14/D15 get authored specs per
  their decisions' own text ("designed in its own spec", "decided by /st-spec").
- Batch order note: D11 → D12 → D14 → D15 per decision 20's lane list.

Plan-level resolutions of the research's named unknowns:
- packRoots stay OUT of projectSkills' widened contentRoot — packs keep their separate lane
  (decision 11 scopes to the corpus-shadow case; collapsing the two skill lanes is a larger
  change). The pack-skill shadow asymmetry (never reported) is ledgered as a follow-on.
- The support-file scan gap JOINS this lane: closing the projection makes unscanned override
  support-file bytes reach agent context on every sync — the deny-scan lane's exact harm
  class, and the universal floor does not relax. stamity validate's user-content section
  gains deny-scanning over override skill support files (read gate; the save path writes
  only SKILL.md and stays untouched).
- The corpus prose edit (stamity-creator.md Delivery section) is product-source maintenance
  by an implementer — the creator-agent/override path is for USER customization, not the
  framework's own corpus.

## Units

| Unit | Concern | Files | Status |
|---|---|---|---|
| U1 | the seam: widen ProjectSkillsOptions.contentRoot (root+overrideRoot), pass it in buildCoreEmissionPlan, add "skill" to OVERRIDE_EMITTING_CLASSES, rewrite gap comments, creator-agent Delivery prose; invert/move the four pinned test sites + new skillsProjection override cases | ~8 | dispatched |
| U2 | validate deny-scans override skill support files | ~3 | pending (after U1) |
| U3a | author docs/customization.md (decision-9 page, caveat-free) | 1 | pending |
| U3b | wire the page (GUIDES, sidebar, llmsIndex+llms.txt, README row) | 5 | pending (after U3a) |

## Proof block

Gates: authoritative runner green at 5781 + site build (page present, titled, sidebar-linked);
fixer rounds took the suite to 5786 (guard tests, payload.png pin) with full green; round-3
spec-prose round ran the doc gates only (recorded).
Review: round 1 request-changes high/0.82 (advisory per the repo's missing catch-rate
baseline; orchestrator triage accepted all graded findings) — C1 stale dogfooded copy, W1-W4;
round 2 high/0.86 verified all but one spec-criteria residual; round 3 applied the reviewer's
prescribed text, quoted from disk; loop exited on that evidence (rationale recorded).
QA: CLI/engine surface — auto-proven by the suites (seam both-trees cases, guard refusals,
scan cases, hand-page contract, site build). Human residue: none beyond the standing
real-terminal rows already recorded in Batch C's checkpoint. Shippable: YES (operator
marathon authority).
Ledger: 16 rows + prove rows, all closed at run exit. Units U1/U2/U3a/U3b done; +2 mechanical
derivations and the dogfood sync recorded.
Next: D12 implementation against docs/specs/overlay-layers.md (now internally consistent).
