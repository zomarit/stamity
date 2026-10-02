---
id: docs-overhaul-01
intent: feature
stamp: 81b71b09ee03c43f5a19f572e888d2c230ec594d 2026-10-02
reads: [AGENTS.md, CONTRIBUTING.md, README.md, SECURITY.md, llms.txt, docs/getting-started.md, docs/working-with-stamity.md, docs/plugins.md, docs/doctrine.md, docs/customization.md, docs/troubleshooting.md, docs/workspaces.md, docs/packs-and-trust.md, docs/enterprise-quickstart.md, docs/enterprise-forks.md, docs/security-mapping.md, docs/migration.md, docs/cli-reference.md, docs/configuration.md, docs/capability-matrix.md, docs/measurements.md, website/docusaurus.config.ts, website/sidebars.ts, website/package.json, website/src/css/custom.css, website/src/remark/repoLinks.ts, website/src/pages/index.tsx, .github/workflows/docs-site.yml, test/docsPages.test.ts, test/ci/docsSite.test.ts, test/ci/docsRoster.test.ts, test/ci/workflow.test.ts, test/cli/docs/configReference.test.ts, test/cli/docs/referencePages.test.ts, test/emit/capabilityMatrix.test.ts, test/records/specStatus.test.ts, src/cli.ts, src/shared/cliCall.ts, src/cli/commands/config.ts, src/cli/docs/configReference.ts, src/cli/docs/referencePages.ts, src/cli/docs/llmsIndex.ts, src/emit/capabilityMatrix.ts, src/emit/planner.ts, src/hooks/userHooks.ts, scripts/generate-docs.mjs, scripts/leak-gate.mjs, scripts/repo-hygiene.mjs, scripts/qa/run.mjs, docs/plans/016-fork-distribution-03.md]
depends_on: [docs/plans/016-fork-distribution-03.md]
---

# The docs, rebuilt — file 1 of 3: the foundations

This file is self-contained. It is the first of three `/st-plan` artifacts for **Package 21, the docs overhaul**. It was
placed on the roadmap on 2026-10-02, after Package 20 (1.12.0) and before Package 12. This file lays the foundations
the rewrite stands on:

- a docs contract that every agent in this repository loads when it opens a docs page;
- prose checks with word budgets;
- the docs tests split per page;
- site plumbing (callouts, local search, Markdown copies for agents);
- better generated reference pages;
- the on-brand diagram kit;
- the reader-test kit.

It rewrites no guide. It ships as one pull request, merged without a release. File 2
(`docs/plans/017-docs-overhaul-02.md`) rebuilds the pages. File 3 (`docs/plans/017-docs-overhaul-03.md`) proves them
with readers and publishes the site.

## Context

stamity's published docs run to about 78,000 words over 26 pages. They are read in three places: on stamity.dev, on
github.com and through `llms.txt`. The 2026-09-16 rewrite (Package 14) made the sentences plainer. It kept every page
boundary and slug, added no visual and set no length budget, so the structural problems survived it.

Seven research passes on 2026-10-02 found three kinds of problem.

**The set is long and repeats itself.**
- The longest page, `docs/enterprise-forks.md`, is 13,556 words.
- The Codex hook-trust story appears on six pages.
- 25–54% of seven big pages is maintainer detail rather than reader help: source symbols, test names, run history and
  dated vendor measurements.

**Journeys break.**
- Setup has no route chooser and no "it worked" step.
- Customization reaches 5 of the 18 ways to customize stamity and shows no example file.
- A setting cannot be returned to its default.
- The security inventory is off the site.
- Every link in the published `llms.txt` returns 404 on stamity.dev.

**There is almost nothing to look at:** one Mermaid diagram and no image in the whole set.

Package 21 rebuilds the docs around what a reader came to do. It cuts the hand-written set to at most 60% of its words,
draws about fifteen on-brand diagrams, and proves the result with an agent reader test and the maintainer's walkthrough.

**Out of scope:**
- the landing page's redesign (the maintainer's own to-do list);
- the emitted corpus under `content/`;
- `docs/specs/`, `docs/plans/` and `evals/`;
- any CLI behaviour, apart from the data-only `meaning` field in `a5-generated-reference`.

### The package at a glance

| File | Session | What it does | Ships as |
|---|---|---|---|
| `017-docs-overhaul-01.md` (this file) | 1 | Contract, checks, test split, site plumbing, generated-page fixes, diagram kit, reader-test kit | one PR, merged, no release |
| `017-docs-overhaul-02.md` | 2 | The new structure: 11 new pages, every guide rewritten to budget, 13 diagrams placed, README and `SECURITY.md` slimmed | one PR, merged, no release |
| `017-docs-overhaul-03.md` | 3 | Agent reader test, fixes, QA in both themes, the maintainer's walkthrough, site published by dispatch | one fix PR plus the site deploy, no release |

### What the package must achieve (its acceptance, G1 to G9)

The package carries no spec (S1). These nine goals are its acceptance, and every unit names the goals it serves.

- **G1 Shorter.** Three limits apply:
  - The user-facing hand-written set ends at no more than 60% of the words it had at this file's intake. The set is
    every `docs/*.md` page with the hand-page header except `docs/migration.md`, plus `README.md` and `SECURITY.md`.
    One counter measures both ends.
  - Every hand page fits the budget of its kind.
  - Every page stays under 50,000 characters.
- **G2 One home per fact.** Each fact in file 2's one-home table lives on one page; every other page links to it.
- **G3 A journey-led structure.** It has four parts:
  - sidebar groups named by reader goal;
  - a docs home at `/docs/` that routes by goal;
  - every guide ending with one to five next links;
  - `README.md` as a front door.
- **G4 The customization journey.** A hub, recipes, a reference and a hooks guide together reach every customization
  mechanism. Each recipe ends with a verify step and an undo step.
- **G5 Complete.** Every user-facing surface has a home page that the docs home reaches within two clicks:
  - verbs and config keys;
  - touchpoints and shipped artifacts;
  - `check` rows and install routes;
  - customization mechanisms.

  The generated reference stays complete.
- **G6 Visual.** About fifteen on-brand diagrams are drawn from code, and real terminal output and file trees appear as
  text. Every visual has a text twin. CI checks contrast, size and safety.
- **G7 Agent-readable.**
  - Every `llms.txt` target answers on stamity.dev.
  - `llms.txt` is grouped like the sidebar and opens with a task index.
  - Every rewritten page carries a one-sentence `description`.
- **G8 Proven.** The agent reader test passes its declared bar, the maintainer's walkthrough signs off, and the QA
  harness passes in light and dark.
- **G9 Kept honest.** A docs contract and the tests in `test/docs/` hold every later docs change to the same shape. The
  contract is a rule this repository's agents load on every docs edit.

## Research basis

All sources were read on 2026-10-02. Where a claim rests on a secondary source, it says so.

### Structure

The best developer docs group pages by what the reader came to do, and open with a home that routes by goal:
- Claude Code's docs, OpenAI Codex's, Cursor's, Prisma's ("new application / existing database"), and MCP's ("build a
  server / build a client").
- GitHub Docs publishes its content model with numeric caps: a quickstart of "about five minutes or 600 words", "2-3"
  next steps, and an article skeleton (intro, prerequisites, procedure, troubleshooting, next steps). Kubernetes caps
  "what's next" at five links.
- Diátaxis advises applying its four kinds iteratively, "small steps", with no empty structure.
- Carroll's Minimal Manual (IJDL 2014) was "less than a quarter of the official manual". Its learners "got started
  faster … made fewer errors … learned more in less time".

### Concision

- NN/g: 79% of test users scanned. Concise text (about half the words) improved usability by 58%; concise, scannable
  and objective text together improved it by 124%. Progressive disclosure past two levels "typically" has low
  usability.
- Sentence limits: GOV.UK splits sentences over 25 words, and Microsoft's Vale rule suggests under 30. No source was
  found for "average under 20", so Package 14's average rule is dropped.
