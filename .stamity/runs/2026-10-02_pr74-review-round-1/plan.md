# In-flow plan — PR #74 review fixes, round 1

Run `2026-10-02_pr74-review-round-1`. Base `ef598f49`, branch `docs/plan-017-review-fixes`. Three file-disjoint units,
built serially. Plan text only: no source, test, content or spec file moves. The findings are F1–F26 from
`/st-pr-resolve` round 1 on PR #74. Each one's evaluation (evidence, causal chain, fix) is summarized in its unit
below. Line numbers are at `ef598f49`.

Every unit keeps its plan file valid under `/st-plan`'s plan-lint:
- every acceptance criterion is testable (L1);
- every dependency resolves (L2);
- every unit lists its edge cases (L3);
- requirement ids read "spec carries no ids" (L4).

Its sentences stay plain. It never spells a private ledger id (an uppercase prefix, a hyphen, then digits), the
private repository's name, or the predecessor project's name.

## Contract census (held shapes)

Two pieces of plan text are shared across files. The owner writes them, and the peer pastes the held wording below,
word for word.

| Contract | Owner | Peer | State |
|---|---|---|---|
| The reader-test protocol's Condition B, Trials, Contamination and Records wording | U1 (file 1, `a7` protocol) | U3 (file 3, the "Declared before any run" table) | reconciled(1): both paste P1–P4 below |
| The activation rule of the 60% total | U1 (file 1, `a2` rule 9) | U2 (file 2 `:56`, `:991`) | reconciled(1): both paste P5 below |

- **P1 — the docs copy for condition B:** "a read-only copy of the published pages: every file `llms.txt` links, which
  is what the site serves as Markdown (the step `a4` adds), plus `llms.txt` itself. `docs/specs/` and `docs/plans/` are
  not in it, because the site build excludes them and `llms.txt` names neither. No repository source, no web. The
  grader refuses a copy that holds a `plans/` or `specs/` folder." (review/6, signed off)
- **P2 — trials:** "B gets 3 tries per task. A gets tries 1 and 2 per task: if both pass, the task is contaminated; if
  both fail, it is clean; if they split, try 3 decides. That is 40 to 48 sessions, plus the A tries of each reserve
  that is tested." (review/5, signed off)
- **P3 — contamination:** "A task that A passes in at least 2 of 3 tries is swapped for reserve R1, then R2, before
  scoring. A reserve gets the same A baseline before it is swapped in. Once the reserves run out, each further
  contaminated task leaves the scored set, and the bar becomes one fewer than the number of scored tasks, each in at
  least 2 of 3 tries. Fewer than 6 scored tasks make the bar `invalid`, which is recorded as `Not done:`."
  - Keep the existing sentence "B passes at least 7 of 8 tasks in at least 2 of 3 tries" word for word. File 1's `a7`
    test asserts the string "7 of 8" and "2 of 3".
- **P4 — records:** "Results go to the running package's run record, as `reader-test/results.md`. Each result names
  the commit its docs copy was built from."
- **P5 — when the total switches on:** "Once no page of the baseline set under `docs/` lacks `kind:` (`README.md` and
  `SECURITY.md` carry no frontmatter and are exempt from this switch; their words still count toward the total)".

## Units

### U1 — `docs/plans/017-docs-overhaul-01.md`

