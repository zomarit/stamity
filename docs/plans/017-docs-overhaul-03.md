---
id: docs-overhaul-03
intent: feature
stamp: 81b71b09ee03c43f5a19f572e888d2c230ec594d 2026-10-02
reads: [.github/workflows/docs-site.yml, scripts/qa/run.mjs, scripts/qa/form.mjs, scripts/qa/a11y-tree.mjs, website/docusaurus.config.ts, website/sidebars.ts, llms.txt, README.md, docs/getting-started.md, docs/customization.md, docs/troubleshooting.md, docs/security-mapping.md, test/ci/workflow.test.ts, docs/plans/016-fork-distribution-03.md]
depends_on: [docs/plans/017-docs-overhaul-02.md]
---

# The docs, rebuilt — file 3 of 3: prove the docs with readers, then publish them

This file is self-contained. It is the third of three `/st-plan` artifacts for **Package 21, the docs overhaul**,
placed after Package 20 (1.12.0) and before Package 12. It proves the rebuilt docs in four ways:

- an agent reader test, with its bar declared in file 1;
- a fix round for the gaps it finds;
- the QA harness in light and dark;
- the maintainer's walkthrough.

It then publishes stamity.dev by dispatch and closes the package. It ships as one small fix PR, if any fix is needed,
plus the site deploy. There is no release: the npm README follows at the next release cut.

## Context

### What came before

File 1 (`docs/plans/017-docs-overhaul-01.md`) merged the foundations:
- the docs contract;
- the prose checks and the word baseline;
- the per-page tests;
- site search, GitHub alerts and the Markdown copies of `llms.txt` targets;
- the generated-page fixes;
- the diagram kit;
- the reader-test kit: `.github/docs-reader-test.md`, `scripts/docs-reader/`, and graders proven to pass and fail.

File 2 (`docs/plans/017-docs-overhaul-02.md`) merged the new structure. Every hand page is rewritten to its budget,
eleven pages are new, thirteen diagrams sit beside their text twins, README and `SECURITY.md` are slimmed, and the
security inventory is on the site. The live site still shows the old docs, because merging never deploys
(`.github/workflows/docs-site.yml` arms its deploy only on a dispatch with `deploy: true` or after a release).

### What this file proves

**G8, proven:** the reader test passes its declared bar, the maintainer's walkthrough signs off, and the QA harness
passes in light and dark. After that, the live site serves the new docs.

**Out of scope:** any page restructure (that was file 2), any release, and the landing page's redesign.

## Decisions

### The maintainer's walk (2026-10-02; every answer the recommended option)

1. Placement after Package 20, before Package 12, with no release.
2. The brand diagram kit.
3. **The proof is an agent reader test plus the maintainer's walkthrough of the quickstart and customization:**
   - 8 real tasks, each tried 3 times by an agent using only the docs;
   - a no-docs baseline;
   - the bar declared first: 7 of 8 tasks pass in 2 of 3 tries.
4. The two CLI gaps go to Package 20 file 1.

### Declared before any run (copied from `.github/docs-reader-test.md`, committed by file 1)

