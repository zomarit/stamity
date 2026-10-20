# The 1.16.0 cut's checklist lines — in-flow units

Written 2026-10-20 at about 10:03Z by the orchestrator. Its sources:
- `.github/release-controls-checklist.md`, "Per-release record currency": a minor runs every line;
- the 1.15.0 cut's plan, `.stamity/runs/2026-10-14_cli-native/plan-cut.md` on the `records` branch;
- the 1.15.0 cut's commits `18aadc98`, `738a261f`, `7c2ff192`, `6bc07bb8`, `e352c427`, `ea5e4ade`, `cc42e842`,
  `c6c21dec` and `b2c86071`.

The release candidate is `035f078d`, the head eval run 51 measured. Run 51 is composed with run 50, PASS, published on
`records` at `48a66165`. The bump to 1.16.0 moves no file in the eval line's trigger list: the version string
appears in neither eval skill copy, in no `content/` file and not in the cross-client goldens. So run 51 stays the run
of record.

The units run in the lane `cut`: local branch `f3/cut`, worktree `.stamity-worktrees/stamity/cut`, based on
`035f078d`. Writers run one at a time in that lane, and the re-attestation passes write nothing. The lane folds onto
`feat/cloud-runs-2` by fast-forward, and the cut's commits reach #113 in one push before the maintainer's merge.

Landing order:
1. The lane gets `c1`, then `c5` after the `c4` passes.
2. `records` gets the merge-ready snapshot (`c67`'s first step, `node scripts/records.mjs commit`). The `records`
   workflow's hygiene step reads `main`'s map until #113 merges, as for runs 50 and 51.
3. The lane gets `c67`: the snapshot pin, the run of record and every surface naming it, and the release notes' eval
   line naming the `records` commit of step 2.
4. The final gates, the whole-branch review on Fable 5.1 over `035f078d..` the cut's head, the push, CI and the bot's
   review.
5. The maintainer: the interactive ask checks (the checklist's one-minute line), the merge, the tag (its `records:`
   line is step 2's commit) and the publish.

Lines settled outside the units, by the orchestrator, each in the run record:
- the third line: the repository's description and topics, and the admin roster, read through the API;
- the cloud-container digest re-read;
- the vendor pages re-read (one read-only research pass with web access);
- the sixth line: `node scripts/hook-latency.mjs` on the candidate, alone under the machine lock;
- the ask re-measure: `node scripts/qa/hook-runs.mjs --ask --require-observation` under the machine lock, never
  during an eval run or a full suite.

A line that moves a file (a newer digest, a moved vendor page, an ask row reading `ran`) becomes a fixer's commit in
the lane, reviewed with `c5`.

### c1-release-prep — the specs flipped, the release notes' section, the version, the generated files

| Field | Content |
|---|---|
| `id` | c1-release-prep |
| `requirements` | the checklist's version cut; REQ-PROVE-033 (the eval line's derived trigger list) |
| `files` | the head of each spec whose requirements plan 021's two files added or amended (`status:` and the provenance sentence, as `18aadc98` did for plan 020); `CHANGELOG.md` (`## [Unreleased]` becomes `## [1.16.0] - 2026-10-20` above a fresh, empty `## [Unreleased]`, with the compare links and an "Upgrading from 1.15.0" subsection, as `738a261f` did; the eval run's numbers land with `c67`); `package.json` and `package-lock.json` (`1.16.0`, by `npm version 1.16.0 --no-git-tag-version`); then this repository's generated files, by `npm run build && node dist/cli.js sync`, as `6bc07bb8` did |
| `interfaces` | (1) Each flipped spec reads `status: shipped-with-1.16.0`, and its provenance sentence names plan 021's two files and their pull requests (#112, #113), in the form the 1.15.0 flip used. A spec plan 021 did not touch is not flipped. (2) The release notes' section keeps every Unreleased entry, word for word, under the new heading. (3) The sync moves only the version strings the generated files carry, and `check` is clean after it. (4) No file in the eval line's trigger list moves: the commit's diff against `035f078d` names no `content/` file, no `evals/` file, no `scripts/eval/` file and no `test/emit` snapshot |
| `testCriteria` | `test/docsPages.test.ts`, `test/specs` (if present) and the spec coverage pass exit 0; the trigger-list check of (4) is run and its output stated |
| `depends_on` | none |
| `verify` | `npm run build && node dist/cli.js check && npx vitest run test/docsPages.test.ts test/ci && npm run typecheck` |
| `threat` | None: release metadata |

### c4a to c4e — the hand pages re-attested (read-only, five reviewers in parallel)