| Field | Content |
|---|---|
| `id` | `u1-plan-017-file-1` |
| `requirements` | spec carries no ids (PR #74 findings F1–F15; F19, F20, F21, F23, F25 for file 1's part) |
| `files` | `docs/plans/017-docs-overhaul-01.md` only |
| `interfaces` | The edits below, one per finding. |
| `testCriteria` | **Given** the edited file, **when** `node .claude/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/017-docs-overhaul-01.md docs/specs` runs, **then** it prints `"status": "pass"` with 9 units and no findings. **When** `npx vitest run test/records/specStatus.test.ts test/authoring/specPlanCoverage.test.ts test/corpus/commands/plan.test.ts` runs, **then** it exits 0. **When** `node scripts/leak-gate.mjs` runs, **then** it exits 0. **Then** every edit below is present, and the P1–P5 wording appears verbatim. |
| `edgeCases` | **An edit would push a table cell past what reads well:** split it into a bullet list below the table, as the file already does for long interfaces. **The file names a line number of itself that moved:** none of its own lines are cited, so nothing moves. **"7 of 8" appears in a new sentence:** fine; the original sentence stays verbatim. |
| `depends_on` | none |
| `verify` | `node .claude/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/017-docs-overhaul-01.md docs/specs && npx vitest run test/records/specStatus.test.ts test/authoring/specPlanCoverage.test.ts test/corpus/commands/plan.test.ts && node scripts/leak-gate.mjs` |

Edits to U1, by finding:

- **F1 — the 50,000-character gate covers published pages only (Warning).**
  - Rule 5 (`:452-454`) opens: "Every published page under `docs/` is under 50,000 characters: every `.md` the site
    build does not exclude (the `exclude` list in `website/docusaurus.config.ts`, read the way
    `test/ci/docsRoster.test.ts` reads it), whether rewritten or generated." Its exemption sentence for not-yet-rewritten
    hand pages stays.
  - Add one sentence: "Plans and specs are records, not pages; on the base commit `docs/specs/plugin-lifecycle.md` is
    119,275 bytes and `docs/plans/016-fork-distribution-02.md` is 340,632."
  - Also change G1 (`:76`) and the contract text (`:323`) to "Every published page stays under 50,000 characters."
- **F2 — the callout check follows what `a4` kept (Warning).**
  - In `test/docs/prose.ts`'s interface block, add `export const CALLOUT_SYNTAX: "gfm-alert" \| "directive" =
    "gfm-alert"; // set to "directive" when a4 dropped the alerts plugin`.
  - Rule 8 (`:458`) becomes: "**Callouts use the syntax `a4` kept** (`CALLOUT_SYNTAX`): with the alerts plugin landed
    (S5), no `:::` line on a hand page; with it dropped, no `> [!` alert line."
  - In `a2`'s criteria, the fixture "a `:::note` line" becomes "a callout in the syntax `a4` did not keep".
  - `a2`'s `depends_on` (`:390`) adds `a4-site-foundations`.
  - Execution order step 3 (`:793`) becomes "`a2-prose-checks` runs after `a3`, because it reads the roster, and after
    `a4`, because it reads the callout syntax `a4` kept. It measures the baseline on the base commit's pages."
  - In `a4`'s `testCriteria` (`:525`), the `> [!NOTE]` probe gets "(skipped, with the run record's reason, when the
    alerts plugin was dropped)".
- **F3 — the total switches on without root-page kinds (Warning).** Rule 9 (`:459-461`) opens with P5, then keeps "the
  sum of `countProseWords` over the set is at most `TOTAL_SHARE × BASELINE.total`" and the rest of the rule.
- **F4 — the roster cannot lose an unmarked page (Warning).**
  - Under a3's derivations (`:505-508`), add a bullet: "**Every published page under `docs/` carries exactly one
    header:** the `HAND-WRITTEN PAGE` header or the `GENERATED FILE` banner. A page with neither, or with both, fails,
    named. Every sidebar id resolves to a page in one of the two sets. This check is independent of `HAND_GUIDES`, so
    a guide that loses its header fails instead of leaving the roster."
  - In `a3`'s `testCriteria` (`:474`), add a probe: "**Given** a scratch page listed in a scratch copy of the sidebar
    with neither header, **then** the one-header case fails naming it; the probe is deleted afterwards."
