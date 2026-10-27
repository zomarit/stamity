---
id: autonomy-distribution-02
intent: feature
stamp: 864d01118ad5e8b28d831dd2b913c7c7193a233b 2026-10-25
reads: [.claude/settings.json, .github/release-egress.md, .github/workflows/ci.yml, .github/workflows/fork-release.yml, .github/workflows/nightly.yml, .github/workflows/release.yml, .gitignore, CHANGELOG.md, CONTRIBUTING.md, GOVERNANCE.md, README.md, SECURITY.md, docs/capability-matrix.md, docs/cli-reference.md, docs/cloud.md, docs/configuration.md, docs/enterprise-forks.md, docs/getting-started.md, docs/security-mapping.md, docs/specs/enterprise-upstream-lane.md, docs/specs/everyday-flows.md, docs/specs/fork-layer.md, docs/specs/model-ladder.md, docs/troubleshooting.md, docs/workspaces.md, llms.txt, package-lock.json, package.json, scripts/ci/records-only.mjs, scripts/fork-identity.mjs, scripts/leak-gate.mjs, scripts/pack-signing-rehearsal.mjs, scripts/qa/cloud-check.mjs, scripts/qa/hook-runs.mjs, scripts/tarball-smoke.mjs, scripts/upstream.mjs, src/adapters/claude.ts, src/adapters/codex.ts, src/adapters/copilot.ts, src/adapters/cursor.ts, src/adapters/cursorLegacyGuards.ts, src/change/classify.ts, src/cli.ts, src/cli/commands/add.ts, src/cli/commands/check.ts, src/cli/commands/clean.ts, src/cli/commands/config.ts, src/cli/commands/config/mcp.ts, src/cli/commands/gate.ts, src/cli/commands/init.ts, src/cli/commands/init/apply.ts, src/cli/commands/init/panel.ts, src/cli/commands/init/plan.ts, src/cli/commands/run.ts, src/cli/commands/runLand.ts, src/cli/commands/sync.ts, src/cli/commands/sync/engine.ts, src/cli/commands/sync/report.ts, src/cli/commands/workspace.ts, src/cli/docs/cliReference.ts, src/cli/docs/llmsIndex.ts, src/cli/engine/autonomyGate.ts, src/cli/engine/clientModels.ts, src/cli/engine/emissionWrite.ts, src/cli/engine/gitWrite.ts, src/cli/kit/packageName.ts, src/cli/notice/updateNotice.ts, src/composition/root.ts, src/config/autonomy.ts, src/emit/capabilityMatrix.ts, src/emit/planner.ts, src/emit/skillsProjection.ts, src/emit/stateScaffold.ts, src/hooks/model.ts, src/hooks/personOnly.ts, src/hooks/scripts.ts, src/manifest/claudeSettings.ts, src/manifest/hookDocuments.ts, src/manifest/manifest.ts, src/manifest/ownedPaths.ts, src/mcp/env.ts, src/merge/managedBlocks.ts, src/merge/reclaim.ts, src/merge/safeWrite.ts, src/migration/carry.ts, src/pack/install.ts, src/pack/retired.ts, src/roster/triggers.ts, src/runs/hookPaths.ts, src/runs/landEvidence.ts, src/runs/planCheck.ts, src/runs/preflight.ts, src/runs/pullRequest.ts, src/runs/resumeCard.ts, src/shared/cliCall.ts, src/types/content.ts, src/types/manifest.ts, test/adapters/claude.test.ts, test/adapters/codex.test.ts, test/adapters/copilot.test.ts, test/adapters/cursor.test.ts, test/architecture/boundaries.test.ts, test/ci/cloudLeg.test.ts, test/ci/forkIdentity.test.ts, test/ci/forkIdentityScript.test.ts, test/ci/forkReleaseWorkflow.test.ts, test/ci/recordsOnly.test.ts, test/ci/releaseEgress.test.ts, test/ci/testScheduling.test.ts, test/ci/workflow.test.ts, test/cli/binMap.test.ts, test/cli/commands/add.test.ts, test/cli/commands/check.test.ts, test/cli/commands/clean.test.ts, test/cli/commands/configMcp.test.ts, test/cli/commands/gatePreflight.test.ts, test/cli/commands/init.test.ts, test/cli/commands/initApply.test.ts, test/cli/commands/initPanel.test.ts, test/cli/commands/initPlan.test.ts, test/cli/commands/run.test.ts, test/cli/commands/runCheckpoint.test.ts, test/cli/commands/runEnd.test.ts, test/cli/commands/runLand.test.ts, test/cli/commands/sync.test.ts, test/cli/commands/syncEngine.test.ts, test/cli/commands/validate.test.ts, test/cli/commands/workspace.test.ts, test/cli/docs/cliReference.test.ts, test/cli/dogfoodDist.e2e.test.ts, test/cli/engine/autonomyGate.test.ts, test/cli/flows.e2e.test.ts, test/cli/kit/packageName.test.ts, test/cli/notice/updateNotice.test.ts, test/cli/surface.e2e.test.ts, test/docsPages.test.ts, test/emit/capabilityMatrix.test.ts, test/emit/hooksInfra.test.ts, test/emit/planner.test.ts, test/emit/stateScaffold.test.ts, test/emit/touchpointSkills.test.ts, test/gate/leakGateEvasion.test.ts, test/hooks/personOnly.test.ts, test/hooks/personOnlyCopilotAsk.test.ts, test/hooks/personOnlyGuard.test.ts, test/hooks/scriptBudget.test.ts, test/manifest/hookDocuments.test.ts, test/manifest/manifest.test.ts, test/manifest/ownedPaths.test.ts, test/mcp/env.test.ts, test/mcp/secretScan.test.ts, test/merge/bakEscape.test.ts, test/merge/claudeHookCopies.test.ts, test/merge/managedBlocks.test.ts, test/merge/reclaim.test.ts, test/merge/safeWrite.test.ts, test/merge/writeEscape.test.ts, test/pack/install.test.ts, test/qa/cloudCheck.test.ts, test/qa/hookRuns.test.ts, test/runs/hookPaths.test.ts, test/runs/landEvidence.test.ts, test/runs/planCheck.test.ts, test/runs/preflight.test.ts, test/runs/pullRequest.test.ts, test/runs/recordHead.test.ts, test/runs/resumeCardParity.test.ts, test/shared/cliCall.test.ts, test/support/cliHarness.ts, test/support/distBuild.ts, test/support/support.test.ts, test/upstream/lane.test.ts, tsdown.config.mjs, vitest.config.ts]
depends_on: [docs/plans/022-autonomy-distribution-01.md]
---

# Fork and distribution, the minimal set — file 2 of 2

This file is self-contained. It is the second of two `/st-plan` artifacts for **Package 20**, whose cut is the next
release after 1.16.0 and ships Package 22's pack set with it. It follows file 1
(`docs/plans/022-autonomy-distribution-01.md`, the autonomy model and the defects), and runs on the branch file 1 left.
Together they replace plan 016's files 1 and 2 (`docs/plans/016-fork-distribution-01.md`, `-02.md`, stamped
2026-10-01), whose freshness guard failed on most paths after 1,319 commits.

## Context

Plan 016 set out to make stamity's fork support and its distribution correct end to end. Since then the 1.15.0 release
deleted the APM and client-plugin routes, so a third of its units are obsolete, and almost none of the rest landed.
This file carries the minimal set the maintainer chose on 2026-10-23: a fork's release and CI proven on every pull
request, the setup-then-`clean` round trip made exact, a `stamity upgrade` verb, a production shrinkwrap in the
published package, Copilot's touchpoints as skills, and about forty small inbox rows grouped by theme. Out of scope:
plan 016's second tier (the upstream lane's package files, configuration template and App token, fork attestations,
the rest of the release hardening, `check`'s drift cause and the per-file import mode — the Drop list), and the docs
overhaul (Package 21).

## Decisions

### The maintainer's walk (2026-10-23, through the question tool; every answer the recommended option)

Scope: "Two files, minimal set" — file 1 the autonomy model and the defects, file 2 the fork and distribution minimal
set with the small inbox rows by theme; the second tier and the drop list to the inbox with triggers; the cut in its
own session. The autonomy decisions (the ask list, the evidence) are file 1's and bind here too: this file's units add
no act that asks and none that runs without its evidence.

### What plan 016 settled that still stands (re-read against `main` on 2026-10-23)

