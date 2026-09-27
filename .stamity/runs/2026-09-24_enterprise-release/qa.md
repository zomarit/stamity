# QA walk-through — Package 16, session 2 (pull request #55; plans 010 and 011, the enterprise work and REPLAY-v2)

Candidate: `2f8ac546`, the head of `package-16-enterprise-release` (draft pull request #55; the branch was cut from
`main` `d072a347`, record.md:7). Gate of record at `2f8ac546`: eight gates pass on the first run — build, `stamity
check` (drift clean), lint, typecheck, knip, the leak gate, the replay suite (8 of 8) and the fork suite (4 of 4)
(record.md:214). The ninth gate, `npm test -- --coverage`, went red twice on a cleanup-hook timeout with 0 failing
assertions (the disk was 95% full), and its second re-run is green: 257 of 257 files, 10,433 passed, 26 skipped,
coverage 96.63 / 90.07 / 98.91 / 97.56, no floor line (report `reports/prove-test-runner-r3.md`; record.md:215-216).
QA harness at `2f8ac546`, with the distribution built as CI builds it: `.stamity/evidence/qa-2f8ac54.json` (sha256
`f450e83f524319bed507099bd3a1bc3d1d679cfdfa4924fa0c3b3b009c0b5111`), 13 of 14 rows `passed` and `H1b` `not-run`
(report `reports/qa-harness-test-runner-r2.md`; record.md:218). CI: round 5 at `2f8ac546` is green on every leg,
Windows included; `all-ci-checks` and `all-pr-checks` pass and Pages was skipped (ci run 36260556489, as the session's
orchestrator reports it). What changed: the run record `.stamity/runs/2026-09-24_enterprise-release/record.md`, the
plans `docs/plans/010-enterprise-release-01.md`, `docs/plans/010-enterprise-release-02.md` and
`docs/plans/011-replay-v2.md`, and the specs merged at `0fab945d` (`docs/specs/plugin-lifecycle.md` REQ-PLUGIN-027 …
030, `docs/specs/orchestrator-context.md` REQ-CTX-013, REQ-CTX-015 and REQ-CTX-016, and
`docs/specs/prove-behavior-and-value.md` REQ-PROVE-009 and REQ-PROVE-020). Written 2026-09-26 by the spec-author for
the session's orchestrator. The run stops before the sign-off. The sign-off is the maintainer's, and it is open.

## Rows derived (the triggers)

- **A user-visible surface changed:** the fork release workflow `.github/workflows/fork-release.yml` and the fork
  guide's two new sections, "Release your fork" and "Roll the plugin out to your organization" (A1–A8, A16, A19;
  P1, P6). The identity script `scripts/fork-identity.mjs` (A9–A12). The managed-settings template
  `admin/claude-managed-settings.json` (A13–A16; P2). The Codex root README's install line with `--ref` (A17). The
  enterprise quickstart page `docs/enterprise-quickstart.md` (A18; P9). The hook-latency script
  `scripts/hook-latency.mjs` (A25). The eval profile's scenario model and effort pin (A26–A28). The REPLAY-v2
  instrument (A29–A37). Also small in the diff: the locator hands its root to `check` (A38), the Claude install note
  (A39) and two Windows test timeouts (no row; test-only).
- **An error, fallback or refusal path changed:** the workflow's probe, proofs and npm step refusals (A2, A6, A7, A8).
  The identity script's refusals (A10, A11). The template's refusals (A14). The card's read caps (A23, A24). The
  latency script's exit 1 and exit 2 (A25). The replay's invalid-run and unknown-protocol refusals (A31, A32).
- **Config changed** (two rows each: a clean first run, and an upgrade over existing state):
  - Hook budgets in the emitted configuration: first run A20–A22; upgrade P4.
  - The managed-settings template: first run A13–A15; the live client walk (the evidence section below) and the
    candidate's file tied to it, P2.
  - The identity: first run A9; a rerun over a renamed tree A9.
  - The eval profile: A26; its upgrade is the comparator's handling of older runs, A27.
