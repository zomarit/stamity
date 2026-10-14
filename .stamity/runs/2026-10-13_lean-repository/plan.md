---
id: lean-repository-01
intent: refactor
stamp: 6dfa5ffe36890ee04e1d3d3508100b5974d47207 2026-10-13
reads: [docs/enterprise-forks.md, docs/specs/enterprise-upstream-lane.md, scripts/upstream.mjs, test/upstream/lane.test.ts, test/upstream/fixtures.ts, .github/workflows/nightly.yml, .github/workflows/release.yml, .github/workflows/docs-site.yml, .github/workflows/pack-signing-rehearsal.yml, .github/workflows/fork-release.yml, .github/workflows/upstream-update.yml, test/ci/workflow.test.ts, test/ci/forkIdentity.test.ts, test/ci/forkReleaseWorkflow.test.ts, scripts/fork-identity.mjs, docs/specs/plugin-lifecycle.md, evals/README.md, evals/rubric-v4.md, evals/rubric-v5.md, evals/rubric-v6.md, evals/rubric-v7.md, evals/MODEL-PROFILES-v2.md, evals/model-profiles-v2.json, test/evals/readmeCurrency.test.ts, test/evals/fixtureCount.test.ts, test/evals/rubricCoreHash.test.ts, test/evals/manualRunner.test.ts, test/evals/prospectiveCalibration.test.ts, scripts/eval/run.mjs, CONTRIBUTING.md, .github/release-controls-checklist.md, CHANGELOG.md, docs/specs/prove-behavior-and-value.md, docs/specs/orchestrator-context.md, test/docsPages.test.ts, test/ci/changelogLinks.test.ts, .stamity/change-classes.json]
---

# Plan 014 file 1, re-planned in-flow — the fork fixes and the retired eval inputs

The in-flow plan of run `2026-10-13_lean-repository`. It re-plans `docs/plans/014-lean-repository-01.md` (stamp
`9239379c`, 2026-10-01; its freshness guard failed: 18 of its 29 reads moved) with that file as input, as the opening
batch's first answer allowed, and it is the copy every dispatch points at. **Unit ids are kept.** The persisted plan
stays the record of the why — its Context, the maintainer's walk of 2026-10-01, its Risks and its Drop list hold
unless a line below changes them. Every `path:line` here was read at `6dfa5ffe` (`main`, 2026-10-13); the branch adds
only the hook-runner fix, which touches none of these files but `CHANGELOG.md`.

`DATE` = **2026-10-13** everywhere below: the retirement tag's name, the spec amendments, the re-attested headers and
the CHANGELOG texts. The pull request merges later; the persisted plan's `<date>` (the merge date) is read as this date,
the day the change was made, so every dated text in the pull request agrees with the tag.

## What changed from the persisted plan (each is a sign-off in the run record)

1. **Settled default 1 is reversed** by the maintainer's opening answer 2 (the 2026-10-08 fold of inbox row "plan 014's
   import recipe still pushes plain upstream `v*` tags"): the import pushes `refs/heads/main` alone. f1's interfaces and
   criteria and REQ-UPSTREAM-014's new text follow; the bare clone also takes `--no-tags`.
2. Settled defaults 2–7 stand as written.
3. **`CHANGELOG.md` has one writer:** `## [Unreleased]` exists now (`:32`, with `### Security`, `### Added`,
   `### Changed`, `### Fixed`), so no heading is added; f2's and f3's bullets go under its `### Changed` and f4's under
   a new `### Removed`, all three written by lane C with f4.
4. **`test/docsPages.test.ts` has one writer:** lane A (f1) moves `REATTESTATION_DATE` once, to `DATE`, the date both
   re-attested pages use (f1's `docs/enterprise-forks.md`, f4's `CONTRIBUTING.md`).
5. **f2 takes the 2026-10-08 fold `2026-09-23_orchestrator-context/build/368`:** the unrelated-history fixture is
   rebuilt without cloning and deleting `.git`, with its preconditions asserted.
6. **f1 also qualifies the guide's other mirror-era sentences** and `fork-release.yml`'s comment, and adds one sentence
   against pushing tags from the working clone (research finding W-1).