| Item | Value |
|---|---|
| **Tasks** | T1 set up for Claude Code and check health · T2 make the reviewer insist on tests without copying it · T3 add a rule for SQL files only · T4 make a failing `check` pass without deleting the setup · T5 add the ops pack, then remove it without a trace · T6 name the touchpoint for pull-request comments and cite the docs · T7 make `npm run verify` the test gate · T8 name two things the engine does not defend and cite the docs |
| **Reserves** | R1 undo the reviewer change · R2 share the client choice through a workspace |
| **Condition A** | The CLI only (`--help` allowed). No docs, no repository source, no web. |
| **Condition B** | a read-only copy of the published pages: every file `llms.txt` links, which is what the site serves as Markdown (the step `a4` adds), plus `llms.txt` itself. `docs/specs/` and `docs/plans/` are not in it, because the site build excludes them and `llms.txt` names neither. No repository source, no web. The grader refuses a copy that holds a `plans/` or `specs/` folder. |
| **Trials** | B gets 3 tries per task. A gets tries 1 and 2 per task: if both pass, the task is contaminated; if both fail, it is clean; if they split, try 3 decides. That is 40 to 48 sessions, plus the A tries of each reserve that is tested. |
| **The bar** | B passes at least 7 of the 8 tasks in at least 2 of 3 tries. Every passing B try cites at least one `page#section` that exists in the copy. |
| **Contamination** | A task that A passes in at least 2 of 3 tries is swapped for reserve R1, then R2, before scoring. A reserve gets the same A baseline before it is swapped in. Once the reserves run out, each further contaminated task leaves the scored set, and the bar becomes one fewer than the number of scored tasks, each in at least 2 of 3 tries. Fewer than 6 scored tasks make the bar `invalid`, which is recorded as `Not done:`. |
| **Triage** | Each failing B try is labelled `docs-gap` or `agent-error`, with one sentence of reason. |
| **Model** | Opus 5.5 (`opus`) for every agent. No judge: the graders in `scripts/docs-reader/grade.mjs` read end state only. |
| **Records** | Results go to the running package's run record, as `reader-test/results.md`. Each result names the commit its docs copy was built from. |

### Settled by this plan (declared defaults; reversible before the run)

| # | Default | Why |
|---|---|---|
| S24 | **The reader agents run as sub-agents of this session**, each given only its task text, its fixture path and, for B, the docs copy. They are told not to use web tools or the repository, and their tool calls are listed in the results. | Repeatable without new infrastructure. The baseline and the citation rule catch leakage. |
| S25 | **At most two fix rounds.** After a fix round, only the tasks that failed are re-run (3 B tries each). If the bar still fails after round two, or is `invalid`, the run records `Not done:` with the per-task results. The default holds the publish. A publish then happens only on the maintainer's recorded override, which names the bar line, and the close keeps G8 open. | A bounded loop, with the decision left to the person. |
| S26 | **Fixes are docs-only edits** to the pages a `docs-gap` names, under the contract. A gap that needs CLI behaviour becomes an inbox row, not a code change here. | This is a docs package. |
| S27 | **The deploy is a `workflow_dispatch` of `docs-site.yml` with `deploy: true` from `main`,** run only after the maintainer's "publish" in this session. | It is an outward-facing act; the maintainer confirms it. |

### Before this file runs

- File 2 is merged: `git log --oneline -1 -- docs/overview.md` shows a commit. `main` is green.
- A fresh session, which the maintainer prefers after a long one. It first audits file 2's late work read-only
  (`c0-intake`).
- Read file 2's run record: the share of the baseline, any `Not done:`, and the review's open Minors.

## Spec delta

**Empty.** The package changes no product requirement (file 1, S1).

## Units

### c0-intake — audit the late work of session 2, then check the preconditions

| Field | Content |
|---|---|
| `id` | `c0-intake` |
| `requirements` | spec carries no ids (package goal G8) |
| `files` | the run record only |
| `interfaces` | A read-only audit of the last third of file 2's merged diff, by a fresh `opus` reviewer, covering the last content lane merged, `b10`'s shared-file edits and the last fix round. Findings go to this run's ledger. A Critical stops the file. A Warning becomes a `c2` fix. The precondition table records:<ul><li>`main`'s sha;</li><li>the green push run;</li><li>the baseline share printed by `test/docs/prose.test.ts`;</li><li>`node scripts/visuals.mjs --check`;</li><li>`node scripts/site-markdown-twins.mjs website/build` after a local site build.</li></ul> |
| `testCriteria` | **Given** the run record, **then** it holds the audit's verdict and every precondition's value. Each value is read by exit code, never through `| tail`. |
| `edgeCases` | **The audit finds a lost SEC fact:** a Critical; restore it from the base commit of file 2 before anything else. **The share is over 60% and file 2 recorded `Not done:`:** carry it into the close; this file does not re-cut pages beyond what the reader test asks. |
| `depends_on` | `docs/plans/017-docs-overhaul-02.md` (`b11-review-merge`) |
| `verify` | `npm run lint && npm run typecheck && npm run test && node scripts/visuals.mjs --check && cd website && npm run build && cd .. && node scripts/site-markdown-twins.mjs website/build` |

