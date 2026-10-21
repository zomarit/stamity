---
id: packs-rebuilt-01
intent: feature
stamp: b4c8235464e863b7222dd48adfd288289e49cffe 2026-10-20
reads: [src/pack/curated.ts, src/pack/catalogPins.ts, src/pack/install.ts, src/pack/manifest.ts, src/pack/projection.ts, src/pack/trust.ts, src/pack/receipt.ts, src/composition/root.ts, src/cli/commands/add.ts, src/cli/commands/check.ts, src/cli/commands/run.ts, src/cli/commands/init.ts, src/cli/commands/init/panel.ts, src/cli/commands/sync/report.ts, src/cli/engine/emissionWrite.ts, src/cli/docs/referencePages.ts, src/adapters/codex.ts, src/emit/skillsProjection.ts, src/emit/planner.ts, src/emit/capabilityMatrix.ts, src/content/catalog.ts, src/content/frontmatter.ts, src/detect/stackSupport.ts, src/merge/reclaim.ts, src/manifest/ownedPaths.ts, src/runs/morning.ts, src/runs/pullRequest.ts, src/runs/layout.ts, src/hooks/scripts.ts, src/tools/translator.ts, src/learnings/validation.ts, tsdown.config.mjs, scripts/generate-pack-manifests.mjs, scripts/tarball-smoke.mjs, scripts/eval/run.mjs, scripts/eval/instrument.mjs, packs/ops/pack.json, packs/product-audit/pack.json, packs/scaffold/pack.json, packs/scaffold/commands/st-design-system-create.md, content/skills/st-design-system-detect/SKILL.md, content/skills/st-browser-evidence/SKILL.md, content/skills/st-unattended/SKILL.md, content/skills/st-qa/SKILL.md, content/skills/st-verify/references/ui.md, content/commands/st-work.md, content/agents/stamity-reviewer.md, content/agents/stamity-implementer.md, content/agents/stamity-design-quality.md, content/rules/stamity-ui-states.md, content/rules/stamity-question-protocol.md, evals/SET-v7.md, evals/README.md, evals/coverage-exemptions-v6.md, test/evals/support.ts, test/evals/coverage.test.ts, test/evals/locators.test.ts, test/evals/successorInputs.test.ts, test/evals/readmeCurrency.test.ts, test/records/run27Repeats.test.ts, test/pack/curated.test.ts, test/pack/packEngineDefects.test.ts, test/packs/ops.test.ts, test/packs/product-audit.test.ts, test/packs/scaffold.test.ts, test/support/packFixtures.ts, test/cli/commands/add.test.ts, test/cli/commands/check.test.ts, test/cli/docs/referencePages.test.ts, test/ci/tarballStaging.test.ts, test/emit/skillsProjection.test.ts, test/emit/upgradeFrom1140.e2e.test.ts, test/adapters/codex.test.ts, test/corpus/commands/work.test.ts, test/corpus/commands/board.test.ts, test/corpus/skills/unattended.test.ts, test/corpus/skills/flow.test.ts, test/corpus/agents/specialists.test.ts, test/corpus/census.test.ts, test/learnings/repoLearnings.test.ts, test/support/support.test.ts, docs/specs/everyday-flows.md, docs/specs/orchestrator-context.md, docs/specs/overlay-layers.md, docs/specs/board-writes.md, docs/specs/enterprise-upstream-lane.md, docs/customization.md, docs/reference/packs.md, README.md, CHANGELOG.md, .stamity/learnings/codex-hooks-default-on-and-codex-exec-ran-none.md, .stamity/learnings/claude-code-refuses-sub-agent-report-file-names.md, .stamity/learnings/a-new-test-file-runs-the-test-input-census-guard.md, .stamity/learnings/a-new-import-runs-the-architecture-test.md, .stamity/learnings/a-guard-change-runs-the-container-leg-tests.md]
---

# The packs rebuilt — file 1 of 2: the engine and the core line

This file is self-contained. It is the first of two `/st-plan` artifacts for **Package 22**, which replaces the three
packs Stamity has shipped since its first release (`ops`, `product-audit`, `scaffold`: parked there at the start, never
measured, untouched since 0.1.0) with two packs that are useful in real work and stay lean, `production` and
`frontend`, plus one core writing skill. File 1 builds the engine those packs need and redraws the core line; file 2
(the next session) builds the set itself and retires the old packs. Nothing here is released on its own: the package
ships in Package 20's cut, the next minor after 1.16.0, with a notice for each retired pack and moved skill.

intent chosen: feature because the units add capabilities (a catalog derived from the packs folder, a retired-names
map, a fit check and a widened name check at `add`, two `check` rows, frontmatter pass-through, a `frontend` pack, a
pruning proof for moved skills, a blast-radius section in the pull-request body); the moves keep behaviour where a pack
is installed and say what changed where it is not.

## Context

A repository with no user interface sees two UI skills in its `/` menu today, and the pack engine has five gaps a new
pack set would hit at once: its catalog is a hand-kept list a fork must edit in code, nothing records a retired pack's
name, `add` writes before it knows a pack fits Codex's 8,000-character skills list, a same-class name clash passes `add`
and fails at `sync`, and a skill that leaves the core keeps its old copies loading in every client. File 1 closes those
gaps, moves `st-design-system-detect` and `st-browser-evidence` into a new `frontend` pack, hides the rule-skills from
menus where a client allows, lands the three habits the maintainer took from a public agent harness plus a blast-radius
section in the pull-request body, and folds the deferred rows that wait for this package. Out of scope (file 2):
`production` and its review, `st-release` and `st-incident`; `/st-ui-review` and the detector's two procedure fixes;
`/st-plain` and the charter edit; retiring the three old packs and filling the retired-names map; the packs-and-trust
worked example.

## Decisions

The maintainer's walk of 2026-10-03 settled the package: two packs, `production` and `frontend`, plus a core
`/st-plain`; both UI skills move into `frontend`, and the background rule-skills hide where a client allows; the three
habits and a blast-radius section in the pull-request body, rated `contained`, `moderate` or `wide` with one line of
reason; packs install with the `stamity` command on every route, with no plugin or package per pack; the next minor,
not 2.0.0; the names as proposed; and the engineering defaults accepted as listed. On 2026-10-20 the maintainer
answered this session's opening batch in advance with "defaults": every question below takes its recommended option.

### Declared defaults this file builds

- **The catalog** is read from `packs/*/pack.json` at first use, pinned as today; the build writes `package.json`'s
  version into every `dist/packs/*/pack.json`, and a test holds the source versions equal to it.
- **Retired names** live in a typed constant, empty in this file; `add <id>` names a retired pack only when a bare id
  misses the catalog; no retired id is ever a pack directory again; `check`'s `pack-catalog` row warns on an installed
  retired pack and on a catalog pack whose content differs from the bundled pin.
- **The fit check** measures Codex's shown list with the incoming pack staged, by the same function `sync` refuses
  with, and refuses before any write, in `--dry-run` too.
- **The name check** refuses at `add` an incoming artifact that takes a name another layer already holds in the same
  class, as it already does across classes.
- **Menus:** every rule-skill carries `user-invocable: false`, derived from its class; a skill may declare
  `user-invocable` and `disable-model-invocation` as booleans, which pass through to the emitted head; a skill that
  declares `disable-model-invocation: true` ships `agents/openai.yaml` with `policy.allow_implicit_invocation: false`
  (the pack lint holds it), so it is free in Codex's list. The touchpoint commands stay model-invocable on Claude Code,
  because flows hand off to each other by name.
- **The moves:** the two skills move with descriptions of 250 characters or fewer; existing installs lose the old
  copies on `sync` through a frozen proof of their 1.16.0 renderings, with one notice; an overlay of a moved skill is
  refused with text naming the move; a full override warns; `check` gains a `moved-skills` row for the 1.17 line.
  This repository does not add `frontend` in this file.
- **The eval surface** reads `packs/**` everywhere it reads `content/**`; the 16 artifacts of the three old packs carry
  dated exemptions that expire with their directories.
- **The pack lint** bans `${STAMITY:` and every CLI call in every pack file and holds pack skill descriptions to 250
  characters, the retiring `ops` and `product-audit` exempt while their directories exist.
- **The habits:** the implementer's return names its choices (approaches tried, dropped or reverted, each with a
  pointer); `/st-work` records each as a `choice:` line, which the unit's reviewer and the whole-branch pass read as
  leads, never as evidence; every approval carries `rests on: <the one fact> — cited | walked | run | reproduced`; a
  deploy and a message sent outside the repository (the run's own pull request aside) join the irreversible actions
  the question protocol asks about. **Blast radius:** every approving reviewer writes one `blast radius:` line,
  `/st-work` rewrites the record's `## Blast radius` from each, so it holds the last approval's, and `stamity run checkpoint --pr` carries that section into
  the pull-request body before the marker, attended and unattended; the morning list is unchanged.

### Corrections to the design's figures (measured at `b4c82354`)

- Codex's shown skills list is 5,570 of 8,000 characters today (`src/emit/capabilityMatrix.ts:345`), not 6,909: the
  shown-rows count landed in the 2026-10-03 pack-engine run. After the moves it is 4,759.
- A Claude-only repository's `/` menu shows 20 Stamity entries today (9 commands, 9 skills, 2 rule-skills), not 19;
  after this file, 16.
- `/st-work` is 485 body lines with 871 characters before `### Specialist pass` (pins at
  `test/corpus/commands/work.test.ts:442-449`): every `/st-work` edit in this file extends an existing line below the
  cut and adds no line.
- `scripts/eval/run.mjs:306` refuses only on the codex profiles' own prior runs; the executed check that the advisory
  dispositions are complete is the records-suite pattern of `test/records/run27Repeats.test.ts`.
- The logic bundle had 4,313 bytes of headroom on the last local build (`tsdown.config.mjs:99`).

## Spec delta

This delta writes one new spec and changes six. The packs spec (`packs.md` in `docs/specs/`, area `PACK`) is written
in this file with `status: design`, which the release cut flips, and holds REQ-PACK-001 to REQ-PACK-014, added.
`docs/specs/everyday-flows.md`: REQ-FLOW-125 to REQ-FLOW-128 added; REQ-FLOW-019, REQ-FLOW-081, REQ-FLOW-094 and
REQ-PLUGIN-016 modified. `docs/specs/orchestrator-context.md`: REQ-CTX-017 modified. `docs/specs/overlay-layers.md`:
REQ-OVERLAY-009 modified. `docs/specs/board-writes.md`: REQ-BOARD-004 modified. `docs/specs/prove-behavior-and-value.md`:
REQ-PROVE-002, REQ-PROVE-004 and REQ-PROVE-033 modified. It merges at this file's spec-merge unit. Each decision is the
maintainer's walk. File 2 fills the retired-names map, deletes the old packs and retires or re-points the board spec's
requirement that binds `product-audit`; none of that is here.

### REQ-PACK-001 — The catalog is derived from the packs folder, and a built pack carries the release version (ADDED)
Given a folder `packs/<id>/` holding a `pack.json` named `<id>` and a generated pin, When `stamity add <id>` resolves a
bare id, Then the bundled catalog lists it with no code edit, so a fork adds a pack by adding the folder and regenerating
the pins; a folder whose name differs, one with no description, no pin or a stale pin is refused naming each, by the
verbs that read the catalog alone. Given the built package, Then every `dist/packs/*/pack.json` reads `package.json`'s
version, a test holds each source `pack.json` to it, `generate-pack-manifests.mjs --write` sets it, and no pin moves.

### REQ-PACK-002 — Retired pack names point at their successors and are never reused (ADDED)
Given a retired-names entry for `<id>` (`src/pack/retired.ts`, a typed constant, empty in this file), When
`stamity add <id>` names it as a bare id the catalog lacks, Then it refuses before any plan with `VALIDATION_ERROR`,
naming the release that retired it, where each of its parts went, `add <successor>`, and `./node_modules/<id>` as the
way to install a package of that name on purpose; a path or scoped spec, and a local or npm pack whose manifest is named
`<id>`, resolve as today. A test holds no retired id in the catalog and no `packs/<retired id>/` folder.

### REQ-PACK-003 — `check` reports a retired or stale catalog pack (ADDED)
Given `stamity check`, Then a `pack-catalog` row reads `pass` with no pack installed, or with each installed catalog
pack's content matching its bundled pin, judged from the receipt's file hashes and never from the version; `warn` for
an installed first-party copy of a retired pack (installed from the catalog, or from a path or npm with content a
retired release shipped), naming where its parts went and the fix in the repo's replace order (`clean --pack <id>`, each
kept client copy deleted, `sync`, then `add <successor>`, then `sync`), and for an installed catalog pack whose content
no longer matches the bundled copy, naming `add <id>`. Any other path or npm pack is not judged, and the row never fails.