- **A security-adjacent path changed.** Each gets one negative row:
  - the registry token: A2, A4, A5, A7, and P1 for the guide's secret placement;
  - the published tag is never moved: A8;
  - the identity URL is never echoed: A11;
  - a lock-out by an unequal allowlist: A13, A16, P6;
  - a hostile-size ledger: A23, A24.
- **UI changed, and the site declares a light and a dark theme:** the quickstart page and the fork guide's new
  sections render in both themes. The harness's eight pages hold neither, and no browser-evidence bundle exists for
  `2f8ac546`: P9.
- **Harness rows left open:** H1b (P5), the `/agent stamity-reviewer` listing in H4c (P3), and H5's two skipped legs
  (P7, P8).

## Appendix — rows auto-proven by artifacts that exist for this change

Each pointer is a test assertion in the candidate's tree, read at `2f8ac546`. Every row ran in the gate of record's
`npm test -- --coverage` re-run (exit 0, 10,433 passed; `reports/prove-test-runner-r3.md`) or in one of its two opt-in
gates, named on the row: the fork suite (`STAMITY_FORK_SUITE=1 npx vitest run test/ci/forkIdentity.test.ts`, 4 of 4) or
the replay suite (`STAMITY_REPLAY_SUITE=1 npx vitest run test/replay/oracle-v2.test.ts`, 8 of 8; record.md:214). The
workflow cases that execute its bash steps run on POSIX hosts only. The gate of record ran on macOS.

