# QA walk-through — Package 15, session 3 (plan 008 file 3; the 1.9.0 candidate)

Candidate: `37e8976` (the head of `package-15-plugin-lifecycle-3` after the whole-branch re-review, the harness's
first measurement at `967cb76` and the repairs it forced). Harness evidence: `.stamity/evidence/qa-37e8976.json`
(the hooks lane, the site lanes and the plugins lane, written by `node scripts/qa/run.mjs --site website/build
--dist dist/plugins --sha <candidate>` with the four client binaries exported — claude 2.1.278, cursor `agent
2026.09.18-9a7762b`, copilot 1.0.87, codex-cli 0.154.0 — the site built at the candidate and the distribution
built from the packed 1.9.0 tarball the way CI builds it, alone on the machine — written first at 13:52Z with the
Cursor account over its usage limit and rewritten at 14:49Z by the same pass with an account that has Agent usage,
so every row the harness can measure reads `passed` except `H1b`, the recorded Codex vendor fact; the earlier
files at `967cb76`, `5ee8708`, `e5e54c9` and `f4f38ec` dropped because the candidate moved). Gate of record: the test-runner's
uncontended full gate in the pinned worktree `p15s3-review` at the candidate (the run record's "gate of record"
entry for `37e8976`) and CI green on every leg, Windows included, at `bd837fb`, `5ee8708`, `e5e54c9`, `f4f38ec`
and `485f37e` (the record's CI sections; the run at the candidate is cited there once it lands). Eval run of
record: run 32 (`evals/runs/2026-09-22-run-32`, PASS, composed with run 31 under the incremental rule at candidate
`e5e54c9`; no case, cited source, rubric, set or instrument byte moved between it and this candidate).

## Rows derived (the triggers)

User-visible surfaces changed: the emitted Claude Code hook commands (anchored on `${CLAUDE_PROJECT_DIR}`, the
core guard's fail-closed tail, the emitted scripts' root derivation in repository mode); the `stamity plugin`
verb's `status` (the engine's node floor when no root answers, each duplicate's source and remedy, `--client`);
the fourteenth `check` row (`claude-hook-shell`, with the host's PATH by any spelling, `CLAUDE_CODE_GIT_BASH_PATH`
and the WSL launcher excluded); the per-client route proof (`scripts/plugin-route-smoke.mjs`, the merge-blocking
`plugin-route` CI job, the nightly drive behind per-client secrets with its artifact and verdict step); the plugin
locator handing a `plugin` subcommand its own root; the Copilot st-setup command's discovery-first body and the
Codex README's setup line; the QA harness's `plugins` lane (`H4a`–`H4d`, `H5`), the Copilot hook row without `-s`
and with folder trust; the distribution's generators (the case-fold refusal, `--out` removed on a failed build,
the Claude refresh command in the README) and the downstream-distribution proof; the three eval cases and the
set at 102 with their moved locators; the 1.9.0 CHANGELOG, `package.json`, the regenerated manifests and dogfood
tree, fifteen re-attested hand pages and the evidence page (the plugins guide and the contracts page re-attested
again on 2026-09-22 for the measured Copilot and Codex facts), the measurements page, the errata on run 31's
RESULTS.md. Error and fallback paths changed: the guard's tail (exit 2 with one message when it cannot launch, its
own exit 2 re-raised), the check row's fail on a Windows host without Git Bash, the smoke's disabled-entry FAIL,
blocker-first discovery and install, removal outcome, the harness's exported-runtime check and the plugin lane's
redacted spawn-failure reasons, the Copilot command's two stops (no root loaded, several roots), the hygiene
gate's two exact-path exceptions. Config changed: the version to 1.9.0 (`generatedBy`, the stamps) — a clean
first run and an upgrade over an existing checkout. Security-adjacent paths changed: the guard's fail-closed tail
and the anchored command's quoting, the nightly's credential isolation (per-vendor prefixes with
`--ignore-scripts`, absolute addressing, no PATH prepend), the `claude-hook-shell` row's system-directory
exclusion, the redaction of paths and the interpreter out of every QA reason, the smoke's real-home guard and
removal outcome, the locator passing a root only when its own descriptor is beside it, the smoke's per-session
grants (Copilot's folder trust and added directory, Codex's writable workspace plus its own `.codex/`). Themes
and breakpoints: the docs site renders the changed pages at 375 and 1440 in light and dark.

