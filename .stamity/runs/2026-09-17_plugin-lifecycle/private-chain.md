# V4 — the controlled private-chain rehearsal (REQ-PLUGIN-023), 2026-09-22

Run by the session-4 orchestrator on this machine at the maintainer's go, with the maintainer's own GitHub
login: the `gh` CLI's token, read into the environment of the token-bearing commands at run time (`apm
install`, the Renovate runs) and never written anywhere; every git push and clone used the credential helper
over a plain `https://github.com/…` url. Every step below carries its command, its exit code and the sha-256 of
its captured output (the first twelve hex digits here; the full digests are listed at the end). Placeholders:
`<owner>` is the maintainer's personal GitHub account, `<work>` the scratch directory outside every checkout,
`<root>` the installed plugin root under the scratch Claude configuration directory, `<consumer>` a consumer
checkout. The three fixture repositories are private and deletable; nothing here ran in the maintainer's real
client homes (a scratch `CLAUDE_CONFIG_DIR` and `COPILOT_HOME`), so nothing had to be removed afterwards.

## What stood in for what

- **The private mirror** is a full private fork of this repository: `main` carries the source at the shipping
  candidate `37e8976` plus one identity commit (the enterprise guide's identity step: publisher, repository and
  homepage in `package.json`, the two Renovate presets moved to the mirror's own slug, the manifests and the APM
  package regenerated); `plugin-dist` is the orphan distribution tree and `plugins/v1.9.0` / `plugins/v1.9.1`
  its two tags, built by the fixture builder from the same candidate with the private identity. The mirror is
  therefore what the Renovate presets are read from (`github><owner>/stamity-plugins-mirror//renovate/…`), what
  the catalogs point at (`git-subdir` at the mirror url and a tag) and what APM installs from.
- **The private catalog** lives in the plugin consumer: the shipped `renovate/plugins.json` preset watches the
  four catalog files in the repository Renovate runs over, and the guide says the reviewed object is the
  organization's catalog repository — so the consumer on the plugin route *is* that catalog (the mirror's
  rendered Claude catalog, pinned at `plugins/v1.9.0`) and a Claude project that installs from it at project
  scope. Only the Claude catalog carries a `ref`; the Copilot, Cursor and Codex catalogs of the distribution
  point at their roots by relative path and are not bumped by the preset.
- **The APM consumer** depends on `<owner>/stamity-plugins-mirror#plugins/v1.9.0` in `apm.yml` with
  `targets: [claude]`, Renovate's native `apm` manager and a package rule for the tag scheme.
- **Clients and tools**: Claude Code 2.1.278 (a scratch `CLAUDE_CONFIG_DIR`), GitHub Copilot CLI 1.0.87 (a
  scratch `COPILOT_HOME`), apm-cli 0.30.0 in a Python virtual environment, `renovate` 44.107.0 (the version
  current on the day) on Node 24.19.0 — its engine floor is `^24.11.0`, so the machine's default Node 22 could
  not run it — with `LOG_LEVEL=info`, a debug log file, a scratch cache and base directory. Renovate ran as the
  maintainer's user (the `gh` token), so the pull requests are authored by that account with Renovate's default
  git author.

## The walk