- **F5 — the search fallback matches its criteria (Minor).**
  - In `a4`'s criteria (`:525`): "the search plugin's index file exists under `website/build/` (skipped, with the run
    record's reason, when `a4` dropped the plugin under S6)".
  - The `a8` CHANGELOG line (`:773`) becomes "local search on stamity.dev (unless `a4` dropped it under S6)".
- **F6 — the docs workflow runs on every Markdown-copy input (Warning).**
  - In `a4`'s interfaces, the docs-site workflow bullet gains: "Both the `pull_request` and the `push` `paths:` lists
    gain `llms.txt`, `scripts/site-markdown-twins.mjs`, `SECURITY.md`, `CONTRIBUTING.md`, `GOVERNANCE.md`,
    `CODE_OF_CONDUCT.md` and `content/charter/**`, the inputs the twins step copies (`llms.txt:16-19`, `:51` on the base
    commit)."
  - `a4`'s `files` note on `test/ci/workflow.test.ts` (`:523`) becomes "(where it pins the docs-site steps and path
    filters)".
  - `a4`'s criteria add: "the workflow test asserts the new path-filter entries".
  - The shared-contracts row (`:811`) becomes "The docs-site workflow's step list and path filters".
- **F7 — pack trust comes from the curated catalog (Warning).**
  - `a5`'s `files` and interfaces (`:571`): "the trust tier per pack, read from the curated catalog pin
    (`lookupCatalogEntry(id)?.pin.tier`, `src/pack/curated.ts`; already imported by `src/cli/docs/referencePages.ts`)".
  - Replace the edge case "A pack manifest states no trust tier" (`:561`) with: "**A pack not in the curated catalog:**
    its line says the tier resolves at install from its signing (`src/pack/trust.ts`)".
  - `a5`'s criteria add: "the ops pack's line reads `curator-verified`".
  - The manifest carries no tier (`src/pack/manifest.ts:461-473`).
- **F8 — the "cannot be patched" line covers pack skills only (Warning).**
  - `a5`'s interfaces (`:587-588`): "A pack-supplied **skill** reads 'cannot be replaced or patched; packs add new skill
    ids only' (`src/emit/planner.ts:600-603`, `:444-450`). Any other pack-supplied artifact (a rule, agent or command)
    takes the ordinary `Customize` line, because the user layer outranks a pack (`src/content/catalog.ts:51`) and the
    planner resolves overlays on pack rules, agents and commands (`src/emit/planner.ts:335-343`)."
  - `a5`'s criteria (`:560`): "a pack skill reads 'cannot be replaced or patched'; a pack rule carries the ordinary
    `Customize` line".
- **F9 — the tested grounds follow the site's CSS (Minor).** The tokens paragraph (`:656-657`) becomes: "A test holds
  `FILL.primary`, `FILL.deep` and `STROKE` equal to the brand scale in `website/src/css/custom.css`, and the two site
  grounds in `GROUNDS` equal to `--ifm-background-color` in its light and dark blocks, so the kit and its contrast check
  follow the brand."
- **F10 — the text twin is checked beside the diagram (Minor).** Check 7 (`:694-696`) becomes: "For every page that
  references `visuals/<slug>.svg`, each `spec.facts` string appears in the section that holds the reference: from that
  section's heading to the next heading of the same or a higher level (`sectionOf`). Image syntax and alt text are
  removed before matching, which is case-insensitive with whitespace normalized." The orphans sentence stays.
- **F11 — T2 and T3 grade the requested text (Minor).**
  - T2's grader (`:747`) appends: "and the patch body matches `/\btests?\b/i`".
  - T3's grader (`:748`) appends: "and the rule body matches `/reversib/i` in both the override and the emitted copy".
- **F12 — T4 proves the setup survived (Warning).**
  - T4's fixture (`:749`) becomes: "T1's end state, then `config set gates.lint "echo t4-sentinel"`, then one generated
    file hand-edited".
  - Its grader appends: "and `config get gates.lint` still prints `echo t4-sentinel`. A `clean` followed by `init`
    resets the manifest and fails this."
