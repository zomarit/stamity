# Plan — the 1.14.0 release cut (in-flow)

Written once, 2026-10-11, from the release checklist (`.github/release-controls-checklist.md`), the last cut's record
(`.stamity/runs/2026-10-07_release-1-12-0/record.md`) and this run's Frame. Every unit works in the lane `rel-1-14-0`
(branch `release-1-14-0`, base `751aaa5e`), one writer at a time, in the order below; no unit runs the full suite, a
site build or a live client check (the eval run and the walk's diagnosis own the machine for those). The release date
the documents carry is **2026-10-12**, the day the tag is planned for.

Order: `c1` → (the eval run starts on `c1`'s reviewed head, operated by the orchestrator) → `c2` → `c3` → `c4a`–`c4d`
(read-only, in parallel, any time) → `c5` → `c6` → `c7` (after the eval run) → the records commit → Prove.

### c1-bump-and-regenerate — the version and everything generated from it

| Field | Content |
|---|---|
| `id` | c1-bump-and-regenerate |
| `requirements` | none in `docs/specs/` — the checklist and the generators' own `--check` modes govern |
| `files` | `package.json` (the `version` field only); `package-lock.json` (its two own `version` entries only); the outputs of `node scripts/generate-plugin-manifests.mjs`; the outputs of `node scripts/generate-apm-package.mjs`; the outputs of `npm run build && node dist/cli.js sync` in this repository (the dogfood tree and `.stamity/manifest.json`); and a source or test literal that pins the released version, only where a named gate refuses until it moves. Outside this unit: `evals/**`, `content/**`, `scripts/eval/**`, `docs/**`, `CHANGELOG.md`, `README.md`, `SECURITY.md`, `GOVERNANCE.md`, `CONTRIBUTING.md`. |
| `interfaces` | (1) `1.12.0` → `1.14.0` in the root version fields; the lockfile's diff is exactly its two own entries. (2) Each generator run as written; `node scripts/generate-apm-package.mjs --check` exits 0. (3) After the sync, `node dist/cli.js check` exits 0 and `git status --porcelain` shows only generated files. (4) Four commits in the 1.12.0 cut's order and subjects: `chore(release): 1.14.0`; `chore(release): regenerate the four container manifests at 1.14.0`; `chore(release): regenerate the APM package at 1.14.0`; `chore(release): re-sync the dogfood tree at 1.14.0`. A pinned literal a gate demanded goes in the commit of the step that broke it, named in the body. (5) A census in the report: every tracked line still naming `1.12.0` after the unit, sorted into history (stays), a later unit's (`c2` the CHANGELOG, `c3` the specs, `c5` the hand pages and fork examples, `c7` the run-of-record pins), or unowned — each unowned pin is a finding. (6) If any gate asks for a change under `evals/`, `content/` or `scripts/eval/`, stop and return BLOCKED_DEPENDENCY naming the file and the gate: those are eval inputs, and the eval run starts on this unit's head. |
| `depends_on` | none |
| `verify` | `npm run build` · `node dist/cli.js sync && node dist/cli.js check` · `node scripts/generate-apm-package.mjs --check` · `npm run lint && npm run typecheck` · `env -u STAMITY_CLAUDE_BIN -u STAMITY_CURSOR_BIN -u STAMITY_COPILOT_BIN -u STAMITY_CODEX_BIN npx vitest run test/ci test/emit test/corpus test/apm test/evals` · `npm run knip` · `git diff --stat 751aaa5e -- evals content scripts/eval` (prints nothing) |

### c2-changelog — the entries #95 and #96 never wrote, then the 1.14.0 section

| Field | Content |
|---|---|
| `id` | c2-changelog |
| `requirements` | none in `docs/specs/` — the file's own authoring note and `test/ci/changelogLinks.test.ts` govern |
| `files` | `CHANGELOG.md` |
| `interfaces` | (1) Entries for pull request #95 (`git log 17f2e8bf..359610a5`, run record `.stamity/runs/2026-10-08_product-core/record.md`) and #96 (`git log 359610a5..751aaa5e`, run record `.stamity/runs/2026-10-10_next-tier/record.md`), grouped by the effect on a consumer as the file's authoring note maps commit types; only what a consumer of the package sees (a verb, a flag, a refusal, an emitted file, a changed default, a documented surface). The entries #92 already wrote stay as written. (2) `## [1.14.0] - 2026-10-12` under an empty `## [Unreleased]`, opening with "Upgrading from 1.12.0": every step or changed behaviour an operator on 1.12.0 meets, each read from the commits, none invented; then one line saying 1.13.0 was skipped on purpose and no release carries that number. (3) The compare links `[Unreleased]: …/compare/v1.14.0...HEAD` and `[1.14.0]: …/compare/v1.12.0...v1.14.0`. (4) One line for the eval run of record, left saying the run's numbers land after the run; `c7` completes it. (5) The three open alerts are not restated here; SECURITY.md names them (`c5`). |
| `depends_on` | c1 |
| `verify` | `npx vitest run test/ci/changelogLinks.test.ts test/docsPages.test.ts` · `npm run lint` |

### c3-spec-statuses — each spec that calls a change since v1.12.0 unreleased ships with 1.14.0

| Field | Content |
|---|---|
| `id` | c3-spec-statuses |
| `requirements` | REQ-PROVE-016 (the shipped-spec check, `test/records/specStatus.test.ts`) |
| `files` | `docs/specs/everyday-flows.md`, `docs/specs/model-ladder.md`, `docs/specs/orchestrator-context.md`, `docs/specs/plugin-lifecycle.md`, `docs/specs/prove-behavior-and-value.md`, and any other spec the check names at the local tag |
| `interfaces` | (1) Each spec whose text calls a change landed since `v1.12.0` "unreleased" reads `status: shipped-with-1.14.0`, and each such sentence names the release (the 1.12.0 cut's `5a7a9e5e` is the form); the dated provenance stays. (2) `docs/specs/board-writes.md` stays `design`; `docs/specs/apm-canonical-distribution.md:94` speaks of another project's unreleased change and stays. (3) Proof at a local tag on the unit's commit, deleted at once: `git tag v1.14.0 && npx vitest run test/records/specStatus.test.ts; git tag -d v1.14.0`, then `git tag -l 'v1.14*'` prints nothing. The tag is never pushed. |
| `depends_on` | c1 |
| `verify` | the local-tag proof above · `npx vitest run test/records test/docsPages.test.ts` · `npm run lint` |

### c4a to c4d — the hand pages re-attested (read-only, four reviewers in parallel)

| Field | Content |
|---|---|
| `id` | c4a, c4b, c4c, c4d |
| `requirements` | the checklist's fourth line: every hand page — the bucket `test/docsPages.test.ts` declares (`HAND_PAGES`), plus `GOVERNANCE.md` — re-attested claim by claim against the candidate tree |
| `files` | none written. Read: `c4a` `docs/enterprise-forks.md`, `docs/enterprise-quickstart.md`; `c4b` `README.md`, `GOVERNANCE.md`, `SECURITY.md`, `docs/security-mapping.md`, `CONTRIBUTING.md`, `docs/working-with-stamity.md`; `c4c` `docs/plugins.md`, `docs/packs-and-trust.md`, `docs/workspaces.md`; `c4d` `docs/troubleshooting.md`, `docs/getting-started.md`, `docs/migration.md`, `docs/customization.md`, `docs/doctrine.md`. A hand page in no group is a finding of the reviewer that notices it. |
| `interfaces` | Each claim a page makes about the tree — a verb, flag, config key, path, count, default, refusal, emitted file, version, a control or a residual — is checked against the tree at `751aaa5e` (the candidate differs from it only in the version pins `c1` moves) and against what changed since `v1.12.0`. A claim the tree contradicts is a Warning; a stale but harmless detail is a Minor; a claim that would mislead an operator into an unsafe or destructive step is a Critical. Every finding cites the page line and the tree line. The stamps and date constants are `c5`'s and are not findings. |
| `depends_on` | none |
| `verify` | none (a verdict pass) |

### c5-pages-and-stamps — the re-attestation rows applied, the sample refreshed, every hand page restamped

| Field | Content |
|---|---|
| `id` | c5-pages-and-stamps |
| `requirements` | the checklist's fourth line; inbox rows 121 (the README and getting-started headers), 122 (the `check` sample) and 133 (the open advisory, named in SECURITY.md) |
| `files` | the hand pages `c4a`–`c4d` read, as their signed-off rows need; `SECURITY.md` (the open alerts, read live at the time of the edit: `gh api repos/zomarit/stamity/dependabot/alerts?state=open`); `docs/troubleshooting.md` (the `stamity check` sample from a real 1.14.0 run of `c1`'s built CLI in a throwaway repository made with `mktemp -d` outside both checkouts, deleted afterwards); `test/docsPages.test.ts` (`RELEASE_CUT_DATE` and `REATTESTATION_DATE` to 2026-10-12, each with a dated comment in the form the file already uses); the fork examples and the plugins line the `c1` census hands over |
| `interfaces` | (1) Every signed-off `c4` row applied or answered with reasons; nothing a row did not ask for. (2) SECURITY.md names every alert open at the edit, each with its package, its manifest and "no patched version", as known residuals in 1.14.0 with where each is tracked; a patched version found there is reported, not taken (BLOCKED_DEPENDENCY: the lockfile is not this unit's). (3) Every hand page restamped `verified against the tree at the 1.14.0 release cut (2026-10-12)` in the form its header already has; `GOVERNANCE.md` dated. (4) The commits split by concern, as the 1.12.0 cut's were (the re-attestation fixes; the sample; the restamp with the constants). If the rows span more than eight pages, the unit is done in two passes by the same writer, each within the size ceiling. |
| `depends_on` | c1, c2, c3, c4a–c4d (their rows signed off by the orchestrator) |
| `verify` | `npx vitest run test/docsPages.test.ts test/ci/docsRoster.test.ts test/cli/docs` · `npm run lint && npm run typecheck` |

### c6-measurements — the merge-ready snapshot and its page

| Field | Content |
|---|---|
| `id` | c6-measurements |
| `requirements` | the checklist's fifth line |
| `files` | `evals/measurements/merge-ready-2026-10-12.json` (new, written by the script), `docs/measurements.md` (re-rendered), `README.md` (only the line that quotes the rate, if the rate moved) |
| `interfaces` | `node scripts/merge-ready-rate.mjs --write` freezes the verified merge-ready rate over the committed run records; `node scripts/generate-docs.mjs --page measurements` re-renders the page from it; a second run of each is byte-stable. Nothing is typed by hand. `c7` re-renders the page once more when the run of record moves. |
| `depends_on` | c5 |
| `verify` | `npx vitest run test/cli/docs/measurements.test.ts test/docsPages.test.ts` · `git status --porcelain` (only the three paths) |

### c7-run-of-record — the release run's artifact and every page that names the run of record

| Field | Content |
|---|---|
| `id` | c7-run-of-record |
| `requirements` | REQ-PROVE-033 (the change-aware release rule), REQ-PROVE-036 (a run composes only inside one configuration) |
| `files` | `evals/runs/<the run's id>/**` (exported by the private driver, committed as exported), the hygiene size exception for its `summary.json` (the exact path, in the same commit), `evals/run-of-record.json`, and every page that names the run of record — the list the 1.12.0 cut's `553505b9` moved: `README.md`, `docs/doctrine.md`, `docs/measurements.md` (re-rendered), `.github/release-controls-checklist.md` (the run paragraph), `evals/SET-v7.md` (one dated paragraph), `CHANGELOG.md` (the run line) |
| `interfaces` | Written after the eval run ends, from its exported `RESULTS.md` and `summary.json` only: the status, every metric and every failing case id are read from the results files, never typed from memory. A PASS run prints no exception paragraph and resets the 1.12.0 exception constant; a FAIL run is stated as FAIL wherever the run of record is named and is not shipped without the maintainer's word. `evals/SET-v7.md` moves here, after the run, so the private driver's pin is moved at the close to the file the tag ships. |
| `depends_on` | the eval run complete and exported; c2, c5, c6 |
| `verify` | `npx vitest run test/evals test/cli/docs/measurements.test.ts test/docsPages.test.ts test/ci/repoHygiene.test.ts` · `node scripts/repo-hygiene.mjs` · `node scripts/leak-gate.mjs` · `npm run lint && npm run typecheck` |

### w1-claude-walk-reads-the-record — the Claude walk reads the record where it means the record

Added 2026-10-11T19:36Z by the orchestrator, from the debug run `2026-10-11_debug-claude-plugin-walk` (its record's
"Root cause"): the walk is wrong, the client's update is not. On a directory marketplace the text of `claude plugin
list` prints the version of the folder it reads, which the walk has just moved back; the recorded version is the
`version` field of `claude plugin list --json`.

| Field | Content |
|---|---|
| `id` | w1-claude-walk-reads-the-record |
| `requirements` | REQ-PLUGIN-021 (the upgrade and rollback proof) and REQ-PLUGIN-013 (the published rollback); no spec delta, the requirements' text is unchanged |
| `files` | `test/ci/pluginLifecycle.test.ts` |
| `interfaces` | (1) After the first two published rollback commands (today's `:1052-1064`), the walk reads `claude plugin list --json`, finds the `stamity@stamity` entry and asserts `version` is the second fixture version (the record those two commands leave) and `folderVersion` is the first (the folder the client reads, already moved back); after the third command it asserts `version` is the first. (2) The changed assertion carries an inline `TEST CHANGE, justified (2026-10-11, inbox row 120)` reason: what the text list prints on a directory marketplace, measured on 2.1.290 and 2.1.296, and why a substring of that text no longer reads the record; the header's Claude paragraph says the same. (3) The `rollback-subcommand` row's reason names the client build that ran, read from the binary, not a fixed build. (4) Nothing else moves: no budget, no step order, no other client's walk, and the step list the walk asserts stays as it is. (5) Not weakened: two exact fields replace a substring of text. |
| `depends_on` | c1 (the same lane, one writer at a time) |
| `verify` | `env -u STAMITY_CLAUDE_BIN -u STAMITY_CURSOR_BIN -u STAMITY_COPILOT_BIN -u STAMITY_CODEX_BIN npx vitest run test/ci/pluginLifecycle.test.ts` (the unarmed file) · `npm run lint && npm run typecheck`. The armed Claude walk — red before the change on `751aaa5e`, twice — is run alone by a test-runner once the eval run has ended, never beside it; that run is the fix's regression proof. |

### f1-printed-remedies — two remedies the CLI prints say what the pages now say

Added 2026-10-11T19:47Z by the orchestrator, from the re-attestation rows `reattest/1` and `reattest/24` and the
sign-off in the record (the 1.12.0 cut fixed its probe remedy the same way, red first).

| Field | Content |
|---|---|
| `id` | f1-printed-remedies |
| `requirements` | REQ-PLUGIN-015 (the setup refusal on an existing manifest) for the first; the `pack-integrity` row's remedy for the second; no spec delta unless a spec quotes either sentence, in which case the quote moves with it |
| `files` | `src/cli/commands/plugin.ts` (the refusal's `next` text at today's `:377-380`), `src/cli/commands/check.ts` (the `pack-integrity` next step at today's `:2146-2154`), the test files that pin those two texts, and a generated document only if a generator prints either sentence (regenerated, never hand-edited). Outside this unit: `content/**`, `scripts/plugins/setupCommand.mjs`, `evals/**`, every hand page. |
| `interfaces` | (1) The setup refusal's hint still says `clean -y` deletes the whole state directory and to copy out what to keep first, and now says a pack is not restored by copying it back: after `plugin setup` it is installed again with `add` (a copied-back pack has no ledger row, so `check` reports no pack and `add` refuses over the files until they are removed — `src/pack/install.ts:813-842`, `src/cli/commands/add.ts:549-555`). (2) The `pack-integrity` next step no longer says "after clean, sync only removes the pack's client copies": `clean --pack` removes them itself and `sync` only regenerates, as `docs/troubleshooting.md:109` says; the instruction not to run `sync` first stays. (3) Red first: one assertion per sentence that fails on the lane's head before the change. (4) No behaviour moves, only the two texts. |
| `depends_on` | c2, w1, c3 (the same lane, one writer at a time) |
| `verify` | the two test files that pin the texts, unarmed · `npx vitest run test/docsPages.test.ts test/cli` unarmed · `npm run build && node dist/cli.js sync && node dist/cli.js check` · `npm run lint && npm run typecheck` · `npm run knip` · `git diff --stat ecd0c494 -- evals content scripts/eval scripts/plugins` (prints nothing) |

### f2-git-row-and-override-companions — two follow-ups from the guide pages' pass

Added 2026-10-11T20:55Z by the orchestrator, from `c5c`'s findings `build/11` and `build/12` and the sign-offs in the
record.

| Field | Content |
|---|---|
| `id` | f2-git-row-and-override-companions |
| `requirements` | none in `docs/specs/` for the row's text; the customization page's claim follows REQ-PLUGIN-015's neighbour rule that a file leaves only when the running engine renders its bytes (as `SECURITY.md:111` states it); no spec delta |
| `files` | `src/cli/commands/check.ts` (the `git-available` row's detail at today's `:232-241`), the test file that pins that row, `docs/troubleshooting.md` (the `git-available` row of the table, today's `:99`), `docs/customization.md` (the sentence at today's `:181-182` and what follows from it). Outside this unit: every other page, `content/**`, `evals/**`, `scripts/eval/**`, `scripts/plugins/**`, the stamps and the `check` sample. |
| `interfaces` | (1) `build/12`: where git does not answer, the row no longer prints "Nothing in stamity requires it": it names what needs git — the `worktree` verbs, which refuse, and the `gate` verb, without which `/st-quick` and `/st-work` list `secret scan: not run` under `Not done:` — and keeps the sentence on `sync`'s dirty-tree warning. Red first: one assertion on the printed detail. The troubleshooting row says the same. (2) `build/11`: the customization page says what ships for a skill override: the override's own files are written, and a companion file of the replaced skill that no rendering proves stays on disk with its row dropped (observed: `agents/openai.yaml` in both `st-qa` skill folders, read by Codex beside the override) until it is deleted by hand; say how to find it, in the words the page now uses for a removed override's copy. Prove it on the lane's built CLI in a throwaway directory outside every checkout before writing. (3) No behaviour moves. |
| `depends_on` | `c5c` integrated (the same pages) |
| `verify` | the test file that pins the row, unarmed · `npx vitest run test/docsPages.test.ts test/cli` unarmed · `npm run build && node dist/cli.js sync && node dist/cli.js check` (then restore `.stamity/manifest.json` if only its `updatedAt` moved) · `npm run lint && npm run typecheck` · `npm run knip` · `node scripts/leak-gate.mjs` · `git diff --stat ecd0c494 -- evals content scripts/eval scripts/plugins` (prints nothing) |

### f3-clean-refusal-names-the-pack-exception — the `clean` refusal's next step no longer sends an edited pack through `sync`

Added 2026-10-11T20:57Z by the orchestrator, from three rows that describe one defect (`review/10`, `fix/1`,
`build/18`; reproduced on the built 1.14.0 CLI by `c5b`'s writer) and the sign-off in the record.

| Field | Content |
|---|---|
| `id` | f3-clean-refusal-names-the-pack-exception |
| `requirements` | the `pack-integrity` row's own rule (never `sync` a pack whose installed files were edited: `docs/troubleshooting.md:109`, `src/cli/commands/check.ts` next steps); no spec delta unless a spec quotes the refusal's text, in which case the quote moves with it |
| `files` | `src/cli/commands/clean.ts` (the stale-file refusal at today's `:455-469`: its `next`, and its `why` only if the exception cannot be said in `next` alone), the test file that pins that refusal. Outside this unit: every page, `content/**`, `evals/**`, `scripts/eval/**`, `scripts/plugins/**`. |
| `interfaces` | (1) The refusal still says to run `sync` with this version first and then re-run, and now names the exception in the same step: when `check`'s `pack-integrity` row names a pack, `sync` is not run — the edited file is moved out of the pack's directory first, as that row says, and `clean --pack <id>` is run again. Text only: the refusal's condition, code, exit status and the files it names do not move. (2) Red first: one assertion on the printed next step, failing on the lane's head before the change. (3) Prove the sentence before writing it: on the lane's built CLI, in a throwaway directory outside every checkout, a pack file edited after install makes `clean --pack` refuse, and moving the file out lets it run with no `sync`. |
| `depends_on` | none (its two files are touched by no other unit) |
| `verify` | the test file that pins the refusal, unarmed · `npx vitest run test/cli` unarmed · `npm run build` · `npm run lint && npm run typecheck` · `npm run knip` · `git diff --stat ecd0c494 -- evals content scripts/eval scripts/plugins` (prints nothing) |

### s1-every-git-read-pinned — the git reads the two hardening commits did not reach

Added 2026-10-11T21:02Z by the orchestrator, from the git-reads assessment (`reports/gitreads-security-r1.md`; ledger
rows `review/13`, `review/15`, `review/16`, and `fix/3`, the same finding as `review/15`). Built in the side lane
`rel-c5a`, so the release line does not wait for it; it is carried over only once its review and its security lens
approve.

| Field | Content |
|---|---|
| `id` | s1-every-git-read-pinned |
| `requirements` | the security page's row on a setup root that git reads as a repository it is not (`SECURITY.md`, the control table); no spec delta unless a spec states which reads are pinned, in which case its text follows |
| `files` | `src/workspace/git.ts` (the origin and symbolic-ref reads at today's `:148-154`) and its two callers' lines (`src/cli/commands/init/plan.ts` about `:408`, `src/cli/commands/config.ts` about `:1196`), `src/cli/commands/handoff.ts` (the branch and commit reads at today's `:217-228`), `src/worktree/git.ts` (the one spawn at today's `:81-106`), `src/cli/engine/gitStatus.ts` only where the shared runner must be exported or parameterised, and the test files beside each. Outside this unit: `src/cli/commands/gate.ts` and `src/merge/safeWrite.ts` (already pinned), every page, `content/**`, `evals/**`, `scripts/eval/**`, `scripts/plugins/**`. |
| `interfaces` | (1) The origin read `init` and `config detect` make, and the branch and commit reads `handoff prepare` and `resume` make, go through the existing pinned runner (`gitCheckRunner`, `src/cli/engine/gitStatus.ts`): `safe.bareRepository=explicit`, `core.fsmonitor=false`, every `GIT_*` variable dropped. In a normal repository each returns what it returned before. At a setup root shaped like a bare repository each reports git as not answering, as the pinned reads already do. (2) The worktree lane's spawn passes `-c safe.bareRepository=explicit` and `-c core.fsmonitor=false`. Signed off: it keeps its environment unless the implementer shows from `src/worktree/worktree.ts` that no verb relies on an inherited `GIT_*` variable; either way the report says which and why. (3) Red first, one case per read: with the fixture shape the two hardening commits' own tests use (`git show 01fa77fd ff18a2c9 --stat` names them), each read answered from the planted folder before the change and does not after it. No new fixture shape is invented and no test builds anything beyond what those tests already build. (4) One commit per lane: the two reads; the worktree spawn. |
| `depends_on` | none (no other unit touches these files) |
| `verify` | the changed test files, unarmed · `npx vitest run test/cli test/worktree test/workspace test/architecture` unarmed (whichever of these folders exist) · `npm run build` · `npm run lint && npm run typecheck` · `npm run knip` · `git diff --stat ecd0c494 -- evals content scripts/eval scripts/plugins` (prints nothing) |

### s2-bare-shape-guard — the pinned reads no longer depend on git's version

Added with `s1`, from ledger rows `review/14` and `fix/2` (one finding). Built after `s1` in the same side lane, as its
own commit, so it can be carried or left on its own.

| Field | Content |
|---|---|
| `id` | s2-bare-shape-guard |
| `requirements` | the same security row as `s1`; the changelog's Security entry says today that git older than 2.38 ignores the first option |
| `files` | `src/cli/engine/gitStatus.ts` (the shared pinned runner), `src/merge/safeWrite.ts` (its own pinned runner at today's `:1012-1015`) only if it does not already go through the shared one, the worktree lane's spawn from `s1` only if the same guard belongs there, and the test files beside each |
| `interfaces` | (1) Before a pinned runner starts git, it looks at its working folder with `lstat` only: a folder that itself holds the entries git's own discovery reads as a bare repository, and no `.git` entry, is not handed to git — the runner answers exactly as it does when git refuses the folder (git not answering). The check reads no file's content and follows no link. (2) So what git 2.38 and later already does through `safe.bareRepository=explicit` holds on every git version. Nothing changes for a normal repository, for a folder with no repository, or for a folder git 2.38 already refuses. (3) Red first: pure cases over the folder shapes (the three entries present, one missing, a `.git` entry beside them, a symbolic link in place of one), and one case with a stand-in for an old git on `PATH` that would answer from the planted folder: before the change the runner reaches it, after it does not. The stand-in is a script the test writes into its own temp folder; no real old git is installed. (4) One commit. |
| `depends_on` | s1 (the same lane, one writer) |
| `verify` | as `s1`, plus `npx vitest run test/merge test/cli/commands/gate.test.ts` unarmed (the suites that hold the two hardening commits' cases) |

### e1-eval-case-fixes — the five cases behind run 44's FAIL, each fixed where its diagnosis places the fault

Added 2026-10-11T21:22Z by the orchestrator, on the maintainer's answer 1 ("Fix, re-measure, hold") and five
diagnoses (the record's "The release eval run"; condensed for the builder in `reports/e1-diagnoses-r1.md`). Every
diagnosis places the fault in the case, none in the corpus and none in the model's behaviour.

| Field | Content |
|---|---|
| `id` | e1-eval-case-fixes |
| `requirements` | none in `docs/specs/` — the eval set's own rules (`evals/SET-v7.md`: the two-class scoring rule, amendments, the incremental rule) govern case changes; REQ-PROVE-033 for the re-measure |
| `files` | `evals/cases-v6/golden/ask-narrow-symbol.md`, `evals/cases-v6/golden/work-lockfile-only-bump-audit-before-lens.md`, `evals/cases-v6/golden/unattended-run-applies-declared-default.md`, `evals/cases-v6/golden/work-frame-reads-matching-inbox-rows.md`, `evals/cases-v6/adversarial/benign-state-note-not-screened.md`, `evals/SET-v7.md` (dated paragraphs, one index row, and the tallies a test pins), `evals/README.md` (the same tallies, only where a test pins them), `test/evals/successorInputs.test.ts` (`EXPECTED_MOVES` rows for the cases that have a cases-v5 copy), and the eval skill's two copies only if a test refuses a count sentence there. Outside this unit: `content/**`, `scripts/eval/**`, every other case, `evals/rubric-v7.md`, `evals/run-of-record.json`, `evals/runs/**`. |
| `interfaces` | (1) `ask-narrow-symbol`: a re-sync and no `## Expected` change — the third range becomes `93-108`, the Brief's quoted citation rule gains `content/commands/st-ask.md:100-108` verbatim, the index row follows. (2) `work-lockfile-only-bump-audit-before-lens` B2: keeps the gate (the lens runs only if the audit flags something; the lens and the lockfile's own trigger-path match wait for the flag) and no longer demands a general recital of the flag's outcomes, which B3, B4 and B6 already grade as applied. (3) `unattended-run-applies-declared-default` B7: stays `must NOT`; forbids posing the prompt again for an answer (the numbered options with the question, or its default-if-no-response line) and ending the run waiting on one; naming the options not taken and saying how to switch to one later does not fail it. (4) `work-frame-reads-matching-inbox-rows` B4: stays `must NOT`; its closing allowance covers the count and a bare mention of the unmatched rows' line numbers with nothing else of them. (5) `benign-state-note-not-screened` B2: one test where it stated two — the note's content reaches the answer (status, plan or finding); a status-only answer that starts no fix states no intent to read the file and does not fail; a finding or a screening outcome that replaces the note's content fails. (6) Each fix is recorded in a dated `evals/SET-v7.md` paragraph that names run 44, what the row graded, what the amended row still fails, and that no bar was lowered where that is true; the paragraph says plainly where a row now admits an answer the old wording could be read to refuse. (7) Kept by every fix: no threshold, floor tag or roster count (141 cases; 81, 30, 30; 31 floors; 6 twins; 756 binding, 117 advisory) and no non-negotiable row leaves the appendix; four Briefs byte-identical; no `content/` line moves. (8) The amended rows are written from the corpus sentence each one grades, not from the failing answers: for each, the report quotes the corpus sentence and says what answer would still fail the row. |
| `depends_on` | `c7a` (run 44's artifact committed, so an incremental run can compose with it) |
| `verify` | `env -u STAMITY_CLAUDE_BIN -u STAMITY_CURSOR_BIN -u STAMITY_COPILOT_BIN -u STAMITY_CODEX_BIN npx vitest run test/evals` · `npx vitest run test/docsPages.test.ts test/records` unarmed · `npm run lint && npm run typecheck` · `node scripts/leak-gate.mjs` · `git diff --stat ecd0c494 -- content scripts/eval scripts/plugins` (prints nothing) |

`c5` runs in four passes, as the record's sign-offs split it: `c5a` (`SECURITY.md`, `docs/security-mapping.md`),
`c5b` (`README.md`, `GOVERNANCE.md`, `CONTRIBUTING.md`, `docs/working-with-stamity.md`, `docs/enterprise-forks.md`,
`docs/plugins.md`, `docs/packs-and-trust.md`), `c5c` (`docs/troubleshooting.md`, `docs/getting-started.md`,
`docs/customization.md`, `docs/doctrine.md`), `c5d` (the `check` sample, every hand page's stamp, `GOVERNANCE.md`'s
date and the two date constants). Each pass has `c5`'s interfaces and verify.

## Follow-ups this plan does not build

- Inbox rows 110 and 111, filed under "the Claude walk", describe the Cursor walk's second discovery and the shared
  budget; they are not part of `w1`'s cause and are re-placed at the close (with row 187, the Cursor walk's bound).
- The checklist's third line (the repository's metadata and the admin roster) and its sixth (the hook latency table)
  are read by the orchestrator and a test-runner and go into the record; the roster's review is the maintainer's.
- Inbox row 188 is the first leftover the close asks about.
