---
id: docs-overhaul-02
intent: feature
stamp: 81b71b09ee03c43f5a19f572e888d2c230ec594d 2026-10-02
reads: [README.md, SECURITY.md, CONTRIBUTING.md, GOVERNANCE.md, llms.txt, docs/getting-started.md, docs/working-with-stamity.md, docs/plugins.md, docs/doctrine.md, docs/customization.md, docs/troubleshooting.md, docs/workspaces.md, docs/packs-and-trust.md, docs/enterprise-quickstart.md, docs/enterprise-forks.md, docs/security-mapping.md, docs/capability-matrix.md, docs/configuration.md, docs/cli-reference.md, docs/reference/agents.md, docs/reference/rules.md, docs/reference/skills.md, docs/reference/packs.md, .github/client-contracts.md, .github/release-controls-checklist.md, .github/workflows/upstream-update.yml, .github/workflows/fork-release.yml, scripts/build-plugin-distribution.mjs, scripts/qa/run.mjs, website/sidebars.ts, website/src/pages/index.tsx, website/src/css/custom.css, src/cli/docs/llmsIndex.ts, src/cli/commands/init.ts, src/cli/commands/check.ts, src/shared/cliCall.ts, src/hooks/userHooks.ts, src/hooks/model.ts, src/emit/planner.ts, src/emit/ownership.ts, content/commands/st-ask.md, content/commands/st-quick.md, content/commands/st-work.md, test/docsPages.test.ts, test/ci/upstreamWorkflow.test.ts, test/cli/commands/check.test.ts, test/content/invariantsVersion.test.ts, docs/specs/overlay-layers.md, docs/specs/fork-layer.md, docs/specs/apm-canonical-distribution.md, docs/plans/016-fork-distribution-03.md]
depends_on: [docs/plans/017-docs-overhaul-01.md]
---

# The docs, rebuilt — file 2 of 3: the new structure and every page rewritten

This file is self-contained. It is the second of three `/st-plan` artifacts for **Package 21, the docs overhaul**,
placed after Package 20 (1.12.0) and before Package 12.

It builds the new structure:
- eleven new pages, every hand page rewritten to its budget, `README.md` and `SECURITY.md` slimmed;
- thirteen on-brand diagrams placed beside their text twins;
- `llms.txt` grouped like the sidebar.

It ships as one pull request, merged without a release. The live site is published only in file 3
(`docs/plans/017-docs-overhaul-03.md`), after the reader test.

## Context

### Why

stamity's docs are about 78,000 words over 26 pages. Package 14 (2026-09-16) made the sentences plainer but kept every
page boundary, so these problems survived (research of 2026-10-02):

- The longest page is 13,556 words.
- One fact (the Codex hook-trust story) appears on six pages.
- 25–54% of seven big pages is maintainer detail.
- Setup has no route chooser and no "it worked" step.
- Customization reaches 5 of 18 mechanisms and shows no example file.
- The security inventory sits off the site, and `llms.txt` targets return 404 on stamity.dev.
- The whole set has one diagram and no image.

### The package's goals (its acceptance, from file 1)

| Goal | What it means |
|---|---|
| **G1 Shorter** | The user-facing hand set ends at no more than 60% of its words at file 1's intake. Every hand page fits its kind's budget. Every page stays under 50,000 characters. |
| **G2 One home per fact** | A fact lives on one page; others link. |
| **G3 Journey-led** | Goal-named groups, a docs home at `/docs/`, one to five next links per guide, and README as a front door. |
| **G4 The customization journey** | It reaches every mechanism, with verify and undo. |
| **G5 Complete** | Every user-facing surface has a home. |
| **G6 Visual** | About fifteen diagrams, each with a text twin. |
| **G7 Agent-readable** | `llms.txt` targets resolve, and every rewritten page has a `description`. |
| **G8 Proven** | File 3. |
| **G9 Kept honest** | The contract and `test/docs/`. |

### What file 1 left for this file to use

| Tool | Where | Use here |
|---|---|---|
| The docs contract | `.stamity/overrides/rules/docs-contract.md` | Every writer reads it first. Agents load it on every docs page. |
| Prose checks | `test/docs/prose.test.ts` | A hand page is "rewritten" once it declares `kind:`; from then on its budget, sentence, paragraph and next-link rules apply. The 60% total check switches on once every page in the baseline set has a `kind:`. The baseline is `test/docs/baseline.ts`. |
| Per-page tests | `test/docs/pages/<page>.test.ts` | Each writer owns the test files of its own pages. `test/docsPages.test.ts` keeps the cross-page contract. |
| The roster | `test/docs/roster.ts` | Derived from the page headers and the sidebar, so a new page needs no hand-kept list. |
| The diagram kit | `scripts/visuals.mjs`, `scripts/visuals/` | Six templates; three pilot diagrams already approved (QA row K1). |
| Site plumbing | `website/` | GitHub alerts render as admonitions, local search works, the `.md` copies serve, and the site type-checks in CI. |
| Generated pages | `docs/configuration.md`, `docs/reference/*.md`, `docs/capability-matrix.md` | Each config key says what it does. Each artifact says how to customize it. The capability matrix says where hooks are enforced. |
| The reader-test kit | `.github/docs-reader-test.md`, `scripts/docs-reader/` | Used in file 3. T8's grader reads the security page's `## What it does not defend`, which `b8-security` keeps. |

## The target structure

### Sidebar (`website/sidebars.ts`, exact)

| Group | Pages, in order |
|---|---|
| **Start here** | `overview`, `getting-started`, `choose-a-route`, `plugins`, `apm` |
| **Use every day** | `working-with-stamity`, `your-setup`, `parallel-work`, `troubleshooting` |
| **Customize** | `customization`, `customization-recipes`, `overrides-and-overlays`, `hooks` |
| **Teams and organizations** | `workspaces`, `packs-and-trust`, `enterprise-quickstart`, `fork-setup`, `enterprise-forks`, `fork-release`, `org-rollout` |
| **Security** | `security-mapping` |
| **Reference** | `cli-reference`, `configuration`, `capability-matrix`, `glossary`; then a nested, collapsed category **Shipped artifacts**: `reference/agents`, `reference/skills`, `reference/rules`, `reference/commands`, `reference/packs`, `reference/mcp-servers` |
| **About stamity** | `doctrine`, `measurements` |

`docs/migration.md` stays unlisted and untouched (S2): it keeps its pinned route and its release-cut stamp.

### Page map

Notes on the columns:
- Budgets are the caps `test/docs/prose.ts` enforces.
- Targets are this plan's planning numbers. They add up to about 34,400 words, about 57% of a baseline of about 60,000.
- All paths are under `docs/`.
- Words are prose and table text, with code not counted.

