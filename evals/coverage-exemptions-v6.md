# Coverage exemptions — v6

Each of the seven v4 rows required a case at the next set version; v5 supplies those cases. The
historical v4 exemption list stays intact. The one row added on 2026-10-16 for
`content/skills/st-unattended/SKILL.md` (plan `docs/plans/021-cloud-runs-01.md`, unit
`u9-unattended-skill`) left the same day, in the change of unit `u22-eval-golden` that added the
first cases sourcing the skill.

A future exemption uses a `###` heading containing the backticked artifact path,
its evidence-based reason, and a dated or observable trigger. The coverage gate
continues to reject an unsourced artifact and an exemption whose case now exists.

**Sixteen rows today**, added 2026-10-21 by plan `docs/plans/018-packs-rebuilt-01.md`, unit
`u10-eval-surface`, when the surface took in `packs/` beside `content/` (REQ-PACK-013). They are the
artifacts of the three packs that have shipped since 0.1.0, `ops` (nine), `product-audit` (four)
and `scaffold` (three). Each is a retiring pack's file: no case was ever written for it, and plan
018's file 2 deletes it with its pack, as Package 22 replaces the three with `production` and
`frontend`. Writing
cases for text due to leave would measure nothing the next release ships, so the rows stand until
then.

**The trigger is the deletion.** The coverage gate's "no exemption outlives its gap" block refuses a
row whose path no longer exists, so the change that deletes a pack's directory fails until it
deletes that pack's rows here in the same change; a case that sources one of these files first
fails the same block until its row goes.

---

### `packs/ops/agents/stamity-devops.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/ops/`.

### `packs/ops/agents/stamity-incident-responder.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/ops/`.

### `packs/ops/commands/st-incident-response.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/ops/`.

### `packs/ops/commands/st-release.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/ops/`.

### `packs/ops/skills/st-ci-pipeline/SKILL.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/ops/`.

### `packs/ops/skills/st-containerize/SKILL.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/ops/`.

### `packs/ops/skills/st-gh-agentic-workflows/SKILL.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/ops/`.

### `packs/ops/skills/st-incident-runbook/SKILL.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/ops/`.

### `packs/ops/skills/st-release-runbook/SKILL.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/ops/`.

### `packs/product-audit/commands/st-benchmark.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/product-audit/`.

### `packs/product-audit/commands/st-product-audit.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/product-audit/`.

### `packs/product-audit/rules/stamity-epic-audit-frame.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/product-audit/`.

### `packs/product-audit/skills/st-perf-audit/SKILL.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/product-audit/`.

### `packs/scaffold/commands/st-auth-scaffold.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/scaffold/`.

### `packs/scaffold/commands/st-design-system-create.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/scaffold/`.

### `packs/scaffold/commands/st-slo-scaffold.md`

A retiring pack; no case was ever written; plan 018 file 2 deletes it. Trigger: the deletion of
`packs/scaffold/`.

### `packs/frontend/commands/st-ui-review.md`

Added 2026-10-21 by plan 018 file 2, unit `u3-frontend-set`, with the command; its cases land in
a later wave of the same plan. Trigger: unit `u15-frontend-plain-cases` adds the cases sourcing
it and removes this row.