| Field | Content |
|---|---|
| `id` | c4a, c4b, c4c, c4d, c4e |
| `requirements` | the checklist's fourth line: every hand page, the bucket `test/docsPages.test.ts` declares (`HAND_PAGES`) plus `GOVERNANCE.md`, re-attested claim by claim against the candidate tree |
| `files` | None written. Each pass reads its own pages: `c4a` `docs/enterprise-forks.md`, `docs/enterprise-quickstart.md`, `docs/cloud.md`; `c4b` `README.md`, `GOVERNANCE.md`, `CONTRIBUTING.md`, `docs/working-with-stamity.md`; `c4c` `docs/packs-and-trust.md`, `docs/workspaces.md`, `docs/customization.md`; `c4d` `docs/troubleshooting.md`, `docs/getting-started.md`, `docs/migration.md`, `docs/doctrine.md`; `c4e` `SECURITY.md`, `docs/security-mapping.md`. A hand page in no group is a finding of the reviewer that notices it |
| `interfaces` | Each claim a page makes about the tree is checked against the tree at `035f078d` and against what changed since `v1.15.0`: a verb, flag, config key, path, count, default, refusal, emitted file, version, a control or a residual. A claim the tree contradicts is a Warning, and a stale but harmless detail is a Minor. A claim that would mislead an operator into an unsafe or destructive step is a Critical. Every finding cites the page line and the tree line. The stamps, the date constants, the run of record, the merge-ready figure and the version strings `c1` moves are `c1`'s, `c5`'s and `c67`'s, not findings |
| `depends_on` | none |
| `verify` | none (a verdict pass) |

### c5-pages-and-stamps — the re-attestation rows applied, the sample refreshed, every hand page restamped

| Field | Content |
|---|---|
| `id` | c5-pages-and-stamps |
| `requirements` | the checklist's fourth line |
| `files` | the hand pages the `c4` passes read, as their rows need; `SECURITY.md` (the open alerts, read live at the edit through `gh api repos/zomarit/stamity/dependabot/alerts?state=open`); `docs/troubleshooting.md` (its sample `check` transcript, from a real run of the cut's build, with its provenance line); every hand page's stamp; `test/docsPages.test.ts` (`RELEASE_CUT_DATE` `2026-10-20`, and the provenance case for the sample) |
| `interfaces` | (1) Every `c4` row is applied, or answered with its reasons; nothing a row did not ask for. (2) `SECURITY.md` names every alert open at the edit, each with its package, its manifest, its severity and whether a patched version exists. (3) Every cut-form hand page reads `verified against the tree at the 1.16.0 release cut (2026-10-20)`, and the newest re-attestation on the bucket equals `RELEASE_CUT_DATE` |
| `depends_on` | c1-release-prep, c4a to c4e |
| `verify` | `npx vitest run test/docsPages.test.ts test/ci/docsRoster.test.ts test/cli/docs && npm run lint && npm run typecheck` |
| `threat` | None: pages |

### c67-measurements-and-run-of-record — the merge-ready snapshot, its pin, and every page that names the run of record

| Field | Content |
|---|---|
| `id` | c67-measurements-and-run-of-record |
| `requirements` | the checklist's fifth line and the eval line's run-of-record move; REQ-PROVE-032 |
| `files` | `evals/measurements/merge-ready-2026-10-20.json` (new, written by `node scripts/merge-ready-rate.mjs --write`; a record, published to `records` before the commit, never committed to the branch); `src/cli/docs/measurements.ts` (`MEASUREMENT_SNAPSHOT_PATH`); `docs/measurements.md` (by `node scripts/generate-docs.mjs --page measurements`); `evals/run-of-record.json` (`evals/runs/2026-10-20-run-51/RESULTS.md`, release `1.16.0`, exception `null`); every page or test that names the run of record or its numbers, as `c6c21dec` moved them for run 47, including the checklist's paragraph on each release's run (`.github/release-controls-checklist.md`, after the 1.15.0 one); `CHANGELOG.md` (the 1.16.0 section's eval line, linked at the `records` commit after the snapshot's publish, as `b2c86071` did) |
| `interfaces` | Every number, status and case id is read from run 51's and run 50's exported `RESULTS.md`, never typed from memory. Run 51 is composed with run 50 (FAIL). The PASS is the composed run's, and run 50's FAIL stays as recorded, as the checklist's 1.14.0 paragraph words run 45's composition with run 44. Runs 48 and 49 are named as the earlier measures of this release. No threshold, floor tag, roster count or criterion moved. The links use `https://github.com/zomarit/stamity/blob/<records sha>/<path>` |
| `depends_on` | c5-pages-and-stamps, and the snapshot's `records` publish |
| `verify` | `npx vitest run test/evals test/cli/docs/measurements.test.ts test/docsPages.test.ts test/ci/repoHygiene.test.ts && npm run test:records && node scripts/repo-hygiene.mjs && node scripts/generate-docs.mjs --page measurements && git diff --exit-code docs/measurements.md` |
| `threat` | None: records and pages |