### c1-reader-test — the agent reader test, run as declared

| Field | Content |
|---|---|
| `id` | `c1-reader-test` |
| `requirements` | spec carries no ids (package goal G8) |
| `files` | `reader-test/results.md` and `reader-test/transcripts/` in the run record; nothing in the product tree |
| `interfaces` | See **c1 interfaces** below the table. |
| `testCriteria` | **Given** `reader-test/results.md`, **then** it states:<ul><li>every try's verdict and grader reason;</li><li>every B pass's citation, checked to exist;</li><li>every swap, with its A results;</li><li>every failing B try's label;</li><li>the bar's outcome in one line: `Bar met: yes`, `Bar met: no — <n> of <scored>` or `Bar met: invalid`.</li></ul>**Given** a grader run again on a kept fixture, **then** it gives the same verdict. |
| `edgeCases` | **An agent uses a web tool or reads the repository:** that try is void and re-run once. Two voids on one task make it `agent-error` for that try. **A grader fails for a reason outside the task** (the CLI crashed): that is not a docs gap; record it, and open an inbox row if it reproduces. **T5 hits a pack-sync defect on Claude Code:** an inbox row, and the task is scored as run. **An agent asks a question:** sub-agents do not ask (`BLOCKED_AMBIGUITY`); the try fails as `agent-error`, with the readings it named. |
| `depends_on` | `c0-intake` |
| `verify` | `node scripts/docs-reader/grade.mjs <task> <fixture-dir> --docs <docs-copy>` for each kept fixture; it reproduces the recorded verdicts |

**c1 interfaces.**

1. **Build the CLI tarball once.** On `main` at c0's recorded sha, run `npm ci && npm run build && npm pack`. Record
   the tarball's file name and sha256, and pass that tarball to every fixture (`fixture.mjs setup … --tarball <path>`).
