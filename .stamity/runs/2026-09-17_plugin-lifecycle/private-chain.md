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
| 11 | In the private mirror, `node scripts/upstream.mjs integrate` against the next upstream tag with a consumer manifest carrying `ruleDelivery`, the update pull request deleted once so the recovery path rebuilds it | (after the `v1.9.0` tag exists) | `2026-09-22T23:37Z`–`2026-09-23T01:40Z` · the fork's `main` gained the lane configuration and a manifest carrying `ruleDelivery` (`c3c8a37`); `status` → `update-available`, `v1.9.0` the one candidate, nothing affected; `integrate --release v1.9.0` · exit 1 · `5384cf47c4b4…` — **`validation-failed`**: a clean merge (no conflict, all seven regenerate commands passed) whose gate found 9 failures in two suites that shipped in 1.9.0 (fact 8 below); the real workflow, dispatched with the pull-request setting off, pushed the owned branch at `10d6b6c` and was refused `gh pr create` (run 1); with the setting corrected a second dispatch left the branch untouched, proved ownership and rebuilt the missing pull request as #3 at `10d6b6c` (run 2); the hourly schedule's repeat touched nothing (run 3). Every command is in the section below. |

## The twelfth step — the upstream lane in the private fork (2026-09-22T23:37Z–2026-09-23T01:40Z)