| # | Scenario | Proof |
|---|---|---|
| A1 | The fork workflow stays inert until armed: with nothing set it ends green and unarmed, naming both variables. When `STAMITY_FORK_RELEASE` names another repository, or the run is in the canonical repository, it stays unarmed | `test/ci/forkReleaseWorkflow.test.ts:519-539` |
| A2 | An armed fork whose registry is not a clean https URL fails naming `STAMITY_RELEASE_REGISTRY` and never prints the value; a bad release branch fails naming `STAMITY_RELEASE_BRANCH` | `test/ci/forkReleaseWorkflow.test.ts:551-578` |
| A3 | Gates run only when armed. Publish runs only for an armed tag push or a real dispatch. A dispatch whose `dry_run` is missing or empty stays closed | `test/ci/forkReleaseWorkflow.test.ts:291-325` |
| A4 | Probe and gates can only read and hold no secret. Publish alone holds the write grants and both secrets, behind the `fork-release` environment, with no OIDC. Publish checks nothing out and verifies both digests, the tarball's identity and the checksum files before it publishes | `test/ci/forkReleaseWorkflow.test.ts:331-372` |
| A5 | The per-run token goes only to GitHub Packages itself, never to a lookalike host, whatever the letter case | `test/ci/forkReleaseWorkflow.test.ts:386-428` |
| A6 | The proofs refuse the canonical package name, a private package, a registry mismatch, an unscoped or foreign scope on GitHub Packages, a tag off the release branch and a tag that names another version | `test/ci/forkReleaseWorkflow.test.ts:678-721` |
| A7 | The npm step publishes once and skips a version already there with the same integrity. It refuses a version another tarball holds. With no credential it stops before any npm call and prints the remedy. It uses no `--provenance` and no `--access` | `test/ci/forkReleaseWorkflow.test.ts:997-1027` |
| A8 | The distribution push creates the branch and the tag, and a rerun moves neither; a tag already pointing elsewhere is refused and nothing is pushed | `test/ci/forkReleaseWorkflow.test.ts:1179-1212` |
| A9 | The identity script sets every field and both presets, and both generators' `--check` then pass. A second run prints `unchanged` for every file and moves no byte | `test/ci/forkIdentityScript.test.ts:136-196` |
| A10 | `--check` on an unrenamed tree exits 1, names each drifting file and writes nothing. `--registry` makes a CLI-publishing fork: no `private` flag, `publishConfig.registry` set, and an npm marketplace source | `test/ci/forkIdentityScript.test.ts:198-226` |
| A11 | The script refuses a dirty file it would change, names it and writes nothing. A generator failure names the rerun. A repository off github.com, or one carrying credentials, and an unclean registry are refused without echoing the value | `test/ci/forkIdentityScript.test.ts:255-296`, `:321-377` |
| A12 | The guide's identity command, run in a renamed checkout, leaves the inherited gate green (fork suite) | `test/ci/forkIdentity.test.ts:380-383` |
| A13 | The template holds exactly the four keys in order. Its marketplace and plugin id equal the rendered Claude catalog's. Its allowlist equals the declared source field for field and is never empty | `test/ci/managedSettings.test.ts:80-115` |
| A14 | The minimum client defaults to 2.1.277. The template refuses a lower version, a version that is not plain semver or has a leading zero, a missing or unsafe ref, and an identity with no name or slug, naming the field each time | `test/ci/managedSettings.test.ts:149-205` |
| A15 | The build writes `admin/claude-managed-settings.json` as the renderer's own output. It is byte-identical across builds and read by the credential scan, and no file is written without Claude. The README names it | `test/ci/pluginDistribution.test.ts:586-649` |
| A16 | The fork guide's JSON block is the renderer's output, with the keys in the same order | `test/docsPages.test.ts:2097-2124` |
| A17 | The Codex root README's install block equals the distribution README's, at the distribution branch. It names the same three `marketplace add` lines, and never one without `--ref` | `test/ci/pluginPackages.codex.test.ts:565-591` |
| A18 | The hand-page suite holds fifteen pages, the quickstart among them. The quickstart links both guides, has no multi-line fenced block and stays within 120 lines | `test/docsPages.test.ts:716`, `:2126-2139` |
| A19 | The fork guide's identity step runs the script, with no `node -e`. The release section names every variable and secret the workflow reads, and no other | `test/docsPages.test.ts:2050-2095` |
| A20 | The core session-start rows carry `timeoutMs: 30000`; the guard and the review gate carry none | `test/emit/hooksInfra.test.ts:565-575` |
| A21 | Claude renders SessionStart and ConfigChange at 30 s, with no timeout on the guard or the review gate, both in a repository and in a plugin root. Cursor, Copilot and Codex render 30 on session start and none on the guard | `test/emit/hooksInfra.test.ts:1208-1244` |
| A22 | Every rendered core hook script is within its byte and line ceiling, and an oversized render fails with a message naming the file and both numbers | `test/hooks/scriptBudget.test.ts:127-162` |
| A23 | A ledger over 4 MiB prints `ledger: too large to read (over 4 MiB)` with no count, and every report counts as unledgered. At most 256 reports are read, and the rest are counted `not checked`, never clean | `test/hooks/sessionStartCard.test.ts:271-336` |
| A24 | `stamity ledger status` prints the hook's card on the cap fixtures, and says on stderr and in `--json` that a too-large ledger was not read | `test/runs/resumeCardParity.test.ts:570-622`, `:849`, `:1037-1058` |
| A25 | The latency script exits 0 with a three-row table for a fast guard. It exits 1 for a slow guard, naming the overhead, and exits 2 for a missing guard or a bad argument. The budget defaults to 15 ms. Both payloads reach the real guard's policy. The release checklist carries the line | `test/ci/hookLatency.test.ts:63-98`, `:102-169`, `:175-212`, `:242` |
| A26 | The claude profile's scenario is `claude-opus-5-5` at `high`, and its judge is `claude-fable-5-1` at the harness default | `test/evals/modelProfiles.test.ts:29-45` |
| A27 | The comparator never takes a run on another model pair as the prior run, and still finds one on the same pair. An older run that recorded no pair is compared on the fields it did record | `test/evals/manualRunner.test.ts:1537-1550`, `:1582-1591` |
| A28 | A version number on a verdict line is not read as a confidence (`1.10.0`, `v1.0`, `1.9.0`, `1.0.x`); a real one still is (`0.60`, `0.85.`) | `test/cli/docs/measurements.test.ts:724-738` |
| A29 | The replay matcher reads `No Critical findings`, `no new Critical or Warning` and `Critical: 0` as no finding, and a term inside a finding's own locator credits no seed | `test/replay/findings.test.ts:651-736` |
| A30 | A review round that covers several passes counts for each of them: a round-1 find is scored at its own pass, the `notMatch` presence rule reads the fixed tree as absent, and v1's seeds pass the schema unchanged | `test/replay/measure.test.ts:1081-1133`, `:1165-1185` |
| A31 | A seed recorded as not injected leaves the recall denominator and keeps its security row. An injected seed keeps the snapshot's reading. A v2 run with no injection record, or a malformed one, is invalid. v1 is unchanged | `test/replay/measure.test.ts:1252-1289` |
| A32 | The protocol table and `--protocol`: a v2 run records REPLAY-v2's path, each version refuses the other's folder, and an unknown version exits 1 in every command with nothing written. `compare.mjs` does not import `score.mjs` | `test/replay/score.test.ts:1012-1108` |
| A33 | REPLAY-v2's thresholds equal v1's, its §8 names every forbidden term, and REPLAY-v1's bytes are frozen | `test/replay/score.test.ts:405-437` |
| A34 | A v2 RESULTS and the v2 comparison carry the clients table (Claude Code measured; Cursor, GitHub Copilot CLI and Codex `not-run` with a reason), and v1's carry none. The not-injected note sits beside pooled-recall, and beside security-seeds for a security seed | `test/replay/score.test.ts:630-646`, `:677`; `test/replay/compare.test.ts:478-498` |
| A35 | `score.mjs compare --protocol v2` writes `COMPARISON-v2.md`, exits 0 on PASS and 2 on FAIL, and refuses inputs that mix protocols | `test/replay/compare.test.ts:633-722` |
| A36 | The v2 fixture: `base.patch` and `oracles.patch` are v1's bytes, every injection anchor is unique, the chain starts clean, the injections give the seeded tree, and the reference fixes give the clean end back | `test/replay/seeds-v2.test.ts:213-306` |
| A37 | The v2 oracles fail on the injected tree and pass on the clean chain and after the fixes; in a real fixture under the replay suite | `test/replay/oracle-v2.test.ts:128`, `:144-209` |
| A38 | The locator hands `PLUGIN_ROOT=<root>` to `check` and leaves the argv alone. An already-set root variable passes through untouched, and a blank one counts as unset. The copied variable list is pinned. `check` names the new remedy | `test/ci/pluginLocate.test.ts:502-532`, `:578-584`; `test/cli/commands/check.test.ts:1913` |
| A39 | The Claude install note says `enabledPlugins` alone lands in the project and the marketplace lands in user settings | `test/ci/pluginPackages.claude.test.ts:566`, `:613-614` |