Kept: a fork release always names its npm dist-tag (moved to file 1's `a11-release-workflows`); `stamity upgrade` as the
only optional CLI item; a fork's gate proven as a fork on every pull request; `clean` keeps user state unless `--purge`;
a no-op `sync` changes no byte; the published package carries its production tree, and the `st` alias goes at 2.0.0;
Copilot's touchpoints as skills, Xcode losing them; the update banner compares with the repository's pin. Gone with
1.15.0: everything about APM, client plugins, catalogs, `release.json`, `plugin-dist` and `st-setup`.

### Declared defaults this file builds (the maintainer may reverse any before the run starts)

- **E1.** `.gitignore` (`b4-gitignore-lines`): only `.env.mcp` becomes conditional on a credential-needing server;
  the other seven lines are written whenever any client is set up, as today, and a census test lists each line's
  writers. Each line the engine appends is recorded, and `clean` takes back exactly those.
- **E2.** `clean --pack` (`b5-import-config-round-trip`) rewrites the hooks documents from the shrunk setup in the same
  run; if the layering test refuses the import, the row closes as a documented residual instead.
- **E3.** `stamity upgrade --to <v>` runs in-process: `--to` must equal the running version, and a different target
  prints the pinned call that runs that release's own `upgrade` (`npx -y <pkg>@<v> upgrade --to <v>`). No spawn.
- **E4.** The bundled skills' Codex companions stay; `b12-repo-file-waste` removes only the touchpoint companion
  written without Codex.
- **E5.** Codex hook commands keep the pinned version (inbox `cut/13` decided: kept); `upgrade` tells a Codex user to
  review the hooks in `/hooks`.
- **E6.** Copilot's setup-steps workflow keeps plan 020 file 2's pin rule (copy the project's action refs, else major
  tags); `b8-copilot-setup-switch` adds only the `managed | user | off` switch.
- **E7.** The published-integrity requirement (`REQ-PLUGIN-054`) lands in `docs/specs/fork-layer.md` beside
  the fork-release requirement at `fork-layer.md:311`.
- **E8.** One writer each: `CHANGELOG.md` is the integration lane's, from each unit's report; no unit edits
  `docs/specs/` (the spec-author merges this delta at Prove); `REQ-FLOW-036`'s hook-entry bound is file 1's.

## Spec delta

Merged into `docs/specs/` by the spec-author at Prove. Requirements several units touch have one entry each.

### REQ-PLUGIN-033 — A fork's gate passes as a fork, proved on every pull request (ADDED)
In `docs/specs/fork-layer.md`, after the fork-release requirement at `fork-layer.md:311`. GIVEN a pull request in `zomarit/stamity`, WHEN CI runs the full side, THEN the job `fork-probe` copies the tree, renames it with `scripts/fork-identity.mjs` to a made-up scope, sets the version to `<X.Y.Z>-fork.1`, regenerates it from the fork guide's `regenerate` list, and runs every step of `npm run check`. It also builds a scratch repository with the fork's own CLI and walks `init`, `add <made-up pack>`, `sync`, `check`, `clean --pack` and `check` there. Each step must exit 0, and `all-ci-checks` reads `success` there and `skipped` in any other repository. GIVEN any file under `test/`, `scripts/`, `src/` or `.github/`, THEN it holds no real-format credential literal and no `scheme://user:password@` URL. `test/gate/fixtureSecrets.test.ts` fails naming the `path:line`.

### REQ-FORK-011 — Public and private compatibility is proved independently (MODIFIED)
In `docs/specs/fork-layer.md:294`, appended as a dated paragraph. GIVEN `test/ci/forkIdentity.test.ts`, THEN no case is skipped because `STAMITY_FORK_SUITE` is unset. The opt-in "inherited gate" group and `IDENTITY_SUITES` are retired, because REQ-PLUGIN-033 probe runs the whole suite in a renamed copy on every pull request. The spelling census stays on.

### REQ-PLUGIN-054 — Both release workflows prove the registry serves the tarball they shipped (ADDED)
In `docs/specs/fork-layer.md`, beside the fork-release requirement at `fork-layer.md:311`. GIVEN a re-run of `release.yml` for a version npm already serves with the packed tarball's sha512 integrity, THEN "Publish to npm with provenance" prints that nothing is to be published and exits 0. When another tarball holds that version, it exits 1 and never publishes. GIVEN any publish in either workflow, THEN "Verify the registry tarball" runs next. It asks the registry for `dist.integrity` up to 12 times, 10 s apart, and exits 1 before "Create GitHub release" unless the answer equals the integrity of the verified `$TARBALL`. Its `run` is byte-equal in both workflows.

### REQ-FLOW-016 — Setup ignores the machine-local files it writes (MODIFIED)
In `docs/specs/everyday-flows.md:490`. Today it says "covers four entries" (`:492`), but the engine writes eight (`src/mcp/env.ts:237-246`). GIVEN `init`, `sync`, `config mcp` or the migration carry, THEN `.gitignore` gets each entry of `requiredGitignoreEntries(...)` it does not already cover. `.env.mcp` is an entry only when a selected server needs a credential or a `.env.mcp` exists on disk. The other seven are entries whenever any client is set up (decision E1): the review gate's three, the pre-flight canary, the run-ended marker, `context-once/` and the client model cache. The ledger records the lines it appended (`coOwned.lines`), and `clean` removes those whose target is gone after its sweep; a filled `.env.mcp`, which `clean` never deletes, keeps its line.

**Amended at build (2026-10-25, ledger row `2026-10-25_autonomy-distribution-02/review/28`, closed fixed):** binds over "`clean` removes those whose target is gone" for `.env.mcp`. Once written, the `.env.mcp` line is never taken back automatically: neither `sync` nor `clean` removes it, whatever one checkout holds. The `.gitignore` and its record are committed and shared, so a checkout without the file must not drop another checkout's ignore rule. The line is still added only when a selected server needs a credential or the file exists. Each `.gitignore` row's hash covers only the engine's recorded lines. While `clean` keeps `.stamity/` for a hook that still runs from it, the machine-local lines stay.

### REQ-FLOW-027 — Setup then `clean` restores the repository byte for byte (ADDED)
In `docs/specs/everyday-flows.md`. GIVEN a fixture repository, WHEN `init -y` for all four clients and then `clean -y` run, THEN every file that existed before is byte-identical, a pre-existing `.gitignore` included, no other file exists, and `git status --porcelain --ignored` prints what it printed before. This holds even after the engine wrote its machine-local files. GIVEN `--import-config supplement` or `replace`, THEN `AGENTS.md` and `CLAUDE.md` come back byte for byte, leading whitespace, BOM and a missing final newline included, and no `AGENTS.md.bak*` remains. GIVEN a `.gitignore` row whose `coOwned.lines` names a line outside `REQUIRED_GITIGNORE_ENTRIES`, THEN `readManifest` raises `CONFIG_ERROR` and nothing is written. GIVEN a `.env.mcp` the owner filled, THEN it stays after `clean -y`, still ignored. GIVEN `clean --pack <id> -y`, THEN no hooks document still runs a script of that pack, Copilot's `.github/hooks/stamity.json` included.

**Amended at build (2026-10-25, review/28):** the byte-for-byte clause reads "every file that existed before is byte-identical, a pre-existing `.gitignore` included, except `.claude/settings.json`'s recorded deny and ask rows and a `.env.mcp` ignore line once written" (the amendment of the REQ-FLOW-016 entry).

### REQ-FLOW-028 — `clean` keeps user state unless `--purge` (ADDED)
In `docs/specs/everyday-flows.md`. GIVEN a setup holding learnings, handoffs, overrides, an installed pack, run records, user hooks, the inbox and verify artifacts, WHEN `clean -y` runs, THEN each of those is byte-identical. The pack's client copies, `.stamity/manifest.json`, `.stamity/generated/`, the review gate's state and the engine's machine-local files are gone: `client-models.json`, `preflight-canary.json`, `run-ended.json` and `context-once/`. So no file is left whose ignore line `clean` removed, and `--json` lists `kept`. WHEN `clean -y --purge` runs, THEN `.stamity/` is gone. GIVEN `--purge --pack x`, THEN `VALIDATION_ERROR` and nothing written. GIVEN a later `init -y`, THEN the kept pack's rows are re-adopted from its receipt, or the pack is named in a warning.

### REQ-PLUGIN-016 — The ledger bound, settings co-ownership, the node row and the pack-reach row (MODIFIED)
In `docs/specs/everyday-flows.md:1257`, the surviving `clean` criterion as a dated amendment. GIVEN `clean -y`, THEN it removes only what the ledger rows name and keeps REQ-FLOW-028 user state. GIVEN `clean -y --purge`, THEN `.stamity/` is absent too, except a hook script a kept hooks document still runs (REQ-FLOW-037), which is named.

### REQ-FLOW-036 — A kept guard keeps the policy copy it reads (MODIFIED)
In `docs/specs/everyday-flows.md:946-948`. Given a kept `.claude/settings.json` whose hook entry runs the guard copy
under `.claude/hooks/stamity/`, When `clean` runs, Then the policy copy that guard reads stays too, so the kept guard
does not fail closed on a missing policy. (The hook-entry bound and the retired rows are file 1's entry.)

### REQ-FLOW-029 — `init --force` never duplicates the charter (ADDED)
In `docs/specs/everyday-flows.md`. GIVEN `init -y`, WHEN `init -y --force` runs, THEN `AGENTS.md` holds one `# Charter` and is byte-identical to the first write, with no `AGENTS.md.bak*`. GIVEN the engine's charter with its markers removed, a corrupt manifest, or a deleted `.stamity/`, THEN still one `# Charter`. GIVEN a recorded `importChoice`, WHEN `init --force` runs, THEN the decision carries over unchanged. GIVEN user prose with no charter and `--import-config supplement`, THEN the prose survives byte for byte.

### REQ-FLOW-032 — A no-op `sync` leaves every file byte-identical (ADDED)
In `docs/specs/everyday-flows.md`. GIVEN a synced repository, WHEN `sync` runs again with no input change, THEN 0 files change and `.stamity/manifest.json` is byte-identical, `updatedAt` included. `sync --json` carries `manifestWritten: false`. GIVEN a sync that changes one emitted file or one manifest field, THEN `updatedAt` moves and `manifestWritten: true`. GIVEN `CLAUDE.md` or a supplemented file after `sync`, THEN its BEGIN marker carries no version. The pinned `npx -y <pkg>@<v>` calls keep theirs (the pinned-call rule).

### REQ-UPSTREAM-016 — Recover an owned branch (MODIFIED, wording)
In `docs/specs/enterprise-upstream-lane.md:646`. "restamps … `updatedAt` on every sync" becomes "restamps … `updatedAt` on every sync that changes the manifest's content (REQ-FLOW-032)". The recovery's `updatedAt` exception stays: a real change still stamps it.

### REQ-FLOW-034 — `stamity upgrade --to <version>` moves a setup to the running release in one step (ADDED)
Lands in `docs/specs/everyday-flows.md`. Given a setup written by A and the CLI running B, with `--to B`: When `upgrade` runs, Then B's own sync runs in-process, the root `package.json` pin moves to B, and the report lists changed, reclaimed and refused paths. Given `--to` other than the running version, Then exit 1 and it prints `npx -y <name>@<to> upgrade --to <to>`, or the pinned `sync` form when `<to>` is below 1.17.0. It refuses and writes nothing when B is older than `generatedBy` (unless `--allow-downgrade`), when the major differs (unless `--allow-major`), or when the planned client set differs (unless `--allow-client-change`). Given a manifest `autonomy` looser than the guard on disk, Then it exits 1 with `AUTONOMY_LOOSENED` and writes nothing unless `--loosen` is passed (the loosen gate file 1 adds, which `sync` also runs). Learnings, handoffs, overrides and run records stay byte-identical. When the setup lists Codex, the report says to review the hooks in `/hooks`.

**Amended at build (2026-10-25, b9's re-review W-1):** there is no client-set refusal and no `--allow-client-change`. The manifest reader already refuses a `tools` entry outside `TOOLS` with `CONFIG_ERROR` (`src/manifest/manifest.ts:1067-1076`), and every `TOOLS` entry has an adapter, so that refusal could never fire. In its plan step, dry run included, `upgrade` starts each selected client's own CLI, unless `STAMITY_NO_CLIENT_PROBE=1` is set. The root `package.json` pin is read through the checked reader, capped at 1 MiB.

### REQ-FLOW-048 — The update notice asks only when its banner can show, compares with the repository pin, and names `upgrade` (ADDED)
`everyday-flows.md`. Given stderr is not a terminal, or `--json` is set, Then no request and no stamp. Given `STAMITY_NO_UPDATE_CHECK` set to `1`, `true` or `yes` (any case, trimmed), Then no request. Given a root `package.json` pin P (else `generatedBy`, else the running version) and a registry answer N > P, Then the banner reads `Update available: P -> N. To move: npx -y <name>@N upgrade --to N. To stay on P, do nothing.`. When N is below 1.17.0, the first release with `upgrade`, the move reads `npx -y <name>@N sync`. It ends with `--allow-major` when the majors differ. The stamp file is keyed by package name.

### REQ-FLOW-022 — First-run output matches what setup did (MODIFIED)
`everyday-flows.md:701-707`. The notice bullet takes the text of REQ-FLOW-048. The `sync --help` bullet names `upgrade --to <version>` first and the pinned `sync` second, as the regenerate-only form. The criterion at `:5539-5541` stays for a target below 1.17.0: "an install pinned at 1.9.1 and a registry answering 1.10.0 … contains `npx -y <name>@1.10.0 sync`". It gains a second case: "GIVEN a pin at 1.17.0 and a registry answering 1.18.0 THEN it contains `npx -y <name>@1.18.0 upgrade --to 1.18.0`". At 1.17.0 or later the move is the `upgrade --to` form. Below it, the pinned `sync` form.

### REQ-FLOW-049 — The published package carries the dependency tree it was tested with, and `st` says it is going (ADDED)
`everyday-flows.md`. Given the packed release tarball, Then it holds `package/npm-shrinkwrap.json`. No row in it is marked `dev`, a `devOptional` row reads `optional`, the root row has no `devDependencies`, and every production and optional row of the gated lock is there. Given the checkout after a pack, Then no `npm-shrinkwrap.json` is at the root. Given `st --version`, Then stdout equals `stamity --version` and stderr is exactly one deprecation line. Given `stamity --version`, Then stderr is empty. The `st` bin goes at 2.0.0.

### REQ-FLOW-033 — Codex's touchpoint companion is written only for Codex (ADDED)
`everyday-flows.md`. Given tools without `codex`, When sync plans, Then no `.agents/skills/st-<id>/agents/openai.yaml` is planned. Given `[codex, cursor]`, Then each of the nine carries it, owned by `codex` alone, and each `SKILL.md` is owned by both. Given a 1.16.0 ledger with those companions and tools `[cursor]`, Then the next sync deletes each one whose row matches and whose bytes hash to the frozen 1.16.0 digest, keeps and names an edited one, and leaves every `SKILL.md` byte-identical. The proof reaches only a closed list of the paths 1.16.0 wrote for its touchpoints and pack commands (companions), each with frozen digests; a ledger row's own hash is never the digest. The bundled skills' own companions are out of scope (decision E4).

### REQ-FLOW-026 — The touchpoints ship as shared skills (MODIFIED)
`everyday-flows.md:871-883`. "with a companion … `agents/openai.yaml`" becomes "with, when Codex is selected, a companion … that Codex alone owns". "Copilot alone gets no shared touchpoint, and its prompt files stay … declares the double listing" becomes "Copilot emits the same shared rows and writes no prompt file (REQ-FLOW-050)". The criterion at `:5600` becomes "GIVEN Copilot selected, alone or beside Codex or Cursor, THEN no `.github/prompts/st-<id>.prompt.md` is written and each touchpoint `SKILL.md` names `copilot` among its owners."

### REQ-FLOW-050 — Copilot gets each touchpoint once, as a shared skill (ADDED)
`everyday-flows.md`. Given tools `[copilot]`, Then nine `.agents/skills/st-<id>/SKILL.md` exist with `disable-model-invocation: true`, and no `.github/prompts/st-<id>.prompt.md`. Given `[copilot, cursor]`, Then each `SKILL.md` is one row owned by both. Given a ledger holding the nine prompt files, Then the next sync keeps each and names it, pack-command prompt files included; `check` lists it with the remedy (the owner deletes it), and every other `.github/` file stays byte-identical. Given the capability matrix, Then Copilot's `command-surface` row says which surfaces load skills, and that Xcode loads none. A prompt file's `model:` line has no successor.

### REQ-FLOW-118 — Copilot's entry and its roles (MODIFIED)
In `docs/specs/everyday-flows.md:4852-4863`. Given `stamity-run.agent.md`, Then it reads `.agents/skills/st-work/SKILL.md`
(not `.github/prompts/st-work.prompt.md`) and is emitted only where the `st-work` skill is planned; its prompt-file
sentence and the 59-minute / `@copilot continue` step each open with "On Copilot's cloud agent", so a CLI or editor
user who picks the agent is not given cloud-only rules.

### REQ-LADDER-007 — Each client carries the pick (MODIFIED)
`docs/specs/model-ladder.md:504-511`. Remove "nor a prompt file's `model:`" and the sentence "A prompt file whose command declares a class carries `model:` only under a pin …". Add: "Copilot's touchpoints are skills, which carry no model key, so an operator pin on a command's class reaches no Copilot file (REQ-FLOW-050)."

### REQ-FLOW-149 — The Copilot setup workflow can be managed, handed over or turned off (ADDED)
In `docs/specs/everyday-flows.md`. Given `toolOptions.copilot.setupSteps` is `managed` (the default) or absent, Then `.github/workflows/copilot-setup-steps.yml` is emitted as today, with the action refs copied from the project, else major tags (`src/adapters/copilot.ts:1140-1155`). Given `user`, Then no row is emitted, the path is released (no reclaim, no ledger row, `clean` leaves it) and `check` reports no drift. Given `off`, Then no row is emitted and ordinary reclaim runs. Any other value is refused with `VALIDATION_ERROR` naming the three values.

**Amended at build (2026-10-26, ledger row `2026-10-25_autonomy-distribution-02/review/71`, from review/66):** binds over
"ordinary reclaim runs" for `off`. Under `off`, `sync` and `clean` take back an unedited copy of
`.github/workflows/copilot-setup-steps.yml` that an earlier release wrote, not only one matching today's rendering. At
that one path, beside today's rendering, the delete is also proven by the Copilot ledger row's recorded SHA-256 when the
bytes on disk, as read or with CRLF read as LF, hash to it and carry the engine's header line
(`withRecordedSetupSteps`, `src/adapters/copilot.ts:191-212` at `p20/b8`; wired at `src/cli/commands/sync/engine.ts:853-854`
and `src/cli/commands/clean.ts:424-425`). It applies only under `off`, only at that path and only for a `copilot` row
(`copilot.ts:196-199`). A copy matching neither, an edited one or one without the header line, is kept and named
`skipped-user-content`. Proven by `test/cli/commands/syncEngine.test.ts` ("off after an upgrade …" and "off: a row
recording an owner's workflow that lacks the engine's header proves no delete") and `test/cli/commands/clean.test.ts`
("takes back under off the unedited workflow an earlier version wrote …"). The residual this leaves is named in
`SECURITY.md` (`b1-fork-ci-job`'s block of this date).

### REQ-FLOW-111 — Readiness on Copilot and Cursor (MODIFIED)
In `docs/specs/everyday-flows.md:4673`. Given a project Node pin that every version it can resolve to sits below the CLI's floor (`22.22.2`, `package.json:27-28`), Then the CLI steps are replaced by a comment naming the pin, its source and the floor, and no `stamity --version` step turns the run red. Given a root `.npmrc`, Then the install step carries `env: NPM_CONFIG_USERCONFIG: ${{ github.workspace }}/.npmrc`. This removes the two Minors in the "As built" bullet (`:4693-4694`).

**Amended at build (2026-10-26, ledger row `2026-10-25_autonomy-distribution-02/review/71`, from review/67):** binds
over "Given a root `.npmrc`". In a git work tree, only a root `.npmrc` that git tracks (`git ls-files` lists it) gives
the install step its `env: NPM_CONFIG_USERCONFIG` lines; an ignored or untracked one gives none. Where git does not
answer for the folder (no repository, git not installed, or git exits non-zero), whether the file exists decides
(`hasCommittedNpmrc`, `src/adapters/copilot.ts:1399-1404` at `p20/b8`). No file means no `env:` lines, and git is not
started. Proven by `test/adapters/copilot.test.ts` ("reads only a committed .npmrc in a git work tree …").

### REQ-FLOW-101 — The unattended pre-flight (MODIFIED)
In `docs/specs/everyday-flows.md`. `token-env` names a variable with a `PWD` segment, such as `MYSQL_PWD`. It still skips `PWD` and `OLDPWD` themselves. `review-state` says the record was not read when the record is over 1 MiB. It no longer says there is no usage line.

### REQ-FLOW-091 / REQ-FLOW-092 (MODIFIED)
In `docs/specs/everyday-flows.md`. `plan check` refuses a Critical risk written as a plain paragraph under Risks. `resolveRepo` reads `ssh.github.com` on port 443 as `github.com`, so an attended `--pr` or `run end` opens its draft there.

### REQ-FLOW-102 — A write to a remote's HEAD ref, and `git remote set-head`, are read as the push they steer (MODIFIED)
In `docs/specs/everyday-flows.md`, on top of file 1's entry (added at session 2 intake for `b14b-default-branch-read`). GIVEN a line the guard judges that writes or deletes a remote's HEAD ref through `git symbolic-ref` or `git update-ref` (its `--stdin` text included), THEN the guard records `push-default` for it. GIVEN `git remote set-head` in any form (automatic, a named branch, a delete), THEN the guard records `push-default` beside `remote-write`, whether or not it knows the origin's repository, so the autonomy setting no longer runs it unasked on the main thread. In both cases the act asks on Claude Code's main thread and Copilot CLI's main agent, and it is refused for a sub-agent, on Cursor and Codex, and while a run is unattended. A read of that ref is not an act, and neither is the run verbs' own write of it (`alignOriginHead`, through the CLI's git runner).

### REQ-FLOW-132 — `run land` accepts a deploying default branch only with the person's approval, and checks before it writes (MODIFIED)
In `docs/specs/everyday-flows.md`, on top of file 1's entry (added at session 2 intake for `b14c-land-batch`). GIVEN a default branch that `autonomy.deployingBranches` also names, WHEN `run land --fast-forward` runs, THEN without the person's approval it asks, before any write; with `--approved <sha>` over the exact head it lands. The verb checks the guard's verdict before it writes the evidence line into the pull request's body, so a refused verdict writes no evidence line, only its `merge waits on:` line. (Amended at build, 2026-10-25, ledger row `2026-10-25_autonomy-distribution-02/review/38`: the code asks before any write, `src/cli/commands/runLand.ts:561-566`, `src/runs/landEvidence.ts:496`.) An approval names the head commit, not the reasons the land asked about; that is a named residual on `SECURITY.md`.

## Units

Rules for every unit (both files):
- A unit's `verify` names only tracked paths and files the unit writes; it never names a records path (`docs/plans/`,
  `.stamity/runs/`, `.stamity/inbox.md`, `evals/runs/`), which a lane worktree does not hold. This plan's coverage check
  and the records suite run once, at the close, from a checkout where the records are restored.
- **Derived files.** A lane regenerates every derived file its own verify reads, and its report names each entry that
  moved and why: the golden snapshots (`npx vitest run test/emit/crossClientGoldens.test.ts
  test/corpus/emissionGoldens.test.ts -u`, files first, the flag last), the generated pages (`node
  scripts/generate-docs.mjs` for `docs/reference/*.md`, `docs/configuration.md` and `docs/cli-reference.md`; `node
  scripts/generate-capability-matrix.mjs` for `docs/capability-matrix.md`), the catalog pins (`node
  scripts/generate-pack-manifests.mjs --write`). This repository's emitted copies (`.claude/`, `.stamity/generated/`,
  `AGENTS.md`, `.stamity/manifest.json`) stay the integration lane's (`npm run build && node dist/cli.js sync`). A
  derived file is never merged by hand: the integration lane resolves a conflict in one by regenerating it from the
  merged tree, regenerates every derived file after each wave, and reads each diff before it commits.
- **One writer each:** `SECURITY.md` is `a16-security-pages`'s in file 1 and `b1-fork-ci-job`'s in file 2 (`b12`,
  `b14b` and `b14c` each hand `b1` an exact sentence in their reports, and `b1` writes it); `CHANGELOG.md` is the integration lane's,
  from the line each unit's report hands it; `docs/specs/` is the spec-author's at Prove; `evals/SET-v7.md` is
  `a17-eval-batch`'s.
- A unit that adds an `import` between `src/` modules runs `test/architecture`; a unit that adds or changes a test runs
  `test/ci/testInputsGuard.test.ts`; a corpus or pack edit runs `test/evals` (an inserted line shifts every later eval
  `source:` range, `test/evals/locators.test.ts`); every unit runs `npm run lint`, `npm run typecheck` and `npm run
  knip`. A changed test carries a `TEST CHANGE, justified:` comment naming its requirement.
- **Whole-tree checks bind over every `verify` cell** (a recorded learning: a narrow verify misses them): every unit
  also runs `test/ci/testInputsGuard.test.ts` and `test/architecture`; a unit that touches `src/hooks/`,
  `src/adapters/`, `src/emit/hooksInfra.ts` or `src/hooks/portableRunner.ts` also runs `test/cloud`; a unit that adds
  a module under `src/` outside `src/cli/`, `src/shared/`, `src/types/` and `src/migration/` wires it into
  `src/composition/root.ts` (the pattern of `config.parse`) and runs `test/composition` (found by file 1 wave 1's full
  suite: `src/config/autonomy.ts` was missing). No lane runs a
  `test/records/` suite: those read records paths and run once at the close.
- **Line numbers are as of `f9abc9c6`** in the cells and their earlier blocks, and as of `864d0111` in each
  "Amended at session 2 intake" block, which binds where the two differ. Earlier units of this file move some lines
  that later cells cite; a builder finds the named function, key or quoted text, never trusting the number alone.
- Pack files carry no `${STAMITY:` placeholder and no CLI call, and pack skill descriptions stay at or under 250
  characters (`test/packs/lint.test.ts`). Public text names no client in the charter.
- **Guard units** (`a2`, `a4`, `a4b`, `a5`, `a6`, `a7`, and file 2's `b14`, `b14b` and `b14c`) describe guard behaviour in reports and
  briefs by `path:line`, the decision reached and its consequence; a test's title names the class of input, and its
  input sits in the test body as today's guard tests do.
- Commits use conventional subjects and `git commit -s`; a lane stages by explicit path and never runs `git add -A` or
  `git stash`; a full suite runs only in the integration lane, alone, under `lockf -k /tmp/stamity-machine.lock`.

### b1-fork-ci-job — every pull request runs this tree as a renamed, suffixed fork, merge-blocking in the canonical repository

| Field | Content |
|---|---|
| `id` | b1-fork-ci-job |
| `requirements` | REQ-PLUGIN-033 (job half), REQ-FORK-011 (MODIFIED) |
| `files` | `scripts/ci/fork-probe.mjs` (new), `test/ci/forkProbe.test.ts` (new), `.github/workflows/ci.yml` (lane map `:19-80`; a job after `cloud-container` `:475-509`; that job's timeout comment `:480-482`; aggregator comment `:740-777`, job `:779-815`), `.github/workflows/nightly.yml` (`:221` timeout and its comment), `test/ci/workflow.test.ts` (lane list `:295-319`; aggregator needs `:621-643`, `:2065-2075`; executed aggregator `Results`/`FULL`/`SHORT`/`PROVEN` `:1245-1300`; proven-push `GATED` `:1041`, `:1300`; one new describe), `test/ci/cloudLeg.test.ts` (`:91-104`), `test/ci/forkIdentity.test.ts` (header `:18-27`; opt-in group `:235-367` removed; imports `:1-7`), plus the test files step 0 finds red on a fork (cap below), `CONTRIBUTING.md` ("What CI proves" `:81-108`), `GOVERNANCE.md` (`:51-78`; `:51-109` at `864d0111`), and from session 2 intake `scripts/ci/records-only.mjs` (header comment only), `test/ci/recordsOnly.test.ts` (comment only), `SECURITY.md` (file 2's one writer: its own `build/5` sentence and the sentences `b12`, `b14b` and `b14c` hand it), `docs/security-mapping.md`, `test/docsPages.test.ts` |
| `interfaces` | **Step 0, measure first.** No measurement exists of which tests fail on a fork today. Run `STAMITY_FORK_SUITE=1 npx vitest run test/ci/forkIdentity.test.ts` (15 suites times 2 fork classes, `test/ci/forkIdentity.test.ts:259-288`), then `node scripts/ci/fork-probe.mjs --keep` once it exists. Write both red lists into the run record. Each red case caused by identity is fixed in this unit: derive the value from `test/support/identity.ts`, or gate it with `canonicalOnly` and its reason, following `forkIdentity.test.ts:230-247`. More than 8 red files means stop and return the list, so the fixes split into a unit of their own. **`scripts/ci/fork-probe.mjs`** is ESM over Node built-ins and git. Its entry guard and header follow `scripts/ci/records-only.mjs`, and it imports `isMain` from `scripts/native-typescript.mjs` as `scripts/fork-identity.mjs:44` does. Usage: `node scripts/ci/fork-probe.mjs [--keep]`. Exit 0 = all passed; 1 = a fork or gate step failed (each named with its exit code and last 40 lines); 2 = could not run (bad argument, not a checkout root, no `node_modules`, copy or `git init` failed). Exports: `FORK_PROBE_IDENTITY = { repository: "https://github.com/fork-probe/stamity-fork", registry: "https://npm.pkg.github.com", scope: "fork-probe" }`; `forkVersion(version, suffix) → "<M>.<m>.<p>-<suffix>.1"` (throws on non-semver); `REGENERATE_COMMANDS` = the guide's `regenerate` list (`docs/enterprise-forks.md:293-299`) minus `npm ci --ignore-scripts`; `MADE_UP_PACK = { name: "fork-probe-pack", files }`, written by `writeProbePack(dir)`, which mirrors `test/support/packFixtures.ts:129-153`; `runSteps(steps, exec) → { exitCode, results }`, with `exec` injected. **Copy, not worktree:** `git ls-files -z --cached --others --exclude-standard` into `mkdtemp`, `node_modules` symlinked, `git init -q -b main`, commit with `-c user.name=fork-probe -c user.email=fork-probe@example.invalid -c commit.gpgsign=false`, as `forkIdentity.test.ts:298-329` does. **Fork steps:** `fork-identity.mjs --repository … --registry …` (today's flags, `scripts/fork-identity.mjs:5-15`; `--suffix` is not in this file's scope); commit; set `version` with `JSON.stringify(pkg, null, 2) + "\n"`; each `REGENERATE_COMMANDS` entry; commit. **Gate steps** (each runs even after another failed): the six parts of `package.json` `scripts.check` split on `&&`, with `npm run test` replaced by `node scripts/ci/test-run.mjs`; then `node dist/cli.js check`; `fork-identity.mjs … --check`; `node scripts/tarball-smoke.mjs`. **Pack walk** with the copy's `dist/cli.js` in a fresh scratch repository: `init -y --tools claude,cursor`, `add <probe pack> --allow-untrusted -y` (the flag `test/cli/commands/clean.test.ts:949` uses), `sync`, `check`, `clean --pack fork-probe-pack -y`, `check`. Last, `git status --porcelain --untracked-files=no` in the copy must be empty. One `PASS\|FAIL <step> (<s>s)` line per step, plus a table to `$GITHUB_STEP_SUMMARY`. **`ci.yml` job `fork-probe`:** `name: fork probe (this tree as a renamed fork)`, `needs: [changes, prove-pr]`, `if:` = `check`'s condition (`:232`) with `github.repository == 'zomarit/stamity' && ` in front, `ubuntu-latest`, `permissions: { contents: read }`, steps: Checkout (the file's pin, `persist-credentials: false`), setup-node 24 with `cache: npm`, `npm ci`, `node scripts/ci/fork-probe.mjs`. **Aggregator:** `needs` gains `fork-probe`; the echo gains `fork-probe=…`; `skipped` is asserted in the proven and lanes shapes; on the full side it asserts `success` when `$REPO` is `zomarit/stamity` and `skipped` otherwise, in the `records` pattern (`:791-796`). The lane map gains a MERGE-BLOCKING bullet. **Timeouts (build/15):** this job's timeout, `cloud-container`'s (`:480-482`, "not yet measured") and nightly hook-fire's (`nightly.yml:221`, 45) are each set to `ceil(2 × slowest)` over the last 10 green runs, read with `gh run list … --json databaseId` and `gh run view <id> --json jobs`. The run ids go in the comment. **review/19:** a helper `flagsOf(args)` splits `--flag=value`. The test refuses `-v`/`--volume*`, `--mount` other than the one read-only bind, `--privileged*`, `--cap-add*`, `--device*`, `--volumes-from*`, and `--pid`/`--ipc`/`--uts`/`--userns`/`--cgroupns`/`--network` set to `host`, whether the value is attached or separate. **Retire** the `STAMITY_FORK_SUITE` group and `IDENTITY_SUITES` and rewrite the header; keep the census. **CHANGELOG** `### Changed` line goes to the integration writer. Follows `ci.yml:625-627` (canonical-only job) and `:475-509` (a full-side, one-leg job). |
| `testCriteria` | `test/ci/workflow.test.ts`: the job list equals today's with `"fork-probe"` after `"cloud-container"`, and the aggregator `needs` contains it. Both fail on the parent. Executed aggregator: a full run in `zomarit/stamity` with `fork-probe` in {failure, cancelled, skipped} exits non-zero; the same in `acme/stamity-private` exits 0 with `skipped` and non-zero with `success`; lanes and proven shapes are non-zero unless `skipped`. The job's condition, evaluated with `evaluateWorkflowExpression` over the four events and both repositories, runs only on the canonical full side. `test/ci/forkProbe.test.ts`: `REGENERATE_COMMANDS` equals the guide's list, parsed from the json block, minus its first entry. The gate steps equal `scripts.check` split on `&&`, in order. `forkVersion("1.16.0","fork")` is `"1.16.0-fork.1"`, `"1.17.0-rc.1"` gives `"1.17.0-fork.1"`, and `"next"` throws. With a fake `exec`, a failing gate step gives 1 and later gate steps still run; a failing fork step gives 1 and no gate step runs; `--bogus` gives 2. `writeProbePack` and `writeMadeUpPack` produce equal trees for one input. `test/ci/cloudLeg.test.ts`: `flagsOf(["--volume=/:/h"])`, `["--pid=host"]`, `["--privileged=true"]` and `["--network","host"]` are each refused (each passes the test on the parent). `git grep -n STAMITY_FORK_SUITE -- test scripts .github` prints nothing. Locally, `node scripts/ci/fork-probe.mjs` exits 0 and the checkout's `git status --porcelain` is identical before and after. Red first: in a scratch copy with one step-0 fix reverted, the probe exits 1 naming the test step. |
| `edgeCases` | A pull request from a contributor's fork runs in the base repository with no secret, so the job runs. A GitHub fork's own CI skips it and the aggregator accepts exactly `skipped`. A proven push or a lanes-only change skips it. A timeout-only failure in the nested suite gets `test-run.mjs`'s one re-run and a `flaky test` line. A gate step that rewrites a tracked file fails the last step, naming the paths. `--keep` keeps the copy and prints its path; otherwise the copy is removed after a failure too. The probe pack is never written under the checkout's `packs/`. |
| `depends_on` | b2-secret-shaped-fixtures, b3-clean-keeps-state, b4-gitignore-lines, b5-import-config-round-trip, b6-init-force-charter, b7-manifest-stable, b8-copilot-setup-switch, b9-upgrade-verb, b9b-readd-synced-pack, b10-shrinkwrap-st, b11-publish-integrity, b12-repo-file-waste, b13-copilot-touchpoints-skills, b14-run-verbs-batch, b14b-default-branch-read, b14c-land-batch, b15-qa-ci-tooling-batch, b16-docs-pointers-batch, b17-test-infra-batch, b18-vendor-claims |
| `verify` | `npx vitest run test/ci/forkProbe.test.ts test/ci/workflow.test.ts test/ci/cloudLeg.test.ts test/ci/forkIdentity.test.ts test/ci/prProven.test.ts test/ci/recordsScript.test.ts test/ci/releaseEgress.test.ts test/ci/tarballStaging.test.ts test/change/classify.test.ts test/docsPages.test.ts test/cloud/containerLeg.test.ts` plus each step-0 file it fixes · `node scripts/ci/fork-probe.mjs` |
| `threat` | Boundary: pull-request code runs inside `fork-probe`. It trusts only the checkout. Abuse: a contributor's pull request edits the probe to leak a credential. Stop: the job reads no secret, holds `contents: read` only, checks out with `persist-credentials: false`, runs on `pull_request` (never `pull_request_target`), and a test pins all four. |

**Amended at assembly:** it also folds inbox `build/4` (a Warning: in a renamed fork copy two codex-deselect cases in
`test/emit/sharedCharterIdentity.test.ts` fail at `:219` and `:650`, `AGENTS.override.md` not reclaimed, so the opt-in
renamed-fork witness is red): step 0's measurement covers it, and it is fixed or split per the step's cap. `depends_on`
also names `b8-copilot-setup-switch` and `b14-run-verbs-batch` (the probe proves the final tree of this file).

**Amended at the plan gate (round 1):** `files`: add `.stamity/change-classes.json` (`testInputs`: add `test/ci/forkProbe.test.ts` to the `docs/**` entry at `.stamity/change-classes.json:78`, because the test parses `docs/enterprise-forks.md`). The `ci.yml` locators become: aggregator comment `:744-778`, job `:779-815`, the `records` pattern `:794-798`, and the `cloud-container` job `:475-498` (`:500-509` is the `lanes` comment). This replaces `:740-777`, `:791-796` and `:475-509`. Add to `interfaces`: **Machine lock (W-12).** Step 0's two runs (`STAMITY_FORK_SUITE=1 npx vitest run test/ci/forkIdentity.test.ts`, then `node scripts/ci/fork-probe.mjs --keep`) and the probe in `verify` each run as `lockf -k /tmp/stamity-machine.lock <command>`. They run in the last wave with no other lane or suite running, so the cap ("more than 8 red files") counts identity failures, not load. **Timeouts (build/15, M-4; replaces the cell's rule):** `fork-probe` has no green run yet. Its first `timeout-minutes` is `ceil(2 × the probe's wall time in step 0)`, and its comment says "measured locally <date>, re-measure after 10 green runs". `cloud-container`'s timeout is `ceil(2 × slowest)` over its last 10 green runs, with the run ids in the comment. Nightly hook-fire's (`nightly.yml:221`) is `max(45, ceil(2 × slowest))`, and its comment says every measured run was the unarmed, no-secret shape. The two unmeasured ceilings each get a follow-up row: `when: 10 green fork-probe runs exist` and `when: the first armed hook-fire run`. `depends_on`: every other unit of this file (`b2`–`b18`). `b1` runs alone in the last wave. `verify`: `npx vitest run test/ci/forkProbe.test.ts test/ci/workflow.test.ts test/ci/cloudLeg.test.ts test/ci/forkIdentity.test.ts test/ci/prProven.test.ts test/ci/recordsScript.test.ts test/ci/releaseEgress.test.ts test/ci/tarballStaging.test.ts test/change/classify.test.ts test/docsPages.test.ts test/cloud/containerLeg.test.ts test/ci/testInputsGuard.test.ts` plus each step-0 file it fixes · `lockf -k /tmp/stamity-machine.lock node scripts/ci/fork-probe.mjs`

**Amended at session 2 intake (2026-10-25, against `864d0111`):** Binds over the cell and the earlier blocks where
they differ. **Line moves.** File 1 moved lines in `test/ci/workflow.test.ts`: the job list is `:331-341`, the
aggregator `needs` `:645-653` and `:2089-2097`, the executed aggregator's `Results`/`FULL`/`SHORT`/`PROVEN`
`:1266-1322`, and `GATED` `:1063` and `:1322`. `scripts/fork-identity.mjs` imports `isMain` at `:47`. `GOVERNANCE.md`'s
section runs `:51-109`. Step 0's `canonicalOnly` pattern is at `test/ci/forkIdentity.test.ts:213`. The `ci.yml`
locators of the plan gate's block stand. **Runner image.** `ci.yml` stays on `ubuntu-latest`, while file 1 pinned the
release workflows to `ubuntu-24.04` (`.github/release-egress.md`, "The runner image"). The "last 10 green runs" for
`cloud-container` can span a move of `ubuntu-latest`, so its comment names the image of each run it counts.

**Folds ledger row `2026-10-23_autonomy-distribution-01/build/5`** (Warning, security; inbox `.stamity/inbox.md:413`).
Today the `changes` job runs `node scripts/ci/records-only.mjs` from the change's own checkout (`ci.yml:181-185`). That
script loads `src/change/classify.ts`, which loads `src/roster/triggers.ts`, which imports nothing
(`test/ci/recordsOnly.test.ts:525-549` walks that closure). So a change can edit the code that picks its own checks, and
`run land` does not ask about those files (`src/runs/landEvidence.ts:46-59`).
- **`files`:** add `scripts/ci/records-only.mjs` (header comment `:29-32` only) and `test/ci/recordsOnly.test.ts`
  (comment `:553-555` only).
- **`interfaces`, the `changes` job:** permissions `{ contents: read }`, checkout with `persist-credentials: false` and
  `fetch-depth: 0`, triggers and outputs all unchanged. Only the step "Classify the change" changes, and its logic stays
  inline in `ci.yml`: a CI definition asks at land, and a new script under `scripts/ci/` would not. The step checks that
  `BASE_SHA` is 7 to 64 hex characters and not all zeros, adds a detached worktree of that commit at
  `$RUNNER_TEMP/classifier-base`, and checks that the worktree holds `scripts/ci/records-only.mjs`. When all three hold,
  it runs that copy with `--base "$BASE_SHA"`. Otherwise it prints "records-only: no base commit to run the classifier
  from, so full CI" to stderr and writes the five lines `full=true`, `lanes=[]`, `suites=`, `site_build=true`,
  `cli_check=false` to `$GITHUB_OUTPUT`, the same five `fullCi(…, true)` gives (`records-only.mjs:89-91`), running no
  classifier code. The worktree sits outside the workspace, as the `records` job builds its own (`ci.yml:659`). The
  working folder stays the head checkout, so `git diff <base> HEAD` and the read of the base's
  `.stamity/change-classes.json` see what they see today (`records-only.mjs:177-209`); only the change list comes from
  the head. No install is needed: the closure is erasable TypeScript over Node built-ins, and
  `test/ci/recordsOnly.test.ts:837-859` already runs a copy of it from another folder with no `package.json`. The comment
  above the step (`:174-175`) and the lane map's `changes` bullet (`:20-31`) each gain one sentence: the classifier runs
  from the base commit, and no base means full CI. `GOVERNANCE.md:86-87` and CONTRIBUTING's "What CI proves" say the
  same.
- **`testCriteria`**, in `test/ci/workflow.test.ts`: (1) the case at `:790-820` changes, with `TEST CHANGE, justified:
  the classifier runs from the base commit (ledger build/5)`: `classify.run` contains `git worktree add --detach
  "$BASE_TREE" "$BASE_SHA"` and `node "$BASE_TREE/scripts/ci/records-only.mjs" --base "$BASE_SHA"`, and never `node
  scripts/ci/records-only.mjs`; permissions, checkout `with` and outputs stay as pinned; `Object.keys(ci.workflow.on)`
  equals `["push", "pull_request", "workflow_dispatch", "schedule"]`, so `pull_request_target` and `workflow_run` are
  pinned out. (2) A new case runs the step's body under `bash -e` with `GITHUB_EVENT_NAME`, `RUNNER_TEMP` and
  `GITHUB_OUTPUT` set, skipped where `AGGREGATOR_EXECUTABLE` (`:1238-1239`) is false. A scratch repository commits the
  real closure at the base; the head rewrites `scripts/ci/records-only.mjs` to answer `full=false` for every path and
  adds `src/x.ts`. The output is `full=true`, which fails on the parent (it runs the head's script). A spec-only head
  gives `full=false` and `lanes=["specs"]`. An empty `BASE_SHA`, forty zeros, an unknown 40-hex sha, and a base with no
  `scripts/ci/records-only.mjs` each give exactly the five fallback lines.
- **`edgeCases`:** a push to `main` takes `github.event.before`, the earlier tip of `main`, as its base. A proven push
  still runs `changes` beside `prove-pr`, from the same base, and the aggregator needs it `success` in every shape
  (`ci.yml:793`). A first commit or a new ref (an all-zero base), a schedule and a dispatch (an empty base) take the
  fallback, and so does a base git cannot find, since the worktree step fails. The `records` branch is unaffected:
  `ci.yml` runs only on pushes to `main` and pull requests into `main` (`:125-129`), and the `records` job needs no
  `changes` (`:625-631`). A pull request that changes the classifier is classified by the base's copy, so its effect
  shows from the next pull request, and its own diff still takes full CI, because no lane holds the closure
  (`recordsOnly.test.ts:567-584`). A pull request that adds a classifier output reads it empty for that one run, and
  every condition reads empty as the full side (`ci.yml:232`, `:514`). A missing base answers full CI rather than a red
  `changes` job, matching the classifier's existing rule that an unreadable base means full CI (`ci.yml:26-31`); this is
  the researcher's declared default and can be reversed.
- **`verify`:** add `test/ci/recordsOnly.test.ts`.

**`SECURITY.md`, file 2's one writer.** This unit writes every `SECURITY.md` change of file 2, each sentence exactly as
the handing unit's report gives it, and pins each new sentence in `test/docsPages.test.ts`:
- its own, at `SECURITY.md:108`, the Residual column: after "…and the review loop is the defence." add "This
  repository's own CI runs its classifier from the base commit (the `changes` job in `.github/workflows/ci.yml`), so a
  change here cannot choose its own checks that way, and a change to that job is a CI definition, which `run land` asks
  about." The generic sentence stays, since `test/docsPages.test.ts:5440` pins it;
- `b12-repo-file-waste`'s sentence for the ledger row at `SECURITY.md:95` (the retired-path proof);
- `b14b-default-branch-read`'s replacement at `SECURITY.md:610-613`, the same change at
  `docs/security-mapping.md:391-393`, and the re-pins at `test/docsPages.test.ts:5410-5411` and `:5497`;
- `b14c-land-batch`'s review/174 residual sentence.
Where `docs/security-mapping.md` carries the same text as a changed `SECURITY.md` sentence, it gets the same change.

**Amended at build (2026-10-25): the hand-offs `b1` takes from other units' reports**, each written as the report gives
it:
- `b9-fixer-r1.md`: the "Network and data handling" verb list at `SECURITY.md:213-215` and
  `docs/security-mapping.md:241` names `upgrade` (ledger review/10's follow-through, and the re-review's W-2).
- `b9-fixer-r1.md`, review/14: the `AUTONOMY_LOOSENED` lists at `SECURITY.md:109` and `docs/security-mapping.md:227`
  name `upgrade`.
- `b17-implementer-r1.md`: the `CONTRIBUTING.md` line on `STAMITY_TEST_MAX_WORKERS`.
- `b12-implementer-r1.md`: the sentence for the ledger row at `SECURITY.md:95` (the closed list of companions), in place
  of the intake block's draft.
- `b14b-default-branch-read`: its sentence, as named above.
- `b14c-land-batch`: the land residual sentence is the one under "For b1" in `b14c-fixer-r1.md`, which replaces the
  one in `b14c-implementer-r1.md` and the cell's draft.
`files`: add `SECURITY.md`, `docs/security-mapping.md` and `test/docsPages.test.ts`. `depends_on`: add
`b14b-default-branch-read` and `b14c-land-batch` (every other unit of this file, `b2`–`b18`, as before).

**Amended at build (2026-10-26, review/71): a hand-off from `b8-copilot-setup-switch`, for ledger row review/70.**
`SECURITY.md` gains this sentence, written as given, in the row that names what a hand-edited ledger row can reach
(this unit's report names where it went), and `docs/security-mapping.md` gets the same where it carries that row: "With
`copilot.setupSteps` set to `off`, an edit to `.stamity/manifest.json` that records the hash of an owner's own
`.github/workflows/copilot-setup-steps.yml` which carries the engine's header line gets that file deleted at the next
`sync` or `clean`, the same exposure the overwrite path already has there, and the manifest is a person-only path that
`run land` asks about." Grounds, at `p20/b8`: the delete proof at `src/adapters/copilot.ts:191-212`; the manifest held at
`src/change/personOnlyPaths.ts:62` and asked at land through `LAND_ASK_PATHS` (`src/runs/landEvidence.ts:57-59`). Pinned
in `test/docsPages.test.ts` as this unit's other sentences are.

### b2-secret-shaped-fixtures — fixtures build example credentials at run time, and a guard keeps literals out

| Field | Content |
|---|---|
| `id` | b2-secret-shaped-fixtures |
| `requirements` | REQ-PLUGIN-033 (fixture rule) |
| `files` | `test/mcp/secretScan.test.ts` (`:13-18`, `:107-108`, `:115`), `test/cli/commands/validate.test.ts` (`:325`), `test/cli/commands/check.test.ts` (`:1608`), `test/mcp/env.test.ts` (`:311-312`), `test/merge/bakEscape.test.ts` (`:202`, `:357`), `test/merge/writeEscape.test.ts` (`:211`), `test/ci/forkIdentityScript.test.ts` (`:342`, `:380`, `:411-412`, `:515`), `test/ci/forkReleaseWorkflow.test.ts` (`:558`), `test/cli/commands/gatePreflight.test.ts` (`:303`), `test/cli/kit/packageName.test.ts` (`:203`, `:231`), `test/runs/preflight.test.ts` (`:633`), `test/runs/pullRequest.test.ts` (`:370`), `test/shared/cliCall.test.ts` (`:202`), `test/upstream/lane.test.ts` (`:280`, `:2095`, `:2111`), `scripts/upstream.mjs` (comment `:1023`), `scripts/leak-gate.mjs` (`SECRET_SCANNER_SOURCES` `:469`, `SHAPE_FIXTURES` `:479-483`), `test/gate/leakGateEvasion.test.ts` (`:643-662`), `test/gate/fixtureSecrets.test.ts` (new) |
| `interfaces` | **Census at `f9abc9c6`** (read-only scan with the eleven `SECRET_RULES` of `scripts/leak-gate.mjs:578-590`, each with its trailing boundary dropped, plus the userinfo rule `[a-z][a-z0-9+.-]*://[A-Za-z0-9._~%!*+,;=-]+:[A-Za-z0-9._~%!*+,;=-]+@`, over 874 files under `test/ scripts/ src/ .github/`). It found 14 credential-shape lines in 7 test files and 19 userinfo lines in 12 files (11 test files plus the comment at `scripts/upstream.mjs:1023`), 30 distinct lines in all; `src/` and `.github/` hold none. The ones above are new since the old census: `check.test.ts:1608` (moved), `gatePreflight.test.ts:303`, `packageName.test.ts:203,231`, `preflight.test.ts:633`, `pullRequest.test.ts:370` and `cliCall.test.ts:202`. **Fixtures:** each literal is built at run time with a join idiom that breaks the shape in source and leaves the runtime value byte-identical, e.g. `["AKIA","IOSFODNN7EXAMPLE"].join("")`, and URLs split at `@`. No expectation moves. **Gate:** `SECRET_SCANNER_SOURCES = ['src/mcp/secretScan.ts']` and `SHAPE_FIXTURES = {}`, with the comment "empty is the steady state; `test/gate/fixtureSecrets.test.ts` holds the tree to run-time assembly". **Guard** `test/gate/fixtureSecrets.test.ts` imports `RULES` (`leak-gate.mjs:702`). It builds an unbounded matcher per credential id and `USERINFO_URL`, and a pure `scanFiles(root, relPaths, matchers) → { path, line, rule }[]` that skips NUL files. Its messages print `path:line rule`, never the text. The guard holds no literal of any shape. Follows `scripts/leak-gate.mjs:459-469` (exemption by path, printed). |
| `testCriteria` | `fixtureSecrets.test.ts`: case 1, all eleven ids are present and each unbounded source differs from its bounded one only by the tail; case 2, one run-time canary per id matches (a 38-character `ghp_` matches the unbounded matcher and not the bounded one); case 3, `scanFiles` over `test/` returns `[]`; it returns 14 credential hits on the parent, so it fails there; case 4, the userinfo matcher over `test/ scripts/ src/ .github/` returns `[]` (19 on the parent); case 5, a temp file with `https://u:p@h/x` gives one hit, while `${TOKEN}` templates and `<user>:<token>` placeholders give none. `npm run gate` passes, and no `not scanned (rule …)` line names a `test/` path. Every edited suite passes with an unchanged case count. `leakGateEvasion.test.ts`'s "shape-fixture" case is re-pinned onto the scanner source (`TEST CHANGE, justified: no test path is a shape fixture any more`). |
| `edgeCases` | A new fixture that needs a credential shape makes the guard fail at its line. The remedy is run-time assembly; no exemption exists for `test/`. `src/mcp/secretScan.ts` stays exempt from the credential shapes and is still scanned for every other rule. A plan or a run record keeps the shape: `docs/plans/**` is a record and outside the scan. A non-UTF-8 test file is skipped by the guard, and the leak gate's decoders still read it. |
| `depends_on` | docs/plans/022-autonomy-distribution-01.md |
| `verify` | `npx vitest run test/gate test/ci/leakGate.test.ts test/mcp test/cli/commands/validate.test.ts test/cli/commands/check.test.ts test/cli/commands/gatePreflight.test.ts test/cli/kit/packageName.test.ts test/runs/preflight.test.ts test/runs/pullRequest.test.ts test/shared/cliCall.test.ts test/merge/bakEscape.test.ts test/merge/writeEscape.test.ts test/ci/forkIdentityScript.test.ts test/ci/forkReleaseWorkflow.test.ts test/upstream/lane.test.ts test/ci/forkIdentity.test.ts` · `npm run gate` |

**Amended at the plan gate (round 1):** `files`: add `.stamity/change-classes.json` (`testInputs`: add `test/gate/fixtureSecrets.test.ts` to the `test/**` entry at `.stamity/change-classes.json:180-186`, beside the other whole-tree scanners). Add to `verify`: `test/ci/testInputsGuard.test.ts` in the vitest list.

**Amended at session 2 intake (2026-10-25, against `864d0111`):** The census, re-run at HEAD with the same rules over
the same roots, finds 14 credential-shape lines in 6 test files and 20 userinfo lines in 13 files (12 test files plus
the comment at `scripts/upstream.mjs:1023`): 31 distinct lines. `src/` and `.github/` still hold none. File 1 added one
userinfo line, `test/hooks/personOnly.test.ts:3838`. Add that file to `files` and to `verify`. It is a guard suite:
keep its case title as it is and change only the literal in the case body, split at `@`. Two lines moved:
`test/cli/commands/check.test.ts:1608` is now `:1618`, and `test/ci/forkReleaseWorkflow.test.ts:558` is now `:559`.
Case 3 stays at 14 credential hits on the parent. Case 4 reads 20 on the parent, not 19. The leak-gate locators
(`scripts/leak-gate.mjs:469`, `:479-483`, `:578-590`, `:702`) and `test/gate/leakGateEvasion.test.ts:643` are
unchanged. (The cell's "7 test files" for credential shapes was not reproduced at HEAD; the guard's own count, case 3,
is the check.)

### b3-clean-keeps-state — `clean` removes the setup and keeps your state; `clean --purge` removes `.stamity/`

| Field | Content |
|---|---|
| `id` | b3-clean-keeps-state |
| `requirements` | REQ-FLOW-028, REQ-PLUGIN-016 (MODIFIED), REQ-FLOW-036 (MODIFIED), REQ-FLOW-037 (the kept hook script, unchanged) |
| `files` | `src/cli/commands/clean.ts` (header `:46-103`; `planCleanCandidates` `:119-121`; `removeStateDir` `:495-511`; summary `:957`; `configure` `:959-965`; confirmation `:1014-1018`; the state-dir decision `:1036-1041`; dry-run text `:1060-1064`; JSON `:1076-1086`), `src/emit/stateScaffold.ts` (new `removeStateScaffold`), `src/pack/install.ts` (new `adoptInstalledPacks`, beside `applyPackInstall` `:1538`), `src/cli/commands/init/apply.ts` (pack carry `:293`), `src/merge/reclaim.ts` (`pruneEmptyParents` `:1217-1227`; its call after a missing file, `:824`, `:874`, `:917`, `:1412`), `src/manifest/hookDocuments.ts` (`hookScriptReader.runs` `:744-765`), `src/manifest/claudeSettings.ts` (head comment `:14-19` only), `test/cli/commands/clean.test.ts`, `test/emit/stateScaffold.test.ts`, `test/pack/install.test.ts`, `test/cli/commands/initApply.test.ts`, `test/merge/claudeHookCopies.test.ts`, `test/merge/reclaim.test.ts`, `test/manifest/hookDocuments.test.ts` |
| `interfaces` | **Today:** full `clean` makes every row a candidate, `pack:` rows included (`clean.ts:119-121`), then `rm -r .stamity` (`:495-511`). The question says "learnings, handoffs and installed packs included" (`:1017`). The `st-setup` fold of the old unit is obsolete: that command was plugin-only and was deleted in 1.15.0, and `git grep 'clean -y' -- content` finds nothing, so no eval range moves. **New flag** `--purge`, "also delete the whole .stamity/ directory: learnings, handoffs, overrides, installed packs and run records". `--purge` with `--pack` raises `CliFailure` `VALIDATION_ERROR` "--purge deletes the whole state directory and cannot be combined with --pack". `planCleanCandidates(manifest, opts: { purge: boolean })`: without `purge`, `pack:` rows are not candidates; the projected copies, which are adapter rows, still are. **Default order:** confirm (``…Learnings, handoffs, overrides, run records and installed packs under .stamity/ stay; --purge deletes them too.``); sweep; then, on live runs only, unlink the review gate's state (`review-gate.json`, the `.lock` directory, `review-gate.json.tmp-*`), unlink `.stamity/manifest.json` (regular file only), `removeStateScaffold(rootDir): Promise<string[]>` (unlinks each `stateKeepPaths()` file whose bytes equal `STATE_KEEP_CONTENT`), and prune empty folders bottom-up, `.stamity/` itself when empty. Every path a kept hooks document runs is kept with its folders, which replaces today's keep-everything at `:1036-1041`. `--purge` keeps today's order. JSON adds `purge`, `kept: string[]` (top-level entries left, folders ending in `/`, sorted) and `packsKept`; `stateDirRemoved` is true only when `.stamity/` is gone. **`adoptInstalledPacks(rootDir, skip): Promise<{ rows; adopted; refused: { dir; packId; reason }[] }>`:** for each folder under `.stamity/packs/` with a regular `receipt.json`, the id must map to that folder (`packDirRelPath`, `src/pack/receipt.ts:71`), and every file must lie under it, carry a 64-hex sha256 and hash to it. It returns the rows `applyPackInstall` records. `init` appends them after the `--force` carry (`apply.ts:293`), and each refusal becomes a panel warning naming `stamity add`. **build/5:** a `skipped-missing` entry also runs `pruneEmptyParents`, so an emptied `packs/<id>/<class>/` folder goes. **build/89:** re-measure first, after `03517f12` stopped writing the old copies: in a temp repository, `init --tools claude`, add an owner key to `.claude/settings.json`, `clean -y`, then run the kept guard. If it is still red with `POLICY_UNREADABLE`, `hookScriptReader.runs(text, path)` also answers true for `CLAUDE_HOOK_POLICIES_PATH` (`src/adapters/claude.ts:287`) when the text runs any script under `CLAUDE_HOOKS_DIR` (`src/hooks/model.ts:42`; `hookDocuments.ts` already imports it). If green, the row closes as fixed. **build/103:** the head comment's "owns each allow row, deny row, ask row and hook entry it wrote" becomes "owns each allow row and hook entry it wrote, and records the deny and ask rows it added without ever owning one (below)". Follows `clean.ts:745-948` (the scoped clean's dry-run and JSON shape) and `init/apply.ts:293` (carry only what is on disk). |
| `testCriteria` | `clean.test.ts`: after init (claude), plus one learning, handoff, override, `.stamity/hooks/probe.mjs`, run record, inbox row, verify artifact and one made-up pack added and synced, `clean -y` keeps each byte-identical, and `.stamity/packs/<dir>/**` too. The pack's copies, the manifest, `.stamity/generated/` and every `review-gate.json*` are gone. `kept` lists the eight folders, `stateDirRemoved: false`. Fails on the parent, where `.stamity/` is removed. `--purge` removes `.stamity/`. A fresh init with no user state, then `clean -y`, gives `stateDirRemoved: true`. `--purge --pack x` exits with `VALIDATION_ERROR`, unchanged tree. A user-edited `.gitkeep` stays. `initApply.test.ts`: after that `clean -y`, `init -y --tools claude` re-records the pack's rows with their old hashes and `check`'s `pack-integrity` passes. An edited pack file means no rows and one warning. `clean.test.ts`: `clean --pack <id>` after the class's only file was moved out leaves no empty `packs/<id>/<class>/` (red on the parent). `claudeHookCopies.test.ts`: a kept settings file running the guard keeps `CLAUDE_HOOK_POLICIES_PATH`, and that guard exits 0 on a benign call (red on the parent if the re-measure confirms). Re-pins of `clean.test.ts` cases that assert pack rows as candidates, `.stamity/` removed, the old question text and the dry-run sentence, each with `// TEST CHANGE, justified: REQ-FLOW-028 — clean keeps user state unless --purge`. |
| `edgeCases` | A clean interrupted after the sweep leaves the manifest, so a re-run finishes. A held `review-gate.json.lock` is removed anyway: it is machine-local. A pack folder with no `receipt.json` is neither adopted nor named. A receipt naming another folder is refused. A workspace root's `.stamity/workspace-sync-journal.jsonl` is kept. A retained hook script under `.stamity/generated/` stays with its folders until its hooks document stops running it. |
| `depends_on` | b5-import-config-round-trip, b4-gitignore-lines, b9b-readd-synced-pack (`src/pack/install.ts`, added at build) |
| `verify` | `npx vitest run test/cli/commands/clean.test.ts test/emit/stateScaffold.test.ts test/pack/install.test.ts test/cli/commands/initApply.test.ts test/merge/claudeHookCopies.test.ts test/merge/reclaim.test.ts test/merge/reclaim.property.test.ts test/manifest/hookDocuments.test.ts test/manifest/claudeSettings.test.ts test/merge/hookFilesOwnership.test.ts test/merge/settingsOwnerEntries.test.ts test/cli/commands/add.test.ts test/cli/ledgerForgery.test.ts test/cli/docs/cliReference.test.ts test/architecture/boundaries.test.ts` · `node scripts/ci/test-run.mjs --coverage` (keeps `src/emit/**` at its floor, `vitest.config.ts:224`) |
| `threat` | Boundary: `.stamity/packs/*/receipt.json` and the committed manifest are repository data. Abuse: a planted receipt lists `src/index.ts` with its hash, so `init` adopts it and a later `clean --pack` deletes it. Stop: every adopted file must lie under its own pack folder and hash to the receipt, or the pack is refused. The policy-copy hold only keeps a file, it never deletes one. |

**Amended at assembly:** it also folds inbox `cut/8` (`src/cli/commands/clean.ts`: an ordinary full `clean --dry-run`
labels every recorded path orphaned and some "Recorded by adapter-removed", wording that reads as damage on a healthy
setup): the dry run names what it would remove in plain words, and `orphaned` is kept for a row whose adapter is truly
gone. Inbox `build/90` (REQ-FLOW-036's bound) is file 1's, not this unit's.

**Amended at the plan gate (round 1):** Add to `interfaces`: **Machine-local files (W-5).** On live runs, the default `clean` unlinks these with the review gate's state: `PREFLIGHT_CANARY_FILE` (`src/mcp/env.ts:187`), `RUN_ENDED_MARKER_FILE` (`:204`), every regular file directly under `CONTEXT_ONCE_DIR` (`:212`) and then that folder once empty, and `CLIENT_MODELS_CACHE_FILE` (`:223`). Each is `lstat`-checked and must be a regular file. A link is left and named. This way `b4`'s reducer, which removes their ignore lines at `clean`, leaves no un-ignored engine file. `--purge` removes `.stamity/` as before. `kept` never lists them. **build/103 (M-5, M-6):** the row is `2026-10-15_cloud-runs/build/103`. File 1's `a4b-claude-rows` rewrites this head comment first (`claudeSettings.ts:14-36`). This unit only checks the result. If the result still says the engine owns a deny or ask row, it becomes: "owns each allow row and hook entry it wrote; a deny or ask row it added is recorded and never owned: `clean` keeps it, and `sync` removes only a recorded row this version no longer writes (`RETIRED_CLAUDE_ROWS`)". Otherwise the row closes as fixed by `a4b`. The inbox-rows table names the row `2026-10-15_cloud-runs/build/103`. Add to `testCriteria`: `roundTrip.test.ts` seeds `.stamity/client-models.json`, a fresh `.stamity/preflight-canary.json`, `.stamity/run-ended.json` and one `.stamity/context-once/<64 hex>` after `init -y` for four clients. After `clean -y`, none of the four exists, `git status --porcelain --ignored` prints what it printed before init, and no `.gitignore` line remains for them (red on the parent). A `client-models.json` that is a link is kept and named. `depends_on`: b5-import-config-round-trip, b4-gitignore-lines (the machine-local lines `b4` takes back).

**Amended at the plan gate (round 3):** the order inside a live `clean`: the sweep, then the machine-local deletions
(round 1's block), then the review gate's state and the manifest, and last the `.gitignore` reduction (`b4`), so the
reduction sees which targets are gone. One `roundTrip.test.ts` case proves both at once: after `init -y` for four
clients, the machine-local files written and a filled `.env.mcp`, `clean -y` leaves no ignore line for the
machine-local files and keeps `.env.mcp` ignored.

**Amended at session 2 intake (2026-10-25, against `864d0111`):** Line moves: the pack carry is
`src/cli/commands/init/apply.ts:306`, and `adoptInstalledPacks`'s rows are added there, before the plan and before the
loosen gate (`apply.ts:345-350`), because the planner and `installedPackServers` (`:414`) read packs off that ledger.
`hookScriptReader.runs` is `src/manifest/hookDocuments.ts:789-796`. **build/103:** file 1 did not fix the head
sentence. `src/manifest/claudeSettings.ts:15-20` still says the engine owns each deny and ask row and never removes one,
while `:22-39` says otherwise. Replace the bold sentence and the next one with: "**the engine owns each allow row and
hook entry it wrote, recorded on the ledger row by the hash of its canonical JSON (`LedgerEntry.coOwned`), and nothing
else in the file. A deny or ask row it added is recorded and never owned: `clean` keeps it, and `sync` removes only a
recorded row this version no longer renders (one of `RETIRED_CLAUDE_ROWS`, or an ask row the autonomy setting does not
render).** It never replaces an owner's row, any other member of `permissions`, or an entry it did not write; …",
keeping the rest of the existing sentence. This binds over the round-1 block's build/103 text. **build/89:** the premise
holds at HEAD. The tool-policy guard fails closed on a missing policy copy (`src/hooks/scripts.ts:2355-2365`,
`:2416-2421`), and no settings entry names that copy. File 1's trailing script word (`hookDocuments.ts`,
`namesItsOwnScript`) names only the script. Re-measure first, as written. That guard refuses only an agent under its
governed prefix (`src/hooks/scripts.ts:2384`), so both the re-measure and the `claudeHookCopies.test.ts` case use a
governed agent id. Otherwise the call exits 0 even with the policy copy missing, and the case is not red on the parent.

**Amended at build (2026-10-25, a note from `b4`'s round 2):** `b4`'s rule that keeps every machine-local ignore line
while `.stamity/` is kept (`src/cli/commands/clean.ts`, review/29) relies on a re-run reading the manifest. This unit
unlinks `.stamity/manifest.json` while it keeps hook paths, so it must keep the take-back working: take the lines back
before the unlink, or keep the record the take-back reads. A case in `test/cli/commands/roundTrip.test.ts` proves it.

### b4-gitignore-lines — `.gitignore` gets a line only for what is set up, and `clean` takes back exactly the lines it added

| Field | Content |
|---|---|
| `id` | b4-gitignore-lines |
| `requirements` | REQ-FLOW-027 (`.gitignore` part), REQ-FLOW-016 (MODIFIED) |
| `files` | `src/mcp/env.ts` (`REQUIRED_GITIGNORE_ENTRIES` doc `:225-236`; `ensureGitignoreEntry` `:702-719`; new exports), `src/manifest/ownedPaths.ts` (`.gitignore` joins `exact`, `version` 3 → 4, `:85`), `src/manifest/manifest.ts` (`coOwned.lines` bound beside `:424-436`), `src/cli/engine/emissionWrite.ts` (`coOwnedReclaimReducers` `:866-878`), `src/cli/commands/sync/engine.ts` (`:1201`; report field), `src/cli/commands/sync/report.ts`, `src/cli/commands/init/apply.ts` (`:531`), `src/cli/commands/config/mcp.ts` (`:479`), `src/cli/engine/clientModels.ts` (`:818`), `src/migration/carry.ts` (`:690`), `src/cli/commands/clean.ts` (header `:94-95`; closing line `:1072`), `test/mcp/env.test.ts`, `test/manifest/manifest.test.ts`, `test/manifest/ownedPaths.test.ts`, `test/cli/commands/syncEngine.test.ts`, `test/cli/commands/initApply.test.ts`, `test/cli/commands/initPanel.test.ts`, `test/cli/commands/configMcp.test.ts`, `test/cli/commands/workspace.test.ts`, `test/cli/commands/clean.test.ts`, `test/cli/commands/roundTrip.test.ts` (new), `docs/getting-started.md` (`:358-380`) |
| `interfaces` | **Today:** eight entries (`src/mcp/env.ts:237-246`), all appended by five callers whatever is set up. No row records a line, and `clean` prints "Left your .gitignore untouched" (`clean.ts:1072`). `CoOwnership.lines`, `createdFile` and `terminatorAdded` already exist (`src/types/manifest.ts:139-144`), and `manifest.ts:424-436` checks `lines` for shape only. **Step 0:** a census test lists the writers of each entry (`git grep` of each constant over `src/`: review-gate in `claude.ts`, `gate.ts`, `scripts.ts`; context-once in `scripts.ts` for Cursor; canary and run-ended in the guard and `run.ts`; the model cache in `clientModels.ts`). From that it fixes `GITIGNORE_ENTRY_WHEN: Record<entry, (s: { tools; envVarsRequired }) => boolean>`, with default `true` where a writer serves every client (decision E1: see the amendment). **New in `env.ts`:** `requiredGitignoreEntries({ tools, envVarsRequired, present }) → string[]` (`present` is the set of targets `lstat` finds on disk, so an existing file always keeps its line); `reduceGitignoreToForeignContent(raw, record) → CoOwnedReduction` (pure: removes the last line equal to each owned entry, drops one trailing break when `terminatorAdded` and the removed lines were last, returns `engine-only` when the result is `""` and `createdFile`); `reconcileGitignore(rootDir, { required, previous }) → Promise<{ added; removed; record }>` (writes only on change, through `refuseRepublish` and `atomicWriteFile(…, { boundaryDir })` as `:711-716` does); `gitignoreRecordOf(ledger)`; `gitignoreLedgerRows(tools, record)`. The callers replace `ensureGitignoreEntry` with reconcile and push the rows. `SyncApplyReport.gitignoreRemoved?` sits beside `gitignoreAdded`. **SECURITY bound (`manifest.ts`):** `coOwned.lines` is accepted only on a row whose path is `.gitignore`, and every line must be in `REQUIRED_GITIGNORE_ENTRIES`. Anything else is one error, `` `ledger[i].coOwned.lines[j]` "<line>" is not a line this engine writes to .gitignore ``, raised as `CONFIG_ERROR` before any write. The reducer also removes only `record.lines ∩ REQUIRED_GITIGNORE_ENTRIES`. A ledger from 1.16.0 or earlier has no row, so nothing is owned and `clean` leaves those lines, as today. |
| `testCriteria` | `initApply.test.ts`: `init -y --tools codex` with no MCP server writes no `.env.mcp` line (red on the parent). `roundTrip.test.ts`: on a fixture with no `.gitignore`, `init -y` for four clients then `clean -y` leaves every file byte-identical, no `.gitignore`, and `git status --porcelain --ignored` unchanged; a pre-existing `node_modules/\n`, with or without a final newline, comes back byte-identical; a CRLF file comes back CRLF. `clean.test.ts`: a user line added after setup stays. `manifest.test.ts`: a `.gitignore` row whose `coOwned.lines` names `.env` gives `CONFIG_ERROR` naming `lines[0]`; `lines` on any other path is refused. `env.test.ts`: a reducer given `.env` keeps the `.env` line. `syncEngine.test.ts`: `config set tools cursor` then `sync`, with no gate state on disk, removes the three gate lines and reports `gitignoreRemoved`. `.env*` in the user's file means `.env.mcp` is neither appended nor owned. Re-pins of the tests asserting all eight lines on every setup carry `// TEST CHANGE, justified: REQ-FLOW-016 — a line is written only for what is set up`. |
| `edgeCases` | A `!.env.mcp` negation counts as covered: never appended, never owned. A symlinked `.gitignore` is refused by `refuseRepublish`, as today. A user emptying an engine-created file makes it `engine-only`, so it is deleted. A tool removed while its state file still exists keeps the line until the file goes. A deleted `.gitignore` gets its lines back at the next `sync`, with `createdFile: true`. |
| `depends_on` | b2-secret-shaped-fixtures, b12-repo-file-waste |
| `verify` | `npx vitest run test/mcp/env.test.ts test/manifest/manifest.test.ts test/manifest/ownedPaths.test.ts test/cli/commands/syncEngine.test.ts test/cli/commands/initApply.test.ts test/cli/commands/initPanel.test.ts test/cli/commands/configMcp.test.ts test/cli/commands/workspace.test.ts test/cli/commands/clean.test.ts test/cli/commands/roundTrip.test.ts test/hooks/scripts.test.ts test/hooks/contextOnce.test.ts test/hooks/personOnlyGuard.test.ts test/emit/goldenFixture.ts test/merge/reclaim.test.ts test/merge/claudeHookCopies.test.ts test/cli/docs/cliReference.test.ts test/docsPages.test.ts test/architecture/boundaries.test.ts` |
| `threat` | Boundary: the committed manifest is read as data (`src/manifest/**`). Abuse: a forged row lists the owner's `.env` in `coOwned.lines`, `clean` strips it, and secrets get committed. Stop: validation accepts only members of `REQUIRED_GITIGNORE_ENTRIES` on the `.gitignore` path, and the reducer re-checks the same set. |

**Amended at the plan gate (round 1):** Add to `interfaces` (this binds over the cell's step 0 and replaces "(Open 1)"): **Step 0, decision E1.** The census test still lists each entry's writers (`git grep` of each constant over `src/`). `GITIGNORE_ENTRY_WHEN` is fixed, not derived. `.env.mcp` → `envVarsRequired`. Each of the other seven → `tools.length > 0`, because the review gate's state is written by `gate.ts` for any client (`src/mcp/env.ts:225-236`). `present` still keeps a line whose target exists on disk. `testCriteria` (whole value): `initApply.test.ts`: `init -y --tools codex` with no MCP server writes no `.env.mcp` line and writes the other seven (red on the parent). A census case holds `GITIGNORE_ENTRY_WHEN`'s keys equal to `REQUIRED_GITIGNORE_ENTRIES`. `roundTrip.test.ts`: on a fixture with no `.gitignore`, `init -y` for four clients then `clean -y` leaves every file byte-identical, no `.gitignore`, and `git status --porcelain --ignored` unchanged. A pre-existing `node_modules/\n`, with or without a final newline, comes back byte-identical, and a CRLF file comes back CRLF. `clean.test.ts`: a user line added after setup stays. `manifest.test.ts`: a `.gitignore` row whose `coOwned.lines` names `.env` gives `CONFIG_ERROR` naming `lines[0]`, and `lines` on any other path is refused. `env.test.ts`: a reducer given `.env` keeps the `.env` line. `syncEngine.test.ts`: `config set tools cursor` then `sync` keeps all three review-gate lines and the other four machine-local lines (decision E1). Removing the last MCP server that needs a credential, with no `.env.mcp` on disk, removes the `.env.mcp` line and reports `gitignoreRemoved`. `.env*` in the user's file means `.env.mcp` is neither appended nor owned. Re-pins of tests that assert `.env.mcp` on every setup carry `// TEST CHANGE, justified: REQ-FLOW-016 — .env.mcp is written only when a server needs a credential`. `edgeCases`: replace "A tool removed while its state file still exists keeps the line until the file goes" with "A server removed while `.env.mcp` still exists keeps its line until the file goes". `depends_on`: b2-secret-shaped-fixtures (`test/mcp/env.test.ts`), b12-repo-file-waste (`src/manifest/ownedPaths.ts`, `src/cli/engine/emissionWrite.ts`). `verify`: drop `test/emit/goldenFixture.ts` (a helper; M-7) and add `test/ci/testInputsGuard.test.ts`.

**Amended at the plan gate (round 2; binds over the cell and the round-1 block):** `clean` takes back a recorded ignore
line only when its target is absent after the sweep. `clean` never deletes `.env.mcp` (the owner's credentials), so
its line stays while the file exists, and a token file is never left un-ignored. Add to `testCriteria`: a filled
`.env.mcp`, then `clean -y` → the `.env.mcp` line stays and `git check-ignore .env.mcp` exits 0 (red on a reducer that
removes every recorded line); after the owner deletes `.env.mcp`, the next `clean` removes the line.

**Amended at session 2 intake (2026-10-25, against `864d0111`):** Line moves only: the `init` caller is
`src/cli/commands/init/apply.ts:556`, the `sync` caller is `src/cli/commands/sync/engine.ts:1216`, and the
`coOwned.lines` shape check is `src/manifest/manifest.ts:427-439`. File 1 added no writer of a machine-local file and no
new ignore entry. `REQUIRED_GITIGNORE_ENTRIES` (`src/mcp/env.ts:237-246`) and its five callers are as the cell says.

**Amended at build (2026-10-25, ledger row `2026-10-25_autonomy-distribution-02/review/28`, closed fixed;
`b4-reviewer-r2.md`):** binds over the round-2 block's "after the owner deletes `.env.mcp`, the next `clean` removes
the line". Once written, the `.env.mcp` line is never taken back automatically: neither `sync` nor `clean` removes it,
whatever one checkout holds. The `.gitignore` and its record are committed and shared, so a checkout without the file
must not drop another checkout's ignore rule. The line is still added only when a selected server needs a credential or
the file exists. Each `.gitignore` row's hash covers only the engine's recorded lines. While `clean` keeps `.stamity/`
for a hook that still runs from it, the machine-local lines stay (review/29, `src/cli/commands/clean.ts`).

### b5-import-config-round-trip — imported instruction files and a removed pack's hooks come back clean

| Field | Content |
|---|---|
| `id` | b5-import-config-round-trip |
| `requirements` | REQ-FLOW-027 (import and pack parts) |
| `files` | `src/merge/safeWrite.ts` (`prependManagedBlock` `:606-610`; backup sites), `src/merge/managedBlocks.ts` (new `stripManagedBlock`), `src/merge/reclaim.ts` (strip join `:1125`), `src/types/content.ts` (`MergeResult.backupPath?`), `src/types/manifest.ts` (`ImportDecision` `:242-247`), `src/manifest/manifest.ts` (`collectImportChoiceErrors` `:797`), `src/cli/commands/init/apply.ts` (record the backup after the write loop), `src/cli/commands/clean.ts` (full clean: restore; `runScopedClean` `:745-948`: hooks documents), `test/merge/safeWrite.test.ts`, `test/merge/managedBlocks.test.ts`, `test/merge/reclaim.test.ts`, `test/manifest/manifest.test.ts`, `test/cli/commands/initApply.test.ts`, `test/cli/commands/clean.test.ts`, `test/cli/commands/roundTrip.test.ts` |
| `interfaces` | **Today:** `prependManagedBlock` trims the owner's text (`existingContent.trimStart()`, `safeWrite.ts:607`) and adds a final newline (`:609`). The strip keeps `split.before + split.after` (`reclaim.ts:1125`), so a separator line survives. **New:** `prependManagedBlock` returns `` existing === "" ? `${incoming.trim()}\n` : `${incoming.trim()}\n\n${existing}` ``. `export function stripManagedBlock(content, filePath?): string \| null` lives in `managedBlocks.ts`: when the block starts at byte 0 it drops the END line's terminator and one separator line; otherwise `before + after` as today. The sweep uses it at `:1125`. `MergeResult.backupPath?` is set at each backup site. `ImportDecision.backup?: { path; sha256 }`, allowed only with `mode: "replace"`. **SECURITY bound:** `backup.path` must equal `${path}.bak`, or `${path}.bak.` plus exactly eight lowercase hex digits, in the decision's own folder; else one named error and `CONFIG_ERROR`. Full `clean`, after its sweep: for each `replace` decision with a backup, when the target is absent, the `.bak` `lstat`s as a regular unshared file, and it hashes to `sha256`, then `rename(bak, path)`. Otherwise both stay and the reason is reported. JSON gains `restored[]` and `restoreSkipped[]`. **`clean --pack` (inbox pass/1):** today the copies already go (`findPackCopies`, `clean.ts:317-363`), but the hooks documents still run the pack's hook scripts until `sync` (inbox `:91`). New: before the sweep, for each `coOwnedHookDocuments(shrunk)` path (`src/cli/engine/emissionWrite.ts:827`), render it from the manifest without the pack (`syncRenderingsFor` `:1125`, with `cleanPlanner` `clean.ts:183`) and write it through the co-owned lane `coOwnedDocumentLanes` (`:700`) with `outputWriteOptions` (`:203`), the seam `init` uses. Once no document runs the pack's scripts, the sweep's retention no longer holds them. Measure red first. If the layering test refuses the import, decision E2 applies. Follows `reclaim.ts:1105-1135` (one helper on the strip lane) and `clean.ts:745-948`. |
| `testCriteria` | `reclaim.test.ts`: a block at byte 0, then `\n# Team\n` swept, gives exactly `# Team\n` (red on the parent). `roundTrip.test.ts`: an owner `AGENTS.md` of `\n\n  # Team\n\nno final newline` and an owner `CLAUDE.md` opening with a BOM, through `init -y --tools claude --import-config supplement` then `clean -y`, come back byte-identical (red on the parent). With `--import-config replace`, the manifest records `backup = { path: "AGENTS.md.bak", sha256 }`; after `clean -y` both files are byte-identical and no `AGENTS.md.bak*` remains. `manifest.test.ts`: `backup.path` of `../secret.txt`, `docs/AGENTS.md.bak`, `AGENTS.md.bak.zz` or `AGENTS.md.orig` gives one error each; `backup` on `supplement` gives one error. `clean.test.ts`: a forged record naming `notes/a.md` with its true hash moves nothing; an edited `.bak` is not renamed and the reason names the hash; after `clean --pack <id> -y` for a pack with one hook, `.claude/settings.json` holds no entry running `.stamity/packs/<id>/` and `check --json` is `ok: true` (red on the parent). Re-pins of `safeWrite.test.ts`'s trim-prepend cases carry `// TEST CHANGE, justified: REQ-FLOW-027 — the prepend keeps the owner's bytes`. |
| `edgeCases` | An owner file that is only whitespace is kept verbatim below the block. A file supplemented by an older normalising prepend comes back normalised, as then (named residue). Two `replace` decisions each restore from their own record. A target present after the sweep is never a rename destination. Windows: `backupPath` is native and the stored path is POSIX. A pack never synced has no copies and no hooks, so the run behaves as today. |
| `depends_on` | b4-gitignore-lines (shares `src/cli/commands/clean.ts`, `src/manifest/manifest.ts`, `src/cli/commands/init/apply.ts`, `test/cli/commands/roundTrip.test.ts`) |
| `verify` | `npx vitest run test/merge/safeWrite.test.ts test/merge/managedBlocks.test.ts test/merge/reclaim.test.ts test/merge/reclaim.property.test.ts test/merge/bakEscape.test.ts test/manifest/manifest.test.ts test/cli/commands/initApply.test.ts test/cli/commands/init.test.ts test/cli/commands/clean.test.ts test/cli/commands/syncEngine.test.ts test/cli/commands/roundTrip.test.ts test/merge/hookFilesOwnership.test.ts test/merge/settingsOwnerEntries.test.ts test/emit/agentsMd.test.ts test/emit/planner.test.ts test/cli/dogfoodDist.e2e.test.ts test/architecture/boundaries.test.ts` · `node scripts/ci/test-run.mjs --coverage` (`src/merge/**` floors) |
| `threat` | Boundary: the `importChoice` record in the committed manifest (`src/merge/**`, `src/manifest/**`). Abuse: a forged `backup.path` makes `clean` rename an arbitrary file onto `AGENTS.md`. Stop: the name bound, plus the `lstat` and sha256 checks before any `rename`, all re-checked in `clean`. |

**Amended at the plan gate (round 1):** Add to `interfaces` (this binds over the cell's `clean --pack` paragraph, W-3): `syncRenderingsFor` (`src/cli/engine/emissionWrite.ts:1125-1153`) hashes the plan and throws it away, so it is not the source of the text. The text comes from the planner itself: `cleanPlanner(rootDir, engineVersion)` (`src/cli/commands/clean.ts:182-195`) returns an `EmissionPlanFor` (`emissionWrite.ts:939-942`). Calling it on the manifest without the pack gives `AdapterOutput[]` whose `content` is each document's rendered text. The documents to rewrite are `hookScriptRetention(shrunk, packSupply).hookDocuments` (`emissionWrite.ts:844-852`), which is the co-owned hook lanes plus Copilot's `COPILOT_HOOKS_PATH`. A co-owned lane path is written through that lane's `materialize` from `coOwnedDocumentLanes` (`:700`), as `init/apply.ts:409` does. `.github/hooks/stamity.json` is a whole file and is written with `outputWriteOptions` (`:203`), as `init/apply.ts:653` does. A Copilot hooks file the owner edited is kept and named by the writer's drift rule. The layering fallback is decision E2: if the layering test refuses the import, the row closes as a documented residual. This replaces "see Open 2". Add to `testCriteria`: after `init -y --tools claude,copilot` and a pack with one hook, `clean --pack <id> -y` leaves no entry in `.github/hooks/stamity.json` that runs a script under `.stamity/packs/<id>/` (red on the parent). Add `test/adapters/copilot.test.ts` to `verify`.

**Amended at session 2 intake (2026-10-25, against `864d0111`):** Line moves: `ImportDecision` is
`src/types/manifest.ts:284-289`, and `collectImportChoiceErrors` is `src/manifest/manifest.ts:887`. The co-owned lane
write `init` uses is the call at `src/cli/commands/init/apply.ts:471-477`, and through it `lane.materialize` at `:648`.
The whole-file write is `outputWriteOptions` at `:678`. Since file 1, a pack's hook command may carry its script as a
trailing plain word (`src/manifest/hookDocuments.ts`, `namesItsOwnScript`). The `clean --pack` cases that check no
entry still runs `.stamity/packs/<id>/` read the whole command text, so they catch both command forms.

### b6-init-force-charter — `init --force` recognises the engine's own charter and keeps earlier import decisions

| Field | Content |
|---|---|
| `id` | b6-init-force-charter |
| `requirements` | REQ-FLOW-029 |
| `files` | `src/cli/commands/init/plan.ts` (`buildInitDecisions` deps `:225-250`; `collectExistingConfigPaths` `:420-432`), `src/cli/commands/init.ts` (`:1066` `alreadyInitialised`; import defaults `:1105-1125`; `importChoice` `:1218`), `src/cli/commands/init/apply.ts` (`readPreviousManifest` `:674`, exported; ownership index under `force`), `test/cli/commands/initPlan.test.ts`, `test/cli/commands/init.test.ts`, `test/cli/commands/initApply.test.ts` |
| `interfaces` | **Today:** `--force` sets `alreadyInitialised` false (`init.ts:1066`). `collectExistingConfigPaths` lists every present instruction file, the engine's own `AGENTS.md` included (`plan.ts:420-432`), and `-y` defaults `supplement` over them (`init.ts:1114`). `isEngineCharterDocument` exists (`src/manifest/ownedPaths.ts:437-446`, tested at `test/manifest/ownedPaths.test.ts:489-499`), but `init` does not use it. **New:** `buildInitDecisions(rootDir, overrides, deps: { …; previous?: SetupManifest \| null })`. `collectExistingConfigPaths(rootDir, detectedTools, previous)` drops every path a `TOOLS`-owned row of `previous.ledger` records, and every path whose text `isEngineCharterDocument` accepts. `init.ts` reads `previous` once under `--force` through the exported `readPreviousManifest`, so `CONFIG_ERROR` reads as `null` and only content recognition applies. It carries each `previous.importChoice` whose path still exists and asks or defaults only for the rest. Under `force`, `previous`'s rows at the four instruction paths join the ownership index, so an unedited charter is overwritten with no `.bak`. |
| `testCriteria` | `init.test.ts`: `init -y --tools claude,cursor,copilot`, then `init -y --force`, leaves `AGENTS.md` byte-identical, with one `# Charter`, no `.bak`, and no `importChoice` (red on the parent, which doubles the charter). The charter with markers removed, a corrupt manifest, and a deleted `.stamity/` each give one `# Charter`. A first `--import-config skip` keeps `skip` after `--force`, with `AGENTS.md` byte-identical. User prose with `--force --import-config supplement` survives byte for byte. `initPlan.test.ts`: `existingConfigPaths` leaves out an engine charter and keeps a user `AGENTS.md`. |
| `edgeCases` | A user file shaped exactly like the charter reads as the engine's and is overwritten behind a `.bak` (recoverable, named). A carried decision for a file that is gone is dropped. An interactive `--force` asks only for paths with no carried decision. A manifest of a newer generation reads as unreadable, so only content recognition applies. |
| `depends_on` | b3-clean-keeps-state (shares `src/cli/commands/init/apply.ts` and `test/cli/commands/initApply.test.ts`) |
| `verify` | `npx vitest run test/cli/commands/initPlan.test.ts test/cli/commands/init.test.ts test/cli/commands/initApply.test.ts test/cli/commands/initPanel.test.ts test/cli/checkExpectations.test.ts test/emit/sharedCharterIdentity.test.ts test/manifest/ownedPaths.test.ts test/cli/ledgerForgery.test.ts` |

**Amended at session 2 intake (2026-10-25, against `864d0111`):** Line moves: `alreadyInitialised` is
`src/cli/commands/init.ts:1069`, the import defaults are `:1108-1128`, `importChoice` is `:1221`, and
`readPreviousManifest` is `src/cli/commands/init/apply.ts:699`, still not exported. Since file 1, `applyInit` already
reads the previous manifest once under `--force` (`apply.ts:297`) and uses it for the model lists, the pack carry
(`:306`), the loosen gate (`:345-350`) and the co-owned lanes (`:425-476`). Export `readPreviousManifest` for
`init.ts`'s decision step, and leave `apply.ts:297` as it is. Both reads see the same file, and no new field joins
`InitApplyOptions`. The ownership change goes at `apply.ts:387-388`, which today index pack rows only, and the comment
at `:365-386` is rewritten to match. The loosen gate (`init.ts:1229-1237`) passes on a same-setting `--force`. No case
in this unit changes autonomy.

**Amended at build (2026-10-25, a hand-off from `b5`'s M-4):** `init --force` builds `importChoice` fresh, so the
backup record `b5` now writes on a `replace` decision (`importChoice[].backup { path, sha256 }`) would be dropped, and a
later `clean` would leave the owner's `AGENTS.md.bak` unrestored. The carried `importChoice` keeps each decision's
`backup` record whole when its path and its backup still exist and the backup hashes as recorded; otherwise the record
is dropped, as a decision for a missing file is. `testCriteria` gains a case in `test/cli/commands/init.test.ts`:
`init -y --import-config replace`, then `init -y --force`, then `clean -y` restores the owner's file byte for byte and
leaves no `AGENTS.md.bak*` (red on the parent).

### b7-manifest-stable — a no-op `sync` changes no byte, and managed-block markers carry no version

| Field | Content |
|---|---|
| `id` | b7-manifest-stable |
| `requirements` | REQ-FLOW-032, REQ-UPSTREAM-016 (MODIFIED wording) |
| `files` | `src/manifest/manifest.ts` (`writeManifest` `:1195-1213`), `src/cli/commands/sync/engine.ts` (`:1366-1372`), `src/cli/commands/sync/report.ts`, `src/adapters/claude.ts` (`:789`), `src/emit/planner.ts` (`:1525`), `src/cli/engine/emissionWrite.ts` (`outputWriteOptions` `:203`), `test/manifest/manifest.test.ts`, `test/cli/commands/sync.test.ts`, `test/cli/commands/syncEngine.test.ts`, `test/cli/flows.e2e.test.ts` (`:133`), `test/cli/dogfoodDist.e2e.test.ts` (`:232-245`), `test/adapters/claude.test.ts`, `test/emit/planner.test.ts`, `docs/workspaces.md` (`:335`) |
| `interfaces` | **Today:** `applySync` sets `updatedAt: now` (`sync/engine.ts:1369`), and `writeManifest` stamps and always writes (`manifest.ts:1201-1212`). This is inbox `build/96`. `CLAUDE.md` carries `<!-- STAMITY:BEGIN v1.16.0 -->` (`src/adapters/claude.ts:789`, `src/emit/planner.ts:1525`). **New:** `writeManifest(rootDir, manifest, opts: { now?: Date } = {}): Promise<{ written: boolean; updatedAt: string }>`. It reads the current file; when that parses with a timestamp-shaped `updatedAt`, it serialises `{ ...manifest, updatedAt: <that value> }`. When the result equals the current bytes, with `\r\n` folded, it returns `{ written: false }` and writes nothing; otherwise it stamps, validates and writes. Its six other callers ignore the result. `applySync` stops stamping and reports `manifestWritten` in `sync --json`. Markers: `wrapInManagedBlock(content, path)` with no version at both sites, and `outputWriteOptions` stops passing `version`, so a stamped block is rewritten once to the bare marker. Pinned calls keep their version (`src/shared/cliCall.ts`, REQ-FLOW-002). Follows `safeWrite.ts`'s only-when-stale rule. |
| `testCriteria` | `manifest.test.ts`: the same content written at T1 over T0 leaves bytes and mtime unchanged and returns `{ written: false, updatedAt: T0 }`; one field changed gives `T1` and `written: true`; CRLF on disk means no write. `flows.e2e.test.ts:133` (init, then a no-op sync) gives equal `updatedAt` (red on the parent; re-pin with `// TEST CHANGE, justified: REQ-FLOW-032 — updatedAt moves only on change`). `dogfoodDist.e2e.test.ts` second sync: no changed path, the manifest included (re-pin, same reason). `claude.test.ts`: `CLAUDE.md` opens `<!-- STAMITY:BEGIN -->`; a stamped `v1.16.0` block is `updated` once, then `unchanged`. `sync --json` no-op gives `manifestWritten: false`. `sync.test.ts:210` and `:291` stay green, since they change content. Run them first and re-pin only those that turn red. |
| `edgeCases` | A manifest with no `updatedAt`, or unparseable, gets a fresh stamp. A sync that only refreshes `detected` changes content, so it stamps. A 1.16.0 `check` over bare markers reads them stale (named skew). An autocrlf checkout stays unwritten thanks to the fold. |
| `depends_on` | b5-import-config-round-trip, b4-gitignore-lines, b12-repo-file-waste |
| `verify` | `npx vitest run test/manifest/manifest.test.ts test/cli/commands/sync.test.ts test/cli/commands/syncEngine.test.ts test/cli/flows.e2e.test.ts test/cli/dogfoodDist.e2e.test.ts test/adapters/claude.test.ts test/emit/planner.test.ts test/emit/crossClientGoldens.test.ts test/emit/upgradeFrom1140.e2e.test.ts test/upstream/workflowRecovery.test.ts test/ci/upstreamWorkflow.test.ts test/cli/commands/workspace.test.ts test/cli/commands/add.test.ts` · `npm run build && node dist/cli.js sync && node dist/cli.js sync && git status --porcelain` (the second sync adds nothing) |
| `threat` | `src/manifest/manifest.ts` is security-sensitive by path. Boundary: the on-disk manifest is read back before writing. Abuse: a planted manifest with a crafted `updatedAt` gets a write skipped. Stop: the skip needs equal bytes beyond `updatedAt`, a timestamp-shaped value, and the usual validation; anything else writes. |

**Amended at assembly:** it also folds inbox `cut/20` (`sync` rewrote `CLAUDE.md`'s marker with no "Overwrote"
notice): the one-time rewrite of a stamped marker to the bare one is named in the sync report like any other
overwritten tracked file.

**Amended at the plan gate (round 1):** `verify`: the vitest list as in the cell, with no dogfood step. The `npm run build && node dist/cli.js sync …` part is dropped (W-11). The integration lane checks that a second sync changes nothing (see Execution order). `depends_on`: b5-import-config-round-trip, b4-gitignore-lines, b12-repo-file-waste (`src/cli/engine/emissionWrite.ts`).

**Amended at session 2 intake (2026-10-25, against `864d0111`):** Line numbers moved. `writeManifest` is
`src/manifest/manifest.ts:1286-1304`. `applySync` stamps at `src/cli/commands/sync/engine.ts:1384` and writes at
`:1387`. The flows case is `test/cli/flows.e2e.test.ts:134`. The two content-changing sync cases are
`test/cli/commands/sync.test.ts:215-216` and `:296`. The other callers, which ignore the new result, are
`src/cli/commands/init/apply.ts:562`, `src/cli/commands/add.ts:1288`, `src/cli/commands/clean.ts:855`,
`src/cli/commands/workspace.ts:1075`, `src/cli/commands/config/mcp.ts:96` and `scripts/pack-signing-rehearsal.mjs:134`
(five in `src/` plus the script: the cell's "six"). File 1 added `autonomy` to the manifest's field order
(`MANIFEST_FIELD_ORDER`), so the byte compare covers it. `b9-upgrade-verb` lands first and calls `applySync` from
`src/cli/commands/upgrade.ts`. So `manifestWritten` is added to the report without removing or renaming a field, and
`test/cli/commands/upgrade.test.ts` joins `verify`. A no-op `upgrade --to <running>` then leaves
`.stamity/manifest.json` byte-identical, which the test asserts. The loosen gate at `sync/engine.ts:1111-1116` stays
first in `applySync`, ahead of the skip-write decision. A refused loosening still writes nothing.

**Amended at build (2026-10-25, a hand-off from `b4`):** `docs/workspaces.md:324` names `gitignoreRemoved`, the new
key of the workspace member row. `docs/workspaces.md` is already this unit's file.

### b8-copilot-setup-switch — a managed/user/off switch for the Copilot setup workflow, plus three inbox fixes (file 2)

| Field | Content |
|---|---|
| `id` | b8-copilot-setup-switch |
| `requirements` | REQ-FLOW-149 (ADDED), REQ-FLOW-111, REQ-FLOW-118 (MODIFIED) |
| `files` | `src/types/manifest.ts` (`ToolOptions` `:317-319` doc; constants), `src/manifest/manifest.ts` (`collectToolOptionsErrors` `:855-871`; `readCopilotSetupSteps` beside `readRuleDelivery` `:1321-1326`), `src/cli/commands/config.ts` (`KEY_SPECS`, one row after `gateSpec("all")` `:936`), `src/adapters/copilot.ts` (row `:450-454`; `buildRunAgentFile` `:675-686`; `cliSteps` `:1075-1088`; `pinnedCliInstall` `:1106-1110`; new `copilotReleasedPaths`), `src/shared/cliCall.ts` (`CLI_NODE_FLOOR`), `src/cli/commands/sync/engine.ts` (`:653-657`, ledger write `:1344`), `src/cli/commands/clean.ts` (`planCleanCandidates` `:119`), `docs/configuration.md` (regenerated), tests below, `CHANGELOG.md` |
| `interfaces` | `export const COPILOT_SETUP_STEPS_MODES = ["managed","user","off"] as const;` `export type CopilotSetupStepsMode`; `COPILOT_SETUP_STEPS_DEFAULT = "managed"`. `readCopilotSetupSteps(m: SetupManifest \| null \| undefined): CopilotSetupStepsMode`: the default when the value is absent or invalid, as at `manifest.ts:1321-1326`. Validation error: `` `toolOptions.copilot.setupSteps` must be one of managed \| user \| off (got …) ``. The `KEY_SPECS` row `copilot.setupSteps` follows the `ruleDelivery` row's shape (`config.ts:737-745`). `export function copilotReleasedPaths(m: SetupManifest): ReadonlySet<string>` returns `{COPILOT_SETUP_STEPS_PATH}` in `user` mode, else empty. `planSync` filters reclaim candidates and ledger rows at released paths; `planCleanCandidates` skips them. The action-ref pin rule (`copilot.ts:1140-1155`) is unchanged: no engine SHA table. **build/34:** `CLI_NODE_FLOOR = "22.22.2"`. `isBelowFloor(pin, floor): boolean` is true only when the largest version the pin can resolve to is below the floor (`20` → true, `22.12` → true, `22` → false; aliases and `lts/*` → false). When true, `cliSteps` returns a comment naming the pin, its source and the floor, with no `run:`. **review/68:** when `<root>/.npmrc` exists at emission, the install step is written as `- run: <install>` plus `env: { NPM_CONFIG_USERCONFIG: ${{ github.workspace }}/.npmrc }`. npm skipping the project config in global mode is inferred, as the inbox row says (`.stamity/inbox.md:317`). **review/50:** `:679` and `:684-686` open with "On Copilot's cloud agent,". |
| `testCriteria` | (1) `config set copilot.setupSteps bogus` → `VALIDATION_ERROR` naming the three values, manifest unchanged. (2) `user`: an edited workflow, then `sync` and `check`, leaves the bytes identical, writes no `.bak`, keeps no ledger row and reports no drift; `clean -y` leaves it. (3) `off` with an unedited workflow: the file is reclaimed; edited: `skipped-user-content`. (4) `user` → `managed` with the file present: `unmanaged-name` collision, exit 1. (5) `.nvmrc` `20` → no `npm install --global` line and a comment containing `22.22.2`; `22` → the install as today (fails on parent: the install is always written, `:1084-1087`). (6) A root `.npmrc` → the install step carries `NPM_CONFIG_USERCONFIG`; without one, no `env:`. (7) The `stamity-run` body contains "On Copilot's cloud agent" before "59 minutes" and stays under 2,000 characters. (8) `CLI_NODE_FLOOR` equals `engineRangeFloor(package.json engines.node)`. (9) The regenerated `docs/configuration.md` has the row, default `managed`. |
| `edgeCases` | `off`, then the cloud agent's flows find no `stamity` and fall back to `npx -y` (a registry fetch); the config row's hint says so. `.npmrc` with `${NPM_TOKEN}` and no secret → the global install fails as the project's own `npm ci` would. A fork's `--@<scope>:registry=` in the words still wins for its scope. `user` set before any sync → no row ever existed, nothing to release. |
| `depends_on` | b3-clean-keeps-state, b4-gitignore-lines, b5-import-config-round-trip, b7-manifest-stable |
| `verify` | `npx vitest run test/adapters/copilot.test.ts test/manifest/manifest.test.ts test/cli/commands/config.test.ts test/cli/docs/configReference.test.ts test/cli/commands/syncEngine.test.ts test/cli/commands/sync.test.ts test/cli/commands/clean.test.ts test/shared/cliCall.test.ts test/emit/noBareCliCall.test.ts test/docsPages.test.ts test/ci/testInputsGuard.test.ts`; `node scripts/generate-docs.mjs --page config`; `test/architecture` for the new import (goldens at integration) |

**Amended at assembly:** `CHANGELOG.md` leaves its files (decision E8); the line goes in the report for the integration
lane.

**Amended at the plan gate (round 1):** `files`: replace "tests below" with `test/adapters/copilot.test.ts`, `test/manifest/manifest.test.ts`, `test/cli/commands/config.test.ts`, `test/cli/commands/syncEngine.test.ts`, `test/cli/commands/sync.test.ts`, `test/cli/commands/clean.test.ts`, `test/shared/cliCall.test.ts`. Drop `CHANGELOG.md` (decision E8). `depends_on`: b3-clean-keeps-state, b4-gitignore-lines, b5-import-config-round-trip, b7-manifest-stable (they share `clean.ts`, `manifest.ts`, `types/manifest.ts`, the sync engine, `clean.test.ts`, `syncEngine.test.ts`).

**Amended at session 2 intake (2026-10-25, against `864d0111`):** Line numbers moved: `ToolOptions`
`src/types/manifest.ts:359-361`; `collectToolOptionsErrors` `src/manifest/manifest.ts:945-961`; `readRuleDelivery`
`:1412-1417`; the `ruleDelivery` row `src/cli/commands/config.ts:767-776`; reclaim candidates
`src/cli/commands/sync/engine.ts:654-658`; the ledger rebuild `:1340-1343`. File 1 added three `autonomy.*` rows after
`gateSpec("all")` (`config.ts:968-1003`). The `copilot.setupSteps` row goes after `autonomy.deployingActs`, as the last
`KEY_SPECS` entry (`:1003`), so the autonomy rows keep their menu numbers and their order in `docs/configuration.md`
(regenerated, never merged by hand). Its `apply` writes the nested bag the way the `autonomy.*` rows write theirs
(`applyAutonomy`). `config set copilot.setupSteps <mode>` loosens nothing, so it closes on the plain sync line
(`config.ts:1360`), never the loosen line. testCriteria (1) also asserts this.

**Amended at build (2026-10-26, review/71):** the fix round (`b6ff1021` on `p20/b8`) moved two behaviours this cell
states the old way. Binds over the cell and the earlier blocks where they differ.
- **REQ-FLOW-111 and testCriteria (6).** Only a root `.npmrc` git tracks writes the `NPM_CONFIG_USERCONFIG` lines; with
  no git answering, whether the file exists decides (`src/adapters/copilot.ts:1399-1404`). Criterion (6) reads: in a
  git work tree, a tracked root `.npmrc` → the install step carries `NPM_CONFIG_USERCONFIG`; an ignored or untracked one
  → no `env:`; no `.npmrc` → no `env:`. The **review/68** sentence in `interfaces` reads "when `<root>/.npmrc` is one
  the commit holds" in place of "exists". The requirement text is the amendment under REQ-FLOW-111's entry.
- **REQ-FLOW-149 and testCriteria (3).** Under `off`, an unedited copy an earlier release wrote is taken back: at that
  one workflow path, the ledger row's recorded hash plus the engine's header line prove the delete, beside today's
  rendering (`withRecordedSetupSteps`, `src/adapters/copilot.ts:191-212`). A copy matching neither is kept and named
  `skipped-user-content`. Criterion (3)'s "unedited workflow" covers a copy an earlier version wrote. The requirement text
  is the amendment under REQ-FLOW-149's entry.
- `SECURITY.md` is `b1`'s: the residual this leaves (review/70) is handed to `b1-fork-ci-job` in its block of this date.

### b9-upgrade-verb — `stamity upgrade --to <version>` runs the running release's sync, moves the pin, and the banner names it

| Field | Content |
|---|---|
| `id` | b9-upgrade-verb |
| `requirements` | REQ-FLOW-034, REQ-FLOW-048 (ADDED); REQ-FLOW-022 (MODIFIED) |
| `files` | `src/cli/commands/upgrade.ts` (new); `src/cli.ts` (imports `:5-19`, docblock `:27-63`, `COMMANDS` `:65-80`, `main` `:118-147`); `src/cli/notice/updateNotice.ts` (`CACHE_FILE_NAME` `:75`, `noticeOptionsFromFacts` `:135`, `isOptedOut` `:215`, `buildBanner` `:320-333`); `src/cli/commands/sync.ts` (`updatePathHelp` `:68-83`); `src/pack/install.ts` (`collectCollisions` `:829-900`, `ExistingLayers` `:903-913`, `readExistingLayers` `:915-970`); `src/cli/docs/llmsIndex.ts:115`; `README.md:84`; `docs/getting-started.md` (`:169` heading, its `·` list, `:260`); `docs/packs-and-trust.md:214`; `docs/cli-reference.md` and `llms.txt` (regenerated); `test/cli/commands/upgrade.test.ts` (new); `test/cli/notice/updateNotice.test.ts`; `test/cli/surface.e2e.test.ts`; `test/architecture/boundaries.test.ts` (`PLAN_MAP` near `:660`); `test/docsPages.test.ts` (`:1337-1395`); `test/cli/commands/add.test.ts`; `test/cli/commands/sync.test.ts` |
| `interfaces` | **Verb.** `upgradeCommand: CommandModule` (`src/cli/kit/program.ts:112-125`) with `name: "upgrade"`, `mutating: true` (gets `--json`, `-y`, `--dry-run`), `requiredOption("--to <version>")` and the options `--allow-downgrade`, `--allow-major`, `--allow-client-change`. It goes right after `syncCommand` in `COMMANDS`. Shape follows `src/cli/commands/sync.ts:231-268`. **Engine.** `export async function runUpgrade(input: UpgradeInput, deps: UpgradeDeps): Promise<UpgradeReport>`. `UpgradeInput = { rootDir; to; runningVersion; packageName; registry: string \| null; npmChannel: boolean; allowDowngrade; allowMajor; allowClientChange; dryRun; now: Date }`. `UpgradeDeps = { planSync; applySync; packCatalog: typeof checkPackCatalog; readFile(p): Promise<string \| null>; writeFile(p, t): Promise<void> }` (the real ones are `src/cli/commands/sync/engine.ts:541`, `:1094` and `check.ts:1190`). `UpgradeReport = { from; to; noop; dryRun; changed: string[]; reclaimed: string[]; refused: string[]; pin: { field: "devDependencies" \| "dependencies"; from; to } \| null; pinNote: string \| null; notices: string[] }`. **Order.** Every refusal is an `EngineError` with `VALIDATION_ERROR`, exit 1, and nothing written. (1) `semver.valid(to)`. (2) `to !== runningVersion` → name `pinnedCliCall(name, to, "upgrade --to <to>", {registry})` (`src/shared/cliCall.ts:184`). With no npm channel, say "install <to> into this project, then `npx --no <name> upgrade --to <to>`". No spawn, no npx, no PATH walk. (3) no manifest → "run init". `from` = `generatedBy`. (4) downgrade or major refusal, each naming its flag. (5) Prepare the pin in memory: exact, `^` or `~` specs move; any other spec → `pinNote`. The text edit replaces the one quoted value after the section's key, then re-parses and must equal the original but for that value (technique: `scripts/fork-identity.mjs:197-214`). (6) `planSync`; `plan.manifest.tools` ≠ `manifest.tools` as sets → refuse. (7) `applySync` (`dryRun` passes through); `refused.length > 0` → exit 1, pin unmoved. (8) Write the pin. (9) `notices` = `packCatalog(root, manifest)`'s findings when warn (stale catalog packs, retired packs and their fix order), plus "Codex records trust against `.codex/hooks.json`'s hash; review each stamity hook in `/hooks`" when tools include `codex`. The sync report's moved-skill lines print as they do today (`report.ts:467`). `noop` = nothing changed and the pin already reads `to`. **Banner.** `export function shouldProbeNotice(i: { stderrIsTTY: boolean; argv: readonly string[] }): boolean` = TTY and no `--json`. `cli.ts` fires the probe only when it is true. `isOptedOut` takes `1/true/yes`, trimmed and lowercased. `export async function readRepositoryPin(cwd, name): Promise<string \| null>` reads `devDependencies`, then `dependencies`, then the manifest's `generatedBy`; it never throws. `UpdateNoticeOptions.repositoryPin?`. `buildBanner` compares with `pin ?? currentVersion` and prints the `upgrade --to` move. The stamp becomes `update-check-<name with / and @ as ->.json`. **Help.** `updatePathHelp` reads "update = npx -y <name>@<version> upgrade --to <version> — runs that release's sync and moves the package.json pin; npx -y <name>@<version> sync regenerates without moving it." **fix/2.** `ExistingLayers` gains `ownCopy: ContentIndex` (this pack's installed directory, same walk). In `collectCollisions` an id collision is skipped when its holder is the override layer and `ownCopy.byKey` holds that key. The user layer outranks a pack in the walk, so a re-add keeps the override on top. **Surface pins.** 9 → 10 advertised, 15 → 16 registered (`surface.e2e.test.ts:119`, `cli.ts:49`); "nine verbs" → "ten verbs" (README, getting-started, `llmsIndex.ts:115`, `docsPages.test.ts` arrays). Exit codes: 0, 1, and 2 for a missing `--to`. |
| `testCriteria` | `upgrade.test.ts` with the real sync engine over a temp fixture written by 1.16.0 with tools `["claude"]` and `devDependencies` pinning `1.16.0`, and `runningVersion` at the fixture's current version V. Then: exit 0, `package.json` differs only in the pin (now V), `manifest.generatedBy` is V, and the learnings, handoffs, overrides and run records are byte-identical. `--to 9.9.9` → exit 1, the message contains `npx -y @zomarit/stamity@9.9.9 upgrade --to 9.9.9`, and nothing is written. `generatedBy` above V → exit 1 naming `--allow-downgrade`. A major jump → `--allow-major`. `"^1.16.0"` → `"^V"`. `"latest"` → unchanged, with `pinNote`. A pin key spelled with a JSON escape → exit 1 before any write. `--dry-run` → no file written. A fixture with tools `["codex"]` → a `notices` line names `/hooks`. A stale catalog pack → `notices` names `add <id>`. **Fails on parent:** `stamity upgrade --help` exits 0 (today exit 2). `updateNotice.test.ts`: `shouldProbeNotice` gives false, false, true for (no TTY), (`--json`), (TTY). `true`, `YES` and ` 1 ` opt out; `0` does not. Pin `1.12.0`, running `1.13.0`, registry `1.13.0` → the exact REQ-FLOW-048 banner. Pin `1.13.0` → no banner. Registry `2.0.0` → `--allow-major`. Two package names → two stamp files. `add.test.ts` (fix/2, fails on parent): add a pack, override its agent, sync, re-add → exit 0, and the synced agent is still the override's bytes. |
| `edgeCases` | No `package.json` → `pin: null`, nothing created. A pin under `dependencies` only → that one moves. A workspace monorepo → the root `package.json` only, and the report says so. A dirty tree → sync's own warning passes through. A fork with `publishConfig.registry` → the printed calls carry `--@<scope>:registry=<url>` (`scopeRegistryArg`). A first install whose id an override already holds → still refused (fix/2 widens only the re-add). A re-add whose new version brings an id the old copy lacked and an override holds → still refused. A target that predates `upgrade` (a downgrade to ≤1.16.0) is never run in-process: step 2 prints the pinned call, and an old release answers "unknown command". The banner then prints the pinned `sync` form when the target is below 1.17.0. |
| `depends_on` | docs/plans/022-autonomy-distribution-01.md |
| `verify` | `npx vitest run test/cli/commands/upgrade.test.ts test/cli/notice/updateNotice.test.ts test/cli/commands/sync.test.ts test/cli/commands/add.test.ts test/pack/install.test.ts test/pack/upgradeRemedy.test.ts test/pack/packEngineDefects.test.ts test/cli/commands/check.test.ts test/cli/surface.e2e.test.ts test/architecture/boundaries.test.ts test/docsPages.test.ts test/cli/docs/cliReference.test.ts test/cli/docs/llmsIndex.test.ts test/ci/forkIdentity.test.ts`, after `node scripts/generate-docs.mjs --page cli` and `--page llms` |

**Amended at assembly:** inbox `cut/13` (Codex hooks embed the pinned version, so Codex asks for re-trust at every
upgrade) is decided "kept, told at upgrade" (decision E5), and this unit's notice line is its closure.

**Amended at the plan gate (round 1):** `files`: add `src/cli.ts:33` ("fifteen CommandModules" → "sixteen") and `:46-49` (the advertised list gains `upgrade` after `sync`; "Nine advertised, fifteen registered" → "Ten advertised, sixteen registered"). The surface-pin census row in Shared contracts reads reconciled(8). `test/cli/surface.e2e.test.ts` stays in `files`, for the opt-out case below. Add to `interfaces`: **Loosen gate (C-1).** `upgrade` takes `--loosen` ("allow an autonomy setting looser than the guard on disk; the guard asks the person for this line"). `UpgradeInput` gains `loosen: boolean`, and `UpgradeDeps` gains `assertNotLoosened`. New step (4b), after the downgrade and major checks and before step (5): call `assertNotLoosened(rootDir, readAutonomy(manifest), { loosen: input.loosen })`, imported from `src/config/autonomy.ts`. This is the same gate `sync` calls (file 1's `a3-autonomy-config`, REQ-FLOW-138, `…-01.md:324`). It throws `CliFailure` `AUTONOMY_LOOSENED`, exit 1, nothing written, `--dry-run` included. `next` names `upgrade --to <to> --loosen`. If file 1's tree holds the check inline, this unit moves it into `src/config/autonomy.ts` under that name, and `sync.ts` and `init.ts` call it (`src/config/autonomy.ts` and `src/cli/commands/init.ts` then join `files`). File 1's guard already reads `upgrade` lines with `--loosen` (`…-01.md:435`). So this unit edits no guard. **Old targets (W-6).** `FIRST_UPGRADE_RELEASE = "1.17.0"`. In step (2), and in `buildBanner`, a target below it gets `pinnedCliCall(name, to, "sync")` in place of `upgrade --to <to>`, because that release has no `upgrade` verb. **Stamp (W-7).** The opt-out case in `test/cli/surface.e2e.test.ts:317-340` builds its stamp path from the package name with `/` and `@` read as `-`, using the same `package.json` read that `npxCommand` uses (`test/support/identity.ts:174`). It no longer uses `update-check.json` (`:322`). **M-8.** `upgrade.ts` uses erasable syntax only (no `enum`, no parameter properties, no `namespace`), because `scripts/generate-docs.mjs` loads `src/cli` under Node's type stripping (`:67-74`). Its tests build expected calls with `npxCommandOf({ ...canonical(), version: "9.9.9" }, "upgrade --to 9.9.9")` (`test/support/identity.ts:184`), never a literal package name. Add to `testCriteria` (this binds over the cell's banner versions): `upgrade.test.ts`: a fixture synced with `autonomy.mode: ask`, then its manifest edited to `autonomous`. `upgrade --to V` exits 1 with `AUTONOMY_LOOSENED`. Every emitted file, `.stamity/manifest.json` and `package.json` are byte-identical. `upgrade --to V --loosen` exits 0. A tightening needs no flag. `--to 1.10.0` prints `…@1.10.0 sync`, not `upgrade`. `updateNotice.test.ts`: pin `1.17.0`, running `1.18.0`, registry `1.18.0` → the exact REQ-FLOW-048 banner with `upgrade --to 1.18.0`. Pin `1.9.1`, registry `1.10.0` → the move reads `npx -y <name>@1.10.0 sync`. Pin `1.18.0` → no banner. `surface.e2e.test.ts`: the opt-out arms assert the renamed stamp is absent (`TEST CHANGE, justified: REQ-FLOW-048 — the stamp is keyed by package name`). `edgeCases`: replace the last two sentences with "A target below 1.17.0 is never run in-process: step 2 prints the pinned `sync` form, and the banner does the same." `depends_on`: docs/plans/022-autonomy-distribution-01.md (`a3`'s gate). Add `test/config/autonomy.test.ts` and `test/ci/testInputsGuard.test.ts` to `verify`. `threat`: Boundary: the committed manifest's `autonomy`, which an agent can edit. Abuse: an agent loosens it and runs `stamity upgrade --to <running>`, which re-bakes a looser guard with no person involved. Stop: `assertNotLoosened` runs before any plan or write, and `--loosen` is a line the guard asks the person for (file 1's `autonomy-loosen`).

**Amended at the plan gate (round 2):** the loosen gate runs in the emission writer (file 1's `a3-autonomy-config`), so
`upgrade` threads `--loosen` through its write options rather than calling the gate on its own; the test stands.

**Amended at session 2 intake (2026-10-25, against `864d0111`):** This binds over round 1's loosen paragraph and
round 2's block.
- **Loosen gate.** It is `assertNotLoosened` in `src/cli/engine/autonomyGate.ts:405-428`, not `src/config/autonomy.ts`
  (which holds only `loosens`, `:124`, and the resolvers). It throws `EngineError` coded `AUTONOMY_LOOSENED`
  (`:420-427`). `upgrade` passes it to `applySync` as `guardGate`, the way `src/cli/commands/sync.ts:263-264` does, with
  `loosen: input.loosen`, `remedy: packageCommand("upgrade --to <to> --loosen")` (`src/cli/kit/packageName.ts`) and a
  stderr `notice`. There is no step (4b), and `UpgradeDeps` gains no `assertNotLoosened`: `UpgradeDeps.applySync` keeps
  `typeof applySync`, which already carries `guardGate`. The gate runs inside `applySync` before any write, dry run
  included (`src/cli/commands/sync/engine.ts:1111-1116`), and before the pin write in step 8, so `package.json` stays
  untouched. `src/config/autonomy.ts` and `src/cli/commands/init.ts` stay out of `files`. The `--loosen` help text is
  the one `sync.ts:239` uses. The guard already asks for `--loosen` on any command of this package
  (`src/hooks/personOnly.ts:3053-3072`), and `AUTONOMY_LOOSENED` already has its CLI-reference row
  (`src/cli/docs/cliReference.ts:168-170`), so neither is edited.
- **Line numbers.** `planSync` `sync/engine.ts:542`; `applySync` `:1102`; `checkPackCatalog`
  `src/cli/commands/check.ts:1192`; the verb shape `sync.ts:232-278`; `updatePathHelp` `:69-84`; `readExistingLayers`
  `src/pack/install.ts:934-965`; the `PLAN_MAP` row beside `test/architecture/boundaries.test.ts:677`; the docs cases
  `test/docsPages.test.ts:1353-1412`; the fork-identity technique `retargetPreset`, `scripts/fork-identity.mjs:191-207`;
  the `src/cli.ts` docblock `:28-64`.
- **Surface pins.** The values are unchanged by file 1: 9 advertised, 15 registered. Each moves to 10 and 16:
  `src/cli.ts:33` and `:50`, plus the list at `:48-50` and `COMMANDS` after `:67`; `test/cli/surface.e2e.test.ts:53-63`,
  `:88`, `:90` and `:119`; `test/docsPages.test.ts:1366`, `:1368-1378`, `:1394`, `:1396` and `:4425-4438` (the
  getting-started `verbs` array, from which `:4451` and `:4452-4454` derive their count word); `README.md:83-84`;
  `docs/getting-started.md:169`, `:171-172` and the glossary row at `:420`; `src/cli/docs/llmsIndex.ts:115`.
- **No-update-command text.** The docblock lines saying there is no update command (`sync.ts:36-41`, `:44`) are
  rewritten too. `updatePathHelp`'s no-channel and `--registry` branches get the `upgrade --to <version>` form with
  their own prefixes (`npx --no <name>`, `--@<scope>:registry=<url>`). `test/cli/commands/sync.test.ts:707-708`,
  `:727-728` and `:743-745` are re-pinned with a `TEST CHANGE, justified: REQ-FLOW-022` line.
- **Opt-out text.** The words now live at `docs/getting-started.md:258-261`.
- **Size check.** The bundle must stay under `LOGIC_BUDGET_BYTES` (`tsdown.config.mjs:126`, about 124 KB of headroom at
  file 1's last measure, the comment at `:104-126`). Run `npm run build` and read its `[size]` line.
- **Verify.** Add `test/cli/engine/autonomyGate.test.ts` and `test/support/support.test.ts`.

**Amended at build (2026-10-25, the re-review's W-1 and W-2):** Binds over the cell's step (6), its
`--allow-client-change` option and the matching test. There is no client-set refusal and no `--allow-client-change`.
The manifest reader refuses a `tools` entry outside `TOOLS` with `CONFIG_ERROR` (`src/manifest/manifest.ts:1067-1076`),
and every `TOOLS` entry has an adapter, so the refusal was dead. `upgrade`'s plan step, dry run included, starts each
selected client's own CLI, unless `STAMITY_NO_CLIENT_PROBE=1` is set. `readRepositoryPin` reads `package.json` through
the checked reader, capped at 1 MiB. The `SECURITY.md` and `docs/security-mapping.md` lines that now name `upgrade` are
written by `b1` from this unit's fixer report (see `b1`'s session 2 block). The CLI-reference and troubleshooting lines
are written by `b16`.

### b9b-readd-synced-pack — re-adding a synced pack is not refused by its own client copy

| Field | Content |
|---|---|
| `id` | b9b-readd-synced-pack |
| `requirements` | REQ-FLOW-034 (the `add <id>` remedy that `upgrade` prints as a notice must run in a synced setup; no spec text changes). Source: ledger row `2026-10-25_autonomy-distribution-02/build/3` (Warning, pre-existing). |
| `files` | `src/pack/install.ts` (`collectCollisions`, the refusal at `:874-881`), `test/cli/commands/add.test.ts`, `test/pack/upgradeRemedy.test.ts` (`:485`) |
| `interfaces` | **Today:** after a `sync`, re-adding an installed pack is refused for each item nobody overrode, "still claimed by the client copy" (`src/pack/install.ts:874-881`). So `check`'s pack-catalog remedy `add <id>` (`src/cli/commands/check.ts:1246`), which `upgrade` now prints as a notice, exits 1 in a synced setup. **Fix:** in fix/2's rule in `collectCollisions` (`b9-upgrade-verb`), an id collision whose holder is this pack's own synced client copy, read off its own ledger rows, is not a collision on a re-add. About 15 lines; `b9`'s implementer measured it, and its report (`b9-implementer-r1.md`) names the three edits. No new export. |
| `testCriteria` | `add.test.ts` (fails on the parent): add a local-path pack, `sync`, then re-add it with nothing overridden → exit 0. `upgradeRemedy.test.ts:485`: the add there is still refused, now by the "left behind" check, so the case is re-pinned with `TEST CHANGE, justified: build/3 — a pack's own synced copy no longer refuses its re-add; the left-behind check still does`. |
| `edgeCases` | A collision held by another pack's copy, or by an override, is still refused (fix/2's rule otherwise unchanged). A first install whose id an override already holds is still refused. |
| `depends_on` | b9-upgrade-verb (`src/pack/install.ts`, `test/cli/commands/add.test.ts`, fix/2's rule) |
| `verify` | `npx vitest run test/cli/commands/add.test.ts test/pack/install.test.ts test/pack/upgradeRemedy.test.ts test/pack/packEngineDefects.test.ts test/cli/commands/check.test.ts test/ci/testInputsGuard.test.ts test/architecture` · `npm run lint` · `npm run typecheck` · `npm run knip` |

**Added at build (2026-10-25, declared default).** Wave 2, after `b9`. Its files meet no other wave-2 unit (`b4`,
`b17`). `b3` (wave 4) edits `src/pack/install.ts` later.

### b10-shrinkwrap-st — the tarball ships a production `npm-shrinkwrap.json`; `st` becomes its own entry with a deprecation line

| Field | Content |
|---|---|
| `id` | b10-shrinkwrap-st |
| `requirements` | REQ-FLOW-049 (ADDED) |
| `files` | `scripts/pack-release.mjs` (new); `package.json` (`bin` `:30-33`, `files` `:41-43`); `.gitignore` (`/npm-shrinkwrap.json`); `src/st.ts` (new); `tsdown.config.mjs` (`entry` `:317`); `scripts/tarball-smoke.mjs` (the pack `:117`, a new assertion); `.github/workflows/release.yml` ("Pack tarball" `:340-352`); `.github/workflows/fork-release.yml` (`:313-322`); `docs/getting-started.md:174`; `test/ci/packRelease.test.ts` (new); `test/cli/stAlias.e2e.test.ts` (new); `test/cli/binMap.test.ts`; `test/ci/workflow.test.ts`; `test/ci/forkReleaseWorkflow.test.ts`; `test/architecture/boundaries.test.ts` (one `PLAN_MAP` row) |
| `interfaces` | `export function productionShrinkwrap(lock)` is pure. It refuses a `lockfileVersion` other than 3, drops `dev: true` rows, turns `devOptional` into `optional: true`, removes the root row's `devDependencies`, and keeps key order. `export function packRelease({ root, destination, run = execFileSync })` refuses a leftover `<root>/npm-shrinkwrap.json`. It writes the file, runs `npm pack --json --pack-destination <dir>` the way the smoke does (`scripts/tarball-smoke.mjs:81-83`), removes the file in a `finally`, and refuses pack JSON that lacks it. CLI: `node scripts/pack-release.mjs --pack-destination <dir> --json` prints npm's JSON unchanged (exit 0, 1, or 2 for bad arguments). Both workflows replace `npm pack --json --pack-destination .` with `node scripts/pack-release.mjs --pack-destination . --json` in the same spot. The fork and canonical runs must stay equal (`forkReleaseWorkflow.test.ts:449-460`). `package.json`: `files: ["dist", "npm-shrinkwrap.json"]`, `bin.st: "./dist/st.js"`. `src/st.ts` uses Node builtins only. It writes `stamity: the st command is deprecated and is removed in 2.0.0; run stamity instead.\n` to stderr, sets `process.argv[1]` to the sibling `cli.js` (or `cli.ts`) so `isMain` (`src/cli.ts:107-116`) matches, then `await import(pathToFileURL(entry).href)`. The specifier is computed, so the bundler keeps `dist/cli.js` whole. The npm facts (packed only when `files` names it; honoured only under the registry's `_hasShrinkwrap`) were read 2026-10-23 from docs.npmjs.com/cli/v11/configuring-npm/npm-shrinkwrap-json and npm's registry package-metadata doc. The guard's `st` reading (`src/hooks/personOnly.ts:2576`, `:2698`) stays until 2.0.0. |
| `testCriteria` | `packRelease.test.ts`: a lock fixture with prod, optional, devOptional and dev rows → the dev row is gone, devOptional reads `optional`, the root has no `devDependencies`, and the rest is deep-equal. Over the repository's own lock, every `dependencies`/`optionalDependencies` key has a row and no row is `dev`. A stub `run` sees the file present during `pack`, and the file is absent afterwards, also when the stub throws. A leftover file → refusal before any write. **Fails on parent:** `binMap.test.ts` expects `bin` to equal `{ stamity: "./dist/cli.js", st: "./dist/st.js" }` and `files` to contain `npm-shrinkwrap.json` (TEST CHANGE, justified: REQ-FLOW-049 gives `st` its own entry). `stAlias.e2e.test.ts`: `node src/st.ts --version` gives the same stdout as `src/cli.ts`, and stderr is exactly the line. `st --json check` in an empty fixture gives one JSON document on stdout. `stamity --version` has empty stderr. `workflow.test.ts` / `forkReleaseWorkflow.test.ts`: "Pack tarball" runs `pack-release.mjs`, and no gates step runs `npm pack` directly. `node scripts/tarball-smoke.mjs` asserts the installed package holds a shrinkwrap with no `dev` row. |
| `edgeCases` | A registry that does not set `_hasShrinkwrap` (GitHub Packages, not measured) → npm resolves fresh, as today; the fork docs say so. An interrupted local pack → the `finally` removes the file, `.gitignore` keeps a leftover out, and the next pack refuses. `npm install <tarball>` or `npx --package <file>` → the shrinkwrap is ignored, by design. Windows `st.cmd` → the line prints there too. `--json` through `st` → the line goes to stderr only. `nightly.yml:156` and `cloud-check.mjs`'s pack stay plain `npm pack`: test-only consumers with no publish. |
| `depends_on` | b9-upgrade-verb, b4-gitignore-lines |
| `verify` | `npx vitest run test/ci/packRelease.test.ts test/cli/stAlias.e2e.test.ts test/cli/binMap.test.ts test/smoke.test.ts test/ci/workflow.test.ts test/ci/forkReleaseWorkflow.test.ts test/ci/tarballStaging.test.ts test/architecture/boundaries.test.ts test/docsPages.test.ts` · `npm run build && node scripts/tarball-smoke.mjs` |
| `threat` | Boundary: the published tarball and the release workflows. They trust the gated `package-lock.json`. Abuse case: a shrinkwrap copied from the dev lock ships devDependencies, or an edit between gate and pack swaps a pin. The check: the shrinkwrap is derived inside the gated job from the lock `npm ci` used, and the digest compare at `release.yml:652-669` still covers the bytes. No new permission and no new network host. |

**Amended at the plan gate (round 1):** `depends_on`: b9-upgrade-verb, b4-gitignore-lines (both edit `docs/getting-started.md`; W-9).

**Amended at session 2 intake (2026-10-25, against `864d0111`):**
- **Line numbers.** "Pack tarball" is `.github/workflows/release.yml:348-360` and
  `.github/workflows/fork-release.yml:327-339`. `tsdown.config.mjs` `entry` is `:335`. `isMain` is `src/cli.ts:108-117`.
  The digest compare is "Verify tarball digest", `release.yml:660-677`. The guard reads `st` at
  `src/hooks/personOnly.ts:551`, `:3214` and `:4739`, and all three stay until 2.0.0. The two pack steps stay
  byte-equal (`test/ci/forkReleaseWorkflow.test.ts:458-463`).
- **Fork rehearsal.** File 1 added "Rehearse the registry publish" right after the fork's pack
  (`fork-release.yml:349-383`). It reads `steps.pack.outputs.tarball`, and `forkReleaseWorkflow.test.ts:1024-1034` holds
  it directly after "Pack tarball". So the new pack line keeps `id: pack`, writes the same `tarball` and
  `tarball_sha256` outputs, and the rehearsal's dry run runs over the tarball that now holds `npm-shrinkwrap.json`.
- **Runner and publish list.** Every `release.yml` job stays on `ubuntu-24.04` (`test/ci/workflow.test.ts:3268-3275`);
  this unit adds no job. `pack-release.mjs` runs no `npm publish`, so the publish closed list
  (`workflow.test.ts:4355-4371`) is unaffected.
- **Budget.** `npm run build` stays under `LOGIC_BUDGET_BYTES` (`tsdown.config.mjs:126`) with the new `st` entry, and
  `test/support/support.test.ts` joins `verify`.

### b11-publish-integrity — the canonical publish skips safely on a re-run, and both workflows check the registry's integrity

| Field | Content |
|---|---|
| `id` | b11-publish-integrity |
| `requirements` | REQ-PLUGIN-054 |
| `files` | `.github/workflows/release.yml` ("Publish to npm with provenance" `:679-682`; a new step after it), `.github/workflows/fork-release.yml` (a new step after "Publish to the registry" `:500-522`), `test/ci/workflow.test.ts` (`:3161-3162`; publish-job cases `:3110-3215`), `test/ci/forkReleaseWorkflow.test.ts` (step list `:366-374`; a new executed describe beside `:919-978`), `test/ci/releaseEgress.test.ts` (read; edit only if it pins the step list) |
| `interfaces` | What is left of the old `u2-release-integrity`: `release.json` schema 2, root digests and `ownedPaths` went with the plugin route in 1.15.0. **Canonical publish** follows the fork's pattern (`fork-release.yml:512-521`), with `env` `PACKAGE_NAME: ${{ needs.gates.outputs.package_name }}` and `VERSION: ${{ needs.gates.outputs.version }}` (outputs at `release.yml:78-79`). It computes `INTEGRITY` the same way, reads `npm view "$PACKAGE_NAME@$VERSION" dist.integrity 2>/dev/null \|\| true`; equal means print "already published with this tarball's integrity; nothing to publish (an idempotent re-run)" and exit 0; non-empty and different means `::error::` and exit 1; else `npm publish "./$TARBALL" --provenance --access public`. **New step "Verify the registry tarball"**, its `run` byte-equal in both: `EXPECTED` = the sha512 integrity of `$TARBALL`; up to 12 tries 10 s apart of `npm view "$PACKAGE_NAME@$VERSION" dist.integrity ${REGISTRY:+--registry "$REGISTRY"}`. On a mismatch or no answer, `::error::the registry serves $PACKAGE_NAME@$VERSION with integrity <a>, and the packed tarball is <b>. Nothing further is published.` and exit 1, which is before "Create GitHub release". The fork's step `env` carries its publish step's `NODE_AUTH_TOKEN`, `REGISTRY`, `PACKAGE_NAME` and `VERSION`. No new egress host: `registry.npmjs.org` is already allowed in the canonical publish job. a11 already adds the fork's `--tag`, so this unit does not edit the publish line. |
| `testCriteria` | `workflow.test.ts`: the publish job's steps hold "Verify the registry tarball" right after "Publish to npm with provenance" and before "Create GitHub release" (red on the parent). The executed canonical publish with npm stubbed, following `forkReleaseWorkflow.test.ts:928-948`: an absent version gives calls `[view, publish ./<tgz> --provenance --access public]`; equal integrity gives `[view]`, exit 0, "already published"; a different integrity gives exit 1 and `[view]`. The `toBe` at `:3162` is re-pinned with `// TEST CHANGE, justified: REQ-PLUGIN-054 — the canonical publish is idempotent on a re-run`. `forkReleaseWorkflow.test.ts`: the step list (`:366-374`) gains the step (re-pin, same reason); executed verify: an equal answer exits 0, a different one exits 1 naming both values, no answer after 12 tries exits 1 (sleep stubbed); the two `run` bodies are equal. |
| `edgeCases` | The registry has not served the version yet: the step retries for 120 s, then fails. The re-run then skips the publish and checks again. A tarball whose `$TARBALL` contains a space: every variable is quoted. A re-run after "Create GitHub release" already succeeded: the canonical `gh release create` still fails, outside this unit (a follow-up). The rehearsal job publishes nothing and is unchanged. |
| `depends_on` | docs/plans/022-autonomy-distribution-01.md, b2-secret-shaped-fixtures, b10-shrinkwrap-st |
| `verify` | `npx vitest run test/ci/workflow.test.ts test/ci/forkReleaseWorkflow.test.ts test/ci/releaseEgress.test.ts test/ci/changelogLinks.test.ts test/ci/upstreamWorkflow.test.ts test/docsPages.test.ts test/upstream/lane.test.ts test/pack/sigstoreVerifier.test.ts` |
| `threat` | Boundary: the registry's `npm view` answer is outside data. Abuse: a version already held by another tarball, or a lying mirror, makes a re-run skip the publish and ship a release over bytes npm does not serve. Stop: the skip needs an exact integrity match with the verified tarball, a mismatch refuses, the verify step re-reads after every publish, and the answer is only ever compared, never run. |

**Amended at the plan gate (round 1):** `edgeCases`: replace "(Open 5)" with "(a follow-up: the Follow-ups row on making 'Create GitHub release' idempotent)".

**Amended at session 2 intake (2026-10-25, against `864d0111`):**
- **Line numbers.** "Publish to npm with provenance" is `.github/workflows/release.yml:689-690`; "Create GitHub
  release" `:704-724`; the `gates` outputs `:86-87`. "Publish to the registry" is
  `.github/workflows/fork-release.yml:557-579`, with its view-and-compare at `:569-578`; the fork's "Create GitHub
  release" is `:585-618`. In the tests, the fork publish step list is `test/ci/forkReleaseWorkflow.test.ts:367-375`, and
  the executed publish describe is `:920-991` (harness `:926-952`, which passes `DIST_TAG` from the parsed file,
  `:946-947`). The canonical publish `toBe` to re-pin is `test/ci/workflow.test.ts:3184`, and the publish-job cases are
  `:3138-3237`.
- **The two verify steps.** Their `run` is byte-equal, and their `env` differs. The canonical step carries only
  `PACKAGE_NAME` and `VERSION` and no credential, because `workflow.test.ts:3186-3189` refuses `NODE_AUTH_TOKEN` and
  `NPM_TOKEN` there. The fork step carries its publish step's `NODE_AUTH_TOKEN`, `REGISTRY`, `PACKAGE_NAME` and
  `VERSION`.
- **Shipping list.** It stays "Publish to npm with provenance", "Create GitHub release" (`workflow.test.ts:3230`). The
  new step makes no publish or release call. It sits between the two and after "Verify tarball digest".
- **Already done.** The fork publish's `--tag "$DIST_TAG"` (`fork-release.yml:579`) and its skip on equal integrity and
  refusal on a different one (`:569-578`) are on the branch.
- **Runner.** No job is added. The canonical publish job stays on `ubuntu-24.04` (`release.yml:526`).

### b12-repo-file-waste — the touchpoint companion `agents/openai.yaml` is written only when Codex is selected

| Field | Content |
|---|---|
| `id` | b12-repo-file-waste |
| `requirements` | REQ-FLOW-033 (ADDED, the certain half); REQ-FLOW-026 (MODIFIED, the companion sentences) |
| `files` | `src/emit/skillsProjection.ts` (`projectTouchpointSkills` `:584-614` and its doc `:562-583`); `src/adapters/cursor.ts:550`; `src/adapters/codex.ts:846`; `test/emit/touchpointSkills.test.ts`; `test/adapters/codex.test.ts` |
| `interfaces` | `projectTouchpointSkills(commands, ctx, options: { readonly policy: boolean })`. The option is required, so each caller decides. `policy: false` returns only the `SKILL.md` rows; `true` adds the `TOUCHPOINT_POLICY_FILE` row as today (`:606-610`). Cursor passes `false` (`cursor.ts:550`). Codex passes `true` (`codex.ts:846`; `shownSkillRows` `:724-746` still hides the nine by their companion, so the 8,000-character budget is unchanged). The composer merges the byte-identical `SKILL.md` rows of both clients. The companion is Codex's row alone, so deselecting Codex leaves it planned by nobody, and the reclaim sweep deletes it by its recorded hash. |
| `testCriteria` | **Fails on parent:** `planFor(["cursor"])` plans no path ending `/agents/openai.yaml` under `.agents/skills/st-*`, and the nine `SKILL.md` are byte-identical to `planFor(["cursor","codex"])`'s. `[cursor, codex]`: the companion's owners are `["codex"]`. The case at `touchpointSkills.test.ts:70-71` changes from `["codex","cursor"]`, with a `TEST CHANGE, justified: REQ-FLOW-033 — Cursor reads disable-model-invocation, not the companion` line. `[codex]` alone: Codex's skills-list measure equals today's (`codex.test.ts`). A sync over a fixture ledger from 1.16.0 with tools `[cursor]` deletes the nine companions and keeps each `SKILL.md`. |
| `edgeCases` | An edited companion on a Cursor-only setup → the sweep keeps it and names it. Pack commands ride the same rows: a pack command loses its companion without Codex too. The bundled skills' companions (`content/skills/*/agents/openai.yaml`, 8 in this repository's `.claude/skills/`) are untouched (decision E4). |
| `depends_on` | none |
| `verify` | `npx vitest run test/emit/touchpointSkills.test.ts test/emit/skillsProjection.test.ts test/adapters/codex.test.ts test/adapters/cursor.test.ts test/cli/engine/emission.test.ts test/cli/engine/packFit.test.ts test/emit/coverageGaps.test.ts test/pack/packEngineDefects.test.ts test/architecture/boundaries.test.ts` |

**Amended at the plan gate (round 1):** `files`: add `src/manifest/ownedPaths.ts` (new `RETIRED_ENGINE_PATHS`), `src/cli/engine/emissionWrite.ts` (`engineRenderingsFor` `:1009-1094`; new `retiredEngineRenderings` beside `movedSkillRenderings` `:1097-1111`), `test/cli/engine/retiredRenderings.test.ts` (new). `src/emit/skillsProjection.ts` also exports `TOUCHPOINT_POLICY` (`:559`). Add to `interfaces`: **Retired-path proof (W-1, W-2; security-sensitive).** Today, a whole-file delete at a path `needsRenderingProof` names (`src/manifest/ownedPaths.ts:341-343`; `.agents/skills/st-*/…` and `.github/prompts/st-*` both qualify, `:306-312`) needs the bytes to hash to a rendering the running engine produces (`renderingRefusal`, `src/merge/reclaim.ts:723-750`). `engineRenderingsFor` builds renderings only from what an adapter in the proof plan renders (`emissionWrite.ts:1027-1029`, `:1081-1083`) plus the frozen moved-skill digests. With tools `[cursor]` after this unit, or Copilot after `b13`, nothing proves the retired files. **New:** `export const RETIRED_ENGINE_PATHS: ReadonlyMap<string, { owners: readonly string[]; touchpoint: string }>` in `ownedPaths.ts`. It is a frozen literal, a closed list of 18 paths for the nine touchpoints 1.16.0 shipped (`content/commands/st-{ask,board,debug,plan,pr-resolve,quick,rework,spec,work}.md`): `.github/prompts/st-<id>.prompt.md` (owner `copilot`) and `.agents/skills/st-<id>/agents/openai.yaml` (owners `codex`, `cursor`). It is never derived from the corpus. `retiredEngineRenderings(ledger, wanted, planned): [path, digest][]` works as follows. Take each `wanted` path that is in the list and that no plan output renders. For each ledger row at that path whose `adapter` is an owner, whose `artifactType` is `"command"`, whose `artifactId` is that touchpoint's (as `emittedIdFor` maps it), and whose `contentHash` is 64 lowercase hex, select a digest. At a prompt file the digest is the row's `contentHash`. At a companion it is `sha256(TOUCHPOINT_POLICY)`, the companion's only text since `cf64788f`, and only when the row records that same hash. The row only selects. The delete still needs the bytes, raw or CRLF-folded, to hash to the digest (`matchesRendering`, `reclaim.ts`). So an edited file is kept, reported as `skipped-user-content` and named. A path an adapter still plans (Codex selected) takes the ordinary proof. `syncRenderingsFor` does not change. Reports and test titles follow the guard-unit rule (`path:line`, the class of input). `edgeCases`: replace "(Open 2)" with "(decision E4)". Add: "A pack command's companion is outside the closed list, so without Codex it is kept and named." Add to `testCriteria`: `retiredRenderings.test.ts` checks these. The list has exactly 18 literal keys. A 1.16.0 ledger with tools `[cursor]` → sync deletes the nine companions and keeps each `SKILL.md` byte-identical. An edited companion is kept and named. Each of these is kept, one case per input class: a row with its true hash at `.github/prompts/team.prompt.md` (not listed); a listed prompt path owned by `cursor`; `artifactType: "skill"`; another touchpoint's `artifactId`; and a companion row recording another text's hash with bytes to match. For a prompt row, `retiredEngineRenderings` returns its `contentHash`. For a planned path it returns nothing. Add to `verify`: `test/cli/engine/retiredRenderings.test.ts test/merge/reclaim.test.ts test/merge/reclaim.property.test.ts test/cli/ledgerForgery.test.ts test/manifest/ownedPaths.test.ts test/ci/testInputsGuard.test.ts`. `threat`: Boundary: the committed ledger (`.stamity/manifest.json`), which any repository writer can edit. Trusts: a row's owner, artifact and recorded hash, and only to pick a digest at one of 18 named paths. Abuse: a forged row hashing an owner's own file at one of those paths makes the sweep delete it. Check: the path is in the closed `RETIRED_ENGINE_PATHS` list and no running adapter plans it; the row's owner, `artifactType` and touchpoint match the entry; the bytes hash to the digest; a companion's digest is the frozen engine text, never the row's own hash. Residual: at the nine prompt paths, a forged row carrying the true hash of an owner's file under an `st-` name still deletes it. That is the residual class `ownedPaths.ts:333-339` names. The report hands it on as a follow-up row for `SECURITY.md`'s residual list.

**Amended at the plan gate (round 2; binds over the round-1 block's digest rule):** the digest is never a ledger row's
own `contentHash`. Each `RETIRED_ENGINE_PATHS` entry carries frozen 1.16.0 digests, computed once by this unit from tag
`v1.16.0`'s renderer (`git show v1.16.0:<path>` of the adapter and the command sources, rendered for the default case
with no model pin) and written as literals, the way `movedSkillRenderings` freezes the moved skills' digests
(`emissionWrite.ts:1097-1111`). The closed list holds the nine touchpoint prompt files, the prompt files 1.16.0 wrote for
its pack commands (`ops`, `product-audit`, `scaffold`: the unit lists each from `v1.16.0`'s packs and their Copilot
rows), and the nine touchpoint companions (their digest the frozen `TOUCHPOINT_POLICY` text). The ledger row still has
to match (owner, artifact type, touchpoint) and the bytes, raw or CRLF-folded, must hash to a frozen digest; a file
written under a pin, or edited, is kept and named. The residual the round-1 block named (a forged row at a listed
prompt path) is gone: a forged row can only select a digest that is the engine's own 1.16.0 bytes. Test: a row carrying
the true hash of an owner's own file at a listed prompt path, bytes not equal to 1.16.0's rendering → kept and named.

**Amended at the plan gate (round 3; binds over the round-2 block for the prompt files):** a 1.16.0 prompt file carries
values of its own repository (the pinned CLI call, the gate commands: `v1.16.0:src/adapters/copilot.ts:1349-1361`), so
one default digest matches almost no real file. The prompt-file digests are therefore rendered, not frozen: a frozen
copy of 1.16.0's prompt-file renderer (`src/adapters/copilotLegacyPrompts.ts`, copied from `v1.16.0` with only the
inputs it read, its header naming the source commit) renders each listed prompt path with this repository's own
values and the version the manifest recorded as `generatedBy`, and that rendering's digest is the proof; the
companions keep the frozen `TOUCHPOINT_POLICY` digest. A file that still does not match is kept and named, and `check`
lists it with a one-line remedy (the owner deletes it). Add to `files`: `src/adapters/copilotLegacyPrompts.ts`,
`test/adapters/copilotLegacyPrompts.test.ts`; a test: a fixture prompt file written by `v1.16.0` for a repository with
its own gate commands is matched and deleted; the same file with one edited line is kept and named.

**Amended at session 2 intake (2026-10-25, against `864d0111`):** File 1 did not change
`src/emit/skillsProjection.ts`, `src/adapters/cursor.ts`, `src/cli/engine/emissionWrite.ts`,
`src/manifest/ownedPaths.ts` or `src/merge/reclaim.ts`, and their cited lines hold. In `src/adapters/codex.ts`, file
1's `a10` added lines above this unit's sites: the call is now `codex.ts:852`, and `shownSkillRows` is `:738-752`, its
doc `:722-737`. `projectTouchpointSkills` starts at `skillsProjection.ts:585`. The owners case in
`test/emit/touchpointSkills.test.ts` is at `:69` (`SKILL.md`) and `:72` (the companion).
- **The frozen inputs.** Tag `v1.16.0` is in the checkout, an annotated tag on `b9b39755`.
  `src/adapters/copilotLegacyPrompts.ts` copies from that tag `buildPromptFile`, `frontmatterDocument`, `bodyOf`,
  `yamlScalar`, the `emittedIdFor` naming it calls, and `bodyRenderer` (the lines round 3 cites), with the substitution
  helpers `bodyRenderer` calls. It leaves out `modelLine`, since the default case has no pin. The builder confirms each
  range with `git show v1.16.0:src/adapters/copilot.ts` before copying, because Package 22 landed between the tag and
  `f9abc9c6`. The touchpoint bodies come from `git show v1.16.0:content/commands/st-<id>.md`. The module follows
  `src/adapters/cursorLegacyGuards.ts`: it is wired into `src/composition/root.ts` beside `:136`, and the unit runs
  `test/composition`. `files`: add `src/composition/root.ts`.
- **The pack prompt paths.** `src/pack/retired.ts:52-119` names the seven commands the three 1.16.0 packs shipped:
  `ops` (`/st-release`, `/st-incident-response`), `product-audit` (`/st-product-audit`, `/st-benchmark`) and `scaffold`
  (`/st-design-system-create`, `/st-slo-scaffold`, `/st-auth-scaffold`). The unit lists their files with `git ls-tree
  -r --name-only v1.16.0 -- packs/`, reads each body and its `tools:` with `git show v1.16.0:packs/<id>/<path>`, and
  lists only those whose `tools:` admits `copilot`. Their bodies are the v1.16.0 catalog copies, so an installed copy
  with other content renders other bytes and is kept and named. The `frontend` and `production` packs were never
  released, so no 1.16.0 ledger holds their prompt files and they stay off the list.
- **The count.** `RETIRED_ENGINE_PATHS` holds the nine touchpoint prompt files, the nine companions and the pack prompt
  paths the unit lists. The test becomes "exactly the listed literal keys" (18 plus the pack paths), and the Shared
  contracts row says the same.
- **The kept file's remedy (declared default; binds over round 3's "`check` lists it with a one-line remedy").** The
  kept file is named by the sync report's `skipped-user-content` line, and `check`'s existing drift output is the
  listing. This unit edits no `src/cli/commands/check.ts`. A case in `test/cli/engine/retiredRenderings.test.ts` (this
  unit's new file, so it does not meet `b2`'s `test/cli/commands/check.test.ts` in wave 1) runs `check --json` after the
  sync that kept an edited prompt file and asserts that a finding names its path. If `check` does not name it, this unit
  keeps the sync-report case, adds no `check` case, and its report hands the gap to `b16-docs-pointers-batch`, which adds
  a `check` row in the `moved-skills` pattern (`src/cli/commands/check.ts:1297`, registered `:2456`; its
  `docs/troubleshooting.md` row beside the `moved-skills` row) and the case in `test/cli/commands/check.test.ts`.
- **`SECURITY.md`.** The widened deletion lane is named on the ledger row at `SECURITY.md:95`, whose file-2 writer is
  `b1-fork-ci-job`. This unit's report hands `b1` this sentence, to follow "a file no rendering proves is kept and
  named." in that row's protection column: "A file an earlier release wrote that this release no longer renders (the
  nine touchpoint prompt files and the prompt files of the pack commands 1.16.0 shipped, under `.github/prompts/`, and
  the nine touchpoint companions `agents/openai.yaml`) is proved by a closed list of literal paths instead: the ledger
  row must name the listed owner, artifact type and touchpoint, and the bytes, raw or with `\r\n` read as `\n`, must
  hash to 1.16.0's own output there, the companion's frozen text or a prompt file rendered by a frozen copy of 1.16.0's
  renderer with this repository's own values; a row's own hash proves none of them, and a file that does not match is
  kept and named." The row's code column gains `src/manifest/ownedPaths.ts::RETIRED_ENGINE_PATHS` and
  `src/cli/engine/emissionWrite.ts::retiredEngineRenderings`. This replaces round 1's follow-up row for the residual
  list, which round 2 already closed.
- **Whole-tree.** The unit touches `src/adapters/`, so `verify` also runs `test/cloud`, `test/composition` and
  `test/adapters/copilotLegacyPrompts.test.ts`.

**Amended at build (2026-10-25):** `files` gain:
- `test/emit/skillsProjection.test.ts`: its five two-argument calls take `{ policy: true }`, plus one `policy: false` case.
- `test/emit/crossClientGoldens.test.ts`: the hand-written companion-owners check at `:2556-2558`, and the snapshot.
- `test/adapters/cursor.test.ts:943-953`, moved from `b18`: the two companion paths leave Cursor's case.
- One `PLAN_MAP` line in `test/architecture/boundaries.test.ts` for `src/adapters/copilotLegacyPrompts.ts`. `b9` also
  edits that file in wave 1, so the integration lane merges both lanes' lines. This is a declared exception to one
  writer per file per wave, for a single map line only.

**Amended at build (2026-10-25, the prompt-file half):** Binds over the round-2 and round-3 blocks, the session 2
intake block and the build block above, for the Copilot prompt files. The orchestrator's declared default: keep and
name. This unit closes on its companion half. `RETIRED_ENGINE_PATHS` holds only the nine
`.agents/skills/st-<id>/agents/openai.yaml` companions, each with the frozen 1.16.0 digest. It holds no prompt-file
entry. There is no `src/adapters/copilotLegacyPrompts.ts`, no wiring in `src/composition/root.ts`, and no `PLAN_MAP`
line for it, so the build block's map-line exception falls away. Why: re-rendering a prompt file needs 1.16.0's nine
command bodies shipped in the package, about 225 KB, past the logic bundle's headroom of about 124 KB
(`tsdown.config.mjs:126`). Per-file digests already fail for `st-work`. The `SECURITY.md` sentence this unit hands `b1`
is the one in its implementer's return, which names the closed list of companions. It replaces the intake block's
sentence. The legacy prompt files are kept and named by `b13`, and listed by `check` through `b16`.

### b13-copilot-touchpoints-skills — Copilot gets the nine as the shared skills, and its prompt files are reclaimed

| Field | Content |
|---|---|
| `id` | b13-copilot-touchpoints-skills |
| `requirements` | REQ-FLOW-050 (ADDED); REQ-FLOW-026, REQ-FLOW-118, REQ-LADDER-007 (MODIFIED) |
| `files` | `src/adapters/copilot.ts` (`COPILOT_PROMPTS_DIR`/`PROMPTS_DIR`/`WORK_PROMPT_PATH` `:99-103`; the `command-surface` cap `:211-220`; the row loop default `:437-438`; `buildPromptFile` `:609-638` deleted; `modelLine` `:734-741` deleted; `runAgentRows` `:647-658`; `buildRunAgentFile` text `:662-681`); `src/emit/skillsProjection.ts` (doc `:575-579` only); `src/cli/commands/init/panel.ts` (`:8`, `:279`); `docs/getting-started.md:137`; `docs/cloud.md:183-184`; `test/adapters/copilot.test.ts`; `test/emit/touchpointSkills.test.ts`; `test/cli/commands/initPanel.test.ts`; `test/emit/substitution.test.ts:599`; `test/emit/plannerPackReach.test.ts:212`; `test/pack/projection.test.ts:560-659` |
| `interfaces` | Commands leave Copilot's per-item switch. After rules and agents come `for (const row of projectTouchpointSkills(admitted commands, ctx, { policy: false })) rows.push({ path, content, owner: { adapter: "copilot", artifactId: row.artifactId, artifactType: "command" } })`, the shape of `src/adapters/cursor.ts:549-556`. `WORK_SKILL_PATH = ".agents/skills/st-work/SKILL.md"` replaces `WORK_PROMPT_PATH`. `runAgentRows` keys on it, and the entry text says "Read `.agents/skills/st-work/SKILL.md` whole". The panel step reads `commandSurfaceStep(SKILLS_PROJECTION_DIR, "/st-<id>")`. The cap reads: "native — every touchpoint ships once, as the shared skill `.agents/skills/st-<id>/SKILL.md` with `disable-model-invocation: true`, invoked as `/st-<id>` by the Copilot CLI, VS Code, Visual Studio, JetBrains (preview) and the cloud agent; no prompt file is written; Xcode reads prompt files and no skills, so it lists none; a pin on a command's class reaches no Copilot file". Each surface claim is re-read and dated at intake: GitHub's customization cheat sheet and VS Code's agent-skills page, last read 2026-10-06; today's research has no Copilot-skills reading (re-read and dated at intake). **`model:` decision:** drop it. It was written only under an operator pin, and no shipped command declares a class (`cb777bc9`'s message), so no shipped file changes. `ownedPaths.ts:117` and `personOnlyPaths.ts:98` keep `.github/prompts/` for reclaim and for the guard. |
| `testCriteria` | **Fails on parent:** `planFor(["copilot"])` plans nine `.agents/skills/st-<id>/SKILL.md` owned by `copilot` and no `.github/prompts/st-*`. This replaces `touchpointSkills.test.ts:103-114` ("keeps its prompt files"), with `TEST CHANGE, justified: REQ-FLOW-050`. `[copilot, cursor]`: each `SKILL.md` is one row with owners `["copilot","cursor"]` and no companion. A sync over a ledger holding the nine prompt files deletes them and leaves the other `.github/` files byte-identical (`copilot.test.ts`). The entry agent is planned only beside `st-work`'s skill and names its path, and it stays under 2,000 characters. The cap names Xcode. The panel names `.agents/skills` and not `.github/prompts` (`initPanel.test.ts`). Every case pinning `.github/prompts/*.prompt.md` moves with a `TEST CHANGE, justified` line (`copilot.test.ts:578-2161`, `projection.test.ts`, `plannerPackReach.test.ts`, `substitution.test.ts`). |
| `edgeCases` | An edited legacy prompt file → kept and named, so VS Code lists it twice until the person removes it. A user's own unledgered prompt files → untouched. A pack command with `tools: [cursor]` → no Copilot owner. An agent already planned at the entry path → refused as today. A Copilot-only Xcode team loses the touchpoints (a follow-up row with a `when:`). |
| `depends_on` | b12-repo-file-waste, b10-shrinkwrap-st, b8-copilot-setup-switch |
| `verify` | `npx vitest run test/adapters/copilot.test.ts test/emit/touchpointSkills.test.ts test/cli/commands/initPanel.test.ts test/emit/substitution.test.ts test/emit/plannerPackReach.test.ts test/pack/projection.test.ts test/manifest/ownedPaths.test.ts test/emit/hooksInfra.test.ts test/change/personOnlyPaths.test.ts test/docsPages.test.ts test/architecture/boundaries.test.ts` |

**Amended at the plan gate (round 1):** Add to `interfaces`: the prompt files' reclaim adds no proof of its own. `b12`'s `RETIRED_ENGINE_PATHS` names the nine `.github/prompts/st-<id>.prompt.md`, so deleting `buildPromptFile` (`copilot.ts:609-638`) leaves them provable by their recorded hash. Replace "(Open 4)" with "re-read and dated at intake". **Stop rule:** if the intake re-read finds that a surface the cap names (Copilot CLI, VS Code, Visual Studio, JetBrains, the cloud agent) loads no `.agents/skills/` skill, the unit stops before it deletes any prompt row and returns the reading with its source and date. Add to `testCriteria`: the sync over a ledger holding the nine prompt files deletes each unedited one through `b12`'s proof. An edited one is kept, reported as `skipped-user-content` and named. `depends_on`: b12-repo-file-waste (the `policy` option and the retired-path proof), b10-shrinkwrap-st (`docs/getting-started.md`), b8-copilot-setup-switch (`src/adapters/copilot.ts`). Add `test/cli/engine/retiredRenderings.test.ts test/merge/reclaim.test.ts` to `verify`.

**Amended at session 2 intake (2026-10-25, against `864d0111`):** File 1 did not change `src/adapters/copilot.ts`,
`src/emit/skillsProjection.ts` or `src/cli/commands/init/panel.ts`, and their cited lines hold. `buildPromptFile` is
`copilot.ts:624-638`, its doc `:609-623`. `docs/cloud.md:183-184` is now `:208-209`. The cases in
`test/adapters/copilot.test.ts` that pin `.github/prompts/` now sit at `:555-588`, `:798-1122`, `:1394-1424` and
`:2209` (the `command-surface` cap). File 1's `a9` re-pinned the Copilot model ids in that file (`:122-124`, `:1190`,
`:1206`, `:1320-1322`), and every case this unit moves keeps them. `src/adapters/claude.ts:1164` now records that
Copilot CLI 1.0.100 imports `.claude/settings.json` hooks; the cap text does not contradict it. The touchpoint
`SKILL.md` rows planned for Copilot take `b12`'s `policy: false` and add no companion. No new caller of
`projectTouchpointSkills` exists (only `codex.ts:852` and `cursor.ts:550`). **Whole-tree.** The unit touches
`src/adapters/`, so `verify` also runs `test/cloud`.

**Amended at build (2026-10-25, the prompt-file half):** Binds over the cell and the round-1 block wherever they delete
a prompt file (`b12` dropped the prompt-file proof). No prompt file is written. The next `sync` keeps each legacy
`.github/prompts/st-*.prompt.md`, for a touchpoint or a pack command, and names it with its remedy: the owner deletes
it. Nothing is deleted. `testCriteria`: the sync over a ledger holding the nine prompt files keeps each one
byte-identical and names it, and leaves every other `.github/` file byte-identical. The cases that expected a deletion
expect it kept and named instead.

### b14-run-verbs-batch — The small run-verb rows (file 2)

| Field | Content |
|---|---|
| `id` | b14-run-verbs-batch |
| `requirements` | REQ-FLOW-091, REQ-FLOW-092, REQ-FLOW-101 (MODIFIED) |
| `files` | `src/cli/commands/run.ts`, `src/runs/planCheck.ts`, `src/runs/preflight.ts`, `src/runs/pullRequest.ts`, `src/cli/commands/gate.ts`, `test/cli/commands/runCheckpoint.test.ts`, `test/cli/commands/runEnd.test.ts`, `test/runs/planCheck.test.ts`, `test/runs/preflight.test.ts`, `test/runs/pullRequest.test.ts`, `test/cli/commands/gatePreflight.test.ts` |
| `interfaces` | **build/102.** Comment fixes at `run.ts:47-53` (main and master always count, as `withFallbacks` at `:725` does) and `:145-146` (the marker's 15-minute window, `RUN_ENDED_MAX_AGE_MS`, `src/mcp/env.ts:192`).<br>**build/105.** The helpers at `run.ts:1734`, `:1759`, `:1830`, `:1840`, `:1861`, `:1876`, `:1892`, `:1914`, `:2080`, `:2084`, `:2354`, `:2411`, `:2515` take `verb` in place of the hard-coded `CHECKPOINT`.<br>**review/224.** Write a test first: a file tracked inside a folder `.gitignore` ignores, through `ignoredPaths` then `add` (`:1873-1901`). Fix only if it is red.<br>**build/42.** `isCriticalRisk` (`planCheck.ts:406-412`) also reads a plain paragraph line led by `CRITICAL_LEAD` (`:171`).<br>**build/43.** `"PWD"` joins `CREDENTIAL_SEGMENTS` (`preflight.ts:818-829`); `credentialName` skips the exact `PATH_NAMES` (`:846`).<br>**build/12.** `resolveRepo` (`pullRequest.ts:330-345`) maps `ssh.github.com` to `github.com` when the host `gh` uses is `github.com`.<br>**review/58.** `usageReviewLines` (`gate.ts:1967`) passes `whole`; `reviewState` gains `recordUnread: boolean` (`preflight.ts:127`, `:868-879`).<br>**build/103.** The dry run at `run.ts:995` counts a staged folder that holds `.git` as a link (a gitlink).<br>**review/167.** Test only: a link at `.claude/hooks` is held.<br>**review/203.** At `run.ts:1669`, a value led by `[A-Za-z]:` is not bare, so the hold refuses it (it was held as written at `:1680`). |
| `testCriteria` | Each row adds one case that fails on the parent:<br>- A run-end git failure names `run end could not`.<br>- A plain-paragraph `Critical …` under Risks yields `critical-risk`.<br>- `MYSQL_PWD` set to a short value is named in `token-env`, and `PWD` is not.<br>- An `ssh://git@ssh.github.com:443/o/r.git` origin resolves.<br>- A 1.2 MiB record yields the "not read" reason.<br>- The dry run's `would hold` lists a nested repository.<br>- A hook arg `C:x.sh` refuses the hold, naming a drive.<br>- review/224: red first, or the row closes as rejected with the test kept as the pin.<br>review/167 passes on the parent; it is the pin that row asked for. |
| `edgeCases` | **Workspace host.** `ssh.github.com` under a `GH_HOST` naming another host stays `null`.<br>**Scheme values.** A scheme value of two or more letters (`https:`) still skips (`:1677`).<br>**Plain prose.** "No risk here is Critical." stays ready, since only a line led by Critical counts (`planCheck.test.ts:256`). |
| `depends_on` | docs/plans/022-autonomy-distribution-01.md, b2-secret-shaped-fixtures, b17-test-infra-batch |
| `verify` | `npx vitest run test/cli/commands/runCheckpoint.test.ts test/cli/commands/runEnd.test.ts test/cli/commands/run.test.ts test/runs/planCheck.test.ts test/runs/preflight.test.ts test/runs/pullRequest.test.ts test/runs/morning.test.ts test/qa/cloudCheck.test.ts test/cli/commands/gatePreflight.test.ts test/cli/commands/gate.test.ts test/cloud/ending.test.ts test/docsPages.test.ts` |
| `threat` | **Trust boundary:** hook declarations at Base, and the pre-flight's view of the environment.<br>**Trusts:** a declaration's argument words.<br>**Abuse:** a drive-relative script value on Windows makes the hold miss the file it names, so the run pushes it unheld (review/203). Stopped by refusing a `[A-Za-z]:` value.<br>**Also:** the `review-state` read reports "not read" past the size cap, never a false "no line". |

**Amended at the plan gate (round 1):** Add to `interfaces` (binds over build/105, build/103, review/203). **build/105:** each of these helpers in `src/cli/commands/run.ts` takes a `verb` parameter and passes it to `git(…)` / `commitAt(…)` in place of `CHECKPOINT`: `changedSince`, `heldInHistory`, `committedDeletions`, `stagedDeletions`, `indexTracked`, `ignoredPaths`, `add`, `strayStaged`, `removeStalePatch` (both calls), `localTags`, `draftPr` and `resumedList`. These are 12 functions with 13 call sites at `f9abc9c6`. Their callers pass the verb `runCheckpoint` received (`run.ts:844`). These `CHECKPOINT` uses stay: the constant (`:153`), the options map key (`:169`), the subcommand choices (`:242`), the checkpoint-only `--pr`/`--title` check (`:259`), the dispatch (`:270`) and the `verb` parameter's type (`:844`). **build/103** is `2026-10-18_cloud-runs-2/build/103` (M-6): the dry run in `runCheckpoint` (`run.ts:990-998`, the `would hold` line) counts a staged folder holding `.git` as a gitlink. The inbox-rows table names it that way. **review/203:** in `hookPathsAt` (`run.ts:1671` area), a value led by `[A-Za-z]:` is not `bare`. `edgeCases`: in **Scheme values**, replace "(`:1677`)" with "(the scheme test in `hookPathsAt`, `run.ts:1671`)" (M-11).

**Amended at session 2 intake (2026-10-25, against `864d0111`):** Binds over the cell and the round-1 block where they
differ. `files`: add `src/runs/hookPaths.ts` and `test/runs/hookPaths.test.ts`; review/203's hold moved there in file
1. Every row is still open at HEAD.
- **build/102:** the comment lines are `run.ts:51-52` (main and master always count, as `withFallbacks` at
  `run.ts:808-810` does) and `run.ts:151-152` (the marker's 15-minute window, `RUN_ENDED_MAX_AGE_MS`,
  `src/mcp/env.ts:193`).
- **build/105:** the list of 12 functions keeps its names, except that `heldInHistory` (`run.ts:1651`) now only wraps
  `pushedChanges` (`run.ts:1659-1671`). `pushedChanges` takes `verb` in its place, and `heldInHistory` passes it
  through. File 1 added one caller, `refusedEndingStray` (`run.ts:633-638`), which calls `pushedChanges` and
  `changedSince`. It takes `verb` too, and its caller passes the verb `runCheckpoint` received (`run.ts:929`). The two
  failure messages at `run.ts:1632` and `run.ts:1665` name `run ${verb}`, not `run checkpoint`; the run-end test reads
  them. The `CHECKPOINT` uses that stay are `run.ts:162`, `:185`, `:276`, `:299`, `:313` and `:929`. `run land` lives
  in `src/cli/commands/runLand.ts` with its own git runner, so build/105 does not reach it.
- **review/224:** `ignoredPaths` then `add` are `run.ts:1775-1798`.
- **build/103:** the dry run is `run.ts:1109-1116`. A `wouldStage` entry (`run.ts:1111`) counts as a link where the
  path is a link, or a folder holding `.git` (`isDirectory`, `run.ts:2507`).
- **review/203:** in `src/runs/hookPaths.ts:297`, a value led by `[A-Za-z]:` is not `bare`, so the resolver's refusal
  (`hookPaths.ts:119`) refuses the hold at `hookPaths.ts:308` instead of holding the value as written. The scheme skip
  stays at `hookPaths.ts:299` (two or more letters). The case goes in `test/runs/hookPaths.test.ts`.
- **build/12:** `resolveRepo` is `src/runs/pullRequest.ts:331-347`. **review/58:** `usageReviewLines` is
  `gate.ts:1973-1980`, its caller `gate.ts:2108`; `reviewStateReason` is `preflight.ts:868-878`. **build/43:**
  `credentialName` is `preflight.ts:835-838`.
- `edgeCases` **Scheme values:** the scheme test is `src/runs/hookPaths.ts:299`. `verify`: add
  `test/runs/hookPaths.test.ts`.

**Folds four Minors of ledger `2026-10-23_autonomy-distribution-01`** (the split at intake: this unit keeps the
`run.ts` rows, `b14c-land-batch` takes the `runLand.ts` rows). Each case goes in `test/cli/commands/runCheckpoint.test.ts`.
- **review/14.** `--drop-held` is read only inside `if (unattended)` (`run.ts:1128`, `:1140-1145`), so in an attended
  run it is ignored and the verb exits 0. **Fix:** after the fallback refusal (`run.ts:1027-1030`) and before the
  dry-run return (`:1109`), when the run is not unattended and `opts.dropHeld` is non-empty, push `not withdrawn:
  --drop-held reads only in an unattended run, where the held patch is written` and `finish(false)`. **Test** (in the
  describe at `:2210`): an attended record with one `--drop-held` path exits 1 with that line. The parent exits 0. This
  moves a CLI result from exit 0 to exit 1 (see Shared contracts); `docs/cli-reference.md`'s text is unchanged, and the
  CHANGELOG line goes to the integration writer.
- **review/15.** `committedPatchPaths` (`run.ts:2004-2025`) lists paths by `git apply --numstat` and never runs
  `foreignSectionHeader` (`:2182-2210`), so the kept path (`:1146-1156`) lists a no-prefix section one folder off.
  **Fix:** split the read bytes with `sectionStarts` (`:2028`) and return `hold failed: a section of the kept <patch>
  <reason>` for the first section where `foreignSectionHeader` is non-null, before numstat. **Test:** the no-prefix
  sections of the `it.each` at `:2741-2756`, run on a fresh clone with no new held change. Fixed: exit 1 with the
  no-prefix line. Parent: exit 0 with `held` naming the path one folder off.
- **review/16.** A section written with diff prefixes other than `a/` and `b/` falls through `diffGitNames` (`:2143`,
  prefixes limited to `[abciwo12]/` at `:2122`) and `noPrefixNames` (`:2164`), and gets the generic refusal at
  `:2192-2194`. **Fix:** a `customPrefixNames(line)` check (two plain names, each one first folder, the rest equal; the
  split loop of `:2150-2156`), checked after `noPrefixNames` at `:2191`. It returns "was written with diff prefixes other
  than a/ and b/ (diff.srcPrefix/diff.dstPrefix), so git apply would place it one folder off". Still a refusal.
  **Test:** a section with two custom prefixes through `steeredClone`. Fixed: the refusal names the prefix. Parent: the
  "does not name one path twice" line.
- **review/40 — closed as rejected, with a pin test.** `PUSHABLE_BRANCH` (`run.ts:225`) refuses a branch name holding
  `(`, `$` or a backtick at `:1001-1003`, before the verdict at `:1443`, so quoting at `:1443` changes no outcome. The
  guard already reads a single-quoted refspec as the branch it names (`src/hooks/personOnly.ts:2047-2051`). **Pin:** a
  branch name holding a parenthesis joins the by-name refusal at `:3211-3222`. It passes on the parent, and that is the
  pin.

### b14b-default-branch-read — a write to a remote's HEAD ref is read as the push it steers

| Field | Content |
|---|---|
| `id` | b14b-default-branch-read |
| `requirements` | REQ-FLOW-102 (MODIFIED: a write to a remote's HEAD ref is read as the push it steers, so it asks attended and is refused unattended; and `git remote set-head`, a `remote-write`, leaves the set the autonomy setting runs unasked and asks). Source: ledger row `2026-10-23_autonomy-distribution-01/review/163` (Warning, security, pre-existing). |
| `files` | `src/hooks/personOnly.ts` (`symbolicRefVerdict` `:2140-2176`; `remoteWriteVerdict` and its doc `:1888-1904`; the `update-ref` branches in the git reader `:3113-3151`); `src/hooks/scripts.ts` (comment only: `:4541-4542`, which says a remote write runs on the main thread, and the guard doc `:4419-4423`); `test/hooks/personOnly.test.ts`; `test/hooks/personOnlyGuard.test.ts` |
| `interfaces` | No new rule id, export or flag. The guard copy picks up the change through `personOnlyVerdict.toString()` (`scripts.ts:4559`), so `RUNS` (`scripts.ts:4543`) and `ASK_RULES` (`personOnly.ts:1731-1733`) do not change. **`symbolicRefVerdict`:** before the early return at `:2168`, a name matching a remote's HEAD ref (`(refs/)?remotes/<one segment>/HEAD`, compared without case) records `push-default` for a write, whatever the target, and also for a delete. The act text names the remote's HEAD ref and `via`. Today that return lets a delete through, and `:2172` asks only when the target is a default branch. The `--stdin` symref commands already go through this function (`:3147-3150`), so they get the same decision. **`git update-ref`:** a new branch, read before the tag branch at `:3113`. Where an argument names a remote's HEAD ref, or `--stdin` is given and the line's own text names one (read in excess, as the tag test at `:3115` reads), it records `push-default`. A tag on the same line still gets its own act. **`git remote set-head`:** `remoteWriteVerdict` records `push-default` for the `set-head` action in every form, before the early return on `ctx.originRepo === undefined` at `:1897`. It still records `remote-write` where that rule reads. `push-default` is ask-class and outside `RUNS`, so the verdict (`:3172`, the first act that is not run unasked) asks rather than running unasked. **Decision and consequence:** on Claude Code's main thread and Copilot CLI's main agent the person is asked. A sub-agent's call, and any call on Cursor or Codex, is refused (`scripts.ts` `attendedAsk`, `GUARD_CANNOT_ASK`). While a run is unattended it is refused, as a push to the default branch is. **Unaffected:** the run verbs' own write (`src/cli/commands/run.ts:824-838`, `alignOriginHead`) goes through the CLI's git runner (`src/cli/engine/gitWrite.ts`), not through a shell line the agent types, so the guard never sees it. |
| `testCriteria` | **Fail on the parent** (verdict level, `test/hooks/personOnly.test.ts`; each title names the class of input, and the input sits in the test body as the file's other `symbolic-ref` and `update-ref` cases do): (1) a `symbolic-ref` write of a remote's HEAD ref to a branch that is neither default nor deploying gives an ask with rule `push-default`. The parent gives no act. (2) A `symbolic-ref` delete of that ref asks `push-default`. The parent gives none. (3) An `update-ref` write naming that ref, with and without `--no-deref`, and an `update-ref` delete of it, each ask `push-default`. The parent gives none. (4) `update-ref --stdin` whose line text holds a `symref-update`, `symref-create` or `symref-delete` of that ref, or a plain `update` or `delete` of it, asks `push-default`. The parent gives none. (5) `remote set-head` in each form (automatic, a named branch, delete) asks `push-default`, and its verdict is not one of the acts the setting runs. The parent gives `remote-write`, which the main thread runs unasked. (6) The same with `originRepo` undefined still asks. The parent gives none. **Rendered guard, fail on the parent** (`test/hooks/personOnlyGuard.test.ts`, the file's render-and-run harness): with case (1)'s line, a Claude Code main-thread payload gets the ask decision; a sub-agent payload and a Cursor payload get a refusal; with an in-progress `Mode: unattended` record, the call is refused. The parent allows all of them. **Pins** (pass on the parent): (7) a `symbolic-ref` read of a remote's HEAD ref (a name and no target) gives no act; a `symbolic-ref` write of `HEAD` itself keeps today's verdict. (8) The proof for `alignOriginHead`: `test/cli/commands/run.test.ts:900` and `:916` and `test/cli/commands/runCheckpoint.test.ts:3244` (the verb writes the ref and prints its line) stay green unchanged. A new verdict case, built from the run verbs' own line as `verbShape` admits it, gives no `push-default` act, so the verb's write is never read as an agent's act. |
| `edgeCases` | **Another remote's HEAD ref** asks too. The guard reads origin's only (`scripts.ts:5139`), so this reads more than it needs, in the safe direction. **Case:** a name differing only in case asks, as the tag reads do. **Same line:** a line with both a tag write and a HEAD-ref write gets both acts, and a refuse-class one still decides (`:3172`). **Moves that stay `remote-write`:** a `remote rename` or `remove` that moves or drops origin's HEAD ref stays `remote-write`. It runs on the main thread and is refused for a sub-agent. This is named in the narrower residual. **A config write** that sets a remote's follow-HEAD behaviour is a `remote.*` key, already `remote-write` (`personOnly.ts:1910-1918`). **Not read:** a direct file write into `.git/` (a redirect or the Write tool), the class `SECURITY.md:616-622` names. **Reftable repository:** the guard reads no loose ref there (`SECURITY.md:609-610`), so only `main` and `master` count, as today. **Friction:** a person's own automatic `set-head` now asks on the main thread; that is accepted. |
| `depends_on` | b17-test-infra-batch (`test/hooks/personOnlyGuard.test.ts`), b2-secret-shaped-fixtures (`test/hooks/personOnly.test.ts`, which `b2` edits at `:3838`) |
| `verify` | `npx vitest run test/hooks/personOnly.test.ts test/hooks/personOnlyGuard.test.ts test/hooks/personOnlyCopilotAsk.test.ts test/hooks/scriptBudget.test.ts test/cli/commands/run.test.ts test/cli/commands/runCheckpoint.test.ts test/cli/commands/runLand.test.ts test/emit/hooksInfra.test.ts test/merge/claudeHookCopies.test.ts test/cloud test/architecture test/ci/testInputsGuard.test.ts test/docsPages.test.ts`. The golden snapshots and this repository's guard copies are regenerated by the integration lane. |
| `threat` | **Trust boundary:** where the guard learns the default branch, a loose ref in the git directory (`scripts.ts:5139-5140`) that the agent's shell can rewrite. **Trusts:** that ref, once the push check reads it (`personOnly.ts:1714`). **Abuse:** in a repository whose default branch is named neither `main` nor `master`, the agent re-points or deletes origin's HEAD ref, and a later attended push to the real default branch is read as a push of another branch and runs unasked. **Stopped by:** each git route to that ref on the judged line (`symbolic-ref`, `update-ref` with its `--stdin` text, `remote set-head`) records `push-default`, so the person decides on the main thread, and it is refused elsewhere and unattended. **Residual:** a direct file write into `.git/`, and a `remote rename` or `remove`, named on `SECURITY.md`. The security lens reviews this unit, and its report and brief describe guard behaviour only by `path:line`, the decision and its consequence. |

**Added at session 2 intake (2026-10-25, against `864d0111`; option A of the intake's four).** Wave 3, after `b17`
(wave 2, `test/hooks/personOnlyGuard.test.ts`) and `b2` (wave 1). Its files do not overlap `b5`'s, `b10`'s or `b14`'s.
`depends_on` names `b2` beside the researcher's `b17`, for the shared test file. **`SECURITY.md` hand-off to `b1`**
(file 2's one writer). This unit edits neither `SECURITY.md` nor `docs/security-mapping.md`. Its report hands `b1`: at
`SECURITY.md:610-613`, replace the sentence that starts "Re-pointing that ref" with: "A `git symbolic-ref`, `git
update-ref` or `git remote set-head` write to a remote's HEAD ref, on the line the guard judges, is read as the push it
steers: it asks on Claude Code's main thread and Copilot CLI's main agent, and is refused for a sub-agent, on Cursor and
Codex, and while a run is unattended. A write that reaches the ref another way is not read: a file written into `.git/`
by a shell redirect or the Write tool, or a `git remote rename` or `remove` that moves or drops it. So in a repository
whose default branch is named neither `main` nor `master`, a later attended push to the real default branch can still
run without asking." The sentence at `docs/security-mapping.md:391-393` gets the same change. The pins move with them:
`test/docsPages.test.ts:5410-5411` and `:5497`, each re-pinned to the new text with `TEST CHANGE, justified:
REQ-FLOW-102 (b14b) — a remote's HEAD ref write is read as the push it steers`.

### b14c-land-batch — the land verb's three rows: one record-head reader, a deploying default branch, and a pinned approval

| Field | Content |
|---|---|
| `id` | b14c-land-batch |
| `requirements` | REQ-FLOW-132 (MODIFIED: review/177's land fix, and review/174's pin and residual); REQ-FLOW-120 (review/84: one reader of whether a run is unattended, the reading that requirement's unattended rules rest on; its spec text does not change) |
| `files` | `src/cli/commands/runLand.ts`, `src/runs/resumeCard.ts`, `src/cli/commands/run.ts` (the callers at `:852`, `:861`, `:946`; delete `:1673-1681`), `test/cli/commands/runLand.test.ts`, `test/runs/recordHead.test.ts` |
| `interfaces` | **review/84.** `readsUnattended` exists twice: `run.ts:1673-1681` and `runLand.ts:191-195`. Export it from `src/runs/resumeCard.ts`, next to `readRecordHead` (`:236`). It is then reached as `ctx.engine.runs.resumeCard.readsUnattended`; the namespace import is at `src/composition/root.ts:99`, `:512`, so `root.ts` is not edited. Delete both copies, and switch the callers `run.ts:852`, `:861`, `:946` and `runLand.ts:247`. **review/177.** When the default branch is also a deploying branch, the guard's first act is `push-deploying` (`src/hooks/personOnly.ts:2061-2064`, chosen at `:3172`), and `runLand.ts:603` accepts only `push-default`, after the evidence write at `:589-594`. Move the verdict (`:596-603`) above the evidence write (`:588`). Accept an ask whose rule is `push-default`, or `push-deploying` only when `approval !== null`, since `decideLand` already put the deploying reason in front of the person (`src/runs/landEvidence.ts:496`). **review/174 — closed as rejected, with a pin test and a `SECURITY.md` residual.** `decideLand` recomputes the asks set (`landEvidence.ts:486-502`), but an approval is checked against the head alone (`runLand.ts:371`, `:528`, `:546`, `:584-586`). Tying the approval to the asks set needs either a new flag shape, which changes the CLI contract and the flows that spell the approval line, or trust in the body's `merge waits on:` line (`runLand.ts:571`), which anyone who can write the pull request can edit. Neither is taken. This unit's report hands `b1` this sentence for `SECURITY.md`'s residual list, beside the other `run land` residuals: "An approval given to `stamity run land` names the head commit, not the reasons the land asked about: if the setting on the default branch adds a reason after the person approved, such as naming the default branch a deploying branch, the land goes ahead on the earlier approval. The evidence line the land writes names every reason, so the record shows what the approval covered. Code: `src/runs/landEvidence.ts::decideLand`, `src/cli/commands/runLand.ts`." |
| `testCriteria` | **review/84** (`test/runs/recordHead.test.ts`): the variable spellings `""`, `false`, `0` and `FALSE ` read attended, `Mode: attended` wins over the variable, and a source pin finds no local `function readsUnattended` in `src/cli/commands/`. The pin fails on the parent. **review/177** (`test/cli/commands/runLand.test.ts`): `deployingBranches` names the default branch, with `--fast-forward --approved <sha>`. Fixed: it lands. Parent: refused after the body write. A second case: a refused verdict sends no body write. **review/174** (`runLand.test.ts`, the pin): an asks outcome over one reason, then the default branch's setting gains `deployingBranches` naming the default branch, then `--approved <sha>` lands. The evidence line (`landEvidence.ts:515-519`, written at `runLand.ts:589`) names both reasons. It passes on the parent. |
| `edgeCases` | An approved fast-forward onto a default branch that is not deploying keeps `push-default`. An unapproved `push-deploying` verdict refuses before any body write. The mode spellings: `" 0 "` reads attended, `"yes"` reads unattended. |
| `depends_on` | b14-run-verbs-batch (`src/cli/commands/run.ts`) |
| `verify` | `npx vitest run test/cli/commands/runLand.test.ts test/runs/landEvidence.test.ts test/runs/recordHead.test.ts test/runs/resumeCardParity.test.ts test/cli/commands/runCheckpoint.test.ts test/cli/commands/runEnd.test.ts test/architecture test/ci/testInputsGuard.test.ts` |
| `threat` | **Trust boundary:** the land verb's last self-check before the default-branch push. **Abuse:** a body written for an act the verb then refuses. **Stopped by:** the verdict runs first, and a deploying ask passes only with the person's approval. **Residual:** the approval names the head, not the reasons (review/174), named on `SECURITY.md` through `b1`. |

**Added at session 2 intake (2026-10-25, against `864d0111`).** Split from `b14-run-verbs-batch` along the
`runLand.ts` file line: with all seven folds, `b14` came to an estimated 420 changed lines over six source files. Wave
4, after `b14` (`run.ts`). Wave 4's `b3`, `b7` and `b11` touch none of its files. It folds ledger rows
`2026-10-23_autonomy-distribution-01/review/84`, `/review/174` and `/review/177` (Minors). `b14b`'s `push-default`
change in wave 3 does not touch `runLand.ts`; this unit's `runLand.test.ts` run sees it.

**Amended at build (2026-10-25, ledger row `2026-10-25_autonomy-distribution-02/review/38`):** binds over the
`edgeCases` line "An unapproved `push-deploying` verdict refuses before any body write". Without the person's approval
the land asks, before any write (`src/cli/commands/runLand.ts:561-566`, `src/runs/landEvidence.ts:496`). A refused
verdict writes no evidence line, only its `merge waits on:` line. The land residual sentence `b1` writes is the one
under "For b1" in `b14c-fixer-r1.md`.

### b15-qa-ci-tooling-batch — five contributor-tool rows

| Field | Content |
|---|---|
| `id` | b15-qa-ci-tooling-batch |
| `requirements` | spec carries no ids (contributor tooling under `scripts/qa/`) |
| `files` | `scripts/qa/cloud-check.mjs`; `scripts/qa/hook-runs.mjs`; `test/qa/cloudCheck.test.ts`; `test/qa/hookRuns.test.ts` |
| `interfaces` | **build/21:** no workflow change. A pin test reads `nightly.yml`'s release-prep prompt (`:509`) against `PLAN_PATH`/`CONTRACT_PATH` (`cloud-check.mjs:68-69`). **review/31:** `export function candidateHead(repoRoot, git)` returns `rev-parse --short HEAD`, or throws "the checkout has uncommitted edits; commit or stash them so the evidence names the code the run ran" when `git status --porcelain --untracked-files=no` is non-empty. It replaces the inline call at `:535`. **review/168:** `verdictForAsk` (`:702`) counts an ask only on a marked shell row whose `keys` hold no `ASK_HELPER_FIELDS` member. A helper-only ask reads `not-run`, "only a helper's call was asked". **review/169:** `ASK_SESSION_ID_PATTERN`, restated from `COPILOT_SESSION_ID_PATTERN` (`src/hooks/scripts.ts:1259`). `idOf` (`:742`) answers `null` for an id that fails it, and fact 1 reads `changed`, "the session id no longer has the shape the guard accepts". **review/43** (reworded to the half left): no code change. A parity test for the list at `:533`. |
| `testCriteria` | build/21: the release-prep `run` contains `PLAN_PATH` and `(run contract: ${CONTRACT_PATH})`. review/31 (fails on parent): a temp repo with a modified tracked file → `candidateHead` throws, and a clean one returns 7+ hex characters. review/168 (fails on parent): observations with one marked shell ask carrying `agentId` and a marker → `not-run`, not `held`. review/169 (fails on parent): a main-session id `"bad id!"` → fact 1 is `changed`. A parity case reads `COPILOT_SESSION_ID_PATTERN`'s source, as `hookRuns.test.ts:645-652` does. review/43: for each tool, render `planCoreHookScripts(POLICY, tool, { …, personOnlyGuard: true })`'s guard (`test/hooks/personOnlyGuard.test.ts:42`). The tools whose guard writes a `permissionDecision` of `"ask"` equal `ASK_CLASS_CLIENTS`. |
| `edgeCases` | An untracked-only tree → not dirty (the candidate is packed from tracked files). A row with no `keys` (Claude) → no helper filter, as today. |
| `depends_on` | none |
| `verify` | `npx vitest run test/qa/cloudCheck.test.ts test/qa/hookRuns.test.ts test/qa/hookRunsCli.test.ts test/qa/form.test.ts test/qa/run.test.ts test/docsPages.test.ts test/ci/workflow.test.ts` |

**Amended at session 2 intake (2026-10-25, against `864d0111`):** `COPILOT_SESSION_ID_PATTERN` is at
`src/hooks/scripts.ts:1302`; `GUARD_HELPER_FIELDS` (`:4236`) is still a string-array literal, so the regex at
`test/qa/hookRuns.test.ts:648` still matches. The review/43 parity test builds each guard the way `placeGuard` does
(`test/hooks/personOnlyGuard.test.ts:46-57`), with the default setting. It asks about the raw merge, which asks in every
mode (`:400-407`). For Copilot it seeds the main-session record under the git common directory with the payload's
session id, as `test/hooks/personOnlyCopilotAsk.test.ts:46` does. Without that record Copilot's guard refuses
(`personOnlyGuard.test.ts:424-431`). The clients whose output carries `permissionDecision: "ask"` then equal
`ASK_CLASS_CLIENTS` (`scripts/qa/hook-runs.mjs:533`). Add `test/hooks/personOnlyGuard.test.ts` and
`test/hooks/personOnlyCopilotAsk.test.ts` to `verify` as read-only witnesses.

### b16-docs-pointers-batch — eight stale pointers, dates and counts

| Field | Content |
|---|---|
| `id` | b16-docs-pointers-batch |
| `requirements` | spec carries no ids (text accuracy); close/1 corrects the map bullet under REQ-LADDER-007 |
| `files` | `src/hooks/model.ts:484`; `docs/specs/model-ladder.md:516`; `test/cli/commands/check.test.ts:1235`; `test/cli/commands/init.test.ts:1297`; `docs/specs/everyday-flows.md` (`:2024-2036`, `:3532`); `docs/troubleshooting.md` (`:112`, `:423`); `src/adapters/copilot.ts:1671`; `src/cli/docs/cliReference.ts:232-243`; `docs/cli-reference.md` (regenerated); `test/cli/docs/cliReference.test.ts`; `src/adapters/cursor.ts:336-340` |
| `interfaces` | **prove/7:** re-read learn.chatgpt.com/docs/hooks. Name the section that holds the sentence today, or drop "(its Work Cloud section)", and re-date `accessDate`. **close/1:** the map shape reads `{ "model"?, "fallbacks", "pinReplaced"? }`, naming REQ-LADDER-009. **close/5:** the titles become "names the four verbs that need git …" (check.test.ts) and the same in init.test.ts if its row names four; the spec's proof lines quote the new titles. **close/8:** "Two entries" → "Three entries", naming the pre-tool-use guard, the person-only guard on `Bash\|PowerShell`, and the one on the MCP write tools (`.claude/settings.json:38,47,65`). **close/10:** `everyday-flows.md:3532` "(`build/45`, open)" → "(`build/45`, decided in plan 021: kept pinned)", and `copilot.ts:1671` "inbox row 257" → "ledger row `build/45` of run `2026-10-14_cli-native`". **build/82:** `ArgFacts` gains `variadic: boolean` from commander's `arg.variadic`, rendered `<name...>`. **build/32:** add "(read <date>)" to the Cursor environment-file fact. **review/71:** add an access date to the `loop_limit` citation. |
| `testCriteria` | build/82 (fails on parent): `renderCliReference()` shows `plan`'s positional as `<plan...>`. `docs/cli-reference.md` byte-compares after `node scripts/generate-docs.mjs --page cli`. close/5: the spec's cited titles exist in the test files (grep in `test/docsPages.test.ts`'s proof-citation check, if one reads them; otherwise a manual grep in the run record). The text rows are checked by reading the edited lines against their sources. |
| `edgeCases` | If the vendor page no longer has the sentence (prove/7), the fact's `status` goes to `not documented`, and the matrix regeneration is the integration lane's. |
| `depends_on` | b9-upgrade-verb (`docs/cli-reference.md`), b13-copilot-touchpoints-skills (`src/adapters/copilot.ts`, `model-ladder.md`), b12-repo-file-waste (the `check` row hand-off, session 2 intake), b7-manifest-stable (`src/cli/commands/sync/report.ts`, added at build) |
| `verify` | `npx vitest run test/cli/docs/cliReference.test.ts test/cli/docs/llmsIndex.test.ts test/cli/commands/check.test.ts test/cli/commands/init.test.ts test/adapters/copilot.test.ts test/adapters/cursor.test.ts test/docsPages.test.ts test/emit/capabilityMatrix.test.ts -u` (the `-u` only after the matrix is regenerated at integration; otherwise leave it off) |
| `threat` | `src/hooks/model.ts` is classified security-sensitive (`src/hooks/**`). The edit is one citation string in a fact table that renders into the capability matrix. It trusts the vendor page as read. Abuse case: a wrong "documented" status reads as a guarantee. The check: the status stays `documented` only if the page holds the sentence on the read date. |

**Amended at session 2 intake (2026-10-25, against `864d0111`):** File 1 moved some of this unit's lines.
- **prove/7** is the Codex "Cloud orchestration" row at `src/hooks/model.ts:482-490`: the section phrase is at `:487`
  and the `accessDate` at `:489`.
- **close/5** is the titles at `test/cli/commands/check.test.ts:1245` and `test/cli/commands/init.test.ts:1297`. Both
  bodies already assert "Four verbs need git" (`check.test.ts:1269`, `init.test.ts:1323`), so both titles change, and
  so do the spec's quotes at `docs/specs/everyday-flows.md:2024` and `:2036`. File 1's `run land` is a subcommand of
  `run`, so the count stays four.
- **close/8** is `docs/troubleshooting.md:560-561`. The text already names the MCP write tools inside its second entry,
  so the edit makes it three entries, each named, matching `.claude/settings.json:38,48,67`.
- **build/32** is the `cloud-install` row's environment-file sentence at `docs/troubleshooting.md:115`.
- **build/82** is in `src/cli/docs/cliReference.ts`: `ArgFacts` at `:193`, the two argument maps at `:237-248`,
  `argSlot` at `:289`. The regenerated page also carries file 1's `run land` and `--drop-held <path...>`, whose options
  already render as variadic. Only positionals change.
- **The `check` row hand-off (declared default).** When `b12-repo-file-waste`'s report says `check` does not name a kept
  retired prompt file, this unit adds the row: a `check` row in the `moved-skills` pattern
  (`src/cli/commands/check.ts:1297`, registered `:2456`) that names each kept retired engine path with a one-line remedy
  (the owner deletes it), its `docs/troubleshooting.md` row beside the `moved-skills` row, and a case in
  `test/cli/commands/check.test.ts` that fails on the parent. `files`: add `src/cli/commands/check.ts`
  (`docs/troubleshooting.md` and `check.test.ts` are already this unit's). When `check` already names the path, nothing
  here changes. Wave 7 is unchanged. `depends_on`: add `b12-repo-file-waste` (the hand-off).
- **Whole-tree.** The unit touches `src/hooks/` and `src/adapters/`, so `verify` also runs `test/cloud` and
  `test/architecture`.

**Amended at build (2026-10-25, the prompt-file half):** Binds over the intake block's conditional `check` hand-off.
The row is now always added. A `check` row in the `moved-skills` pattern (`src/cli/commands/check.ts:1297`, registered
`:2456`) lists each kept legacy `.github/prompts/st-*.prompt.md` that `b13` keeps, with the one-line remedy (the owner
deletes it). Its `docs/troubleshooting.md` row sits beside the `moved-skills` row. A case in
`test/cli/commands/check.test.ts` fails on the parent. `files`: add `src/cli/commands/check.ts`;
`test/cli/commands/check.test.ts` and `docs/troubleshooting.md` are already this unit's. `depends_on` already names
`b13-copilot-touchpoints-skills`. Wave 7 is unchanged.

**Amended at build (2026-10-25, ledger row `2026-10-25_autonomy-distribution-02/review/6`, declared default):** The
`check` row lists every kept legacy engine file a sync left named, each with the one-line remedy (the owner deletes it).
That is each `.github/prompts/st-*.prompt.md`, and, on a setup without Codex, each
`.agents/skills/st-*/agents/openai.yaml` companion, for a touchpoint or a pack command. It reads the leftovers that no
ledger row holds at the closed `RETIRED_ENGINE_PATHS` paths, plus the legacy prompt paths. `testCriteria` gains a case
in `test/cli/commands/check.test.ts`: on a setup without Codex, an edited companion that `sync` kept is listed by the
row with its remedy (red on the parent).

**Amended at build (2026-10-25, hand-off from `b9`'s review/14):** the CLI-reference row for `AUTONOMY_LOOSENED`
(`src/cli/docs/cliReference.ts:169`) and `docs/troubleshooting.md:421` name `upgrade` among the commands that raise it.
`docs/cli-reference.md` is regenerated, never merged by hand.

**Amended at build (2026-10-25, ledger row `2026-10-25_autonomy-distribution-02/build/12`, a hand-off from `b4`,
declared default):** the sync provenance rollup (`src/cli/commands/sync/report.ts:76-84`) counts the `.gitignore` row
as one of each client's files, so a setup whose other rows share one stamp shows no "(stamped vX)". The rollup leaves
the `.gitignore` row out. `files`: add `src/cli/commands/sync/report.ts`. That file is `b7`'s in wave 4, so this unit
edits it after `b7`. The case at `test/cli/commands/check.test.ts:484`, already this unit's file, moves with a `TEST
CHANGE, justified: build/12` line.

**Amended at build (2026-10-25, ledger row `2026-10-25_autonomy-distribution-02/build/19`, a hand-off from `b10`'s
M-2):** `files`: add `docs/enterprise-forks.md`, for one sentence: a registry that does not honour a published
shrinkwrap (GitHub Packages, not measured) resolves a fork's install tree fresh, as today. The exact sentence is in
`b10-implementer-r1.md`. No other unit edits this file; `b1`'s probe test reads its `regenerate` list
(`docs/enterprise-forks.md:293-299`), which this sentence does not touch.

### b17-test-infra-batch — the worker cap, one dist build per run, three load cases, one skip note

| Field | Content |
|---|---|
| `id` | b17-test-infra-batch |
| `requirements` | spec carries no ids (test infrastructure; plan 016's S28) |
| `files` | `vitest.config.ts` (the parallel project `:140-147`); `test/ci/testScheduling.test.ts`; `test/support/distBuild.ts`; `test/hooks/personOnlyGuard.test.ts:276`; `test/merge/reclaimMcpPreserve.test.ts:336`; `test/merge/writeEscape.test.ts:1306`; `test/cli/commands/runCheckpoint.test.ts:2938` |
| `interfaces` | **S28:** `export function workerCap(env): number` is `STAMITY_TEST_MAX_WORKERS` when it is a positive integer, else 4. The parallel project sets `maxWorkers: workerCap(process.env)`; `windows-fixtures` keeps 1. **review/59:** `ensureDistBuilt` takes a cross-process lock with `proper-lockfile` (already a dependency) on `dist/`'s parent, re-checks `dist/cli.js` once it holds the lock, and builds only if it is still absent. The comment says nine suites call it. **build/84 / prove/6:** a per-case `{ timeout: 60_000 }` on the guard matrix case and on the three MCP reclaim cases. Assertions are unchanged. **prove/5:** the race fixture retries its window up to 5 times until `swaps > 0`, and fails naming the attempts. **prove/11:** the skip note names the full ledger ref (`2026-10-15_cloud-runs/prove/10`) and an owner, the Windows CI leg. |
| `testCriteria` | **Fails on parent:** `workerCap({})` is 4, `{ STAMITY_TEST_MAX_WORKERS: "2" }` gives 2, `"0"` and `"x"` give 4, and the config's parallel project has `maxWorkers` 4 under an empty env (`testScheduling.test.ts`). distBuild: two concurrent `ensureDistBuilt()` calls in two child processes with `dist/` removed start one tsdown run (counted through a stub build command set by env, with the reason inline). |
| `edgeCases` | CI's 3 workers are under the cap, so nothing changes there. A local machine with fewer cores than 4 → vitest's own lower default wins. A stale lock after a killed run → `proper-lockfile`'s stale timeout frees it. |
| `depends_on` | b2-secret-shaped-fixtures |
| `verify` | `npx vitest run test/ci/testScheduling.test.ts test/ci/testRun.test.ts test/ci/workflow.test.ts test/hooks/personOnlyGuard.test.ts test/merge/reclaimMcpPreserve.test.ts test/merge/writeEscape.test.ts test/cli/commands/runCheckpoint.test.ts test/cli/dogfoodDist.e2e.test.ts test/qa/cloudCheck.test.ts` |

**Amended at the plan gate (round 1):** `files`: `vitest.config.ts` (the root `test` block in `defineConfig`, `:169-172`, not the win32 `parallel` project `:140-147`). Also `test/ci/testScheduling.test.ts` (`:99-108`), `test/support/distBuild.ts`, and the four test lines as in the cell. Add to `interfaces` (binds over S28 and review/59). **S28 (W-13):** `export function workerCap(env, cores = availableParallelism()): number` is `min(requested, max(1, cores - 1))`. `requested` is `STAMITY_TEST_MAX_WORKERS` when it is a positive integer, else 4. The root `test` block sets `maxWorkers: workerCap(process.env)`. Every platform runs that block, and the win32 projects inherit it through `extends: true` (`:140`). `windows-fixtures` keeps `maxWorkers: 1` (`:154`). **review/59 (M-9):** `ensureDistBuilt({ root = REPO_ROOT } = {})` locks with `proper-lockfile`, `realpath: false`, at `lockfilePath: <root>/node_modules/.cache/stamity/dist-build.lock`. That is inside the checkout and already ignored, never `<repo>.lock`. It re-checks `<root>/dist/cli.js` once it holds the lock. `testCriteria` (whole value): **Fails on parent:** `workerCap({}, 16)` is 4, `workerCap({}, 3)` is 2, `({ STAMITY_TEST_MAX_WORKERS: "2" }, 16)` is 2, and `"0"` and `"x"` give 4 at 16 cores. The resolved POSIX config's `maxWorkers` and `fixtureScheduling("win32")`'s `parallel` project both equal `workerCap(process.env)`, and `windows-fixtures` stays 1. This re-pins `testScheduling.test.ts:99-108` with `TEST CHANGE, justified: the worker cap is declared on the root config`. distBuild: two concurrent `ensureDistBuilt({ root: <temp copy> })` calls in two child processes, over a temp root with no `dist/`, start one build (counted through a stub build command set by env). The shared checkout's `dist/` is never removed. `edgeCases`: replace the second sentence with "A machine with fewer than five cores gets `cores - 1`, vitest's own default." `depends_on`: b2-secret-shaped-fixtures (`test/merge/writeEscape.test.ts`; W-8).

**Amended at session 2 intake (2026-10-25, against `864d0111`):** The guard-matrix case is `it.each(TOOLS)` "denies
each person-only act and allows its neighbour" at `test/hooks/personOnlyGuard.test.ts:314`, not `:276`, which is now a
`MATRIX` row. The prove/11 skip note is the comment at `test/cli/commands/runCheckpoint.test.ts:3206` on the case at
`:3211`. Its full ref is `2026-10-15_cloud-runs/prove/10`. The comment in `test/support/distBuild.ts` says nine
callers: eight suites and `test/support/cliHarness.ts`. `b14b-default-branch-read` (wave 3) and `b14` (wave 3) edit
`personOnlyGuard.test.ts` and `runCheckpoint.test.ts` after this unit.

### b18-vendor-claims — the client fact tables say what the vendors' pages say on 2026-10-23

| Field | Content |
|---|---|
| `id` | b18-vendor-claims |
| `requirements` | spec carries no ids for the client fact tables (they render `docs/capability-matrix.md`; the dated-source rule of REQ-PROVE-045 is the nearest) |
| `files` | `src/hooks/model.ts` (the fact rows at `:133`, `:331-336`, `:460-467`), `src/emit/capabilityMatrix.ts` (`:302-308`), `src/adapters/copilot.ts` (`:178` `ACCESS_DATE`, `:219`, `:236`, `:253-256`, `:302`, `:459`, `:1435-1436`), `src/adapters/cursor.ts` (`:427-431`), `src/adapters/codex.ts` (`:5`, `:194`, `:362-364`, `:412`, `:1284`), `src/adapters/claude.ts` (`:470`, `:499`), `test/emit/capabilityMatrix.test.ts`, `test/adapters/copilot.test.ts`, `test/adapters/cursor.test.ts`, `test/adapters/codex.test.ts`, `test/adapters/claude.test.ts` |
| `interfaces` | Facts only: each row keeps its shape (`{ claim, status, url, accessDate }` or the adapter's citation object) and changes its text, status or date. **Copilot** (sources read 2026-10-23: docs.github.com/en/copilot/reference/hooks-reference; code.visualstudio.com/docs/agent-customization/hooks, page dated 2026-10-21; github.com/github/copilot-cli/releases): `ask` is read as deny in the CLI's autopilot too since 1.0.97, not only in the cloud agent (`model.ts:331-336`); VS Code reads `.github/hooks/*.json` (Preview) and also `.claude/settings.json` hooks (`capabilityMatrix.ts:302-308`, `copilot.ts:302`, `:1435-1436`); the hooks citation re-dated, with `permissionRequest` exit 2 = deny (`model.ts:133`, `copilot.ts:459`); the live-check version names the installed CLI (1.0.100) and path instructions apply from 1.0.100 (`copilot.ts:219`, `:236`, `:253-256`); `ACCESS_DATE` 2026-10-23; `.claude/rules` is merged by the Copilot CLI too (`claude.ts:499`). **Cursor** (cursor.com/docs/agent/security/run-modes): cloud agents never ask for approval (`model.ts:460-467`, from "not documented" to documented); the access dates at `cursor.ts:427-431`. **Codex** (learn.chatgpt.com/docs/hooks, /config-file/config-reference): the hooks page date agrees in `codex.ts:5` and `:412`, the subagents date in `:1284` and `:407`; the skills cap note says 8,000 characters is the default and `skills.max_context_tokens` raises it (`:194`); headless hooks re-dated with the installed version (`:362-364`). **Claude Code** (code.claude.com/docs/en/hooks, /permission-modes): the agent-key row names `permissionMode`, `disallowedTools`, `autoCompactWindow` (2.1.296); the source dates at `claude.ts:470`. A claim this unit cannot re-read keeps its old date and gains nothing. |
| `testCriteria` | `test/emit/capabilityMatrix.test.ts`: the regenerated matrix holds no access date older than 2026-10-14 for the rows named above (fails on the parent: 2026-09-10, 2026-09-17, 2026-09-30); the Copilot hooks row names VS Code; the Cursor questions row reads documented. The adapter tests that pin a date or a claim text move with `TEST CHANGE, justified: re-read 2026-10-23`. `node scripts/generate-capability-matrix.mjs` then `git diff --exit-code docs/capability-matrix.md` after the integration lane commits it. |
| `edgeCases` | A vendor page that no longer holds a claim → its row's status goes to `not documented` with the new date, never deleted. A claim that file 1 already changed (`a7`, `a10`, `a4`) is left as file 1 wrote it. |
| `depends_on` | b12-repo-file-waste, b13-copilot-touchpoints-skills, b16-docs-pointers-batch (same files) |
| `verify` | `npx vitest run test/emit/capabilityMatrix.test.ts test/adapters/copilot.test.ts test/adapters/cursor.test.ts test/adapters/codex.test.ts test/adapters/claude.test.ts test/hooks/model.test.ts test/docsPages.test.ts test/ci/testInputsGuard.test.ts` |
| `threat` | `src/hooks/model.ts` is security-sensitive by path. Trust boundary: a fact row read as a guarantee about a client's enforcement. Abuse: a row marked documented that the page no longer supports makes users trust a guard that does not run. Check: a row is `documented` only with the page's sentence on the read date, else `not documented`. |

**Amended at session 2 intake (2026-10-25, against `864d0111`):** File 1 moved some of this unit's lines. In
`src/hooks/model.ts` the rows are Copilot's hook-guarantee notes at `:136`, Copilot's "Ask decisions" at `:333-340` and
Cursor's "Questions" at `:462-471`. In `src/adapters/codex.ts` the subagents citation is `:413`, the hooks citation
`:418`, and the agent file's "Key set" comment `:1292`. File 1's `a10` rewrote the comment above the subagents citation
(`codex.ts:407-412`) and the `per-agent tool allowlist` cap (`:366-373`). This unit leaves both as `a10` wrote them,
adds only the review/12 sentences below, and keeps `accessDate: "2026-10-14"` at `:413` unless it re-reads every claim
that citation covers. Moving the `:1292` date changes every emitted Codex agent file, so `test/adapters/codex.test.ts:623`
moves with a `TEST CHANGE, justified` line. File 1's Claude hook-guarantee row (`model.ts:114-123`) stays as `a7` wrote
it. Copilot's "Ask decisions" text agrees with `SECURITY.md:518-521` (Copilot CLI 1.0.98, measured 2026-10-19), which
this unit does not edit. The VS Code hooks claims (`capabilityMatrix.ts:302-308`, `copilot.ts:1435-1436`) agree with
`src/adapters/claude.ts:1164` (Copilot CLI 1.0.100 imports `.claude/settings.json` hooks). The `copilot.ts:219` item is
dropped: `b13` replaces that cap first.

**Folds ledger row `2026-10-23_autonomy-distribution-01/review/12`** (Minor), as reading (B) of the intake's two: the
cap and the agent-file header, as the ledger row's evidence names them.
- **The cap.** In `src/adapters/codex.ts:372`, the cap's last sentence is preceded by: "It also got the parent's tools
  that act on the host: in that measurement a desktop-control attempt was refused only by that tool's own policy." This
  matches `SECURITY.md:404-406`.
- **The agent-file header.** The comment block at `codex.ts:1294-1296` gains the same fact as one sentence, wrapped as
  its lines are: "It also got the parent's tools that act on the host." Every emitted Codex agent file changes.
- **Tests.** In `test/adapters/codex.test.ts`, the exact-file case (`toBe` at `:618-654`, header lines `:629-631`) is
  re-pinned with `TEST CHANGE, justified: review/12 — the header names the host-tool reach the measurement found`. The
  case at `:661-676` also expects both the reviewer's file and the `per-agent tool allowlist` cap to contain "tools that
  act on the host" (red on the parent). The golden snapshots and the regenerated `docs/capability-matrix.md` row change
  at integration.
- **Whole-tree.** The unit touches `src/hooks/` and `src/adapters/`, so `verify` also runs `test/cloud` and
  `test/architecture`.

**Amended at build (2026-10-25):** `test/adapters/cursor.test.ts:943-953` (the two companion paths in Cursor's case)
moved to `b12-repo-file-waste`; this unit no longer edits those lines.

## Execution order

| Wave | Units | Why this wave |
|---|---|---|
| 1 | `b2-secret-shaped-fixtures`, `b9-upgrade-verb`, `b12-repo-file-waste`, `b15-qa-ci-tooling-batch` | disjoint files; `b9` needs file 1's loosen gate, already on the branch |
| 2 | `b4-gitignore-lines`, `b17-test-infra-batch`, `b9b-readd-synced-pack` | `b4` after `b2` (`test/mcp/env.test.ts`) and `b12` (`ownedPaths.ts`, `emissionWrite.ts`); `b17` after `b2` (`test/merge/writeEscape.test.ts`); `b9b` after `b9` (`src/pack/install.ts`, `add.test.ts`) |
| 3 | `b5-import-config-round-trip`, `b10-shrinkwrap-st`, `b14-run-verbs-batch`, `b14b-default-branch-read` | `b5` after `b4` (`clean.ts`, `manifest.ts`, `init/apply.ts`, `roundTrip.test.ts`); `b10` after `b9`, `b4` (`docs/getting-started.md`); `b14` after `b2`, `b17` (`runCheckpoint.test.ts`, the pre-flight tests); `b14b` after `b17` (`test/hooks/personOnlyGuard.test.ts`) and `b2` (`test/hooks/personOnly.test.ts`) |
| 4 | `b3-clean-keeps-state`, `b7-manifest-stable`, `b11-publish-integrity`, `b14c-land-batch` | `b3` after `b5`, `b4` (`clean.ts`, `reclaim.ts`, `init/apply.ts`, the machine-local lines); `b7` after `b4`, `b5`, `b12` (`manifest.ts`, the sync engine, `emissionWrite.ts`); `b11` after `b10` (both release workflows); `b14c` after `b14` (`run.ts`) |
| 5 | `b6-init-force-charter`, `b8-copilot-setup-switch` | `b6` after `b3` (`init/apply.ts`, `initApply.test.ts`); `b8` after `b3`, `b4`, `b5`, `b7` (`clean.ts`, `manifest.ts`, `types/manifest.ts`, the sync engine, `clean.test.ts`, `syncEngine.test.ts`) |
| 6 | `b13-copilot-touchpoints-skills` | after `b8` (`copilot.ts`), `b12` (`skillsProjection.ts`, the retired-path proof), `b10` (`docs/getting-started.md`) |
| 7 | `b16-docs-pointers-batch` | after `b9` (`docs/cli-reference.md`), `b13` (`copilot.ts`), `b12` (`cursor.ts`), and it adds the `check` row for kept legacy prompt files (`src/cli/commands/check.ts`); `b2` and `b6` (`check.test.ts`, `init.test.ts`) are earlier |
| 8 | `b18-vendor-claims` | after `b16`, `b13`, `b12` (`model.ts`, the adapters); the wave before `b1` |
| 9 | `b1-fork-ci-job` | alone and last: its step 0, nested suite, build, knip and tarball smoke run under `lockf -k /tmp/stamity-machine.lock` with no other lane or suite running; its probe proves the final tree, `b18`'s included, and a step-0 fix in any test file meets no other lane; it writes file 2's `SECURITY.md` changes, the sentences `b12`, `b14b` and `b14c` handed it included, after all of them |

Nine waves, run on the branch file 1 left. At session 2 intake, `b14` split into `b14` (wave 3) and `b14c-land-batch`
(wave 4), and `b14b-default-branch-read` joined wave 3; no other unit moved. A wave's units run side by side in their own lanes, and no two units in one wave edit the same file. A dependency edge or a shared file is the only reason for a later wave. `b16`'s three text corrections in `docs/specs/` (`model-ladder.md:516`, `everyday-flows.md:2024-2036`, `:3532`) are the one exception to decision E8. They land in the unit, before Prove, at lines no entry of this delta touches. Before wave 9, the integration lane merges wave 8 and regenerates every derived file, so `b1`'s probe sees the final tree. After wave 9, the integration lane does four things. It runs the dogfood sync (`npm run build && node dist/cli.js sync`). It then runs `node dist/cli.js sync` a second time and checks that `git status --porcelain` is unchanged and `.stamity/manifest.json` is byte-identical (REQ-FLOW-032's check, moved out of `b7`). It regenerates every derived file. Last, it runs the full suite alone under the machine lock, then the pull request's CI. This file's pull request changes CI workflows (`b1`, `b10`, `b11`), so its merge asks under the walk's evidence rule.

## Shared contracts touched

| Contract | Producer | Consumers | Row |
|---|---|---|---|
| `CoOwnership.lines` on the `.gitignore` row, `OWNED_PATHS.version` 3 → 4 (`src/manifest/ownedPaths.ts:85`) | `b4` | `check --json`, the ledger census, `clean` (`b3`, `b5`) | reconciled(3); no other unit bumps `version` |
| `clean`'s options and JSON (`--purge`, `kept`, `packsKept`, `restored`, `restoreSkipped`) | `b4` → `b5` → `b3`, serial | `docs/cli-reference.md` (regenerated), the CLI reference test | reconciled at integration |
| `writeManifest`'s return (`{ written, updatedAt }`) | `b7` | its six other callers, which ignore the result: `src/cli/commands/init/apply.ts:562`, `src/cli/commands/add.ts:1288`, `src/cli/commands/clean.ts:855`, `src/cli/commands/workspace.ts:1075`, `src/cli/commands/config/mcp.ts:96`, `scripts/pack-signing-rehearsal.mjs:134` | clean |
| `applySync`'s options (`guardGate`, `src/cli/commands/sync/engine.ts:1105`) and its report (`SyncApplyReport`, which gains `manifestWritten`) | file 1 (`guardGate`), `b7` (`manifestWritten`) | `b9`'s `src/cli/commands/upgrade.ts` (wave 1), `src/cli/commands/sync.ts:256-265`, `src/cli/commands/workspace.ts:1094-1108` | reconciled(1): `b7` only adds to the report and runs `test/cli/commands/upgrade.test.ts` |
| `readPreviousManifest` (`src/cli/commands/init/apply.ts:699`), exported | `b6` | `apply.ts:297` today; `init.ts`'s decision step (new) | add; clean |
| `ImportDecision.backup` | `b5` | the manifest validator, `init/apply.ts` | reconciled(2) |
| The `upgrade` verb's surface (help, registered and advertised counts) | `b9` | the literal surface pins `b9`'s session 2 block lists (`src/cli.ts:33`, `:48-50`; `test/cli/surface.e2e.test.ts`; `test/docsPages.test.ts`, the README arrays and the getting-started `verbs` array `:4425-4438`; `README.md:83-84`; `docs/getting-started.md:169`, `:171-172`, `:420`; `src/cli/docs/llmsIndex.ts:115`), beside the `sync` help text's three pinned branches (`test/cli/commands/sync.test.ts:707-745`) | reconciled(13), counted by file and line group; each pin is literal and drifts silently green |
| `package.json` `bin` and `files` | `b10` | `test/cli/binMap.test.ts`, `test/smoke.test.ts`, `test/ci/tarballStaging.test.ts` | reconciled(3) |
| The release workflows' pack and publish steps | `b10`, `b11` | the workflow tests; file 1's fork rehearsal step (`.github/workflows/fork-release.yml:349-383`), which reads `steps.pack.outputs.tarball` | serial (`b10` → `b11`), after file 1's `a11` |
| `projectTouchpointSkills(…, { policy })` (`src/emit/skillsProjection.ts:585`) | `b12` | Cursor, Codex, then Copilot (`b13`) | reconciled(3) |
| Copilot's emitted rows (the nine skills, no prompt files) | `b13` | the goldens, `src/manifest/ownedPaths.ts:117`, `src/change/personOnlyPaths.ts:98` (kept for reclaim and the guard) | reconciled at integration |
| `toolOptions.copilot.setupSteps` | `b8` | the config registry, the manifest validator, `sync`, `clean` | reconciled(4) |
| `RETIRED_ENGINE_PATHS` (`src/manifest/ownedPaths.ts`): the nine touchpoint companions `.agents/skills/st-<id>/agents/openai.yaml`, each with the frozen 1.16.0 digest (no prompt-file entry, since the build-time default) | `b12` | `engineRenderingsFor`, a full `clean` | clean |
| The kept legacy Copilot prompt files (`.github/prompts/st-*.prompt.md`), named by `sync` and listed by `check` | `b13` (kept and named), `b16` (the `check` row) | the sync report, `check --json`, `docs/troubleshooting.md` | reconciled at integration |
| The Codex `per-agent tool allowlist` cap (`src/adapters/codex.ts:366-373`) and the agent-file header (`:1294-1296`) | `b18` (review/12) | `test/adapters/codex.test.ts:618-676`, every emitted Codex agent file, the goldens, `docs/capability-matrix.md` (regenerated) | reconciled at integration |
| The `changes` job's five outputs, now printed by the base commit's `scripts/ci/records-only.mjs` | `b1` (build/5) | the job conditions (`ci.yml:232`, `:478`, `:514`), the aggregator (`:806`), `test/ci/workflow.test.ts:790-820`, `test/ci/recordsOnly.test.ts` | clean |
| The CI aggregator's `needs` and results (`.github/workflows/ci.yml:744-815`) | `b1` | `test/ci/workflow.test.ts` | clean |
| `run checkpoint` / `run end` with `--drop-held` in an attended run: exit 0 → exit 1 | `b14` (review/14) | `docs/cli-reference.md` (text unchanged), `test/cli/commands/runCheckpoint.test.ts` | reconciled at integration; the CHANGELOG names it |
| The guard's `push-default` act, now also recorded for a write to a remote's HEAD ref (`src/hooks/personOnly.ts`) | `b14b` | the verdict (`personOnly.ts:3172`), the rendered guard copies (`src/hooks/scripts.ts:4559`), `run land`'s verdict check (`src/cli/commands/runLand.ts:596-603`, which `b14c` changes in wave 4) | reconciled at integration; no rule id or `RUNS` change |
| `readsUnattended`, moved to `src/runs/resumeCard.ts` | `b14c` | `src/cli/commands/run.ts:852`, `:861`, `:946`; `src/cli/commands/runLand.ts:247` | reconciled(4) |

## Risks

- **Warning:** `b1`'s size is unknown until its step 0 runs. Mitigation: the step's cap — more than eight red files
  stops the unit and returns the list, so the fixes split into a unit of their own.
- **Warning:** `b3`, `b4` and `b5` all edit `src/cli/commands/clean.ts`; they run serially (`b4` → `b5` → `b3`).
- **Warning:** `b5`'s hooks-document rewrite inside `clean --pack` may break the layering test; decision E2's fallback
  closes the row as a documented residual.
- **Warning:** `b12`'s retired-path proof widens what the sweep may delete. Mitigation: a closed list of literal paths with frozen 1.16.0 digests (never a ledger row's own hash), a row match on owner, artifact type and touchpoint, the bytes hashing to a frozen digest, the security lens on `b12`.
- **Warning:** `b1`'s probe roughly doubles the full side of CI on each pull request (a nested suite with no coverage,
  about four to six minutes). Mitigation: its timeout comes from measured green runs, and it runs only on the
  canonical repository's full side.
- **Warning:** `b9` adds a verb, which moves seven literal surface pins (a recorded learning: they drift silently
  green). Mitigation: the census row above, each pin checked in the unit's verify.
- **Warning:** until `b1` merges, this repository's `changes` job still runs the classifier from the change's own
  checkout (ledger `build/5`), and `b1` runs last. This file's own pull request edits `ci.yml`, so its land asks. A
  different pull request landed here before this file merges still rests on the head-run classifier. Mitigation: none
  inside this file; the close names it.
- **Minor:** `b14` (review/14) moves an attended `run checkpoint` or `run end` with `--drop-held` from exit 0 to exit
  1. A caller that relied on the flag being ignored now fails; the CHANGELOG names the change.
- **Minor:** with the prompt-file proof dropped at build, every Copilot setup from 1.16.0 keeps its legacy
  `.github/prompts/st-*.prompt.md` files, so a client that reads both lists each touchpoint twice until the owner
  deletes them. Mitigation: `sync` names each one, and `check` lists it with the remedy (`b13`, `b16`).
- **Minor:** `b14b` makes a person's own `git remote set-head` ask on the main thread. Accepted friction, named in the
  cell's `edgeCases`.
- **Minor:** `b18`'s review/12 header sentence changes every emitted Codex agent file once, so a Codex setup sees each
  agent file rewritten at the next `sync`.
- **Minor:** `b7` rewrites every stamped marker once; a 1.16.0 `check` over a newer tree reads them as drift (the
  CHANGELOG names the skew).
- **Minor:** whether GitHub Packages honours a published shrinkwrap (`_hasShrinkwrap`) is not measured; a fork's
  consumers may resolve fresh, as today.

## Inbox rows this file folds in

| Row (source id) | Unit |
|---|---|
| `review/19`, `build/15`, `build/4`, `2026-10-23_autonomy-distribution-01/build/5` | `b1-fork-ci-job` |
| `build/5`, `build/89` (after a re-measure), `2026-10-15_cloud-runs/build/103` (`claudeSettings.ts`), `cut/8` | `b3-clean-keeps-state` |
| `pass/1` | `b5-import-config-round-trip` |
| `build/96` (`updatedAt` on a no-op sync), `cut/20` | `b7-manifest-stable` |
| `build/34`, `review/50`, `review/68` | `b8-copilot-setup-switch` |
| `fix/2`, `cut/13` (decided: kept), `review/170`, the plan 016 banner and upgrade no-op rows | `b9-upgrade-verb` |
| `2026-10-25_autonomy-distribution-02/build/3` | `b9b-readd-synced-pack` |
| the `st` alias row | `b10-shrinkwrap-st` |
| the Copilot-only prompt-files row | `b13-copilot-touchpoints-skills` |
| `build/102`, `build/105`, `review/224`, `build/42`, `build/43`, `build/12`, `review/58`, `2026-10-18_cloud-runs-2/build/103` (`run.ts:995`), `review/167`, `review/203`, `2026-10-23_autonomy-distribution-01/review/14`, `2026-10-23_autonomy-distribution-01/review/15`, `2026-10-23_autonomy-distribution-01/review/16`, `2026-10-23_autonomy-distribution-01/review/40` (closed as rejected, with its pin test) | `b14-run-verbs-batch` |
| `2026-10-23_autonomy-distribution-01/review/163` | `b14b-default-branch-read` |
| `2026-10-23_autonomy-distribution-01/review/84`, `2026-10-23_autonomy-distribution-01/review/174` (closed as rejected, with its pin test and a `SECURITY.md` residual), `2026-10-23_autonomy-distribution-01/review/177` | `b14c-land-batch` |
| `build/21`, `review/31`, `review/168`, `review/169`, `review/43` | `b15-qa-ci-tooling-batch` |
| `prove/7`, `close/1` (`model-ladder.md:516`), `close/5`, `close/8`, `close/10`, `build/82`, `build/32`, `review/71` | `b16-docs-pointers-batch` |
| `review/59`, `build/84`, `prove/5`, `prove/6`, `prove/11` | `b17-test-infra-batch` |
| `2026-10-23_autonomy-distribution-01/review/12` | `b18-vendor-claims` |

Rows waiting for this package that no unit takes keep their row with a better `when:`, re-dated at the close: the
guard-emission rows (`build/46` golden bytes, `build/56`, `build/63`, `build/47`), `build/108`, `build/95` (with
`review/181`), `build/96` (no-init container), `build/37`, `build/86` (with `review/152`), `review/95`, `review/140`,
`review/1`, `review/91`, `prove/3`, `build/109`, `build/71`, `plan/23`, `close/1` (the waiver limit), `build/1`,
`build/7`, `prove/13`, `review/25`, `cut/30`.

## Open questions

None.

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

- Plan 016's upstream-lane units (package files, configuration template, App token, issues and freshness) and inbox
  `cut/30` · `when: scripts/upstream.mjs is touched` · `files: scripts/upstream.mjs, .github/workflows/upstream-update.yml`.
- Plan 016's fork attestations (the fork half) and the rest of the release hardening (`FORK-CHANGELOG.md`, the
  public-destination refusal) · `when: the next plan that touches .github/workflows/fork-release.yml` · `files:
  .github/workflows/fork-release.yml, docs/enterprise-forks.md`.
- Plan 016's `check` drift cause (exit 3 when only a re-sync is needed) · `when: src/cli/commands/check.ts's drift rows
  are touched` · `files: src/cli/commands/check.ts`.
- Plan 016's per-file import mode · `when: src/cli/commands/init.ts's import options are touched` · `files:
  src/cli/commands/init.ts, src/cli/commands/config.ts`.
- Make the canonical "Create GitHub release" step idempotent on a re-run · `when: a release re-run fails at "Create
  GitHub release"` · `files: .github/workflows/release.yml`.

## Drop list

| Item | Revisit when |
|---|---|
| `u1-fork-docs-identity` (a fork's hand-written docs carry its identity) | Package 21's docs land, or a fork reports the canonical name in its docs |
| `u1-foreign-paths`' APM lock reader | a user reports APM installed beside stamity |
| `u1-node-missing-hint` | a report of the main thread blocked for want of Node |
| `u1-repo-root` (every verb from any subfolder) | a monorepo or subfolder report |
| `u1-ignored-output` | a CI failure caused by an ignored ledger path |
| `u1-screen-references` | a refused `${{ secrets.X }}` report |
| The rest of `u1-git-isolation-headroom` | a timeout report from a machine with endpoint security |
| `u1-renovate-suffix` (the companion half) | a fork reports Renovate offering canonical versions |
| `u2-json-contract` | an outside orchestrator consumes `--json`, or a `--json` change breaks a caller |
| `u2-hooks-self-filter-vscode` | a measured run shows a stamity hook firing twice in Cursor, Copilot or VS Code |
| `u2-review-gate-all` | a measured Claude run shows `TaskCompleted` never firing, or a client's completion event is confirmed able to block |
| The Bugbot file (`.cursor/BUGBOT.md`) | a Cursor or Bugbot user asks |
| `u2-repo-file-waste`'s measure-then-document half; the bundled skills' Codex companions (E4) | a client is shown listing an artifact twice in a way a user notices |
| REQ-FLOW-046 (backups outside the working tree) | a `.bak` clutter report |
| `SOURCE_DATE_EPOCH` and version-free Codex hooks | a byte-reproducibility report, or a Codex re-trust complaint |
| Windows `npx.ps1` passing `--@<scope>:registry=<url>` intact | a fork reports a Windows install resolving the public registry |