Run after the tag by a background agent of the session-4 orchestrator, in a clone of the private mirror at
`<work>/fork` (`origin` the mirror, `upstream` https://github.com/zomarit/stamity), with the same `gh` login; the
three workflow runs are the mirror's own Actions, not a simulation. The session's process was killed at 00:13:11Z by
an unrelated command on the workstation while the agent waited for the hourly schedule; a fresh session finished
the step from the on-disk state at 08:11Z, when the scheduled run it was waiting for had long run (01:30Z; 11f).

The fork's `main` was the shipping candidate `37e8976` plus the identity commit `16d0fd5`, and `v1.9.0` = `719ea79`
contains `37e8976`, so the release was a genuine next release for the fork, not a replay.

### 11a — the lane configuration and the consumer manifest

`.stamity/upstream.json` was written from the guide's "Start from these values for a fork of this repository" block
verbatim, except that the example `shadows` entry (`packs/acme/rules/acme-secrets.md`) was dropped: it names a file
this fork does not carry, and `shadows` is the one key the lane cannot derive. `remote`, `branch` and `releases`
keep their defaults; the gate is the guide's `npm ci --ignore-scripts && npm run check`; the seven `regenerate`
commands and the fifteen `generatedPaths` globs are the guide's lists unchanged. The fork's `.stamity/manifest.json`
had no `ruleDelivery` key, so the fork's own built CLI set it, as a consumer would; the effective value did not
change (`on-demand -> on-demand`), so only the manifest gained the key — a manifest that carries `ruleDelivery`
through the merge, not one whose delivery mode moves under it.

| Step | Command | Exit | Output sha-256 | Facts |
|---|---|---|---|---|
| 11a-build | `npm run build` | 0 | `95558a1e18fe…` | the fork's own CLI built |
| 11a-config-set | `node dist/cli.js config set ruleDelivery on-demand` | 0 | `10071e52639d…` | `set ruleDelivery: on-demand -> on-demand`; the manifest gains `"ruleDelivery": "on-demand"` |
| 11a-commit | `git -c user.name=… -c user.email=… commit -- .stamity/upstream.json .stamity/manifest.json` | 0 | `69129f3d6e7e…` | `c3c8a37` on `main`, 2 files, +24/−1, staged by explicit path |
| 11a-push | `git push origin main` | 0 | `605aeeeae15c…` | `16d0fd5..c3c8a37`; committing the configuration is what turns the lane on |

### 11b — status

| Step | Command | Exit | Output sha-256 | Facts |
|---|---|---|---|---|
| 11b-status | `node scripts/upstream.mjs status` | 0 | `de0299d92a00…` | `update-available` |
| 11b-status-json | `node scripts/upstream.mjs status --json` | 0 | `988af65c7bca…` | the same as one document |

Integrated: `v1.8.0` (`e79dcf0`) with no record — ancestry without a record counts as integrated (the lane's
invariant 2, the reason a fork's pre-lane history is not offered again). Target `v1.9.0` (`719ea79`), the one
candidate, none skipped. Divergence: 2 commits on the target not in the release (the identity commit and 11a's),
26 in the release not on the target. Affected: empty on all four rows — the release touches no path the fork
changed, watches or shadows; this fixture's customization is an identity rename and the lane configuration, and
neither collides.

### 11c — integrate

| Step | Command | Exit | Output sha-256 | Facts |
|---|---|---|---|---|
| 11c-integrate | `node scripts/upstream.mjs integrate --release v1.9.0` | 1 | `5384cf47c4b4…` | **`validation-failed`** — a clean merge whose gate failed |
| 11c-gate-diagnosis | `npx vitest run test/ci/` (in the update worktree) | 1 | `c154a90af985…` | 9 failed, 742 passed, 18 skipped across 2 files; an earlier attempt at 23:42:32Z (`04a01ed3fd35…`) never ran the suite — this tree has no reporter named `basic` — and is void |

What the lane produced, all as documented: the update branch `stamity-upstream/v1.9.0`, cut from the target head
`c3c8a37` in its own ignored worktree under `.stamity/upstream-work/v1.9.0/`; the merge commit `92ffee3` with the
parents `c3c8a37 719ea79`, the subject `Merge upstream release v1.9.0 into main` and the trailers
`Stamity-Upstream-Release: v1.9.0`, `Stamity-Upstream-Commit: 719ea79`, `Stamity-Upstream-Gates: failed`; **no
conflict** (`"conflicts": []`), the paths the identity commit had touched included (`package.json`, the presets,
the generated manifests) — they are `generatedPaths`, regeneration rewrote them from the merged sources, and nothing
was offered to a person, so no `continue` route was needed; all seven regenerate commands passed and no rewritten
path fell outside a `generatedPaths` glob; the integration record committed in the merge commit itself at
`.stamity/upstream/integrations/v1.9.0.json` (`targetHead: c3c8a37`, `mergeBase: 37e8976`, `covers: ["v1.9.0"]`,
`gates: "failed"`, the gate's `exitCode: 1` after 199 s, empty `conflicts` and `affected`).

The gate's 9 failures are one defect, and it is upstream's (fact 8 below). The branch was deliberately left at the
lane's merge commit: the documented repair for `validation-failed` is "fix the branch, then `validate`", which
commits a fresh record and moves the head off the merge commit, while 11e's recovery proves ownership by requiring
the remote head to be the lane's merge commit with exactly the expected parents. `validation-failed` does not stop
the rest of the step: `publish` treats it like `integrated` for the push and the pull request and only sets the run
red afterwards, so 11d and 11e ran on the real route and the recovery carries a `failed` gate verdict.

### 11d — the pull request that was never created

The workflow runs on `workflow_dispatch` (inputs `release`, `dry_run`) and hourly at minute 17; Actions are enabled
on the mirror, so the step dispatched the real workflow. The setting under test was already in the state the guide
describes as the failure case, so it was recorded rather than manufactured.

| Step | Command | Exit | Output sha-256 | Facts |
|---|---|---|---|---|
| 11d-setting-before | `gh api repos/<owner>/stamity-plugins-mirror/actions/permissions/workflow` | 0 | `f6e178fc1e56…` | `default_workflow_permissions: read`, `can_approve_pull_request_reviews: false` — "Allow GitHub Actions to create and approve pull requests" is off |
| 11d-dispatch | `gh workflow run upstream-update.yml --ref main -f release=v1.9.0 -f dry_run=false` | 0 | `e3b0c44298fc…` | run 1 queued |
| 11d-run1-result | `gh run view <run 1> --json status,conclusion,jobs` | 0 | `36a488223c83…` | `probe` success, `prepare` success, `publish` failure |
| 11d-run1-publish-log | `gh run view <run 1> --log --job=<publish>` | 0 | `4461db9f6263…` | the platform's refusal, verbatim |

Run 1 did the documented sequence: `probe` read the configuration (`enabled=true`, integration branch `main`);
`prepare` ran with `contents: read`, `persist-credentials: false` and no secret, integrated `v1.9.0` and bundled the
branch (its own exit is success — `validation-failed` is a result the trusted job acts on); `publish` noted that no
`STAMITY_UPSTREAM_TOKEN` is configured and reported `Unverified settings for main: active branch rulesets classic
branch protection (Administration: read required)`, carrying that limitation rather than guessing; the branch was
pushed (`Restored stamity-upstream/v1.9.0 at 10d6b6c`, `Pushed stamity-upstream/v1.9.0 to origin`); `gh pr create`
failed with `GraphQL: GitHub Actions is not permitted to create or approve pull requests (createPullRequest)` and
the job named the setting to correct; the verdict step then added the `validation-failed` error. The retained
`publish-result.json` reads `{"action": "creation-failed", "branch": "stamity-upstream/v1.9.0", "commit":
"10d6b6c…", "pullRequest": ""}` — the state the recovery path exists for: an owned update branch at `10d6b6c` and
zero pull requests with that head. With the repository's default workflow permission at `read` the push still
succeeded, because the job declares `contents: write` for itself; only the pull-request setting was load-bearing
for the refusal, and it is the one setting the guide names.

The runner's preparation and the workstation's agree: the workstation merge (`92ffee3`, macOS) and the runner's
(`10d6b6c`, ubuntu-latest, Node 22.22.2) have the same parents, subject and trailers, and their trees are
byte-identical outside `.stamity/upstream/integrations/v1.9.0.json` and `.stamity/manifest.json`, whose one
difference is `updatedAt` — the regenerate list reproduces across hosts.

### 11e — the recovery rebuilds the missing pull request

| Step | Command | Exit | Output sha-256 | Facts |
|---|---|---|---|---|
| 11e-setting-enable | `gh api -X PUT repos/<owner>/stamity-plugins-mirror/actions/permissions/workflow -f default_workflow_permissions=write -F can_approve_pull_request_reviews=true` | 0 | `e3b0c44298fc…` | the correction (an empty body) |
| 11e-setting-after | `gh api repos/<owner>/stamity-plugins-mirror/actions/permissions/workflow` | 0 | `9f263c5d304d…` | `write`, `true` |
| 11e-dispatch | `gh workflow run upstream-update.yml --ref main -f release=v1.9.0 -f dry_run=false` | 0 | `e3b0c44298fc…` | run 2 queued |
| 11e-run2-result | `gh run view <run 2> --json status,conclusion,jobs` | 0 | `cb3c6c73b423…` | `Open or update the pull request` success; the run red from the `validation-failed` verdict alone |

Before creating anything, the recovery proved: the branch was already on the remote, so nothing was pushed
(`pushed=false`) and the remote head stayed `10d6b6c` — the workflow has no force flag anywhere; the lookup over
`head=<owner>:stamity-upstream/v1.9.0`, state `all`, returned 0; ownership against the remote branch as inert
objects — the merge's parents equal `<target head> <release sha>`, its subject matches, and both integration records
name the same release, release commit, target branch and target head; the two records are semantically identical
once `createdAt` and every `durationMs` are dropped (both `gates: "failed"`); the manifests differed on exactly one
line, `updatedAt`, both passed the timestamp-shape and canonical-JSON checks, and their comparable forms were equal —
so the masked comparison ran rather than being skipped; the rest of the tree compared exactly; the release touches
nothing under `.github/workflows/`, so the reviewed-push refusal did not apply. The recovered pull request is **#3**
(`chore(upstream): integrate v1.9.0`, base `main`) with its head at `10d6b6c` — run 1's retained commit, not run 2's
fresh merge; `publish-result.json` records `"action": "recovered"`. Its body opens with the landing-policy note, then
`## Recovered upstream v1.9.0 pull request`, the retained branch and sha, the release commit `719ea79…`,
`Recorded gates: **failed**`, and the retained integration record inline.

The orchestrator's brief expected the recovered body to carry `<!-- stamity-upstream-lane: v1.9.0 … -->`. It does
not, and should not: the lane writes that marker into issue bodies only (the `reviewed-push` and `conflict` kinds),
because an issue has no stable identity but its editable title, while a pull request is found by its head ref — the
guide says the same ("The lane finds its own issues by a marker it writes into the body"). Measured: zero
occurrences in either body; the recovered body does name the retained remote sha.

### 11f — the hourly schedule's unchanged repeat

| Step | Command | Exit | Output sha-256 | Facts |
|---|---|---|---|---|
| 11f-scheduled-run-result | `gh run view <run 3> --json event,status,conclusion,createdAt,headSha,jobs` | 0 | `a42212b2a51c…` | `schedule`, 2026-09-23T01:30:04Z at `c3c8a37`; `probe` and `prepare` success, `publish` failure at its verdict step only |
| 11f-scheduled-publish-log | `gh run view <run 3> --log --job=<publish>` | 0 | `bf75fbea4053…` | `origin already has stamity-upstream/v1.9.0, so this run did not touch it`; #3 `was left unchanged: no title, body, comment or label edits`; then the `validation-failed` error |

The schedule prepared a merge of its own and pushed none of it: the remote branch is still `10d6b6c`, #3 is still
the only pull request with that head, and nothing was edited — the repeat of an unchanged release is inert, and red
for as long as the gate verdict is `failed`.

### Deviations from the plan cell

- The cell says to delete the update pull request once so the recovery rebuilds it. GitHub cannot delete a pull
  request, only close it, and the lane's lookup (state `all`) finds a closed one and preserves it rather than
  rebuilding; so the missing pull request was produced the way it arises in the field — the creation refused by the
  repository setting (11d), then corrected (11e).
- The cell expects the integrate to succeed; it ended `validation-failed` on an upstream defect (fact 8), and the
  recovery was walked with that verdict. The step's `Not done` lines are with V4's others below.

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
8. **A renamed fork's inherited gate is red on `v1.9.0`.** The guide says a rename needs no test edit and that the
   inherited gate is green on a fork's tree for the same reason it is green upstream. On the fork of the twelfth
   step, the gate on the merged tree failed 9 cases in two suites that shipped in 1.9.0 —
   `test/ci/pluginDistribution.test.ts` (7: the catalogs' owner, the release manifest's install spec, the README's
   APM and Codex routes) and `test/ci/pluginPackages.claude.test.ts` (2: the author name, the marketplace route) —
   because both assert the canonical publisher and routes as literals over values the product derives from the
   checkout's own `stamity.publisher` and `repository.url`. Neither suite imports `test/support/identity.ts`, whose
   header records this class (the audit's FORK-3) and its rule; `test/ci/forkIdentity.test.ts` missed it because its
   always-on check read `test/cli` only and its renamed-copy run covers a hand-kept list without these two. Fixed on
   `main` after the release (ledger `prove/328`; the lane `p15s4/forktests`, pull request #50, merged by rebase as `60f13d6`, `cf5c26e` and `5e12096`); a fork integrating `v1.9.0` meets these 9 cases until the
   next release carries the fix.

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

## The Codex half (E3), 2026-09-24

Run by an implementer agent of the Package 16 session-2 orchestrator (plan 010, unit `e3-codex-remote-walk`) on
this machine, with the maintainer's own GitHub login through the `gh` credential helper that `gh auth setup-git`
installs: git over a plain `https://github.com/…` url authenticated through it, no token was passed in any argv or
environment variable, and Codex itself was never logged in — no `auth.json` exists in either scratch home, and both
homes were deleted at the end. The real `HOME` was kept, because git reads its credential helper from
`$HOME/.gitconfig`. Placeholders, local to this section: `<owner>` as above; `<work>` the scratch directory outside
every checkout; `<home1>` and `<home2>` the two scratch `CODEX_HOME` directories under it; `<root>` the installed
root `<home1>/plugins/cache/stamity/stamity/<version>`; `<consumer>` a consumer repository under `<work>`. Nothing
was pushed to the mirror or to either consumer. Each step carries its UTC time in the facts, its exit code and the
sha-256 of its raw capture (stdout and stderr together; the first twelve hex digits here, the full digests at the
end); only placeholder-rewritten fragments are quoted.

The mirror at the walk: private, default branch `main` = `c3c8a37` (11a's commit), `plugin-dist` = `plugins/v1.9.1` =
`b567f3a9…`, `plugins/v1.9.0` = `bbd0c962…` — the distribution refs of step 1, unchanged, so nothing was rebuilt.

| Step | Command | Exit | Output sha-256 | Facts |
|---|---|---|---|---|
| E3-P1 | `gh auth status` | 0 | `cf47ae67b35d…` | `2026-09-24T11:11:42Z` · logged in (keyring), git protocol https; the credential helper `gh auth git-credential` is configured for `https://github.com` (the prerequisite was already in place and was checked before C1; this capture is the recorded re-run) |
| E3-P2 | `gh repo view <owner>/stamity-plugins-mirror --json visibility,defaultBranchRef` | 0 | `e40fa2a15938…` | `2026-09-24T11:11:42Z` · `PRIVATE`, default branch `main` |
| E3-P3 | `git ls-remote https://github.com/<owner>/stamity-plugins-mirror.git …` | 0 | `07e7da81e98e…` | `2026-09-24T11:11:43Z` · the four refs above |
| E3-C1 | `codex --version` | 0 | `556478dd38e6…` | `2026-09-24T11:08:37Z` · `codex-cli 0.155.1` |
| E3-C2 | `CODEX_HOME=<home1> codex plugin marketplace add <owner>/stamity-plugins-mirror --ref plugins/v1.9.0` | 0 | `bf5c416d958c…` | `2026-09-24T11:08:38Z` · `` Added marketplace `stamity` from https://github.com/<owner>/stamity-plugins-mirror.git#plugins/v1.9.0. ``; the root is a git checkout at `<home1>/.tmp/marketplaces/stamity`, HEAD `bbd0c962…`, carrying `.agents/plugins/marketplace.json` (one `local` entry, `./codex`); `config.toml` gained `[marketplaces.stamity]` with `source_type = "git"`, the https source and `ref = "plugins/v1.9.0"`. The shorthand was not refused for authentication, so C2b (the url form) was not needed and did not run |
| E3-C3 | `codex plugin add stamity@stamity` | 0 | `b5253d537bb8…` | `2026-09-24T11:08:51Z` · `Installed plugin root: <home1>/plugins/cache/stamity/stamity/1.9.0`; no login asked |
| E3-C4 | `codex plugin list --json` | 0 | `0423ddf5399d…` | `2026-09-24T11:08:51Z` · `stamity@stamity`, `version` `1.9.0`, installed and enabled, `source` local at the marketplace root's `codex`; `marketplaceSource` names the https url and **no ref** |
| E3-C5a | `ls -1 <home1>/plugins/cache/stamity/stamity/` | 0 | `30f4611383aa…` | `2026-09-24T11:09:10Z` · exactly one directory, `1.9.0` |
| E3-C5b | `node <work>/compare.mjs <root> <archive>/codex`, the archive being `git archive plugins/v1.9.0 codex` from a bare clone of the mirror | 0 | `9cfa95549596…` | `2026-09-24T11:09:10Z` · `runtime: 636 files compared, equal` · `rest: 45 files compared, equal` · `codex/ tree (681 cache files, 681 archive files): equal`. The comparison script (sha-256 `3cb44d3b8b01…`) walks both trees, hashes every file (a symlink by its target), and reports files only in one tree and files that differ, `runtime/` separately; its control is E3-C7f-control |
| E3-C6a | `git clone https://github.com/<owner>/stamity-consumer-plugin.git <consumer>` · `node <root>/runtime/locate.mjs --project <consumer> -- plugin setup --client codex -y` | 0 · 1 | `e3b0c44298fc…` · `b6ee3a3a0099…` | `2026-09-24T11:09:15Z` · the fresh clone at `b85c9eb`; `2026-09-24T11:09:20Z` · **exit 1**: `error: a generated setup exists; run npx @zomarit/stamity clean -y, then npx @zomarit/stamity plugin setup --client codex` — the plugin consumer already carries the Claude setup of step 3b, and a plugin-backed setup refuses a repository that has one (fact E3-6) |
| E3-C6b | `node <root>/runtime/locate.mjs --project <consumer> -- plugin setup --client codex -y`, `<consumer>` now a fresh repository (`git init`, one commit) | 0 | `9a180a8e80e0…` | `2026-09-24T11:09:38Z` · `wrote 13 file(s): 13 created`, plugin-owned `codex: skill, hooks`; `.codex/config.toml` holds `[features]` `hooks = true` |
| E3-C6c | `node <root>/runtime/locate.mjs --project <consumer> -- check` | 0 | `9a36476f50ae…` | `2026-09-24T11:09:43Z` · drift clean, manifest tools `codex`, 13 ledger rows; `warn plugin-runtime  no plugin root in the environment; run this check through the plugin's st-setup or set CLAUDE_PLUGIN_ROOT` — `prove/337` reproduced on a 1.9.0 root (not a blocker; the warning names the Claude variable on a Codex-only consumer) |
| E3-C7a | `codex plugin remove stamity@stamity` | 0 | `a9ef13897829…` | `2026-09-24T11:09:50Z` · `` Removed plugin `stamity` from marketplace `stamity`. ``; the `1.9.0` cache directory is gone (the empty `cache/stamity/` parent stays) |
| E3-C7b | `codex plugin marketplace remove stamity` | 0 | `f77c5d85fcf4…` | `2026-09-24T11:09:51Z` · `` Removed marketplace `stamity`. `` and `Removed installed marketplace root`; `config.toml` left at 0 bytes |
| E3-C7c | `codex plugin marketplace add <owner>/stamity-plugins-mirror --ref plugins/v1.9.1` | 0 | `8e176a351e5b…` | `2026-09-24T11:09:57Z` · added from `…stamity-plugins-mirror.git#plugins/v1.9.1` |
| E3-C7d | `codex plugin add stamity@stamity` | 0 | `1b403718e1c8…` | `2026-09-24T11:10:01Z` · `Installed plugin root: <home1>/plugins/cache/stamity/stamity/1.9.1`; the one version directory `1.9.1`, `skills/fixture-marker/` present |
| E3-C7e | `codex plugin list --json` | 0 | `c96d6f8a0b53…` | `2026-09-24T11:10:01Z` · `stamity@stamity` at `1.9.1` |
| E3-C7f | `node <work>/compare.mjs <root at 1.9.1> <archive of plugins/v1.9.1>/codex` | 0 | `6037a0e7e8b1…` | `2026-09-24T11:10:08Z` · `runtime: 636 … equal` · `rest: 46 … equal` · `(682 cache files, 682 archive files): equal` |
| E3-C7f-control | `node <work>/compare.mjs <root at 1.9.1> <archive of plugins/v1.9.0>/codex` | 1 | `8bfa0b370411…` | `2026-09-24T11:10:08Z` · `DIFFERENT`: only in the cache `skills/fixture-marker/SKILL.md`; differing `README.md`, `plugin.json`, `stamity-plugin.json`; `runtime/` equal (the bundled runtime is 1.9.0 at both tags, fact 6) — the comparison distinguishes the two versions |
| E3-C7g | `codex plugin marketplace add <owner>/stamity-plugins-mirror --ref plugins/v1.9.0` over the recorded marketplace | 1 | `6e9e5ff82f7e…` | `2026-09-24T11:10:09Z` · **refused**: `Error: marketplace 'stamity' is already added from a different source; remove it before adding this source`; the recorded `ref` stays `plugins/v1.9.1`, the root's HEAD stays `b567f3a9…`, the installed version stays `1.9.1` (fact E3-4) |
| E3-C8a | `CODEX_HOME=<home2> codex plugin marketplace add <owner>/stamity-plugins-mirror` (no `--ref`) | 0 | `649e13d11d5e…` | `2026-09-24T11:10:19Z` · `` Added marketplace `stamity` from https://github.com/<owner>/stamity-plugins-mirror.git. ``; the root is a checkout of the default branch `main` at `c3c8a37` — the fork's source tree, which carries **no** `.agents/plugins/marketplace.json` and does carry `.claude-plugin/marketplace.json`; `config.toml` records no `ref` |
| E3-C8b | `codex plugin list --json --available` | 0 | `9ed45dc8f22b…` | `2026-09-24T11:10:32Z` · one available entry, `stamity@stamity` `1.9.0`, **`source` `npm`, `package` `@zomarit/stamity`, `version` `1.9.0`** — the entry of the default branch's Claude catalog |
| E3-C8c | `codex plugin add stamity@stamity` | 0 | `b3b6e24b3f47…` | `2026-09-24T11:10:33Z` · `Installed plugin root: <home2>/plugins/cache/stamity/stamity/1.9.0` |
| E3-C8d | `codex plugin marketplace list` | 0 | `c6180ce3e924…` | `2026-09-24T11:10:34Z` · `stamity` at `<home2>/.tmp/marketplaces/stamity` |
| E3-C8e | `node <work>/compare.mjs <home2 root> <npm pack @zomarit/stamity@1.9.0>/package` | 1 | `680a28ed6d31…` | `2026-09-24T11:10:55Z` · 228 files compared, all equal; only in the cache `.codex-plugin/plugin.json` (the client's own manifest, synthesized from the Claude catalog entry) — the cache is the **public npm tarball** (registry `https://registry.npmjs.org/`, tarball sha-256 `e7f6b2dfa48a…`) plus one client file |
| E3-C8f | `node <work>/compare.mjs <home2 root> <archive of plugins/v1.9.0>/codex` | 1 | `8d1dd5498134…` | `2026-09-24T11:10:55Z` · `DIFFERENT`: 229 cache files against the distribution root's 681; none of the root's `runtime/` |
| E3-C8g | `ls <home2 root>/runtime/locate.mjs <home2 root>/hooks` | 1 | `08eb2ae04729…` | `2026-09-24T11:11:11Z` · both absent — the Codex root README's setup line (`node <root>/runtime/locate.mjs …`) has nothing to run in this install. **C8's outcome: no catalog** — the documented no-`--ref` line finds no Codex catalog on the default branch, and what it installs is not the distribution's Codex root (fact E3-3) |
| E3-C8h | `codex plugin remove stamity@stamity` · `codex plugin marketplace remove stamity` · `codex plugin marketplace add <owner>/stamity-plugins-mirror --ref plugin-dist` · `codex plugin add stamity@stamity` · `node <work>/compare.mjs <home2 root at 1.9.1> <archive of plugins/v1.9.1>/codex` (beyond the cell: the branch form `e3-codex-install-ref` would print) | 0 · 0 · 0 · 0 · 0 | `a9ef13897829…` · `f454cac01a59…` · `ad72218880d7…` · `00331afa3e8e…` · `6037a0e7e8b1…` | `2026-09-24T11:11:25Z`–`11:11:32Z` · added from `…#plugin-dist`, `ref = "plugin-dist"` recorded; installed `1.9.1`; the comparison `equal` over 682 files (the same output digest as E3-C7f) — the distribution-branch form works |
| E3-C9 | Skill discovery in a Codex session | — | — | **not-run**: it needs a Codex login in a scratch home, which this walk does not create (`auth.json` is never persisted), and a headless `codex exec` is not evidence for a session's view (the learning `codex-hooks-need-the-features-flag-and-exec-runs-none`) |
| E3-C10 | `node scripts/leak-gate.mjs` (the checkout with this section present) | 0 | `61457603d0e0…` | `2026-09-24T11:13:51Z` · `leak-gate: PASS - 0 hits for 18 rule(s) across 1638 file(s)`, with this section and its digests present (the run before this row and its digest line were filled in); a hand sweep of every added line for the shapes the gate does not catch — the real owner, the maintainer's name, e-mail, absolute paths, token prefixes, the private layer's name — found 0 hits |

### Facts the Codex walk measured that differ from the docs (handed to `e3-codex-install-ref` and `docs-guides`)

- **E3-1. Codex's remote form runs against a private mirror.** `docs/plugins.md` says "Codex's remote form has not run
  at all". On codex-cli 0.155.1 the `<owner>/<repo> --ref <ref>` shorthand cloned the private mirror through the git
  credential helper, with Codex not logged in and no token in any argv, and installed a root whose per-file sha-256
  map equals the tag's `codex/` tree (681 files at `plugins/v1.9.0`, 682 at `plugins/v1.9.1`).
- **E3-2. Where Codex keeps a git marketplace.** The checkout lands at `$CODEX_HOME/.tmp/marketplaces/<name>`, and
  `config.toml` records `[marketplaces.<name>]` with `source_type`, the https `source` and the `ref`; installs land
  under `$CODEX_HOME/plugins/cache/<marketplace>/<plugin>/<version>/`, as the docs say for `~/.codex`. `plugin list
  --json` names the marketplace's source without its ref, so the ref is read from `config.toml`.
- **E3-3. The documented install line without `--ref` installs the public npm package, not the distribution.** The
  Codex root README (`scripts/plugins/clients/codex.mjs:158`) and `docs/plugins.md:232` print `codex plugin
  marketplace add <owner>/<repo>` with no `--ref`. Against the mirror that form exits 0 and checks out the default
  branch, which carries no Codex catalog; codex-cli 0.155.1 then reads the branch's Claude catalog
  (`.claude-plugin/marketplace.json`), whose entry is sourced from npm, and `plugin add` exits 0 with a root that is
  the public registry's `@zomarit/stamity@1.9.0` tarball plus a synthesized `.codex-plugin/plugin.json` — no
  `runtime/`, no `hooks/`, no locator. Nothing in the output says the catalog was not the Codex one. For a private
  fork this silently swaps the private source for the public registry. The distribution README's form
  (`scripts/build-plugin-distribution.mjs:295`, `--ref <distribution branch>`) works (E3-C8h), and so does a tag.
- **E3-4. Re-pointing a recorded git marketplace is refused, not answered "already added".** `docs/plugins.md`
  (`:411-416`) calls the re-point unmeasured and guesses that "already added" may leave the ref where it was. On
  0.155.1 `marketplace add … --ref plugins/v1.9.0` over a marketplace recorded at `plugins/v1.9.1` exits 1 with
  `marketplace 'stamity' is already added from a different source; remove it before adding this source`, and the
  ref, the checkout and the installed version stay where they were. The four-command route back with
  `marketplace remove` first is therefore required, and it works: remove, remove, add at the other ref, add.
- **E3-5. `plugin remove` and `marketplace remove` clean up after themselves.** The first deletes that version's
  cache directory (leaving the empty `cache/<marketplace>/` parent), the second deletes the marketplace checkout and
  its `config.toml` table — measured on 0.155.1, where the docs' route-back walk measured only 0.154.0's `plugin
  remove`.
- **E3-6. A consumer that already has a generated setup refuses a second client's plugin setup.** `plugin setup
  --client codex` on the Claude plugin consumer exits 1 and names `clean -y`, then a setup with the client list; a
  repository that wants both clients runs one `plugin setup --client claude,codex` (`docs/plugins.md:450`), which
  this walk did not run. The Codex setup here ran in a fresh repository instead.

### Deviations from the plan cell

- The cell names "a fresh consumer clone". The fresh clone of `stamity-consumer-plugin` refused the Codex setup
  (E3-C6a, fact E3-6), so C6 ran in a fresh empty repository; the refusal is recorded as its own row.
- Beyond the cell: the control comparison (E3-C7f-control), the npm and root comparisons and the locator check that
  settle what C8 installed (E3-C8b–E3-C8g), and the distribution-branch form (E3-C8h), which the dependent unit
  `e3-codex-install-ref` needs for its edge case.

## Not done — owner-dependent

- Not done: required-check enforcement on the private plan — owner-dependent (the fixture repositories carry no
  branch protection; the pull requests merged without a check).
- Not done: the enterprise's own catalog approval — owner-dependent (the merge here was the orchestrator's click,
  standing in for the organization's review).
- Not done: network mirroring of the distribution to a host that is not github.com — owner-dependent (the mirror is
  a GitHub repository under the maintainer's account).
- Not done: the Cursor half of the private route — the plan's V4 cell walks the Claude project-scope route, the
  Copilot marketplace add and install, and the APM route, and the Codex half was walked on 2026-09-24 (the section
  above); the Cursor route is measured by the lifecycle proof (`H5`) and the route smoke (`H4b`, `H4d`) against the
  public distribution shape, not against the private mirror, and its team marketplace is not walked at all.
- Not done: skill discovery in a Codex session on the private route (E3-C9) — it needs a Codex login in a scratch
  home and a person's interactive session.
- Not done: the no-`--ref` form against this repository's own public slug — E3-3 was measured on the mirror only; the
  checkout's default branch carries the same npm-sourced Claude catalog and no Codex catalog, so the same outcome is
  expected by construction, not measured.
- Not done: the Copilot update path on the private mirror — its command is the same as the public one and was not
  walked (stated by the plan).
- Not done: the vendor-side effect of a project-declared `extraKnownMarketplaces` at session start (fact 1) — a
  person's interactive session.
- Not done: the update pull request's own CI and its landing — owner-dependent (with the per-run token its
  `pull_request` runs wait for "Approve and run"; the fixture has no required checks; a `validation-failed` update is
  not merged here).
- Not done: the `STAMITY_UPSTREAM_TOKEN` route of the twelfth step — owner-dependent (the organization's fine-grained
  token or App installation token; the per-run token route was walked).
- Not done: the landing-policy read of the fork's `main` — owner-dependent (`Administration: read` is outside the
  per-run token; the pull request carries the limitation, as the guide says).
- Not done: the `validate` repair of the `validation-failed` update branch — deliberately not walked (it moves the
  head off the lane's merge commit, which the recovery's ownership proof needs); the fork's route is the next
  release's `integrate`, or before it the fix taken onto the update branch and `validate`.

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
- `11a-build` — `95558a1e18fe0768c356b9c24f1bc7627c8eb69f54665d9e26274a9d5fd5de54`
- `11a-config-set` — `10071e52639d23d3d8e26559889117fb3fa85d5e09930f4a7cf98cd084f13088`
- `11a-commit` — `69129f3d6e7e5950bcb995dd6ff208518261d896f5307b58d119e2b54ab6210b`
- `11a-push` — `605aeeeae15c024cae962f123d3485c0d8f5ed3bc76f8fbb1b64c0f642934be1`
- `11b-status` — `de0299d92a00bc305bc647762927760081b8eaee2fcf6782aaad6f2bcfa99b13`
- `11b-status-json` — `988af65c7bca188aa5ab76806602555574d5fd4aaf0623af38378406cb6657b6`
- `11c-integrate` — `5384cf47c4b47cc419e6f425e1eadc0a4adee3225a0b2ecc40bd8977cb39a512`
- `11c-gate-diagnosis (void)` — `04a01ed3fd351cef91321e596befed9bb9ac7552768e212a61ccfac0e202eb07`
- `11c-gate-diagnosis` — `c154a90af985d195d643a334068217f7297e47fed66034385d1cb22b41f2811c`
- `11d-setting-before` — `f6e178fc1e56cf43900da383f85398b61de9ae61c6b8433116c1856605745924`
- `11d-dispatch` — `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `11d-run1-result` — `36a488223c83734c5b725feee3c03694dc06b13a3cc16e4ab16fa365d258531b`
- `11d-run1-publish-log` — `4461db9f62634c5d68ac9aca128e65856f3c3aa9f3ee17ef072c2e0f273efe9c`
- `11e-setting-enable` — `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `11e-setting-after` — `9f263c5d304d754ff60c2e9169ce460ff1910b1cb15e80a8c0699b6a9170c66b`
- `11e-dispatch` — `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `11e-run2-result` — `cb3c6c73b423575ca9ca21fc98f97b2eeef72d2e081f2fada573d38fc6511cdc`
- `11f-scheduled-run-result` — `a42212b2a51c7db4af16a402acbfa29029707ce686215e9fe80f6237c5263eac`
- `11f-scheduled-publish-log` — `bf75fbea4053705f95e380b3ccbc9722736590d5596042cb6203cc7c82800c55`
- `E3-P1-gh-auth-status` — `cf47ae67b35d5c6ed6ca4684312aaf54296d49704e54bbafe6d7ffa8a26d19e9`
- `E3-P2-gh-repo-view` — `e40fa2a15938fd3021ba47cec8e19588b00b35df25c794e4353e7b4aa3e242e6`
- `E3-P3-ls-remote` — `07e7da81e98e3f6d31c2d8fb5edac83fa8d57d30c0b7e8239fc2c951c2dbaca7`
- `E3-C1-codex-version` — `556478dd38e6185a3ceef8e5237286acd48d89da460cdbbc054ce7230b0caced`
- `E3-C2-marketplace-add-ref-1.9.0` — `bf5c416d958c7dc6193647b58421e7b52a13314cdd756e9b3ff703932f667179`
- `E3-C3-plugin-add` — `b5253d537bb85feb63d7ede907f03bbde56e7ce35621d18dcb973aca7437fa38`
- `E3-C4-plugin-list-json` — `0423ddf5399de14cd94a4807c868f2cd5b97451fe9b300290db4d7952862ba91`
- `E3-C5a-cache-dir-count` — `30f4611383aa30a15753789f40effde81332f2f8714e6d3b2940bf0fc4592377`
- `E3-C5b-sha-map-compare` — `9cfa95549596c4da8ae4d5c9a5dc4813aa573e793fad846bdc32f8c1cf74ee89`
- `E3-C6a-consumer-clone` — `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `E3-C6a-plugin-setup-codex-over-claude-setup` — `b6ee3a3a0099478ae8497ba6eb2478b69523ae54d09b527632c2d9b7d4c9cb1f`
- `E3-C6b-plugin-setup-codex` — `9a180a8e80e001950d6e5118a54aa0cd5d365b7f6eea633f1937d48ee7b9cfa6`
- `E3-C6c-check` — `9a36476f50ae23267d22d8ba1c86733cd099f82e27d314a73f840ad0f0aa4447`
- `E3-C7a-plugin-remove` — `a9ef13897829d6f41eca0024895e8ab75cf82644dc40d570994be23da0464b69`
- `E3-C7b-marketplace-remove` — `f77c5d85fcf4a923c5b0bfb9d25181bb554ed67133ed06d86718f7efec465f10`
- `E3-C7c-marketplace-add-ref-1.9.1` — `8e176a351e5b119968747cadb85d6138ae76c6ae34266b5dadca10d143ef13d0`
- `E3-C7d-plugin-add` — `1b403718e1c807de3165bb7e2fbfdfca5565de3ea307441018719f0f526ead74`
- `E3-C7e-plugin-list-json` — `c96d6f8a0b538308ec99ba668a67bd6d5c4446152ce49ae10f50a0f8e4115c20`
- `E3-C7f-sha-map-compare-1.9.1` — `6037a0e7e8b1e1de96c0ab9d353ce11078a75fa8ef31bf620930868999624ed8`
- `E3-C7f-control-1.9.1-cache-vs-1.9.0-archive` — `8bfa0b3704119f43b63033ddf7e874eefddf3e4f205bf386391a51b8f852c1aa`
- `E3-C7g-marketplace-add-ref-1.9.0-over-recorded` — `6e9e5ff82f7eeae4f1ecba5a2bf0b179dee6f7948501a24156ac0ce5432777be`
- `E3-C8a-marketplace-add-no-ref` — `649e13d11d5e7f90259542c6ebafeeb210176162c19150ff338d391619bf40f5`
- `E3-C8b-plugin-list-json` — `9ed45dc8f22b929e8a175fc84840a80f37fae1ec53318cc6eacf9e89f2545e85`
- `E3-C8c-plugin-add` — `b3b6e24b3f47597f3ffa20889b77d8edce402046c97339450df3306a6e83cd1c`
- `E3-C8d-marketplace-list` — `c6180ce3e9248956f5dca2c056e9aa1b214dc3eb05cf0b1259ca5a24064bea10`
- `E3-C8e-cache-vs-npm-1.9.0` — `680a28ed6d3106597d05759de20e273d767422a3b31d90535899a68d0219155b`
- `E3-C8f-cache-vs-mirror-codex-1.9.0` — `8d1dd5498134f3ccbea9f315d54bef55e458c69c1831a56a57c10c305cd93887`
- `E3-C8g-locator-present` — `08eb2ae047299f8c8353c6b2bdbe59eed1a6e5d4c2274e7e55c6c15622d6f559`
- `E3-C8h-plugin-remove` — `a9ef13897829d6f41eca0024895e8ab75cf82644dc40d570994be23da0464b69`
- `E3-C8h-marketplace-remove` — `f454cac01a59d221740501c39009108aa519a646193bf4a170231463b764ff98`
- `E3-C8h-marketplace-add-ref-branch` — `ad72218880d7c6094361e0815ffc197f3d8d9253f400fdc1ba80d2bc5b3772a7`
- `E3-C8h-plugin-add` — `00331afa3e8e56c8c6857804735b21a709d74697004505d3b33f6882ee9c80a6`
- `E3-C8h-sha-map-compare` — `6037a0e7e8b1e1de96c0ab9d353ce11078a75fa8ef31bf620930868999624ed8`
- `E3-compare-script` (the file `compare.mjs`) — `3cb44d3b8b01b07819cff25f6b71748bddd5a29fb76b2ec6ff7408451e2296a7`
- `E3-npm-tarball-1.9.0` (the file `zomarit-stamity-1.9.0.tgz`) — `e7f6b2dfa48abc463d1ae7d68fe055ca099bbb659cd5fa50f221b00028680754`
- `E3-C10-leak-gate` — `61457603d0e09a87f0748b437b26d9653ae46aeb8fc15ed28e8dc5629aa4c291`