7. **f4's never-edited list grows** by `evals/rubric-v4.md`, `evals/MODEL-PROFILES-v2.md` and
   `.claude/skills/st-eval-run/SKILL.md`; the README's retirement line covers the retained documents that still name a
   retired file; no new line states a fixture count.
8. **f3's spec paragraph** goes right after REQ-PLUGIN-020's quoted paragraph, where the persisted plan put it.
9. **Lanes:** A (f1 → f2), B (f3), C (f4) run in parallel; f0 ran at Frame.

## Settled defaults

1. **(Amended `DATE`, opening answer 2.)** The import pushes `refs/heads/main` alone — no `--mirror`, no tag — so
   `plugin-dist`, `plugins/v*`, the `v*` release tags and the archive, replay and retirement tags stay upstream, and the
   push deletes no destination ref. (It read: "pushes `main` and `refs/tags/v*` explicitly".)
2.–7. As in `docs/plans/014-lean-repository-01.md` § Decisions (the refspec-pattern check at load, exit 2; an exact
   pattern — **amended 00:18Z (S16):** not checked with `git ls-remote`, which breaks the lane's invariant 7 (no
   network call but `git fetch`), but fetched with the glob `refs/tags/<pattern>*` and counted present only when its
   own namespace ref exists afterwards, the sweep keeping only that ref; the sweep deleting only namespace refs outside the glob; the
   nightly guard as the repository clause alone; the annotated tag `evals-retired-DATE` on the `main` commit the run
   starts from, pushed before the merge, every restore command naming tag and sha; no rubric-core and no `SET-v7.md`
   byte moves).

## Spec delta (merged at Prove by one spec-author)

### A. `docs/specs/enterprise-upstream-lane.md`

