# Public downstream APM customization proof

- Source baseline: public canonical commit `da7d8a76bad16eec38cf734a5bfeb01d0c419d38`.
- Fixture: https://github.com/zomarit/stamity-p13-public-downstream-20260910/tree/apm-customized-proof
- Published git tag: `v1.6.0-public-fixture.1`, commit `5f79635763f3f867871726f9d31f8a013be64878`.
- Authoring inputs come exclusively from the committed public `test/ci/downstreamFixture.ts`, added to the complete canonical corpus. No enterprise repositories or materials were copied. The public fixture has explicit matching publisher/repository metadata; npm publication is disabled in this APM-only fixture independently of GitHub visibility.
- All15 package/lock/APM/plugin/dogfood version carriers and the built CLI version match `1.6.0-public-fixture.1`; tag parity holds. The canonical baseline remains an ancestor.

Actual unauthenticated remote installations passed on APM **0.29.1** (minimum) and **0.30.0** (current). Each installed the requested tag at the exact commit above, classified it as `apm_package`, and recorded219 deployment paths. Each passed56 independently specified source-edit/add/replace/patch body and identity assertions across Claude, Copilot, Cursor and Codex, plus8 exact companion-byte assertions and135 retained canonical primitive witnesses. Codex carries agents and skills at install; the other three targets carry all four classes.

Skill names retain the required bundled replacement identities and bare addition identity. Full replacement omits upstream companions; patches retain base companions; text and binary additions arrive with exact bytes (`00 ff 80 41 0a` for the binary witness). Patch control files and the synthetic consumer-only override do not become package-authoring outputs. APM target adapters may normalize boundary whitespace; the entire remaining body is compared, and companion bytes are unnormalized.

Anonymous execution used a clean environment without token/PAT variables, no gh CLI on PATH, empty gh configuration, disabled git credential configuration/prompts, disabled netrc and SSH, and fresh consumers/caches. Independent unauthenticated GitHub API reads returned200, confirmed public visibility and resolved the annotated tag to the exact installed commit.

Before push: npm lock/install, plugin/APM generation and checks, build, dogfood sync, CLI drift check and authored-content validate, lint, typecheck, leak gate and git diff check passed. CLI validate retained the five expected fixture retirement warnings with zero errors. The source oracle asserted16 primitives and15 version carriers before any platform push. Root's canonical gates and the lifecycle agent's platform workflows are separate evidence.

Only the authorized new branch and tag were pushed. No settings, existing branches, CI dispatches, GitHub Release objects, npm publications or docs deployments were changed by this proof.

Evidence files: `summary.json`, `0291-content-proof.json`, `030-content-proof.json`, install logs/JSON, source-version-proof.json, public API/tag records and reproducible prepare/install/verify scripts. No assigned proof remains blocked.
