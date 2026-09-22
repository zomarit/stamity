---
id: 2026-09-22_v4-private-chain-rehearsal-1-9-0_508a7
status: active
created: 2026-09-22T09:19:11.412Z
expires: 2026-10-22T09:19:11.412Z
summary: "V4 — the maintainer-run private-chain rehearsal for 1.9.0: two fixture repositories, a transient token, the eleven-step walk, its credential-free record and its owner-dependent Not done lines"
fromTool: claude
gitRef: package-15-plugin-lifecycle-3@967cb76
integrity: sha256:50b89336fe4a6ddcd2f5e99644153618d77ef3885e74dd1d14298cd7f67930bc
---
## Problem

V4 of plan 008 file 3 — the controlled private-chain rehearsal (REQ-PLUGIN-023) — is the one unit of the 1.9.0
release that only the maintainer can run: it needs the two private fixture repositories and a transient personal
access token, taken at run time and never in a file. Everything it reuses is on `package-15-plugin-lifecycle-3`
at `967cb76` (the 1.9.0 candidate); the rehearsal itself, its record and its `Not done` lines are what is left.

## Decisions

- The walk uses the fixture builder and the lifecycle proof's measured routes rather than a rollback subcommand:
  Claude Code 2.1.278 has no `plugin rollback`; the reinstall route completed by `claude plugin update
  stamity@stamity --scope project` re-records the version (measured 2026-09-22, exit 0, `updateOutcome: updated`).
- Suffix-free tags in the private mirror (`plugins/v1.9.0`, `plugins/v1.9.1`) because the Renovate tag regex
  ignores a prerelease suffix by design; the fixture suffix stays for the local walk.
- A local bare repository is not a Claude marketplace source; the private mirror is a GitHub repository, so the
  `<owner>/<mirror>#<tag>` form applies.
- The Copilot half of the private route is walked for the marketplace add and install only (its update is the
  same command) and stated as such; a local-path Copilot marketplace is loaded live (nothing copied).
- Items the fixture plan cannot enforce (required checks on a private plan, an enterprise catalog approval, network
  mirroring) are `Not done: <item> — owner-dependent` lines, not claims.

## Work Done

- `scripts/plugin-lifecycle-fixture.mjs` — builds two distribution trees from the candidate and pushes the tags and
  the `plugin-dist` branch (`--push`); the `--push` path itself is untested on a second remote (ledger build/80).
- `scripts/build-plugin-distribution.mjs`, `scripts/generate-plugin-packages.mjs` — the distribution root a release
  publishes (four roots, catalogs, `release.json`, the APM package, the Renovate presets), the case-fold refusal.
- `test/ci/pluginLifecycle.test.ts`, `scripts/qa/plugin-runs.mjs` (row `H5`) — the upgrade-and-rollback walk per
  client, measured on this machine 2026-09-22.
- `docs/plugins.md`, `docs/enterprise-forks.md` — the routes as measured, the Renovate example block, the APM route.
- `.stamity/runs/2026-09-17_plugin-lifecycle/record.md` — every unit's entry, the proof block of session 3.

## Work Remaining

