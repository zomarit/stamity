# Run record — Batch B docs pass (handoff 2026-08-31_triage-decisions_410bf)

- Run id: 2026-08-31_batch-b-docs
- Flow: /st-work, standard intensity, operator green-lit marathon ("don't stop until
  everything is 100% cleanly done and resolved", 2026-08-31)
- Scope: decision 8 (lifecycle guide), decision 9 (workspaces page, customization page,
  README mentions), riders 10b (commit/ignore guidance naming per-client trees) and 10c
  (learn-CLI security rationale), ledgered candidates prove/22 (reference intro prose) and
  prove/25 (title-regex nit) where a unit already owns the file
- Baseline: public-main@37bd456 (Batch A committed)
- Learnings read: leak-gate-scans-stamity-state-files (applied — no reserved token in any
  authored page or state file)
- Known contract risk, researched before authoring: docsPages cut-date rule (newest hand-page
  attested date must equal RELEASE_CUT_DATE 2026-08-30) may constrain new hand pages
- Phase 1: two researchers (wiring contracts; feature facts) + early dispatch of the Batch D
  lane-15 reference-repo study (read-only, external repo, zero writer conflict)

## Units

| Unit | Concern | Files | Status |
|---|---|---|---|
| B1 | author docs/working-with-stamity.md (lifecycle guide, decision 8) | 1 | dispatched |
| B2 | wire the guide: docsPages GUIDES array, sidebars.ts, llmsIndex.ts + regen llms.txt, README map row | 5 | pending (after B1) |
| B3 | getting-started riders: Where-to-go-next bullet, commit-guidance truth (10b), learn rationale (10c) | 1 | pending |
| B4 | reference-page intro prose for agents/rules prefixes (ledger prove/22) + regen | ~4 | pending |

Decisions trace:
- Default applied: plan gate → execute-now (operator marathon green light).
- Sequencing: the two decision-9 feature pages fold into their coupled engine lanes' closing
  docs units — workspaces page into D14 (decision 14's own text: the page "documents whatever
  this lane ships"; research: the engine has NO CLI door today, so a page now would document an
  unreachable feature), customization page into D11 (decision 9's caveat exists "until decision
  11 lands"; both land in this same marathon, so writing caveat-then-delete same day is churn).
  Recorded as sequencing within locked decisions, not scope change; if a D lane stalls, its page
  ships with the original caveat wording.
- Rider 10b premise corrected by research: init gitignores exactly .env.mcp
  (src/cli/commands/init/apply.ts:319-322); all generated trees are committed by design
  (README Dogfooding). The rider lands as commit-them guidance.
- New hand pages use the commit-sha currency form ("verified against the tree at commit
  <sha>") — the sanctioned path that bypasses the RELEASE_CUT_DATE clause
  (test/docsPages.test.ts:407-430; bumping the cut for a docs pass contradicts the repo's own
  reviewer precedent at batch-a ledger prove/24).

## Proof block

Gate results (dedicated runners; class-1 evidence):
| Pass | lint | typecheck | test | site build |
|---|---|---|---|---|
| Post-build authoritative | pass | pass | pass — 5709/162, 1 pre-existing skip | pass; page present, titled, sidebar-linked |
| Post-fix authoritative | pass (0.54s) | pass (0.53s) | pass — 5709 (59.71s) | pass (broken-link throw green) |
| Fixer rounds 3-4 local re-runs | pass | pass | pass — 5709 | — |

Review loop (cap 4, exhausted by convergence, not divergence):
| Round | Verdict | Confidence | Outcome |
|---|---|---|---|
| 1 | needs-fixes | high/0.85 | 4 Warnings + 8 Minors; fixer round 1 took W1-4 + 5 riders |
| 2 | needs-fixes | high/0.84 | round-1 fixes verified; 1 NEW Warning in the edited hunk; caught fixer misreport on rider M1 |
| 3 | needs-fixes | high/0.90 | 2 of 3 verified; the replacement sentence traded one false claim for another (orchestrator-contributed framing) |
| 4 (fresh fixer, stronger class) | approve | high/0.85 | reviewer-supplied sentence verified clause-by-clause; orchestrator diff check closed the scope claim |

QA checkpoint: documentation-only diff → one row (pages render, links resolve) — auto-proven
by two green site builds (onBrokenLinks: throw) + page-presence/sidebar greps + full-suite
hand-page contract. Sign-off: operator marathon authority (green-light message, recorded in
batch-a record). Shippable: YES.

Artifacts → owners: docs/working-with-stamity.md → spec-author B1 (+fixer rounds);
test/docsPages.test.ts, website/sidebars.ts, llms.txt, README.md → implementer B2 (+fixer W3
on README header); docs/getting-started.md → implementer B3 (+fixer W3/M4);
src/cli/docs/referencePages.ts + docs/reference/{agents,skills,rules}.md → implementer B4
(+fixer W2/M6); src/cli/docs/llmsIndex.ts → fixer rounds 1-4.

Side effects: spec-delta merge no-op (docs/specs/ absent; ADDED sentences held in unit
returns). No dependency changes. No new learning (no surprising failure beyond what
batch-a's leak-gate learning already records). PR emission: no linked platform; committed
locally, not pushed. Board events: no source, no-op.

Ledger: 16 rows, all closed (fixed/deferred with rationale); zero open at run exit.
Recommended next step: Batch C (CLI UX) — research complete including the keypress spike;
then Batch D lanes, whose closing docs units carry the two deferred feature pages.
