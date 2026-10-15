# Coverage exemptions — v6

Each of the seven v4 rows required a case at the next set version; v5 supplies those cases. The
historical v4 exemption list stays intact.

A future exemption uses a `###` heading containing the backticked artifact path,
its evidence-based reason, and a dated or observable trigger. The coverage gate
continues to reject an unsourced artifact and an exemption whose case now exists.

**One row today**, added 2026-10-16 by plan `docs/plans/021-cloud-runs-01.md`, unit
`u9-unattended-skill`.

---

### `content/skills/st-unattended/SKILL.md`

Sourced by the cases `u22` adds. The skill lands in the plan's first wave, before any case can
quote it: its golden cases (`u22`) and adversarial cases (`u22b`) are written after `/st-work`'s
pointer to it (`u15`) and the run verbs it names (`u16` to `u19`) exist, so that each case's
`source:` range quotes settled text. Until then its floors are pinned deterministically by
`test/corpus/skills/unattended.test.ts`: the section order, every verb as the CLI spells it, the
`Default applied:` line, the refusal values, the only-push-path sentence, and that no sentence
tells a run to merge, tag or mark ready.

**A case lands** in the same plan's unit `u22`, which removes this row in the change that adds the
first case sourcing the skill.