| # | Step | Command | Exit · output sha-256 · facts |
|---|---|---|---|
| 0 | Three private fixture repositories created under the maintainer's personal account (session 3, 14:53Z–14:55Z) | `gh repo create <owner>/stamity-plugins-mirror --private` (and `stamity-consumer-plugin`, `stamity-consumer-apm`) | exit 0; three empty private repositories |
| 1 | The two versions built from the candidate `37e8976` with the private identity (`repository.url`, `homepage`, `stamity.publisher` = `<owner>`) and pushed to the mirror (session 3, 15:0xZ) | `node scripts/plugin-lifecycle-fixture.mjs --out <work> --versions 1.9.0,1.9.1 --push https://github.com/<owner>/stamity-plugins-mirror.git` | exit 0; `refs/tags/plugins/v1.9.0` = `bbd0c962…`, `refs/tags/plugins/v1.9.1` = `refs/heads/plugin-dist` = `b567f3a9…`; four roots per version; the second version carries the marker skill `fixture-marker`; the push URL was credential-free (the `gh` credential helper authenticated it) |
| 2 | The private catalog: the mirror made a full private fork — a real clone with history at `37e8976`, the identity step of `docs/enterprise-forks.md` applied (`package.json` publisher, repository and homepage; the two Renovate presets moved, `renovate/plugins.json` now watching `<owner>/stamity-plugins-mirror`; the manifests and the APM package regenerated) and pushed as `main`, made the default branch, so `github><owner>/stamity-plugins-mirror//renovate/*.json` resolves. The rendered catalogs already carried the private url from step 1. | `node scripts/generate-plugin-manifests.mjs` · `node scripts/generate-apm-package.mjs` · `git push -u origin main` · `gh repo edit … --default-branch main` | `2026-09-22T15:19Z` · exit 0 · `cc9d38626d01…`; `2026-09-22T15:19Z` · exit 0 · `9477ae9745a8…`; `2026-09-22T15:19Z` · exit 0 · `cea6e06f2be7…`; the fork commit `16d0fd5` (7 files); the npm identity (`name`, `private`) untouched because the mirror's roots bundle the public runtime |
| 3a | The plugin consumer: the organization's private catalog (the mirror's Claude catalog at `plugins/v1.9.0` — the only one of the four catalogs carrying a `ref`; its `source` is `git-subdir` at the mirror url) plus `renovate.json` extending the mirror's two presets, pushed; then the Claude project-scope route in a scratch `CLAUDE_CONFIG_DIR` | `claude plugin marketplace add <owner>/stamity-consumer-plugin` · `claude plugin install stamity@stamity --scope project` | consumer commit `2748c9c`; `2026-09-22T15:19Z` · exit 0 · `7e1dd16517e7…` ("declared in user settings"); `2026-09-22T15:19Z` · exit 0 · `491f1d4def46…` (installed 1.9.0 at `bbd0c962`, scope project); the project's `.claude/settings.json` gained `enabledPlugins` only — the marketplace declaration landed in the config directory's user settings (fact 1 below) |
| 3b | The setup through the root's locator, `check` and `plugin status` | `node <root>/runtime/locate.mjs --project <consumer> -- plugin setup --client claude` · `… -- check` · `… -- plugin status --json` | `2026-09-22T15:20:55Z` · exit 0 · `1ee9ada1f71c…` (wrote 14 files: 13 created, 1 skipped — `.claude/settings.json`); `2026-09-22T15:22:05Z` · exit 1 · `8aeffdd9bd3c…` — **exit 1**: `drift: 1 file(s) would change … collision .claude/settings.json` (fact 2 below; the row `plugin-runtime` is ok with `CLAUDE_PLUGIN_ROOT` exported and warns without it); `2026-09-22T15:20:56Z` · exit 0 · `aae674442fa6…` — `compatibility.state` `compatible`, the claude root found at 1.9.0; the repository-owned half committed as `531348a` |
| 3c | The Copilot half — marketplace add at the tag and install only, in a scratch `COPILOT_HOME` (its update is the same command, not walked) | `copilot plugin marketplace add <owner>/stamity-plugins-mirror#plugins/v1.9.0` · `copilot plugin install stamity@stamity` · `copilot plugin list --json` | `2026-09-22T15:22:11Z` · exit 0 · `9f520febdeba…` ("Marketplace stamity added successfully"); `2026-09-22T15:22:13Z` · exit 0 · `f86d99806f87…` ("Installed 10 skills"); `2026-09-22T15:22:14Z` · exit 0 · `9e1c322aba24…` (version 1.9.0, enabled, source installed) — GitHub Copilot CLI 1.0.87 |
| 3d | The APM consumer: `apm.yml` on `<owner>/stamity-plugins-mirror#plugins/v1.9.0` with `targets: [claude]`, installed under the token (in the environment only), its `renovate.json` with the native `apm` manager rule, pushed | `GITHUB_APM_PAT=… apm install` (apm-cli 0.30.0 in a virtual environment) | `2026-09-22T15:18Z` · exit 0 · `c5439e3d8336…` — resolved `plugins/v1.9.0` @ `bbd0c962`, 10 agents / 9 commands / 10 rules / 10 skills integrated into `.claude/`, `apm.lock.yaml` `package_type: apm_package`; consumer commits `82f9280` (the install) and `921a049` (the versioning rule, fact 3 below) |
| 4 | The second tag pushed | (done in step 1 — both tags and the branch went with the one `--push`; the plan's `.1`-then-`.2` sequence is not what the builder stages) | `refs/tags/plugins/v1.9.1` = `b567f3a9…` on the mirror since step 1 |
| 5 | One real Renovate run over both consumers (the self-hosted `renovate` npm package at the day's version 44.107.0, the token in the environment only) | `npx --yes renovate@44.107.0 <owner>/stamity-consumer-plugin <owner>/stamity-consumer-apm` (platform github; a scratch cache and base directory) | three attempts, each recorded: `2026-09-22T15:22:31Z` · exit 1 · `e1930f6473fb…` — `TypeError: RegExp.escape is not a function` (renovate 44.107.0 needs Node `^24.11.0`; the machine's default is 22.22.3); `2026-09-22T15:25:31Z` · exit 0 · `b36cf7b20358…` on Node 24.19.0 — the plugin consumer's PR #1 opened (`regex` manager, 1 dep); the APM consumer 0 updates: `unsupported/unversioned value plugins/v1.9.0 (versioning=semver)`, `skipReason: invalid-value` — the failure to look for beside the token one (fact 3); `2026-09-22T15:40:52Z` · exit 143 · `ac957d2a66e4…` after the rule moved to a regex versioning — the update found, then `spawn apm ENOENT` (`lockfile-error`, exit 7: the `apm` manager runs `apm install` to refresh the lock and needs `apm` on PATH and `GITHUB_APM_PAT` in its environment; the process hung after the error and was stopped); `2026-09-22T15:41:40Z` · exit 0 · `5f613d7b095a…` — the APM consumer's PR #1 opened, the plugin consumer `done` with its PR standing |
| 6 | Exactly one pull request per consumer | `gh pr list`, `gh pr diff` (the diffs captured) | plugin consumer: PR #1, **1 file, +1/−1**, the catalog's `"ref": "plugins/v1.9.0"` → `"plugins/v1.9.1"` and nothing else (diff sha-256 `2751c7f8c925bf973bbec6952678e56f3598dd274ae4fa883fa7d141c30d2705`); APM consumer: PR #1, **3 files, +35/−4**: `apm.yml` (the ref), `apm.lock.yaml` (`resolved_ref`, `resolved_commit` `b567f3a9…`, the marker's entry and hash, `content_hash`) **and** `.claude/skills/fixture-marker/SKILL.md` — the deployed file, because the native manager runs the install itself (diff sha-256 `a4283671989d83923e7ed60b5d6c48256489a819e2eee6cdbdcab23e72f7aaa6`; fact 4 below). No other pull request, no issue, on either consumer. |
| 7 | Merge, reinstall, the marker discovered, `plugin status` compatible | `gh pr merge 1 --rebase --delete-branch` (both) · `claude plugin marketplace update stamity` · `claude plugin update stamity@stamity --scope project` · `… -- plugin status --json` · `claude plugin validate <root>` · `apm install` (the APM consumer at the merged state) | `2026-09-22T15:42:21Z` · exit 0 · `e3b0c44298fc…`; `2026-09-22T15:42:25Z` · exit 0 · `e3b0c44298fc…`; consumers at `e4c97ce` / `93c8fff`; `2026-09-22T15:43:09Z` · exit 0 · `79b0c7ad4f48…`; `2026-09-22T15:43:13Z` · exit 0 · `959fd3f1d170…` — "updated from 1.9.0 to 1.9.1 for scope project"; the installed record 1.9.1 at `b567f3a9`; `skills/fixture-marker/SKILL.md` present in the 1.9.1 root and absent in the 1.9.0 root; `2026-09-22T15:43:13Z` · exit 0 · `8b7f9bdaf6e3…` — `compatible` (plugin 1.9.1, manifest 1.9.0), the claude root 1.9.1; `2026-09-22T15:43:14Z` · exit 0 · `1c37fac24d2b…` — `Validation passed`; `2026-09-22T15:43:18Z` · exit 0 · `20985b17d0da…` — 11 skills integrated, the working tree unchanged (the merged lock and tree are what a fresh install produces) |
| 8 | Pin back to the first version by the reinstall route, the sha-256 map equal to the first version's; then the consumers restored to the merged state | plugin consumer: `git revert` of the catalog bump (`ca410ba`), push, `claude plugin marketplace update stamity`, `claude plugin install stamity@stamity --scope project`, `claude plugin update stamity@stamity --scope project`; APM consumer: `git revert` (`fab6816`), push, `apm install`; then `git revert` of each revert (`c583adc`, `a15ff0b`) and the same refresh | `2026-09-22T15:44:58Z` · exit 0 · `79b0c7ad4f48…`; `2026-09-22T15:44:58Z` · exit 0 · `8342aa33332b…` — "already installed (scope: project)"; `2026-09-22T15:45:04Z` · exit 0 · `c8fbf4bf965f…` — "updated from 1.9.1 to 1.9.0 for scope project": the third command is what re-records the version, on the GitHub form as on the local clone the lifecycle proof measured; the installed record 1.9.0 at `bbd0c962`; the per-file sha-256 map of the pinned-back root **equals** the first version's map taken before the upgrade (288 content files; the client's own `.orphaned_at` bookkeeping file, written into the superseded version's cache directory at the upgrade, excluded and stated — fact 5); the marker absent; `plugin status` `compatible` at 1.9.0. APM: `2026-09-22T15:45:18Z` · exit 0 · `2cf79d898809…` — `apm.yml`, `apm.lock.yaml` and `.claude/` **byte-identical** to the first install's commit `82f9280`, the marker absent. Restore: `2026-09-22T15:45:09Z` · exit 0 · `79b0c7ad4f48…`; `2026-09-22T15:45:13Z` · exit 0 · `959fd3f1d170…` — "updated from 1.9.0 to 1.9.1"; `2026-09-22T15:45:24Z` · exit 0 · `e524bcd90c39…` — the tree clean, the marker present. (An earlier attempt at this step, 15:43Z–15:44Z, ran its client commands against consumers that had not been pinned back — the revert command had not launched — and is void; its captures are kept in the log and not cited.) |
| 9 | A second Renovate run opens 0 pull requests | `npx --yes renovate@44.107.0 …` (the same environment as run 1d) | `2026-09-22T15:45:53Z` · exit 0 · `8576508e4bc8…` — both repositories `Dependency extraction complete` → `Repository finished`, result `done`, **no branch created, no pull request opened** (0 open, 1 merged per consumer on `gh pr list --state all`; no `renovate/*` ref on either remote) |
| 10 | The leak gate over the record directory and the consumer checkouts — 0 hits | `node scripts/leak-gate.mjs --root <consumer>` (each) · `node scripts/leak-gate.mjs` (the checkout with this record present) | `2026-09-22T15:45:43Z` · exit 0 · `e55d43828bd7…` — PASS, 0 hits across 21 files; `2026-09-22T15:45:43Z` · exit 0 · `826f849511c7…` — PASS, 0 hits across 64 files; a by-hand sweep of both trees for the shapes the gate does not catch (absolute paths, bearer/token strings, e-mail, the private layer's name) found only the corpus's own rule text; the checkout: `2026-09-22T18:07:05Z` · exit 0 · `964fc782de79…` — PASS, 0 hits for 18 rules across 1,567 files with this record and `renovate-consumer.json` present; the by-hand sweep of both files for the shapes the gate does not catch (absolute paths, tokens, e-mail, the private layer's name, the real owner) — 0 hits |
| 11 | In the private mirror, `node scripts/upstream.mjs integrate` against the next upstream tag with a consumer manifest carrying `ruleDelivery`, the update pull request deleted once so the recovery path rebuilds it | (after the `v1.9.0` tag exists) | __STEP11__ |

## Measured facts that differ from what the pages say (handed to the docs lane and the spec)

1. **Where the marketplace declaration lands (Claude Code 2.1.278).** `claude plugin marketplace add` declares the
   marketplace in the *user* settings of the configuration directory (`extraKnownMarketplaces` there) and
   `claude plugin install stamity@stamity --scope project` writes **only** `enabledPlugins` into the project's
   `.claude/settings.json`. `docs/plugins.md` shows both keys as what `--scope project` records. Measured further
   in a second scratch configuration directory whose only declaration was the project's own `extraKnownMarketplaces`
   block: `plugin install` answered `Plugin "stamity" not found in marketplace "stamity" … try claude plugin
   marketplace update stamity` and that update answered `Marketplace 'stamity' not found. Available marketplaces:`
   (both exit 1, captured) — the `plugin` subcommands read the project declaration's *name* and not its source; the
   vendor documents the project declaration's effect at session start, which this walk did not measure.
2. **The documented route ends in a red `check`.** Install first (the client writes `.claude/settings.json`), then
   the setup: `plugin setup` skips that file and `check` exits 1 with `collision .claude/settings.json` and a remedy
   (move it aside, or `sync --force`) that would destroy the client's install record. The engine's own rendering of
   the file in plugin mode is a `permissions` block; on a fresh project it is written and ledgered and `check` is
   clean. Fixed on the release branch by the settings lane (key-level ownership of that file), recorded in the run
   record's session-4 section.
   Re-measured 2026-09-22T22:33Z with the fixed engine (the candidate `3eef4a6`'s own build) on this consumer:
   `check` reported one plain `update` for the file and no collision, `sync -y` adopted it keeping the client's
   `enabledPlugins` beside the generated `permissions` with no `.bak`, and `check` was then clean, exit 0 (captures
   `consumer-check-with-fixed-engine`, `consumer-sync-with-fixed-engine`, `consumer-check-after-sync`).
3. **Renovate's `apm` manager and the tag scheme.** With the package rule the enterprise guide documents
   (`"versioning": "semver"`, written for `v<semver>-<suffix>` private tags) the dependency
   `<owner>/stamity-plugins-mirror#plugins/v1.9.0` is `invalid-value` and yields 0 updates. The rule that fits the
   `plugins/v<version>` scheme is the regex versioning the shipped `renovate/plugins.json` uses:
   `regex:^plugins/v(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$`. Both consumer configurations are in
   `renovate-consumer.json` beside this record (the plugin consumer's) and in the block below (the APM consumer's).
4. **The APM pull request carries the deployed files.** Renovate's native manager runs `apm install` to refresh the
   lock, so the pull request changed `apm.yml`, `apm.lock.yaml` **and** the deployed marker skill — REQ-PLUGIN-023's
   "changing only `apm.yml` and its lock" describes the manifest and the lock; the deployed files travel with them.
   That run needs `apm` on Renovate's PATH and `GITHUB_APM_PAT` in its environment; without them the manager reports
   `lockfile-error` (`spawn apm ENOENT`).
5. **The client's own bookkeeping.** After an update, Claude Code writes `.orphaned_at` into the superseded version's
   cache directory; the per-file map comparison excludes that one file and compares the 288 content files.
6. **The fixture's second tree keeps `apm.yml` at `version: 1.9.0`** (the catalogs, the plugin manifests and
   `release.json` carry 1.9.1; the bundled runtime is 1.9.0 in both), so the APM lock's `version:` field reads
   1.9.0 at both tags while `resolved_ref` and `resolved_commit` move — a fixture-builder nuance, not the release's.
7. **`plugin update` at a lower catalog ref downgrades** — "updated from 1.9.1 to 1.9.0" — which confirms on the
   GitHub form what the lifecycle proof measured on a local clone: after the marketplace is refreshed at the
   previous tag and `plugin install` answers "already installed", the qualified `plugin update … --scope project` is
   the command that re-records the version.

The APM consumer's `renovate.json` as executed (the placeholder owner):

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "packageRules": [{
    "matchManagers": ["apm"],
    "matchPackageNames": ["<owner>/stamity-plugins-mirror"],
    "versioning": "regex:^plugins/v(?<major>\\d+)\\.(?<minor>\\d+)\\.(?<patch>\\d+)$"
  }]
}
```

## Not done — owner-dependent

- Not done: required-check enforcement on the private plan — owner-dependent (the fixture repositories carry no
  branch protection; the pull requests merged without a check).
- Not done: the enterprise's own catalog approval — owner-dependent (the merge here was the orchestrator's click,
  standing in for the organization's review).
- Not done: network mirroring of the distribution to a host that is not github.com — owner-dependent (the mirror is
  a GitHub repository under the maintainer's account).
- Not done: the Cursor and Codex halves of the private route — the plan's V4 cell walks the Claude project-scope
  route, the Copilot marketplace add and install, and the APM route; the per-client Cursor and Codex routes are
  measured by the lifecycle proof (`H5`) and the route smoke (`H4b`, `H4d`) against the public distribution shape,
  not against the private mirror.
- Not done: the Copilot update path on the private mirror — its command is the same as the public one and was not
  walked (stated by the plan).
- Not done: the vendor-side effect of a project-declared `extraKnownMarketplaces` at session start (fact 1) — a
  person's interactive session.

## Captured output digests (sha-256, full)

- `apm-install-1.9.0` — `c5439e3d833613a0e413eee78cd88bfea2e86e755c3ecc54d84a9b2dfe054b7d`
- `fork-generate-manifests` — `cc9d38626d01b763e29316fd91cfe80a34f780fcbadc9662aee3baa06522209d`
- `fork-generate-apm` — `9477ae9745a850b88b7527ebf201f3e1b1c123906538acef25b5d66c21811c3b`
- `fork-push-main` — `cea6e06f2be79ce92fdf81deb6d30b4220ecef3955c74a6a3f7a9b7180e4d1bf`
- `claude-marketplace-add` — `7e1dd16517e76289f522f358f71bc5a1584f44bd5c0677246a536a205db44003`
- `claude-plugin-install` — `491f1d4def4609c4c2d632f2839ceea2e16365dd11a30cf67721f6c4894a4fbc`
- `claude-project-declared-install` — `efc13f17dbc40bbe6b2dcc1fc734a3ca4c638816b82ea21072355d2a66806a10`
- `claude-project-declared-marketplace-update` — `9f917f934ccd0ce80490e83e07c31b0bbe73f28717628e9412037ee77e387a64`
- `claude-project-declared-install-2` — `efc13f17dbc40bbe6b2dcc1fc734a3ca4c638816b82ea21072355d2a66806a10`
- `claude-plugin-setup-1.9.0` — `1ee9ada1f71c4f073f3dd1e572135c23e29883089b5866e59c510ef2c1329f65`
- `claude-check-1.9.0` — `1edf7db7dea852860ad51ef7df829e3a703b338ccfdc771030babfc0420a7249`
- `claude-plugin-status-1.9.0` — `aae674442fa6f71e3647479c909a3ad3337e8b8fe0a9814ba4e13b269633aaa6`
- `claude-check-1.9.0-with-root` — `8aeffdd9bd3c0ad3ca8bfbf589662a9fcf83e417717bcafb0cad770ac4c0c3d5`
- `copilot-marketplace-add` — `9f520febdeba97b729bc8a0572b7eb9a698fab7f6316ef01b630a03f7a2ea40c`
- `copilot-plugin-install` — `f86d99806f870d8901f4833c580c7e03c0c196f99d236a35528fcabd269a404f`
- `copilot-plugin-list` — `9e1c322aba246f274dba0bb2aeaebe435987f531c8e56b5f7e395b21cff4b469`
- `renovate-run-1` — `e1930f6473fba33c771ce51d2310b833c0318aea4f9fabc911f5fbad35dfcde1`
- `renovate-run-1b` — `b36cf7b203580d8cd5396d8b95be152668aa2786274c27a83f024794a704f089`
- `renovate-run-1c` — `ac957d2a66e4ad26d8b3bade6e0cd7546b5a8da2036cb4da58d40ac008ae51f6`
- `renovate-run-1d` — `5f613d7b095adfa68584689d37035f14804342d8947069a432119c70ce0a6610`
- `merge-plugin-pr-1` — `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `merge-apm-pr-1` — `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `claude-marketplace-update` — `79b0c7ad4f483642487cdb4d0580aef30bfb4c471a7e48c7e3f982fe7c5e3c26`
- `claude-plugin-update-to-1.9.1` — `959fd3f1d170e90a188dffc217ec13229788216a33a41f3b8980d5ffe3e2e8a4`
- `claude-plugin-status-1.9.1` — `8b7f9bdaf6e352b357dc706d2db006d1ebfeefe9b8281952d4ac83963ba92140`
- `claude-plugin-validate-1.9.1` — `1c37fac24d2beaa2ed7f67c729dd99a1d573500c3dc39f7852670668ff88409e`
- `apm-install-1.9.1-after-merge` — `20985b17d0dabea5ceaf440cf5eaa76c693d1057cd1286852cbdbc38951167e9`
- `rollback2-claude-marketplace-update` — `79b0c7ad4f483642487cdb4d0580aef30bfb4c471a7e48c7e3f982fe7c5e3c26`
- `rollback2-claude-plugin-install` — `8342aa33332be870914a607f83e74c51dd33c6b04a8015a0e0973e959f661afd`
- `rollback2-claude-plugin-update` — `c8fbf4bf965ff5857bf07bbb32b323f82d683c0a67e6d63dc1e0d5fc5a078672`
- `restore2-claude-marketplace-update` — `79b0c7ad4f483642487cdb4d0580aef30bfb4c471a7e48c7e3f982fe7c5e3c26`
- `restore2-claude-plugin-update` — `959fd3f1d170e90a188dffc217ec13229788216a33a41f3b8980d5ffe3e2e8a4`
- `rollback2-apm-install` — `2cf79d898809070ca46f0f73f2ec9d004bf203cf001936321d91a7f7c70d81d7`
- `restore2-apm-install` — `e524bcd90c3913e7abbcd336aa42aebf01d0118847d7aab783a8783357f1e8f8`
- `leak-gate-consumer-plugin` — `e55d43828bd7f26859d69611bed635738fd9a56c827b9a2837c3ac0e49040cad`
- `leak-gate-consumer-apm` — `826f849511c7c536df2574fcea0bf0415f6e0012f0697c47f8f3ad31138c16db`
- `renovate-run-2` — `8576508e4bc89886a07e61ff7a92a6a955f2d0f703dbf36798e9f5390e356fe2`
- `leak-gate-checkout-with-record` — `964fc782de79228bb801129a6a2f601b6defe5fb619b672a118bf13bdff7ea55`
- `consumer-check-with-fixed-engine` — `cfd1fc13f2ee819c78b22ced807868a263f644b7ae7ef9ff606fdc00e3e010d0`
- `consumer-sync-with-fixed-engine` — `ea03e9f2aaa0f44521535b6d19d0c6515303b54d62eb3a678f91d2f0ab216a74`
- `consumer-check-after-sync` — `99617cecb9e4d6b1cc29caff6ebca15abd0b7f0505e2212499156ddfb6a7d4b3`