| Page | Title (H1) | Kind | Budget | Target | Owner | Status |
|---|---|---|---|---|---|---|
| `overview.md` (`slug: /`) | What stamity is | hub | 1,500 | 500 | `b2` | new |
| `getting-started.md` | Get started | tutorial | 1,000 | 850 | `b3` | rewritten |
| `choose-a-route.md` | Choose a route | explanation | 1,500 | 1,000 | `b3` | rewritten (Package 20's page) |
| `plugins.md` | Install as a plugin | how-to | 1,800 | 1,500 | `b3` | rewritten |
| `apm.md` | Install through APM | how-to | 1,800 | 600 | `b3` | new |
| `working-with-stamity.md` | Pick a touchpoint | how-to | 1,800 (and ≤150 lines, pinned) | 1,200 | `b4` | rewritten |
| `your-setup.md` | Your setup on disk | reference | 2,500 | 1,100 | `b4` | new |
| `parallel-work.md` | Run changes in parallel | how-to | 1,800 | 500 | `b4` | new |
| `troubleshooting.md` | Troubleshooting | reference | 2,500 | 2,000 | `b4` | rewritten |
| `customization.md` | Customize stamity | hub | 1,500 | 1,200 | `b5` | rewritten |
| `customization-recipes.md` | Customization recipes | how-to | 2,600 (named) | 2,200 | `b5` | new |
| `overrides-and-overlays.md` | Overrides and overlays | reference | 2,500 | 1,800 | `b5` | new |
| `hooks.md` | Your own hooks | how-to | 1,800 | 800 | `b5` | new |
| `workspaces.md` | Workspaces | how-to | 1,800 | 1,300 | `b6` | rewritten |
| `packs-and-trust.md` | Packs and trust | how-to | 1,800 | 1,800 | `b6` | rewritten |
| `enterprise-quickstart.md` | Enterprise overview | hub | 1,500 (and ≤120 lines, pinned) | 700 | `b7` | rewritten |
| `fork-setup.md` | Set up a fork | how-to | 1,800 | 1,400 | `b7` | new |
| `enterprise-forks.md` | Take upstream updates | how-to | 3,000 (named) | 2,600 | `b7` | rewritten |
| `fork-release.md` | Release your fork | how-to | 1,800 | 1,800 | `b7` | new |
| `org-rollout.md` | Roll out to your organization | how-to | 1,800 | 1,700 | `b7` | new |
| `security-mapping.md` | Security model | reference | 5,000 (named) | 4,600 | `b8` | rewritten (absorbs `SECURITY.md`'s inventory) |
| `glossary.md` | Glossary | reference | 2,500 | 700 | `b2` | new |
| `doctrine.md` | Why stamity ships what it ships | explanation | 1,500 | 1,100 | `b9` | rewritten |
| `README.md` (repository root) | stamity | front door | 700 (its page test) | 600 | `b2` | rewritten |
| `SECURITY.md` (repository root) | (GitHub security policy) | policy | 900 (its page test) | 800 | `b8` | slimmed |

`CONTRIBUTING.md` and `GOVERNANCE.md` are project pages, outside the user set, and `b9` dedupes them. The generated pages
change only through file 1's generators and `b1`'s sidebar.

### One home per fact (G2)

| Fact | Its one home | Elsewhere: one sentence plus a link |
|---|---|---|
| Node floor; git needed only by `worktree` | `getting-started.md` `## Before you start` | README |
| Which verbs need a manifest or git; flags; exit codes; `--json` | `cli-reference.md` (generated) | README's verb line (pinned) |
| Network paths (update notice and its switches, Sigstore fetch, worktree fetch, `gh`) | `security-mapping.md` `## Network and data handling` | getting-started, packs-and-trust, your-setup |
| The nine touchpoints table | `working-with-stamity.md` | README, overview |
| Per-client invocation (`/st-<id>`, `$st-<id>`, `/stamity:st-<id>` on the plugin route) | `getting-started.md`'s first-change table | detail in `capability-matrix.md` |
| What each client reads (`AGENTS.md`, `AGENTS.override.md`, `.agents/skills/`, `.claude/skills/`) | `your-setup.md` `## What init writes for each client` | hero twins in README and overview; detail in the matrix |
| Hook behaviour per client (Codex's three gates and headless runs, Copilot's trust variable and fail-open timeouts, Cursor's timeout conversion, the role guard as telemetry on three clients) | facts in `capability-matrix.md`; dated measurements in `.github/client-contracts.md`; fixes in `troubleshooting.md` | customization, plugins, getting-started, `SECURITY.md` |
| `.claude/settings.json` per-key ownership | `troubleshooting.md` | plugins |
| The `plugin-runtime` and `plugin-duplicates` rows | `troubleshooting.md` | plugins (its duplicate section goes) |
| Who owns which class on the plugin route | `capability-matrix.md` `## Plugin containers` (generated) | plugins (the hand-written table goes; inbox row on `docs/plugins.md`) |
| Trust ladder; pinned-or-refuse; a signature is not an entitlement; Sigstore is optional | `packs-and-trust.md` | security page cites |
| Org pack-source policy grammar | `packs-and-trust.md` | — |
| Control inventory, gaps, publish path | `security-mapping.md` | `SECURITY.md` summary |
| Override and overlay mechanics, prefixes, precedence, the fork layer | `overrides-and-overlays.md` | customization hub summary |
| Organization rollout per client | `org-rollout.md` | plugins, enterprise overview |
| Building and publishing `plugin-dist` and the `plugins/*` tags | `fork-release.md` | plugins (consumer side) |
| Renovate presets | consumer side in `plugins.md`; APM tag rule in `fork-release.md` | — |
| APM install (consumer) | `apm.md` | choose-a-route, README (one line with its command: the README note REQ-APM-004 asks for) |
| CI lanes and required checks | `CONTRIBUTING.md` | `GOVERNANCE.md` names the two checks |
| DCO | `CONTRIBUTING.md` | enterprise-forks keeps the fork exemption in two sentences |
| Invariant versioning and amendments | `doctrine.md` `## Amendments` (pinned) | `GOVERNANCE.md` |
| The eval run of record and its runs | `measurements.md` (generated) | one run-of-record line each in README and doctrine (pinned) |
| Run `sync` after `config` | `configuration.md` (generated) | recipes |
| Rule delivery | `configuration.md` and `capability-matrix.md` | customization hub row |
| Terms | `glossary.md` | first use on any page links it |

### Facts at risk (each must reach its new home; **SEC** facts move whole, never shortened)

Every row cites its source on the base commit `81b71b09`. Re-locate each one at intake.

| Fact | Source | New home |
|---|---|---|
| **SEC** Codex `marketplace add` without `--ref` installs the public npm package | `docs/plugins.md:267-277` | `plugins.md`, a WARNING alert in the Codex row |
| **SEC** `clean -y` deletes `.stamity/` user state (until Package 20's `--purge` split; state what 1.12.0 does) | `docs/plugins.md:512-516` | `your-setup.md` `## Remove stamity`, and `plugins.md` `## Move an existing setup` |
| **SEC** Copilot hooks load only with `COPILOT_ALLOW_ALL=true` exactly | `docs/plugins.md:55-64` | capability matrix (generated) and troubleshooting |
| Copilot cloud reads hooks from the default branch | `docs/customization.md:352` | capability matrix (added by file 1's `a5`) |
| **SEC** The plugin review step sits in the organization's catalog repository | `docs/plugins.md:566-573` | `org-rollout.md` `## Where review sits` |
| **SEC** `npx --no` versus `-y`; hold your scope on the public registry | `docs/enterprise-forks.md:184-195` | `fork-setup.md` `## Set the package's identity` |
| **SEC** Turn Actions off before importing refs; never repeat `push --mirror` | `docs/enterprise-forks.md:95-96`, `:123-125` | `fork-setup.md` |
| Landing must be a merge commit; revert the revert | `docs/enterprise-forks.md:481-489`, `:546-548` | `enterprise-forks.md` |
| **SEC** An environment secret, not a repository secret; create the environment before the first tag | `docs/enterprise-forks.md:918-936` | `fork-release.md` |
| Managed-settings allowlist exact-match lockout; source ranking; first-run screens | `docs/enterprise-forks.md:1097-1135` | `org-rollout.md` |
| **SEC** Automation never pushes a workflow change | `docs/enterprise-forks.md:1226-1233` | `enterprise-forks.md` |
| Scheduled workflows are off by default in forks; 60-day idle disable | `docs/enterprise-forks.md:1180-1182` | `enterprise-forks.md` |
| What `STAMITY_UPSTREAM_TOKEN` buys | `docs/enterprise-forks.md:1240-1258` | `enterprise-forks.md` |
| The generators refuse hosts other than github.com | `docs/enterprise-forks.md:1272-1280` | `fork-setup.md` |
| A script-written DCO trailer is not a certification | `docs/enterprise-forks.md:505-510` | `enterprise-forks.md` (one sentence); its exemption logic goes to `CONTRIBUTING.md` |
| Renovate semver versus regex versioning; `apm` and `GITHUB_APM_PAT` on Renovate's PATH | `docs/enterprise-forks.md:726-764` | `fork-release.md` |
| Token precedence `GITHUB_APM_PAT_<ORG>` > `GITHUB_APM_PAT` > `GITHUB_TOKEN` | `docs/enterprise-forks.md:806-808` | `fork-release.md` |
| Six practices that keep downstream upgrades cheap | `docs/enterprise-forks.md:1339-1355` | `CONTRIBUTING.md` |
| Fork-layer specifics: `dist/fork` staging, `validate`'s `— fork layer` rows, APM excludes patch control files | `docs/enterprise-forks.md:594-597`, `:646-680` | `overrides-and-overlays.md` `## The fork layer` |
| **SEC** Learnings are a security surface; the CLI is their one write path | `docs/getting-started.md:255-262` | `security-mapping.md` |
| Run `ledger status` after compaction on Cursor, Copilot and headless Codex | `docs/getting-started.md:244-253` | `working-with-stamity.md` `## Resume a run` |
| **SEC** The Windows PowerShell guard gap (unmeasured) | `docs/troubleshooting.md:252-264` | the `claude-hook-shell` row in troubleshooting, plus a security-page residual |
| The guard once failed open after a `cd` | `docs/troubleshooting.md:245-250` | `CHANGELOG.md` history only; the page keeps the current behaviour |
| Atomic temp-and-rename writes, and the three non-atomic writes | `docs/troubleshooting.md:295-309` | security page write-path row; a one-line remedy stays in troubleshooting |
| The workspace JSON document's fields | `docs/workspaces.md:306-317` | `workspaces.md`, inside `<details>` |
| Selection deltas and locks do not propagate yet | `docs/workspaces.md:276-287` | `workspaces.md` `## What reaches member repositories` (first section) |
| **SEC** The policy receipt edge: a deleted receipt means the kind tokens do not match | `docs/packs-and-trust.md:342-351` | security page, org-policy row |
| **SEC** The "unarmed" verifier substitution | `docs/packs-and-trust.md:200-204` | security page (packs keeps the pinned "not armed" sentence) |
| **SEC** Sigstore is an optional dependency; `--omit=optional` refuses signed packs | `docs/packs-and-trust.md:175-179` | `packs-and-trust.md` (one line, pinned) and the security page |
| **SEC** Resume-card and ledger screening detail | `SECURITY.md:104-105` | security page, as a table instead of one-cell prose, every literal kept |
| **SEC** The read-only-git allowlist grammar | `SECURITY.md:107` | security page |
| The publish job's tool surface; "no accepted risk remains" | `SECURITY.md:164-178`, `:301-322` | security page `## Publishing this package`; the image-size history goes to `CHANGELOG.md` |
| Client override field pass-through (`license`, `compatibility`, `allowed-tools`, `agents/openai.yaml`) | `docs/customization.md:334-338` | `overrides-and-overlays.md` |
| The native-memory reassessment trigger | `docs/customization.md:368-371` | `doctrine.md`, one sentence under the learning pillar |
| The glossary entries | `docs/getting-started.md:389-405` | `glossary.md` |

### Visual inventory (G6)

Thirteen kit diagrams plus the Mermaid spine. The specs follow file 1's format in `scripts/visuals/specs/<slug>.mjs`.
Every `facts` string must appear in the host page's text (file 1's check 7).

| Slug | Host page(s) | Template | Facts it shows | Owner |
|---|---|---|---|---|
| `hero-one-corpus` (pilot) | README, `overview.md` | flow | the corpus (charter, touchpoints, agents, skills, rules, hooks, MCP wiring) → `sync` → each client's files | `b2` |
| `routes-compare` | `choose-a-route.md` | grid | CLI, plugin and APM against what each delivers (charter, touchpoints, agents, skills, rules, hooks, MCP, engine verbs) and who updates it | `b3` |
| `work-run` | `working-with-stamity.md` | timeline | frame → understand → plan → build → prove → review → QA checkpoint → proof block | `b4` |
| `customize-ladder` (pilot) | `customization.md` | ladder | config key → overlay patch → override → your own artifact → pack → workspace → fork layer, each with its scope | `b5` |
| `precedence-stack` (pilot) | `customization.md` | stack | your override or patch → fork layer → corpus or pack | `b5` |
| `overlay-merge` | `overrides-and-overlays.md` | flow | the base artifact + `.customize.yaml` (keys replace; `null` removes; lists replace whole) + `.customize.md` (appended after one blank line) → the emitted copy; the base is never written | `b5` |
| `hook-events` | `hooks.md` | timeline | `session_start` → `user_prompt_submit` → `pre_tool_use` → `post_tool_use` → `stop` → `session_end` | `b5` |
| `workspace-cascade` | `workspaces.md` | stack | `defaults` → group deltas in declaration order → member `overrides`, with locked content above all three; what reaches members (`tools`, `maturityTier`, `mcp`) | `b6` |
| `trust-ladder` | `packs-and-trust.md` | ladder | `pinned-unsigned` → `scanned` → `publisher-signed` → `curator-verified`; pinned-or-refuse | `b6` |
| `enterprise-days` | `enterprise-quickstart.md` | timeline (swimlanes by role) | Day 0 set up the fork; Day 1 release and roll out; Day 2 take updates | `b7` |
| `upstream-lane` | `enterprise-forks.md` | flow | `status` → `preview` → `integrate` → conflict → `continue` or `abort` → land | `b7` |
| `fork-release-jobs` | `fork-release.md` | flow | the release workflow's jobs, as `.github/workflows/fork-release.yml` names them at intake | `b7` |
| `security-surfaces` | `security-mapping.md` | map | the seven surfaces (six engine surfaces and the release path), each with what is defended and its gap | `b8` |
| the spine (Mermaid, kept) | `working-with-stamity.md` | — | the nine touchpoints and their hand-offs. Fix two edges: `/st-ask` hands off to `/st-work`, `/st-debug`, `/st-quick` or `/st-plan` (`content/commands/st-ask.md:143-146`), and `/st-debug` to `/st-work` or `/st-quick` | `b4` |

Terminal output stays as `text` blocks of real captured runs. Capture them from a scratch repository on the session's
build:
- getting started: the `init` panel and `check`;
- customization: `validate` shadowing rows;
- troubleshooting: the healthy `check`;
- packs: `add --dry-run`;
- workspaces: `workspace status`.

File trees stay as `text` trees (your-setup's per-client tree and its `.stamity/` tree).

## Decisions

### The maintainer's walk (2026-10-02; every answer the recommended option)

1. **Placement:** after Package 20 (1.12.0), before Package 12. No release.
2. **Visuals:** the brand diagram kit drawn from code, with text twins. Terminal output and trees stay text.
3. **Proof:** the agent reader test plus the maintainer's walkthrough (file 3).
4. **The two CLI gaps** (no reset for keys other than `gates.*`; `hooks.userHooksDir` shown as `none`) belong to
   Package 20 file 1. This file documents what 1.12.0 shipped and states plainly what still cannot be undone.

### Settled by this plan (declared defaults; reversible before the run)

File 1's S1–S16 hold here:
- no new spec;
- no existing URL changes;
- `.md` only;
- the diagram kit;
- GitHub alerts;
- local search;
- `SECURITY.md` slimmed into the security page;
- README as a front door;
- `kind:` and `description:` frontmatter;
- no release;
- the reader-test trials;
- models (Opus 5.5 everywhere, Fable 5.1 only for the final whole-branch review);
- commit-form stamps;
- landing calls to action only;
- one word counter;
- the contract as a rule override.

This file adds the following defaults.

| # | Default | Why |
|---|---|---|
| S17 | **Cross-page pins collapse to the fact's one home** (`b1`). The Codex 0.155.1 and "not isolated" strings are required on the capability matrix and `.github/client-contracts.md` only, not on nine files. The managed-block phrase is required on getting-started only. The negative pins ("no command home", no `.cursor/skills`) stay set-wide. | G2. A pin requiring the same fact on nine pages works against one home per fact, and would force every writer to keep a copy. |
| S18 | **Parallel writers read their sources on the base commit and write only their own pages.** Each content unit (`b2`–`b9`) owns its pages, those pages' test files and its diagram specs. Shared files have one writer each: `b1` before the lanes, `b10` after them. Moved-out text that has a new home on another unit's page is written by that page's owner, from the base commit. | One writer per artifact. Lanes stay file-disjoint. |
| S19 | **A single re-attestation date.** `b0` fixes `<D>` (UTC) for the whole session; `b1` sets `REATTESTATION_DATE` to `<D>`; every rewritten page stamps `<D>`. | Avoids parallel edits of one constant. |
| S20 | **The security page keeps every security fact whole.** Sentence rules apply, so long cells are split into sentences and sub-tables, but no fact is cut to fit. Its named budget is 5,000. | Security facts move whole (the contract). |
| S21 | **`onBrokenAnchors` becomes `'throw'`** in `b10`, once every page is rewritten. | Anchor renames otherwise only warn (`website/docusaurus.config.ts:112`). |
| S22 | **`.github/client-contracts.md` takes the dated vendor measurements and provenance notes** that `b3`, `b4` and `b5` move out of their pages. `b10` writes them from the fragments those units return. | One writer; the evidence page's own pins stay intact. |
| S23 | **If G1's 60% cannot be met without dropping a fact a reader needs, the fact wins.** The run records `Not done:` with the measured share, and the maintainer decides. | The budget serves the reader, not the reverse. |

### Before this file runs

- File 1 is merged and QA row K1 has passed. `test -f scripts/visuals.mjs && test -f test/docs/prose.test.ts` decides
  which.
- The freshness guard runs per unit. Every unit re-reads its `reads:` paths and re-locates its sources, because file 1
  and Packages 19, 18 and 20 moved them. The line numbers here are as of `81b71b09`.
- Read file 1's run record:
  - the "what 1.12.0 left" table: Package 20's page `docs/choose-a-route.md`, its new sections and its pinned headings;
  - the baseline;
  - the anchor-warning count.
- Fold the inbox rows listed under "Inbox rows this file folds in".

## Spec delta

**Empty.** The package changes no product requirement (file 1, S1). Its acceptance is G1–G7 for this file, carried by
the units below.

## Units

Every unit leaves `npx vitest run test/docsPages.test.ts test/docs test/ci/visuals.test.ts` green, together with
`node scripts/visuals.mjs --check` and `node scripts/leak-gate.mjs`, all read by exit code. Before it hands back, it
also runs the site build (`cd website && npm run build`, where `onBrokenLinks: 'throw'` catches a link to a missing
route).

A content unit declares `kind:` on a page only when the page meets its rules. A page left without `kind:` is reported,
not failed, and `b10` fails the run if any remains.

### b0-intake — freshness, the date, and the checklists

| Field | Content |
|---|---|
| `id` | `b0-intake` |
| `requirements` | spec carries no ids (package goals G1, G2) |
| `files` | the run record only |
| `interfaces` | The run record gains six things:<ul><li>a freshness verdict per unit;</li><li>`<D>`, the session's UTC date;</li><li>the facts-at-risk table above, with each source re-located on the base commit;</li><li>the one-home table, as the review's checklist;</li><li>the measured words per page (`node scripts/docs-words.mjs --json`) against `test/docs/baseline.ts`;</li><li>the list of Package 20 pins on the pages being rewritten, from file 1's "what 1.12.0 left" table: `docs/choose-a-route.md`'s eleven headings and matrix case, the customization route section, the rollout subsections, `## When a route misbehaves`, the reset recipe test, the settings case, the CLI pin and update paths, and the quickstart's day steps.</li></ul> |
| `testCriteria` | **Given** the run record, **then** it holds a freshness verdict for each of `b1`–`b11`, `<D>`, both tables with every row re-located, and the word table. |
| `edgeCases` | **A facts-at-risk source no longer exists** (Package 20 rewrote it): the row cites where the fact lives now. **The fact itself was removed by Package 20:** mark the row `retired by 1.12.0` with the commit that removed it. |
| `depends_on` | `docs/plans/017-docs-overhaul-01.md` (`a8-close-file-1`) |
| `verify` | `node scripts/docs-words.mjs --json > /dev/null && git log -1 --format=%H` |

### b1-skeleton — the new pages as valid stubs, the sidebar, `llms.txt`, and the cross-page pins

| Field | Content |
|---|---|
| `id` | `b1-skeleton` |
| `requirements` | spec carries no ids (package goals G3, G7, G2) |
| `files` | See **b1 files** below the table. |
| `interfaces` | See **b1 interfaces** below the table. |
| `testCriteria` | **Given** `npx vitest run test/docsPages.test.ts test/docs test/cli/docs/llmsIndex.test.ts test/ci/docsRoster.test.ts test/ci/docsSite.test.ts test/qa/run.test.ts`, **then** it exits 0. **Given** `cd website && npm run build`, **then** it exits 0, `website/build/docs/index.html` exists (the docs home), and the navbar's Docs item opens it. **Given** `node scripts/generate-docs.mjs --page llms && git diff --exit-code llms.txt`, **then** it exits 0 after the commit. **Given** each new stub, **then** `test/docs/prose.test.ts` treats it as rewritten (it declares `kind:`) and it passes every rule. |
| `edgeCases` | **The Docusaurus build rejects an unknown frontmatter key** (`kind:`): move the kind into a first-line HTML comment (`<!-- kind: hub -->`), have `kindOf` read either form, and amend the contract's line. **`slug: /` collides with an existing route:** none exists at `81b71b09`; if Package 20 added one, give the overview `slug: /docs-home` and record it. **README exceeds 159 lines:** it cannot, since the edit removes rows. |
| `depends_on` | `b0-intake` |
| `verify` | `npx vitest run test/docsPages.test.ts test/docs test/cli/docs/llmsIndex.test.ts test/ci/docsRoster.test.ts test/ci/docsSite.test.ts test/qa/run.test.ts && cd website && npm run build` |

**b1 files.**
- Eleven new stubs: `docs/overview.md`, `docs/apm.md`, `docs/your-setup.md`, `docs/parallel-work.md`,
  `docs/customization-recipes.md`, `docs/overrides-and-overlays.md`, `docs/hooks.md`, `docs/fork-setup.md`,
  `docs/fork-release.md`, `docs/org-rollout.md` and `docs/glossary.md`.
- `website/sidebars.ts`.
- `src/cli/docs/llmsIndex.ts` and `llms.txt`.
- `README.md`: the map's guide rows only.
- `test/docs/pages/readme.test.ts`, `test/docs/crossPage.test.ts` and `test/docs/shared.ts`.
- `scripts/qa/run.mjs` (`PAGES` and its comment) and `test/qa/run.test.ts`, only where it lists the pages.

**b1 interfaces.**

- **Each stub** carries:
  - frontmatter: `title`, `kind` and `description`, as in the page map (the overview adds `slug: /`);
  - the two head comments: `<!-- HAND-WRITTEN PAGE — verified against the tree at commit <sha7>. Re-attested <D>. -->`,
    then `<!-- Re-open when: … \`test/docsPages.test.ts\` … -->`;
  - an H1 equal to the title;
  - one or two paragraphs saying what the page will hold, at least 500 characters (the existence pin);
  - `## Where to go next` with one to three links.

  Every sentence stays at most 30 words.
- **The sidebar** is exactly as in "The target structure". `present()` takes a nested category item for **Shipped
  artifacts**: the mapping code accepts objects beside ids, and the file's doc comment says so.
- **`llms.txt` sections, in this order:**
  - **Common tasks**: about a dozen "task → page" entries. `b10` adds the anchors.
  - Then one section per sidebar group.
  - Then **Repository**: README, CONTRIBUTING, SECURITY, GOVERNANCE, CODE_OF_CONDUCT.

  Hand-page counts leave the comments of `src/cli/docs/llmsIndex.ts:14-16`.
- **README** keeps every other line. Its map's twelve guide rows collapse into one row,
  `` | [`docs/overview.md`](docs/overview.md) | The docs home: start here for every guide. | ``.
- **README's pin** (`README_LINK_TARGETS`, from `test/docsPages.test.ts:606-630`) becomes: the generated pages, the
  root pages and `docs/overview.md`. The case "README links every mapped guide" becomes "the sidebar and `llms.txt`
  reach every guide; README links the docs home". Test change, justified by G3: the front door links the docs home,
  not every page.
- **Cross-page pins** (S17), in `test/docs/crossPage.test.ts`:
  - the Codex 0.155.1 and "not isolated" pair is required on `docs/capability-matrix.md` and
    `.github/client-contracts.md` only;
  - "the managed block in `CLAUDE.md`" is required on `docs/getting-started.md` only;
  - "Codex starts one as `$st-<id>`" is required on README only;
  - the negative pins stay set-wide.
- **`REATTESTATION_DATE`** becomes `<D>` (S19).
- **`scripts/qa/run.mjs` `PAGES`** adds `{route: '/docs/', file: 'docs/index.html'}`,
  `{route: '/docs/customization-recipes', …}`, `{route: '/docs/hooks', …}` and `{route: '/docs/org-rollout', …}`, and
  its comment says why each page is there.

### b2-front-door — README, the docs home, the glossary, and the landing page's calls to action

| Field | Content |
|---|---|
| `id` | `b2-front-door` |
| `requirements` | spec carries no ids (package goals G3, G1, G6, G7) |
| `files` | `README.md`; `docs/overview.md`; `docs/glossary.md`; `website/src/pages/index.tsx`; `test/docs/pages/readme.test.ts`; `test/docs/pages/overview.test.ts` and `test/docs/pages/glossary.test.ts` (new); `test/docs/runOfRecord.test.ts`, only where the README line moves; `scripts/visuals/specs/hero-one-corpus.mjs` and its SVG, if the host text needs a label change |
| `interfaces` | The page specs below. |
| `testCriteria` | **Given** `npx vitest run test/docs test/docsPages.test.ts test/ci/visuals.test.ts`, **then** it exits 0, with these new cases:<ul><li>README has at most 700 prose words (`countProseWords`) and at most 120 lines;</li><li>README's merge-ready figure equals the frozen snapshot's (inbox row `README.md:27-32`);</li><li>README's install section names the APM route with its install command (REQ-APM-004, `docs/specs/apm-canonical-distribution.md:132-133`);</li><li>the overview links the six journey pages;</li><li>the glossary has one `###` per term in alphabetical order, and each definition has one to three sentences.</li></ul>**Given** `cd website && npm run build`, **then** `/docs/` renders the overview, and the landing page's calls to action point at `/docs/getting-started/`, `/docs/choose-a-route/` and `/docs/enterprise-quickstart/`. |
| `edgeCases` | **npm renders README's relative image and links differently from GitHub:** file 3's QA checks the npm page at the next release; nothing changes here. **Showing the hero on the landing page needs a second copy of the SVG:** skip it, keep the calls to action, and record why (S14). **A glossary term has no home page:** the definition stands alone, and the term goes on the drop list only if no page uses it. |
| `depends_on` | `b1-skeleton` |
| `verify` | `npx vitest run test/docs test/docsPages.test.ts test/ci/visuals.test.ts && node scripts/visuals.mjs --check && cd website && npm run build` |

#### b2 pages

**`README.md`** (front door; at most 700 words; at most 120 lines; the pinned opening, banner and verb line stay).
Outline, exactly:
1. The two head comments, in commit form.
2. The banner `<picture>`, unchanged.
3. `# stamity`, then the pitch sentence naming zomarit and the four clients.
4. The hero diagram, `![One corpus, four clients: stamity turns one canonical source into each client's files](docs/visuals/hero-one-corpus.svg)`,
   with its text twin: a four-row table of client → what it reads.
5. `## What ships`: the `content/` and `packs/` rows, kept in the pinned `CORPUS_ROW` table shape, plus one sentence
   saying that hook scripts are generated from `src/hooks/scripts.ts` (pinned).
6. `## Install`: `npx @zomarit/stamity init`, with a preview line `npx @zomarit/stamity init --dry-run`. Then one line
   each for the plugin route and the APM route (with its `apm install` command), linking
   [Choose a route](docs/choose-a-route.md).
7. `## Your first change`: one sentence on `/st-onboard`, plus "Claude Code, Cursor and GitHub Copilot start a
   touchpoint as `/st-<id>`; Codex starts one as `$st-<id>`." Confirm the Copilot form against the capability matrix.
   Link [Get started](docs/getting-started.md).
8. `## Commands`: the pinned verb line (`init` · `sync` · … and the verb count in words) and the plumbing-verbs
   sentence, linking the CLI reference.
9. `## Proof`: one paragraph with the merge-ready rate and the eval run of record. It keeps the pinned
   `[run N](…), the X release run` form and links [Measurements](docs/measurements.md).
10. `## Docs`: https://stamity.dev, plus [the docs home](docs/overview.md) and five journeys: Get started, Pick a
    touchpoint, Customize stamity, Enterprise overview, Security model.
11. `## Contribute and report`: CONTRIBUTING, SECURITY, GOVERNANCE, CODE_OF_CONDUCT.
12. `## License`.

What moves out, and where:
- "What this repository can prove", in detail → `docs/measurements.md` (already there).
- "How it works" jargon → the overview and the glossary.
- "Working on this repository", "Where everything lives" (except the two `What ships` rows), "What the tests cover"
  and "Why stamity runs on itself" → `CONTRIBUTING.md` (`b9` writes them there from the base commit).

**`docs/overview.md`** (hub, `slug: /`; target 500). Outline:
1. Two opening sentences.
2. The hero diagram, with its text twin (the same four-row table).
3. `## Is stamity for you?`, with two short lists:
   - fits: a team on one or more of the four clients that wants spec-to-pull-request flows with checks;
   - does not fit: no AI coding client, or a hosted service wanted; confirm the list against `docs/doctrine.md`'s
     scope.
4. `## Pick your path`, with six links:
   - Set up a repository → `getting-started.md`;
   - Choose an install route → `choose-a-route.md`;
   - Use the touchpoints every day → `working-with-stamity.md`;
   - Customize what ships → `customization.md`;
   - Roll out to a team or an organization → `enterprise-quickstart.md`;
   - Review security → `security-mapping.md`.
5. `## What a session looks like`: a short real `text` excerpt (the end-of-init panel, or a `/st-quick` proof block)
   captured on the session's build.
6. `## Where to go next`.

**`docs/glossary.md`** (reference; target 700). One `### <term>` per term, sorted, each one to three sentences plus a
link to the term's home. The terms:
- agent, artifact, charter, client, corpus, emitted copy, fork layer;
- gate (verification gate, save gate, leak gate), generated page, hand page, hook, intensity;
- ledger, learning, managed block, manifest, maturity tier, overlay, override, pack, projection;
- proof block, record, route (CLI route, plugin route, APM route), rule delivery, skill;
- touchpoint, trust tier, verb, workspace, worktree lane.

The sources are `docs/getting-started.md:385-405` on the base commit, the README's map, and the terms the friction
study found undefined (`ledger`, `projection`, `residue planner`, `carrier`, `reclaim`, `proof block`, `intensity`,
`maturity tier`, `spine`, `floor`, `verdict role`, `receipt`, `farm`, `cascade`, `inbox`). Keep only the terms a
rewritten page still uses.

**`website/src/pages/index.tsx`.** The calls to action become "Get started" (`/docs/getting-started`), "Choose a route"
(`/docs/choose-a-route`), "For organizations" (`/docs/enterprise-quickstart`) and GitHub. Nothing else changes.

### b3-start-routes — getting started, the route chooser, and the plugin and APM install pages

| Field | Content |
|---|---|
| `id` | `b3-start-routes` |
| `requirements` | spec carries no ids (package goals G3, G1, G5, G6) |
| `files` | `docs/getting-started.md`, `docs/choose-a-route.md`, `docs/plugins.md`, `docs/apm.md`; their files under `test/docs/pages/`; `scripts/visuals/specs/routes-compare.mjs` and `docs/visuals/routes-compare.svg` (new) |
| `interfaces` | The page specs below. |
| `testCriteria` | **Given** `npx vitest run test/docs test/docsPages.test.ts test/ci/visuals.test.ts`, **then** it exits 0, with these cases:<ul><li>getting started shows `check` and its `setup green` line before `## Make your first proven change`;</li><li>getting started's first-change table names the plugin-route form `/stamity:st-onboard`;</li><li>plugins carries no hand-written ownership table (inbox row `docs/plugins.md`) and links the capability matrix's `## Plugin containers`;</li><li>every `codex plugin marketplace add` line still carries `--ref` (pinned);</li><li>the Codex no-`--ref` warning is a WARNING alert;</li><li>the APM page names the install command and the apm-cli floor that 1.12.0 ships.</li></ul>**Given** each page, **then** the prose rules pass. |
| `edgeCases` | **Package 20's page `docs/choose-a-route.md` holds pinned `##` headings and a 13×3 matrix case:** keep the headings, or move the pins in the page's test file with a `TEST CHANGE, justified:` paragraph. The matrix is the diagram's text twin. **The safe CLI form differs from what Package 20 documented:** use what 1.12.0 ships, and amend the contract's Commands line if it names the form. **Package 20's `stamity upgrade` exists:** it goes under `your-setup.md` (`b4`), not here. |
| `depends_on` | `b1-skeleton` |
| `verify` | `npx vitest run test/docs test/docsPages.test.ts test/ci/visuals.test.ts && node scripts/visuals.mjs --check && cd website && npm run build` |

#### b3 pages

**`docs/getting-started.md`** (tutorial; budget 1,000; target 850; title "Get started"). Outline, exactly:

1. Two opening sentences.
2. `## Before you start`:
   - Node at least the floor in `package.json`'s `engines`;
   - git is optional except for `worktree`;
   - commit your work first;
   - one sentence on network access, linking the security page's `## Network and data handling`.
3. `## Preview what init writes`: `npx @zomarit/stamity init --dry-run`, then real output.
4. `## Set stamity up`: `npx @zomarit/stamity init`, then the questions in the CLI's words:
   - the tools prompt, "Which tools?", at `src/cli/commands/init.ts:155`; say once that a tool is a client;
   - the import choice `supplement`, `replace` or `skip`, with `supplement` marked as the default
     (`src/types/core.ts:79`);
   - the predecessor-migration question, linking the migration page by its title with no name typed (the leak gate's
     allowlist).

   Then the real end-of-init panel.
5. `## Check that it worked`: the check command and its real output, ending with the `setup green …` line.
6. `## Run stamity again later`: the one safe way to call the CLI after setup, from `src/shared/cliCall.ts:1-30` (a bare
   `stamity <verb>` resolves only where an install put the binary on PATH) and the pin and update paths 1.12.0
   documents. The contract's Commands line points here.
7. `## Commit the setup`: three bullets, linking `your-setup.md` `## What to commit`.
8. `## Make your first proven change`:
   - `/st-onboard`, with a table of client × route giving the invocation (Claude Code, Cursor, GitHub Copilot, Codex;
     CLI route and plugin route);
   - what "done" looks like: the gate line or a proof-block excerpt.
9. `## Where to go next`.

What moves out, and where:
- the APM route → `apm.md`;
- the plugin route → `plugins.md`;
- "What init writes" per client → `your-setup.md`;
- the ten verbs → the CLI reference and README;
- "When something looks wrong" → troubleshooting;
- "Where state lives" and "Keeping current" → `your-setup.md`;
- the glossary → `glossary.md`;
- network → the security page;
- the hidden verbs and the Codex measurements → the capability matrix and troubleshooting;
- the `--json` consent nuance → the CLI reference.

Pins: the getting-started verb-containment case is retired, because the verbs' home is the CLI reference and README
keeps the line (test change, justified by G2). "The managed block in `CLAUDE.md`" stays (S17). The Codex resume-card
sentences move to `working-with-stamity.md` (`b4` writes them from the base commit and pins them there).

**`docs/choose-a-route.md`** (explanation; budget 1,500; target 1,000). Package 20's page, trimmed to the contract:
- the `routes-compare` diagram above the existing matrix, which is its text twin;
- install steps live on the route pages (getting started, plugins, APM), and this page links them;
- `## Where to go next`.

**`docs/plugins.md`** (how-to; budget 1,800; target 1,500; title "Install as a plugin"). Outline:
1. Two opening sentences.
2. `## Who owns what on the plugin route`: one sentence plus a link to the matrix's `## Plugin containers`, plus the
   co-owned `.agents/skills/` caveat.
3. `## Install, pin, update and roll back`: one table of client × action with the real commands, plus one alert per
   client where a step can bite. The Codex `--ref` warning is **SEC**.
4. `## Set the repository up` (plugin setup, with real output).
5. `## Move an existing setup`: the `clean` step as 1.12.0 ships it (keeping or purging user state), then
   `plugin setup`.
6. `## Where to go next`.

What moves out, and where:
- provenance italics, vendor quotes and fixture counts → `.github/client-contracts.md`, as fragments returned to `b10`;
- troubleshooting rows → troubleshooting (the duplicate goes);
- the organization routes (Cursor team marketplace, Codex workspace) → `org-rollout.md` (`b7`);
- settings-collision rules → troubleshooting.

Fold in the inbox row on the bare touchpoint names under the plugin namespace: show `/stamity:<id>` for the plugin
route.

**`docs/apm.md`** (how-to; budget 1,800; target 600). Outline:
1. Two opening sentences.
2. `## Before you start`: the apm-cli floor 1.12.0 tests, and a token for a private repository.
3. `## Install`: the slim package spec 1.12.0 ships, with real output.
4. `## What you get`: the classes APM deploys, and what it does not carry.
5. `## Use APM beside the CLI`: the `apm-backed` mode, if 1.12.0 ships it.
6. `## Update`.
7. `## Where to go next`.

Sources: `docs/getting-started.md:94-133` on the base commit, Package 20's APM sections, and
`docs/specs/apm-canonical-distribution.md`.

### b4-daily-use — pick a touchpoint, your setup on disk, parallel work, troubleshooting

| Field | Content |
|---|---|
| `id` | `b4-daily-use` |
| `requirements` | spec carries no ids (package goals G3, G1, G5, G6) |
| `files` | `docs/working-with-stamity.md`, `docs/your-setup.md`, `docs/parallel-work.md`, `docs/troubleshooting.md`; their files under `test/docs/pages/`; `test/cli/commands/check.test.ts` (only if a sample line it pins changes wording); `scripts/visuals/specs/work-run.mjs` and `docs/visuals/work-run.svg` (new); `website/src/css/custom.css` (only if the spine heading changes; keep it so this file is untouched) |
| `interfaces` | The page specs below. |
| `testCriteria` | **Given** `npx vitest run test/docs test/docsPages.test.ts test/ci/visuals.test.ts test/cli/commands/check.test.ts`, **then** it exits 0, with these cases:<ul><li>`working-with-stamity.md` is at most 150 lines and its touchpoint table still equals the charter index (pinned);</li><li>the spine's `/st-ask` and `/st-debug` edges match `content/commands/st-ask.md:143-146` and `content/commands/st-debug.md`;</li><li>troubleshooting's per-row headings are set-equal with `check.ts`'s probe ids, in printed order;</li><li>the troubleshooting sample's learnings count equals the number of learnings in `.stamity/learnings/` (inbox row `docs/troubleshooting.md:34`);</li><li>every `check` row section holds a meaning, a cause, a fix and a verify step.</li></ul>**Given** the troubleshooting sample, **then** it is a fresh capture of a real `check` run on the session's build. |
| `edgeCases` | **The doctor-row pin parses table rows today:** it moves to the `###` per-row form in this page's test file, with a `TEST CHANGE, justified:` paragraph (anchors per row, the friction study's highest troubleshooting fix). **The per-touchpoint "writes" table names a file a touchpoint no longer writes:** read each command's text (`content/commands/st-*.md`) on the session's tree. **A `check` row was added by 1.12.0:** it gets its section; the set-equality pin catches a miss. |
| `depends_on` | `b1-skeleton` |
| `verify` | `npx vitest run test/docs test/docsPages.test.ts test/ci/visuals.test.ts test/cli/commands/check.test.ts && node scripts/visuals.mjs --check && cd website && npm run build` |

#### b4 pages

**`docs/working-with-stamity.md`** (how-to; budget 1,800; target 1,200; at most 150 lines; title "Pick a touchpoint").
Outline:
1. Two opening sentences.
2. `## Which touchpoint do you need?`: the nine-row table, which mirrors the charter (pinned), plus an "for example"
   column:
   - a bug → `/st-debug`, or `/st-quick` when the cause is known and the fix fits the quick lane;
   - a feature → `/st-plan`, then `/st-work`;
   - a two-line fix → `/st-quick`;
   - a question → `/st-ask`;
   - pull-request comments → `/st-pr-resolve`;
   - feedback on agent work → `/st-rework`;
   - a spec → `/st-spec`;
   - a board → `/st-board`.

   State the quick lane's thresholds from `content/commands/st-quick.md`, including "one item whose source change
   cannot land in a single source file" (`:70`).
3. `## How the nine fit together`: the heading text is kept, because `website/src/css/custom.css:508` reserves its
   layout. Then the Mermaid spine with its two edges fixed, and `accTitle` and `accDescr` kept.
4. `## Walk one change`: the `work-run` diagram, then its text twin listing the phases and what each gate checks.
5. `## Resume a run`: `ledger status` after a compaction on Cursor, Copilot and headless Codex. The resume-card
   sentences come from `docs/getting-started.md:244-253` on the base commit and are pinned here.
6. `## Where to go next`.

Moves out: worktrees → `parallel-work.md`; "what a run leaves on disk" → `your-setup.md`.

**`docs/your-setup.md`** (reference; budget 2,500; target 1,100; title "Your setup on disk"). Outline:
1. Two opening sentences.
2. `## What init writes for each client`: one `text` tree per client, from the per-client table at
   `docs/getting-started.md:146-166` on the base commit, checked against a real `init` in a scratch repository per
   client. Link the capability matrix for the dialect detail.
3. `## What lives in .stamity/`: an annotated `text` tree, then a per-touchpoint "writes" table. For example, `/st-work`
   writes `.stamity/runs/<UTC date>_<slug>/` with `record.md`, `plan.md`, `ledger.jsonl` and `reports/`
   (`content/commands/st-work.md:35-42`, `:161`).
4. `## What to commit`: from `docs/getting-started.md:329-345`.
5. `## Update stamity`: the update and pin paths 1.12.0 documents (`stamity upgrade` if shipped), and the update
   notice in one sentence, linking the security page for its switches.
6. `## Remove stamity`: `clean`, and the purge option as 1.12.0 ships it. The **SEC** user-state warning goes in a
   WARNING alert.
7. `## Where to go next`.

**`docs/parallel-work.md`** (how-to; budget 1,800; target 500; title "Run changes in parallel"). Outline:
1. Two opening sentences.
2. `## Set up a lane`: `worktree setup <name>`, with real output.
3. `## List and clean up lanes`.
4. `## What a lane copies, and what it never touches`: a consent table. "A branch is never deleted."
5. `## Where to go next`.

Sources: `docs/working-with-stamity.md:115-143` on the base commit, the CLI reference's worktree section, and
`docs/specs/worktree-lane.md`.

**`docs/troubleshooting.md`** (reference; budget 2,500; target 2,000). Outline:
1. Two opening sentences.
2. `## Find your symptom`: a router table of symptom or message → section.
3. `## What a failed run tells you`: one paragraph on the exit model, linking the CLI reference's exit codes.
4. `## What \`check\` prints` (heading kept, pinned): the annotated real healthy output. Then one `### \`<row-id>\`` per
   row, in printed order (`src/cli/commands/check.ts:1072-1079` on the base commit). Each row gets at most 60 words:
   its meaning, its cause, its fix and how to verify the fix.
5. `## Common failures` (heading kept, pinned): one `###` per error code. Package 20's `## When a route misbehaves`
   follows, with its pinned headings.
6. `## Where to report a problem` (issues URL and advisory URL, pinned).
7. `## Where to go next`.

What moves out, and where:
- the Codex measurements → capability matrix and `.github/client-contracts.md` (fragments to `b10`);
- the guard's history → `CHANGELOG.md` (`b10`);
- the write-path internals → the security page (`b8` writes them from the base commit), with a one-line remedy kept
  here;
- the Windows PowerShell gap stays as a two-sentence residual on the `claude-hook-shell` row (**SEC**).

### b5-customize — the customization hub, recipes, the reference, and your own hooks

| Field | Content |
|---|---|
| `id` | `b5-customize` |
| `requirements` | spec carries no ids (package goals G4, G1, G5, G6) |
| `files` | `docs/customization.md`, `docs/customization-recipes.md`, `docs/overrides-and-overlays.md`, `docs/hooks.md`; their files under `test/docs/pages/`; `scripts/visuals/specs/overlay-merge.mjs`, `scripts/visuals/specs/hook-events.mjs` and their SVGs (new); the two pilot specs `customize-ladder` and `precedence-stack`, only if a label changes |
| `interfaces` | The page specs below. |
| `testCriteria` | See **b5 test criteria** below the table. |
| `edgeCases` | **Package 20 file 1 shipped a config reset:** the undo table and R6 use it. **It did not:** the undo row says plainly that a key can only be set again, never cleared, and links the inbox decision's outcome in `CHANGELOG.md`. **The user-hook matcher syntax or exit-code contract differs per client:** read `src/hooks/userHooks.ts` in full and the adapters' hook renderers, write what is common, and link the matrix for the rest. **An overlay on a pack skill** (an open inbox probe): state only what the planner states (`src/emit/planner.ts:444-458`, `:600-603`), that a pack skill cannot be replaced. |
| `depends_on` | `b1-skeleton` |
| `verify` | `npm run build && npx vitest run test/docs test/docsPages.test.ts test/ci/visuals.test.ts && node scripts/visuals.mjs --check && cd website && npm run build` |

**b5 test criteria.**
- **Given** `npx vitest run test/docs test/docsPages.test.ts test/ci/visuals.test.ts`, **then** it exits 0, with these
  cases:
  - the hub's goal table names every mechanism in this list: config key, overlay (`.customize.md`), overlay
    (`.customize.yaml`), override, your own artifact, your own hook, MCP server, pack, workspace, fork layer, pack-source
    policy, and the client's own folders (G5);
  - the hub has `## Undo a customization`, with one row per mechanism;
  - the recipes page has twelve `##` recipes, each holding a fenced file or command, a `Verify` step and an `Undo`
    step;
  - the reference page holds the `CLASS_LAYOUT` paths and the advisory-threshold rows (pins moved from the
    customization page's test);
  - the hooks page names every event in `src/hooks/model.ts` and shows a complete hook file that `validate` accepts.
- **Given** each recipe's example file, written into a scratch repository and run through `validate` and `sync` by a
  test, **then** `validate` exits 0 and the emitted copy changes as the recipe says. The test lives in
  `test/docs/pages/customization-recipes.test.ts` and runs `dist/cli.js`.

#### b5 pages

**`docs/customization.md`** (hub; budget 1,500; target 1,200; title "Customize stamity"). Outline, exactly:

1. Two opening sentences.
2. `## What do you want to change?`: the goal table, with columns goal · use · file or command · scope · survives
   upgrades? · recipe. Twelve rows:
   - what an agent says, added to → overlay `.customize.md`;
   - one field → overlay `.customize.yaml`;
   - rewrite it → override;
   - something new → your own artifact;
   - models or effort → config key;
   - the gate commands → config key;
   - when rules load → `ruleDelivery`;
   - something that must run every time → your own hook;
   - an external tool → MCP server;
   - more content → pack;
   - many repositories → workspace (tools, tier and MCP only), pack (additions) or fork layer (replace or patch);
   - only on my machine → the client's own folders.
3. The `customize-ladder` diagram. Its facts are in the table above.
4. `## Patch before you replace`: four sentences. An overlay survives upstream rewrites (the wrap). An override stops
   tracking upstream (the eject). Then a link to the recipes.
5. `## Which customization wins`: the `precedence-stack` diagram, its twin list, and two worked conflicts:
   - you patched an artifact and a fork replaced it → your patch applies over the fork's body;
   - you replaced an artifact and the fork patched it → the fork's patch is inert, and `validate` says so.
6. `## See what you changed`, with real output:
   - `validate`'s shadowing rows;
   - `config list`'s `(set)` and `(default)`;
   - `sync --dry-run`;
   - `git diff` on the emitted path;
   - `check`.
7. `## Undo a customization`: one table, one row per mechanism.
8. `## What reaches each client on each route?`: Package 20's section, kept and trimmed.
9. `## What you cannot customize`: the charter body (only in a fork), pack artifacts (they add ids only), and any
   recorded-but-unread key as 1.12.0 reads it.
10. `## Where to go next`.

**`docs/customization-recipes.md`** (how-to; named budget 2,600; target 2,200). Twelve recipes. Each is
`## <the goal, as a task>`, then the smallest file in full (a fenced block), then the commands, then `Verify:` (real
output or the emitted path to open), then `Undo:`. The recipes:

1. Make the reviewer agent insist on tests: `.stamity/overrides/agents/reviewer.customize.md`. The reader test's T2
   follows this recipe.
2. Add your house conventions to a shipped rule: `rules/<id>.customize.md`.
3. Change one field of a shipped artifact: `<id>.customize.yaml`, where `key: null` removes a key.
4. Replace a shipped artifact completely: a full file with every required field. Warn that replacing a floor
   artifact is reported by nothing.
5. Add your own rule for some files: `scope: conditional` with `globs:`. The reader test's T3.
6. Add your own skill or command.
7. Pick the model or effort the agents use: the `model.*` and `effort.*` keys.
8. Change the test, lint or typecheck command: `gates.*`, cleared with `none`. The reader test's T7.
9. Load rules every session: `ruleDelivery always-on`.
10. Run your own check before or after a tool call: a user hook, linking `hooks.md`.
11. Connect an MCP server: `config mcp add`.
12. Use the same customization in many repositories: a decision between the workspace cascade, a pack and the fork
    layer.

Sources: `docs/customization.md:38-371` on the base commit, `src/cli/commands/config.ts` and
`docs/configuration.md`.

**`docs/overrides-and-overlays.md`** (reference; budget 2,500; target 1,800). Outline:
1. Two opening sentences.
2. `## Where each file goes`: the class/path tables, with the `CLASS_LAYOUT` pin moved here.
3. `## The fields a file needs`: the full frontmatter and one complete example per class shape. Then the strict versus
   advisory table and the advisory line thresholds, with their pinned rows moved here.
4. `## How a patch merges`: the `overlay-merge` diagram, then a LazyVim-style table: frontmatter keys replace whole;
   `key:` or `key: null` removes; lists replace whole; the body is appended after one blank line; there is no prepend
   and no anchor.
5. `## What the save gate refuses`: the strict list and the real refusal output.
6. `## Ids, names and prefixes`: the bare id; `cmd-` for commands; the emitted spelling; why `st-` and `stamity-` are
   refused.
7. `## Where a skill override lands`: per-client projection, with the bridge-import sentence and its pin moved here.
8. `## The fork layer`: what a fork maintainer replaces or patches under `fork/`; `validate`'s `— fork layer` rows; the
   inert and waiting outcomes; `dist/fork` staging; and that APM excludes patch control files. Sources:
   `docs/customization.md:296-318` and `docs/enterprise-forks.md:577-689` on the base commit.
9. `## Where to go next`.

**`docs/hooks.md`** (how-to; budget 1,800; target 800; title "Your own hooks"). Outline:
1. Two opening sentences.
2. `## Write a hook`: a complete `.stamity/hooks/<name>.json` file, such as
   `{"hooks":[{"event":"pre_tool_use","matcher":"…","command":["node","scripts/check.mjs"],"timeoutMs":5000}]}`. Then:
   - the six events (`src/hooks/model.ts:29-36` on the base commit);
   - the launcher rules: exec-form argv, a script inside the repository, no network (`src/hooks/userHooks.ts:25-34`);
   - the `hooks.userHooksDir` key.
3. The `hook-events` diagram, with its text twin.
4. `## Check and apply it`: `validate` names a defect by its code (`src/hooks/userHooks.ts:43-53`), and `sync` wires the
   hook into each client's settings.
5. `## How each client runs it`: one sentence per client on its trust gate, linking the capability matrix's hook rows.
6. `## Remove a hook`.
7. `## Where to go next`.

### b6-teams — workspaces, packs and trust

| Field | Content |
|---|---|
| `id` | `b6-teams` |
| `requirements` | spec carries no ids (package goals G3, G1, G5, G6) |
| `files` | `docs/workspaces.md`, `docs/packs-and-trust.md`; their files under `test/docs/pages/`; `scripts/visuals/specs/workspace-cascade.mjs`, `scripts/visuals/specs/trust-ladder.mjs` and their SVGs (new) |
| `interfaces` | The page specs below. |
| `testCriteria` | **Given** `npx vitest run test/docs test/docsPages.test.ts test/ci/visuals.test.ts`, **then** it exits 0, with these cases:<ul><li>workspaces opens with `## What reaches member repositories`, holding the propagated fields;</li><li>every workspace subcommand is named, with its count in words (pinned);</li><li>every trust tier is named (pinned);</li><li>the "not armed" sentence holds while the verifier is unarmed (pinned);</li><li>the Sigstore-optional sentence is present (pinned on both this page and the security page).</li></ul> |
| `edgeCases` | **1.12.0 propagates more workspace fields:** the first table lists what the tree propagates, read from the workspace engine. **The pack-author half outgrows the 1,800 budget:** the author half moves into `<details>` blocks; a split page goes on the drop list for a later package. |
| `depends_on` | `b1-skeleton` |
| `verify` | `npx vitest run test/docs test/docsPages.test.ts test/ci/visuals.test.ts && node scripts/visuals.mjs --check && cd website && npm run build` |

#### b6 pages

**`docs/workspaces.md`** (how-to; budget 1,800; target 1,300). Outline:
1. Two opening sentences.
2. `## What reaches member repositories`: a table of what propagates (`tools`, `maturityTier`, `mcp`) and what does
   not yet (selection deltas, locks), from `docs/workspaces.md:251-255` and `:276-287` on the base commit.
3. The `workspace-cascade` diagram, with its twin list.
4. `## Create a workspace`: init each member first, then the subcommands, then an example `workspace.json`.
5. `## Push the policy down`: `workspace sync`, then the status rows and real output.
6. `## Limits`.
7. The workspace JSON document's fields, inside `<details>`.
8. `## Where to go next`.

**`docs/packs-and-trust.md`** (how-to; budget 1,800; target 1,800). Outline:
1. Two opening sentences.
2. `## Install a pack`: `add <spec> --dry-run` with real output, then `add`.
3. The `trust-ladder` diagram, with the tiers table as its twin (pinned).
4. `## What a signature proves, and what it does not`.
5. `## Allow or refuse pack sources`: `config policy`, where deny wins.
6. `## Run an unsigned pack on purpose`.
7. `## Check and remove a pack`.
8. `## Publish a pack of your own`: sign, verify and publish, with the author detail in `<details>`.
9. `## Where to go next`.

What moves out, and where:
- the network paragraph → the security page;
- the receipt edge and the unarmed-verifier detail → the security page (**SEC**; `b8` writes them from the base
  commit), with the pinned "not armed" sentence kept here.

### b7-enterprise — the enterprise overview and the four fork pages

| Field | Content |
|---|---|
| `id` | `b7-enterprise` |
| `requirements` | spec carries no ids (package goals G3, G1, G2, G6) |
| `files` | See **b7 files** below the table. |
| `interfaces` | The page specs below. |
| `testCriteria` | **Given** `npx vitest run test/docs test/docsPages.test.ts test/ci/visuals.test.ts test/upstream test/ci/upstreamWorkflow.test.ts test/ci/pluginDistribution.test.ts`, **then** it exits 0, with these cases:<ul><li>every pinned heading the old fork page held is found on its new page by the moved `sectionOf` calls;</li><li>the quickstart's links still name a heading in their target page and resolve to the new pages, and the quickstart stays at most 120 lines with its three day headings;</li><li>`importRecipe` and `resetRecipe` run the moved command blocks from the new page paths;</li><li>every workflow notice and the distribution README name a page that exists.</li></ul>**Given** `cd website && npm run build`, **then** it exits 0. |
| `edgeCases` | **A pinned exact heading text from Package 20 reads oddly on the new page:** keep it; a wording change is a later package. **A workflow notice names an anchor:** use the new page's anchor, as the site build prints it. **A fork lane relies on the old anchor:** anchors are not a promised contract; the CHANGELOG page map (`b10`) tells forks where each section went. |
| `depends_on` | `b1-skeleton` |
| `verify` | `npx vitest run test/docs test/docsPages.test.ts test/ci/visuals.test.ts test/upstream test/ci/upstreamWorkflow.test.ts test/ci/pluginDistribution.test.ts && node scripts/visuals.mjs --check && cd website && npm run build` |

**b7 files.**
- Pages: `docs/enterprise-quickstart.md`, `docs/fork-setup.md`, `docs/enterprise-forks.md`, `docs/fork-release.md` and
  `docs/org-rollout.md`, with their files under `test/docs/pages/`.
- Tests that run a page's command blocks: `test/upstream/importRecipe.test.ts` (Package 18) and
  `test/upstream/resetRecipe.test.ts` (Package 20). Both point at the page that now holds the section.
- Notices that name a docs page:
  - `.github/workflows/upstream-update.yml` (the notices at `:157`, `:558`, `:650`, `:686`, `:874` on the base commit);
  - `.github/workflows/fork-release.yml` (`:118`);
  - `scripts/build-plugin-distribution.mjs` (the distribution README at `:436`).
- Tests that pin those notices: `test/ci/upstreamWorkflow.test.ts` (`:317`), and `test/ci/pluginDistribution.test.ts`
  where it pins that README text.
- The diagrams `enterprise-days`, `upstream-lane` and `fork-release-jobs`: specs and SVGs, all new.

#### b7 pages

**`docs/enterprise-quickstart.md`** (hub; budget 1,500; at most 120 lines; target 700; title "Enterprise overview").
Outline:
1. Two opening sentences.
2. The `enterprise-days` diagram, with its twin (the day headings and their steps).
3. `## Who does what`.
4. The three pinned day headings, kept verbatim. Each step is one bullet with one link, whose text equals a heading in
   the target page. The links now land on `fork-setup.md`, `fork-release.md`, `org-rollout.md`, `choose-a-route.md` and
   `enterprise-forks.md`.
5. `## Where to go next`.

**`docs/fork-setup.md`** (how-to; budget 1,800; target 1,400; title "Set up a fork"). Outline:
1. Two opening sentences.
2. `## Check the prerequisites`: a checklist.
3. `## Import the history into a private repository`: Package 18's import recipe, run by `importRecipe.test.ts`. The
   **SEC** "Actions off first; never repeat `push --mirror`" goes in a WARNING alert.
4. `## Set the package's identity` (pinned heading in the old page's test, moved here):
   - `fork-identity.mjs` and `--suffix`;
   - the **SEC** `npx --no` versus `-y` summary of about 120 words;
   - the github.com-only limit.
5. `## Turn the workflows on last`.
6. `## Recover when there is no shared history`.
7. `## Reset or re-import under protected branches`: Package 20's heading and blocks, run by `resetRecipe.test.ts`.
8. `## Recommended settings and enterprise constraints`: Package 20's section and its case.
9. `## Where to go next`.

**`docs/enterprise-forks.md`** (how-to; named budget 3,000; target 2,600; title "Take upstream updates"). Outline:
1. Two opening sentences.
2. The `upstream-lane` diagram, with its twin (the verbs and outcomes tables).
3. `## Configure the lane`: `.stamity/upstream.json` and the recommended values, including `generatedPaths`. Add
   `docs/visuals/` with `node scripts/visuals.mjs --write`; this is the fork contract.
4. `## Take the next release`: the verbs, then the outcome and exit-code table. The `VERBS` and `OUTCOMES` pins stay.
5. `## Resolve a conflict`.
6. `## Write the gates that decide`.
7. `## Land the update`: the merge commit, plus the DCO fork exemption in two sentences.
8. `## Back out`.
9. `## Run the lane in GitHub Actions`: the workflow, the token, the failed-run table and the **SEC** "automation never
   pushes a workflow change".
10. `## Who guarantees what`: a three-column table.
11. `## Where to go next`.

What moves out, and where:
- the DCO reachability logic and the six practices → `CONTRIBUTING.md` (`b9`, from the base commit);
- the fork-layer authoring → `overrides-and-overlays.md` (`b5`, from the base commit);
- the release, plugin distribution and APM sections → `fork-release.md`;
- the rollout → `org-rollout.md`;
- the evidence-retention list → the run records it cites.

**`docs/fork-release.md`** (how-to; budget 1,800; target 1,800; title "Release your fork"). Outline:
1. Two opening sentences.
2. The `fork-release-jobs` diagram, with its twin.
3. `## Arm the release workflow`: the **SEC** environment secret, and creating the environment before the first tag.
4. `## Cut a release`.
5. `## Ship the plugin distribution`.
6. `## Ship the APM package`: the private APM release and its consumer, plus the token precedence.
7. `## Consume the release`: Package 20's `#### Pin the CLI` and `#### Take an update`.
8. `## Keep Renovate in step`.
9. `## Where to go next`.

The pinned `## Release your fork` section moves here, with its renderer and `DISTRIBUTION_KEYS` cases, under that exact
heading or with the pin moved and justified.

**`docs/org-rollout.md`** (how-to; budget 1,800; target 1,700; title "Roll out to your organization"). Outline:
1. Two opening sentences.
2. `## Choose how developers get stamity`: link the route chooser.
3. `## Claude Code: managed settings`: the template block held equal to its renderer (pinned json), the exact-match
   lockout, the source ranking and the first-run screens.
4. `## Cursor: team marketplace`.
5. `## GitHub Copilot: organization install`.
6. `## Codex: workspace`.
7. `## Where review sits` (**SEC**).
8. `## Where to go next`.

Package 20's ten pinned `###` subsections of `## Roll the plugin out to your organization` move here, with their case,
under their exact texts.

### b8-security — the security model on the site, and a slim `SECURITY.md`

| Field | Content |
|---|---|
| `id` | `b8-security` |
| `requirements` | spec carries no ids (package goals G2, G3, G5, G6) |
| `files` | `docs/security-mapping.md`; `SECURITY.md`; `.github/release-controls-checklist.md` (only the lines that name `SECURITY.md`'s "Publishing this package" section); `test/docs/pages/security.test.ts`; `test/docs/pages/security-mapping.test.ts`; the test that holds the checklist's reserved sentence (find it at intake with `rg -n "release-controls-checklist" test`); `scripts/visuals/specs/security-surfaces.mjs` and its SVG (new) |
| `interfaces` | See **b8 interfaces** below the table. |
| `testCriteria` | **Given** `npx vitest run test/docs test/docsPages.test.ts test/ci/visuals.test.ts` plus the checklist's test, **then** it exits 0. Every security pin that held `SECURITY.md` or the mapping before now passes on the page that holds the fact:<ul><li>the `file::symbol` minimums and their resolution;</li><li>the section-bounded symbol references;</li><li>the unwired symbols after `## What it does not defend`;</li><li>the 250 000-character and 250 000-byte sentences;</li><li>the resume-card literals;</li><li>the install-route and hook-caveat proximity regexes;</li><li>seven `###` under `## The surfaces`;</li><li>`## Gaps`;</li><li>every catalogue id and edition string.</li></ul>**Given** `SECURITY.md`, **then** it has at most 900 prose words, keeps the advisory URL, the "do not open a public issue" sentence, CVE and the `1.x` row, and links `docs/security-mapping.md`. **Given** the facts-at-risk table, **then** every **SEC** row's literal text is found on the security page or on its named home. |
| `edgeCases` | **A proximity pin breaks because a long sentence is split:** keep the two phrases inside the same sentence, never weaken the regex. **A pinned literal reads poorly:** keep it; wording is a later decision. **The checklist's reserved sentence changes meaning when moved:** move it verbatim, and keep "Publishing this package" as the heading on the security page. |
| `depends_on` | `b1-skeleton` |
| `verify` | `npx vitest run test/docs test/docsPages.test.ts test/ci/visuals.test.ts && node scripts/visuals.mjs --check && node scripts/leak-gate.mjs && cd website && npm run build` |

**b8 interfaces.** The page specs below, plus two rules:
- every pin that held `SECURITY.md`'s moved sections moves, verbatim in what it asserts, from
  `test/docs/pages/security.test.ts` to `test/docs/pages/security-mapping.test.ts`;
- the release checklist's reserved sentence now names the security page.

#### b8 pages

**`docs/security-mapping.md`** (reference; named budget 5,000; target 4,600; title "Security model"). Outline, exactly:
1. Two opening sentences: what the engine defends, what it does not, and how that maps to OWASP, the joint guidance and
   the NIST AI RMF.
2. The `security-surfaces` diagram, with its twin (the surfaces list).
3. `## What the engine defends today`: `SECURITY.md:89-110`'s control inventory, moved whole and reshaped. One-cell
   paragraphs become sub-tables or sentences of at most 30 words. Every `file::symbol` address and every pinned
   literal is kept.
4. `## Network and data handling`, moved whole from `SECURITY.md:112-157`. It also takes the network facts of
   `docs/getting-started.md:264-278` and `docs/packs-and-trust.md:181-192` on the base commit, and the update notice's
   switches.
5. `## Publishing this package`: `SECURITY.md:159-220`, with the reserved sentence verbatim.
6. `## What it does not defend`: moved whole. The reader test's T8 reads this heading.
7. `## The surfaces`: exactly seven `###`, with the crosswalk ids per surface. Each control is named, never restated:
   the rows above carry the controls.
8. `## Gaps`: the merged gaps of `SECURITY.md:222-279` and the mapping's `:233-255`, plus the security residuals the
   facts-at-risk table routes here (learnings as a surface, the receipt edge, the unarmed verifier, the write path, the
   Windows guard).
9. `## Not applicable` and the editions, inside `<details>`. Every catalogue id and edition string stays literal.
10. `## Where to go next`.

Fold in the inbox rows on `SECURITY.md:253-259` (recheck the accepted-risk date, or drop the stale date with the
paragraph) and `SECURITY.md:105` (pin the committed-ledger row's wording).

**`SECURITY.md`** (GitHub security policy; at most 900 words; target 800). It keeps:
- how to report, with the advisory URL, "do not open a public issue" and CVE;
- `## Supported versions`, with the `1.x` row.

It gains:
- `## Scope`: three bullets plus a link to the security model;
- `## Network`: two sentences plus a link;
- `## Standards mapping`: one sentence plus the link `](docs/security-mapping.md)` (pinned).

The image-size history leaves for `CHANGELOG.md` (`b10`).

### b9-about-project — doctrine, CONTRIBUTING and GOVERNANCE without duplicates

| Field | Content |
|---|---|
| `id` | `b9-about-project` |
| `requirements` | spec carries no ids (package goals G2, G1) |
| `files` | `docs/doctrine.md`, `CONTRIBUTING.md`, `GOVERNANCE.md`; `test/docs/pages/doctrine.test.ts`, `test/docs/pages/contributing.test.ts`; `test/docs/runOfRecord.test.ts` (only the doctrine line) |
| `interfaces` | The page specs below. |
| `testCriteria` | **Given** `npx vitest run test/docs test/docsPages.test.ts test/content/invariantsVersion.test.ts test/corpus/invariants.test.ts test/ci/workflow.test.ts`, **then** it exits 0, with these cases:<ul><li>doctrine keeps `## Amendments` (pinned) and one run-of-record line (pinned);</li><li>the count sentences are gone, along with their derived pin (test change, justified because counts drift and the sidebar shows the set);</li><li>CONTRIBUTING holds README's moved contributor sections, the six practices and the DCO logic;</li><li>its regeneration table lists six commands (pinned);</li><li>GOVERNANCE names the two required checks and links CONTRIBUTING for the lanes, with `all-pr-checks`, `pr-checks.yml` and `all-ci-checks` kept (pinned).</li></ul> |
| `edgeCases` | **`test/content/invariantsVersion.test.ts` reads the amendments table's shape:** keep it byte-for-byte. **GOVERNANCE's lane text is pinned by `test/ci/workflow.test.ts`:** keep each pinned literal where the test reads it. |
| `depends_on` | `b1-skeleton` |
| `verify` | `npx vitest run test/docs test/docsPages.test.ts test/content/invariantsVersion.test.ts test/corpus/invariants.test.ts test/ci/workflow.test.ts && cd website && npm run build` |

#### b9 pages

**`docs/doctrine.md`** (explanation; budget 1,500; target 1,100; title "Why stamity ships what it ships"). It keeps:
- the root question and its answers;
- the four pillars, with one enforcing surface each;
- how an artifact is deleted;
- the honest state;
- one run-of-record line, linking measurements;
- the native-memory reassessment sentence, under the learning pillar;
- `## Amendments`.

What moves out, and where:
- the eval narrative → measurements;
- the constants and test paths → nowhere: they are code;
- "What a session pays" → three sentences plus a link to the matrix's `## Always-on cost by client` (pinned there).

**`CONTRIBUTING.md`** (project page). It absorbs, from the base commit:
- README's "Working on this repository", "Where everything lives" (the repository map, minus the two rows README keeps),
  "What the tests cover" and "Why stamity runs on itself";
- `docs/enterprise-forks.md:1337-1355` (the six practices);
- the DCO reachability logic of `:512-528`.

It keeps its pinned posture phrases, the three test lanes, the leak-gate row and the regeneration table. It stays the
CI lanes' one home.

**`GOVERNANCE.md`** (project page). Its CI legs and shards at `:47-137` become two sentences naming the two required
checks, plus a link to CONTRIBUTING's lanes. Every literal `test/ci/workflow.test.ts` pins stays.

### b10-integration — the shared files, the evidence page, and the switches that make the rules strict

| Field | Content |
|---|---|
| `id` | `b10-integration` |
| `requirements` | spec carries no ids (package goals G1, G2, G3, G6, G7) |
| `files` | See **b10 files** below the table. |
| `interfaces` | See **b10 interfaces** below the table. |
| `testCriteria` | **Given** the full gate, **then** it exits 0:<ul><li>`npm run lint && npm run typecheck && npm run test`;</li><li>`npm test -- --coverage`;</li><li>`node scripts/visuals.mjs --check`;</li><li>`node scripts/leak-gate.mjs`;</li><li>`cd website && npm run typecheck && npm run build`, with zero broken anchors under `throw`;</li><li>`node scripts/site-markdown-twins.mjs website/build`.</li></ul>**Given** `test/docs/prose.test.ts`, **then** every page in the baseline set declares `kind:`, and the total is at most 60% of `BASELINE.total`. Print the share. **Given** `test/ci/visuals.test.ts`, **then** every SVG is referenced by a page and its facts are in that page's text. **Given** `test/docs/oneHome.test.ts`, **then** it passes. |
| `edgeCases` | **The total is over 60% with every page within its own budget:** cut along the one-home table first. If that still fails, S23 applies: record `Not done:` with the measured share, and do not drop a needed fact. **`onBrokenAnchors: 'throw'` fails on an anchor in a generated page:** fix its generator, never the generated file. **A content unit returned no fragments for `.github/client-contracts.md`:** check the facts-at-risk rows routed there, and record it. |
| `depends_on` | `b2-front-door`, `b3-start-routes`, `b4-daily-use`, `b5-customize`, `b6-teams`, `b7-enterprise`, `b8-security`, `b9-about-project` |
| `verify` | `npm run lint && npm run typecheck && npm run test && npm test -- --coverage && node scripts/visuals.mjs --check && node scripts/leak-gate.mjs && cd website && npm run typecheck && npm run build && cd .. && node scripts/site-markdown-twins.mjs website/build` |

**b10 files.**
- `website/sidebars.ts`, if a label or order needs a final touch.
- `src/cli/docs/llmsIndex.ts` and `llms.txt`.
- `test/cli/docs/llmsIndex.test.ts`.
- `website/docusaurus.config.ts` (`onBrokenAnchors`).
- `test/ci/visuals.test.ts` (`ORPHANS_ALLOWED`).
- `test/docs/oneHome.test.ts` (new).
- `.github/client-contracts.md` and `test/docs/evidencePages.test.ts`.
- `CHANGELOG.md` (`## [Unreleased]`).
- `scripts/qa/run.mjs`, if a route moved.

**b10 interfaces.**
- **`llmsIndex.ts`** reads each hand page's description from its `description:` frontmatter. Only the root pages keep
  a literal description. This removes one hand-kept copy.
- **The `Common tasks` section of `llms.txt`** lists about a dozen tasks, each `[<task>](docs/<page>.md#<anchor>)`.
  The anchors come from the built site:
  - set stamity up;
  - check that it worked;
  - pick a touchpoint;
  - patch the reviewer;
  - add a rule for some files;
  - change a gate command;
  - undo a customization;
  - write a hook;
  - add or remove a pack;
  - share settings across repositories;
  - take an upstream update;
  - fix a `check` row;
  - what the engine does not defend.
- **`onBrokenAnchors: 'throw'`** (S21).
- **`ORPHANS_ALLOWED = false`.**
- **`test/docs/oneHome.test.ts`** holds a table of about fifteen phrases, each tied to the pages that may state it,
  drawn from the one-home table. Examples: `0.155.1`, `COPILOT_ALLOW_ALL`, `AGENTS.override.md`, the Node floor
  version, the `--ref` warning. It fails when a phrase appears on any other hand page. Links do not count.
- **`.github/client-contracts.md`** takes the dated measurements and provenance fragments returned by `b3`, `b4` and
  `b5` (S22), under its existing headings and with its pins kept.
- **`CHANGELOG.md`** gets a `### Changed` entry: the docs are rebuilt around reader goals, with the page map (every old
  section → its new page) for forks that link or patch docs. It also gets the history lines moved out of the pages:
  the guard's old fail-open, and the image-size history.

### b11-review-merge — review rounds, the final whole-branch review, and the merge

| Field | Content |
|---|---|
| `id` | `b11-review-merge` |
| `requirements` | spec carries no ids (package goals G1–G7) |
| `files` | the review records in the run record; fix commits that touch only the files of the unit the finding is about |
| `interfaces` | See **b11 interfaces** below the table. |
| `testCriteria` | **Given** the last round, **then** every reviewer approves at or above the confidence gate, and the ledger has no open row. **Given** the PR head, **then** `b10`'s full gate passes and CI is green on every leg, Windows included. **Given** the merge, **then** `main` is fast-forwarded and its push run is green. **The site is not deployed** in this file. |
| `edgeCases` | **The design lens finds a diagram unreadable at 375 px:** the kit's template gets a narrow layout in a fix commit, and `--check` re-renders every SVG. **A truth finding shows a claim was already wrong on the base commit:** fix it here and note it in the CHANGELOG. **The known Windows fixture flake:** re-run only its failed job, and record both runs. |
| `depends_on` | `b10-integration` |
| `verify` | `b10`'s `verify`, plus the PR's checks |

**b11 interfaces.** Review rounds on the PR run until approval, each lens a fresh `opus` reviewer that reads the change
itself:
1. **Truth.** Every changed claim is checked against the tree at the head. Sample at least two claims per page.
2. **Journey.** Walk the seventeen tasks of the 2026-10-02 friction study on the built site, and count clicks and
   words to success.
3. **Voice and terms.** The contract's words and glossary spellings.
4. **Security preservation.** Every **SEC** row of the facts-at-risk table is present, with its literal text.
5. **Design quality.** A `stamity-design-quality` reviewer looks at the thirteen diagrams and the pages on the built
   site, in light and dark, at 375 px and at 1,440 px.

Then **a final whole-branch review on `fable`** (Fable 5.1) over the whole diff. Fix rounds follow until approval, with
every Minor fixed or recorded.

## Execution order

1. `b0-intake`, then `b1-skeleton`, both by the orchestrator's lane, on the PR branch.
2. Eight parallel lanes: `b2` to `b9`. Each runs in its own worktree with its own scratch folder and reads sources on
   the base commit (S18). The lanes are file-disjoint by the units' `files`:
   - the shared files (`website/sidebars.ts`, `src/cli/docs/llmsIndex.ts`, `llms.txt`, `test/docs/shared.ts`,
     `scripts/qa/run.mjs`, `CHANGELOG.md`, `.github/client-contracts.md`) belong to `b1` and `b10` only;
   - each diagram spec and SVG belongs to the unit in the visual inventory;
   - never use `git stash`.
3. `b10-integration` merges the lanes in the order `b2` → `b9` and writes the shared files.
4. `b11-review-merge`.

**Size:** about 10–14 h wall-clock and 12 units, with eight writers in parallel. **Maintainer touchpoints:** the merge,
and any question a reviewer escalates.

## Shared contracts touched

| Contract | Owner | Notes |
|---|---|---|
| The sidebar and `llms.txt` | `b1`, then `b10` | The groups are exactly as listed. |
| `REATTESTATION_DATE` | `b1` (S19) | Every page stamps `<D>`. |
| Cross-page pins (`test/docs/crossPage.test.ts`) | `b1` (S17) | Writers own only their pages' test files. |
| The security pins (moved from `SECURITY.md`) | `b8` | Moved verbatim in what they assert. |
| The fork contract (`generatedPaths` in the fork guide) | `b7` | Gains `docs/visuals/`; the CHANGELOG says so (`b10`). |
| Notices printed in fork CI and in the distribution README | `b7` | Their pins move with them. |
| `.github/client-contracts.md` | `b10` | From the fragments the content units return (S22). |
| `docs/visuals/` | the units in the visual inventory | One owner per slug. |

## QA walk

None in this file. File 3 runs the reader test, the QA harness in both themes, the maintainer's walkthrough, and the
check of the live site.

## Risks

| Severity | Risk | Mitigation |
|---|---|---|
| Warning | **A security or safety fact is lost in a cut.** | The facts-at-risk table, **SEC** rows moved whole (S20), and the review's lens 4. |
| Warning | **Parallel writers drift apart in voice and terms.** | The contract (loaded on every docs page), the glossary first (`b2`), and the review's lens 3. |
| Warning | **The 60% total is out of reach with the new pages** (recipes, hooks, glossary and overview add about 4,300 words). | Planning targets add up to about 57% (page map). The one-home test trims duplicates. S23: the facts win, and the run records `Not done:`. |
| Warning | **Package 20's pinned headings and command-running tests break in the move.** | `b0` lists them, `b7` moves each with its page, and `b10`'s gate runs the moved recipe tests. |
| Minor | **Fork lanes and readers linking old anchors land at a page top.** | Pages keep their URLs (S2), and the CHANGELOG page map shows where each section went. |
| Minor | **A diagram text twin goes stale against its diagram.** | Check 7 (same facts) of the kit's test, strict after `b10`. |

## Inbox rows this file folds in

| Row | Folded into |
|---|---|
| `docs/plugins.md`: the hand-written ownership table against the generated matrix | `b3` |
| `README.md:27-32`: no test holds README's merge-ready figure to the snapshot | `b2` |
| `docs/specs/apm-canonical-distribution.md:132-133`: README carries no `apm install` line | `b2` |
| `docs/troubleshooting.md:34`: no test compares the sample's learnings count | `b4` |
| `SECURITY.md:253-259`: the recheck date | `b8` |
| `SECURITY.md:105`: the committed-ledger row's wording has no pin | `b8` |
| The bare touchpoint names under the plugin namespace (`/stamity:<id>`) | `b3` (docs side only) |

Each folded row retires at the merge with one line in the run record.

## Open questions

None.

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

None beyond file 1's.

## Drop list

File 1's drop list holds. This file adds:
- a separate "publish a pack" page, if `b6`'s author half outgrows `<details>`;
- a wording pass on Package 20's pinned headings.
