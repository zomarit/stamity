# Coverage exemptions — v6

No exemptions remain. Each of the seven v4 rows required a case at the next set version; v5
supplies those cases. The historical v4 exemption list stays intact. The one row added on
2026-10-16 for `content/skills/st-unattended/SKILL.md` (plan `docs/plans/021-cloud-runs-01.md`, unit
`u9-unattended-skill`) left the same day, in the change of unit `u22-eval-golden` that added the
first cases sourcing the skill.

A future exemption uses a `###` heading containing the backticked artifact path,
its evidence-based reason, and a dated or observable trigger. The coverage gate
continues to reject an unsourced artifact and an exemption whose case now exists.

Sixteen rows, added 2026-10-21 by plan `docs/plans/018-packs-rebuilt-01.md`, unit
`u10-eval-surface`, when the surface took in `packs/` beside `content/` (REQ-PACK-013), covered the
artifacts of the three packs that had shipped since 0.1.0: `ops` (nine), `product-audit` (four) and
`scaffold` (three). No case was ever written for them. They left on 2026-10-21 with their folders,
in the change of plan `docs/plans/018-packs-rebuilt-02.md`, unit `u8-retire-old-packs`, that
deleted the three packs; no row names a file under `packs/ops/`, `packs/product-audit/` or
`packs/scaffold/`.

**A row added while its cases are pending** names the plan and unit that added the artifact, and
the unit whose cases source it and remove the row. The coverage gate's "no exemption outlives its
gap" block refuses a row whose path no longer exists, and a row whose path a case now sources, so
such a row leaves in the change that lands its cases.

Three such rows, added 2026-10-21 by units `u10-production-review`, `u11-release-skill` and
`u12-incident-skill` of plan 018 file 2 for `packs/production/commands/st-production-review.md`,
`packs/production/skills/st-release/SKILL.md` and `packs/production/skills/st-incident/SKILL.md`,
left on 2026-10-22 in the change of unit `u14-production-cases` that added the cases sourcing them.
Two more, added 2026-10-21 by units `u3-frontend-set` and `u9-st-plain` of the same file for
`packs/frontend/commands/st-ui-review.md` and `content/skills/st-plain/SKILL.md`, left on
2026-10-22 in the change of unit `u15-frontend-plain-cases` that added the cases sourcing them.