V4 — the controlled private-chain rehearsal (REQ-PLUGIN-023) is the maintainer's: it needs the two private fixture repositories and a transient personal access token, taken at run time and never in a file. Everything it reuses is on the branch: `node scripts/plugin-lifecycle-fixture.mjs --out <dir> --versions 1.9.0-fixture.1,1.9.0-fixture.2 --push <private mirror git url>` builds the two distribution trees from the candidate (the second carrying the marker skill `fixture-marker`) and pushes the tags `plugins/v1.9.0-fixture.1` and `plugins/v1.9.0-fixture.2` and the `plugin-dist` branch (V4's own record uses suffix-free tags in the private mirror — `plugins/v1.9.0` and `plugins/v1.9.1` — because the Renovate tag regex ignores a prerelease suffix by design; pass `--versions 1.9.0,1.9.1` for the mirror and keep the fixture suffix for the local walk). The walk, in the order plan file 3's V4 cell gives: (1) mirror `plugin-dist` at the first tag into the private fixture repository; (2) the private catalog — the mirror's own `.claude-plugin/marketplace.json` and `.github/plugin/marketplace.json` re-rendered with `stamity.distribution.repository` pointing at the private url (V3's route: the same builder run in the mirror with a `package.json` carrying the private identity); (3) two consumer repositories pinned at the first version — one on the plugin route (Claude project scope: `extraKnownMarketplaces` naming the private repository, `enabledPlugins`, `plugin setup` run, `check` green; note from V2: `claude plugin update stamity@stamity --scope project` is the command that re-records the version, and a local bare repository is not a marketplace source — the private mirror is a GitHub repository, so `<owner>/<mirror>#<tag>` applies) and one on the APM route (`apm.yml` depending on `<private owner>/<mirror>#plugins/v1.9.0`, installed with `apm install` under the token — the 2026-09-10 route); (4) push the second tag; (5) a real Renovate run (the self-hosted `renovate` npm package at the day's version, the token in the environment only) over both consumers — the plugin consumer with `renovate.json` extending `github><private owner>/stamity//renovate/plugins.json` and `//renovate/companion.json`, the APM consumer with Renovate's native `apm` manager and the `versioning: "semver"` package rule `docs/enterprise-forks.md` documents; (6) exactly one pull request per consumer, the plugin one changing only the catalog `ref` lines (and the companion pin when declared), the APM one only `apm.yml` and its lock; (7) merge, reinstall (`claude plugin update stamity@stamity --scope project`), assert the marker is discovered and `plugin status` reports `compatible`; (8) pin back to the first version (edit the `ref`; the reinstall route), assert the sha-256 map equals the first version's; (9) a second Renovate run opens 0 pull requests; (10) `node scripts/leak-gate.mjs` over the record directory and the consumer checkout — 0 hits; (11) in the private mirror, `node scripts/upstream.mjs integrate` against the next upstream tag with a consumer manifest carrying `ruleDelivery`, and delete the update pull request once so the recovery path rebuilds it. Record every step with its command, exit code and the sha-256 of its captured output in `.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md` (credential-free), the consumer's `renovate.json` as `renovate-consumer.json` with a placeholder owner, and hand `docs/plugins.md`'s Renovate example block the bytes; items the fixture plan cannot enforce (required checks on a private plan, an enterprise catalog approval, network mirroring) are `Not done: <item> — owner-dependent` lines. Renovate's `github-tags` datasource needs the tags visible to the credential — one without `repo` read on the private mirror yields 0 updates, which is the failure to look for. The Copilot half of the private route is walked for the marketplace add and install only (its update is the same command) and stated as such. Codex's headless legs hit the account's usage limit tonight (until 2026-09-21 22:16 local); the Codex consumer half waits for it.

## Blockers

The token and the two private fixture repositories exist only with the maintainer; nothing here can be run without
them. The Codex account's usage limit resets in the evening (local); the Cursor account is over its usage limit
today — a step that needs either model reads `not-run` with the limit named, never `failed`.

## Next Steps

1. Check out `package-15-plugin-lifecycle-3` at `967cb76` (or the 1.9.0 tag once cut) and `npm ci && npm run build`.
2. Export the token in the shell only; never write it to a file under the checkout.
3. Walk the eleven steps above in order, capturing each command's exit code and the sha-256 of its output.
4. Write `.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md` (credential-free) and
   `renovate-consumer.json` with a placeholder owner; hand `docs/plugins.md`'s Renovate example block the bytes.
5. Run `node scripts/leak-gate.mjs` over the checkout — 0 hits — then commit by explicit path and push.
6. Add the `Not done: <item> — owner-dependent` lines for what the fixture plan cannot enforce.

## Build & Test Status

- Gate of record at `4c985ce` (the runner, uncontended): lint 0, typecheck 0, build 0, `stamity check` all green,
  `npm test -- --coverage` 234 files / 9,306 passed / 18 skipped, all-files 96.56 / 89.97 / 98.77 / 97.41, knip 0,
  leak gate 0 hits over 1,554 files, hygiene gate PASS, both generators' `--check` at 1.9.0, `test/evals` 1,290 passed.
- CI at `967cb76`: watched at the time of writing; green at `f839030` and `209b236` before it (three platforms).
- Eval run of record: run 31 (`evals/runs/2026-09-21-run-31`), PASS, composed with run 30 under the incremental rule.

## File Manifest

| Path | State | Last action |
|---|---|---|
| `scripts/plugin-lifecycle-fixture.mjs` | committed at `967cb76` | V2 part 1 built it; V4 reuses it |
| `test/ci/pluginLifecycle.test.ts` | committed at `967cb76` | V2 round 1 executes the three-command rollback |
| `docs/plugins.md` | committed at `967cb76` | V7 re-attested; the Renovate example block awaits V4's bytes |
| `docs/enterprise-forks.md` | committed at `967cb76` | V7 re-attested claim by claim |
| `.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md` | to be written by V4 | — |
| `.stamity/runs/2026-09-17_plugin-lifecycle/renovate-consumer.json` | to be written by V4 | — |