## Harness rows

From `.stamity/evidence/qa-2f8ac54.json` at `2f8ac546` (sha256 `f450e83f…0c5111`).

| # | Scenario | Status | Evidence (the row's reason, shortened) |
|---|---|---|---|
| H1a | Claude Code enforces the emitted hooks headlessly | passed | claude 2.1.283: 1 denied (`qa-denied.txt`), 1 allowed |
| H1b | Codex enforces the emitted hooks | not-run | `codex exec` on codex-cli 0.154.0 loads no project hook layer headlessly; the interactive `/hooks` trust stays with a person, P5 |
| H1c | The Cursor agent enforces the emitted hooks | passed | agent 2026.09.26-dd393fe: 1 denied, 1 allowed |
| H1d | Copilot CLI enforces the emitted hooks | passed | Copilot CLI 1.0.88: 2 denied, 1 allowed |
| H2 | The built site's eight pages hold their structure, with no scanner violation | passed | `/` and seven `/docs/` pages; axe-core 4.13.0, 0 violations. Neither `/docs/enterprise-quickstart` nor `/docs/enterprise-forks` is among the eight, so P9 |
| H3a | Keyboard journeys, light theme | passed | every stop has a visible indicator, in DOM order (the same eight pages) |
| H3b | Keyboard journeys, dark theme | passed | as H3a |
| H3c | Keyboard journeys, light theme, second run | passed | as H3a, more stops per page |
| H3d | Keyboard journeys, dark theme, second run | passed | as H3c |
| H4a | The Claude root: structure, install (`plugin validate --strict`), discovery, invocation | passed | at the version line 1.9.1; `.stamity/manifest.json` carries `plugin.mode plugin-backed` |
| H4b | The Cursor root: the same four legs | passed | `--plugin-dir` route, agent 2026.09.26-dd393fe |
| H4c | The Copilot root: the same four legs | passed | Copilot CLI 1.0.88. The declared agent form `/agent stamity-reviewer` (or `--agent=stamity-reviewer`) is **absent** from the listing, so P3 |
| H4d | The Codex root: the same four legs | passed | codex-cli 0.155.1, 45 cached files byte-identical, removed afterwards |
| H5 | The four plugin lifecycle walks: install, setup, update, rollback | passed | every leg PASS, except two legs SKIPPED: Claude's `rollback-subcommand` (the leg names claude 2.1.278; the documented three-command route passed) and Cursor's `marketplace` add (needs a git URL and an account). So P7 and P8 |