- **F13 — T5 needs evidence the pack was added (Warning).**
  - The commands paragraph (`:757-760`) gains: "In both modes, the fixture's `stamity` shim (the wrapper on PATH, or
    the shim the fixture writes over `node_modules/.bin/stamity`) appends each call's argv to
    `<dir>/.git/stamity-calls.log`."
  - T5's grader (`:750`) appends: "and the call log holds an `add` naming ops before a removal of it".
  - The tasks paragraph's "Every grader reads end state only" (`:742`) becomes "Every grader reads end state only,
    apart from T5's call log."
  - Edge case added to `a7`: "**An agent runs the CLI by a path the shim does not cover:** T5 fails with the reason
    'no call log', and triage labels it `agent-error`."
- **F14 — citations must support the answer (Minor).**
  - T6's grader (`:751`): "`answer.md` names `/st-pr-resolve` and cites a `docs/<page>.md#<anchor>` in the docs copy
    whose section (`sectionOf`) contains `/st-pr-resolve`".
  - T8's grader (`:753`): "…plus a citation that resolves to the security page's `## What it does not defend`
    section".
- **F15 — R2 checks the client choice arrived (Minor).** R2's row (`:755`):
  - fixture: "T1's end state as repository A, plus a second sample project B";
  - grader: "the workspace file names both members, `workspace status` lists both, and B's `.stamity/manifest.json`
    has `tools` equal to A's (`["claude"]`)".
