---
id: lean-repository-01
intent: refactor
stamp: 9239379c39e2a4440581da1eaf6f7bb6a6ab204e 2026-10-01
reads: [docs/enterprise-forks.md, docs/specs/enterprise-upstream-lane.md, scripts/upstream.mjs, test/upstream/lane.test.ts, test/upstream/fixtures.ts, .github/workflows/nightly.yml, .github/workflows/release.yml, .github/workflows/docs-site.yml, .github/workflows/pack-signing-rehearsal.yml, test/ci/workflow.test.ts, test/ci/forkIdentity.test.ts, scripts/fork-identity.mjs, docs/specs/plugin-lifecycle.md, evals/README.md, evals/rubric-v5.md, evals/rubric-v6.md, evals/rubric-v7.md, evals/model-profiles-v2.json, test/evals/readmeCurrency.test.ts, test/evals/fixtureCount.test.ts, test/evals/rubricCoreHash.test.ts, scripts/eval/run.mjs, CONTRIBUTING.md, .github/release-controls-checklist.md, CHANGELOG.md, docs/specs/prove-behavior-and-value.md, docs/specs/orchestrator-context.md, test/docsPages.test.ts, test/ci/changelogLinks.test.ts]
---

# A lean repository — file 1 of 2: the fork fixes and the retired eval inputs

This file is self-contained. It is the first of two `/st-plan` artifacts that make the git repository lean for
enterprise forks and git-sourced installs without losing anything of the product. It holds four small, independent
changes and ships as its own pull request. File 2 (`docs/plans/014-lean-repository-02.md`) moves the records off
`main` and depends on this file.

intent chosen: refactor because the request is a structure change with the product's behaviour preserved (the npm
package, the plugin distribution, the APM content and the CLI do not change) and asks for a clean-up; no dependency
moves, so the migration intent does not fire.

## Context

An enterprise fork imports this repository's whole history and takes every release as a git merge
(`docs/enterprise-forks.md:56-125`, `scripts/upstream.mjs:2129`). Today the documented import copies every branch and
tag — `plugin-dist`, `plugins/v*`, `evidence-archive-*`, `replay-frozen-*` — because it uses `git push --mirror`
(`docs/enterprise-forks.md:106-107`), and the lane fetches every upstream tag on every run
(`scripts/upstream.mjs:1016-1017`), so each fork's object store collects the plugin snapshots with their zips (5.7 MiB
for four releases, measured at `9239379c`). The nightly workflow has no repository guard and runs on a schedule in any
private import that enables Actions (`.github/workflows/nightly.yml:17-20`). And 145 superseded eval inputs that no code
reads still sit on `main` (`evals/README.md:19-36`).