## Evidence from the live walks

These walks were recorded in this run with exit codes and output digests. They are not auto-proof in the skill's
sense: they walked a rendered file or a private mirror, not the candidate's own build. So each one is tied to a person
row below.

- **E4, the managed-settings template on a real client**
  (`.stamity/runs/2026-09-24_enterprise-release/managed-settings-walk.md`). Claude Code 2.1.281 ran in a Linux
  container with no credential inside, and the policy sat at `/etc/claude-code/managed-settings.json`. W1 passes only
  after one interactive start. W2 installs the plugin, and the allowlist does not gate the plugin entry's own source.
  W3 refuses another marketplace. W4 refuses to start below `99.0.0`. W5 shows that a mismatched allowlist `ref` locks
  out new and existing users alike (walk record lines 26-51). The policy was rendered at `fcc4f59e` for
  `plugins/v1.9.1`. P2 ties the candidate's file to it.
- **E3, Codex's remote route against a private mirror**
  (`.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md`, "The Codex half (E3), 2026-09-24"). The `--ref`
  shorthand installed a root equal to the tag's `codex/` tree. The no-`--ref` line installed the public npm package
  instead (fact E3-3), which is why the README line now carries `--ref` (A17). The four-command route back works
  (E3-4). Skill discovery in a Codex session was `not-run` (E3-C9).

## Rows the session ran for the maintainer (2026-09-26)

The maintainer wants only human-only steps left for them, so the session ran these three rows itself, at `2f8ac546`.
Each keeps its id. The results are as the session's orchestrator reports them.

| # | Scenario | What was run | Result | Risk | Proof |
|---|---|---|---|---|---|
| P2 | The candidate's template is the file the live walk proved | `shasum -a 256 dist/plugins/admin/claude-managed-settings.json`, in the candidate checkout | **Passed.** It printed `d2c64c96a3a3466980306beb39cb2499022f2ac8a2b5dd9e0b528be6f05f266b`, equal to the W1–W3 policy the container walk ran (`managed-settings-walk.md:57`). So W1–W5's facts hold for the candidate's file. | M | E4 walked a file rendered at `fcc4f59e`; A15 proves the renderer at `2f8ac546`; this digest ties the two by bytes — ☑ |
| P4 | A repository set up by 1.9.1 gains the hook budgets on the candidate's sync | A scratch repository set up by `npx @zomarit/stamity@1.9.1 init -y --tools claude`, then the candidate's `check`, `sync`, a print of each `.claude/settings.json` hook event's timeouts, `check` again, and a repeat `sync` | **Passed on what it tests.** The first `check` exited 1, with drift naming `.claude/settings.json` among 14 files. After `sync`: `SessionStart [30,30]`, `ConfigChange [30]`, and `"none"` on `PreToolUse`, `TaskCompleted` and `SubagentStop`. The second `check` exited 0. **Correction to the expectation:** a repeat `sync` changes `.stamity/manifest.json`'s `updatedAt`, so `git status --porcelain` is not empty. 1.9.1's own repeat sync does the same, so this predates the branch. It is ledgered as `review/149`, deferred to the inbox. | M | A20–A22 pin the render on a fresh emission; this row is the upgrade over a 1.9.1 setup — ☑ |
| P7 | Claude Code still has no rollback subcommand, so the documented route stands (harness H5) | `claude --version`, `claude plugin --help`, `claude plugin rollback stamity` | **Passed.** `claude --version` printed 2.1.283. `claude plugin --help` lists no `rollback`. `claude plugin rollback stamity` printed `error: unknown command 'rollback'` and exited 1, so `docs/plugins.md:403-405` stands. | L | H5 `rollback-subcommand` SKIPPED; the three-command route (`rollback-documented`) passed — ☑ |