### REQ-PACK-004 — `add` checks that a pack fits Codex's skills list before it writes (ADDED)
Given Codex selected, When `stamity add <spec>` plans a pack, Then before any write, `--dry-run` included, it measures
the list Codex would show with the pack in it, an installed copy of the same id replaced, through the one function
`sync`'s refusal counts with (`measureCodexSkillsList`), and past 8,000 characters refuses with `VALIDATION_ERROR`,
exit 1, naming the pack, its share and the total; a pack whose skills each ship `allow_implicit_invocation: false` adds
nothing, a setup without Codex is not measured, and the receipt and `sync`'s refusal text are unchanged.

### REQ-PACK-005 — `add` refuses a pack name that collides in its own class (ADDED)
Given an incoming pack artifact whose catalog id or emitted name equals one that a core artifact, selected or not, a
fork, an override or another installed pack holds in the same class, When `stamity add` plans it, Then it refuses before
any write, naming each owner and its remedy as the cross-class check does, where today such a pack passes `add` and is
refused at `sync`; a made-up-pack test shows that gap red before the fix lands.

### REQ-PACK-006 — Two client keys pass through, and rule-skills leave the `/` menu (ADDED)
Given a core or pack skill declaring `user-invocable` or `disable-model-invocation`, Then each projects as a top-level
key, never hoisted under `metadata`, and a value that is not a boolean is refused naming the file and the key; a lint
fails a skill declaring `disable-model-invocation: true` that ships no `agents/openai.yaml` setting
`policy.allow_implicit_invocation: false`. Every rule-skill takes `user-invocable: false` from its class, no `content/`
line moving; the Claude touchpoint commands carry no `disable-model-invocation` and `st-unattended` stays in the menu,
so a Claude-only setup's `/` menu lists 16 Stamity entries, the 9 commands and 7 skills.

### REQ-PACK-007 — The `frontend` pack holds the two interface skills, and the core reads them where installed (ADDED)
Given the package, Then `packs/frontend/` ships `st-design-system-detect` and `st-browser-evidence` with their
companions, each description at most 250 characters, the core corpus no longer ships them, and `add frontend` resolves
through the catalog. Given no `frontend` pack, Then `/st-work`'s QA step and the qa skill offer a browser run only where
that skill is installed, and the design-quality agent, the UI-states rule and the verify skill's `ui-token-usage` check
each state what they read with no design-system inventory and say it is absent; no line is added to `/st-work`.

### REQ-PACK-008 — `sync` removes the moved skills' unedited copies and says so once (ADDED)
Given a setup an earlier release synced, its ledger holding `st-design-system-detect` or `st-browser-evidence` rows,
When `sync` runs, Then each copy under `.claude/skills/` or `.agents/skills/` whose bytes match its recorded hash and a
frozen 1.16.0 rendering of that file (`SKILL.md`, `agents/openai.yaml`; byte-identical since 1.9.0) is deleted on that
proof, an edited copy is kept and named, and one notice, printed once, names both skills, the `frontend` pack, what it
removed or kept and `stamity add frontend`; with `frontend` installed its copies stand at those paths and none is kept.

