# QA walk-through — Package 15, session 2 (pull request #46; plan 008 file 1 batches B1–B3 and file 2)

Candidate: `95660ea` (the head of `package-15-plugin-lifecycle-2` after the deep-review fixer round).
Harness evidence: `.stamity/evidence/qa-95660ea.json` (the hooks lane and the site lanes, written by
`node scripts/qa/run.mjs --site website/build --sha <candidate>` with the four client binaries exported;
the earlier file at `27b1837` dropped because the candidate moved). Gate of record: the test-runner's full
gate in the pinned worktree `p15s2-gate` at the candidate (the run record's Prove section) and CI green on
every leg, Windows included, at `27b1837` and at the candidate (the record's CI sections).

## Rows derived (the triggers)

User-visible surfaces changed: the four generated plugin roots with one hooks convention and a container
manifest per client; the `stamity plugin` verb (`status`, `setup`); the two new `check` rows
(`plugin-runtime`, `plugin-duplicates`); the effort scale `minimal … max` with the per-client refusal; the
emitted hook commands re-rooted under the hook-scripts root; the bundled runtime and its locator; the
distribution root (archives, catalogs, `release.json`); the release workflow's plugin steps; the manifest's
`plugin` and `gates` fields with `config set gates.*`; `clean`'s and `sync`'s plugin-owned disclosures;
eleven documentation pages, README, `llms.txt` and the capability matrix's plugin section. Error and
fallback paths changed: the locator's refusals, the guard policy's single candidate and symlink refusal,
the probe's ceiling, the generator's refusals, the runtime builder's tar refusals, the apm identity match.
Config changed: two optional manifest fields (a clean `init`, a `sync` over the existing dogfood manifest)
and the `.gitignore` line for a symlinked `node_modules`. Security-adjacent paths changed: the symlink
refusals, the tar escape refusals, the credential-shaped identity refusal, the workflow's permissions and
pins, the publish job's ref guards, the doctor rows' foreign strings. Themes and breakpoints: the docs site
renders the changed pages at 375 and 1440 in light and dark.

## Appendix — rows auto-proven by artifacts that exist for this change

Each pointer is a test assertion in the candidate's tree plus the gate that ran it (`npm run test --
--coverage`, pass, by the runner and on every CI leg), or a harness row in the evidence file.

| # | Scenario | Proof |
|---|---|---|
| A1 | Every hook command in every plugin root resolves under that root's `hooks/`; no hooks document names `.stamity/generated` | `test/ci/pluginPackages.test.ts:361` (expects `:368`, `:378-379`) |
| A2 | Each root's capability file validates and its carried counts equal the files on disk | `test/ci/pluginPackages.test.ts:307` |
| A3 | The Copilot container manifest validates against the vendored Agent Plugins 1.0 schema; the four manifests the schema exists to refuse are refused by name | `test/ci/pluginPackages.copilot.test.ts:251`, `:265` |
| A4 | The Claude container manifest satisfies every rule of the vendored Claude schema | `test/ci/pluginPackages.claude.test.ts:355` |
| A5 | `plugin status` resolves the runtime through the root's own locator and reports the Node floor | `test/cli/commands/plugin.test.ts:281` |
| A6 | `plugin status` reads the root off the client's environment variable and marks the recorded client found | `test/cli/commands/plugin.test.ts:306` |
| A7 | `plugin setup` records `plugin.mode: plugin-backed` and the client's classes on the manifest | `test/cli/commands/plugin.test.ts:466` |
| A8 | `plugin setup` refuses over a generated setup (exit 1, the tree unchanged) | `test/cli/commands/plugin.test.ts:617` |
| A9 | `plugin-runtime` passes with a note when nothing is recorded; warns with the two routes when a recorded client has no root; fails with the locator's refusal only when a client is recorded, warns otherwise | `test/cli/commands/check.test.ts:1533`, `:1542`, `:1591`, `:1642` |
| A10 | `plugin-duplicates` warns under `generated` and fails under `plugin-backed` for the same rows, naming the source, the paths and the remedy | `test/cli/commands/check.test.ts:1830`, `:1846`; the paths at `:1918` |
| A11 | The manifest accepts the six-level effort scale and refuses a level outside it | `test/manifest/manifest.test.ts:437` |
| A12 | A level a client cannot carry falls to its nearest expressible entry; Copilot carries none | `test/roster/modelLadder.test.ts:725`, `:788` |
| A13 | The interchange commands are re-rooted to `${CLAUDE_PLUGIN_ROOT}/hooks/<script>`; script bodies stay byte-identical bar the guard line; user hooks untouched | `test/emit/hooksInfra.test.ts:930`, `:968` |
| A14 | The runtime prune keeps `dist/content/**` and prunes only under `node_modules` | `test/ci/pluginRuntime.test.ts:340` |
| A15 | A runtime built from the real npm tarball runs `init` in a scratch repository and emits an agent | `test/ci/pluginRuntime.test.ts:435` (runs when `dist/cli.js` is built; the runner builds first) |
| A16 | The locator resolves the bundled copy, and a bare runtime directory with no descriptor | `test/ci/pluginLocate.test.ts:207`, `:283` |
| A17 | A second build of one commit renders byte-equal archives, manifest, catalogs and README | `test/ci/pluginDistribution.test.ts:299` |
| A18 | `release.json` validates against its schema and names the branch, the tag, one package per client, the four catalogs and the runtime | `test/ci/pluginDistribution.test.ts:262` |
| A19 | Each vendor catalog carries the fields its reference page requires | `test/ci/pluginDistribution.test.ts:377`, `:418`, `:426`, `:446` |
| A20 | The release job verifies the distribution digest from the gates output before publishing and fails closed on an empty digest | `test/ci/workflow.test.ts:1857` |
| A21 | The archives are attested with a sha-pinned action under exactly the documented grants, between verify and push | `test/ci/workflow.test.ts:1890` |
| A22 | One orphan commit and a tag no re-run can move; an identical second run moves neither ref; a tag naming another commit refuses; a tag outside `plugins/v*` or a branch whose head is not an orphan refuses before any push | `test/ci/workflow.test.ts:1916`, `:2700`, `:2716`, `:2737`, `:2751` |
| A23 | The distribution artifact keeps its dot directories | `test/ci/workflow.test.ts:1809` |
| A24 | README states ten verbs, `llms.txt` indexes the same count, the doctrine page counts eleven guides and fourteen hand pages (derived from the arrays) | `test/docsPages.test.ts:967`, `:1011`, `:1578` |
| A25 | The committed capability matrix byte-matches a render whose plugin section comes from the container-facts builder | `test/emit/capabilityMatrix.test.ts:142` |
| A26 | `plugin` and `gates` serialise after `models`, each defect named at its path; an empty gates block moves no byte | `test/manifest/manifest.test.ts:925`; `test/emit/agentsMd.test.ts:196` |
| A27 | The four committed container manifests byte-match a regeneration; a seeded change is caught | `test/ci/pluginManifests.test.ts:224`, `:233` |
| A28 | The ownership pass drops the plugin-owned classes and hook rows and nothing else, end to end through `setup` | `test/emit/ownership.test.ts:204`; `test/cli/commands/pluginSetup.test.ts:420` |
| A29 | `clean` discloses plugin-owned files per recorded client and removes none inside a plugin; `sync` reports the plugin-owned line | `test/cli/commands/clean.test.ts:944`; `test/cli/commands/syncEngine.test.ts:903` |
| A30 | The locator exits 2 naming the floor, the found version and the install instruction; both probed paths when nothing resolves | `test/ci/pluginLocate.test.ts:344`, `:379` |
| A31 | A symlinked policy document is refused in both modes (`POLICY_INVALID`); a symlinked hook file or script is refused (`UNSAFE_PATH`) | `test/hooks/scripts.test.ts:2645`, `:2619`; `test/hooks/userHooks.test.ts:445`, `:461` |
| A32 | The probe settles as a timeout at the ceiling, and the driver process exits on its own while the grandchild still holds stdout | `test/cli/commands/check.test.ts:1435`, `:1472` |
| A33 | A corpus collision, an unknown substitution token, an unknown argument and a missing logo are refused before a byte is written; a planted symlink is named | `test/ci/pluginPackages.test.ts:640`, `:619`, `:484`, `:528`; `test/ci/pluginPackages.cursor.test.ts:543` |
| A34 | The tar reader exits 1 naming a symlink, a hard link, an absolute path, a backslash, a parent segment or an out-of-prefix entry | `test/ci/pluginRuntime.test.ts:232` |
| A35 | The apm identity match reports the slug, the scoped name, the nested `dependencies.apm` shape, the URL and subpath spellings and an upper-cased slug, and stays quiet for a same-owner `<slug>-suffix` sibling | `test/cli/commands/check.test.ts:1918`, `:2025`, `:2080`, `:2115`, `:2128`, `:2142` (the URL spelling beside `:2115`) |
| A36 | A credential-shaped distribution identity is refused and never echoed; the leak gate over the whole distribution reports 0 hits | `test/ci/distributionIdentity.test.ts:213`; `test/ci/pluginDistribution.test.ts:509` |
| A37 | Every workflow declares `contents: read` at workflow scope and per-job permissions with write grants on four named jobs only; every action is pinned to a full sha with its version | `test/ci/workflow.test.ts:3192`, `:3170` |
| A38 | A control character in an apm.yml entry or a root's refusal string never reaches a doctor row | `test/cli/commands/check.test.ts:2060` and its sibling for the refusal string |
| A39 | The built site's structure and keyboard journeys at 375 and 1440, light and dark | harness rows H2, H3a–H3d `passed` at the candidate |
| A40 | Claude Code hooks deny and allow headlessly at the candidate | harness row H1a `passed` (claude 2.1.278, `claude -p … --output-format stream-json`) |

## Walk-through — rows left for a person (65 minutes, one session)

Start state for the M rows: the candidate checked out and built, and the distribution built into `/tmp/plugins`:

```
npm pack --pack-destination /tmp/pkg \
  && node scripts/build-plugin-runtime.mjs --tarball /tmp/pkg/zomarit-stamity-1.8.0.tgz --out /tmp/plugin-runtime \
  && node scripts/build-plugin-distribution.mjs --out /tmp/plugins --runtime /tmp/plugin-runtime \
       --source-commit $(git rev-parse HEAD) --source-commit-date $(git log -1 --format=%cI)
```

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| H1 | Plugin-backed setup on a fresh repository with a real root | 1. In an empty directory: `git init`. 2. `CLAUDE_PLUGIN_ROOT=/tmp/plugins/claude npx stamity plugin status`. 3. `CLAUDE_PLUGIN_ROOT=/tmp/plugins/claude npx stamity plugin setup --client claude -y`. 4. `CLAUDE_PLUGIN_ROOT=/tmp/plugins/claude npx stamity check`. | Status names the root, its version and the bundled runtime; setup writes `.stamity/manifest.json` with `plugin.mode: plugin-backed` and `plugin.clients.claude`, and no generated agent, skill or command file under `.claude/`; check's `plugin-runtime` and `plugin-duplicates` rows read `ok`. | M | 5 | the shapes are pinned (A5–A8) but no test runs the verb against a vendor-built root end to end — [ ] |
| H2 | Copilot CLI installs the built root and lists its skills | 1. `export COPILOT_HOME=$(mktemp -d)`. 2. `copilot plugin install /tmp/plugins/copilot`. 3. `copilot plugin list --json`. 4. `copilot -p "list the skills you can invoke" -s`. | Step 2 prints `Installed 10 skills` (with the direct-install deprecation warning); step 3 names the plugin; step 4 lists the eight corpus skills and `st-setup`. | M | 6 | the install measured once on the unit's branch (Copilot CLI 1.0.85, record); the invocation has no measured non-interactive form (harness H1d `not-run`) — [ ] |
| H3 | The Cursor agent lists the skills from the installed root | 1. Install the built `cursor/` root the way the guide's Cursor section states, in an empty directory. 2. `agent --trust -p "list the skills you can invoke"`. | The eight corpus skills plus `st-setup`; none of the nine touchpoints (they carry `disable-model-invocation: true`). | M | 8 | the listing measured once on the unit's branch (Cursor agent CLI 2026.09.15, 18 ids, record); hooks under the agent have no measured non-interactive form (harness H1c `not-run`) — [ ] |
| H4 | Claude Code installs the built root as a marketplace plugin and runs a namespaced command | 1. `claude plugin validate --strict /tmp/plugins/claude`. 2. In an empty directory: `git init`, then `claude`, then `/plugin marketplace add /tmp/plugins` and `/plugin install stamity@stamity`. 3. `/stamity:st-setup`, then ask "list the skills you can invoke". | Step 1 prints `Validation passed`; the install lists the plugin; `st-setup` writes `.stamity/` with `plugin.mode: plugin-backed`; the list names the eight corpus skills under the `stamity:` namespace. | M | 10 | `validate --strict` measured at the root (Claude Code 2.1.278, record); the install and invocation legs are not measured headlessly — file 3's V1 adds them — [ ] |
| H5 | Codex adds the marketplace, installs the plugin and enforces hooks under interactive trust | 1. `export CODEX_HOME=$(mktemp -d)`. 2. `codex plugin marketplace add /tmp/plugins`, `codex plugin add stamity@stamity`, `codex plugin list --json`. 3. In a directory prepared as session 1's Codex row (the `qa-denied.txt` / `qa-allowed.txt` fixture under `scripts/qa/fixtures`), open the TUI, accept the project trust and the `/hooks` review, ask for the two reads. | The three commands exit 0 with no login and the list names the plugin; the denied read is refused and `qa-observations.jsonl` gains one line per call. | M | 10 | the marketplace add, plugin add and list measured once on the unit's branch (codex-cli 0.154.0, 48 files byte-identical, record); hooks headless `not-run` (harness H1b) — [ ] |
| H6 | The real publish path of the release workflow | 1. At the 1.9.0 release (file 3's V7): approve the release run. 2. After it: `git ls-remote origin refs/heads/plugin-dist refs/tags/plugins/v1.9.0`. 3. Open the run's attestation step. | The run succeeds; both refs exist and the branch head is an orphan commit; the four archives are attested. | M | 15 | the dry-run rehearsal (run 35511867841) covers every step before the publish job; the publish half has no rehearsal by design — [ ] |
| H7 | The `.gitignore` line matches a symlinked `node_modules` | 1. In a clone: `mv node_modules /tmp/nm && ln -s /tmp/nm node_modules`. 2. `git status --porcelain`. | Empty output. | L | 2 | no test seeds a symlinked `node_modules` (the researcher's search) — [ ] |
| H8 | Upgrade over an existing checkout | 1. In a clone at v1.8.0 with `.stamity/` present: `git pull`, `npm ci`, `npm run build`. 2. `node dist/cli.js sync`. 3. `node dist/cli.js check`. | `synced: 0 created, 0 updated, 67 unchanged` (only the manifest stamp moves); thirteen `ok` rows including the two new ones. | L | 4 | the runner's dogfood sync and check output at the candidate (command and outcome, record); no assertion pins the no-op — [ ] |
| H9 | The plugins guide renders and its links resolve | 1. `cd website && npm run serve`. 2. Open `/docs/plugins` at 375 and 1440, light and dark. 3. Follow the four install-route sections' links. | The page renders with its tables and code blocks and no raw markup; every link resolves. | L | 5 | the build passed with `onBrokenLinks: throw` and the page is in the build (links resolve); the harness's page list does not include the new page (its rendering unverified) — [ ] |

**Sign-off** — Package 15 session 2, candidate `95660ea`, 2026-09-20 (signed through the question tool at the checkpoint)

The maintainer answered through the question tool: **Shippable YES, accept the nine unperformed rows** (the
recommended option; the declared default).

- [x] Every H row walked and passing — no H-risk row remained after the auto-prove pass (40 rows
  auto-proven; the nine person rows are M or L).
- [x] Every failing M row has a filed follow-up, linked — no M row failed; H1–H6 are recorded as **signed
  off and not performed** (the client rows for the fifth time, after 1.7.0, 1.8.0, Package 14 and session
  1), with file 3's V1 as the unit that measures the four client routes headlessly and V7 the publish path.
- L failures are recorded, not blocking — H7, H8 and H9 unperformed, no failure recorded.
- Rollback: the pull request merges by rebase; `git revert` of the merged range (or reverting the merge on
  `main`) restores the previous tree; nothing is published to npm or to a distribution branch in this
  session (the first publish is file 3's V7).
- Shippable: **YES**.