## Walk-through — rows left for a person

Six rows, about 37 minutes, so the table is not split. P2, P4 and P7 were run by the session and are in the section
above, with their results. P1 and P6 are reading rows (`judgment: maintainer`). The
others run a client or a script. Walk them while no replay run is live, or between runs. The replay's canary started at
18:06Z (record.md:219), and the pilots and scored runs follow it unattended. Nothing below builds the site or runs a
full suite.

Start state, in the candidate checkout (the main checkout, at `2f8ac546`). `dist/`, `dist/plugins/` and
`website/build/` were built at `2f8ac546` by the harness runs (record.md:217-218;
`reports/qa-harness-test-runner-r2.md:5-8`), so nothing needs rebuilding:

```
git rev-parse --short=8 HEAD                  # 2f8ac546
export ST_CLI="$PWD/dist/cli.js"
```

Commands the rows name:

```
# P3 — in the candidate checkout; your own Copilot login (skip the add and the removal if `copilot plugin list` already shows stamity)
copilot plugin marketplace add "$PWD/dist/plugins"
copilot plugin install stamity@stamity
cd "$(mktemp -d)" && copilot
  /agent
  (look for stamity-reviewer in the list, then close the session)
copilot plugin uninstall stamity
copilot plugin marketplace remove stamity

# P5 — in the candidate checkout; the fixture lands under the OS temp folder, never in the repository
node -e "import('./scripts/qa/fixtures.mjs').then((m) => console.log(m.createFixture({ tool: 'codex', repoRoot: process.cwd() }).dir))"
cd <the printed folder>
grep -A1 '^\[features\]' .codex/config.toml
codex
  (accept the project trust; run /hooks and trust the listed hooks; then send:)
  Read qa-denied.txt, then read qa-allowed.txt, and reply with what you could read
cat qa-observations.jsonl

# P8 — anywhere; your own Cursor login
agent --version
agent plugin marketplace add --help
  (add https://github.com/zomarit/stamity.git at the plugin-dist branch in the form the help prints; list what it offers; then remove it)

# P9 — in the candidate checkout
cd website && npm run serve -- --port 3210 --no-open
  open http://localhost:3210/docs/enterprise-quickstart
  open http://localhost:3210/docs/enterprise-forks
  (Ctrl-C stops the server)
```

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| P1 | A platform engineer can arm the fork release safely from the guide alone | Open `docs/enterprise-forks.md` at `## Release your fork` (line 868) and read through `### Know how the workflow reaches your fork` (to line 985), as someone who has never seen this repository. | The order is clear: create the `fork-release` environment with required reviewers first, then add `STAMITY_REGISTRY_TOKEN` as an **environment secret** on it, never as a repository secret (line 895; `review/126`). The section also covers: the three variables (`STAMITY_FORK_RELEASE` = `<owner>/<repo>`, `STAMITY_RELEASE_REGISTRY`, the optional `STAMITY_RELEASE_BRANCH`); the tag form `v<version>` equal to `package.json`, such as `v1.10.0-acme.1`; that a rerun is safe and a tag is never moved; that a release is proved by checksums, not provenance or attestation, and why; and that the workflow reaches a fork only through a reviewed push. A reader cannot come away thinking the token belongs in repository secrets. `judgment: maintainer` | H | 8 | A19 pins the names both ways, but no test reads the order or the wording that keeps the token behind the environment's reviewers — ☐ |
| P3 | Copilot CLI lists the plugin's reviewer agent (harness H4c) | The P3 commands. | `/agent` lists `stamity-reviewer` among the plugin's agents. If it is absent, record the Copilot CLI version and whether any plugin agent is listed: the reviewer is then not reachable by name on the plugin route on this client, and the repository-mode setup is the workaround. The uninstall and marketplace removal each end without an error. | M | 5 | H4c: the declared form `/agent stamity-reviewer` is absent from the headless `-p` listing; an interactive session is not measured — ☐ |
| P5 | Codex enforces the emitted hooks under interactive trust (harness H1b) | The P5 commands. | The `grep` prints `[features]` and `hooks = true`. The denied read is refused and the allowed one succeeds. `qa-observations.jsonl` holds at least one line with `"decision":"denied"` and one with `"decision":"allowed"`. No file at all means no hook fired, whatever the model's reply says (learning `codex-hooks-need-the-features-flag-and-exec-runs-none`). | M | 6 | harness H1b `not-run` (codex-cli 0.154.0 runs no project hook under `exec`); this person row has stood since 1.9.0 — ☐ |
| P6 | An admin can roll the plugin out from the guide without locking anyone out | Open `docs/enterprise-forks.md` at `## Roll the plugin out to your organization` (line 986) and read through `### Know what was measured` (to line 1130). | The section shows the JSON block; the three OS paths and the `managed-settings.d/` folder; first-wins across managed sources, with `/status` → Setting sources to see which won. It says to start Claude Code once on each machine before installing (walk W1). It gives the fail-closed warnings: invalid JSON stops the client; an empty allowlist, or one whose `ref` differs from the declared source's, blocks every marketplace (walk W5). It says private repositories need git credentials on each machine. It tells an admin who mirrors the built tree to set `repo` identically in both entries beside `ref` (`review/127`). It cites the walk record for what was measured. An admin reading it knows the one-key drift that locks every user out. `judgment: maintainer` | M | 7 | A16 pins the JSON block to the renderer; nothing reads the steps or the warnings for clarity — ☐ |
| P8 | Cursor's CLI adds a marketplace from a git URL under a logged-in account (harness H5) | The P8 commands. | The add succeeds and the marketplace offers `stamity`; with the public `plugin-dist` branch today that is 1.9.1. Removing it ends without an error. This checks the route only, not the candidate's bytes: H4b and H5 prove the candidate's Cursor root through `--plugin-dir`. If the add fails, record the message: `docs/plugins.md:202-216` sends organizations to the dashboard's team marketplace and single developers to `--plugin-dir`, so nothing the page promises breaks. | L | 5 | H5 `cursor marketplace` SKIPPED (needs a git URL and an account) — ☐ |
| P9 | The quickstart page and the fork guide's new sections render on the built site, in both themes | The P9 commands. On each page, switch the theme to dark and back with the toggle, and tab through the quickstart's links once. | The sidebar's Guides list shows "Enterprise quickstart" directly before the fork guide. Each quickstart link opens `enterprise-forks` or `plugins` with no 404. The "Who does what" table renders. On the fork guide, "Release your fork" and "Roll the plugin out to your organization" show their tables and the JSON block rendered, with no raw markdown. Every focused link shows a visible indicator in both themes. | L | 6 | H2 and H3a–H3d cover eight other pages; A18 pins the markdown, not the render; no browser-evidence bundle exists for `2f8ac546` — ☐ |