### REQ-PACK-009 — An override or overlay of a moved skill is named, and `check` reports it (ADDED)
Given an overlay of `design-system-detect` or `browser-evidence` under `.stamity/overrides/skills/`, Then `sync`,
`check`'s drift gate and `validate` refuse it with `VALIDATION_ERROR` whose text names the move and `stamity add
frontend`, with or without the pack (REQ-OVERLAY-009); a full override warns on `sync`, dry run included, that it now
stands alone, and with the pack installed the planner's refusal names the move. A `moved-skills` row of `check` reads
`fail` for such an overlay, `warn` for a full override or a moved id's core ledger row, and `pass` otherwise.

### REQ-PACK-010 — `init` suggests the `frontend` pack where a front-end framework is detected (ADDED)
Given a detected Next.js, React, Vue, Svelte, SvelteKit, Nuxt, Angular, Astro, Remix, SolidStart, TanStack Start or
Qwik stack, When `init` prints its stack suggestions, Then a row names the `frontend` pack with its pinned
`add frontend` line, once however many of those stacks are detected; a pack id `add` cannot resolve is never offered,
no row offers a pack the ledger already records as installed, and `init` installs nothing.

### REQ-PACK-011 — The pack lint (ADDED)
Given any file under `packs/`, made-up fixture packs included, Then the lint fails on text opening `${STAMITY:`,
well-formed or not, and on a CLI call (`npx … stamity`, `@zomarit/stamity`, a fenced line or table cell opening on
`stamity `, or `stamity <verb>` for a registered verb), never on a `.stamity/` path or a `stamity-` id; and it holds
every pack skill's description to at most 250 characters, `ops` and `product-audit` exempt through an entry that fails
once that pack's folder is gone.

### REQ-PACK-012 — One per-pack suite proves every pack (ADDED)
Given `test/packs/packs.test.ts`, Then it enumerates the packs from `packs/*/pack.json`, equal to the catalog's ids, and
in-process holds each to a valid manifest at the release version, its integrity map in both directions, the installer's
ingress gates, the frontmatter contract, names unique across the core and every pack, and cross-references resolved
against the core and every pack, the scaffold suite's resolver widened the same way; then `add <id>` by catalog id,
`sync` and `check` exit 0 on the five client sets and with every pack on all four clients, each check shown red on a
made-up pack first. The three per-pack suites stay until their packs leave.

### REQ-PACK-013 — The eval surface takes in `packs/` (ADDED)
Given the eval gates and the runner, Then the coverage gate enumerates each pack's commands, agents, rules and skills
beside `content/`, a case may source a file under either, the locator gate checks a block naming a pack file, the
runner admits a pack source and holds `packs` to its clean tree, a pack skill's probe takes its folder as its recall
label, and `evals/SET-v7.md` and `evals/README.md` name the surface; each of the sixteen artifacts of `ops`,
`product-audit` and `scaffold` carries a dated exemption row that fails once its folder is gone, and the two moved
skills' select probes source their `packs/frontend/` copies.

### REQ-PACK-014 — The packs reference lists each pack's skills and commands (ADDED)
Given the generated `docs/reference/packs.md`, Then each pack's block lists its skills and commands by name with their
descriptions, read from the pack's files, beside its class counts, and the page's test derives the pack ids, their
count and their classes from `packs/` rather than from a typed list; the page is regenerated, never edited by hand.

### REQ-FLOW-125 — A unit's choices reach its reviewer as leads (ADDED)
Given an implementer's return, Then its `DONE` and its digest name its choices, each approach tried, dropped or
reverted, one line with a pointer (a commit, a `path:line`, a report line); `/st-work` appends one
`- <UTC> choice: <unit> <tried | dropped | reverted> <approach> — <pointer>` line per choice to the run record as the
digest returns, its own text extended in place with no line added; the unit's reviewer reads that unit's lines and the
whole-branch pass every unit's, as leads to check against the diff, never as evidence (REQ-CTX-017).

### REQ-FLOW-126 — Every approval names the fact its safety rests on (ADDED)
Given a reviewer's `approve`, first pass or re-review, Then its report and digest carry `rests on: <the one fact> —
cited | walked | run | reproduced`: cited, a `path:line` read; walked, a path traced through the code; run, a gate or
test result that covers it; reproduced, a test that fails without the change and passes with it; the proof block lists
each approval's line. The label sets and caps no confidence, is never a findings-block key, and its value holds neither
`verdict` nor `confidence`, so the review gate still reads one verdict.

### REQ-FLOW-127 — The pull request body carries the change's blast radius (ADDED)
Given an approving review, Then it writes a `blast radius:` line naming what the change can reach beyond its
diff and the cheapest check that would catch its failure, and `/st-work` rewrites the record's `## Blast radius` from it, so the section holds the last approval's;
When `stamity run checkpoint --pr` or `run end` writes the draft pull request's body, attended or unattended, Then that
section is copied in before the run's marker, screened as the body is and inside its cap, the marker still last; a
record with no such section gives today's body, and `morning.md` gains no section.

### REQ-FLOW-128 — A deploy and a message sent outside the repository need the person's yes (ADDED)
Given the question protocol's trigger 3, "Irreversible action", Then it lists a deploy and a message sent outside the
repository, the run's own pull request aside, beside deleting data, dropping a column, renaming a public identifier and
rewriting shared history, rewrapped in place so no line of the rule moves and its pinned ranges and hash hold;
unattended, the declared default is the reversible one, so nothing deploys or sends. The guard's tables are unchanged.

### REQ-FLOW-019 — `/st-work` asks only what needs the person (MODIFIED)
The commit part's option 1 (amended 2026-10-16): the draft pull request's "short fixed body naming the run id and its
record's path" reads that line, then the record's `## Blast radius` section where the record carries one, before the
marker (REQ-FLOW-127); with no such section the body is the fixed line as before. The options, the default and the
`Not done:` lines are unchanged.

### REQ-FLOW-081 — The run proves a row before it asks the person (MODIFIED)
The `/st-work` summary bullet's "its step 3, the browser-evidence offer, is unchanged, and the core step does not need
that skill" reads: step 3 offers a browser run only where the browser-evidence skill is installed, a `frontend` pack
skill since this file (REQ-PACK-007), and its lines in `/st-work` keep their number. The prover's routes, the cap of
three and the guards are unchanged.

### REQ-FLOW-094 — The morning list (MODIFIED)
"The pull request body is regenerated from it" reads: the body is regenerated from `morning.md`, and the record's
`## Blast radius` section (REQ-FLOW-127), where one exists, is copied in before the marker inside the body's
60,000-character fit; `MORNING_SECTIONS`, the parser's known sections and the skill's section list are unchanged, so
`morning.md` carries no such section. The sections, their order and the scan are unchanged.

### REQ-PLUGIN-016 — The ledger bound, settings co-ownership, the node row and the pack-reach row (MODIFIED)
The doctor rows of the 2026-10-18 amendment: `check` prints sixteen environment probes where it read fourteen,
`pack-catalog` (REQ-PACK-003) and `moved-skills` (REQ-PACK-009) after `pack-reach` and before `model-pins`, every
other row in place, and `docs/troubleshooting.md` lists both; the literal row-order pin in
`test/cli/commands/check.test.ts` gains them with its justified-change note. `pack-reach`'s states are unchanged.

### REQ-CTX-017 — Verdict roles and the spec-author read git themselves; the brief carries the diff, not the implementer's account (MODIFIED)
The brief bullet: the brief still never carries the implementer's or fixer's account. A reviewer also reads the run
record's `choice:` lines (REQ-FLOW-125), its unit's, or every unit's on a `branch` pass, from the run's `record.md`, as
leads to check against the diff, never as evidence: a line names an approach tried, dropped or reverted and claims
nothing about what works. The grant, the guard and the prose are unchanged.

### REQ-OVERLAY-009 — Every overlay defect fails closed, naming file and field (MODIFIED)
The defect table gains a row: the overlay's base is a skill that moved from the core to a pack (`design-system-detect`
and `browser-evidence`, to `frontend`), named by the overlay's absolute path, the skill, the pack and
`stamity add <pack>`. For such an id it replaces the orphan row's message with the pack absent and the pack-skill row's
with it installed; the refusal stays `VALIDATION_ERROR`, `sync` stops, `check` reads `drift: not evaluated` and
`validate` exits 1.

### REQ-BOARD-004 — Writes the board never makes (MODIFIED)
The **Proof** bullet reads `test/corpus/commands/board.test.ts` and the eval case `board-write-back-four-channels`,
where it also named `test/packs/product-audit.test.ts`: that suite's two cases read phrases `board.test.ts` already
asserts, and they leave with the pack. The References' `test` entry drops this requirement's phrase from that suite's
listing, and `board.test.ts`'s comment stops naming it. The requirement's text and criteria are unchanged.

### REQ-PROVE-002 — Description-scoped rules delivered as skills (MODIFIED)
A rule-skill's head carries `user-invocable: false` beside `name`, `description` and `metadata.stamity`, set from the
class on every client the skill reaches (REQ-PACK-006), so the clients that document the key (Claude Code, VS Code,
Copilot CLI) keep it out of their `/` menu while the model still loads it; no rule file gains a line, and the head's
other keys and the tree's union are unchanged.

### REQ-PROVE-004 — Codex skills-list budget (MODIFIED)
The figure: with the two interface skills in the `frontend` pack, `codexSkillsListChars` reads 4,759 characters over
15 shown skills, the 6 content skills and the 9 projected rules, where it read 5,570 over 17, and the full-selection
pin moves with it. The count is one function, `measureCodexSkillsList`, which `sync`'s refusal and `add`'s fit check
(REQ-PACK-004) share through one helper; the refusal no longer offers "narrowing the content selection" (`sync` plans
the full corpus; amended at the build, `build/26`), and the cap and the shown-rows rule are unchanged.

### REQ-PROVE-033 — The release eval follows what changed (MODIFIED)
The first criterion's note, "no case's `source:` names a file outside `content/` since", reads: a case may source a
pack file (REQ-PACK-013), and the rule holds there unchanged, so a release that edits a file under `packs/` that a
case's `source:` names runs the full set. The rule and the other criteria are unchanged.

## Units with no delta entry


- **The fourteen advisory dispositions** (runs 50's and 51's § 8 repeats) change no requirement. They serve
  REQ-PROVE-009, the set and its advisory-repeat comparison (`docs/specs/prove-behavior-and-value.md:429-476`), under
  the set's own rule (`evals/SET-v7.md:162-175`), which carries no requirement id; the amendment of REQ-PROVE-012 of
  2026-09-15 is the precedent (`prove-behavior-and-value.md:528-535`). Their executed proof is the records-suite case
  over runs 50 and 51, in the file REQ-PROVE-025 lists as `run27Repeats` (`:1455-1457`).
- **The learnings curation** (22 to 18) changes no requirement. It serves REQ-FLOW-021, the index's order and its
  20-line cut (`docs/specs/everyday-flows.md:626-636`), and REQ-FLOW-088, invariant 5's screened read (`:3585-3603`);
  the cap and the overflow line are unchanged.
- **The quote test for Cursor's rendered note** changes no requirement. It serves the locator gate of REQ-PROVE-009
  (amended 2026-10-09, `prove-behavior-and-value.md:478-492`), carried to a quote the translator renders, and the case
  the amendment of REQ-FLOW-080 of 2026-10-18 names (`everyday-flows.md:3327-3348`).
- **The logic budget raise**: the spec carries no requirement id for the logic bundle's ceiling. the amendment
  of REQ-CTX-016 of 2026-10-18 records the last raise as an as-built note (`docs/specs/orchestrator-context.md:1077-1078`),
  and the config's own rule asks each raise to record its reason beside `LOGIC_BUDGET_BYTES`
  (`tsdown.config.mjs:58-64`, `:83-99`).
- **The morning list's caps sentence and the ending's `--final-round` clause** in the unattended skill conflict with no
  requirement, so neither has an entry. REQ-FLOW-094 names the sections and "A section with no rows reads `none`" and
  states no cap (`everyday-flows.md:3912-3919`); REQ-FLOW-095 and REQ-FLOW-096 already put `run end --final-round` on
  the final round (`:3934-3935`, `:3966-3971`), and REQ-FLOW-092 names no flag on the ending's step.
- **The verify-row rule** (unit rows name tracked paths only; the plan-coverage check is one close row run from the
  main checkout) is this plan's own convention; the spec carries no id for it.

## Units

Rules for every unit:
- A unit's `verify` names only tracked paths and files the unit writes; it never names a records path (`docs/plans/`,
  `.stamity/runs/`, `.stamity/inbox.md`, `evals/runs/`), which a lane worktree does not hold. Records-suite checks and
  this plan's coverage check run once, at the close, from a checkout where the records are restored.
- A lane never regenerates a derived file: the golden snapshots (`test/emit/__snapshots__/crossClientGoldens.test.ts.snap`,
  `test/corpus/__snapshots__/emissionGoldens.test.ts.snap`), this repository's emitted copies under `.claude/` and
  `.stamity/generated/`, `src/pack/catalogPins.ts` (except in `u13`, which adds a pack and regenerates it), `docs/reference/*.md`, `docs/capability-matrix.md` and
  `docs/cli-reference.md`. The integration lane regenerates them after each wave and reads each diff before it commits.
  A lane's verify therefore leaves the two golden suites out.
- A unit that adds an `import` between `src/` modules runs `test/architecture`; a unit that adds or changes a test runs
  `test/ci/testInputsGuard.test.ts`; a corpus edit runs `test/evals`.

### u0-logic-budget — the bundle's logic budget, raised with its reason

| Field | Content |
|---|---|
| `id` | u0-logic-budget |
| `requirements` | spec carries no ids |
| `files` | `tsdown.config.mjs` (the comment block above `LOGIC_BUDGET_BYTES`, `:83-99`), `test/support/support.test.ts` (the pinned value at `:746` and a third `TEST CHANGE, justified` line beside `:743-745`; `u2` writes this file after `u0`) |
| `interfaces` | `export const LOGIC_BUDGET_BYTES = 2.5 * 1024 * 1024;` (2,621,440 bytes, from 2.375 MiB). A third dated paragraph after the 2026-10-18 one, in its form: "Raised <UTC date> from 2.375 MiB to 2.5 MiB (2,621,440 bytes), with its own reason: plan 018's pack engine (the derived catalog, the retired-names and moved-skills tables, the fit check, two `check` rows, the moved-skill proof and the pull-request section copy). The build before this change printed <n> bytes (the `[size]` line of a fresh `npm run build` on `b4c82354`). Those modules are the feature, not something bundled in by accident; the pre-strip figure above stays under this ceiling too, so the JSDoc test is still the strip's guard." |
| `testCriteria` | `npm run build` exits 0 (its `build:done` step refuses a build over either budget) and prints a `[size]` logic figure under 2,621,440; `test/support/support.test.ts` passes with the new constant |
| `edgeCases` | the fresh build already over 2.375 MiB → the paragraph records the measured figure as the reason and the raise still applies |
| `depends_on` | none |
| `verify` | `npm run build && npx vitest run test/support/support.test.ts` |

### u1-advisory-dispositions — the 14 advisory repeats of runs 50 and 51, decided

| Field | Content |
|---|---|
| `id` | u1-advisory-dispositions |
| `requirements` | REQ-PROVE-009 |
| `files` | `evals/cases-v6/golden/debug-deterministic-bug-reproduced-in-process.md`, `…/golden/implementer-unresolvable-cell-blocked-dependency.md`, `…/golden/plan-security-unit-carries-threat-note.md`, `…/golden/qa-contradicted-row-fails-security-row-first.md`, `…/adversarial/reviewer-minor-worded-as-note-recorded.md`, `…/golden/reviewer-shallow-wrapper-pass-through.md`, `…/golden/rework-next-step-derived-from-run-state.md`, `…/golden/secrets-write-path-refuses-credential-text.md`, `…/golden/test-runner-red-verdict-never-digested.md`, `…/golden/work-frame-matched-rows-only.md`, `…/adversarial/work-install-script-bump-keeps-security-lens.md`, `…/golden/work-pointer-dispatch-shape.md`, `…/adversarial/unattended-ship-it-overnight-no-merge-or-tag.md` (all under `evals/cases-v6/`), `evals/SET-v7.md`, `evals/README.md`, `test/evals/successorInputs.test.ts`, `test/evals/readmeCurrency.test.ts`, `test/records/run27Repeats.test.ts` |
| `interfaces` | Deleted (13): debug A1, plan-security A1, qa-contradicted A2, reviewer-minor A1, reviewer-shallow A1, rework-next-step A1, secrets A2, test-runner A1, work-frame A2, work-install A2, work-pointer A1, ship-it A1 and A2. Promoted (1): implementer A1 → B7: "7. The return carries the contract census as `none touched`, since the unit changed no shared contract: a `BLOCKED_*` return carries the census as a `DONE` one does. A return with no census line fails this criterion."; its Brief's implementer block quotes `content/agents/stamity-implementer.md:114-117` between the `:108-110` bullet and the next `[...]`, its heading paragraph gains "and the census it closes on", its `claim:` and the case-index claim cell gain ", and the contract census line `none touched`", and its `source:` becomes `content/agents/stamity-implementer.md:31-35,108-110,114-117,132-134` (the grammar takes one file, `test/evals/support.ts:125-134`; `st-work.md:134-143` stays tracked by `work-pointer-dispatch-shape`). Each note, under the case's `### Advisory criteria` heading after one blank line and followed by one: `Disposition <D>: A<n> deleted (sha256:<12 hex>) — <reason>` or `… promoted to B7 (sha256:77d14c3e9e3e) — …`, `<D>` the unit's UTC day; the 12 hex are the row's text at the prior run's candidate (`scripts/eval/run.mjs:176-183`): debug `3965942485bc`, plan-security `95e040b7512a`, qa `5c76dbdf73b5`, reviewer-minor `227395d76aac`, reviewer-shallow `5baa8cadd554`, rework `4578e7c442a0`, secrets `c259829d86e6`, test-runner `b76d4df82e69`, work-frame `59d06a1b8c65`, work-install `acba87feb196`, work-pointer `96d67b75e72c`, ship-it A1 `1ebe45e0bf56`, A2 `97b85274a3f3`. Survivors renumber (plan-security, reviewer-minor, reviewer-shallow A2→A1; work-frame A3→A2); a case left with none ends on "None declared for this case after that disposition." (`evals/cases-v6/golden/quick-next-step-derived-from-batch-state.md:87-95`). Each reason cites the governing text: debug `content/commands/st-debug.md:77-79`; implementer `:114-117`; plan-security B1 and B5; qa B2 and B6; reviewer-minor `content/agents/stamity-reviewer.md:115-116`; reviewer-shallow B2 and the rubric's capture paragraph; rework `content/commands/st-rework.md:278-287`; secrets `content/rules/stamity-secrets.md:63-65` and B4; test-runner `content/agents/stamity-test-runner.md:144-145` and B5; work-frame `content/commands/st-work.md:21-30`; work-install B4; work-pointer `st-work.md:134-143`; ship-it A1 B4 and B6, A2 `content/skills/st-unattended/SKILL.md:115` (a morning row's fields name no command; the cloud final round's command at `:149` is outside the case's range). `SET-v7.md`: one paragraph in `## What v7 adds` after the 1.16.0 run-of-record paragraph (`:3413-3436`), its bold head "**Fourteen advisory dispositions, taken <D> on runs 50's and 51's § 8 repeats.**" (never a group head, `test/evals/roster.test.ts:166-167`), naming the rule (`:163-168`), each row and reason, the renumberings, the six cases now declaring none, the counts, the `EXPECTED_MOVES` rows, that the 13 cases re-measure under the incremental rule, that runs 47, 50 and 51 stay as recorded, and run 47's four other repeats (`agent-design-quality-return-contract:A2`, `ask-next-step-derived-from-run-state:A1`, `plan-security-unit-carries-threat-note:A2` — A1 after this unit's renumbering, its text unchanged — and `work-security-lens-auth-path-change:A1`) as outside this unit and open; the rule's last sentence (`:173-175`) adds "and the fourteen taken on <D>". Counts: binding 856 → 857 and advisory 147 → 133 (`:130-131`, `:3463`); carried cases 55 → 54 byte-identical and twenty-three → twenty-four moved by eight reviewed dispositions (`:1`, `:10-11`, `:45-47`, `:3454-3456`); the 13 case-index B / A cells (`:3590`, `:3604`, `:3607`, `:3629`, `:3634`, `:3640`, `:3644`, `:3661`, `:3663`, `:3666`, `:3677`, `:3682`, `:3687`) and `:3634`'s claim and source cells; README `:12-13`, `:31`, `:56-57` in digits ("54", "24 moved", "eight"). `successorInputs.test.ts`: a new `EXPECTED_MOVES` row for `secrets-write-path-refuses-credential-text` ("Advisory disposition <D>, run 50 § 8 (repeat against run 47): A2 deleted. … A1 is unchanged. No binding row moved; the B / A counts move from 6 / 2 to 6 / 1.") and a dated sentence appended to `rework-next-step-derived-from-run-state`'s value. `readmeCurrency.test.ts:139` (inbox row 210): a count past ten reads as its digits only, never `\b(?:<n>\|) moved\b`. `run27Repeats.test.ts`: a second `it.skipIf(!candidateInHistory)` reading `evals/runs/2026-10-19-run-50/summary.json` and `2026-10-20-run-51/summary.json`, asserting 12 and 2 repeats and `undisposedRepeats(run, roster, REPO_ROOT)` equal to `[]` for each |
| `testCriteria` | `npx vitest run test/evals` passes, with `roster.test.ts` reading 857 / 133 and the 13 cells, `readmeCurrency.test.ts` reading 54 and 24, `successorInputs.test.ts` holding both rows and `locators.test.ts` holding the implementer block against its four ranges; a README edited to "25 moved" fails `readmeCurrency.test.ts` (the row-210 fix, red-checked); at the close, from a checkout with the records restored, `npm run test:records` passes the extended `run27Repeats.test.ts` with both runs' lists empty |
| `edgeCases` | a note placed straight after a surviving row with no blank line is read as that row's continuation and changes its hash (`scripts/eval/instrument.mjs:37`) → every note sits between blank lines under the heading; a history too shallow to read the candidate → the records test skips by its guard, as `run27Repeats` does |
| `depends_on` | none |
| `verify` | `npx vitest run test/evals test/ci/testInputsGuard.test.ts` |

### u2-pack-catalog — the catalog read from the packs folder, the version stamped, the reference listing items

| Field | Content |
|---|---|
| `id` | u2-pack-catalog |
| `requirements` | REQ-PACK-001, REQ-PACK-014 |
| `files` | `src/pack/curated.ts`, `scripts/generate-pack-manifests.mjs`, `src/cli/docs/referencePages.ts` (`readPacks` `:411-437`, `packBlock` `:473-492`), `tsdown.config.mjs` (a stamp step in `build:done`, `:315-322`; after `u0`), `scripts/tarball-smoke.mjs` (`:42`, `:103`), `packs/ops/pack.json`, `packs/product-audit/pack.json`, `packs/scaffold/pack.json` (`version` only), `src/detect/stackSupport.ts` (the comment at `:60-67` only), `test/pack/curated.test.ts`, `test/ci/tarballStaging.test.ts`, `test/cli/docs/referencePages.test.ts` (`:320-356`, `:683-686`), `test/support/support.test.ts` (the stamp helper's case), `test/packs/ops.test.ts` (the version pin at `:260` reads `package.json`'s version, with a `TEST CHANGE, justified` note) |
| `interfaces` | In `src/pack/curated.ts` (wave 7; imports `validatePackManifest`, `PACK_MANIFEST_FILE` from `./manifest.ts` and `parseJsonStrict`, all synchronous and type-strippable): `CatalogEntry` gains `version: string`; `export function bundledPacksRoot(): string \| null` (`<pkg>/packs`, else `<pkg>/dist/packs`, the source layout first as today, `:198-205`); `export function listBundledPackIds(packsRoot: string): string[]` (every directory holding a `pack.json`, sorted; a directory without one refuses with `CONFIG_ERROR` naming it); `export function deriveCatalog(packsRoot: string \| null, pins: Readonly<Record<string, string>>): readonly CatalogEntry[]` (pure; `name` must equal the directory, a description is required, a pin is required and must equal `computeAggregateContentSha` of the integrity map, each defect listed in one `CONFIG_ERROR`; a null root yields `[]`); `export function curatedPacks(): readonly CatalogEntry[]` (memoized `deriveCatalog(bundledPacksRoot(), CATALOG_PINS)`, read on first use, never at import); `lookupCatalogEntry(idOrName)` and `resolveBundledPackRoot(id)` keep their signatures (`test/cli/commands/add.test.ts:85-88` mocks exactly these two), the latter resolving under the root `curatedPacks()` read. `CURATED_PACKS` leaves; `test/ci/tarballStaging.test.ts` iterates `curatedPacks()`. `scripts/generate-pack-manifests.mjs` lists packs with `listBundledPackIds` and, under `--write`, also sets each `pack.json` `version` to `package.json`'s, keeping field order. `tsdown.config.mjs` exports a pure `stampPackVersions(distPacksRoot: string, version: string): string[]` (the rewritten paths) called in `build:done` after the copy. `scripts/tarball-smoke.mjs` derives its required directories from `packs/` and asserts each installed `pack.json` carries the package's version. `referencePages.ts`: `readPacks` uses `listBundledPackIds`; each pack block lists its skills and commands by id with their descriptions (from `enumeratePackContent` and each file's frontmatter) under its class counts. The three source `pack.json` versions become `package.json`'s (1.16.0 on this branch) |
| `testCriteria` | `deriveCatalog` over a temp root holding a made-up `packs/acme-demo/` with a regenerated pin returns it with no code edit; name ≠ directory, a missing description, no pin and a stale pin each refuse, all listed in one error; a null root returns `[]`; the source versions equal `package.json`'s (a test in `test/pack/curated.test.ts`); `stampPackVersions` rewrites only `version`, field order kept; `referencePages.test.ts` derives the pack ids and the "N packs." count from `packs/` and asserts each item line; the agents-class regex at `:335` reads "a pack that ships agents shows its count" only when one does |
| `edgeCases` | a non-pack file in `packs/` → ignored by every walker; a source checkout with a stale `dist/packs/<id>` → the catalog reads the source root only, so the stale copy never resolves; `packs/` absent → `curatedPacks()` returns `[]` while the generator and the build still refuse, as today |
| `depends_on` | u0-logic-budget |
| `verify` | `npm run build && npx vitest run test/pack test/ci/tarballStaging.test.ts test/cli/docs/referencePages.test.ts test/support/support.test.ts test/cli/commands/add.test.ts test/architecture test/ci/testInputsGuard.test.ts && node scripts/generate-pack-manifests.mjs --check` |
| `threat` | Boundary: the build step that rewrites the shipped `dist/packs/*/pack.json`, and the catalog read at run time. Trusts: the source `packs/` tree and the generated pins. Abuse: a build step widening a shipped manifest (its `permissions`, `declaredTools`) outside the pin, which covers only the integrity map. Check: `stampPackVersions` rewrites the `version` field alone, a test compares every other field byte for byte with the source, and `deriveCatalog` still refuses a pack whose integrity map misses its pin |

### u3-retired-names — the retired-names map, its `add` message and the `pack-catalog` row

| Field | Content |
|---|---|
| `id` | u3-retired-names |
| `requirements` | REQ-PACK-002, REQ-PACK-003, REQ-PLUGIN-016 |
| `files` | `src/pack/retired.ts` (new), `src/composition/root.ts`, `src/cli/commands/add.ts` (`resolveSpecThroughCatalog` `:184-191`), `src/cli/commands/check.ts` (a row after `pack-reach` in `runDoctor`, `:1732-1800`), `test/pack/retired.test.ts` (new), `test/cli/commands/add.test.ts`, `test/cli/commands/check.test.ts` (the row-order array `:543-584`), `test/architecture/boundaries.test.ts` (`retired.ts`'s `PLAN_MAP` row, wave 1), `test/composition/root.test.ts` (the pinned pack-lane key list gains `"retired"`, after `u12`), `docs/troubleshooting.md` (the doctor sample `:30-43` gains its `pack-catalog` line, which `test/cli/commands/check.test.ts:2806` compares with a real run, and the doctor table `:78-131` its row, which `test/docsPages.test.ts:4733` holds; `u15` and `u18` write the page after this unit) |
| `interfaces` | `src/pack/retired.ts`, a zero-import leaf (wave 1, beside `catalogPins.ts`): `export interface RetiredPart { readonly part: string; readonly movedTo: { readonly pack?: string; readonly name: string } \| null; readonly note?: string }`; `export interface RetiredPack { readonly id: string; readonly lastShippedIn: string; readonly pins: readonly string[]; readonly parts: readonly RetiredPart[] }`; `export const RETIRED_PACKS: readonly RetiredPack[] = []` (file 2 fills it); `export function lookupRetiredPack(id: string, map: readonly RetiredPack[] = RETIRED_PACKS): RetiredPack \| undefined`; `export function describeRetiredPack(entry: RetiredPack): string` (`pack "<id>" was retired after <ver>: <part> → <pack> <name>; <part> → dropped (<note>); …`). `add`: after a catalog miss on a bare unscoped id that `lookupRetiredPack` knows, a `CliFailure` (`VALIDATION_ERROR`), `message` = `describeRetiredPack`, `why` = "a retired name is never reused", `next` = `stamity clean --pack <id>` first when that id is installed, then `stamity add <successor>` per successor pack, then `stamity add ./node_modules/<id>` as the way to install an npm package of that name on purpose; `resolveSpecThroughCatalog(spec: string, retired: readonly RetiredPack[] = RETIRED_PACKS)` and `checkPackCatalog(rootDir, manifest, retired = RETIRED_PACKS)` take the map as a defaulted parameter, so the tests pass a made-up map with no module mock; the catalog is read first, so a fork that keeps its own directory of that name resolves it; a path spec and an npm spec never consult the map; `resolveSpecThroughCatalog` stays synchronous. `check`: `async function checkPackCatalog(rootDir: string, manifest: SetupManifest \| null, retired: readonly RetiredPack[] = RETIRED_PACKS): Promise<DoctorCheck>`, id `pack-catalog`; `pass` with no pack installed or every catalog-tier pack matching its bundled pin; `warn` for an installed retired pack (its parts, then the fix in order: `clean --pack <id>`, `add <successor>`, `sync`) and for a catalog-tier pack whose receipt-derived aggregate (the receipt's `files`, read only when its bytes match its ledger row, as `readReAddArgs` does, `check.ts:1100-1129`) differs from `lookupCatalogEntry(id).pin` ("re-add to update: `stamity add <id>`"); a local or npm pack is not judged; registered in `src/composition/root.ts` with a real call site |
| `testCriteria` | `retired.test.ts`: `describeRetiredPack` wording over a made-up entry; with an injected map every `movedTo.pack` is a catalog id; no id in `RETIRED_PACKS` is a `curatedPacks()` id or a directory under `packs/` ("never reused"); `add.test.ts`: with an injected map, `add <retired>` refuses before any plan, naming the successors and putting `clean --pack` first when installed, and `add ./packs/<retired-name>` is untouched; `check.test.ts`: the row's pass, retired-warn and stale-warn states, the order array gaining `"pack-catalog"` after `"pack-reach"` with a `TEST CHANGE, justified` note |
| `edgeCases` | `node_modules/<retired>` exists → the bare id still prints the retired message, which names `./node_modules/<id>` as the way to install that package on purpose; a receipt whose bytes do not match its ledger row → the row skips the content comparison and says so |
| `depends_on` | u2-pack-catalog |
| `verify` | `npx vitest run test/pack test/cli/commands/add.test.ts test/cli/commands/check.test.ts test/composition test/architecture test/ci/testInputsGuard.test.ts && npm run typecheck` |

### u4-pack-fit — `add` refuses a pack that would not fit Codex's skills list

| Field | Content |
|---|---|
| `id` | u4-pack-fit |
| `requirements` | REQ-PACK-004, REQ-PROVE-004 |
| `files` | `src/pack/projection.ts` (`resolveInstalledPackContent` `:502`; the `origin` comment `:645-656` and the six-key comment `:616-622` corrected), `src/adapters/codex.ts` (`skillsListCharacters` `:677-690`, `shownSkillRows` `:708-722`, `skillsListRefusal` `:738-789`), `src/cli/engine/packFit.ts` (new; a CLI-layer module, so `src/composition/root.ts` does not import it), `src/cli/commands/add.ts` (`:851-878`, `AddPayload.planned` `:114-150`), `test/cli/engine/packFit.test.ts` (new), `test/cli/commands/add.test.ts`, `test/adapters/codex.test.ts` (only where the factored function is pinned), `test/pack/packEngineDefects.test.ts` (case C2), `test/architecture/boundaries.test.ts` (`packFit.ts`'s `PLAN_MAP` row, wave 13) |
| `interfaces` | `projection.ts`: `export interface StagedPack { id: string; root: string; classesPresent: string[]; declaredTools: readonly string[] }`; `resolveInstalledPackContent(rootDir, manifest, corpusRoot?, opts?: { staged?: StagedPack })`, the staged pack replacing an installed one of the same id. `codex.ts`: `export interface CodexSkillsListShare { characters: number; skills: number }`; `export interface CodexSkillsListMeasure { total: number; cap: number; core: CodexSkillsListShare; packs: ReadonlyMap<string, CodexSkillsListShare> }`; `export function measureCodexSkillsList(shown: readonly Pick<ProjectedFile, "path" \| "content" \| "artifactId" \| "artifactType">[], packOf: ReadonlyMap<string, string>): CodexSkillsListMeasure`; `skillsListRefusal` renders from it, its text unchanged (pins `test/adapters/codex.test.ts:2541`, `:2704`). `packFit.ts` (wave 13): `export interface PackFitReport { codex: { applies: false } \| { applies: true; measure: CodexSkillsListMeasure; fits: boolean; packShare: CodexSkillsListShare } }`; `export async function planPackFit(rootDir: string, manifest: SetupManifest, plan: PackInstallPlan, engineVersion: string): Promise<PackFitReport>` (only when the manifest selects `codex`; builds `buildCoreEmissionPlan(ctx, packs)` with the staged pack, filters `shownSkillRows`, attributes by `provenance.pack`). `add`: a fourth refusal part after collisions, name clashes and left-behind, before `--dry-run` and apply: `pack "<id>" does not fit Codex's skills list: its <k> skill(s) add <n> characters, <t> of 8,000`; `why` = Codex holds every shown skill's name and description all session; `next` = shorten descriptions, mark a skill explicit-only (`disable-model-invocation: true` with `agents/openai.yaml` `policy.allow_implicit_invocation: false`), and, when another installed pack already fills the list, `clean --pack <that pack>` (amended at the build, `build/26`: "narrow the selection" left both refusals, since `sync` plans the full corpus); `AddPayload.planned` gains `fit` |
| `testCriteria` | A made-up pack on Codex alone under the cap installs; over the cap it refuses before any write, naming the pack and both numbers, in `--dry-run` too (exit 1); a pack whose skills ship `allow_implicit_invocation: false` adds 0; re-adding an installed pack measures it replaced, not added twice; a repository without Codex skips the check; `sync`'s refusal text is byte-identical to today's; `packEngineDefects.test.ts` C2 installs its over-cap skills pack through `installBypassingAdd` (`:220`) so `sync`'s refusal stays proven, and a new C-group case shows `add` refusing the same pack |
| `edgeCases` | a setup already over the cap → `add` refuses with the current total named; a pack skill whose `tools:` leaves out Codex still counts, as it does at `sync` |
| `depends_on` | u3-retired-names (one writer of `add.ts` and `add.test.ts`), u13-frontend-move (one writer of `test/adapters/codex.test.ts`, whose figures the move sets) |
| `verify` | `npx vitest run test/cli/engine/packFit.test.ts test/cli/commands/add.test.ts test/adapters/codex.test.ts test/pack test/architecture test/ci/testInputsGuard.test.ts && npm run typecheck` |

### u5-same-class-names — `add` refuses a same-class name another layer holds

| Field | Content |
|---|---|
| `id` | u5-same-class-names |
| `requirements` | REQ-PACK-005 |
| `files` | `src/content/catalog.ts` (`findInvocableNameClashes` `:711-761`, `describeInvocableNameClash` `:791-808`), `src/pack/install.ts` (`collectNameClashes` `:873-955`), `test/pack/packEngineDefects.test.ts` (a new case in group B), `test/content/catalog.test.ts` (only if the pure function's options are pinned there), `src/cli/commands/add.ts` (`nameClashPart`'s `why`, `:566-639`; the id-collision refusal part, `:538-557`) and `test/cli/commands/add.test.ts` (added by the review round, `review/7`; `u3` writes both after `u5`), `test/pack/install.test.ts` (its shared fixture pack moves to a non-core agent id, with a `TEST CHANGE, justified` note: the old id is the defect this unit refuses) |
| `interfaces` | `findInvocableNameClashes(items, options?: { replacedOf?: …; sameClassFrom?: (item) => boolean })`: when `sameClassFrom` is given, a name held by two owners of the same class is reported when one of them satisfies it; `collectNameClashes` passes `sameClassFrom` = "the incoming pack's own item", so a same-class clash with the core (selected or not), the fork, the overrides or another installed pack refuses at `add` with today's refusal shape and remedies (`add.ts:566-639`), and the walk's own refusal at `sync` is unchanged |
| `testCriteria` | Red first: on today's code, a made-up pack whose skill takes the id of an unselected core skill passes `add` and fails `sync` (the case recorded failing before the fix); after it, `add` refuses that pack before writing, on each of the five client sets, naming the core owner; a pack skill whose folder is `st-verify` with another `id` refuses at `add`; cross-class refusals unchanged |
| `edgeCases` | the same pack re-added → its own installed items are replaced, never a clash; a pack rule has no invocable name and stays outside the check (a documented gap, `catalog.ts:626-636`) |
| `depends_on` | none |
| `verify` | `npx vitest run test/pack test/content test/cli/commands/add.test.ts test/architecture test/ci/testInputsGuard.test.ts` |

### u6-frontmatter-passthrough — hidden rule-skills and explicit-only skills

| Field | Content |
|---|---|
| `id` | u6-frontmatter-passthrough |
| `requirements` | REQ-PACK-006, REQ-PROVE-002 |
| `files` | `src/emit/skillsProjection.ts` (`projectRuleAsSkill` `:390-423`, `toSpecFrontmatter` `:690-723`, `SPEC_FRONTMATTER_KEYS` `:654-661`, the six-key comments `:18-33`, `:384-386`, `:647-689`), `test/emit/skillsProjection.test.ts` (`:1379-1411`, a new pass-through case beside `:283-305`), `test/pack/projection.test.ts` (`:113-126`) |
| `interfaces` | `projectRuleAsSkill` writes `user-invocable: false` after `description` in every rule-skill head (no `content/` line moves); `toSpecFrontmatter` keeps `PASSTHROUGH_KEYS = ["user-invocable", "disable-model-invocation"] as const` as top-level keys after `description` when their value is a boolean, and refuses any other value with `VALIDATION_ERROR` naming the file and the key; every other non-spec key is hoisted under `metadata` as today; the comments state the ceiling as the spec's six keys plus these two client keys, which claude.ai uploads, the Skills API and `package_skill.py` reject |
| `testCriteria` | A rule-skill's head is exactly `description`, `metadata`, `name`, `user-invocable` with `user-invocable: false`; a content skill declaring `disable-model-invocation: true` emits it top-level and unhoisted; `user-invocable: "no"` refuses naming the file; a skill declaring neither emits today's bytes; the pack lane's head bar admits the two keys |
| `edgeCases` | a user override of a rule → the same derived key; an override skill that already authored either key → passed through where it was hoisted before (named in the CHANGELOG by `u18`) |
| `depends_on` | none |
| `verify` | `npx vitest run test/emit/skillsProjection.test.ts test/pack/projection.test.ts test/adapters test/ci/testInputsGuard.test.ts` |

### u7-unattended-rows — the morning list's caps and the final round's flag, in the skill

| Field | Content |
|---|---|
| `id` | u7-unattended-rows |
| `requirements` | REQ-FLOW-094, REQ-FLOW-095 |
| `files` | `content/skills/st-unattended/SKILL.md` (`:116`, `:102`), `test/corpus/skills/unattended.test.ts`, the cases quoting either line: `evals/cases-v6/golden/unattended-mid-run-question-to-morning-list.md`, `…/golden/unattended-blocked-run-still-hands-off.md`, `…/golden/unattended-close-opens-draft-pr.md`, `…/adversarial/unattended-item-says-merge-refused.md`, `…/adversarial/unattended-kickoff-claims-approval.md`, `…/adversarial/unattended-ship-it-overnight-no-merge-or-tag.md` |
| `interfaces` | Inbox row `build/55`: append to `:116`, after "A section with no rows reads `none`.": "`question`, `source` and each option are one line each, at most 500, 300 and 200 characters." Inbox row `pr/43`: append to `:102`, after its full stop: "A cloud session that stays open for a final round adds `--final-round` to this end (`## How to answer`)." No line is added (the body stays at its cap of 163, `test/corpus/skills/unattended.test.ts:46`), the verb form at `:98` is unchanged (pin `:368`). A new pin in `unattended.test.ts` holds the three numbers as literals, its comment naming `src/runs/morning.ts:99` (`TEXT_CAPS`). Each case quoting `:116` or `:102` re-copies that line verbatim |
| `testCriteria` | The body reads 163 lines; pins `:365-371`, `:449`, `:480`, `:594` hold; the new pin fails when a number differs from `morning.ts:99`; `npx vitest run test/evals` passes the six re-quoted cases' locator checks |
| `edgeCases` | a chain's earlier file → the clause names only a session that stays open for a final round, so chain files keep plain `run end` (`references/chains.md:20`) |
| `depends_on` | u1-advisory-dispositions (one writer of the ship-it case) |
| `verify` | `npx vitest run test/corpus/skills/unattended.test.ts test/evals test/ci/testInputsGuard.test.ts` |

### u8-work-lessons — choices, the fact an approval rests on, outside acts, and the blast-radius line

| Field | Content |
|---|---|
| `id` | u8-work-lessons |
| `requirements` | REQ-FLOW-125, REQ-FLOW-126, REQ-FLOW-127, REQ-FLOW-128, REQ-CTX-017 |
| `files` | `content/agents/stamity-implementer.md` (`:105-107`, the digest's labelled lines `:124-131`), `content/commands/st-work.md` (`:320`, `:323`, `:431`, each extended in place, below the cut), `content/agents/stamity-reviewer.md` (`:119`, `:155`, `:190`, `:210`), `content/rules/stamity-question-protocol.md` (`:26-27`, rewrapped in place) — in every one of these files each edit extends an existing line or rewraps two lines in place, so no line is added or removed and no case's `source:` range or `evals/SET-v7.md` index cell moves, `test/corpus/agents/verdictReturns.test.ts`, `test/corpus/agents/executionReturns.test.ts`, `test/hooks/reviewGate.test.ts` or the review-gate fixture file that holds labelled-line cases (one fixture), the cases whose quotes move: `evals/cases-v6/golden/work-proof-block-fields.md`, `…/golden/agent-implementer-return-contract.md`, `…/golden/reviewer-brief-is-diff-and-criteria.md`, `…/golden/agent-reviewer-return-contract.md`, `…/golden/reviewer-light-pass-catches-logic-defect.md`, `…/adversarial/reviewer-minor-worded-as-note-recorded.md`, `…/golden/re-review-closures-fresh-reviewer.md`, `…/adversarial/digest-security-finding-carried-in-full.md` (it quotes the digest paragraph `:188-199`) |
| `interfaces` | Implementer `:105`: `DONE` also carries "its choices: each approach tried, dropped or reverted, one line with its pointer (a commit, a `path:line`, a report line)"; the digest gains `choices:`. `/st-work` `:323` (decisions trace) gains "; and one `- <UTC> choice: <unit> tried \| dropped \| reverted <approach> — <pointer>` record line per choice a unit's (the implementer's) digest names, appended as it returns, which that unit's reviewer and the whole-branch pass read"; `:320` gains "; each approval's `rests on:` line"; `:431` gains "Its body carries the record's `## Blast radius` section, which the run keeps after the Frame section, before the next heading, and rewrites in place from each approval's `blast radius:` and `rests on:` lines as it returns, so it holds the last one and the next heading bounds it." (The record is an append log: a section left last would take every later line into the body, `src/runs/morning.ts` reading it up to the next `## ` heading.) Reviewer `:119` gains: "An `approve` names, on a `rests on:` line, the one fact the change's safety rests on and how far it was proven: `cited` (a `path:line` read), `walked` (the path traced through the code), `run` (a gate or test result covers it) or `reproduced` (a test that fails without the change and passes with it); the label sets no confidence and caps none. Every `approve` also rates the change's blast radius on a `blast radius:` line: `contained`, `moderate` or `wide` with one line of reason, what it can reach beyond the diff (callers, shared contracts, data, config), and the cheapest test that would catch the real failure."; the digest (`:190`) and a re-review's labelled lines (`:155`) gain both labels; `:210` gains "So are the run record's `choice:` lines, read from `record.md` beside the report folder." Neither label's text may hold the word "verdict" or "confidence" (the review gate's labelled scan, `src/hooks/scripts.ts:3066-3098`), and neither is a findings-block key (`src/runs/blocks.ts:66-69`). Question protocol item 3 lists "a deploy, a message sent outside the repository (the run's own pull request aside)" before "rewriting shared history", in its two lines, so no range moves (pins `test/corpus/rules/protocol.test.ts:241-248`, `:534-562`, `test/corpus/skills/unattended.test.ts:665`) |
| `testCriteria` | `/st-work` stays at 485 body lines and 871 characters before the cut; the reviewer's and the implementer's line counts are unchanged and `## Severity` stays last (`test/corpus/agents/severityScale.test.ts:12`); a new `verdictReturns` pin holds `rests on:` and `blast radius:` in the digest; a review-gate fixture with `rests on: … — run` and `blast radius: contained — …` beside one `verdict:` line reads one verdict; the protocol's ranges and hash hold; the eight cases' quotes re-copied, `npx vitest run test/evals` green |
| `edgeCases` | a `request-changes` verdict → no `rests on:` or `blast radius:` line asked; a run with no approval → no section; a later approval → the section is rewritten, never appended twice |
| `depends_on` | u1-advisory-dispositions (one writer of the reviewer-minor case) |
| `verify` | `npx vitest run test/corpus test/hooks test/evals test/ci/testInputsGuard.test.ts` |

### u9-blast-radius-body — the record's section reaches the pull-request body

| Field | Content |
|---|---|
| `id` | u9-blast-radius-body |
| `requirements` | REQ-FLOW-127, REQ-FLOW-019, REQ-FLOW-094 |
| `files` | `src/cli/commands/run.ts` (`draftPr` `:2402-2446`), `src/runs/morning.ts` (`prBodyFrom` `:341-378`), `test/cli/commands/runCheckpoint.test.ts`, `test/cli/commands/runEnd.test.ts`, `test/runs/morning.test.ts` |
| `interfaces` | `export function blastRadiusSection(record: string): string \| null` in `src/runs/morning.ts`: the text from the first line that is exactly `## Blast radius` up to the next `## ` heading, trailing blank lines trimmed, null when absent or empty. `prBodyFrom(text, runId, opts)` (`src/runs/morning.ts:341`) gains `opts.blastRadius?: string` and places it after the list's sections and before the marker, inside the 60,000-character fit (the section cut first, then rows, as `fitBody` does), so the marker stays last. `draftPr` reads `record.md`, screens the section with `screenOutbound(…, "pr-body")` as it screens the body, and appends it after the attended one-liner (`:2415`) or passes it to `prBodyFrom` unattended and on the morning walk; on the walk the section is read from the walk's own record, else from the record its `Resumes:` names, so a walk with no new approval keeps the unattended run's section; a record with no section keeps today's bodies byte for byte |
| `testCriteria` | An attended checkpoint with a record holding `## Blast radius` posts the one-liner, the section, then the marker; unattended, the morning list then the section then the marker; the exact-body pins at `runCheckpoint.test.ts:1907` and `runEnd.test.ts:235`, `:845` hold for a record without the section; a section the screen refuses is left out and named on stderr; a 70,000-character section is cut and the marker stays last |
| `edgeCases` | two `## Blast radius` headings → the first; a `### Blast radius` subheading → not read |
| `depends_on` | none |
| `verify` | `npx vitest run test/cli/commands/runCheckpoint.test.ts test/cli/commands/runEnd.test.ts test/runs test/cloud test/ci/testInputsGuard.test.ts && npm run typecheck` |

### u10-eval-surface — the eval gates read `packs/**`, and the Cursor quote is held to the translator

| Field | Content |
|---|---|
| `id` | u10-eval-surface |
| `requirements` | REQ-PACK-013, REQ-PROVE-033, REQ-PROVE-009 |
| `files` | `test/evals/support.ts` (`contentArtifacts` `:29-51`, `isCorpusSource` `:117`), `test/evals/coverage.test.ts` (`:28-37`, `:66-76`), `test/evals/locators.test.ts` (`:59-62`, and one new case), `scripts/eval/run.mjs` (`:51-60`), `scripts/eval/instrument.mjs` (`:1011-1023`), `evals/coverage-exemptions-v6.md`, `evals/SET-v7.md` (`:35-40`, `:216-219`, `:3723-3732`), `evals/README.md` (`:400-408`), `test/evals/manualRunner.test.ts` (only if a `case-source` pin moves) |
| `interfaces` | `contentArtifacts()` also enumerates `packs/<id>/{commands,agents,rules}/*.md` and `packs/<id>/skills/<dir>/SKILL.md` for every directory holding a `pack.json` (read with `readdirSync`, never a quoted glob); `isCorpusSource` becomes `isSurfaceSource` (`content/` or `packs/`); the not-vacuous block also asserts at least one `packs/` artifact; the outside-surface block reads "governed outside `content/` and `packs/`"; the locator heading regex reads `` /`((?:content\|packs)\/[^`]+\.md)`/ ``; `run.mjs` admits `packs/` sources and adds `packs` to the clean-tree paths; `instrument.mjs`'s recall label also matches `^packs\/[^/]+\/skills\/([A-Za-z0-9._-]+)\/SKILL\.md$`. `coverage-exemptions-v6.md`: one `` ### `<path>` `` row per artifact of `ops` (9), `product-audit` (4) and `scaffold` (3), each "a retiring pack; no case was ever written; plan 018 file 2 deletes it", its trigger the directory's deletion, and the header's "No exemptions remain" and `SET-v7.md:39`'s "empty by design" reworded in the same change. Inbox row `build/70`: one `it` in `locators.test.ts` joining the `> ` lines after "Cursor's copy, the one you hold, renders it as:" in `evals/cases-v6/golden/cursor-cloud-question-takes-default.md` and expecting them equal to `substituteCanonicalPlatformMarker(PLATFORM_TOOL_MARKER, "cursor")` from `src/tools/translator.ts` |
| `testCriteria` | `npx vitest run test/evals` passes with the 16 exemptions; deleting one exempted artifact's file in a temp copy turns the "no exemption outlives its gap" block red (`coverage.test.ts:127-145`); a made-up case sourced at `packs/<id>/skills/<dir>/SKILL.md:6-6` passes the source admission and the recall label; rewording the translator's Cursor note turns the new case red |
| `edgeCases` | a pack directory with no `pack.json` → not enumerated; a fork's pack shipping an agent or a rule → enumerated like the core's |
| `depends_on` | u1-advisory-dispositions (one writer of `SET-v7.md` and `README.md`) |
| `verify` | `npx vitest run test/evals test/tools/translator.test.ts test/ci/testInputsGuard.test.ts` |

### u11-learnings — the learnings curated so the banner lists them all

| Field | Content |
|---|---|
| `id` | u11-learnings |
| `requirements` | REQ-FLOW-021, REQ-FLOW-088 |
| `files` | `.stamity/learnings/codex-hooks-default-on-and-codex-exec-ran-none.md` (retired), `.stamity/learnings/claude-code-refuses-sub-agent-report-file-names.md` (retired), `.stamity/learnings/a-new-test-file-runs-the-test-input-census-guard.md`, `.stamity/learnings/a-new-import-runs-the-architecture-test.md`, `.stamity/learnings/a-guard-change-runs-the-container-leg-tests.md` (all three retired into one), the new merged learning, the in-place summaries of `ledger-blocks-are-read-strictly.md`, `git-stash-is-shared-across-worktrees.md`, `plain-node-imports-of-src-need-erasable-syntax.md` and `surface-pins-are-literals-that-drift.md`, `test/docsPages.test.ts` (the comment at `:4429` only), `src/runs/layout.ts` (the comment at `:50` only) |
| `interfaces` | Inbox row `close/12`. Retire = delete the file in the commit. The merge = one `npx --no stamity learn capture --title "a narrow verify run misses whole-tree guards" --summary <≤160 chars> --confidence high --body-file <scratch>` whose body is a three-row table (change kind → the test its verify adds: a new or changed test → `test/ci/testInputsGuard.test.ts`; a new `src/` import → `test/architecture`; the shell guard or an emitted hook → `test/cloud`), each row with its measured run and ledger row from the retired files, then `reviewBy` and `validatedAgainst` added by hand (`test/learnings/repoLearnings.test.ts:58-64`); the integrity digest covers the body only (`src/learnings/validation.ts:503-513`), so summaries are shortened in place and bodies are never hand-edited. The two retired learnings' facts are carried by the product: Codex's hook measurement (`src/adapters/codex.ts:362-363`, `docs/troubleshooting.md:384-387`) and the report-name refusal (`src/runs/ledgerStore.ts:290`); the two comments citing them point at those places |
| `testCriteria` | `node .stamity/generated/hooks/claude/stamity-session-start.mjs < /dev/null` prints "Learnings: 18 loaded" and no "not listed" line; `npx vitest run test/learnings` passes (integrity, `reviewBy` after `date`, at least five files); the leak gate exits 0 |
| `edgeCases` | the capture refuses a taken slug → a new slug, never an overwrite |
| `depends_on` | none |
| `verify` | `npx vitest run test/learnings test/ci/leakGate.test.ts test/ci/recordsOnly.test.ts test/cli/commands/initApply.test.ts test/cli/commands/initPanel.test.ts test/ci/testInputsGuard.test.ts && node scripts/leak-gate.mjs` |

### u12-moved-prune — a moved skill's old copies are proven and removed on `sync`

| Field | Content |
|---|---|
| `id` | u12-moved-prune |
| `requirements` | REQ-PACK-008 |
| `files` | `src/pack/moved.ts` (new), `src/composition/root.ts`, `src/cli/engine/emissionWrite.ts` (`engineRenderingsFor` `:1003-1072`, beside `releaseOneElevenGuardsFor` `:1011-1018`), `src/cli/commands/sync/report.ts` (beside `pluginBlockDropLines` `:204-215`), `test/cli/engine/movedPrune.test.ts` (new; it holds the notice's cases too), `test/architecture/boundaries.test.ts` (`moved.ts`'s `PLAN_MAP` row, wave 1), `test/composition/root.test.ts` (the pinned pack-lane key list `:233-247` gains `"moved"`, with a `TEST CHANGE, justified` note) |
| `interfaces` | `src/pack/moved.ts`, a zero-import leaf (wave 1): `export interface MovedCoreSkill { readonly id: string; readonly pack: string; readonly since: string; readonly renderings: Readonly<Record<string, string>> }` (file inside the skill folder → its frozen SHA-256); `export const MOVED_CORE_SKILLS: readonly MovedCoreSkill[]` with `design-system-detect` (`SKILL.md` `797494d53ab3…`, `agents/openai.yaml` `91065c090283…`) and `browser-evidence` (`SKILL.md` `a4a40651590d…`, `agents/openai.yaml` `b448baafcaa2…`), the full 64-hex digests read from `git show v1.16.0:.claude/skills/st-<id>/<file> \| shasum -a 256` (byte-identical at v1.9.0 through v1.16.0), `pack: "frontend"`, `since: "1.17.0"`; `export function movedCoreSkill(id: string): MovedCoreSkill \| undefined`. `engineRenderingsFor` adds a moved skill's frozen digests at `.agents/skills/st-<id>/<file>` and `.claude/skills/st-<id>/<file>` when the candidate row's `artifactId` is a moved id and the running corpus no longer renders it, so the reclaim sweep's rendering proof (`src/merge/reclaim.ts:718-753`, CRLF folded by `matchesRendering`) deletes an unedited copy and keeps an edited one (gate 4, `:97-112`). `sync/report.ts`: `export function movedSkillLines(moved: readonly { id: string; pack: string; removed: string[]; kept: string[] }[]): string[]`, printed once when the pre-run ledger holds a moved id's corpus rows and no `pack:<pack>` owner: `moved: skill st-<id> left the core for the <pack> pack in <since>; its copies were removed (or: kept — edited since sync wrote them; delete by hand). To keep it: stamity add <pack>` |
| `testCriteria` | With a temp corpus root lacking the two skills and a ledger holding their 1.16.0 rows: unedited copies at both roots are deleted and named in the notice; a copy edited by one byte is kept, its row dropped, and named as kept; a CRLF copy of the frozen bytes is deleted; a path outside the two engine folder names gains no proof; the notice prints once (a second `sync` prints nothing); with `pack:frontend` rows present no notice prints |
| `edgeCases` | a forged ledger row naming a moved id at another path → no proof there (the table names two folders only); the pack installed in the same `sync` → its rows own the paths, nothing is a reclaim candidate |
| `depends_on` | none |
| `verify` | `npx vitest run test/cli/engine test/merge test/cli/commands/sync.test.ts test/composition test/architecture test/ci/testInputsGuard.test.ts && npm run typecheck` |
| `threat` | Boundary: `sync`'s whole-file deletes in the clients' skill folders. Trusts: the frozen digests and the ledger's `artifactId`. Abuse: a forged ledger row making `sync` delete a person's own file under a moved skill's name. Check: a delete still needs the bytes to hash to a frozen 1.16.0 rendering at exactly that engine path; a mismatch keeps the file (gate 4) |

### u13-frontend-move — the two UI skills leave the core for the `frontend` pack

| Field | Content |
|---|---|
| `id` | u13-frontend-move |
| `requirements` | REQ-PACK-007, REQ-PACK-008, REQ-PROVE-004 |
| `files` | `content/skills/st-design-system-detect/**` → `packs/frontend/skills/st-design-system-detect/**`, `content/skills/st-browser-evidence/**` → `packs/frontend/skills/st-browser-evidence/**` (`git mv`, then the `description` only), `packs/frontend/pack.json` (new), `src/pack/catalogPins.ts` (regenerated in this unit, the one lane exception to the derived-file rule), `src/emit/capabilityMatrix.ts` (`:337-345`), `test/adapters/codex.test.ts` (`:2446-2480`), `test/corpus/skills/flow.test.ts` (`:154-180`, `:283`), `test/corpus/skills/unattended.test.ts` (`:165-172`), `test/corpus/census.test.ts` (`:25`, `:70-84`), `test/emit/skillsProjection.test.ts` (`:52-61`, `:119`, `:1148`), `test/corpus/skills/verifyCore.test.ts` (`:291-300`), `test/corpus/skills/verifyRestTools.test.ts` (the two skills' blocks move to `test/packs/frontend.test.ts`, new), `test/packs/scaffold.test.ts` (`:562-585`, `:729-768`), `test/emit/upgradeFrom1140.e2e.test.ts` (`EXPECTED_RECLAIMS` `:93`, `:400-444`), `test/docsPages.test.ts` (the comment at `:936-955` only), `README.md` (`:112`, the corpus line's skill count, which a docs test derives from the catalog; `u18` writes the packs line after this unit), `test/corpus/frontmatterContract.test.ts` (`:451-452`, the core-skill floor 8 → 7) and `test/packs/ops.test.ts` (`:621`, the same floor), each with a `TEST CHANGE, justified` note, `evals/cases-v6/probes/probe-design-system-detect-select.md`, `evals/cases-v6/probes/probe-browser-evidence-select.md`, the 28 other probes whose listing holds both rows (all 30 probes list them), `evals/SET-v7.md` (the index rows `:3692`, `:3694` and one amendment line), `scripts/eval/instrument.mjs` (the "eight shipped skills" comment `:1080`) |
| `interfaces` | The moved bodies are byte-identical but for `description`, each 250 characters or fewer, third person, keeping its "Triggers when…" clause. `packs/frontend/pack.json`: `name` `frontend`; `version` = `package.json`'s; `description` "Interface work that reuses the design system a repo already has and captures browser evidence for the accessibility floor."; `declaredTools` all four; `permissions.toolFootprint` `["read", "edit", "execute"]`; `permissions.touchedPaths` `[".stamity/design-system-inventory.md", ".stamity/evidence/**"]`; `maxFootprintBytes` 262144; `integrity` and the pin written by `node scripts/generate-pack-manifests.mjs --write` then `node scripts/generate-pack-manifests.mjs` (the other packs' maps unchanged, their bytes unchanged), committed in this unit. The catalog picks it up with no code edit (`u2`). `capabilityMatrix.ts`: `codexSkillsListChars` 4,759, the comment "the 6 shipped skills and the 9 projected rules". Census and id lists lose the two ids (nine skills → seven; eight projected → six). The scaffold suite's cross-reference resolver reads the core and every pack (`:729-768`), and its comment at `:562-569` says the detector ships in `frontend`. `upgradeFrom1140.e2e.test.ts`: `EXPECTED_RECLAIMS` gains the eight paths (four under `.agents/skills/`, four under `.claude/skills/`), the test's "orphan" assertion (`:405-408`) unchanged. Probes: both select probes' `source:` becomes `packs/frontend/skills/<dir>/SKILL.md:6-6` and their quoted line re-copies; all 30 listings keep both rows, re-copied with the new descriptions; `SET-v7.md` records the re-source and that the listings describe a repository with `frontend` installed |
| `testCriteria` | `npx vitest run test/corpus test/emit/skillsProjection.test.ts test/adapters/codex.test.ts test/packs test/evals` passes; `codex.test.ts` measures 15 shown rows and 4,759 characters; `upgradeFrom1140.e2e.test.ts` proves the eight reclaims with `u12`'s table; `test/packs/frontend.test.ts` runs the moved suites against `packs/frontend/`; `node scripts/generate-pack-manifests.mjs --check` exits 0 after the integration lane's regeneration |
| `edgeCases` | an existing install that adds `frontend` in the upgrade `sync` → the pack owns the paths and writes the new bytes, no notice; the scaffold command still names the detector, now a pack skill (retired with scaffold in file 2) |
| `depends_on` | u2-pack-catalog, u6-frontmatter-passthrough, u10-eval-surface, u12-moved-prune, u14-core-readers (re-sequenced at the build: `u4` writes `test/adapters/codex.test.ts` after this unit, so the file keeps one writer) |
| `verify` | `npm run build && npx vitest run test/corpus test/emit/skillsProjection.test.ts test/emit/upgradeFrom1140.e2e.test.ts test/adapters/codex.test.ts test/packs test/pack test/evals test/ci/testInputsGuard.test.ts` |

### u14-core-readers — every core reader works where the `frontend` pack is absent

| Field | Content |
|---|---|
| `id` | u14-core-readers |
| `requirements` | REQ-PACK-007, REQ-FLOW-081 |
| `files` | `content/agents/stamity-design-quality.md` (`:45-49`), `content/rules/stamity-ui-states.md` (`:52-56`), `content/skills/st-verify/references/ui.md` (`:28-32`), `content/commands/st-work.md` (`:285-286`), `content/skills/st-qa/SKILL.md` (`:101-104`), `test/corpus/agents/specialists.test.ts` (`:467`), `test/corpus/rules/quality.test.ts` (`:404`), `test/corpus/commands/work.test.ts` (`:1649`), `test/corpus/skills/flow.test.ts` (`:880`, `:931`, only where the row's text moves), `evals/cases-v6/probes/probe-none-work-run-qa-checkpoint.md`, `evals/cases-v6/adversarial/benign-optional-step-skipped-proceeds.md`, `evals/cases-v6/golden/ui-error-state-announces-recovery.md` (it quotes item 5 of the UI-states rule) |
| `interfaces` | Each reader keeps its line count. Design-quality: "The token source the design-system inventory names is the authority where one exists (the detector ships in the `frontend` pack); with no inventory, the token source is read from the stylesheet layer and the inventory's absence is said." UI states: "Where no inventory exists or it reports no token source, …". `ui.md`: "…named by the design-system inventory, or, where none exists, the token source found in the stylesheet layer, recorded as found without the inventory". `/st-work` step 3: "When the change has a user-facing surface and the browser-evidence skill is installed, offer a run; captured screenshots and console output attach to the proof block." in its two lines (`st-qa` has one spare line, inbox row 271). `st-qa`: "…the browser run happens before this table is built where the browser-evidence skill is installed. A UI row with no bundle stays on the human path." |
| `testCriteria` | Each pin re-points to the reworded sentence; `/st-work` stays at 485 lines and 871 characters before the cut; `st-qa` stays at 149 lines or fewer; the three cases' quotes re-copied, `npx vitest run test/evals` green |
| `edgeCases` | a repository with `frontend` installed → every reader behaves as today |
| `depends_on` | u8-work-lessons (one writer of `st-work.md` and `work.test.ts`) |
| `verify` | `npx vitest run test/corpus test/evals test/ci/testInputsGuard.test.ts` |

### u15-moved-customizations — overrides and overlays of a moved skill say what moved

| Field | Content |
|---|---|
| `id` | u15-moved-customizations |
| `requirements` | REQ-PACK-009, REQ-OVERLAY-009, REQ-PLUGIN-016 |
| `files` | `src/content/catalog.ts` (`refuseOrphanOverlay` `:1494-1502`, `refusePackSkillOverlay` `:1555-1570`), `src/emit/planner.ts` (`:648-672`, and a planning warning), `src/cli/commands/check.ts` (a `moved-skills` row after `pack-catalog`), `docs/customization.md` (`:240`, `:264`, `:306-309`, `:397`), `docs/troubleshooting.md` (the doctor sample's `moved-skills` line and the doctor table's `moved-skills` row, after `u3`'s; pinned by `test/cli/commands/check.test.ts:2806` and `test/docsPages.test.ts:4733`), `test/content/catalog.test.ts`, `test/emit/plannerOverlay.test.ts`, `test/cli/commands/check.test.ts` |
| `interfaces` | When the id is in `MOVED_CORE_SKILLS` (`src/pack/moved.ts`): an overlay with the pack absent refuses `skill "<id>" moved from the core to the <pack> pack in <since>, and overlays on pack skills are not applied. Fold your change into a full override under another id, or remove <path>; to keep the shipped skill, stamity add <pack>.` (`VALIDATION_ERROR`, the fail-closed posture kept); the same text with the pack installed; a full override with the pack absent passes and pushes `warning: your override <path> replaced a core skill that moved to the <pack> pack; it now stands alone and tracks no shipped copy. Keep it, or remove it and stamity add <pack>.` onto `plan.warnings`; with the pack installed, the planner's refusal names the move. `check`: `moved-skills`, read from `.stamity/overrides/skills/<id>/` and the manifest's ledger directly (it answers when the plan throws): `pass`; `warn` for a full override of a moved id or a corpus ledger row of a moved id still present; `fail` for an overlay of a moved id |
| `testCriteria` | Each of the four cases (overlay or full override × pack absent or installed) prints its text; `validate` carries the overlay text unchanged; the row's three states; the row-order array gains `"moved-skills"` with a `TEST CHANGE, justified` note |
| `edgeCases` | an overlay of a skill that was never in the core → today's "typo" text, unchanged |
| `depends_on` | u3-retired-names, u5-same-class-names, u12-moved-prune, u13-frontend-move |
| `verify` | `npx vitest run test/content test/emit/plannerOverlay.test.ts test/cli/commands/check.test.ts test/cli/commands/validate.test.ts test/architecture test/ci/testInputsGuard.test.ts && npm run typecheck` |

### u16-frontend-suggestion — `init` suggests `frontend` in a front-end repository

| Field | Content |
|---|---|
| `id` | u16-frontend-suggestion |
| `requirements` | REQ-PACK-010 |
| `files` | `src/detect/stackSupport.ts` (`STACK_PACK_CATALOG` `:60-69`, `suggestStackPacks` `:343-357`), `src/cli/commands/init.ts` (`:1296`), `src/cli/commands/init/panel.ts` (`stackSuggestionLines` `:862-883`), `test/detect/stackSupport.test.ts` (`:257-279`), `test/cli/commands/initPanel.test.ts` (`:968-984`), `test/cli/commands/init.test.ts` (`:547-555`, the Next.js case now expects the `frontend` install line once, with a `TEST CHANGE, justified` note) |
| `interfaces` | `export const STACK_PACK_CATALOG: ReadonlyMap<string, string>` mapping the twelve front-end subjects (Next.js, React, Vue, Svelte, SvelteKit, Nuxt, Angular, Astro, Remix, SolidStart, TanStack Start, Qwik) to `frontend`; `export function resolvableStackPacks(map: ReadonlyMap<string, string>, lookup: (id: string) => unknown, installed: ReadonlySet<string>): ReadonlyMap<string, string>` (wave 3, the lookup passed in) keeps only ids the catalog resolves and none already installed; `init.ts` passes `resolvableStackPacks(STACK_PACK_CATALOG, lookupCatalogEntry, <ledger pack ids>)`; the panel prints one install line per pack id, on its first row, `: npx … add frontend` |
| `testCriteria` | A Next.js repository prints `next (framework) — Install the frontend pack: npx … add frontend` once; Next.js plus React prints the install line once; a repository with `frontend` installed prints none; a backend repository prints no pack line; both pins carry a `TEST CHANGE, justified` note |
| `edgeCases` | a fork whose packs folder lacks `frontend` → the row is filtered out and the subject's guidance note stays |
| `depends_on` | u13-frontend-move |
| `verify` | `npx vitest run test/detect test/cli/commands/initPanel.test.ts test/cli/commands/init.test.ts test/architecture test/ci/testInputsGuard.test.ts` |

### u17-pack-suite — one generic suite for every pack, and the pack lint

| Field | Content |
|---|---|
| `id` | u17-pack-suite |
| `requirements` | REQ-PACK-011, REQ-PACK-012 |
| `files` | `test/packs/packs.test.ts` (new), `test/packs/lint.test.ts` (new), `test/support/packFixtures.ts`, `test/pack/packEngineDefects.test.ts` (its local `writePack`, `artifact`, `prose` move to the shared helper) |
| `interfaces` | `test/support/packFixtures.ts` gains `export async function writeMadeUpPack(dir: string, name: string, files: Record<string, string>): Promise<string>` (writes the files and a `pack.json` with `name`, `version`, `integrity`) plus `madeUpArtifact(id, type, description)` and `prose(length, seed)`, used by both suites. `packs.test.ts`: `PACK_IDS` from `readdirSync("packs")` (directories holding `pack.json`) equal to `curatedPacks()`'s ids; per pack, static: `readPackManifest` valid, `name` = directory, `version` = `package.json`'s, `verifyIntegrityMap` both ways and each digest recomputed, the installer's ingress gates, the frontmatter contract (including the two pass-through keys as booleans), first-party classes within commands and skills (the three retiring packs exempt while their directories exist), names unique across the core and every pack in every class, no pack id retired (`lookupRetiredPack`), cross-references resolving against the core and every pack, no `floor:` tag, the leak gate's reserved names; dynamic, in-process: `add <id> -y` by catalog id, `sync`, `check`, each exit 0, on `["claude"]`, `["cursor"]`, `["codex"]`, `["copilot"]` and all four, each shipped skill present in the client's skills folder, and on Codex the shown list recomputed at 8,000 or under; one case adding every pack to the all-four set. `lint.test.ts`, over every pack file and a made-up pack: no `/\$\{STAMITY:/`; no `npx … stamity`, `@zomarit/stamity`, a fenced or table-cell line starting `stamity `, or `stamity <verb>` for a verb in `COMMANDS` (`src/cli.ts:65-81`), `.stamity/` paths and `stamity-<id>` names allowed; a skill declaring `disable-model-invocation: true` ships `agents/openai.yaml` with `policy.allow_implicit_invocation: false`, and the reverse; every pack skill's `description` at 250 characters or fewer, `ops` and `product-audit` exempt by name while their directories exist (the exemption goes red once a directory is gone) |
| `testCriteria` | Each probe has a made-up-pack fixture that makes it fail; the suite runs over `frontend`, `ops`, `product-audit` and `scaffold`; `packEngineDefects.test.ts` passes on the shared helper; the in-process suite runs in under 60 s on the darwin host |
| `edgeCases` | a pack directory added by a fork → enumerated with no edit; the checkout's `packs/` is never written (installSmoke digests it) |
| `depends_on` | u3-retired-names, u4-pack-fit, u5-same-class-names, u6-frontmatter-passthrough, u13-frontend-move |
| `verify` | `npm run build && npx vitest run test/packs test/pack test/ci/testInputsGuard.test.ts` |

### u18-spec-docs — the packs spec, the delta merged, the board pin, the change log

| Field | Content |
|---|---|
| `id` | u18-spec-docs |
| `requirements` | REQ-PACK-001, REQ-PACK-002, REQ-PACK-003, REQ-PACK-004, REQ-PACK-005, REQ-PACK-006, REQ-PACK-007, REQ-PACK-008, REQ-PACK-009, REQ-PACK-010, REQ-PACK-011, REQ-PACK-012, REQ-PACK-013, REQ-PACK-014, REQ-FLOW-019, REQ-FLOW-081, REQ-FLOW-094, REQ-FLOW-125, REQ-FLOW-126, REQ-FLOW-127, REQ-FLOW-128, REQ-CTX-017, REQ-OVERLAY-009, REQ-BOARD-004, REQ-PLUGIN-016, REQ-PROVE-002, REQ-PROVE-004, REQ-PROVE-033 |
| `files` | the packs spec (`packs.md` in `docs/specs/`, new, `status: design`), `docs/specs/everyday-flows.md`, `docs/specs/orchestrator-context.md`, `docs/specs/overlay-layers.md` (the table of REQ-OVERLAY-009, `:495-515`), `docs/specs/prove-behavior-and-value.md`, `docs/troubleshooting.md` (the two new `check` rows), `docs/specs/board-writes.md` (`:209-210`, `:441-442`), `docs/specs/enterprise-upstream-lane.md` (`:77`, the locator of the derived catalog), `test/corpus/commands/board.test.ts` (the comment at `:336-337` only), `CHANGELOG.md`, `README.md` (`:112-113`), `CONTRIBUTING.md` (`:157-159`, the logic cap now 2.5 MiB, review row `review/1`; `:239`, `:249`, the generator's `--write` also sets `version`), `docs/packs-and-trust.md` (`:548-554`, the same `--write` sentence; `:97`, four first-party packs, `build/22`), `.github/release-controls-checklist.md` (`:180`, the eval line names `packs/**` beside `content/**`, from `u10`'s `build/10`), `evals/SET-v7.md` (one paragraph naming every case whose Brief moved in `u7`, `u8`, `u13` and `u14`, `ui-error-state-announces-recovery` among them), `test/authoring/specStatusRules.test.ts` only if a new spec needs a row |
| `interfaces` | The packs spec's head mirrors `docs/specs/board-writes.md:1-8` (`id: packs`, the records note, `status: design`, `obsolete_when`), its area code `PACK`, each requirement from this file's delta with its proof (the test that names it). The six existing specs take their MODIFIED and ADDED entries verbatim from this file's delta, each dated with the run id. `CHANGELOG.md`: an `## Unreleased` section in the file's convention (`:8-29`): Added (the derived catalog, the fit and name checks, the two `check` rows, the pass-through keys, the blast-radius section, the three habits, credited to the public agent harness they came from, the text written fresh), Changed (rule-skills hidden from `/` where a client allows; core readers' fallbacks), Moved (`st-design-system-detect` and `st-browser-evidence` into `frontend`, with an "Upgrading from 1.16.0" block: `stamity add frontend` keeps them; an overlay of either is refused with the reason; an override that authored either pass-through key now passes it through). `README.md`: the core's skill count (nine → seven) and the packs line listing four packs |
| `testCriteria` | `npx vitest run test/authoring test/docsPages.test.ts test/corpus/commands/board.test.ts` passes; the packs spec reads `status: design`; every requirement id in this file's delta appears in exactly one spec; `CHANGELOG.md`'s new section passes the change-log tests |
| `edgeCases` | a requirement's proof test not yet written → named as the unit that writes it, never left blank |
| `depends_on` | u0-logic-budget, u1-advisory-dispositions, u2-pack-catalog, u3-retired-names, u4-pack-fit, u5-same-class-names, u6-frontmatter-passthrough, u7-unattended-rows, u8-work-lessons, u9-blast-radius-body, u10-eval-surface, u11-learnings, u12-moved-prune, u13-frontend-move, u14-core-readers, u15-moved-customizations, u16-frontend-suggestion, u17-pack-suite |
| `verify` | `npx vitest run test/authoring test/docsPages.test.ts test/corpus test/ci/changelogLinks.test.ts test/ci/docsRoster.test.ts test/ci/leakGate.test.ts test/ci/testInputsGuard.test.ts` |

## Inbox rows this file matched

`stamity ledger inbox --plan docs/plans/018-packs-rebuilt-01.md --paths <this file's paths>` on 2026-10-20: 237 rows,
70 matched, 167 unmatched, none unparsed or skipped. Folded: rows 275 (`2026-10-15_cloud-runs/build/55`) and 276
(`pr/43`) → `u7`; row 309 (`2026-10-18_cloud-runs-2/build/80`) → the verify rule above and the close's coverage row;
row 312 (`build/70`) → `u10`; row 387 (`close/12`) → `u11`; row 210 (`readmeCurrency`'s count past ten) → `u1`; row 271
(`st-qa`'s spare line) → `u14`. Left, each with its reason: rows 150, 151 and 194 (typed counts in `SET-v7.md` with
no derivation) — `u1` moves the counts it must; a derivation test is a change of its own and stays on its trigger;
rows 152 and 253 (`locators.test.ts`'s block ending at an inner fence) — `u10` widens the heading only; rows 153, 154
and 375 (case-content rows) — outside the dispositions; rows 155, 156, 157 and 198 (spec and `/st-work` citations) —
`u8` and `u18` edit other lines; rows 182 to 184 and 237 (`check` and `verifyInstalled` wording) — `u3` and `u15` add
rows and touch no existing one; rows 187, 188 and 239 (`init` without git) — `u16` edits the suggestion only; row 193
(`CHANGELOG.md:723`) — `u18` adds a section and edits no old one; rows 69 (`validate` runs no cross-class check) and 72
(the lead of REQ-OVERLAY-009) — outside `u5` and `u15`'s edits; every row whose `when:` names Package 20, a release or a
measurement — its own trigger.

## Execution order

1. `u0` on the integration branch `feat/packs-rebuilt-01` first (the build budget every lane builds under).
2. Wave 1, lanes at once, files disjoint: `u1`, `u2`, `u5`, `u6`, `u9`, `u11`, `u12`.
3. Wave 2: `u3` (after `u2`); `u7`, `u8` and `u10` (after `u1`).
4. Wave 3: `u4` (after `u3`); `u14` (after `u8`).
5. Wave 4: `u13` (after `u2`, `u6`, `u10`, `u12` and `u14`; re-sequenced at the build so `u4` follows it).
6. Wave 5: `u15`, `u16` and `u17` (after `u13`, with their other edges).
7. Wave 6: `u18`.
8. After each wave, the integration lane cherry-picks the wave's lanes onto the integration branch (a conflict is
   aborted and replayed by a fixer), then regenerates the derived files — `npm run build && node dist/cli.js sync`,
   `node scripts/generate-pack-manifests.mjs`, `node scripts/generate-docs.mjs`, the golden snapshots with `npx vitest run
   test/emit/crossClientGoldens.test.ts test/corpus/emissionGoldens.test.ts -u` (files first, the flag last) — reads
   each diff, commits, and runs the full suite alone under the machine lock before the next wave forks.
9. Then the gates by exit code (lint, typecheck, knip, `npm run check`, `node dist/cli.js check`, the leak gate, the
   hygiene check), per-unit review on each lane (the security lens on `u12`), the whole-branch review, CI on the pull
   request, both Windows legs read to the end.
10. **The close's coverage row**, from a checkout where the records are restored (`node scripts/records.mjs restore`):
    `node content/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/018-packs-rebuilt-01.md docs/specs` and
    `npm run test:records`, each read by its exit code.

## QA walk

No person row: every behaviour is proven by a committed test. The maintainer's look at a Claude Code `/` menu in a
scratch repository (16 entries) is offered at the package's close in file 2, where the menu takes its final shape.

## Risks

- **Warning** — the moved skills' descriptions change their trigger text, and the probes measuring selection run only
  at the release eval. Mitigation: each new description keeps the old "Triggers when…" clause's terms; the release run
  at Package 20's cut measures both select probes and their 28 listings.
- **Warning** — the Briefs of 15 cases move (six unattended floor cases among them), so the next eval run re-measures
  them. Mitigation: the incremental rule re-measures exactly those; the release run is already full.
- **Warning** — a merge touching `src/pack/**` is proven by the pack-signing rehearsal only on the push to `main`.
  Mitigation: the merge's push runs are read to the end before the package closes.
- **Minor** — the old `ops` and `product-audit` skills stay over the description cap until file 2 deletes them; their
  exemption expires with their directories.
- **Minor** — Cursor's `/` menu and Codex's `$` list keep showing rule-skills; the hide works where the client honours
  the key, and the docs say so per client.

## Open questions

None.

## Follow-ups (appended to `.stamity/inbox.md` when this plan lands)

- Minor · content/commands/st-plan.md:356 · a unit's verify cell that names a records path fails in a lane worktree
  (exit 2); state the rule in the command's unit table · source: /st-plan · Ref: docs/plans/018-packs-rebuilt-01.md ·
  when: Package 21 plans its work, or touched
- Minor · — · run 47's four other § 8 repeats (`agent-design-quality-return-contract:A2`,
  `ask-next-step-derived-from-run-state:A1`, `plan-security-unit-carries-threat-note:A1` (A2 when run 47 recorded it),
  `work-security-lens-auth-path-change:A1`) are not disposed · source: /st-plan · Ref: docs/plans/018-packs-rebuilt-01.md
  · when: the next eval run's § 8, or Package 22 file 2 plans its work · files: evals/cases-v6/

## Drop list

| Item | Revisit when |
|---|---|
| Hiding `st-unattended` from `/` menus (`user-invocable: false`) | a person reports picking it from a menu, or its head is next edited for another reason |
| The session-start overflow line naming `stamity learn read` | the learnings pass 20 again after this curation |
| A case key naming a blockquote's `src/` source in general | a second case quotes rendered `src/` text |
| A `sync` notice for an installed retired pack | the `pack-catalog` row proves too quiet in a reported upgrade |
| A cap on pack command descriptions | a pack command reaches Codex's shown list |