This file fixes those four. **Out of scope:** the records move (file 2), any history rewrite (never: it would break
every fork's merge base, npm provenance and the recorded commit ids), and a release cut.

## Decisions

### The maintainer's walk (2026-10-01; every answer the recommended option)

| Question | Answer |
|---|---|
| Where the records live | An orphan `records` branch in this repository (file 2). |
| How the maintainer's own records are written | In place at their usual paths, published by `scripts/records.mjs` (file 2). |
| Whether the "no records on `main`" check binds forks | Canonical repository only (file 2). |
| How it ships | Two pull requests, this file first; no release cut by this plan. |
| Whether the new records CI job blocks merges | Yes, in the canonical repository (file 2). |

### Settled by this plan (declared defaults; the maintainer may reverse any before the run starts)

1. **The import pushes `main` and `refs/tags/v*` explicitly** — no `--mirror` — so `plugin-dist`, `plugins/v*` and the
   archive, replay and retirement tags stay upstream, and the push deletes no destination ref.
2. **The lane validates `releases.pattern` with `git check-ref-format --refspec-pattern`** at config load (exit 2). That
   covers every character and sequence git refuses in a refspec (`?`, `[`, `\`, `~`, `^`, `:`, space, `..`, `@{`,
   control characters, a `.lock` component), not a hand-kept subset.
3. **A pattern with no `*` keeps today's outcome** when the tag is absent upstream: the lane asks
   `git ls-remote --tags` first and fetches the exact refspec only when the tag exists, so "no release tag matching"
   still reports (`scripts/upstream.mjs:1228`) instead of a fetch failure.
4. **The sweep deletes only namespace refs the pattern's glob does not match.** A tag inside the glob that fails the
   version shape (`vNext` under `v*`) stays, so the "was ignored" report keeps working (`scripts/upstream.mjs:1047-1050`).
5. **The nightly guard is the repository clause alone.** A `workflow_dispatch` in another repository is skipped too.
6. **The retirement tag is `evals-retired-<YYYY-MM-DD>`**, annotated, on the `main` commit the run starts from, and
   pushed before the pull request merges. Every restore command names the tag AND its commit sha, because an import of
   `main` plus `v*` tags (unit `f1-import-recipe`) carries the commit but not this tag.
7. **No rubric core byte and no `evals/SET-v7.md` byte moves.** Retired file names inside rubric cores stay as written
   and read at the tag: `evals/rubric-v7.md:143` (core ends at `## Calibration protocol`, `:148`; pinned by
   `test/evals/rubricCoreHash.test.ts`), `evals/rubric-v5.md:125` (boundary `:130`, pinned at
   `test/evals/manualRunner.test.ts:83`), `evals/rubric-v6.md:112` (boundary `:117`). Editing a core moves
   `rubricCoreHash`, which is part of the eval comparator key (`scripts/eval/run.mjs:92-97`).

## Behavioral invariants

| # | Invariant | Verified by | Status |
|---|---|---|---|
| 1 | The lane selects, previews and integrates the same releases under the default `v*` pattern | `npx vitest run test/upstream` | covered |
| 2 | Every eval input a code path reads stays on `main` (`SET-v7`, `cases-v6`, `cases-v4`, `cases-v5`, `rubric-v4`…`v7`, the model profiles, `coverage-exemptions-v6`, `price-list.json`) | `npm test` (the readmeCurrency, successorInputs, manualRunner, prospectiveCalibration and modelProfiles suites) | covered |
| 3 | No rubric core and no `SET-v7.md` byte moves | `test/evals/rubricCoreHash.test.ts`; the core pins in `test/evals/manualRunner.test.ts:83` | covered |
| 4 | Every retired file stays restorable byte-identical | unit `f0-retirement-manifest` captures the 145 blob ids before anything moves; `f4` proves the tag carries the same set | uncovered → unit 0 |
| 5 | The canonical nightly still schedules its three jobs | `f3`'s evaluation-table case | covered by `f3` |

## Spec delta

This slice modifies three existing specs; every `path:line` was read at `9239379c`. `/st-work` merges it at its Prove
phase. `<date>` is the merge date and `<unit>` the unit id.

### A. `docs/specs/enterprise-upstream-lane.md`

#### REQ-UPSTREAM-002 — Fetching into a namespace of its own (MODIFIED)

Replaces `docs/specs/enterprise-upstream-lane.md:181-182`, "`status`, `preview` and `integrate` fetch the upstream's
release tags and its default branch into refs the fork's own tags cannot collide with:". New text, up to
"`refs/stamity-upstream/heads/<branch>`"; the rest of the paragraph stays:

`status`, `preview` and `integrate` fetch the upstream's default branch and only the tags `releases.pattern` can
select, into refs the fork's own tags cannot collide with: `refs/stamity-upstream/tags/<tag>` (annotated tags are
peeled to their commits when compared) and `refs/stamity-upstream/heads/<branch>`.

- **The tag refspec** is cut from the pattern the way `parseReleaseTag` cuts it — the prefix before the first `*`, the
  suffix after the last — giving `+refs/tags/<prefix>*<suffix>:refs/stamity-upstream/tags/<prefix>*<suffix>`. A
  pattern with no `*` gives an exact refspec, fetched only when `git ls-remote --tags` finds the tag upstream.
- **The sweep.** After an online fetch, every ref under `refs/stamity-upstream/tags/` whose name does not match
  `<prefix>*<suffix>` is deleted, which clears the `plugins/v*` refs that earlier runs fetched (`--prune` alone never
  removes a ref outside its own refspec). `--offline` fetches nothing and sweeps nothing.
- **Refused patterns.** A `releases.pattern` that `git check-ref-format --refspec-pattern refs/tags/<pattern>` refuses
  is a config error at load (exit 2).

(Amended `<date>`, plan 014 file 1, unit `<unit>`; it read "fetch the upstream's release tags and its default branch".)

- **Evidence:** the fetch is at `scripts/upstream.mjs:1013-1034`, the tag refspec `+refs/tags/*:${REF_NAMESPACE}/tags/*`
  at `:1016-1017` under `--prune`; the prefix/suffix cut at `:370-375`; `releases.pattern` is checked only as a
  non-empty string (`:308`); config errors exit 2 (`docs/specs/enterprise-upstream-lane.md:166-167`); the canonical
  repository cuts `plugins/v<version>` tags (`package.json`, `stamity.distribution.tagPattern`).
- **Proof:** tests in `test/upstream/`, and the guide.

Criteria:
- GIVEN an upstream with `v1.0.0`, `v1.1.0` and `plugins/v1.1.0` and the default pattern WHEN `status` runs THEN
  `git for-each-ref refs/stamity-upstream/tags/` lists `v1.0.0` and `v1.1.0` and no `plugins/` ref.
- GIVEN a fork holding `refs/stamity-upstream/tags/plugins/v1.0.0` from an earlier run WHEN `status` runs online THEN
  that ref is gone; a second run leaves the `for-each-ref` output byte-identical; WHEN `status --offline` runs instead
  THEN the ref is still there.
- GIVEN `releases.pattern: "v*-acme"` THEN the fetched refs are exactly the upstream tags matching that glob. GIVEN
  `"v1.2.0"` with that tag upstream THEN only that tag is fetched; without it THEN the run reports "no release tag
  matching" as before.
- GIVEN a pattern `git check-ref-format --refspec-pattern` refuses (for example `v?*`) WHEN any verb loads the config
  THEN it exits 2 naming `releases.pattern`, and no `git fetch` runs.
- GIVEN a fork-owned `refs/tags/v1.1.0` that points elsewhere WHEN any verb runs THEN that ref is unchanged.

#### REQ-UPSTREAM-014 — Portable clones and platform limits are documented, not assumed (MODIFIED)

Replaces `docs/specs/enterprise-upstream-lane.md:467-469`, "so the private case is a mirror clone pushed to a new
repository with its history and none of the fork features (`Sync fork`, the merge-upstream endpoint, pull requests to
upstream, `gh repo sync`);". New text:

…so the private case is a single-branch bare clone of upstream `main`, pushed to a new repository as `refs/heads/main`
plus `refs/tags/v*`, with that history and none of the fork features (`Sync fork`, the merge-upstream endpoint, pull
requests to upstream, `gh repo sync`). The import uses no `--mirror`, so it creates no other branch or tag in the
destination — `plugin-dist`, `plugins/v*`, `evidence-archive-*`, `replay-frozen-*` and `evals-retired-*` stay
upstream — and deletes no destination ref. (Amended `<date>`, plan 014 file 1, unit `<unit>`; it read "a mirror clone
pushed to a new repository with its history".)

- **Evidence:** the guide runs `git clone --bare` then `push --mirror` (`docs/enterprise-forks.md:106-107`) and says the
  import "imports branches and tags" and "Do not repeat `push --mirror` after customization. It would replace your
  downstream refs." (`:121-125`).
- **Proof:** a fixture run of the guide's two git commands (a doc example comes from a run), and the docs pins.

Criteria:
- GIVEN the guide's import block WHEN read THEN it clones bare and single-branch at `main`, pushes exactly
  `refs/heads/main` and `refs/tags/v*`, and contains no `--mirror`.
- GIVEN a fixture upstream carrying `main`, `plugin-dist`, `v1.0.0`, `plugins/v1.0.0` and an annotated
  `replay-frozen-x` on `main`, and an empty destination, WHEN the block's two git commands run THEN the destination's
  refs are exactly `refs/heads/main` and the `v*` tags reachable from `main`.
- GIVEN a destination already holding `refs/heads/feature` WHEN the push runs THEN `feature` survives.

### B. `docs/specs/prove-behavior-and-value.md`

#### REQ-PROVE-009 — Eval set v7 with cases-v6 (MODIFIED)

Section banner, as the first line under the heading (precedent `docs/specs/orchestrator-context.md:564`):

> The superseded eval inputs were deleted on `<date>`. Every path below under `evals/SET-v1.md`…`SET-v6.md`,
> `evals/rubric-v1.md`…`rubric-v3.md`, `evals/coverage-exemptions-v3.md`…`-v5.md`, `evals/cases/`, `evals/cases-v2/`
> or `evals/cases-v3/` reads at tag `evals-retired-<date>`.

Replaces `docs/specs/prove-behavior-and-value.md:237-239`, "`evals/cases-v6/**` and `evals/SET-v7.md` are the current
set; SET-v6, `cases-v5` and earlier stay retained and unchanged (`evals/README.md:8`, `:28-30`). The four thresholds and
SET-v6's scoring rule carry over verbatim (`evals/SET-v6.md:82-87`); every gate under `test/evals/` reads the new
constants." New text:

`evals/cases-v6/**` and `evals/SET-v7.md` are the current set. `cases-v4/`, `cases-v5/`, `rubric-v4.md`…`rubric-v7.md`
and the model profiles stay on `main`, unchanged. The superseded inputs no code reads — `SET-v1.md`…`SET-v6.md`,
`rubric-v1.md`…`rubric-v3.md`, `coverage-exemptions-v3.md`…`-v5.md`, `cases/`, `cases-v2/` and `cases-v3/` — leave the
tree behind the annotated tag `evals-retired-<date>`, placed on a `main` commit that still carries them; they are read
at that tag, and `git checkout <that commit> -- <path>…` restores them. The four thresholds and SET-v6's scoring rule
carry over verbatim (`evals/SET-v6.md:82-87`, read at the tag); every gate under `test/evals/` reads the new constants;
no rubric core and no `SET-v7.md` byte moves. (Amended `<date>`, plan 014 file 1, unit `<unit>`; it read as quoted
above.)

- **Evidence:** the retained-baseline rows are `evals/README.md:8`, `:19-20`, `:31-36`; the precedent is
  `CHANGELOG.md:301-305` and `docs/specs/orchestrator-context.md:575-582`. The two citations this section already
  carries stale (`evals/README.md:28-30` now points at the cases-v6 rows; checklist `:228-233` at the Codex preflight)
  are corrected in the same edit.
- **Proof:** the full gate and `test/evals/rubricCoreHash.test.ts`; docs (`evals/README.md`, the CHANGELOG).

Criteria:
- GIVEN tag `evals-retired-<date>` THEN `git cat-file -t` reads `tag`, `git ls-tree -r --name-only` at it lists every
  retired path (145), and its commit is an ancestor of `main`.
- GIVEN `git diff --name-status <base> HEAD -- evals` THEN every retired path reads `D` and the only other changed path
  is `evals/README.md`.
- GIVEN `evals/SET-v7.md` and the rubric files THEN `git diff <base> HEAD` over them is empty and
  `rubricCoreHash.test.ts` passes.
- GIVEN the tree after the deletion WHEN `npm run lint && npm run typecheck && npm test` runs THEN it exits 0 — the
  proof that nothing reads a retired path.
- GIVEN `evals/README.md` THEN the retirement line names the tag and its commit, and no relative link targets a path
  the tree lacks.

**Non-goal (MODIFIED).** Replaces `docs/specs/prove-behavior-and-value.md:617`, "Editing retained eval baselines:
SET-v1…v6 and `cases/`…`cases-v5` stay byte-identical (`…:28-30`)." New text: "Editing retained eval baselines.
`cases-v4/`, `cases-v5/` and `rubric-v4.md`…`rubric-v7.md` stay byte-identical on `main`; SET-v1…v6, rubric-v1…v3,
coverage-exemptions-v3…v5, `cases/`, `cases-v2/` and `cases-v3/` stay byte-identical at tag `evals-retired-<date>`,
which is their record. Removing them from `main` does not edit them."

### C. `docs/specs/plugin-lifecycle.md`

#### REQ-PLUGIN-020 — the nightly guard (MODIFIED, appended paragraph)

Appended after `docs/specs/plugin-lifecycle.md:908`:

Amended `<date>` (plan 014 file 1, unit `<unit>`). Nightly's `headless-lane` job, which carries the invocation legs,
runs only where `github.repository == 'zomarit/stamity'`; in any other repository the job is skipped before its first
step, so a fork holding all four secrets drives no leg. "Nightly's drive step carries the invocation legs behind four
secrets" (`:905-906`) therefore holds in the canonical repository only. The credential-free half in `ci.yml`'s
`plugin-route` job is unchanged. `macos-smoke` and `node-next` carry the same guard; no requirement covers those two
jobs.

- **Evidence:** `.github/workflows/nightly.yml:111` (`headless-lane`), `:34` (`macos-smoke`) and `:70` (`node-next`)
  carry no job-level `if:`; the drive steps are at `:375-471`.
- **Proof:** `test/ci/workflow.test.ts`.

Criteria:
- GIVEN `nightly.yml` THEN `macos-smoke`, `node-next` and `headless-lane` each carry exactly
  `if: github.repository == 'zomarit/stamity'`.
- GIVEN that guard evaluated with `github.repository` = `acme/stamity-private` THEN it reads false; with
  `zomarit/stamity` THEN true.

## Units

No unit touches `content/**`, so no eval case moves and no dogfood sync runs.

### f0-retirement-manifest — capture the 145 retiring files before anything moves

| Field | Content |
|---|---|
| `id` | f0-retirement-manifest |
| `requirements` | REQ-PROVE-009 |
| `files` | the executing run's own record only (`.stamity/runs/<run>/record.md`) |
| `interfaces` | **The 145 paths** (counts measured at `9239379c`): `evals/SET-v1.md`, `evals/SET-v2.md`, `evals/SET-v3.md`, `evals/SET-v4.md`, `evals/SET-v5.md`, `evals/SET-v6.md` (6); `evals/rubric-v1.md`, `evals/rubric-v2.md`, `evals/rubric-v3.md` (3); `evals/coverage-exemptions-v3.md`, `evals/coverage-exemptions-v4.md`, `evals/coverage-exemptions-v5.md` (3); `evals/cases/**` (35); `evals/cases-v2/**` (35); `evals/cases-v3/**` (63). **Capture:** with `<base>` = the `main` commit the run starts from, `git ls-tree -r <base> -- <the 15 path arguments above>` prints one `<mode> blob <oid>\t<path>` row per file; the record keeps the row count, the sha256 of that output, and `<base>`. **Reader re-check:** `git grep -n -E "SET-v[1-6]\.md\|rubric-v[1-3]\.md\|coverage-exemptions-v[3-5]\.md\|evals/cases(-v[23])?/" <base> -- scripts src test .github vitest.config.ts package.json` — every hit is classified in the record as a comment, a prose string or a string pin (`test/evals/prospectiveCalibration.test.ts:118` compares the string `"evals/SET-v5.md"` and reads no file). |
| `testCriteria` | **Given** `<base>`, **when** the capture runs, **then** it prints exactly 145 rows. **Given** the reader re-check, **then** no hit opens a retiring path (`readFileSync`, `readdirSync`, `existsSync`, a `join(` or `resolve(` over it, or a glob that matches it). |
| `edgeCases` | A file was added under a retiring folder after `9239379c` → the count differs: stop and re-plan `f4`'s list rather than retire a file this plan never named. A hit is a real reader → stop; `f4` does not start until that reader moves to a surviving input. |
| `depends_on` | none |
| `verify` | the capture command prints 145 rows and the reader re-check finds no reader |

### f1-import-recipe — the private import takes `main` and the release tags only

| Field | Content |
|---|---|
| `id` | f1-import-recipe |
| `requirements` | REQ-UPSTREAM-014 |
| `files` | `docs/enterprise-forks.md` (the import section `:92-125` and the page header), `test/upstream/importRecipe.test.ts` (new), `test/docsPages.test.ts` (`REATTESTATION_DATE` only) |
| `interfaces` | **Current block** (`docs/enterprise-forks.md:104-114`): `:106` `git clone --bare https://github.com/zomarit/stamity stamity-import.git`; `:107` `git -C stamity-import.git push --mirror "$STAMITY_PRIVATE_URL.git"`; `:108-113` clone the private copy, `git remote add upstream https://github.com/zomarit/stamity`, `git fetch upstream`, `STAMITY_BASELINE_TAG='v1.8.0'`, `git merge-base --is-ancestor "$STAMITY_BASELINE_TAG" HEAD`. **New `:106-107`:** `git clone --bare --single-branch --branch main https://github.com/zomarit/stamity stamity-import.git` and `git -C stamity-import.git push "$STAMITY_PRIVATE_URL.git" 'refs/heads/main:refs/heads/main' 'refs/tags/v*:refs/tags/v*'`. `:108-113` stay; the `merge-base --is-ancestor "$STAMITY_BASELINE_TAG" HEAD` line is pinned at `test/docsPages.test.ts:2209-2213`. **Prose `:120-125`** says the duplication "follows GitHub's own bare-clone procedure … it imports branches and tags without the pull-request refs GitHub rejects on push", keeps the bare import as a backup, and warns "Do not repeat `push --mirror` after customization. It would replace your downstream refs." Rewrite: the import copies `main` and the release tags only — not `plugin-dist`, `plugins/v*` or the evidence-archive, replay and retirement tags — and the push deletes nothing at the destination; keep the backup sentence; replace the `--mirror` warning with "Every later update comes through the upstream lane."; add one sentence for a copy imported with the old recipe: deleting `plugin-dist`, `plugins/v*` and the other non-release refs there is optional. `:95-96` and `:236-237` (historical tags carry old workflows) stay true. **Header:** `:5` carries the cut form ("verified against the tree at the 1.11.0 release cut (2026-10-01)"); an edit between cuts moves it to the commit form `Re-attested <date>` (regex `test/docsPages.test.ts:431`), and `REATTESTATION_DATE` (`:597`, now `"2026-10-01"`) must equal the newest commit-form date (`:924-929`). **New test** `test/upstream/importRecipe.test.ts`: read the page, take the two lines starting `git clone --bare` and `git -C stamity-import.git push`, substitute the upstream URL and `$STAMITY_PRIVATE_URL` with `file://` paths of temp bare repositories, run them with `execFileSync` (no shell), and read the destination with `git for-each-ref --format=%(refname)`. Fixture upstream: `main` with two commits, annotated `v1.0.0` and annotated `replay-frozen-x` on `main`, an orphan `plugin-dist` with `plugins/v1.0.0` on it. |
| `testCriteria` | **Given** the fixture upstream and an empty destination, **when** the two commands run, **then** the destination's refs are exactly `refs/heads/main` and `refs/tags/v1.0.0`. **Given** a destination that already holds `refs/heads/feature`, **then** `feature` survives the push. **Given** the page, **then** its import block contains `--single-branch --branch main`, `refs/tags/v*` and no `--mirror`, and `npx vitest run test/docsPages.test.ts` passes. |
| `edgeCases` | The bare single-branch clone brings no tags on some git version → the test's destination lacks `v1.0.0`; add the line `git -C stamity-import.git fetch origin 'refs/tags/v*:refs/tags/v*'` between the two commands, in the page and the test together. A `v*`-shaped tag that is not a release (none upstream today) would be imported; harmless, since the lane's `releases.pattern` still decides. A copy imported with `--mirror` keeps its extra refs until its owner deletes them; nothing in the lane reads them. |
| `depends_on` | none |
| `verify` | `npx vitest run test/upstream/importRecipe.test.ts test/docsPages.test.ts` |

- Inbox fold (2026-10-08, run 2026-10-08_inbox-pass): ``"plan 014's import recipe still pushes plain upstream `v*` tags" at 077e8a78`` — pushes `main` only.

### f2-lane-release-tags-only — the lane fetches only the tags its pattern can select, and sweeps the rest once

| Field | Content |
|---|---|
| `id` | f2-lane-release-tags-only |
| `requirements` | REQ-UPSTREAM-002 |
| `files` | `scripts/upstream.mjs`, `test/upstream/lane.test.ts`, `test/upstream/fixtures.ts`, `docs/enterprise-forks.md` (the `releases` row at `:273` only), `CHANGELOG.md` |
| `interfaces` | **Current** (`scripts/upstream.mjs`): `REF_NAMESPACE = 'refs/stamity-upstream'` (`:180`); `fetchUpstream` (`:1013-1034`) runs `['fetch', '--no-tags', '--prune', '--quiet', config.remote, `+refs/tags/*:${REF_NAMESPACE}/tags/*`]` (`:1016-1017`) then the branch fetch (`:1027-1030`, unchanged); a failure throws `LaneError` "fetch from … failed" (`:1020-1025`). `parseReleaseTag` (`:368-390`): prefix = text before the first `*`, suffix = text after the last `*` (a middle `*` is ignored and the span becomes the version core); no `*` → exact match; the core must match `VERSION_SHAPE` (`:360-361`, optional leading `v`). The pattern is validated only as a non-empty string (`:308`); default `v*` (`:236`). `listUpstreamTags` (`:1036-1061`) reads every namespace ref and reports shape-refused tags as "tag … was ignored" (`:1047-1050`). **New, exported for tests:** `releaseTagGlob(pattern) → { prefix, suffix, exact }` — the one cut, also used by `parseReleaseTag`; `releaseTagRefspec(pattern) → string` = `+refs/tags/<prefix>*<suffix>:refs/stamity-upstream/tags/<prefix>*<suffix>`, or `+refs/tags/<pattern>:refs/stamity-upstream/tags/<pattern>` when `exact`. **Config load** (`:308`): run `git check-ref-format --refspec-pattern refs/tags/<prefix>*<suffix>` (or `refs/tags/<pattern>` when exact); non-zero → config error, exit 2, message `releases.pattern "<value>" is not a tag pattern git accepts (git check-ref-format refused refs/tags/<…>)`. **Exact pattern:** `git ls-remote --exit-code --tags <remote> refs/tags/<pattern>` first; exit 2 → no fetch, and the existing "no release tag matching" outcome (`:1228`); exit 0 → fetch the exact refspec. **Sweep** (online only, after a successful fetch): `git for-each-ref --format=%(refname) refs/stamity-upstream/tags/`, then one `git update-ref --stdin` batch of `delete <ref>` lines for every ref whose tag name does not match `<prefix>*<suffix>` (exact: does not equal the pattern). **Guide:** `docs/enterprise-forks.md:273` (`releases` row, "Which upstream tags count as releases") gains "— and the only tags the lane fetches". **CHANGELOG:** there is no `## [Unreleased]` heading today; add one above `## [1.11.0] - 2026-10-01` (`CHANGELOG.md:32`) — `[Unreleased]` is already defined in the footer (`:1429`) and `test/ci/changelogLinks.test.ts:76-100` skips it — with a `### Changed` bullet in the house style (bold one-sentence claim, then plain prose wrapped near 100 columns): "**The upstream lane fetches only the tags its release pattern can select.** It used to fetch every upstream tag, so each fork's object store collected the plugin distribution snapshots under `plugins/v*`; the first run after this change deletes those refs from the lane's namespace, and a pattern git cannot use as a refspec is refused at load." |
| `testCriteria` | The criteria of REQ-UPSTREAM-002 above, as `test/upstream/lane.test.ts` cases over the fixtures in `test/upstream/fixtures.ts`; plus: **given** `OFF_PATTERN_TAG` (`"nightly-2026-09-10"`, created at `test/upstream/fixtures.ts:289,468-472`), **when** `status` runs, **then** `refs/stamity-upstream/tags/nightly-2026-09-10` does not exist. **Re-pin:** the case at `test/upstream/lane.test.ts:1766-1771` plants upstream tag `-evil` and expects `tag "-evil" was ignored: …`; under `v*` that tag is never fetched, so run that case with `releases.pattern: "*"` (the refspec is then `refs/tags/*`, and `VERSION_SHAPE`'s optional `v` keeps the fixture's tags parseable), with the house `TEST CHANGE, justified:` comment naming this unit. The case at `:834` (`refs/stamity-upstream/tags/v1.1.0` resolves to the upstream commit) passes unchanged. |
| `edgeCases` | A multi-`*` pattern (`v*-*-final`) → one `*` refspec covering the same set `parseReleaseTag` accepts. A tag inside the glob that fails `VERSION_SHAPE` stays in the namespace and is reported "ignored". An update branch whose release tag a later pattern change no longer covers → `continue`, `validate` and `abort` read `releaseFromTag` (`:1472-1480`) and report "not among the fetched upstream tags"; a pattern change mid-update is the operator's act. `prepare --offline` counts namespace refs (`:1928`); after a sweep at least one remains whenever a release exists. A remote unreachable during `ls-remote` → the same `LaneError` as a failed fetch. |
| `depends_on` | f1-import-recipe |
| `verify` | `npx vitest run test/upstream && npm run lint && npm run typecheck` |

- Inbox fold (2026-10-08, run 2026-10-08_inbox-pass): `2026-09-23_orchestrator-context/build/368` — finds why an unrelated fork's history once read `update-available`, with a deterministic test.

### f3-nightly-canonical-guard — the nightly runs only in `zomarit/stamity`

| Field | Content |
|---|---|
| `id` | f3-nightly-canonical-guard |
| `requirements` | REQ-PLUGIN-020 |
| `files` | `.github/workflows/nightly.yml`, `test/ci/workflow.test.ts`, `test/ci/forkIdentity.test.ts`, `CHANGELOG.md` |
| `interfaces` | **Current:** `nightly.yml` triggers `schedule` (cron `0 4 * * *`, `:18-19`) and `workflow_dispatch`; jobs `macos-smoke` (`:34`), `node-next` (`:70`), `headless-lane` (`:111`) carry no `if:`; permissions `contents: read` (`:22-23`). **New:** each of the three jobs carries the job-level `if: github.repository == 'zomarit/stamity'` (GitHub has no workflow-level `if`). The other upstream-only guards add `format('{0}', github.event.repository.private) == 'false'` (`release.yml:83,558,654`; `docs-site.yml:153-156`; `pack-signing-rehearsal.yml:30,101,192`); that clause is left out here because GitHub lists the `schedule` webhook payload as "Not applicable", so on a scheduled run it could read false and stop the canonical nightly too. **Pins:** `test/ci/workflow.test.ts:989-1011` (job keys exactly `["macos-smoke","node-next","headless-lane"]`, no `needs`, the two triggers, the cron) stay; add one case in the evaluation-table style of `:2276-2299`: each nightly job's `if` string equals the guard, and evaluating it with `github.repository` = `zomarit/stamity` runs, `acme/stamity-private` skips. `test/ci/forkIdentity.test.ts:209` pins the number of canonical `zomarit/stamity` literals in `test/ci/workflow.test.ts` (`{ route: 13 }`, compared at `:235-239`); move that count by exactly the literals the new case adds, with a one-line reason. `scripts/fork-identity.mjs` rewrites no workflow literal (it writes `package.json` identity keys at `:59`, runs two generators at `:61`, retargets `renovate/plugins.json` and `renovate/companion.json` at `:237`, `:245`), so a renamed fork keeps the canonical literal and the jobs stay skipped there. **CHANGELOG** `### Changed` bullet under `## [Unreleased]`: "**The nightly workflow runs only in `zomarit/stamity`.** A private import that enables Actions no longer runs the macOS smoke, the next-Node leg or the client drive on a schedule." |
| `testCriteria` | **Given** `nightly.yml`, **then** each of the three jobs carries exactly `if: github.repository == 'zomarit/stamity'`. **Given** the guard evaluated with `acme/stamity-private`, **then** it reads false; with `zomarit/stamity`, **then** true. **Given** `test/ci/forkIdentity.test.ts`, **then** its census passes with the moved count. |
| `edgeCases` | A `workflow_dispatch` in another repository → skipped (declared). A renamed fork after `scripts/fork-identity.mjs` → still skipped, the literal is not rewritten. `ci.yml`'s weekly schedule (`ci.yml:116-117`) stays unguarded — a fork's own CI is the fork's business (inbox row). |
| `depends_on` | f2-lane-release-tags-only |
| `verify` | `npx vitest run test/ci/workflow.test.ts test/ci/forkIdentity.test.ts` |

### f4-retire-superseded-eval-inputs — the 145 files leave `main` behind a tag

| Field | Content |
|---|---|
| `id` | f4-retire-superseded-eval-inputs |
| `requirements` | REQ-PROVE-009 |
| `files` | the 145 paths listed in `f0-retirement-manifest` (deleted); `evals/README.md`; `CONTRIBUTING.md` (`:297-298`); `.github/release-controls-checklist.md` (`:198`); `CHANGELOG.md` |
| `interfaces` | **1. Tag first.** `git tag -a evals-retired-<YYYY-MM-DD> -m "Superseded eval inputs retired from main by plan 014 file 1" <base>` with `<base>` from `f0`, then `git push origin evals-retired-<YYYY-MM-DD>` — outward-facing, so the maintainer approves the push. The `release-tags` ruleset covers `refs/tags/v*` only (`.github/release-controls-checklist.md:163`), so this tag is outside it. **2.** `git rm -r -q` the 145 paths. **3. `evals/README.md`:** the path table (`:16-38`) loses rows `:19-20` and `:34-36` (`rubric-v1`…`v3`); grouped rows keep their surviving files only — `:31` keeps `cases-v5/` and drops `coverage-exemptions-v5`, `:33` keeps `cases-v4/` and drops `SET-v4` and `coverage-exemptions-v4`. Prose `:8` ("v6, v5, v4, v3, v2 and v1 are retained beside it") names what stays and the tag. Prose naming retired files (`:73`, `:91`, `:342-373` including the four `cases-v2` filenames at `:365-367`, `:505-506`) gets one note per section, "(read at tag `evals-retired-<date>`)", not per-name rewrites. One retirement line: "Retired `<date>`: `SET-v1`…`SET-v6`, `rubric-v1`…`rubric-v3`, `coverage-exemptions-v3`…`-v5`, `cases/`, `cases-v2/`, `cases-v3/`. They read at tag `evals-retired-<date>` (commit `<base>`); `git checkout <base> -- <paths>` restores them." Rules `test/evals/readmeCurrency.test.ts` holds: exactly one row naming `rubric-v7.md` says "current rubric" (`:151-162`); no other `rubric-vN.md` row says it (`:164-174`); some row contains `stamity-claude-cli-v1` (`:176-184`, row `:37` today, unchanged here); the "N moved" carried-block count from `cases-v5` against `cases-v6` (`:110-147`) — both stay. `test/evals/fixtureCount.test.ts:89-105` is unaffected. **4.** `CONTRIBUTING.md:297-298` ("The strict three-of-three rule it replaced is `SET-v5.md`'s, retained as the baseline runs 19 to 21 were scored under.") → "…`SET-v5.md`'s, retired from `main` on `<date>`; it reads at tag `evals-retired-<date>`." **5.** `.github/release-controls-checklist.md:198` names `SET-v3`/`SET-v4`/`SET-v5` → the same tag note. **6. CHANGELOG** `### Removed` under `## [Unreleased]`: "**The superseded eval inputs.** `SET-v1`…`SET-v6`, `rubric-v1`…`rubric-v3`, `coverage-exemptions-v3`…`-v5` and `cases/`, `cases-v2/`, `cases-v3/` leave the tree; no script, test or source read them. Tag `evals-retired-<date>` (commit `<base>`) keeps them, and `git checkout <base> -- <paths>` restores them. These were repository surfaces: the published package never carried them." **7. Never edited:** `evals/rubric-v7.md`, the cores of `rubric-v5.md` and `rubric-v6.md`, `evals/SET-v7.md`, `evals/MODEL-PROFILES-v2.md`, `evals/model-profiles-v2.json` (`"set": "evals/SET-v5.md"`, compared as a string at `test/evals/prospectiveCalibration.test.ts:118`), `.stamity/overrides/skills/st-eval-run/SKILL.md` (an eval-runner input, `scripts/eval/run.mjs:9-10`), and the historical runs' `inputs.json` (records; their pinned candidate commits still resolve the old bytes because history is kept). **8.** The spec banner and the REQ-PROVE-009 text land at the Prove phase. |
| `testCriteria` | **Given** the tag, **then** `git cat-file -t evals-retired-<date>` prints `tag`, `git ls-tree -r --name-only evals-retired-<date> -- <the 15 path arguments> \| wc -l` prints 145 and its output's sha256 equals `f0`'s, the tag's commit is an ancestor of `main`, and `git ls-remote --tags origin evals-retired-<date>` prints one line before the pull request merges. **Given** the PR head, **then** `git ls-files -- <the 15 path arguments>` prints nothing and `git diff --name-status <base> HEAD -- evals` shows `D` for the 145 and `M` only for `evals/README.md`. **Given** the PR head, **when** `npm run lint && npm run typecheck && npm test` runs, **then** it exits 0. **Given** `evals/rubric-v5.md`, `evals/rubric-v6.md`, `evals/rubric-v7.md` and `evals/SET-v7.md`, **then** `git diff <base> HEAD` over them is empty. |
| `edgeCases` | The pull request is abandoned after the tag is pushed → the tag stays and stays harmless: it names a `main` commit. The PR is rebase-merged → the tag still names `<base>`, which carries the files. A fork imported with `f1`'s recipe lacks this tag → the README line and the CHANGELOG name the commit sha too. A section of `evals/README.md` names a retired file inside a code span the tests parse → keep the name and add the tag note; never rename a parsed row's path to one that does not exist. |
| `depends_on` | f0-retirement-manifest, f3-nightly-canonical-guard |
| `verify` | `npm run lint && npm run typecheck && npm test`, then the tag commands above |

## Execution order

1. **`f0-retirement-manifest`** first: it fixes `<base>` and the 145 blob ids.
2. **`docs/enterprise-forks.md`:** `f1-import-recipe` → `f2-lane-release-tags-only`.
3. **`CHANGELOG.md`** has one writer at a time: `f2` → `f3-nightly-canonical-guard` → `f4-retire-superseded-eval-inputs`.
4. **`f4`** pushes its tag (maintainer approval) before the pull request is opened for merge.
5. **The gates:** `npm run lint && npm run typecheck && npm run test`, then `npm run check`; CI's coverage and Windows legs are required (the local gate does not run them). The pull-request title is a conventional-commit subject, for example `refactor(fork): lean imports, release-tag fetch, nightly guard and retired eval inputs`.

## Risks

| Risk | Severity | Guard |
|---|---|---|
| A bare single-branch clone brings no tags on some git version, so the new recipe imports `main` without its release tags | Warning | `f1`'s fixture test proves the destination's refs; the explicit tag fetch line is the named fallback |
| The retirement tag is missing on the remote when the pull request merges, so the restore pointer dangles | Warning | `f4`'s criterion runs `git ls-remote --tags` before merge; the README and the CHANGELOG also name the commit sha |
| A README rewording touches a rubric core and moves `rubricCoreHash`, which blocks the next incremental eval composition | Warning | the cores are on the never-edited list; `test/evals/rubricCoreHash.test.ts` and the core pins in `test/evals/manualRunner.test.ts` fail on any core byte |
| A fork with a custom pattern and an update branch in flight loses that branch's release tag after a pattern change | Minor | the run reports "not among the fetched upstream tags"; changing the pattern mid-update is the operator's act, and the guide row says the pattern bounds the fetch |
| Copies imported earlier with `--mirror` keep `plugin-dist` and the other non-release refs | Minor | the guide's optional clean-up sentence; nothing in the lane reads them |

## Open questions

None. Every reading the research opened is settled above, and the maintainer answered the five questions of the walk.

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

- `.github/workflows/ci.yml` — the weekly `schedule` trigger (`:116-117`) runs full CI in any private import that
  enables Actions; decide whether forks want it before guarding it.

## Drop list

| Item | Why dropped | What would bring it back |
|---|---|---|
| Rewriting history to drop the 10 MiB of raw eval files still in it | Breaks every fork's merge base, every recorded commit id and the commits npm provenance links; the whole import is 31 MiB, far under GitHub's 1 GB guidance | Never |
| Git LFS for large evidence | `push --mirror` and the new import carry no LFS objects; forks spend the parent's bandwidth; Claude Code never downloads LFS content | A single file over GitHub's 100 MB limit |
| `.gitattributes export-ignore` for non-product paths | Only `git archive` and GitHub's source archives honour it; APM and the plugin clients clone | A supported install route that downloads GitHub archives |
| Guarding `ci.yml`'s weekly schedule | A fork's own CI cadence is the fork's decision | A fork asks for it (inbox row above) |