## Not measured here: the release gates

These gate the 1.10.0 tag, not this checkpoint (`docs/plans/010-enterprise-release-02.md`, "The release gate"; record.md:15-16). None of them is a QA row.

- **A fork's real release.** `fork-release.yml` has never run in a real fork. A1–A8 evaluate its conditions and run
  its bash steps against scratch repositories and a stubbed `npm`.
- **A logged-in managed install.** The E4 walk had no login by design. Whether a logged-in start installs the enabled
  plugin by itself, and what `/status` → Setting sources shows, is recorded as `not-run`
  (`managed-settings-walk.md:50-51`, `:112`). Whether `allowManagedHooksOnly` blocks a force-enabled plugin's hooks is
  also unmeasured (plan 010 file 1, Follow-ups).
- **REPLAY-v2's results.** The canary for both shapes started at 18:06Z (record.md:219). The pilots, the scored runs
  and `evals/replay/COMPARISON-v2.md` do not exist yet, so its `Merge gate:` line cannot be read. A31–A37 prove the
  instrument, not its verdict.
- **Run 33, the eval baseline on Opus 5.5.** It has not run. A26–A27 prove the profile and the comparator, not the
  floors.
- **The guard's latency on the release machine.** `node scripts/hook-latency.mjs` exits 0 on a quiet machine, and its
  table goes into the release record (`.github/release-controls-checklist.md:235`). A25 proves the script, not the
  number.

