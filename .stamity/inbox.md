# Deferral inbox

The deferral home the work, plan, rework, pr-resolve and board commands name: one row per deferred item, in the grammar `/st-board`'s `## Deferral inbox` section declares — `severity · file:line · description · source: <writer>`, with an optional `Ref: <path>#<anchor>` and an optional tag word (`critical-deferred` on a deferred Critical). The work command's close appends every `deferred` ledger row here at run exit; `/st-board fill` triages the rows; an entry leaves when its destination item exists, when its proposal id is recorded, when the user drops it by name, or when a completeness pass retires it with one line recorded in that pass's run record.

Three rows were appended 2026-09-10 by the 1.4.0 release run. Two retired the same day through
pull request #28 (the overlay spec's status and the advisory repeat's diff). The remaining
live-PR item retired through the enterprise-downstream execution: actual repository-token PR
creation and recovery, human-approved required CI, and a separate real landing-warning/new-PR
case now replace its stub-only evidence. The retirement statement is retained in
`.stamity/runs/2026-09-10_enterprise-downstreams/record.md`; its original evidence remains at
`.stamity/runs/2026-09-10_release-1.4.0/ledger.jsonl#2026-09-10_release-1.4.0/build/3`.

Two rows were appended 2026-09-17 by the plugin-lifecycle plan run (`docs/plans/008-plugin-lifecycle-01.md`
to `-03.md`), each a follow-up the plan left out on purpose:

- Minor · — · corpus prose names touchpoints in the bare form (`/st-work`, `stamity-reviewer`) while Claude Code loads plugin commands and agents under the plugin namespace (`/stamity:st-work`, `stamity:stamity-reviewer`); make the cross-references client-neutral only if file 3's route proof shows the bare form unresolved inside the plugin · source: /st-plan · Ref: docs/plans/008-plugin-lifecycle-03.md
- Minor · scripts/generate-apm-package.mjs:82 · the APM package ships `${STAMITY:*}` tokens verbatim while plugin roots ship charter-reference phrases (maintainer decision 2026-09-17: APM unchanged); revisit parity once plugin consumers have used the phrases for a release · source: /st-plan · Ref: docs/plans/008-plugin-lifecycle-01.md

- Minor · — · publish the plugin roots as npm packages as a second official source beside the git catalog (Claude Code and Codex marketplaces accept `npm` sources; Dependabot can watch npm but not git tags, JSON catalogs or `apm.yml`; enterprise registries such as Artifactory hold npm natively; npm provenance is not generated for private-repository publishes) — trigger: a consuming organization on Dependabot-only tooling or a private npm registry asks for it · source: /st-plan · Ref: docs/plans/008-plugin-lifecycle-01.md

- Minor · .stamity/runs/2026-09-17_codex-astra-audit/findings.md:— · the audit of the Codex and GPT-6 Astra sessions left about forty Minors (identity literals, uncited vendor facts, template companions, duplicated sentences, checker message shapes, private-layer hygiene); fix them when a unit touches the file, or as one hygiene batch after 1.9.0 · source: /st-plan · Ref: .stamity/runs/2026-09-17_codex-astra-audit/findings.md
- Minor · — · the CLI-to-plugin migration (preview, hash-verified removals, conflict refusal) and the coexistence suite were cut from 1.9.0 on 2026-09-17 because the consuming enterprise re-creates its private fork fresh; the documented route for a repository with a generated setup is `stamity clean -y` then `plugin setup`; re-plan the migration when a public CLI user asks to move to the plugin · source: /st-plan · Ref: docs/plans/008-plugin-lifecycle-02.md

Earlier Package 9 retirements are still recorded in
`.stamity/runs/2026-09-09_package-9/inbox-retirements.md`.