2. **Build the docs copy outside the repository,** as the Condition B row describes. Condition B: a read-only copy
   of the published pages: every file `llms.txt` links, which is what the site serves as Markdown (the step `a4`
   adds), plus `llms.txt` itself. `docs/specs/` and `docs/plans/` are not in it, because the site build excludes them
   and `llms.txt` names neither. No repository source, no web. The grader refuses a copy that holds a `plans/` or
   `specs/` folder. Build the docs copy from a named commit (round 0: c0's `main` sha), record that sha in
   `results.md`, and never edit a copy.
3. **Run each try as a fresh `opus` sub-agent:**
   - set up its own fixture with `node scripts/docs-reader/fixture.mjs setup <task> <dir> --tarball <path>`, in its own
     scratch folder outside the repository;
   - give it only the task's goal text, the fixture path and, for B, the docs copy's path, with the instruction to use
     no web tool and no other folder;
   - when it returns, run `node scripts/docs-reader/grade.mjs <task> <dir> --docs <copy>` and record the verdict.
4. **Run order.**
   - All A tries come first, so contamination swaps happen before B runs.
   - Then the B tries: up to 8 tasks × 3 tries, with independent tries run in parallel.
5. **Labelling.** Every failing B try gets a label (`docs-gap` or `agent-error`) and one sentence of reason, read from
   its returned summary and its grader output.

### c2-gap-fixes — fix what the readers could not find, then re-run what failed

| Field | Content |
|---|---|
| `id` | `c2-gap-fixes` |
| `requirements` | spec carries no ids (package goals G8, G4, G3) |
| `files` | Only the pages a `docs-gap` names, their test files under `test/docs/pages/`, and any diagram spec under `scripts/visuals/specs/` whose text twin changes, with its `docs/visuals/<slug>.svg` regenerated by `node scripts/visuals.mjs --write <slug>`. Plus the Warnings from `c0`'s audit. |
| `interfaces` | One fix per `docs-gap`, under the contract: the smallest edit that would have let the reader finish (a missing step, a missing example, a link, a clearer heading). After each fix round, re-run only the failed tasks' B tries (3 each) through `c1`'s procedure. Each round's reruns use a fresh copy built from that round's fix-branch head commit, with its sha recorded beside the round's results; every copy is kept for re-grading. At most two rounds (S25). Fixes are reviewed by one fresh `opus` reviewer per round, with the truth and journey lenses. |
| `testCriteria` | **Given** the fix PR, **then** `npm run lint && npm run typecheck && npm run test`, `node scripts/visuals.mjs --check`, `node scripts/leak-gate.mjs` and the site build exit 0. **Given** `reader-test/results.md` after the last round, **then** the bar line reads `Bar met: yes`, or the run records `Not done:` (S25) with the per-task results and the gaps that stayed. |
| `edgeCases` | **A gap needs a CLI change** (for example the config reset Package 20 may not have shipped): an inbox row; the page states the limit plainly (S26). **A fix pushes a page over its budget:** cut elsewhere on that page along the one-home table, never the fix. |
| `depends_on` | `c1-reader-test` |
| `verify` | `npm run lint && npm run typecheck && npm run test && node scripts/visuals.mjs --check && node scripts/leak-gate.mjs && cd website && npm run build` |

### c3-qa-walkthrough — the QA harness in both themes, GitHub rendering, and the maintainer's walkthrough

| Field | Content |
|---|---|
| `id` | `c3-qa-walkthrough` |
| `requirements` | spec carries no ids (package goals G8, G6) |
| `files` | the QA evidence in the run record (`.stamity/evidence/qa-<sha>.json` through `scripts/qa/run.mjs`, or its records-branch home after Package 18) |
| `interfaces` | See **c3 interfaces** below the table. |
| `testCriteria` | **Given** the QA form, **then** every row reads passed, deviated (with its reason) or accepted unwalked (with the maintainer's word), and the sign-off reads `Shippable: YES` or names what blocks it. **Given** the harness run, **then** H2's link-name and header checks and H3's keyboard journeys pass on every page in `PAGES` in both themes at both widths. |
| `edgeCases` | **GitHub's Mermaid frame does not render** behind the maintainer's network: record it. The spine's text twin carries the facts, by design. **The site's search box fails contrast in one theme:** a `c2`-style fix in `website/src/css/custom.css`, then re-run H3 for that page. |
| `depends_on` | `c2-gap-fixes` |
| `verify` | `node scripts/qa/run.mjs` (the harness, run against the fix PR's head) |

**c3 interfaces.**

**The harness.** `node scripts/qa/run.mjs` against the fix PR's head (or `main`, if no fix was needed). It covers the
`PAGES` file 2 extended: `/`, `/docs/`, getting started, customization, customization recipes, hooks, org rollout,
packs and trust, the capability matrix, the security model, measurements and doctrine. It runs H2 (headings, link
names, table headers) and H3 (keyboard journeys at 375 and 1,440 px, light and dark). The axe violation counts are
recorded; a new violation on a rewritten page is fixed in `c2` before sign-off.

**The QA rows**, built with the `st-qa` skill:

| Row | Who | Steps | Pass |
|---|---|---|---|
| W1 | the maintainer, about 15 min | On a local build (`cd website && npm run build && npm run serve`): from `/docs/`, set up a scratch repository with only the quickstart, through `## Check that it worked` and `## Make your first proven change`. Rate each step: could you tell what to do, did it work, did you know it worked? | Finished without leaving the page set, every step rated yes or with one named fix |
| W2 | the maintainer, about 15 min | From the customization hub, do recipe 1 (patch the reviewer) and its undo. | Finished, with the effect seen in the emitted file |
| W3 | the maintainer, about 5 min | On github.com, open README, `docs/customization.md` and `docs/security-mapping.md` in light and dark (and dark dimmed if available). Diagrams, alerts and tables must render. | All readable; record any element that does not render |
| W4 | automatic | The harness rows H2 and H3 above. | Passed |
| W5 | automatic | A fresh `check` sample still matches the troubleshooting page's pinned lines (`test/cli/commands/check.test.ts`). | Passed |

### c4-publish-close — publish stamity.dev, check it live, and close the package

| Field | Content |
|---|---|
| `id` | `c4-publish-close` |
| `requirements` | spec carries no ids (package goals G7, G8) |
| `files` | the run record; `.stamity/inbox.md` (rows this package retires, and follow-ups); the roadmap's Package 21 section (the maintainer's local file) |
| `interfaces` | See **c4 interfaces** below the table. |
| `testCriteria` | **Given** the deploy run, **then** it completed with `success`, and the deploy run's `headSha` equals S. **Given** the live checks, **then** every route answers 200 with the new text, every `.md` copy answers 200 with Markdown, and search returns a hit. **Given** the run record, **then** it names the deploy run id, the live-check table, the reader-test outcome, the QA sign-off and every `Not done:` with its owner. **Given** a deploy after a bar line other than `Bar met: yes`, **then** the run record holds the maintainer's override, which names that line. **Given** more than one new candidate dispatch run, **then** nothing is cancelled until the maintainer names their run, the run record holds that choice, and only the named run is ever cancelled. |
| `edgeCases` | **The deploy job is skipped** (the repository-identity guard, `.github/workflows/docs-site.yml:153-156`): it must run in the canonical public repository from `main`; record and stop. **A live route returns 404 while the build had it:** wait for the Pages cache (a few minutes), re-check once, then open an inbox row. **The maintainer says "not yet":** close without the deploy, and the kickoff for Package 12 carries the deploy as its first step. **`Bar met:` is not `yes`** (the bar failed or is `invalid`): step 2 asks whether to override. With no recorded override, close without the deploy. **The deploy job of a wrong-S run has already started:** do not cancel; record the deploy of a sha other than S as a `Not done:` owned by the maintainer, and stop. **Several new dispatch runs match,** at the list after the dispatch or at the list again before a cancel: stop and ask the maintainer which run is theirs; cancel nothing until they name it, then go on with that id. |
| `depends_on` | `c3-qa-walkthrough` |
| `verify` | `gh run view <deploy-run-id> -R zomarit/stamity --json conclusion,headSha,event` shows `success`, event `workflow_dispatch`, and `headSha` equal to S; the run id came from the printed URL, from the only new actor-filtered match, or from the maintainer's recorded choice; the live-check script prints `ok` for every row |

**c4 interfaces.**

1. **Merge the fix PR,** if one exists, by fast-forward. Wait for `main`'s push run to be green.
2. **Read the bar, then ask the maintainer.** First read the `Bar met:` line in `reader-test/results.md`.
   - If it reads `yes`, ask: "publish the new docs to stamity.dev now?" (S27).
   - If it reads anything else, ask whether to override the hold, quoting that line (S25). Only the maintainer's
     recorded override, which names that line, allows the deploy. Without it, skip the rest of this step and step 3,
     and go to the close.

   Record S, the sha c3 signed off. Every `gh` command in this step and in `verify` targets the canonical repository,
   with `-R zomarit/stamity` or its API path, whatever checkout it runs from. On yes, first check that
   `gh api repos/zomarit/stamity/commits/main --jq .sha` prints S. Then read your login with
   `gh api user --jq .login`, note T, the UTC time one minute before now, and list the candidates with
   `gh api -X GET repos/zomarit/stamity/actions/workflows/docs-site.yml/runs -f event=workflow_dispatch -f created='>=<T>' --jq '.workflow_runs[] | select(.actor.login == "<login>") | {id, head_sha, created_at, status}'`.
   Keep the ids it lists: none of them is this dispatch. Then run
   `gh workflow run docs-site.yml -R zomarit/stamity --ref main -f deploy=true`, and take the dispatched run, never
   the newest one. If `gh workflow run` printed a run URL (gh 2.87.0 and newer print one when GitHub returns it), its
   last path segment is the run id; use it. Otherwise list again with the same query and leave out the kept ids. If no
   new run is listed, poll until one appears. If exactly one is new, that is the run. If more than one is new, stop and
   ask the maintainer which run is theirs, record the choice, and go on with that id; cancel nothing while the run is
   in doubt. If the identified run's `head_sha` differs from S, cancel it (`gh run cancel <id> -R zomarit/stamity`)
   before its deploy job starts, and stop. When the id came from the list, first list again with the same query: if
   another new run has appeared, ask the maintainer which run is theirs, record the choice, and go on with the run
   they name. If the deploy job has already started, do not cancel: record the deploy of a sha other than S as a
   `Not done:` owned by the maintainer, and stop. If the run ends `cancelled` without a cancel from this step (a newer
   dispatch replaced it in the concurrency queue), record that and stop. Otherwise watch it to completion with
   `gh run watch <id> -R zomarit/stamity`.
3. **Check the live site.** A short script in the run record fetches each route and asserts status 200 and one
   expected heading:
   - `/`;
   - `/docs/`;
   - every sidebar route;
   - `/llms.txt`;
   - every `llms.txt` target as `.md`;
   - `/docs/getting-started.md`.

   Also confirm that search finds "overlay", and that the hero diagram loads.
4. **Close.**
   - Tick the roadmap's Package 21 boxes with evidence, leaving G8's box unticked while `Bar met:` is not `yes`.
   - Retire the inbox rows the package folded in.
   - Re-sync the private layer's record with its close row.
   - Write Package 12's kickoff (it moves from Package 20's close to this package's).
   - Record the run's learnings through the learn skill, if any qualify.

## Execution order

1. `c0-intake`.
2. `c1-reader-test`: the A tries first, then the B tries in parallel.
3. `c2-gap-fixes` (at most two rounds).
4. `c3-qa-walkthrough`.
5. `c4-publish-close`.

**Size:** about 5–7 h wall-clock, 40 to 48 reader sessions, plus the A tries of each reserve that is tested, and one
or two fix rounds. **Maintainer touchpoints:** W1
to W3 (about 35 minutes), the fix PR's merge, the publish answer, and the QA sign-off.

## Shared contracts touched

| Contract | Owner | Notes |
|---|---|---|
| The live site (stamity.dev) | `c4` | Changed only by the dispatch, after the maintainer's yes. |
| `.github/docs-reader-test.md` | none | Read only. Its bar is never moved after a run starts. |
| The QA harness `PAGES` | none | As file 2 left it. |

## QA walk

The rows W1–W5 in `c3`.

## Risks

| Severity | Risk | Mitigation |
|---|---|---|
| Warning | **Agents answer from training data, not the docs.** | The A baseline and swaps, the citation rule, and the fact that stamity's 2026 docs postdate the model's training cutoff. |
| Warning | **Reader variance makes one run unrepresentative.** | Three B tries per task, the 2-of-3 rule, and re-running only failed tasks after a fix. |
| Minor | **The deploy publishes docs ahead of npm `latest`,** since the npm README still describes 1.12.0's docs links. | The docs describe `main`, as Package 14's did. The next release cut re-attests the pages and updates the npm README. |
| Minor | **The Pages cache serves an old page for a few minutes.** | One re-check after a short wait (`c4`). |

## Inbox rows this file folds in

None. File 2's folded rows retire at its merge.

## Open questions

None.

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

None beyond file 1's. A `docs-gap` that needs CLI behaviour becomes a row at run time (S26).

## Drop list

File 1's drop list holds. In particular:
- no human five-user rounds as a gate;
- the reader test stays out of the release eval set.