Also not measured, and not a release gate: skill discovery in a Codex session on the private route (E3-C9,
`private-chain.md:319`), and Cursor's team marketplace, which waits for a team account.

## Deferred Warnings the maintainer should see

Two ledger rows at Warning are in state `deferred`, and both are marked `decision_needed`:

- `2026-09-24_enterprise-release/review/65` (ledger line 100): the budget test renders the review gate with the Claude
  adapter's four arguments, so a new gate option would leave the test measuring a body that `sync` no longer writes.
  This is bounded today. It closes with a shared `planReviewGateScript` owned by a unit that owns
  `src/adapters/claude.ts`.
- `2026-09-24_enterprise-release/review/78` (ledger line 117): the private eval driver's comparator keys on the model
  pair, the baseline and the rubric hash, while SET-v7 names `harness`, whose string carries the CLI version. It cannot
  affect run 33, the first run of its pair. The open question for the next eval increment is whether a CLI bump starts
  a new configuration.

**Sign-off** — Package 16 session 2, candidate `2f8ac546` — OPEN, not signed

- [ ] Every H row walked and passing (P1).
- [ ] Every failing M row has a filed follow-up, linked (P3, P5, P6; P2 and P4 passed, run by the session).
- L failures are recorded, not blocking (P8, P9; P7 passed, run by the session).
- Rollback:
  - **The merge.** The package branch lands on `main` by rebase or fast-forward. Revert the merged range on a
    branch, `git revert --no-edit d072a347..<merged head>`, and land that through a pull request; `main` then
    matches `d072a347`, the branch's base (record.md:7). The merge itself publishes nothing. The tag, the npm
    release and `plugins/v1.10.0` wait for the release gates above (record.md:15-16).
  - **The plugins, once 1.10.0 is out.** Use the reinstall route at the previous tag, `plugins/v1.9.1`, client by
    client (`docs/plugins.md:364-455`):
    - Claude Code: `claude plugin marketplace add <owner>/stamity#plugins/v1.9.1`, then
      `claude plugin install stamity@stamity --scope project`, then `claude plugin update stamity@stamity --scope project`
      (H5 `rollback-documented`).
    - Copilot CLI: `copilot plugin uninstall stamity`, then
      `copilot plugin marketplace add <owner>/stamity#plugins/v1.9.1`, then `copilot plugin install stamity@stamity`.
    - Codex: `codex plugin remove stamity@stamity`, then `codex plugin marketplace remove stamity`, then
      `codex plugin marketplace add <owner>/stamity --ref plugins/v1.9.1`, then `codex plugin add stamity@stamity`
      (walked, private-chain.md E3-4).
    - Cursor: move the marketplace branch on your mirror back, or point `--plugin-dir` at the previous tree.
- Shippable: YES / NO — for the maintainer. On NO, list the blocking rows.