- Generated reference is the one place for volatile facts (Diátaxis on reference; Google's docguide: "Duplication is
  evil … Link to it instead").

### Customization

The strongest model is Claude Code's "Extend Claude Code" page. It has:
- a goal-to-feature table;
- a "build your setup over time" trigger table;
- X-versus-Y comparisons;
- a "how features layer" section.

Its settings page adds scopes, "confirm what loaded" and worked precedence conflicts. Other models:
- Docusaurus swizzling ranks the cheap, safe option (wrap) before the risky one (eject). stamity's overlay is the wrap
  and its override is the eject.
- ESLint's `--print-config` and Nx's project details show what resolved.
- LazyVim states its merge rule per field.

### Visuals

- Text carries the facts and the visual supplements it (GitLab, Google and Microsoft style guides; the W3C
  complex-images tutorial).
- Use SVG for diagrams, alt text of at most 155 characters, and no information carried by colour alone.
- GitHub renders `<picture>` and Mermaid. It shows Mermaid inside a sandboxed frame, which some proxies block.
- Docusaurus 3.10 in `.md` mode passes raw HTML through `rehype-raw`. It resolves `![]()` through webpack with width
  and height, so the page does not shift. It supports `:::` admonitions but not GitHub alerts without a plugin.
- Generated SVG files beat tool-specific editors (D2, Excalidraw, tldraw) and recordings (GIF, video) for this repository:
  - they have no binary toolchain;
  - they diff as text;
  - CI can regenerate them;
  - one ground-independent file works in both themes.

### Agents

- `llms.txt` is still "a proposal" (llmstxt.org). Ahrefs reports that 97% of 137,000 sites saw no request for it in May
  2026, so it is cheap to keep but no reason to build more.
- Agent docs evals work best with three things (Vercel 2026-01-27, Mintlify 2026-06-08, Anthropic 2026-01-09):
  deterministic graders, a no-docs baseline that catches answers from training data, and thresholds declared before the
  run.

### Sources

All accessed 2026-10-02:
- https://code.claude.com/docs/en/features-overview
- https://code.claude.com/docs/en/settings
- https://docs.github.com/en/contributing/style-guide-and-content-model/about-the-content-model
- https://kubernetes.io/docs/contribute/style/page-content-types/
- https://diataxis.fr/how-to-use-diataxis/
- https://scholarworks.iu.edu/journals/index.php/ijdl/article/download/12887/19557/33610
- https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/
- https://www.nngroup.com/articles/progressive-disclosure/
- https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/
- https://raw.githubusercontent.com/errata-ai/Microsoft/master/Microsoft/SentenceLength.yml
- https://google.github.io/styleguide/docguide/best_practices.html
- https://docusaurus.io/docs/swizzling
- https://eslint.org/docs/latest/use/configure/debug
- https://www.lazyvim.org/configuration/plugins
- https://docs.gitlab.com/development/documentation/styleguide/
- https://developers.google.com/style/images
- https://www.w3.org/WAI/tutorials/images/complex/
- https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams
- https://docusaurus.io/docs/markdown-features/assets
- https://llmstxt.org/
- https://ahrefs.com/blog/what-is-llms-txt/
- https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents

## Decisions

### The maintainer's walk (2026-10-02, through the question tool; every answer the recommended option)

1. **Placement:** after Package 20 (1.12.0) and before Package 12. No release: the site is published by dispatch at
   the package's end, and the npm README follows at the next release cut.
2. **Visuals:** a brand diagram kit drawn from code into small SVG files, with one file serving both themes on the site
   and on GitHub. Terminal output and file trees stay real text blocks.
3. **Proof:** an agent reader test plus the maintainer's walkthrough of the quickstart and customization.
   - 8 real tasks, each tried 3 times by an agent using only the docs.
   - A no-docs baseline that catches guessing.
   - The bar is declared first: 7 of 8 tasks pass in 2 of 3 tries.
4. **The two CLI gaps the research found** go to Package 20 file 1, as inbox rows its intake picks up. The gaps:
   - `stamity config` cannot return a key other than `gates.*` to its default;
   - `config list` and `docs/configuration.md:51` show `hooks.userHooksDir` as `none`, while the engine uses
     `.stamity/hooks`.

   This package documents whatever 1.12.0 shipped and says plainly what still cannot be undone.

### Settled by this plan (declared defaults; the maintainer may reverse any before the run starts)

| # | Default | Why |
|---|---|---|
| S1 | **No new spec.** The acceptance is G1–G9 in the units. The lasting rules are the docs contract (`a1-docs-contract`) and `test/docs/`. | `test/records/specStatus.test.ts` counts a plan as shipped once the newest `v*` tag descends from its `stamp:` (`:211-217`). It then holds every `docs/specs/*.md` path named anywhere in the plan's text to a status other than `design` (`:62`, `:159-164`). This plan is stamped before 1.12.0 and runs after it, so a new `design` spec named here would turn that check red at the 1.12.0 cut, and 1.12.0's flip step would mislabel it. Writing the bare file name to dodge the check is an evasion, not a fix (the learning `a-plan-naming-a-new-spec-commits-its-skeleton`). |
| S2 | **No existing URL changes.** Content moves between pages, new pages get new URLs, and there is no redirect plugin. `docs/migration.md` stays untouched. | It is the one externally promised route (`test/ci/docsSite.test.ts`), and it keeps the one release-cut stamp the date checks require (the cut-form floor in `test/docsPages.test.ts`, near `:902`). |
| S3 | **Pages stay `.md`.** | A `.mdx` page is silently dropped from the sidebar (`website/sidebars.ts:44` checks `${id}.md`) and is unseen by the roster test (`test/ci/docsRoster.test.ts:90`). GitHub would also show its JSX as raw text. |
| S4 | **The diagram kit.** A zero-dependency ESM generator, `scripts/visuals.mjs`, draws every diagram from a spec into a committed SVG under `docs/visuals/`. The existing Mermaid spine stays; every new diagram uses the kit. | No binary toolchain; text diffs; CI regeneration; one file for both themes; GitHub readers need committed files. |
| S5 | **Callouts are GitHub alerts** (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`). On the site they render as admonitions through `remark-github-admonitions-to-directives`, pinned. | One syntax that GitHub, the site and agents all read. |
| S6 | **Local site search** with `@easyops-cn/docusaurus-search-local`, pinned. It is the first item to drop if it does not fit. | No third party, and no query leaves the browser. That matches the project's no-telemetry stance (`SECURITY.md:114-116`). |
| S7 | **`SECURITY.md` keeps the GitHub convention.** It holds how to report, supported versions, scope, a network summary and a link. Its control inventory, publish path, gaps and network detail move whole into `docs/security-mapping.md`, which becomes "Security model" (file 2). | Security reviewers get one door on the site, and the inventory is no longer off-site. |
| S8 | **`README.md` becomes a front door** of at most 700 words. Its contributor material moves to `CONTRIBUTING.md` (file 2). | About 60% of today's README serves contributors (`README.md:84-155`). |
| S9 | **Every rewritten hand page declares `kind:` and `description:`** in its frontmatter, and its budget follows the kind. | Agents read the type, the site uses `description` as its meta description, and the check reads the kind. |
| S10 | **Three sessions, one PR each, no release.** File 3 publishes the site with `workflow_dispatch` (`deploy: true`). | Docs-only. Every release needs a fresh full eval run, which a docs change does not warrant. |
| S11 | **Reader-test trials.** Condition B (docs only) gets 3 tries per task. Condition A (no docs) gets 1 try per task, plus 2 more when the first passes. That is 32 to 48 agent sessions. | The baseline catches answers from training data at the least cost. |
| S12 | **Models.** Opus 5.5 (`opus`) for every role: writers, editor, reviewers and reader-test agents. Fable 5.1 (`fable`) only for file 2's final whole-branch review. | The current model mix. The reader test has deterministic graders, so it needs no judge. |
| S13 | **Stamps.** An edited page moves to the commit form `verified against the tree at commit <sha7>. Re-attested <YYYY-MM-DD>.` and `REATTESTATION_DATE` moves with it. | The hand-page date contract in `test/docsPages.test.ts`. |
| S14 | **The landing page** (`website/src/pages/index.tsx`) changes only its calls to action and may show the hero diagram. Its redesign stays out. | The maintainer's to-do list carries the redesign separately. |
| S15 | **The word baseline** is measured once, at this file's intake, by the same counter the prose check uses. It is committed with its commit and date. | A threshold declared before the work, measured the same way at both ends. |
| S16 | **The docs contract** is a rule override in this repository's own setup (`.stamity/overrides/rules/docs-contract.md`, scoped to the docs paths). Every agent that opens a docs file here loads it. | Plans move to the `records` branch after Package 18, so the contract has to live on `main`. A glob-scoped rule costs nothing in sessions that never touch docs, and it dogfoods the customization the docs describe. |

### Before this file runs

- **Package 20 is closed.** Its three files are merged and 1.12.0 is released (`git tag --list 'v1.12.*'` shows the
  tag), and Packages 19 and 18 are merged. Otherwise stop with `BLOCKED_DEPENDENCY` naming Package 20.
- **Where this plan lives.** After Package 18, `docs/plans/` and the run records live on the `records` branch and, in
  the maintainer's checkout, in place (`scripts/records.mjs`). Read this file from there.
- **Freshness.** Packages 19, 18 and 20 edit most of the paths in `reads:`, so expect `STALE` on nearly every unit. Each
  unit re-reads its paths at intake and re-locates the facts it cites; the line numbers below are as of `81b71b09`.
  Package 20 adds `docs/choose-a-route.md` and new sections and pins on the customization, troubleshooting,
  enterprise-forks, enterprise-quickstart and plugins pages (plan 016 file 3's units `u3-route-guide`,
  `u3-customization-per-route`, `u3-rollout-guides`, `u3-troubleshooting`, `u3-reset-guide`, `u3-settings-constraints`,
  `u3-cli-pin-update-paths` and `u3-quickstart`). This file's test split carries those pins with the rest.
- **Inbox first.** Read the inbox rows that cite `docs/plans/017-docs-overhaul-01.md` and evaluate them before
  building.

## Spec delta

**Empty.** This package changes no product requirement:
- its acceptance criteria are G1–G9, carried by the units below;
- its lasting rules live in the docs contract (`a1-docs-contract`) and in `test/docs/`;
- a new `docs/specs/` file was considered and rejected, for the reason in S1.

## Units

Every unit leaves the gates green on its own: `npm run lint && npm run typecheck && npm run test`. The CI parity
checks the local gate misses also apply wherever a unit touches `src/` or adds tests: `npm test -- --coverage` and the
Windows path rules (the learning `the-local-test-gate-is-weaker-than-ci`). Read every gate by its exit code, never
through `| tail`.

### a0-intake — absorb what Packages 19, 18 and 20 changed, and capture the planning run's learning

| Field | Content |
|---|---|
| `id` | `a0-intake` |
| `requirements` | spec carries no ids (package goal G9) |
| `files` | `.stamity/learnings/<id>.md` (one new learning, written through `node dist/cli.js learn capture` only); the run record's intake section |
| `interfaces` | **(1) A freshness verdict per unit** `a1`–`a8`, in the run record: `fresh`, or `STALE` naming the moved `reads:` paths. **(2) The "what 1.12.0 left" table:** every page, section and test pin Packages 19, 18 and 20 added to the docs, with its path and line on the base commit. Plan 016 file 3 names the expected ones: `docs/choose-a-route.md` with its eleven `##` headings; `## What reaches each client on each route?` in the customization guide; the rollout `###` subsections; `## When a route misbehaves` in troubleshooting; the reset and settings sections in the fork guide; the CLI pin and update paths; the quickstart's new day steps. **(3) The learning, captured through the learn skill's path.** Summary: "a plan stamped before a release that runs after it counts as shipped at that release, so a new design spec it names turns test/records/specStatus.test.ts red at that cut". Evidence: `test/records/specStatus.test.ts:211-217` (`shippingUnder`: `git merge-base --is-ancestor <stamp> <tag>`), `:62` (`SPEC_REFERENCE` scans the plan's whole text) and `:159-164` (a named `design` spec is a problem once shipped). After plan 014 file 2 the scan runs under `npm run test:records`. Confidence: high. How to apply: a plan for a package scheduled after the next release names no new `design` spec, or amends a shipped one. |
| `testCriteria` | **Given** the learning captured, **when** `node dist/cli.js validate` runs, **then** it exits 0. **And when** `node dist/cli.js check` runs, **then** its `learnings` row reads `ok`. **Given** the run record, **then** it states one freshness verdict for each of `a1`–`a8` and holds the "what 1.12.0 left" table with one row per added page or section. |
| `edgeCases` | **A learning on the same finding already exists** (Package 18 or 20 captured it): capture nothing and cite it. **The save gate refuses the capture:** fix the field it names, and never write the learning file by hand. **1.12.0 is not released:** stop with `BLOCKED_DEPENDENCY` naming Package 20. **The troubleshooting page's sample still prints the old learnings count:** leave it; file 2's `b4-daily-use` re-captures that sample from a real `check` run. |
| `depends_on` | `docs/plans/016-fork-distribution-03.md` (`u3-release-1-12-0`) |
| `verify` | `npm run build && node dist/cli.js validate && node dist/cli.js check && npx vitest run test/learnings` |

### a1-docs-contract — the docs contract every agent here loads when it opens a docs page

| Field | Content |
|---|---|
| `id` | `a1-docs-contract` |
| `requirements` | spec carries no ids (package goals G9, G1, G2, G6) |
| `files` | `.stamity/overrides/rules/docs-contract.md` (new); the emitted copy under `.claude/rules/` (written by `node dist/cli.js sync`, never by hand); `CONTRIBUTING.md` (a `## Write or change a docs page` section of at most six lines, and one regeneration-table row); `test/docs/pages/contributing.test.ts` (its regeneration-commands case gains `node scripts/visuals.mjs --write`) |
| `interfaces` | **(1) The rule file**, verbatim below. It stays at most 100 lines, the rule class's advisory threshold (`docs/customization.md:145-150` on the base commit). **(2) `CONTRIBUTING.md`'s section**, verbatim below. **(3) A regeneration-table row:** `docs/visuals/*.svg` → `node scripts/visuals.mjs --write`. **(4) Stamps:** `CONTRIBUTING.md` moves to the commit-form stamp, and `REATTESTATION_DATE` in `test/docs/shared.ts` moves with it (S13). |
| `testCriteria` | **Given** the override, **when** `node dist/cli.js validate` runs, **then** it exits 0 and prints no warning naming `docs-contract`. **Given** `node dist/cli.js sync` then `node dist/cli.js check`, **then** `check` exits 0 and the emitted copy exists under `.claude/rules/`. **Given** `npx vitest run test/docsPages.test.ts test/docs`, **then** it exits 0 and the regeneration case lists six commands. **Given** `wc -l .stamity/overrides/rules/docs-contract.md`, **then** it is at most 100. |
| `edgeCases` | **The save gate refuses a root-file glob** (`README.md`): use the glob form it accepts (for example `**/README.md`, restricted by the rule's own first line), and keep the same four targets. **`sync` emits the rule under a prefixed name** (`stamity-docs-contract.md`): cite the name it writes. **The rule lands as an on-demand skill, not a path-scoped rule:** stop and report it. A rule with `globs:` must be path-scoped, so this would be a delivery bug. **`a4-site-foundations` dropped the alerts plugin:** the callout lines of the rule name `:::note` admonitions instead, and the run record says why. |
| `depends_on` | `a3-docs-test-split`, `a6-visual-kit`, `a4-site-foundations` |
| `verify` | `npm run build && node dist/cli.js validate && node dist/cli.js sync && node dist/cli.js check && npx vitest run test/docsPages.test.ts test/docs` |

#### a1 text — `.stamity/overrides/rules/docs-contract.md`

```markdown
---
id: docs-contract
type: rule
description: How a published page is shaped — its kind and word budget, one home per fact, diagrams with a text twin, the command form, and its stamp.
tags: [docs, writing]
scope: conditional
globs: ["docs/**/*.md", "README.md", "SECURITY.md", "scripts/visuals/**"]
load: on-demand
obsolete_when: the checks in test/docs/ and test/docsPages.test.ts hold every line below on their own, so this rule restates nothing a check does not already hold
---

# Docs contract

Read this before you write or move a page under `docs/`, `README.md` or `SECURITY.md`.
`test/docsPages.test.ts` and `test/docs/` hold most of it; the rest is review.

## Readers and places
- A page serves one reader: a first-time operator, a daily user, a customizer, a team lead, an
  enterprise platform owner, a security reviewer, a contributor, or an agent reading `llms.txt`.
- Every page renders on stamity.dev, on github.com and as raw Markdown. Write plain `.md`, never `.mdx`.

## Every page
1. Frontmatter: `title` (equal to the H1), `kind` (hub, tutorial, how-to, reference or explanation)
   and `description` (one sentence, at most 200 characters).
2. The stamp comment and the `Re-open when:` comment stay in the first six lines.
3. Sentence 1 says what the page is for. Sentence 2 says what the reader has at the end.
4. A task shows the command and its real output first, then explains.
5. Headings name a task or a question, never a label.
6. The page ends with `## Where to go next`: one to five links.

## Budgets
- Words of prose and table text, code not counted: hub 1,500 · tutorial 1,000 · how-to 1,800 ·
  reference 2,500 · explanation 1,500. Named exceptions live in `test/docs/prose.ts`, each with a reason.
- Every page stays under 50,000 characters.
- A sentence has at most 30 words. A paragraph has at most 5 sentences and 150 words.
- Use a list for three or more parallel items, a table only when every row shares the columns.
- Rare detail goes inside `<details>`. Never nest disclosure deeper than two levels.

## One home per fact
- A fact lives on one page. Another page links to it in one sentence and never restates it.
- Client differences: `docs/capability-matrix.md`. Dated vendor measurements: `.github/client-contracts.md`.
  Verbs, flags and exit codes: `docs/cli-reference.md`. Config keys: `docs/configuration.md`.
  Terms: `docs/glossary.md`. Release history: `CHANGELOG.md`.
- No history ("used to", "since 1.x"), test names, CI names or source symbols on a user page. The
  security page is the exception: its `file::symbol` addresses are evidence.
- Security facts move whole. Never shorten one to fit a budget.

## Commands
- Spell the CLI the way `docs/getting-started.md` sets it up. Write a bare `stamity <verb>` only on a
  page that links that setup first: a bare call fails where no install put `stamity` on PATH.
- A command block holds commands only. Its output goes in a `text` block below it.

## Visuals
- A diagram comes from `node scripts/visuals.mjs --write`, through `scripts/visuals/specs/<slug>.mjs`,
  into `docs/visuals/<slug>.svg`. Never edit an SVG by hand.
- Reference it as `![<alt, at most 155 characters>](visuals/<slug>.svg)`.
- Every label in a diagram also appears in the text beside it, as a table or a list under the same
  heading. The text carries the facts; the diagram helps the reader see them.
- Terminal output is a `text` block of real captured output. A file tree is a `text` tree.
- A Mermaid fence carries `accTitle` and `accDescr`, and a page holds at most one.
- No GIF, video or screenshot.

## Callouts and links
- Callouts are GitHub alerts: `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]` or
  `> [!CAUTION]`. Use at most two per page.
- Links are relative to the page. The only absolute links start `https://github.com/zomarit/stamity`
  or `https://stamity.dev`. Link text names the target, never "here".

## Words
- "stamity" is lowercase, always. "Touchpoint" is one of the nine `/st-*` commands. "Verb" is a CLI
  command. "Client" is Claude Code, Cursor, GitHub Copilot or Codex.
- Spell a term the way `docs/glossary.md` does. Add the term there before a page uses it.

## Stamps
- A page edited between releases reads `verified against the tree at commit <sha7>. Re-attested
  <YYYY-MM-DD>.`, and `REATTESTATION_DATE` in `test/docs/shared.ts` moves with it.
- `docs/migration.md` keeps its release-cut stamp until a release cut re-attests it.
```

#### a1 text — `CONTRIBUTING.md`, the new section

```markdown
## Write or change a docs page

Every page under `docs/`, plus `README.md` and `SECURITY.md`, follows the docs contract in
`.stamity/overrides/rules/docs-contract.md`. This repository's agents load it whenever they open a docs
page. `test/docsPages.test.ts` and `test/docs/` hold the parts a check can hold. Diagrams come from
`node scripts/visuals.mjs --write`, never from an editor.
```

### a2-prose-checks — the counter, the budgets, and the checks that keep pages short

| Field | Content |
|---|---|
| `id` | `a2-prose-checks` |
| `requirements` | spec carries no ids (package goals G1, G3, G6, G7) |
| `files` | `scripts/docs-words.mjs` (new: the one counter, plus a command that prints the per-page table); `test/docs/prose.ts` (new: budgets and constants, re-exporting the counter); `test/docs/prose.test.ts` (new); `test/docs/baseline.ts` (new) |
| `interfaces` | See **a2 interfaces** below the table. |
| `testCriteria` | **Given** the fixtures inside `test/docs/prose.test.ts`, **when** the rules run over them, **then** each fixture fails naming its page and its rule:<ul><li>a hub of 1,501 words;</li><li>a 31-word sentence;</li><li>a six-sentence paragraph;</li><li>a page with six next links;</li><li>a page with no `## Where to go next`;</li><li>an image with an empty alt;</li><li>an alt of 156 characters;</li><li>a Mermaid fence without `accDescr`;</li><li>two Mermaid fences on one page;</li><li>a `:::note` line;</li><li>a rewritten page without `description`.</li></ul>**And** the real tree passes. **Given** `node scripts/docs-words.mjs`, **then** it prints one row per page of the baseline set and a total equal to `BASELINE.total` at `BASELINE.commit`. **Given** `npx vitest run test/docs/prose.test.ts`, **then** it exits 0 and prints the current share of the baseline. |
| `edgeCases` | **Abbreviations and versions** (`e.g.`, `i.e.`, `1.12.0`): a full stop followed by a digit, a lowercase letter or another full stop does not end a sentence. **A table cell:** counts as its own sentence unit. **A list item without a full stop:** one sentence. **A GitHub alert marker** (`[!NOTE]`): counts no word. **`<details>` and `<summary>` text:** counts. **Inline code:** each span counts as one word. **CRLF line endings:** normalized before counting. **A page with no frontmatter** (`README.md`, `SECURITY.md`): never "rewritten" here; its budget lives in its own page test (file 2). |
| `depends_on` | `a0-intake`, `a3-docs-test-split` |
| `verify` | `npx vitest run test/docs/prose.test.ts && node scripts/docs-words.mjs` |

**a2 interfaces.**

```js
// scripts/docs-words.mjs — the one implementation of counting, imported by the test and run by hand
/** Prose words: frontmatter, HTML comments, fenced code, table separator rows, link targets and
 *  alert markers removed; table cells, inline code (one word per span) and <details> text kept. */
export function countProseWords(markdown) {}
/** Sentence units: prose sentences, list items and table cells; headings excluded. */
export function sentencesOf(markdown) {}
export function paragraphsOf(markdown) {}
/** The frontmatter `kind`, or null for a page not yet rewritten (or a page with no frontmatter). */
export function kindOf(markdown) {}
// Run as `node scripts/docs-words.mjs [--json]`: one row per page of the baseline set, then the total.
```

```ts
// test/docs/prose.ts
export { countProseWords, sentencesOf, paragraphsOf, kindOf } from "../../scripts/docs-words.mjs";
export type PageKind = "hub" | "tutorial" | "how-to" | "reference" | "explanation";
export const KIND_BUDGET: Readonly<Record<PageKind, number>> = {
  hub: 1500, tutorial: 1000, "how-to": 1800, reference: 2500, explanation: 1500,
};
/** Per-page budgets that differ from their kind's, each with the reason a reviewer reads. */
export const NAMED_BUDGET: Readonly<Record<string, { readonly words: number; readonly reason: string }>> = {
  "docs/enterprise-forks.md": { words: 3000, reason: "the upstream lane: one recurring task with its outcomes, conflicts, landing and recovery" },
  "docs/customization-recipes.md": { words: 2600, reason: "twelve recipes of about two hundred words each" },
  "docs/security-mapping.md": { words: 5000, reason: "security content moves whole and is never cut to fit a budget" },
};
export const MAX_PAGE_CHARS = 50_000;
export const MAX_SENTENCE_WORDS = 30;
export const MAX_PARAGRAPH_SENTENCES = 5;
export const MAX_PARAGRAPH_WORDS = 150;
export const MAX_NEXT_LINKS = 5;
export const MAX_ALT_CHARS = 155;
export const MAX_DESCRIPTION_CHARS = 200;
export const TOTAL_SHARE = 0.6;
/** The baseline set: the hand guides of test/docs/roster.ts minus docs/migration.md, plus README.md and SECURITY.md. */
export function baselineSet(): readonly string[];
```

```ts
// test/docs/baseline.ts — written once by this unit, at the intake commit, and never edited again
export const BASELINE = {
  commit: "<40-hex base commit>",
  date: "<YYYY-MM-DD>",
  total: 0, // the measured total
  pages: {} as Readonly<Record<string, number>>, // the measured per-page counts
} as const;
```

**The rules in `test/docs/prose.test.ts`.** A hand page "is rewritten" once it declares `kind:`. Without one it is
reported once on an `info` line and left alone. That way file 2's writers flip pages one by one, and nobody edits a
shared exemption list.

1. **A rewritten page carries frontmatter.** It needs `description:`: one sentence of at most 200 characters.
2. **A rewritten page fits its budget:** `KIND_BUDGET[kind]`, or its `NAMED_BUDGET` entry.
3. **Sentences and paragraphs on a rewritten page.** No sentence over 30 words. No paragraph over five sentences or 150
   words.
4. **A rewritten page ends with `## Where to go next`,** holding one to five links.
5. **Every page under `docs/` is under 50,000 characters,** whether rewritten or generated. Hand pages not yet
   rewritten are exempt; on the base commit `docs/enterprise-forks.md` holds about 59,000.
6. **Images on every hand page.** Every `![alt](src)` and every `<img … alt="…">` has a non-empty alt of at most 155
   characters.
7. **Mermaid on every page.** Every Mermaid fence carries `accTitle:` and `accDescr`, and a page holds at most one
   fence.
8. **No `:::` line on a hand page.** Callouts are GitHub alerts (S5).
9. **The total.** Once no page of the baseline set lacks `kind:`, the sum of `countProseWords` over the set is at most
   `TOTAL_SHARE × BASELINE.total`. `README.md` and `SECURITY.md` count toward the total, and their own page tests hold
   their budgets. Until then the test prints the current share.

There is one counter. `scripts/docs-words.mjs` holds it and prints the table; `test/docs/prose.ts` re-exports it. So the
baseline, the check and a human's count can never disagree.

### a3-docs-test-split — one test file per page, so file 2's writers can work in parallel

| Field | Content |
|---|---|
| `id` | `a3-docs-test-split` |
| `requirements` | spec carries no ids (package goals G9, G2) |
| `files` | See **a3 files** below the table. |
| `interfaces` | See **a3 interfaces** below the table. |
| `testCriteria` | **Given** the tree, **when** `npx vitest run test/docsPages.test.ts test/docs` runs, **then** it exits 0. **Given** the inventory recorded before and after the split (each `it(` name and its `expect(` count, by `node -e` over the files), **then** every old case name appears exactly once in the new files. The only exceptions are the cases whose literal was replaced by a derivation, each listed in the run record with its reason; no case is dropped silently. **Given** a scratch guide `docs/zz-probe.md` with the hand-page header and no sidebar entry, **then** the sidebar case fails naming it; the probe is deleted afterwards. **Given** a scratch verb registered in a scratch copy of the program, **then** the README verb case fails naming it. |
| `edgeCases` | **Package 18 already moved** the run-of-record disclosure case to `test/records/docsPages.test.ts` (plan 014 file 2, `r3`): leave it there and move only what is still in this file. **Deriving the verbs from `src/cli.ts`** means importing the program, which registers side effects. If so, read the `##` verb headings of the generated `docs/cli-reference.md` instead; it renders from the program. **A case reads two pages:** it moves to `crossPage.test.ts`. **Windows:** compose every path with `node:path` and display it POSIX. |
| `depends_on` | `a0-intake` |
| `verify` | `npx vitest run test/docsPages.test.ts test/docs && npm run typecheck && npm run lint` |

**a3 files.**
- `test/docsPages.test.ts` keeps only the cross-page hand-page contract:
  - the roster;
  - existence;
  - links;
  - product names and reserved tokens;
  - the currency header and the dates;
  - sidebar title equal to the H1;
  - the leak-gate spawn;
  - reachability through `llms.txt`.

  The `Re-open when:` comment on every page names this file, so that sentence stays true.
- `test/docs/shared.ts` (new) holds the constants and helpers: `CURRENCY_HEADER`, `RELEASE_CUT_DATE`,
  `REATTESTATION_DATE`, the link rules, `sectionOf`, `readPage` and `COUNT_WORDS`.
- `test/docs/roster.ts` (new) holds the derived roster.
- `test/docs/pages/<page>.test.ts` (new) is one file per page with page-specific pins. The pages are readme, security,
  contributing, security-mapping, customization, workspaces, enterprise-forks, enterprise-quickstart, plugins,
  packs-and-trust, getting-started, working-with-stamity, troubleshooting, doctrine, migration and choose-a-route.
- `test/docs/runOfRecord.test.ts` (new) holds the README and doctrine run-of-record cases still in the old file.
- `test/docs/crossPage.test.ts` (new) holds the pins that read several pages: the Codex 0.155.1 sites, the managed-block
  phrase and the Codex `$st-<id>` sentence.
- `test/docs/evidencePages.test.ts` (new) holds `.github/client-contracts.md`.

**a3 interfaces.** Four literals become derivations. Everything else moves verbatim, one `describe` per file, under its
old name.

- **`HAND_GUIDES`** is every `docs/*.md` whose first comment after the frontmatter is the `HAND-WRITTEN PAGE` header,
  sorted. It replaces the literal `GUIDES` (`test/docsPages.test.ts:152-174`).
- **`MAPPED_GUIDES`** is every id `website/sidebars.ts` lists (the existing `/'([a-z0-9/-]+)'/g` read), mapped to
  `docs/<id>.md`, hand pages only. It replaces `:187`.
- **The advertised verbs** are the commands the program registers, in registration order. They replace both literal
  verb arrays (README `:1175-1222`, getting started `:2438-2490`).
- **The doctrine count sentences** compare the roster sizes, spelled through `COUNT_WORDS`, with the page's words. They
  replace the literals at `:2017-2027`.

One rule is widened on purpose: the absolute-link rule (`:407-410`) also allows `https://stamity.dev`. That is a
deliberate test change, justified because README links the published docs home (file 2).

### a4-site-foundations — callouts, local search, Markdown copies for agents, and the site's own type check

| Field | Content |
|---|---|
| `id` | `a4-site-foundations` |
| `requirements` | spec carries no ids (package goals G3, G7, G6) |
| `files` | `website/package.json`; `website/package-lock.json`; `website/docusaurus.config.ts`; `website/src/css/custom.css` (only if the search box fails contrast in either theme); `.github/workflows/docs-site.yml`; `scripts/site-markdown-twins.mjs` (new); `test/ci/docsSite.test.ts`; `test/ci/workflow.test.ts` (only where it pins the docs-site steps) |
| `interfaces` | See **a4 interfaces** below the table. |
| `testCriteria` | **Given** `cd website && npm ci --ignore-scripts && npm run typecheck && npm run build`, **then** every step exits 0. **Given** a probe page with `> [!NOTE]`, built in a scratch copy of the site, **then** the HTML holds an admonition of type note. **Given** the built site, **then** the search plugin's index file exists under `website/build/`. **Given** `node scripts/site-markdown-twins.mjs website/build` after a build, **then** it exits 0 and every `llms.txt` target exists under `website/build/`. **Given** a scratch `llms.txt` naming a missing file, **then** it exits 1 naming that file. **Given** `npx vitest run test/ci/docsSite.test.ts test/ci/workflow.test.ts`, **then** it exits 0, including new cases: the twins step runs after the `llms.txt` copy, `look: 'classic'` is set, and the site type-check step exists. |
| `edgeCases` | **The search plugin's peer range excludes Docusaurus 3.10.2 or React 19:** drop it (S6), record why, keep the rest. **The alerts plugin does not turn an alert into an admonition under `format: 'detect'` for `.md`:** drop it; the contract's callout line then names `:::` admonitions (`a1` follows), and the run record says why. **The dependency audit reports an advisory:** stop and ask. **`exclude` breaks onto several lines:** keep it on one line, because `test/ci/docsSite.test.ts:146-176` reads it by a single-line regex. **A Markdown twin path collides with a site route** (`docs/<page>.md` against `docs/<page>/`): none does, since the route has no `.md` suffix; the test asserts both exist. |
| `depends_on` | `a0-intake` |
| `verify` | `cd website && npm ci --ignore-scripts && npm run typecheck && npm run build && cd .. && node scripts/site-markdown-twins.mjs website/build && npx vitest run test/ci/docsSite.test.ts test/ci/workflow.test.ts` |

**a4 interfaces.**

- **Callouts.** Pin `remark-github-admonitions-to-directives` to an exact version (2.1.0 was the latest on 2026-10-02;
  re-read the registry). Add it to `beforeDefaultRemarkPlugins` after `repoLinks` (`website/docusaurus.config.ts:175`).
  It maps NOTE → note, TIP → tip, IMPORTANT → info, WARNING → warning and CAUTION → danger.
- **Search.** Pin `@easyops-cn/docusaurus-search-local` to an exact version (0.55.3 on 2026-10-02). Add it to `themes`
  (`:201`) beside `@docusaurus/theme-mermaid`, with `{hashed: true, indexDocs: true, indexBlog: false, indexPages:
  false, docsRouteBasePath: 'docs', language: ['en']}`.
- **Mermaid look.** Set `themeConfig.mermaid.options.look: 'classic'`. `@docusaurus/theme-mermaid` accepts
  `mermaid >=11.6.0`, and Mermaid 12 makes `neo` the default flowchart look, so a lockfile refresh would restyle the
  site.
- **Broken anchors.** `onBrokenAnchors` stays `'warn'` (`:112`) in this file. Count the build's anchor warnings and
  record them. File 2's integration unit sets it to `'throw'` once the pages are rewritten.
- **`scripts/site-markdown-twins.mjs <build-dir>`.** Reads `llms.txt`, takes every repository-relative link target, and
  copies each file to `<build-dir>/<target>`. Exits 1 naming any missing target. Afterwards
  `https://stamity.dev/docs/getting-started.md` serves the Markdown the index names, and the index's intro sentence
  that "the published site mirrors the same paths" (`src/cli/docs/llmsIndex.ts:24-28`) becomes true.
- **`.github/workflows/docs-site.yml`.** The build job runs `npm run typecheck` in `website/` before `npm run build`.
  The site's `tsc` never runs in CI today. Then `node scripts/site-markdown-twins.mjs website/build` runs right after
  `cp llms.txt website/build/llms.txt` (`:119-120`).
- **Dependency audit.** Run the dependency audit skill over `website/`, with the two new packages, and record it.

### a5-generated-reference — the generated pages say what each key does and how each artifact is customized

| Field | Content |
|---|---|
| `id` | `a5-generated-reference` |
| `requirements` | spec carries no ids (package goals G4, G5, G2) |
| `files` | See **a5 files** below the table. |
| `interfaces` | See **a5 interfaces** below the table. |
| `testCriteria` | **Given** `npx vitest run test/cli/docs test/emit/capabilityMatrix.test.ts`, **then** it exits 0, with these new cases:<ul><li>every `KEY_SPECS` row has a `meaning` of 1 to 100 characters;</li><li>`docs/configuration.md` has a `What it does` column;</li><li>the reviewer agent's line names `.stamity/overrides/agents/reviewer.customize.md` and `.stamity/overrides/agents/reviewer.md`;</li><li>the `st-qa` skill's line names `skills/qa/SKILL.customize.md`;</li><li>the migrations rule shows `**/*.sql`;</li><li>a pack-supplied artifact reads "cannot be replaced or patched".</li></ul>**Given** `node scripts/generate-docs.mjs && node scripts/generate-capability-matrix.mjs && git diff --exit-code docs/ llms.txt` after the commit, **then** it exits 0. **Given** `npm test -- --coverage`, **then** `src/cli/commands/config.ts` and the generators keep their per-file floors. |
| `edgeCases` | **Package 20 changed `KEY_SPECS`** (the config reset and `hooks.userHooksDir`, its file 1): write meanings for the rows as landed. **A key Package 20 did not fix still reports a wrong unset value:** the page states what the engine uses, and an inbox row stays open. **A pack manifest states no trust tier:** the line says "tier: not stated". **A skill override keeps the bundled spelling at emission** (`docs/customization.md:61-74`): the line names the file the user writes, not the emitted copy. |
| `depends_on` | `a0-intake` |
| `verify` | `npx vitest run test/cli/docs test/emit/capabilityMatrix.test.ts && node scripts/generate-docs.mjs && node scripts/generate-capability-matrix.mjs && git diff --exit-code docs/ llms.txt && npm test -- --coverage` |

**a5 files.**
- `src/cli/commands/config.ts`: `ConfigKeySpec` gains `readonly meaning: string`, and every `KEY_SPECS` row fills it.
  The change is data only.
- `src/cli/docs/configReference.ts`: a `What it does` column, and the lowercase product name at `:266`.
- `docs/configuration.md`: regenerated.
- `src/cli/docs/referencePages.ts`: a `Customize` line per artifact, scope and globs on the rules page, and the trust
  tier per pack where its manifest states one.
- `docs/reference/*.md`: regenerated.
- `src/emit/capabilityMatrix.ts`: the at-a-glance hook row states where a hook is enforced, and the Copilot facts gain
  the default-branch line.
- `docs/capability-matrix.md`: regenerated.
- `test/cli/docs/configReference.test.ts`, `test/cli/docs/referencePages.test.ts`, `test/emit/capabilityMatrix.test.ts`.

**a5 interfaces.**

- **`meaning`.** One sentence of at most 100 characters, saying what the key changes for the reader. Example for
  `ruleDelivery`: "Whether rules without globs load every session or only when a task needs them."
- **`Customize` line** (one per artifact; never typed, always derived from the catalog item):
  `- **Customize:** patch with` `` `.stamity/overrides/<class>/<id>.customize.md` `` `or` `` `.customize.yaml` ``
  `; replace with` `` `.stamity/overrides/<class>/<id>.md` ``.
  - `<id>` is the declared `id`. For a command, drop the internal `cmd-` prefix.
  - A skill reads `skills/<id>/SKILL.customize.md` and `skills/<id>/SKILL.md`.
  - A pack-supplied artifact reads "cannot be replaced or patched; packs add new ids only"
    (`src/emit/planner.ts:600-603`).
- **Rules page.** Each rule gets `- **Applies to:**` followed by its globs, or by "every session" or "when a task needs
  it", read from `scope` and `load`.
- **Capability matrix.** In `## Coverage at a glance` (`src/emit/capabilityMatrix.ts:743`), each client's
  hook-enforcement cell says where the fail mode holds when it differs between interactive and headless use, or between
  the CLI and an IDE. It derives from the facts the dialect section already renders. The Copilot cell then agrees with
  its dialect rows: tool errors block, timeouts fail open, and VS Code hooks are in preview (`docs/capability-matrix.md:32`
  against `:267` and `:297` on the base commit). The Copilot facts also gain "cloud agents read hooks from the default
  branch", which the customization page carries today (`docs/customization.md:352`) and the matrix does not.

### a6-visual-kit — the on-brand diagram kit and its checks

| Field | Content |
|---|---|
| `id` | `a6-visual-kit` |
| `requirements` | spec carries no ids (package goal G6) |
| `files` | `scripts/visuals.mjs`; `scripts/visuals/tokens.mjs`; `scripts/visuals/svg.mjs`; `scripts/visuals/templates.mjs`; `scripts/visuals/specs/hero-one-corpus.mjs`; `scripts/visuals/specs/customize-ladder.mjs`; `scripts/visuals/specs/precedence-stack.mjs`; `docs/visuals/hero-one-corpus.svg`; `docs/visuals/customize-ladder.svg`; `docs/visuals/precedence-stack.svg`; `test/ci/visuals.test.ts` (all new) |
| `interfaces` | See **a6 interfaces** below the table. |
| `testCriteria` | **Given** `node scripts/visuals.mjs --check`, **then** it exits 0. **Given** one byte changed in a committed SVG in a scratch copy, **then** `--check` exits 1 naming that file. **Given** `npx vitest run test/ci/visuals.test.ts`, **then** it exits 0 and checks 1–8 below pass over the three pilots and over one fixture spec per template. Check 7 runs with orphans allowed. **Given** a fixture SVG holding `<script>`, an `onload=` attribute, or a curve command written straight against a negative two-digit number with no space between them, **then** checks 2 and 6 fail naming it. **Given** the QA row K1, **then** the maintainer has approved the pilots' look, or named the changes and seen them made. |
| `edgeCases` | **A label too long for its box at the 8 px grid:** the template widens the box. It never shrinks the font below `SIZE_SUB`, never clips, and wraps at a word boundary into a second `tspan`. **A spec names an unknown template:** `--write` exits 1 naming it. **GitHub dark-dimmed ground:** the stroke still clears 3:1 (about 3.4:1, computed). **The tokens drift from `custom.css`:** the tokens test fails naming the variable. **The maintainer rejects the pilots' look:** iterate on the tokens and templates in this unit; file 2 does not scale the kit before K1 passes. |
| `depends_on` | `a0-intake` |
| `verify` | `node scripts/visuals.mjs --check && npx vitest run test/ci/visuals.test.ts && node scripts/leak-gate.mjs` |

**a6 interfaces.**

**The spec shape** (`scripts/visuals/specs/<slug>.mjs`):

```js
/** @type {import('../../visuals.mjs').VisualSpec} */
export default {
  slug: 'precedence-stack',
  template: 'stack', // 'flow' | 'stack' | 'ladder' | 'timeline' | 'grid' | 'map'
  title: 'Which customization wins', // the SVG <title>, and the alt text the page uses
  desc: 'Your override or patch wins over the fork layer, which wins over the corpus or a pack.', // the SVG <desc>
  items: [ // template-specific; each item renders as one shape
    { id: 'yours', label: 'Your override or patch', sub: '.stamity/overrides/', fill: 'primary' },
    { id: 'fork', label: 'Fork layer', sub: 'fork/', fill: 'deep' },
    { id: 'base', label: 'Corpus or pack', sub: 'content/, packs/', fill: 'deep', dashed: false },
  ],
  edges: [], // flow and map templates: { from, to, label?, dashed? }
  facts: ['Your override or patch', 'Fork layer', 'Corpus or pack'], // must appear in the host page's text
}
```

**The command:**
- `node scripts/visuals.mjs --write [slug …]` writes `docs/visuals/<slug>.svg` for the named specs, or for all of them.
- `node scripts/visuals.mjs --check` renders every spec in memory and exits 1, listing each committed SVG that differs,
  each spec without its file, and each SVG without its spec.
- The script has no dependency beyond Node's standard library.

**Tokens** (`scripts/visuals/tokens.mjs`):

| Token | Value |
|---|---|
| `FILL.primary` | `#6B24FF` |
| `FILL.deep` | `#4F00F5` |
| `STROKE` | `#8A52FF` |
| `STROKE_WIDTH` | `2` |
| `TEXT` | `#FFFFFF` |
| `FONT` | `system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` |
| `SIZE_LABEL` | `14` |
| `SIZE_SUB` | `12` |
| `RADIUS` | `10` |
| `GRID` | `8` |
| `CHAR_WIDTH` | `0.6` (× the font size; box widths come from it, so the output is the same on every OS) |
| `DASH` | `'6 4'` |
| `GROUNDS` | `#FBFBFD`, `#09090C` (the site's two backgrounds), `#FFFFFF`, `#0D1117`, `#22272E` (GitHub's light, dark and dimmed grounds) |

A test holds `FILL.primary`, `FILL.deep` and `STROKE` equal to the brand scale in `website/src/css/custom.css`, so the
kit follows the brand.

**The six templates** (`scripts/visuals/templates.mjs`):
- `flow`: boxes and arrows, left to right, with optional edge labels on filled chips.
- `stack`: layers top to bottom, the highest precedence on top.
- `ladder`: rungs from cheapest to strongest.
- `timeline`: phases on one axis, optionally in swimlanes.
- `grid`: rows × columns of filled cells with short labels.
- `map`: grouped boxes with connecting edges.

**Rendering rules** (`scripts/visuals/svg.mjs`):
- **Root element.**
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox width height role="img" aria-labelledby="<slug>-title <slug>-desc">`,
  then `<title id>` and `<desc id>`.
- **Ground and fills.** The ground stays transparent. Every shape is filled with a token fill and stroked with `STROKE`
  at `STROKE_WIDTH`. Text sits only on fills, never on the ground.
- **Telling shapes apart.** Use shape (box, pill, diamond) and stroke style (solid for shipped, dashed for opt-in),
  never colour alone. Arrows come from one `<marker>`.
- **Numbers.** Round to one decimal, with no exponent. Put a space after every path-command letter, so path data never
  reads like a private-ledger id to `scripts/leak-gate.mjs`.
- **Allowed elements:** `svg`, `g`, `title`, `desc`, `defs`, `marker`, `rect`, `path`, `line`, `polyline`, `polygon`,
  `circle`, `text`, `tspan`.
- **Allowed attributes:** presentation attributes, plus `id`, `role`, `aria-labelledby`, `viewBox`, `xmlns`, `width`,
  `height`, `marker-end` and `transform`. `transform` takes `translate` only.

**The checks in `test/ci/visuals.test.ts`:**
1. **Regeneration.** `--check` exits 0.
2. **Allowlist.** Only the allowed elements and attributes appear. Nothing named `script`, `foreignObject`, `image`,
   `style`, `use` or `on*`, and no external `href`. A committed SVG is served from stamity.dev's own origin, and script
   in it would run there.
3. **Size.** Each file is at most 16,384 bytes. All of `docs/visuals/` together is at most 204,800 bytes.
4. **Contrast, by the WCAG relative-luminance formula.** `TEXT` on each fill is at least 4.5:1 (WCAG 2.2 1.4.3).
   `STROKE` on each ground is at least 3:1 (1.4.11).
5. **Name and description.** Each file has `role="img"`, a `<title>` equal to `spec.title` and at most 155 characters,
   and a non-empty `<desc>`.
6. **Private-id shape.** No letter is immediately followed by a hyphen and two to four digits. The private-id rule at
   `scripts/leak-gate.mjs:550-560` would read a curve command glued to a negative two-digit number as a ledger id.
7. **Same facts.** For every page that references `visuals/<slug>.svg`, each `spec.facts` string appears in that page's
   text, compared case-insensitively with whitespace normalized. In this file `ORPHANS_ALLOWED = true`. File 2's
   integration unit sets it to `false`, and from then on every SVG must be referenced by a page.
8. **Determinism.** Every template renders a test-only fixture spec twice, byte for byte the same. This covers the
   templates the pilots do not use.

**The three pilots, with the facts each carries:**

| Pilot | Facts |
|---|---|
| `hero-one-corpus` | The `content/` corpus (charter, touchpoints, agents, skills, rules, hooks, MCP wiring) passes through `sync` and becomes each client's files: Claude Code (`CLAUDE.md`, `.claude/`), Cursor (`AGENTS.md`, `.cursor/`), GitHub Copilot (`AGENTS.md`, `.github/`) and Codex (`AGENTS.md`, `.codex/`). |
| `customize-ladder` | Cheapest first: a config key, then an overlay patch, an override, your own artifact, a pack, a workspace, and the fork layer. Each rung carries its scope. |
| `precedence-stack` | Highest on top: your override or patch, then the fork layer, then the corpus or a pack. The spec's `desc` notes that patch and replace never combine on one id. |

### a7-reader-test-kit — the protocol, the fixtures and the graders, declared before any run

| Field | Content |
|---|---|
| `id` | `a7-reader-test-kit` |
| `requirements` | spec carries no ids (package goal G8) |
| `files` | `.github/docs-reader-test.md` (new); `scripts/docs-reader/tasks.mjs` (new); `scripts/docs-reader/fixture.mjs` (new); `scripts/docs-reader/grade.mjs` (new); `test/ci/docsReader.test.ts` (new) |
| `interfaces` | See **a7 interfaces** below the table. |
| `testCriteria` | **Given** `npm run build && npx vitest run test/ci/docsReader.test.ts`, **then** it exits 0. For each of T1–T8 and R1–R2, the untouched fixture fails its grader with a named reason, and the scripted golden solution passes. **Given** `.github/docs-reader-test.md`, **then** it states the bar "7 of 8 tasks in at least 2 of 3 tries" and the contamination rule, and the test asserts both strings. |
| `edgeCases` | **T5 needs the ops pack to sync cleanly on Claude Code:** the 1.11.0 regression hit Cursor and Codex, and the fixture selects Claude Code only. If T5's golden fails, report it instead of changing the task. **No network in the test:** use the wrapper, never `npx`. **The security page's heading moves in file 2:** T8's grader follows the heading `## What it does not defend`, which file 2 keeps on the security page, and the security page's test pins it. **A grader needs real output wording** (T2's `patches` row): read it from a real `validate` run when the fixture is built, never from memory. |
| `depends_on` | `a0-intake` |
| `verify` | `npm run build && npx vitest run test/ci/docsReader.test.ts` |

**a7 interfaces.**

**The protocol** (`.github/docs-reader-test.md`) has these sections:

1. **Purpose.** Prove the docs carry a reader through real tasks.
2. **Tasks.** The table below, with the goal text exactly as an agent receives it.
3. **Conditions.**
   - **A:** the CLI only. `--help` is allowed. No docs, no repository source, no web.
   - **B:** a read-only copy of the published pages (`docs/**/*.md`, `README.md`, `llms.txt`). No repository source, no
     web.
4. **Trials.** B gets 3 tries per task. A gets 1 try per task, plus 2 more when the first passes.
5. **The bar, declared now.** B passes at least 7 of 8 tasks in at least 2 of 3 tries. Every passing B try cites at
   least one existing `page#section`.
6. **Contamination.** A task that A passes in at least 2 of 3 tries is swapped for reserve R1, then R2, before scoring.
7. **Triage.** Each failing B try is labelled `docs-gap` or `agent-error`, with one sentence of reason.
8. **Model.** Opus 5.5 for every agent. There is no judge, because the graders are deterministic.
9. **Records.** Results go to the running package's run record, as `reader-test/results.md`.
10. **Cadence.** Once at Package 21's close. After that, on demand after a change to getting started, customization or
    `llms.txt`. It is never part of the release eval set.

**The tasks** (`scripts/docs-reader/tasks.mjs`). Every fixture is a small git repository with a `package.json` whose
`test` script exits 0. Every grader reads end state only.

| Id | Goal text the agent receives | Fixture | Grader (end state only) |
|---|---|---|---|
| T1 | "Set stamity up in this repository for Claude Code, and make sure the setup is healthy." | empty sample project | `.stamity/manifest.json` exists with `tools` equal to `["claude"]`; `check` exits 0; `CLAUDE.md` holds the managed-block markers |
| T2 | "Make the reviewer agent insist that every behaviour change comes with a test, without copying the whole agent." | T1's end state | `.stamity/overrides/agents/reviewer.customize.md` exists with no `---` fence; no `.stamity/overrides/agents/reviewer.md`; `validate` exits 0 and prints the reviewer's `patches` row; after `sync`, `.claude/agents/stamity-reviewer.md` ends with the patch text |
| T3 | "Add a team rule that applies only to SQL files: every migration must be reversible." | T1's end state | a `.stamity/overrides/rules/<id>.md` with `scope: conditional` and a glob that matches `db/001.sql`; `validate` exits 0; after `sync`, the emitted rule exists under `.claude/rules/` |
| T4 | "`stamity check` fails in this repository. Make it pass without deleting the setup." | T1's end state with one generated file hand-edited | `check` exits 0; `.stamity/manifest.json` still exists; the edited file equals a fresh render |
| T5 | "Add the ops pack, then remove it again, leaving no trace of it." | T1's end state | after the task, no ops artifact is emitted, the ledger holds no ops entry, and `check` exits 0 |
| T6 | "A reviewer left comments on your pull request. Which stamity touchpoint handles them, and where do the docs say so? Write the answer to answer.md." | T1's end state | `answer.md` names `/st-pr-resolve` and cites a `docs/<page>.md#<anchor>` that exists in the docs copy |
| T7 | "Make the agents use `npm run verify` as the test gate in this repository." | T1's end state | `config get gates.test` prints `npm run verify`; after `sync` the generated gate text shows it |
| T8 | "Name two things stamity's engine does not defend against, and cite where the docs say so. Write the answer to answer.md." | T1's end state | `answer.md` holds at least two items listed under the security page's `## What it does not defend`, read from the docs copy, plus a citation that exists |
| R1 | "Undo the reviewer change in this repository." | T2's end state | the patch is gone; `validate` shows no reviewer `patches` row; the emitted reviewer equals the bundled render |
| R2 | "Share this repository's client choice with a second repository through a workspace." | two sample projects | the workspace file names both members; `workspace status` lists both |

**The commands:**
- `node scripts/docs-reader/fixture.mjs setup <task> <dir> [--cli <path-to-dist/cli.js>]` builds the fixture. With
  `--cli`, it puts a `stamity` wrapper on the fixture's PATH that runs that build, so no network is needed. Without it,
  the fixture installs the packed tarball with npm.
- `node scripts/docs-reader/grade.mjs <task> <dir> [--docs <dir>]` prints `PASS` or `FAIL <reason>` lines and exits
  0 or 1.
- `test/ci/docsReader.test.ts` runs, for each task, the untouched fixture (expect FAIL) and a scripted golden solution
  (expect PASS) through the wrapper.

### a8-close-file-1 — the review, the gates on every leg, the CHANGELOG and the merge

| Field | Content |
|---|---|
| `id` | `a8-close-file-1` |
| `requirements` | spec carries no ids (package goals G1, G6, G7, G8, G9) |
| `files` | `CHANGELOG.md` (`## [Unreleased]`); the run record; `.stamity/inbox.md` (only rows this file retires) |
| `interfaces` | **CHANGELOG lines.**<ul><li>Added: a docs contract and prose checks; the diagram kit; the docs reader-test kit; local search on stamity.dev; Markdown copies of every `llms.txt` target on stamity.dev.</li><li>Changed: the configuration page says what each key does; reference pages say how to customize each artifact; the capability matrix's at-a-glance hook row says where a hook is enforced.</li></ul>**Review rounds** on the PR until it is approved, with every Minor fixed or recorded:<ul><li>a correctness and tests lens;</li><li>a security lens over the SVG allowlist, the site's new dependencies and the twins script;</li><li>a docs lens over the contract text.</li></ul> |
| `testCriteria` | **Given** the PR head, **then** all of these pass, read by exit code:<ul><li>`npm run lint && npm run typecheck && npm run test`;</li><li>`npm test -- --coverage`;</li><li>`node scripts/leak-gate.mjs`;</li><li>`node scripts/repo-hygiene.mjs --base <base>`;</li><li>the site's `npm run typecheck && npm run build`;</li><li>CI green on every leg, Windows included.</li></ul>**And** QA row K1 has passed. **Given** the merge, **then** `main` is fast-forwarded and its push run is green. |
| `edgeCases` | **The known Windows fixture flake** (`test/ci/pluginLifecycle.test.ts`, an inbox Warning): re-run only its failed job, and record both runs. **The merge reads `BLOCKED` while green, up to date and approved:** use the repository's admin merge convention, recorded. |
| `depends_on` | `a1-docs-contract`, `a2-prose-checks`, `a3-docs-test-split`, `a4-site-foundations`, `a5-generated-reference`, `a6-visual-kit`, `a7-reader-test-kit` |
| `verify` | `npm run lint && npm run typecheck && npm run test && npm test -- --coverage && node scripts/leak-gate.mjs && node scripts/repo-hygiene.mjs --base <base>` |

## Execution order

1. **`a0-intake`** runs first, by the orchestrator, on the base commit.
2. **Parallel lanes, each in its own worktree with its own scratch:** `a3-docs-test-split`, `a4-site-foundations`,
   `a5-generated-reference`, `a6-visual-kit` and `a7-reader-test-kit`. They are file-disjoint:
   - `a3`: `test/docsPages.test.ts` and `test/docs/**`;
   - `a4`: `website/**`, `.github/workflows/docs-site.yml`, `scripts/site-markdown-twins.mjs`,
     `test/ci/docsSite.test.ts` and `test/ci/workflow.test.ts`;
   - `a5`: `src/cli/commands/config.ts`, `src/cli/docs/**`, `src/emit/capabilityMatrix.ts`, the generated pages and
     their tests;
   - `a6`: `scripts/visuals*`, `docs/visuals/**` and `test/ci/visuals.test.ts`;
   - `a7`: `.github/docs-reader-test.md`, `scripts/docs-reader/**` and `test/ci/docsReader.test.ts`.

   Never use `git stash`; take a patch file and `git restore` instead (the learning `git-stash-is-shared-across-worktrees`).
3. **`a2-prose-checks`** runs after `a3`, because it reads the roster, and measures the baseline on the base commit's
   pages.
4. **`a1-docs-contract`** runs after `a3`, `a4` and `a6`.
5. **`a8-close-file-1`** closes the file.

**Size:** about 6–8 h wall-clock and 8 units. **Maintainer touchpoints:** QA row K1 (the pilot diagrams' look), the
merge, and any dependency advisory.

## Shared contracts touched

| Contract | Owner here | Notes |
|---|---|---|
| The hand-page roster (`test/docs/roster.ts`) | `a3` | Derived, so no unit hand-edits it after `a3`. |
| `REATTESTATION_DATE` (`test/docs/shared.ts`) | `a1` | Only `a1` edits a hand page in this file (`CONTRIBUTING.md`). |
| `website/docusaurus.config.ts`, `website/package*.json` | `a4` | — |
| `KEY_SPECS` (`src/cli/commands/config.ts`) | `a5` | Data only; Package 20 also changed this registry. |
| `docs/visuals/` and its spec format | `a6` | File 2 adds specs in the same format. |
| `CONTRIBUTING.md`'s regeneration table | `a1` | Gains the visuals command. |
| The docs-site workflow's step list | `a4` | `test/ci/workflow.test.ts` pins its least-privilege split and deploy condition. |

## QA walk

| Row | Who | What | Pass |
|---|---|---|---|
| K1 | the maintainer | The three pilot diagrams on a local site build (`cd website && npm run build && npm run serve`), in light and dark, and in the PR's file view on github.com in light and dark. | "approve the look", or named changes, made and re-shown |
| K2 | automatic | The gates on every leg, read by exit code. | `a8`'s criteria |

## Risks

| Severity | Risk | Mitigation |
|---|---|---|
| Warning | **The test split silently weakens a pin.** A 2,799-line file is moving. | `a3` records every `it(` name and its `expect(` count before and after, and lists each derivation with its reason. The review reads the assertion diff, not only the green run. |
| Warning | **The diagrams look plain, and the "nice, custom visuals" goal fails.** | Pilot sign-off (K1) before file 2 scales the kit; six templates on one design grid. File 2 adds a design-quality review in both themes. |
| Warning | **The search plugin or the alerts plugin does not fit Docusaurus 3.10.2 and React 19.** | Exact pins, the dependency audit, and the documented fallbacks in `a4` (S6; `:::` admonitions). |
| Minor | **A committed SVG carries active content** (stamity.dev serves it on its own origin). | The element and attribute allowlist (`a6` check 2) plus generation only. |
| Minor | **Path data trips the leak gate's private-id rule.** | The space after every path command, and `a6` check 6. |
| Minor | **The new `meaning` field changes the CLI package** (`src/cli/commands/config.ts`). | Data only, read by the docs generator. It ships at the next release with the rest of `main`. |

## Inbox rows this file folds in

None. The docs rows of the inbox (the plugins ownership table; README's merge-ready figure; the troubleshooting sample
count; REQ-APM-004's README note; the `SECURITY.md` recheck date and ledger-row wording; the bare touchpoint names on the
plugin route) are folded into file 2's units, which own those pages.

## Open questions

None. The four answers of 2026-10-02 settle placement, visuals, the reader test and the CLI gaps.

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

- **Package 20 file 1, config reset:** `stamity config` cannot return a key other than `gates.*` to its default.
  `setConfigValue` has no unset path (`src/cli/commands/config.ts:829-849`), and `applyPin` has no clear
  (`:315-325`).
- **Package 20 file 1, `hooks.userHooksDir`:** it resolves to `none` in `config list`, in `get` and in
  `docs/configuration.md:51`. Emission and `validate` default to `.stamity/hooks` (`src/emit/hooksInfra.ts:129,469`;
  `src/cli/commands/validate.ts:229-245`).
- **The planning run's learning**, the spec-status timing trap, which `a0-intake` captures.
- **A probe of an overlay on a pack skill.** The planner's comment suggests it resolves without changing the emitted
  copy (`src/emit/planner.ts:444-458`).

Each row lists its `Ref:` to this file.

## Drop list

These items were considered and left out. Each one with a revisit trigger is also an inbox row.

| Item | Reason | Revisit when |
|---|---|---|
| A redirect plugin | No existing URL changes (S2). | A page's URL must change. |
| `.mdx` pages with Tabs or cards | Silent sidebar and roster drops; raw JSX on GitHub (S3). | — |
| D2, PlantUML, Graphviz, Kroki, Excalidraw, tldraw | Binary toolchains, opaque files, licence limits (tldraw's production key; D2's TALA terms disagree between two sources). | — |
| GIF, video, VHS or asciinema recordings, screenshots | No pause control on GitHub (WCAG 2.2.2); bytes; staleness. stamity has no GUI to screenshot. | — |
| Vale, write-good, proselint, alex, cspell, the markdownlint suite | A new toolchain and tuning for one maintainer. The one valuable rule of each lives in `a2`. | — |
| Online link checking (lychee) | The hand pages already ban outside URLs, apart from two families. | — |
| Running every snippet (trycmd style) | A sandbox per block. The reader test covers the commands that matter. | — |
| `llms-full.txt`, a copy-page button, an MCP docs server | Weak usage evidence; the `.md` copies (`a4`) do the job. | Agent fetch data shows demand. |
| Algolia DocSearch | Third-party query processing, against the no-telemetry stance. | — |
| Learning paths, an interactive tutorial, a `stamity docs` verb | Team-sized upkeep; `st-onboard` already guides the first change. | — |
| A command that prints a merged artifact (like `eslint --print-config`) | A CLI change, outside a docs package. | Readers in the reader test or the inbox struggle to see what resolved. |
| `check` printing a docs anchor per failing row | A CLI change, outside a docs package. | After file 2 gives each `check` row a stable anchor. |
| The landing page redesign | The maintainer's own to-do item (S14). | When that item is planned. |
| Trimming `docs/migration.md` | It holds the cut-form floor and the pinned route (S2). | At the next release cut. |