- **REQ-UPSTREAM-002 (MODIFIED):** the persisted plan's § A text, replacing `:181-182` (unmoved), with its five
  criteria, and two corrections from f2's review (ledger `review/6`, `review/7`): the "Refused patterns" bullet says
  the load check runs on the cut form `refs/tags/<prefix>*<suffix>` (an exact pattern: `refs/tags/<pattern>`), which
  is what the code checks, so a multi-`*` pattern such as `v*-*-final` is accepted; and every evidence line is cited at
  the branch head, since f2 moved them (`scripts/upstream.mjs`'s fetch, cut, load check and sweep; exit 2 at the
  spec's `:166-167`). The sweep bullet also names the stale exact tag f2 removes.
- **REQ-UPSTREAM-014 (MODIFIED):** replaces `:467-470`, "so the private case is a mirror clone pushed to a new
  repository with its history and none of the fork features (`Sync fork`, the merge-upstream endpoint, pull requests to
  upstream, `gh repo sync`);". New text: "…so the private case is a single-branch bare clone of upstream `main`, pushed
  to a new repository as `refs/heads/main` alone, with that history and none of the fork features (`Sync fork`, the
  merge-upstream endpoint, pull requests to upstream, `gh repo sync`). The import uses no `--mirror` and pushes no tag,
  so it creates no other branch or tag in the destination — `plugin-dist`, `plugins/v*`, the `v*` release tags,
  `evidence-archive-*`, `replay-frozen-*` and `evals-retired-*` stay upstream — and deletes no destination ref.
  (Amended DATE, plan 014 file 1, unit `f1-import-recipe`; it read "a mirror clone pushed to a new repository with its
  history".)" Evidence: the guide's block at `docs/enterprise-forks.md:109-110` (today) and the new test. Criteria:
  GIVEN the guide's import block THEN it clones bare, single-branch at `main`, with no tags, pushes exactly
  `refs/heads/main:refs/heads/main`, and contains no `--mirror` and no `refs/tags/`; GIVEN a fixture upstream carrying
  `main`, `plugin-dist`, `v1.0.0`, `plugins/v1.0.0` and an annotated `replay-frozen-x`, and an empty destination, WHEN
  the block's two git commands run THEN the destination's refs are exactly `refs/heads/main`; GIVEN a destination
  already holding `refs/heads/feature` THEN `feature` survives.

### B. `docs/specs/prove-behavior-and-value.md` — REQ-PROVE-009 (heading `:300`)

The persisted plan's § B texts, with today's anchors: the banner as the first line under the heading (precedent
`docs/specs/orchestrator-context.md:623`); the replaced sentence at `:302-304`; the Non-goal at `:1046`; the corrected
citations `evals/README.md:8`, `:19-20`, `:31-36` and `.github/release-controls-checklist.md:224`; the precedents
`CHANGELOG.md:1213-1217` and `docs/specs/orchestrator-context.md:634-641`. Criteria as persisted.

### C. `docs/specs/plugin-lifecycle.md` — REQ-PLUGIN-020 (heading `:966`)

The persisted plan's § C paragraph, inserted after `:1074` (the end of the paragraph `:1066-1074` that says "Nightly's
drive step carries the invocation legs behind four secrets"), before the 2026-09-30 amendment at `:1076`. Evidence:
cited by job and step name, as the spec's own rule asks (`docs/specs/plugin-lifecycle.md:1016-1018`; f3's review): the
jobs `macos-smoke`, `node-next` and `headless-lane` of `.github/workflows/nightly.yml` and its four client drive steps,
not their line numbers, which f3 moved.

## Units

No unit touches `content/**`, so no eval case moves and no dogfood sync runs.

### f0-retirement-manifest — done at Frame (22:19Z)

| Field | Content |
|---|---|
| `id` | f0-retirement-manifest |
| `requirements` | REQ-PROVE-009 |
| `files` | the run record only |
| `interfaces` | `<base>` = `6dfa5ffe36890ee04e1d3d3508100b5974d47207`. The capture over the 15 path arguments printed 145 rows, sha256 `9444c836cd40b223549d664723bf82ad96b2135497d68c13f81e6005be6d5946`, the same 145 as at `9239379c`; the reader re-check found no reader (the record's Frame section lists the eight hits and their classes). |
| `testCriteria` | as persisted — both held. |
| `depends_on` | none |
| `verify` | done |

### f1-import-recipe — the private import takes `main` alone (lane A, first)

| Field | Content |
|---|---|
| `id` | f1-import-recipe |
| `requirements` | REQ-UPSTREAM-014 |
| `files` | `docs/enterprise-forks.md`; `test/upstream/importRecipe.test.ts` (new); `test/docsPages.test.ts` (`REATTESTATION_DATE` only); `.github/workflows/fork-release.yml` (the comment `:207-208` only); `.stamity/change-classes.json` (the new test's `testInputs` entry only) |
| `interfaces` | **The block** (`docs/enterprise-forks.md:101-117`): `:109` `git clone --bare https://github.com/zomarit/stamity stamity-import.git` becomes `git clone --bare --single-branch --branch main --no-tags https://github.com/zomarit/stamity stamity-import.git`; `:110` `git -C stamity-import.git push --mirror "$STAMITY_PRIVATE_URL.git"` becomes `git -C stamity-import.git push "$STAMITY_PRIVATE_URL.git" 'refs/heads/main:refs/heads/main'`; `:102-108` and `:111-116` stay byte-identical (the `merge-base --is-ancestor "$STAMITY_BASELINE_TAG" HEAD` line is pinned at `test/docsPages.test.ts:2550-2554`). **The prose** `:119-128`: `:119` "The last command checks the baseline this example imported." becomes a sentence saying the check runs in this working clone, where `git fetch upstream` brought upstream's tags — the import pushed none; keep the `STAMITY_BASELINE_TAG` advice (`:119-122`); `:123-125` ("…it imports branches and tags without the pull-request refs GitHub rejects on push") says the import copies `main` alone — no other branch and no tag, so `plugin-dist`, `plugins/v*`, the `v*` release tags and the evidence-archive, replay and retirement tags stay upstream — and the push deletes nothing at the destination; keep the backup sentence; drop "Do not repeat `push --mirror` after customization. It would replace your downstream refs." and keep "Every later update comes through the upstream lane instead."; add one sentence: this working clone holds upstream's tags, so push the private copy's own release tags by name (`git push origin <tag>`), never with `--tags`; add one sentence for a copy imported with the earlier `--mirror` recipe: it keeps `plugin-dist`, `plugins/v*` and upstream's other tags until its owner deletes them, and nothing in the lane reads them. **Other mirror-era sentences:** `:67-69` and `:71` ("a bare clone mirror-pushed…", "The mirror route…") say a single-branch import of `main`; `:98-99` keeps the instruction (disable Actions before importing any refs) and words its reason so it holds for both recipes; `:764-765` (the Renovate reason "distinct from the imported upstream tags") names the lane's own namespace and copies imported the earlier way; `:1025-1027` ("A fork that imported this repository's history also imported its `v*` tags…") becomes the earlier recipe's case. `.github/workflows/fork-release.yml:207-208`'s comment says the same ("A fork imported with the earlier mirror recipe also holds the canonical `v*` tags, …"), comment only. **Header** `:5` (cut form) → commit form `<!-- HAND-WRITTEN PAGE — verified against the tree at commit c3d81529. Re-attested DATE against <what was re-checked, no period inside>. -->` (precedent: the 2026-09-26 header in `git show 3338ee97^:docs/enterprise-forks.md`; regex `test/docsPages.test.ts:444-445`; `c3d81529` is the 1.14.0 cut the page was last verified at). `REATTESTATION_DATE` (`:670`, `"2026-10-12"`) → `"DATE"` with the `MOVED <date>, from …, by plan 014 file 1, unit f1-import-recipe` comment form of `:638-644` (the rule at `:997-1002`: the newest commit-form date equals it). **New test** `test/upstream/importRecipe.test.ts`: read the page, take the two lines that start `git clone --bare` and `git -C stamity-import.git push`, replace the upstream URL and `"$STAMITY_PRIVATE_URL.git"` with `file://` paths of temporary bare repositories, split each line into arguments (the one quoted refspec unquoted) and run it with `execFileSync` and no shell, then read the destination with `git for-each-ref --format=%(refname)`. Fixture upstream: `main` with two commits, an annotated `v1.0.0` and an annotated `replay-frozen-x` on `main`, an orphan `plugin-dist` carrying `plugins/v1.0.0`. **The census:** the new test reads `docs/enterprise-forks.md`, so `.stamity/change-classes.json`'s `testInputs` declares it (only `test/ci/testInputsGuard.test.ts` shows a miss). |
| `testCriteria` | **Given** the fixture upstream and an empty destination, **when** the two commands run, **then** the destination's refs are exactly `refs/heads/main`. **Given** a destination already holding `refs/heads/feature`, **then** it survives. **Given** the page, **then** the block contains `--single-branch --branch main --no-tags` and `'refs/heads/main:refs/heads/main'`, and no `--mirror` and no `refs/tags/`; `npx vitest run test/docsPages.test.ts` passes. |
| `edgeCases` | A copy imported with `--mirror` keeps its extra refs (the guide's sentence). The working clone's `git fetch upstream` follows tags locally (the sentence against `--tags`). In a fresh clone of the private repository that never fetched `upstream`, the tag name does not resolve; the guide already allows a SHA (`:120`). |
| `depends_on` | none |
| `verify` | `npx vitest run test/upstream/importRecipe.test.ts test/docsPages.test.ts test/ci/forkReleaseWorkflow.test.ts test/ci/testInputsGuard.test.ts && npm run lint && npm run typecheck` |

### f2-lane-release-tags-only — the lane fetches only the tags its pattern can select (lane A, after f1)

| Field | Content |
|---|---|
| `id` | f2-lane-release-tags-only |
| `requirements` | REQ-UPSTREAM-002 |
| `files` | `scripts/upstream.mjs`, `test/upstream/lane.test.ts`, `test/upstream/fixtures.ts`, `docs/enterprise-forks.md` (the `releases` row `:290` only) |
| `interfaces` | The persisted plan's f2 interfaces stand, every `scripts/upstream.mjs` line unmoved (`:180`, `:236`, `:308`, `:360-361`, `:368-390` with the cut `:370-375`, `:1013-1034`, `:1016-1017`, `:1020-1025`, `:1027-1030`, `:1036-1062` with "was ignored" `:1049`, `:1228`, `:1472-1480`, `:1928-1929`, `:2129`): the exported `releaseTagGlob(pattern)` and `releaseTagRefspec(pattern)`, the `git check-ref-format --refspec-pattern` check at config load (exit 2, its message), the exact pattern's `git ls-remote --exit-code --tags` first, the online-only sweep through one `git update-ref --stdin` batch. Two more: the namespace reader `:1247-1248` (`for-each-ref --merged`) reads the swept namespace unchanged; an explicit `--release <tag>` the pattern cannot select keeps today's message ("is not a release tag under the pattern", `:1220-1223`) — test the pattern before the fetched-tag lookup at `:1216-1218`. **The guide row** `docs/enterprise-forks.md:290` ("Which upstream tags count as releases.") gains "— and the only tags the lane fetches". **Tests** in `test/upstream/lane.test.ts`: the REQ-UPSTREAM-002 criteria; plant a `plugins/v1.1.0` tag on the shared upstream for the case and delete it after, the way `:1767-1769` plants `-evil` (never in the fixture's tag map, whose keys `:762` pins); `OFF_PATTERN_TAG` (`test/upstream/fixtures.ts:293`, created `:476`): after `status`, `refs/stamity-upstream/tags/nightly-2026-09-10` does not exist; the `-evil` case (`:1767-1772`) runs with `releases.pattern: "*"` and a `// TEST CHANGE, justified:` line naming this unit; `:835` passes unchanged. **The fold (build/368):** `createUnrelatedFork` (`test/upstream/fixtures.ts:560-566`) stops cloning the upstream and deleting `.git`: it builds the repository in a fresh directory with `git init` (default branch `main`), fills it with the upstream's `v1.0.0` tree exported without a clone (for example `git archive` to a file, then extracted), adds the fork's `.stamity/upstream.json` as `createFork` writes it, and makes one commit "imported without history"; before returning it asserts, and throws naming the broken one, that `git rev-list --count HEAD` is 1, that `git rev-list --max-parents=0 HEAD` equals `HEAD`, that the upstream's `v1.0.0` commit is absent (`git cat-file -e` fails), and that `git for-each-ref` lists `refs/heads/main` alone. The returned `ForkFixture` shape is unchanged. Windows-safe: no shell pipe. |
| `testCriteria` | The REQ-UPSTREAM-002 criteria as `lane.test.ts` cases; the `OFF_PATTERN_TAG` absence; the planted `plugins/v1.1.0` never reaches the namespace and an earlier run's ref is swept online, kept offline; `v?*` refused at load with exit 2 naming `releases.pattern` and no fetch; the exact pattern found and missing; a fork-owned `refs/tags/v1.1.0` unchanged; "names missing ancestry and attempts no merge for a fork with an unrelated history" (`:1398`) passes on the rebuilt fixture, its preconditions holding. |
| `edgeCases` | As persisted (multi-`*` patterns, shape-refused tags kept and reported, a pattern change mid-update, `prepare --offline`, an unreachable remote → the fetch's `LaneError`). |
| `depends_on` | f1-import-recipe (same lane; `docs/enterprise-forks.md`) |
| `verify` | `npx vitest run test/upstream test/docsPages.test.ts test/ci/testInputsGuard.test.ts test/architecture/boundaries.test.ts && npm run lint && npm run typecheck` |

### f3-nightly-canonical-guard — the nightly runs only in `zomarit/stamity` (lane B)

| Field | Content |
|---|---|
| `id` | f3-nightly-canonical-guard |
| `requirements` | REQ-PLUGIN-020 |
| `files` | `.github/workflows/nightly.yml`, `test/ci/workflow.test.ts`, `test/ci/forkIdentity.test.ts` |
| `interfaces` | **`nightly.yml`:** jobs `macos-smoke` (`:34`), `node-next` (`:70`) and `headless-lane` (`:111`) each gain the job-level `if: github.repository == 'zomarit/stamity'`; triggers (`:17-20`) and permissions (`:22-23`) unchanged; no `format('{0}', github.event.repository.private)` clause (the persisted plan's reason). **Pins:** the nightly describe (`test/ci/workflow.test.ts:1315-1337`) stays; add one case in the style of `describe("canonical distribution destinations")` (`:2596-2658`) with `evaluateWorkflowExpression` and `repositoryContext` (`:2583-2594`): each nightly job's `if` equals the guard string exactly, and evaluates true for `zomarit/stamity` and false for `acme/stamity-private`. **The census** `test/ci/forkIdentity.test.ts:209` (`{ route: 13 }`, compared `:235-239`, counting code literals only — titles and comments are stripped, `:131-136`) moves by exactly the code literals the new case adds, with the comment form of `:222-226`. `scripts/fork-identity.mjs` rewrites no workflow literal (`:28`, `:60`, `:62`, `:229`, `:237`), so a renamed fork keeps the canonical literal and the jobs stay skipped there. **CHANGELOG:** the bullet below lands through lane C. |
| `testCriteria` | **Given** `nightly.yml`, **then** each of the three jobs carries exactly the guard. **Given** the guard evaluated with `acme/stamity-private`, **then** false; with `zomarit/stamity`, **then** true. **Given** `test/ci/forkIdentity.test.ts`, **then** its census passes with the moved count. |
| `edgeCases` | As persisted. The later route deletion empties most of `headless-lane`'s steps; the job key and the guard stay, and the spec paragraph is re-homed when that requirement is rewritten. |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/workflow.test.ts test/ci/forkIdentity.test.ts test/ci/testInputsGuard.test.ts && npm run lint && npm run typecheck` |

### f4-retire-superseded-eval-inputs — the 145 files leave `main` behind a tag (lane C)

| Field | Content |
|---|---|
| `id` | f4-retire-superseded-eval-inputs |
| `requirements` | REQ-PROVE-009 |
| `files` | the 145 paths of f0 (deleted); `evals/README.md`; `CONTRIBUTING.md` (`:328-329` and the header only); `.github/release-controls-checklist.md` (`:223-226` only); `CHANGELOG.md` (the three bullets below) |
| `interfaces` | **1. The tag** is made by the orchestrator before dispatch: `git tag -a evals-retired-DATE -m "Superseded eval inputs retired from main by plan 014 file 1" 6dfa5ffe36890ee04e1d3d3508100b5974d47207`; its push waits for the maintainer. **2.** `git rm -r -q` the 15 path arguments. **3. `evals/README.md`:** the path table (`:16-38`) loses rows `:19-20` (`SET-v6.md`, `SET-v5.md`) and `:34-36` (the v3, v2 and v1 rows); `:31` keeps `cases-v5/**` and drops `coverage-exemptions-v5.md`, keeping its "58 … byte-identical and 20 moved" text (`test/evals/readmeCurrency.test.ts:110-147` reads that block); `:33` keeps `cases-v4/**` and drops `SET-v4.md` and `coverage-exemptions-v4.md`. Prose `:8` names what stays and the tag. One note per section, "(read at tag `evals-retired-DATE`)", where prose names retired files: `:73`, `:91`, the section "How three samples become a verdict" (`:321-345`, SET-v6 named at `:323`, `:343` — the rule's name "SET-v6" elsewhere stays), the section "The baselines stay put" (`:347-383`, the `fbf548c` paragraph `:367-380` with the four `cases-v2` filenames `:373-374`), `:524-525`. One retirement line: "Retired DATE: `SET-v1`…`SET-v6`, `rubric-v1`…`rubric-v3`, `coverage-exemptions-v3`…`-v5`, `cases/`, `cases-v2/`, `cases-v3/`. They read at tag `evals-retired-DATE` (commit `6dfa5ffe`); `git checkout 6dfa5ffe -- <paths>` restores them. The retained documents that name one of them (`rubric-v4.md`, `MODEL-PROFILES-v2.md`, `SET-v7.md`) read it at the tag." No new line states a count of fixtures (`test/evals/fixtureCount.test.ts:89-105` reads every "<number> … fixture(s)"). The four `readmeCurrency` rules (`:110-147`, `:151-162`, `:164-174`, `:176-184`) hold. **4. `CONTRIBUTING.md:328-329`:** "…`SET-v5.md`'s, retained as the baseline runs 19 to 21 were scored under." → "…`SET-v5.md`'s, retired from `main` on DATE; it reads at tag `evals-retired-DATE`." The rest of both lines unchanged. Header `:1` → the commit form with `c3d81529` and `Re-attested DATE against …` (lane A moves `REATTESTATION_DATE` to DATE; this lane does not touch `test/docsPages.test.ts`). **5. `.github/release-controls-checklist.md:223-226`:** the parenthetical naming `SET-v3.md`, `SET-v4.md`, `SET-v5.md` gains the tag note. **6. `CHANGELOG.md`**, under `## [Unreleased]`: in `### Changed` (after its last bullet, `:122`), f2's bullet and f3's bullet, texts as in the persisted plan's f2 and f3 interfaces; a new `### Removed` after `### Changed` and before `### Fixed`, holding the persisted f4 bullet with DATE and commit `6dfa5ffe`. House style: a bold one-sentence claim, then prose wrapped near 100 columns. **7. Never edited:** `evals/rubric-v4.md`, `evals/rubric-v5.md`, `evals/rubric-v6.md`, `evals/rubric-v7.md`, `evals/SET-v7.md`, `evals/MODEL-PROFILES-v2.md`, `evals/model-profiles-v2.json` (`"set": "evals/SET-v5.md"` is compared as a string at `test/evals/prospectiveCalibration.test.ts:118`), `.stamity/overrides/skills/st-eval-run/SKILL.md`, `.claude/skills/st-eval-run/SKILL.md` (its edit would trigger the release eval run), every historical run's `inputs.json`. |
| `testCriteria` | The orchestrator checks the tag: `git cat-file -t evals-retired-DATE` prints `tag`; `git ls-tree -r evals-retired-DATE -- <the 15 path arguments>` prints 145 rows whose sha256 equals f0's; its commit is an ancestor of `main`. **Given** the lane head, **then** `git ls-files -- <the 15 path arguments>` prints nothing, `git diff --name-status 6dfa5ffe HEAD -- evals` shows `D` for the 145 and `M` only for `evals/README.md`, and `git diff 6dfa5ffe HEAD -- evals/rubric-v4.md evals/rubric-v5.md evals/rubric-v6.md evals/rubric-v7.md evals/SET-v7.md` is empty. `test/evals/**` and the CHANGELOG links test pass. |
| `edgeCases` | As persisted. A README sentence naming a retired file inside a code span a test parses keeps the name and gains the tag note. |
| `depends_on` | f0-retirement-manifest |
| `verify` | `npx vitest run test/evals test/change test/ci/changelogLinks.test.ts test/ci/testInputsGuard.test.ts && npm run lint && npm run typecheck` (no `test/docsPages.test.ts` here: CONTRIBUTING's re-attested date matches `REATTESTATION_DATE` only once lane A is integrated) |

## Execution order

1. f0 — done.
2. The orchestrator makes the tag locally, then three lanes from the flake fix's head, one implementer each, parallel:
   A (f1 → f2), B (f3), C (f4). No lane runs the full suite.
3. A per-unit review (Opus 5.5, effort `high`) on each unit; the security lens where `gate classify` names the class.
4. Integration on branch `lean-repository`, then Prove: the spec delta (one spec-author), the class's gates on the final
   tree with the full suite alone under the machine lock, `npm run check`'s other steps, the whole-branch review on
   Fable 5.1.
5. The pull request (draft) and its CI to the end on every push; marked ready once at the end for the review bot. The
   tag's push and the merge wait for the maintainer. The title:
   `refactor(fork): lean imports, release-tag fetch, nightly guard and retired eval inputs`.

## Follow-ups (for the close)

- `docs/plans/016-fork-distribution-02.md:645-646` and `docs/plans/016-fork-distribution-03.md:880` assume an import
  that carries upstream's `v*` tags; plan 016's re-plan at its build reads them (a `when:` row at the close).