## Appendix — rows auto-proven by artifacts that exist for this change

Each pointer is a test assertion in the candidate's tree plus the gate that ran it (`npm test -- --coverage` at
`37e8976`, pass, by the runner: 234 files, 9,315 passed, 18 skipped; and on every CI leg), or a harness row in the
evidence file.

| # | Scenario | Proof |
|---|---|---|
| A1 | A repository-relative Claude hook command is rendered as one double-quoted word under `${CLAUDE_PROJECT_DIR}`, and only the core guard carries the fail-closed tail | `test/adapters/claude.test.ts:1212-1256` |
| A2 | From a sub-directory working directory, `sh -c` runs the anchored guard and it blocks; the pre-anchor relative form exits 1 (the control) | `test/adapters/claude.test.ts:1349-1399` |
| A3 | An emitted core script in repository mode derives the repository root from its own location, ignoring a decoy state tree under the working directory | `test/hooks/scripts.test.ts:2803-2842`; the literal twin bound to `HOOKS_GENERATED_DIR` at `:2894-2909` |
| A4 | The committed dogfood tree is byte-identical to the engine's render | `node dist/cli.js check` at `37e8976`: `drift: clean`, `all green — nothing to do` |
| A5 | `stamity check` fails the `claude-hook-shell` row on a Windows host with no Git Bash reachable through `CLAUDE_CODE_GIT_BASH_PATH` or PATH (read by any spelling of the key), naming the consequence and the remedy; a WSL `System32\bash.exe` does not count; a `Git\bin\bash.exe` passes | `test/cli/commands/check.test.ts` (the `claude-hook-shell` cases); CI's Windows leg green since `bd837fb` |
| A6 | `plugin status` states the engine's node floor when no root answers, carries each duplicate's source and remedy, and narrows its client rows with `--client` | `test/cli/commands/plugin.test.ts` (V1b's cases; the record's V1b entry) |
| A7 | The route smoke exits 0/1/2 as declared, records every leg's command, exit code, version and transcript hash, and a stop mid-run records the unreached legs as `SKIPPED … stopped by SIGTERM` after the real-home removal | `test/ci/pluginRoute.test.ts` (the SIGTERM case with the readiness marker) |
| A8 | A disabled live Copilot entry fails the install leg by name; a rate-limited listing or a rate-limited Cursor install reads SKIPPED with the blocker's reason, not FAIL; a failed post-invocation removal reaches the reason and the JSON's `cleanup` | `test/ci/pluginRoute.test.ts` (the fake-copilot and fake-agent cases) |
| A9 | The Copilot hook runner trusts the folder (`COPILOT_ALLOW_ALL=true`) and reads a visible tool call beside an empty log as `failed`, a denied-only log with no attempt at the allowed file as `not-run`, both halves as `passed` | `test/qa/hookRuns.test.ts` (the env pin; the three verdict arms) |
| A10 | The `H5` fold: SKIPPED → not-run, a step FAIL or a red suite → failed, a missing walk line → not-run, a spawn error → not-run (redacted), every client PASS → passed; a FAIL step line leads a passing reason | `test/qa/pluginRuns.test.ts` (the fold cases) |
| A11 | The lifecycle walk executes the page's three rollback commands in order with the third qualified, asserts the `.2 → .1` move and records exit and digest; `rollback-documented` PASS | `test/ci/pluginLifecycle.test.ts` (the Claude walk's rollback rows) |
| A12 | An exported `STAMITY_LIFECYCLE_RUNTIME` missing one of the three required files reads `not-run` naming the file; the runtime that ran is named in the reason | `test/qa/pluginRuns.test.ts` (the runtime cases) |
| A13 | The `plugin-route` CI job installs each vendor CLI under its own prefix with `--ignore-scripts`, addresses every binary and `node` absolutely, requires no secret, and `all-ci-checks` needs it; the nightly's drive steps run under `!cancelled()` with a verdict step and keep the `--json` documents as a 14-day artifact; the `creds` step is spawn-free | `test/ci/workflow.test.ts` (the install, drive, verdict, artifact and executed-shell cases) |
| A14 | The locator hands a `plugin` subcommand its own root as `--plugin-root` when none is given (either spelling) and its descriptor is beside the runtime; a caller's own flag wins; `check` is untouched | `test/ci/pluginLocate.test.ts` |
| A15 | The Copilot st-setup body discovers its root from `copilot skill list --json` (one root from either path shape), stops when no plugin is loaded or when several roots answer, and passes `--plugin-root` on every locator line; the Codex README line carries `--plugin-root` | `test/ci/pluginPackages.copilot.test.ts`, `test/ci/pluginPackages.codex.test.ts`, `test/ci/pluginModules.test.ts` |
| A16 | The smoke's Copilot session runs under folder trust with the distribution root added, and its Codex session under a writable workspace with the repository's own `.codex/` added; both grants stated in the reasons without a path | `test/ci/pluginRoute.test.ts` (the grant pins; the no-absolute-path pin) |
| A17 | The generators refuse a case-folded claim before any write, naming both contestants; a failed distribution build removes its `--out`; the downstream proof builds three distributions from one fork checkout with no canonical owner left | `test/ci/pluginModules.test.ts`, `test/ci/pluginDownstream.test.ts` (V3's cases) |
| A18 | The distribution README's Claude refresh reads `claude plugin update stamity@stamity --scope project` and never the bare form | `test/ci/pluginPackages.claude.test.ts`, `test/ci/pluginDistribution.test.ts` (the newline-bounded pins) |
| A19 | The set counts 102 cases (52 golden, 20 adversarial, 30 probes, 23 floor, 523 binding, 52 advisory); every case governed outside the corpus is named; each index row names the case file's locator and each locator's quoted lines sit inside its range | `test/evals/coverage.test.ts`, `test/evals/roster.test.ts`, `test/evals/locators.test.ts` |
| A20 | The rubric's grading core above `## Calibration protocol` hashes to the run of record's `rubricCoreHash` (`6209d8df…`, 9,137 bytes) | `test/evals/rubricCoreHash.test.ts` |
| A21 | The 1.9.0 eval run passed every threshold and floor under the incremental rule, composed with run 31 | `evals/runs/2026-09-22-run-32/RESULTS.md` § 0, § 5, § 6; `summary.json` (`status: PASS`, 100 carried, 2 re-measured, calibration 5/5) |
| A22 | The measurements page names run 32 as the run of record and the composition chain walks 32 → 31 → 30 → 29 → 27 to the baseline | `test/cli/docs/measurements.test.ts` (the chain walk) |
| A23 | The hygiene gate admits the two retained summaries by their exact-path exceptions and still refuses a neighbour over the budget | `test/ci/repoHygiene.test.ts`; `node scripts/repo-hygiene.mjs --base 67f404b…` PASS at `37e8976` |
| A24 | Every hand page carries its currency header, the three date constants agree, the evidence page's header date is at or after the cut, and the CHANGELOG's link footer chains | `test/docsPages.test.ts`; `test/ci/changelogLinks.test.ts` |
| A25 | The four container manifests and the APM package verify at 1.9.0; the leak gate finds 0 hits; knip clean | the runner's gate at `37e8976` |
| A26 | The Windows leg: every path, mode and signal assertion holds on `windows-latest` (signal cases skipped by design) | CI `check (windows, node 24)` green at `bd837fb`, `5ee8708`, `e5e54c9`, `f4f38ec`, `485f37e` |
| A27 | The emitted Claude hook fires headlessly: one read denied, one allowed | harness `H1a` passed (claude 2.1.278) |
| A28 | The emitted Copilot hook fires headlessly under folder trust: one read denied, one allowed | harness `H1d` passed (copilot 1.0.87, `COPILOT_ALLOW_ALL=true`) |
| A29 | Eight docs pages render at 375 and 1440, light and dark, with their structure and keyboard order intact | harness `H2`, `H3a`–`H3d` passed |
| A30 | The Claude plugin route: `plugin validate --strict` accepts the root, a `--plugin-dir` run lists the namespaced command and agent, the setup command writes a plugin-backed manifest | harness `H4a` passed (2.1.278; structure, install, discovery, invocation) |
| A31 | The Copilot plugin route: the marketplace install loads live, the listing names every marker, the discovery-first setup command writes a plugin-backed manifest under folder trust with the distribution root added | harness `H4c` passed (1.0.87; structure, install, discovery, invocation) |
| A32 | The Codex plugin route: marketplace add and plugin add cache the root byte-identically, the listing names the skill, the README's setup line writes a plugin-backed manifest under the writable-workspace grant | harness `H4d` passed (0.154.0; structure, install, discovery, invocation) |
| A33 | Upgrade and rollback through each client's own route: Claude's three published commands (the third qualified) restore the first version's tree, Copilot's tree replacement, Codex's remove-then-add, Cursor's `--plugin-dir` tree replacement | harness `H5` passed: all four walks PASS (the Cursor walk on the second pass, with an account that has Agent usage) |

## Walk-through — rows left for a person

Every row that reaches a client or a host this machine cannot drive today. Start state for the client rows: the
candidate checked out and built, the distribution built into `/tmp/plugins` the way CI builds it:

```
npm pack --pack-destination /tmp/pkg \
  && node scripts/build-plugin-runtime.mjs --tarball /tmp/pkg/zomarit-stamity-1.9.0.tgz --out /tmp/plugin-runtime \
  && node scripts/build-plugin-distribution.mjs --out /tmp/plugins --runtime /tmp/plugin-runtime \
       --source-commit $(git rev-parse HEAD) --source-commit-date $(git log -1 --format=%cI)
```

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| P1 | The Cursor plugin route and its lifecycle walk with an account that is not over its usage limit | 1. On a machine whose Cursor account has Agent usage left: `export STAMITY_CURSOR_BIN=$(command -v agent)`. 2. `node scripts/plugin-route-smoke.mjs --dist /tmp/plugins --client cursor --invoke --json /tmp/cursor.json`. 3. `npx vitest run test/ci/pluginLifecycle.test.ts -t cursor`. | Step 2 exits 0 with install, discovery and invocation PASS (a `--plugin-dir` run lists `fixture`-free ids and the setup writes `.stamity/manifest.json` with `plugin.clients.cursor`); step 3's cursor walk PASS with the marker discovered at `.2` and omitted at `.1`. | M | 8 | ☑ **measured 2026-09-22T14:38Z–14:49Z on agent 2026.09.18-9a7762b after the maintainer signed the CLI in to an account with Agent usage** (the evidence file at this candidate rewritten by that pass): `H1c` passed (one denied, one allowed), `H4b` passed (install, discovery and invocation through the real home, the manifest with `plugin.clients.cursor`), the cursor walk in `H5` PASS (`--plugin-dir` tree replacement, the marker discovered at `.2` and omitted at `.1`); the earlier pass at the same sha, on the account over its limit, read every Cursor step SKIPPED with the reason and never FAIL |
| P2 | Codex hooks in an interactive session (the headless client loads no project hook layer) | 1. In the hook fixture repository (`scripts/qa/fixtures.mjs`), open `codex` interactively, trust the project and accept the hooks prompt. 2. Ask it to read `qa-denied.txt`, then `qa-allowed.txt`. | The first read is denied by the PreToolUse hook (exit 2 rendered by the client), the second allowed; `qa-observations.jsonl` records one denied and one allowed. | M | 5 | ☑ **walked by the maintainer 2026-09-22T14:41Z on codex-cli 0.155.1** (session `01a0c990-16a6-7b20-8098-068dc47ea5c0`): the client rendered `Blocked by hook` with the hook's own `permissionDecision: deny … qa-denied.txt is refused by this repository's hook`, then read `qa-allowed.txt`; the log carries one `denied` and one `allowed` line (sha-256 `756246be…`). The project was trusted and the hook accepted at the client's prompts, with `features.hooks = true` from the emitted config — the interactive path runs the emitted hooks; `H1b` stays `not-run` for the headless client, which loads none. |
| P3 | A Windows host with no Git Bash: the guard's declared residual and the doctor row that reports it | 1. On Windows without Git for Windows (WSL may be present), in a repository-mode checkout: `stamity check`. 2. Open Claude Code there and ask it to read a file. | Step 1's `claude-hook-shell` row FAILS naming the consequence (the anchored hook commands do not launch; the client does not block) and the remedy (Git Bash on PATH or `CLAUDE_CODE_GIT_BASH_PATH`); step 2 proceeds unguarded, which is the declared residual, not a pass. | H | 6 | ☐ — unmeasured on any host: the CI Windows leg has Git Bash; the row's branches are unit-tested with an injected platform (`A5`); the residual is a `Not done` line of the release. **Maintainer's decision (2026-09-22, in chat): shipped with an exception — assumed to work as implemented; the doctor row that reports the host is the release's guard, and the first Windows host without Git Bash that runs `stamity check` measures it.** |
| P4 | The real publish path of the release workflow | 1. Tag 1.9.0 and approve the release run's publish job. 2. After it: `git ls-remote origin refs/heads/plugin-dist refs/tags/plugins/v1.9.0`. 3. Open the run's attestation step and the digest check ahead of the npm publish. | The run succeeds; the branch and the tag exist at one orphan commit; the four archives are attested; the npm publish follows the digest check; a second run refuses the existing tag. | H | 10 | ☐ — the workflow's guards are pinned (`test/ci/workflow.test.ts`, `test/ci/changelogLinks.test.ts`) and the first real run is the measurement; the publish approval is the maintainer's |
| P5 | The private-chain rehearsal (V4) | The eleven steps of the V4 handoff (`stamity handoff list` → `2026-09-22_v4-private-chain-rehearsal-1-9-0_…`). | One pull request per consumer from a real Renovate run, the plugin one changing only the catalog `ref` lines, the APM one only `apm.yml` and its lock; the marker discovered after the merge; the pin-back restoring the first version's sha-256 map; a second Renovate run opening none; the leak gate 0 hits over the record. | M | 45 | ☐ — owner-dependent: the two private fixture repositories and the token exist only with the maintainer |
| P6 | The nightly drive's first armed run | 1. Set the four per-client secrets. 2. Dispatch `nightly.yml`. 3. Open the `headless-lane` job. | Four drive steps run under one secret each with absolute vendor binaries, the verdict step passes, the four `--json` documents are attached as a 14-day artifact, the Codex drive's `exec` runs under the writable grant. | M | 6 | ☐ — the workflow is pinned by its suite and the credential isolation reviewed twice; no armed run has happened; the Codex `exec` drive under `OPENAI_API_KEY` is unmeasured (ledger prove/232) |
| P7 | Upgrade over an existing checkout | 1. In a clone at v1.8.0 with `.stamity/` present: `git pull`, `npm ci`, `npm run build`. 2. `node dist/cli.js sync`. 3. `node dist/cli.js check`. | `synced: 0 created, 0 updated, 67 unchanged` (only the manifest stamp moves); `check` prints fourteen rows ok and `all green`. | L | 4 | ☐ — the dogfood tree at the candidate is that upgrade's result (`A4`), measured on this machine, not on a second clone |

Sorted by risk then minutes; 84 minutes over seven rows, one session.

**Sign-off** — Package 15 session 3, candidate `37e8976`, 2026-09-22 (signed in chat at 13:20Z)

The maintainer wrote: "you have my sign off for the human rows + my permission to run the scoped eval" — the
seven person rows above are signed as accepted-and-unperformed at this candidate, with the two H rows carried as
the release's `Not done` lines (P3, the declared residual; P4, the maintainer's own publish step), and the scoped
eval (run 32) ran under the maintainer's login and passed.

- [x] Every H row walked and passing — P3 and P4 are not walkable before the tag: P3 is the declared residual
  (the doctor row that reports it is auto-proven, `A5`), P4 is the tag itself; both are `Not done` lines with
  owners, signed as such.
- [x] Every failing M row has a filed follow-up, linked — no M row failed; P2 was walked by the maintainer on
  2026-09-22 and passed, and P1 was measured the same afternoon once the Cursor CLI was signed in to an account
  with Agent usage (every Cursor row passed); P5 (V4, owner-dependent) and P6 (the first armed nightly, disabled
  at the repository for now) are recorded as signed off and not performed, each with its ledger row or handoff.
- L failures are recorded, not blocking — P7 unperformed, no failure recorded.
- Rollback: the pull request merges by rebase; `git revert` of the merged range (or reverting the merge on
  `main`) restores the previous tree; nothing is published until the maintainer approves the release run, and
  the spec status flip (`523c66b`) is its own commit to revert if the release does not happen.
- Shippable: **YES** — every measurable row is green at the candidate (thirty-three auto-proven rows, all four
  client routes end to end, the hook emissions firing headlessly on three clients and interactively on the fourth,
  the eval increment passed); of the seven person rows, two were walked the same day and the rest are signed with
  their owners named.