- **F19 (file 1's part) — the docs copy excludes plans and specs (Critical).**
  - Protocol §3's **B** (`:729-730`) is replaced by P1.
  - The commands paragraph (`:761`) adds: "`grade.mjs` refuses a `--docs` folder that holds `plans/` or `specs/`."
- **F20 (file 1's part) — the A baseline decides validly (Warning).**
  - Protocol §4 Trials (`:731`) is replaced by P2.
  - S11 (`:225`) becomes: "**Reader-test trials.** Condition B (docs only) gets 3 tries per task. Condition A (no docs)
    gets tries 1 and 2 per task, and try 3 only when the first two split. That is 40 to 48 agent sessions, plus the A
    tries of any reserve swapped in."
- **F21 (file 1's part) — reserves and scoring cover every outcome (Warning).** Protocol §6 Contamination (`:734`) is
  replaced by P3, keeping §5's "7 of 8" sentence verbatim.
- **F23 (file 1's part) — the fixtures install a built tarball (Warning).** The commands paragraph (`:758-760`): "Without
  `--cli`, it installs the tarball given by `--tarball <path>`, and refuses to run without one."
- **F25 (file 1's part) — results name their docs copy (Warning).** Protocol §9 Records (`:737`) is replaced by P4.

### U2 — `docs/plans/017-docs-overhaul-02.md`

| Field | Content |
|---|---|
| `id` | `u2-plan-017-file-2` |
| `requirements` | spec carries no ids (PR #74 findings F16–F18, F3's file-2 part; F1 and F8 file-2 occurrences) |
| `files` | `docs/plans/017-docs-overhaul-02.md` only |
| `interfaces` | The edits below. |
| `testCriteria` | **Given** the edited file, **when** `node .claude/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/017-docs-overhaul-02.md docs/specs` runs, **then** it prints `"status": "pass"` with 12 units and no findings. **When** `npx vitest run test/records/specStatus.test.ts test/authoring/specPlanCoverage.test.ts test/corpus/commands/plan.test.ts` runs, **then** it exits 0. **When** `node scripts/leak-gate.mjs` runs, **then** it exits 0. **Then** every edit below is present, and P5 appears verbatim at both places. |
| `edgeCases` | **b10's files list already names a long list:** add `test/docs/runOfRecord.test.ts` with "(only for an edit a content lane returned)". **The security-mapping test named for F17 is created by `a3`:** b8 adds a case to that file; it creates no new file. |
| `depends_on` | none |
| `verify` | `node .claude/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/017-docs-overhaul-02.md docs/specs && npx vitest run test/records/specStatus.test.ts test/authoring/specPlanCoverage.test.ts test/corpus/commands/plan.test.ts && node scripts/leak-gate.mjs` |

Edits to U2, by finding:

- **F3 (file 2's part).**
  - `:56` (the prose-checks row) becomes: "The 60% total check switches on once no page of the baseline set under `docs/`
    lacks `kind:` (`README.md` and `SECURITY.md` carry no frontmatter and are exempt from this switch; their words
    still count toward the total)."
  - In b10's `testCriteria` (`:991`), "every page in the baseline set declares `kind:`" becomes "every page of the
    baseline set under `docs/` declares `kind:` (`README.md` and `SECURITY.md` are exempt)".
- **F16 — the APM token chain has four entries (Warning).**
  - `:171` (facts at risk): "Token precedence `GITHUB_APM_PAT_<ORG>` > `GITHUB_APM_PAT` > `GITHUB_TOKEN` > `GH_TOKEN`"
    (source `docs/enterprise-forks.md:806-808`, which reads "precedes `GITHUB_TOKEN` and `GH_TOKEN`").
  - b7's `fork-release.md` outline, section 6 (`:866`): "plus the token precedence, all four in order
    (`GITHUB_APM_PAT_<ORG>`, `GITHUB_APM_PAT`, `GITHUB_TOKEN`, `GH_TOKEN`)".
- **F17 — b8 creates the checklist guard it relies on (Warning).**
  - b8's `files` (`:894`): replace "the test that holds the checklist's reserved sentence (find it at intake with `rg …`)"
    with "a new case in `test/docs/pages/security-mapping.test.ts` that holds the checklist's reserved sentence. No
    test holds it today: `rg -n "release-controls-checklist" test` finds only `test/ci/hookLatency.test.ts:245-251`."
  - b8's `testCriteria` (`:896`): replace "plus the checklist's test" with: "**Given** the reserved-sentence blockquote
    in `.github/release-controls-checklist.md` (`:169-175` on `ef598f49`, opening 'Each of those is now in force'),
    **then** its whitespace-collapsed text appears under `## Publishing this package` in `docs/security-mapping.md`.
    Changing one word on the page makes the case fail (proved red first)."
  - b8's interfaces (`:904`) add: "the checklist's own note (`:179-181`) names `test/docs/pages/security-mapping.test.ts`
    as the suite that holds it."
- **F18 — one owner for `test/docs/runOfRecord.test.ts` (Warning).**
  - Delete it from b2's `files` (`:370`) and from b9's `files` (`:948`).
  - Add to both units' `edgeCases`: "**The run-of-record line has to move:** keep it on the page (the one-home row
    pins it there); if it must move, return the needed `RUN_OF_RECORD_PAGES` edit to `b10`."
  - Add `test/docs/runOfRecord.test.ts` to the shared files owned by `b1` and `b10` in the execution order (`:1067-1068`)
    and in b10's `files` (only for an edit a lane returned). Add a shared-contracts row: `test/docs/runOfRecord.test.ts`
    → `b10`.
- **F1 (file 2's occurrence).** G1's row (`:41`) ends: "Every published page stays under 50,000 characters."
- **F8 (file 2's occurrence).** b5's hub outline item 9 (`:685`): "the charter body (only in a fork), a pack's skills (a
  pack skill cannot be replaced or patched; a pack's rules, agents and commands can be), and any recorded-but-unread key
  as 1.12.0 reads it".

### U3 — `docs/plans/017-docs-overhaul-03.md`

| Field | Content |
|---|---|
| `id` | `u3-plan-017-file-3` |
| `requirements` | spec carries no ids (PR #74 findings F19–F26) |
| `files` | `docs/plans/017-docs-overhaul-03.md` only |
| `interfaces` | The edits below. |
| `testCriteria` | **Given** the edited file, **when** `node .claude/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/017-docs-overhaul-03.md docs/specs` runs, **then** it prints `"status": "pass"` with 5 units and no findings. **When** `npx vitest run test/records/specStatus.test.ts test/authoring/specPlanCoverage.test.ts test/corpus/commands/plan.test.ts` runs, **then** it exits 0. **When** `node scripts/leak-gate.mjs` runs, **then** it exits 0. **Then** every edit below is present, and P1–P4 appear verbatim in the declared table. |
| `edgeCases` | **A table cell grows long with P3:** keep it in the cell; the table already holds long cells. **The c4 sha check needs a cancel command:** `gh run cancel <id>`. |
| `depends_on` | none |
| `verify` | `node .claude/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/017-docs-overhaul-03.md docs/specs && npx vitest run test/records/specStatus.test.ts test/authoring/specPlanCoverage.test.ts test/corpus/commands/plan.test.ts && node scripts/leak-gate.mjs` |

Edits to U3, by finding:

- **F19 — the docs copy excludes plans and specs (Critical).**
  - In the declared table, the Condition B row (`:66`) becomes P1.
  - c1's step 2 (`:125-126`) builds the copy as P1 describes.
- **F20 — the A baseline decides validly (Warning).**
  - The Trials row (`:67`) becomes P2.
  - The Size line (`:226`) reads "40 to 48 reader sessions".
- **F21 — reserves and scoring cover every outcome (Warning).** The Contamination row (`:69`) becomes P3. The bar row
  keeps its "7 of 8" sentence.
- **F22 — a failed bar holds the publish by default (Warning; the middle fix).**
  - S25 (`:79`): "…If the bar still fails after round two, the run records `Not done:` with the per-task results. The
    default holds the publish. A publish then happens only on the maintainer's recorded override, which names the bar
    line, and the close keeps G8 open."
  - c4's `edgeCases` (`:192`) add: "**The bar failed:** ask whether to override. With no answer, close without the
    deploy."
  - c4's close step (`:212`): "Tick the roadmap's Package 21 boxes with evidence, leaving G8's box unticked while
    `Bar met:` is not `yes`."
- **F23 — the fixtures install a fresh build (Warning).** c1's step 1 (`:124`): "On `main` at c0's recorded sha, run
  `npm ci && npm run build && npm pack`. Record the tarball's file name and sha256, and pass that tarball to every
  fixture (`fixture.mjs setup … --tarball <path>`)."
- **F24 — c2 may regenerate the SVG of a spec it changes (Minor).** c2's `files` (`:145`): "…any diagram spec under
  `scripts/visuals/specs/` whose text twin changes, with its `docs/visuals/<slug>.svg` regenerated by `node
  scripts/visuals.mjs --write <slug>`".
- **F25 — reruns read the fixed docs (Warning).**
  - c1's step 2 (`:125`): "Build the docs copy from a named commit (round 0: c0's `main` sha), record that sha in
    `results.md`, and never edit a copy."
  - c2's interfaces (`:146`): "Each round's reruns use a fresh copy built from that round's fix-branch head commit, with
    its sha recorded beside the round's results; every copy is kept for re-grading."
  - The Records row becomes P4.
- **F26 — the deploy is the commit QA tested (Minor).**
  - c4 step 2 (`:199-200`): "Record S, the sha c3 signed off. Before the dispatch, `git rev-parse origin/main` must equal
    S. Right after the dispatch, read the run's `headSha` (`gh run list --workflow docs-site.yml --event
    workflow_dispatch --limit 1 --json databaseId,headSha`); if it differs from S, cancel the run (`gh run cancel <id>`)
    before its deploy job starts, and stop."
  - c4's `testCriteria` and `verify` (`:191`, `:194`) add: "the deploy run's `headSha` equals S".
